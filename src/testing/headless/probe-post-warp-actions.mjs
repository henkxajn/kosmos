// SONDA (read-only, POZA REPO) — post-warp: kolonizacja i skan w obcym układzie.
// Uruchom z katalogu migawki HEAD: node src/testing/headless/probe-post-warp-actions.mjs
//
// Świat = PRAWDZIWY GameCore (galaktyka, StarSystemManager, VesselManager, MissionSystem,
// ObservatorySystem, ColonyManager, TechSystem) + MOS + OrderService jak w GameScene.
// Skok = PRODUKCYJNA ścieżka OrderService.issueWarp → WarpRouteSystem.beginJourney →
// dispatchInterstellar; przylot = VesselManager._tickInterstellar przez Ticker (time:tick).
// Teleskop = ObservatorySystem.startBodyScan + _tickBodyScans (bramka poziomu obserwatorium
// nadpisana na instancji — fixture nie ma budynku; zapis explored to kod produkcyjny).

import './env.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GameCore } from './GameCore.js';
import { Ticker } from './Ticker.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { getAvailableActions, FLEET_ACTIONS } from '../../data/FleetActions.js';
import { buildShipPanelModel, runShipPanelAction } from '../../ui/ShipPanelHudLogic.js';
import { systemIdOf } from '../../utils/SystemScope.js';
import { RightClickMenu } from '../../ui/RightClickMenu.js';
import { buildMenuOptions } from '../../data/RightClickMenuOptions.js';
import { t } from '../../i18n/i18n.js';

const AU = GAME_CONFIG.AU_TO_PX;
const H = (s) => console.log('\n== ' + s + ' ' + '='.repeat(Math.max(0, 70 - s.length)));
const J = (o) => JSON.stringify(o);

// ── Świat ──────────────────────────────────────────────────────────────────────────────
function buildWorld() {
  const core = new GameCore();
  core.boot({ solo: true, quiet: true });
  const K = window.KOSMOS;
  K.movementOrderSystem = new MovementOrderSystem(K.vesselManager);
  K.orderService = new OrderService();
  const journal = [];
  K.eventLogSystem = { push: (e) => journal.push(e), serialize: () => [], restore: () => {} };
  let selected = null;
  K.uiManager = {
    getSelectedVesselId: () => selected, getSelectedVesselIds: () => (selected ? [selected] : []),
    getSelectedFleetId: () => null, setSelectedFleetId: () => {}, setSelectedVessel: () => {},
    setSelectedVesselId: (id) => { selected = id; },
  };
  const select = (id) => { selected = id; };
  K.techSystem.grantTechs(['rocketry', 'colonization', 'exploration', 'ion_drives', 'warp_drive', 'orbital_survey']);

  const events = [];
  for (const ev of ['mission:failed', 'mission:started', 'vessel:launched', 'vessel:arrived', 'interstellar:arrived',
    'vessel:fullScanComplete', 'expedition:reconProgress', 'expedition:reconComplete', 'observatory:discovered',
    'expedition:colonyFounded', 'ui:toast', 'order:compositeFailed', 'vessel:interstellarRedirect',
    'expedition:foreignRecon', 'expedition:foreignColonize', 'vessel:orderCompleted']) {
    EventBus.on(ev, (d) => events.push({ ev, d }));
  }

  const vm = K.vesselManager;
  const home = K.homePlanet;
  // Utrzymanie floty nie moze unieruchomic statkow w trakcie pomiaru (artefakt fixture'u: kredyty startowe).
  const homeCol = K.colonyManager.getColony(home.id); if (homeCol) homeCol.credits = 1e9;
  const mk = (name, hull, modules) => {
    const v = vm.createAndRegister(hull, home.id, { name, modules });
    v.warpFuel.current = v.warpFuel.max;
    v.fuel.current = v.fuel.max;
    return v;
  };
  const CS = mk('Kolonizator', 'hull_medium', ['engine_warp', 'warp_tank', 'habitat_pod']);
  const SS = mk('Zwiadowca', 'hull_small', ['engine_warp', 'warp_tank', 'science_lab']);

  // Najbliższy układ w zasięgu jednego skoku (≤ WARP_MAX_JUMP_LY).
  const sysHome = K.galaxyData.systems.find(s => s.id === 'sys_home');
  const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
  const cand = K.galaxyData.systems.filter(s => s.id !== 'sys_home')
    .map(s => ({ s, d: d3(s, sysHome) })).filter(o => o.d <= (GAME_CONFIG.WARP_MAX_JUMP_LY ?? 10))
    .sort((a, b) => a.d - b.d);
  const sysB = cand[0]?.s?.id;
  return { core, K, vm, home, CS, SS, sysB, journal, events, select };
}

