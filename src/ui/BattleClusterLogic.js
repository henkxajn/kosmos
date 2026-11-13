// BattleClusterLogic — JEDNA BITWA NA EKRANIE = KLASTER STARĆ (ARC COMBAT VISUALS, krok CV-3a2; Finding 638,
// decyzja właściciela §3.2-3: jeden wiersz karty walki i JEDEN baner wyniku na klaster).
//
// ⚠ Czysta logika — importuje wyłącznie czysty `BattleStageLogic` (zero importów), więc wykonuje się pod node: keeper
//   sprawdza ją WYKONANIEM (wzór `CombatWatchLogic`, `FleetPictureLogic`).
//
// DSCS nie łączy starć: rozkaz „Zaangażuj” na drugi statek pary wyzwalającej zaczyna starcie od tej pary, a reszta dołącza
// pojedynczo, więc zwykła gra daje kilka starć w jednym miejscu, każde z własnym wierszem karty i własnym banerem
// (Finding 638; zmierzone: 5 na 5 z celem na statek → dwa równoległe starcia 0,15 AU od siebie). Scena bitwy (CV-3a1)
// rysuje je jako jedną bitwę; ta sama reguła klastra (`encounterClusters` — pozycje LOGICZNE uczestników, ten sam układ,
// środki ≤ 0,30 AU, pojedyncze wiązanie, id = najmniejsze id starcia) daje tu kartę z jednym wierszem na klaster i jeden
// baner wyniku na klaster — po OSTATNIM `battle:resolved` klastra. Od CV-6b2 (#639) tę samą grupę czyta
// narrator Dziennika (`CombatNarration` — jedna linia bitwy i jedna potyczki na klaster) i pasek walki (`CombatStripLogic`).
// #675 (krok poza CV, §3.2-25) — okno łaski przed ogłoszeniem: dobicie zaczęte zaraz po końcu klastra ze statkami tej bitwy
// dołącza do jej ogłoszenia (`clusterGraceJoin` / `clusterGraceDue`, pokrętło `CLUSTER_GRACE`).
// Logiki walki (DSCS) nikt tu nie dotyka — moduł czyta starcia i wyniki, niczego nie zapisuje w stanie gry.

import { STAGE, encounterClusters } from '../renderer/combat/BattleStageLogic.js';

/** Promień klastra starć w px rozgrywki (ta sama stała co scena bitwy: `STAGE.CLUSTER_AU`). */
export function clusterRadiusPx(auToPx) {
  return STAGE.CLUSTER_AU * auToPx;
}

const byIdAsc = (a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);

/**
 * Widok scalony kilku starć klastra (dawny kształt wiersza karty walki; dziś — oś rund paska walki, `stripLog`): strony
 * (statki pierwotne i dołączone wszystkich starć), stany statków, oś rund wyrównana do końca (ostatnie rundy wszystkich
 * starć na końcu — log „najnowsze najpierw”), runda = najdłuższa, punkt i id — starcia o najmniejszym id (klaster).
 * @param {object[]} encs — starcia klastra (≥ 1)
 * @param {{ labelFor?: (ownerEmpireId:string|null, count:number, fallback:string) => string }} [o] — etykieta strony
 *   (wołający podaje tłumaczenie); brak — etykieta starcia o najmniejszym id
 */
