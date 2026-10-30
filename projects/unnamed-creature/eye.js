import * as THREE from "three";
import { IRIS_N } from "./env.js";
import { frame, canvas, tex, rng, gridGeometry, mat, shadowed } from "./util.js";
const EYE = { x: 518, y: 236, r: 85, z: 1.55 }, IRIS_DIR = new THREE.Vector3(...IRIS_N).normalize(), MOUTH_DIR = new THREE.Vector3(-0.27, -0.6, 0.75).normalize(), MOUTH_TILT = -0.1;
function dirToUV(p) {
  let u = Math.atan2(p.z, -p.x) / (Math.PI * 2);
  u < 0 && (u += 1);
  const v = 1 - Math.acos(THREE.MathUtils.clamp(p.y, -1, 1)) / Math.PI;
  return [u, v];
}
function scleraTexture(mouthFrame) {
  const c = canvas(4096, 2048), x = c.getContext("2d"), R = rng(11), P = (p) => {
    const [u, v] = dirToUV(p);
    return [u * 4096, (1 - v) * 2048];
  };
  x.fillStyle = "#f1eeec", x.fillRect(0, 0, 4096, 2048);
  const wash = (dir, rad, col, a) => {
    const q = P(dir.clone().normalize()), g = x.createRadialGradient(q[0], q[1], 0, q[0], q[1], rad);
    g.addColorStop(0, col.replace("A", a)), g.addColorStop(1, col.replace("A", 0)), x.fillStyle = g, x.fillRect(0, 0, 4096, 2048);
  };
  for (let i = 0; i < 36; i++) {
    const a = (R() - 0.2) * 2.4, b = (R() - 0.62) * 1.8, d = new THREE.Vector3(Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b));
    wash(d, 150 + R() * 260, "rgba(226,150,140,A)", (0.03 + R() * 0.06) * (d.x > -0.3 ? 1.2 : 0.5));
  }
  wash(new THREE.Vector3(0.8, -0.1, 0.35), 700, "rgba(210,125,120,A)", 0.14), wash(new THREE.Vector3(-0.6, 0.1, 0.5), 900, "rgba(200,196,214,A)", 0.2);
  const iris = IRIS_DIR.clone(), up = new THREE.Vector3(0, 1, 0), stroke = (pts, w, a) => {
    for (const [lw, al, col] of [[w * 3.2, a * 0.16, "170,60,60"], [w, a, "168,28,38"]]) {
      x.strokeStyle = `rgba(${col},${al})`, x.lineWidth = lw, x.lineCap = "round", x.lineJoin = "round", x.beginPath();
      let prev = null;
      for (const p of pts) {
        const q = P(p);
        prev && Math.abs(q[0] - prev[0]) > 4096 / 2 && (x.stroke(), x.beginPath(), prev = null), prev ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]), prev = q;
      }
      x.stroke();
    }
  }, grow = (p, dir, steps, w, a, depth) => {
    const pts = [p.clone()];
    let cur = p.clone(), d = dir.clone();
    for (let s = 0; s < steps; s++) {
      const toI = iris.clone().sub(cur);
      toI.addScaledVector(cur, -toI.dot(cur)).normalize();
      const rnd = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5);
      if (rnd.addScaledVector(cur, -rnd.dot(cur)), d.addScaledVector(rnd, 0.95).addScaledVector(toI, 0.03), d.addScaledVector(cur, -d.dot(cur)).normalize(), cur = cur.clone().addScaledVector(d, 0.02).normalize(), pts.push(cur.clone()), cur.angleTo(iris) < 0.78) break;
      if (depth < 3 && R() < 0.11) {
        const side = d.clone().applyAxisAngle(cur, (R() < 0.5 ? 1 : -1) * (0.5 + R() * 0.7));
        grow(cur, side, Math.floor(steps * (0.45 + R() * 0.3)), w * 0.68, a * 0.88, depth + 1);
      }
    }
    stroke(pts, w, a);
  };
  for (let i = 0; i < 12; i++) {
    const ang = R() < 0.6 ? -1.3 + R() * 3.2 : R() * 6.28, rad = 1.1 + R() * 0.55, t = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0), root = iris.clone().applyAxisAngle(new THREE.Vector3(-Math.sin(ang), Math.cos(ang), 0).normalize(), rad).normalize(), dir = iris.clone().sub(root);
    dir.addScaledVector(root, -dir.dot(root)).normalize(), !(root.z < -0.25) && grow(root, dir, 48 + (R() * 26 | 0), 8 + R() * 3, 0.65 + R() * 0.3, 0);
  }
  for (let i = 0; i < 12; i++) {
    const a = R() * 6.28, rad = 1 + R() * 0.6, root = iris.clone().applyAxisAngle(new THREE.Vector3(-Math.sin(a), Math.cos(a), 0).normalize(), rad).normalize();
    if (root.z < -0.1) continue;
    const dir = iris.clone().sub(root);
    dir.addScaledVector(root, -dir.dot(root)).normalize(), grow(root, dir, 12 + (R() * 14 | 0), 3 + R() * 1.5, 0.3 + R() * 0.3, 2);
  }
  x.save(), x.globalCompositeOperation = "destination-out", x.fillStyle = "#000", x.beginPath();
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const a = i / N * Math.PI * 2, q = P(mouthFrame.wrap(Math.cos(a) * 30, Math.sin(a) * 10.5 * (Math.sin(a) > 0 ? 1 : 1.12), 0, !0));
    i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]);
  }
  return x.fill(), x.restore(), tex(c, !0);
}
function irisTexture() {
  const c = canvas(1024, 512), x = c.getContext("2d"), R = rng(23), g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#5a3719"), g.addColorStop(0.12, "#8a5a24"), g.addColorStop(0.34, "#c28a43"), g.addColorStop(0.62, "#a87635"), g.addColorStop(0.8, "#7a5b34"), g.addColorStop(0.92, "#4a3d2c"), g.addColorStop(1, "#25211b"), x.fillStyle = g, x.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 2600; i++) {
    const px = R() * 1024, y0 = R() * 512 * 0.6, len = 512 * (0.25 + R() * 0.55), l = R() < 0.5 ? 255 : 0, col = R() < 0.55 ? [226, 178, 96] : R() < 0.5 ? [96, 58, 24] : [250, 215, 140];
    x.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.05 + R() * 0.2})`, x.lineWidth = 0.8 + R() * 2.2, x.beginPath(), x.moveTo(px, y0), x.lineTo(px + (R() - 0.5) * 5, y0 + len), x.stroke();
  }
  x.strokeStyle = "rgba(235,196,120,.4)", x.lineWidth = 6, x.beginPath(), x.moveTo(0, 512 * 0.3), x.lineTo(1024, 512 * 0.3), x.stroke();
  for (let i = 0; i < 90; i++)
    x.fillStyle = `rgba(70,40,14,${0.12 + R() * 0.2})`, x.beginPath(), x.ellipse(R() * 1024, 512 * (0.34 + R() * 0.4), 4 + R() * 8, 14 + R() * 24, 0, 0, 7), x.fill();
  const g2 = x.createLinearGradient(0, 512 * 0.78, 0, 512);
  g2.addColorStop(0, "rgba(40,36,30,0)"), g2.addColorStop(1, "rgba(25,22,20,.85)"), x.fillStyle = g2, x.fillRect(0, 512 * 0.78, 1024, 512 * 0.22);
  const t = tex(c, !0);
  return t.wrapS = THREE.RepeatWrapping, t;
}
function lipBump() {
  const c = canvas(64, 1024), x = c.getContext("2d"), R = rng(5);
  x.fillStyle = "#808080", x.fillRect(0, 0, 64, 1024);
  for (let i = 0; i < 160; i++) {
    const y = R() * 1024, v = 95 + R() * 70;
    x.fillStyle = `rgb(${v},${v},${v})`, x.fillRect(0, y, 64, 0.8 + R() * 2.2);
  }
  return tex(c, !1);
}
let out_cornea;
function buildEye(parent, world) {
  const g = frame(EYE.x, EYE.y, EYE.z, parent);
  g.scale.set(0.965, 1.035, 1);
  const Ru = g.R(EYE.r), pxU = Ru / EYE.r, n = MOUTH_DIR.clone();
  let e1 = new THREE.Vector3(1, 0, 0);
  e1.addScaledVector(n, -e1.dot(n)).normalize();
  let e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
  const cs = Math.cos(MOUTH_TILT), sn = Math.sin(MOUTH_TILT), e1t = e1.clone().multiplyScalar(cs).addScaledVector(e2, sn), e2t = e2.clone().multiplyScalar(cs).addScaledVector(e1, -sn), mouth = {
    n,
    e1: e1t,
    e2: e2t,
    // (x,y) px offsets in the tangent plane -> point on the sphere, lifted by z px; unit=true returns a direction
    wrap(x, y, z, unit = !1) {
      const p = n.clone().addScaledVector(e1t, x / EYE.r).addScaledVector(e2t, y / EYE.r).normalize();
      return unit ? p : p.multiplyScalar(Ru + z * pxU);
    }
  }, sclera = mat(16185599, 0.2, 0, {
    emissive: 2763312,
    map: scleraTexture(mouth),
    alphaTest: 0.5,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 0.55,
    sheen: 0.35,
    sheenColor: new THREE.Color(16766930),
    sheenRoughness: 0.5,
    specularIntensity: 0.7,
    side: THREE.FrontSide
  }), globe = new THREE.Mesh(new THREE.SphereGeometry(Ru, 192, 128), sclera);
  g.add(globe), shadowed(globe);
  const gaze = new THREE.Group();
  g.add(gaze);
  const aim = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), IRIS_DIR);
  gaze.quaternion.copy(aim), gaze.userData.base = aim.clone();
  const capGeo = (rad, ang, ws = 96, hs = 24) => new THREE.SphereGeometry(rad, ws, hs, 0, Math.PI * 2, 0, ang), irisAng = 0.455, irisTex = irisTexture(), irisMat = mat(16777215, 0.45, 0, { map: irisTex, clearcoat: 0.25, clearcoatRoughness: 0.2, envMapIntensity: 0.35 }), irisGeo = capGeo(Ru * 1.004, irisAng), iris = new THREE.Mesh(irisGeo, irisMat);
  gaze.add(iris), shadowed(iris, !1, !0);
  const pupilGeo = capGeo(Ru * 1.0065, irisAng * 0.4, 64, 8), pupil = new THREE.Mesh(pupilGeo, mat(65793, 0.4, 0, { clearcoat: 0.15, envMapIntensity: 0.1 }));
  gaze.add(pupil);
  const corneaMat = new THREE.MeshPhysicalMaterial({ color: 0, roughness: 0.01, metalness: 0, envMap: world.windowEnv, envMapIntensity: 1, transparent: !0, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: !1, specularIntensity: 1 });
  {
    const a = Math.sin(irisAng * 1.1) * Ru, rc = Ru * 0.8, hh = rc - Math.sqrt(rc * rc - a * a), cornea = new THREE.Mesh(new THREE.SphereGeometry(rc, 96, 28, 0, Math.PI * 2, 0, Math.asin(a / rc)), corneaMat);
    cornea.position.y = Ru * 1.004 + hh * 0.5 - rc + hh * 0.5, gaze.add(cornea), out_cornea = cornea;
  }
  const lipMat = mat(9178391, 0.2, 0, { clearcoat: 1, clearcoatRoughness: 0.05, bumpMap: lipBump(), bumpScale: 0.5, envMapIntensity: 0.9, sheen: 0.4, sheenColor: new THREE.Color(16734810) }), Ao = 42, Ai = 0.84, NA = 120, NJ = 20, yuo = (s) => 25.5 * Math.pow(Math.max(0, 1 - s * s), 0.85) - 5 * Math.exp(-Math.pow(s / 0.1, 2)) + 3.2 * Math.exp(-Math.pow((Math.abs(s) - 0.33) / 0.17, 2)), ylo = (s) => -33 * Math.pow(Math.max(0, 1 - s * s), 0.8), yui = (s) => 13 * Math.pow(Math.max(0, 1 - Math.pow(s / 0.85, 2)), 0.65), yli = (s) => -17 * Math.pow(Math.max(0, 1 - Math.pow(s / 0.85, 2)), 0.65), rows = [];
  for (let j = 0; j <= NJ; j++) {
    const u = j / NJ, row = [];
    for (let i = 0; i <= NA; i++) {
      const a = i / NA * Math.PI * 2, s = Math.cos(a), upper = Math.sin(a) >= 0, sc = s * s * s * s * s * s * s * s, O = [Ao * s, upper ? yuo(s) : ylo(s)], Ii = [Ao * s * (Ai + (1 - Ai) * sc), upper ? yui(s) : yli(s)], z = (upper ? 11 : 15) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 2.4)), 0.7) * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.78)), 0.85) - 2.5 * Math.pow(u, 5) * (upper ? 1 : 1.2) + 1.2 * (1 - u);
      row.push(mouth.wrap(O[0] + (Ii[0] - O[0]) * u, O[1] + (Ii[1] - O[1]) * u, z));
    }
    rows.push(row);
  }
  const lipGeo = gridGeometry(rows, { wrapCols: !0, flip: !1 }), lips = new THREE.Mesh(lipGeo, lipMat);
  lips.material.side = THREE.DoubleSide, g.add(lips), shadowed(lips);
  const cav = [], NC = 14;
  for (let d = 0; d <= NC; d++) {
    const t = d / NC, row = [], dep = t * 30, ax = 30 * (1 - 0.22 * t), by = 10.5 * (1 - 0.35 * t);
    for (let i = 0; i <= 48; i++) {
      const a = i / 48 * Math.PI * 2;
      row.push(mouth.wrap(Math.cos(a) * ax, Math.sin(a) * by * (Math.sin(a) > 0 ? 1 : 1.12), -dep - 1 * t));
    }
    cav.push(row);
  }
  const cavMesh = new THREE.Mesh(gridGeometry(cav, { wrapCols: !0, capEnd: !0 }), mat(1704968, 0.5, 0, { side: THREE.DoubleSide, clearcoat: 0.6, envMapIntensity: 0.1 }));
  g.add(cavMesh);
  const mg = new THREE.Group(), basis = new THREE.Matrix4().makeBasis(e1t, e2t, n);
  mg.quaternion.setFromRotationMatrix(basis), mg.position.copy(n.clone().multiplyScalar(Ru)), g.add(mg);
  const toothMat = mat(16052454, 0.25, 0, { clearcoat: 0.8, envMapIntensity: 0.5 });
  for (let i = 0; i < 6; i++) {
    const s = (i - 2.5) / 2.9, tw = 6.6 - Math.abs(s) * 1.2, th = 9.5 - Math.abs(s) * 2.4, tg = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), toothMat);
    tg.scale.set(pxU * tw * 0.78, pxU * th * 0.5, pxU * 4.5);
    const px_ = s * 24.5, py_ = 8.2 * Math.pow(Math.max(0, 1 - Math.pow(px_ / 30, 2)), 0.65) - th * 0.43 + 1;
    tg.position.set(px_ * pxU, py_ * pxU, (-3 - px_ * px_ / 170) * pxU), tg.rotation.z = -px_ * 4e-3, mg.add(tg), shadowed(tg, !0, !0);
  }
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), mat(14841994, 0.3, 0, { clearcoat: 0.7, clearcoatRoughness: 0.2, sheen: 0.3, sheenColor: new THREE.Color(16751272) }));
  tongue.scale.set(pxU * 17, pxU * 6, pxU * 9), tongue.position.set(2 * pxU, -7.5 * pxU, -8 * pxU), mg.add(tongue), shadowed(tongue);
  const tongueLine = new THREE.Mesh(new THREE.CapsuleGeometry(pxU * 0.7, pxU * 11, 6, 10), mat(11750754, 0.4));
  return tongueLine.rotation.z = Math.PI / 2, tongueLine.position.set(2 * pxU, -7 * pxU, 4.2 * pxU), mg.add(tongueLine), { group: g, gaze, pupil, iris, globe, Ru, pxU, mouth };
}
export {
  EYE,
  buildEye
};
