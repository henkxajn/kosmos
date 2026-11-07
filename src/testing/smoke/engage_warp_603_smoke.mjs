// ══════════════════════════════════════════════════════════════════════════════
// engage_warp_603_smoke — Finding 603: skok warp zastępuje rozkaz ruchu statku gracza.
// ──────────────────────────────────────────────────────────────────────────────
// Defekt: statek z żywym rozkazem `engage` wysłany skokiem nigdy nie dolatywał. `canOrder` nie pyta o rozkaz ruchu, rdzenie schodziły, a
// `VesselManager._updatePositions` wychodził przy `isOrderControlled` przed gałęzią warp, więc `_tickInterstellar` nie biegł.
// Naprawa: `dispatchInterstellar`, gałąź gracza, ZA wszystkimi odmowami: `cancelOrder(id, 'warp_departed')` i jedna linia Dziennika.
//
// T0   ślad AI i kontroli bez rozkazu `===` nagranie z 010f081 (`src/testing/fixtures/traces/F603-warp-chain-baseline.json`). Biegnie PIERWSZY.
// T1   engage + skok (`OrderService`): dolatuje w tym samym tiku co kontrola, układ = cel, rozkaz zamknięty `warp_departed`, jedna linia, bez toastu.
// T2   engage + skok ścieżką menu (`runGalaxyWarpOrder`): dolatuje, toasty jak u kontroli.
// T3   bezpośrednie `dispatchInterstellar`, także `force` (uśpiony bliźniak `FleetActions`).
// T4   odmowa (paliwo, rezerwa, ten sam układ, brak napędu, nieznany cel, silnik wprost): rozkaz żywy, statek co do bitu, zero zdarzeń, pościg trwa.
// T5   po przylocie: nic do anulowania, rozkazy ruchu przyjmowane, anulowanie → `orbiting`, układ zostaje.
// T6   zapis i wczytanie w locie: dolatuje na pierwotne ETA, rozkaz nie wraca.
// T7   pozostałe typy rozkazów: w locie odmowa `in_transit`; `orbiting` wymuszone (zamrożenie w starciu): dolatuje.
// T8   flota: reguła fazy 2 bez zmian (`replaced`, jedno zamknięcie, bez linii anulowania).
// T9   trasy złożone: `issueMove` do innego układu, `issueReturn` z obcego układu.
// T10  migawka misji: znika, `_resumeMissionAfterOrder` nie startuje starej misji.
// T11  pin źródłowy: strażnik za ostatnią odmową, przed zużyciem paliwa.
// T12  `tryCancelVesselOrder`: domyślny powód bez zmian.
// T13  `KOSMOS.debug.probe603` i pomocniki bramki.
//
// Nagranie baseline'u (TYLKO na drzewie sprzed naprawy): … --record  z F603_BASELINE_COMMIT=<hash>
// ══════════════════════════════════════════════════════════════════════════════

import { reseed } from '../headless/env.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { t } from '../../i18n/i18n.js';
import { VesselManager } from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { FleetSystem } from '../../systems/FleetSystem.js';
import { WarpRouteSystem } from '../../systems/WarpRouteSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { SHIPS } from '../../data/ShipsData.js';
import { HULLS } from '../../data/HullsData.js';
import { runGalaxyWarpOrder } from '../../ui/GalaxyWarpLogic.js';
import { ORDER_ACTIVITY_KEYS } from '../../ui/FleetPictureLogic.js';
import { tryCancelVesselOrder } from '../../utils/MovementOrderCancellation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', '..');
const FIXTURE = join(SRC, 'testing', 'fixtures', 'traces', 'F603-warp-chain-baseline.json');
const RECORD = process.argv.includes('--record');

const logOut = console.log.bind(console);
console.log = () => {};
console.warn = () => {};
let pass = 0, fail = 0;
const failed = [];
const assert = (cond, msg) => { if (cond) pass++; else { fail++; failed.push(msg); logOut(`  ✗ ${msg}`); } };
const section = (s) => logOut(`\n${s}`);

SHIPS.p_hull = { ...HULLS.hull_frigate, id: 'p_hull', warpCapable: true, warpSpeedLY: 6 };   // 6 LY/rok: lot 8 LY = 1,33 roku
const AU = GAME_CONFIG.AU_TO_PX, DT = 0.02, CIV = GAME_CONFIG.CIV_TIME_SCALE ?? 12;
const FLIGHT = Math.ceil(8 / 6 / DT);

const TRACED_EVENTS = ['interstellar:departed', 'interstellar:arrived', 'vessel:launched', 'vessel:orderIssued', 'vessel:orderCompleted', 'vessel:orderCancelled', 'vessel:orderBlocked', 'warpRoute:started', 'warpRoute:completed', 'warpRoute:aborted'];

