// Population 2.0 (Faza 4) — REGRESJA: sloty syntetyczne (droidy) NIE zajmują ludzkiego zatrudnienia.
// Pinuje relację unemployed ↔ freePops ↔ locks ↔ installed-synthetics na kolonii z WSZYSTKIMI czterema.
// Uruchom: node src/testing/smoke/tmp_pop4_synth_freepops_smoke.mjs
//
// BUG (przed fixem): _employedPops jest BRUTTO (zawiera etaty obsadzone droidami), a freePops =
// population − _employedPops − locked odejmował syntetyki drugi raz (człowiek zwolniony przez droida
// siedzi w _unemployed, ale jego etat wciąż liczony jako zatrudnienie) → „0 wolnych" mimo bezrobotnych,
// rekrutacja zablokowana. FIX: freePops/needsImmigrants netują getSyntheticJobsTotal() (wzór §3.4).
// Ten test przechodzi na kodzie PO fixie; na kodzie sprzed fixu asercje (A5/A6/B2/C) PADAJĄ.

import '../headless/env.js'; // MUST be first
import { BUILDINGS } from '../../data/BuildingsData.js';
import { ResourceSystem } from '../../systems/ResourceSystem.js';
import { CivilizationSystem } from '../../systems/CivilizationSystem.js';
import { BuildingSystem } from '../../systems/BuildingSystem.js';
import { HexGrid } from '../../map/HexGrid.js';

window.KOSMOS = { civMode: true, timeSystem: { gameTime: 0 } };
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

const STRATA = ['laborer', 'miner', 'worker', 'scientist', 'merchant', 'engineer', 'bureaucrat'];

/** Zbuduj realną kolonię: laborer + miner (część z droidem), realny lock, seed bezrobotnych. */
function buildColony({ labor, miner, droidLabor, droidMiner, seedUnemployed, lock }) {
  const grid = new HexGrid(10, 12); grid.forEach(t => { t.type = 'plains'; });
  const res = new ResourceSystem({ automation_droid: 99 });
  const civ = new CivilizationSystem({}, null, { id: 'reg', atmosphere: 'breathable' });
  civ.resourceSystem = res;
  const bs = new BuildingSystem(res, civ, null); civ.buildingSystem = bs;
  bs._grid = grid; bs._gridHeight = grid.height;
  window.KOSMOS.civSystem = civ; window.KOSMOS.buildingSystem = bs; window.KOSMOS.resourceSystem = res;
  for (const s of Object.values(civ.strata)) s.count = 0;
  civ._unemployed = seedUnemployed;
  const keys = []; grid.forEach(t => { if (keys.length < 24) keys.push(`${t.q},${t.r}`); });
  let k = 0;
  const act = (bid) => { const key = keys[k++]; const [q, r] = key.split(',').map(Number); bs._activateBuilding(key, bid, grid.get(q, r).r, grid.get(q, r).type, false); return key; };
  const labK = []; for (let i = 0; i < labor; i++) labK.push(act('solar_farm'));  // laborer
  const minK = []; for (let i = 0; i < miner; i++) minK.push(act('smelter'));     // miner
  for (let i = 0; i < droidLabor; i++) bs.installSynthetic(labK[i], 'automation_droid');
  for (let i = 0; i < droidMiner; i++) bs.installSynthetic(minK[i], 'automation_droid');
  if (lock > 0) civ.lockPops(lock, 'laborer');
  civ._allocateWorkforce();
  return { civ, bs, res, grid, labK, minK };
}

const sum = (fn) => STRATA.reduce((s, t) => s + fn(t), 0);

