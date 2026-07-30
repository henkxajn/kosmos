// Population 2.0 Slice 5C.1 — Allocation 2.0 (target-share) — inwarianty przez REALNE ścieżki kodu.
// Uruchom: node src/testing/smoke/tmp_pop2_5c1_smoke.mjs
//
// Pokrycie (plan §5C.1 test suite):
//   (A) economy contract byte-identical (flag ON neutral vs OFF)
//   (B) droid-net — alokacja NIGDY ponad _humanJobs (droidy nie ściągają ludzi)
//   (C) locked-crew nigdy nie migruje (target ciągnie tylko unlocked)
//   (D) freePops ≈ unemployed steady-state (real BuildingSystem + ticki)
//   (E) integer re-floor + remainder→U (ułamkowy lock)
//   (F) mid-year idempotence (_allocateWorkforce(false) ×2 → no-op)
//   (G) empty-target → economic fallback (flag ON neutral === flag OFF, byte-identical alokacja)
//   (H) target convergence + trickle małych strat (akumulator friction)
//   (I) remove ZWRACA droida (real BuildingSystem); demolish/downgrade DALEJ NISZCZĄ; flag OFF niszczy
//   (J) AI 60 lat headless — brak zamrożenia/NaN, inwarianty co rok
//   (K) Σshare>100% → normalizacja (brak overflow, cap _humanJobs)

import '../headless/env.js'; // MUST be first
import EventBus from '../../core/EventBus.js';
import { ResourceSystem } from '../../systems/ResourceSystem.js';
import { CivilizationSystem, STRATA_TYPES } from '../../systems/CivilizationSystem.js';
import { BuildingSystem } from '../../systems/BuildingSystem.js';
import { FactorySystem } from '../../systems/FactorySystem.js';
import { TechSystem } from '../../systems/TechSystem.js';
import { HexGrid } from '../../map/HexGrid.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';

window.KOSMOS = { civMode: true, timeSystem: { gameTime: 0 } };

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };
const F = () => GAME_CONFIG.FEATURES;                         // skrót
const strataSum = (civ) => STRATA_TYPES.reduce((a, t) => a + civ.strata[t].count, 0);
const invariant = (civ) => Math.floor(civ.humans) === strataSum(civ) + civ._unemployed;
const allInt = (civ) => STRATA_TYPES.every(t => Number.isInteger(civ.strata[t].count)) && Number.isInteger(civ._unemployed);

// ── Mock BuildingSystem — interfejs czytany przez CivilizationSystem (jobs/synth demand) ──
function mockBSys(jobs = {}, synth = {}) {
  return {
    getSlotDemand:    (t) => jobs[t]  ?? 0,
    getSyntheticJobs: (t) => synth[t] ?? 0,
    getMineEfficiency: () => 0.5, getFactoryOutputRatio: () => 0.5, getAdvancedBuildingsUptime: () => 0.5,
  };
}
function freshMock(jobs = {}, synth = {}) {
  const civ = new CivilizationSystem({}, null, { id: 'm', atmosphere: 'breathable' });
  for (const s of Object.values(civ.strata)) s.count = 0;
  civ._unemployed = 0; civ._focusBonus = {}; civ._focusTarget = {}; civ._focusMigrationProgress = {};
  civ.buildingSystem = mockBSys(jobs, synth);
  return civ;
}
// ── Real BuildingSystem + HexGrid + zasoby ──
function realSetup() {
  const tech = new TechSystem();
  const grid = new HexGrid(6, 8); grid.forEach(tl => { tl.type = 'plains'; });
  const res = new ResourceSystem({}); for (const k of res.inventory.keys()) res.inventory.set(k, 99999);
  res.receive({ automation_droid: 60 });
  const civ = new CivilizationSystem({}, tech, { id: 'r', atmosphere: 'breathable' });
  civ.resourceSystem = res; civ.housing = 400;
  for (const s of Object.values(civ.strata)) s.count = 0; civ._unemployed = 0;
  const bSys = new BuildingSystem(res, civ, tech); civ.buildingSystem = bSys;
  bSys._grid = grid; bSys._gridHeight = grid.height; bSys.setDeposits?.([]); bSys.setFactorySystem(new FactorySystem(res));
  window.KOSMOS.buildingSystem = bSys; window.KOSMOS.civSystem = civ; window.KOSMOS.resourceSystem = res;
  return { civ, bSys, grid, res, tech };
}
function teardownReal(civ) { civ.dispose(); window.KOSMOS.civSystem = null; window.KOSMOS.buildingSystem = null; window.KOSMOS.resourceSystem = null; }

