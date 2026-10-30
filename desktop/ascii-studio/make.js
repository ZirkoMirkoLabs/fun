#!/usr/bin/env node
// Batch front end for the studio: serves projects/ascii-studio on localhost and drives it in
// headless Chrome, so output matches the browser. Nothing leaves this machine.
const fs = require('fs'), path = require('path'), http = require('http'), { spawn, spawnSync } = require('child_process');
const puppeteer = require('puppeteer-core');

const SITE = path.resolve(__dirname, '../../projects/ascii-studio');
const HELP = `ASCII Studio: turn images or text into ASCII art.

  node make.js <image|folder> [...more] [options]
  node make.js --text "HELLO" [options]
  node make.js --preset terra|smoke [options]

  --style     pixel | liquid | both     default pixel
  --palette   terra | mono | phosphor | amber | rose | source | true   default terra
              (source keeps the image's hues, true its exact colours and tones; pixel style only)
  --formats   any of png,mp4,txt        default png,mp4,txt
  --out       output folder             default ./out
  --seconds   video length (one loop)   default 12
  --fps       video frame rate          default 30
  --density   characters per row        default 180 pixel, 168 liquid
  --size      liquid image size in px   default 1080
  --sway  --aura                        pixel motion and text halo
  --warp  --trail  --tend  --dust  --glow    liquid look
  --invert  --no-invert  --thresh 0.5   override automatic subject detection
`;
const IMAGE = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif' };
const MIME = { '.html':'text/html', '.mjs':'text/javascript', '.css':'text/css', ...IMAGE };
const NUMERIC = ['seconds', 'fps', 'density', 'size', 'sway', 'aura', 'warp', 'trail', 'tend', 'dust', 'glow', 'thresh'];

function parse(argv) {
  const o = { inputs: [], style: 'pixel', formats: 'png,mp4,txt', out: 'out', seconds: 12, fps: 30, size: 1080 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--invert') o.invert = true;
    else if (a === '--no-invert') o.invert = false;
    else if (a.startsWith('--')) {
      const k = a.slice(2), v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      if (!['style', 'palette', 'formats', 'out', 'text', 'preset', ...NUMERIC].includes(k)) throw new Error(`unknown option ${a}`);
      if (NUMERIC.includes(k) && !Number.isFinite(+v)) throw new Error(`${a} needs a number`);
      o[k] = NUMERIC.includes(k) ? +v : v;
    } else o.inputs.push(a);
  }
  return o;
}

function findChrome() {
  const c = [process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const hit = c.find(p => p && fs.existsSync(p));
  if (!hit) throw new Error('Chrome or Edge not found; set CHROME_PATH');
  return hit;
}

function expand(inputs) {
  const files = [];
  for (const p of inputs) {
    if (!fs.existsSync(p)) throw new Error(`not found: ${p}`);
    if (fs.statSync(p).isDirectory()) {
      fs.readdirSync(p).sort().forEach(f => { if (IMAGE[path.extname(f).toLowerCase()]) files.push(path.join(p, f)); });
    } else if (IMAGE[path.extname(p).toLowerCase()]) files.push(p);
    else throw new Error(`not a supported image: ${p}`);
  }
  return files;
}

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(SITE, rel);
    if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function renderJob(page, origin, job, style, o, formats) {
  const look = { style };
  ['palette', 'density', 'sway', 'aura', 'warp', 'trail', 'tend', 'dust', 'glow'].forEach(k => { if (o[k] !== undefined) look[k] = o[k]; });
  await page.goto(`${origin}/index.html?still=1&bare=1` + (style === 'liquid' ? `&size=${o.size & ~1}` : ''));
  await page.waitForFunction('window.ASCII && window.ASCII.ready', { timeout: 30000 });
  if (job.file) {
    const url = `data:${IMAGE[path.extname(job.file).toLowerCase()]};base64,${fs.readFileSync(job.file).toString('base64')}`;
    await page.evaluate(u => ASCII.loadImage(u), url);
  } else if (job.preset) {
    await page.evaluate(p => ASCII.loadPreset(p), job.preset);
    await page.waitForFunction(p => ASCII.state.loaded === p, {}, job.preset);
  } else await page.evaluate(t => ASCII.setText(t), job.text);
  // Presets pick their own mode on load, so the requested style is applied after them.
  await page.evaluate(l => ASCII.configure(l), { ...look, ...(o.invert !== undefined ? { invert: o.invert } : {}), ...(o.thresh !== undefined ? { thresh: o.thresh } : {}) });

  const base = path.join(o.out, `${job.name}-${style}`);
  const frame = async s => Buffer.from((await page.evaluate(t => ASCII.frame(t), s)).split(',')[1], 'base64');
  if (formats.includes('png')) { fs.writeFileSync(base + '.png', await frame(0)); console.log('  ' + base + '.png'); }
  if (formats.includes('txt')) { fs.writeFileSync(base + '.txt', await page.evaluate(() => ASCII.asciiAt(0, 160))); console.log('  ' + base + '.txt'); }
  if (formats.includes('mp4')) {
    const n = Math.round(o.seconds * o.fps), loop = await page.evaluate(() => ASCII.LOOP);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(o.fps), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'medium', '-movflags', '+faststart', base + '.mp4'], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => { ff.on('close', c => c ? rej(new Error(`ffmpeg exited with ${c}`)) : res()); ff.on('error', rej); });
    for (let i = 0; i < n; i++) {
      const buf = await frame(i / n * loop);
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end(); await done;
    console.log('  ' + base + '.mp4');
  }
}

(async () => {
  const o = parse(process.argv.slice(2));
  const jobs = expand(o.inputs).map(f => ({ file: f, name: path.parse(f).name }));
  if (o.text) jobs.push({ text: o.text, name: o.text.replace(/[^\w-]+/g, '_').slice(0, 40) || 'text' });
  if (o.preset) { if (!['terra', 'smoke'].includes(o.preset)) throw new Error('--preset must be terra or smoke'); jobs.push({ preset: o.preset, name: o.preset }); }
  if (o.help || !jobs.length) { console.log(HELP); process.exit(o.help ? 0 : 1); }
  if (!['pixel', 'liquid', 'both'].includes(o.style)) throw new Error('--style must be pixel, liquid or both');
  const formats = o.formats.split(',').map(s => s.trim());
  const bad = formats.find(f => !['png', 'mp4', 'txt'].includes(f)); if (bad) throw new Error(`unknown format ${bad}`);
  if (formats.includes('mp4') && spawnSync('ffmpeg', ['-version']).error) throw new Error('mp4 needs ffmpeg on PATH (or use --formats png,txt)');
  fs.mkdirSync(o.out, { recursive: true });

  const server = await serve();
  const browser = await puppeteer.launch({ headless: 'new', executablePath: findChrome(),
    args: ['--ignore-gpu-blocklist', '--enable-webgl', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])] });
  const page = await browser.newPage();
  let pageError = null;
  page.on('pageerror', e => { pageError = e; });
  await page.setViewport({ width: 1400, height: 1000 });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let failed = 0;
  for (const job of jobs) for (const style of o.style === 'both' ? ['pixel', 'liquid'] : [o.style]) {
    console.log(`${job.name} (${style})`);
    try { pageError = null; await renderJob(page, origin, job, style, o, formats); if (pageError) throw pageError; }
    catch (e) { failed++; console.error(`  failed: ${e.message}`); }
  }
  await browser.close(); server.close();
  console.log(failed ? `${failed} failed` : 'done');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
