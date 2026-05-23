// EmpireColonyMaintenance — tymczasowy workaround tick dla kolonii AI (Slice 1 Faza 1)
//
// Problem (z testów Patcha v3, decyzja Patch v4):
//   Kolonia AI obserwowana przez gracza (klik na nią w UI) żyje normalnie.
//   Kolonia AI NIE obserwowana stopniowo umiera — cache effectiveRates rozjeżdża
//   się z rzeczywistym stanem (employedPops, POPy), produkcja energii spada,
//   brownout, POP umierają.
//
// Root cause (BuildingSystem.js:119-126):
//   EventBus.on('civ:popBorn', () => {
//     if (window.KOSMOS?.buildingSystem !== this) return;  // ← GUARD
//     this._reapplyAllRates();
//   });
//   Guard blokuje reactive recompute rates dla NIE-aktywnej kolonii. Gdy gracz
//   klika kolonię AI, swap window.KOSMOS.buildingSystem włącza recompute → kolonia
//   się "odradza". Bez klika cache pozostaje przestarzały → spirala śmierci.
//
// Workaround: co 1 civYear iteruję kolonie AI (ownerEmpireId !== null) i wymuszam
//   colony.buildingSystem._reapplyAllRates() bezpośrednio (bypass guarda).
//   Plus forceConsumptionSync defensywnie (na wypadek POP growth/death przez
//   naturalny tick bez addPop bootstrap path).
//
// TODO Faza 2 — usunąć całkowicie:
//   ColonyAutoPlanner w Fazie 2 będzie wywoływać _reapplyAllRates() co tactical
//   tick (planowane). Wtedy ten plik staje się zbędny. Cleanup:
//     1. Usuń ten plik
//     2. Usuń import w GameScene.js
//     3. Usuń `this.empireColonyMaintenance = new ...` w konstruktorze GameScene
//   = 3 linie do skasowania.

import EventBus from '../core/EventBus.js';

const MAINTENANCE_TICK_INTERVAL = 1.0;  // civYears

export class EmpireColonyMaintenance {
  constructor() {
    this._accumulator = 0;

    EventBus.on('time:tick', ({ civDeltaYears }) => {
      this._accumulator += civDeltaYears ?? 0;
      if (this._accumulator < MAINTENANCE_TICK_INTERVAL) return;
      const steps = Math.floor(this._accumulator);
      this._accumulator -= steps;
      this._maintenanceTick(steps);
    });
  }

  _maintenanceTick(_steps) {
    const colonyManager = window.KOSMOS?.colonyManager;
    if (!colonyManager) return;

    // Tylko kolonie AI (ownerEmpireId !== null). Kolonie gracza obsługuje
    // standardowy flow (EventBus reactive handlers przepuszczają guard
    // dla aktywnej kolonii window.KOSMOS.X).
    const aiColonies = colonyManager.getAllColonies()
      .filter(c => c?.ownerEmpireId != null);

    for (const colony of aiColonies) {
      try {
        // Wymuś recompute rates — workaround guard'a w BuildingSystem
        if (typeof colony.buildingSystem?._reapplyAllRates === 'function') {
          colony.buildingSystem._reapplyAllRates();
        }

        // Wymuś consumption sync — defensywnie, addPop bug fixed w bootstrap
        // ale natural POP growth/death może go re-triggerować bez resync.
        //
        // TODO Patch v5 follow-up: po fixie `_resourceSnap` (lazy getter w
        // CivilizationSystem) AI CivSystem._update sam woła `_syncConsumption()`
        // raz na civYear z prawidłowymi danymi snapshotu. Ten defensive call
        // może być redundancją. Decyzja o usunięciu — po teście acceptance v5.
        if (typeof colony.civSystem?.forceConsumptionSync === 'function' && colony.resourceSystem) {
          colony.civSystem.forceConsumptionSync(colony.resourceSystem);
        }
      } catch (err) {
        const cid = colony?.planetId ?? '?';
        console.warn(`[EmpireColonyMaintenance] tick error for ${cid}:`, err);
      }
    }
  }
}
