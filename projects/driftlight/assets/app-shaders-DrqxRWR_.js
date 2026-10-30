var e=`
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g;
  vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`,t=`
uniform vec4 uWaves[4];
vec3 pressure(vec2 p, float asp){
  vec3 result = vec3(0.);
  for (int i = 0; i < 4; i++) {
    vec4 w = uWaves[i];
    if (w.w < .001 || w.z < 0. || w.z > 10.) continue;
    vec2 d = p - w.xy;
    float dist = max(length(d), .001), radius = w.z*.64;
    float reach = length(abs(w.xy) + vec2(asp*.5, .5));
    float alive = 1. - smoothstep(reach + .12, reach + .48, radius);
    float width = .018 + radius*.014;
    float front = dist - radius;
    float crest = exp(-((front/width)*(front/width)));
    float wake = sin(front*95.)*exp(-((front/(width*2.8))*(front/(width*2.8))));
    float strength = min(w.w, 2.)*alive/(1. + radius*.23);
    result.xy += d/dist*(crest*.004 + wake*.003)*strength;
    result.z += crest*strength;
  }
  return result;
}
`,n=`
uniform float uTime, uSwim, uPulse, uCharge, uGlow, uPR, uHue, uPhase, uIdle, uIris, uNotice, uShockAge, uShockAmp;
uniform vec3 uA, uB, uC, uD, uVel, uVel2, uVel3;
uniform vec3 uSp;   // species weights (moon, comb, mane); crossfades when switching
uniform vec2 uRes, uShockS;   // drawing-buffer size; the pulse centre in screen units (y in -.5..5)
uniform float uShaft, uDim;   // light-column boost after a release; world dimming while charging
uniform vec3 uSpin;           // the bell's angular velocity in its own frame (tentacles lag turns)
uniform float uBody;
uniform vec2 uFlex;
uniform vec3 uCamera;
uniform vec3 uCenter;
${t}
vec3 pal(float t){ return uA + uB*cos(6.28318*(uC*t + uD + uHue)); }
// lion's mane: pull a colour toward amber while keeping its brightness
vec3 amber(vec3 c, float k){ return mix(c, dot(c, vec3(.3, .5, .2))*vec3(1.5, .95, .42), k); }
vec3 rainbowAt(float x){ return .5 + .5*cos(6.28318*(x + vec3(0., .33, .67))); }
vec3 safeNormal(vec3 v){ return v*inversesqrt(max(dot(v, v), 1e-12)); }
float sq(float x){ return x*x; }
// mirrors swimAt() in App.jsx: quick contraction, long glide
float swimF(float ph){ ph = fract(ph); return ph < .22 ? sin(ph/.22*1.5708) : pow((1. - ph)/.78, 2.2); }
float swimLag(float lag){ return swimF(uPhase - lag)*(1. - uCharge*.7) + uCharge*.78; }   // charging squeezes and holds
float hash12(vec2 p){ vec3 q = fract(vec3(p.xyx)*.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y)*q.z); }
${e}
// One cathedral column of light falls from above the frame, slightly right of centre.
// p: aspect-corrected screen position, y in -.5..5.
vec3 shaftCol(){ return mix(vec3(.3, .7, .86), pal(.55), .22); }
float shaft(vec2 p){
  p += vec2(sin(uCamera.x*.09)*.24, sin(uCamera.y*.055)*.13);
  vec2 d = p - vec2(.14, .98);
  float ang = atan(d.x, -d.y) + .06, r = length(d);
  float cone = smoothstep(.46, .0, abs(ang));
  float rays = .5 + .5*snoise(vec3(ang*7.5, uTime*.045, 2.));
  rays = rays*rays*(.75 + .25*sin(ang*29. + uTime*.09)) + .12;
  return cone*rays*exp(-r*1.05)*(1. + uShaft*.9)*(1. - uDim*.4);
}
`,r=`
vec3 tissue(vec3 q){
  // Approximately preserve volume as the axial spring compresses and rebounds.
  float compression = clamp(uBody, -.24, .3)*(1. - uSp.y*.65);
  q.xz *= inversesqrt(max(.65, 1. - compression));
  q.y = (q.y - .18)*(1. - compression) + .18;
  q.xz += uFlex*(q.y*q.y + .12)*1.8;
  q.y += dot(q.xz, uFlex)*.55;
  return q;
}
vec3 bell(vec3 p){
  float y = p.y;
  vec3 q = p;
  // moon: dome + concave underside; comb: tall closed lemon; mane: flat, shallow
  float topK = .8 + uSp.y*.5 - uSp.z*.3, botK = -.32 + uSp.y*1.02 + uSp.z*.12;
  q.y = y > 0. ? y*topK : y*botK;
  float lower = 1. - smoothstep(-.15, .35, y);   // rim + underside
  float ang = atan(p.z, p.x);
  float sw = swimLag(lower*.07)*(1. - uSp.y*.8); // the margin lags the contraction (comb jellies barely pulse)
  float antic = smoothstep(.8, .97, fract(uPhase))*(1. - uCharge);   // inhale before each stroke
  float n = snoise(p*1.3 + vec3(0., uTime*.28, 0.));
  float r = 1. + n*.032*(1. - uSp.y*.6)*(.6 + sw*.6) + antic*.045;
  r += lower*(.03*sin(ang*16. + uTime*.8) + .012*sin(ang*46. - uTime*2.3)*(1. + sw))*(1. - uSp.y);   // scallops + frill
  r -= uSp.z*lower*.13*pow(1. - abs(sin(ang*4.)), 6.);         // mane: eight lobes split by clefts
  r += uPulse*.065*sin(y*10. - uShockAge*15.)*(1. - abs(y)); // a release ripples from crown to margin
  r += lower*.018*sin(ang*3. - uShockAge*12.)*uPulse;
  r *= 1. - sw*.22*lower;                                      // contraction
  q.xz *= r*(1. - uSp.y*(.4 + .14*smoothstep(.4, 1., y)) + uSp.z*.12);   // comb: narrow sac, slightly tapered aboral end
  q.y = q.y*mix(1., r, .5)*(1. + sw*.1 - antic*.04) + sw*.08*lower - sw*.03 - uSp.y*.05;   // squash & stretch
  return tissue(q);
}
`,i=`
${n}
${r}
varying vec3 vBellWorld; varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vY; varying float vNs; varying float vAng; varying float vRim;
void main(){
  vec3 p = normalize(position);
  vec3 q = bell(p);
  vec3 t = normalize(cross(p, abs(p.y) < .99 ? vec3(0.,1.,0.) : vec3(1.,0.,0.)));
  vec3 b = cross(p, t);
  vec3 n = normalize(cross(bell(normalize(p + t*.01)) - q, bell(normalize(p + b*.01)) - q));
  vec4 mv = modelViewMatrix*vec4(q, 1.);
  vBellWorld=(modelMatrix*vec4(q,1.)).xyz;
  vN = normalize(normalMatrix*n);
  vV = normalize(-mv.xyz);
  vY = p.y;
  vP = p;
  vAng = atan(p.z, p.x);
  vRim = 1. - smoothstep(-.15, .35, p.y);
  vNs = snoise(p*2.2 + uTime*.15);
  gl_Position = projectionMatrix*mv;
}
`,a=`
${n}
uniform float uLayer;
varying vec3 vBellWorld; varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vY; varying float vNs; varying float vAng; varying float vRim;
void main(){
  float ndv = abs(dot(normalize(vN), normalize(vV)));
  float f = max(0., 1. - ndv);
  float fr = pow(f, 3.2) + pow(f, 9.)*.6;            // soft body, crisp silhouette
  float top = smoothstep(-.12, .2, vY);
  vec3 base = pal(f*.55 + vNs*.25 + vY*.3 + uTime*.012);
  base *= mix(vec3(1.), rainbowAt(f*.32 + vY*.08 + .52)*1.35 + .28, .32);
  base = mix(base, base*vec3(.45, .82, 1.3), .3);
  vec3 warm = pal(.08 + uTime*.015);
  float sss = ((ndv)*(ndv))*smoothstep(-.2, .7, vY);          // light seen through the jelly from the core
  if (uLayer > .5) {                                           // inner membrane: a faint second skin
    // Subumbrellar circular muscle fibres, radial septa and the fine nerve net.
    float muscle = pow(.5 + .5*cos(length(vP.xz)*175. + sin(vAng*16.)*.45), 14.);
    muscle *= smoothstep(.12, .4, length(vP.xz))*smoothstep(1., .75, length(vP.xz));
    float nerves = pow(max(0., 1. - abs(snoise(vP*19.))), 28.);
    float radial = pow(abs(cos(vAng*16. + sin(vY*14.)*.22)), 120.);
    vec3 skin = (base*(.005 + sss*.027 + fr*.065 + muscle*.07 + nerves*.045 + radial*.045) + warm*sss*uCharge*.07)*(1. + uPulse*.3)*uGlow;
    skin += amber(warm, 1.)*sss*uSp.z*.07;                      // mane: a warm glow deep in the dome
    gl_FragColor = vec4(amber(skin, uSp.z*.85)*(1. - uSp.y*.5), 1.);
    return;
  }

  // anatomy painted on the umbrella: radial canals, a ring canal, rhopalia, speckle
  float moonOnly = 1. - uSp.y;                                 // a comb jelly has none of this
  float canal = pow(abs(cos(vAng*8. + sin(vY*6.)*.13)), 150.)*top*smoothstep(.97, .6, vY);
  canal += pow(abs(cos(vAng*16. + .24 + sin(vY*11.)*.3)), 220.)*smoothstep(.7, .15, vY)*top*.65;
  canal += pow(abs(cos(vAng*32. + sin(vY*19. + vAng*8.)*.45)), 260.)*smoothstep(.42, .08, vY)*top*.38;
  canal += uSp.z*pow(abs(cos(vAng*32. + vNs*.6)), 40.)*smoothstep(.85, .1, vY)*top*.45;   // mane: fine radial pleats
  canal *= moonOnly*(.4 + .6*ndv);
  float ringC = exp(-(((vY + .015)/.018)*((vY + .015)/.018)))*moonOnly;
  ringC += exp(-(((vY - .045)/.012)*((vY - .045)/.012)))*.3*moonOnly;
  float rhop = pow(abs(cos(vAng*4.)), 260.)*exp(-(((vY + .04)/.07)*((vY + .04)/.07)))*moonOnly;
  vec2 g = vec2(vAng*22., vY*26.);
  float h = hash12(floor(g) + 7.);
  float speck = smoothstep(.2, .05, length(fract(g) - .5 + (h - .5)*.3))*step(.62, h)*top*(.5 + .5*sin(uTime*1.7 + h*40.));

  // pulse: a band of light rolls from the apex down to the margin
  float front = 1. - uShockAge*1.7;
  float band = exp(-(((vY - front)*7.)*((vY - front)*7.)))*uShockAmp*max(0., 1. - uShockAge/1.2);

  float nerve = pow(max(0., 1. - abs(snoise(vP*23. + vec3(0., 0., 1.)))), 35.)*top;
  float nerveSignal = .25 + .75*pow(.5 + .5*sin(vY*18. - uTime*2. + vAng*2.), 6.);
  float lum = .008 + fr*.25 + sss*(.024 + uCharge*.085) + canal*.28 + ringC*vRim*.29 + speck*.24 + band*.42;
  lum += nerve*nerveSignal*.065*moonOnly;
  lum *= (1. + uNotice*.35 + uPulse*.15)*(1. - uSp.y*.4 - uSp.z*.5);
  vec3 col = base*lum + warm*(rhop*(1.5 + uNotice*1.4) + sss*uCharge*.3);

  col = amber(col, uSp.z*.95);
  // the column of light above catches the upper rim
  float sky = max(dot(normalize(vN), normalize(vec3(.12, 1., .25))), 0.);
  col += shaftCol()*sky*sky*fr*(.1 + uShaft*.2)*(1. - uSp.z*.5);

  vec2 causticUV=(vBellWorld.xz+vec2(-.35,.31)*max(0.,4.6-vBellWorld.y))*3.;
  float causticBand=sin(causticUV.x+sin(causticUV.y*1.3+uTime*.23))*sin(causticUV.y*1.2-sin(causticUV.x-uTime*.17));
  float web=1.-smoothstep(.015,.10+fwidth(causticBand),abs(causticBand));
  col+=vec3(.09,.21,.24)*web*top*exp(-max(0.,4.6-vBellWorld.y)*.08);
  // the rare surprise: comb-jelly rainbow cilia ripple along eight meridians.
  // On the comb species the eight rows run pole to mouth and never stop shimmering.
  float rows = mix(top, smoothstep(-.92, -.62, vY)*smoothstep(.99, .86, vY), uSp.y);
  float comb = pow(abs(cos(vAng*4. + .39)), 10. + uSp.y*70.)*rows;
  vec3 rainbow = rainbowAt(vY*2.6 - uTime*1.6);
  float plates = (.7 + .5*sin(vY*(60. + uSp.y*70.) - uTime*14.))*mix(1., .25 + .75*smoothstep(.2, .9, sin(vY*3. - uTime*1.7 + vAng)), uSp.y);   // metachronal wave packets
  col += rainbow*comb*max(uIris, uSp.y*.38)*mix(plates, .55 + .9*pow(max(0., plates - .2), 3.), uSp.y);
  col += rainbow*pow(abs(cos(vAng*4. + .39)), 3.)*rows*uSp.y*.05;        // faint iridescent haze between rows
  gl_FragColor = vec4(col*(1. + (uGlow - 1.)*.4), 1.);
}
`,o=`
${n}
${r}
attribute vec4 aS;      // angle, rim radius (moon) or bell latitude (comb/mane) / gonad edge, length, phase
attribute float aT;     // 0 at the bell, 1 at the tip
attribute float aK;     // 0 tentacle, 1 oral arm, 2 gonad
uniform float uSize, uSpId;
uniform mat4 uChestInverse;
varying float vChestClearance;
varying float vT; varying float vPh; varying float vK; varying float vSpark; varying float vWave;
void main(){
  float a = aS.x, R = aS.y, L = aS.z, ph = aS.w, t = aT;
  bool comb = uSpId > .5 && uSpId < 1.5, mane = uSpId > 1.5;
  vec3 p; vWave = 0.;
  if (aK > 1.5) {                                  // four horseshoes, open toward the rim
    float ra = a + 3.14159 + (t - .5)*5.4;
    vec2 c = vec2(cos(a), sin(a))*.25;
    float rr = .14 + R*.04 + .012*sin(ra*3. + uTime*.8 + ph);
    p = vec3(c.x + cos(ra)*rr, .3 + uSwim*.04, c.y + sin(ra)*rr);
    p.xz *= 1. - uSwim*.16;
    vWave = exp(-(((uShockAge*1.7 - .3)*5.)*((uShockAge*1.7 - .3)*5.)))*uShockAmp;
  } else {
    bool arm = aK > .5;
    float sw = swimLag(t*(arm ? .2 : .3));         // the stroke travels down the length
    vec2 dir = vec2(cos(a), sin(a));
    vec3 rad = vec3(dir.x, 0., dir.y);
    vec3 side = vec3(-dir.y, 0., dir.x);
    if (uSpId < .5) {
      p = arm ? tissue(vec3(dir.x*R, .08, dir.y*R)) : bell(vec3(dir.x, 0., dir.y));
    } else {
      float c = sqrt(max(0., 1. - R*R));
      p = bell(vec3(dir.x*c, R, dir.y*c));
    }
    float gather = 1. - uCharge*.6;                  // charging draws the strands in
    float spread = (comb ? .05 : mane ? (arm ? .12 : .34) - sw*.14 + uIdle*.08
                 : (arm ? .06 : .24) - sw*.1 + uIdle*.06)*gather;
    p.xz += dir*sin(t*1.6)*spread;
    p.y -= t*L*(1. - sw*.05 - uCharge*.12);
    float wave = sin(t*(arm ? 5. : mane ? 6. : 8.) - uTime*2. + ph);
    p += side*wave*(arm ? (mane ? .2 : .14) : comb ? .07 : .1)*t;
    if (arm) {                                     // ruffled frills along the arm (mane: a wide curtain)
      float fp = t*(mane ? 90. : 64.) - uTime*2.2 + ph*3.;
      float w = (.035 + .05*sin(t*3.14159))*sqrt(t)*(mane ? 2.2 : 1.);
      p += (rad*sin(fp) + side*cos(fp)*.6)*w;
    }
    float nAmp = mane ? .26 + L*.09 : .26;         // long lion's-mane hair wanders more
    p.x += snoise(vec3(t*1.7, ph, uTime*.25))*nAmp*t;
    p.z += snoise(vec3(ph + 9., t*1.7, uTime*.25))*nAmp*t;
    // follow-through: the tip answers to older velocity than the root
    vec3 v = t < .5 ? mix(uVel, uVel2, t*2.) : mix(uVel2, uVel3, t*2. - 1.);
    float seg = t*L;
    vec3 off = -vec3(v.x, 0., v.z)*pow(t, 1.15)*L*(mane ? .7 : comb ? 1.1 : .85);
    off -= cross(uSpin, p)*t*(.5 + t*.6);            // turning: the tips swing wide and late
    off.y = 0.;
    float hl = length(off);
    p += off;
    p.y += seg - sqrt(max(seg*seg - hl*hl*.85, seg*seg*.12));   // swept back without stretching
    float sink = clamp(-v.y*1.4, 0., 1.);             // coasting down: the strands billow up and open
    p.y += sink*seg*.3*t;
    p.xz += dir*sink*t*.22;
    // idle: tips slowly coil
    float curl = uIdle*smoothstep(.4, 1., t)*(arm ? .4 : 1.);
    float cp = t*13. + ph + uTime*.5;
    p += (side*sin(cp) + rad*cos(cp))*curl*.1;
    p.y += curl*.12*t;
    // pulse: a whip of light runs from root to tip
    float wd = t - uShockAge*1.5;
    float whip = exp(-wd*wd*30.)*uShockAmp*max(0., 1. - uShockAge/1.5);
    p += (side*sin(ph*5.)*.16 + rad*.1)*whip*t;
    vWave = whip;
  }
  // Oriented chest proxy, evaluated once per strand vertex; no CPU simulation.
  vec3 chestP=(uChestInverse*modelMatrix*vec4(p,1.)).xyz-vec3(0.,.78,-.03);
  vec3 chestQ=abs(chestP)-vec3(1.04,.80,.70);
  float chestDistance=length(max(chestQ,0.))+min(max(chestQ.x,max(chestQ.y,chestQ.z)),0.);
  vChestClearance=aK>1.5?1.:smoothstep(.015,.20,chestDistance);
  vec4 mv = modelViewMatrix*vec4(p, 1.);
  float sz = aK > 1.5 ? 1.05 : comb ? 1.1*(1. - t*.5) : mane ? (aK > .5 ? 1. : .8)*(1. - t*.5)
           : (aK > .5 ? 1.25 : 1.)*(1. - t*.7);
  gl_PointSize = min(32., uSize*sz*(1. + vWave*.6)*uPR/max(.1, -mv.z));
  gl_Position = projectionMatrix*mv;
  vT = t; vPh = ph; vK = aK;
  vSpark = smoothstep(.96, 1., sin(t*38. - uTime*5. + ph*3.));
}
`,s=`
${n}
uniform float uSpId;
varying float vChestClearance;
varying float vT; varying float vPh; varying float vK; varying float vSpark; varying float vWave;
void main(){
#ifdef LINES
  float s = .62;
#else
  vec2 point = gl_PointCoord - .5;
  float r2 = dot(point, point);
  if (r2 >= .25) discard;
  float s = 1. - smoothstep(0., .5, sqrt(r2)); s *= s;
  if (vK < 1.5) s *= .55;                          // beads become sparse glints along the lines
#endif
  vec3 col;
  float lum;
  if (vK > 1.5) {                                  // the glowing clover
    col = mix(pal(.08 + uTime*.015), vec3(1., .82, .55), .45);
    lum = .55 + uCharge*.9 + uNotice*.3 + vWave*1.4;
  } else {
    col = pal(vT*.6 + vPh*.08 + uTime*.03 + vK*.22);
    col = mix(col, col*vec3(.48, .85, 1.2), .2);
    float fade = (1. - vT)*(1. - vT)*.8 + .12;
    lum = (fade*(vK > .5 ? .35 : .55) + vSpark*(vK > .5 ? .6 : 1.5)*(1. - vT*.5))*(1. + uCharge*.35 + uPulse*.4) + vWave*1.8;
  }
  float w = 1.;
  if (uSpId > 1.5) {                               // lion's mane: amber hair
    w = uSp.z;
    col = amber(col, .85);
    lum *= vK > .5 ? .85 : .9;
  } else if (uSpId > .5) {                         // comb: beaded rainbow filaments
    w = uSp.y;
    float bead = pow(.5 + .5*sin(vT*90. - uTime*3. + vPh*4.), 6.);
    col = mix(col, rainbowAt(vT*2.2 - uTime*.9 + vPh), .65);
    lum = lum*(.35 + bead*1.4) + vWave*.6;
  } else {
    w = uSp.x;
  }
  gl_FragColor = vec4(col*lum*uGlow*w, s*vChestClearance);
}
`,c=`
uniform float uScale;
varying vec2 vUv;
void main(){
  vec4 mv = modelViewMatrix*vec4(0., 0., 0., 1.);
  mv.xy += position.xy*uScale;
  vUv = position.xy;
  gl_Position = projectionMatrix*mv;
}
`,l=`
${n}
varying vec2 vUv;
void main(){
  float r2 = dot(vUv, vUv);
  float beat = 1. + uCharge*.3*pow(.5 + .5*sin(uTime*(3. + uCharge*2.5)), 4.);
  float g = exp(-r2*6.)*.11 + exp(-r2*40.)*.18*beat;
  vec3 col = mix(pal(.1 + uTime*.02), vec3(1., .9, .78), .3)*g*(.45 + uCharge*.5 + uPulse*.45 + uNotice*.2)*uGlow;
  gl_FragColor = vec4(amber(col, uSp.z*.8)*(1. - uSp.y*.45), 1.);
}
`,u=`
${n}
attribute float aR;
uniform vec3 uShock; uniform float uSize;
varying float vTw; varying float vSh; varying float vR; varying float vDepth; varying float vLit;
void main(){
  vec3 p = position;
  // Tile outside the view, in world coordinates, to support unlimited camera travel.
  p.x = mod(p.x - uCamera.x + 14., 28.) - 14. + uCamera.x;
  p.y = mod(p.y - uCamera.y - uTime*(.03 + aR*.05) + 11., 22.) - 11. + uCamera.y;
  float tt = uTime*.04;
  p += vec3(snoise(p*.18 + tt), snoise(p*.18 + tt + 17.), snoise(p*.18 + tt + 31.))*.9;
  float l=10.,pull=0.,sh=0.;
  vec4 mv = modelViewMatrix*vec4(p, 1.);
  vDepth = -mv.z;
  gl_Position = projectionMatrix*mv;
  vec2 sp = gl_Position.xy/gl_Position.w*.5*vec2(uRes.x/uRes.y, 1.);
  vLit = shaft(sp)*3.5;
  gl_PointSize = min(64., uSize*(.5 + aR)*uPR*(1. + sh*.25)/max(.1, vDepth));
  vTw = .45 + .55*sin(uTime*(1. + aR*2.) + aR*40.);
  vSh = min(sh, .6) + pull*.25; vR = aR;
}
`,d=`
${n}
varying float vTw; varying float vSh; varying float vR; varying float vDepth; varying float vLit;
void main(){
  vec2 point = gl_PointCoord - .5;
  float r = length(point);
  if (r >= .5) discard;
  float near = smoothstep(4.2, 2.2, vDepth);                     // out-of-focus foreground flakes
  float s = 1. - smoothstep(0., .5, r); s *= s;
  s = mix(s, smoothstep(.5, .38, r)*(.35 + .65*smoothstep(.2, .45, r))*.22, near);
  float fog = smoothstep(14., 7., vDepth)*.75 + .25;
  vec3 col = mix(shaftCol(), pal(vR + uTime*.02), .3 + vSh*.4);
  gl_FragColor = vec4(col*(vTw*(.05 + vLit*.42) + vSh*1.1)*fog, s);
}
`,f=`
varying vec2 vUv;
void main(){ vUv = position.xy*.5 + .5; gl_Position = vec4(position.xy, .9999, 1.); }
`,p=`
${n}
varying vec2 vUv;
void main(){
  float asp = uRes.x/uRes.y;
  vec2 p = (vUv - .5)*vec2(asp, 1.);
  vec3 wave = pressure(p, asp);
  p += wave.xy;
  // absorption: teal toward the surface, indigo-black in the deep
  vec3 col = mix(vec3(.002, .003, .008), vec3(.005, .014, .024), smoothstep(-.7, .15, p.y));
  col = mix(col, vec3(.011, .038, .052), smoothstep(.0, .62, p.y)*.85);
  vec2 world = p + uCamera.xy*.028;
  float n = snoise(vec3(world*1.1, uTime*.012))*.5 + snoise(vec3(world*2.7, uTime*.02 + 4.))*.25;
  col *= .82 + n*.3;
  float sh = shaft(p);
  // a slow caustic web under the surface, only where the light gets in
  float c = snoise(vec3(world.x*3.4, world.y*7. - uTime*.07, uTime*.16));
  float web = pow(1. - abs(c), 7.)*smoothstep(.12, .55, p.y)*(.25 + sh*3.);
  col += shaftCol()*(sh*.55 + web*.05);
  col += mix(shaftCol(), pal(.17), .3)*wave.z*(.025 + .012*((.5 + .5*c)*(.5 + .5*c)));
  col *= 1. - uDim*.35;
  // Match the distant sand fog without a hard horizontal end to the world.
  col = mix(vec3(.00091,.01033,.016),col,smoothstep(-.015,.23,p.y));
  gl_FragColor = vec4(col, 1.);
}
`;export{f as a,c,t as d,s as f,p as i,d as l,r as n,n as o,o as p,i as r,l as s,a as t,u};