// ════════════════════════════════════════════════════════════════════════════
// (A) economy contract byte-identical (flag ON neutral vs OFF) — getters na FIXED stanie
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (A) economy contract byte-identical (ON-neutral vs OFF) ---');
{
  const build = () => {
    const civ = freshMock({ laborer: 8, miner: 4, worker: 6, scientist: 3 }, { worker: 2 });
    civ.strata.laborer.count = 5; civ.strata.miner.count = 2; civ.strata.worker.count = 4; civ.strata.scientist.count = 1;
    civ._unemployed = 3; civ._focusBonus = {}; civ._focusTarget = {};
    return civ;
  };
  const snap = (civ) => ({
    wage: STRATA_TYPES.map(t => civ.getStrataWage(t)),
    pressure: STRATA_TYPES.map(t => civ.getStrataPressure(t)),
    laborCost: STRATA_TYPES.map(t => civ.getStrataLaborCost(t)),
    total: civ.getTotalLaborCost(), employed: civ.employed, indShare: civ.getIndustryEmploymentShare(),
  });
  F().popAllocation2 = true;  const on  = snap(build());
  F().popAllocation2 = false; const off = snap(build());
  F().popAllocation2 = true;  // przywróć default
  ok('(A) wage identical', JSON.stringify(on.wage) === JSON.stringify(off.wage));
  ok('(A) pressure identical', JSON.stringify(on.pressure) === JSON.stringify(off.pressure));
  ok('(A) getStrataLaborCost identical', JSON.stringify(on.laborCost) === JSON.stringify(off.laborCost));
  ok('(A) getTotalLaborCost identical', on.total === off.total);
  ok('(A) employed identical', on.employed === off.employed);
  ok('(A) getIndustryEmploymentShare identical', on.indShare === off.indShare);
}

// ════════════════════════════════════════════════════════════════════════════
// (B) droid-net — alokacja NIGDY ponad _humanJobs (droid nie ściąga człowieka)
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (B) droid-net (alokacja ≤ _humanJobs) ---');
{
  F().popAllocation2 = true;
  const civ = freshMock({ laborer: 10 }, { laborer: 4 });   // 10 etatów, 4 droidy → 6 human jobs
  civ._unemployed = 20;
  civ.setStrataTarget('laborer', 1.0);                       // chcę WSZYSTKICH w laborer
  civ._allocateWorkforce();
  ok('(B) laborer ≤ _humanJobs (6, droidy nie ściągają ludzi)', civ.strata.laborer.count === 6);
  ok('(B) nadwyżka została bezrobotna (14)', civ._unemployed === 14);
  ok('(B) inwariant floor(humans)=Σstrata+U', invariant(civ) && allInt(civ));
  civ.dispose();
}

// ════════════════════════════════════════════════════════════════════════════
// (C) locked-crew nigdy nie migruje (target ciągnie tylko unlocked)
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (C) locked-crew nie migruje ---');
{
  F().popAllocation2 = true;
  const civ = freshMock({ worker: 6, scientist: 6 }, {});
  civ.strata.worker.count = 6;            // 6 workers
  civ._lockedPerStrata = { worker: 4 };   // 4 zablokowani (crew)
  civ.setStrataTarget('scientist', 1.0);  // ciągnij ku scientist
  for (let y = 0; y < 30; y++) civ._allocateWorkforce();   // 30 lat migracji
  ok('(C) zablokowani (4) NIGDY nie opuścili worker', civ.strata.worker.count >= 4);
  ok('(C) unlocked (2) zmigrowali do scientist', civ.strata.scientist.count >= 1);
  ok('(C) inwariant + całkowitość', invariant(civ) && allInt(civ));
  civ.dispose();
}

// ════════════════════════════════════════════════════════════════════════════
// (D) freePops ≈ unemployed steady-state (real BuildingSystem + ticki)
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (D) freePops === unemployed (real, synth=0, lock=0) ---');
{
  F().popAllocation2 = true;
  const { civ, bSys, grid } = realSetup();
  for (const [q, r] of [[1, 1], [2, 2], [3, 3]]) { const tl = grid.get(q, r); bSys._activateBuilding(tl.key, 'solar_farm', tl.r, tl.type, false); }
  civ.strata.laborer.count = 0; civ._unemployed = 12;
  civ.setStrataTarget('laborer', 0.5);
  for (let y = 0; y < 12; y++) EventBus.emit('time:tick', { deltaYears: 1 / 12, civDeltaYears: 1, gameTime: y + 1 });
  ok('(D) freePops === unemployed (steady-state)', civ.freePops === civ.unemployed);
  ok('(D) inwariant + całkowitość', invariant(civ) && allInt(civ));
  teardownReal(civ);
}

