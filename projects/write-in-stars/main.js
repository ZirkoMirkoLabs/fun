import * as THREE from 'three/webgpu';
import {
	uniform, instanceIndex, hash, uint, float, vec3, vec4, uv, mix, step, clamp, cos, sin, floor, pow, sqrt,
	length, exp, varying, smoothstep, attribute, TWO_PI,
} from 'three/tsl';
import { generate, palettes } from './gen.js';

const MAX_STARS = 70000;
const CLIP_SEC = 6;
const MAX_LEN = 28;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ---------- uniforms ----------
// The galaxy is pure TSL from instanceIndex. A "formation" (text or image) is a per-star target attribute;
// stars blend galaxy <-> formation, and swirl from the previous formation to the next one.

const NUM = ['arms', 'spin', 'radius', 'conc', 'thick', 'scatter', 'chaos', 'coreFrac', 'coreR', 'coreFlat',
	'barFrac', 'barLen', 'ringFrac', 'ringR', 'ringW', 'satFrac', 'satX', 'satZ', 'satR', 'count', 'size', 'accFrac', 'glow'];
const COL = ['inside', 'outside', 'accent'];
const U = {};
for (const k of NUM) U[k] = uniform(0);
for (const k of COL) U[k] = uniform(new THREE.Color());
const uTime = uniform(0), uBlend = uniform(0), uRetarget = uniform(1), uFormScale = uniform(1);
const uRayO = uniform(new THREE.Vector3(0, 0, 50)), uRayD = uniform(new THREE.Vector3(0, 0, -1)), uPush = uniform(0);
const uShockO = uniform(new THREE.Vector3()), uShockAge = uniform(99);

const prevPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STARS * 3), 3);
const prevCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STARS * 3).fill(1), 3);
const targetPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STARS * 3), 3);
const targetCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STARS * 3).fill(1), 3);
for (const a of [prevPos, prevCol, targetPos, targetCol]) a.setUsage(THREE.DynamicDrawUsage);

// ---------- galaxy ----------

const r = (k) => hash(instanceIndex.add(uint(k * 100003)));
const r0 = r(0), r1 = r(1), r2 = r(2), r6 = r(6);
const su = r(3).mul(2).sub(1), sphi = r(4).mul(TWO_PI), ss = sqrt(float(1).sub(su.mul(su)));
const sdir = vec3(ss.mul(cos(sphi)), su, ss.mul(sin(sphi)));
const blob = pow(r(5), 2.2);

const core = sdir.mul(blob.mul(U.coreR)).mul(vec3(1, U.coreFlat, 1));
const rad = pow(r1, U.conc).mul(U.radius).add(U.barLen.mul(.85));
const branch = floor(r2.mul(U.arms)).mul(TWO_PI.div(U.arms));
const ang = mix(branch.add(rad.mul(U.spin)), r(8).mul(TWO_PI), U.chaos);
const off = vec3(r(3), r(4), r(5)).mul(2).sub(1).pow3().mul(vec3(1, U.thick, 1)).mul(U.scatter).mul(rad.mul(.45).add(.3));
const disk = vec3(cos(ang).mul(rad), 0, sin(ang).mul(rad)).add(off);
const bar = vec3(r1.mul(2).sub(1).mul(U.barLen), r(4).sub(.5).mul(.12), r(3).sub(.5).mul(U.barLen.mul(.28)));
const ra = r1.mul(TWO_PI), rr = U.ringR.add(r2.sub(.5).mul(U.ringW));
const ring = vec3(cos(ra).mul(rr), r(4).sub(.5).mul(.15), sin(ra).mul(rr)).add(off.mul(.25));
const sat = vec3(U.satX, 0, U.satZ).add(sdir.mul(blob.mul(U.satR)).mul(vec3(1, .7, 1)));

const t1 = U.coreFrac, t2 = t1.add(U.barFrac), t3 = t2.add(U.ringFrac), t4 = float(1).sub(U.satFrac);
const wCore = float(1).sub(step(t1, r0));
const wBar = step(t1, r0).mul(float(1).sub(step(t2, r0)));
const wRing = step(t2, r0).mul(float(1).sub(step(t3, r0)));
const wSat = step(t4, r0);
const wDisk = clamp(float(1).sub(wCore).sub(wBar).sub(wRing).sub(wSat), 0, 1);
const galaxyPos = core.mul(wCore).add(bar.mul(wBar)).add(ring.mul(wRing)).add(sat.mul(wSat)).add(disk.mul(wDisk));

const tR = clamp(length(galaxyPos.xz).div(U.radius.add(U.barLen)), 0, 1);
let galaxyCol = mix(U.inside, U.outside, pow(tR, .7));
galaxyCol = mix(galaxyCol, mix(U.inside, vec3(1), .25), wCore);
galaxyCol = mix(galaxyCol, mix(U.accent, U.outside, .35), wRing);
galaxyCol = mix(galaxyCol, mix(U.inside, U.outside, .4), wSat);
galaxyCol = mix(galaxyCol, U.accent, step(r(7), U.accFrac).mul(wDisk.add(wRing)));

// ---------- formation + transitions ----------

const PI = float(Math.PI);
const rt = uRetarget, rtBump = sin(rt.mul(PI));
const between = mix(attribute('prevPos', 'vec3'), attribute('targetPos', 'vec3'), rt);
const swirl = vec3(between.y.negate(), between.x, 0).mul(rtBump.mul(r(9).sub(.5).mul(1.1)))
	.add(vec3(0, 0, rtBump.mul(r(10).sub(.5).mul(5))));
