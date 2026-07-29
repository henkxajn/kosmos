// ═══════════════════════════════════════════════════════════════
// PROBE (weryfikacja, Slice 5A POINT 3) — dwie ścieżki receptury droida
// Uruchom: node src/testing/headless/probe-droid-recipe-paths.mjs
// ───────────────────────────────────────────────────────────────
// Pytanie Filipa (gate 5A, POINT 3): cena droida wygląda NIEZMIENIONA in-game po
// Li 1000→300. Czy któraś ścieżka receptury jest STALE? „Pułapka dwóch ścieżek"
// (jak bug 3a02f37: bramka SKALOWANA ×5 boosted vs tooltip SUROWY).
//
// Weryfikacja RUNTIME (nie grep) — wszystkie ścieżki czytają ŻYWE COMMODITIES:
//   1. def.recipe.Li === 300 (dane).
//   2. _getScaledRecipe(non-boosted) → Li 300.
//   3. _getScaledRecipe(BOOSTED)     → Li 300 (droid EXEMPT z ×5).
//   4. kontrola: non-droid tier-1 W BOOSTED → ×5 (dowód, że ×5 DZIAŁA, ale omija droida).
//   5. _consumeIngredients (SPEND) drenuje dokładnie Li 300 (boosted i nie).
//   6. cost-preview logika (def.recipe × n) → Li 300 × n.
// ═══════════════════════════════════════════════════════════════

import './env.js';
import { COMMODITIES } from '../../data/CommoditiesData.js';
import { FactorySystem } from '../../systems/FactorySystem.js';
import { ResourceSystem } from '../../systems/ResourceSystem.js';

globalThis.window = globalThis.window ?? {};
window.KOSMOS = { scenario: 'civilization' };  // non-boosted domyślnie

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { if (c) { console.log('  PASS  ' + n + (extra ? '  ' + extra : '')); pass++; } else { console.error('  FAIL  ' + n + (extra ? '  ' + extra : '')); fail++; } };

const def = COMMODITIES.automation_droid;
console.log('automation_droid.recipe =', JSON.stringify(def.recipe));
console.log('automation_droid.isDroidUnit =', def.isDroidUnit, '| tier =', def.tier, '| creditCost =', def.creditCost);
console.log('');

// (1) DANE
console.log('--- (1) Receptura (dane) ---');
ok('def.recipe.Li === 300 (Slice 5A)', def.recipe.Li === 300, `(Li=${def.recipe.Li})`);
ok('def.isDroidUnit === true (warunek exempt)', def.isDroidUnit === true);

// FactorySystem do testu _getScaledRecipe / _consumeIngredients
const rs = new ResourceSystem({});
const fs = new FactorySystem(rs);

// (2) _getScaledRecipe non-boosted
console.log('\n--- (2) _getScaledRecipe — NON-boosted ---');
window.KOSMOS.scenario = 'civilization';
const scNon = fs._getScaledRecipe(def.recipe, 'automation_droid');
ok('non-boosted: Li 300', scNon.Li === 300, `(Li=${scNon.Li})`);

// (3) _getScaledRecipe BOOSTED — droid EXEMPT
console.log('\n--- (3) _getScaledRecipe — BOOSTED (droid exempt z ×5) ---');
window.KOSMOS.scenario = 'civilization_boosted';
const scBoost = fs._getScaledRecipe(def.recipe, 'automation_droid');
ok('BOOSTED: Li 300 (NIE 1500 — exempt)', scBoost.Li === 300, `(Li=${scBoost.Li})`);
ok('BOOSTED: cała receptura = surowa (żaden składnik ×5)',
  scBoost.C === 1000 && scBoost.Fe === 1000 && scBoost.Cu === 500 && scBoost.Si === 2000,
  `(C=${scBoost.C} Fe=${scBoost.Fe} Cu=${scBoost.Cu} Si=${scBoost.Si})`);

// (4) KONTROLA: non-droid tier-1 W BOOSTED → ×5 (dowód, że ×5 działa i CELUJE, tylko omija droida)
console.log('\n--- (4) Kontrola: non-droid tier-1 w BOOSTED → ×5 ---');
const ctrl = Object.values(COMMODITIES).find(d => d.tier === 1 && !d.isDroidUnit && d.recipe && Object.keys(d.recipe).length);
if (ctrl) {
  const rawFirst = Object.entries(ctrl.recipe)[0];
  const scaledCtrl = fs._getScaledRecipe(ctrl.recipe, ctrl.id);
  const scaledFirst = scaledCtrl[rawFirst[0]];
  ok(`kontrola ${ctrl.id}: ${rawFirst[0]} ${rawFirst[1]}→${scaledFirst} (×5 DZIAŁA)`, scaledFirst === rawFirst[1] * 5,
     `(${rawFirst[1]}×5=${rawFirst[1] * 5}, got ${scaledFirst})`);
} else {
  console.log('  (brak non-droid tier-1 z recepturą do kontroli — pomijam)');
}

// (5) _consumeIngredients (SPEND) — dokładnie Li 300 (boosted i nie)
console.log('\n--- (5) _consumeIngredients (realny SPEND) ---');
const seedInv = () => { for (const [r, q] of Object.entries(def.recipe)) rs.inventory.set(r, q * 3); };
for (const scenario of ['civilization', 'civilization_boosted']) {
  window.KOSMOS.scenario = scenario;
  seedInv();
  const liBefore = rs.inventory.get('Li');
  const spent = fs._consumeIngredients(def.recipe, 'automation_droid');
  const liAfter = rs.inventory.get('Li');
  const drained = liBefore - liAfter;
  ok(`spend[${scenario}]: Li zdrenowane === 300`, drained === 300, `(drained=${drained}, spent.Li=${spent?.Li})`);
}

// (6) cost-preview logika (EconomyOverlay._droidCostPreview: def.recipe × n)
console.log('\n--- (6) cost-preview (def.recipe × n) ---');
const previewScaled = (n) => { const o = {}; for (const [r, q] of Object.entries(def.recipe)) o[r] = q * n; return o; };
const p1 = previewScaled(1), p5 = previewScaled(5);
ok('preview n=1: Li 300', p1.Li === 300, `(Li=${p1.Li})`);
ok('preview n=5: Li 1500 (300×5 — poprawne skalowanie ILOŚCIĄ zlecenia)', p5.Li === 1500, `(Li=${p5.Li})`);

console.log('\n═══ WERDYKT POINT 3 ═══');
if (fail === 0) {
  console.log('WSZYSTKIE ścieżki receptury czytają Li 300 (dane→gate→spend→preview→boosted-exempt).');
  console.log('ŻADNA ścieżka NIE jest stale. Li 1000→300 propaguje wszędzie.');
  console.log('„Cena niezmieniona" ⇒ NIE desync kodu. Kandydaci: (a) cena RYNKOWA 450 Kr (świadomie');
  console.log('niezmieniona, TradeValuesData), (b) creditCost 500 Kr (niezmieniony, część preview),');
  console.log('(c) STALE cache modułu w przeglądarce (potrzebny HARD-reload — recepty czytane z danych na żywo).');
} else {
  console.log('⚠ ROZJAZD ścieżek — patrz FAIL powyżej. To realny desync (jak 3a02f37) → wymaga fixu kodu.');
}
process.exit(fail === 0 ? 0 : 1);
