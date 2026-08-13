// AlienCivSystem — FSM osobowości i zachowań obcych imperiów (Faza 3)
//
// Jedna maszyna stanów PER imperium:
//   IDLE → EXPANDING → REARMING → AGGRESSIVE → WAR → RETREAT → NEGOTIATING → IDLE
//
// Stan trzymany w gameState.empires.{id}.fsm = { state, enteredYear }.
// Aktualna implementacja — Faza 3 — to CHARAKTER, nie akcje. Transitions sterują
// tylko tagiem stanu; rzeczywiste ruchy (budowa flot, atak) przyjdą w Fazie 7
// (MilitaryAI + EconAI GOAP/Utility). Stan FSM jest używany w UI i przy
// przygotowaniu gruntu pod prawdziwe AI.
//
// Transitions sterowane:
//   - hostility w DiplomacySystem (player_{empireId})
//   - personality.aggression z archetypu (mnożnik progu)
//   - ratio siły wojskowej vs player (obecnie zastosowany stały proxy)
//
// Tick: 1 civYear per imperium (akumulator civDeltaYears).

import EventBus from '../core/EventBus.js';
import gameState from '../core/GameState.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { MilitaryAI } from './ai/MilitaryAI.js';
import { EconAI } from './ai/EconAI.js';
// W1/R2 — jedno źródło prawdy o uzbrojeniu i o własności kadłuba (nota przy _estimatePlayerMilitary).
import { hasWeapons, isEnemyVessel } from '../entities/Vessel.js';

const STATES = ['IDLE', 'EXPANDING', 'REARMING', 'AGGRESSIVE', 'WAR', 'RETREAT', 'NEGOTIATING'];

// Progi hostility (normalizowane przez personality.aggression)
const H_AGGRESSIVE = 40;   // powyżej → empire pokazuje agresję
const H_WAR        = 70;   // powyżej + gotowość → WAR
const H_COOLDOWN   = 25;   // poniżej → RETREAT może wrócić do IDLE

// Minimalna siła do agresji (relatywna vs player)
const MIL_RATIO_WAR = 0.7;  // musi mieć co najmniej 70% siły gracza

// ── S3.4 — AI envoy (abstrakcyjny gest dyplomatyczny obcych) ──
// D1: wartość gestu (+3) mieszka w katalogu (OPINION_MODIFIERS.their_envoy) —
// dawna stała AI_ENVOY_TRUST_GAIN skasowana, żeby nie było dwóch źródeł liczby.
// Odstęp między delegacjami AI. ⚠ D2/E6: komentarz mówił „civYears" i KŁAMAŁ —
// porównanie jedzie przez `timeSystem.gameTime`, więc to od zawsze było 15 lat
// WYŚWIETLANYCH (= 180 cyw.), czyli 2-3 delegacje na partię. Opis poprawiony,
// wartość nietknięta (mechanizm żywy — zawężona decyzja 3). (BUG2b — było 12.)
const AI_ENVOY_COOLDOWN   = 15;
// Wysyła tylko gdy relacje są słabe. D2/E3: wyrażone w OPINII (skala D1), nie w dawnym
// truście — 10 punktów opinii to dokładnie dawny próg trustu 60 (trust = 50 + opinia).
const AI_ENVOY_OPINION_MAX = 10;
const AI_ENVOY_SKIP_ARCHETYPES = new Set(['xenophage', 'hegemon']);

