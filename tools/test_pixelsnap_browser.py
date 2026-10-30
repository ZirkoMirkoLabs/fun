"""Playwright upload/palette/grid/export and CSP checks against local or live site."""
import argparse, json, struct, time
from pathlib import Path
from urllib.parse import urlsplit
from PIL import Image
from playwright.sync_api import sync_playwright, expect

parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8807');parser.add_argument('--output',default='G:/tmp/pixelsnap-web');args=parser.parse_args()
ROOT=Path(__file__).resolve().parents[1];SOURCE=ROOT.parent/'pixelsnap/samples/input';out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
records=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for name,width,height in [('desktop',1440,1000),('phone',390,844)]:
        context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1,accept_downloads=True)
        context.add_init_script("window.cspErrors=[];addEventListener('securitypolicyviolation',e=>window.cspErrors.push(e.violatedDirective+' '+e.blockedURI));")
        page=context.new_page();errors=[];external=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m: errors.append(m.text) if m.type=='error' else None)
        page.on('request',lambda r:external.append(r.url) if urlsplit(r.url).scheme in ('http','https') and urlsplit(r.url).netloc!=urlsplit(args.url).netloc else None)
        response=page.goto(args.url+'/fun/projects/pixelsnap/',wait_until='networkidle');assert response.status==200
        started=time.perf_counter();page.locator('#file').set_input_files(str(SOURCE/'09_sprite_5_5x.jpg'));expect(page.locator('#download')).to_be_enabled(timeout=20000)
        first_ms=(time.perf_counter()-started)*1000
        expect(page.locator('#dimensions')).to_contain_text('32 × 32');first_status=page.locator('#status').inner_text()
        page.locator('#palette').select_option('gameboy');expect(page.locator('#status')).to_contain_text('4 colours');expect(page.locator('#download')).to_be_enabled()
        page.locator('#targetSize').select_option('48');expect(page.locator('#dimensions')).to_contain_text('48 × 48');expect(page.locator('#download')).to_be_enabled()
        page.locator('#scale').select_option('4')
        with page.expect_download() as download:page.locator('#download').click()
        dest=out/(name+'-download.png');download.value.save_as(str(dest))
        im=Image.open(dest).convert('RGBA');assert im.size==(192,192);assert len(im.getcolors(100000))<=4
        native=im.resize((48,48),Image.Resampling.NEAREST);assert im.tobytes()==native.resize(im.size,Image.Resampling.NEAREST).tobytes()
        page.locator('#palette').select_option('custom');page.locator('#customPalette').fill('#000000, #ffffff');expect(page.locator('#status')).to_contain_text('2 colours');expect(page.locator('#download')).to_be_enabled()
        page.locator('#paletteFile').set_input_files({'name':'test.gpl','mimeType':'text/plain','buffer':b'GIMP Palette\nName: Test\n0 0 0 Black\n255 255 255 White\n'});expect(page.locator('#download')).to_be_enabled()
        page.locator('#dither').check();page.locator('#transparent').check();page.locator('#cleanup').check();expect(page.locator('#download')).to_be_enabled();expect(page.locator('#error')).to_be_hidden()
        # Invalid encoded geometry must fail without starting a decoder.
        bomb=b'\x89PNG\r\n\x1a\n'+struct.pack('>I',13)+b'IHDR'+struct.pack('>II',30000,30000)
        page.locator('#file').set_input_files({'name':'oversized.png','mimeType':'image/png','buffer':bomb});expect(page.locator('#error')).to_contain_text('16 megapixels');expect(page.locator('#download')).to_be_disabled()
        page.locator('#reset').click();page.get_by_role('button',name='Teapot',exact=True).click();expect(page.locator('#download')).to_be_enabled(timeout=20000);expect(page.locator('#error')).to_be_hidden()
        page.locator('#compare').fill('48');page.locator('#scale').select_option('8');page.screenshot(path=str(out/(name+'.png')),full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'horizontal overflow'
        csp=page.evaluate('window.cspErrors');assert not errors,errors;assert not csp,csp;assert not external,external
        records.append(dict(viewport=name,width=width,firstUploadWallMs=round(first_ms),firstStatus=first_status,finalStatus=page.locator('#status').inner_text(),consoleErrors=errors,cspErrors=csp,externalRequests=external,download=str(dest)))
        context.close()
    context=browser.new_context();page=context.new_page();page.goto(args.url+'/fun/projects/',wait_until='networkidle');expect(page.get_by_role('link',name='PixelSnap',exact=True)).to_be_visible();context.close();browser.close()
(out/'browser-results.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
print(json.dumps(records,indent=2))
