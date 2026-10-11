// ═══════════════════════════════════════════════════════════════════════════════
// sb2b_battle_id_smoke — KEEPER Findingu 424 (AI STRIKES BACK, zamknięcie S2b, decyzja SB47)
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §6 (424; bliźniak 419).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: `VesselCombatSystem._makeBattleId` = `battle_ds_<rok, 2 miejsca>_<A>_<B>` — na ścieżce natychmiastowej
//   (wycofanie: `FEATURES.m4DeepSpaceCombat` OFF albo brak DSCS) druga bitwa tej samej pary w tym samym 0,01 roku gry
//   NADPISYWAŁA rekord pierwszej w `gameState.battles`, a oba `battle:resolved` niosły ten sam identyfikator.
// SB47: ta sama reguła co SB42 (S2b-4, `DeepSpaceCombatSystem._makeEncounterId`) — podstawa bez zmian, przy zajętej
//   przyrostek `_2`, `_3`, …
//
// PINY (PRAWDZIWY łańcuch: `vessel:combatRangeEnter` → VCS `_handleCombatRangeEnter` → `_resolveEngagement` →
//   `_battle` → `_applyOutcome`):
//   T1  dwie bitwy tej samej pary w tym samym 0,01 roku (dwa miejsca układu): dwa RÓŻNE identyfikatory, dwa rekordy,
//       rekord pierwszej nietknięty, drugi identyfikator = podstawa + `_2`
//   T2  KONTROLA — format bez zmian w zwykłym przypadku (`battle_ds_<rok>_player_<imperium>`)
//   T3  KONTROLA — bitwy w różnych oknach 0,01 roku: identyfikatory bazowe, bez przyrostka
//   T4  STRAŻNIK (zielony po obu stronach) — `resolveDeepSpaceBattle` zwraca rekord bitwy, którą WŁAŚNIE rozstrzygnął,
//       także drugiej w tym samym oknie (dotąd odtwarzał identyfikator po walce — przy przyrostku trafiałby w wolny)
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import gameState               from '../../core/GameState.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { VesselCombatSystem }  from '../../systems/VesselCombatSystem.js';
import { EnemyAttackHandler }  from '../../systems/EnemyAttackHandler.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU  = GAME_CONFIG.AU_TO_PX;
const SYS = 'sys_t';
const EMP = 'emp_001';
// Ścieżka natychmiastowa VCS = wycofanie (flaga OFF). Przywracana na końcu.
const PREV_DSCS = GAME_CONFIG.FEATURES.m4DeepSpaceCombat;
GAME_CONFIG.FEATURES.m4DeepSpaceCombat = false;

let vMgr, vcs, resolved;

function scene(year = 100) {
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: year }, activeSystemId: SYS };
  gameState.set('battles', {}, 'keeper_reset');
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: SYS, x: -12 * AU, y: 0, radius: 4, mass: 1, visual: { radius: 4 } });
  vMgr = new VesselManager();
  vcs = new VesselCombatSystem(vMgr);
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: EntityManager.get('p_home'), vesselManager: vMgr,
    enemyAttackHandler: new EnemyAttackHandler(),
    empireRegistry: { get: (id) => ({ id, name: 'Liga' }), listAll: () => [{ id: EMP }] },
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} },
    debug: { combatTrace: false },
  });
  resolved = [];
  EventBus.on('battle:resolved', (e) => resolved.push(e));
}
function ship({ xAU, yAU = 0, name, empire = null }) {
  const v = vMgr.createAndRegister('hull_frigate', 'p_home', { name, modules: ['weapon_laser', 'engine_ion'] });
  v.position.x = xAU * AU; v.position.y = yAU * AU; v.position.state = 'orbiting'; v.position.dockedAt = null;
  v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.speedAU = 1.2; v.systemId = SYS;
  if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; v.serviceState = 'active'; }
  return v;
}
/** Para gracz ↔ AI w punkcie (xAU, yAU). */
function pair(xAU, yAU, tag) {
  const p = ship({ xAU, yAU, name: `P${tag}` });
  const a = ship({ xAU: xAU + 0.05, yAU, name: `A${tag}`, empire: EMP });
  return { p, a };
}
/** Wejście w zasięg walki — ten sam kanał, którym nadają producenci (Proximity / MOS). */
function enter({ p, a }) {
  EventBus.emit('vessel:combatRangeEnter', { vesselAId: p.id, vesselBId: a.id, distanceAU: 0.05, sameFaction: false });
}
const battleIds = () => Object.keys(gameState.get('battles') ?? {});
const BASE = (yr) => `battle_ds_${yr}_player_${EMP}`;