export class AlienCivSystem {
  constructor() {
    this._tickAccum = 0;
    // S3.4 — transient cooldown AI envoy per imperium (empireId → lastYear); NIE serializowany.
    this._aiEnvoyCooldown = new Map();

    EventBus.on('time:tick', ({ civDeltaYears }) => {
      if (!civDeltaYears) return;
      this._tickAccum += civDeltaYears;
      if (this._tickAccum < 1.0) return;
      // Clamp steps — przy wysokich prędkościach (1r/s × CIV_TIME_SCALE) `steps`
      // może urosnąć. Procesujemy max 8 iteracji per real-time tick, reszta
      // zostaje w akumulatorze na następną klatkę. Dzięki temu AI nadąża bez
      // zamrażania UI i daje widoczną progresję.
      const MAX_STEPS_PER_TICK = 8;
      const steps = Math.min(MAX_STEPS_PER_TICK, Math.floor(this._tickAccum));
      this._tickAccum -= steps;
      for (let i = 0; i < steps; i++) this._tickAll(1);
    });

    // Reakcja na zmianę relacji — natychmiastowa rewizja stanu (nie czekaj na tick)
    EventBus.on('diplomacy:warDeclared', ({ empireId }) => this._transition(empireId, 'WAR', 'player_declared_war'));
    EventBus.on('diplomacy:peaceSigned', ({ empireId }) => this._transition(empireId, 'NEGOTIATING', 'peace_signed'));
    EventBus.on('diplomacy:ultimatum', ({ empireId }) => {
      const cur = this.getState(empireId);
      if (cur !== 'WAR') this._transition(empireId, 'AGGRESSIVE', 'ultimatum_issued');
    });

    // Nowe imperium → init do IDLE (lub EXPANDING dla highly-expansive)
    EventBus.on('empire:created', ({ empireId }) => {
      this._initFsm(empireId);
    });
  }

  // ── Read-only ─────────────────────────────────────────────────

  getFsm(empireId) {
    return gameState.get(`empires.${empireId}.fsm`) ?? null;
  }

  getState(empireId) {
    return this.getFsm(empireId)?.state ?? 'IDLE';
  }

  // ── Ticker ────────────────────────────────────────────────────

  _tickAll(years) {
    const reg = window.KOSMOS?.empireRegistry;
    const dipl = window.KOSMOS?.diplomacySystem;
    if (!reg || !dipl) return;

    const playerMilEstimate = this._estimatePlayerMilitary();

    for (const emp of reg.listAll()) {
      const personality = emp.personality ?? {};
      const aggression = personality.aggression ?? 0.5;
      const hostility  = dipl.getTension(emp.id);    // D1: napięcie = dawne hostility 1:1
      const relState   = dipl.getStatus(emp.id);     // ⚠ dipl.getStatus, NIE this.getState (FSM)
      const milRatio   = playerMilEstimate > 0 ? (emp.military?.power ?? 0) / playerMilEstimate : 1.0;

      const cur = this.getState(emp.id);
      const next = this._decideNextState(cur, { aggression, hostility, relState, milRatio, personality });

      if (next !== cur) {
        this._transition(emp.id, next, `tick_h${hostility.toFixed(0)}_m${milRatio.toFixed(2)}`);
      }

      // S3.4 — abstrakcyjny AI envoy (poprawa relacji gdy trust niski)
      this._maybeLaunchAIEnvoy(emp, dipl);

      // Director (workstream C) — JEDNO wywołanie na imperium na krok (decyzja 1: zdarzenia
      // zbierają fakty, tick podejmuje decyzje). Reguła nie może zabić ticku całego AI,
      // ale ma krzyczeć — `tickEmpire` łapie wyjątki per reguła i loguje je do konsoli.
      window.KOSMOS?.directorSystem?.tickEmpire?.(emp.id, emp);

      // Faza 7: AI decyzje — najpierw ekonomia, potem militaria
      // (ekonomia wcześniej, żeby zbudowana flota/produkcja była widoczna dla MilitaryAI)
      try {
        EconAI.tick(emp.id);
        MilitaryAI.tick(emp.id);
      } catch (err) {
        console.error('[AlienCivSystem] AI tick error for', emp.id, err);
      }
    }
  }

