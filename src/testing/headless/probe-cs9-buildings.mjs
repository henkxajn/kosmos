// probe-cs9-buildings — prawdziwa gra (headless Chrome przez CDP, 1600×1041): budynki-portrety na kuli kolonii, stany,
// wariant A/B barwy kategorii, światła miast na nocnym sierpie, mapa układu (światła + ikony 784), 5 motywów, pomiar klatek.
// Plan COLONY_SPHERE §3.18. Zapisuje arkusz docs/design/prototypes/cs9-buildings.png i liczby do <ujęcia>/cs9-numbers.json.
//
//   node src/testing/headless/probe-cs9-buildings.mjs [--out <dir>]

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT_DIR = path.join(REPO, 'docs/design/prototypes');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const THEMES = ['ss_amber_noir', 'ss_cold_blue', 'ss_galactic_violet', 'ss_neon_cyber', 'ss_biopunk_green'];
const SHOT_DIR = arg('--out') ? path.resolve(arg('--out')) : fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs9-shots-'));
fs.mkdirSync(SHOT_DIR, { recursive: true });

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    if (rel.startsWith('__shot/')) return fs.readFile(path.join(SHOT_DIR, path.basename(rel)), (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); res.end(buf);
    });
    if (rel === '__sheet') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><html><body style="margin:0;background:#05070b"><canvas id="c"></canvas></body></html>'); }
    const file = path.join(REPO, rel || 'index.html');
    if (!file.startsWith(REPO)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs9-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--mute-audio', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11',
    '--enable-unsafe-swiftshader', '--window-size=1600,1041', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 150; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = l.find(t => t.type === 'page'); if (p) return { proc, profile, wsUrl: p.webSocketDebuggerUrl }; } catch { /* jeszcze nie */ }
    await sleep(100);
  }
  proc.kill(); throw new Error('Chrome nie wstał');
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result); } else for (const f of listeners) f(msg); };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, label, ms = 240000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evaluate(expr)) return; } catch { /* ładuje się */ } await sleep(250); } throw new Error('timeout: ' + label); };
  return new Promise((res, rej) => { ws.onopen = () => res({ send, evaluate, waitFor, on: (f) => listeners.push(f), close: () => ws.close() }); ws.onerror = rej; });
}

