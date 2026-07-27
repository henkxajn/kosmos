// Population 2.0 (Faza 2) — zatrudnienie, bezrobocie, płace, alokacja dwustopniowa, focus.
// Uruchom: node src/testing/smoke/tmp_pop2_employment_smoke.mjs
//
// Pokrycie (plan §Testy a–f):
//   (a) wolne etaty zasysają bezrobotnych wg płacy malejąco (jeden przebieg)
//   (b) migracja z tarciem: cap 10%/rok + brak ruchu do równej/niższej płacy
//   (c) utrata etatów → bezrobotni → satysfakcja spada przez REALNY wskaźnik
//   (d) slider focus podnosi pressure+płacę, ale NIE obsadę produkcyjną
//   (e) zablokowani (załogi) wyłączeni z migracji i z bezrobocia
//   (f) pełen rok cywilny na mock-kolonii: brak NaN + inwariant floor(humans)=Σstrata+U
//       + steady-state freePops === unemployed (Fork 1: rozjazd = FAIL)

import '../headless/env.js'; // MUST be first
import EventBus from '../../core/EventBus.js';
import { ResourceSystem } from '../../systems/ResourceSystem.js';
import { CivilizationSystem } from '../../systems/CivilizationSystem.js';
import { BuildingSystem } from '../../systems/BuildingSystem.js';
import { FactorySystem } from '../../systems/FactorySystem.js';
import { TechSystem } from '../../systems/TechSystem.js';
import { HexGrid } from '../../map/HexGrid.js';
import { BASE_WAGE } from '../../data/PopulationData.js';

window.KOSMOS = { civMode: true, timeSystem: { gameTime: 0 } };

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

// Mock BuildingSystem — tylko interfejs czytany przez CivilizationSystem (jobs/synth demand).
function mockBSys(jobs = {}, synth = {}) {
  return {
    getSlotDemand:    (t) => jobs[t]  ?? 0,
    getSyntheticJobs: (t) => synth[t] ?? 0,
    // Stuby czytane przez _calcStrataSatisfaction (satysfakcja per-strata) — neutralne.
    getMineEfficiency:         () => 0.5,
    getFactoryOutputRatio:     () => 0.5,
    getAdvancedBuildingsUptime:() => 0.5,
  };
}
function fresh(jobs = {}, synth = {}) {
  const civ = new CivilizationSystem({}, null, { id: 'emp', atmosphere: 'breathable' });
  for (const s of Object.values(civ.strata)) s.count = 0;   // czysta kolonia
  civ._unemployed = 0;
  civ.buildingSystem = mockBSys(jobs, synth);
  return civ;
}
const strataSum = (civ) => Object.values(civ.strata).reduce((a, s) => a + s.count, 0);

// ── (a) Alokacja: wolne etaty zasysają bezrobotnych wg płacy malejąco ────────
console.log('--- (a) Etap 1: wolne etaty wg płacy malejąco (jeden przebieg) ---');
{
  // jobs: scientist 3 (baseWage 4), laborer 3 (baseWage 1); 4 bezrobotnych → sci PRZED lab.
  const civ = fresh({ scientist: 3, laborer: 3 });
  civ._unemployed = 4;
  civ._allocateWorkforce();
  console.log(`    sci=${civ.strata.scientist.count} lab=${civ.strata.laborer.count} U=${civ._unemployed}`);
  ok('scientist (wyższa płaca) obsadzony PIERWSZY do pełna (3)', civ.strata.scientist.count === 3);
  ok('laborer dostaje resztę (1)', civ.strata.laborer.count === 1);
  ok('bezrobotni wchłonięci w jednym przebiegu (U=0)', civ._unemployed === 0);
  ok('suma zachowana (strata=4)', strataSum(civ) === 4);
  civ.dispose();
}

