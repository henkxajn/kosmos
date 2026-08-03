// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Gate 2 report (game-year milestone timeline)
// Uruchom: node src/testing/headless/balans-gate2-report.mjs [--class=GOOD_FE] [--seeds=5] [--gy=40]
// ───────────────────────────────────────────────────────────────
// Cel (exit gate Phase 1): game-year timeline działań bota + eyeball vs kotwice Filipa
//   (science ship ≈ yr1, POP deficit ≈ yr2, ~3 droidy do yr6). NIE rygorystyczne (to Phase 3).
// WSZYSTKO w GAME-YEARS (gameTime), nie civYears (HARD-CONSTRAINT #3).
// Harvest z probe: kształt pętli (civDeltaYears=1/tick, gameTime += 1/12) + time-series first-occurrence.
// ═══════════════════════════════════════════════════════════════

import './env.js';
import { reseed } from './env.js';
import EventBus from '../../core/EventBus.js';
import { GameCore } from './GameCore.js';
import { Ticker } from './Ticker.js';
import { ActionCatalog } from '../actions/ActionCatalog.js';
import ActionAdapter from '../actions/ActionAdapter.js';
import { RuleBot } from '../bots/RuleBot.js';
import { canColonize, canDoRecon } from '../../entities/Vessel.js';

function arg(name, def) {
  const a = process.argv.find(s => s.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
}
const PLANET_CLASS = arg('class', 'GOOD_FE');
const N_SEEDS = parseInt(arg('seeds', '5'));
const TARGET_GY = parseFloat(arg('gy', '40'));
const SEED_PREFIX = arg('seed', 'balans-gate1');

// Milestone (game-year first-occurrence) per gra.
function runOne(seed) {
  reseed(seed);
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization_boosted', solo: true, planetClass: PLANET_CLASS });
  const K = window.KOSMOS;
  const home = core.colonyManager.getColony(K.homePlanet.id);
  const catalog = new ActionCatalog({ colonyManager: core.colonyManager, techSystem: core.techSystem, resourceSystem: core.resourceSystem, buildingSystem: core.buildingSystem, vesselManager: core.vesselManager, civSystem: core.civSystem, starSystemManager: core.starSystemManager });
  const bot = new RuleBot();
  const gy = () => K.timeSystem.gameTime;

  const M = {};   // milestone → game-year first-occurrence
  const mark = (k) => { if (M[k] == null) M[k] = gy(); };
  const countB = (id) => { let n = 0; for (const [, e] of home.buildingSystem._active) if ((e.building?.id ?? e.buildingId) === id) n++; return n; };
  const syntheticTotal = () => {
    // droidy = syntetyczne etaty na macierzystej (Population 2.0 Faza 4 automation_droid)
    let n = 0;
    for (const t of (home.civSystem?.constructor?.STRATA_TYPES ?? ['laborer','miner','worker','scientist','merchant','engineer','bureaucrat'])) {
      n += home.buildingSystem?.getSyntheticJobs?.(t) ?? 0;
    }
    return n;
  };

  EventBus.on('vessel:created', ({ vessel }) => {
    if (canDoRecon(vessel)) mark('scienceShip');
    if (canColonize(vessel)) mark('colonizer');
  });
  EventBus.on('colony:founded', ({ colony }) => { if (colony?.planetId !== home.planetId) mark('secondColony'); });

  let droidsByGy6 = 0;
  const ticker = new Ticker(core.timeSystem);
  ticker.onCivYear(() => {
    for (let d = 0; d < 4; d++) { let a; try { a = bot.decideAction({ homeAlive: true }, catalog); } catch { continue; } if (a) { try { ActionAdapter.execute(a); } catch {} } }
  });
  ticker.onTick(() => {
    if (M.firstFactory == null && countB('factory') > 0) mark('firstFactory');
    // POP deficit = pierwszy rok, gdy home ma NIEobsadzone etaty przy zerowym bezrobociu (POP-limited).
    if (M.popDeficit == null) {
      const civ = home.civSystem;
      const unemp = civ?._unemployed ?? 0;
      let unfilled = 0;
      for (const r of (civ?.getWorkforceBreakdown?.() ?? [])) unfilled += Math.max(0, r.jobs - r.workers - r.synthetic);
      if (unemp < 1 && unfilled > 0.5) mark('popDeficit');
    }
    if (gy() <= 6.0) droidsByGy6 = syntheticTotal();
  });
  ticker.run(TARGET_GY * 12, { tickSize: 1.0 });

  return {
    seed, M, droidsByGy6,
    finalColonies: core.colonyManager.getPlayerColonies().length,
    finalPop: home.civSystem.population,
    finalGy: gy(),
    crashed: ticker._crashed,
  };
}

// ── Run seed panel ──────────────────────────────────────────────
console.log(`\n═══ BALANS Gate 2 report — class=${PLANET_CLASS}, seeds=${N_SEEDS}, target=${TARGET_GY}gy ═══\n`);
const results = [];
for (let i = 1; i <= N_SEEDS; i++) {
  const r = runOne(`${SEED_PREFIX}_${i}`);
  results.push(r);
}

const fmt = (v) => v == null ? '  —  ' : `${v.toFixed(1)}`.padStart(5);
console.log('seed        | sciShip | colonizr | 2ndCol | factory | popDefic | droids≤6 | colonies | pop  | crash');
console.log('------------+---------+----------+--------+---------+----------+----------+----------+------+------');
for (const r of results) {
  console.log(`${String(r.seed).padEnd(11)} | ${fmt(r.M.scienceShip)}   | ${fmt(r.M.colonizer)}    | ${fmt(r.M.secondColony)}  | ${fmt(r.M.firstFactory)}   | ${fmt(r.M.popDeficit)}    | ${String(r.droidsByGy6).padStart(6)}   | ${String(r.finalColonies).padStart(6)}   | ${String(r.finalPop).padStart(4)} | ${r.crashed ? 'YES' : 'no'}`);
}

const median = (arr) => { const v = arr.filter(x => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
console.log('\n── MEDIAN game-year first-occurrence ──');
console.log(`  science ship:  ${fmt(median(results.map(r => r.M.scienceShip)))} gy   (anchor ≈ yr 1)`);
console.log(`  POP deficit:   ${fmt(median(results.map(r => r.M.popDeficit)))} gy   (anchor ≈ yr 2)`);
console.log(`  colonizer:     ${fmt(median(results.map(r => r.M.colonizer)))} gy`);
console.log(`  2nd colony:    ${fmt(median(results.map(r => r.M.secondColony)))} gy`);
console.log(`  first factory: ${fmt(median(results.map(r => r.M.firstFactory)))} gy`);
console.log(`  droids by gy6: ${median(results.map(r => r.droidsByGy6))}   (anchor ≈ 3)`);
console.log(`  crashes:       ${results.filter(r => r.crashed).length}/${results.length}`);
console.log(`  colonized:     ${results.filter(r => r.finalColonies >= 2).length}/${results.length} runs founded a 2nd colony`);
