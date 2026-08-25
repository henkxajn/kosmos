// RETREAT_TARGET (F-D + F-E) — keeper doboru celu ODWROTU. Plan: docs/design/RETREAT_TARGET_PLAN.md.
//
// PO CO: odwrót z bitwy i powrót do bazy dzieliły JEDNĄ funkcję doboru celu
// (`AutoRetreatSystem._findNearestFriendlyPlanet`), która filtruje po WŁAŚCICIELU i NIE MA
// terminu układu. Gwiazda każdego układu stoi w (0,0), więc ciała obcych układów leżą w tej
// samej przestrzeni px co własne ⇒ selektor wskazywał kolonię z innego układu, a rozkaz odpadał
// na bramce `target_other_system`. ZMIERZONE na żywo trzy razy (patrz nagłówek
// `retreat_preempt_smoke.mjs`): odwrót nie działał dla NIKOGO, gracza włącznie.
//
// ⚠ TEN KEEPER PINUJE SEMANTYKĘ, KTÓREJ NIE DA SIĘ ZOBACZYĆ W PRZEGLĄDARCE W ROZSĄDNYM CZASIE.
//   Pomiar 2 z planu (§3) pokazał WYKONANIEM, że przy 1 d/s — czyli przy prędkości, na którą
//   auto-slow sam schodzi w chwili starcia — statek potrzebuje ~130 s realnych na pokonanie
//   0,5 AU, a cała bitwa DSCS żyje ~2,2 s. Odwrót jest z natury POST-BATTLE i jego skutek
//   widać dopiero po minutach. Kolaboratorzy `AutoRetreatSystem` są WSTRZYKIWANI do
//   konstruktora, więc atrapa świata daje ten sam pomiar w milisekundach.
//
// ⚠ TRZY PINY SĄ ŚWIADOMIE ODWRÓCONE względem stanu sprzed slice'u (wzór `deploy_seams`,
//   `ai_capture_last_stand`):
//     T6  — dawniej brak celu ⇒ `_turnIntoWreck`. Teraz statek MUSI PRZEŻYĆ (D-FDe).
//           ⚠ Ta gałąź zabijała TAKŻE flotę GRACZA: `DeepSpaceCombatSystem:1236` woła
//           `_issueRetreatOrder` WPROST, omijając bramkę `AutoRetreatSystem:56`.
//     T9  — dawniej `vessel_immobilized` blokował odwrót (zmierzone na żywo: zablokowało
//           pomiar gate'u B). Teraz odwrót przechodzi (D-FDk): prawo do przeżycia nie jest
//           nagrodą za zaległości w utrzymaniu.
//     T11 — dawniej `DSCS._allOutsideOf` pomijał KAŻDY statek z `dockedAt != null`. Teraz
//           uciekinier z markerem jest liczony (D-FDd), inaczej udany odwrót kończył się
//           side-level wrakiem żywych przegranych po MAX_ROUNDS.
//
// ⚠ KAŻDY PIN MA KONTROLĘ PINU. Bez niej test przechodzi także wtedy, gdy nic nie mierzy —
//   ten arc złapał już jedną jałową kontrolę we własnej sondzie (patrz plan §3, pomiar 2b).
//
// Uruchom: node src/testing/smoke/retreat_target_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { AutoRetreatSystem }   from '../../systems/AutoRetreatSystem.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { ORDER_TYPES }         from '../../data/MovementOrderTypes.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU = 110;
const CLEARANCE = GAME_CONFIG.COMBAT_DISENGAGE_AU;   // 0.50

// ── Ładowanie modułu pod testem (fail-first: przed implementacją go NIE MA) ──────────────
let RT = null, RT_ERR = null;
try {
  RT = await import('../../utils/RetreatTarget.js');
} catch (e) {
  RT_ERR = e?.message ?? String(e);
}

// ── Świat ───────────────────────────────────────────────────────────────────────────────

function resetWorld() {
  EventBus.clear();
  EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 0 }, activeSystemId: 'sys_home' };
}

/** Atrapa ColonyManager — JEDYNY nośnik informacji „czyje jest to ciało i czy ma port". */
function colonies(list) {
  const mgr = {
    activePlanetId: 'p_home',
    getAllColonies: () => list,
    getColony: (id) => list.find(c => c.planetId === id) ?? null,
  };
  window.KOSMOS.colonyManager = mgr;   // hasSpaceportAt czyta stąd
  return mgr;
}

