// BRAMKA WOJNY (D13, G2-2) — jedno źródło odpowiedzi na pytanie
// „czy strona A może WYLĄDOWAĆ na tym ciele albo je PRZEJĄĆ?”.
//
// D13 (`docs/design/AI_GARRISON_PLAN.md` §1): lądowanie jednostki naziemnej na ciele należącym do
// INNEGO imperium wymaga WOJNY z jego właścicielem, sprawdzanej W CHWILI LĄDOWANIA. Ciała niczyje
// i własne są zwolnione. Rozejm i pakt o nieagresji BLOKUJĄ — to nie jest wojna. Oba predykaty
// przejęcia (gracza i AI) wymagają tej samej wojny.
//
// ⚠ ŹRÓDŁO PRAWDY: status relacji `'war'` (`RelationsModel.getStatus`), NIE rekord wojny. Rekord
//   potrafi się z nim rozjechać — `WarSystem.createWar` przy tym samym id zwraca istniejący, także
//   nieaktywny rekord, bez emisji. Status relacji jest tym, na czym bramkuje sam `declareWar`.
// ⚠ JEDNA FUNKCJA DLA OBU STRON. Gracz pyta `warGateRefusal('player', ciało)`, AI —
//   `warGateRefusal(empireId, ciało)`; status pary jest symetryczny (`pairKey` sortuje id).
// ⚠ FAIL-CLOSED dla OBCEGO ciała: brak systemu dyplomacji albo rekordu relacji ⇒ „nie ma wojny”.
//   Lądowanie, które nie ma dowodu wojny, nie przechodzi. Ciało niczyje i własne NIE pytają
//   dyplomacji wcale, więc działają także bez niej. Brak rekordu relacji = nigdy nie wypowiedziano
//   wojny (`getStatus` domyślnie zwraca `'peace'`).
// ⚠ MIEJSCE: util, nie system — wołają go encja (`Vessel.js`), systemy (`VesselManager`,
//   `InvasionSystem`), dane akcji (`FleetActions`) i UI; zero importów między systemami, odczyt
//   przez `window.KOSMOS` (wzór `ColonyOwnership.isPlayerColonyId`).
// ⚠ D13a (poprawka właściciela, 2026-10-03): „Wyładuj” z ładowni NIGDY nie ląduje na ciele innego
//   imperium — ani w wojnie, ani w pokoju; jedyną drogą wojsk na cudze ciało są kapsuły desantowe.
//   To osobna reguła ŚCIEŻKI ŁADOWNI (`cargoUnloadRefusal`), niezależna od wojny — nie wchodzi do
//   `warGateRefusal`, bo `unloadGroundUnit` (który pyta bramkę wojny) wołają też kapsuły (`dropTroop`).

import { isPlayerColony } from './ColonyOwnership.js';

/** Powód odmowy — jeden slug dla wszystkich ścieżek (`dropTroop`, `deployAwayTeam`, `launchInvasion`). */
export const NOT_AT_WAR = 'not_at_war';

/**
 * Właściciel ciała: `'player'`, id imperium albo `null` (ciało bez kolonii = niczyje).
 * Kanon własności z `ColonyOwnership` — kolonia bez `ownerEmpireId` należy do gracza.
 * @param {string} planetId
 * @returns {string|null}
 */
export function bodyOwnerOf(planetId) {
  if (!planetId) return null;
  const colony = (typeof window !== 'undefined') ? window.KOSMOS?.colonyManager?.getColony?.(planetId) : null;
  if (!colony) return null;
  return isPlayerColony(colony) ? 'player' : colony.ownerEmpireId;
}

/**
 * Czy strony `a` i `b` są w stanie wojny (status relacji `'war'`).
 * Nie rzuca: złe id (to samo, puste, stary klucz) albo brak dyplomacji ⇒ `false`.
 * @param {string} a — `'player'` albo id imperium
 * @param {string} b — `'player'` albo id imperium
 * @returns {boolean}
 */
export function areAtWar(a, b) {
  if (!a || !b || a === b) return false;
  const rel = (typeof window !== 'undefined') ? window.KOSMOS?.diplomacySystem?.relations : null;
  if (typeof rel?.getStatus !== 'function') return false;
  try {
    return rel.getStatus(a, b) === 'war';
  } catch {
    return false;          // `pairKey` rzuca na niepoprawne id — dla bramki to „nie ma wojny”
  }
}

/**
 * D13 — czy `actorId` może wylądować na ciele `planetId` albo je przejąć.
 * @param {string} actorId — `'player'` albo id imperium (brak ⇒ gracz)
 * @param {string} planetId
 * @returns {null|string} `null` = wolno; `NOT_AT_WAR` = ciało innego imperium, a wojny nie ma
 */
export function warGateRefusal(actorId, planetId) {
  const owner = bodyOwnerOf(planetId);
  if (!owner) return null;                         // ciało niczyje — zwolnione
  const actor = actorId || 'player';
  if (owner === actor) return null;                // własne ciało — zwolnione
  return areAtWar(actor, owner) ? null : NOT_AT_WAR;
}

/** Powód odmowy „Wyładuj” z ładowni na ciele innego imperium (D13a) — niezależny od wojny. */
export const FOREIGN_BODY_UNLOAD = 'foreign_body_unload';

/**
 * D13a — czy `actorId` może WYŁADOWAĆ jednostki z ładowni („Wyładuj”) na ciele `planetId`.
 * Ciało innego imperium: NIGDY — w wojnie i w pokoju jedyną drogą wojsk na cudze ciało są kapsuły
 * desantowe (`dropTroop`, bramka wojny D13). Ciało własne i niczyje: dozwolone (jak dotąd).
 * ⚠ Bramka ŚCIEŻKI ŁADOWNI (`CargoLoadModal`), nie `unloadGroundUnit` — tę metodę wołają też kapsuły.
 * @param {string} actorId — `'player'` albo id imperium (brak ⇒ gracz)
 * @param {string} planetId
 * @returns {null|string} `null` = wolno; `FOREIGN_BODY_UNLOAD` = ciało innego imperium
 */
export function cargoUnloadRefusal(actorId, planetId) {
  const owner = bodyOwnerOf(planetId);
  if (!owner) return null;                         // ciało niczyje — bez zmian
  return owner === (actorId || 'player') ? null : FOREIGN_BODY_UNLOAD;
}
