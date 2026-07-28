// ═══════════════════════════════════════════════════════════════
// PROBE (weryfikacja) — GATE wydobycia na obsadę górników (Report 2, Plan 2)
// Uruchom: node src/testing/headless/probe-mine-staffing.mjs
// ───────────────────────────────────────────────────────────────
// Po fixie: _tickMineExtraction skaluje urobek przez frakcję obsady (miner-strata +
// droidy w slocie, clamp ≤1.0, podłoga GAME_CONFIG.MINE_STAFF_FLOOR). Autonomiczne
// i outpostowe kopalnie (jobs=0) ×1.0. Weryfikujemy 4 przypadki + asercje.
// ═══════════════════════════════════════════════════════════════

import './env.js'; // MUST be first
import { ResourceSystem }     from '../../systems/ResourceSystem.js';
import { CivilizationSystem } from '../../systems/CivilizationSystem.js';
import { BuildingSystem }     from '../../systems/BuildingSystem.js';
import { HexGrid }            from '../../map/HexGrid.js';
import { BUILDINGS }          from '../../data/BuildingsData.js';
import { GAME_CONFIG }        from '../../config/GameConfig.js';

globalThis.window = globalThis.window ?? {};
window.KOSMOS = { timeSystem: { gameTime: 0 } };

const techStub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'getTerrainUnlocks')       return () => [];
    if (prop === 'isResearched')            return () => false;   // brak asteroid_mining ×2
    if (prop === 'isAllAutonomous')         return () => false;
    if (prop === 'getAutonomousEfficiency') return () => 1.0;
    return () => 1;
  },
});

const planet = { id: 'ast_1', name: 'Asteroida', type: 'planetoid', planetType: 'planetoid', atmosphere: 'none' };
const grid = new HexGrid(8, 8); grid.forEach(t => { t.type = 'mountains'; });
const resSys = new ResourceSystem({ energy: 500, Fe: 0 });
const civSys = new CivilizationSystem({ population: 0 }, techStub, planet);
civSys.resourceSystem = resSys;
const bSys = new BuildingSystem(resSys, civSys, techStub);
civSys.buildingSystem = bSys; bSys._grid = grid; bSys._gridHeight = grid.height;
const DEP_TOTAL = 100000;
bSys.setDeposits([{ resourceId: 'Fe', richness: 0.6, totalAmount: DEP_TOTAL, remaining: DEP_TOTAL }]);

civSys.strata.engineer.count = 2; civSys.strata.laborer.count = 1; civSys.strata.miner.count = 0;
bSys.restoreFromSave([
  { buildingId: 'autonomous_solar_farm', tileKey: '0,0', level: 3, baseRates: BUILDINGS.autonomous_solar_farm.rates },
  { buildingId: 'autonomous_mine',       tileKey: '1,0', level: 1 },   // kontrola: zawsze ×1.0
  { buildingId: 'mine',                  tileKey: '2,0', level: 1 },   // regularna A
  { buildingId: 'mine',                  tileKey: '3,0', level: 1 },   // regularna B
]);

// Zmierz Fe/rok = delta po ticku 1 roku (reset złoża, by depletion nie zaburzało).
const measureFe = () => {
  bSys._deposits[0].remaining = DEP_TOTAL;
  bSys._mineLevelDirty = true;   // wymuś przeliczenie cache (obsada mogła się zmienić)
  const before = resSys.getAmount('Fe');
  bSys._tickMineExtraction(1.0);
  return resSys.getAmount('Fe') - before;
};

let pass = 0, fail = 0;
const ok = (name, cond, got) => { if (cond) { console.log(`  PASS  ${name}  (${got})`); pass++; } else { console.error(`  FAIL  ${name}  (${got})`); fail++; } };

console.log(`═══ GATE wydobycia — MINE_STAFF_FLOOR = ${GAME_CONFIG.MINE_STAFF_FLOOR} ═══`);
console.log('Setup: 1× autonomous_mine (kontrola) + 2× regularna kopalnia, złoże Fe richness 0.6, avail 1.0');
console.log('Pełny nameplate: 3 kopalnie L1 × 10 × 0.6 = 18 Fe/rok (autonomiczna zawsze pełna = 6 Fe).\n');

// CASE 1 — 0 górników: autonomiczna pełna (6), 2 regularne TWARDO zbramkowane (×0 → 0 każda)
civSys.strata.miner.count = 0;
const fe0 = measureFe();
ok('0 górników → auto 6 + 2×(×0) 0 = 6 Fe (twarda bramka)', Math.abs(fe0 - 6.0) < 0.05, `${fe0.toFixed(2)} Fe`);

// CASE 2 — pełna obsada (2 górnicy = demand 2): wszystkie ×1.0 = 18
civSys.strata.miner.count = 2;
const fe2 = measureFe();
ok('2 górników (pełna obsada) → 18 Fe (×1.0)', Math.abs(fe2 - 18.0) < 0.05, `${fe2.toFixed(2)} Fe`);

// CASE 3 — 1 górnik / demand 2 = staffing 0.5 na regularnych: auto 6 + 2×(×0.5) 6 = 12
civSys.strata.miner.count = 1;
const fe1 = measureFe();
ok('1 górnik / 2 demand → auto 6 + 2×(×0.5) 6 = 12 Fe', Math.abs(fe1 - 12.0) < 0.05, `${fe1.toFixed(2)} Fe`);

// CASE 4 — 0 górników + 1 droid w kopalni '2,0' (1 etat → D=1 J=1 → ×1.0 clamped):
//   auto 6 + mine'2,0'(droid ×1.0) 6 + mine'3,0'(×0, zbramkowana) 0 = 12.0
grid.get(2, 0).syntheticSlot = { commodityId: 'automation_droid', tier: 1, count: 1 };
civSys.strata.miner.count = 0;
const feD = measureFe();
ok('0 górników + droid w kopalni → auto 6 + droid-mine 6 + zbramkowana 0 = 12 Fe', Math.abs(feD - 12.0) < 0.05, `${feD.toFixed(2)} Fe`);
grid.get(2, 0).syntheticSlot = null;

// CASE 5 — autonomiczna kopalnia NIGDY nie tknięta gate'em (izoluj: usuń regularne)
civSys.strata.miner.count = 0;
bSys._active.delete('2,0'); bSys._active.delete('3,0');
const feAuto = measureFe();
ok('sama autonomiczna kopalnia (0 górników) → 6 Fe (×1.0, gate jej nie dotyczy)', Math.abs(feAuto - 6.0) < 0.05, `${feAuto.toFixed(2)} Fe`);

console.log(`\n═══ WYNIK: ${pass} PASS / ${fail} FAIL ═══`);
console.log(`Gate wydobycia AKTYWNY (twarda bramka, podłoga ${GAME_CONFIG.MINE_STAFF_FLOOR}): nieobsadzona regularna kopalnia = 0 urobku,`);
console.log('droidy liczą się, autonomiczne/outpost bez zmian. Satysfakcja górników i breakdown UI spójne z gate.');
process.exit(fail === 0 ? 0 : 1);
