// Population 2.0 (Faza 3) — ekonomia: płace, podatek na zatrudnionych, mnożnik handlu,
// bilans, staffing-scaled energy. Uruchom: node src/testing/smoke/tmp_pop3_economy_smoke.mjs
//
// Pokrycie (plan §Testy a–e):
//   (a) inwariant: Δkredytów = Σpodatek − Σwypłaconych płac (z floor przy 0, bez fantomów)
//   (b) podatek liczy TYLKO zatrudnionych (bezrobotni + syntetyki = 0); zablokowani PŁACĄ (trzymają etaty)
//   (c) mnożnik handlu: 0 przemysłu → ×1.0, sam przemysł → ×1.5
//   (d) energia: 20% standby dla nieobsadzonego, pełny pobór przy pełnej obsadzie, autonomiczne bez zmian
//   (e) AI 20 lat headless: kredyty nie schodzą < 0, kolonia przeżywa (brak death-spirali)

import '../headless/env.js'; // MUST be first
import EventBus from '../../core/EventBus.js';
import { ResourceSystem } from '../../systems/ResourceSystem.js';
import { CivilizationSystem } from '../../systems/CivilizationSystem.js';
import { BuildingSystem } from '../../systems/BuildingSystem.js';
import { FactorySystem } from '../../systems/FactorySystem.js';
import { TechSystem } from '../../systems/TechSystem.js';
import { HexGrid } from '../../map/HexGrid.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { K_TRADE } from '../../data/PopulationData.js';

window.KOSMOS = { civMode: true, timeSystem: { gameTime: 0 } };

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

function mockBSys(jobs = {}, synth = {}) {
  return {
    getSlotDemand: (t) => jobs[t] ?? 0, getSyntheticJobs: (t) => synth[t] ?? 0,
    getMineEfficiency: () => 0.5, getFactoryOutputRatio: () => 0.5, getAdvancedBuildingsUptime: () => 0.5,
  };
}
function freshCiv(jobs = {}, synth = {}) {
  const civ = new CivilizationSystem({}, null, { id: 'e', atmosphere: 'breathable' });
  for (const s of Object.values(civ.strata)) s.count = 0;
  civ._unemployed = 0; civ.buildingSystem = mockBSys(jobs, synth);
  return civ;
}

// ── (a) Inwariant kredytów: Δ = Σpodatek − Σpłac (floor przy 0, bez fantomów) ─
console.log('--- (a) Inwariant: Δkredytów = Σpodatek − Σwypłaconych płac ---');
{
  const cm = new ColonyManager(null); cm._taxRate = 0.08;
  // Kolonia WYPŁACALNA: employed=20, prosperity=50 → podatek roczny floor(20×1.25×50×0.08)=100;
  // płace roczne = getTotalLaborCost. Dużo kredytów → brak floor.
  const col = {
    planetId: 'pa', isOutpost: false, ownerEmpireId: null, credits: 1_000_000,
    prosperitySystem: { prosperity: 50 },
    civSystem: { employed: 20, getTotalLaborCost: () => 40 },
  };
  cm._colonies.set('pa', col);

  let taxAdded = 0, wagesPaid = 0;
  const onTax = ({ totalIncome }) => { taxAdded += totalIncome; };
  const onCred = ({ delta }) => { if (delta < 0) wagesPaid += -delta; };
  EventBus.on('tax:collected', onTax);
  EventBus.on('trade:creditsChanged', onCred);
  const before = col.credits;
  for (let m = 0; m < 12; m++) cm._applyTaxes(1 / 12);   // 1 rok = 12 rat miesięcznych
  const delta = col.credits - before;
  EventBus.off('tax:collected', onTax); EventBus.off('trade:creditsChanged', onCred);
  console.log(`    Δ=${delta}  taxAdded=${taxAdded}  wagesPaid=${wagesPaid}`);
  ok('(a) Δkredytów === Σpodatek − Σpłac (konserwacja, wypłacalna)', delta === taxAdded - wagesPaid);
  ok('(a) podatek naliczony > 0', taxAdded > 0);
  ok('(a) płace wypłacone > 0', wagesPaid > 0);

  // FLOOR: kolonia NIEwypłacalna (prosperity=0 → podatek 0; mało kredytów) — płaci ile ma, potem 0.
  const cm2 = new ColonyManager(null); cm2._taxRate = 0.08;
  const poor = {
    planetId: 'pp', isOutpost: false, ownerEmpireId: null, credits: 5,
    prosperitySystem: { prosperity: 0 },   // podatek = 0
    civSystem: { employed: 20, getTotalLaborCost: () => 120 },   // płace ~10/miesiąc
  };
  cm2._colonies.set('pp', poor);
  let minCredits = poor.credits, paidPoor = 0;
  const onCred2 = ({ colonyId, delta }) => { if (colonyId === 'pp' && delta < 0) paidPoor += -delta; };
  EventBus.on('trade:creditsChanged', onCred2);
  for (let m = 0; m < 12; m++) { cm2._applyTaxes(1 / 12); minCredits = Math.min(minCredits, poor.credits); }
  EventBus.off('trade:creditsChanged', onCred2);
  console.log(`    poor: credits=${poor.credits} min=${minCredits} paid=${paidPoor} (startowe 5)`);
  ok('(a) floor: kredyty NIGDY < 0', minCredits >= 0 && poor.credits >= 0);
  ok('(a) floor: wypłacono DOKŁADNIE tyle ile było (5), reszta nie powstała nigdzie', paidPoor === 5);
}

