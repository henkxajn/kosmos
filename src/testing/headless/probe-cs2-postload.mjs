// KOSMOS — CS-2 / Finding 779 (plan COLONY_SPHERE §3.12): okno po wczytaniu zapisu na ŻYWYM silniku (headless Chrome,
// CDP, bez npm). Ta sama sonda na dwóch drzewach: `--root <drzewo sprzed CS-2>` (np. worktree 4829bec) i bieżące.
//
//   node src/testing/headless/probe-cs2-postload.mjs [--root <drzewo>] [--out <plik.json>]
//
// Przebieg: fixture GATE-S4-fresh-gy60 → SaveSystem.importSave → «Kontynuuj» → pauza, ŻADNEGO ticku.
//   1. zrzut stanu po wczytaniu: zapis gry (KOSMOS.gameScene.saveSystem.save → SaveSystem.exportSave), znormalizowany (savedAt,
//      tileR) — porównanie dwóch drzew mówi, czy poza pasem szerokości różni się cokolwiek innego;
//   2. okno (mapa kolonii nie otwarta): dla kolonii z listy — wysokość siatki, stan BuildingSystem (_grid związane?,
//      _gridHeight), po jednym wolnym polu na pas (biegun / przedbiegun / równik wg prawdziwej wysokości siatki):
//      produkcja research_station (_calcBaseRates) i koszt budowy (PRAWDZIWE _build; zakup „nie stać” → koszt z zamówienia
//      oczekującego, zamówienie zdjęte);
//   3. otwarcie mapy kolonii tak, jak robi to gracz (switchActiveColony + openPanel('colony'), zamknięcie) → te same pola;
//   4. rok gry (AI ekspander synchronizuje siatki swoich kolonii) → te same pola. Pomiar per RZĄD siatki (jedno pole na rząd).
// Serwer tylko czyta; profil Chrome w katalogu tmp. Kod wyjścia: 0 = przebieg kompletny, 2 = błąd sondy.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const REPO = path.resolve(new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(arg('--root', REPO));
const OUT = arg('--out', null);
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.gz': 'application/gzip' };

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    let file = path.join(ROOT, rel || 'index.html');
    if (!fs.existsSync(file) && rel.startsWith('assets/')) file = path.join(REPO, rel);   // assety wspólne (nie w worktree)
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs2-'));
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
  const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value; };
  const waitFor = async (expr, label, ms = 240000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evaluate(expr)) return; } catch { /* strona się ładuje */ } await sleep(400); } throw new Error('timeout: ' + label); };
  return new Promise((res, rej) => { ws.onopen = () => res({ send, evaluate, waitFor, close: () => ws.close() }); ws.onerror = rej; });
}

