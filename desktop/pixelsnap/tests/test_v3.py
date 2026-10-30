import numpy as np
from PIL import Image, ImageDraw
from pixelsnap import Options, snap
from pixelsnap.core import detect_grid
from pixelsnap.refine import checker_background, fallback_size, hud_evidence


def test_checkerboard_becomes_alpha_and_keeps_enclosed_highlight():
    y, x = np.indices((256, 256))
    a = np.full((256, 256, 4), 255, np.uint8)
    a[..., :3] = np.where((x//8+y//8) % 2, 210, 250)[..., None]
    a[64:192, 64:192] = (0, 30, 180, 255)
    a[100:120, 100:120] = (255, 255, 255, 255)
    b, found = checker_background(a)
    assert found and b[0, 0, 3] == 0 and b[110, 110, 3] == 255
    result = snap(Image.fromarray(a), Options(cell=8, offset_x=0, offset_y=0))
    assert np.asarray(result.native)[0, 0, 3] == 0
    assert 'checkerboard' in result.metadata['warnings'][0]


def test_neutral_gradient_is_not_checkerboard():
    a = np.full((256, 256, 4), 255, np.uint8)
    a[..., :3] = np.linspace(180, 255, 256).astype(np.uint8)[None, :, None]
    assert not checker_background(a)[1]


def test_white_sticker_halo_removed_but_eye_preserved():
    a = np.full((64, 64, 4), 255, np.uint8)
    a[12:52, 12:52, :3] = 190
    a[14:50, 14:50, :3] = 0
    a[20:25, 20:25, :3] = 255
    r = snap(Image.fromarray(a), Options(cell=1, offset_x=0, offset_y=0, transparent=True))
    b = np.asarray(r.native)
    assert b[12, 12, 3] == 0 and b[14, 14, 3] == 255 and b[22, 22, 3] == 255


def test_mixed_scale_aligned_glyphs_use_finer_grid():
    rng = np.random.default_rng(5)
    base = Image.fromarray(rng.integers(0, 160, (64, 64, 3), dtype=np.uint8))
    im = base.resize((512, 512), Image.Resampling.NEAREST)
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 511, 63), fill='#102050')
    for x in range(24, 280, 32):
        d.rectangle((x, 12, x+15, 35), fill='white')
        d.rectangle((x+4, 16, x+11, 31), fill='#102050')
    assert hud_evidence(np.asarray(im.convert('RGBA')), 8, 8)
    grid = detect_grid(im)
    assert grid.x.method == grid.y.method == 'regional'
    assert abs(grid.x.cell-4) < .05
    assert snap(im).native.width >= 127


def test_fallback_resolution_tracks_detail_and_discloses_it():
    flat = np.full((320, 512, 4), 255, np.uint8)
    noisy = flat.copy()
    noisy[..., :3] = np.random.default_rng(3).integers(0, 256, (320, 512, 3), dtype=np.uint8)
    assert fallback_size(flat) == 128 and fallback_size(noisy) == 192
    r = snap(Image.fromarray(noisy), Options(colors=16))
    assert r.native.width == 192 and abs(r.native.height/r.native.width-320/512) < .01
    assert r.metadata['grid']['x']['method'] == 'fallback'
    assert any(w.startswith('Fallback:') for w in r.metadata['warnings'])


def test_manual_grid_wins_over_hud_and_fallback():
    im = Image.new('RGB', (512, 320), 'white')
    r = snap(im, Options(cell=8, offset_x=0, offset_y=0))
    assert r.native.size == (64, 40) and r.metadata['grid']['x']['method'] == 'manual'


def test_background_toggle_invalidates_sampling_cache():
    import io
    from pixelsnap.app import create_app
    client = create_app().test_client()
    stream = io.BytesIO()
    Image.new('RGB', (64, 64), 'white').save(stream, format='PNG')
    def post(transparent):
        response = client.post('/api/process', data={'image': (io.BytesIO(stream.getvalue()), 'sprite.png'),
            'cell': '4', 'transparent': transparent})
        assert response.status_code == 200
        return response.get_json()
    assert not post('false')['cache_hit']
    assert post('false')['cache_hit']
    assert not post('true')['cache_hit']
    assert post('true')['cache_hit']
    assert not post('false')['cache_hit']