function tickUntil(K, pred, maxCivYears = 60, tickSize = 0.05) {
  const tk = new Ticker(K.timeSystem);
  return tk.run(maxCivYears, { tickSize, shouldStop: () => pred() });
}

function snap(v, K) {
  const m = v.mission;
  return {
    id: v.id, systemId: v.systemId, systemIdOf: systemIdOf(v), resolve: K.vesselManager._resolveSystemId(v),
    status: v.status, pos: { state: v.position?.state, dockedAt: v.position?.dockedAt },
    mission: m ? { type: m.type, phase: m.phase ?? null, targetId: m.targetId ?? null, toSystemId: m.toSystemId ?? null } : null,
    order: v.movementOrder ? { type: v.movementOrder.type, status: v.movementOrder.status } : null,
    warp: `${v.warpFuel?.current}/${v.warpFuel?.max}`,
  };
}

function makeFmo() {
  let o;
  try { o = new FleetManagerOverlay(); } catch (e) { o = Object.create(FleetManagerOverlay.prototype); }
  o._hitZones = []; o._rightViewH = 0; o._rightContentH = 0;
  o._collapsedFleets = o._collapsedFleets ?? new Set(); o._collapsedSections = o._collapsedSections ?? new Set();
  o._missionConfig = null; o._cachedTargets = null; o._cachedTargetsKey = null;
  return o;
}
function makeCtx(drawn) {
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '11px mono', textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {},
    closePath() {}, save() {}, restore() {}, clip() {}, rect() {}, setLineDash() {}, getTransform() { return { a: 1, d: 1 }; },
    fillText(txt) { drawn.push(String(txt)); }, measureText(s) { return { width: String(s).length * 6 }; },
    createRadialGradient() { return { addColorStop() {} }; }, createConicGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; }, drawImage() {}, ellipse() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    roundRect() {},
  };
}

function stateObj(K) {
  return { missionSystem: K.missionSystem, vesselManager: K.vesselManager, colonyManager: K.colonyManager,
    techSystem: K.techSystem, activePlanetId: K.colonyManager?.activePlanetId };
}
function actions(v, K) {
  return getAvailableActions(v, stateObj(K)).map(a => `${a.action.id}:${a.ok ? 'OK' : 'x(' + a.reason + ')'}`);
}
function hud(v, K, fmo) {
  const m = buildShipPanelModel(v, { K, fmo, features: GAME_CONFIG.FEATURES });
  if (!m) return null;
  return {
    chips: m.chips.map(c => `${c.id}${c.enabled ? '' : '(off)'}`),
    orders: (m.orders?.items ?? []).map(c => `${c.id.replace('action:', '')}${c.enabled ? '' : '(off)'}`),
    reasons: m.orders?.reasons ?? [],
    info: m.info.map(i => i.text),
    model: m,
  };
}
function drawRightZones(v, K) {
  const o = makeFmo(); o._selectedVesselId = v.id;
  const drawn = [];
  try {
    o._drawRight(makeCtx(drawn), 600, 60, 320, 900, K.vesselManager, K.missionSystem, K.colonyManager, K.colonyManager.activePlanetId);
  } catch (e) { return { error: String(e?.message ?? e) }; }
  return { zones: [...new Set(o._hitZones.map(z => z.type))], text: drawn.filter(s => /PRZYLOT|ARRIVAL|Dotarł|Arrived|Na orbicie|Orbiting|Recon|Kolonizuj|Colonize/i.test(s)) };
}
function targetsBySystem(v, K, actionId) {
  const fmo = makeFmo();
  const list = fmo._getValidTargets(v, actionId);
  const by = {};
  for (const tg of list) by[tg.systemId] = (by[tg.systemId] ?? 0) + 1;
  return { n: list.length, by };
}

