import {save} from './ui-export.mjs';
import {exportPNGExact,scaleNearest,zipStore} from './export-core.mjs';
const $=id=>document.getElementById(id);
// A separate worker isolates rendering load. Only the fixed worker URL is executable.
class EffectsClient {
 constructor(){this.id=0;this.jobs=new Map();this.worker=new Worker(new URL('./effects-worker.mjs',import.meta.url),{type:'module'});this.worker.onmessage=({data:m})=>{const j=this.jobs.get(m.id);if(!j)return;clearTimeout(j.timer);this.jobs.delete(m.id);m.error?j.reject(Error(m.error)):j.resolve(m.result);};this.worker.onerror=()=>this.close('Effects processor failed. Choose an effect to retry.');}
 call(data){return new Promise((resolve,reject)=>{const id=++this.id,timer=setTimeout(()=>this.close('Effects took too long. Use a smaller image or shorter animation.'),30000);this.jobs.set(id,{resolve,reject,timer});this.worker.postMessage({id,...data});});}
 close(message='Effects changed.'){this.closed=true;this.worker.terminate();for(const j of this.jobs.values()){clearTimeout(j.timer);j.reject(Error(message));}this.jobs.clear();}
}
// A dependable first impression: these read clearly on any sprite. Surprise me draws from all 27.
const FIRST=['fire/torch','arcane/portal','lightning/ball-lightning','nature/healing-bloom','water/bubbles','arcane/rune-circle','fire/campfire','weather/fireflies','ice/ice-crystal','ui/confetti'];
const fits=i=>i.width<=512&&i.height<=512&&i.width*i.height<=262144;
const hero=(duration,fps=15)=>Math.floor(Math.ceil(Math.min(8,duration)*fps)*.45);
const pick=rows=>rows[Math.floor(Math.random()*rows.length)];
export function mountEffects({getImage,apply,undo,history,isBusy}){
 let client=null,catalog=[],tiles=[],listing=null,recipe=null,last=null,plainId=null,lastId=null,sized=false,preview=null,generation=0,playing=false,loop=0,raf=0,base=null,available=false,armed=false,off=false,picked=false,paused=false,inView=true,rendering=false,applied=null,refreshes=0,thumbRun=0,thumbTimer=0;
 const note=s=>{$('fxStatus').textContent=s;},error=e=>{note(e.message);};
 const api=()=>{if(!client||client.closed)client=new EffectsClient();return client;};
 const motion=()=>!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const usable=()=>available&&sized&&!isBusy();
 function stop(){playing=false;cancelAnimationFrame(raf);$('fxPlay').textContent='Play';$('fxPlay').setAttribute('aria-pressed','false');}
 function controls(){const ready=usable()&&!rendering;for(const id of ['fxApply','fxPlay','fxFrame','fxPNG','fxGIF','fxSheet','fxRecipe','fxAgent'])$(id).disabled=!preview||!ready;for(const b of tiles)b.disabled=!ready;$('fxRandom').disabled=!ready||!catalog.length;$('fxUndoApply').hidden=!applied;$('fxUndoApply').disabled=isBusy();}
 function mark(){const id=recipe?plainId:off?'':null;for(const b of tiles)b.setAttribute('aria-pressed',String(b.dataset.fx===id));const e=catalog.find(e=>e.id===plainId);$('fxId').textContent=recipe?(plainId||'custom recipe'):'';$('fxDescription').textContent=recipe?(e?.description||`${recipe.layers.length} layer recipe.`):'';}
 function clear(kill=false){generation++;stop();preview=null;base=null;if(kill&&client){client.close();client=null;}controls();}
 function paint(c,image){c.width=image.width;c.height=image.height;c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.data),image.width,image.height),0,0);}
 function draw(image){preview=image;paint($('fxCanvas'),image);$('fxTime').textContent=`Frame ${Number($('fxFrame').value)+1} / ${$('fxFrame').max*1+1}`;controls();}
 function plain(){const image=getImage();if(image&&fits(image))paint($('fxCanvas'),image);$('fxName').textContent='YOUR PIXELS';$('fxTime').textContent='No effect';mark();}
 function edited(){const l={...recipe.layers[0],x:Number($('fxX').value)/100,y:Number($('fxY').value)/100,scale:Number($('fxSize').value),opacity:Number($('fxOpacity').value)/100,seed:Number($('fxSeed').value),clip:$('fxClip').checked};return {...recipe,layers:[l,...recipe.layers.slice(1)]};}
 function sync(){const l=recipe.layers[0];$('fxX').value=l.x*100;$('fxY').value=l.y*100;$('fxSize').value=l.scale;$('fxOpacity').value=l.opacity*100;$('fxSeed').value=l.seed;$('fxClip').checked=l.clip;$('fxName').textContent=recipe.name;$('fxFrame').max=Math.ceil(recipe.duration*recipe.fps)-1;$('fxFrame').value=Math.min(Number($('fxFrame').value),Number($('fxFrame').max));mark();}
 function play(){if(!preview||playing)return;playing=true;const id=++loop,token=generation;$('fxPlay').textContent='Pause';$('fxPlay').setAttribute('aria-pressed','true');let previous=0;const tick=async(now)=>{if(id!==loop||!playing||token!==generation)return;if(now-previous>=1000/recipe.fps){previous=now;let index=Number($('fxFrame').value)+1;if(index>Number($('fxFrame').max))index=0;try{const r=await api().call({type:'frame',frame:index});if(id!==loop||!playing||token!==generation)return;$('fxFrame').value=index;draw(r);}catch(e){if(id===loop&&token===generation){stop();error(e);}return;}}raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);}
 // Motion starts by itself only if the visitor allows it, has not paused it and can see it.
 function resume(){if(motion()&&!paused&&inView&&!document.hidden)play();}
 async function setup(next){clear();if(!usable())return;const token=generation;try{const image=getImage();base=image;const r=await api().call({type:'set',image,recipe:next});if(token!==generation)return;recipe=r.recipe;armed=false;sync();const f=await api().call({type:'frame',frame:Number($('fxFrame').value)});if(token!==generation)return;draw(f);note(`${recipe.layers.length} layer${recipe.layers.length===1?'':'s'} · preview only. Your pixels stay untouched until Apply frame.`);resume();}catch(e){if(token===generation){clear();error(e);}}}
 async function choose(id){if(!usable()||rendering)return;stop();off=false;picked=true;const token=++generation;try{const next=await api().call({type:'recipe',effect:id});if(token!==generation)return;$('fxFrame').value=hero(next.duration,next.fps);plainId=id;await setup(next);}catch(e){if(token===generation)error(e);}}
 function original(){if(rendering)return;clear();recipe=null;last=null;plainId=null;armed=false;off=true;picked=true;plain();note('No effect showing. Your pixels are unchanged. Pick an effect any time.');}
 function first(){const id=pick(FIRST);plainId=id;const token=++generation;api().call({type:'recipe',effect:id}).then(next=>{if(token!==generation)return;$('fxFrame').value=hero(next.duration,next.fps);return setup(next);}).catch(e=>{if(token===generation)error(e);});}
 function filter(){const category=$('fxCategory').value,term=$('fxSearch').value.toLowerCase();let count=0;for(const b of tiles){const e=catalog.find(e=>e.id===b.dataset.fx);const show=!e||((!category||e.category===category)&&`${e.name} ${e.description} ${e.id}`.toLowerCase().includes(term));b.hidden=!show;if(show&&e)count++;}$('fxCount').textContent=`${count} of ${catalog.length} shown`;}
 function build(){const tile=(id,name,title)=>{const b=document.createElement('button'),c=document.createElement('canvas'),s=document.createElement('span');b.className='fx-tile';b.dataset.fx=id;b.title=title;b.setAttribute('aria-pressed','false');c.width=64;c.height=64;c.setAttribute('aria-hidden','true');s.textContent=name;b.append(c,s);b.addEventListener('click',()=>id?choose(id):original());return b;};tiles=[tile('','No effect','Your current pixels, with no effect'),...catalog.map(e=>tile(e.id,e.name,e.description))];$('fxTiles').replaceChildren(...tiles);$('fxCategory').append(...[...new Set(catalog.map(e=>e.category))].sort().map(c=>new Option(c,c)));filter();}
 const ensure=()=>listing||=api().call({type:'list'}).then(rows=>{if(!catalog.length){catalog=rows;build();}return rows;}).catch(e=>{listing=null;throw e;});
 function thumb(b,image){const c=b.querySelector('canvas'),a=document.createElement('canvas'),x=c.getContext('2d'),k=Math.min(c.width/image.width,c.height/image.height),w=image.width*k,h=image.height*k;paint(a,image);x.clearRect(0,0,c.width,c.height);x.imageSmoothingEnabled=false;x.drawImage(a,(c.width-w)/2,(c.height-h)/2,w,h);}
 // One tile at a time, so a click is never more than one small render away. Newer images cancel older runs.
 function thumbs(){clearTimeout(thumbTimer);const run=++thumbRun;thumbTimer=setTimeout(async()=>{const image=getImage();if(!image||!fits(image))return;for(const b of tiles){if(run!==thumbRun)return;const e=catalog.find(e=>e.id===b.dataset.fx);if(!e){thumb(b,image);continue;}try{const r=await api().call({type:'thumb',image,effect:e.id,frame:hero(e.duration)});if(run!==thumbRun)return;thumb(b,r);}catch{return;}}},200);}
 $('fxCategory').addEventListener('change',filter);$('fxSearch').addEventListener('input',filter);
 $('fxRandom').addEventListener('click',()=>{const rows=tiles.filter(b=>!b.hidden&&b.dataset.fx&&b.dataset.fx!==plainId);if(!rows.length)return;const b=pick(rows);b.scrollIntoView({block:'nearest',inline:'nearest'});choose(b.dataset.fx);});
 $('fxFrame').addEventListener('input',async()=>{paused=true;stop();const token=generation,index=Number($('fxFrame').value);try{const r=await api().call({type:'frame',frame:index});if(token===generation&&!playing)draw(r);}catch(e){if(token===generation)error(e);}});
 for(const id of ['fxX','fxY','fxSize','fxOpacity','fxSeed','fxClip'])$(id).addEventListener('change',()=>{if(recipe){const next=edited(),l=next.layers[0],stock=next.layers.length===1&&l.x===.5&&l.y===.5&&l.scale===1&&l.opacity===1&&l.seed===1&&!l.clip&&!l.palette&&!l.color&&l.amount===undefined;plainId=stock?l.effect:null;setup(next);}});
 $('fxPlay').addEventListener('click',()=>{if(playing){paused=true;stop();}else{paused=false;play();}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else if(preview)resume();});
 if('IntersectionObserver' in window)new IntersectionObserver(([e])=>{inView=e.isIntersecting;if(!inView)stop();else if(preview)resume();}).observe($('fxCanvas'));
 $('fxApply').addEventListener('click',()=>{if(!preview||isBusy())return;stop();const image=preview,before=history();last=recipe;lastId=plainId;clear();recipe=null;plainId=null;armed=false;apply(image);applied=history()===before?null:history();plain();controls();note(applied?'Frame applied. Main downloads now include it. Pick another effect to layer on top, or Undo apply.':'That frame changed no pixels.');});
 $('fxUndoApply').addEventListener('click',()=>{if(!applied||isBusy())return;applied=null;recipe=last;plainId=lastId;undo();});
 $('fxAgent').addEventListener('click',async()=>{if(!recipe)return;const target={path:"ABSOLUTE_NATIVE_PATH",...(plainId?{effect:plainId}:{recipe})},text=JSON.stringify([{tool:"preview_effect",arguments:{...target,frame:Number($('fxFrame').value)}},{tool:"apply_effect",arguments:{...target,format:"gif"}}],null,2);try{await navigator.clipboard.writeText(text);note('Agent call copied. Replace ABSOLUTE_NATIVE_PATH with your snapped PNG.');}catch{note('Could not reach the clipboard. Use Save recipe instead.');}});
 for(const [id,type] of [['fxPNG','png'],['fxGIF','gif'],['fxSheet','sheet'],['fxRecipe','recipe']])$(id).addEventListener('click',async()=>{
  if(!preview||isBusy())return;stop();const token=generation,current=preview,definition=recipe,input=base;rendering=true;controls();
  try{let blob,name;if(type==='png'){const scale=Number($('scale').value);blob=await exportPNGExact(scaleNearest(current,scale));name='pixelsnap-effect.png';}
   else if(type==='recipe'){blob=new Blob([JSON.stringify(definition,null,2)+'\n'],{type:'application/json'});name='pixelsnap-effect.json';}
   else {note('Rendering animation locally…');const r=await api().call({type,image:input,recipe:definition});if(type==='gif'){blob=new Blob([r.data],{type:'image/gif'});name='pixelsnap-effect.gif';}else{blob=await zipStore([{name:'sheet.png',blob:await exportPNGExact(r)},{name:'sheet.json',data:JSON.stringify(r.atlas,null,2)},{name:'recipe.json',data:JSON.stringify(definition,null,2)}]);name='pixelsnap-effect-sheet.zip';}}
   if(token===generation){save(blob,name);note(`${name} downloaded${type==='gif'?' · 256 colours, binary alpha, native size':type==='sheet'?' · native-size frames, full alpha':''}.`);}
  }catch(e){if(token===generation)error(e);}finally{rendering=false;controls();if(token===generation)resume();}
 });
 $('fxImport').addEventListener('change',async()=>{const f=$('fxImport').files[0];$('fxImport').value='';if(!f)return;try{if(f.size>16384)throw Error('Recipe must be under 16 KB.');const definition=await api().call({type:'validate',recipe:JSON.parse(await f.text())});off=false;picked=true;plainId=null;await setup(definition);}catch(e){error(e);}});
 controls();
 return {
  // A different source image: only a choice the visitor made carries over.
  newImage(){if(!picked){recipe=null;last=null;plainId=null;}},
  // New base pixels from a snap or version. Paint strokes and undo never call this, so nothing stacks.
  rebased(){applied=null;armed=!recipe&&!off;},
  invalidate(){refreshes++;thumbRun++;clearTimeout(thumbTimer);clear(true);note('Effects load when your pixels are ready…');},
  controls,
  async refresh(ready){available=ready;if(applied&&history()!==applied)applied=null;if(!ready){controls();return;}const run=++refreshes,image=getImage();sized=!!image&&fits(image);controls();if(!image)return;if(!sized){clear(true);note('Effects work up to 512 px per side. Choose a smaller Target grid to use them.');return;}
   try{await ensure();}catch(e){if(run===refreshes)error(e);return;}if(run!==refreshes||isBusy())return;
   if(!recipe&&armed&&last){recipe=last;plainId=lastId;}
   if(recipe)setup(recipe);else if(armed)first();else{plain();controls();}
   thumbs();}
 };
}
