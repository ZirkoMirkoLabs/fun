import{P as e,s as t}from"/fun/projects/driftlight/assets/vendor/three-0.186.1/three-0.186.1-D8ARWj-B.js";import{n,o as r}from"/fun/projects/driftlight/assets/app-shaders-DrqxRWR_.js";function i(){let n=[],r=[],i=[],a=[],o=(e,t,o,s)=>{let c=n.length/3;for(let a=0;a<=o;a++)for(let c=0;c<=s;c++)n.push(0,0,0),r.push(a/o,c/s),i.push(e,t);for(let e=0;e<o;e++)for(let t=0;t<s;t++){let n=c+e*(s+1)+t,r=n+s+1;a.push(n,r,n+1,r,r+1,n+1)}};for(let e=0;e<4;e++)o(0,e,88,10);o(1,0,28,40),o(2,0,42,24);for(let e=0;e<4;e++)o(3,e,140,10);let s=new t;return s.setAttribute(`position`,new e(n,3)),s.setAttribute(`uv`,new e(r,2)),s.setAttribute(`aPart`,new e(i,2)),s.setIndex(a),s}var a=`
${r}
${n}
attribute vec2 aPart;
varying vec2 vUv;
varying vec3 vPos;
varying float vKind;
varying float vId;
void main(){
  float t = uv.x, v = uv.y, kind = aPart.x, id = aPart.y;
  float a = id*1.570796 + .785398;
  vec3 rad = vec3(cos(a), 0., sin(a)), side = vec3(-sin(a), 0., cos(a));
  vec3 p;
  if (kind < .5) {
    float arc = a + 3.141593 + (t - .5)*5.3;
    float tube = (.024 + .006*sin(t*112. + id))*(.25 + .75*sin(t*3.141593));
    float radius = .145 + .008*sin(t*28. + uTime*.6 + id);
    vec3 dir = vec3(cos(arc), 0., sin(arc));
    p = rad*.295 + dir*(radius + cos(v*6.283185)*tube);
    p.y = .33 + sin(v*6.283185)*tube*.72 + .012*sin(t*15. + id);
    p.xz *= 1. - uSwim*.1;
  } else if (kind < 1.5) {
    float phi = t*3.141593, theta = v*6.283185;
    float r = .17*sin(phi)*(1. + .14*cos(theta*4.))*(1. + .06*sin(uTime*2.));
    p = vec3(cos(theta)*r, .35 + cos(phi)*.125, sin(theta)*r);
    p.y += uSp.y*(cos(phi)*.3 - .1);
  } else if (kind < 2.5) {
    float theta = v*6.283185;
    float radius = (.055 + .035*t*t)*(1. + .23*cos(theta*4.));
    radius += .013*exp(-(((t - .96)*25.)*((t - .96)*25.)));
    p = vec3(cos(theta)*radius, .28 - t*.61, sin(theta)*radius);
    p.xz += vec2(sin(uTime*.8 + t*3.), cos(uTime*.65 + t*4.))*.015*t;
  } else {
    float edge = v*2. - 1.;
    float lengthArm = 2.15 + .22*sin(id*2.3);
    float sw = swimLag(t*.24);
    float twist = a + t*.8 + sin(t*5. - uTime*.8 + id)*.18;
    rad = vec3(cos(twist), 0., sin(twist)); side = vec3(-sin(twist), 0., cos(twist));
    float width = (.03 + .135*pow(max(0., sin(t*3.141593)), .7))*(1. + uSp.z*.7);
    p = rad*(.1 + t*.18 + sin(t*4. - uTime*1.1 + id)*.12*t);
    p.y = .045 - t*lengthArm*(1. - sw*.065 - uCharge*.12);
    p += side*edge*width;
    float frill = sin(t*(90. + id*7.) + edge*4. - uTime*1.6 + id);
    p += rad*frill*(.012 + .045*pow(abs(edge), 1.5))*sin(t*3.141593);
    p.y += cos(t*72. + edge*6. + id)*((abs(edge))*(abs(edge)))*.026;
    vec3 lag = t < .5 ? mix(uVel, uVel2, t*2.) : mix(uVel2, uVel3, t*2. - 1.);
    vec3 off = -vec3(lag.x, 0., lag.z)*pow(t, 1.2)*lengthArm*.85;
    off -= cross(uSpin, p)*t*(.4 + t*.45); off.y = 0.;
    p += off;
    float seg = t*lengthArm;
    p.y += seg - sqrt(max(seg*seg - dot(off, off)*.8, seg*seg*.18));
    p.xz *= 1. - uCharge*.3*t;
    p += rad*sin(t*10. - uShockAge*12.)*uPulse*.05*t;
  }
  p = tissue(p);
  vec4 mv = modelViewMatrix*vec4(p, 1.);
  vPos = mv.xyz; vUv = uv; vKind = kind; vId = id;
  gl_Position = projectionMatrix*mv;
}
`,o=`
${r}
varying vec2 vUv;
varying vec3 vPos;
varying float vKind;
varying float vId;
void main(){
  vec2 q = clamp(vUv, vec2(0.), vec2(1.));
  vec3 n = safeNormal(cross(dFdx(vPos), dFdy(vPos)));
  float fresnel = pow(max(0., 1. - abs(dot(n, normalize(-vPos)))), 2.2);
  vec3 cool = mix(pal(q.x*.45 + .32 + vId*.06), vec3(.18, .62, 1.), .26);
  vec3 warm = mix(pal(.08 + vId*.025), vec3(1., .20, .085), .8);
  float light = .06, weight = 1. - uSp.y;
  vec3 color;
  float flow = pow(.5 + .5*sin(q.x*30. - uTime*2.4 + vId), 12.);
  float signal = exp(-(((q.x - uShockAge*1.2)*10.)*((q.x - uShockAge*1.2)*10.)))*uShockAmp;
  if (vKind < .5) {
    // Granular reproductive tissue and a translucent, folded outer wall.
    float granules = pow(.5 + .5*sin(q.x*260. + sin(q.y*50.)*2.), 5.);
    float wall = pow(.5 + .5*cos(q.y*6.283185), 6.);
    color = mix(warm, cool, fresnel*.18);
    light = .065 + fresnel*.2 + granules*.10 + wall*.055 + signal*.24;
    weight *= 1. - uSp.z*.65;
  } else if (vKind < 1.5) {
    float chambers = pow(abs(cos(q.y*12.56637)), 12.);
    float net = pow(max(0., 1. - abs(snoise(vec3(q*20., 4.)))), 18.);
    color = mix(warm, cool, .3);
    light = .035 + fresnel*.14 + chambers*.055 + net*.05 + signal*.12;
    weight = 1.;
  } else if (vKind < 2.5) {
    float folds = pow(.5 + .5*cos(q.y*50.265), 12.);
    color = mix(warm, cool, .6);
    light = .018 + fresnel*.09 + folds*.07 + flow*.025 + signal*.16;
  } else {
    float edge = pow(abs(q.y*2. - 1.), 8.);
    float canal = exp(-(((q.y - .5)*30.)*((q.y - .5)*30.)));
    float cells = pow(.5 + .5*sin(q.x*240. + sin(q.y*38.)*2.), 7.);
    float fringes = edge*(.4 + .6*cells);
    color = mix(cool, warm, .12 + edge*.42);
    light = .014 + fresnel*.10 + fringes*.20 + canal*.10 + cells*.012;
    light += (flow*.035 + signal*.2)*(edge + canal*.6);
    weight *= smoothstep(1., .84, q.x);
  }
  color = amber(color, uSp.z*.82);
  light *= 1. + uCharge*.55 + uPulse*.13;
  gl_FragColor = vec4(color*light*weight*(1. + (uGlow - 1.)*.3), 1.);
}
`;export{i as n,a as r,o as t};