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

// Stub: civMode ON, brak prosperitySystem → getGrowthMultiplier() domyślnie 1.0.
window.KOSMOS = { civMode: true, timeSystem: { gameTime: 0 } };

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

console.log('--- T1: krzywa logistyczna (szczyt w środku, 0 przy capacity) ---');
const planet = { id: 'pg', atmosphere: 'breathable' };  // canLiveOutside = true
const civ = new CivilizationSystem({}, null, planet);
civ.housing = 100;   // capacity = Σ housing

function growthAt(humansInt) {
  for (const s of Object.values(civ.strata)) s.count = 0;
  civ.strata.laborer.count = humansInt;   // humans = count + _growthProgress
  civ._growthProgress = 0;
  return civ._computeLogisticGrowth();
}

const g10 = growthAt(10), g50 = growthAt(50), g90 = growthAt(90), g100 = growthAt(100);
console.log(`    growth@10=${g10.toFixed(4)} @50=${g50.toFixed(4)} @90=${g90.toFixed(4)} @100=${g100.toFixed(4)}`);
ok('growth > 0 przy humans=10% capacity', g10 > 0);
ok('growth SZCZYT w środku (@50 > @10)', g50 > g10);
ok('growth maleje ku pełnemu (@50 > @90)', g50 > g90);
ok('growth === 0 przy humans === capacity', g100 === 0);
ok('growth === 0 powyżej capacity (@120)', growthAt(120) === 0);
ok('szczyt @50 największy z {10,50,90}', g50 >= g10 && g50 >= g90);

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
// Świeża kolonia: humans=48, capacity=160, breathable, prosperity mult 1.0
// → growth ≈ 0.04 × 48 × (1−48/160=0.7) = 1.344 pop/rok cywilny.
const civC = new CivilizationSystem({}, null, { id: 'pc', atmosphere: 'breathable' });
civC.resourceSystem = new ResourceSystem({});
civC.housing = 160;
for (const s of Object.values(civC.strata)) s.count = 0;
civC.strata.laborer.count = 48; civC._growthProgress = 0;
const expected = civC._computeLogisticGrowth();
console.log(`    _computeLogisticGrowth(humans=48, cap=160, breathable) = ${expected.toFixed(4)}/rok cyw. (oczek. ≈1.34)`);
ok('growth ≈ 0.04×48×0.7 = 1.34/rok (breathable planetMod = 1.0)', Math.abs(expected - 1.344) < 0.05);
// JEDYNA metryka wzrostu (Population 2.0) — UI czyta getAnnualGrowth(), NIE legacy populationGrowthRate.
ok('getAnnualGrowth() ≈ 1.34 (humans=48/cap=160/breathable/mult=1.0)', Math.abs(civC.getAnnualGrowth() - 1.344) < 0.05);
ok('populationGrowthRate USUNIĘTE (getter nie istnieje)', civC.populationGrowthRate === undefined);
// Jeden rok cywilny (civDeltaYears=1) → wzrost aplikowany DOKŁADNIE raz (nie per-tick / nie 12×).
const pg0 = civC._growthProgress, pop0 = civC.population;
EventBus.emit('time:tick', { deltaYears: 1 / 12, civDeltaYears: 1, gameTime: 1 });
const applied = (civC._growthProgress - pg0) + (civC.population - pop0);
console.log(`    po 1 roku cyw.: Δ(growthProgress + born) = ${applied.toFixed(4)} (= 1× growth)`);
ok('wzrost zaaplikowany RAZ na rok cywilny (≈ expected, nie N×)', Math.abs(applied - expected) < 0.05);

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
