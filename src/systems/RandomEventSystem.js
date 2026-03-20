// RandomEventSystem — system zdarzeń losowych
//
// Co pewien czas losuje zdarzenie z RandomEventsData i aplikuje efekty.
// Zdarzenia mogą dotyczyć konkretnej kolonii lub całego imperium.
// Obsługuje chain events (zdarzenia łańcuchowe z opóźnieniem).
//
// Komunikacja:
//   Nasłuchuje: 'time:tick'     → sprawdzenie czy wylosować zdarzenie
//   Emituje:    'randomEvent:occurred' { event, colony, effects, planetId }
//               'randomEvent:expired'  { event, planetId }

import EventBus from '../core/EventBus.js';
import { RANDOM_EVENTS, DRAWABLE_EVENTS, TOTAL_WEIGHT } from '../data/RandomEventsData.js';

// Minimalna przerwa między zdarzeniami (lata gry)
const MIN_COOLDOWN = 8;
const MAX_COOLDOWN = 25;

// Szansa na zdarzenie per sprawdzenie (per rok gry, po cooldownie)
const EVENT_CHANCE = 0.15;  // 15% na rok

// Redukcja szansy za defense_tower per level (5%)
const DEFENSE_TOWER_REDUCTION = 0.05;
// Redukcja szansy za defense_grid per level (15%)
const DEFENSE_GRID_REDUCTION = 0.15;
// Maksymalna łączna redukcja szansy (90%)
const MAX_DEFENSE_REDUCTION = 0.9;

export class RandomEventSystem {
  constructor() {
    // Cooldown — ile lat do następnego możliwego zdarzenia
    this._cooldown = MIN_COOLDOWN + Math.random() * (MAX_COOLDOWN - MIN_COOLDOWN);
    this._accumYears = 0;

    // Aktywne zdarzenia z czasem trwania
    this._activeEvents = [];

    // Zaplanowane chain events
    this._chainQueue = [];

    // Kolejka ostrzeżeń obserwatorium:
    //   [{ event, planetId, colonyName, remainingYears, totalYears }]
    this._warningQueue = [];

    // Rok gry
    this._gameYear = 0;

    // Nasłuch czasu
    // civDeltaYears = deltaYears × CIV_TIME_SCALE — zdarzenia losowe biegną szybciej
    EventBus.on('time:tick', ({ civDeltaYears: deltaYears }) => this._update(deltaYears));
    EventBus.on('time:display', ({ gameTime }) => { this._gameYear = gameTime; });
  }

  // ── API publiczne ───────────────────────────────────────────────────────

  // Aktywne zdarzenia z efektami
  getActiveEvents() {
    return [...this._activeEvents];
  }

  // Ostrzeżenia obserwatorium (zdarzenia z opóźnieniem)
  getWarnings() {
    return [...this._warningQueue];
  }

  // Mnożnik produkcji dla danego zasobu z aktywnych zdarzeń (wszystkie kolonie)
  getProductionMultiplier(resource) {
    let mult = 1.0;
    for (const ae of this._activeEvents) {
      for (const fx of ae.event.effects) {
        if (fx.type === 'production') {
          if (fx.resource === resource || fx.resource === 'all') {
            mult *= fx.multiplier;
          }
        }
      }
    }
    return mult;
  }

  // Mnożnik produkcji dla konkretnej kolonii (filtruje po planetId)
  getProductionMultiplierForColony(planetId, resource) {
    let mult = 1.0;
    for (const ae of this._activeEvents) {
      if (ae.planetId !== planetId) continue;
      for (const fx of ae.event.effects) {
        if (fx.type === 'production') {
          if (fx.resource === resource || fx.resource === 'all') {
            mult *= fx.multiplier;
          }
        }
      }
    }
    return mult;
  }

