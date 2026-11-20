// probe-cs10-units — prawdziwa gra (headless Chrome przez CDP, 1600×1041): jednostki naziemne na kuli kolonii — modele GLB
// z bliska, zwarte znaczniki z daleka, stos, marsz po wielkim kole (3 klatki), bitwa, desant, 5 motywów, pomiar klatek z 20+
// jednostkami, model zaopatrzenia przed / po odchudzeniu. Plan COLONY_SPHERE §3.19.
// Zapisuje arkusz docs/design/prototypes/cs10-units.png i liczby do <ujęcia>/cs10-numbers.json.
//
//   node src/testing/headless/probe-cs10-units.mjs [--out <dir>]

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
const WORK_TILE_PX = 100;   // widok roboczy: najmniejsze zbliżenie, przy którym pole ma ≥ tyle px (modele GLB)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const THEMES = ['ss_amber_noir', 'ss_cold_blue', 'ss_galactic_violet', 'ss_neon_cyber', 'ss_biopunk_green'];
const SHOT_DIR = arg('--out') ? path.resolve(arg('--out')) : fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs10-shots-'));
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs10-'));
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
  await page.waitFor(`typeof window.csUnits === 'function'`, 'pomocniki CS-10', 20000);

  // ── kolonia z budynkami (CS-9) + jednostki pomocnikiem właściciela ──
  await E(`KOSMOS.overlayManager.openPanel('colony'); KOSMOS.uiManager._dirty = true; return true;`);
  await page.waitFor(`!!KOSMOS.overlayManager.overlays.colony._sphere?.renderer?.topo`, 'kula', 60000);
  const city = await E(`return csCity();`);
  await page.waitFor(`KOSMOS.overlayManager.overlays.colony._sphere.renderer.info().mapPhase === 'hero'`, 'mapa bohatera', 90000).catch(() => {});
  const ov = `KOSMOS.overlayManager.overlays.colony`;
  const hero = await E(`const o = ${ov}; const k = Math.min(innerWidth / 1280, innerHeight / 720); const z = o.consoleZones?.hero ?? o._getMapBounds?.(); return z ? { x: z.x * k, y: z.y * k, width: z.w * k, height: z.h * k } : null;`);
  check(!!hero && hero.width > 300, 'strefa bohatera konsoli', JSON.stringify(hero));
  const cx = hero.x + hero.width / 2, cy = hero.y + hero.height / 2;
  const redraw = `KOSMOS.uiManager._dirty = true;`;
  const hold = async () => { await E(`${ov}._selectedTile = null; ${redraw} return true;`); await mouse('mouseMoved', cx, cy); await sleep(120); await mouse('mouseMoved', 5, 5); await sleep(120); };
  const zoom = async (steps) => { for (let i = 0; i < Math.abs(steps); i++) { await mouse('mouseWheel', cx, cy, { deltaX: 0, deltaY: steps > 0 ? -240 : 240 }); await sleep(60); } await sleep(900); };
  const info = async () => { await E(`${redraw} return true;`); await sleep(250); return E(`return csUnitInfo();`); };
  const settle = async (label) => {
    for (let i = 0; i < 120; i++) { const u = await info(); if (!Object.values(u.layer.states).includes('loading')) return u; await sleep(250); }
    throw new Error('modele nie doładowały się: ' + label);
  };

  const placed = await E(`return csUnits();`);
  const lay = await E(`const col = ${ov}._getColony(), T = ${ov}._sphere.renderer.topo, cap = col.grid.tiles.findIndex(t => t.capitalBase); const us = KOSMOS.groundUnitManager.getUnitsOnPlanet(col.planetId);
    return { city: ${JSON.stringify(city?.buildings ?? null)}, land: col.grid.tiles.filter(t => t.type !== 'ocean').length, tiles: col.grid.tiles.length, cap, unitDist: us.map(u => T.distance(cap, u.q)).sort((a, b) => a - b) };`);
  console.log('[cs10] kolonia', JSON.stringify(lay));
  numbers.colony = lay;
  check(placed && placed.placed >= 12 && placed.stackOf3 && placed.onBuilding && placed.garrisonDeployed && placed.garrisonMobile, 'csUnits: zestaw jednostek przy stolicy', JSON.stringify(placed));
  await E(`csUnitLod(); return true;`);   // zawsze modele → wczytanie plików
  const loaded = await settle('csUnits');
  const states = Object.entries(loaded.layer.states);
  check(states.filter(([, s]) => s === 'ready').length >= 8 && !loaded.layer.failed, 'modele GLB wczytane z pamięci szablonów (≥ 8 typów)', JSON.stringify(loaded.layer.states));
  check(states.some(([k, s]) => /garrison_deployed/.test(k) && s === 'ready') && states.some(([k, s]) => /garrison_mobile/.test(k) && s === 'ready'), 'warianty _mobile / _deployed: oba modele garnizonu na kuli');
  await E(`csUnitLod(); csUnitLod(); return true;`);   // → znaczniki → auto

  // ── zoom: daleko (znaczniki) / blisko (modele) ──
  await E(`${ov}._sphere.renderer.turnTo(${JSON.stringify(0)} + (KOSMOS.groundUnitManager.getUnitsOnPlanet(${ov}._getColony().planetId)[0]?.q ?? 0)); return true;`); await sleep(1500); await hold(); await zoom(-30);
  const far = await info();
  await shot('far', `Cała tarcza — pole ${far.tilePx.toFixed(0)} px: zwarte znaczniki z licznikiem stosu`, hero);
  await zoom(2);
  const mid = await info();
  await shot('mid', `Zoom +2 — pole ${mid.tilePx.toFixed(0)} px`, hero);
  await zoom(30);
  const near = await info();
  await shot('near', `Najbliżej — pole ${near.tilePx.toFixed(0)} px: modele GLB`, hero);
  numbers.zoom = { far, mid, near };
  console.log('[cs10] zoom', JSON.stringify({ far: [far.tilePx, far.lod, far.models, far.markers], mid: [mid.tilePx, mid.lod, mid.models, mid.markers], near: [near.tilePx, near.lod, near.models, near.markers] }));
  check(far.lod === 'marker' && far.markers >= 8 && far.models === 0 && near.lod === 'model' && near.models >= 1, 'LOD: daleko znaczniki, blisko modele',
    `daleko ${far.tilePx.toFixed(0)} px → ${far.lod} (${far.markers} znaczników), blisko ${near.tilePx.toFixed(0)} px → ${near.lod} (${near.models} modeli)`);

  // widok roboczy: środek zakresu z modelami
  const focus = await E(`const col = ${ov}._getColony(); const us = KOSMOS.groundUnitManager.getUnitsOnPlanet(col.planetId).filter(u => !u.owner || u.owner === 'player'); const T = ${ov}._sphere.renderer.topo;
    let best = us[0].q, bs = Infinity; for (const u of us) { const s = us.reduce((a, v) => a + T.distance(u.q, v.q), 0); if (s < bs) { bs = s; best = u.q; } } return best;`);
  const work = async () => { await hold(); await zoom(-30); for (let i = 0; i < 8; i++) { const t = await E(`return ${ov}._sphere.renderer.tileScreenSize({ x: 0, y: 0, w: ${ov}.consoleZones.hero.w, h: ${ov}.consoleZones.hero.h });`); if (t >= WORK_TILE_PX) break; await zoom(1); } await E(`${ov}._sphere.renderer.turnTo(${focus}); return true;`); await sleep(1500); await mouse('mouseMoved', cx, cy); await sleep(80); await mouse('mouseMoved', 5, 5); await sleep(150); };
  await work();
  const w0 = await info();
  await shot('work', `Widok roboczy — pole ${w0.tilePx.toFixed(0)} px: jednostki przy portretach budynków, stos ×3`, hero);
  check(w0.lod === 'model' && w0.models >= 8 && w0.layer.drawCalls <= w0.layer.groups && w0.layer.instances >= w0.layer.groups + 2, 'instancje: jedna grupa = jedno wywołanie rysowania, stos piechoty w jednej grupie',
    JSON.stringify({ models: w0.models, groups: w0.layer.groups, calls: w0.layer.drawCalls, instances: w0.layer.instances, tris: w0.layer.triangles }));

  // ── marsz po wielkim kole ──
  const mv = await E(`return csUnitMove();`);
  check(mv && mv.ordered && mv.steps >= 2, 'csUnitMove: rozkaz marszu', JSON.stringify(mv));
  if (!mv?.ordered) throw new Error('brak marszu');
  const U = `KOSMOS.groundUnitManager._units.get(${JSON.stringify(mv.unit)})`;
  const unitState = () => E(`const u = ${U}; return u ? { q: u.q, t: u._animT, status: u.status, left: u._path?.length ?? 0 } : null;`);
  const s0 = await unitState();
  await E(`const ts = KOSMOS.timeSystem; ts.play?.() ?? (ts.isPaused = false); return true;`);
  let s1 = s0;
  for (let i = 0; i < 80; i++) { await sleep(150); s1 = await unitState(); if (s1.q !== s0.q || s1.t > 0.3) break; }
  await E(`const ts = KOSMOS.timeSystem; ts.pause?.() ?? (ts.isPaused = true); return true;`);
  check(s1 && s1.status === 'moving' && (s1.q !== s0.q || s1.t > 0.05), 'marsz: jednostka idzie krokami gry (prawdziwy tick)', JSON.stringify({ s0, s1 }));
  const pos = async (t) => E(`const u = ${U}; u._animT = ${t}; ${redraw}
    const f = () => { const it = ${ov}._sphere.units._frame?.placement.items.find(i => i.id === u.id); return it ? { dir: it.dir, heading: it.heading, moving: it.moving, from: u.q, to: u._path[0]?.q } : null; };
    return new Promise(r => setTimeout(() => r(f()), 300));`);
  await E(`${ov}._sphere.renderer.turnTo(${U}.q); return true;`); await sleep(1400);
  const arc = [];
  for (const t of [0.15, 0.5, 0.85]) { arc.push(await pos(t)); await shot(`move-${Math.round(t * 100)}`, `Marsz — krok po wielkim kole, t = ${t}`, hero); }
  const ends = await E(`const u = ${U}; const T = ${ov}._sphere.renderer.topo; const c = (i) => [T.cx[i], T.cy[i], T.cz[i]]; return { a: c(u.q), b: c(u._path[0].q) };`);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = cr(ends.a, ends.b);
  const onArc = arc.every(p => p && p.moving && Math.abs(dot(p.dir, nrm)) < 1e-6 && Math.abs(Math.hypot(...p.dir) - 1) < 1e-9 && dot(p.heading, ends.b) > 0);
  check(onArc, 'marsz: trzy klatki leżą na wielkim kole między środkami pól, zwrot ku celowi', JSON.stringify(arc.map(p => p && dot(p.dir, nrm).toExponential(1))));
  numbers.move = { order: mv, tick: { s0, s1 }, arc };

  // ── bitwa ──
  const battle = await E(`return csUnitBattle();`);
  await settle('bitwa');
  const b1 = await info();
  check(battle && b1.battles >= 1, 'csUnitBattle: pole sporne ze znacznikiem bitwy', JSON.stringify({ battle, battles: b1.battles }));
  await E(`${ov}._sphere.renderer.turnTo(${battle.tile}); return true;`); await sleep(1400);
  await shot('battle', 'Bitwa — pole sporne: strony naprzeciw siebie, znacznik bitwy, liczniki stron', hero);

  // ── lądowanie desantu ──
  const landing = await E(`return csUnitLanding();`);
  check(landing && landing.landed === 3, 'csUnitLanding: trzy obce jednostki lądują (strefa lądowania albo — gdy całe ciało zajęte — reguła zapasowa gry)', JSON.stringify(landing));
  const zoneOk = await page.evaluate(`import('/src/map/TileGraph.js').then(m => { const g = m.tileGraphOf(${ov}._getColony().grid); const held = g.tiles().filter(t => t.owner != null || t.buildingId != null || t.underConstruction != null || t.capitalBase).map(t => t.q);
    return ${JSON.stringify(landing.tiles)}.map(i => Math.min(...held.map(h => g.topo.distance(i, h)))); })`);
  check(landing.landingZoneTiles === 0 || zoneOk.every(d => d >= 2), 'strefa lądowania: ≥ 2 pola od zajętych (gdy strefa istnieje)', JSON.stringify({ zoneOk, zone: landing.zone }));
  await settle('desant');
  await E(`${ov}._sphere.renderer.turnTo(${landing.tiles[0]}); return true;`);
  await sleep(1500);
  const again = `${ov}._sphere.units.noteLanding(KOSMOS.groundUnitManager.getUnitsOnPlanet(${ov}._getColony().planetId).filter(u => ${JSON.stringify(landing.tiles)}.includes(u.q) && u.owner !== 'player').map(u => u.id)); ${redraw} return true;`;
  await E(again);
  await sleep(100);
  const l1 = await E(`return csUnitInfo();`);
  await shot('landing-drop', 'Desant — modele opadają na pola strefy lądowania', hero);
  await sleep(1100);
  await shot('landing-down', 'Desant — po lądowaniu: znacznik lądowania gaśnie', hero);
  check(l1.landing >= 1, 'lądowanie: efekt aktywny po zdarzeniu', JSON.stringify({ landing: l1.landing }));

  // ── daleki widok ze wszystkim ──
  await E(`${ov}._sphere.renderer.turnTo(${JSON.stringify(0)} + (KOSMOS.groundUnitManager.getUnitsOnPlanet(${ov}._getColony().planetId)[0]?.q ?? 0)); return true;`); await sleep(1500); await hold(); await zoom(-30);
  await shot('far-all', 'Cała tarcza — znaczniki: własne, obce, stos, bitwa', hero);

  // ── pomiar klatek: 20+ jednostek, auto-obrót i przeciąganie ──
  await E(`csUnitBattle(); return true;`);
  await settle('pomiar');
  await work();
  await E(`${ov}._sphere.renderer.setMeasureSync(true); return true;`);
  const frames = (ms) => page.evaluate(`new Promise(res => { const d = []; let last = 0, t0 = performance.now(); const sp = ${ov}._sphere, r = sp.renderer; const r0 = r.info().renders, p0 = r.info().units.passes;
    r._unitMs.length = 0; r._renderMs.length = 0; sp.units._stats.ms.length = 0; sp._markerStats.ms.length = 0;
    const f = (t) => { if (last) d.push(t - last); last = t; if (performance.now() - t0 < ${ms}) requestAnimationFrame(f); else { d.sort((a, b) => a - b); const i = r.info(), u = sp.units.info(), m = sp.markerInfo();
      res({ frames: d.length, frameMedian: d[d.length >> 1], frameP95: d[Math.floor(d.length * 0.95)], sphereRenders: i.renders - r0, sphereRenderMs: i.renderMsMedian, unitPasses: i.units.passes - p0,
        unitPassMs: i.units.passMsMedian, hudMs: u.hudMsMedian, billboardMs: m.msMedian, units: u.units, models: u.models, markers: u.markers, instances: i.units.instances, drawCalls: i.units.drawCalls, triangles: i.units.triangles, lod: u.lod, tilePx: u.tilePx }); } };
    requestAnimationFrame(f); })`);
  const measure = async () => {
    await E(`${ov}._selectedTile = null; ${redraw} return true;`);
    await mouse('mouseMoved', 5, 5); await sleep(4200);
    const spin = await frames(3000);
    await mouse('mouseMoved', cx - 120, cy); await mouse('mousePressed', cx - 120, cy, { button: 'left', buttons: 1, clickCount: 1 });
    const dragging = (async () => { for (let i = 0; i < 170; i++) { await mouse('mouseMoved', cx - 120 + (i % 60) * 4, cy + Math.sin(i / 9) * 30, { button: 'left', buttons: 1 }); await sleep(16); } })();
    const drag = await frames(2600);
    await dragging; await mouse('mouseReleased', cx, cy, { button: 'left', buttons: 0, clickCount: 1 });
    return { spin, drag };
  };
  const withModels = await measure();
  await E(`csUnitLod(); csUnitLod(); return true;`);   // znaczniki zamiast modeli — odniesienie
  await work();
  const withMarkers = await measure();
  await E(`csUnitLod(); ${ov}._sphere.renderer.setMeasureSync(false); return true;`);
  numbers.perf = { withModels, withMarkers };
  console.log('[cs10] modele   ', JSON.stringify(withModels)); console.log('[cs10] znaczniki', JSON.stringify(withMarkers));
  const pm = withModels.spin, pd = withModels.drag;
  check(pm.units >= 20 && pm.models >= 14 && pm.sphereRenders >= 30 && pd.sphereRenders >= 60 && pm.unitPassMs < 8 && pd.unitPassMs < 8 && pm.hudMs < 3, 'koszt klatki z 20+ jednostkami: przebieg modeli < 8 ms, HUD < 3 ms',
    `obrót: klatka ${pm.frameMedian.toFixed(1)} ms (p95 ${pm.frameP95.toFixed(1)}), modele ${pm.unitPassMs?.toFixed(2)} ms, kula ${pm.sphereRenderMs?.toFixed(2)} ms, HUD ${pm.hudMs?.toFixed(2)} ms; przeciąganie: klatka ${pd.frameMedian.toFixed(1)} ms (p95 ${pd.frameP95.toFixed(1)}), modele ${pd.unitPassMs?.toFixed(2)} ms; ${pm.units} jednostek, ${pm.instances} instancji, ${pm.drawCalls} wywołań, ${pm.triangles} trójkątów`);

  // render na żądanie: kursor na kuli (auto-obrót stoi), nic się nie rusza → zero renderów
  await mouse('mouseMoved', cx, cy); await sleep(900);
  const idle0 = await E(`return ${ov}._sphere.renderer.info().renders;`); await sleep(1500);
  const idle1 = await E(`return ${ov}._sphere.renderer.info().renders;`);
  numbers.idle = { renders: idle1 - idle0 };
  check(idle1 - idle0 <= 16, 'render na żądanie: stojące jednostki nie zamawiają klatek GL', `${idle1 - idle0} renderów w 1,5 s (pogoda ≤ 10 /s)`);
  await mouse('mouseMoved', 5, 5);

  // ── 5 motywów ──
  const theme = (name) => page.evaluate(`import('/src/config/ThemeConfig.js').then(m => { m.applyPreset(m.PRESET_THEMES[${JSON.stringify(name)}]); KOSMOS.uiManager._dirty = true; return true; })`);
  await work();
  for (const th of THEMES) { await theme(th); await hold(); await shot(`t-${th}`, th); }
  await theme(THEMES[0]);

  // ── zaopatrzenie: oryginał vs model po odchudzeniu (ten sam render katalogu, 512 px) ──
  const snap = async (file, name, label) => {
    const d = await page.evaluate(`import('/src/renderer/GlbSnapshotRenderer.js').then(m => m.glbSnapshotRenderer.snapshot(${JSON.stringify(file)}, { size: 512 })).then(c => c.toDataURL('image/png')).catch(e => 'ERR ' + e)`);
    if (String(d).startsWith('ERR')) { check(false, 'render modelu ' + file, d); return; }
    fs.writeFileSync(path.join(SHOT_DIR, `${name}.png`), Buffer.from(String(d).replace(/^data:image\/png;base64,/, ''), 'base64'));
    shots.push({ name, label, w: 512, h: 512 });
  };
  const origDir = path.join(REPO, 'assets/units/ground/_originals');
  const orig = fs.existsSync(origDir) ? fs.readdirSync(origDir).find(f => /humanity__human_supply/.test(f)) : null;
  const sizeOf = (rel) => fs.statSync(path.join(REPO, rel)).size;
  if (orig) await snap(`assets/units/ground/_originals/${orig}`, 'supply-before', `Zaopatrzenie — oryginał ${(sizeOf('assets/units/ground/_originals/' + orig) / 1e6).toFixed(1)} MB (1 267 313 trójkątów)`);
  await snap('assets/units/ground/humanity/human_supply.glb', 'supply-after', `Zaopatrzenie — po odchudzeniu ${(sizeOf('assets/units/ground/humanity/human_supply.glb') / 1e6).toFixed(2)} MB (59 921 trójkątów)`);

  // ── arkusz ──
  const row = (names) => names.map(n => shots.find(s => s.name === n)).filter(Boolean).map(s => ({ src: `/__shot/${s.name}.png`, label: s.label, w: s.w, h: s.h }));
  const rows = [
    { title: 'Jednostki daleko i blisko (D-CS-14: znacznik z daleka, model GLB z bliska)', items: row(['far', 'mid', 'near']), per: 3 },
    { title: 'Przy portretach budynków — stos ×3, garnizon rozłożony i w szyku marszowym, jednostka na polu z budynkiem (stoi przed portretem)', items: row(['work', 'far-all']), per: 2 },
    { title: 'Marsz — krok po wielkim kole między środkami pól (3 klatki), zwrot w kierunku marszu', items: row(['move-15', 'move-50', 'move-85']), per: 3 },
    { title: 'Bitwa na polu spornym · desant w strefie lądowania (≥ 2 pola od zajętych)', items: row(['battle', 'landing-drop', 'landing-down']), per: 3 },
    { title: 'Model zaopatrzenia przed / po odchudzeniu (render katalogu 512 px)', items: row(['supply-before', 'supply-after']), per: 4 },
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
    x.fillStyle = '#e8eef5'; x.font = 'bold 22px sans-serif'; x.textBaseline = 'middle'; x.fillText('KOSMOS CS-10 — jednostki naziemne na kuli kolonii (modele GLB / znaczniki, marsz, bitwa, desant)', PAD, HEAD / 2);
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
  const out = path.join(OUT_DIR, 'cs10-units.png');
  fs.writeFileSync(out, Buffer.from(String(data).replace(/^data:image\/png;base64,/, ''), 'base64'));
  console.log('[cs10] zapisano', path.relative(REPO, out).replace(/\\/g, '/'), fs.statSync(out).size, 'B');
  fs.writeFileSync(path.join(SHOT_DIR, 'cs10-numbers.json'), JSON.stringify(numbers, null, 1));

  const realExc = exc.filter(e => !/AudioContext is closed/.test(e));
  if (realExc.length) { console.log('WYJĄTKI STRONY:'); for (const e of [...new Set(realExc)].slice(0, 8)) console.log('  ' + e.replace(/\n/g, ' | ')); }
  check(realExc.length === 0, 'brak wyjątków strony', `${realExc.length}`);
  const fail = checks.filter(c => !c.ok).length;
  console.log(`\n[cs10] kontrole: ${checks.length - fail} PASS / ${fail} FAIL   (ujęcia: ${SHOT_DIR})`);
  exitCode = fail ? 1 : 0;
} catch (e) {
  console.error('[cs10] BŁĄD:', e?.stack ?? e);
  exitCode = 2;
} finally {
  try { chrome.proc.kill(); } catch { /* nic */ }
  server.close();
  await sleep(300);
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* Chrome trzyma pliki */ }
}
process.exit(exitCode);
