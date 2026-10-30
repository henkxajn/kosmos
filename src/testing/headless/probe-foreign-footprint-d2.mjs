// SONDA (read-only) — D-2 (post-warp foreign actions): czy NORMALNA ścieżka startu kolonizacji
// (rejestr → „Kolonizuj" z doku → MissionSystem._launchColony → przylot) jest dostępna w układzie
// innym niż domowy, w którym gracz MA kolonię. Pomiar PRZED kodem — od wyniku zależy granica
// „śladu kolonii" (podpis D-2: jeśli ścieżka NIE jest tam dostępna — STOP, wybór granicy należy do właściciela).
//
// Klasy (każda w osobnym, żywym świecie):
//   F  pełna kolonia gracza w układzie B (założona chipem „Kolonizuj" — autoSpaceport), drugi kolonizator MEDIUM
//   O  wyłącznie PLACÓWKA gracza w układzie C (z ładunku — „Rozładuj"), kolonizator MEDIUM i SMALL
// Uruchom: node src/testing/headless/probe-foreign-footprint-d2.mjs

import './env.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GameCore } from './GameCore.js';
import { Ticker } from './Ticker.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { FleetSystem } from '../../systems/FleetSystem.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { getAvailableActions, FLEET_ACTIONS } from '../../data/FleetActions.js';
import { buildShipPanelModel, runShipPanelAction } from '../../ui/ShipPanelHudLogic.js';
import { RightClickMenu } from '../../ui/RightClickMenu.js';
import { buildMenuOptions } from '../../data/RightClickMenuOptions.js';
import { loadColonists } from '../../entities/Vessel.js';
import { hasSpaceportAt } from '../../utils/SpaceportCheck.js';

const H = (s) => console.log('\n== ' + s + ' ' + '='.repeat(Math.max(0, 70 - s.length)));
const J = (o) => JSON.stringify(o);

function buildWorld() {
  const core = new GameCore();
  core.boot({ solo: true, quiet: true });
  const K = window.KOSMOS;
  K.movementOrderSystem = new MovementOrderSystem(K.vesselManager);
  K.orderService = new OrderService();
  // ⚠ FleetSystem jak w GameScene:300 — to on domyka rozkaz „Dokuj tutaj" (`_maybeDockOnArrival`). Bez niego
  //   ZADEN dok nie dochodzi do skutku i pomiar normalnej sciezki bylby jalowy (zmierzone: pierwsza wersja sondy).
  K.fleetSystem = new FleetSystem(K.vesselManager);
  const journal = [];
  K.eventLogSystem = { push: (e) => journal.push(e), serialize: () => [], restore: () => {} };
  let selected = null;
  K.uiManager = { getSelectedVesselId: () => selected, getSelectedVesselIds: () => (selected ? [selected] : []),
    getSelectedFleetId: () => null, setSelectedFleetId: () => {}, setSelectedVesselId: (id) => { selected = id; } };
  K.techSystem.grantTechs(['rocketry', 'colonization', 'exploration', 'ion_drives', 'warp_drive', 'orbital_survey']);
  const failed = [];
  EventBus.on('mission:failed', (d) => failed.push(d?.reason));
  const home = K.homePlanet;
  const homeCol = K.colonyManager.getColony(home.id);
  homeCol.credits = 1e9;
  // Magazyn startu kolonizacji (COLONY_LAUNCH_COST) — aktywna kolonia; nie mierzymy ekonomii, tylko DOSTĘPNOŚĆ ścieżki.
  const rs = homeCol.resourceSystem;
  for (const id of ['Fe', 'C', 'Si', 'Cu', 'Ti', 'food', 'water', 'energy', 'minerals', 'organics']) { try { rs.receive?.({ [id]: 5000 }); } catch {} }
  const sysHome = K.galaxyData.systems.find(s => s.id === 'sys_home');
  const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
  const near = K.galaxyData.systems.filter(s => s.id !== 'sys_home')
    .map(s => ({ s, d: d3(s, sysHome) })).filter(o => o.d <= (GAME_CONFIG.WARP_MAX_JUMP_LY ?? 10)).sort((a, b) => a.d - b.d);
  return { K, vm: K.vesselManager, home, homeCol, sysB: near[0]?.s?.id, sysC: near[1]?.s?.id, journal, failed,
    select: (id) => { selected = id; } };
}
const tickUntil = (K, pred, maxCiv = 80, step = 0.05) => new Ticker(K.timeSystem).run(maxCiv, { tickSize: step, shouldStop: () => pred() });
function mk(w, name, hull, modules, colonists = 0) {
  const v = w.vm.createAndRegister(hull, w.home.id, { name, modules });
  v.warpFuel.current = v.warpFuel.max; v.fuel.current = v.fuel.max;
  if (colonists > 0) {
    const n = loadColonists(v, colonists, w.homeCol.civSystem);
    if (!(n > 0)) w.homeCol.civSystem && console.log(`  (uwaga: loadColonists(${name}) = ${n}, freePops=${w.homeCol.civSystem.freePops})`);
  }
  return v;
}
function warpTo(w, v, sys) {
  const r = w.K.orderService.issueWarp(v.id, sys);
  tickUntil(w.K, () => v.mission?.phase === 'in_system', 120);
  return r?.ok === true && v.systemId === sys;
}
const bodiesOf = (sys) => [...EntityManager.getByTypeInSystem('planet', sys), ...EntityManager.getByTypeInSystem('moon', sys),
  ...EntityManager.getByTypeInSystem('planetoid', sys)];
