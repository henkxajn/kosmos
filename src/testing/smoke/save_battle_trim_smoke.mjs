// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// save_battle_trim_smoke — KEEPER dodatku 3 kroku #663 (propozycja M1, Finding 691): przycięcie rekordów bitew w zapisie.
//   Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §4 «M1 — delivered» (propozycja przycięcia) i §4 «#663».
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Po M1 rekord bitwy 10 na 10 niesie pełną oś rund (35–40 tys. znaków), a zapis trzyma 50 rekordów (`GameState.serialize`)
//   — do tego bitwa DSCS w wojnie była zapisywana DWA RAZY (rekord producenta + rekord wojenny z tą samą osią rund, Finding 156).
// Krok: oś rund zostaje tylko w `BATTLE_TIMELINE_KEEP` (10) najnowszych rekordach; starsze idą do zapisu jako streszczenie
//   (`timeline: []`, `timelineTrimmed: true`, reszta pól bez zmian); wojna dopisuje rekord producenta zamiast tworzyć drugi
//   (pin wykonaniowy na prawdziwej bitwie — `battle_announce_once_smoke` T6). Zapis v101 bez migracji.
// CO PINUJE:
//   S1 serialize: 60 rekordów → 50 najnowszych; 10 najnowszych z pełną osią rund (ta sama referencja), 40 starszych jako
//      streszczenie z KAŻDYM polem poza osią rund; rekordy w pamięci nietknięte; KONTROLA — mniej niż 10 rekordów: bez zmian
//   S2 zapis → wczytanie → zapis: te same rekordy, streszczenia zostają streszczeniami, wynik idempotentny (te same znaki)
//   S3 stary zapis (50 pełnych rekordów, w tym duplikaty wojenne bez pola `timelineTrimmed`) wczytuje się, a `war.battles`
//      wskazuje rekordy (także duplikat wojenny); przy następnym zapisie przechodzi przycięcie
//   S4 pomiar najgorszego przypadku z PRAWDZIWEJ bitwy 10 na 10 (stager, ziarno 1): sekcja bitew zapisu przed i po
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { reseed }                from '../headless/env.js';
import EventBus                  from '../../core/EventBus.js';
import EntityManager             from '../../core/EntityManager.js';
import gameState                 from '../../core/GameState.js';
import * as GS                   from '../../core/GameState.js';
import { GAME_CONFIG }           from '../../config/GameConfig.js';
import { TimeSystem }            from '../../systems/TimeSystem.js';
import { VesselManager }         from '../../systems/VesselManager.js';
import { MovementOrderSystem }   from '../../systems/MovementOrderSystem.js';
import { ProximitySystem }       from '../../systems/ProximitySystem.js';
import { VesselCombatSystem }    from '../../systems/VesselCombatSystem.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { EnemyAttackHandler }    from '../../systems/EnemyAttackHandler.js';
import { OrbitalSpaceSystem }    from '../../systems/OrbitalSpaceSystem.js';
import { setNextVesselId }       from '../../entities/Vessel.js';
import { cvBattleDebugHelpers }  from '../../debug/CvBattleStager.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const block = (title, fn) => { header(title); try { fn(); } catch (e) { assert(false, `${title} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };

const KEEP = GS.BATTLE_TIMELINE_KEEP ?? 10;
const MAX  = GS.MAX_BATTLE_RECORDS ?? 50;
const kchars = (n) => `${(n / 1000).toFixed(1)} tys.`;

/** Rekord bitwy w kształcie DSCS (oś rund z `rounds` rund po `perRound` strzałów). */
function record(id, year, { rounds = 6, perRound = 4, warId = null } = {}) {
  const timeline = [];
  for (let r = 1; r <= rounds; r++) {
    timeline.push({ round: r, distanceAU: 0.1, events: Array.from({ length: perRound }, (_, i) => ({
      attacker: `v_${i}`, target: `v_${i + 10}`, weapon: 'weapon_laser', category: 'short', hit: i % 2 === 0, damage: 4.5, blockedByShield: 0,
      aPos: { x: 100 + i, y: 50 }, tPos: { x: 120 + i, y: 50 } })) });
  }
  return { id, warId, year, location: { systemId: 'sys_t', planetId: null, point: { x: 1, y: 2 } }, winner: 'A', retreated: null,
    seed: 7, timeline, lossesA: 1, lossesB: 3, turns: rounds, endReason: 'destroyed', finalHPA: 10, finalHPB: 0,
    participantA: { type: 'vessel_group', empireId: 'player', vesselIds: ['v_0', 'v_1'], count: 2, label: 'A' },
    participantB: { type: 'vessel_group', empireId: 'emp_t', vesselIds: ['v_10', 'v_11'], count: 2, label: 'B' } };
}
const summaryOf = (r) => { const { timeline, timelineTrimmed, ...rest } = r; return JSON.stringify(rest); };

