// ARC COLONY SPHERE CS-4b — sonda SurfaceCache + surface.worker w PRAWDZIWEJ grze (headless Chrome przez CDP, bez npm).
// Plan §3.5. Tytuł → nowa gra (świat seedowany) → pomiary:
//   P0  bezczynność 3 s: klatki (rAF) + long tasks (PerformanceObserver) — punkt odniesienia
//   P1  cały układ LOD przez worker (świeży SurfaceCache, zimny worker): czas ściany, czas do 1. mapy, klatki / long tasks
//   P2  bohater zamówiony, gdy kolejka LOD układu pełna: czas do bohatera (wyprzedzanie)
//   P3  bohater sam (ciepły worker)
//   P4  ten sam układ na głównym wątku (SurfaceCache bez workera): czas ściany, klatki / long tasks; bohater na gł. wątku
//   P5  worker = główny wątek bit w bit dla WSZYSTKICH map układu
//   P6  ścieżka właściciela: csSurfaceAll() (cache gry, kompozycja podglądu na gł. wątku) + csSurface() + csCache()
//   P7  układy 2 i 3 (obce, wygenerowane jak przy odkryciu, przełączenie switchActiveSystem) → csSurfaceAll() + csCache()
//       po każdym; P8 układy 4…6 bez bohatera — presja budżetu, wyrzucenia
//
//   --owner  zamiast P0…P8: DOKŁADNIE jednolinijkowce kontroli właściciela (bez cudzysłowów) na żywym silniku:
//            csSurfaceAll() → csCache() → csSurface() → csNextSystem() → csSurfaceAll() → csCache() (+ kolejne układy)
//
//   node src/testing/headless/probe-cs4b-cache.mjs [--owner] [--out <plik.json>]

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', null);
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    if (rel === '__blank') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><html><body style="margin:0;background:#000"></body></html>'); }
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs4b-'));
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
  const waitFor = async (expr, label, ms = 240000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evaluate(expr)) return; } catch { /* ładuje się */ } await sleep(400); } throw new Error('timeout: ' + label); };
  return new Promise((res, rej) => { ws.onopen = () => res({ send, evaluate, waitFor, on: (f) => listeners.push(f), close: () => ws.close() }); ws.onerror = rej; });
}

// Strona: arkusz kontaktowy. rows = [{label, arch id, params, w, h}] × 3 ziarna; zwraca dataURL PNG.

// Rejestrator klatek i long tasks w stronie.
const PERF_SRC = String.raw`(() => {
  if (window.__perfRec) return true;
  const st = { frames: [], long: [], on: false, last: 0 };
  try { new PerformanceObserver((l) => { if (st.on) for (const e of l.getEntries()) st.long.push(e.duration); }).observe({ type: 'longtask' }); } catch (e) { st.noLong = String(e); }
  const loop = (t) => { if (st.on && st.last) st.frames.push(t - st.last); st.last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  window.__perfRec = {
    start() { st.frames = []; st.long = []; st.last = 0; st.on = true; },
    stop() {
      st.on = false;
      const f = st.frames.slice().sort((a, b) => a - b), r = (x) => +(x ?? 0).toFixed(1);
      return { frames: f.length, medianFrame: r(f[f.length >> 1]), p95Frame: r(f[Math.floor(f.length * 0.95)]), maxFrame: r(f[f.length - 1]),
        over50: f.filter(x => x > 50).length, longTasks: st.long.length, longMax: r(Math.max(0, ...st.long)), longSum: r(st.long.reduce((a, b) => a + b, 0)),
        noLong: st.noLong ?? null };
    },
  };
  return true;
})()`;

const PAGE_LIB = String.raw`(async () => {
  const SC = await import('/src/systems/SurfaceCache.js');
  const EM = (await import('/src/core/EntityManager.js')).default;
  const bodiesOf = (sys) => ['planet', 'moon', 'planetoid'].flatMap(k => EM.getByType(k)).filter(b => SC.systemOf(b) === sys && SC.surfaceArchetypeOf(b))
    .sort((a, b) => SC.surfaceSystemPriority(b) - SC.surfaceSystemPriority(a));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // Cały układ przez dany cache: czas ściany, czas do 1. mapy, suma ms bake'u, rozkład klatek.
  async function fillSystem(cache, sys) {
    const bodies = bodiesOf(sys);
    __perfRec.start();
    const t0 = performance.now(); let first = null; let sum = 0;
    const maps = await Promise.all(bodies.map(b => cache.request(b, SC.lodOf(b), SC.surfaceSystemPriority(b)).then(m => { if (first === null) first = performance.now() - t0; if (m) sum += m.ms; return m; })));
    const wall = performance.now() - t0;
    await sleep(300);
    const perf = __perfRec.stop();
    const lods = {}; for (const m of maps) if (m) lods[m.lod] = (lods[m.lod] ?? 0) + 1;
    return { bodies: bodies.length, lods, wallMs: +wall.toFixed(1), firstMs: +(first ?? 0).toFixed(1), sumBakeMs: +sum.toFixed(1),
      bytes: maps.reduce((a, m) => a + (m?.bytes ?? 0), 0), perf, maps };
  }
  window.__cs4b = { SC, EM, bodiesOf, sleep, fillSystem };
  return true;
})()`;

