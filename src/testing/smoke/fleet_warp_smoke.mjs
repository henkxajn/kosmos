// fleet_warp_smoke — G4 (GALAXY_PLAN.md §4 G4, D-GX-19, D-GX-20): SKOK FLOTY.
//
// Pinuje mechanikę na prawdziwym łańcuchu `OrderService` → `FleetSystem` → `WarpRouteSystem` → `VesselManager` + `time:tick`:
//   T1  beginJourney bez opts — kształt trasy bez nowych kluczy, dwa argumenty dyspozytora, linia solo
//   T2  odmowa całej floty zostawia członków i rekord co do bitu (zapis przed == zapis po, zero zdarzeń), powód i nazwa każdego winnego
//   T3  jeden plan dla wszystkich, wspólny limit skoku (najmniejszy bak); podgląd bez skutków ubocznych
//   T4  członek wiążący nazwany w odmowie i w wyniku; każdy członek płaci własne zużycie
//   T5  przyloty w tym samym ticku na KAŻDYM przystanku przy różnych prędkościach bazowych + kontrola: bez blokady ticki się rozjeżdżają
//   T6  wspólny kąt przylotu tylko na finale
//   T7  zboczenie i przerwanie członka nie psują reszty; rekord domyka się na ocalałych
//   T8  wrak w trasie; wrak ostatniego lecącego przy zerze przylotów; członek, który opuścił flotę, mówi znów sam za siebie
//   T9  zapis / wczytanie w połowie trasy (v101 bez migracji): grupa leci dalej, kąt i prędkość przeżywają, stara trasa bez nowych kluczy
//   T10 Dziennik: jedna linia na start i koniec, zero linii członków; piny `UIManager` (nie importuje się pod node)
//   T11 ścieżka AI: `issueGroupAttack` co do bajtu (suma źródła z 15b6fc7); `speedLY` nie działa na AI
//   T12 poprzedni rozkaz floty: przyjęcie kasuje rozkazy członków (bez fałszywego „zakończone”), odmowa — nie; migawka misji nie wskrzesza
//   T13 faza 2 przy wyścigu: nikt nie wystartował = rekord wraca; część wystartowała = reszta leci
//   T14 D-GX-20: tekst odmowy PL / EN bez sluga i bez nowych kluczy poza §6; `.map(describeOrderFail)` z indeksem nadal działa
//   T15 rozkaz floty w locie odbija się o bramkę warp i nie rusza rekordu
//   T16 flaga `fleetWarp` zdjęta (G5-B): brak klucza w `FEATURES` i predykatu `fleetWarpOn` — ścieżki OFF nie ma
//   T17 trasa podana z góry pasuje do TEGO statku
//   T18 Stop floty w skoku (decyzja właściciela 2026-11-06): przerwanie na najbliższym przystanku, jeden toast i jedna linia, członkowie wolni
//
// ⚠ PRZECELOWANE 2026-11-07 (ARC GALAXY G5-B — flagi `galaxyWarp` / `fleetWarp` na stałe ON, ścieżki OFF usunięte): T1 — porównania
//   ON == OFF (trasa, misja, linie Dziennika) wycofane, zostają piny kształtu trasy, dwóch argumentów dyspozytora i linii solo przy ON;
//   T2 — przypadek „rezerwa przy `galaxyWarp` OFF” wycofany (wiersz rezerwy z `_groupGateRefusal` usunięty, rezerwę odmawia `canOrder`,
//   co pinuje przypadek „rezerwa” wyżej); T11 — porównanie `issueGroupAttack` ON == OFF wycofane (ścieżkę AI pinuje dalej suma źródła
//   i wiersze `speedLY`); T16 — „flaga w kodzie: ON” przecelowane na pin odwrotny (klucz i predykat usunięte), pięć kontroli OFF
//   (`feature_off`, `hops` niewidzialne, trasa bez pól floty, własna prędkość, dyspozytor ignoruje `speedLY`) wycofane. Alias `FEATURES`
//   i migawka `SHIPPED_FLAG` usunięte (służyły przestawianiu flagi).
//
// Uruchom: node src/testing/smoke/fleet_warp_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync }        from 'node:fs';
import { createHash }          from 'node:crypto';
import { fileURLToPath }       from 'node:url';
import { dirname, join }       from 'node:path';
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { FleetSystem }         from '../../systems/FleetSystem.js';
import { WarpRouteSystem }     from '../../systems/WarpRouteSystem.js';
import { OrderService }        from '../../systems/OrderService.js';
import { CURRENT_VERSION }     from '../../systems/SaveMigration.js';
import { SHIPS }               from '../../data/ShipsData.js';
import { HULLS }               from '../../data/HullsData.js';
import { setLocale, t, tIn }   from '../../i18n/i18n.js';
import { describeOrderFail, describeFleetOrderRefusal } from '../../utils/CameraFrame.js';
// Namespace: `describeFleetWarpRefusal` powstaje w tym kroku, statyczny import wywróciłby cały przebieg fail-first.
import * as GalaxyWarp         from '../../ui/GalaxyWarpLogic.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
// Grupa nie może przerwać przebiegu: na kodzie sprzed kroku metod nie ma, a reszta pinów ma dostać kolor.
const group = (name, fn) => { header(name); try { fn(); } catch (e) { assert(false, `${name}: wyjątek ${e?.message}`); } };
const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', '..');
const readSrc = (rel) => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');   // CRLF-safe (Finding 270)
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '');

const AU = GAME_CONFIG.AU_TO_PX;
const DT = 0.02, CIV = GAME_CONFIG.CIV_TIME_SCALE ?? 12;

// Kadłuby testowe: prędkość bazowa z danych kadłuba (bez modułów), żeby trzy prędkości były prawdziwym wejściem `_baseWarpSpeed`.
const warpHull = (id, warpSpeedLY) => { SHIPS[id] = { ...HULLS.hull_frigate, id, warpCapable: true, warpSpeedLY }; };
warpHull('fw_slow', 3); warpHull('fw_med', 6); warpHull('fw_fast', 9);

// Dom — B — C — D co 8 LY: limit skoku 10 LY wymusza trzy odcinki. NEAR: 8,49 LY wprost. FAR: poza łańcuchem.
const SYSTEMS = () => [
  { id: 'sys_home', name: 'Dom', x: 0, y: 0, z: 0 },
  { id: 'B', name: 'Beta', x: 8, y: 0, z: 0 },
  { id: 'C', name: 'Cygni', x: 16, y: 0, z: 0 },
  { id: 'D', name: 'Delta', x: 24, y: 0, z: 0 },
  { id: 'NEAR', name: 'Blisko', x: 6, y: 6, z: 0 },
  { id: 'SIDE', name: 'Bok', x: 8, y: 9, z: 0 },
  { id: 'FAR', name: 'Daleko', x: 100, y: 0, z: 0 },
];

let vMgr, mos, fSys, wrs, os, events, logs, toasts, tickNo;

function wire() {
  mos = new MovementOrderSystem(vMgr); fSys = new FleetSystem(vMgr); wrs = new WarpRouteSystem(vMgr); os = new OrderService();
  Object.assign(window.KOSMOS, { vesselManager: vMgr, movementOrderSystem: mos, fleetSystem: fSys, warpRouteSystem: wrs, orderService: os });
  events = [];
  for (const ev of ['fleet:orderIssued', 'fleet:orderCancelled', 'fleet:orderCompleted', 'warpRoute:aborted', 'warpRoute:completed'])
    EventBus.on(ev, (d) => events.push({ ev, ...d }));
  toasts = [];
  EventBus.on('ui:toast', (d) => toasts.push(d));
}

function scene() {
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  const home = { id: 'p_home', type: 'planet', name: 'Dom', x: AU, y: 0, radius: 8, mass: 1, orbital: { a: 1, e: 0, T: 1, M: 0, inclinationOffset: 0 }, physics: { x: AU, y: 0 }, systemId: 'sys_home' };
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  logs = []; tickNo = 0;
  window.KOSMOS = {
    timeSystem: { gameTime: 100 }, activeSystemId: 'sys_home', civMode: true, homePlanet: home,
    galaxyData: { systems: SYSTEMS() },
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1, getMissionYieldBonus: () => 0, getDisasterReduction: () => 0, getShipSurvivalChance: () => 0 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find((c) => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: (e) => logs.push(e) },
    debug: {},
  };
  EntityManager.add({ id: 'star_h', type: 'star', name: 'G', systemId: 'sys_home', x: 0, y: 0, mass: 1 });
  EntityManager.add(home);
  vMgr = new VesselManager();
  wire();
}

function ship({ name = 'S', hull = 'fw_med', fuel = 20, max = 20, cons = 0.5, sys = 'sys_home', state = 'orbiting', modules = [] } = {}) {
  const v = vMgr.createAndRegister(hull, 'p_home', { name, modules });
  v.position.x = 2 * AU; v.position.y = 0; v.position.state = state; v.position.dockedAt = state === 'docked' ? 'p_home' : null;
  v.status = 'idle'; v.mission = null; v.systemId = sys; v.fuel.current = v.fuel.max = 9999; v.speedAU = 1.0;
  v.warpFuel = { current: fuel, max, consumption: cons };
  return v;
}
const makeFleet = (...vs) => { const id = fSys.createFleet('Eskadra').id; for (const v of vs) fSys.addMember(id, v.id); return id; };
const fleetOf = (id) => fSys.getFleet(id);
const tick = (n = 1) => {
  for (let i = 0; i < n; i++) {
    tickNo++;
    window.KOSMOS.timeSystem.gameTime += DT;
    EventBus.emit('time:tick', { deltaYears: DT, civDeltaYears: DT * CIV, gameTime: window.KOSMOS.timeSystem.gameTime, multiplier: 1 });
  }
};
const runUntil = (pred, max = 3000) => { let n = 0; while (!pred() && n++ < max) tick(); return pred(); };
const snapshot = () => JSON.stringify({ v: vMgr.serialize(), f: fSys.serialize(), o: [...(mos._byVessel?.keys?.() ?? [])] });
const call = (obj, m, ...a) => (typeof obj?.[m] === 'function' ? obj[m](...a) : undefined);
const issue = (fid, target) => call(os, 'issueFleetWarp', fid, target);
const preview = (fid, target) => call(os, 'previewFleetWarp', fid, target);
const logCount = (text) => logs.filter((l) => l.text === text).length;
const memberOf = (res, id) => res?.members?.find((m) => m.id === id);
const samePos = (a, b) => a.position.x === b.position.x && a.position.y === b.position.y;

