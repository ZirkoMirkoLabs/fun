"""Headless Chromium algorithm/worker acceptance. In-memory routing, no server."""
import json
from pathlib import Path
from urllib.parse import unquote, urlparse
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT.parent/'pixelsnap/samples/input'
DEST = Path('G:/tmp/pixelsnap-v2')
raw = {}
for file in sorted(SAMPLES.iterdir()):
    if file.suffix.lower() not in ('.png', '.jpg', '.jpeg'):
        continue
    with Image.open(file) as image:
        image = image.convert('RGBA')
        raw[file.name] = (image.size, image.tobytes())

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(service_workers='block')
    def route(request):
        path = unquote(urlparse(request.request.url).path)
        if path == '/':
            return request.fulfill(content_type='text/html', body='<html><title>PixelSnap core acceptance</title></html>')
        if path.startswith('/raw/'):
            return request.fulfill(content_type='application/octet-stream', body=raw[path[5:]][1])
        if path.startswith('/sample/'):
            file = SAMPLES/path[8:]
        else:
            file = (ROOT/path.lstrip('/')).resolve()
            if not file.is_relative_to(ROOT):
                return request.abort()
        if not file.is_file():
            return request.abort()
        mime = 'text/javascript' if file.suffix == '.mjs' else 'application/json' if file.suffix == '.json' else 'image/png' if file.suffix == '.png' else 'image/jpeg'
        request.fulfill(content_type=mime, body=file.read_bytes())
    context.route('**/*', route)
    page = context.new_page()
    page.goto('http://pixelsnap.test/')
    rows = []
    for file, (size, _) in raw.items():
        row = page.evaluate('''async ({file,size})=>{
          const {processImage,variants}=await import('/projects/pixelsnap/core.mjs');
          const data=new Uint8ClampedArray(await (await fetch('/raw/'+file)).arrayBuffer());
          const snaps=[],versions=[];let result;
          for(let i=0;i<3;i++){let t=performance.now();processImage(data,...size);snaps.push(performance.now()-t);t=performance.now();result=variants(data,...size);versions.push(performance.now()-t);}
          return {sample:file,snapMs:snaps.sort((a,b)=>a-b)[1],variantsMs:versions.sort((a,b)=>a-b)[1],variants:result.length};
        }''', {'file': file, 'size': size})
        rows.append(row)
        print(json.dumps(row), flush=True)
    contract = page.evaluate('''async()=>{
      const worker=new Worker('/projects/pixelsnap/worker.mjs',{type:'module'});let id=0;
      const ask=message=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Worker timed out')),30000);worker.onmessage=e=>{clearTimeout(timeout);e.data.error?reject(Error(e.data.error)):resolve(e.data);};worker.onerror=e=>{clearTimeout(timeout);reject(Error(e.message));};worker.postMessage({...message,id:++id});});
      try{const presets=await ask({type:'presets'});if(presets.presets.length!==8)throw Error('Preset count');
      const blob=await (await fetch('/sample/09_sprite_5_5x.jpg')).blob();const snap=await ask({type:'snap',blob,options:{edgeCleanup:'off'}});if(snap.result.width!==32)throw Error('Snap shape');
      const versions=await ask({type:'variants',presets:presets.presets.map(p=>p.name)});if(versions.results.length!==8||versions.results.some(r=>!(r.rgba instanceof ArrayBuffer)||r.rgba.byteLength!==r.width*r.height*4||!r.meta||!r.label||!r.palette))throw Error('Variants contract');
      const again=await ask({type:'snap',options:{edgeCleanup:'smart'}});if(again.result.data.length!==4096)throw Error('Detached cache');
      const legacy=await ask({options:{preset:'Icon 32'}});if(legacy.result.width!==32)throw Error('Legacy contract');
      return {presets:'passed',snap:'passed',variants:'8 passed',transfers:'passed',cache:'passed',legacy:'passed',workerVariantsMs:versions.ms};
      }finally{worker.terminate();}
    }''')
    browser.close()
    report = {'engine': 'Chromium', 'rows': rows, 'contract': contract}
    (DEST/'browser-benchmark.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(contract), flush=True)
