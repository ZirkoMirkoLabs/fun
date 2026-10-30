import json
from pathlib import Path
from unittest.mock import patch
import zipfile
import numpy as np
import pytest
from PIL import Image, ImageDraw

from pixelsnap import Options, snap, variants, list_presets
from pixelsnap.core import AxisGrid, Grid, sample_cells
from pixelsnap.edges import clean_edges, transition_pixels
from pixelsnap.exports import svg, palette_hex, palette_gpl, save_pack
from pixelsnap.interface import options_from_mapping


def test_antialiased_black_outline_has_no_grey():
    native = Image.new('RGB', (32, 32), 'white')
    draw = ImageDraw.Draw(native)
    draw.rectangle((7, 5, 24, 26), outline='black', width=2)
    draw.line((7, 6, 24, 25), fill='black', width=1)
    source = native.resize((232, 232), Image.Resampling.BILINEAR)
    result = snap(source)
    assert result.native.size == (32, 32)
    assert set(result.metadata['palette']) == {'#000000', '#ffffff'}


@pytest.mark.parametrize("resampling", [Image.Resampling.NEAREST, Image.Resampling.BILINEAR])
def test_highlight_eye_and_star_survive_smart(resampling):
    a = np.full((24, 24, 4), (0, 0, 0, 255), dtype=np.uint8)
    a[10, 10, :3] = 255
    a[3, 19, :3] = 255
    a[13:20, 3:9, :3] = 255
    a[16, 6, :3] = 0
    source = Image.fromarray(a).resize((192, 192), resampling)
    result = snap(source, Options(cell=8, offset_x=0, offset_y=0))
    np.testing.assert_array_equal(np.asarray(result.native), a)


def test_transitions_and_flat_region():
    a = np.full((20, 20, 4), 255, dtype=np.uint8)
    a[:, :8, :3] = 0
    a[1:4, 8, :3] = 180
    a[10:17, 11:18, :3] = 128  # intentional large grey patch
    a[12, 3, :3] = 255  # white highlight is a local extremum
    assert transition_pixels(a) == 3
    b = clean_edges(a)
    assert transition_pixels(b) == 0
    np.testing.assert_array_equal(b[10:17, 11:18], a[10:17, 11:18])
    np.testing.assert_array_equal(b[12, 3], a[12, 3])
    np.testing.assert_array_equal(clean_edges(a, 'off'), a)


def test_cluster_chooses_actual_colour_not_channel_median():
    a = np.zeros((10, 10, 4), dtype=np.uint8)
    coords = [(y, x) for y in (3, 5, 6) for x in (3, 5, 6)]
    for i, (y, x) in enumerate(coords):
        a[y, x] = (250, 10, 10, 255) if i in (1, 3, 4, 5) else (10, 10, 250, 255)
    axis = AxisGrid(10, 0, 1, 'manual')
    out = sample_cells(a, Grid(axis, axis), False)[0]
    assert tuple(out[0, 0]) == (250, 10, 10, 255)


def test_versions_detect_once_match_individual():
    image = Image.new('RGB', (128, 96), '#bada55')
    import pixelsnap.core as core
    with patch.object(core, 'detect_grid', wraps=core.detect_grid) as detector:
        result = variants(image)
        assert detector.call_count == 1
    assert len(result) == 8
    for item, preset in zip(result, list_presets()):
        single = snap(image, Options(**preset['options']))
        np.testing.assert_array_equal(item['native'], single.native)
        assert item['palette'] == single.metadata['palette']
    assert options_from_mapping({'preset': 'Clean', 'colors': 8}).colors == 8
    assert options_from_mapping({'preset': 'Clean'}).cleanup
    assert variants(image, []) == []
    with pytest.raises(ValueError):
        variants(image, ['missing'])
    with pytest.raises(ValueError):
        Options(edge_cleanup='maybe').validate()


def test_pack_svg_and_palettes(tmp_path):
    image = Image.new('RGBA', (8, 4), '#123456')
    result = snap(image, Options(cell=1, offset_x=0, offset_y=0))
    assert svg(image).count('<rect ') == 4
    assert 'shape-rendering="crispEdges"' in svg(image)
    assert palette_hex(['#123456']) == '123456\n'
    assert '18 52 86 #123456' in palette_gpl(['#123456'])
    archive = Path(save_pack(result, tmp_path/'pack.zip'))
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert len(z.namelist()) == 9
        for size in (16, 32, 64, 128):
            with z.open(f'fit-{size}.png') as stream:
                assert Image.open(stream).size == (size, size//2)
    with pytest.raises(FileExistsError):
        save_pack(result, archive)


def test_cli_named_preset_and_pack(tmp_path, capsys):
    from pixelsnap.cli import main
    source = tmp_path/'source.png'
    Image.new('RGB', (128, 128), 'red').save(source)
    assert main(['snap', str(source), '-o', str(tmp_path/'out'), '--preset', 'Icon 32', '--pack', str(tmp_path/'pack.zip'), '--svg', '--palette-files', '--json']) == 0
    response = json.loads(capsys.readouterr().out)['results'][0]
    assert response['metadata']['native_size'] == [32, 32]
    assert {'pack', 'svg', 'hex', 'gpl'} <= response['outputs'].keys()


def test_http_edge_option_invalidates_sampling_cache():
    import io
    from pixelsnap.app import create_app
    client = create_app().test_client()
    stream = io.BytesIO()
    Image.new('RGB', (32, 32), 'red').save(stream, format='PNG')
    def request(mode):
        return client.post('/api/process', data={'image': (io.BytesIO(stream.getvalue()), 'x.png'), 'edge_cleanup': mode}).get_json()
    assert not request('off')['cache_hit']
    assert not request('smart')['cache_hit']
    assert request('smart')['cache_hit']


def test_pack_never_overwrites_an_input(tmp_path, capsys):
    from pixelsnap.cli import main
    source = tmp_path/'native.png'
    Image.new('RGB', (24, 24), 'red').save(source)
    original = source.read_bytes()
    assert main(['snap', str(source), '-o', str(tmp_path/'out'), '--pack', str(tmp_path), '--overwrite', '--json']) == 1
    assert 'overwrite an input' in json.loads(capsys.readouterr().out)['results'][0]['error']['message']
    assert source.read_bytes() == original


def test_clean_never_adds_colours_to_faithful():
    source = Path(__file__).resolve().parents[1] / 'samples/input/03_ai_teapot.png'
    with Image.open(source) as image:
        faithful, clean = variants(image, ['faithful', 'clean'])
        assert len(clean['palette']) <= min(16, len(faithful['palette']))
        single = variants(image, ['clean'])[0]
        np.testing.assert_array_equal(clean['native'], single['native'])
