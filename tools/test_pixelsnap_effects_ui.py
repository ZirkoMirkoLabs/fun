"""Real desktop/phone flows and independently decoded export bytes."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from PIL import Image
import base64
import io
import json
import zipfile
import argparse

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8843/fun/projects/pixelsnap/');p.add_argument('--output',default='G:/tmp/pixelsnap-effects-validation/browser');args=p.parse_args()
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
root=Path(__file__).resolve().parents[1]
recipe=root/'desktop/pixelsnap/effects-example.json'
bad=out/'bad.json';bad.write_text('{"version":1,"name":"bad","layers":[{"effect":"../../evil.mjs"}]}')
reports=[]

def download(page,selector,name):
    with page.expect_download() as d:page.locator(selector).click()
    dest=out/name;d.value.save_as(dest);return dest

def fx_differs(page,image):
    px=pixels(page)
    return bytes(px['data'])!=image.tobytes()

def pixels(page):
    return page.evaluate("""() => {const c=document.querySelector('#fxCanvas');return {width:c.width,height:c.height,data:Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data)};}""")

with sync_playwright() as p:
    browser=p.chromium.launch()
    for width,height in [(1440,1000),(390,844),(768,1000)]:
        context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1,reduced_motion='reduce',accept_downloads=True,permissions=['clipboard-read','clipboard-write'])
        page=context.new_page();errors=[];requests=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
        page.on('request',lambda r:requests.append(r.url))
        page.add_init_script("window.cspErrors=[];document.addEventListener('securitypolicyviolation',e=>cspErrors.push(e.violatedDirective))")
        page.goto(args.url)
        assert 'worker-src' in page.request.get(args.url).headers['content-security-policy']
        assert not any('/vendor/pixelfx-' in u for u in requests), 'Effects must load lazily'
        page.get_by_role('button',name='Knight',exact=True).click()
        expect(page.locator('.version:not(:disabled)')).to_have_count(8,timeout=60000)
        expect(page.locator('#working')).to_be_hidden()
        page.locator('#scale').select_option('1')
        original=Image.open(download(page,'#download',f'{width}-original.png')).convert('RGBA')
        # One click flow: an effect is already showing, with no panel to open or menu to use.
        assert page.locator('#fxPanel').evaluate("e=>e.tagName")=='SECTION'
        expect(page.locator('#fxApply')).to_be_enabled(timeout=30000)
        expect(page.locator('.fx-tile')).to_have_count(28)
        expect(page.locator('.fx-tile[aria-pressed=true]')).to_have_count(1)
        auto=page.locator('.fx-tile[aria-pressed=true]').get_attribute('data-fx')
        assert auto and auto!='', 'A real effect must be selected automatically'
        assert page.locator('#fxPlay').get_attribute('aria-pressed')=='false', 'Reduced motion must not autoplay'
        assert fx_differs(page,original), 'The automatic preview must visibly change the pixels'
        # Preview is non-destructive until Apply.
        assert Image.open(download(page,'#download',f'{width}-still-original.png')).convert('RGBA').tobytes()==original.tobytes()
        # Thumbnails are drawn from the visitor's image.
        # Poll from Python: wait_for_function needs eval, which the page's CSP correctly blocks.
        for _ in range(240):
            if page.evaluate("[...document.querySelectorAll('.fx-tile canvas')].slice(-1)[0].getContext('2d').getImageData(0,0,64,64).data.some(v=>v)"):break
            page.wait_for_timeout(250)
        else: raise AssertionError('Effect thumbnails did not finish')
        # Surprise changes effect in one click, within the same frame of reference.
        page.locator('#fxRandom').click()
        expect(page.locator('.fx-tile[aria-pressed=true]')).not_to_have_attribute('data-fx',auto)
        expect(page.locator('#fxApply')).to_be_enabled()
        # No effect recovers the plain pixels in one click.
        page.locator('.fx-tile[data-fx=""]').click()
        expect(page.locator('#fxApply')).to_be_disabled()
        assert not fx_differs(page,original), 'No effect must show the untouched pixels'
        # No effect stays selected, then filters narrow the tiles.
        expect(page.locator('.fx-tile[data-fx=""]')).to_have_attribute('aria-pressed','true')
        page.locator('#fxCategory').select_option('fire');expect(page.locator('.fx-tile:not([hidden])')).to_have_count(4)
        page.locator('#fxSearch').fill('torch');expect(page.locator('.fx-tile:not([hidden])')).to_have_count(2)
        page.locator('.fx-tile[data-fx="fire/torch"]').click()
        expect(page.locator('#fxId')).to_have_text('fire/torch')
        expect(page.locator('#fxApply')).to_be_enabled()
        page.locator('#fxAgent').click()
        copied=json.loads(page.evaluate('navigator.clipboard.readText()'))
        assert copied[0]['tool']=='preview_effect' and copied[0]['arguments']['effect']=='fire/torch'
        assert copied[1]['tool']=='apply_effect' and copied[1]['arguments']['format']=='gif'
        page.locator('#fxSearch').fill('');page.locator('#fxCategory').select_option('')
        expect(page.locator('.fx-tile:not([hidden])')).to_have_count(28)
        hero=page.locator('#fxFrame').input_value()
        assert page.locator('.fx-tile[aria-pressed=true]').count()==1
        assert page.locator('#fxPlay').get_attribute('aria-pressed')=='false'
        page.locator('#fxCanvas').scroll_into_view_if_needed()
        page.mouse.move(0,0)
        page.screenshot(path=str(out/f'{width}-effects.png'))
        if width==1440: page.screenshot(path=str(out/'1440-full-page.png'),full_page=True)
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        # Decode the actual files, compare PNG to sprite sheet and applied export.
        preview=Image.open(download(page,'#fxPNG',f'{width}-preview.png')).convert('RGBA')
        sheet_file=download(page,'#fxSheet',f'{width}-sheet.zip')
        with zipfile.ZipFile(sheet_file) as z:
            atlas=json.loads(z.read('sheet.json'));definition=json.loads(z.read('recipe.json'))
            sheet=Image.open(io.BytesIO(z.read('sheet.png'))).convert('RGBA')
        frame=atlas['frames'][hero.zfill(4)]['frame']
        expected=sheet.crop((frame['x'],frame['y'],frame['x']+frame['w'],frame['y']+frame['h']))
        assert preview.tobytes()==expected.tobytes(), 'Preview PNG must preserve full RGBA'
        page.locator('.fx-advanced summary').click()
        page.locator('#fxClip').check();expect(page.locator('#fxApply')).to_be_enabled()
        clipped=Image.open(download(page,'#fxPNG',f'{width}-clipped.png')).convert('RGBA')
        assert clipped.getchannel('A').tobytes()==original.getchannel('A').tobytes()
        page.locator('#fxClip').uncheck();expect(page.locator('#fxApply')).to_be_enabled()
        gif=Image.open(download(page,'#fxGIF',f'{width}-animation.gif'))
        assert gif.n_frames==30 and gif.size==original.size and gif.info['loop']==0
        for i in range(gif.n_frames):gif.seek(i);gif.convert('RGBA').load()
        page.locator('#fxPlay').click();expect(page.locator('#fxFrame')).not_to_have_value(hero)
        page.locator('#fxPlay').click();assert page.locator('#fxPlay').get_attribute('aria-pressed')=='false'
        page.locator('#fxFrame').fill(hero);page.locator('#fxFrame').dispatch_event('input')
        expect(page.locator('#fxTime')).to_have_text(f'Frame {int(hero)+1} / 30')
        page.locator('#fxApply').click()
        expect(page.locator('#fxUndoApply')).to_be_visible()
        assert page.locator('.fx-tile[aria-pressed=true]').count()==0, 'Apply must not auto-stack another effect'
        applied=Image.open(download(page,'#download',f'{width}-applied.png')).convert('RGBA')
        assert applied.tobytes()==preview.tobytes()
        page.locator('#fxUndoApply').click();expect(page.locator('#fxApply')).to_be_enabled()
        expect(page.locator('#fxId')).to_have_text('fire/torch')
        restored=Image.open(download(page,'#download',f'{width}-undo-apply.png')).convert('RGBA')
        assert restored.tobytes()==original.tobytes(), 'Undo apply must restore exact pixels'
        page.locator('#fxApply').click();expect(page.locator('#fxUndoApply')).to_be_visible()
        page.locator('#touchup').click();page.locator('#undo').click()
        expect(page.locator('#fxUndoApply')).to_be_hidden()
        undone=Image.open(download(page,'#download',f'{width}-undo.png')).convert('RGBA')
        assert undone.tobytes()==original.tobytes()
        page.locator('#redo').click()
        redone=Image.open(download(page,'#download',f'{width}-redo.png')).convert('RGBA')
        assert redone.tobytes()==preview.tobytes()
        page.locator('#fxImport').set_input_files(str(recipe))
        expect(page.locator('#fxName')).to_have_text('Emerald sparks')
        expect(page.locator('#fxStatus')).to_contain_text('2 layers')
        page.locator('#fxAgent').click()
        copied=json.loads(page.evaluate('navigator.clipboard.readText()'))
        assert len(copied[0]['arguments']['recipe']['layers'])==2
        assert isinstance(copied[0]['arguments']['recipe']['loop'],bool)
        page.locator('#fxImport').set_input_files(str(bad))
        expect(page.locator('#fxStatus')).to_contain_text('Unknown effect ID')
        # Keyboard controls and native focus work.
        page.locator('#fxPlay').focus();page.keyboard.press('Tab')
        assert page.evaluate("document.activeElement.id")=='fxFrame'
        page.locator('#fxCanvas').scroll_into_view_if_needed()
        page.screenshot(path=str(out/f'{width}-recipe.png'))
        page.locator('footer').scroll_into_view_if_needed();page.screenshot(path=str(out/f'{width}-footer.png'))
        assert page.locator('.guide').is_visible()
        for button,code in [('copyLocal','mcpLocal'),('copyCommand','mcpCommand')]:
            page.locator('#'+button).click()
            assert page.evaluate('navigator.clipboard.readText()')==page.locator('#'+code).inner_text()
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        assert not errors,errors
        assert not page.evaluate('window.cspErrors')
        assert all(u.startswith(('http://127.0.0.1:8843/','blob:')) for u in requests)
        reports.append({'viewport':[width,height],'effects':27,'gif_frames':30,'native':list(original.size),'exact_png_sheet_apply_undo_redo':True,'recipe_import_rejection':True,'keyboard':True,'auto_preview':True,'one_click_surprise':True,'undo_apply':True,'csp_errors':0,'console_errors':errors,'third_party_requests':0})
        context.close()
    # Motion allowed: autoplay starts in view, Pause sticks through effect changes, version change keeps the effect.
    context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='no-preference',accept_downloads=True);page=context.new_page();page.goto(args.url)
    page.get_by_role('button',name='Knight',exact=True).click()
    expect(page.locator('.version:not(:disabled)')).to_have_count(8,timeout=60000)
    page.locator('#fxCanvas').scroll_into_view_if_needed()
    expect(page.locator('#fxPlay')).to_have_attribute('aria-pressed','true',timeout=30000)
    page.locator('#fxPlay').click();expect(page.locator('#fxPlay')).to_have_attribute('aria-pressed','false')
    page.locator('.fx-tile[data-fx="water/ripples"]').click();expect(page.locator('#fxId')).to_have_text('water/ripples')
    expect(page.locator('#fxApply')).to_be_enabled();assert page.locator('#fxPlay').get_attribute('aria-pressed')=='false'
    page.locator('.version').nth(3).click()
    expect(page.locator('#fxId')).to_have_text('water/ripples');expect(page.locator('#fxApply')).to_be_enabled()
    context.close()
    # Rapidly changing images must end on the newest image with one selected effect and no errors.
    context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(args.url)
    for name in ['Knight','Cat','Potion']:
        page.get_by_role('button',name=name,exact=True).click();page.wait_for_timeout(120)
    expect(page.locator('.version:not(:disabled)')).to_have_count(8,timeout=60000)
    expect(page.locator('#fxApply')).to_be_enabled(timeout=30000);expect(page.locator('.fx-tile[aria-pressed=true]')).to_have_count(1)
    # Independently decode and snap the final Potion source, then render the same effect.
    expected=page.evaluate('''async () => {
      const w=new Worker(new URL('./worker.mjs',location.href),{type:'module'});
      const blob=await (await fetch('./examples/e03_potion.webp')).blob();
      const result=await new Promise((resolve,reject)=>{w.onmessage=({data:m})=>m.error?reject(Error(m.error)):resolve(m.result);w.postMessage({id:1,type:'snap',blob,options:{transparent:false,edgeCleanup:'smart',drift:true}});});w.terminate();
      const {recipeFor,createRenderer}=await import('./effects-core.mjs');
      const effect=document.querySelector('.fx-tile[aria-pressed=true]').dataset.fx;
      const r=createRenderer(result,recipeFor(effect)).render(Number(document.querySelector('#fxFrame').value));
      return {width:r.width,height:r.height,rgba:btoa(Array.from(r.data,b=>String.fromCharCode(b)).join(''))};
    }''')
    actual=Image.open(download(page,'#fxPNG','race-latest-preview.png')).convert('RGBA')
    scale=int(page.locator('#scale').input_value())
    ref=Image.frombytes('RGBA',(expected['width'],expected['height']),base64.b64decode(expected['rgba']))
    assert actual.tobytes()==ref.resize((ref.width*scale,ref.height*scale),Image.Resampling.NEAREST).tobytes(), 'Rapid preview must belong to the newest image'
    assert not errors,errors
    context.close()
    browser.close()
(out/'report.json').write_text(json.dumps(reports,indent=2))
print('PASS: desktop 1440, phone 390, tablet 768; 27 effects; automatic preview, one-click tiles/Surprise/No effect/Undo apply; autoplay+pause; rapid image race; PNG/sheet/apply exact RGBA; undo/redo; 30-frame GIF decode; recipe import/rejection; keyboard; zero CSP/console errors or third-party requests.')
