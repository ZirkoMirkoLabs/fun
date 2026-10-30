// Run after python ../pixelsnap/tools/validate_v2.py. No server or network used.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {variants,listPresets,processImage,transitionPixels,cleanEdges,sampleCells} from '../projects/pixelsnap/core.mjs';
import {exportSVG,exportPNG,exportPack,paletteHEX,paletteGPL,fitNearest,zipStore} from '../projects/pixelsnap/export-core.mjs';
const root=resolve('../pixelsnap'),dest=process.argv[2]||'G:/tmp/pixelsnap-v2';
function decode(path){const r=spawnSync('python',['-c','from PIL import Image; import sys,struct; im=Image.open(sys.argv[1]).convert("RGBA"); sys.stdout.buffer.write(struct.pack("<II",*im.size)+im.tobytes())',path],{maxBuffer:128e6});assert.equal(r.status,0,r.stderr.toString());return {width:r.stdout.readUInt32LE(0),height:r.stdout.readUInt32LE(4),data:new Uint8ClampedArray(r.stdout.subarray(8))};}
assert.equal(readFileSync('projects/pixelsnap/presets.json','utf8'),readFileSync('desktop/pixelsnap/pixelsnap/presets.json','utf8'));
const rows=[];
for(const file of readdirSync(join(root,'samples/input')).sort().filter(f=>/\.(png|jpe?g)$/i.test(f))){const input=decode(join(root,'samples/input',file)),stem=basename(file).replace(/\.[^.]+$/,''),t=performance.now(),results=variants(input.data,input.width,input.height),ms=performance.now()-t;assert.equal(results.length,8);const checks=[];assert.ok(results[1].palette.length<=results[0].palette.length,'Clean must not add colours to Faithful');
for(const r of results){const expected=decode(join(dest,'variants',stem,r.preset+'.png'));assert.equal(r.width,expected.width);assert.equal(r.height,expected.height);let bad=0;for(let i=0;i<r.data.length;i++)bad+=r.data[i]!==expected.data[i];checks.push({preset:r.preset,exact:bad===0,channelsDifferent:bad});if(bad)writeFileSync(join(dest,`${stem}-${r.preset}-js.rgba`),r.data);}
rows.push({sample:file,variantsMs:ms,checks});console.log(`${file}: variants ${ms.toFixed(1)}ms; ${checks.filter(r=>r.exact).length}/8 exact`);}
writeFileSync(join(dest,'variants-parity.json'),JSON.stringify(rows,null,2));
assert.ok(rows.every(r=>r.checks.every(c=>c.exact)),'Variant pixel parity failed');
// Independently constructed antialiased outline: no grey output, even diagonal.
const outlinePath=join(dest,'outline-input.png');
const fixture=spawnSync('python',['-c',`from PIL import Image,ImageDraw; im=Image.new('RGB',(32,32),'white'); d=ImageDraw.Draw(im); d.rectangle((7,5,24,26),outline='black',width=2); d.line((7,6,24,25),fill='black',width=1); im.resize((232,232),Image.Resampling.BILINEAR).save(${JSON.stringify(outlinePath)})`]);
assert.equal(fixture.status,0,fixture.stderr.toString());const outline=decode(outlinePath),crisp=processImage(outline.data,outline.width,outline.height);assert.deepEqual(crisp.palette,['#000000','#ffffff']);
const detail=new Uint8ClampedArray(24*24*4);for(let i=3;i<detail.length;i+=4)detail[i]=255;detail.set([255,255,255,255],(10*24+10)*4);assert.deepEqual(cleanEdges(detail,24,24),detail);
// True mixed-cell test: centre bias wins even with a 4:5 unweighted minority.
const mixed=new Uint8ClampedArray(400);let j=0;for(const y of [3,5,6])for(const x of [3,5,6])mixed.set([...[1,3,4,5].includes(j++)?[250,10,10]:[10,10,250],255],(y*10+x)*4);
const axis={cell:10,offset:0,confidence:1,method:'manual'};assert.deepEqual([...sampleCells(mixed,10,10,{x:axis,y:axis},false).data],[250,10,10,255]);
// Exports are decoded independently by Pillow / zipfile, including alpha.
const image={width:7,height:5,data:new Uint8ClampedArray(7*5*4)};for(let i=0;i<image.data.length;i+=4)image.data.set([i%256,42,180,(i/4)%3===0?0:255],i);
writeFileSync(join(dest,'export-native.png'),new Uint8Array(await exportPNG(image).arrayBuffer()));writeFileSync(join(dest,'export-native.rgba'),image.data);
writeFileSync(join(dest,'export-pack.zip'),new Uint8Array(await (await exportPack(image)).arrayBuffer()));writeFileSync(join(dest,'export-native.svg'),exportSVG(image));
assert.equal(paletteHEX(['#123456']),'123456\n');assert.ok(paletteGPL(['#123456']).includes('18 52 86 #123456'));assert.match(exportSVG(image),/shape-rendering="crispEdges"/);await assert.rejects(zipStore([{name:'../x',data:'unsafe'}]));
const solid={width:8,height:4,data:new Uint8ClampedArray(8*4*4).fill(255)};assert.equal((exportSVG(solid).match(/<rect /g)||[]).length,4);assert.deepEqual([fitNearest(solid,32).width,fitNearest(solid,32).height],[32,16]);
console.log('Variants, cluster sampling, SVG, palette and ZIP checks passed.');
