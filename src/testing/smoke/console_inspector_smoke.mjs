// ARC KONSOLE K7-B — keeper: inspektor statku / floty na konsoli Dowództwa (KZ-Command: jedyna ścieżka, flaga zdjęta). Plan: docs/design/CONSOLES_PLAN.md (K7).
//
// Sekcje (każda degraduje, nie przerywa — symbole nowego kodu przez dynamiczny import):
//   I  dostępność akcji ABSOLUTNA: strefy inspektora konsoli (`drawInspector`) == zamrożony multizbiór (typ + dane) dla 26 stanów
//      statku (20 stanów migawki T4 + uszkodzony, mało paliwa, inny układ, …) — zamrożone z bazy 8701aa8, gdzie były == dawnemu
//      panelowi `_drawRight` (pin I bazy); obecny rysunek = baza 1:1 (poza konfiguratorem — zob. niżej)
//   W  integracja: pełny rysunek Dowództwa z wybranym statkiem niesie strefy i czipy inspektora konsoli (także przy consoleKit false)
//   D  akcja niemożliwa = czip wyłączony z powodem i18n (PL + EN, bez surowych id), bez strefy
//   F  flota: strefy inspektora floty == zamrożony multizbiór (baza: ⊇ dawnego `_drawRightFleet` + `fleetDisband`); anulowanie
//      bez rozkazu z powodem
//   K  Finding 747: `fleetCreate` (lista „Floty”) i `fleetDisband` (inspektor floty) osiągalne na konsoli i trafiają do handlerów
//   M  podsumowanie zaznaczenia wielokrotnego: najwolniejszy / zasięg / najmniej paliwa + dzisiejsze akcje zbiorcze
//   R  kolumna ROLA: forma skrócona dla każdej roli (PL + EN), pełna nazwa w podpowiedzi
//   C  kolumny puste dla wszystkich widocznych wierszy — minimum, nigdy nie znikają
//   A  okna dialogowe (zmiana nazwy, rozbiórka, rozwiązanie floty, nowa flota) z prostokąta strefy konsoli przy 1600×1041
//      i 1280×833, bez `window.inner*` w handlerach; kotwica bez warunku flagi (consoleKit false — ta sama); inna zakładka — null
//   L  czysta logika (grupy akcji, podsumowanie grupy, przyrząd, kadłub, utrzymanie z konkretną naprawą, kotwica)
// Bez pinów na stałe rysunku.
//
// KZ-Command — piny ON vs OFF przepięte: I (== `_drawRight`) → zamrożony multizbiór per stan; W (OFF = dzisiejszy panel) → trwałość
// (consoleKit false też konsola); F (⊇ `_drawRightFleet`) → zamrożony multizbiór floty; A „flaga OFF → brak kotwicy” → kotwica
// przy consoleKit false = ta sama + pin źródłowy `_dialogAnchor` bez kitOn / isKitScreen. Usunięte bez zamiennika: brak.
// ⚠ Stany config_select / config_confirm / config_home (I, D) są CZERWONE na drzewie KZ-Command: `CommandInspectorView.drawConfigurator`
//   woła `ov._fleetActionDef`, które KZ-Command usunął z FleetManagerOverlay — konfigurator misji rzuca TypeError (regresja produktu).

