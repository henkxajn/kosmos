// GameState — reactive store dla NOWYCH domen (empires, intel, diplomacy, wars, battles, invasions)
//
// Jedyne źródło prawdy dla wojny/dyplomacji/AI obcych.
// Stare systemy (ColonyManager, BuildingSystem, ResourceSystem itd.) pozostają nietknięte
// i komunikują się jak dotąd (EventBus + window.KOSMOS).
//
// Mutacje — WYŁĄCZNIE przez intent methods systemów-właścicieli (np. EmpireRegistry.changeHostility),
// NIE przez raw set() z UI. gameState.set() jest niskopoziomowym API; wysokopoziomowe
// reguły biznesowe i audit trail ("reason") należą do systemów.
//
// Subskrypcje — ścieżki z prostym wildcardem '*' dla jednego segmentu:
//   'empires.*'              → dowolne imperium
//   'empires.*.hostility'    → pole hostility dowolnego imperium
//   'empires.emp_01.*'       → dowolne pole konkretnego imperium
// Dopasowanie głębsze (np. 'diplomacy.*.treaties.0') również działa — '*' łapie jeden segment.

import EventBus from './EventBus.js';

// Domyślny kształt stanu — nowe domeny inicjalizujemy jako puste obiekty
function createDefaultState() {
  return {
    empires:    {},  // empireId → { id, name, archetype, personality, homeSystemId, colonies, tech, military, resources, hostility }
    intel:      {},  // empireId → { level, knownTech, knownMilitary, knownColonies }
    diplomacy:  { relations: {} }, // `${a}_${b}` → { state, hostility, trust, treaties, lastIncidents }
    wars:       {},  // warId → { participants, casusBelli, goals, fronts, exhaustion, startYear }
    battles:    {},  // battleId → { location, fleets, result, timeline }
    invasions:  {},  // invasionId → { planetId, aggressor, defender, landedTroops, battlesOnHex }
    minefields: {},  // planetId → { `${q}_${r}` → { ownerId, damage, laidBy, q, r } } — Ground Unit System
    pois:       {},  // M2b — POIRegistry (poiId → poi object); init w createDefaultState żeby restore() nie pomijał klucza
    tradeOrders:      [],  // S3.5b — Order Board: kolejka zleceń kupna/sprzedaży z AI (init by restore() nie pominął klucza)
    crossEmpireTrade: {},  // S3.5b — empireId → bool: toggle auto-handlu cywilnego cross-empire (brak klucza ⇒ ON)
  };
}

class GameState {
  constructor() {
    this._state = createDefaultState();
    // Subskrypcje: lista { pattern, regex, cb }
    this._subs = [];
  }

  // Odczyt wartości po ścieżce kropkowanej ('empires.emp_01.hostility')
  // Zwraca undefined gdy ścieżka nie istnieje (defensywnie, żeby UI nie rzucało)
  get(path) {
    if (!path) return this._state;
    const parts = path.split('.');
    let cur = this._state;
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[p];
    }
    return cur;
  }

  // Zapis wartości po ścieżce — tworzy brakujące obiekty po drodze.
  // reason — krótki opis przyczyny (do DebugLog/audit trail).
  // UWAGA: niskopoziomowe — systemy powinny udostępniać intent methods zamiast wołać bezpośrednio.
  set(path, value, reason = '') {
    if (!path) return;
    const parts = path.split('.');
    const last = parts.pop();
    let cur = this._state;
    for (const p of parts) {
      if (cur[p] == null || typeof cur[p] !== 'object') {
        cur[p] = {};
      }
      cur = cur[p];
    }
    const oldValue = cur[last];
    cur[last] = value;

    this._notifySubscribers(path, value, oldValue, reason);
    EventBus.emit('gameState:changed', { path, value, oldValue, reason });
  }

  // Subskrypcja po wzorcu ścieżki ('*' = jeden segment)
  // Zwraca funkcję unsubscribe.
  subscribe(pathPattern, cb) {
    const regex = this._patternToRegex(pathPattern);
    const entry = { pattern: pathPattern, regex, cb };
    this._subs.push(entry);
    return () => {
      const idx = this._subs.indexOf(entry);
      if (idx >= 0) this._subs.splice(idx, 1);
    };
  }

  // Pełna kopia stanu (defensywna — mutacja nie wpłynie na store)
  snapshot() {
    return structuredClone(this._state);
  }

  // Serializacja do save'a — zwraca surowe referencje (JSON.stringify w SaveSystem je klonuje).
  // Battles: prune do ostatnich MAX_BATTLES po year. Stare referencje (vessel.lastBattleId)
  // grace fail przez getBattleRecord → null (FleetManagerOverlay i WarOverlay obsluguja brak).
  // Bez prune battles rosly bez konca (timeline per round) → save quota crash po wielu wojnach.
  serialize() {
    const MAX_BATTLES = 50;
    const battles = this._state.battles ?? {};
    const ids = Object.keys(battles);
    if (ids.length <= MAX_BATTLES) return this._state;

    const sorted = ids
      .map(id => ({ id, year: battles[id]?.year ?? 0 }))
      .sort((a, b) => b.year - a.year)
      .slice(0, MAX_BATTLES);
    const kept = {};
    for (const { id } of sorted) kept[id] = battles[id];
    return { ...this._state, battles: kept };
  }

  // Przywrócenie z save'a — merge z domyślnym kształtem, żeby brakujące domeny miały defaults
  restore(data) {
    if (!data || typeof data !== 'object') {
      this._state = createDefaultState();
      return;
    }
    const def = createDefaultState();
    const merged = { ...def };
    for (const k of Object.keys(def)) {
      merged[k] = data[k] ?? def[k];
    }
    this._state = merged;
  }

  // Reset (nowa gra) — czyści wszystko
  reset() {
    this._state = createDefaultState();
    this._subs = [];
  }

  // ── Wewnętrzne ────────────────────────────────────────────────

  _notifySubscribers(path, value, oldValue, reason) {
    for (const sub of this._subs) {
      if (sub.regex.test(path)) {
        try {
          sub.cb({ path, value, oldValue, reason });
        } catch (err) {
          console.error(`[GameState] Błąd w subskrybencie "${sub.pattern}":`, err);
        }
      }
    }
  }

  // Konwertuje 'empires.*.hostility' → /^empires\.[^.]+\.hostility$/
  _patternToRegex(pattern) {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // escape regex specials
      .replace(/\*/g, '[^.]+');              // '*' łapie jeden segment
    return new RegExp(`^${escaped}$`);
  }
}

// Singleton — jeden GameState dla całej gry
export default new GameState();
