// ReturnJump — TRANSAKCYJNY skok „powrót do bazy" z obcego układu (Finding 125).
//
// PROBLEM, KTÓRY TO ZAMYKA
// Wszystkie cztery wejścia rozkazu „Powrót do bazy" musiały dotąd SKŁAMAĆ o stanie statku,
// żeby przejść bramkę dyspozytora — `status='idle'; position.state='docked'; mission=null` —
// i kłamstwa NIKT nie cofał, gdy skok odpadał. Najczęstszy powód odmowy to brak `warp_cores`,
// czyli DOKŁADNIE sytuacja, w której gracz ten przycisk klika. Statek zostawał „zadokowany"
// przy ciele BEZ portu i tracił wszystko naraz (ZMIERZONE):
//   canLaunchFromCurrent  ok  → { ok:false, no_spaceport_at_origin }
//   MovementOrderSystem   ok  → { ok:false, no_spaceport_at_origin }
//   VesselManager.startReturn → false (wyzerowana `mission`)
//   VesselManager.manualRefuel → false (pod fałszywym dokiem nie ma magazynu)
//
// KŁAMSTWO BYŁO ZBĘDNE. `dispatchInterstellar` przyjmuje `docked` I `orbiting` i jawnie NIE
// patrzy na `status` (VesselManager: „Status nie blokuje"), a `WarpRouteSystem.canOrder` tak
// samo. Jedyny stan, który skok odrzuca twardo, to lot w układzie (`in_transit`).
//
// KONTRAKT
//   1. Przygotuj MINIMUM — tylko `in_transit` wymaga przerwania lotu.
//   2. Przerwany lot ląduje w SWOBODNYM DRYFIE (`orbiting` + `dockedAt=null`), nie w fałszywym
//      doku. To stan PRAWDZIWY i obsługiwany (renderer pozycjonuje takie statki z realnych x/y),
//      więc nawet gdyby cofnięcie nie doszło do skutku, statek zostaje sprawny.
//   3. Odmowa skoku przywraca stan CO DO POLA — nieudany rozkaz nie zmienia świata. Dotyczy to
//      także `pendingOrder` (łańcuch warp→dostawa): odmowa skoku NIE ma prawa po cichu skasować
//      zakolejkowanej dostawy gracza. Dlatego kasowanie composite'u wołający robi WEWNĄTRZ
//      `jumpFn` — snapshot zdejmowany jest wtedy przed nim.
//   4. Sukces jest NO-OPEM względem starego kodu: `dispatchInterstellar` i tak nadpisuje
//      `mission`, `status`, `position.state` i `dockedAt`. Zmiana dotyczy WYŁĄCZNIE ścieżki odmowy.
//
// Wzór z tego samego repo: `VesselManager.dockAtColony` przy braku portu NIE dokuje na siłę,
// tylko zostawia statek na orbicie. Tu obowiązuje ta sama zasada — nigdy nie fałszuj doku.
//
// Czysty moduł (zero importów) → node-testowalny bez shimu przeglądarki; wzór
// `MovementOrderCancellation.js`.

/**
 * Wykonaj skok międzygwiezdny w transakcji: przygotuj stan, odpal `jumpFn`, a przy odmowie
 * przywróć stan sprzed przygotowania.
 *
 * ⚠ `abortForeignRecon` CELOWO stoi POZA transakcją u wołających: sam ląduje statek w stanie
 * `orbiting` + panel `exploration/orbiting_body`, czyli w pełni wykonalnym. Cofanie go po
 * odmowie dałoby hybrydę (misja już przemianowana, pozycja przywrócona) — nowe limbo.
 *
 * @param {object}   vessel — instancja statku (mutowana w miejscu)
 * @param {function} jumpFn — właściwy skok; SUKCES = `true` albo `{ ok:true }`,
 *                            wszystko inne (w tym `undefined`) = odmowa
 * @returns {*} wynik `jumpFn` bez zmian (wołający decyduje, co z nim zrobić)
 */
export function returnJumpTransactional(vessel, jumpFn) {
  if (typeof jumpFn !== 'function') return undefined;
  if (!vessel?.position) return jumpFn();

  const snapshot = {
    state:        vessel.position.state,
    dockedAt:     vessel.position.dockedAt,
    status:       vessel.status,
    mission:      vessel.mission,
    pendingOrder: vessel.pendingOrder,
  };

  if (snapshot.state === 'in_transit') {
    vessel.position.state    = 'orbiting';   // swobodny dryf — NIE fałszywy dok
    vessel.position.dockedAt = null;
    vessel.status            = 'idle';
    vessel.mission           = null;
  }

  let result;
  try {
    result = jumpFn();
  } catch (e) {
    restoreJumpState(vessel, snapshot);
    throw e;
  }

  if (!jumpSucceeded(result)) restoreJumpState(vessel, snapshot);
  return result;
}

/** Sukces skoku: `true` (dispatchInterstellar) albo `{ ok:true }` (OrderService/WarpRouteSystem). */
export function jumpSucceeded(result) {
  return result === true || (!!result && result.ok === true);
}

/** Przywróć pola zdjęte w snapshocie (idempotentne). */
function restoreJumpState(vessel, snapshot) {
  vessel.position.state    = snapshot.state;
  vessel.position.dockedAt = snapshot.dockedAt;
  vessel.status            = snapshot.status;
  vessel.mission           = snapshot.mission;
  vessel.pendingOrder      = snapshot.pendingOrder;
}