function pickBodies(sysB) {
  const bodies = [
    ...EntityManager.getByTypeInSystem('planet', sysB),
    ...EntityManager.getByTypeInSystem('moon', sysB),
    ...EntityManager.getByTypeInSystem('planetoid', sysB),
  ];
  const colonizable = (b) => b.type === 'planetoid' || b.type === 'moon' || (b.type === 'planet' && (b.planetType === 'rocky' || b.planetType === 'ice'));
  const Xb = bodies.find(b => b.type === 'planet' && colonizable(b) && !b.explored) ?? bodies.find(b => colonizable(b) && !b.explored);
  const Yb = bodies.find(b => b !== Xb && colonizable(b) && !b.explored);
  return { bodies, Xb, Yb };
}

function telescopeExplore(K, body) {
  const obs = K.observatorySystem;
  obs.getMaxObservatoryLevel = () => 1;            // bramka „jest obserwatorium" — fixture bez budynku
  const started = obs.startBodyScan(body.id);
  const r = tickUntil(K, () => body.explored === true, 5, 0.05);
  return { started, explored: body.explored, analyzed: body.analyzed ?? false, ticks: r.ticks };
}

function evDelta(w, from) {
  return w.events.slice(from).map(e => {
    const d = e.d ?? {};
    const short = { reason: d.reason, vesselId: d.vesselId ?? d.vessel?.id ?? d.expedition?.vesselId, targetId: d.targetId ?? d.expedition?.targetId ?? d.mission?.targetId, text: d.text, scope: d.scope, planetId: d.planetId };
    for (const k of Object.keys(short)) if (short[k] === undefined) delete short[k];
    return `${e.ev}${Object.keys(short).length ? ' ' + J(short) : ''}`;
  });
}

// ── Wspólny rozruch do stanu A ─────────────────────────────────────────────────────────
function toStateA() {
  const w = buildWorld();
  const { K, CS, SS, sysB } = w;
  const r1 = K.orderService.issueWarp(CS.id, sysB);
  const r2 = K.orderService.issueWarp(SS.id, sysB);
  const arrived = () => CS.mission?.phase === 'in_system' && SS.mission?.phase === 'in_system';
  const tk = tickUntil(K, arrived, 120, 0.05);
  const picks = pickBodies(sysB);
  return { ...w, warp: { r1, r2, ticks: tk.ticks, gameTime: K.timeSystem.gameTime }, ...picks };
}

// ══ §0 — rozruch, skok produkcyjny, przylot ═══════════════════════════════════════════
H('§0  Swiat + skok produkcyjny (OrderService.issueWarp) + przylot (_tickInterstellar)');
const A = toStateA();
console.log('  uklad B =', A.sysB, '| issueWarp CS', J(A.warp.r1?.ok), 'SS', J(A.warp.r2?.ok), '| ticki', A.warp.ticks);
console.log('  zdarzenia interstellar:arrived =', A.events.filter(e => e.ev === 'interstellar:arrived').length);
console.log('  cial w ukladzie B (planet/moon/planetoid) =', A.bodies.length, '| Xb =', A.Xb?.id, A.Xb?.type, A.Xb?.planetType,
  '| Yb =', A.Yb?.id, A.Yb?.type, A.Yb?.planetType);

H('§1  STAN A (po przylocie) — systemId / misja (H1, H2)');
for (const v of [A.CS, A.SS]) console.log('  ', J(snap(v, A.K)));

H('§1b teleskop: ObservatorySystem.startBodyScan + _tickBodyScans na Xb');
console.log('  ', J(telescopeExplore(A.K, A.Xb)), '| Yb explored =', A.Yb?.explored);

H('§2  STAN A — co oferuja powierzchnie');
const fmoA = makeFmo();
for (const v of [A.CS, A.SS]) {
  console.log(`  [${v.name}] getAvailableActions:`, J(actions(v, A.K)));
  const h = hud(v, A.K, fmoA);
  console.log(`  [${v.name}] HUD chips:`, J(h?.chips), '| orders:', J(h?.orders), '| reasons:', J(h?.reasons));
  console.log(`  [${v.name}] HUD info:`, J(h?.info));
  console.log(`  [${v.name}] FMO _drawRight strefy:`, J(drawRightZones(v, A.K)));
}
console.log('  _getValidTargets(CS,colonize) =', J(targetsBySystem(A.CS, A.K, 'colonize')),
  '| (SS,survey) =', J(targetsBySystem(A.SS, A.K, 'survey')));
