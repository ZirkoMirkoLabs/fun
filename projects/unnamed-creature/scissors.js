import * as THREE from "three";
import { mergeVertices } from "three";
import { frame, canvas, tex, rng, gridGeometry, sweep, mat, latheSmooth, shadowed } from "./util.js";
const PIVOT = [643, 688];
function bladeRoughness() {
  const c = canvas(512, 128), x = c.getContext("2d"), r = rng(7);
  x.fillStyle = "#242424", x.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 900; i++) {
    const y = r() * 128, xx = r() * 512, len = 8 + r() * 120;
    x.strokeStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${0.02 + r() * 0.08})`.replace(/\d+,\d+,\d+/, (m) => {
      const v = r() > 0.5 ? 255 : 90;
      return `${v},${v},${v}`;
    }), x.lineWidth = 0.4 + r() * 0.8, x.beginPath(), x.moveTo(xx, y), x.lineTo(xx + len, y + (r() - 0.5) * 2), x.stroke();
  }
  for (let i = 0; i < 140; i++)
    x.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.09})`, x.beginPath(), x.ellipse(r() * 512, r() * 128, 5 + r() * 25, 2 + r() * 8, r() * 3, 0, 7), x.fill();
  return tex(c, !1);
}
function buildBlade(g, spinePx, edgePx, { th = 9, mat: m, ramp, vb0 = 0.82, vb1 = 0.25, N = 160 }) {
  const toCurve = (pts) => new THREE.CatmullRomCurve3(pts.map((p) => g.P(p[0], p[1], 0)), !1, "centripetal"), cs = toCurve(spinePx), ce = toCurve(edgePx), thU = g.R(th), spineLenPx = cs.getLength() / g.sc, stripA = [], stripB = [], stripC = [], ts = [], sm = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    ts.push(t);
    const S = cs.getPointAt(t), E = ce.getPointAt(t), T = thU * (0.3 + 0.7 * sm(0, 0.35, t)), vb = 0.84 - 0.44 * Math.pow(t, 1.9), at = (v, z) => new THREE.Vector3().lerpVectors(S, E, v).setZ(z), rampZ = (v) => {
      if (!ramp) return 0;
      const d = Math.max(0, (t - ramp.t0) * spineLenPx);
      return -ramp.c * Math.min(d, ramp.max) * g.sc;
    }, zf = (v) => T * (0.5 + 0.22 * Math.sin(Math.PI * Math.min(1, v / vb))) + rampZ(v) * (ramp ? 1 : 0), A = [];
    for (let j = 0; j <= 6; j++) {
      const v = 1 - 0.95 * j / 6;
      A.push(at(v, -T * 0.5));
    }
    const vc = 0.05;
    for (let j = 1; j <= 10; j++) {
      const ph = -Math.PI / 2 + Math.PI * j / 10;
      A.push(at(vc * (1 - Math.cos(ph)) * (ph > -Math.PI / 2, 1), T * 0.5 * Math.sin(ph) + (ph > 0 ? rampZ(0) * 0 : 0)));
    }
    const nf = 18;
    for (let j = 1; j <= nf; j++) {
      const v = vc + (vb - vc) * j / nf;
      A.push(at(v, zf(v)));
    }
    stripA.push(A);
    const B = [], zb0 = zf(vb), zb1 = -T * 0.46;
    for (let j = 0; j <= 8; j++) {
      const u = j / 8, v = vb + (1 - vb) * u;
      B.push(at(v, zb0 + (zb1 - zb0) * (u * u * 0.3 + u * 0.7)));
    }
    stripB.push(B), stripC.push([at(1, zb1), at(1, -T * 0.5)]);
  }
  const grp = new THREE.Group();
  for (const [rows, flip] of [[stripA, !1], [stripB, !1], [stripC, !1]]) {
    const geo = gridGeometry(rows, { flip }), mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = mesh.receiveShadow = !0, grp.add(mesh);
  }
  return g.add(grp), grp;
}
function ringPts(g, cx, cy, rx, ry, rot, n = 28, skew = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    let x = rx * Math.cos(a), y = ry * Math.sin(a);
    const e = 1 + skew * Math.cos(a);
    x *= e, pts.push(g.P(cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot), 0));
  }
  return pts;
}
function buildScissors(scene, M) {
  const root = new THREE.Group();
  scene.add(root);
  const z1 = 0.62, z2 = 0.98, g1 = frame(PIVOT[0], PIVOT[1], z1, root), g2 = frame(PIVOT[0], PIVOT[1], z2, root), rough = bladeRoughness(), steel = mat(14672869, 0.05, 1, { roughnessMap: rough, envMapIntensity: 1.35, side: THREE.DoubleSide });
  steel.roughness = 1;
  const steel2 = steel.clone();
  steel2.roughness = 1, steel.roughness = 0.3, steel2.roughness = 0.3, buildBlade(
    g2,
    [[173, 819], [240, 794], [320, 765], [400, 737], [500, 706], [600, 672], [680, 644], [748, 619]],
    [[173, 822], [205, 838], [250, 846], [300, 838], [400, 811], [500, 780], [600, 749], [665, 732], [715, 712], [748, 690]],
    { th: 10, mat: steel }
  ), buildBlade(
    g1,
    [[172, 503], [220, 499], [260, 503], [300, 519], [400, 550], [500, 583], [600, 619], [670, 645], [750, 672]],
    [[172, 507], [200, 520], [250, 540], [350, 583], [450, 621], [520, 650], [556, 668], [650, 705], [748, 735]],
    { th: 10, mat: steel2, ramp: { t0: 0.8, c: 0.5, max: 42 } }
  );
  const plastic = mat(15225628, 0.34, 0, { clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.55, sheen: 0.2, sheenColor: new THREE.Color(16751184) }), mould = (g, outerPx, hole, { bt = 12, bs = 10, depth = 10 } = {}) => {
    const cv = new THREE.CatmullRomCurve3(outerPx.map((p) => new THREE.Vector3(...p, 0)), !0, "centripetal"), loc = (x, y) => new THREE.Vector2((x - PIVOT[0]) * g.sc, -(y - PIVOT[1]) * g.sc), outer = cv.getPoints(320).map((p) => loc(p.x, p.y));
    outer.pop();
    const [cx, cy, rx, ry, rot] = hole, hp = [];
    for (let i = 0; i < 72; i++) {
      const a = -i / 72 * Math.PI * 2, x = rx * Math.cos(a), y = ry * Math.sin(a);
      hp.push(loc(cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)));
    }
    const shape = new THREE.Shape(outer);
    shape.holes.push(new THREE.Path(hp));
    let geo = new THREE.ExtrudeGeometry(shape, { depth: g.R(depth), bevelEnabled: !0, bevelThickness: g.R(bt), bevelSize: g.R(bs), bevelOffset: -g.R(bs), bevelSegments: 12, curveSegments: 1, steps: 1 });
    geo.deleteAttribute("normal"), geo.deleteAttribute("uv"), geo = mergeVertices(geo, g.R(0.02)), geo.computeVertexNormals(), geo.translate(0, 0, -g.R(depth) / 2);
    const m = new THREE.Mesh(geo, plastic);
    return g.add(m), shadowed(m), m;
  };
  mould(g2, [[749, 612], [790, 603], [823, 591], [841, 569], [846, 543], [865, 510], [899, 490], [935, 483], [973, 489], [1003, 507], [1015, 538], [1010, 573], [991, 603], [960, 624], [925, 634], [889, 640], [850, 646], [800, 653], [749, 657], [746, 645], [746, 625]], [925, 557, 59, 47, -0.12]);
  {
    const g = g2, nub = sweep([g.P(944, 618, 0), g.P(948, 630, g.R(2)), g.P(951, 640, g.R(2))], plastic, { seg: 14, radial: 18, radius: (t) => [g.R(9.5 - 3.5 * t * t), g.R(8 - 2 * t * t)], cap: !0 }), tip = new THREE.Mesh(new THREE.SphereGeometry(g.R(6), 20, 14), plastic);
    tip.position.copy(g.P(951, 640, g.R(2))), tip.scale.set(1, 0.9, 0.8), g.add(nub, tip), shadowed(nub), shadowed(tip);
  }
  mould(g1, [[745, 716], [780, 720], [820, 727], [860, 735], [905, 739], [950, 745], [985, 757], [1010, 775], [1026, 802], [1022, 832], [1004, 853], [972, 868], [930, 874], [888, 866], [858, 846], [838, 818], [833, 791], [824, 768], [790, 754], [745, 749], [743, 735]], [926, 801, 71, 40, 0.12]);
  {
    const g = g1, rib = sweep([g.P(792, 724, 0), g.P(850, 731, 0), g.P(906, 742, 0)], plastic, { seg: 20, radial: 14, radius: (t) => [g.R(4.5 * Math.sin(Math.PI * (0.12 + t * 0.76))), g.R(3.4)], cap: !0 });
    rib.position.z = g.R(15), g.add(rib), shadowed(rib);
  }
  const screwMat = mat(15790834, 0.1, 1, { envMapIntensity: 1.3, emissive: 11842740 }), dark = mat(1381653, 0.5, 0), screw = (g, x, y, r, dz) => {
    const grp = new THREE.Group(), R = g.R(r), dome = latheSmooth([[0, R * 0.62], [R * 0.55, R * 0.56], [R * 0.92, R * 0.32], [R, 0.03 * R], [R * 1, -R * 0.1], [0, -R * 0.1]].reverse().reverse(), screwMat, 48, 60);
    dome.rotation.x = Math.PI / 2, grp.add(dome);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(R * 1.5, R * 0.16, R * 0.1), dark);
    slot.position.z = R * 0.6, slot.rotation.z = 0.5, grp.add(slot);
    const washer = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.12, R * 1.12, R * 0.12, 40), mat(9408909, 0.3, 1, { envMapIntensity: 1.1 }));
    washer.rotation.x = Math.PI / 2, washer.position.z = -R * 0.05, grp.add(washer), grp.position.copy(g.P(x, y, dz)), g.add(grp), shadowed(grp);
  };
  return screw(g2, 643, 688, 15, g2.R(6)), screw(g1, 572, 648, 10.5, g1.R(6)), { root, g1, g2, steel };
}
export {
  buildScissors
};
