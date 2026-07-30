// Population 2.0 (Faza 5, Slice 5B) — droid autonomy. Real-path smoke.
// Uruchom: node src/testing/smoke/tmp_slice5b_autonomy_smoke.mjs
//
// Pokrycie:
//   (A) build-cost swap: autonomous-variant android_worker → automation_droid wg jobs-count; ŻADEN
//       budynek nie ma już android_worker w commodityCost; android_worker zostaje jako tier-2 install.
//   (B) outpost kit (solar+mine) = automation_droid×2 (DROIDS_PER_OUTPOST).
//   (C) autonomizeBuilding: fill jobs×level; tier-split (laborer→automation_droid, scientist→android_worker);
//       partial/shortfall; outpost reject; nothing_to_autonomize; already_autonomous; no_droids; requires_tech.
//   (D) AI creditCost exempt: kolonia AI produkuje droid @0 Kr (_trySpend/_canAfford true); gracz płaci.

import '../headless/env.js'; // MUST be first
import { COMMODITIES } from '../../data/CommoditiesData.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { ResourceSystem } from '../../systems/ResourceSystem.js';
import { CivilizationSystem } from '../../systems/CivilizationSystem.js';
import { BuildingSystem } from '../../systems/BuildingSystem.js';
import { FactorySystem } from '../../systems/FactorySystem.js';
import { HexGrid } from '../../map/HexGrid.js';

window.KOSMOS = { civMode: true, timeSystem: { gameTime: 0 } };
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

// ── (A) build-cost swap: android_worker → automation_droid ────────────────────
console.log('--- (A) build-cost swap android_worker → automation_droid (jobs-count) ---');
{
  const cc = (id) => BUILDINGS[id]?.commodityCost ?? {};
  ok('(A) autonomous_mine: automation_droid 1, brak android_worker', cc('autonomous_mine').automation_droid === 1 && cc('autonomous_mine').android_worker === undefined);
  ok('(A) autonomous_solar_farm: automation_droid 1, brak android_worker', cc('autonomous_solar_farm').automation_droid === 1 && cc('autonomous_solar_farm').android_worker === undefined);
  ok('(A) autonomous_spaceport: automation_droid 2 (launch_pad jobs=2), brak android_worker', cc('autonomous_spaceport').automation_droid === 2 && cc('autonomous_spaceport').android_worker === undefined);
  ok('(A) orbital_mine: automation_droid 1, brak android_worker', cc('orbital_mine').automation_droid === 1 && cc('orbital_mine').android_worker === undefined);
  ok('(A) ai_core: automation_droid 2 (jobs=2), brak android_worker', cc('ai_core').automation_droid === 2 && cc('ai_core').android_worker === undefined);
  ok('(A) orbital_habitat: android_worker USUNIĘTE (jobs=0 → 0 droidów), bez automation_droid', cc('orbital_habitat').android_worker === undefined && cc('orbital_habitat').automation_droid === undefined);

  // SWEEP: żaden budynek nie ma już android_worker w commodityCost.
  const offenders = Object.values(BUILDINGS).filter(b => (b.commodityCost ?? {}).android_worker !== undefined).map(b => b.id);
  ok('(A) ŻADEN budynek nie ma android_worker w commodityCost (sweep)', offenders.length === 0, offenders.length ? '→ ' + offenders.join(',') : '');
  // android_worker zostaje jako COMMODITY (tier-2 installable worker) — NIE usunięty z danych.
  ok('(A) android_worker dalej istnieje jako tier-2 droid (install-only)', COMMODITIES.android_worker?.isDroidUnit === true && COMMODITIES.android_worker?.droidTier === 2);
}

// ── (B) outpost kit = automation_droid×2 (DROIDS_PER_OUTPOST) ──────────────────
console.log('--- (B) outpost kit (solar+mine) = automation_droid×2 ---');
{
  const merge = (...objs) => objs.reduce((a, o) => { for (const [k, v] of Object.entries(o ?? {})) a[k] = (a[k] ?? 0) + v; return a; }, {});
  const kit = merge(BUILDINGS.autonomous_solar_farm.commodityCost, BUILDINGS.autonomous_mine.commodityCost);
  ok('(B) zestaw outpostu automation_droid === 2 (solar 1 + mine 1)', kit.automation_droid === 2);
  ok('(B) zestaw outpostu BEZ android_worker', kit.android_worker === undefined);
}

