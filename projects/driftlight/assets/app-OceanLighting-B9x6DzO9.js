import{n as e}from"/fun/projects/driftlight/assets/rolldown-runtime-WkwZ5CU-.js";import{n as t}from"/fun/projects/driftlight/assets/vendor/react-19.3.1/react-19.3.1-CHvf5MSy.js";import{i as n,r}from"/fun/projects/driftlight/assets/vendor/react-three-fiber-9.8.2/react-three-fiber-9.8.2-BeFjkAv-.js";import{t as i}from"/fun/projects/driftlight/assets/app-oceanLight-oyayByHx.js";var a=e(t(),1);function o({U:e}){let{scene:t}=n(),o=(0,a.useMemo)(()=>({oceanTime:e.uTime,oceanQuality:{value:1},oceanSurfaceY:{value:4.6}}),[e]);return(0,a.useEffect)(()=>{let e=[];return t.traverse(t=>{for(let n of Array.isArray(t.material)?t.material:[t.material]){if(!n?.isMeshStandardMaterial||n.userData.oceanLight)continue;let t=n.onBeforeCompile,r=n.customProgramCacheKey.bind(n),a=r();n.userData.oceanLight=!0,n.onBeforeCompile=(e,r)=>{t.call(n,e,r),Object.assign(e.uniforms,o),e.vertexShader=`varying vec3 vOceanWorld;
`+e.vertexShader,e.vertexShader=e.vertexShader.replace(`#include <project_vertex>`,`#include <project_vertex>
          vec4 oceanP=vec4(transformed,1.);
          #ifdef USE_INSTANCING
          oceanP=instanceMatrix*oceanP;
          #endif
          vOceanWorld=(modelMatrix*oceanP).xyz;`),e.fragmentShader=i+e.fragmentShader,e.fragmentShader=e.fragmentShader.replace(`#include <opaque_fragment>`,`
          vec3 oceanN=inverseTransformDirection(normal,viewMatrix);
          vec3 causticLight=oceanCaustics(vOceanWorld,oceanN);
          outgoingLight+=diffuseColor.rgb*causticLight*.38;
          float path=length(vViewPosition);
          outgoingLight*=exp(-vec3(.027,.009,.004)*path);
          #include <opaque_fragment>`)},n.customProgramCacheKey=()=>a+`-ocean-caustics-v15`,n.needsUpdate=!0,e.push([n,t,r])}}),()=>{for(let[t,n,r]of e)t.onBeforeCompile=n,t.customProgramCacheKey=r,delete t.userData.oceanLight,t.needsUpdate=!0}},[t,o]),r(({size:e})=>{o.oceanQuality.value=e.width<600?0:1,o.oceanSurfaceY.value=4.6+(t.getObjectByName(`Underwater world`)?.position.y||0)},.58),null}export{o as t};