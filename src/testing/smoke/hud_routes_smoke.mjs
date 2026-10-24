// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — ARKUSZ HUD paczka A, H3: trasy statków na warstwie HUD 2D (`HudRouteLogic`, `HudRouteLayer`) — HUD_PLAN.md §4.4,
// §4.0 aneks 2026-10-23 (keepery WYŁĄCZNIE dla logiki — bez pinów na stałych rysunku). D-HUD-8, D-HUD-9, D-HUD-10,
// D-HUD-12; Findingi 509, 516, 527.
// Uruchom: node src/testing/smoke/hud_routes_smoke.mjs
//
//   R0  API i flaga `hudRoutes` (brak klucza = OFF)
//   R1  zestaw rozkazów (D-HUD-8): misja w locie (cel — ciało / punkt), powrót (cel = baza), patrol (bieżący odcinek),
//       pościg (do celu WIDOCZNEGO — inaczej bez trasy), przechwycenie (do punktu przechwycenia); walka, eskorta, dok,
//       orbita, wrak — bez trasy; punkty pośrednie — tylko nieminięte
//   R2  marsz kresek na `simClockMs` (D-HUD-12): pauza nie przesuwa wzoru, `null` (przed 1. tikiem po wczytaniu) — wzór
//       statyczny; okres wzoru
//   R3  trasy obcych (D-HUD-10, 509): wykryty TERAZ i jakość ≥ `contact`; `rumor` / `unknown` — nigdy; wykrycie z pary
//       z WŁASNYM statkiem albo z obserwatorium (pary obcy–obcy — nie)
//   R4  układ ściśle (516): trasa tylko statku z oglądanego układu; statek w skoku (`null`) — w żadnym
//   R5  skok warp (D-HUD-9): tylko w układzie ODLOTU, w fazie `warp_transit`; kierunek z mapy galaktyki; promień kończy się na
//       krawędzi kadru
//   R6  warstwa (stub świata, prawdziwy `HudLayer` + `HudRouteLayer`): trasa własna; obcy `rumor` — brak, `contact` + para
//       wykrycia — jest; statek innego układu — brak; warp — glif w układzie odlotu, w układzie celu — nic; pauza — spoczynek
//       (0 wywołań ctx), bieg — nowa klatka (marsz); flaga OFF — pusto
//   R7  montaż (piny źródłowe): linie tras 3D (`LineDashedMaterial`) tworzone tylko przy OFF, przy ON zwolnione
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import * as T3 from '../../lib/three.core.js';

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const src = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), 'utf8'); } catch { return ''; } };
const tryImport = async (p) => { try { return await import(p); } catch (e) { console.log('    (' + p + ': ' + e.message + ')'); return null; } };
const call = (f, ...a) => { try { return f?.(...a); } catch (e) { console.log('    (wyjątek: ' + e.message + ')'); return undefined; } };

const RL = await tryImport('../../ui/HudRouteLogic.js');
const RLay = await tryImport('../../ui/HudRouteLayer.js');
const HL = await tryImport('../../ui/HudLayer.js');
const FEATURES = GAME_CONFIG.FEATURES;
const AU = GAME_CONFIG.AU_TO_PX;

// ═══ R0 ══════════════════════════════════════════════════════════════════════
header('R0  API i flaga');
{
  const need = ['isHudRoutesOn', 'HUD_ROUTES', 'routeSpec', 'warpSpec', 'inActiveSystem', 'detectedNowIds', 'foreignRouteVisible', 'routeVisible',
    'warpVisible', 'marchOffset', 'routeAlpha', 'routeAttention', 'projectPolyline', 'warpScreenRay', 'remainingWaypoints', 'polylineRectExit'];
  const missing = need.filter((n) => RL?.[n] === undefined);
  ok(missing.length === 0, `R0a: \`HudRouteLogic\` — ${need.length} eksportów (brak: ${missing.join(', ') || '—'})`);
  ok(typeof RLay?.HudRouteLayer === 'function', 'R0b: `HudRouteLayer`');
  ok(/\bhudRoutes:\s*true,/.test(strip(src('../../config/GameConfig.js'))), 'R0c: `FEATURES.hudRoutes: true` w GameConfig');
  ok(RL?.isHudRoutesOn?.({ hudRoutes: true }) === true && RL?.isHudRoutesOn?.({}) === false, 'R0d: flaga — brak klucza = OFF');
}