function world({ year = 100 } = {}) {
  EventBus.clear(); EntityManager.clear();
  const body = (id, name, a, systemId) => ({ id, type: 'planet', name, x: a * AU, y: 0, radius: 8, mass: 1, orbital: { a, e: 0, T: 1e6, M: 0, inclinationOffset: 0 }, physics: { x: a * AU, y: 0 }, systemId, explored: true });
  const home = body('p_home', 'Dom', 1, 'sys_home'), cel = body('cel_b', 'Cel', 2, 'B'), far = body('f_b', 'Kolonia B', 3, 'B');
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  const logs = [], toasts = [], events = [];
  window.KOSMOS = {
    timeSystem: { gameTime: year }, activeSystemId: 'sys_home', civMode: true, homePlanet: home,
    galaxyData: { systems: [{ id: 'sys_home', name: 'Dom', x: 0, y: 0, z: 0 }, { id: 'B', name: 'Beta', x: 8, y: 0, z: 0 }, { id: 'C', name: 'Cygni', x: 16, y: 0, z: 0 }] },
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1, getMissionYieldBonus: () => 0, getDisasterReduction: () => 0, getShipSurvivalChance: () => 0 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find((c) => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: (e) => logs.push(e) }, debug: {},
  };
  for (const b of [home, cel, far]) EntityManager.add(b);
  const vm = new VesselManager(), mos = new MovementOrderSystem(vm), fs = new FleetSystem(vm), wrs = new WarpRouteSystem(vm), os = new OrderService();
  Object.assign(window.KOSMOS, { vesselManager: vm, movementOrderSystem: mos, fleetSystem: fs, warpRouteSystem: wrs, orderService: os });
  EventBus.on('ui:toast', ({ text }) => toasts.push(text));
  const W = { vm, mos, fs, wrs, os, logs, toasts, events, home, cel, tickNo: 0 };
  for (const name of TRACED_EVENTS) {
    EventBus.on(name, (p) => events.push({ t: W.tickNo, name, ship: (p?.vessel ?? vm.getVessel?.(p?.vesselId))?.name ?? null, reason: p?.reason ?? null, order: p?.order?.type ?? p?.type ?? null }));
  }
  W.ship = (name, x = 2 * AU, systemId = 'sys_home') => {
    const v = vm.createAndRegister('p_hull', 'p_home', { name, modules: ['weapon_laser'] });
    Object.assign(v.position, { x, y: 0, state: 'orbiting', dockedAt: null });
    v.status = 'idle'; v.mission = null; v.systemId = systemId;
    v.fuel.current = v.fuel.max = 9999; v.speedAU = 1; v.warpFuel = { current: 20, max: 20, consumption: 0.5 };
    return v;
  };
  W.enemy = (name, x, systemId = 'sys_home') => { const e = W.ship(name, x, systemId); e.ownerEmpireId = 'emp_001'; e.owner = 'emp_001'; e.isEnemy = true; return e; };
  W.tick = (n = 1, each = null) => {
    for (let i = 0; i < n; i++) {
      window.KOSMOS.timeSystem.gameTime += DT; W.tickNo++;
      EventBus.emit('time:tick', { deltaYears: DT, civDeltaYears: DT * CIV, gameTime: window.KOSMOS.timeSystem.gameTime, multiplier: 1 });
      each?.(W.tickNo);
    }
  };
  W.tickUntil = (cond, limit = FLIGHT * 3) => { for (let i = 0; i < limit; i++) { if (cond()) return W.tickNo; W.tick(1); } return cond() ? W.tickNo : null; };
  return W;
}

const bits = (v) => JSON.stringify([v.position, v.status, v.systemId, v.mission, v.movementOrder, v.warpFuel, v.warpRoute ?? null, v._suspendedMission ?? null]);
const cancels = (W, ship) => W.events.filter((e) => e.name === 'vessel:orderCancelled' && e.ship === ship);
// Linie w idiomie anulowania (`fleet.cancelOrderEntry`), nie wszystkie wpisy kanału: start trasy też pisze do `fleet`/`info`.
const CANCEL_PREFIX = t('fleet.cancelOrderEntry', '\u0000', '\u0000').split('\u0000')[0];
const cancelLines = (W) => W.logs.filter((l) => l.channel === 'fleet' && l.severity === 'info' && String(l.text).startsWith(CANCEL_PREFIX));

