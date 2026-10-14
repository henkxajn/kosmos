// DirectorOpportunityWar — WOJNA Z INICJATYWY AI: wojna z okazji (AI STRIKES BACK S4/2 — decyzje SB81, SB82).
//
// PO CO TEN PLIK ISTNIEJE. Do S4 imperium AI wypowiadało wojnę WYŁĄCZNIE z napięcia ≥ 80 (`hostility_threshold`), po
// wygasłym ultimatum albo przy przylocie misji ataku — żadna reguła Directora nie wypowiadała wojny. SB81: wojna z OKAZJI —
// imperium, które ma czym zaatakować, wypowiada wojnę przy napięciu od progu (`warTensionMin`, domyślnie 40).
//
// KIEDY (reguła `opportunity_war`, bez rzutu, cooldown REGUŁY 1,0 roku wyświetlanego — przepustnica decyzji). Wszystkie
// warunki naraz, w tej kolejności (pierwszy niespełniony to powód odmowy `opportunityVerdict`):
//   1. `not_at_peace` — status relacji z graczem to POKÓJ (nie wojna, nie rozejm);
//   2. `non_aggression_pact` — bez paktu o nieagresji (SB82: odstęp między wojnami dają rozejm i NAP);
//   3. `no_fleet_pool` — imperium ma PULĘ floty (`FleetPoolSystem.isMobilized` — pula powstaje przy pierwszej mobilizacji
//      i zostaje po pokoju, SB86); imperium bez puli wojny z okazji nie wypowiada (pierwsza wojna — nadal z napięcia 80);
//   4. `tension_below_min` — napięcie z graczem ≥ `warTensionMin` (SB81, klucz strojenia);
//   5. `cooldown` — od ostatniego odpalenia TEJ reguły minęło ≥ `aiWarCooldownYears` (SB82, klucz strojenia; liczone
//      z rekordu reguły w `director.rules`, wzór `DirectorPressure.isEscalationReady`);
//   6. `no_squadron` — eskadra do wzięcia TERAZ (`DirectorCampaign.squadronAffordable`: fala desantu niepusta i najbliższy
//      cel kampanii w porządku SB84 w zasięgu sufitu, pula go pokrywa).
// AKCJA: `DiplomacySystem.declareWar(empireId, 'opportunity')` — ta sama bramka co każdy powód AI (rozejm i NAP
//   blokują). Reguła stoi w katalogu PRZED kampanią: w tym samym ticku `campaign_strike` widzi wojnę i wysyła eskadrę,
//   która była okazją.
//
// ⚠ AKCJA NIGDY NIE RZUCA (`tickEmpire` biegnie poza per-regułowym try/catch — zasada `DirectorOffensive`).
// ⚠ Zero importów systemów — kolaboratorzy leniwie przez `window.KOSMOS`; liczby strojenia przez planer.

import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { warTensionMin, aiWarCooldownYears } from '../../utils/StrikeWavePlanner.js';

/** Id reguły katalogu — klucz rekordu reguły w `director.rules` (cooldown SB82). */
export const OPPORTUNITY_WAR_RULE_ID = 'opportunity_war';

export class DirectorOpportunityWar {
  /** @param {object} campaign — `DirectorCampaign` (eskadra do wzięcia, cel kampanii) */
  constructor(campaign) {
    this._cp = campaign;
  }

  _K() { return (typeof window !== 'undefined') ? window.KOSMOS : null; }

  _year() { return this._K()?.timeSystem?.gameTime ?? 0; }

  // ── Warunki ────────────────────────────────────────────────────────────────────────

  /** Pokój bez rozejmu i bez paktu o nieagresji (guard `empireAtPeaceWithoutPact`). */
  atPeaceWithoutPact(empireId) {
    const dip = this._K()?.diplomacySystem;
    if (!dip || !empireId) return false;
    return dip.getStatus(empireId) === 'peace' && !dip.hasTreaty(empireId, 'non_aggression');
  }

  /** Imperium ma pulę floty (guard `empireHasFleetPool`). */
  hasFleetPool(empireId) {
    return this._K()?.fleetPoolSystem?.isMobilized?.(empireId) === true;
  }

  /** Napięcie z graczem od progu `warTensionMin` (guard `empireWarTensionReached`). */
  tensionReached(empireId) {
    const tension = Number(this._K()?.diplomacySystem?.getTension?.(empireId));
    return Number.isFinite(tension) && tension >= warTensionMin();
  }

