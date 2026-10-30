import {createRenderer,LIMITS} from './effects-core.mjs';
import {GIFEncoder} from './vendor/gifenc-1.0.3/gifenc.mjs';
// Original bounded palette mapper: preserve <=255 exact colours; otherwise a 6³ RGB cube.
// We deliberately do not import gifenc's separately derived PNN quantizer.
function indexed(data){const colors=new Map();for(let j=0;j<data.length;j+=4)if(data[j+3]){const k=(data[j]<<16)|(data[j+1]<<8)|data[j+2];if(!colors.has(k))colors.set(k,colors.size+1);if(colors.size>255)break;}
 const exact=colors.size<=255,palette=[[0,0,0]],index=new Uint8Array(data.length/4);
 if(exact){for(const k of colors.keys())palette.push([k>>16,(k>>8)&255,k&255]);}
 else for(let r=0;r<6;r++)for(let g=0;g<6;g++)for(let b=0;b<6;b++)palette.push([r*51,g*51,b*51]);
 if(palette.length===1)palette.push([0,0,0]);
 for(let j=0;j<data.length;j+=4)if(data[j+3])index[j/4]=exact?colors.get((data[j]<<16)|(data[j+1]<<8)|data[j+2]):1+Math.round(data[j]/51)*36+Math.round(data[j+1]/51)*6+Math.round(data[j+2]/51);
 return {palette,index};}
export function renderGIF(image,definition){const r=createRenderer(image,definition),count=Math.ceil(r.recipe.duration*r.recipe.fps);
 if(image.width*image.height*count>LIMITS.sheetPixels)throw Error('Animation exceeds 4 MiPixels. Reduce duration, fps or image size.');
 const gif=GIFEncoder();for(let i=0;i<count;i++){
  const {data}=r.render(i);for(let j=0;j<data.length;j+=4){data[j+3]=data[j+3]<128?0:255;if(!data[j+3])data.fill(0,j,j+4);}
  const {palette,index}=indexed(data);
  gif.writeFrame(index,image.width,image.height,{palette,transparent:true,transparentIndex:0,dispose:2,delay:1000/r.recipe.fps,repeat:r.recipe.loop?0:-1});
 }gif.finish();return gif.bytes();
}
