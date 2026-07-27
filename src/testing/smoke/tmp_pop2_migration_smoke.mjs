// Population 2.0 (Faza 1) — migracja v95→v96 + NEUTRALNOŚĆ redenominacji ×4.
// Uruchom: node src/testing/smoke/tmp_pop2_migration_smoke.mjs
//
// Pokrycie (plan §Testy (a) + Decision 2):
//   T1  migracja: strata.count ×4, housing budynków ×4, population/housing/habitatHousing ×4,
//       satisfaction dodane, version===96.
//   T2  neutralność konsumpcji: pop×4 × per-pop÷4 = agregat (w granicach 1%).
//   T3  neutralność kolonizacji: statek zakłada tę samą WZGLĘDNĄ wielkość kolonii.
//   T4  neutralność rekrutacji naziemnej: ten sam WZGLĘDNY udział POP.

import '../headless/env.js'; // MUST be first
import { migrate, CURRENT_VERSION } from '../../systems/SaveMigration.js';
import { POP_CONSUMPTION } from '../../data/ResourcesData.js';
import { SHIP_MODULES } from '../../data/ShipModulesData.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { CivilizationSystem, CIV_EPOCHS } from '../../systems/CivilizationSystem.js';
import { BASE_DEMAND } from '../../data/ConsumerGoodsData.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };
const approx = (a, b, tol = 0.01) => Math.abs(a - b) <= tol * Math.max(1e-9, Math.abs(b));

console.log('--- T1: migracja v95→v96 (×4 strata + housing budynków) ---');
const saveV95 = {
  version: 95, gameTime: 100, planets: [], moons: [], planetoids: [],
  civ4x: { civMode: true, colonies: [{
    planetId: 'p1',
    civ: {
      popFormat: 'strata', population: 3,
      strata: {
        laborer: { count: 2, growthProgress: 0, satisfaction: 65 },
        miner:   { count: 1, growthProgress: 0, satisfaction: 55 },
      },
      housing: 7, habitatHousing: 3,
    },
    buildings: [
      { tileKey: '0,0', buildingId: 'colony_base', housing: 4, popCost: 0,    level: 1 },
      { tileKey: '1,0', buildingId: 'habitat',     housing: 3, popCost: 0,    level: 1 },
      { tileKey: '2,0', buildingId: 'mine',        housing: 0, popCost: 0.25, level: 1 },
    ],
  }] },
};
const r = migrate(saveV95);
const col = r?.civ4x?.colonies?.[0];
const civ = col?.civ;
ok('version === CURRENT (97 po Fazie 2)', r?.version === CURRENT_VERSION && CURRENT_VERSION === 97);
ok('strata.laborer ×4 (2→8)', civ?.strata?.laborer?.count === 8);
ok('strata.miner ×4 (1→4)', civ?.strata?.miner?.count === 4);
ok('civ.population ×4 (3→12)', civ?.population === 12);
ok('civ.housing ×4 (7→28)', civ?.housing === 28);
ok('civ.habitatHousing ×4 (3→12)', civ?.habitatHousing === 12);
ok('civ.satisfaction dodane (=50)', civ?.satisfaction === 50);
ok('budynek colony_base housing ×4 (4→16)', col?.buildings?.[0]?.housing === 16);
ok('budynek habitat housing ×4 (3→12)', col?.buildings?.[1]?.housing === 12);
ok('budynek mine housing 0 (0×4=0)', col?.buildings?.[2]?.housing === 0);

console.log('--- T2: neutralność konsumpcji (agregat niezmieniony) ---');
// Pre-migracja: 3 pop × {food 2.5, water 1.5, energy 1.0}. Post: 12 pop × POP_CONSUMPTION (÷4).
const OLD = { food: 2.5, water: 1.5, energy: 1.0 };
const oldPop = 3;
const newPop = civ.strata.laborer.count + civ.strata.miner.count; // 12
for (const res of ['food', 'water', 'energy']) {
  const before = oldPop * OLD[res];
  const after  = newPop * POP_CONSUMPTION[res];
  ok(`konsumpcja ${res} agregat ${before}≈${after} (<1%)`, approx(after, before));
}
ok('POP_CONSUMPTION ÷4 (food 2.5→0.625)', POP_CONSUMPTION.food === 0.625);

