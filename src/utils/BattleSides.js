// BattleSides — KTO stał po której stronie bitwy. Plan: docs/design/BATTLE_NARRATION_PLAN.md (Finding 155).
//
// PO CO TO ISTNIEJE: narracja bitwy czytała tożsamość stron z REKORDU WOJNY, a nie z uczestników.
// `GameScene:2398-2402` mapowało literę wyniku na nazwy przez `war.aggressor === 'player' ? …`,
// czyli zakładało `A = agresor wojny`. Nic tego nie gwarantuje: `WarSystem.recordBattle` kopiuje
// `participantA/B` DOSŁOWNIE, a `EnemyAttackHandler:172-186` ZAWSZE stawia wroga jako `A`.
// ⇒ gdy graczem jest AGRESOR wojny, nazwy się zamieniały i WYGRANA GRACZA BYŁA RAPORTOWANA JAKO
// ZWYCIĘSTWO WROGA. Zaobserwowane na żywo (GATE B2): trzy rajdery zestrzelone przez obronę
// stolicy, a Dziennik napisał „Zwycięzca: Liga Spalonej Drogi".
//
// ⚠ UCZESTNIK MA TRZY KSZTAŁTY, a GRACZ jest w nich oznaczony NIEJEDNOLICIE:
//     DSCS / VCS          → { type: 'vessel_group', empireId: 'player' }
//     EnemyAttackHandler  → { type: 'player', empireId: 'player' }   (empireId dostemplowany w W3-7)
//     stary zapis / abstrakcja → { type: 'player' } BEZ empireId
//   Dlatego predykat pyta o OBA znaczniki — tak samo jak `WarSystem._hasPlayerSide`, którego
//   nagłówek ostrzega, że jednym testem tego nie da się załatwić. Predykat zawężony do
//   `empireId === 'player'` po cichu gubi bitwy obrony orbitalnej (klasa defektu S25).
//
// ⚠ NIE ZGADUJEMY. Gdy gracza nie da się przypisać do żadnej strony, `playerSide` zostaje `null`
//   i wołający MUSI to unieść (mniej treści zamiast odwróconej treści). To ta sama zasada, którą
//   stosuje `WarSystem._battleLoserSide`: zwraca `null` i nalicza samą bazę, zamiast przypisywać
//   karę losowo. Odwrócona etykieta jest gorsza niż brak etykiety.
//
// ⚠ MODUŁ JEST BEZJĘZYKOWY — etykiety wchodzą PARAMETREM, nie przez `t()`. Dwa powody, oba
//   zmierzone w tym repo: (1) `check-i18n` skanuje wywołania `t()` w całym `src/`, (2) import
//   i18n wciągnąłby zależność, przez którą keeper przestałby się WYKONYWAĆ pod node — a cała
//   wartość tego pliku polega na tym, że jest pinowalny wykonaniem (`GameScene` nie jest).

/**
 * Czy ten uczestnik to GRACZ? Jedyne miejsce, które zna wszystkie trzy kształty.
 * @param {object|null|undefined} p
 * @returns {boolean}
 */
export function isPlayerParticipant(p) {
  if (!p) return false;
  return p.empireId === 'player' || p.type === 'player';
}

/**
 * Nazwa strony. Kolejność źródeł: gracz → nazwa imperium z rejestru → własna etykieta
 * uczestnika (`label`, którą niosą grupy statków) → surowe `empireId` → etykieta nieznanego.
 */
export function participantName(p, { registry = null, playerLabel = 'Player', unknownLabel = '?' } = {}) {
  if (!p) return unknownLabel;
  if (isPlayerParticipant(p)) return playerLabel;
  return registry?.get?.(p.empireId)?.name ?? p.label ?? p.empireId ?? unknownLabel;
}

/**
 * Rozłóż bitwę na strony — JEDNO źródło tożsamości dla całej narracji.
 *
 * @param {object|null} result — rekord bitwy (`participantA/B`, `winner`, …)
 * @param {{registry?: object, playerLabel?: string, unknownLabel?: string}} [opts]
 * @returns {{playerSide: 'A'|'B'|null, playerInvolved: boolean, sideAName: string,
 *            sideBName: string, foeEmpireId: string|null, foeArchetype: string|null}}
 */
export function resolveBattleSides(result, opts = {}) {
  const { registry = null } = opts;
  const pA = result?.participantA ?? null;
  const pB = result?.participantB ?? null;

  const aIsPlayer = isPlayerParticipant(pA);
  const bIsPlayer = isPlayerParticipant(pB);

  // ⚠ Gracz po OBU stronach to kształt niemożliwy w produkcji — i właśnie dlatego nie
  //   rozstrzygamy go monetą. `null` przechodzi do wołającego jako „nie wiem".
  const playerSide = (aIsPlayer && !bIsPlayer) ? 'A'
                   : (bIsPlayer && !aIsPlayer) ? 'B'
                   : null;

  const foe = playerSide === 'A' ? pB : playerSide === 'B' ? pA : null;

  return {
    playerSide,
    playerInvolved: aIsPlayer || bIsPlayer,
    sideAName:      participantName(pA, opts),
    sideBName:      participantName(pB, opts),
    foeEmpireId:    foe?.empireId ?? null,
    foeArchetype:   registry?.get?.(foe?.empireId)?.archetype ?? null,
  };
}

/**
 * Nazwa ZWYCIĘZCY — mapowanie litery wyniku na stronę. To jest dokładnie ta jedna linijka,
 * która kłamała: litera musi trafiać w nazwę wziętą z UCZESTNIKA o tej literze, a nie w rolę
 * wojny o tym samym indeksie.
 */
export function battleWinnerName(result, sides, drawLabel = '—') {
  if (result?.winner === 'A') return sides?.sideAName ?? drawLabel;
  if (result?.winner === 'B') return sides?.sideBName ?? drawLabel;
  return drawLabel;
}
