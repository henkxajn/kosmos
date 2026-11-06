// SONDA (read-only) — Findingi 603 i 604 (GALAXY_PLAN.md §3). Niczego nie naprawia i nie pisze poza stdout.
// Uruchom: node src/testing/headless/probe-603-engage-warp.mjs
//
// 603: pojedynczy statek z aktywnym rozkazem `engage` wysłany skokiem (`OrderService.issueWarp`) nie dolatuje. Rozkaz przechodzi bramkę
//      (`canOrder` nie pyta o rozkaz ruchu), rdzenie schodzą, a `VesselManager._updatePositions` wychodzi `continue` przy `isOrderControlled`,
//      zanim dojdzie do gałęzi tranzytu warp — `_tickInterstellar` nie biegnie. Kontrola: ten sam statek bez rozkazu dolatuje.
//      Prawdziwy łańcuch `OrderService` → `WarpRouteSystem` → `VesselManager` + `time:tick`. W prawdziwej grze niepróbowane.
// 604: statek solo na trasie wieloprzeskokowej dostaje popup przylotu na KAŻDYM przystanku (`fleetArrivalPopupKind` = `solo`); popup pauzuje grę
//      (`MissionEventModal`: pauzujący, gdy bez `noPause`). Kontrola: flota na tej samej trasie — jeden popup, w celu.

import './env.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { VesselManager } from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { FleetSystem } from '../../systems/FleetSystem.js';
import { WarpRouteSystem } from '../../systems/WarpRouteSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { SHIPS } from '../../data/ShipsData.js';
import { HULLS } from '../../data/HullsData.js';
import { fleetArrivalPopupKind } from '../../ui/GalaxyWarpLogic.js';

SHIPS.p_hull = { ...HULLS.hull_frigate, id: 'p_hull', warpCapable: true, warpSpeedLY: 6 };   // 6 LY/rok: lot 8 LY = 1,33 roku
const AU = GAME_CONFIG.AU_TO_PX, DT = 0.02, CIV = GAME_CONFIG.CIV_TIME_SCALE ?? 12;
const FLIGHT_TICKS = Math.ceil(8 / 6 / DT);

function world() {
  EventBus.clear(); EntityManager.clear();
  const home = { id: 'p_home', type: 'planet', name: 'Dom', x: AU, y: 0, radius: 8, mass: 1, orbital: { a: 1, e: 0, T: 1, M: 0, inclinationOffset: 0 }, physics: { x: AU, y: 0 }, systemId: 'sys_home' };
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  window.KOSMOS = {
    timeSystem: { gameTime: 100 }, activeSystemId: 'sys_home', civMode: true, homePlanet: home,
    galaxyData: { systems: [{ id: 'sys_home', name: 'Dom', x: 0, y: 0, z: 0 }, { id: 'B', name: 'Beta', x: 8, y: 0, z: 0 }, { id: 'C', name: 'Cygni', x: 16, y: 0, z: 0 }, { id: 'D', name: 'Delta', x: 24, y: 0, z: 0 }] },
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1, getMissionYieldBonus: () => 0, getDisasterReduction: () => 0, getShipSurvivalChance: () => 0 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find((c) => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push() {} }, debug: {},
  };
  EntityManager.add(home);
  const vm = new VesselManager(), mos = new MovementOrderSystem(vm), fs = new FleetSystem(vm), wrs = new WarpRouteSystem(vm), os = new OrderService();
  Object.assign(window.KOSMOS, { vesselManager: vm, movementOrderSystem: mos, fleetSystem: fs, warpRouteSystem: wrs, orderService: os });
  const ship = (name, x = 2 * AU) => {
    const v = vm.createAndRegister('p_hull', 'p_home', { name, modules: ['weapon_laser'] });
    v.position.x = x; v.position.y = 0; v.position.state = 'orbiting'; v.position.dockedAt = null; v.status = 'idle'; v.mission = null; v.systemId = 'sys_home';
    v.fuel.current = v.fuel.max = 9999; v.speedAU = 1; v.warpFuel = { current: 20, max: 20, consumption: 0.5 };
    return v;
  };
  const enemy = (name, x) => { const w = ship(name, x); w.ownerEmpireId = 'emp_001'; w.owner = 'emp_001'; w.isEnemy = true; return w; };
  const tick = (n) => { for (let i = 0; i < n; i++) { window.KOSMOS.timeSystem.gameTime += DT; EventBus.emit('time:tick', { deltaYears: DT, civDeltaYears: DT * CIV, gameTime: window.KOSMOS.timeSystem.gameTime, multiplier: 1 }); } };
  return { vm, mos, fs, wrs, os, ship, enemy, tick };
}