const sway = vec3(0, 0, sin(uTime.mul(.5).add(r6.mul(20))).mul(.07));
const formPos = between.add(swirl).add(sway);
const formCol = mix(attribute('prevCol', 'vec3'), attribute('targetCol', 'vec3'), rt);

const be = uBlend, beBump = sin(be.mul(PI));
const p0 = mix(galaxyPos, formPos, be).add(vec3(0, 0, beBump.mul(r(11).sub(.5).mul(4))));

// pointer: push stars away from the ray under the cursor (ray is given in the stars' local space)
const toStar = p0.sub(uRayO);
const closest = uRayO.add(uRayD.mul(toStar.dot(uRayD)));
const away = p0.sub(closest), awayLen = length(away).max(1e-4);
const pushR = float(1.15).mul(uFormScale.mul(be).add(float(1).sub(be)));
const pushFall = exp(awayLen.mul(awayLen).div(pushR.mul(pushR)).negate()).mul(uPush);
const p1 = p0.add(away.div(awayLen).mul(pushFall.mul(pushR).mul(1.1)));

// tap: an expanding shockwave ring
const fromShock = p1.sub(uShockO), shockLen = length(fromShock).max(1e-4);
const front = shockLen.sub(uShockAge.mul(uFormScale.mul(be).add(float(1).sub(be)).mul(8)));
const wave = exp(front.mul(front).div(-.9)).mul(exp(uShockAge.mul(-1.4)));
const p2 = p1.add(fromShock.div(shockLen).mul(wave.mul(1.5))).add(vec3(0, 0, wave.mul(r(12).sub(.3)).mul(2.5)));

const twinkle = float(.82).add(sin(uTime.mul(1.7).add(r6.mul(60))).mul(.18));
const bright = mix(float(.55), float(1.5), pow(r6, 5));
const dimCore = mix(float(1), float(.55), wCore.add(wBar));
const flash = float(1).add(wave.mul(1.8)).add(pushFall.mul(.7));
const baseCol = mix(galaxyCol.mul(dimCore), mix(galaxyCol, formCol, .85).mul(.62), be);
const vCol = varying(baseCol.mul(bright).mul(twinkle).mul(flash));

const visible = float(1).sub(step(U.count, float(instanceIndex)));
const spriteAlpha = float(.1).div(uv().sub(.5).length()).sub(.2).max(0);

const starMat = new THREE.SpriteNodeMaterial({ depthWrite: false, blending: THREE.AdditiveBlending });
starMat.positionNode = p2;
starMat.scaleNode = U.size.mul(mix(float(.6), float(1.8), pow(r6, 4))).mul(mix(float(1), float(.7), wCore.mul(float(1).sub(be))))
	.mul(mix(float(1), uFormScale, be)).mul(visible);
starMat.colorNode = vec4(vCol, spriteAlpha);
const stars = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), starMat, MAX_STARS);
stars.geometry.setAttribute('prevPos', prevPos);
stars.geometry.setAttribute('prevCol', prevCol);
stars.geometry.setAttribute('targetPos', targetPos);
stars.geometry.setAttribute('targetCol', targetCol);
stars.frustumCulled = false;

const glowMat = new THREE.SpriteNodeMaterial({ depthWrite: false, transparent: true, blending: THREE.AdditiveBlending });
glowMat.colorNode = vec4(U.inside.mul(U.glow).mul(float(1).sub(be)), pow(smoothstep(.5, 0, uv().sub(.5).length()), 2.6).mul(.4));
const glow = new THREE.Sprite(glowMat);

const b = (k) => hash(instanceIndex.add(uint(9000000 + k * 7919)));
const bu = b(0).mul(2).sub(1), bphi = b(1).mul(TWO_PI), bs = sqrt(float(1).sub(bu.mul(bu)));
const bgMat = new THREE.SpriteNodeMaterial({ depthWrite: false, blending: THREE.AdditiveBlending });
bgMat.positionNode = vec3(bs.mul(cos(bphi)), bu, bs.mul(sin(bphi))).mul(80);
bgMat.scaleNode = mix(float(.1), float(.4), pow(b(2), 6));
bgMat.colorNode = vec4(vec3(.96, .96, .93).mul(mix(float(.25), float(.9), pow(b(3), 3))), spriteAlpha);
const bgStars = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), bgMat, 2600);
bgStars.frustumCulled = false;

// ---------- scene ----------

const scene = new THREE.Scene();
const tilt = new THREE.Group(), spin = new THREE.Group();
spin.add(stars, glow); tilt.add(spin); scene.add(tilt, bgStars);
const camera = new THREE.PerspectiveCamera(42, 1, .05, 300);
const canvas = $('sky');
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: false });
renderer.setClearColor(0x000000, 1);

const TAN = Math.tan(THREE.MathUtils.degToRad(21));
const GALAXY_DIR = new THREE.Vector3(0, 6.5, 11).normalize();

// The free area between the header and the bottom controls, measured from the DOM.
const free = { top: 0, bottom: 1, frac: 1 };
function measureFree() {
	const top = document.querySelector('.top .brand').getBoundingClientRect().bottom + 12;
	const bottom = document.querySelector('.bottom').getBoundingClientRect().top - 12;
	free.top = top; free.bottom = Math.max(top + 80, bottom);
	free.frac = (free.bottom - free.top) / innerHeight;
}
function frameView(w, h) {
	measureFree();
	camera.aspect = w / h;
	camera.setViewOffset(w, h, 0, h / 2 - (free.top + free.bottom) / 2, w, h);
	camera.updateProjectionMatrix();
}
function fitScreen() {
	renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
	renderer.setSize(innerWidth, innerHeight, false);
	frameView(innerWidth, innerHeight);
}