// ═══ S1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('S1 — serialize: oś rund tylko w 10 najnowszych, starsze jako streszczenie', () => {
  gameState.reset();
  for (let i = 1; i <= 60; i++) gameState.set(`battles.b_${String(i).padStart(2, '0')}`, record(`b_${String(i).padStart(2, '0')}`, 100 + i));
  const live = gameState.get('battles');
  const out = gameState.serialize().battles;
  const ids = Object.keys(out).sort();
  const newest = ids.filter(id => Number(id.slice(2)) > 50);
  const older = ids.filter(id => Number(id.slice(2)) <= 50);
  assert(GS.BATTLE_TIMELINE_KEEP === 10 && GS.MAX_BATTLE_RECORDS === 50, `S1-0 stałe: ${GS.MAX_BATTLE_RECORDS} rekordów, oś rund w ${GS.BATTLE_TIMELINE_KEEP}`);
  assert(ids.length === MAX && ids[0] === 'b_11', `S1a 60 rekordów → ${ids.length} najnowszych (najstarszy zostawiony ${ids[0]})`);
  assert(newest.length === KEEP && newest.every(id => out[id] === live[id] && out[id].timeline.length === 6),
    `S1b ${newest.length} najnowszych z pełną osią rund (ta sama referencja co w pamięci)`);
  assert(older.length === MAX - KEEP && older.every(id => out[id].timeline.length === 0 && out[id].timelineTrimmed === true && summaryOf(out[id]) === summaryOf(live[id])),
    `S1c ${older.length} starszych jako streszczenie: \`timeline: []\`, \`timelineTrimmed\`, każde inne pole bez zmian`);
  assert(Object.values(live).every(r => r.timeline.length === 6 && r.timelineTrimmed === undefined),
    'S1d rekordy w pamięci nietknięte (pełna oś rund, bez znacznika)');
  gameState.reset();
  for (let i = 1; i <= 7; i++) gameState.set(`battles.c_${i}`, record(`c_${i}`, 200 + i));
  const few = gameState.serialize().battles;
  assert(Object.values(few).every(r => r.timeline.length === 6 && r.timelineTrimmed === undefined), 'S1e KONTROLA: 7 rekordów — wszystkie z osią rund (bez zmian)');
});

// ═══ S2 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('S2 — zapis → wczytanie → zapis: idempotentnie', () => {
  gameState.reset();
  for (let i = 1; i <= 60; i++) gameState.set(`battles.b_${String(i).padStart(2, '0')}`, record(`b_${String(i).padStart(2, '0')}`, 100 + i, { warId: i % 3 ? null : 'war_x' }));
  const json1 = JSON.stringify(gameState.serialize());
  gameState.restore(JSON.parse(json1));
  const back = gameState.get('battles');
  const trimmed = Object.values(back).filter(r => r.timelineTrimmed === true).length;
  const json2 = JSON.stringify(gameState.serialize());
  assert(Object.keys(back).length === MAX && trimmed === MAX - KEEP, `S2a po wczytaniu ${Object.keys(back).length} rekordów, ${trimmed} streszczeń`);
  assert(json2 === json1, `S2b drugi zapis = pierwszy (${json1.length} znaków) — przycięcie idempotentne`);
  assert(back.b_60?.timeline?.length === 6 && back.b_20?.timeline?.length === 0 && back.b_20?.winner === 'A' && back.b_20?.lossesB === 3 && back.b_20?.endReason === 'destroyed',
    'S2c najnowszy z osią rund; starszy — streszczenie z wynikiem, stratami i `endReason`');
});

// ═══ S3 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('S3 — stary zapis (pełne osie rund, duplikaty wojenne) wczytuje się i przechodzi przycięcie', () => {
  const battles = {}, warBattles = [];
  for (let i = 1; i <= 25; i++) {
    const ds = record(`battle_ds_${i}`, 300 + i);
    battles[ds.id] = ds;
    const wid = `battle_${300 + i}_war_x_${i}`;
    battles[wid] = { ...record(wid, 300 + i, { warId: 'war_x' }), timeline: ds.timeline };   // dawny duplikat: ta sama oś rund
    warBattles.push(wid);
  }
  const oldSave = JSON.parse(JSON.stringify({ ...gameState.snapshot(), battles, wars: { war_x: { id: 'war_x', active: true, battles: warBattles } } }));
  let threw = null;
  try { gameState.restore(oldSave); } catch (e) { threw = e; }
  const back = gameState.get('battles');
  const war = gameState.get('wars.war_x');
  assert(!threw && Object.keys(back).length === 50 && war?.battles?.every(id => !!back[id]),
    `S3a stary zapis wczytany (${Object.keys(back).length} rekordów), wszystkie bitwy wojny odczytywalne (${war?.battles?.length})`);
  const out = gameState.serialize().battles;
  const full = Object.values(out).filter(r => r.timeline.length > 0).length;
  assert(full === KEEP && Object.values(out).every(r => r.winner === 'A'), `S3b przy następnym zapisie oś rund w ${full} najnowszych, wynik w każdym`);
});