// ── T1 ──────────────────────────────────────────────────────────────────────────────────────────────────
group('T1 beginJourney bez opts — bez zmian', () => {
  // G5-B: ścieżki OFF nie ma, więc porównania ON == OFF wycofane; zostaje to, co bez opts widać przy ON.
  const run = () => {
    scene();
    const v = ship({ name: 'Solo' });
    const args = [];
    const orig = vMgr.dispatchInterstellar.bind(vMgr);
    vMgr.dispatchInterstellar = (...a) => { args.push(a.length); return orig(...a); };
    const r = wrs.beginJourney(v.id, 'D');
    const route = { ...v.warpRoute };
    runUntil(() => v.warpRoute === null);
    return { r, args, logs: logs.map((l) => l.text), keys: Object.keys(route), final: v.systemId };
  };
  const on = run();
  assert(on.r.ok === true && on.final === 'D', 'trasa solo dolatuje');
  assert(on.keys.join() === 'hops,legIndex,finalSystemId,totalFuelPlanned,startedYear', 'kształt `warpRoute` bez nowych kluczy');
  assert(on.args.every((n) => n === 2) && on.args.length === 3, 'dyspozytor wołany dwoma argumentami na każdym z 3 odcinków');
  assert(on.logs.some((l) => l === t('warpRoute.completed', 'Solo', 'Delta')), 'solo mówi sam za siebie (`warpRoute.completed`)');
});

// ── T2 ──────────────────────────────────────────────────────────────────────────────────────────────────
group('T2 odmowa całej floty zostawia wszystko co do bitu', () => {
  const refuseCase = (label, build, target, expectReason, culpritName) => {
    scene();
    const { fid, culprit } = build();
    const before = snapshot();
    const aoBefore = fleetOf(fid)?.activeOrder ?? null;
    const evBefore = events.length, logBefore = logs.length;
    const res = issue(fid, target);
    assert(res?.ok === false && res?.reason === expectReason, `${label}: odmowa powodem ${expectReason} (jest: ${res?.reason})`);
    assert(res?.ok === false && snapshot() === before, `${label}: członkowie i rekord co do bitu`);
    assert(res?.ok === false && (fleetOf(fid)?.activeOrder ?? null) === aoBefore, `${label}: ten sam rekord floty`);
    assert(res?.ok === false && events.length === evBefore && logs.length === logBefore, `${label}: zero zdarzeń i linii Dziennika`);
    if (culpritName) assert(memberOf(res, culprit.id)?.name === culpritName && memberOf(res, culprit.id)?.reason === expectReason, `${label}: winny nazwany`);
  };
  refuseCase('rezerwa', () => { const a = ship({ name: 'A' }), b = ship({ name: 'Rezerwa' }); b.serviceState = 'stored'; return { fid: makeFleet(a, b), culprit: b }; }, 'B', 'vessel_in_reserve', 'Rezerwa');
  refuseCase('bez baku', () => { const a = ship({ name: 'A' }), b = ship({ name: 'BezBaku', fuel: 0, max: 0 }); return { fid: makeFleet(a, b), culprit: b }; }, 'B', 'not_warp_capable', 'BezBaku');
  refuseCase('bak bez napędu', () => { const a = ship({ name: 'A' }), b = ship({ name: 'BezNapedu', hull: 'hull_frigate', modules: ['engine_ion'] }); return { fid: makeFleet(a, b), culprit: b }; }, 'B', 'not_warp_capable', 'BezNapedu');
  refuseCase('w locie', () => { const a = ship({ name: 'A' }), b = ship({ name: 'WLocie', state: 'in_transit' }); return { fid: makeFleet(a, b), culprit: b }; }, 'B', 'in_transit', 'WLocie');
  refuseCase('rozdzielona', () => { const a = ship({ name: 'A' }), b = ship({ name: 'Obok', sys: 'B' }); return { fid: makeFleet(a, b), culprit: b }; }, 'C', 'group_split', 'Obok');
  refuseCase('brak paliwa', () => { const a = ship({ name: 'A' }), b = ship({ name: 'Pusty', fuel: 1 }); return { fid: makeFleet(a, b), culprit: b }; }, 'D', 'insufficient_warp_fuel', 'Pusty');
  refuseCase('ten sam układ', () => ({ fid: makeFleet(ship({ name: 'A' })) }), 'sys_home', 'same_system');
  refuseCase('brak trasy', () => ({ fid: makeFleet(ship({ name: 'A' })) }), 'FAR', 'no_route');
  refuseCase('nieznany układ', () => ({ fid: makeFleet(ship({ name: 'A' })) }), 'NIE_MA', 'unknown_system');
  refuseCase('pusta flota', () => ({ fid: fSys.createFleet('Pusta').id }), 'B', 'fleet_empty');
  scene();
  assert(issue('fleet_nie_ma', 'B')?.reason === 'fleet_not_found', 'nieznana flota: `fleet_not_found`');
  // Poprzedni rozkaz żywy (Finding 275): flota w locie dostaje odmowę i leci dalej tym samym rozkazem.
  scene();
  const a = ship({ name: 'A', hull: 'fw_med' }), b = ship({ name: 'B', hull: 'fw_med' });
  const fid = makeFleet(a, b);
  const mv = fSys.issueFleetOrder(fid, { type: 'moveToPoint', targetPoint: { x: 6 * AU, y: 0 } });
  assert(mv?.ok === true && a.position.state === 'in_transit', 'kontrola: flota leci rozkazem `moveToPoint`');
  const ao = fleetOf(fid).activeOrder, before = snapshot();
  const res = issue(fid, 'B');
  assert(res?.ok === false && res?.reason === 'in_transit' && res?.members?.length === 2, 'odmowa nazywa obu członków w locie');
  assert(res?.ok === false && fleetOf(fid).activeOrder === ao && snapshot() === before, 'rozkaz floty nietknięty (reguła Findingu 275)');
});

// ── T3 ──────────────────────────────────────────────────────────────────────────────────────────────────
group('T3 jeden plan dla wszystkich', () => {
  scene();
  const a = ship({ name: 'A', hull: 'fw_fast' }), b = ship({ name: 'B', hull: 'fw_slow', cons: 0.25 }), c = ship({ name: 'C', state: 'docked' });
  const fid = makeFleet(a, b, c);
  const before = snapshot();
  const pv = preview(fid, 'D');
  assert(pv?.ok === true && snapshot() === before, 'podgląd bez skutków ubocznych');
  assert(pv?.hops?.join() === 'sys_home,B,C,D', 'trasa przez wszystkie przystanki');
  assert(pv?.groupSpeedLY === 3 && Math.abs(pv?.etaYears - 8) < 1e-9, 'prędkość najwolniejszego, ETA liczone nią (24 LY / 3 = 8 lat)');
  const res = issue(fid, 'D');
  assert(res?.ok === true && res?.hops?.join() === pv?.hops?.join(), 'rozkaz wykonuje plan z podglądu');
  assert([a, b, c].every((v) => v.warpRoute?.hops?.join() === 'sys_home,B,C,D'), 'wszyscy członkowie mają te same przystanki');
  assert(new Set([a, b, c].map((v) => v.warpRoute?.groupId)).size === 1 && !!a.warpRoute?.groupId, 'wspólne `groupId`');
  const ao = fleetOf(fid)?.activeOrder;
  assert(ao?.type === 'warp' && ao?.targetSystemId === 'D' && ao?.groupId === a.warpRoute?.groupId && ao?.hops?.join() === 'sys_home,B,C,D' && ao?.startedYear === 100, 'rekord floty ma podpisany kształt');
  // Prawdziwe moduły: `engine_warp` (18 LY/rok) leci prędkością najwolniejszego członka, nie swoją.
  scene();
  const real = ship({ name: 'Moduly', hull: 'hull_frigate', modules: ['engine_warp', 'warp_tank'] }), slow = ship({ name: 'Wolny', hull: 'fw_slow' });
  const realRes = issue(makeFleet(real, slow), 'B');
  assert(realRes?.ok === true && realRes?.groupSpeedLY === 3 && real.mission?.warpSpeed === 3 && slow.mission?.warpSpeed === 3, 'kadłub z prawdziwym napędem przyjmuje prędkość najwolniejszego');
  // Wspólny limit skoku: najmniejszy bak zamyka drogę, której bez niego by nie było — i to on jest nazwany.
  scene();
  const big = ship({ name: 'Duzy' });
  const ctl = preview(makeFleet(big), 'NEAR');
  assert(ctl?.ok === true && ctl?.hops?.join() === 'sys_home,NEAR', 'kontrola: sam duży bak leci wprost');
  scene();
  const big2 = ship({ name: 'Duzy' }), tiny = ship({ name: 'Maly', fuel: 2, max: 2, cons: 0.5 });
  const lim = preview(makeFleet(big2, tiny), 'NEAR');
  assert(lim?.ok === false && lim?.reason === 'no_route' && memberOf(lim, tiny.id)?.name === 'Maly', 'mały bak skraca skok całej floty: `no_route` z nazwą');
});