export function mergeEncounterView(encs, { labelFor = null } = {}) {
  const sorted = [...(encs ?? [])].filter(Boolean).sort(byIdAsc);
  const primary = sorted[0];
  if (!primary) return null;
  const side = (k) => {
    const vesselIds = [], joinedVesselIds = [];
    for (const e of sorted) {
      vesselIds.push(...(e[k]?.vesselIds ?? []));
      joinedVesselIds.push(...(e[k]?.joinedVesselIds ?? []));
    }
    const owner = primary[k]?.ownerEmpireId ?? null;
    const fallback = primary[k]?.label ?? '';
    const n = vesselIds.length + joinedVesselIds.length;
    return { vesselIds, joinedVesselIds, ownerEmpireId: owner, label: labelFor ? labelFor(owner, n, fallback) : fallback };
  };
  const vesselStates = new Map();
  for (const e of sorted) for (const [id, st] of e.vesselStates ?? []) vesselStates.set(id, st);
  const maxLen = Math.max(0, ...sorted.map((e) => e.timeline?.length ?? 0));
  const timeline = [];
  for (let o = maxLen - 1; o >= 0; o--) {
    for (const e of sorted) {
      const tl = e.timeline ?? [];
      const r = tl[tl.length - 1 - o];
      if (r) timeline.push(r);
    }
  }
  return {
    id: primary.id, clusterEncounterIds: sorted.map((e) => e.id), isActive: true,
    sideA: side('sideA'), sideB: side('sideB'), vesselStates, timeline,
    currentRound: Math.max(0, ...sorted.map((e) => e.currentRound ?? 0)),
    location: primary.location,
  };
}

// CV-Z — `combatCardRows` (wiersze karty walki) usunięte razem z kartą: bitwy paska liczy `CombatStripLogic.stripBattles`.

/**
 * Pozostałe AKTYWNE starcia klastra starcia `encounterId` (w chwili `battle:resolved` rozstrzygane starcie jest jeszcze
 * aktywne — DSCS gasi je po emisji; tu jest pomijane po id).
 */
export function clusterPeerIds(encounterId, encounters, { getPos, radius } = {}) {
  const list = (encounters ?? []).filter(Boolean);
  if (encounterId == null || list.length < 2 || typeof getPos !== 'function' || !(radius > 0)) return [];
  const cl = encounterClusters(list, getPos, radius).find((c) => c.encounterIds.includes(String(encounterId)));
  return cl ? cl.encounterIds.filter((id) => id !== String(encounterId)) : [];
}

/**
 * Scalony wynik klastra dla banera (`BattleIntroModal.showBattleOutcome`): werdykt z perspektywy gracza — więcej
 * wygranych starć klastra niż przegranych ⇒ zwycięstwo, odwrotnie ⇒ porażka; remis liczby starć ⇒ strona z mniejszymi
 * stratami, dalej remis ⇒ REMIS (`winner: null`); tury — najdłuższe starcie (starcia klastra biegną równolegle); straty —
 * sumy. Reszta (nazwy stron, źródło) — z ostatniego starcia klastra. Jedno starcie — bez zmian.
 */
export function mergeClusterBattles(list) {
  const items = (list ?? []).filter(Boolean);
  if (items.length <= 1) return items[0] ?? null;
  const last = items[items.length - 1];
  const ps = last.playerSide === 'B' ? 'B' : 'A';
  const other = ps === 'A' ? 'B' : 'A';
  let won = 0, lost = 0, lossP = 0, lossE = 0, turns = 0;
  for (const b of items) {
    const r = b.result ?? {};
    if (r.winner === ps) won++;
    else if (r.winner === other) lost++;
    const la = r.lossesA ?? 0, lb = r.lossesB ?? 0;
    if (ps === 'A') { lossP += la; lossE += lb; } else { lossP += lb; lossE += la; }
    turns = Math.max(turns, r.turns ?? 0);
  }
  const winner = won > lost ? ps : lost > won ? other : lossE > lossP ? ps : lossP > lossE ? other : null;
  const result = {
    ...(last.result ?? {}), winner, turns,
    lossesA: ps === 'A' ? lossP : lossE, lossesB: ps === 'A' ? lossE : lossP,
    clusterBattleIds: items.map((b) => b.battleId ?? b.result?.id ?? null),
  };
  return { ...last, result, clusterSize: items.length };
}

