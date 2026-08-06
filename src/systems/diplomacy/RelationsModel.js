// RelationsModel — stan relacji par imperiów (WOJNA I POKÓJ 1.0, D1).
//
// JEDYNY pisarz gameState.diplomacy.relations. Klucz pary: id posortowane
// leksykalnie i sklejone '__' ('emp_003__player'); gracz to dosłowne 'player'.
// Schemat rekordu:
//   { a, b, opinionModifiers[], tension, status, truceUntilYear,
//     bordersOpen{a,b}, treaties[], memory[], ultimatumStartYear }
//
// PODZIAŁ: ten moduł to WYŁĄCZNIE matematyka stanu — zero eventów, zero polityki.
// Drabina eskalacji, wypowiedzenie wojny, zrywanie traktatów i emisja zdarzeń
// zostają w DiplomacySystem (wchodzą w siebie rekurencyjnie i muszą emitować).
// Analogia: src/utils/StationGroup.js (czysta derywacja) vs SystemPoolService (polityka).
//
// ⚠ GŁOŚNA AWARIA (audyt R12): get() RZUCA przy braku pary. Kod, który został przy
// starym formacie klucza, ma wywalić dev-build, a nie po cichu zwrócić wartość
// domyślną. Defensywne odczyty fasady idą przez getOrNull().
//
// ⚠ ODCZYT NIGDY NIE TWORZY REKORDU. getTension jest wołany per gwiazda per klatka
// (FleetManagerOverlay, mapa Stratcom) — wywoływanie tam ensure() zasypałoby
// EventBus zdarzeniami gameState:changed. Rekordy powstają wyłącznie przy MUTACJI
// oraz w miejscach, które robiły to dotąd (empire:created, intel:contactEstablished,
// initForAllEmpires).

import gameState from '../../core/GameState.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import {
  OPINION_MODIFIERS, MEMORY_MAX, COMBINE,
} from '../../data/OpinionModifierData.js';
import {
  pairKey, sideOf, opinionOf, buildBreakdown,
  upsertModifier, removeModifier, decayModifiers, rampModifiers,
  truceExpired,
} from '../../utils/OpinionMath.js';

const RELATIONS_PATH = 'diplomacy.relations';

export class RelationsModel {
  /**
   * @param {Object} store  — reactive store (domyślnie singleton gameState)
   * @param {Function} yearFn — bieżący rok gry (wstrzykiwany dla testów headless)
   */
  constructor(store = gameState, yearFn = () => window.KOSMOS?.timeSystem?.gameTime ?? 0) {
    this._store  = store;
    this._yearFn = yearFn;
    // Licznik id wpisów pamięci — lokalny, NIE serializowany (id muszą być unikalne
    // tylko w obrębie sesji: nic ich nie trzyma między zapisami).
    this._memSeq = 0;
  }

  _year() { return Number(this._yearFn()) || 0; }

  _all() { return this._store.get(RELATIONS_PATH) ?? {}; }

  _write(key, rel, reason) { this._store.set(`${RELATIONS_PATH}.${key}`, rel, reason); }

  // ── Klucze / dostęp ───────────────────────────────────────────────────────

  /** Kanoniczny klucz pary. Waliduje OBA id (rzuca na klucz podany zamiast id). */
  key(a, b) { return pairKey(a, b); }

  has(a, b) { return !!this._all()[this.key(a, b)]; }

  /** Rekord albo null. NIE tworzy. */
  getOrNull(a, b) { return this._all()[this.key(a, b)] ?? null; }

  /** Rekord albo RZUCA — dla wewnętrznych ścieżek, które zakładają istnienie pary. */
  get(a, b) {
    const key = this.key(a, b);
    const rel = this._all()[key];
    if (!rel) throw new Error(`[RelationsModel] Brak relacji dla pary '${key}'`);
    return rel;
  }

  /** Rekord, tworząc go przy pierwszej mutacji. */
  ensure(a, b) {
    const key = this.key(a, b);
    const existing = this._all()[key];
    if (existing) return existing;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const rel = {
      a: lo,
      b: hi,
      opinionModifiers:   [],
      tension:            0,
      status:             'peace',
      truceUntilYear:     null,
      // Konsument w D3 (granice + incydenty naruszenia). Zasiewane tutaj i w migracji,
      // bo domyślnej wartości per strona nie da się bezpiecznie dopowiedzieć później.
      bordersOpen:        { a: true, b: true },
      treaties:           [],
      memory:             [],
      ultimatumStartYear: null,
    };
    this._write(key, rel, 'relation_init');
    return rel;
  }

  /** Wszystkie pary jako [{ key, ...rel }]. */
  listPairs() {
    return Object.entries(this._all()).map(([key, rel]) => ({ key, ...rel }));
  }

  /** Pary, w których uczestniczy dane id. */
  listPairsWith(id) {
    return this.listPairs().filter(r => r.a === id || r.b === id);
  }

