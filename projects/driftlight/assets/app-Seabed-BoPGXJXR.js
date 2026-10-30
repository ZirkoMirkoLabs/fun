import{n as e}from"/fun/projects/driftlight/assets/rolldown-runtime-WkwZ5CU-.js";import{n as t,t as n}from"/fun/projects/driftlight/assets/vendor/react-19.3.1/react-19.3.1-CHvf5MSy.js";import{C as r,Ct as i,G as a,H as o,Kn as s,Mt as c,P as l,Tt as u,X as d,Z as f,_t as p,ft as m,hn as h,m as g,ot as _,qn as v,rt as y,s as b,wn as x,z as S}from"/fun/projects/driftlight/assets/vendor/three-0.186.1/three-0.186.1-D8ARWj-B.js";import{r as C}from"/fun/projects/driftlight/assets/vendor/react-three-fiber-9.8.2/react-three-fiber-9.8.2-DEYGw83e.js";import{n as w}from"/fun/projects/driftlight/assets/app-WorldDepth-ClqrqfuS.js";import{i as T}from"/fun/projects/driftlight/assets/vendor/three-0.186.1/three-0.186.1-BzThZzQM.js";var E=e(t(),1),D=n(),O=-2.2,k=Math.PI*2,A=new v(0,1,0);function j(e=7193){return()=>{e|=0,e=e+1831565813|0;let t=Math.imul(e^e>>>15,1|e);return t=t+Math.imul(t^t>>>7,61|t)^t,((t^t>>>14)>>>0)/4294967296}}function M(e,t){let n=.075*Math.sin(e*.48+t*.39)+.047*Math.sin(t*.92-e*.19+Math.sin(e*.37))+.024*Math.cos(e*1.17+t*.62),r=.19*Math.exp(-(((t+11+Math.sin(e*.32)*2.1)/2.5)**2))+.16*Math.exp(-(((t+21-Math.sin(e*.27)*2)/3.8)**2)),i=Math.exp(-((e-1.55)**2+(t+1.6)**2)/.8),a=.68*Math.exp(-e*e/1.5);return O-w(e,t)+(n+r)*(1-Math.max(i,a))}function N(e,t,n=0){return Math.abs(e)>1.28+n&&Math.hypot(e-1.55,t+1.6)>1.12+n}var P=24,F=3;function I(){let e=new i(P,P,32,32);return e.rotateX(-Math.PI/2),e}function L(e,t,n){let r=e.geometry.attributes.position;for(let i=0;i<r.count;i++){let a=i%33,o=Math.floor(i/33),s=t*P+(a/32-.5)*P,c=n*P+(o/32-.5)*P;r.setXYZ(i,s,M(s,c),c),e.geometry.attributes.uv.setXY(i,(s+25)/50,(c+28)/36)}r.needsUpdate=!0,e.geometry.attributes.uv.needsUpdate=!0,e.geometry.computeVertexNormals(),e.geometry.computeBoundingSphere(),e.userData.tile=[t,n]}function R(e=!1){let t=new Uint8Array(262144),n=j(e?92:41);for(let r=0;r<256;r++)for(let i=0;i<256;i++){let a=i/256*k,o=r/256*k,s=n(),c=n(),l=Math.sin(a*3+Math.sin(o*2)*2)*Math.sin(o*5+Math.cos(a*4)),u=Math.abs(Math.sin(a*5+o*3+Math.sin(o*4)))**24,d=e?124+l*48-u*25+s*26:121+(s-.5)*65+(c>.985?38:0),f=(r*256+i)*4;t[f]=d,t[f+1]=e?210+s*44:221+s*33,t[f+2]=175+s*65,t[f+3]=255}let i=new r(t,256,256,c);return i.wrapS=i.wrapT=h,i.magFilter=d,i.minFilter=f,i.generateMipmaps=!0,i.anisotropy=4,i.repeat.set(e?2:48,e?2:35),i.needsUpdate=!0,i}function z(e){let{data:t,width:n}=e.image,i=new Uint8Array(n*n*4);for(let e=0;e<n;e++)for(let r=0;r<n;r++){let a=(i,a)=>t[((e+a+n)%n*n+(r+i+n)%n)*4]/255,o=(a(-1,0)-a(1,0))*.85,s=(a(0,-1)-a(0,1))*.85,c=1/Math.sqrt(o*o+s*s+1),l=(e*n+r)*4;i[l]=(o*c*.5+.5)*255,i[l+1]=(s*c*.5+.5)*255,i[l+2]=(c*.5+.5)*255,i[l+3]=255}let a=new r(i,n,n,c);return a.wrapS=a.wrapT=h,a.magFilter=d,a.minFilter=f,a.generateMipmaps=!0,a.anisotropy=4,a.repeat.copy(e.repeat),a.needsUpdate=!0,a}var B=`
varying vec3 vSeabedPosition;
uniform float seabedTime;
uniform float uExplore, uOceanLift;
vec3 seabedBump(vec3 surfacePosition, vec3 surfaceNormal, float height) {
  vec3 dx = dFdx(surfacePosition), dy = dFdy(surfacePosition);
  vec3 r1 = cross(dy, surfaceNormal), r2 = cross(surfaceNormal, dx);
  float determinant = dot(dx, r1);
  vec3 gradient = sign(determinant) * (dFdx(height) * r1 + dFdy(height) * r2);
  return normalize(abs(determinant) * surfaceNormal - gradient);
}
vec2 seabedHash(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
float seabedCaustic(vec2 p) {
  float t = seabedTime * .19;
  p += vec2(sin(p.y * .71 + t), cos(p.x * .63 - t)) * .32;
  vec2 cell = floor(p), f = fract(p);
  float first = 8., second = 8.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 offset = vec2(float(x), float(y));
    vec2 h = seabedHash(cell + offset);
    vec2 site = .5 + .37 * sin(t + 6.2831853 * h);
    vec2 d = offset + site - f;
    float distance2 = dot(d, d);
    if (distance2 < first) { second = first; first = distance2; }
    else { second = min(second, distance2); }
  }
  float edge = second - first;
  float width = max(fwidth(edge) * 1.1, .018);
  return (1. - smoothstep(.012, .052 + width, edge))
    * (.68 + .32 * sin(p.x * 1.13 + p.y * .9 + t));
}
`;function V(e,t,n=`stone`){let r=new m(t);return r.name=`Seabed / ${n}`,r.onBeforeCompile=t=>{t.uniforms.uExplore=e.uExplore,t.uniforms.uOceanLift=e.uOceanLift,t.uniforms.seabedTime=e?.uTime||{value:0},t.vertexShader=`varying vec3 vSeabedPosition;
uniform float seabedTime;
`+t.vertexShader;let r=``;n===`grass`&&(r=`
      float phase = 0.;
      #ifdef USE_INSTANCING
        phase = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z;
      #endif
      float bend = max(position.y, 0.);
      transformed.x += sin(seabedTime * .57 + phase + bend * 1.9) * bend * bend * .11;
      transformed.z += cos(seabedTime * .43 + phase) * bend * bend * .055;
    `),t.vertexShader=t.vertexShader.replace(`#include <begin_vertex>`,`
      #include <begin_vertex>
      ${r}
      vSeabedPosition = transformed;
      #ifdef USE_INSTANCING
        vSeabedPosition = (instanceMatrix * vec4(transformed, 1.)).xyz;
      #endif
    `),t.fragmentShader=B+t.fragmentShader,t.fragmentShader=t.fragmentShader.replace(`#include <color_fragment>`,`
      #include <color_fragment>
      float mineral = sin(vSeabedPosition.x * 1.31 + sin(vSeabedPosition.z * .73))
        * cos(vSeabedPosition.z * 1.47 - vSeabedPosition.x * .37);
      diffuseColor.rgb *= .94 + mineral * .055;
    `),n===`sand`&&(t.fragmentShader=t.fragmentShader.replace(`#include <normal_fragment_maps>`,`
        #include <normal_fragment_maps>
        vec2 bed = vSeabedPosition.xz;
        float flow = bed.y + bed.x * .31 + sin(bed.x * .83) * .075 + sin(bed.y * .43) * .14;
        float ripple = sin(flow * 28. + sin(bed.x * 1.8) * .45);
        float fineRipple = sin(flow * 56. + .7) * .18;
        float rippleResolution = 1. - smoothstep(.045, .17, fwidth(flow));
        float rippleHeight = (ripple + fineRipple) * .0034 * rippleResolution;
        normal = seabedBump(-vViewPosition, normal, rippleHeight);
        diffuseColor.rgb *= .97 + ripple * .022 * rippleResolution;
      `)),t.fragmentShader=t.fragmentShader.replace(`#include <opaque_fragment>`,`
      // Shared world lighting supplies caustics on sand, rocks and animals.
      outgoingLight *= mix(vec3(1.), vec3(.29, .64, .69), 1. - exp(-max(0., -vSeabedPosition.z) * .026));
      float bedHaze = 1. - exp(-max(0., -vSeabedPosition.z - 5.) * .035);
      outgoingLight = mix(outgoingLight, vec3(.007, .025, .032), bedHaze);
      {
        vec2 p=vSeabedPosition.xz;
        float pools=exp(-dot(p-vec2(.2,-1.5),p-vec2(.2,-1.5))*.12)
          +exp(-dot(p-vec2(-7.5,-13.3),p-vec2(-7.5,-13.3))*.12)
          +exp(-dot(p-vec2(7.5,-20.5),p-vec2(7.5,-20.5))*.13);
        float distanceHaze=1.-exp(-max(0.,length(vViewPosition)-3.)*.04);
        outgoingLight*=.25+uOceanLift*.13+min(1.,pools)*.44;
        outgoingLight=mix(outgoingLight,mix(vec3(.003,.017,.022),vec3(.009,.032,.038),uOceanLift),distanceHaze*.55);
      }
      ${n===`stone`?`float rim=pow(1.-abs(dot(normal,normalize(vViewPosition))),3.); outgoingLight+=vec3(.012,.030,.033)*(.42+.38*max(0.,normal.y)+rim*.25);`:``}
      #include <opaque_fragment>
    `)},r.customProgramCacheKey=()=>`seabed-v10-${n}`,r}function H(e){let t=new o(1,e===4?1:3),n=t.attributes.position,r=[],i=new g,a=new g(`#77877b`),s=new g(`#c6c4ac`);for(let t=0;t<n.count;t++){let o=n.getX(t),c=n.getY(t),l=n.getZ(t),u=Math.sin(o*6.2+l*4.3+e*3)*Math.cos(c*6.4-l*3.1),d=Math.sin(o*13+c*11)*Math.sin(l*15-o*7),f=1+u*.13+d*.035;n.setXYZ(t,o*f+c*.09,c*f*.77,l*f),i.copy(a).lerp(s,y.clamp(.52+c*.24+u*.18,0,1)),r.push(i.r,i.g,i.b)}t.setAttribute(`color`,new l(r,3)),t.deleteAttribute(`normal`);let c=T(t,1e-4);return c.computeVertexNormals(),c.computeBoundingSphere(),t.dispose(),c}function U(e,t,n,r,i){let o=new a(t,n,r.length),s=new p,c=new g;return r.forEach((e,t)=>{s.position.set(e.x,e.y??M(e.x,e.z),e.z),s.rotation.set(e.rx||0,e.ry||0,e.rz||0),s.scale.set(...e.scale||[1,1,1]),s.updateMatrix(),o.setMatrixAt(t,s.matrix),e.color&&o.setColorAt(t,c.set(e.color))}),o.name=i,o.instanceMatrix.needsUpdate=!0,o.instanceColor&&(o.instanceColor.needsUpdate=!0),o.computeBoundingSphere(),o.receiveShadow=!0,e.add(o),o}function W(){let e=[],t=[],n=[],r=[],i=new g;for(let a=0;a<=13;a++)for(let o=0;o<=40;o++){let s=a/13,c=(o/40-.5)*2.7,l=Math.cos(c*17),u=1+.022*l*s*s;if(e.push(Math.sin(c)*s*u,.22*Math.sin(s*Math.PI*.84)+l*.017*s,Math.cos(c)*s*u),i.set(`#d3c7ac`).lerp(new g(`#927c66`),.2+.2*Math.sin(s*16)+.1*l),t.push(i.r,i.g,i.b),r.push(o/40,s),a<13&&o<40){let e=a*41+o;n.push(e,e+40+1,e+1,e+1,e+40+1,e+40+2)}}let a=new b;return a.setAttribute(`position`,new l(e,3)),a.setAttribute(`color`,new l(t,3)),a.setAttribute(`uv`,new l(r,2)),a.setIndex(n),a.computeVertexNormals(),a}function G(){let e=[],t=[],n=[],r=[],i=j(765),a=new g;for(let o=0;o<=9;o++)for(let s=0;s<=100;s++){let c=s/100*k,l=o/9,u=l*(.35+.65*(.5+.5*Math.cos(c*5))**2.7),d=.07*(.5+.5*Math.cos(c*5))*Math.sin(l*Math.PI);if(e.push(Math.cos(c)*u,.09*(1-l*l)+d,Math.sin(c)*u),a.set(i()>.82?`#c8ad78`:`#9c764c`).multiplyScalar(.8+i()*.3),t.push(a.r,a.g,a.b),r.push(s/100,l),o<9&&s<100){let e=o*101+s;n.push(e,e+1,e+100+1,e+1,e+100+2,e+100+1)}}let o=new b;return o.setAttribute(`position`,new l(e,3)),o.setAttribute(`color`,new l(t,3)),o.setAttribute(`uv`,new l(r,2)),o.setIndex(n),o.computeVertexNormals(),o}function K(){let e=j(618),t=[],n=[],r=[],i=new g;for(let a=0;a<13;a++){let a=e()*k,o=.26+e()*.5,s=.08+e()*.19,c=(e()-.5)*.2,l=(e()-.5)*.2,u=t.length/3;for(let e=0;e<=7;e++){let d=e/7,f=(.008+Math.sin(Math.PI*d)*.014)*(1-d*.94),p=c+Math.cos(a)*s*d*d,m=l+Math.sin(a)*s*d*d;for(let e=-1;e<=1;e++)t.push(p+Math.cos(a+Math.PI/2)*f*e,d*o-Math.abs(e)*f*.38,m+Math.sin(a+Math.PI/2)*f*e),i.set(`#385348`).lerp(new g(`#81967b`),d*.77),n.push(i.r,i.g,i.b);if(e<7)for(let t=0;t<2;t++){let n=u+e*3+t;r.push(n,n+3,n+1,n+1,n+3,n+4)}}}let a=new b;return a.setAttribute(`position`,new l(t,3)),a.setAttribute(`color`,new l(n,3)),a.setIndex(r),a.computeVertexNormals(),a.computeBoundingSphere(),a.boundingSphere.radius+=.15,a}function q(){let e=j(940),t=[],n=[],r=[],i=new v,a=new v,o=new v,s=new g;function c(c,l,u,d){i.copy(l).sub(c).normalize(),a.crossVectors(i,Math.abs(i.y)>.95?new v(1,0,0):A).normalize(),o.crossVectors(i,a).normalize();let f=t.length/3;for(let n=0;n<2;n++)for(let i=0;i<6;i++){let f=i/6*k,p=n?d:u,m=n?l:c;t.push(m.x+(a.x*Math.cos(f)+o.x*Math.sin(f))*p,m.y+(a.y*Math.cos(f)+o.y*Math.sin(f))*p,m.z+(a.z*Math.cos(f)+o.z*Math.sin(f))*p),s.set(`#a68b68`).multiplyScalar(.79+e()*.28),r.push(s.r,s.g,s.b)}for(let e=0;e<6;e++){let t=(e+1)%6;n.push(f+e,f+t,f+e+6,f+t,f+t+6,f+e+6)}}let u=Array.from({length:6},()=>[]);function d(t,n,r,i){let a=t.clone().add(new v(Math.sin(n)*r*.48,Math.cos(n)*r*.52,(e()-.5)*.045)),o=t.clone().add(new v(Math.sin(n)*r,Math.cos(n)*r,(e()-.5)*.07)),s=.0028+.0024*i;if(c(t,a,s,s*.86),c(a,o,s*.86,s*.69),u[i].push(o),i>0){let t=.25+e()*.17;d(o,n-t,r*(.68+e()*.06),i-1),d(o,n+t,r*(.68+e()*.06),i-1)}}d(new v,0,.31,5),u.slice(0,4).forEach(t=>{t.sort((e,t)=>e.x-t.x);for(let n=1;n<t.length;n++)e()>.46&&t[n].distanceTo(t[n-1])<.24&&c(t[n-1],t[n],.0025,.002)});let f=new b;return f.setAttribute(`position`,new l(t,3)),f.setAttribute(`color`,new l(r,3)),f.setIndex(n),f.computeVertexNormals(),f}function J(e){let t=j(803),n=[],r=[];for(let e=0;e<150;e++)n.push((t()-.5)*17,-2.1300000000000003+t()**2*1.8,3-t()*19),r.push(t());let i=new b;i.setAttribute(`position`,new l(n,3)),i.setAttribute(`seabedSeed`,new l(r,1));let a=new x({transparent:!0,depthWrite:!1,blending:1,vertexShader:`
      uniform float uTime;
      attribute float seabedSeed;
      varying float vSeed;
      varying float vDepth;
      void main() {
        vSeed = seabedSeed;
        vec3 p = position;
        p.x += sin(uTime * .065 + seabedSeed * 31.) * .22;
        p.y += sin(uTime * .13 + seabedSeed * 53.) * .045;
        p.z += cos(uTime * .043 + seabedSeed * 17.) * .19;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((11. + seabedSeed * 9.) / max(1., -mv.z), .7, 2.2);
      }
    `,fragmentShader:`
      varying float vSeed;
      varying float vDepth;
      void main() {
        float r = length(gl_PointCoord - .5);
        float alpha = (1. - smoothstep(.12, .49, r)) * .18 * exp(-vDepth * .035);
        gl_FragColor = vec4(mix(vec3(.35, .44, .40), vec3(.66, .67, .53), vSeed), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `});a.uniforms={...e,uTime:e?.uTime||{value:0}};let o=new u(i,a);return o.name=`Sparse suspended sediment`,o.frustumCulled=!1,o}function Y(e){let t=new S;t.name=`Vitreous / sculpted sandy seabed`;let n=j(2048),r=R(),i=R(!0),o=z(r),c=V(e,{color:`#b5ac8f`,roughness:.96,metalness:0,normalMap:o,normalScale:new s(.55,.55),roughnessMap:r,envMapIntensity:.18},`sand`),l=[];for(let e=-3;e<=F;e++)for(let n=-3;n<=F;n++){let r=new _(I(),c);r.name=`Continuous dunes / streamed tile`,r.receiveShadow=!0,L(r,n,e),t.add(r),l.push(r)}t.userData.tiles=l;let u=V(e,{color:`#435d5a`,vertexColors:!0,roughness:.94,metalness:0,bumpMap:i,bumpScale:.045,roughnessMap:i,envMapIntensity:.24}),d=[[],[]];[[-3.7,-4.8,1.05],[4.7,-6.2,1.15],[-5.8,-9.8,1.35],[7.6,-13.5,1.5],[-9.2,-17,1.5],[11.5,-21,1.55],[-13,-27,1.2],[-4,-31,1],[-14,-38,1.5],[-3,-39,1.5],[-14,-45,1.8],[-3,-47,1.9],[-14,-54,2],[-3,-56,1.6],[-3.7,1.4,.45],[4.2,.3,.42],[-2.6,-2.6,.35]].forEach(([e,t,r],i)=>{for(let a=0;a<6;a++){let o=n()*k,s=a?n()*r*1.4:0,c=e+Math.cos(o)*s,l=t+Math.sin(o)*s,u=r*(a?.24+n()*.4:.66);if(!N(c,l,u*.75))continue;let f=u*(.53+n()*.45);i!==5&&d[i%2].push({x:c,z:l,y:M(c,l)+f*.33,scale:[u*(1.05+n()*.55),f,u*(.75+n()*.7)],rx:(n()-.5)*.45,ry:n()*k,rz:(n()-.5)*.3,color:i>3?`#889d96`:`#bab8a2`})}}),t.userData.colliders=d.flat().map(e=>({type:`ellipsoid`,center:[e.x,e.y,e.z],radii:[e.scale[0]*1.13,e.scale[1]*.9,e.scale[2]*1.13],tag:`reef rock`})),d.forEach((e,n)=>U(t,H(n),u,e,`Weathered reef outcrops ${n+1}`));let f=[],m=[],h=[];for(let e=0;e<180;e++){let e=(n()-.5)*23,t=5-n()*28;if(!N(e,t,.08))continue;let r=.018+n()**2*.095;f.push({x:e,z:t,y:M(e,t)+r*.2,scale:[r*1.3,r*.54,r],ry:n()*k,color:n()>.45?`#9d9d87`:`#707f76`})}U(t,H(4),u,f,`Scattered rounded gravel`);for(let e=0;e<110;e++){let e=(n()-.5)*24,t=3-n()*60;if(!N(e,t,.12))continue;let r=.055+n()*.085;m.push({x:e,z:t,y:M(e,t)+.008,scale:[r,r,r],ry:n()*k,rx:(n()-.5)*.2,color:n()>.5?`#e0d2b8`:`#acb4aa`})}let g=V(e,{color:`#eee5cc`,vertexColors:!0,roughness:.6,metalness:0,side:2,envMapIntensity:.3},`shell`);U(t,W(),g,m,`Ribbed scallop shells`);let v=V(e,{color:`#c9ad83`,vertexColors:!0,roughness:.91,metalness:0,bumpMap:i,bumpScale:.009,envMapIntensity:.16},`starfish`);U(t,G(),v,[{x:-1.85,z:.55,scale:[.19,.24,.19],ry:.6},{x:3.15,z:-2.9,scale:[.16,.2,.16],ry:2.5},{x:-3.1,z:-5.2,scale:[.2,.2,.2],ry:1.8},{x:4.65,z:1.3,scale:[.15,.18,.15],ry:.3}],`Small ochre sea stars`),[[-2.8,-3.5],[3.5,-5],[-4.7,-7.3],[5.8,-10.5],[-3.7,.8],[4.4,.3],[-7,-14],[8.5,-18]].forEach(([e,t])=>{for(let r=0;r<9;r++){let r=e+(n()-.5)*1.7,i=t+(n()-.5)*1.4;if(!N(r,i,.25))continue;let a=.43+n()*.51;h.push({x:r,z:i,y:M(r,i)-.018,scale:[a,a,a],ry:n()*k,color:n()>.5?`#a0b39a`:`#789b90`})}});let y=V(e,{color:`#b7c2a5`,vertexColors:!0,roughness:.88,metalness:0,side:2,envMapIntensity:.25},`grass`);U(t,K(),y,h,`Low ribbon seagrass patches`);let b=V(e,{color:`#b6a48d`,vertexColors:!0,roughness:.93,metalness:0,envMapIntensity:.2},`fan`);U(t,q(),b,[{x:-3.1,z:-4.5,scale:[.9,.96,.9],ry:-.3,rz:.11},{x:4.3,z:-6,scale:[1.15,1.25,1],ry:.35,rz:-.13},{x:-6.3,z:-9.9,scale:[1.1,1.28,1],ry:-.25},{x:7.1,z:-13,scale:[1.3,1.4,1],ry:.3},{x:-4.1,z:1.25,scale:[.53,.59,.53],ry:-.7,rz:-.12}],`Sparse branching gorgonian sea fans`);let x=new a(H(4),u,225);x.name=`Streamed outer seabed pebbles`;let C=new a(K(),y,100);return C.name=`Streamed outer seabed life`,x.frustumCulled=C.frustumCulled=!1,t.add(x,C),t.userData.streamProps={stones:x,grass:C,dummy:new p},t.add(J(e)),t.userData.seabed={floorY:O,bounds:{x:[-25,25],z:[-28,8]},drawCalls:t.children.length,lighting:`Parent HemisphereLight, DirectionalLight and PMREM; no local lights.`,textures:[r,i,o]},t}function X(e){let t=new Set,n=new Set;e.traverse(e=>{e.geometry&&t.add(e.geometry),e.material&&n.add(e.material),e.isInstancedMesh&&e.dispose()}),t.forEach(e=>e.dispose()),n.forEach(e=>e.dispose()),e.userData.seabed.textures.forEach(e=>e.dispose())}function Z({U:e,st:t}){let n=(0,E.useMemo)(()=>Y(e),[e]);return(0,E.useEffect)(()=>()=>X(n),[n]),C(({camera:e})=>{let t=n.parent?.position||{x:0,z:0},r=Math.round((e.position.x-t.x)/P),i=Math.round((e.position.z-t.z)/P);if(n.userData.cx===r&&n.userData.cz===i)return;n.userData.cx=r,n.userData.cz=i;let a=[];for(let e=i-F;e<=i+F;e++)for(let t=r-F;t<=r+F;t++)a.push([t,e]);let o=a.filter(([e,t])=>!n.userData.tiles.some(n=>n.userData.tile[0]===e&&n.userData.tile[1]===t));n.userData.tiles.filter(e=>!a.some(([t,n])=>e.userData.tile[0]===t&&e.userData.tile[1]===n)).forEach((e,t)=>L(e,...o[t]));let{stones:s,grass:c,dummy:l}=n.userData.streamProps,u=0,d=0,f=(e,t)=>{let n=Math.sin(e*127.1+t*311.7)*43758.5453;return n-Math.floor(n)};for(let e=-7;e<=7;e++)for(let t=-7;t<=7;t++){let n=r*3+t,a=i*3+e,o=n*8+(f(n,a)-.5)*4,p=a*8+(f(a,n)-.5)*4;if(o>-20&&o<20&&p>-80&&p<10)continue;let m=.06+f(n+3,a)*.12;l.position.set(o,M(o,p)-.025,p),l.rotation.set(0,f(n,a)*6.28,0),l.scale.set(m*1.8,m*.65,m),l.updateMatrix(),s.setMatrixAt(u++,l.matrix),d<100&&f(n-7,a)>.55&&(l.position.x+=.35,l.scale.setScalar(.35+f(n,a)*.5),l.updateMatrix(),c.setMatrixAt(d++,l.matrix))}s.count=u,c.count=d,s.instanceMatrix.needsUpdate=c.instanceMatrix.needsUpdate=!0},.57),(0,D.jsx)(`primitive`,{object:n})}export{Z as t};