// ---------- state ----------

let seed = 'zm', natural = generate(seed), cur = { ...natural.p }, tgt = { ...natural.p };
const curCol = Object.fromEntries(COL.map(k => [k, new THREE.Color(natural.palette[k])]));
const tgtCol = Object.fromEntries(COL.map(k => [k, new THREE.Color(natural.palette[k])]));
let formation = null;          // { positions, colors, w, h, kind, label }
let formed = false;            // user wants the formation shown (vs. galaxy)
let blendLin = 0, retargetLin = 1, spinAngle = 0, zoom = 1, writtenText = '';
let pointer = { x: 0, y: 0, active: 0, last: -1e9 }, push = 0, parallax = new THREE.Vector2();
const specs = {
	arms: ['Arms', 1, 8, 1], spin: ['Twist', 0, 2.5, .01], scatter: ['Spread', 0, 1, .01],
	count: ['Stars', 5000, 70000, 1000], size: ['Star size', .015, .09, .001], rot: ['Rotation', -.2, .2, .005],
};
let remix = { palette: -1, params: {}, pause: reduceMotion };

const palette = () => palettes[remix.palette] ?? natural.palette;
function applyLook() {
	tgt = { ...natural.p, ...remix.params };
	for (const k of COL) tgtCol[k].set(palette()[k]);
	syncControls();
}
function setSeed(s) {
	seed = s || 'zm';
	natural = generate(seed);
	applyLook();
}

// ---------- sampling text / images into star targets ----------

const EMOJI = /\p{Extended_Pictographic}/u;
const fontStack = (px) => `400 ${px}px "Instrument Serif", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", serif`;

function balancedLines(words, n) {
	const total = words.join(' ').length, lines = [];
	let line = [];
	for (const w of words) {
		const len = [...line, w].join(' ').length;
		if (line.length && len > total / n * 1.08 && lines.length < n - 1) { lines.push(line.join(' ')); line = [w]; }
		else line.push(w);
	}
	lines.push(line.join(' '));
	return lines;
}

function textCanvas(text, { arrow = false } = {}) {
	const px = 220, lh = px * .98, pad = 40, arrowH = arrow ? px * 1.05 : 0;
	const m = document.createElement('canvas').getContext('2d');
	m.font = fontStack(px);
	const words = text.trim().split(/\s+/);
	const area = innerWidth / Math.max(1, free.bottom - free.top) * (arrow ? 1.6 : 1);
	let best = null;
	for (let n = 1; n <= Math.min(3, words.length); n++) {
		const lines = balancedLines(words, n);
		const w = Math.max(...lines.map(l => m.measureText(l).width)), h = lines.length * lh;
		const score = Math.abs(Math.log((w / h) / area));
		if (!best || score < best.score) best = { lines, w, score };
	}
	const c = document.createElement('canvas');
	c.width = Math.ceil(best.w + pad * 2); c.height = Math.ceil(best.lines.length * lh + pad * 2 + arrowH);
	const ctx = c.getContext('2d');
	ctx.font = fontStack(px); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
	const p = palette(), g = ctx.createLinearGradient(0, 0, c.width, c.height);
	g.addColorStop(0, p.inside); g.addColorStop(.55, p.accent); g.addColorStop(1, p.inside);
	ctx.fillStyle = g;
	best.lines.forEach((l, i) => ctx.fillText(l, c.width / 2, pad + lh * (i + .5) + px * .04));
	if (arrow) {
		// an arrow drawn in stars, pointing down at the input
		const x = c.width / 2, y0 = pad + best.lines.length * lh + px * .14, y1 = c.height - pad * .6;
		ctx.strokeStyle = g; ctx.lineWidth = px * .085; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
		ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
		ctx.beginPath(); ctx.moveTo(x - px * .26, y1 - px * .27); ctx.lineTo(x, y1); ctx.lineTo(x + px * .26, y1 - px * .27); ctx.stroke();
	}
	return c;
}

// Average colour of the border, if the border is one solid colour (a logo on white, a sticker on a flat bg).
function solidBackground(px, w, h) {
	const edge = [];
	const add = (x, y) => { const j = (y * w + x) * 4; if (px[j + 3] > 200) edge.push([px[j], px[j + 1], px[j + 2]]); };
	for (let x = 0; x < w; x += 2) { add(x, 0); add(x, h - 1); }
	for (let y = 0; y < h; y += 2) { add(0, y); add(w - 1, y); }
	if (edge.length < 20) return null;
	const m = [0, 1, 2].map(k => edge.reduce((a, e) => a + e[k], 0) / edge.length);
	const close = edge.filter(e => Math.hypot(e[0] - m[0], e[1] - m[1], e[2] - m[2]) < 38).length;
	return close / edge.length > .8 ? m : null;
}

