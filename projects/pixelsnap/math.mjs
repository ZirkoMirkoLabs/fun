// Dependency-free numerical primitives for the Python PixelSnap port.
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const round = (v, n=0) => { const p=10**n, x=v*p, f=Math.floor(x); return (x-f===.5 ? f+(f%2) : Math.round(x))/p; };
export const sum = a => a.reduce((s,v)=>s+v,0);
export function gaussian(a,sigma,f32=false) {
  const r=Math.floor(4*sigma+.5), k=Array.from({length:2*r+1},(_,i)=>Math.exp(-.5*((i-r)/sigma)**2)), total=sum(k), n=a.length;
  const out=new Float64Array(n);
  for(let i=0;i<n;i++){ let s=0; for(let j=-r;j<=r;j++){ let q=i+j; while(q<0||q>=n) q=q<0?-q-1:2*n-q-1; s+=a[q]*k[j+r]/total; } out[i]=f32?Math.fround(s):s; } return out;
}
export function highpass(a) { const g=gaussian(a,32); return Float64Array.from(a,(v,i)=>(v-g[i])*(.5-.5*Math.cos(2*Math.PI*i/(a.length-1)))); }
export function coefficient(p,cell,phase=0) { let re=0,im=0; for(let i=0;i<p.length;i++){ const t=-2*Math.PI*(i+1-phase)/cell; re+=p[i]*Math.cos(t); im+=p[i]*Math.sin(t); } return [re,im]; }
export const magnitude = z => Math.hypot(...z);
export function phase(p,c) { const z=coefficient(p,c); let v=mod(-Math.atan2(z[1],z[0])*c/(2*Math.PI),c); if(v>c/2)v-=c; return Math.abs(v)<.1?0:v; }
export const mod=(x,n)=>(x%n+n)%n;
export function spectrum(p,n) {
 const re=new Float64Array(n), im=new Float64Array(n); re.set(p);
 for(let i=1,j=0;i<n;i++){ let b=n>>1; for(;j&b;b>>=1)j^=b; j^=b; if(i<j){const t=re[i];re[i]=re[j];re[j]=t;} }
 for(let len=2;len<=n;len*=2){const angle=-2*Math.PI/len,wr=Math.cos(angle),wi=Math.sin(angle); for(let i=0;i<n;i+=len){let ur=1,ui=0;for(let j=0;j<len/2;j++){const a=i+j,b=a+len/2,tr=re[b]*ur-im[b]*ui,ti=re[b]*ui+im[b]*ur;re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;const t=ur;ur=t*wr-ui*wi;ui=t*wi+ui*wr;}} }
 return Float64Array.from(re.subarray(0,n/2+1),(v,i)=>Math.hypot(v,im[i]));
}
export function maximize(fn,a,b){const g=(Math.sqrt(5)-1)/2;let c=b-g*(b-a),d=a+g*(b-a),fc=fn(c),fd=fn(d);for(let i=0;i<55&&b-a>1e-7;i++){if(fc>fd){b=d;d=c;fd=fc;c=b-g*(b-a);fc=fn(c);}else{a=c;c=d;fc=fd;d=a+g*(b-a);fd=fn(d);}}return (a+b)/2;}
export function candidates(profile){const p=Float64Array.from(profile),n=p.length;if(n<12||Math.max(...p)<.05)return [[],p];const high=highpass(p),N=2**Math.ceil(Math.log2(n*16)),a=spectrum(high,N),valid=i=>i/N>=1/Math.min(64,n/4)&&i/N<=.5,ids=[];
 for(let i=1;i<a.length-1;i++)if(valid(i)&&a[i]>(valid(i-1)?a[i-1]:0)&&a[i]>=(valid(i+1)?a[i+1]:0))ids.push(i);
 if(valid(a.length-1)&&a.at(-1)>a.at(-2))ids.push(a.length-1);
 ids.sort((i,j)=>a[j]-a[i]);const denom=Math.max(sum(high.map(Math.abs)),1e-9);
 return [ids.slice(0,24).map(i=>{const c=N/i,half=Math.max(.003,c*c/n/5),s=maximize(v=>magnitude(coefficient(high,v)),Math.max(2,c-half),Math.min(64,c+half));return [s,magnitude(coefficient(high,s))/denom];}).sort((a,b)=>b[1]-a[1]),high];
}
export function lab(rgb){const c=Array.from(rgb,v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});const l=Math.cbrt(.4122214708*c[0]+.5363325363*c[1]+.0514459929*c[2]),m=Math.cbrt(.2119034982*c[0]+.6806995451*c[1]+.1073969566*c[2]),s=Math.cbrt(.0883024619*c[0]+.2817188376*c[1]+.6299787005*c[2]);return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];}
export function rgb(v){const l=(v[0]+.3963377774*v[1]+.2158037573*v[2])**3,m=(v[0]-.1055613458*v[1]-.0638541728*v[2])**3,s=(v[0]-.0894841775*v[1]-1.291485548*v[2])**3;return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s].map(c=>{c=clamp(c,0,1);return round(255*(c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055));});}
export const distance=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
export function nearest(p,cs){let best=Infinity,id=0;for(let j=0;j<cs.length;j++){const d=distance(p,cs[j]);if(d<best){best=d;id=j;}}return [id,best];}