// ═══ T1 — dwie bitwy w tym samym 0,01 roku ════════════════════════════════════════
header('T1  dwie bitwy tej samej pary w tym samym 0,01 roku — dwa identyfikatory, rekord pierwszej nietknięty');
{
  scene(100);
  const one = pair(3, 0, '1');
  const two = pair(-3, 4, '2');
  enter(one);
  const rec1 = gameState.get(`battles.${resolved[0]?.battleId}`) ?? null;
  window.KOSMOS.timeSystem.gameTime += 0.004;                        // to samo okno 0,01 roku
  enter(two);
  const ids = resolved.map(e => e.battleId);
  console.log(`     battle:resolved ${ids.join(' · ')} · rekordy ${battleIds().join(', ')}`);
  assert(resolved.length === 2 && !!rec1, 'T1-0 KONTROLA: obie bitwy się odbyły (dwa `battle:resolved`, rekord pierwszej zapisany)');
  assert(ids.length === 2 && ids[0] !== ids[1], 'T1a dwa RÓŻNE identyfikatory w `battle:resolved`');
  assert(battleIds().length === 2, 'T1b dwa rekordy w `gameState.battles`');
  const first = gameState.get(`battles.${ids[0]}`);
  assert(first === rec1 && first?.participantA?.vesselIds?.[0] === one.p.id,
    'T1c rekord pierwszej bitwy nie nadpisany (strona gracza = statek pierwszej pary)');
  assert(ids[0] === BASE('100_00') && ids[1] === `${BASE('100_00')}_2`, `T1d drugi identyfikator = podstawa + \`_2\` (${ids[1]})`);
}

// ═══ T2 — kontrola formatu ═════════════════════════════════════════════════════════
header('T2  KONTROLA — format identyfikatora bez zmian w zwykłym przypadku');
{
  scene(100);
  enter(pair(3, 0, '1'));
  assert(resolved.length === 1 && resolved[0].battleId === BASE('100_00') && battleIds()[0] === BASE('100_00'),
    `T2 pierwsza bitwa: ${resolved[0]?.battleId} (przedrostek battle_ds_ jak dotąd)`);
}

// ═══ T3 — różne okna 0,01 roku ═════════════════════════════════════════════════════
header('T3  KONTROLA — bitwy w różnych oknach 0,01 roku: identyfikatory bazowe');
{
  scene(100);
  enter(pair(3, 0, '1'));
  window.KOSMOS.timeSystem.gameTime = 100.02;
  enter(pair(-3, 4, '2'));
  const ids = resolved.map(e => e.battleId);
  assert(ids.length === 2 && ids[0] === BASE('100_00') && ids[1] === BASE('100_02'), `T3 ${ids.join(' · ')} (bez przyrostka)`);
}

// ═══ T4 — strażnik API debugowego ══════════════════════════════════════════════════
header('T4  STRAŻNIK — resolveDeepSpaceBattle zwraca rekord bitwy, którą właśnie rozstrzygnął');
{
  scene(100);
  const one = pair(3, 0, '1');
  const r1 = vcs.resolveDeepSpaceBattle([one.p], [one.a], { point: { x: one.p.position.x, y: one.p.position.y } });
  window.KOSMOS.timeSystem.gameTime += 0.004;
  const two = pair(-3, 4, '2');
  const r2 = vcs.resolveDeepSpaceBattle([two.p], [two.a], { point: { x: two.p.position.x, y: two.p.position.y } });
  assert(r1?.participantA?.vesselIds?.[0] === one.p.id, 'T4a pierwsza bitwa: zwrócony rekord tej bitwy');
  assert(r2?.participantA?.vesselIds?.[0] === two.p.id && r2?.id === resolved[1]?.battleId,
    `T4b druga bitwa w tym samym oknie: zwrócony rekord TEJ bitwy (${r2?.id ?? 'null'})`);
}

GAME_CONFIG.FEATURES.m4DeepSpaceCombat = PREV_DSCS;
console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
