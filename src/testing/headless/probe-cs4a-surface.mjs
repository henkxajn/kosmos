// ARC COLONY SPHERE CS-4a — sonda SurfaceField: arkusze kontaktowe PNG, pomiary (node + headless Chrome),
// walidacja pomocników konsoli csSurface() / csSurfaceAll() w PRAWDZIWEJ nowej grze (CDP, bez npm). Plan §3.4.
//
//   node src/testing/headless/probe-cs4a-surface.mjs [--sheets] [--measure] [--game] [--out <plik.json>]
//     --sheets   docs/design/prototypes/cs4a-archetype-sheet.png + cs4a-terran-waterbands.png (render w Chrome:
//                bake SurfaceField + paleta SurfacePreviewLogic + podpisy canvas → toDataURL)
//     --measure  tabela kosztów: node (ten proces) i Chrome (główny wątek)
//     --game     tytuł → nowa gra (świat seedowany) → csSurfaceAll() → zaznaczenie planety → csSurface();
//                sprawdza nakładkę DOM, przycisk zamknięcia i brak wyjątków
// Bez flag = wszystkie trzy. Serwer statyczny tylko do odczytu, profil Chrome w katalogu tmp.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const has = (k) => process.argv.includes(k);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const ALL = !has('--sheets') && !has('--measure') && !has('--game');
const DO_SHEETS = ALL || has('--sheets'), DO_MEASURE = ALL || has('--measure'), DO_GAME = ALL || has('--game');
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs4a-'));
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
const SHEET_SRC = String.raw`async (spec) => {
  const SF = await import('/src/utils/SurfaceField.js');
  const PL = await import('/src/utils/SurfacePreviewLogic.js');
  const { ARCHETYPE_BY_ID } = await import('/src/data/BodyArchetypes.js');
  const CW = 256, CH = 128, LW = 170, PAD = 8, CAP = 16, TOP = 34;
  const rowH = CH + CAP + PAD;
  const cv = document.createElement('canvas');
  cv.width = LW + 3 * (CW + PAD) + PAD; cv.height = TOP + spec.rows.length * rowH + PAD;
  const g = cv.getContext('2d');
  g.fillStyle = '#0b0f14'; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#cfe3f5'; g.font = 'bold 15px monospace'; g.fillText(spec.title, PAD, 22);
  for (let r = 0; r < spec.rows.length; r++) {
    const row = spec.rows[r], arch = ARCHETYPE_BY_ID[row.arch];
    const y0 = TOP + r * rowH;
    g.fillStyle = '#cfe3f5'; g.font = 'bold 13px monospace'; g.fillText(row.label, PAD, y0 + 18);
    g.fillStyle = '#7f98ad'; g.font = '11px monospace'; g.fillText(arch.family, PAD, y0 + 34);
    if (row.note) g.fillText(row.note, PAD, y0 + 50);
    for (let s = 0; s < 3; s++) {
      const seed = spec.seeds[s], params = row.params[s];
      const bytes = SF.bakeEquirect(seed, arch, params, row.w, row.h);
      const info = SF.surfaceInfo(seed, arch, params);
      const { rgba } = PL.composePreview(bytes, row.w, row.h, arch, info);
      const tmp = document.createElement('canvas'); tmp.width = row.w; tmp.height = row.h;
      tmp.getContext('2d').putImageData(new ImageData(rgba, row.w, row.h), 0, 0);
      const x0 = LW + s * (CW + PAD), dx = x0 + (CW - row.w) / 2, dy = y0 + (CH - row.h) / 2;
      g.drawImage(tmp, dx, dy);
      g.strokeStyle = '#2b4258'; g.strokeRect(dx - 0.5, dy - 0.5, row.w + 1, row.h + 1);
      g.fillStyle = '#7f98ad'; g.font = '11px monospace';
      const extra = [params.palette, params.waterCoverage != null && arch.id === 'terran' ? 'water ' + params.waterCoverage : null,
        info.variation.giantCrater ? 'giant crater' : null, info.hasSea ? 'sea ' + info.seaShare : null].filter(Boolean).join(' · ');
      g.fillText('seed 0x' + (seed >>> 0).toString(16) + (extra ? ' · ' + extra : ''), x0, y0 + CH + 12);
    }
  }
  return cv.toDataURL('image/png');
}`;

const SEEDS = [0x1234567, 0x9abcdef, 0x5555aaa];