const checks = [];
const check = (ok, name, detail = '') => { checks.push({ ok: !!ok, name }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const numbers = {};

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = await launch();
let exitCode = 0;
try {
  const page = await cdp(chrome.wsUrl);
  const exc = [];
  page.on((m) => { if (m.method === 'Runtime.exceptionThrown') exc.push((m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').slice(0, 500)); });
  await page.send('Runtime.enable'); await page.send('Page.enable');
  const shots = [];
  const shot = async (name, label, clip = null) => {
    await sleep(500);
    const d = (await page.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { scale: 1, ...clip } } : {}) })).data;
    fs.writeFileSync(path.join(SHOT_DIR, `${name}.png`), Buffer.from(d, 'base64'));
    shots.push({ name, label, w: clip?.width ?? 1600, h: clip?.height ?? 1041 });
  };
  const mouse = async (type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'none', buttons: 0, ...extra });
  const E = (expr) => page.evaluate(`(() => { ${expr} })()`);

  // ── nowa gra z flagami (jak probe-cs8c) ──
  await page.send('Page.navigate', { url: `${base}/index.html` });
  await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł');
  for (const f of ['colonySphere', 'sharedSurface', 'seededSystems', 'realisticClimate', 'scaledOrbits']) await page.evaluate(`KOSMOS.gameConfig.FEATURES.${f} = true`);
  await page.evaluate(`document.querySelector('[data-action="new"]').click(), true`);
  await page.waitFor(`!!document.querySelector('.fs-leader-card')`, 'lider');
  await page.evaluate(`document.querySelector('.fs-leader-card').click(), true`);
  await page.waitFor(`!!document.querySelector('#fs-start')`, 'start');
  await page.evaluate(`document.querySelector('#fs-start').click(), true`);
  await page.waitFor(`!!window.KOSMOS?.surfaceCache && !!window.KOSMOS?.gameScene`, 'GameScene');
  await page.waitFor(`window.KOSMOS?.gameScene?._introLockActive === false`, 'koniec intro', 240000);
  await sleep(2500);
  for (let i = 0, clean = 0; i < 40 && clean < 4; i++) {
    const what = await page.evaluate(`(() => {
      const key = (k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, bubbles: true, cancelable: true }));
      if (document.querySelector('.tw-block')) { key('Escape'); return 'narracja'; }
      const inp = [...document.querySelectorAll('body > div input')].find(e => e.offsetParent !== null);
      if (inp) { key('Enter'); return 'pole'; }
      return null;
    })()`);
    clean = what ? 0 : clean + 1;
    await sleep(600);
  }
  await page.waitFor(`!!KOSMOS.colonyManager?.getColony?.(KOSMOS.homePlanet?.id)`, 'kolonia macierzysta', 60000);
  await E(`const ts = KOSMOS.timeSystem; if (ts && !ts.isPaused) (ts.pause?.() ?? (ts.isPaused = true)); return true;`);
  await page.waitFor(`typeof window.csCity === 'function'`, 'pomocniki CS-9', 20000);

  // ── kolonia rozbudowana pomocnikiem właściciela ──
  await E(`KOSMOS.overlayManager.openPanel('colony'); KOSMOS.uiManager._dirty = true; return true;`);
  await page.waitFor(`!!KOSMOS.overlayManager.overlays.colony._sphere?.renderer?.topo`, 'kula', 60000);
  const city = await E(`return csCity();`);
  check(city && city.buildings >= 21, 'csCity: kolonia rozbudowana (20+ budynków)', JSON.stringify({ b: city?.buildings, placed: city?.placed?.length, lv: city?.levels, cons: city?.constructions, up: city?.upgrade, dmg: city?.damaged }));
  numbers.city = city;
  await page.waitFor(`KOSMOS.overlayManager.overlays.colony._sphere.renderer.info().mapPhase === 'hero'`, 'mapa bohatera', 90000).catch(() => {});
  const ov = `KOSMOS.overlayManager.overlays.colony`;
  const hero = await E(`const o = ${ov}; const k = Math.min(innerWidth / 1280, innerHeight / 720); const z = o.consoleZones?.hero ?? o._getMapBounds?.(); return z ? { x: z.x * k, y: z.y * k, width: z.w * k, height: z.h * k } : null;`);
  check(!!hero && hero.width > 300, 'strefa bohatera konsoli', JSON.stringify(hero));
  const cx = hero.x + hero.width / 2, cy = hero.y + hero.height / 2;
  const hold = async () => { await E(`${ov}._selectedTile = null; KOSMOS.uiManager._dirty = true; return true;`); await mouse('mouseMoved', cx, cy); await sleep(120); await mouse('mouseMoved', 5, 5); await sleep(120); };   // kursor zszedł z kuli: auto-obrót rusza dopiero po 1,2 s — ujęcie jest wcześniej, bez dymka pola
  const zoom = async (steps) => { for (let i = 0; i < Math.abs(steps); i++) { await mouse('mouseWheel', cx, cy, { deltaX: 0, deltaY: steps > 0 ? -240 : 240 }); await sleep(60); } await sleep(900); };
  const info = () => E(`return csBuildings();`);

  // ── trzy poziomy zoomu ──
  await E(`csDay(); return true;`); await hold(); await zoom(-30);
  await shot('zoom-far', 'Zoom 1 — cała tarcza (daleko)', hero);
  const far = await info();
  await zoom(2);
  await shot('zoom-mid', 'Zoom 2 — środek', hero);
  const mid = await info();
  await zoom(30);
  await shot('zoom-near', 'Zoom 3 — najbliżej (portrety 256 / 512 px ostre)', hero);
  const near = await info();
  check(far.sphere.portraits + far.sphere.dots >= 10 && near.sphere.portraits >= 1 && near.sphere.atlas.errors === 0, 'portrety na trzech poziomach zoomu',
    `daleko ${far.sphere.portraits}p/${far.sphere.dots}k, środek ${mid.sphere.portraits}p/${mid.sphere.dots}k, blisko ${near.sphere.portraits}p; atlas ${JSON.stringify(near.sphere.atlas)}`);
  numbers.zoom = { far: far.sphere, mid: mid.sphere, near: near.sphere };

  // ── A/B barwy kategorii ──
  await zoom(-30); await zoom(2); await hold();
  await shot('tint-subtle', 'B (domyślne) — barwa kategorii: cienki obrys pola + podstawa', hero);
  const t1 = await E(`return csTint();`);
  await hold();
  await shot('tint-full', 'A — pełne podbarwienie pola (jak CS-7)', hero);
  const t2 = await E(`return csTint();`);
  check(t1 === 'full' && t2 === 'subtle', 'csTint przełącza wariant A/B i wraca do domyślnego', `${t1} → ${t2}`);

  // ── stany: budowa / rozbudowa / uszkodzony / poziomy ──
  const stTile = await E(`const c = ${ov}._getColony(); const i = c.grid.tiles.findIndex(t => t.underConstruction && !t.buildingId); ${ov}._sphere.renderer.turnTo(i); KOSMOS.uiManager._dirty = true; return i;`);
  await sleep(1200); await zoom(-30); await zoom(4); await hold();
  await shot('states-site', 'Stany — plac budowy (odbarwiony portret + pierścień postępu)', hero);
  await E(`csDay(); return true;`); await sleep(400); await zoom(-30); await zoom(3); await hold();
  await shot('states-city', 'Stany — poziomy (pipsy), rozbudowa (pierścień), uszkodzone (czerwień), stolica, znak kategorii bez PNG', hero);
  const st = await info();
  check(stTile >= 0 && st.constructions >= 2 && st.damaged >= 2, 'stany obecne w kolonii (budowy, uszkodzenia)', `budowy ${st.constructions}, uszkodzone ${st.damaged}`);

  // ── nocny sierp: światła miast ──
  await E(`csDots(); return true;`); await zoom(-30); await hold();
  await shot('lod-dots', 'LOD z daleka (podgląd csDots — dzisiejszy zakres kamery nie schodzi poniżej 13 px na pole): kropki kategorii, stolica zostaje', hero);
  const dots = await info(); await E(`csDots(); return true;`);
  check(dots.sphere.dots >= 10 && dots.sphere.portraits === 1, 'LOD: kropki kategorii zamiast portretów, stolica zostaje portretem', `${dots.sphere.dots} kropek, ${dots.sphere.portraits} portret`);
  await zoom(-30);
  const night = await E(`return csNight();`);
  await hold();
  await shot('night-far', 'Nocny sierp — światła miast (stolica na nocnej stronie)', hero);
  await hold();
  await shot('night-near', 'Nocny sierp — powiększenie 2× prawej części kadru', { x: hero.x + hero.width * 0.52, y: hero.y + hero.height * 0.18, width: hero.width * 0.46, height: hero.height * 0.64, scale: 2 });
  const ni = await info();
  check(night && night.capitalSunDot < -0.05 && ni.hero?.cityLights && ni.hero?.cityMesh && ni.sphere.lights.lit >= 20, 'światła miast na nocnej stronie kuli',
    `stolica·słońce ${night?.capitalSunDot}, świecących pól ${ni.sphere.lights.lit}, mnożnik kolonii ${ni.sphere.lights.factor.toFixed(2)}`);
  numbers.lights = ni.sphere.lights;

  // ── pomiar klatek: auto-obrót i przeciąganie, 30+ budynków ──
  await E(`csDay(); ${ov}._sphere.renderer.setMeasureSync(true); return true;`); await zoom(-30);
  const frames = (ms) => page.evaluate(`new Promise(res => { const d = []; let last = 0, t0 = performance.now(); const r0 = ${ov}._sphere.renderer.info().renders, f0 = ${ov}._sphere.markerInfo().frames;
    ${ov}._sphere._markerStats.ms.length = 0;
    const f = (t) => { if (last) d.push(t - last); last = t; if (performance.now() - t0 < ${ms}) requestAnimationFrame(f); else { d.sort((a, b) => a - b); const m = ${ov}._sphere.markerInfo(), i = ${ov}._sphere.renderer.info();
      res({ frames: d.length, frameMedian: d[d.length >> 1], frameP95: d[Math.floor(d.length * 0.95)], sphereRenders: i.renders - r0, sphereRenderMs: i.renderMsMedian, markerPasses: m.frames - f0, markerMsMedian: m.msMedian, markerMsMax: m.msMax, portraits: m.portraits, dots: m.dots }); } };
    requestAnimationFrame(f); })`);
  await E(`${ov}._selectedTile = null; KOSMOS.uiManager._dirty = true; return true;`);
  await mouse('mouseMoved', 5, 5); await sleep(4200);   // kursor poza kulą → po przerwie rusza auto-obrót
  const spin = await frames(3000);
  await mouse('mouseMoved', cx - 120, cy); await mouse('mousePressed', cx - 120, cy, { button: 'left', buttons: 1, clickCount: 1 });
  const dragging = (async () => { for (let i = 0; i < 170; i++) { await mouse('mouseMoved', cx - 120 + (i % 60) * 4, cy + Math.sin(i / 9) * 30, { button: 'left', buttons: 1 }); await sleep(16); } })();
  const drag = await frames(2600);
  await dragging; await mouse('mouseReleased', cx, cy, { button: 'left', buttons: 0, clickCount: 1 });
  await E(`${ov}._sphere.renderer.setMeasureSync(false); return true;`);
  numbers.perf = { spin, drag, buildings: city.buildings };
  console.log('[cs9] auto-obrót', JSON.stringify(spin)); console.log('[cs9] przeciąganie', JSON.stringify(drag));
  check(spin.portraits + spin.dots >= 12 && spin.sphereRenders >= 30 && spin.markerMsMedian < 4 && drag.sphereRenders >= 60 && drag.markerMsMedian < 4, 'koszt klatki: przebieg billboardów < 4 ms przy auto-obrocie i przeciąganiu',
    `obrót: klatka ${spin.frameMedian.toFixed(1)} ms (p95 ${spin.frameP95.toFixed(1)}), znaczniki ${spin.markerMsMedian.toFixed(2)} ms; przeciąganie: klatka ${drag.frameMedian.toFixed(1)} ms (p95 ${drag.frameP95.toFixed(1)}), znaczniki ${drag.markerMsMedian.toFixed(2)} ms`);

  // ── 5 motywów (jedna klatka, cały ekran) ──
  const theme = (name) => page.evaluate(`import('/src/config/ThemeConfig.js').then(m => { m.applyPreset(m.PRESET_THEMES[${JSON.stringify(name)}]); KOSMOS.uiManager._dirty = true; return true; })`);
  await E(`csDay(); return true;`); await zoom(-30); await zoom(1);
  for (const th of THEMES) { await theme(th); await hold(); await shot(`t-${th}`, th); }
  await theme(THEMES[0]);

  // ── mapa układu: światła na nocnej stronie + ikony budynków (Finding 784) ──
  await E(`KOSMOS.overlayManager.closeActive(); KOSMOS.eventBus?.emit?.('body:selected', { entity: KOSMOS.homePlanet }); KOSMOS.timeSystem.play(); return true;`);
  await sleep(2500);
  const sysOk = await page.evaluate(`new Promise(res => { const tr = KOSMOS.threeRenderer, id = KOSMOS.homePlanet.id, e = tr._planets.get(id), cc = tr._cameraController;
    const r = tr._getEntityRadius(KOSMOS.homePlanet), P = e.group.position;
    let best = null;
    for (let th = 0; th < 6.283; th += 0.1) { cc.applyView({ theta: th, phi: 1.25, dist: r * 5.2 }); cc.update(); tr.camera.updateMatrixWorld();
      const c = tr.camera.position, vx = c.x - P.x, vy = c.y - P.y, vz = c.z - P.z, vl = Math.hypot(vx, vy, vz), sl = Math.hypot(P.x, P.y, P.z);
      const cos = (vx * -P.x + vy * -P.y + vz * -P.z) / (vl * sl); const score = Math.abs(cos - (-0.45)); if (!best || score < best.score) best = { th, score, cos }; }
    cc.applyView({ theta: best.th, phi: 1.25, dist: r * 5.2 });
    const col = KOSMOS.colonyManager.getColony(id), cap = col.grid.tiles.findIndex(t => t.capitalBase);
    import('/src/map/GeodesicTopology.js').then(({ geodesicTopology }) => { const topo = geodesicTopology(col.grid.n); const t0 = performance.now();
      const tick = () => { e.mesh.updateMatrixWorld(true); const m = e.mesh.matrixWorld.elements, x = topo.cx[cap], y = topo.cy[cap], z = topo.cz[cap];
        const wx = m[0] * x + m[4] * y + m[8] * z, wy = m[1] * x + m[5] * y + m[9] * z, wz = m[2] * x + m[6] * y + m[10] * z, wl = Math.hypot(wx, wy, wz);
        const c = tr.camera.position, vx = c.x - P.x, vy = c.y - P.y, vz = c.z - P.z, vl = Math.hypot(vx, vy, vz), sl = Math.hypot(P.x, P.y, P.z);
        const sun = (wx * -P.x + wy * -P.y + wz * -P.z) / (wl * sl), cam = (wx * vx + wy * vy + wz * vz) / (wl * vl);
        if ((sun < -0.25 && cam > 0.55) || performance.now() - t0 > 70000) res({ sun, cam, cos: best.cos, waited: performance.now() - t0 }); else requestAnimationFrame(tick); };
      tick(); }); })`);
  await E(`KOSMOS.timeSystem.pause(); return true;`);
  await shot('system-map', 'Mapa układu — ikony budynków kolonii geo (Finding 784) + światła miasta na nocnej stronie');
  const sys = await info();
  const litPx = await E(`const m = KOSMOS.threeRenderer._planets.get(KOSMOS.homePlanet.id).mesh.children.find(c => c.userData?.isCityLights); return m ? { visible: m.visible, parentIsMesh: true } : null;`);
  check(sysOk.sun < -0.2 && sysOk.cam > 0.5 && sys.systemMap?.bodies?.includes(await E(`return KOSMOS.homePlanet.id;`)) && !!litPx && sys.mapIcons >= 20, 'mapa układu: powłoka świateł na ciele kolonii geo + ikony budynków (784)',
    `stolica·słońce ${sysOk.sun.toFixed(2)}, stolica·kamera ${sysOk.cam.toFixed(2)}, ikon ${sys.mapIcons}, ${JSON.stringify(sys.systemMap)}`);
  numbers.systemMap = { ...sys.systemMap, icons: sys.mapIcons };
  const pc = await E(`const tr = KOSMOS.threeRenderer, v = tr._planets.get(KOSMOS.homePlanet.id).group.position.clone().project(tr.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };`);
  await E(`KOSMOS.eventBus?.emit?.('body:deselected', {}); return true;`);
  await shot('system-lights', 'Mapa układu — same światła miasta (ciało odznaczone, powiększenie 2×)', { x: Math.max(0, pc.x - 230), y: Math.max(0, pc.y - 230), width: 460, height: 460, scale: 2 });

  // ── arkusz ──
  const row = (names) => names.map(n => shots.find(s => s.name === n)).filter(Boolean).map(s => ({ src: `/__shot/${s.name}.png`, label: s.label, w: s.w, h: s.h }));
  const rows = [
    { title: 'Rozwinięta kolonia (' + city.buildings + ' budynków) — trzy poziomy zoomu', items: row(['zoom-far', 'zoom-mid', 'zoom-near']), per: 3 },
    { title: 'A/B barwy kategorii — domyślnie B (cienki obrys + podstawa; grafika właściciela nie jest podbarwiana)', items: row(['tint-full', 'tint-subtle']), per: 2 },
    { title: 'Stany budynku', items: row(['states-site', 'states-city']), per: 2 },
    { title: 'Nocny sierp — światła miast', items: row(['night-far', 'night-near']), per: 2 },
    { title: 'LOD — z daleka kropki w barwie kategorii', items: row(['lod-dots']), per: 2 },
    { title: 'Mapa układu — światła + ikony budynków kolonii geo (Finding 784)', items: row(['system-map', 'system-lights']), per: 2 },
    { title: '5 motywów — ta sama klatka', items: row(THEMES.map(t => `t-${t}`)), per: 5 },
  ];
  await page.send('Page.navigate', { url: `${base}/__sheet` });
  await page.waitFor(`!!document.getElementById('c')`, 'arkusz');
  const data = await page.evaluate(`(async () => {
    const R = ${JSON.stringify(rows)};
    const W = 2400, PAD = 12, LAB = 24, HEAD = 40;
    const lay = R.map(r => { const tw = Math.floor((W - PAD * (r.per + 1)) / r.per); const th = Math.max(...r.items.map(i => Math.round(tw * i.h / i.w))); return { tw, th, lines: Math.ceil(r.items.length / r.per) }; });
    const c = document.getElementById('c'); c.width = W; c.height = HEAD + lay.reduce((s, l) => s + HEAD + l.lines * (l.th + LAB + PAD), 0) + PAD;
    const x = c.getContext('2d'); x.fillStyle = '#05070b'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#e8eef5'; x.font = 'bold 22px sans-serif'; x.textBaseline = 'middle'; x.fillText('KOSMOS CS-9 — budynki jako portrety właściciela na kuli kolonii + światła miast', PAD, HEAD / 2);
    let y = HEAD;
    for (let k = 0; k < R.length; k++) { const r = R[k], l = lay[k];
      x.fillStyle = '#cfd8e3'; x.font = 'bold 17px sans-serif'; x.fillText(r.title, PAD, y + HEAD / 2); y += HEAD;
      for (let i = 0; i < r.items.length; i++) { const it = r.items[i], cx = PAD + (i % r.per) * (l.tw + PAD), cy = y + Math.floor(i / r.per) * (l.th + LAB + PAD);
        x.fillStyle = '#9fb4c8'; x.font = '13px sans-serif'; x.fillText(it.label, cx + 2, cy + LAB / 2);
        const img = new Image(); img.src = it.src; await img.decode(); x.imageSmoothingQuality = 'high'; const h = Math.round(l.tw * it.h / it.w); x.drawImage(img, cx, cy + LAB, l.tw, h);
        x.strokeStyle = '#27323f'; x.strokeRect(cx + 0.5, cy + LAB + 0.5, l.tw - 1, h - 1); }
      y += l.lines * (l.th + LAB + PAD); }
    return c.toDataURL('image/png');
  })()`);
  const out = path.join(OUT_DIR, 'cs9-buildings.png');
  fs.writeFileSync(out, Buffer.from(String(data).replace(/^data:image\/png;base64,/, ''), 'base64'));
  console.log('[cs9] zapisano', path.relative(REPO, out).replace(/\\/g, '/'), fs.statSync(out).size, 'B');
  fs.writeFileSync(path.join(SHOT_DIR, 'cs9-numbers.json'), JSON.stringify(numbers, null, 1));

  const realExc = exc.filter(e => !/AudioContext is closed/.test(e));
  if (realExc.length) { console.log('WYJĄTKI STRONY:'); for (const e of [...new Set(realExc)].slice(0, 8)) console.log('  ' + e.replace(/\n/g, ' | ')); }
  check(realExc.length === 0, 'brak wyjątków strony', `${realExc.length}`);
  const fail = checks.filter(c => !c.ok).length;
  console.log(`\n[cs9] kontrole: ${checks.length - fail} PASS / ${fail} FAIL   (ujęcia: ${SHOT_DIR})`);
  exitCode = fail ? 1 : 0;
} catch (e) {
  console.error('[cs9] BŁĄD:', e?.stack ?? e);
  exitCode = 2;
} finally {
  try { chrome.proc.kill(); } catch { /* nic */ }
  server.close();
  await sleep(300);
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* Chrome trzyma pliki */ }
}
process.exit(exitCode);
