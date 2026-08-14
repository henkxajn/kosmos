// W2 — keeper szwów modelu rozmieszczenia (commit W2-0, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: audyt W2 (`docs/design/W2_PLAN.md`) OBALIŁ trzy przesłanki zakresu i wskazał dwie
// powierzchnie, bez których cały slice byłby kosmetyczny. Na tych twierdzeniach stoi kształt
// W2 — więc zanim padnie pierwsza linijka kodu produkcyjnego, dowodzimy ich WYKONANIEM na
// żywym boocie, nie odczytem źródła.
//
//   T1  C-1a: kolonijna stocznia AI BLOKUJE POP przy budowie okrętu wojennego
//   T2  C-1b: orbitalna stocznia GRACZA nie blokuje NICZEGO — te same kadłuby, zero POP
//   T3  C-2:  doktryna BIERZE zadokowany, uzbrojony okręt AI (dziś nie ma pojęcia „magazyn")
//   T4  C-3:  strata okrętu ZOSTAWIA blokadę załogi — dzisiejszy PRZECIEK, pinowany jako stan
//   T5  C-6:  `_buildPlayerBattleUnit` wciąga zadokowany kadłub gracza do bitwy
//   T6  S9:   spirala śmierci utrzymania — 6 krążowników, unieruchomione po GRACE latach
//
// ⚠ WSZYSTKIE SZEŚĆ TO PINY STANU SPRZED W2, NIE PINY POPRAWNOŚCI. Cztery z nich MAJĄ PAŚĆ
//    i zostać ŚWIADOMIE ODWRÓCONE w kolejnych commitach — to jest dowód fail-first, nie regresja:
//      T1 → W2-4 (budowa przestaje pobierać POP; koszt przenosi się na rozmieszczenie)
//      T2 → W2-4 (znika asymetria `StationSystem.js:331` — gracz PIERWSZY RAZ płaci POP)
//      T3 → W2-2 ROZSZERZONE, nie odwrócone (patrz niżej)
//      T5 → W2-2 ROZSZERZONE, nie odwrócone (patrz niżej)
//    T4 zostaje jako pin PRZECIEKU do W2-4, gdzie R-C zamienia go w jawne obciążenie.
//    T6 zostaje NIETKNIĘTY przez cały slice — to scenariusz regresyjny zgłoszony przez
//    właściciela (`W1_PLAN.md` §Results), a W2-5 dokłada do niego tylko stawkę rezerwy.
//    Wzór „pin luki z instrukcją, kiedy go odwrócić": `director_seams_smoke` T6.
//
// ⚠ KOREKTA PO W2-2: T3 i T5 przewidywano jako ODWRÓCENIA — i to była nieścisłość.
//    Oba pinują kadłuby stawiane RĘCZNIE (`createVessel`), a te mają `serviceState:'active'`
//    z domysłu, więc po W2-2 dalej (słusznie!) walczą i dalej kwalifikują się do doktryn.
//    Zmienia się co innego: kadłub w REZERWIE jest z obu pul wykluczony. Zamiast udawać
//    odwrócenie, oba testy zostały ROZSZERZONE o przypadek `serviceState:'stored'` —
//    stara asercja jest teraz KONTROLĄ PINU dla nowej.
//
// ⚠ Harness NIE montuje ani `stationSystem`, ani Directora (`GameCore` konstruuje 46 systemów,
//    żadnego z tych dwóch), więc obie powierzchnie stawiamy tu RĘCZNIE — wzór wpięcia stacji
//    z `s34_command_stations_smoke`, wpięcia doktryny z `war_doctrine_smoke`.

import '../headless/env.js';           // MUSI być pierwszy (window/document/THREE + seeded RNG)
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import EntityManager from '../../core/EntityManager.js';
import { createVessel } from '../../entities/Vessel.js';
import { HULLS } from '../../data/HullsData.js';
import { SHIPS } from '../../data/ShipsData.js';
import { Station } from '../../entities/Station.js';
import { StationSystem } from '../../systems/StationSystem.js';
import { makeStationModule } from '../../data/StationModuleData.js';
import { calcShipCost } from '../../data/ShipModulesData.js';
import { DirectorDoctrine } from '../../systems/director/DirectorDoctrine.js';
import { WarSystem } from '../../systems/WarSystem.js';
import { VesselManager } from '../../systems/VesselManager.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const WARSHIP = ['engine_ion', 'armor_standard', 'weapon_kinetic'];