  /**
   * S3.4 — abstrakcyjny AI envoy: gdy trust < 60 i archetyp nie agresywny, co
   * AI_ENVOY_COOLDOWN lat imperium wysyła emisariusza → +3 trust + toast.
   * Bez materializacji statku (zgodnie z lekką dyplomacją).
   */
  _maybeLaunchAIEnvoy(emp, dipl) {
    if (!GAME_CONFIG.FEATURES?.lightDiplomacy) return;
    if (!emp || !dipl) return;
    if (AI_ENVOY_SKIP_ARCHETYPES.has(emp.archetype)) return;
    // D2/E3: ostatni konsument mostka `getTrustEquivalent` — czytamy opinię WPROST.
    // Skala jest przesunięta o 50 (trust 60 ⇒ opinia 10), więc próg jest ten sam co dotąd.
    if (dipl.getOpinionOfPlayer(emp.id) >= AI_ENVOY_OPINION_MAX) return;
    // BUG A — imperium w stanie wojny z graczem NIE wysyła emisariuszy (inaczej
    // +3/envoy maskuje karę za wojnę, zwłaszcza przy dużej prędkości czasu).
    if (dipl.getStatus(emp.id) === 'war') return;
    // tylko gdy gracz zna imperium (intel >= rumor)
    const intelSys = window.KOSMOS?.intelSystem;
    if (intelSys && !intelSys.isAtLeast(emp.id, 'rumor')) return;
    const year = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const last = this._aiEnvoyCooldown.get(emp.id);
    if (last != null && (year - last) < AI_ENVOY_COOLDOWN) return;
    this._aiEnvoyCooldown.set(emp.id, year);
    dipl.addOpinionModifier(emp.id, 'player', 'their_envoy', { source: 'ai_envoy' });
    EventBus.emit('diplomacy:aiEnvoy', { empireId: emp.id });
  }

  _decideNextState(cur, ctx) {
    const { aggression, hostility, relState, milRatio, personality } = ctx;
    // Progi skalowane aggression — im bardziej agresywni, tym niżej progi
    const warThreshold = H_WAR * (1 - 0.4 * aggression);         // 70 → 42 dla aggression=1
    const aggThreshold = H_AGGRESSIVE * (1 - 0.3 * aggression);  // 40 → 28 dla aggression=1

    // WAR ma priorytet — jeśli DiplomacySystem jest w state='war', my też
    if (relState === 'war') return 'WAR';
    // Pokój po wojnie → NEGOTIATING
    if (relState === 'truce' && cur === 'WAR') return 'NEGOTIATING';

    switch (cur) {
      case 'IDLE':
        if (hostility >= warThreshold && milRatio >= MIL_RATIO_WAR) return 'AGGRESSIVE';
        if (hostility >= aggThreshold) return 'AGGRESSIVE';
        if ((personality.expansion ?? 0.5) > 0.6) return 'EXPANDING';
        return 'IDLE';

      case 'EXPANDING':
        if (hostility >= warThreshold && milRatio >= MIL_RATIO_WAR) return 'AGGRESSIVE';
        if (hostility >= aggThreshold) return 'REARMING';
        return 'EXPANDING';

      case 'REARMING':
        if (milRatio >= MIL_RATIO_WAR * 1.2) return 'AGGRESSIVE';
        if (hostility < H_COOLDOWN) return 'IDLE';
        return 'REARMING';

      case 'AGGRESSIVE':
        if (hostility >= warThreshold && milRatio >= MIL_RATIO_WAR) return 'WAR';
        if (hostility < aggThreshold) return 'IDLE';
        if (milRatio < MIL_RATIO_WAR * 0.6) return 'REARMING';
        return 'AGGRESSIVE';

      case 'WAR':
        // Wychodzimy tylko gdy DiplomacySystem zmieni state — obsłużone wyżej
        if (milRatio < 0.3) return 'RETREAT';
        return 'WAR';

      case 'RETREAT':
        if (hostility < H_COOLDOWN) return 'IDLE';
        if (milRatio >= MIL_RATIO_WAR) return 'REARMING';
        return 'RETREAT';

      case 'NEGOTIATING':
        if (hostility < H_COOLDOWN) return 'IDLE';
        if (hostility >= aggThreshold) return 'AGGRESSIVE';
        return 'NEGOTIATING';

      default:
        return 'IDLE';
    }
  }

