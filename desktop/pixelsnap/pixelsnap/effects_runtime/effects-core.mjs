// Trusted, pinned renderer. Imported recipes are DATA: no source strings, imports or callbacks.
import {modules,createFrame,createFx,composite} from './vendor/pixelfx-0.2.0/pixelfx.mjs';
export const LIMITS=Object.freeze({side:512,pixels:262144,layers:4,frames:120,sheetPixels:4194304,recipeBytes:16384});
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function object(o,keys){if(!o||typeof o!=='object'||Array.isArray(o))throw Error('Expected a recipe object.');for(const k of Object.keys(o))if(!keys.includes(k))throw Error(`Unknown recipe field: ${k}`);}
function num(v,lo,hi,integer=false){if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi||(integer&&!Number.isInteger(v)))throw Error(`Expected ${integer?'integer':'number'} ${lo}–${hi}.`);return v;}
function bool(v){if(typeof v!=='boolean')throw Error('Expected true or false.');return v;}
const color=v=>{if(typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v))throw Error('Colours must be #rrggbb.');return v.toLowerCase();};
export function listEffects(){return [...Object.entries(modules).map(([id,{meta:m}])=>({id,name:m.name,description:m.desc,category:id.split('/')[0],duration:m.duration,loop:!!m.loop})),
 {id:'pixel/tint',name:'Tint',description:'Blend a colour into visible pixels; keep their alpha.',category:'pixel',duration:1,loop:true},
 {id:'pixel/outline',name:'Outline',description:'Add a one-pixel outer outline, clipped to the canvas.',category:'pixel',duration:1,loop:true},
 {id:'pixel/dissolve',name:'Dissolve',description:'Seeded pixel disappearance and return.',category:'pixel',duration:2,loop:true}];}