// ── T4 ──────────────────────────────────────────────────────────────────────────────────────────────────
group('T4 członek wiążący + własne zużycie', () => {
  scene();
  const a = ship({ name: 'A', fuel: 20, cons: 0.5 }), b = ship({ name: 'Wiazacy', fuel: 13, cons: 0.5 }), c = ship({ name: 'C', fuel: 10, cons: 0.25 });
  const fid = makeFleet(a, b, c);
  const res = issue(fid, 'D');
  assert(res?.ok === true && res?.bindingMemberId === b.id, 'wynik nazywa członka wiążącego (najmniejszy zasięg, nie najmniejszy bak)');
  assert(res?.fuelByMember?.[a.id] === 12 && res?.fuelByMember?.[c.id] === 6, 'paliwo per członek = dystans × jego zużycie');
  runUntil(() => fleetOf(fid)?.activeOrder === null);
  assert(a.warpFuel.current === 8 && b.warpFuel.current === 1 && c.warpFuel.current === 4, 'każdy zapłacił własne zużycie');
  scene();
  const d = ship({ name: 'D1', fuel: 20 }), e = ship({ name: 'Krotki', fuel: 3 }), f = ship({ name: 'Krotszy', fuel: 2 });
  const refusal = issue(makeFleet(d, e, f), 'D');
  assert(refusal?.bindingMemberId === f.id, 'odmowa nazywa członka wiążącego');
  assert(memberOf(refusal, e.id)?.reason === 'insufficient_warp_fuel' && memberOf(refusal, f.id)?.reason === 'insufficient_warp_fuel' && !memberOf(refusal, d.id), 'odmowa nazywa każdego, komu brakuje paliwa — i tylko ich');
  assert(refusal?.accepted?.length === 0 && refusal?.rejected?.length === 2, 'kształt D-E2 dla opisu odmowy');
});

// ── T5 ──────────────────────────────────────────────────────────────────────────────────────────────────
group('T5 przyloty w tym samym ticku na każdym przystanku', () => {
  const arrivalsByHop = (start) => {
    scene();
    const vs = [ship({ name: 'Wolny', hull: 'fw_slow' }), ship({ name: 'Sredni', hull: 'fw_med' }), ship({ name: 'Szybki', hull: 'fw_fast' })];
    const seen = {};
    EventBus.on('interstellar:arrived', ({ vessel, systemId }) => { (seen[systemId] ??= {})[vessel.id] = tickNo; });
    const started = start(vs);
    runUntil(() => vs.every((v) => v.warpRoute === null), 2000);
    return { started, seen, vs };
  };
  // Kontrola: te same trzy statki solo — bez blokady ticki MUSZĄ się rozjechać, inaczej pin mierzyłby ciszę.
  const solo = arrivalsByHop((vs) => vs.map((v) => wrs.beginJourney(v.id, 'D')));
  assert(new Set(Object.values(solo.seen.B ?? {})).size === 3, 'kontrola: solo trzy różne ticki przylotu');
  const fleet = arrivalsByHop((vs) => issue(makeFleet(...vs), 'D'));
  assert(fleet.started?.ok === true, 'skok floty przyjęty');
  for (const hop of ['B', 'C', 'D']) {
    const ticks = Object.values(fleet.seen[hop] ?? {});
    assert(ticks.length === 3 && new Set(ticks).size === 1, `${hop}: trzech członków w jednym ticku (${ticks.join()})`);
  }
  assert(fleet.vs.every((v) => v.systemId === 'D' && v.position.state === 'orbiting'), 'wszyscy w układzie celu');
  assert(fleet.vs.every((v) => v.mission?.warpSpeed === 3), 'prędkość najwolniejszego na ostatnim odcinku');
});

// ── T6 ──────────────────────────────────────────────────────────────────────────────────────────────────
group('T6 wspólny kąt przylotu tylko na finale', () => {
  scene();
  const a = ship({ name: 'A' }), b = ship({ name: 'B' }), c = ship({ name: 'C' });
  const fid = makeFleet(a, b, c);
  const res = issue(fid, 'D');
  assert(res?.ok === true && Number.isFinite(a.warpRoute?.arrivalAngle), 'kąt zapisany w trasie');
  assert(Number.isFinite(a.warpRoute?.arrivalAngle) && a.warpRoute?.arrivalAngle === b.warpRoute?.arrivalAngle && b.warpRoute?.arrivalAngle === c.warpRoute?.arrivalAngle, 'jeden kąt na flotę');
  assert(a.mission?.toSystemId === 'B' && a.mission?.arrivalAngle === undefined, 'pierwszy odcinek bez kąta');
  runUntil(() => a.mission?.toSystemId === 'C');
  assert(a.mission?.toSystemId === 'C' && a.mission?.arrivalAngle === undefined, 'odcinek pośredni bez kąta');
  runUntil(() => a.mission?.toSystemId === 'D');
  assert(Number.isFinite(a.mission?.arrivalAngle), 'ostatni odcinek niesie kąt');
  runUntil(() => fleetOf(fid)?.activeOrder === null);
  assert(a.systemId === 'D' && b.systemId === 'D' && samePos(a, b) && samePos(b, c), 'wszyscy w tym samym punkcie obrzeży');
  assert(Math.abs(Math.hypot(a.position.x, a.position.y) - 30 * AU) < 1e-6, 'punkt przylotu to obrzeża układu celu (30 AU)');
});

// ── T7 ──────────────────────────────────────────────────────────────────────────────────────────────────
group('T7 zboczenie i przerwanie członka nie psują reszty', () => {
  scene();
  const a = ship({ name: 'A' }), b = ship({ name: 'Zboczyl' }), c = ship({ name: 'C' });
  const fid = makeFleet(a, b, c);
  assert(issue(fid, 'D')?.ok === true, 'skok przyjęty');
  // Zboczenie: przylot do układu spoza trasy (`_onArrived`, gałąź `diverted`).
  b.mission.toSystemId = 'SIDE';
  runUntil(() => b.warpRoute === null);
  assert(events.some((e) => e.ev === 'warpRoute:aborted' && e.vesselId === b.id && e.reason === 'diverted'), 'członek zboczył: `diverted`');
  assert(a.warpRoute !== null && c.warpRoute !== null && fleetOf(fid)?.activeOrder?.type === 'warp', 'reszta leci, rekord żywy');
  runUntil(() => fleetOf(fid)?.activeOrder === null);
  assert(a.systemId === 'D' && c.systemId === 'D' && b.systemId === 'SIDE', 'ocalali w celu, zboczony tam, gdzie doleciał');
  assert(logCount(t('warpRoute.fleetCompleted', 'Eskadra', 'Delta')) === 1, 'jedna linia zakończenia');
  assert(events.filter((e) => e.ev === 'fleet:orderCompleted').length === 1 && events.find((e) => e.ev === 'fleet:orderCompleted')?.mode === 'completed', 'jedno `fleet:orderCompleted` (completed)');
  // Przerwanie jawne.
  scene();
  const d = ship({ name: 'D1' }), e = ship({ name: 'Przerwany' });
  const fid2 = makeFleet(d, e);
  issue(fid2, 'D');
  assert(wrs.abortJourney(e.id, 'superseded') === true && e.warpRoute === null, 'przerwanie trasy członka');
  assert(d.warpRoute !== null && fleetOf(fid2)?.activeOrder?.type === 'warp', 'flota nie przerywa się z nim');
  assert(logs.filter((l) => l.text === t('warpRoute.aborted', 'Przerwany', 'superseded')).length === 1, 'przerwany melduje się sam');
  runUntil(() => fleetOf(fid2)?.activeOrder === null);
  assert(d.systemId === 'D' && e.systemId === 'B', 'reszta w celu; przerwany kończy bieżący skok i stoi');
  // Wszyscy przerwani: rekord znika, nikt nie „dotarł”.
  scene();
  const f = ship({ name: 'F' }), g = ship({ name: 'G' });
  const fid3 = makeFleet(f, g);
  issue(fid3, 'D');
  wrs.abortJourney(f.id, 'superseded'); wrs.abortJourney(g.id, 'superseded');
  assert(fleetOf(fid3)?.activeOrder === null, 'wszyscy przerwani: rekord zdjęty');
  assert(logCount(t('warpRoute.fleetCompleted', 'Eskadra', 'Delta')) === 0, 'bez linii zakończenia, gdy nikt nie dotarł');
  assert(events.find((ev) => ev.ev === 'fleet:orderCompleted')?.mode === 'aborted', '`fleet:orderCompleted` mówi `aborted`');
});

