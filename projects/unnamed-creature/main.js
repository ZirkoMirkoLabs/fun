import * as THREE from "three";
import { makeEnv, makeWindowEnv } from "./env.js";
import { CAMZ } from "./util.js";
import { buildScissors } from "./scissors.js";
import { buildBall } from "./ball.js";
import { buildBracket } from "./bracket.js";
import { buildBug } from "./bug.js";
import { EffectComposer } from "three";
import { RenderPass } from "three";
import { GTAOPass } from "three";
import { OutputPass } from "three";
const qs = location.search, still = new URLSearchParams(qs).has("still"), reduced = matchMedia("(prefers-reduced-motion: reduce)").matches, frozen = still || reduced, W = 12, H = 8.84, renderer = new THREE.WebGLRenderer({ antialias: !0, alpha: !1, preserveDrawingBuffer: !1, powerPreference: "high-performance" }), phone = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 820;
renderer.setPixelRatio(Math.min(devicePixelRatio, phone ? 1.5 : 2)), renderer.shadowMap.enabled = !0, renderer.shadowMap.type = THREE.VSMShadowMap, renderer.outputColorSpace = THREE.SRGBColorSpace, renderer.toneMapping = THREE.NoToneMapping, document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(25, 1, 10, 40);
camera.position.set(0, 0, CAMZ);
const FIT_T = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 0], [1, 1], [1, 2], [1, 3], [2, 0], [2, 1], [2, 2], [3, 0], [3, 1], [4, 0]], FIT = [[250.0918, 8.7624, 6.5065, -35.884, 23.1549, 13.0813, -28.8723, 14.1305, 10.2475, -17.8903, 58.9911, -39.4046, -34.163, -5.8982, 18.9324], [221.8469, 6.0106, 23.7164, -69.4254, 41.8333, 21.0932, -35.6043, 28.4469, 12.6225, -82.8364, 59.113, -50.7483, 53.5903, -1.8014, -15.419], [110.1856, 45.7118, 58.5374, -481.2539, 351.9879, 101.8501, -366.274, 514.3869, -224.6051, -472.9144, 442.5413, -157.2986, 504.3356, -182.7741, -182.7033]], fitGLSL = (c) => FIT[c].map((v, i) => `(${v.toFixed(4)})*f${i}`).join("+"), fitDecl = FIT_T.map(([i, j], n) => `float f${n}=${i ? "pow(x," + i + ".)" : "1."}*${j ? "pow(y," + j + ".)" : "1."};`).join(""), bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  depthTest: !1,
  depthWrite: !1,
  uniforms: { uAsp: { value: 1.357 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv=position.xy*.5+.5; gl_Position=vec4(position.xy,1.,1.); }",
  fragmentShader: `varying vec2 vUv; uniform float uAsp;
  float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  void main(){
    float x=vUv.x, y=1.-vUv.y;
    ${fitDecl}
    vec3 c=vec3(${fitGLSL(0)},${fitGLSL(1)},${fitGLSL(2)})/255.;
    // soft sweep shadow on the lower right edge
    float b1=exp(-pow((y-.905)/.024,2.))*smoothstep(.86,.97,x)*(.6+.4*smoothstep(.86,1.,x));
    float b2=smoothstep(.972,1.,y)*smoothstep(.88,1.,x);
    float b3=exp(-pow((y-.93)/.05,2.))*smoothstep(.8,1.,x)*.35;
    c*=1.-.075*b1-.06*b2-.03*b3;
    c+=(h(gl_FragCoord.xy)-.5)/255.; // dither
    c=mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(.04045,c)); // sRGB -> linear (the composer's OutputPass re-encodes)
    gl_FragColor=vec4(c,1.);
  }`
}));
bg.frustumCulled = !1, bg.renderOrder = -10, scene.add(bg);
const env = makeEnv(renderer);
scene.add(new THREE.HemisphereLight(16774879, 14723114, 0.22));
const key = new THREE.DirectionalLight(16775406, 2.7);
key.position.set(-7, 9, 12), key.target.position.set(0, 0, 0), key.castShadow = !0, key.shadow.mapSize.setScalar(phone ? 1024 : 2048);
const sc = key.shadow.camera;
sc.left = -8, sc.right = 8, sc.top = 7, sc.bottom = -7, sc.near = 1, sc.far = 40, key.shadow.radius = 3.2, key.shadow.blurSamples = 16, key.shadow.bias = -4e-4, key.shadow.normalBias = 0.012, scene.add(key, key.target);
const fill = new THREE.DirectionalLight(16773328, 0.3);
fill.position.set(7, 2, 8), scene.add(fill);
const rim = new THREE.DirectionalLight(16777215, 0.35);
rim.position.set(2, 4, -8), scene.add(rim);
const DIEL_ENV = 0.34, SHEEN_K = 0.4, world = { renderer, scene, camera, env, key, windowEnv: makeWindowEnv(renderer) }, scissors = buildScissors(scene, world), ball = buildBall(scene, world), bracket = buildBracket(scene, world), bug = buildBug(scene, world);
{
  const seen = /* @__PURE__ */ new Set();
  scene.traverse((o) => {
    if (o.material)
      for (const m of [].concat(o.material))
        seen.has(m) || !m.isMeshStandardMaterial || (seen.add(m), m.envMap || (m.envMap = env, m.metalness < 0.5 && (m.envMapIntensity *= DIEL_ENV)), m.sheen > 0 && m.sheenColor && m.sheenColor.multiplyScalar(SHEEN_K), m.needsUpdate = !0);
  });
}
let composer = null, gtao = null;
if (!qs.includes("noao"))
  try {
    const dpr = renderer.getPixelRatio(), rt = new THREE.WebGLRenderTarget(innerWidth * dpr, innerHeight * dpr, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt), composer.addPass(new RenderPass(scene, camera)), gtao = new GTAOPass(scene, camera, innerWidth, innerHeight), gtao.output = GTAOPass.OUTPUT.Default, gtao.blendIntensity = 1.25, gtao.enabled = !phone, gtao.updateGtaoMaterial({ radius: 0.42, distanceExponent: 1.1, thickness: 0.8, scale: 1.9, samples: 16, distanceFallOff: 1.4, screenSpaceRadius: !1 }), gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 16 }), composer.addPass(gtao), composer.addPass(new OutputPass());
  } catch (e) {
    console.warn("AO disabled", e), composer = null;
  }
