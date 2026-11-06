// Keeper ARC GALAXY, krok G1 — WYBÓR GWIAZDY w trybie galaktyki (docs/design/GALAXY_PLAN.md §4 G1, R2; Finding 109).
// Protokół lekki F8: keeper wyłącznie dla LOGIKI (reguła wyboru, rzut, trasa kliku i najechania, kolejność stref) — bez
// pinów na stałych rysunku.
//   P0  API
//   P1  `pickGalaxyStar` — reguła Findingu 109: NAJBLIŻSZY środek wśród gwiazd, których strefa (±11 px) obejmuje punkt;
//       remis — później podana (jak `StratcomHitLogic.pickStarZone`); poza strefami — nic
//   P2  `ThreeRenderer.galaxyStarAt` (WYKONANIE metody ze źródła na atrapie `this`, prawdziwa kamera three.core w presecie
//       galaktyki): klik w rzut gwiazdy (three `Vector3.project`) trafia ją; 15 px obok — nic; dwie bliskie — najbliższa
//   P3  SEDNO (R2): gałąź galaktyki NA GÓRZE `handleClick` / `handleMouseMove` — atrapa `this` rejestruje KAŻDY dotknięty
//       członek: w trybie galaktyki wyłącznie `_galaxyActive` + `_galaxyClick` / `_galaxyHover` (pickery układu — statek,
//       stacja, raycast ciał — nie są nawet odczytane); KONTROLA: w trybie układu ścieżka dotyka członków pickerów
//   P4  `_galaxyClick`: wynik pickera (`lastClickPick.object` 'galaxyStar' / null) i decyzja kontrolera (`onPlateClick`)
//   P5  `_galaxyHover`: nad UI — bez wyboru gwiazdy; gwiazda — kursor „rączka”; ta sama funkcja wyboru co klik
//   P6  STREFY HUD PIERWSZE: (a) scena woła `uiManager.handleClick` PRZED rendererem (pin źródłowy); (b) warstwa HUD w trybie
//       galaktyki — wyłącznie podwarstwy galaktyki (klatka, klik, najechanie, pokrycie), w trybie układu — wyłącznie układu
//       (prawdziwy `HudLayer`, podwarstwy-sondy); (c) nazwa płyty = strefa HUD: klik w nią wybiera jej gwiazdę
//   P7  scena w trybie galaktyki (WYKONANIE metod `GameScene` ze źródła na atrapie `this`): klik mapy — tylko wynik pickera
//       płyty (bez pickera celu i raycastu układu); prawy klik — bez menu mapy (G3); najechanie — bez współrzędnych układu
// Uruchom: node src/testing/smoke/galaxy_pick_smoke.mjs
import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import * as T3 from '../../lib/three.core.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { pickStarZone } from '../../ui/StratcomHitLogic.js';
import { makeHudProjector } from '../../ui/HudProjection.js';

let GL = null, HL = null, HGL = null;
try { GL = await import('../../ui/GalaxyModeLogic.js'); } catch (e) { console.log('  (GalaxyModeLogic:', e.message + ')'); }
try { HL = await import('../../ui/HudLayer.js'); } catch (e) { console.log('  (HudLayer:', e.message + ')'); }
try { HGL = await import('../../ui/HudGalaxyLabelLayer.js'); } catch (e) { console.log('  (HudGalaxyLabelLayer:', e.message + ')'); }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
const header = (s) => console.log(`\n── ${s}`);
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const bodyOf = (code, name) => { const i = code.indexOf(`\n  ${name}(`); return i < 0 ? '' : code.slice(i + 1, code.indexOf('\n  }\n', i) + 4); };
const compile = (code, name, scope = {}) => {
  const b = bodyOf(code, name);
  if (!b) return null;
  try {
    const names = Object.keys(scope);
    const make = new Function(...names, '__src', 'return eval("(" + __src + ")");');
    return make(...names.map((n) => scope[n]), 'function ' + b.trim().slice(name.length));
  } catch (e) { console.log(`  (kompilacja ${name}: ${e.message})`); return null; }
};
const run = (fn, self, ...a) => { try { return fn ? fn.apply(self, a) : undefined; } catch (e) { return `WYJĄTEK: ${e.message}`; } };
/** Atrapa `this`, która zapisuje KAŻDY odczytany członek (`own` — członkowie podani, reszta → `undefined`). */
const spyThis = (own) => {
  const seen = new Set();
  const p = new Proxy(own, { get(o, k) { if (typeof k === 'string') seen.add(k); return o[k]; } });
  return { p, seen };
};

