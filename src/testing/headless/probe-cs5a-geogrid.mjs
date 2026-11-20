// ARC COLONY SPHERE CS-5a — sonda csGeoGrid() w PRAWDZIWEJ grze (headless Chrome przez CDP, bez npm). Plan §3.13.
//
//   node src/testing/headless/probe-cs5a-geogrid.mjs [--out <plik.json>]
//
//   1. tytuł → nowa gra (świat seedowany) → csGeoGrid() na planecie macierzystej, księżycu i planetoidzie (zaznaczenie
//      jak klik w mapę) → arkusz docs/design/prototypes/cs5a-geogrid.png (trzy nakładki z podpisami);
//   2. sprawdza: nakładka DOM, przycisk zamknięcia, brak wyjątków, 10n²+2 i 12 pięciokątów w podsumowaniu, ZERO zmian
//      stanu gry (siatka kolonii domowej nadal płaska, ten sam hash pól przed / po);
//   3. determinizm między silnikami: hash topologii n=3…6 i terenu 3 ciał keepera w Chrome = stałe wektory keepera
//      (node) — colony_sphere_geogrid_smoke G2d / G2e.
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
const PIN_TOPO = { 3: '9496c260', 4: '13281f65', 5: '174a1a54', 6: '1c24f6de' };   // = keeper G2d
const PIN_TERRAIN = '07227ae3';                                                   // = keeper G2e

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs5a-'));
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

// Strona: hash topologii i terenu (ta sama funkcja co keeper).
const CROSS = String.raw`(async () => {
  const T = await import('/src/map/GeodesicTopology.js');
  const G = await import('/src/map/GeoColonyGridGenerator.js');
  const hash = (parts) => { let h = 0x811c9dc5; for (const p of parts) { const b = new Uint8Array(p.buffer, p.byteOffset, p.byteLength); for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) >>> 0; } } return h.toString(16).padStart(8, '0'); };
  const topo = {}; for (const n of [3, 4, 5, 6]) { const t = T.geodesicTopology(n); topo[n] = hash([t.cx, t.cy, t.cz, t.nbStart, t.nbList]); }
  const B = [
    { id: 'k1', name: 'K1', type: 'planet', planetType: 'rocky', bodyArchetype: 'terran', surfaceSeed: 0x1234567, waterCoverage: 0.55, physics: { mass: 1 }, composition: {}, lifeScore: 60 },
    { id: 'k2', name: 'K2', type: 'moon', planetType: 'rocky', bodyArchetype: 'icy_cratered', surfaceSeed: 0x9abcdef, physics: { mass: 0.02 }, composition: {} },
    { id: 'k3', name: 'K3', type: 'planetoid', planetType: 'rocky', planetoidType: 'metallic', bodyArchetype: 'planetoid', surfaceSeed: 0x5555aaa, physics: { mass: 0.001 }, composition: { Fe: 30 } } ];
  const s = B.map(b => G.geoTerrainOf(b, G.geoGridSpecFor(b)).join(',')).join('|');
  return { topo, terrain: hash([new Int32Array(s.split('').map(c => c.charCodeAt(0)))]) };
})()`;

// Strona: zaznacz ciało (null = dom), csGeoGrid(), poczekaj na rysunek, zwróć podsumowanie + dataURL płótna.
const SHOT = (pickExpr) => String.raw`(async () => {
  const EM = (await import('/src/core/EntityManager.js')).default;
  const tr = KOSMOS.threeRenderer;
  const body = ${pickExpr};
  tr._selectedEntityId = body ? body.id : null; tr._focusEntityId = null;
  const r = csGeoGrid();
  if (!r) return null;
  const done = await r.done;
  const cv = document.querySelector('[data-role="cs-geogrid-canvas"]');
  const overlay = !!document.getElementById('cs-geogrid-preview');
  return { summary: done, overlay, url: cv ? cv.toDataURL('image/png') : null };
})()`;

const STITCH = String.raw`async (shots) => {
  const W = 1024, H = 512, CAP = 40, PAD = 10;
  const cv = document.createElement('canvas'); cv.width = W + 2 * PAD; cv.height = shots.length * (H + CAP + PAD) + PAD + 30;
  const g = cv.getContext('2d'); g.fillStyle = '#0b0f14'; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#cfe3f5'; g.font = 'bold 15px monospace';
  g.fillText('CS-5a csGeoGrid() — geodesic colony grid over the hero surface map (equirect)', PAD, 22);
  let y = 30;
  for (const s of shots) {
    const img = new Image(); img.src = s.url; await img.decode();
    const m = s.summary;
    g.fillStyle = '#cfe3f5'; g.font = 'bold 13px monospace';
    g.fillText(m.name + ' · ' + m.archetype + ' · ' + m.gridClass + ' · n=' + m.n + ' · ' + m.tiles + ' tiles · ' + m.pentagons + ' pentagons', PAD, y + 16);
    g.fillStyle = '#7f98ad'; g.font = '11px monospace';
    g.fillText('landing ' + m.landing.withColony + ' with a capital + ring 1 (empty body ' + m.landing.emptyBody + ') · bands P/S/E ' + m.latitude.polar + '/' + m.latitude.subpolar + '/' + m.latitude.equatorial
      + ' · anomalies ' + m.anomalies + ' (' + m.anomaliesOnPent + ' on pentagons) · ' + Object.entries(m.terrainShares).map(([k, v]) => k + ' ' + Math.round(v * 100) + '%').join(' '), PAD, y + 32);
    g.drawImage(img, PAD, y + CAP, W, H);
    y += H + CAP + PAD;
  }
  return cv.toDataURL('image/png');
}`;