function sample(c, byAlpha) {
	const { width: w, height: h } = c, px = c.getContext('2d').getImageData(0, 0, w, h).data;
	const bg = byAlpha ? null : solidBackground(px, w, h);
	const bgLum = bg ? (bg[0] * .2126 + bg[1] * .7152 + bg[2] * .0722) / 255 : 0;
	const idx = [], cum = [];
	let total = 0;
	for (let i = 0; i < w * h; i++) {
		const j = i * 4, a = px[j + 3] / 255;
		const lum = (px[j] * .2126 + px[j + 1] * .7152 + px[j + 2] * .0722) / 255;
		let wgt;
		if (byAlpha) wgt = a;
		else if (bg) {
			// distance from the background colour decides where stars go, so dark-on-light works too
			const d = Math.hypot(px[j] - bg[0], px[j + 1] - bg[1], px[j + 2] - bg[2]) / 255;
			wgt = a * Math.min(1, Math.max(0, (d - .12) / .35));
		} else wgt = a * Math.pow(lum, .65);
		if (wgt < .03) continue;
		total += wgt; idx.push(i); cum.push(total);
	}
	if (!total) throw new Error('empty');
	const k = Math.min(12 / w, 7 / h);
	const positions = new Float32Array(MAX_STARS * 3), colors = new Float32Array(MAX_STARS * 3), col = new THREE.Color();
	let s = 71937;
	const rand = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
	for (let i = 0; i < MAX_STARS; i++) {
		const pick = rand() * total;
		let lo = 0, hi = cum.length - 1;
		while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < pick) lo = mid + 1; else hi = mid; }
		const p = idx[lo], j = p * 4, n = i * 3;
		positions[n] = (p % w - w / 2 + rand()) * k;
		positions[n + 1] = (h / 2 - Math.floor(p / w) + rand()) * k;
		positions[n + 2] = (rand() - .5) * .4;
		col.setRGB(px[j] / 255, px[j + 1] / 255, px[j + 2] / 255, THREE.SRGBColorSpace);
		if (!byAlpha) {
			// additive stars on black: lift dark colours so dark ink still shows
			const l = col.r * .2126 + col.g * .7152 + col.b * .0722, floor = bg && bgLum > .5 ? .5 : .16;
			if (l < floor) { if (l < .02) col.setRGB(floor, floor, floor * .96); else col.multiplyScalar(floor / l); }
		}
		col.toArray(colors, n);
	}
	return { positions, colors, w: w * k, h: h * k };
}

function setFormation(f) {
	// freeze where stars are now, then swirl them to the new targets
	const e = uRetarget.value;
	for (let i = 0; i < prevPos.array.length; i++) {
		prevPos.array[i] += (targetPos.array[i] - prevPos.array[i]) * e;
		prevCol.array[i] += (targetCol.array[i] - prevCol.array[i]) * e;
	}
	if (!formation || blendLin < .02) { prevPos.array.set(f.positions); prevCol.array.set(f.colors); }
	targetPos.array.set(f.positions); targetCol.array.set(f.colors);
	for (const a of [prevPos, prevCol, targetPos, targetCol]) a.needsUpdate = true;
	retargetLin = reduceMotion ? 1 : 0; uRetarget.value = retargetLin;
	formation = f; formed = true;
	syncToggle();
}

async function writeIntro() {
	writtenText = '';
	await document.fonts.load(fontStack(220), 'write anything');
	if (writtenText) return;
	setSeed('write anything');
	const f = sample(textCanvas('write anything', { arrow: true }), true);
	f.kind = 'intro'; f.label = 'write anything';
	setFormation(f);
	updateLinks();
}

async function writeText(raw, { instant = false } = {}) {
	const text = [...raw.trim()].slice(0, MAX_LEN).join('');
	writtenText = text;
	if (!text) { await writeIntro(); hint('Type anything, or tap the image button to use a picture'); return; }
	await document.fonts.load(fontStack(220), text);
	if (text !== writtenText) return;
	setSeed(text.toLowerCase());
	const f = sample(textCanvas(text), true);
	f.kind = 'text'; f.label = text;
	setFormation(f);
	if (instant) blendLin = 1;
	updateLinks();
	hint(EMOJI.test(text) ? 'Emoji keep their own colours' : 'Tap for a shockwave · drag through the stars');
}

async function writeImage(source, label, { quiet = false } = {}) {
	let bmp;
	try {
		bmp = await createImageBitmap(source);
		const c = document.createElement('canvas'), ratio = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
		c.width = Math.max(1, Math.round(bmp.width * ratio)); c.height = Math.max(1, Math.round(bmp.height * ratio));
		c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
		const f = sample(c, false);
		f.kind = 'image'; f.label = label;
		if (!quiet) { writtenText = ''; $('text').value = ''; setSeed('image:' + label); }
		setFormation(f);
		updateLinks();
		if (!quiet) hint('Your image stays on this device. Clips and images include it; links don’t.');
	} catch {
		hint('Couldn’t find bright pixels in that image. Try a logo, a PNG, or something with contrast.');
	} finally { bmp?.close?.(); }
}

async function loadFile(file) {
	if (!file) return;
	if (!file.type.startsWith('image/')) return hint('That isn’t an image file.');
	if (file.size > 40 * 1024 * 1024) return hint('Pick an image under 40 MB.');
	hint('Reading your image locally…');
	await writeImage(file, file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'image');
}

// ---------- UI ----------

const hint = (t) => { $('hint').textContent = t; };
const shareURL = () => {
	const q = new URLSearchParams();
	if (formation?.kind === 'text' && formed) q.set('t', formation.label);
	if (remix.palette !== -1 || Object.keys(remix.params).length) q.set('r', JSON.stringify({ v: 1, palette: remix.palette, params: remix.params }));
	const s = q.toString();
	return `${location.origin}${location.pathname}${s ? '?' + s : ''}`;
};
const postText = () => formed && formation?.kind === 'text'
	? `i wrote “${formation.label}” in ${Math.round(cur.count).toLocaleString('en-US')} stars ✨\n\ntype anything, a @Zirkomirko experiment`
	: formation?.kind === 'image'
		? `turned this into a galaxy of ${Math.round(cur.count).toLocaleString('en-US')} stars ✨\n\ntype anything, a @Zirkomirko experiment`
		: `a galaxy that writes whatever you type ✨\n\na @Zirkomirko experiment`;