// ── (b) Migracja z tarciem: cap 10% + brak ruchu do równej/niższej płacy ─────
console.log('--- (b) Etap 2: tarcie 10% + tylko do ściśle wyższej płacy ---');
{
  // laborer w pełni obsadzony (100/100, wage 1), scientist 50 wolnych (wage 8) → 10% laborera migruje.
  const civ = fresh({ laborer: 100, scientist: 50 });
  civ.strata.laborer.count = 100;
  civ.strata.scientist.count = 0;
  civ._unemployed = 0;
  civ._allocateWorkforce();
  console.log(`    lab=${civ.strata.laborer.count} sci=${civ.strata.scientist.count}`);
  ok('cap 10%/rok: dokładnie 10 laborerów migrowało', civ.strata.laborer.count === 90);
  ok('migracja trafiła do scientist (wyższa płaca)', civ.strata.scientist.count === 10);
  civ.dispose();

  // Brak migracji „w dół": scientist obsadzony (wage 4), laborer wolne (wage 2) — sci NIE schodzi.
  const civ2 = fresh({ scientist: 50, laborer: 100 });
  civ2.strata.scientist.count = 50;
  civ2.strata.laborer.count = 0;
  civ2._unemployed = 0;
  civ2._allocateWorkforce();
  console.log(`    sci=${civ2.strata.scientist.count} lab=${civ2.strata.laborer.count}`);
  ok('brak migracji do NIŻSZEJ płacy (scientist zostaje 50)', civ2.strata.scientist.count === 50);
  ok('laborer pozostaje pusty (0 — nikt nie schodzi w dół)', civ2.strata.laborer.count === 0);
  civ2.dispose();
}

// ── (c) Utrata etatów → bezrobotni → satysfakcja spada (realny wskaźnik) ─────
console.log('--- (c) Rozbiórka → bezrobocie → satysfakcja spada ---');
{
  const civ = fresh({ laborer: 10 });
  civ.strata.laborer.count = 10;
  civ.housing = 40;   // brak crowdingu (10/40)
  civ._unemployed = 0;
  civ._allocateWorkforce();
  civ._updateSatisfaction();
  const satFull = civ.satisfaction;
  ok('pełne zatrudnienie: unemploymentRate = 0', civ.unemploymentRate === 0);

  // „Rozbiórka": jobs 10 → 4. Nadmiar (6) → bezrobotni.
  civ.buildingSystem = mockBSys({ laborer: 4 });
  civ._allocateWorkforce();
  console.log(`    po rozbiórce: lab=${civ.strata.laborer.count} U=${civ._unemployed} rate=${civ.unemploymentRate.toFixed(2)}`);
  ok('nadmiarowi workers → bezrobotni (U=6)', civ._unemployed === 6);
  ok('laborer skurczony do realnych etatów (4)', civ.strata.laborer.count === 4);
  ok('populacja TOTAL niezmieniona (10)', civ.population === 10);
  civ._updateSatisfaction();
  console.log(`    satysfakcja: pełne=${satFull.toFixed(1)} → bezrobocie=${civ.satisfaction.toFixed(1)}`);
  ok('satysfakcja SPADA przez realny unemploymentRate', civ.satisfaction < satFull - 5);
  ok('brak NaN w satysfakcji', Number.isFinite(civ.satisfaction));
  civ.dispose();
}

// ── (d) Slider focus: pressure+płaca ROSNĄ, obsada produkcyjna NIE ───────────
console.log('--- (d) Focus podnosi pressure/płacę, nie obsadę produkcyjną ---');
{
  const civ = fresh({ worker: 4 });
  civ.strata.worker.count = 4;   // pełna obsada → pressure 0
  const p0 = civ.getStrataPressure('worker'), w0 = civ.getStrataWage('worker');
  const jobs0 = civ._humanJobs('worker');
  ok('pressure=0 przy pełnej obsadzie', p0 === 0);
  ok('płaca bazowa przy pressure 0', Math.abs(w0 - BASE_WAGE.worker) < 1e-9);

  civ.setStrataFocus('worker', 99);   // clamp do capa = floor(0.25×4)=1
  ok('focus clamp do 25% etatów (cap=1)', civ.getStrataFocus('worker') === 1);
  const p1 = civ.getStrataPressure('worker'), w1 = civ.getStrataWage('worker');
  console.log(`    pressure ${p0}→${p1.toFixed(2)}  wage ${w0}→${w1.toFixed(2)}  realJobs ${jobs0}`);
  ok('focus PODNOSI pressure (>0)', p1 > p0);
  ok('focus PODNOSI płacę (>bazowa)', w1 > w0);
  ok('focus NIE zmienia realnych etatów (staffing)', civ._humanJobs('worker') === jobs0);

  // Focus nie tworzy etatu do obsadzenia: bezrobotni NIE są zasysani przez sam focus.
  civ._unemployed = 5;
  civ._allocateWorkforce();
  ok('focus nie wchłania bezrobotnych (U=5, worker=4)', civ._unemployed === 5 && civ.strata.worker.count === 4);
  civ.dispose();
}

