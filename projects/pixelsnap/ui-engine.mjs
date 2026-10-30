export const fallbackPresets=[
 {name:'Faithful',label:'Faithful',description:'Recover the original grid and colours',options:{edgeCleanup:'smart'}},
 {name:'Clean',label:'Clean',description:'Remove soft outline pixels',options:{edgeCleanup:'strong',colors:16,cleanup:true}},
 {name:'Icon 32',label:'Icon 32',description:'A compact 32-pixel icon',options:{target_size:32}},
 {name:'Sprite 64',label:'Sprite 64',description:'A 64-pixel game sprite',options:{target_size:64}},
 {name:'Retro (PICO-8)',label:'Retro',description:'The PICO-8 palette',options:{palette:'pico8'}},
 {name:'Game Boy',label:'Game Boy',description:'Four classic greens',options:{palette:'gameboy'}},
 {name:'1-bit',label:'1-bit',description:'Just black and white',options:{palette:'1bit'}},
 {name:'Poster 128',label:'Poster 128',description:'More room for detail',options:{target_size:128}}
];
export const defaults={target_size:null,cell:null,cell_y:null,offset_x:null,offset_y:null,colors:null,palette:'auto',custom_palette:'',dither:false,transparent:false,cleanup:false,drift:true,edgeCleanup:'smart'};
export class Engine {
 constructor(){this.worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});this.jobs=new Map();this.id=0;this.queue=Promise.resolve();this.worker.onmessage=({data})=>{const job=this.jobs.get(data.id);if(!job)return;clearTimeout(job.timer);this.jobs.delete(data.id);if(data.error)job.reject(Error(data.error));else job.resolve(data);};this.worker.onerror=()=>this.fail('The image processor could not start. Reload and try again.');}
 fail(message){this.failure=message;for(const job of this.jobs.values()){clearTimeout(job.timer);job.reject(Error(message));}this.jobs.clear();}
 close(){this.fail('Image replaced.');this.worker.terminate();}
 call(payload){if(this.failure)return Promise.reject(Error(this.failure));const run=()=>new Promise((resolve,reject)=>{const id=++this.id,timer=setTimeout(()=>{this.jobs.delete(id);reject(Error('This image is taking too long. Try a smaller image.'));},60000);this.jobs.set(id,{resolve,reject,timer});this.worker.postMessage({...payload,id});});const promise=this.queue.then(run,run);this.queue=promise.catch(()=>{});return promise;}
 async discover(){const m=await this.call({type:'presets'});if(!Array.isArray(m.presets)||m.presets.length!==8)throw Error('The processor returned invalid presets. Reload and try again.');this.presets=m.presets;return this.presets;}
 snap(options,blob){return this.call({type:'snap',options, ...(blob?{blob}:{})});}
}
export function normalizeResult(r){const width=r.width||r.w,height=r.height||r.h,data=r.data||r.rgba;return {...r,width,height,data:data instanceof Uint8ClampedArray?data:new Uint8ClampedArray(data),palette:r.palette||[],warnings:r.warnings||r.meta?.warnings||[],grid:r.grid||r.meta?.grid};}