  // ── Opinia ────────────────────────────────────────────────────────────────

  /** Opinia `ofId` o `aboutId`. Brak pary → 0. Nie tworzy rekordu. */
  getOpinion(ofId, aboutId) {
    return opinionOf(this.getOrNull(ofId, aboutId), ofId);
  }

  /** Rozbicie do UI — [{ id, labelKey, value, yearsLeft, persistent }]. */
  getBreakdown(ofId, aboutId) {
    return buildBreakdown(this.getOrNull(ofId, aboutId), ofId, OPINION_MODIFIERS);
  }

  /**
   * Dodaje / odświeża modyfikator po stronie `ofId`. Braki w `opts` uzupełnia katalog.
   * @param {Object} opts — { value?, decayPerYear?, persistent?, combine?, source? }
   * @returns {number} nowa opinia `ofId` o `aboutId`
   * ⚠ Rzuca na nieznane modId — literówka w nazwie modyfikatora nie może zniknąć po cichu.
   */
  addModifier(ofId, aboutId, modId, opts = {}) {
    const def = OPINION_MODIFIERS[modId];
    if (!def) throw new Error(`[RelationsModel] Nieznany modyfikator opinii: '${modId}'`);
    const rel   = this.ensure(ofId, aboutId);
    const owner = sideOf(rel, ofId);
    const entry = {
      id:           modId,
      owner,
      value:        opts.value        ?? def.defaultValue,
      decayPerYear: opts.decayPerYear ?? def.decayPerYear,
      persistent:   opts.persistent   ?? def.persistent ?? false,
      year:         this._year(),
      source:       opts.source       ?? null,
    };
    const combine = opts.combine ?? def.combine ?? COMBINE.REFRESH;
    const next = { ...rel, opinionModifiers: upsertModifier(rel.opinionModifiers, entry, combine) };
    this._write(this.key(ofId, aboutId), next, `opinion_${modId}`);
    return opinionOf(next, ofId);
  }

  /** Zdejmuje modyfikator (teardown źródła: traktat, koniec wojny). */
  removeModifier(ofId, aboutId, modId) {
    const rel = this.getOrNull(ofId, aboutId);
    if (!rel) return false;
    const owner = sideOf(rel, ofId);
    const next  = removeModifier(rel.opinionModifiers, modId, owner);
    if (next === rel.opinionModifiers) return false;
    this._write(this.key(ofId, aboutId), { ...rel, opinionModifiers: next }, `opinion_remove_${modId}`);
    return true;
  }

  hasModifier(ofId, aboutId, modId) {
    const rel = this.getOrNull(ofId, aboutId);
    if (!rel) return false;
    const owner = sideOf(rel, ofId);
    return (rel.opinionModifiers ?? []).some(m => m?.id === modId && m?.owner === owner);
  }

  // ── Napięcie ──────────────────────────────────────────────────────────────

  getTension(a, b) { return this.getOrNull(a, b)?.tension ?? 0; }

  /** Ustawia napięcie (clamp 0-100). Zwraca wartość faktycznie zapisaną. */
  setTension(a, b, value, reason = '') {
    const rel  = this.ensure(a, b);
    const next = Math.max(0, Math.min(100, Number(value) || 0));
    if (next === rel.tension) return next;
    this._write(this.key(a, b), { ...rel, tension: next }, reason || 'tension');
    return next;
  }

  // ── Status / rozejm ───────────────────────────────────────────────────────

  getStatus(a, b) { return this.getOrNull(a, b)?.status ?? 'peace'; }

  /**
   * Ustawia status ('peace' | 'war' | 'truce'). `truceUntilYear` podajemy jawnie —
   * przejście na cokolwiek innego niż rozejm kasuje licznik.
   */
  setStatus(a, b, status, { truceUntilYear = null } = {}, reason = '') {
    const rel = this.ensure(a, b);
    this._write(this.key(a, b), { ...rel, status, truceUntilYear }, reason || `status_${status}`);
    return status;
  }

  getTruceUntilYear(a, b) { return this.getOrNull(a, b)?.truceUntilYear ?? null; }

  // ── Ultimatum (drabina eskalacji — port 1:1 ze starego hostility) ─────────

  getUltimatumStart(a, b) { return this.getOrNull(a, b)?.ultimatumStartYear ?? null; }

  setUltimatumStart(a, b, year, reason = '') {
    const rel = this.ensure(a, b);
    if (rel.ultimatumStartYear === year) return;
    this._write(this.key(a, b), { ...rel, ultimatumStartYear: year }, reason || 'ultimatum');
  }

  // ── Pamięć (pierścień incydentów — dowody dla casus belli i UI) ───────────

