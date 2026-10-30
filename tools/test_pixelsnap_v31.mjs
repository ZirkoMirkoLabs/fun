import assert from 'node:assert/strict';
import {variants,processImage,paletteColors} from '../projects/pixelsnap/core.mjs';
import {paletteOf} from '../projects/pixelsnap/ui-export.mjs';

const w=64,h=48,data=new Uint8ClampedArray(w*h*4).fill(255);
for(let y=8;y<40;y++)for(let x=8;x<56;x++)data.set([20,40,120,255],(y*w+x)*4);
for(let y=16;y<32;y++)for(let x=16;x<48;x++)data.set([230,80,30,255],(y*w+x)*4);
let count=0;
for(const transparent of [false,true])for(const dither of [false,true]){
 const base={transparent,dither,cleanup:dither,drift:false,edgeCleanup:'off'};
 for(const r of variants(data,w,h,null,base)){
  const o=r.meta.options,single=processImage(data,w,h,o);
  assert.equal(o.transparent,transparent);assert.equal(o.dither,dither);
  assert.equal(o.cleanup,dither||r.preset==='clean');assert.equal(o.drift,false);
  assert.equal(o.edge_cleanup,r.preset==='clean'?'strong':'smart');
  assert.deepEqual(r.data,single.data,r.preset);
  assert.deepEqual(r.palette,paletteColors(r.data));
  assert.deepEqual(r.palette,paletteOf(r.data));
  assert.equal(r.meta.colors,r.palette.length);
  assert.deepEqual(r.meta.warnings,single.warnings);
  assert.equal(r.data.some((v,i)=>i%4===3&&!v),transparent);
  count++;
 }
 assert.deepEqual(base,{transparent,dither,cleanup:dither,drift:false,edgeCleanup:'off'});
}
const removed=processImage(data,w,h,{transparent:true});
assert.ok(removed.warnings.includes('Background removed.'));
const again=processImage(removed.data,removed.width,removed.height,{transparent:true,cell:1,offset_x:0,offset_y:0});
assert.ok(again.warnings.includes('Image already had transparency.'));
assert.deepEqual(paletteOf(new Uint8ClampedArray([255,255,255,0,20,40,120,255,20,40,120,255])),['#142878']);
console.log(`${count} variant/snap toggle, palette and metadata regressions passed; background notices passed`);
