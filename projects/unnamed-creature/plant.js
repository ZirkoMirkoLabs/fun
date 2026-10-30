import * as THREE from "three";
import { frame, canvas, tex, rng, sweep, gridGeometry, mat, shadowed } from "./util.js";
function leafTexture(seed, tint) {
  const c = canvas(256, 512), x = c.getContext("2d"), R = rng(seed * 31 + 7), g = x.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, tint[0]), g.addColorStop(0.5, tint[1]), g.addColorStop(1, tint[0]), x.fillStyle = g, x.fillRect(0, 0, 256, 512), x.lineCap = "round";
  for (let i = 0; i < 16; i++) {
    const y = 40 + i * 28;
    for (const sg of [-1, 1])
      x.strokeStyle = "rgba(150,170,90,.22)", x.lineWidth = 1.4, x.beginPath(), x.moveTo(128, y), x.quadraticCurveTo(128 + sg * 50, y - 14, 128 + sg * 118, y - 54), x.stroke();
  }
  x.strokeStyle = "rgba(190,200,110,.75)", x.lineWidth = 4, x.beginPath(), x.moveTo(128, 6), x.lineTo(128, 510), x.stroke();
  for (let i = 0; i < 2200; i++)
    x.fillStyle = `rgba(${R() < 0.5 ? "200,215,150" : "10,25,5"},${0.03 + R() * 0.06})`, x.fillRect(R() * 256, R() * 512, 1 + R() * 2, 1 + R() * 3);
  return tex(c, !0);
}
function leafGeometry(len, wid, curl, fold, twist) {
  const rows = [];
  for (let i = 0; i <= 44; i++) {
    const t = i / 44, hw = wid / 2 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.85) * (1 - 0.18 * t * t), row = [];
    for (let j = 0; j < 21; j++) {
      const x = (j / 20 * 2 - 1) * hw, z = fold * Math.abs(x) * (1 - t * 0.3) - 6e-3 * wid * Math.exp(-Math.pow(x / (wid * 0.03), 2)) + curl * len * Math.pow(t - 0.1, 2) + twist * x * t;
      row.push(new THREE.Vector3(x, t * len, z));
    }
    rows.push(row);
  }
  const g = gridGeometry(rows), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const a = uv.getX(i), b = uv.getY(i);
    uv.setXY(i, b, a);
  }
  return g;
}
function buildPlant(parent) {
  const out = {}, root = new THREE.Group();
  parent.add(root), out.root = root;
  const fr = frame(340, 318, 1.05, root), P = fr.P, R = fr.R, bumpC = canvas(128, 128), bx = bumpC.getContext("2d"), rr = rng(5);
  bx.fillStyle = "#808080", bx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    const v = rr() < 0.5 ? 50 : 210;
    bx.strokeStyle = `rgba(${v},${v},${v},.5)`, bx.lineWidth = 1 + rr() * 2, bx.beginPath(), bx.moveTo(rr() * 128, rr() * 128), bx.lineTo(rr() * 128, rr() * 128), bx.stroke();
  }
  const armBump = tex(bumpC, !1, !0), tan = mat(12165242, 0.72, 0, { bumpMap: armBump, bumpScale: 2.2, sheen: 1, sheenColor: new THREE.Color(15061931), sheenRoughness: 0.5, envMapIntensity: 0.35 }), arm = sweep([P(486, 320, R(-8)), P(455, 312, R(-2)), P(430, 306, 0), P(412, 303, 0)], tan, { seg: 30, radial: 28, radius: (t) => [R(17 + 2 * t), R(15 + 2 * t)] });
  fr.add(arm), shadowed(arm);
  const rubber = new THREE.MeshPhysicalMaterial({ color: 16773580, roughness: 0.26, metalness: 0, transmission: 0.85, thickness: 0.35, ior: 1.42, attenuationColor: new THREE.Color(15319658), attenuationDistance: 1.8, clearcoat: 0.45, clearcoatRoughness: 0.18, envMapIntensity: 0.7, specularIntensity: 1 }), milky = rubber.clone();
  milky.color = new THREE.Color(16181437), milky.transmission = 0.8, milky.roughness = 0.5, milky.attenuationDistance = 0.5;
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(R(28), R(26), R(16), 56, 1), milky);
  cuff.rotation.z = Math.PI / 2, cuff.position.copy(P(403, 304, 0)), cuff.scale.set(1, 1, 1.15), fr.add(cuff), shadowed(cuff);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(R(28), R(5), 18, 56), milky);
  lip.rotation.y = Math.PI / 2, lip.position.copy(P(412, 304, 0)), lip.scale.set(1, 1.12, 1), fr.add(lip), shadowed(lip);
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), rubber);
  palm.scale.set(R(24), R(31), R(22)), palm.position.copy(P(366, 320, 0)), fr.add(palm), shadowed(palm);
  const ys = [292, 313, 333, 350], rs = [10.5, 11, 10.4, 8.8];
  ys.forEach((y, i) => {
    const pts = [P(368, y + 2, R(8)), P(344, y, R(14)), P(324, y + 1, R(14)), P(312, y + 6, R(12))], f = sweep(pts, rubber, { seg: 40, radial: 22, radius: (t) => [R(rs[i] * (1 - 0.12 * t)), R(rs[i] * (1 - 0.12 * t))], cap: !0 });
    fr.add(f), shadowed(f);
    const end = new THREE.Mesh(new THREE.SphereGeometry(R(rs[i] * 0.88), 24, 16), rubber);
    end.position.copy(pts[pts.length - 1]), fr.add(end), shadowed(end);
    const kn = new THREE.Mesh(new THREE.SphereGeometry(R(rs[i] * 0.95), 24, 16), rubber);
    kn.position.copy(P(352, y, R(10))), fr.add(kn), shadowed(kn);
  });
  const thumb = sweep([P(372, 288, R(12)), P(344, 280, R(16)), P(320, 280, R(15)), P(308, 288, R(12))], rubber, { seg: 30, radial: 22, radius: (t) => [R(10.5 - 2 * t), R(10.5 - 2 * t)], cap: !0 });
  fr.add(thumb), shadowed(thumb);
  const sp = frame(322, 300, 1.1, root);
  out.sprig = sp;
  const SP = sp.P, SR = sp.R, stemMat = mat(7039534, 0.5, 0, { clearcoat: 0.3 }), stem = sweep([SP(381, 366, 0), SP(361, 341, 0), SP(332, 304, 0), SP(312, 272, 0), SP(300, 249, 0), SP(291, 228, 0), SP(283, 210, 0)], stemMat, { seg: 50, radial: 12, radius: (t) => [SR(3.2 - 1.4 * t), SR(3.2 - 1.4 * t)], cap: !0 });
  sp.add(stem), shadowed(stem);
  const leafDefs = [
    { b: [283, 209], t: [316, 86], w: 56, curl: 0.1, fold: 0.22, tw: 0.08, seed: 1, z: 6 },
    { b: [276, 207], t: [192, 160], w: 50, curl: 0.12, fold: 0.2, tw: -0.1, seed: 2, z: 3 },
    { b: [301, 238], t: [377, 157], w: 38, curl: 0.16, fold: 0.26, tw: 0.12, seed: 3, z: 8 },
    { b: [297, 248], t: [185, 297], w: 33, curl: 0.14, fold: 0.3, tw: -0.12, seed: 4, z: 4 },
    { b: [290, 230], t: [244, 174], w: 28, curl: 0.1, fold: 0.2, tw: 0.1, seed: 5, z: 2 }
  ];
  out.leaves = [];
  for (const d of leafDefs) {
    const len = Math.hypot(d.t[0] - d.b[0], d.t[1] - d.b[1]), lg = new THREE.Group();
    lg.position.copy(SP(d.b[0], d.b[1], SR(d.z))), sp.add(lg);
    const dirv = new THREE.Vector3(d.t[0] - d.b[0], -(d.t[1] - d.b[1]), 0).normalize();
    lg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirv), lg.userData.q0 = lg.quaternion.clone();
    const lm = mat(16777215, 0.34, 0, { map: leafTexture(d.seed, d.seed % 2 ? ["#18290f", "#2b4119"] : ["#1f3315", "#3b5222"]), clearcoat: 0, roughness: 0.48, side: THREE.DoubleSide, envMapIntensity: 0.12, sheen: 0, sheenColor: new THREE.Color(10137696) }), mesh = new THREE.Mesh(leafGeometry(SR(len), SR(d.w), d.curl, d.fold, d.tw), lm);
    lg.add(mesh), shadowed(mesh), out.leaves.push(lg);
  }
  return out;
}
export {
  buildPlant
};
