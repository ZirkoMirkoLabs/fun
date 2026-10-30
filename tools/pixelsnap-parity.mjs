// Node runs the production JS pipeline. Pillow only decodes fixtures; no Python algorithm is invoked.
// node tools/pixelsnap-parity.mjs ../pixelsnap G:/tmp/pixelsnap-web
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {processImage} from '../projects/pixelsnap/core.mjs';
const source=resolve(process.argv[2]||'../pixelsnap'),dest=resolve(process.argv[3]||'.');mkdirSync(dest,{recursive:true});
function decode(path){const r=spawnSync('python',['-c','from PIL import Image,ImageOps; import sys,struct; im=ImageOps.exif_transpose(Image.open(sys.argv[1])).convert("RGBA"); sys.stdout.buffer.write(struct.pack("<II",*im.size)+im.tobytes())',path],{maxBuffer:128e6});if(r.status)throw Error(r.stderr.toString());return {w:r.stdout.readUInt32LE(0),h:r.stdout.readUInt32LE(4),data:new Uint8ClampedArray(r.stdout.subarray(8))};}
const rows=[];
for(const file of readdirSync(join(source,'samples/input')).sort()){if(!/\.(png|jpe?g)$/i.test(file))continue;const stem=basename(file).replace(/\.[^.]+$/,''),meta=JSON.parse(readFileSync(join(source,'samples/output',stem+'_info.json'))),input=decode(join(source,'samples/input',file)),expected=decode(join(source,'samples/output',stem+'_native.png'));
 const times=[];let result;for(let run=0;run<3;run++){const t=performance.now();result=processImage(input.data,input.w,input.h,meta.options);times.push(performance.now()-t);}const dimensions=result.width===expected.w&&result.height===expected.h;let exact=0,near=0,total=expected.w*expected.h,mae=0;if(dimensions)for(let i=0;i<expected.data.length;i+=4){let e=true,n=true;for(let c=0;c<4;c++){const d=Math.abs(result.data[i+c]-expected.data[i+c]);e&&=d===0;n&&=d<=3;if(c<3)mae+=d;}exact+=e;near+=n;}
 const deltas=['x','y'].map(a=>({pitch:Math.abs(result.grid[a].cell-meta.grid[a].cell),phase:Math.abs(result.grid[a].offset-meta.grid[a].offset)}));const row={sample:file,gridMatch:dimensions&&deltas.every(d=>d.pitch<=.01&&d.phase<=.02),native:[result.width,result.height],grid:result.grid,expectedGrid:meta.grid,deltas,exactPercent:100*exact/total,within3Percent:100*near/total,rgbMAE:dimensions?mae/(total*3):null,medianMs:times.sort((a,b)=>a-b)[1]};rows.push(row);writeFileSync(join(dest,stem+'.rgba'),result.data);console.log(`${file}: grid ${row.gridMatch}, ${row.native}, exact ${row.exactPercent.toFixed(2)}%, ±3 ${row.within3Percent.toFixed(2)}%, ${row.medianMs.toFixed(1)} ms`);}
writeFileSync(join(dest,'parity.json'),JSON.stringify(rows,null,2)+'\n');
if(rows.some(r=>!r.gridMatch))process.exitCode=1;