// ═══ R1 ══════════════════════════════════════════════════════════════════════
const V = (id, o = {}) => ({ id, shipId: 'hull_small', systemId: 'sys_home', isWreck: false, modules: [], colonyId: 'p_nz',
  position: { x: 100, y: 0, state: 'in_transit', dockedAt: null }, mission: null, movementOrder: null, ...o });
header('R1  zestaw rozkazów (D-HUD-8)');
{
  const m = { type: 'transport', phase: 'outbound', targetId: 'p_mars', startX: 100, startY: 0, targetX: 400, targetY: 0, liveTargetX: 410, liveTargetY: 5,
    departYear: 10, arrivalYear: 20, waypoints: [{ x: 200, y: 50 }, { x: 300, y: 50 }] };
  const s1 = call(RL?.routeSpec, V('a', { mission: m }), { gameYear: 15 });
  ok(s1?.kind === 'mission' && s1.toKind === 'body' && s1.targetId === 'p_mars' && s1.to.x === 410 && s1.to.y === 5,
    'R1a: misja w locie do ciała — cel = żywe położenie ciała');
  ok(s1?.via?.length === 1 && s1.via[0].x === 300, `R1b: punkty pośrednie — tylko nieminięte (postęp 50 %: ${JSON.stringify(s1?.via ?? null)})`);
  const s2 = call(RL?.routeSpec, V('b', { mission: { type: 'move_to_point', targetX: 50, targetY: 60, departYear: 0, arrivalYear: 1 } }), { gameYear: 0.5 });
  ok(s2?.kind === 'mission' && s2.toKind === 'point' && s2.targetId === null, 'R1c: rozkaz ruchu w punkt — cel = punkt (chevron)');
  const s3 = call(RL?.routeSpec, V('c', { colonyId: 'p_home', mission: { type: 'recon', phase: 'returning', originId: 'p_o', returnTargetX: 0, returnTargetY: 110,
    returnStartX: 300, returnStartY: 0, returnDepartYear: 1, returnYear: 3 } }), { gameYear: 2 });
  ok(s3?.kind === 'return' && s3.toKind === 'body' && s3.targetId === 'p_home' && s3.to.y === 110, 'R1d: powrót — cel = baza statku (`colonyId`)');
  const s4 = call(RL?.routeSpec, V('d', { movementOrder: { type: 'patrol', status: 'active', patrolRoute: [{ x: 1, y: 2 }, { x: 30, y: 40 }], patrolWaypointIndex: 1 } }));
  ok(s4?.kind === 'patrol' && s4.to.x === 30 && s4.to.y === 40 && s4.toKind === 'point', 'R1e: patrol — bieżący odcinek (do bieżącego punktu trasy)');
  const pursue = V('e', { movementOrder: { type: 'pursue', status: 'active', targetEntityId: 'v_foe' } });
  const s5 = call(RL?.routeSpec, pursue, { targetVisiblePos: (id) => (id === 'v_foe' ? { x: 77, y: 88 } : null) });
  const s5b = call(RL?.routeSpec, pursue, { targetVisiblePos: () => null });
  ok(s5?.kind === 'pursue' && s5.toKind === 'object' && s5.to.x === 77 && s5b === null,
    'R1f: pościg — do celu widocznego na mapie; cel niewidoczny — bez trasy (linia zdradzałaby położenie)');
  const s6 = call(RL?.routeSpec, V('f', { movementOrder: { type: 'intercept', status: 'active', interceptPoint: { x: 9, y: 9 } } }));
  ok(s6?.kind === 'intercept' && s6.to.x === 9 && s6.toKind === 'point', 'R1g: przechwycenie — do punktu przechwycenia');
  const none = [
    V('g', { movementOrder: { type: 'engage', status: 'active' }, mission: m }),
    V('h', { movementOrder: { type: 'escort', status: 'active' }, mission: m }),
    V('i', { position: { x: 1, y: 1, state: 'docked', dockedAt: 'p_nz' }, mission: m }),
    V('j', { position: { x: 1, y: 1, state: 'orbiting', dockedAt: 'p_nz' }, mission: m }),
    V('k', { isWreck: true, mission: m }),
    V('l', { mission: null }),
  ].map((v) => call(RL?.routeSpec, v, { gameYear: 15 }));
  ok(none.every((x) => x === null), 'R1h: walka, eskorta, dok, orbita, wrak, brak misji — bez trasy');
}

