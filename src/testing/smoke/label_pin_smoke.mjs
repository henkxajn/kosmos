// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — REFORMA ZAKŁADEK T2: przypięcie etykiety z akcjami; karta ciała i panel stacji wyłączone (`LabelPinLogic`, gałąź
// `labelPin` w `HudLabelLayer`, spięcie w `UIManager` / `GameScene` / `StationPanel` / `ThreeRenderer`) — TABS_REFORM_PLAN.md
// §5.1–§5.2; D-TR-1 (a), D-TR-4 (a), D-TR-5 (a); I7 §3.1 / §3.2 / §3.4. Protokół lekki (HUD_PLAN §4.0 aneks): keepery
// WYŁĄCZNIE dla logiki — strefy kliku, reguła 1. / 2. klik, jedno przypięcie naraz, Esc, przełączenie układu, odczyt
// zaznaczenia, cele akcji (piny na wywołaniach), limit list, przypięcie w rozkładzie, wejścia I3; bez pinów na stałych rysunku.
// Uruchom: node src/testing/smoke/label_pin_smoke.mjs
//
//   P0  API i flaga `labelPin` (brak klucza = OFF; stoi na rozwinięciu T1 — wymaga `hudLabels` i `labelHover`)
//   P1  przypięcie = zaznaczenie: klucz z `readClickSelection` (ciało / stacja), bez nowego pola stanu
//   P2  strefy kliku: przycisk > etykieta (linia nazwy) > reszta przypięcia (pochłonięta) > tarcza / sprite; KONTROLA —
//       zwykła etykieta na tarczy dalej przegrywa z tarczą (487); kursor „rączki” nad przyciskiem
//   P3  1. / 2. klik z przypięciem (D-UI-5): 1. klik przypina (kamera stoi), 2. klik w linię nazwy — kamera
//   P4  jedno przypięcie naraz (ciało ↔ stacja; `pin_swap` bez kamery — renderer; panel stacji zostaje)
//   P5  Esc w kaskadzie: po zaznaczeniu statku, przed overlayem; overlay / okno DOM — nie
//   P6  przełączenie układu zdejmuje przypięcie spoza układu (486 / 491)
//   P7  `readClickSelection` z przypięcia (wykonanie) i przycisk ✕
//   P8  „Mapa ciała” — 4 warianty karty (prawdziwe `BottomContext._doAction`; pin na `planet:previewMap`); strojenie 1 (554):
//       przycisk tylko wtedy, gdy `_doAction` coś zrobi (obca kolonia bez moich wojsk i bez skanu — brak; karta przy OFF bez zmian)
//   P9  „Raport” → `BodyDetailModal`; gwiazda bez raportu
//   P10 listy z limitem (5 + „+N więcej”), akordeon ▼ / ▲, stacja obca — bez list (mgła wojny)
//   P11 przypięta etykieta stoi przy swoim obiekcie (I8.3): członek stosu ma własną etykietę, lista rośnie w dół, sąsiad ustępuje
//       (także najechany sąsiad z przypięciem położenia T1, który wszedłby na przypiętą); karta UI nad warstwą (panel statku przy
//       outlinerze) — etykieta przenosi się obok karty; STROJENIE 1 (zachowanie 5, wariant 2): pasek rośnie w dół jak przy
//       najechaniu — mała tarcza: linia nazwy bez zmian po przypięciu; duża tarcza: przesunięcie w górę = dokładnie nadmiar nad
//       tarczą (swoją, gospodarza stacji); bez miejsca w kadrze — pod tarczę; lista handlu stacji przy ~4 j. — tarcza odkryta;
//       rozwinięcie NAJECHANIA (T1) — ta sama reguła raz przy pojawieniu się (P11z–P11zb; przy `labelPin` OFF — jak T1)
//   Fail-first (kopia `git archive 1eed72d`): zielone wyłącznie KONTROLE, świadkowie sceny i OFF; strojenie 1 — kopia drzewa
//   z T2 sprzed strojenia: czerwone piny strojenia, zielone kontrole i świadkowie.
//   P12 karta ciała i panel stacji przy ON — nierysowane i nieklikalne (piny na wywołaniach `UIManager`)
//   P13 wejścia I3 (karta ciała ×9, panel stacji ×4) prowadzą do przypięcia; strojenie 1 (b): 1. klik w wiersz ciała z INNEGO
//       układu w lewym outlinerze — wiersz podświetlony jak zaznaczenie (U2), przypięcie dopiero po 2. kliku (przełączenie)
//   P14 budżet: treść przypięcia z pamięci (TTL), spoczynek — 0 wywołań ctx
//   P15 OFF = dziś
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { THEME } from '../../config/ThemeConfig.js';
import * as T3 from '../../lib/three.core.js';
import EventBus from '../../core/EventBus.js';
import EntityManagerReal from '../../core/EntityManager.js';
import { t as tx } from '../../i18n/i18n.js';

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const src = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const tryImport = async (p) => { try { return await import(p); } catch (e) { console.log('    (' + p + ': ' + e.message + ')'); return null; } };
const call = (f, ...a) => { try { return typeof f === 'function' ? f(...a) : undefined; } catch (e) { console.log('    (wyjątek: ' + e.message + ')'); return undefined; } };

const LP = await tryImport('../../ui/LabelPinLogic.js');
const LH = await tryImport('../../ui/LabelHoverLogic.js');
const LL = await tryImport('../../ui/HudLabelLogic.js');
const LLay = await tryImport('../../ui/HudLabelLayer.js');
const HL = await tryImport('../../ui/HudLayer.js');
const CI = await tryImport('../../ui/ClickIntentLogic.js');
const BCm = await tryImport('../../ui/BottomContext.js');
const SPm = await tryImport('../../ui/StationPanel.js');
const LOm = await tryImport('../../ui/LeftOutliner.js');
const FEATURES = GAME_CONFIG.FEATURES;
const UIM = strip(src('../../scenes/UIManager.js'));
const GS = strip(src('../../scenes/GameScene.js'));
const TR = strip(src('../../renderer/ThreeRenderer.js'));
const SPsrc = strip(src('../../ui/StationPanel.js'));

/** Ciało metody klasy ze źródła (od nazwy do zamykającej klamry na tym samym wcięciu). */
const methodBody = (s, name) => {
  const re = new RegExp('\\n  ' + name + '\\(([^)]*)\\)\\s*\\{');
  const m = re.exec(s);
  if (!m) return null;
  const start = m.index + m[0].length;
  const end = s.indexOf('\n  }\n', start);
  return end > 0 ? { args: m[1], body: s.slice(start, end) } : null;
};

// ═══ P0 ══════════════════════════════════════════════════════════════════════
header('P0  API i flaga `labelPin`');
{
  const need = ['isLabelPinOn', 'isLabelPinActive', 'LABEL_PIN', 'PIN_SWAP_REASON', 'pinnedContentKey', 'stripArrow', 'stripColon',
    'visibleDeposits', 'homeDistanceLine', 'depositStars', 'depositRows', 'trafficRows', 'moduleRows', 'storageRows', 'limitRows',
    'bodyPinButtons', 'stationPinButtons', 'layoutButtonRows', 'toggleOpenList', 'openListFor', 'pinHitAt', 'runPinAction',
    'enforceSinglePinOnStation', 'enforceSinglePinOnBody', 'escapeUnpin', 'escapeHeldByModal', 'pinnedBox', 'yieldToPinnedLabel'];
  const missing = need.filter((n) => LP?.[n] === undefined);
  ok(missing.length === 0, `P0a: \`LabelPinLogic\` — ${need.length} eksportów (brak: ${missing.join(', ') || '—'})`);
  ok(LP?.isLabelPinOn?.({ labelPin: true }) === true && LP?.isLabelPinOn?.({}) === false && LP?.isLabelPinOn?.({ labelPin: 1 }) === false,
    'P0b: flaga — `true` wyłącznie przy `labelPin === true` (brak klucza = OFF)');
  ok(LP?.isLabelPinActive?.({ hudLabels: true, labelHover: true, labelPin: true }) === true
    && LP?.isLabelPinActive?.({ hudLabels: true, labelPin: true }) === false && LP?.isLabelPinActive?.({ labelHover: true, labelPin: true }) === false,
    'P0c: przypięcie stoi na rozwinięciu T1 — wymaga `hudLabels`, `labelHover` i `labelPin`');
  ok(/\blabelPin:\s*true,/.test(strip(src('../../config/GameConfig.js'))), 'P0d: `FEATURES.labelPin: true` w GameConfig (do oglądania)');
  ok(LP?.PIN_SWAP_REASON === 'pin_swap' && LP?.LABEL_PIN?.LIST_LIMIT === 5, 'P0e: powód zamiany przypięcia `pin_swap`; limit listy 5 wierszy');
  const need1 = ['mapActionWorks', 'pinLabelPlacement', 'discExcess'];
  const missing1 = need1.filter((n) => typeof LP?.[n] !== 'function');
  ok(missing1.length === 0, `P0f: strojenie 1 — \`mapActionWorks\` (554), \`pinLabelPlacement\` i \`discExcess\` (zachowanie 5) (brak: ${missing1.join(', ') || '—'})`);
}

// ═══ Świat (stub) — prawdziwy `HudLayer` + `HudLabelLayer`, prawdziwe `BottomContext` i `StationPanel` ════════════════
const K = globalThis.window.KOSMOS ?? (globalThis.window.KOSMOS = {});
const mkCam = (pos, look = [0, 0, 0]) => { const c = new T3.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000); c.position.set(...pos); c.lookAt(...look); c.updateMatrixWorld(); return c; };
const viewOf = (cam) => ({ view: cam.matrixWorldInverse.elements.slice(), proj: cam.projectionMatrix.elements.slice(), fovDeg: 55, cssW: 1600, cssH: 1041, worldPerAU: 11 });
const BODIES = {
  star: { x: 0, y: 0, z: 0, r: 3.6 }, p_nz: { x: 6.2, y: 0, z: 0, r: 0.3 }, p_moon: { x: 6.7, y: 0, z: 0.25, r: 0.1 },
  st_1: { x: 6.55, y: 0, z: 0.05, r: 0.04 }, p_x: { x: -8, y: 0, z: 9, r: 0.25 }, p_fob: { x: -8.3, y: 0, z: 9.2, r: 0.05 },
  pd_1: { x: 9.5, y: 0, z: -2.0, r: 0.06 }, p_ai: { x: 4.0, y: 0, z: -6.0, r: 0.2 }, st_ai: { x: 4.3, y: 0, z: -6.1, r: 0.04 },
};
const DEP8 = ['Fe', 'Cu', 'Ti', 'Si', 'Ni', 'Al', 'Pt', 'Xe'].map((r, i) => ({ resourceId: r, richness: 0.9 - i * 0.1, totalAmount: 1000, remaining: 900 }));
const ENT = {
  star: { id: 'star', type: 'star', name: 'Kepler', spectralType: 'G', temperature: 5778, habitableZone: { min: 0.95, max: 1.37 } },
  p_nz: { id: 'p_nz', type: 'planet', planetType: 'rocky', name: 'Nowa Ziemia', explored: true, temperatureC: 13, atmosphere: 'breathable', deposits: DEP8.slice(0, 3), x: 220, y: 0, orbital: { a: 1 } },
  p_moon: { id: 'p_moon', type: 'moon', name: 'Nowy Księżyc', parentPlanetId: 'p_nz', explored: true, x: 226, y: 0, orbital: { a: 0.01 } },
  p_x: { id: 'p_x', type: 'planet', planetType: 'gas', name: 'Kepler-4799 h', explored: true, analyzed: true, deposits: DEP8, x: 400, y: 300, orbital: { a: 4 } },
  p_fob: { id: 'p_fob', type: 'moon', name: 'Fobos', parentPlanetId: 'p_x', explored: true, x: 404, y: 302, orbital: { a: 0.01 } },
  pd_1: { id: 'pd_1', type: 'planetoid', name: 'Nt', explored: false, deposits: [{ resourceId: 'Nt', richness: 0.9 }], temperatureC: -120, atmosphere: 'none', x: 330, y: -70, orbital: { a: 3 } },
  p_ai: { id: 'p_ai', type: 'planet', planetType: 'rocky', name: 'Akhernar h', explored: true, analyzed: true, x: 140, y: -210, orbital: { a: 2.3 } },
};
const mkCol = (pid, o = {}) => ({ planetId: pid, name: ENT[pid].name, planet: { id: pid, name: ENT[pid].name, systemId: 'sys_home' }, civSystem: { population: 400, freePops: 223 }, resourceSystem: {}, ...o });
const COLS = [mkCol('p_nz'), mkCol('p_moon'), mkCol('p_fob')];
const AI_COL = { planetId: 'p_ai', ownerEmpireId: 'emp_1', name: 'Twierdza Ligi', planet: { id: 'p_ai', name: 'Akhernar h' }, civSystem: { population: 55, freePops: 3 } };
const MODS = ['habitat', 'trade', 'lab', 'shipyard', 'habitat', 'trade', 'lab'].map((m, i) => ({ moduleType: m, active: i !== 2 }));
const STATIONS = [
  { id: 'st_1', type: 'station', name: 'Stacja Nowa Ziemia', bodyId: 'p_nz', pop: 10, popCapacity: 40, modules: MODS, ownerEmpireId: 'player', systemId: 'sys_home',
    ownerColonyId: 'p_nz', depot: { inventory: new Map() } },
  { id: 'st_ai', type: 'station', name: 'Bastion Ligi', bodyId: 'p_ai', pop: 5, popCapacity: 20, modules: MODS.slice(0, 2), ownerEmpireId: 'emp_1', systemId: 'sys_home',
    depot: { inventory: new Map([['Fe', 50]]) } },
];
const W0 = { cam: null, camEpoch: 1, lead: null, ids: [], entity: null, sim: 5000, vessels: [], sprites: {}, intel: {}, empIntel: { emp_1: 'contact' },
  hoverBody: null, onDisc: () => false, vesselAt: null, overlay: false, pool: null };
