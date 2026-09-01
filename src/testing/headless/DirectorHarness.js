// ═══════════════════════════════════════════════════════════════
// DirectorHarness — headless boot Z PEŁNYM STOSEM DIRECTORA (D-178-3)
// ───────────────────────────────────────────────────────────────
// Decyzja PODPISANA w `docs/design/COURIER_LOAD_ORDER_PLAN.md` §4 (D-178-3).
// ⚠ Podpisana 2026-08-31, ZBUDOWANA 2026-09-01 — slice, razem z którym miała powstać, został
//   wstrzymany (rama obalona pomiarem), więc instrument nie powstał wraz z nim. ✅ w planie
//   znaczy „ZDECYDOWANE", a nie „ISTNIEJE" (lekcja: `FE_SUPPLY_PLAN.md` §9).
//
// PO CO: `GameCore` montuje 38 systemów, ale ANI JEDNEGO modułu Directora — więc łańcuch
//   `pressureResponse → queueWarships → startShipBuild` jest headless niedostępny. Ta luka
//   kosztowała CZTERY ślepe plamy: GATE B2, 199, 208 i tabelę podaży Fe. Trzy sondy
//   (`probe-130-z2`, `probe-w3-targets`, `probe-director-seams`) montowały Director z ręki.
//
// ⚠ TRZY PUŁAPKI, KTÓRE HARNESS WNOSI ZE SOBĄ — każda kosztowała przebieg (D-178-3):
//   1. STUB STACJI MUSI MIEĆ `serialize`/`restore` — autozapis woła je co rok gry; bez nich
//      `SaveSystem` rzuca co tik i zalewa wyjście.
//   2. `Ticker` z `balans-driver`, NIGDY własna pętla — `core.tick()` NIE ISTNIEJE, więc pętla
//      z ręki stoi na roku 0,0 i zwraca fałszywe „zero wygaśnięć".
//   3. KALIBRACJA JEST DOMYŚLNA (poprawka właściciela do D-178-3): `DRIVER_DEFAULTS`
//      + `aiEmpires: true` + przypięty `HEADLESS_GALAXY_SEED`. Boot bez kalibracji daje świat,
//      w którym AI NIE MA ANI JEDNEJ PLACÓWKI, a jego ekonomia wygląda na zepsutą w sposób,
//      w jaki zepsuta nie jest. Opt-out jest JAWNY (`calibrated: false`).
// ═══════════════════════════════════════════════════════════════

import './env.js';                       // MUSI być pierwszy
import { GameCore, HEADLESS_GALAXY_SEED } from './GameCore.js';
import { DRIVER_DEFAULTS } from './balans-driver.mjs';
import { Ticker } from './Ticker.js';
import { InfluenceMap } from '../../systems/InfluenceMap.js';
import { TerritoryService } from '../../systems/TerritoryService.js';
import { DirectorProduction, registerProductionGuards } from '../../systems/director/DirectorProduction.js';
import { DirectorFirstContact, registerFirstContactBehaviors } from '../../systems/director/DirectorFirstContact.js';
import { DirectorPressure, registerPressureBehaviors } from '../../systems/director/DirectorPressure.js';
import { DirectorDoctrine, registerDoctrineBehaviors } from '../../systems/director/DirectorDoctrine.js';
import { DirectorMobilization, registerMobilizationBehaviors } from '../../systems/director/DirectorMobilization.js';
import { DirectorOffensive, registerOffensiveBehaviors } from '../../systems/director/DirectorOffensive.js';
import { DirectorRecall, registerRecallBehaviors } from '../../systems/director/DirectorRecall.js';
import { DirectorSystem } from '../../systems/director/DirectorSystem.js';

/** Moduły Directora montowane przez harness — keeper pinuje KOMPLET tej listy. */
export const DIRECTOR_MODULES = Object.freeze([
  'directorProduction', 'directorFirstContact', 'directorPressure', 'directorDoctrine',
  'directorMobilization', 'directorOffensive', 'directorRecall', 'directorSystem',
]);

/**
 * Stub stacji orbitalnej — ŻETON UPRAWNIENIA R-3.
 * `DirectorProduction.hasOrbitalStation` odpytuje `stationSystem.getAllStations()`; bez niego
 * KAŻDE zamówienie okrętu AI kończy się `no_orbital_station`, czyli harness mierzy CISZĘ.
 * ⚠ `serialize`/`restore` OBOWIĄZKOWE (pułapka 1) — autozapis woła je co rok gry.
 */