// ── T0 — ślad: ten sam kod nagrywa i porównuje ──────────────────────────────────────────────────────────────────────
function traceOf(W, ships, ticks, every = 5) {
  const samples = [];
  const sample = (no) => {
    if (no % every !== 0) return;
    samples.push(ships.map((v) => [v.name, v.systemId, v.position.state, v.status, v.position.x, v.position.y, v.mission?.type ?? null, v.mission?.phase ?? null, v.mission?.toSystemId ?? null, v.pendingOrder?.kind ?? null, v.movementOrder?.type ?? null, v.movementOrder?.status ?? null, v.warpFuel?.current ?? null, v.warpRoute ? v.warpRoute.legIndex : null, v._suspendedMission?.type ?? null].join('|')));
  };
  sample(0);
  W.tick(ticks, sample);
  return { samples, events: W.events };
}

const TRACES = {
  // AI: `issueGroupAttack` + `pendingOrder` (skok → rozkaz `attack` na ciało w układzie celu).
  ai_group() {
    const W = world(), e1 = W.enemy('R1', 2 * AU), e2 = W.enemy('R2', 3 * AU);
    const r = W.os.issueGroupAttack([e1.id, e2.id], { targetBodyId: 'cel_b', targetSystemId: 'B', groupId: 'g1' });
    return { r: { ok: r?.ok === true, composite: r?.composite ?? null }, ...traceOf(W, [e1, e2], FLIGHT * 3) };
  },
  // AI z żywym rozkazem w chwili skoku: strażnik jest wyłącznie dla gracza. Bez jego terminu właściciela ten ślad się rozjeżdża.
  ai_live_order() {
    const W = world(), e = W.enemy('R3', 2 * AU);
    const o = W.mos.issueOrder(e.id, { type: 'moveToPoint', targetPoint: { x: 5 * AU, y: 0 }, bypassFuelCheck: true });
    e.position.state = 'orbiting'; e.position.dockedAt = null;
    const r = W.os.issueWarp(e.id, 'B');
    return { o: o?.ok === true, r: r?.ok === true, ...traceOf(W, [e], FLIGHT * 3) };
  },
  player_one_hop() {
    const W = world(), a = W.ship('K1');
    const r = W.os.issueWarp(a.id, 'B');
    return { r: r?.ok === true, ...traceOf(W, [a], FLIGHT * 3) };
  },
  player_two_hops() {
    const W = world(), a = W.ship('K2');
    const r = W.os.issueWarp(a.id, 'C');
    return { r: r?.ok === true, ...traceOf(W, [a], FLIGHT * 5) };
  },
  // Bez ŻYWEGO rozkazu nie ruszamy niczego: stary rekord rozkazu i migawka zostają, jak dotąd.
  player_stale_record() {
    const W = world(), a = W.ship('K3');
    a.movementOrder = { id: 'mo_stary', type: 'moveToPoint', status: 'completed' };
    a._suspendedMission = { type: 'transport', targetId: 'cel_b', targetName: 'Cel' };
    const r = W.os.issueWarp(a.id, 'B');
    return { r: r?.ok === true, ...traceOf(W, [a], FLIGHT * 2) };
  },
};

const recorded = {};
for (const [name, run] of Object.entries(TRACES)) {
  reseed(`f603-${name}`);
  recorded[name] = JSON.stringify(run());
}

if (RECORD) {
  mkdirSync(dirname(FIXTURE), { recursive: true });
  writeFileSync(FIXTURE, JSON.stringify({ finding: 603, recordedFrom: process.env.F603_BASELINE_COMMIT ?? 'unknown', flightTicks: FLIGHT, traces: recorded }));
  logOut(`nagrano ${FIXTURE}`);
  process.exit(0);
}

section('T0 — ślad AI i kontroli bez rozkazu jak na 010f081');
let BASE = null;
try { BASE = JSON.parse(readFileSync(FIXTURE, 'utf8')); } catch { BASE = null; }
assert(BASE?.recordedFrom === '010f081', 'T0 nagranie z 010f081 istnieje');
for (const name of Object.keys(TRACES)) assert(BASE?.traces?.[name] != null && recorded[name] === BASE.traces[name], `T0 ślad ${name} === nagranie`);
{
  const ai = JSON.parse(recorded.ai_group), arrivals = ai.events.filter((e) => e.name === 'interstellar:arrived').length;
  assert(ai.r.ok && ai.r.composite === true && arrivals === 2, `T0 KONTROLA: para AI skacze i dolatuje (przyloty ${arrivals})`);
  const aiLast = ai.samples.at(-1).map((row) => row.split('|'));
  assert(aiLast.every((row) => row[1] === 'B' && row[6] === 'attack' && row[9] === '' && row[10] === 'attack' && row[11] === 'active'), 'T0 KONTROLA: `pendingOrder` dowieziony: po przylocie obaj mają misję i rozkaz `attack`');
  const live = JSON.parse(recorded.ai_live_order), last = live.samples.at(-1)[0].split('|');
  assert(live.o && live.r && last[1] === 'B' && last[10] === 'moveToPoint' && last[11] === 'active', 'T0 KONTROLA: AI z żywym rozkazem dolatuje, rozkaz nietknięty');
  const stale = JSON.parse(recorded.player_stale_record).samples.at(-1)[0].split('|');
  assert(stale[1] === 'B' && stale[11] === 'completed' && stale[14] === 'transport', 'T0 KONTROLA: stary rekord rozkazu i migawka zostają, statek dolatuje');
}

