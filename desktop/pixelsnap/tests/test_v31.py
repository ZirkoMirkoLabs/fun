from unittest.mock import patch

import numpy as np
import pytest
from PIL import Image

from pixelsnap import Options, snap, variants
from pixelsnap import core


def sprite():
    a = np.full((48, 64, 4), 255, np.uint8)
    a[8:40, 8:56] = (20, 40, 120, 255)
    a[16:32, 16:48] = (230, 80, 30, 255)
    a[20:24, 24:28] = (255, 255, 255, 255)
    return Image.fromarray(a)


@pytest.mark.parametrize('transparent', [False, True])
@pytest.mark.parametrize('dither,cleanup', [(False, False), (True, True)])
def test_variants_inherit_toggles_match_snap_and_detect_once(transparent, dither, cleanup):
    base = Options(transparent=transparent, dither=dither, cleanup=cleanup,
                   edge_cleanup='off', drift=False)
    with patch.object(core, 'detect_grid', wraps=core.detect_grid) as detector:
        results = variants(sprite(), options=base)
    assert detector.call_count == 1
    for item in results:
        opts = item['meta']['options']
        assert opts['transparent'] == transparent
        assert opts['dither'] == dither and opts['drift'] is False
        assert opts['cleanup'] == (cleanup or item['preset'] == 'clean')
        assert opts['edge_cleanup'] == ('strong' if item['preset'] == 'clean' else 'smart')
        single = snap(sprite(), Options(**opts))
        np.testing.assert_array_equal(item['native'], single.native)
        assert item['meta']['warnings'] == single.metadata['warnings']
        a = np.asarray(item['native'])
        actual = sorted({'#%02x%02x%02x' % tuple(p[:3]) for p in a.reshape(-1, 4) if p[3]})
        assert item['palette'] == actual == single.metadata['palette']
        assert item['meta']['colors'] == len(actual)
        assert bool(np.any(a[..., 3] == 0)) == transparent


def test_variant_mapping_overrides_only_preset_keys():
    base = dict(transparent=True, target_size=48, colors=8, dither=True)
    results = variants(sprite(), options=base)
    assert base == dict(transparent=True, target_size=48, colors=8, dither=True)
    for item in results:
        single = snap(sprite(), Options(**item['meta']['options']))
        np.testing.assert_array_equal(item['native'], single.native)
        if item['preset'] not in ('icon32', 'sprite64', 'poster128'):
            assert item['width'] == 48


@pytest.mark.parametrize('edge,dither,cleanup', [('off', False, False), ('smart', False, True), ('strong', True, False)])
def test_palette_is_exact_visible_rgb_after_all_stages(edge, dither, cleanup):
    result = snap(sprite(), Options(transparent=True, edge_cleanup=edge,
                                   dither=dither, cleanup=cleanup, colors=4))
    a = np.asarray(result.native).reshape(-1, 4)
    actual = sorted({'#%02x%02x%02x' % tuple(p[:3]) for p in a if p[3]})
    assert result.metadata['palette'] == actual
    assert result.metadata['colors'] == len(actual)


def test_background_notice_tracks_original_source():
    result = snap(sprite(), Options(transparent=True))
    assert 'Background removed.' in result.metadata['warnings']
    assert 'Image already had transparency.' not in result.metadata['warnings']
    second = snap(result.native, Options(transparent=True, cell=1, offset_x=0, offset_y=0))
    assert 'Image already had transparency.' in second.metadata['warnings']
    assert second.metadata['background_removed'] is None