// ── (b) Podatek: tylko zatrudnieni; zablokowani PŁACĄ; syntetyki = 0 ─────────
console.log('--- (b) Podatek na zatrudnionych; locked płaci; syntetyk = 0 ---');
{
  const cm = new ColonyManager(null); cm._taxRate = 0.08;
  const tax = (employed) => cm.calculateTaxIncome({ civSystem: { employed }, prosperitySystem: { prosperity: 50 } });
  ok('(b) podatek rośnie z zatrudnieniem (20 > 10)', tax(20) > tax(10));
  ok('(b) 0 zatrudnionych → podatek 0', tax(0) === 0);

  // Bezrobotni NIE liczą: employed=20 stała niezależnie od unemployed (calculateTaxIncome czyta employed).
  const civU = freshCiv({ laborer: 20 });
  civU.strata.laborer.count = 20; civU._unemployed = 15;   // 15 bezrobotnych OBOK
  ok('(b) employed = Σstrata (20), bezrobotni (15) NIE wliczeni', civU.employed === 20);
  ok('(b) podatek liczy 20 (nie 35)', cm.calculateTaxIncome({ civSystem: civU, prosperitySystem: { prosperity: 50 } }) === tax(20));

  // ZABLOKOWANI (crew/ekspedycje) SĄ zatrudnieni — trzymają etaty → płacą podatek I pobierają płacę.
  const civL = freshCiv({ laborer: 20 });
  civL.strata.laborer.count = 20; civL._lockedPerStrata = { laborer: 12 };   // 12 na misji, wciąż w stracie
  ok('(b) locked wliczeni w employed (20, nie 8)', civL.employed === 20);
  ok('(b) locked PŁACĄ podatek (tax > 0 mimo 12 zablokowanych)',
    cm.calculateTaxIncome({ civSystem: civL, prosperitySystem: { prosperity: 50 } }) > 0);
  ok('(b) locked POBIERAJĄ płacę (getTotalLaborCost liczy pełne 20 workers)', civL.getTotalLaborCost() > 0);
  ok('(b) locked: koszt płac == kolonia bez locka (workers = count)', civL.getTotalLaborCost() === civU.getTotalLaborCost());

  // SYNTETYKI: etaty obsadzone syntetykiem NIE mają workera → poza employed → nie płacą.
  const civS = freshCiv({ worker: 10 }, { worker: 6 });   // 10 etatów brutto, 6 syntetycznych → 4 human jobs
  civS._unemployed = 20;   // dużo ludzi
  civS._allocateWorkforce();   // obsadzi TYLKO 4 human jobs
  console.log(`    syntetyk: workers=${civS.strata.worker.count} employed=${civS.employed} grossJobs=10 synth=6`);
  ok('(b) syntetyk: obsada tylko human jobs (4), nie 10', civS.strata.worker.count === 4);
  ok('(b) syntetyk: employed (4) wyklucza etaty syntetyczne (6)', civS.employed === 4);
}

