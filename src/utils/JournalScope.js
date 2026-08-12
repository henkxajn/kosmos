// JournalScope — zasięg właścicielski wpisów Dziennika gracza.
//
// JEDNO źródło prawdy dla pytania „czy to zdarzenie kolonii wolno pokazać graczowi".
// Wydzielone z `UIManager`, bo UIManager ciągnie THREE/canvas i NIE daje się zaimportować
// w teście headless — keeper musiał trzymać KOPIĘ predykatu, a kopia zdążyła się rozjechać
// z oryginałem (kanon własności zmienił się w UIManagerze, kopia w teście została stara).
// Tutaj obie strony importują ten sam kod, więc dryf jest niemożliwy z konstrukcji.
//
// Kontekst defektu (GATE 1, trzy warstwy tego samego wycieku):
//   • warstwa stoczni/statków — `fleet:*`, kurierzy AI (naprawione w 831a3e7)
//   • warstwa kolonii        — `civ:famine`, `civ:unrest`, `civ:popBorn/popDied`,
//                              `civ:epochChanged`, `trade:imported`, `impact:colonyDamage`
// Wspólny mianownik: emitent jest PER-KOLONIA i tyka także dla kolonii AI, a subskrybent
// Dziennika nie sprawdzał właściciela. Efekt to nie szum, tylko DARMOWY WYWIAD — gracz
// czytał o zbrojeniach i o głodzie obcego imperium z pominięciem warstwy intelu.

import { ColonyManager } from '../systems/ColonyManager.js';

/**
 * Czy zdarzenie dotyczy kolonii GRACZA (wolno je wpisać do Dziennika).
 *
 * Fail-closed: `planetId` wskazujący na kolonię spoza rejestru NIE trafia do Dziennika.
 *
 * ⚠ Jedyny wyjątek to `undefined`/`null` — emisje BEZ tagu; te przepuszczamy, żeby nie
 * wyciszyć zdarzeń gracza, których nikt nie otagował. Dlatego bramce ZAWSZE musi
 * towarzyszyć otagowanie emitenta: `civ:popDied` ma dziewięciu emitentów i tylko dwóch
 * niosło `planetId`, więc sama bramka byłaby ślepa na siedmiu trasach.
 *
 * Własność rozstrzyga KANON `ColonyManager.isPlayerColony` (dopuszcza brak właściciela
 * ORAZ jawne `ownerEmpireId === 'player'`) — reguły nie powielamy.
 *
 * @param {string|null|undefined} planetId — identyfikator kolonii z payloadu zdarzenia
 * @returns {boolean}
 */
export function isPlayerColonyEvent(planetId) {
  if (planetId === undefined || planetId === null) return true;   // emisja bez tagu — nie wyciszamy
  const colony = globalThis.window?.KOSMOS?.colonyManager?.getColony?.(planetId);
  if (!colony) return false;                                      // fail-closed
  return ColonyManager.isPlayerColony(colony);
}