console.log('  getUnexploredCount(SS) =', J(A.K.missionSystem.getUnexploredCount(A.SS)),
  '| _findNearestUnexplored(SS) =', A.K.missionSystem._findNearestUnexplored(null, A.SS)?.id ?? null,
  '| systemId tego ciala =', A.K.missionSystem._findNearestUnexplored(null, A.SS)?.systemId ?? null);
const homeBody = EntityManager.getByTypeInSystem('planet', 'sys_home').find(p => p !== A.K.homePlanet);
console.log('  _missionTargetOutOfSystem(SS, Xb) =', A.vm._missionTargetOutOfSystem(A.SS, { targetId: A.Xb.id }),
  '| (SS, cialo z sys_home) =', A.vm._missionTargetOutOfSystem(A.SS, { targetId: homeBody?.id }));

H('§3  STAN A — predykaty kolonizacji na Xb (teleskop: explored)');
const stA = { ...stateObj(A.K), targetId: A.Xb.id };
console.log('  FLEET_ACTIONS.colonize.canExecute(CS, Xb) =', J(FLEET_ACTIONS.colonize.canExecute(A.CS, stA)));
console.log('  MissionSystem.canLaunchColony(Xb, CS) =', J(A.K.missionSystem.canLaunchColony(A.Xb.id, A.CS.id)));
console.log('  _isForeignRedirectClickable(CS, Xb) =', fmoA._isForeignRedirectClickable(A.CS.id, A.Xb.id));

H('§4  STAN A — createMission na cialo ukladu B (osobne swiaty, zeby odmowa nie skazila pomiaru)');
for (const [label, fn] of [
  ['survey(SS → Xb explored)', (w) => w.K.missionSystem.createMission('survey', w.SS.id, { targetId: w.Xb.id })],
  ['survey(SS → Yb nieexplored)', (w) => w.K.missionSystem.createMission('survey', w.SS.id, { targetId: w.Yb.id })],
  ['deep_scan(SS)', (w) => w.K.missionSystem.createMission('deep_scan', w.SS.id, {})],
  ['colonize(CS → Xb)', (w) => w.K.missionSystem.createMission('colonize', w.CS.id, { targetId: w.Xb.id })],
]) {
  const w = toStateA(); telescopeExplore(w.K, w.Xb);
  const calls = [];
  const oD = w.vm.dispatchOnMission.bind(w.vm), oR = w.vm.redispatchFromOrbit.bind(w.vm);
  w.vm.dispatchOnMission = (id, m) => { const r = oD(id, m); calls.push(`dispatchOnMission→${r}`); return r; };
  w.vm.redispatchFromOrbit = (id, m) => { const r = oR(id, m); calls.push(`redispatchFromOrbit→${r}`); return r; };
  const n0 = w.K.missionSystem.getActive().length, e0 = w.events.length;
  const before = J(snap(label.startsWith('colonize') ? w.CS : w.SS, w.K));
  fn(w);
  const after = J(snap(label.startsWith('colonize') ? w.CS : w.SS, w.K));
  console.log(`  ${label}: misje ${n0}→${w.K.missionSystem.getActive().length} | dyspozytor ${J(calls)} | stan ${before === after ? 'BEZ ZMIAN' : 'ZMIENIONY'}`);
  console.log('     zdarzenia:', J(evDelta(w, e0)));
}