export function makeStationStub(empireIds = []) {
  let stations = empireIds.map((id, i) => ({ id: `st_stub_${i}`, ownerEmpireId: id, modules: [] }));
  return {
    getAllStations: () => stations,
    getStationsAt:  () => [],
    serialize:      () => ({ stations: stations.map(s => ({ ...s })) }),
    restore:        (d) => { stations = (d?.stations ?? []).map(s => ({ ...s })); },
    dispose:        () => { stations = []; },
    _isHarnessStub: true,
  };
}

/**
 * Boot z pełnym stosem Directora i ZAPIECZONĄ kalibracją.
 * @returns {{ core, ticker, K, director, home, stationStub }}
 */
export function bootWithDirector({
  aiEmpires = true, seed = HEADLESS_GALAXY_SEED, calibrated = true,
  planetClass = 'REAL', opts = {}, quiet = true,
} = {}) {
  const cfg = calibrated ? { ...DRIVER_DEFAULTS, aiEmpires, ...opts } : { aiEmpires, ...opts };

  const core = new GameCore();
  core.boot({ quiet, planetClass, galaxySeed: seed, ...cfg });
  const K = window.KOSMOS;

  // ── Prerekwizyty, których GameCore nie montuje ─────────────────────────────────────
  // ⚠ KOLEJNOŚĆ JEST KONTRAKTEM: `InfluenceMap` ŻĄDA `TerritoryService` (głośno, R12), więc
  //   sam `new InfluenceMap()` przechodzi, a pierwszy REALNY odczyt (`getBorderSystems`) rzuca.
  //   Wykryte przy migracji `probe-w3-targets`, która montowała oba ręcznie i miała to spisane.
  //   To jest dokładnie ta klasa, którą keeper na MONTAŻU ma łapać — dlatego T2a nie sprawdza
  //   istnienia obiektu, tylko WYKONUJE odczyt.
  if (!K.territoryService) K.territoryService = new TerritoryService();
  // InfluenceMap: sondy nacisku (`armedPlayerVesselsInBorderZone`) i ofensywy
  // (`reachablePlayerTargets`) czytają ją WPROST — bez niej RZUCAJĄ, nie milczą.
  if (!K.influenceMap) K.influenceMap = new InfluenceMap();
  const empireIds = (K.empireRegistry?.listAll?.() ?? []).map(e => e.id);
  const stationStub = makeStationStub(empireIds);
  if (!K.stationSystem) K.stationSystem = stationStub;

  // ── Stos Directora — KOLEJNOŚĆ I `allowOverride` JAK W `GameScene:346-384` ─────────
  // ⚠ `DirectorSystem` waliduje w konstruktorze WSZYSTKIE nazwy katalogu (R12) i RZUCA na
  //   nieznanej, więc rejestracje MUSZĄ poprzedzać jego konstrukcję.
  const director = {};
  director.directorProduction = new DirectorProduction();
  registerProductionGuards(director.directorProduction, { allowOverride: true });
  director.directorFirstContact = new DirectorFirstContact();
  registerFirstContactBehaviors(director.directorFirstContact, { allowOverride: true });
  director.directorPressure = new DirectorPressure();
  registerPressureBehaviors(director.directorPressure, { allowOverride: true });
  director.directorDoctrine = new DirectorDoctrine();
  registerDoctrineBehaviors(director.directorDoctrine, { allowOverride: true });
  director.directorMobilization = new DirectorMobilization();
  registerMobilizationBehaviors(director.directorMobilization, { allowOverride: true });
  director.directorOffensive = new DirectorOffensive();
  registerOffensiveBehaviors(director.directorOffensive, { allowOverride: true });
  director.directorRecall = new DirectorRecall();
  registerRecallBehaviors(director.directorRecall, { allowOverride: true });
  director.directorSystem = new DirectorSystem();

  for (const name of DIRECTOR_MODULES) K[name] = director[name];

  const ticker = new Ticker(core.timeSystem);
  const home = K.homePlanet ? core.colonyManager.getColony(K.homePlanet.id) : null;
  return { core, ticker, K, director, home, stationStub };
}

export default bootWithDirector;