  /** Rok ostatniego odpalenia reguły dla imperium (`null` — nigdy). */
  lastFiredYear(empireId) {
    const st = gameState.get(`director.rules.${OPPORTUNITY_WAR_RULE_ID}|${empireId}`);
    return Number.isFinite(st?.lastFiredYear) ? st.lastFiredYear : null;
  }

  /** Od ostatniego odpalenia reguły minęło `aiWarCooldownYears` (guard `opportunityWarCooldownElapsed`). */
  cooldownElapsed(empireId, year = this._year()) {
    const last = this.lastFiredYear(empireId);
    return last === null || (Number(year) - last) >= aiWarCooldownYears();
  }

  /** Eskadra do wzięcia TERAZ (guard `empireSquadronAffordable`). */
  squadronAffordable(empireId) {
    return this._cp?.squadronAffordable?.(empireId) === true;
  }

  /**
   * Werdykt wojny z okazji TERAZ — pierwszy niespełniony warunek (kolejność w nagłówku) albo `ok`. Odczyt konsoli
   * i powód odmowy akcji.
   * @param {string} empireId
   * @param {{year?:number, checkCooldown?:boolean}} [opts] — `checkCooldown: false` wyłącznie w akcji reguły (silnik zapisuje
   *   rok odpalenia PRZED akcją, więc cooldown liczony w akcji zawsze by odmówił; sprawdził go guard)
   * @returns {{ok:boolean, reason:string|null, tension:number|null, min:number, lastFiredYear:number|null,
   *            cooldownYears:number, target?:{bodyId:string, systemId:string, needed:number, available:number}}}
   */
  opportunityVerdict(empireId, { year = this._year(), checkCooldown = true } = {}) {
    const dip = this._K()?.diplomacySystem;
    const tension = Number.isFinite(Number(dip?.getTension?.(empireId))) ? Number(dip.getTension(empireId)) : null;
    const base = { tension, min: warTensionMin(), lastFiredYear: this.lastFiredYear(empireId), cooldownYears: aiWarCooldownYears() };
    const status = dip?.getStatus?.(empireId) ?? null;
    if (status !== 'peace') return { ok: false, reason: 'not_at_peace', status, ...base };
    if (dip.hasTreaty(empireId, 'non_aggression')) return { ok: false, reason: 'non_aggression_pact', ...base };
    if (!this.hasFleetPool(empireId)) return { ok: false, reason: 'no_fleet_pool', ...base };
    if (!this.tensionReached(empireId)) return { ok: false, reason: 'tension_below_min', ...base };
    if (checkCooldown && !this.cooldownElapsed(empireId, year)) return { ok: false, reason: 'cooldown', ...base };
    const p = this._cp?.planCampaign?.(empireId);
    const target = p?.target ? { bodyId: p.target.body.id, systemId: p.target.systemId, needed: p.need.needed, available: p.pool.length } : null;
    if (!this.squadronAffordable(empireId)) return { ok: false, reason: 'no_squadron', plan: p?.kind ?? null, target, ...base };
    return { ok: true, reason: null, target, ...base };
  }

  // ── Akcja ──────────────────────────────────────────────────────────────────────────

  /**
   * Akcja `declareOpportunityWar`: wojna z okazji (`declareWar(empireId, 'opportunity')`), gdy werdykt `ok`.
   * @returns {{declared:number, reason?:string}}
   */
  declareOpportunityWar(ctx = {}) {
    const empireId = ctx?.empireId;
    const year = ctx?.year ?? this._year();
    try {
      // Cooldown reguły: przy odpaleniu z silnika `lastFiredYear` jest już rokiem TEGO odpalenia (silnik zapisuje stan
      // przed akcją) — werdykt bez warunku cooldownu, sprawdził go guard `opportunityWarCooldownElapsed`.
      const v = this.opportunityVerdict(empireId, { year, checkCooldown: false });
      if (!v.ok) return this._refuse(empireId, v.reason, year, { tension: v.tension, target: v.target ?? null });
      const ok = this._K()?.diplomacySystem?.declareWar?.(empireId, 'opportunity') === true;
      if (!ok) return this._refuse(empireId, 'declare_refused', year, { tension: v.tension, target: v.target });
      EventBus.emit('director:opportunityWarDeclared', { empireId, year, tension: v.tension, min: v.min, target: v.target });
      return { declared: 1 };
    } catch (err) {
      console.error('[DirectorOpportunityWar] declareOpportunityWar rzucił — pominięte', err);
      return { declared: 0, reason: 'exception' };
    }
  }

  _refuse(empireId, reason, year, extra = {}) {
    EventBus.emit('director:opportunityWarRefused', { empireId, reason, year, ...extra });
    return { declared: 0, reason, ...extra };
  }
}

export default DirectorOpportunityWar;
