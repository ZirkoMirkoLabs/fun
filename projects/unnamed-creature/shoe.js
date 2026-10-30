import * as THREE from "three";
import { frame, canvas, tex, rng, sweep, sweepGeometry, mat, shadowed } from "./util.js";
const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}, lerpTab = (T, x) => {
  if (x <= T[0][0]) return T[0][1];
  for (let i = 0; i < T.length - 1; i++) if (x <= T[i + 1][0]) {
    const u = (x - T[i][0]) / (T[i + 1][0] - T[i][0]);
    return T[i][1] + (T[i + 1][1] - T[i][1]) * (u * u * (3 - 2 * u));
  }
  return T[T.length - 1][1];
};
function upperTexture(dorsalV) {
  const c = canvas(1024, 512), x = c.getContext("2d"), R = rng(41), g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#f1efea"), g.addColorStop(1, "#e9e6e1"), x.fillStyle = g, x.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 3e4; i++) {
    const v = 200 + R() * 55;
    x.fillStyle = `rgba(${v},${v},${v - 4},.12)`, x.fillRect(R() * 1024, R() * 512, 1.5, 1.5);
  }
  x.strokeStyle = "rgba(110,104,100,.65)", x.lineWidth = 2.2, x.setLineDash([]);
  const line = (pts) => {
    x.beginPath(), pts.forEach(([a, b], i) => i ? x.lineTo(a * 1024, b * 512) : x.moveTo(a * 1024, b * 512)), x.stroke();
  }, side = (v0) => {
    const V = (d) => ((v0 + d) % 1 + 1) % 1;
    line([[0.26, V(-0.18)], [0.28, V(-0.06)], [0.285, V(0)], [0.28, V(0.06)], [0.26, V(0.18)]]), line([[0.38, V(-0.2)], [0.5, V(-0.12)], [0.66, V(-0.07)], [0.78, V(-0.1)], [0.9, V(-0.2)]]), line([[0.88, V(-0.12)], [0.9, V(0)], [0.88, V(0.12)]]), x.setLineDash([6, 5]), x.strokeStyle = "rgba(120,112,106,.55)", line([[0.02, V(0.2)], [0.3, V(0.215)], [0.7, V(0.215)], [0.98, V(0.2)]]), x.setLineDash([]), x.strokeStyle = "rgba(110,104,100,.65)", x.fillStyle = "rgba(70,64,60,.7)";
    for (let i = 0; i < 26; i++) {
      const a = 0.1 + i % 9 * 0.018, b = V(-0.04 + Math.floor(i / 9) * 0.035 + i % 2 * 0.012);
      x.beginPath(), x.arc(a * 1024, b * 512, 2.4, 0, 7), x.fill();
    }
    for (let i = 0; i < 6; i++)
      x.fillStyle = "rgba(60,56,54,.8)", x.beginPath(), x.arc((0.42 + i * 0.042) * 1024, V(-0.255 + i * 4e-3) * 512, 3.4, 0, 7), x.fill();
  };
  return side(dorsalV + 0.25), side(dorsalV + 0.75), tex(c, !0);
}
function soleBump() {
  const c = canvas(512, 256), x = c.getContext("2d");
  x.fillStyle = "#808080", x.fillRect(0, 0, 512, 256);
  for (const [y, hh, v] of [[0.18, 0.015, 60], [0.3, 0.015, 200], [0.5, 0.02, 40], [0.64, 0.02, 210], [0.8, 0.012, 60]])
    x.fillStyle = `rgb(${v},${v},${v})`, x.fillRect(0, y * 256, 512, hh * 256);
  return tex(c, !1);
}
function buildShoe(parent) {
  const fr = frame(935, 286, 0.95, parent);
  fr.scale.setScalar(1);
  const R = fr.R, out = { frame: fr }, rot = 118 * Math.PI / 180, holder = new THREE.Group();
  fr.add(holder), holder.rotation.z = rot, out.holder = holder;
  const toLocal = (x, y, z = 0) => new THREE.Vector3(R(x), R(y), R(z)), leather = (dorsalV2) => mat(15527408, 0.5, 0, { map: upperTexture(dorsalV2), clearcoat: 0.3, clearcoatRoughness: 0.45, envMapIntensity: 0.55, sheen: 0.3, sheenColor: new THREE.Color(16777215), sheenRoughness: 0.6, bumpScale: 1 }), soleMat = mat(15790579, 0.42, 0, { bumpMap: soleBump(), bumpScale: 1.6, clearcoat: 0.25, envMapIntensity: 0.55 }), HW = [[-102, 4], [-98, 17], [-82, 29], [-55, 36], [-20, 34], [20, 29], [60, 28], [88, 24], [98, 14], [101, 4]], toeSpring = (x) => 9 * sm(-35, -102, x), sPts = [];
  for (let i = 0; i <= 14; i++) {
    const x = -102 + 203 * i / 14;
    sPts.push(toLocal(x, 9.5 + toeSpring(x), 0));
  }
  const sole = sweep(sPts, soleMat, { seg: 120, radial: 56, exp: 3.4, cap: !0, radius: (t) => {
    const x = -102 + 203 * t, w = lerpTab(HW, x);
    return [R(9.5), R(w)];
  } });
  holder.add(sole), shadowed(sole);
  const dorsalV = sweepGeometry(sPts.slice(0, 3), { seg: 4, radial: 4 }).frames.normals[0].y > 0 ? 0 : 0.5, YT = [[-102, 16], [-90, 24], [-70, 34], [-45, 45], [-15, 51], [20, 57], [50, 72], [75, 78], [92, 70], [101, 48]], uPts = [];
  for (let i = 0; i <= 14; i++) {
    const x = -100 + 198 * i / 14, top = lerpTab(YT, x);
    uPts.push(toLocal(x, 19 + top / 2 + toeSpring(x) * 0.5, 0));
  }
  const uMat = leather(dorsalV), upper = sweep(uPts, uMat, { seg: 160, radial: 64, exp: 2.5, cap: !0, radius: (t) => {
    const x = -100 + 198 * t, top = lerpTab(YT, x), w = lerpTab(HW, x) - 2.5, e = Math.sqrt(Math.max(0.02, 1 - Math.pow(sm(0.9, 1, Math.abs(t * 2 - 1)), 2)));
    return [R(top / 2 * e), R(w * e)];
  } });
  holder.add(upper), shadowed(upper);
  const bumper = sweep(uPts.slice(0, 5), mat(15658993, 0.38, 0, { clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.55 }), { seg: 50, radial: 48, exp: 2.5, cap: !0, radius: (t) => {
    const x = -100 + 198 * (t * 4 / 14), top = lerpTab(YT, x) * 0.4 + 8, w = lerpTab(HW, x) - 1, e = Math.sqrt(Math.max(0.03, 1 - Math.pow(1 - Math.min(1, t * 2.2), 2)));
    return [R(Math.max(4, top / 2 + 6) * e), R(w * e)];
  } });
  bumper.position.y = R(-6), bumper.scale.set(1, 0.98, 1.005), holder.add(bumper), shadowed(bumper);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(R(26), R(3.4), 20, 56), mat(13815753, 0.45, 0, { sheen: 0.4, sheenColor: new THREE.Color(16777215), clearcoat: 0.3 }));
  collar.rotation.x = Math.PI / 2, collar.position.copy(toLocal(60, 94, 0)), collar.scale.set(1.35, 1, 1), holder.add(collar), shadowed(collar);
  const inside = new THREE.Mesh(new THREE.CircleGeometry(R(22), 40), mat(2758168, 0.8));
  inside.rotation.x = -Math.PI / 2, inside.position.copy(toLocal(60, 94, 0)), inside.scale.set(1.3, 1, 1), holder.add(inside);
  const laceMat = mat(14210248, 0.62, 0, { sheen: 0.6, sheenColor: new THREE.Color(16777215), envMapIntensity: 0.3 }), eyeMat = mat(9210502, 0.35, 1);
  for (let i = 0; i < 6; i++) {
    const x = -42 + i * 11.5, top = lerpTab(YT, x) + 19 + toeSpring(x) * 0.5, w = lerpTab(HW, x) - 8, a = sweep([toLocal(x - 4, top - 18, -w), toLocal(x - 1, top + 2, -w * 0.45), toLocal(x + 1, top + 5, 0), toLocal(x - 1, top + 2, w * 0.45), toLocal(x - 4, top - 18, w)], laceMat, { seg: 24, radial: 12, exp: 3, cap: !0, radius: () => [R(2.1), R(4.6)] });
    holder.add(a), shadowed(a);
    for (const sg of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.TorusGeometry(R(2.4), R(0.9), 8, 16), eyeMat);
      e.position.copy(toLocal(x - 4, top - 18, sg * w)), e.rotation.y = Math.PI / 2, holder.add(e);
    }
  }
  const tab = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat(16052972, 0.5, 0, { sheen: 0.4, sheenColor: new THREE.Color(16777215) }));
  tab.scale.set(R(11), R(24), R(3.5)), tab.position.copy(toLocal(26, 96, 12)), tab.rotation.z = -0.5, holder.add(tab), shadowed(tab);
  const down = new THREE.Vector3(0, -1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), -rot), bx = 14, by = lerpTab(YT, 14) + 26, bz = 12, tail = (side, len, curl) => {
    const a = toLocal(bx, by, bz), dv = down.clone().multiplyScalar(R(len)), mid = a.clone().add(new THREE.Vector3(R(10 * side), R(6), R(9 * side))).addScaledVector(down, R(len * 0.35)), e = a.clone().add(dv).add(new THREE.Vector3(R(18 * side * curl), 0, R(10 * side)));
    return [a, mid, e];
  };
  for (const [s, len, c] of [[1, 62, 1], [-1, 48, 1.3]]) {
    const t = sweep(tail(s, len, c), laceMat, { seg: 26, radial: 10, exp: 3, cap: !0, radius: () => [R(1.6), R(3.4)] });
    holder.add(t), shadowed(t);
  }
  for (const s of [1, -1]) {
    const a = toLocal(bx, by, bz), loop = sweep([a, a.clone().add(new THREE.Vector3(R(8 * s), R(14), R(8))), a.clone().add(new THREE.Vector3(R(18 * s), R(12), R(10))), a.clone().add(new THREE.Vector3(R(14 * s), R(2), R(6))), a], laceMat, { seg: 30, radial: 10, exp: 3, cap: !0, radius: () => [R(1.6), R(3.2)] });
    holder.add(loop), shadowed(loop);
  }
  const clawMat = mat(14274486, 0.45, 0, { sheen: 0.5, sheenColor: new THREE.Color(16777215) }), clawsRoot = new THREE.Group();
  holder.add(clawsRoot), clawsRoot.position.copy(toLocal(-4, lerpTab(YT, -4) + 16, 18)), out.claws = [], [[-4, 9], [-2, 8], [1, 11], [3, 10]].forEach(([dx, dy], i) => {
    const dirUp = new THREE.Vector3(0, 1, 0), base = new THREE.Vector3(R(dx * 4), 0, R(i * 3 - 4)), pts = [base, base.clone().addScaledVector(dirUp, R(12)).add(new THREE.Vector3(R(-3 + i * 2), 0, R(2))), base.clone().addScaledVector(dirUp, R(26)).add(new THREE.Vector3(R(-5 + i * 3), 0, R(2 + i))), base.clone().addScaledVector(dirUp, R(36)).add(new THREE.Vector3(R(-1 + i * 5), 0, R(2 + i)))], c = sweep(pts, clawMat, { seg: 18, radial: 8, radius: (t) => [R(2 * (1 - 0.85 * t) + 0.25), R(2 * (1 - 0.85 * t) + 0.25)], cap: !0 });
    clawsRoot.add(c), shadowed(c);
  });
  const center = new THREE.Vector3(R(10), R(50), 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), rot);
  return holder.position.sub(center), out.holder = holder, out;
}
export {
  buildShoe
};
