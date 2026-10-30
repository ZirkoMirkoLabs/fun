import * as THREE from "three";
import { frame, canvas, tex, rng, sweep, sweepGeometry, mat, shadowed } from "./util.js";
const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}, TAN = [204, 180, 138], BROWN = [62, 42, 28];
function hideTextures(nseg, dorsalV, { bands = !0, seed = 3, w = 1024, h = 512, darkFront = 0, smear = null } = {}) {
  const c = canvas(w, h), x = c.getContext("2d"), img = x.createImageData(w, h), d = img.data, R = rng(seed), cb = canvas(w, h), xb = cb.getContext("2d"), imb = xb.createImageData(w, h), db = imb.data, noise = new Float32Array(w * h);
  for (let i = 0; i < noise.length; i++) noise[i] = R();
  const at = (i, j) => noise[(j + h) % h * w + (i + w) % w];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const s = i / w, v = j / h, kk = s * nseg, f = kk - Math.floor(kk), dv = 0.5 + 0.5 * Math.cos(2 * Math.PI * (v - dorsalV)), dors = Math.pow(dv, 0.7);
    let dark = 0;
    bands && (dark = (1 - sm(0.36, 0.8, f)) * sm(0, 0.025, f) * (0.4 + 0.6 * dors), dark = Math.min(1, dark * (1 + 0.5 * (1 - sm(0, 0.5, s))))), dark = Math.max(dark, darkFront * (1 - sm(0, 0.35, s)) * (0.3 + 0.7 * dors)), smear && (dark = Math.max(dark, smear[2] * sm(smear[0] - 0.15, smear[0], s) * (1 - sm(smear[1] - 0.1, smear[1], s)) * Math.pow(dors, 0.55) * (0.75 + 0.25 * Math.sin(v * 31 + s * 9))));
    const lum = 1 + ((at(i, j) - 0.5) * 0.5 + (at(i >> 1 << 1, j >> 2 << 2) - 0.5) * 0.5 + (at(i, j + 1) - 0.5) * 0.3) * 0.22 - (1 - dors) * 0 + (bands ? 0 : (1 - dors) * 0), fade = 1 - 0.12 * sm(0.6, 1, f) * (bands ? 1 : 0), m = Math.min(1, dark * 0.92), idx = (j * w + i) * 4;
    d[idx] = Math.min(255, (TAN[0] * (1 - m) + BROWN[0] * m) * lum * fade), d[idx + 1] = Math.min(255, (TAN[1] * (1 - m) + BROWN[1] * m) * lum * fade), d[idx + 2] = Math.min(255, (TAN[2] * (1 - m) + BROWN[2] * m) * lum * fade), d[idx + 3] = 255;
    const hh = 128 + (at(i, j) - 0.5) * 70 + (at(i + 2, j) - 0.5) * 30 - (bands ? 60 * Math.exp(-Math.pow(f / 0.035, 2)) : 0);
    db[idx] = db[idx + 1] = db[idx + 2] = Math.max(0, Math.min(255, hh)), db[idx + 3] = 255;
  }
  return x.putImageData(img, 0, 0), xb.putImageData(imb, 0, 0), { map: tex(c, !0), bump: tex(cb, !1) };
}
function buildBodyParts(parent, world) {
  const root = new THREE.Group();
  parent.add(root);
  const g = frame(700, 215, 0.85, root), fr = g, P = fr.P, R = fr.R, up = new THREE.Vector3(0, 1, 0), A0 = [650, 208], A1 = [809, 244], NSEG = 7, prof = (t) => {
    const T = [[0, 42], [0.12, 46.5], [0.3, 48], [0.62, 41], [0.88, 26.5], [0.96, 17], [1, 7]];
    for (let i = 0; i < T.length - 1; i++) if (t <= T[i + 1][0]) {
      const u = (t - T[i][0]) / (T[i + 1][0] - T[i][0]);
      return T[i][1] + (T[i + 1][1] - T[i][1]) * (u * u * (3 - 2 * u));
    }
    return 7;
  }, hullR = (t) => {
    const kk = t * NSEG, f = kk - Math.floor(kk), bump = 1 + 0.05 * Math.pow(Math.sin(Math.PI * f), 0.55) - 0.028 * Math.exp(-Math.pow(f / 0.06, 2));
    return prof(t) * bump;
  }, abPts = [P(A0[0], A0[1], 0), P((A0[0] + A1[0]) / 2, (A0[1] + A1[1]) / 2, 0), P(A1[0], A1[1], 0)], dorsalV = sweepGeometry(abPts, { seg: 4, radial: 4 }).frames.normals[0].y > 0 ? 0 : 0.5, ht = hideTextures(NSEG, dorsalV), hide = mat(16777215, 0.62, 0, { map: ht.map, bumpMap: ht.bump, bumpScale: 1.8, sheen: 0.6, sheenColor: new THREE.Color(15127206), sheenRoughness: 0.45, envMapIntensity: 0.4 }), ab = sweep(abPts, hide, { seg: 220, radial: 64, exp: 2.1, cap: !0, radius: (t) => [R(hullR(t)), R(hullR(t) * 0.92)] });
  g.add(ab), shadowed(ab);
  const th = hideTextures(1, dorsalV, { bands: !1, seed: 9, darkFront: 0.4, smear: [0.5, 0.98, 1] }), thMat = mat(16777215, 0.7, 0, { map: th.map, bumpMap: th.bump, bumpScale: 2.2, sheen: 1, sheenColor: new THREE.Color(15325364), sheenRoughness: 0.5, envMapIntensity: 0.35 }), tPts = [P(556, 214, 0), P(625, 210, 0), P(696, 216, 0)], thorax = sweep(tPts, thMat, { seg: 80, radial: 56, exp: 2, radius: (t) => [R(56 * Math.sqrt(Math.max(0, 1 - Math.pow(2 * t - 1, 2))) + 1), R(50 * Math.sqrt(Math.max(0, 1 - Math.pow(2 * t - 1, 2))) + 1)] });
  g.add(thorax), shadowed(thorax);
  const legMat = mat(16777215, 0.66, 0, { map: th.map, bumpMap: th.bump, bumpScale: 1.4, sheen: 0.8, sheenColor: new THREE.Color(15325364), sheenRoughness: 0.5, envMapIntensity: 0.4 }), dark = mat(4928803, 0.55, 0, { bumpMap: th.bump, bumpScale: 1 }), seg = (pts, r0, r1, zoff = 0, m = legMat) => {
    const q = pts.map((p) => P(p[0], p[1], R(zoff))), mesh = sweep(q, m, { seg: 30, radial: 20, radius: (t) => [R(r0 + (r1 - r0) * t), R(r0 + (r1 - r0) * t)], exp: 2 });
    return g.add(mesh), shadowed(mesh), mesh;
  }, knuckle = (x, y, r, zoff = 0) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(R(r), 28, 20), dark);
    return s.position.copy(P(x, y, R(zoff))), g.add(s), shadowed(s), s;
  };
  seg([[694, 266], [726, 273], [756, 283]], 14.5, 15.5, 4), knuckle(758, 284, 14.5, 4), seg([[760, 285], [786, 285], [812, 279]], 14, 15, 4), seg([[690, 250], [724, 262], [752, 274]], 11, 12, -6), seg([[640, 258], [655, 278], [672, 289], [681, 296]], 8, 6.2, 12), knuckle(641, 258, 8.5, 12), seg([[610, 262], [640, 276], [662, 282]], 8.5, 7, 12), seg([[604, 268], [616, 298], [620, 330], [614, 348]], 6.6, 4.6, 10), knuckle(619, 330, 5.6, 10);
  const bristle = new THREE.MeshStandardMaterial({ color: 5915432, roughness: 0.6 }), bris = (x, y, dx, dy, zoff = 10) => {
    const len = Math.hypot(dx, dy), c = new THREE.Mesh(new THREE.ConeGeometry(R(1.3), R(len), 6), bristle);
    c.position.copy(P(x + dx / 2, y + dy / 2, R(zoff))), c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, -dy, 0).normalize()), g.add(c), shadowed(c);
  };
  for (let i = 0; i < 6; i++)
    bris(612 + i * 3.2, 340, -7 + i * 3, 14 + i % 2 * 4);
  for (let i = 0; i < 5; i++)
    bris(604 + i * 3, 298, -8 + i * 2.5, 12), bris(676 + i * 2.5, 292, -4 + i, 13);
  const sock = sweep([P(804, 279, R(5)), P(850, 270, R(6)), P(900, 259, R(6))], mat(9047067, 0.9, 0, { sheen: 1, sheenColor: new THREE.Color(13781592), sheenRoughness: 0.7, envMapIntensity: 0.2 }), {
    seg: 60,
    radial: 96,
    exp: 2,
    radius: (t) => [R(27 + 2 * t), R(25 + 2 * t)],
    ripple: (a, t) => 1 + 0.055 * Math.cos(a * 24) * sm(0, 0.05, t)
  });
  g.add(sock), shadowed(sock);
  const chrome = mat(11844284, 0.05, 1, { envMapIntensity: 1.3 }), redBall = mat(13175336, 0.1, 0, { clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.25, specularIntensity: 1, sheen: 0 }), rods = [], rod = (bx, by, tx, ty, z) => {
    const rg = frame(bx, by, z, root);
    rg.userData.top = [tx, ty];
    const m = sweep([rg.P(bx, by, 0), rg.P((bx + tx) / 2, (by + ty) / 2, 0), rg.P(tx, ty, 0)], chrome, { seg: 20, radial: 24, radius: () => [rg.R(4.8), rg.R(4.8)], cap: !0 });
    rg.add(m), shadowed(m);
    const b = new THREE.Mesh(new THREE.SphereGeometry(rg.R(26), 64, 48), redBall);
    return b.position.copy(rg.P(tx, ty, 0)), b.scale.set(1, 1.02, 1), rg.add(b), shadowed(b), rods.push(rg), rg;
  };
  return rod(596, 255, 680, 63, 0.35), rod(655, 268, 762, 62, 1.5), { group: root, rods, abdomen: ab, thorax, frame: fr };
}
function buildAntenna(parent, ptsPx, z, beads = 13, r0 = 7) {
  const base = ptsPx[0], fr = frame(base[0], base[1], z, parent), P = fr.P, R = fr.R, curve = new THREE.CatmullRomCurve3(ptsPx.map((p) => new THREE.Vector3(p[0], p[1], 0)), !1, "centripetal"), samp = (a, b, n) => Array.from({ length: n }, (_, i) => curve.getPoint(a + (b - a) * i / (n - 1))), maroon = mat(9183014, 0.32, 0, { clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 0.8, sheen: 0.3, sheenColor: new THREE.Color(13656160) }), rad = (tg) => {
    const tt = tg * beads, f = tt - Math.floor(tt), bead = Math.pow(Math.sin(Math.PI * f), 0.5), taper = 1 + 0.14 * sm(0.8, 1, tg);
    return r0 * (0.84 + 0.2 * bead) * taper;
  }, mk = (a, b, parentG, origin) => {
    const pts = samp(a, b, 14).map((p) => P(p.x, p.y, 0).sub(origin)), m = sweep(pts, maroon, { seg: 90, radial: 20, radius: (t) => {
      const rr = R(rad(a + (b - a) * t));
      return [rr, rr];
    }, cap: !0 });
    return parentG.add(m), shadowed(m), m;
  }, midP = curve.getPoint(0.46), midLocal = P(midP.x, midP.y, 0), inner = new THREE.Group();
  fr.add(inner), mk(0, 0.46, inner, new THREE.Vector3());
  const outer = new THREE.Group();
  outer.position.copy(midLocal), inner.add(outer), mk(0.46, 1, outer, midLocal);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(R(r0 * 1.05), 24, 16), maroon), e = curve.getPoint(1);
  return tip.position.copy(P(e.x, e.y, 0).sub(midLocal)), outer.add(tip), shadowed(tip), { root: fr, inner, outer };
}
export {
  buildAntenna,
  buildBodyParts
};
