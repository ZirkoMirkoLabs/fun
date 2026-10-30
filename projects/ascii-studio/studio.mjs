import { decodeImage } from './image-input.mjs';


const SRC = 512;            // resolution of the distance-field / luminance pass
const LOOP = 12;            // seconds per seamless loop at speed 1
const PIXEL_RAMP = ' .:-+ox#█';
const PALETTES = {
  terra:    [[.055,.20,.66],[.09,.37,1],[.62,.90,1]],
  mono:     [[.30,.30,.32],[.92,.92,.94],[1,1,1]],
  phosphor: [[.03,.30,.13],[.16,.95,.42],[.80,1,.85]],
  amber:    [[.36,.16,.02],[1,.60,.08],[1,.92,.70]],
  rose:     [[.40,.05,.18],[1,.22,.45],[1,.82,.88]],
  source:   [[.3,.3,.3],[1,1,1],[1,1,1]],
  true:     [[.3,.3,.3],[1,1,1],[1,1,1]],
};
const DEFAULTS = {
  liquid: { density:168, speed:1, glow:.8, warp:1, trail:1, tend:1, dust:1 },
  pixel:  { density:180, speed:1, glow:.14, sway:1, aura:.6 },
};

const VERT = `#version 300 es
out vec2 vUv;
void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); vUv=vec2(p.x,1.-p.y); gl_Position=vec4(p*2.-1.,0,1); }`;

const NOISE = `
float hash(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
vec2 hash2(vec2 p){ float a=hash(p)*6.2831853; return vec2(cos(a),sin(a)); }
float gnoise(vec2 p){
  vec2 i=floor(p),f=fract(p),u=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(dot(hash2(i),f),dot(hash2(i+vec2(1,0)),f-vec2(1,0)),u.x),
             mix(dot(hash2(i+vec2(0,1)),f-vec2(0,1)),dot(hash2(i+vec2(1,1)),f-vec2(1,1)),u.x),u.y)*1.6;
}`;

// Low-res domain warp. uLoop walks a circle, so every noise lookup returns to its start.
const WARP_FRAG = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform vec2 uLoop,uPtr,uPtrV; uniform float uWarp;
${NOISE}
vec2 curl(vec2 p){ float e=.02; return vec2(gnoise(p+vec2(0,e))-gnoise(p-vec2(0,e)),-(gnoise(p+vec2(e,0))-gnoise(p-vec2(e,0))))/(2.*e); }
void main(){
  vec2 p=vUv*2.-1.;
  vec2 w=curl(p*.95+uLoop*.28+vec2(3.1,1.7))*.085;
  w+=curl((p+w)*2.3-uLoop*.42+vec2(9.,4.))*.034;
  w+=curl((p+w)*5.5+uLoop*.6)*.008;
  w*=mix(.5,1.55,smoothstep(.15,.95,length(p)));
  vec2 d=p-uPtr; float f=exp(-dot(d,d)*14.);
  w+=uPtrV*f*.5+normalize(d+1e-4)*f*length(uPtrV)*.25;
  o=vec4(w*.5*uWarp,0,1);
}`;

const LIQUID_FRAG = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uSrc,uWarpT,uAtlas;
uniform vec2 uGrid,uLoop; uniform float uTrail,uTend,uDust,uChars,uPhase,uExport,uDashIdx,uRes;
${NOISE}
float body(vec2 q,vec4 s,float nA,float nB){
  float t=pow(1.-abs(nA),11.)*.085*uTend*smoothstep(.0,.05,s.x);
  float web=smoothstep(.5,.53,s.w+nB*.09);
  return max(step(s.x-t,0.),web);
}
void main(){
  vec2 q=vUv+texture(uWarpT,vUv).xy;
  vec2 g=q*uGrid, cell=floor(g), cq=(cell+.5)/uGrid;
  vec4 s=texture(uSrc,cq);
  float nA=gnoise(cq*6.5+uLoop*.22), nB=gnoise(cq*3.4-uLoop*.3+7.);
  float b=body(cq,s,nA,nB);
  float d=s.x, tone=0., idx=0., gray=0.;
  float rnd=hash(cell);
  if(b>.5){
    float core=clamp(-d*14.,0.,1.);
    float grain=.5+.5*gnoise(cq*38.+uLoop*.5);
    tone=mix(.62,.98,grain)*mix(1.,.82,core);
    idx=floor(mix(.2,.86,fract(rnd*7.+grain*1.4))*uChars);
    gray=mix(.8,1.45,tone)*mix(.22,1.,s.y);
    float lane=floor(cell.x/9.)+cell.y*31.;
    if(abs(d)<.0045 && hash(vec2(lane,3.))>.975){ idx=uDashIdx; gray=1.6; }
  } else {
    vec2 dir=normalize(vec2(-.5,.87)+vec2(nB,-nB)*.28), hit=vec2(0.);
    float tr=0.;
    for(int k=1;k<=22;k++){
      float fk=float(k);
      vec2 u=cq-dir*fk*.0125;
      vec4 t=texture(uSrc,u);
      if(t.x<0.||t.w>.54){ tr=1.-fk/23.; break; }
    }
    vec2 perp=vec2(-dir.y,dir.x);
    float lanes=smoothstep(-.3,.05,gnoise(vec2(dot(cq,perp)*150.,uLoop.x*.14)));
    float rows=step(.34,fract(dot(cq,dir)*118.));
    tr*=uTrail;
    float a=pow(clamp(tr,0.,1.),1.15)*lanes*rows;
    if(a>.012+rnd*.1){ idx=rnd>.72?2.:1.; gray=clamp(a*1.7,.34,.95); }
    float fall=exp(-max(d,0.)*17.)*uDust;
    float blink=.5+.5*sin(uPhase*(1.+floor(rnd*3.))+rnd*50.);
    float clump=smoothstep(-.1,.42,gnoise(cq*7.2+uLoop*.3+11.));
    if(gray==0. && d<.33 && hash(cell+7.)<fall*.42*clump*blink){ idx=hash(cell+3.)>.8?2.:1.; gray=.28+blink*.5; }
  }
  if(uExport>.5){ o=vec4(idx/255.,0,0,1); return; }
  vec2 f=fract(g), ddx=dFdx(g), ddy=dFdy(g);
  float cov=0.;
  if(idx>0.5) cov=textureGrad(uAtlas,vec2((idx+f.x)/(uChars+1.),f.y),ddx/vec2(uChars+1.,1.),ddy/vec2(uChars+1.,1.)).r;
  float squeeze=max(length(ddx),length(ddy))/max(uGrid.y/uRes,1e-4);
  vec2 cp=vUv-.5;
  gray*=(1.+1.1*exp(-dot(cp,cp)*16.))/max(1.,squeeze*.42);
  o=vec4(vec3(smoothstep(.04,.5,cov)*smoothstep(6.,2.5,squeeze)*gray),1);
}`;

