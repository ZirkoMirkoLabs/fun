"""Loopback-only web app with bounded reconstruction cache."""
import argparse
import base64
import errno
import hashlib
import io
import json
import os
import socket
import threading
import time
import urllib.request
import webbrowser
from dataclasses import asdict

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

from . import __version__
from .core import InputTooLarge, MAX_INPUT_PIXELS, Options, comparison_image, prepare_image, process_image
from .interface import envelope, error_code, failure, options_from_mapping, validate_artifacts
from .palettes import EXTRA_PALETTES


def create_app():
    app = Flask(__name__, static_folder='static')
    app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024
    app.config['MAX_FORM_MEMORY_SIZE'] = 128 * 1024
    app.config['MAX_FORM_PARTS'] = 32
    work_lock = threading.Lock()
    cache = {}  # one source/grid; at most 20MP RGBA + 1MP sampled RGBA
    preview = {}
    app.extensions['pixelsnap_cache'] = cache
    app.extensions['pixelsnap_lock'] = work_lock

    def error(message, status, code):
        data = envelope([failure(None, code, message, retryable=status == 429)])
        data['error'] = message  # existing UI contract
        data['code'] = code
        response = jsonify(data)
        response.status_code = status
        if status == 429:
            response.headers['Retry-After'] = '1'
        return response

    @app.before_request
    def local_requests_only():
        host = request.host.partition(':')[0].lower()
        if host not in ('localhost', '127.0.0.1'):
            return error('Use the localhost address.', 403, 'forbidden_host')
        origin = request.headers.get('Origin')
        if request.method == 'POST' and origin and origin != request.host_url.rstrip('/'):
            return error('Cross-origin uploads are disabled.', 403, 'forbidden_origin')

    @app.after_request
    def headers(response):
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Content-Security-Policy'] = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
        return response

    @app.get('/')
    def index():
        return send_from_directory(app.static_folder, 'index.html')

    @app.get('/api/health')
    @app.get('/api/v1/health')
    def health():
        return jsonify(ok=True, app='PixelSnap', app_version=__version__, schema_version=1,
                       limits={'input_pixels': MAX_INPUT_PIXELS, 'upload_bytes': app.config['MAX_CONTENT_LENGTH']},
                       palettes=['auto', 'custom', 'pico8', 'gameboy', *EXTRA_PALETTES], options=asdict(Options()))

    def encode(im):
        stream = io.BytesIO()
        im.save(stream, format='PNG')
        return 'data:image/png;base64,' + base64.b64encode(stream.getvalue()).decode('ascii')

    @app.post('/api/process')
    @app.post('/api/v1/snap')
    def process():
        if not work_lock.acquire(blocking=False):
            return error('An image is still processing. Please try again in a moment.', 429, 'busy')
        started = time.perf_counter()
        try:
            if 'image' not in request.files:
                return error('Choose an image first.', 400, 'missing_image')
            versioned = request.path == '/api/v1/snap'
            if versioned:
                opts = options_from_mapping(json.loads(request.form.get('options', '{}')))
                artifacts = validate_artifacts(request.form.get('artifacts', 'native'))
                deferred = False
            else:
                values = request.form.to_dict()
                deferred_value = values.pop('defer_comparison', 'false').lower()
                if deferred_value not in ('true', 'false'):
                    raise ValueError('defer_comparison must be true or false.')
                deferred = deferred_value == 'true'
                opts = options_from_mapping(values, form=True)
                artifacts = ('native', 'upscaled') if deferred else ('native', 'upscaled', 'comparison')
            payload = request.files['image'].read()
            digest = hashlib.sha256(payload).hexdigest()
            sampling = tuple(getattr(opts, name) for name in ('cell', 'cell_y', 'offset_x', 'offset_y', 'target_size', 'drift'))
            key = (digest, sampling)
            hit = cache.get('key') == key
            if not hit:
                # Clear before allocating another large source.
                cache.clear()
                preview.clear()
                cache['prepared'] = prepare_image(io.BytesIO(payload), opts)
                cache['key'] = key
            result = process_image(None, opts, artifacts=artifacts, prepared=cache['prepared'])
            del payload
            images = {name: encode(getattr(result, name)) for name in artifacts}
            token = hashlib.sha256((digest + json.dumps(asdict(opts), sort_keys=True)).encode()).hexdigest()[:32]
            preview.clear()
            preview.update(token=token, original=cache['prepared'][0], native=result.native)
            elapsed = round((time.perf_counter()-started)*1000, 3)
            if versioned:
                record = dict(input=None, status='ok', outputs=images, metadata=result.metadata,
                              timings_ms={'total': elapsed}, error=None)
                return jsonify(envelope([record]))
            return jsonify(**images, comparison_url=f'/api/comparison/{token}' if deferred else None,
                           metadata=result.metadata, timings_ms={'total': elapsed}, cache_hit=hit)
        except InputTooLarge as exc:
            return error(str(exc), 413, exc.code)
        except HTTPException:
            raise
        except (ValueError, TypeError, OSError) as exc:
            return error(str(exc), 400, error_code(exc))
        except Exception:
            app.logger.exception('Processing failed')
            return error('Could not process this image.', 500, 'internal_error')
        finally:
            work_lock.release()

    @app.get('/api/comparison/<token>')
    def comparison(token):
        if not work_lock.acquire(blocking=False):
            return error('An image is still processing.', 429, 'busy')
        try:
            if token != preview.get('token'):
                return error('Preview expired. Process the image again.', 404, 'preview_expired')
            stream = io.BytesIO()
            comparison_image(preview['original'], preview['native']).save(stream, format='PNG')
            return app.response_class(stream.getvalue(), mimetype='image/png')
        finally:
            work_lock.release()

    @app.errorhandler(HTTPException)
    def http_error(exc):
        if exc.code == 413:
            return error('File is too large. Maximum upload: 25 MB.', 413, 'input_too_large')
        if request.path.startswith('/api/'):
            return error(exc.description, exc.code, 'http_' + str(exc.code))
        return exc

    return app