// ── (c) Mnożnik handlu: 0 przemysłu → ×1.0, sam przemysł → ×1.5 ──────────────
console.log('--- (c) Mnożnik handlu z udziału przemysłu ---');
{
  const ind = freshCiv(); ind.strata.laborer.count = 5; ind.strata.miner.count = 5; ind.strata.worker.count = 5;
  ok('(c) sam przemysł → share = 1.0', ind.getIndustryEmploymentShare() === 1);
  ok('(c) sam przemysł → mnożnik ×1.5', 1 + K_TRADE * ind.getIndustryEmploymentShare() === 1.5);

  const sci = freshCiv(); sci.strata.scientist.count = 10;
  ok('(c) zero przemysłu → share = 0', sci.getIndustryEmploymentShare() === 0);
  ok('(c) zero przemysłu → mnożnik ×1.0', 1 + K_TRADE * sci.getIndustryEmploymentShare() === 1.0);

  const mix = freshCiv(); mix.strata.laborer.count = 5; mix.strata.scientist.count = 5;
  ok('(c) 50/50 → share 0.5 → mnożnik ×1.25', Math.abs((1 + K_TRADE * mix.getIndustryEmploymentShare()) - 1.25) < 1e-9);

  const empty = freshCiv();
  ok('(c) brak zatrudnionych → share 0 (guard div/0)', empty.getIndustryEmploymentShare() === 0);
}

// ── (d) Staffing-scaled energy: 20% standby / pełny pobór / autonomiczne ─────
console.log('--- (d) Zużycie energii skaluje się obsadą (20% floor) ---');
{
  const tech = new TechSystem();
  const grid = new HexGrid(6, 8); grid.forEach(tl => { tl.type = 'plains'; });
  const res = new ResourceSystem({});
  const civ = new CivilizationSystem({}, tech, { id: 'ed', atmosphere: 'breathable' });
  civ.resourceSystem = res; civ.housing = 40;
  for (const s of Object.values(civ.strata)) s.count = 0;
  const bSys = new BuildingSystem(res, civ, tech); civ.buildingSystem = bSys;
  bSys._grid = grid; bSys._gridHeight = grid.height; bSys.setDeposits?.([]);
  bSys.setFactorySystem(new FactorySystem(res));

  // Budynek konsumujący energię (popType laborer, jobs 4). Demand 4 (override — budynek nie w _active).
  bSys.getSlotDemand = (tp) => (tp === 'laborer' ? 4 : 0);
  const consumer = { id: 'ecx', popType: 'laborer', jobs: 4, category: 'industry' };
  const base = { energy: -10 };

  // 0 obsady: strata.laborer=0, demand 4 → empPenalty min(1,0/4)=0 → 20% standby.
  civ.strata.laborer.count = 0;
  const eff0 = bSys._applyTechMultipliers(base, consumer, null);
  ok('(d) 0 obsady → energia = 20% (−10 × 0.2 = −2)', Math.abs(eff0.energy - (-2)) < 1e-9);

  // Pełna obsada: strata.laborer=4, demand 4 → empPenalty 1.0 → pełny pobór.
  civ.strata.laborer.count = 4;
  const effFull = bSys._applyTechMultipliers(base, consumer, null);
  ok('(d) pełna obsada → energia = pełny pobór (−10)', Math.abs(effFull.energy - (-10)) < 1e-9);

  // Połowa obsady: strata.laborer=2, demand 4 → empPenalty 0.5 → −5 (>20% floor, więc liniowo).
  civ.strata.laborer.count = 2;
  const effHalf = bSys._applyTechMultipliers(base, consumer, null);
  ok('(d) połowa obsady → −5 (0.5 > floor 0.2, skala liniowa)', Math.abs(effHalf.energy - (-5)) < 1e-9);

  // Autonomiczny (jobs 0) → empPenalty 1.0 → bez zmian.
  const auton = { id: 'aut', isAutonomous: true, jobs: 0 };
  const effAuton = bSys._applyTechMultipliers({ energy: -8 }, auton, null);
  ok('(d) autonomiczny → pełny pobór (−8, bez standby)', Math.abs(effAuton.energy - (-8)) < 1e-9);

  // Nie-energetyczna konsumpcja (np. Fe) NIE skalowana obsadą (tylko energia).
  const effFe = bSys._applyTechMultipliers({ Fe: -5 }, consumer, null);   // 0 workers, ale Fe bez floor
  ok('(d) inne zużycie (Fe) NIE skalowane obsadą (−5)', Math.abs(effFe.Fe - (-5)) < 1e-9);
  civ.dispose();
}