const PIXEL_FRAG = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uImg,uSrc,uMask; uniform highp usampler2D uTiles;
uniform vec2 uCells,uLoop; uniform float uPx,uPhase,uSway,uAura,uTerra,uLod,uExport,uTick,uSource;
uniform vec2 uPivot,uEmber;
uniform float uTrue;
uniform vec3 uLevels;
uniform vec3 uC0,uC1,uC2;
${NOISE}
const int TILE=6;
void main(){
  vec2 fc=vec2(gl_FragCoord.x,uCells.y*uPx-gl_FragCoord.y);
  vec2 cell=floor(fc/uPx);
  vec2 uv=(cell+.5)/uCells;
  vec4 m=texture(uMask,uv);
  float P=uPhase;
  vec2 disp=vec2(0);
  // hair swings from the crown; the wave travels out along each strand
  vec2 rr=uv-uPivot; float L=length(rr); vec2 perp=vec2(-rr.y,rr.x)/max(L,.001);
  float a=sin(P*2.-L*8.)*.62+sin(P*3.-L*15.+1.)*.28+sin(P*5.-L*24.+2.)*.1;
  disp+=m.r*perp*a*L*.075;
  // smoke sways on a wave that climbs the column
  float lift=1.;
  if(uEmber.x>=0.) lift=smoothstep(.0,.2,distance(uv,uEmber))*(1.+clamp(uEmber.y-uv.y,0.,.5)*2.2);
  disp.x+=m.g*lift*(sin(P*3.+uv.y*13.)*.017+sin(P*2.+uv.y*29.+1.)*.008);
  disp.y+=m.g*lift*sin(P*2.+uv.y*19.)*.009;
  // contour bands roll like water
  disp.y+=m.b*(sin(P*2.+uv.x*6.5+uv.y*10.)*.013+sin(P*3.-uv.x*14.+uv.y*23.)*.005);
  disp.x+=m.b*sin(P+uv.y*15.+uv.x*2.)*.016;
  disp*=(1.-m.a)*uSway;
  vec4 c=textureLod(uImg,uv+disp,uLod);
  float tone,hi=0.;
  if(uTerra>.5){
    tone=c.b;
    vec3 sharp=textureLod(uImg,uv,max(uLod-1.2,0.)).rgb;
    hi=step(.26,sharp.r/max(sharp.b,.01))*step(.16,sharp.b);
  } else {
    tone=dot(c.rgb,vec3(.3,.59,.11));
    tone=pow(clamp((tone-uLevels.x)/uLevels.y,0.,1.),uLevels.z);
    hi=0.;
    if(uTrue>.5) tone=max(c.r,max(c.g,c.b));
  }
  float dyn=1.-m.a;
  if(uTerra<.5 && uAura>0.){
    float d=texture(uSrc,uv+disp*.5).x;
    float n=gnoise(uv*4.+uLoop*.4);
    float rings=.5+.5*sin(d*62.-P*3.+n*3.5);
    float aura=smoothstep(.42,.0,d)*(.35+.65*rings)*.78*uAura;
    if(d>0.) tone=max(tone,aura);
  }
  if(uTerra>.5){
    // vapour lifting off the rim of the glass
    float y=clamp((.615-uv.y)/.5,0.,1.);
    float cx=.205-y*.075+sin(P*2.+y*7.)*.022*(.25+y)+sin(P*3.+y*15.)*.009;
    float wid=.009+y*.042;
    float col=exp(-pow((uv.x-cx)/wid,2.));
    float n=gnoise(vec2(uv.x*24.,uv.y*11.)+uLoop*.75);
    float vap=col*smoothstep(0.,.05,y)*smoothstep(1.,.3,y)*smoothstep(-.14,.3,n);
    tone=max(tone,vap*.46*dyn*smoothstep(0.,.2,uSway+.1));
    // light rolling through the dither
    float sw=sin(P+uv.x*4.-uv.y*7.);
    if(tone<.74) tone*=1.+.14*sw*step(.03,tone);
  }
  // mid-tones breathe: the glyph trades places with its neighbour on a slow beat
  float r=hash(cell);
  float beat=fract(r*17.+uTick/48.);
  float jit=(beat<.16&&tone>.05&&tone<.74)?(r>.5?.13:-.13):0.;
  float idx=clamp(floor(pow(max(tone+jit,0.)/.8,.72)*8.),0.,8.);
  if(tone<.045) idx=0.;
  if(hi>.5) idx=8.;
  if(uExport>.5){ o=vec4(idx/255.,0,0,1); return; }
  ivec2 tp=ivec2(mod(fc,uPx)*float(TILE)/uPx);
  uint bit=texelFetch(uTiles,ivec2(int(idx)*TILE+tp.x,tp.y),0).r;
  vec3 col=mix(uC0,uC1,smoothstep(.12,.5,tone));
  if(hi>.5){
    float run=.5+.5*sin(P*4.+(uv.x+uv.y*1.3)*34.);
    float glint=step(.91,hash(cell+floor(uTick/8.)));
    col=mix(uC1,uC2,clamp(.25+run*.75+glint,0.,1.));
  }
  if(uSource>.5) col=c.rgb/max(max(c.r,max(c.g,c.b)),.25);
  vec3 gap=vec3(0);
  if(uTrue>.5){
    // tonal layers stay in the image's own colour: glyphs at full value on a dimmed copy of it
    float breath=1.+m.g*.2*sin(P*3.+uv.y*22.);
    col=c.rgb*1.06*breath;
    gap=c.rgb*.4*breath;
    vec3 sharp=textureLod(uImg,uv,max(uLod-1.2,0.)).rgb;
    if(min(sharp.r,sharp.g)>.55){ float run=.5+.5*sin(P*4.-uv.x*60.); col=mix(sharp,vec3(1),.35+.65*run); gap=col; }
    if(uEmber.x>=0.){
      float e=exp(-dot(uv-uEmber,uv-uEmber)/.00016)*(.55+.45*sin(P*2.));
      col=mix(col,vec3(1),e); gap=mix(gap,vec3(.75,.85,1),e);
    }
  }
  o=vec4(mix(gap,col,float(bit)),1);
}`;

const BLUR_FRAG = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uT; uniform vec2 uD;
void main(){ vec2 st=vec2(vUv.x,1.-vUv.y); vec3 c=texture(uT,st).rgb*.1964;
  c+=(texture(uT,st+uD*1.41).rgb+texture(uT,st-uD*1.41).rgb)*.2969;
  c+=(texture(uT,st+uD*3.29).rgb+texture(uT,st-uD*3.29).rgb)*.0945;
  c+=(texture(uT,st+uD*5.18).rgb+texture(uT,st-uD*5.18).rgb)*.0104;
  o=vec4(c,1); }`;