// Kolonie do pomiaru: aktywna gracza + inne kolonie gracza + kolonia AI (lista ustalana w stronie z kanonu własności).
const MEASURE = `(async (phase) => {
  const K = window.KOSMOS;
  const { HexGrid } = await import('/src/map/HexGrid.js');
  const { BUILDINGS } = await import('/src/data/BuildingsData.js');
  const { evaluatePlacement } = await import('/src/map/HexTile.js');
  const { isPlayerColony } = await import('/src/utils/ColonyOwnership.js');
  const RS = BUILDINGS.research_station;
  const cm = K.colonyManager;
  const all = cm.getAllColonies().filter(c => c.grid && c.buildingSystem);
  const active = cm.getActiveColony?.() ?? cm.getColony(cm._activePlanetId);
  // aktywna gracza, pozostałe kolonie gracza, kolonie AI o różnych wysokościach siatki, jedna placówka
  const players = all.filter(c => isPlayerColony(c) && c !== active && !c.isOutpost);
  const ai = all.filter(c => !isPlayerColony(c) && !c.isOutpost);
  const aiByH = []; for (const c of ai) if (!aiByH.some(x => x.grid.height === c.grid.height)) aiByH.push(c);
  const outpost = all.find(c => c.isOutpost);
  const list = window.__cs2List ??= [active, ...players.slice(0, 3), ...aiByH, outpost].filter(Boolean).map(c => c.planetId);
  const buildCost = (bs, tile) => {
    const store = K.systemPoolService?.getStore?.(bs.resourceSystem) ?? bs.resourceSystem;
    if (bs._pendingQueue.has(tile.key)) return { refused: 'pre-existing order' };
    let reason = null; const prev = store.canAfford; store.canAfford = () => false;
    try { bs._build(tile, RS.id); } finally { store.canAfford = prev; }
    const order = bs._pendingQueue.get(tile.key);
    if (order) { bs._pendingQueue.delete(tile.key); tile.pendingBuild = null; }
    return order?.cost ?? { refused: reason ?? 'no order' };
  };
  const out = { phase, activeId: active?.planetId ?? null, colonies: [] };
  for (const pid of list) {
    const col = cm.getColony(pid); const bs = col.buildingSystem; const H = col.grid.height;
    const planet = bs._resolveOwnPlanet();
    const rec = { pid, name: col.name, player: isPlayerColony(col), outpost: !!col.isOutpost, H, gridBound: bs._grid === col.grid,
      gridHeightField: ('_gridHeight' in bs) ? bs._gridHeight : 'removed', rows: {} };
    // po jednym polu na RZĄD (pierwsze wolne, bez anomalii, przechodzące bramkę terenu research_station); pas oczekiwany
    // = dawna reguła z PRAWDZIWĄ wysokością siatki (stan nowej gry)
    const pickFor = (r, needPlacement) => col.grid.toArray().find(t => t.r === r && !t.buildingId && !t.capitalBase && !t.underConstruction
      && !t.pendingBuild && !t.anomalyEffect && !bs._pendingQueue.has(t.key) && !bs._constructionQueue.has(t.key)
      && (!needPlacement || evaluatePlacement(t, RS, { techSystem: bs.techSystem, planet }).ok));
    for (let r = 0; r < H; r++) {
      const want = HexGrid.getLatitudeModifier(r, H);
      const tb = col.isOutpost ? null : pickFor(r, true);
      const tp = tb ?? pickFor(r, false);
      if (!tp) continue;
      rec.rows[r] = { tile: tp.key, band: want.production === 0.5 ? 'polar' : want.production === 0.7 ? 'subpolar' : 'equatorial',
        expectedProd: RS.rates.research * want.production, prod: bs._calcBaseRates(RS, tp, 1).research ?? null,
        costTile: tb?.key ?? null, cost: tb ? buildCost(bs, tb) : null };
    }
    out.colonies.push(rec);
  }
  return JSON.stringify(out);
})`;

// Otwarcie mapy kolonii tak jak gracz: aktywna kolonia → panel kolonii; potem pozostałe; powrót do aktywnej.
const OPEN_MAPS = `(async () => {
  const K = window.KOSMOS; const cm = K.colonyManager; const om = K.uiManager?.overlayManager;
  const back = window.__cs2List[0]; const opened = [];
  for (const pid of window.__cs2List) {
    const c0 = cm.getColony(pid);
    if (c0?.isOutpost || !(await import('/src/utils/ColonyOwnership.js')).isPlayerColony(c0)) continue;   // mapę otwiera tylko gracz
    cm.switchActiveColony(pid);
    om?.openPanel?.('colony');
    await new Promise(r => setTimeout(r, 300));
    const col = cm.getColony(pid);
    opened.push({ pid, bound: col.buildingSystem._grid === col.grid });
    om?.closeActive?.();
  }
  cm.switchActiveColony(back);
  return JSON.stringify(opened);
})()`;

