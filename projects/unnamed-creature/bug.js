import * as THREE from "three";
import { buildEye } from "./eye.js";
import { buildBodyParts, buildAntenna } from "./body.js";
import { buildPlant } from "./plant.js";
import { buildShoe } from "./shoe.js";
class Spring {
  constructor(k, c, x = 0) {
    this.k = k, this.c = c, this.x = x, this.v = 0;
  }
  step(dt, force = 0) {
    const n = Math.max(1, Math.ceil(dt / 4e-3)), h = dt / n;
    for (let i = 0; i < n; i++)
      this.v += (-this.k * this.x - this.c * this.v + force) * h, this.x += this.v * h;
    return this.x;
  }
}
function buildBug(scene, world) {
  const bug = new THREE.Group();
  scene.add(bug);
  const body = buildBodyParts(bug, world), plant = buildPlant(bug), shoe = buildShoe(bug), eye = buildEye(bug, world), antL = buildAntenna(bug, [[490, 154], [476, 131], [440, 101], [396, 84], [361, 83]], 1.75, 11, 8.6), antR = buildAntenna(bug, [[532, 158], [531, 129], [512, 91], [486, 69], [467, 66]], 1.75, 10, 8.6), ants = [{ a: antL, s1: new Spring(70, 3.2), s2: new Spring(95, 2.4), sign: 1, ph: 0 }, { a: antR, s1: new Spring(64, 3), s2: new Spring(88, 2.2), sign: -1, ph: 2 }], leafS = plant.leaves.map(() => new Spring(45 + Math.random() * 20, 2.2)), sprigS = new Spring(32, 2.4), flapY = new Spring(70, 4.2), flapR = new Spring(55, 3.5), shoeS = new Spring(40, 2.6), rodS = body.rods.map((r, i) => new Spring(50 + i * 8, 2.6)), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), zAxis = new THREE.Vector3(0, 0, 1), xAxis = new THREE.Vector3(1, 0, 0), yAxis = new THREE.Vector3(0, 1, 0);
  let prevY = 0, prevVy = 0, gx = 0, gy = 0, nextBlink = 3, blink = 0, dil = 0, nextDil = 5;
  const gz = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  function update(time, dt, { mx, my, age }) {
    const bob = Math.sin(time * 1.4) * 0.05, fy = flapY.step(dt), fr = flapR.step(dt), y = bob + fy * 0.12;
    bug.position.y = y, bug.rotation.z = Math.sin(time * 0.9) * 6e-3 + fr * 0.05;
    const vy = dt > 0 ? (y - prevY) / dt : 0, acc = dt > 0 ? (vy - prevVy) / dt : 0;
    prevY = y, prevVy = vy;
    const accC = THREE.MathUtils.clamp(acc, -40, 40);
    for (const A of ants) {
      const drive = -accC * 0.09 * A.sign * -1 + Math.sin(time * 1.9 + A.ph) * 1.2 + fr * 9, a1 = A.s1.step(dt, drive * 4), a2 = A.s2.step(dt, drive * 4 + a1 * -20);
      A.a.inner.rotation.z = a1 * 0.5, A.a.outer.rotation.z = a2 * 0.6;
    }
    const sd = -accC * 0.11 + Math.sin(time * 1.1) * 0.6 + fr * 6, sa = sprigS.step(dt, sd * 3);
    plant.sprig.rotation.z = sa * 0.5, plant.leaves.forEach((lg, i) => {
      const la = leafS[i].step(dt, (sd + Math.sin(time * 1.7 + i * 1.3) * 1.1) * 4);
      tmpQ.setFromAxisAngle(zAxis, la * 0.7), lg.quaternion.copy(lg.userData.q0).premultiply(tmpQ);
    }), body.rods.forEach((r, i) => {
      const ra = rodS[i].step(dt, -accC * 0.05 + fr * 3 + Math.sin(time * 1.3 + i) * 0.3);
      r.rotation.z = ra * 0.4;
    });
    const sh = shoeS.step(dt, fr * 5 - accC * 0.05);
    shoe.holder.rotation.z = 118 * Math.PI / 180 + sh * 0.12;
    const tx = THREE.MathUtils.clamp(mx, -1, 1) * 0.5 - 0, ty = THREE.MathUtils.clamp(my, -1, 1) * 0.35;
    gx += (tx - gx) * Math.min(1, dt * 7), gy += (ty - gy) * Math.min(1, dt * 7), qa.setFromAxisAngle(yAxis, gx * 0.55), qb.setFromAxisAngle(xAxis, gy * 0.55), eye.gaze.quaternion.copy(qa).multiply(qb).multiply(eye.gaze.userData.base), time > nextBlink && (blink = 1, nextBlink = time + 3 + Math.random() * 4), time > nextDil && (dil = 1, nextDil = time + 4 + Math.random() * 6), blink = Math.max(0, blink - dt * 6.5), dil = Math.max(0, dil - dt * 0.45);
    const bl = Math.sin(blink * Math.PI), ps = 1 + 0.1 * Math.sin(time * 0.65) + 0.32 * dil * Math.min(1, dil * 3) - 0.14 * bl;
    eye.pupil.scale.set(ps, 1, ps), eye.group.scale.set(0.965 * (1 + 0.02 * bl), 1.035 * (1 - 0.09 * bl), 1);
  }
  const base = { x: bug.position.x };
  return {
    group: bug,
    eye,
    update,
    impulse(v) {
      flapY.v += 2.2 * v, flapR.v += 3.2 * v, sprigS.v += 5 * v, shoeS.v += 3 * v, ants.forEach((A) => {
        A.s1.v += 4 * v * A.sign, A.s2.v += 5 * v;
      });
    },
    pose() {
    }
  };
}
export {
  buildBug
};