const postURL = () => `https://x.com/intent/post?text=${encodeURIComponent(postText())}&url=${encodeURIComponent(shareURL())}`;

function updateLinks() {
	$('post').href = postURL();
	history.replaceState(null, '', shareURL());
	document.title = formed && formation?.kind === 'text' ? `“${formation.label}” · Write in Stars` : 'Write in Stars · ZirkoMirko';
}
function syncToggle() {
	const t = $('toggle');
	t.disabled = !formation;
	t.textContent = formed ? 'Scatter' : 'Gather';
	t.setAttribute('aria-pressed', String(!formed));
}

let typing = 0;
$('text').addEventListener('input', (e) => {
	clearTimeout(typing);
	typing = setTimeout(() => writeText(e.target.value), 380);
});
$('form').addEventListener('submit', (e) => {
	e.preventDefault();
	clearTimeout(typing);
	writeText($('text').value);
	if (matchMedia('(pointer: coarse)').matches) $('text').blur();
});
$('toggle').addEventListener('click', () => { if (!formation) return; formed = !formed; syncToggle(); updateLinks(); });

const IDEAS = ['gm', 'hello world', 'wagmi', '✨', 'lfg', 'ZM', 'send it', '🚀 to the moon', '404', 'good vibes', '🐸', 'ship it', '∞', 'touch grass', '☕ first', 'AI', 'i love you', 'π', 'no sleep', 'make it weird'];
let ideaIx = Math.floor(Math.random() * IDEAS.length);
$('random').addEventListener('click', () => {
	ideaIx = (ideaIx + 1 + Math.floor(Math.random() * 3)) % IDEAS.length;
	$('text').value = IDEAS[ideaIx];
	writeText(IDEAS[ideaIx]);
});

$('imageBtn').addEventListener('click', () => $('imageFile').click());
$('imageFile').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
let dragDepth = 0;
const dropUI = (on) => { $('drop').hidden = !on; };
addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes('Files')) { dragDepth++; dropUI(true); } });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; dropUI(false); } });
addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; dropUI(false); loadFile(e.dataTransfer.files[0]); });
addEventListener('paste', (e) => {
	const file = [...(e.clipboardData?.items || [])].find(x => x.type.startsWith('image/'))?.getAsFile();
	if (file) { e.preventDefault(); loadFile(file); }
});

$('copyLink').addEventListener('click', async (e) => {
	const btn = e.currentTarget, label = btn.innerHTML;
	try { await navigator.clipboard.writeText(shareURL()); btn.textContent = 'Copied'; }
	catch { prompt('Copy this link:', shareURL()); }
	setTimeout(() => (btn.innerHTML = label), 1400);
	if (formation?.kind === 'image') hint('Links can’t carry your image, only the look.');
});

// remix panel
for (const [key, [label, min, max, st]] of Object.entries(specs)) {
	const row = document.createElement('label');
	row.className = 'control';
	row.innerHTML = `${label}<output id="v-${key}"></output><input id="p-${key}" type="range" min="${min}" max="${max}" step="${st}">`;
	$('sliders').append(row);
	$(`p-${key}`).addEventListener('input', (e) => { remix.params[key] = Number(e.target.value); applyLook(); updateLinks(); });
}
$('palette').replaceChildren(new Option('Picked by your text', -1), ...palettes.map((p, i) => new Option(p.name, i)));
$('palette').addEventListener('change', (e) => {
	remix.palette = Number(e.target.value); applyLook(); updateLinks();
	if (formation?.kind === 'text') writeText(formation.label);
});
$('pause').addEventListener('change', (e) => { remix.pause = e.target.checked; });
$('reset').addEventListener('click', () => {
	remix = { palette: -1, params: {}, pause: reduceMotion }; applyLook(); updateLinks();
	if (formation?.kind === 'text') writeText(formation.label);
});
function syncControls() {
	$('palette').value = remix.palette; $('pause').checked = remix.pause;
	for (const key in specs) {
		const v = tgt[key];
		$(`p-${key}`).value = v;
		$(`v-${key}`).value = key === 'count' ? Math.round(v).toLocaleString('en-US') : +(+v).toFixed(3);
	}
}
const panel = (open) => {
	$('remix').hidden = !open; $('remixOpen').setAttribute('aria-expanded', String(open));
	if (!open) $('remixOpen').focus();
};
$('remixOpen').addEventListener('click', () => panel($('remix').hidden));
$('remixClose').addEventListener('click', () => panel(false));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('remix').hidden) panel(false); });

