// Player combat mission pause/resume/abort — smoke (offline).
//
// m4PlayerCombatMissionPause: player vessel/flota na misji wpadająca w combat jest zamrożona
// (bug fix — bez tego dryf poza COMBAT_DISENGAGE_AU = fałszywa porażka), misja zawieszona,
// po walce WZNOWIONA (>20% MAX HP floty) albo WYCOFANA (≤20%). Player-only. FleetSystem (retreat_at_50)
// owns members floty z aktywnym activeOrder → tylko freeze, bez abort z tej ścieżki.
//
// Pokrycie (logika _resolvePlayerMissionsPostBattle + _isMissionPauseEligible):
//   T1  eligible, pct 0.5 (>0.2) → RESUME
//   T2  eligible, pct 0.1 (≤0.2) → ABORT (retreat), snapshot dropped
//   T3  order layer przejęła (v.mission != null, np. retreat_at_50) → drop snapshot, bez resume/abort
//   T4  NON-eligible, pct 0.1 → RESUME (NIE abort — abort tylko dla eligible)
//   T5  wrak → skip, snapshot dropped
//   T6  brak strony gracza (AI↔AI) → no-op
//   T7  flaga OFF → no-op
//   T8-T10  _isMissionPauseEligible: mission+no-fleet=true; no-mission=false; fleet-activeOrder=false

globalThis.window = globalThis;
globalThis.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
globalThis.document = { createElement:()=>({style:{},appendChild(){},addEventListener(){}}), getElementById:()=>null };

const { DeepSpaceCombatSystem, RETREAT_THRESHOLD } = await import('../../systems/DeepSpaceCombatSystem.js');
const { GAME_CONFIG } = await import('../../config/GameConfig.js');

let pass = 0, fail = 0;
function assert(cond, label) { if (cond) { console.log('  ✓ ' + label); pass++; } else { console.log('  ✗ ' + label); fail++; } }
function header(t) { console.log('\n--- ' + t + ' ---'); }

// Zbuduj instancję DSCS (bez konstruktora) + świeże środowisko mocków. Zwraca telemetrię wywołań.
function setup() {
  const resumeCalls = [], retreatCalls = [];
  const dscs = Object.create(DeepSpaceCombatSystem.prototype);
  dscs._vm = {
    _vessels: new Map(),
    _resumeMissionAfterOrder: (id) => resumeCalls.push(id),
  };
  globalThis.window.KOSMOS = {
    autoRetreatSystem:   { _issueRetreatOrder: (v, bid) => retreatCalls.push({ id: v.id, bid }) },
    movementOrderSystem: { _suspendMissionIfAny: () => true },
    fleetSystem:         { _fleets: new Map() },
  };
  return { dscs, resumeCalls, retreatCalls };
}

// Encounter z jednym player vesselem, kontrolowany pct = hp/maxHp.
function mkEncounter(vid, hp, maxHp, playerSide = 'A') {
  const vesselStates = new Map([[vid, { hp, hpStart: maxHp }]]);
  const player = { ownerEmpireId: 'player', vesselIds: [vid], joinedVesselIds: [] };
  const enemy  = { ownerEmpireId: 'emp_x', vesselIds: [], joinedVesselIds: [] };
  return playerSide === 'A'
    ? { sideA: player, sideB: enemy, vesselStates }
    : { sideA: enemy, sideB: player, vesselStates };
}

function run({ eligible = true, hp = 50, maxHp = 100, mission = null, isWreck = false, flag = true }) {
  const { dscs, resumeCalls, retreatCalls } = setup();
  GAME_CONFIG.FEATURES.m4PlayerCombatMissionPause = flag;
  const enc = mkEncounter('v1', hp, maxHp);
  const v = { id: 'v1', _combatPause: { eligible }, mission, isWreck, _suspendedMission: { targetId: 'body_1' } };
  dscs._vm._vessels.set('v1', v);
  dscs._resolvePlayerMissionsPostBattle(enc, 'battle_1');
  return { resumeCalls, retreatCalls, v };
}

// ── T1 — eligible, >20% → resume ─────────────────────────────────────────────
header('T1: eligible, pct 0.5 → RESUME');
{
  const r = run({ eligible: true, hp: 50, maxHp: 100 });
  assert(r.resumeCalls.length === 1 && r.resumeCalls[0] === 'v1', 'resume wywołany dla v1');
  assert(r.retreatCalls.length === 0, 'brak retreat');
  assert(r.v._combatPause === undefined, 'marker _combatPause wyczyszczony');
}

