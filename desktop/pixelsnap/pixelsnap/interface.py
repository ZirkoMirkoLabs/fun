"""Shared strict options and the versioned CLI/HTTP/MCP result contract."""
from dataclasses import fields
from pathlib import Path
import time
from PIL import UnidentifiedImageError
from . import __version__
from .core import Options, InputTooLarge, snap, save_result

SCHEMA_VERSION = 1
ARTIFACTS = ('native', 'upscaled', 'comparison')


def options_from_mapping(values, *, form=False):
    if not isinstance(values, dict):
        raise ValueError('Options must be an object.')
    names = {f.name for f in fields(Options)}
    unknown = set(values) - names
    if unknown:
        raise ValueError('Unknown options: ' + ', '.join(sorted(unknown)))
    parsed = dict(values)
    if form:
        for name, value in list(parsed.items()):
            if value == '' and name not in ('custom_palette', 'palette'):
                del parsed[name]
                continue
            if name in ('transparent', 'cleanup', 'drift', 'dither'):
                value = value.lower()
                if value not in ('true', 'false', '1', '0', 'on', 'off'):
                    raise ValueError(f'{name} must be true or false.')
                parsed[name] = value in ('true', '1', 'on')
            elif name in ('colors', 'scale', 'target_size', 'fit'):
                parsed[name] = int(value)
            elif name in ('cell', 'cell_y', 'offset_x', 'offset_y'):
                parsed[name] = float(value)
    opts = Options(**parsed)
    opts.validate()
    return opts


def validate_artifacts(values):
    if isinstance(values, str):
        values = values.split(',')
    if not isinstance(values, (list, tuple)) or not values or any(v not in ARTIFACTS for v in values):
        raise ValueError('Artifacts must be native, upscaled, comparison (comma separated).')
    return tuple(dict.fromkeys(values))


def error_code(exc, writing=False):
    if isinstance(exc, InputTooLarge): return 'input_too_large'
    if isinstance(exc, FileExistsError): return 'output_exists'
    if isinstance(exc, FileNotFoundError): return 'input_not_found'
    if isinstance(exc, UnidentifiedImageError): return 'unsupported_image'
    if isinstance(exc, (ValueError, TypeError)): return 'invalid_options'
    if isinstance(exc, OSError): return 'output_write_failed' if writing else 'unsupported_image'
    return 'internal_error'


def failure(source, code, message, *, retryable=False):
    return dict(input=source, status='error', outputs={}, metadata=None, timings_ms={},
                error=dict(code=code, message=message, retryable=retryable))


def envelope(records):
    return dict(schema_version=SCHEMA_VERSION, app_version=__version__, results=records,
                summary=dict(succeeded=sum(r['status'] == 'ok' for r in records),
                             failed=sum(r['status'] != 'ok' for r in records)))


def run_file(path, output, options=None, *, artifacts=('native',), stem=None, overwrite=False):
    source = str(Path(path).resolve())
    started = time.perf_counter()
    writing = False
    try:
        result = snap(source, options, artifacts=validate_artifacts(artifacts))
        processed = time.perf_counter()
        writing = True
        outputs = save_result(result, output, stem or Path(path).stem, overwrite=overwrite)
        for key in list(outputs):
            if key.startswith('x') and key[1:].isdigit():
                outputs['upscaled'] = outputs.pop(key)
        ended = time.perf_counter()
        return dict(input=source, status='ok', outputs=outputs, metadata=result.metadata,
                    timings_ms=dict(process=round((processed-started)*1000,3), write=round((ended-processed)*1000,3), total=round((ended-started)*1000,3)), error=None)
    except Exception as exc:
        if error_code(exc, writing) == 'internal_error':
            import logging
            logging.exception('Unexpected PixelSnap failure for %s', source)
        record = failure(source, error_code(exc, writing), str(exc))
        record['timings_ms']['total'] = round((time.perf_counter()-started)*1000,3)
        return record