const colony = (planetId, { owner = undefined, port = false, outpost = false } = {}) => ({
  planetId, name: 'K-' + planetId, isOutpost: outpost,
  ownerEmpireId: owner,
  buildingSystem: { hasSpaceport: () => port },
});

const body = (id, xAU, { type = 'planet', sys = 'sys_home', yAU = 0 } = {}) => {
  EntityManager.add({ id, type, name: id, systemId: sys, x: xAU * AU, y: yAU * AU, explored: true });
  return EntityManager.get(id);
};

function vessel(vm, { x = 5, y = 0, owner = undefined, sys = 'sys_home' } = {}) {
  const v = vm.createAndRegister('hull_frigate', 'p_home', { modules: [] });
  v.systemId = sys;
  v.ownerEmpireId = owner;
  v.position.x = x * AU; v.position.y = y * AU;
  v.position.state = 'orbiting'; v.position.dockedAt = null;
  v.status = 'idle'; v.mission = null;
  if (v.fuel) v.fuel.current = v.fuel.max;
  return v;
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T0 — moduł pod testem istnieje');
assert(RT !== null,
  `src/utils/RetreatTarget.js importuje się${RT_ERR ? ' — DZIŚ: ' + RT_ERR : ''}`);
if (RT) {
  for (const fn of ['bodiesInSystemOf', 'nearestShelter', 'nearestOwnColonyBodyInSystem', 'escapeVector']) {
    assert(typeof RT[fn] === 'function', `eksportuje \`${fn}\``);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T1 — TERMIN UKŁADU (rdzeń F-D): selektor nie wychodzi poza układ statku');
{
  resetWorld();
  // ⚠ Gwiazda KAŻDEGO układu stoi w (0,0), więc ciało z `sys_061` leży w tej samej przestrzeni
  //   px co własne — to jest MECHANIZM F-D, nie skrót fixture'u.
  body('p_home', 5);
  body('p_local', 8);                                  // jedyne ciało w układzie statku
  body('p_far', 5.4, { sys: 'sys_061' });              // BLIŻSZE w px, ale INNY układ
  const vm = new VesselManager();
  const col = colonies([colony('p_far', { owner: 'emp_001' }), colony('p_home')]);
  const v = vessel(vm, { x: 5, owner: 'emp_001' });

  const got = RT?.nearestShelter?.(v, { colonyManager: col });
  assert(!!got && got.body?.systemId === 'sys_home',
    `wybrane ciało jest w układzie statku (got=${got?.body?.id ?? 'null'}, sys=${got?.body?.systemId ?? '—'})`);
  assert(got?.body?.id !== 'p_far',
    'ciało z `sys_061` NIE zostało wybrane, mimo że w px jest bliżej (0.4 AU vs 3.0 AU)');

  // KONTROLA PINU — czy fixture w ogóle reprodukuje F-D? Stara funkcja MUSI się nabrać.
  const ars = new AutoRetreatSystem(vm, col, new MovementOrderSystem(vm));
  const old = ars._findNearestFriendlyPlanet(v);
  assert(old?.planet?.id === 'p_far',
    `KONTROLA PINU: stara funkcja WSKAZUJE ciało z obcego układu (got=${old?.planet?.id ?? 'null'}) ` +
    '— gdyby wskazała lokalne, T1 nie mierzyłby niczego');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T2 — DRABINA TIERÓW (D-FDb + D-FDg): własne+port > własne > niczyje > obce');
{
  // ⚠ ŻADNEGO ciała w punkcie startu statku — każde ciało w układzie jest KANDYDATEM,
  //   więc „pomocnicza" planeta pod statkiem wygrywałaby ranking jako niczyja w odległości 0.
  const build = (which) => {
    resetWorld();
    body('b_foreign', 6.0);       // NAJBLIŻSZE — kolonia obcego imperium
    body('b_neutral', 7.0);       // niczyje
    body('b_own', 8.0);           // własne, bez portu
    body('b_own_port', 9.0);      // NAJDALSZE — własne z portem
    const list = [
      colony('b_foreign', { owner: 'emp_002' }),
      colony('b_own',      { port: false }),
      colony('b_own_port', { port: true }),
    ].filter(c => which.includes(c.planetId));
    return { col: colonies(list), vm: new VesselManager() };
  };
  const pick = (which, drop = []) => {
    const { col, vm } = build(which);
    for (const id of drop) EntityManager.remove(id);
    const v = vessel(vm, { x: 5 });            // gracz (ownerEmpireId undefined)
    return RT?.nearestShelter?.(v, { colonyManager: col });
  };

  const all = ['b_foreign', 'b_own', 'b_own_port'];
  const r0 = pick(all);
  assert(r0?.body?.id === 'b_own_port' && r0?.tier === 0,
    `tier 0 (własne Z PORTEM) wygrywa mimo że jest NAJDALSZE (got=${r0?.body?.id}, tier=${r0?.tier})`);

  const r1 = pick(all, ['b_own_port']);
  assert(r1?.body?.id === 'b_own' && r1?.tier === 1,
    `tier 1 (własne bez portu) przed niczyim (got=${r1?.body?.id}, tier=${r1?.tier})`);

  const r2 = pick(all, ['b_own_port', 'b_own']);
  assert(r2?.body?.id === 'b_neutral' && r2?.tier === 2,
    `tier 2 (niczyje) przed obcym (got=${r2?.body?.id}, tier=${r2?.tier})`);

  const r3 = pick(all, ['b_own_port', 'b_own', 'b_neutral']);
  assert(r3?.body?.id === 'b_foreign' && r3?.tier === 3 && r3?.foreignAnchor === true,
    `tier 3 (obce) dopiero gdy nie ma nic innego (got=${r3?.body?.id}, tier=${r3?.tier}) ` +
    '— Z1: uciekinier nad cudzą kolonią blokuje pulę i zasila następną falę');

  // KONTROLA PINU — czysta odległość wskazałaby b_foreign ZAWSZE. Jeśli tier nie działa,
  // r0 też byłby b_foreign i wszystkie cztery asercje mierzyłyby to samo.
  assert(r0?.body?.id !== r3?.body?.id,
    'KONTROLA PINU: pełny zbiór i zbiór okrojony dają RÓŻNE ciała — drabina naprawdę porządkuje');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T3 — CLEARANCE (D-FDc): ciała w promieniu starcia odpadają');
{
  resetWorld();
  body('b_close', 5.2);          // 0.2 AU od midpointu — W bąblu
  body('b_far', 5.7);            // 0.7 AU — poza bąblem
  const col = colonies([]);
  const vm = new VesselManager();
  const v = vessel(vm, { x: 5 });
  const mid = { x: 5 * AU, y: 0 };

  const withBubble = RT?.nearestShelter?.(v, { colonyManager: col, avoidPoint: mid, clearanceAU: CLEARANCE });
  assert(withBubble?.body?.id === 'b_far',
    `z bąblem wybrane ciało POZA promieniem starcia (got=${withBubble?.body?.id})`);

  // KONTROLA PINU — bez `avoidPoint` bąbel nie działa i wygrywa bliższe ciało.
  const noBubble = RT?.nearestShelter?.(v, { colonyManager: col });
  assert(noBubble?.body?.id === 'b_close',
    `KONTROLA PINU: bez avoidPoint wygrywa b_close (got=${noBubble?.body?.id}) — bąbel jest PRZYCZYNĄ różnicy`);
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T4 — STREFA SŁOŃCA: ciało pod progiem nie jest kandydatem (byłby `unreachable_target`)');
{
  resetWorld();
  body('b_sun', 0.2);            // 0.2 AU od gwiazdy — MOS odrzuci `unreachable_target`
  body('b_ok', 6.0);
  const col = colonies([]);
  const vm = new VesselManager();
  const v = vessel(vm, { x: 0.25 });      // statek TUŻ przy gwieździe: b_sun jest najbliższe
  const got = RT?.nearestShelter?.(v, { colonyManager: col });
  assert(got?.body?.id === 'b_ok',
    `ciało w strefie wykluczenia pominięte (got=${got?.body?.id}) — inaczej rozkaz padłby na unreachable_target`);
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T5 — SZCZEBEL 2 (D-FDe): brak ciała ⇒ wektor ucieczki, NIE null-do-wraku');
{
  // ⚠ UKŁAD ZDEGENEROWANY CELOWO. Pomiar 1 (plan §3) pokazał, że w PRAWDZIWYM układzie
  //   (38-57 ciał) bąbel NIE OPRÓŻNIA zbioru ANI RAZU na 7200 próbek ⇒ ten szczebel jest
  //   nieosiągalny na realnych danych i bez sztucznego świata keeper mierzyłby CISZĘ.
  resetWorld();
  body('p_only', 5.1);           // jedyne ciało — W bąblu
  const col = colonies([]);
  const vm = new VesselManager();
  const v = vessel(vm, { x: 5 });
  const mid = { x: 5 * AU, y: 0 };

  const got = RT?.nearestShelter?.(v, { colonyManager: col, avoidPoint: mid, clearanceAU: CLEARANCE });
  assert(got === null, `zbiór pusty ⇒ selektor zwraca null (got=${got?.body?.id ?? 'null'})`);

  const vec = RT?.escapeVector?.(v, mid, CLEARANCE);
  const dMid = vec ? Math.hypot(vec.x - mid.x, vec.y - mid.y) / AU : -1;
  const dSun = vec ? Math.hypot(vec.x, vec.y) / AU : -1;
  assert(vec != null && dMid >= CLEARANCE - 1e-9,
    `wektor ucieczki leży POZA promieniem starcia (${dMid.toFixed(2)} AU ≥ ${CLEARANCE})`);
  assert(dSun >= 0.3 - 1e-9,
    `wektor ucieczki leży POZA strefą Słońca (${dSun.toFixed(2)} AU) — inaczej MOS odrzuci unreachable_target`);
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T6a — ⚠ PIN ODWRÓCONY (D-FDe): brak CIAŁA ⇒ szczebel 2, statek ŻYJE i dostaje rozkaz');
{
  resetWorld();
  body('p_lonely', 5.05);        // jedyne ciało, w bąblu ⇒ szczebel 1 pusty
  const col = colonies([]);      // ZERO kolonii — dziś to była prosta droga do `_turnIntoWreck`
  const vm = new VesselManager();
  const mos = new MovementOrderSystem(vm);
  window.KOSMOS.vesselManager = vm;
  window.KOSMOS.movementOrderSystem = mos;
  window.KOSMOS.autoRetreatSystem = new AutoRetreatSystem(vm, col, mos);

  const v = vessel(vm, { x: 5, owner: 'emp_001' });
  const issued = [], failed = [];
  EventBus.on('vessel:autoRetreatIssued', (e) => issued.push(e));
  EventBus.on('vessel:autoRetreatFailed', (e) => failed.push(e));

  EventBus.emit('battle:resolved', {
    battleId: 'btl_t6a',
    result: {
      retreated: 'A', winner: 'B',
      participantA: { type: 'vessel_group', empireId: 'emp_001', vesselIds: [v.id] },
      participantB: { type: 'vessel_group', empireId: 'player',  vesselIds: [] },
      location: { systemId: 'sys_home', planetId: null, point: { x: 5 * AU, y: 0 } },
    },
  });

  assert(v.isWreck !== true && v.status !== 'destroyed',
    `statek PRZEŻYŁ brak ciała-schronienia (isWreck=${v.isWreck}, status=${v.status}). ⚠ PRZED SLICE'EM ` +
    'ta asercja PADAŁABY — `AutoRetreatSystem:71-93` robił `_turnIntoWreck`, także dla floty GRACZA ' +
    'przez DSCS:1236');
  assert(issued.length === 1 && failed.length === 0,
    `zadziałał SZCZEBEL 2 — rozkaz wydany, zero odmów (issued=${issued.length}, failed=${failed.length})`);
  assert(issued[0]?.destinationPlanetId == null,
    `szczebel 2 celuje w PUSTY PUNKT, nie w ciało (destinationPlanetId=${issued[0]?.destinationPlanetId})`);
  // KONTROLA PINU — szczebel 1 naprawdę był pusty, inaczej T6a mierzyłby zwykłą ścieżkę.
  assert(RT?.nearestShelter?.(v, { colonyManager: col, avoidPoint: { x: 5 * AU, y: 0 } }) === null,
    'KONTROLA PINU: szczebel 1 (ciało poza bąblem) NIE istniał w tym świecie');
}

header('T6b — ⚠ PIN ODWRÓCONY (D-FDe): rozkaz ODRZUCONY NIŻEJ ⇒ odmowa z powodem, nadal bez wraku');
{
  resetWorld();
  body('b_shelter', 8);
  const col = colonies([]);
  const vm = new VesselManager();
  const mos = new MovementOrderSystem(vm);
  // Test double WYŁĄCZNIE na dyspozycji — dobór celu zostaje PRAWDZIWY. Modeluje odrzucenie
  // poniżej rozgałęzienia typów (np. `unreachable_target`), którego nie da się wywołać geometrią.
  mos.issueOrder = () => ({ ok: false, reason: 'unreachable_target' });
  window.KOSMOS.vesselManager = vm;
  window.KOSMOS.movementOrderSystem = mos;
  window.KOSMOS.autoRetreatSystem = new AutoRetreatSystem(vm, col, mos);

  const v = vessel(vm, { x: 5, owner: 'emp_001' });
  const failed = [];
  EventBus.on('vessel:autoRetreatFailed', (e) => failed.push(e));

  EventBus.emit('battle:resolved', {
    battleId: 'btl_t6b',
    result: {
      retreated: 'A', winner: 'B',
      participantA: { type: 'vessel_group', empireId: 'emp_001', vesselIds: [v.id] },
      participantB: { type: 'vessel_group', empireId: 'player',  vesselIds: [] },
      location: { systemId: 'sys_home', planetId: null, point: { x: 5 * AU, y: 0 } },
    },
  });

  assert(v.isWreck !== true && v.status !== 'destroyed',
    `odrzucony rozkaz NIE zabija statku (isWreck=${v.isWreck}, status=${v.status})`);
  assert(failed.length === 1 && failed[0]?.reason === 'unreachable_target',
    `odmowa niesie PRAWDZIWY powód z dołu (got=${failed[0]?.reason ?? 'brak zdarzenia'}) ` +
    '— nie generyczne „order_rejected"');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T7 — D-FDf: odwrót kończy się ORBITĄ ciała, a `colonyId` zostaje NIETKNIĘTY');
{
  resetWorld();
  body('p_home', 5);
  body('b_shelter', 8);
  const col = colonies([colony('p_home')]);
  const vm = new VesselManager();
  const mos = new MovementOrderSystem(vm);
  window.KOSMOS.vesselManager = vm;
  window.KOSMOS.movementOrderSystem = mos;
  const ars = new AutoRetreatSystem(vm, col, mos);
  window.KOSMOS.autoRetreatSystem = ars;

  const v = vessel(vm, { x: 5, owner: 'emp_001' });
  const colonyIdBefore = v.colonyId;
  const issued = [];
  EventBus.on('vessel:autoRetreatIssued', (e) => issued.push(e));

  EventBus.emit('battle:resolved', {
    battleId: 'btl_t7',
    result: {
      retreated: 'A', winner: 'B',
      participantA: { type: 'vessel_group', empireId: 'emp_001', vesselIds: [v.id] },
      participantB: { type: 'vessel_group', empireId: 'player',  vesselIds: [] },
      location: { systemId: 'sys_home', planetId: null, point: { x: 5 * AU, y: 0 } },
    },
  });

  assert(issued.length === 1, `odwrót WYDANY (zdarzeń: ${issued.length})`);
  assert(v.mission?.targetId === 'b_shelter',
    `rozkaz celuje JAWNIE w ciało (mission.targetId=${v.mission?.targetId}) — D-FDi`);
  assert(v._pendingReturnDock == null,
    `marker _pendingReturnDock NIE postawiony (got=${v._pendingReturnDock ?? 'brak'}) ` +
    '— to on przepisuje `colonyId` w FleetSystem:653');

  // Dolot — wymuszony dużymi krokami czasu (izoluje mechanizm, nie tempo).
  for (let i = 0; i < 2000; i++) {
    window.KOSMOS.timeSystem.gameTime += 0.02;
    EventBus.emit('time:tick', {
      deltaYears: 0.02, civDeltaYears: 0.02 * GAME_CONFIG.CIV_TIME_SCALE,
      gameTime: window.KOSMOS.timeSystem.gameTime, multiplier: 1,
    });
    if (v.position.dockedAt != null) break;
  }
  assert(v.position.dockedAt === 'b_shelter' && v.position.state === 'orbiting',
    `PO PRZYLOCIE orbituje ciało (dockedAt=${v.position.dockedAt}, state=${v.position.state})`);
  assert(v.colonyId === colonyIdBefore,
    `\`colonyId\` NIETKNIĘTY (${colonyIdBefore} → ${v.colonyId}) — ucieczka nie przepisuje BAZY`);
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T8 — F-E (D-FDh): dryf trzyma WŁASNOŚĆ, ale dostaje TERMIN UKŁADU');
{
  resetWorld();
  body('p_own_local', 9);                              // własna kolonia, TEN układ
  body('p_own_far', 5.3, { sys: 'sys_061' });          // własna kolonia, INNY układ (bliżej w px)
  body('b_neutral', 5.5);                              // niczyje, TEN układ, najbliżej
  const col = colonies([colony('p_own_local'), colony('p_own_far')]);
  const vm = new VesselManager();
  const v = vessel(vm, { x: 5 });

  const got = RT?.nearestOwnColonyBodyInSystem?.(v, col);
  assert(got?.planet?.id === 'p_own_local',
    `dryf wraca do WŁASNEJ koloni w TYM układzie (got=${got?.planet?.id ?? 'null'})`);
  assert(got?.planet?.id !== 'b_neutral',
    'dryf NIE bierze ciała niczyjego — to jest „wróć do siebie", nie „schowaj się gdziekolwiek"');
  assert(got?.planet?.id !== 'p_own_far',
    'dryf NIE wychodzi poza układ, mimo że w px własna kolonia z sys_061 jest bliżej');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T9 — ⚠ PIN ODWRÓCONY (D-FDk): odwrót przechodzi mimo `vessel_immobilized`');
{
  resetWorld();
  body('p_mid', 5);
  body('b_shelter', 8);
  const col = colonies([]);
  const vm = new VesselManager();
  const mos = new MovementOrderSystem(vm);
  window.KOSMOS.vesselManager = vm;
  window.KOSMOS.movementOrderSystem = mos;
  const ars = new AutoRetreatSystem(vm, col, mos);
  window.KOSMOS.autoRetreatSystem = ars;
  // Statek w aktywnym starciu — `_issueRetreat` bramkuje na `not_in_combat`.
  const dscs = new DeepSpaceCombatSystem(vm);
  window.KOSMOS.deepSpaceCombatSystem = dscs;

  const v = vessel(vm, { x: 5 });
  v.unpaidYears = 5;                                   // ≥ UPKEEP_GRACE_YEARS (2)
  assert(vm.isImmobilized(v) === true, 'KONTROLA PINU: statek NAPRAWDĘ jest unieruchomiony');

  // KONTROLA PINU — zwykły rozkaz ruchu MUSI dalej odpadać, inaczej D-FDk nic nie zmienia.
  const move = mos.issueOrder(v.id, {
    type: ORDER_TYPES.moveToPoint, targetPoint: { x: 8 * AU, y: 0 },
    bypassSpaceportCheck: true, bypassFuelCheck: true,
  });
  assert(move?.ok === false && move?.reason === 'vessel_immobilized',
    `KONTROLA PINU: moveToPoint dalej BLOKOWANY (${move?.reason}) — bramka żyje`);

  dscs._activeEncounters.set('enc_t9', {
    id: 'enc_t9', isActive: true, currentRound: 1,
    location: { systemId: 'sys_home', planetId: null, point: { x: 5 * AU, y: 0 } },
    sideA: { vesselIds: [v.id], joinedVesselIds: [], ownerEmpireId: 'player' },
    sideB: { vesselIds: [], joinedVesselIds: [], ownerEmpireId: 'emp_001' },
    vesselStates: new Map([[v.id, { hp: 10, hpStart: 100 }]]),
  });

  const ret = mos.issueOrder(v.id, { type: ORDER_TYPES.retreat });
  assert(ret?.reason !== 'vessel_immobilized',
    `odwrót NIE odpada na zaległościach (reason=${ret?.reason ?? 'brak — OK'}). ⚠ PRZED SLICE'EM ` +
    'ta asercja PADAŁABY: `MOS:201-202` blokował KAŻDY rozkaz, w tym ucieczkę z bitwy');
  assert(ret?.ok === true, `odwrót WYDANY (ok=${ret?.ok}, reason=${ret?.reason ?? '—'})`);
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T10 — D-FDk: rezerwa też nie odbiera prawa do ucieczki');
{
  resetWorld();
  body('p_mid', 5);
  body('b_shelter', 8);
  const col = colonies([]);
  const vm = new VesselManager();
  const mos = new MovementOrderSystem(vm);
  window.KOSMOS.vesselManager = vm;
  window.KOSMOS.movementOrderSystem = mos;
  window.KOSMOS.autoRetreatSystem = new AutoRetreatSystem(vm, col, mos);
  const dscs = new DeepSpaceCombatSystem(vm);
  window.KOSMOS.deepSpaceCombatSystem = dscs;

  const v = vessel(vm, { x: 5 });
  v.serviceState = 'stored';                           // magazyn (W2)

  const move = mos.issueOrder(v.id, {
    type: ORDER_TYPES.moveToPoint, targetPoint: { x: 8 * AU, y: 0 },
    bypassSpaceportCheck: true, bypassFuelCheck: true,
  });
  assert(move?.reason === 'vessel_in_reserve',
    `KONTROLA PINU: moveToPoint dalej odpada na rezerwie (${move?.reason})`);

  dscs._activeEncounters.set('enc_t10', {
    id: 'enc_t10', isActive: true, currentRound: 1,
    location: { systemId: 'sys_home', planetId: null, point: { x: 5 * AU, y: 0 } },
    sideA: { vesselIds: [v.id], joinedVesselIds: [], ownerEmpireId: 'player' },
    sideB: { vesselIds: [], joinedVesselIds: [], ownerEmpireId: 'emp_001' },
    vesselStates: new Map([[v.id, { hp: 10, hpStart: 100 }]]),
  });
  const ret = mos.issueOrder(v.id, { type: ORDER_TYPES.retreat });
  assert(ret?.reason !== 'vessel_in_reserve',
    `odwrót NIE odpada na rezerwie (reason=${ret?.reason ?? 'brak — OK'})`);
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T11 — ⚠ PIN ODWRÓCONY (D-FDd): DSCS liczy zadokowanego UCIEKINIERA jako wycofanego');
{
  resetWorld();
  const vm = new VesselManager();
  const dscs = new DeepSpaceCombatSystem(vm);
  const mid = { x: 0, y: 0 };

  const mk = (x, marker) => {
    const v = vessel(vm, { x });
    v.position.state = 'orbiting';
    v.position.dockedAt = 'b_somewhere';               // ZADOKOWANY — dziś to znaczy „nie ucieka"
    if (marker) v.movementOrder = { status: 'active', _retreatFromCombat: true, retreatFromBattleId: 'btl_x' };
    return v;
  };

  const runner  = mk(3.0, true);                       // 3 AU od midpointu, z markerem odwrotu
  const defender = mk(3.0, false);                     // ten sam dystans, BEZ markera

  const encOf = (v) => ({
    id: 'e', isActive: true,
    location: { systemId: 'sys_home', planetId: null, point: mid },
    vesselStates: new Map([[v.id, { hp: 50, hpStart: 100 }]]),
  });

  assert(dscs._allOutsideOf(encOf(runner), [runner.id], mid) === true,
    'uciekinier z markerem, zadokowany 3 AU od starcia, LICZY SIĘ jako wycofany. ⚠ PRZED SLICE\'EM ' +
    'ta asercja PADAŁABY (`_allOutsideOf:889-890` pomijał każdy `dockedAt != null` ⇒ aliveCount=0 ⇒ ' +
    'bitwa dojeżdżała do MAX_ROUNDS i robiła side-level wrak ŻYWYCH przegranych)');

  assert(dscs._allOutsideOf(encOf(defender), [defender.id], mid) === false,
    'KONTROLA PINU: obrońca BEZ markera, na tej samej odległości, dalej NIE jest uciekinierem ' +
    '— guard z 2026-05-21 (statek w bazie ≠ ucieczka) zostaje nienaruszony');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T12 — D-FDj: powód odmowy ma klucze i18n w OBU językach');
{
  const pl = (await import('../../i18n/pl.js')).default ?? (await import('../../i18n/pl.js')).pl;
  const en = (await import('../../i18n/en.js')).default ?? (await import('../../i18n/en.js')).en;
  const need = ['vessel.reasonNoShelterInSystem', 'vessel.reasonNoFriendlyPlanet', 'vessel.reasonNotInCombat'];
  for (const k of need) {
    assert(typeof pl?.[k] === 'string' && typeof en?.[k] === 'string',
      `klucz \`${k}\` istnieje w PL i EN (pl=${typeof pl?.[k]}, en=${typeof en?.[k]})`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n════ retreat_target_smoke: ${pass} PASS / ${fail} FAIL ════`);
process.exit(fail > 0 ? 1 : 0);
