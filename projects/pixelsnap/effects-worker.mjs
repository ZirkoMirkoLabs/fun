import {listEffects,validateRecipe,recipeFor,createRenderer,renderSheet} from './effects-core.mjs';
import {renderGIF} from './effects-export.mjs';
let renderer=null;
self.onmessage=({data:m})=>{try{let result;if(m.type==='list')result=listEffects();
 else if(m.type==='validate')result=validateRecipe(m.recipe);
 else if(m.type==='recipe')result=recipeFor(m.effect);
 else if(m.type==='set'){renderer=createRenderer(m.image,m.recipe);result={recipe:renderer.recipe};}
 else if(m.type==='frame'){if(!renderer)throw Error('Choose an image and effect first.');result=renderer.render(m.frame);}
 else if(m.type==='thumb')result=createRenderer(m.image,recipeFor(m.effect)).render(m.frame);
 else if(m.type==='sheet')result=renderSheet(m.image,m.recipe);
 else if(m.type==='gif')result={data:renderGIF(m.image,m.recipe)};
 else throw Error('Unknown effects request.');self.postMessage({id:m.id,result},result?.data?[result.data.buffer]:[]);
 }catch(e){self.postMessage({id:m.id,error:e.message});}};
