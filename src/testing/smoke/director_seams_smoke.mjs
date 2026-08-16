// DIRECTOR SLICE 1 — keeper szwów (commit S0, WOJNA I POKÓJ 1.0, workstream C).
//
// PO CO: plan `docs/design/DIRECTOR_SLICE1_PLAN.md` powstał z audytu JEDNOPRZEBIEGOWEGO
// (przebieg adwersaryjny padł na limicie budżetu). Podpisane decyzje 1/3/6 stoją na
// twierdzeniach, których nikt nie sprawdził wykonaniem. Ten keeper pinuje te z nich,
// które są STABILNE, żeby szkielet Directora nie osiadł na cichej regresji.
// Pomiar jednorazowy (liczby, rozkłady, wieloseedowość) siedzi w sondzie:
//   node src/testing/headless/probe-director-seams.mjs
//
//   T1  kadencja _tickAll: 1 krok = 1 rok cyw., KAŻDY krok po WSZYSTKICH imperiach
//   T2  planet:constructionComplete — dwa kształty payloadu, guard po buildingId przeżywa oba
//   T3  startShipBuild przyjmuje kadłub WOJENNY na kolonii AI (bramka S3.4d zwalnia AI)
//   T4  niedobór surowców ⇒ zlecenie CZEKA w pendingShipOrders (nie ginie)
//   T5  bramka załogi jest TWARDA (brak wolnych POPów ⇒ odmowa, nie kolejka)
//   T6  ⚠ PIN LUKI: okręt zbudowany przez kolonię AI NIE MA właściciela (S4 to naprawia)

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import EventBus from '../../core/EventBus.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { HULLS } from '../../data/HullsData.js';
import { SHIP_MODULES } from '../../data/ShipModulesData.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const MODULES = ['engine_ion', 'armor_standard', 'weapon_kinetic'];

