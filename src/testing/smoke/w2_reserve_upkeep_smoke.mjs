// W2 — keeper utrzymania rezerwy (commit W2-5, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: orzeczenie R-A brzmi „tania rezerwa, ale LICZONA". Tanio jest łatwo — trudno jest
// ZLICZYĆ tak, żeby wszystkie odczyty mówiły to samo i żeby przy niedoborze kredytów bez
// opłaty został MAGAZYN, a nie okręt broniący układu. `getVesselUpkeepCredits` ma PIĘĆ
// konsumentów i jest zarazem KLUCZEM SORTOWANIA w naliczaniu — wstawienie rabatu w złym
// miejscu odwraca ranking i nie widać tego w żadnym panelu.
//
//   T1  stawka rezerwy = dokładnie 10 % pełnej; `mobilizing` liczy się jak rezerwa
//   T2  wszystkie odczyty widzą stawkę EFEKTYWNĄ (suma floty, rozbicie, panel grupy)
//   T3  SORTOWANIE: przy niedoborze bez opłaty zostaje REZERWA, nie służba
//   T4  rezerwa NIE narasta zaległościami (decyzja 17)
//   T5  rozmieszczenie ODMÓWIONE, gdy kolonia zalega — z powodem
//   T6  utrzymanie AI dalej NIE jest naliczane (decyzja 14 — jawna, podpisana asymetria)
//
// ⚠ „Nie do zaspokojenia przez sąsiada": T3 to jedyny test, który mierzy KLUCZ SORTOWANIA.
//    Fixture jest tak dobrany, że rezerwa jest TAŃSZA od okrętu w służbie — czyli stary
//    komparator („najtańszy pierwszy") zapłaciłby najpierw za MAGAZYN. Gdyby rabat wszedł
//    do klucza, ten test zrobiłby się czerwony.

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import { createVessel } from '../../entities/Vessel.js';
import { HULLS } from '../../data/HullsData.js';
import { VesselManager } from '../../systems/VesselManager.js';
import { summarizeFleetGroup } from '../../ui/FleetGroupPanelLogic.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const RESERVE_FACTOR = 0.10;           // R-A — ta liczba jest ORZECZENIEM, nie implementacją
const boot = () => { const c = new GameCore(); c.boot({ quiet: true, scenario: 'civilization' }); return c; };

