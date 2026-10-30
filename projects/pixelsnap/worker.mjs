/** PixelSnap v2 worker contract (all work stays local).
 * {type:'snap', id, blob?, options:{...,edgeCleanup:'off'|'smart'|'strong',preset?}}
 *   -> {type:'snap',id,result:{data:Uint8ClampedArray,width,height,palette,grid,positions,warnings},ms,notice,source}
 *      Legacy untyped snap messages and their response fields remain supported.
 * {type:'variants',id,blob?,presets?:[names]} (omitted = all eight)
 *   -> {type:'variants',id,results:[{preset,label,width,height,rgba:ArrayBuffer,palette:[hex],meta}],ms,notice}
 * {type:'presets',id?} -> {type:'presets',id,presets:[{name,label,description,options}]}
 * Any error -> {type:'error',id,error:string}. Send a blob once; later calls reuse it.
 * Requests are serialized to prevent asynchronous image decoding from racing.
 * Buffers are transferable; callers own response buffers. Internal caches are copied.
 */
import {decodeImage} from './image-input.mjs';
import {prepare,finish,variants,listPresets,resolveOptions} from './core.mjs';
let source=null,prepared=null,previousKey='',notice='',queue=Promise.resolve();
self.onmessage=({data:message})=>{queue=queue.then(()=>handle(message));};
async function handle(message){const {id,blob}=message;try{const start=performance.now();
 if(message.type==='presets'){self.postMessage({type:'presets',id,presets:listPresets()});return;}
 if(message.type&&!['snap','variants'].includes(message.type))throw Error('Unknown worker message type.');
 if(blob){const bitmap=await decodeImage(blob);try{const ratio=Math.min(1,2048/Math.max(bitmap.width,bitmap.height)),w=Math.max(4,Math.round(bitmap.width*ratio)),h=Math.max(4,Math.round(bitmap.height*ratio));if(bitmap.width<4||bitmap.height<4)throw Error('Images must be at least 4 pixels wide and tall.');const canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,w,h);source={data:ctx.getImageData(0,0,w,h).data,w,h};notice=ratio<1?`Large image reduced from ${bitmap.width} × ${bitmap.height} to ${w} × ${h} for safe, fast processing. `:'';prepared=null;}finally{bitmap.close();}}
 if(!source)throw Error('Pick an image first.');
 if(message.type==='variants'){const results=variants(source.data,source.w,source.h,message.presets??null).map(({data,...r})=>({...r,rgba:data.buffer}));self.postMessage({type:'variants',id,results,ms:performance.now()-start,notice},results.map(r=>r.rgba));return;}
 const options=resolveOptions(message.options??{}),key=JSON.stringify([options.target_size,options.cell,options.cell_y,options.offset_x,options.offset_y,options.drift,options.edge_cleanup]);if(!prepared||key!==previousKey){prepared=prepare(source.data,source.w,source.h,options);previousKey=key;}const result=finish(prepared,options),ms=performance.now()-start;
 const original=source.data.slice();self.postMessage({type:'snap',id,result,ms,notice,source:{data:original,w:source.w,h:source.h}},[result.data.buffer,original.buffer]);
 }catch(error){self.postMessage({type:'error',id,error:error.message||'Could not process this image.'});}}