const LADDER = ['unknown', 'rumor', 'contact', 'detailed'];
const emits = [];
const capture = (n) => (e) => emits.push([n, e]);
for (const n of ['body:selected', 'body:deselected', 'station:selected', 'station:focus', 'planet:previewMap', 'planet:colonize']) EventBus.on(n, capture(n));
const lastOf = (n) => { for (let i = emits.length - 1; i >= 0; i--) if (emits[i][0] === n) return emits[i][1]; return undefined; };
const countOf = (n) => emits.filter((e) => e[0] === n).length;
const bottomContext = BCm?.BottomContext ? new BCm.BottomContext() : null;
const panelCalls = [];
const setWorld = () => {
  globalThis.innerWidth = 1600; globalThis.innerHeight = 1041;
  Object.assign(K, {
    civMode: true, activeSystemId: 'sys_home', uiScale: 1.25, planetGlobeOpen: false, uiPrefs: {}, homePlanet: ENT.p_nz,
    uiManager: {
      _cleanView: false, overlayManager: { isAnyOpen: () => W0.overlay, openPanel: (id, o) => panelCalls.push(['openPanel', id, o ?? null]) },
      getSelectedVesselIds: () => [...W0.ids], getSelectedVesselId: () => W0.lead,
      get _selectedEntity() { return W0.entity ? (ENT[W0.entity] ?? { id: W0.entity }) : null; }, getSelectedFleetId: () => null,
      setSelectedVesselId: (id) => { W0.lead = id; W0.ids = id ? [id] : []; }, addToSelection: (id) => { W0.ids.push(id); },
      _bottomContext: bottomContext, _mapSurface: () => null, _dirty: false,
    },
    overlayManager: { openPanel: (id, o) => panelCalls.push(['openPanel', id, o ?? null]) },
    threeRenderer: {
      _cleanView: false, _renderingEnabled: true, _contextLost: false, _pingedEnemyId: null, renderer: { getPixelRatio: () => 1.5 },
      get _hoverPlanetId() { return W0.hoverBody; }, _planets: new Map([['p_nz', {}], ['p_x', {}], ['p_ai', {}]]), _moons: new Map([['p_moon', {}], ['p_fob', {}]]),
      _stations: new Map([['st_1', {}], ['st_ai', {}]]),
      get _vessels() { return new Map(Object.keys(W0.sprites).map((id) => [id, { sprite: { visible: true } }])); },
      getCameraMoveEpoch: () => W0.camEpoch, getHudView: () => viewOf(W0.cam),
      getBodyWorldInfo: (id) => (BODIES[id] ? { ...BODIES[id] } : null),
      getStationWorldInfo: (id) => (BODIES[id] ? { ...BODIES[id] } : null),
      getVesselWorldPosition: (id) => (W0.sprites[id] ? { ...W0.sprites[id] } : null), getVesselWorldInfo: (id) => (W0.sprites[id] ? { ...W0.sprites[id], r: 0.02 } : null),
      _isOnBodyDisc: (x, y) => W0.onDisc(x, y), _getVesselAtScreen: () => W0.vesselAt,
    },
    entityManager: { get: (id) => ENT[id] ?? STATIONS.find((s) => s.id === id) ?? null, getByType: (ty) => Object.values(ENT).filter((e) => e.type === ty) },
    colonyManager: { getPlayerColonies: () => [...COLS], getAllColonies: () => [...COLS, AI_COL], activePlanetId: 'p_nz',
      getColony: (id) => COLS.find((c) => c.planetId === id) ?? (id === 'p_ai' ? AI_COL : null), hasColony: (id) => COLS.some((c) => c.planetId === id) || id === 'p_ai',
      switchActiveColony: (id) => panelCalls.push(['switchActiveColony', id]) },
    stationSystem: { getAllStations: () => [...STATIONS], getStationsAt: (bid) => STATIONS.filter((s) => s.bodyId === bid) },
    vesselManager: { getAllVessels: () => [...W0.vessels], getVessel: (id) => W0.vessels.find((v) => v.id === id) ?? null, isImmobilized: () => false,
      getVesselSensorRangeAU: () => 2.5 },
    missionSystem: { getActive: () => [] },
    systemPoolService: { getPoolSnapshot: () => W0.pool },
    groundUnitManager: { getUnitsOnPlanet: (id) => (W0.myUnitsOn === id ? [{ owner: 'player' }] : []) },
    intelSystem: { getVesselContact: (id) => (W0.intel[id] ? { quality: W0.intel[id] } : null),
      isAtLeast: (emp, lvl) => LADDER.indexOf(W0.empIntel[emp] ?? 'unknown') >= LADDER.indexOf(lvl) },
    empireRegistry: { get: (id) => (id === 'emp_1' ? { id, name: 'Liga Spalonej Drogi' } : null) },
    techSystem: { getMultiplier: () => 1 },
    timeSystem: { get simClockMs() { return W0.sim; }, gameTime: 120 },
    tacticalMode: { isActive: false },
    leftOutliner: { getReservedWidth: () => 150 }, rightOutliner: { getReservedWidth: () => 150 },
    tacticalDock: { getReservedHeight: () => 0 },
    starSystemManager: { switchActiveSystem: () => true },
  });
};
setWorld();
// Prawdziwy rejestr encji (lewy outliner i panel stacji czytają `EntityManager`, nie `K.entityManager`).
for (const e of [...Object.values(ENT), ...STATIONS]) EntityManagerReal.add(e);
FEATURES.hudLabels = true; FEATURES.labelHover = true; FEATURES.labelPin = true;
// Panel stacji — prawdziwy (stan „otwarty” = przypięcie stacji przy ON; cykl życia ze słuchaczy).
const stationPanel = SPm?.StationPanel ? new SPm.StationPanel() : null;
K.stationPanel = stationPanel;
// Spięcie `UIManager` (słuchacze — piny źródłowe w P12): zaznaczenie ciała + jedno przypięcie naraz.
EventBus.on('body:selected', ({ entity }) => { W0.entity = entity?.id ?? null; LP?.enforceSinglePinOnBody?.({ K, features: FEATURES }); });
EventBus.on('body:deselected', () => { W0.entity = null; });
EventBus.on('station:selected', () => { LP?.enforceSinglePinOnStation?.({ K, emit: (n, p) => EventBus.emit(n, p), features: FEATURES }); });
const mkCtx = () => {
  const o0 = { calls: [] };
  return new Proxy(o0, {
    get(o, p) { if (p === 'calls') return o.calls; if (Object.prototype.hasOwnProperty.call(o, p)) return o[p]; return (...a) => { o.calls.push([String(p), ...a]); }; },
    set(o, p, v) { o.calls.push(['=' + String(p), v]); o[p] = v; return true; },
  });
};
const mkHud = () => {
  const ctx = mkCtx(); const cv = { width: 0, height: 0, getContext: () => ctx };
  const lab = LLay?.HudLabelLayer ? new LLay.HudLabelLayer(null) : null;
  const hud = HL?.HudLayer && lab ? new HL.HudLayer(cv, { autoStart: false, sublayers: [lab] }) : null;
  if (lab && hud) lab._hud = hud;
  return { ctx, lab, hud, frame: (now) => (hud ? hud.frame(now) : null), dbg: () => lab?.debug?.() ?? null };
};
const CAM_WIDE = mkCam([2, 34, 22], [2, 0, 0]);                  // ~40 j. nad układem — wszystkie ciała stubu w kadrze
const CAM_FAR = mkCam([383.13, 204.12, 118.52]);                 // widok układu ~450 j. (stos Nowej Ziemi zwinięty)
const projLogical = (cam, p) => { const v = new T3.Vector3(p.x, p.y, p.z).project(cam); return { x: (v.x * 0.5 + 0.5) * 1600 / 1.25, y: (-v.y * 0.5 + 0.5) * 1041 / 1.25 }; };
const labelBy = (d, key) => d?.labels?.find((l) => l.key === key) ?? null;
const pinLabel = (d) => d?.labels?.find((l) => l.pinLabel === true) ?? null;
const pointAt = (H, lx, ly) => H.hud?.setPointer?.(lx, ly, lx * 1.25, ly * 1.25, false);
const clearHover = (H) => { W0.hoverBody = null; W0.vesselAt = null; W0.onDisc = () => false; if (H.hud) H.hud._pointer = null; };
const click = (H, x, y) => (H.hud?.handleClick ? H.hud.handleClick(x, y, x * 1.25, y * 1.25) : undefined);
const zoneOf = (d, kind, id = null) => d?.pin?.zones?.find((z) => z.kind === kind && (id == null || z.id === id)) ?? null;
const mid = (z) => ({ x: z.x + z.w / 2, y: z.y + z.h / 2 });
const reset = () => {
  W0.entity = null; W0.lead = null; W0.ids = []; W0.vessels = []; W0.sprites = {}; W0.intel = {}; W0.empIntel = { emp_1: 'contact' };
  W0.overlay = false; W0.pool = null; W0.myUnitsOn = null; emits.length = 0; panelCalls.length = 0;
  stationPanel?.hide?.(); if (stationPanel) stationPanel._stationId = null;
};
const selectBody = (id) => EventBus.emit('body:selected', { entity: ENT[id], focus: false });
const selectStation = (id) => EventBus.emit('station:selected', { stationId: id });

// ═══ P1 ══════════════════════════════════════════════════════════════════════
header('P1  przypięcie = zaznaczenie (klucz z `readClickSelection`, bez nowego pola stanu)');
{
  reset();
  ok(call(LP?.pinnedContentKey, { entityId: 'p_nz', stationId: null }) === 'body:p_nz' && call(LP?.pinnedContentKey, { entityId: null, stationId: 'st_1' }) === 'station:st_1'
    && call(LP?.pinnedContentKey, {}) === null && call(LP?.pinnedContentKey, { entityId: 'p_nz', stationId: 'st_1' }) === 'body:p_nz',
    'P1a: klucz przypięcia — ciało (`entityId`), stacja (`stationId`), brak — `null`; ciało przed stacją');
  selectBody('p_x');
  const s1 = call(CI?.readClickSelection, K) ?? {};
  ok(s1.entityId === 'p_x' && call(LP?.pinnedContentKey, s1) === 'body:p_x', 'P1b: 1. klik ciała (`body:selected`) — przypięcie = zaznaczone ciało (`_selectedEntity`)');
  selectStation('st_1');
  const s2 = call(CI?.readClickSelection, K) ?? {};
  ok(s2.stationId === 'st_1' && s2.entityId === null && call(LP?.pinnedContentKey, s2) === 'station:st_1',
    'P1c: 1. klik stacji (`station:selected`) — przypięcie = panel stacji „otwarty” (`visible` + `_stationId`), ciało zdjęte');
  const lay = strip(src('../../ui/HudLabelLayer.js'));
  const t2p = methodBody(lay, '_t2Prepare');
  ok(!!t2p && /pinnedContentKey\(sel\)/.test(t2p.body) && !/this\._pinned(Id|Key)\s*=/.test(lay),
    'P1d: warstwa wyprowadza przypięcie z zaznaczenia w każdej klatce (`pinnedContentKey(sel)`) — bez własnego pola „przypięty obiekt”');
  reset();
}