function resize() {
  const a = innerWidth / innerHeight;
  camera.aspect = a;
  const need = a < 1.35 ? W / a : H;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(need / 2 / CAMZ)), camera.updateProjectionMatrix(), renderer.setSize(innerWidth, innerHeight), bg.material.uniforms.uAsp.value = a, composer && composer.setSize(innerWidth, innerHeight);
}
let frames = 0;
addEventListener("resize", () => {
  resize(), frozen && (frames = 0, requestAnimationFrame(animate));
}), resize();
const now = () => performance.now();
let oAz = 0, oEl = 0, clickTime = -1e6, drag = !1, lastX = 0, lastY = 0, ox = 0, oy = 0, mx = 0, my = 0;
const cv = renderer.domElement;
cv.addEventListener("pointerdown", (e) => {
  clickTime = now(), drag = !0, lastX = e.clientX, lastY = e.clientY, cv.setPointerCapture(e.pointerId), bug.impulse(1);
}), cv.addEventListener("pointermove", (e) => {
  mx = e.clientX / innerWidth * 2 - 1, my = e.clientY / innerHeight * 2 - 1, drag && (ox = THREE.MathUtils.clamp(ox - (e.clientX - lastX) * 26e-4, -0.436, 0.436), oy = THREE.MathUtils.clamp(oy + (e.clientY - lastY) * 22e-4, -0.25, 0.25), lastX = e.clientX, lastY = e.clientY);
});
const up = () => {
  drag = !1;
};
cv.addEventListener("pointerup", up), cv.addEventListener("pointercancel", up);
let tPrev = 0;
const snipCurve = (age) => {
  if (age < 0) return 0;
  const closeT = 0.16, holdT = 0.05, openT = 0.55;
  if (age < closeT) {
    const u2 = age / closeT;
    return u2 * u2 * (1.2 - 0.2 * u2);
  }
  if (age < closeT + holdT) return 1;
  const u = (age - closeT - holdT) / openT;
  return u >= 1 ? 0 : Math.max(0, Math.cos(u * Math.PI * 0.5) * Math.exp(-u * 1.2) * (1 - u * 0.2) + Math.sin(u * Math.PI * 3) * 0.06 * (1 - u));
};
let snipNow = 0, slowSum = 0, slowN = 0;
function adapt(dt) {
  if (slowN++ < 10 || (slowSum += dt, slowN < 70)) return;
  const avg = slowSum / 60;
  if (slowSum = 0, slowN = 10, avg < 0.024) return;
  if (gtao && gtao.enabled) {
    gtao.enabled = !1;
    return;
  }
  const d = renderer.getPixelRatio();
  if (d > 1) {
    const n = Math.max(1, d - 0.25);
    renderer.setPixelRatio(n), composer && composer.setPixelRatio(n), resize();
  }
}
function animate(t) {
  const time = t * 1e-3, dt = Math.min(0.05, time - tPrev);
  tPrev = time;
  const live = !still && !reduced;
  if (live) {
    const age = (now() - clickTime) * 1e-3;
    snipNow = snipCurve(age);
    const maxA = 0.2;
    scissors.g1.rotation.z = snipNow * maxA, scissors.g2.rotation.z = -snipNow * maxA, ball.update(time, dt, snipNow, age), bug.update(time, dt, { mx, my, age, snip: snipNow }), drag || (ox *= Math.pow(0.02, dt), oy *= Math.pow(0.02, dt)), oAz += (ox - oAz) * Math.min(1, dt * 9), oEl += (oy - oEl) * Math.min(1, dt * 9), camera.position.set(Math.sin(oAz) * CAMZ * Math.cos(oEl), -Math.sin(oEl) * CAMZ, Math.cos(oAz) * CAMZ * Math.cos(oEl)), camera.lookAt(0, 0, 0);
  }
  frozen && frames > 2 || (frames++, composer ? composer.render() : renderer.render(scene, camera), frames === 3 && dispatchEvent(new Event("creature-ready")), live && adapt(dt), requestAnimationFrame(animate));
}
frozen && (ball.update(0, 0, 0, 9), bug.update(0, 0, { mx: 0, my: 0, age: 9, snip: 0 }), bug.pose && bug.pose()), camera.lookAt(0, 0, 0), requestAnimationFrame(animate);
