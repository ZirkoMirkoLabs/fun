import * as THREE from "three";
const S = 8.84 / 896, CAMZ = 22.6, k = (z) => (CAMZ - z) / CAMZ, W = (x, y, z = 0) => new THREE.Vector3((x - 608) * S * k(z), -(y - 448) * S * k(z), z), L = (px, z = 0) => px * S * k(z);
function frame(px, py, z, parent) {
  const g = new THREE.Group(), o = W(px, py, z);
  g.position.copy(o), parent && parent.add(g);
  const sc = S * k(z);
  return g.P = (x, y, dz = 0) => new THREE.Vector3((x - px) * sc, -(y - py) * sc, dz), g.R = (v) => v * sc, g.sc = sc, g;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => (s = Math.imul(s, 1664525) + 1013904223 >>> 0, s / 4294967296);
}
function canvas(w, h) {
  const c = document.createElement("canvas");
  return c.width = w, c.height = h, c;
}
function tex(c, srgb = !0, repeat) {
  const t = new THREE.CanvasTexture(c);
  return srgb && (t.colorSpace = THREE.SRGBColorSpace), t.anisotropy = 8, t.generateMipmaps = !0, t.minFilter = THREE.LinearMipmapLinearFilter, repeat && (t.wrapS = t.wrapT = THREE.RepeatWrapping), t;
}
function shadowed(o, cast = !0, recv = !0) {
  return o.traverse((m) => {
    m.isMesh && (m.castShadow = cast, m.receiveShadow = recv);
  }), o;
}
function gridGeometry(rows, { wrapCols = !1, flip = !1, uv = !0, capStart = !1, capEnd = !1 } = {}) {
  const nr = rows.length, nc = rows[0].length, pos = [], uvs = [], idx = [];
  for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
    const p = rows[i][j];
    pos.push(p.x, p.y, p.z), uvs.push(i / (nr - 1), j / (nc - 1));
  }
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc - 1; j++) {
    const a = i * nc + j, b = (i + 1) * nc + j, c = (i + 1) * nc + j + 1, d = i * nc + j + 1;
    flip ? idx.push(a, c, b, a, d, c) : idx.push(a, b, c, a, c, d);
  }
  const addCap = (ri, rev) => {
    const ring = rows[ri], cx = new THREE.Vector3(), n = wrapCols ? nc - 1 : nc;
    for (let j = 0; j < n; j++) cx.add(ring[j]);
    cx.multiplyScalar(1 / n);
    const ci = pos.length / 3;
    pos.push(cx.x, cx.y, cx.z), uvs.push(ri ? 1 : 0, 0.5);
    for (let j = 0; j < nc - 1; j++) {
      const a = ri * nc + j, b = ri * nc + j + 1;
      rev !== flip ? idx.push(ci, a, b) : idx.push(ci, b, a);
    }
  };
  capStart && addCap(0, !0), capEnd && addCap(nr - 1, !1);
  const g = new THREE.BufferGeometry();
  if (g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)), uv && g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)), g.setIndex(idx), g.computeVertexNormals(), wrapCols) {
    const n = g.attributes.normal, v = new THREE.Vector3(), w = new THREE.Vector3();
    for (let i = 0; i < nr; i++) {
      const a = i * nc, b = i * nc + nc - 1;
      v.fromBufferAttribute(n, a), w.fromBufferAttribute(n, b), v.add(w).normalize(), n.setXYZ(a, v.x, v.y, v.z), n.setXYZ(b, v.x, v.y, v.z);
    }
  }
  return g;
}
function sweepGeometry(pts, { radius = () => [0.1, 0.1], seg = 80, radial = 24, closed = !1, exp = 2, cap = !0, tension = 0.5, type = "centripetal", twist = 0, ripple = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts, closed, type, tension), fr = { tangents: [], normals: [], binormals: [] };
  {
    let N = null;
    for (let i = 0; i <= seg; i++) {
      const T = curve.getTangent(i / seg).normalize();
      N ? N = N.clone().addScaledVector(T, -N.dot(T)).normalize() : (N = Math.abs(T.z) < 0.9 ? new THREE.Vector3(0, 0, 1).cross(T) : new THREE.Vector3(0, 1, 0).cross(T).negate(), N.normalize()), fr.tangents.push(T), fr.normals.push(N.clone()), fr.binormals.push(new THREE.Vector3().crossVectors(T, N).normalize());
    }
  }
  const build = (flip) => {
    const rows = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, p = curve.getPointAt(Math.min(t, closed ? 0.999999 : 1)), [ra, rb] = radius(t), N = fr.normals[i], B = fr.binormals[i], row = [];
      for (let j = 0; j <= radial; j++) {
        const a = j / radial * Math.PI * 2 + twist, c = Math.cos(a), s = Math.sin(a), ce = Math.sign(c) * Math.pow(Math.abs(c), 2 / exp), se = Math.sign(s) * Math.pow(Math.abs(s), 2 / exp), rp = ripple ? ripple(a, t) : 1;
        row.push(p.clone().addScaledVector(N, ce * ra * rp).addScaledVector(B, se * rb * rp));
      }
      rows.push(row);
    }
    return closed && (rows[rows.length - 1] = rows[0].map((v) => v.clone())), gridGeometry(rows, { wrapCols: !0, flip, capStart: !closed && cap, capEnd: !closed && cap });
  };
  let geo = build(!1);
  {
    const i = Math.floor(seg / 2), j = 0, vi = i * (radial + 1) + j, pc = curve.getPointAt(i / seg), pos = new THREE.Vector3().fromBufferAttribute(geo.attributes.position, vi);
    new THREE.Vector3().fromBufferAttribute(geo.attributes.normal, vi).dot(pos.sub(pc)) < 0 && (geo = build(!0));
  }
  return { geo, curve, frames: fr };
}
function sweep(pts, mat2, opts) {
  const { geo, curve } = sweepGeometry(pts, opts), m = new THREE.Mesh(geo, mat2);
  return m.curve = curve, m;
}
function latheSmooth(profile, mat2, seg = 64, samples = 60) {
  const pts = new THREE.SplineCurve(profile.map((p) => new THREE.Vector2(p[0], p[1]))).getPoints(samples).map((p) => new THREE.Vector2(Math.max(p.x, 0), p.y)), g = new THREE.LatheGeometry(pts, seg);
  return g.computeVertexNormals(), new THREE.Mesh(g, mat2);
}
const mat = (color, roughness = 0.35, metalness = 0, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness, metalness, ...extra }), _blob = (() => {
  const c = canvas(128, 128), x = c.getContext("2d"), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  return g.addColorStop(0, "rgba(0,0,0,1)"), g.addColorStop(0.45, "rgba(0,0,0,.45)"), g.addColorStop(1, "rgba(0,0,0,0)"), x.fillStyle = g, x.fillRect(0, 0, 128, 128), tex(c, !1);
})();
function contactBlob(w, h, opacity = 0.3, color = 3809792) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: _blob, transparent: !0, opacity, color, depthWrite: !1, toneMapped: !1 }));
  return m.renderOrder = 5, m.userData.blob = !0, m;
}
export {
  CAMZ,
  L,
  S,
  W,
  canvas,
  contactBlob,
  frame,
  gridGeometry,
  k,
  latheSmooth,
  mat,
  rng,
  shadowed,
  sweep,
  sweepGeometry,
  tex
};
