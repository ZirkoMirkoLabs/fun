// Python fixtures: pixelsnap/tools/validate_v3.py. Runs the production JS engine.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {processImage,variants} from '../projects/pixelsnap/core.mjs';
const root=process.argv[2]||'G:/tmp/pixelsnap-v3';
const fixtures=JSON.parse(readFileSync(join(root,'fixtures.json'))),report=[];
function decode(path){const r=spawnSync('python',['-c','from PIL import Image,ImageOps; import sys,struct; im=ImageOps.exif_transpose(Image.open(sys.argv[1])).convert("RGBA"); sys.stdout.buffer.write(struct.pack("<II",*im.size)+im.tobytes())',path],{maxBuffer:128e6});assert.equal(r.status,0,r.stderr.toString());return {w:r.stdout.readUInt32LE(0),h:r.stdout.readUInt32LE(4),data:new Uint8ClampedArray(r.stdout.subarray(8))};}
function compare(r,path){const e=decode(path);assert.equal(r.width,e.w,path);assert.equal(r.height,e.h,path);let bad=0;for(let i=0;i<e.data.length;i++)bad+=e.data[i]!==r.data[i];return bad;}
assert.equal(readFileSync('projects/pixelsnap/presets.json','utf8'),readFileSync('desktop/pixelsnap/pixelsnap/presets.json','utf8'));
for(const f of fixtures){const a=decode(f.source),r=processImage(a.data,a.w,a.h,f.options),meta=JSON.parse(readFileSync(join(root,'expected',f.stem+'_info.json')));const bad=compare(r,join(root,'expected',f.stem+'_native.png'));
 const grid=['x','y'].every(k=>Math.abs(r.grid[k].cell-meta.grid[k].cell)<.01&&Math.abs(r.grid[k].offset-meta.grid[k].offset)<.02&&r.grid[k].method===meta.grid[k].method);
 assert.deepEqual(r.warnings,meta.warnings,`${f.stem} snap notices`);
 const checks=[['',{}],['-sticky',{transparent:true,cleanup:true,dither:true,drift:false,edgeCleanup:'off'}]].flatMap(([suffix,options])=>variants(a.data,a.w,a.h,null,options).map(v=>{
  const expected=JSON.parse(readFileSync(join(root,'variants',f.stem,v.preset+suffix+'.json')));
  assert.deepEqual(v.palette,expected.palette,`${f.stem} ${v.preset}${suffix} palette`);
  assert.deepEqual(v.meta.warnings,expected.warnings,`${f.stem} ${v.preset}${suffix} notices`);
  assert.equal(v.meta.background_removed,expected.background_removed);
  assert.equal(v.meta.source_had_transparency,expected.source_had_transparency);
  return {preset:v.preset+suffix,bad:compare(v,join(root,'variants',f.stem,v.preset+suffix+'.png'))};
 }));
 report.push({sample:f.stem,bad,grid,checks});console.log(`${f.stem}: snap ${bad} differing channels, grid ${grid}, variants ${checks.filter(c=>!c.bad).length}/16 exact`);
 if(bad)writeFileSync(join(root,f.stem+'-js.rgba'),r.data);
}
writeFileSync(join(root,'parity.json'),JSON.stringify(report,null,2)+'\n');
assert.ok(report.every(r=>!r.bad&&r.grid&&r.checks.every(c=>!c.bad)),'Pixel parity failed');
console.log(`${report.length} snaps + ${report.length*16} variants: 100% exact RGBA parity`);
