"""CPU-only grid recovery. Coordinates are in source-pixel boundary units.

The detector finds periodic edge energy (not the image's colour frequency),
then fits phase and optionally a small smooth drift. Sampling is always done
once per logical cell. Output scaling never participates in the reconstruction.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps
from scipy.ndimage import gaussian_filter1d, binary_propagation
from scipy.optimize import minimize_scalar
from scipy.signal import find_peaks
from scipy.spatial import cKDTree
from scipy.linalg import solve_banded
from .palettes import EXTRA_PALETTES, parse_palette
from .refine import checker_background, hud_evidence, fallback_size, area_sample

MAX_INPUT_PIXELS = 20_000_000
MAX_OUTPUT_PIXELS = 32_000_000


@dataclass
class Options:
    cell: float | None = None
    cell_y: float | None = None
    offset_x: float | None = None
    offset_y: float | None = None
    colors: int | None = None
    transparent: bool = False
    cleanup: bool = False
    scale: int = 8
    palette: str = "auto"
    drift: bool = True
    target_size: int | None = None
    fit: int | None = None
    custom_palette: str | None = None
    dither: bool = False
    edge_cleanup: str = "smart"

    def validate(self):
        if self.edge_cleanup not in ("off", "smart", "strong"):
            raise ValueError("edge_cleanup must be off, smart or strong.")
        if self.scale is None:
            raise ValueError('scale must be an integer.')
        if not isinstance(self.palette, str):
            raise ValueError('palette must be a string.')
        if self.custom_palette is not None and not isinstance(self.custom_palette, str):
            raise ValueError('custom_palette must be a string.')
        for name in ('colors', 'scale', 'target_size', 'fit'):
            value = getattr(self, name)
            if value is not None and (isinstance(value, bool) or not isinstance(value, int)):
                raise ValueError(f'{name} must be an integer.')
        for name in ('transparent', 'cleanup', 'drift', 'dither'):
            if not isinstance(getattr(self, name), bool):
                raise ValueError(f'{name} must be a boolean.')
        for name in ('cell', 'cell_y', 'offset_x', 'offset_y'):
            value = getattr(self, name)
            if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))):
                raise ValueError(f'{name} must be a number.')
        for v in (self.cell, self.cell_y):
            if v is not None and (not math.isfinite(v) or not 1 <= v <= 128):
                raise ValueError("Cell size must be between 1 and 128 pixels.")
        for v in (self.offset_x, self.offset_y):
            if v is not None and (not math.isfinite(v) or abs(v) > 128):
                raise ValueError("Offsets must be finite and between -128 and 128.")
        if self.colors is not None and not 2 <= self.colors <= 256:
            raise ValueError("Max colours must be between 2 and 256.")
        if not 1 <= self.scale <= 32:
            raise ValueError("Scale must be between 1 and 32.")
        if self.palette not in ("auto", "custom", "pico8", "gameboy", *EXTRA_PALETTES):
            raise ValueError("Unknown palette.")
        if self.target_size not in (None, 16, 24, 32, 48, 64, 96, 128):
            raise ValueError("Choose a target size of 16, 24, 32, 48, 64, 96 or 128.")
        if self.fit not in (None, 512, 1024):
            raise ValueError("Fit size must be 512 or 1024.")
        if self.palette == "custom":
            parse_palette(self.custom_palette or "")


@dataclass
class AxisGrid:
    cell: float
    offset: float
    confidence: float
    method: str = "spectral"


@dataclass
class Grid:
    x: AxisGrid
    y: AxisGrid


@dataclass
class Result:
    native: Image.Image
    upscaled: Image.Image | None
    comparison: Image.Image | None
    metadata: dict


def rgb_to_oklab(rgb):
    c = np.asarray(rgb, dtype=np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[.4122214708, .5363325363, .0514459929],
                  [.2119034982, .6806995451, .1073969566],
                  [.0883024619, .2817188376, .6299787005]])
    v = np.cbrt(c @ m.T)
    return v @ np.array([[.2104542553, .793617785, -.0040720468],
                         [1.9779984951, -2.428592205, .4505937099],
                         [.0259040371, .7827717662, -.808675766]]).T


def oklab_to_rgb(lab):
    v = np.asarray(lab) @ np.array([[1, .3963377774, .2158037573],
                                   [1, -.1055613458, -.0638541728],
                                   [1, -.0894841775, -1.291485548]]).T
    c = (v ** 3) @ np.array([[4.0767416621, -3.3077115913, .2309699292],
                             [-1.2684380046, 2.6097574011, -.3413193965],
                             [-.0041960863, -.7034186147, 1.707614701]]).T
    c = np.clip(c, 0, 1)
    c = np.where(c <= .0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - .055)
    return np.uint8(np.clip(np.round(c * 255), 0, 255))


class InputTooLarge(ValueError):
    code = 'input_too_large'


def load_image(source):
    import io
    owned = not isinstance(source, Image.Image)
    if isinstance(source, (bytes, bytearray)):
        source = io.BytesIO(source)
    im = None
    try:
        im = Image.open(source) if owned else source
        if im.width * im.height > MAX_INPUT_PIXELS or max(im.size) > 8192:
            raise InputTooLarge("Use an image under 20 megapixels and 8192 pixels per side.")
        if min(im.size) < 4:
            raise ValueError("Image must be at least 4 pixels wide and tall.")
        # Pillow exposes 16-bit PNG as I;16 (older versions use I). Treat I as
        # unsigned 16-bit data, and F as normalized [0,1]; reject other ranges.
        if im.mode.startswith('I;16') or im.mode in ('I', 'F'):
            a = np.asarray(ImageOps.exif_transpose(im))
            ceiling = 1. if im.mode == 'F' else 65535.
            if not np.isfinite(a).all() or a.min() < 0 or a.max() > ceiling:
                raise ValueError(f'Unsupported {im.mode} range; expected 0..{ceiling:g}.')
            return Image.fromarray(np.rint(a.astype(np.float64) * (255 / ceiling)).astype(np.uint8)).convert('RGBA')
        if not owned and im.mode == 'RGBA' and not im.getexif().get(274):
            return im  # callers never mutate the normalized source
        return (ImageOps.exif_transpose(im) if im.getexif().get(274) else im).convert('RGBA')
    except Image.DecompressionBombError as exc:
        raise InputTooLarge('Image dimensions exceed the safe input limit.') from exc
    finally:
        if owned and im is not None:
            im.close()


def edge_profiles(rgba):
    # Premultiplication makes invisible RGB irrelevant; alpha edges still count.
    profiles = []
    for axis in (1, 0):
        # Subsample only the perpendicular direction to bound work, preserving
        # the original coordinate system along the axis being measured.
        sub = rgba[::max(1, rgba.shape[0] // 256)] if axis == 1 else rgba[:, ::max(1, rgba.shape[1] // 256)]
        alpha = sub[..., 3:4].astype(np.float32) / 255
        d = np.concatenate([sub[..., :3].astype(np.float32) * alpha, alpha * 160], axis=2)
        g = np.sqrt(np.mean(np.diff(d, axis=axis) ** 2, axis=2))
        profiles.append(np.mean(g, axis=1 - axis))
    return profiles


def curvature_profiles(rgba):
    profiles = []
    for axis in (1, 0):
        sub = rgba[::max(1, rgba.shape[0] // 256)] if axis == 1 else rgba[:, ::max(1, rgba.shape[1] // 256)]
        alpha = sub[..., 3:4].astype(np.float32) / 255
        d = np.concatenate([sub[..., :3].astype(np.float32) * alpha, alpha * 160], axis=2)
        d = gaussian_filter1d(d, .8, axis=axis)
        g = np.sqrt(np.mean(np.diff(d, n=2, axis=axis) ** 2, axis=2))
        profiles.append(np.mean(g, axis=1-axis))
    return profiles


def _coefficient(profile, cell):
    x = np.arange(1, len(profile) + 1)
    return np.sum(profile * np.exp(-2j * np.pi * x / cell))


def _phase(profile, cell):
    z = _coefficient(profile, cell)
    phase = (-np.angle(z) * cell / (2 * np.pi)) % cell
    if phase > cell / 2:
        phase -= cell
    if abs(phase) < .10:
        phase = 0.0
    return float(phase)


def _axis_candidates(profile):
    p = np.asarray(profile, dtype=float)
    n = len(p)
    if n < 12 or p.max(initial=0) < .05:
        return [], p
    # Subtract broad composition changes without erasing 2..64 px oscillation.
    p = p - gaussian_filter1d(p, 32, mode="reflect")
    p = p * np.hanning(n)
    fft_n = 2 ** int(np.ceil(np.log2(n * 16)))
    f = np.fft.rfftfreq(fft_n)
    a = np.abs(np.fft.rfft(p, n=fft_n))
    valid = (f >= 1 / min(64, n / 4)) & (f <= .5)
    ids, _ = find_peaks(np.where(valid, a, 0))
    if valid[-1] and a[-1] > a[-2]:
        ids = np.r_[ids, len(a) - 1]
    ids = sorted(ids, key=lambda i: a[i], reverse=True)[:24]
    candidates = []
    denom = max(np.sum(np.abs(p)), 1e-9)
    for i in ids:
        c = 1 / f[i]
        half = max(.003, c * c / n / 5)
        opt = minimize_scalar(lambda s: -abs(_coefficient(p, s)),
                              bounds=(max(2, c - half), min(64, c + half)), method="bounded")
        c = float(opt.x)
        strength = float(abs(_coefficient(p, c)) / denom)
        candidates.append((c, strength))
    return sorted(candidates, key=lambda t: t[1], reverse=True), p


def detect_grid(image, cell=None, cell_y=None, offset_x=None, offset_y=None, *, profiles=None, _rgba=None):
    Options(cell=cell, cell_y=cell_y, offset_x=offset_x, offset_y=offset_y).validate()
    if cell is not None and offset_x is not None and offset_y is not None:
        return Grid(AxisGrid(float(cell), float(offset_x), 1., 'manual'),
                    AxisGrid(float(cell_y if cell_y is not None else cell), float(offset_y), 1., 'manual'))
    rgba = np.asarray(load_image(image)) if _rgba is None else _rgba
    profiles = profiles if profiles is not None else edge_profiles(rgba)
    curves = curvature_profiles(rgba)
    estimates = []
    all_candidates = []
    axis_data = []
    for p, curve, length, override, offset in zip(profiles, curves, (rgba.shape[1], rgba.shape[0]),
                                          (cell, cell_y if cell_y is not None else cell),
                                          (offset_x, offset_y)):
        candidates, high = _axis_candidates(p)
        curve_candidates, curve_high = _axis_candidates(curve)
        # Bilinear enlargement has nearly constant first derivatives between
        # native centres. Second derivatives reveal those centres directly.
        use_curve = bool(curve_candidates and (not candidates or curve_candidates[0][1] > candidates[0][1] * .80))
        if use_curve:
            candidates = curve_candidates
        all_candidates.append(candidates)
        axis_data.append((high, curve_high))
        if override is not None:
            size, strength, method = float(override), 1.0, "manual"
        elif candidates and candidates[0][1] >= .09:
            size, strength = candidates[0]
            method = "spectral"
            # Integer NN replication has many strong harmonics. Prefer the
            # largest near-equally supported fundamental, never a weak multiple.
            for c, s in candidates:
                ratio = c / size
                if 1.8 < ratio < 8.2 and abs(ratio - round(ratio)) < .045 and s >= strength * .91:
                    size, strength = c, s
        else:
            size, strength, method = max(2., length / 96), 0., "fallback"
        # Preserve a clean native image rather than forcing it into a 2px grid.
        if override is None and length <= 128 and not (candidates and candidates[0][1] > .22):
            size, strength, method = 1., 0.5, "native"
        phase = _phase(high, size) if method in ("spectral", "manual") and size > 1 else 0.
        gradient_strength = abs(_coefficient(high, size)) / max(np.sum(np.abs(high)), 1e-9)
        if use_curve and size > 1 and gradient_strength < .12:
            phase = (_phase(curve_high, size) + .5 - size / 2) % size
            if phase > size / 2:
                phase -= size
            method = "bilinear" if override is None else "manual"
        if abs(phase) < .10:
            phase = 0.
        if offset is not None:
            phase = float(offset)
        confidence = min(1., max(0., (strength - .06) / .35)) if method in ("spectral", "bilinear") else strength
        estimates.append(AxisGrid(round(size, 4), round(phase, 4), round(confidence, 3), method))
    independent_strong = []
    for axis, candidates in zip(estimates, all_candidates):
        supported = min(candidates, key=lambda pair: abs(pair[0] - axis.cell))[1] if candidates else 0
        rivals = [s for c, s in candidates if abs(c - axis.cell) / axis.cell > .045
                  and abs(max(c, axis.cell) / min(c, axis.cell) - round(max(c, axis.cell) / min(c, axis.cell))) > .045]
        independent_strong.append(axis.confidence >= .5 and supported > max(rivals, default=0) * 1.35)
    if cell is None and cell_y is None and not all(independent_strong):
        # Shared evidence is much stronger than a row-only repeating feature.
        # Search nearby pitches rather than forcibly assuming square pixels.
        pairs = [(math.sqrt(sx * sy), cx, cy, sx, sy)
                 for cx, sx in all_candidates[0] for cy, sy in all_candidates[1]
                 if abs(cx - cy) / max(cx, cy) < .045 and min(sx, sy) > .13]
        if pairs:
            score, cx, cy, sx, sy = max(pairs)
            independent = math.sqrt(all_candidates[0][0][1] * all_candidates[1][0][1])
            if score > independent * .62:
                for i, (size, strength, offset) in enumerate(((cx, sx, offset_x), (cy, sy, offset_y))):
                    if independent_strong[i]:
                        continue
                    high, curve_high = axis_data[i]
                    gs = abs(_coefficient(high, size)) / max(np.sum(np.abs(high)), 1e-9)
                    phase = _phase(high, size)
                    method = "spectral"
                    if gs < .12:
                        phase = (_phase(curve_high, size) + .5 - size / 2) % size
                        if phase > size / 2:
                            phase -= size
                        method = "bilinear"
                    if abs(phase) < .10:
                        phase = 0.
                    if offset is not None:
                        phase = float(offset)
                    estimates[i] = AxisGrid(round(size, 4), round(phase, 4), round(min(1., (strength-.06)/.35), 3), method)
    # A weak axis can borrow a well-supported pitch from the other axis, but
    # genuinely non-square grids retain independent estimates.
    for i in (0, 1):
        a, b = estimates[i], estimates[1 - i]
        override = cell if i == 0 else (cell_y if cell_y is not None else cell)
        if override is None and a.method == "fallback" and b.confidence > .35:
            a.cell, a.offset, a.method = b.cell, _phase(profiles[i] - gaussian_filter1d(profiles[i], 32), b.cell), "borrowed"
    for i, axis in enumerate(estimates):
        override = cell if i == 0 else (cell_y if cell_y is not None else cell)
        if override is None and axis.method in ("spectral", "bilinear", "borrowed"):
            p = curves[i]
            high = (p - gaussian_filter1d(p.astype(float), 32)) * np.hanning(len(p))
            coherence = abs(_coefficient(high, axis.cell)) / max(np.sum(p * np.hanning(len(p))), 1e-9)
            edge_high = axis_data[i][0]
            edge_coherence = abs(_coefficient(edge_high, axis.cell)) / max(np.sum(profiles[i] * np.hanning(len(profiles[i]))), 1e-9)
            evidence = max(coherence, edge_coherence)
            axis.confidence = round(min(axis.confidence, max(0., (evidence - .04) / .25)), 3)
            if evidence < .085:
                axis.cell = round(max(2., max(rgba.shape[:2]) / 96), 4)
                axis.offset = float((offset_x, offset_y)[i] or 0)
                axis.confidence, axis.method = 0., "fallback"
    if cell is None and cell_y is None and any(a.method == 'fallback' for a in estimates):
        # Resolve weak evidence at image level so fallback retains aspect ratio.
        if not any(a.method in ('spectral', 'bilinear') and a.confidence > .35 for a in estimates):
            size = round(max(2., max(rgba.shape[:2]) / 96), 4)
            estimates = [AxisGrid(size, float(o or 0), 0., 'fallback') for o in (offset_x, offset_y)]
    if cell is None and cell_y is None:
        if all(a.method == 'fallback' for a in estimates):
            size = max(2., max(rgba.shape[:2]) / fallback_size(rgba))
            estimates = [AxisGrid(size, float(o or 0), 0., 'fallback') for o in (offset_x, offset_y)]
        elif hud_evidence(rgba, estimates[0].cell, estimates[1].cell):
            estimates = [AxisGrid(a.cell / 2, float(o or 0), a.confidence, 'regional') for a, o in zip(estimates, (offset_x, offset_y))]
    from .grid_safety import coarse_sprite_grid
    if coarse_sprite_grid(rgba, estimates, (cell, cell_y)):
        # Keep detail when body/limb spacing would collapse a small cut-out.
        # This is explicitly an approximation, not a recovered 2px grid.
        estimates = [AxisGrid(2., float(o or 0), 0., 'fallback') for o in (offset_x, offset_y)]
    return Grid(*estimates)


def _centers(length, axis, profile, drift):
    size, phase = axis.cell, axis.offset
    # Partial cells are kept only when their centre falls inside the source.
    first = math.ceil((-phase) / size - .5)
    last = math.floor((length - phase) / size - .5 - 1e-7)
    centers = phase + (np.arange(first, last + 1) + .5) * size
    if not len(centers):
        centers = np.array([length / 2.])
    drift_applied = False
    if drift and axis.method == "spectral" and axis.confidence > .18 and len(centers) >= 16:
        x = np.arange(1, len(profile) + 1)
        p = profile - gaussian_filter1d(profile.astype(float), 32)
        anchors = np.linspace(length * .12, length * .88, 7)
        corrections = []
        for anchor in anchors:
            win = np.exp(-.5 * ((x - anchor) / max(size * 5, length / 8)) ** 2)
            z = np.sum(win * p * np.exp(-2j * np.pi * (x - phase) / size))
            corrections.append(-np.angle(z) * size / (2 * np.pi))
        corrections = np.array(corrections)
        # Do not adapt to unrelated features or random local phase estimates.
        if np.max(np.abs(corrections)) < size * .16 and np.ptp(corrections) > .15:
            smooth = gaussian_filter1d(corrections, .8)
            centers += np.interp(centers, anchors, smooth)
            drift_applied = True
    return centers, drift_applied


def sample_cells(rgba, grid, drift=True, profiles=None, edge_cleanup="smart"):
    if grid.x.method == grid.y.method == 'fallback':
        return area_sample(rgba, grid)
    needs_profiles = drift and any(a.method == 'spectral' and a.confidence > .18 for a in (grid.x, grid.y))
    px, py = (profiles if profiles is not None else edge_profiles(rgba)) if needs_profiles else (None, None)
    xs, dx = _centers(rgba.shape[1], grid.x, px, drift)
    ys, dy = _centers(rgba.shape[0], grid.y, py, drift)
    if len(xs) * len(ys) > 1_000_000:
        raise ValueError("Native output exceeds 1 million pixels. Increase the cell size.")
    # Nine samples from the inner 24% of each cell. Nearest actual source
    # pixels avoid introducing a second interpolation blur. Channel medians
    # reject JPEG ringing and lone contaminated samples.
    probes = []
    for yy in (-.12, 0, .12):
        yi = np.clip(np.floor(ys + yy * grid.y.cell).astype(int), 0, rgba.shape[0] - 1)
        for xx in (-.12, 0, .12):
            xi = np.clip(np.floor(xs + xx * grid.x.cell).astype(int), 0, rgba.shape[1] - 1)
            probes.append(rgba[yi[:, None], xi[None, :]])
    probes = np.stack(probes)
    samples = np.median(probes, axis=0).astype(np.uint8)
    if not np.all(probes[..., 3] == 255):
        # Alpha-weighted channel medians: zero-alpha RGB has exactly zero vote.
        weights = probes[..., 3].astype(np.uint16)
        for channel in range(3):
            order = np.argsort(probes[..., channel], axis=0, kind='stable')
            values = np.take_along_axis(probes[..., channel], order, axis=0)
            cumulative = np.cumsum(np.take_along_axis(weights, order, axis=0), axis=0)
            index = np.argmax(cumulative >= np.maximum(weights.sum(axis=0) / 2, 1), axis=0)
            samples[..., channel] = np.take_along_axis(values, index[None], axis=0)[0]
    if edge_cleanup != "off" and not any(a.method == "bilinear" for a in (grid.x, grid.y)):
        from .edges import dominant_samples
        samples = dominant_samples(probes, samples)
    # With a detected bilinear resize, even the nearest centre sample is a
    # small mixture of two logical pixels. Undo that *known sampling geometry*
    # with a diagonally dominant tridiagonal solve, before palette fitting.
    # This is not generic sharpening and is never applied to guessed AI grids.
    if np.all(rgba[..., 3] == 255):
        rgb = samples[..., :3].astype(float)
        for axis, centers, estimate in ((1, xs, grid.x), (0, ys, grid.y)):
            if estimate.method != "bilinear" or estimate.confidence < .5 or len(centers) < 2:
                continue
            delta = (np.floor(centers) + .5 - centers) / estimate.cell
            n = len(centers)
            weights = np.minimum(np.abs(delta), .3)
            weights[(np.arange(n) == 0) & (delta < 0)] = 0
            weights[(np.arange(n) == n-1) & (delta > 0)] = 0
            band = np.zeros((3, n))
            band[1] = 1 - weights
            band[0, 1:] = np.where(delta[:-1] > 0, weights[:-1], 0)
            band[2, :-1] = np.where(delta[1:] < 0, weights[1:], 0)
            moved = np.moveaxis(rgb, axis, 0)
            rgb = np.moveaxis(solve_banded((1, 1), band, moved.reshape(n, -1)).reshape(moved.shape), 0, axis)
        samples[..., :3] = np.clip(np.round(rgb), 0, 255).astype(np.uint8)
    samples[..., 3] = np.where(samples[..., 3] >= 128, 255, 0)
    samples[samples[..., 3] == 0] = 0
    return samples, {"x_centers": xs.round(3).tolist(), "y_centers": ys.round(3).tolist(), "drift_x": dx, "drift_y": dy}


PRESETS = {
    "pico8": ["000000", "1d2b53", "7e2553", "008751", "ab5236", "5f574f", "c2c3c7", "fff1e8", "ff004d", "ffa300", "ffec27", "00e436", "29adff", "83769c", "ff77a8", "ffccaa"],
    "gameboy": ["0f380f", "306230", "8bac0f", "9bbc0f"],
    **EXTRA_PALETTES,
}


def _kmeans(points, weights, k):
    # Weighted farthest-point seeding is deterministic and preserves rare
    # accent colours better than an unweighted random initialization.
    centers = [points[np.argmax(weights)]]
    distances = np.full(len(points), np.inf)
    for _ in range(1, min(k, len(points))):
        distances = np.minimum(distances, np.sum((points - centers[-1]) ** 2, axis=1))
        centers.append(points[np.argmax(distances * np.sqrt(weights))])
    centers = np.array(centers)
    for _ in range(35):
        distance, labels = cKDTree(centers).query(points)
        counts = np.bincount(labels, weights=weights, minlength=len(centers))
        updated = centers.copy()
        for dim in range(3):
            sums = np.bincount(labels, weights=weights * points[:, dim], minlength=len(centers))
            updated[:, dim] = np.divide(sums, counts, out=centers[:, dim].copy(), where=counts > 0)
        if np.max(np.abs(updated - centers)) < .00015:
            centers = updated
            break
        centers = updated
    distance, labels = cKDTree(centers).query(points)
    return centers, float(np.average(distance ** 2, weights=weights))


def reduce_palette(rgba, max_colors=None, preset="auto", custom_palette=None, dither=False):
    visible = rgba[..., 3] > 0
    if not visible.any():
        return rgba.copy(), []
    rgb = rgba[..., :3][visible]
    if preset in PRESETS or preset == "custom":
        hexes = parse_palette(custom_palette or "") if preset == "custom" else PRESETS[preset]
        palette = np.array([[int(h[i:i+2], 16) for i in (0, 2, 4)] for h in hexes], dtype=np.uint8)
    else:
        # Bin only for fitting; map original cell colours to the fitted palette.
        packed = (rgb[:, 0].astype(np.uint32) << 16) | (rgb[:, 1].astype(np.uint32) << 8) | rgb[:, 2]
        exact = np.unique(packed)
        if len(exact) <= (max_colors if max_colors is not None else 64):
            out = rgba.copy()
            out[~visible] = 0
            return out, [f'#{int(c):06x}' for c in exact]
        keys = (rgb[:, 0].astype(np.uint32) // 4 * 4096 + rgb[:, 1].astype(np.uint32) // 4 * 64 + rgb[:, 2] // 4)
        _, inverse, counts = np.unique(keys, return_inverse=True, return_counts=True)
        bins = np.column_stack([np.bincount(inverse, weights=rgb[:, c]) / counts for c in range(3)])
        points = rgb_to_oklab(bins)
        weights = counts.astype(float)
        if len(points) > 16000:
            ids = np.arange(0, len(points), math.ceil(len(points) / 16000))
            points, weights = points[ids], weights[ids]
        if max_colors is not None:
            centers, _ = _kmeans(points, weights, max_colors)
        else:
            previous = None
            for k in (4, 8, 12, 16, 24, 32, 48, 64):
                centers, error = _kmeans(points, weights, min(k, len(points)))
                if error < .00020 or (previous is not None and error / max(previous, 1e-10) > .91):
                    break
                previous = error
        # Merge perceptually near-duplicate centres; manual count is a ceiling.
        while len(centers) > 1:
            ds = np.sum((centers[:, None] - centers[None]) ** 2, axis=2)
            np.fill_diagonal(ds, np.inf)
            a, b = np.unravel_index(np.argmin(ds), ds.shape)
            if ds[a, b] >= .022 ** 2:
                break
            labels = cKDTree(centers).query(points)[1]
            count = np.bincount(labels, weights=weights, minlength=len(centers))
            centers[a] = (centers[a] * count[a] + centers[b] * count[b]) / max(count[a] + count[b], 1)
            centers = np.delete(centers, b, axis=0)
        palette = oklab_to_rgb(centers)
    if dither:
        bayer = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]])
        y, x = np.indices(visible.shape)
        perturbation = (bayer[y % 4, x % 4][visible] / 16 - .46875) * 48
        rgb = np.clip(rgb.astype(float) + perturbation[:, None], 0, 255)
    labels = cKDTree(rgb_to_oklab(palette)).query(rgb_to_oklab(rgb))[1]
    out = rgba.copy()
    out[..., :3][visible] = palette[labels]
    out[~visible] = 0
    used = np.unique(out[..., :3][visible], axis=0)
    return out, ["#" + "".join(f"{v:02x}" for v in c) for c in used]


def remove_background(rgba):
    """Remove only border-connected pixels near a dominant flat border colour."""
    out = rgba.copy()
    border = np.concatenate([rgba[0], rgba[-1], rgba[:, 0], rgba[:, -1]])
    border = border[border[:, 3] > 0, :3]
    if not len(border):
        return out, "Transparent border preserved."
    quant, counts = np.unique(border // 12, axis=0, return_counts=True)
    winning = quant[np.argmax(counts)]
    close = np.max(np.abs(border.astype(int) // 12 - winning.astype(int)), axis=1) <= 1
    if close.mean() < .38:
        return out, "No dominant flat border background found; background kept."
    color = np.median(border[close], axis=0)
    distance = np.linalg.norm(rgb_to_oklab(rgba[..., :3]) - rgb_to_oklab(color), axis=2)
    mask = (distance < .055) | (rgba[..., 3] == 0)
    if color.min() >= 230 and np.ptp(color) <= 12:
        rgb = rgba[..., :3].astype(int)
        mask |= (rgb.min(2) >= 160) & (np.ptp(rgb, axis=2) <= 24)
    seed = np.zeros(mask.shape, dtype=bool)
    seed[0], seed[-1], seed[:, 0], seed[:, -1] = mask[0], mask[-1], mask[:, 0], mask[:, -1]
    outside = binary_propagation(seed, mask=mask)
    out[outside] = 0
    return out, "Background removed."


def clean_orphans(rgba):
    out = rgba.copy()
    if min(rgba.shape[:2]) < 3:
        return out
    center = rgba[1:-1, 1:-1]
    neighbors = [rgba[:-2, 1:-1], rgba[2:, 1:-1], rgba[1:-1, :-2], rgba[1:-1, 2:]]
    neighbors += [rgba[:-2, :-2], rgba[:-2, 2:], rgba[2:, :-2], rgba[2:, 2:]]
    # Only replace a pixel when all eight neighbours agree. A one-pixel
    # eye can still be intentional, which is why this is opt-in.
    mask = np.any(center != neighbors[0], axis=2) & (center[..., 3] > 0)
    for n in neighbors[1:]:
        mask &= np.all(n == neighbors[0], axis=2)
    out[1:-1, 1:-1][mask] = neighbors[0][mask]
    return out


def _checker(size, tile=12):
    y, x = np.indices((size[1], size[0]))
    shade = np.where((x // tile + y // tile) % 2, 38, 46).astype(np.uint8)
    return Image.fromarray(np.stack([shade, shade + 3, shade + 7], axis=2), "RGB")


def comparison_image(original, native, panel=512):
    canvas = Image.new("RGB", (panel * 2 + 48, panel + 96), "#111820")
    draw = ImageDraw.Draw(canvas)
    for index, (im, title, resample) in enumerate([(original, "ORIGINAL", Image.Resampling.LANCZOS), (native, "PIXELSNAP / NATIVE GRID", Image.Resampling.NEAREST)]):
        x = 16 + index * (panel + 16)
        draw.text((x, 16), title, fill="#c0d4e8", font=ImageFont.load_default(size=17))
        fitted = ImageOps.contain(im.convert("RGBA"), (panel, panel), method=resample)
        bg = _checker((panel, panel))
        bg.paste(fitted, ((panel - fitted.width) // 2, (panel - fitted.height) // 2), fitted)
        canvas.paste(bg, (x, 46))
        draw.text((x, panel + 58), f"{im.width} x {im.height}", fill="#87a0b8", font=ImageFont.load_default(size=15))
    return canvas


def prepare_image(source, options=None):
    options = Options() if options is None else options
    if not isinstance(options, Options):
        raise ValueError('options must be an Options instance.')
    options.validate()
    original = load_image(source)
    rgba, checker = checker_background(np.asarray(original))
    profiles = None
    if options.target_size:
        w, h = [max(1, round(v * options.target_size / max(original.size))) for v in original.size]
        grid = Grid(AxisGrid(original.width / w, 0, 1., "target"), AxisGrid(original.height / h, 0, 1., "target"))
    else:
        fully_manual = options.cell is not None and options.offset_x is not None and options.offset_y is not None
        if not fully_manual:
            profiles = edge_profiles(rgba)
        grid = detect_grid(original, options.cell, options.cell_y, options.offset_x, options.offset_y, profiles=profiles, _rgba=rgba)
    background_message = None
    if options.transparent:
        rgba, background_message = remove_background(rgba)
    sampled, positions = sample_cells(rgba, grid, options.drift, profiles=profiles, edge_cleanup=options.edge_cleanup)
    positions['background_removed'] = 'checkerboard' if checker else ('flat' if background_message == 'Background removed.' else None)
    positions['source_had_transparency'] = bool(np.any(np.asarray(original)[..., 3] < 255))
    return original, grid, sampled, positions


def process_image(source, options=None, *, artifacts=('native', 'upscaled', 'comparison'), prepared=None):
    options = Options() if options is None else options
    if not isinstance(options, Options):
        raise ValueError('options must be an Options instance.')
    options.validate()
    if not set(artifacts) <= {'native', 'upscaled', 'comparison'}:
        raise ValueError('Unknown artifact; choose native, upscaled, comparison.')
    original, grid, sampled, positions = prepared if prepared is not None else prepare_image(source, options)
    warnings = []
    if positions.get('background_removed') == 'checkerboard':
        warnings.append('Painted checkerboard removed.')
    elif positions.get('background_removed') == 'flat':
        warnings.append('Background removed.')
    if grid.x.method == grid.y.method == 'fallback':
        warnings.append('Fallback: no consistent grid found. Detail-adaptive area sampling; missing detail cannot be recovered.')
    if grid.x.method == 'regional':
        warnings.append('Mixed-scale detail: finer sampling protects aligned HUD text; this is an approximation.')
    if min(grid.x.confidence, grid.y.confidence) < .25 and (grid.x.method != "native" or grid.y.method != "native"):
        warnings.append('Weak or inconsistent grid: this is an approximation. Try a target size or manual grid.')
    if options.transparent:
        sampled, message = remove_background(sampled)
        if not positions.get('background_removed'):
            if message == 'Transparent border preserved.' and positions.get('source_had_transparency'):
                message = 'Image already had transparency.'
            warnings.append(message)
    sampled, palette = reduce_palette(sampled, options.colors, options.palette, options.custom_palette, options.dither)
    if options.edge_cleanup != "off" and not options.dither:
        from .edges import clean_edges
        sampled = clean_edges(sampled, options.edge_cleanup)
        used = np.unique(sampled[..., :3][sampled[..., 3] > 0], axis=0)
        palette = ["#" + "".join(f"{v:02x}" for v in c) for c in used]
    if options.cleanup:
        sampled = clean_orphans(sampled)
        used = np.unique(sampled[..., :3][sampled[..., 3] > 0], axis=0)
        palette = ["#" + "".join(f"{v:02x}" for v in c) for c in used]
    native = Image.fromarray(sampled, "RGBA")
    export_scale = options.scale if options.fit is None else options.fit // max(native.size)
    if export_scale < 1 and 'upscaled' in artifacts:
        raise ValueError("Native image is larger than the fit size. Choose a smaller target grid.")
    export_scale = max(1, export_scale)
    if 'upscaled' in artifacts and native.width * native.height * export_scale ** 2 > MAX_OUTPUT_PIXELS:
        raise ValueError("Upscaled output exceeds 32 megapixels. Choose a smaller scale or larger cell size.")
    export_size = (native.width * export_scale, native.height * export_scale)
    upscaled = native.resize(export_size, Image.Resampling.NEAREST) if 'upscaled' in artifacts else None
    metadata = {"source_size": list(original.size), "native_size": list(native.size),
                "grid": asdict(grid), "colors": len(palette), "palette": palette,
                "options": asdict(options), "artifacts": list(artifacts), "export_size": list(export_size), "export_scale": export_scale, "warnings": warnings, **positions}
    return Result(native, upscaled, comparison_image(original, native) if 'comparison' in artifacts else None, metadata)


def snap(source, options=None, *, artifacts=('native',)):
    """Reconstruct an image without filesystem writes; optional renders are absent."""
    return process_image(source, options, artifacts=artifacts)


def save_result(result, directory, stem, *, overwrite=False):
    import json
    import os
    import tempfile
    directory = Path(directory).resolve()
    if not stem or Path(stem).name != stem or stem in ('.', '..'):
        raise ValueError('Output stem must be a simple filename.')
    directory.mkdir(parents=True, exist_ok=True)
    paths = {}
    images = [(suffix, im) for suffix, im in (("native", result.native), (f"x{result.metadata.get('export_scale', result.metadata['options']['scale'])}", result.upscaled), ("comparison", result.comparison)) if im is not None and (suffix != 'native' or 'native' in result.metadata.get('artifacts', ['native']))]
    destinations = [directory / f'{stem}_{suffix}.png' for suffix, _ in images] + [directory / f'{stem}_info.json']
    lock = directory / f'.{stem}.lock'
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    os.close(fd)
    try:
        if not overwrite and any(p.exists() for p in destinations):
            raise FileExistsError(f'Output already exists for {stem}; choose another directory or --overwrite.')
        with tempfile.TemporaryDirectory(prefix='.pixelsnap-', dir=directory) as staging:
            for (suffix, im), dest in zip(images, destinations):
                temporary = Path(staging) / dest.name
                im.save(temporary)
                paths[suffix] = str(dest)
            info = destinations[-1]
            (Path(staging) / info.name).write_text(json.dumps(result.metadata, indent=2, allow_nan=False), encoding='utf-8')
            for dest in destinations:  # manifest is published last
                os.replace(Path(staging) / dest.name, dest)
            paths['info'] = str(info)
    finally:
        lock.unlink(missing_ok=True)
    return paths
