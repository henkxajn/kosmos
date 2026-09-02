// KEEPER — S1 / Findingi 229 + 230: obsada UNIFORM w koloniach AI, greedy+priorytet u GRACZA.
// Uruchom: node src/testing/smoke/ai_uniform_staffing_smoke.mjs
//
// CZEGO PILNUJE (rewizja przewidywania z audytu §12a — metryką jest OBSADA FARMY, nie liczba farm
// i nie `strata.laborer`): w gy5 stolicy AI `laborer = 5` (NIEZEROWE!), a OBIE farmy stały na 0%.
// Pin na liczbie robotników przeszedłby wtedy zielono dokładnie w chwili śmierci koloni.
//
//   T1  NIEJAŁOWOŚĆ FIXTURE'U — farma MUSI stać za >= N etatami w porządku `activeKey`, a pula
//       laborera MUSI być mniejsza od tej liczby. Bez tego T2/T3 porównują 100% z 100%.
//   T2  DEFEKT (flaga OFF = dziś): obsada farmy == 0% przy elektrowniach na 100%.
//   T3  NAPRAWA (flaga ON + kolonia AI): obsada farmy == uniform (strataCount/humanDemand) > 0.
//   T4  GRACZ CO DO BITU: ta sama geometria + kolonia GRACZA + flaga ON → greedy zachowany
//       (farma 0%), a `designation:'priority'` dalej przestawia kolejkę na 100%.
//   T5  FINDING 230: podniesienie poziomu farmy potraja jej `jobs` (getSlotDemand = jobs × level)
//       → pod greedy ZAREJESTROWANA stawka food spada do ZERA; pod uniform (AI) zostaje > 0.
//   T6  KONTROLA PINU: przy fladze OFF kolonia AI i kolonia gracza dają IDENTYCZNE liczby
//       (S1 nie zmienia niczego, dopóki flaga leży).
//   T7  FAIL-OPEN: `BuildingSystem` bez rozwiązywalnego właściciela (goły system, wzór ~20
//       keeperów) zostaje na greedy nawet przy fladze ON.
//   T8  KADENCJA MEMO: po unieważnieniu `_greedyStaffCache` własność jest PRZELICZANA
//       (pin przeciw memo, które przeżywa przejęcie koloni).
//
// ⚠ Fixture NIE odtwarza całej stolicy AI — odtwarza GEOMETRIĘ KOLEJKI, bo to ona jest defektem.

import '../headless/env.js'; // MUST be first
import { ResourceSystem } from '../../systems/ResourceSystem.js';
import { CivilizationSystem } from '../../systems/CivilizationSystem.js';
import { BuildingSystem } from '../../systems/BuildingSystem.js';
import { TechSystem } from '../../systems/TechSystem.js';
import { HexGrid } from '../../map/HexGrid.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };
const F = () => GAME_CONFIG.FEATURES;
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

const FARM = BUILDINGS['farm'], SOLAR = BUILDINGS['solar_farm'];

/**
 * Kolonia z GEOMETRIĄ KOLEJKI stolicy AI: elektrownie na kluczach sortujących się PRZED farmą.
 * `owner` = null → kolonia GRACZA; 'emp_001' → kolonia AI (rejestr `colonyManager` ją zwraca,
 * więc `systemBelongsToPlayer` ma co rozwiązać). `ownerless:true` → brak rejestru (T7).
 */