const colonizableForeign = (b) => b.type === 'planetoid' || (b.type === 'planet' && (b.planetType === 'rocky' || b.planetType === 'ice'));
const colonizableNormal = (b) => b.type === 'planetoid' || b.type === 'moon' || (b.type === 'planet' && (b.planetType === 'rocky' || b.planetType === 'ice'));
function makeFmo() { let o; try { o = new FleetManagerOverlay(); } catch { o = Object.create(FleetManagerOverlay.prototype); }
  o._hitZones = []; o._missionConfig = null; o._cachedTargets = null; o._cachedTargetsKey = null; return o; }
function telescope(w, body) {
  w.K.observatorySystem.getMaxObservatoryLevel = () => 1;
  w.K.observatorySystem.startBodyScan(body.id);
  tickUntil(w.K, () => body.explored === true, 5);
  return body.explored === true;
}
function atlasTo(w, v, body) {          // trasa „wiersz Atlasu" (jedyny żywy producent przekierowania)
  w.K.activeSystemId = v.systemId;
  const o = makeFmo(); o._selectedVesselId = v.id;
  o._handleHit({ type: 'map_body', data: { bodyId: body.id } });
  tickUntil(w.K, () => v.mission?.type === 'exploration' && v.mission?.phase === 'orbiting_body' && v.position.dockedAt === body.id, 80, 0.02);
  return v.mission?.phase === 'orbiting_body';
}
function chip(w, v, id) {
  const fmo = makeFmo(); fmo._selectedVesselId = v.id;
  const m = buildShipPanelModel(v, { K: w.K, fmo, features: GAME_CONFIG.FEATURES });
  return { c: m?.chips?.find(c => c.id === id) ?? null, fmo };
}
function ppm(w, v, body, optId) {
  w.K.activeSystemId = v.systemId; w.select(v.id);
  const target = { type: 'planet', entityId: body.id, planet: body, worldPoint: { x: body.x / 10, y: 0, z: body.y / 10 } };
  const opt = buildMenuOptions(target, v.id).find(o => o.id === optId);
  if (!opt) return false;
  new RightClickMenu()._handleOptionClick(opt, target);
  return true;
}
/** NORMALNA ścieżka kolonizacji z rejestru dla statku w doku — wszystkie ogniwa po kolei. */
function normalPath(w, v, target) {
  const st = { missionSystem: w.K.missionSystem, vesselManager: w.vm, colonyManager: w.K.colonyManager,
    techSystem: w.K.techSystem, activePlanetId: w.K.colonyManager.activePlanetId };
  const offered = getAvailableActions(v, st).find(a => a.action.id === 'colonize');
  const fmo = makeFmo(); fmo._selectedVesselId = v.id;
  const targets = fmo._getValidTargets(v, 'colonize');
  const inPicker = targets.some(tg => tg.id === target.id);
  const can = FLEET_ACTIONS.colonize.canExecute(v, { ...st, targetId: target.id });
  const f0 = w.failed.length;
  // Stan PO modalu kolonistów (kolonista już na pokładzie) → potwierdzenie (`_executeMission`).
  fmo._missionConfig = { actionId: 'colonize', targetId: target.id, step: 'confirm', colonistCount: 0 };
  fmo._executeMission();
  const launched = v.position.state === 'in_transit' && v.mission?.type === 'colony';
  tickUntil(w.K, () => !!w.K.colonyManager.getColony(target.id), 80, 0.05);
  const col = w.K.colonyManager.getColony(target.id);
  return { offered: offered ? (offered.ok ? 'OK' : 'x(' + offered.reason + ')') : 'BRAK', inPicker, canExecute: can,
    launched, colonyFounded: !!col && !col.ownerEmpireId && !col.isOutpost, refusals: w.failed.slice(f0) };
}

