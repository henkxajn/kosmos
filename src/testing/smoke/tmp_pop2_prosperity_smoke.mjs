// Population 2.0 (Faza 1) — REKALIBRACJA prosperity (§3.6): GAMMA + inercja 0.08.
// Uruchom: node src/testing/smoke/tmp_pop2_prosperity_smoke.mjs
//
// Pokrycie (plan §Testy (c)):
//   T1  inercja: po jednym roku prosperity przesuwa się o 8% luki do targetu.
//   T2  GAMMA: zawyżone prosperity (stary save) dryfuje w dół.
//   T3  GAMMA math: target = 100×(raw/100)^1.5 < raw dla raw<100.

import '../headless/env.js'; // MUST be first
import { ResourceSystem }     from '../../systems/ResourceSystem.js';
import { CivilizationSystem } from '../../systems/CivilizationSystem.js';
import { ProsperitySystem }   from '../../systems/ProsperitySystem.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

const planet = { id: 'pp', atmosphere: 'breathable', temperatureC: 15, surfaceGravity: 1.0 };
const res = new ResourceSystem({});
const civ = new CivilizationSystem({}, null, planet); civ.resourceSystem = res; civ.housing = 100;
const prosp = new ProsperitySystem(res, civ, null, planet);
window.KOSMOS = {
  civMode: true, prosperitySystem: prosp, civSystem: civ,
  colonyManager: { taxRate: 0.08, getAllColonies: () => [], getColony: () => null },
  timeSystem: { gameTime: 0 }, factionSystem: null,
};

console.log('--- T1: inercja — delta ≈ 8% luki do targetu ---');
prosp.prosperity = 20;
const before = prosp.prosperity;
prosp._yearlyUpdate();
const gap = prosp.targetProsperity - before;
const delta = prosp.prosperity - before;
console.log(`    before=${before} target=${prosp.targetProsperity.toFixed(2)} after=${prosp.prosperity.toFixed(2)} ratio=${(delta / gap).toFixed(3)}`);
ok('inercja: delta ≈ 8% luki (0.08, było 0.15)', Math.abs(delta / gap - 0.08) < 0.005);

console.log('--- T2: GAMMA — zawyżone prosperity dryfuje w dół ---');
prosp.prosperity = 95;
const p0 = prosp.prosperity;
for (let i = 0; i < 15; i++) prosp._yearlyUpdate();
console.log(`    zawyżone prosperity ${p0} → ${prosp.prosperity.toFixed(2)} po 15 latach`);
ok('GAMMA: zawyżone prosperity (95) spada', prosp.prosperity < p0 - 5);

console.log('--- T3: GAMMA math — target = 100×(raw/100)^1.5 ---');
const gamma = (raw) => 100 * Math.pow(raw / 100, 1.5);
ok('GAMMA: 64 → ~51.2 (malejące u góry)', Math.abs(gamma(64) - 51.2) < 0.5);
ok('GAMMA: 100 → 100 (punkt stały)', Math.abs(gamma(100) - 100) < 1e-9);
ok('GAMMA: obniża target dla raw<100 (36 → <36)', gamma(36) < 36);

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
