// Population 2.0 (post-Faza 4) — DROID-PER-JOB: 1 droid = 1 etat, wiele droidów/budynek, mieszane
// z ludźmi, proporcjonalna efektywność, upkeep per droid, wyparcie per jednostka, migracja v97→v98.
// Uruchom: node src/testing/smoke/tmp_pop4_droid_per_job_smoke.mjs

import '../headless/env.js'; // MUST be first
import { BUILDINGS } from '../../data/BuildingsData.js';
import { ResourceSystem } from '../../systems/ResourceSystem.js';
import { CivilizationSystem } from '../../systems/CivilizationSystem.js';
import { BuildingSystem } from '../../systems/BuildingSystem.js';
import { HexGrid } from '../../map/HexGrid.js';
import { migrate } from '../../systems/SaveMigration.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
// Slice 5C.1: ten plik testuje kontrakt Fazy 4 (droid NISZCZONY przy remove) = ścieżka FLAG OFF.
// Regułę „remove ZWRACA droida" (flag ON) pokrywa tmp_pop2_5c1 (blok I).
GAME_CONFIG.FEATURES.popAllocation2 = false;

window.KOSMOS = { civMode: true, timeSystem: { gameTime: 0 } };
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

/** Kolonia + budynek na poziomie L (J = jobs×L). Zwraca uchwyty. */
function mkCol() {
  const grid = new HexGrid(10, 12); grid.forEach(t => { t.type = 'plains'; });
  const res = new ResourceSystem({ automation_droid: 99, android_worker: 99 });
  const civ = new CivilizationSystem({}, null, { id: 'dpj', atmosphere: 'breathable' });
  civ.resourceSystem = res;
  const bs = new BuildingSystem(res, civ, null); civ.buildingSystem = bs;
  bs._grid = grid; bs._gridHeight = grid.height;
  window.KOSMOS.civSystem = civ; window.KOSMOS.buildingSystem = bs; window.KOSMOS.resourceSystem = res;
  for (const s of Object.values(civ.strata)) s.count = 0;
  civ._unemployed = 0;
  const keys = []; grid.forEach(t => { if (keys.length < 8) keys.push(`${t.q},${t.r}`); });
  let ki = 0;
  const build = (bid, level = 1) => {
    const key = keys[ki++]; const [q, r] = key.split(',').map(Number);
    bs._activateBuilding(key, bid, grid.get(q, r).r, grid.get(q, r).type, false);
    if (level > 1) { const e = bs._active.get(key); e.level = level; grid.get(q, r).buildingLevel = level; bs._reapplyAllRates(); }
    return key;
  };
  return { grid, res, civ, bs, build };
}

// ── (a) install/remove pojedynczych jednostek, cap na jobs, block-when-full ──
console.log('--- (a) install/remove per-unit, cap = jobs×level, block when full ---');
{
  const { bs, res, grid, build } = mkCol();
  const key = build('solar_farm', 3);   // laborer, jobs=1 × level 3 → J=3
  const [q, r] = key.split(',').map(Number);
  ok('(a0) J = jobs×level = 3', (BUILDINGS.solar_farm.jobs) * 3 === 3);
  const before = res.getAmount('automation_droid');
  ok('(a1) install #1 OK', bs.installSynthetic(key, 'automation_droid').success === true);
  ok('(a2) count=1, getSyntheticJobs=1', grid.get(q, r).syntheticSlot.count === 1 && bs.getSyntheticJobs('laborer') === 1);
  ok('(a3) install #2 OK → count=2', bs.installSynthetic(key, 'automation_droid').success === true && grid.get(q, r).syntheticSlot.count === 2);
  ok('(a4) install #3 OK → count=3 (pełny)', bs.installSynthetic(key, 'automation_droid').success === true && grid.get(q, r).syntheticSlot.count === 3);
  const r4 = bs.installSynthetic(key, 'automation_droid');
  ok('(a5) install #4 REJECT building_full', r4.success === false && r4.reason === 'building_full');
  ok('(a6) zużyto 3 droidy z magazynu', before - res.getAmount('automation_droid') === 3);
  ok('(a7) countInstalledSynthetics = 3 (JEDNOSTKI)', bs.countInstalledSynthetics() === 3 && bs.countInstalledSynthetics('automation_droid') === 3);
  // remove per-unit
  ok('(a8) remove #1 → count=2', bs.removeSynthetic(key).success === true && grid.get(q, r).syntheticSlot.count === 2);
  ok('(a9) remove #2 → count=1', bs.removeSynthetic(key).success === true && grid.get(q, r).syntheticSlot.count === 1);
  ok('(a10) remove #3 → slot=null', bs.removeSynthetic(key).success === true && grid.get(q, r).syntheticSlot === null);
  const r11 = bs.removeSynthetic(key);
  ok('(a11) remove pustego → no_synthetic', r11.success === false && r11.reason === 'no_synthetic');
  ok('(a12) usunięcie NIE zwraca droidów (magazyn bez zmian po remove)', before - res.getAmount('automation_droid') === 3);
}