async function archetypeSheetSpec() {
  const { BODY_ARCHETYPES } = await import(pathToFileURL(path.join(REPO, 'src/data/BodyArchetypes.js')).href);
  const pals = ['metallic', 'carbonaceous', 'silicate'];
  const rows = BODY_ARCHETYPES.filter(a => a.family !== 'gas').map(a => {
    const pl = a.family === 'planetoid';
    return {
      label: a.id, arch: a.id, w: pl ? 128 : 256, h: pl ? 64 : 128,
      note: a.id === 'terran' ? 'oceanic band' : (a.id === 'planetoid' ? 'palette per seed' : null),
      params: [0, 1, 2].map(s => ({ waterCoverage: a.id === 'terran' ? 0.75 : null,
        palette: a.id === 'planetoid' ? pals[s] : (a.id === 'planetoid_icy' ? 'icy' : null) })),
    };
  });
  return { title: 'CS-4a SurfaceField v2 (tuning pass) — every archetype x 3 seeds (raw biome palette + hillshade, NOT the CS-6 look)', seeds: SEEDS, rows };
}

function waterbandSheetSpec() {
  const bands = [['oceanic', 0.80], ['oceanic', 0.68], ['balanced', 0.52], ['balanced', 0.42], ['continental', 0.32], ['continental', 0.18]];
  return {
    title: 'CS-4a terran — water bands (stored waterCoverage drives the calibrated sea level) x 3 seeds', seeds: SEEDS,
    rows: bands.map(([b, wc]) => ({ label: `${b} ${wc}`, arch: 'terran', w: 256, h: 128, note: null,
      params: [0, 1, 2].map(() => ({ waterCoverage: wc, palette: null })) })),
  };
}