// pointer: hover/drag pushes stars, tap sends a shockwave, wheel zooms
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), inv = new THREE.Matrix4();
function localRay(clientX, clientY) {
	ndc.set(clientX / innerWidth * 2 - 1, -(clientY / innerHeight) * 2 + 1);
	raycaster.setFromCamera(ndc, camera);
	stars.updateWorldMatrix(true, false);
	inv.copy(stars.matrixWorld).invert();
	const o = raycaster.ray.origin.clone().applyMatrix4(inv), d = raycaster.ray.direction.clone().transformDirection(inv);
	return { o, d };
}
canvas.addEventListener('pointermove', (e) => {
	pointer.x = e.clientX; pointer.y = e.clientY; pointer.last = performance.now();
	parallax.set(e.clientX / innerWidth - .5, e.clientY / innerHeight - .5);
});
canvas.addEventListener('pointerleave', () => { pointer.last = -1e9; parallax.set(0, 0); });
canvas.addEventListener('pointerdown', (e) => {
	pointer.x = e.clientX; pointer.y = e.clientY; pointer.last = performance.now();
	const { o, d } = localRay(e.clientX, e.clientY);
	// hit the plane the stars live on: z=0 for formations, the galaxy disk (y=0) otherwise
	const axis = blendLin > .5 ? 'z' : 'y';
	const t = Math.abs(d[axis]) > 1e-3 ? -o[axis] / d[axis] : o.length();
	uShockO.value.copy(o).addScaledVector(d, t);
	uShockAge.value = 0;
});
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom = THREE.MathUtils.clamp(zoom * Math.exp(e.deltaY * .001), .55, 1.8); }, { passive: false });

// ---------- camera framing ----------

// frac = share of the frame height the content may use (screen: measured free area; exports: fixed)
function formDistance(aspect, frac) {
	if (!formation) return 14;
	const halfW = formation.w / 2 * 1.08, halfH = formation.h / 2 * 1.06;
	return Math.max(halfW / (TAN * aspect), halfH / (TAN * frac), 7);
}
function galaxyDistance(aspect, frac) {
	return natural.reach * Math.max(2.1 / Math.min(1, frac + .15), 2.6 / aspect) + 1;
}
function cameraFor(aspect, out, frac = free.frac) {
	const gd = galaxyDistance(aspect, frac), fd = formDistance(aspect, frac), e = uBlend.value;
	const g = GALAXY_DIR.clone().multiplyScalar(gd), f = new THREE.Vector3(0, 0, fd);
	out.lerpVectors(g, f, e);
	uFormScale.value = Math.min(2.8, Math.max(1, fd / 13));
	return out;
}

// ---------- world step ----------

const camBase = new THREE.Vector3();
function stepWorld(dt, now, recT = null) {
	const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 2.4);
	for (const key in tgt) cur[key] += (tgt[key] - cur[key]) * k;
	for (const c of COL) curCol[c].lerp(tgtCol[c], k);
	for (const key of NUM) U[key].value = cur[key];
	for (const c of COL) U[c].value.copy(curCol[c]);
	stars.count = Math.min(MAX_STARS, Math.ceil(cur.count));
	glow.scale.setScalar(cur.coreR * 4 + 1.2);

	let want = formed && formation ? 1 : 0;
	if (recT !== null && formation && formed) want = recT < .8 ? 0 : Math.min(1, (recT - .8) / 2.6);
	if (recT !== null && formation && formed) blendLin = want;
	else blendLin = reduceMotion ? want : blendLin + Math.sign(want - blendLin) * Math.min(Math.abs(want - blendLin), dt / 1.5);
	uBlend.value = ease(blendLin);
	retargetLin = Math.min(1, retargetLin + dt / 1.4);
	uRetarget.value = ease(retargetLin);

	const paused = remix.pause && recT === null;
	if (!paused) { uTime.value += dt; spinAngle += dt * cur.rot * (1 - uBlend.value); }
	spin.rotation.y = Math.atan2(Math.sin(spinAngle), Math.cos(spinAngle)) * (1 - uBlend.value);
	tilt.rotation.set(cur.tiltX * (1 - uBlend.value), 0, cur.tiltZ * (1 - uBlend.value));

	const active = recT === null && now - pointer.last < 1400 ? 1 : 0;
	push += (active - push) * Math.min(1, dt * (active ? 8 : 2));
	uPush.value = push;
	if (active) { const { o, d } = localRay(pointer.x, pointer.y); uRayO.value.copy(o); uRayD.value.copy(d); }
	uShockAge.value += dt;
	if (recT !== null && recT >= 4.3 && !stepWorld.shot) { uShockO.value.set(0, 0, 0); uShockAge.value = 0; stepWorld.shot = true; }

	cameraFor(camera.aspect, camBase, recT === null ? free.frac : .78).multiplyScalar(recT === null ? zoom : 1 - .05 * ease(recT / CLIP_SEC));
	if (recT === null && !reduceMotion) camBase.add(new THREE.Vector3(parallax.x * 1.2, -parallax.y * .8, 0));
	camera.position.lerp(camBase, recT !== null || reduceMotion ? 1 : 1 - Math.exp(-dt * 5));
	camera.lookAt(0, 0, 0);
}

// ---------- share image + clip ----------

const logo = new Image(); logo.src = 'zm_logo.png';
function drawCard(ctx, W, H, src) {
	ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
	ctx.drawImage(src, 0, 0, W, H);
	const s = H / 900, x = 64 * s;
	const mono = (px) => `500 ${px * s}px "JetBrains Mono", monospace`;
	if (logo.complete) ctx.drawImage(logo, x, 56 * s, 60 * s, 60 * s * logo.height / logo.width);
	ctx.fillStyle = '#A3A39B'; ctx.font = mono(16); ctx.letterSpacing = `${2.6 * s}px`; ctx.textBaseline = 'alphabetic';
	ctx.fillText('WRITE IN STARS', x + 80 * s, 94 * s);
	const n = Math.round(cur.count).toLocaleString('en-US');
	ctx.fillText(`${n} STARS`, x, H - 58 * s);
	ctx.textAlign = 'right';
	ctx.fillText(`TYPE ANYTHING · ${location.host}${location.pathname.replace(/index\.html$/, '')}`.toUpperCase(), W - x, H - 58 * s);
	ctx.textAlign = 'left'; ctx.letterSpacing = '0px';
}

