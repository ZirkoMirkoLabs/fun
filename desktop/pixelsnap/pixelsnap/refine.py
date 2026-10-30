"""Conservative source-space background, HUD and fallback refinements.

Keep thresholds and rounding identical to the browser's refine.mjs.
"""
import numpy as np
from scipy.ndimage import binary_propagation, label, find_objects


def checker_background(a):
    rgb = a[..., :3].astype(int)
    lines = [rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]
    regular = 0
    for line in lines:
        neutral = (line.min(1) >= 175) & (np.ptp(line, axis=1) <= 12)
        if neutral.mean() < .95:
            continue
        values = line.mean(1)
        low, high = np.percentile(values, [10, 90], method='nearest')
        if high - low < 12:
            continue
        changes = np.flatnonzero(np.diff(values > (low + high) / 2)) + 1
        runs = np.diff(changes)
        if len(runs) >= 8:
            median = np.median(runs)
            regular += 2 <= median <= 64 and np.mean(abs(runs - median) <= median * .3) >= .75
    if regular < 3:
        return a, False
    mask = ((rgb.min(2) >= 175) & (np.ptp(rgb, axis=2) <= 16)) | (a[..., 3] == 0)
    seed = np.zeros(mask.shape, bool)
    seed[0], seed[-1], seed[:, 0], seed[:, -1] = mask[0], mask[-1], mask[:, 0], mask[:, -1]
    out = a.copy()
    out[binary_propagation(seed, mask=mask)] = 0
    return out, True


def hud_evidence(a, cx, cy):
    """Repeated aligned bright glyphs justify a finer sampling grid.

    Harmonics alone are insufficient: require six separate, aligned components.
    This is explicitly a regional approximation, not a recovered global pitch.
    """
    h, w = a.shape[:2]
    if min(cx, cy) < 4 or abs(cx-cy)/max(cx,cy) > .08 or w < 256:
        return False
    top = a[:h//8]
    rgb = top[..., :3].astype(int)
    mask = (rgb.min(2) > 190) & (np.ptp(rgb, axis=2) < 35) & (top[..., 3] > 127)
    if not .005 < mask.mean() < .15:
        return False
    labels, _ = label(mask)
    rows = []
    for i, box in enumerate(find_objects(labels)):
        y, x = box
        hh, ww = y.stop-y.start, x.stop-x.start
        if cy*1.5 <= hh <= cy*6 and cx*.5 <= ww <= cx*6 and np.sum(labels[box] == i+1) >= cx*cy*1.5:
            rows.append(y.start)
    return any(sum(abs(y-z) <= cy for z in rows) >= 6 for y in rows)


def fallback_size(a):
    # Fixed-stride RGB differences are inexpensive and identical in both ports.
    rgb = a[::4, ::4, :3].astype(int)
    detail = sum(np.abs(np.diff(rgb, axis=i)).sum() for i in (0, 1))
    count = sum(np.diff(rgb, axis=i).size for i in (0, 1))
    detail /= max(count, 1)
    return 192 if detail > 8 else 160 if detail > 3 else 128


def area_sample(a, grid):
    """Area means within the centre's contrast group preserve thin hard edges."""
    h, w = a.shape[:2]
    W, H = round(w/grid.x.cell), round(h/grid.y.cell)
    out = np.zeros((H, W, 4), np.uint8)
    for y in range(H):
        for x in range(W):
            block = a[y*h//H:(y+1)*h//H, x*w//W:(x+1)*w//W].reshape(-1, 4).astype(int)
            visible = block[block[:, 3] >= 128]
            if len(visible)*2 < len(block) or not len(visible):
                continue
            light = visible[:, :3].sum(1)
            if light.max()-light.min() > 192:
                mid = (int(light.max())+int(light.min()))/2
                center = a[min(h-1, int((y+.5)*h/H)), min(w-1, int((x+.5)*w/W)), :3].astype(int).sum()
                selected = visible[(light > mid) == (center > mid)]
                if len(selected)*4 >= len(visible):
                    visible = selected
            out[y, x, :3] = np.rint(visible[:, :3].mean(0)).astype(np.uint8)
            out[y, x, 3] = 255
    return out, dict(x_centers=[round((x+.5)*w/W, 3) for x in range(W)],
                     y_centers=[round((y+.5)*h/H, 3) for y in range(H)], drift_x=False, drift_y=False)
