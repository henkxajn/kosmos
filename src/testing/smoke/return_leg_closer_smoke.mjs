// KEEPER — Finding 146: leg powrotny misji BEZ rekordu w `MissionSystem` MA domknięcie.
//
// CO PINUJE (i dlaczego akurat to)
// `VesselManager._updatePositions` wyklucza własny leg powrotny z detekcji przylotu
// (`if (!m.phase?.startsWith('return') && ...)`), a jedyny closer powrotu
// (`MissionSystem` → `dockAtColony`) WYMAGA rekordu misji. Misje budowane przez sam
// `VesselManager` (`exploration`, `interstellar_jump`, wznowienie `_resumeMissionAfterOrder`)
// rekordu nie mają ⇒ statek po powrocie wisiał `in_transit / returning / dockedAt=null`
// BEZ KOŃCA. ZMIERZONE przed naprawą: 200 lat gry, dystans do domu 0.0000 AU, dalej `on_mission`.
//
// ⚠ ZAKRES JEST CZĘŚCIĄ PINU. Są TRZY kategorie legów `returning` i tylko JEDNA jest sierotą:
//   1. z rekordem `MissionSystem`      → closer `MissionSystem:1668` — DZIAŁA, nie ruszać
//   2. kurierzy AI (`EmpireLogistics`) → WŁASNY poller/closer (`:500`, `:516`) — nie ruszać
//   3. bez rekordu, statek gracza      → BRAK closera = Finding 146 = to naprawiamy
// Globalne zdjęcie wykluczenia dałoby kategorii 2 DRUGI closer (podwójny dok, pominięty
// rozładunek), dlatego T3 i T4 są kontrolami, które muszą być zielone PO OBU stronach.
//
// T1  PIN   — sierota (exploration bez rekordu) domyka się po `returnYear`
// T2  PIN   — to samo dla misji wznowionej (`interstellar_jump` → returning)
// T3  KONTROLA — leg Z rekordem `MissionSystem` NIE jest domykany przez ten closer
// T4  KONTROLA — kurier AI (`isEnemyVessel`) NIE jest domykany przez ten closer
// T5  KONTROLA — przed `returnYear` nic się nie dzieje (closer nie strzela za wcześnie)
// T6  PIN   — degradacja bez portu też ZWALNIA statek (`idle` + `mission=null`), nie zostawia ducha
// T7  KONTROLA PINU — outbound (`phase !== 'returning'`) dalej domyka się starą ścieżką
//
// Uruchom: node src/testing/smoke/return_leg_closer_smoke.mjs

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

const EntityManager   = (await import('../../core/EntityManager.js')).default;
const { VesselManager } = await import('../../systems/VesselManager.js');
const { GAME_CONFIG }  = await import('../../config/GameConfig.js');

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
let activeRecords = [];
globalThis.KOSMOS = {
  timeSystem: clock,
  vesselManager: vm,
  missionSystem: { getActive: () => activeRecords, cancelMission() {} },
};

/** Statek na LEGU POWROTNYM — dokładnie taki, jaki zostawia `startReturn`. */
function makeReturning(over = {}, missionOver = {}) {
  const v = {
    id: 'v_1', name: 'Dyplomata', shipId: 'hull_medium',
    systemId: 'sys_home', colonyId: 'planet_home', homeColonyId: 'planet_home',
    status: 'on_mission',
    position: { state: 'in_transit', dockedAt: null, x: 2 * AU + 0.4 * AU, y: 0 },
    mission: {
      type: 'exploration', phase: 'returning', targetId: 'planet_home',
      departYear: 38, arrivalYear: 39,
      returnDepartYear: 40, returnYear: 40.4,
      returnStartX: 2 * AU + 0.4 * AU, returnStartY: 0,
      returnTargetX: 2 * AU, returnTargetY: 0,
      returnWaypoints: [], waypoints: [],
      ...missionOver,
    },
    fuel: { current: 27, max: 27, consumption: 1 },
    warpFuel: { current: 0, max: 0, consumption: 0 },
    speedAU: 1, experience: 0, stats: { distanceTraveled: 0, missionsComplete: 0 },
    modules: [], cargo: {}, missionLog: [],
    pendingOrder: null, warpRoute: null, movementOrder: null, serviceState: 'active',
    unpaidYears: 0,
    ...over,
  };
  vm._vessels.clear();
  vm._vessels.set(v.id, v);
  return v;
}

/** Przewiń zegar i przetocz prawdziwą pętlę pozycji. */
function tickTo(year, steps = 3) {
  for (let i = 0; i < steps; i++) { clock.gameTime = year; vm._updatePositions(0.5); }
}

