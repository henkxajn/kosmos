// ═══════════════════════════════════════════════════════════════════════════════
// sb2b_encounter_id_smoke — KEEPER Findingu 419 (AI STRIKES BACK, pre-S3, decyzja SB42)
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §6 (419).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: `DeepSpaceCombatSystem._makeEncounterId` = `encounter_<rok, 2 miejsca>_<A>_<B>` — drugie starcie tej samej
//   pary w tym samym 0,01 roku gry NADPISYWAŁO pierwsze w `_activeEncounters`: pierwsze przestawało tykać i nigdy się
//   nie kończyło, więc jego statki zostawały zamrożone na zawsze (migawka misji i `_combatPause` wisiały, rozkaz
//   aktywny; uprząż S2: fregata 3,86 AU od celu 2 lata później), a rekord bitwy `battles.<id>` był nadpisywany.
// SB42: każde starcie ma unikalny identyfikator; żaden statek nie zostaje zamrożony po końcu swojego starcia.
//
// PINY (PRAWDZIWY łańcuch: MOS → DSCS `handleCombatRangeEnter` → `_finalizeBattle`):
//   T1  dwa starcia tej samej pary w tym samym 0,01 roku (dwa miejsca układu): dwa RÓŻNE identyfikatory, oba aktywne;
//       po rozstrzygnięciu OBA zwalniają statki (migawka wznowiona, bez `_combatPause`, lot trwa) i są DWA rekordy bitew
//   T2  KONTROLA — format bez zmian w zwykłym przypadku: pierwsze starcie `encounter_<rok>_player_<imperium>`, bitwa
//       `battle_ds_…` (konsument `battle_announce_once` czyta przedrostek)
//   T3  starcie zakończone (rekord zapisany), następne tej samej pary w tym samym 0,01 roku — nowy identyfikator, rekord
//       pierwszej bitwy NIE nadpisany
//   T4  KONTROLA — starcia w różnych oknach 0,01 roku: identyfikatory bazowe, bez przyrostka (jak dotąd)
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import gameState               from '../../core/GameState.js';
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
const SYS = 'sys_t';
const EMP = 'emp_001';
let vMgr, mos, dscs;

function scene(year = 100) {
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: year }, activeSystemId: SYS };
  gameState.set('battles', {}, 'keeper_reset');
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_far', type: 'planet', name: 'Far', systemId: SYS, x: 12 * AU, y: 0, radius: 4, mass: 1, visual: { radius: 4 } });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: SYS, x: -12 * AU, y: 0, radius: 4, mass: 1, visual: { radius: 4 } });
  vMgr = new VesselManager(); mos = new MovementOrderSystem(vMgr);
  dscs = new DeepSpaceCombatSystem(vMgr); new VesselCombatSystem(vMgr);
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: EntityManager.get('p_home'), vesselManager: vMgr, movementOrderSystem: mos,
    deepSpaceCombatSystem: dscs, enemyAttackHandler: new EnemyAttackHandler(),
    empireRegistry: { get: (id) => ({ id, name: 'Liga' }), listAll: () => [{ id: EMP }] },
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} },
    intelSystem: { getVesselContact: () => ({ quality: 'contact' }), getLevel: () => 'contact', isAtLeast: () => true },
    debug: { combatTrace: false },
  });
}
function ship({ xAU, yAU = 0, name, empire = null }) {
  const v = vMgr.createAndRegister('hull_frigate', 'p_home', { name, modules: ['weapon_laser', 'engine_ion'] });
  v.position.x = xAU * AU; v.position.y = yAU * AU; v.position.state = 'orbiting'; v.position.dockedAt = null;
  v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.speedAU = 1.2; v.systemId = SYS;
  if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; v.serviceState = 'active'; }
  return v;
}
/** Para gracz ↔ AI w punkcie (xAU, yAU); gracz z rozkazem moveToPoint (pauza bojowa robi migawkę). */
function pair(xAU, yAU, tag) {
  const p = ship({ xAU, yAU, name: `P${tag}` });
  const a = ship({ xAU: xAU + 0.05, yAU, name: `A${tag}`, empire: EMP });
  mos.issueOrder(p.id, { type: 'moveToPoint', targetBodyId: 'p_far', targetPoint: { x: 12 * AU, y: 0 }, issuedBy: 'keeper' });
  return { p, a };
}
const encOf = (v) => dscs._findActiveEncounterContaining(v.id);
/** Rozstrzygnij wszystkie trwające starcia: gracz wygrywa (strona B — wraki). */
function resolveAll() {
  for (const enc of dscs.listActive()) dscs._finalizeBattle(enc, 'A', null);
}
const released = (p) => !p._combatPause && !p._suspendedMission && p.mission?.type === 'move_to_point' && p.position.state === 'in_transit';
const battleIds = () => Object.keys(gameState.get('battles') ?? {});

