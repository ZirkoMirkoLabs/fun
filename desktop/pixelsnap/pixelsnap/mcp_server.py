"""Optional official MCP SDK adapter. Stdout belongs exclusively to MCP."""
from pathlib import Path
import threading
import uuid

from . import __version__
from .core import MAX_INPUT_PIXELS
from .interface import envelope, failure, options_from_mapping, run_file, validate_artifacts


def create_server(input_root, output_root):
    try:
        from mcp.server.fastmcp import FastMCP
    except ImportError as exc:
        raise RuntimeError('MCP support is optional. Install PixelSnap with the [mcp] extra.') from exc
    server = FastMCP('pixelsnap_mcp')
    inputs, outputs = Path(input_root).resolve(), Path(output_root).resolve()
    lock = threading.Lock()

    @server.tool(annotations={'readOnlyHint': True, 'destructiveHint': False, 'openWorldHint': False})
    def list_capabilities() -> dict:
        """Return allowed roots, image limits, artifact choices and default options."""
        from dataclasses import asdict
        from .core import Options
        return dict(schema_version=1, app_version=__version__, input_root=str(inputs), output_root=str(outputs),
                    max_input_pixels=MAX_INPUT_PIXELS, artifacts=['native', 'upscaled', 'comparison'], options=asdict(Options()))

    @server.tool(annotations={'readOnlyHint': False, 'destructiveHint': False, 'idempotentHint': False, 'openWorldHint': False})
    def snap_image(path: str, options: dict | None = None, artifacts: list[str] | None = None, include_image: bool = False):
        """Snap one local image inside input_root. Writes unique PNG/JSON artifacts inside output_root.

        path is absolute or relative to input_root. options uses PixelSnap Options keys
        (preset, edge_cleanup off|smart|strong, cell, cell_y, offsets, colors,
        palette, target_size, scale, fit, dither, etc.). Explicit options override preset.
        artifacts defaults to native; optional upscaled/comparison renders cost more.
        Returns the same versioned JSON envelope as `pixelsnap snap --json`.
        """
        if not lock.acquire(blocking=False):
            return envelope([failure(path, 'busy', 'Another image is processing.', retryable=True)])
        try:
            candidate = Path(path)
            candidate = (candidate if candidate.is_absolute() else inputs / candidate).resolve()
            if not candidate.is_relative_to(inputs):
                return envelope([failure(str(candidate), 'forbidden_path', 'Input is outside the configured input root.')])
            opts = options_from_mapping({} if options is None else options)
            selected = validate_artifacts(['native'] if artifacts is None else artifacts)
            stem = candidate.stem + '-' + uuid.uuid4().hex[:12]
            result = envelope([run_file(candidate, outputs, opts, artifacts=selected, stem=stem)])
            if include_image and result['summary']['succeeded']:
                import base64
                import json
                from mcp.types import CallToolResult, TextContent, ImageContent
                native = result['results'][0]['outputs'].get('native')
                content = [TextContent(type='text', text=json.dumps(result))]
                if native:
                    content.append(ImageContent(type='image', mimeType='image/png', data=base64.b64encode(Path(native).read_bytes()).decode()))
                return CallToolResult(content=content, structuredContent=result)
            return result
        except (ValueError, TypeError) as exc:
            return envelope([failure(path, 'invalid_options', str(exc))])
        finally:
            lock.release()

    @server.tool(annotations={'readOnlyHint': True, 'openWorldHint': False})
    def list_presets() -> dict:
        """List the eight shared named option bundles, labels and descriptions."""
        from .versions import list_presets as definitions
        return {'presets': definitions()}

    @server.tool(annotations={'readOnlyHint': True, 'openWorldHint': False})
    def list_palettes() -> dict:
        """List built-in palettes and their hex colours, plus auto/custom modes."""
        from .core import PRESETS
        return {'modes': ['auto', 'custom'], 'palettes': [{'name': name, 'colors': ['#'+c for c in colors]} for name, colors in PRESETS.items()]}

    @server.tool(annotations={'readOnlyHint': False, 'destructiveHint': False, 'openWorldHint': False})
    def snap_variants(path: str, presets: list[str] | None = None) -> dict:
        """Detect the grid once and export selected versions (default all eight).

        Same path policy as snap_image. Each result includes preset, label,
        native PNG and metadata paths, palette and processing metadata.
        """
        from .core import Result, save_result
        from .versions import variants
        from .interface import error_code
        import time
        if not lock.acquire(blocking=False):
            return envelope([failure(path, 'busy', 'Another image is processing.', retryable=True)])
        try:
            candidate = Path(path)
            candidate = (candidate if candidate.is_absolute() else inputs / candidate).resolve()
            if not candidate.is_relative_to(inputs):
                return envelope([failure(str(candidate), 'forbidden_path', 'Input is outside the configured input root.')])
            started = time.perf_counter()
            versions = variants(candidate, presets)
            processed = time.perf_counter()
            records = []
            for version in versions:
                result = Result(version['native'], None, None, version['meta'])
                stem = candidate.stem+'-'+version['preset']+'-'+uuid.uuid4().hex[:12]
                paths = save_result(result, outputs, stem)
                records.append(dict(input=str(candidate), status='ok', preset=version['preset'], label=version['label'],
                                    outputs=paths, metadata=version['meta'], palette=version['palette'], error=None,
                                    timings_ms={'all_variants_process': round((processed-started)*1000, 3)}))
            result = envelope(records)
            result['timings_ms'] = {'process': round((processed-started)*1000, 3), 'total': round((time.perf_counter()-started)*1000, 3)}
            return result
        except Exception as exc:
            return envelope([failure(path, error_code(exc), str(exc))])
        finally:
            lock.release()

    @server.tool(annotations={'readOnlyHint': False, 'destructiveHint': False, 'openWorldHint': False})
    def batch_snap(path: str, options: dict | None = None, recursive: bool = False) -> dict:
        """Snap a folder or glob inside input_root, isolating failures per file.

        Examples: sprites, sprites/*.png. Recursive ** needs recursive=true.
        Writes unique native PNG/JSON pairs; never overwrites existing outputs.
        """
        from .cli import _files
        from .interface import error_code
        if not lock.acquire(blocking=False):
            return envelope([failure(path, 'busy', 'Another image is processing.', retryable=True)])
        try:
            candidate = Path(path)
            candidate = (candidate if candidate.is_absolute() else inputs / candidate).resolve()
            if not candidate.is_relative_to(inputs):
                return envelope([failure(path, 'forbidden_path', 'Input is outside the configured input root.')])
            opts = options_from_mapping(options or {})
            files = _files([str(candidate)], recursive, str(outputs))
            records = []
            for file in files:
                source = Path(file).resolve()
                if not source.is_relative_to(inputs):
                    records.append(failure(file, 'forbidden_path', 'Input is outside the configured input root.'))
                    continue
                records.append(run_file(source, outputs, opts, stem=source.stem+'-'+uuid.uuid4().hex[:12]))
            return envelope(records)
        except Exception as exc:
            return envelope([failure(path, error_code(exc), str(exc))])
        finally:
            lock.release()

    return server


def main(argv=None):
    from .cli import Parser
    parser = Parser(description='PixelSnap MCP stdio server. Local paths only; no HTTP listener.')
    parser.add_argument('--input-root', type=Path, default=Path.cwd())
    parser.add_argument('--output-root', type=Path, default=Path.cwd() / 'out')
    args = parser.parse_args(argv)
    create_server(args.input_root, args.output_root).run(transport='stdio')
