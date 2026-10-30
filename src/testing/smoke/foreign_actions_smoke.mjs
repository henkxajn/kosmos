// ═══════════════════════════════════════════════════════════════════════════════
// foreign_actions_smoke — KEEPER — Findingi 578 / 579 / 580 (akcje obce po skoku warp)
// ─────────────────────────────────────────────────────────────────────────────
// CO PINUJE: statek po PRAWDZIWYM skoku warp do obcego układu musi móc tam KOLONIZOWAĆ
//   i SKANOWAĆ z powierzchni, których gracz realnie używa (panel statku HUD + PPM na mapie 3D).
//
// ⚠ ZMIERZONA PRZYCZYNA (faza A, sonda `probe-post-warp-actions`): NIE `systemId` (H1 martwa —
//   przylot stempluje układ docelowy, wszystkie selektory i oba dyspozytory liczą go poprawnie,
//   grupa K kontroli niżej), tylko OSIĄGALNOŚĆ stanu, na którym wisiały akcje obce:
//   chipy „Kolonizuj / Recon ciała / Recon układu / Rozładuj" istniały WYŁĄCZNIE przy misji
//   `exploration` + `orbiting_body`, którą produkuje JEDYNIE `VesselManager._redirectInterstellarVessel`.
//   Od 253 f-A (`5264a4b`) jego jedynym ŻYWYM producentem jest wiersz zakładki Atlas (mapa
//   taktyczna FMO wyłączona flagą od `6b3590f`). Naturalna droga do ciała — PPM „Lecisz do
//   planety" — zastępuje misję przylotu rozkazem `moveToPoint` i kończy się `orbiting`+`idle`+
//   `mission=null` (stan B): tam żadna powierzchnia nie oferowała kolonizacji ani skanu.
//   Osobno: „Pełny Skan" był tam AKTYWNY, przyjęty i po 0,5 civY kończył się CISZĄ
//   (`VesselManager._completeFullScan` — ciało bez siatki kolonii ⇒ `return` bez zdarzenia).
//
// NAPRAWA (podpis właściciela, faza B): D-1 — akcje obce kluczuje PREDYKAT `src/utils/ForeignActions.js`
//   (nadzbiór dzisiejszego warunku), jedno źródło dla panelu statku, rejestru i końca gry; D-2 (A1) —
//   ślad kolonii liczony PER STATEK (`needsSpaceportForVessel` + `hasSpaceportAt`); D-3 — ten sam predykat
//   w `PlayerViability`; D-4 — „Pełny Skan" bez mapy kolonii odmawia GŁOŚNO (Dziennik), jeden nowy klucz.
//
// GRUPY
//   P   PREDYKAT — tabela prawdy na atrapie kontekstu (każdy termin osobno)
//   K   KONTROLE (zielone na kotwicy): H1 martwa, zakres selektorów, bramka dyspozytora w obie
//       strony, zapis teleskopu, trasa Atlas działa od końca do końca
//   S   SEDNO (czerwone na kotwicy): stan B po PPM — kolonizacja, skan ciała, skan układu
//   D4  SEDNO: „Pełny Skan" bez mapy kolonii — głośna odmowa (EN + PL), nic nie startuje; KONTROLA z mapą
//   D1-C  KONTROLA: stan C (trasa Atlas) DOKŁADNIE jak dziś, w panelu statku I w rejestrze
//   D1-C2 SEDNO (Finding 580): stan C po reconie CAŁEGO układu wraca BEZ `targetId` — panel działa na `dockedAt`
//   D2  GRANICA (A1): trzy zmierzone wiersze — pełna kolonia/średni, placówka/średni, placówka/mały
//   D3  SEDNO + KONTROLE: koniec gry na produkcyjnej kadencji `ColonyManager._tickPlayerViability`
//
// Uruchom: node src/testing/smoke/foreign_actions_smoke.mjs
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { FleetSystem } from '../../systems/FleetSystem.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { buildShipPanelModel, runShipPanelAction } from '../../ui/ShipPanelHudLogic.js';
import { getAvailableActions, FLEET_ACTIONS } from '../../data/FleetActions.js';
import { systemIdOf } from '../../utils/SystemScope.js';
import { hasSpaceportAt } from '../../utils/SpaceportCheck.js';
import { RightClickMenu } from '../../ui/RightClickMenu.js';
import { buildMenuOptions } from '../../data/RightClickMenuOptions.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { canColonize, loadColonists } from '../../entities/Vessel.js';
import { t, setLocale, getLocale } from '../../i18n/i18n.js';

// ⚠ Moduł powstaje w naprawie — import DYNAMICZNY: na kotwicy brak pliku nie może przerwać całej suity
//   (pin musi DEGRADOWAĆ, nie przerywać — inaczej żaden pin nie dostaje koloru w przebiegu fail-first).
let FA = null;
try { FA = await import('../../utils/ForeignActions.js'); } catch { FA = null; }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const J = (o) => JSON.stringify(o);

