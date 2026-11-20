// probe-cs8c-pages — prawdziwa gra (headless Chrome przez CDP, 1600×1041, prawdziwe zdarzenia myszy): strony konsoli Kolonii
// (Załoga, Populacja, Stacja + pickery, rekrutacja, szuflada grupy) — ujęcia + kontrole CS-8c (plan §3.17).
//
//   node src/testing/headless/probe-cs8c-pages.mjs --out <dir>                 ujęcia do katalogu (bez arkusza) — np. na HEAD w worktree („przed”)
//   node src/testing/headless/probe-cs8c-pages.mjs --before <dir>              ujęcia „po” + arkusz cs8c-pages.png (przed | po + 5 motywów)
//
// Ujęcia i kroki tylko przez strefy trafień, które istnieją przed i po CS-8c (dzisiejsze typy), więc ten sam plik działa na obu.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT_DIR = path.join(REPO, 'docs/design/prototypes');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const THEMES = ['ss_amber_noir', 'ss_cold_blue', 'ss_galactic_violet', 'ss_neon_cyber', 'ss_biopunk_green'];
const SHOT_DIR = arg('--out') ? path.resolve(arg('--out')) : fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs8c-shots-'));
const BEFORE_DIR = arg('--before') ? path.resolve(arg('--before')) : null;
fs.mkdirSync(SHOT_DIR, { recursive: true });

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    const img = (dir, name) => fs.readFile(path.join(dir, path.basename(name)), (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); res.end(buf);
    });
    if (rel.startsWith('__shot/')) return img(SHOT_DIR, rel);
    if (rel.startsWith('__before/') && BEFORE_DIR) return img(BEFORE_DIR, rel);
    if (rel === '__sheet') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><html><body style="margin:0;background:#05070b"><canvas id="c"></canvas></body></html>'); }
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs8c-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--mute-audio', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11',
    '--enable-unsafe-swiftshader', '--window-size=1600,1041', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 150; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = l.find(t => t.type === 'page'); if (p) return { proc, profile, wsUrl: p.webSocketDebuggerUrl }; } catch { /* jeszcze nie */ }
    await sleep(100);
  }
  proc.kill(); throw new Error('Chrome nie wstał');
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result); } else for (const f of listeners) f(msg); };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, label, ms = 240000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evaluate(expr)) return; } catch { /* ładuje się */ } await sleep(250); } throw new Error('timeout: ' + label); };
  return new Promise((res, rej) => { ws.onopen = () => res({ send, evaluate, waitFor, on: (f) => listeners.push(f), close: () => ws.close() }); ws.onerror = rej; });
}