function setup({ owner = null, ownerless = false, laborers = 2, farmLevel = 1 } = {}) {
  const tech = new TechSystem();
  const grid = new HexGrid(12, 12); grid.forEach(tl => { tl.type = 'plains'; });
  const res = new ResourceSystem({}); for (const k of res.inventory.keys()) res.inventory.set(k, 99999);
  const civ = new CivilizationSystem({}, tech, { id: 'cap', atmosphere: 'breathable' });
  civ.resourceSystem = res; civ.housing = 400;
  for (const s of Object.values(civ.strata)) s.count = 0; civ._unemployed = 0;
  const bSys = new BuildingSystem(res, civ, tech); civ.buildingSystem = bSys;
  bSys._grid = grid; bSys._gridHeight = grid.height; bSys.setDeposits?.([]);
  bSys._planetId = 'cap';

  // Elektrownie na '0,x'/'1,x' (sortują się przed '9,x'), farma na '9,1' — LUSTRO pomiaru
  // ze stolicy `Thuban b`, gdzie sześć solarów '0,3'..'4,4' stało przed farmami '6,3'/'7,2'.
  const solarKeys = [];
  for (const qr of [[0, 1], [0, 2], [1, 1], [1, 2], [1, 3], [1, 4]]) {
    const tl = grid.get(qr[0], qr[1]);
    bSys._activateBuilding(tl.key, 'solar_farm', tl.r, tl.type, false);
    solarKeys.push(tl.key);
  }
  const ft = grid.get(9, 1);
  bSys._activateBuilding(ft.key, 'farm', ft.r, ft.type, false);
  const farmKey = ft.key;
  if (farmLevel > 1) bSys._active.get(farmKey).level = farmLevel;

  civ.strata.laborer.count = laborers; civ._unemployed = 0;

  window.KOSMOS = { civMode: true, timeSystem: { gameTime: 0 }, buildingSystem: bSys, civSystem: civ, resourceSystem: res };
  if (!ownerless) {
    const colony = { planetId: 'cap', buildingSystem: bSys, civSystem: civ, resourceSystem: res, ownerEmpireId: owner };
    window.KOSMOS.colonyManager = { getAllColonies: () => [colony], getColony: (id) => (id === 'cap' ? colony : null) };
  }
  bSys._reapplyAllRates();
  return { civ, bSys, res, grid, farmKey, solarKeys };
}
const teardown = (civ) => { civ.dispose(); window.KOSMOS.colonyManager = null; };

/** Etaty laborera stojące PRZED pierwszą farmą w porządku `activeKey` (bez priorytetów). */
function jobsBeforeFirstFarm(bSys) {
  const rows = [];
  for (const entry of bSys._active) {
    const k = entry[0], e = entry[1], b = e.building;
    if (!b || b.isAutonomous || (e.jobs ?? 0) === 0) continue;
    if ((b.popType ?? 'laborer') !== 'laborer') continue;
    rows.push([k, b.id, (e.jobs ?? 0) * (e.level ?? 1)]);
  }
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  let n = 0;
  for (const row of rows) { if (row[1] === 'farm') return n; n += row[2]; }
  return -1;   // brak farmy w kolejce — fixture zepsuty
}

// ════════════════════════════════════════════════════════════════════════════
console.log('--- T1: NIEJALOWOSC fixture (farma za >= N etatami, pula < N) ---');
{
  F().aiUniformStaffing = false;
  const s = setup({ owner: 'emp_001', laborers: 2 });
  const before = jobsBeforeFirstFarm(s.bSys);
  ok('T1a farma stoi za >= 6 etatami w porzadku activeKey (zmierzone ' + before + ')', before >= 6);
  ok('T1b pula laborera (' + s.civ.strata.laborer.count + ') < etaty przed farma (' + before + ') → greedy MUSI dac farmie 0',
     s.civ.strata.laborer.count < before);
  ok('T1c farma jest w _active i ma etat (inaczej T2/T3 mierza cisze)', (s.bSys._active.get(s.farmKey)?.jobs ?? 0) > 0);
  teardown(s.civ);
}

console.log('--- T2: DEFEKT — flaga OFF, kolonia AI: farma 0%, elektrownia 100% ---');
{
  F().aiUniformStaffing = false;
  const s = setup({ owner: 'emp_001', laborers: 2 });
  const effFarm = s.bSys._getBuildingLaborEfficiency(FARM, s.farmKey);
  const effSolar = s.bSys._getBuildingLaborEfficiency(SOLAR, s.solarKeys[0]);
  ok('T2a OBSADA FARMY = 0% (nie „malo" — zero)', effFarm === 0);
  ok('T2b pierwsza elektrownia w kolejce = 100%', effSolar === 1);
  teardown(s.civ);
}

