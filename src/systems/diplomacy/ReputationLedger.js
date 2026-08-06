// ReputationLedger — globalna reputacja imperium (WOJNA I POKÓJ 1.0, D1).
//
// Poza rekordami par: gameState.diplomacy.reputation[id] = { aggression, decayPerYear }.
// `aggression` 0-100 rośnie od czynów, które widzi CAŁA galaktyka (niesprowokowana
// wojna, podbój kolonii, zerwany traktat) i pełznie w dół — galaktyka pamięta, ale
// nie wiecznie. Dotyczy TAK SAMO gracza jak AI: 'player' ma tu swój wpis.
//
// ⚠ ZAKRES D1: sam rejestr + zanikanie. NIC nie podnosi jeszcze agresji, a opinia
// NIE czyta reputacji — modyfikator `known_aggressor` przychodzi w D4 razem ze
// swoimi źródłami. Wpinanie go teraz dałoby martwe sprzężenie do zera (audyt R9).
//
// ⚠ Dlaczego initForIds jest obowiązkowe: GameState.restore() merguje wyłącznie
// klucze NAJWYŻSZEGO poziomu, więc `diplomacy` wraca z zapisu w całości — zapis
// sprzed istnienia pod-klucza `reputation` przywróci się bez niego. Ten sam wzór
// co intelSystem.initVesselSubdomain() / poiRegistry.initPOISubdomain().

import gameState from '../../core/GameState.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';

const REPUTATION_PATH = 'diplomacy.reputation';

const DEFAULT_AGGRESSION_DECAY = 1;   // punkty na rok cywilizacyjny
const AGGRESSION_MIN = 0;
const AGGRESSION_MAX = 100;

// Zwracane przez get() gdy wpisu nie ma. Zamrożone — odczyt nigdy nie tworzy
// rekordu, więc nie wolno pozwolić, by ktoś pisał po tym obiekcie.
const NEUTRAL = Object.freeze({ aggression: 0, decayPerYear: DEFAULT_AGGRESSION_DECAY });

export class ReputationLedger {
  constructor(store = gameState) {
    this._store = store;
  }

  _all() { return this._store.get(REPUTATION_PATH) ?? {}; }

  _write(id, rec, reason) { this._store.set(`${REPUTATION_PATH}.${id}`, rec, reason); }

  /** Wpis reputacji, tworząc go gdy brak. */
  ensure(id) {
    if (!id) throw new Error('[ReputationLedger] Brak id');
    const existing = this._all()[id];
    if (existing) return existing;
    const rec = { aggression: 0, decayPerYear: DEFAULT_AGGRESSION_DECAY };
    this._write(id, rec, 'reputation_init');
    return rec;
  }

  /** Wpis albo neutralna wartość domyślna. NIGDY nie zapisuje. */
  get(id) { return this._all()[id] ?? NEUTRAL; }

  getAggression(id) { return this.get(id).aggression ?? 0; }

  /** @returns {number} nowa wartość agresji (clamp 0-100). */
  addAggression(id, delta, reason = '') {
    if (!delta) return this.getAggression(id);
    const rec  = this.ensure(id);
    const next = Math.max(AGGRESSION_MIN, Math.min(AGGRESSION_MAX, (rec.aggression ?? 0) + delta));
    if (next === rec.aggression) return next;
    this._write(id, { ...rec, aggression: next }, reason || `reputation_${delta > 0 ? '+' : ''}${delta}`);
    return next;
  }

  /**
   * Zanikanie agresji. Za tą samą flagą co decay modyfikatorów opinii — w D1
   * i tak bez efektu (nic nie podnosi agresji), ale trzymamy jeden przełącznik
   * na cały silnik zanikania, żeby D2 zapalał go w jednym miejscu.
   * Zapis tylko przy realnej zmianie.
   */
  tick(civDy) {
    if (!(civDy > 0)) return;
    if (!GAME_CONFIG.FEATURES?.diplomacyDecay) return;
    for (const [id, rec] of Object.entries(this._all())) {
      const value = Number(rec?.aggression) || 0;
      if (value <= 0) continue;
      const rate = Number(rec?.decayPerYear) || 0;
      if (rate <= 0) continue;
      const next = Math.max(AGGRESSION_MIN, value - rate * civDy);
      if (next === value) continue;
      this._write(id, { ...rec, aggression: next }, 'reputation_decay');
    }
  }

  /** Zasiew wpisów dla gracza i podanych imperiów (idempotentny). */
  initForIds(ids = []) {
    this.ensure('player');
    for (const id of ids) if (id) this.ensure(id);
  }
}