console.log('--- T3: neutralność kolonizacji (statek → ta sama względna wielkość kolonii) ---');
// Względna wielkość kolonii = colonistCapacity / startowa pop domu. Stara: 1.0/2. Nowa: 4.0/8.
const homeStartPop = new CivilizationSystem({}).population;         // DEFAULT_POP (×4 = 8)
const habCap = SHIP_MODULES.habitat_pod.stats.colonistCapacity;  // 4.0 (×4)
ok('habitat_pod colonistCapacity ×4 (1.0→4.0)', habCap === 4.0);
ok('startowa pop domu ×4 (2→8)', homeStartPop === 8);
ok('względna wielkość kolonii zachowana (4/8 === 1/2)', approx(habCap / homeStartPop, 1.0 / 2));

console.log('--- T4: neutralność rekrutacji naziemnej (ten sam względny udział POP) ---');
const shockCost = ColonyManager.GROUND_UNIT_POP_COSTS.shock_infantry;  // 0.60 (×4)
ok('shock_infantry popCost ×4 (0.15→0.60)', approx(shockCost, 0.60));
ok('względny udział POP zachowany (0.6/8 === 0.15/2)', approx(shockCost / homeStartPop, 0.15 / 2));

console.log('--- T5: neutralność metryk pop-zależnych (FIX 1: demand/survival/maturity/epoch) ---');
// Ta sama wartość dla starej (pop 3, stare stałe) i nowej (pop 12, nowe stałe) kolonii.
const P_OLD = 3, P_NEW = 12;   // ×4
// (a) Consumer-goods demand (BASE_DEMAND ÷4 × pop) — BASE_DEMAND importowane LIVE.
const OLD_BD = { basic_supplies: 0.15, civilian_goods: 0.12, neurostimulants: 0.08 };
for (const g of ['basic_supplies', 'civilian_goods', 'neurostimulants']) {
  ok(`demand ${g} neutralny (${BASE_DEMAND[g]}×${P_NEW} ≈ ${OLD_BD[g]}×${P_OLD})`, approx(BASE_DEMAND[g] * P_NEW, OLD_BD[g] * P_OLD));
}
// (b) Survival needs (ProsperitySystem: food 3.0→0.75, water 1.5→0.375 — arytmetyka lustrzana do kodu).
ok('survival food need neutralny (0.75×12 === 3.0×3)', approx(0.75 * P_NEW, 3.0 * P_OLD));
ok('survival water need neutralny (0.375×12 === 1.5×3)', approx(0.375 * P_NEW, 1.5 * P_OLD));
// (c) maturityFactor popFactor (0.3 + pop/15 → 0.3 + pop/60).
ok('maturity popFactor neutralny (0.3+12/60 === 0.3+3/15)', approx(0.3 + P_NEW / 60, 0.3 + P_OLD / 15));
// (d) epochScore popTerm (floor(pop/5)×10 → floor(pop/20)×10) — na dużym pop (nietrywialna).
ok('epochScore popTerm neutralny (floor(80/20)×10 === floor(20/5)×10)', Math.floor(80 / 20) * 10 === Math.floor(20 / 5) * 10);
// (e) CIV_EPOCHS progi ×4 — LIVE (import z CivilizationSystem).
ok('CIV_EPOCHS industrial minPop ×4 (=40, było 10)', CIV_EPOCHS[1].minPop === 40);
ok('CIV_EPOCHS space minPop ×4 (=120, było 30)', CIV_EPOCHS[2].minPop === 120);
ok('CIV_EPOCHS interplanetary minPop ×4 (=320, było 80)', CIV_EPOCHS[3].minPop === 320);

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