console.log('--- T3: NAPRAWA — flaga ON, kolonia AI: farma na uniform > 0 ---');
{
  F().aiUniformStaffing = true;
  const s = setup({ owner: 'emp_001', laborers: 2 });
  const demand = s.bSys.getSlotDemand('laborer') - s.bSys.getSyntheticJobs('laborer');
  const expect = Math.min(1, s.civ.strata.laborer.count / demand);
  const effFarm = s.bSys._getBuildingLaborEfficiency(FARM, s.farmKey);
  const effSolar = s.bSys._getBuildingLaborEfficiency(SOLAR, s.solarKeys[0]);
  ok('T3a OBSADA FARMY > 0 (zmierzone ' + effFarm.toFixed(3) + ')', effFarm > 0);
  ok('T3b obsada farmy == uniform ' + expect.toFixed(3) + ' (strataCount/humanDemand)', near(effFarm, expect));
  ok('T3c elektrownia dostaje TE SAMA frakcje (uniform nie faworyzuje nikogo)', near(effSolar, expect));
  teardown(s.civ);
}

console.log('--- T4: GRACZ CO DO BITU — greedy + priorytet zachowane przy fladze ON ---');
{
  F().aiUniformStaffing = true;
  const s = setup({ owner: null, laborers: 2 });
  ok('T4a kolonia GRACZA: farma dalej 0% (greedy nietkniety)', s.bSys._getBuildingLaborEfficiency(FARM, s.farmKey) === 0);
  ok('T4b kolonia GRACZA: elektrownia 100%', s.bSys._getBuildingLaborEfficiency(SOLAR, s.solarKeys[0]) === 1);
  s.bSys.setBuildingDesignation(s.farmKey, 'priority');
  ok('T4c priorytet na farmie → 100% (mechanizm gracza dziala)', s.bSys._getBuildingLaborEfficiency(FARM, s.farmKey) === 1);
  // ⚠ pula = 2: priorytet zabiera 1 etat farmie, wiec PIERWSZY solar dalej ma swojego czlowieka.
  //   Pracownika oddaje DRUGI w kolejce — i to on jest pinem (pierwsza wersja celowala w [0] i padla).
  ok('T4d ... a drugi solar w kolejce oddaje pracownika (bylo 100%, jest 0%)',
     s.bSys._getBuildingLaborEfficiency(SOLAR, s.solarKeys[1]) === 0);
  teardown(s.civ);
}

console.log('--- T5: FINDING 230 — ulepszenie farmy nie kupuje nic, a przy jednym robotniku mniej zeruje produkcje ---');
{
  // ⚠ ARYTMETYKA, KTORA WYSZLA DOPIERO Z POMIARU (pierwsza wersja T5b zakladala spadek do zera
  //   od samego ulepszenia i PADLA): pod greedy `base × level × (share / (jobs × level))` skraca
  //   sie do `base × share`, wiec ulepszenie jest w najlepszym razie NEUTRALNE — potrojenie
  //   nominalu nie kupuje ANI JEDNEJ jednostki zywnosci. Zerem konczy sie dopiero wtedy, gdy
  //   farma o potrojonym wymaganiu wypadnie za koniec kolejki — czyli przy JEDNYM robotniku
  //   mniej. Tak wlasnie umarla stolica: `_executeFullColony` zabral 4 laborerow.
  F().aiUniformStaffing = false;
  const a = setup({ owner: 'emp_001', laborers: 7, farmLevel: 1 });
  const rate1 = a.res._producers.get('building_' + a.farmKey)?.food ?? 0;
  ok('T5a farma L1, pula 7 (6 solarow + farma) → pelna obsada, stawka food > 0 (' + rate1.toFixed(2) + ')', rate1 > 0);
  teardown(a.civ);

  const b = setup({ owner: 'emp_001', laborers: 7, farmLevel: 3 });
  const rate3 = b.res._producers.get('building_' + b.farmKey)?.food ?? 0;
  ok('T5b L1→L3 potraja NOMINAL (10→30), a zarejestrowana stawka NIE ROSNIE (' + rate1.toFixed(2) + ' → ' + rate3.toFixed(2) + ')',
     rate3 <= rate1 + 1e-9);
  teardown(b.civ);

  // JEDEN robotnik mniej (kolonizacja zabrala laborera) — farma L3 wypada za koniec kolejki.
  const c = setup({ owner: 'emp_001', laborers: 6, farmLevel: 3 });
  const rate0 = c.res._producers.get('building_' + c.farmKey)?.food ?? 0;
  const solarsFull = c.solarKeys.every(k => c.bSys._getBuildingLaborEfficiency(SOLAR, k) === 1);
  ok('T5c pula 7→6: ZAREJESTROWANA stawka food farmy = 0 (producent wyrejestrowany)', rate0 === 0);
  ok('T5d ... a WSZYSTKIE szesc elektrowni stoi na 100% — to kolejka, nie brak ludzi',
     solarsFull && c.solarKeys.length === 6);
  teardown(c.civ);

  F().aiUniformStaffing = true;
  const d = setup({ owner: 'emp_001', laborers: 6, farmLevel: 3 });
  const rateU = d.res._producers.get('building_' + d.farmKey)?.food ?? 0;
  ok('T5e pod UNIFORM ten SAM stan (L3, pula 6) daje stawke food > 0 (' + rateU.toFixed(2) + ')', rateU > 0);
  teardown(d.civ);
}