// ── Świat: prawdziwy GameCore + MOS + OrderService + FleetSystem (jak GameScene) ──────
// ⚠ FleetSystem jak w GameScene — to on domyka rozkaz „Dokuj tutaj" (`_maybeDockOnArrival`); bez niego każdy
//   pomiar „czy statek zadokuje" jest jałowy (zmierzone w sondzie D-2).
function buildWorld({ solo = true } = {}) {
  const core = new GameCore();
  core.boot({ solo, quiet: true });
  const K = window.KOSMOS;
  K.movementOrderSystem = new MovementOrderSystem(K.vesselManager);
  K.orderService = new OrderService();
  K.fleetSystem = new FleetSystem(K.vesselManager);
  const journal = [];
  K.eventLogSystem = { push: (e) => journal.push(e), serialize: () => [], restore: () => {} };
  let selected = null;
  K.uiManager = {
    getSelectedVesselId: () => selected, getSelectedVesselIds: () => (selected ? [selected] : []),
    getSelectedFleetId: () => null, setSelectedFleetId: () => {}, setSelectedVesselId: (id) => { selected = id; },
  };
  K.techSystem.grantTechs(['rocketry', 'colonization', 'exploration', 'ion_drives', 'warp_drive', 'orbital_survey']);
  const events = [];
  for (const ev of ['vessel:fullScanComplete', 'mission:failed', 'expedition:reconProgress', 'expedition:colonyFounded',
    'ui:toast', 'vessel:interstellarRedirect', 'expedition:foreignRecon', 'expedition:foreignColonize']) {
    EventBus.on(ev, (d) => events.push({ ev, d }));
  }
  const vm = K.vesselManager, home = K.homePlanet;
  const homeCol = K.colonyManager.getColony(home.id);
  if (homeCol) {
    homeCol.credits = 1e9;   // utrzymanie nie unieruchamia
    // Magazyn startu kolonizacji (normalna ścieżka płaci z aktywnej kolonii) — mierzymy DOSTĘPNOŚĆ ścieżki, nie ekonomię.
    for (const id of ['Fe', 'C', 'Si', 'Cu', 'Ti', 'food', 'water', 'energy', 'minerals', 'organics']) {
      try { homeCol.resourceSystem?.receive?.({ [id]: 5000 }); } catch { /* zasób spoza magazynu */ }
    }
  }
  const mk = (name, hull, modules, colonists = 0) => {
    const v = vm.createAndRegister(hull, home.id, { name, modules });
    v.warpFuel.current = v.warpFuel.max; v.fuel.current = v.fuel.max;
    if (colonists > 0 && homeCol?.civSystem) loadColonists(v, colonists, homeCol.civSystem);
    return v;
  };
  const CS = mk('Kolonizator', 'hull_medium', ['engine_warp', 'warp_tank', 'habitat_pod']);
  const SS = mk('Zwiadowca', 'hull_small', ['engine_warp', 'warp_tank', 'science_lab']);
  const sysHome = K.galaxyData.systems.find(s => s.id === 'sys_home');
  const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
  const sysB = K.galaxyData.systems.filter(s => s.id !== 'sys_home')
    .map(s => ({ s, d: d3(s, sysHome) })).filter(o => o.d <= (GAME_CONFIG.WARP_MAX_JUMP_LY ?? 10))
    .sort((a, b) => a.d - b.d)[0]?.s?.id;
  return { K, vm, home, homeCol, CS, SS, sysB, journal, events, mk, select: (id) => { selected = id; } };
}
const tickUntil = (K, pred, maxCiv = 60, step = 0.05) => new Ticker(K.timeSystem).run(maxCiv, { tickSize: step, shouldStop: () => pred() });
const bodiesOf = (sys) => [
  ...EntityManager.getByTypeInSystem('planet', sys), ...EntityManager.getByTypeInSystem('moon', sys),
  ...EntityManager.getByTypeInSystem('planetoid', sys),
];
const colonizable = (b) => b.type === 'planetoid' || b.type === 'moon' || (b.type === 'planet' && (b.planetType === 'rocky' || b.planetType === 'ice'));
// Typ ciała, który przyjmują OBIE ścieżki (obca „Kolonizuj" i normalna z doku) — wiersze D-2 porównują je na tym samym ciele.
const colonizableBoth = (b) => b.type === 'planetoid' || (b.type === 'planet' && (b.planetType === 'rocky' || b.planetType === 'ice'));
function makeFmo() {
  let o;
  try { o = new FleetManagerOverlay(); } catch { o = Object.create(FleetManagerOverlay.prototype); }
  o._hitZones = []; o._missionConfig = null; o._cachedTargets = null; o._cachedTargetsKey = null;
  return o;
}
function warpTo(w, v, sys) {
  const r = w.K.orderService.issueWarp(v.id, sys);
  tickUntil(w.K, () => v.mission?.phase === 'in_system', 120);
  return r?.ok === true && v.systemId === sys;
}
function telescope(w, body) {
  w.K.observatorySystem.getMaxObservatoryLevel = () => 1;   // fixture bez budynku obserwatorium — bramka poziomu nadpisana
  w.K.observatorySystem.startBodyScan(body.id);
  tickUntil(w.K, () => body.explored === true, 5);
  return body.explored === true;
}
function toStateA(opts = {}) {
  const w = buildWorld(opts);
  w.warp = [w.K.orderService.issueWarp(w.CS.id, w.sysB), w.K.orderService.issueWarp(w.SS.id, w.sysB)];
  tickUntil(w.K, () => w.CS.mission?.phase === 'in_system' && w.SS.mission?.phase === 'in_system', 120);
  const bs = bodiesOf(w.sysB).filter(b => !w.K.colonyManager.getColony(b.id));   // ciała WOLNE (świat z AI: bez cudzych kolonii)
  w.Xb = bs.find(b => b.type === 'planet' && colonizable(b) && !b.explored) ?? bs.find(b => colonizable(b) && !b.explored);
  w.Yb = bs.find(b => b !== w.Xb && colonizable(b) && !b.explored);
  // Teleskop: prawdziwy `startBodyScan` + `_tickBodyScans`.
  w.K.observatorySystem.getMaxObservatoryLevel = () => 1;
  w.scanStarted = w.K.observatorySystem.startBodyScan(w.Xb.id);
  tickUntil(w.K, () => w.Xb.explored === true, 5);
  return w;
}
function ppmMoveTo(w, v, body) {
  w.K.activeSystemId = v.systemId ?? w.sysB;   // „Przełącz widok" — kamera na układzie statku (ramka PPM)
  w.select(v.id);
  const target = { type: 'planet', entityId: body.id, planet: body, worldPoint: { x: body.x / 10, y: 0, z: body.y / 10 } };
  new RightClickMenu()._handleOptionClick(buildMenuOptions(target, v.id).find(o => o.id === 'moveToPlanet'), target);
}
/** PPM „Dokuj tutaj" na ciele z kolonią gracza; zwraca, czy opcja była w menu. */
function ppmDock(w, v, body) {
  w.K.activeSystemId = v.systemId; w.select(v.id);
  const target = { type: 'planet', entityId: body.id, planet: body, worldPoint: { x: body.x / 10, y: 0, z: body.y / 10 } };
  const opt = buildMenuOptions(target, v.id).find(o => o.id === 'dock');
  if (!opt) return false;
  new RightClickMenu()._handleOptionClick(opt, target);
  return true;
}
function atlasTo(w, v, body) {          // trasa „wiersz Atlasu" (jedyny żywy producent przekierowania)
  w.K.activeSystemId = v.systemId;
  const o = makeFmo(); o._selectedVesselId = v.id;
  o._handleHit({ type: 'map_body', data: { bodyId: body.id } });
  tickUntil(w.K, () => v.mission?.type === 'exploration' && v.mission?.phase === 'orbiting_body' && v.position.dockedAt === body.id, 80, 0.02);
  return v.mission?.phase === 'orbiting_body';
}
const isStateB = (v, bodyId) => v.position.state === 'orbiting' && v.position.dockedAt === bodyId && v.mission == null && v.status === 'idle';
const model = (w, v, fmo) => buildShipPanelModel(v, { K: w.K, fmo, features: GAME_CONFIG.FEATURES });
/** Strefy prawego panelu REJESTRU (`FleetManagerOverlay._drawRight`) dla statku — prawdziwy rysunek na atrapie ctx. */
function rightZones(w, v) {
  const o = makeFmo(); o._selectedVesselId = v.id; o._rightViewH = 0; o._rightContentH = 0;
  o._collapsedFleets = o._collapsedFleets ?? new Set(); o._collapsedSections = o._collapsedSections ?? new Set();
  const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? (s) => ({ width: String(s).length * 6 })
    : k === 'getTransform' ? () => ({ a: 1, d: 1 })
    : (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient') ? () => ({ addColorStop() {} })
    : () => {}), set: () => true });
  o._drawRight(ctx, 600, 60, 320, 900, w.vm, w.K.missionSystem, w.K.colonyManager, w.K.colonyManager.activePlanetId);
  return o._hitZones;
}
const FOREIGN = ['foreign_recon_body', 'foreign_recon_system', 'foreign_colonize', 'foreign_unload'];
const hudForeign = (w, v) => (model(w, v, makeFmo())?.chips ?? []).filter(c => FOREIGN.includes(c.id));
const regForeign = (w, v) => rightZones(w, v).filter(z => FOREIGN.includes(z.type));
// Wpis po ROLI: chip obcy albo rozkaz rejestru (`action:<id>`).
function findEntry(m, chipIds, orderIds) {
  if (!m) return null;
  for (const c of m.chips) if (chipIds.includes(c.id)) return { kind: 'chip', ...c };
  for (const c of m.orders?.items ?? []) if (orderIds.includes(c.id.replace('action:', ''))) return { kind: 'order', ...c };
  return null;
}
/** Wykonaj wpis PRAWDZIWYM dyspozytorem panelu; rozkaz z celem — dociśnij wybór celu i potwierdzenie. */
function execEntry(w, fmo, v, entry, targetId) {
  if (!entry?.enabled || !entry.zone) return false;
  fmo._selectedVesselId = v.id;
  runShipPanelAction(entry.zone, { fmo });
  if (entry.kind === 'order' && fmo._missionConfig?.step === 'select' && targetId) {
    fmo._handleHit({ type: 'select_target', data: { targetId, targetSystemId: w.sysB } });
    fmo._handleHit({ type: 'confirm_mission', data: {} });
  }
  return true;
}
/** NORMALNA ścieżka kolonizacji z rejestru dla statku w doku — wszystkie ogniwa po kolei (sonda D-2). */
function normalPath(w, v, target) {
  const st = { missionSystem: w.K.missionSystem, vesselManager: w.vm, colonyManager: w.K.colonyManager,
    techSystem: w.K.techSystem, activePlanetId: w.K.colonyManager.activePlanetId };
  const offered = getAvailableActions(v, st).find(a => a.action.id === 'colonize');
  const fmo = makeFmo(); fmo._selectedVesselId = v.id;
  const inPicker = fmo._getValidTargets(v, 'colonize').some(tg => tg.id === target.id);
  const can = FLEET_ACTIONS.colonize.canExecute(v, { ...st, targetId: target.id });
  // Stan PO modalu kolonistów (kolonista już na pokładzie) → potwierdzenie (`_executeMission`).
  fmo._missionConfig = { actionId: 'colonize', targetId: target.id, step: 'confirm', colonistCount: 0 };
  fmo._executeMission();
  const launched = v.position.state === 'in_transit' && v.mission?.type === 'colony';
  // ⚠ Lot wewnątrz układu bywa DŁUGI (zmierzone: 85 i 166 civY od startu do przylotu) — budżet z zapasem, krok grubszy.
  tickUntil(w.K, () => !!w.K.colonyManager.getColony(target.id), 400, 0.25);
  const col = w.K.colonyManager.getColony(target.id);
  return { offered: !!offered?.ok, inPicker, canExecute: can?.ok === true, launched, founded: !!col && !col.ownerEmpireId && !col.isOutpost };
}
const COLONIZE = [['foreign_colonize'], ['colonize']];
const BODY_SCAN = [['foreign_recon_body'], ['survey']];
const SYS_SCAN = [['foreign_recon_system'], ['deep_scan']];