export function validateRecipe(value){
 if(JSON.stringify(value)?.length>LIMITS.recipeBytes)throw Error('Recipe exceeds 16 KB.');
 object(value,['version','name','fps','duration','loop','layers']);
 if(value.version!==1)throw Error('Recipe version must be 1.');
 if(typeof value.name!=='string'||!value.name.trim()||value.name.length>80)throw Error('Name must contain 1–80 characters.');
 const fps=num(value.fps??15,1,30,true),duration=num(value.duration??2,.1,8),loop=bool(value.loop??true);
 if(Math.ceil(fps*duration)>LIMITS.frames)throw Error('Animation exceeds 120 frames.');
 if(!Array.isArray(value.layers)||value.layers.length<1||value.layers.length>LIMITS.layers)throw Error('Use 1–4 layers.');
 const layers=value.layers.map(l=>{
  object(l,['effect','x','y','scale','opacity','seed','palette','clip','color','amount']);
  if(typeof l.effect!=='string'||(!own(modules,l.effect)&&!['pixel/tint','pixel/outline','pixel/dissolve'].includes(l.effect)))throw Error('Unknown effect ID. Executable files and URLs are not accepted.');
  const r={effect:l.effect,x:num(l.x??.5,0,1),y:num(l.y??.5,0,1),scale:num(l.scale??1,.1,4),opacity:num(l.opacity??1,0,1),seed:num(l.seed??1,0,2147483647,true),clip:bool(l.clip??false)};
  if(l.palette!==undefined){if(!Array.isArray(l.palette)||l.palette.length<2||l.palette.length>16)throw Error('Palette needs 2–16 colours.');r.palette=l.palette.map(color);}
  if(l.color!==undefined)r.color=color(l.color);
  if(l.amount!==undefined)r.amount=num(l.amount,0,1);
  return r;
 });
 return {version:1,name:value.name.trim(),fps,duration,loop,layers};
}
export function recipeFor(id){const e=listEffects().find(e=>e.id===id);if(!e)throw Error('Unknown effect.');return validateRecipe({version:1,name:e.name,fps:15,duration:Math.min(8,e.duration),loop:e.loop,layers:[{effect:id}]});}
export function checkImage(image){const {width:w,height:h,data}=image||{};num(w,1,LIMITS.side,true);num(h,1,LIMITS.side,true);if(w*h>LIMITS.pixels||!(data instanceof Uint8Array||data instanceof Uint8ClampedArray)||data.length!==w*h*4)throw Error('Invalid RGBA image or image exceeds 512 px / 256 KiPixels.');}
function over(dst,i,src,j,opacity=1){const a=src[j+3]/255*opacity,b=dst[i+3]/255,alpha=a+b*(1-a);if(!alpha){dst.fill(0,i,i+4);return;}for(let c=0;c<3;c++)dst[i+c]=(src[j+c]*a+dst[i+c]*b*(1-a))/alpha;dst[i+3]=alpha*255;}
function hash(x,y,seed){let n=(Math.imul(x+1,374761393)+Math.imul(y+1,668265263)+Math.imul(seed,69069))|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
function pixelOp(out,w,h,l,t,duration){const before=out.slice(),c=(l.color??'#84f800').slice(1).match(/../g).map(n=>parseInt(n,16)),amount=(l.amount??.5)*l.opacity;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(l.effect==='pixel/tint'&&out[i+3])for(let k=0;k<3;k++)out[i+k]=out[i+k]*(1-amount)+c[k]*amount;
  else if(l.effect==='pixel/dissolve'&&hash(x,y,l.seed)<(l.amount??1)*(1-Math.abs(2*t/duration-1)))out.fill(0,i,i+4);
  else if(l.effect==='pixel/outline'&&!before[i+3]&&!l.clip&&[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([a,b])=>a>=0&&b>=0&&a<w&&b<h&&before[(b*w+a)*4+3])){out.set([...c,Math.round(l.opacity*255)],i);}
 }
}
export function createRenderer(image,definition){checkImage(image);const recipe=validateRecipe(definition),{width:w,height:h}=image,source=new Uint8ClampedArray(image.data);
 const states=recipe.layers.map(l=>{if(l.effect.startsWith('pixel/'))return null;const mod=modules[l.effect],m=mod.meta,[W,H]=m.size;return {mod,m,W,H,frame:createFrame(W,H),rgba:new Uint8ClampedArray(W*H*4),inst:null,step:0};});
 return {recipe,width:w,height:h,render(index){num(index,0,Math.ceil(recipe.duration*recipe.fps)-1,true);const out=source.slice(),t=index/recipe.fps;
  recipe.layers.forEach((l,n)=>{const s=states[n];if(!s){pixelOp(out,w,h,l,t,recipe.duration);return;}
   if(!s.inst||index<s.step){s.inst=createFx(s.mod,{x:s.m.origin[0],y:s.m.origin[1],seed:l.seed,...(l.palette?{palette:l.palette}:{})});s.step=0;}
   while(s.step<index){s.inst.update(1/recipe.fps);s.step++;}
   s.frame.color.fill(0);s.frame.light.fill(0);s.inst.draw(s.frame);composite(s.frame,s.rgba);
   // Nearest-neighbour mapping: every destination sample is exactly one native pixel.
   const k=Math.min(w/s.W,h/s.H)*l.scale,W=Math.max(1,Math.round(s.W*k)),H=Math.max(1,Math.round(s.H*k)),left=Math.round(w*l.x-W/2),top=Math.round(h*l.y-H/2);
   for(let y=Math.max(0,top);y<Math.min(h,top+H);y++)for(let x=Math.max(0,left);x<Math.min(w,left+W);x++){
    const i=(y*w+x)*4,j=(Math.min(s.H-1,Math.floor((y-top)*s.H/H))*s.W+Math.min(s.W-1,Math.floor((x-left)*s.W/W)))*4;
    if(l.clip){if(source[i+3]&&out[i+3]){const a=s.rgba[j+3]/255*l.opacity;for(let c=0;c<3;c++)out[i+c]=s.rgba[j+c]*a+out[i+c]*(1-a);}}
    else over(out,i,s.rgba,j,l.opacity);
   }
  });return {width:w,height:h,data:out};
 }};
}
export function renderSheet(image,recipe){const r=createRenderer(image,recipe),count=Math.ceil(r.recipe.duration*r.recipe.fps),columns=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/columns),width=image.width*columns,height=image.height*rows;
 if(width*height>LIMITS.sheetPixels)throw Error('Sprite sheet exceeds 4 MiPixels. Reduce duration, fps or image size.');
 const data=new Uint8ClampedArray(width*height*4),frames={};for(let i=0;i<count;i++){const f=r.render(i),x=(i%columns)*image.width,y=Math.floor(i/columns)*image.height;for(let row=0;row<image.height;row++)data.set(f.data.subarray(row*image.width*4,(row+1)*image.width*4),((y+row)*width+x)*4);frames[String(i).padStart(4,'0')]={frame:{x,y,w:image.width,h:image.height},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:image.width,h:image.height},sourceSize:{w:image.width,h:image.height},duration:1000/r.recipe.fps};}
 return {width,height,data,atlas:{frames,meta:{app:'PixelSnap',image:'sheet.png',format:'RGBA8888',size:{w:width,h:height},scale:'1',fps:r.recipe.fps,loop:r.recipe.loop,recipe:r.recipe}}};
}
