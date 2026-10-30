from playwright.sync_api import sync_playwright, expect
from pathlib import Path
from PIL import Image
import io,json,zipfile,xml.etree.ElementTree as ET
import argparse,base64,re
from urllib.parse import urlsplit
parser=argparse.ArgumentParser()
parser.add_argument("--url",default="http://127.0.0.1:8826/fun/projects/pixelsnap/")
parser.add_argument("--output",default="G:/tmp/pixelsnap-v2/final")
args=parser.parse_args()
OUT=Path(args.output);OUT.mkdir(parents=True,exist_ok=True);URL=args.url
ORIGIN=urlsplit(URL).scheme+'://'+urlsplit(URL).netloc
SAMPLE=Path(__file__).resolve().parents[1]/'projects/pixelsnap/examples/teapot.webp'
report=[]
def ready(page):
 page.wait_for_function("() => document.querySelectorAll('.version:not(:disabled)').length===8 && document.querySelector('#working').hidden",timeout=60000)
def download(page,kind,name):
 with page.expect_download() as item:page.locator('[data-export="'+kind+'"]').click()
 item.value.save_as(OUT/name)
 return OUT/name
with sync_playwright() as p:
 browser=p.chromium.launch()
 for width in [1440,390]:
  ctx=browser.new_context(viewport={'width':width,'height':1000 if width==1440 else 844},permissions=['clipboard-read','clipboard-write'],device_scale_factor=1)
  page=ctx.new_page();errors=[];requests=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
  page.on('request',lambda r:requests.append(r.url))
  page.add_init_script("window.cspErrors=[];document.addEventListener('securitypolicyviolation',e=>cspErrors.push(e.violatedDirective))")
  response=page.goto(URL);assert response.status==200
  assert page.locator('#scale').input_value()=='8'
  page.locator('#file').set_input_files(str(SAMPLE));ready(page)
  assert page.locator('#filename').inner_text()=='teapot.webp'
  reference=page.evaluate("""async () => {
   const w=new Worker(new URL('./worker.mjs',location.href),{type:'module'});
   try {return await new Promise(async (resolve,reject)=>{
    w.onerror=()=>reject(Error('Reference worker failed'));
    w.onmessage=({data:m})=>m.error?reject(Error(m.error)):resolve(m.results.map(r=>({
     preset:r.preset,width:r.width,height:r.height,palette:r.palette,
     rgba:btoa(String.fromCharCode(...new Uint8Array(r.rgba)))})));
    w.postMessage({id:1,type:'variants',blob:await (await fetch('./examples/teapot.webp')).blob()});
   });}finally{w.terminate();}
  }""")
  assert len(reference[1]['palette'])<=len(reference[0]['palette'])
  page.locator('.version').nth(0).click()
  default=Image.open(download(page,'png',f'{width}-default-8x.png')).convert('RGBA')
  expected=Image.frombytes('RGBA',(reference[0]['width'],reference[0]['height']),base64.b64decode(reference[0]['rgba']))
  assert default.size==(expected.width*8,expected.height*8)
  assert default.tobytes()==expected.resize(default.size,Image.Resampling.NEAREST).tobytes()
  page.locator('#scale').select_option('1')
  for i in range(8):
   page.locator('.version').nth(i).click()
   assert page.locator('.version').nth(i).get_attribute('aria-pressed')=='true'
   tile=Image.open(download(page,'png',f'{width}-version-{i}.png')).convert('RGBA')
   assert tile.size==(reference[i]['width'],reference[i]['height'])
   assert tile.tobytes()==base64.b64decode(reference[i]['rgba']), reference[i]['preset']
   if i==1:assert page.locator('[name=edge]:checked').input_value()=='strong' and int(page.locator('#colors').input_value())<=16
   if i==2:assert page.locator('#targetSize').input_value()=='32'
   if i==4:assert page.locator('#palette').input_value()=='pico8'
  page.locator('.version').nth(0).focus();page.keyboard.press('ArrowRight');page.keyboard.press('Enter')
  assert page.locator('.version').nth(1).get_attribute('aria-pressed')=='true'
  for edge in ['off','smart','strong']:
   page.locator('[name=edge][value='+edge+']').check()
   page.wait_for_function("() => document.querySelector('#status').textContent.startsWith('Custom version ready') && document.querySelector('#working').hidden",timeout=60000)
  page.locator('.version').nth(2).click()
  for zoom in ['1','2','4','8','fit']:page.locator('#zoom').select_option(zoom)
  page.locator('#showGrid').check()
  page.locator('#comparison').scroll_into_view_if_needed();box=page.locator('#comparison').bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
  page.mouse.move(x,y);page.mouse.wheel(0,-150)
  expect(page.locator('#zoom')).to_have_value('custom')
  page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+25,y+20,steps=5);page.mouse.up()
  page.locator('#zoom').select_option('fit');page.locator('#touchup').click()
  page.locator('[data-tool=eraser]').click()
  page.locator('#scale').select_option('1')
  original=download(page,'png',f'{width}-original.png')
  page.locator('#comparison').scroll_into_view_if_needed();box=page.locator('#comparison').bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
  page.mouse.click(x,y)
  expect(page.locator('#undo')).to_be_enabled()
  edited=download(page,'png',f'{width}-edited.png')
  assert Image.open(original).tobytes()!=Image.open(edited).tobytes()
  page.locator('#comparison').focus();page.keyboard.press('Control+z')
  undone=download(page,'png',f'{width}-undone.png')
  assert Image.open(original).tobytes()==Image.open(undone).tobytes()
  page.locator('#comparison').focus();page.keyboard.press('Control+Shift+z')
  for kind,ext in [('png','png'),('transparent','png'),('svg','svg'),('pack','zip'),('gpl','gpl'),('hex','hex')]:
   path=download(page,kind,f'{width}-{kind}.{ext}')
   if ext=='png':Image.open(path).verify()
   elif ext=='svg':
    root=ET.parse(path).getroot();assert root.tag=='{http://www.w3.org/2000/svg}svg'
    raster=Image.new('RGBA',(int(root.attrib['width']),int(root.attrib['height'])))
    from PIL import ImageDraw,ImageColor
    draw=ImageDraw.Draw(raster)
    for rect in root:
     a=rect.attrib;x=int(a['x']);y=int(a['y']);w=int(a['width']);h=int(a['height'])
     draw.rectangle((x,y,x+w-1,y+h-1),fill=(*ImageColor.getrgb(a['fill']),round(float(a.get('fill-opacity','1'))*255)))
    assert raster.tobytes()==Image.open(edited).convert('RGBA').tobytes()
   elif ext=='zip':
    with zipfile.ZipFile(path) as z:
     assert z.testzip() is None
     native=[n for n in z.namelist() if n.endswith('native.png')][0]
     assert Image.open(io.BytesIO(z.read(native))).tobytes()==Image.open(edited).tobytes()
     assert len(z.namelist())==9
     for name in z.namelist():
      if name.endswith('.png'):
       im=Image.open(io.BytesIO(z.read(name)));im.load()
       if name.startswith('fit-'):assert max(im.size)==int(name.split('-')[1].split('.')[0])
       if name=='preview-8x.png':
        edited_im=Image.open(edited).convert('RGBA')
        assert im.tobytes()==edited_im.resize(im.size,Image.Resampling.NEAREST).tobytes()
      elif name.endswith('.svg'):ET.fromstring(z.read(name))
     assert z.read('palette.gpl').startswith(b'GIMP Palette')
     assert all(re.fullmatch('[0-9a-f]{6}',v) for v in z.read('palette.hex').decode().splitlines())
   elif ext=='gpl':assert path.read_text().startswith('GIMP Palette')
   elif ext=='hex':assert all(len(line.lstrip('#'))==6 for line in path.read_text().splitlines())
  page.locator('[data-export=copy]').click();expect(page.locator('#status')).to_contain_text('Image copied')
  clipboard=page.evaluate("async () => {const items=await navigator.clipboard.read();return items[0].types}")
  assert 'image/png' in clipboard
  clip=page.evaluate("async () => {const b=await (await navigator.clipboard.read())[0].getType('image/png');return btoa(String.fromCharCode(...new Uint8Array(await b.arrayBuffer())))}")
  assert Image.open(io.BytesIO(base64.b64decode(clip))).convert('RGBA').tobytes()==Image.open(edited).convert('RGBA').tobytes()
  page.locator('#paste').click();expect(page.locator('#filename')).to_have_text('clipboard.png');ready(page)
  page.locator('[data-example="teapot.webp"]').click();expect(page.locator('#filename')).to_have_text('teapot.webp');ready(page)
  page.locator('#comparison').focus();page.keyboard.press('Control+v');expect(page.locator('#filename')).to_have_text('clipboard.png');ready(page)
  page.locator('[data-example="teapot.webp"]').click();expect(page.locator('#filename')).to_have_text('teapot.webp');ready(page)
  page.locator('.version').nth(0).click()
  page.locator('#scale').select_option('8')
  page.locator('#showGrid').uncheck()
  page.locator('#comparison').scroll_into_view_if_needed()
  page.mouse.move(0,0);page.evaluate('() => window.scrollTo(0,0)')
  page.screenshot(path=str(OUT/('desktop.png' if width==1440 else 'phone.png')),full_page=True)
  page.locator('#versions').screenshot(path=str(OUT/f'versions-{width}.png'))
  page.locator('#touchup').click();page.locator('[data-tool=pencil]').click();page.locator('#zoom').select_option('8')
  page.locator('.result').screenshot(path=str(OUT/('touch-up.png' if width==1440 else 'touch-up-phone.png')))
  page.locator('#copyCommand').click();expect(page.locator('#copyCommand')).to_have_text('Copied')
  assert (page.evaluate('() => navigator.clipboard.readText()')).startswith('uvx --from')
  assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth')
  assert not errors,errors
  assert not page.evaluate('() => window.cspErrors')
  assert all(u.startswith((ORIGIN+'/', 'blob:')) for u in requests),requests
  assert page.locator('#error').is_hidden()
  report.append({'width':width,'passed':['upload','8 versions: exact worker RGBA match','default 8x: exact nearest-neighbour export','Clean <= Faithful colours','keyboard','3 edge modes','5 zooms','scroll zoom','drag pan','touch-up','undo/redo','6 downloads validated','copy image','paste button','Ctrl+V','copy command','no horizontal overflow'],'consoleErrors':errors,'CSP':page.evaluate('() => window.cspErrors'),'thirdPartyRequests':[],'url':URL})
  ctx.close()
 browser.close()
(OUT/'verification.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
