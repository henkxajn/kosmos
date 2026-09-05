// KEEPER — Finding 145 (b): `startReturn` NIE odmawia z powodu NaN-a.
//
// CO PINUJE (i dlaczego akurat to)
// `startReturn` predykuje pozycję domu na `m.returnYear`. Misje budowane przez sam
// `VesselManager` (`exploration`, `interstellar_jump`) NIE MAJĄ tego pola w literale, więc
// `_predictPosition(colonyId, undefined)` → `dt = NaN` → `{x:NaN, y:NaN}`; `?? m.startX` NIE
// łapie NaN-a; `_calcRoute` → `returnDistAU = NaN`; a bramka pyta `canReach(v, NaN)`, czyli
// `27 >= NaN`, co jest FAŁSZEM w IEEE-754. Silnik meldował „brak paliwa" i stemplował status
// „⛽ Utknął" statkowi z 27 AU zasięgu przy 0,4 AU do domu.
// ⚠ NIC nie liczyło „za mało paliwa" — zasięg nie był w ogóle konsultowany.
//
// ⚠ SPRZĘŻENIE Z (c): `m.returnYear` musi ZOSTAĆ zapisane skończoną wartością, bo czyta je
//   i interpolacja powrotu (`_updatePositions`), i closer sieroty (`m.returnYear ?? Infinity`).
//   Wyprowadzenie roku bez zapisu zostawiłoby `Infinity` i closer z (c) NIGDY by nie strzelił
//   dokładnie na tych misjach, które (b) odblokowuje. Pinuje to T6.
// ⚠ Zapis MUSI stać PO bramce paliwa — inwariant „odmowa nie zostawia półstanu" (T5).
//
// T1  PIN   — exploration bez `returnYear`, 27 AU zasięgu, 0,4 AU do domu → powrót RUSZA
// T1c KONTROLA — ten sam fixture Z `returnYear` → też rusza (jedyną różnicą jest brakujące pole)
// T2  PIN   — tranzyt warp (`interstellar_jump`, brak `returnYear`) → nie odmawia
// T3  KONTROLA ANTY-JAŁOWA — naprawdę pusty bak → DALEJ odmowa + `vessel:returnBlocked`
// T4  KONTROLA — statek AI (`isEnemyVessel`) dalej omija bramkę paliwa
// T5  KONTROLA — odmowa NIE zostawia półstanu (misja nietknięta)
// T6  PIN   — po udanym powrocie `m.returnYear` jest SKOŃCZONE (sprzężenie z closerem (c))
// T7  PIN ŹRÓDŁOWY — żaden z dwóch predykcyjnych site'ów nie polega na `??` łapiącym NaN
//
// Uruchom: node src/testing/smoke/start_return_nan_guard_smoke.mjs

import { readFileSync } from 'node:fs';

globalThis.window = globalThis;
globalThis.document = {
  querySelector: () => null, getElementById: () => null,
  createElement: () => ({ style: {}, getContext: () => null, appendChild() {}, addEventListener() {}, setAttribute() {} }),
  body: { appendChild() {}, removeChild() {} }, addEventListener() {},
};
globalThis.localStorage = {
  _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; }, key(i) { return Object.keys(this._s)[i] ?? null; },
  get length() { return Object.keys(this._s).length; },
};

const EventBus        = (await import('../../core/EventBus.js')).default;
const EntityManager   = (await import('../../core/EntityManager.js')).default;
const { VesselManager } = await import('../../systems/VesselManager.js');
const { GAME_CONFIG } = await import('../../config/GameConfig.js');

const AU = GAME_CONFIG.AU_TO_PX;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const header = (s) => console.log('\n--- ' + s + ' ---');

EntityManager.clear();
EntityManager.add({ id: 'star_home', type: 'star', systemId: 'sys_home', x: 0, y: 0, mass: 1 });
EntityManager.add({
  id: 'planet_home', type: 'planet', systemId: 'sys_home', x: 2 * AU, y: 0,
  orbital: { a: 2, e: 0.01, M: 0.3, T: 2.8, inclinationOffset: 0 },
});

const clock = { gameTime: 40 };
const vm = new VesselManager();
globalThis.KOSMOS = { timeSystem: clock, vesselManager: vm, missionSystem: { getActive: () => [], cancelMission() {} } };

