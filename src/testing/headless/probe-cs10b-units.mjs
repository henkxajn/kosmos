// probe-cs10b-units — ARC COLONY SPHERE CS-10b (plan §3.20): dopracowanie jednostek na kuli w PRAWDZIWEJ grze (headless Chrome).
// Pochylenie modeli przed / po na środku tarczy, Ctrl + klik w trzy modele (prawdziwe zdarzenia myszy z modyfikatorem), okno bitwy
// otwarte klikiem w znacznik bitwy, trasa rozkazu ruchu z grotem. Zapis: docs/design/prototypes/cs10b-units.png.
//   node src/testing/headless/probe-cs10b-units.mjs [--out <katalog ujęć>]

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
const SHOT_DIR = arg('--out') ? path.resolve(arg('--out')) : fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs10b-shots-'));
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs10b-'));
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
  console.log('[cs10b] kolonia', JSON.stringify(lay));
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
  console.log('[cs10b] zoom', JSON.stringify({ far: [far.tilePx, far.lod, far.models, far.markers], mid: [mid.tilePx, mid.lod, mid.models, mid.markers], near: [near.tilePx, near.lod, near.models, near.markers] }));
  check(far.lod === 'marker' && far.markers >= 8 && far.models === 0 && near.lod === 'model' && near.models >= 1, 'LOD: daleko znaczniki, blisko modele',
    `daleko ${far.tilePx.toFixed(0)} px → ${far.lod} (${far.markers} znaczników), blisko ${near.tilePx.toFixed(0)} px → ${near.lod} (${near.models} modeli)`);

  // widok roboczy: środek zakresu z modelami
  const focus = await E(`const col = ${ov}._getColony(); const us = KOSMOS.groundUnitManager.getUnitsOnPlanet(col.planetId).filter(u => !u.owner || u.owner === 'player'); const T = ${ov}._sphere.renderer.topo;
    let best = us[0].q, bs = Infinity; for (const u of us) { const s = us.reduce((a, v) => a + T.distance(u.q, v.q), 0); if (s < bs) { bs = s; best = u.q; } } return best;`);
  const work = async () => { await hold(); await zoom(-30); for (let i = 0; i < 8; i++) { const t = await E(`return ${ov}._sphere.renderer.tileScreenSize({ x: 0, y: 0, w: ${ov}.consoleZones.hero.w, h: ${ov}.consoleZones.hero.h });`); if (t >= WORK_TILE_PX) break; await zoom(1); } await E(`${ov}._sphere.renderer.turnTo(${focus}); return true;`); await sleep(1500); await mouse('mouseMoved', cx, cy); await sleep(80); await mouse('mouseMoved', 5, 5); await sleep(150); };
  await work();

  const k = await E(`return Math.min(innerWidth / 1280, innerHeight / 720);`);
  const still = async () => { await mouse('mouseMoved', cx, cy); await sleep(90); await mouse('mouseMoved', 5, 5); await sleep(60); };
  const click = async (x, y, modifiers = 0) => {
    await mouse('mouseMoved', x, y, { modifiers }); await sleep(40);
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(x), y: Math.round(y), button: 'left', buttons: 1, clickCount: 1, modifiers });
    await sleep(40);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(x), y: Math.round(y), button: 'left', buttons: 0, clickCount: 1, modifiers });
    await sleep(160);
  };
  await E(`csUnitLod(); return true;`); await settle('models'); await E(`csUnitLod(); csUnitLod(); return true;`);   // modele wczytane, LOD auto

  // ── 1. pochylenie przed / po (środek tarczy) ──
  await E(`${ov}._clearSelection(); ${ov}._selectedHex = null; csUnitLean(); ${redraw} return true;`); await still();
  const off = await info();
  await shot('lean-off', `Lean OFF — models upright on the tile normal: at the disc centre seen from above (tile ${off.tilePx.toFixed(0)} px)`, hero);
  await E(`csUnitLean(); ${redraw} return true;`); await still();
  const on = await info();
  await shot('lean-on', `Lean ON (one constant, k = ${on.lean}) — models lean towards the camera and read from the side; still on their tiles`, hero);
  numbers.lean = { off, on };
  check(off.lean === 0 && on.lean > 0 && on.models >= 3 && off.models === on.models, 'pochylenie: przełącznik csUnitLean, te same modele', `off ${off.lean} / on ${on.lean}, modeli ${on.models}`);

  // ── 2. Ctrl + klik w trzy modele (prawdziwe zdarzenia myszy) ──
  const boxes = await E(`const g = KOSMOS.groundUnitManager; return ${ov}._sphere.units._boxes.filter(b => { const u = g.getUnit(b.id); return u && (!u.owner || u.owner === 'player') && b.ids.length === 1; })
    .map(b => ({ id: b.id, x: (b.x0 + b.x1) / 2, y: b.y0 + (b.y1 - b.y0) * 0.45, w: b.x1 - b.x0 }));`);
  const pick3 = [];
  for (const b of boxes) { if (pick3.every(p => Math.hypot(p.x - b.x, p.y - b.y) > Math.max(24, b.w * 0.9))) pick3.push(b); if (pick3.length === 3) break; }
  numbers.select = { candidates: boxes.length, picked: pick3.map(p => p.id) };
  check(pick3.length === 3, 'trzy rozłączne modele na ekranie', `${boxes.length} kandydatów`);
  await E(`${ov}._clearSelection(); ${redraw} return true;`);
  // prostokąt każdej jednostki czytany TUŻ przed klikiem (kula mogła się obrócić — auto-obrót do pierwszego zaznaczenia)
  const boxOf = (id) => E(`${redraw} const b = ${ov}._sphere.units._boxes.find(q => q.id === ${JSON.stringify(id)}); return b ? { x: (b.x0 + b.x1) / 2, y: b.y0 + (b.y1 - b.y0) * 0.45 } : null;`);
  for (let i = 0; i < pick3.length; i++) { await mouse('mouseMoved', cx, cy); await sleep(150); const b = (await boxOf(pick3[i].id)) ?? pick3[i]; pick3[i] = { ...pick3[i], ...b }; await click(b.x * k, b.y * k, i === 0 ? 0 : 2); }   // 2 = Ctrl
  const sel = await E(`return [...${ov}._selectedUnits];`);
  check(sel.length === 3 && pick3.every(p => sel.includes(p.id)), 'Ctrl + klik: zaznaczone 3 jednostki (zdarzenia myszy z modyfikatorem)', sel.join(', '));
  await click(pick3[1].x * k, pick3[1].y * k, 8);   // 8 = Shift → zdejmij
  const sel2 = await E(`return [...${ov}._selectedUnits];`);
  check(sel2.length === 2 && !sel2.includes(pick3[1].id), 'Shift + klik na zaznaczonym modelu zdejmuje go', sel2.join(', '));
  await click(pick3[1].x * k, pick3[1].y * k, 2);
  await E(`${redraw} return true;`); await sleep(400);
  await shot('select3', 'Ctrl + click on three models: selection ring on each, group drawer with 3 units', null);

  // ── 3. okno bitwy klikiem w znacznik ──
  const bt = await E(`${ov}._clearSelection(); ${ov}._selectedHex = null; const b = csUnitBattle(); const d = KOSMOS.diplomacySystem; if (b && d?.relations?.getStatus?.('player', b.empire) !== 'war') d.declareWar(b.empire, 'probe_cs10b'); return b;`);
  await E(`${ov}._sphere.renderer.turnTo(${bt?.tile ?? 0}); return true;`); await sleep(1600); await still(); await E(`${redraw} return true;`); await sleep(300);
  const bb = await E(`const b = ${ov}._sphere.units._battleBoxes[0]; return b ? { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, tile: b.tile } : null;`);
  check(!!bb, 'znacznik bitwy na ekranie (prostokąt trafienia)', JSON.stringify(bb));
  if (bb) await click(bb.x * k, bb.y * k, 0);
  const cb = await E(`return ${ov}._cBattle;`);
  check(!!cb && cb.q === bb?.tile, 'klik w znacznik bitwy otwiera okno bitwy', JSON.stringify(cb));
  await E(`${redraw} return true;`); await sleep(400);
  await shot('battle', 'Ground battle window opened by clicking the crossed blades: both sides, HP, round; next to the inspector zone', null);
  await E(`${ov}._cBattle = null; return true;`);

  // ── 4. trasa rozkazu ruchu ──
  const mv = await E(`return csUnitPath();`);
  check(!!mv && mv.steps >= 2, 'rozkaz ruchu przez prawdziwe moveUnit (A*)', JSON.stringify(mv));
  if (mv) { await E(`${ov}._sphere.renderer.turnTo(${mv.from}); return true;`); await sleep(1600); }
  await E(`${redraw} return true;`); await sleep(300);
  const pi = await info();
  check(pi.paths.drawn >= 1, 'trasa narysowana na powierzchni (z grotem i znacznikiem celu)', JSON.stringify(pi.paths));
  await shot('path', `Move order: path over the A* tiles (great-circle arcs), arrow head, destination ring — ${mv?.steps ?? 0} steps`, hero);
  await E(`KOSMOS.timeSystem.play?.(); return true;`); await sleep(1800); await E(`const ts = KOSMOS.timeSystem; ts.pause?.(); return true;`);
  await E(`${redraw} return true;`); await sleep(300);
  await shot('path-moving', 'The same order while the unit marches: the path is trimmed at the unit', hero);
  const fr = await E(`const s = ${ov}._sphere.units.info(); return { hud: s.hudMsMedian, frames: s.frames };`);
  numbers.hud = fr;
  console.log('[cs10b] liczby', JSON.stringify(numbers));

  // ── arkusz ──
  const row = (names) => names.map(n => shots.find(s => s.name === n)).filter(Boolean).map(s => ({ src: `/__shot/${s.name}.png`, label: s.label, w: s.w, h: s.h }));
  const rows = [
    { title: 'Lean towards the camera — before / after at the disc centre (no sphere rotation)', items: row(['lean-off', 'lean-on']), per: 2 },
    { title: 'Multi-select: Ctrl + click on three models (real mouse events) · ground battle window opened from the sphere', items: row(['select3', 'battle']), per: 2 },
    { title: 'Move order feedback: path on the surface with arrow head and destination ring', items: row(['path', 'path-moving']), per: 2 },
  ];
  await page.send('Page.navigate', { url: `${base}/__sheet` });
  await page.waitFor(`!!document.getElementById('c')`, 'arkusz');
  const data = await page.evaluate(`(async () => {
    const R = ${JSON.stringify(rows)};
    const W = 2400, PAD = 12, LAB = 24, HEAD = 40;
    const lay = R.map(r => { const tw = Math.floor((W - PAD * (r.per + 1)) / r.per); const th = Math.max(...r.items.map(i => Math.round(tw * i.h / i.w))); return { tw, th, lines: Math.ceil(r.items.length / r.per) }; });
    const c = document.getElementById('c'); c.width = W; c.height = HEAD + lay.reduce((s, l) => s + HEAD + l.lines * (l.th + LAB + PAD), 0) + PAD;
    const x = c.getContext('2d'); x.fillStyle = '#05070b'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#e8eef5'; x.font = 'bold 22px sans-serif'; x.textBaseline = 'middle'; x.fillText('KOSMOS CS-10b — unit polish on the colony sphere (lean, multi-select, battle window, move path)', PAD, HEAD / 2);
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
  const out = path.join(OUT_DIR, 'cs10b-units.png');
  fs.writeFileSync(out, Buffer.from(String(data).replace(/^data:image\/png;base64,/, ''), 'base64'));
  console.log('[cs10b] zapisano', path.relative(REPO, out).replace(/\\/g, '/'), fs.statSync(out).size, 'B');
  fs.writeFileSync(path.join(SHOT_DIR, 'cs10b-numbers.json'), JSON.stringify(numbers, null, 1));

  const realExc = exc.filter(e => !/AudioContext is closed/.test(e));
  if (realExc.length) { console.log('WYJĄTKI STRONY:'); for (const e of [...new Set(realExc)].slice(0, 8)) console.log('  ' + e.replace(/\n/g, ' | ')); }
  check(realExc.length === 0, 'brak wyjątków strony', `${realExc.length}`);
  const fail = checks.filter(c => !c.ok).length;
  console.log(`\n[cs10b] kontrole: ${checks.length - fail} PASS / ${fail} FAIL   (ujęcia: ${SHOT_DIR})`);
  exitCode = fail ? 1 : 0;
} catch (e) {
  console.error('[cs10b] BŁĄD:', e?.stack ?? e);
  exitCode = 2;
} finally {
  try { chrome.proc.kill(); } catch { /* nic */ }
  server.close();
  await sleep(300);
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* Chrome trzyma pliki */ }
}
process.exit(exitCode);
