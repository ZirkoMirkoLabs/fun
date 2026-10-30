"""Headless Chromium acceptance for every shipped example, at both widths."""
import argparse
import json
import re
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright, expect

p = argparse.ArgumentParser()
p.add_argument('--url', default='http://127.0.0.1:8836/fun/projects/pixelsnap/')
p.add_argument('--output', default='G:/tmp/pixelsnap-v3/browser')
args = p.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
report = []
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    for width in (1440, 390):
        context = browser.new_context(viewport={'width': width, 'height': 1000 if width == 1440 else 844})
        page = context.new_page()
        errors, requests = [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('request', lambda r: requests.append(r.url))
        page.add_init_script("window.cspErrors=[];document.addEventListener('securitypolicyviolation',e=>cspErrors.push(e.violatedDirective))")
        response = page.goto(args.url)
        assert response.status == 200 and response.headers.get('content-security-policy')
        examples = page.locator('[data-example]')
        assert examples.count() == 9
        assert page.locator('[data-example] img[loading=lazy]').count() == 9
        for i in range(9):
            button = examples.nth(i)
            name = button.get_attribute('data-example')
            button.click()
            expect(page.locator('#filename')).to_have_text(name)
            page.wait_for_function("() => document.querySelectorAll('.version:not(:disabled)').length===8 && document.querySelector('#working').hidden", timeout=120000)
            assert page.locator('#error').is_hidden(), page.locator('#error').inner_text()
            # Download the initial result (including the example's background option).
            page.locator('#scale').select_option('8')
            with page.expect_download() as download:
                page.locator('[data-export=png]').click()
            path = out / f'{width}-{name}-8x.png'
            download.value.save_as(path)
            with Image.open(path) as im:
                assert im.width % 8 == im.height % 8 == 0
                native_size = (im.width//8, im.height//8)
                if name.startswith(('e01_', 'e02_', 'e03_', 'e08_', 'e10_')):
                    assert im.convert('RGBA').getextrema()[3] == (0, 255), name
            if name.startswith('e03_'):
                # Transparent output must show the viewer checker, not the source.
                page.locator('#compare').fill('0')
                page.locator('#compare').dispatch_event('input')
                pixel = page.locator('#comparison').evaluate('''(c, size) => {
                    const r=c.getBoundingClientRect(),s=Math.min((r.width-48)/size[0],(r.height-48)/size[1]);
                    const x=(r.width-size[0]*s)/2+size[0]*s*.9,y=(r.height-size[1]*s)/2+size[1]*s*.05;
                    return Array.from(c.getContext('2d').getImageData(Math.floor(x*c.width/r.width),Math.floor(y*c.height/r.height),1,1).data);
                }''', native_size)
                assert max(pixel[:3]) < 50, pixel
                page.locator('#compare').fill('40')
                page.locator('#compare').dispatch_event('input')
            page.screenshot(path=str(out / f'{width}-{name}.png'), full_page=True)
            page.locator('#scale').select_option('1')
            for v in range(8):
                tile = page.locator('.version').nth(v)
                tile.click()
                assert tile.get_attribute('aria-pressed') == 'true'
                dims = tuple(map(int, re.search(r'(\d+)\D+(\d+)', tile.locator('small').inner_text()).groups()))
                with page.expect_download() as download:
                    page.locator('[data-export=png]').click()
                path = out / f'{width}-{name}-v{v}.png'
                download.value.save_as(path)
                with Image.open(path) as im:
                    assert im.size == dims
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'horizontal page overflow'
            report.append({'width': width, 'example': name, 'versions': 8, 'downloads': 9})
            print(width, name, '8 versions, 9 valid PNG downloads', flush=True)
        assert not errors, errors
        assert not page.evaluate('cspErrors')
        from urllib.parse import urlsplit
        host = urlsplit(args.url).netloc
        assert all(urlsplit(url).netloc in ('', host) for url in requests), requests
        context.close()
    browser.close()
(out / 'report.json').write_text(json.dumps({'checks': report, 'console_errors': 0, 'csp_errors': 0, 'third_party_requests': 0}, indent=2))