// ── (A) Równanie modelu — kolonia z WSZYSTKIMI czterema (unemployed + freePops + locks + synth) ──
console.log('--- (A) równanie: unemployed + freePops + locks + synth współistnieją ---');
{
  const { civ, bs } = buildColony({ labor: 5, miner: 3, droidLabor: 3, droidMiner: 3, seedUnemployed: 60, lock: 2 });
  const pop = civ.population, emp = civ._employedPops, locked = civ._lockedPops, unemp = civ._unemployed;
  const synthTotal = bs.getSyntheticJobsTotal();
  const humanJobs = sum(t => Math.max(0, bs.getSlotDemand(t) - bs.getSyntheticJobs(t)));
  const free = civ.freePops;
  console.log(`    pop=${pop} Σstrata=${pop - unemp} emp(gross)=${emp} locked=${locked} unemp=${unemp} synth=${synthTotal} humanJobs=${humanJobs} free=${free}`);

  ok('(A1) wszystkie cztery obecne (unemp>0, free>0, locked>0, synth>0)', unemp > 0 && free > 0 && locked > 0 && synthTotal > 0);
  ok('(A2) _employedPops jest BRUTTO = humanJobs + synthTotal', emp === humanJobs + synthTotal);
  ok('(A3) getSyntheticJobsTotal() === Σ getSyntheticJobs(strata)', synthTotal === sum(t => bs.getSyntheticJobs(t)));
  ok('(A4) getSyntheticJobsTotal() === 6 (3 laborer + 3 miner droidy)', synthTotal === 6);
  // Getter musi odpowiadać jawnemu wzorowi netowania.
  const expected = Math.max(0, pop - Math.max(0, emp - synthTotal) - locked);
  ok('(A5) freePops === max(0, pop − (emp − synth) − locked)', free === expected);
  // Net-employed (po odjęciu droidów) MUSI równać się realnemu popytowi na ludzi (Σ humanJobs) — dowód,
  // że odejmujemy DOKŁADNIE etaty syntetyczne (ani mniej, ani więcej).
  ok('(A6) max(0, emp − synth) === Σ humanJobs (netto = realny popyt na ludzi)', Math.max(0, emp - synthTotal) === humanJobs);
  // Dokumentacja BUGA: stary wzór (brutto) drenował freePops DOKŁADNIE o synthTotal.
  const buggy = Math.max(0, pop - emp - locked);
  ok('(A7) stary (buggy) wzór drenuje freePops o synthTotal', free - buggy === synthTotal);
  civ.dispose();
}

// ── (B) Objaw ze zgłoszenia: minimalna obsada → buggy clamp do 0, fix = unemployed > 0 ──
console.log('--- (B) objaw: free=0 mimo unemployed>0 (buggy) → naprawione ---');
{
  // 6 laborer + 4 miner = 10 brutto; seed = dokładnie 10 (minimalna pełna obsada); droidy 4+4 = synth 8.
  const { civ, bs } = buildColony({ labor: 6, miner: 4, droidLabor: 4, droidMiner: 4, seedUnemployed: 10, lock: 0 });
  const pop = civ.population, emp = civ._employedPops, locked = civ._lockedPops, unemp = civ._unemployed;
  const synthTotal = bs.getSyntheticJobsTotal();
  console.log(`    pop=${pop} emp=${emp} unemp=${unemp} synth=${synthTotal} free=${civ.freePops}`);
  const buggy = Math.max(0, pop - emp - locked);
  ok('(B1) stary wzór clampowałby freePops do 0 (objaw: rekrutacja zablokowana)', buggy === 0 && unemp > 0);
  ok('(B2) fix: freePops === unemployed > 0 (rekrutacja odblokowana)', civ.freePops === unemp && civ.freePops > 0);
  civ.dispose();
}

// ── (C) Monotoniczność: instalacja droida NIGDY nie zmniejsza freePops (droid uwalnia człowieka) ──
console.log('--- (C) install droida NIE zmniejsza freePops (uwalnia człowieka do bezrobotnych) ---');
{
  const { civ, bs, labK } = buildColony({ labor: 4, miner: 2, droidLabor: 1, droidMiner: 0, seedUnemployed: 20, lock: 1 });
  const before = civ.freePops;
  // Zainstaluj kolejnego droida na obsadzonym LUDZKIM budynku laborer (uwalnia 1 człowieka).
  const targetKey = labK.find(kk => !bs._grid.get(...kk.split(',').map(Number)).syntheticSlot);
  const r = bs.installSynthetic(targetKey, 'automation_droid');   // FIX A: install sam reallokuje (bez ręcznego allocate)
  const after = civ.freePops;
  console.log(`    install ${r.success ? 'OK' : 'FAIL'}  freePops ${before} → ${after}`);
  ok('(C1) install droida sukces', r.success === true);
  ok('(C2) freePops NIE zmalał po instalacji (>= przed)', after >= before);
  ok('(C3) freePops WZRÓSŁ o 1 (uwolniony człowiek → bezrobotny → wolny)', after === before + 1);
  civ.dispose();
}