// ═══ P: predykat — tabela prawdy na atrapie kontekstu (bez świata) ═══════════════
header('P PREDYKAT — `ForeignActions` (D-1, D-2 A1, D-3): każdy termin osobno, jedno źródło dla HUD, rejestru i końca gry');
{
  ok(!!FA, `moduł src/utils/ForeignActions.js istnieje (${FA ? Object.keys(FA).sort().join(', ') : 'brak'})`);
  const fb = FA?.foreignActionsBodyId ?? (() => undefined);
  const B1 = { id: 'b1', type: 'planet', planetType: 'rocky', systemId: 'sys_x' };
  const BG = { id: 'bg', type: 'planet', planetType: 'gas', systemId: 'sys_x' };
  const B3 = { id: 'b3', type: 'planet', planetType: 'rocky', systemId: 'sys_y' };
  const ST = { id: 'st', type: 'station', systemId: 'sys_x' };
  const PT = { id: 'pt', type: 'planetoid', systemId: 'sys_x' };
  const MO = { id: 'mo', type: 'moon', systemId: 'sys_x' };
  const bodies = new Map([B1, BG, B3, ST, PT, MO].map(b => [b.id, b]));
  const ctxOf = (colonies = [], ports = new Set()) => ({
    getBody: (id) => bodies.get(id) ?? null, getColony: () => null,
    playerColonies: () => colonies, hasSpaceportAt: (id) => ports.has(id),
  });
  const ves = (o = {}) => ({ id: 'v', shipId: 'hull_medium', systemId: 'sys_x', status: 'idle', mission: null,
    serviceState: 'active', isWreck: false, position: { state: 'orbiting', dockedAt: 'b1' }, ...o });
  const colX = { planetId: 'bc', systemId: 'sys_x' };   // kolonia gracza w układzie X
  const colY = { planetId: 'by', systemId: 'sys_y' };   // kolonia gracza w układzie Y
  const stateC = (o = {}) => ves({ status: 'on_mission', mission: { type: 'exploration', phase: 'orbiting_body', ...o } });
  ok(fb(stateC({ targetId: 'b3' }), ctxOf([colX], new Set(['bc']))) === 'b3',
    'P1 stan C: ciało = mission.targetId — bez nowych terminów (ślad kolonii, układ i służba NIE są sprawdzane)');
  ok(fb(stateC(), null) === 'b1',
    'P2 stan C bez targetId (koniec reconu całego układu, Finding 580): ciało = position.dockedAt, kontekst niepotrzebny');
  ok(fb(ves(), ctxOf()) === 'b1', 'P3 stan B, gracz bez kolonii w układzie ⇒ akcje obce przy b1');
  ok(fb(ves(), ctxOf([colX], new Set(['bc']))) === null, 'P4 [F] kolonia z portem + kadłub ŚREDNI ⇒ u siebie (brak akcji obcych)');
  ok(fb(ves(), ctxOf([colX])) === 'b1', 'P5 [O-średni] kolonia BEZ portu + kadłub ŚREDNI ⇒ nie zadokuje ⇒ akcje obce zostają');
  ok(fb(ves({ shipId: 'hull_small' }), ctxOf([colX])) === null, 'P6 [O-mały] kolonia bez portu + kadłub MAŁY ⇒ zadokuje ⇒ u siebie');
  ok(fb(ves(), ctxOf([colY], new Set(['by']))) === 'b1', 'P7 ślad liczony PER UKŁAD: kolonia z portem w innym układzie nie zamyka akcji obcych tutaj');
  const neg = [
    ['status on_mission', ves({ status: 'on_mission' })],
    ['zwiad zaparkowany (żywa misja recon)', ves({ status: 'on_mission', mission: { type: 'recon', phase: 'orbiting_body', targetId: 'b1' } })],
    ['misja inna niż null przy idle', ves({ mission: { type: 'move_to_point' } })],
    ['kadłub w rezerwie', ves({ serviceState: 'stored' })],
    ['wrak', ves({ isWreck: true })],
    ['statek imperium AI', ves({ ownerEmpireId: 'emp_001' })],
    ['zadokowany', ves({ position: { state: 'docked', dockedAt: 'b1' } })],
    ['dryf (orbita bez ciała)', ves({ position: { state: 'orbiting', dockedAt: null } })],
    ['orbita stacji (stacja nie jest ciałem)', ves({ position: { state: 'orbiting', dockedAt: 'st' } })],
    ['ciało w innym układzie niż statek', ves({ position: { state: 'orbiting', dockedAt: 'b3' } })],
    ['tranzyt warp (systemId null)', ves({ systemId: null })],
  ];
  for (const [label, v] of neg) ok(fb(v, ctxOf()) === null, `P8 stan B odrzucony: ${label}`);
  ok(fb(ves(), null) === null, 'P9 brak kontekstu ⇒ stan B zamknięty (fail-closed)…');
  ok(fb(stateC({ targetId: 'b1' }), null) === 'b1', 'P9b … a stan C działa bez kontekstu');
  ok(fb(ves({ position: { state: 'orbiting', dockedAt: 'pt' } }), ctxOf()) === 'pt' && fb(ves({ position: { state: 'orbiting', dockedAt: 'mo' } }), ctxOf()) === 'mo',
    'P10 planetoida i księżyc to ciała, przy których stan B działa');
  ok(FA?.foreignActionsAvailable?.(ves(), ctxOf()) === true && FA?.foreignActionsAvailable?.(ves({ status: 'on_mission' }), ctxOf()) === false,
    'P11 `foreignActionsAvailable` = `foreignActionsBodyId` != null');
  const ct = FA?.isForeignColonizeType ?? (() => undefined);
  ok(ct(B1) === true && ct({ type: 'planet', planetType: 'ice' }) === true && ct(PT) === true && ct(BG) === false && ct(null) === false,
    'P12 typ ciała „Kolonizuj" w obcym układzie — skaliste / lodowe / planetoida tak, gazowy i brak ciała nie (jedna reguła zamiast dwóch kopii)');
  ok(FA?.foreignActionsContext?.(null) === null && FA?.foreignActionsContext?.({}) === null
    && ['getBody', 'getColony', 'playerColonies', 'hasSpaceportAt'].every(k => typeof FA?.foreignActionsContext?.({ colonyManager: {} })?.[k] === 'function'),
    'P13 kontekst gry: bez menedżera kolonii ⇒ null (fail-closed), z menedżerem ⇒ getBody / getColony / playerColonies / hasSpaceportAt');
}