// ════════════════════════════════════════════════════════════════════════════
// (E) integer re-floor + remainder→U (ułamkowy lock)
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (E) integer re-floor (ułamkowy lock) ---');
{
  F().popAllocation2 = true;
  const civ = freshMock({ worker: 10, scientist: 5 }, {});
  civ.strata.worker.count = 7.6;               // ułamkowy count (legacy/desync)
  civ.strata.scientist.count = 2.3;
  civ._lockedPerStrata = { worker: 2.5 };       // ułamkowy lock (proporcjonalny _distributeLock)
  civ._unemployed = 1.4;
  const totalBefore = Math.round(strataSum(civ) + civ._unemployed);
  civ.setStrataTarget('scientist', 0.6);
  civ._allocateWorkforce();
  ok('(E) wszystkie strata.count całkowite', STRATA_TYPES.every(t => Number.isInteger(civ.strata[t].count)));
  ok('(E) _unemployed całkowite', Number.isInteger(civ._unemployed));
  ok('(E) suma ludzi zachowana (round)', strataSum(civ) + civ._unemployed === totalBefore);
  ok('(E) inwariant', invariant(civ));
  civ.dispose();
}

// ════════════════════════════════════════════════════════════════════════════
// (F) mid-year idempotence — _allocateWorkforce(false) ×2 → no-op (bez churnu migracji)
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (F) mid-year idempotence (advanceMigration=false) ---');
{
  F().popAllocation2 = true;
  const civ = freshMock({ laborer: 6, scientist: 6 }, {});
  civ.strata.laborer.count = 6; civ._unemployed = 2;
  civ.setStrataTarget('scientist', 1.0);
  civ._allocateWorkforce(false);   // mid-year: tylko re-fill wolnych etatów
  const snap1 = JSON.stringify({ s: STRATA_TYPES.map(t => civ.strata[t].count), u: civ._unemployed, p: civ._focusMigrationProgress });
  civ._allocateWorkforce(false);   // drugi strzał — musi być no-op
  const snap2 = JSON.stringify({ s: STRATA_TYPES.map(t => civ.strata[t].count), u: civ._unemployed, p: civ._focusMigrationProgress });
  ok('(F) drugi mid-year alloc = no-op (identyczny stan)', snap1 === snap2);
  ok('(F) mid-year NIE zaawansował akumulatora migracji', Object.keys(civ._focusMigrationProgress).length === 0);
  civ.dispose();
}

// ════════════════════════════════════════════════════════════════════════════
// (G) empty-target → economic fallback (flag ON neutral === flag OFF, byte-identical alokacja)
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (G) empty-target === Faza 3 (byte-identical alokacja) ---');
{
  const build = () => {
    const civ = freshMock({ laborer: 4, worker: 4, scientist: 4 }, {});
    civ.strata.laborer.count = 3; civ.strata.worker.count = 2;
    civ._unemployed = 4; civ._focusTarget = {};   // BRAK targetu
    return civ;
  };
  F().popAllocation2 = true;  const onC = build(); onC._allocateWorkforce();
  F().popAllocation2 = false; const offC = build(); offC._allocateWorkforce();
  F().popAllocation2 = true;
  const dump = (c) => JSON.stringify({ s: STRATA_TYPES.map(t => c.strata[t].count), u: c._unemployed });
  ok('(G) alokacja ON-neutral === OFF (Faza 3 exact)', dump(onC) === dump(offC));
  onC.dispose(); offC.dispose();
}

