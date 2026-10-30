import json
from pathlib import Path
import shutil
import subprocess
import sys

import numpy as np
import pytest
from PIL import Image, ImageDraw
from pixelsnap.effects import list_effects, validate_effect, apply_effect
from pixelsnap.core import detect_grid, snap, Options


@pytest.fixture
def image(tmp_path):
    p = tmp_path/'source.png'
    im = Image.new('RGBA', (32, 32))
    ImageDraw.Draw(im).rectangle((8, 6, 23, 27), fill=(30, 100, 220, 255))
    im.save(p)
    return p


def test_catalog_and_shared_runtime():
    assert len(list_effects()['effects']) == 27
    root = Path(__file__).resolve().parents[1]
    web = root.parent/'fun/projects/pixelsnap'
    if web.exists():
        for p in (root/'pixelsnap/effects_runtime').rglob('*'):
            if p.is_file():
                assert p.read_bytes() == (web/p.relative_to(root/'pixelsnap/effects_runtime')).read_bytes()


@pytest.mark.parametrize('layer', [dict(effect='../../evil.mjs'), dict(effect='__proto__'),
    dict(effect='fire/torch', seed=True), dict(effect='fire/torch', opacity=-1),
    dict(effect='fire/torch', code='fetch("https://example.com")')])
def test_untrusted_recipe_rejected(layer):
    with pytest.raises(ValueError):
        validate_effect(dict(version=1, name='bad', layers=[layer]))


def test_preview_preserves_alpha_and_never_overwrites(image, tmp_path):
    recipe = dict(version=1, name='Red', layers=[dict(effect='pixel/tint', color='#ff0000', amount=1)])
    original = image.read_bytes()
    a = apply_effect(image, tmp_path, recipe=recipe)
    b = apply_effect(image, tmp_path, recipe=recipe)
    assert a['outputs']['png'] != b['outputs']['png']
    assert image.read_bytes() == original
    pixels = np.asarray(Image.open(a['outputs']['png']))
    assert tuple(pixels[10, 12]) == (255, 0, 0, 255)
    assert pixels[0, 0, 3] == 0


def test_animation_decodes_and_sheet_frames_match(image, tmp_path):
    recipe = dict(version=1, name='Torch', fps=10, duration=1, loop=True, layers=[dict(effect='fire/torch')])
    result = apply_effect(image, tmp_path, recipe=recipe, format='sheet')
    atlas = json.loads(Path(result['outputs']['atlas']).read_text())
    sheet = Image.open(result['outputs']['sheet']).convert('RGBA')
    assert len(atlas['frames']) == 10
    rect = atlas['frames']['0006']['frame']
    frame = apply_effect(image, tmp_path, recipe=recipe, frame=6)
    assert sheet.crop((rect['x'], rect['y'], rect['x']+32, rect['y']+32)).tobytes() == Image.open(frame['outputs']['png']).tobytes()
    animation = Image.open(apply_effect(image, tmp_path, recipe=recipe, format='gif')['outputs']['gif'])
    assert animation.n_frames == 10 and animation.size == (32, 32)
    assert animation.info['loop'] == 0
    for i in range(animation.n_frames):
        animation.seek(i)
        assert animation.info['duration'] == 100
        animation.convert('RGBA').load()


def test_effect_cli(image, tmp_path):
    result = subprocess.run([sys.executable, '-m', 'pixelsnap', 'effects', 'preview', str(image),
                             '--effect', 'pixel/outline', '-o', str(tmp_path)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert Path(json.loads(result.stdout)['outputs']['png']).exists()


def test_one_pixel_native_output_is_supported(tmp_path):
    p=tmp_path/'one.png'; Image.new('RGBA',(1,1),(10,20,30,255)).save(p)
    result=apply_effect(p,tmp_path,effect='pixel/tint')
    assert Image.open(result['outputs']['png']).size==(1,1)


def test_omitted_frame_uses_visible_midframe_but_zero_remains_explicit(image, tmp_path):
    automatic=apply_effect(image,tmp_path,effect='fire/torch')
    explicit=apply_effect(image,tmp_path,effect='fire/torch',frame=13)
    initial=apply_effect(image,tmp_path,effect='fire/torch',frame=0)
    assert automatic['frame']==13 and initial['frame']==0
    assert Image.open(automatic['outputs']['png']).tobytes()==Image.open(explicit['outputs']['png']).tobytes()


def test_no_node_has_actionable_error(monkeypatch):
    monkeypatch.setattr(shutil, 'which', lambda _: None)
    with pytest.raises(ValueError, match='Node.js 18'):
        list_effects()


def test_small_coarse_shape_uses_detail_fallback():
    im = Image.new('RGB', (132, 142), 'white')
    d = ImageDraw.Draw(im)
    d.ellipse((30, 15, 100, 90), fill='#56789a')
    d.rectangle((35, 85, 50, 125), fill='#253545')
    d.rectangle((75, 85, 90, 125), fill='#253545')
    for y in range(25, 75, 3): d.line((40, y, 88, y), fill='#9999bb')
    result = snap(im, Options())
    assert min(result.native.size) >= 16


def test_truly_coarse_nn_sprite_is_retained():
    a = np.random.default_rng(99).integers(0, 255, (8, 8, 3), dtype=np.uint8)
    im = Image.fromarray(a).resize((128, 128), Image.Resampling.NEAREST)
    grid = detect_grid(im)
    assert abs(grid.x.cell-16) < .04 and abs(grid.y.cell-16) < .04


def test_manual_coarse_pitch_is_respected(image):
    grid = detect_grid(image, cell=16)
    assert grid.x.cell == grid.y.cell == 16