// ═══ P2 ══════════════════════════════════════════════════════════════════════
header('P2  strefy kliku: przycisk > etykieta > reszta przypięcia > tarcza');
{
  const zones = [{ kind: 'body', x: 0, y: 0, w: 100, h: 60 }, { kind: 'name', x: 0, y: 0, w: 100, h: 14 }, { kind: 'btn', id: 'close', x: 80, y: 40, w: 14, h: 14 }];
  ok(call(LP?.pinHitAt, zones, 85, 45)?.id === 'close' && call(LP?.pinHitAt, zones, 10, 5)?.kind === 'name' && call(LP?.pinHitAt, zones, 10, 30)?.kind === 'body'
    && call(LP?.pinHitAt, zones, 200, 200) === null, 'P2a: `pinHitAt` — przycisk, potem linia nazwy, potem reszta etykiety; poza — nic');
  reset(); W0.cam = CAM_WIDE; W0.camEpoch++;
  const H = mkHud();
  selectBody('p_x'); H.frame(1000); H.frame(1300);
  const d = H.dbg();
  const pl = pinLabel(d);
  ok(!!pl && (d?.pin?.buttons ?? []).includes('close') && (d?.pin?.zones ?? []).some((z) => z.kind === 'btn'),
    `P2 świadek: przypięta etykieta Kepler-4799 h z przyciskami ${JSON.stringify(d?.pin?.buttons ?? [])}`);
  // Punkt w środku przypiętej etykiety (poza przyciskami i nazwą) leży „na tarczy” — klik pochłonięty, bez zdarzeń.
  const body = zoneOf(d, 'body'), nameZ = zoneOf(d, 'name');
  const inner = body ? { x: body.x + 3, y: (nameZ ? nameZ.y + nameZ.h : body.y) + 2 } : { x: -1, y: -1 };
  W0.onDisc = () => true; emits.length = 0;
  const r0 = click(H, inner.x, inner.y);
  ok(r0 === true && emits.length === 0, `P2b: klik w pusty pasek przypięcia na tarczy — pochłonięty (${r0}), żadnego zdarzenia (nie idzie do mapy)`);
  const cz = zoneOf(d, 'btn', 'close');
  const r1 = cz ? click(H, mid(cz).x, mid(cz).y) : undefined;
  W0.onDisc = () => false;
  ok(r1 === true && countOf('body:deselected') === 1 && W0.entity === null, 'P2c: przycisk ✕ na tarczy — przycisk wygrywa z tarczą (odznaczenie)');
  // KONTROLA 487: zwykła (nieprzypięta) etykieta na tarczy dalej przegrywa z tarczą.
  H.frame(1400);
  const d2 = H.dbg();
  const zNz = (H.lab?._zones ?? []).find((z) => z.key === 'c:p_x' || z.key === 'c:p_fob' || z.key === 'g:p_x' || z.key === 'r:p_x' || z.key === 'c:p_nz' || z.key === 'r:p_nz' || z.key === 'g:p_nz');
  W0.onDisc = () => true;
  const r2 = zNz ? click(H, zNz.x + 2, zNz.y + 2) : 'brak strefy';
  W0.onDisc = () => false;
  ok(!pinLabel(d2) && r2 === false, `P2d KONTROLA: bez przypięcia etykieta na tarczy przegrywa z tarczą (487) — klik ${r2}`);
  // Kursor „rączki” nad przyciskiem przypięcia (`HudLayer.pinButtonAt` → `UIManager._detectHoverBtn`).
  selectBody('p_x'); H.frame(1500); H.frame(1800);
  const d3 = H.dbg();
  const rz = zoneOf(d3, 'btn', 'report'), nz3 = zoneOf(d3, 'name');
  ok(!!rz && H.hud?.pinButtonAt?.(mid(rz).x, mid(rz).y) === 'report' && H.hud?.pinButtonAt?.(nz3.x + 2, nz3.y + 2) == null && H.hud?.pinButtonAt?.(5, 5) == null
    && /if \(window\.KOSMOS\?\.hudLayer\?\.pinButtonAt\?\.\(x, y\) != null\) return 'pin';/.test(UIM),
    'P2e: przycisk pod kursorem (`pinButtonAt`) — „rączka” w `UIManager._detectHoverBtn`; linia nazwy i pusta mapa — nie');
  reset();
}

// ═══ P3 ══════════════════════════════════════════════════════════════════════
header('P3  1. / 2. klik z przypięciem (D-UI-5)');
{
  reset(); W0.cam = CAM_WIDE; W0.camEpoch++;
  const H = mkHud();
  H.frame(1000);
  const d0 = H.dbg();
  const zx = (H.lab?._zones ?? []).find((z) => String(z.key).startsWith('c:p_fob') || z.key === 'c:p_fob');
  ok(!!zx && !pinLabel(d0), 'P3 świadek: etykieta kolonii Fobos w kadrze, przypięcia brak');
  const r1 = zx ? click(H, zx.x + 2, zx.y + 2) : undefined;
  const e1 = lastOf('body:selected');
  ok(r1 === true && e1?.entity?.id === 'p_fob' && e1?.focus === false, `P3a KONTROLA (D-UI-5 bez zmian): 1. klik etykiety — zaznaczenie, kamera stoi (${JSON.stringify({ id: e1?.entity?.id, focus: e1?.focus })})`);
  H.frame(1100); H.frame(1400);
  const d1 = H.dbg();
  const pl = pinLabel(d1);
  ok(!!pl && pl.key === 'c:p_fob' && (d1?.pin?.ck === 'body:p_fob'), `P3b: przypięta etykieta przy swoim obiekcie (${pl?.key}) z wierszem akcji ${JSON.stringify(d1?.pin?.buttons ?? [])}`);
  const nz = zoneOf(d1, 'name');
  const n0 = countOf('body:selected');
  const r2 = nz ? click(H, nz.x + 2, nz.y + 2) : undefined;
  const e2 = lastOf('body:selected');
  ok(r2 === true && countOf('body:selected') === n0 + 1 && e2?.focus === true, 'P3c: 2. klik w linię nazwy przypiętej etykiety — kamera (`focus: true`)');
}

// ═══ P4 ══════════════════════════════════════════════════════════════════════
header('P4  jedno przypięcie naraz (ciało ↔ stacja)');
{
  reset();
  selectBody('p_nz');
  ok(W0.entity === 'p_nz' && !stationPanel?.visible, 'P4 świadek: przypięte ciało, panel stacji zamknięty');
  emits.length = 0;
  selectStation('st_1');
  const dz = lastOf('body:deselected');
  ok(stationPanel?.visible === true && stationPanel?._stationId === 'st_1' && W0.entity === null && dz?.reason === 'pin_swap',
    `P4a: przypięcie stacji zdejmuje przypięcie ciała — \`body:deselected { reason: 'pin_swap' }\`, panel stacji zostaje „otwarty” (${stationPanel?.visible})`);
  selectBody('p_x');
  ok(W0.entity === 'p_x' && stationPanel?.visible === false, 'P4b: przypięcie ciała chowa panel stacji');
  // KONTROLA: zwykłe odznaczenie (pustka, „−”) zamyka panel stacji jak dziś; `system_switch` — nie (486).
  selectStation('st_1'); EventBus.emit('body:deselected');
  const closedPlain = stationPanel?.visible === false;
  selectStation('st_1'); EventBus.emit('body:deselected', { reason: 'system_switch' });
  ok(closedPlain && stationPanel?.visible === true, 'P4c KONTROLA: odznaczenie bez powodu zamyka panel stacji, `system_switch` — nie (jak dziś)');
  // OFF — karta i panel niezależne (dziś): nic się nie zdejmuje.
  FEATURES.labelPin = false;
  reset(); selectBody('p_nz'); emits.length = 0; selectStation('st_1');
  ok(W0.entity === 'p_nz' && stationPanel?.visible === true && countOf('body:deselected') === 0, 'P4d: OFF — ciało i stacja razem (jak dziś)');
  FEATURES.labelPin = true;
  // Renderer: `pin_swap` zdejmuje zaznaczenie, nie kamerę (słuchacz wycięty ze źródła, wykonanie na atrapie).
  const iH = TR.indexOf("EventBus.on('body:deselected', safe((p) => {");
  const hb = iH > 0 ? TR.slice(iH, TR.indexOf('}));', iH)) : '';
  ok(/p\?\.reason === 'pin_swap'/.test(hb) && LP?.PIN_SWAP_REASON === 'pin_swap', 'P4e: renderer rozpoznaje `pin_swap` (literał = `PIN_SWAP_REASON`)');
  let handler = null;
  try { handler = new Function('EventBus', 'safe', 'S', hb.replace("EventBus.on('body:deselected', safe((p) => {", 'return (function (p) {') + '})'); } catch (e) { handler = null; console.log('    (' + e.message + ')'); }
  const mkR = () => ({ _selectedEntityId: 'p_nz', _pingedEnemyId: null, _focusEntityId: 'p_nz', _focusVesselId: null, _focusStationId: null, cmd: [],
    _colonyMarkers: { hide() {} }, _hideColonyTooltip() {}, _cameraController: { setMinDist(v) { this._v = v; } }, _hideAllPlanetoidOrbits() {}, _hideAllMoonOrbits() {}, _rebuildAllOrbits() {} });
  const fn = handler ? call(handler, null, (f) => f, (v) => v) : null;
  const rs = mkR(); const rp = mkR();
  if (fn) { call(() => fn.call(rs, { reason: 'pin_swap' })); call(() => fn.call(rp, undefined)); }
  ok(!!fn && rs._selectedEntityId === null && rs._focusEntityId === 'p_nz' && rs._cameraController._v === undefined
    && rp._focusEntityId === null && rp._cameraController._v === 0.3,
    'P4f: `pin_swap` — zaznaczenie ciała zdjęte, śledzenie kamery i jej próg bez zmian; KONTROLA: odznaczenie bez powodu — jak dziś (śledzenie kończy się)');
  reset();
}

// ═══ P5 ══════════════════════════════════════════════════════════════════════
header('P5  Esc w kaskadzie (po zaznaczeniu statku, przed overlayem)');
{
  const esc = (o = {}) => call(LP?.escapeUnpin, { K, emit: (n, p) => EventBus.emit(n, p), features: FEATURES, overlayOpen: false, modalOpen: false, ...o });
  reset(); selectBody('p_x'); emits.length = 0;
  ok(esc() === 'body' && countOf('body:deselected') === 1 && W0.entity === null, 'P5a: Esc — przypięte ciało zdjęte (`body:deselected` — jak „−” karty)');
  reset(); selectStation('st_1');
  ok(esc() === 'station' && stationPanel?.visible === false, 'P5b: Esc — przypięta stacja zdjęta (✕ panelu stacji)');
  reset(); selectBody('p_x');
  ok(esc({ overlayOpen: true }) === null && W0.entity === 'p_x', 'P5c: przy otwartym overlayu Esc należy do overlayu — przypięcie zostaje');
  ok(esc({ modalOpen: true }) === null && W0.entity === 'p_x', 'P5d: nad oknem DOM (raport ciała) — przypięcie zostaje (okno zamyka własny Esc)');
  FEATURES.labelPin = false;
  ok(esc() === null && W0.entity === 'p_x', 'P5e: OFF — Esc nie dotyka karty ciała (jak dziś — 534 przy OFF zostaje)');
  FEATURES.labelPin = true;
  reset();
  ok(esc() === null, 'P5f: bez przypięcia — nic (Esc idzie dalej: menu ☰)');
  // Kolejność w `GameScene`: picker → menu PPM → zaznaczenie statku → PRZYPIĘCIE → overlay → okno potwierdzenia → menu ☰.
  const iKey = GS.indexOf("if (e.key === 'Escape') {\n        if (um?.isPickerActive?.())");
  const iVes = GS.indexOf('um.clearSelection();', iKey);
  const iPin = GS.indexOf('escapeUnpin({', iKey);
  const iOv = GS.indexOf('if (this.uiManager.overlayManager.isAnyOpen()) {', iKey);
  const iMenu = GS.indexOf('this.uiManager._bottomBar.toggleMenu();', iKey);
  ok(iKey > 0 && iVes > iKey && iPin > iVes && iOv > iPin && iMenu > iOv,
    `P5g: \`GameScene\` — krok przypięcia PO zaznaczeniu statku i PRZED overlayem / menu ☰ (${iVes} < ${iPin} < ${iOv} < ${iMenu})`);
  const pinCall = iPin > 0 ? GS.slice(iPin, GS.indexOf('return;', iPin)) : '';
  ok(/overlayOpen:\s*um\?\.overlayManager\?\.isAnyOpen\?\.\(\)\s*===\s*true/.test(pinCall) && /modalOpen:\s*!!document\.querySelector\('\.mission-modal-overlay, \.kosmos-modal-overlay'\)/.test(pinCall),
    'P5h: krok przypięcia dostaje stan overlayu i okna DOM (`.kosmos-modal-overlay` — raport ciała)');
  // Okno DOM (raport ciała z przypięcia) — Esc należy do okna: kaskada mapy stoi (bez tego otwierało się menu ☰ — zmierzone w grze).
  ok(call(LP?.escapeHeldByModal, { K, features: FEATURES, domModalOpen: true }) === true && call(LP?.escapeHeldByModal, { K, features: FEATURES, domModalOpen: false }) === false
    && call(LP?.escapeHeldByModal, { K, features: { ...FEATURES, labelPin: false }, domModalOpen: true }) === false,
    'P5i: okno DOM otwarte — Esc należy do okna (kaskada mapy stoi); bez okna albo przy OFF — kaskada jak dziś');
  const iRcm = GS.indexOf('rcm.hide();', iKey), iMod = GS.indexOf('escapeHeldByModal({', iKey);
  ok(iRcm > iKey && iMod > iRcm && iMod < iVes && /domModalOpen: !!document\.querySelector\('\.kosmos-modal-overlay'\)/.test(GS.slice(iMod, iMod + 260)),
    `P5j: \`GameScene\` — strażnik okna DOM po menu PPM, PRZED zaznaczeniem statku i przypięciem (${iRcm} < ${iMod} < ${iVes})`);
}