// ════════════════════════════════════════════════════════════════════════════
// (H) target convergence + trickle małych strat (akumulator friction)
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (H) target convergence + trickle (akumulator) ---');
{
  F().popAllocation2 = true;
  // Duży donor: worker=10 → 0.10×10=1/rok → scientist rośnie ~1/rok do capa (5).
  const big = freshMock({ worker: 10, scientist: 5 }, {});
  big.strata.worker.count = 10; big.setStrataTarget('scientist', 1.0);
  const path = [];
  for (let y = 0; y < 8; y++) { big._allocateWorkforce(); path.push(big.strata.scientist.count); }
  ok('(H) scientist rośnie ku targetowi (monotonicznie)', path.every((v, i) => i === 0 || v >= path[i - 1]));
  ok('(H) osiąga cap _humanJobs (5), NIGDY ponad', big.strata.scientist.count === 5 && path.every(v => v <= 5));
  big.dispose();

  // Mały donor: worker=3 → 0.10×3=0.3/rok → ruch dopiero po ~3-4 latach (trickle).
  const small = freshMock({ worker: 3, scientist: 5 }, {});
  small.strata.worker.count = 3; small._unemployed = 0; small.setStrataTarget('scientist', 1.0);
  small._allocateWorkforce(); small._allocateWorkforce(); small._allocateWorkforce();  // 3 lata
  ok('(H) trickle: mały donor NIE rusza w 3 lata (0.3/rok < 1)', small.strata.scientist.count === 0);
  for (let y = 0; y < 4; y++) small._allocateWorkforce();  // +4 lata → akumulator przekroczy 1
  ok('(H) trickle: po ~7 latach mały donor przeniósł ≥1', small.strata.scientist.count >= 1);
  small.dispose();
}

// ════════════════════════════════════════════════════════════════════════════
// (I) remove ZWRACA droida (real); demolish DALEJ NISZCZY; flag OFF niszczy
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (I) remove-returns-droid rule (real BuildingSystem) ---');
{
  F().popAllocation2 = true;
  const { civ, bSys, grid, res } = realSetup();
  const t1 = grid.get(2, 2); bSys._activateBuilding(t1.key, 'solar_farm', t1.r, t1.type, false);   // laborer, jobs=1
  const t2 = grid.get(3, 3); bSys._activateBuilding(t2.key, 'solar_farm', t2.r, t2.type, false);
  const before = res.getAmount('automation_droid');
  const inst = bSys.installSyntheticForStrata('laborer');
  ok('(I) install per-strata (auto-pick) sukces', inst.success === true);
  ok('(I) install skonsumował 1 droida z magazynu', res.getAmount('automation_droid') === before - 1);
  // install 2. droid → auto-pick NAJSŁABIEJ obsadzony (drugi budynek, bo pierwszy ma już droida)
  bSys.installSyntheticForStrata('laborer');
  const d1 = bSys._grid.get(2, 2).syntheticSlot?.count ?? 0;
  const d2 = bSys._grid.get(3, 3).syntheticSlot?.count ?? 0;
  ok('(I) lowest-staffed pick — droidy rozłożone (1+1, nie 2+0)', d1 === 1 && d2 === 1);
  const afterInstall = res.getAmount('automation_droid');
  const rem = bSys.removeSyntheticForStrata('laborer');
  ok('(I) remove per-strata sukces + flaga returned', rem.success === true && rem.returned === true);
  ok('(I) RULE CHANGE: remove ZWRÓCIŁ droida do magazynu (+1)', res.getAmount('automation_droid') === afterInstall + 1);
  teardownReal(civ);
}
{
  // demolish DALEJ NISZCZY (destrukcja budynku ≠ deinstalacja)
  F().popAllocation2 = true;
  const { civ, bSys, grid, res } = realSetup();
  const tl = grid.get(2, 2); bSys._activateBuilding(tl.key, 'solar_farm', tl.r, tl.type, false);
  tl.buildingId = 'solar_farm'; tl.buildingLevel = 1;   // stan jak po construction-complete (_demolish guard)
  bSys.installSyntheticForStrata('laborer');
  const beforeDemolish = res.getAmount('automation_droid');
  bSys._demolish(tl);   // real demolish path (pełna rozbiórka Lv1)
  ok('(I) demolish NIE zwraca droida (dalej niszczy)', res.getAmount('automation_droid') === beforeDemolish);
  ok('(I) demolish wyczyścił slot syntetyczny', (bSys._grid.get(2, 2).syntheticSlot ?? null) === null);
  teardownReal(civ);
}
{
  // flag OFF: remove NISZCZY (Faza 4, bez zwrotu)
  F().popAllocation2 = false;
  const { civ, bSys, grid, res } = realSetup();
  const tl = grid.get(2, 2); bSys._activateBuilding(tl.key, 'solar_farm', tl.r, tl.type, false);
  bSys.installSyntheticForStrata('laborer');
  const beforeRem = res.getAmount('automation_droid');
  const rem = bSys.removeSynthetic(tl.key);
  ok('(I) flag OFF: remove NIE zwraca (returned=false)', rem.returned === false && res.getAmount('automation_droid') === beforeRem);
  teardownReal(civ);
  F().popAllocation2 = true;
}

