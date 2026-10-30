"""Deterministic edge recovery shared algorithmically with the browser port.

Only low-population colours lying on an OKLab segment are candidates. Both
endpoints must occur in the 8-neighbourhood; flat interiors and local extrema
(including isolated white highlights / black eyes) are never candidates.
"""
import numpy as np


def dominant_samples(probes, samples):
    flat = probes.reshape(9, -1, 4)
    visible = flat[..., 3] > 0
    values = flat[..., :3].astype(float)
    lo = np.min(np.where(visible[..., None], values, 256), axis=0)
    hi = np.max(np.where(visible[..., None], values, -1), axis=0)
    ids = np.flatnonzero(np.max(hi-lo, axis=1) >= 48)
    if not len(ids):
        return samples
    v = values[:, ids]
    alpha = flat[:, ids, 3].astype(float)
    weight = alpha * np.array([1, 2, 1, 2, 4, 2, 1, 2, 1])[:, None]
    channel = np.argmax((hi-lo)[ids], axis=1)
    scalar = np.take_along_axis(v, channel[None, :, None], axis=2)[..., 0]
    low = np.argmin(np.where(alpha > 0, scalar, 256), axis=0)
    high = np.argmax(np.where(alpha > 0, scalar, -1), axis=0)
    a, b = v[low, np.arange(len(ids))], v[high, np.arange(len(ids))]
    for _ in range(3):
        da, db = np.sum((v-a)**2, axis=2), np.sum((v-b)**2, axis=2)
        belongs = db < da
        wa, wb = weight * ~belongs, weight * belongs
        ca, cb = wa.sum(axis=0), wb.sum(axis=0)
        a = (v*wa[..., None]).sum(axis=0)/np.maximum(ca[:, None], 1)
        b = (v*wb[..., None]).sum(axis=0)/np.maximum(cb[:, None], 1)
    sep = np.sum((a-b)**2, axis=1)
    variance = (np.sum((v-a)**2, axis=2)*wa + np.sum((v-b)**2, axis=2)*wb).sum(axis=0)/np.maximum(ca+cb, 1)
    bimodal = (sep >= 48**2) & (variance < sep*.18) & (ca > 0) & (cb > 0)
    choose_b = cb > ca
    center = np.where(choose_b[:, None], b, a)
    # Actual source medoid: never synthesize an in-between RGB triplet.
    score = np.sum((v-center)**2, axis=2)
    score[(belongs != choose_b) | (alpha == 0)] = np.inf
    picked = np.argmin(score, axis=0)
    samples.reshape(-1, 4)[ids[bimodal], :3] = v[picked[bimodal], np.arange(len(ids))[bimodal]].astype(np.uint8)
    return samples


def transition_pass(rgba, mode='smart'):
    from .core import rgb_to_oklab
    out = rgba.copy()
    visible = rgba[..., 3] > 0
    if not visible.any():
        return out, 0
    colors, inverse, counts = np.unique(rgba[..., :3][visible], axis=0, return_inverse=True, return_counts=True)
    if len(colors) < 3:
        return out, 0
    labs = rgb_to_oklab(colors)
    labels = np.full(visible.shape, -1, dtype=int)
    labels[visible] = inverse
    pad = np.pad(labels, 1, constant_values=-1)
    h, w = labels.shape
    neighbors = np.stack([pad[1+dy:1+dy+h, 1+dx:1+dx+w] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dx or dy])
    flat = np.sum(neighbors == labels, axis=0) >= (4 if mode == 'strong' else 3)
    dominant = sorted(range(len(colors)), key=lambda i: (-counts[i], i))[:16]
    ratio, tolerance = (1.5, .035) if mode == 'strong' else (2., .008)
    changes = 0
    for c in range(len(colors)):
        endpoints = [i for i in dominant if counts[i] >= max(4, counts[c]*ratio) and i != c]
        if len(endpoints) < 2:
            continue
        cells = (labels == c) & ~flat
        if not cells.any():
            continue
        candidates = []
        for ai, a in enumerate(endpoints):
            for b in endpoints[ai+1:]:
                delta = labs[b]-labs[a]
                length = float(delta @ delta)
                if length < .10**2:
                    continue
                t = float((labs[c]-labs[a]) @ delta)/length
                residual = float(np.sum((labs[c]-labs[a]-t*delta)**2))
                if .00001 < t < .99999 and residual < tolerance**2:
                    candidates.append((residual, a, b, a if t <= .5 else b))
        # Stable ordering is identical to JS; each cell changes at most once.
        candidates.sort(key=lambda v: v[0])
        remaining = cells.copy()
        votes = {}
        for _, a, b, target in candidates:
            near_a, near_b = np.any(neighbors == a, axis=0), np.any(neighbors == b, axis=0)
            # Two-colour images can have whole diagonals of interpolation shades.
            two_color = counts[a]+counts[b] >= counts.sum()*.9 and counts[c] < counts.sum()*.04 and not np.any((labels == c) & flat)
            mask = remaining & ((near_a | near_b) if two_color else (near_a & near_b))
            n = int(mask.sum())
            if n:
                out[mask, :3] = colors[target]
                remaining[mask] = False
                votes[target] = votes.get(target, 0) + n
                changes += n
        # Merge a low-population palette cluster only with spatial evidence,
        # and never if it has a flat interior of its own.
        if votes and sum(votes.values()) >= counts[c]*.6 and not np.any((labels == c) & flat):
            target = max(votes, key=votes.get)
            mask = remaining & np.any(neighbors == target, axis=0)
            out[mask, :3] = colors[target]
            changes += int(mask.sum())
    return out, changes


def clean_edges(rgba, mode='smart'):
    if mode == 'off':
        return rgba.copy()
    for _ in range(4 if mode == 'strong' else 2):
        rgba, changed = transition_pass(rgba, mode)
        if not changed:
            break
    return rgba


def transition_pixels(rgba):
    """Count actionable transition pixels under the fixed smart criteria."""
    return transition_pass(np.asarray(rgba), 'smart')[1]