let exitCode = 0;
const result = {};
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = await launch();
try {
  const page = await cdp(chrome.wsUrl);
  const exc = [];
  page.on((m) => { if (m.method === 'Runtime.exceptionThrown') exc.push((m.params.exceptionDetails?.exception?.description ?? '').slice(0, 300)); });
  await page.send('Runtime.enable'); await page.send('Page.enable');
  await page.send('Page.navigate', { url: `${base}/index.html` });
  await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł');
  await page.evaluate('KOSMOS.gameConfig.FEATURES.seededSystems=true');
  await page.evaluate(`document.querySelector('[data-action="new"]').click(), true`);
  await page.waitFor(`!!document.querySelector('.fs-leader-card')`, 'lider');
  await page.evaluate(`document.querySelector('.fs-leader-card').click(), true`);
  await page.waitFor(`!!document.querySelector('#fs-start')`, 'start');
  await page.evaluate(`document.querySelector('#fs-start').click(), true`);
  await page.waitFor(`typeof window.csGeoGrid === 'function' && window.KOSMOS?.galaxyData?.seed !== undefined`, 'GameScene');
  await sleep(3000);
  // Intro nowej gry (jak probe-cs2-gate): Escape pomija narrację, Enter zatwierdza domyślne nazwy — aż kolonia ma mapę.
  for (let i = 0; i < 180; i++) {
    if (await page.evaluate(`!!window.KOSMOS?.homePlanet && !!window.KOSMOS?.colonyManager?.getActiveColony?.()?.grid`)) break;
    await page.evaluate(`(() => { for (const k of ['Escape', 'Enter']) document.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, bubbles: true })); return true; })()`);
    await sleep(1000);
  }
  await page.waitFor(`!!window.KOSMOS?.homePlanet && !!window.KOSMOS?.colonyManager?.getActiveColony?.()?.grid`, 'kolonia z mapą', 10000);
  await page.evaluate(`KOSMOS.timeSystem.pause(), true`);
  result.cross = await page.evaluate(CROSS);
  result.crossOk = [3, 4, 5, 6].every(n => result.cross.topo[n] === PIN_TOPO[n]) && result.cross.terrain === PIN_TERRAIN;
  console.log('[cross-engine] Chrome', JSON.stringify(result.cross), '= keeper pins:', result.crossOk);
  const gridHash = `(() => { const g = KOSMOS.colonyManager.getActiveColony().grid; return (g.kind ?? 'flat') + ':' + JSON.stringify(g.serialize()).length + ':' + JSON.stringify(g.serialize()).split('').reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261); })()`;
  const before = await page.evaluate(gridHash);
  const picks = {
    home: 'null',
    moon: `EM.getByType('moon').find(b => (b.systemId ?? 'sys_home') === (KOSMOS.activeSystemId ?? 'sys_home')) ?? EM.getByType('moon')[0]`,
    planetoid: `EM.getByType('planetoid').find(b => (b.systemId ?? 'sys_home') === (KOSMOS.activeSystemId ?? 'sys_home')) ?? EM.getByType('planetoid')[0]`,
  };
  const shots = [];
  for (const [k, expr] of Object.entries(picks)) {
    const s = await page.evaluate(SHOT(expr));
    result[k] = s && { summary: s.summary, overlay: s.overlay, hasImage: !!s.url };
    console.log(`[${k}]`, JSON.stringify(result[k]?.summary ?? null));
    if (s?.url) shots.push(s);
  }
  result.closeButton = await page.evaluate(`(() => { const b = document.querySelector('[data-action="cs-geogrid-close"]'); if (!b) return false; b.click(); return !document.getElementById('cs-geogrid-preview'); })()`);
  const after = await page.evaluate(gridHash);
  result.homeGridUnchanged = before === after && before.startsWith('flat:');
  if (shots.length === 3) {
    const url = await page.evaluate(`(${STITCH})(${JSON.stringify(shots.map(s => ({ url: s.url, summary: s.summary })))})`);
    const file = path.join(REPO, 'docs/design/prototypes/cs5a-geogrid.png');
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    result.png = { file, bytes: fs.statSync(file).size };
    console.log('[png]', file, result.png.bytes, 'B');
  }
  result.exceptions = exc.slice();
  const shape = (k, n) => result[k]?.summary && result[k].summary.tiles === 10 * result[k].summary.n * result[k].summary.n + 2 && result[k].summary.pentagons === 12 && result[k].overlay;
  result.ok = result.crossOk && shape('home') && shape('moon') && shape('planetoid') && result.home.summary.archetype === 'terran'
    && result.closeButton === true && result.homeGridUnchanged && shots.length === 3 && result.exceptions.length === 0;
  if (!result.ok) exitCode = 1;
  console.log('[game]', JSON.stringify({ ok: result.ok, closeButton: result.closeButton, homeGridUnchanged: result.homeGridUnchanged, before, after, exceptions: result.exceptions }));
  page.close();
} catch (e) { console.error('sonda:', e); exitCode = 2; }
finally {
  try { chrome.proc.kill(); } catch { /* nic */ }
  server.close();
  await sleep(500);
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* Chrome trzyma pliki */ }
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log(`SUMMARY probe-cs5a-geogrid: ${exitCode === 0 ? 'PASS' : 'FAIL'}`);
process.exit(exitCode);
