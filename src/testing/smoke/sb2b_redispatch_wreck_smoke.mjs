// ═══════════════════════════════════════════════════════════════════════════════
// sb2b_redispatch_wreck_smoke — KEEPER Findingu 425 (AI STRIKES BACK, zamknięcie S2b, decyzja SB47)
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §6 (425).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: `VesselManager.redispatchFromOrbit` sprawdzał `orbiting` i `isInService`, nie `isWreck` — a wrak ma stan
//   `orbiting` i zostaje „w służbie” (`serviceState` nietknięte przez `_turnIntoWreck`). Wrak dostawał misję,
//   `on_mission`, `in_transit` i `vessel:launched`. Utajone: wołający filtrują (rekordy misji zamykane na
//   `vessel:wrecked`, wrak ma zerowe paliwo, więc `MissionSystem._launchTransport` odpada na paliwie wcześniej).
// SB47: ta sama bramka co SB40 (S2b-2, `_resumeMissionAfterOrder`) — wrak nie wychodzi na misję.
//
// PINY (wrak robi PRAWDZIWY `EnemyAttackHandler._turnIntoWreck`):
//   T0  KONTROLA — wrak przechodzi obie bramki sprzed poprawki (`orbiting`, `isInService`), więc odmowę daje nowa
//   T1  wrak z głębokiej przestrzeni: `redispatchFromOrbit` → false, bez misji i bez zmiany stanu, bez `vessel:launched`
//   T2  KONTROLA — żywy statek w tym samym stanie i z tą samą misją: wychodzi (true, `in_transit`, jedno `vessel:launched`)
//   T3  wrak na orbicie cmentarnej ciała (druga postać wraku): ta sama odmowa
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import gameState               from '../../core/GameState.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { EnemyAttackHandler }  from '../../systems/EnemyAttackHandler.js';
import { isInService }         from '../../entities/Vessel.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU  = GAME_CONFIG.AU_TO_PX;
const SYS = 'sys_t';
let vMgr, eah, launched;

function scene(year = 100) {
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: year }, activeSystemId: SYS };
  gameState.set('battles', {}, 'keeper_reset');
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: SYS, x: -12 * AU, y: 0, radius: 4, mass: 1, visual: { radius: 4 } });
  EntityManager.add({ id: 'p_far', type: 'planet', name: 'Far', systemId: SYS, x: 12 * AU, y: 0, radius: 4, mass: 1, visual: { radius: 4 } });
  vMgr = new VesselManager();
  eah = new EnemyAttackHandler();
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: EntityManager.get('p_home'), vesselManager: vMgr, enemyAttackHandler: eah,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} },
  });
  launched = [];
  EventBus.on('vessel:launched', (e) => launched.push(e?.vessel?.id ?? null));
}
/** Statek gracza na orbicie w punkcie (xAU, 0) — stan spoczynkowy po misji (`orbiting` + `idle`). */
function orbiter(xAU, name) {
  const v = vMgr.createAndRegister('hull_small', 'p_home', { name, modules: ['cargo_bay', 'engine_ion'] });
  v.position.x = xAU * AU; v.position.y = 0; v.position.state = 'orbiting'; v.position.dockedAt = null;
  v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.speedAU = 1.2; v.systemId = SYS;
  return v;
}
const mission = (year = 100) => ({
  type: 'transport', targetId: 'p_far', targetName: 'Far',
  departYear: year, arrivalYear: year + 2, returnYear: year + 4, fuelCost: 1, cargo: {},
});

// ═══ T0 + T1 — wrak z głębokiej przestrzeni ════════════════════════════════════════
header('T0/T1  wrak z głębokiej przestrzeni — redispatchFromOrbit odmawia');
{
  scene();
  const w = orbiter(2, 'Wrak');
  eah._turnIntoWreck(w, { x: w.position.x, y: w.position.y }, 100);
  assert(w.isWreck === true && w.position.state === 'orbiting' && isInService(w),
    'T0 KONTROLA: wrak jest `orbiting` i „w służbie” — przechodzi obie bramki sprzed poprawki');
  const ok = vMgr.redispatchFromOrbit(w.id, mission());
  assert(ok === false, `T1a redispatchFromOrbit(wrak) → false (jest: ${ok})`);
  assert(w.mission == null && w.status === 'destroyed' && w.position.state === 'orbiting',
    `T1b wrak bez misji i bez zmiany stanu (misja ${w.mission?.type ?? null}, ${w.status}, ${w.position.state})`);
  assert(launched.length === 0, `T1c brak \`vessel:launched\` (jest: ${launched.length})`);
}

// ═══ T2 — kontrola: żywy statek ════════════════════════════════════════════════════
header('T2  KONTROLA — żywy statek w tym samym stanie wychodzi na misję');
{
  scene();
  const v = orbiter(2, 'Zywy');
  const ok = vMgr.redispatchFromOrbit(v.id, mission());
  assert(ok === true && v.position.state === 'in_transit' && v.status === 'on_mission' && v.mission?.type === 'transport',
    `T2a żywy statek: true, in_transit, on_mission (jest: ${ok}, ${v.position.state}, ${v.status})`);
  assert(launched.length === 1 && launched[0] === v.id, `T2b jedno \`vessel:launched\` (jest: ${launched.length})`);
}

// ═══ T3 — wrak na orbicie cmentarnej ciała ═════════════════════════════════════════
header('T3  wrak na orbicie cmentarnej ciała — ta sama odmowa');
{
  scene();
  const w = orbiter(12, 'WrakOrbita');
  eah._turnIntoWreck(w, 'p_far', 100);
  assert(w.isWreck === true && w.position.dockedAt === 'p_far' && w.position.state === 'orbiting' && isInService(w),
    'T3-0 KONTROLA: wrak przy ciele (`dockedAt` = ciało, `orbiting`, „w służbie”) — przed wywołaniem');
  const ok = vMgr.redispatchFromOrbit(w.id, mission());
  assert(ok === false && w.mission == null && launched.length === 0,
    `T3a redispatchFromOrbit(wrak przy ciele) → false, bez misji, bez \`vessel:launched\` (jest: ${ok})`);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
