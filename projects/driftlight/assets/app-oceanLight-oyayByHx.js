var e=`
uniform float oceanTime, oceanQuality, oceanSurfaceY;
varying vec3 vOceanWorld;
float oceanWeb(vec2 p){
  p+=vec2(sin(p.y*1.7+oceanTime*.23),sin(p.x*1.3-oceanTime*.19))*.38;
  float a=sin(p.x*2.3+sin(p.y*1.8+oceanTime*.12));
  float b=sin(p.y*2.6-sin(p.x*1.4-oceanTime*.17));
  float w=max(fwidth(a*b)*1.1,.025);
  return 1.-smoothstep(.02,.09+w,abs(a*b));
}
vec3 oceanCaustics(vec3 p,vec3 n){
  float depth=max(0.,oceanSurfaceY-p.y);
  vec2 uv=(p.xz+vec2(-.35,.31)/.87*depth)*1.65;
  float a=oceanWeb(uv);
  float b=oceanQuality>.5?oceanWeb(uv*1.73+vec2(oceanTime*.04,3.7)):.5;
  float focus=a*(.25+b*.75);
  float incident=.14+.86*max(0.,dot(n,normalize(vec3(-.35,.87,.31))));
  float beam=.18+.82*exp(-dot(p.xz-vec2(1.2,-1.6),p.xz-vec2(1.2,-1.6))*.025);
  vec3 extinction=exp(-vec3(.13,.042,.026)*depth);
  return vec3(.55,.83,.84)*focus*incident*beam*extinction;
}
`;export{e as t};