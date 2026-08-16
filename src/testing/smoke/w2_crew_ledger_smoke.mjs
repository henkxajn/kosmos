// W2 — keeper księgi załóg (commit W2-4, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: W2-4 przenosi koszt załogi z BUDOWY na ROZMIESZCZENIE i pierwszy raz w historii gry
// każe GRACZOWI zapłacić POP za okręt. Ryzyko nie leży w samym przeniesieniu — leży w tym, że
// księga POPów kolonii (`_lockedPerStrata`) jest ANONIMOWYM WORKIEM dzielonym z jednostkami
// naziemnymi, a `removePop` jest ułamkowo-ślepy i zaokrągla W GÓRĘ. Każda z tych trzech rzeczy
// osobno potrafi po cichu ukraść populację, której nikt nie zauważy przez 200 lat gry.
//
//   T1  budowa NIE kosztuje POP — u obu właścicieli (odwrócenie C-1)
//   T2  rozmieszczenie pobiera DOKŁADNIE `crewCost`, obie księgi się zgadzają
//   T3  UŁAMEK: załoga 0.4 zabiera 0.4 człowieka, nie całego (pułapka `removePop`)
//   T4  wycofanie oddaje DOKŁADNIE to, co wzięło — i to tej samej warstwie
//   T5  rozbiórka liczy z KSIĘGI STATKU, nie z definicji kadłuba (zamknięcie C-4)
//   T6  brak podwójnego naliczenia (idempotencja + obie kolejności z `MissionSystem`)
//   T7  ZEGAR: 1.0 civYear = 1 WYŚWIETLANY MIESIĄC — pinowane WYKONANIEM, nie odczytem stałej
//   T8  decyzja 18: bezrobotni najpierw, potem EKSMISJA — deploy działa przy `freePops ≈ 0`
//   T9  inwarianty populacji przeżywają ułamkową śmierć załogi
//   T10 płatnikiem jest `crewColonyId`, nie „gdziekolwiek wskazuje colonyId"
//   T11 rezerwa nie tankuje i nie remontuje się (domknięcie zbioru wykluczeń W2-2)
//   T12 round-trip zapisu: obie nowe kolumny księgi przeżywają serialize → restore
//
// ⚠ „Nie do zaspokojenia przez sąsiada": ŻADNA asercja tego pliku nie może być zielona dzięki
//    `isImmobilized` ani dzięki temu, że kadłub ma zerowy `crewCost` — stąd kontrole pinu przy
//    T1 i T3, które najpierw dowodzą, że mierzona wielkość jest niezerowa.
//
// ⚠ Harness NIE montuje `stationSystem` ani Directora (`GameCore` konstruuje 46 systemów, żadnego
//    z tych dwóch), więc stronę gracza stawiamy ręcznie — wzór z `deploy_seams_smoke` T2.

import '../headless/env.js';           // MUSI być pierwszy (window/document/THREE + seeded RNG)
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { createVessel } from '../../entities/Vessel.js';
import { HULLS } from '../../data/HullsData.js';
import { Station } from '../../entities/Station.js';
import { StationSystem } from '../../systems/StationSystem.js';
import { makeStationModule } from '../../data/StationModuleData.js';
import { calcShipCost } from '../../data/ShipModulesData.js';
import { VesselManager } from '../../systems/VesselManager.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { BASE_WAGE } from '../../data/PopulationData.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const WARSHIP = ['engine_ion', 'armor_standard', 'weapon_kinetic'];
const GRANT = {
  Fe: 9000, Si: 9000, Cu: 9000, Ti: 9000, C: 9000, Al: 9000, Hv: 9000, Li: 9000,
  structural_alloys: 500, reactive_armor: 500, electronic_systems: 500,
  polymer_composites: 500, semiconductor_arrays: 500, propulsion_systems: 500,
  conductor_bundles: 500, metamaterials: 500, quantum_cores: 500, antimatter_cells: 500,
};
const boot = () => { const c = new GameCore(); c.boot({ quiet: true, scenario: 'civilization' }); return c; };

/** Suma WSZYSTKICH zablokowanych POP kolonii — księga po stronie KOLONII. */
const lockedSum = (colony) => {
  const bag = colony?.civSystem?._lockedPerStrata ?? {};
  let s = 0; for (const v of Object.values(bag)) s += Number(v) || 0;
  return s;
};