// ═══ Świat 1: stan A (przylot) → stan B (PPM) ══════════════════════════════════
const W = toStateA();
const { K } = W;

header('K1 KONTROLA (H1 martwa) — przylot produkcyjny stempluje układ DOCELOWY');
ok(W.warp.every(r => r?.ok === true), `oba skoki przyjęte produkcyjnie (OrderService.issueWarp) — ${J(W.warp.map(r => r?.ok))}`);
for (const v of [W.CS, W.SS]) {
  ok(v.mission?.type === 'interstellar_jump' && v.mission?.phase === 'in_system',
    `${v.name}: przylot doszedł przez _tickInterstellar (misja interstellar_jump/in_system)`);
  ok(v.systemId === W.sysB && systemIdOf(v) === W.sysB && W.vm._resolveSystemId(v) === W.sysB,
    `${v.name}: systemId = systemIdOf = _resolveSystemId = ${W.sysB} (nie sys_home, nie null)`);
  ok(W.vm._reconcileSystemId(v) === false, `${v.name}: _reconcileSystemId nic nie zmienia (stempel stabilny)`);
}

header('K2 KONTROLA — selektory i bramka dyspozytora liczą układ STATKU (138/142 nietknięte)');
{
  const fmo = makeFmo();
  for (const [v, act] of [[W.CS, 'colonize'], [W.SS, 'survey']]) {
    const list = fmo._getValidTargets(v, act); fmo._cachedTargets = null;
    ok(list.length > 0 && list.every(tg => tg.systemId === W.sysB),
      `_getValidTargets(${v.name}, ${act}) = ${list.length} celów, wszystkie z ${W.sysB} (świadek: lista NIEPUSTA)`);
  }
  const homeBody = EntityManager.getByTypeInSystem('planet', 'sys_home').find(p => p !== W.home);
  ok(!!homeBody && W.vm._missionTargetOutOfSystem(W.SS, { targetId: W.Xb.id }) === false
    && W.vm._missionTargetOutOfSystem(W.SS, { targetId: homeBody.id }) === true,
    '_missionTargetOutOfSystem: cel z układu B przepuszczony, cel z sys_home odrzucony (bramka działa w OBIE strony)');
  const nu = K.missionSystem._findNearestUnexplored(null, W.SS);
  ok(K.missionSystem.getUnexploredCount(W.SS).total > 0 && nu?.systemId === W.sysB,
    `_findNearestUnexplored/getUnexploredCount liczą układ B (${nu?.id} @ ${nu?.systemId})`);
}

header('K3 KONTROLA — zapis teleskopu (fixture realny, nie stempel ręczny)');
ok(W.scanStarted === true && W.Xb.explored === true && !W.Xb.analyzed,
  `ObservatorySystem.startBodyScan + _tickBodyScans: Xb (${W.Xb.id}, ${W.Xb.planetType ?? W.Xb.type}) explored=true, analyzed=false`);
ok(K.missionSystem.canLaunchColony(W.Xb.id, W.CS.id).exploredOk === true,
  'H3 martwa: predykat kolonizacji przyjmuje ciało zbadane teleskopem (exploredOk)');

// ── Przejście A → B: PPM „Lecisz do planety" (prawdziwy RightClickMenu) ─────────
ppmMoveTo(W, W.CS, W.Xb);
ppmMoveTo(W, W.SS, W.Xb);
tickUntil(K, () => !W.CS.movementOrder && !W.SS.movementOrder && W.CS.position.state === 'orbiting' && W.SS.position.state === 'orbiting', 80, 0.02);

