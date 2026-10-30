"""Loopback-only static test server with the site's built security headers."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
lines = (root/'_headers').read_text().splitlines()
headers = []
for line in lines[1:]:
    if not line.strip(): break
    key, value = line.strip().split(':', 1)
    headers.append((key, value.strip()))

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.webp': 'image/webp'}
    def __init__(self, *args, **kwargs): super().__init__(*args, directory=str(root), **kwargs)
    def end_headers(self):
        for key, value in headers: self.send_header(key, value)
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *args): pass

ThreadingHTTPServer(('127.0.0.1', 8843), Handler).serve_forever()
