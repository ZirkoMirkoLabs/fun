// Handle -> galaxy parameters. Pure and deterministic: same handle, same galaxy.

export const normalize = (raw) => raw.trim().replace(/^@+/, '').toLowerCase();
export const valid = (h) => /^[a-z0-9_]{1,15}$/.test(h);

function cyrb128(str) {
	let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
	for (let i = 0, k; i < str.length; i++) {
		k = str.charCodeAt(i);
		h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
		h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
		h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
		h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
	}
	h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
	h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
	h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
	h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
	return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

function sfc32(a, b, c, d) {
	return () => {
		a |= 0; b |= 0; c |= 0; d |= 0;
		const t = (((a + b) | 0) + d) | 0;
		d = (d + 1) | 0;
		a = b ^ (b >>> 9);
		b = (c + (c << 3)) | 0;
		c = (c << 21) | (c >>> 11);
		c = (c + t) | 0;
		return (t >>> 0) / 4294967296;
	};
}

const TYPES = [['spiral', .38], ['barred', .24], ['flocculent', .14], ['ring', .10], ['elliptical', .10], ['merger', .04]];

const PALETTES = [
	{ name: 'Ember', inside: '#ffb27a', outside: '#3b1f9e', accent: '#86d6ff' },
	{ name: 'Glacier', inside: '#eaf6ff', outside: '#1d4f96', accent: '#ffd38a' },
	{ name: 'Rosette', inside: '#ffd3e2', outside: '#6b1d63', accent: '#8ce9ff' },
	{ name: 'Solar', inside: '#fff0b8', outside: '#b4410f', accent: '#72b8ff' },
	{ name: 'Aurora', inside: '#cbffea', outside: '#10506a', accent: '#ff9bd6' },
	{ name: 'Ultraviolet', inside: '#f0dbff', outside: '#2b1066', accent: '#ffb96c' },
	{ name: 'Copper', inside: '#ffe1c4', outside: '#5c2b13', accent: '#a2d2ff' },
	{ name: 'Lagoon', inside: '#d9fff6', outside: '#11504b', accent: '#ffd070' },
];
const SIGNAL = { name: 'ZM Signal', inside: '#F5F5ED', outside: '#2e6400', accent: '#84F800' };
const P_SIGNAL = .02, P_SAT = .18;

const TIERS = [[40, 'Common'], [150, 'Uncommon'], [600, 'Rare'], [2500, 'Epic'], [Infinity, 'Legendary']];

export function generate(handle) {
	const seed = cyrb128('zm-galaxy/' + handle);
	const R = sfc32(...seed);
	for (let i = 0; i < 12; i++) R();
	const u = (a, b) => a + (b - a) * R();
	const ui = (a, b) => Math.floor(u(a, b + 1));

	const forced = handle === 'zirkomirko';
	let type;
	{
		let x = R(), acc = 0;
		type = TYPES[TYPES.length - 1][0];
		for (const [id, w] of TYPES) { acc += w; if (x < acc) { type = id; break; } }
	}
	if (forced) type = 'barred';
	const signal = R() < P_SIGNAL || forced;
	const palette = signal ? SIGNAL : PALETTES[Math.floor(R() * PALETTES.length)];

	const p = {
		arms: 2, spin: 1, radius: u(4.2, 5.6), conc: u(1.35, 1.9), thick: u(.25, .5), scatter: u(.22, .38), chaos: 0,
		coreFrac: u(.1, .17), coreR: u(.55, .9), coreFlat: .55,
		barFrac: 0, barLen: 0, ringFrac: 0, ringR: 0, ringW: .4,
		satFrac: 0, satX: 0, satZ: 0, satR: .4,
		count: Math.round(u(36000, 64000)), size: u(.042, .055), accFrac: u(.03, .09), glow: u(.45, .8),
		tiltX: u(.05, .55), tiltZ: u(-.35, .35), rot: u(.04, .09) * (R() < .5 ? -1 : 1),
	};

	if (type === 'spiral') {
		p.arms = ui(2, 4); p.spin = u(.75, 1.5);
	} else if (type === 'barred') {
		p.arms = R() < .7 ? 2 : ui(3, 4); p.spin = u(.85, 1.45);
		p.barLen = u(1.0, 1.7); p.barFrac = u(.1, .16); p.scatter = u(.2, .32);
	} else if (type === 'flocculent') {
		p.arms = ui(5, 8); p.spin = u(.55, 1.0); p.scatter = u(.34, .48); p.chaos = .06;
	} else if (type === 'ring') {
		p.arms = ui(2, 3); p.spin = u(.4, .8); p.conc = u(2.2, 2.8); p.coreFrac = u(.16, .22);
		p.ringFrac = u(.32, .45); p.ringR = p.radius * u(.85, 1.05); p.ringW = u(.35, .75);
	} else if (type === 'elliptical') {
		p.arms = 1; p.spin = 0; p.chaos = 1; p.radius = u(2.2, 3.0); p.conc = 1.2; p.scatter = .45; p.thick = .9;
		p.coreFrac = u(.55, .7); p.coreR = u(1.3, 1.9); p.coreFlat = u(.35, .95);
	} else if (type === 'merger') {
		p.arms = 2; p.spin = u(1.5, 2.1); p.scatter = u(.32, .45);
		p.satFrac = u(.3, .38); p.satR = u(.9, 1.3);
	}

	const sat = type !== 'merger' && R() < P_SAT;
	if (sat) { p.satFrac = u(.05, .08); p.satR = u(.35, .55); }
	if (sat || type === 'merger') {
		const a = u(0, Math.PI * 2), dist = p.radius * (type === 'merger' ? u(.95, 1.2) : u(1.15, 1.4));
		p.satX = Math.cos(a) * dist; p.satZ = Math.sin(a) * dist;
	}

	const pType = TYPES.find(t => t[0] === type)[1];
	const pPal = signal ? P_SIGNAL : (1 - P_SIGNAL) / PALETTES.length;
	const pSat = type === 'merger' ? 1 : sat ? P_SAT : 1 - P_SAT;
	const oneIn = Math.max(1, Math.round(1 / (pType * pPal * pSat)));
	const tier = TIERS.find(t => oneIn < t[0])[1];

	const stage = p.spin > 1.2 ? 'a' : p.spin > .95 ? 'b' : 'c';
	const eClass = 'E' + Math.min(7, Math.max(0, Math.round((1 - p.coreFlat) * 10)));
	const [name, cls] = {
		spiral: ['Spiral', 'S' + stage],
		barred: ['Barred spiral', 'SB' + stage],
		flocculent: ['Flocculent spiral', 'S' + stage],
		ring: ['Ring galaxy', 'R'],
		elliptical: ['Elliptical', eClass],
		merger: ['Interacting pair', 'Pec'],
	}[type];

	const catalog = `ZMG ${seed[0].toString(16).toUpperCase().padStart(8, '0').slice(0, 4)}-${seed[1] % 90 + 10}`;
	const reach = Math.max(4.4, p.radius + p.barLen, p.ringR, p.coreR * 1.6, Math.hypot(p.satX, p.satZ) + p.satR * 1.5);

	return {
		handle, type, name, cls, sat, palette, oneIn, tier, catalog, p, reach,
		label: name + (sat ? ' + satellite' : ''),
		traits: [
			['Class', cls],
			['Arms', type === 'elliptical' ? '—' : String(p.arms)],
			['Twist', type === 'elliptical' ? '—' : p.spin.toFixed(2)],
			['Stars', p.count.toLocaleString('en-US')],
			['Palette', palette.name],
			['Rarity', `${tier} · 1 in ${oneIn.toLocaleString('en-US')}`],
		],
	};
}

export const palettes = [...PALETTES, SIGNAL];
