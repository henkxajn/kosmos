// Population 2.0 (Faza 4) — droid production STALL diagnosis + boosted ×5 fix. Real-path smoke.
// Uruchom: node src/testing/smoke/tmp_pop4_droid_stall_smoke.mjs
//
// Bug polowy: droid STALL „BRAK SUROWCÓW" mimo pełnego zapasu lokalnego. Root-cause:
// _getScaledRecipe skalowało tier-1 ×5 w scenariuszu 'civilization_boosted' — a droid
// (tier 1, receptura ABSOLUTNA ~1000/szt.) też był łapany → Li 1000→5000 > zapas gracza.
//
// Pokrycie:
//   (fix)  _getScaledRecipe exemptuje isDroidUnit; normalny tier-1 NADAL ×5 (surgical).
//   (b)    REAL PATH boosted: full stock + FP + Kr → droid PRODUKUJE (0 pre-fix) + mirror default
//          (zachowanie IDENTYCZNE w obu scenariuszach — jedna cena).
//   (a)    getStallReason nazywa PRAWDZIWY blocker: missing_ingredient / insolvent / no_points /
//          tech_blocked / target_done + priorytet + ekspozycja przez getAllocations().
//   (#2)   scan: android_worker (tier 3) NIE skalowany; automation_droid = jedyny tier-1 z
//          absolutną recepturą / isDroidUnit (żaden inny commodity nie jest zniekształcany ×5).

import '../headless/env.js'; // MUST be first
import { COMMODITIES } from '../../data/CommoditiesData.js';
import { ResourceSystem } from '../../systems/ResourceSystem.js';
import { FactorySystem } from '../../systems/FactorySystem.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Stock z raportu polowego (single-colony New Earth). Li = jedyny wąski (2× recepty; ×5 → poniżej).
const FIELD_STOCK = { Li: 2000, C: 9000, Fe: 8600, Cu: 8300, Si: 21700 };

function makeColony({ scenario, credits = 5000, stock }) {
  window.KOSMOS = window.KOSMOS || {};
  window.KOSMOS.civMode = true;
  window.KOSMOS.scenario = scenario;
  window.KOSMOS.timeSystem = { gameTime: 0 };
  const res = new ResourceSystem({});
  for (const [k, v] of Object.entries(stock)) res.inventory.set(k, v);
  const fs = new FactorySystem(res);
  const colony = {
    planetId: 'ne', credits, factorySystem: fs, resourceSystem: res,
    buildingSystem: {
      _active: new Map(),
      techSystem: { getFactorySpeedMultiplier: () => 1.0, isResearched: () => false, isCommodityUnlocked: () => false },
    },
  };
  window.KOSMOS.factorySystem = fs;
  window.KOSMOS.colonyManager = { getAllColonies: () => [colony], getColony: () => colony, activePlanetId: 'ne' };
  window.KOSMOS.civilianTradeSystem = {
    getCredits: () => colony.credits,
    spendCredits: (_pid, amt) => { if ((colony.credits ?? 0) < amt) return false; colony.credits -= amt; return true; },
  };
  return { fs, res, colony };
}

// ── (fix) _getScaledRecipe: droid EXEMPT, normalny tier-1 NADAL ×5 ────────────
console.log('--- (fix) _getScaledRecipe: droid exempt, normalny tier-1 dalej ×5 (surgical) ---');
{
  const { fs } = makeColony({ scenario: 'civilization_boosted', stock: FIELD_STOCK });
  const dRecipe = COMMODITIES.automation_droid.recipe;
  ok('(fix) boosted: droid recipe NIE skalowana (exemption isDroidUnit)',
    eq(fs._getScaledRecipe(dRecipe, 'automation_droid'), dRecipe));
  ok('(fix) boosted: structural_alloys (tier-1 tani) NADAL ×5 {Fe:40,C:20}',
    eq(fs._getScaledRecipe(COMMODITIES.structural_alloys.recipe, 'structural_alloys'), { Fe: 40, C: 20 }));
  ok('(fix) boosted: basic_supplies (tier-1) NADAL ×5 {Fe:15,Cu:5,water:5}',
    eq(fs._getScaledRecipe(COMMODITIES.basic_supplies.recipe, 'basic_supplies'), { Fe: 15, Cu: 5, water: 5 }));
  // Dowód divergencji pre-fix: stary kod dawał Li 5000 > zapas 2000 → _hasIngredients false → STALL.
  ok('(fix) PRE-FIX divergence: playerLi 2000 < oldScaled 5000 (root-cause STALL)', FIELD_STOCK.Li < 1000 * 5);
  ok('(fix) POST-FIX: _hasIngredients(droid) === true przy zapasie gracza',
    fs._hasIngredients(dRecipe, 'automation_droid') === true);
}

