// Population 2.0 Slice 5C.2 — tri-state + greedy fill + transient bump + factory-pause + breakdowns.
// Uruchom: node src/testing/smoke/tmp_pop2_5c2_smoke.mjs — REALNE ścieżki CivilizationSystem+BuildingSystem.
//
// Pokrycie (plan §5C.2):
//   (A) within-stratum GREEDY fill (priorytet/tileKey pierwszy do 100%, nie uniform)
//   (B) paused → produkcja idle (puste stawki); active → przywrócone
//   (C) priority → transient bump (getPriorityHumanJobs → _effectiveTargetShare → _hasAnyTarget)
//   (D) factory-pause lifecycle (priorytet+kolejka → pauza; pusta kolejka → wznów; ręczny OFFLINE respektowany)
//   (E) getGrowthBreakdown/getSatisfactionBreakdown === live metryki
//   (F) getTargetState (off/active/inactive_no_shortage/unreachable)
//   (G) flag OFF (popAllocation2Priority) = zachowanie 5C.1 (uniform, brak paused/bump)
//   (H) designation serialize/restore round-trip (soft, bez migracji)
//   (I) cap Σ(target+bump) ≤ 100% + inwariant floor(humans)=Σstrata+U przy priorytecie

import '../headless/env.js'; // MUST be first
import EventBus from '../../core/EventBus.js';
import { ResourceSystem } from '../../systems/ResourceSystem.js';
import { CivilizationSystem, STRATA_TYPES } from '../../systems/CivilizationSystem.js';
import { BuildingSystem } from '../../systems/BuildingSystem.js';
import { FactorySystem } from '../../systems/FactorySystem.js';
import { TechSystem } from '../../systems/TechSystem.js';
import { HexGrid } from '../../map/HexGrid.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';

window.KOSMOS = { civMode: true, timeSystem: { gameTime: 0 } };
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };
const F = () => GAME_CONFIG.FEATURES;
const invariant = (civ) => Math.floor(civ.humans) === STRATA_TYPES.reduce((a, t) => a + civ.strata[t].count, 0) + civ._unemployed;

function freshMock(jobs = {}, synth = {}) {
  const civ = new CivilizationSystem({}, null, { id: 'm', atmosphere: 'breathable' });
  for (const s of Object.values(civ.strata)) s.count = 0;
  civ._unemployed = 0; civ._focusTarget = {}; civ._focusMigrationProgress = {};
  civ.buildingSystem = {
    getSlotDemand: (t) => jobs[t] ?? 0, getSyntheticJobs: (t) => synth[t] ?? 0,
    getMineEfficiency: () => 0.5, getFactoryOutputRatio: () => 0.5, getAdvancedBuildingsUptime: () => 0.5,
  };
  return civ;
}
function realSetup() {
  const tech = new TechSystem();
  const grid = new HexGrid(6, 8); grid.forEach(tl => { tl.type = 'plains'; });
  const res = new ResourceSystem({}); for (const k of res.inventory.keys()) res.inventory.set(k, 99999);
  const civ = new CivilizationSystem({}, tech, { id: 'r', atmosphere: 'breathable' });
  civ.resourceSystem = res; civ.housing = 400;
  for (const s of Object.values(civ.strata)) s.count = 0; civ._unemployed = 0;
  const bSys = new BuildingSystem(res, civ, tech); civ.buildingSystem = bSys;
  bSys._grid = grid; bSys._gridHeight = grid.height; bSys.setDeposits?.([]); bSys.setFactorySystem(new FactorySystem(res));
  window.KOSMOS.buildingSystem = bSys; window.KOSMOS.civSystem = civ; window.KOSMOS.resourceSystem = res;
  return { civ, bSys, grid, res };
}
function teardown(civ) { civ.dispose(); window.KOSMOS.civSystem = null; window.KOSMOS.buildingSystem = null; window.KOSMOS.resourceSystem = null; }
const SF = BUILDINGS['solar_farm'];   // laborer, jobs=1, produkuje energię

