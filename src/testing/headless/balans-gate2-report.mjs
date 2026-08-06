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
import EntityManager from '../../core/EntityManager.js';
import { GameCore, HEADLESS_GALAXY_SEED } from './GameCore.js';
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
  // GALAXY_SEED (Decyzja 3): galaktyka przypięta jawnie — patrz balans-driver.mjs.
  core.boot({ quiet: true, scenario: 'civilization_boosted', solo: true, planetClass: PLANET_CLASS,
              galaxySeed: HEADLESS_GALAXY_SEED });
  const K = window.KOSMOS;
  const home = core.colonyManager.getColony(K.homePlanet.id);
  const catalog = new ActionCatalog({ colonyManager: core.colonyManager, techSystem: core.techSystem, resourceSystem: core.resourceSystem, buildingSystem: core.buildingSystem, vesselManager: core.vesselManager, civSystem: core.civSystem, starSystemManager: core.starSystemManager });
  const bot = new RuleBot();
  const gy = () => K.timeSystem.gameTime;

  const M = {};   // milestone → game-year first-occurrence
  const mark = (k) => { if (M[k] == null) M[k] = gy(); };
  const countB = (id) => { let n = 0; for (const [, e] of home.buildingSystem._active) if ((e.building?.id ?? e.buildingId) === id) n++; return n; };
  const syntheticTotal = () => {
    // droidy ZAINSTALOWANE = syntetyczne etaty na macierzystej (Population 2.0 Faza 4 automation_droid)
    let n = 0;
    for (const t of (home.civSystem?.constructor?.STRATA_TYPES ?? ['laborer','miner','worker','scientist','merchant','engineer','bureaucrat'])) {
      n += home.buildingSystem?.getSyntheticJobs?.(t) ?? 0;
    }
    return n;
  };
  // Placówki GRACZA (nie AI). productive = ma dodatni bilans energii (dostała autonomous_solar → mine
  // produkuje; sama mine = brownout -4.5, produkuje 0). Liczone z żywych kolonii-placówek.
  const playerOutposts = () => (core.colonyManager.getAllColonies?.() ?? []).filter(c => c.isOutpost && !c.ownerEmpireId);
  const productiveOutposts = () => playerOutposts().filter(op => (op.resourceSystem?.energy?.balance ?? 0) > 0);

  EventBus.on('vessel:created', ({ vessel }) => {
    if (canDoRecon(vessel)) mark('scienceShip');
    if (canColonize(vessel)) mark('colonizer');
  });
  EventBus.on('colony:founded', ({ colony }) => { if (colony?.planetId !== home.planetId) mark('secondColony'); });
  EventBus.on('outpost:founded', ({ colony }) => { if (colony && !colony.ownerEmpireId) mark('firstOutpost'); });
  // Droidy WYPRODUKOWANE (factory:droidOrderCompleted) — honest droid count (doktryna: droid konsumowany
  // przez placówkę, NIE instalowany → syntheticTotal=0; produkcja to prawdziwy sygnał popytu na droidy).
  let droidsProduced = 0, droidsProducedByGy6 = 0;
  EventBus.on('factory:droidOrderCompleted', ({ commodityId, qty }) => {
    if (commodityId === 'automation_droid') { droidsProduced += (qty ?? 1); if (gy() <= 6.0) droidsProducedByGy6 = droidsProduced; }
  });

  let droidsByGy6 = 0;          // ZAINSTALOWANE do yr6
  let shipRareCount = 0;        // liczba jednorazowych transportów rzadkich surowców outpost→home
  let minEnergyMid = Infinity;  // najgłębszy dołek bilansu energii PO wczesnym rozruchu (gy≥5) — czy energia „trzyma"
  const ticker = new Ticker(core.timeSystem);
  ticker.onCivYear(() => {
    for (let d = 0; d < 4; d++) {
      let a; try { a = bot.decideAction({ homeAlive: true }, catalog); } catch { continue; }
      if (a) {
        if (typeof a._tag === 'string' && a._tag.startsWith('ship_rare')) { shipRareCount++; mark('firstShipRare'); }
        try { ActionAdapter.execute(a); } catch {}
      }
    }
  });
  ticker.onTick(() => {
    if (M.firstFactory == null && countB('factory') > 0) mark('firstFactory');
    if (M.firstProductiveOutpost == null && productiveOutposts().length > 0) mark('firstProductiveOutpost');
    // POP deficit = pierwszy rok, gdy home ma NIEobsadzone etaty przy zerowym bezrobociu (POP-limited).
    if (M.popDeficit == null) {
      const civ = home.civSystem;
      const unemp = civ?._unemployed ?? 0;
      let unfilled = 0;
      for (const r of (civ?.getWorkforceBreakdown?.() ?? [])) unfilled += Math.max(0, r.jobs - r.workers - r.synthetic);
      if (unemp < 1 && unfilled > 0.5) mark('popDeficit');
    }
    if (gy() <= 6.0) droidsByGy6 = syntheticTotal();
    // Energia: najgłębszy dołek bilansu PO rozruchu (gy≥5 pomija startowy dip zanim solar dojdzie).
    if (gy() >= 5.0) minEnergyMid = Math.min(minEnergyMid, home.resourceSystem.energy?.balance ?? 0);
  });
  ticker.run(TARGET_GY * 12, { tickSize: 1.0 });

  // Scout reach: ile ciał układu zbadano (vs ~7-11 przed Task A/B) + zapas Fe (kolaps mid-game blokuje
  // recon dispatch [RECON_COST Fe:10] I budowę cargo → downstream gate outpost formation).
  const unex = core.missionSystem.getUnexploredCount?.() ?? { total: 0 };
  const totalBodies = EntityManager.getAll().filter(e => ['planet','moon','planetoid'].includes(e.type) && e !== home.planet).length;
  return {
    seed, M, droidsByGy6, droidsProduced, droidsProducedByGy6, shipRareCount,
    finalColonies: core.colonyManager.getPlayerColonies().length,
    finalOutposts: playerOutposts().length,
    finalProductiveOutposts: productiveOutposts().length,
    finalPop: home.civSystem.population,
    finalCredits: Math.floor(home.credits ?? 0),
    finalFe: Math.floor(home.resourceSystem.getAmount('Fe') ?? 0),
    finalEnergy: Math.round(home.resourceSystem.energy?.balance ?? 0),
    minEnergyMid: Number.isFinite(minEnergyMid) ? Math.round(minEnergyMid) : null,
    finalSolar: countB('solar_farm'),
    finalCoal: countB('coal_plant'),
    explored: Math.max(0, totalBodies - (unex.total ?? 0)),
    totalBodies,
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
console.log('seed        | sciShip | 1stOutp | prodOut | 1stShip | shipN | outp | prodO | reach   | droidMade | colon | pop  | Kr   | Fe   | eBal | minE | slr | crash');
console.log('------------+---------+---------+---------+---------+-------+------+-------+---------+-----------+-------+------+------+------+------+------+-----+------');
for (const r of results) {
  console.log(
    `${String(r.seed).padEnd(11)} | ${fmt(r.M.scienceShip)}   | ${fmt(r.M.firstOutpost)}   | ${fmt(r.M.firstProductiveOutpost)}   | ${fmt(r.M.firstShipRare)}   | ${String(r.shipRareCount).padStart(5)} | ${String(r.finalOutposts).padStart(4)} | ${String(r.finalProductiveOutposts).padStart(5)} | ${String(r.explored+'/'+r.totalBodies).padStart(7)} | ${String(r.droidsProduced).padStart(9)} | ${String(r.finalColonies).padStart(5)} | ${String(r.finalPop).padStart(4)} | ${String(r.finalCredits).padStart(4)} | ${String(r.finalFe).padStart(4)} | ${String(r.finalEnergy).padStart(4)} | ${String(r.minEnergyMid).padStart(4)} | ${String(r.finalSolar + (r.finalCoal ? '+'+r.finalCoal : '')).padStart(3)} | ${r.crashed ? 'YES' : 'no'}`);
}

const median = (arr) => { const v = arr.filter(x => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const cnt = (pred) => results.filter(pred).length;
console.log(`\n── ${PLANET_CLASS} game-year first-occurrence ──`);
console.log(`  science ship:        ${fmt(median(results.map(r => r.M.scienceShip)))} gy   (anchor ≈ yr 1)`);
console.log(`  first outpost:       ${fmt(median(results.map(r => r.M.firstOutpost)))} gy`);
console.log(`  first PRODUCTIVE outpost (has solar → mining): ${fmt(median(results.map(r => r.M.firstProductiveOutpost)))} gy`);
console.log(`  first shipping run:  ${fmt(median(results.map(r => r.M.firstShipRare)))} gy`);
console.log(`  colonizer:           ${fmt(median(results.map(r => r.M.colonizer)))} gy`);
console.log(`  2nd colony:          ${fmt(median(results.map(r => r.M.secondColony)))} gy`);
console.log(`  POP deficit:         ${fmt(median(results.map(r => r.M.popDeficit)))} gy   (anchor ≈ yr 2)`);
console.log('\n── LOOP RELIABILITY across seeds ──');
console.log(`  founded ≥1 outpost:            ${cnt(r => r.finalOutposts >= 1)}/${results.length}`);
console.log(`  ≥1 PRODUCTIVE outpost (solar): ${cnt(r => r.finalProductiveOutposts >= 1)}/${results.length}`);
console.log(`  shipping leg fired (≥1 run):   ${cnt(r => r.shipRareCount > 0)}/${results.length}`);
console.log(`  founded a 2nd (POP) colony:    ${cnt(r => r.finalColonies >= 2)}/${results.length}`);
console.log('\n── ENERGY (take-4 Task 1 — demand-aware energy scaling) ──');
console.log(`  final energyBalance (median):  ${median(results.map(r => r.finalEnergy))}   (cel: trzyma ≥ 0, nie głęboko ujemny)`);
console.log(`  min energyBalance mid-run (median gy≥5): ${median(results.map(r => r.minEnergyMid))}   (najgłębszy dołek po rozruchu)`);
console.log(`  energy HELD (final ≥ 0):       ${cnt(r => r.finalEnergy >= 0)}/${results.length}`);
console.log(`  never deeply negative (min ≥ -10): ${cnt(r => (r.minEnergyMid ?? -999) >= -10)}/${results.length}`);
console.log(`  solar built (median):          ${median(results.map(r => r.finalSolar))}   coal (median): ${median(results.map(r => r.finalCoal))}`);
console.log('\n── SCOUT REACH + RESOURCES (Task A/B target + downstream gate) ──');
console.log(`  bodies explored (median):   ${median(results.map(r => r.explored))} / ${median(results.map(r => r.totalBodies))}   (vs ~7-11 pre-A/B)`);
console.log(`  final Fe (median):          ${median(results.map(r => r.finalFe))}   (⚠ Fe collapse → recon dispatch Fe:10 + cargo build blocked)`);
console.log('\n── DROIDS (measured, untuned — POP-glut carried finding) ──');
console.log(`  installed by yr6 (median):  ${median(results.map(r => r.droidsByGy6))}   (anchor ≈ 3; expected 0 while POP-glut holds)`);
console.log(`  produced total (median):    ${median(results.map(r => r.droidsProduced))}`);
console.log(`\n  crashes: ${cnt(r => r.crashed)}/${results.length}   final Kr (median): ${median(results.map(r => r.finalCredits))}`);
