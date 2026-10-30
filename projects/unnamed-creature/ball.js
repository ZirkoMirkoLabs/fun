import * as THREE from "three";
import { W, L, mat } from "./util.js";
const BX = 611.5, BY = 501, BR = 132.5, BZ = 0.6, toDir = (px, py) => {
  const x = (px - BX) / BR, y = -(py - BY) / BR, z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
  return new THREE.Vector3(x, y, z).normalize();
}, SEAMS = {
  merid: [[555, 380], [520, 398], [500, 420], [497, 445], [505, 470], [514, 500], [517, 540], [520, 560], [530, 580], [548, 600], [565, 620]],
  equat: [[480, 510], [520, 521], [560, 526], [600, 527], [650, 525], [700, 520], [740, 508]],
  upper: [[505, 468], [512, 478], [530, 481], [560, 472], [600, 452], [640, 425], [690, 402], [700, 405]],
  lower: [[498, 563], [520, 557], [550, 560], [580, 578], [610, 596], [640, 607], [680, 609], [690, 607]]
};
function seamPolyline(pts) {
  const v = pts.map((p) => toDir(p[0], p[1]));
  let line = new THREE.CatmullRomCurve3(v, !1, "centripetal").getPoints(30).map((p) => p.normalize());
  const ext = (a, b) => {
    const out = [], t = a.clone().sub(b);
    t.addScaledVector(a, -t.dot(a)).normalize();
    for (let i = 1; i <= 5; i++) {
      const th = i * 0.12;
      out.push(a.clone().multiplyScalar(Math.cos(th)).addScaledVector(t, Math.sin(th)));
    }
    return out;
  }, n = line.length, head = ext(line[0], line[2]).reverse(), tail = ext(line[n - 1], line[n - 3]);
  return [...head, ...line, ...tail];
}
function bakeMaps(renderer) {
  const lines = Object.values(SEAMS).map(seamPolyline), segs = [];
  for (const l of lines) for (let i = 0; i < l.length - 1; i++) segs.push([l[i], l[i + 1]]);
  const NS = segs.length, a = new Float32Array(NS * 3), b = new Float32Array(NS * 3);
  segs.forEach((s, i) => {
    a.set([s[0].x, s[0].y, s[0].z], i * 3), b.set([s[1].x, s[1].y, s[1].z], i * 3);
  });
  const va = [], vb = [];
  for (let i = 0; i < NS; i++)
    va.push(new THREE.Vector3(a[i * 3], a[i * 3 + 1], a[i * 3 + 2])), vb.push(new THREE.Vector3(b[i * 3], b[i * 3 + 1], b[i * 3 + 2]));
  const frag = `
  precision highp float; varying vec2 vUv; uniform int uMode; uniform vec3 uA[${NS}]; uniform vec3 uB[${NS}];
  vec3 hash3(vec3 p){ p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6))); return fract(sin(p)*43758.5453123); }
  void main(){
    float phi=vUv.x*6.28318530718, th=(1.-vUv.y)*3.14159265359;
    vec3 p=vec3(-cos(phi)*sin(th),cos(th),sin(phi)*sin(th));
    // 3D worley pebbles (uniform over the sphere)
    vec3 q=p*28.; vec3 ip=floor(q); vec3 fp=fract(q);
    float d1=9., d2=9.; vec3 id1=vec3(0.);
    for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++)for(int k=-1;k<=1;k++){
      vec3 g=vec3(float(i),float(j),float(k)); vec3 o=hash3(ip+g); vec3 r=g+.18+.64*o-fp; float d=dot(r,r);
      if(d<d1){ d2=d1; d1=d; id1=ip+g; } else if(d<d2){ d2=d; }
    }
    d1=sqrt(d1); d2=sqrt(d2);
    float peb=smoothstep(.0,.2,d2-d1)*(1.-smoothstep(.15,.62,d1)*.75); // domes with thin gaps
    float pr=hash3(id1).x;
    // seams
    float dm=9.;
    for(int s=0;s<${NS};s++){ vec3 a=uA[s], b=uB[s]; vec3 ab=b-a; float t=clamp(dot(p-a,ab)/dot(ab,ab),0.,1.); dm=min(dm,length(p-(a+ab*t))); }
    float w=.03;
    float groove=1.-smoothstep(w*.7,w*1.18,dm);
    float rim=smoothstep(w*1.0,w*1.5,dm)*(1.-smoothstep(w*1.5,w*2.5,dm));
    float seamAny=1.-smoothstep(w*1.0,w*1.5,dm);
    float h=(peb*.0042)*(1.-seamAny)+rim*.004-groove*.017;
    if(uMode==0){ gl_FragColor=vec4(h,0.,0.,1.); }
    else {
      vec3 base=vec3(.93,.265,.12);
      base*=.95+.1*pr; base*=.9+.14*peb; // dark gaps between pebbles
      base=mix(base,vec3(.045,.04,.04),smoothstep(0.,.9,groove*1.1));
      gl_FragColor=vec4(pow(base,vec3(2.2)),1.);
    }
  }`, W_ = 2048, H_ = 1024, scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), shader = new THREE.ShaderMaterial({
    uniforms: { uMode: { value: 0 }, uA: { value: va }, uB: { value: vb } },
    vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }",
    fragmentShader: frag,
    depthTest: !1,
    depthWrite: !1
  }), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shader);
  scene.add(quad);
  const prev = renderer.getRenderTarget(), tm = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  const rtH = new THREE.WebGLRenderTarget(W_, H_, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, generateMipmaps: !1 });
  shader.uniforms.uMode.value = 0, renderer.setRenderTarget(rtH), renderer.render(scene, cam);
  const nrm = new THREE.ShaderMaterial({
    uniforms: { tH: { value: rtH.texture } },
    depthTest: !1,
    depthWrite: !1,
    vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }",
    fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tH;
    void main(){ vec2 e=vec2(1./${W_}.,1./${H_}.); float th=(1.-vUv.y)*3.14159265;
      float hl=texture2D(tH,vUv-vec2(e.x,0.)).r, hr=texture2D(tH,vUv+vec2(e.x,0.)).r, hd=texture2D(tH,vUv-vec2(0.,e.y)).r, hu=texture2D(tH,vUv+vec2(0.,e.y)).r;
      float dsx=2.*6.2831853/${W_}.*max(sin(th),.12), dsy=2.*3.14159265/${H_}.;
      vec3 n=normalize(vec3(-(hr-hl)/dsx,-(hu-hd)/dsy,1.)); gl_FragColor=vec4(n*.5+.5,1.); }`
  });
  quad.material = nrm;
  const rtN = new THREE.WebGLRenderTarget(W_, H_, { type: THREE.UnsignedByteType, magFilter: THREE.LinearFilter, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: !0 });
  renderer.setRenderTarget(rtN), renderer.render(scene, cam), quad.material = shader, shader.uniforms.uMode.value = 1;
  const rtC = new THREE.WebGLRenderTarget(W_, H_, { type: THREE.HalfFloatType, magFilter: THREE.LinearFilter, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: !0 });
  renderer.setRenderTarget(rtC), renderer.render(scene, cam), renderer.setRenderTarget(prev), renderer.toneMapping = tm;
  const color = rtC.texture;
  color.anisotropy = 8, rtH.dispose();
  const normal = rtN.texture;
  return normal.anisotropy = 8, { color, normal };
}
function buildBall(scene, world) {
  const { color, normal } = bakeMaps(world.renderer), g = new THREE.Group(), base = W(BX, BY, BZ);
  g.position.copy(base), scene.add(g);
  const r = L(BR, BZ), m = mat(16777215, 0.5, 0, { map: color, normalMap: normal, normalScale: new THREE.Vector2(0.75, 0.75), envMapIntensity: 0.5, sheen: 0.3, sheenColor: new THREE.Color(16747104), sheenRoughness: 0.6, specularIntensity: 0.6 }), mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128), m);
  return mesh.scale.setScalar(r), mesh.castShadow = mesh.receiveShadow = !0, g.add(mesh), g.userData.r = r, {
    group: g,
    radius: r,
    update(time, dt, snip, age) {
      const hop = age > 0.12 && age < 0.9 ? Math.sin((age - 0.12) / 0.78 * Math.PI) : 0;
      g.position.set(base.x, base.y + Math.sin(time * 2.1) * 0.018 + hop * 0.28 * Math.exp(-(age - 0.12) * 1.4), base.z), g.rotation.z = Math.sin(time * 1.2) * 0.022 + hop * 0.05, g.rotation.x = Math.sin(time * 0.9 + 1) * 0.012;
    },
    impulse() {
    }
  };
}
export {
  buildBall
};