// ════════════════════════════════════════════════════════════════════════════
// (A) within-stratum GREEDY fill
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (A) greedy fill (priorytet/tileKey pierwszy) ---');
{
  F().popAllocation2Priority = true;
  const { civ, bSys, grid } = realSetup();
  const t1 = grid.get(1, 1); bSys._activateBuilding(t1.key, 'solar_farm', t1.r, t1.type, false);
  const t2 = grid.get(3, 3); bSys._activateBuilding(t2.key, 'solar_farm', t2.r, t2.type, false);
  civ.strata.laborer.count = 1; civ._unemployed = 0;   // 1 pracownik na 2 etaty
  bSys._reapplyAllRates();
  const e1 = bSys._getBuildingLaborEfficiency(SF, t1.key);
  const e2 = bSys._getBuildingLaborEfficiency(SF, t2.key);
  ok('(A) greedy: jeden budynek 100%, drugi 0% (NIE uniform 0.5/0.5)', (e1 === 1 && e2 === 0) || (e1 === 0 && e2 === 1));
  ok('(A) tileKey order → (1,1) napełniony pierwszy', e1 === 1 && e2 === 0);
  bSys.setBuildingDesignation(t2.key, 'priority');
  const e1p = bSys._getBuildingLaborEfficiency(SF, t1.key);
  const e2p = bSys._getBuildingLaborEfficiency(SF, t2.key);
  ok('(A) PRIORYTET t2 → t2 napełniony pierwszy (pracownik przeniesiony)', e2p === 1 && e1p === 0);
  teardown(civ);
}

// ════════════════════════════════════════════════════════════════════════════
// (B) paused → produkcja idle; active → przywrócone
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (B) paused → idle rates ---');
{
  F().popAllocation2Priority = true;
  const { civ, bSys, grid, res } = realSetup();
  const tl = grid.get(2, 2); bSys._activateBuilding(tl.key, 'solar_farm', tl.r, tl.type, false);
  const pid = bSys._active.get(tl.key).producerId;
  ok('(B) active: producent zarejestrowany', res._producers.has(pid) && Object.keys(bSys._active.get(tl.key).effectiveRates).length > 0);
  bSys.setBuildingDesignation(tl.key, 'paused');
  ok('(B) paused: effectiveRates puste', Object.keys(bSys._active.get(tl.key).effectiveRates).length === 0);
  ok('(B) paused: producent wyrejestrowany', !res._producers.has(pid));
  bSys.setBuildingDesignation(tl.key, 'active');
  ok('(B) active ponownie: stawki przywrócone', Object.keys(bSys._active.get(tl.key).effectiveRates).length > 0 && res._producers.has(pid));
  teardown(civ);
}

// ════════════════════════════════════════════════════════════════════════════
// (C) priority → transient bump
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (C) priority → transient target-bump ---');
{
  F().popAllocation2Priority = true;
  const { civ, bSys, grid } = realSetup();
  const tl = grid.get(2, 2); bSys._activateBuilding(tl.key, 'solar_farm', tl.r, tl.type, false);
  civ.strata.laborer.count = 0; civ._unemployed = 6;
  ok('(C) przed: getPriorityHumanJobs=0, brak targetu', bSys.getPriorityHumanJobs('laborer') === 0 && civ._hasAnyTarget() === false);
  bSys.setBuildingDesignation(tl.key, 'priority');
  ok('(C) priority: getPriorityHumanJobs>0', bSys.getPriorityHumanJobs('laborer') > 0);
  ok('(C) priority: _effectiveTargetShare(laborer)>0', civ._effectiveTargetShare('laborer') > 0);
  ok('(C) priority: _hasAnyTarget=true (bump aktywuje target path)', civ._hasAnyTarget() === true);
  // Alokacja ściąga bezrobotnych do laborer (jest etat + target).
  civ._allocateWorkforce();
  ok('(C) alokacja obsadziła etat priorytetowego budynku z bezrobotnych', civ.strata.laborer.count >= 1);
  ok('(C) inwariant', invariant(civ));
  teardown(civ);
}

