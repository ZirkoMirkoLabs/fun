"""Standard-library-only bootstrap; invoked by uv-managed Python 3.12."""
import contextlib
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time


@contextlib.contextmanager
def setup_lock(path):
    with path.open('a+b') as stream:
        stream.seek(0)
        stream.write(b'0')
        stream.flush()
        deadline = time.monotonic() + 180
        while True:
            stream.seek(0)
            try:
                if os.name == 'nt':
                    import msvcrt
                    msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if time.monotonic() > deadline:
                    raise RuntimeError('Another PixelSnap setup is still running. Retry after it completes.')
                time.sleep(.2)
        try:
            yield
        finally:
            stream.seek(0)
            if os.name == 'nt':
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream, fcntl.LOCK_UN)


def main():
    source = Path(__file__).resolve().parent
    uv = os.environ.get('PIXELSNAP_UV') or shutil.which('uv')
    if not uv:
        raise RuntimeError('uv was not found. Install it from https://docs.astral.sh/uv/getting-started/installation/ and retry.')
    base = Path(os.environ.get('LOCALAPPDATA') or os.environ.get('XDG_CACHE_HOME') or Path.home()/'.cache') / 'PixelSnap'
    base.mkdir(parents=True, exist_ok=True)
    identity = hashlib.sha256(str(source).encode()).hexdigest()[:16]
    root = (base / identity).resolve()
    root.mkdir(exist_ok=True)
    environment = root / 'environment'
    python = environment / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    files = [source/'pyproject.toml', source/'requirements.txt'] + sorted((source/'pixelsnap').rglob('*.py')) + sorted((source/'pixelsnap'/'static').glob('*'))
    digest = hashlib.sha256(sys.version.encode())
    for path in files:
        if path.is_file():
            digest.update(str(path.relative_to(source)).encode())
            digest.update(path.read_bytes())
    expected = digest.hexdigest()
    marker = root / 'ready.sha256'
    with setup_lock(root/'setup.lock'):
        valid = False
        if python.exists() and marker.exists() and marker.read_text() == expected:
            check = subprocess.run([str(python), '-c', 'import sys,numpy,PIL,scipy,flask,waitress,pixelsnap; print(sys.version)'], cwd=root, capture_output=True, text=True)
            valid = check.returncode == 0 and check.stdout.strip() == sys.version
        if not valid:
            print('Preparing PixelSnap. First setup requires internet access.', file=sys.stderr, flush=True)
            marker.unlink(missing_ok=True)
            if environment.exists():
                # Only this app-owned cache directory may be removed.
                target = environment.resolve()
                if target.parent != root or target.name != 'environment' or not target.is_relative_to(base.resolve()):
                    raise RuntimeError('Unsafe cache path; refusing environment recreation.')
                shutil.rmtree(target)
            subprocess.run([uv, 'venv', '--python', sys.executable, str(environment)], check=True)
            with tempfile.TemporaryDirectory(prefix='pixelsnap-install-') as temporary:
                package = Path(temporary)/'source'
                package.mkdir()
                for name in ('pyproject.toml', 'README.md', 'LICENSE'):
                    shutil.copy2(source/name, package/name)
                shutil.copytree(source/'pixelsnap', package/'pixelsnap', ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
                subprocess.run([uv, 'pip', 'install', '--python', str(python), str(package) + '[web]'], check=True)
            marker.write_text(expected)
    args = sys.argv[1:]
    if not args or (args[0].startswith('-') and args[0] not in ('--version', '--help')):
        args = ['serve', *args]
    return subprocess.call([str(python), '-m', 'pixelsnap', *args], cwd=source)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f'PixelSnap setup failed: {exc}\nCheck internet/proxy/certificate access to astral.sh and PyPI, then rerun. Existing successful installs work offline.', file=sys.stderr)
        raise SystemExit(3)