// ═══ S4 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// Świat i stager jak `m1_battle_end_smoke` (prawdziwy DSCS) — jedna bitwa 10 na 10, ziarno 1.
const AU = GAME_CONFIG.AU_TO_PX, SYS = 'sys_t', EMP = 'emp_t';
const clock = { now: 1e7 };
performance.now = () => clock.now;
function realBattleRecord() {
  reseed('save-battle-trim');
  EventBus.clear(); EntityManager.clear(); gameState.reset();
  global.window = global.window ?? {};
  clock.now = 1e7;
  setNextVesselId(1);
  const ts = new TimeSystem(); ts.gameTime = 100.00002; ts.multiplierIndex = 1;
  window.KOSMOS = { timeSystem: ts, activeSystemId: SYS };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: SYS, x: -4 * AU, y: 0, radius: 6, mass: 1, visual: { radius: 6 } });
  EntityManager.add({ id: 'p_rock', type: 'planet', name: 'Skala', systemId: SYS, x: 3 * AU, y: 0, radius: 6, mass: 1, visual: { radius: 6 } });
  const vm = new VesselManager(); const mos = new MovementOrderSystem(vm); const prox = new ProximitySystem(vm);
  const dscs = new DeepSpaceCombatSystem(vm); new VesselCombatSystem(vm); const eah = new EnemyAttackHandler(); const oss = new OrbitalSpaceSystem();
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {}, fleet: [] }];
  const empires = [{ id: EMP, name: 'Testowe Imperium' }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: EntityManager.get('p_home'), vesselManager: vm, movementOrderSystem: mos, gameState,
    proximitySystem: prox, deepSpaceCombatSystem: dscs, enemyAttackHandler: eah, orbitalSpaceSystem: oss, entityManager: EntityManager,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} },
    intelSystem: { getVesselContact: () => ({ quality: 'unknown' }), getLevel: () => 'unknown', isAtLeast: () => false },
    empireRegistry: { listAll: () => empires, get: (id) => empires.find(e => e.id === id) ?? null },
    debug: { combatTrace: false },
  });
  let rec = null;
  EventBus.on('battle:resolved', ({ result }) => { if (result?.id?.startsWith?.('battle_ds_')) rec = result; });
  const st = cvBattleDebugHelpers({ getRenderer: () => null, getSaveSystem: () => ({ _autosaveInterval: 1 }) }).cvBattle({ seed: 1, nA: 10, nB: 10 });
  if (!st?.ok) throw new Error('cvBattle: ' + JSON.stringify(st));
  ts.play();
  for (let n = 0; n < 200000 && !rec; n++) { clock.now += 16; ts.update(16); }
  return rec;
}
block('S4 — pomiar najgorszego przypadku: 50 rekordów prawdziwej bitwy 10 na 10', () => {
  const real = realBattleRecord();
  const one = JSON.stringify(real).length;
  const summary = JSON.stringify({ ...real, timeline: [], timelineTrimmed: true }).length;
  console.log(`     prawdziwa bitwa 10 na 10 (ziarno 1): ${real?.turns} rund, rekord ${kchars(one)} znaków, streszczenie ${kchars(summary)}`);
  // PRZED: każdy z 50 rekordów z pełną osią rund (stare `serialize`; w wojnie połowa to duplikaty tej samej osi — ten sam rozmiar).
  const before = MAX * one;
  // PO: prawdziwe `serialize` na 50 rekordach (różne lata i id), w pamięci każdy z pełną osią rund.
  gameState.reset();
  for (let i = 1; i <= MAX; i++) gameState.set(`battles.battle_ds_${i}`, { ...real, id: `battle_ds_${i}`, year: 100 + i });
  const after = JSON.stringify(gameState.serialize().battles).length;
  console.log(`     sekcja bitew zapisu: przed ${kchars(before)} znaków → po ${kchars(after)} (−${kchars(before - after)}, ${(100 * after / before).toFixed(0)} %)`);
  assert(real?.turns > 20 && one > 20000, `S4-0 KONTROLA: rekord prawdziwej bitwy 10 na 10 jest duży (${real?.turns} rund, ${kchars(one)} znaków)`);
  assert(after < 0.3 * before, `S4a najgorszy przypadek po przycięciu < 30 % (przed ${kchars(before)}, po ${kchars(after)})`);
});

console.log(`\n═══ save_battle_trim_smoke: ${pass} PASS / ${fail} FAIL ═══`);
if (fail > 0) process.exit(1);