const result = { sheets: null, measure: null, game: null };
let exitCode = 0;
if (DO_MEASURE) {
  const SF = await import(pathToFileURL(path.join(REPO, 'src/utils/SurfaceField.js')).href);
  const { BODY_ARCHETYPES } = await import(pathToFileURL(path.join(REPO, 'src/data/BodyArchetypes.js')).href);
  const { measureSurface } = await import(pathToFileURL(path.join(REPO, 'src/testing/headless/cs4a-measure.mjs')).href);
  result.measure = { node: measureSurface(SF, BODY_ARCHETYPES, { runs: 3 }) };
}

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = await launch();
try {
  const page = await cdp(chrome.wsUrl);
  const exc = [];
  page.on((m) => { if (m.method === 'Runtime.exceptionThrown') exc.push((m.params.exceptionDetails?.exception?.description ?? '').slice(0, 300)); });
  await page.send('Runtime.enable'); await page.send('Page.enable');
  if (DO_SHEETS || DO_MEASURE) {
    await page.send('Page.navigate', { url: `${base}/__blank` });
    await page.waitFor(`document.readyState === 'complete'`, 'blank');
  }
  if (DO_SHEETS) {
    const out = {};
    for (const [name, spec] of [['cs4a-archetype-sheet.png', await archetypeSheetSpec()], ['cs4a-terran-waterbands.png', waterbandSheetSpec()]]) {
      const url = await page.evaluate(`(${SHEET_SRC})(${JSON.stringify(spec)})`);
      const file = path.join(REPO, 'docs/design/prototypes', name);
      fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
      out[name] = fs.statSync(file).size;
      console.log(`[sheet] ${file} ${out[name]} B`);
    }
    result.sheets = out;
  }
  if (DO_MEASURE) {
    result.measure.chrome = await page.evaluate(`(async () => {
      const SF = await import('/src/utils/SurfaceField.js');
      const { BODY_ARCHETYPES } = await import('/src/data/BodyArchetypes.js');
      const { measureSurface } = await import('/src/testing/headless/cs4a-measure.mjs');
      return measureSurface(SF, BODY_ARCHETYPES, { runs: 3 });
    })()`);
    // D-CS-16: ta sama ścieżka rozgrywki w Chrome i w node → identyczne liczby (21 archetypów × 3 ziarna × 362 punkty).
    const CROSS = String.raw`async (SFurl, DAurl) => {
      const SF = await import(SFurl), { BODY_ARCHETYPES } = await import(DAurl);
      const pts = SF.fibonacciSphere(362), out = [];
      for (const a of BODY_ARCHETYPES) for (const seed of [3, 0x7fffffff, 0xc0ffee]) {
        const p = { waterCoverage: 0.61, palette: a.family === 'planetoid' ? 'silicate' : null };
        const sea = SF.seaLevelOf(seed, a, p);
        for (let i = 0; i < 362; i++) { const s = SF.evalAt(seed, a, p, pts[i*3], pts[i*3+1], pts[i*3+2]); out.push(s.e, s.m, s.t, s.a, SF.classify(s, a, sea).biome); }
        out.push(sea);
      }
      return JSON.stringify(out);
    }`;
    const nodeCross = await (eval(CROSS))(pathToFileURL(path.join(REPO, 'src/utils/SurfaceField.js')).href, pathToFileURL(path.join(REPO, 'src/data/BodyArchetypes.js')).href);
    const chromeCross = await page.evaluate(`(${CROSS})('/src/utils/SurfaceField.js', '/src/data/BodyArchetypes.js')`);
    result.measure.crossEngineIdentical = nodeCross === chromeCross;
    result.measure.crossEngineValues = JSON.parse(nodeCross).length;
    console.log(`[cross-engine] node vs Chrome: ${result.measure.crossEngineValues} wartości, identyczne = ${result.measure.crossEngineIdentical}`);
    if (!result.measure.crossEngineIdentical) exitCode = 1;
    const ch = new Map(result.measure.chrome.map(r => [r.id, r]));
    console.log('archetype        family     LOD      node: prep  lod  hero eval/1k | chrome: prep  lod  hero eval/1k');
    for (const n of result.measure.node) {
      const c = ch.get(n.id) ?? {};
      console.log(`${n.id.padEnd(16)} ${n.family.padEnd(10)} ${n.lod.padEnd(8)} ${String(n.prepareMs).padStart(6)} ${String(n.lodMs).padStart(5)} ${String(n.heroMs).padStart(5)} ${String(n.evalPer1000Ms).padStart(6)} | ${String(c.prepareMs).padStart(6)} ${String(c.lodMs).padStart(5)} ${String(c.heroMs).padStart(5)} ${String(c.evalPer1000Ms).padStart(6)}`);
    }
  }
  if (DO_GAME) {
    const g = { exceptions: [] };
    exc.length = 0;
    await page.send('Page.navigate', { url: `${base}/index.html` });
    await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł');
    await page.evaluate('KOSMOS.gameConfig.FEATURES.seededSystems=true');
    await page.evaluate(`document.querySelector('[data-action="new"]').click(), true`);
    await page.waitFor(`!!document.querySelector('.fs-leader-card')`, 'lider');
    await page.evaluate(`document.querySelector('.fs-leader-card').click(), true`);
    await page.waitFor(`!!document.querySelector('#fs-start')`, 'start');
    await page.evaluate(`document.querySelector('#fs-start').click(), true`);
    await page.waitFor(`typeof window.csSurfaceAll === 'function' && typeof window.csSurface === 'function' && window.KOSMOS?.galaxyData?.seed !== undefined`, 'GameScene');
    await sleep(2500);
    g.all = await page.evaluate('csSurfaceAll().done');   // CS-4b: pomocniki asynchroniczne (SurfaceCache) → { …, done }
    g.allOverlay = await page.evaluate(`document.querySelectorAll('#cs-surface-preview canvas').length`);
    g.home = await page.evaluate('csSurface()?.done');
    g.homeOverlay = await page.evaluate(`document.querySelectorAll('#cs-surface-preview canvas').length`);
    // Zaznaczenie innego ciała (księżyc albo planetoida) przez EventBus jak klik w mapę — potem csSurface().
    g.other = await page.evaluate(`(async () => {
      const EM = (await import('/src/core/EntityManager.js')).default;
      const sys = KOSMOS.activeSystemId ?? 'sys_home';
      const b = [...EM.getByType('moon'), ...EM.getByType('planetoid')].find(x => (x.systemId ?? 'sys_home') === sys);
      if (!b) return null;
      KOSMOS.threeRenderer._selectedEntityId = b.id;
      return await csSurface()?.done;
    })()`);
    g.closeButton = await page.evaluate(`(() => { const b = document.querySelector('[data-action="cs-surface-close"]'); if (!b) return false; b.click(); return !document.getElementById('cs-surface-preview'); })()`);
    g.exceptions = exc.slice();
    g.ok = g.all?.shown >= 1 && g.all.shown + g.all.skipped === g.all.bodies && g.allOverlay === g.all.shown
      && g.home?.archetype === 'terran' && g.homeOverlay === 1 && g.closeButton === true && g.exceptions.length === 0;
    if (!g.ok) exitCode = 1;
    console.log('[game]', JSON.stringify({ ok: g.ok, all: g.all, home: g.home && { ...g.home, terrainShares: undefined }, other: g.other && { name: g.other.name, archetype: g.other.archetype, bakeMs: g.other.bakeMs }, closeButton: g.closeButton, exceptions: g.exceptions }));
    result.game = g;
  }
  page.close();
} catch (e) { console.error('sonda:', e); exitCode = 2; }
finally {
  try { chrome.proc.kill(); } catch { /* nic */ }
  server.close();
  await sleep(500);
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* Chrome trzyma pliki */ }
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log(`SUMMARY probe-cs4a-surface: ${exitCode === 0 ? 'PASS' : 'FAIL'}`);
process.exit(exitCode);