// ── T8 ──────────────────────────────────────────────────────────────────────────────────────────────────
group('T8 wrak i odejście z floty', () => {
  scene();
  const a = ship({ name: 'A' }), b = ship({ name: 'Wrak' }), c = ship({ name: 'C' });
  const fid = makeFleet(a, b, c);
  issue(fid, 'D');
  runUntil(() => a.mission?.toSystemId === 'C');
  b.isWreck = true; EventBus.emit('vessel:wrecked', { vesselId: b.id });
  assert(!fleetOf(fid)?.memberIds?.includes(b.id) && fleetOf(fid)?.activeOrder?.type === 'warp', 'wrak wypada z floty, rekord żywy');
  runUntil(() => fleetOf(fid)?.activeOrder === null);
  assert(a.systemId === 'D' && c.systemId === 'D' && samePos(a, c), 'reszta doleciała razem');
  assert(logCount(t('warpRoute.fleetCompleted', 'Eskadra', 'Delta')) === 1, 'jedna linia zakończenia');
  // Ostatni lecący ginie, nikt wcześniej nie dotarł.
  scene();
  const d = ship({ name: 'D1' }), e = ship({ name: 'E1' });
  const fid2 = makeFleet(d, e);
  issue(fid2, 'D');
  wrs.abortJourney(d.id, 'superseded');
  assert(fleetOf(fid2)?.activeOrder?.type === 'warp', 'rekord żywy, dopóki leci ostatni członek');
  e.isWreck = true; EventBus.emit('vessel:wrecked', { vesselId: e.id });
  assert(fleetOf(fid2)?.activeOrder === null, 'ostatni lecący zginął: rekord zdjęty');
  assert(logCount(t('warpRoute.fleetCompleted', 'Eskadra', 'Delta')) === 0 && events.some((ev) => ev.ev === 'fleet:orderCompleted' && ev.mode === 'aborted'), 'bez linii zakończenia; `aborted`');
  // Członek opuszcza flotę w locie: flota go nie czeka, a on mówi sam za siebie.
  scene();
  const f = ship({ name: 'F' }), g = ship({ name: 'Odszedl' });
  const fid3 = makeFleet(f, g);
  issue(fid3, 'D');
  fSys.removeMember(g.id, 'manual');
  assert(fleetOf(fid3)?.activeOrder?.type === 'warp', 'rekord żywy po odejściu');
  runUntil(() => f.warpRoute === null && g.warpRoute === null);
  assert(fleetOf(fid3)?.activeOrder === null && logCount(t('warpRoute.fleetCompleted', 'Eskadra', 'Delta')) === 1, 'flota domknięta jedną linią');
  assert(logCount(t('warpRoute.completed', 'Odszedl', 'Delta')) === 1 && logCount(t('warpRoute.completed', 'F', 'Delta')) === 0, 'odszedł — mówi sam; członek — nie');
});

// ── T9 ──────────────────────────────────────────────────────────────────────────────────────────────────
group('T9 zapis i wczytanie w połowie trasy', () => {
  assert(CURRENT_VERSION === 101, 'zapis v101 — krok nie podbija wersji');
  scene();
  const a = ship({ name: 'A', hull: 'fw_slow' }), b = ship({ name: 'B', hull: 'fw_fast' });
  const fid = makeFleet(a, b);
  assert(issue(fid, 'D')?.ok === true, 'skok przyjęty');
  runUntil(() => a.mission?.toSystemId === 'C');
  tick(5);
  const routeA = { ...a.warpRoute };
  const saved = JSON.parse(JSON.stringify({ v: vMgr.serialize(), f: fSys.serialize() }));
  const yearSaved = window.KOSMOS.timeSystem.gameTime;
  assert(!!routeA.groupId && saved.v.vessels.find((v) => v.id === a.id)?.warpRoute?.groupId === routeA.groupId, '`groupId` w zapisie trasy');

  // Nowa sesja na tym samym zegarze: prawdziwe `restore` obu systemów, bez bumpu i bez migracji.
  EventBus.clear();
  logs.length = 0;
  vMgr = new VesselManager();
  wire();
  vMgr.restore(saved.v);
  fSys.restore(saved.f);
  window.KOSMOS.timeSystem.gameTime = yearSaved;
  const a2 = vMgr.getVessel(a.id), b2 = vMgr.getVessel(b.id);
  assert(a2?.warpRoute?.groupId === routeA.groupId && a2?.warpRoute?.speedLY === 3 && a2?.warpRoute?.arrivalAngle === routeA.arrivalAngle && a2?.warpRoute?.legIndex === routeA.legIndex, 'trasa przeżyła wczytanie z polami floty');
  const ao = fleetOf(fid)?.activeOrder;
  assert(ao?.type === 'warp' && ao?.targetSystemId === 'D' && ao?.hops?.join() === 'sys_home,B,C,D' && ao?.groupId === routeA.groupId, 'rekord floty przeżył wczytanie');
  const seen = {};
  EventBus.on('interstellar:arrived', ({ vessel, systemId }) => { (seen[systemId] ??= {})[vessel.id] = tickNo; });
  runUntil(() => fleetOf(fid)?.activeOrder === null);
  for (const hop of ['C', 'D']) {
    const ticks = Object.values(seen[hop] ?? {});
    assert(ticks.length === 2 && new Set(ticks).size === 1, `${hop}: po wczytaniu dalej w jednym ticku`);
  }
  assert(a2?.mission?.warpSpeed === 3 && b2?.mission?.warpSpeed === 3, 'blokada prędkości przeżyła wczytanie');
  assert(samePos(a2, b2) && a2.systemId === 'D', 'kąt przylotu przeżył wczytanie');
  assert(logCount(t('warpRoute.fleetCompleted', 'Eskadra', 'Delta')) === 1, 'po wczytaniu jedna linia zakończenia');

  // Stara trasa (bez pól floty) wraca bez nowych kluczy; rekord bez lecących nie zostaje na zawsze.
  const vm = new VesselManager();
  vm.restore({ vessels: [{ id: 'stary', shipId: 'fw_med', name: 'Stary', position: { state: 'orbiting', dockedAt: null }, warpFuel: { current: 4, max: 10, consumption: 0.5 }, warpRoute: { hops: ['sys_home', 'B'], legIndex: 0, finalSystemId: 'B', totalFuelPlanned: 1, startedYear: 7 } }], nextId: 2 });
  const old = vm.serialize().vessels.find((v) => v.id === 'stary');
  assert(Object.keys(old.warpRoute).join() === 'hops,legIndex,finalSystemId,totalFuelPlanned,startedYear', 'stara trasa: kształt bez zmian po obu stronach zapisu');
  scene();
  const lone = ship({ name: 'Sam' });
  const fid2 = makeFleet(lone);
  const dead = { ...fSys.serialize() };
  dead.fleets = dead.fleets.map((f) => ({ ...f, activeOrder: { type: 'warp', targetSystemId: 'D', groupId: 'fw_x', hops: ['sys_home', 'D'], startedYear: 1 } }));
  const logsBefore = logs.length;
  fSys.restore(dead);
  assert(fleetOf(fid2)?.activeOrder === null && logs.length === logsBefore, 'rekord skoku bez lecących zdjęty po cichu przy wczytaniu');
});

// ── T10 ─────────────────────────────────────────────────────────────────────────────────────────────────
group('T10 Dziennik: jedna linia zamiast N', () => {
  scene();
  const a = ship({ name: 'A' }), b = ship({ name: 'B' }), c = ship({ name: 'C' });
  const fid = makeFleet(a, b, c);
  issue(fid, 'D');
  assert(logs.filter((l) => l.text === t('warpRoute.fleetStarted', 'Eskadra', '???', '3') || l.text === t('warpRoute.fleetStarted', 'Eskadra', 'Delta', '3')).length === 1, 'jedna linia startu');
  assert(logs.length === 1 && logs.every((l) => l.channel === 'fleet' && l.severity === 'info'), 'kanał floty, wpis informacyjny');
  runUntil(() => fleetOf(fid)?.activeOrder === null);
  assert(logCount(t('warpRoute.fleetCompleted', 'Eskadra', 'Delta')) === 1, 'jedna linia końca');
  const memberLines = [];
  for (const n of ['A', 'B', 'C']) for (const line of [t('warpRoute.completed', n, 'Delta'), t('warpRoute.legDone', n, 'Beta'), t('warpRoute.legDone', n, 'Cygni')]) memberLines.push(logCount(line));
  assert(a.systemId === 'D' && memberLines.every((n) => n === 0), 'zero linii członków (przystanki i przylot)');
  assert(logs.length === 2, `w sumie dwie linie (jest: ${logs.length})`);
  const ui = stripComments(readSrc('scenes/UIManager.js'));
  assert(/'fleet:orderIssued',[^\n]*\n\s*if \(type === 'warp'\) return;/.test(ui), 'UIManager: `fleet:orderIssued` milczy dla skoku floty');
  assert(/'fleet:orderCompleted',[^\n]*\n\s*if \(type === 'warp'\) return;/.test(ui), 'UIManager: `fleet:orderCompleted` milczy dla skoku floty');
  assert(/'vessel:launched',[^\n]*\n\s*if \(isEnemyVessel\(vessel\)\) return;\n\s*if \(vessel\.warpRoute\?\.groupId\) return;/.test(ui), 'UIManager: `vessel:launched` milczy dla członka skoku floty');
  // Kontrola: start członka widzi już `groupId` — tym żyje bramka `vessel:launched`, a `warpRoute` powstaje przed dyspozytorem.
  scene();
  let seenGroup = null;
  EventBus.on('vessel:launched', ({ vessel }) => { seenGroup = vessel.warpRoute?.groupId ?? 'brak'; });
  issue(makeFleet(ship({ name: 'K' })), 'B');
  assert(typeof seenGroup === 'string' && seenGroup.startsWith('fw_'), '`vessel:launched` widzi `groupId` członka');
});