// ═══ P6 ══════════════════════════════════════════════════════════════════════
header('P6  przełączenie układu zdejmuje przypięcie spoza układu (486 / 491)');
{
  reset();
  selectBody('p_x');
  const r1 = call(CI?.syncBodyCardOnSystemSwitch, ENT.p_x, 'sys_044', (n, p) => EventBus.emit(n, p));
  ok(r1 === 'deselect' && W0.entity === null && call(LP?.pinnedContentKey, call(CI?.readClickSelection, K)) === null,
    'P6a: ciało spoza układu docelowego — przypięcie zdjęte (`body:deselected { reason: system_switch }`)');
  selectBody('p_x');
  const r2 = call(CI?.syncBodyCardOnSystemSwitch, ENT.p_x, 'sys_home', (n, p) => EventBus.emit(n, p));
  ok(r2 === 'reselect' && W0.entity === 'p_x', 'P6b KONTROLA (486 bez zmian): ciało z układu docelowego — zaznaczenie (przypięcie) zostaje');
  reset(); selectStation('st_1');
  const r3 = call(CI?.syncStationPanelOnSystemSwitch, STATIONS[0], 'sys_044', () => stationPanel.hide());
  ok(r3 === 'close' && call(LP?.pinnedContentKey, call(CI?.readClickSelection, K)) === null, 'P6c: stacja spoza układu docelowego — przypięcie zdjęte (491)');
  ok(/syncStationPanelOnSystemSwitch\(sp\._station\?\.\(\) \?\? null, systemId/.test(UIM) && /syncBodyCardOnSystemSwitch\(this\._selectedEntity, systemId/.test(UIM),
    'P6d KONTROLA: `UIManager` stosuje obie reguły przy `system:switched` (stan przypięcia = stan karty i panelu — bez zmian)');
  reset();
}

// ═══ P7 ══════════════════════════════════════════════════════════════════════
header('P7  `readClickSelection` z przypięcia i ✕');
{
  reset();
  selectBody('p_nz');
  const s1 = call(CI?.readClickSelection, K);
  ok(call(CI?.resolveClickIntent, { type: 'body', id: 'p_nz', entity: ENT.p_nz, systemId: 'sys_home' }, s1) === 'focus'
    && call(CI?.resolveClickIntent, { type: 'body', id: 'p_x', entity: ENT.p_x, systemId: 'sys_home' }, s1) === 'select',
    'P7a KONTROLA (bez nowego pola stanu): zaznaczone ciało = bieżące zaznaczenie — klik w nie: `focus`, w inne: `select`');
  selectStation('st_1');
  const s2 = call(CI?.readClickSelection, K);
  ok(call(CI?.resolveClickIntent, { type: 'station', id: 'st_1', systemId: 'sys_home' }, s2) === 'focus' && s2.entityId === null,
    'P7b: przypięta stacja = bieżące zaznaczenie — klik w nią: `focus` (kamera)');
  ok(call(LP?.runPinAction, 'close', { ck: 'station:st_1', K, emit: (n, p) => EventBus.emit(n, p) }) === 'close' && stationPanel?.visible === false,
    'P7c: ✕ stacji = `StationPanel._onHit({ type: \'close\' })` (dzisiejsze ✕ panelu)');
  selectBody('p_x'); emits.length = 0;
  ok(call(LP?.runPinAction, 'close', { ck: 'body:p_x', entity: ENT.p_x, K, emit: (n, p) => EventBus.emit(n, p) }) === 'close'
    && countOf('body:deselected') === 1 && lastOf('body:deselected')?.reason === undefined && W0.entity === null,
    'P7d: ✕ ciała = `body:deselected` bez powodu (dzisiejsze „−” karty — renderer kończy śledzenie)');
  const dl = (e) => call(LP?.homeDistanceLine, e, K, { distAU: () => 1.86, fmt: (d) => d.toFixed(2), t: tx });
  ok(dl(ENT.p_x)?.text === tx('ui.distShort', '1.86') && dl({ ...ENT.p_x, systemId: 'sys_044' }) === null && dl(ENT.p_nz) === null && dl(ENT.star) === null,
    'P7e: „Odl:” od domu (B3, lustro karty) — tylko ciało z układu domu (inny układ: współrzędne lokalne — bez linii); dom i gwiazda — bez linii');
  reset();
}

// ═══ P8 ══════════════════════════════════════════════════════════════════════
header('P8  „Mapa ciała” — 4 warianty karty (prawdziwe `BottomContext._doAction`)');
{
  // Każdy wariant: przycisk przypięcia → `_bottomContext._doAction(entity)` (spy), a prawdziwe `_doAction` daje dzisiejszy cel.
  const spyCalls = [];
  const realDo = bottomContext?._doAction?.bind(bottomContext);
  if (bottomContext) bottomContext._doAction = (e) => { spyCalls.push(e?.id); return realDo?.(e); };
  const run = (id) => { panelCalls.length = 0; emits.length = 0; return call(LP?.runPinAction, 'map', { ck: 'body:' + id, entity: ENT[id], K, emit: (n, p) => EventBus.emit(n, p) }); };
  reset();
  run('p_nz');
  ok(spyCalls.at(-1) === 'p_nz' && JSON.stringify(panelCalls) === '[["switchActiveColony","p_nz"],["openPanel","colony",null]]',
    `P8a: (i) własna kolonia — \`switchActiveColony\` + \`openPanel('colony')\` (${JSON.stringify(panelCalls)})`);
  W0.myUnitsOn = 'p_ai';
  run('p_ai');
  ok(spyCalls.at(-1) === 'p_ai' && JSON.stringify(panelCalls) === '[["openPanel","colony",{"colonyId":"p_ai"}]]',
    `P8b: (ii) obca kolonia z moimi wojskami — \`openPanel('colony', { colonyId })\` (${JSON.stringify(panelCalls)})`);
  W0.myUnitsOn = null;
  run('p_x');
  ok(spyCalls.at(-1) === 'p_x' && countOf('planet:previewMap') === 1 && lastOf('planet:previewMap')?.planet?.id === 'p_x' && panelCalls.length === 0,
    'P8c: (iii) ciało `analyzed` bez kolonii — `planet:previewMap` (jedyny producent podglądu) — SEDNO');
  run('p_ai');
  ok(countOf('planet:previewMap') === 1 && lastOf('planet:previewMap')?.planet?.id === 'p_ai' && panelCalls.length === 0,
    'P8d: (iii) obca kolonia BEZ moich wojsk (`analyzed`) — podgląd, nie własna kolonia (Obserwacja UX OG-3 §3)');
  K.civMode = false;
  const gen = { id: 'g1', type: 'planet', name: 'Eden', lifeScore: 90 };
  ENT.g1 = gen; run('g1'); delete ENT.g1;
  ok(countOf('planet:colonize') === 1 && lastOf('planet:colonize')?.planet?.id === 'g1', 'P8e: (iv) Generator (życie > 80) — `planet:colonize`');
  K.civMode = true;
  // Przycisk istnieje dokładnie wtedy, gdy karta dziś ma akcję (`bodyCardAction` = lustro `_actionLabel` — K8 T1); nazwa z klucza karty.
  const btnIds = (id) => (call(LP?.bodyPinButtons, ENT[id], K, { t: tx }) ?? []).map((b) => b.id);
  const label = (id) => (call(LP?.bodyPinButtons, ENT[id], K, { t: tx }) ?? []).find((b) => b.id === 'map')?.label;
  const cardLabel = (e) => call(bottomContext?._actionLabel?.bind(bottomContext), e);
  const table = ['p_nz', 'p_moon', 'p_x', 'p_ai', 'pd_1', 'star'];
  const agree = table.every((id) => btnIds(id).includes('map') === !!cardLabel(ENT[id]));
  ok(agree && !btnIds('pd_1').includes('map') && !btnIds('star').includes('map') && label('p_nz') === tx('context.openMap').replace(/^►\s*/, ''),
    `P8f: „Mapa ciała” wtedy i tylko wtedy, gdy karta ma akcję (tabela ${table.length} ciał); nazwa z \`context.openMap\` bez „► ” („${label('p_nz')}”)`);
  // STROJENIE 1 (554): przycisk tylko wtedy, gdy `_doAction` coś zrobi. Obca kolonia BEZ moich wojsk i BEZ pełnego skanu — karta
  // (OFF) ma dla niej akcję, a `_doAction` nic nie robi (martwy przycisk) ⇒ przy ON przycisku brak; karta przy OFF bez zmian.
  ENT.p_ai2 = { id: 'p_ai2', type: 'planet', planetType: 'rocky', name: 'Wezen g', explored: true, analyzed: false, x: 500, y: 120, orbital: { a: 3.5 } };
  const AI_COL2 = { planetId: 'p_ai2', ownerEmpireId: 'emp_1', name: 'Placówka Ligi', planet: { id: 'p_ai2', name: 'Wezen g' }, civSystem: { population: 12, freePops: 1 } };
  const cm = K.colonyManager, getCol0 = cm.getColony, hasCol0 = cm.hasColony;
  cm.getColony = (id) => (id === 'p_ai2' ? AI_COL2 : getCol0(id)); cm.hasColony = (id) => id === 'p_ai2' || hasCol0(id);
  const effect = (e) => { panelCalls.length = 0; emits.length = 0; call(realDo, e); return panelCalls.length + countOf('planet:previewMap') + countOf('planet:colonize'); };
  reset();
  const dead = effect(ENT.p_ai2);
  ok(!btnIds('p_ai2').includes('map') && call(LP?.mapActionWorks, ENT.p_ai2, K) === false,
    `P8g: (554) obca kolonia bez moich wojsk i bez pełnego skanu — „Mapa ciała” ukryta (przyciski ${JSON.stringify(btnIds('p_ai2'))})`);
  ok(dead === 0 && !!cardLabel(ENT.p_ai2), `P8h KONTROLA (świadek): karta ciała (OFF) ma dla niej akcję („${cardLabel(ENT.p_ai2)}”), a prawdziwe \`_doAction\` nic nie robi (${dead} skutków) — karta przy OFF bez zmian`);
  W0.myUnitsOn = 'p_ai2';
  const troops = effect(ENT.p_ai2), btnTroops = btnIds('p_ai2').includes('map');
  W0.myUnitsOn = null; ENT.p_ai2.analyzed = true;
  const scan = effect(ENT.p_ai2), btnScan = btnIds('p_ai2').includes('map');
  ENT.p_ai2.analyzed = false;
  ok(btnTroops && troops > 0 && btnScan && scan > 0, `P8i: ta sama kolonia z moimi wojskami (${troops} skutek) albo z pełnym skanem (${scan}) — przycisk jest (wariant (ii) / (iii))`);
  // Lustro na tabeli ciał: przycisk ⇔ skutek prawdziwego `_doAction` (własne kolonie, obca ze skanem i bez, ciało ze skanem i bez, gwiazda).
  const rows = ['p_nz', 'p_moon', 'p_x', 'p_ai', 'p_ai2', 'pd_1', 'star'].map((id) => [id, btnIds(id).includes('map'), effect(ENT[id]) > 0]);
  ok(rows.every(([, b, e]) => b === e), `P8j: „Mapa ciała” ⇔ skutek \`_doAction\` (${rows.map(([i, b, e]) => `${i}:${b ? 'P' : '-'}${e ? 'S' : '-'}`).join(' ')})`);
  cm.getColony = getCol0; cm.hasColony = hasCol0; delete ENT.p_ai2;
  if (bottomContext) bottomContext._doAction = realDo;
  reset();
}

// ═══ P9 ══════════════════════════════════════════════════════════════════════
header('P9  „Raport” → `BodyDetailModal`');
{
  const shown = [];
  ok(call(LP?.runPinAction, 'report', { ck: 'body:p_x', entity: ENT.p_x, K, showReport: (e) => shown.push(e?.id) }) === 'report' && shown[0] === 'p_x',
    'P9a: „Raport” woła otwieracz raportu z encją ciała');
  const ids = (id) => (call(LP?.bodyPinButtons, ENT[id], K, { t: tx }) ?? []).map((b) => b.id);
  ok(ids('p_x').includes('report') && ids('pd_1').includes('report') && !ids('star').includes('report') && ids('star').join() === 'close',
    'P9b: raport dla każdego ciała poza gwiazdą (`BodyDetailModal` nie opisuje gwiazdy) — gwiazda: sam ✕');
  // Warstwa: klik prawdziwego przycisku → prawdziwy `showBodyDetailModal` (okno DOM `.kosmos-modal-overlay` w `document.body`).
  reset(); W0.cam = CAM_WIDE; W0.camEpoch++;
  const H = mkHud();
  selectBody('p_x'); H.frame(1000); H.frame(1300);
  const rz = zoneOf(H.dbg(), 'btn', 'report');
  const before = document.body.children.length;
  const r = rz ? click(H, mid(rz).x, mid(rz).y) : undefined;
  const added = document.body.children.slice(before);
  ok(r === true && added.some((el) => el?.className === 'kosmos-modal-overlay'), `P9c: klik „Raport” na warstwie — okno \`BodyDetailModal\` w dokumencie (${added.length} el.)`);
  ok(/import \{ showBodyDetailModal \} from '\.\/BodyDetailModal\.js';/.test(strip(src('../../ui/HudLabelLayer.js'))), 'P9d: warstwa importuje `showBodyDetailModal` (okno Atlasu — orbita, fizyka, skład, złoża, ✏)');
  for (const el of added) document.body.removeChild(el);
  reset();
}

// ═══ P10 ═════════════════════════════════════════════════════════════════════
header('P10 listy z limitem, akordeon, stacja obca');
{
  const L = call(LP?.limitRows, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], tx) ?? {};
  ok(L.rows?.length === 6 && L.rows[4] === 'e' && L.rows[5] === tx('fleet.manifestMore', 3) && L.more === 3, `P10a: 8 wierszy → 5 + „${tx('fleet.manifestMore', 3)}”`);
  const L2 = call(LP?.limitRows, ['a', 'b'], tx) ?? {};
  ok(L2.rows?.length === 2 && L2.more === 0, 'P10b: do 5 wierszy — bez „więcej”');
  const st = call(LP?.toggleOpenList, null, 'station:st_1', 'traffic');
  const st2 = call(LP?.toggleOpenList, st, 'station:st_1', 'modules');
  const st3 = call(LP?.toggleOpenList, st2, 'station:st_1', 'modules');
  ok(st?.list === 'traffic' && st2?.list === 'modules' && st3?.list === null && call(LP?.openListFor, st2, 'station:st_2') === null,
    'P10c: akordeon — jedna lista naraz, ponowny klik zamyka, inne przypięcie — żadna');
  // Warstwa: stacja gracza z 8 statkami w doku i 7 modułami — przyciski list, ruch rozwinięty z limitem.
  reset(); W0.cam = CAM_WIDE; W0.camEpoch++;
  W0.vessels = Array.from({ length: 8 }, (_, i) => ({ id: 'v' + i, name: 'Kurier ' + i, systemId: 'sys_home', position: { dockedAt: 'st_1', state: 'docked' } }));
  const H = mkHud();
  selectStation('st_1'); H.frame(1000); H.frame(1300);
  const d0 = H.dbg();
  ok((d0?.pin?.buttons ?? []).join() === 'manage,list:traffic,list:modules,close', `P10d: stacja gracza — Zarządzaj, ruch, moduły, ✕ (magazyn wspólny z matką bez puli — bez listy): ${JSON.stringify(d0?.pin?.buttons)}`);
  const tz = zoneOf(d0, 'btn', 'list:traffic');
  const r = tz ? click(H, mid(tz).x, mid(tz).y) : undefined;
  H.frame(1400);
  const d1 = H.dbg();
  const pl = pinLabel(d1);
  const items = (pl?.text ?? []).filter((s) => s.startsWith('· '));
  const more = (pl?.text ?? []).includes(tx('fleet.manifestMore', 3));
  ok(r === true && d1?.pin?.open === 'traffic' && items.length === 5 && more && items[0].includes('Kurier 0') && items[0].includes(tx('station.statusDocked')),
    `P10e: „Handel ▼” — lista ruchu (jedyny konsument \`gatherStationTraders\`): 5 wierszy + „${tx('fleet.manifestMore', 3)}”`);
  ok((pl?.text ?? []).some((s) => s.includes(`${tx('station.traders')} ▲`)), 'P10f: otwarta lista — przycisk z ▲');
  const mz = zoneOf(d1, 'btn', 'list:modules');
  if (mz) click(H, mid(mz).x, mid(mz).y);
  H.frame(1500);
  const d2 = H.dbg();
  const mods = (pinLabel(d2)?.text ?? []).filter((s) => s.startsWith('· '));
  ok(d2?.pin?.open === 'modules' && mods.length === 5 && !(pinLabel(d2)?.text ?? []).some((s) => s.includes('Kurier')), 'P10g: drugi przycisk listy — akordeon (moduły zamiast ruchu)');
  // Magazyn: pula hubu → lista pozycji sumy.
  W0.pool = { byBody: [{ colony: COLS[0] }, { colony: COLS[1] }], total: new Map([['Fe', 120], ['Cu', 30.5], ['Ti', 0]]) };
  H.lab._pinCache = null; W0.camEpoch++; H.frame(1600);
  ok((H.dbg()?.pin?.buttons ?? []).includes('list:storage'), 'P10h: pula hubu — przycisk „Magazyn” (lista sumy puli)');
  const rows = call(LP?.storageRows, { mother: COLS[0], pool: W0.pool, label: (i) => i, fmt: (n) => String(n) }) ?? [];
  ok(rows.join('|') === 'Fe: 120|Cu: 30.5' && (call(LP?.storageRows, { mother: COLS[0], pool: null }) ?? [1]).length === 0,
    'P10i: wiersze magazynu — pozycje > 0; matka bez puli — bez listy');
  // Stacja obca — sam ✕ (mgła wojny: bez ruchu, modułów i magazynu).
  reset(); W0.camEpoch++;
  selectStation('st_ai'); H.frame(1700); H.frame(2000);
  const da = H.dbg();
  ok((da?.pin?.buttons ?? []).join() === 'close' && !!pinLabel(da), `P10j: stacja obca — przypięcie z samym ✕ (${JSON.stringify(da?.pin?.buttons)})`);
  reset();
}

// ═══ P11 ═════════════════════════════════════════════════════════════════════
header('P11 przypięta etykieta przy swoim obiekcie (I8.3)');
{
  reset(); W0.cam = CAM_FAR; W0.camEpoch++;
  const H = mkHud();
  H.frame(1000);
  const g0 = labelBy(H.dbg(), 'g:p_nz');
  ok(!!g0 && g0.text[0] === 'NOWA ZIEMIA +2', `P11 świadek: z daleka stos zwinięty „${g0?.text?.[0]}”`);
  selectBody('p_nz'); H.frame(1100); H.frame(1400);
  const d1 = H.dbg();
  const pl = pinLabel(d1), rest = labelBy(d1, 'g:p_nz');
  ok(!!pl && pl.key === 'c:p_nz' && pl.text[0] === 'NOWA ZIEMIA' && !!rest && rest.text[0] === 'NOWY KSIĘŻYC +1',
    `P11a: przypięty członek stosu — własna etykieta „${pl?.text?.[0]}”, reszta „${rest?.text?.[0]}” (+N rozkłada się dla przypięcia)`);
  const zr = (H.lab?._zones ?? []).find((z) => z.key === 'g:p_nz');
  emits.length = 0;
  if (zr) click(H, zr.x + 2, zr.y + 2);
  ok(lastOf('body:selected')?.entity?.id === 'p_moon', 'P11b: klik „NOWY KSIĘŻYC +1” — zaznacza księżyc (obiekt, który etykieta nazywa), nie przypiętą kotwicę');
  selectBody('p_nz'); H.frame(1500); H.frame(1800);
  const a = pinLabel(H.dbg());
  // Kilka klatek z drobnym ruchem kamery — przypięta stoi na swoim kandydacie (strona, poziom), idzie za obiektem.
  const cands = [];
  for (let i = 0; i < 4; i++) { W0.cam = mkCam([383.13 + i * 0.4, 204.12, 118.52 - i * 0.3]); W0.camEpoch++; H.frame(1900 + i * 20); const p = pinLabel(H.dbg()); cands.push(`${p?.side}${p?.below ? 'v' : '^'}${p?.cand}`); }
  ok(!!a && new Set(cands).size === 1, `P11c: ruch kamery — przypięta stoi na swoim kandydacie (${cands.join(', ')})`);
  W0.cam = CAM_FAR; W0.camEpoch++; H.frame(2000);
  const b0 = pinLabel(H.dbg());
  const dz = zoneOf(H.dbg(), 'btn', 'list:deposits');
  if (dz) click(H, mid(dz).x, mid(dz).y);
  H.frame(2100);
  // Strojenie 1 (wariant 2 — decyzja właściciela): pasek rośnie w dół jak przy najechaniu; mała tarcza — bez przesunięcia.
  const d2 = H.dbg(), b1 = pinLabel(d2), dz1 = zoneOf(d2, 'btn', 'list:deposits');
  const iList = (b1?.text ?? []).findIndex((s) => s.startsWith('· ')), iBtn = (b1?.text ?? []).findIndex((s) => s.startsWith('[ '));
  ok(!!b0 && !!b1 && b1.h > b0.h && b1.y === b0.y && b1.x === b0.x
    && !!dz && !!dz1 && dz1.y === dz.y && iBtn > 0 && iList > iBtn,
    `P11d: mała tarcza — otwarta lista złóż: etykieta rośnie w dół (${b0?.h} → ${b1?.h} px), linia nazwy i wiersz przycisków stoją, lista pod przyciskami`);
  // Sąsiad ustępuje przypiętej (rozkład z przypięciem jako przeszkodą) — czysta funkcja.
  const rect = { x: 150, y: 28, w: 980, h: 742.8 };
  const pinned = { key: 'pin', ax: 600, ay: 400, clear: 0, w: 120, h: 90, prio: 0, pin: { cand: 0, baseH: 17 } };
  const nb = { key: 'nb', ax: 612, ay: 404, clear: 0, w: 60, h: 17, prio: 2 };
  const res = call(LH?.placeLabelsPinned, [pinned, nb], { rect, obstacles: [], prev: new Map([['nb', 0]]) })?.placed ?? [];
  const P = res.find((p) => p.key === 'pin'), N = res.find((p) => p.key === 'nb');
  ok(!!P && !!N && (LL?.rectOverlapArea?.(P, N, 0) ?? 1) === 0 && N.cand !== 0, `P11e KONTROLA (rozkład T1 z przypięciem): sąsiad ustępuje przypiętej (kandydat ${N?.cand}, bez nakładania)`);
  // Przypięty sąsiad T1 (najechany — rośnie w dół), którego przypięte miejsce wchodzi na przypiętą etykietę T2, ustępuje
  // (`yieldToPinnedLabel` przed `placeLabelsPinned`); KONTROLA — sam rozkład T1 kładzie obie na sobie (k04, pierwszy przebieg w grze).
  const pinT2 = { key: 'pin', ax: 600, ay: 400, clear: 0, w: 140, h: 70, prio: 0, pinLabel: true, pin: { cand: 0, baseH: 17 } };
  const hovNb = { key: 'hov', ax: 606, ay: 360, clear: 0, w: 120, h: 60, prio: -1, expanded: true, pin: { cand: 0, baseH: 17 } };
  const farNb = { key: 'far', ax: 900, ay: 200, clear: 0, w: 120, h: 60, prio: 2, expanded: true, pin: { cand: 0, baseH: 17 } };
  const byK = (arr, k) => (arr ?? []).find((q) => q.key === k) ?? null;
  const raw = call(LH?.placeLabelsPinned, [pinT2, hovNb, farNb], { rect, obstacles: [] })?.placed ?? [];
  const ovRaw = byK(raw, 'pin') && byK(raw, 'hov') ? (LL?.rectOverlapArea?.(byK(raw, 'pin'), byK(raw, 'hov'), 0) ?? 0) : 0;
  ok(ovRaw > 0, `P11h KONTROLA: sam rozkład T1 — przypięty sąsiad staje na przypiętej etykiecie (nakładanie ${Math.round(ovRaw)} px²)`);
  const yl = call(LP?.yieldToPinnedLabel, [pinT2, hovNb, farNb], { rect }) ?? [];
  const res2 = call(LH?.placeLabelsPinned, yl, { rect, obstacles: [] })?.placed ?? [];
  const P2 = byK(res2, 'pin'), Hv = byK(res2, 'hov'), Fr = byK(res2, 'far'), Pr = byK(raw, 'pin'), Fw = byK(raw, 'far');
  ok(!!P2 && !!Hv && !!Fr && !!Pr && !!Fw && (LL?.rectOverlapArea?.(P2, Hv, 0) ?? 1) === 0 && P2.x === Pr.x && P2.y === Pr.y && Hv.yieldedToPin === true
    && !byK(yl, 'hov')?.pin && !!byK(yl, 'far')?.pin && Fr.yieldedToPin !== true && Fr.x === Fw.x && Fr.y === Fw.y,
    `P11i: przypięta stoi (${P2?.x},${P2?.y}), najechany sąsiad ustępuje (${byK(raw, 'hov')?.x},${byK(raw, 'hov')?.y} → ${Hv?.x},${Hv?.y}), daleki zostaje przypięty`);
  // Warstwa (kamera ~10 j. od Nowej Ziemi, mała tarcza): przypięcie Nowej Ziemi — linia nazwy bez zmian; potem najechana stacja
  // obok — jej rozwinięcie (przypięte położenie T1, rośnie w dół) weszłoby na przypiętą; stacja ustępuje, obie stoją.
  // KONTROLA — wejście rozkładu tej klatki bez kroku T2 kładzie obie na sobie. (Strojenie 1, wariant 2: scena jak w T2.)
  {
    reset();
    const look = [6.4, 0, 0.1], el = 0.6, az = 1, dist = 10;
    W0.cam = mkCam([look[0] + dist * Math.cos(el) * Math.cos(az), dist * Math.sin(el), look[2] + dist * Math.cos(el) * Math.sin(az)], look); W0.camEpoch++;
    const H3 = mkHud();
    H3.frame(1000);
    const nz0 = labelBy(H3.dbg(), 'c:p_nz');
    selectBody('p_nz'); H3.frame(1100); H3.frame(1400);
    const pBefore = pinLabel(H3.dbg());
    const zs = (H3.lab?._zones ?? []).find((z) => z.key === 's:st_1');
    if (zs) pointAt(H3, zs.x + zs.w / 2, zs.y + zs.h / 2);
    H3.frame(1500);
    const inp = H3.lab?._lastPlaceInput ?? null;
    const rawL = inp ? (call(LH?.placeLabelsPinned, inp.items, { rect: inp.rect, obstacles: inp.obstacles })?.placed ?? []) : [];
    const rp = rawL.find((q) => q.pinLabel === true), rs = byK(rawL, 's:st_1');
    const ovL = rp && rs ? (LL?.rectOverlapArea?.(rp, rs, 0) ?? 0) : 0;
    H3.frame(1700); H3.frame(1900);
    const dj = H3.dbg();
    const pj = pinLabel(dj), sj = labelBy(dj, 's:st_1');
    H3.frame(2100);
    const sj2 = labelBy(H3.dbg(), 's:st_1');
    ok(!!zs && !!sj && (sj.text?.length ?? 0) >= 3 && !!pj && ovL > 0,
      `P11j KONTROLA (świadek): najechana stacja rozwinięta (${sj?.text?.length} linii), a rozkład T1 bez kroku T2 kładzie ją na przypiętej (nakładanie ${Math.round(ovL)} px²)`);
    ok(!!nz0 && !!pBefore && !!pj && pBefore.y === nz0.y && pBefore.x === nz0.x && pj.x === pBefore.x && pj.y === pBefore.y
      && !!sj && !!sj2 && (LL?.rectOverlapArea?.(pj, sj, 0) ?? 1) === 0 && sj2.x === sj.x && sj2.y === sj.y,
      `P11k: mała tarcza — po przypięciu linia nazwy bez zmian (${nz0?.x},${nz0?.y} → ${pBefore?.x},${pBefore?.y}); najechana stacja ustępuje (${sj?.x},${sj?.y}) i stoi, przypięta stoi`);
    reset();
  }
  // Najechanie zwiniętej reszty stosu „NOWY KSIĘŻYC +1” rozwija głowę RESZTY (księżyc), nie przypiętą kotwicę (lustro `collect`).
  W0.cam = CAM_FAR; W0.camEpoch++; clearHover(H);
  selectBody('p_nz'); H.frame(2150); H.frame(2180);
  const zg = (H.lab?._zones ?? []).find((z) => z.key === 'g:p_nz');
  if (zg) pointAt(H, zg.x + zg.w / 2, zg.y + zg.h / 2);
  H.frame(2200); H.frame(2500);
  const dg = H.dbg(), gg = labelBy(dg, 'g:p_nz');
  ok(!!zg && !!gg && (gg.text?.length ?? 0) >= 3 && (dg?.expanded ?? []).includes('body:p_moon'),
    `P11m: najechana reszta stosu „${gg?.text?.[0]}” — rozwinięcie księżyca (${gg?.text?.length} linii; rozwinięte ${JSON.stringify(dg?.expanded ?? [])})`);
  clearHover(H); H.frame(3000);
  ok(/const placeItems = T2 \? yieldToPinnedLabel\(items, \{ rect: map \}\) : items;/.test(strip(src('../../ui/HudLabelLayer.js')))
    && /for \(const p of placed\) if \(p\.yieldedToPin\) this\._pins\.delete\(p\.key\);\s*updatePins\(this\._pins, placed, expandedKeys\);/.test(strip(src('../../ui/HudLabelLayer.js'))),
    'P11l: warstwa — krok „ustąp przypiętej” przed rozkładem T1, a etykieta, która ustąpiła, zapomina dawne przypięcie położenia');
  // ── STROJENIE 1 (zachowanie 5, wariant 2): pasek rośnie w dół jak przy najechaniu; nadmiar nad tarczą — w górę dokładnie o tyle;
  // bez miejsca w kadrze — pod tarczę ─────────────────────────────────────────────────────────────────────────────────────
  const hoverBodyAt = (Hh, id) => { const p = projLogical(W0.cam, BODIES[id]); W0.hoverBody = id; pointAt(Hh, p.x, p.y); return p; };
  const camAround = (look, dist, el, az) => mkCam([look[0] + dist * Math.cos(el) * Math.cos(az), dist * Math.sin(el), look[2] + dist * Math.cos(el) * Math.sin(az)], look);
  const discOf = (Hh, id) => (Hh.lab?._last?.obstacles ?? []).find((o) => o.id === id) ?? null;
  // Nadmiar liczony TU niezależnie od produktu (najbliższy punkt prostokąta, potem górna krawędź tarczy w pasie etykiety).
  const excessOf = (b, d) => {
    if (!b || !d || !(d.r > 0)) return NaN;
    const nx = Math.max(b.x, Math.min(d.cx, b.x + b.w)), ny = Math.max(b.y, Math.min(d.cy, b.y + b.h));
    if ((d.cx - nx) ** 2 + (d.cy - ny) ** 2 >= d.r * d.r) return 0;
    const dx = Math.max(b.x - d.cx, 0, d.cx - (b.x + b.w));
    return Math.max(0, b.y + b.h - (d.cy - Math.sqrt(d.r * d.r - dx * dx)));
  };
  // Etykiety z ostatniej klatki BEZ zaokrągleń (`debug()` zaokrągla do 0,1 px) — porównania położeń co do 1e-6.
  const rawLab = (Hh, key) => (Hh.lab?._last?.labels ?? []).find((l) => l.key === key) ?? null;
  const rawPin = (Hh) => (Hh.lab?._last?.labels ?? []).find((l) => l.pinLabel === true) ?? null;
  const rd = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : v);
  // Mała tarcza — kolonia AI (etykieta na żądanie, jak P1 arkusza): najechanie, potem przypięcie — linia nazwy bez zmian.
  {
    reset(); W0.cam = CAM_WIDE; W0.camEpoch++;
    const H4 = mkHud(); H4.frame(1000);
    hoverBodyAt(H4, 'p_ai'); H4.frame(1100); H4.frame(1400);
    const hvT = labelBy(H4.dbg(), 'h:p_ai'), hv = rawLab(H4, 'h:p_ai');
    selectBody('p_ai'); H4.frame(1500); H4.frame(1800);
    const pn = rawPin(H4);
    ok(!!hv && (hvT?.text?.length ?? 0) >= 3 && !!pn && pn.key === 'h:p_ai' && pn.h > hv.h && pn.x === hv.x && pn.y === hv.y,
      `P11n: mała tarcza — przypięcie po najechaniu bez skoku: linia nazwy (${rd(hv?.x)}, ${rd(hv?.y)}) → (${rd(pn?.x)}, ${rd(pn?.y)}), pasek rośnie w dół (${rd(hv?.h)} → ${rd(pn?.h)} px)`);
    reset();
  }
  // Duża tarcza — Nowa Ziemia z bliska (~3 j.): najechanie (rozwinięcie T1 rośnie w dół), potem przypięcie — przesunięcie w górę
  // DOKŁADNIE o nadmiar nad tarczą (`discExcess` liczony tu niezależnie: pasek z miejsca najechania z wysokością przypięcia).
  {
    reset(); W0.cam = camAround([6.2, 0, 0], 3, 0.5, Math.PI / 2); W0.camEpoch++;
    const H5 = mkHud(); H5.frame(1000);
    hoverBodyAt(H5, 'p_nz'); H5.frame(1100); H5.frame(1400);
    const hvT = labelBy(H5.dbg(), 'c:p_nz'), hv = rawLab(H5, 'c:p_nz');
    selectBody('p_nz'); H5.frame(1500); H5.frame(1800);
    const pn = rawPin(H5);
    const disc = discOf(H5, 'p_nz');
    const ex = excessOf(pn && hv ? { x: pn.x, y: hv.y, w: pn.w, h: pn.h } : null, disc);
    ok(!!hv && (hvT?.text?.length ?? 0) >= 3 && !!disc && disc.r >= 50 && ex > 10,
      `P11o KONTROLA (świadek): duża tarcza (r ${Math.round(disc?.r ?? 0)} px) — pasek przypięcia z miejsca najechania wszedłby na nią o ${Math.round(ex)} px`);
    ok(!!pn && Math.abs(pn.y - (hv.y - ex)) < 1e-6 && Math.abs(pn.pinShift - ex) < 1e-6 && pn.x === hv.x && pn.cand === hv.cand
      && excessOf(pn, disc) < 1e-6,
      `P11p: duża tarcza — przesunięcie w górę = nadmiar (${pn ? Math.round((hv.y - pn.y) * 10) / 10 : '?'} px = ${Math.round(ex * 10) / 10} px), tarcza odkryta, ta sama strona i kandydat`);
    // Lista złóż otwarta — nadmiar rośnie o wysokość listy: przesunięcie znów = nadmiar; zwinięta — wraca na miejsce.
    const dz = zoneOf(H5.dbg(), 'btn', 'list:deposits');
    if (dz) click(H5, mid(dz).x, mid(dz).y);
    H5.frame(1900);
    const pl = rawPin(H5);
    const exL = excessOf(pl && hv ? { x: pl.x, y: hv.y, w: pl.w, h: pl.h } : null, disc);
    const dz2 = zoneOf(H5.dbg(), 'btn', 'list:deposits');
    if (dz2) click(H5, mid(dz2).x, mid(dz2).y);
    H5.frame(2000);
    const pc = rawPin(H5);
    ok(!!pl && pl.h > pn.h && Math.abs(pl.y - (hv.y - exL)) < 1e-6 && excessOf(pl, disc) < 1e-6 && !!pc && pc.y === pn.y && pc.h === pn.h,
      `P11q: lista złóż otwarta — przesunięcie = nadmiar (${Math.round(exL)} px), tarcza odkryta; zwinięta — etykieta wraca (${rd(pc?.y)} = ${rd(pn?.y)})`);
    reset();
  }
  // Rozwinięcie NAJECHANIA (T1) z tą samą regułą (dopełnienie strojenia 1, scena P1d arkusza): przy pojawieniu się nad dużą
  // tarczą — w górę dokładnie o nadmiar, RAZ (przypięcie położenia zapamiętane — po ruchu kamery bez ponownego przesuwania,
  // I8.3); KONTROLA — przy `labelPin` OFF (T1) rozwinięcie rośnie w dół od linii nazwy i wchodzi na tarczę.
  {
    const hoverScene = (pinOn) => {
      FEATURES.labelPin = pinOn;
      reset(); W0.cam = camAround([6.2, 0, 0], 3, 0.5, Math.PI / 2); W0.camEpoch++;
      const Hh = mkHud(); Hh.frame(1000);
      const c0 = rawLab(Hh, 'c:p_nz');
      hoverBodyAt(Hh, 'p_nz'); Hh.frame(1100); Hh.frame(1400);
      const hv = rawLab(Hh, 'c:p_nz'), pin0 = Hh.lab?._pins?.get?.('c:p_nz') ?? null, disc = discOf(Hh, 'p_nz');
      W0.cam = camAround([6.2, 0, 0], 2.6, 0.5, Math.PI / 2); W0.camEpoch++;   // bliżej — większa tarcza
      hoverBodyAt(Hh, 'p_nz'); Hh.frame(1500); Hh.frame(1600);
      const pin1 = Hh.lab?._pins?.get?.('c:p_nz') ?? null, disc1 = discOf(Hh, 'p_nz');
      FEATURES.labelPin = true;
      return { c0, hv, disc, pin0, pin1, disc1 };
    };
    const off = hoverScene(false), on = hoverScene(true);
    const exOff = excessOf(off.hv, off.disc);
    const exStart = excessOf(on.c0 && on.hv ? { x: on.hv.x, y: on.c0.y, w: on.hv.w, h: on.hv.h } : null, on.disc);
    ok(!!off.c0 && !!off.hv && off.hv.expanded === true && off.hv.y === off.c0.y && exOff > 0,
      `P11z KONTROLA: \`labelPin\` OFF (T1) — rozwinięcie najechania rośnie w dół od linii nazwy i wchodzi na dużą tarczę (${Math.round(exOff)} px)`);
    ok(!!on.c0 && !!on.hv && on.hv.expanded === true && exStart > 0 && Math.abs(on.hv.y - (on.c0.y - exStart)) < 1e-6 && excessOf(on.hv, on.disc) < 1e-6,
      `P11za: rozwinięcie najechania (scena P1d) — w górę dokładnie o nadmiar (${Math.round(exStart)} px), tarcza odkryta`);
    ok(!!on.pin0 && !!on.pin1 && on.pin0.cand === on.pin1.cand && on.pin0.baseH === on.pin1.baseH && (on.disc1?.r ?? 0) > (on.disc?.r ?? Infinity),
      `P11zb: reguła raz przy pojawieniu się rozwinięcia — po ruchu kamery (tarcza r ${Math.round(on.disc?.r ?? 0)} → ${Math.round(on.disc1?.r ?? 0)} px) przypięcie położenia bez zmian`);
    reset();
  }
  // Brak miejsca na przesunięcie (duża tarcza przy górnej krawędzi kadru) — pod tarczę, rośnie w dół.
  {
    reset(); W0.cam = mkCam([6.2, 3, 1.5 + 1.5], [6.2, 0, 1.5]); W0.camEpoch++;
    const H6 = mkHud(); H6.frame(1000);
    hoverBodyAt(H6, 'p_nz'); H6.frame(1100); H6.frame(1400);
    const hv = rawLab(H6, 'c:p_nz');
    selectBody('p_nz'); H6.frame(1500); H6.frame(1800);
    const pn = rawPin(H6), pnT = pinLabel(H6.dbg());
    const disc = discOf(H6, 'p_nz'), rect = H6.lab?._lastPlaceInput?.rect ?? null;
    const ex = excessOf(pn && hv ? { x: pn.x, y: hv.y, w: pn.w, h: pn.h } : null, disc);
    ok(!!hv && hv.below === false && !!rect && ex > 0 && hv.y - ex < rect.y + (LL?.HUD_LABELS?.EDGE ?? 3),
      `P11r KONTROLA (świadek): duża tarcza przy górnej krawędzi — przesunięcie o nadmiar (${Math.round(ex)} px) wyszłoby nad kadr`);
    ok(!!pn && pn.below === true && pn.y >= (disc?.cy ?? Infinity) && excessOf(pn, disc) < 1e-6
      && (pnT?.text ?? []).findIndex((s) => s.startsWith('[ ')) > 0,
      `P11s: pod tarczę — etykieta pod tarczą (górna krawędź ${rd(pn?.y)} pod środkiem ${rd(disc?.cy)}), tarcza odkryta, rośnie w dół`);
    reset();
  }
  // Stacja przy ~4 j. nad tarczą Nowej Ziemi, lista handlu otwarta (8 statków w doku) — tarcza gospodarza odkryta.
  {
    reset();
    W0.vessels = Array.from({ length: 8 }, (_, i) => ({ id: 'v' + i, name: 'Kurier ' + i, systemId: 'sys_home', position: { dockedAt: 'st_1', state: 'docked' } }));
    W0.cam = camAround([6.2, 0, 0], 4, 0.5, Math.PI); W0.camEpoch++;
    const H7 = mkHud();
    H7.frame(1000);
    const s0 = rawLab(H7, 's:st_1');
    selectStation('st_1'); H7.frame(1100); H7.frame(1400);
    const e0 = H7.dbg(), q0 = rawPin(H7), tz0 = zoneOf(e0, 'btn', 'list:traffic');
    if (tz0) click(H7, mid(tz0).x, mid(tz0).y);
    H7.frame(1500); H7.frame(1600);
    const q1 = rawPin(H7);
    const disc = discOf(H7, 'p_nz');
    const ex0 = excessOf(q0 && s0 ? { x: q0.x, y: s0.y, w: q0.w, h: q0.h } : null, disc);
    const ex1 = excessOf(q1 && s0 ? { x: q1.x, y: s0.y, w: q1.w, h: q1.h } : null, disc);
    ok(!!s0 && !!disc && disc.r >= 40 && ex0 > 0 && ex1 > ex0,
      `P11t KONTROLA (świadek): stacja przy ~4 j. nad tarczą Nowej Ziemi (r ${Math.round(disc?.r ?? 0)} px) — pasek z miejsca etykiety stacji wszedłby na tarczę (${Math.round(ex0)} / z listą ${Math.round(ex1)} px)`);
    ok(!!q0 && !!q1 && Math.abs(q0.y - (s0.y - ex0)) < 1e-6 && Math.abs(q1.y - (s0.y - ex1)) < 1e-6 && excessOf(q0, disc) < 1e-6 && excessOf(q1, disc) < 1e-6
      && q1.side === s0.side,
      `P11u: przypięta stacja (bez listy i z listą handlu) — przesunięcie = nadmiar nad tarczą gospodarza (${Math.round(ex0)} / ${Math.round(ex1)} px), tarcza odkryta`);
    reset();
  }
  // Czysta funkcja `pinLabelPlacement` / `discExcess`.
  {
    const R0 = LL?.HUD_LABELS ?? {};
    const rect = { x: 150, y: 28, w: 980, h: 742.8 };
    const P = (o, opt) => call(LP?.pinLabelPlacement, o, rect, opt) ?? null;
    const it = { ax: 600, ay: 400, clear: 10, w: 120, h: 90 };
    const small = P(it, { pin: { cand: 0, baseH: 17 } });
    const top0 = LL?.labelCandidates?.({ ...it, h: 17 })?.[0]?.y;
    ok(small?.cand === 0 && small.baseH === 17 && small.shift === 0 && small.y === top0 && small.clean === true,
      'P11v: mała tarcza — kandydat i wysokość bazowa przypięcia bez zmian (pasek rośnie w dół od górnej krawędzi T1, przesunięcie 0)');
    const bigIt = { ...it, clear: 80 };
    const big = P(bigIt, { pin: { cand: 0, baseH: 17 } });
    const bTop0 = LL?.labelCandidates?.({ ...bigIt, h: 17 })?.[0]?.y;
    const bEx = excessOf({ x: big?.x, y: bTop0, w: it.w, h: it.h }, { cx: 600, cy: 400, r: 80 });
    const prodEx = call(LP?.discExcess, { x: big?.x, y: bTop0, w: it.w, h: it.h }, { cx: 600, cy: 400, r: 80 });
    const enc = LL?.labelCandidates?.({ ...bigIt, h: big?.baseH })?.[big?.cand]?.y;
    ok(!!big && bEx > 0 && Math.abs(prodEx - bEx) < 1e-9 && Math.abs(big.shift - bEx) < 1e-9 && Math.abs(big.y - (bTop0 - bEx)) < 1e-9 && Math.abs(enc - big.y) < 1e-9 && big.start?.baseH === 17,
      `P11w: duża tarcza — przesunięcie = nadmiar (${Math.round((big?.shift ?? 0) * 10) / 10} px); przypięcie kodowane wysokością bazową (${Math.round((big?.baseH ?? 0) * 10) / 10}) jak w rozkładzie; start bez przesunięcia`);
    const flip = P({ ...bigIt, ay: 120 }, { pin: { cand: 0, baseH: 17 } });
    ok(flip?.flipped === true && flip.cand >= 2 * R0.LEVELS && excessOf({ x: flip.x, y: flip.y, w: it.w, h: it.h }, { cx: 600, cy: 120, r: 80 }) === 0,
      `P11x: brak miejsca na przesunięcie w kadrze — pod tarczę (kandydat ${flip?.cand})`);
    const host = P({ ax: 600, ay: 400, clear: 0, w: 120, h: 90 }, { pin: { cand: 1, baseH: 17 }, keepOut: [{ cx: 560, cy: 420, r: 40 }] });
    const hTop0 = LL?.labelCandidates?.({ ax: 600, ay: 400, clear: 0, w: 120, h: 17 })?.[1]?.y;
    const noPin = P(it, { baseH: 17 });
    ok(host?.cand === 1 && host.shift > 0 && Math.abs(host.y - (hTop0 - host.shift)) < 1e-9 && noPin?.cand === 0 && noPin.shift === 0
      && call(LP?.discExcess, { x: 0, y: 0, w: 10, h: 10 }, { cx: 100, cy: 100, r: 5 }) === 0,
      `P11y: tarcza gospodarza (keepOut) — przesunięcie po stronie przypięcia (${Math.round((host?.shift ?? 0) * 10) / 10} px); bez przypięcia — pierwszy kandydat mieszczący się w kadrze`);
  }
  // Karta UI nad warstwą (panel statku przy outlinerze) zasłania przypięte miejsce — etykieta przenosi się obok karty (raz).
  reset(); W0.cam = CAM_WIDE; W0.camEpoch++;
  const H2 = mkHud();
  selectBody('p_x'); H2.frame(3000); H2.frame(3300);
  const q0 = pinLabel(H2.dbg());
  W0.camEpoch++; H2.frame(3400);
  const q0b = pinLabel(H2.dbg());
  const card = q0 ? { x: q0.x - 4, y: q0.y - 4, w: q0.w + 8, h: q0.h + 8 } : null;
  K.uiManager._fleetOverlay = { _vesselPanelRect: card }; K.uiManager._mapSurface = () => 'vessel';
  W0.camEpoch++; H2.frame(3500);
  const q1 = pinLabel(H2.dbg());
  W0.camEpoch++; H2.frame(3600);
  const q2 = pinLabel(H2.dbg());
  delete K.uiManager._fleetOverlay; K.uiManager._mapSurface = () => null;
  ok(!!q0 && !!q0b && q0b.x === q0.x && q0b.y === q0.y, 'P11f KONTROLA: bez karty przypięta stoi (ta sama pozycja w kolejnej klatce)');
  ok(!!q1 && !!card && (LL?.rectOverlapArea?.(q1, card, 0) ?? 1) === 0 && !!q2 && q2.x === q1.x && q2.y === q1.y,
    `P11g: panel statku zasłania przypiętą — etykieta przenosi się obok karty (${q0?.x},${q0?.y} → ${q1?.x},${q1?.y}) i znów stoi`);
  reset();
}

