// Finding 743 — keeper: etap Sfery Dysona i pierścienie 3D wracają po wczytaniu zapisu i po przebudowie układu.
//
// L — `dysonViewStage` (czysta): etap z liczby ukończonych segmentów (= getDysonVisualStage) w układzie macierzystym, 0 gdzie indziej.
// R — zapis → wczytanie (DysonSystem.serialize / restore): etap widoku po wczytaniu == etap przed zapisem (dla każdej liczby 0..20).
// P — piny źródła żywej ścieżki (ThreeRenderer i GameScene nie importują się pod node — THREE.TextureLoader):
//     switchSystem woła _restoreDysonStage po _disposeAllMeshes; _restoreDysonStage liczy etap przez dysonViewStage z completedCount
//     i stosuje updateStarForDyson; GameScene po DysonSystem.restore woła _restoreDysonStage; handler 'dyson:visualStageChanged'
//     idzie tą samą ścieżką. Efekt (etap 3D == zapisany, pierścienie są) mierzony na żywym silniku (STOP K5 / close-out).
// Pins degrade, never abort: moduł jeszcze nieistniejący — import dynamiczny.

import '../headless/env.js';
import { readFileSync } from 'node:fs';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const SL = await tryImport('../../renderer/DysonStageLogic.js');
const DD = await import('../../data/DysonData.js');
const { DysonSystem } = await import('../../systems/DysonSystem.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n').replace(/\/\/.*$/gm, '');
const v = (n, view, home) => SL?.dysonViewStage?.(n, view, home);

console.log('\nL — etap widoku');
assert([0, 1, 5, 6, 11, 12, 15, 16, 20].every((n) => v(n, 'sys_home', 'sys_home') === DD.getDysonVisualStage(n)), 'L1 układ macierzysty: etap = getDysonVisualStage(segmenty)');
assert(v(12, 'sys_7', 'sys_home') === 0 && v(0, 'sys_home', 'sys_home') === 0, 'L2 inny układ albo 0 segmentów → 0 (bez pierścieni)');
assert(v(3, null, null) === 1 && v(3, 'sys_home', null) === 1 && v(3, 'sys_9', 'sys_9') === 1, 'L3 brak id → układ macierzysty');

console.log('\nR — zapis → wczytanie');
window.KOSMOS = { homePlanet: { id: 'h' }, colonyManager: { getColony: () => null }, resourceSystem: { removeProducer() {}, registerProducer() {} }, buildingSystem: null };
let ok = true;
for (let n = 0; n <= 20; n++) {
  const a = new DysonSystem();
  const segs = {};
  for (let i = 1; i <= 20; i++) segs[i] = { delivered: {}, completed: i <= n };
  a.restore({ active: true, unlockedPhases: ['phase_1'], completedCount: n, researchBonus: 5 * n, segments: segs });
  const before = v(a.completedCount, 'sys_home', 'sys_home');
  const b = new DysonSystem();
  b.restore(JSON.parse(JSON.stringify(a.serialize())));
  if (v(b.completedCount, 'sys_home', 'sys_home') !== before || before !== DD.getDysonVisualStage(n)) ok = false;
}
assert(ok && !!SL, 'R1 0..20 segmentów: etap widoku po wczytaniu == przed zapisem');

console.log('\nP — piny źródła żywej ścieżki');
const TR = src('../../renderer/ThreeRenderer.js');
const GS = src('../../scenes/GameScene.js');
const sw = (TR.match(/\n  switchSystem\([^)]*\) \{[\s\S]*?\n  \}\n/) ?? [''])[0];
assert(sw.length > 100, 'P0 świadek: ciało switchSystem znalezione');
assert(/_disposeAllMeshes\(\)[\s\S]*this\._restoreDysonStage\(\)/.test(sw), 'P1 switchSystem: _restoreDysonStage() po _disposeAllMeshes()');
const rs = (TR.match(/\n  _restoreDysonStage\(\) \{[\s\S]*?\n  \}\n/) ?? [''])[0];
assert(/dysonViewStage\(/.test(rs) && /completedCount/.test(rs) && /this\.updateStarForDyson\(stage\)/.test(rs), 'P2 _restoreDysonStage: dysonViewStage(completedCount, …) → updateStarForDyson');
assert(/this\.dysonSystem\.restore\([^;]*\);\s*this\.threeRenderer\?\._restoreDysonStage\?\.\(\);/.test(GS), 'P3 GameScene: po DysonSystem.restore → _restoreDysonStage');
const h = (GS.match(/EventBus\.on\('dyson:visualStageChanged'[\s\S]*?\}\);/) ?? [''])[0];
assert(/_restoreDysonStage/.test(h) && !/updateStarForDyson/.test(h), "P4 handler 'dyson:visualStageChanged' tą samą ścieżką");

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} dyson_stage_restore_smoke: ${pass} ✓ / ${fail} ✗`);
process.exitCode = fail === 0 ? 0 : 1;
