// KOSMOS — CS-PHYS-b2 sonda żywego silnika (headless Chrome + CDP, prawdziwy tytuł → nowa gra): świat realisticClimate +
// scaledOrbits, układ domowy karła M (ponawia nową grę, aż dom trafi na M): klik planet wewnętrznych (ramka startowa
// i zbliżenie), rozkaz lotu do domu i do ciała wewnętrznego (bez odbicia od strefy Słońca), kolonia otwórz / zamknij,
// zero wyjątków i console.error.
// Uruchomienie: node src/testing/headless/probe-cs-phys-b2-live.mjs [--tries N] [--out plik.json]
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ROOT = path.resolve(arg('--root', REPO));
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-csphysb2-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--mute-audio', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--window-size=1600,900', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' });
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



// Kod strony (moduły dzielą instancje z grą)
const PAGE_CHECK = "(async () => {\n  const K = window.KOSMOS, tr = K.threeRenderer, ctrl = tr._cameraController;\n  const EM = (await import('/src/core/EntityManager.js')).default;\n  const { ORDER_TYPES } = await import('/src/data/MovementOrderTypes.js');\n  const star = EM.getStarOfSystem('sys_home');\n  const planets = EM.getByTypeInSystem('planet', 'sys_home').sort((a, b) => a.orbital.a - b.orbital.a);\n  const home = K.homePlanet;\n  const out = { cls: star.spectralType, L: star.luminosity, k: star.systemScale, orbitModel: K.galaxyData?.orbitModel ?? null,\n    climateModel: K.galaxyData?.climateModel ?? null, homeA: home?.orbital?.a, homeT: home?.temperatureC,\n    sunCoreWU: tr._sunCoreRadius, planets: planets.length, clicks: [], orders: [], colony: null };\n  const V3 = tr.camera.position.constructor;\n  const pick = (p) => {\n    tr.scene?.updateMatrixWorld?.(true); tr.camera.updateMatrixWorld();\n    const wi = tr.getBodyWorldInfo(p.id); if (!wi) return { id: p.id, err: 'brak mesha' };\n    const v = new V3(wi.x ?? wi.position?.x, wi.y ?? wi.position?.y ?? 0, wi.z ?? wi.position?.z).project(tr.camera);\n    const sx = (v.x + 1) / 2 * window.innerWidth, sy = (1 - v.y) / 2 * window.innerHeight;\n    const hit = tr.getEntityAtScreen(sx, sy);\n    return { id: p.id, a: +p.orbital.a.toFixed(4), sx: Math.round(sx), sy: Math.round(sy), hit: hit?.id ?? null, hitType: hit?.type ?? null, ok: hit?.id === p.id };\n  };\n  const inner = planets.slice(0, 5);\n  const view0 = ctrl.snapshotView?.();\n  tr._frameActiveSystem?.(); ctrl.update(); ctrl._applyCamera?.();\n  for (const p of inner) out.clicks.push({ view: 'ramka', ...pick(p) });\n  for (const p of inner) {\n    const wi = tr.getBodyWorldInfo(p.id);\n    ctrl.applyView({ target: { x: wi.x ?? wi.position?.x, y: 0, z: wi.z ?? wi.position?.z }, dist: 4 });\n    ctrl.update(); ctrl._applyCamera?.();\n    out.clicks.push({ view: 'zbli\u017cenie', ...pick(p) });\n  }\n  if (view0) ctrl.applyView(view0);\n  const vm = K.vesselManager, mos = K.movementOrderSystem;\n  const col = K.colonyManager?.getAllColonies?.().find(c => !c.ownerEmpireId) ?? null;\n  const v = vm.createAndRegister('science_vessel', home.id, {});\n  const vid = v?.id ?? v?.vesselId ?? v;\n  const vessel = vm.getVessel?.(vid);\n  if (vessel) vessel.serviceState = 'active';\n  out.vessel = { id: vid ?? null, found: !!vessel, sys: vessel?.systemId ?? null };\n  const others = planets.filter(p => p.id !== home.id).sort((x, y) => Math.abs(x.orbital.a - home.orbital.a) - Math.abs(y.orbital.a - home.orbital.a));\n  const targets = [others[0], planets[0].id !== home.id ? planets[0] : others[1], home].filter(Boolean);\n  out.exclusionLegacyAU = 0.3; out.targetsInsideLegacyExclusion = targets.filter(t => t.orbital.a < 0.3).length;\n  for (const tgt of targets) {\n    if (!tgt) continue;\n    let r;\n    try { r = mos.issueOrder(vid, { type: ORDER_TYPES.moveToPoint, targetBodyId: tgt.id, targetPoint: { x: tgt.x, y: tgt.y } }); }\n    catch (e) { r = { ok: false, reason: 'throw ' + e.message }; }\n    out.orders.push({ target: tgt.id, a: +tgt.orbital.a.toFixed(4), home: tgt.id === home.id, ok: !!r?.ok, reason: r?.reason ?? null });\n  }\n  try {\n    const om = K.uiManager?.overlayManager;\n    om.openPanel('colony', { colonyId: col?.planetId });\n    K.uiManager._draw?.();\n    const opened = om.active != null;\n    om.closeActive();\n    K.uiManager._draw?.();\n    out.colony = { opened, closed: om.active == null };\n  } catch (e) { out.colony = { error: String(e.message) }; }\n  return out;\n})()\n";

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = await launch();
const runs = [];
let exitCode = 0;
try {
  const page = await cdp(chrome.wsUrl);
  let exc = [];
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') exc.push(String(m.params.exceptionDetails?.exception?.description ?? '').slice(0, 200));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') exc.push('console.error ' + (m.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  });
  await page.send('Runtime.enable'); await page.send('Page.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1041, deviceScaleFactor: 1, mobile: false });
  const MAX_TRIES = Number(arg('--tries', '10'));
  for (let i = 0; i < MAX_TRIES; i++) {
    exc = [];
    await page.send('Page.navigate', { url: `${base}/index.html` });
    await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł');
    await page.evaluate('localStorage.clear(), KOSMOS.gameConfig.FEATURES.realisticClimate = true, KOSMOS.gameConfig.FEATURES.scaledOrbits = true, true');
    await page.evaluate(`document.querySelector('[data-action="new"]').click(), true`);
    await page.waitFor(`!!document.querySelector('.fs-leader-card')`, 'lider');
    await page.evaluate(`document.querySelector('.fs-leader-card').click(), true`);
    await page.waitFor(`!!document.querySelector('#fs-start')`, 'start');
    await page.evaluate(`document.querySelector('#fs-start').click(), true`);
    await page.waitFor(`!!(window.KOSMOS?.starSystemManager && typeof window.csClimate === 'function' && window.KOSMOS?.galaxyData?.seed !== undefined)`, 'GameScene');
    await sleep(3000);
    // Intro cywilizacji (transmisja → podręcznik → nazwa cywilizacji → nazwa stolicy) czeka na gracza: Enter, aż stolica powstanie
    for (let t = 0; t < 240 && !(await page.evaluate('!!window.KOSMOS?.homePlanet && !!window.KOSMOS?.civMode')); t++) {
      await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })), true`);
      await sleep(500);
    }
    await page.waitFor(`!!(window.KOSMOS?.homePlanet && window.KOSMOS?.civMode && window.KOSMOS?.movementOrderSystem)`, 'stolica + 4X', 60000);
    await page.waitFor(`window.KOSMOS?.gameScene?._introLockActive !== true`, 'koniec intro', 180000);
    await sleep(1500);
    const cls = await page.evaluate(`(async () => (await import('/src/core/EntityManager.js')).default.getStarOfSystem('sys_home')?.spectralType)()`);
    console.log(`próba ${i + 1}: gwiazda domowa ${cls}, wyjątki dotąd ${exc.length}`);
    if (cls !== 'M') continue;
    const r = await page.evaluate(PAGE_CHECK);
    await sleep(800);
    // Szum uprzęży: ponowna nawigacja tej samej karty zamyka AudioContext poprzedniej strony — 2× „AudioContext is closed”
    // także na kodzie bazowym b0f3106 (kontrola 2026-11-19); liczony osobno, wszystko inne czerwieni sondę.
    const NOISE = /AudioContext is closed/;
    r.harnessNoise = exc.filter(e => NOISE.test(e)).length;
    r.exceptions = exc.filter(e => !NOISE.test(e));
    const focused = r.clicks.filter(c => c.view === 'zbliżenie');
    r.ok = r.k < 1 && r.orbitModel === 2 && focused.length >= 3 && focused.every(c => c.ok) && r.targetsInsideLegacyExclusion >= 1
      && r.orders.length >= 2 && r.orders.every(o => o.reason !== 'unreachable_target' && !String(o.reason).startsWith('throw'))
      && r.colony?.opened === true && r.colony?.closed === true && r.exceptions.length === 0;
    runs.push(r);
    console.log(JSON.stringify(r, null, 1).slice(0, 5000));
    break;
  }
  if (!runs.length) { console.log('brak układu M w', MAX_TRIES, 'próbach'); exitCode = 3; }
  else if (!runs[0].ok) exitCode = 1;
  page.close();
} catch (e) { console.error('sonda:', e); exitCode = 2; }
finally {
  try { chrome.proc.kill(); } catch { /* nic */ }
  server.close();
  await sleep(500);
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* Chrome trzyma pliki */ }
}
console.log(`SUMMARY probe-cs-phys-b2-live: ${exitCode === 0 ? 'PASS' : 'FAIL'} (exit ${exitCode})`);
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ root: ROOT, runs }, null, 1));
process.exit(exitCode);
