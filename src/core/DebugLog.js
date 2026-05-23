// DebugLog — ring buffer eventów dla audit trail AI
//
// Zastępuje command pattern: zamiast trzymać listę komend, podsłuchujemy EventBus
// oraz zmiany GameState i zapisujemy do bufora cyklicznego. Pozwala to na:
//   - eksport historii decyzji AI (JSON)
//   - filtrowanie po typie/imperium/roku (query)
//   - retrospektywny debug "czemu imperium emp_03 wypowiedziało wojnę"
//
// Konsumpcja: window.KOSMOS.debugLog.export() / .query(fn) z konsoli przeglądarki.

import EventBus from './EventBus.js';

// Eventy AI/wojny/dyplomacji, które chcemy zachować w logu jako "kind"
// (poza 'state' ze zmian GameState).
const TRACKED_EVENTS = [
  'empire:created',
  'empire:destroyed',
  'empire:colonyAdded',
  'empire:hostilityChanged',
  'empire:techAdvanced',
  'ai:empireBootstrap',
  'intel:levelChanged',
  'intel:contactEstablished',
  'intel:reportGenerated',
  'diplomacy:relationChanged',
  'diplomacy:treatyOffered',
  'diplomacy:ultimatum',
  'diplomacy:warDeclared',
  'ai:fsmTransition',
  'ai:decision',
  'war:declared',
  'war:fleetMoved',
  'war:peaceSigned',
  'battle:starting',
  'battle:resolved',
  'invasion:launched',
  'invasion:troopsLanded',
  'colony:captured',
];

class DebugLog {
  constructor(maxEntries = 10000) {
    this._buf = [];
    this._max = maxEntries;
    this.attach();
  }

  // Rejestracja subskrypcji na EventBus. Wywoływana w konstruktorze oraz ponownie
  // z GameScene.start() po EventBus.clear() — inaczej singleton zostałby odcięty od eventów.
  attach() {
    EventBus.on('gameState:changed', (data) => this._push('state', data));
    for (const ev of TRACKED_EVENTS) {
      EventBus.on(ev, (data) => this._push(ev, data));
    }
  }

  _push(kind, data) {
    const year = window.KOSMOS?.timeSystem?.gameTime ?? null;
    this._buf.push({ t: Date.now(), year, kind, data });
    if (this._buf.length > this._max) this._buf.shift();
  }

  // Eksport całego bufora jako JSON string (do wklejenia w issue, zapisania do pliku itd.)
  export() {
    return JSON.stringify(this._buf, null, 2);
  }

  // Filtrowanie wpisów — fn(entry) → boolean, lub obiekt { kind, empireId, sinceYear }
  query(filterOrFn) {
    if (typeof filterOrFn === 'function') {
      return this._buf.filter(filterOrFn);
    }
    if (!filterOrFn || typeof filterOrFn !== 'object') return [...this._buf];

    const { kind, empireId, sinceYear, untilYear } = filterOrFn;
    return this._buf.filter(e => {
      if (kind && e.kind !== kind) return false;
      if (empireId && e.data?.empireId !== empireId) return false;
      if (sinceYear != null && (e.year == null || e.year < sinceYear)) return false;
      if (untilYear != null && (e.year == null || e.year > untilYear)) return false;
      return true;
    });
  }

  // Ostatnie N wpisów (domyślnie 50)
  tail(n = 50) {
    return this._buf.slice(-n);
  }

  size() {
    return this._buf.length;
  }

  clear() {
    this._buf = [];
  }
}

// Singleton — jeden DebugLog dla całej gry (subskrybuje EventBus w konstruktorze)
export default new DebugLog();