header('K4 KONTROLA — fixture stanu B: statek SIEDZI przy ciele zbadanym teleskopem');
for (const v of [W.CS, W.SS]) {
  ok(v.position.state === 'orbiting' && v.position.dockedAt === W.Xb.id && v.systemId === W.sysB,
    `${v.name}: orbita Xb w układzie B po PPM (${J({ st: v.position.state, at: v.position.dockedAt, m: v.mission?.type ?? null })})`);
}

header('S1 SEDNO — kolonizator przy Xb: Kolonizuj OFEROWANE i DZIAŁA');
const fmoB = makeFmo();
{
  const m = model(W, W.CS, fmoB);
  const e = findEntry(m, ...COLONIZE);
  ok(!!e && e.enabled, `panel statku oferuje AKTYWNE „Kolonizuj" (znaleziono: ${J(e ? { kind: e.kind, id: e.id, on: e.enabled } : null)}; chipy ${J(m?.chips.map(c => c.id))}; rozkazy ${J(m?.orders?.items.map(c => c.id))})`);
}

header('S2 SEDNO — statek naukowy przy Xb: skan CIAŁA oferowany i DZIAŁA');
{
  const m = model(W, W.SS, fmoB);
  const e = findEntry(m, ...BODY_SCAN);
  ok(!!e && e.enabled, `panel oferuje AKTYWNY skan ciała (znaleziono: ${J(e ? { kind: e.kind, id: e.id, on: e.enabled } : null)})`);
  const before = !!W.Xb.analyzed;
  const ran = execEntry(W, fmoB, W.SS, e, W.Xb.id);
  tickUntil(K, () => W.Xb.analyzed === true, 2, 0.02);
  ok(before === false && W.Xb.analyzed === true, `skan ciała ANALIZUJE Xb (świadek: przed=${before}, wykonano=${ran}, po=${!!W.Xb.analyzed})`);
}

header('S3 SEDNO — statek naukowy: skan UKŁADU oferowany, statek RUSZA i analizuje ciała');
{
  const m = model(W, W.SS, fmoB);
  const e = findEntry(m, ...SYS_SCAN);
  ok(!!e && e.enabled, `panel oferuje AKTYWNY skan układu (znaleziono: ${J(e ? { kind: e.kind, id: e.id, on: e.enabled } : null)})`);
  const un0 = bodiesOf(W.sysB).filter(b => !b.analyzed).length;
  const x0 = W.SS.position.x, y0 = W.SS.position.y;
  const ran = execEntry(W, fmoB, W.SS, e, null);
  tickUntil(K, () => bodiesOf(W.sysB).filter(b => !b.analyzed).length <= un0 - 2, 3, 0.02);
  const un1 = bodiesOf(W.sysB).filter(b => !b.analyzed).length;
  ok(un0 > 1 && un1 < un0 && (W.SS.position.x !== x0 || W.SS.position.y !== y0),
    `skan układu: nieanalizowane ${un0} → ${un1}, statek się ruszył (wykonano=${ran})`);
}

header('S1b SEDNO — kolonizacja z panelu ZAKŁADA kolonię na Xb (wykonanie, nie tylko oferta)');
{
  const m = model(W, W.CS, fmoB);
  const e = findEntry(m, ...COLONIZE);
  const before = !!K.colonyManager.getColony(W.Xb.id);
  const ran = execEntry(W, fmoB, W.CS, e, W.Xb.id);
  tickUntil(K, () => !!K.colonyManager.getColony(W.Xb.id), 3, 0.05);
  const col = K.colonyManager.getColony(W.Xb.id);
  ok(before === false && !!col && !col.ownerEmpireId, `kolonia gracza na Xb (świadek: przed=${before}, wykonano=${ran}, po=${!!col})`);
}

// ═══ Świat 2: „Pełny Skan" (D-4, Finding 579) — WŁASNY świat, PO pinach świata 1 (drugi boot() czyści EntityManager/EventBus) ═══
header('D4 SEDNO — „Pełny Skan" przy ciele BEZ mapy kolonii: GŁOŚNA odmowa w Dzienniku — nie cichy no-op, nie „pusty wynik"');
{
  const loc0 = getLocale();
  const w = toStateA(); ppmMoveTo(w, w.SS, w.Xb);
  tickUntil(w.K, () => !w.SS.movementOrder && w.SS.position.state === 'orbiting', 80, 0.02);
  const fmo = makeFmo();
  const fsOf = () => (model(w, w.SS, fmo)?.orders?.items ?? []).find(c => c.id === 'action:full_scan') ?? null;
  const complete = () => w.events.filter(e => e.ev === 'vessel:fullScanComplete').length;
  const fs = fsOf();
  ok(!!fs && fs.enabled && !w.K.colonyManager.getColony(w.Xb.id),
    `świadek: „Pełny Skan" AKTYWNY na liście statku naukowego przy Xb bez kolonii (${J(fs ? { on: fs.enabled } : null)})`);
  setLocale('en');
  const c0 = complete(), j0 = w.journal.length;
  execEntry(w, fmo, w.SS, { kind: 'order', ...fs }, null);
  const started = !!w.SS._fullScan, statusAfter = w.SS.status;
  const lines = w.journal.slice(j0);
  const reasonEN = t('vessel.reasonFullScanNoGrid');
  const txtEN = lines[0]?.text ?? '';
  ok(lines.length === 1 && lines[0].channel === 'fleet' && lines[0].severity === 'warn' && lines[0].entityRef === w.SS.id,
    `D-4: dokładnie JEDEN wpis w Dzienniku — kanał fleet, warn, odnośnik do statku (${J(lines.map(e => ({ ch: e.channel, sev: e.severity, ref: e.entityRef })))})`);
  ok(reasonEN !== 'vessel.reasonFullScanNoGrid' && txtEN.includes(reasonEN) && txtEN.includes(w.SS.name)
    && txtEN.includes(t('fleet.warpOrderFailed')) && !txtEN.includes('full_scan_no_grid'),
    `D-4 (EN): wpis nazywa statek i PODAJE POWÓD, bez surowego sluga — „${txtEN}"`);
  ok(!started && statusAfter === 'idle', `D-4: odmowa przy STARCIE — skan nie wystartował (status ${statusAfter}, _fullScan ${started})`);
  tickUntil(w.K, () => !w.SS._fullScan, 1, 0.05);   // kotwica: cichy skan biegnie 0,5 civY — wyrównanie stanu przed kolejnym krokiem
  ok(complete() === c0 && w.journal.length === j0 + lines.length,
    'D-4 KONTROLA: bez wariantu „pusty wynik" — zero `vessel:fullScanComplete` i zero dalszych wpisów po upływie czasu skanu');
  setLocale('pl');
  const j1 = w.journal.length;
  execEntry(w, fmo, w.SS, { kind: 'order', ...(fsOf() ?? {}) }, null);
  const reasonPL = t('vessel.reasonFullScanNoGrid');
  const txtPL = w.journal.slice(j1)[0]?.text ?? '';
  ok(reasonPL !== 'vessel.reasonFullScanNoGrid' && reasonPL !== reasonEN && txtPL.includes(reasonPL)
    && txtPL.includes(t('fleet.warpOrderFailed')) && !txtPL.includes('full_scan_no_grid'),
    `D-4 (PL): ten sam wpis po polsku — „${txtPL}"`);
  tickUntil(w.K, () => !w.SS._fullScan, 1, 0.05);
  // KONTROLA: ten sam statek, to samo ciało, ale Z mapą kolonii — skan startuje i kończy się zdarzeniem.
  //   Kolonia na Xb trasą Atlas (stan C działa na kotwicy i po naprawie), więc kontrola jest zielona po OBU stronach.
  atlasTo(w, w.CS, w.Xb);
  const ce = findEntry(model(w, w.CS, makeFmo()), ['foreign_colonize'], []);
  execEntry(w, makeFmo(), w.CS, ce, w.Xb.id);
  tickUntil(w.K, () => !!w.K.colonyManager.getColony(w.Xb.id), 3, 0.05);
  const grid = !!w.K.colonyManager.getColony(w.Xb.id)?.grid;
  const c2 = complete(), j2 = w.journal.length;
  const fs2 = fsOf();
  execEntry(w, fmo, w.SS, { kind: 'order', ...(fs2 ?? {}) }, null);
  const started2 = !!w.SS._fullScan && w.SS.status === 'on_mission';
  tickUntil(w.K, () => !w.SS._fullScan, 1, 0.05);
  ok(grid && !!fs2?.enabled && started2 && complete() === c2 + 1 && !w.journal.slice(j2).some(e => String(e.text).includes(reasonPL)),
    `D-4 KONTROLA: z mapą kolonii na Xb ten sam rozkaz STARTUJE i kończy się \`vessel:fullScanComplete\` — odmowa dotyczy wyłącznie braku siatki (grid=${grid}, start=${started2})`);
  setLocale(loc0);
}

