import{n as e}from"/fun/projects/driftlight/assets/rolldown-runtime-WkwZ5CU-.js";import{t}from"/fun/projects/driftlight/assets/app-bootstrap-DYDra2vo.js";import{n,t as r}from"/fun/projects/driftlight/assets/vendor/react-19.3.1/react-19.3.1-CHvf5MSy.js";import{B as i,Ct as a,Xn as o,at as s,m as c,ot as l,qn as u,rt as d,wn as f,xt as p}from"/fun/projects/driftlight/assets/vendor/three-0.186.1/three-0.186.1-D8ARWj-B.js";import{r as m}from"/fun/projects/driftlight/assets/vendor/react-three-fiber-9.8.2/react-three-fiber-9.8.2-DEYGw83e.js";var h=e(n(),1),g=r(),_=`varying vec2 vNdc;void main(){vNdc=position.xy;gl_Position=vec4(position.xy,.99999,1.);}`,v=`
varying vec2 vNdc;
uniform float uTime,waterY,waterQuality,reflectionReady;
uniform mat4 cameraWorld,projectionInverse;
uniform vec3 eye, fogTint;
uniform sampler2D reflectionMap, refractionMap;
uniform float refractionReady;
float wave(vec2 p){return sin(p.x*.73+sin(p.y*.47+uTime*.19))*.5+sin(p.y*1.13-p.x*.28-uTime*.16)*.25;}
float shaftAt(vec3 p){
 vec2 q=p.xz+vec2(-.35,.31)/.87*max(waterY-p.y,0.);
 float s=exp(-dot((q-vec2(-1.,.5))*vec2(.5,.7),(q-vec2(-1.,.5))*vec2(.5,.7)));
 s+=.7*exp(-dot(q-vec2(-8.,-11.),q-vec2(-8.,-11.))*.13);
 s+=.6*exp(-dot(q-vec2(6.,-18.),q-vec2(6.,-18.))*.17);
 s+=.5*exp(-dot(q-vec2(3.,-31.),q-vec2(3.,-31.))*.1);
 float threads=.58+.42*pow(.5+.5*sin(q.x*3.+sin(q.y*2.3+uTime*.15)+uTime*.11),3.);
 return s*threads;
}
void main(){
 vec4 v=projectionInverse*vec4(vNdc,1.,1.);
 vec3 ray=normalize(mat3(cameraWorld)*(v.xyz/v.w));
 float depth=max(.08,waterY-eye.y),dist=depth/max(.015,ray.y);
 vec3 absorb=vec3(.16,.050,.028);
 vec3 base=fogTint;
 float up=smoothstep(-.08,.9,ray.y);
 vec3 color=mix(base,vec3(.025,.11,.14)*exp(-absorb*depth),up);
 // Integrate the water volume, not a camera-facing card. The same four
 // world-space pools illuminate the seabed and chest.
 float path=ray.y>.015?min(50.,dist):50.;
 vec3 scatter=vec3(0.);float steps=waterQuality>.5?12.:6.;
 float phase=.10+.065/pow(max(.15,1.3025-1.10*dot(ray,normalize(vec3(-.35,.87,.31)))),1.5);
 for(int i=0;i<16;i++){
   if(float(i)>=steps)break;
   float d=(float(i)+.5)*path/steps;
   vec3 p=eye+ray*d;
   scatter+=exp(-absorb*(d+max(0.,waterY-p.y)))*shaftAt(p)*(path/steps);
 }
 // Meet the terrain fog at the horizon; a hard branch here reads as a world edge.
 float horizonFade=smoothstep(0.,.22,ray.y);
 color+=scatter*vec3(.07,.18,.21)*phase*horizonFade;
 if(ray.y>.015){
   vec3 hit=eye+ray*dist;vec2 q=hit.xz;
   vec2 slope=vec2(wave(q+vec2(.09,0.))-wave(q-vec2(.09,0.)),wave(q+vec2(0.,.09))-wave(q-vec2(0.,.09)))*.65;
   vec3 n=normalize(vec3(-slope.x,1.,-slope.y));
   float cosine=clamp(dot(ray,n),0.,1.);
   // Water/air IOR 1.333 -> critical cosine .6614 (48.6 degree half-angle).
   float k=1.-1.333*1.333*(1.-cosine*cosine);
   float windowMask=smoothstep(-.025,.035,k);
   float fresnel=.02037+.97963*pow(1.-cosine,5.);
   vec3 airRay=refract(-ray,-n,1.333);
   float sky=pow(max(0.,-airRay.y),.45);
   float solar=pow(max(0.,dot(-airRay,normalize(vec3(-.35,.87,.31)))),180.);
   vec3 daylight=mix(vec3(.045,.13,.17),vec3(.19,.38,.43),sky)+solar*vec3(1.1,1.25,1.15);
   vec2 screen=vNdc*.5+.5;
   vec2 warp=slope*.028;
   vec2 uv=clamp(screen+warp,vec2(.002),vec2(.998));
   vec3 reflected=vec3(texture2D(reflectionMap,clamp(uv+warp*.12,vec2(.002),vec2(.998))).r,texture2D(reflectionMap,uv).g,texture2D(reflectionMap,clamp(uv-warp*.12,vec2(.002),vec2(.998))).b);
   reflected=mix(vec3(.008,.033,.042),reflected,reflectionReady);
   // A thin, refractively distorted scene veil survives at the window rim.
   vec3 transmittedScene=vec3(
     texture2D(refractionMap,clamp(screen+warp*1.12,vec2(.002),vec2(.998))).r,
     texture2D(refractionMap,clamp(screen+warp,vec2(.002),vec2(.998))).g,
     texture2D(refractionMap,clamp(screen+warp*.88,vec2(.002),vec2(.998))).b);
   vec3 refracted=mix(daylight,transmittedScene,.13*(1.-sky)*refractionReady);
   vec3 surface=mix(reflected,refracted,windowMask*(1.-fresnel));
   float filigree=pow(max(0.,1.-abs(wave(q*2.7+vec2(wave(q*1.2),wave(q*.8+7.))*2.4))),28.);
   surface+=vec3(.008,.018,.022)*filigree;
   surface*=exp(-absorb*dist*.42);
   color=mix(color,surface,smoothstep(.02,.16,ray.y));
   color+=scatter*vec3(.025,.065,.075)*phase*horizonFade;
 }
 float deep=1.-exp(-max(0.,depth-7.)*.12);
 color=mix(color,vec3(.00025,.0012,.0028),deep*(1.-smoothstep(.15,.8,ray.y))*.9);
 gl_FragColor=vec4(color,1.);
}`;function y({U:e,st:n}){let r=(0,h.useMemo)(()=>{let t=new o(384,240,{type:i,depthBuffer:!0});t.texture.name=`Low resolution water scene reflection`;let n=new o(384,240,{type:i,depthBuffer:!0});n.texture.name=`Screen-space water refraction scene`;let r={refractionMap:{value:n.texture},refractionReady:{value:0},uTime:e.uTime,waterY:{value:4.6},waterQuality:{value:1},reflectionReady:{value:0},cameraWorld:{value:new s},projectionInverse:{value:new s},eye:{value:new u},reflectionMap:{value:t.texture}};r.fogTint={value:new c(`#031a22`)};let d=new f({uniforms:r,vertexShader:_,fragmentShader:v,depthWrite:!1,depthTest:!1}),m=new l(new a(2,2),d);return m.name=`Snell window / total internal reflection`,m.frustumCulled=!1,m.renderOrder=-20,{mesh:m,rt:t,refraction:n,uniforms:r,mirror:new p,forward:new u,up:new u,target:new u,hidden:[],frame:0}},[e]);return m(({camera:e,scene:i,gl:a,size:o})=>{let s=r,c=s.uniforms,l=o.width<600;i.fog&&c.fogTint.value.copy(i.fog.color),s.mesh.updateWorldMatrix(!0,!1);let u=4.6+s.mesh.matrixWorld.elements[13];c.waterY.value=u,c.waterQuality.value=+!l,e.updateMatrixWorld(),c.cameraWorld.value.copy(e.matrixWorld),c.projectionInverse.value.copy(e.projectionMatrixInverse),c.eye.value.copy(e.position);let f=i.getObjectByName(`Ocean backdrop`);f&&(f.visible=!1);let p=i.getObjectByName(`Undulating water ceiling`);if(p&&(p.visible=!1),t&&(c.reflectionReady.value=0,c.refractionReady.value=0),e.getWorldDirection(s.forward),u-e.position.y>9&&s.forward.y<.35||s.forward.y+Math.sin(d.degToRad(e.fov*.5))<.08)return;let m=t?null:n.current.quality;if(!t&&s.frame++%Math.round((l?8:6)*(m?.waterEvery||1))!==0)return;let h=(l?.22:.32)*(m?.water||1),g=Math.max(64,Math.round(o.width*h)),_=Math.max(64,Math.round(o.height*h));(s.rt.width!==g||s.rt.height!==_)&&(s.rt.setSize(g,_),s.refraction.setSize(g,_));let v=s.mirror;v.copy(e),v.position.y=2*u-e.position.y,e.getWorldDirection(s.forward),s.forward.y*=-1,s.target.copy(v.position).add(s.forward),s.up.set(0,1,0).applyQuaternion(e.quaternion),s.up.y*=-1,v.up.copy(s.up),v.lookAt(s.target),v.updateMatrixWorld();let y=a.getRenderTarget(),b=a.autoClear,x=a.shadowMap.autoUpdate;s.mesh.visible=!1,a.shadowMap.autoUpdate=!1,a.autoClear=!0;let S=s.hidden;S.length=0,i.traverse(e=>{e.visible&&e.material?.transmission>0&&(S.push(e),e.visible=!1)});try{a.setRenderTarget(s.rt),a.clear(),a.render(i,v),c.reflectionReady.value=1,e.getWorldDirection(s.forward),s.forward.y>.25&&(a.setRenderTarget(s.refraction),a.clear(),a.render(i,e),c.refractionReady.value=1)}finally{a.setRenderTarget(y),a.autoClear=b,a.shadowMap.autoUpdate=x,s.mesh.visible=!0,S.forEach(e=>{e.visible=!0})}},.78),(0,h.useEffect)(()=>()=>{r.mesh.geometry.dispose(),r.mesh.material.dispose(),r.rt.dispose(),r.refraction.dispose()},[r]),(0,g.jsx)(`primitive`,{object:r.mesh})}export{y as t};