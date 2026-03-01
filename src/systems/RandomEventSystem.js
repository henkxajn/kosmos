// RandomEventSystem — system zdarzeń losowych
//
// Co pewien czas losuje zdarzenie z RandomEventsData i aplikuje efekty.
// Zdarzenia mogą dotyczyć konkretnej kolonii lub całego imperium.
// Obsługuje chain events (zdarzenia łańcuchowe z opóźnieniem).
//
// Komunikacja:
//   Nasłuchuje: 'time:tick'     → sprawdzenie czy wylosować zdarzenie
//   Emituje:    'randomEvent:occurred' { event, colony, effects }
//               'randomEvent:expired'  { event }

import EventBus from '../core/EventBus.js';
import { RANDOM_EVENTS, DRAWABLE_EVENTS, TOTAL_WEIGHT } from '../data/RandomEventsData.js';

// Minimalna przerwa między zdarzeniami (lata gry)
const MIN_COOLDOWN = 8;
const MAX_COOLDOWN = 25;

// Szansa na zdarzenie per sprawdzenie (per rok gry, po cooldownie)
const EVENT_CHANCE = 0.15;  // 15% na rok

export class RandomEventSystem {
  constructor() {
    // System wstrzymany — zdarzenia losowe wyłączone do czasu dopracowania
    this.disabled = true;

    // Cooldown — ile lat do następnego możliwego zdarzenia
    this._cooldown = MIN_COOLDOWN + Math.random() * (MAX_COOLDOWN - MIN_COOLDOWN);
    this._accumYears = 0;

    // Aktywne zdarzenia z czasem trwania
    this._activeEvents = [];

    // Zaplanowane chain events
    this._chainQueue = [];

    // Rok gry
    this._gameYear = 0;

    // Nasłuch czasu
    EventBus.on('time:tick', ({ deltaYears }) => this._update(deltaYears));
    EventBus.on('time:display', ({ gameTime }) => { this._gameYear = gameTime; });
  }

  // ── API publiczne ───────────────────────────────────────────────────────

  // Aktywne zdarzenia z efektami
  getActiveEvents() {
    return [...this._activeEvents];
  }

  // Mnożnik produkcji dla danego zasobu z aktywnych zdarzeń
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
  }

  // ── Prywatne ──────────────────────────────────────────────────────────

  _update(deltaYears) {
    if (this.disabled) return;
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

    // Cooldown
    this._cooldown -= 1;
    if (this._cooldown > 0) return;

    // Szansa na zdarzenie
    if (Math.random() > EVENT_CHANCE) return;

    // Wybierz losową kolonię
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr || colMgr.colonyCount === 0) return;

    const colonies = colMgr.getAllColonies();
    const colony   = colonies[Math.floor(Math.random() * colonies.length)];

    // Losuj zdarzenie ważone
    const event = this._rollEvent(colony);
    if (!event) return;

    // Aplikuj zdarzenie
    this._triggerEvent(event, colony.planetId);

    // Reset cooldown
    this._cooldown = MIN_COOLDOWN + Math.random() * (MAX_COOLDOWN - MIN_COOLDOWN);
  }

  // Losuj zdarzenie ważone, sprawdzając warunki
  _rollEvent(colony) {
    // Filtruj zdarzenia spełniające warunki
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

        case 'morale':
          if (civSys) {
            civSys.morale = Math.max(0, Math.min(100, civSys.morale + fx.delta));
          }
          break;

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
          this._damageBuildings(planetId, fx.count, fx.chance ?? 1.0);
          break;

        case 'hex_change':
          this._changeHexes(planetId, fx.terrain, fx.count);
          break;

        case 'anomaly':
          this._addAnomaly(planetId, fx.anomalyType);
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

  // Zniszcz N losowych budynków na kolonii
  _damageBuildings(planetId, count, chance) {
    const bSys = window.KOSMOS?.buildingSystem;
    if (!bSys) return;

    // Zbierz budynki tej kolonii (bez Stolicy)
    const candidates = [];
    for (const [activeKey, entry] of bSys._active) {
      if (entry.building.isCapital || entry.building.isColonyBase) continue;
      candidates.push({ activeKey, entry });
    }

    if (candidates.length === 0) return;

    for (let i = 0; i < count && candidates.length > 0; i++) {
      if (Math.random() > chance) continue;
      const idx = Math.floor(Math.random() * candidates.length);
      const { activeKey } = candidates.splice(idx, 1)[0];
      // Parsuj q,r z klucza
      const [q, r] = activeKey.split(',').map(Number);
      const fakeTile = { q, r, key: activeKey, buildingId: activeKey, isOccupied: true };
      EventBus.emit('planet:demolishRequest', { tile: fakeTile });
    }
  }

  // Zmień N losowych hexów na dany teren
  _changeHexes(planetId, terrain, count) {
    // To będzie działać gdy globus jest otwarty — zmiana terenu na siatce
    // Efekt wizualny przy następnym otwarciu mapy
    EventBus.emit('randomEvent:hexChange', { planetId, terrain, count });
  }

  // Dodaj anomalię na losowy hex
  _addAnomaly(planetId, anomalyType) {
    EventBus.emit('randomEvent:anomaly', { planetId, anomalyType });
  }
}
