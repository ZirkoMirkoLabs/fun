import io
import struct
import zlib

import numpy as np
import pytest
from PIL import Image

from pixelsnap.core import (AxisGrid, Grid, Options, InputTooLarge, clean_orphans,
                           detect_grid, load_image, process_image, reduce_palette,
                           sample_cells, snap)


@pytest.mark.parametrize('pitch', [(4, 8), (6, 12), (8, 16)])
@pytest.mark.parametrize('method', [Image.Resampling.NEAREST, Image.Resampling.BILINEAR])
def test_rectangular_fundamentals(pitch, method):
    base = Image.fromarray(np.random.default_rng(1).integers(0, 256, (32, 32, 3), dtype=np.uint8))
    image = base.resize((32 * pitch[0], 32 * pitch[1]), method)
    result = snap(image, Options(colors=16))
    assert result.native.size == (32, 32)
    for key, expected in zip(('x', 'y'), pitch):
        axis = result.metadata['grid'][key]
        assert abs(axis['cell'] - expected) < .04
        assert abs(axis['offset']) < .15


@pytest.mark.parametrize('pitch', [2, 3, 4, 5])
@pytest.mark.parametrize('sparse', [False, True])
def test_small_clean_grids(pitch, sparse):
    rng = np.random.default_rng(15)
    a = rng.integers(0, 256, (48, 48, 3), dtype=np.uint8)
    if sparse:
        a[rng.random((48, 48)) < .85] = 255
    image = Image.fromarray(a).resize((48 * pitch, 48 * pitch), Image.Resampling.NEAREST)
    grid = detect_grid(image)
    assert abs(grid.x.cell - pitch) < .04
    assert abs(grid.y.cell - pitch) < .04


@pytest.mark.parametrize('seed', [1, 2, 3])
def test_noise_is_not_confident_grid(seed):
    image = Image.fromarray(np.random.default_rng(seed).integers(0, 256, (320, 400, 3), dtype=np.uint8))
    grid = detect_grid(image)
    assert min(grid.x.confidence, grid.y.confidence) < .25


@pytest.mark.parametrize('partial', [False, True])
def test_hidden_rgb_invariance(partial):
    a = np.zeros((10, 10, 4), dtype=np.uint8)
    coords = [(y, x) for y in (3, 5, 6) for x in (3, 5, 6)]
    colors = [(255, 0, 0), (255, 0, 0), (0, 255, 0), (0, 255, 0), (0, 0, 255)]
    for i, ((y, x), color) in enumerate(zip(coords, colors)):
        a[y, x] = (*color, 192 if partial and i == 0 else 255)
    b = a.copy()
    b[b[..., 3] == 0, :3] = 255
    grid = Grid(AxisGrid(10, 0, 1, 'manual'), AxisGrid(10, 0, 1, 'manual'))
    aa = sample_cells(a, grid, False)[0]
    bb = sample_cells(b, grid, False)[0]
    np.testing.assert_array_equal(aa, bb)
    assert aa[0, 0, 3] == 255


@pytest.mark.parametrize('extension', ['png', 'tiff'])
def test_16_bit_full_range(tmp_path, extension):
    row = np.array([0, 128, 255, 256, 1024, 16384, 32768, 65535], dtype=np.uint16)
    a = np.tile(row, (4, 1))
    path = tmp_path / f'midtones.{extension}'
    Image.fromarray(a).save(path)
    expected = np.rint(a / 257).astype(np.uint8)
    np.testing.assert_array_equal(np.asarray(load_image(path))[..., 0], expected)


def test_float_range_policy():
    a = np.linspace(0, 1, 16, dtype=np.float32).reshape(4, 4)
    np.testing.assert_array_equal(np.asarray(load_image(Image.fromarray(a)))[..., 0], np.rint(a * 255))
    with pytest.raises(ValueError, match='range'):
        load_image(Image.fromarray(a * 100))


@pytest.mark.parametrize('size', [(400, 800), (128, 512)])
def test_fallback_aspect_ratio(size):
    result = snap(Image.new('RGB', size, 'gray'))
    assert result.metadata['grid']['x']['cell'] == result.metadata['grid']['y']['cell']
    assert abs(result.native.width / result.native.height - size[0] / size[1]) < .015


@pytest.mark.parametrize('color', [(0, 0, 0), (255, 255, 255), (255, 0, 0), (12, 48, 128)])
def test_exact_solid_colors(color):
    a = np.full((8, 8, 4), (*color, 255), dtype=np.uint8)
    np.testing.assert_array_equal(reduce_palette(a)[0], a)


def test_exact_palette_roundtrip():
    a = np.random.default_rng(2).integers(0, 256, (4, 4, 4), dtype=np.uint8)
    a[..., 3] = 255
    np.testing.assert_array_equal(reduce_palette(a, 16)[0], a)


def test_diagonal_and_checker_survive_cleanup():
    a = np.full((7, 7, 4), 255, dtype=np.uint8)
    for i in range(1, 6):
        a[i, i, :3] = 0
    np.testing.assert_array_equal(clean_orphans(a), a)
    a[1::2, 1::2, :3] = 0
    a[::2, ::2, :3] = 0
    np.testing.assert_array_equal(clean_orphans(a), a)


def test_isolated_noise_cleanup_and_palette_truth():
    a = np.full((7, 7, 4), 255, dtype=np.uint8)
    a[3, 3, :3] = 0
    result = snap(Image.fromarray(a), Options(cell=1, cleanup=True))
    assert result.metadata['palette'] == ['#ffffff']


def test_manual_skips_profiles(monkeypatch):
    def unexpected(*args, **kwargs):
        raise AssertionError('Manual grid should skip profiles')
    monkeypatch.setattr('pixelsnap.core.edge_profiles', unexpected)
    snap(Image.new('RGB', (80, 80)), Options(cell=4, offset_x=0, offset_y=0))


def test_native_only_ignores_upscale_limit():
    result = snap(Image.new('RGB', (1000, 1000)), Options(cell=1, offset_x=0, offset_y=0))
    assert result.native.size == (1000, 1000)
    assert result.upscaled is None and result.comparison is None


@pytest.mark.parametrize('kwargs', [{'scale': 1.5}, {'colors': 2.5}, {'scale': True}, {'drift': 'false'}, {'cell': True}])
def test_strict_options(kwargs):
    with pytest.raises(ValueError):
        Options(**kwargs).validate()


def bomb_png():
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!IIBBBBB', 20000, 20000, 8, 2, 0, 0, 0)) + chunk(b'IDAT', b'') + chunk(b'IEND', b'')


def test_bomb_translated():
    with pytest.raises(InputTooLarge):
        load_image(io.BytesIO(bomb_png()))
