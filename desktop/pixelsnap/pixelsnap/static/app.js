'use strict';
const $ = id => document.getElementById(id);
let file = null, original = null, output = null, result = null, busy = false, pending = false, timer, revision = 0;
let originalURL = null;
let panX = 0, panY = 0;
const buttons = ['downloadNative', 'downloadLarge', 'downloadCompare', 'downloadPalette'];
const controls = ['autoCell','cell','cellNumber','cellY','offsetX','offsetY','autoColors','colors','colorsNumber','palette','transparent','cleanup','scale','drift','targetSize','customPalette','dither'];
function syncEnabled() {
  $('cell').disabled = $('cellNumber').disabled = $('autoCell').checked || !!$('targetSize').value;
  $('manualGrid').hidden=!!$('targetSize').value;
  $('customControls').hidden=$('palette').value!=='custom';
  $('autoColors').disabled=$('palette').value!=='auto';
  $('colors').disabled = $('colorsNumber').disabled = $('autoColors').checked || $('palette').value !== 'auto';
}
function setStatus(text, working=false) {
  $('status').replaceChildren();
  const dot=document.createElement('span');dot.className='status-dot';$('status').append(dot,document.createTextNode(text));
  document.body.classList.toggle('busy',working);
}
function invalidate(){ revision++; buttons.forEach(id=>$(id).disabled=true); }
function queue() { if(file)setStatus('Settings changed · updating preview…'); invalidate(); syncEnabled(); clearTimeout(timer); timer=setTimeout(process,320); }
function showError(message) { $('error').textContent=message; $('error').hidden=false; }
async function selectFile(next) {
  if(!next) return;
  invalidate();
  if(next.size>25*1024*1024){showError('Choose an image under 25 MB.');return;}
  const url=URL.createObjectURL(next), img=new Image();
  try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});}
  catch(e){URL.revokeObjectURL(url);showError('This file could not be opened as an image.');return;}
  if(originalURL) URL.revokeObjectURL(originalURL);
  originalURL=url; file=next;original=img;output=null;result=null;panX=panY=0;
  $('error').hidden=true;$('warning').hidden=true;$('resultDetails').hidden=true;
  $('filename').textContent=next.name;$('sourceSize').textContent=`${img.naturalWidth} × ${img.naturalHeight}`;
  $('nativeSize').textContent='—';$('emptyBefore').hidden=true;$('emptyAfter').hidden=false;
  draw();process();
}
async function process(){
  if(!file)return;
  if(busy){pending=true;return;}
  busy=true;pending=false;const current=revision;
  buttons.forEach(id=>$(id).disabled=true);$('error').hidden=true;
  setStatus('Finding the grid and cleaning your colours…',true);
  const form=new FormData();form.append('image',file);
  form.append('defer_comparison','true');
  if(!$('autoCell').checked)form.append('cell',$('cellNumber').value);
  if(!$('autoColors').checked && $('palette').value==='auto')form.append('colors',$('colorsNumber').value);
  for(const [name,id] of [['cell_y','cellY'],['offset_x','offsetX'],['offset_y','offsetY']])if($(id).value!=='')form.append(name,$(id).value);
  for(const id of ['transparent','cleanup','drift','dither'])form.append(id,$(id).checked);
  form.append('palette',$('palette').value);
  if($('targetSize').value)form.append('target_size',$('targetSize').value);
  if($('scale').value.startsWith('fit'))form.append('fit',$('scale').value.slice(3));else form.append('scale',$('scale').value);
  if($('palette').value==='custom')form.append('custom_palette',$('customPalette').value);
  try {
    const response=await fetch('/api/process',{method:'POST',body:form});const data=await response.json();
    if(!response.ok)throw new Error(data.error||'The image could not be processed.');
    if(current!==revision){pending=true;return;}
    const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=data.native;});
    if(current!==revision){pending=true;return;}
    result=data;output=img;const m=data.metadata;
    $('emptyAfter').hidden=true;$('resultDetails').hidden=false;$('nativeSize').textContent=`${m.native_size[0]} × ${m.native_size[1]}`;
    $('gridInfo').textContent=`${m.grid.x.cell.toFixed(2)} × ${m.grid.y.cell.toFixed(2)} px`;
    const conf=Math.min(m.grid.x.confidence,m.grid.y.confidence);
    $('confidence').textContent=m.grid.x.method==='target'?'Target resolution':m.grid.x.method==='manual'?'Manual grid': conf>.65?'Strong grid match':conf>.25?'Approximate grid match':'No reliable grid · adjust manually';
    if($('autoCell').checked){$('cellNumber').value=m.grid.x.cell.toFixed(2);$('cell').value=m.grid.x.cell;}
    if($('autoColors').checked){$('colorsNumber').value=m.colors;$('colors').value=m.colors;}
    $('paletteTitle').textContent=`YOUR PALETTE / ${m.colors} COLOURS`;
    $('swatches').replaceChildren();for(const color of m.palette){const s=document.createElement('span');s.className='swatch';s.style.background=color;s.title=color;s.setAttribute('role','img');s.setAttribute('aria-label',color);$('swatches').append(s);}
    $('warning').textContent=m.warnings.join(' ');$('warning').hidden=!m.warnings.length;
    setStatus(`Snapped. ${m.native_size[0]} × ${m.native_size[1]} pixels, ${m.colors} colours.`);
    $('exportInfo').textContent=`${m.export_size[0]} × ${m.export_size[1]} px · ${m.export_scale}× · PNG`;
    buttons.forEach(id=>$(id).disabled=false);draw();
  }catch(e){if(current===revision){showError(e.message);setStatus('Could not finish. Adjust the settings and try again.');}}
  finally{busy=false;if(pending||current!==revision){pending=false;clearTimeout(timer);timer=setTimeout(process,120);}}
}
function paint(canvas,img,isAfter){
  const box=canvas.parentElement.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
  canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);if(!img)return;
  const m=16,fit=Math.min((box.width-m*2)/img.naturalWidth,(box.height-m*2)/img.naturalHeight);
  const zoom=Number($('zoom').value);
  const scale=(isAfter&&fit>=1?Math.max(1,Math.floor(fit)):fit)*zoom;
  const w=img.naturalWidth*scale,h=img.naturalHeight*scale,x=Math.round((box.width-w)/2+panX*box.width),y=Math.round((box.height-h)/2+panY*box.height);
  ctx.imageSmoothingEnabled=!isAfter;ctx.drawImage(img,x,y,w,h);
  if($('grid').checked&&result){
    ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.strokeStyle='rgba(166,241,117,.38)';ctx.lineWidth=.65;
    let xs,ys;
    if(isAfter){xs=Array.from({length:img.naturalWidth+1},(_,i)=>i);ys=Array.from({length:img.naturalHeight+1},(_,i)=>i);}
    else{const g=result.metadata;xs=g.x_centers.map(c=>c-g.grid.x.cell/2);ys=g.y_centers.map(c=>c-g.grid.y.cell/2);}
    if(xs.length<350&&ys.length<350){ctx.beginPath();for(const v of xs){ctx.moveTo(x+v*scale,y);ctx.lineTo(x+v*scale,y+h);}for(const v of ys){ctx.moveTo(x,y+v*scale);ctx.lineTo(x+w,y+v*scale);}ctx.stroke();}
    ctx.restore();
  }
}
function draw(){paint($('before'),original,false);paint($('after'),output,true);}
async function download(key,suffix){
  if(!result)return;
  let href=result[key],temporary=false;
  if(key==='comparison'&&!href){
    try{const response=await fetch(result.comparison_url);if(!response.ok)throw new Error((await response.json()).error);href=URL.createObjectURL(await response.blob());temporary=true;}
    catch(e){showError(e.message);return;}
  }
  const a=document.createElement('a');a.href=href;a.download=file.name.replace(/\.[^.]+$/,'')+'_'+suffix+'.png';a.click();
  if(temporary)setTimeout(()=>URL.revokeObjectURL(href),1000);
}
$('file').addEventListener('change',e=>selectFile(e.target.files[0]));
for(const type of ['dragenter','dragover'])$('dropzone').addEventListener(type,e=>{e.preventDefault();$('dropzone').classList.add('dragging');});
for(const type of ['dragleave','drop'])$('dropzone').addEventListener(type,e=>{e.preventDefault();$('dropzone').classList.remove('dragging');if(type==='drop')selectFile(e.dataTransfer.files[0]);});
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
for(const id of controls)$(id).addEventListener('input',()=>{if(id==='cell')$('cellNumber').value=$('cell').value;if(id==='cellNumber')$('cell').value=$('cellNumber').value;if(id==='colors')$('colorsNumber').value=$('colors').value;if(id==='colorsNumber')$('colors').value=$('colorsNumber').value;queue();});
$('zoom').addEventListener('change',()=>{panX=panY=0;document.body.classList.toggle('zoomed',$('zoom').value!=='1');draw();});$('grid').addEventListener('change',draw);new ResizeObserver(draw).observe($('beforeWrap'));new ResizeObserver(draw).observe($('afterWrap'));
$('downloadNative').onclick=()=>download('native','native');$('downloadLarge').onclick=()=>download('upscaled','x'+result.metadata.export_scale);$('downloadCompare').onclick=()=>download('comparison','comparison');
$('reset').onclick=()=>{for(const id of ['autoCell','autoColors','drift'])$(id).checked=true;for(const id of ['transparent','cleanup','dither','grid'])$(id).checked=false;for(const id of ['cellY','offsetX','offsetY'])$(id).value='';$('palette').value='auto';$('scale').value='8';$('targetSize').value='';$('customPalette').value='';$('paletteFile').value='';$('zoom').value='1';panX=panY=0;document.body.classList.remove('zoomed');queue();draw();};
$('demo').onclick=async()=>{try{const r=await fetch('/static/demo.png');if(!r.ok)throw new Error('Example unavailable. Choose your own image.');selectFile(new File([await r.blob()],'teapot-example.png',{type:'image/png'}));}catch(e){showError(e.message);}};
syncEnabled();draw();
for(const id of ['before','after']){
  const canvas=$(id);canvas.tabIndex=0;canvas.title='Zoom, then drag or use arrow keys to pan. Home centres the image.';
  let last=null;
  canvas.onpointerdown=e=>{if($('zoom').value==='1')return;last=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(!last)return;const box=canvas.getBoundingClientRect();panX+=(e.clientX-last[0])/box.width;panY+=(e.clientY-last[1])/box.height;last=[e.clientX,e.clientY];draw();};
  canvas.onpointerup=canvas.onpointercancel=()=>{last=null;};
  canvas.onkeydown=e=>{if(e.key==='Home'){panX=panY=0;}else if($('zoom').value!=='1'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){panX+=e.key==='ArrowRight'?-.08:e.key==='ArrowLeft'?.08:0;panY+=e.key==='ArrowDown'?-.08:e.key==='ArrowUp'?.08:0;}else return;e.preventDefault();draw();};
}

$('paletteFile').addEventListener('change',async e=>{
  const f=e.target.files[0];if(!f)return;
  if(f.size>65536){showError('Palette files must be under 64 KB.');return;}
  $('customPalette').value=await f.text();$('palette').value='custom';queue();
});
$('downloadPalette').onclick=()=>{
  if(!result)return;
  const url=URL.createObjectURL(new Blob([result.metadata.palette.map(c=>c.slice(1)).join('\n')],{type:'text/plain'}));
  const a=document.createElement('a');a.href=url;a.download='pixelsnap-palette.hex';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
