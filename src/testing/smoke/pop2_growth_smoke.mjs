// Population 2.0 (Faza 1) — wzrost LOGISTYCZNY (§3.1).
// Uruchom: node src/testing/smoke/tmp_pop2_growth_smoke.mjs
//
// Pokrycie (plan §Testy (b)):
//   growth = rate × humans × (1 − humans/capacity); szczyt w środku, 0 przy capacity.
//   Decision 1: capacity = Σ housing. Bramka non-breathable (bez habitatów → 0).

import '../headless/env.js'; // MUST be first
import EventBus from '../../core/EventBus.js';
import { ResourceSystem } from '../../systems/ResourceSystem.js';
import { CivilizationSystem } from '../../systems/CivilizationSystem.js';
import { MAX_GROWTH_PER_YEAR } from '../../data/PopulationData.js';   // POINT 2: asercje wg ŻYWEJ stałej (odporne na retune)

// Stub: civMode ON, brak prosperitySystem → getGrowthMultiplier() domyślnie 1.0.
window.KOSMOS = { civMode: true, timeSystem: { gameTime: 0 } };

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

console.log('--- T1: krzywa logistyczna (szczyt w środku, 0 przy capacity) ---');
const planet = { id: 'pg', atmosphere: 'breathable' };  // canLiveOutside = true
const civ = new CivilizationSystem({}, null, planet);
// POINT 2 (cap 1.0→0.25): przy cap 0.25 klamra spłaszcza krzywą już od ~humans 7 (plateau ~3/gameYr —
// pożądany kształt). By testować SAM KSZTAŁT logistyczny (szczyt w środku) mierzymy przy MAŁEJ pojemności
// (20), gdzie cały przebieg zostaje SUB-cap i klamra nie zafałszowuje krzywej.
civ.housing = 20;   // capacity = Σ housing (mała → cały przebieg poniżej cap 0.25)

function growthAt(humansInt) {
  for (const s of Object.values(civ.strata)) s.count = 0;
  civ.strata.laborer.count = humansInt;   // humans = count + _growthProgress
  civ._growthProgress = 0;
  return civ._computeLogisticGrowth();
}

const g2 = growthAt(2), g10 = growthAt(10), g18 = growthAt(18), g20 = growthAt(20);
console.log(`    growth@2=${g2.toFixed(4)} @10=${g10.toFixed(4)} @18=${g18.toFixed(4)} @20=${g20.toFixed(4)} (sub-cap: kształt logistyczny)`);
ok('growth > 0 przy humans=10% capacity', g2 > 0);
ok('growth SZCZYT w środku (@10 > @2)', g10 > g2);
ok('growth maleje ku pełnemu (@10 > @18)', g10 > g18);
ok('growth === 0 przy humans === capacity', g20 === 0);
ok('growth === 0 powyżej capacity (@24)', growthAt(24) === 0);
ok('szczyt @10 największy z {2,10,18}', g10 >= g2 && g10 >= g18);
ok('POINT 2: cały przebieg SUB-cap (kształt nie zafałszowany klamrą)', g2 < MAX_GROWTH_PER_YEAR && g10 < MAX_GROWTH_PER_YEAR && g18 < MAX_GROWTH_PER_YEAR);

console.log('--- T2: bramka non-breathable (Decision 1: gate ZACHOWANY) ---');
const civNB = new CivilizationSystem({}, null, { id: 'pnb', atmosphere: 'none' });
civNB.housing = 100;
const setNB = (pop, habHousing) => {
  for (const s of Object.values(civNB.strata)) s.count = 0;
  civNB.strata.laborer.count = pop; civNB._growthProgress = 0;
  civNB.habitatHousing = habHousing;
};
setNB(10, 5);   // pop 10 ≥ habitatHousing 5 → brak wzrostu
ok('non-breathable: pop≥habitatHousing → growth 0', civNB._computeLogisticGrowth() === 0);
setNB(10, 50);  // habitaty 50 > pop 10 → wzrost rusza
ok('non-breathable: habitaty > pop → growth > 0', civNB._computeLogisticGrowth() > 0);