const exitCodeRef = { v: 0 };
const result = {};
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = await launch();
try {
  const page = await cdp(chrome.wsUrl);
  const exc = [], warns = [];
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') exc.push((m.params.exceptionDetails?.exception?.description ?? '').slice(0, 300));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'warning') {
      const t = (m.params.args ?? []).map(a => a.value ?? '').join(' ');
      if (/SurfaceCache/.test(t)) warns.push(t.slice(0, 200));
    }
  });
  await page.send('Runtime.enable'); await page.send('Page.enable');
  await page.send('Page.navigate', { url: `${base}/index.html` });
  await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł');
  await page.evaluate('KOSMOS.gameConfig.FEATURES.seededSystems=true');
  await page.evaluate(`document.querySelector('[data-action="new"]').click(), true`);
  await page.waitFor(`!!document.querySelector('.fs-leader-card')`, 'lider');
  await page.evaluate(`document.querySelector('.fs-leader-card').click(), true`);
  await page.waitFor(`!!document.querySelector('#fs-start')`, 'start');
  await page.evaluate(`document.querySelector('#fs-start').click(), true`);
  await page.waitFor(`typeof window.csCache === 'function' && !!window.KOSMOS?.surfaceCache && window.KOSMOS?.galaxyData?.seed !== undefined`, 'GameScene');
  // Intro nowej gry (lot kamery) pochłania WSZYSTKIE zdarzenia myszy w fazie capture (GameScene, lockdown) — czekamy,
  // aż się skończy (w headless klatki są wolne, intro trwa dłużej niż w oknie właściciela).
  await page.waitFor(`window.KOSMOS?.gameScene?._introLockActive === false`, 'koniec intro', 180000);   // undefined = intro jeszcze nie ruszyło
  await sleep(2000);
  result.introWaited = true;
  await page.evaluate(PERF_SRC);
  await page.evaluate(PAGE_LIB);
  if (process.argv.includes('--owner')) {
    const own = { steps: [] };
    const step = async (label, expr) => { const v = await page.evaluate(expr); own.steps.push({ label, v }); console.log(`[owner] ${label}`, JSON.stringify(v).slice(0, 400)); return v; };
    await step('csSurfaceAll() sync', `(() => { const s = csSurfaceAll(); window.__own = s; return { ...s, done: undefined, placeholders: document.querySelectorAll('#cs-surface-preview div[style*="dashed"]').length }; })()`);
    await step('progressive after 400 ms', `new Promise(r => setTimeout(() => r({ canvases: document.querySelectorAll('#cs-surface-preview canvas').length, placeholders: document.querySelectorAll('#cs-surface-preview div[style*="dashed"]').length }), 400))`);
    await step('csSurfaceAll done', `__own.done.then(o => ({ ...o, archetypes: undefined, canvases: document.querySelectorAll('#cs-surface-preview canvas').length, head: document.querySelector('#cs-surface-preview div').textContent }))`);
    const CLOSE = `(() => { const ov = document.getElementById('cs-surface-preview'); const b = ov?.querySelector('[data-action="cs-surface-close"]');
      let fired = false; b?.addEventListener('click', () => { fired = true; });
      b?.click(); return { had: !!ov, btn: !!b, fired, onclick: typeof b?.onclick, after: !!document.getElementById('cs-surface-preview'), connected: ov?.isConnected ?? null }; })()`;
    const listeners = async () => {
      const out = [];
      for (const target of ['window', 'document']) {
        const o = await page.send('Runtime.evaluate', { expression: target });
        const r = await page.send('DOMDebugger.getEventListeners', { objectId: o.result.objectId });
        for (const l of r.listeners) if (l.type === 'click' && l.useCapture) {
          const d = l.handler ? await page.send('Runtime.callFunctionOn', { objectId: l.handler.objectId, functionDeclaration: 'function(){ return String(this).slice(0, 160); }', returnByValue: true }) : null;
          out.push({ target, line: l.lineNumber, col: l.columnNumber, scriptId: l.scriptId, src: d?.result?.value });
        }
      }
      return out;
    };
    own.captureClickListeners = await listeners();
    console.log('[owner] capture click listeners', JSON.stringify(own.captureClickListeners));
    await step('close #1 (before switch)', CLOSE);
    await step('csCache()', `(() => { const s = csCache(); return { entries: s.entries, bytesUsed: s.bytesUsed, budgetBytes: s.budgetBytes, hits: s.hits, misses: s.misses, evictions: s.evictions, queue: s.queue, workerAlive: s.workerAlive, workerMs: s.workerMs }; })()`);
    await step('csSurface()', `(async () => { const s = csSurface(); const o = await s.done; return { ...o, terrainShares: undefined, head: document.querySelector('#cs-surface-preview div').textContent }; })()`);
    for (let i = 0; i < 3; i++) {
      const nx = await step(`csNextSystem() #${i + 1}`, 'csNextSystem()');
      if (!nx?.to) break;
      await sleep(4000);
      await step(`csSurfaceAll() in ${nx.to}`, `csSurfaceAll().done.then(o => ({ ...o, archetypes: undefined }))`);
      await step(`close in ${nx.to}`, CLOSE);
      await step(`csCache() after ${nx.to}`, `(() => { const s = csCache(); return { entries: s.entries, bytesUsed: s.bytesUsed, budgetBytes: s.budgetBytes, evictions: s.evictions, bytesPerSystem: s.bytesPerSystem }; })()`);
    }
    // Każdy krok close: przycisk istniał, klik doszedł (fired) i nakładka zniknęła.
    const closes = own.steps.filter(x => x.label.startsWith('close'));
    own.closeButton = closes.length >= 2 && closes.every(x => x.v?.had && x.v?.fired && x.v?.after === false);
    own.warnings = warns.slice(); own.exceptions = exc.slice();
    console.log('[owner] close', own.closeButton, 'warnings', JSON.stringify(own.warnings), 'exceptions', JSON.stringify(own.exceptions));
    result.owner = own;
    if (!own.closeButton || own.exceptions.length || own.warnings.length) exitCodeRef.v = 1;
    throw { ownerDone: true };
  }
  const sys1 = await page.evaluate('KOSMOS.activeSystemId ?? "sys_home"');
  result.gameCacheBefore = await page.evaluate('KOSMOS.surfaceCache.snapshot()');

  // P0 bezczynność
  await page.evaluate('__perfRec.start(), true');
  await sleep(3000);
  result.P0_idle = await page.evaluate('__perfRec.stop()');
  console.log('[P0 idle]', JSON.stringify(result.P0_idle));

  // P1 worker, zimny
  result.P1_worker = await page.evaluate(`(async () => {
    const { SC, fillSystem } = __cs4b;
    window.__cW = new SC.SurfaceCache({ eventBus: { on() {}, off() {}, emit() {} } });
    const r = await fillSystem(__cW, ${JSON.stringify(sys1)});
    delete r.maps;
    r.snapshot = __cW.snapshot();
    return r;
  })()`);
  console.log('[P1 worker]', JSON.stringify({ ...result.P1_worker, snapshot: undefined }));

  // P2 bohater przy pełnej kolejce (świeży cache, ciepły moduł w przeglądarce, ale nowy worker)
  result.P2_heroUnderLoad = await page.evaluate(`(async () => {
    const { SC, bodiesOf } = __cs4b;
    const c = new SC.SurfaceCache({ eventBus: { on() {}, off() {}, emit() {} } });
    const bodies = bodiesOf(${JSON.stringify(sys1)});
    const home = KOSMOS.homePlanet ?? bodies[0];
    const t0 = performance.now();
    const lods = bodies.map(b => c.request(b, SC.lodOf(b), SC.surfaceSystemPriority(b)));
    await new Promise(r => setTimeout(r, 30));                       // worker wstał i bake'uje pierwsze LOD-y
    const queuedAtHero = c.snapshot().queue;
    const th = performance.now();
    const hero = await c.request(home, 'hero', SC.SURFACE_PRIORITY.HERO);
    const heroWait = performance.now() - th;
    const lodsLeftAtHero = c.snapshot().queue;
    await Promise.all(lods);
    const total = performance.now() - t0;
    c.dispose();
    return { queuedAtHero, lodsLeftAtHero, heroWaitMs: +heroWait.toFixed(1), heroBakeMs: +hero.ms.toFixed(1), heroSource: hero.source, totalMs: +total.toFixed(1) };
  })()`);
  console.log('[P2 hero under load]', JSON.stringify(result.P2_heroUnderLoad));

  // P3 bohater sam (ciepły worker __cW)
  result.P3_heroAlone = await page.evaluate(`(async () => {
    const { SC, bodiesOf } = __cs4b;
    const home = KOSMOS.homePlanet ?? bodiesOf(${JSON.stringify(sys1)})[0];
    __perfRec.start();
    const t0 = performance.now();
    const m = await __cW.request(home, 'hero', SC.SURFACE_PRIORITY.HERO);
    const wait = performance.now() - t0;
    await new Promise(r => setTimeout(r, 200));
    return { name: home.name, waitMs: +wait.toFixed(1), bakeMs: +m.ms.toFixed(1), source: m.source, bytes: m.bytes, perf: __perfRec.stop() };
  })()`);
  console.log('[P3 hero alone]', JSON.stringify(result.P3_heroAlone));

  // P4 główny wątek
  result.P4_main = await page.evaluate(`(async () => {
    const { SC, fillSystem, bodiesOf } = __cs4b;
    window.__cM = new SC.SurfaceCache({ workerFactory: null, eventBus: { on() {}, off() {}, emit() {} } });
    const r = await fillSystem(__cM, ${JSON.stringify(sys1)});
    window.__mainMaps = r.maps; delete r.maps;
    const home = KOSMOS.homePlanet ?? bodiesOf(${JSON.stringify(sys1)})[0];
    __perfRec.start();
    const t0 = performance.now();
    const h = await __cM.request(home, 'hero', SC.SURFACE_PRIORITY.HERO);
    r.hero = { waitMs: +(performance.now() - t0).toFixed(1), bakeMs: +h.ms.toFixed(1), source: h.source };
    await new Promise(res => setTimeout(res, 200));
    r.hero.perf = __perfRec.stop();
    return r;
  })()`);
  console.log('[P4 main]', JSON.stringify(result.P4_main));

  // P5 bit w bit
  result.P5_identical = await page.evaluate(`(() => {
    let same = 0, n = 0;
    for (const k of __cM.keys()) {
      const a = __cM._entries.get(k), b = __cW._entries.get(k);
      if (!b) continue;
      n++;
      if (a.data.length === b.data.length && a.data.every((v, i) => v === b.data[i])) same++;
    }
    __cW.dispose(); __cM.dispose();
    return { compared: n, identical: same };
  })()`);
  console.log('[P5 worker = main]', JSON.stringify(result.P5_identical));

  // P6 ścieżka właściciela
  const ownerFill = async (label) => {
    await page.evaluate('__perfRec.start(), true');
    const r = await page.evaluate(`(async () => { const s = csSurfaceAll(); const out = await s.done;
      out.thumbs = document.querySelectorAll('#cs-surface-preview canvas').length; return out; })()`);
    await sleep(300);
    r.perf = await page.evaluate('__perfRec.stop()');
    r.cache = await page.evaluate('csCache()');
    console.log(`[${label}]`, JSON.stringify({ ...r, idleAfterSwitch: undefined, archetypes: undefined, cache: { entries: r.cache.entries, bytesUsed: r.cache.bytesUsed, evictions: r.cache.evictions, bytesPerSystem: r.cache.bytesPerSystem, mode: r.cache.mode } }));
    return r;
  };
  result.P6_sys1 = await ownerFill('P6 csSurfaceAll sys1');
  await page.evaluate('__perfRec.start(), true');
  result.P6_hero = await page.evaluate('(async () => { const s = csSurface(); return s && await s.done; })()');
  result.P6_hero.perf = await page.evaluate('__perfRec.stop()');
  result.P6_afterHero = await page.evaluate('csCache()');
  console.log('[P6 csSurface hero]', JSON.stringify({ ...result.P6_hero, terrainShares: undefined }), 'bytes', result.P6_afterHero.bytesUsed);
  result.P6_secondAll = await page.evaluate(`(async () => { const s = csSurfaceAll(); const o = await s.done; return { sources: o.sources, wallMs: o.wallMs }; })()`);
  console.log('[P6 csSurfaceAll again]', JSON.stringify(result.P6_secondAll));

  // P7 / P8 obce układy (wygenerowane jak przy odkryciu)
  const sysList = await page.evaluate(`(() => {
    const ssm = KOSMOS.starSystemManager, gd = KOSMOS.galaxyData;
    const cand = (gd.systems ?? gd.stars ?? []).filter(s => s.id !== 'sys_home' && s.id !== KOSMOS.activeSystemId);
    const out = [];
    for (const s of cand.slice(0, 12)) {
      try { ssm.generateAndRegister(s); } catch (e) { continue; }
      out.push({ id: s.id, bodies: __cs4b.bodiesOf(s.id).length });
    }
    return out.sort((a, b) => b.bodies - a.bodies);
  })()`);
  result.systemsGenerated = sysList;
  console.log('[systems]', JSON.stringify(sysList));
  result.perSystem = [];
  for (let i = 0; i < Math.min(5, sysList.length); i++) {
    const id = sysList[i].id;
    const ok = await page.evaluate(`KOSMOS.starSystemManager.switchActiveSystem(${JSON.stringify(id)})`);
    await sleep(6000);                                   // przełączenie przebudowuje scenę (tekstury ciał) — odczekaj
    await page.evaluate('__perfRec.start(), true');
    await sleep(3000);
    const idle = await page.evaluate('__perfRec.stop()');   // bezczynność PO przełączeniu — punkt odniesienia układu
    const r = await ownerFill(`P${i < 2 ? 7 : 8} sys${i + 2} ${id}`);
    console.log(`   idle po przełączeniu:`, JSON.stringify(idle));
    result.perSystem.push({ n: i + 2, id, switched: ok, bodies: sysList[i].bodies, wallMs: r.wallMs, bakeMsTotal: r.bakeMsTotal, sources: r.sources,
      thumbs: r.thumbs, idle, perf: r.perf, entries: r.cache.entries, bytesUsed: r.cache.bytesUsed, evictions: r.cache.evictions,
      evictedBytes: r.cache.evictedBytes, bytesPerSystem: r.cache.bytesPerSystem, staleDropped: r.cache.staleDropped, staleDiscarded: r.cache.staleDiscarded });
  }
  // Szybkie przełączenie w trakcie wypełniania: stare zadania porzucone, budżet trzymany.
  if (sysList.length >= 2) {
    result.switchMidFill = await page.evaluate(`(async () => {
      const ssm = KOSMOS.starSystemManager, c = KOSMOS.surfaceCache;
      c.clear();
      ssm.switchActiveSystem(${JSON.stringify(sysList[0].id)});
      const s = csSurfaceAll();
      await new Promise(r => setTimeout(r, 120));
      ssm.switchActiveSystem(${JSON.stringify(sysList[1].id)});
      const o = await s.done;
      const s2 = csSurfaceAll(); const o2 = await s2.done;
      const snap = c.snapshot();
      return { firstShown: o.shown, firstQueued: s.queued, secondShown: o2.shown, staleDropped: snap.staleDropped, staleDiscarded: snap.staleDiscarded,
        bytesPerSystem: snap.bytesPerSystem, bytesUsed: snap.bytesUsed, budget: snap.budgetBytes };
    })()`);
    console.log('[switch mid-fill]', JSON.stringify(result.switchMidFill));
  }
  result.finalCache = await page.evaluate('KOSMOS.surfaceCache.snapshot()');
  result.warnings = warns.slice();
  result.exceptions = exc.slice();
  const p1 = result.P1_worker, p4 = result.P4_main;
  result.ok = result.P5_identical.compared > 0 && result.P5_identical.identical === result.P5_identical.compared
    && p1.snapshot.mode === 'worker' && result.exceptions.length === 0 && result.warnings.length === 0
    && result.perSystem.every(s => s.bytesUsed <= result.finalCache.budgetBytes);
  if (!result.ok) exitCodeRef.v = 1;
  console.log('[final]', JSON.stringify({ ok: result.ok, finalCache: { ...result.finalCache, workerMs: result.finalCache.workerMs }, warnings: result.warnings, exceptions: result.exceptions }));
  page.close();
} catch (e) { if (!e?.ownerDone) { console.error('sonda:', e); exitCodeRef.v = 2; } }
finally {
  try { chrome.proc.kill(); } catch { /* nic */ }
  server.close();
  await sleep(500);
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* Chrome trzyma pliki */ }
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log(`SUMMARY probe-cs4b-cache: ${exitCodeRef.v === 0 ? 'PASS' : 'FAIL'}`);
process.exit(exitCodeRef.v);
