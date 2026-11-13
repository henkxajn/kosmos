// src/ui/BattleShipLosses.js
// ARC CV-Z (Finding 721, COMBAT_VISUALS_PLAN.md §5) — utracone OKRĘTY na stronę bitwy, w liczbach, dla banera wyniku
// i linii bitwy w Dzienniku. Pola rekordu `lossesA/B` mają KOLIZJĘ JEDNOSTEK między ścieżkami (DSCS — liczba statków,
// BattleSystem / `EnemyAttackHandler` — HP; `WarSystem._battleLoserSide`) i ZOSTAJĄ nietknięte (czytają je WarSystem
// i InvasionSystem). Ten moduł daje prezentacji jedną odpowiedź: ile okrętów każda strona straciła (zniszczone + wraki).
//
// Źródła (w tej kolejności):
//   • `b.shipLosses` — jawne liczby z ładunku zdarzenia (`fx.shipsLost` bitwy orbitalnej, `EnemyAttackHandler`), albo
//     wynik scalony (rajd — `RaidAnnounceLogic.mergeRaidBattles`); `null` = nieznane (np. rajd z bitwą bez liczb);
//   • `b.source === 'dscs'` — bitwa deep-space: `lossesA/B` liczą statki z HP ≤ 0 (`DeepSpaceCombatSystem._countLosses`);
//   • reszta (wojna z flotą abstrakcyjną, `forceBattle`) — `null`: liczby okrętów nie ma, baner jej nie zmyśla.
// Czysty moduł — zero importów.

const finiteCount = (v) => (Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

/** Utracone okręty `{ A, B }` (strony bitwy) albo `null`, gdy liczby nie ma. */
export function battleShipLosses(b) {
  if (!b) return null;
  if (Object.prototype.hasOwnProperty.call(b, 'shipLosses')) {
    const s = b.shipLosses;
    if (!s) return null;
    const A = finiteCount(s.A), B = finiteCount(s.B);
    return A == null || B == null ? null : { A, B };
  }
  if (b.source === 'dscs') {
    const r = b.result ?? {};
    return { A: finiteCount(Number(r.lossesA ?? 0)) ?? 0, B: finiteCount(Number(r.lossesB ?? 0)) ?? 0 };
  }
  return null;
}
