// System zaplanowanych zdarzeń — gwarantowane zdarzenie co 3-5 civYears
// Działa równolegle z RandomEventSystem (nie zastępuje go).
//
// Funkcje:
//   - Timer akumulatorowy z losowym interwałem 3-5 civYears
//   - Filtrowanie eventów po warunkach i jednorazowości (once)
//   - Śledzenie tymczasowych efektów produkcyjnych (temp_rate) z auto-usuwaniem
//   - Serializacja/restore stanu (save-safe)
//
// Emituje: 'scheduledEvent:triggered' { event, planetId, colonyName }

import { SCHEDULED_EVENTS } from '../data/ScheduledEventsData.js';
import EventBus from '../core/EventBus.js';

const MIN_INTERVAL = 3;   // lata orbitalne (nie civYears!)
const MAX_INTERVAL = 5;   // lata orbitalne

export class ScheduledEventSystem {
  constructor() {
    this._accumulator = 0;
    this._nextTrigger = this._rollInterval();
    this._firedOnce   = new Set();       // ID eventów once:true już wystrzelonych
    this._tempEffects = [];              // { sourceId, planetId, remainingYears }

    EventBus.on('time:tick', ({ deltaYears, civDeltaYears }) => {
      this._update(deltaYears, civDeltaYears);
    });
  }

  // ── Publiczne API ────────────────────────────────────────────────────

  /** Rejestruj tymczasowy efekt produkcyjny (temp_rate) do odliczania */
  registerTempEffect(sourceId, planetId, durationYears) {
    this._tempEffects.push({ sourceId, planetId, remainingYears: durationYears });
  }

  /** Dev helper: wymuś konkretny event z konsoli */
  forceEvent(eventId) {
    const event = SCHEDULED_EVENTS.find(e => e.id === eventId);
    if (!event) { console.warn(`[ScheduledEvent] Nie znaleziono: ${eventId}`); return false; }

    const colony = this._getHomeColony();
    EventBus.emit('scheduledEvent:triggered', {
      event,
      planetId: colony?.planetId ?? window.KOSMOS?.homePlanet?.id,
      colonyName: colony?.name ?? '???',
    });
    return true;
  }

  // ── Tick ──────────────────────────────────────────────────────────────

  _update(deltaYears, civDeltaYears) {
    if (!window.KOSMOS?.civMode) return;

    // Odliczaj tymczasowe efekty (w civYears — zgodne z ekonomia 4X)
    this._tickTempEffects(civDeltaYears);

    // Akumuluj czas do następnego eventu (w orbitalnych latach — 3-5 lat gry)
    this._accumulator += deltaYears;
    if (this._accumulator < this._nextTrigger) return;

    this._accumulator -= this._nextTrigger;
    this._nextTrigger  = this._rollInterval();
    this._triggerEvent();
  }

  /** Odliczaj i usuwaj wygasłe temp_rate producenty */
  _tickTempEffects(civDeltaYears) {
    for (let i = this._tempEffects.length - 1; i >= 0; i--) {
      const eff = this._tempEffects[i];
      eff.remainingYears -= civDeltaYears;
      if (eff.remainingYears <= 0) {
        // Usuń producenta z ResourceSystem kolonii
        const colony = window.KOSMOS?.colonyManager?.getColony?.(eff.planetId);
        colony?.resourceSystem?.removeProducer?.(eff.sourceId);
        this._tempEffects.splice(i, 1);
      }
    }
  }

  // ── Wybór i emisja eventu ─────────────────────────────────────────────

  _triggerEvent() {
    const colony    = this._getHomeColony();
    const gameState = this._getGameState();

    // Filtruj dostępne eventy
    const available = SCHEDULED_EVENTS.filter(ev => {
      if (ev.once && this._firedOnce.has(ev.id)) return false;
      if (ev.condition && !ev.condition(colony, gameState)) return false;
      return true;
    });

    if (available.length === 0) return;

    // Losuj event
    const event = available[Math.floor(Math.random() * available.length)];
    if (event.once) this._firedOnce.add(event.id);

    EventBus.emit('scheduledEvent:triggered', {
      event,
      planetId: colony?.planetId ?? window.KOSMOS?.homePlanet?.id,
      colonyName: colony?.name ?? '???',
    });
  }

  // ── Helpery ───────────────────────────────────────────────────────────

  _rollInterval() {
    return MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
  }

  _getHomeColony() {
    const homeId = window.KOSMOS?.homePlanet?.id;
    return window.KOSMOS?.colonyManager?.getColony?.(homeId) ?? null;
  }

  _getGameState() {
    return {
      colonyCount:    window.KOSMOS?.colonyManager?.getAllColonies?.()?.length ?? 1,
      factionTension: window.KOSMOS?.factionSystem?.tension ?? 0,
      factionSlider:  window.KOSMOS?.factionSystem?.slider  ?? 50,
      gameYear:       window.KOSMOS?.timeSystem?.gameTime    ?? 0,
    };
  }

  // ── Serializacja ──────────────────────────────────────────────────────

  serialize() {
    return {
      accumulator: this._accumulator,
      nextTrigger: this._nextTrigger,
      firedOnce:   [...this._firedOnce],
      tempEffects: this._tempEffects.map(e => ({
        sourceId:       e.sourceId,
        planetId:       e.planetId,
        remainingYears: e.remainingYears,
      })),
    };
  }

  restore(data) {
    if (!data) return;
    this._accumulator = data.accumulator ?? 0;
    this._nextTrigger = data.nextTrigger ?? this._rollInterval();
    this._firedOnce   = new Set(data.firedOnce ?? []);
    this._tempEffects = (data.tempEffects ?? []).map(e => ({
      sourceId:       e.sourceId,
      planetId:       e.planetId,
      remainingYears: e.remainingYears,
    }));
  }
}