// ═══ R2 ══════════════════════════════════════════════════════════════════════
header('R2  marsz kresek na zegarze symulacji (D-HUD-12)');
{
  const R = RL?.HUD_ROUTES ?? {};
  const period = (R.DASH?.[0] ?? 0) + (R.DASH?.[1] ?? 0);
  ok(RL?.marchOffset?.(null) === 0 && RL?.marchOffset?.(undefined) === 0 && RL?.marchOffset?.(NaN) === 0,
    'R2a: zegar `null` (przed 1. tikiem po wczytaniu) — wzór statyczny (przesunięcie 0, bez zapasu na czas realny)');
  const m1 = RL?.marchOffset?.(12345), m2 = RL?.marchOffset?.(12345);
  ok(Number.isFinite(m1) && m1 > 0 && m1 === m2, 'R2b: ten sam zegar — to samo przesunięcie (pauza: zegar stoi ⇒ wzór stoi)');
  const a = RL?.marchOffset?.(1000), b = RL?.marchOffset?.(1250);
  ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs((b - a) - (R.MARCH_PX_PER_S * 0.25)) < 1e-9,
    `R2c: bieg — przesunięcie rośnie z zegarem (${R.MARCH_PX_PER_S} px na s zegara symulacji)`);
  const o = RL?.marchOffset?.(1e9 + 333);
  ok(o >= 0 && o < period && RL?.marchOffset?.(-500) >= 0, `R2d: przesunięcie modulo okres wzoru (${period} px) — zawsze w [0, okres)`);
}

// ═══ R3 ══════════════════════════════════════════════════════════════════════
header('R3  trasy obcych (D-HUD-10, 509): wykryty TERAZ i ≥ contact');
{
  const f = RL?.foreignRouteVisible;
  ok(f?.({ isEnemy: false }) === true, 'R3a: własny — zawsze');
  ok(f?.({ isEnemy: true, quality: 'contact', detectedNow: true }) === true && f?.({ isEnemy: true, quality: 'detailed', detectedNow: true }) === true,
    'R3b: obcy `contact` / `detailed` i wykryty teraz — trasa');
  ok(f?.({ isEnemy: true, quality: 'rumor', detectedNow: true }) === false && f?.({ isEnemy: true, quality: 'unknown', detectedNow: true }) === false
    && f?.({ isEnemy: true, quality: null, detectedNow: true }) === false, 'R3c: `rumor` / `unknown` / brak wywiadu — nigdy (także przy wykryciu)');
  ok(f?.({ isEnemy: true, quality: 'contact', detectedNow: false }) === false, 'R3d: `contact`, ale NIE wykryty teraz (stary wywiad) — bez trasy');
  const own = new Set(['p1', 'p2']);
  const det = RL?.detectedNowIds?.({ pairs: ['p1|e1', 'e2|p2', 'e3|e4', 'p1|p2', 'bad'], isPlayerVesselId: (id) => own.has(id), observatoryDetected: ['e5'] });
  ok(det instanceof Set && det.has('e1') && det.has('e2') && det.has('e5') && !det.has('e3') && !det.has('e4') && !det.has('p1') && !det.has('p2'),
    `R3e: wykryci teraz — para z własnym statkiem albo obserwatorium; para obcy–obcy i własny–własny — nie (${det ? [...det].join(',') : '—'})`);
}

