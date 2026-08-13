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
//   { empireId, empire, personality, tension, war, diplSys, empireReg, galaxyData, homePlanet, year }

import EventBus from '../../core/EventBus.js';
// W1/R2 — jedno źródło prawdy o uzbrojeniu i o własności kadłuba (patrz nota przy estymatorze).
import { hasWeapons, isEnemyVessel } from '../../entities/Vessel.js';

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
      // D1: kształt rekordu relacji jest prywatny — AI dostaje samo napięcie.
      tension:     diplSys?.getTension(empireId) ?? 0,
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
 *
 * W1 / audyt R2 — naprawa trzech defektów naraz (patrz `W1_PLAN.md` §Audit V1/V3/V4/V5):
 *  • PREDYKAT: było `m?.id` na tablicy STRINGÓW (`vessel.modules` = lista ID modułów), więc
 *    `m.id` dawało `undefined`, regex nie miał czego dopasować i warunek był ZAWSZE fałszywy —
 *    uzbrojony kadłub nie ruszał estymatorem ani o jotę (zmierzone: `probe-war-seams.mjs` W1f).
 *    Teraz jedno źródło prawdy: `hasWeapons` (`slotType === 'weapon'`), które samo rozwiązuje
 *    ID przez SHIP_MODULES i jest odporne na dziury `null` w szablonach projektów (V3).
 *    ⚠ ZAWĘŻENIE ZNACZENIA, świadome i podpisane (V4): stary regex łapał też `armor_`/`shield_`,
 *    więc kadłub z samym pancerzem liczył się jako bojowy. Dziś liczy się BROŃ.
 *  • WŁAŚCICIEL i WRAK: żaden z estymatorów nie filtrował ani jednego, ani drugiego (V5).
 *    Dopóki predykat był zawsze fałszywy, nie miało to znaczenia — po naprawie wrogie kadłuby
 *    i wraki wliczałyby się do „siły GRACZA" (zmierzone: W1g — 2 z 3 kadłubów były cudze/martwe).
 *    ⚠ `isEnemyVessel` to test STEMPLA: kadłub bez właściciela czyta się jako kadłub GRACZA
 *    (znalezisko 1 z Director Slice 1) — dlatego stempel nadaje się przy tworzeniu, nie zgaduje.
 *  • KOLONIE: `getAllColonies()` zawiera kolonie AI, więc KAŻDA kolonia AI założona gdziekolwiek
 *    w galaktyce podnosiła „siłę gracza" o 40 (V1). Kanon repo: `getPlayerColonies()`.
 *
 * Obserwowalna zmiana zachowania DZIŚ: ŻADNA — `milRatio` ma zerowy LICZNIK niezależnie od
 * mianownika (K-1, pin T2 w `war_seams_smoke`). Ta funkcja staje się poprawna PRZED tym, jak
 * W1-3 da jej pierwszego konsumenta, który naprawdę czyta wynik (`relative_power`).
 */
export function estimatePlayerMilitary() {
  const vMgr = window.KOSMOS?.vesselManager;
  if (!vMgr?._vessels) return 100;
  let total = 100;
  for (const v of vMgr._vessels.values()) {
    if (!v || v.isWreck) continue;              // wrak nie jest siłą bojową
    if (isEnemyVessel(v)) continue;             // cudzy kadłub to nie siła GRACZA
    if (!Array.isArray(v.modules)) continue;    // null-safe wobec starych/niepełnych rekordów
    if (hasWeapons(v)) total += 30;
  }
  // Bonus dla obrony planetarnej (każda kolonia GRACZA +40).
  // ⚠ `getPlayerColonies()` wołane BEZ `?.` — reguła loud-fail (audyt R12): gdyby kanoniczny
  // akcesor zniknął, ma polecieć wyjątek, a nie cicha zerowa obrona planetarna.
  const colMgr = window.KOSMOS?.colonyManager;
  if (colMgr) total += colMgr.getPlayerColonies().length * 40;
  return Math.max(1, total);
}
