// CessionPlan — RE-WALIDACJA i PLAN wykonania cesji terytorialnych (WOJNA I POKÓJ 1.0, WP-3).
//
// WP-2 nauczył silnik OCENIAĆ warunki pokoju (`proposal.terms.cessions`). Ten moduł
// odpowiada na inne pytanie, zadawane TUŻ PRZED wykonaniem: „czy to, na co AI się zgodziło,
// wciąż jest prawdą o świecie" — i jeśli tak, mówi, KTÓRĄ mechaniką zmienić ręce.
//
// ⚠ FAIL-CLOSED (D-WP-9 = ABORT). Pierwszy warunek, który nie przechodzi, unieważnia CAŁĄ
//   propozycję: pokój się nie zdarza, nic nie zmienia właściciela, nie ma stempla odmowy.
//   Powód: akceptacja AI dotyczyła PEŁNEGO zestawu. Wykonanie „części" podpisałoby pokój na
//   warunkach, których nikt nie zaakceptował — ani gracz, ani AI.
//
// ⚠ ZERO importów i ZERO odczytów świata — świat wstrzykiwany argumentem (wzór
//   `ColonyOwnership.js` / `RetreatTarget.js`). Dzięki temu cała re-walidacja jest
//   node-testowalna bez stawiania `GameCore`.
//
// ⚠ KANON STRON: gracz to string `'player'`, tak samo jak w księdze zdobyczy WP-1
//   (`WarSystem._recordCapture`). Kolonia gracza ma `ownerEmpireId === null`, więc REZOLWER
//   świata musi to znormalizować ZANIM tu trafi — ten moduł porównuje wyłącznie stringi.

/** Warunki straciły ważność — stan posiadania zmienił się od złożenia oferty. */
export const CESSION_REJECT_STALE = 'diplo.reject.cessionTermsStale';
/** Ciało domowe nie podlega cesji (D-WP-8 rozszerzone na OBIE strony — patrz niżej). */
export const CESSION_REJECT_HOME = 'diplo.reject.cessionHomeWorld';

export const PLAYER_SIDE = 'player';

/**
 * @param {Array|null} cessions — z propozycji: [{ bodyId, fromEmpireId, toEmpireId }]
 * @param {Object} world — wstrzyknięty świat:
 *   @param {string[]} world.sides — DWIE strony wojny (np. ['player', 'emp_001'])
 *   @param {(bodyId:string) => string|null} world.ownerOf — 'player' | empireId | null (brak kolonii)
 *   @param {(bodyId:string, ownerId:string) => boolean} world.isHomeBody — ciało domowe właściciela
 * @returns {{ ok: boolean, reasonKey: string|null, steps: Array<{bodyId, from, to, toPlayer}> }}
 */
export function planCessions(cessions, world) {
  const steps = [];
  if (!Array.isArray(cessions) || cessions.length === 0) {
    return { ok: true, reasonKey: null, steps };
  }
  const sides = Array.isArray(world?.sides) ? world.sides : [];
  const ownerOf = typeof world?.ownerOf === 'function' ? world.ownerOf : () => null;
  const isHomeBody = typeof world?.isHomeBody === 'function' ? world.isHomeBody : () => false;

  const seen = new Set();
  for (const c of cessions) {
    const bodyId = c?.bodyId ?? null;
    const from = c?.fromEmpireId ?? null;
    const to = c?.toEmpireId ?? null;

    // ⚠ CESJA BEZ STRON ODPADA, choć TERM ją IGNORUJE (wkład 0). To nie jest niespójność:
    //   term jest PUNKTUJĄCYM i degraduje do zera, re-walidacja jest BRAMKĄ i jest
    //   fail-closed. Dzięki temu zniekształcona propozycja nie prześlizgnie się do wykonania
    //   tylko dlatego, że nie dało się jej wycenić.
    if (!bodyId || !from || !to || from === to) return fail(CESSION_REJECT_STALE);

    // Obie strony muszą być stronami TEJ wojny — cesja nie jest kanałem na ciała osób trzecich.
    if (!sides.includes(from) || !sides.includes(to)) return fail(CESSION_REJECT_STALE);

    // To samo ciało dwa razy w jednej propozycji: drugi krok wykonywałby się na świecie
    // zmienionym przez pierwszy, czyli na stanie, którego nikt nie oceniał.
    if (seen.has(bodyId)) return fail(CESSION_REJECT_STALE);
    seen.add(bodyId);

    // Sedno re-walidacji: ciało wciąż istnieje jako kolonia I wciąż należy do tej strony,
    // która miała je oddać. Zmiana rąk między oceną a wykonaniem unieważnia propozycję.
    const owner = ownerOf(bodyId);
    if (owner == null) return fail(CESSION_REJECT_STALE);
    if (owner !== from) return fail(CESSION_REJECT_STALE);

    // ⚠ CIAŁO DOMOWE OBU STRON (podpis właściciela, pkt 4). Pre-warunek `territorial_capital`
    //   z WP-2 chroni WYŁĄCZNIE OCENIAJĄCEGO, więc stolica PROPONUJĄCEGO przechodziłaby przez
    //   silnik bez słowa. ZMIERZONE, co wtedy: gracz oddający własną stolicę zostaje z zerem
    //   kolonii, `_detachActiveColony`, a `window.KOSMOS.homePlanet` dalej wskazuje ciało,
    //   które właśnie oddał. Osobny powód odmowy — to INNY termin niż sufit z D-WP-8.
    if (isHomeBody(bodyId, owner)) return fail(CESSION_REJECT_HOME);

    steps.push({ bodyId, from, to, toPlayer: to === PLAYER_SIDE });
  }
  return { ok: true, reasonKey: null, steps };
}

function fail(reasonKey) {
  return { ok: false, reasonKey, steps: [] };
}
