// KOSMOS — CS-2 (plan COLONY_SPHERE §3.12): walidacja KAŻDEGO kroku checklisty bramki i każdego scenariusza debug na ŻYWYM
// silniku (headless Chrome, CDP, bez npm), zanim checklista trafi do właściciela.
//
//   node src/testing/headless/probe-cs2-gate.mjs [--root <drzewo>] [--out <plik.json>] [--only newgame]
//
// Zapis właściciela zastępuje fixture GATE-S4-fresh-gy60 (kolonia gracza 16 rzędów, jednostki naziemne, imperia AI).
//   L1  wczytanie, mapa NIE otwarta → cs2Latitude(): wiersze, mapaOtwarta = false; odczyt kosztu = koszt PRAWDZIWEGO _build
//   L2  otwarcie mapy kolonii (openPanel('colony')) → cs2Latitude(): te same liczby, mapaOtwarta = true
//   L3  etykieta pasa w panelu pola (zaznaczony heks, jedna klatka UI): biegun 🧊 ×0.5, przedbiegun 🧊 ×0.7, równik bez
//       etykiety; w panelu jest wiersz budowy research_station (strefa kliku 'build')
//   L4  budowa research_station na polu biegunowym i równikowym drogą kliku UI (planet:buildRequest) na pauzie: ubytek
//       surowców = kolumna koszt z cs2Latitude
//   L5  zapis (game:save) → przeładowanie → «Kontynuuj», mapa NIE otwarta → czas aż budowy się skończą → cs2Latitude():
//       zbudowane research_station: research = oczekiwane (biegun 4, równik 8) PRZED otwarciem mapy; po otwarciu bez zmian
//   S1  cs2EquatorEvent()  S2 cs2Seam()  S3 cs2Invasion()  S4 cs2Strike()
//   N1  nowa gra (płaska) → mapa kolonii → cs2Latitude() (pasy ×0.5 / ×0.7 / ×1.0) + stawki budynków startowych =
//       przeliczone (_calcBaseRates na polu) — ta część działa też na drzewie sprzed CS-2 (kontrola „bez zmian”: --only newgame)
// Serwer tylko czyta; profil Chrome w katalogu tmp. Kod wyjścia: 0 = wszystkie kroki zielone, 1 = czerwone, 2 = błąd sondy.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const REPO = path.resolve(new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(arg('--root', REPO));
const OUT = arg('--out', null);
const ONLY = arg('--only', null);
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.gz': 'application/gzip' };

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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs2g-'));
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
  const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map(); const logs = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result); }
    else if (msg.method === 'Runtime.consoleAPICalled') logs.push((msg.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' '));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value; };
  const waitFor = async (expr, label, ms = 240000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evaluate(expr)) return; } catch { /* strona się ładuje */ } await sleep(400); } throw new Error('timeout: ' + label); };
  return new Promise((res, rej) => { ws.onopen = () => res({ send, evaluate, waitFor, logs, close: () => ws.close() }); ws.onerror = rej; });
}