import '../headless/env.js';   // MUSI być pierwszy
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import EntityManager from '../../core/EntityManager.js';
import { consoleRoles } from '../../ui/ConsoleRolesLogic.js';
import { ROLE_GLYPHS } from '../../ui/FleetPictureLogic.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const imp = async (p) => { try { return await import(p); } catch (e) { console.log(`  (${p} brak: ${e.message})`); return {}; } };
const IL = await imp('../../ui/CommandInspectorLogic.js');
const IV = await imp('../../ui/CommandInspectorView.js');
const CL = await imp('../../ui/CommandConsoleLogic.js');
const MA = await imp('../../ui/ModalAnchor.js');
const PL = (await import('../../i18n/pl.js')).pl ?? (await import('../../i18n/pl.js')).default ?? {};
const EN = (await import('../../i18n/en.js')).en ?? (await import('../../i18n/en.js')).default ?? {};
const { t } = await import('../../i18n/i18n.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; if (process.env.VERBOSE) console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const header = (s) => console.log('\n── ' + s);
const safe = async (name, fn) => { try { await fn(); } catch (e) { fail++; console.log(`  ✗ FAIL: ${name} rzuciło: ${e.message}`); } };

const FEAT = GAME_CONFIG.FEATURES;
const AU = 100;

function mockCtx() {
  const log = [];
  return {
    log, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '10px mono', textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1,
    shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    fillRect() {}, strokeRect() {}, clearRect() {},
    fillText(s, x, y) { log.push(String(s)); },
    beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {}, clip() {}, rect() {},
    setLineDash() {}, quadraticCurveTo() {}, bezierCurveTo() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    getTransform() { return { a: 1, d: 1 }; },
    measureText(s) { const px = parseFloat(String(this.font).replace(/^bold /, '')) || 10; return { width: String(s).length * px * 0.6 }; },
    createRadialGradient() { return { addColorStop() {} }; }, createLinearGradient() { return { addColorStop() {} }; }, drawImage() {},
  };
}

// ── Świat stanów statku (jak `ship_panel_hud_smoke` / migawka T4) ──────────────────────────────────────────────────
function world(vessel, extra = {}, more = []) {
  EntityManager.clear();
  const home = { id: 'p_home', type: 'planet', name: 'Nowa Ziemia', x: 1 * AU, y: 0, systemId: 'sys_home', orbital: { a: 1, e: 0, T: 1, M: 0 }, deposits: [], explored: true, analyzed: true, planetType: 'rocky' };
  const two = { id: 'p_two', type: 'planet', name: 'Wtora', x: 3 * AU, y: 0, systemId: 'sys_home', orbital: { a: 3, e: 0, T: 5, M: 0 }, deposits: [], explored: true, analyzed: true, planetType: 'rocky' };
  const far = { id: 'p_far', type: 'planet', name: 'Thuban b', x: 2 * AU, y: 0, systemId: 'sys_B', orbital: { a: 2, e: 0, T: 3, M: 0 }, deposits: [],
    explored: extra.farExplored ?? true, analyzed: extra.farAnalyzed ?? false, planetType: 'rocky' };
  for (const e of [home, two, far]) EntityManager.add(e);
  const vessels = new Map([[vessel.id, vessel], ...more.map((m) => [m.id, m])]);
  const colony = { planetId: 'p_home', name: 'Nowa Ziemia', isOutpost: false, buildingSystem: { hasSpaceport: () => true },
    resourceSystem: { inventory: new Map(), getAmount: () => 10, canAfford: () => true, spend: () => true, receive: () => {} }, civSystem: { freePops: 5 },
    planet: home, isHomePlanet: true, ownerEmpireId: null };
  const fleets = extra.fleets ?? [];
  let selV = vessel.id, selF = null;
  globalThis.window.KOSMOS = {
    civMode: true, timeSystem: { gameTime: 10 }, activeSystemId: 'sys_home', homePlanet: home,
    vesselManager: { _vessels: vessels, getVessel: (id) => vessels.get(id), getAllVessels: () => [...vessels.values()],
      isImmobilized: () => !!extra.immob, getVesselUpkeepCredits: () => 300, getVesselBaseUpkeepCredits: () => 300,
      _findEntity: (id) => EntityManager.get(id), deployVessel: () => ({ ok: true }), withdrawVessel: () => ({ ok: true }), getVesselSensorRangeAU: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => (id === 'p_home' ? colony : null), getAllColonies: () => [colony],
      getPlayerColonies: () => [colony], isPlayerColony: () => true, _getShipyardLevel: () => (extra.noYard ? 0 : 1) },
    missionSystem: { getActive: () => extra.missions ?? [] },
    techSystem: { isResearched: (id) => !(extra.noRocketry && id === 'rocketry'), getShipSpeedMultiplier: () => 1, getMultiplier: () => 1, getFuelEfficiency: () => 1 },
    stationSystem: { getStationsAt: () => [], getAllStations: () => [] },
    starSystemManager: { activeSystemId: 'sys_home', getSystem: (id) => (id === 'sys_B' ? { id } : null),
      getAllSystems: () => [{ systemId: 'sys_home', galaxyStar: { name: 'Sol' } }, { systemId: 'sys_B', galaxyStar: { name: 'Thuban' } }] },
    fleetSystem: { getFleet: (id) => fleets.find((f) => f.id === id) ?? null, listFleets: () => fleets },
    civilianTradeSystem: { getTreasuryCredits: () => extra.treasury ?? 48 },
    poiRegistry: extra.poi ?? null,
    transportOrderSystem: extra.tos ?? null,
    intelSystem: { getVesselContact: () => ({ quality: 'full' }) },
    notificationCenter: { getActiveCount: () => 0 },
    deepSpaceCombatSystem: { _findActiveEncounterContaining: (id) => (extra.combat && id === vessel.id ? { id: 'e1' } : null) },
    uiManager: { _dirty: false, getSelectedVesselId: () => selV, getSelectedVesselIds: () => (selV ? [selV] : []), getSelectedFleetId: () => selF,
      setSelectedVesselId: (id) => { selV = id; }, setSelectedFleetId: (id) => { selF = id; }, overlayManager: { closeActive() {} } },
    threeRenderer: { _pingedEnemyId: null },
  };
  globalThis.KOSMOS = globalThis.window.KOSMOS;
  return { home, colony };
}
const ship = (o = {}) => ({
  id: 'v_1', name: 'Fracht III', shipId: 'hull_medium', systemId: 'sys_home', colonyId: 'p_home', homeColonyId: 'p_home', status: 'idle', owner: 'player',
  position: { state: 'docked', dockedAt: 'p_home', x: 1 * AU, y: 0 }, mission: null, movementOrder: null,
  fuel: { current: 40, max: 60, consumption: 1 }, warpFuel: { current: 0, max: 0 }, endurance: { current: 10, max: 10 },
  cargo: {}, cargoUsed: 0, cargoMax: 2000, colonistCapacity: 0, colonists: 0, troopCapacity: 0,
  modules: ['engine_ion', 'cargo_small'], missionLog: [], isWreck: false, serviceState: 'active', unpaidYears: 0,
  refuelAutomatically: true, experience: 4, ...o,
});
const inFlight = { state: 'in_transit', dockedAt: null, x: 2 * AU, y: 0 };
const STATES = {
  hangar:         () => ({ v: ship() }),
  dock_noyard:    () => ({ v: ship(), extra: { noYard: true } }),
  dock_colonists: () => ({ v: ship({ colonists: 3, colonistCapacity: 4, modules: ['engine_ion', 'habitat_pod'] }) }),
  orbit:          () => ({ v: ship({ position: { state: 'orbiting', dockedAt: 'p_two', x: 3 * AU, y: 0 } }) }),
  flight:         () => ({ v: ship({ name: 'Kurier', status: 'on_mission', position: { ...inFlight }, mission: { type: 'transport', targetId: 'p_two', phase: 'outbound' },
    cargo: { Fe: 120 }, cargoUsed: 120, movementOrder: { id: 'mo_1', type: 'moveToPoint', status: 'active', targetPoint: { x: 300, y: 40 } } }),
    extra: { missions: [{ vesselId: 'v_1', type: 'transport', targetId: 'p_two', status: 'transit', arrivalYear: 12.3, progressPct: 0.4, cargo: { Fe: 120 } }] } }),
  combat:         () => ({ v: ship({ name: 'Fregata', shipId: 'hull_frigate', status: 'on_mission', position: { state: 'orbiting', dockedAt: null, x: 2 * AU, y: 0 },
    modules: ['engine_ion', 'weapon_laser'], movementOrder: { id: 'mo_2', type: 'engage', status: 'active', targetEntityId: 'x_9' } }), extra: { combat: true } }),
  foreign_orbit:  () => ({ v: ship({ systemId: 'sys_B', status: 'on_mission', position: { state: 'orbiting', dockedAt: 'p_far', x: 2 * AU, y: 0 },
    mission: { type: 'exploration', phase: 'orbiting_body', targetId: 'p_far' }, cargoUsed: 50, cargo: { Fe: 50 }, modules: ['engine_ion', 'cargo_small', 'habitat_pod'] }) }),
  interstellar:   () => ({ v: ship({ systemId: 'sys_B', status: 'on_mission', position: { state: 'orbiting', dockedAt: null, x: 2 * AU, y: 0 },
    mission: { type: 'interstellar_jump', phase: 'in_system', toSystemId: 'sys_B', targetName: 'Thuban' } }) }),
  foreign_recon:  () => ({ v: ship({ systemId: 'sys_B', status: 'on_mission', position: { ...inFlight },
    mission: { type: 'foreign_recon', scope: 'full_system', targets: ['p_far'], currentIdx: 0, phase: 'scanning' } }) }),
  loop:           () => ({ v: ship({ status: 'on_mission', position: { ...inFlight } }),
    extra: { missions: [{ vesselId: 'v_1', type: 'transport', loop: true, loopSourceId: 'p_home', loopTargetId: 'p_two', status: 'waiting_reload', leg: 'outbound' }] } }),
  reserve:        () => ({ v: ship({ serviceState: 'stored' }) }),
  mobilizing:     () => ({ v: ship({ serviceState: 'mobilizing', mobilizeProgress: 0.4, mobilizeTarget: 'active' }) }),
  rally_none:     () => ({ v: ship(), extra: { poi: { listPOIs: () => [{ id: 'poi_1', name: 'Zbiórka', memberVesselIds: [] }] } } }),
  rally_member:   () => ({ v: ship(), extra: { poi: { listPOIs: () => [{ id: 'poi_1', name: 'Zbiórka', memberVesselIds: ['v_1'] }] } } }),
  pool:           () => ({ v: ship(), extra: { tos: { isInPool: () => true } }, features: { transportOrders: true } }),
  immobilized:    () => ({ v: ship({ position: { state: 'orbiting', dockedAt: 'p_two', x: 3 * AU, y: 0 }, unpaidYears: 2 }), extra: { immob: true } }),
  blocked:        () => ({ v: ship({ position: { ...inFlight }, movementOrder: { id: 'mo_3', type: 'pursue', status: 'blocked', blockReason: 'target_lost', targetEntityId: 'x_9' } }) }),
  config_select:  () => ({ v: ship(), cfg: { actionId: 'transport', targetId: null, step: 'select' } }),
  config_confirm: () => ({ v: ship(), cfg: { actionId: 'transport', targetId: 'p_two', step: 'confirm', repeat: true } }),
  config_home:    () => ({ v: ship(), cfg: { actionId: 'transport', targetId: 'p_home', step: 'confirm', repeat: true } }),
  // K7-B — stany z briefu ponad migawkę T4
  damaged:        () => ({ v: ship({ damaged: true, _repairProgress: 0.4 }) }),
  low_fuel:       () => ({ v: ship({ fuel: { current: 5, max: 60, consumption: 1 }, position: { state: 'orbiting', dockedAt: 'p_two', x: 3 * AU, y: 0 } }) }),
  other_system:   () => ({ v: ship({ systemId: 'sys_B', position: { state: 'orbiting', dockedAt: 'p_far', x: 2 * AU, y: 0 } }) }),
  foreign_unexplored: () => ({ v: ship({ systemId: 'sys_B', status: 'on_mission', position: { state: 'orbiting', dockedAt: 'p_far', x: 2 * AU, y: 0 },
    mission: { type: 'exploration', phase: 'orbiting_body', targetId: 'p_far' }, modules: ['engine_ion', 'cargo_small', 'habitat_pod'] }), extra: { farExplored: false } }),
  foreign_analyzed: () => ({ v: ship({ systemId: 'sys_B', status: 'on_mission', position: { state: 'orbiting', dockedAt: 'p_far', x: 2 * AU, y: 0 },
    mission: { type: 'exploration', phase: 'orbiting_body', targetId: 'p_far' }, modules: ['engine_ion', 'cargo_small', 'habitat_pod'] }), extra: { farAnalyzed: true } }),
  pool_flight:    () => ({ v: ship({ status: 'on_mission', position: { ...inFlight } }), extra: { tos: { isInPool: () => false } }, features: { transportOrders: true } }),
};

const withFeat = (patch, fn) => { const saved = { ...FEAT }; Object.assign(FEAT, patch); try { return fn(); } finally { Object.assign(FEAT, saved); } };
const norm = (z) => {
  const d = { ...(z.data ?? {}) };
  if (d.vessel && typeof d.vessel === 'object') d.vessel = d.vessel.id;
  return `${z.type}|${JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k]) => !['sliderX', 'sliderW'].includes(k)).sort()))}`;
};
const ms = (arr) => arr.map(norm).sort();

function scene(name) {
  const s = STATES[name]();
  world(s.v, s.extra ?? {});
  const ov = new FleetManagerOverlay();
  ov._selectedVesselId = s.v.id;
  ov._missionConfig = s.cfg ? { ...s.cfg } : null;
  return { s, ov };
}
const env = () => { const K = window.KOSMOS; return { vMgr: K.vesselManager, ms: K.missionSystem, colMgr: K.colonyManager, activePid: 'p_home' }; };
const BODY = { x: 900, y: 100, w: 294, h: 6000 };

// Strefa w zapisie zamrożonym: typ(klucz=wartość,…) — dane posortowane, `vessel` jako id, bez współrzędnych suwaka
const short = (z) => {
  const d = { ...(z.data ?? {}) };
  if (d.vessel && typeof d.vessel === 'object') d.vessel = d.vessel.id;
  return `${z.type}(${Object.keys(d).filter((k) => k !== 'sliderX' && k !== 'sliderW').sort().map((k) => `${k}=${d[k]}`).join(',')})`;
};
// Zamrożone z bazy 8701aa8 (`drawInspector`, tam == dawnemu panelowi `_drawRight` / `_drawRightFleet` + `fleetDisband`)
const EXPECT_I = {
  hangar: ["action(actionId=found_outpost,vessel=v_1)", "action(actionId=orbit,vessel=v_1)", "action(actionId=transport,vessel=v_1)", "back_to_shipyard()", "cargo_load(vesselId=v_1)", "disband(vesselId=v_1)", "manual_refuel(vesselId=v_1)", "rename(vesselId=v_1)", "toggle_refuel_auto(vesselId=v_1)", "undock(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  dock_noyard: ["action(actionId=found_outpost,vessel=v_1)", "action(actionId=orbit,vessel=v_1)", "action(actionId=transport,vessel=v_1)", "back_to_shipyard()", "cargo_load(vesselId=v_1)", "manual_refuel(vesselId=v_1)", "rename(vesselId=v_1)", "toggle_refuel_auto(vesselId=v_1)", "undock(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  dock_colonists: ["action(actionId=colonize,vessel=v_1)", "action(actionId=load_colonists,vessel=v_1)", "action(actionId=orbit,vessel=v_1)", "action(actionId=transport,vessel=v_1)", "action(actionId=transport_passenger,vessel=v_1)", "back_to_shipyard()", "cargo_load(vesselId=v_1)", "disband(vesselId=v_1)", "manual_refuel(vesselId=v_1)", "rename(vesselId=v_1)", "toggle_refuel_auto(vesselId=v_1)", "undock(vesselId=v_1)", "unload_colonists(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  orbit: ["action(actionId=transport,vessel=v_1)", "back_to_shipyard()", "cargo_load(vesselId=v_1)", "rename(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  flight: ["back_to_shipyard()", "cancel_movement_order(vesselId=v_1)", "rename(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  combat: ["action(actionId=transport,vessel=v_1)", "back_to_shipyard()", "cancel_movement_order(vesselId=v_1)", "cargo_load(vesselId=v_1)", "rename(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  foreign_orbit: ["action(actionId=transport,vessel=v_1)", "back_to_shipyard()", "cargo_load(vesselId=v_1)", "foreign_colonize(targetId=p_far,vesselId=v_1)", "foreign_recon_body(targetId=p_far,vesselId=v_1)", "foreign_recon_system(vesselId=v_1)", "foreign_unload(targetId=p_far,vesselId=v_1)", "rename(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  interstellar: ["action(actionId=transport,vessel=v_1)", "back_to_shipyard()", "cargo_load(vesselId=v_1)", "cluster_switch(systemId=sys_B)", "rename(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  foreign_recon: ["abort_foreign_recon(vesselId=v_1)", "back_to_shipyard()", "rename(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  loop: ["back_to_shipyard()", "cancel_loop(vesselId=v_1)", "rename(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  reserve: ["action(actionId=found_outpost,vessel=v_1)", "action(actionId=orbit,vessel=v_1)", "action(actionId=transport,vessel=v_1)", "back_to_shipyard()", "cargo_load(vesselId=v_1)", "deploy_vessel(vesselId=v_1)", "disband(vesselId=v_1)", "manual_refuel(vesselId=v_1)", "rename(vesselId=v_1)", "toggle_refuel_auto(vesselId=v_1)", "undock(vesselId=v_1)"],
  mobilizing: ["action(actionId=found_outpost,vessel=v_1)", "action(actionId=orbit,vessel=v_1)", "action(actionId=transport,vessel=v_1)", "back_to_shipyard()", "cargo_load(vesselId=v_1)", "disband(vesselId=v_1)", "manual_refuel(vesselId=v_1)", "rename(vesselId=v_1)", "toggle_refuel_auto(vesselId=v_1)", "undock(vesselId=v_1)"],
  rally_none: ["action(actionId=found_outpost,vessel=v_1)", "action(actionId=orbit,vessel=v_1)", "action(actionId=transport,vessel=v_1)", "back_to_shipyard()", "cargo_load(vesselId=v_1)", "disband(vesselId=v_1)", "manual_refuel(vesselId=v_1)", "rally_assign_open(currentRallyId=null,vesselId=v_1)", "rename(vesselId=v_1)", "toggle_refuel_auto(vesselId=v_1)", "undock(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  rally_member: ["action(actionId=found_outpost,vessel=v_1)", "action(actionId=orbit,vessel=v_1)", "action(actionId=transport,vessel=v_1)", "back_to_shipyard()", "cargo_load(vesselId=v_1)", "disband(vesselId=v_1)", "manual_refuel(vesselId=v_1)", "rally_assign_open(currentRallyId=poi_1,vesselId=v_1)", "rally_assign_remove(rallyId=poi_1,vesselId=v_1)", "rename(vesselId=v_1)", "toggle_refuel_auto(vesselId=v_1)", "undock(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  pool: ["action(actionId=found_outpost,vessel=v_1)", "action(actionId=orbit,vessel=v_1)", "action(actionId=transport,vessel=v_1)", "back_to_shipyard()", "cargo_load(vesselId=v_1)", "disband(vesselId=v_1)", "manual_refuel(vesselId=v_1)", "rename(vesselId=v_1)", "toggle_logistics_pool(vesselId=v_1)", "toggle_refuel_auto(vesselId=v_1)", "undock(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  immobilized: ["action(actionId=transport,vessel=v_1)", "back_to_shipyard()", "cargo_load(vesselId=v_1)", "rename(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  blocked: ["back_to_shipyard()", "rename(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  config_select: ["back_to_shipyard()", "cancel_config()", "cargo_load(vesselId=v_1)", "rename(vesselId=v_1)", "select_target(targetId=p_two,targetSystemId=sys_home)", "undock(vesselId=v_1)"],
  config_confirm: ["back_to_shipyard()", "cancel_config()", "cargo_load(vesselId=v_1)", "change_target()", "confirm_mission()", "rename(vesselId=v_1)", "toggle_repeat()", "undock(vesselId=v_1)"],
  config_home: ["back_to_shipyard()", "cancel_config()", "cargo_load(vesselId=v_1)", "change_target()", "confirm_mission()", "rename(vesselId=v_1)", "set_return_cargo()", "toggle_repeat()", "undock(vesselId=v_1)"],
  damaged: ["action(actionId=found_outpost,vessel=v_1)", "action(actionId=orbit,vessel=v_1)", "action(actionId=transport,vessel=v_1)", "back_to_shipyard()", "cargo_load(vesselId=v_1)", "disband(vesselId=v_1)", "manual_refuel(vesselId=v_1)", "rename(vesselId=v_1)", "toggle_refuel_auto(vesselId=v_1)", "undock(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  low_fuel: ["action(actionId=transport,vessel=v_1)", "back_to_shipyard()", "cargo_load(vesselId=v_1)", "rename(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  other_system: ["action(actionId=transport,vessel=v_1)", "back_to_shipyard()", "cargo_load(vesselId=v_1)", "foreign_recon_body(targetId=p_far,vesselId=v_1)", "foreign_recon_system(vesselId=v_1)", "rename(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  foreign_unexplored: ["action(actionId=transport,vessel=v_1)", "back_to_shipyard()", "cargo_load(vesselId=v_1)", "foreign_recon_body(targetId=p_far,vesselId=v_1)", "foreign_recon_system(vesselId=v_1)", "rename(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  foreign_analyzed: ["action(actionId=transport,vessel=v_1)", "back_to_shipyard()", "cargo_load(vesselId=v_1)", "foreign_colonize(targetId=p_far,vesselId=v_1)", "foreign_recon_system(vesselId=v_1)", "rename(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
  pool_flight: ["back_to_shipyard()", "rename(vesselId=v_1)", "withdraw_vessel(vesselId=v_1)"],
};
const EXPECT_FLEET = ["fleetBackToList()", "fleetDisband(fleetId=fl_a)", "fleetEngage(fleetId=fl_a)", "fleetMemberSelect(vesselId=v_1)", "fleetMemberSelect(vesselId=v_2)", "fleetMoveToPoint(fleetId=fl_a)", "fleetRename(fleetId=fl_a)", "fleetRetreatThreshold(fleetId=fl_a)", "fleetReturnBase(fleetId=fl_a)", "fleetSetDoctrine(doctrine=engage_in_range,fleetId=fl_a)", "fleetSetDoctrine(doctrine=hold_position,fleetId=fl_a)", "fleetSetDoctrine(doctrine=kite,fleetId=fl_a)", "fleetSetDoctrine(doctrine=retreat_at_50,fleetId=fl_a)"];
function onDraw(name, setup = null) {
  const { s, ov } = scene(name);
  return withFeat(s.features ?? {}, () => {
    ov._hitZones = []; ov._cmdDisabled = []; ov._cmdTip = null;
    if (setup) setup(ov);
    const ctx = mockCtx();
    IV.drawInspector(ov, ctx, BODY, consoleRoles(), env());
    return { ov, zones: ov._hitZones.slice(), disabled: ov._cmdDisabled.slice(), ctx };
  });
}

// ═══ I — dostępność absolutna ═════════════════════════════════════════════════════════════════════════════════════
header('I  strefy inspektora konsoli == zamrożony multizbiór (stany statku)');
ok(Object.keys(EXPECT_I).length === Object.keys(STATES).length && Object.keys(STATES).every((n) => Array.isArray(EXPECT_I[n])),
  `I świadek — zamrożone stany = stany keepera (${Object.keys(EXPECT_I).length})`);
for (const name of Object.keys(STATES)) {
  await safe(`I ${name}`, () => {
    const want = EXPECT_I[name] ?? [];
    const got = onDraw(name).zones.map(short).sort();
    ok(want.length > 0, `I ${name}: świadek — oczekiwane strefy (${want.length})`);
    const missing = want.filter((k, i, a) => got.filter((q) => q === k).length < a.filter((q) => q === k).length);
    const extra = got.filter((k, i, a) => want.filter((q) => q === k).length < a.filter((q) => q === k).length);
    ok(missing.length === 0, `I ${name}: akcje bez strefy na konsoli: ${[...new Set(missing)].join(' ; ')}`);
    ok(extra.length === 0, `I ${name}: strefy konsoli spoza zamrożonego zbioru: ${[...new Set(extra)].join(' ; ')}`);
  });
}

// ═══ W — integracja z pełnym rysunkiem konsoli ═══════════════════════════════════════════════════════════════════
header('W  pełny rysunek Dowództwa: inspektor konsoli (zawsze — także przy consoleKit false)');
await safe('W', () => {
  for (const kit of [true, false]) {
    const { ov } = scene('hangar');
    window.KOSMOS.uiManager.setSelectedVesselId('v_1');
    FEAT.consoleKit = kit;
    ov._visible = true; ov._activeTab = 'tactical';
    const ctx = mockCtx();
    ov.draw(ctx, 1280, 833);
    const insp = ov.consoleZones?.inspector;
    const inInsp = (z) => !!insp && z.x >= insp.x - 1 && z.x + z.w <= insp.x + insp.w + 1;
    const types = new Set(ov._hitZones.filter(inInsp).map((z) => z.type));
    ok(types.has('undock') && types.has('disband') && types.has('rename'), `W consoleKit ${kit}: strefy statku w strefie inspektora konsoli (undock, disband, rename)`);
    const consoleText = ctx.log.some((s) => s === `[ ${t('cmdInsp.undock').toUpperCase()} ]`);
    ok(consoleText, `W consoleKit ${kit}: czip konsoli „${t('cmdInsp.undock')}” jest`);
  }
  FEAT.consoleKit = true;
});

// ═══ D — powody wyłączonych akcji ════════════════════════════════════════════════════════════════════════════════
header('D  czip wyłączony = powód i18n (PL + EN, bez surowych id), bez strefy');
const RAW = /\b[a-z]+_[a-z_]+\b|\b[a-z]+\.[a-z][A-Za-z]+\b/;
let disabledSeen = 0;
for (const name of Object.keys(STATES)) {
  await safe(`D ${name}`, () => {
    const { disabled, zones } = onDraw(name);
    for (const d of disabled) {
      disabledSeen++;
      if (d.reasonKey) {
        ok(typeof PL[d.reasonKey] === 'string' && typeof EN[d.reasonKey] === 'string', `D ${name}: powód ${d.reasonKey} w PL i EN`);
        const txt = t(d.reasonKey, ...(d.args ?? []));
        ok(txt !== d.reasonKey && !RAW.test(txt), `D ${name}: powód czytelny „${txt}”`);
      } else {
        ok(typeof d.text === 'string' && d.text.length > 3 && !RAW.test(d.text), `D ${name}: powód tekstem „${d.text}”`);
      }
      const inZone = zones.some((z) => z.x === d.rect.x && z.y === d.rect.y && z.w === d.rect.w);
      ok(!inZone, `D ${name}: czip wyłączony bez strefy trafień`);
    }
  });
}
ok(disabledSeen >= 10, `D świadek — czipów wyłączonych w stanach: ${disabledSeen}`);
await safe('D konkret', () => {
  const key = (name, id) => {
    const { disabled } = onDraw(name);
    return disabled.map((d) => d.reasonKey);
  };
  ok(key('flight').includes('cmdInsp.reasonRefuelDock'), 'D lot: tankowanie wyłączone — „zadokuj”');
  ok(key('dock_noyard').includes('cmdInsp.reasonScrapShipyard'), 'D dok bez stoczni: rozbiórka — „zbuduj stocznię”');
  ok(key('orbit').includes('cmdInsp.reasonScrapDock'), 'D orbita: rozbiórka — „zadokuj w kolonii ze stocznią”');
  const fl = onDraw('flight');
  ok(fl.ctx.log.includes(t('cmdInsp.noOrdersFlight')) && !fl.ctx.log.includes(t('fleet.noAvailableActions')),
    `D lot bez akcji misji, z logistyką: „${t('cmdInsp.noOrdersFlight')}” zamiast „${t('fleet.noAvailableActions')}”`);
  const im = onDraw('immobilized');
  const s = t('fleet.upkeepShortfall', 252);
  ok(im.ctx.log.some((q) => q.includes(s)), `D unieruchomiony: konkretna naprawa „${s}” w inspektorze`);
});

// ═══ F — flota ════════════════════════════════════════════════════════════════════════════════════════════════════
header('F  inspektor floty: strefy == zamrożony multizbiór (z `fleetDisband`)');
const FLEET = { id: 'fl_a', name: 'Pierwsza', memberIds: ['v_1', 'v_2'], activeOrder: null, doctrine: 'retreat_at_50', retreatThreshold: 0.3 };
function fleetScene() {
  world(ship(), { fleets: [FLEET] }, [ship({ id: 'v_2', name: 'Druga', fuel: { current: 6, max: 60, consumption: 2 } })]);
  const ov = new FleetManagerOverlay();
  ov._selectedFleetId = 'fl_a'; ov._selectedVesselId = null;
  return ov;
}
await safe('F', () => {
  const on = fleetScene(); on._hitZones = []; on._cmdDisabled = [];
  const ctx = mockCtx();
  IV.drawInspector(on, ctx, BODY, consoleRoles(), env());
  const sn = on._hitZones.map(short).sort();
  ok(EXPECT_FLEET.length > 0 && sn.length > 0, `F świadek — strefy floty (${sn.length})`);
  ok(JSON.stringify(sn) === JSON.stringify(EXPECT_FLEET), `F strefy floty == zamrożone\n      jest: ${sn.join(' ; ')}`);
  ok(sn.some((k) => k.startsWith('fleetDisband(')), 'F rozwiązanie floty na konsoli (Finding 747)');
  ok(on._cmdDisabled.some((d) => d.reasonKey === 'cmdInsp.reasonNoFleetOrder'), 'F anulowanie bez rozkazu: wyłączone z powodem (dziś: brak strefy)');
  const all = ctx.log.join('');   // liczby kratki cyfr rysowane znak po znaku
  ok(all.includes('30.0 AU'), 'F podsumowanie: najmniejszy zasięg (v_2: 60/2 = 30 AU)');
  ok(all.includes('10%'), 'F podsumowanie: najmniej paliwa 10% (v_2 6/60)');
});

// ═══ K — Finding 747 ═════════════════════════════════════════════════════════════════════════════════════════════
header('K  Finding 747: nowa flota (lista) i rozwiązanie floty (inspektor) osiągalne i trafiają do handlerów');
await safe('K', () => {
  const ov = fleetScene();
  FEAT.consoleKit = true;
  ov._visible = true; ov._activeTab = 'tactical';
  ov.draw(mockCtx(), 1280, 833);
  const zc = ov._hitZones.find((z) => z.type === 'fleetCreate');
  const zd = ov._hitZones.find((z) => z.type === 'fleetDisband' && z.data?.fleetId === 'fl_a');
  ok(!!zc && !!ov.consoleZones && zc.x >= ov.consoleZones.list.x && zc.x < ov.consoleZones.list.x + ov.consoleZones.list.w,
    'K strefa `fleetCreate` w strefie listy konsoli');
  ok(!!zd && zd.x >= ov.consoleZones.inspector.x, 'K strefa `fleetDisband` w inspektorze floty');
  const calls = [];
  ov._handleCreateFleet = () => calls.push('create');
  ov._handleDisbandFleet = (id) => calls.push(`disband:${id}`);
  if (zc) ov.handleClick(zc.x + zc.w / 2, zc.y + zc.h / 2);
  if (zd) ov.handleClick(zd.x + zd.w / 2, zd.y + zd.h / 2);
  ok(calls.includes('create'), 'K klik [ + NOWA FLOTA ] → `_handleCreateFleet`');
  ok(calls.includes('disband:fl_a'), 'K klik [ ROZWIĄŻ FLOTĘ ] → `_handleDisbandFleet(fl_a)` (dzisiejsze potwierdzenie)');
});

// ═══ M — zaznaczenie wielokrotne ════════════════════════════════════════════════════════════════════════════════
header('M  podsumowanie zaznaczenia: najwolniejszy / zasięg / paliwo + akcje zbiorcze');
await safe('M', () => {
  world(ship(), {}, [ship({ id: 'v_2', name: 'Druga', fuel: { current: 6, max: 60, consumption: 2 } })]);
  const ov = new FleetManagerOverlay();
  FEAT.consoleKit = true;
  window.KOSMOS.uiManager.setSelectedVesselId(null);
  ov._selectedVesselId = null; ov._visible = true; ov._activeTab = 'tactical';
  ov._multiSelectedIds.add('v_1'); ov._multiSelectedIds.add('v_2');
  const ctx = mockCtx();
  ov.draw(ctx, 1280, 833);
  for (const k of ['cmdInsp.slowest', 'cmdInsp.minRange', 'cmdInsp.minFuel']) ok(ctx.log.some((q) => q === t(k)), `M wiersz „${t(k)}”`);
  ok(ctx.log.join('').includes('10%'), 'M najmniej paliwa = 10%');
  const types = new Set(ov._hitZones.map((z) => z.type));
  ok(types.has('fleetAssignMenuOpen') && types.has('fleetClearMultiSelect'), 'M akcje zbiorcze zostają');
});

// ═══ R — forma skrócona roli ════════════════════════════════════════════════════════════════════════════════════
header('R  kolumna ROLA: forma skrócona dla każdej roli');
await safe('R', () => {
  const roles = new Set([...Object.keys(ROLE_GLYPHS).filter((r) => r !== 'station'), 'envoy']);
  ok(roles.size >= 8, `R świadek — ról: ${roles.size}`);
  for (const r of roles) {
    ok(CL.ROLE_SHORT_IDS?.includes(r), `R rola ${r} w katalogu formy skróconej`);
    for (const [lang, D] of [['PL', PL], ['EN', EN]]) {
      const tag = D[`cmdConsole.roleTag.${r}`];
      ok(typeof tag === 'string' && tag.length >= 2 && tag.length <= 4, `R ${lang} ${r}: znacznik „${tag}” (2–4 znaki)`);
    }
    const s = CL.roleShort?.(r, t);
    ok(!!s && s.text.startsWith(CL.ROLE_SHORT_GLYPHS[r]) && s.full.length > s.tag.length && !RAW.test(s.full), `R ${r}: „${s?.text}” / „${s?.full}”`);
  }
  ok(PL['cmdConsole.roleTag.scout'] === 'ZWD', 'R zwiadowca: „ZWD” (decyzja właściciela po bramce K7-B)');
  ok(CL.roleShort?.(null, t)?.text === '—' && CL.roleShort?.('zzz_unknown', t)?.text === '—', 'R rola nieznana → kreska (bez surowego id)');
});

// ═══ C — kolumny puste ═════════════════════════════════════════════════════════════════════════════════════════
header('C  kolumny puste dla wszystkich widocznych wierszy → minimum, nie znikają');
await safe('C', () => {
  const rows = [{ kind: 'own', name: 'a', role: 'cargo', eta: null, alertCount: 0, fleetName: null, fromName: null, toName: null, stateKey: 'x', activityKey: 'y', fuelPct: 0.5 },
    { kind: 'own', name: 'b', role: 'cargo', eta: { year: 12 }, alertCount: 0, fleetName: 'F', fromName: null, toName: null, stateKey: 'x', activityKey: null, fuelPct: 0.5 }];
  const e = CL.emptyColumnIds(rows);
  ok(e.has('alerts') && e.has('from') && e.has('to') && !e.has('eta') && !e.has('fleet') && !e.has('activity'), `C puste: ${[...e].join(',')}`);
  ok(CL.emptyColumnIds([]).size === 0, 'C pusta tabela → nic nie zwężamy');
  const base = CL.registryColumnLayout(0, 760);
  const sh = CL.registryColumnLayout(0, 760, { shrink: e });
  ok(sh.cols.length === base.cols.length, `C liczba kolumn bez zmian (${sh.cols.length})`);
  for (const id of e) {
    const c = sh.cols.find((q) => q.id === id);
    ok(c && c.w > 0 && c.w <= CL.CMD_TABLE.MIN_COL_W, `C ${id}: ${c?.w}px (minimum, nie zero)`);
  }
  const nm = (l) => l.cols.find((q) => q.id === 'name').w;
  ok(nm(sh) > nm(base), `C zwolnione miejsce idzie do nazwy (${nm(base)} → ${nm(sh)})`);
  const last = sh.cols[sh.cols.length - 1];
  ok(last.x + last.w <= 760 - CL.CMD_TABLE.FOCUS_W + 1, 'C tabela mieści się w szerokości');
});

// ═══ A — okna dialogowe z prostokąta strefy ═════════════════════════════════════════════════════════════════════
header('A  okna dialogowe z `consoleZones` przy 1600×1041 i 1280×833 (bez window.inner* w handlerach)');
const realStyleDom = () => {
  const ce = document.createElement;
  document.createElement = (tag) => { const el = ce(tag); el.style = {}; return el; };
  return () => { document.createElement = ce; };
};
const lastOverlay = () => document.body.children[document.body.children.length - 1];
for (const [iw, ih, sc] of [[1600, 1041, 1.25], [1280, 833, 1]]) {
  await safe(`A ${iw}`, async () => {
    globalThis.innerWidth = iw; globalThis.innerHeight = ih;
    const restore = realStyleDom();
    try {
      const ov = fleetScene();
      FEAT.consoleKit = true;
      ov._visible = true; ov._activeTab = 'tactical';
      ov.draw(mockCtx(), Math.round(iw / sc), Math.round(ih / sc));
      const z = ov.consoleZones;
      globalThis.innerWidth = 333; globalThis.innerHeight = 222;   // handler nie może czytać okna
      const cases = [
        ['rozwiązanie floty', () => ov._handleDisbandFleet('fl_a'), z.inspector],
        ['zmiana nazwy floty', () => ov._handleRenameFleet('fl_a'), z.inspector],
        ['zmiana nazwy statku', () => ov._renameVessel('v_1'), z.inspector],
        ['rozbiórka statku', () => ov._confirmVesselDisband(window.KOSMOS.vesselManager.getVessel('v_1')), z.inspector],
        ['nowa flota', () => ov._handleCreateFleet(), z.list],
      ];
      for (const [label, open, rect] of cases) {
        const n0 = document.body.children.length;
        open();
        for (let i = 0; i < 20 && document.body.children.length === n0; i++) await new Promise((r) => setTimeout(r, 5));
        const o = lastOverlay();
        const panel = o?.children?.[0];
        ok(document.body.children.length > n0 && !!panel, `A ${iw} ${label}: okno otwarte`);
        if (!panel) continue;
        const exp = IL.dialogAnchorCss(rect, sc, { frame: z.frame, dy: 22 });
        const px = (v) => parseFloat(v);
        ok(panel.style.position === 'absolute' && px(panel.style.left) === exp.left && px(panel.style.top) === exp.top && px(panel.style.width) === exp.width,
          `A ${iw} ${label}: panel w (${panel.style.left}, ${panel.style.top}, ${panel.style.width}) = strefa × ${sc} (${exp.left}, ${exp.top}, ${exp.width})`);
        ok(exp.left + exp.width <= iw && exp.top < ih && exp.left >= 0, `A ${iw} ${label}: okno w oknie przeglądarki`);
        document.body.removeChild(o);
      }
      // trwałość (KZ-Command): kotwica nie zależy od flag — przy consoleKit false ta sama co przy true
      const a1 = ov._dialogAnchor('inspector');
      FEAT.consoleKit = false;
      const a0 = ov._dialogAnchor('inspector');
      FEAT.consoleKit = true;
      ok(!!a1 && JSON.stringify(a0) === JSON.stringify(a1), `A ${iw} consoleKit false: ta sama kotwica (${JSON.stringify(a0)})`);
      ov._activeTab = 'atlas';
      ok(ov._dialogAnchor('inspector') === null, `A ${iw} inna zakładka: brak kotwicy`);
    } finally { restore(); }
  });
}
await safe('A źródło', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('../../ui/FleetManagerOverlay.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const body = (name) => { const i = src.indexOf(`  ${name}(`); const j = src.indexOf('\n  }\n', i); return i >= 0 ? src.slice(i, j) : ''; };
  for (const fn of ['_dialogAnchor', 'async _handleDisbandFleet', 'async _handleRenameFleet', 'async _renameVessel', 'async _confirmVesselDisband', 'async _handleCreateFleet']) {
    const b = body(fn);
    ok(b.length > 0, `A źródło: świadek ${fn}`);
    ok(!/window\.inner|innerWidth|innerHeight/.test(b), `A źródło: ${fn} bez window.inner*`);
  }
  const da = body('_dialogAnchor');
  ok(da.length > 0 && /consoleZones/.test(da) && !/kitOn|isKitScreen|FEATURES|consoleCommand/.test(da), 'A źródło: `_dialogAnchor` bez warunku flagi (tylko reguła zakładki / anyTab)');
  const a = { left: 10, top: 20, width: 300 };
  const ov1 = { style: {} }, p1 = { style: {} };
  ok(MA.applyModalAnchor?.(ov1, p1, a) === true && p1.style.left === '10px' && ov1.style.justifyContent === 'flex-start', 'A applyModalAnchor: panel na kotwicy');
  const ov2 = { style: {} }, p2 = { style: {} };
  ok(MA.applyModalAnchor?.(ov2, p2, null) === false && Object.keys(p2.style).length === 0 && Object.keys(ov2.style).length === 0,
    'A applyModalAnchor bez kotwicy: style nietknięte (okno jak dziś)');
});

// ═══ L — czysta logika ═════════════════════════════════════════════════════════════════════════════════════════
header('L  czysta logika inspektora');
await safe('L', () => {
  const u = IL.upkeepLines({ upkeep: 300, unpaid: 2, treasury: 48, immobilized: true });
  ok(u.alert && u.lines.some((l) => l.key === 'fleet.upkeepShortfall' && l.args[0] === 252 && l.tone === 'alert'), 'L utrzymanie: brakuje 252 Kr (alert)');
  ok(IL.upkeepLines({ upkeep: 300, unpaid: 1, treasury: 5000 }).lines.some((l) => l.key === 'fleet.arrearsClearsSoon'), 'L utrzymanie: skarbiec wystarcza → kara zejdzie');
  ok(IL.upkeepLines({ upkeep: 300 }).alert === false, 'L utrzymanie bez zaległości: bez alarmu');
  ok(IL.meter(5, 60)?.tone === 'alert' && IL.meter(40, 60)?.tone === 'primary' && IL.meter(1, 0) === null, 'L przyrząd: próg 20 %, brak maks. → null');
  ok(IL.hullState({ damaged: false }).key === 'cmdInsp.hullOk' && IL.hullState({ damaged: true, _repairProgress: 0.5 }).key === 'cmdInsp.hullRepair', 'L kadłub');
  const gs = IL.groupStats([{ speedAU: 2, rangeAU: 30, fuelPct: 0.1 }, { speedAU: 1.5, rangeAU: 60, fuelPct: 0.6 }], 3);
  ok(gs.slowestSpeed === 1.5 && gs.minRange === 30 && gs.minFuelPct === 0.1 && gs.lowFuel === 1 && gs.count === 3 && gs.present === 2, 'L podsumowanie grupy');
  const g = IL.shipActionGroups({ vesselId: 'v', docked: true, dockedAt: 'p', actions: [], canDisband: false, hasShipyard: false, refuelAuto: true });
  ok(g.primary[0]?.zone?.type === 'undock' && g.destructive[0]?.zone === null && g.destructive[0]?.reasonKey === 'cmdInsp.reasonScrapShipyard', 'L grupy: start w głównych, rozbiórka na końcu z powodem');
  ok(IL.SHIP_ACTION_GROUPS.join() === 'primary,orders,logistics,destructive', 'L kolejność grup');
  ok(IL.noOrdersKey?.('in_transit', 0, 3) === 'cmdInsp.noOrdersFlight' && IL.noOrdersKey?.('orbiting', 0, 1) === 'cmdInsp.noOrdersOrbit'
    && IL.noOrdersKey?.('docked', 0, 1) === 'cmdInsp.noOrdersDock' && IL.noOrdersKey?.('weird', 0, 1) === 'cmdInsp.noOrdersState'
    && IL.noOrdersKey?.('in_transit', 0, 0) === 'fleet.noAvailableActions' && IL.noOrdersKey?.('docked', 2, 3) === null, 'L linia „brak rozkazów” wg stanu');
  for (const k of ['cmdInsp.noOrdersFlight', 'cmdInsp.noOrdersOrbit', 'cmdInsp.noOrdersDock', 'cmdInsp.noOrdersState']) ok(!!PL[k] && !!EN[k], `L ${k} w PL i EN`);
  const fg = IL.fleetActionGroups({ fleetId: 'f', hasOrder: true, engagePick: false });
  ok(fg.orders.every((c) => c.zone?.data?.fleetId === 'f') && fg.destructive[0].zone.type === 'fleetDisband', 'L flota: rozkazy + rozwiązanie');
  const an = IL.dialogAnchorCss({ x: 1000, y: 100, w: 300, h: 500 }, 1.25, { frame: { x: 0, y: 0, w: 1280, h: 833 }, dy: 22 });
  ok(an.left === 1225 && an.top === 153 && an.width === 375, `L kotwica dociągnięta do prawej krawędzi ramy (980 × 1.25): ${JSON.stringify(an)}`);
});

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'} — ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
