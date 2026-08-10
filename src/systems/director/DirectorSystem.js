// DirectorSystem — silnik reguł ReactionDirectora (workstream C, Slice 1, commit S1).
//
// Deklaratywne reguły `trigger → guard → roll → delay → response`, parametryzowane
// osobowością archetypu, z cooldownem i eskalacją. Dane w `src/data/DirectorRuleData.js`,
// matematyka w `src/utils/DirectorRuleMath.js`, nazwane zachowania w `DirectorRegistry.js`.
// Ten plik trzyma WYŁĄCZNIE stan i przepływ decyzji.
//
// ⚠ S1: silnik STOI SAMODZIELNIE — nic w `src/systems`/`src/ui` go jeszcze nie
// instancjonuje, a katalog reguł jest pusty (wzór E1 z fazy D2: najpierw kontrakt
// i testy, potem konsumenci). Wpięcie w tick dochodzi razem z pierwszą regułą.
//
// ⚠ TRZY ZASADY, KTÓRE POCHODZĄ Z POMIARU, NIE Z GUSTU (commit S0):
//
//  1. GŁOŚNA AWARIA (audyt R12). Brak kolaboratora albo nieznana nazwa w katalogu RZUCA.
//     Żadnego `window.KOSMOS?.x?.y?.()`. Cały workstream C istnieje dlatego, że
//     `EconAI`/`MilitaryAI` przez wiele wersji „działały" jako ciche zera; ta sama
//     architektura tutaj dałaby ten sam wynik — reguły, które nigdy nie odpalają,
//     i nikt tego nie zauważa.
//
//  2. PIERWSZY KONSUMENT, NIE DRUGI. Pomiar S0 (V4) pokazał, że jedyny istniejący
//     konsument `startShipBuild` po stronie AI (`EmpireLogisticsSystem`) nie odpalił
//     ANI RAZU w 4 seedach × 400 lat cyw. Director jest PIERWSZYM realnym użytkownikiem
//     tej ścieżki, więc niczego po niej nie zakłada i wszystko sprawdza sam.
//
//  3. ZAPIS WSADOWY. Każdy `gameState.set()` emituje `gameState:changed`, a `DebugLog`
//     wpycha to do ringu 10 000 wpisów. Licznik bity co tick × imperium wypłukałby
//     ścieżkę audytu AI, którą Director ma WZMACNIAĆ. Piszemy tylko przy realnej zmianie.

import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { DIRECTOR_RULES } from '../../data/DirectorRuleData.js';
import { DirectorProbes, DirectorGuards, DirectorActions } from './DirectorRegistry.js';
import {
  rollFires, personalityMultiplier, isOnCooldown, isWithinEscalationWindow,
  validateCatalog, DEFAULT_ROLL,
} from '../../utils/DirectorRuleMath.js';

/** Klucz stanu per (reguła, imperium). */
const stateKey = (ruleId, empireId) => `${ruleId}|${empireId}`;

/** Pusty rekord reguły — WSZYSTKIE pola fałszywe/zerowe (warunek „v100 bez migracji"). */
const emptyRuleState = () => ({
  attempts: 0, lastFiredYear: null, firedOnce: false,
  escalations: 0, lastEscalationYear: null,
});

export class DirectorSystem {
  constructor({ catalog = DIRECTOR_RULES } = {}) {
    /** @type {Record<string, object>} */
    this._catalog = catalog;

    // Katalog waliduje się PRZY STARCIE, nie przy pierwszym odpaleniu reguły —
    // inaczej literówka w rzadkiej regule ujawniłaby się po godzinie gry.
    const problems = validateCatalog(this._catalog);
    if (Object.keys(problems).length > 0) {
      throw new Error(`[DirectorSystem] wadliwy katalog reguł: ${JSON.stringify(problems)}`);
    }
    // Nazwy muszą istnieć w rejestrach — to jest bramka, przez którą nie przejdzie
    // reguła wskazująca akcję, której nikt nie zaimplementował.
    this._assertNamesResolvable();

    this._eventUnsubs = [];
    /** Bufor faktów ze zdarzeń: `${ruleId}|${empireId}` → payload (zjadany w ticku). */
    this._eventFacts = new Map();
    this._subscribeEventTriggers();
  }

  // ── Stan (gameState.director) ─────────────────────────────────────────────