// ═══ T1 — dwa starcia w tym samym 0,01 roku ═══════════════════════════════════════
header('T1  dwa starcia tej samej pary w tym samym 0,01 roku — dwa identyfikatory, oba zwalniają statki');
{
  scene();
  const one = pair(3, 0, '1');
  const two = pair(-3, 4, '2');
  dscs.handleCombatRangeEnter(one.p.id, one.a.id, false);
  window.KOSMOS.timeSystem.gameTime += 0.004;                        // to samo okno 0,01 roku
  dscs.handleCombatRangeEnter(two.p.id, two.a.id, false);
  const id1 = encOf(one.p)?.id ?? null, id2 = encOf(two.p)?.id ?? null;
  console.log(`     id1 ${id1} · id2 ${id2} · aktywnych ${dscs.listActive().length}`);
  assert(!!one.p._combatPause && !!two.p._combatPause, 'T1-0 KONTROLA: oba starcia powstały i zamroziły statki gracza (migawka misji)');
  assert(id1 && id2 && id1 !== id2 && dscs.listActive().length === 2, 'T1a dwa RÓŻNE identyfikatory, oba starcia aktywne');
  resolveAll();
  assert(released(one.p) && released(two.p), 'T1b po rozstrzygnięciu OBA starcia zwolniły statki (misja wznowiona, bez `_combatPause`)');
  assert(battleIds().length === 2, `T1c dwa rekordy bitew (${battleIds().join(', ')})`);
}

// ═══ T2 — kontrola formatu ═════════════════════════════════════════════════════════
header('T2  KONTROLA — format identyfikatora bez zmian w zwykłym przypadku');
{
  scene(100);
  const one = pair(3, 0, '1');
  dscs.handleCombatRangeEnter(one.p.id, one.a.id, false);
  const id = encOf(one.p)?.id ?? null;
  resolveAll();
  assert(id === `encounter_100_00_player_${EMP}` && battleIds()[0] === `battle_ds_100_00_player_${EMP}`,
    `T2 pierwsze starcie: ${id}, bitwa ${battleIds()[0]} (przedrostek battle_ds_ jak dotąd)`);
}

// ═══ T3 — po zakończeniu pierwszej bitwy ═══════════════════════════════════════════
header('T3  starcie zakończone, następne tej samej pary w tym samym 0,01 roku — rekord pierwszej bitwy NIE nadpisany');
{
  scene(100);
  const one = pair(3, 0, '1');
  dscs.handleCombatRangeEnter(one.p.id, one.a.id, false);
  resolveAll();
  const first = battleIds()[0];
  const rec1 = gameState.get(`battles.${first}`);
  const two = pair(-3, 4, '2');
  window.KOSMOS.timeSystem.gameTime += 0.003;
  dscs.handleCombatRangeEnter(two.p.id, two.a.id, false);
  const id2 = encOf(two.p)?.id ?? null;
  resolveAll();
  const ids = battleIds();
  assert(!!rec1 && id2 && id2 !== first.replace(/^battle_ds_/, 'encounter_'), `T3a nowe starcie ma nowy identyfikator (${id2})`);
  assert(ids.length === 2 && gameState.get(`battles.${first}`) === rec1, 'T3b rekord pierwszej bitwy nietknięty, są dwa rekordy');
}

// ═══ T4 — różne okna 0,01 roku ═════════════════════════════════════════════════════
header('T4  KONTROLA — starcia w różnych oknach 0,01 roku: identyfikatory bazowe');
{
  scene(100);
  const one = pair(3, 0, '1');
  dscs.handleCombatRangeEnter(one.p.id, one.a.id, false);
  const id1 = encOf(one.p)?.id;
  window.KOSMOS.timeSystem.gameTime = 100.02;
  const two = pair(-3, 4, '2');
  dscs.handleCombatRangeEnter(two.p.id, two.a.id, false);
  const id2 = encOf(two.p)?.id;
  assert(id1 === `encounter_100_00_player_${EMP}` && id2 === `encounter_100_02_player_${EMP}`, `T4 ${id1} · ${id2} (bez przyrostka)`);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