// ════════════════════════════════════════════════════════════════════════════
// (D) factory-pause lifecycle
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (D) factory-pause (priorytet + kolejka budowy) ---');
{
  F().popAllocation2Priority = true;
  const { civ, bSys, grid } = realSetup();
  const fs = bSys._factorySystem;
  const tl = grid.get(2, 2); bSys._activateBuilding(tl.key, 'solar_farm', tl.r, tl.type, false);
  bSys.setBuildingDesignation(tl.key, 'priority');
  ok('(D) priorytet bez kolejki → fabryki NIE spauzowane', fs.isProductionEnabled() === true);
  bSys._constructionQueue.set('5,5', { buildingId: 'solar_farm', progress: 0, buildTime: 5, tileR: 0, tileType: 'plains' });
  bSys._updateFactoryPause();
  ok('(D) priorytet + kolejka → fabryki SPAUZOWANE', fs.isProductionEnabled() === false);
  bSys._constructionQueue.clear(); bSys._updateFactoryPause();
  ok('(D) pusta kolejka → fabryki WZNOWIONE', fs.isProductionEnabled() === true);
  // ręczny OFFLINE gracza respektowany
  fs.setProductionEnabled(false);
  bSys._constructionQueue.set('5,5', { buildingId: 'solar_farm', progress: 0, buildTime: 5, tileR: 0, tileType: 'plains' });
  bSys._updateFactoryPause();
  ok('(D) ręczny OFFLINE: nie pauzujemy tego, co gracz wyłączył', fs.isProductionEnabled() === false);
  bSys._constructionQueue.clear(); bSys._updateFactoryPause();
  ok('(D) ręczny OFFLINE zachowany po naszym wznowieniu', fs.isProductionEnabled() === false);
  teardown(civ);
}

// ════════════════════════════════════════════════════════════════════════════
// (E) breakdowns === live metryki
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (E) getGrowthBreakdown/getSatisfactionBreakdown ---');
{
  F().popAllocation2Priority = true;
  const { civ } = realSetup();
  civ.housing = 200; civ.strata.laborer.count = 8; civ._unemployed = 4;
  const gb = civ.getGrowthBreakdown();
  ok('(E) growthBreakdown.growth === getAnnualGrowth', Math.abs(gb.growth - civ.getAnnualGrowth()) < 1e-9);
  ok('(E) growthBreakdown ma składniki', gb.base === 0.04 && gb.planetMod > 0 && gb.capacity === 200);
  civ._updateSatisfaction();
  const sb = civ.getSatisfactionBreakdown();
  ok('(E) satBreakdown.satisfaction === civ.satisfaction', Math.abs(sb.satisfaction - civ.satisfaction) < 1e-9);
  ok('(E) satBreakdown składniki (base+emp+crowd+tax = raw)', Math.abs((sb.base + sb.empTerm + sb.crowdTerm + sb.taxTerm) - sb.satisfaction) < 1e-6 || sb.satisfaction === 0 || sb.satisfaction === 100);
  teardown(civ);
}

// ════════════════════════════════════════════════════════════════════════════
// (F) getTargetState
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (F) getTargetState (wskaźniki suwaka) ---');
{
  F().popAllocation2Priority = true;
  const civ = freshMock({ laborer: 10 }, {});
  ok('(F) off (suwak 0)', civ.getTargetState('laborer') === 'off');
  civ.setStrataTarget('laborer', 0.5); civ.strata.laborer.count = 0; civ._unemployed = 5;
  ok('(F) active (slack + pod targetem)', civ.getTargetState('laborer') === 'active');
  civ.strata.laborer.count = 10; civ._unemployed = 0;
  ok('(F) inactive_no_shortage (pełna obsada)', civ.getTargetState('laborer') === 'inactive_no_shortage');
  const civ2 = freshMock({ laborer: 2, worker: 10 }, {});
  civ2.setStrataTarget('laborer', 0.9);   // desired=floor(0.9×12)=10 > laborer jobs 2
  ok('(F) unreachable (share > etaty straty)', civ2.getTargetState('laborer') === 'unreachable');
  civ.dispose(); civ2.dispose();
}