// ── T11 ─────────────────────────────────────────────────────────────────────────────────────────────────
group('T11 ścieżka AI co do bajtu', () => {
  const src = readSrc('systems/OrderService.js');
  const start = src.indexOf('  issueGroupAttack(');
  const end = src.indexOf('\n  }\n', start) + 5;
  const hash = createHash('sha256').update(src.slice(start, end)).digest('hex').slice(0, 16);
  assert(hash === 'bd65648740670528', `suma źródła \`issueGroupAttack\` jak na 15b6fc7 (jest: ${hash})`);
  const realRandom = Math.random;
  const runAI = () => {
    scene();
    EntityManager.add({ id: 'cel', type: 'planet', name: 'Cel', x: AU, y: 0, systemId: 'B', physics: { x: AU, y: 0 } });
    const e1 = ship({ name: 'R1', hull: 'fw_slow' }), e2 = ship({ name: 'R2', hull: 'fw_fast' });
    for (const e of [e1, e2]) { e.ownerEmpireId = 'emp_001'; e.owner = 'emp_001'; e.isEnemy = true; }
    Math.random = () => 0.25;
    const r = os.issueGroupAttack([e1.id, e2.id], { targetBodyId: 'cel', targetSystemId: 'B', groupId: 'g1' });
    Math.random = realRandom;
    return { r, m: [e1, e2].map((e) => JSON.stringify(e.mission)), routes: [e1.warpRoute, e2.warpRoute], logs: logs.length };
  };
  const on = runAI();   // G5-B: porównanie z OFF wycofane — ścieżkę AI pinuje suma źródła wyżej
  assert(on.r?.ok === true && on.r?.composite === true, 'AI: grupa wystartowała skokiem');
  assert(on.routes.every((r) => r === null || r === undefined), 'AI: bez trasy planera');
  // `speedLY` nie działa na AI; kąt działa jak dotąd.
  scene();
  const e = ship({ name: 'R', hull: 'fw_med' }); e.ownerEmpireId = 'emp_001'; e.owner = 'emp_001'; e.isEnemy = true;
  assert(vMgr.dispatchInterstellar(e.id, 'B', { speedLY: 1, arrivalAngle: 2 }) === true, 'AI: dyspozytor przyjmuje opcje');
  assert(e.mission.warpSpeed === 6 && e.mission.arrivalAngle === 2, 'AI: własna prędkość, kąt z opcji');
  // Gracz — ta sama opcja działa, także przy premii beacona (zależy od celu, więc wspólna).
  scene();
  const p = ship({ name: 'P', hull: 'fw_med' });
  window.KOSMOS.starSystemManager = { hasBeacon: (id) => id === 'B', getSystem: () => null, generateAndRegister: () => {} };
  assert(vMgr.dispatchInterstellar(p.id, 'B', { speedLY: 2 }) === true, 'gracz: dyspozytor przyjmuje `speedLY`');
  assert(p.mission.warpSpeed === 6, 'gracz: `speedLY` × premia beacona (2 × 3)');
});

// ── T12 ─────────────────────────────────────────────────────────────────────────────────────────────────
group('T12 poprzedni rozkaz floty', () => {
  scene();
  const a = ship({ name: 'A', modules: ['weapon_laser'] }), b = ship({ name: 'B', modules: ['weapon_laser'] });
  const wrog = ship({ name: 'Wrog', modules: ['weapon_laser'] }); wrog.ownerEmpireId = 'emp_001'; wrog.owner = 'emp_001'; wrog.isEnemy = true;
  wrog.position.x = 6 * AU;
  const fid = makeFleet(a, b);
  const engaged = fSys.issueFleetOrder(fid, { type: 'engage', targetEntityId: wrog.id });
  assert(engaged?.ok === true && a.movementOrder?.status === 'active' && a.position.state === 'orbiting', 'kontrola: flota ma rozkaz `engage` i przechodzi bramkę stanu');
  events.length = 0;
  const res = issue(fid, 'B');
  assert(res?.ok === true, 'skok przejmuje flotę z rozkazem');
  assert(!a.movementOrder && !b.movementOrder, 'rozkazy ruchu członków skasowane');
  assert(a.mission?.type === 'interstellar_jump' && a.mission?.phase === 'warp_transit', 'misja skoku żywa po kasowaniu');
  const fleetEvents = events.filter((e) => e.ev.startsWith('fleet:')).map((e) => `${e.ev}:${e.reason ?? e.type}`);
  assert(fleetEvents.join() === 'fleet:orderCancelled:replaced,fleet:orderIssued:warp', `zastąpienie, potem wydanie — bez fałszywego zakończenia (jest: ${fleetEvents.join()})`);
  assert(runUntil(() => fleetOf(fid)?.activeOrder === null, 400) && a.systemId === 'B' && b.systemId === 'B', 'flota dolatuje: rozkaz nie wstrzymał tranzytu');
  // Migawka misji nie wskrzesza się przy kasowaniu rozkazu (inaczej statek wróciłby do `in_transit` i start odpadł).
  scene();
  const c = ship({ name: 'C', modules: ['weapon_laser'] });
  const w2 = ship({ name: 'W2', modules: ['weapon_laser'] }); w2.ownerEmpireId = 'emp_001'; w2.owner = 'emp_001'; w2.isEnemy = true; w2.position.x = 6 * AU;
  const fid2 = makeFleet(c);
  fSys.issueFleetOrder(fid2, { type: 'engage', targetEntityId: w2.id });
  c._suspendedMission = { type: 'move_to_point', targetId: null, targetX: 3 * AU, targetY: 0 };
  const res2 = issue(fid2, 'B');
  assert(res2?.ok === true && c.mission?.type === 'interstellar_jump' && !c._suspendedMission, 'migawka misji nie zabiera statku ze skoku');
});

// ── T13 ─────────────────────────────────────────────────────────────────────────────────────────────────
group('T13 faza 2 przy wyścigu', () => {
  scene();
  const a = ship({ name: 'A' }), b = ship({ name: 'B' });
  const fid = makeFleet(a, b);
  const mv = fSys.issueFleetOrder(fid, { type: 'moveToPoint', targetPoint: { x: 6 * AU, y: 0 } });
  const prev = fleetOf(fid).activeOrder;
  // Żywy rekord przy statkach już bez rozkazu: tylko tak faza 1 przechodzi, a jest co przywracać.
  for (const v of [a, b]) { v.position.state = 'orbiting'; v.movementOrder = null; }
  const orig = vMgr.dispatchInterstellar.bind(vMgr);
  vMgr.dispatchInterstellar = () => false;
  const res = issue(fid, 'B');
  vMgr.dispatchInterstellar = orig;
  assert(mv?.ok === true && res?.ok === false && res?.reason === 'dispatch_failed', 'nikt nie wystartował: odmowa');
  assert(res?.members?.length === 2 && res?.rejected?.length === 2, 'odmowa nazywa obu');
  assert(fleetOf(fid).activeOrder === prev, 'rekord wraca');
  assert(a.warpRoute === null && logs.filter((l) => l.text.includes('Eskadra')).length === 0, 'bez trasy i bez linii Dziennika');
  scene();
  const c = ship({ name: 'C' }), d = ship({ name: 'Odpadl' });
  const fid2 = makeFleet(c, d);
  const orig2 = vMgr.dispatchInterstellar.bind(vMgr);
  vMgr.dispatchInterstellar = (id, ...rest) => (id === d.id ? false : orig2(id, ...rest));
  const res2 = issue(fid2, 'B');
  vMgr.dispatchInterstellar = orig2;
  assert(res2?.ok === true && res2?.rejected?.[0]?.vesselId === d.id && res2?.accepted?.join() === c.id, 'część wystartowała: wynik mówi kto nie');
  assert(d.warpRoute === null && d.systemId === 'sys_home', 'statek bez startu stoi');
  assert(runUntil(() => fleetOf(fid2)?.activeOrder === null, 400) && c.systemId === 'B', 'reszta dolatuje i domyka rekord');
  // Rozkazy członków już zdjęte, a nikt nie wystartował: stary rekord nie wraca, bo nie miałby go kto domknąć.
  scene();
  const e = ship({ name: 'E', modules: ['weapon_laser'] });
  const w = ship({ name: 'W', modules: ['weapon_laser'] }); w.ownerEmpireId = 'emp_001'; w.owner = 'emp_001'; w.isEnemy = true; w.position.x = 6 * AU;
  const fid3 = makeFleet(e);
  fSys.issueFleetOrder(fid3, { type: 'engage', targetEntityId: w.id });
  const orig3 = vMgr.dispatchInterstellar.bind(vMgr);
  vMgr.dispatchInterstellar = () => false;
  const res3 = issue(fid3, 'B');
  vMgr.dispatchInterstellar = orig3;
  assert(res3?.ok === false && fleetOf(fid3)?.activeOrder === null && !e.movementOrder, 'rekord po zdjętych rozkazach nie wraca');
});

// ── T17 ─────────────────────────────────────────────────────────────────────────────────────────────────
group('T17 trasa podana z góry pasuje do TEGO statku', () => {
  scene();
  const a = ship({ name: 'A' });
  const refused = (label, target, opts, reason) => {
    const r = wrs.beginJourney(a.id, target, opts);
    assert(r?.ok === false && r?.reason === reason && !a.warpRoute && a.position.state === 'orbiting', `${label}: odmowa ${reason}, statek nietknięty`);
  };
  refused('inny układ odlotu', 'C', { hops: ['B', 'C'] }, 'bad_config');
  refused('inny cel', 'C', { hops: ['sys_home', 'B'] }, 'bad_config');
  refused('za krótka', 'sys_home', { hops: ['sys_home'] }, 'bad_config');
  refused('nieznany przystanek', 'C', { hops: ['sys_home', 'NIE_MA', 'C'] }, 'unknown_system');
  a.warpFuel.current = 1;
  refused('bak za mały', 'C', { hops: ['sys_home', 'B', 'C'] }, 'insufficient_warp_fuel');
  a.warpFuel.current = 20;
  // Skok 16 LY w jednym odcinku: planer by go nie wybrał (limit 10 LY), więc tylko trasa dosłowna daje taką listę.
  const r = wrs.beginJourney(a.id, 'C', { hops: ['sys_home', 'C'], speedLY: 2 });
  assert(r?.ok === true && a.warpRoute?.hops?.join() === 'sys_home,C' && a.mission?.toSystemId === 'C', 'lista przystanków użyta dosłownie');
  assert(a.mission?.warpSpeed === 2 && Math.abs(r?.route?.etaYears - 8) < 1e-9, '`speedLY` działa bez `groupId`; ETA liczone tą prędkością');
  assert(logCount(t('warpRoute.started', 'A', '???', '1')) + logCount(t('warpRoute.started', 'A', 'Cygni', '1')) === 1, 'bez `groupId` statek mówi sam za siebie');
});

