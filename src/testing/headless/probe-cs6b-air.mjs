// probe-cs6b-air — sonda kroku CS-6b (ARC COLONY SPHERE; plan §3.7): atmosfery, chmury, pokłady, ciała związane pływowo.
//
//   node src/testing/headless/probe-cs6b-air.mjs --compile   sonda kompilacji GLSL (powłoka + poświata) + kontrola, która MUSI paść
//   node src/testing/headless/probe-cs6b-air.mjs --sheets    cs6b-atmospheres / -clouds / -venus-titan / -tidally-locked /
//                                                            -moon-craters-ab / -field-v3 (.png)
//   node src/testing/headless/probe-cs6b-air.mjs --game      cs6b-systemmap-before-after.png + cs6b-mk-light.png + wydajność
//   node src/testing/headless/probe-cs6b-air.mjs --owner     skrypt właściciela 1:1 (obie flagi na ekranie tytułowym)
//   (bez trybu = pierwsze trzy)      --swiftshader  wymuś rasteryzację programową (domyślnie prawdziwe GPU)
//
// Prawdziwa gra / prawdziwe shadery w headless Chrome po CDP (wzór probe-cs6a-shader). Arkusze: wirtualna strona
// `/__cs6b` ładuje `cs6b-sheet-page.js`. PNG → docs/design/prototypes/. Kod wyjścia 1, gdy sonda kompilacji nie
// przejdzie, kontrola nie padnie albo krok właściciela nie spełni warunków.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT_DIR = path.join(REPO, 'docs/design/prototypes');
const has = (k) => process.argv.includes(k);
const ALL = !has('--compile') && !has('--sheets') && !has('--game') && !has('--owner') && !has('--perf') && !has('--gasspec') && !has('--evolution');
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
const SHEET_HTML = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{ "imports": { "three": "/src/lib/three.module.js" } }</script></head>
<body style="margin:0;background:#000"><script type="module" src="/src/testing/headless/cs6b-sheet-page.js"></script></body></html>`;

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    if (rel === '__blank') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><html><body style="margin:0;background:#000"></body></html>'); }
    if (rel === '__cs6b') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(SHEET_HTML); }
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs6b-'));
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
  console.log('[cs6b] zapisano', path.relative(REPO, file).replace(/\\/g, '/'), fs.statSync(file).size, 'B');
};

// Rejestrator klatek (rAF).
const PERF_SRC = String.raw`(() => {
  if (window.__perfRec) return true;
  const st = { frames: [], on: false, last: 0 };
  const px = new Uint8Array(4);
  const loop = (t) => { if (st.on && st.last) st.frames.push(t - st.last); st.last = t; if (st.on && window.__perfSync) { const gl = KOSMOS.threeRenderer.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } requestAnimationFrame(loop); };
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
  return true;
})()`;

// Stan powietrza i orientacji w aktywnym układzie (liczone w grze): ile powłok, czy na ciałach wspólnego shadera nie
// zostały dzisiejsze chmury / poświata, czy punkt podgwiezdny ciał związanych pływowo patrzy na gwiazdę.
const AIR_STATE = `(() => {
  const K = KOSMOS, tr = K.threeRenderer, st = tr.sharedSurfaceStats();
  const kids = (e, k) => e.group.children.filter(c => c.userData?.[k]).length;
  let legacyOnShared = 0, sharedAirPlanets = 0, legacyPlanets = 0, lockMin = 1, locks = 0;
  const arch = {};
  for (const e of tr._planets.values()) {
    const shared = e.mesh.material?.userData?.surfaceShader === true;
    const leg = kids(e, 'isCloud') + kids(e, 'isAtmosphere'), air = kids(e, 'isSharedAir');
    if (shared && leg) legacyOnShared++;
    if (air) { sharedAirPlanets++; arch[e.planet.bodyArchetype] = (arch[e.planet.bodyArchetype] ?? 0) + 1; }
    if (!shared && leg) legacyPlanets++;
    if (e.starLock) {
      const V = e.mesh.position.constructor;
      const d = new V(e.starLock[0], e.starLock[1], e.starLock[2]).applyQuaternion(e.mesh.quaternion);
      const s = tr._starGroup ? tr._starGroup.position : new V(0, 0, 0);
      const to = new V(s.x - e.group.position.x, 0, s.z - e.group.position.z).normalize();
      lockMin = Math.min(lockMin, d.dot(to)); locks++;
    }
  }
  let hazyMoons = 0;
  for (const e of tr._moons.values()) if (e.mesh.children.some(c => c.userData?.isSharedAir)) hazyMoons++;
  return { system: K.activeSystemId ?? 'sys_home', star: tr._star?.spectralType, shared: st.bodies, air: st.air, locked: st.locked, locks,
    lockDotMin: +lockMin.toFixed(5), sharedAirPlanets, hazyMoons, legacyOnShared, legacyPlanets, airArchetypes: arch };
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

  if (ALL || has('--compile') || has('--sheets') || has('--evolution')) {
    await page.send('Page.navigate', { url: `${base}/__cs6b` });
    await page.waitFor(`!!window.__cs6b`, 'strona arkusza', 60000);
  }

  if (ALL || has('--compile')) {
    const rows = await page.evaluate(`__cs6b.compileProbe()`);
    result.compile = rows;
    for (const r of rows) {
      const ok = r.broken ? r.errors.length > 0 : (r.errors.length === 0 && r.lit > 30 && r.hasLogDepthChunk === r.logDepth);
      console.log(`[compile] ${r.which} logDepth=${r.logDepth} ${r.broken ? 'KONTROLA (ma paść)' : 'program gry'} → ${ok ? 'OK' : 'FAIL'}`,
        r.broken ? `błąd: ${(r.errors[0] ?? 'BRAK').split('\n')[0].slice(0, 110)}` : `jasność ${r.lit} błędy ${r.errors.length}`);
      if (!ok) { exitCodeRef.v = 1; if (!r.broken && r.errors.length) console.log(r.errors.join('\n')); }
    }
    console.log('[compile] GPU:', rows[0]?.gpu);
  }

  if (ALL || has('--sheets') || has('--evolution')) {
    const sheets = [['renderAtmospheres', 'cs6b-atmospheres.png'], ['renderCloudVariety', 'cs6b-clouds.png'], ['renderCloudEvolution', 'cs6b-clouds-evolution.png'], ['renderVenusTitan', 'cs6b-venus-titan.png'],
      ['renderTidallyLocked', 'cs6b-tidally-locked.png'], ['renderMoonCratersAB', 'cs6b-moon-craters-ab.png'], ['renderFieldV3', 'cs6b-field-v3.png']];
    result.sheets = {};
    for (const [fn, file] of sheets) {
      if (has('--evolution') && !has('--sheets') && !/clouds/.test(file)) continue;
      const s = await page.evaluate(`__cs6b.${fn}()`);
      savePng(file, s.png);
      result.sheets[file] = [s.w, s.h];
      result.sheets.gpu = s.gpu;
    }
    console.log('[sheets] GPU:', result.sheets.gpu);
  }

  // ── Wspólne kroki gry ──────────────────────────────────────────────────────────────────────────────
  const bootGame = async (sharedOnAtTitle) => {
    await page.send('Page.navigate', { url: `${base}/index.html` });
    await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł');
    if (sharedOnAtTitle) await page.evaluate('KOSMOS.gameConfig.FEATURES.sharedSurface=true');
    await page.evaluate('KOSMOS.gameConfig.FEATURES.seededSystems=true');
    await page.evaluate(`document.querySelector('[data-action="new"]').click(), true`);
    await page.waitFor(`!!document.querySelector('.fs-leader-card')`, 'lider');
    await page.evaluate(`document.querySelector('.fs-leader-card').click(), true`);
    await page.waitFor(`!!document.querySelector('#fs-start')`, 'start');
    await page.evaluate(`document.querySelector('#fs-start').click(), true`);
    await page.waitFor(`typeof window.csShared === 'function' && !!window.KOSMOS?.surfaceCache`, 'GameScene');
    await page.waitFor(`window.KOSMOS?.gameScene?._introLockActive === false`, 'koniec intro', 240000);
    await sleep(2500);
    // Narracja startowa (bloki .tw-block → ESC; pole nazwy → Enter) zasłania kadr — zamknij ją.
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
    await page.evaluate(`KOSMOS.overlayManager?.closeActive?.(), true`);
    await sleep(800);
    await page.evaluate(PERF_SRC);
  };
  const waitTextured = async (t0expr) => { await page.waitFor(`(() => { const s = KOSMOS.threeRenderer.sharedSurfaceStats(); return s.bodies > 0 && s.pending === 0; })()`, 'mapy powierzchni', 120000); return page.evaluate(`({ ms: Math.round(performance.now() - ${t0expr}), ...KOSMOS.threeRenderer.sharedSurfaceStats() })`); };
  const shot = async () => (await page.send('Page.captureScreenshot', { format: 'png' })).data;
  // Kadr: zbliżenie na ciało od strony dnia, z terminatorem (kamera 55° od kierunku na gwiazdę).
  const focus = async (pick) => page.evaluate(`(() => {
    const K = KOSMOS, tr = K.threeRenderer, sys = K.activeSystemId ?? 'sys_home';
    const planets = K.entityManager.getByTypeInSystem('planet', sys).filter(p => p.planetType !== 'gas');
    const body = ${pick};
    if (!body) return null;
    tr._focusVesselId = null; tr._focusStationId = null; tr._focusEntityId = body.id;
    const r = tr._getEntityRadius(body);
    const a = Math.atan2(-body.y, -body.x) + 0.96;
    const cc = tr._cameraController;
    cc.setMinDist(0.3);
    const pe = tr._planets.get(body.id);
    if (pe) cc.applyView({ target: { x: pe.group.position.x, y: 0, z: pe.group.position.z } });
    cc.applyView({ theta: a, phi: 1.22, dist: Math.max(r * 4.2, 0.3) });
    return { id: body.id, name: body.name, archetype: body.bodyArchetype, atmosphere: body.atmosphere, tidallyLocked: body.tidallyLocked === true, r: +r.toFixed(3) };
  })()`);
  const wide = async () => page.evaluate(`(() => { const cc = KOSMOS.threeRenderer._cameraController; KOSMOS.threeRenderer._focusEntityId = null; cc.applyView({ theta: 0.3, phi: 1.0, dist: 60, target: { x: 0, y: 0, z: 0 } }); return cc._dist; })()`);
  const nextSystem = async () => {
    const r = await page.evaluate(`(() => { window.__t0 = performance.now(); const r = csNextSystem(); return { ...r, syncMs: Math.round(performance.now() - window.__t0) }; })()`);
    const tex = await waitTextured('window.__t0');
    return { ...r, texturedMs: tex.ms, bodies: tex.bodies };
  };
  const compose = async (shots, title, name, cols = 2) => {
    await page.send('Page.navigate', { url: `${base}/__blank` });
    await sleep(400);
    await page.evaluate(`window.__shots = []`);
    for (const s of shots) await page.evaluate(`window.__shots.push({ label: ${JSON.stringify(s.label)}, src: 'data:image/png;base64,${s.data}' }), true`);
    const sheet = await page.evaluate(`(async () => {
      const imgs = await Promise.all(__shots.map(s => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = s.src; })));
      const cols = ${cols}, cw = cols === 1 ? 1600 : 1000, ch = Math.round(cw * imgs[0].height / imgs[0].width), lab = 26, rows = Math.ceil(imgs.length / cols);
      const c = document.createElement('canvas'); c.width = cw * cols; c.height = (ch + lab) * rows + 30;
      const g = c.getContext('2d'); g.fillStyle = '#04060a'; g.fillRect(0, 0, c.width, c.height);
      g.font = 'bold 15px Consolas, monospace'; g.fillStyle = '#e6eef6'; g.textBaseline = 'top';
      g.fillText(${JSON.stringify(title)}, 10, 8);
      imgs.forEach((im, k) => { const x = (k % cols) * cw, y = 30 + Math.floor(k / cols) * (ch + lab);
        g.font = '13px Consolas, monospace'; g.fillStyle = '#9fb4c8'; g.fillText(__shots[k].label, x + 8, y + 6); g.drawImage(im, x, y + lab, cw, ch); });
      return c.toDataURL('image/png');
    })()`);
    savePng(name, sheet);
  };

  if (ALL || has('--game')) {
    await bootGame(false);
    const game = result.game = { steps: [] };
    game.gpu = await page.evaluate(`(() => { const gl = KOSMOS.threeRenderer.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()`);
    const measure = async (label, ms = 5000) => { await page.evaluate(`__perfRec.start()`); await sleep(ms); const p = await page.evaluate(`__perfRec.stop()`); game.steps.push({ label, ...p }); console.log(`[perf] ${label}`, JSON.stringify(p)); return p; };
    const shots = [];
    const HOME = `(K.homePlanet && planets.find(p => p.id === K.homePlanet.id)) || planets[0]`;

    // ── Układ domowy, flaga OFF ──
    game.airOff = await page.evaluate(AIR_STATE);
    await wide(); await sleep(1500);
    await measure('home · OFF · full system view');
    game.focus1 = await focus(HOME);
    await sleep(2500);
    await measure('home · OFF · close-up');
    shots.push({ label: `home system · ${game.focus1?.name} (${game.focus1?.archetype}) · sharedSurface OFF (today)`, data: await shot() });

    // ── Układ domowy, flaga ON ──
    game.toggleOn = await page.evaluate(`(() => { window.__t0 = performance.now(); return csShared(); })()`);
    game.texturedAfterToggle = await waitTextured('window.__t0');
    await page.waitFor(`KOSMOS.threeRenderer.sharedSurfaceStats().heroReady === true`, 'mapa bohatera na zbliżeniu', 60000).catch(() => {});
    await sleep(1200);
    game.airOn = await page.evaluate(AIR_STATE);
    console.log('[game] home OFF', JSON.stringify(game.airOff));
    console.log('[game] home ON ', JSON.stringify(game.airOn));
    shots.push({ label: `home system · ${game.focus1?.name} · sharedSurface ON (atmosphere + clouds per archetype)`, data: await shot() });
    await measure('home · ON · close-up');
    await wide(); await sleep(1500);
    await measure('home · ON · full system view');

    // ── Zmiana układu przy ON (czas przełączenia) + szukanie układów: pokład / mgła, potem M / K z gazowcem i księżycem ──
    game.switches = [];
    let deck = null, mk = null, lockSeen = null;
    const MK_PICK = `(() => {
      const K = KOSMOS, tr = K.threeRenderer, sys = K.activeSystemId ?? 'sys_home', cls = tr._star?.spectralType;
      if (cls !== 'M' && cls !== 'K') return null;
      const gas = K.entityManager.getByTypeInSystem('planet', sys).filter(p => p.planetType === 'gas');
      const moons = K.entityManager.getByTypeInSystem('moon', sys);
      // Najlepsza para: księżyc po stronie GWIAZDY swojego gazowca (kamera od strony gwiazdy widzi oświetlony księżyc na tle oświetlonego gazowca).
      let best = null;
      for (const g of gas) for (const m of moons) {
        if (m.parentPlanetId !== g.id || !tr._sharedSurfaces.has(m.id)) continue;
        const dx = m.x - g.x, dy = m.y - g.y, dl = Math.hypot(dx, dy) || 1, sl = Math.hypot(g.x, g.y) || 1;
        const score = (dx * -g.x + dy * -g.y) / (dl * sl);
        if (!best || score > best.score) best = { cls, gas: g.id, gasName: g.name, moon: m.id, moonName: m.name, moonArch: m.bodyArchetype, score: +score.toFixed(2) };
      }
      return best && best.score > (window.__mkThr ?? 0.45) ? best : null;
    })()`;
    const DECK_PICK = `(() => { const K = KOSMOS, sys = K.activeSystemId ?? 'sys_home'; const p = K.entityManager.getByTypeInSystem('planet', sys).find(p => p.bodyArchetype === 'hothouse' || p.bodyArchetype === 'cryo_haze'); return p ? { id: p.id, name: p.name, archetype: p.bodyArchetype } : null; })()`;
    for (let i = 0; i < 24 && !(deck && mk && lockSeen); i++) {
      const sw = await nextSystem();
      if (i === 6) await page.evaluate(`window.__mkThr = -2, true`);   // po dwóch obiegach układów: dowolna para gazowiec + księżyc
      const air = await page.evaluate(AIR_STATE);
      game.switches.push({ ...sw, star: air.star, air: air.air, locked: air.locked, lockDotMin: air.lockDotMin, legacyOnShared: air.legacyOnShared });
      console.log('[game] układ', JSON.stringify(game.switches.at(-1)));
      if (!lockSeen && air.locks > 0) lockSeen = { system: air.system, locks: air.locks, lockDotMin: air.lockDotMin };
      if (!deck) {
        const d = await page.evaluate(DECK_PICK);
        if (d) {
          deck = { ...d, system: air.system, star: air.star };
          game.focus2 = await focus(`planets.find(p => p.id === ${JSON.stringify(d.id)})`);
          await sleep(3000);
          const on = await shot();
          game.toggleOff = await page.evaluate(`csShared()`);
          await sleep(2500);
          shots.push({ label: `${air.system} (star ${air.star}) · ${d.name} (${d.archetype}) · sharedSurface OFF (today)`, data: await shot() });
          shots.push({ label: `${air.system} · ${d.name} (${d.archetype}) · sharedSurface ON (deck / haze hides the surface)`, data: on });
          await page.evaluate(`(() => { window.__t0 = performance.now(); return csShared(); })()`);
          await waitTextured('window.__t0');
        }
      }
      if (!mk) {
        const m = await page.evaluate(MK_PICK);
        if (m) {
          mk = { ...m, system: air.system };
          // Stacja na orbicie skalistego księżyca gazowca; kamera po stronie przeciwnej do gazowca, lekko z boku.
          mk.station = await page.evaluate(`(() => { const st = KOSMOS.debug.spawnStation(${JSON.stringify(m.moon)}); return st ? st.id : null; })()`);
          await sleep(1500);
          mk.frames = [];
          // Najpierw kamera od strony GWIAZDY (oświetlone półkule w kadrze), potem — awaryjnie — po stronie przeciwnej do gazowca.
          for (const [ref, off] of [['gas', 0.22], ['gas', -0.22], ['gas', 0.36], ['gas', -0.36], ['gas', 0.12], ['gas', -0.12], ['gas', 0.5], ['gas', -0.5]]) {
            const info = await page.evaluate(`(() => {
              const K = KOSMOS, tr = K.threeRenderer, cc = tr._cameraController;
              const me = tr._moons.get(${JSON.stringify(m.moon)}), ge = tr._planets.get(${JSON.stringify(m.gas)}), se = tr._stations.get(${JSON.stringify(mk.station)});
              if (!me || !ge) return null;
              const mp = me.mesh.position, gp = ge.group.position;
              const sp = se?.mesh?.position ?? mp;
              const rm = me.mesh.geometry.parameters.radius;
              tr._focusVesselId = null; tr._focusStationId = null; tr._focusEntityId = null;
              cc.setMinDist(0.02);
              const sep = Math.hypot(sp.x - mp.x, sp.z - mp.z);
              cc.applyView({ target: { x: (mp.x + sp.x) / 2, y: 0, z: (mp.z + sp.z) / 2 }, theta: (${JSON.stringify(ref)} === 'star' ? Math.atan2(-mp.z, -mp.x) : Math.atan2(mp.z - gp.z, mp.x - gp.x)) + ${off}, phi: 1.36, dist: Math.max(rm * 7, sep * 2.4) });
              return { rm, sep, giantDist: Math.hypot(mp.x - gp.x, mp.z - gp.z) };
            })()`);
            await sleep(700);
            const ndc = await page.evaluate(`(() => {
              const tr = KOSMOS.threeRenderer, cam = tr.camera;
              const me = tr._moons.get(${JSON.stringify(m.moon)}), ge = tr._planets.get(${JSON.stringify(m.gas)}), se = tr._stations.get(${JSON.stringify(mk.station)});
              const pr = (p) => { if (!p) return null; const v = p.clone().project(cam); return [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(3)]; };
              return { moon: pr(me.mesh.position), gas: pr(ge.group.position), station: pr(se?.mesh?.position), lights: tr.scene.children.filter(o => o.isPointLight && o.visible).length, fill: tr.sharedSurfaceStats().fillLight };
            })()`);
            const inView = (v) => v && Math.abs(v[0]) < 0.7 && Math.abs(v[1]) < 0.8 && v[2] < 1;   // ±0.7: poza bocznymi panelami UI
            const apart = ndc.moon && ndc.gas && Math.hypot(ndc.moon[0] - ndc.gas[0], ndc.moon[1] - ndc.gas[1]) > 0.25;
            mk.frames.push({ ref, off, ...info, ...ndc, ok: inView(ndc.moon) && inView(ndc.gas) && inView(ndc.station) && apart });
            if (mk.frames.at(-1).ok) break;
          }
          mk.chosen = mk.frames.at(-1);
          await sleep(2500);
          mk.label = `${air.system} · star class ${m.cls} · rocky moon ${m.moonName} (${m.moonArch}) + gas giant ${m.gasName} + orbital station · sharedSurface ON · one camera frame · lights: star + fill (${mk.chosen.lights} PointLights)`;
          mk.data = await shot();
          console.log('[game] kadr M/K', JSON.stringify({ ...mk, data: undefined }));
          game.mk = mk;
        }
      }
    }
    game.deck = deck; game.lockSeen = lockSeen;
    if (!mk) console.log('[game] ⚠ nie znaleziono układu M / K z gazowcem i skalistym księżycem — brak cs6b-mk-light.png');
    if (!deck) console.log('[game] ⚠ nie znaleziono planety hothouse / cryo_haze w odwiedzonych układach');
    if (mk?.data) await compose([{ label: mk.label, data: mk.data }], 'CS-6b · light check (D-CS-21) · rock, gas giant and station under the same softened star light', 'cs6b-mk-light.png', 1);
    if (shots.length) {
      // compose() nawiguje poza grę — to ostatni krok trybu.
      await compose(shots, 'CS-6b · system map · FEATURES.sharedSurface OFF (left, today) vs ON (right) · same camera · home system + one other', 'cs6b-systemmap-before-after.png', 2);
    }
  }

  // ── --perf [--uncapped]: czas klatki w układzie domowym przy fladze ON (szeroki kadr + zbliżenie na planetę domową) ──
  // `--uncapped` zdejmuje vsync (limit 60 kl./s ukrywa różnice) — porównanie buildów „przed / po" na tym samym GPU.
  if (has('--perf')) {
    await bootGame(true);
    await waitTextured('0');
    const perf = result.perf = { uncapped: has('--uncapped'), steps: [] };
    await page.evaluate(`window.__perfSync = ${has('--uncapped')}, true`);
    const measure = async (label, ms = 6000) => { await page.evaluate(`__perfRec.start()`); await sleep(ms); const p = await page.evaluate(`__perfRec.stop()`); perf.steps.push({ label, ...p }); console.log(`[perf] ${label}`, JSON.stringify(p)); };
    await wide(); await sleep(1500);
    await measure('home · ON · full system view');
    perf.focus = await focus(`(K.homePlanet && planets.find(p => p.id === K.homePlanet.id)) || planets[0]`);
    await page.waitFor(`KOSMOS.threeRenderer.sharedSurfaceStats().heroReady === true`, 'mapa bohatera', 60000).catch(() => {});
    await sleep(1500);
    await measure('home · ON · close-up');
    await page.evaluate(`KOSMOS.threeRenderer._cameraController.applyView({ dist: ${Math.max((perf.focus?.r ?? 1) * 2.4, 0.3)} }), true`);
    await sleep(1000);
    await measure('home · ON · close-up, disc fills the frame');
    perf.air = await page.evaluate(AIR_STATE);
    console.log('[perf] stan', JSON.stringify(perf.air), JSON.stringify(perf.focus));
  }

  // ── --gasspec: skąd biała plama na gazowcu? Ten sam kadr (kamera od strony gwiazdy): ON · ON bez dopełnienia · OFF ──
  if (has('--gasspec')) {
    await bootGame(true);
    await waitTextured('0');
    const gs = result.gasspec = {};
    const GAS = `(() => { const K = KOSMOS, sys = K.activeSystemId ?? 'sys_home'; if (!['M', 'K'].includes(K.threeRenderer._star?.spectralType)) return null; const g = K.entityManager.getByTypeInSystem('planet', sys).filter(p => p.planetType === 'gas').sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0]; return g ? { id: g.id, name: g.name } : null; })()`;
    let gas = await page.evaluate(GAS);
    for (let i = 0; i < 30 && !gas; i++) { await nextSystem(); gas = await page.evaluate(GAS); }
    if (!gas) throw new Error('brak gazowca');
    gs.gas = gas; gs.star = await page.evaluate(`KOSMOS.threeRenderer._star?.spectralType`);
    const frame = () => page.evaluate(`(() => {
      const tr = KOSMOS.threeRenderer, cc = tr._cameraController, e = tr._planets.get(${JSON.stringify(gas.id)}), g = e.group.position;
      tr._focusVesselId = null; tr._focusStationId = null; tr._focusEntityId = ${JSON.stringify(gas.id)};
      const r = tr._getEntityRadius(e.planet);
      cc.setMinDist(0.3);
      cc.applyView({ target: { x: g.x, y: 0, z: g.z } });
      cc.applyView({ theta: Math.atan2(-e.planet.y, -e.planet.x) + 0.35, phi: 1.25, dist: Math.max(r * 4.2, 0.3) });
      return r;
    })()`);
    // Statystyka jasności tarczy (środkowe 60% promienia) ze zrzutu ekranu — liczone w stronie gry na płótnie pomocniczym.
    const stat = async (data) => page.evaluate(`(async () => {
      const tr = KOSMOS.threeRenderer, cam = tr.camera, e = tr._planets.get(${JSON.stringify(gas.id)});
      const c = e.group.position.clone().project(cam);
      const up = e.group.position.clone().add(cam.up.clone().applyQuaternion(cam.quaternion).multiplyScalar(0)).project(cam);
      const edge = e.group.position.clone().add(new c.constructor(0, 1, 0).applyQuaternion(cam.quaternion).multiplyScalar(tr._getEntityRadius(e.planet))).project(cam);
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,${data}'; });
      const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
      const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
      const cx = (c.x * 0.5 + 0.5) * im.width, cy = (1 - (c.y * 0.5 + 0.5)) * im.height, R = Math.abs(edge.y - c.y) * 0.5 * im.height * 0.6;
      const d = g.getImageData(Math.round(cx - R), Math.round(cy - R), Math.round(2 * R), Math.round(2 * R)).data;
      let mx = 0, sum = 0, n = 0, mr = 0, mg = 0, mb = 0;
      for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; sum += l; n++; if (l > mx) { mx = l; mr = d[i]; mg = d[i + 1]; mb = d[i + 2]; } }
      return { cx: Math.round(cx), cy: Math.round(cy), R: Math.round(R), meanLum: +(sum / n).toFixed(1), maxLum: +mx.toFixed(1), maxRGB: [mr, mg, mb],
        lights: tr.scene.children.filter(o => o.isPointLight && o.visible).map(o => [+o.color.r.toFixed(3), +o.color.g.toFixed(3), +o.color.b.toFixed(3), +o.intensity.toFixed(2), o.distance]) };
    })()`);
    const shots = [];
    const take = async (label) => { await frame(); await sleep(1800); const data = await shot(); const st = await stat(data); gs[label] = st; console.log('[gasspec]', label, JSON.stringify(st)); shots.push({ label: `${gas.name} · star ${gs.star} · ${label} · disc centre mean ${st.meanLum} max ${st.maxLum} rgb ${st.maxRGB}`, data }); };
    await page.evaluate(`KOSMOS.timeSystem?.pause?.(), true`);
    await take('sharedSurface ON (this build: fill light tints only)');
    gs.marker = await page.evaluate(`(() => { const f = KOSMOS.threeRenderer._sharedFillLight; const d = f.distance; f.distance = 0; return d; })()`);
    await take('ON, fill light WITH specular (previous CS-6b build; control)');
    await page.evaluate(`(() => { KOSMOS.threeRenderer._sharedFillLight.distance = ${gs.marker}; return true; })()`);
    await page.evaluate(`csShared()`);
    await take('sharedSurface OFF (today)');
    await compose(shots, 'CS-6b tuning · gas giant highlight · same camera, same paused frame', 'cs6b-gas-highlight.png', 3);
  }

  if (has('--owner')) {
    // Dokładnie ścieżka właściciela: obie flagi na ekranie tytułowym → nowa gra → zbliżenia → csNextSystem() → csShared() A/B.
    const own = result.owner = {};
    await bootGame(true);
    await waitTextured('0');
    own.start = await page.evaluate(AIR_STATE);
    // Zegar pogody = zegar gry: przyrost fazy chmur w 3 s czasu realnego przy pauzie / 1 d/s / 1 r/s (sufit).
    const phaseStep = async (setup) => page.evaluate(`(async () => {
      const ts = KOSMOS.timeSystem, tr = KOSMOS.threeRenderer; ${setup};
      const rec = [...tr._sharedSurfaces.values()].find(r => r.air && r.air.look.cloudCoverage > 0) ?? [...tr._sharedSurfaces.values()].find(r => r.air);
      const p0 = rec.air.phase, a0 = rec.air.angle, u0 = rec.air.shell.material.uniforms.uFlow.value[0];
      // Współobrót: powłoka planety ma w każdej klatce orientację obracającej się siatki ciała.
      const pe = [...tr._planets.values()].find(e => e.group === rec.air.shell.parent), q0 = pe ? pe.mesh.quaternion.clone() : null;
      await new Promise(r => setTimeout(r, 3000));
      return { dPhaseCycles: +(rec.air.phase - p0).toFixed(5), dAngle: +(rec.air.angle - a0).toFixed(5), uniformFollows: rec.air.shell.material.uniforms.uFlow.value[0] === rec.air.phase && u0 === p0,
        bodyTurnedRad: pe ? +(2 * Math.acos(Math.min(1, Math.abs(q0.dot(pe.mesh.quaternion))))).toFixed(4) : null, shellVsBodyRad: pe ? +(2 * Math.acos(Math.min(1, Math.abs(rec.air.shell.quaternion.dot(pe.mesh.quaternion))))).toFixed(6) : null, cycleS: +(1 / rec.air.look.evolve).toFixed(0), paused: ts.isPaused, mult: ts.multiplier };
    })()`);
    own.clock = { paused: await phaseStep('ts.pause()'), normal: await phaseStep('ts.setMultiplier(1); ts.isPaused = false'), faster: await phaseStep('ts.setMultiplier(2); ts.isPaused = false'), fastest: await phaseStep('ts.setMultiplier(ts.multipliers.length - 1); ts.isPaused = false') };
    await page.evaluate(`KOSMOS.timeSystem.setMultiplier(1), true`);
    console.log('[owner] zegar pogody', JSON.stringify(own.clock));
    const ck = own.clock;
    if (!(ck.paused.dPhaseCycles === 0 && ck.paused.dAngle === 0 && ck.normal.dPhaseCycles > 0 && ck.faster.dPhaseCycles > ck.normal.dPhaseCycles * 1.55 && ck.faster.dPhaseCycles < ck.normal.dPhaseCycles * 1.9 && ck.fastest.dPhaseCycles > ck.normal.dPhaseCycles && ck.fastest.dPhaseCycles < ck.normal.dPhaseCycles * 2.65 && ck.normal.uniformFollows && ck.normal.bodyTurnedRad > 0.01 && ck.normal.shellVsBodyRad < 0.02 && ck.faster.shellVsBodyRad < 0.02)) { console.log('[owner] ⚠ zegar pogody: warunki NIE spełnione'); exitCodeRef.v = 1; }
    own.haze = await page.evaluate(`(() => { const tr = KOSMOS.threeRenderer; const id = [...tr._sharedSurfaces].find(([, r]) => r.air)?.[0]; if (!id) return null;
      const before = tr.bodyHazeOpacity(id); const set = tr.bodyHazeOpacity(id, 0.2); const read = tr.bodyHazeOpacity(id); tr.bodyHazeOpacity(id, before); return { id, before, set, read, restored: tr.bodyHazeOpacity(id) }; })()`);
    own.off = await page.evaluate(`csShared()`);
    await sleep(1500);
    own.offState = await page.evaluate(AIR_STATE);
    own.on = await page.evaluate(`(() => { window.__t0 = performance.now(); return csShared(); })()`);
    await waitTextured('window.__t0');
    own.onState = await page.evaluate(AIR_STATE);
    own.systems = [];
    for (let i = 0; i < 6; i++) { await nextSystem(); own.systems.push(await page.evaluate(AIR_STATE)); }
    // Pomocniki właściciela: csDeck() → kamera na pokład / mgłę, csHaze(0.3) / csHaze() → parametr i powrót, csLocked().
    own.deck = await page.evaluate(`csDeck()`);
    await waitTextured('0');
    own.hazeCmd = await page.evaluate(`(() => { const a = csHaze(0.3); const b = csHaze(); return { a, b }; })()`);
    own.lockedCmd = await page.evaluate(`csLocked()`);
    await waitTextured('0');
    await sleep(1500);
    own.lockedState = await page.evaluate(AIR_STATE);
    own.leak = await page.evaluate(`(() => { const i = KOSMOS.threeRenderer.renderer.info; return { textures: i.memory.textures, geometries: i.memory.geometries, programs: i.programs?.length ?? null }; })()`);
    console.log('[owner] start', JSON.stringify(own.start));
    console.log('[owner] hazeOpacity', JSON.stringify(own.haze));
    console.log('[owner] OFF', JSON.stringify(own.offState));
    console.log('[owner] ON ', JSON.stringify(own.onState));
    for (const s of own.systems) console.log('[owner] układ', JSON.stringify(s));
    console.log('[owner] csDeck', JSON.stringify(own.deck), 'csHaze', JSON.stringify(own.hazeCmd));
    console.log('[owner] csLocked', JSON.stringify(own.lockedCmd), JSON.stringify(own.lockedState));
    console.log('[owner] zasoby', JSON.stringify(own.leak));
    const all = [own.start, own.onState, ...own.systems];
    // D-CS-23: ile planet archetypu tidally_locked ma galaktyka (csLocked() = null jest poprawne tylko przy zerze) oraz
    // świadek: planety z samą FLAGĄ tidallyLocked (inny archetyp) w aktywnym układzie nie mają orientacji ku gwieździe.
    own.lockArchetypesInGalaxy = await page.evaluate(`[...KOSMOS.entityManager.entities.values()].filter(b => b.type === 'planet' && b.bodyArchetype === 'tidally_locked').length`).catch(() => -1);
    const flagOnly = await page.evaluate(`(() => { const tr = KOSMOS.threeRenderer; const out = []; let n = 0;
      for (const e of tr._planets.values()) if (e.planet.tidallyLocked === true && e.planet.bodyArchetype !== 'tidally_locked') { n++; out.push({ name: e.planet.name, archetype: e.planet.bodyArchetype, starLock: !!e.starLock }); }
      return { n, out }; })()`);
    own.flagOnly = flagOnly.n; own.flagOnlySpin = flagOnly.out;
    console.log('[owner] D-CS-23', JSON.stringify({ lockArchetypesInGalaxy: own.lockArchetypesInGalaxy, flagOnlyHere: flagOnly.out }));
    const ok = own.start.air > 0 && all.every(s => s.legacyOnShared === 0 && s.lockDotMin > 0.999 && s.locks === s.locked)
      && own.offState.air === 0 && own.offState.locked === 0 && own.offState.sharedAirPlanets === 0 && own.offState.legacyPlanets > 0
      && own.haze && Math.abs(own.haze.read - 0.2) < 1e-6 && own.haze.restored === own.haze.before
      && ['hothouse', 'cryo_haze', 'hazy_moon'].includes(own.deck?.archetype) && own.hazeCmd?.a?.hazeOpacity === 0.3 && own.hazeCmd?.b?.hazeOpacity === own.hazeCmd?.b?.archetypeDefault
      && (own.lockedCmd ? (own.lockedCmd.archetype === 'tidally_locked' && own.lockedState.locked > 0 && own.lockedState.lockDotMin > 0.999) : own.lockArchetypesInGalaxy === 0)
      && own.flagOnlySpin?.every(r => r.starLock === false) && own.flagOnlySpin.length === own.flagOnly;
    console.log('[owner] warunki:', ok ? 'OK' : 'FAIL');
    if (!ok) exitCodeRef.v = 1;
  }

  result.exceptions = exc; result.consoleErrors = errs.slice(0, 12);
  // „AudioContext is closed" pada po opuszczeniu strony gry przez compose() (składanie arkusza) — to nie jest błąd kroku.
  const realExc = exc.filter(e => !e.includes('AudioContext is closed'));
  if (realExc.length) { console.log('[cs6b] WYJĄTKI:', realExc.slice(0, 5)); exitCodeRef.v = 1; }
  if (errs.length) console.log('[cs6b] console.error:', errs.slice(0, 6));
  const out = path.join(os.tmpdir(), 'cs6b-probe-result.json');
  fs.writeFileSync(out, JSON.stringify(result, (k, v) => (k === 'png' || k === 'data' ? undefined : v), 2));
  console.log('[cs6b] wynik →', out);
  page.close();
} catch (e) {
  console.error('[cs6b] BŁĄD SONDY:', e?.message ?? e);
  exitCodeRef.v = 1;
} finally {
  try { chrome.proc.kill(); } catch { /* nic */ }
  server.close();
  await sleep(300);
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* Chrome trzyma pliki */ }
}
process.exit(exitCodeRef.v);