// ── T1 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T1 — engage + skok przez OrderService');
{
  reseed('f603-t1');
  const W = world(), a = W.ship('A'), c = W.ship('Kontrola', 2 * AU), e = W.enemy('Wrog', 6 * AU);
  const eng = W.mos.issueOrder(a.id, { type: 'engage', targetEntityId: e.id });
  assert(eng.ok === true && a.movementOrder?.status === 'active', 'T1 KONTROLA: rozkaz engage żywy przed skokiem');
  const rA = W.os.issueWarp(a.id, 'B'), rC = W.os.issueWarp(c.id, 'B');
  assert(rA.ok === true && rC.ok === true, 'T1 oba skoki przyjęte');
  const eta = a.mission?.arrivalYear;
  assert(a.movementOrder == null || a.movementOrder.status !== 'active', 'T1 rozkaz zamknięty już przy starcie skoku');
  assert(W.mos._byVessel.has(a.id) === false, 'T1 rozkaz zniknął z indeksu MOS');
  assert(a.lastOrder?.type === 'engage' && a.lastOrder?.status === 'cancelled' && a.lastOrder?.blockReason === 'warp_departed', `T1 ostatni rozkaz: engage/cancelled/warp_departed (jest ${a.lastOrder?.type}/${a.lastOrder?.status}/${a.lastOrder?.blockReason})`);
  assert(a.position.state === 'in_transit' && a.status === 'on_mission' && a.systemId === null && a.mission?.phase === 'warp_transit', 'T1 statek w tranzycie warp');
  assert(a.warpFuel.current === c.warpFuel.current && a.warpFuel.current === 16, 'T1 rdzenie: tyle co kontrola');
  assert(cancels(W, 'A').length === 1 && cancels(W, 'A')[0].reason === 'warp_departed', 'T1 jedno `vessel:orderCancelled` z powodem warp_departed');
  assert(cancels(W, 'Kontrola').length === 0, 'T1 KONTROLA: statek bez rozkazu nie dostaje zamknięcia');
  const label = t(ORDER_ACTIVITY_KEYS.engage), lines = cancelLines(W);
  assert(lines.length === 1 && lines[0].text === t('fleet.cancelOrderEntry', 'A', label) && lines[0].entityRef === a.id, `T1 jedna linia Dziennika w idiomie anulowania (linii ${lines.length})`);
  assert(W.toasts.length === 0, 'T1 bez toastu');
  const x0 = a.position.x;
  W.tick(10);
  assert(a.position.x === x0, 'T1 statek w skoku nie kituje');
  let atA = null, atC = null;
  W.tickUntil(() => { if (atA == null && a.systemId === 'B') atA = window.KOSMOS.timeSystem.gameTime; if (atC == null && c.systemId === 'B') atC = window.KOSMOS.timeSystem.gameTime; return atA != null && atC != null; });
  assert(atA != null, 'T1 dolatuje');
  assert(atA === atC, 'T1 w tym samym tiku co kontrola');
  assert(atA != null && atA >= eta && atA - eta <= DT + 1e-9, `T1 na ETA (przylot ${atA}, ETA ${eta})`);
  assert(a.systemId === 'B' && a.position.state === 'orbiting' && a.mission?.phase === 'in_system' && a.warpRoute == null, 'T1 po przylocie: układ celu, `in_system`, trasa domknięta');
  assert(W.events.filter((x) => x.name === 'interstellar:arrived' && x.ship === 'A').length === 1, 'T1 jeden przylot');
}

