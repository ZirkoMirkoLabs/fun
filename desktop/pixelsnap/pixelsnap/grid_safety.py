"""Conservative guard against confusing a small sprite's outline with its grid."""
import numpy as np


def coarse_sprite_grid(rgba, axes, overrides):
    h, w = rgba.shape[:2]
    if max(w, h) > 192 or any(v is not None for v in overrides):
        return False
    if not any(a.cell > size / 16 for a, size in zip(axes, (w, h))):
        return False
    # A genuinely coarse, sharply enlarged sprite is valid. Require its changes
    # to land on the claimed boundaries instead of treating every large pitch
    # as an error. Ignore RGB hidden behind alpha.
    data = rgba.astype(np.int16).copy()
    data[rgba[..., 3] == 0] = 0
    for axis, estimate in enumerate(axes):
        size = (w, h)[axis]
        if estimate.cell <= size / 16:
            continue
        delta = np.max(np.abs(np.diff(data, axis=1-axis)), axis=2)
        profile = np.sum(delta, axis=axis)
        pos = np.arange(1, size)
        distance = np.abs((pos-estimate.offset+estimate.cell/2) % estimate.cell-estimate.cell/2)
        total = float(profile.sum())
        supported = float(profile[distance <= 1.25].sum()) / max(total, 1)
        if total and supported < .70:
            return True
    return False
