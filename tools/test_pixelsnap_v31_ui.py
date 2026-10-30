"""PixelSnap v3.1 browser regressions: real worker, controls, thumbnails and PNGs."""
import argparse, base64, json, mimetypes, re
from pathlib import Path
from urllib.parse import urlsplit
from PIL import Image
from playwright.sync_api import sync_playwright, expect

p=argparse.ArgumentParser()
p.add_argument('--url',default='https://zirkomirko.com/fun/projects/pixelsnap/')
p.add_argument('--output',default='G:/tmp/pixelsnap-v31/live')
p.add_argument('--local-root',type=Path)
p.add_argument('--widths',type=int,nargs='+',default=[1440,390])
a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
report=[]
def ready(page):
    page.wait_for_function("() => document.querySelectorAll('.version:not(:disabled)').length===8 && document.querySelector('#working').hidden",timeout=120000)
def count(page):
    n=page.locator('#swatches button').count()
    assert int(re.search(r'(\d+) colours$',page.locator('#gridInfo').inner_text())[1])==n
    titles=page.locator('#swatches button').evaluate_all('(bs)=>bs.map(b=>b.title)')
    assert len(set(titles))==n
    return sorted(titles)
def reference(page,name,base):
    return page.evaluate('''async ({name,base})=>{
      const worker=new Worker(new URL('./worker.mjs',location.href),{type:'module'});
      let id=0;
      const call=payload=>new Promise((resolve,reject)=>{
        worker.onmessage=({data:m})=>m.error?reject(Error(m.error)):resolve(m);
        worker.onerror=()=>reject(Error('Reference worker failed'));
        worker.postMessage({...payload,id:++id});
      });
      const encode=data=>btoa(Array.from(data,c=>String.fromCharCode(c)).join(''));
      try{
        const m=await call({type:'variants',blob:await(await fetch('./examples/'+name)).blob(),options:base});
        const result=[];
        for(const r of m.results){
          const s=(await call({type:'snap',options:r.meta.options})).result;
          const bytes=new Uint8ClampedArray(r.rgba);
          if(encode(s.data)!==encode(bytes)||JSON.stringify(s.palette)!==JSON.stringify(r.palette))throw Error(r.preset+' tile/snap mismatch');
          const source=document.createElement('canvas');source.width=r.width;source.height=r.height;
          source.getContext('2d').putImageData(new ImageData(bytes,r.width,r.height),0,0);
          const thumb=document.createElement('canvas');thumb.width=120;thumb.height=80;
          const ctx=thumb.getContext('2d'),scale=Math.min(120/r.width,80/r.height);
          ctx.imageSmoothingEnabled=false;ctx.drawImage(source,(120-r.width*scale)/2,(80-r.height*scale)/2,r.width*scale,r.height*scale);
          result.push({preset:r.preset,width:r.width,height:r.height,palette:r.palette,rgba:encode(bytes),thumbnail:thumb.toDataURL(),options:r.meta.options});
        }
        return result;
      }finally{worker.terminate();}
    }''',dict(name=name,base=base))
def selected(page,ref,path):
    assert count(page)==sorted(ref['palette'])
    assert page.locator('#transparent').is_checked()==ref['options']['transparent']
    assert page.locator('#dither').is_checked()==ref['options']['dither']
    assert page.locator('#cleanup').is_checked()==ref['options']['cleanup']
    page.locator('#scale').select_option('1')
    with page.expect_download() as item:page.locator('[data-export=png]').click()
    item.value.save_as(path)
    with Image.open(path) as im:
        im=im.convert('RGBA')
        assert im.size==(ref['width'],ref['height'])
        assert im.tobytes()==base64.b64decode(ref['rgba']),path
        actual=sorted({'#%02x%02x%02x'%tuple(px[:3]) for px in im.getdata() if px[3]})
        assert actual==sorted(ref['palette'])

with sync_playwright() as pw:
    browser=pw.chromium.launch()
    for width in a.widths:
        context=browser.new_context(viewport={'width':width,'height':1000 if width==1440 else 844})
        if a.local_root:
            root=a.local_root.resolve()
            def local(route):
                relative=urlsplit(route.request.url).path.split('/fun/projects/pixelsnap/',1)[1] or 'index.html'
                path=(root/relative).resolve()
                assert path.is_relative_to(root)
                if not path.is_file():return route.continue_()
                if relative=='index.html':route.fulfill(response=route.fetch(),body=path.read_bytes())
                else:route.fulfill(body=path.read_bytes(),content_type='text/javascript' if path.suffix=='.mjs' else mimetypes.guess_type(path)[0] or 'application/octet-stream')
            context.route('**/fun/projects/pixelsnap/**',local)
        page=context.new_page();errors=[];failed=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
        page.on('response',lambda r:failed.append((r.status,r.url)) if r.status>=400 else None)
        page.add_init_script("window.cspErrors=[];document.addEventListener('securitypolicyviolation',e=>cspErrors.push(e.violatedDirective))")
        response=page.goto(a.url)
        assert response.status==200 and response.headers.get('content-security-policy')
        examples=page.locator('[data-example]');assert examples.count()==9
        for i in range(9):
            name=examples.nth(i).get_attribute('data-example')
            examples.nth(i).click();expect(page.locator('#filename')).to_have_text(name);ready(page)
            assert page.locator('#error').is_hidden()
            initial=count(page)
            assert int(re.search(r'(\d+) colours$',page.locator('.version').nth(0).locator('small').inner_text())[1])==len(initial)
            if name.startswith('e01_'):
                assert 'Background removed.' in page.locator('#warning').inner_text()
                assert 'already had' not in page.locator('#warning').inner_text()
            page.screenshot(path=str(out/f'{width}-{name}.png'),full_page=True)
            for transparent in (False,True):
                page.locator('#transparent').set_checked(transparent);ready(page)
                base=dict(transparent=transparent,dither=False,cleanup=False,drift=True,edgeCleanup='smart')
                refs=reference(page,name,base)
                for j,ref in enumerate(refs):
                    tile=page.locator('.version').nth(j)
                    assert tile.locator('small').inner_text()==f"{ref['width']}×{ref['height']} · {len(ref['palette'])} colours"
                    assert tile.locator('canvas').evaluate('(c)=>c.toDataURL()')==ref['thumbnail']
                    tile.click();assert tile.get_attribute('aria-pressed')=='true'
                    selected(page,ref,out/f'{width}-{name}-{int(transparent)}-{j}.png')
                count(page)
            # Exercise other inherited toggles and preset precedence on the knight.
            if i==0:
                page.get_by_text('Fine-tune',exact=True).click()
                page.locator('#dither').check();ready(page)
                page.locator('#cleanup').check();ready(page)
                refs=reference(page,name,dict(transparent=True,dither=True,cleanup=True,drift=True,edgeCleanup='smart'))
                for j,ref in enumerate(refs):
                    page.locator('.version').nth(j).click()
                    selected(page,ref,out/f'{width}-{name}-sticky-{j}.png')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            report.append(dict(width=width,example=name,variants=16+(8 if i==0 else 0),palette=True,toggle=True))
            print(width,name,'tiles, toggles, palettes, PNG bytes passed',flush=True)
        assert not errors,errors
        assert not failed,failed
        assert not page.evaluate('cspErrors')
        context.close()
    browser.close()
(out/'report.json').write_text(json.dumps(dict(checks=report,console_errors=0,csp_errors=0,http_errors=0),indent=2))