// ── (b) mieszane H+D → proporcjonalna efektywność ──
console.log('--- (b) mieszane human+droid → efficiency = (D×eff + (J−D)×humanStaff)/J ---');
{
  const { bs, civ, grid, build } = mkCol();
  const key = build('solar_farm', 4);   // laborer, J=4
  const [q, r] = key.split(',').map(Number);
  const B = BUILDINGS.solar_farm;
  const setSlot = (D) => { grid.get(q, r).syntheticSlot = D > 0 ? { commodityId: 'automation_droid', tier: 1, count: D } : null; };

  setSlot(0); civ.strata.laborer.count = 4;   // pełna ludzka obsada, brak droidów
  ok('(b1) D=0, pełna obsada → efficiency 1.0', near(bs._getBuildingLaborEfficiency(B, key), 1.0));
  setSlot(2); civ.strata.laborer.count = 2;   // 2 droidy + 2 ludzi (humanDemand=2, workers=2 → staff 1.0)
  ok('(b2) D=2/4, pełni ludzie → 1.2 (pół bonusu)', near(bs._getBuildingLaborEfficiency(B, key), 1.2));
  setSlot(4); civ.strata.laborer.count = 0;   // pełny droid
  ok('(b3) D=4/4 → 1.4 (pełny bonus tier-1)', near(bs._getBuildingLaborEfficiency(B, key), 1.4));
  setSlot(2); civ.strata.laborer.count = 1;   // 2 droidy + niedobsadzeni ludzie (humanDemand=2, workers=1 → 0.5)
  ok('(b4) D=2/4, ludzka reszta niedobsadzona (0.5) → 0.95 (understaffed-safe)', near(bs._getBuildingLaborEfficiency(B, key), 0.95));
  // android tier 2 (×1.7): D=4 → 1.7
  grid.get(q, r).syntheticSlot = { commodityId: 'android_worker', tier: 2, count: 4 }; civ.strata.laborer.count = 0;
  ok('(b5) D=4 android tier-2 → 1.7', near(bs._getBuildingLaborEfficiency(B, key), 1.7));
}

// ── (c) upkeep energii PER DROID w LIVE bilansie ──
console.log('--- (c) per-droid energy upkeep (2/droid tier-1) w LIVE bilansie ---');
{
  const { bs, res, grid } = mkCol();
  // Budynek laborer jobs=1, level 3 (J=3), energyCost 0 → izolacja upkeepu.
  const key = '2,2';
  bs._active.set(key, { building: { id: 'x', popType: 'laborer', jobs: 1, energyCost: 0 }, baseRates: {}, effectiveRates: {}, jobs: 1, level: 3 });
  grid.get(2, 2).syntheticSlot = { commodityId: 'automation_droid', tier: 1, count: 2 };
  bs._reapplyAllRates();
  ok('(c1) 2 droidy → effectiveRates.energy = −4 (2×2)', bs._active.get(key).effectiveRates.energy === -4);
  ok('(c2) LIVE bilans: consumption = 4', res.energy.consumption === 4);
  grid.get(2, 2).syntheticSlot.count = 3; bs._reapplyAllRates();
  ok('(c3) 3 droidy → consumption = 6', res.energy.consumption === 6);
  grid.get(2, 2).syntheticSlot = { commodityId: 'android_worker', tier: 2, count: 2 }; bs._reapplyAllRates();
  ok('(c4) 2 androidy tier-2 (6/szt) → consumption = 12', res.energy.consumption === 12);
}