// ── T14 ─────────────────────────────────────────────────────────────────────────────────────────────────
group('T14 tekst odmowy (D-GX-20)', () => {
  const texts = (locale) => {
    setLocale(locale);
    scene();
    const a = ship({ name: 'Kurier', fuel: 1 }), b = ship({ name: 'Magazyn' }); b.serviceState = 'stored';
    const c = ship({ name: 'Obok', sys: 'B' });
    return {
      fuel: GalaxyWarp.describeFleetWarpRefusal?.(issue(makeFleet(ship({ name: 'Pelny' }), a), 'D'))?.text,
      mixed: GalaxyWarp.describeFleetWarpRefusal?.(issue(makeFleet(a, b, c), 'D'))?.text,
      same: GalaxyWarp.describeFleetWarpRefusal?.(issue(makeFleet(ship({ name: 'Tu' })), 'sys_home'))?.text,
    };
  };
  const strip = (s) => s.replace(/^✗\s*/, '');
  for (const locale of ['en', 'pl']) {
    const x = texts(locale);
    const fuel = `Kurier (${strip(t('fleet.warpErrFuel'))})`;
    assert(x.fuel === t('vessel.orderNoneMoved', fuel), `${locale}: paliwo — kształt D-E2 (jest: ${x.fuel})`);
    assert(x.mixed?.includes(`Magazyn (${t('vessel.reasonVesselInReserve')})`), `${locale}: rezerwa z kluczem wspólnym z MOS`);
    assert(x.mixed?.includes(`Obok (${t('fleet.otherSystem')})`), `${locale}: członek w innym układzie (jest: ${x.mixed})`);
    assert(x.same === t('log.el.orderRejected', strip(t('fleet.warpErrSame'))), `${locale}: odmowa bez członków — powód floty`);
    for (const slug of ['insufficient_warp_fuel', 'vessel_in_reserve', 'group_split', 'same_system']) {
      assert(!!x.fuel && !!x.mixed && !!x.same && !`${x.fuel}${x.mixed}${x.same}`.includes(slug), `${locale}: bez sluga ${slug}`);
    }
  }
  setLocale('en');
  const keys = { 'galaxyMenu.fleetWarpTo': ['Flota: skok do {0}', 'Fleet: warp to {0}'], 'warpRoute.fleetStarted': ['{0}: flota skacze do {1} (skoki: {2})', '{0}: fleet warping to {1} (hops: {2})'], 'warpRoute.fleetCompleted': ['{0}: flota dotarła do {1}', '{0}: fleet arrived at {1}'], 'warpRoute.fleetAborted': ['{0}: trasa floty przerwana w {1}', '{0}: fleet route aborted at {1}'] };
  for (const [key, [pl, en]] of Object.entries(keys)) {
    assert(tIn('pl', key, '{0}', '{1}', '{2}') === pl && tIn('en', key, '{0}', '{1}', '{2}') === en, `${key}: brzmienie z §6 w obu językach`);
  }
  // Kontrole: pozostali konsumenci opisu odmowy bez zmian.
  scene();
  const v = ship({ name: 'Bez' });
  const f = { vesselId: v.id, reason: 'no_weapons' };
  assert([f].map(describeOrderFail)[0] === describeOrderFail(f) && describeOrderFail(f).startsWith('Bez ('), '`.map(describeOrderFail)` — indeks nie udaje słownika');
  const generic = describeFleetOrderRefusal({ ok: false, accepted: [], rejected: [f] })?.text;
  assert(generic === t('vessel.orderNoneMoved', describeOrderFail(f)), '`describeFleetOrderRefusal` bez słownika jak dotąd');
});

// ── T15 ─────────────────────────────────────────────────────────────────────────────────────────────────
group('T15 rozkaz floty w locie', () => {
  scene();
  const a = ship({ name: 'A' }), b = ship({ name: 'B' });
  const fid = makeFleet(a, b);
  issue(fid, 'D');
  const ao = fleetOf(fid)?.activeOrder;
  const res = fSys.issueFleetOrder(fid, { type: 'moveToPoint', targetPoint: { x: 6 * AU, y: 0 } });
  assert(ao?.type === 'warp' && res?.ok === false && res?.rejected?.every((r) => r.reason === 'vessel_in_warp_transit'), 'bramka warp odmawia każdemu członkowi');
  assert(fleetOf(fid)?.activeOrder === ao && a.warpRoute !== null, 'rekord i trasy nietknięte');
  assert(issue(fid, 'C')?.reason === 'in_transit', 'drugi skok w locie: odmowa `in_transit`');
  assert(fleetOf(fid)?.activeOrder === ao, 'rekord dalej ten sam');
});

// ── T16 ─────────────────────────────────────────────────────────────────────────────────────────────────
// PRZECELOWANE (G5-B): dawne „flaga w kodzie: ON” → pin odwrotny (klucza i predykatu nie ma); kontrole OFF wycofane — ścieżki OFF nie ma.
group('T16 flaga `fleetWarp` zdjęta (G5-B)', () => {
  assert(GAME_CONFIG.FEATURES.fleetWarp === undefined && !/\bfleetWarp\s*:/.test(stripComments(readSrc('config/GameConfig.js')))
    && GalaxyWarp.fleetWarpOn === undefined, 'klucz `FEATURES.fleetWarp` usunięty z GameConfig, predykat `fleetWarpOn` usunięty');
});

// ── T18 ─────────────────────────────────────────────────────────────────────────────────────────────────
// Stop = trasa kończy się na najbliższym przystanku. Trasa i rekord żyją do lądowania; jeden toast i jedna linia na flotę, w chwili, gdy ląduje ostatni.
const fleetEvents = (name) => events.filter((e) => e.ev === name);
const logsSince = (n) => logs.slice(n).map((l) => l.text);
const stop = (fid) => fSys.cancelFleetOrder(fid, 'manual');
const threeShips = () => [ship({ name: 'A', hull: 'fw_slow' }), ship({ name: 'B', hull: 'fw_med' }), ship({ name: 'C', hull: 'fw_fast' })];
const onHops = (vs, hops) => vs.every((v) => v.warpRoute?.hops?.join() === hops && v.warpRoute?.finalSystemId === hops.split(',').pop());

group('T18a Stop: w chwili kliku trasa kończy się na przystanku, reszta milczy', () => {
  scene();
  const vs = threeShips(), [a, b, c] = vs;
  const fid = makeFleet(a, b, c);
  assert(issue(fid, 'D')?.ok === true && onHops(vs, 'sys_home,B,C,D') && a.mission?.toSystemId === 'B', 'kontrola: flota leci trasą 3 skoków, pierwszy odcinek do B');
  tick(5);
  const etaBefore = GalaxyWarp.fleetWarpStatus?.(fleetOf(fid))?.etaYears;
  const nLogs = logs.length, nToasts = toasts.length, nEvents = events.length;
  assert(stop(fid) === true, 'Stop przyjęty');
  assert(onHops(vs, 'sys_home,B'), 'trasa każdego członka żyje i kończy się na najbliższym przystanku');
  assert(vs.every((v) => v.mission?.phase === 'warp_transit' && v.mission?.toSystemId === 'B' && v.position.state === 'in_transit' && v.systemId === null), 'bieżący odcinek leci dalej (kontrola)');
  const ao = fleetOf(fid)?.activeOrder;
  assert(ao?.type === 'warp' && ao?.stopped === true && ao?.targetSystemId === 'B' && ao?.hops?.join() === 'sys_home,B', 'rekord floty żyje i mówi, gdzie flota stanie');
  assert(!!ao && logs.length === nLogs && toasts.length === nToasts && events.length === nEvents, 'w chwili kliku: zero linii, toastów i zdarzeń (zero `fleet:orderCancelled`)');
  // Panel floty mówi prawdę od razu: to jedyna reakcja na klik, zanim flota wyląduje.
  const st = GalaxyWarp.fleetWarpStatus?.(fleetOf(fid));
  const left = a.mission.arrivalYear - window.KOSMOS.timeSystem.gameTime;
  assert(st?.targetSystemId === 'B' && st?.hops?.join() === 'sys_home,B', 'panel: celem jest przystanek');
  assert(etaBefore > st?.etaYears && Math.abs(st?.etaYears - left) < 1e-9, `panel: ETA tylko bieżącego odcinka (${etaBefore?.toFixed(2)} → ${st?.etaYears?.toFixed(2)})`);
  assert(GalaxyWarp.fleetWarpStatusLine?.(fleetOf(fid)) === `${t('fleetPicture.activity.warp')} → ${st?.targetName} · ${t('fleet.warpEta', st?.etaYears?.toFixed(1))}`, 'panel: linia z tym samym celem i ETA');
  // Drugi Stop nic nie zmienia; flota w locie dalej odmawia rozkazów.
  const before = snapshot();
  assert(ao?.stopped === true && stop(fid) === false && snapshot() === before && toasts.length === nToasts, 'drugi Stop: no-op');
  const mv = mos.issueOrder(a.id, { type: 'moveToPoint', targetPoint: { x: 6 * AU, y: 0 } });
  assert(mv?.ok === false && mv?.reason === 'vessel_in_warp_transit', 'w locie: członek dalej odmawia rozkazu ruchu (kontrola bramki warp)');
  assert(ao?.stopped === true && issue(fid, 'C')?.reason === 'in_transit' && fleetOf(fid)?.activeOrder === ao, 'w locie: nowy skok odbity, rekord ten sam');
});