// ═══ R4 ══════════════════════════════════════════════════════════════════════
header('R4  układ ściśle (516)');
{
  const rv = RL?.routeVisible;
  ok(rv?.({ vessel: V('a'), activeSystemId: 'sys_home' }) === true && rv?.({ vessel: V('a', { systemId: 'sys_051' }), activeSystemId: 'sys_home' }) === false,
    'R4a: statek innego układu — bez trasy');
  ok(rv?.({ vessel: V('a', { systemId: undefined }), activeSystemId: 'sys_home' }) === true,
    'R4b: brak pola `systemId` (stary zapis) — `sys_home`');
  ok(rv?.({ vessel: V('a', { systemId: null }), activeSystemId: 'sys_home' }) === false && RL?.inActiveSystem?.(V('a', { systemId: null }), null) === false,
    'R4c: statek w skoku (`null`) — w żadnym układzie (nawet przy oglądanym `null`)');
}

// ═══ R5 ══════════════════════════════════════════════════════════════════════
header('R5  skok warp (D-HUD-9): tylko układ odlotu, kierunek z mapy galaktyki, kres na krawędzi kadru');
{
  const jump = (o = {}) => V('w', { systemId: null, position: { x: 500, y: -200, state: 'in_transit', dockedAt: null },
    mission: { type: 'interstellar_jump', phase: 'warp_transit', fromSystemId: 'sys_home', toSystemId: 'sys_051', targetName: 'Bellatrix',
      fromGalX: 10, fromGalY: 10, toGalX: 13, toGalY: 14, ...o } });
  const w1 = call(RL?.warpSpec, jump(), 'sys_home');
  ok(w1 && Math.abs(w1.dir.x - 0.6) < 1e-9 && Math.abs(w1.dir.y - 0.8) < 1e-9 && w1.from.x === 500 && w1.name === 'Bellatrix',
    `R5a: układ odlotu — kierunek = różnica położeń układów na mapie galaktyki (0,6; 0,8), start = punkt odlotu`);
  ok(call(RL?.warpSpec, jump(), 'sys_051') === null, 'R5b: układ celu — nic do przylotu');
  ok(call(RL?.warpSpec, jump({ phase: 'in_system' }), 'sys_home') === null && call(RL?.warpSpec, { ...jump(), systemId: 'sys_home' }, 'sys_home') === null,
    'R5c: po przylocie (`in_system`) albo ze stemplem układu — bez glifu');
  // Strojenie 1 (decyzja 3): trasa wieloprzeskokowa — nazwa przy glifie = układ DOCELOWY TRASY, kierunek = bieżący przeskok.
  const multi = { ...jump({ toSystemId: 'sys_030', targetName: 'Lalande', toGalX: 10, toGalY: 15 }), warpRoute: { finalSystemId: 'sys_051' } };
  const names = { sys_051: 'Bellatrix', sys_030: 'Lalande' };
  const wm = call(RL?.warpSpec, multi, 'sys_home', { systemName: (id) => names[id] ?? null });
  ok(wm?.name === 'Bellatrix' && wm.finalSystemId === 'sys_051' && Math.abs(wm.dir.x) < 1e-9 && Math.abs(wm.dir.y - 1) < 1e-9,
    `R5h: trasa wieloprzeskokowa — glif „${wm?.name}” (cel trasy), kierunek bieżącego przeskoku (${wm?.dir?.x?.toFixed?.(2)}; ${wm?.dir?.y?.toFixed?.(2)})`);
  const wNo = call(RL?.warpSpec, multi, 'sys_home');
  ok(wNo?.name === 'sys_051' && call(RL?.warpSpec, jump(), 'sys_home')?.name === 'Bellatrix',
    'R5i: bez nazw mapy galaktyki — id celu trasy (nie nazwa przeskoku); pojedynczy skok — nazwa z misji');
  // Promień do krawędzi kadru: rzut prostokątny (płaski świat x,z → ekran) — kres przy krawędzi w kierunku.
  const rect = { x: 150, y: 28, w: 980, h: 742.8 };
  const toScreen = (x, y, z) => ({ x: 640 + x * 4, y: 400 + z * 4 });
  const ray = call(RL?.warpScreenRay, { start: { x: 0, y: 0, z: 0 }, dir: { x: 1, z: 0 }, worldPerAU: 11, toScreen, rect });
  ok(ray?.exit && Math.abs(ray.exit.x - (rect.x + rect.w)) < 0.5 && ray.edge === 'right' && ray.pts[0].x === 640,
    `R5d: promień od punktu odlotu kończy się na krawędzi kadru (wyjście x = ${ray?.exit?.x?.toFixed?.(2)}, krawędź ${ray?.edge})`);
  const up = call(RL?.warpScreenRay, { start: { x: 0, y: 0, z: 0 }, dir: { x: 0, z: -1 }, worldPerAU: 11, toScreen, rect });
  ok(up?.edge === 'top' && Math.abs(up.exit.y - rect.y) < 0.5, 'R5e: kierunek „w górę ekranu” — krawędź górna');
  // Punkt odlotu daleko poza kadrem: odstęp próbek rośnie dwukrotnie — promień przecina kadr MIĘDZY próbkami (-92 → 1316 px).
  const far = call(RL?.warpScreenRay, { start: { x: (-1500 - 640) / 4, y: 0, z: 0 }, dir: { x: 1, z: 0 }, worldPerAU: 11, toScreen, rect });
  const last = far?.pts?.[far.pts.length - 1];
  ok(far?.edge === 'right' && Math.abs((far?.exit?.x ?? 0) - (rect.x + rect.w)) < 0.5 && last && Math.abs(last.x - far.exit.x) < 1e-9,
    `R5f: odlot poza kadrem, promień przecina kadr między próbkami — wyjście i glif na krawędzi (x ${far?.exit?.x?.toFixed?.(1)}, ${far?.edge})`);
  const miss = call(RL?.warpScreenRay, { start: { x: (-1500 - 640) / 4, y: 0, z: -200 }, dir: { x: 1, z: 0 }, worldPerAU: 11, toScreen, rect });
  ok(miss && miss.exit === null && miss.edge === null, 'R5g KONTROLA: promień nie przecina kadru — bez wyjścia i bez glifu');
}