  addMemory(a, b, type, payload = {}) {
    const rel   = this.ensure(a, b);
    const year  = this._year();
    const entry = { id: `${type}_${Math.round(year * 100)}_${this._memSeq++}`, type, year, payload };
    const memory = [...(rel.memory ?? []), entry];
    while (memory.length > MEMORY_MAX) memory.shift();
    this._write(this.key(a, b), { ...rel, memory }, `memory_${type}`);
    return entry;
  }

  /** Ostatnie `limit` wpisów pamięci (najstarszy → najnowszy). */
  getMemory(a, b, limit = MEMORY_MAX) {
    const memory = this.getOrNull(a, b)?.memory ?? [];
    return limit >= memory.length ? memory.slice() : memory.slice(-limit);
  }

  // ── Traktaty ──────────────────────────────────────────────────────────────

  getTreaties(a, b) { return this.getOrNull(a, b)?.treaties ?? []; }

  hasTreaty(a, b, treatyId) {
    return this.getTreaties(a, b).some(t => t?.id === treatyId);
  }

  /** Dodaje traktat (idempotentnie po id). @returns {boolean} czy dopisano. */
  addTreaty(a, b, treaty) {
    if (!treaty?.id) return false;
    const rel = this.ensure(a, b);
    if ((rel.treaties ?? []).some(t => t?.id === treaty.id)) return false;
    const treaties = [...(rel.treaties ?? []), { ...treaty, signedYear: this._year() }];
    this._write(this.key(a, b), { ...rel, treaties }, `treaty_${treaty.id}`);
    return true;
  }

  /** Usuwa traktat. @returns {boolean} czy coś usunięto. */
  removeTreaty(a, b, treatyId) {
    const rel = this.getOrNull(a, b);
    if (!rel) return false;
    const treaties = (rel.treaties ?? []).filter(t => t?.id !== treatyId);
    if (treaties.length === (rel.treaties ?? []).length) return false;
    this._write(this.key(a, b), { ...rel, treaties }, `treaty_broken_${treatyId}`);
    return true;
  }

  // ── Granice (schemat gotowy w D1, konsument w D3) ─────────────────────────

  /** Czy `ofId` wpuszcza cywilne statki `aboutId`. Brak danych → otwarte. */
  getBordersOpen(ofId, aboutId) {
    const rel = this.getOrNull(ofId, aboutId);
    if (!rel) return true;
    return rel.bordersOpen?.[sideOf(rel, ofId)] ?? true;
  }

  setBordersOpen(ofId, aboutId, open) {
    const rel   = this.ensure(ofId, aboutId);
    const side  = sideOf(rel, ofId);
    const flags = { a: true, b: true, ...(rel.bordersOpen ?? {}) };
    if (flags[side] === !!open) return;
    flags[side] = !!open;
    this._write(this.key(ofId, aboutId), { ...rel, bordersOpen: flags }, 'borders');
  }

  // ── Tick (sama matematyka stanu; polityka i eventy w DiplomacySystem) ─────

  /**
   * Narastanie + zanikanie modyfikatorów, raz na rok cywilizacyjny.
   *
   * Ramp działa ZAWSZE (zastępuje stare `_tickTreaties` +1/rok — zachowanie, które
   * parytet D1 ma utrzymać). Decay jest za flagą FEATURES.diplomacyDecay, domyślnie
   * WYŁĄCZONĄ: stary `trust` nie zanikał w ogóle, więc włączenie zanikania w D1
   * zmieniłoby balans (emisariusze przestają wystarczać do sojuszu, wczytany zapis
   * neutralizuje się w kilkanaście lat). Flaga zapala się w D2 razem z Acceptance Engine.
   *
   * Zapis TYLKO gdy tablica faktycznie się zmieniła — inaczej co rok leciałby
   * gameState:changed na każdą parę.
   */
  tickModifiers(civDy) {
    if (!(civDy > 0)) return;
    const decayOn = !!GAME_CONFIG.FEATURES?.diplomacyDecay;
    for (const rel of this.listPairs()) {
      const mods = rel.opinionModifiers ?? [];
      if (mods.length === 0) continue;
      let next = rampModifiers(mods, civDy, OPINION_MODIFIERS);
      if (decayOn) next = decayModifiers(next, civDy);
      if (next === mods) continue;
      const { key, ...rec } = rel;
      this._write(key, { ...rec, opinionModifiers: next }, 'opinion_tick');
    }
  }

  /**
   * RAPORTUJE pary, którym właśnie wygasł rozejm — nic nie zmienia. Przejście
   * status→'peace' (+ modyfikator recent_war, + event) należy do DiplomacySystem.
   * @returns {Array<{key, a, b}>}
   */
  tickTruces(year) {
    const out = [];
    for (const rel of this.listPairs()) {
      if (rel.status !== 'truce') continue;
      if (!truceExpired(rel.truceUntilYear, year)) continue;
      out.push({ key: rel.key, a: rel.a, b: rel.b });
    }
    return out;
  }
}
