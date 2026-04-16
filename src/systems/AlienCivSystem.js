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
import { MilitaryAI } from './ai/MilitaryAI.js';
import { EconAI } from './ai/EconAI.js';

const STATES = ['IDLE', 'EXPANDING', 'REARMING', 'AGGRESSIVE', 'WAR', 'RETREAT', 'NEGOTIATING'];

// Progi hostility (normalizowane przez personality.aggression)
const H_AGGRESSIVE = 40;   // powyżej → empire pokazuje agresję
const H_WAR        = 70;   // powyżej + gotowość → WAR
const H_COOLDOWN   = 25;   // poniżej → RETREAT może wrócić do IDLE

// Minimalna siła do agresji (relatywna vs player)
const MIL_RATIO_WAR = 0.7;  // musi mieć co najmniej 70% siły gracza

export class AlienCivSystem {
  constructor() {
    this._tickAccum = 0;

    EventBus.on('time:tick', ({ civDeltaYears }) => {
      if (!civDeltaYears) return;
      this._tickAccum += civDeltaYears;
      if (this._tickAccum < 1.0) return;
      // Clamp steps — przy bardzo wysokich prędkościach (10kr/s) `steps` może być
      // kilka tysięcy. Procesujemy max 8 iteracji per real-time tick, reszta
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
      const hostility  = dipl.getHostility(emp.id);
      const relState   = dipl.getState(emp.id);
      const milRatio   = playerMilEstimate > 0 ? (emp.military?.power ?? 0) / playerMilEstimate : 1.0;

      const cur = this.getState(emp.id);
      const next = this._decideNextState(cur, { aggression, hostility, relState, milRatio, personality });

      if (next !== cur) {
        this._transition(emp.id, next, `tick_h${hostility.toFixed(0)}_m${milRatio.toFixed(2)}`);
      }

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

  _estimatePlayerMilitary() {
    // Proxy: jeśli gracz ma VesselManager, policz statki z modułami weapon/hull HP.
    // Brak prawdziwej metryki militarnej w KOSMOS (będzie w Fazie 4) — użyj placeholder'a.
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return 100;
    try {
      const vessels = vMgr._vessels ? Array.from(vMgr._vessels.values()) : [];
      // Każdy statek z modułami bojowymi liczy się jako ~30 jednostek mocy
      let total = 100; // bazowa siła obronna kolonii
      for (const v of vessels) {
        if (v?.modules && Array.isArray(v.modules)) {
          const hasWeapon = v.modules.some(m => /weapon_|armor_|shield_/.test(m?.id ?? ''));
          if (hasWeapon) total += 30;
        }
      }
      return total;
    } catch {
      return 100;
    }
  }
}