// ═══ P12 ═════════════════════════════════════════════════════════════════════
header('P12 karta ciała i panel stacji przy ON — nierysowane i nieklikalne (piny na wywołaniach)');
{
  const bce = methodBody(UIM, '_bodyCardEntity');
  let fBce = null, fSurf = null;
  const sps = methodBody(UIM, '_stationPanelSurface');
  try { fBce = new Function('GAME_CONFIG', 'isLabelHoverActive', 'isLabelPinActive', 'bodyCardAction', 'window', `return function () {${bce?.body}\n};`); } catch (e) { console.log('    (' + e.message + ')'); }
  try { fSurf = new Function('GAME_CONFIG', 'isLabelPinActive', 'window', `return function () {${sps?.body}\n};`); } catch (e) { console.log('    (' + e.message + ')'); }
  const mk = (feat, civ) => {
    const G = { FEATURES: feat };
    const win = { KOSMOS: { ...K, civMode: civ } };
    const b = fBce ? fBce(G, LH?.isLabelHoverActive, LP?.isLabelPinActive, LH?.bodyCardAction, win) : null;
    const s = fSurf ? fSurf(G, LP?.isLabelPinActive, win) : null;
    return { b: (e) => (b ? b.call({ _selectedEntity: e }) : undefined), s: () => (s ? s.call({}) : undefined) };
  };
  const ON = mk({ hudLabels: true, labelHover: true, labelPin: true }, true);
  const OFF = mk({ hudLabels: true, labelHover: true }, true);
  const GEN = mk({ hudLabels: true, labelHover: true, labelPin: true }, false);
  ok(ON.b(ENT.p_nz) === null && ON.b(ENT.p_x) === null && OFF.b(ENT.p_nz) === ENT.p_nz && OFF.b(ENT.pd_1) === null && GEN.b(ENT.p_nz) === ENT.p_nz,
    'P12a: `_bodyCardEntity` — przy ON karta ciała nie istnieje (każde ciało); KONTROLA: OFF — jak T1 (karta dla ciała z akcją); Generator — jak dziś');
  ok(ON.s() === false && OFF.s() === true && GEN.s() === true, 'P12b: `_stationPanelSurface` — przy ON panel stacji nie jest powierzchnią; OFF i Generator — jest');
  const gated = (re) => re.test(UIM);
  ok(gated(/if \(civMode && !globeOpen && this\._stationPanelSurface\(\)\) this\.stationPanel\.draw\(ctx, W, H\);/)
    && gated(/if \(this\._stationPanelSurface\(\) && this\.stationPanel\?\.handleClick\?\.\(x, y\)\) return true;/)
    && gated(/if \(this\._stationPanelSurface\(\) && this\.stationPanel\?\.visible && this\.stationPanel\._hitTest\(x, y\)\) return true;/)
    && (UIM.match(/this\._stationPanelSurface\(\) && this\.stationPanel\?\.visible && this\.stationPanel\._hitTest\(x, y\)/g) ?? []).length === 2
    && gated(/if \(this\._stationPanelSurface\(\) && this\.stationPanel\?\.visible && this\.stationPanel\.tryBeginDrag\?\.\(x, y\)\) return;/)
    && gated(/if \(this\._stationPanelSurface\(\) && this\.stationPanel\?\.visible\) this\.stationPanel\.handleMouseMove\(x, y\);/),
    'P12c: panel stacji — rysunek, klik, blokada kamery, podpowiedź mapy, przeciąganie i najechanie za `_stationPanelSurface()`');
  const cardUses = UIM.match(/this\._bottomContext\.(draw|hitTest|isOver|handleWheel)\([^)]*\)/g) ?? [];
  ok(cardUses.length === 4 && cardUses.every((s) => /_bodyCardEntity\(\)|cardEntity/.test(s)), `P12d KONTROLA (T1): karta ciała — rysunek, klik, kursor i kółko z \`_bodyCardEntity()\` (${cardUses.length})`);
  ok(/enforceSinglePinOnBody\(\{ K: window\.KOSMOS, features: GAME_CONFIG\.FEATURES \}\)/.test(UIM)
    && /EventBus\.on\('station:selected', \(\) => \{\n\s*if \(enforceSinglePinOnStation\(/.test(UIM),
    'P12e: `UIManager` — jedno przypięcie naraz w słuchaczach `body:selected` i `station:selected`');
  ok(/if \(p\?\.reason === PIN_SWAP_REASON\) return;/.test(SPsrc), 'P12f: `StationPanel` nie zamyka się przy `pin_swap` (panel = przypięcie stacji)');
  // Strefy kart w etykietach: panel stacji przy ON nie jest przeszkodą (prostokąt z dawnej klatki).
  const lay = strip(src('../../ui/HudLabelLayer.js'));
  ok(/const spDrawn = !\(isLabelPinActive\(GAME_CONFIG\.FEATURES\) && K\?\.civMode\);/.test(lay), 'P12g: etykiety nie omijają niewidocznego panelu stacji');
}

// ═══ P13 ═════════════════════════════════════════════════════════════════════
header('P13 wejścia I3 → przypięcie');
{
  // Karta ciała — wejścia (I3 §3.1): wszystkie kończą się `body:selected` (zaznaczenie = przypięcie).
  const has = (s, re) => re.test(s);
  const OBS = strip(src('../../ui/ObservatoryOverlay.js')), ELO = strip(src('../../ui/EventLogOverlay.js'));
  ok(has(TR, /clickObject\(\{ type: 'body', id: entity\.id, entity, systemId: sys \}, env\);/), 'P13a KONTROLA wejścia: mapa 3D — tarcza ciała (`clickObject` body)');
  reset();
  const lo = LOm?.LeftOutliner ? new LOm.LeftOutliner() : null;
  emits.length = 0;
  call(lo?._onHit?.bind(lo), { type: 'body', bodyId: 'p_x' }, 0, 0, K);
  ok(lastOf('body:selected')?.entity?.id === 'p_x' && W0.entity === 'p_x', 'P13b KONTROLA wejścia: lewy outliner — wiersz ciała (wykonanie) → przypięcie');
  emits.length = 0;
  call(lo?._onHit?.bind(lo), { type: 'queue', bodyId: 'p_nz' }, 0, 0, K);
  ok(lastOf('body:selected')?.entity?.id === 'p_nz', 'P13c KONTROLA wejścia: lewy outliner — ⏳N (wykonanie) → przypięcie');
  ok(has(strip(src('../../ui/HudLabelLayer.js')), /clickObject\(z\.target, \{ K, emit: \(n, p\) => EventBus\.emit\(n, p\) \}\);/), 'P13d KONTROLA wejścia: etykieta HUD (także na żądanie i zwinięta grupa) → `clickObject`');
  ok(has(TR, /if \(entity\) EventBus\.emit\('body:selected', \{ entity \}\);/) && has(TR, /const pdEntry = this\._planetoids\.get\(dockedAt\);/),
    'P13e KONTROLA wejścia: 2. klik w statek zadokowany przy planecie / księżycu / planetoidzie (`vessel:focus` — prawy outliner, Dok taktyczny, Tab) → `body:selected` hangaru');
  ok(has(ELO, /EventBus\.emit\('body:selected', \{ entity \}\)/), 'P13f KONTROLA wejścia: Dziennik — wpis → `body:selected` (przypięcie pod overlayem, widoczne po zamknięciu)');
  ok(has(OBS, /EventBus\.emit\('body:selected', \{ entity \}\)/), 'P13g KONTROLA wejścia: Obserwatorium — katalog → `body:selected`');
  ok((GS.match(/EventBus\.emit\('body:selected', \{ entity: (civPlanet|homePlanet) \}\)/g) ?? []).length >= 3, 'P13h KONTROLA wejścia: start partii / intro → `body:selected` domu');
  reset(); selectBody('p_x');
  const rs = call(CI?.syncBodyCardOnSystemSwitch, ENT.p_x, 'sys_home', (n, p) => EventBus.emit(n, p));
  ok(rs === 'reselect' && lastOf('body:selected')?.focus === false && W0.entity === 'p_x', 'P13i KONTROLA wejścia: przełączenie układu — ciało z układu docelowego zostaje przypięte (`focus: false`)');
  // Panel stacji — wejścia (I3 §3.4).
  ok(has(TR, /clickObject\(\{ type: 'station', id: sid, systemId: sys \}, env\);/), 'P13j KONTROLA wejścia: mapa 3D — model stacji (`clickObject` station)');
  reset(); emits.length = 0;
  call(lo?._onHit?.bind(lo), { type: 'station', stationId: 'st_1', systemId: 'sys_home' }, 0, 0, K);
  ok(lastOf('station:selected')?.stationId === 'st_1' && stationPanel?.visible === true, 'P13k KONTROLA wejścia: lewy outliner — wiersz stacji (wykonanie) → przypięcie stacji');
  ok(has(TR, /EventBus\.emit\('station:focus', \{ stationId: dockedAt \}\);/), 'P13l KONTROLA wejścia: 2. klik w statek zadokowany przy stacji — `station:focus` (kamera, bez panelu — jak dziś)');
  // Warstwa: każde z wejść daje przypiętą etykietę z wierszem akcji (dla wykonania — ciało z lewego outlinera).
  reset(); W0.cam = CAM_WIDE; W0.camEpoch++;
  const H = mkHud();
  call(lo?._onHit?.bind(lo), { type: 'body', bodyId: 'pd_1' }, 0, 0, K);
  H.frame(1000); H.frame(1300);
  const d = H.dbg();
  ok(pinLabel(d)?.key === 'h:pd_1' && (d?.pin?.buttons ?? []).join() === 'report,close',
    `P13m: ciało bez etykiety stałej (planetoida z lewego outlinera) — etykieta na żądanie z przypięciem: ${JSON.stringify(d?.pin?.buttons)}`);
  // STROJENIE 1 (b) — potwierdzenie (bez naprawy): 1. klik w wiersz ciała z INNEGO układu — zaznaczenie bez przełączania układu,
  // wiersz podświetlony jak zaznaczenie (U2, D-UI-10); przypięcia w kadrze brak, dopóki ciało nie jest w scenie; 2. klik —
  // przełączenie układu i kamera (reguła §7.8), przypięcie bez zmian.
  {
    reset();
    ENT.p_far = { id: 'p_far', type: 'planet', planetType: 'rocky', name: 'Thuban b', explored: true, analyzed: true, systemId: 'sys_061', x: 300, y: 40, orbital: { a: 2 } };
    EntityManagerReal.add(ENT.p_far);
    const sw = [], ss0 = K.starSystemManager.switchActiveSystem;
    K.starSystemManager.switchActiveSystem = (id) => { sw.push(id); return true; };
    W0.cam = CAM_WIDE; W0.camEpoch++;
    const H6 = mkHud();
    emits.length = 0;
    call(lo?._onHit?.bind(lo), { type: 'body', bodyId: 'p_far', systemId: 'sys_061' }, 0, 0, K);
    const e1 = lastOf('body:selected'), sel1 = call(CI?.readClickSelection, K) ?? {};
    H6.frame(1000); H6.frame(1300);
    const d6 = H6.dbg();
    ok(e1?.entity?.id === 'p_far' && e1?.focus === false && sw.length === 0 && sel1.entityId === 'p_far' && sel1.activeSystemId === 'sys_home',
      'P13n: (b) 1. klik w wiersz ciała z innego układu — zaznaczenie, układ i kamera stoją');
    // Wiersz: prawdziwe `_drawBodyRow` na atrapie ctx — tło zaznaczenia (`THEME.accentMed`); KONTROLA — bez zaznaczenia tła brak.
    const rowFill = (sel) => {
      const calls = [];
      const ctx = { measureText: (s) => ({ width: String(s).length * 6 }), fillText() {}, fillRect(...a) { calls.push([ctx.fillStyle, ...a]); } };
      call(lo?._drawBodyRow?.bind(lo), ctx, { x: 0, y: 0, w: 150 }, 40, { id: 'p_far', name: 'Thuban b', depth: 0, recognized: true, systemId: 'sys_061' }, sel);
      return calls.some((q) => q[0] === (THEME.accentMed ?? 'rgba(0,255,180,0.13)') && q[1] === 0 && q[2] === 40);
    };
    ok(rowFill(sel1) === true && rowFill({ ...sel1, entityId: null }) === false,
      'P13o: (b) wiersz zaznaczonego ciała z innego układu podświetlony jak zaznaczenie (U2, D-UI-10); KONTROLA — bez zaznaczenia tła brak');
    ok(!pinLabel(d6) && d6?.pin?.ck === 'body:p_far' && (d6?.pin?.zones ?? []).length === 0,
      'P13p: (b) ciało spoza sceny — przypięcie zapamiętane (`body:p_far`), etykiety przypięcia w kadrze brak (pojawi się po przełączeniu)');
    emits.length = 0;
    call(lo?._onHit?.bind(lo), { type: 'body', bodyId: 'p_far', systemId: 'sys_061' }, 0, 0, K);
    ok(sw.join() === 'sys_061' && lastOf('body:selected')?.focus === true && W0.entity === 'p_far',
      `P13q: (b) 2. klik w ten sam wiersz — przełączenie układu (${sw.join()}) i kamera (\`focus: true\`), przypięcie bez zmian (§7.8)`);
    K.starSystemManager.switchActiveSystem = ss0;
    EntityManagerReal.remove('p_far'); delete ENT.p_far;
  }
  reset();
}

// ═══ P14 ═════════════════════════════════════════════════════════════════════
header('P14 budżet: treść przypięcia z pamięci, spoczynek');
{
  reset(); W0.cam = CAM_WIDE; W0.camEpoch++;
  W0.vessels = Array.from({ length: 3 }, (_, i) => ({ id: 'v' + i, name: 'Kurier ' + i, systemId: 'sys_home', position: { dockedAt: 'st_1', state: 'docked' } }));
  const H = mkHud();
  selectStation('st_1');
  let n = 0;
  const realGet = K.vesselManager.getAllVessels;
  K.vesselManager.getAllVessels = () => { n++; return realGet(); };
  H.frame(1000);
  const n1 = n;
  for (let i = 1; i <= 10; i++) { W0.camEpoch++; H.frame(1000 + i * 16); }   // 10 przerysowań w 160 ms (< TTL treści)
  const nPin = n - n1;
  K.vesselManager.getAllVessels = realGet;
  const dW = H.dbg();
  const wit = pinLabel(dW)?.key === 's:st_1' && (dW?.pin?.buttons ?? []).includes('list:traffic');
  ok(wit && nPin <= 10 * 1 + 2, `P14a: treść przypięcia z pamięci — liczenie ruchu stacji nie w każdej klatce (wywołania rejestru statków: ${nPin} w 10 klatkach; świadek: przypięta stacja z ruchem — ${wit})`);
  H.frame(1500); const calls0 = H.ctx.calls.length;
  H.frame(1516); H.frame(1532);
  ok(wit && !!pinLabel(H.dbg()) && H.ctx.calls.length === calls0, `P14b: spoczynek z przypięciem (kamera stoi, kursor nie) — 0 wywołań ctx (${H.ctx.calls.length - calls0}; świadek: przypięta etykieta narysowana)`);
  reset();
}

// ═══ P15 ═════════════════════════════════════════════════════════════════════
header('P15 OFF = dziś');
{
  FEATURES.labelPin = false;
  reset(); W0.cam = CAM_WIDE; W0.camEpoch++;
  const H = mkHud();
  selectBody('p_x'); H.frame(1000); H.frame(1300);
  const d = H.dbg();
  ok(!pinLabel(d) && d?.pin === undefined && (d?.labels ?? []).every((l) => !(l.text ?? []).some((s) => /^\[ /.test(String(s)))),
    'P15a: OFF — brak przypięcia i wiersza akcji (zaznaczone ciało: rozwinięcie T1 jak dziś)');
  ok(call(LP?.enforceSinglePinOnStation, { K, emit: () => { throw new Error('emit'); }, features: FEATURES }) === false
    && call(LP?.enforceSinglePinOnBody, { K, features: FEATURES }) === false, 'P15b: OFF — reguła jednego przypięcia nie działa (karta i panel niezależne)');
  FEATURES.labelPin = true;
  reset();
}

console.log(`\n═══ WYNIK: ${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
