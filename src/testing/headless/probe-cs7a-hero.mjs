// probe-cs7a-hero — sonda kroku CS-7 część A (ARC COLONY SPHERE; plan §3.15): bohater kuli kolonii.
//
//   node src/testing/headless/probe-cs7a-hero.mjs --compile   sonda kompilacji GLSL nakładki pól + kontrola, która MUSI paść,
//                                                            + klatka całego renderera (tryb gl, trafienie w pole stolicy)
//   node src/testing/headless/probe-cs7a-hero.mjs --sheet     docs/design/prototypes/cs7a-hero-sheet.png + cs7a-hero-swap.png
//   node src/testing/headless/probe-cs7a-hero.mjs --perf      koszt klatki: bezczynność / pogoda / auto-obrót / przeciąganie / kursor
//   node src/testing/headless/probe-cs7a-hero.mjs --game      CZĘŚĆ B: prawdziwa gra — nowa gra z flagą colonySphere, okno kolonii z kulą,
//                                                            mysz / klawisze po CDP (obrót, zoom, dwuklik, budowa, rozbiórka, Shift+S,
//                                                            soczewka), koszt klatki, zapis / wczytanie, flaga OFF; zrzuty cs7b-*.png
//   (bez trybu = pierwsze trzy)      --swiftshader  wymuś rasteryzację programową (domyślnie prawdziwe GPU)
//
// Prawdziwy renderer gry w headless Chrome po CDP (wzór probe-cs6b-air). Wirtualna strona `/__cs7a` ładuje
// `cs7a-sheet-page.js`. Kod wyjścia 1, gdy sonda kompilacji nie przejdzie albo kontrola nie padnie.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT_DIR = path.join(REPO, 'docs/design/prototypes');
const has = (k) => process.argv.includes(k);
const MODES = ['--compile', '--sheet', '--perf', '--game'];
const ALL = !MODES.some(has);
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
const SHEET_HTML = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{ "imports": { "three": "/src/lib/three.module.js" } }</script></head>
<body style="margin:0;background:#000"><script type="module" src="/src/testing/headless/cs7a-sheet-page.js"></script></body></html>`;

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    if (rel === '__blank') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><html><body style="margin:0;background:#000"></body></html>'); }
    if (rel === '__cs7a') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(SHEET_HTML); }
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs7a-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const gpu = has('--swiftshader')
    ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
    : ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'];
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--mute-audio', ...gpu,
    '--window-size=1600,1041', ...(has('--uncapped') ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []), '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' });
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
  const waitFor = async (expr, label, ms = 240000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evaluate(expr)) return; } catch { /* ładuje się */ } await sleep(250); } throw new Error('timeout: ' + label); };
  return new Promise((res, rej) => { ws.onopen = () => res({ send, evaluate, waitFor, on: (f) => listeners.push(f), close: () => ws.close() }); ws.onerror = rej; });
}

const savePng = (name, dataUrl) => {
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, Buffer.from(String(dataUrl).replace(/^data:image\/png;base64,/, ''), 'base64'));
  console.log('[cs7a] zapisano', path.relative(REPO, file).replace(/\\/g, '/'), fs.statSync(file).size, 'B');
};

const exitCodeRef = { v: 0 };
const result = {};
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = await launch();
try {
  const page = await cdp(chrome.wsUrl);
  const exc = [], errs = [];
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') exc.push((m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').slice(0, 400));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push((m.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 400));
  });
  await page.send('Runtime.enable'); await page.send('Page.enable');
  if (ALL || has('--compile') || has('--sheet') || has('--perf')) {
    await page.send('Page.navigate', { url: `${base}/__cs7a` });
    await page.waitFor(`!!window.__cs7a`, 'strona arkusza', 60000);
  }

  if (ALL || has('--compile')) {
    const rows = await page.evaluate(`__cs7a.compileProbe()`);
    result.compile = rows;
    for (const r of rows) {
      const ok = r.broken ? r.errors.length > 0 : (r.errors.length === 0 && r.lit > 30);
      console.log(`[compile] ${r.which} ${r.broken ? 'KONTROLA (ma paść)' : 'program gry'} → ${ok ? 'OK' : 'FAIL'}`,
        r.broken ? `błąd: ${(r.errors[0] ?? 'BRAK').split('\n')[0].slice(0, 110)}` : `jasność ${r.lit} błędy ${r.errors.length}`);
      if (!ok) { exitCodeRef.v = 1; if (!r.broken && r.errors.length) console.log(r.errors.join('\n')); }
    }
    console.log('[compile] GPU:', rows[0]?.gpu);
    const rp = await page.evaluate(`__cs7a.rendererProbe()`);
    result.renderer = rp;
    const okR = rp.mode === 'gl' && rp.mapPhase === 'hero' && rp.spread > 120 && rp.selected === rp.capital && rp.renders > 0;
    console.log(`[renderer] ColonySphereRenderer → ${okR ? 'OK' : 'FAIL'}`, JSON.stringify(rp));
    if (!okR) exitCodeRef.v = 1;
  }

  if (ALL || has('--sheet')) {
    const s = await page.evaluate(`__cs7a.renderHeroSheet()`);
    savePng('cs7a-hero-sheet.png', s.png);
    result.sheet = { size: [s.w, s.h], meta: s.meta };
    for (const m of s.meta) if (m.arch) console.log(`[sheet] ${m.arch}: mode ${m.mode} map ${m.mapPhase} haze ${m.haze} air ${m.hasAir} renders ${m.renders}`);
    const w = await page.evaluate(`__cs7a.renderSwapStrip()`);
    savePng('cs7a-hero-swap.png', w.png);
    result.swapPhases = w.phases;
    console.log('[sheet] fazy mapy (LOD → przenikanie → bohater):', w.phases.join(' → '));
    if (w.phases.join() !== 'lod,cross,hero') { console.log('[sheet] FAIL — oczekiwane lod,cross,hero'); exitCodeRef.v = 1; }
  }

  if (ALL || has('--perf')) {
    for (const arch of ['terran', 'hothouse', 'icy_cracked']) {
      const m = await page.evaluate(`__cs7a.measure(1375, 1000, '${arch}')`);
      result['perf_' + arch] = m;
      const row = (k) => `${k}: renderów ${m[k].renders}/${m[k].frames}, draw() mediana ${m[k].drawMsMedian} ms (p95 ${m[k].drawMsP95}), klatka ${m[k].frameMsMedian} ms`;
      console.log(`[perf] ${arch} ${m.device.join('×')} px, ${m.tiles} pól`);
      for (const k of ['idlePaused', 'idleWeather', 'spin', 'drag', 'hover']) console.log('   ', row(k));
    }
  }


  // ── --game: prawdziwa gra (CS-7 część B) ─────────────────────────────────────────────────────────────
  // Nowa gra z flagą colonySphere: kolonia macierzysta na kuli w dzisiejszym oknie kolonii; mysz i klawisze przez CDP.
  if (has('--game')) {
    const shot = async (name) => { const d = (await page.send('Page.captureScreenshot', { format: 'png' })).data; savePng(name, d); };
    const FLAGS = ['colonySphere', 'sharedSurface', 'seededSystems', 'realisticClimate', 'scaledOrbits'];
    const boot = async (flagsOn) => {
      await page.send('Page.navigate', { url: `${base}/index.html` });
      await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł');
      for (const f of FLAGS) await page.evaluate(`KOSMOS.gameConfig.FEATURES.${f} = ${flagsOn ? 'true' : 'false'}`);
      await page.evaluate(`document.querySelector('[data-action="new"]').click(), true`);
      await page.waitFor(`!!document.querySelector('.fs-leader-card')`, 'lider');
      await page.evaluate(`document.querySelector('.fs-leader-card').click(), true`);
      await page.waitFor(`!!document.querySelector('#fs-start')`, 'start');
      await page.evaluate(`document.querySelector('#fs-start').click(), true`);
      await page.waitFor(`!!window.KOSMOS?.surfaceCache && !!window.KOSMOS?.gameScene`, 'GameScene');
      await page.waitFor(`window.KOSMOS?.gameScene?._introLockActive === false`, 'koniec intro', 240000);
      await sleep(2500);
      let clean = 0;
      for (let i = 0; i < 40 && clean < 4; i++) {
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
      await sleep(1500);
    };
    const HELP = String.raw`(() => {
      const ov = () => KOSMOS.overlayManager.overlays.colony;
      const scale = () => Math.min(innerWidth / 1280, innerHeight / 720);
      window.__g = {
        ov, scale,
        open() { if (!ov().visible) KOSMOS.overlayManager.openPanel('colony'); return ov().visible; },
        rect() { const r = ov()._sphereRect(); const k = scale(); return r ? { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k } : null; },
        tileCss(i) { const p = ov()._sphere.renderer.project(i, ov()._sphereRect()); const k = scale(); return p ? { x: p.x * k, y: p.y * k, visible: p.visible, facing: p.facing } : null; },
        state() {
          const o = ov(), col = o._getColony(), grid = col ? o._getGrid(col) : null, b = col?.buildingSystem;
          const keys = b ? [...b._active.keys()] : [];
          return { visible: o.visible, sphereActive: !!o._sphereActive, kind: grid?.kind ?? 'flat', tiles: grid?.tiles?.length ?? grid?.toArray?.().length ?? null,
            info: o._sphere?.renderer.info() ?? null, lens: o._sphere?.lens ?? null, selected: o._selectedHex, hovered: o._hoveredHex,
            activeKeys: keys.slice(0, 8), capital: keys.find(k => k.startsWith('capital_')) ?? null,
            capitalTile: grid?.tiles ? grid.tiles.findIndex(t => t.capitalBase) : null,
            queue: b?._constructionQueue ? [...b._constructionQueue.keys?.() ?? []] : null, supply: !!o._showSupplyCoverage,
            units: (KOSMOS.groundUnitManager?.getUnitsOnPlanet?.(col?.planetId) ?? []).map(u => ({ id: u.id, q: u.q, r: u.r, status: u.status, owner: u.owner })).slice(0, 6),
            globeOpen: !!o._globe?.isOpen, mini: o._sphere?._mini?.info?.().mode ?? null };
        },
        freeLand(n = 1) {
          const o = ov(), col = o._getColony(), grid = o._getGrid(col), r = o._sphere.renderer, rect = o._sphereRect();
          const out = [];
          for (let i = 0; i < grid.tiles.length && out.length < n; i++) {
            const t = grid.tiles[i]; const p = r.project(i, rect);
            if (!t.isOccupied && !t.capitalBase && p.visible && p.facing > 0.75 && ['plains', 'forest', 'desert', 'mountains', 'tundra'].includes(t.type)) out.push(i);
          }
          return out;
        },
        buildZones() { return ov()._hitZones.filter(z => z.type === 'build').map(z => { const k = scale(); return { id: z.data?.buildingId, x: (z.x + z.w / 2) * k, y: (z.y + z.h / 2) * k, locked: !!z.data?.locked }; }); },
        zones(type) { return ov()._hitZones.filter(z => z.type === type).map(z => { const k = scale(); return { x: (z.x + z.w / 2) * k, y: (z.y + z.h / 2) * k, data: z.data ?? null }; }); },
        tile(i) { const t = ov()._getGrid(ov()._getColony()).tiles[i]; return { type: t.type, buildingId: t.buildingId, uc: t.underConstruction ? (t.underConstruction.buildingId ?? true) : null, pending: t.pendingBuild ?? null, owner: t.owner, key: t.key }; },
      };
      return true;
    })()`;
    const mouse = async (type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'none', buttons: 0, ...extra });
    const move = (x, y) => mouse('mouseMoved', x, y);
    const click = async (x, y) => { await move(x, y); await mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1 }); await mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 1 }); };
    const drag = async (x0, y0, x1, y1, steps = 12) => {
      await move(x0, y0); await mouse('mousePressed', x0, y0, { button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, { button: 'left', buttons: 1 }); await sleep(16); }
      await mouse('mouseReleased', x1, y1, { button: 'left', buttons: 0, clickCount: 1 });
    };
    const key = (k, mods = {}) => page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, code: ${JSON.stringify(k)}, shiftKey: ${!!mods.shift}, bubbles: true, cancelable: true })), true`);
    const st = () => page.evaluate(`__g.state()`);
    // Escape z niczym zaznaczonym ZAMYKA okno kolonii — odznaczaj tylko, gdy jest co.
    const deselect = async () => { for (let i = 0; i < 3; i++) { const sel = await page.evaluate(`!!(__g.ov()._selectedHex || __g.ov()._selectedUnit)`); if (!sel) break; await key('Escape'); await sleep(150); } };
    const G = {};
    const check = (name, ok, detail = '') => { console.log(`[game] ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) exitCodeRef.v = 1; G[name] = ok; };

    // 1. nowa gra, flagi ON → kula w oknie kolonii
    await boot(true);
    await page.evaluate(HELP);
    await page.evaluate(`__g.open()`);
    await sleep(2500);
    let s = await st();
    result.gameOpen = s;
    check('new game: home colony grid is geo and the colony screen draws the sphere', s.kind === 'geo' && s.sphereActive && s.info?.mode === 'gl', `kind ${s.kind}, tiles ${s.tiles}, mode ${s.info?.mode}, map ${s.info?.mapPhase}`);
    check('capital placed on the sphere (key capital_g<i>) + starter buildings keyed by tile id', /^capital_g\d+$/.test(s.capital ?? '') && s.capitalTile >= 0 && s.activeKeys.every(k => /g\d+$/.test(k)), `${s.capital}; keys ${s.activeKeys.join(' ')}`);
    check('decorative 2D globe closed, mini sphere in the info panel', s.globeOpen === false && s.mini === 'gl', `mini ${s.mini}`);
    await page.waitFor(`__g.state().info.mapPhase === 'hero'`, 'mapa bohatera', 30000);
    const rect0 = await page.evaluate(`__g.rect()`);
    await move(5, 5); await sleep(300);   // kursor poza kulą — kadr jak po otwarciu (widok nad stolicą)
    await shot('cs7b-colony-screen.png');
    const capView = await page.evaluate(`(() => { const o = __g.ov(), g = o._getGrid(o._getColony()); const i = g.tiles.findIndex(t => t.capitalBase); const c = __g.tileCss(i); const r = __g.rect();
      const spec = o._sphere && window.__capSpec ? null : null; return { i, dx: c.x - (r.x + r.w / 2), dy: c.y - (r.y + r.h / 2), visible: c.visible, buildingOnCapital: g.tiles[i].buildingId ?? null }; })()`);
    const capPng = await page.evaluate(`(async () => { const m = await import('/src/renderer/BuildingTextures.js'); return m.hasBuildingTexture('colony_base'); })()`);
    check('capital centred in the initial view and drawn with the colony_base portrait', capView.visible && Math.hypot(capView.dx, capView.dy) < 0.2 * rect0.h && capPng === true,
      `capital g${capView.i} at ${capView.dx.toFixed(0)}, ${capView.dy.toFixed(0)} px from the centre (auto-rotation started), building on it: ${capView.buildingOnCapital}, colony_base.png loaded: ${capPng}`);
    const rect = await page.evaluate(`__g.rect()`);
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;

    // 2. auto-obrót / zatrzymanie kursorem / wznowienie
    await move(rect.x + 30, rect.y + rect.h - 30);   // róg kadru — poza tarczą
    await sleep(3600);
    const a0 = (await st()).info; await sleep(1000); const a1 = (await st()).info;
    check('auto-rotation: view turns while the mouse is off the sphere', a1.spin === 'spin' && a1.view.lon > a0.view.lon, `Δlon ${(a1.view.lon - a0.view.lon).toFixed(4)} rad / s`);
    await move(cx, cy); await sleep(300);
    const h0 = (await st()).info; await sleep(800); const h1 = (await st()).info;
    check('hover stops the rotation', h1.spin === 'hold' && Math.abs(h1.view.lon - h0.view.lon) < 1e-9 && h1.hoverTile >= 0, `hover tile ${h1.hoverTile}`);
    await move(rect.x + 30, rect.y + rect.h - 30); await sleep(500);
    const w0 = (await st()).info; await sleep(3200); const w1 = (await st()).info;
    check('after leaving: delay, then ease-in back to rotation', w0.spin === 'wait' && (w1.spin === 'spin' || w1.spin === 'ease') && w1.view.lon > w0.view.lon, `${w0.spin} → ${w1.spin}`);

    // 3. przeciąganie, zoom, dwuklik
    const d0 = (await st()).info;
    await drag(cx, cy, cx + 160, cy + 40);
    const d1 = (await st()).info;
    check('drag rotates the sphere (no tile selected by the drag)', d1.view.lon - d0.view.lon > 0.1 && d1.view.lat > d0.view.lat && (await st()).selected == null, `Δlon ${(d1.view.lon - d0.view.lon).toFixed(3)} Δlat ${(d1.view.lat - d0.view.lat).toFixed(3)}`);
    await mouse('mouseWheel', cx, cy, { deltaX: 0, deltaY: -400 }); await sleep(900);
    const z1 = (await st()).info;
    check('wheel zooms in', z1.view.dist < d1.view.dist - 0.2, `dist ${d1.view.dist.toFixed(2)} → ${z1.view.dist.toFixed(2)} (range ${z1.range.near.toFixed(2)}…${z1.range.far.toFixed(2)})`);
    await mouse('mouseWheel', cx, cy, { deltaX: 0, deltaY: 900 }); await sleep(1200);
    const land = await page.evaluate(`__g.freeLand(3)`);
    const target = land[land.length - 1];
    let tp = await page.evaluate(`__g.tileCss(${target})`);
    await click(tp.x, tp.y); await sleep(120); await click(tp.x, tp.y); await sleep(1100);
    tp = await page.evaluate(`__g.tileCss(${target})`);
    check('double-click turns the sphere to the tile', Math.hypot(tp.x - cx, tp.y - cy) < 6, `tile ${target} at ${(tp.x - cx).toFixed(1)}, ${(tp.y - cy).toFixed(1)} px from the centre`);

    // 4. klik w pole → panel pola + tryb budowy; budowa przez menu; rozbiórka
    await deselect();
    tp = await page.evaluate(`__g.tileCss(${target})`);
    await click(tp.x, tp.y); await sleep(500);
    s = await st();
    check('tile click selects the geo tile and opens the build menu (build mode: full grid, no auto-rotation)', s.selected?.q === target && s.selected?.r === -1 && s.info.gridAll === true && s.info.spin === 'hold', `selected ${JSON.stringify(s.selected)}`);
    const zones = await page.evaluate(`__g.buildZones()`);
    const pick = zones.find(z => !z.locked) ?? zones[0];
    await move(pick.x, pick.y); await sleep(400);
    await shot('cs7b-build-mode.png');
    const before = await page.evaluate(`__g.tile(${target})`);
    await click(pick.x, pick.y); await sleep(700);
    const after = await page.evaluate(`__g.tile(${target})`);
    check('build menu click places the building on the picked tile (same planet:buildRequest path)', !before.buildingId && !before.uc && (!!after.buildingId || !!after.uc || !!after.pending), `${pick?.id}: ${JSON.stringify(after)}`);
    result.gameBuild = { zones: zones.length, pick, before, after };
    // rozbiórka: budynek startowy (gotowy) — klik w pole, klawisz Delete
    const built = await page.evaluate(`(() => { const o = __g.ov(), g = o._getGrid(o._getColony()); const r = o._sphere.renderer, rc = o._sphereRect();
      for (let i = 0; i < g.tiles.length; i++) { const t = g.tiles[i]; const p = r.project(i, rc); if (t.buildingId && !t.capitalBase && p.visible && p.facing > 0.5) return i; } return -1; })()`);
    if (built >= 0) {
      await deselect();
      const bp = await page.evaluate(`__g.tileCss(${built})`);
      await click(bp.x, bp.y); await sleep(400);
      const b0 = await page.evaluate(`__g.tile(${built})`);
      await key('Delete'); await sleep(800);
      // potwierdzenie rozbiórki (modal), jeśli jest
      await page.evaluate(`(() => { const b = [...document.querySelectorAll('.kosmos-modal-overlay button, .mission-modal-overlay button')].find(e => /tak|potwierd|rozbi|ok|yes|confirm/i.test(e.textContent)); if (b) b.click(); return !!b; })()`);
      await sleep(800);
      const b1 = await page.evaluate(`__g.tile(${built})`);
      check('demolish removes the building from the sphere tile', !!b0.buildingId && !b1.buildingId, `${b0.buildingId} → ${b1.buildingId}`);
    } else check('demolish removes the building from the sphere tile', false, 'no visible building tile');

    // 5. Shift+S, soczewka L
    await deselect();
    await key('S', { shift: true }); await sleep(500);
    s = await st();
    check('Shift+S toggles supply coverage on the sphere', s.supply === true);
    await shot('cs7b-supply.png');
    await key('S', { shift: true });
    const lenses = [];
    for (let i = 0; i < 4; i++) { await key('l'); await sleep(350); lenses.push((await st()).lens); if (i === 0) await shot('cs7b-lens-terrain.png'); }
    check('lens key cycles terrain → deposits → ownership → off', lenses.join() === 'terrain,deposits,ownership,none', lenses.join(' → '));

    // 5b. jednostka naziemna na kuli: rysunek, zaznaczenie, rozkaz ruchu (prawy klik), widok 2D
    await deselect();
    const helpers = await page.evaluate(`[typeof csSphere, typeof csSphereUnit, typeof csSphere2D].join()`);
    const spawned = await page.evaluate(`csSphereUnit()`);
    await sleep(600);
    const uTile = Number(String(spawned?.tile ?? '').slice(1));
    await page.evaluate(`__g.ov()._sphere.renderer.turnTo(${uTile})`); await sleep(1200);
    let up = await page.evaluate(`__g.tileCss(${uTile})`);
    await click(up.x, up.y); await sleep(500);
    const selU = await page.evaluate(`({ unit: __g.ov()._selectedUnit?.id ?? null, n: __g.ov()._selectedUnits.size })`);
    await shot('cs7b-unit.png');
    // Cel w odległości 2 z LĄDOWYM polem pośrednim (pole „o dwa dalej" przez wodę bywa na innej wyspie — wtedy gra
    // słusznie odmawia: brak ścieżki). Odmowy ruchu zbierane z szyny zdarzeń.
    await page.evaluate(`(async () => { const EB = (await import('/src/core/EventBus.js')).default; window.__pb = []; EB.on('groundUnit:pathBlocked', (e) => window.__pb.push(e.reason ?? 'blocked')); return true; })()`);
    const goal = await page.evaluate(`(() => { const o = __g.ov(), g = o._getGrid(o._getColony()), r = o._sphere.renderer, rc = o._sphereRect(), topo = r.topo;
      const land = (i) => ['plains', 'forest', 'desert', 'mountains', 'tundra'].includes(g.tiles[i].type);
      for (const k of topo.neighbors(${uTile})) { if (!land(k)) continue;
        for (const j of topo.neighbors(k)) { if (j !== ${uTile} && topo.distance(${uTile}, j) === 2 && land(j) && r.project(j, rc).visible) return j; } }
      return -1; })()`);
    const gp = await page.evaluate(`__g.tileCss(${goal})`);
    await move(gp.x, gp.y);
    await mouse('mousePressed', gp.x, gp.y, { button: 'right', buttons: 2, clickCount: 1 });
    await mouse('mouseReleased', gp.x, gp.y, { button: 'right', buttons: 0, clickCount: 1 });
    await sleep(400);
    const ordered = await page.evaluate(`(() => { const u = KOSMOS.groundUnitManager.getUnit(${JSON.stringify(spawned?.unit ?? '')}); return u ? { status: u.status, path: (u._path ?? []).map(p => p.q), q: u.q } : null; })()`);
    await page.evaluate(`KOSMOS.timeSystem.play?.(), true`);
    await page.waitFor(`(() => { const u = KOSMOS.groundUnitManager.getUnit(${JSON.stringify(spawned?.unit ?? '')}); return u && u.q === ${goal}; })()`, 'jednostka u celu', 60000).catch(() => {});
    const arrived = await page.evaluate(`(() => { const u = KOSMOS.groundUnitManager.getUnit(${JSON.stringify(spawned?.unit ?? '')}); return u ? { q: u.q, r: u.r, status: u.status } : null; })()`);
    check('debug helpers exist (csSphere, csSphereUnit, csSphere2D)', helpers === 'function,function,function');
    check('ground unit on the sphere: click selects it', !!spawned?.unit && selU.unit === spawned.unit && selU.n === 1, `unit ${spawned?.unit} on ${spawned?.tile}`);
    check('right-click on a tile orders the move (path of sphere tiles) and the unit arrives', !!ordered && ordered.path.length >= 1 && ordered.path[ordered.path.length - 1] === goal && arrived?.q === goal && arrived?.r === -1,
      `goal g${goal}; order ${JSON.stringify(ordered)}; arrived ${JSON.stringify(arrived)}`);
    result.gameUnit = { spawned, selU, goal, ordered, arrived, pathBlocked: await page.evaluate(`window.__pb`) };
    await deselect();
    await page.evaluate(`csSphere2D()`); await sleep(500);
    const fb = (await st()).info;
    const fbTile = await page.evaluate(`(() => { const o = __g.ov(), g = o._getGrid(o._getColony()), k = __g.scale(); const c = __g.tileCss(${goal}); return o._screenToTile(c.x / k, c.y / k, g)?.q ?? null; })()`);
    await shot('cs7b-fallback-2d.png');
    await page.evaluate(`csSphere2D()`); await sleep(400);
    check('2D fallback of the sphere: drawn without WebGL, picking still returns the tile, switching back restores 3D', fb.mode === '2d' && fbTile === goal && (await st()).info.mode === 'gl', `mode ${fb.mode}, picked g${fbTile}`);

    // 6. koszt klatki w grze (okno kolonii otwarte)
    await page.evaluate(String.raw`(() => { const stt = { f: [], on: false, last: 0 }; const loop = (t) => { if (stt.on && stt.last) stt.f.push(t - stt.last); stt.last = t; requestAnimationFrame(loop); }; requestAnimationFrame(loop);
      window.__perf = { start() { stt.f = []; stt.last = 0; stt.on = true; window.__r0 = __g.ov()._sphere.renderer.info().renders; }, stop() { stt.on = false; const f = stt.f.slice().sort((a, b) => a - b); const m = f.reduce((a, b) => a + b, 0) / (f.length || 1);
        return { frames: f.length, medianMs: +(f[f.length >> 1] ?? 0).toFixed(2), p95Ms: +(f[Math.floor(f.length * 0.95)] ?? 0).toFixed(2), fps: +(1000 / (m || 1)).toFixed(1), sphereRenders: __g.ov()._sphere.renderer.info().renders - window.__r0, renderMsMedian: __g.ov()._sphere.renderer.info().renderMsMedian }; } }; return true; })()`);
    const perf = {};
    const measure = async (name, ms, during) => { await page.evaluate(`__perf.start()`); if (during) await during(); else await sleep(ms); perf[name] = await page.evaluate(`__perf.stop()`); console.log(`[game] perf ${name}:`, JSON.stringify(perf[name])); };
    await page.evaluate(`KOSMOS.timeSystem.pause?.(), true`);
    { const fl = await page.evaluate(`__g.freeLand(1)`); tp = await page.evaluate(`__g.tileCss(${fl[0]})`); }
    await click(tp.x, tp.y); await sleep(600);                                   // zaznaczone pole → bez obrotu
    await move(rect.x + 30, rect.y + rect.h - 30); await sleep(400);
    await measure('idleSelectedPaused', 3000);
    await deselect(); await sleep(4200);     // nic nie zaznaczone → auto-obrót
    await measure('autoRotation', 3000);
    await measure('drag', 0, async () => { await drag(cx - 200, cy, cx + 200, cy + 60, 150); });
    await page.evaluate(`KOSMOS.overlayManager.closeActive(), true`); await sleep(800);
    await page.evaluate(`window.__perf2 = (() => { const stt = { f: [], last: 0 }; let on = true; const loop = (t) => { if (stt.last) stt.f.push(t - stt.last); stt.last = t; if (on) requestAnimationFrame(loop); }; requestAnimationFrame(loop); return () => { on = false; const f = stt.f.sort((a, b) => a - b); return { frames: f.length, medianMs: +(f[f.length >> 1] ?? 0).toFixed(2), p95Ms: +(f[Math.floor(f.length * 0.95)] ?? 0).toFixed(2) }; }; })(), true`);
    await sleep(3000);
    perf.overlayClosed = await page.evaluate(`__perf2()`);
    console.log('[game] perf overlayClosed (system map only):', JSON.stringify(perf.overlayClosed));
    result.gamePerf = perf;

    // 7. zapis / wczytanie: siatka geo wraca, kula działa
    const saved = await page.evaluate(`(() => { KOSMOS.overlayManager.closeActive?.(); const ss = KOSMOS.saveSystem ?? KOSMOS.gameScene?.saveSystem; ss.save?.(); const raw = localStorage.getItem('kosmos_save_v1'); return { bytes: raw?.length ?? 0, geo: /"kind":"geo"/.test(raw ?? '') }; })()`);
    check('save contains the sparse geo grid', saved.bytes > 1000 && saved.geo, `${saved.bytes} B`);
    await page.send('Page.navigate', { url: `${base}/index.html` });
    await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł (po zapisie)');
    await page.evaluate(`KOSMOS.gameConfig.FEATURES.colonySphere = true`);
    const cont = await page.evaluate(`(() => { const b = document.querySelector('[data-action="continue"], [data-action="load"]'); if (b) b.click(); return b?.dataset?.action ?? null; })()`);
    await page.waitFor(`!!window.KOSMOS?.gameScene && !!KOSMOS.colonyManager?.getColony?.(KOSMOS.homePlanet?.id)`, 'gra po wczytaniu', 120000);
    await sleep(3000);
    await page.evaluate(HELP); await page.evaluate(`__g.open()`); await sleep(2500);
    s = await st();
    check('after load the home colony is still a sphere with its buildings', s.kind === 'geo' && s.sphereActive && s.info?.mode === 'gl' && /^capital_g\d+$/.test(s.capital ?? ''), `via ${cont}; kind ${s.kind}, capital ${s.capital}`);
    result.gameLoad = s;

    // 8. flaga OFF → nowa gra płaska, kula nietknięta
    await boot(false);
    await page.evaluate(HELP); await page.evaluate(`__g.open()`); await sleep(2000);
    s = await st();
    check('flag OFF: new game is flat — 2D map, no sphere object created', s.kind === 'flat' && s.sphereActive === false && s.info === null && s.globeOpen === true, `kind ${s.kind}`);
    await shot('cs7b-flag-off.png');

    // 9. zapis płaskiej gry (jak każdy stary zapis: siatki bez `kind`) wczytany z flagą ON → dalej mapa 2D
    const flatSave = await page.evaluate(`(() => { KOSMOS.overlayManager.closeActive?.(); const ss = KOSMOS.saveSystem ?? KOSMOS.gameScene?.saveSystem; ss.save?.(); const raw = localStorage.getItem('kosmos_save_v1'); return { bytes: raw?.length ?? 0, geo: /"kind":"geo"/.test(raw ?? '') }; })()`);
    await page.send('Page.navigate', { url: `${base}/index.html` });
    await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł (stary zapis)');
    await page.evaluate(`KOSMOS.gameConfig.FEATURES.colonySphere = true`);
    await page.evaluate(`document.querySelector('[data-action="continue"]').click(), true`);
    await page.waitFor(`!!window.KOSMOS?.gameScene && !!KOSMOS.colonyManager?.getColony?.(KOSMOS.homePlanet?.id)`, 'gra po wczytaniu (stary zapis)', 120000);
    await sleep(3000);
    await page.evaluate(HELP); await page.evaluate(`__g.open()`); await sleep(2000);
    s = await st();
    check('flat (old-format) save loaded with the flag ON still shows the 2D map', flatSave.bytes > 1000 && flatSave.geo === false && s.kind === 'flat' && s.sphereActive === false && s.info === null,
      `save ${flatSave.bytes} B, kind ${s.kind}, flag ${await page.evaluate('KOSMOS.gameConfig.FEATURES.colonySphere')}`);
    result.game = G;
  }

  const realExc = exc.filter(e => !/AudioContext is closed/.test(e));   // przeładowanie strony zamyka dźwięk starej — nie dotyczy kroku
  if (realExc.length) { console.log('[cs7a] WYJĄTKI STRONY:', realExc.slice(0, 5)); exitCodeRef.v = 1; }
  if (errs.length) console.log('[cs7a] console.error:', errs.slice(0, 8));
  const out = path.join(os.tmpdir(), 'cs7a-probe-result.json');
  fs.writeFileSync(out, JSON.stringify(result, (k, v) => (k === 'png' || k === 'data' ? undefined : v), 2));
  console.log('[cs7a] wynik →', out);
  page.close();
} catch (e) {
  console.error('[cs7a] BŁĄD SONDY:', e?.message ?? e);
  exitCodeRef.v = 1;
} finally {
  try { chrome.proc.kill(); } catch { /* nic */ }
  server.close();
  await sleep(300);
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* Chrome trzyma pliki */ }
}
process.exit(exitCodeRef.v);
