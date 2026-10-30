"""One dispatcher for installed scripts, python -m, and frozen builds."""
import argparse
import glob
import hashlib
import json
import os
import re
from pathlib import Path
import sys

from . import __version__
from .core import Options, snap
from .interface import envelope, failure, run_file, validate_artifacts
from .palettes import EXTRA_PALETTES

EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tif', '.tiff'}


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError(message)


def _parser():
    p = Parser(prog='pixelsnap snap', description='Recover a true pixel grid. Exit codes: 0 success, 1 input failure, 2 usage, 3 system, 130 interrupted.')
    p.add_argument('input', nargs='+', help='Files, folders, quoted globs, or - for stdin')
    p.add_argument('-o', '--output', default='out', help='Output directory, or - for one native PNG on stdout')
    p.add_argument('--recursive', action='store_true')
    mode = p.add_mutually_exclusive_group()
    mode.add_argument('--json', action='store_true')
    mode.add_argument('--jsonl', action='store_true')
    p.add_argument('--artifacts', help='Comma list: native,upscaled,comparison; snap defaults to native')
    p.add_argument('--overwrite', action='store_true')
    p.add_argument('--metadata-file', type=Path)
    p.add_argument('--debug', action='store_true')
    for name in ('cell', 'cell-y', 'offset-x', 'offset-y'):
        p.add_argument('--' + name, type=float)
    p.add_argument('--colors', type=int)
    p.add_argument('--preset', help='Named version, e.g. faithful, clean, icon32, retro')
    p.add_argument('--edge-cleanup', choices=['off', 'smart', 'strong'], default='smart')
    p.add_argument('--pack', nargs='?', const='', help='Write a folder or .zip (default: OUTPUT/STEM_pack)')
    p.add_argument('--svg', action='store_true', help='Also export native SVG')
    p.add_argument('--palette-files', action='store_true', help='Also export HEX and GPL palettes')
    p.add_argument('--palette', choices=['auto', 'custom', 'pico8', 'gameboy', *EXTRA_PALETTES], default='auto')
    p.add_argument('--target-size', type=int)
    p.add_argument('--fit', type=int)
    custom = p.add_mutually_exclusive_group()
    custom.add_argument('--custom-palette')
    custom.add_argument('--palette-file', type=Path)
    for name in ('dither', 'transparent', 'cleanup', 'no-drift'):
        p.add_argument('--' + name, action='store_true')
    p.add_argument('--scale', type=int, default=8)
    return p


def _files(inputs, recursive, output):
    found = []
    output = Path(output).resolve() if output != '-' else None
    for text in inputs:
        if text == '-':
            found.append(text)
            continue
        if glob.has_magic(text):
            parts = Path(text).parts
            first = next(i for i, part in enumerate(parts) if glob.has_magic(part))
            root = Path(*parts[:first]) if first else Path('.')
            pattern = str(Path(*parts[first:]))
            if '**' in parts and not recursive:
                raise ValueError('Recursive ** patterns require --recursive.')
            # pathlib does not follow directory symlinks for ** traversal.
            matches = sorted(root.glob(pattern))
        else:
            matches = [text]
        if not matches:
            raise ValueError(f'No inputs match: {text}')
        for item in matches:
            path = Path(item).resolve()
            if path.is_dir():
                if output == path:
                    raise ValueError('Output directory must differ from the input directory.')
                children = []
                for root, dirs, files in os.walk(path, followlinks=False):
                    dirs[:] = [d for d in sorted(dirs) if not (Path(root)/d).is_symlink() and (Path(root)/d).resolve() != output]
                    children.extend(Path(root)/f for f in sorted(files) if Path(f).suffix.lower() in EXTENSIONS and not (Path(root)/f).is_symlink())
                    if not recursive: break
                found.extend(str(p.resolve()) for p in children)
            else:
                found.append(str(path))
    found = list(dict.fromkeys(found))
    if not found:
        raise ValueError('No supported images found.')
    return found