console.log('--- T6: KONTROLA PINU — flaga OFF: AI i gracz identyczni ---');
{
  F().aiUniformStaffing = false;
  const ai = setup({ owner: 'emp_001', laborers: 3 });
  const aiVals = [ai.bSys._getBuildingLaborEfficiency(FARM, ai.farmKey), ai.bSys._getBuildingLaborEfficiency(SOLAR, ai.solarKeys[0])];
  teardown(ai.civ);
  const pl = setup({ owner: null, laborers: 3 });
  const plVals = [pl.bSys._getBuildingLaborEfficiency(FARM, pl.farmKey), pl.bSys._getBuildingLaborEfficiency(SOLAR, pl.solarKeys[0])];
  teardown(pl.civ);
  ok('T6 flaga OFF → wartosci AI == wartosci gracza (S1 lezy, nic nie zmienia)',
     aiVals[0] === plVals[0] && aiVals[1] === plVals[1]);
}

console.log('--- T7: FAIL-OPEN — goly system bez rozwiazywalnego wlasciciela zostaje na greedy ---');
{
  F().aiUniformStaffing = true;
  const s = setup({ ownerless: true, laborers: 2 });
  ok('T7 brak colonyManager → greedy (chroni ~20 keeperow pinujacych goly BuildingSystem)',
     s.bSys._getBuildingLaborEfficiency(FARM, s.farmKey) === 0);
  teardown(s.civ);
}

console.log('--- T8: KADENCJA MEMO — wlasnosc przeliczana po uniewaznieniu cache ---');
{
  F().aiUniformStaffing = true;
  const s = setup({ owner: null, laborers: 2 });
  ok('T8a start jako kolonia GRACZA → greedy (farma 0%)', s.bSys._getBuildingLaborEfficiency(FARM, s.farmKey) === 0);
  // przejecie: kolonia staje sie AI + uniewaznienie cache (to robi kazda realna sciezka rate-reapply)
  window.KOSMOS.colonyManager.getAllColonies()[0].ownerEmpireId = 'emp_001';
  s.bSys._reapplyAllRates();
  ok('T8b po przejeciu + _reapplyAllRates → uniform (farma > 0), memo NIE przezylo',
     s.bSys._getBuildingLaborEfficiency(FARM, s.farmKey) > 0);
  teardown(s.civ);
}

F().aiUniformStaffing = true;
console.log('\n=== WYNIK: ' + pass + ' PASS / ' + fail + ' FAIL (z ' + (pass + fail) + ') ===');
process.exit(fail ? 1 : 0);
