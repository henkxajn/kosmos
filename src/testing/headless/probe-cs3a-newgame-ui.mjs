// ARC COLONY SPHERE CS-3a-fix — bramka maszynowa: PRAWDZIWY przepływ nowej gry w headless Chrome (CDP, bez npm).
//
//   node src/testing/headless/probe-cs3a-newgame-ui.mjs [--games 20] [--flip 10] [--root <drzewo>] [--out <plik.json>]
//
// --games N : N świeżych gier, flaga `KOSMOS.gameConfig.FEATURES.seededSystems=true` wpisana na ekranie tytułowym
//             (jak w checkliście) → «Nowa gra» → lider → «ROZPOCZNIJ GRĘ». Wymagane w KAŻDEJ grze: csPeek()
//             `mismatches: 0`, `worldSeeded: true`, `emergencySeedUses: 0`, zero linii `[CS-3a] świat seedowany bez …`.
// --flip M  : M gier przy fladze OFF na starcie, flaga ustawiona na ON PO starcie (FAIL bramki CS-3a krok 5).
//             Wymagane: `worldSeeded: false`, `mismatches: 0` (świat pamięta swój tryb), ścieżka awaryjna nieużyta.
// --root    : drzewo do serwowania (domyślnie repo tej sondy); `/assets/*` brakujące w drzewie → assety repo
//             (drzewo mutacji / worktree nie potrzebuje junction). Serwer tylko czyta; profil Chrome w katalogu tmp.
// Kod wyjścia: 0 = wszystkie gry zielone, 1 = choć jedna czerwona, 2 = błąd sondy.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ROOT = path.resolve(arg('--root', REPO));
const GAMES = +arg('--games', 20), FLIPS = +arg('--flip', 0), OUT = arg('--out', null);
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs3a-'));
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
  let errs = [], other = [];
  page.on((m) => {
    const t = m.method === 'Runtime.consoleAPICalled' ? (m.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' ')
      : m.method === 'Runtime.exceptionThrown' ? 'EXC ' + (m.params.exceptionDetails?.exception?.description ?? '') : null;
    // Bramka: tylko błąd ścieżki awaryjnej [CS-3a]. Inne wyjątki strony (np. headless AudioContext po nawigacji)
    // zapisujemy jako informację, bez werdyktu.
    if (t && t.includes('świat seedowany bez')) errs.push(t.slice(0, 300));
    else if (t && t.startsWith('EXC')) other.push(t.slice(0, 200));
  });
  await page.send('Runtime.enable'); await page.send('Page.enable');
  const plan = [...Array(GAMES).fill('title'), ...Array(FLIPS).fill('flip')];
  for (let i = 0; i < plan.length; i++) {
    const mode = plan[i]; const r = { i, mode }; errs = []; other = [];
    try {
      await page.send('Page.navigate', { url: `${base}/index.html` });
      await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł');
      if (mode === 'title') r.flagOnTitle = await page.evaluate('KOSMOS.gameConfig.FEATURES.seededSystems=true');
      await page.evaluate(`document.querySelector('[data-action="new"]').click(), true`);
      await page.waitFor(`!!document.querySelector('.fs-leader-card')`, 'lider');
      await page.evaluate(`document.querySelector('.fs-leader-card').click(), true`);
      await page.waitFor(`!!document.querySelector('#fs-start')`, 'start');
      await page.evaluate(`document.querySelector('#fs-start').click(), true`);
      await page.waitFor(`!!(window.KOSMOS?.starSystemManager && typeof window.csPeek === 'function' && window.KOSMOS?.galaxyData?.seed !== undefined)`, 'GameScene');
      await sleep(2500);
      if (mode === 'flip') r.flagAfterStart = await page.evaluate('KOSMOS.gameConfig.FEATURES.seededSystems=true');
      r.peek = await page.evaluate('csPeek()');
      r.errors = errs.slice();
      r.otherExceptions = other.slice();
      const p = r.peek ?? {};
      r.ok = p.mismatches === 0 && p.generatedForeign >= 1 && p.emergencySeedUses === 0 && r.errors.length === 0
        && p.worldSeeded === (mode === 'title');
    } catch (e) { r.error = String(e?.message ?? e); r.ok = false; }
    if (!r.ok) exitCode = 1;
    results.push(r);
    const p = r.peek ?? {};
    console.log(`[${mode} ${i}] ${r.ok ? 'OK ' : 'RED'} seed=${p.galaxySeed} world=${p.worldSeeded} foreign=${p.generatedForeign} mismatches=${p.mismatches} emergency=${p.emergencySeedUses} cs3aErrors=${r.errors?.length ?? '?'} otherExc=${r.otherExceptions?.length ?? 0}${r.error ? ' ' + r.error : ''}`);
  }
  page.close();
} catch (e) { console.error('sonda:', e); exitCode = 2; }
finally {
  try { chrome.proc.kill(); } catch { /* nic */ }
  server.close();
  await sleep(500);
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* Chrome trzyma pliki — zostaje w tmp */ }
}
const red = results.filter(r => !r.ok).length;
console.log(`SUMMARY probe-cs3a-newgame-ui: root=${ROOT} games=${results.length} (title ${GAMES}, flip ${FLIPS}) red=${red} → ${exitCode === 0 ? 'PASS' : 'FAIL'}`);
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ root: ROOT, results }, null, 1));
process.exit(exitCode);
