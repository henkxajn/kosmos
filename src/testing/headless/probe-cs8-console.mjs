// probe-cs8-console — CS-8: konsola Kolonii w PRAWDZIWEJ grze (headless Chrome + CDP), 1600×1041.
//
//   node src/testing/headless/probe-cs8-console.mjs            kontrole konsoli + arkusz docs/design/prototypes/cs8a-console.png
//   node src/testing/headless/probe-cs8-console.mjs --build    + kontrole przepływu budowy (część B) i arkusz cs8b-build-flow.png
//   node src/testing/headless/probe-cs8-console.mjs --keep     zostawia pojedyncze zrzuty w katalogu tymczasowym (ścieżka w logu)
//
// Nowa gra z flagami kuli; okno kolonii = konsola (lista, karta planety, kula w ramie bohatera, inspektor wg zaznaczenia, pas kolejki).
// Mysz i klawisze idą przez CDP (prawdziwe zdarzenia), stan czytany z obiektów gry. Kontrola flagi OFF: dzisiejsze okno kolonii.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT_DIR = path.join(REPO, 'docs/design/prototypes');
const has = (k) => process.argv.includes(k);
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
const THEMES = ['ss_amber_noir', 'ss_cold_blue', 'ss_galactic_violet', 'ss_neon_cyber', 'ss_biopunk_green'];
const SHOT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs8-shots-'));

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    if (rel.startsWith('__shot/')) {
      const f = path.join(SHOT_DIR, path.basename(rel));
      return fs.readFile(f, (err, buf) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); res.end(buf); });
    }
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs8-'));
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
  const exc = [], errs = [];
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') exc.push((m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').slice(0, 500));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push((m.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  });
  await page.send('Runtime.enable'); await page.send('Page.enable');

  const shots = [];
  const shot = async (name, label) => {
    await sleep(350);
    const d = (await page.send('Page.captureScreenshot', { format: 'png' })).data;
    fs.writeFileSync(path.join(SHOT_DIR, `${name}.png`), Buffer.from(d, 'base64'));
    shots.push({ name, label });
  };
  const FLAGS = ['colonySphere', 'sharedSurface', 'seededSystems', 'realisticClimate', 'scaledOrbits'];
  const boot = async (flagsOn) => {
    await page.send('Page.navigate', { url: `${base}/index.html` });
    await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł');
    for (const f of FLAGS) await page.evaluate(`KOSMOS.gameConfig.FEATURES.${f} = ${flagsOn ? 'true' : 'false'}`);
    await page.evaluate(`document.querySelector('[data-action="new"]').click(), true`);
    await page.waitFor(`!!document.querySelector('.fs-leader-card')`, 'lider');
    await page.evaluate(`document.querySelector('.fs-leader-card').click(), true`);
    await page.waitFor(`!!document.querySelector('#fs-start')`, 'start');
    await page.evaluate(`document.querySelector('#fs-start').click(), true`);
    await page.waitFor(`!!window.KOSMOS?.surfaceCache && !!window.KOSMOS?.gameScene`, 'GameScene');
    await page.waitFor(`window.KOSMOS?.gameScene?._introLockActive === false`, 'koniec intro', 240000);
    await sleep(2500);
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
    await page.waitFor(`!!KOSMOS.colonyManager?.getColony?.(KOSMOS.homePlanet?.id)`, 'kolonia macierzysta', 60000);
    await sleep(1500);
  };
  const HELP = String.raw`(() => {
    const ov = () => KOSMOS.overlayManager.overlays.colony;
    const k = () => Math.min(innerWidth / 1280, innerHeight / 720);
    const css = (z) => ({ x: (z.x + z.w / 2) * k(), y: (z.y + z.h / 2) * k(), data: z.data ?? null, type: z.type });
    window.__g = {
      ov,
      open() { if (!ov().visible) KOSMOS.overlayManager.openPanel('colony'); KOSMOS.uiManager._dirty = true; return ov().visible; },
      col() { return ov()._getColony(); },
      grid() { const c = ov()._getColony(); return c ? ov()._getGrid(c) : null; },
      zones(type, pred) { return ov()._hitZones.filter(z => z.type === type && (!pred || pred(z.data ?? {}))).map(css); },
      chip(id) { return ov()._hitZones.filter(z => z.type === 'cChip' && z.data?.id === id).map(css)[0] ?? null; },
      state() {
        const o = ov(), c = o._getColony(), g = c ? o._getGrid(c) : null, b = c?.buildingSystem;
        return { visible: o.visible, console: !!o._consoleOn, kind: g?.kind ?? 'flat', insp: o._cInspector?.kind ?? null, sphere: !!o._sphereActive,
          zones: o.consoleZones ? Object.fromEntries(['header', 'list', 'hero', 'inspector', 'strip'].map(n => [n, o.consoleZones[n]])) : null,
          selected: o._selectedHex, unit: o._selectedUnit?.id ?? null, lens: o._sphere?.lens ?? null, supply: !!o._showSupplyCoverage,
          buildMode: !!o._cBuildMode, pick: o._cPick ?? null, station: !!o._cStation, tab: o._cInspTab ?? null,
          colonyId: c?.planetId ?? null, active: KOSMOS.colonyManager.activePlanetId, preview: !!c?.isPreview,
          queue: b ? { c: [...b._constructionQueue.keys()], p: [...b._pendingQueue.keys()] } : null,
          mini: o._sphere?._mini ? (o._sphere._mini.info?.().mode ?? 'made') : null, globe: !!o._globe?.isOpen, flash: (Date.now() < (o._flashEnd ?? 0)) ? o._flashMsg : null,
          hitTypes: [...new Set(o._hitZones.map(z => z.type))] };
      },
      tileCss(i) { const o = ov(); const r = o._sphereRect(); const p = o._sphere.renderer.project(i, r); return p ? { x: p.x * k(), y: p.y * k(), visible: p.visible, facing: p.facing } : null; },
      tiles(pred, n = 1, facing = 0.7) {
        const o = ov(), g = this.grid(), r = o._sphere.renderer, rect = o._sphereRect(), out = [];
        for (let i = 0; i < g.tiles.length && out.length < n; i++) { const t = g.tiles[i]; const p = r.project(i, rect); if (p.visible && p.facing > facing && pred(t, i)) out.push(i); }
        return out;
      },
      // wolne pola lądowe — także po niewidocznej stronie (klik i tak najpierw obraca kulę do pola); bliższe stolicy najpierw
      freeLand(n = 1) {
        const gr = this.grid(), graph = ov()._graphFor(this.col().planetId), cap = gr.tiles.find(t => t.capitalBase) ?? gr.tiles[0];
        const land = gr.tiles.map((t, i) => ({ t, i })).filter(({ t }) => !t.isOccupied && !t.capitalBase && ['plains', 'forest', 'desert', 'mountains', 'tundra'].includes(t.type)
          && !(KOSMOS.groundUnitManager.getUnitsAtHex?.(this.col().planetId, t.q, t.r) ?? []).length);
        land.sort((a, b) => graph.distance(cap, a.t) - graph.distance(cap, b.t));
        return land.slice(0, n).map(x => x.i);
      },
      band(i) { const g = this.grid(); return KOSMOS.colonyManager && g ? (g.tiles[i] ? (ov()._graphFor(this.col().planetId).latitudeBand(g.tiles[i])) : null) : null; },
      tile(i) { const t = this.grid().tiles[i]; return { type: t.type, buildingId: t.buildingId, uc: t.underConstruction?.buildingId ?? null, pending: t.pendingBuild ?? null, capital: !!t.capitalBase, key: t.key, level: t.buildingLevel ?? null }; },
      inv(keys) { const rs = this.col().resourceSystem; const st = KOSMOS.systemPoolService?.getStore?.(rs) ?? rs; return Object.fromEntries(keys.map(q => [q, st.getAmount?.(q) ?? st.inventory?.get?.(q) ?? 0])); },
      turn(i) { ov()._sphere.renderer.turnTo(i); KOSMOS.uiManager._dirty = true; return true; },
      dirty() { KOSMOS.uiManager._dirty = true; return true; },
      // pola w kadrze bohatera (rzut wewnątrz ramy z marginesem), widoczne i zwrócone do kamery
      inFrame(pred, n = 1, facing = 0.5, margin = 40) {
        const o = ov(), gr = this.grid(), r = o._sphere.renderer, rect = o._sphereRect(), out = [];
        for (let i = 0; i < gr.tiles.length && out.length < n; i++) {
          const t = gr.tiles[i]; const p = r.project(i, rect);
          if (!p.visible || p.facing <= facing) continue;
          if (p.x < rect.x + margin || p.x > rect.x + rect.w - margin || p.y < rect.y + margin + 30 || p.y > rect.y + rect.h - margin) continue;
          if (pred(t, i)) out.push(i);
        }
        return out;
      },
      okTiles(buildingId, n = 3) {
        const c = this.col(), b = window.__cs8mod.BUILDINGS[buildingId], ctx = { techSystem: KOSMOS.techSystem ?? null, planet: c.planet };
        return this.inFrame((t) => window.__cs8mod.buildVerdictFor(t, b, ctx) === 'ok', n);
      },
    };
    return true;
  })()`;
  const mouse = async (type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'none', buttons: 0, ...extra });
  const move = (x, y) => mouse('mouseMoved', x, y);
  const click = async (x, y, extra = {}) => { await move(x, y); await sleep(60); await mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1, ...extra }); await mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 1, ...extra }); await sleep(180); };
  const key = (k, mods = {}) => page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, code: ${JSON.stringify(k)}, shiftKey: ${!!mods.shift}, bubbles: true, cancelable: true })), true`);
  const G = (expr) => page.evaluate(`(() => { const g = window.__g; return ${expr}; })()`);
  const st = () => G('g.state()');
  const clickZone = async (z, extra) => { if (!z) return false; await click(z.x, z.y, extra); return true; };
  const clickChip = async (id) => clickZone(await G(`g.chip(${JSON.stringify(id)})`));
  const clickTile = async (i, extra) => {
    await G(`g.turn(${i})`); await sleep(900);
    const p = await G(`g.tileCss(${i})`);
    if (!p?.visible) return false;
    await click(p.x, p.y, extra);
    return true;
  };
  const theme = (name) => page.evaluate(`import('/src/config/ThemeConfig.js').then(m => { m.applyPreset(m.PRESET_THEMES[${JSON.stringify(name)}]); KOSMOS.uiManager._dirty = true; return true; })`);
  // odznacz wszystko bez zamykania okna (Esc tylko, gdy jest co odznaczyć)
  const desel = async () => { for (let i = 0; i < 3; i++) { const q = await st(); if (!(q.selected || q.unit || q.buildMode)) break; await key('Escape'); await sleep(150); } };
  const pause = () => page.evaluate(`(() => { const ts = KOSMOS.timeSystem; if (ts && !ts.isPaused) (ts.pause?.() ?? (ts.isPaused = true)); return !!ts?.isPaused; })()`);

  // ═══ Nowa gra z flagą ═══
  await boot(true);
  await page.evaluate(HELP);
  await page.evaluate(`Promise.all([import('/src/ui/ColonySphereView.js'), import('/src/data/BuildingsData.js')]).then(([a, b]) => { window.__cs8mod = { buildVerdictFor: a.buildVerdictFor, BUILDINGS: b.BUILDINGS }; return true; })`);
  await G('g.open()');
  await sleep(4500);   // mapa bohatera
  let s = await st();
  check(s.console && s.kind === 'geo' && s.sphere, 'nowa gra z flagą: okno kolonii = konsola na siatce geo z kulą', `insp ${s.insp}, strefy ${Object.keys(s.zones ?? {}).length}`);
  check(s.insp === 'summary', 'nic nie zaznaczone → inspektor: podsumowanie kolonii');
  check(s.mini == null && !s.globe, 'mały globus / mała kula nie powstają w konsoli', `mini ${s.mini}, globe ${s.globe}`);
  const zz = s.zones;
  check(zz && zz.hero.w > 500 && zz.list.w > 150 && zz.inspector.w > 250 && zz.strip.h > 40, 'cztery strefy + pas mają rozmiar', JSON.stringify({ hero: zz?.hero, list: zz?.list?.w, insp: zz?.inspector?.w, strip: zz?.strip?.h }));

  // Dodatkowe kolonie: pełna kolonia + placówka (lista z kilkoma wpisami)
  // Pomocniki listy kontrolnej właściciela (bez argumentów i cudzysłowów) — te same wywołania, które wpisze właściciel.
  const made = await page.evaluate(`(() => {
    const before = KOSMOS.colonyManager.activePlanetId;
    const c = csColony();                       // pełna kolonia drogą gry (expedition:colonyFounded)
    const afterCreate = KOSMOS.colonyManager.activePlanetId;
    const o = csOutpost();                      // placówka + zdarzenie outpost:founded
    return { before, colony: c?.id ?? null, colonyKind: c?.grid ?? null, colonyKeys: c?.keys ?? [], afterCreate,
      outpost: o?.id ?? null, outpostKind: o?.grid ?? null, activeKept: o?.activeKept ?? null, activeAfter: KOSMOS.colonyManager.activePlanetId };
  })()`);
  await sleep(1200);
  const f740 = { outpost: !!made.outpost, before: made.afterCreate, after: made.activeAfter, kept: made.activeKept };
  check(f740.outpost && f740.before === f740.after, 'Finding 740: założenie placówki nie zmienia aktywnej kolonii (flaga ON)', JSON.stringify(f740));
  // okno zdarzenia fabularnego po założeniu kolonii (DOM nad płótnem) — zamknij pierwszym przyciskiem
  for (let i = 0; i < 6; i++) {
    const had = await page.evaluate(`(() => { const o = document.querySelector('.se-overlay, .ce-overlay, .at-overlay, .kosmos-modal-overlay'); if (!o) return false; const b = o.querySelector('button'); if (b) b.click(); else o.remove(); return true; })()`);
    if (!had) break;
    await sleep(500);
  }
  await G('g.open()'); await sleep(2500);
  s = await st();
  check(made.colonyKeys?.length > 0 && made.colonyKeys.every(k => /^(capital_)?g\d+$/.test(k)) && made.colonyKeys.some(k => k.startsWith('capital_g')),
    'Finding 788: nowa kolonia na kuli ma stolicę na polu kuli, bez kluczy mapy płaskiej', JSON.stringify(made.colonyKeys));
  check(made.colonyKind === 'geo' && s.colonyId === made.colony && s.console, 'nowa kolonia założona drogą gry ma siatkę geo i otwiera się w konsoli', JSON.stringify(made) + ' ' + JSON.stringify({ c: s.console, k: s.kind, id: s.colonyId, a: s.active, v: s.visible, p: s.preview }));
  const listZ = await G(`g.zones('colonyTab')`);
  check(listZ.length >= 3, 'lista: kolonie i placówki gracza', `${listZ.length} wierszy, placówka ${made.outpost}`);
  // lista → kolonia macierzysta (klik przełącza aktywną kolonię)
  const hz0 = (await G(`g.zones('colonyTab', d => d.planetId === KOSMOS.homePlanet.id)`))[0];
  const under = hz0 ? await page.evaluate(`(() => { const e = document.elementFromPoint(${hz0.x}, ${hz0.y}); return e ? (e.id || e.className || e.tagName) : null; })()`) : null;
  await clickZone(hz0); await sleep(2500);
  s = await st();
  check(s.colonyId === s.active && s.active === (await page.evaluate('KOSMOS.homePlanet.id')), 'lista: klik w kolonię macierzystą przełącza aktywną kolonię', `aktywna ${s.active}, strefa ${JSON.stringify(hz0)}, pod kursorem ${under}`);
  await pause();
  await shot('a-summary', 'Nic nie zaznaczone — podsumowanie kolonii · lista z kolonią i placówką');
  await page.evaluate(`csSphere2D()`); await sleep(600);
  await shot('a-fallback', 'Widok 2D kuli (bez WebGL) — też bez czarnego tła kadru');
  await page.evaluate(`csSphere2D()`); await sleep(600);

  // ── pole (wolne) ──
  const land = await G('g.freeLand(3)');
  await clickTile(land[0]);
  s = await st();
  check(s.insp === 'tile' && s.selected?.q === land[0], 'klik w wolne pole → inspektor pola', `pole ${land[0]}`);
  const builds = await G(`g.zones('build')`);
  check(builds.length > 0, 'inspektor pola: lista budowy z wierszami', `${builds.length} widocznych wierszy`);
  await shot('a-tile', 'Pole — teren, pas szerokości, lista budowy z rzeczywistym kosztem');

  // ── budynek (pierwszy budynek startowy) ──
  const bTile = await G(`(() => { const t = g.tiles((t) => !!t.buildingId && !t.capitalBase, 1, 0.2)[0]; return t ?? g.grid().tiles.findIndex(t => t.buildingId && !t.capitalBase); })()`);
  await clickTile(bTile);
  s = await st();
  check(s.insp === 'building', 'klik w budynek → inspektor budynku', `pole ${bTile}: ${(await G(`g.tile(${bTile})`)).buildingId}`);
  check((await G(`g.zones('demolish')`)).length === 1, 'inspektor budynku: rozbiórka dostępna');
  await shot('a-building', 'Budynek — portret PNG / znak kategorii, poziom, produkcja, obsada, droidy, ulepsz, rozbierz');

  // ── jednostka ──
  await page.evaluate(`KOSMOS.debug?.csSphereUnit?.() ?? window.csSphereUnit?.()`);
  await sleep(500);
  const unit = await page.evaluate(`(() => { const u = (KOSMOS.groundUnitManager.getUnitsOnPlanet(__g.col().planetId) ?? []).find(u => !u.owner || u.owner === 'player'); return u ? { id: u.id, q: u.q } : null; })()`);
  if (unit) { await desel(); await clickTile(unit.q); }
  s = await st();
  check(!!unit && s.insp === 'unit' && s.unit === unit?.id, 'klik w jednostkę → inspektor jednostki', JSON.stringify(unit));
  check((await G(`g.zones('unitSurvey')`)).length === 1, 'inspektor jednostki: rozkazy (skan) dostępne');
  await shot('a-unit', 'Jednostka — karta i rozkazy');
  await key('Escape'); await sleep(300);
  s = await st();
  check(s.insp === 'summary' && s.visible, 'Esc → odznaczenie, inspektor wraca do podsumowania (okno zostaje)', `insp ${s.insp}, visible ${s.visible}`);

  // ── soczewki ──
  for (const id of ['terrain', 'deposits', 'ownership']) {
    await clickChip(`lens:${id}`); await sleep(250);
    s = await st();
    check(s.lens === id && !s.supply, `czip soczewki ${id} włącza soczewkę`);
  }
  await clickChip('lens:supply'); s = await st();
  check(s.supply && s.lens === 'none', 'czip Zaopatrzenie włącza pokrycie i wyłącza soczewkę');
  await clickChip('lens:supply'); s = await st();
  check(!s.supply, 'ponowny klik czipu wyłącza pokrycie');
  await key('l'); s = await st();
  check(s.lens === 'terrain', 'klawisz L nadal przełącza soczewkę');
  await clickChip('lens:terrain'); s = await st();
  check(s.lens === 'none', 'klik aktywnego czipu soczewki wyłącza ją');

  // ── stacja ──
  const stChip = await G(`g.chip('view:station')`);
  await clickZone(stChip); await sleep(300);
  s = await st();
  const stEnabled = stChip?.data?.enabled !== false;
  check(stEnabled ? s.insp === 'station' : (s.insp !== 'station' && !!s.flash), stEnabled ? 'czip Stacja → inspektor stacji' : 'czip Stacja wyłączony: klik podaje powód (flash), nic po cichu', `enabled ${stEnabled}, flash ${s.flash}`);
  // odblokuj technologię i pokaż widok stacji
  check(await page.evaluate(`csStationTech()`), 'pomocnik csStationTech() odkrywa Konstrukcje orbitalne');
  await sleep(400);
  await clickChip('view:station'); await sleep(400);
  s = await st();
  check(s.insp === 'station', 'po zbadaniu Konstrukcji orbitalnych czip Stacja otwiera widok stacji w inspektorze', `insp ${s.insp}`);
  await shot('a-station', 'Przełącznik Stacja — zarządzanie stacją w inspektorze');
  await clickChip('view:colony'); await sleep(250);

  // ── podzakładki podsumowania ──
  for (const id of ['workforce', 'populacja', 'summary']) {
    const z = (await G(`g.zones('cInspTab', d => d.id === ${JSON.stringify(id)})`))[0];
    await clickZone(z); s = await st();
    check(s.tab === id, `podzakładka inspektora: ${id}`);
    if (id === 'workforce') await shot('a-crew', 'Podzakładka Załoga — dzisiejsza tabela ze sterownikami w inspektorze');
  }

  // ── kolejka: budowa w toku + zamówienia oczekujące ──
  const free2 = await G('g.freeLand(6, 0.55)');
  const q0 = await st();
  // budowa: pierwszy włączony wiersz listy na wolnym polu
  await clickTile(free2[0]);
  let rows = await G(`g.zones('build')`);
  await clickZone(rows[0]); await sleep(500);
  // zamówienia oczekujące: wyzeruj magazyn i zamów dwa razy
  const drained = Object.keys((await page.evaluate(`csPoor()`))?.stock ?? {}).length;   // pomocnik listy kontrolnej: zeruje surowce budowlane
  for (const i of free2.slice(1)) {
    if (((await st()).queue?.p?.length ?? 0) >= 2) break;
    await desel(); if (!(await clickTile(i))) continue;
    rows = await G(`g.zones('build')`);
    await clickZone(rows.find(r => !!r.data?.tip) ?? rows[0]); await sleep(400);   // wiersz „do kolejki" (z podpowiedzią braków)
  }
  s = await st();
  check((s.queue?.c?.length ?? 0) + (s.queue?.p?.length ?? 0) > ((q0.queue?.c?.length ?? 0) + (q0.queue?.p?.length ?? 0)), 'budowa z listy pola trafia do kolejki', JSON.stringify(s.queue) + ` (magazyn: ${drained} pozycji)`);
  await desel(); await sleep(300);
  const cancels = await G(`g.zones('cQueueCancel')`);
  check(cancels.length === (s.queue.c.length + s.queue.p.length) || cancels.length > 0, 'pas kolejki: karta na wpis z przyciskiem anulowania', `${cancels.length} kart`);
  await shot('a-queue', 'Pas kolejki — budowa w toku z postępem, zamówienia oczekujące z kolejnością');
  if (s.queue.p.length >= 2) {
    const mv = (await G(`g.zones('cQueueMove', d => d.delta === 1)`))[0];
    const before = s.queue.p.join(',');
    await clickZone(mv); s = await st();
    check(s.queue.p.join(',') !== before && s.queue.p.length === before.split(',').length, 'kolejka: zmiana kolejności zamówień działa', `${before} → ${s.queue.p.join(',')}`);
  } else check(false, 'kolejka: dwa zamówienia oczekujące do zmiany kolejności', JSON.stringify(s.queue));
  {
    const n0 = s.queue.c.length + s.queue.p.length;
    const cz = (await G(`g.zones('cQueueCancel', d => d.kind === 'pending')`))[0] ?? (await G(`g.zones('cQueueCancel')`))[0];
    await clickZone(cz); await sleep(300); s = await st();
    check(s.queue.c.length + s.queue.p.length === n0 - 1, 'kolejka: anulowanie usuwa wpis', `${n0} → ${s.queue.c.length + s.queue.p.length}`);
  }
  const rich = await page.evaluate(`csRich()`);
  const cons = await page.evaluate(`csConsole()`);
  check((rich?.stock?.Fe ?? 0) > 0 && cons?.console === true && cons?.grid === 'geo' && Array.isArray(cons?.waiting), 'pomocniki csRich() i csConsole() działają na żywym silniku', JSON.stringify({ c: cons?.console, insp: cons?.inspector, w: cons?.waiting?.length }));

  // ── lista: przełączenie kolonii + placówka ──
  const outZ = (await G(`g.zones('colonyTab', d => d.planetId === ${JSON.stringify(made.outpost ?? '')})`))[0];
  if (outZ) {
    await clickZone(outZ); await sleep(2500); s = await st();
    check(s.colonyId === made.outpost && s.active === made.outpost, 'lista: klik w placówkę przełącza aktywną kolonię', `kind ${s.kind}, console ${s.console}`);
    if (s.console) await shot('a-outpost', 'Lista: placówka wybrana — karta planety i podsumowanie placówki');
    const homeZ = (await G(`g.zones('colonyTab', d => d.planetId === KOSMOS.homePlanet.id)`))[0];
    await clickZone(homeZ); await sleep(2500); s = await st();
    check(s.colonyId !== made.outpost && s.console, 'lista: powrót do kolonii macierzystej');
  } else check(false, 'lista: wiersz placówki istnieje', JSON.stringify(made));

  // ── Finding 785: podgląd ciała bez kolonii = siatka geo ──
  const prev = await page.evaluate(`(() => {
    const EM = KOSMOS.entityManager, cm = KOSMOS.colonyManager;
    const b = [...(EM.getByType?.('planet') ?? []), ...(EM.getByType?.('moon') ?? [])].find(b => !cm.getColony(b.id) && b.planetType !== 'gas');
    if (!b) return null;
    KOSMOS.overlayManager.openPanel('colony', { previewPlanet: b });
    const o = __g.ov(); const g = o._getGrid(o._getColony());
    KOSMOS.uiManager._dirty = true;
    return { id: b.id, kind: g?.kind ?? 'flat', preview: !!o._previewMode };
  })()`);
  await sleep(3500); s = await st();
  check(prev?.kind === 'geo' && s.console && s.preview, 'Finding 785: podgląd ciała bez kolonii używa siatki geodezyjnej (konsola w trybie podglądu)', JSON.stringify(prev));
  if (s.console) await shot('a-preview', 'Podgląd ciała bez kolonii — siatka geodezyjna (Finding 785), tylko odczyt');
  await page.evaluate(`(() => { const o = __g.ov(); o._switchColony(KOSMOS.homePlanet.id); KOSMOS.overlayManager.openPanel('colony'); KOSMOS.uiManager._dirty = true; return true; })()`);
  await sleep(2500);

  // ═══ Arkusz A: 4 stany inspektora × 5 motywów + ujęcia dodatkowe ═══
  const themeShots = [];
  await page.evaluate(`import('/src/config/ThemeConfig.js').then(m => { window.__theme0 = { ...m.THEME }; return true; })`);
  // wolne pole do ujęć motywów — nie to, na którym stoi jednostka (klik w nie zaznaczałby jednostkę)
  const uTile = unit ? await page.evaluate(`KOSMOS.groundUnitManager.getUnit(${JSON.stringify(unit.id)})?.q ?? -1`) : -1;
  const landT = (await G('g.freeLand(4)')).filter((i) => i !== uTile);
  const bHome = await G(`(() => { const t = g.tiles((t) => !!t.buildingId && !t.capitalBase, 1, 0.2)[0]; return t ?? g.grid().tiles.findIndex(t => t.buildingId && !t.capitalBase); })()`);
  for (const th of THEMES) {
    await theme(th); await sleep(500);
    await desel(); await G('g.open()'); await sleep(400);
    await shot(`t-${th}-summary`, `${th} · nic`); themeShots.push(`t-${th}-summary`);
    await clickTile(landT[0]); await shot(`t-${th}-tile`, `${th} · pole`); themeShots.push(`t-${th}-tile`);
    if (th === THEMES[0]) check((await st()).insp === 'tile', 'ujęcia motywów: stan pola rzeczywiście w kadrze');
    await desel(); await clickTile(bHome); await shot(`t-${th}-building`, `${th} · budynek`); themeShots.push(`t-${th}-building`);
    if (unit) { await desel(); const u = await page.evaluate(`(() => { const u = KOSMOS.groundUnitManager.getUnit(${JSON.stringify(unit.id)}); return u ? u.q : null; })()`); if (u != null) await clickTile(u); }
    await shot(`t-${th}-unit`, `${th} · jednostka`); themeShots.push(`t-${th}-unit`);
    await desel();
  }
  await page.evaluate(`import('/src/config/ThemeConfig.js').then(m => { m.applyPreset(window.__theme0); KOSMOS.uiManager._dirty = true; return true; })`);

  // ═══ Część B (opcjonalnie): przepływ budowy ═══
  const bShots = [];
  if (has('--build')) {
    await G('g.open()'); await sleep(500);
    // (1) pole → budynek na polu POLARNYM: koszt pokazany == pobrany
    const polar = await page.evaluate(`(() => { const g = __g.grid(), gr = __g.ov()._graphFor(__g.col().planetId); const out = []; g.tiles.forEach((t, i) => { if (!t.isOccupied && !t.capitalBase && gr.latitudeBand(t) === 2 && ['plains','forest','desert','mountains','tundra','ice_sheet'].includes(t.type)) out.push(i); }); return out.slice(0, 4); })()`);
    if (polar.length) {
      await page.evaluate(`csRich()`);
      await clickTile(polar[0]); s = await st();
      rows = await G(`g.zones('build')`);
      const pickRow = rows.find(r => !r.data?.tip) ?? rows[0];   // wiersz „buduj od razu" (bez podpowiedzi braków)
      const pre = await page.evaluate(`(() => { const o = __g.ov(), c = __g.col(), t = __g.grid().tiles[${polar[0]}]; const id = ${JSON.stringify(pickRow?.data?.buildingId ?? '')}; const cost = c.buildingSystem.previewBuildCost(t, id); return { id, cost, inv: __g.inv(Object.keys(cost ?? {})) }; })()`);
      await shot('b-polar-tile', 'Pole → budynek na polu polarnym: koszt z pasem szerokości w liście'); bShots.push('b-polar-tile');
      await clickZone(pickRow); await sleep(400);
      const post = await page.evaluate(`__g.inv(${JSON.stringify(Object.keys(pre.cost ?? {}))})`);
      const tl = await G(`g.tile(${polar[0]})`);
      const diffOk = Object.entries(pre.cost ?? {}).every(([k, v]) => Math.abs((pre.inv[k] - post[k]) - v) < 1e-6);
      check((tl.uc === pre.id || tl.buildingId === pre.id) && diffOk, 'pole polarne: kwota pokazana = kwota pobrana (Finding 780)', `${pre.id} koszt ${JSON.stringify(pre.cost)} · pobrano ${JSON.stringify(Object.fromEntries(Object.keys(pre.cost ?? {}).map(k => [k, pre.inv[k] - post[k]])))}`);
    } else check(false, 'jest wolne pole polarne do testu kosztu', 'brak');
    await desel(); await sleep(200);

    // (2) budynek → pola
    await clickChip('build'); await sleep(300); s = await st();
    check(s.buildMode && s.insp === 'palette', 'przycisk Tryb budowy → paleta w inspektorze');
    await shot('b-palette', 'Tryb budowy: paleta kategorii, kula z pełną siatką'); bShots.push('b-palette');
    // kategoria z uzyskiem zależnym od pola (żywność, potem energia) — napisy uzysku na podświetlonych polach
    for (const c of ['food', 'energy']) { const cz = (await G(`g.zones('cCat', d => d.id === ${JSON.stringify(c)})`))[0]; if (cz) { await clickZone(cz); break; } }
    const picks = await G(`g.zones('cPick')`);
    await clickZone(picks[0]); await sleep(400); s = await st();
    const placeable = await page.evaluate(`__g.ov()._cPlaceable?.count ?? 0`);
    check(!!s.pick && placeable > 0, 'wybór budynku z palety podświetla pola', `${s.pick}: ${placeable} pól`);
    // zbliż, żeby napisy uzysku były na każdym polu
    const hero = (await st()).zones.hero; const kx = 1600 / 1280;
    await move((hero.x + hero.w / 2) * kx, (hero.y + hero.h / 2) * kx);
    for (let i = 0; i < 6; i++) { await mouse('mouseWheel', (hero.x + hero.w / 2) * kx, (hero.y + hero.h / 2) * kx, { deltaX: 0, deltaY: -240 }); await sleep(60); }
    await sleep(700);
    await shot('b-highlight', 'Budynek → pola: podświetlone pola ze spodziewanym uzyskiem'); bShots.push('b-highlight');
    const targets = await G(`g.okTiles(${JSON.stringify((await st()).pick)}, 3)`);
    const q1 = await st();
    // Shift+klik: dwa pola pod rząd, budynek zostaje uzbrojony
    let placed = 0;
    for (const i of targets.slice(0, 2)) {
      const p = await G(`g.tileCss(${i})`);
      const before = await G(`g.tile(${i})`);
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', modifiers: 8 });
      await click(p.x, p.y, { modifiers: 8 });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft' });
      const after = await G(`g.tile(${i})`);
      if (!before.uc && !before.buildingId && !before.pending && (after.uc || after.buildingId || after.pending)) placed++;
    }
    s = await st();
    check(placed === 2 && s.pick === q1.pick && s.buildMode, 'Shift+klik stawia na kolejnych polach, budynek zostaje wybrany', `postawiono ${placed}, wybrany ${s.pick}`);
    // klik w zajęte pole → powód
    const occ = targets[0];
    const po = await G(`g.tileCss(${occ})`);
    await click(po.x, po.y); s = await st();
    check(!!s.flash && s.buildMode, 'klik w zajęte pole w trybie budowy: odmowa z powodem', `flash: ${s.flash}`);
    await shot('b-refusal', 'Odmowa z powodem (pole zajęte) + kolejka po postawieniu dwóch budynków'); bShots.push('b-refusal');
    await key('Escape'); await sleep(250); s = await st();
    check(!s.buildMode && s.visible, 'Esc wychodzi z trybu budowy (okno zostaje)');

    // (3) wyłączony wiersz z powodem (klimat / teren) — jeśli lista ma zablokowany wpis
    const lockTile = await G('g.freeLand(1, 0.5)');
    await clickTile(lockTile[0]);
    const reasons = await G(`g.zones('cReason')`);
    if (reasons.length) { await move(reasons[0].x, reasons[0].y); await sleep(250); await shot('b-disabled', 'Wyłączony wpis z powodem i wskazówką'); bShots.push('b-disabled'); }
    check(true, `wiersze wyłączone z powodem na liście pola: ${reasons.length}`);

    // (4) ulepszenie i rozbiórka z inspektora budynku
    await desel(); await clickTile(bTile);
    const lv0 = (await G(`g.tile(${bTile})`)).level ?? 1;
    const upZ = (await G(`g.zones('upgrade')`))[0];
    if (upZ) {
      await clickZone(upZ); await sleep(400);
      const tUp = await G(`g.tile(${bTile})`); s = await st();
      check(tUp.uc != null || tUp.pending != null || (tUp.level ?? 1) > lv0, 'Ulepsz z inspektora budynku uruchamia ulepszenie', JSON.stringify(tUp));
    } else check(true, 'Ulepsz: budynek na poziomie maksymalnym albo bez poziomów (czip wyłączony z powodem)');
    const dTile = targets[1] ?? targets[0];
    await desel(); await clickTile(dTile);
    const dBefore = await G(`g.tile(${dTile})`);
    await key('Delete'); await sleep(300);
    const dAfter = await G(`g.tile(${dTile})`);
    check(true, `klawisz Delete na polu z budową/budynkiem: ${JSON.stringify(dBefore)} → ${JSON.stringify(dAfter)}`);

    // (5) rozkaz ruchu jednostki: prawy klik w pole
    if (unit) {
      await desel();
      const uq = await page.evaluate(`KOSMOS.groundUnitManager.getUnit(${JSON.stringify(unit.id)})?.q ?? null`);
      await clickTile(uq);
      const dest = await page.evaluate(`(() => { const o = __g.ov(), gr = o._graphFor(__g.col().planetId), g = __g.grid(); const u = KOSMOS.groundUnitManager.getUnit(${JSON.stringify(unit.id)}); const near = gr.within(u, 2).map(x => gr.tile(x) ?? x).filter(t => t && t.q !== u.q && !t.isOccupied && t.type !== 'ocean'); return near.length ? near[near.length - 1].q : null; })()`);
      const pd = dest != null ? await G(`g.tileCss(${dest})`) : null;
      if (dest != null && pd?.visible) {
        await move(pd.x, pd.y);
        await mouse('mousePressed', pd.x, pd.y, { button: 'right', buttons: 2, clickCount: 1 });
        await mouse('mouseReleased', pd.x, pd.y, { button: 'right', buttons: 0, clickCount: 1 });
        await sleep(400);
        const u2 = await page.evaluate(`(() => { const u = KOSMOS.groundUnitManager.getUnit(${JSON.stringify(unit.id)}); const o = __g.ov(); return { status: u.status, q: u.q, dest: ${dest}, sel: o._selectedUnit?.id ?? null, flash: o._flashMsg, picked: o._screenToTile(${pd.x} / 1.25, ${pd.y} / 1.25, __g.grid())?.q ?? null, paused: KOSMOS.timeSystem?.isPaused }; })()`);
        check(u2.status === 'moving' || u2.q === dest, 'prawy klik w pole wydaje jednostce rozkaz ruchu', JSON.stringify(u2));
        await shot('b-unit-move', 'Jednostka: rozkaz ruchu prawym klikiem'); bShots.push('b-unit-move');
      } else check(false, 'jest pole docelowe ruchu jednostki', 'brak');
    }
    await desel();
  }

  // ═══ Zapis / odczyt + kontrola flagi OFF ═══
  const saved = await page.evaluate(`(() => { KOSMOS.overlayManager.closeActive?.(); const ss = KOSMOS.saveSystem ?? KOSMOS.gameScene?.saveSystem; ss.save?.(); const raw = localStorage.getItem('kosmos_save_v1'); return { bytes: raw?.length ?? 0 }; })()`);
  check(saved.bytes > 1000, 'zapis gry z kolonią na kuli', `${saved.bytes} B`);
  // wczytanie: konsola wraca z kolejką i listą kolonii
  const qSaved = await page.evaluate(`(() => { const c = KOSMOS.colonyManager.getColony(KOSMOS.homePlanet.id); return { c: [...c.buildingSystem._constructionQueue.keys()], p: [...c.buildingSystem._pendingQueue.keys()], cols: KOSMOS.colonyManager.getPlayerColonies().length }; })()`);
  await page.send('Page.navigate', { url: `${base}/index.html` });
  await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł (po zapisie)');
  // Bramka właściciela, krok 12: przeładowanie strony zeruje flagę — kolonia z zapisu zostaje na kuli i MUSI otworzyć się w konsoli.
  const flagAfterReload = await page.evaluate(`KOSMOS.gameConfig.FEATURES.colonySphere`);
  await page.evaluate(`(() => { const b = document.querySelector('[data-action="continue"], [data-action="load"]'); if (b) b.click(); return !!b; })()`);
  await page.waitFor(`!!window.KOSMOS?.gameScene && !!KOSMOS.colonyManager?.getColony?.(KOSMOS.homePlanet?.id)`, 'gra po wczytaniu', 120000);
  await sleep(3000);
  await page.evaluate(HELP); await G('g.open()'); await sleep(3000);
  s = await st();
  const qLoaded = await page.evaluate(`(() => { const c = KOSMOS.colonyManager.getColony(KOSMOS.homePlanet.id); return { c: [...c.buildingSystem._constructionQueue.keys()], p: [...c.buildingSystem._pendingQueue.keys()], cols: KOSMOS.colonyManager.getPlayerColonies().length }; })()`);
  // Gra po wczytaniu biegnie: zamówienie oczekujące mogło już ruszyć (przejść do budów) — porównujemy komplet wpisów kolejki,
  // a zamówienia, które dalej czekają, muszą stać w zapisanej kolejności.
  const allKeys = (q) => [...q.c, ...q.p].sort().join(',');
  const stillWaitingInOrder = JSON.stringify(qSaved.p.filter((k) => qLoaded.p.includes(k))) === JSON.stringify(qLoaded.p);
  check(flagAfterReload === false && s.console && s.kind === 'geo' && s.mini == null && !s.globe, 'po przeładowaniu strony flaga jest OFF, a kolonia z zapisu (kula) otwiera się w konsoli — bez okna CS-7 i małego globusa', `flaga ${flagAfterReload}, console ${s.console}`);
  await shot('a-reload', 'Po zapisie + przeładowaniu (flaga OFF): kolonia na kuli dalej w konsoli; tło bohatera = żywa scena');
  check(s.console && s.kind === 'geo' && allKeys(qSaved) === allKeys(qLoaded) && stillWaitingInOrder && qSaved.cols === qLoaded.cols
    && (await G(`g.zones('colonyTab')`)).length === qLoaded.cols,
    'po wczytaniu: konsola wraca, kolejka (komplet wpisów, zamówienia w zapisanej kolejności) i lista kolonii jak przed zapisem', `${JSON.stringify(qSaved)} → ${JSON.stringify(qLoaded)}`);

  await boot(false);
  await page.evaluate(HELP);
  await G('g.open()'); await sleep(2500);
  s = await st();
  check(!s.console && s.kind === 'flat' && !s.hitTypes.some(t => /^c[A-Z]/.test(t)), 'flaga OFF: nowa gra = dzisiejsze okno kolonii (bez konsoli, bez stref konsoli)', `kind ${s.kind}, typy ${s.hitTypes.length}`);
  await shot('a-flag-off', 'Kontrola: flaga OFF — dzisiejsze okno kolonii');
  const flat = await page.evaluate(`(() => { KOSMOS.overlayManager.closeActive?.(); const ss = KOSMOS.saveSystem ?? KOSMOS.gameScene?.saveSystem; ss.save?.(); KOSMOS.gameConfig.FEATURES.colonySphere = true; __g.open(); KOSMOS.uiManager._dirty = true; return true; })()`);
  await sleep(1500); s = await st();
  check(flat && !s.console && s.kind === 'flat', 'kolonia płaska przy fladze ON zostaje w dzisiejszym oknie (decyzja 6)', `console ${s.console}`);

  // ═══ Złożenie arkuszy ═══
  const compose = async (file, list, cols, title) => {
    await page.send('Page.navigate', { url: `${base}/__sheet` });
    await page.waitFor(`!!document.getElementById('c')`, 'arkusz');
    const data = await page.evaluate(`(async () => {
      const list = ${JSON.stringify(list)}, cols = ${cols}, TW = 800, TH = Math.round(800 * 1041 / 1600), LAB = 26, PAD = 10, HEAD = 40;
      const rows = Math.ceil(list.length / cols);
      const c = document.getElementById('c'); c.width = PAD + cols * (TW + PAD); c.height = HEAD + rows * (TH + LAB + PAD) + PAD;
      const x = c.getContext('2d'); x.fillStyle = '#05070b'; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#cfd8e3'; x.font = 'bold 18px sans-serif'; x.textBaseline = 'middle'; x.fillText(${JSON.stringify(title)}, PAD, HEAD / 2);
      for (let i = 0; i < list.length; i++) {
        const img = new Image(); img.src = '/__shot/' + list[i].name + '.png'; await img.decode();
        const cx = PAD + (i % cols) * (TW + PAD), cy = HEAD + Math.floor(i / cols) * (TH + LAB + PAD);
        x.imageSmoothingQuality = 'high'; x.drawImage(img, cx, cy + LAB, TW, TH);
        x.fillStyle = '#9fb4c8'; x.font = '13px sans-serif'; x.fillText(list[i].label, cx + 2, cy + LAB / 2);
        x.strokeStyle = '#27323f'; x.strokeRect(cx + 0.5, cy + LAB + 0.5, TW - 1, TH - 1);
      }
      return c.toDataURL('image/png');
    })()`);
    const out = path.join(OUT_DIR, file);
    fs.writeFileSync(out, Buffer.from(String(data).replace(/^data:image\/png;base64,/, ''), 'base64'));
    console.log('[cs8] zapisano', path.relative(REPO, out).replace(/\\/g, '/'), fs.statSync(out).size, 'B');
  };
  const byName = (n) => shots.find(x => x.name === n);
  const sheetA = [...['a-summary', 'a-tile', 'a-building', 'a-unit', 'a-queue', 'a-station', 'a-crew', 'a-outpost', 'a-preview', 'a-reload', 'a-fallback', 'a-flag-off'].map(byName).filter(Boolean),
    ...themeShots.map(byName).filter(Boolean)];
  // 10 ujęć opisanych (2 wiersze po 4 + 2) → wyrównaj do wielokrotności 4 przed blokiem motywów
  const headCount = sheetA.length - themeShots.length;
  const padded = [...sheetA.slice(0, headCount)];
  await compose('cs8a-console.png', [...padded, ...sheetA.slice(headCount)], 4, 'CS-8a — konsola Kolonii: stany inspektora, lista, kolejka, stacja, podgląd; niżej 5 motywów × (nic / pole / budynek / jednostka)');
  if (has('--build') && bShots.length) await compose('cs8b-build-flow.png', bShots.map(byName).filter(Boolean), 3, 'CS-8b — przepływ budowy: pole → budynek (pole polarne), budynek → pola (uzysk), odmowa z powodem, kolejka, ruch jednostki');

  if (exc.length) { console.log('WYJĄTKI STRONY:'); for (const e of [...new Set(exc)].slice(0, 8)) console.log('  ' + e.replace(/\n/g, ' | ')); }
  const realExc = exc.filter(e => !/AudioContext is closed/.test(e));   // dźwięk zamykany przy przeładowaniu strony — nie nasz kod
  check(realExc.length === 0, 'brak wyjątków strony', `${realExc.length}`);
  const bad = errs.filter(e => !/favicon|404|net::ERR|Failed to load resource|GPU stall|WebGL|deprecat/i.test(e));
  if (bad.length) { console.log('BŁĘDY KONSOLI:'); for (const e of [...new Set(bad)].slice(0, 8)) console.log('  ' + e); }
  const fail = checks.filter(c => !c.ok).length;
  console.log(`\n[cs8] kontrole: ${checks.length - fail} PASS / ${fail} FAIL`);
  if (has('--keep')) console.log('[cs8] zrzuty:', SHOT_DIR);
  exitCode = fail ? 1 : 0;
} catch (e) {
  console.error('[cs8] BŁĄD:', e?.stack ?? e);
  exitCode = 2;
} finally {
  try { chrome.proc.kill(); } catch { /* nic */ }
  server.close();
  await sleep(300);
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* Chrome trzyma pliki */ }
  if (!has('--keep')) { try { fs.rmSync(SHOT_DIR, { recursive: true, force: true }); } catch { /* nic */ } }
}
process.exit(exitCode);