function withOutputSize(W, H, fn) {
	const saved = camera.position.clone();
	if (canvas.width !== W || canvas.height !== H) {
		renderer.setPixelRatio(1); renderer.setSize(W, H, false);
		camera.aspect = W / H; camera.clearViewOffset(); camera.updateProjectionMatrix();
	}
	cameraFor(W / H, camera.position, .78); camera.lookAt(0, 0, 0);
	renderer.render(scene, camera);
	fn();
	camera.position.copy(saved);
}

const dlg = $('dlg');
let objectURL = null;
function releasePreview() { const el = $('dlgMedia').firstElementChild; if (el?.src?.startsWith('blob:')) URL.revokeObjectURL(el.src); }
function openDialog(title, mediaEl, hintText) {
	$('dlgTitle').textContent = title;
	releasePreview(); $('dlgMedia').replaceChildren(mediaEl);
	$('dlgHint').textContent = hintText;
	$('dlgPost').href = postURL();
	$('dlgShare').hidden = true;
	setDownload(null);
	if (!dlg.open) dlg.showModal();
}
function setDownload(blob, filename) {
	const a = $('dlgDownload');
	if (objectURL) URL.revokeObjectURL(objectURL);
	objectURL = blob ? URL.createObjectURL(blob) : null;
	if (blob) { a.href = objectURL; a.download = filename; a.removeAttribute('aria-disabled'); }
	else { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); }
	const share = $('dlgShare');
	if (blob && navigator.canShare) {
		const file = new File([blob], filename, { type: blob.type });
		if (navigator.canShare({ files: [file] })) {
			share.hidden = false;
			share.onclick = () => navigator.share({ files: [file], text: `${postText()} ${shareURL()}` }).catch(() => {});
		}
	}
}
const fileBase = () => 'stars-' + ((formation?.label || seed).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'zm');
$('dlgClose').addEventListener('click', () => dlg.close());
dlg.addEventListener('close', () => { stopRecording(true); releasePreview(); $('dlgMedia').replaceChildren(); fitScreen(); });

$('saveCard').addEventListener('click', async () => {
	await document.fonts.ready;
	const W = 1600, H = 900, out = document.createElement('canvas');
	out.width = W; out.height = H;
	withOutputSize(W, H, () => drawCard(out.getContext('2d'), W, H, canvas));
	fitScreen();
	const blob = await new Promise(res => out.toBlob(res, 'image/png'));
	const img = new Image(); img.alt = 'Your stars'; img.src = URL.createObjectURL(blob);
	openDialog('Your image', img, 'Download it and attach it to your post.');
	setDownload(blob, fileBase() + '.png');
});

let rec = null;
const FPS = 30;
const pickMime = () => ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
	.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));

// Preferred: WebCodecs + mp4-muxer, one encoded frame per rendered frame at exactly 30 fps (no realtime stalls).
async function startEncoder(W, H) {
	if (!('VideoEncoder' in window)) return null;
	const configs = ['avc1.640028', 'avc1.4d0028', 'avc1.42001f'].map(codec => ({ codec, width: W, height: H, bitrate: 10e6, framerate: FPS }));
	let config = null;
	for (const c of configs) { try { if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break; } } catch {} }
	if (!config) return null;
	const { Muxer, ArrayBufferTarget } = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/build/mp4-muxer.mjs');
	const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: FPS }, fastStart: 'in-memory' });
	const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => console.error(e) });
	enc.configure(config);
	return { enc, muxer };
}

function showClip(blob, ext) {
	const v = document.createElement('video');
	v.src = URL.createObjectURL(blob); v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.controls = true;
	$('dlgTitle').textContent = 'Your clip';
	$('dlgMedia').replaceChildren(v);
	$('dlgHint').textContent = ext === 'mp4'
		? 'Six seconds of a galaxy turning into yours. Download it and attach it to your post.'
		: 'This browser saved a WebM. X needs MP4, so record in Chrome or Safari, or convert it.';
	$('dlgPost').removeAttribute('aria-disabled');
	setDownload(blob, `${fileBase()}.${ext}`);
}

$('saveClip').addEventListener('click', async () => {
	if (rec) return;
	await document.fonts.ready;
	const W = 1280, H = 720, out = document.createElement('canvas');
	out.width = W; out.height = H;
	stepWorld.shot = false;
	openDialog('Recording your clip', out, 'Preparing…');
	$('dlgPost').setAttribute('aria-disabled', 'true');
	const wc = await startEncoder(W, H).catch(() => null);
	if (wc) { rec = { kind: 'wc', ...wc, out, ctx: out.getContext('2d'), W, H, n: 0, cancelled: false }; return; }

	// Fallback: MediaRecorder in realtime. Hold the clip clock until the encoder is actually delivering data.
	const mime = pickMime();
	if (!mime) { $('dlgHint').textContent = 'This browser can’t record video. Try Chrome, Edge or Safari.'; return; }
	const stream = out.captureStream(FPS);
	const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12e6 });
	const chunks = [];
	mr.ondataavailable = (e) => { if (e.data.size) { chunks.push(e.data); if (rec) rec.chunks++; } };
	rec = { kind: 'mr', mr, out, ctx: out.getContext('2d'), W, H, t: 0, warm: 0, chunks: 0, started: false, cancelled: false };
	mr.onstop = () => {
		const rr = rec; rec = null;
		stream.getTracks().forEach(t => t.stop());
		fitScreen();
		if (!rr || rr.cancelled) return;
		showClip(new Blob(chunks, { type: mime.split(';')[0] }), mime.startsWith('video/mp4') ? 'mp4' : 'webm');
	};
});