// ════════════════════════════════════════════════════════════════════════════
// (G) flag OFF = 5C.1 (uniform, brak paused/bump)
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (G) flag OFF (popAllocation2Priority) = 5C.1 ---');
{
  F().popAllocation2Priority = false;
  const { civ, bSys, grid } = realSetup();
  const t1 = grid.get(1, 1); bSys._activateBuilding(t1.key, 'solar_farm', t1.r, t1.type, false);
  const t2 = grid.get(3, 3); bSys._activateBuilding(t2.key, 'solar_farm', t2.r, t2.type, false);
  civ.strata.laborer.count = 1; civ._unemployed = 0;
  bSys._reapplyAllRates();
  const e1 = bSys._getBuildingLaborEfficiency(SF, t1.key);
  const e2 = bSys._getBuildingLaborEfficiency(SF, t2.key);
  ok('(G) flag OFF: UNIFORM (oba 0.5, nie greedy)', Math.abs(e1 - 0.5) < 1e-9 && Math.abs(e2 - 0.5) < 1e-9);
  bSys.setBuildingDesignation(t1.key, 'paused');
  ok('(G) flag OFF: paused IGNOROWANY (stawki obecne)', Object.keys(bSys._active.get(t1.key).effectiveRates).length > 0);
  ok('(G) flag OFF: getPriorityHumanJobs=0', bSys.getPriorityHumanJobs('laborer') === 0);
  ok('(G) flag OFF: _effectiveTargetShare bez bumpu', civ._effectiveTargetShare('laborer') === 0);
  teardown(civ); F().popAllocation2Priority = true;
}

// ════════════════════════════════════════════════════════════════════════════
// (H) designation serialize/restore round-trip
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (H) designation serialize/restore (soft, bez migracji) ---');
{
  F().popAllocation2Priority = true;
  const { civ, bSys, grid } = realSetup();
  const tl = grid.get(2, 2); bSys._activateBuilding(tl.key, 'solar_farm', tl.r, tl.type, false);
  bSys.setBuildingDesignation(tl.key, 'priority');
  const ser = bSys.serialize();
  const row = ser.find(x => x.tileKey === tl.key);
  ok('(H) serialize niesie designation', row?.designation === 'priority');
  // restore do świeżego BuildingSystem
  const tech2 = new TechSystem();
  const res2 = new ResourceSystem({}); for (const k of res2.inventory.keys()) res2.inventory.set(k, 99999);
  const civ2 = new CivilizationSystem({}, tech2, { id: 'r2', atmosphere: 'breathable' });
  civ2.resourceSystem = res2;
  const grid2 = new HexGrid(6, 8); grid2.forEach(t => { t.type = 'plains'; });
  const bSys2 = new BuildingSystem(res2, civ2, tech2); civ2.buildingSystem = bSys2;
  bSys2._grid = grid2; bSys2._gridHeight = grid2.height; bSys2.setDeposits?.([]); bSys2.setFactorySystem(new FactorySystem(res2));
  bSys2.restoreFromSave(ser);
  ok('(H) restore zachowuje designation', bSys2._active.get(tl.key)?.designation === 'priority');
  // stary save bez pola → 'active' (soft default)
  const legacy = ser.map(({ designation, ...rest }) => rest);
  const bSys3 = new BuildingSystem(res2, civ2, tech2); bSys3._grid = grid2; bSys3._gridHeight = grid2.height; bSys3.setFactorySystem(new FactorySystem(res2));
  bSys3.restoreFromSave(legacy);
  ok('(H) stary save (brak designation) → active', bSys3._active.get(tl.key)?.designation === 'active');
  civ.dispose(); civ2.dispose();
}