/**
 * Krok banera klastra przy `battle:resolved` starcia `encounterId`. `hold` — tablica grup czekających na resztę klastra
 * (stan wołającego, wyłącznie w pamięci): `{ items: battleData[], waitFor: Set<encounterId>, graceUntil: number|null }`.
 *   1. grupy czekające na TO starcie łączą się w jedną (łańcuch starć w czasie = jedna bitwa); bez takiej — nowa grupa;
 *   2. wynik starcia dołącza do grupy, a grupa zaczyna czekać na pozostałe AKTYWNE starcia klastra (`peerIds`);
 *   3. ze wszystkich grup znikają starcia już nieaktywne (`isActive`) — grupa nie zawiśnie na starciu, które skończyło się
 *      inną drogą; grupa bez czekania wychodzi — scalony wynik (`mergeClusterBattles`) — od razu (`graceMs` 0) albo po
 *      oknie łaski (#675: `graceMs` > 0 — wychodzi z `clusterGraceDue`).
 * @returns {object[]} banery do pokazania teraz (scalone wyniki gotowych grup; pusta — klaster jeszcze trwa)
 */
export function clusterBannerStep(hold, { encounterId, battleData, peerIds = [], isActive = () => false, nowMs = 0, graceMs = 0 }) {
  return clusterGroupStep(hold, { encounterId, item: battleData, peerIds, isActive, nowMs, graceMs }).map((items) => mergeClusterBattles(items));
}

/**
 * ARC CV-6b2 (Finding 639) — krok grupowania klastra bez scalania: ta sama reguła co `clusterBannerStep` (łańcuch starć
 * w czasie = jedna grupa, czekanie na pozostałe AKTYWNE starcia klastra, grupa nie wisi na starciu nieaktywnym), ale wynikiem
 * są SUROWE grupy elementów — baner scala je (`mergeClusterBattles`), Dziennik (`CombatNarration`) czyta z nich też potyczki.
 *
 * #675 (decyzja właściciela §3.2-25) — OKNO ŁASKI: przy `graceMs` > 0 grupa, której nie zostało już żadne aktywne starcie,
 * nie wychodzi od razu, tylko czeka `graceMs` czasu prezentacji (`graceUntil`); starcie zaczęte w tym oknie ze statkami tej
 * bitwy (dobicie ostatniego wroga, ponowne zwarcie uciekiniera — #657) dołącza do grupy (`clusterGraceJoin`), a grupa wychodzi
 * z `clusterGraceDue`, gdy okno minie bez dołączenia. `graceMs` 0 — wyjście od razu (zachowanie sprzed kroku).
 * @param {object[]} hold — stan wołającego
 * @param {{ encounterId:string, item:object, peerIds?:string[], isActive?:(id:string)=>boolean, nowMs?:number, graceMs?:number }} p
 * @returns {Array<object[]>} grupy gotowe teraz (elementy w kolejności rozstrzygnięć)
 */
export function clusterGroupStep(hold, { encounterId, item, peerIds = [], isActive = () => false, nowMs = 0, graceMs = 0 }) {
  const battleData = item;
  const id = String(encounterId);
  const linked = hold.filter((g) => g.waitFor.has(id));
  const g = linked[0] ?? { items: [], waitFor: new Set(), graceUntil: null };
  for (const other of linked.slice(1)) {
    g.items.push(...other.items);
    for (const w of other.waitFor) g.waitFor.add(w);
    hold.splice(hold.indexOf(other), 1);
  }
  if (!linked.length) hold.push(g);
  g.waitFor.delete(id);
  g.items.push(battleData);
  g.graceUntil = null;   // nowy wynik w grupie — okno łaski (jeśli było) liczy się od nowa
  for (const p of peerIds) if (String(p) !== id) g.waitFor.add(String(p));
  return _releaseReady(hold, { isActive, nowMs, graceMs });
}

/**
 * #675 — starcie zaczęte (`vessel:engaged`) ze statkami bitwy, która czeka (na swoje starcia albo w oknie łaski), dołącza do
 * niej: grupa czeka teraz także na to starcie, a okno łaski gaśnie (zacznie się od nowa, gdy grupie nie zostanie żadne
 * aktywne starcie). Statki bitwy — uczestnicy jej rozstrzygniętych starć (`result.participantA/B.vesselIds`). Kilka grup
 * z tymi statkami — wszystkie czekają na to starcie, a jego rozstrzygnięcie łączy je w jedną (`clusterGroupStep`, krok 1).
 * @param {object[]} hold — stan wołającego
 * @param {{ encounterId:string, vesselIds:string[] }} p
 * @returns {number} ile grup dołączyło starcie
 */