// ── (d) displacement per-unit: N ∈ {0,1} ──
console.log('--- (d) displacement per-unit: instalacja 1 droida wypiera ≤1 pracownika ---');
{
  const { bs, civ, grid, build } = mkCol();
  const key = build('solar_farm', 4);   // J=4
  const [q, r] = key.split(',').map(Number);
  civ.strata.laborer.count = 4;   // pełna obsada 4 etatów
  const d1 = bs.getSyntheticDisplacement(key);
  ok('(d1) staffed, D=0 → displaced=1 (marginalny etat)', d1.displaced === 1 && d1.staffed === true);
  grid.get(q, r).syntheticSlot = { commodityId: 'automation_droid', tier: 1, count: 4 };   // pełny
  const d2 = bs.getSyntheticDisplacement(key);
  ok('(d2) pełny budynek → displaced=0 (instalacja i tak zablokowana)', d2.displaced === 0 && d2.staffed === false);
  grid.get(q, r).syntheticSlot = null; civ.strata.laborer.count = 0;   // nieobsadzony
  const d3 = bs.getSyntheticDisplacement(key);
  ok('(d3) nieobsadzony → displaced=0', d3.displaced === 0);
}

// ── (e) freePops/pressure/allocation liczą JEDNOSTKI (nie building jobs) ──
console.log('--- (e) freePops/pressure liczą droidy jako JEDNOSTKI ---');
{
  const { bs, civ, grid, build } = mkCol();
  const key = build('solar_farm', 4);   // J=4 laborer
  const [q, r] = key.split(',').map(Number);
  civ.strata.laborer.count = 4; civ._unemployed = 10;   // 4 pracujących + 10 bezrobotnych
  grid.get(q, r).syntheticSlot = { commodityId: 'automation_droid', tier: 1, count: 2 };   // 2 droidy (nie 4!)
  ok('(e1) getSyntheticJobs(laborer) = 2 (JEDNOSTKI, nie J=4)', bs.getSyntheticJobs('laborer') === 2);
  ok('(e2) getSyntheticJobsTotal = 2', bs.getSyntheticJobsTotal() === 2);
  ok('(e3) _humanJobs(laborer) = 4 − 2 = 2', civ._humanJobs('laborer') === 2);
  civ._allocateWorkforce();
  // Po alokacji: 2 ludzkie etaty obsadzone, nadmiar → bezrobotni. freePops nets 2 droidy.
  const emp = civ._employedPops, synth = bs.getSyntheticJobsTotal();
  ok('(e4) freePops === max(0, pop − (emp − synth) − locked)', civ.freePops === Math.max(0, civ.population - Math.max(0, emp - synth) - civ._lockedPops));
}

// ── (f) migracja v97→v98: stary single-slot budynek J jobs → J jednostek, round-trip ──
console.log('--- (f) migracja v97→v98: whole-building slot → J droidów ---');
{
  const bId = 'solar_farm';   // jobs=1
  const level = 5;            // J = 1×5 = 5
  const save = {
    version: 97,
    civ4x: { colonies: [ { grid: { tiles: [
      { q: 2, r: 2, buildingId: bId, buildingLevel: level, syntheticSlot: { commodityId: 'automation_droid', tier: 1 } },   // BEZ count (stary)
      { q: 3, r: 3, buildingId: bId, buildingLevel: 1, syntheticSlot: null },
    ] } } ] },
  };
  const out = migrate(save);
  const t0 = out?.civ4x?.colonies?.[0]?.grid?.tiles?.[0];
  ok('(f1) migracja nie zwróciła error', !out?.error);
  ok('(f2) count = jobs×level = 5 (zachowana pełna automatyzacja)', t0?.syntheticSlot?.count === (BUILDINGS[bId].jobs * level));
  ok('(f3) tier/commodityId zachowane', t0?.syntheticSlot?.tier === 1 && t0?.syntheticSlot?.commodityId === 'automation_droid');
  ok('(f4) pusty slot pozostaje null', out?.civ4x?.colonies?.[0]?.grid?.tiles?.[1]?.syntheticSlot == null);
}

// ── (g) tier mixing ODRZUCONE ──
console.log('--- (g) jeden tier na budynek: mieszanie tierów odrzucone ---');
{
  const { bs, grid, build } = mkCol();
  const key = build('solar_farm', 3);   // J=3
  const [q, r] = key.split(',').map(Number);
  bs.installSynthetic(key, 'automation_droid');   // tier 1
  const rMix = bs.installSynthetic(key, 'android_worker');   // tier 2 → odrzuć
  ok('(g1) install innego tieru → tier_mismatch', rMix.success === false && rMix.reason === 'tier_mismatch');
  ok('(g2) count nadal 1 (tier 1)', grid.get(q, r).syntheticSlot.count === 1 && grid.get(q, r).syntheticSlot.tier === 1);
  // preview też pokazuje tier_mismatch gdy w magazynie tylko inny tier
  bs.resourceSystem.spend({ automation_droid: bs.resourceSystem.getAmount('automation_droid') });   // wyczyść tier-1 z magazynu
  const prev = bs.previewSyntheticInstall(key);
  ok('(g3) preview: brak tier-1 w magazynie, jest tier-2 → tier_mismatch', prev.ok === false && prev.reason === 'tier_mismatch');
}

