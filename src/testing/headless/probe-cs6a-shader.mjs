// probe-cs6a-shader — sonda kroku CS-6a (ARC COLONY SPHERE; plan §3.6): wspólny shader powierzchni.
//
//   node src/testing/headless/probe-cs6a-shader.mjs --compile        sonda kompilacji GLSL + kontrola, która MUSI paść
//   node src/testing/headless/probe-cs6a-shader.mjs --sheets         cs6a-archetypes.png + cs6a-variety.png
//   node src/testing/headless/probe-cs6a-shader.mjs --game           cs6a-systemmap-before-after.png + tabela wydajności
//   node src/testing/headless/probe-cs6a-shader.mjs --owner          skrypt właściciela 1:1 (flaga ON już na ekranie tytułowym)
//   (bez trybu = pierwsze trzy)      --swiftshader  wymuś rasteryzację programową (domyślnie próba prawdziwego GPU)
//
// Prawdziwa gra / prawdziwy shader w headless Chrome po CDP (wzór probe-cs4b-cache). Arkusze: wirtualna strona
// `/__cs6a` ładuje `cs6a-sheet-page.js` (ten sam SurfaceShader co gra). PNG → docs/design/prototypes/.
// Kod wyjścia 1, gdy sonda kompilacji nie przejdzie albo kontrola nie padnie.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT_DIR = path.join(REPO, 'docs/design/prototypes');
const has = (k) => process.argv.includes(k);
const ALL = !has('--compile') && !has('--sheets') && !has('--game') && !has('--owner');
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
const SHEET_HTML = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{ "imports": { "three": "/src/lib/three.module.js" } }</script></head>
<body style="margin:0;background:#000"><script type="module" src="/src/testing/headless/cs6a-sheet-page.js"></script></body></html>`;

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    if (rel === '__blank') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><html><body style="margin:0;background:#000"></body></html>'); }
    if (rel === '__cs6a') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(SHEET_HTML); }
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs6a-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const gpu = has('--swiftshader')
    ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
    : ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'];
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--mute-audio', ...gpu,
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
  const waitFor = async (expr, label, ms = 240000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evaluate(expr)) return; } catch { /* ładuje się */ } await sleep(250); } throw new Error('timeout: ' + label); };
  return new Promise((res, rej) => { ws.onopen = () => res({ send, evaluate, waitFor, on: (f) => listeners.push(f), close: () => ws.close() }); ws.onerror = rej; });
}

const savePng = (name, dataUrl) => {
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, Buffer.from(String(dataUrl).replace(/^data:image\/png;base64,/, ''), 'base64'));
  console.log('[cs6a] zapisano', path.relative(REPO, file).replace(/\\/g, '/'), fs.statSync(file).size, 'B');
};

// Rejestrator klatek (rAF) + znacznik czasu logu „Rebake:" starej ścieżki.
const PERF_SRC = String.raw`(() => {
  if (window.__perfRec) return true;
  const st = { frames: [], on: false, last: 0 };
  const loop = (t) => { if (st.on && st.last) st.frames.push(t - st.last); st.last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  window.__perfRec = {
    start() { st.frames = []; st.last = 0; st.on = true; },
    stop() {
      st.on = false;
      const f = st.frames.slice().sort((a, b) => a - b), r = (x) => +(x ?? 0).toFixed(2);
      const mean = f.reduce((a, b) => a + b, 0) / (f.length || 1);
      return { frames: f.length, medianMs: r(f[f.length >> 1]), meanMs: r(mean), p95Ms: r(f[Math.floor(f.length * 0.95)]), maxMs: r(f[f.length - 1]), fps: r(1000 / (mean || 1)) };
    },
  };
  window.__rebakeAt = null;
  const log = console.log.bind(console);
  console.log = (...a) => { if (typeof a[0] === 'string' && a[0].includes('Rebake:')) window.__rebakeAt = { t: performance.now(), msg: a[0] }; log(...a); };
  return true;
})()`;

const exitCodeRef = { v: 0 };
const result = {};
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = await launch();
try {
  const page = await cdp(chrome.wsUrl);
  const exc = [], errs = [];
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') exc.push((m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').slice(0, 300));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push((m.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  });
  await page.send('Runtime.enable'); await page.send('Page.enable');

  if (ALL || has('--compile') || has('--sheets')) {
    await page.send('Page.navigate', { url: `${base}/__cs6a` });
    await page.waitFor(`!!window.__cs6a`, 'strona arkusza', 60000);
  }

  if (ALL || has('--compile')) {
    const rows = await page.evaluate(`__cs6a.compileProbe()`);
    result.compile = rows;
    for (const r of rows) {
      const lit = r.pixel[0] + r.pixel[1] + r.pixel[2] > 30;
      const ok = r.broken ? r.errors.length > 0 : (r.errors.length === 0 && lit && r.hasLogDepthChunk === r.logDepth);
      console.log(`[compile] logDepth=${r.logDepth} ${r.broken ? 'KONTROLA (ma paść)' : 'program gry'} → ${ok ? 'OK' : 'FAIL'}`,
        r.broken ? `błąd: ${(r.errors[0] ?? 'BRAK').split('\n')[0].slice(0, 110)}` : `piksel ${r.pixel.join(',')} błędy ${r.errors.length}`);
      if (!ok) { exitCodeRef.v = 1; if (!r.broken && r.errors.length) console.log(r.errors.join('\n')); }
    }
    console.log('[compile] GPU:', rows[0]?.gpu);
  }

  if (ALL || has('--sheets')) {
    const a = await page.evaluate(`__cs6a.renderArchetypes()`);
    savePng('cs6a-archetypes.png', a.png);
    const v = await page.evaluate(`__cs6a.renderVariety()`);
    savePng('cs6a-variety.png', v.png);
    const c = await page.evaluate(`__cs6a.renderTerranCloseup()`);
    savePng('cs6a-terran-closeup.png', c.png);
    result.sheets = { gpu: a.gpu, archetypes: [a.w, a.h], variety: [v.w, v.h], closeup: [c.w, c.h] };
    console.log('[sheets] GPU:', a.gpu);
  }

  if (ALL || has('--game')) {
    await page.send('Page.navigate', { url: `${base}/index.html` });
    await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł');
    await page.evaluate('KOSMOS.gameConfig.FEATURES.seededSystems=true');
    await page.evaluate(`document.querySelector('[data-action="new"]').click(), true`);
    await page.waitFor(`!!document.querySelector('.fs-leader-card')`, 'lider');
    await page.evaluate(`document.querySelector('.fs-leader-card').click(), true`);
    await page.waitFor(`!!document.querySelector('#fs-start')`, 'start');
    await page.evaluate(`document.querySelector('#fs-start').click(), true`);
    await page.waitFor(`typeof window.csShared === 'function' && !!window.KOSMOS?.surfaceCache`, 'GameScene');
    await page.waitFor(`window.KOSMOS?.gameScene?._introLockActive === false`, 'koniec intro', 240000);
    await sleep(2500);
    // Narracja startowa (IntroModal: bloki .tw-block → ESC pomija; potem pole nazwy → Enter) zasłania kadr — zamknij ją.
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
    await page.evaluate(`KOSMOS.overlayManager?.closeActive?.(), true`);   // po narracji gra otwiera ekran kolonii — zasłania mapę układu
    await sleep(800);
    await page.evaluate(PERF_SRC);
    const game = result.game = { steps: [] };
    game.gpu = await page.evaluate(`(() => { const gl = KOSMOS.threeRenderer.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()`);
    const bodiesExpr = `(() => { const tr = KOSMOS.threeRenderer; return { planets: tr._planets.size, moons: tr._moons.size, planetoids: tr._planetoids.size, system: KOSMOS.activeSystemId ?? 'sys_home' }; })()`;
    const measure = async (label, ms = 5000) => { await page.evaluate(`__perfRec.start()`); await sleep(ms); const p = await page.evaluate(`__perfRec.stop()`); game.steps.push({ label, ...p }); console.log(`[perf] ${label}`, JSON.stringify(p)); return p; };
    // Kadr: zbliżenie na planetę skalistą od strony dnia, z terminatorem (kamera 55° od kierunku na gwiazdę).
    const focus = async (pick) => page.evaluate(`(() => {
      const K = KOSMOS, tr = K.threeRenderer, sys = K.activeSystemId ?? 'sys_home';
      const planets = K.entityManager.getByTypeInSystem('planet', sys).filter(p => p.planetType !== 'gas');
      const body = ${pick};
      if (!body) return null;
      // Bez zdarzenia body:selected (otwiera panele UI) — sam fokus kamery renderera.
      tr._focusVesselId = null; tr._focusStationId = null; tr._focusEntityId = body.id;
      const r = tr._getEntityRadius(body);
      const a = Math.atan2(-body.y, -body.x) + 0.96;
      const cc = tr._cameraController;
      cc.setMinDist(0.3);
      const pe = tr._planets.get(body.id);
      if (pe) cc.applyView({ target: { x: pe.group.position.x, y: 0, z: pe.group.position.z } });
      cc.applyView({ theta: a, phi: 1.22, dist: Math.max(r * 4.2, 0.3) });
      return { name: body.name, archetype: body.bodyArchetype, r: +r.toFixed(3), dist: +cc._dist.toFixed(3) };
    })()`);
    const wide = async () => page.evaluate(`(() => { const cc = KOSMOS.threeRenderer._cameraController; KOSMOS.threeRenderer._focusEntityId = null; cc.applyView({ theta: 0.3, phi: 1.0, dist: 60, target: { x: 0, y: 0, z: 0 } }); return cc._dist; })()`);
    const shot = async () => (await page.send('Page.captureScreenshot', { format: 'png' })).data;
    const waitTextured = async (t0expr) => { await page.waitFor(`(() => { const s = KOSMOS.threeRenderer.sharedSurfaceStats(); return s.bodies > 0 && s.pending === 0; })()`, 'mapy powierzchni', 120000); return page.evaluate(`({ ms: Math.round(performance.now() - ${t0expr}), ...KOSMOS.threeRenderer.sharedSurfaceStats() })`); };
    const shots = [];

    // ── Układ 1 (dom), flaga OFF ──
    game.system1 = await page.evaluate(bodiesExpr);
    await wide(); await sleep(1500);
    await measure('system 1 · OFF · full system view');
    game.focus1 = await focus(`(K.homePlanet && planets.find(p => p.id === K.homePlanet.id)) || planets[0]`);
    await sleep(2500);
    await measure('system 1 · OFF · close-up');
    shots.push({ label: `system 1 (${game.system1.system}) · ${game.focus1?.name} · sharedSurface OFF (today)`, data: await shot() });

    // ── Układ 1, flaga ON przez csShared() (zimny cache → worker) ──
    game.toggleOn = await page.evaluate(`(() => { window.__t0 = performance.now(); return csShared(); })()`);
    game.texturedAfterToggle = await waitTextured('window.__t0');
    console.log('[game] csShared → ON', JSON.stringify(game.toggleOn), 'wszystkie mapy po', JSON.stringify(game.texturedAfterToggle));
    // Strojenie §3.6.1 pkt 5: zbliżenie → mapa bohatera 1024×512 z workera; najdłuższa klatka w oknie podmiany.
    await page.evaluate(`__perfRec.start()`);
    await page.waitFor(`KOSMOS.threeRenderer.sharedSurfaceStats().heroReady === true`, 'mapa bohatera na zbliżeniu', 60000);
    await sleep(400);
    game.heroIn = { ...(await page.evaluate(`__perfRec.stop()`)), ...(await page.evaluate(`(() => { const tr = KOSMOS.threeRenderer, s = tr.sharedSurfaceStats(); const u = tr._sharedSurfaces.get(s.hero)?.material.uniforms; return { hero: s.hero, mapW: u?.uMapSize.value[0], fillLight: s.fillLight, lights: tr.scene.children.filter(o => o.isPointLight && o.visible).length }; })()`)) };
    console.log('[game] mapa bohatera na zbliżeniu', JSON.stringify(game.heroIn));
    await sleep(800);
    shots.push({ label: `system 1 · ${game.focus1?.name} · sharedSurface ON`, data: await shot() });
    await measure('system 1 · ON · close-up');
    await wide(); await sleep(1500);
    game.heroOut = await page.evaluate(`(() => { const tr = KOSMOS.threeRenderer, s = tr.sharedSurfaceStats(); const u = tr._sharedSurfaces.get(${JSON.stringify(game.heroIn.hero)})?.material.uniforms; return { hero: s.hero, mapWAfterZoomOut: u?.uMapSize.value[0] }; })()`);
    console.log('[game] po oddaleniu', JSON.stringify(game.heroOut));
    await measure('system 1 · ON · full system view');

    // ── Zmiana układu przy ON (zimny cache nowego układu) ──
    game.switchOn = await page.evaluate(`(() => { window.__t0 = performance.now(); window.__rebakeAt = null; const r = csNextSystem(); return { ...r, syncMs: Math.round(performance.now() - window.__t0) }; })()`);
    game.texturedAfterSwitch = await waitTextured('window.__t0');
    await sleep(1500);
    game.rebakeLogOn = await page.evaluate(`window.__rebakeAt ? window.__rebakeAt.msg : null`);
    game.system2 = await page.evaluate(bodiesExpr);
    console.log('[game] zmiana układu ON', JSON.stringify(game.switchOn), 'w pełni oteksturowany po', JSON.stringify(game.texturedAfterSwitch), 'log Rebake:', game.rebakeLogOn);
    game.focus2 = await focus(`planets.slice().sort((a, b) => tr._getEntityRadius(b) - tr._getEntityRadius(a))[0]`);
    await sleep(2500);
    shots.push({ label: `system 2 (${game.system2.system}) · ${game.focus2?.name} · sharedSurface ON`, data: await shot() });
    game.toggleOff = await page.evaluate(`csShared()`);
    await sleep(2500);
    shots.push({ label: `system 2 · ${game.focus2?.name} · sharedSurface OFF (today)`, data: await shot() });

    // ── Zmiana układu przy OFF (stara ścieżka: bake synchroniczny + „Rebake: N tekstur") ──
    game.switchOff = await page.evaluate(`(() => { window.__t0 = performance.now(); window.__rebakeAt = null; const r = csNextSystem(); return { ...r, syncMs: Math.round(performance.now() - window.__t0) }; })()`);
    await page.waitFor(`!!window.__rebakeAt`, 'log Rebake starej ścieżki', 180000).catch(() => {});
    game.rebakeOff = await page.evaluate(`window.__rebakeAt ? { ms: Math.round(window.__rebakeAt.t - window.__t0), msg: window.__rebakeAt.msg } : null`);
    game.system3 = await page.evaluate(bodiesExpr);
    console.log('[game] zmiana układu OFF', JSON.stringify(game.switchOff), 'rebake', JSON.stringify(game.rebakeOff), JSON.stringify(game.system3));
    game.cache = await page.evaluate(`(() => { const s = KOSMOS.surfaceCache.snapshot(); return { entries: s.entries, bytesUsed: s.bytesUsed, errors: s.errors, workerFailures: s.workerFailures, mode: s.mode }; })()`);
    game.leak = await page.evaluate(`(() => { const i = KOSMOS.threeRenderer.renderer.info; return { textures: i.memory.textures, geometries: i.memory.geometries, programs: i.programs?.length ?? null, shared: KOSMOS.threeRenderer.sharedSurfaceStats() }; })()`);

    // Złożenie kadru przed / po (kolejność: układ 1 OFF | ON, układ 2 OFF | ON).
    const order = [shots[0], shots[1], shots[3], shots[2]];
    await page.send('Page.navigate', { url: `${base}/__blank` });
    await sleep(400);
    await page.evaluate(`window.__shots = []`);
    for (const s of order) await page.evaluate(`window.__shots.push({ label: ${JSON.stringify(s.label)}, src: 'data:image/png;base64,${s.data}' }), true`);
    const sheet = await page.evaluate(`(async () => {
      const imgs = await Promise.all(__shots.map(s => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = s.src; })));
      const cw = 1000, ch = Math.round(cw * imgs[0].height / imgs[0].width), lab = 26;
      const c = document.createElement('canvas'); c.width = cw * 2; c.height = (ch + lab) * 2 + 30;
      const g = c.getContext('2d'); g.fillStyle = '#04060a'; g.fillRect(0, 0, c.width, c.height);
      g.font = 'bold 15px Consolas, monospace'; g.fillStyle = '#e6eef6'; g.textBaseline = 'top';
      g.fillText('CS-6a · system map · FEATURES.sharedSurface OFF (left) vs ON (right) · same camera · two systems', 10, 8);
      imgs.forEach((im, k) => { const x = (k % 2) * cw, y = 30 + Math.floor(k / 2) * (ch + lab);
        g.font = '13px Consolas, monospace'; g.fillStyle = '#9fb4c8'; g.fillText(__shots[k].label, x + 8, y + 6); g.drawImage(im, x, y + lab, cw, ch); });
      return c.toDataURL('image/png');
    })()`);
    savePng('cs6a-systemmap-before-after.png', sheet);
  }

  if (has('--owner')) {
    // Dokładnie ścieżka właściciela: obie flagi na ekranie tytułowym → nowa gra → csShared() ×2 → csNextSystem().
    const own = result.owner = {};
    await page.send('Page.navigate', { url: `${base}/index.html` });
    await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł');
    await page.evaluate('KOSMOS.gameConfig.FEATURES.sharedSurface=true');
    await page.evaluate('KOSMOS.gameConfig.FEATURES.seededSystems=true');
    await page.evaluate(`(() => { window.__rebake = []; const log = console.log.bind(console); console.log = (...a) => { if (typeof a[0] === 'string' && a[0].includes('Rebake:')) window.__rebake.push(a[0]); log(...a); }; return true; })()`);
    await page.evaluate(`document.querySelector('[data-action="new"]').click(), true`);
    await page.waitFor(`!!document.querySelector('.fs-leader-card')`, 'lider');
    await page.evaluate(`document.querySelector('.fs-leader-card').click(), true`);
    await page.waitFor(`!!document.querySelector('#fs-start')`, 'start');
    await page.evaluate(`document.querySelector('#fs-start').click(), true`);
    await page.waitFor(`typeof window.csShared === 'function' && !!window.KOSMOS?.surfaceCache`, 'GameScene');
    await page.waitFor(`(() => { const s = KOSMOS.threeRenderer.sharedSurfaceStats(); return s.bodies > 0 && s.pending === 0; })()`, 'mapy przy starcie z flagą ON', 120000);
    own.start = await page.evaluate(`({ ...KOSMOS.threeRenderer.sharedSurfaceStats(), rebakeLogs: window.__rebake.length, legacyMaps: [...KOSMOS.threeRenderer._planets.values()].filter(e => e.planet.planetType !== 'gas' && e.mesh.material.map).length })`);
    await page.waitFor(`window.KOSMOS?.gameScene?._introLockActive === false`, 'koniec intro', 240000);
    own.off = await page.evaluate(`csShared()`);
    await sleep(1500);
    own.on = await page.evaluate(`csShared()`);
    await page.waitFor(`KOSMOS.threeRenderer.sharedSurfaceStats().pending === 0`, 'mapy po powrocie do ON', 60000);
    own.onStats = await page.evaluate(`KOSMOS.threeRenderer.sharedSurfaceStats()`);
    own.next = await page.evaluate(`csNextSystem()`);
    await page.waitFor(`(() => { const s = KOSMOS.threeRenderer.sharedSurfaceStats(); return s.bodies > 0 && s.pending === 0; })()`, 'mapy drugiego układu', 120000);
    own.nextStats = await page.evaluate(`({ ...KOSMOS.threeRenderer.sharedSurfaceStats(), rebakeLogs: window.__rebake.length })`);
    console.log('[owner]', JSON.stringify(own));
  }

  result.exceptions = exc; result.consoleErrors = errs.slice(0, 12);
  if (exc.length) { console.log('[cs6a] WYJĄTKI:', exc.slice(0, 5)); }
  if (errs.length) console.log('[cs6a] console.error:', errs.slice(0, 6));
  const out = path.join(os.tmpdir(), 'cs6a-probe-result.json');
  fs.writeFileSync(out, JSON.stringify(result, (k, v) => (k === 'png' || k === 'data' ? undefined : v), 2));
  console.log('[cs6a] wynik →', out);
  page.close();
} catch (e) {
  console.error('[cs6a] BŁĄD SONDY:', e?.message ?? e);
  exitCodeRef.v = 1;
} finally {
  try { chrome.proc.kill(); } catch { /* nic */ }
  server.close();
  await sleep(300);
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* Chrome trzyma pliki */ }
}
process.exit(exitCodeRef.v);
