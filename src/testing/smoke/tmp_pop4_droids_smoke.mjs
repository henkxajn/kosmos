// Population 2.0 (Faza 4) — droidy tier-1 (automation_droid). Real-path smoke.
// Uruchom: node src/testing/smoke/tmp_pop4_droids_smoke.mjs
//
// Pokrycie (plan §Testy a–g):
//   (a) recipe/produkcja OD STARTU bez tech; (b) robot_assembly ×2 output;
//   (c) install allowed laborer/miner/worker, reject research/trade/admin;
//   (d) aktywny slot = +2 energii w LIVE bilansie (energyChain route); (e) install↓pressure/wage;
//   (f) magazyn droida = 0 upkeep; (g) save/restore round-trip zainstalowanego slotu.

import '../headless/env.js'; // MUST be first
import { COMMODITIES } from '../../data/CommoditiesData.js';
import { BASE_PRICE } from '../../data/TradeValuesData.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { ResourceSystem } from '../../systems/ResourceSystem.js';
import { CivilizationSystem } from '../../systems/CivilizationSystem.js';
import { BuildingSystem } from '../../systems/BuildingSystem.js';
import { FactorySystem } from '../../systems/FactorySystem.js';
import { HexGrid } from '../../map/HexGrid.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
// Slice 5C.1: ten plik testuje kontrakt Fazy 4 (droid NISZCZONY przy remove) = ścieżka FLAG OFF.
// Regułę „remove ZWRACA droida" (flag ON) pokrywa tmp_pop2_5c1 (blok I).
GAME_CONFIG.FEATURES.popAllocation2 = false;
import { HexTile } from '../../map/HexTile.js';
import { shouldReuseColonyGrid } from '../../ui/ColonyGridResolveLogic.js';
import { readFileSync } from 'fs';

window.KOSMOS = { civMode: true, timeSystem: { gameTime: 0 } };
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

// ── (a) automation_droid zdefiniowany + produkowalny od startu (bez tech) ────
console.log('--- (a) automation_droid: definicja + recipe OD STARTU (bez tech) ---');
{
  const d = COMMODITIES.automation_droid;
  ok('(a) automation_droid w COMMODITIES', !!d);
  ok('(a) tier 1 / droidTier 1 / isDroidUnit', d?.tier === 1 && d?.droidTier === 1 && d?.isDroidUnit === true);
  // ISSUE 1 (decyzja Filipa): droid = STRATEGICZNA INWESTYCJA, nie spam. Recipe DROGI w ilości
  // (basic-only, masowo) + creditCost 500 Kr/szt. Cena rynkowa RĘCZNIE 450 Kr (złamana konwencja raw×1.3).
  ok('(a) recipe {Li300,C1000,Fe1000,Cu500,Si2000} (Slice 5A: Li 1000→300)', JSON.stringify(d?.recipe) === JSON.stringify({ Li: 300, C: 1000, Fe: 1000, Cu: 500, Si: 2000 }));
  ok('(a) recipe TYLKO basic-mined (Li/C/Fe/Cu/Si)', Object.keys(d?.recipe ?? {}).every(k => ['C','Fe','Si','Cu','Ti','Li'].includes(k)));
  ok('(a) creditCost 500 Kr/szt (sink kredytów)', d?.creditCost === 500);
  ok('(a) baseTime 1.0 / weight 3.0 / efficiencyBonus 0.40', d?.baseTime === 1.0 && d?.weight === 3.0 && d?.efficiencyBonus === 0.40);
  ok('(a) requiresTech null (od startu)', d?.requiresTech === null || d?.requiresTech === undefined);
  ok('(a) trade value 450 Kr (RĘCZNIE — NIE raw×1.3 ~14300)', BASE_PRICE.automation_droid === 450);
  ok('(a) SYNTH_EFFICIENCY[1] = 1.4', BuildingSystem.SYNTH_EFFICIENCY[1] === 1.4);

  // isRecipeAvailable — bez tech → true (requiresTech null + składniki basic).
  const res = new ResourceSystem({});
  const fs = new FactorySystem(res);
  const col = { planetId: 'p', factorySystem: fs, buildingSystem: { _active: new Map(), techSystem: { isResearched: () => false } } };
  window.KOSMOS.factorySystem = fs;
  window.KOSMOS.colonyManager = { getAllColonies: () => [col], getColony: () => col, activePlanetId: 'p' };
  ok('(a) isRecipeAvailable(automation_droid) === true (bez tech)', fs.isRecipeAvailable('automation_droid') === true);
}