// ── (b) REAL PATH boosted: droid PRODUKUJE + mirror default (identyczne) ──────
console.log('--- (b) REAL reactive path: droid produkuje w boosted I default (identycznie) ---');
function runRealPath(scenario) {
  const { fs, res, colony } = makeColony({ scenario, stock: { ...FIELD_STOCK }, credits: 5000 });
  fs.setTotalPoints(8);
  fs.setMode('reactive');
  const okOrder = fs.setOneShotJob('automation_droid', 5);   // Order 0/5 (jak w raporcie)
  const before = res.getAmount('automation_droid');
  fs._update(1.0);   // 1 rok cyw. — pełny krok
  return { fs, res, colony, okOrder, made: res.getAmount('automation_droid') - before, liLeft: res.getAmount('Li') };
}
{
  const boosted = runRealPath('civilization_boosted');
  ok('(b) boosted: setOneShotJob zaakceptowany (isRecipeAvailable)', boosted.okOrder === true);
  // Li 2000 / 1000 = 2 droidy — po fixie prawdziwym limitem jest zapas Li (nie fantomowe ×5).
  ok('(b) boosted REAL PATH: 2 droidy (Li-limited 2000/1000; 0 PRE-FIX)', boosted.made === 2);
  ok('(b) boosted: zużyto Li do 0 (2×1000, receptura NIE-skalowana)', boosted.liLeft === 0);
  ok('(b) boosted: Kr −1000 (2×500 creditCost)', boosted.colony.credits === 4000);
  ok('(b) boosted: oneShotJob.produced === 2 (postęp zlecenia)', boosted.fs.oneShotJob?.produced === 2);

  const dflt = runRealPath('civilization');
  ok('(b) default: droid recipe też NIE skalowana (isBoosted false)',
    eq(dflt.fs._getScaledRecipe(COMMODITIES.automation_droid.recipe, 'automation_droid'), COMMODITIES.automation_droid.recipe));
  ok('(b) default REAL PATH: 2 droidy', dflt.made === 2);
  ok('(b) MIRROR: produkcja IDENTYCZNA w boosted i default (jedna cena)', boosted.made === dflt.made);
}