// ══ §5 — STAN B: „Lecisz do planety" (PPM) na Xb ══════════════════════════════════════
H('§5  STAN B — PPM „Lecisz do planety" (RightClickMenu prawdziwy) na Xb, przylot');
const B = toStateA(); telescopeExplore(B.K, B.Xb);
console.log('  swiat B: Xb =', B.Xb.id, B.Xb.planetType, 'explored', B.Xb.explored, '| Yb =', B.Yb.id);
B.K.activeSystemId = B.sysB;                         // kamera na ukladzie B (Przelacz widok)
for (const v of [B.CS, B.SS]) {
  B.select(v.id);
  const target = { type: 'planet', entityId: B.Xb.id, planet: B.Xb, worldPoint: { x: B.Xb.x, y: 0, z: B.Xb.y } };
  const opt = buildMenuOptions(target, v.id).find(o => o.id === 'moveToPlanet');
  const e0 = B.events.length, j0 = B.journal.length;
  new RightClickMenu()._handleOptionClick(opt, target);
  console.log(`  [${v.name}] PPM moveToPlanet → rozkaz:`, J(v.movementOrder ? { type: v.movementOrder.type, status: v.movementOrder.status } : null),
    '| dziennik +', B.journal.length - j0, '| misja:', J(v.mission ? { type: v.mission.type, targetId: v.mission.targetId } : null));
}
tickUntil(B.K, () => !B.CS.movementOrder && !B.SS.movementOrder && B.CS.position.state === 'orbiting' && B.SS.position.state === 'orbiting', 80, 0.02);
for (const v of [B.CS, B.SS]) console.log('  ', J(snap(v, B.K)));
const fmoB = makeFmo();
for (const v of [B.CS, B.SS]) {
  console.log(`  [${v.name}] getAvailableActions:`, J(actions(v, B.K)));
  const h = hud(v, B.K, fmoB);
  console.log(`  [${v.name}] HUD chips:`, J(h?.chips), '| orders:', J(h?.orders));
  console.log(`  [${v.name}] FMO _drawRight strefy:`, J(drawRightZones(v, B.K)));
  console.log(`  [${v.name}] _isForeignRedirectClickable(→Yb) =`, fmoB._isForeignRedirectClickable(v.id, B.Yb.id));
}
const stB = { ...stateObj(B.K), targetId: B.Xb.id };
console.log('  FLEET_ACTIONS.colonize.canExecute(CS, Xb) =', J(FLEET_ACTIONS.colonize.canExecute(B.CS, stB)));
console.log('  MissionSystem.canLaunchColony(Xb, CS) =', J(B.K.missionSystem.canLaunchColony(B.Xb.id, B.CS.id)));

H('§5b STAN B — „Pelny Skan" (full_scan) statku naukowego na orbicie Xb');
{
  const v = B.SS;
  const st = stateObj(B.K);
  console.log('  full_scan.canExecute =', J(FLEET_ACTIONS.full_scan.canExecute(v, st)));
  const e0 = B.events.length, j0 = B.journal.length, log0 = (v.missionLog ?? []).length;
  const xb0 = { explored: B.Xb.explored, analyzed: B.Xb.analyzed ?? false };
  FLEET_ACTIONS.full_scan.execute(v, st);
  console.log('  po execute: status =', v.status, '| _fullScan =', J(v._fullScan));
  tickUntil(B.K, () => !v._fullScan, 3, 0.05);
  console.log('  po tiku: status =', v.status, '| _fullScan =', J(v._fullScan ?? null),
    '| Xb', J(xb0), '→', J({ explored: B.Xb.explored, analyzed: B.Xb.analyzed ?? false }));
  console.log('  zdarzenia:', J(evDelta(B, e0)), '| dziennik +', B.journal.length - j0, '| missionLog +', (v.missionLog ?? []).length - log0);
  console.log('  pozycja:', J(snap(v, B.K).pos));
}

H('§5c STAN B — createMission na Yb / kolonizacja Xb (osobny swiat)');
{
  const w = toStateA(); telescopeExplore(w.K, w.Xb); w.K.activeSystemId = w.sysB;
  for (const v of [w.CS, w.SS]) {
    w.select(v.id);
    const target = { type: 'planet', entityId: w.Xb.id, planet: w.Xb, worldPoint: { x: w.Xb.x, y: 0, z: w.Xb.y } };
    new RightClickMenu()._handleOptionClick(buildMenuOptions(target, v.id).find(o => o.id === 'moveToPlanet'), target);
  }
  tickUntil(w.K, () => !w.CS.movementOrder && !w.SS.movementOrder, 80, 0.02);
  for (const [label, fn, vv] of [
    ['survey(SS → Yb)', () => w.K.missionSystem.createMission('survey', w.SS.id, { targetId: w.Yb.id }), w.SS],
    ['colonize(CS → Xb)', () => w.K.missionSystem.createMission('colonize', w.CS.id, { targetId: w.Xb.id }), w.CS],
  ]) {
    const n0 = w.K.missionSystem.getActive().length, e0 = w.events.length, b = J(snap(vv, w.K));
    fn();
    console.log(`  ${label}: misje ${n0}→${w.K.missionSystem.getActive().length} | stan ${b === J(snap(vv, w.K)) ? 'BEZ ZMIAN' : 'ZMIENIONY'} | zdarzenia ${J(evDelta(w, e0))}`);
  }
}

