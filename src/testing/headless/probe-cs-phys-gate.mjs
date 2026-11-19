// KOSMOS — CS-PHYS-a (plan COLONY_SPHERE §3.8): walidacja komend bramki na ŻYWYM silniku (headless Chrome, CDP, bez npm).
//
//   node src/testing/headless/probe-cs-phys-gate.mjs [--root <drzewo>] [--out <plik.json>]
//
// Scenariusze (każda komenda bez cudzysłowów i argumentów, dokładnie jak w checkliście bramki):
//   title  : KOSMOS.gameConfig.FEATURES.realisticClimate=true na ekranie tytułowym → «Nowa gra» → lider → start →
//            csClimate() (climateModel 2, rekord v2 na każdym ciele), csTemp() (domy w paśmie), csLifeTick() (0 zmian T).
//   flip   : nowa gra przy OFF, flaga ON po starcie → csClimate() (climateModel 1, 0 rekordów v2).
//   save   : gra przy OFF → zapis → przeładowanie → flaga ON na tytule → «Kontynuuj» → csClimate() (climateModel 1, 0 v2).
//   save2  : gra przy ON → zapis → przeładowanie (flaga OFF) → «Kontynuuj» → csClimate() (climateModel 2, rekordy v2 z zapisu).
// Serwer tylko czyta; profil Chrome w katalogu tmp. Kod wyjścia: 0 = wszystko zielone, 1 = czerwone, 2 = błąd sondy.
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-csphys-'));
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


const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = await launch();
const results = [];
let exitCode = 0;
try {
  const page = await cdp(chrome.wsUrl);
  let exc = [];
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') exc.push(String(m.params.exceptionDetails?.exception?.description ?? '').slice(0, 200));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') exc.push('console.error ' + (m.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  });
  await page.send('Runtime.enable'); await page.send('Page.enable');
  const newGame = async () => {
    await page.evaluate(`document.querySelector('[data-action="new"]').click(), true`);
    await page.waitFor(`!!document.querySelector('.fs-leader-card')`, 'lider');
    await page.evaluate(`document.querySelector('.fs-leader-card').click(), true`);
    await page.waitFor(`!!document.querySelector('#fs-start')`, 'start');
    await page.evaluate(`document.querySelector('#fs-start').click(), true`);
    await page.waitFor(`!!(window.KOSMOS?.starSystemManager && typeof window.csClimate === 'function' && window.KOSMOS?.galaxyData?.seed !== undefined)`, 'GameScene');
    await sleep(2500);
  };
  const title = async () => {
    await page.send('Page.navigate', { url: `${base}/index.html` });
    await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł');
  };
  for (const mode of ['title', 'flip', 'save', 'save2']) {
    const r = { mode }; exc = [];
    try {
      await title();
      await page.evaluate('localStorage.clear(), true');
      if (mode === 'title' || mode === 'save2') r.flagOnTitle = await page.evaluate('KOSMOS.gameConfig.FEATURES.realisticClimate=true');
      await newGame();
      if (mode === 'flip') r.flagAfterStart = await page.evaluate('KOSMOS.gameConfig.FEATURES.realisticClimate=true');
      if (mode === 'save' || mode === 'save2') {
        r.beforeSave = await page.evaluate('csClimate()');
        await page.evaluate('KOSMOS.gameScene.saveSystem.save(), true');
        await title();
        r.flagOnTitle = await page.evaluate(`KOSMOS.gameConfig.FEATURES.realisticClimate=${mode === 'save'}`);
        r.hasContinue = await page.evaluate(`!!document.querySelector('[data-action="continue"]')`);
        await page.evaluate(`document.querySelector('[data-action="continue"]').click(), true`);
        await page.waitFor(`!!(window.KOSMOS?.starSystemManager && typeof window.csClimate === 'function' && window.KOSMOS?.galaxyData?.seed !== undefined)`, 'GameScene (wczytanie)');
        await sleep(2500);
      }
      r.climate = await page.evaluate('csClimate()');
      r.temp = await page.evaluate('csTemp()');
      const before = await page.evaluate('JSON.stringify(csClimate())');
      r.lifeTick = await page.evaluate('csLifeTick()');
      r.climateAfterTick = await page.evaluate('csClimate()');
      r.exceptions = exc.slice();
      const c = r.climate ?? {};
      r.ok = mode === 'save2'
        ? (c.climateModel === 2 && c.worldStamp === 2 && c.withV2Record === c.bodies && c.bodies === r.beforeSave?.bodies
           && c.withDayNight === r.beforeSave?.withDayNight && c.playerHome?.finalC === r.beforeSave?.playerHome?.finalC && r.lifeTick?.changed === 0)
        : mode === 'title'
        ? (c.climateModel === 2 && c.worldStamp === 2 && c.withV2Record === c.bodies && c.bodies > 0 && c.withDayNight > 0
           && r.lifeTick?.changed === 0 && JSON.stringify(r.climateAfterTick) === before)
        : (c.climateModel === 1 && c.worldStamp === null && c.withV2Record === 0 && c.bodies > 0);
      r.ok = r.ok && (r.temp?.homeworldsOutOfBand ?? 0) === 0;
    } catch (e) { r.error = String(e?.message ?? e); r.ok = false; }
    if (!r.ok) exitCode = 1;
    results.push(r);
    if (r.exceptions?.length) console.log("  exc:", JSON.stringify(r.exceptions).slice(0, 600));
    console.log(`[${mode}] ${r.ok ? 'OK ' : 'RED'} climate=${JSON.stringify(r.climate)} temp=${JSON.stringify(r.temp)} lifeTick=${JSON.stringify(r.lifeTick)} exc=${r.exceptions?.length ?? '?'}${r.error ? ' ' + r.error : ''}`);
  }
  page.close();
} catch (e) { console.error('sonda:', e); exitCode = 2; }
finally {
  try { chrome.proc.kill(); } catch { /* nic */ }
  server.close();
  await sleep(500);
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* Chrome trzyma pliki */ }
}
console.log(`SUMMARY probe-cs-phys-gate: root=${ROOT} red=${results.filter(r => !r.ok).length} → ${exitCode === 0 ? 'PASS' : 'FAIL'}`);
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ root: ROOT, results }, null, 1));
process.exit(exitCode);