const SAVE_DIGEST = `(async () => {
  const { SaveSystem } = await import('/src/systems/SaveSystem.js');
  KOSMOS.gameScene.saveSystem.save();
  const raw = SaveSystem.exportSave();
  const obj = JSON.parse(raw);
  delete obj.savedAt;
  // tileR: CS-2 przestał je zapisywać — usuwamy z kolejek, żeby porównać resztę
  const strip = (q) => (q ?? []).map(({ tileR, ...rest }) => rest);
  for (const c of obj.civ4x?.colonies ?? []) { c.constructionQueue = strip(c.constructionQueue); c.pendingQueue = strip(c.pendingQueue); }
  return JSON.stringify(obj);
})()`;

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = await launch();
const page = await cdp(chrome.wsUrl);
await page.send('Runtime.enable'); await page.send('Page.enable');
const title = async () => { await page.send('Page.navigate', { url: `${base}/index.html` }); await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł'); };
const result = { root: ROOT };
let code = 0;
try {
  await title(); await page.evaluate('localStorage.clear(), true'); await title();
  result.import = JSON.parse(await page.evaluate(`(async () => { const r = await fetch('/src/testing/fixtures/GATE-S4-fresh-gy60.save.json.gz'); const txt = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text(); const { SaveSystem } = await import('/src/systems/SaveSystem.js'); return JSON.stringify(SaveSystem.importSave(txt)); })()`));
  await title();
  // Zegar zamrożony PRZED «Kontynuuj»: pętla rAF nie przesuwa czasu gry przed pauzą (inaczej zapis po wczytaniu różni się
  // dryfem ~1e-5 roku między przebiegami i nie da się go porównać bit w bit). Ta sama instancja modułu co w grze.
  await page.evaluate(`(async () => { const { TimeSystem } = await import('/src/systems/TimeSystem.js'); const P = TimeSystem.prototype;
    const orig = P.update; window.__cs2Freeze = true; P.update = function (...a) { if (window.__cs2Freeze) return; return orig.apply(this, a); }; return true; })()`);
  await page.evaluate(`document.querySelector('[data-action="continue"]').click(), true`);
  await page.waitFor(`!!(window.KOSMOS?.colonyManager && window.KOSMOS?.buildingSystem && window.KOSMOS?.galaxyData)`, 'GameScene');
  await sleep(1500);
  await page.evaluate(`KOSMOS.timeSystem.pause(), window.__cs2Freeze = false, true`);
  result.gameTime = await page.evaluate('KOSMOS.timeSystem.gameTime');
  const save = await page.evaluate(SAVE_DIGEST);
  result.saveSha = createHash('sha256').update(save).digest('hex');
  result.saveBytes = save.length;
  if (OUT) fs.writeFileSync(OUT.replace(/\.json$/, '') + '.save.json', save);
  result.window = JSON.parse(await page.evaluate(`${MEASURE}('window')`));
  result.opened = JSON.parse(await page.evaluate(OPEN_MAPS));
  result.afterOpen = JSON.parse(await page.evaluate(`${MEASURE}('afterOpen')`));
  // 4. rok gry (AI ekspander synchronizuje siatki swoich kolonii — tu kolonie AI dostają BuildingSystem._grid)
  result.tick = JSON.parse(await page.evaluate(`(() => { const ts = KOSMOS.timeSystem; ts.setMultiplier(ts.multipliers.length - 1); const t0 = ts.gameTime;
    let n = 0; while (ts.gameTime - t0 < 1 && n < 200000) { ts.isPaused = false; ts.update(100); n++; } ts.isPaused = true; return JSON.stringify({ dt: ts.gameTime - t0, n }); })()`));
  result.afterTick = JSON.parse(await page.evaluate(`${MEASURE}('afterTick')`));
  result.gameTimeEnd = await page.evaluate('KOSMOS.timeSystem.gameTime');
} catch (e) { console.error('sonda:', e); result.error = String(e?.message ?? e); code = 2; }
finally { try { chrome.proc.kill(); } catch {} server.close(); await sleep(500); try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch {} }
const json = JSON.stringify(result, null, 1);
if (OUT) fs.writeFileSync(OUT, json);
console.log(json);
process.exit(code);
