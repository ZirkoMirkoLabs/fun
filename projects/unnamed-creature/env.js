import * as THREE from "three";
const IRIS_N = [-0.42, 0.34, 0.84];
function makeWindowEnv(renderer) {
  const sc = new THREE.Scene();
  sc.background = new THREE.Color(0);
  const ang = (deg) => 40 * Math.tan(deg * Math.PI / 360), n1 = new THREE.Vector3(...IRIS_N).normalize().clone().add(new THREE.Vector3(-0.05, 0.07, 0)).normalize(), V = new THREE.Vector3(0.057, -0.113, 0.99).normalize(), dir = n1.clone().multiplyScalar(2 * n1.dot(V)).sub(V).normalize();
  for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ang(3), ang(3)), new THREE.MeshBasicMaterial({ color: new THREE.Color(260, 260, 250), side: THREE.DoubleSide })), up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(up, dir).normalize(), u2 = new THREE.Vector3().crossVectors(dir, right).normalize();
    m.position.copy(dir).multiplyScalar(20).addScaledVector(right, ox * ang(1.8)).addScaledVector(u2, oy * ang(1.8)), m.lookAt(0, 0, 0), sc.add(m);
  }
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(sc, 0, 0.1, 100);
  return pm.dispose(), rt.texture;
}
function makeEnv(renderer) {
  const sc = new THREE.Scene(), dome = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: !1,
    vertexShader: "varying vec3 d; void main(){ d=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: `varying vec3 d; void main(){
      vec3 dark=vec3(.045,.045,.05);
      vec3 yellow=vec3(1.0,.9,.62)*1.25;
      float f=smoothstep(-.28,-.62,d.y);
      vec3 c=mix(dark,yellow,f);
      // faint warm-grey room wash toward top so rounded plastics keep some fill
      c+=vec3(.16,.16,.17)*smoothstep(.1,.9,d.y);
      gl_FragColor=vec4(c,1.);}`
  }));
  sc.add(dome);
  const panel = (dir, w, h, rgb, rollDeg = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb), side: THREE.DoubleSide })), d = new THREE.Vector3(...dir).normalize();
    m.position.copy(d).multiplyScalar(20), m.lookAt(0, 0, 0), m.rotateZ(rollDeg * Math.PI / 180), sc.add(m);
  }, ang = (deg) => 40 * Math.tan(deg * Math.PI / 360);
  panel([-0.55, 0.5, 0.67], ang(44), ang(40), [9, 9, 8.6], 10), panel([-0.42, 0.1, 0.9], ang(9), ang(46), [6, 6, 5.8]), panel([0.82, 0.18, 0.54], ang(16), ang(70), [6, 6, 6]), panel([0.05, 0.9, 0.35], ang(70), ang(12), [4, 4, 4]), panel([0.05, -0.05, 1], ang(52), ang(34), [0, 0, 0]), panel([0.5, 0.35, 0.8], ang(18), ang(24), [0, 0, 0]);
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(sc, 0.012, 0.1, 100);
  return pm.dispose(), rt.texture;
}
export {
  IRIS_N,
  makeEnv,
  makeWindowEnv
};