// ── (b) robot_assembly ×2 output (assemblyBonus 2.0) ─────────────────────────
console.log('--- (b) robot_assembly dwoi produkcję droida (assemblyBonus 2.0) ---');
{
  const res = new ResourceSystem({});
  const fs = new FactorySystem(res);
  const active = new Map();
  const col = { planetId: 'p', factorySystem: fs, buildingSystem: { _active: active, techSystem: { isResearched: () => false } } };
  window.KOSMOS.factorySystem = fs;
  window.KOSMOS.colonyManager = { getAllColonies: () => [col], getColony: () => col, activePlanetId: 'p' };
  ok('(b) bez robot_assembly → bonus 1.0', fs._getAssemblyBonus('automation_droid') === 1.0);
  active.set('2,2', { building: BUILDINGS.robot_assembly, jobs: 1, level: 1 });
  ok('(b) z robot_assembly → bonus 2.0 (FLAT)', fs._getAssemblyBonus('automation_droid') === 2.0);
  ok('(b) bonus TYLKO dla automation_droid (inny commodity → 1.0)', fs._getAssemblyBonus('android_worker') === 1.0);
  ok('(b) assemblyBonus w danych robot_assembly = 2.0', BUILDINGS.robot_assembly.assemblyBonus === 2.0);
}

// ── (c) install allowed laborer/miner/worker; reject research/trade/admin ────
console.log('--- (c) allowedStrata: laborer/miner/worker OK, reszta reject ---');
{
  const grid = new HexGrid(8, 10); grid.forEach(t => { t.type = 'plains'; });
  const res = new ResourceSystem({ automation_droid: 20 });
  const civ = new CivilizationSystem({}, null, { id: 'c', atmosphere: 'breathable' });
  const bs = new BuildingSystem(res, civ, null); civ.buildingSystem = bs;
  bs._grid = grid; bs._gridHeight = grid.height;
  // Zbierz 6 PRAWIDŁOWYCH kluczy tile z gridu (hex — nie każdy (q,r) istnieje).
  const keys = []; grid.forEach(t => { if (keys.length < 6) keys.push(`${t.q},${t.r}`); });
  const put = (key, bid) => bs._active.set(key, { building: BUILDINGS[bid], baseRates: {}, effectiveRates: {}, jobs: BUILDINGS[bid].jobs ?? 1, level: 1 });
  put(keys[0], 'solar_farm');       // laborer (OK)
  put(keys[1], 'smelter');          // miner (OK)
  put(keys[2], 'factory');          // worker (OK)
  put(keys[3], 'research_station'); // scientist (reject)
  put(keys[4], 'trade_hub');        // merchant (reject)
  put(keys[5], 'admin_office');     // bureaucrat (reject)
  ok('(c) solar_farm (laborer) → install OK', bs.installSynthetic(keys[0], 'automation_droid').success === true);
  ok('(c) smelter (miner) → install OK', bs.installSynthetic(keys[1], 'automation_droid').success === true);
  ok('(c) factory (worker) → install OK', bs.installSynthetic(keys[2], 'automation_droid').success === true);
  const r4 = bs.installSynthetic(keys[3], 'automation_droid');
  ok('(c) research_station (scientist) → REJECT strata_not_allowed', r4.success === false && r4.reason === 'strata_not_allowed');
  const r5 = bs.installSynthetic(keys[4], 'automation_droid');
  ok('(c) trade_hub (merchant) → REJECT strata_not_allowed', r5.success === false && r5.reason === 'strata_not_allowed');
  const r6 = bs.installSynthetic(keys[5], 'automation_droid');
  ok('(c) admin_office (bureaucrat) → REJECT strata_not_allowed', r6.success === false && r6.reason === 'strata_not_allowed');
  ok('(c) install zużył droidy z magazynu (20 − 3 = 17)', res.getAmount('automation_droid') === 17);
}

