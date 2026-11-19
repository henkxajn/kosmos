// KOSMOS — CS-PHYS-c sonda zrzutów (headless Chrome + CDP, prawdziwy tytuł → nowa gra): świat realisticClimate +
// scaledOrbits + seededSystems z WYMUSZONYM ziarnem galaktyki (domyślnie 11 → dom karzeł M, L 0.028, k = 0.2), więc ten
// sam świat na drzewie „przed” (--root = worktree bazy) i „po”. Kadry: (1) ramka układu domowego, (1b) układ wewnętrzny z 9 j. (z góry), (2) zbliżenie świata
// domowego regułą gry (body:selected — auto-zoom), (3) świat domowy ze stałej odległości 1.5 j. (księżyce i ich orbity),
// (4) ramka pierwszego układu K, (5) ramka pierwszego układu G. Odczyt liczb do JSON (--out), PNG do --shots <katalog>.
//   node src/testing/headless/probe-cs-phys-c-shots.mjs --root <drzewo> --shots <katalog> --tag after [--seed 11]
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ROOT = path.resolve(arg('--root', REPO));
const SHOTS = path.resolve(arg('--shots', '.'));
const TAG = arg('--tag', 'after');
const SEED = Number(arg('--seed', '11'));
const OUT = arg('--out', null);
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    let file = path.join(ROOT, rel || 'index.html');
    if (!fs.existsSync(file) && rel.startsWith('assets/')) file = path.join(REPO, rel);
    if (!file.startsWith(ROOT) && !file.startsWith(REPO)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-csphysc-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--mute-audio', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--window-size=1600,1041', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 150; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = l.find(t => t.type === 'page'); if (p) return { proc, profile, wsUrl: p.webSocketDebuggerUrl }; } catch { /* jeszcze nie */ }
    await sleep(100);
  }
  proc.kill(); throw new Error('Chrome nie wstał');
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result); } else if (msg.method) listeners.forEach(l => l(msg)); };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value; };
  const waitFor = async (expr, label, ms = 240000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evaluate(expr)) return; } catch { /* strona się ładuje */ } await sleep(400); } throw new Error('timeout: ' + label); };
  return new Promise((res, rej) => { ws.onopen = () => res({ send, evaluate, waitFor, on: (f) => listeners.push(f), close: () => ws.close() }); ws.onerror = rej; });
}