// ══ §6 — STAN C: Atlas (jedyny zywy producent `map_body`) → przekierowanie ════════════════
H('§6  STAN C — Atlas: wiersze ukladu B + klik z zaznaczonym statkiem');
const C = toStateA(); telescopeExplore(C.K, C.Xb);
C.K.activeSystemId = C.sysB;
{
  const o = makeFmo(); const drawn = [];
  o._drawAtlasCatalog(makeCtx(drawn), 0, 0, 900, 4000);
  const mb = o._hitZones.filter(z => z.type === 'map_body').map(z => z.data.bodyId);
  const sysOf = (id) => EntityManager.get(id)?.systemId;
  console.log('  Atlas map_body =', mb.length, '| z ukladu B =', mb.filter(id => sysOf(id) === C.sysB).length, '| zawiera Xb =', mb.includes(C.Xb.id));
  console.log('  Mapa taktyczna FMO (commandTacticalMap) =', GAME_CONFIG.FEATURES?.commandTacticalMap);
}
{
  const o = makeFmo(); o._selectedVesselId = C.CS.id;
  const e0 = C.events.length;
  o._handleHit({ type: 'map_body', data: { bodyId: C.Xb.id } });
  console.log('  klik Atlas Xb (CS zaznaczony) →', J(evDelta(C, e0)));
  const o2 = makeFmo(); o2._selectedVesselId = C.SS.id;
  const e1 = C.events.length;
  o2._handleHit({ type: 'map_body', data: { bodyId: C.Yb.id } });
  console.log('  klik Atlas Yb (SS zaznaczony) →', J(evDelta(C, e1)));
}
tickUntil(C.K, () => C.CS.mission?.phase === 'orbiting_body' && C.SS.mission?.phase === 'orbiting_body', 80, 0.02);
for (const v of [C.CS, C.SS]) console.log('  ', J(snap(v, C.K)));
const fmoC = makeFmo();
for (const v of [C.CS, C.SS]) {
  const h = hud(v, C.K, fmoC);
  console.log(`  [${v.name}] HUD chips:`, J(h?.chips));
}
{
  const m = buildShipPanelModel(C.CS, { K: C.K, fmo: fmoC, features: GAME_CONFIG.FEATURES });
  const chip = m.chips.find(c => c.id === 'foreign_colonize' && c.enabled);
  const e0 = C.events.length;
  if (chip) runShipPanelAction(chip.zone, { fmo: fmoC });
  tickUntil(C.K, () => !!C.K.colonyManager.getColony(C.Xb.id), 3, 0.05);
  console.log('  Kolonizuj (chip foreign_colonize) →', J(evDelta(C, e0)).slice(0, 400), '| kolonia na Xb =', !!C.K.colonyManager.getColony(C.Xb.id));
}
{
  const m = buildShipPanelModel(C.SS, { K: C.K, fmo: fmoC, features: GAME_CONFIG.FEATURES });
  const chip = m.chips.find(c => c.id === 'foreign_recon_system' && c.enabled);
  const unA0 = pickBodies(C.sysB).bodies.filter(b => !b.analyzed).length;
  const e0 = C.events.length, x0 = C.SS.position.x;
  if (chip) runShipPanelAction(chip.zone, { fmo: fmoC });
  tickUntil(C.K, () => C.SS.mission?.type === 'exploration' && C.SS.mission?.phase === 'orbiting_body' && C.SS.position.state === 'orbiting' && C.SS.mission?.targets === undefined, 2, 0.02);
  const unA1 = pickBodies(C.sysB).bodies.filter(b => !b.analyzed).length;
  console.log('  Recon ukladu (chip) → nieanalizowane', unA0, '→', unA1, '| ruszyl sie =', C.SS.position.x !== x0, '| misja', J(snap(C.SS, C.K).mission));
}

