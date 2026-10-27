// Pure header tests: no DOM, graphics driver or image decoding required.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { imageDimensions, validateDimensions, decodeImage } from '../projects/write-in-stars/image-input.js';

const png = new Uint8Array(33);
png.set([137,80,78,71,13,10,26,10]);
new DataView(png.buffer).setUint32(8,13);
png.set([73,72,68,82],12);
new DataView(png.buffer).setUint32(16,100000);
new DataView(png.buffer).setUint32(20,100000);
let decoded = 0;
globalThis.createImageBitmap = () => { decoded++; throw new Error('decoder must not run'); };
await assert.rejects(() => decodeImage(new Blob([png])), /16 megapixels/);
await assert.rejects(() => decodeImage(new Blob(['<svg></svg>'])), /valid PNG/);
await assert.rejects(() => decodeImage(new Blob([new Uint8Array(20*1024*1024+1)])), /20 MB/);
assert.equal(decoded,0);
for (const pair of [[0,1],[1,0],[8193,1],[4097,4097],[Infinity,1],[1.5,2]]) assert.throws(() => validateDimensions(...pair));
validateDimensions(4096,4096);
validateDimensions(8192,1);
for (const file of ['poster.webp','poster.jpg','zm_logo.png']) {
    const bytes = readFileSync(new URL('../projects/write-in-stars/' + file, import.meta.url));
    const size = imageDimensions(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    validateDimensions(...size);
    console.log(file, size.join(' x '));
}
// Valid 1px GIF, plus a forged frame larger than the logical screen.
const gif = Uint8Array.from(Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64'));
assert.deepEqual(imageDimensions(gif.buffer),[1,1]);
const frame = gif.indexOf(44);
gif[frame+5]=255; gif[frame+6]=255;
assert.throws(() => imageDimensions(gif.buffer));
// A tiny VP8X canvas cannot conceal a giant VP8 frame.
const webp = new Uint8Array(48);
const put = (at, text) => webp.set(new TextEncoder().encode(text),at);
put(0,'RIFF'); put(8,'WEBP'); put(12,'VP8X'); new DataView(webp.buffer).setUint32(16,10,true);
put(30,'VP8 '); new DataView(webp.buffer).setUint32(34,10,true); webp.set([157,1,42],41);
new DataView(webp.buffer).setUint16(44,12000,true); new DataView(webp.buffer).setUint16(46,12000,true);
assert.throws(() => imageDimensions(webp.buffer));
console.log('Image input safety checks passed; rejected data never reached the decoder.');