  // ── Transitions ──────────────────────────────────────────────

  _transition(empireId, toState, reason = '') {
    if (!STATES.includes(toState)) return;
    const cur = this.getFsm(empireId);
    const from = cur?.state ?? null;
    if (from === toState) return;
    const next = { state: toState, enteredYear: this._year() };
    gameState.set(`empires.${empireId}.fsm`, next, `fsm_${reason}`);
    EventBus.emit('ai:fsmTransition', { empireId, from, to: toState, reason });
  }

  _initFsm(empireId) {
    if (this.getFsm(empireId)) return;
    const reg = window.KOSMOS?.empireRegistry;
    const emp = reg?.get(empireId);
    const start = (emp?.personality?.expansion ?? 0.5) > 0.6 ? 'EXPANDING' : 'IDLE';
    gameState.set(`empires.${empireId}.fsm`, { state: start, enteredYear: this._year() }, 'fsm_init');
  }

  /** Gdy imperium powstało przed AlienCivSystem (race) — nadrób init. */
  initForAllEmpires() {
    const reg = window.KOSMOS?.empireRegistry;
    if (!reg) return;
    for (const emp of reg.listAll()) {
      if (!this.getFsm(emp.id)) this._initFsm(emp.id);
    }
  }

  // ── Pomocnicze ──────────────────────────────────────────────

  _year() { return window.KOSMOS?.timeSystem?.gameTime ?? 0; }

  /**
   * Proxy siły wojskowej gracza — MIANOWNIK `milRatio` (`:106`).
   *
   * W1 / audyt R2 — ten estymator był zepsuty IDENTYCZNIE jak bliźniak w `UtilityAI.js`
   * (`m?.id` na tablicy STRINGÓW ⇒ warunek zawsze fałszywy) i naprawiamy go tak samo:
   * `hasWeapons` jako jedyny predykat uzbrojenia + filtr WŁAŚCICIELA i WRAKU, którego nie
   * miał (V5). Pełne uzasadnienie i zawężenie znaczenia (`armor_`/`shield_` przestają się
   * liczyć) — przy `estimatePlayerMilitary` w `src/systems/ai/UtilityAI.js`.
   *
   * ⚠ CELOWO zostaje osobną, drobnie różniącą się funkcją (bez członu kolonii, z try/catch):
   * V2 odnotował dryf między nią a bliźniakiem jako FAKT do naprawy w ThreatAssessment (W1-2),
   * nie tutaj — ujednolicenie obu w jedno źródło to zadanie modułu, nie tej łatki.
   *
   * Obserwowalna zmiana zachowania DZIŚ: ŻADNA. `milRatio` = (LICZNIK ≡ brak) / (ten mianownik),
   * a licznika `empire.military.power` nie ma i nie ma jak powstać — `createEmpire` wycina go
   * z whitelisty, `updateMilitaryPower` jest no-opem (K-1, zmierzone w `war_seams_smoke` T1/T2).
   * FSM w `_decideNextState` porównuje milRatio wyłącznie ze stałymi, więc przejścia są
   * bajt w bajt takie same przed i po tej naprawie.
   */
  _estimatePlayerMilitary() {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return 100;
    try {
      const vessels = vMgr._vessels ? Array.from(vMgr._vessels.values()) : [];
      // Każdy UZBROJONY statek GRACZA liczy się jako ~30 jednostek mocy.
      let total = 100; // bazowa siła obronna kolonii
      for (const v of vessels) {
        if (!v || v.isWreck) continue;              // wrak nie jest siłą bojową
        if (isEnemyVessel(v)) continue;             // cudzy kadłub to nie siła GRACZA
        if (!Array.isArray(v.modules)) continue;    // null-safe wobec starych/niepełnych rekordów
        if (hasWeapons(v)) total += 30;
      }
      return total;
    } catch {
      return 100;
    }
  }
}