// ══ §7 — slepy zaulek po STANIE B (WLASNY, ZYWY swiat — drugi boot() czysci poprzednie) ══════
// ⚠ Pierwsza wersja tej sekcji mierzyla swiat B PO dwoch kolejnych boot() (§5c, §6) — EntityManager
//   i EventBus byly juz wyczyszczone, wiec „emit → no-op" byl JALOWY. Tu: osobny, zywy swiat.
H('§7  STAN B (zywy swiat) — czy z orbity „po PPM" da sie wejsc w panel obcy?');
{
  const w = toStateA(); telescopeExplore(w.K, w.Xb); w.K.activeSystemId = w.sysB;
  w.select(w.CS.id);
  const target = { type: 'planet', entityId: w.Xb.id, planet: w.Xb, worldPoint: { x: w.Xb.x / 10, y: 0, z: w.Xb.y / 10 } };
  new RightClickMenu()._handleOptionClick(buildMenuOptions(target, w.CS.id).find(o => o.id === 'moveToPlanet'), target);
  tickUntil(w.K, () => !w.CS.movementOrder && w.CS.position.state === 'orbiting', 80, 0.02);
  console.log('  CS po PPM:', J(snap(w.CS, w.K)));
  const o = makeFmo(); o._selectedVesselId = w.CS.id;
  console.log('  _isForeignRedirectClickable(CS→Yb) =', o._isForeignRedirectClickable(w.CS.id, w.Yb.id));
  const e0 = w.events.length;
  o._handleHit({ type: 'map_body', data: { bodyId: w.Yb.id } });          // ta sama sciezka co wiersz Atlas
  console.log('  klik wiersza Atlas (Yb) →', J(evDelta(w, e0)), '| misja', J(snap(w.CS, w.K).mission));
  const e1 = w.events.length;
  EventBus.emit('vessel:interstellarRedirect', { vesselId: w.CS.id, targetId: w.Yb.id });   // backend wprost
  console.log('  emit vessel:interstellarRedirect → reakcje', J(evDelta(w, e1).filter(x => !x.startsWith('vessel:interstellarRedirect'))),
    '| misja', J(snap(w.CS, w.K).mission));
  // Kontrola pinu: ten sam emit DZIALA na statku w stanie A (inaczej „no-op" nic nie znaczy).
  const e2 = w.events.length;
  EventBus.emit('vessel:interstellarRedirect', { vesselId: w.SS.id, targetId: w.Yb.id });
  console.log('  KONTROLA: ten sam emit na SS (stan A) → reakcje', J(evDelta(w, e2).filter(x => !x.startsWith('vessel:interstellarRedirect'))),
    '| misja SS', J(snap(w.SS, w.K).mission));
}

// ══ §8 — d2 (Finding 254): ruch cross-system na CIALO — gdzie laduje? ══════════════════
H('§8  d2: OrderService.issueMove(cel-CIALO w ukladzie B) ze statku w DOMU — stan koncowy');
{
  const w = buildWorld();
  // uklad B musi byc wygenerowany (d2 odmawia ukladom nieznanym) — generuje go prawdziwy przylot zwiadowcy
  w.K.orderService.issueWarp(w.SS.id, w.sysB);
  tickUntil(w.K, () => w.SS.mission?.phase === 'in_system', 120);
  const Xb = pickBodies(w.sysB).Xb;
  const r = w.K.orderService.issueMove(w.CS.id, { type: 'moveToPoint', targetBodyId: Xb.id, targetPoint: { x: Xb.x, y: Xb.y }, targetName: Xb.name });
  console.log('  issueMove(CS z domu → Xb w ukladzie B) =', J(r), '| pendingOrder', J(w.CS.pendingOrder ? { kind: w.CS.pendingOrder.kind } : null));
  tickUntil(w.K, () => w.CS.systemId === w.sysB && !w.CS.movementOrder && w.CS.position.state === 'orbiting' && !w.CS.pendingOrder && w.CS.mission?.type !== 'interstellar_jump', 200, 0.05);
  console.log('  CS po composite:', J(snap(w.CS, w.K)));
  const fmo = makeFmo();
  const h = hud(w.CS, w.K, fmo);
  console.log('  HUD chips:', J(h?.chips), '| orders:', J(h?.orders));
}

