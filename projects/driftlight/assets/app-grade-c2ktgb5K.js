import{t as e}from"/fun/projects/driftlight/assets/app-bootstrap-DYDra2vo.js";import{In as t}from"/fun/projects/driftlight/assets/vendor/three-0.186.1/three-0.186.1-D8ARWj-B.js";import{o as n,t as r}from"/fun/projects/driftlight/assets/vendor/postprocessing-6.39.5/postprocessing-6.39.5-BohjIVUS.js";import{d as i}from"/fun/projects/driftlight/assets/app-shaders-DrqxRWR_.js";var a=`
uniform float uGT, uOceanLift;
uniform vec2 uRes;
${i}
float gh(vec2 p){ vec3 q = fract(vec3(p.xyx)*.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y)*q.z); }
void mainUv(inout vec2 uv){
  float a = uRes.x/uRes.y;
  uv += pressure((uv - .5)*vec2(a, 1.), a).xy/vec2(a, 1.);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  vec3 c = inputColor.rgb;
  c += max(c,0.)*(1.-clamp(c,0.,1.))*.12*uOceanLift;
  float l = dot(c, vec3(.2126, .7152, .0722));
  c += vec3(-.002, .006, .011)*(1. - smoothstep(0., .3, l));          // teal-indigo shadows
  c = mix(c, c*vec3(1.04, 1., .95), smoothstep(.45, 1., l));           // a breath of warmth in the highlights
  c = mix(vec3(l), c, 1.06);
  // The vignette must not swallow the pressure front at the far corners.
  // A restrained scattering highlight is added after the vignette and tone map.
  float aspect = uRes.x/uRes.y;
  float front = pressure((uv - .5)*vec2(aspect, 1.), aspect).z;
  float edge = smoothstep(.3, .7, length(uv - .5));
  c += vec3(.16, .45, .62)*front*(.012 + edge*.035);
  float g = gh(gl_FragCoord.xy + fract(uGT*7.13)*vec2(431., 197.)) - .5;
  c += g*(.0012 + .0018*(1. - smoothstep(0., .2, l)));
  outputColor = vec4(max(c, 0.), inputColor.a);
}
`,o=class extends n{constructor(e){super(`GradeEffect`,a,{blendFunction:r.NORMAL,uniforms:new Map([[`uGT`,new t(0)],[`uOceanLift`,e.uOceanLift],[`uRes`,e.uRes],[`uWaves`,e.uWaves]])})}update(t,n,r){e?this.uniforms.get(`uGT`).value=window.cine?.uniforms?.uTime.value||0:this.uniforms.get(`uGT`).value+=r||0}};export{o as t};