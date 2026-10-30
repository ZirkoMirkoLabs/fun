import io
import json
from pathlib import Path
import subprocess
import sys

import pytest
from PIL import Image

from pixelsnap.cli import main
from pixelsnap.app import create_app
from test_regressions import bomb_png


def png():
    stream = io.BytesIO()
    Image.new('RGB', (24, 24), '#ef1234').save(stream, format='PNG')
    return stream.getvalue()


def test_batch_collision_and_refuse_overwrite(tmp_path, capsys):
    sources = []
    for name in ('a.jpg', 'a.png', 'a_png.png'):
        path = tmp_path / name
        Image.new('RGB', (24, 24)).save(path)
        sources.append(str(path))
    args = ['snap', *sources, '-o', str(tmp_path/'out'), '--json']
    assert main(args) == 0
    data = json.loads(capsys.readouterr().out)
    paths = [r['outputs']['native'] for r in data['results']]
    assert len(set(paths)) == 3
    assert all(Path(p).is_absolute() and Path(p).exists() for p in paths)
    assert main(args) == 1
    assert all(r['error']['code'] == 'output_exists' for r in json.loads(capsys.readouterr().out)['results'])


def test_bad_and_bomb_do_not_abort_batch(tmp_path, capsys):
    (tmp_path/'bad.png').write_bytes(b'bad')
    (tmp_path/'bomb.png').write_bytes(bomb_png())
    (tmp_path/'good.png').write_bytes(png())
    assert main(['snap', str(tmp_path/'*.png'), '-o', str(tmp_path/'out'), '--json']) == 1
    data = json.loads(capsys.readouterr().out)
    assert data['summary'] == {'succeeded': 1, 'failed': 2}
    assert {r['error']['code'] for r in data['results'] if r['error']} == {'unsupported_image', 'input_too_large'}


def test_json_usage_and_jsonl(tmp_path, capsys):
    assert main(['snap', 'foo', '--scale', '0', '--json']) == 2
    assert json.loads(capsys.readouterr().out)['results'][0]['error']['code'] == 'invalid_options'
    (tmp_path/'good.png').write_bytes(png())
    assert main(['snap', str(tmp_path/'good.png'), '-o', str(tmp_path/'out'), '--jsonl']) == 0
    lines = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    assert [x['type'] for x in lines] == ['result', 'summary']


def test_recursive_excludes_output(tmp_path, capsys):
    (tmp_path/'sub').mkdir()
    (tmp_path/'sub'/'good.png').write_bytes(png())
    out = tmp_path/'out'
    out.mkdir()
    (out/'previous.png').write_bytes(png())
    assert main(['snap', str(tmp_path), '--recursive', '-o', str(out), '--json']) == 0
    assert json.loads(capsys.readouterr().out)['summary']['succeeded'] == 1


def test_binary_stdin_stdout(tmp_path):
    result = subprocess.run([sys.executable, '-m', 'pixelsnap', 'snap', '-', '-o', '-', '--cell', '3'], input=png(), capture_output=True)
    assert result.returncode == 0, result.stderr
    assert Image.open(io.BytesIO(result.stdout)).size == (8, 8)


def test_http_cache_and_deferred_comparison(monkeypatch):
    import pixelsnap.app as module
    original = module.prepare_image
    calls = []
    def traced(*a, **kw):
        calls.append(True)
        return original(*a, **kw)
    monkeypatch.setattr(module, 'prepare_image', traced)
    client = create_app().test_client()
    def upload(**opts):
        return client.post('/api/process', data={'image': (io.BytesIO(png()), 'test.png'), 'defer_comparison': 'true', **opts})
    first = upload(scale='2').get_json()
    second = upload(scale='4', palette='gameboy').get_json()
    assert len(calls) == 1 and second['cache_hit']
    assert 'comparison' not in second
    response = client.get(second['comparison_url'])
    assert response.status_code == 200 and response.mimetype == 'image/png'
    assert client.get(first['comparison_url']).status_code == 404
    upload(cell='3')
    assert len(calls) == 2


@pytest.mark.parametrize('options', [{'scale': '0'}, {'drift': 'maybe'}, {'cleanup': 'yes'}, {'colors': '2.5'}])
def test_strict_http_options(options):
    response = create_app().test_client().post('/api/process', data={'image': (io.BytesIO(png()), 'x.png'), **options})
    assert response.status_code == 400


def test_http_limits_busy_and_schema():
    app = create_app()
    client = app.test_client()
    assert client.post('/api/process', data={'image': (io.BytesIO(bomb_png()), 'x.png')}).status_code == 413
    lock = app.extensions['pixelsnap_lock']
    with lock:
        response = client.post('/api/process')
        assert response.status_code == 429 and response.headers['Retry-After'] == '1'
    assert client.get('/api/missing').get_json()['code'] == 'http_404'
    response = client.post('/api/v1/snap', data={'image': (io.BytesIO(png()), 'x.png'), 'options': '{"cell":3}'})
    data = response.get_json()
    assert data['schema_version'] == 1 and data['results'][0]['metadata']['native_size'] == [8, 8]
    assert set(data['results'][0]['outputs']) == {'native'}


def test_concurrent_writers_reserve_destination(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from pixelsnap import snap, save_result
    result = snap(png())
    def write():
        try:
            save_result(result, tmp_path, 'same')
            return 'ok'
        except FileExistsError:
            return 'exists'
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(lambda _: write(), range(2)))
    assert sorted(statuses) == ['exists', 'ok']
    assert (tmp_path/'same_info.json').exists()


def test_request_body_limit_and_api_method():
    app = create_app()
    app.config['MAX_CONTENT_LENGTH'] = 100
    client = app.test_client()
    assert client.post('/api/process', data={'image': (io.BytesIO(png()), 'x.png')}).status_code == 413
    assert client.get('/api/process').get_json()['code'] == 'http_405'


def test_overwrite_never_replaces_another_input(tmp_path, capsys):
    first, second = tmp_path/'a.png', tmp_path/'a_native.png'
    first.write_bytes(png())
    second.write_bytes(png())
    before = second.read_bytes()
    assert main(['snap', str(first), str(second), '-o', str(tmp_path), '--overwrite', '--json']) == 2
    assert 'overwrite input' in json.loads(capsys.readouterr().out)['results'][0]['error']['message']
    assert second.read_bytes() == before