section('T2 — engage + skok ścieżką menu');
{
  reseed('f603-t2');
  const W = world(), a = W.ship('A'), c = W.ship('Kontrola'), e = W.enemy('Wrog', 6 * AU);
  W.mos.issueOrder(a.id, { type: 'engage', targetEntityId: e.id });
  const rA = runGalaxyWarpOrder({ vesselIds: [a.id], targetSystemId: 'B', K: window.KOSMOS });
  const afterA = W.toasts.length;
  const rC = runGalaxyWarpOrder({ vesselIds: [c.id], targetSystemId: 'B', K: window.KOSMOS });
  assert(rA.moved === 1 && rC.moved === 1, 'T2 obydwa rozkazy wydane');
  assert(afterA === 1 && W.toasts.length === 2 && W.toasts[0] === W.toasts[1], `T2 toast tylko o skoku, jak u kontroli (${W.toasts.length})`);
  W.tickUntil(() => a.systemId === 'B');
  assert(a.systemId === 'B' && a.lastOrder?.blockReason === 'warp_departed', 'T2 dolatuje, rozkaz zamknięty warp_departed');
}

section('T3 — dispatchInterstellar wprost');
for (const [label, opts] of [['bez opcji', {}], ['force', { force: true }]]) {
  reseed('f603-t3');
  const W = world(), a = W.ship('A'), e = W.enemy('Wrog', 6 * AU);
  W.mos.issueOrder(a.id, { type: 'engage', targetEntityId: e.id });
  const ok = W.vm.dispatchInterstellar(a.id, 'B', opts);
  W.tickUntil(() => a.systemId === 'B');
  assert(ok === true && a.systemId === 'B' && a.lastOrder?.blockReason === 'warp_departed', `T3 ${label}: dolatuje, rozkaz zamknięty`);
}

// ── T4 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T4 — odmowa zostawia rozkaz i statek');
{
  const CASES = [
    ['paliwo', (a) => { a.warpFuel.current = 0.1; }, (W, a) => W.os.issueWarp(a.id, 'B'), 'insufficient_warp_fuel'],
    ['rezerwa', (a) => { a.serviceState = 'stored'; }, (W, a) => W.os.issueWarp(a.id, 'B'), 'vessel_in_reserve'],
    ['ten sam układ', () => {}, (W, a) => W.os.issueWarp(a.id, 'sys_home'), 'same_system'],
    ['brak napędu', (a) => { a.shipId = 'hull_frigate'; a.modules = ['weapon_laser']; }, (W, a) => W.os.issueWarp(a.id, 'B'), 'dispatch_failed'],
    ['nieznany cel', () => {}, (W, a) => W.os.issueWarp(a.id, 'nigdzie'), 'unknown_system'],
    ['silnik wprost, paliwo', (a) => { a.warpFuel.current = 0.1; }, (W, a) => ({ ok: W.vm.dispatchInterstellar(a.id, 'B'), reason: null }), null],
    ['silnik wprost, ten sam układ', () => {}, (W, a) => ({ ok: W.vm.dispatchInterstellar(a.id, 'sys_home'), reason: null }), null],
  ];
  for (const [label, prep, run, reason] of CASES) {
    reseed('f603-t4');
    const W = world(), a = W.ship('A'), e = W.enemy('Wrog', 6 * AU);
    W.mos.issueOrder(a.id, { type: 'engage', targetEntityId: e.id });
    prep(a);
    const before = bits(a), logsBefore = W.logs.length, cancelsBefore = cancels(W, 'A').length;
    const r = run(W, a);
    assert(r.ok === false && (reason == null || r.reason === reason), `T4 ${label}: odmowa ${reason ?? 'silnika'} (jest ${r.ok}/${r.reason})`);
    assert(bits(a) === before, `T4 ${label}: statek co do bitu`);
    assert(a.movementOrder?.status === 'active' && W.mos._byVessel.has(a.id), `T4 ${label}: rozkaz żywy`);
    assert(cancels(W, 'A').length === cancelsBefore && W.logs.length === logsBefore, `T4 ${label}: zero zamknięć i linii`);
    const x0 = a.position.x;
    W.tick(5);
    assert(a.movementOrder?.status === 'active' && a.position.x !== x0, `T4 ${label}: pościg trwa (KONTROLA nie-jałowości)`);
  }
}