// ⚠ Surowce MUSZĄ pokryć także TOWARY kadłuba i modułów. `startShipBuild` przy niedoborze
//    zwraca `ok: true`, ale wrzuca zlecenie do `pendingShipOrders` — a ta ścieżka NIE blokuje
//    załogi (lock siedzi dopiero przy realnym starcie budowy, `ColonyManager.js:924-926`).
//    Skąpy grant dałby więc zielone T1 mierzące nie to, co trzeba: „ok" bez blokady POP.
const GRANT = {
  Fe: 9000, Si: 9000, Cu: 9000, Ti: 9000, C: 9000, Al: 9000, Hv: 9000, Li: 9000,
  structural_alloys: 500, reactive_armor: 500, electronic_systems: 500,
  polymer_composites: 500, semiconductor_arrays: 500, propulsion_systems: 500,
  conductor_bundles: 500, metamaterials: 500, quantum_cores: 500, antimatter_cells: 500,
};

const boot = () => {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  return core;
};

/** Suma WSZYSTKICH zablokowanych POP kolonii — jedyny odczyt księgi załóg, jaki dziś istnieje
 *  (`_lockedPerStrata` nie ma odnośnika do statku; to właśnie jest defekt C-4/decyzja 7). */
const lockedSum = (colony) => {
  const bag = colony?.civSystem?._lockedPerStrata ?? {};
  let s = 0; for (const v of Object.values(bag)) s += Number(v) || 0;
  return s;
};

/** Nadaj kolonii stocznię + tech + surowce, żeby `startShipBuild` mógł w ogóle dojść do bramki
 *  załogowej. Wzór: `director_seams_smoke` T5. */
function equipYard(core, colony) {
  if (core.colonyManager._getShipyardLevel(colony) === 0) {
    colony.resourceSystem.receive({ ...GRANT });
    colony.buildingSystem.autoPlaceBuilding('shipyard');
    new Ticker(core.timeSystem).run(40, { tickSize: 1.0, stopOnCrash: true });
    colony._shipyardLevelDirty = true;
  }
  (colony.techSystem ?? core.colonyManager.techSystem)
    ?.grantTechs?.([HULLS.hull_frigate.requires].filter(Boolean));
  colony.resourceSystem.receive({ ...GRANT });
}

// ── T1 — C-1a: kolonijna stocznia AI BLOKUJE POP ────────────────────────────────────────────
console.log('T1 — C-1a: budowa okrętu wojennego na kolonii AI blokuje POP (dziś)');
{
  const core = boot();
  const cm = core.colonyManager;
  const ai = cm.getAllColonies().filter(c => c.ownerEmpireId && c.civSystem && c.resourceSystem);
  const crew = HULLS.hull_frigate.crewCost ?? 0;
  assert(crew > 0, `T1: hull_frigate ma niezerowy crewCost po redenominacji ×4 (${crew})`);

  const col = ai.find(c => (c.civSystem?.freePops ?? 0) >= crew) ?? ai[0] ?? null;
  assert(!!col, 'T1: jest kolonia AI z żywym civSystem');
  if (col) {
    equipYard(core, col);
    // Bramka POP jest TWARDA (odmowa, nie kolejka) — dolej wolnych POP, żeby zmierzyć LOCK,
    // a nie odmowę (odmowę pinuje `director_seams_smoke` T5).
    if ((col.civSystem.freePops ?? 0) < crew) col.civSystem._unemployed += Math.ceil(crew) + 2;

    const before = lockedSum(col);
    const res = cm.startShipBuild(col.planetId, 'hull_frigate', [...WARSHIP]);
    const after = lockedSum(col);

    assert(res?.ok === true, `T1: AI buduje fregatę w stoczni KOLONIJNEJ (ok=${res?.ok}, reason=${res?.reason ?? '—'})`);
    assert(res?.pending !== true && (col.shipQueues?.length ?? 0) > 0,
      'T1: budowa RUSZYŁA (kolejka stoczni), nie wylądowała w `pendingShipOrders` — ' +
      'tylko realny start zakłada blokadę załogi');
    assert(after > before,
      `T1: budowa ZABLOKOWAŁA POP — księga załóg urosła ${before.toFixed(3)} → ${after.toFixed(3)} ` +
      '(W2-4 MA to odwrócić: build = przemysł, koszt POP przenosi się na deploy)');
    assert(Math.abs((after - before) - crew) < 1e-6,
      `T1: zablokowano DOKŁADNIE crewCost kadłuba (${(after - before).toFixed(3)} vs ${crew})`);
  }
}

