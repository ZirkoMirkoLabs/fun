"""Named option bundles. presets.json is also imported by the browser worker."""
from dataclasses import asdict
import json
from pathlib import Path

PRESETS = json.loads(Path(__file__).with_name('presets.json').read_text(encoding='utf-8'))


def list_presets():
    return json.loads(json.dumps(PRESETS))


def get_preset(name):
    if not isinstance(name, str):
        raise ValueError('Preset must be a name.')
    key = ''.join(c for c in name.lower() if c.isalnum())
    for preset in PRESETS:
        if key in (preset['name'], ''.join(c for c in preset['label'].lower() if c.isalnum())):
            return preset
    raise ValueError(f'Unknown preset: {name}')


def variants(image, presets=None, options=None):
    """Detect once; cache sampling by grid and reuse it across all option bundles.

    Returns [{preset, label, native (Pillow RGBA), width, height, palette, meta}].
    No filesystem writes. Target presets resample the source without detection.
    Base options are an Options instance or mapping; presets override only their keys.
    """
    from .core import Options, prepare_image, process_image
    selected = [get_preset(name) for name in presets] if presets is not None else PRESETS
    if not selected:
        return []
    base = asdict(options) if isinstance(options, Options) else dict(options or {})
    Options(**base).validate()
    faithful_options = Options(**{**base, **get_preset('faithful')['options']})
    recovered = prepare_image(image, faithful_options)
    # All current presets use smart/strong, which share the same sampling pass.
    cache = {faithful_options.target_size: recovered}
    results = []
    faithful = None
    for preset in selected:
        if preset['name'] in ('faithful', 'clean') and faithful is None:
            faithful = process_image(None, faithful_options,
                                     artifacts=('native',), prepared=recovered)
        values = {**base, **preset['options']}
        if preset['name'] == 'clean':
            values['colors'] = max(2, min(values['colors'], len(faithful.metadata['palette'])))
        options = Options(**values)
        target = options.target_size
        if target not in cache:
            cache[target] = prepare_image(recovered[0], options)
        result = faithful if preset['name'] == 'faithful' else process_image(
            None, options, artifacts=('native',), prepared=cache[target])
        results.append(dict(preset=preset['name'], label=preset['label'], native=result.native,
                            width=result.native.width, height=result.native.height,
                            palette=result.metadata['palette'], meta=result.metadata))
    return results
