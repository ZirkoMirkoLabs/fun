import io
import numpy as np
import pytest
from PIL import Image
from pixelsnap.core import Options, PRESETS, process_image
from pixelsnap.palettes import parse_palette
from pixelsnap.app import create_app


@pytest.mark.parametrize('size', [16, 24, 32, 48, 64, 96, 128])
def test_target_and_fit_keep_whole_pixels(size):
    source = Image.new('RGBA', (180, 120), '#ee8899')
    result = process_image(source, Options(target_size=size, fit=512, palette='sweetie16'))
    assert result.native.size == (size, round(size * 2 / 3))
    assert max(result.upscaled.size) <= 512
    scale = result.metadata['export_scale']
    np.testing.assert_array_equal(np.asarray(result.upscaled), np.repeat(np.repeat(np.asarray(result.native), scale, 0), scale, 1))


@pytest.mark.parametrize('name', list(PRESETS))
def test_preset_dither_stays_in_palette_and_preserves_alpha(name):
    a = np.zeros((16, 16, 4), dtype=np.uint8)
    a[..., :3] = np.arange(16, dtype=np.uint8)[None, :, None] * 16
    a[2:, :, 3] = 255
    result = process_image(Image.fromarray(a), Options(cell=1, palette=name, dither=True, scale=1))
    assert set(result.metadata['palette']) <= {'#' + c for c in PRESETS[name]}
    np.testing.assert_array_equal(np.asarray(result.native)[..., 3], a[..., 3])


def test_palette_formats_and_errors():
    assert parse_palette('#000, #FFF; 123456') == ['000000', 'ffffff', '123456']
    assert parse_palette('GIMP Palette\nName: Test\nColumns: 2\n# comment\n0 0 0 Black\n255 255 255 White') == ['000000', 'ffffff']
    for bad in ('', '#000', 'not-a-colour', 'GIMP Palette\n300 0 0\n0 0 0'):
        with pytest.raises(ValueError):
            parse_palette(bad)


def test_api_options_and_invalid_custom_palette():
    def upload():
        stream = io.BytesIO()
        Image.new('RGB', (120, 80), '#aaaaaa').save(stream, format='PNG')
        stream.seek(0)
        return (stream, 'test.png')
    client = create_app().test_client()
    response = client.post('/api/process', data={'image': upload(), 'target_size': '24', 'fit': '1024', 'palette': 'custom', 'custom_palette': '#000 #fff', 'dither': 'true'})
    assert response.status_code == 200
    m = response.get_json()['metadata']
    assert m['native_size'] == [24, 16]
    assert m['export_size'] == [1008, 672]
    assert set(m['palette']) <= {'#000000', '#ffffff'}
    assert client.post('/api/process', data={'image': upload(), 'palette': 'custom', 'custom_palette': 'bad palette'}).status_code == 400


def test_cli_custom_palette_and_export(tmp_path):
    from pixelsnap.__main__ import main
    source = tmp_path / 'input.png'
    Image.new('RGB', (160, 80), '#bbbbbb').save(source)
    palette = tmp_path / 'test.gpl'
    palette.write_text('GIMP Palette\n0 0 0 Black\n255 255 255 White', encoding='utf-8')
    dest = tmp_path / 'output'
    assert main([str(source), '-o', str(dest), '--target-size', '24', '--fit', '512', '--palette-file', str(palette), '--dither']) == 0
    assert Image.open(dest / 'input_native.png').size == (24, 12)
    assert Image.open(dest / 'input_x21.png').size == (504, 252)