  // Serializacja
  serialize() {
    return {
      cooldown:     this._cooldown,
      accumYears:   this._accumYears,
      activeEvents: this._activeEvents.map(ae => ({
        eventId:       ae.event.id,
        planetId:      ae.planetId,
        startYear:     ae.startYear,
        remainingYears: ae.remainingYears,
      })),
      chainQueue: this._chainQueue.map(cq => ({
        eventId:   cq.eventId,
        planetId:  cq.planetId,
        triggerYear: cq.triggerYear,
      })),
      warningQueue: this._warningQueue.map(w => ({
        eventId:        w.event.id,
        planetId:       w.planetId,
        colonyName:     w.colonyName,
        remainingYears: w.remainingYears,
        totalYears:     w.totalYears,
      })),
    };
  }

  restore(data) {
    if (!data) return;
    this._cooldown     = data.cooldown     ?? MIN_COOLDOWN;
    this._accumYears   = data.accumYears   ?? 0;
    this._activeEvents = (data.activeEvents ?? []).map(ae => ({
      event:          RANDOM_EVENTS[ae.eventId],
      planetId:       ae.planetId,
      startYear:      ae.startYear,
      remainingYears: ae.remainingYears,
    })).filter(ae => ae.event);
    this._chainQueue = (data.chainQueue ?? []).map(cq => ({
      eventId:     cq.eventId,
      planetId:    cq.planetId,
      triggerYear: cq.triggerYear,
    }));
    this._warningQueue = (data.warningQueue ?? []).map(w => ({
      event:          RANDOM_EVENTS[w.eventId],
      planetId:       w.planetId,
      colonyName:     w.colonyName,
      remainingYears: w.remainingYears,
      totalYears:     w.totalYears,
    })).filter(w => w.event);
  }

  // ── Prywatne ──────────────────────────────────────────────────────────

  _update(deltaYears) {
    if (!window.KOSMOS?.civMode) return;

    this._accumYears += deltaYears;
    if (this._accumYears < 1) return;
    const years = Math.floor(this._accumYears);
    this._accumYears -= years;

    for (let y = 0; y < years; y++) {
      this._yearlyUpdate();
    }
  }

  _yearlyUpdate() {
    // Zmniejsz czas trwania aktywnych zdarzeń
    for (let i = this._activeEvents.length - 1; i >= 0; i--) {
      const ae = this._activeEvents[i];
      ae.remainingYears--;
      if (ae.remainingYears <= 0) {
        this._activeEvents.splice(i, 1);
        EventBus.emit('randomEvent:expired', { event: ae.event, planetId: ae.planetId });
      }
    }

    // Sprawdź chain events
    for (let i = this._chainQueue.length - 1; i >= 0; i--) {
      const cq = this._chainQueue[i];
      if (this._gameYear >= cq.triggerYear) {
        this._chainQueue.splice(i, 1);
        const chainEvent = RANDOM_EVENTS[cq.eventId];
        if (chainEvent) {
          this._triggerEvent(chainEvent, cq.planetId);
        }
      }
    }

    // Odliczaj ostrzeżenia obserwatorium — gdy timer = 0 → triggerEvent
    for (let i = this._warningQueue.length - 1; i >= 0; i--) {
      const w = this._warningQueue[i];
      w.remainingYears--;
      if (w.remainingYears <= 0) {
        this._warningQueue.splice(i, 1);
        this._triggerEvent(w.event, w.planetId);
      }
    }

    // Cooldown
    this._cooldown -= 1;
    if (this._cooldown > 0) return;

    // Wybierz losową kolonię
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr || colMgr.colonyCount === 0) return;

    const colonies = colMgr.getAllColonies();
    const colony   = colonies[Math.floor(Math.random() * colonies.length)];

    // Redukcja szansy z obrony kolonii
    const defenseReduction = this._getColonyDefenseReduction(colony);
    const adjustedChance = EVENT_CHANCE * (1 - defenseReduction);

    // Szansa na zdarzenie
    if (Math.random() > adjustedChance) return;

    // Losuj zdarzenie ważone
    const event = this._rollEvent(colony);
    if (!event) return;

    // Sprawdź czy obrona blokuje to zdarzenie całkowicie
    if (this._isEventBlockedByDefense(event, colony)) {
      EventBus.emit('randomEvent:blocked', {
        event,
        planetId: colony.planetId,
        colonyName: colony.name,
      });
      this._cooldown = MIN_COOLDOWN + Math.random() * (MAX_COOLDOWN - MIN_COOLDOWN);
      return;
    }