// ═══ Świat 3: trasa Atlas (stan C) — backend akcji obcych jest SPRAWNY ════════════
header('K5 KONTROLA — trasa Atlas (jedyny żywy producent przekierowania) działa od końca do końca');
{
  const w = toStateA(); w.K.activeSystemId = w.sysB;
  const o = makeFmo();
  const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? (s) => ({ width: String(s).length * 6 }) : (k === 'getTransform' ? () => ({ a: 1, d: 1 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : () => {})), set: () => true });
  o._drawAtlasCatalog(ctx, 0, 0, 900, 4000);
  const rows = o._hitZones.filter(z => z.type === 'map_body').map(z => z.data.bodyId);
  ok(rows.includes(w.Xb.id) && rows.every(id => EntityManager.get(id)?.systemId === w.sysB),
    `Atlas rysuje wiersze ciał układu B (${rows.length}, w tym Xb)`);
  const fmo = makeFmo(); fmo._selectedVesselId = w.CS.id;
  // D1-C — świadek PRZED akcją (migawka, nie odczyt obiektu po kliku): w stanie A ani panel statku, ani rejestr
  //   nie mają akcji obcych.
  const hudIds = () => hudForeign(w, w.CS).map(c => c.id + (c.enabled ? '' : '(off)'));
  const regIds = () => regForeign(w, w.CS).map(z => z.type);
  const preHud = hudIds(), preReg = regIds(), preMission = w.CS.mission ? `${w.CS.mission.type}/${w.CS.mission.phase}` : null;
  fmo._handleHit({ type: 'map_body', data: { bodyId: w.Xb.id } });
  tickUntil(w.K, () => w.CS.mission?.phase === 'orbiting_body', 80, 0.02);
  ok(w.CS.mission?.type === 'exploration' && w.CS.position.dockedAt === w.Xb.id, 'klik wiersza Atlas → przekierowanie → exploration/orbiting_body przy Xb');
  header('D1-C KONTROLA — stan C (trasa Atlas) DOKŁADNIE jak dziś, w panelu statku I w rejestrze');
  ok(preMission === 'interstellar_jump/in_system' && preHud.length === 0 && preReg.length === 0,
    `świadek PRZED klikiem: stan A (${preMission}), panel ${J(preHud)}, rejestr ${J(preReg)} — bez akcji obcych`);
  const postHud = hudIds(), postReg = regIds();
  ok(J(postHud) === J(['foreign_recon_body', 'foreign_recon_system', 'foreign_colonize']),
    `panel statku w stanie C: dokładnie Recon ciała / Recon układu / Kolonizuj (aktywne) — ${J(postHud)}`);
  ok(J([...postReg].sort()) === J(['foreign_colonize', 'foreign_recon_body', 'foreign_recon_system']),
    `rejestr (FleetManagerOverlay._drawRight) w stanie C: te same trzy strefy — ${J(postReg)}`);
  const m = model(w, w.CS, fmo);
  const e = findEntry(m, ['foreign_colonize'], []);
  execEntry(w, fmo, w.CS, e, w.Xb.id);
  tickUntil(w.K, () => !!w.K.colonyManager.getColony(w.Xb.id), 3, 0.05);
  ok(!!e?.enabled && !!w.K.colonyManager.getColony(w.Xb.id), 'chip „Kolonizuj" aktywny i ZAKŁADA kolonię — backend sprawny, defekt to OSIĄGALNOŚĆ');
}