// ── (a) getStallReason nazywa prawdziwy blocker ──────────────────────────────
console.log('--- (a) getStallReason: missing / insolvent / no_points / tech_blocked / target_done ---');
{
  const { fs, res, colony } = makeColony({ scenario: 'civilization', stock: {}, credits: 10000 });
  const setStock = (o) => { for (const k of ['Li', 'C', 'Fe', 'Cu', 'Si']) res.inventory.set(k, o[k] ?? 0); };
  const A = (over = {}) => ({ commodityId: 'automation_droid', points: 1, progress: 0, produced: 0, targetQty: null, ...over });

  // missing_ingredient — Li poniżej recepty (reszta z zapasem).
  setStock({ Li: 500, C: 9999, Fe: 9999, Cu: 9999, Si: 9999 });
  const s1 = fs.getStallReason('automation_droid', A());
  ok('(a) missing_ingredient kind', s1?.kind === 'missing_ingredient');
  ok('(a) missing nazywa Li need1000 have500', s1.missing.some(m => m.resId === 'Li' && m.need === 1000 && m.have === 500));

  // insolvent — pełny zapas, kredyty < creditCost.
  setStock({ Li: 9999, C: 9999, Fe: 9999, Cu: 9999, Si: 9999 });
  colony.credits = 200;
  const s2 = fs.getStallReason('automation_droid', A());
  ok('(a) insolvent kind (Kr 200 < 500)', s2?.kind === 'insolvent' && s2.creditCost === 500 && s2.credits === 200);

  // no_points — pełny zapas, kredyty OK, 0 FP.
  colony.credits = 10000;
  const s3 = fs.getStallReason('automation_droid', A({ points: 0 }));
  ok('(a) no_points kind (składniki+Kr OK, 0 FP)', s3?.kind === 'no_points');

  // producing — pełny zapas, Kr OK, FP>0 → null (nie stall).
  const s3b = fs.getStallReason('automation_droid', A());
  ok('(a) producing → null (nie stall)', s3b === null);

  // tech_blocked — android_worker: semiconductor_arrays wymaga basic_computing (locked).
  const s4 = fs.getStallReason('android_worker', { commodityId: 'android_worker', points: 1, progress: 0, produced: 0, targetQty: null });
  ok('(a) tech_blocked kind (semiconductor_arrays: basic_computing)',
    s4?.kind === 'tech_blocked' && s4.blocked.some(b => b.ingredientId === 'semiconductor_arrays'));

  // ordering — missing beats insolvent gdy oba prawdziwe.
  setStock({ Li: 100, C: 9999, Fe: 9999, Cu: 9999, Si: 9999 });
  colony.credits = 10;
  const s5 = fs.getStallReason('automation_droid', A());
  ok('(a) priorytet: missing_ingredient > insolvent', s5?.kind === 'missing_ingredient');

  // target_done — produced >= targetQty.
  const s6 = fs.getStallReason('automation_droid', A({ points: 0, produced: 5, targetQty: 5 }));
  ok('(a) target_done kind', s6?.kind === 'target_done');

  // ekspozycja przez getAllocations() — paused alloc niesie stallReason.
  setStock({ Li: 100, C: 9999, Fe: 9999, Cu: 9999, Si: 9999 });   // missing Li
  colony.credits = 10000;
  fs._allocations = new Map([['automation_droid', { points: 0, progress: 0, produced: 0, targetQty: null }]]);
  const row = fs.getAllocations().find(r => r.commodityId === 'automation_droid');
  ok('(a) getAllocations() eksponuje stallReason', row && row.paused === true && row.stallReason?.kind === 'missing_ingredient');
}

// ── (#2) scan: żaden inny commodity nie jest zniekształcany ×5 ────────────────
console.log('--- (#2) scan: android tier-3 nie skalowany; droid = jedyny tier-1 absolutny ---');
{
  const { fs } = makeColony({ scenario: 'civilization_boosted', stock: {} });
  ok('(#2) android_worker tier 3', COMMODITIES.android_worker.tier === 3);
  ok('(#2) android recipe NIE skalowana w boosted (guard tier!==1)',
    eq(fs._getScaledRecipe(COMMODITIES.android_worker.recipe, 'android_worker'), COMMODITIES.android_worker.recipe));
  const t1Droids = Object.values(COMMODITIES).filter(c => c.tier === 1 && c.isDroidUnit).map(c => c.id);
  ok('(#2) automation_droid = JEDYNY tier-1 isDroidUnit', t1Droids.length === 1 && t1Droids[0] === 'automation_droid');
  // Jedyny tier-1 z jakimkolwiek składnikiem >100 (receptura absolutna, nie „tania").
  const t1Absolute = Object.values(COMMODITIES)
    .filter(c => c.tier === 1 && Object.values(c.recipe || {}).some(v => v > 100)).map(c => c.id);
  ok('(#2) automation_droid = JEDYNY tier-1 z recepturą absolutną (>100) → exemption kompletny',
    t1Absolute.length === 1 && t1Absolute[0] === 'automation_droid');
  // Wszystkie inne isDroidUnit są tier>1 (poza zasięgiem ×5 z konstrukcji).
  const otherDroidUnits = Object.values(COMMODITIES).filter(c => c.isDroidUnit && c.tier !== 1);
  ok('(#2) pozostałe isDroidUnit są tier>1 (android)', otherDroidUnits.every(c => c.tier > 1));
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