const TR = src('../../renderer/ThreeRenderer.js');
const GS = src('../../scenes/GameScene.js');
const K = globalThis.window.KOSMOS;

// ═══ P0 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('P0  API');
ok(typeof GL?.pickGalaxyStar === 'function' && Number.isFinite(GL?.GALAXY_PICK_HALF_PX), 'P0a pickGalaxyStar + GALAXY_PICK_HALF_PX');
ok(['handleClick', 'handleMouseMove', 'galaxyStarAt', '_galaxyClick', '_galaxyHover'].every((n) => bodyOf(TR, n)), 'P0b metody renderera w źródle');

// ═══ P1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('P1  pickGalaxyStar — najbliższy środek (Finding 109)');
{
  const f = GL?.pickGalaxyStar, half = 11;
  const pts = [{ id: 'A', x: 100, y: 100 }, { id: 'B', x: 108, y: 100 }];
  ok(f?.(pts, 106, 100, half) === 'B' && f?.(pts, 102, 100, half) === 'A', 'P1a SEDNO: strefy się nakładają — wygrywa NAJBLIŻSZY środek, nie kolejność');
  ok(f?.(pts, 104, 100, half) === 'B' && f?.([pts[1], pts[0]], 104, 100, half) === 'A', 'P1b remis — później podana (reguła `pickStarZone`)');
  ok(f?.(pts, 130, 100, half) === null && f?.([], 100, 100, half) === null && f?.(pts, 100, 112, half) === null, 'P1c poza strefami / pusto — nic');
  const zones = pts.map((p) => ({ type: 'cluster_star', x: p.x - half, y: p.y - half, w: 2 * half, h: 2 * half, data: { id: p.id } }));
  const probes = [[106, 100], [102, 100], [104, 100], [100, 92], [111, 104]];
  ok(probes.every(([x, y]) => (pickStarZone(zones, x, y, zones.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) ?? null)?.data?.id ?? null) === f?.(pts, x, y, half)),
    'P1d ta sama odpowiedź co `StratcomHitLogic.pickStarZone` na tych samych strefach (5 punktów)');
}

// ── prawdziwa kamera w presecie galaktyki ───────────────────────────────────────────────────────────────────────────
const cssW = 1600, cssH = 1041, uiScale = 1.25;
const cam = new T3.PerspectiveCamera(55, cssW / cssH, 0.01, 40000);
{
  const th = 0.6, ph = 0.92, d = 11460;
  cam.position.set(d * Math.sin(ph) * Math.cos(th), d * Math.cos(ph), d * Math.sin(ph) * Math.sin(th));
  cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
}
const view = { view: [...cam.matrixWorldInverse.elements], proj: [...cam.projectionMatrix.elements], fovDeg: 55, cssW, cssH, worldPerAU: 11, worldPerLY: 200 };
const pxOf = (w) => { const v = new T3.Vector3(w.x, w.y, w.z).project(cam); return { x: (v.x + 1) / 2 * cssW, y: (1 - v.y) / 2 * cssH }; };
K.uiScale = uiScale;

