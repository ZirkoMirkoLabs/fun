import * as THREE from "three";
import { W, L, sweep, mat, shadowed } from "./util.js";
function buildBracket(scene, world) {
  const g = new THREE.Group();
  scene.add(g);
  const chrome = mat(11844284, 0.05, 1, { envMapIntensity: 1.3 }), grey = mat(10132630, 0.32, 0.9, { envMapIntensity: 0.9 }), black = mat(789516, 0.4, 0.2), Z = 1.2, r = L(10.5, Z), P = (x, y, z = Z) => W(x, y, z), tube = (pts, radius = r, opts = {}) => {
    const m = sweep(pts, chrome, { seg: 90, radial: 28, radius: () => [radius, radius], ...opts });
    return g.add(m), shadowed(m), m;
  };
  tube([P(562, 306, Z - 0.3), P(540, 321, Z - 0.1), P(516, 338), P(500, 354), P(494, 366)], r, { cap: !0 }), tube([P(494, 366), P(540, 366), P(600, 368), P(636, 366), P(664, 353), P(685, 326), P(696, 298), P(695, 281), P(684, 272), P(662, 271), P(650, 276, Z - 0.2)], r, { cap: !0, tension: 0.5 });
  const collar = (x0, x1, y, rad) => {
    const len = L(x1 - x0, Z), cg = new THREE.CylinderGeometry(L(rad, Z), L(rad, Z), len, 48, 1, !1), m = new THREE.Mesh(cg, grey);
    m.rotation.z = Math.PI / 2, m.position.copy(P((x0 + x1) / 2, y)), g.add(m), shadowed(m);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(L(rad, Z), L(2.4, Z), 14, 48), grey);
    rim.rotation.y = Math.PI / 2, rim.position.copy(P(x1, y)), g.add(rim), shadowed(rim);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(L(rad - 5, Z), 40), black);
    hole.rotation.y = Math.PI / 2, hole.position.copy(P(x1 + 0.5, y)), g.add(hole);
  };
  collar(482, 508, 368, 17), collar(566, 600, 372, 16);
  const tj = new THREE.Mesh(new THREE.CylinderGeometry(L(11, Z), L(11, Z), L(34, Z), 32), chrome);
  tj.position.copy(P(535, 368)), g.add(tj), shadowed(tj);
  const rod = sweep([P(535, 376, Z + 0.1), P(531, 420, Z + 0.55), P(527, 468, Z + 0.8)], chrome, { seg: 30, radial: 28, radius: () => [L(9.5, Z), L(9.5, Z)], cap: !0 });
  g.add(rod), shadowed(rod);
  const sock = new THREE.Mesh(new THREE.CylinderGeometry(L(10.5, Z), L(10.5, Z), L(18, Z), 28), grey);
  sock.position.copy(P(534, 392, Z + 0.3)), sock.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), P(527, 468, Z + 0.8).sub(P(535, 376, Z + 0.1)).normalize()), g.add(sock), shadowed(sock);
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(L(5, Z), L(5, Z), L(10, Z), 6), chrome);
  return bolt.rotation.x = Math.PI / 2, bolt.position.copy(P(520, 372, Z + 0.2)), g.add(bolt), { group: g };
}
export {
  buildBracket
};