export function clusterGraceJoin(hold, { encounterId, vesselIds = [] }) {
  if (encounterId == null || !hold?.length) return 0;
  const id = String(encounterId);
  const ships = new Set((vesselIds ?? []).map(String));
  if (!ships.size) return 0;
  let joined = 0;
  for (const g of hold) {
    if (g.waitFor.has(id) || !_groupShips(g).some((s) => ships.has(s))) continue;
    g.waitFor.add(id);
    g.graceUntil = null;
    joined++;
  }
  return joined;
}

/**
 * #675 — grupy, którym minęło okno łaski (żadne starcie nie dołączyło), wychodzą; grupa, której właśnie skończyło się
 * ostatnie czekanie inną drogą (`isActive`), zaczyna swoje okno teraz. Wołane raz na klatkę (zegar prezentacji — pauza
 * zatrzymuje okno).
 * @returns {Array<object[]>} grupy gotowe teraz
 */
export function clusterGraceDue(hold, { nowMs = 0, graceMs = 0, isActive = () => false } = {}) {
  if (!hold?.length) return [];
  return _releaseReady(hold, { isActive, nowMs, graceMs });
}

/** #675 — `clusterGraceDue` dla banera: scalone wyniki grup, którym minęło okno łaski (lustro `clusterBannerStep`). */
export function clusterBannerDue(hold, opts = {}) {
  return clusterGraceDue(hold, opts).map((items) => mergeClusterBattles(items));
}

/** Statki rozstrzygniętych starć grupy (uczestnicy obu stron z wyników) — klucz dołączenia dobicia (#675). */
function _groupShips(g) {
  const out = [];
  for (const it of g.items ?? []) {
    const r = it?.result ?? null;
    for (const p of [r?.participantA, r?.participantB]) for (const v of p?.vesselIds ?? []) out.push(String(v));
  }
  return out;
}

/** Wspólny koniec kroku: czekanie bez nieaktywnych starć; grupa bez czekania wychodzi od razu albo po oknie łaski. */
function _releaseReady(hold, { isActive, nowMs, graceMs }) {
  const out = [];
  for (const h of [...hold]) {
    for (const w of [...h.waitFor]) if (!isActive(w)) h.waitFor.delete(w);
    if (h.waitFor.size > 0) continue;
    if (graceMs > 0) {
      if (h.graceUntil == null) h.graceUntil = nowMs + graceMs;
      if (nowMs < h.graceUntil) continue;
    }
    hold.splice(hold.indexOf(h), 1);
    out.push(h.items);
  }
  return out;
}

/**
 * #675 (decyzja właściciela §3.2-25) — okno łaski przed ogłoszeniem wyniku bitwy, w RUNDACH oglądanego starcia (pokrętło
 * na żywo: `KOSMOS.debug.battleGrace(r)`; 0 — bez okna, ogłoszenie od razu jak przed krokiem). Zmierzone przed kodem: dobicie
 * ostatniego wroga i ponowne zwarcie uciekiniera (#657) zaczynają się w TEJ SAMEJ klatce co ostatnie `battle:resolved`
 * klastra (odstęp 0 ms na split 4v4, ziarna 1–3) — okno łapie je zawsze, a półtorej rundy daje graczowi chwilę na zobaczenie
 * końca walki przed banerem.
 */
export const CLUSTER_GRACE = { ROUNDS: 1.5 };

/** Okno łaski w ms czasu prezentacji dla rundy `roundMs` (czas realny rundy oglądanego starcia — `combatRoundMs`). */
export function clusterGraceMs(roundMs) {
  const r = Number(CLUSTER_GRACE.ROUNDS);
  const ms = Number(roundMs);
  return r > 0 && ms > 0 ? r * ms : 0;
}