// ── T5 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T5 — po przylocie');
{
  reseed('f603-t5');
  const W = world(), a = W.ship('A'), e = W.enemy('Wrog', 6 * AU);
  W.mos.issueOrder(a.id, { type: 'engage', targetEntityId: e.id });
  W.os.issueWarp(a.id, 'B');
  W.tickUntil(() => a.systemId === 'B');
  assert(a.systemId === 'B' && a.position.state === 'orbiting', 'T5 statek po przylocie orbituje w układzie celu');
  assert(W.mos.cancelOrder(a.id, 'manual') === false, 'T5 nic do anulowania');
  const m1 = W.mos.issueOrder(a.id, { type: 'moveToPoint', targetPoint: { x: a.position.x - 5 * AU, y: a.position.y } });
  assert(m1.ok === true && a.position.state === 'in_transit' && a.systemId === 'B', `T5 rozkaz ruchu przyjęty (${m1.reason ?? 'ok'})`);
  W.tick(2);
  assert(W.mos.cancelOrder(a.id, 'manual') === true && a.position.state === 'orbiting' && a.status === 'idle' && a.systemId === 'B', 'T5 anulowanie: `orbiting`, `idle`, układ zostaje');
  W.tick(2);
  const m2 = W.mos.issueOrder(a.id, { type: 'moveToPoint', targetPoint: { x: a.position.x - 6 * AU, y: a.position.y } });
  assert(m2.ok === true, `T5 kolejny rozkaz ruchu przyjęty (${m2.reason ?? 'ok'})`);
}

// ── T6 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T6 — zapis i wczytanie w locie');
{
  reseed('f603-t6');
  const W = world(), a = W.ship('A'), e = W.enemy('Wrog', 6 * AU);
  W.mos.issueOrder(a.id, { type: 'engage', targetEntityId: e.id });
  W.os.issueWarp(a.id, 'B');
  const eta = a.mission?.arrivalYear;
  W.tick(Math.floor(FLIGHT / 2));
  const saved = JSON.parse(JSON.stringify({ v: W.vm.serialize(), f: W.fs.serialize() })), year = window.KOSMOS.timeSystem.gameTime;
  const row = saved.v.vessels.find((x) => x.id === a.id);
  assert(row?.mission?.phase === 'warp_transit' && row?.systemId === null, 'T6 zapis w locie: `warp_transit`, układ null');
  assert(row?.movementOrder == null || row.movementOrder.status !== 'active', 'T6 zapis nie niesie żywego rozkazu');
  const W2 = world({ year });
  W2.vm.restore(saved.v); W2.fs.restore(saved.f); W2.mos._indexExistingOrders?.();
  const a2 = W2.vm.getVessel(a.id);
  assert(a2?.mission?.phase === 'warp_transit' && W2.mos._byVessel.has(a.id) === false, 'T6 po wczytaniu: dalej w tranzycie, rozkaz nie wraca');
  W2.tickUntil(() => a2.systemId === 'B');
  const at = window.KOSMOS.timeSystem.gameTime;
  assert(a2.systemId === 'B' && a2.mission?.phase === 'in_system', 'T6 po wczytaniu dolatuje');
  assert(at >= eta && at - eta <= DT + 1e-9, `T6 na pierwotne ETA (przylot ${at}, ETA ${eta})`);
}

// ── T7 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T7 — pozostałe typy rozkazów');
{
  const SPECS = {
    pursue: (w) => ({ type: 'pursue', targetEntityId: w.e.id }),
    intercept: (w) => ({ type: 'intercept', targetEntityId: w.e.id }),
    patrol: () => ({ type: 'patrol', patrolRoute: [{ x: 3 * AU, y: 0 }, { x: 4 * AU, y: 0 }] }),
    escort: (w) => ({ type: 'escort', targetEntityId: w.f.id }),
    moveToPoint: () => ({ type: 'moveToPoint', targetPoint: { x: 5 * AU, y: 0 } }),
  };
  for (const [type, spec] of Object.entries(SPECS)) {
    reseed(`f603-t7-${type}`);
    const W = world(), a = W.ship('A'), w = { e: W.enemy('Wrog', 6 * AU), f: W.ship('Lider', 3 * AU) };
    const o = W.mos.issueOrder(a.id, spec(w));
    const before = bits(a), r = W.os.issueWarp(a.id, 'B');
    assert(o.ok === true && r.ok === false && r.reason === 'in_transit' && bits(a) === before && a.movementOrder?.status === 'active', `T7 ${type} w locie: odmowa in_transit, rozkaz żywy`);
    reseed(`f603-t7-${type}`);
    const V = world(), b = V.ship('B'), v = { e: V.enemy('Wrog', 6 * AU), f: V.ship('Lider', 3 * AU) };
    V.mos.issueOrder(b.id, spec(v));
    b.position.state = 'orbiting'; b.position.dockedAt = null;   // tak zostawia statek zamrożenie w starciu (`_freezeAsStationary`)
    const r2 = V.os.issueWarp(b.id, 'B');
    V.tickUntil(() => b.systemId === 'B');
    assert(r2.ok === true && b.systemId === 'B' && b.mission?.phase === 'in_system' && b.lastOrder?.type === type && b.lastOrder?.blockReason === 'warp_departed', `T7 ${type} z orbiting: dolatuje, rozkaz zamknięty (jest ${b.lastOrder?.type}/${b.lastOrder?.blockReason})`);
  }
}