const checks = [];
const check = (ok, name, detail = '') => { checks.push({ ok: !!ok, name }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = await launch();
let exitCode = 0;
try {
  const page = await cdp(chrome.wsUrl);
  const exc = [];
  page.on((m) => { if (m.method === 'Runtime.exceptionThrown') exc.push((m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').slice(0, 500)); });
  await page.send('Runtime.enable'); await page.send('Page.enable');
  const shots = [];
  const shot = async (name, label) => {
    await sleep(450);
    const d = (await page.send('Page.captureScreenshot', { format: 'png' })).data;
    fs.writeFileSync(path.join(SHOT_DIR, `${name}.png`), Buffer.from(d, 'base64'));
    shots.push({ name, label });
  };
  // nowa gra z flagą (jak probe-cs8-console)
  await page.send('Page.navigate', { url: `${base}/index.html` });
  await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł');
  for (const f of ['colonySphere', 'sharedSurface', 'seededSystems', 'realisticClimate', 'scaledOrbits']) await page.evaluate(`KOSMOS.gameConfig.FEATURES.${f} = true`);
  await page.evaluate(`document.querySelector('[data-action="new"]').click(), true`);
  await page.waitFor(`!!document.querySelector('.fs-leader-card')`, 'lider');
  await page.evaluate(`document.querySelector('.fs-leader-card').click(), true`);
  await page.waitFor(`!!document.querySelector('#fs-start')`, 'start');
  await page.evaluate(`document.querySelector('#fs-start').click(), true`);
  await page.waitFor(`!!window.KOSMOS?.surfaceCache && !!window.KOSMOS?.gameScene`, 'GameScene');
  await page.waitFor(`window.KOSMOS?.gameScene?._introLockActive === false`, 'koniec intro', 240000);
  await sleep(2500);
  for (let i = 0, clean = 0; i < 40 && clean < 4; i++) {
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
  await page.waitFor(`!!KOSMOS.colonyManager?.getColony?.(KOSMOS.homePlanet?.id)`, 'kolonia macierzysta', 60000);
  await page.evaluate(`(() => { const ts = KOSMOS.timeSystem; if (ts && !ts.isPaused) (ts.pause?.() ?? (ts.isPaused = true)); return true; })()`);
  await page.evaluate(String.raw`(() => {
    const ov = () => KOSMOS.overlayManager.overlays.colony;
    const k = () => Math.min(innerWidth / 1280, innerHeight / 720);
    const css = (z) => ({ x: (z.x + z.w / 2) * k(), y: (z.y + z.h / 2) * k(), data: z.data ?? null, type: z.type, raw: { x: z.x, y: z.y, w: z.w, h: z.h } });
    window.__g = {
      ov,
      open() { if (!ov().visible) KOSMOS.overlayManager.openPanel('colony'); KOSMOS.uiManager._dirty = true; return ov().visible; },
      col() { return ov()._getColony(); },
      zones(type, pred) { return ov()._hitZones.filter(z => z.type === type && (!pred || pred(z.data ?? {}))).map(css); },
      chip(id) { return ov()._hitZones.filter(z => z.type === 'cChip' && z.data?.id === id).map(css)[0] ?? null; },
      types() { return [...new Set(ov()._hitZones.map(z => z.type))]; },
      state() { const o = ov(); return { console: !!o._consoleOn, insp: o._cInspector?.kind ?? null, tab: o._cInspTab ?? null, draft: !!o._draftOpen,
        picker: !!o._stationPickerOpen, shipPicker: !!o._stationShipPickerOpen, sel: o._selectedUnits?.size ?? 0, zones: o.consoleZones ? { hero: o.consoleZones.hero, inspector: o.consoleZones.inspector } : null,
        flash: (Date.now() < (o._flashEnd ?? 0)) ? o._flashMsg : null, queue: o._getColony()?.groundUnitQueues?.length ?? 0 }; },
      barracks() {   // inscenizacja: Koszary Lv1 od razu na wolnym polu (jak csBarracks)
        const c = this.col(), b = c.buildingSystem, g = c.grid ?? b._grid;
        const t = g.tiles.find(t => !t.capitalBase && !t.buildingId && !t.underConstruction && !t.pendingBuild && !t.isOccupied && ['plains', 'forest', 'desert', 'tundra', 'mountains'].includes(t.type));
        b._activateBuilding(t.key, 'barracks_lv1', null, t.type, false);
        ov()._syncTileBuildings(ov()._getGrid(c), b); KOSMOS.uiManager._dirty = true;
        return KOSMOS.colonyManager._getBarracksLevel(c);
      },
      rich() { const rs = this.col().resourceSystem, st = KOSMOS.systemPoolService?.getStore?.(rs) ?? rs;
        for (const q of ['Fe', 'Si', 'Cu', 'C', 'Ti', 'Al']) st.inventory.set(q, 3000);
        for (const q of ['structural_alloys', 'polymer_composites', 'power_cells', 'conductor_bundles', 'pressure_modules', 'electronic_systems']) st.inventory.set(q, 200);
        this.col().credits = Math.max(this.col().credits ?? 0, 5000); return true; },
      group() { const c = this.col(); const mine = (KOSMOS.groundUnitManager.getUnitsOnPlanet(c.planetId) ?? []).filter(u => u.owner === 'player' || u.factionId === 'humanity');
        ov()._selectedUnits = new Set(mine.map(u => u.id)); ov()._selectedUnit = mine[0] ?? null; ov()._selectedHex = null; KOSMOS.uiManager._dirty = true; return mine.length; },
    };
    return true;
  })()`);
  const mouse = async (type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'none', buttons: 0, ...extra });
  const move = (x, y) => mouse('mouseMoved', x, y);
  const click = async (x, y) => { await move(x, y); await sleep(60); await mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1 }); await mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 1 }); await sleep(250); };
  const G = (expr) => page.evaluate(`(() => { const g = window.__g; return ${expr}; })()`);
  const st = () => G('g.state()');
  const zone = async (type, pred = 'null') => (await G(`g.zones(${JSON.stringify(type)}, ${pred})`))[0] ?? null;
  const clickZone = async (z) => { if (!z) return false; await click(z.x, z.y); return true; };
  const theme = (name) => page.evaluate(`import('/src/config/ThemeConfig.js').then(m => { m.applyPreset(m.PRESET_THEMES[${JSON.stringify(name)}]); KOSMOS.uiManager._dirty = true; return true; })`);
  const tab = async (id) => { await clickZone(await zone('cInspTab', `d => d.id === ${JSON.stringify(id)}`)); await sleep(300); };

  await G('g.open()'); await sleep(4500);
  let s = await st();
  check(s.console && s.insp === 'summary', 'konsola Kolonii otwarta (nic nie zaznaczone)', JSON.stringify({ insp: s.insp }));
  await G('g.rich()');
  const lv = await G('g.barracks()');
  check(lv >= 1, 'inscenizacja: koszary Lv1 w kolonii macierzystej', `lv ${lv}`);
  await page.evaluate(`csStationTech()`);
  await sleep(300);

  // ── Załoga ──
  await tab('workforce');
  s = await st();
  const crewTypes = await G('g.types()');
  check(s.tab === 'workforce', 'podzakładka Załoga');
  check(['targetPlus', 'draft_open', 'strataRow', 'wfInfo'].every(t => crewTypes.includes(t)), 'Załoga: dzisiejsze strefy (cel, rekrutacja, warstwa, podsumowanie)', crewTypes.filter(t => /target|droid|draft|strata|wfInfo|cReason|infoTab/.test(t)).join(','));
  check(!crewTypes.includes('infoTab'), 'Załoga: brak paska zakładek starego okna (infoTab)');
  await shot('crew', 'Załoga');
  const gz = (await G(`g.zones('wfInfo')`)).slice(-1)[0];
  if (gz) { await move(gz.x, gz.y); await sleep(300); }
  await shot('crew-tip', 'Załoga — podpowiedź wzrostu (najechanie)');
  // ── Populacja ──
  await move(5, 5);
  await tab('populacja');
  check((await st()).tab === 'populacja', 'podzakładka Populacja');
  await shot('pop', 'Populacja');
  // ── Rekrutacja ──
  await tab('workforce');
  await clickZone(await zone('draft_open'));
  s = await st();
  check(s.draft, 'Rekrutuj otwiera okno rekrutacji', `draft ${s.draft}, flash ${s.flash}`);
  const q0 = s.queue;
  const rec = await zone('ground:recruit');
  if (!rec) console.log('  recruit disabled:', JSON.stringify(await G(`g.ov()._hitZones.filter(q => q.type === 'cReason').map(q => q.data.tip).slice(-3)`)));
  if (rec) await move(rec.x, rec.y);
  await shot('recruit', 'Rekrutacja — okno');
  await clickZone(rec);
  s = await st();
  check(s.queue === q0 + 1, 'Rekrutacja: klik [ REKRUTUJ ] dodaje jednostkę do kolejki koszar', `${q0} → ${s.queue}`);
  const winR = (await G(`(() => { const z = g.ov()._hitZones.find(q => q.type === 'draftDialogBg'); return z ? { x: z.x, y: z.y, w: z.w, h: z.h } : null; })()`));
  const zz = s.zones;
  check(winR && zz && winR.x + winR.w <= zz.inspector.x + 1 && winR.x >= zz.hero.x, 'okno rekrutacji obok strefy inspektora (nie na środku kuli)', JSON.stringify({ win: winR, insp: zz?.inspector?.x }));
  await clickZone(await zone('draft_close'));
  check(!(await st()).draft, '[ x ] zamyka okno rekrutacji');
  // ── Stacja ──
  await clickZone(await G(`g.chip('view:station')`)); await sleep(400);
  check((await st()).insp === 'station', 'czip Stacja → strona Stacji');
  await shot('station-build', 'Stacja — formularz budowy (brak stacji)');
  await page.evaluate(`(KOSMOS.debug.spawnStation(KOSMOS.overlayManager.overlays.colony._getColony().planetId), true)`); await sleep(500);
  await shot('station-manage', 'Stacja — zarządzanie');
  await clickZone(await zone('station_mgmt_addslot'));
  s = await st();
  check(s.picker, 'Dodaj moduł otwiera picker modułów', `picker ${s.picker}`);
  const pr = await G(`(() => { const z = g.ov()._hitZones.find(q => q.type === 'station_mgmt_picker_bg'); return z ? { x: z.x, y: z.y, w: z.w, h: z.h } : null; })()`);
  check(pr && zz && pr.x + pr.w <= zz.inspector.x + 1, 'picker stacji obok strefy inspektora', JSON.stringify(pr));
  const dis = await zone('cReason');
  if (dis) await move(dis.x, dis.y);
  await shot('picker-module', 'Stacja — picker modułów (wyłączony wiersz z powodem)');
  await clickZone(await zone('station_mgmt_picker_close'));
  check(!(await st()).picker, '[ x ] zamyka picker');
  await G(`(g.ov()._stationShipPickerOpen = true, g.ov()._stationPickerOpen = false, KOSMOS.uiManager._dirty = true)`); await sleep(300);
  await shot('picker-ship', 'Stacja — picker statków (projekty gracza)');
  await G(`(g.ov()._stationShipPickerOpen = false, KOSMOS.uiManager._dirty = true)`);
  await clickZone(await G(`g.chip('view:colony')`)); await sleep(300);
  // ── Szuflada grupy ──
  for (let i = 0; i < 2; i++) await page.evaluate(`((KOSMOS.debug?.csSphereUnit?.() ?? window.csSphereUnit?.()), true)`);
  const n = await G('g.group()'); await sleep(500);
  s = await st();
  const dr = await G(`(() => { const z = g.ov()._hitZones.filter(q => q.type === 'floatPanel').pop(); return z ? { x: z.x, y: z.y, w: z.w, h: z.h } : null; })()`);
  check(n >= 2 && s.sel >= 2, 'dwie jednostki (csSphereUnit ×2) zaznaczone jako grupa', `units ${n}, sel ${s.sel}`);
  await shot('drawer', 'Szuflada grupy jednostek (2 zaznaczone)');
  if (!arg('--out')) check(dr && zz && dr.x + dr.w <= zz.inspector.x + 1 && dr.y + dr.h <= zz.hero.y + zz.hero.h, 'szuflada grupy obok strefy inspektora, u dołu bohatera', JSON.stringify(dr));

  // ── Finding 789 (tylko „po”): anulowanie budowy spoza okna ──
  if (!arg('--out')) {
    const r789 = await page.evaluate(`(window.csCancelOutside ? csCancelOutside() : null)`);
    check(r789 && r789.constructionStarted && r789.staleTileBeforeCancel && r789.cancelReturned === true && r789.stillBuilding === false && r789.refundFe > 0,
      'Finding 789: budowa anulowana spoza okna kolonii (kafel nieodświeżony) — zdjęta z kolejki, zwrot połowy kosztu', JSON.stringify(r789));
    await G('g.open()'); await sleep(1500);
    // ── Motywy: Załoga, Stacja + picker, rekrutacja, szuflada ──
    for (const th of THEMES) {
      await theme(th); await sleep(400);
      await G(`(g.ov()._selectedUnits = new Set(), g.ov()._selectedUnit = null, g.ov()._cStation = false, true)`);
      await tab('workforce'); await move(5, 5);
      await shot(`t-${th}-crew`, `${th} — Załoga`);
      await clickZone(await G(`g.chip('view:station')`)); await sleep(300);
      await clickZone(await zone('station_mgmt_addslot')); await sleep(300);
      await shot(`t-${th}-station`, `${th} — Stacja + picker`);
      await clickZone(await zone('station_mgmt_picker_close'));
      await clickZone(await G(`g.chip('view:colony')`)); await sleep(200);
      await tab('workforce');
      await clickZone(await zone('draft_open'));
      await shot(`t-${th}-recruit`, `${th} — Rekrutacja`);
      await clickZone(await zone('draft_close'));
      await G('g.group()'); await sleep(300);
      await shot(`t-${th}-drawer`, `${th} — Szuflada grupy`);
    }
    await theme(THEMES[0]);
  }

  // ── Arkusz ──
  if (BEFORE_DIR) {
    const pairs = ['crew', 'crew-tip', 'pop', 'recruit', 'station-build', 'station-manage', 'picker-module', 'picker-ship', 'drawer'];
    const list = [];
    for (const p of pairs) {
      const lab = shots.find(q => q.name === p)?.label ?? p;
      if (fs.existsSync(path.join(BEFORE_DIR, `${p}.png`))) list.push({ src: `/__before/${p}.png`, label: `PRZED (dziś) — ${lab}` });
      else list.push({ src: null, label: `PRZED — brak ujęcia` });
      list.push({ src: `/__shot/${p}.png`, label: `PO (CS-8c) — ${lab}` });
    }
    const themeList = shots.filter(q => q.name.startsWith('t-')).map(q => ({ src: `/__shot/${q.name}.png`, label: q.label }));
    await page.send('Page.navigate', { url: `${base}/__sheet` });
    await page.waitFor(`!!document.getElementById('c')`, 'arkusz');
    const data = await page.evaluate(`(async () => {
      const A = ${JSON.stringify(list)}, B = ${JSON.stringify(themeList)};
      const TW = 720, TH = Math.round(TW * 1041 / 1600), LAB = 24, PAD = 10, HEAD = 40, BT = 470, BH = Math.round(BT * 1041 / 1600);
      const rowsA = Math.ceil(A.length / 2), rowsB = Math.ceil(B.length / 4);
      const W = Math.max(PAD + 2 * (TW + PAD), PAD + 4 * (BT + PAD));
      const c = document.getElementById('c'); c.width = W; c.height = HEAD + rowsA * (TH + LAB + PAD) + HEAD + rowsB * (BH + LAB + PAD) + PAD;
      const x = c.getContext('2d'); x.fillStyle = '#05070b'; x.fillRect(0, 0, c.width, c.height);
      const title = (t, y) => { x.fillStyle = '#cfd8e3'; x.font = 'bold 18px sans-serif'; x.textBaseline = 'middle'; x.fillText(t, PAD, y); };
      const tile = async (it, cx, cy, tw, th) => {
        x.fillStyle = '#9fb4c8'; x.font = '13px sans-serif'; x.fillText(it.label, cx + 2, cy + LAB / 2);
        if (it.src) { const img = new Image(); img.src = it.src; await img.decode(); x.imageSmoothingQuality = 'high'; x.drawImage(img, cx, cy + LAB, tw, th); }
        x.strokeStyle = '#27323f'; x.strokeRect(cx + 0.5, cy + LAB + 0.5, tw - 1, th - 1);
      };
      title('CS-8c — strony konsoli Kolonii w idiomie konsol: PRZED (dzisiejszy wygląd) | PO', HEAD / 2);
      for (let i = 0; i < A.length; i++) await tile(A[i], PAD + (i % 2) * (TW + PAD), HEAD + Math.floor(i / 2) * (TH + LAB + PAD), TW, TH);
      const y0 = HEAD + rowsA * (TH + LAB + PAD);
      title('PO — 5 motywów × (Załoga, Stacja + picker, rekrutacja, szuflada grupy)', y0 + HEAD / 2);
      for (let i = 0; i < B.length; i++) await tile(B[i], PAD + (i % 4) * (BT + PAD), y0 + HEAD + Math.floor(i / 4) * (BH + LAB + PAD), BT, BH);
      return c.toDataURL('image/png');
    })()`);
    const out = path.join(OUT_DIR, 'cs8c-pages.png');
    fs.writeFileSync(out, Buffer.from(String(data).replace(/^data:image\/png;base64,/, ''), 'base64'));
    console.log('[cs8c] zapisano', path.relative(REPO, out).replace(/\\/g, '/'), fs.statSync(out).size, 'B');
  }

  const realExc = exc.filter(e => !/AudioContext is closed/.test(e));
  if (realExc.length) { console.log('WYJĄTKI STRONY:'); for (const e of [...new Set(realExc)].slice(0, 8)) console.log('  ' + e.replace(/\n/g, ' | ')); }
  check(realExc.length === 0, 'brak wyjątków strony', `${realExc.length}`);
  const fail = checks.filter(c => !c.ok).length;
  console.log(`\n[cs8c] kontrole: ${checks.length - fail} PASS / ${fail} FAIL   (ujęcia: ${SHOT_DIR})`);
  exitCode = fail ? 1 : 0;
} catch (e) {
  console.error('[cs8c] BŁĄD:', e?.stack ?? e);
  exitCode = 2;
} finally {
  try { chrome.proc.kill(); } catch { /* nic */ }
  server.close();
  await sleep(300);
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* Chrome trzyma pliki */ }
}
process.exit(exitCode);