// ═══ Świat (stub) — prawdziwy `HudLayer` + `HudRouteLayer` ═══════════════════════════════════════════════════
const K = globalThis.window.KOSMOS ?? (globalThis.window.KOSMOS = {});
const mkCam = (pos, look = [0, 0, 0]) => { const c = new T3.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000); c.position.set(...pos); c.lookAt(...look); c.updateMatrixWorld(); return c; };
const viewOf = (cam) => ({ view: cam.matrixWorldInverse.elements.slice(), proj: cam.projectionMatrix.elements.slice(), fovDeg: 55, cssW: 1600, cssH: 1041, worldPerAU: 11 });
const W0 = { cam: mkCam([0, 60, 50]), epoch: 1, sim: 5000, vessels: [], intel: {}, pairs: new Set(), obs: [], sprites: {}, hidden: new Set(), lead: null, ids: [], active: 'sys_home' };
const kWorld = 11 / AU;
const setWorld = () => {
  globalThis.innerWidth = 1600; globalThis.innerHeight = 1041;
  Object.assign(K, {
    civMode: true, uiScale: 1.25, planetGlobeOpen: false, uiPrefs: {},
    uiManager: { _cleanView: false, overlayManager: { isAnyOpen: () => false }, getSelectedVesselIds: () => [...W0.ids], getSelectedVesselId: () => W0.lead,
      _selectedEntity: null, getSelectedFleetId: () => null },
    threeRenderer: {
      _cleanView: false, _renderingEnabled: true, _contextLost: false, _pingedEnemyId: null, renderer: { getPixelRatio: () => 1.5 }, _tacticalHoverVid: null,
      get _vessels() { return new Map(W0.vessels.map((v) => [v.id, { sprite: { visible: !W0.hidden.has(v.id) } }])); },
      getCameraMoveEpoch: () => W0.epoch, getHudView: () => viewOf(W0.cam),
      getBodyWorldInfo: (id) => (id === 'p_mars' ? { x: 400 * kWorld, y: 0, z: 0, r: 0.3 } : null),
      getVesselWorldPosition: (id) => { const v = W0.vessels.find((x) => x.id === id); return v ? { x: v.position.x * kWorld, y: 0.3, z: v.position.y * kWorld } : null; },
      _getVesselAtScreen: () => null, _hoverPlanetId: null,
    },
    vesselManager: { getAllVessels: () => [...W0.vessels], getVessel: (id) => W0.vessels.find((v) => v.id === id) ?? null },
    intelSystem: { getVesselContact: (id) => (W0.intel[id] ? { quality: W0.intel[id] } : null) },
    proximitySystem: { get _activePairs() { return W0.pairs; } },
    observatorySystem: { getDetectedVesselIds: () => [...W0.obs] },
    timeSystem: { get simClockMs() { return W0.sim; }, gameTime: 15 },
    tacticalMode: { isActive: false },
    leftOutliner: { getReservedWidth: () => 150 }, rightOutliner: { getReservedWidth: () => 150 }, tacticalDock: { getReservedHeight: () => 0 },
  });
  // Getter na najwyższym poziomie — `Object.assign` skopiowałby WARTOŚĆ, nie getter.
  Object.defineProperty(K, 'activeSystemId', { get: () => W0.active, configurable: true, enumerable: true });
};
setWorld();
FEATURES.hudRoutes = true;
const mkCtx = () => {
  const t = { calls: [] };
  return new Proxy(t, {
    get(o, p) { if (p === 'calls') return o.calls; if (Object.prototype.hasOwnProperty.call(o, p)) return o[p]; return (...a) => { o.calls.push([String(p), ...a]); }; },
    set(o, p, v) { o.calls.push(['=' + String(p), v]); o[p] = v; return true; },
  });
};
const mkHud = () => {
  const ctx = mkCtx(); const cv = { width: 0, height: 0, getContext: () => ctx };
  const lay = RLay?.HudRouteLayer ? new RLay.HudRouteLayer(null) : null;
  const hud = HL?.HudLayer && lay ? new HL.HudLayer(cv, { autoStart: false, sublayers: [lay] }) : null;
  if (lay && hud) lay._hud = hud;
  return { ctx, lay, hud, frame: (now) => (hud ? call(() => hud.frame(now)) : null), dbg: () => lay?.debug?.() ?? null };
};
const transport = (id, o = {}) => V(id, { mission: { type: 'transport', phase: 'outbound', targetId: 'p_mars', startX: 100, startY: 0, targetX: 400, targetY: 0,
  departYear: 10, arrivalYear: 20, waypoints: [] }, ...o });

