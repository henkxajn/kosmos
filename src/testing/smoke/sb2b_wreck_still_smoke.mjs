// ═══════════════════════════════════════════════════════════════════════════════
// sb2b_wreck_still_smoke — KEEPER Findingu 417 (AI STRIKES BACK, pre-S3, decyzja SB40)
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §6 (417).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: wrak, którego misja była wstrzymana na czas walki, wznawiał ją i leciał do celu. `_turnIntoWreck` emituje
//   `vessel:wrecked` → `MovementOrderSystem._onVesselWrecked` anuluje aktywny rozkaz (`vessel:orderCancelled`) →
//   `VesselManager._resumeMissionAfterOrder` wznawiał migawkę z pauzy bojowej bez pytania o wrak (misja, `in_transit`,
//   `vessel:launched`), a `_updatePositions` prowadził wrak jak lot i przy przylocie go DOKOWAŁ (S2: wrak `v_33`
//   2,79 AU do stolicy AI). Obie strony (pauza gracza i AI).
// SB40: wrak nigdy nie leci, nigdy nie wznawia misji, nigdy nie dokuje.
//
// PINY (PRAWDZIWY łańcuch: MOS → VCS → DSCS → `EnemyAttackHandler._turnIntoWreck`, tiki `time:tick`):
//   T1  wrak GRACZA z misją wstrzymaną na walkę: migawka znika, misja null, brak `vessel:launched` / `vessel:arrived`
//       wraku, po 8 latach (dłużej niż lot do celu) stoi w miejscu zniszczenia (nie zadokowany)
//   T2  wrak AI (pauza AI, F130) — to samo
//   T3  zapis sprzed SB40: wrak JUŻ w locie (wznowiona misja `in_transit`) — stoi, nie dolatuje i nie dokuje
//   T4  KONTROLA: ocalały z tego samego starcia WZNAWIA misję i leci (wznowienie żywe działa jak dotąd)
//   T5  KONTROLA: wrak na orbicie cmentarnej ciała (EAH, ciało) dalej podąża za ciałem — poza SB40, bez zmian
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { VesselCombatSystem }  from '../../systems/VesselCombatSystem.js';
import { EnemyAttackHandler }  from '../../systems/EnemyAttackHandler.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU  = GAME_CONFIG.AU_TO_PX;
const CIV = GAME_CONFIG.CIV_TIME_SCALE ?? 12;
const DT  = 0.01;
const SYS = 'sys_t';
let vMgr, mos, dscs, eah, events;

function scene() {
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 100 }, activeSystemId: SYS };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_far', type: 'planet', name: 'Far', systemId: SYS, x: 9 * AU, y: 0, radius: 4, mass: 1, visual: { radius: 4 } });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: SYS, x: -6 * AU, y: 0, radius: 4, mass: 1, visual: { radius: 4 } });
  vMgr = new VesselManager(); mos = new MovementOrderSystem(vMgr);
  dscs = new DeepSpaceCombatSystem(vMgr); new VesselCombatSystem(vMgr); eah = new EnemyAttackHandler();
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: EntityManager.get('p_home'), vesselManager: vMgr, movementOrderSystem: mos,
    deepSpaceCombatSystem: dscs, enemyAttackHandler: eah,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} },
    intelSystem: { getVesselContact: () => ({ quality: 'contact' }), getLevel: () => 'contact', isAtLeast: () => true },
    debug: { combatTrace: false },
  });
  events = [];
  for (const n of ['vessel:launched', 'vessel:arrived', 'vessel:docked', 'vessel:wrecked'])
    EventBus.on(n, ({ vessel, vesselId }) => events.push({ n, id: vessel?.id ?? vesselId, t: window.KOSMOS.timeSystem.gameTime }));
}
function ship({ xAU, yAU = 0, name, empire = null }) {
  const v = vMgr.createAndRegister('hull_frigate', 'p_home', { name, modules: ['weapon_laser', 'engine_ion'] });
  v.position.x = xAU * AU; v.position.y = yAU * AU; v.position.state = 'orbiting'; v.position.dockedAt = null;
  v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.speedAU = 1.2; v.systemId = SYS;
  if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; v.serviceState = 'active'; }
  return v;
}
function tick(n = 1) {
  for (let i = 0; i < n; i++) {
    window.KOSMOS.timeSystem.gameTime += DT;
    EventBus.emit('time:tick', { deltaYears: DT, civDeltaYears: DT * CIV, gameTime: window.KOSMOS.timeSystem.gameTime, multiplier: 1 });
  }
}
const at = (v) => ({ x: v.position.x, y: v.position.y });
const movedAU = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / AU;

/** Starcie gracz ↔ AI w pół drogi, obie strony z rozkazem moveToPoint (pauza bojowa robi migawki). */
function combatScene() {
  scene();
  const p = ship({ xAU: 2, name: 'Gracz' });
  const a = ship({ xAU: 2.05, name: 'Rajder', empire: 'emp_001' });
  const okP = mos.issueOrder(p.id, { type: 'moveToPoint', targetBodyId: 'p_far', targetPoint: { x: 9 * AU, y: 0 }, issuedBy: 'keeper' });
  const okA = mos.issueOrder(a.id, { type: 'moveToPoint', targetBodyId: 'p_home', targetPoint: { x: -6 * AU, y: 0 }, issuedBy: 'keeper' });
  const enc = dscs.startEngagement(p.id, a.id);
  return { p, a, enc, okP: !!okP?.ok, okA: !!okA?.ok };
}