// ── (C) autonomizeBuilding ────────────────────────────────────────────────────
console.log('--- (C) autonomizeBuilding: fill / tier-split / partial / reasons ---');
// Pełny tech stub (Proxy) — isResearched konfigurowalny; reszta metod (getAdjacencyMultiplier itd.)
// zwraca sensowne defaulty, by ścieżka _reapplyAllRates (przez installSynthetic) nie rzucała.
const techStub = (researched) => new Proxy({}, {
  get: (_t, p) => {
    if (p === 'isResearched') return () => researched;
    if (p === 'isAllAutonomous') return () => false;
    if (p === 'getTerrainUnlocks') return () => [];
    if (p === 'getAdjacencyMultiplier') return () => 0;
    return () => 1;   // production/consumption/autonomous/popGrowth multipliers
  },
});
const mkBS = (stock, { outpost = false, researched = null } = {}) => {
  const grid = new HexGrid(8, 10); grid.forEach(t => { t.type = 'plains'; });
  const res = new ResourceSystem(stock);
  const civ = new CivilizationSystem({}, null, { id: 'c', atmosphere: 'breathable' });
  const bs = new BuildingSystem(res, civ, researched === null ? null : techStub(researched)); civ.buildingSystem = bs;
  bs._grid = grid; bs._gridHeight = grid.height; bs._isOutpost = outpost;
  const keys = []; grid.forEach(t => { if (keys.length < 8) keys.push(`${t.q},${t.r}`); });
  const put = (key, def, level = 1) => { bs._active.set(key, { building: def, baseRates: {}, effectiveRates: {}, jobs: def.jobs ?? 1, level }); return key; };
  return { bs, res, civ, keys, put };
};
{
  // tier-1: solar_farm (laborer, jobs=1) → automation_droid, full.
  const h = mkBS({ automation_droid: 10 });
  const k = h.put(h.keys[0], BUILDINGS.solar_farm);
  const r = h.bs.autonomizeBuilding(k);
  ok('(C) tier-1 laborer: success, droidType automation_droid, installed 1, shortfall 0', r.success && r.droidType === 'automation_droid' && r.installed === 1 && r.shortfall === 0);
  ok('(C) tier-1 laborer: slot pełny (count 1 = jobs)', (h.bs._grid.get(...k.split(',').map(Number)).syntheticSlot?.count) === 1);

  // jobs=2 (factory worker): 2 droidy → fill both.
  const h2 = mkBS({ automation_droid: 10 });
  const k2 = h2.put(h2.keys[0], BUILDINGS.factory);
  const r2 = h2.bs.autonomizeBuilding(k2);
  ok('(C) factory jobs=2: installed 2, shortfall 0', r2.installed === 2 && r2.shortfall === 0);

  // partial: factory jobs=2 z 1 droidem → installed 1, shortfall 1.
  const h3 = mkBS({ automation_droid: 1 });
  const k3 = h3.put(h3.keys[0], BUILDINGS.factory);
  const r3 = h3.bs.autonomizeBuilding(k3);
  ok('(C) factory z 1 droidem: partial installed 1, shortfall 1', r3.success && r3.installed === 1 && r3.shortfall === 1);

  // tier-2: research_station (scientist) → android_worker; z zapasem → install.
  const h4 = mkBS({ android_worker: 5 }, { researched: true });
  const k4 = h4.put(h4.keys[0], BUILDINGS.research_station);
  const r4 = h4.bs.autonomizeBuilding(k4);
  ok('(C) tier-2 scientist: droidType android_worker, installed 1', r4.droidType === 'android_worker' && r4.installed === 1);

  // tier-2 bez tech + bez zapasu → requires_tech.
  const h5 = mkBS({}, { researched: false });
  const k5 = h5.put(h5.keys[0], BUILDINGS.research_station);
  const r5 = h5.bs.autonomizeBuilding(k5);
  ok('(C) tier-2 bez tech+zapasu → requires_tech', r5.success === false && r5.reason === 'requires_tech' && r5.droidType === 'android_worker');

  // no_droids: tier-1 bez zapasu → no_droids, shortfall = jobs.
  const h6 = mkBS({});
  const k6 = h6.put(h6.keys[0], BUILDINGS.solar_farm);
  const r6 = h6.bs.autonomizeBuilding(k6);
  ok('(C) tier-1 bez zapasu → no_droids, shortfall 1', r6.success === false && r6.reason === 'no_droids' && r6.shortfall === 1);

  // outpost → outpost_not_supported.
  const h7 = mkBS({ automation_droid: 10 }, { outpost: true });
  const k7 = h7.put(h7.keys[0], BUILDINGS.solar_farm);
  const r7 = h7.bs.autonomizeBuilding(k7);
  ok('(C) outpost → reason outpost_not_supported (5B.2)', r7.success === false && r7.reason === 'outpost_not_supported');

  // autonomiczny/jobs=0 → nothing_to_autonomize.
  const h8 = mkBS({ automation_droid: 10 });
  const k8 = h8.put(h8.keys[0], BUILDINGS.autonomous_mine);
  const r8 = h8.bs.autonomizeBuilding(k8);
  ok('(C) autonomous_mine (isAutonomous/jobs=0) → nothing_to_autonomize', r8.success === false && r8.reason === 'nothing_to_autonomize');

  // already_autonomous: fill, then re-autonomize = no-op.
  const h9 = mkBS({ automation_droid: 10 });
  const k9 = h9.put(h9.keys[0], BUILDINGS.solar_farm);
  h9.bs.autonomizeBuilding(k9);
  const r9 = h9.bs.autonomizeBuilding(k9);
  ok('(C) re-autonomizuj pełny → already_autonomous', r9.success === false && r9.reason === 'already_autonomous');

  // no_building
  const h10 = mkBS({ automation_droid: 10 });
  ok('(C) brak budynku → no_building', h10.bs.autonomizeBuilding('99,99').reason === 'no_building');

  // (C-HOLE, live-gate point 2) tier-2 budynek z android_worker W ZAPASIE ale BEZ android_engineering
  // MUSI odmówić (requires_tech) na OBU ścieżkach: autonomizeBuilding (przycisk) I single-install
  // (previewSyntheticInstall/installSynthetic). Wcześniej dziura: gate tech tylko przy pustym zapasie.
  {
    const hh = mkBS({ android_worker: 5 }, { researched: false });
    const kh = hh.put(hh.keys[0], BUILDINGS.research_station);   // scientist (tier-2)
    const ra = hh.bs.autonomizeBuilding(kh);
    const slotCount = () => hh.bs._grid.get(...kh.split(',').map(Number)).syntheticSlot?.count ?? 0;
    ok('(C-HOLE) autonomize: tier-2 + zapas + BEZ tech → requires_tech (slot pusty)', ra.success === false && ra.reason === 'requires_tech' && slotCount() === 0);
    const prev = hh.bs.previewSyntheticInstall(kh);
    ok('(C-HOLE) single-install preview: ok:false reason requires_tech', prev.ok === false && prev.reason === 'requires_tech');
    const ins = hh.bs.installSynthetic(kh, 'android_worker');
    ok('(C-HOLE) installSynthetic bezpośredni: requires_tech (slot pusty)', ins.success === false && ins.reason === 'requires_tech' && slotCount() === 0);
    // Kontrola: z tech → instaluje.
    const hh2 = mkBS({ android_worker: 5 }, { researched: true });
    const kh2 = hh2.put(hh2.keys[0], BUILDINGS.research_station);
    ok('(C-HOLE) kontrola: tier-2 + zapas + Z TECH → instaluje', hh2.bs.autonomizeBuilding(kh2).installed === 1);
  }
}