// ═══ Świat 4: D1-C2 (Finding 580) — recon CAŁEGO układu kończy się stanem C BEZ targetId ═══
header('D1-C2 SEDNO — stan C po reconie CAŁEGO układu wraca BEZ targetId: panel działa na ciele, przy którym statek stoi');
{
  const w = toStateA();
  atlasTo(w, w.CS, w.Xb);
  const Zb = bodiesOf(w.sysB).find(b => b !== w.Xb && colonizableBoth(b) && !w.K.colonyManager.getColony(b.id));
  // Jedno ciało do skanu — fixture skraca przebieg (recon całego układu bierze wyłącznie ciała nieprzeanalizowane).
  for (const b of bodiesOf(w.sysB)) if (b !== Zb) b.analyzed = true;
  const fmo = makeFmo();
  const sys = findEntry(model(w, w.CS, fmo), ['foreign_recon_system'], []);
  execEntry(w, fmo, w.CS, sys, null);
  tickUntil(w.K, () => w.CS.mission?.type === 'exploration' && w.CS.mission?.phase === 'orbiting_body' && w.CS.position.dockedAt === Zb?.id, 20, 0.02);
  const m = w.CS.mission;
  ok(!!Zb && m?.type === 'exploration' && m?.phase === 'orbiting_body' && m.targetId === undefined && w.CS.position.dockedAt === Zb.id && Zb.explored === true,
    `świadek: po reconie układu stan C BEZ targetId, statek przy Zb (${J({ m: m ? `${m.type}/${m.phase}` : null, targetId: m?.targetId ?? '(brak)', at: w.CS.position.dockedAt, Zb: Zb?.id })})`);
  const md = model(w, w.CS, fmo);
  const info = (md?.info ?? []).map(i => i.text).find(s => s.startsWith('🌍')) ?? '';
  ok(!!Zb && info.includes(Zb.name) && !info.includes('{0}'), `linia „Na orbicie" nazywa Zb, nie surowy szablon — „${info}"`);
  const col = md?.chips.find(c => c.id === 'foreign_colonize') ?? null;
  ok(!!col?.enabled && col.zone?.data?.targetId === Zb?.id,
    `panel statku: „Kolonizuj" AKTYWNE i celuje w Zb (${J(col ? { on: col.enabled, target: col.zone?.data?.targetId ?? '(brak)' } : null)})`);
  const rz = regForeign(w, w.CS).find(z => z.type === 'foreign_colonize') ?? null;
  ok(!!rz && rz.data?.targetId === Zb?.id, `rejestr: strefa „Kolonizuj" celuje w Zb (${J(rz?.data ?? null)})`);
  execEntry(w, fmo, w.CS, col ? { kind: 'chip', ...col } : null, Zb?.id);
  tickUntil(w.K, () => !!w.K.colonyManager.getColony(Zb?.id), 3, 0.05);
  ok(!!Zb && !!w.K.colonyManager.getColony(Zb.id), 'Kolonizuj z tego stanu ZAKŁADA kolonię na Zb');
}

// ═══ Światy 5–6: D-2 (A1) — granica śladu kolonii PER STATEK, trzy zmierzone wiersze ═══
header('D2 [F] GRANICA — pełna kolonia gracza z portem w układzie B + kadłub ŚREDNI: akcji obcych NIE ma, normalna ścieżka JEST');
{
  const w = toStateA();
  const CS2 = w.mk('Kolonizator II', 'hull_medium', ['engine_warp', 'warp_tank', 'habitat_pod'], 2);
  const warped = warpTo(w, CS2, w.sysB);
  atlasTo(w, w.CS, w.Xb);
  const ce = findEntry(model(w, w.CS, makeFmo()), ['foreign_colonize'], []);
  execEntry(w, makeFmo(), w.CS, ce, w.Xb.id);
  tickUntil(w.K, () => !!w.K.colonyManager.getColony(w.Xb.id), 3, 0.05);
  const colX = w.K.colonyManager.getColony(w.Xb.id);
  const Yf = bodiesOf(w.sysB).find(b => b !== w.Xb && colonizableBoth(b) && !w.K.colonyManager.getColony(b.id));
  telescope(w, Yf);
  ppmMoveTo(w, CS2, Yf);
  tickUntil(w.K, () => isStateB(CS2, Yf.id), 80, 0.02);
  ok(warped && !!colX && !colX.isOutpost && !colX.ownerEmpireId && hasSpaceportAt(w.Xb.id) && isStateB(CS2, Yf.id) && CS2.colonists > 0,
    `świadek: pełna kolonia z portem na Xb, kolonizator ŚREDNI w stanie B przy Yf (${J({ port: hasSpaceportAt(w.Xb.id), st: CS2.position.state, at: CS2.position.dockedAt, colonists: CS2.colonists })})`);
  ok(hudForeign(w, CS2).length === 0 && regForeign(w, CS2).length === 0,
    `[F] u siebie: ani panel statku, ani rejestr nie oferują akcji obcych (panel ${J(hudForeign(w, CS2).map(c => c.id))}, rejestr ${J(regForeign(w, CS2).map(z => z.type))})`);
  const dockOpt = ppmDock(w, CS2, w.Xb);
  tickUntil(w.K, () => CS2.position.state === 'docked', 80, 0.02);
  const np = normalPath(w, CS2, Yf);
  ok(dockOpt && np.offered && np.inPicker && np.canExecute && np.launched && np.founded,
    `[F] normalna ścieżka: PPM „Dokuj tutaj" → dok → Kolonizuj z rejestru → start → kolonia na Yf (${J({ dockOpt, ...np })})`);
}
header('D2 [O] GRANICA — sama PLACÓWKA bez portu: kadłub ŚREDNI ⇒ akcje obce (nie zadokuje); MAŁY ⇒ u siebie, normalna ścieżka');
{
  const w = buildWorld();
  const CG = w.mk('Frachtowiec', 'hull_medium', ['engine_warp', 'warp_tank', 'cargo_small']);
  CG.cargo = { Fe: 100 }; CG.cargoUsed = 100;
  const CSm = w.mk('Kolonizator M', 'hull_medium', ['engine_warp', 'warp_tank', 'habitat_pod'], 2);
  const CSs = w.mk('Kolonizator S', 'hull_small', ['engine_warp', 'warp_tank', 'habitat_pod'], 2);
  const warped = [warpTo(w, CG, w.sysB), warpTo(w, CSm, w.sysB), warpTo(w, CSs, w.sysB)];
  const free = bodiesOf(w.sysB).filter(b => colonizableBoth(b) && !w.K.colonyManager.getColony(b.id) && !b.explored);
  const [Zc, T1, T2] = free;
  const scoped = [telescope(w, Zc), telescope(w, T1), telescope(w, T2)];
  atlasTo(w, CG, Zc);
  const ue = findEntry(model(w, CG, makeFmo()), ['foreign_unload'], []);
  execEntry(w, makeFmo(), CG, ue, Zc.id);
  tickUntil(w.K, () => !!w.K.colonyManager.getColony(Zc.id), 3, 0.05);
  const outpost = w.K.colonyManager.getColony(Zc.id);
  ok(warped.every(Boolean) && scoped.every(Boolean) && !!outpost && outpost.isOutpost === true && !outpost.ownerEmpireId && !hasSpaceportAt(Zc.id),
    `świadek: placówka gracza BEZ portu na Zc (${J({ outpost: !!outpost?.isOutpost, port: hasSpaceportAt(Zc.id) })})`);
  // ŚREDNI: „Dokuj tutaj" na placówce ⇒ brak portu ⇒ zostaje na orbicie Zc (stan B), potem PPM na T1.
  const dockM = ppmDock(w, CSm, Zc);
  tickUntil(w.K, () => isStateB(CSm, Zc.id) || CSm.position.state === 'docked', 80, 0.02);
  const atOutpost = isStateB(CSm, Zc.id);
  ppmMoveTo(w, CSm, T1);
  tickUntil(w.K, () => isStateB(CSm, T1.id), 80, 0.02);
  const st = { missionSystem: w.K.missionSystem, vesselManager: w.vm, colonyManager: w.K.colonyManager,
    techSystem: w.K.techSystem, activePlanetId: w.K.colonyManager.activePlanetId };
  const normalM = getAvailableActions(CSm, st).find(a => a.action.id === 'colonize');
  ok(dockM && atOutpost && isStateB(CSm, T1.id) && !normalM?.ok,
    `[O-średni] KONTROLA: placówka bez portu nie przyjmuje kadłuba średniego — po „Dokuj tutaj" orbita Zc, normalna „Kolonizuj" niedostępna (${J({ dockM, atOutpost, normal: normalM ? normalM.ok : 'brak' })})`);
  const colM = hudForeign(w, CSm).find(c => c.id === 'foreign_colonize') ?? null;
  const regM = regForeign(w, CSm).find(z => z.type === 'foreign_colonize') ?? null;
  ok(!!colM?.enabled && colM.zone?.data?.targetId === T1.id && regM?.data?.targetId === T1.id,
    `[O-średni] akcje obce ZOSTAJĄ: „Kolonizuj" aktywne przy T1 w panelu statku i w rejestrze (${J({ hud: colM ? colM.enabled : null, reg: regM?.data?.targetId ?? null })})`);
  // MAŁY: ten sam układ ⇒ u siebie (zadokuje przy placówce bez portu).
  ppmMoveTo(w, CSs, T2);
  tickUntil(w.K, () => isStateB(CSs, T2.id), 80, 0.02);
  ok(isStateB(CSs, T2.id) && hudForeign(w, CSs).length === 0 && regForeign(w, CSs).length === 0,
    `[O-mały] u siebie: kolonizator MAŁY w stanie B przy T2 — bez akcji obcych (panel ${J(hudForeign(w, CSs).map(c => c.id))}, rejestr ${J(regForeign(w, CSs).map(z => z.type))})`);
  const dockS = ppmDock(w, CSs, Zc);
  tickUntil(w.K, () => CSs.position.state === 'docked', 80, 0.02);
  const np = normalPath(w, CSs, T2);
  ok(dockS && np.offered && np.inPicker && np.canExecute && np.launched && np.founded,
    `[O-mały] normalna ścieżka: dok przy placówce → Kolonizuj z rejestru → start → kolonia na T2 (${J({ dockS, ...np })})`);
}