const blocked = [];
EventBus.on('vessel:returnBlocked', d => blocked.push(d));

/** `exploration` DOKŁADNIE jak buduje go `VesselManager:2985` — bez klucza `returnYear`. */
const EXPLORATION = () => ({
  type: 'exploration', phase: 'orbiting_body', targetId: 'planet_home',
  startX: 2 * AU, startY: 0, targetX: 2 * AU + 0.4 * AU, targetY: 0,
  departYear: 38, arrivalYear: 39, waypoints: [], originId: 'planet_home', fuelCost: 0.4,
});

function makeVessel(mission, over = {}) {
  const v = {
    id: 'v_19', name: 'Dyplomata', shipId: 'hull_medium',
    systemId: 'sys_home', colonyId: 'planet_home', homeColonyId: 'planet_home',
    status: 'on_mission',
    position: { state: 'orbiting', dockedAt: 'planet_home', x: 2 * AU + 0.4 * AU, y: 0 },
    mission,
    fuel: { current: 27, max: 27, consumption: 1 },
    warpFuel: { current: 0, max: 0, consumption: 0 },
    speedAU: 1, experience: 0, stats: { distanceTraveled: 0, missionsComplete: 0 },
    modules: [], cargo: {}, missionLog: [],
    pendingOrder: null, warpRoute: null, movementOrder: null, serviceState: 'active', unpaidYears: 0,
    ...over,
  };
  vm._vessels.clear(); vm._vessels.set(v.id, v);
  blocked.length = 0;
  return v;
}

// ── T1 — sedno: 27 AU zasięgu, 0,4 AU do domu, brak returnYear ────────────────────────────────
header('T1 exploration BEZ returnYear — powrót RUSZA (zasięg 27 AU, dystans 0,4 AU)');
const v1 = makeVessel(EXPLORATION());
const r1 = vm.startReturn('v_19');
ok(r1 === true, `startReturn === true (dostał: ${r1})`);
ok(blocked.length === 0, `zero zdarzeń vessel:returnBlocked (było: ${blocked.length})`);
ok(v1._strandedNotified !== true, 'statek NIE dostał fałszywego stempla „⛽ Utknął"');
ok(v1.mission.phase === 'returning', `misja przeszła w fazę powrotu (phase=${v1.mission.phase})`);

// ── T1c — KONTROLA: ten sam fixture, jedyna różnica = obecność pola ───────────────────────────
header('T1c KONTROLA — identyczny fixture Z returnYear');
const v1c = makeVessel({ ...EXPLORATION(), returnYear: 41.2 });
const r1c = vm.startReturn('v_19');
ok(r1c === true && blocked.length === 0,
  'z ustawionym returnYear powrót rusza — jedyną różnicą wobec T1 jest BRAKUJĄCE POLE, ' +
  'więc T1 mierzy dokładnie ten defekt, a nie fixture');
ok(v1c.fuel.current < 27, `paliwo realnie zużyte na powrót (${v1c.fuel.current.toFixed(2)}/27)`);

// ── T2 — tranzyt warp: systemId=null, interstellar_jump bez returnYear ────────────────────────
header('T2 tranzyt warp (interstellar_jump bez returnYear) — brak fałszywej odmowy');
const v2 = makeVessel(
  { type: 'interstellar_jump', fromSystemId: 'sys_home', toSystemId: 'sys_061',
    phase: 'warp_transit', departYear: 39, arrivalYear: 45, distLY: 5, warpSpeed: 1 },
  { systemId: null, position: { state: 'in_transit', dockedAt: null, x: 2 * AU + 0.4 * AU, y: 0 } },
);
const r2 = vm.startReturn('v_19');
ok(r2 === true && blocked.length === 0, `tranzyt warp nie dostaje fałszywej odmowy (${r2})`);
void v2;

// ── T3 — KONTROLA ANTY-JAŁOWA: prawdziwy brak paliwa DALEJ blokuje ────────────────────────────
header('T3 KONTROLA ANTY-JAŁOWA — naprawdę pusty bak dalej odmawia');
const v3 = makeVessel({ ...EXPLORATION(), returnYear: 41.2 },
  { fuel: { current: 0.001, max: 27, consumption: 1 },
    position: { state: 'orbiting', dockedAt: 'planet_home', x: 2 * AU + 12 * AU, y: 0 } });