def _stems(paths):
    used = set()
    stems = []
    for path in paths:
        stem = 'stdin' if path == '-' else Path(path).stem
        if stem.casefold() in used:
            stem = Path(path).name + '-' + hashlib.sha256(path.encode()).hexdigest()[:10]
        while stem.casefold() in used:
            stem += '_'
        used.add(stem.casefold())
        stems.append(stem)
    return stems


def _protect_sources(paths, stems, output, artifacts, metadata_file=None):
    sources = [Path(p).resolve() for p in paths if p != '-']
    if metadata_file and metadata_file.resolve() in sources:
        raise ValueError('The metadata sidecar would overwrite an input image.')
    if output == '-':
        return
    directory = Path(output).resolve()
    for stem in stems:
        names = {f'{stem}_info.json'.casefold()}
        names.update(f'{stem}_{kind}.png'.casefold() for kind in ('native', 'comparison') if kind in artifacts)
        for source in sources:
            if source.parent != directory:
                continue
            upscale = 'upscaled' in artifacts and re.fullmatch(re.escape(stem) + r'_x\d+\.png', source.name, re.IGNORECASE)
            if source.name.casefold() in names or upscale:
                raise ValueError(f'An export would overwrite input {source}. Choose a separate output directory.')


def gui():
    return main(['serve', *sys.argv[1:]])


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    structured = '--json' in argv or '--jsonl' in argv
    try:
        if '--version' in argv:
            print(json.dumps({'schema_version': 1, 'app_version': __version__}) if structured else __version__)
            return 0
        if not argv:
            argv = ['serve']
        if argv[0] == 'serve':
            from .app import main as serve
            return serve(argv[1:]) or 0
        if argv[0] == 'mcp':
            from .mcp_server import main as mcp_main
            return mcp_main(argv[1:]) or 0
        legacy = argv[0] != 'snap'
        args = _parser().parse_args(argv if legacy else argv[1:])
        palette_text = args.palette_file.read_text(encoding='utf-8-sig') if args.palette_file else args.custom_palette
        options = Options(cell=args.cell, cell_y=args.cell_y, offset_x=args.offset_x, offset_y=args.offset_y,
                          colors=args.colors, palette='custom' if palette_text is not None else args.palette,
                          transparent=args.transparent, cleanup=args.cleanup, scale=args.scale, drift=not args.no_drift,
                          target_size=args.target_size, fit=args.fit, custom_palette=palette_text, dither=args.dither, edge_cleanup=args.edge_cleanup)
        if args.preset:
            from dataclasses import asdict
            from .versions import get_preset
            overrides = asdict(options)
            flags = {token.split('=')[0] for token in argv if token.startswith('--')}
            for key, value in get_preset(args.preset)['options'].items():
                if '--'+key.replace('_', '-') not in flags:
                    overrides[key] = value
            if palette_text is not None:
                overrides['palette'] = 'custom'
            options = Options(**overrides)
        options.validate()
        artifacts = validate_artifacts(args.artifacts or ('native,upscaled,comparison' if legacy and args.output != '-' else 'native'))
        paths = _files(args.input, args.recursive, args.output)
        if '-' in paths and len(paths) != 1:
            raise ValueError('stdin requires exactly one input.')
        if args.output == '-' and (len(paths) != 1 or structured or artifacts != ('native',)):
            raise ValueError('Binary stdout requires one input, native only, and no --json/--jsonl.')
        if args.metadata_file and not (len(paths) == 1 and (paths[0] == '-' or args.output == '-')):
            raise ValueError('--metadata-file is for single-image stdin/stdout mode; directory exports include an info sidecar.')
        if (args.pack is not None or args.svg or args.palette_files) and ('-' in paths or args.output == '-'):
            raise ValueError('Pack/SVG/palette exports require file inputs and an output directory.')
        if args.pack and len(paths) != 1:
            raise ValueError('An explicit --pack destination requires exactly one input.')
        stems = _stems(paths)
        _protect_sources(paths, stems, args.output, artifacts, args.metadata_file)
        records = []
        for path, stem in zip(paths, stems):
            if path == '-' or args.output == '-':
                import time
                if os.name == 'nt':
                    import msvcrt
                    if path == '-':
                        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
                    if args.output == '-':
                        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
                from .core import save_result
                from .interface import error_code
                started = time.perf_counter()
                try:
                    source = path
                    if path == '-':
                        from .core import InputTooLarge
                        source = sys.stdin.buffer.read(25 * 1024 * 1024 + 1)
                        if len(source) > 25 * 1024 * 1024:
                            raise InputTooLarge('stdin image exceeds 25 MB.')
                    result = snap(source, options, artifacts=artifacts)
                    if args.output == '-':
                        result.native.save(sys.stdout.buffer, format='PNG')
                        sys.stdout.buffer.flush()
                        outputs = {'native': '-'}
                    else:
                        outputs = save_result(result, args.output, stem, overwrite=args.overwrite)
                    if args.metadata_file:
                        with args.metadata_file.open('w' if args.overwrite else 'x', encoding='utf-8') as f:
                            json.dump(result.metadata, f, indent=2)
                    record = dict(input=path, status='ok', outputs=outputs, metadata=result.metadata,
                                  timings_ms={'total': round((time.perf_counter()-started)*1000,3)}, error=None)
                except Exception as exc:
                    if args.debug: raise
                    record = failure(path, error_code(exc), str(exc))
            else:
                record = run_file(path, args.output, options, artifacts=artifacts, stem=stem, overwrite=args.overwrite)
            if record['status'] == 'ok' and (args.pack is not None or args.svg or args.palette_files):
                from .core import Result
                from .exports import save_pack, svg, palette_hex, palette_gpl
                from PIL import Image
                from .interface import error_code
                try:
                    # Export the already computed native image, never run recovery twice.
                    native_path = record['outputs'].get('native')
                    if native_path is None:
                        raise ValueError('Pack/SVG/palette exports require the native artifact.')
                    with Image.open(native_path) as image:
                        result_image = Result(image.convert('RGBA'), None, None, record['metadata'])
                    if args.pack is not None:
                        destination = args.pack or str(Path(args.output)/(stem+'_pack'))
                        from .exports import pack_files
                        pack_path = Path(destination).resolve()
                        targets = [pack_path] if pack_path.suffix.lower() == '.zip' else [pack_path/name for name in pack_files(result_image)]
                        if set(targets) & {Path(p).resolve() for p in paths}:
                            raise ValueError('Pack destination would overwrite an input.')
                        record['outputs']['pack'] = save_pack(result_image, destination, overwrite=args.overwrite)
                    extras = {}
                    if args.svg:
                        extras['svg'] = svg(result_image.native)
                    if args.palette_files:
                        extras['hex'] = palette_hex(record['metadata']['palette'])
                        extras['gpl'] = palette_gpl(record['metadata']['palette'])
                    for extension, content in extras.items():
                        destination = Path(args.output)/(stem+'.'+extension)
                        with destination.open('w' if args.overwrite else 'x', encoding='utf-8', newline='\n') as output_file:
                            output_file.write(content)
                        record['outputs'][extension] = str(destination.resolve())
                except Exception as exc:
                    record = failure(path, error_code(exc, writing=True), str(exc))
            records.append(record)
            if args.jsonl:
                print(json.dumps(dict(type='result', schema_version=1, app_version=__version__, **record), allow_nan=False), flush=True)
            elif not args.json:
                message = f"{path}: {record['metadata']['native_size']} pixels, {record['metadata']['colors']} colours" if record['status'] == 'ok' else f"ERROR {path}: {record['error']['message']}"
                print(message, file=sys.stderr, flush=True)
        result = envelope(records)
        if args.json:
            print(json.dumps(result, allow_nan=False))
        elif args.jsonl:
            print(json.dumps(dict(type='summary', schema_version=1, app_version=__version__, **result['summary'])))
        return 1 if result['summary']['failed'] else 0
    except (ValueError, TypeError) as exc:
        if structured:
            print(json.dumps(envelope([failure(None, 'invalid_options', str(exc))])))
        else:
            print(f'pixelsnap: {exc}', file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        return 130
    except Exception as exc:
        if '--debug' in argv:
            raise
        if structured:
            print(json.dumps(envelope([failure(None, 'system_error', str(exc))])))
        else:
            print(f'pixelsnap: {exc}', file=sys.stderr)
        return 3
