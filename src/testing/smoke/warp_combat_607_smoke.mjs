// ══════════════════════════════════════════════════════════════════════════════
// warp_combat_607_smoke — Finding 607: statek gracza w aktywnym starciu nie skacze.
// ──────────────────────────────────────────────────────────────────────────────
// Defekt: `WarpRouteSystem.canOrder` nie pytał o walkę. Skok w trakcie starcia był przyjmowany i płatny, statek zostawał w walce, a po przegranej
// wrak dostawał stempel `sys_home` i zachowywał trasę. Naprawa: ten sam predykat co „Odwrót” grupy i bramka MOS `not_in_combat` (`combatCheckOf`,
// Finding 562) w `canOrder`, a dla wejść omijających planer także w `dispatchInterstellar`. Tylko gałąź gracza, bez flagi.
//
// T0   ślad AI (skok, grupa, powrót, odwrót, przegrana, wrak w locie) i kontroli gracza `===` nagranie z eca9a3b. Biegnie PIERWSZY.
// T1   statek w starciu: `canOrder`, `issueWarp`, `beginJourney` odmawiają `in_combat`; zapis statków co do bitu, rdzenie, rozkaz i starcie bez zmian.
// T2   powierzchnie: menu gwiazdy, wiersz pickera, podgląd najechania, rozkaz z menu, słownik odmowy PL i EN. Ten sam powód, bez drugiej gałęzi.
// T3   dyspozytor wprost, także `force`: odmowa, nic się nie zmienia, strażnik przed zapłatą i przed zamknięciem rozkazu (Finding 603).
// T4   flota z jednym członkiem w starciu: odmowa nazywa tego członka, `fleet.activeOrder` nietknięty, członkowie co do bitu.
// T5   koniec starcia: `canOrder` ok, skok statku i floty dolatuje.
// T6   kontrola: statek obok starcia skacze; bez systemu walki bramka przepuszcza; `immobilized` zostaje przed walką; odwrót w starciu = `in_combat`.
// T7   AI: `canOrder` jak dotąd `not_player`, dyspozytor przyjmuje AI w starciu.
// T8   trasy złożone: `issueMove` do innego układu, `issueReturn` z obcego układu: odmowa, statek co do bitu.
// T9   zapis i wczytanie w trakcie starcia: bramka dalej odmawia.
// T10  pin źródłowy: jedno źródło predykatu, miejsce obu strażników, jeden wiersz słownika, żadnej gałęzi `in_combat` poza bramką.
// T11  pomocniki bramki: `probe603Battle(1)`, `fleetWarpBattle(i)`.
//
// Nagranie baseline'u (TYLKO na drzewie sprzed naprawy): … --record  z F607_BASELINE_COMMIT=<hash>
// ⚠ PRZECELOWANIE CV-3c (decyzja właściciela 44 (5), 2026-11-12): wrak leży w miejscu śmierci okrętu, nie w punkcie środkowym starcia.
//   Dwa ślady z wrakiem AI (`ai_lost_battle`, `ai_wrecked_mid_flight`) porównujemy z nagraniem CV-3c (`--record-cv3c`, osobny plik);
//   ŚWIADEK: po podstawieniu starej współrzędnej x wraku ślad CV-3c jest co do bajtu starym nagraniem (M1 / eca9a3b) — zmienił się
//   wyłącznie punkt wraku, nic więcej (zdarzenia, stany, misje, paliwo, stempel układu).
// ══════════════════════════════════════════════════════════════════════════════

import { reseed } from '../headless/env.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { tIn } from '../../i18n/i18n.js';
import { VesselManager } from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { FleetSystem } from '../../systems/FleetSystem.js';
import { WarpRouteSystem } from '../../systems/WarpRouteSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { DeepSpaceCombatSystem, CIV_PER_ROUND } from '../../systems/DeepSpaceCombatSystem.js';
import { AutoRetreatSystem } from '../../systems/AutoRetreatSystem.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { SHIPS } from '../../data/ShipsData.js';
import { HULLS } from '../../data/HullsData.js';
import {
  warpMenuOption, sendPickerRows, sendPickerModel, sendPickerFleetRows, fleetWarpMenuOption, galaxyStarMenuEntries,
  warpHoverModel, runGalaxyWarpOrder, runGalaxyFleetWarpOrder, refusalText, warpErrLabel,
} from '../../ui/GalaxyWarpLogic.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', '..');
const FIXTURE = join(SRC, 'testing', 'fixtures', 'traces', 'F607-warp-combat-baseline.json');
const RECORD = process.argv.includes('--record');

const logOut = console.log.bind(console);
console.log = () => {};
console.warn = () => {};
console.error = () => {};
let pass = 0, fail = 0;
const assert = (cond, msg) => { if (cond) pass++; else { fail++; logOut(`  ✗ ${msg}`); } };
const section = (s) => logOut(`\n${s}`);

SHIPS.p_hull = { ...HULLS.hull_frigate, id: 'p_hull', warpCapable: true, warpSpeedLY: 6 };   // 6 LY/rok: lot 8 LY = 1,33 roku
const AU = GAME_CONFIG.AU_TO_PX, DT = 0.02, CIV = GAME_CONFIG.CIV_TIME_SCALE ?? 12;
const FLIGHT = Math.ceil(8 / 6 / DT);
const NEAR = 0.04 * AU;                                               // w zasięgu lasera (WEAPON_SHORT_AU = 0,05)
const WEAK = () => ({ hpMissing: 1e9, shieldMissing: 1e9 });          // 1 HP, bez tarczy: pierwsze trafienie kończy

const TRACED_EVENTS = ['interstellar:departed', 'interstellar:arrived', 'vessel:launched', 'vessel:orderIssued', 'vessel:orderCompleted', 'vessel:orderCancelled', 'vessel:orderBlocked',
  'warpRoute:started', 'warpRoute:completed', 'warpRoute:aborted', 'vessel:wrecked', 'vessel:autoRetreatIssued', 'vessel:autoRetreatFailed'];