// ── T8 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T8 — flota: reguła fazy 2');
{
  reseed('f603-t8');
  const W = world(), a = W.ship('F1'), b = W.ship('F2'), e = W.enemy('Wrog', 6 * AU);
  const fl = W.fs.createFleet('X'); W.fs.addMember(fl.id, a.id); W.fs.addMember(fl.id, b.id);
  W.mos.issueOrder(a.id, { type: 'engage', targetEntityId: e.id });
  const r = W.os.issueFleetWarp(fl.id, 'B');
  assert(r?.ok === true && a.lastOrder?.blockReason === 'replaced', `T8 faza 2 zamyka rozkaz powodem replaced (jest ${a.lastOrder?.blockReason})`);
  assert(cancels(W, 'F1').length === 1, 'T8 jedno zamknięcie, strażnik silnika nie ma już czego zamykać');
  assert(cancelLines(W).filter((l) => l.entityRef === a.id).length === 0, 'T8 bez linii anulowania statku');
  W.tickUntil(() => a.systemId === 'B' && b.systemId === 'B');
  assert(a.systemId === 'B' && b.systemId === 'B', 'T8 flota dolatuje');
}

// ── T9 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T9 — trasy złożone');
{
  reseed('f603-t9a');
  const W = world(), a = W.ship('A'), e = W.enemy('Wrog', 6 * AU);
  W.mos.issueOrder(a.id, { type: 'engage', targetEntityId: e.id });
  window.KOSMOS.starSystemManager = { getSystem: (id) => ({ id }), hasBeacon: () => false };   // `issueMove` pyta o znany układ; tylko w tym scenariuszu
  const r = W.os.issueMove(a.id, { type: 'moveToPoint', targetBodyId: 'cel_b', targetPoint: { x: W.cel.x, y: W.cel.y } });
  assert(r?.ok === true && a.pendingOrder != null && a.mission?.type === 'interstellar_jump', `T9 issueMove do innego układu: skok i zlecenie w kolejce (${r?.reason ?? 'ok'})`);
  W.tickUntil(() => a.systemId === 'B');
  assert(a.systemId === 'B', 'T9 dolatuje do układu celu');
  assert(a.pendingOrder == null && a.movementOrder?.type === 'moveToPoint' && a.movementOrder?.status === 'active', `T9 drugi odcinek wydany po przylocie (rozkaz ${a.movementOrder?.type}/${a.movementOrder?.status})`);

  reseed('f603-t9b');
  const R = world(), b = R.ship('B', 2 * AU, 'B'), f = R.enemy('Wrog', 6 * AU, 'B');
  const eng = R.mos.issueOrder(b.id, { type: 'engage', targetEntityId: f.id });
  const rr = R.os.issueReturn(b.id);
  R.tickUntil(() => b.systemId === 'sys_home');
  assert(eng.ok === true && rr?.ok === true && b.systemId === 'sys_home', `T9 issueReturn z obcego układu: dolatuje do domu (${rr?.reason ?? 'ok'})`);
}

// ── T10 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T10 — migawka misji');
{
  reseed('f603-t10');
  const W = world(), a = W.ship('A'), e = W.enemy('Wrog', 6 * AU);
  W.mos.issueOrder(a.id, { type: 'engage', targetEntityId: e.id });
  a._suspendedMission = { type: 'transport', phase: 'outgoing', targetId: 'p_home', targetName: 'Dom' };
  const launchedBefore = W.events.filter((x) => x.name === 'vessel:launched').length;
  const r = W.os.issueWarp(a.id, 'B');
  assert(r.ok === true && a._suspendedMission === undefined, 'T10 migawka znika razem z rozkazem');
  assert(W.events.filter((x) => x.name === 'vessel:launched').length - launchedBefore === 1, 'T10 jeden start: stara misja nie rusza');
  assert(a.mission?.type === 'interstellar_jump', 'T10 misją jest skok');
  assert(!(a.missionLog ?? []).some((l) => /Resume mission/.test(l.text ?? '')), 'T10 bez „Resume mission” w dzienniku statku');
}