// ═══ R6 ══════════════════════════════════════════════════════════════════════
header('R6  warstwa: własna, obca (rumor / contact + wykrycie), inny układ, warp, pauza / bieg, OFF');
{
  const H = mkHud();
  W0.vessels = [transport('v_own'), transport('v_foe', { isEnemy: true, ownerEmpireId: 'emp_1' }), transport('v_far', { systemId: 'sys_051' })];
  W0.intel = { v_foe: 'rumor' }; W0.pairs = new Set(['v_own|v_foe']); W0.lead = 'v_own'; W0.ids = ['v_own'];
  H.frame(1000);
  let d = H.dbg();
  const ids = (d?.routes ?? []).map((r) => r.id);
  ok(ids.includes('v_own') && d.routes.find((r) => r.id === 'v_own')?.mult === 1, `R6a: trasa własna, zaznaczona — pełna uwaga (×1)`);
  ok(!ids.includes('v_foe') && ids.includes('v_own'), 'R6b: obcy `rumor` (mimo pary wykrycia) — bez trasy (świadek: trasa własna jest)');
  ok(!ids.includes('v_far') && ids.includes('v_own'), 'R6c: statek innego układu — bez trasy (516; świadek: trasa własna jest)');
  W0.intel = { v_foe: 'contact' }; W0.epoch++;
  H.frame(1100); d = H.dbg();
  const foe = (d?.routes ?? []).find((r) => r.id === 'v_foe');
  ok(!!foe && foe.enemy === true, 'R6d: obcy `contact` + para wykrycia z własnym statkiem — trasa (rola obca)');
  W0.pairs = new Set(); W0.epoch++;
  H.frame(1200); d = H.dbg();
  ok(!!foe && !(d?.routes ?? []).some((r) => r.id === 'v_foe') && (d?.routes ?? []).some((r) => r.id === 'v_own'),
    'R6e: obcy `contact`, para wykrycia wygasła — trasa znika (509; świadek: przed chwilą była, własna jest)');
  W0.obs = ['v_foe']; W0.epoch++;
  H.frame(1300); d = H.dbg();
  ok((d?.routes ?? []).some((r) => r.id === 'v_foe'), 'R6f: obcy `contact` wykryty przez obserwatorium — trasa');
  W0.obs = [];
  // Pauza: zegar stoi ⇒ klatka bez zmian ⇒ spoczynek (0 wywołań ctx); bieg — nowy klucz ⇒ nowa klatka (marsz).
  W0.epoch++; H.frame(1400);
  const n0 = H.ctx.calls.length;
  const p1 = H.frame(1500), p2 = H.frame(1600);
  ok(p1 === 'idle' && p2 === 'idle' && H.ctx.calls.length === n0, `R6g: pauza (zegar symulacji stoi) — spoczynek, 0 wywołań ctx (${p1}/${p2})`);
  W0.sim += 250;
  const r1 = H.frame(1700);
  ok(r1 === 'drawn', 'R6h: bieg (zegar symulacji +250 ms) — nowa klatka (marsz kresek)');
  W0.sim = null; W0.epoch++; H.frame(1800);
  const n1 = H.ctx.calls.length;
  const z1 = H.frame(1900), z2 = H.frame(2000);
  ok(z1 === 'idle' && z2 === 'idle' && H.ctx.calls.length === n1, 'R6i: zegar `null` (przed 1. tikiem po wczytaniu) — wzór statyczny, spoczynek');
  W0.sim = 5000;
  // Warp: układ odlotu — glif z nazwą przy krawędzi; układ celu — nic.
  W0.vessels = [V('v_warp', { systemId: null, position: { x: 300, y: 0, state: 'in_transit', dockedAt: null },
    mission: { type: 'interstellar_jump', phase: 'warp_transit', fromSystemId: 'sys_home', toSystemId: 'sys_051', targetName: 'Bellatrix',
      fromGalX: 0, fromGalY: 0, toGalX: 5, toGalY: 0 } })];
  W0.lead = null; W0.ids = []; W0.epoch++;
  H.frame(2100); d = H.dbg();
  const wp = d?.warps?.[0];
  ok(d?.warps?.length === 1 && wp?.glyph?.name === 'Bellatrix' && !!wp.glyph.edge && (d.routes ?? []).length === 0,
    `R6j: skok warp w układzie odlotu — promień do krawędzi kadru + glif „${wp?.glyph?.name}” (krawędź ${wp?.glyph?.edge})`);
  const map = { x: 150, y: 28, w: 1280 - 300, h: 1041 / 1.25 - 28 - 0 };
  ok(!!wp?.glyph && wp.glyph.x >= map.x && wp.glyph.x <= map.x + map.w && wp.glyph.y >= map.y,
    `R6k: glif warp w obszarze mapy (${wp?.glyph?.x}, ${wp?.glyph?.y})`);
  W0.active = 'sys_051'; W0.epoch++;
  H.frame(2200); d = H.dbg();
  ok(d?.on === true && wp?.glyph?.name === 'Bellatrix' && (d?.warps ?? []).length === 0 && (d?.routes ?? []).length === 0,
    'R6l: układ celu w trakcie skoku — nic do przylotu (świadek: w układzie odlotu glif był)');
  W0.active = 'sys_home';
  // Trasa wieloprzeskokowa w warstwie: nazwa celu trasy z mapy galaktyki (`galaxyData.systems`), nie przeskoku z misji.
  K.galaxyData = { systems: [{ id: 'sys_051', name: 'Bellatrix' }, { id: 'sys_030', name: 'Lalande' }, { id: 'sys_077', name: 'Polaris' }] };
  W0.vessels[0].mission.toSystemId = 'sys_030'; W0.vessels[0].mission.targetName = 'Lalande';
  W0.vessels[0].warpRoute = { finalSystemId: 'sys_077' };
  W0.epoch++; H.frame(2250); d = H.dbg();
  ok(d?.warps?.[0]?.glyph?.name === 'Polaris', `R6n: warstwa — glif z nazwą celu trasy wieloprzeskokowej („${d?.warps?.[0]?.glyph?.name}”, przeskok: Lalande)`);
  delete K.galaxyData;
  // Flaga OFF — pusto.
  W0.vessels = [transport('v_own')]; W0.lead = 'v_own'; W0.ids = ['v_own'];
  FEATURES.hudRoutes = false; W0.epoch++;
  const off = H.frame(2300); d = H.dbg();
  ok((d?.routes ?? []).length === 0 && (d?.warps ?? []).length === 0 && d?.on === false, `R6m: flaga OFF — bez tras HUD (${off})`);
  FEATURES.hudRoutes = true;
}

