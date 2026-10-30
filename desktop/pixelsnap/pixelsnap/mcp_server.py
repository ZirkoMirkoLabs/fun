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
    def snap_image(path: str, options: dict | None = None, artifacts: list[str] | None = None) -> dict:
        """Snap one local image inside input_root. Writes unique PNG/JSON artifacts inside output_root.

        path is absolute or relative to input_root. options uses PixelSnap Options keys
        (cell, cell_y, offsets, colors, palette, target_size, scale, fit, dither, etc.).
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
            return envelope([run_file(candidate, outputs, opts, artifacts=selected, stem=stem)])
        except (ValueError, TypeError) as exc:
            return envelope([failure(path, 'invalid_options', str(exc))])
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