// ── (d) aktywny slot = +2 energii w LIVE bilansie (real installSynthetic) ────
console.log('--- (d) aktywny slot droid → +2 energii w bilansie (energyChain route) ---');
{
  const grid = new HexGrid(8, 10); grid.forEach(t => { t.type = 'plains'; });
  const res = new ResourceSystem({ automation_droid: 5 });
  const civ = new CivilizationSystem({}, null, { id: 'd', atmosphere: 'breathable' });
  civ.strata.laborer.count = 1;
  const bs = new BuildingSystem(res, civ, null); civ.buildingSystem = bs;
  bs._grid = grid; bs._gridHeight = grid.height;
  window.KOSMOS.buildingSystem = bs; window.KOSMOS.civSystem = civ; window.KOSMOS.resourceSystem = res;
  // Budynek laborer, energyCost 0 (izolacja upkeepu): effectiveRates.energy = −upkeep tylko.
  bs._active.set('2,2', { building: { id: 'x', popType: 'laborer', jobs: 1, energyCost: 0 }, baseRates: {}, effectiveRates: {}, jobs: 1, level: 1 });
  bs._reapplyAllRates();
  ok('(d) bez droida: energia budynku = 0', (res.energy.consumption ?? 0) === 0);
  const ins = bs.installSynthetic('2,2', 'automation_droid');
  ok('(d) install OK (laborer)', ins.success === true);
  console.log(`    po install: effectiveRates.energy=${bs._active.get('2,2').effectiveRates.energy} balance.consumption=${res.energy.consumption}`);
  ok('(d) aktywny slot → −2 w effectiveRates.energy', bs._active.get('2,2').effectiveRates.energy === -2);
  ok('(d) aktywny slot → +2 w LIVE bilansie (consumption=2)', res.energy.consumption === 2);
  // (f) po usunięciu: magazyn/brak slotu = 0 upkeep.
  bs.removeSynthetic('2,2');
  ok('(f) po usunięciu slotu → 0 upkeep w bilansie', res.energy.consumption === 0);
  window.KOSMOS.buildingSystem = null; window.KOSMOS.civSystem = null;
}

// ── (e) install ↓ pressure/wage straty (synthetic netuje popyt na ludzi) ─────
console.log('--- (e) install droid ↓ pressure/wage straty ---');
{
  const grid = new HexGrid(8, 10); grid.forEach(t => { t.type = 'plains'; });
  const res = new ResourceSystem({ automation_droid: 5 });
  const civ = new CivilizationSystem({}, null, { id: 'e', atmosphere: 'breathable' });
  civ.strata.laborer.count = 0; civ._unemployed = 0;
  const bs = new BuildingSystem(res, civ, null); civ.buildingSystem = bs;
  bs._grid = grid; bs._gridHeight = grid.height;
  // 2 laborer budynki (jobs 1 każdy) → getSlotDemand(laborer)=2, 0 workers → pressure 1.0, wage bazowa×2.
  bs._active.set('1,1', { building: { id: 'a', popType: 'laborer', jobs: 1 }, baseRates: {}, effectiveRates: {}, jobs: 1, level: 1 });
  bs._active.set('2,2', { building: { id: 'b', popType: 'laborer', jobs: 1 }, baseRates: {}, effectiveRates: {}, jobs: 1, level: 1 });
  const pBefore = civ.getStrataPressure('laborer'), wBefore = civ.getStrataWage('laborer');
  bs.installSynthetic('2,2', 'automation_droid');   // droid obsadza 1 etat → syntheticJobs=1
  const pAfter = civ.getStrataPressure('laborer'), wAfter = civ.getStrataWage('laborer');
  console.log(`    pressure ${pBefore.toFixed(2)}→${pAfter.toFixed(2)}  wage ${wBefore.toFixed(2)}→${wAfter.toFixed(2)}  synthJobs=${bs.getSyntheticJobs('laborer')}`);
  ok('(e) syntheticJobs(laborer) = 1 po instalacji', bs.getSyntheticJobs('laborer') === 1);
  ok('(e) install ZMNIEJSZA pressure straty', pAfter < pBefore);
  ok('(e) install ZMNIEJSZA płacę straty', wAfter < wBefore);
  civ.dispose();
}