function world({ year = 100 } = {}) {
  EventBus.clear(); EntityManager.clear();
  const body = (id, name, a, systemId) => ({ id, type: 'planet', name, x: a * AU, y: 0, radius: 8, mass: 1, orbital: { a, e: 0, T: 1e6, M: 0, inclinationOffset: 0 }, physics: { x: a * AU, y: 0 }, systemId, explored: true });
  const home = body('p_home', 'Dom', 1, 'sys_home'), cel = body('cel_b', 'Cel', 2, 'B'), far = body('f_b', 'Kolonia B', 3, 'B');
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  const logs = [], toasts = [], events = [], sel = { vessel: null, fleet: null };
  window.KOSMOS = {
    timeSystem: { gameTime: year, pause: () => {} }, activeSystemId: 'sys_home', civMode: true, homePlanet: home,
    galaxyData: { systems: [{ id: 'sys_home', name: 'Dom', x: 0, y: 0, z: 0 }, { id: 'B', name: 'Beta', x: 8, y: 0, z: 0 }, { id: 'C', name: 'Cygni', x: 16, y: 0, z: 0 }] },
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1, getMissionYieldBonus: () => 0, getDisasterReduction: () => 0, getShipSurvivalChance: () => 0 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find((c) => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: (e) => logs.push(e), getEntries: () => logs },
    uiManager: { getSelectedVesselId: () => sel.vessel, getSelectedVesselIds: () => (sel.vessel != null ? [sel.vessel] : []), getSelectedFleetId: () => sel.fleet, setSelectedFleetId: (id) => { sel.fleet = id; } },
    empireRegistry: { listAll: () => [{ id: 'emp_001', name: 'Liga' }], get: (id) => (id === 'emp_001' ? { id, name: 'Liga' } : null) },
    directorProduction: { capitalOf: () => 'cel_b' },
    debug: {},
  };
  for (const b of [home, cel, far]) EntityManager.add(b);
  const vm = new VesselManager(), mos = new MovementOrderSystem(vm), fs = new FleetSystem(vm), wrs = new WarpRouteSystem(vm), os = new OrderService(), dscs = new DeepSpaceCombatSystem(vm);
  Object.assign(window.KOSMOS, {
    vesselManager: vm, movementOrderSystem: mos, fleetSystem: fs, warpRouteSystem: wrs, orderService: os, deepSpaceCombatSystem: dscs,
    enemyAttackHandler: Object.create(EnemyAttackHandler.prototype),   // prawdziwy `_turnIntoWreck`, bez subskrypcji konstruktora
  });
  new AutoRetreatSystem(vm, window.KOSMOS.colonyManager, mos);
  EventBus.on('ui:toast', ({ text }) => toasts.push(text));
  const W = { vm, mos, fs, wrs, os, dscs, logs, toasts, events, home, cel, sel, tickNo: 0 };
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
  W.fight = (a, b) => { dscs.handleCombatRangeEnter(a.id, b.id, false); return dscs._findActiveEncounterContaining(a.id); };
  W.rounds = (enc, cap = 120) => { for (let i = 0; i < cap && enc?.isActive; i++) dscs._tickEncounter(enc, CIV_PER_ROUND); return !enc?.isActive; };
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

const bits = (v) => JSON.stringify([v.position, v.status, v.systemId, v.mission, v.movementOrder, v.warpFuel, v.warpRoute ?? null, v.pendingOrder ?? null, v._suspendedMission ?? null]);
const saved = (W) => JSON.stringify(W.vm.serialize());
const canOrderOf = (W) => (v) => W.wrs.canOrder(v);
const REASON_PL = 'Statek bierze udział w bitwie', REASON_EN = 'Vessel is in combat';

// ── T0 — ślad: ten sam kod nagrywa i porównuje ──────────────────────────────────────────────────────────────────────
function traceOf(W, ships, ticks, every = 5) {
  const samples = [];
  const sample = (no) => {
    if (no % every !== 0) return;
    samples.push(ships.map((v) => [v.name, v.systemId, v.position.state, v.status, v.position.x, v.position.y, v.mission?.type ?? null, v.mission?.phase ?? null, v.mission?.toSystemId ?? null, v.pendingOrder?.kind ?? null, v.movementOrder?.type ?? null, v.movementOrder?.status ?? null, v.warpFuel?.current ?? null, v.warpRoute ? v.warpRoute.legIndex : null, v.isWreck === true].join('|')));
  };
  sample(0);
  W.tick(ticks, sample);
  return { samples, events: W.events };
}

const TRACES = {
  // AI w starciu dostaje skok: strażnik jest wyłącznie dla gracza (`OrderService` kieruje AI wprost do dyspozytora).
  ai_warp_in_encounter() {
    const W = world(), p = W.ship('P1'), e = W.enemy('R1', 2 * AU + NEAR);
    const enc = W.fight(p, e);
    const r = W.os.issueWarp(e.id, 'B');
    return { enc: enc?.isActive === true, r: r?.ok === true, ...traceOf(W, [e, p], FLIGHT * 2) };
  },
  // Łańcuch uderzenia: `issueGroupAttack` + `pendingOrder`, jeden z pary w starciu.
  ai_group_in_encounter() {
    const W = world(), p = W.ship('P2'), e1 = W.enemy('R2', 2 * AU + NEAR), e2 = W.enemy('R3', 6 * AU);
    const enc = W.fight(p, e1);
    const r = W.os.issueGroupAttack([e1.id, e2.id], { targetBodyId: 'cel_b', targetSystemId: 'B', groupId: 'g1' });
    return { enc: enc?.isActive === true, r: { ok: r?.ok === true, composite: r?.composite ?? null }, ...traceOf(W, [e1, e2, p], FLIGHT * 3) };
  },
  // Powrót AI do stolicy (`issueRecall`, Z2) ze starcia.
  ai_recall_in_encounter() {
    const W = world(), p = W.ship('P3'), e = W.enemy('R4', 2 * AU + NEAR);
    const enc = W.fight(p, e);
    const r = W.os.issueRecall(e.id, { homeSystemId: 'B', capitalBodyId: 'cel_b' });
    return { enc: enc?.isActive === true, r: r?.ok === true, ...traceOf(W, [e, p], FLIGHT * 3) };
  },
  // Rozkaz odwrotu AI w starciu (schronienie w układzie, bez skoku).
  ai_retreat_in_encounter() {
    const W = world(), p = W.ship('P4'), e = W.enemy('R5', 2 * AU + NEAR);
    const enc = W.fight(p, e);
    const o = W.mos.issueOrder(e.id, { type: 'retreat' });
    return { enc: enc?.isActive === true, o: o?.ok === true, type: e.movementOrder?.type ?? null, ...traceOf(W, [e, p], FLIGHT) };
  },
  // Przegrana AI: runda po rundzie do końca, odwrót przez `AutoRetreatSystem`.
  ai_lost_battle() {
    const W = world(), p = W.ship('P5'), e = W.enemy('R6', 2 * AU + NEAR);
    e.combatDamage = { hpMissing: W.dscs._buildVesselState(e).hp - 16, shieldMissing: 1e9 };   // 16 HP: trafienie lasera (15) zostawia 1 HP, próg odwrotu, nie zabicie
    const enc = W.fight(p, e);
    const ended = W.rounds(enc);
    return { enc: true, ended, ...traceOf(W, [e, p], FLIGHT) };
  },
  // AI skacze z układu B i ginie w locie: stempel wraku (Finding 609). Wylot z B, żeby odróżnić układ wylotu od `sys_home`.
  ai_wrecked_mid_flight() {
    const W = world(), p = W.ship('P6', 2 * AU, 'B'), e = W.enemy('R7', 2 * AU + NEAR, 'B');
    e.combatDamage = WEAK();
    const enc = W.fight(p, e);
    const r = W.os.issueWarp(e.id, 'C'), midFlight = e.mission?.phase ?? null;
    W.tick(3);
    const ended = W.rounds(enc);
    const t = traceOf(W, [e, p], 10, 1);
    return { r: r?.ok === true, midFlight, ended, wreck: e.isWreck === true, stamp: e.systemId, ...t };
  },
  // Kontrola: statek gracza obok cudzego starcia skacze jak dotąd.
  player_bystander() {
    const W = world(), p = W.ship('P7'), e = W.enemy('R8', 2 * AU + NEAR), a = W.ship('K1', 6 * AU);
    const enc = W.fight(p, e);
    const r = W.os.issueWarp(a.id, 'B');
    return { enc: enc?.isActive === true, member: enc?.vesselStates?.has(a.id) === true, r: r?.ok === true, ...traceOf(W, [a], FLIGHT * 2) };
  },
  // Kontrola: po wygranej skok jak dotąd.
  player_after_battle() {
    const W = world(), p = W.ship('P8'), e = W.enemy('R9', 2 * AU + NEAR);
    e.combatDamage = WEAK();
    const enc = W.fight(p, e), ended = W.rounds(enc);
    const r = W.os.issueWarp(p.id, 'B');
    return { ended, won: !p.isWreck && e.isWreck === true, r: r?.ok === true, ...traceOf(W, [p], FLIGHT * 2) };
  },
};

const recorded = {};
for (const [name, run] of Object.entries(TRACES)) {
  reseed(`f607-${name}`);
  recorded[name] = JSON.stringify(run());
}

if (RECORD) {
  mkdirSync(dirname(FIXTURE), { recursive: true });
  writeFileSync(FIXTURE, JSON.stringify({ finding: 607, recordedFrom: process.env.F607_BASELINE_COMMIT ?? 'unknown', flightTicks: FLIGHT, traces: recorded }));
  logOut(`nagrano ${FIXTURE}`);
  process.exit(0);
}
// ⚠ PRZECELOWANIE M1 „bitwy do końca” (decyzja 33, 2026-11-11): dwa ślady AI zmieniła MECHANIKA M1, nie bramka 607 — odwrót AI
//   jest prawdziwym lotem w trakcie starcia (rozkaz odwrotu przy niskim HP wydaje DSCS, lot na zegarze starcia, ogień jednoczesny).
//   `ai_retreat_in_encounter` i `ai_lost_battle` porównujemy więc z nagraniem z drzewa M1 (`--record-m1`, osobny plik); pozostałe
//   sześć — z `eca9a3b` jak dotąd (pytanie 607: „bramka gracza nie dotyka AI” odpowiadają te sześć i T7).
const M1_RETRACED = ['ai_retreat_in_encounter', 'ai_lost_battle'];
const FIXTURE_M1 = join(SRC, 'testing', 'fixtures', 'traces', 'M1-warp-combat-ai-retreat-baseline.json');
if (process.argv.includes('--record-m1')) {
  mkdirSync(dirname(FIXTURE_M1), { recursive: true });
  writeFileSync(FIXTURE_M1, JSON.stringify({ step: 'M1', recordedFrom: process.env.M1_BASELINE_COMMIT ?? 'unknown', flightTicks: FLIGHT,
    traces: Object.fromEntries(M1_RETRACED.map((n) => [n, recorded[n]])) }));
  logOut(`nagrano ${FIXTURE_M1}`);
  process.exit(0);
}
// ⚠ PRZECELOWANIE CV-3c (decyzja 44 (5)): wrak w miejscu śmierci okrętu. Dwa ślady z wrakiem AI — nagranie CV-3c (osobny plik). Stare
//   nagrania zostają: świadek T0 sprawdza, że różnica to WYŁĄCZNIE współrzędna x wiersza wraku (pole 4).
const CV3C_RETRACED = ['ai_lost_battle', 'ai_wrecked_mid_flight'];
const FIXTURE_CV3C = join(SRC, 'testing', 'fixtures', 'traces', 'CV3c-warp-combat-wreck-baseline.json');
if (process.argv.includes('--record-cv3c')) {
  mkdirSync(dirname(FIXTURE_CV3C), { recursive: true });
  writeFileSync(FIXTURE_CV3C, JSON.stringify({ step: 'CV-3c', recordedFrom: process.env.CV3C_BASELINE_COMMIT ?? 'unknown', flightTicks: FLIGHT,
    traces: Object.fromEntries(CV3C_RETRACED.map((n) => [n, recorded[n]])) }));
  logOut(`nagrano ${FIXTURE_CV3C}`);
  process.exit(0);
}

section('T0 — ślad AI i kontroli gracza jak na eca9a3b');
let BASE = null;
try { BASE = JSON.parse(readFileSync(FIXTURE, 'utf8')); } catch { BASE = null; }
assert(BASE?.recordedFrom === 'eca9a3b', 'T0 nagranie z eca9a3b istnieje');
let BASE_M1 = null;
try { BASE_M1 = JSON.parse(readFileSync(FIXTURE_M1, 'utf8')); } catch { BASE_M1 = null; }
assert(BASE_M1?.step === 'M1', 'T0 nagranie M1 (dwa ślady odwrotu AI) istnieje');
let BASE_CV3C = null;
try { BASE_CV3C = JSON.parse(readFileSync(FIXTURE_CV3C, 'utf8')); } catch { BASE_CV3C = null; }
assert(BASE_CV3C?.step === 'CV-3c', 'T0 nagranie CV-3c (dwa ślady z wrakiem AI) istnieje');
const oldRefOf = (name) => (M1_RETRACED.includes(name) ? BASE_M1?.traces?.[name] : BASE?.traces?.[name]);
for (const name of Object.keys(TRACES)) {
  const cv3c = CV3C_RETRACED.includes(name);
  const ref = cv3c ? BASE_CV3C?.traces?.[name] : oldRefOf(name);
  assert(ref != null && recorded[name] === ref, `T0 ślad ${name} === nagranie${cv3c ? ' (CV-3c)' : M1_RETRACED.includes(name) ? ' (M1)' : ''}`);
}
// ŚWIADEK przecelowania CV-3c: podstawienie starej współrzędnej x wiersza wraku (pole 4) daje co do bajtu stare nagranie, a różnica
// istnieje (ślad bez podstawienia ≠ stare nagranie) — zmienił się wyłącznie punkt wraku.
for (const name of CV3C_RETRACED) {
  let now = null, old = null;
  try { now = JSON.parse(recorded[name]); old = JSON.parse(oldRefOf(name)); } catch { now = old = null; }
  let wreckRows = 0, onlyX = !!(now && old) && now.samples?.length === old.samples?.length;
  if (onlyX) {
    const patched = { ...now, samples: now.samples.map((sample, i) => sample.map((row, j) => {
      const a = row.split('|'), b = String(old.samples[i]?.[j] ?? '').split('|');
      if (a[14] === 'true' && b[14] === 'true' && a[4] !== b[4]) { wreckRows++; a[4] = b[4]; }
      return a.join('|');
    })) };
    onlyX = JSON.stringify(patched) === oldRefOf(name);
  }
  assert(onlyX && wreckRows > 0 && recorded[name] !== oldRefOf(name),
    `T0 ŚWIADEK CV-3c ${name}: różnica wobec starego nagrania to wyłącznie x wraku (${wreckRows} wierszy), reszta co do bajtu`);
}
{
  const arrivals = (rec) => rec.events.filter((e) => e.name === 'interstellar:arrived').length;
  const ai = JSON.parse(recorded.ai_warp_in_encounter), aiLast = ai.samples.at(-1)[0].split('|');
  assert(ai.enc && ai.r && arrivals(ai) === 1 && aiLast[1] === 'B', `T0 KONTROLA: AI w starciu skacze i dolatuje (przyloty ${arrivals(ai)})`);
  const group = JSON.parse(recorded.ai_group_in_encounter);
  assert(group.enc && group.r.ok && group.r.composite === true && arrivals(group) === 2, `T0 KONTROLA: para AI z członkiem w starciu dolatuje (przyloty ${arrivals(group)})`);
  const recall = JSON.parse(recorded.ai_recall_in_encounter);
  assert(recall.enc && recall.r && arrivals(recall) === 1, `T0 KONTROLA: powrót AI ze starcia dolatuje (przyloty ${arrivals(recall)})`);
  const retreat = JSON.parse(recorded.ai_retreat_in_encounter);
  assert(retreat.enc && retreat.o && retreat.type !== null, `T0 KONTROLA: odwrót AI w starciu przyjęty (${retreat.type})`);
  // M1 — przegrana AI dostaje rozkaz odwrotu W TRAKCIE starcia (DSCS; tu bez `window.KOSMOS.autoRetreatSystem` — rozkaz wprost przez
  //   MOS: `vessel:orderIssued` typu moveToPoint dla R6), starcie się kończy. Uprząż woła rundy wprost (`_tickEncounter`, bez lotu na
  //   zegarze starcia), więc uciekający nie odlatuje i ginie — dawniej odwrót KOŃCZYŁ starcie, a rozkaz dawał `AutoRetreatSystem` po nim.
  const lost = JSON.parse(recorded.ai_lost_battle);
  const issued = lost.events.filter((e) => e.name === 'vessel:orderIssued' && e.ship === 'R6' && e.order === 'moveToPoint').length;
  assert(lost.ended && issued === 1, `T0 KONTROLA: przegrana AI dostaje rozkaz odwrotu w trakcie starcia, starcie się kończy (${issued})`);
  const wreck = JSON.parse(recorded.ai_wrecked_mid_flight);
  assert(wreck.r && wreck.midFlight === 'warp_transit' && wreck.ended && wreck.wreck, 'T0 KONTROLA: AI ginie w locie');
  assert(wreck.stamp === 'sys_home', `T0 Finding 609: wrak AI z lotu ma stempel sys_home, nie układ wylotu B (${wreck.stamp})`);
  const by = JSON.parse(recorded.player_bystander), byLast = by.samples.at(-1)[0].split('|');
  assert(by.enc && !by.member && by.r && byLast[1] === 'B', 'T0 KONTROLA: statek obok starcia skacze');
  const after = JSON.parse(recorded.player_after_battle), afterLast = after.samples.at(-1)[0].split('|');
  assert(after.ended && after.won && after.r && afterLast[1] === 'B', 'T0 KONTROLA: po wygranej statek skacze');
}

// ── T1 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T1 — statek w starciu: bramka i rozkaz');
{
  reseed('f607-t1');
  const W = world(), p = W.ship('Smok'), e = W.enemy('Rajder', 2 * AU + NEAR);
  assert(W.wrs.canOrder(p).ok === true, 'T1 KONTROLA: przed starciem bramka przepuszcza');
  const o = W.mos.issueOrder(p.id, { type: 'engage', targetEntityId: e.id });
  const enc = W.fight(p, e);
  assert(o?.ok === true && enc?.isActive === true && enc.vesselStates.has(p.id), 'T1 KONTROLA: rozkaz engage i aktywne starcie');
  const before = bits(p), snap = saved(W), evs = W.events.length, logs = W.logs.length, toasts = W.toasts.length;
  const gate = W.wrs.canOrder(p);
  assert(gate.ok === false && gate.reason === 'in_combat', `T1 canOrder: in_combat (${gate.reason})`);
  const r = W.os.issueWarp(p.id, 'B');
  assert(r?.ok === false && r?.reason === 'in_combat', `T1 issueWarp: odmowa in_combat (${r?.reason})`);
  const j = W.wrs.beginJourney(p.id, 'C');
  assert(j?.ok === false && j?.reason === 'in_combat', `T1 beginJourney: odmowa in_combat (${j?.reason})`);
  assert(bits(p) === before, 'T1 statek co do bitu');
  assert(saved(W) === snap, 'T1 zapis statków co do bitu');
  assert(p.warpFuel.current === 20, `T1 rdzenie bez zmian (${p.warpFuel.current})`);
  assert(W.events.length === evs && W.logs.length === logs && W.toasts.length === toasts, 'T1 zero zdarzeń, wpisów i toastów z silnika');
  assert(p.movementOrder?.type === 'engage' && p.movementOrder?.status === 'active', 'T1 rozkaz engage żywy');
  assert(W.dscs._findActiveEncounterContaining(p.id)?.id === enc.id, 'T1 starcie trwa');
}

// ── T2 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T2 — powierzchnie: menu, picker, podgląd, rozkaz, słownik');
{
  reseed('f607-t2');
  const W = world(), K = window.KOSMOS, p = W.ship('Smok'), q = W.ship('Wolny', 6 * AU), e = W.enemy('Rajder', 2 * AU + NEAR);
  W.fight(p, e); W.sel.vessel = p.id;
  const before = bits(p);
  assert(tIn('pl', 'vessel.reasonInCombat') === REASON_PL && tIn('en', 'vessel.reasonInCombat') === REASON_EN, 'T2 tekst powodu PL i EN');
  const text = refusalText('in_combat');
  assert(text === tIn('pl', 'vessel.reasonInCombat') || text === tIn('en', 'vessel.reasonInCombat'), `T2 słownik odmowy: powód walki, nie domyślny (${text})`);
  assert(warpErrLabel(null, { ok: false, reason: 'in_combat' }) === text, 'T2 etykieta starego panelu: ten sam tekst');
  const o = warpMenuOption({ vessel: p, targetSystemId: 'B', systems: K.galaxyData.systems, canOrder: canOrderOf(W), K });
  assert(o.available === false && o.reason === 'in_combat', `T2 warpMenuOption: niedostępny, in_combat (${o.reason})`);
  assert(o.hops === 1, 'T2 KONTROLA: trasa policzona, wpis niesie skoki');
  const entries = galaxyStarMenuEntries('B', K);
  assert(entries.length === 1 && entries[0].enabled === false && entries[0].disabledReason === text, `T2 menu gwiazdy: wpis wyłączony z powodem (${entries[0]?.disabledReason})`);
  const rows = sendPickerRows([p, q], 'B', canOrderOf(W), { K });
  const rp = rows.find((r) => r.vesselId === p.id), rq = rows.find((r) => r.vesselId === q.id);
  assert(rp?.ok === false && rp?.reason === 'in_combat' && rp?.reasonText === text, `T2 picker: wiersz przyciemniony z powodem (${rp?.reason})`);
  assert(rq?.ok === true, 'T2 KONTROLA: wiersz statku poza starciem aktywny');
  const model = sendPickerModel({ systemId: 'B', scroll: 0 }, K);
  const mp = (model.rows ?? []).find((r) => r.vesselId === p.id);
  assert(mp?.ok === false && mp?.reason === 'in_combat', `T2 model pickera: ta sama bramka (${mp?.reason})`);
  const hover = warpHoverModel('B', K);
  assert(hover?.available === false && hover?.reason === 'in_combat', `T2 podgląd najechania: niedostępny, in_combat (${hover?.reason})`);
  assert(hover?.legs?.length > 0 && hover.legs.every((l) => l.reachable === false), 'T2 podgląd: odcinki nieosiągalne');
  const run = runGalaxyWarpOrder({ vesselIds: [p.id], targetSystemId: 'B', K });
  assert(run.fails?.[0]?.reason === 'in_combat', `T2 rozkaz z menu: odmowa in_combat (${run.fails?.[0]?.reason})`);
  assert(String(run.text).includes(text), `T2 rozkaz z menu: toast niesie powód (${run.text})`);
  assert(bits(p) === before && p.warpFuel.current === 20, 'T2 po wszystkich powierzchniach statek co do bitu');
}

// ── T3 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T3 — dyspozytor wprost');
{
  reseed('f607-t3');
  const W = world(), p = W.ship('Smok'), e = W.enemy('Rajder', 2 * AU + NEAR);
  W.mos.issueOrder(p.id, { type: 'engage', targetEntityId: e.id });
  W.fight(p, e);
  const before = bits(p), snap = saved(W), evs = W.events.length, logs = W.logs.length;
  assert(W.vm.dispatchInterstellar(p.id, 'B') === false, 'T3 dispatchInterstellar: odmowa');
  assert(W.vm.dispatchInterstellar(p.id, 'B', { force: true }) === false, 'T3 force omija paliwo, nie walkę');
  assert(bits(p) === before && saved(W) === snap, 'T3 statek i zapis co do bitu');
  assert(W.events.length === evs && W.logs.length === logs, 'T3 rozkazu nie zamknął strażnik 603: zero zdarzeń i linii');
  assert(p.warpFuel.current === 20, 'T3 rdzenie bez zmian');
}

// ── T4 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T4 — flota z jednym członkiem w starciu');
{
  reseed('f607-t4');
  const W = world(), K = window.KOSMOS, a = W.ship('Alfa'), b = W.ship('Beta', 6 * AU), c = W.ship('Gamma', 7 * AU), e = W.enemy('Rajder', 2 * AU + NEAR);
  const fleet = W.fs.createFleet('Flota');
  for (const v of [a, b, c]) W.fs.addMember(fleet.id, v.id);
  W.sel.fleet = fleet.id;
  const ctl = W.os.previewFleetWarp(fleet.id, 'B');
  assert(ctl.ok === true, 'T4 KONTROLA: przed starciem plan floty przyjęty');
  const enc = W.fight(a, e);
  assert(enc?.vesselStates?.has(a.id) && !enc.vesselStates.has(b.id) && !enc.vesselStates.has(c.id), 'T4 KONTROLA: w starciu tylko Alfa');
  const before = [a, b, c].map(bits).join(), snap = saved(W), rec = JSON.stringify(fleet), evs = W.events.length;
  const plan = W.os.previewFleetWarp(fleet.id, 'B');
  assert(plan.ok === false && plan.reason === 'in_combat', `T4 faza 1: odmowa in_combat (${plan.reason})`);
  assert(plan.members?.length === 1 && plan.members[0].name === 'Alfa' && plan.members[0].reason === 'in_combat', 'T4 odmowa nazywa członka w starciu, tylko jego');
  const menu = fleetWarpMenuOption({ fleetId: fleet.id, targetSystemId: 'B', K });
  assert(menu.available === false && menu.reason === 'in_combat' && String(menu.reasonText).includes('Alfa') && !String(menu.reasonText).includes('Gamma'), `T4 menu floty: tekst nazywa Alfę (${menu.reasonText})`);
  const entries = galaxyStarMenuEntries('B', K);
  assert(entries[0]?.id === 'galaxy.fleetWarp' && entries[0]?.enabled === false && entries[0]?.disabledReason === menu.reasonText, 'T4 menu gwiazdy: wpis floty wyłączony z powodem');
  const row = sendPickerFleetRows('B', K).find((r) => r.fleetId === fleet.id);
  assert(row?.ok === false && row?.reason === 'in_combat' && row?.reasonText === menu.reasonText, 'T4 picker: wiersz floty przyciemniony z powodem');
  const iss = W.os.issueFleetWarp(fleet.id, 'B');
  assert(iss?.ok === false && iss?.reason === 'in_combat', `T4 issueFleetWarp: odmowa (${iss?.reason})`);
  const run = runGalaxyFleetWarpOrder({ fleetId: fleet.id, targetSystemId: 'B', K });
  assert(run.ok === false && String(run.text).includes('Alfa'), `T4 rozkaz z menu: nazywa członka (${run.text})`);
  assert(fleet.activeOrder === null || fleet.activeOrder === undefined, 'T4 flota bez rekordu rozkazu');
  assert(JSON.stringify(fleet) === rec, 'T4 rekord floty co do bitu');
  assert([a, b, c].map(bits).join() === before && saved(W) === snap, 'T4 członkowie i zapis co do bitu');
  assert(W.events.length === evs, 'T4 zero zdarzeń');
}
{
  // Flota w trakcie rozkazu: żywy `activeOrder` zostaje tym samym obiektem (reguła Findingu 275).
  reseed('f607-t4b');
  const W = world(), a = W.ship('Alfa'), b = W.ship('Beta', 6 * AU), e = W.enemy('Rajder', 2 * AU + NEAR);
  const fleet = W.fs.createFleet('Flota');
  for (const v of [a, b]) W.fs.addMember(fleet.id, v.id);
  const order = W.fs.issueFleetOrder(fleet.id, { type: 'moveToPoint', targetPoint: { x: 9 * AU, y: 0 } });
  const active = fleet.activeOrder;
  assert(order?.accepted?.length === 2 && active?.type === 'moveToPoint', 'T4b KONTROLA: flota ma żywy rozkaz ruchu');
  W.fight(a, e);
  const before = [a, b].map(bits).join(), rec = JSON.stringify(fleet);
  const iss = W.os.issueFleetWarp(fleet.id, 'B');
  assert(iss?.ok === false && (iss?.members ?? []).some((m) => m.name === 'Alfa' && m.reason === 'in_combat'), 'T4b odmowa nazywa Alfę z powodem walki');
  assert(fleet.activeOrder === active && JSON.stringify(fleet) === rec, 'T4b `fleet.activeOrder` nietknięty');
  assert([a, b].map(bits).join() === before, 'T4b członkowie co do bitu');
}

// ── T5 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T5 — koniec starcia');
{
  reseed('f607-t5');
  const W = world(), p = W.ship('Smok'), e = W.enemy('Rajder', 2 * AU + NEAR);
  e.combatDamage = WEAK();
  W.mos.issueOrder(p.id, { type: 'engage', targetEntityId: e.id });
  const enc = W.fight(p, e);
  assert(W.wrs.canOrder(p).reason === 'in_combat', 'T5 w starciu: in_combat');
  assert(W.rounds(enc) === true && !p.isWreck && e.isWreck === true, 'T5 KONTROLA: statek wygrywa');
  const gate = W.wrs.canOrder(p);
  assert(gate.ok === true, `T5 po starciu: bramka przepuszcza (${gate.reason ?? 'ok'})`);
  const r = W.os.issueWarp(p.id, 'B');
  assert(r?.ok === true, `T5 skok przyjęty (${r?.reason ?? 'ok'})`);
  assert(p.warpFuel.current < 20, 'T5 rdzenie zapłacone');
  assert(W.tickUntil(() => p.systemId === 'B') !== null && p.position.state === 'orbiting', `T5 dolatuje (${p.systemId} ${p.position.state})`);
  assert(p.movementOrder?.status !== 'active', 'T5 rozkaz nie zostaje żywy');
}
{
  reseed('f607-t5b');
  const W = world(), a = W.ship('Alfa'), b = W.ship('Beta', 6 * AU), e = W.enemy('Rajder', 2 * AU + NEAR);
  e.combatDamage = WEAK();
  const fleet = W.fs.createFleet('Flota');
  for (const v of [a, b]) W.fs.addMember(fleet.id, v.id);
  const enc = W.fight(a, e);
  assert(W.os.previewFleetWarp(fleet.id, 'B').reason === 'in_combat', 'T5b flota: odmowa w starciu');
  assert(W.rounds(enc) === true && !a.isWreck, 'T5b KONTROLA: Alfa wygrywa');
  const iss = W.os.issueFleetWarp(fleet.id, 'B');
  assert(iss?.ok === true, `T5b flota: skok przyjęty po starciu (${iss?.reason ?? 'ok'})`);
  assert(W.tickUntil(() => a.systemId === 'B' && b.systemId === 'B') !== null, 'T5b flota dolatuje');
}

// ── T6 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T6 — kontrole');
{
  reseed('f607-t6');
  const W = world(), p = W.ship('Smok'), q = W.ship('Obok', 6 * AU), e = W.enemy('Rajder', 2 * AU + NEAR);
  const enc = W.fight(p, e);
  assert(enc?.isActive === true && !enc.vesselStates.has(q.id), 'T6 KONTROLA: starcie trwa, Obok poza nim');
  assert(W.wrs.canOrder(q).ok === true, 'T6 statek obok starcia: bramka przepuszcza');
  assert(W.os.issueWarp(q.id, 'B')?.ok === true, 'T6 statek obok starcia skacze');
  assert(W.tickUntil(() => q.systemId === 'B') !== null, 'T6 statek obok starcia dolatuje');
}
{
  reseed('f607-t6b');
  const W = world(), p = W.ship('Smok'), e = W.enemy('Rajder', 2 * AU + NEAR);
  W.fight(p, e);
  window.KOSMOS.deepSpaceCombatSystem = null;
  assert(W.wrs.canOrder(p).ok === true, 'T6 bez systemu walki bramka przepuszcza');
}
{
  reseed('f607-t6c');
  const W = world(), p = W.ship('Smok'), e = W.enemy('Rajder', 2 * AU + NEAR);
  W.fight(p, e);
  p.unpaidYears = 5;
  assert(W.vm.isImmobilized(p) === true, 'T6 KONTROLA: statek unieruchomiony');
  assert(W.wrs.canOrder(p).reason === 'immobilized', `T6 unieruchomienie przed walką: to zostaje po walce (${W.wrs.canOrder(p).reason})`);
}
{
  reseed('f607-t6d');
  const W = world(), p = W.ship('Smok'), e = W.enemy('Rajder', 2 * AU + NEAR);
  W.fight(p, e);
  const o = W.mos.issueOrder(p.id, { type: 'retreat' });
  assert(o?.ok === true && p.position.state === 'in_transit', `T6 KONTROLA: odwrót w starciu = lot (${p.position.state})`);
  assert(W.wrs.canOrder(p).reason === 'in_combat', `T6 statek w odwrocie, starcie trwa: powód to walka, nie tranzyt (${W.wrs.canOrder(p).reason})`);
}

// ── T7 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T7 — AI bez bramki');
{
  reseed('f607-t7');
  const W = world(), p = W.ship('Smok'), e = W.enemy('Rajder', 2 * AU + NEAR);
  const enc = W.fight(p, e);
  assert(enc?.vesselStates?.has(e.id), 'T7 KONTROLA: AI w starciu');
  assert(W.wrs.canOrder(e).reason === 'not_player', 'T7 canOrder: AI jak dotąd not_player');
  assert(W.vm.dispatchInterstellar(e.id, 'B') === true, 'T7 dyspozytor przyjmuje AI w starciu');
  assert(e.mission?.type === 'interstellar_jump' && e.systemId === null, 'T7 AI w locie');
}

// ── T8 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T8 — trasy złożone');
{
  reseed('f607-t8');
  const W = world(), p = W.ship('Smok'), e = W.enemy('Rajder', 2 * AU + NEAR);
  window.KOSMOS.starSystemManager = { getSystem: (id) => ({ id }), hasBeacon: () => false };   // `issueMove` pyta o znany układ; tylko w tym scenariuszu
  W.fight(p, e);
  const before = bits(p), snap = saved(W);
  const r = W.os.issueMove(p.id, { type: 'moveToPoint', targetBodyId: 'cel_b', targetPoint: { x: 2 * AU, y: 0 } });
  assert(r?.ok === false && r?.reason === 'in_combat', `T8 issueMove do innego układu: odmowa in_combat (${r?.reason})`);
  assert(bits(p) === before && saved(W) === snap && !p.pendingOrder, 'T8 issueMove: statek co do bitu, bez dostawy w kolejce');
}
{
  reseed('f607-t8b');
  const W = world(), p = W.ship('Smok', 2 * AU, 'B'), e = W.enemy('Rajder', 2 * AU + NEAR, 'B');
  W.fight(p, e);
  const before = bits(p), snap = saved(W);
  const r = W.os.issueReturn(p.id);
  assert(r?.ok === false && r?.reason === 'in_combat', `T8 issueReturn z obcego układu: odmowa in_combat (${r?.reason})`);
  assert(bits(p) === before && saved(W) === snap, 'T8 issueReturn: statek co do bitu (ReturnJump)');
}

// ── T9 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T9 — zapis i wczytanie w trakcie starcia');
{
  reseed('f607-t9');
  const W = world(), p = W.ship('Smok'), e = W.enemy('Rajder', 2 * AU + NEAR);
  W.fight(p, e);
  const data = JSON.parse(JSON.stringify(W.dscs.serialize()));
  const fresh = new DeepSpaceCombatSystem(W.vm);
  window.KOSMOS.deepSpaceCombatSystem = fresh;
  assert(W.wrs.canOrder(p).ok === true, 'T9 KONTROLA: pusty system walki: bramka przepuszcza');
  fresh.restore(data);
  assert(W.wrs.canOrder(p).reason === 'in_combat', `T9 po wczytaniu: in_combat (${W.wrs.canOrder(p).reason})`);
}

// ── T10 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T10 — pin źródłowy');
{
  const source = (rel) => readFileSync(join(SRC, ...rel.split('/')), 'utf8').replace(/\r\n/g, '\n');
  const code = (rel) => source(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  const wrs = code('systems/WarpRouteSystem.js'), vm = code('systems/VesselManager.js'), logic = code('ui/GalaxyWarpLogic.js');
  const gateStart = wrs.indexOf('  canOrder(v) {'), gate = wrs.slice(gateStart, wrs.indexOf('\n  }\n', gateStart));
  const term = gate.indexOf('combatCheckOf(');
  assert(gateStart >= 0 && term > 0 && gate.includes("reason: 'in_combat'"), 'T10 canOrder: predykat `combatCheckOf`, powód in_combat');
  assert(term > gate.indexOf('isImmobilized') && term < gate.indexOf("st === 'in_transit'"), 'T10 canOrder: za unieruchomieniem, przed stanem');
  const dStart = vm.indexOf('  dispatchInterstellar(vesselId'), body = vm.slice(dStart, vm.indexOf('\n  }\n', dStart));
  const guard = body.indexOf('combatCheckOf('), spend = body.indexOf('consumeWarpFuel(vessel'), g603 = body.indexOf('tryCancelVesselOrder(');
  assert(dStart >= 0 && guard > 0, 'T10 dyspozytor: ten sam predykat');
  assert(guard >= 0 && guard < g603 && guard < spend, 'T10 dyspozytor: strażnik przed zamknięciem rozkazu (603) i przed zapłatą');
  assert(/!isEnemyVessel\(vessel\)\s*&&\s*combatCheckOf\(/.test(body), 'T10 dyspozytor: termin właściciela, ścieżka AI nietknięta');
  assert(!/force[^;\n]*combatCheckOf|combatCheckOf[^;\n]*force/.test(body), 'T10 dyspozytor: `force` nie omija walki');
  const dscsCalls = (txt) => (txt.match(/_findActiveEncounterContaining/g) ?? []).length;
  assert(dscsCalls(wrs) === 0 && dscsCalls(vm) === 0, 'T10 żadnego drugiego predykatu: bramki nie pytają systemu walki wprost');
  assert((logic.match(/in_combat/g) ?? []).length === 1 && /in_combat:\s*'vessel\.reasonInCombat'/.test(logic), 'T10 `GalaxyWarpLogic`: jeden wiersz słownika, bez gałęzi');
  for (const rel of ['systems/OrderService.js', 'systems/FleetSystem.js', 'ui/FleetManagerOverlay.js', 'ui/HudGalaxyLabelLayer.js', 'ui/HudGalaxySendPickerLayer.js']) {
    assert(!code(rel).includes('in_combat'), `T10 bez gałęzi in_combat: ${rel}`);
  }
}

// ── T11 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
section('T11 — pomocniki bramki');
// W grze `vessel:combatRangeEnter` odbiera `VesselCombatSystem` i oddaje do DSCS. Przekaźnik tylko tutaj: świat śladów T0 zostaje bez subskrybenta.
const relayCombat = (W) => EventBus.on('vessel:combatRangeEnter', ({ vesselAId, vesselBId, sameFaction }) => W.dscs.handleCombatRangeEnter(vesselAId, vesselBId, sameFaction));
{
  const FWD = await import('../../debug/FleetWarpDebug.js').catch(() => null);
  const h = FWD?.fleetWarpDebugHelpers?.() ?? {};
  reseed('f607-t11');
  const W = world(), a = W.ship('Smok');
  relayCombat(W);
  W.sel.vessel = a.id;
  const battle = h.probe603Battle?.(1);
  assert(battle?.ok === true && battle?.armed === true && typeof battle?.encounter === 'string', `T11 probe603Battle(1): starcie (${battle?.reason})`);
  const raider = W.vm.getAllVessels().find((v) => v.isEnemy);
  const enc = W.dscs._findActiveEncounterContaining(a.id);
  assert(enc?.vesselStates?.get(raider?.id)?.hp === 1, `T11 probe603Battle(1): rajder na 1 HP (${enc?.vesselStates?.get(raider?.id)?.hp})`);
  const read = h.probe603?.();
  assert(read?.canOrder?.reason === 'in_combat' && read?.encounter === battle?.encounter, `T11 probe603(): starcie i powód w odczycie (${read?.canOrder?.reason})`);
  const refused = h.probe603Warp?.(1);
  assert(refused?.ok === false && refused?.reason === 'in_combat' && refused?.unchanged === true, `T11 probe603Warp(1): odmowa, co do bitu (${refused?.reason})`);
  // ⚠ PRZECELOWANIE M1 (decyzja 33): rajder stoi 0,1 AU od fregaty z laserem (0,05 AU), a uprząż woła rundy wprost (`_tickEncounter`,
  //   bez zbliżenia). Dawniej „statek wygrywa” dawał TIME-OUT po 20 rundach: więcej HP wygrywało i żywy rajder z 1 HP szedł na wrak.
  //   Bez time-outu fregata musi go dosięgnąć — w grze robi to zbliżenie przed rundą; tu stawiamy ją w zasięgu.
  if (raider && a) { a.position.x = raider.position.x - 0.04 * AU; a.position.y = raider.position.y; }
  assert(W.rounds(enc) === true && !a.isWreck, 'T11 KONTROLA: statek wygrywa');
  W.sel.vessel = null;   // Esc na mapie zdejmuje zaznaczenie
  const sent = h.probe603Warp?.(1);
  assert(sent?.ok === true, `T11 probe603Warp(1) po wygranej: skok (${sent?.reason})`);
  // Bez argumentu: rajder w pełni sił, jak na bramce 603.
  reseed('f607-t11b');
  const W2 = world(), b = W2.ship('Smok');
  relayCombat(W2);
  W2.sel.vessel = b.id;
  h.probe603Battle?.();
  const full = W2.vm.getAllVessels().find((v) => v.isEnemy);
  assert(full && !full.combatDamage, 'T11 probe603Battle(): rajder bez uszkodzeń');
}
{
  const FWD = await import('../../debug/FleetWarpDebug.js').catch(() => null);
  const h = FWD?.fleetWarpDebugHelpers?.() ?? {};
  reseed('f607-t11c');
  const W = world();
  relayCombat(W);
  const rig = h.fleetWarpRig?.(1);
  assert(rig?.ok === true, `T11 KONTROLA: fleetWarpRig(1) (${rig?.reason})`);
  const fleet = W.fs.listFleets().find((f) => f.name === rig?.fleet);
  const battle = h.fleetWarpBattle?.(0);   // członek w doku; drugi stoi obok na orbicie: bez odsunięcia wszedłby do starcia
  const name = W.vm.getVessel(fleet?.memberIds?.[0])?.name;
  assert(battle?.ok === true && battle?.member === name && battle?.armed === true, `T11 fleetWarpBattle(0): starcie członka (${battle?.reason})`);
  assert(battle?.inEncounter?.length === 1 && battle.inEncounter[0] === name, `T11 fleetWarpBattle(0): w starciu tylko ten członek (${battle?.inEncounter})`);
  const iss = h.fleetWarpIssue?.(1);
  assert(iss?.ok === false && iss?.reason === 'in_combat' && iss?.unchanged === true, `T11 fleetWarpIssue(1): odmowa, co do bitu (${iss?.reason})`);
  assert(iss?.members?.length === 1 && String(iss.members[0]).startsWith(`${name}: `), `T11 fleetWarpIssue(1): nazywa członka (${iss?.members})`);
  assert(String(iss?.text).includes(name), `T11 fleetWarpIssue(1): tekst nazywa członka (${iss?.text})`);
  assert(h.fleetWarpBattle?.(9)?.ok === false, 'T11 fleetWarpBattle: nie ma takiego członka');
}

logOut(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