console.log('--- T3: kadencja — wzrost RAZ na rok cywilny + wartość ≈ oczekiwana (FIX 2a) ---');
civ.dispose(); civNB.dispose();   // izolacja od współdzielonego time:tick
// Świeża kolonia: humans=48, capacity=160, breathable, prosperity mult 1.0.
// POINT 2 re-gate (cap 1.0→0.25): uncapped = 0.04 × taper(400/448=0.893) × 48 × (1−48/160=0.7) = 1.20,
// CAPPED do MAX_GROWTH_PER_YEAR=0.25 (plateau ~3 POP/gameYr @×12). (Przed 5A: uncapped 1.344.)
const civC = new CivilizationSystem({}, null, { id: 'pc', atmosphere: 'breathable' });
civC.resourceSystem = new ResourceSystem({});
civC.housing = 160;
for (const s of Object.values(civC.strata)) s.count = 0;
civC.strata.laborer.count = 48; civC._growthProgress = 0;
const expected = civC._computeLogisticGrowth();
console.log(`    _computeLogisticGrowth(humans=48, cap=160, breathable) = ${expected.toFixed(4)}/rok cyw. (CAPPED = MAX_GROWTH_PER_YEAR=${MAX_GROWTH_PER_YEAR}, uncapped ~1.20)`);
ok('POINT 2: growth CAPPED do MAX_GROWTH_PER_YEAR (uncapped ~1.20 >> cap)', Math.abs(expected - MAX_GROWTH_PER_YEAR) < 0.001);
// JEDYNA metryka wzrostu (Population 2.0) — UI czyta getAnnualGrowth(), NIE legacy populationGrowthRate.
ok('getAnnualGrowth() ≈ cap (humans=48/cap=160/breathable/mult=1.0)', Math.abs(civC.getAnnualGrowth() - MAX_GROWTH_PER_YEAR) < 0.001);
// POINT 2: cap 0.25 kąsa już przy NISKIEJ populacji — humans=8 uncapped 0.04×taper(400/408=0.980)×8×
// (1−8/160=0.95) ≈ 0.298 > cap 0.25 → CLAMPED. (Przy capie 1.0 był poniżej — plateau zaczyna się wcześnie.)
{
  const civClamp = new CivilizationSystem({}, null, { id: 'pclamp', atmosphere: 'breathable' });
  civClamp.resourceSystem = new ResourceSystem({});
  civClamp.housing = 160;
  for (const s of Object.values(civClamp.strata)) s.count = 0;
  civClamp.strata.laborer.count = 8; civClamp._growthProgress = 0;
  ok('POINT 2: cap kąsa już @humans=8 (uncapped ~0.298 > 0.25 → clamp)', Math.abs(civClamp._computeLogisticGrowth() - MAX_GROWTH_PER_YEAR) < 0.001);
  civClamp.dispose();
}
// Genuine sub-cap (weryfikuje taper+bazę UNCLAMPED): humans=6 → 0.04×taper(400/406=0.985)×6×(1−6/160=0.9625)
// ≈ 0.2276 < cap 0.25 (jedno z niewielu miejsc, gdzie krzywa jest pod klamrą po re-gate).
{
  const civSub = new CivilizationSystem({}, null, { id: 'psub', atmosphere: 'breathable' });
  civSub.resourceSystem = new ResourceSystem({});
  civSub.housing = 160;
  for (const s of Object.values(civSub.strata)) s.count = 0;
  civSub.strata.laborer.count = 6; civSub._growthProgress = 0;
  const gSub = civSub._computeLogisticGrowth();
  ok('sub-cap taper+baza UNCLAMPED (humans=6 → ≈0.2276, < cap 0.25)', Math.abs(gSub - 0.2276) < 0.01 && gSub < MAX_GROWTH_PER_YEAR);
  civSub.dispose();
}
ok('populationGrowthRate USUNIĘTE (getter nie istnieje)', civC.populationGrowthRate === undefined);
// Jeden rok cywilny (civDeltaYears=1) → wzrost aplikowany DOKŁADNIE raz (nie per-tick / nie 12×).
const pg0 = civC._growthProgress, pop0 = civC.population;
EventBus.emit('time:tick', { deltaYears: 1 / 12, civDeltaYears: 1, gameTime: 1 });
const applied = (civC._growthProgress - pg0) + (civC.population - pop0);
console.log(`    po 1 roku cyw.: Δ(growthProgress + born) = ${applied.toFixed(4)} (= 1× growth)`);
ok('wzrost zaaplikowany RAZ na rok cywilny (≈ expected, nie N×)', Math.abs(applied - expected) < 0.05);

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