// ════════════════════════════════════════════════════════════════════════════
// (I) cap Σ(target+bump) ≤ 100% + inwariant przy priorytecie
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (I) cap Σ(target+bump) ≤ 100% ---');
{
  F().popAllocation2Priority = true;
  const { civ, bSys, grid } = realSetup();
  // 2 budynki laborer (2 etaty) + gracz target laborer 0.8 + priorytet na jednym z nich (bump).
  const t1 = grid.get(1, 1); bSys._activateBuilding(t1.key, 'solar_farm', t1.r, t1.type, false);
  const t2 = grid.get(3, 3); bSys._activateBuilding(t2.key, 'solar_farm', t2.r, t2.type, false);
  civ.strata.laborer.count = 0; civ._unemployed = 10;
  civ.setStrataTarget('laborer', 0.8);
  bSys.setBuildingDesignation(t1.key, 'priority');
  ok('(I) _effectiveTargetShare clamp ≤ 1', civ._effectiveTargetShare('laborer') <= 1.0);
  const th = civ._targetHeadcounts();
  let sumHead = 0; for (const t of STRATA_TYPES) sumHead += (th[t] ?? 0);
  ok('(I) Σ targetHeadcount ≤ mobilePool', sumHead <= civ._mobileJobPool());
  civ._allocateWorkforce();
  ok('(I) żadna strata nie przekracza _humanJobs', STRATA_TYPES.every(t => civ.strata[t].count <= civ._humanJobs(t)));
  ok('(I) inwariant + całkowitość', invariant(civ) && STRATA_TYPES.every(t => Number.isInteger(civ.strata[t].count)));
  teardown(civ);
}

// ════════════════════════════════════════════════════════════════════════════
// (J) REVIEW FIX: świeżo zbudowany budynek NIE czyta stale greedy cache (fallback 1.0)
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (J) fix: fresh build → greedy świeży (nie stale 1.0) ---');
{
  F().popAllocation2Priority = true;
  const { civ, bSys, grid } = realSetup();
  const t1 = grid.get(1, 1); bSys._activateBuilding(t1.key, 'solar_farm', t1.r, t1.type, false);
  civ.strata.laborer.count = 1; civ._unemployed = 0;
  bSys._reapplyAllRates();                              // cache: t1=1.0 (1 pracownik/1 etat)
  ok('(J) przed 2. budową: t1 pełny', bSys._getBuildingLaborEfficiency(SF, t1.key) === 1);
  const t2 = grid.get(3, 3); bSys._activateBuilding(t2.key, 'solar_farm', t2.r, t2.type, false);   // 2 etaty, 1 pracownik
  const e2 = bSys._getBuildingLaborEfficiency(SF, t2.key);
  ok('(J) nowy budynek NIE dostaje stale 1.0 — greedy: e2=0 (t1 zabrał pracownika)', e2 === 0);
  ok('(J) t1 nadal pełny (greedy zachowany)', bSys._getBuildingLaborEfficiency(SF, t1.key) === 1);
  teardown(civ);
}

// ════════════════════════════════════════════════════════════════════════════
// (K) REVIEW FIX: upgrade PAUSED budynku NIE wskrzesza producenta
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (K) fix: upgrade paused → wciąż idle ---');
{
  F().popAllocation2Priority = true;
  const { civ, bSys, grid, res } = realSetup();
  const tl = grid.get(2, 2); bSys._activateBuilding(tl.key, 'solar_farm', tl.r, tl.type, false);
  tl.buildingId = 'solar_farm'; tl.buildingLevel = 1;
  const pid = bSys._active.get(tl.key).producerId;
  bSys.setBuildingDesignation(tl.key, 'paused');
  ok('(K) paused: producent usunięty', !res._producers.has(pid));
  bSys._applyUpgrade(tl, bSys._active.get(tl.key), SF, 2, 1);   // upgrade paused (real path)
  ok('(K) upgrade paused: NADAL brak producenta (guard z tileKey)', !res._producers.has(pid));
  ok('(K) upgrade paused: effectiveRates puste', Object.keys(bSys._active.get(tl.key).effectiveRates).length === 0);
  bSys.setBuildingDesignation(tl.key, 'active');
  ok('(K) un-pause po upgrade: producent wraca', res._producers.has(pid));
  teardown(civ);
}