// ── T2 — C-1b: orbitalna stocznia GRACZA nie blokuje NICZEGO ────────────────────────────────
console.log('T2 — C-1b: budowa w stoczni ORBITALNEJ gracza nie kosztuje ani jednego POP (dziś)');
{
  const core = boot();
  const stSys = new StationSystem();
  window.KOSMOS.stationSystem = stSys;

  const home = core.colonyManager.getColony(window.KOSMOS.homePlanet?.id) ?? null;
  assert(!!home?.civSystem, 'T2: kolonia domowa gracza ma civSystem');

  const shipId = 'hull_frigate';
  const def = HULLS[shipId];
  // Bramka tech stoczni ORBITALNEJ czyta GLOBALNY techSystem gracza (`StationSystem.js:354`),
  // nie tech kolonii — inaczej niż kolonijna ścieżka AI w T1.
  window.KOSMOS.techSystem?.grantTechs?.([def.requires].filter(Boolean));
  // Koszt liczony TĄ SAMĄ funkcją, której używa stocznia (`calcShipCost`), ×3 z zapasem —
  // inaczej `insufficient_resources` przykryłoby to, co pin naprawdę mierzy (koszt POP).
  const { cost: rawCost, commodityCost } = calcShipCost(def, [...WARSHIP]);
  const bill = {};
  for (const [id, amt] of Object.entries({ ...rawCost, ...commodityCost })) bill[id] = amt * 3;
  // ⚠ `depot:` w konstruktorze jest tu BEZ ZNACZENIA. `StationDepot` stacji, która ma
  //    kolonię-matkę, DELEGUJE do magazynu tej kolonii (S3.4c „depot-jako-proxy"), więc
  //    zaopatrzenie stacji = zaopatrzenie MATKI. Zmierzone: depot.getAmount('Fe') zwracał
  //    dokładnie stan kolonii, ignorując wartość podaną w konstruktorze.
  home?.resourceSystem?.receive?.({ ...GRANT, ...bill });
  const station = new Station({
    id: 'station_w2_0', name: 'Stacja W2-0', bodyId: home?.planetId ?? 'home',
    systemId: 'sys_home', pop: 20,
    modules: [makeStationModule('power_fusion', 1), makeStationModule('shipyard', 1)],
  });
  EntityManager.add(station);
  stSys._recomputeModuleStates(station);
  assert(station.hasActiveShipyard === true, 'T2: stacja ma aktywną stocznię');

  const before = lockedSum(home);
  const q = stSys.queueStationShip(station.id, shipId, [...WARSHIP]);
  assert(q?.ok === true, `T2: queueStationShip przyjęte (ok=${q?.ok}, reason=${q?.reason ?? '—'})`);
  stSys._tick((def.buildTime ?? 1) + 0.01);
  const after = lockedSum(home);

  const built = core.vesselManager.getAllVessels().find(v => v.shipId === shipId);
  assert(!!built, 'T2: okręt wojenny gracza faktycznie powstał w stoczni orbitalnej');
  assert(Math.abs(after - before) < 1e-9,
    `T2: ZERO POP zablokowane (${before.toFixed(3)} → ${after.toFixed(3)}) — asymetria ` +
    'StationSystem.js:331; W2-4 MA to odwrócić (gracz zacznie płacić przy deploy)');
}