// ═══ T1 — wrak gracza ═════════════════════════════════════════════════════════
header('T1  wrak GRACZA z misją wstrzymaną na walkę — stoi w miejscu zniszczenia');
{
  const { p, a, enc, okP, okA } = combatScene();
  assert(okP && okA && enc && p._suspendedMission && p._combatPause && !p.mission,
    'T1-0 KONTROLA: oba rozkazy przyjęte, starcie powstało, gracz ma migawkę misji i jest zamrożony');
  enc.vesselStates.get(p.id).hp = 0;                        // gracz zniszczony
  const wreckAt = enc.location.point;
  const n0 = events.length;
  dscs._finalizeBattle(enc, 'B', null);
  const launchedWreck = events.slice(n0).some(e => e.n === 'vessel:launched' && e.id === p.id);
  assert(p.isWreck === true, 'T1-0b KONTROLA: gracz jest wrakiem (EAH `_turnIntoWreck`)');
  assert(!p._suspendedMission && p.mission == null && !launchedWreck && p.status === 'destroyed',
    'T1a wrak NIE wznawia misji (migawka zdjęta, misja null, status `destroyed`, bez `vessel:launched`)');
  const before = at(p);
  tick(800);                                                 // 8 lat — dłużej niż lot do celu (7 AU / 1,2 AU/rok)
  const arrived = events.some(e => (e.n === 'vessel:arrived' || e.n === 'vessel:docked') && e.id === p.id);
  assert(movedAU(at(p), before) < 1e-9 && movedAU(at(p), wreckAt) < 1e-6, `T1b wrak stoi w miejscu zniszczenia po 8 latach (przesunięcie ${movedAU(at(p), before).toFixed(4)} AU)`);
  assert(!arrived && p.position.dockedAt == null && p.position.state !== 'docked', 'T1c wrak nie dolatuje i nie dokuje');
  void a;
}

// ═══ T2 — wrak AI ═════════════════════════════════════════════════════════════
header('T2  wrak AI z misją wstrzymaną na walkę (pauza AI, F130)');
{
  const { p, a, enc } = combatScene();
  assert(a._suspendedMission && a._combatPause, 'T2-0 KONTROLA: rajder AI ma migawkę misji (pauza AI)');
  enc.vesselStates.get(a.id).hp = 0;
  const wreckAt = enc.location.point;
  const n0 = events.length;
  dscs._finalizeBattle(enc, 'A', null);
  const launchedWreck = events.slice(n0).some(e => e.n === 'vessel:launched' && e.id === a.id);
  assert(a.isWreck && !a._suspendedMission && a.mission == null && !launchedWreck && a.status === 'destroyed', 'T2a wrak AI nie wznawia misji');
  tick(800);                                                 // 8 lat — dłużej niż lot do celu (8 AU / 1,2 AU/rok)
  const arrived = events.some(e => (e.n === 'vessel:arrived' || e.n === 'vessel:docked') && e.id === a.id);
  assert(movedAU(at(a), wreckAt) < 1e-6 && !arrived && a.position.dockedAt == null, 'T2b wrak AI stoi w miejscu zniszczenia, nie dokuje');
  void p;
}

// ═══ T3 — zapis sprzed SB40: wrak już w locie ════════════════════════════════════
header('T3  zapis sprzed SB40 — wrak z wznowioną misją `in_transit`');
{
  scene();
  const w = ship({ xAU: 1, name: 'Duch' });
  w.isWreck = true; w.status = 'on_mission'; w.wreckedAt = 99.5; w.position.state = 'in_transit'; w.position.dockedAt = null;
  w.mission = { type: 'move_to_point', targetId: 'p_far', startX: w.position.x, startY: 0, targetX: 9 * AU, targetY: 0,
                waypoints: [], departYear: 100, arrivalYear: 104 };
  const start = at(w);
  tick(600);                                                 // 6 lat — dłużej niż lot
  const arrived = events.some(e => (e.n === 'vessel:arrived' || e.n === 'vessel:docked') && e.id === w.id);
  assert(movedAU(at(w), start) < 1e-9 && !arrived && w.position.dockedAt == null, 'T3 wrak w locie z zapisu stoi, nie dolatuje i nie dokuje');
}

// ═══ T4 — kontrola: ocalały wznawia ══════════════════════════════════════════════
header('T4  KONTROLA — ocalały z tego samego starcia wznawia misję i leci');
{
  const { p, a, enc } = combatScene();
  enc.vesselStates.get(a.id).hp = 0;                        // AI ginie, gracz ocalał
  dscs._finalizeBattle(enc, 'A', null);
  const m = p.mission;
  const before = at(p);
  tick(50);
  assert(m && m.targetId === 'p_far' && p.position.state === 'in_transit' && movedAU(at(p), before) > 0.3,
    `T4 ocalały gracz wznowił misję do p_far i leci (przesunięcie ${movedAU(at(p), before).toFixed(2)} AU)`);
}

// ═══ T5 — kontrola: wrak na orbicie cmentarnej ciała ═════════════════════════════
header('T5  KONTROLA — wrak na orbicie cmentarnej ciała podąża za ciałem (poza SB40)');
{
  scene();
  const body = EntityManager.get('p_far');
  const w = ship({ xAU: 9, name: 'Cmentarz' });
  window.KOSMOS.orbitalSpaceSystem = {
    getOrbit: () => ({ r: 0.1 }), hasOrbit: () => true, transitionToWreck: () => {}, assignOrbit: () => {},
    getPosition: (_id, center) => ({ x: center.x + 0.01, z: center.z }),
  };
  eah._turnIntoWreck(w, 'p_far', 100);
  body.x = 9 * AU; body.y = 4 * AU;                        // ciało się przesunęło
  tick(1);
  assert(w.isWreck && w.position.dockedAt === 'p_far' && Math.hypot(w.position.x - body.x, w.position.y - body.y) / AU < 0.2,
    'T5 wrak cmentarny dalej przy ciele, które się przesunęło (zachowanie sprzed SB40)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