// Odczyt sceny aktywnego układu (moduły dzielą instancje z grą)
const READ = `(async () => {
  const K = window.KOSMOS, tr = K.threeRenderer, cc = tr._cameraController;
  const EM = (await import('/src/core/EntityManager.js')).default;
  const sys = K.activeSystemId, star = EM.getStarOfSystem(sys);
  const home = K.homePlanet, homeEntry = tr._planets.get(home?.id);
  const ringR = [...tr._moons.values()].filter(m => m.moon.parentPlanetId === home?.id).map(m => +(m.moon.orbital.a * 11).toFixed(4));
  const planets = EM.getByTypeInSystem('planet', sys).sort((a, b) => a.orbital.a - b.orbital.a);
  return { sys, cls: star?.spectralType, L: star?.luminosity, k: star?.systemScale, bodyDrawScale: tr._bodyDrawScale ?? null,
    starDrawScale: tr._starDrawScale, camDist: +cc._dist.toFixed(3), minDist: cc._minDist,
    homeDrawR: homeEntry?.mesh?.geometry?.parameters?.radius ?? null, homeMoonRingsWU: ringR,
    innerAU: planets.slice(0, 4).map(p => +p.orbital.a.toFixed(3)) };
})()`;

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = await launch();
const report = { root: ROOT, tag: TAG, seed: SEED, frames: [] };
let exitCode = 0;
try {
  fs.mkdirSync(SHOTS, { recursive: true });
  const page = await cdp(chrome.wsUrl);
  const exc = [];
  page.on((m) => { if (m.method === 'Runtime.exceptionThrown') exc.push(String(m.params.exceptionDetails?.exception?.description ?? '').slice(0, 200)); });
  await page.send('Runtime.enable'); await page.send('Page.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1041, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.navigate', { url: `${base}/index.html` });
  await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł');
  await page.evaluate(`(async () => { localStorage.clear(); const F = KOSMOS.gameConfig.FEATURES; F.realisticClimate = true; F.scaledOrbits = true; F.seededSystems = true;
    const G = (await import('/src/generators/GalaxyGenerator.js')).GalaxyGenerator; G.mintSeed = () => ${SEED}; return true; })()`);
  await page.evaluate(`document.querySelector('[data-action="new"]').click(), true`);
  await page.waitFor(`!!document.querySelector('.fs-leader-card')`, 'lider');
  await page.evaluate(`document.querySelector('.fs-leader-card').click(), true`);
  await page.waitFor(`!!document.querySelector('#fs-start')`, 'start');
  await page.evaluate(`document.querySelector('#fs-start').click(), true`);
  await page.waitFor(`!!(window.KOSMOS?.starSystemManager && window.KOSMOS?.galaxyData?.seed !== undefined)`, 'GameScene');
  await sleep(3000);
  for (let t = 0; t < 240 && !(await page.evaluate('!!window.KOSMOS?.homePlanet && !!window.KOSMOS?.civMode')); t++) {
    await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })), true`);
    await sleep(500);
  }
  await page.waitFor(`!!(window.KOSMOS?.homePlanet && window.KOSMOS?.civMode)`, 'stolica + 4X', 60000);
  await page.waitFor(`window.KOSMOS?.gameScene?._introLockActive !== true`, 'koniec intro', 180000);
  await page.evaluate(`KOSMOS.timeSystem?.pause?.(), true`);
  // Intro kończy się na karcie kolonii — zamknij overlaye (mapa układu na wierzchu)
  await page.evaluate(`(() => { const om = KOSMOS.uiManager?.overlayManager; for (let i = 0; i < 5 && om?.active; i++) om.closeActive(); KOSMOS.uiManager?._draw?.(); return om?.active == null; })()`);
  await sleep(2500);
  report.galaxySeed = await page.evaluate(`KOSMOS.galaxyData?.seed`);

  const shot = async (name, info, waitMs = 2500) => {
    await sleep(waitMs);
    const r = await page.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(SHOTS, `${TAG}-${name}.png`);
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    const read = await page.evaluate(READ);
    report.frames.push({ name, file, ...info, ...read });
    console.log(name, JSON.stringify(read));
  };
  const NOSHOTS = process.argv.includes('--noshots');   // tylko kontrola kolizji (bez zrzutów)
  if (NOSHOTS) report.frames = null;
  if (!NOSHOTS) {
  await page.evaluate(`KOSMOS.threeRenderer.resetToSystemView(), true`);
  await shot('1-home-frame', {});
  await page.evaluate(`KOSMOS.threeRenderer._cameraController.applyView({ target: { x: 0, y: 0, z: 0 }, dist: 9, phi: 0.55 }), true`);
  await shot('1b-home-inner-9wu', {});
  await page.evaluate(`(async () => { const EB = (await import('/src/core/EventBus.js')).default; EB.emit('body:selected', { entity: KOSMOS.homePlanet }); return true; })()`);
  await shot('2-home-autozoom', {}, 8000);
  await page.evaluate(`(() => { const tr = KOSMOS.threeRenderer, e = tr._planets.get(KOSMOS.homePlanet.id); tr._cameraController.applyView({ target: { x: e.group.position.x, y: 0, z: e.group.position.z }, dist: 1.5 }); return true; })()`);
  await shot('3-home-moons-1.5wu', {});
  for (const cls of ['K', 'G']) {
    const id = await page.evaluate(`(async () => { const EM = (await import('/src/core/EntityManager.js')).default; const ss = KOSMOS.starSystemManager;
      const gd = KOSMOS.galaxyData;
      const gs = [...gd.systems].filter(x => x.id !== 'sys_home' && (x.spectralType ?? x.star?.spectralType) === '${cls}').sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
      if (!gs) return null;
      if (!ss.getSystem(gs.id)) ss.generateAndRegister(gs, gd);
      ss.switchActiveSystem(gs.id); return gs.id; })()`);
    if (!id) { console.log('brak układu', cls); continue; }
    await sleep(4000);
    await page.evaluate(`KOSMOS.threeRenderer.resetToSystemView(), true`);
    await shot(`${cls === 'K' ? 4 : 5}-${cls}-frame`, { switchedTo: id });
  }
  }
  // --collision N: csCollisionTest() i csCollisionTestLowFps() po N razy z flagą ON i OFF (kontrola Finding 776) w układzie
  //   domowym i w pierwszym układzie G (k = 1, jak w kontroli właściciela)
  const NCOL = Number(arg('--collision', '0'));
  if (NCOL > 0) {
    report.collision = [];
    for (const where of ['sys_home', 'G']) {
      const sysId = await page.evaluate(`(async () => { const ss = KOSMOS.starSystemManager, gd = KOSMOS.galaxyData;
        let id = '${where}';
        if (id === 'G') { const gs = [...gd.systems].filter(x => x.id !== 'sys_home' && (x.spectralType ?? x.star?.spectralType) === 'G').sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
          if (!gs) return null; if (!ss.getSystem(gs.id)) ss.generateAndRegister(gs, gd); id = gs.id; }
        if (KOSMOS.activeSystemId !== id) ss.switchActiveSystem(id); return id; })()`);
      if (!sysId) { console.log('brak układu', where); continue; }
      await sleep(4000);
      for (const fn of ['csCollisionTest', 'csCollisionTestLowFps']) for (const flag of [true, false]) for (let i = 0; i < NCOL; i++) {
        await page.evaluate(`KOSMOS.gameConfig.FEATURES.sweptProximity = ${flag}, true`);
        // starcie w układzie (np. AI) — test by odmówił (combat_in_progress); zaczekaj na koniec siatki rund
        await page.evaluate(`KOSMOS.timeSystem.play(), true`);
        await page.waitFor(`!KOSMOS.timeSystem._combatView?.()`, 'koniec starcia w układzie', 150000);
        await page.evaluate(`KOSMOS.timeSystem.pause(), true`);
        const r = await page.evaluate(`${fn}()`);
        report.collision.push({ where: sysId, fn, flag, ...r });
        console.log(fn, sysId, flag ? 'ON ' : 'OFF', JSON.stringify(r));
        await page.waitFor(`!KOSMOS.vesselManager.getAllVessels().some(v => v._csCollisionTest)`, 'sprzątanie testu', 150000);
      }
    }
    await page.evaluate(`KOSMOS.gameConfig.FEATURES.sweptProximity = true, true`);
  }
  report.exceptions = exc;
  page.close();
} catch (e) { console.error('sonda:', e); exitCode = 2; }
finally {
  try { chrome.proc.kill(); } catch { /* nic */ }
  server.close();
  await sleep(500);
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* Chrome trzyma pliki */ }
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(`SUMMARY probe-cs-phys-c-shots ${TAG}: ${exitCode === 0 ? 'OK' : 'FAIL'} (exit ${exitCode}), wyjątki ${report.exceptions?.length ?? '?'}`);
process.exit(exitCode);