// ════════════════════════════════════════════════════════════════════════════
// (L) REVIEW FIX: _factoryPausedByPriority przetrwa restore (nie „stuck OFF")
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (L) fix: factory-pause survives restore ---');
{
  F().popAllocation2Priority = true;
  // Restore: flaga=true (przywrócona z save) + fabryki OFF + warunek zniknął → WZNÓW (nie stuck off).
  const A = realSetup();
  A.bSys._factoryPausedByPriority = true;
  A.bSys._pausingSelf = true; A.bSys._factorySystem.setProductionEnabled(false); A.bSys._pausingSelf = false;
  A.bSys._updateFactoryPause();
  ok('(L) restored flag=true → wznowione po load (nie stuck OFF)', A.bSys._factorySystem.isProductionEnabled() === true && A.bSys._factoryPausedByPriority === false);
  teardown(A.civ);
  // Kontrast (dlaczego serializacja jest potrzebna): flaga zgubiona (false) → zostaje OFF.
  const B = realSetup();
  B.bSys._factoryPausedByPriority = false;
  B.bSys._pausingSelf = true; B.bSys._factorySystem.setProductionEnabled(false); B.bSys._pausingSelf = false;
  B.bSys._updateFactoryPause();
  ok('(L) flaga zgubiona (false) + OFF → zostaje OFF (dowód, że serializacja ma znaczenie)', B.bSys._factorySystem.isProductionEnabled() === false);
  teardown(B.civ);
}

// ════════════════════════════════════════════════════════════════════════════
// (M) REVIEW FIX: getGrowthBreakdown pop<=0 guard (zgodność z getAnnualGrowth)
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (M) fix: getGrowthBreakdown pop<=0 ---');
{
  F().popAllocation2Priority = true;
  const { civ } = realSetup();
  for (const s of Object.values(civ.strata)) s.count = 0; civ._unemployed = 0; civ._growthProgress = 0;
  ok('(M) population=0 → getAnnualGrowth 0', civ.getAnnualGrowth() === 0);
  const gb = civ.getGrowthBreakdown();
  ok('(M) getGrowthBreakdown.growth === getAnnualGrowth (0) przy pop=0', gb.growth === civ.getAnnualGrowth());
  ok('(M) blockReason = no_pop', gb.blockReason === 'no_pop');
  teardown(civ);
}

// ════════════════════════════════════════════════════════════════════════════
// (N) REVIEW FIX: gracz przejmuje przełącznik → nie re-pauzujemy (suppression epizodu)
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (N) fix: external toggle → suppression (bez re-pause) ---');
{
  F().popAllocation2Priority = true;
  const { civ, bSys, grid } = realSetup();
  const fs = bSys._factorySystem;
  const tl = grid.get(2, 2); bSys._activateBuilding(tl.key, 'solar_farm', tl.r, tl.type, false);
  bSys.setBuildingDesignation(tl.key, 'priority');
  bSys._constructionQueue.set('5,5', { buildingId: 'solar_farm', progress: 0, buildTime: 5, tileR: 0, tileType: 'plains' });
  bSys._updateFactoryPause();
  ok('(N) nasza pauza aktywna', bSys._factoryPausedByPriority === true && fs.isProductionEnabled() === false);
  // Symuluj zewnętrzny toggle gracza (to, co robi subskrypcja factory:productionEnabledChanged):
  bSys._factoryPausedByPriority = false; bSys._factoryPauseSuppressed = true;
  fs.setProductionEnabled(true);   // gracz włączył (w headless subskrypcja nie łapie po planetId — symulujemy skutek)
  bSys._updateFactoryPause();       // warunek nadal shouldPause, ale suppressed
  ok('(N) suppressed → NIE re-pauzujemy (gracz włada przełącznikiem)', fs.isProductionEnabled() === true && !bSys._factoryPausedByPriority);
  bSys._constructionQueue.clear(); bSys._updateFactoryPause();   // koniec epizodu → re-arm
  ok('(N) koniec epizodu → suppression re-armed', bSys._factoryPauseSuppressed === false);
  teardown(civ);
}