  /**
   * Zapewnia kształt `gameState.director` PO restore.
   *
   * ⚠ Wołane z GameScene od pierwszego commita — `GameState.restore()` podmienia domenę
   * najwyższego poziomu W CAŁOŚCI, więc pod-klucz dodany w Slice 2/3 nie zostałby
   * uzupełniony w starym zapisie. Ten hook sprawia, że przyszłe pod-klucze NIE wymagają
   * bumpu wersji. Precedens: `IntelSystem.initVesselSubdomain`, `POIRegistry.initPOISubdomain`.
   */
  static initSubdomain() {
    const dir = gameState.get('director') ?? {};
    if (!dir.rules)   gameState.set('director.rules', {}, 'director_init');
    if (!dir.pending) gameState.set('director.pending', {}, 'director_init');
  }

  _ruleState(ruleId, empireId) {
    return gameState.get(`director.rules.${stateKey(ruleId, empireId)}`) ?? emptyRuleState();
  }

  /** Zapis TYLKO przy realnej zmianie (zasada 3 — ring DebugLoga). */
  _writeRuleState(ruleId, empireId, next, reason) {
    const key = stateKey(ruleId, empireId);
    const cur = gameState.get(`director.rules.${key}`);
    if (cur && JSON.stringify(cur) === JSON.stringify(next)) return;
    gameState.set(`director.rules.${key}`, next, reason);
  }

  // ── Kolaboratorzy — GŁOŚNO (zasada 1) ─────────────────────────────────────

  _require(name) {
    const dep = window.KOSMOS?.[name];
    if (!dep) throw new Error(`[DirectorSystem] brak kolaboratora \`window.KOSMOS.${name}\``);
    return dep;
  }

  _year() {
    const ts = this._require('timeSystem');
    return ts.gameTime ?? 0;   // lata WYŚWIETLANE
  }

  _assertNamesResolvable() {
    for (const rule of Object.values(this._catalog)) {
      if (rule.trigger?.kind === 'poll') DirectorProbes.resolve(rule.trigger.probe);
      for (const g of rule.guard ?? []) DirectorGuards.resolve(g);
      DirectorActions.resolve(rule.response.action);
      if (rule.escalatesTo && !this._catalog[rule.escalatesTo]) {
        throw new Error(`[DirectorSystem] reguła "${rule.id}" eskaluje do nieistniejącej "${rule.escalatesTo}"`);
      }
    }
  }

  // ── Wyzwalacze zdarzeniowe ────────────────────────────────────────────────

  _subscribeEventTriggers() {
    for (const rule of Object.values(this._catalog)) {
      if (rule.trigger?.kind !== 'event') continue;
      const evt = rule.trigger.on;
      // Zdarzenie tylko ZBIERA fakt; decyzja zapada w ticku (podpisana decyzja 1).
      // Dzięki temu kolejność zdarzeń nie zmienia wyniku, a cooldowny mają jeden punkt oceny.
      const handler = (payload) => this._noteEventFact(rule, payload);
      EventBus.on(evt, handler);
      this._eventUnsubs.push(() => EventBus.off(evt, handler));
    }
  }

  _noteEventFact(rule, payload) {
    const empireId = payload?.empireId;
    if (!empireId) return;
    const where = rule.trigger.where ?? null;
    if (where && !Object.entries(where).every(([k, v]) => payload?.[k] === v)) return;
    this._eventFacts.set(stateKey(rule.id, empireId), payload ?? {});
  }

  // ── Tick ──────────────────────────────────────────────────────────────────

  /**
   * Ocena wszystkich reguł dla JEDNEGO imperium. Wołane raz na krok
   * `AlienCivSystem._tickAll` (1 krok = 1 rok cywilizacyjny = 1/12 roku wyświetlanego).
   *
   * ⚠ Pomiar S0/V1a: każdy krok przechodzi po WSZYSTKICH imperiach, więc koszt to
   * `reguły × imperia` na krok — nie `reguły`.
   *
   * @param {string} empireId
   * @param {object} empire
   */
  tickEmpire(empireId, empire) {
    if (!GAME_CONFIG.FEATURES?.reactionDirector) return;
    const year = this._year();
    this._firePending(empireId, year);
    for (const rule of Object.values(this._catalog)) {
      try {
        this._evaluate(rule, empireId, empire, year);
      } catch (e) {
        // Reguła nie może zabić ticku CAŁEGO AI — ale ma krzyczeć, nie milczeć.
        console.error(`[DirectorSystem] reguła "${rule.id}" (${empireId}) wywaliła się:`, e);
      }
    }
  }