async function finishEncoder() {
	const r = rec; r.finishing = true;
	$('dlgHint').textContent = 'Finishing your clip…';
	try {
		await r.enc.flush(); r.enc.close();
		r.muxer.finalize();
		rec = null; fitScreen();
		if (!r.cancelled) showClip(new Blob([r.muxer.target.buffer], { type: 'video/mp4' }), 'mp4');
	} catch (e) { console.error(e); rec = null; fitScreen(); $('dlgHint').textContent = 'Recording failed in this browser. Try Chrome or Safari.'; }
}

function stopRecording(cancel) {
	if (!rec) return;
	rec.cancelled = cancel;
	if (rec.kind === 'mr') { if (rec.mr.state !== 'inactive') rec.mr.stop(); else rec = null; }
	else if (!rec.finishing) { try { rec.enc.close(); } catch {} rec = null; }
}

// ---------- loop ----------

let last = performance.now();
function outputSize(W, H) {
	if (canvas.width === W && canvas.height === H) return;
	renderer.setPixelRatio(1); renderer.setSize(W, H, false);
	camera.aspect = W / H; camera.clearViewOffset(); camera.updateProjectionMatrix();
}
function frame(now = performance.now()) {
	const dt = Math.min(.05, (now - last) / 1000); last = now;
	if (rec?.kind === 'wc' && !rec.cancelled && !rec.finishing) {
		outputSize(rec.W, rec.H);
		if (rec.enc.encodeQueueSize > 6) return;          // let the encoder catch up
		const t = rec.n / FPS;
		stepWorld(1 / FPS, now, t);
		renderer.render(scene, camera);
		drawCard(rec.ctx, rec.W, rec.H, canvas);
		const vf = new VideoFrame(rec.out, { timestamp: Math.round(rec.n * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
		rec.enc.encode(vf, { keyFrame: rec.n % (FPS * 2) === 0 }); vf.close();
		$('dlgHint').textContent = `Recording ${t.toFixed(1)} / ${CLIP_SEC}.0 s`;
		if (++rec.n >= CLIP_SEC * FPS) finishEncoder();
		return;
	}
	if (rec?.kind === 'mr' && !rec.cancelled && (!rec.started || rec.mr.state === 'recording')) {
		outputSize(rec.W, rec.H);
		const t = rec.t;
		stepWorld(dt, now, t);
		renderer.render(scene, camera);
		drawCard(rec.ctx, rec.W, rec.H, canvas);
		$('dlgHint').textContent = `Recording ${t.toFixed(1)} / ${CLIP_SEC}.0 s`;
		if (!rec.started) { if (++rec.warm >= 4) { rec.mr.start(200); rec.started = true; } }
		else if (rec.chunks >= 2 && (rec.t += Math.min(dt, 1 / 24)) >= CLIP_SEC) rec.mr.stop();
		return;
	}
	stepWorld(dt, now);
	renderer.render(scene, camera);
}

// Deterministic hook for our own promo recordings (html2video --seek).
window.ZM = {
	writeText, writeImage,
	seek(t) { uTime.value = t; renderer.render(scene, camera); },
};

async function boot() {
	try { await renderer.init(); }
	catch (e) {
		const s = $('status');
		s.textContent = 'Your browser can’t run WebGPU or WebGL 2, so the stars can’t be drawn here. Try a recent Chrome, Edge or Safari.';
		s.classList.add('fail'); console.error(e); return;
	}
	console.info('Write in Stars backend:', renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2');
	fitScreen();
	let relayout = 0;
	const onResize = () => {
		fitScreen();
		clearTimeout(relayout);
		relayout = setTimeout(() => { if (formation?.kind === 'text') writeText(formation.label); else if (formation?.kind === 'intro') writeIntro(); }, 200);
	};
	addEventListener('resize', onResize);
	new ResizeObserver(() => frameView(innerWidth, innerHeight)).observe(document.querySelector('.bottom'));
	const q = new URLSearchParams(location.search);
	try {
		const raw = JSON.parse(q.get('r') || 'null');
		if (raw?.v === 1) {
			if (Number.isInteger(raw.palette) && raw.palette >= -1 && raw.palette < palettes.length) remix.palette = raw.palette;
			for (const [key, [, min, max]] of Object.entries(specs)) if (Number.isFinite(raw.params?.[key])) remix.params[key] = THREE.MathUtils.clamp(raw.params[key], min, max);
		}
	} catch {}
	applyLook(); syncToggle();
	cur = { ...tgt }; for (const c of COL) curCol[c].copy(tgtCol[c]);
	renderer.setAnimationLoop(frame);
	requestAnimationFrame(() => $('status').classList.add('done'));

	const t = (q.get('t') || '').slice(0, 64);
	if (t) { $('text').value = t; await writeText(t); }
	else {
		// first visit: a galaxy gathers itself into "write anything", with an arrow pointing at the input
		setTimeout(writeIntro, reduceMotion ? 0 : 1400);
	}
}
boot();
