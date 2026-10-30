import io
import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFilter

from pixelsnap.core import Options, detect_grid, process_image, remove_background


def sprite():
    image = Image.new("RGB", (48, 40), "#d2e9de")
    d = ImageDraw.Draw(image)
    d.rectangle((9, 6, 36, 31), fill="#306a55")
    d.rectangle((15, 12, 30, 23), fill="#f5c267")
    d.rectangle((18, 14, 20, 17), fill="#181c35")
    d.rectangle((26, 14, 28, 17), fill="#181c35")
    d.line((14, 26, 32, 26), fill="#822c5a")
    for i in range(7, 40, 5):
        d.rectangle((i, 32, i + 2, 35), fill="#30456b")
    return image


@pytest.mark.parametrize("scale", [4, 5.5, 7.25, 10.3])
def test_blurred_jpeg_fractional_grid_and_recovery(scale):
    original = sprite()
    large = original.resize((round(48 * scale), round(40 * scale)), Image.Resampling.BILINEAR)
    large = large.filter(ImageFilter.GaussianBlur(.4))
    buffer = io.BytesIO()
    large.save(buffer, format="JPEG", quality=88, subsampling=0)
    buffer.seek(0)
    degraded = Image.open(buffer)
    result = process_image(degraded, Options(colors=6, scale=3))
    g = result.metadata["grid"]
    assert abs(g["x"]["cell"] - degraded.width / 48) < .08
    assert abs(g["y"]["cell"] - degraded.height / 40) < .08
    assert result.native.size == original.size
    error = np.abs(np.array(result.native)[..., :3].astype(float) - np.array(original))
    assert error.mean() < 12
    assert np.mean(np.max(error, axis=2) < 35) > .91
    enlarged = np.array(result.upscaled)
    expected = np.repeat(np.repeat(np.array(result.native), 3, axis=0), 3, axis=1)
    np.testing.assert_array_equal(enlarged, expected)
    assert len(result.metadata['palette']) <= 6


def test_nearest_and_phase():
    original = sprite()
    large = original.resize((288, 240), Image.Resampling.NEAREST)
    # Crop a partial cell: original boundaries now occur at x=-2 and y=-1.
    cropped = large.crop((2, 1, 286, 239))
    g = detect_grid(cropped)
    assert abs(g.x.cell - 6) < .03
    assert abs(g.y.cell - 6) < .03
    assert abs(g.x.offset + 2) < .2
    assert abs(g.y.offset + 1) < .2


def test_transparency_only_removes_connected_background():
    a = np.full((9, 9, 4), 255, dtype=np.uint8)
    a[2:7, 2:7, :3] = (30, 60, 90)
    a[4, 4, :3] = 255  # enclosed white detail must survive
    out, _ = remove_background(a)
    assert out[0, 0, 3] == 0
    assert out[4, 4, 3] == 255
    assert out[3, 3, 3] == 255


def test_manual_and_preset():
    r = process_image(sprite().resize((288, 240), Image.Resampling.NEAREST), Options(cell=6, offset_x=0, offset_y=0, palette="gameboy"))
    assert r.native.size == (48, 40)
    assert r.metadata['colors'] <= 4
    assert set(np.unique(np.asarray(r.native)[..., 3])) <= {0, 255}


def test_non_square_grid():
    im = sprite().resize((48*6, 40*8), Image.Resampling.BILINEAR)
    g = detect_grid(im)
    assert abs(g.x.cell-6) < .06
    assert abs(g.y.cell-8) < .06


def test_no_grid_is_disclosed():
    rng = np.random.default_rng(123)
    noise = Image.fromarray(rng.integers(0, 256, (320, 400, 3), dtype=np.uint8))
    result = process_image(noise, Options(colors=12, scale=1))
    assert result.metadata['warnings']
    assert len(result.metadata['palette']) <= 12


def test_alpha_and_orphan_cleanup():
    from pixelsnap.core import clean_orphans
    a = np.full((7, 7, 4), (40, 70, 80, 255), dtype=np.uint8)
    a[3,3,:3] = (255, 10, 50)
    out = clean_orphans(a)
    assert np.array_equal(out[3,3], a[3,2])
    a[0,0] = (255,0,0,0)
    r = process_image(Image.fromarray(a), Options(cell=1, scale=2))
    assert np.asarray(r.native)[0,0,3] == 0


@pytest.mark.parametrize("options", [Options(cell=0), Options(cell=float('nan')), Options(colors=1), Options(scale=99)])
def test_invalid_options(options):
    with pytest.raises(ValueError):
        process_image(sprite(), options)