// ── (h) downgrade trimuje droidy + getDemolishDroidLoss ──
console.log('--- (h) downgrade trimuje droidy (D5) + getDemolishDroidLoss (ostrzeżenie) ---');
{
  const { bs, grid, build } = mkCol();
  const key = build('solar_farm', 3);   // J=3
  const [q, r] = key.split(',').map(Number);
  bs.installSynthetic(key, 'automation_droid'); bs.installSynthetic(key, 'automation_droid'); bs.installSynthetic(key, 'automation_droid');   // 3 droidy
  ok('(h1) getDemolishDroidLoss @L3 (3 droidy) = 1 (downgrade→J=2)', bs.getDemolishDroidLoss(key) === 1);
  // Symuluj downgrade: level 3→2, trim.
  const entry = bs._active.get(key); entry.level = 2; grid.get(q, r).buildingLevel = 2;
  const newJ = BUILDINGS.solar_farm.jobs * 2;
  if (grid.get(q, r).syntheticSlot.count > newJ) grid.get(q, r).syntheticSlot.count = newJ;   // (ścieżka _demolish)
  ok('(h2) po downgrade count trimowany do J=2', grid.get(q, r).syntheticSlot.count === 2);
  ok('(h3) getSyntheticJobs clamp → 2', bs.getSyntheticJobs('laborer') === 2);
  // full demolish loss = wszystkie (przy L1)
  entry.level = 1; grid.get(q, r).buildingLevel = 1; grid.get(q, r).syntheticSlot.count = 1;
  ok('(h4) getDemolishDroidLoss @L1 (1 droid) = 1 (pełna rozbiórka)', bs.getDemolishDroidLoss(key) === 1);
}

// ── (i) UI display-data: gross vs net jobs (Workforce) + panel composition line (dane, nie piksele) ──
console.log('--- (i) UI display-data: gross-jobs vs net-jobs + composition line ---');
{
  const { bs, civ, grid, build } = mkCol();
  const key = build('solar_farm', 4);   // laborer, J=4
  const [q, r] = key.split(',').map(Number);
  grid.get(q, r).syntheticSlot = { commodityId: 'automation_droid', tier: 1, count: 2 };   // 2 droidy
  civ.strata.laborer.count = 2;   // 2 ludzi

  // UI 2 — Workforce breakdown: kolumna Jobs = grossJobs (4), Emp = workers(2)+synthetic(2).
  const row = civ.getWorkforceBreakdown().find(x => x.type === 'laborer');
  ok('(i1) grossJobs = 4 (wszystkie fizyczne etaty)', row.grossJobs === 4);
  ok('(i2) jobs NETTO (ludzkie) = 2 (≠ gross)', row.jobs === 2 && row.jobs !== row.grossJobs);
  ok('(i3) synthetic = 2 (droidy jako jednostki)', row.synthetic === 2);
  ok('(i4) grossJobs === jobs(netto) + synthetic', row.grossJobs === row.jobs + row.synthetic);
  ok('(i5) workers = 2 (ludzie)', row.workers === 2);

  // UI 1 — dane linii „Obsada: {J−D} POP + {D}🤖 / {J}" + „Produkcja (×eff)" + upkeep droidów.
  const entry = bs._active.get(key);
  const J = (entry.jobs) * (entry.level);
  const D = bs._tileDroidCount(entry, key);
  ok('(i6) J = jobs×level = 4', J === 4);
  ok('(i7) D=2, humanSlots = J−D = 2 (linia Obsada)', D === 2 && (J - D) === 2);
  ok('(i8) eff = 1.2 (produkcja ×eff — 2 droidy + 2 pełni ludzie / 4)', near(bs._getBuildingLaborEfficiency(entry.building, key), 1.2));
  const per = bs.constructor.SYNTH_ENERGY_UPKEEP[1];
  ok('(i9) droid upkeep = per×D = 2×2 = 4 (linia „w tym droidy")', per * D === 4);
  civ.dispose();
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