// ═══ P2 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('P2  galaxyStarAt — rzut jak three, najbliższa gwiazda');
const starAt = compile(TR, 'galaxyStarAt', { makeHudProjector, pickGalaxyStar: GL?.pickGalaxyStar, GALAXY_PICK_HALF_PX: GL?.GALAXY_PICK_HALF_PX });
{
  const S1 = { id: 'sys_a', x: 0, y: 0, z: 0 }, S2 = { id: 'sys_b', x: 1400, y: 0, z: -900 };
  const self = { _galaxyActive: true, _galaxyPlate: { starsWorld: () => [S1, S2] }, getHudView: () => view };
  const p1 = pxOf(S1), p2 = pxOf(S2);
  ok(run(starAt, self, p1.x, p1.y) === 'sys_a' && run(starAt, self, p2.x + 3, p2.y - 3) === 'sys_b',
    `P2a klik w rzut three trafia gwiazdę (${p1.x.toFixed(0)}, ${p1.y.toFixed(0)} px css)`);
  ok(run(starAt, self, p1.x + 15 * uiScale, p1.y) === null, 'P2b 15 px logicznych obok — nic (strefa ±11 px)');
  const near = { id: 'sys_c', x: 0, y: 0, z: 0 };
  const off = pxOf({ x: 40, y: 0, z: 0 });
  const dpx = Math.hypot(off.x - p1.x, off.y - p1.y) / uiScale;
  const k = 7 / dpx;                                               // drugi punkt ~7 px logicznych od pierwszego
  near.x = 40 * k;
  const pn = pxOf(near);
  const self2 = { _galaxyActive: true, _galaxyPlate: { starsWorld: () => [near, S1] }, getHudView: () => view };
  const towardN = { x: p1.x + (pn.x - p1.x) * 0.8, y: p1.y + (pn.y - p1.y) * 0.8 };
  ok(run(starAt, self2, towardN.x, towardN.y) === 'sys_c' && run(starAt, self2, p1.x, p1.y) === 'sys_a',
    'P2c dwie gwiazdy ~7 px od siebie (strefy się nakładają) — wybór = najbliższy środek, w obie strony');
  ok(run(starAt, { ...self, _galaxyActive: false }, p1.x, p1.y) === null, 'P2d poza trybem galaktyki — nic');
}

// ═══ P3 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('P3  gałąź galaktyki na górze handleClick / handleMouseMove (R2)');
{
  const scope = { EventBus: { emit: () => {} }, readClickSelection: () => ({ activeSystemId: 'sys_home' }), window: globalThis.window };
  const hc = compile(TR, 'handleClick', scope), hm = compile(TR, 'handleMouseMove', scope);
  const calls = [];
  const g = spyThis({ _galaxyActive: true, _galaxyClick: (x, y) => { calls.push(['click', x, y]); return true; },
    _galaxyHover: (x, y) => calls.push(['hover', x, y]) });
  const r = run(hc, g.p, 300, 200, { ctrl: false });
  ok(r === true && JSON.stringify(calls) === '[["click",300,200]]' && [...g.seen].every((k) => k === '_galaxyActive' || k === '_galaxyClick'),
    `P3a SEDNO: klik w trybie galaktyki dotyka wyłącznie {${[...g.seen].join(', ')}}`);
  const g2 = spyThis({ _galaxyActive: true, _galaxyHover: (x, y) => calls.push(['hover', x, y]) });
  run(hm, g2.p, 310, 210);
  ok(calls.some((c) => c[0] === 'hover' && c[1] === 310) && [...g2.seen].every((k) => k === '_galaxyActive' || k === '_galaxyHover'),
    `P3b SEDNO: najechanie w trybie galaktyki dotyka wyłącznie {${[...g2.seen].join(', ')}}`);
  const s = spyThis({ _galaxyActive: false });
  run(hc, s.p, 300, 200, {});
  const s2 = spyThis({ _galaxyActive: false });
  run(hm, s2.p, 300, 200);
  ok([...s.seen].some((k) => k !== '_galaxyActive' && k !== '_galaxyClick') && [...s2.seen].some((k) => k !== '_galaxyActive' && k !== '_galaxyHover'),
    `P3c KONTROLA: tryb układu — ścieżka idzie dalej (klik: ${[...s.seen].slice(0, 4).join(', ')}…; najechanie: ${[...s2.seen].slice(0, 4).join(', ')}…)`);
}