const checks = [];
const check = (id, ok, detail) => { checks.push({ id, ok: !!ok, detail }); console.log(`${ok ? '✓' : '✗'} ${id} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const J = (s) => JSON.parse(s);

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = await launch();
const page = await cdp(chrome.wsUrl);
await page.send('Runtime.enable'); await page.send('Page.enable');
const title = async () => { await page.send('Page.navigate', { url: `${base}/index.html` }); await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł'); };
const FREEZE = `(async () => { const { TimeSystem } = await import('/src/systems/TimeSystem.js'); const P = TimeSystem.prototype;
  if (!P.__cs2Orig) P.__cs2Orig = P.update; window.__cs2Freeze = true; P.update = function (...a) { if (window.__cs2Freeze) return; return P.__cs2Orig.apply(this, a); }; return true; })()`;
const cont = async () => {
  await page.evaluate(FREEZE);
  await page.evaluate(`document.querySelector('[data-action="continue"]').click(), true`);
  await page.waitFor(`!!(window.KOSMOS?.colonyManager && window.KOSMOS?.buildingSystem && window.KOSMOS?.galaxyData)`, 'GameScene');
  await sleep(2000);
  await page.evaluate(`KOSMOS.timeSystem.pause(), window.__cs2Freeze = false, true`);
};
// Liczby z cs2Latitude (wywołanie aliasu z konsoli — dokładnie jak w checkliście); zwraca {summary, rows, built}
const LAT = `(() => { const r = cs2Latitude(); return JSON.stringify(r); })()`;
const activeRows = (L, name) => L.rows.filter(r => r.kolonia === name);
const sameNumbers = (a, b) => JSON.stringify(a.map(r => [r.kolonia, r.pas, r.pole, r.produkcja, r.koszt])) === JSON.stringify(b.map(r => [r.kolonia, r.pas, r.pole, r.produkcja, r.koszt]));
// Stawki budynków aktywnej kolonii: zapisane vs przeliczone na polu (kontrola „bez zmian” — kod zgodny z obydwoma drzewami)
const RATES_CONSISTENCY = `(() => { const K = window.KOSMOS, col = K.colonyManager.getActiveColony(), bs = col.buildingSystem; let n = 0, same = 0; const bad = [];
  for (const [key, e] of bs._active) { const id = String(key).replace(/^capital_|^building_/, ''); const [q, r] = id.split(',').map(Number); const t = col.grid.get(q, r);
    if (!t || !e.building?.rates) continue; n++; const re = bs._calcBaseRates(e.building, t, e.level ?? 1); const a = JSON.stringify(Object.entries(e.baseRates ?? {}).sort()), b = JSON.stringify(Object.entries(re).sort());
    if (a === b) same++; else if (bad.length < 4) bad.push({ key, b: e.building.id, r, stored: e.baseRates, now: re }); }
  return JSON.stringify({ colony: col.name, H: col.grid.height, n, same, bad }); })()`;

const result = { root: ROOT, checks };
let code = 0;
try {
  if (ONLY !== 'newgame') {
    // ── L1: wczytanie, mapa nie otwarta ──
    await title(); await page.evaluate('localStorage.clear(), true'); await title();
    const imp = J(await page.evaluate(`(async () => { const r = await fetch('/src/testing/fixtures/GATE-S4-fresh-gy60.save.json.gz'); const txt = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text(); const { SaveSystem } = await import('/src/systems/SaveSystem.js'); return JSON.stringify(SaveSystem.importSave(txt)); })()`));
    await title(); await cont();
    const aliases = J(await page.evaluate(`JSON.stringify(['cs2Latitude','cs2Seam','cs2Invasion','cs2Strike','cs2EquatorEvent'].map(k => [k, typeof window[k], typeof KOSMOS.debug[k]]))`));
    check('L0 aliasy konsoli', aliases.every(([, a, b]) => a === 'function' && b === 'function'), aliases.map(a => a[0]).join(' '));
    const L1 = J(await page.evaluate(LAT));
    const act = L1.aktywna;
    const a1 = activeRows(L1, act);
    check('L1 okno: mapa aktywnej kolonii nie otwarta', a1.length === 3 && a1.every(r => r.mapaOtwarta === false), { aktywna: act, rzędów: a1[0]?.rzędów, wiersze: a1.map(r => `${r.pas} ${r.pole} ${r.etykieta} prod ${r.produkcja} koszt ${r.koszt}`) });
    // odczyt kosztu = koszt prawdziwego _build (zamówienie „nie stać” → koszt; zamówienie zdjęte)
    const cross = J(await page.evaluate(`(async () => { const K = window.KOSMOS, col = K.colonyManager.getActiveColony(), bs = col.buildingSystem; const out = [];
      const { cs2BuildCost } = await import('/src/debug/Cs2GeometryDebug.js'); const { BUILDINGS } = await import('/src/data/BuildingsData.js');
      for (const id of ${JSON.stringify(a1.map(r => r.pole).filter(p => p !== '—'))}) { const [q, r] = id.split(',').map(Number); const t = col.grid.get(q, r);
        const store = K.systemPoolService?.getStore?.(bs.resourceSystem) ?? bs.resourceSystem; const prev = store.canAfford; store.canAfford = () => false;
        try { bs._build(t, 'research_station'); } finally { store.canAfford = prev; }
        const o = bs._pendingQueue.get(t.key); if (o) { bs._pendingQueue.delete(t.key); t.pendingBuild = null; }
        out.push({ id, real: o?.cost ?? null, readout: cs2BuildCost(bs, BUILDINGS.research_station, t) }); }
      return JSON.stringify(out); })()`));
    check('L1b odczyt kosztu cs2Latitude = koszt prawdziwego _build', cross.length >= 2 && cross.every(c => c.real && JSON.stringify(Object.entries(c.real).sort()) === JSON.stringify(Object.entries(c.readout).sort())), cross);

    // ── L2: otwarcie mapy ──
    await page.evaluate(`KOSMOS.uiManager.overlayManager.openPanel('colony'), true`); await sleep(1500);
    const L2 = J(await page.evaluate(LAT));
    const a2 = activeRows(L2, act);
    check('L2 po otwarciu mapy: te same liczby, mapaOtwarta = true', sameNumbers(a1, a2) && a2.every(r => r.mapaOtwarta === true), a2.map(r => `${r.pas} ${r.pole} prod ${r.produkcja} koszt ${r.koszt}`));

    // ── L3: etykieta pasa i wiersz budowy w panelu pola ──
    const labels = J(await page.evaluate(`(() => { const K = window.KOSMOS, ov = K.uiManager.overlayManager.overlays.colony; const P = CanvasRenderingContext2D.prototype; const orig = P.fillText; const out = {};
      const col = K.colonyManager.getActiveColony(); const pol = col.grid.toArray().find(t => t.r === 0);   // heks z pierwszego rzędu (krok 4: biegun)
      for (const id of [...${JSON.stringify(a2.map(r => r.pole))}, pol.q + ',' + pol.r]) { if (id === '—') continue; const [q, r] = id.split(',').map(Number); ov._selectedHex = { q, r }; const texts = [];
        P.fillText = function (s, ...rest) { texts.push(String(s)); return orig.call(this, s, ...rest); }; try { K.uiManager._draw(); } finally { P.fillText = orig; }
        out[id] = { label: texts.find(s => s.startsWith('(' + id + ')')) ?? null, buildZone: (ov._hitZones ?? []).some(z => z.type === 'build' && z.data?.buildingId === 'research_station') }; }
      ov._selectedHex = null; return JSON.stringify(out); })()`));
    const want = { biegun: '🧊 ×0.5', przedbiegun: '🧊 ×0.7', 'równik': null };
    const lab = a2.filter(r => r.pole !== '—').map(r => ({ pas: r.pas, pole: r.pole, ...labels[r.pole] }));
    const polarKey = Object.keys(labels).find(k => !a2.some(r => r.pole === k));
    check('L3 etykieta pasa w panelu pola + wiersz budowy research_station', lab.length >= 2 && lab.every(l => (want[l.pas] ? l.label?.endsWith(want[l.pas]) : l.label && !l.label.includes('🧊')) && l.buildZone), lab);
    check('L3b heks pierwszego rzędu: etykieta 🧊 ×0.5', !!polarKey && labels[polarKey].label?.endsWith('🧊 ×0.5'), { pole: polarKey, ...labels[polarKey] });

    // ── L4: budowa na pauzie, ubytek = koszt ──
    const builds = J(await page.evaluate(`(async () => { const K = window.KOSMOS, col = K.colonyManager.getActiveColony(), bs = col.buildingSystem; const EB = (await import('/src/core/EventBus.js')).default;
      const store = K.systemPoolService?.getStore?.(bs.resourceSystem) ?? bs.resourceSystem; const amt = (k) => store.getAmount?.(k) ?? store.inventory?.get?.(k) ?? 0; const out = [];
      store.receive({ Si: 200, Cu: 100, structural_alloys: 20, electronic_systems: 20 });   // sonda: surowce na dwie budowy (fixture ma za mało)
      for (const [pas, id] of ${JSON.stringify(a2.filter(r => r.pole !== '—').slice(-2).map(r => [r.pas, r.pole]))}) { const [q, r] = id.split(',').map(Number); const t = col.grid.get(q, r);
        const keys = ['Si', 'Cu', 'Fe', 'structural_alloys', 'electronic_systems']; const before = Object.fromEntries(keys.map(k => [k, amt(k)]));
        EB.emit('planet:buildRequest', { tile: t, buildingId: 'research_station' });
        const after = Object.fromEntries(keys.map(k => [k, amt(k)]));
        out.push({ pas, id, drop: Object.fromEntries(keys.map(k => [k, +(before[k] - after[k]).toFixed(6)]).filter(([, v]) => v !== 0)), queued: !!t.pendingBuild, building: !!t.underConstruction }); }
      return JSON.stringify(out); })()`));
    const costOf = (pole) => Object.fromEntries((a2.find(r => r.pole === pole)?.koszt ?? '').split(', ').map(s => s.split(' ')).map(([k, v]) => [k, Number(v)]));
    check('L4 budowa (klik UI) na pauzie: ubytek surowców = koszt z cs2Latitude', builds.length >= 2 && builds.every(b => b.building && JSON.stringify(Object.entries(b.drop).sort()) === JSON.stringify(Object.entries(costOf(b.id)).sort())), builds.map(b => ({ ...b, koszt: costOf(b.id) })));
    await page.evaluate(`KOSMOS.uiManager.overlayManager.closeActive(), true`);

    // ── L5: zapis → przeładowanie → okno → budowy kończą się przed otwarciem mapy ──
    await page.evaluate(`(async () => { (await import('/src/core/EventBus.js')).default.emit('game:save'); return true; })()`);
    await title(); await cont();
    const runCiv = `(() => { const ts = KOSMOS.timeSystem; ts.setMultiplier(4); let n = 0; const col = KOSMOS.colonyManager.getActiveColony();
      while (col.buildingSystem._constructionQueue.size > 0 && n < 4000) { ts.isPaused = false; ts.update(100); n++; } ts.isPaused = true; ts.setMultiplier(1);
      return JSON.stringify({ n, queue: col.buildingSystem._constructionQueue.size, gridBound: col.buildingSystem._grid === col.grid }); })()`;
    const ran = J(await page.evaluate(runCiv));
    const L5 = J(await page.evaluate(LAT));
    const b5 = L5.built.filter(r => r.kolonia === act);
    const builtIds = builds.map(b => b.id);
    const mine = b5.filter(r => builtIds.includes(r.pole));
    check('L5 po wczytaniu, mapa NIE otwarta: budowy skończone w oknie, research = oczekiwane z pasa', ran.queue === 0 && !ran.gridBound && mine.length === builtIds.length && mine.every(r => r.research === r.oczekiwane), { ran, zbudowane: mine });
    await page.evaluate(`KOSMOS.uiManager.overlayManager.openPanel('colony'), true`); await sleep(1200);
    const L5b = J(await page.evaluate(LAT));
    const mineB = L5b.built.filter(r => builtIds.includes(r.pole) && r.kolonia === act);
    check('L5b po otwarciu mapy: te same stawki i liczby pasów', JSON.stringify(mineB) === JSON.stringify(mine) && sameNumbers(activeRows(L5, act), activeRows(L5b, act)), mineB);
    await page.evaluate(`KOSMOS.uiManager.overlayManager.closeActive(), true`);

    // ── S1: zdarzenie z fallbackiem równikowym ──
    const s1 = J(await page.evaluate(`JSON.stringify(cs2EquatorEvent())`));
    check('S1 cs2EquatorEvent', s1?.pasPolaZastępczego === 'równik' && s1.researchPo === s1.oczekiwane && s1.poziom === '2 → 1' && s1.koloniaNietknięta === true, s1);

    // ── S2: szew ──
    const before = page.logs.length;
    const s2 = J(await page.evaluate(`JSON.stringify(cs2Seam())`));
    const speed0 = await page.evaluate('KOSMOS.timeSystem.multiplierIndex');
    let end = null; const t0 = Date.now();
    while (Date.now() - t0 < 90000) { end = page.logs.slice(before).find(l => l.startsWith('[cs2Seam] KONIEC')); if (end) break; await sleep(500); }
    const steps = page.logs.slice(before).filter(l => l.startsWith('[cs2Seam] krok'));
    const endSum = end ? J(end.slice(end.indexOf('{'), end.lastIndexOf('}') + 1)) : null;
    const speed1 = await page.evaluate('JSON.stringify({ idx: KOSMOS.timeSystem.multiplierIndex, paused: KOSMOS.timeSystem.isPaused })');
    check('S2 cs2Seam: 3 kroki, dokładnie 1 przez szew, cel osiągnięty, jednostka usunięta, czas przywrócony', s2?.rozkaz === true && endSum?.koniec === 'dotarła' && endSum.kroków === 3 && endSum.przezSzew === 1 && endSum.jednostkaUsunięta && J(speed1).paused === true,
      { start: s2, kroki: steps, koniec: endSum, czasPodczas: speed0, czasPo: J(speed1) });

    // ── S3: desant ──
    const s3 = J(await page.evaluate(`JSON.stringify(cs2Invasion())`));
    check('S3 cs2Invasion: desant na polach strefy lądowania', s3?.desant === true && s3.wylądowało > 0 && s3.naPolachStrefy === s3.wylądowało, s3);
    await page.evaluate(`KOSMOS.uiManager.overlayManager.closeActive(), true`);

    // ── S4: eskadra ──
    const s4 = J(await page.evaluate(`JSON.stringify(cs2Strike())`));
    check('S4 cs2Strike: eskadra wystartowała, fala przy kotwicy, anyTile stolic = 0,0', s4?.eskadra === true && s4.fala > 0 && s4.falaNaKotwicy === s4.fala && s4.anyTileWszystkichStolic === '0,0', s4);
    result.logs = page.logs.filter(l => l.startsWith('[cs2'));
  }

  // ── N1: nowa gra (płaska) ──
  await title(); await page.evaluate('localStorage.clear(), true'); await title();
  await page.evaluate(`document.querySelector('[data-action="new"]').click(), true`);
  await page.waitFor(`!!document.querySelector('.fs-leader-card')`, 'lider');
  await page.evaluate(`document.querySelector('.fs-leader-card').click(), true`);
  await page.waitFor(`!!document.querySelector('#fs-start')`, 'start');
  await page.evaluate(`document.querySelector('#fs-start').click(), true`);
  await page.waitFor(`!!(window.KOSMOS?.starSystemManager && typeof window.csClimate === 'function' && window.KOSMOS?.galaxyData?.seed !== undefined)`, 'nowa gra');
  await sleep(3000);
  result.newGameState = J(await page.evaluate(`JSON.stringify({ civMode: KOSMOS.civMode ?? null, colonies: KOSMOS.colonyManager?.getAllColonies?.().length ?? null, active: KOSMOS.colonyManager?.getActiveColony?.()?.name ?? null, grid: !!KOSMOS.colonyManager?.getActiveColony?.()?.grid, scenario: KOSMOS.scenario ?? null })`));
  console.log('nowa gra:', JSON.stringify(result.newGameState));
  // Intro nowej gry (lot kamery + ekrany narracji + nazwy): Escape pomija narrację, Enter zatwierdza domyślne nazwy.
  for (let i = 0; i < 180; i++) {
    if (await page.evaluate(`!!window.KOSMOS?.colonyManager?.getActiveColony?.()?.grid`)) break;
    await page.evaluate(`(() => { for (const k of ['Escape', 'Enter']) document.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, bubbles: true })); return true; })()`);
    await sleep(1000);
  }
  await page.waitFor(`!!window.KOSMOS?.colonyManager?.getActiveColony?.()?.grid`, 'nowa gra: kolonia z mapą', 10000);
  await page.evaluate(`KOSMOS.timeSystem.pause(), true`);
  await page.evaluate(`KOSMOS.uiManager.overlayManager.openPanel('colony'), true`); await sleep(1500);
  const rc = J(await page.evaluate(RATES_CONSISTENCY));
  check('N1 nowa gra: stawki budynków startowych = przeliczone na polu', rc.n > 0 && rc.same === rc.n, rc);
  if (ONLY !== 'newgame') {
    const N = J(await page.evaluate(LAT));
    const an = activeRows(N, N.aktywna);
    const mult = { biegun: 0.5, przedbiegun: 0.7, 'równik': 1 };
    check('N1b nowa gra: cs2Latitude — mapa otwarta, produkcja 8 × pas', an.length === 3 && an.every(r => r.mapaOtwarta && (r.produkcja == null || Math.abs(r.produkcja - 8 * mult[r.pas]) < 1e-9)), an.map(r => `${r.pas} ${r.pole} ${r.etykieta} prod ${r.produkcja} koszt ${r.koszt}`));
  }
} catch (e) { console.error('sonda:', e); result.error = String(e?.message ?? e); code = 2; }
finally { try { chrome.proc.kill(); } catch {} server.close(); await sleep(500); try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch {} }
if (!code && checks.some(c => !c.ok)) code = 1;
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log(`\n${checks.filter(c => c.ok).length}/${checks.length} kroków zielonych${result.error ? ' — BŁĄD: ' + result.error : ''}`);
process.exit(code);