// ── (g) save/restore round-trip — PEŁNA ścieżka gry: install → serialize gridu →
//        restore → decyzja _getGrid (reuse vs regeneracja). Łapie ROOT-CAUSE live-gate:
//        stary guard regenerował grid gracza → syntheticSlot ginął po reloadzie. ──────────
console.log('--- (g) save→restore→_getGrid: droid PRZEŻYWA reload (nie regeneruj gridu gracza) ---');
{
  // 1) HexTile round-trip (warstwa niska — musi nieść slot).
  const tile = new HexTile(2, 2, 'plains');
  tile.buildingId = 'smelter';
  tile.syntheticSlot = { commodityId: 'automation_droid', tier: 1 };
  const restored = HexTile.restore(tile.serialize());
  ok('(g) HexTile serialize/restore niesie syntheticSlot', restored.syntheticSlot?.commodityId === 'automation_droid' && restored.syntheticSlot?.tier === 1);
  ok('(g) brak slotu → null po round-trip', HexTile.restore(new HexTile(0, 0, 'plains').serialize()).syntheticSlot === null);

  // 2) PEŁNY grid: zbuduj+zainstaluj (ścieżka UI installSynthetic), zapisz grid (col.grid.serialize()),
  //    wczytaj (HexGrid.restore) — jak ColonyManager.serialize/restore.
  const grid = new HexGrid(8, 10); grid.forEach(t => { t.type = 'mountains'; });
  const res = new ResourceSystem({ automation_droid: 2 });
  const civ = new CivilizationSystem({}, null, { id: 'g', atmosphere: 'breathable' });
  civ.resourceSystem = res; civ.strata.miner.count = 1;
  const bs = new BuildingSystem(res, civ, null); civ.buildingSystem = bs; bs._grid = grid; bs._gridHeight = grid.height;
  const tk = grid.get(2, 2).key;
  bs._activateBuilding(tk, 'smelter', grid.get(2, 2).r, grid.get(2, 2).type, false);
  bs.installSynthetic(tk, 'automation_droid');   // ← ta sama metoda co przycisk UI (_onHit)
  ok('(g) po install: slot na kaflu gridu', grid.get(2, 2).syntheticSlot?.commodityId === 'automation_droid');

  const savedGrid = HexGrid.restore(grid.serialize());   // ColonyManager.restore path
  ok('(g) savedGrid (z save) NIESIE slot', savedGrid.get(2, 2)?.syntheticSlot?.commodityId === 'automation_droid');

  // 3) Decyzja _getGrid po reloadzie. Kolonia gracza (nie-hostile) z gridem z save.
  const colonyRestored = { grid: savedGrid, _gridFromSave: true, ownerEmpireId: null, isTestEnemy: false };
  const isHostile = false;
  // STARY guard (hostile-only) — DOWÓD diverencji: player → regeneracja → slot GINIE.
  const oldReuse = !!colonyRestored.grid && isHostile;
  const gridOld = oldReuse ? savedGrid : (() => { const g = new HexGrid(8, 10); g.forEach(t => { t.type = 'mountains'; }); return g; })();
  ok('(g) PRE-FIX (hostile-only) → grid gracza REGENEROWANY, slot ZGUBIONY', oldReuse === false && gridOld.get(2, 2)?.syntheticSlot == null);
  // NOWA logika (shouldReuseColonyGrid) — reuse → slot ZACHOWANY.
  const newReuse = shouldReuseColonyGrid(colonyRestored, isHostile);
  const gridNew = newReuse ? savedGrid : null;
  ok('(g) POST-FIX → reuse gridu z save, slot PRZEŻYWA reload', newReuse === true && gridNew.get(2, 2)?.syntheticSlot?.commodityId === 'automation_droid');
  // Świeża kolonia (bez gridu) nadal generuje; hostile nadal reuse.
  ok('(g) świeża kolonia (brak gridu) → generuj', shouldReuseColonyGrid({ grid: null }, false) === false);
  ok('(g) kolonia obca → reuse (bez regresji)', shouldReuseColonyGrid({ grid: savedGrid }, true) === true);

  // 4) WPIĘCIE fix (nie martwy helper): _getGrid woła helper, ColonyManager stempluje flagę.
  //    Bez tych dwóch połówek droidy dalej giną po reload → asercje łapią cofnięcie fixu.
  const coSrc = readFileSync(new URL('../../ui/ColonyOverlay.js', import.meta.url), 'utf8');
  ok('(g) ColonyOverlay._getGrid WOŁA shouldReuseColonyGrid', /shouldReuseColonyGrid\s*\(/.test(coSrc));
  const cmSrc = readFileSync(new URL('../../systems/ColonyManager.js', import.meta.url), 'utf8');
  ok('(g) ColonyManager.restore STEMPLUJE _gridFromSave', /_gridFromSave\s*:/.test(cmSrc));
  civ.dispose();
}

// ── (h) UI action path: previewSyntheticInstall (stan przycisku) + install/remove ───
console.log('--- (h) UI: matryca stanu przycisku + install konsumuje / remove niszczy ---');
{
  const grid = new HexGrid(8, 10); grid.forEach(t => { t.type = 'plains'; });
  const res = new ResourceSystem({ automation_droid: 3 });
  const civ = new CivilizationSystem({}, null, { id: 'h', atmosphere: 'breathable' });
  const bs = new BuildingSystem(res, civ, null); civ.buildingSystem = bs; bs._grid = grid; bs._gridHeight = grid.height;
  const keys = []; grid.forEach(t => { if (keys.length < 2) keys.push(`${t.q},${t.r}`); });
  const put = (key, bid) => bs._active.set(key, { building: BUILDINGS[bid], baseRates: {}, effectiveRates: {}, jobs: BUILDINGS[bid].jobs ?? 1, level: 1 });
  put(keys[0], 'smelter');          // miner — allowed
  put(keys[1], 'research_station'); // scientist — blocked

  // ALLOWED (droid w magazynie + strata OK)
  const pA = bs.previewSyntheticInstall(keys[0]);
  ok('(h) allowed → preview.ok + commodityId automation_droid', pA.ok === true && pA.commodityId === 'automation_droid');
  // BLOCKED-STRATA (scientist)
  const pB = bs.previewSyntheticInstall(keys[1]);
  ok('(h) blocked-strata → reason strata_not_allowed', pB.ok === false && pB.reason === 'strata_not_allowed');

  // install KONSUMUJE (ścieżka akcji _onHit: installSynthetic(tileKey, preview.commodityId))
  const before = res.getAmount('automation_droid');
  bs.installSynthetic(keys[0], pA.commodityId);
  ok('(h) install KONSUMUJE 1 droida', res.getAmount('automation_droid') === before - 1);
  // ALREADY-INSTALLED (droid-per-job: smelter jobs=1 → 1 droid wypełnia → building_full)
  const pOcc = bs.previewSyntheticInstall(keys[0]);
  ok('(h) full building → reason building_full (jobs=1, 1 droid)', pOcc.ok === false && pOcc.reason === 'building_full');
  // remove NISZCZY (brak zwrotu do magazynu)
  const afterInstall = res.getAmount('automation_droid');
  bs.removeSynthetic(keys[0]);
  ok('(h) remove NISZCZY jednostkę (magazyn bez zmian, brak zwrotu)', res.getAmount('automation_droid') === afterInstall);
  ok('(h) po remove → slot wolny (preview.ok znów)', bs.previewSyntheticInstall(keys[0]).ok === true);

  // NO-INVENTORY (0 droidów)
  const emptyRes = new ResourceSystem({});
  const civ2 = new CivilizationSystem({}, null, { id: 'h2', atmosphere: 'breathable' });
  const bs2 = new BuildingSystem(emptyRes, civ2, null); civ2.buildingSystem = bs2; bs2._grid = grid; bs2._gridHeight = grid.height;
  bs2._active.set(keys[0], { building: BUILDINGS.smelter, baseRates: {}, effectiveRates: {}, jobs: 1, level: 1 });
  const pNo = bs2.previewSyntheticInstall(keys[0]);
  ok('(h) no-inventory → reason no_commodity', pNo.ok === false && pNo.reason === 'no_commodity');
  civ.dispose(); civ2.dispose();
}

// ── (i) ISSUE 2: absolutny czas produkcji = baseTime/civ-rok @1pkt (NIE units bug) ──
console.log('--- (i) produkcja: 1 droid / 1 civ-rok @1pkt; robot_assembly → 2 / 1 civ-rok (absolutnie) ---');
{
  function makeCol(withAssembly) {
    const res = new ResourceSystem({});
    for (const k of res.inventory.keys()) res.inventory.set(k, 1e9);
    const fs = new FactorySystem(res); fs.setMode('manual');
    const active = new Map();
    if (withAssembly) active.set('9,9', { building: BUILDINGS.robot_assembly, jobs: 1, level: 1 });
    const col = { planetId: 'i', factorySystem: fs, resourceSystem: res,
      buildingSystem: { _active: active, techSystem: { getFactorySpeedMultiplier: () => 1.0 } } };
    window.KOSMOS.factorySystem = fs;
    window.KOSMOS.colonyManager = { getAllColonies: () => [col], getColony: () => col, activePlanetId: 'i' };
    fs._allocations = new Map([['automation_droid', { commodityId: 'automation_droid', points: 1, progress: 0, produced: 0, targetQty: null, _paused: false }]]);
    return { fs, res };
  }
  const base = makeCol(false);
  const b1 = base.res.getAmount('automation_droid');
  base.fs._update(1.0);   // 1.0 civ-rok (jeden krok = bez FP-szumu akumulacji 0.1)
  ok('(i) @1pkt bez assembly → 1 droid / 1 civ-rok (baseTime 1.0 = SPEC, brak units-buga)', base.res.getAmount('automation_droid') - b1 === 1);

  const boosted = makeCol(true);
  ok('(i) robot_assembly → bonus 2.0', boosted.fs._getAssemblyBonus('automation_droid') === 2.0);
  const b2 = boosted.res.getAmount('automation_droid');
  boosted.fs._update(1.0);   // 1.0 civ-rok → timePerUnit 0.5 → 2 szt
  ok('(i) @1pkt z robot_assembly → 2 droidy / 1 civ-rok (×2 ABSOLUTNIE, nie tylko ratio)', boosted.res.getAmount('automation_droid') - b2 === 2);
  window.KOSMOS.colonyManager = undefined; window.KOSMOS.factorySystem = undefined;
}

// ── (j) Point 9: android_worker (tier 2) przez TĘ SAMĄ unified ścieżkę ───────────────
console.log('--- (j) android: instaluje gdzie tier-1 zablokowany, ×1.7, +6 energii, save/load round-trip ---');
{
  const grid = new HexGrid(8, 10); grid.forEach(t => { t.type = 'plains'; });
  const res = new ResourceSystem({ android_worker: 2 });
  const civ = new CivilizationSystem({}, null, { id: 'j', atmosphere: 'breathable' });
  civ.resourceSystem = res;
  const bs = new BuildingSystem(res, civ, null); civ.buildingSystem = bs; bs._grid = grid; bs._gridHeight = grid.height;
  const tk = grid.get(3, 3).key;
  bs._activateBuilding(tk, 'research_station', grid.get(3, 3).r, grid.get(3, 3).type, false);   // scientist — tier-1 blocked
  const eBefore = bs._active.get(tk)?.effectiveRates?.energy ?? 0;
  // Unified preview: tier-1 (droid) odrzucony dla scientist → wybiera android (tier 2, bez ograniczenia strata).
  const prev = bs.previewSyntheticInstall(tk);
  ok('(j) preview @scientist → android tier 2 (NIE tier-1 droid)', prev.ok === true && prev.commodityId === 'android_worker' && prev.tier === 2);
  const r = bs.installSynthetic(tk, prev.commodityId);
  ok('(j) install android sukces + slot tier 2', r.success === true && grid.get(3, 3).syntheticSlot?.tier === 2);
  ok('(j) SYNTH_EFFICIENCY[2] = 1.7 (android silniejszy niż droid 1.4)', BuildingSystem.SYNTH_EFFICIENCY[2] === 1.7);
  const eAfter = bs._active.get(tk)?.effectiveRates?.energy ?? 0;
  ok('(j) tier-2 upkeep +6 energii (SYNTH_ENERGY_UPKEEP[2]=6, energia bardziej ujemna)', BuildingSystem.SYNTH_ENERGY_UPKEEP[2] === 6 && (eBefore - eAfter) >= 6);
  const sg = HexGrid.restore(grid.serialize());
  ok('(j) android round-trip zachowuje slot tier 2', sg.get(3, 3)?.syntheticSlot?.tier === 2 && sg.get(3, 3)?.syntheticSlot?.commodityId === 'android_worker');
  civ.dispose();
}

// ── (k) creditCost: produkcja pobiera Kr; niewypłacalność PAUZUJE (stockpile + credit-gated) ──
console.log('--- (k) creditCost 500 Kr/szt: credit-gated + stockpile-gated + pauza/wznów ---');
{
  // (k1) CREDIT-GATED: surowce bez limitu, kredyty na dokładnie 2 szt.
  const res = new ResourceSystem({});
  for (const key of res.inventory.keys()) res.inventory.set(key, 1e9);
  const fs = new FactorySystem(res); fs.setMode('manual');
  const colony = { planetId: 'k', credits: 1200, factorySystem: fs, resourceSystem: res,
    buildingSystem: { _active: new Map(), techSystem: { getFactorySpeedMultiplier: () => 1.0 } } };
  window.KOSMOS.civilianTradeSystem = { spendCredits(pid, amt) { if ((colony.credits ?? 0) < amt) return false; colony.credits -= amt; return true; } };
  window.KOSMOS.factorySystem = fs;
  window.KOSMOS.colonyManager = { getAllColonies: () => [colony], getColony: () => colony, activePlanetId: 'k' };
  fs._allocations = new Map([['automation_droid', { commodityId: 'automation_droid', points: 1, progress: 0, produced: 0, targetQty: null, _paused: false }]]);
  const before = res.getAmount('automation_droid');
  fs._update(3.0);   // 3 civ-lata → do 3 szt, ale kredyty tylko na 2 (1200/500)
  ok('(k1) credit-gated: 2 szt (limit 1200 Kr / 500), NIE 3', res.getAmount('automation_droid') - before === 2);
  ok('(k1) kredyty kolonii −1000 (2×500)', colony.credits === 200);
  ok('(k1) alokacja PAUZA przy niewypłacalności', fs._allocations.get('automation_droid')._paused === true);
  colony.credits = 1000; fs._allocations.get('automation_droid')._paused = false;
  fs._update(2.0);
  ok('(k1) dolanie Kr WZNAWIA produkcję (→4 total)', res.getAmount('automation_droid') - before === 4);

  // (k2) STOCKPILE-GATED: kredyty bez limitu, surowce na dokładnie 1 szt (recipe = duży pobór).
  const res2 = new ResourceSystem({});
  res2.inventory.set('Li', 1000); res2.inventory.set('C', 1000); res2.inventory.set('Fe', 1000);
  res2.inventory.set('Cu', 500); res2.inventory.set('Si', 2000);
  const fs2 = new FactorySystem(res2); fs2.setMode('manual');
  const col2 = { planetId: 'k2', credits: 1e9, factorySystem: fs2, resourceSystem: res2,
    buildingSystem: { _active: new Map(), techSystem: { getFactorySpeedMultiplier: () => 1.0 } } };
  window.KOSMOS.civilianTradeSystem = { spendCredits(pid, amt) { if ((col2.credits ?? 0) < amt) return false; col2.credits -= amt; return true; } };
  window.KOSMOS.colonyManager = { getAllColonies: () => [col2], getColony: () => col2, activePlanetId: 'k2' };
  fs2._allocations = new Map([['automation_droid', { commodityId: 'automation_droid', points: 1, progress: 0, produced: 0, targetQty: null, _paused: false }]]);
  fs2._update(3.0);
  ok('(k2) stockpile-gated: 1 szt (surowce na 1), NIE 3 — droga produkcja hamuje spam', res2.getAmount('automation_droid') === 1);

  // (k3) Headless bez systemu kredytów → helper NIE blokuje (fallback true).
  window.KOSMOS.civilianTradeSystem = undefined;
  ok('(k3) brak systemu kredytów (headless) → helper NIE blokuje (true)', fs2._trySpendProductionCredits(500) === true);
  window.KOSMOS.colonyManager = undefined; window.KOSMOS.factorySystem = undefined;
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
