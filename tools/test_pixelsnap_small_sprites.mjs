import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {processImage} from '../projects/pixelsnap/core.mjs';
const dir=process.argv[2]||'G:/tmp/pixelsnap-effects-validation/cells',rows=JSON.parse(readFileSync(dir+'/fixtures.json'));
for(const row of rows){const data=new Uint8ClampedArray(readFileSync(dir+'/'+row.stem+'-source.rgba')),expected=new Uint8ClampedArray(readFileSync(dir+'/'+row.stem+'-expected.rgba')),r=processImage(data,row.width,row.height,{transparent:true});assert.deepEqual([r.width,r.height],row.expected,row.stem);assert.deepEqual(r.data,expected,row.stem);}
console.log(`PASS: ${rows.length} small-sprite fallback outputs match Python exactly in dimensions and RGBA.`);