group('T18b Stop: lądowanie na przystanku, jeden toast i jedna linia', () => {
  scene();
  const vs = threeShips(), [a, b, c] = vs;
  const fid = makeFleet(a, b, c);
  const seen = {};
  EventBus.on('interstellar:arrived', ({ vessel, systemId }) => { (seen[systemId] ??= {})[vessel.id] = tickNo; });
  issue(fid, 'D');
  const nLogs = logs.length, nToasts = toasts.length;
  stop(fid);
  let routeAlive = true, recordAlive = true, n = 0;
  while (a.systemId !== 'B' && n++ < 600) { if (!a.warpRoute) routeAlive = false; if (fleetOf(fid)?.activeOrder?.type !== 'warp') recordAlive = false; tick(); }
  assert(a.systemId === 'B' && routeAlive, 'trasa żyje aż do lądowania');
  assert(vs.every((v) => v.warpRoute === null && v.systemId === 'B' && v.position.state === 'orbiting' && v.mission?.phase === 'in_system'), 'trasa zdjęta po lądowaniu; wszyscy na orbicie przystanku');
  const ticks = Object.values(seen.B ?? {});
  assert(ticks.length === 3 && new Set(ticks).size === 1, `trzech członków w jednym ticku (${ticks.join()})`);
  assert(a.systemId === 'B' && samePos(a, b) && samePos(b, c) && Math.abs(Math.hypot(a.position.x, a.position.y) - 30 * AU) < 1e-6, 'lądują w jednym punkcie obrzeży (kąt floty, bez losowania per statek)');
  assert(recordAlive && fleetOf(fid)?.activeOrder === null, 'rekord floty żyje do lądowania i wtedy znika');
  assert(JSON.stringify(logsSince(nLogs)) === JSON.stringify([t('warpRoute.fleetAborted', 'Eskadra', 'Beta')]), `Dziennik: dokładnie jedna linia floty (jest: ${JSON.stringify(logsSince(nLogs))})`);
  const last = logs[logs.length - 1];
  assert(last?.channel === 'fleet' && last?.severity === 'warn', 'kanał floty, ostrzeżenie');
  assert(toasts.length - nToasts === 1 && toasts[nToasts]?.text === t('warpRoute.fleetAborted', 'Eskadra', 'Beta'), `dokładnie jeden toast floty (jest: ${toasts.length - nToasts})`);
  const done = fleetEvents('fleet:orderCompleted');
  assert(done.length === 1 && done[0].type === 'warp' && done[0].mode === 'aborted', 'jedno `fleet:orderCompleted`, tryb `aborted`');
  assert(fleetEvents('fleet:orderCancelled').length === 0, 'zero `fleet:orderCancelled` przez cały przebieg');
  assert(vs.every((v) => v.warpFuel.current === 16), `każdy zapłacił tylko bieżący odcinek: 8 LY × 0,5 (${vs.map((v) => v.warpFuel.current).join()})`);
  tick(600);
  assert(vs.every((v) => v.systemId === 'B' && v.position.state === 'orbiting'), 'flota stoi: nie rusza do C');
  assert(!Object.keys(seen).includes('C') && logsSince(nLogs).length === 1, 'zero przylotów dalej i zero kolejnych linii');
});

group('T18c Stop: członkowie wolni dla własnych rozkazów', () => {
  const landed = () => {
    scene();
    const vs = threeShips();
    const fid = makeFleet(...vs);
    issue(fid, 'D');
    stop(fid);
    runUntil(() => fleetOf(fid)?.activeOrder === null, 600);
    return { fid, vs };
  };
  const { fid, vs: [a, b, c] } = landed();
  assert(a.systemId === 'B' && !fleetOf(fid)?.activeOrder, 'flota stoi na przystanku');
  const mv = mos.issueOrder(a.id, { type: 'moveToPoint', targetPoint: { x: 6 * AU, y: 0 } });
  assert(mv?.ok === true && a.movementOrder?.type === 'moveToPoint' && a.position.state === 'in_transit', 'rozkaz ruchu członka przyjęty');
  const nLogs = logs.length;
  const own = os.issueWarp(b.id, 'C');
  assert(own?.ok === true && b.warpRoute?.groupId === undefined && b.mission?.warpSpeed === 6, 'własny skok członka przyjęty, jego własną prędkością (bez blokady floty)');
  assert(runUntil(() => b.warpRoute === null, 600) && b.systemId === 'C', 'własny skok dolatuje');
  assert(logCount(t('warpRoute.completed', 'B', 'Cygni')) === 1 && logsSince(nLogs).includes(t('warpRoute.completed', 'B', 'Cygni')), 'po Stopie członek mówi sam za siebie');
  assert(c.systemId === 'B' && c.position.state === 'orbiting' && !c.movementOrder, 'trzeci stoi nietknięty');
  // Nowy rozkaz CAŁEJ floty z przystanku: nowa grupa, normalny koniec.
  const again = landed();
  const groupBefore = again.vs[0].warpRoute;
  const res = issue(again.fid, 'D');
  const ao = fleetOf(again.fid)?.activeOrder;
  assert(groupBefore === null && res?.ok === true && ao?.stopped !== true && ao?.hops?.join() === 'B,C,D', 'nowy skok floty z przystanku: nowy rekord, bez znacznika Stopu');
  assert(runUntil(() => fleetOf(again.fid)?.activeOrder === null, 800) && again.vs.every((v) => v.systemId === 'D'), 'flota dolatuje do celu');
  assert(logCount(t('warpRoute.fleetCompleted', 'Eskadra', 'Delta')) === 1 && logCount(t('warpRoute.fleetAborted', 'Eskadra', 'Beta')) === 1, 'linia przerwania i linia dotarcia — po jednej');
});

group('T18d Stop na odcinku środkowym i ostatnim', () => {
  scene();
  const vs = threeShips();
  const fid = makeFleet(...vs);
  issue(fid, 'D');
  runUntil(() => vs[0].mission?.toSystemId === 'C');
  const n = logs.length;
  assert(vs[0].warpRoute?.legIndex === 1 && stop(fid) === true && onHops(vs, 'sys_home,B,C'), 'środkowy odcinek: trasa kończy się na następnym przystanku, nie na poprzednim');
  runUntil(() => fleetOf(fid)?.activeOrder === null, 600);
  assert(vs.every((v) => v.systemId === 'C' && v.warpRoute === null), 'flota stoi na C');
  assert(JSON.stringify(logsSince(n)) === JSON.stringify([t('warpRoute.fleetAborted', 'Eskadra', 'Cygni')]), 'linia przerwania nazywa C');
  assert(vs.every((v) => v.systemId === 'C' && v.warpFuel.current === 12), `dwa odcinki paliwa: 16 LY × 0,5 (${vs.map((v) => v.warpFuel.current).join()})`);
  // Ostatni odcinek: przystankiem jest cel. Nic nie ma do przerwania, więc to zwykły przylot.
  for (const [label, target, prep] of [['trasa 2 skoków', 'C', (a) => runUntil(() => a.mission?.toSystemId === 'C')], ['trasa 1 skoku', 'B', () => {}]]) {
    scene();
    const ws = threeShips();
    const f2 = makeFleet(...ws);
    issue(f2, target);
    prep(ws[0]);
    const ao = fleetOf(f2)?.activeOrder;
    const route = ws[0].warpRoute?.hops?.join();
    const nL = logs.length, nT = toasts.length;
    assert(!!ao && stop(f2) === false && fleetOf(f2)?.activeOrder === ao && ao?.stopped !== true && ws[0].warpRoute?.hops?.join() === route, `${label}: Stop na ostatnim odcinku nic nie zmienia`);
    runUntil(() => fleetOf(f2)?.activeOrder === null, 600);
    assert(ws.every((v) => v.systemId === target), `${label}: flota w celu`);
    assert(JSON.stringify(logsSince(nL)) === JSON.stringify([t('warpRoute.fleetCompleted', 'Eskadra', target === 'C' ? 'Cygni' : 'Beta')]) && toasts.length === nT, `${label}: linia dotarcia, zero przerwania, zero toastu`);
    assert(fleetEvents('fleet:orderCompleted')[0]?.mode === 'completed', `${label}: tryb \`completed\``);
  }
});

group('T18e Stop przeżywa zapis i wczytanie przed lądowaniem', () => {
  scene();
  const a = ship({ name: 'A', hull: 'fw_slow' }), b = ship({ name: 'B', hull: 'fw_fast' });
  const fid = makeFleet(a, b);
  issue(fid, 'D');
  tick(5);
  stop(fid);
  const saved = JSON.parse(JSON.stringify({ v: vMgr.serialize(), f: fSys.serialize() }));
  const yearSaved = window.KOSMOS.timeSystem.gameTime;
  EventBus.clear();
  logs.length = 0;
  vMgr = new VesselManager();
  wire();
  vMgr.restore(saved.v);
  fSys.restore(saved.f);
  window.KOSMOS.timeSystem.gameTime = yearSaved;
  const a2 = vMgr.getVessel(a.id), b2 = vMgr.getVessel(b.id);
  const ao = fleetOf(fid)?.activeOrder;
  assert(onHops([a2, b2], 'sys_home,B') && ao?.stopped === true && ao?.targetSystemId === 'B' && ao?.hops?.join() === 'sys_home,B', 'po wczytaniu: skrócona trasa i rekord Stopu');
  assert(Number.isFinite(a2.mission?.arrivalAngle) && a2.mission?.arrivalAngle === b2.mission?.arrivalAngle, 'po wczytaniu: kąt lądowania w misji');
  runUntil(() => fleetOf(fid)?.activeOrder === null, 600);
  assert(a2.systemId === 'B' && b2.systemId === 'B' && samePos(a2, b2), 'po wczytaniu: lądują razem na przystanku');
  assert(JSON.stringify(logs.map((l) => l.text)) === JSON.stringify([t('warpRoute.fleetAborted', 'Eskadra', 'Beta')]) && toasts.length === 1, 'po wczytaniu: jedna linia i jeden toast');
});