// ═══ P4 / P5 ══════════════════════════════════════════════════════════════════════════════════════════════════════
header('P4  _galaxyClick — wynik pickera i decyzja kontrolera');
{
  const gc = compile(TR, '_galaxyClick', { window: globalThis.window, performance: globalThis.performance });
  const plate = [];
  K.galaxyMode = { onPlateClick: (id, t) => plate.push([id, typeof t]) };
  const self = { galaxyStarAt: () => 'sys_7', lastClickPick: null };
  const r1 = run(gc, self, 10, 10);
  ok(r1 === true && self.lastClickPick?.object === 'galaxyStar' && self.lastClickPick?.vesselId === null && JSON.stringify(plate[0]) === '["sys_7","number"]',
    'P4a gwiazda: `lastClickPick.object` = galaxyStar (zaznaczenie statku zostaje), `onPlateClick(id, czas)`');
  const self0 = { galaxyStarAt: () => null, lastClickPick: null };
  const r0 = run(gc, self0, 10, 10);
  ok(r0 === false && self0.lastClickPick?.object === null && plate[1]?.[0] === null, 'P4b pustka: object null (zaznaczenie statku zdjęte), `onPlateClick(null)` — odznaczenie');

  header('P5  _galaxyHover — nad UI bez wyboru, kursor');
  const gh = compile(TR, '_galaxyHover', { window: globalThis.window, document: globalThis.document });
  let picks = 0;
  const layer = globalThis.document.getElementById('event-layer');
  layer.style = {};   // atrapa `env.js` połyka zapisy stylu (Proxy) — zwykły obiekt, żeby odczytać kursor
  K.uiManager = { isOverUI: () => true };
  const sh = { galaxyStarAt: () => { picks++; return 'sys_7'; }, _galaxyHoverId: null };
  run(gh, sh, 5, 5);
  ok(picks === 0 && sh._galaxyHoverId === null, 'P5a kursor nad UI — wybór gwiazdy nie biegnie');
  K.uiManager = { isOverUI: () => false };
  run(gh, sh, 5, 5);
  ok(picks === 1 && sh._galaxyHoverId === 'sys_7' && layer.style.cursor === 'pointer', 'P5b gwiazda pod kursorem — „rączka”');
  sh.galaxyStarAt = () => null; run(gh, sh, 5, 5);
  ok(sh._galaxyHoverId === null && layer.style.cursor === 'default', 'P5c pustka — kursor zwykły');
  const b1 = bodyOf(TR, '_galaxyClick'), b2 = bodyOf(TR, '_galaxyHover');
  ok(/this\.galaxyStarAt\(/.test(b1) && /this\.galaxyStarAt\(/.test(b2), 'P5d klik i najechanie — ta sama funkcja wyboru (najechanie pokazuje to, co wybierze klik)');
}

// ═══ P6 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('P6  strefy HUD pierwsze');
{
  const h = bodyOf(GS, 'create') || GS;
  const iUI = GS.indexOf('if (!this.uiManager.handleClick(x, y)) {');
  const iTR = GS.indexOf('this.threeRenderer.handleClick(x, y,', iUI);
  const iEnd = GS.indexOf('this._handleTacticalLeftClick(e, this.threeRenderer.lastClickPick);', iTR);
  ok(iUI > 0 && iTR > iUI && iEnd > iTR && h.length > 0, 'P6a scena: renderer (wybór gwiazdy) wołany WYŁĄCZNIE, gdy UI nie pochłonęło kliku (outlinery, pigułka, warstwa HUD)');

  const mkCtx = () => new Proxy({ calls: [] }, { get(o, p) { if (p in o) return o[p]; return (...a) => { o.calls.push([String(p), ...a]); }; }, set(o, p, v) { o[p] = v; return true; } });
  const cv = { width: 0, height: 0, ctx: mkCtx(), getContext() { return this.ctx; } };
  const probe = (name) => {
    const p = { name, prepares: 0, collects: 0, draws: 0, clicks: 0, hovers: 0,
      prepare() { p.prepares++; return name; }, collect() { p.collects++; return { count: 1, animating: false }; },
      draw() { p.draws++; }, handleClick() { p.clicks++; return true; }, hoverObjectKey() { p.hovers++; return null; },
      coversPoint() { return true; } };
    return p;
  };
  const sys = probe('sys'), gal = probe('gal');
  globalThis.innerWidth = cssW; globalThis.innerHeight = cssH;
  Object.assign(K, {
    civMode: true, activeSystemId: 'sys_home', planetGlobeOpen: false,
    uiManager: { _cleanView: false, overlayManager: { isAnyOpen: () => false }, getSelectedVesselIds: () => [], getSelectedVesselId: () => null,
      _selectedEntity: null, getSelectedFleetId: () => null, isOverUI: () => false },
    threeRenderer: { _cleanView: false, _renderingEnabled: true, _contextLost: false, renderer: { getPixelRatio: () => 1 },
      getCameraMoveEpoch: () => 1, getHudView: () => view },
    tacticalMode: { isActive: false }, timeSystem: { simClockMs: null },
    galaxyMode: { isActive: true },
  });
  const hud = HL?.HudLayer ? new HL.HudLayer(cv, { autoStart: false, sublayers: [sys], galaxySublayers: [gal], now: () => 1000 }) : null;
  run(() => hud.frame(1000));
  const clickG = run(() => hud.handleClick(50, 50, 62, 62));
  run(() => hud.hoverObjectKey());
  ok(gal.prepares > 0 && gal.collects > 0 && sys.prepares === 0 && sys.collects === 0 && sys.draws === 0,
    `P6b SEDNO: klatka w trybie galaktyki — wyłącznie podwarstwy galaktyki (gal ${gal.prepares}/${gal.collects}, układ ${sys.prepares}/${sys.collects})`);
  ok(clickG === true && gal.clicks === 1 && sys.clicks === 0 && sys.hovers === 0 && run(() => hud.coversPoint(50, 50)) === true,
    'P6c klik / najechanie / pokrycie w trybie galaktyki — wyłącznie podwarstwy galaktyki');
  K.galaxyMode.isActive = false;
  run(() => hud.frame(1016));
  run(() => hud.handleClick(50, 50, 62, 62));
  ok(sys.prepares > 0 && sys.clicks === 1 && gal.clicks === 1, 'P6d KONTROLA: tryb układu — wyłącznie podwarstwy układu');
  ok(run(() => hud.debugState())?.mode === 'system', 'P6e tryb klatki w odczycie bramki (`debugState().mode`)');

  // (c) nazwa płyty = strefa HUD: prawdziwa podwarstwa nazw na atrapie świata
  const L = HGL?.HudGalaxyLabelLayer ? new HGL.HudGalaxyLabelLayer({ ctx: null }) : null;
  const stars = [{ id: 'sys_home', x: 0, y: 0, z: 0 }, { id: 'sys_b', x: 1400, y: 0, z: -900 }, { id: 'sys_q', x: -1600, y: 0, z: 700 }];
  const plateClicks = [];
  const KW = { galaxyMode: { isActive: true, selectedSystemId: null, onPlateClick: (id) => plateClicks.push(id) },
    threeRenderer: { getGalaxyStarsWorld: () => stars, _galaxyFadeT0: 0 },
    galaxyData: { systems: [{ id: 'sys_home', name: 'Dom', isHome: true, explored: true }, { id: 'sys_b', name: 'Bellatrix', explored: true },
      { id: 'sys_q', name: 'Sekret', explored: false }] },
    intelSystem: { isAtLeast: () => false }, observatorySystem: { getSystemScanResult: () => null },
    colonyManager: { getAllColonies: () => [] }, vesselManager: { getAllVessels: () => [] }, entityManager: { get: () => null },
    uiManager: { _outlinerState: { groundUnits: [] } }, activeSystemId: 'sys_home' };
  const F = { K: KW, now: 5000, W: cssW / uiScale, H: cssH / uiScale, mapRect: { x: 0, y: 0, w: cssW / uiScale, h: cssH / uiScale },
    roles: { primary: '#0f0', textPrimary: '#fff', dim: '#555' } };
  run(() => L.prepare(F));
  const proj = makeHudProjector({ ...view, uiScale });
  const out = run(() => L.collect(F, proj)) ?? {};
  const labs = L?._last?.labels ?? [];
  const lb = labs.find((l) => l.id === 'sys_b');
  ok(labs.length === 2 && !labs.some((l) => l.id === 'sys_q') && !labs.some((l) => /\?\?\?/.test(l.text ?? '')),
    `P6f nazwy: gwiazdy z ujawnioną nazwą (dom, Bellatrix); bez nazwy — goła, nigdy „???” (${labs.map((l) => l.text).join(', ')})`);
  K.galaxyMode = KW.galaxyMode;   // klik podwarstwy woła kontroler z `window.KOSMOS` (świat gry)
  ok(!!lb && run(() => L.handleClick(lb.x + 3, lb.y + 3)) === true && plateClicks[0] === 'sys_b' && run(() => L.handleClick(1, 1)) === false,
    'P6g klik w nazwę = klik w JEJ gwiazdę (strefa HUD przed wyborem płyty); poza nazwą — nie pochłania');
  ok(out?.count >= 2, `P6h podwarstwa zgłasza elementy do warstwy (count ${out?.count})`);
}

// ═══ P7 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('P7  scena w trybie galaktyki (GameScene, wykonanie ze źródła)');
{
  K.galaxyMode = { isActive: true };
  const left = compile(GS, '_handleTacticalLeftClick', { window: globalThis.window, document: globalThis.document, GAME_CONFIG });
  const calls = [];
  const sl = spyThis({ _selectFromClickPick: (...a) => calls.push(a) });
  run(left, sl.p, { target: { id: 'planet-canvas' }, ctrlKey: false }, { vesselId: 'v_1', object: 'galaxyStar' });
  ok(JSON.stringify(calls) === '[[null,false,null,"galaxyStar"]]' && [...sl.seen].every((k) => k === 'planetScene' || k === '_selectFromClickPick'),
    `P7a klik mapy: wyłącznie wynik pickera płyty (statek z pickera układu ignorowany), dotknięte {${[...sl.seen].join(', ')}}`);
  const right = compile(GS, '_handleTacticalRightClick', { window: globalThis.window, document: globalThis.document, GAME_CONFIG });
  // G3-B podnosi bramkę G1 wyłącznie dla menu skoku z gwiazdy (`_openGalaxyStarMenu`, keeper `galaxy_warp_ui`). Flaga OFF — jak w G1.
  const warpFlag = GAME_CONFIG.FEATURES.galaxyWarp;
  GAME_CONFIG.FEATURES.galaxyWarp = false;
  const sr = spyThis({});
  run(right, sr.p, { target: { id: 'planet-canvas' }, clientX: 5, clientY: 5, preventDefault() {} });
  ok([...sr.seen].every((k) => k === 'planetScene'), `P7b prawy klik (galaxyWarp OFF): bez menu mapy, dotknięte {${[...sr.seen].join(', ')}}`);
  GAME_CONFIG.FEATURES.galaxyWarp = true;
  const menus = [];
  const srOn = spyThis({ _openGalaxyStarMenu: (...a) => menus.push(a), _resolveClickTarget: () => { menus.push('raycast'); return null; } });
  run(right, srOn.p, { target: { id: 'planet-canvas' }, clientX: 5, clientY: 5, preventDefault() {} });
  ok(JSON.stringify(menus) === '[[5,5]]', `P7b2 prawy klik (galaxyWarp ON): tylko menu gwiazdy, bez raycastu układu (${JSON.stringify(menus)})`);
  GAME_CONFIG.FEATURES.galaxyWarp = warpFlag;
  const tip = compile(GS, '_tooltipHoverFromMain3D', { window: globalThis.window, document: globalThis.document, GAME_CONFIG });
  const tips = [];
  const st = spyThis({ _scheduleEntityTooltip: (...a) => tips.push(a) });
  run(tip, st.p, 40, 50);
  ok(JSON.stringify(tips) === '[[null,40,50]]' && [...st.seen].every((k) => k === '_scheduleEntityTooltip'), 'P7c najechanie: podpowiedź zgaszona, bez współrzędnych układu');
  K.galaxyMode = { isActive: false };
  const sl2 = spyThis({ _selectFromClickPick: () => {}, planetScene: null, uiManager: { isPickerActive: () => false } });
  run(left, sl2.p, { target: { id: 'planet-canvas' }, ctrlKey: false }, { vesselId: 'v_1', object: null });
  ok([...sl2.seen].includes('uiManager'), 'P7d KONTROLA: tryb układu — klik mapy idzie dalej (picker celu)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