/** Kolonia AI z żywym civSystem — najwygodniejszy stand do mierzenia księgi. */
const anyAiColony = (core) =>
  core.colonyManager.getAllColonies().find(c => c.ownerEmpireId && c.civSystem && c.resourceSystem) ?? null;

/** Kadłub postawiony wprost w rejestrze, w REZERWIE, zadokowany przy danej kolonii.
 *  Omija stocznię — mierzymy księgę załóg, nie ścieżkę produkcji (tę pinuje `deploy_seams`). */
function stubStored(core, colony, shipId = 'hull_frigate') {
  const v = createVessel(shipId, colony.planetId, {
    name: `Kadłub ${shipId}`, modules: [...WARSHIP], x: 0, y: 0,
    systemId: 'sys_home', serviceState: 'stored',
  });
  v.position.state = 'docked';
  v.position.dockedAt = colony.planetId;
  v.homeColonyId = colony.planetId;
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

// ── T1 — budowa nie kosztuje POP u ŻADNEGO właściciela ──────────────────────────────────────
console.log('T1 — budowa to PRZEMYSŁ: zero POP u obu właścicieli');
{
  const core = boot();
  const cm = core.colonyManager;
  const crew = HULLS.hull_frigate.crewCost ?? 0;
  assert(crew > 0, `T1 KONTROLA PINU: hull_frigate ma niezerowy crewCost (${crew}) — zero niżej mierzy BRAMKĘ, nie dane`);

  const col = anyAiColony(core);
  assert(!!col, 'T1: jest kolonia AI z żywym civSystem');
  if (col) {
    // Stocznia + tech + surowce, żeby `startShipBuild` doszedł do końca ścieżki.
    if (cm._getShipyardLevel(col) === 0) {
      col.resourceSystem.receive({ ...GRANT });
      col.buildingSystem.autoPlaceBuilding('shipyard');
      new Ticker(core.timeSystem).run(40, { tickSize: 1.0, stopOnCrash: true });
      col._shipyardLevelDirty = true;
    }
    (col.techSystem ?? cm.techSystem)?.grantTechs?.([HULLS.hull_frigate.requires].filter(Boolean));
    col.resourceSystem.receive({ ...GRANT });

    const before = lockedSum(col);
    const res = cm.startShipBuild(col.planetId, 'hull_frigate', [...WARSHIP]);
    assert(res?.ok === true, `T1a: kolonia AI buduje (ok=${res?.ok}, reason=${res?.reason ?? '—'})`);
    assert(near(lockedSum(col), before), `T1a: ZERO POP zablokowane przy budowie AI (${before.toFixed(3)} → ${lockedSum(col).toFixed(3)})`);

    // Ścieżka „brak surowców" → `pendingShipOrders` → promocja. TAM siedziała trzecia bramka
    // załogowa (miękka: `continue` bez eventu), czyli dokładnie ta, którą gracz trafia przy
    // niedoborze. Osobny boot, bo slot stoczni jest tu zajęty przez build powyżej.
    const core2 = boot();
    const cm2 = core2.colonyManager;
    const col2 = anyAiColony(core2);
    if (col2) {
      if (cm2._getShipyardLevel(col2) === 0) {
        col2.resourceSystem.receive({ ...GRANT });
        col2.buildingSystem.autoPlaceBuilding('shipyard');
        new Ticker(core2.timeSystem).run(40, { tickSize: 1.0, stopOnCrash: true });
        col2._shipyardLevelDirty = true;
      }
      (col2.techSystem ?? cm2.techSystem)?.grantTechs?.([HULLS.hull_frigate.requires].filter(Boolean));
      col2.resourceSystem.spend({ ...col2.resourceSystem.inventory });    // zagłodź magazyn
      const lockedBefore2 = lockedSum(col2);
      const res2 = cm2.startShipBuild(col2.planetId, 'hull_frigate', [...WARSHIP]);
      assert(res2?.ok === true && res2?.queued === true,
        `T1b: przy braku surowców zlecenie ląduje w kolejce (ok=${res2?.ok}, queued=${res2?.queued}, reason=${res2?.reason ?? '—'})`);
      const order = (col2.pendingShipOrders ?? [])[0];
      assert(!!order, 'T1b KONTROLA: zlecenie faktycznie jest w `pendingShipOrders`');
      assert(order && order.crewCost === undefined,
        `T1b: zlecenie NIE niesie już pola crewCost (jest ${order?.crewCost}) — umarło razem z bramką`);

      // Promocja zlecenia przy zerowych wolnych POPach — dawna bramka trzymałaby je w nieskończoność.
      const civ2 = col2.civSystem;
      const free2 = civ2.freePops ?? 0;
      if (free2 > 0) civ2.lockPops(free2, 'mix');
      col2.resourceSystem.receive({ ...GRANT });
      cm2._tickPendingShipOrders();
      assert((col2.pendingShipOrders?.length ?? 0) === 0 && (col2.shipQueues?.length ?? 0) > 0,
        'T1b: zlecenie PROMOWANE mimo freePops≈0 — trzecia bramka naprawdę zniknęła');
      assert(near(lockedSum(col2), lockedBefore2 + Math.max(0, free2)),
        'T1b: promocja nie zablokowała ŻADNEGO dodatkowego POPa (poza naszym sztucznym lockiem)');
    }
  }
}

// ── T2 — rozmieszczenie pobiera dokładnie crewCost ──────────────────────────────────────────
console.log('T2 — rozmieszczenie pobiera DOKŁADNIE crewCost; obie księgi się zgadzają');
{
  const core = boot();
  const col = anyAiColony(core);
  const crew = HULLS.hull_frigate.crewCost ?? 0;
  if (col) {
    const v = stubStored(core, col);
    const before = lockedSum(col);
    const humansBefore = col.civSystem.humans;

    const res = core.vesselManager.deployVessel(v.id);
    assert(res?.ok === true, `T2: deploy przyjęty (ok=${res?.ok}, reason=${res?.reason ?? '—'})`);
    assert(near(lockedSum(col) - before, crew),
      `T2: księga KOLONII urosła o crewCost (${(lockedSum(col) - before).toFixed(3)} vs ${crew})`);
    assert(near(v.crewLocked ?? 0, crew), `T2: księga STATKU = crewCost (${v.crewLocked})`);
    assert(near(Object.values(v.crewStrataLocked ?? {}).reduce((s, n) => s + n, 0), crew),
      'T2: rozkład po warstwach sumuje się do crewCost (obie księgi zgodne co do grosza)');
    assert(near(col.civSystem.humans, humansBefore),
      'T2: NIKT nie zginął — rozmieszczenie zdejmuje z rynku pracy, nie z populacji');
    assert(v.serviceState === 'mobilizing' && v.mobilizeTarget === 'active',
      `T2: stan przejściowy z KIERUNKIEM (${v.serviceState} → ${v.mobilizeTarget})`);
    assert(core.vesselManager.deployVessel(v.id)?.reason === 'already_mobilizing',
      'T2: powtórny rozkaz odrzucony — nie da się zapłacić dwa razy za ten sam kadłub');
  }
}

// ── T3 — UŁAMEK: 0.4 zabiera 0.4, nie całego człowieka ──────────────────────────────────────
console.log('T3 — śmierć załogi jest UŁAMKOWA (pułapka `removePop`: pętla robi ceil, nie floor)');
{
  const core = boot();
  const col = anyAiColony(core);
  const crew = HULLS.hull_frigate.crewCost ?? 0;
  assert(crew > 0 && crew < 1,
    `T3 KONTROLA PINU: crewCost fregaty jest UŁAMKOWY (${crew}) — inaczej test nie mierzyłby ułamka`);
  if (col) {
    const v = stubStored(core, col);
    core.vesselManager.deployVessel(v.id);
    const humansBefore = col.civSystem.humans;
    const popBefore = col.civSystem.population;

    EventBus.emit('vessel:wrecked', { vesselId: v.id, vessel: v });

    const drop = humansBefore - col.civSystem.humans;
    assert(near(drop, crew), `T3: humans spadło o DOKŁADNIE ${crew} (jest ${drop.toFixed(4)})`);
    assert(drop < 1.0, 'T3: mniej niż CAŁY człowiek — surowy `removePop(null, 0.4)` zabiłby jednego (2.5× za dużo)');
    assert(popBefore - col.civSystem.population <= 1,
      'T3: licznik całkowitych ludzi spadł najwyżej o 1 (ułamek nie mnoży ofiar)');
  }
}

// ── T4 — wycofanie oddaje dokładnie to, co wzięło ───────────────────────────────────────────
console.log('T4 — wycofanie oddaje DOKŁADNIE to, co wzięło (i tej samej warstwie)');
{
  const core = boot();
  const col = anyAiColony(core);
  if (col) {
    const before = lockedSum(col);
    const bagBefore = { ...(col.civSystem._lockedPerStrata ?? {}) };
    const v = stubStored(core, col);
    core.vesselManager.deployVessel(v.id);
    const civDy = 1.0;
    core.vesselManager._tickMobilization(civDy);                       // domknij mobilizację
    assert(v.serviceState === 'active', `T4: po pełnym miesiącu kadłub jest W SŁUŻBIE (${v.serviceState})`);

    const humansBefore = col.civSystem.humans;
    const w = core.vesselManager.withdrawVessel(v.id);
    assert(w?.ok === true, `T4: wycofanie przyjęte (ok=${w?.ok}, reason=${w?.reason ?? '—'})`);
    assert(!near(lockedSum(col), before),
      'T4 KONTROLA: POP jeszcze NIE wrócił w chwili rozkazu — decyzja 19 („wraca przy ukończeniu")');

    core.vesselManager._tickMobilization(civDy);
    assert(v.serviceState === 'stored', `T4: kadłub odstawiony do rezerwy (${v.serviceState})`);
    assert(near(lockedSum(col), before),
      `T4: księga kolonii wróciła do stanu sprzed rozmieszczenia (${before.toFixed(3)} vs ${lockedSum(col).toFixed(3)})`);
    for (const [type, amt] of Object.entries(col.civSystem._lockedPerStrata ?? {})) {
      if ((bagBefore[type] ?? 0) === 0 && amt > 1e-9) {
        assert(false, `T4: warstwa ${type} została z resztką blokady ${amt} — zwolnienie nie było typowane`);
      }
    }
    assert(near(col.civSystem.humans, humansBefore), 'T4: NIKT nie zginął przy wycofaniu — ludzie wracają żywi');
    assert((v.crewLocked ?? 0) === 0, 'T4: księga statku wyzerowana po zwrocie');
  }
}

// ── T5 — rozbiórka liczy z księgi statku, nie z definicji kadłuba ───────────────────────────
console.log('T5 — rozbiórka liczy z KSIĘGI STATKU (zamknięcie C-4: koniec drukowania POP z definicji)');
{
  const core = boot();
  const col = anyAiColony(core);
  const crew = HULLS.hull_frigate.crewCost ?? 0;
  if (col) {
    // (a) kadłub NIGDY nierozmieszczony (crewLocked = 0, ale shipDef.crewCost = 0.4).
    const never = stubStored(core, col);
    const before = lockedSum(col);
    const humansBefore = col.civSystem.humans;
    core.vesselManager.destroyVessel(never.id);
    assert(near(lockedSum(col), before),
      `T5a: rozbiórka kadłuba BEZ załogi nie zwolniła NIC (${before.toFixed(3)} vs ${lockedSum(col).toFixed(3)}) — ` +
      `stara ścieżka oddałaby ${crew} POP wziętych z blokad INNYCH statków`);
    assert(near(col.civSystem.humans, humansBefore), 'T5a: populacja bez zmian');

    // (b) kadłub rozmieszczony — rozbiórka oddaje DOKŁADNIE jego załogę, nikt nie ginie.
    const armed = stubStored(core, col);
    core.vesselManager.deployVessel(armed.id);
    const afterDeploy = lockedSum(col);
    const humansB = col.civSystem.humans;
    core.vesselManager.destroyVessel(armed.id);
    assert(near(afterDeploy - lockedSum(col), crew),
      `T5b: rozbiórka rozmieszczonego oddaje jego crewLocked (${(afterDeploy - lockedSum(col)).toFixed(3)} vs ${crew})`);
    assert(near(col.civSystem.humans, humansB),
      'T5b: rozbiórka to NIE strata bojowa — załoga schodzi na ląd żywa (R-C dotyczy przemocy)');
  }
}

// ── T6 — brak podwójnego naliczenia ─────────────────────────────────────────────────────────
console.log('T6 — podwójny strzał w tę samą księgę jest NO-OPEM (obie kolejności z MissionSystem)');
{
  const core = boot();
  const col = anyAiColony(core);
  if (col) {
    // (a) wrak → sprzątanie przez destroyVessel (kolejność „załoga przed kadłubem")
    const v1 = stubStored(core, col);
    core.vesselManager.deployVessel(v1.id);
    const locked = lockedSum(col);
    EventBus.emit('vessel:wrecked', { vesselId: v1.id, vessel: v1 });
    const afterWreck = lockedSum(col);
    const humansAfterWreck = col.civSystem.humans;
    core.vesselManager.destroyVessel(v1.id);
    assert(near(lockedSum(col), afterWreck) && near(col.civSystem.humans, humansAfterWreck),
      'T6a: `destroyVessel` po `vessel:wrecked` nie rusza już niczego (wrak sprzątany później)');
    assert(afterWreck < locked, 'T6a KONTROLA: pierwszy strzał NAPRAWDĘ coś zdjął (pin nie jest pusty)');

    // (b) kadłub zniszczony PRZED rozliczeniem (kolejność „kadłub przed załogą", MissionSystem:1817):
    //     obiekt statku już nie żyje w rejestrze, ale księga została rozliczona przy destroy.
    const v2 = stubStored(core, col);
    core.vesselManager.deployVessel(v2.id);
    const beforeDestroy = lockedSum(col);
    core.vesselManager.destroyVessel(v2.id);
    const afterDestroy = lockedSum(col);
    assert(core.vesselManager.getVessel(v2.id) == null, 'T6b: kadłub zniknął z rejestru');
    EventBus.emit('vessel:wrecked', { vesselId: v2.id, vessel: v2 });
    assert(near(lockedSum(col), afterDestroy),
      'T6b: spóźnione `vessel:wrecked` na nieistniejący kadłub nie nalicza drugi raz');
    assert(beforeDestroy > afterDestroy, 'T6b KONTROLA: `destroyVessel` faktycznie rozliczył księgę');
  }
}

// ── T7 — ZEGAR pinowany wykonaniem ──────────────────────────────────────────────────────────
console.log('T7 — 1.0 civYear = 1 WYŚWIETLANY MIESIĄC (mierzone, nie odczytane ze stałej)');
{
  const core = boot();
  const col = anyAiColony(core);
  const CIV  = GAME_CONFIG.CIV_TIME_SCALE;
  const STEP = 1 / CIV;                          // krok w latach WYŚWIETLANYCH
  assert(CIV === 12, `T7: CIV_TIME_SCALE = 12 (jest ${CIV}) — na tym stoi zamiana „miesiąc ↔ civYear"`);
  if (col) {
    const v = stubStored(core, col);
    core.vesselManager.deployVessel(v.id);
    // Krok po kroku ZEGAREM WYŚWIETLANYM: każdy krok to 1/12 roku = 1 miesiąc = 1.0 civYear.
    // `_tick` przyjmuje civDeltaYears jako PIERWSZY parametr, więc podajemy STEP × CIV.
    let steps = 0;
    while (v.serviceState === 'mobilizing' && steps < 1000) {
      core.vesselManager._tickMobilization(STEP * CIV);
      steps++;
    }
    assert(v.serviceState === 'active', `T7: mobilizacja się KOŃCZY (stan ${v.serviceState})`);
    assert(steps === 1,
      `T7: dokładnie JEDEN krok miesięczny (${steps}) ⇒ ${(steps * STEP).toFixed(4)} roku wyświetlanego = 1 miesiąc`);

    // Kontrola pinu w drugą stronę: pół miesiąca NIE kończy mobilizacji (gdyby stała była
    // czytana z zegara GRY, pół kroku wystarczyłoby albo nie skończyłoby się nigdy).
    const v2 = stubStored(core, col);
    core.vesselManager.deployVessel(v2.id);
    core.vesselManager._tickMobilization(STEP * CIV * 0.5);
    assert(v2.serviceState === 'mobilizing',
      'T7 KONTROLA PINU: pół miesiąca NIE wystarcza — próg jest realny, nie zerowy');
    core.vesselManager._tickMobilization(STEP * CIV * 0.5);
    assert(v2.serviceState === 'active', 'T7: druga połowa miesiąca domyka przejście (akumulator, nie próg jednorazowy)');

    // ⚠ T7c — NAJWAŻNIEJSZA połowa pinu: powyżej wołaliśmy `_tickMobilization` WPROST, więc
    //    zły zegar w MIEJSCU WYWOŁANIA (`_tick` dostaje oba i podaje je pod nazwami zamienionymi
    //    względem intuicji) przeszedłby niezauważony. Tu jedziemy PRAWDZIWYM łańcuchem
    //    `time:tick` → `VesselManager._tick` → `_tickMobilization` i mierzymy ZEGAREM GRACZA.
    //    Gdyby ktoś skopiował linię `_tickVesselMaintenance(physDeltaYears)`, mobilizacja
    //    trwałaby 12 razy dłużej i ten pin by to złapał.
    const v3 = stubStored(core, col);
    core.vesselManager.deployVessel(v3.id);
    const yearStart = core.timeSystem.gameTime ?? 0;
    new Ticker(core.timeSystem).run(1.0, { tickSize: 0.25, stopOnCrash: true });   // 1 civYear w 4 krokach
    const elapsedDisplayed = (core.timeSystem.gameTime ?? 0) - yearStart;
    assert(v3.serviceState === 'active',
      `T7c: mobilizacja zakończona po PRAWDZIWYM tiku (stan ${v3.serviceState})`);
    assert(Math.abs(elapsedDisplayed - STEP) < 1e-3,
      `T7c: upłynęło ${elapsedDisplayed.toFixed(4)} roku WYŚWIETLANEGO ≈ ${STEP.toFixed(4)} = 1 miesiąc — ` +
      'timer jedzie na zegarze CYWILIZACYJNYM, nie na zegarze gry (różnica byłaby ×12)');
  }
}

// ── T8 — decyzja 18: bezrobotni najpierw, potem eksmisja ────────────────────────────────────
console.log('T8 — decyzja 18: bezrobotni pierwsi, potem EKSMISJA z najtańszej warstwy');
{
  const core = boot();
  const col = anyAiColony(core);
  if (col) {
    const civ = col.civSystem;
    // (a) są bezrobotni ⇒ załoga idzie z puli, nikt nie traci pracy.
    civ._unemployed += 5;
    const employedBefore = civ.employed;
    const v = stubStored(core, col);
    core.vesselManager.deployVessel(v.id);
    assert(civ.employed >= employedBefore,
      `T8a: przy wolnej puli nikt nie został wyrwany od pracy (zatrudnieni ${employedBefore} → ${civ.employed})`);

    // (b) `freePops ≈ 0` — projektowa równowaga AI. Deploy MUSI zadziałać mimo to (inaczej
    //     AI nigdy by nie zmobilizowało floty), płacąc eksmisją.
    const free = civ.freePops ?? 0;
    if (free > 0) civ.lockPops(free, 'mix');
    assert((civ.freePops ?? 0) < (HULLS.hull_frigate.crewCost ?? 0),
      `T8b KONTROLA: kolonia realnie na zerze wolnych POPów (freePops=${(civ.freePops ?? 0).toFixed(3)})`);
    const v2 = stubStored(core, col);
    const res = core.vesselManager.deployVessel(v2.id);
    assert(res?.ok === true,
      `T8b: rozmieszczenie DZIAŁA przy freePops≈0 (ok=${res?.ok}, reason=${res?.reason ?? '—'}) — mobilizacja ściąga ludzi z hali`);
    const cheapest = [...Object.keys(BASE_WAGE)].sort((a, b) => BASE_WAGE[a] - BASE_WAGE[b])[0];
    assert(Object.keys(v2.crewStrataLocked ?? {})[0] === cheapest,
      `T8b: eksmisja zaczyna od NAJTAŃSZEJ warstwy (${Object.keys(v2.crewStrataLocked ?? {})[0]} vs ${cheapest})`);
  }
}

// ── T9 — inwarianty populacji przeżywają ułamkową śmierć ────────────────────────────────────
console.log('T9 — inwarianty populacji trzymają po ułamkowej śmierci załogi');
{
  const core = boot();
  const col = anyAiColony(core);
  if (col) {
    const civ = col.civSystem;
    const ships = [];
    for (let i = 0; i < 5; i++) {
      const v = stubStored(core, col);
      core.vesselManager.deployVessel(v.id);
      ships.push(v);
    }
    for (const v of ships) EventBus.emit('vessel:wrecked', { vesselId: v.id, vessel: v });

    const sigma = Object.values(civ.strata).reduce((s, x) => s + x.count, 0);
    assert(civ.unemployed === civ.population - sigma,
      `T9: floor(humans) = Σ strata + bezrobotni (${civ.population} − ${sigma} = ${civ.population - sigma} vs ${civ.unemployed})`);
    assert(civ._growthProgress >= 0 && civ._growthProgress < 1,
      `T9: nośnik ułamka trzyma się w [0,1) (${civ._growthProgress.toFixed(4)}) — inaczej floor(humans) rozjeżdża się z populacją`);
    let bad = null;
    for (const [type, lock] of Object.entries(civ._lockedPerStrata ?? {})) {
      if ((lock ?? 0) > (civ.strata[type]?.count ?? 0) + 1e-9) bad = `${type}: lock ${lock} > count ${civ.strata[type]?.count}`;
    }
    assert(bad === null, `T9: locked ⊆ employed — żadna warstwa nie ma blokady większej niż ludzi (${bad ?? 'ok'})`);
  }
}

// ── T10 — płatnikiem jest crewColonyId ──────────────────────────────────────────────────────
console.log('T10 — POP wraca do kolonii, która go DAŁA (nie tam, gdzie wskazuje colonyId)');
{
  const core = boot();
  const cm = core.colonyManager;
  const payer = anyAiColony(core);
  const other = cm.getAllColonies().find(c => c !== payer && c.civSystem) ?? null;
  if (payer && other) {
    const v = stubStored(core, payer);
    core.vesselManager.deployVessel(v.id);
    assert(v.crewColonyId === payer.planetId, `T10: płatnik zapamiętany (${v.crewColonyId})`);

    // Symulacja przepięcia z `_onColonyDestroyed`: OBA pola własności lądują na innej kolonii.
    v.colonyId = other.planetId;
    v.homeColonyId = other.planetId;
    const payerBefore = lockedSum(payer);
    const otherBefore = lockedSum(other);
    core.vesselManager.destroyVessel(v.id);
    assert(lockedSum(payer) < payerBefore,
      'T10: zwrot poszedł do PŁATNIKA mimo przepiętego colonyId/homeColonyId');
    assert(near(lockedSum(other), otherBefore),
      'T10: obca kolonia NIE dostała POP z powietrza (koniec ścieżki „wrogi kadłub drukuje POP gracza")');
  } else {
    assert(!!payer, 'T10: fixture — potrzebne dwie kolonie z civSystem (pomijalne na tym boocie)');
  }
}

// ── T11 — rezerwa nie tankuje i nie remontuje się ───────────────────────────────────────────
console.log('T11 — rezerwa nie tankuje i nie remontuje się (domknięcie zbioru wykluczeń W2-2)');
{
  const core = boot();
  const cm = core.colonyManager;
  // ⚠ Kolonia AI, NIE macierzysta gracza: na tym boocie home NIE MA stoczni
  //    (`_getShipyardLevel = 0`), więc naprawa nigdy by nie ruszyła i kontrola pinu byłaby
  //    zielona z niewłaściwego powodu. Fixture musi realnie umieć naprawiać.
  const port = anyAiColony(core);
  if (port) {
    if (cm._getShipyardLevel(port) === 0) {
      port.resourceSystem.receive({ ...GRANT });
      port.buildingSystem.autoPlaceBuilding('shipyard');
      new Ticker(core.timeSystem).run(40, { tickSize: 1.0, stopOnCrash: true });
      port._shipyardLevelDirty = true;
    }
    assert(cm._getShipyardLevel(port) > 0,
      `T11 KONTROLA FIXTURE: port ma stocznię (lv ${cm._getShipyardLevel(port)}) — bez niej naprawa odpada wcześniej`);
    port.resourceSystem.receive({ fuel: 500 });

    const stored = stubStored(core, port);
    const active = stubStored(core, port);
    active.serviceState = 'active';
    stored.fuel.current = 0;
    active.fuel.current = 0;
    stored.damaged = true;
    active.damaged = true;

    core.vesselManager._tickRefueling(1.0);
    assert(stored.fuel.current === 0, 'T11a: kadłub w REZERWIE nie pobrał paliwa (nie ma drugiego, nieopisanego utrzymania)');
    assert(active.fuel.current > 0, 'T11a KONTROLA PINU: kadłub W SŁUŻBIE tankuje normalnie — filtr działa na stan, nie na wszystko');

    // ── T11b — ⚠ PIN LUKI, NIE POPRAWNOŚCI (znaleziony przy W2-4, NIE naprawiany tutaj).
    //    `_tickRepair` szuka stoczni po `entry.buildingId === 'shipyard'`, a wpisy w
    //    `BuildingSystem._active` NIE MAJĄ takiego pola — mają `entry.building.id`. Warunek
    //    nie trafia NIGDY, więc naprawa statków jest w tej grze martwa u WSZYSTKICH właścicieli,
    //    niezależnie od stanu służby. Filtr `isInService` dołożony w W2-4 siedzi tam na zapas.
    //    Świadomie nie ruszamy tego w W2-4: jednolinijkowa „poprawka" WŁĄCZYŁABY naprawę floty
    //    w całej grze — to zmiana balansu, nie higiena, i należy do własnego commita z pomiarem.
    //    ⚠ TEN PIN MA PAŚĆ, gdy ktoś naprawi wyszukiwanie — wtedy przywrócić parę
    //    „rezerwa zostaje uszkodzona / służba się naprawia" jako pin poprawności.
    core.vesselManager._tickRepair(1.5);   // > 1.0 civYear akumulatora naprawy
    const entry = [...port.buildingSystem._active.values()][0] ?? {};
    assert(entry.buildingId === undefined && entry.building?.id !== undefined,
      'T11b PIN LUKI: wpis `_active` niesie `building.id`, a `_tickRepair` czyta `entry.buildingId` — ' +
      'warunek stoczni nie trafia nigdy');
    assert(stored.damaged === true && active.damaged === true,
      'T11b PIN LUKI: ŻADEN kadłub się nie naprawił — naprawa jest martwa u obu stanów służby, ' +
      'więc filtru W2 nie da się tu dziś zmierzyć (mierzy go T11a na tankowaniu)');
  }
}

// ── T12 — round-trip zapisu obu nowych kolumn księgi ────────────────────────────────────────
console.log('T12 — księga załogi przeżywa serialize → restore (biała lista serialize/restore)');
{
  const core = boot();
  const col = anyAiColony(core);
  if (col) {
    const v = stubStored(core, col);
    core.vesselManager.deployVessel(v.id);
    const blob = core.vesselManager.serialize();
    const fresh = new VesselManager();
    fresh.restore(blob);
    const revived = fresh.getVessel(v.id);
    assert(!!revived, 'T12: statek wrócił z zapisu');
    assert(near(revived?.crewLocked ?? -1, v.crewLocked), `T12: crewLocked przeżył (${revived?.crewLocked})`);
    assert(JSON.stringify(revived?.crewStrataLocked ?? null) === JSON.stringify(v.crewStrataLocked),
      `T12: crewStrataLocked przeżył (${JSON.stringify(revived?.crewStrataLocked)}) — pole pominięte w białej liście zniknęłoby BEZ ostrzeżenia`);
    assert(revived?.crewColonyId === v.crewColonyId, `T12: crewColonyId przeżył (${revived?.crewColonyId})`);
    assert(revived?.mobilizeTarget === v.mobilizeTarget, `T12: mobilizeTarget przeżył (${revived?.mobilizeTarget})`);

    // Mobilizacja przerwana zapisem MUSI biec dalej — tick jest bezstanowy (bez indeksu
    // budowanego w konstruktorze, który po `restore` byłby pusty; usterka `MovementOrderSystem`).
    assert(revived?.serviceState === 'mobilizing', 'T12: stan przejściowy przetrwał zapis');
    fresh._tickMobilization(1.0);
    assert(revived?.serviceState === 'active',
      'T12: mobilizacja DOKAŃCZA SIĘ po wczytaniu — nie utyka na zawsze przy zapisanym postępie');
  }
}

console.log(`\n[w2_crew_ledger_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