/** Pełny koszt kadłuba + modułów — liczony Z DANYCH, nigdy z ręcznej listy. */
function fullCostOf(hullId, moduleIds) {
  const h = HULLS[hullId];
  const out = { ...h.cost, ...(h.commodityCost ?? {}) };
  for (const m of moduleIds) {
    const mod = SHIP_MODULES[m];
    for (const [k, v] of Object.entries(mod?.cost ?? {}))          out[k] = (out[k] ?? 0) + v;
    for (const [k, v] of Object.entries(mod?.commodityCost ?? {})) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

/** Boot + przewinięcie; zwraca rdzeń i kolonię AI zdolną obsadzić fregatę. */
function bootWithAiColony(civYears = 60) {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  new Ticker(core.timeSystem).run(civYears, { tickSize: 1.0, stopOnCrash: true });
  const cm = core.colonyManager;
  const crew = HULLS.hull_frigate.crewCost ?? 0;
  const ai = cm.getAllColonies().filter(c => c.ownerEmpireId && c.ownerEmpireId !== 'player');
  return { core, cm, crew, ai, viable: ai.find(c => (c.civSystem?.freePops ?? 0) >= crew) };
}

// ── T1 — kadencja i iteracja po imperiach (decyzja 1) ───────────────────────
console.log('T1 — AlienCivSystem._tickAll: kadencja + iteracja po WSZYSTKICH imperiach');
{
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  const acs = core.alienCivSystem;
  const empireCount = core.empireRegistry.listAll().length;

  let steps = 0, decides = 0;
  const perStep = [];
  const origTick = acs._tickAll.bind(acs);
  const origDecide = acs._decideNextState.bind(acs);
  acs._decideNextState = (...a) => { decides++; return origDecide(...a); };
  acs._tickAll = (...a) => { const b = decides; steps++; const r = origTick(...a); perStep.push(decides - b); return r; };

  const CIV_YEARS = 12;
  new Ticker(core.timeSystem).run(CIV_YEARS, { tickSize: 1.0, stopOnCrash: true });

  assert(empireCount > 0, `partia ma imperia AI (${empireCount}) — jest po czym iterować`);
  assert(Math.abs(steps - CIV_YEARS) <= 1, `kadencja 1 krok / 1 rok cyw. (${steps} kroków na ${CIV_YEARS} civY)`);
  assert(perStep.length > 0 && perStep.every(c => c === empireCount),
    `KAŻDY krok przechodzi po wszystkich ${empireCount} imperiach (NIE round-robin — korekta K-5 planu)`);

  // Klamra przeciw zamrożeniu UI przy dużej prędkości gry.
  const before = steps;
  EventBus.emit('time:tick', { deltaYears: 100 / GAME_CONFIG.CIV_TIME_SCALE, civDeltaYears: 100 });
  assert(steps - before <= 8, `MAX_STEPS_PER_TICK klamruje pojedynczy tick do ≤8 kroków (było ${steps - before})`);
}

// ── T2 — dwa kształty payloadu, jeden bezpieczny guard ─────────────────────
console.log('T2 — planet:constructionComplete: guard po buildingId przeżywa OBU emitentów');
{
  let fired = 0, threw = 0;
  const guard = (p) => { try { if (p?.buildingId === 'observatory') fired++; } catch { threw++; } };
  EventBus.on('planet:constructionComplete', guard);

  // Kształt MissionSystem.js:1786 — WYŁĄCZNIE {planetId}. To jest pułapka z planu §A.
  EventBus.emit('planet:constructionComplete', { planetId: 'entity_x' });
  assert(threw === 0, 'payload {planetId} bez buildingId NIE wywraca guardu');
  assert(fired === 0, 'payload {planetId} NIE odpala guardu fałszywie');

  // Kształt BuildingSystem — pełny.
  EventBus.emit('planet:constructionComplete', { planetId: 'entity_x', buildingId: 'observatory', isUpgrade: false, tileKey: '0_0' });
  assert(fired === 1, 'pełny payload odpala guard dokładnie raz');
  EventBus.off('planet:constructionComplete', guard);
}

// ── T3/T4/T5/T6 — ścieżka „economy executes" (decyzja 6) ────────────────────
console.log('T3-T6 — startShipBuild na kolonii AI: kadłub wojenny, kolejka, załoga, właściciel');
{
  const { core, cm, crew, ai, viable } = bootWithAiColony(60);
  assert(ai.length > 0, `partia ma kolonie AI (${ai.length})`);

  if (!viable) {
    // Nie zgadujemy — brak zdatnej kolonii to informacja, nie cichy PASS.
    assert(false, `ŻADNA kolonia AI nie ma ${crew} wolnych POPów — ścieżki produkcji nie da się zmierzyć`);
  } else {
    const col = viable;
    if (cm._getShipyardLevel(col) === 0) {
      col.resourceSystem.receive({ Fe: 5000, Si: 5000, Cu: 5000, Ti: 2000, C: 2000 });
      col.buildingSystem.autoPlaceBuilding('shipyard');
      new Ticker(core.timeSystem).run(40, { tickSize: 1.0, stopOnCrash: true });
      col._shipyardLevelDirty = true;
    }
    assert(cm._getShipyardLevel(col) > 0, 'kolonia AI ma stocznię (warunek konieczny startShipBuild)');
    (col.techSystem ?? cm.techSystem)?.grantTechs?.([HULLS.hull_frigate.requires].filter(Boolean));

    // T4 — niedobór: zlecenie ma CZEKAĆ, nie zniknąć.
    const pendBefore = (col.pendingShipOrders ?? []).length;
    const poor = cm.startShipBuild(col.planetId, 'hull_frigate', MODULES);
    assert(poor?.ok === true && poor?.queued === true,
      'T4: niedobór surowców ⇒ {ok:true, queued:true} (zlecenie nie ginie)');
    assert((col.pendingShipOrders ?? []).length === pendBefore + 1,
      'T4: zlecenie widoczne w pendingShipOrders');

    // T3 — pełne zasoby: kadłub WOJENNY przyjęty, kolejka stoczni widoczna.
    (col.pendingShipOrders ?? []).length = 0;
    const cost = fullCostOf('hull_frigate', MODULES);
    const grant = {};
    for (const [k, v] of Object.entries(cost)) grant[k] = v * 10;
    col.resourceSystem.receive(grant);
    const qBefore = (col.shipQueues ?? []).length;
    const rich = cm.startShipBuild(col.planetId, 'hull_frigate', MODULES);
    assert(rich?.ok === true && !rich?.queued,
      'T3: kadłub WOJENNY przyjęty na kolonii AI (bramka kadłubowa S3.4d zwalnia AI)');
    assert((col.shipQueues ?? []).length === qBefore + 1,
      'T3: kolejka stoczni WIDOCZNA — intel ma w co zajrzeć („scripts order, economy executes")');

    // T6 — ⚠ PIN LUKI, NIE POPRAWNOŚCI. Dziś okręt AI wychodzi ze stoczni bez właściciela,
    // bo jedyny stempel (`EmpireLogisticsSystem._onVesselCreatedClaim`) filtruje `hull_small`.
    // Gdy S4 doda własny stempel, TA ASERCJA MA PAŚĆ i zostać świadomie odwrócona.
    // Wzór: `MEMORY_EVIDENCE_WEIGHTS = {}` z D2 (pin pustki z instrukcją, kiedy go zaktualizować).
    const seen = [];
    const onCreated = ({ vessel }) => seen.push(vessel);
    EventBus.on('vessel:created', onCreated);
    new Ticker(core.timeSystem).run(200, { tickSize: 1.0, stopOnCrash: true });
    EventBus.off('vessel:created', onCreated);
    const frigate = seen.find(v => v?.shipId === 'hull_frigate');
    assert(!!frigate, 'T6: fregata faktycznie powstaje na kolonii AI (ścieżka end-to-end działa)');
    if (frigate) {
      assert(frigate.ownerEmpireId == null,
        'T6: PIN LUKI — okręt AI wychodzi BEZ ownerEmpireId (S4 musi dołożyć stempel; wtedy ten pin odwrócić)');
    }

    // T5 — ⚠ ODWRÓCONE W W2-4. Do W2-3 ten test pinował TWARDĄ odmowę `startShipBuild` przy
    // `freePops < crewCost` („reguła nacisku potrzebuje guardu załogowego"). P4 przeniósł koszt
    // załogi z BUDOWY na ROZMIESZCZENIE (decyzja 13), więc pusta kolonia ma teraz prawo
    // postawić kadłub — zapłaci POP dopiero, gdy go obsadzi (`VesselManager.deployVessel`).
    //
    // ⚠ Fixture WYMUSZONY, nie wyszukiwany. Stara wersja robiła `ai.find(freePops < crew)`
    // i przy braku trafienia wypisywała „T5 pominięty" — czyli na szczęśliwym seedzie
    // kasowanie bramki przeszłoby NIEZAUWAŻONE (zielony sweep bez asercji). Teraz głodzimy
    // kolonię sami i najpierw pinujemy, że warunek naprawdę zachodzi.
    {
      const starved = ai[0] ?? null;
      assert(!!starved?.civSystem, 'T5-kontrola: jest kolonia AI z żywym civSystem (fixture istnieje)');
      if (starved?.civSystem) {
        // Zablokuj WSZYSTKO, co wolne — najprostsze wymuszenie `freePops = 0` bez zabijania POPów.
        const free = starved.civSystem.freePops ?? 0;
        if (free > 0) starved.civSystem.lockPops(free, 'mix');
        assert((starved.civSystem.freePops ?? 0) < crew,
          `T5-kontrola: kolonia realnie zagłodzona z POPów (freePops=${(starved.civSystem.freePops ?? 0).toFixed(2)} < crewCost=${crew})`);

        if (cm._getShipyardLevel(starved) === 0) {
          starved.resourceSystem.receive({ Fe: 5000, Si: 5000, Cu: 5000, Ti: 2000, C: 2000 });
          starved.buildingSystem.autoPlaceBuilding('shipyard');
          new Ticker(core.timeSystem).run(40, { tickSize: 1.0, stopOnCrash: true });
          starved._shipyardLevelDirty = true;
        }
        (starved.techSystem ?? cm.techSystem)?.grantTechs?.([HULLS.hull_frigate.requires].filter(Boolean));
        starved.resourceSystem.receive(grant);

        const lockedBefore = starved.civSystem._lockedPops ?? 0;
        const res = cm.startShipBuild(starved.planetId, 'hull_frigate', MODULES);
        assert(res?.ok === true,
          `T5: brak wolnych POPów NIE blokuje już budowy — budowa to przemysł (ok=${res?.ok}, reason=${res?.reason ?? '—'})`);
        assert(Math.abs((starved.civSystem._lockedPops ?? 0) - lockedBefore) < 1e-9,
          'T5: budowa nie zablokowała ANI JEDNEGO POPa — koszt załogi przeniesiony na rozmieszczenie');
      }
    }
  }
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
