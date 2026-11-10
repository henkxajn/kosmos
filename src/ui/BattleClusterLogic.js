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
// baner wyniku na klaster — po OSTATNIM `battle:resolved` klastra. Od CV-6b2 (#639, flaga `cvStrip`) tę samą grupę czyta
// narrator Dziennika (`CombatNarration` — jedna linia bitwy i jedna potyczki na klaster) i pasek walki (`CombatStripLogic`).
// Logiki walki (DSCS) nikt tu nie dotyka — moduł czyta starcia i wyniki, niczego nie zapisuje w stanie gry.

import { STAGE, encounterClusters } from '../renderer/combat/BattleStageLogic.js';

/** Promień klastra starć w px rozgrywki (ta sama stała co scena bitwy: `STAGE.CLUSTER_AU`). */
export function clusterRadiusPx(auToPx) {
  return STAGE.CLUSTER_AU * auToPx;
}

const byIdAsc = (a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);

/**
 * Widok scalony kilku starć klastra — kształt starcia, który rysuje karta walki (`CombatHUD._drawEncounterRow`): strony
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

/**
 * Wiersze karty walki — jeden na klaster starć. Klaster jednego starcia — samo starcie (rysunek bez zmian); kilku —
 * widok scalony (`mergeEncounterView`). Gdy żaden klaster nie łączy starć — lista wejściowa bez zmian (kolejność też).
 * @param {object[]} encounters — aktywne starcia (`DSCS.listActive()`)
 * @param {{ getPos: (vesselId:string) => ({x:number,y:number}|null), radius: number, labelFor?: Function }} o
 */
export function combatCardRows(encounters, { getPos, radius, labelFor = null } = {}) {
  const list = (encounters ?? []).filter(Boolean);
  if (list.length < 2 || typeof getPos !== 'function' || !(radius > 0)) return list;
  const clusters = encounterClusters(list, getPos, radius);
  if (clusters.length === list.length) return list;
  const byId = new Map(list.map((e) => [e.id, e]));
  return clusters.map((cl) => {
    const encs = cl.encounterIds.map((id) => byId.get(id)).filter(Boolean);
    return encs.length === 1 ? encs[0] : mergeEncounterView(encs, { labelFor });
  });
}

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
 * (stan wołającego, wyłącznie w pamięci): `{ items: battleData[], waitFor: Set<encounterId> }`.
 *   1. grupy czekające na TO starcie łączą się w jedną (łańcuch starć w czasie = jedna bitwa); bez takiej — nowa grupa;
 *   2. wynik starcia dołącza do grupy, a grupa zaczyna czekać na pozostałe AKTYWNE starcia klastra (`peerIds`);
 *   3. ze wszystkich grup znikają starcia już nieaktywne (`isActive`) — grupa nie zawiśnie na starciu, które skończyło się
 *      inną drogą; grupa bez czekania wychodzi — scalony wynik (`mergeClusterBattles`).
 * @returns {object[]} banery do pokazania teraz (scalone wyniki gotowych grup; pusta — klaster jeszcze trwa)
 */
export function clusterBannerStep(hold, { encounterId, battleData, peerIds = [], isActive = () => false }) {
  return clusterGroupStep(hold, { encounterId, item: battleData, peerIds, isActive }).map((items) => mergeClusterBattles(items));
}

/**
 * ARC CV-6b2 (Finding 639) — krok grupowania klastra bez scalania: ta sama reguła co `clusterBannerStep` (łańcuch starć
 * w czasie = jedna grupa, czekanie na pozostałe AKTYWNE starcia klastra, grupa nie wisi na starciu nieaktywnym), ale wynikiem
 * są SUROWE grupy elementów — baner scala je (`mergeClusterBattles`), Dziennik (`CombatNarration`) czyta z nich też potyczki.
 * @returns {Array<object[]>} grupy gotowe teraz (elementy w kolejności rozstrzygnięć)
 */
export function clusterGroupStep(hold, { encounterId, item, peerIds = [], isActive = () => false }) {
  const battleData = item;
  const id = String(encounterId);
  const linked = hold.filter((g) => g.waitFor.has(id));
  const g = linked[0] ?? { items: [], waitFor: new Set() };
  for (const other of linked.slice(1)) {
    g.items.push(...other.items);
    for (const w of other.waitFor) g.waitFor.add(w);
    hold.splice(hold.indexOf(other), 1);
  }
  if (!linked.length) hold.push(g);
  g.waitFor.delete(id);
  g.items.push(battleData);
  for (const p of peerIds) if (String(p) !== id) g.waitFor.add(String(p));
  const out = [];
  for (const h of [...hold]) {
    for (const w of [...h.waitFor]) if (!isActive(w)) h.waitFor.delete(w);
    if (h.waitFor.size > 0) continue;
    hold.splice(hold.indexOf(h), 1);
    out.push(h.items);
  }
  return out;
}