group('T18f Stop: członek poza flotą, wrak, własne przerwanie, rozwiązanie floty', () => {
  // Odszedł PRZED Stopem: Stop go nie dotyczy, leci do celu i mówi sam.
  scene();
  const f = ship({ name: 'F' }), g = ship({ name: 'Odszedl' });
  const fid = makeFleet(f, g);
  issue(fid, 'D');
  fSys.removeMember(g.id, 'manual');
  assert(stop(fid) === true && f.warpRoute?.hops?.join() === 'sys_home,B' && g.warpRoute?.hops?.join() === 'sys_home,B,C,D', 'odszedł przed Stopem: jego trasa nietknięta');
  runUntil(() => f.warpRoute === null && g.warpRoute === null, 800);
  assert(f.systemId === 'B' && g.systemId === 'D', 'członek staje, odszedł dolatuje');
  assert(logCount(t('warpRoute.fleetAborted', 'Eskadra', 'Beta')) === 1 && logCount(t('warpRoute.completed', 'Odszedl', 'Delta')) === 1, 'flota — jedna linia; odszedł — własna');
  // Odszedł PO Stopie: dostał rozkaz jeszcze jako członek, więc staje, ale mówi sam.
  scene();
  const h = ship({ name: 'H' }), i = ship({ name: 'Pozniej' });
  const fid2 = makeFleet(h, i);
  issue(fid2, 'D');
  stop(fid2);
  fSys.removeMember(i.id, 'manual');
  assert(fleetOf(fid2)?.activeOrder?.stopped === true, 'rekord żyje po odejściu');
  runUntil(() => h.warpRoute === null && i.warpRoute === null, 600);
  assert(h.systemId === 'B' && i.systemId === 'B', 'obaj stają na przystanku');
  assert(logCount(t('warpRoute.fleetAborted', 'Eskadra', 'Beta')) === 1 && toasts.length === 1 && logCount(t('warpRoute.completed', 'Pozniej', 'Beta')) === 1 && logCount(t('warpRoute.completed', 'H', 'Beta')) === 0, 'flota — jedna linia i toast; odszedł — własna; członek — żadnej');
  // Wrak w locie po Stopie: reszta ląduje, linia nadal jedna.
  scene();
  const j = ship({ name: 'J' }), k = ship({ name: 'Wrak' });
  const fid3 = makeFleet(j, k);
  issue(fid3, 'D');
  stop(fid3);
  k.isWreck = true; EventBus.emit('vessel:wrecked', { vesselId: k.id });
  assert(fleetOf(fid3)?.activeOrder?.stopped === true, 'wrak: rekord żyje, dopóki leci drugi');
  runUntil(() => fleetOf(fid3)?.activeOrder === null, 600);
  assert(j.systemId === 'B' && logCount(t('warpRoute.fleetAborted', 'Eskadra', 'Beta')) === 1 && toasts.length === 1, 'wrak: ocalały na przystanku, jedna linia i toast');
  // Nikt nie doleciał: rekord znika bez linii o przystanku.
  scene();
  const l = ship({ name: 'L' }), m = ship({ name: 'M' });
  const fid4 = makeFleet(l, m);
  issue(fid4, 'D');
  const stoppedAll = stop(fid4) === true && fleetOf(fid4)?.activeOrder?.stopped === true;   // świadek: bez niego stary Stop zielenił te dwa wiersze
  for (const v of [l, m]) { v.isWreck = true; EventBus.emit('vessel:wrecked', { vesselId: v.id }); }
  assert(stoppedAll && (fleetOf(fid4)?.activeOrder ?? null) === null, 'wszyscy wrakami: rekord zdjęty');
  assert(stoppedAll && logCount(t('warpRoute.fleetAborted', 'Eskadra', 'Beta')) === 0 && toasts.length === 0, 'wszyscy wrakami: bez linii i toastu');
  // Własne przerwanie członka (nie przez Stop) mówi nadal samo: inaczej statek znikałby z floty bez słowa (K8).
  scene();
  const o = ship({ name: 'O' }), p = ship({ name: 'Przerwany' });
  const fid5 = makeFleet(o, p);
  issue(fid5, 'D');
  wrs.abortJourney(p.id, 'superseded');
  assert(stop(fid5) === true && p.warpRoute === null && logCount(t('warpRoute.aborted', 'Przerwany', 'superseded')) === 1, 'własne przerwanie członka: własna linia (kontrola)');
  runUntil(() => fleetOf(fid5)?.activeOrder === null, 600);
  assert(logCount(t('warpRoute.fleetAborted', 'Eskadra', 'Beta')) === 1 && logCount(t('warpRoute.aborted', 'Przerwany', 'superseded')) === 1, 'obok niego jedna linia floty');
  // Członek na WŁASNEJ trasie (zszedł z trasy floty i skacze sam): Stop floty go nie dotyczy.
  scene();
  const u = ship({ name: 'U' }), w = ship({ name: 'Wlasny' });
  const fid7 = makeFleet(u, w);
  issue(fid7, 'D');
  wrs.abortJourney(w.id, 'superseded');
  runUntil(() => w.systemId === 'B');
  const ownJump = os.issueWarp(w.id, 'D');   // dwa odcinki: trasa jednoodcinkowa nie ma czego skracać, więc pin byłby jałowy
  runUntil(() => u.mission?.toSystemId === 'C');
  const ownBefore = w.warpRoute?.hops?.join();
  assert(ownJump?.ok === true && ownBefore === 'B,C,D' && w.warpRoute?.legIndex === 0 && w.warpRoute?.groupId === undefined, 'kontrola: członek leci własną trasą dwóch odcinków, bez znacznika floty');
  assert(stop(fid7) === true && u.warpRoute?.hops?.join() === 'sys_home,B,C' && w.warpRoute?.hops?.join() === ownBefore, 'Stop floty skraca trasę floty, nie jego własną');
  // Flota rozwiązana między Stopem a lądowaniem: nie ma już kto mówić za flotę, więc każdy mówi sam.
  scene();
  const q = ship({ name: 'Q' }), r = ship({ name: 'R' });
  const fid6 = makeFleet(q, r);
  issue(fid6, 'D');
  const stoppedQ = stop(fid6);
  fSys.disbandFleet(fid6, 'manual');
  runUntil(() => q.warpRoute === null && r.warpRoute === null, 600);
  assert(stoppedQ === true && q.systemId === 'B' && r.systemId === 'B', 'rozwiązana: statki stają na przystanku');
  assert(stoppedQ === true && logCount(t('warpRoute.completed', 'Q', 'Beta')) === 1 && logCount(t('warpRoute.completed', 'R', 'Beta')) === 1 && toasts.length === 0, 'rozwiązana: każdy mówi sam, bez linii floty');
});

group('T18g Stop: popup przylotu raz na flotę, w obu kolejnościach słuchaczy', () => {
  const run = (listenerFirst) => {
    scene();
    if (listenerFirst) EventBus.clear();
    let shown = null;
    const seen = [];
    EventBus.on('interstellar:arrived', ({ vessel, systemId }) => {
      const kind = GalaxyWarp.fleetArrivalPopupKind?.(vessel, systemId, shown);
      if (kind === 'fleet') shown = vessel.mission.warpGroupId;
      seen.push(`${vessel.name}@${systemId}:${kind}`);
    });
    if (listenerFirst) { vMgr = new VesselManager(); wire(); }
    const vs = threeShips();
    const fid = makeFleet(...vs);
    issue(fid, 'D');
    stop(fid);
    runUntil(() => fleetOf(fid)?.activeOrder === null, 600);
    return seen;
  };
  for (const [label, seen] of [['słuchacz po WarpRouteSystem', run(false)], ['słuchacz przed WarpRouteSystem', run(true)]]) {
    assert(seen.length === 3 && seen.every((s) => s.includes('@B:')), `${label}: 3 przyloty, wszystkie na przystanku (${seen.join(' ')})`);
    assert(seen.filter((s) => s.endsWith(':fleet')).length === 1 && seen.filter((s) => s.endsWith(':none')).length === 2, `${label}: jeden popup floty, reszta cicho`);
  }
  // Odcinek pośredni bez Stopu nadal nie daje popupu (kontrola, że to Stop dał przystankowi kąt).
  scene();
  const vs = threeShips();
  const fid = makeFleet(...vs);
  const kinds = [];
  EventBus.on('interstellar:arrived', ({ vessel, systemId }) => { if (systemId === 'B') kinds.push(GalaxyWarp.fleetArrivalPopupKind?.(vessel, systemId, null)); });
  issue(fid, 'D');
  runUntil(() => kinds.length === 3, 600);
  assert(kinds.join() === 'none,none,none', 'kontrola: bez Stopu przystanek bez popupu');
  assert(vs.every((v) => v.mission?.arrivalAngle === undefined), 'kontrola: bez Stopu odcinki pośrednie bez kąta');
});

group('T18h Stop innego rozkazu floty bez zmian (kontrola)', () => {
  scene();
  const a = ship({ name: 'A' }), b = ship({ name: 'B' });
  const fid = makeFleet(a, b);
  const mv = fSys.issueFleetOrder(fid, { type: 'moveToPoint', targetPoint: { x: 6 * AU, y: 0 } });
  assert(mv?.ok === true && !!a.movementOrder && a.position.state === 'in_transit', 'flota leci rozkazem `moveToPoint`');
  assert(stop(fid) === true && fleetOf(fid)?.activeOrder === null && !a.movementOrder && !b.movementOrder, 'Stop kasuje rekord i rozkazy członków od razu');
  assert(fleetEvents('fleet:orderCancelled').length === 1 && fleetEvents('fleet:orderCancelled')[0].reason === 'manual', '`fleet:orderCancelled(manual)` jak dotąd');
  assert(logCount(t('warpRoute.fleetAborted', 'Eskadra', 'Beta')) === 0 && toasts.length === 0, 'bez linii i toastu skoku');
});

console.log(`\n══════ fleet_warp_smoke: ${pass} PASS / ${fail} FAIL ══════`);
process.exit(fail > 0 ? 1 : 0);