// ══ F — pełna kolonia gracza w układzie B ════════════════════════════════════════════════
H('F  pełna kolonia gracza w układzie B (nie-domowym) → drugi kolonizator MEDIUM w doku → normalny start');
{
  const w = buildWorld();
  const CS = mk(w, 'Kolonizator', 'hull_medium', ['engine_warp', 'warp_tank', 'habitat_pod'], 2);
  const CS2 = mk(w, 'Kolonizator II', 'hull_medium', ['engine_warp', 'warp_tank', 'habitat_pod'], 2);
  console.log('  koloniści na pokładzie: CS', CS.colonists, '| CS2', CS2.colonists);
  console.log('  skok CS →', w.sysB, warpTo(w, CS, w.sysB), '| skok CS2 →', warpTo(w, CS2, w.sysB));
  const bs = bodiesOf(w.sysB);
  const Xb = bs.find(b => colonizableForeign(b) && !b.explored);
  const Yb = bs.find(b => b !== Xb && colonizableNormal(b) && !b.explored);
  console.log('  teleskop Xb', telescope(w, Xb), '| Yb', telescope(w, Yb), '|', Xb.id, Xb.planetType ?? Xb.type, '/', Yb.id, Yb.planetType ?? Yb.type);
  console.log('  CS trasa Atlas → stan C:', atlasTo(w, CS, Xb));
  const { c, fmo } = chip(w, CS, 'foreign_colonize');
  if (c?.enabled) runShipPanelAction(c.zone, { fmo });
  tickUntil(w.K, () => !!w.K.colonyManager.getColony(Xb.id), 3);
  const colX = w.K.colonyManager.getColony(Xb.id);
  console.log('  kolonia na Xb (pełna) =', !!colX && !colX.isOutpost, '| port na Xb =', hasSpaceportAt(Xb.id), '| systemId Xb =', Xb.systemId);
  console.log('  PPM „Dokuj tutaj" na Xb dla CS2 — opcja dostępna:', ppm(w, CS2, Xb, 'dock'));
  tickUntil(w.K, () => CS2.position.state === 'docked' || (!CS2.movementOrder && CS2.position.state === 'orbiting' && CS2.mission == null), 80, 0.02);
  console.log('  CS2 po doku:', J({ st: CS2.position.state, at: CS2.position.dockedAt, sys: CS2.systemId, col: CS2.colonyId, status: CS2.status }));
  console.log('  NORMALNA ścieżka CS2 → Yb:', J(normalPath(w, CS2, Yb)));
}

// ══ O — wyłącznie placówka gracza w układzie C ═══════════════════════════════════════════
H('O  wyłącznie PLACÓWKA gracza w układzie C → kolonizator MEDIUM i SMALL → dok → normalny start');
{
  const w = buildWorld();
  const CG = mk(w, 'Frachtowiec', 'hull_medium', ['engine_warp', 'warp_tank', 'cargo_small']);
  CG.cargo = { Fe: 100 }; CG.cargoUsed = 100;
  const CSm = mk(w, 'Kolonizator M', 'hull_medium', ['engine_warp', 'warp_tank', 'habitat_pod'], 2);
  const CSs = mk(w, 'Kolonizator S', 'hull_small', ['engine_warp', 'warp_tank', 'habitat_pod'], 2);
  console.log('  koloniści: M', CSm.colonists, '| S', CSs.colonists, '| uklad C =', w.sysC);
  console.log('  skoki →', warpTo(w, CG, w.sysC), warpTo(w, CSm, w.sysC), warpTo(w, CSs, w.sysC));
  const bs = bodiesOf(w.sysC);
  const Zc = bs.find(b => colonizableForeign(b) && !b.explored);
  const T1 = bs.find(b => b !== Zc && colonizableNormal(b) && !b.explored);
  const T2 = bs.find(b => b !== Zc && b !== T1 && colonizableNormal(b) && !b.explored);
  console.log('  teleskop Zc/T1/T2', telescope(w, Zc), telescope(w, T1), telescope(w, T2));
  console.log('  CG trasa Atlas → stan C:', atlasTo(w, CG, Zc));
  const { c, fmo } = chip(w, CG, 'foreign_unload');
  if (c?.enabled) runShipPanelAction(c.zone, { fmo });
  tickUntil(w.K, () => !!w.K.colonyManager.getColony(Zc.id), 3);
  const colZ = w.K.colonyManager.getColony(Zc.id);
  console.log('  placówka na Zc =', !!colZ && colZ.isOutpost === true, '| gracza =', !!colZ && !colZ.ownerEmpireId, '| port =', hasSpaceportAt(Zc.id));
  console.log('  getPlayerColonies() w układzie C =', w.K.colonyManager.getPlayerColonies().filter(c2 => EntityManager.get(c2.planetId)?.systemId === w.sysC).map(c2 => c2.planetId + (c2.isOutpost ? ' (placówka)' : '')));
  for (const [v, tgt] of [[CSm, T1], [CSs, T2]]) {
    console.log(`  [${v.name}] PPM „Dokuj tutaj" na placówce — opcja dostępna:`, ppm(w, v, Zc, 'dock'));
    tickUntil(w.K, () => v.position.state === 'docked' || (!v.movementOrder && v.position.state === 'orbiting' && v.mission == null), 80, 0.02);
    console.log(`  [${v.name}] po doku:`, J({ st: v.position.state, at: v.position.dockedAt, col: v.colonyId, status: v.status }));
    console.log(`  [${v.name}] NORMALNA ścieżka → ${tgt.id}:`, J(normalPath(w, v, tgt)));
  }
}
console.log('\n[probe D-2] koniec');