// ═══ Światy 7–9: D-3 (Finding 111) — koniec gry na PRODUKCYJNEJ kadencji `ColonyManager._tickPlayerViability` ═══
// Każdy przebieg: gracz traci OSTATNIĄ kolonię PRODUKCYJNĄ drogą (`transferColony` domu do `emp_001` — jak keeper
// Findingu 111; ⚠ `removeColony` domu NIE usuwa: kolonia macierzysta jest niezniszczalna — zmierzone, pierwsza wersja tego
// pinu mierzyła przez to ciszę i złapała ją kontrola odwrotna). Świat Z IMPERIAMI AI (inaczej nie ma komu oddać kolonii).
// `_resolvePlayerHomePort` = null ⇒ `_onColonyDestroyed` statku NIE rusza — stan wejścia przeżywa utratę.
function viabilityRun(label, placeShip) {
  const w = toStateA({ solo: false });
  placeShip(w);
  const pre = { st: w.CS.position.state, at: w.CS.position.dockedAt, m: w.CS.mission ? `${w.CS.mission.type}/${w.CS.mission.phase}` : null,
    status: w.CS.status, canCol: canColonize(w.CS), xbType: w.Xb.planetType, xbCol: !!w.K.colonyManager.getColony(w.Xb.id) };
  const over = []; EventBus.on('game:over', (d) => over.push(d));
  w.K.colonyManager.transferColony(w.home.id, 'emp_001', 'probe');
  const lost = w.K.colonyManager.getPlayerColonies().length === 0;
  const post = { st: w.CS.position.state, m: w.CS.mission ? `${w.CS.mission.type}/${w.CS.mission.phase}` : null };
  const r = tickUntil(w.K, () => over.length > 0, ColonyManager.VIABILITY_GRACE_CIVYEARS + 3, 0.5);
  return { label, pre, lost, post, over: over.length, detail: over[0]?.detail ?? null, crashed: r.crashed };
}
header('D3 SEDNO — bezczynny kolonizator na orbicie skolonizowalnego ciała w układzie BEZ kolonii gracza = ŻYWA trasa');
{
  const r = viabilityRun('stan B', (w) => {
    ppmMoveTo(w, w.CS, w.Xb);
    tickUntil(w.K, () => !w.CS.movementOrder && w.CS.position.state === 'orbiting' && w.CS.mission == null, 80, 0.02);
  });
  ok(r.pre.st === 'orbiting' && r.pre.at && r.pre.m === null && r.pre.status === 'idle' && r.pre.canCol && !r.pre.xbCol,
    `świadek PRZED utratą: kolonizator w stanie B przy Xb (${J(r.pre)})`);
  ok(r.lost && r.post.st === 'orbiting' && r.post.m === null && !r.crashed,
    `świadek PO utracie: gracz bez kolonii, statek nadal na orbicie (${J(r.post)}), silnik bez wyjątku`);
  ok(r.over === 0, `D3 SEDNO: \`game:over\` NIE pada przez ${ColonyManager.VIABILITY_GRACE_CIVYEARS + 3} civY — `
    + `kolonizator może tu „Kolonizuj" (D-1), więc to jest żywa trasa (padło ${r.over}×, powód ${J(r.detail)})`);
}
header('D3 KONTROLE — ta sama kadencja: stan C (dzisiejsza reguła) wstrzymuje koniec gry; bez kolonizatora koniec gry PADA');
{
  const c = viabilityRun('stan C', (w) => {
    w.K.activeSystemId = w.sysB;
    const o = makeFmo(); o._selectedVesselId = w.CS.id;
    o._handleHit({ type: 'map_body', data: { bodyId: w.Xb.id } });
    tickUntil(w.K, () => w.CS.mission?.phase === 'orbiting_body', 80, 0.02);
  });
  ok(c.pre.m === 'exploration/orbiting_body' && c.lost && c.over === 0,
    `KONTROLA: stan C (${c.pre.m}) — \`game:over\` nie pada (${c.over}×) — harness odróżnia żywą trasę`);
  const n = viabilityRun('bez kolonizatora', (w) => { w.vm._vessels.delete(w.CS.id); });
  ok(n.lost && n.over === 1, `KONTROLA ODWROTNA: bez kolonizatora koniec gry PADA (${n.over}×, ${J(n.detail)}) — pomiar nie jest jałowy`);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
