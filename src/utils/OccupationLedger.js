// OccupationLedger — „czy to ciało zmieniło ręce w TRWAJĄCEJ wojnie i trzyma je zdobywca".
//
// WP-4 / C2 (D-WP-2 = C + A-lite). CZYTA księgę zdobyczy (`war.captures[]`, WP-1) i NIC nie
// zapisuje: odznaka okupacji nie ma własnego stanu, więc nie ma też migracji zapisu. Po pokoju
// `WarSystem._onPeaceSigned` ustawia `active:false`, a my patrzymy wyłącznie na wojny aktywne —
// znacznik gaśnie Z KONSTRUKCJI, bez żadnego sprzątania.
//
// ⚠ CZYSTY RDZEŃ, ZERO IMPORTÓW (pinowane keeperem): reguła da się mierzyć literałem, bez
//   stawiania świata. Jedyna funkcja dotykająca `window.KOSMOS` to `readOccupier` — fasada
//   dla dwóch powierzchni UI (panel ciała + tooltip mapy), żeby nie miały dwóch kopii reguły.
//
// ⚠ ROZSTRZYGA OSTATNI WPIS, NIE JAKIKOLWIEK. `WarSystem._recordCapture` mówi wprost: księga
//   jest append-only BEZ deduplikacji i ma być HISTORIĄ. `some()` odpowiedziałby „zdobyte"
//   także o ciele, które już wróciło do właściciela — ta sama pułapka, którą WP-2 zamknął
//   w `_captureResolver`.
//
// ⚠ TERMIN „WRÓCIŁO DO SWOJEGO" (odstępstwo od dosłownego brzmienia podpisu, zgłoszone
//   właścicielowi): sama reguła „ostatni wpis `toEmpireId` == bieżący właściciel" nazwałaby
//   OKUPOWANYM także ciało, które gracz ODBIŁ — bo odbicie też jest zmianą rąk. Odznaka
//   kłamałaby wtedy o własnej, odzyskanej koloni. Dokładamy więc jeden warunek: bieżący
//   właściciel nie może być tym, komu to ciało w tej wojnie zabrano PIERWSZE.
//   Skutki (wszystkie zamierzone):
//     • imperium trzyma ciało zabrane graczowi        → okupowane PRZEZ imperium
//     • gracz odbił swoje ciało                        → BRAK odznaki (wróciło do swojego)
//     • gracz trzyma ciało zdobyte na imperium         → okupowane (symetrycznie: trzymasz
//       zdobycz, a stół pokoju może ją oddać — to informacja, nie oskarżenie)

/** Wszystkie wpisy księgi dotyczące ciała, posortowane rosnąco po roku (kopia — księgi nie ruszamy). */
function capturesOf(bodyId, wars) {
  if (!bodyId || !Array.isArray(wars)) return [];
  const out = [];
  for (const war of wars) {
    const caps = war?.captures;
    if (!Array.isArray(caps)) continue;
    for (const e of caps) if (e?.bodyId === bodyId) out.push(e);
  }
  // Równy rok ⇒ kolejność zapisu (księga jest historią, więc porządek wpisów jest znaczący).
  return out.sort((a, b) => (Number(a?.year) || 0) - (Number(b?.year) || 0));
}

/** Najpóźniejsza zmiana rąk tego ciała albo `null`. */
export function latestCaptureOf(bodyId, wars) {
  const list = capturesOf(bodyId, wars);
  return list.length > 0 ? list[list.length - 1] : null;
}

/** PIERWSZA zmiana rąk — jej `fromEmpireId` mówi, komu to ciało pierwotnie zabrano. */
export function firstCaptureOf(bodyId, wars) {
  const list = capturesOf(bodyId, wars);
  return list.length > 0 ? list[0] : null;
}

/**
 * Właściciel kolonii w kanonie księgi: gracz to string `'player'`, nie `null`.
 * (Lustro normalizacji z `WarSystem._recordCapture` / `DiplomacySystem._cessionWorld`.)
 */
export function normalizeOwner(colony) {
  if (!colony) return null;
  return colony.ownerEmpireId ?? 'player';
}

/**
 * Kto OKUPUJE ciało — albo `null`, gdy nikt.
 *
 * @param {string} bodyId
 * @param {{ activeWars: Array, ownerOf: (bodyId: string) => string|null }} world
 * @returns {string|null} id okupanta (`'player'` albo id imperium)
 */
export function occupierOf(bodyId, { activeWars, ownerOf } = {}) {
  const last = latestCaptureOf(bodyId, activeWars);
  if (!last) return null;
  const owner = typeof ownerOf === 'function' ? ownerOf(bodyId) : null;
  // Księga NIE nadpisuje świata: gdy ciało trzyma kto inny niż ostatni zdobywca, milczymy.
  if (owner == null || last.toEmpireId !== owner) return null;
  const first = firstCaptureOf(bodyId, activeWars);
  if (first && first.fromEmpireId === owner) return null;   // wróciło do swojego
  return owner;
}

/** Predykat wygodny dla UI. */
export function isOccupiedBody(bodyId, world) {
  return occupierOf(bodyId, world) != null;
}

/**
 * Nazwa okupanta do wyświetlenia — REGUŁA MGŁY WOJNY w jednym miejscu (dwie powierzchnie UI).
 * Fakt okupacji widzimy zawsze (obce wojska na powierzchni), TOŻSAMOŚĆ imperium dopiero po
 * kontakcie — wzór Findingu 188 (oś właściciela, nie oś miejsca).
 *
 * @param {string|null} who — zwrotka `occupierOf`
 * @param {{ playerLabel?: string, empireName?: string, intelKnown?: boolean, mask?: string }} opts
 */
export function occupierDisplayName(who, { playerLabel, empireName, intelKnown, mask = '???' } = {}) {
  if (!who) return null;
  if (who === 'player') return playerLabel ?? who;
  return intelKnown ? (empireName ?? mask) : mask;
}

/**
 * Fasada dla UI: czyta aktywne wojny i właściciela z `window.KOSMOS`.
 * ⚠ JEDYNE miejsce w tym module dotykające globalu — rdzeń wyżej zostaje czysty.
 */
export function readOccupier(bodyId) {
  const K = (typeof window !== 'undefined') ? window.KOSMOS : null;
  const wars = K?.warSystem?.listActive?.();
  if (!Array.isArray(wars) || wars.length === 0) return null;
  const colMgr = K?.colonyManager;
  return occupierOf(bodyId, {
    activeWars: wars,
    ownerOf: (id) => normalizeOwner(colMgr?.getColony?.(id) ?? null),
  });
}

/**
 * Fasada etykiety: łączy `readOccupier` z bramką wywiadu i nazwą imperium.
 * @param {string|null} who
 * @param {string} playerLabel — przetłumaczone „Gracz" (moduł nie zna słownika)
 */
export function readOccupierName(who, playerLabel) {
  if (!who) return null;
  const K = (typeof window !== 'undefined') ? window.KOSMOS : null;
  const emp = K?.empireRegistry?.get?.(who) ?? null;
  const intelKnown = K?.intelSystem?.isAtLeast?.(who, 'contact') === true;
  return occupierDisplayName(who, {
    playerLabel,
    empireName: emp?.namePL ?? emp?.name ?? null,
    intelKnown,
  });
}