// ── (e) Zablokowani (załogi) — brak migracji, brak bezrobocia ────────────────
console.log('--- (e) LockedPops wyłączeni z migracji i bezrobocia ---');
{
  // laborer 10, wszyscy zablokowani (crew); scientist 5 wolnych (wyższa płaca).
  const civ = fresh({ laborer: 10, scientist: 5 });
  civ.strata.laborer.count = 10;
  civ._lockedPerStrata = { laborer: 10 };
  civ._unemployed = 0;
  civ._allocateWorkforce();
  console.log(`    lab=${civ.strata.laborer.count} sci=${civ.strata.scientist.count} U=${civ._unemployed}`);
  ok('zablokowani NIE migrują (laborer zostaje 10)', civ.strata.laborer.count === 10);
  ok('zablokowani NIE stają się bezrobotni (U=0)', civ._unemployed === 0);
  ok('scientist pozostaje pusty (brak wolnych do migracji)', civ.strata.scientist.count === 0);

  // Częściowy lock: count 10, locked 6, jobs 4 → unlocked (4) = jobs → brak eviction.
  const civ2 = fresh({ laborer: 4 });
  civ2.strata.laborer.count = 10;
  civ2._lockedPerStrata = { laborer: 6 };
  civ2._unemployed = 0;
  civ2._allocateWorkforce();
  ok('częściowy lock: unlocked=jobs → brak eviction (count=10)', civ2.strata.laborer.count === 10);
  ok('częściowy lock: brak bezrobocia (U=0)', civ2._unemployed === 0);
  civ.dispose(); civ2.dispose();
}

// ── (f) Rok cywilny na mock-kolonii: brak NaN + inwariant + freePops===U ─────
console.log('--- (f) Pełen rok cywilny: inwariant + steady-state freePops===U ---');
{
  const jobs = { laborer: 6, miner: 4, worker: 4, scientist: 2, engineer: 2 };
  const totalJobs = Object.values(jobs).reduce((a, b) => a + b, 0);   // 18
  const civ = fresh(jobs);
  civ.strata.laborer.count = 30;   // nadmiar → część do bezrobocia po alokacji
  civ.housing = 200;
  civ.resourceSystem = new ResourceSystem({});
  civ._resourceRatio = () => 1.0;   // brak głodu — izolacja od śmierci POPów
  // _employedPops = Σ etatów (w realnej grze utrzymywane przez BuildingSystem.changeEmployment).
  civ._employedPops = totalJobs;
  window.KOSMOS.civSystem = civ;

  let invariantOk = true, nanOk = true, steadyOk = true, tick = 0;
  for (let y = 0; y < 12; y++) {
    EventBus.emit('time:tick', { deltaYears: 1 / 12, civDeltaYears: 1, gameTime: y + 1 });
    tick++;
    const floorH = Math.floor(civ.humans);
    if (floorH !== strataSum(civ) + civ._unemployed) invariantOk = false;
    for (const t of Object.keys(jobs)) {
      if (!Number.isFinite(civ.getStrataWage(t)) || !Number.isFinite(civ.getStrataPressure(t))) nanOk = false;
    }
    if (!Number.isFinite(civ.satisfaction) || !Number.isFinite(civ.humans)) nanOk = false;
    // Steady-state (bez syntetyków, locked=0): freePops === unemployed. Rozjazd = FAIL (Fork 1).
    if (civ.freePops !== civ._unemployed) steadyOk = false;
  }
  console.log(`    po ${tick} latach: pop=${civ.population} strata=${strataSum(civ)} U=${civ._unemployed} freePops=${civ.freePops} sat=${civ.satisfaction.toFixed(1)}`);
  ok('inwariant floor(humans)=Σstrata+U w KAŻDYM ticku', invariantOk);
  ok('brak NaN (płace/pressure/satysfakcja/humans) w każdym ticku', nanOk);
  ok('steady-state: freePops === unemployed (tolerancja 0; synth/lock=0)', steadyOk);
  ok('wszystkie etaty obsadzone (Σstrata ≥ totalJobs)', strataSum(civ) >= totalJobs);
  ok('nadmiar trafił do bezrobocia (U > 0)', civ._unemployed > 0);
  civ.dispose();
  window.KOSMOS.civSystem = null;
}