// ── (e) AI 20 lat headless: kredyty ≥ 0, kolonia przeżywa ────────────────────
console.log('--- (e) AI 20 lat: brak death-spirali (kredyty floor 0, przeżycie) ---');
{
  const cm = new ColonyManager(null); cm._taxRate = 0.08;
  // Kolonia AI (ownerEmpireId) — BEZ podatku (filtr), płace symetryczne. Start 1000 Kr.
  const ai = {
    planetId: 'ai1', isOutpost: false, ownerEmpireId: 'empire_x', credits: 1000,
    prosperitySystem: { prosperity: 50 },
    civSystem: { employed: 30, getTotalLaborCost: () => 60, population: 30 },
  };
  cm._colonies.set('ai1', ai);
  let minCred = ai.credits, wentNegative = false;
  for (let m = 0; m < 240; m++) {   // 20 lat × 12 miesięcy
    cm._applyTaxes(1 / 12);
    if (ai.credits < 0) wentNegative = true;
    minCred = Math.min(minCred, ai.credits);
  }
  console.log(`    AI po 20 latach: credits=${ai.credits} min=${minCred} pop=${ai.civSystem.population}`);
  ok('(e) AI: kredyty NIGDY < 0 (spendCredits floor)', !wentNegative && minCred >= 0);
  ok('(e) AI: kredyty zdrenowane do 0 (brak dochodu — potwierdza raport)', ai.credits === 0);
  ok('(e) AI: kolonia PRZEŻYWA w rejestrze (brak death-spirali)', cm._colonies.has('ai1') && ai.civSystem.population === 30);
}

// ── (BUG 1) LIVE energy path — REALNA ścieżka _build/_activateBuilding + bilans energii ──
// ⚠ Idzie przez TĘ SAMĄ ścieżkę co żywa gra (_activateBuilding → _applyTechMultipliers →
// registerProducer → ResourceSystem.energy.consumption), NIE przez równoległą kalkulację.
// Musi FAILOWAĆ na kodzie sprzed fixu (activation liczył effectiveRates PRZED wpisem do _active
// + obsadą → empPenalty=1 → pełna energia mimo braku obsady). Smelter: energyCost 8, miner.
console.log('--- (BUG 1) _activateBuilding (real path) → energia skalowana obsadą w LIVE bilansie ---');
function _bug1Setup() {
  const tech = new TechSystem();
  const grid = new HexGrid(6, 8); grid.forEach(tl => { tl.type = 'mountains'; });
  const res = new ResourceSystem({}); for (const k of res.inventory.keys()) res.inventory.set(k, 99999);
  const civ = new CivilizationSystem({}, tech, { id: 'b1', atmosphere: 'breathable' });
  civ.resourceSystem = res; civ.housing = 40;
  for (const s of Object.values(civ.strata)) s.count = 0; civ._unemployed = 0;
  const bSys = new BuildingSystem(res, civ, tech); civ.buildingSystem = bSys;
  bSys._grid = grid; bSys._gridHeight = grid.height; bSys.setDeposits?.([]); bSys.setFactorySystem(new FactorySystem(res));
  window.KOSMOS.buildingSystem = bSys; window.KOSMOS.civSystem = civ; window.KOSMOS.resourceSystem = res;
  return { civ, bSys, grid, res };
}
{
  // A) NIEOBSADZONY (0 wolnych workers → convertToStrata nie obsadzi) → 20% standby w bilansie.
  const A = _bug1Setup();
  const ta = A.grid.get(2, 2);
  A.bSys._activateBuilding(ta.key, 'smelter', ta.r, ta.type, false);   // REALNA ścieżka
  const consA = A.res.energy.consumption;
  console.log(`    A nieobsadzony: miner=${A.civ.strata.miner.count} consumption=${consA} (oczek. 1.6 = 0.2×8)`);
  ok('(BUG1) nieobsadzony smelter → 20% standby w LIVE bilansie (0.2×8=1.6)', Math.abs(consA - 1.6) < 1e-6);
  A.civ.dispose();

  // B) OBSADZONY (5 wolnych laborerów → convertToStrata przeniesie 1 → miner) → pełny pobór.
  const B = _bug1Setup();
  B.civ.strata.laborer.count = 5;   // wolni robotnicy do konwersji
  const tb = B.grid.get(3, 3);
  B.bSys._activateBuilding(tb.key, 'smelter', tb.r, tb.type, false);
  const consB = B.res.energy.consumption;
  console.log(`    B obsadzony: miner=${B.civ.strata.miner.count} consumption=${consB} (oczek. 8, pełny)`);
  ok('(BUG1) obsadzony smelter → pełny pobór w LIVE bilansie (8)', Math.abs(consB - 8) < 1e-6);
  ok('(BUG1) obsadzony > nieobsadzony (skalowanie działa w bilansie)', consB > consA);
  B.civ.dispose();
  window.KOSMOS.buildingSystem = null; window.KOSMOS.civSystem = null;
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