  _evaluate(rule, empireId, empire, year) {
    const st = this._ruleState(rule.id, empireId);

    if (rule.cooldown?.once && st.firedOnce) return;
    if (rule.cooldown?.years && isOnCooldown(st.lastFiredYear, year, rule.cooldown.years)) return;
    if (gameState.get(`director.pending.${stateKey(rule.id, empireId)}`)) return;   // odpowiedź już w drodze

    const ctx = { empireId, empire, year, ruleId: rule.id };

    // 1. TRIGGER
    let fact = null;
    if (rule.trigger.kind === 'poll') {
      const value = DirectorProbes.resolve(rule.trigger.probe)(ctx);
      if (rule.trigger.gte != null && !(Number(value) >= Number(rule.trigger.gte))) return;
      fact = { value };
    } else {
      const key = stateKey(rule.id, empireId);
      if (!this._eventFacts.has(key)) return;
      fact = this._eventFacts.get(key);
      this._eventFacts.delete(key);
    }

    // 2. GUARD
    for (const name of rule.guard ?? []) {
      if (!DirectorGuards.resolve(name)({ ...ctx, fact })) return;
    }

    // 3. ROLL (kumulatywny, w latach WYŚWIETLANYCH — decyzja 2)
    const mult = rule.personalityMod
      ? personalityMultiplier(empire?.personality?.[rule.personalityMod.axis], rule.personalityMod)
      : 1;

    if (rule.roll) {
      const attempts = (st.attempts ?? 0) + 1;
      const fired = rollFires(rule.id, empireId, attempts, rule.roll ?? DEFAULT_ROLL, mult);
      this._writeRuleState(rule.id, empireId, { ...st, attempts }, 'director_roll');
      if (!fired) return;
    }

    // 4. ESKALACJA — powtórka w oknie przełącza na regułę wyższego szczebla.
    let effective = rule;
    if (rule.escalatesTo && isWithinEscalationWindow(st.lastFiredYear, year, rule.escalationWindowYears)) {
      effective = this._catalog[rule.escalatesTo];
    }

    // 5. DELAY / RESPONSE
    const after = {
      ...this._ruleState(rule.id, empireId),
      lastFiredYear: year,
      firedOnce: true,
      escalations: effective !== rule ? (st.escalations ?? 0) + 1 : (st.escalations ?? 0),
      lastEscalationYear: effective !== rule ? year : (st.lastEscalationYear ?? null),
    };
    this._writeRuleState(rule.id, empireId, after, 'director_fired');

    const delay = Number(effective.delay ?? 0);
    if (delay > 0) {
      gameState.set(`director.pending.${stateKey(rule.id, empireId)}`, {
        action: effective.response.action,
        params: effective.response.params ?? {},
        fireAtYear: year + delay,
      }, 'director_delay');
      EventBus.emit('director:ruleQueued', { ruleId: rule.id, empireId, fireAtYear: year + delay });
      return;
    }

    this._runAction(effective.response.action, ctx, effective.response.params ?? {}, fact);
  }

  /** Odpala odroczone odpowiedzi, których czas nadszedł. */
  _firePending(empireId, year) {
    const pending = gameState.get('director.pending') ?? {};
    for (const [key, entry] of Object.entries(pending)) {
      if (!key.endsWith(`|${empireId}`)) continue;
      if (Number(entry?.fireAtYear) > year) continue;
      const ruleId = key.slice(0, key.lastIndexOf('|'));
      gameState.set(`director.pending.${key}`, null, 'director_pending_fired');
      const empire = this._require('empireRegistry').get(empireId);
      this._runAction(entry.action, { empireId, empire, year, ruleId }, entry.params ?? {}, null);
    }
  }

  _runAction(actionName, ctx, params, fact) {
    DirectorActions.resolve(actionName)({ ...ctx, fact }, params);
    EventBus.emit('director:ruleFired', { ruleId: ctx.ruleId, empireId: ctx.empireId, action: actionName });
  }

  // ── Sprzątanie ────────────────────────────────────────────────────────────

  dispose() {
    for (const off of this._eventUnsubs) off();
    this._eventUnsubs = [];
    this._eventFacts.clear();
  }
}