const stateOf = (v) => `układ=${v.systemId} stan=${v.position.state} misja=${v.mission?.type ?? null}/${v.mission?.phase ?? null} rozkaz=${v.movementOrder?.type ?? null}/${v.movementOrder?.status ?? null} rdzenie=${v.warpFuel.current} trasa=${v.warpRoute ? 'zywa' : 'brak'}`;

// Rozkazy objęte tą samą bramką `isOrderControlled`. `build` zwraca spec albo null.
const ORDERS = [
  ['bez rozkazu (KONTROLA)', () => null],
  ['engage', (w) => ({ type: 'engage', targetEntityId: w.enemy.id })],
  ['pursue', (w) => ({ type: 'pursue', targetEntityId: w.enemy.id })],
  ['intercept', (w) => ({ type: 'intercept', targetEntityId: w.enemy.id })],
  ['patrol', () => ({ type: 'patrol', patrolRoute: [{ x: 3 * AU, y: 0 }, { x: 4 * AU, y: 0 }] })],
  ['escort', (w) => ({ type: 'escort', targetEntityId: w.friend.id })],
];

console.log(`== 603 — statek z rozkazem wysłany skokiem (lot trwa ${FLIGHT_TICKS} tików; mierzone po ${FLIGHT_TICKS * 5}) ==`);
for (const [label, build] of ORDERS) {
  const W = world();
  const a = W.ship('A');
  const w = { enemy: W.enemy('Wrog', 6 * AU), friend: W.ship('Lider', 3 * AU) };
  const spec = build(w);
  const issued = spec ? W.mos.issueOrder(a.id, spec) : null;
  const stanPrzed = a.position.state;
  const res = W.os.issueWarp(a.id, 'B');
  W.tick(FLIGHT_TICKS * 5);
  console.log(`${label}: rozkaz=${issued ? JSON.stringify(issued.ok ? 'ok' : issued.reason) : '-'} stan-przed=${stanPrzed} issueWarp.ok=${res?.ok}${res?.reason ? ` (${res.reason})` : ''}`);
  console.log(`   → ${stateOf(a)} doleciał=${a.systemId === 'B'}`);
  // Co dzieje się, gdy rozkaz zniknie: czy statek „odzyskuje” skok?
  if (spec && a.movementOrder?.status === 'active') {
    W.mos.cancelOrder(a.id, 'manual');
    W.tick(FLIGHT_TICKS * 2);
    console.log(`   po anulowaniu rozkazu i ${FLIGHT_TICKS * 2} tikach → ${stateOf(a)} doleciał=${a.systemId === 'B'}`);
    // Czy cokolwiek wyciąga statek z tego stanu? Rozkaz ruchu i nowy skok — te same drogi co PPM mapy i menu gwiazdy.
    const mv = W.mos.issueOrder(a.id, { type: 'moveToPoint', targetPoint: { x: 3 * AU, y: 0 } });
    console.log(`   rozkaz ruchu → ok=${mv?.ok}${mv?.reason ? ` (${mv.reason})` : ''}`);
    const again = W.os.issueWarp(a.id, 'C');
    W.tick(FLIGHT_TICKS * 5);
    console.log(`   nowy skok do C → ok=${again?.ok}${again?.reason ? ` (${again.reason})` : ''}; po ${FLIGHT_TICKS * 5} tikach → ${stateOf(a)}`);
  }
}

console.log('\n== 604 — popup przylotu na trasie wieloprzeskokowej (D = 3 skoki) ==');
{
  const W = world();
  const a = W.ship('Solo');
  const seen = [];
  EventBus.on('interstellar:arrived', ({ vessel, systemId }) => { if (vessel.id === a.id) seen.push(`${systemId}:${fleetArrivalPopupKind(vessel, systemId)}`); });
  const res = W.os.issueWarp(a.id, 'D');
  W.tick(FLIGHT_TICKS * 5);
  console.log(`solo: issueWarp.ok=${res?.ok} przyloty=${seen.join(' ')} → ${stateOf(a)}`);
}
{
  const W = world();
  const a = W.ship('F1'), b = W.ship('F2');
  const fleet = W.fs.createFleet('Kontrola');
  W.fs.addMember(fleet.id, a.id); W.fs.addMember(fleet.id, b.id);
  let shown = null;
  const seen = [];
  EventBus.on('interstellar:arrived', ({ vessel, systemId }) => {
    const kind = fleetArrivalPopupKind(vessel, systemId, shown);
    if (kind === 'fleet') shown = vessel.mission.warpGroupId;
    seen.push(`${vessel.name}@${systemId}:${kind}`);
  });
  const res = W.os.issueFleetWarp(fleet.id, 'D');
  W.tick(FLIGHT_TICKS * 5);
  console.log(`KONTROLA flota: issueFleetWarp.ok=${res?.ok} przyloty=${seen.join(' ')}`);
}
process.exit(0);