// ── T3 — C-2: doktryna bierze zadokowany, uzbrojony okręt AI ────────────────────────────────
console.log('T3 — C-2: pula doktryn NIE zna pojęcia „magazyn" (dziś bierze każdy zadokowany kadłub)');
{
  const core = boot();
  const doctrine = new DirectorDoctrine();
  window.KOSMOS.directorDoctrine = doctrine;

  const empireId = core.empireRegistry.listAll()[0]?.id;
  const cap = core.colonyManager.getAllColonies().find(c => c.ownerEmpireId === empireId) ?? null;
  window.KOSMOS.directorProduction = { capitalOf: () => cap };
  assert(!!cap, `T3: jest kolonia AI w roli stolicy (${cap?.planetId})`);

  if (cap) {
    const v = createVessel('hull_frigate', cap.planetId, {
      name: 'Kadłub w magazynie', modules: [...WARSHIP], x: 0, y: 0, systemId: 'sys_home',
    });
    v.ownerEmpireId = empireId; v.owner = empireId; v.isEnemy = true;
    v.position.state = 'orbiting'; v.position.dockedAt = cap.planetId;
    v.mission = null; v.movementOrder = null;
    core.vesselManager._vessels.set(v.id, v);

    assert(doctrine.countIdleArmedAtCapital(empireId) === 1,
      `T3: doktryna WIDZI świeżo zbudowany kadłub jako gotowy do służby ` +
      `(${doctrine.countIdleArmedAtCapital(empireId)}) — W2-2 MA to odwrócić`);

    // W2-2 — TEN SAM kadłub przełożony do REZERWY wypada z puli doktryn.
    v.serviceState = 'stored';
    assert(doctrine.countIdleArmedAtCapital(empireId) === 0,
      'T3/W2-2: kadłub w REZERWIE NIE kwalifikuje się do doktryny (nie patroluje)');
    v.serviceState = 'mobilizing';
    assert(doctrine.countIdleArmedAtCapital(empireId) === 0,
      'T3/W2-2: kadłub W TRAKCIE MOBILIZACJI też nie — służbą jest dopiero `active`');
    v.serviceState = 'active';
    assert(doctrine.countIdleArmedAtCapital(empireId) === 1,
      'T3/W2-2: powrót do służby przywraca kwalifikację (filtr jest odwracalny, nie jednokierunkowy)');

    // KONTROLA PINU: bez uzbrojenia pula jest pusta ⇒ pin mierzy pulę doktryn,
    // a nie samą obecność statku w rejestrze.
    v.modules = ['engine_ion', 'armor_standard'];
    assert(doctrine.countIdleArmedAtCapital(empireId) === 0,
      'T3: KONTROLA PINU — bez modułu broni kadłub wypada z puli (pin mierzy pulę, nie rejestr)');
  }
}

// ── T4 — C-3: strata okrętu zostawia blokadę załogi (PRZECIEK) ──────────────────────────────
console.log('T4 — C-3: zniszczenie okrętu NIE zwalnia i NIE zabija załogi — dzisiejszy przeciek');
{
  const core = boot();
  const cm = core.colonyManager;
  const crew = HULLS.hull_frigate.crewCost ?? 0;
  const col = cm.getAllColonies().find(c => c.ownerEmpireId && c.civSystem && c.resourceSystem) ?? null;
  assert(!!col, 'T4: jest kolonia AI z żywym civSystem');

  if (col) {
    equipYard(core, col);
    if ((col.civSystem.freePops ?? 0) < crew) col.civSystem._unemployed += Math.ceil(crew) + 2;
    const res = cm.startShipBuild(col.planetId, 'hull_frigate', [...WARSHIP]);
    assert(res?.ok === true, 'T4: fregata zamówiona (blokada załogi założona)');

    const lockedAfterBuild = lockedSum(col);

    // Doprowadź budowę do końca, potem zniszcz kadłub — dokładnie tak, jak robi to walka.
    new Ticker(core.timeSystem).run(200, { tickSize: 1.0, stopOnCrash: true });
    const hull = core.vesselManager.getAllVessels().find(v => v.shipId === 'hull_frigate');
    assert(!!hull, 'T4: fregata zeszła ze stoczni');
    if (hull) {
      // ⚠ Populację próbkujemy TUŻ PRZED stratą, nie przed tickerem: przez 200 civY kolonia
      //    rośnie, więc porównanie sprzed budowy mierzyłoby wzrost, a nie skutek zniszczenia.
      const popBeforeLoss = col.civSystem.population;
      core.vesselManager.destroyVessel(hull.id);
      const lockedAfterLoss = lockedSum(col);
      assert(Math.abs(lockedAfterLoss - lockedAfterBuild) < 1e-9,
        `T4: blokada załogi PRZEŻYŁA zniszczenie okrętu (${lockedAfterBuild.toFixed(3)} → ` +
        `${lockedAfterLoss.toFixed(3)}) — POP jest na zawsze niedostępny, a populacja bez zmian`);
      assert(col.civSystem.population === popBeforeLoss,
        'T4: populacja NIE spadła — dziś załoga nie ginie, tylko znika z rynku pracy (R-C to zmienia)');
    }
  }
}