const COMP_FRAG = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uT,uB,uB2; uniform float uGlow,uTone;
void main(){ vec2 st=vec2(vUv.x,1.-vUv.y); vec3 c=texture(uT,st).rgb; vec3 b=texture(uB,st).rgb, b2=texture(uB2,st).rgb;
  c+=(b*.55+b2*1.1)*uGlow; if(uTone>.5) c=1.-exp(-c*1.6); o=vec4(c,1); }`;

// ----- GL setup -----
const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2', { antialias:false, alpha:false, preserveDrawingBuffer:false });
if (!gl) {
  document.getElementById('stage').textContent = 'ASCII Studio needs WebGL 2, which this browser or device does not provide.';
  throw new Error('WebGL 2 unavailable');
}
const hasFloat = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
gl.getExtension('OES_texture_float_linear');
gl.bindVertexArray(gl.createVertexArray());

function program(fsSrc) {
  const mk = (t, s) => { const h = gl.createShader(t); gl.shaderSource(h, s); gl.compileShader(h);
    if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h)); return h; };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}
const P = { warp:program(WARP_FRAG), liquid:program(LIQUID_FRAG), pixel:program(PIXEL_FRAG), blur:program(BLUR_FRAG), comp:program(COMP_FRAG) };

function tex(filter, wrap = gl.CLAMP_TO_EDGE) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return t;
}
function target(w, h, internal, format, type, filter = gl.LINEAR) {
  const t = tex(filter);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  return { t, f, w, h };
}
const warpRT = hasFloat ? target(256, 256, gl.RG16F, gl.RG, gl.HALF_FLOAT) : target(256, 256, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
let main, blurs = [];
function resizeTargets(W, H) {
  [main, ...blurs].forEach(r => { if (r) { gl.deleteTexture(r.t); gl.deleteFramebuffer(r.f); } });
  const rgba = (w, h) => target(Math.max(1, w), Math.max(1, h), gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
  main = rgba(W, H);
  blurs = [rgba(W >> 1, H >> 1), rgba(W >> 1, H >> 1), rgba(W >> 3, H >> 3), rgba(W >> 3, H >> 3)];
}

const srcT = tex(gl.LINEAR), imgT = tex(gl.LINEAR_MIPMAP_LINEAR), maskT = tex(gl.LINEAR), atlasT = tex(gl.LINEAR_MIPMAP_LINEAR), tilesT = tex(gl.NEAREST);

// ----- 5×5 bitmap ramp for pixel style, one tile per PIXEL_RAMP entry -----
(function buildTiles() {
  const T = [
    ['.....','.....','.....','.....','.....'],
    ['.....','.....','.....','.....','..#..'],
    ['.....','..#..','.....','..#..','.....'],
    ['.....','.....','.###.','.....','.....'],
    ['.....','..#..','.###.','..#..','.....'],
    ['.....','.###.','.#.#.','.###.','.....'],
    ['#...#','.#.#.','..#..','.#.#.','#...#'],
    ['.#.#.','#####','.#.#.','#####','.#.#.'],
  ];
  const data = new Uint8Array(6 * 9 * 6);
  T.forEach((rows, i) => rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') data[y * 54 + i * 6 + x] = 1; })));
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) data[y * 54 + 48 + x] = 1;
  gl.bindTexture(gl.TEXTURE_2D, tilesT);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, 54, 6, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, data);
})();

let charset = [];
function buildAtlas(chars) {
  charset = [...chars].slice(0, 40);
  if (charset.length < 2) charset = [...' .:+#'];
  const w = 48, h = 80, n = charset.length + 1;
  const cv = document.createElement('canvas'); cv.width = w * n; cv.height = h;
  const c = cv.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, h);
  c.fillStyle = '#fff'; c.font = '700 68px Consolas, Menlo, "DejaVu Sans Mono", monospace';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  charset.forEach((ch, i) => c.fillText(ch, (i + .5) * w, h * .54));
  c.fillRect(charset.length * w + 3, h * .44, w - 6, h * .12);   // final tile: the bright edge dash
  gl.bindTexture(gl.TEXTURE_2D, atlasT);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.generateMipmap(gl.TEXTURE_2D);
}

// ----- CPU source pass: mask → signed distance + blurs -----
function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s;
    do { const r = v[k]; s = (f[q] + q * q - f[r] - r * r) / (2 * q - 2 * r); } while (s <= z[k] && --k >= 0);
    k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + f[r]; }
}
function edt(inside, N) {
  const g = new Float64Array(N * N), f = new Float64Array(N), d = new Float64Array(N), v = new Int32Array(N), z = new Float64Array(N + 1);
  for (let i = 0; i < N * N; i++) g[i] = inside[i] ? 0 : 1e20;
  for (let x = 0; x < N; x++) { for (let y = 0; y < N; y++) f[y] = g[y * N + x]; edt1d(f, N, d, v, z); for (let y = 0; y < N; y++) g[y * N + x] = d[y]; }
  for (let y = 0; y < N; y++) { for (let x = 0; x < N; x++) f[x] = g[y * N + x]; edt1d(f, N, d, v, z); for (let x = 0; x < N; x++) g[y * N + x] = d[x]; }
  return g;
}
function boxBlur(a, N, r, passes = 3) {
  let s = Float32Array.from(a), t = new Float32Array(a.length);
  const w = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < N; y++) { let acc = 0;
      for (let x = -r; x <= r; x++) acc += s[y * N + Math.min(N - 1, Math.max(0, x))];
      for (let x = 0; x < N; x++) { t[y * N + x] = acc * w; acc += s[y * N + Math.min(N - 1, x + r + 1)] - s[y * N + Math.max(0, x - r)]; } }
    for (let x = 0; x < N; x++) { let acc = 0;
      for (let y = -r; y <= r; y++) acc += t[Math.min(N - 1, Math.max(0, y)) * N + x];
      for (let y = 0; y < N; y++) { s[y * N + x] = acc * w; acc += t[Math.min(N - 1, y + r + 1) * N + x] - t[Math.max(0, y - r) * N + x]; } }
  }
  return s;
}

const srcCanvas = document.createElement('canvas'); srcCanvas.width = srcCanvas.height = 1024;
const srcCtx = srcCanvas.getContext('2d', { willReadFrequently:true });
const lowCanvas = document.createElement('canvas'); lowCanvas.width = lowCanvas.height = SRC;
const lowCtx = lowCanvas.getContext('2d', { willReadFrequently:true });

function pushSource() {
  lowCtx.clearRect(0, 0, SRC, SRC);
  lowCtx.drawImage(srcCanvas, 0, 0, SRC, SRC);
  const px = lowCtx.getImageData(0, 0, SRC, SRC).data, n = SRC * SRC;
  const lum = new Float32Array(n), inside = new Uint8Array(n), m = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3] / 255;
    let l = a * (.3 * px[i * 4] + .59 * px[i * 4 + 1] + .11 * px[i * 4 + 2]) / 255;
    if (state.invert || state.maskInvert) l = a - l;
    lum[i] = l;
    inside[i] = l > state.thresh ? 1 : 0;
    m[i] = inside[i];
  }
  const dOut = edt(inside, SRC);
  for (let i = 0; i < n; i++) inside[i] = 1 - inside[i];
  const dIn = edt(inside, SRC);
  let halfStroke = 0;
  for (let i = 0; i < n; i++) if (dIn[i] > halfStroke) halfStroke = dIn[i];
  halfStroke = Math.sqrt(halfStroke) / SRC;
  // Thin strokes (small text) get less warp and webbing so they stay legible.
  state.fit = Math.max(.3, Math.min(1, Math.pow(halfStroke / .042, 1.4)));
  const flip = state.maskInvert;
  const lv0 = flip ? 1 - state.levels[1] : state.levels[0], lvr = Math.max(.01, state.levels[1] - state.levels[0]);
  const bS = boxBlur(m, SRC, 3), bL = boxBlur(m, SRC, Math.max(2, Math.round(11 * state.fit)));
  const f = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    f[i * 4] = (Math.sqrt(dOut[i]) - Math.sqrt(dIn[i])) / SRC;
    f[i * 4 + 1] = Math.pow(Math.min(1, Math.max(0, (lum[i] - lv0) / lvr)), state.levels[2]); f[i * 4 + 2] = bS[i]; f[i * 4 + 3] = bL[i];
  }
  gl.bindTexture(gl.TEXTURE_2D, srcT);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, SRC, SRC, 0, gl.RGBA, gl.FLOAT, f);

  gl.bindTexture(gl.TEXTURE_2D, imgT);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  // invert has to reach the pixel style too, so the colour upload goes through a scratch copy
  const up = document.createElement('canvas'); up.width = up.height = 1024;
  const uc = up.getContext('2d');
  uc.fillStyle = '#000'; uc.fillRect(0, 0, 1024, 1024);
  uc.drawImage(srcCanvas, 0, 0);
  if (state.invert) { uc.globalCompositeOperation = 'difference'; uc.fillStyle = '#fff'; uc.fillRect(0, 0, 1024, 1024); }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, up);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.generateMipmap(gl.TEXTURE_2D);
}

function setMask(data, size) {
  gl.bindTexture(gl.TEXTURE_2D, maskT);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
}
const genericMask = () => { state.pivot = [.5, .5]; setMask(new Uint8Array([0, 0, 255, 0]), 1); };

// Motion regions for an arbitrary image: whatever connects to the border is backdrop and rolls,
// the subject's rim sways around its centre, and its core holds still. Returns the backdrop share.
function autoMask() {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d', { willReadFrequently:true });
  x.fillStyle = '#000'; x.fillRect(0, 0, N, N); x.drawImage(srcCanvas, 0, 0, N, N);
  const d = x.getImageData(0, 0, N, N).data;
  const dist = (i, j) => Math.abs(d[i * 4] - d[j * 4]) + Math.abs(d[i * 4 + 1] - d[j * 4 + 1]) + Math.abs(d[i * 4 + 2] - d[j * 4 + 2]);
  const bg = new Uint8Array(N * N), seed = new Int32Array(N * N), stack = [];
  const visit = (i, from) => { bg[i] = 1; seed[i] = from; stack.push(i); };
  for (let k = 0; k < N; k++) [k, N * N - 1 - k, k * N, k * N + N - 1].forEach(i => { if (!bg[i]) visit(i, i); });
  while (stack.length) {
    const i = stack.pop(), px = i % N, py = i / N | 0;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ax, ay]) => {
      const qx = px + ax, qy = py + ay; if (qx < 0 || qy < 0 || qx >= N || qy >= N) return;
      const j = qy * N + qx;
      if (!bg[j] && dist(i, j) < 26 && dist(seed[i], j) < 110) visit(j, seed[i]);
    });
  }
  let count = 0, cx = 0, cy = 0;
  for (let i = 0; i < N * N; i++) if (bg[i]) count++; else { cx += i % N; cy += i / N | 0; }
  const share = count / (N * N);
  // No clear subject (busy photo, full-bleed texture): everything drifts gently instead.
  if (share < .12 || share > .95) {
    const out = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) out[i * 4 + 2] = 150;
    state.pivot = [.5, .5]; setMask(out, N); return share;
  }
  state.pivot = [cx / (N * N - count) / N, cy / (N * N - count) / N];
  const toBg = edt(bg, N), rim = new Float32Array(N * N), core = new Float32Array(N * N), back = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const r = Math.sqrt(toBg[i]);
    back[i] = bg[i];
    if (!bg[i]) { if (r >= 5) core[i] = 1; else rim[i] = 1; }
  }
  const a = boxBlur(rim, N, 2), b = boxBlur(back, N, 2), t = boxBlur(core, N, 2);
  const out = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) { out[i * 4] = a[i] * 255; out[i * 4 + 2] = b[i] * 255; out[i * 4 + 3] = t[i] * 255; }
  setMask(out, N);
  return share;
}

// Otsu's threshold, so photos and logos separate into a usable shape without touching the slider.
function autoThreshold() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d', { willReadFrequently:true });
  x.drawImage(srcCanvas, 0, 0, N, N);
  const d = x.getImageData(0, 0, N, N).data, hist = new Float64Array(256);
  for (let i = 0; i < d.length; i += 4) hist[Math.round((d[i + 3] / 255) * (.3 * d[i] + .59 * d[i + 1] + .11 * d[i + 2]))]++;
  let total = 0, sum = 0; hist.forEach((h, i) => { total += h; sum += i * h; });
  let wB = 0, sumB = 0, best = -1, at = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB || wB === total) continue;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / (total - wB), v = wB * (total - wB) * (mB - mF) * (mB - mF);
    if (v > best) { best = v; at = i; }
  }
  return Math.max(.05, Math.min(.95, at / 255));
}

// Hand-drawn motion regions over the Terra art, in 0..1 image coords.
const TERRA_REGIONS = {
  hair: [[[.20,0],[1,0],[1,.20],[.72,.32],[.60,.34],[.42,.38],[.36,.30],[.31,.30],[.30,.50],[.20,.47],[.14,.40],[.15,.25]]],
  smoke: [[[0,0],[.13,0],[.13,.26],[.14,.45],[.14,.62],[0,.62]]],
  bands: [
    [[0,.28],[.16,.30],[.15,.47],[.31,.52],[.34,.61],[.41,.70],[.55,.67],[.58,.82],[.36,.84],[.33,1],[0,1]],
    [[.74,.18],[1,.18],[1,.84],[.88,.80],[.85,.72],[.82,.66],[.84,.59],[.73,.58]],
  ],
  still: [
    [[.29,.30],[.42,.38],[.42,.55],[.29,.55]],
    [[.42,.38],[.60,.35],[.72,.34],[.73,.60],[.62,.60],[.42,.68],[.35,.60],[.42,.55]],
    [[.54,.68],[.73,.58],[.84,.60],[.85,.72],[.88,.80],[1,1],[.33,1],[.36,.84],[.58,.82]],
    [[.12,.59],[.37,.60],[.37,.73],[.34,.85],[.25,1],[.14,.88]],
  ],
};
const SMOKE_PRESET = {
  pivot: [.56, .25], ember: [.735, .49],
  hair: [
    [[0,.16],[.42,.10],[.50,.20],[.44,.40],[.40,.46],[.24,.56],[.02,.56],[0,.50]],
    [[.72,.30],[.86,.28],[1,.38],[1,.72],[.90,.70],[.74,.62],[.72,.52],[.76,.44]],
    [[.42,.10],[.70,.08],[.74,.30],[.68,.20],[.50,.20]],
  ],
  smoke: [[[.76,.46],[.84,.40],[.86,.30],[.80,.10],[.80,0],[1,0],[1,.30],[.94,.42],[.82,.52]]],
  bands: [[[0,0],[1,0],[1,1],[0,1]]],
  still: [
    [[.50,.20],[.68,.20],[.72,.33],[.68,.45],[.60,.50],[.50,.47],[.44,.40],[.46,.28]],
    [[.57,.40],[.76,.44],[.76,.53],[.68,.70],[.62,.75],[.54,.72]],
    [[.40,.45],[.57,.50],[.70,.62],[.76,.75],[.86,.92],[.87,1],[.14,1],[.22,.62],[.30,.55]],
    [[.41,.31],[.47,.31],[.47,.39],[.41,.39]],
  ],
  exclusive: true,
};
function regionMask(R) {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d', { willReadFrequently:true });
  const chan = polys => {
    x.clearRect(0, 0, N, N); x.fillStyle = '#fff';
    polys.forEach(p => { x.beginPath(); p.forEach(([a, b], i) => x[i ? 'lineTo' : 'moveTo'](a * N, b * N)); x.closePath(); x.fill(); });
    const d = x.getImageData(0, 0, N, N).data, a = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) a[i] = d[i * 4 + 3] / 255;
    return boxBlur(a, N, 3);
  };
  const h = chan(R.hair), s = chan(R.smoke), b = chan(R.bands), t = chan(R.still);
  // Full-frame backdrops step aside for hair and smoke, so those don't move twice.
  if (R.exclusive) for (let i = 0; i < N * N; i++) b[i] *= (1 - h[i]) * (1 - s[i]);
  const out = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) { out[i * 4] = h[i] * 255; out[i * 4 + 1] = s[i] * 255; out[i * 4 + 2] = b[i] * 255; out[i * 4 + 3] = t[i] * 255; }
  setMask(out, N);
}

// ----- input → source canvas -----
function clearSrc() { srcCtx.setTransform(1, 0, 0, 1, 0, 0); srcCtx.globalCompositeOperation = 'source-over'; srcCtx.clearRect(0, 0, 1024, 1024); }

function drawText(text, font) {
  clearSrc();
  srcCtx.fillStyle = '#000'; srcCtx.fillRect(0, 0, 1024, 1024);
  srcCtx.fillStyle = '#fff'; srcCtx.textAlign = 'center'; srcCtx.textBaseline = 'middle';
  const words = text.trim().split(/\s+/).filter(Boolean);
  const forced = text.trim().split('\n').map(s => s.trim()).filter(Boolean);
  const measure = s => { srcCtx.font = font; return srcCtx.measureText(s).width; };
  const layouts = [];
  if (forced.length > 1) layouts.push(forced);
  else for (let k = 1; k <= Math.min(6, words.length); k++) {
    const total = words.reduce((a, w) => a + measure(w + ' '), 0), goal = total / k, lines = [];
    let cur = [], w = 0;
    words.forEach(word => { const m = measure(word + ' ');
      if (cur.length && w + m / 2 > goal && lines.length < k - 1) { lines.push(cur.join(' ')); cur = []; w = 0; }
      cur.push(word); w += m; });
    lines.push(cur.join(' ')); layouts.push(lines);
  }
  let best = null, bestSize = 0;
  layouts.forEach(lines => {
    const widest = Math.max(...lines.map(measure));
    const size = Math.min(100 * 700 / widest, 700 / (lines.length * 1.05));
    if (size > bestSize) { bestSize = size; best = lines; }
  });
  if (!best) return;
  srcCtx.font = font.replace('100px', bestSize.toFixed(1) + 'px');
  const lh = bestSize * 1.02, y0 = 512 - (best.length - 1) * lh / 2;
  best.forEach((l, i) => srcCtx.fillText(l, 512, y0 + i * lh));
}

function drawImageSrc(img) {
  clearSrc();
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  state.aspect = Math.max(.25, Math.min(4, iw / ih));
  srcCtx.drawImage(img, 0, 0, 1024, 1024);
  const d = srcCtx.getImageData(0, 0, 1024, 1024).data;
  // A bright, opaque border means a light backdrop: the subject, not the backdrop, should become the glyph body.
  let sum = 0, cnt = 0, opaque = 0;
  const probe = (x, y) => { const i = (y * 1024 + x) * 4; if (d[i + 3] > 128) { sum += d[i] + d[i + 1] + d[i + 2]; opaque++; } cnt++; };
  for (let t = 0; t < 1024; t += 16) { probe(t, 2); probe(t, 1021); probe(2, t); probe(1021, t); }
  return opaque > cnt * .5 && sum / (opaque * 3) > 140;
}

// ----- state and UI -----
const $ = id => document.getElementById(id);
const state = { preset:'text', mode:'liquid', terra:false, thresh:.5, invert:false, palette:'terra',
  ...DEFAULTS.liquid, sway:1, aura:.6, fit:1, pivot:[.5,.5], aspect:1, levels:[0,1,1], maskInvert:false, ember:[-1,-1], loaded:null, ptr:[9, 9], ptrV:[0, 0] };
const params = new URLSearchParams(location.search);
let userImage = null;

function syncUI() {
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === state.mode));
  document.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', b.dataset.preset === state.preset));
  document.querySelectorAll('[data-for]').forEach(d => d.classList.toggle('hide', d.dataset.for !== state.mode));
  ['density','speed','glow','warp','trail','tend','dust','sway','aura','thresh'].forEach(k => {
    const el = $(k); el.value = state[k]; el.parentElement.querySelector('output').textContent = (+state[k]).toFixed(k === 'density' ? 0 : 2).replace(/^0\./, '.');
  });
  $('invert').checked = state.invert; $('palette').value = state.palette;
  $('threshWrap').classList.toggle('hide', state.terra);
}
function setMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;
  const aura = state.aura;
  Object.assign(state, DEFAULTS[mode]);
  if (state.preset === 'image') state.aura = aura;
  resize(); syncUI();
}
function resetImageState() {
  state.aspect = 1; state.levels = [0, 1, 1]; state.maskInvert = false; state.aura = DEFAULTS.pixel.aura; state.ember = [-1, -1];
  if (state.palette === 'true') state.palette = 'terra';
  resize();
}
function refreshSource() {
  if (state.preset === 'text') drawText($('text').value || ' ', $('font').value);
  else if (userImage) drawImageSrc(userImage);
  pushSource();
}
function loadPreset(name) {
  state.preset = name; state.loaded = null; userImage = null; resetImageState();
  if (name === 'terra') {
    const img = new Image();
    img.onload = () => {
      state.terra = true; state.invert = false; state.palette = 'terra'; state.pivot = [.31, .18]; userImage = img; regionMask(TERRA_REGIONS);
      $('text').value = ''; setMode('pixel'); drawImageSrc(img); pushSource(); syncUI(); ready = true; state.loaded = name;
    };
    img.onerror = () => showStatus('That example could not load.');
    img.src = './terra.webp';
  } else if (name === 'smoke') {
    const img = new Image();
    img.onload = () => {
      state.terra = false; state.invert = false; state.thresh = .5; state.palette = 'true'; userImage = img;
      state.pivot = SMOKE_PRESET.pivot; state.ember = SMOKE_PRESET.ember; regionMask(SMOKE_PRESET);
      $('text').value = ''; setMode('pixel'); state.aura = 0; drawImageSrc(img); pushSource(); syncUI(); ready = true; state.loaded = name;
    };
    img.onerror = () => showStatus('That example could not load.');
    img.src = './smoke.webp';
  }
}
// Percentile levels, plus a gamma that lifts the median tone. Mid-tone share separates logos from photos.
function analyseTones() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d', { willReadFrequently:true });
  x.fillStyle = '#000'; x.fillRect(0, 0, N, N); x.drawImage(srcCanvas, 0, 0, N, N);
  const d = x.getImageData(0, 0, N, N).data, v = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) v[i] = (.3 * d[i * 4] + .59 * d[i * 4 + 1] + .11 * d[i * 4 + 2]) / 255;
  v.sort();
  const lo = v[Math.floor(N * N * .01)], hi = Math.max(lo + .05, v[Math.floor(N * N * .99)]);
  let mid = 0; for (let i = 0; i < N * N; i++) if (v[i] > .15 && v[i] < .85) mid++;
  return { lo, hi, median: v[N * N >> 1], midShare: mid / (N * N) };
}
function applyImage(img) {
  if (state.preset === 'smoke') state.palette = 'terra';
  state.preset = 'image'; state.terra = false; state.ember = [-1, -1]; userImage = img;
  const bright = drawImageSrc(img), tones = analyseTones(), logo = tones.midShare < .25;
  state.invert = bright && logo;       // logos flip fully
  state.maskInvert = bright && !logo;  // photos keep their tones; only the glyph body flips
  const t = autoThreshold();
  state.thresh = bright ? 1 - t : t;
  const lo = state.invert ? 1 - tones.hi : tones.lo, hi = state.invert ? 1 - tones.lo : tones.hi;
  const med = Math.max(.02, Math.min(.98, ((state.invert ? 1 - tones.median : tones.median) - lo) / (hi - lo)));
  state.levels = logo ? [0, 1, 1] : [lo, hi, Math.max(.35, Math.min(1.1, Math.log(.42) / Math.log(med)))];
  state.aura = 0;                      // the halo is for type and logos; it only clutters a picture
  autoMask();
  $('text').value = '';
  resize(); pushSource(); syncUI();
}
function showStatus(message) {
  const el = $('status'); el.textContent = message || ''; el.hidden = !message;
}
async function useImage(file) {
  if (!file) return;
  try {
    const bitmap = await decodeImage(file);
    if (userImage && userImage.close) userImage.close();
    showStatus(''); applyImage(bitmap);
  } catch (e) { showStatus(e.message || 'That image could not be read.'); }
}

document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => loadPreset(b.dataset.preset));
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
['density','speed','glow','warp','trail','tend','dust','sway','aura'].forEach(k => $(k).oninput = e => {
  state[k] = +e.target.value; if (k === 'density') resize(); syncUI(); });
let srcTimer;
$('thresh').oninput = e => { state.thresh = +e.target.value; syncUI(); clearTimeout(srcTimer); srcTimer = setTimeout(pushSource, 40); };
$('invert').onchange = e => { state.invert = e.target.checked; state.maskInvert = false; pushSource(); };
$('palette').onchange = e => { state.palette = e.target.value; };
$('chars').value = ' .,:;-~=+*ixoe%#&@$';
$('chars').oninput = e => buildAtlas(e.target.value);
const typed = () => { clearTimeout(srcTimer); srcTimer = setTimeout(() => {
  if (!$('text').value.trim()) return;
  state.preset = 'text'; state.terra = false; userImage = null; genericMask(); state.invert = false; state.thresh = .5; resetImageState();
  refreshSource(); syncUI(); }, 70); };
$('text').oninput = typed; $('font').onchange = typed;
$('pick').onclick = () => $('file').click();
$('file').onchange = e => { useImage(e.target.files[0]); e.target.value = ''; };
const stage = $('stage');
addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('drag'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) stage.classList.remove('drag'); });
addEventListener('drop', e => { e.preventDefault(); stage.classList.remove('drag'); useImage(e.dataTransfer.files[0]); });
addEventListener('paste', e => { for (const it of e.clipboardData.items) if (it.type.startsWith('image/')) { useImage(it.getAsFile()); e.preventDefault(); return; } });
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); showStatus('The graphics context was lost. Reload the page to continue.'); });

canvas.addEventListener('pointermove', e => {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1;
  if (state.ptr[0] < 5) { state.ptrV[0] += (x - state.ptr[0]) * .6; state.ptrV[1] += (y - state.ptr[1]) * .6; }
  state.ptr = [x, y];
});
canvas.addEventListener('pointerleave', () => { state.ptr = [9, 9]; });

// ----- render -----
let W = 0, H = 0, ready = false, quality = 1;
const hasSize = params.has('size'), sizeParam = Math.max(256, Math.min(4096, +params.get('size') || 1080));
function resize() {
  const asp = state.aspect;
  const fit = long => asp >= 1 ? [long, Math.max(2, Math.round(long / asp))] : [Math.max(2, Math.round(long * asp)), long];
  if (state.mode === 'pixel') {
    const [cols, rows] = fit(hasSize ? Math.round(sizeParam / 6) : Math.round(state.density));
    W = cols * 6; H = rows * 6;
  } else {
    const box = stage.getBoundingClientRect();
    const css = Math.max(320, Math.min(box.width, box.height) - 32);
    const long = hasSize ? sizeParam : Math.max(560, Math.round(Math.min(1600, Math.max(1024, Math.round(css * Math.min(2, devicePixelRatio || 1)))) * quality));
    [W, H] = fit(long).map(v => v + (v & 1));
  }
  if (canvas.width !== W || canvas.height !== H || !main) { canvas.width = W; canvas.height = H; resizeTargets(W, H); }
  const avail = stage.getBoundingClientRect();
  const room = Math.max(280, Math.min((avail.width - 32) / W, (avail.height - 32) / H) * Math.max(W, H)) / Math.max(W, H);
  // Whole-number upscales keep the pixel font crisp; below 1:1 it has to be filtered.
  const crisp = state.mode === 'pixel' && room >= 1;
  document.body.classList.toggle('pixel', crisp);
  const k = crisp ? Math.floor(room) : room;
  canvas.style.width = W * k + 'px'; canvas.style.height = H * k + 'px';
}
addEventListener('resize', resize);

function bind(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }
function drawTo(rt, w, h) { gl.bindFramebuffer(gl.FRAMEBUFFER, rt ? rt.f : null); gl.viewport(0, 0, w, h); gl.drawArrays(gl.TRIANGLES, 0, 3); }

function setLiquid(phase, loop, exportMode, gridOverride) {
  const u = P.liquid.u; gl.useProgram(P.liquid.p);
  bind(0, srcT); gl.uniform1i(u.uSrc, 0);
  bind(1, warpRT.t); gl.uniform1i(u.uWarpT, 1);
  bind(2, atlasT); gl.uniform1i(u.uAtlas, 2);
  const N = state.density, long = Math.max(W, H);
  const g = gridOverride || [N / .6 * W / long, N * H / long];
  gl.uniform2f(u.uGrid, g[0], g[1]);
  gl.uniform1f(u.uRes, H);
  gl.uniform2f(u.uLoop, loop[0], loop[1]);
  gl.uniform1f(u.uTrail, state.trail); gl.uniform1f(u.uTend, state.tend); gl.uniform1f(u.uDust, state.dust);
  gl.uniform1f(u.uChars, charset.length); gl.uniform1f(u.uPhase, phase);
  gl.uniform1f(u.uDashIdx, charset.length); gl.uniform1f(u.uExport, exportMode ? 1 : 0);
}
function setPixel(phase, loop, tick, cols, rows, px, exportMode) {
  const u = P.pixel.u; gl.useProgram(P.pixel.p);
  bind(0, imgT); gl.uniform1i(u.uImg, 0);
  bind(1, srcT); gl.uniform1i(u.uSrc, 1);
  bind(2, maskT); gl.uniform1i(u.uMask, 2);
  bind(3, tilesT); gl.uniform1i(u.uTiles, 3);
  gl.uniform2f(u.uCells, cols, rows); gl.uniform2f(u.uLoop, loop[0], loop[1]);
  gl.uniform1f(u.uPx, px); gl.uniform1f(u.uPhase, phase); gl.uniform1f(u.uTick, tick);
  gl.uniform1f(u.uSway, state.sway); gl.uniform1f(u.uAura, state.aura); gl.uniform1f(u.uTerra, state.terra ? 1 : 0);
  gl.uniform1f(u.uLod, Math.max(0, Math.log2(1024 / Math.max(cols, rows)) - .5)); gl.uniform1f(u.uExport, exportMode ? 1 : 0);
  const pal = PALETTES[state.palette];
  gl.uniform1f(u.uSource, state.palette === 'source' ? 1 : 0);
  gl.uniform2f(u.uPivot, state.pivot[0], state.pivot[1]);
  gl.uniform2f(u.uEmber, state.ember[0], state.ember[1]);
  gl.uniform1f(u.uTrue, state.palette === 'true' ? 1 : 0);
  gl.uniform3f(u.uLevels, state.levels[0], state.levels[1] - state.levels[0], state.levels[2]);
  gl.uniform3fv(u.uC0, pal[0]); gl.uniform3fv(u.uC1, pal[1]); gl.uniform3fv(u.uC2, pal[2]);
}
function renderWarp(loop) {
  const u = P.warp.u; gl.useProgram(P.warp.p);
  gl.uniform2f(u.uLoop, loop[0], loop[1]);
  gl.uniform1f(u.uWarp, state.warp * state.fit);
  gl.uniform2f(u.uPtr, state.ptr[0], state.ptr[1]);
  gl.uniform2f(u.uPtrV, state.ptrV[0], state.ptrV[1]);
  drawTo(warpRT, 256, 256);
}

function renderAt(seconds) {
  const phase = (seconds / LOOP) * Math.PI * 2;
  const loop = [Math.cos(phase), Math.sin(phase)];
  const tick = Math.floor(((seconds / LOOP) % 1 + 1) % 1 * 96) % 96;
  if (state.mode === 'liquid') {
    renderWarp(loop);
    setLiquid(phase, loop, false);
  } else {
    setPixel(phase, loop, tick, W / 6, H / 6, 6, false);
  }
  drawTo(main, W, H);
  // bloom chain: two blur octaves
  gl.useProgram(P.blur.p);
  gl.uniform1i(P.blur.u.uT, 0);
  const pass = (from, to, dx, dy) => { bind(0, from.t); gl.uniform2f(P.blur.u.uD, dx / to.w, dy / to.h); drawTo(to, to.w, to.h); };
  pass(main, blurs[0], 1, 0); pass(blurs[0], blurs[1], 0, 1);
  pass(blurs[1], blurs[2], 1, 0); pass(blurs[2], blurs[3], 0, 1);
  pass(blurs[3], blurs[2], 2.2, 0); pass(blurs[2], blurs[3], 0, 2.2);
  gl.useProgram(P.comp.p);
  bind(0, main.t); gl.uniform1i(P.comp.u.uT, 0);
  bind(1, blurs[1].t); gl.uniform1i(P.comp.u.uB, 1);
  bind(2, blurs[3].t); gl.uniform1i(P.comp.u.uB2, 2);
  gl.uniform1f(P.comp.u.uGlow, state.glow);
  gl.uniform1f(P.comp.u.uTone, state.mode === 'liquid' ? 1 : 0);
  drawTo(null, W, H);
}

// ----- text export: the same shader, one output pixel per character -----
function asciiAt(seconds, cols = 160) {
  const rows = Math.max(2, Math.round(cols * .52 / state.aspect));
  const phase = (seconds / LOOP) * Math.PI * 2, loop = [Math.cos(phase), Math.sin(phase)];
  const tick = Math.floor(((seconds / LOOP) % 1 + 1) % 1 * 96) % 96;
  const rt = target(cols, rows, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
  let chars;
  if (state.mode === 'liquid') {
    renderWarp(loop);
    setLiquid(phase, loop, true, [cols, rows]);
    chars = i => i === charset.length ? '-' : (charset[i] || ' ');
  } else {
    setPixel(phase, loop, tick, cols, rows, 1, true);
    chars = i => PIXEL_RAMP[i] || ' ';
  }
  drawTo(rt, cols, rows);
  const buf = new Uint8Array(cols * rows * 4);
  gl.readPixels(0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  gl.deleteTexture(rt.t); gl.deleteFramebuffer(rt.f);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const lines = [];
  for (let y = rows - 1; y >= 0; y--) {   // framebuffer rows start at the bottom
    let s = '';
    for (let x = 0; x < cols; x++) s += chars(buf[(y * cols + x) * 4]);
    lines.push(s.replace(/\s+$/, ''));
  }
  return lines.join('\n');
}

function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const baseName = () => 'ascii-' + (state.terra ? 'terra-6.1' : state.preset);
function now() { return clock; }
$('savePng').onclick = () => { renderAt(now()); canvas.toBlob(b => download(b, baseName() + '.png')); };
$('saveTxt').onclick = () => download(new Blob([asciiAt(now())], { type:'text/plain;charset=utf-8' }), baseName() + '.txt');
$('copyTxt').onclick = async e => { const b = e.target, t = b.textContent;
  try { await navigator.clipboard.writeText(asciiAt(now())); b.textContent = 'Copied'; } catch { b.textContent = 'Blocked'; }
  setTimeout(() => b.textContent = t, 1100); };
$('rec').onclick = () => {
  const b = $('rec'); if (typeof MediaRecorder === 'undefined') { b.textContent = 'Not supported here'; return; }
  const type = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(canvas.captureStream(60), { mimeType:type, videoBitsPerSecond:24e6 });
  const chunks = [], secs = LOOP / Math.max(state.speed, .25);
  if (!state.speed) state.speed = 1, syncUI();
  rec.ondataavailable = e => chunks.push(e.data);
  rec.onstop = () => { download(new Blob(chunks, { type }), baseName() + (type.includes('mp4') ? '.mp4' : '.webm')); b.disabled = false; b.textContent = 'Record one loop'; };
  b.disabled = true; b.textContent = 'Recording ' + secs.toFixed(0) + 's…';
  setPaused(false); recording = true;
  rec.start(); setTimeout(() => { rec.stop(); recording = false; }, secs * 1000);
};

let clock = 1, last = performance.now(), frames = 0, fpsT = last, slow = 0, paused = matchMedia('(prefers-reduced-motion: reduce)').matches, recording = false;
function setPaused(v) { paused = v; $('pause').textContent = v ? 'Play' : 'Pause'; $('pause').setAttribute('aria-pressed', String(v)); }
setPaused(paused);
$('pause').onclick = () => setPaused(!paused);
function tick(t) {
  const dt = Math.min(.1, (t - last) / 1000); last = t;
  if (!paused) clock = (clock + dt * state.speed) % LOOP;
  state.ptrV[0] *= .92; state.ptrV[1] *= .92;
  renderAt(clock);
  frames++;
  if (t - fpsT > 500) {
    const fps = frames * 1000 / (t - fpsT);
    $('fps').textContent = Math.round(fps) + ' fps'; frames = 0; fpsT = t;
    // Slow devices trade liquid-style resolution for a steady frame rate.
    slow = fps < 26 ? slow + 1 : 0;
    if (slow >= 4 && state.mode === 'liquid' && !recording && !hasSize && quality > .55) { quality *= .8; slow = 0; resize(); }
  }
  requestAnimationFrame(tick);
}

// ----- boot -----
buildAtlas($('chars').value);
genericMask();
if (params.has('bare')) document.body.classList.add('bare');
resize();
if (params.get('preset') === 'terra' || params.get('preset') === 'smoke') loadPreset(params.get('preset'));
else { $('text').value = 'ZIRKO MIRKO'; state.mode = 'liquid'; resize(); refreshSource(); ready = true; }
syncUI();

// Offline capture hook (see tools/render.js).
window.ASCII = { renderAt, asciiAt, state, loadPreset, setMode, LOOP, get ready() { return ready; },
  loadImage: async url => applyImage(await decodeImage(await (await fetch(url)).blob())),
  configure(o) {
    if (o.style) setMode(o.style);
    Object.keys(o).forEach(k => { if (k !== 'style' && o[k] !== undefined) state[k] = o[k]; });
    if (o.density) resize();
    if (o.invert !== undefined) state.maskInvert = false;
    if (o.invert !== undefined || o.thresh !== undefined) pushSource();
    syncUI();
  },
  frame(seconds) { renderAt(seconds); return canvas.toDataURL('image/png'); },
  setText(s) { $('text').value = s; state.preset = 'text'; state.terra = false; userImage = null; genericMask(); state.invert = false; state.thresh = .5; resetImageState(); refreshSource(); syncUI(); } };
if (!params.has('still')) requestAnimationFrame(tick);