    // Ostrzeżenie obserwatorium — opóźnij negatywne zdarzenia
    const warningYears = this._getWarningYears();
    if (warningYears > 0 && event.severity !== 'info') {
      this._warningQueue.push({
        event,
        planetId:       colony.planetId,
        colonyName:     colony.name,
        remainingYears: Math.ceil(warningYears),
        totalYears:     Math.ceil(warningYears),
      });
      EventBus.emit('randomEvent:warning', {
        event,
        planetId:   colony.planetId,
        colonyName: colony.name,
        yearsUntil: Math.ceil(warningYears),
      });
      this._cooldown = MIN_COOLDOWN + Math.random() * (MAX_COOLDOWN - MIN_COOLDOWN);
      return;
    }

    // Brak obserwatorium — aplikuj natychmiast
    this._triggerEvent(event, colony.planetId);

    // Reset cooldown
    this._cooldown = MIN_COOLDOWN + Math.random() * (MAX_COOLDOWN - MIN_COOLDOWN);
  }

  // Pobierz lata ostrzeżenia z ObservatorySystem (max w imperium)
  _getWarningYears() {
    return window.KOSMOS?.observatorySystem?.getWarningYears() ?? 0;
  }

  // ── Obrona kolonii ──────────────────────────────────────────────────

  // Oblicz procentową redukcję szansy na zdarzenie z budynków obronnych i technologii
  _getColonyDefenseReduction(colony) {
    let reduction = 0;

    const bSys = colony?.buildingSystem;
    if (bSys?._active) {
      for (const entry of bSys._active.values()) {
        const bId = entry.building.id;
        const level = entry.level ?? 1;
        if (bId === 'defense_tower') {
          reduction += DEFENSE_TOWER_REDUCTION * level;
        } else if (bId === 'defense_grid') {
          reduction += DEFENSE_GRID_REDUCTION * level;
        }
      }
    }

    // Bonus z technologii (disasterReduction w procentach → 0.01)
    const techRed = window.KOSMOS?.techSystem?.getDisasterReduction() ?? 0;
    reduction += techRed * 0.01;

    return Math.min(MAX_DEFENSE_REDUCTION, reduction);
  }

  // Czy zdarzenie jest całkowicie zablokowane przez konkretną obronę
  _isEventBlockedByDefense(event, colony) {
    const tag = event.defenseTag;
    if (!tag) return false;

    const bSys = colony?.buildingSystem;
    const tSys = window.KOSMOS?.techSystem;

    switch (tag) {
      case 'kinetic': {
        // Blokowane przez defense_grid
        if (bSys?._active) {
          for (const entry of bSys._active.values()) {
            if (entry.building.id === 'defense_grid') return true;
          }
        }
        return false;
      }
      case 'radiation': {
        // Blokowane przez tech magnetic_shielding
        return tSys?.isResearched('magnetic_shielding') ?? false;
      }
      case 'biological': {
        // Blokowane przez tech medicine
        return tSys?.isResearched('medicine') ?? false;
      }
      default:
        return false;
    }
  }

  // ── Losowanie ───────────────────────────────────────────────────────

  // Losuj zdarzenie ważone, sprawdzając warunki
  _rollEvent(colony) {
    // Filtruj zdarzenia spełniające warunki i nie zablokowane
    const eligible = DRAWABLE_EVENTS.filter(e => {
      try {
        return e.condition(colony);
      } catch {
        return true;
      }
    });

    if (eligible.length === 0) return null;

    const totalW = eligible.reduce((s, e) => s + e.weight, 0);
    let roll = Math.random() * totalW;

    for (const e of eligible) {
      roll -= e.weight;
      if (roll <= 0) return e;
    }

    return eligible[eligible.length - 1];
  }

  // ── Aplikacja zdarzenia ─────────────────────────────────────────────

  // Aplikuj zdarzenie do kolonii
  _triggerEvent(event, planetId) {
    const colMgr = window.KOSMOS?.colonyManager;
    const colony = colMgr?.getColony(planetId);
    if (!colony) return;

    const resSys = colony.resourceSystem;
    const civSys = colony.civSystem;

    // Aplikuj efekty jednorazowe
    for (const fx of event.effects) {
      switch (fx.type) {
        case 'resource':
          if (resSys && fx.amount > 0) {
            resSys.receive({ [fx.resource]: fx.amount });
          } else if (resSys && fx.amount < 0) {
            resSys.spend({ [fx.resource]: Math.abs(fx.amount) });
          }
          break;

        case 'prosperity': {
          // Dodaj bonus prosperity (lub jednorazowy gdy brak duration)
          const duration = event.duration > 0 ? event.duration : 3;
          const sourceId = `event_${event.id}_${Date.now()}`;
          colony.prosperitySystem?.addEventBonus(sourceId, fx.delta, duration);
          break;
        }

        case 'pop':
          if (civSys) {
            if (fx.delta > 0) {
              civSys.population += fx.delta;
              EventBus.emit('civ:popBorn', { population: civSys.population });
            } else if (fx.delta < 0 && civSys.population > 1) {
              civSys.population = Math.max(1, civSys.population + fx.delta);
              EventBus.emit('civ:popDied', { cause: event.id, population: civSys.population });
            }
          }
          break;

        case 'building_damage':
          this._damageBuildings(colony, fx.count, fx.chance ?? 1.0);
          break;

        // production — obsługiwane przez aktywne zdarzenie (duration > 0)
        case 'production':
          break;
      }
    }

    // Dodaj do aktywnych jeśli ma czas trwania
    if (event.duration > 0) {
      this._activeEvents.push({
        event,
        planetId,
        startYear:      this._gameYear,
        remainingYears: event.duration,
      });
    }

    // Chain event
    if (event.chainNext) {
      this._chainQueue.push({
        eventId:     event.chainNext,
        planetId,
        triggerYear: this._gameYear + (event.chainDelay ?? 5),
      });
    }

    // Emituj powiadomienie
    EventBus.emit('randomEvent:occurred', {
      event,
      planetId,
      colonyName: colony.name,
    });
  }

  // Zniszcz N losowych budynków na kolonii (bezpośrednio na BuildingSystem kolonii)
  _damageBuildings(colony, count, chance) {
    const bSys = colony?.buildingSystem;
    if (!bSys) return;

    // Zbierz budynki tej kolonii (bez Stolicy i budynków obronnych)
    const candidates = [];
    for (const [activeKey, entry] of bSys._active) {
      if (entry.building.isCapital || entry.building.isColonyBase) continue;
      if (entry.building.id === 'defense_tower' || entry.building.id === 'defense_grid') continue;
      candidates.push({ activeKey, entry });
    }

    if (candidates.length === 0) return;

    for (let i = 0; i < count && candidates.length > 0; i++) {
      if (Math.random() > chance) continue;
      const idx = Math.floor(Math.random() * candidates.length);
      const { activeKey, entry } = candidates.splice(idx, 1)[0];
      const level = entry.level ?? 1;

      if (level > 1) {
        // Downgrade o 1 level (bez zwrotu surowców — katastrofa)
        entry.level = level - 1;
        entry.baseRates = bSys._calcBaseRates(entry.building, { r: 0, type: 'plains', key: activeKey }, entry.level);
        entry.effectiveRates = bSys._applyTechMultipliers(entry.baseRates, entry.building, activeKey);
        const pid = entry.producerId ?? `building_${activeKey}`;
        if (bSys.resourceSystem) {
          bSys.resourceSystem.registerProducer(pid, entry.effectiveRates);
        }
      } else {
        // Pełne zniszczenie Lv1 budynku (bezpośrednio — unika cross-colony bleed)
        if (bSys.resourceSystem) {
          bSys.resourceSystem.removeProducer(entry.producerId ?? `building_${activeKey}`);
        }
        if (entry.housing > 0 && bSys.civSystem) {
          bSys.civSystem.removeHousing(entry.housing);
        }
        const popCost = entry.popCost ?? 0;
        if (popCost > 0 && bSys.civSystem) {
          bSys.civSystem.changeEmployment(-popCost);
        }
        bSys._active.delete(activeKey);
      }
    }
  }
}