// ── T11 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T11 — miejsce strażnika w źródle');
{
  const raw = readFileSync(join(SRC, 'systems', 'VesselManager.js'), 'utf8').replace(/\r\n/g, '\n');
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  const start = code.indexOf('  dispatchInterstellar(vesselId'), end = code.indexOf('\n  }\n', start), body = code.slice(start, end);
  const guard = body.indexOf('tryCancelVesselOrder('), lastRefusal = body.lastIndexOf('return false'), spend = body.indexOf('consumeWarpFuel(vessel');
  assert(start >= 0 && guard > 0, 'T11 strażnik jest w `dispatchInterstellar`');
  assert(guard > lastRefusal, 'T11 za ostatnią odmową');
  assert(guard >= 0 && guard < spend, 'T11 przed zużyciem paliwa');
  assert(/if \(!isEnemyVessel\(vessel\) && vessel\.movementOrder\?\.status === 'active'\)/.test(body), 'T11 tylko gracz, tylko żywy rozkaz');
  assert(body.includes("'warp_departed'"), 'T11 powód `warp_departed`');
}

// ── T12 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T12 — tryCancelVesselOrder');
{
  const seen = [], v = { id: 'x', name: 'X', movementOrder: { type: 'engage', status: 'active' } };
  const deps = { mos: { cancelOrder: (id, reason) => { seen.push(reason); return true; } }, vesselManager: { getVessel: () => v }, eventLogSystem: { push() {} }, t: (k) => k };
  tryCancelVesselOrder(deps, 'x');
  tryCancelVesselOrder(deps, 'x', 'warp_departed');
  assert(seen[0] === 'player', 'T12 domyślnie powód gracza');
  assert(seen[1] === 'warp_departed', 'T12 powód z parametru');
}

// ── T13 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T13 — pomocniki bramki');
{
  const FWD = await import('../../debug/FleetWarpDebug.js').catch(() => null);
  const h = FWD?.fleetWarpDebugHelpers?.() ?? {};
  reseed('f603-t13');
  const W = world(), a = W.ship('A'), e = W.enemy('Wrog', 6 * AU);
  window.KOSMOS.uiManager = { getSelectedVesselId: () => a.id, setSelectedVesselId() {}, setSelectedFleetId() {} };
  const read = h.probe603?.();
  assert(read?.name === 'A' && read?.state === 'orbiting' && read?.system === 'sys_home' && read?.order === null && Array.isArray(read?.patients) && read.patients.length === 0, 'T13 probe603(): odczyt zaznaczonego statku, bez argumentu');
  assert(h.probe603Engage?.()?.order === 'engage/active', 'T13 probe603Engage(): engage na najbliższego wroga w układzie');
  h.probe603Cores?.(0.1);
  const refused = h.probe603Warp?.(1);
  assert(refused?.ok === false && refused?.reason === 'insufficient_warp_fuel' && refused?.unchanged === true && a.movementOrder?.status === 'active', `T13 probe603Warp(1): odmowa, statek co do bitu (${refused?.reason})`);
  h.probe603Cores?.(20);
  const sent = h.probe603Warp?.(1);
  assert(sent?.ok === true && sent?.target === 'Beta [B]', `T13 probe603Warp(1): ten sam rozkaz co menu (${sent?.target})`);
  const inFlight = h.probe603?.();
  assert(inFlight?.mission === 'interstellar_jump/warp_transit' && inFlight?.lastOrder === 'engage/cancelled/warp_departed' && Array.isArray(inFlight?.plate) && inFlight?.patients?.length === 0, 'T13 probe603() w locie: misja, ostatni rozkaz, znacznik płyty');
  // Stan z Findingu 603 w starym zapisie: lista `patients` go nazywa (K0).
  const A = W.ship('StanA'); A.mission = { type: 'interstellar_jump', phase: 'warp_transit', toSystemId: 'B' }; A.position.state = 'in_transit'; A.movementOrder = { type: 'engage', status: 'active' }; A.systemId = null;
  const B = W.ship('StanB'); B.mission = { type: 'interstellar_jump', phase: 'warp_transit', toSystemId: 'B' }; B.position.state = 'orbiting'; B.systemId = null;
  const list = h.probe603?.(a.id)?.patients ?? [];
  assert(list.length === 2 && list.some((x) => x.startsWith('StanA')) && list.some((x) => x.startsWith('StanB')), `T13 patients: oba stany z 603 (${list.length}), zdrowy lot poza listą`);
  window.KOSMOS.uiManager.getSelectedVesselId = () => null;
  assert(h.probe603?.()?.name === 'A', 'T13 probe603() bez zaznaczenia: ostatni odczytany statek (wrak traci zaznaczenie)');
  const scene = readFileSync(join(SRC, 'scenes', 'GameScene.js'), 'utf8');
  assert(/\.\.\.fleetWarpDebugHelpers\(\),/.test(scene), 'T13 pomocniki w `KOSMOS.debug` (GameScene)');
}

logOut(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