// ── FIX A — budowa BEZ wolnych POP (płynna obsada §3.4) ──────────────────────
console.log('--- FIX A: budowa przy 0 wolnych pracowników → sukces, obsada 0 ---');
{
  const planet = { id: 'fa', atmosphere: 'breathable', temperatureC: 15, surfaceGravity: 1, deposits: [] };
  const tech = new TechSystem();
  const grid = new HexGrid(6, 8); grid.forEach(tl => { tl.type = 'plains'; });
  const res = new ResourceSystem({});
  for (const k of res.inventory.keys()) res.inventory.set(k, 99999);   // pełne zasoby (budowa nie czeka na surowce)
  const civ = new CivilizationSystem({}, tech, planet);
  civ.resourceSystem = res; civ.housing = 40;
  for (const s of Object.values(civ.strata)) s.count = 0;              // ZERO pracowników / ZERO wolnych POP
  civ._unemployed = 0;
  const bSys = new BuildingSystem(res, civ, tech); civ.buildingSystem = bSys;
  bSys._grid = grid; bSys._gridHeight = grid.height; bSys.setDeposits?.([]);
  bSys.setFactorySystem(new FactorySystem(res));
  window.KOSMOS.civSystem = civ;

  civ._updateSatisfaction(); const satBefore = civ.satisfaction;

  // Budowa solar_farm (koszt Fe/Si/Cu — pełne zasoby) przy 0 wolnych POP.
  const tile = grid.get(1, 1);
  bSys._build(tile, 'solar_farm');
  ok('FIX A: budowa NIE trafia do pending z braku POP (pending pusty)', bSys._pendingQueue.size === 0);
  ok('FIX A: budowa RUSZYŁA (construction lub active — nie zablokowana)',
    bSys._constructionQueue.size >= 1 || bSys._active.size >= 1);

  // Aktywuj drugą (pomiń buildTime) — sprawdź otwarte etaty + obsadę 0.
  const t2 = grid.get(3, 3);
  bSys._activateBuilding(t2.key, 'solar_farm', t2.r, t2.type, false);
  const solar = bSys._active.get(t2.key)?.building;
  ok('FIX A: etaty otwarte (getSlotDemand laborer > 0)', civ.getStrataJobs('laborer') > 0);
  ok('FIX A: obsada 0 → efektywność 0 (min(1, workers/jobs) staffing-scaled)',
    bSys._getBuildingLaborEfficiency(solar, t2.key) === 0);

  // Budowa nie tworzy bezrobocia → satysfakcja niezmieniona (dopóki bezrobocie się nie zmieni).
  civ._allocateWorkforce();
  ok('FIX A: brak bezrobocia po budowie (U=0 — nie ma ludzi)', civ._unemployed === 0);
  civ._updateSatisfaction();
  ok('FIX A: satysfakcja NIEzmieniona (bezrobocie bez zmian)', Math.abs(civ.satisfaction - satBefore) < 0.01);

  civ.dispose(); window.KOSMOS.civSystem = null;
}

// ── FIX B — focus slider dostępny dla małych strat (1–3 etaty → min. 1 krok) ─
console.log('--- FIX B: focus cap ≥ 1 dla każdej aktywnej straty ---');
{
  const civ = fresh({ laborer: 1, scientist: 8 });
  ok('FIX B: 1 etat → focusCap = 1 (nie 0)', civ._focusCap('laborer') === 1);
  ok('FIX B: 8 etatów → focusCap = 2 (floor(0.25×8))', civ._focusCap('scientist') === 2);
  ok('FIX B: 0 etatów → focusCap = 0 (brak budynków = brak slidera)', civ._focusCap('miner') === 0);
  civ.setStrataFocus('laborer', 1);
  ok('FIX B: 1-etatowa strata pozwala focusBonus 0..1 (set 1 → 1)', civ.getStrataFocus('laborer') === 1);
  civ.setStrataFocus('laborer', 5);   // clamp do 1
  ok('FIX B: focusBonus clampuje do capa (5 → 1)', civ.getStrataFocus('laborer') === 1);
  civ.setStrataFocus('laborer', 0);
  ok('FIX B: focusBonus schodzi do 0', civ.getStrataFocus('laborer') === 0);
  civ.dispose();
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