// ── (D) AI creditCost exempt ──────────────────────────────────────────────────
console.log('--- (D) AI creditCost exempt (surowce-only), gracz płaci ---');
{
  const res = new ResourceSystem({});
  const fs = new FactorySystem(res);
  // AI: ownerEmpireId ustawione → skip Kr (nawet bez systemu kredytów).
  fs._getOwnerColony = () => ({ ownerEmpireId: 'emp_1', planetId: 'ai_home' });
  ok('(D) AI: _trySpendProductionCredits(500) === true (bez deduct)', fs._trySpendProductionCredits(500) === true);
  ok('(D) AI: _canAffordProductionCredits(500) === true', fs._canAffordProductionCredits(500) === true);

  // Gracz: brak kredytów w systemie → deduct-or-false. Stub cts z 0 Kr → false (blokada).
  let spent = 0;
  window.KOSMOS.civilianTradeSystem = {
    spendCredits: (pid, amt) => { if (100 >= amt) { spent += amt; return true; } return false; },
    getCredits: () => 100,
  };
  const fsP = new FactorySystem(new ResourceSystem({}));
  fsP._getOwnerColony = () => ({ ownerEmpireId: null, planetId: 'player_home' });
  ok('(D) gracz: 500 > 100 Kr → _trySpend false (blokada, NIE exempt)', fsP._trySpendProductionCredits(500) === false);
  ok('(D) gracz: 50 ≤ 100 Kr → _trySpend true + deduct', fsP._trySpendProductionCredits(50) === true && spent === 50);
  ok('(D) gracz: _canAfford(500) false, _canAfford(50) true', fsP._canAffordProductionCredits(500) === false && fsP._canAffordProductionCredits(50) === true);
  window.KOSMOS.civilianTradeSystem = null;
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