// ── (D) countInstalledSynthetics: licznik zainstalowanych slotów (1 slot = 1 jednostka) ──
console.log('--- (D) countInstalledSynthetics: licznik jednostek zainstalowanych ---');
{
  const { civ, bs } = buildColony({ labor: 4, miner: 3, droidLabor: 2, droidMiner: 3, seedUnemployed: 30, lock: 0 });
  ok('(D1) countInstalledSynthetics() === 5 (2 laborer + 3 miner)', bs.countInstalledSynthetics() === 5);
  ok('(D2) countInstalledSynthetics(automation_droid) === 5', bs.countInstalledSynthetics('automation_droid') === 5);
  ok('(D3) countInstalledSynthetics(android_worker) === 0 (nie instalowano)', bs.countInstalledSynthetics('android_worker') === 0);
  civ.dispose();
}

// ── (E) Bezpieczeństwo: kolonia bez buildingSystem (abstrakcyjna AI) — netowanie=0, brak crasha ──
console.log('--- (E) abstrakcyjna kolonia (brak buildingSystem) → net=0, freePops bez zmian ---');
{
  const civ = new CivilizationSystem({}, null, { id: 'abstract', atmosphere: 'breathable' });
  for (const s of Object.values(civ.strata)) s.count = 0;
  civ.strata.laborer.count = 5;
  civ._employedPops = 5; civ._unemployed = 3;
  ok('(E1) _syntheticJobsTotal() === 0 gdy brak buildingSystem', civ._syntheticJobsTotal() === 0);
  ok('(E2) freePops === max(0, pop − emp − locked) (bez zmian, net 0)', civ.freePops === Math.max(0, civ.population - 5 - civ._lockedPops));
  ok('(E3) freePops nie rzuca wyjątku', typeof civ.freePops === 'number');
  civ.dispose();
}

// ── (F) FIX A: installSynthetic wyzwala NATYCHMIASTOWĄ realokację (bez czekania na roczny tick) ──
console.log('--- (F) FIX A: install → natychmiastowe wyparcie człowieka do bezrobocia (bez rocznego ticku) ---');
{
  // 1 laborer budynek w pełni obsadzony (1 human), 0 wolnych etatów gdzie indziej → wyparty = bezrobotny.
  const { civ, bs, labK } = buildColony({ labor: 1, miner: 0, droidLabor: 0, droidMiner: 0, seedUnemployed: 1, lock: 0 });
  const beforeW = civ.getStrataWorkers('laborer'), beforeU = civ._unemployed;
  const r = bs.installSynthetic(labK[0], 'automation_droid');   // BEZ ręcznego _allocateWorkforce
  ok('(F1) install OK', r.success === true);
  ok('(F2) syntheticJobs(laborer) === 1 natychmiast', bs.getSyntheticJobs('laborer') === 1);
  ok('(F3) human NATYCHMIAST wyparty (workers 1→0)', beforeW === 1 && civ.getStrataWorkers('laborer') === 0);
  ok('(F4) wyparty → bezrobotny (unemployed 0→1)', beforeU === 0 && civ._unemployed === 1);
  ok('(F5) inwariant floor(humans) === Σstrata + unemployed', Math.floor(civ.humans) === civ._strataCount + civ._unemployed);
  ok('(F6) freePops świeże BEZ ręcznego allocate (=unemployed)', civ.freePops === civ._unemployed);
  civ.dispose();
}

// ── (G) FIX A: wyparty człowiek reallokuje się do WOLNEGO etatu (nie do bezrobocia) ──
console.log('--- (G) FIX A: wyparty człowiek → wolny etat innej straty (realokacja przed bezrobociem) ---');
{
  // 1 laborer (obsadzony) + 1 miner (NIEobsadzony wolny etat); seed=1 starcza tylko na laborer.
  const { civ, bs, labK } = buildColony({ labor: 1, miner: 1, droidLabor: 0, droidMiner: 0, seedUnemployed: 1, lock: 0 });
  ok('(G0) start: miner ma wolny etat (humanJobs 1, workers 0)', civ._humanJobs('miner') === 1 && civ.getStrataWorkers('miner') === 0);
  const r = bs.installSynthetic(labK[0], 'automation_droid');
  ok('(G1) install OK', r.success === true);
  ok('(G2) wyparty laborer → miner (workers miner 0→1)', civ.getStrataWorkers('miner') === 1);
  ok('(G3) laborer wyparty (workers 0)', civ.getStrataWorkers('laborer') === 0);
  ok('(G4) NIE trafił do bezrobotnych (unemployed === 0)', civ._unemployed === 0);
  ok('(G5) inwariant floor(humans) === Σstrata + unemployed', Math.floor(civ.humans) === civ._strataCount + civ._unemployed);
  civ.dispose();
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
