import{o as e}from"/fun/projects/driftlight/assets/app-shaders-DrqxRWR_.js";var t=`
${e}
uniform vec3 uSwarmCamera;
attribute vec4 aJ;
attribute vec2 aPart;
uniform float uSwarm;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
varying float vKind, vSeed, vFade, vDetail, vLit, vSwim;

vec3 schoolBell(vec3 q, float phase, float seed){
  float lower = 1. - smoothstep(-.12, .5, q.y);
  float sw = swimF(phase - lower*.075);
  float ang = atan(q.z, q.x);
  float scallop = lower*(.025*sin(ang*16. + seed*9.) + .009*sin(ang*40. - phase*6.283));
  float r = (1. - sw*.24*lower + scallop)*(1. + .035*sin(phase*6.283));
  float tall=step(.66,seed);
  float y = q.y > 0. ? q.y*(.66 + seed*.16+tall*.43) : q.y*mix(-.23,.65,tall);
  r*=1.-tall*.4;
  y = y*(1. + sw*.12) + sw*.06*lower;
  return vec3(q.x*r, y, q.z*r);
}
vec3 orient(vec3 p, float yaw, float lean, float pitch){
  float c = cos(yaw), s = sin(yaw);
  p.xz = mat2(c, -s, s, c)*p.xz;
  c = cos(pitch); s = sin(pitch);
  p.yz = mat2(c, -s, s, c)*p.yz;
  c = cos(lean); s = sin(lean);
  p.xy = mat2(c, -s, s, c)*p.xy;
  return p;
}
void main(){
  float seed = aJ.w, depth = aJ.z, kind = aPart.x, id = aPart.y;
  float period = 2.2 + seed*2.3;
  float clock = uTime/period + seed*11.;
  float phase = fract(clock), sw = swimF(phase);
  // Forward distance accumulates mainly during the power stroke, then coasts.
  float travel = floor(clock) + smoothstep(0., .45, phase);
  float z = -2.2 - depth*14. + sin(uTime*.09 + seed*20.)*.3;
  float hh = (6.5 - z)*.364, hw = hh*uRes.x/uRes.y;
  float spanX = hw*2. + 4., spanY = hh*2. + 5.;
  float xRaw = (aJ.x - .5)*spanX + sin(uTime*.055 + seed*17.)*.75 + sin(uTime*.012 + seed)*travel*.025;
  float yRaw = (aJ.y - .5)*spanY + travel*(.22 + seed*.16);
  vec3 center = vec3(mod(xRaw - uSwarmCamera.x + spanX*.5, spanX) - spanX*.5 + uSwarmCamera.x,
                     mod(yRaw - uSwarmCamera.y + spanY*.5, spanY) - spanY*.5 + uSwarmCamera.y, z);
  float sizeJ = (.31 + .33*fract(seed*7.31))*(1. + depth*.5);
  float lean = sin(uTime*.13 + seed*16.)*.22 + cos(uTime*.055 + seed*17.)*.16;
  float yaw = seed*6.283 + sin(uTime*.06 + seed*3.)*.5;
  float pitch = .2 + sin(uTime*.095 + seed*7.)*.14;
  float t = uv.x, v = uv.y, a = id*1.570796 + .785398;
  vec3 p, n = vec3(0., 0., 1.);
  if (kind < .5) {
    float phi = t*3.141593, theta = v*6.283185;
    vec3 unit = vec3(sin(phi)*cos(theta), cos(phi), sin(phi)*sin(theta));
    p = schoolBell(unit, phase, seed);
    vec3 tangent = vec3(-sin(theta), 0., cos(theta));
    vec3 bitangent = cross(unit, tangent);
    n = safeNormal(cross(schoolBell(normalize(unit + tangent*.012), phase, seed) - p,
                        schoolBell(normalize(unit + bitangent*.012), phase, seed) - p));
  } else if (kind < 1.5) {
    float arc = a + 3.141593 + (t - .5)*5.25;
    vec3 radial = vec3(cos(arc), 0., sin(arc));
    float tube = .022*(.4 + .6*sin(t*3.141593));
    n = radial*cos(v*6.283185) + vec3(0., sin(v*6.283185), 0.);
    p = vec3(cos(a), 0., sin(a))*.28 + radial*.14 + n*tube;
    p.y += .31; p.xz *= 1. - sw*.12;
  } else if (kind < 2.5) {
    a = id/24.*6.283185;
    vec3 radial = vec3(cos(a), 0., sin(a)), side = vec3(-sin(a), 0., cos(a));
    p = schoolBell(radial, phase, seed);
    float len = 1.7 + fract(sin(id*12.43 + seed*5.)*43758.5)*1.7;
    len*=mix(1.,.24,step(.66,seed));
    p.y -= t*len*(1. - swimF(phase - t*.24)*.06);
    p += radial*(sin(t*1.7)*.18 - sw*t*.1);
    p += side*sin(t*7. - uTime*1.3 + seed*19. + id*1.7)*.13*t;
    p.x += sin(t*4. - uTime*.5 + seed*12.)*.18*t + lean*t*t*len*.55;
    p.z += cos(t*5. - uTime*.4 + id)*.13*t;
    n = radial*cos(v*6.283185) + side*sin(v*6.283185);
    float pixel = (6.5 - z)*.728/uRes.y/max(sizeJ, .1);
    p += n*max((.005 + depth*.005)*(1. - t*.7), pixel*.58);
  } else if (kind < 3.5) {
    float edge = v*2. - 1., twist = a + t*.7;
    vec3 radial = vec3(cos(twist), 0., sin(twist)), side = vec3(-sin(twist), 0., cos(twist));
    float w = .025 + .12*sin(t*3.141593);
    p = radial*(.11 + t*.18);
    p.y = .06 - t*(2.05 + seed*.3)*(1. - sw*.06);
    p += side*edge*w;
    p += radial*sin(t*80. + edge*4. - uTime*1.4 + id)*(.01 + abs(edge)*.04)*sin(t*3.141593);
    p.x += lean*t*t*1.3 + sin(t*4. - uTime*.5 + seed*12.)*.18*t;
    p.z += cos(t*5. - uTime*.4 + id)*.1*t;
    n = normalize(radial + side*cos(t*80. + edge*4.)*.5);
  } else {
    float phi = t*3.141593, theta = v*6.283185;
    n = vec3(sin(phi)*cos(theta), cos(phi), sin(phi)*sin(theta));
    p = n*vec3(.13, .17, .13); p.y += .27;
  }
  p = orient(p, yaw, lean, pitch)*sizeJ + center;
  n = orient(n, yaw, lean, pitch);
  vec4 mv = modelViewMatrix*vec4(p, 1.);
  gl_Position = projectionMatrix*mv;
  vec4 cp = projectionMatrix*modelViewMatrix*vec4(center, 1.);
  vec2 sp = cp.xy/cp.w*.5*vec2(uRes.x/uRes.y, 1.);
  float fade = (1. - smoothstep(hw + .5, hw + 1.8, abs(center.x - uSwarmCamera.x)))
             *(1. - smoothstep(hh + 1., hh + 2.3, abs(center.y - uSwarmCamera.y)));
  float nearFade=smoothstep(.5,2.2,-mv.z);
  vec2 ndc=gl_Position.xy/max(.001,gl_Position.w);
  float edgeFade=1.-smoothstep(.78,1.,max(abs(ndc.x),abs(ndc.y)));
  float strandFade=kind>1.5&&kind<3.5?mix(edgeFade,1.,smoothstep(2.,5.,-mv.z)):1.;
  vFade = fade*uSwarm*mix(.42, .10, depth)*nearFade*strandFade;
  vLit = shaft(sp);
  vDetail = 1. - smoothstep(.18, .9, depth);
  vUv = uv; vKind = kind; vSeed = seed; vSwim = sw;
  vN = safeNormal(normalMatrix*n); vV = normalize(-mv.xyz);
}
`,n=`
${e}
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
varying float vKind, vSeed, vFade, vDetail, vLit, vSwim;
void main(){
  vec2 q = clamp(vUv, vec2(0.), vec2(1.));
  if (vFade < .002) discard;
  float f = max(0., 1. - abs(dot(safeNormal(vN), normalize(vV))));
  float fr = pow(f, mix(2., 3.4, vDetail));
  vec3 cool = mix(pal(.32 + vSeed*.7), vec3(.34, .65, .92), .42);
  vec3 warm = mix(pal(vSeed*.3), vec3(1., .3, .13), .68);
  float lum; vec3 color;
  if (vKind < .5) {
    float y = cos(q.x*3.141593), angle = q.y*6.283185;
    float canals = pow(abs(cos(angle*8. + sin(y*6.)*.1)), 90.)*smoothstep(-.05, .12, y)*smoothstep(.98, .6, y);
    float ring = exp(-((y/.035)*(y/.035)));
    float rhop = pow(abs(cos(angle*4.)), 150.)*ring;
    float folds = pow(.5 + .5*cos(sin(q.x*3.141593)*100.), 8.)*smoothstep(.6, .0, abs(y));
    float cells = pow(.5 + .5*sin(angle*55. + sin(y*64.)), 16.)*smoothstep(0., .2, y);
    color = cool;
    lum = .018 + fr*.34 + ring*.19 + (canals*.23 + folds*.025 + cells*.025)*vDetail;
    color = color*lum + warm*rhop*.3;
    float comb=step(.66,vSeed)*pow(abs(cos(angle*4.)),60.);
    color+=mix(vec3(.8,.92,1.),rainbowAt(y*.7-uTime*.12),.5)*comb*.14;

  } else if (vKind < 1.5) {
    color = warm*(.09 + fr*.23 + .025*sin(q.x*150.));
  } else if (vKind < 2.5) {
    float glint = pow(.5 + .5*sin(q.x*35. - uTime*1.6 + vSeed*9.), 18.);
    color = cool*(.18 + glint*.25)*pow(1. - q.x*.8, 1.1);
  } else if (vKind < 3.5) {
    float edge = pow(abs(q.y*2. - 1.), 6.);
    float canal = exp(-(((q.y - .5)*20.)*((q.y - .5)*20.)));
    color = mix(cool, warm, edge*.45)*(.025 + fr*.06 + edge*.15 + canal*.08)*(1. - q.x*.75);
  } else {
    color = warm*(.035 + fr*.12);
  }
  // Atmospheric scattering removes fine contrast with distance; distant silhouettes
  // and thicker, dimmer filaments soften naturally under the bloom pyramid.
  color *= vFade*(.48 + vLit*2.1);
  gl_FragColor = vec4(color, 1.);
}
`;export{t as n,n as t};