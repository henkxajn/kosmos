// ThreatMath — czysta matematyka siły wyprowadzonej (W1-2, WOJNA I POKÓJ 1.0, workstream B).
//
// Zero importów systemów, zero `window`, zero stanu — wszystko wchodzi argumentem, wszystko
// wychodzi wynikiem. Dzięki temu daje się przetestować `node`em bez bootowania gry, a
// `ThreatAssessment` (system) sprowadza się do zapamiętywania wyników.
//
// Wycena mieszka w `CombatValueData.js` i TYLKO tam (decyzje 3/9). Ten plik jej NIE zna
// z nazwy — bierze tabelę wag argumentem, więc keeper może podmienić ją na własną i sprawdzić,
// że wynik faktycznie od niej zależy.
//
// ── Którą interpretację kadłuba odtwarzamy i dlaczego ───────────────────────────────────────
// W repo istnieją TRZY niezależne wyceny tego samego kadłuba (audyt V17): `playerVesselsToBattleUnit`
// (BattleSystem, orbitalny), `_buildVesselState` (DSCS, deep-space) i `calcShipStats`
// (ShipModulesData). Nie godzimy ich tutaj — to osobna decyzja balansowa z własnym gate'em
// (§Findings filed 4). Idziemy za DSCS, z dwoma świadomymi wyborami:
//   • `hpBonus` JEST doliczany. BattleSystem go POMIJA, więc `reinforced_hull` (+60 HP) i
//     `titanic_plating` (+180 HP) są tam niewidoczne — to defekt tamtej wyceny, nie cecha.
//     Siła wyprowadzona ma opisywać kadłub, nie kaprys adaptera.
//   • Wartość liczona PER KADŁUB i sumowana. BattleSystem uśrednia uniki po całej flocie
//     (10 zwinnych statków ma ten sam unik co 1), co nie skaluje się z liczebnością.
// ⚠ `combatDamage` (trwałe uszkodzenia z poprzednich bitew) NIE jest odejmowany: to jest
// wycena POTENCJAŁU bojowego, a nie bieżącego stanu HP. Konsumenci (dyplomacja, doktryny)
// pytają „jak groźne jest to imperium", nie „ile HP zostało w tej chwili".

import { COMBAT_VALUE_WEIGHTS, HULL_FALLBACKS } from '../data/CombatValueData.js';

/**
 * Wartość bojowa POJEDYNCZEGO kadłuba z modułami — w jednostkach HP (decyzja 2).
 *
 * @param {object|null} hullDef      wpis z HULLS (lub null/undefined — wtedy fallbacki)
 * @param {string[]}    moduleIds    płaska tablica ID modułów (`vessel.modules`)
 * @param {object}      modulesData  SHIP_MODULES
 * @param {object}     [weights]     tabela wag; domyślnie COMBAT_VALUE_WEIGHTS
 * @returns {number} wartość ≥ 0
 */
export function hullCombatValue(hullDef, moduleIds, modulesData, weights = COMBAT_VALUE_WEIGHTS) {
  const w = weights ?? COMBAT_VALUE_WEIGHTS;

  // ── Pola kadłuba ──
  // Nieznany kadłub NIE jest pomijany (jak w BattleSystem) — dostaje fallbacki, bo „statek,
  // którego nie umiemy nazwać" nadal jest statkiem. Milczące zerowanie ukryłoby całe klasy
  // legacy (SHIPS: science_vessel/cargo_ship/space_supply_ship nie mają pól bojowych).
  const hp      = Number(hullDef?.baseHP      ?? HULL_FALLBACKS.hp)      || 0;
  const armor   = Number(hullDef?.baseArmor   ?? HULL_FALLBACKS.armor)   || 0;
  const evasion = Number(hullDef?.baseEvasion ?? HULL_FALLBACKS.evasion) || 0;

  let value = hp * (w.hp ?? 0) + armor * (w.armor ?? 0) + evasion * (w.evasion ?? 0);

  // ── Pola statystyk modułów ──
  // Iterujemy po ID-STRINGACH (`vessel.modules` to płaska lista ID — to samo nieporozumienie,
  // które było źródłem R2). Dziury `null` w szablonach projektów przechodzą bez szkody.
  for (const modId of moduleIds ?? []) {
    const stats = modulesData?.[modId]?.stats;
    if (!stats) continue;
    if (stats.hpBonus     != null) value += Number(stats.hpBonus)     * (w.hpBonus     ?? 0);
    if (stats.armorRating != null) value += Number(stats.armorRating) * (w.armorRating ?? 0);
    if (stats.shieldHP    != null) value += Number(stats.shieldHP)    * (w.shieldHP    ?? 0);
    if (stats.shieldRegen != null) value += Number(stats.shieldRegen) * (w.shieldRegen ?? 0);
    // ⚠ `damage` bramkowane przez `!= null`, nie truthiness — moduł z `damage: 0` ma być
    // wyceniony na zero, a nie pominięty (to nie to samo co brak pola).
    if (stats.damage      != null) value += Number(stats.damage)      * (w.damage      ?? 0);
  }

  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Wartość bojowa statku — cienka obwoluta rozwiązująca kadłub.
 * Fallback `hullId ?? shipId` jest TEN SAM co w obu adapterach BattleSystem/DSCS
 * (nowe statki mają `shipId`, legacy `hullId`) — rozjazd tutaj byłby cichym błędem.
 */
export function vesselCombatValue(vessel, hullsData, modulesData, weights = COMBAT_VALUE_WEIGHTS) {
  if (!vessel) return 0;
  const hullDef = hullsData?.[vessel.hullId] ?? hullsData?.[vessel.shipId] ?? null;
  return hullCombatValue(hullDef, vessel.modules, modulesData, weights);
}

/** Suma wartości bojowej zbioru statków. */
export function aggregateCombatValue(vessels, hullsData, modulesData, weights = COMBAT_VALUE_WEIGHTS) {
  let total = 0;
  for (const v of vessels ?? []) total += vesselCombatValue(v, hullsData, modulesData, weights);
  return total;
}

/**
 * Znormalizowana przewaga siły — JEDNA formuła dla wszystkich konsumentów.
 *
 * `(a − b) / (a + b)` ∈ ⟨−1, +1⟩: 0 przy równowadze, +1 gdy przeciwnik ma zero, −1 odwrotnie.
 * Skalo-niezmiennicza (100 vs 50 daje to samo co 1000 vs 500), więc nie trzeba jej stroić
 * razem z tabelą wag. Obie strony zerowe ⇒ 0 (nikt nie ma przewagi nad nikim).
 *
 * Kontrakt znaku jest ten sam, którego oczekuje term `relative_power`: +1 = OCENIAJĄCY silniejszy.
 */
export function relativePowerRaw(selfStrength, otherStrength) {
  const a = Number(selfStrength)  || 0;
  const b = Number(otherStrength) || 0;
  const sum = a + b;
  if (sum <= 0) return 0;
  const raw = (a - b) / sum;
  return Math.max(-1, Math.min(1, raw));
}
