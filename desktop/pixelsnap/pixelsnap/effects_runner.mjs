// Fixed Node entry point. Never import a path or executable source supplied in a request.
import {listEffects,validateRecipe,recipeFor,createRenderer,renderSheet} from './effects_runtime/effects-core.mjs';
import {renderGIF} from './effects_runtime/effects-export.mjs';
let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>1600000)throw Error('Request too large.');}
try{const m=JSON.parse(text);let result;
 if(m.type==='list')result=listEffects();
 else if(m.type==='validate')result=validateRecipe(m.recipe);
 else if(m.type==='recipe')result=recipeFor(m.effect);
 else {const image={width:m.width,height:m.height,data:new Uint8ClampedArray(Buffer.from(m.rgba,'base64'))},recipe=m.recipe??recipeFor(m.effect);
  if(m.type==='frame')result=createRenderer(image,recipe).render(m.frame??0);
  else if(m.type==='sheet')result=renderSheet(image,recipe);
  else if(m.type==='gif')result={data:renderGIF(image,recipe)};
  else throw Error('Unknown operation.');
  result={...result,data:Buffer.from(result.data).toString('base64')};
 }process.stdout.write(JSON.stringify({result}));
}catch(e){process.stdout.write(JSON.stringify({error:e.message}));process.exitCode=1;}