// ════════════════════════════════════════════════════════════════════════════
// (J) AI 60 lat headless — brak zamrożenia/NaN, inwarianty co rok
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (J) AI 60 lat headless (brak targetu = ekonomia) ---');
{
  F().popAllocation2 = true;
  const { civ, bSys, grid } = realSetup();
  // Kilka budynków (różne strata) → jest gdzie alokować.
  const plan = [['solar_farm', 1, 1], ['solar_farm', 1, 2], ['well', 2, 1], ['mine', 2, 2], ['farm', 3, 1], ['coal_plant', 3, 2]];
  for (const [id, q, r] of plan) { const tl = grid.get(q, r); bSys._activateBuilding(tl.key, id, tl.r, tl.type, false); }
  civ.strata.laborer.count = 16; civ._unemployed = 0;
  // AI NIGDY nie ustawia targetu (_focusTarget = {}) → ścieżka ekonomiczna.
  let allYearsOk = true, sawEmployed = false;
  for (let y = 0; y < 60; y++) {
    EventBus.emit('time:tick', { deltaYears: 1 / 12, civDeltaYears: 1, gameTime: y + 1 });
    if (!invariant(civ) || !allInt(civ) || Number.isNaN(civ.humans) || Number.isNaN(civ.satisfaction)) allYearsOk = false;
    if (civ.employed > 0) sawEmployed = true;
  }
  ok('(J) inwariant + całkowitość + brak NaN co rok (60 lat)', allYearsOk);
  ok('(J) alokacja NIE zamrożona (zatrudnienie > 0)', sawEmployed && civ.employed > 0);
  ok('(J) populacja nie wyginęła', civ.population >= 8);
  ok('(J) target pusty przez cały czas (AI nietknięte)', !civ._hasAnyTarget());
  teardownReal(civ);
}

// ════════════════════════════════════════════════════════════════════════════
// (K) Σshare>100% → normalizacja (brak overflow, cap _humanJobs)
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (K) Σshare>100% normalizacja ---');
{
  F().popAllocation2 = true;
  const civ = freshMock({ laborer: 10, worker: 10, scientist: 10 }, {});   // mobilePool=30
  civ._unemployed = 40;
  civ.setStrataTarget('laborer', 0.8); civ.setStrataTarget('worker', 0.8);  // Σ=1.6 > 1 → normalizacja
  const th = civ._targetHeadcounts();
  ok('(K) Σ targetHeadcount ≤ mobilePool (normalizacja)', (th.laborer + th.worker) <= civ._mobileJobPool());
  civ._allocateWorkforce();
  ok('(K) żadna strata nie przekracza _humanJobs', STRATA_TYPES.every(t => civ.strata[t].count <= civ._humanJobs(t)));
  ok('(K) inwariant + całkowitość', invariant(civ) && allInt(civ));
  civ.dispose();
}

// ════════════════════════════════════════════════════════════════════════════
// (L) wzajemnie pod-targetowe warstwy — BRAK oscylacji (review 5C.1 donor guard)
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (L) mutually-under-target → brak limit cycle ---');
{
  F().popAllocation2 = true;
  const civ = freshMock({ laborer: 10, worker: 10 }, {});
  civ.strata.laborer.count = 6; civ.strata.worker.count = 6; civ._unemployed = 0;  // 12 ludzi, oba pod targetem 10
  civ.setStrataTarget('laborer', 0.5); civ.setStrataTarget('worker', 0.5);          // deficit 4 każdy, brak dawcy nad/neutralnego
  const seen = [];
  for (let y = 0; y < 20; y++) { civ._allocateWorkforce(); seen.push(`${civ.strata.laborer.count}/${civ.strata.worker.count}`); }
  ok('(L) brak oscylacji — stan stały 6/6 (nie okradają się)', seen.every(s => s === '6/6'));
  ok('(L) inwariant + całkowitość', invariant(civ) && allInt(civ));
  // Kontrola: neutralny dawca DALEJ oddaje (guard nie zablokował konwergencji z (H)).
  const conv = freshMock({ worker: 10, scientist: 5 }, {});
  conv.strata.worker.count = 10; conv.setStrataTarget('scientist', 1.0);            // worker NEUTRALNY → oddaje
  for (let y = 0; y < 8; y++) conv._allocateWorkforce();
  ok('(L) neutralny dawca dalej zasila target (guard nie za szeroki)', conv.strata.scientist.count === 5);
  civ.dispose(); conv.dispose();
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