def main(argv=None):
    from .cli import Parser
    parser = Parser(description='Open the PixelSnap local app')
    parser.add_argument('--port', type=int, default=None, help='Default 18765 with automatic fallback; 0 selects a free port')
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--json', action='store_true', help='Emit a JSON ready event')
    args = parser.parse_args(argv)
    if args.port is not None and not 0 <= args.port <= 65535:
        raise ValueError('Port must be between 0 and 65535.')
    from waitress import create_server
    app = create_app()
    def bind(port):
        # Bind ourselves: Windows SO_REUSEADDR can otherwise share an occupied
        # port and send readiness probes to an unrelated older server.
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            if os.name == 'nt':
                listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            listener.bind(('127.0.0.1', port))
            return create_server(app, sockets=[listener], threads=2,
                                 connection_limit=16, max_request_body_size=26 * 1024 * 1024,
                                 inbuf_overflow=512 * 1024, channel_timeout=30)
        except Exception:
            listener.close()
            raise
    try:
        server = bind(18765 if args.port is None else args.port)
    except OSError as exc:
        if args.port is None and (exc.errno == errno.EADDRINUSE or getattr(exc, 'winerror', None) == 10048):
            server = bind(0)
        else:
            raise
    port = int(server.effective_port)
    url = f'http://127.0.0.1:{port}'
    stopped = threading.Event()
    def announce():
        for _ in range(200):
            if stopped.is_set(): return
            try:
                with urllib.request.urlopen(url + '/api/health', timeout=.5) as response:
                    if response.status != 200: continue
                if args.json:
                    print(json.dumps(dict(type='ready', schema_version=1, app_version=__version__, url=url, port=port, pid=os.getpid())), flush=True)
                else:
                    print(f'PixelSnap is ready: {url}\nKeep this window open. Press Ctrl+C to stop.', flush=True)
                if not args.no_browser:
                    webbrowser.open(url)
                return
            except OSError:
                stopped.wait(.05)
    threading.Thread(target=announce, daemon=True).start()
    try:
        server.run()
    except KeyboardInterrupt:
        pass
    finally:
        stopped.set()
        server.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