// ════════════════════════════════════════════════════════════════════════════
// (O) GATE FIX: pauza w pełni obsadzonej kolonii → pracownicy → bezrobotni SAME-TICK
//     (przez REALNĄ ścieżkę przycisku setBuildingDesignation; failował na kodzie sprzed fixu)
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (O) GATE FIX: pause releases labor demand (real button path) ---');
{
  F().popAllocation2Priority = true;
  const { civ, bSys, grid } = realSetup();
  const tl = grid.get(2, 2); bSys._activateBuilding(tl.key, 'solar_farm', tl.r, tl.type, false);   // laborer, jobs=1
  civ.strata.laborer.count = 1; civ._unemployed = 0;   // w pełni obsadzona (1 etat, 1 pracownik, 0 bezrobotnych)
  bSys._reapplyAllRates();
  ok('(O) przed pauzą: 0 bezrobotnych, freePops===unemployed', civ._unemployed === 0 && civ.freePops === civ.unemployed);
  // REALNA akcja przycisku „Pauza":
  bSys.setBuildingDesignation(tl.key, 'paused');
  ok('(O) pauza → pracownik ewakuowany do bezrobocia SAME-TICK', civ.strata.laborer.count === 0 && civ._unemployed === 1);
  ok('(O) pauza → getSlotDemand=0 (demand zwolniony)', bSys.getSlotDemand('laborer') === 0);
  ok('(O) pauza → _employedPops zwolnione', civ._employedPops === 0);
  ok('(O) pauza → freePops === unemployed (inwariant utrzymany)', civ.freePops === civ.unemployed);
  ok('(O) pauza → unemploymentRate > 0 (satysfakcja reaguje)', civ.unemploymentRate > 0);
  civ._updateSatisfaction();
  const satPaused = civ.satisfaction;
  // Wznowienie (przycisk „Aktywny") → re-absorpcja:
  bSys.setBuildingDesignation(tl.key, 'active');
  ok('(O) wznowienie → pracownik re-absorbowany', civ.strata.laborer.count === 1 && civ._unemployed === 0);
  ok('(O) wznowienie → freePops === unemployed', civ.freePops === civ.unemployed);
  // Priorytet NIE ewakuuje (utrzymuje demand — tylko ściąga):
  bSys.setBuildingDesignation(tl.key, 'priority');
  ok('(O) priorytet NIE ewakuuje (demand zachowany)', civ.strata.laborer.count === 1 && civ._unemployed === 0);
  teardown(civ);
}

// ════════════════════════════════════════════════════════════════════════════
// (P) UX: getTargetHeadcountPreview (≈N osób + delta)
// ════════════════════════════════════════════════════════════════════════════
console.log('--- (P) UX: target headcount preview ---');
{
  F().popAllocation2Priority = true;
  const civ = freshMock({ laborer: 10, worker: 10 }, {});   // pool=20
  civ.setStrataTarget('laborer', 0.5); civ.strata.laborer.count = 2;
  const p = civ.getTargetHeadcountPreview('laborer');
  ok('(P) target = floor(0.5×20)=10 (≤ etaty 10)', p.target === 10 && p.desired === 10);
  ok('(P) delta = target − obecni (10−2=8)', p.delta === 8 && p.current === 2);
  const civ2 = freshMock({ laborer: 2, worker: 10 }, {});   // pool=12
  civ2.setStrataTarget('laborer', 0.9);
  const p2 = civ2.getTargetHeadcountPreview('laborer');
  ok('(P) unreachable: desired 10 > capped target 2', p2.desired === 10 && p2.target === 2 && p2.capped === true);
  civ.dispose(); civ2.dispose();
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