// ── T5 — C-6: jednostka bitwy gracza wciąga zadokowany kadłub ───────────────────────────────
console.log('T5 — C-6: `_buildPlayerBattleUnit` nie filtruje stanu — zadokowany kadłub walczy');
{
  const core = boot();
  const war = new WarSystem();

  const home = window.KOSMOS.homePlanet?.id ?? null;
  const sysId = EntityManager.get(home)?.systemId ?? 'sys_home';

  const before = war._buildPlayerBattleUnit(sysId);
  const hpBefore = before?.hp ?? 0;

  const v = createVessel('hull_frigate', home, {
    name: 'Kadłub zadokowany', modules: [...WARSHIP], x: 0, y: 0, systemId: sysId,
  });
  v.position.state = 'docked'; v.position.dockedAt = home;
  core.vesselManager._vessels.set(v.id, v);

  const after = war._buildPlayerBattleUnit(sysId);
  assert((after?.hp ?? 0) > hpBefore,
    `T5: ZADOKOWANY kadłub podniósł siłę obrony gracza (${hpBefore} → ${after?.hp ?? 0}) — ` +
    'W2-2 MA to odwrócić, inaczej magazyn nic nie kosztuje i cały slice jest kosmetyczny');

  // W2-2 — TEN SAM kadłub w REZERWIE nie wzmacnia obrony układu.
  v.serviceState = 'stored';
  const stored = war._buildPlayerBattleUnit(sysId);
  assert((stored?.hp ?? 0) === hpBefore,
    `T5/W2-2: kadłub w REZERWIE NIE broni układu (${stored?.hp ?? 0} = stan bez niego ${hpBefore})`);
  v.serviceState = 'active';

  // KONTROLA PINU: wrak w tym samym stanie NIE liczy się ⇒ pin mierzy filtr, nie samą sumę.
  v.isWreck = true;
  const wrecked = war._buildPlayerBattleUnit(sysId);
  assert((wrecked?.hp ?? 0) === hpBefore,
    'T5: KONTROLA PINU — ten sam kadłub jako WRAK już nie liczy się do obrony (filtr działa, brakuje tylko stanu służby)');
}

// ── T6 — S9: spirala śmierci utrzymania floty ───────────────────────────────────────────────
console.log('T6 — S9: spirala utrzymania — nieopłacona flota unieruchamia się po GRACE latach');
{
  const core = boot();
  const vMgr = core.vesselManager;
  const home = window.KOSMOS.homePlanet?.id ?? null;
  const col = core.colonyManager.getColony(home);
  assert(!!col, 'T6: jest kolonia domowa gracza');

  const upkeep = HULLS.hull_cruiser?.upkeepCredits ?? 0;
  assert(upkeep > 0, `T6: hull_cruiser ma dodatnie upkeepCredits (${upkeep} Kr/rok gry)`);

  const fleet = [];
  for (let i = 0; i < 6; i++) {
    const v = createVessel('hull_cruiser', home, {
      name: `Krążownik ${i + 1}`, modules: [...WARSHIP], x: 0, y: 0, systemId: 'sys_home',
    });
    v.position.state = 'docked'; v.position.dockedAt = home;
    v.homeColonyId = home;
    vMgr._vessels.set(v.id, v);
    fleet.push(v);
  }
  // Kolonia stać ma na ułamek rocznego rachunku — 6 × upkeep to wielokrotność jej kredytów.
  col.credits = Math.floor(upkeep / 2);
  assert(vMgr.getTotalFleetUpkeep() >= 6 * upkeep,
    `T6: roczne utrzymanie floty ${vMgr.getTotalFleetUpkeep()} Kr >> kredyty kolonii (${col.credits} Kr)`);

  const CIV_PER_GAME_YEAR = 12;                         // CIV_TIME_SCALE
  const grace = VesselManager.UPKEEP_GRACE_YEARS;       // 2 LATA GRY
  new Ticker(core.timeSystem).run(CIV_PER_GAME_YEAR * (grace + 1), { tickSize: 1.0, stopOnCrash: true });

  const unpaid = fleet.map(v => v.unpaidYears ?? 0);
  const immobilized = fleet.filter(v => vMgr.isImmobilized(v)).length;
  assert(Math.max(...unpaid) >= grace,
    `T6: zaległości narosły do progu unieruchomienia (max unpaidYears=${Math.max(...unpaid)} ≥ ${grace})`);
  assert(immobilized > 0,
    `T6: flota UNIERUCHOMIONA po ${grace} latach gry bez opłaty (${immobilized}/6) — ` +
    'to jest zgłoszony scenariusz regresyjny właściciela, W2-5 dokłada do niego stawkę rezerwy');
}

console.log(`\n[deploy_seams_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
