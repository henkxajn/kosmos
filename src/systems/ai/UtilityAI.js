// UtilityAI — generyczny scorer dla decyzji AI imperiów (Faza 7)
//
// Wzorzec: każda akcja to obiekt z:
//   id        — unikalny ID akcji (debug/log)
//   score(ctx) — zwraca liczbę (wyższa = bardziej atrakcyjna)
//   execute(ctx) — faktycznie wykonuje akcję (mutacja gameState)
//
// Użycie:
//   const decision = UtilityAI.evaluate(empireId, actions);
//   if (decision?.score > 0) decision.action.execute(ctx);
//
// Wszystkie akcje dostają ten sam ctx:
//   { empireId, empire, personality, relation, war, diplSys, empireReg, galaxyData, homePlanet, year }

import EventBus from '../../core/EventBus.js';

export class UtilityAI {
  /**
   * Oceń wszystkie akcje i zwróć najlepszą (score > 0).
   * Zwraca null gdy żadna akcja nie ma sensu.
   */
  static evaluate(empireId, actions, ctx) {
    if (!Array.isArray(actions) || actions.length === 0) return null;

    const scored = [];
    for (const action of actions) {
      try {
        const score = action.score(ctx);
        if (score > 0) scored.push({ action, score });
      } catch (err) {
        console.error('[UtilityAI] Błąd scoring akcji', action.id, err);
      }
    }

    if (scored.length === 0) return null;
    scored.sort((a, b) => b.score - a.score);
    return scored[0];
  }

  /**
   * Buduje wspólny kontekst dla wszystkich scoringów (żeby nie obliczać tego samego wielokrotnie).
   */
  static buildContext(empireId) {
    const empireReg = window.KOSMOS?.empireRegistry;
    const diplSys = window.KOSMOS?.diplomacySystem;
    const warSys = window.KOSMOS?.warSystem;
    const empire = empireReg?.get(empireId);
    if (!empire) return null;

    return {
      empireId,
      empire,
      personality: empire.personality ?? {},
      relation:    diplSys?.getRelation(empireId),
      war:         warSys?.getWarWith(empireId),
      diplSys,
      empireReg,
      warSys,
      galaxyData:  window.KOSMOS?.galaxyData,
      homePlanet:  window.KOSMOS?.homePlanet,
      year:        window.KOSMOS?.timeSystem?.gameTime ?? 0,
    };
  }

  /**
   * Wybierz i wykonaj najlepszą akcję. Emituje ai:decision z wynikiem.
   */
  static decide(empireId, actions, category = 'general') {
    const ctx = this.buildContext(empireId);
    if (!ctx) return null;

    const decision = this.evaluate(empireId, actions, ctx);
    if (!decision) {
      EventBus.emit('ai:decision', { empireId, category, action: 'none', score: 0, reason: 'no_viable_action' });
      return null;
    }

    // Log decyzji (DebugLog z Fazy 0 łapie ai:decision)
    EventBus.emit('ai:decision', {
      empireId,
      category,
      action: decision.action.id,
      score:  decision.score,
      year:   ctx.year,
    });

    try {
      decision.action.execute(ctx);
    } catch (err) {
      console.error('[UtilityAI] Błąd wykonania akcji', decision.action.id, err);
    }

    return decision;
  }
}

/**
 * Mała helper-funkcja: estymuj siłę wojskową gracza (proxy).
 * Faza 4 miała to w AlienCivSystem — wynosimy do wspólnego użycia.
 */
export function estimatePlayerMilitary() {
  const vMgr = window.KOSMOS?.vesselManager;
  if (!vMgr?._vessels) return 100;
  let total = 100;
  for (const v of vMgr._vessels.values()) {
    if (v?.modules && Array.isArray(v.modules)) {
      const hasWeapon = v.modules.some(m => /weapon_|armor_|shield_/.test(m?.id ?? ''));
      if (hasWeapon) total += 30;
    }
  }
  // Bonus dla obrony planetarnej (każda kolonia +40)
  const colMgr = window.KOSMOS?.colonyManager;
  if (colMgr) total += (colMgr.getAllColonies().length) * 40;
  return Math.max(1, total);
}