// ═══ R7 ══════════════════════════════════════════════════════════════════════
header('R7  montaż (piny źródłowe): linie tras 3D tylko przy OFF');
{
  const tr = strip(src('../../renderer/ThreeRenderer.js'));
  ok(/import \{ isHudRoutesOn \} from '\.\.\/ui\/HudRouteLogic\.js';/.test(tr) && /const hudRoutesOn = \(\) => isHudRoutesOn\(GAME_CONFIG\.FEATURES\);/.test(tr),
    'R7a: flaga tras czytana przy każdym wywołaniu (przełączenie w konsoli działa bez przeładowania)');
  const creates = [...tr.matchAll(/new THREE\.LineDashedMaterial\(/g)].length;
  const gated = (tr.match(/vessel\.mission && !isWreck && !hudRoutesOn\(\)/g) ?? []).length + (tr.match(/vessel\.mission && !hudRoutesOn\(\)/g) ?? []).length;
  ok(gated >= 2 && /if \(hudRoutesOn\(\)\) \{[\s\S]{0,400}?\} else if \(!entry\.routeLine\) \{/.test(tr),
    `R7b: tworzenie linii tras 3D bramkowane flagą (3 miejsca; \`LineDashedMaterial\` w pliku: ${creates})`);
  ok(/if \(hudRoutesOn\(\)\) this\._disposeAllRouteLines\(\);/.test(tr) && /_disposeAllRouteLines\(\) \{/.test(tr),
    'R7c: przy ON istniejące linie 3D zwalniane (pętla renderu)');
  const hl = strip(src('../../ui/HudLayer.js'));
  ok(/_defaultSublayers\(\)\s*\{\s*return \[new HudRouteLayer\(this\), new HudRadarLayer\(this\)/.test(hl),
    'R7d: trasy — pierwsza podwarstwa gry (rysowane pod radarem i etykietami; glify warp zbierane przed etykietami)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