// ── T2 — eligible, ≤20% → abort ──────────────────────────────────────────────
header('T2: eligible, pct 0.1 → ABORT');
{
  const r = run({ eligible: true, hp: 10, maxHp: 100 });
  assert(r.retreatCalls.length === 1 && r.retreatCalls[0].id === 'v1', 'retreat wywołany dla v1');
  assert(r.retreatCalls[0].bid === 'battle_1', 'retreat z battleId');
  assert(r.resumeCalls.length === 0, 'brak resume');
  assert(r.v._suspendedMission === undefined, 'snapshot dropped (nie wróci w niebezpieczeństwo)');
}

// ── T3 — order layer override → skip ─────────────────────────────────────────
header('T3: order layer przejęła (mission != null) → skip resume/abort');
{
  const r = run({ eligible: true, hp: 10, maxHp: 100, mission: { type: 'move_to_point' } });
  assert(r.resumeCalls.length === 0 && r.retreatCalls.length === 0, 'ani resume ani abort');
  assert(r.v._suspendedMission === undefined, 'snapshot dropped (order layer owns)');
}

// ── T4 — non-eligible, ≤20% → resume (NIE abort) ─────────────────────────────
header('T4: NON-eligible, pct 0.1 → RESUME (abort tylko dla eligible)');
{
  const r = run({ eligible: false, hp: 10, maxHp: 100 });
  assert(r.resumeCalls.length === 1, 'resume wywołany');
  assert(r.retreatCalls.length === 0, 'brak abort (FleetSystem owns non-eligible retreat)');
}

// ── T5 — wrak → skip ─────────────────────────────────────────────────────────
header('T5: wrak → skip');
{
  const r = run({ eligible: true, hp: 0, maxHp: 100, isWreck: true });
  assert(r.resumeCalls.length === 0 && r.retreatCalls.length === 0, 'ani resume ani abort');
  assert(r.v._suspendedMission === undefined, 'snapshot dropped');
}

// ── T6 — brak strony gracza → no-op ──────────────────────────────────────────
header('T6: AI↔AI (brak player side) → no-op');
{
  const { dscs, resumeCalls, retreatCalls } = setup();
  GAME_CONFIG.FEATURES.m4PlayerCombatMissionPause = true;
  const enc = { sideA: { ownerEmpireId: 'emp_a', vesselIds: ['v1'], joinedVesselIds: [] },
                sideB: { ownerEmpireId: 'emp_b', vesselIds: [], joinedVesselIds: [] },
                vesselStates: new Map([['v1', { hp: 10, hpStart: 100 }]]) };
  dscs._vm._vessels.set('v1', { id: 'v1', _combatPause: { eligible: true }, _suspendedMission: {} });
  dscs._resolvePlayerMissionsPostBattle(enc, 'b');
  assert(resumeCalls.length === 0 && retreatCalls.length === 0, 'no-op dla AI↔AI');
}

// ── T7 — flaga OFF → no-op ───────────────────────────────────────────────────
header('T7: flaga OFF → no-op');
{
  const r = run({ eligible: true, hp: 10, maxHp: 100, flag: false });
  assert(r.resumeCalls.length === 0 && r.retreatCalls.length === 0, 'no-op gdy flaga OFF');
  GAME_CONFIG.FEATURES.m4PlayerCombatMissionPause = false;  // przywróć default
}

// ── T8-T10 — _isMissionPauseEligible ─────────────────────────────────────────
header('T8-T10: _isMissionPauseEligible');
{
  const { dscs } = setup();
  assert(dscs._isMissionPauseEligible({ mission: { type: 'transport' } }) === true, 'mission + brak floty → true');
  assert(dscs._isMissionPauseEligible({ mission: null }) === false, 'brak misji → false');
  window.KOSMOS.fleetSystem._fleets.set('fl_1', { activeOrder: { id: 'o1' } });
  assert(dscs._isMissionPauseEligible({ mission: { type: 'transport' }, fleetId: 'fl_1' }) === false,
    'członek floty z activeOrder → false (FleetSystem owns)');
  window.KOSMOS.fleetSystem._fleets.set('fl_2', { activeOrder: null });
  assert(dscs._isMissionPauseEligible({ mission: { type: 'transport' }, fleetId: 'fl_2' }) === true,
    'flota bez activeOrder → true');
}

console.log(`\nRETREAT_THRESHOLD = ${RETREAT_THRESHOLD}`);
console.log(`WYNIK: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