/** Kadłub gracza zadokowany w kolonii, o zadanym stanie służby. */
function mk(core, colonyId, shipId, state, name) {
  const v = createVessel(shipId, colonyId, {
    name, modules: ['engine_ion'], x: 0, y: 0, systemId: 'sys_home', serviceState: state,
  });
  v.position.state = 'docked';
  v.position.dockedAt = colonyId;
  v.homeColonyId = colonyId;
  v.unpaidYears = 0;
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

// ── T1 — stawka rezerwy to dokładnie 10 % pełnej ────────────────────────────────────────────
console.log('T1 — kadłub poza służbą płaci DOKŁADNIE 10 % pełnej stawki');
{
  const core = boot();
  const home = window.KOSMOS.homePlanet?.id;
  const vm = core.vesselManager;

  const full = HULLS.hull_cruiser?.upkeepCredits ?? 0;
  assert(full > 0, `T1 KONTROLA PINU: hull_cruiser ma dodatnie upkeepCredits (${full} Kr/rok gry)`);

  const active = mk(core, home, 'hull_cruiser', 'active', 'W służbie');
  const stored = mk(core, home, 'hull_cruiser', 'stored', 'W rezerwie');
  const mobil  = mk(core, home, 'hull_cruiser', 'mobilizing', 'W mobilizacji');

  assert(near(vm.getVesselUpkeepCredits(active), full),
    `T1: służba płaci PEŁNĄ stawkę (${vm.getVesselUpkeepCredits(active)} vs ${full})`);
  assert(near(vm.getVesselUpkeepCredits(stored), full * RESERVE_FACTOR),
    `T1: rezerwa płaci ${RESERVE_FACTOR * 100} % (${vm.getVesselUpkeepCredits(stored)} vs ${full * RESERVE_FACTOR})`);
  assert(near(vm.getVesselUpkeepCredits(mobil), full * RESERVE_FACTOR),
    'T1: `mobilizing` liczy się jak REZERWA — `isInService` jest JEDYNYM predykatem służby');
  assert(near(vm.getVesselBaseUpkeepCredits(stored), full),
    `T1: stawka PEŁNA jest osobno dostępna (${vm.getVesselBaseUpkeepCredits(stored)}) — panel może pokazać obie`);
}

// ── T2 — wszystkie odczyty widzą stawkę efektywną ───────────────────────────────────────────
console.log('T2 — pięć odczytów, jedna prawda (suma floty, rozbicie, panel grupy)');
{
  const core = boot();
  const home = window.KOSMOS.homePlanet?.id;
  const vm = core.vesselManager;
  const full = HULLS.hull_cruiser?.upkeepCredits ?? 0;

  const a = mk(core, home, 'hull_cruiser', 'active', 'A');
  const s = mk(core, home, 'hull_cruiser', 'stored', 'S');
  const expected = full + full * RESERVE_FACTOR;

  assert(near(vm.getTotalFleetUpkeep(), expected),
    `T2a: suma floty liczy rezerwę po stawce ulgowej (${vm.getTotalFleetUpkeep()} vs ${expected})`);

  const br = vm.getFleetUpkeepBreakdown();
  assert(near(br.deployed, full) && near(br.reserve, full * RESERVE_FACTOR),
    `T2b: rozbicie służba/rezerwa (${br.deployed} / ${br.reserve})`);
  assert(br.deployedCount === 1 && br.reserveCount === 1,
    `T2b: liczniki po obu stronach (${br.deployedCount} / ${br.reserveCount})`);
  assert(near(br.total, vm.getTotalFleetUpkeep()),
    'T2b: rozbicie sumuje się do tego samego, co suma floty — panele nie mogą się rozjechać');

  const sum = summarizeFleetGroup([a, s], { vesselManager: vm });
  assert(near(sum.totalUpkeep, expected),
    `T2c: panel grupy floty widzi tę samą sumę (${sum.totalUpkeep})`);
  assert(sum.reserveCount === 1 && near(sum.reserveUpkeep, full * RESERVE_FACTOR),
    `T2c: …i osobno, ile z tego to magazyn (${sum.reserveCount} × ${sum.reserveUpkeep})`);
}

// ── T3 — sortowanie: bez opłaty zostaje REZERWA ─────────────────────────────────────────────
console.log('T3 — przy niedoborze kredytów bez opłaty zostaje MAGAZYN, nie obrońca');
{
  const core = boot();
  const home = window.KOSMOS.homePlanet?.id;
  const vm = core.vesselManager;
  const col = core.colonyManager.getColony(home);

  // ⚠ FIXTURE ODWRACAJĄCY NAIWNY KOMPARATOR: rezerwa jest z DROŻSZEGO kadłuba, ale po
  //    rabacie i tak TAŃSZA od okrętu w służbie. „Najtańszy pierwszy" bez klucza służby
  //    zapłaciłby więc najpierw za nią.
  const defender = mk(core, home, 'hull_frigate', 'active', 'Obrońca');
  const warehouse = mk(core, home, 'hull_cruiser', 'stored', 'Magazyn');
  const dCost = vm.getVesselUpkeepCredits(defender);
  const wCost = vm.getVesselUpkeepCredits(warehouse);
  assert(wCost < dCost,
    `T3 KONTROLA FIXTURE: rezerwa jest TAŃSZA (${wCost} < ${dCost}) — naiwny komparator wybrałby ją pierwszą`);

  // Kredytów starczy DOKŁADNIE na jeden rachunek — ten droższy.
  col.credits = Math.ceil(dCost);
  vm._maintenanceAccum = 0;
  vm._tickVesselMaintenance(1.0);      // 1.0 ROKU GRY (nie civYear — utrzymanie ma własną kadencję)

  assert((defender.unpaidYears ?? 0) === 0,
    `T3: OKRĘT W SŁUŻBIE opłacony (unpaidYears=${defender.unpaidYears})`);
  assert(col.credits < Math.ceil(dCost),
    `T3 KONTROLA: kredyty faktycznie wydane (${col.credits})`);
}

// ── T4 — rezerwa nie narasta zaległościami ──────────────────────────────────────────────────
console.log('T4 — rezerwa NIE zalega (decyzja 17): magazyn nie zamienia się w pułapkę');
{
  const core = boot();
  const home = window.KOSMOS.homePlanet?.id;
  const vm = core.vesselManager;
  const col = core.colonyManager.getColony(home);

  const stored = mk(core, home, 'hull_cruiser', 'stored', 'Magazyn');
  const active = mk(core, home, 'hull_cruiser', 'active', 'Obrońca');
  col.credits = 0;                        // nie stać na NIC

  for (let i = 0; i < 4; i++) { vm._maintenanceAccum = 0; vm._tickVesselMaintenance(1.0); }

  assert((stored.unpaidYears ?? 0) === 0,
    `T4: kadłub w REZERWIE nie ma ani jednego roku zaległości (${stored.unpaidYears}) mimo zerowych kredytów`);
  assert((active.unpaidYears ?? 0) >= 4,
    `T4 KONTROLA PINU: kadłub W SŁUŻBIE zalega normalnie (${active.unpaidYears}) — pin mierzy stan, nie brak naliczania`);
  assert(vm.isImmobilized(stored) === false,
    'T4: rezerwa nie da się unieruchomić z tytułu długu — wychodziłaby z magazynu od razu sparaliżowana');
  assert(vm.isImmobilized(active) === true,
    'T4 KONTROLA PINU: służba unieruchamia się po progu (mechanizm S3.5a-1 nietknięty)');
}

// ── T5 — deploy odmówiony przy zaległościach ────────────────────────────────────────────────
console.log('T5 — rozmieszczenie ODMÓWIONE, gdy kolonia zalega (decyzja 17)');
{
  const core = boot();
  const home = window.KOSMOS.homePlanet?.id;
  const vm = core.vesselManager;
  const col = core.colonyManager.getColony(home);

  const debtor = mk(core, home, 'hull_cruiser', 'active', 'Dłużnik');
  const stored = mk(core, home, 'hull_frigate', 'stored', 'Czeka w magazynie');

  assert(vm.colonyInArrears(home) === false, 'T5 KONTROLA PINU: bez długu kolonia NIE zalega');
  const okBefore = vm.deployVessel(stored.id);
  assert(okBefore?.ok === true,
    `T5 KONTROLA PINU: bez długu rozmieszczenie PRZECHODZI (ok=${okBefore?.ok}, reason=${okBefore?.reason ?? '—'})`);
  // cofnij do rezerwy, żeby zmierzyć odmowę na tym samym kadłubie
  stored.serviceState = 'stored'; stored.mobilizeTarget = null; stored.mobilizeProgress = 0;

  col.credits = 0;
  vm._maintenanceAccum = 0; vm._tickVesselMaintenance(1.0);
  assert((debtor.unpaidYears ?? 0) > 0, `T5: kolonia realnie wpadła w dług (${debtor.unpaidYears} rok)`);
  assert(vm.colonyInArrears(home) === true, 'T5: `colonyInArrears` widzi dług');

  const res = vm.deployVessel(stored.id);
  assert(res?.ok === false && res?.reason === 'colony_in_arrears',
    `T5: rozmieszczenie ODMÓWIONE z powodem (ok=${res?.ok}, reason=${res?.reason})`);
  assert(stored.serviceState === 'stored',
    'T5: kadłub ZOSTAJE w rezerwie — odmowa nie oddaje okrętu sparaliżowanego, tylko go nie wypuszcza');
}

// ── T6 — AI dalej nie płaci (decyzja 14) ────────────────────────────────────────────────────
console.log('T6 — utrzymanie floty AI NIE jest naliczane (jawna, podpisana asymetria)');
{
  const core = boot();
  const home = window.KOSMOS.homePlanet?.id;
  const vm = core.vesselManager;
  const col = core.colonyManager.getColony(home);

  const enemy = mk(core, home, 'hull_cruiser', 'active', 'Wrogi');
  enemy.ownerEmpireId = 'emp_001';
  enemy.isEnemy = true;
  const mine = mk(core, home, 'hull_cruiser', 'active', 'Mój');

  col.credits = 100000;
  const before = col.credits;
  vm._maintenanceAccum = 0; vm._tickVesselMaintenance(1.0);
  const charged = before - col.credits;
  const oneFull = HULLS.hull_cruiser?.upkeepCredits ?? 0;

  assert(near(charged, oneFull),
    `T6: obciążono dokładnie JEDEN rachunek — mój okręt (${charged} vs ${oneFull}); wrogi nie wchodzi na rachunek gracza`);
  assert((enemy.unpaidYears ?? 0) === 0, 'T6: wrogi kadłub nie zbiera zaległości u gracza');
  assert(vm.getTotalFleetUpkeep() === vm.getVesselUpkeepCredits(mine),
    'T6: suma utrzymania floty też pomija AI (odczyt zgodny z naliczaniem)');
}

console.log(`\n[w2_reserve_upkeep_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