const closed = (v) => v.status === 'idle' && v.mission === null;

// ── T1 — sierota domyka się ───────────────────────────────────────────────────────────────────
header('T1 leg powrotny BEZ rekordu (exploration) — domyka się');
activeRecords = [];
let v1 = makeReturning();
tickTo(41);
ok(closed(v1), `sierota domknięta po returnYear (status=${v1.status}, mission=${v1.mission === null ? 'null' : v1.mission.type})`);
ok(v1.position.state !== 'in_transit', `statek NIE wisi w tranzycie (state=${v1.position.state})`);
ok(v1.stats.missionsComplete === 1, 'misja policzona jako ukończona');

// ── T2 — wznowiona misja (interstellar_jump → returning) ──────────────────────────────────────
header('T2 leg powrotny wznowionej misji (interstellar_jump) — też sierota, też domyka się');
activeRecords = [];
const v2 = makeReturning({ id: 'v_2' }, { type: 'interstellar_jump', toSystemId: 'sys_home', fromSystemId: 'sys_061' });
vm._vessels.clear(); vm._vessels.set('v_2', v2);
tickTo(41);
ok(closed(v2), `wznowiona misja domknięta (status=${v2.status})`);

// ── T3 — KONTROLA: leg Z rekordem należy do MissionSystem ─────────────────────────────────────
header('T3 KONTROLA — leg Z rekordem MissionSystem NIE jest domykany tutaj');
const v3 = makeReturning({ id: 'v_3' });
vm._vessels.clear(); vm._vessels.set('v_3', v3);
activeRecords = [{ id: 'exp_1', vesselId: 'v_3', status: 'returning' }];
tickTo(41);
ok(!closed(v3),
  'statek z rekordem NIE domknięty przez ten closer — właścicielem domknięcia jest MissionSystem:1668 ' +
  `(status=${v3.status})`);

// ── T4 — KONTROLA: kurier AI ma własny closer ─────────────────────────────────────────────────
header('T4 KONTROLA — kurier AI (isEnemyVessel) NIE jest domykany tutaj');
activeRecords = [];
const v4 = makeReturning({ id: 'v_4', ownerEmpireId: 'emp_001' });
vm._vessels.clear(); vm._vessels.set('v_4', v4);
tickTo(41);
ok(!closed(v4),
  'kurier AI nietknięty — EmpireLogisticsSystem:500/516 sam go rozładowuje i dokuje; drugi closer ' +
  `dałby podwójny dok (status=${v4.status})`);

// ── T5 — KONTROLA: nie strzela za wcześnie ────────────────────────────────────────────────────
header('T5 KONTROLA — przed returnYear closer milczy');
activeRecords = [];
const v5 = makeReturning({ id: 'v_5' });
vm._vessels.clear(); vm._vessels.set('v_5', v5);
tickTo(40.2);
ok(!closed(v5), `przed returnYear statek dalej leci (status=${v5.status}, state=${v5.position.state})`);
tickTo(41);
ok(closed(v5), 'po przekroczeniu returnYear domyka się');

// ── T6 — degradacja bez portu ZWALNIA statek ──────────────────────────────────────────────────
header('T6 brak portu — statek i tak ZWOLNIONY (nie zostaje duch)');
activeRecords = [];
const v6 = makeReturning({ id: 'v_6' });
vm._vessels.clear(); vm._vessels.set('v_6', v6);
tickTo(41);
ok(v6.mission === null && v6.status === 'idle',
  `bez portu dockAtColony degraduje do orbity, ale ZWALNIA statek (state=${v6.position.state}, status=${v6.status})`);

// ── T7 — KONTROLA PINU: outbound niezmieniony ─────────────────────────────────────────────────
header('T7 KONTROLA PINU — lot DOCELOWY (nie powrót) domyka się starą ścieżką');
activeRecords = [];
const v7 = makeReturning({ id: 'v_7' }, {
  phase: 'traveling', arrivalYear: 40.3, returnYear: undefined,
  targetX: 2 * AU, targetY: 0, startX: 2 * AU + 0.4 * AU, startY: 0,
});
vm._vessels.clear(); vm._vessels.set('v_7', v7);
tickTo(41);
ok(v7.position.dockedAt === 'planet_home' || v7.mission === null,
  `outbound dalej domyka się detekcją przylotu (dockedAt=${v7.position.dockedAt}, mission=${v7.mission === null ? 'null' : v7.mission.type})`);

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