// ══ §9 — backend akcji obcych wołany WPROST na statku w STANIE B (czy jest agnostyczny?) ══════
H('§9  STAN B — expedition:foreignRecon / foreignColonize wprost (bez panelu)');
{
  const w = toStateA(); telescopeExplore(w.K, w.Xb); w.K.activeSystemId = w.sysB;
  for (const v of [w.CS, w.SS]) {
    w.select(v.id);
    const target = { type: 'planet', entityId: w.Xb.id, planet: w.Xb, worldPoint: { x: w.Xb.x / 10, y: 0, z: w.Xb.y / 10 } };
    new RightClickMenu()._handleOptionClick(buildMenuOptions(target, v.id).find(o => o.id === 'moveToPlanet'), target);
  }
  tickUntil(w.K, () => !w.CS.movementOrder && !w.SS.movementOrder && w.CS.position.state === 'orbiting' && w.SS.position.state === 'orbiting', 80, 0.02);
  console.log('  przed: SS', J(snap(w.SS, w.K)), '| Xb analyzed', !!w.Xb.analyzed);
  EventBus.emit('expedition:foreignRecon', { vesselId: w.SS.id, targetId: w.Xb.id, scope: 'target' });
  console.log('  po foreignRecon(target): misja', J(snap(w.SS, w.K).mission), '| status', w.SS.status);
  tickUntil(w.K, () => w.Xb.analyzed === true, 2, 0.02);
  console.log('  po tiku: Xb analyzed =', !!w.Xb.analyzed, '| SS', J(snap(w.SS, w.K)));
  const un0 = pickBodies(w.sysB).bodies.filter(b => !b.analyzed).length;
  EventBus.emit('expedition:foreignRecon', { vesselId: w.SS.id, targetId: null, scope: 'full_system' });
  tickUntil(w.K, () => pickBodies(w.sysB).bodies.filter(b => !b.analyzed).length <= un0 - 3, 4, 0.02);
  console.log('  foreignRecon(full_system): nieanalizowane', un0, '→', pickBodies(w.sysB).bodies.filter(b => !b.analyzed).length, '| SS', J(snap(w.SS, w.K).mission));
  const e0 = w.events.length;
  EventBus.emit('expedition:foreignColonize', { vesselId: w.CS.id, targetId: w.Xb.id });
  tickUntil(w.K, () => !!w.K.colonyManager.getColony(w.Xb.id), 2, 0.05);
  const col = w.K.colonyManager.getColony(w.Xb.id);
  console.log('  foreignColonize(CS→Xb) ze stanu B: kolonia =', !!col, '| gracza =', !!col && !col.ownerEmpireId,
    '| statek w rejestrze =', !!w.vm.getVessel(w.CS.id), '| zdarzenia', J(evDelta(w, e0)).slice(0, 300));
}

// ══ §10 — „🔭 Przełącz widok" (kandydat nr 2 objawu „scan system") — czy dotyka statku? ══════════
H('§10 STAN A — „Przełącz widok" (cluster_switch): skutek dla statku i dla kamery');
{
  const w = toStateA();
  const before = J({ v: snap(w.SS, w.K), x: w.SS.position.x, y: w.SS.position.y, fuel: w.SS.fuel?.current, log: (w.SS.missionLog ?? []).length });
  const cam0 = w.K.activeSystemId, e0 = w.events.length, j0 = w.journal.length;
  const o = makeFmo(); o._selectedVesselId = w.SS.id;
  o._handleHit({ type: 'cluster_switch', data: { systemId: w.sysB } });
  const after = J({ v: snap(w.SS, w.K), x: w.SS.position.x, y: w.SS.position.y, fuel: w.SS.fuel?.current, log: (w.SS.missionLog ?? []).length });
  console.log('  statek bez zmian =', before === after, '| kamera', cam0, '→', w.K.activeSystemId, '| zakładka FMO →', o._activeTab,
    '| zdarzenia statku/skanu', J(evDelta(w, e0).filter(x => !x.startsWith('ui:'))), '| dziennik +', w.journal.length - j0);
}

console.log('\n[probe] koniec');