const r3 = vm.startReturn('v_19');
ok(r3 === false, 'pusty bak DALEJ odmawia — naprawa nie wyłączyła bramki paliwa');
ok(blocked.length === 1 && blocked[0].reason === 'insufficient_fuel',
  `odmowa niesie powód insufficient_fuel (${JSON.stringify(blocked)})`);
ok(v3._strandedNotified === true, 'PRAWDZIWY stranding dalej stempluje statek');

// ── T4 — KONTROLA: AI omija bramkę (owner-gate) ───────────────────────────────────────────────
header('T4 KONTROLA — statek AI dalej omija bramkę paliwa');
makeVessel({ ...EXPLORATION(), returnYear: 41.2 },
  { ownerEmpireId: 'emp_001', fuel: { current: 0.001, max: 27, consumption: 1 },
    position: { state: 'orbiting', dockedAt: 'planet_home', x: 2 * AU + 12 * AU, y: 0 } });
const r4 = vm.startReturn('v_19');
ok(r4 === true && blocked.length === 0, 'AI wraca na clampie (pułapka DW2 nietknięta)');

// ── T5 — KONTROLA: odmowa nie zostawia półstanu ───────────────────────────────────────────────
header('T5 KONTROLA — odmowa NIE mutuje misji (inwariant startReturn:592)');
const v5 = makeVessel({ ...EXPLORATION(), returnYear: 41.2 },
  { fuel: { current: 0.001, max: 27, consumption: 1 },
    position: { state: 'orbiting', dockedAt: 'planet_home', x: 2 * AU + 12 * AU, y: 0 } });
const beforePhase = v5.mission.phase, beforeState = v5.position.state;
vm.startReturn('v_19');
ok(v5.mission.phase === beforePhase && v5.position.state === beforeState,
  `po odmowie faza i stan bez zmian (phase=${v5.mission.phase}, state=${v5.position.state})`);

// ── T6 — PIN sprzężenia z (c): returnYear zapisany i SKOŃCZONY ────────────────────────────────
header('T6 PIN sprzężenia — po udanym powrocie m.returnYear jest SKOŃCZONE');
const v6 = makeVessel(EXPLORATION());
vm.startReturn('v_19');
ok(Number.isFinite(v6.mission.returnYear),
  `m.returnYear = ${v6.mission.returnYear} — bez zapisu closer sieroty (c) czytałby Infinity ` +
  'i NIGDY nie strzeliłby na misjach, które ta naprawa odblokowuje');
ok(v6.mission.returnYear > clock.gameTime, 'wyprowadzony rok leży w PRZYSZŁOŚCI (lot trwa)');

// ── T7 — PIN ŹRÓDŁOWY: nikt nie polega na `??` łapiącym NaN ───────────────────────────────────
header('T7 PIN ŹRÓDŁOWY — dwa site\'y predykcji nie polegają na `??` wobec NaN');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const vmSrc  = stripComments(readFileSync(new URL('../../systems/VesselManager.js', import.meta.url), 'utf8'));
const mosSrc = stripComments(readFileSync(new URL('../../systems/MovementOrderSystem.js', import.meta.url), 'utf8'));

ok(/Number\.isFinite/.test(vmSrc.slice(vmSrc.indexOf('startReturn(vesselId'), vmSrc.indexOf('startReturn(vesselId') + 2600)),
  'startReturn używa jawnego testu skończoności (nie samego `??`, które NaN-a nie łapie)');
// _issueMoveToPoint:826 ma ten sam wzór `pred?.x ?? nowX` i jest bezpieczny WYŁĄCZNIE dlatego,
// że jego rok jest skończony z konstrukcji (clamp prędkości). Pinujemy POWÓD, nie wzór.
const mvIdx = mosSrc.indexOf('_predictPosition');
const mvWin = mosSrc.slice(Math.max(0, mvIdx - 700), mvIdx + 200);
ok(/Math\.max\(0\.01,/.test(mvWin),
  '_issueMoveToPoint liczy ETA z clampem prędkości ⇒ rok SKOŃCZONY z konstrukcji — to jest ' +
  'jedyny powód, dla którego tamtejsze `?? nowX` nie jest miną (Finding 145 §145.8)');
ok(/estArrival/.test(mvWin), 'KONTROLA PINU: okno źródła faktycznie obejmuje wyliczenie ETA (pin nie jest jałowy)');

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
