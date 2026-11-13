// RaidAnnounceLogic — JEDNO OGŁOSZENIE NA RAJD (ARC COMBAT VISUALS, krok CV-8b; Finding 635, decyzja właściciela 48 (9)).
//
// ⚠ Czysta logika — importuje wyłącznie czysty `BattleSides` (zero importów), więc wykonuje się pod node: keeper sprawdza ją
//   WYKONANIEM na prawdziwym łańcuchu bitew (DSCS → EAH), wzór `BattleClusterLogic` / `CombatNarration`.
//
// Mechanika (nietknięta, przyszły arc MECHANIKI — decyzja 48 (9)): jedno uderzenie AI na kolonię rozstrzyga się DWA razy — starciem
// DSCS w podejściu (okręty gracza na orbicie celu) i bitwą orbitalną EAH po przylocie ocalałych rajderów, którym DSCS wznowił misję
// `attack` (F130). Dwa rekordy, dwa wyczerpania — i dotąd dwa banery i dwie linie Dziennika o jednym rajdzie (sonda
// `probe-635-double-resolution`). Tu prezentacja składa je w JEDNO ogłoszenie:
//   1. GRUPĘ RAJDU (rajderzy = statki strony wroga) otwiera bitwa, po której rajd trwa: starcie DSCS, po którym któryś rajder dalej
//      leci z misją `attack` (zwykła kolejność — podejście, potem kolonia), albo bitwa EAH, której rajder walczy jeszcze w aktywnym
//      starciu DSCS (kolejność odwrotna — rajder dotarł na orbitę celu i wpadł w zasięg okrętów na orbicie w oknie partii EAH; EAH
//      rozstrzyga, starcie DSCS kończy się po nim); kolejne bitwy, których strona wroga ma wspólny statek z grupą, dołączają;
//   2. baner każdej bitwy grupy (gotowy — po klastrze i oknie łaski #675, po powtórce na scenie planety CV-8a) jest PARKOWANY;
//      linia bitwy w Dzienniku — połykana (zastąpi ją jedna linia scalona); wpisy skutków EAH (#713) — parkowane;
//   3. grupa wychodzi, gdy nie czeka już na baner żadnej swojej bitwy i żaden rajder nie jest „w drodze” (`busy` — żywy, z misją
//      `attack`, jeszcze nie na orbicie celu, albo w aktywnym starciu), po oknie łaski (przylot → partia EAH 500 ms czasu realnego);
//      wynik scalony (`mergeRaidBattles`): zwycięzca — OSTATNIEJ bitwy (bitwa o kolonię rozstrzyga rajd), straty — sumą po stronie
//      gracza i wroga, tury — sumą (bitwy rajdu idą po kolei, nie równolegle jak starcia klastra);
//   4. SUFIT CZEKANIA (`RAID_ANNOUNCE.HOLD_MAX_MS`, czas prezentacji od chwili, gdy grupa nie czeka już na żaden baner): planeta biegnie
//      po orbicie szybciej niż okręty — zmierzone na żywo, ocaleli rajderzy po podejściu potrafią gonić kolonię dziesiątki sekund (a baner
//      podejścia czekałby cały ten czas); po sufit grupa wychodzi z tym, co ma, a późniejsza bitwa o kolonię ma własne ogłoszenie.
// Bitwa EAH bez podejścia (zwykła obrona kolonii) grupy nie otwiera — jej strona wroga po bitwie albo stoi na orbicie bez misji,
// albo jest wrakiem — więc dwa osobne rajdy dają dwa ogłoszenia. Stan tylko w pamięci (po wczytaniu zapisu nic nie czeka).

import { isPlayerParticipant } from '../utils/BattleSides.js';
import { battleShipLosses } from './BattleShipLosses.js';   // CV-Z (Finding 721) — utracone okręty w liczbach

const RELEASED_CAP = 400;   // pamięć bitew już ogłoszonych w grupie (spóźniona linia — połknięta, bez dubla)

/** Strojenie (na sesję, z konsoli przez `GameScene` — `KOSMOS.debug.raidHold(ms)`): sufit czekania grupy na rajdera w drodze [ms prezentacji]. */
export const RAID_ANNOUNCE = { HOLD_MAX_MS: 15000 };

/** Ids statków strony WROGA bitwy (strona bez gracza; obie bez gracza — pusta lista). */
export function raidEnemyIds(result) {
  const a = result?.participantA, b = result?.participantB;
  const pa = isPlayerParticipant(a), pb = isPlayerParticipant(b);
  if (pa === pb) return [];
  const enemy = pa ? b : a;
  return [...(enemy?.vesselIds ?? []), ...(enemy?.joinedVesselIds ?? [])].map(String);
}

/** Misja ataku statku — bieżąca albo zawieszona na czas starcia (`_suspendedMission`, F130). Nigdy `??` (lekcja Findingu 111). */
export function attackMissionOf(v) {
  if (v?.mission?.type === 'attack') return v.mission;
  if (v?._suspendedMission?.type === 'attack') return v._suspendedMission;
  return null;
}

/** Rajder dalej rajduje: żywy statek z misją `attack` (po bitwie DSCS — wznowioną przed `battle:resolved`). */
export function stillRaiding(v) {
  return !!v && !v.isWreck && !!attackMissionOf(v);
}

/**
 * Rajder „w drodze” — grupa rajdu na niego czeka: żywy statek w aktywnym starciu (`inCombat`) albo z misją `attack`, który jeszcze
 * nie stoi na orbicie celu. Na orbicie celu z misją `attack` — przyleciał (partia EAH, 500 ms czasu realnego, mieści się w oknie łaski
 * grupy; EAH bez bitwy — cel już własny albo układ bez obecności gracza — nie zawiesza grupy).
 */
export function raidBusy(v, { inCombat = () => false } = {}) {
  if (!v || v.isWreck) return false;
  if (inCombat(String(v.id))) return true;
  const m = attackMissionOf(v);
  if (!m) return false;
  const p = v.position ?? {};
  const target = m.targetId ?? null;
  return !(p.state === 'orbiting' && target != null && p.dockedAt === target);
}

/** Id bitew elementu banera (baner klastra niesie `result.clusterBattleIds`, scalony rajd — `result.raidBattleIds`). */
function bannerBattleIds(b) {
  const r = b?.result ?? {};
  const ids = r.raidBattleIds ?? r.clusterBattleIds ?? [b?.battleId ?? r.id ?? null];
  return ids.filter((x) => x != null).map(String);
}

/**
 * Scalony wynik rajdu (baner i linia Dziennika). Orientacja stron — ostatniej bitwy (bitwa o kolonię: A = wróg, B = gracz);
 * zwycięzca i odwrót — ostatniej bitwy; straty — sumą po stronie gracza i wroga (każda bitwa przeliczona na stronę gracza,
 * `playerSide`); tury — sumą. Jedna bitwa — bez zmian. Rekordy bitew nietknięte (nowe obiekty).
 * CV-Z (Finding 721) — straty liczone w OKRĘTACH (`battleShipLosses`: liczby z każdej bitwy — DSCS z `lossesA/B`, bitwa orbitalna
 *   z `fx.shipsLost`), bez podwójnego liczenia (wrak z podejścia nie walczy w bitwie o kolonię). Dawniej suma `lossesA/B` mieszała
 *   jednostki (DSCS — statki, BattleSystem — HP; na żywo „Straty: 666 / 494”). Scalone liczby trafiają do `shipLosses` (baner)
 *   i do `lossesA/B` wyniku SCALONEGO (linia Dziennika rajdu) — rekordy bitew nietknięte. Bitwa bez liczby okrętów w rajdzie —
 *   `shipLosses: null` (baner bez strat zamiast liczby bez sensu), `lossesA/B` — dawna suma.
 */
export function mergeRaidBattles(items) {
  const list = (items ?? []).filter(Boolean);
  if (list.length <= 1) return list[0] ?? null;
  const last = list[list.length - 1];
  const ps = last.playerSide === 'A' || last.playerSide === 'B' ? last.playerSide : null;
  let lossP = 0, lossE = 0, lossA = 0, lossB = 0, turns = 0;
  let shipP = 0, shipE = 0, shipA = 0, shipB = 0, shipsKnown = true;
  const ids = [];
  for (const it of list) {
    const r = it.result ?? {};
    const la = Number(r.lossesA ?? 0) || 0, lb = Number(r.lossesB ?? 0) || 0;
    lossA += la; lossB += lb;
    const pi = it.playerSide === 'A' || it.playerSide === 'B' ? it.playerSide : null;
    if (pi === 'A') { lossP += la; lossE += lb; } else if (pi === 'B') { lossP += lb; lossE += la; }
    const sl = battleShipLosses(it);
    if (!sl) shipsKnown = false;
    else {
      shipA += sl.A; shipB += sl.B;
      if (pi === 'A') { shipP += sl.A; shipE += sl.B; } else if (pi === 'B') { shipP += sl.B; shipE += sl.A; }
    }
    turns += Number(r.turns ?? 0) || 0;
    ids.push(...bannerBattleIds(it));
  }
  const shipLosses = shipsKnown
    ? { A: ps ? (ps === 'A' ? shipP : shipE) : shipA, B: ps ? (ps === 'A' ? shipE : shipP) : shipB }
    : null;
  const result = {
    ...(last.result ?? {}), turns,
    lossesA: shipLosses ? shipLosses.A : (ps ? (ps === 'A' ? lossP : lossE) : lossA),
    lossesB: shipLosses ? shipLosses.B : (ps ? (ps === 'A' ? lossE : lossP) : lossB),
    raidBattleIds: ids,
  };
  return { ...last, result, shipLosses, raidSize: list.length };
}

export class RaidAnnouncer {
  constructor() {
    this._groups = [];            // { raiders:Set, battleIds:Set, kinds:Map, pendBanner:Set, items:[], extras:[], seq, graceUntil }
    this._released = new Set();   // bitwy ogłoszone w grupie (spóźniona linia — połknięta)
    this._seq = 0;
  }

  /** Ile rajdów czeka na ogłoszenie (diagnostyka, keeper). */
  get holding() { return this._groups.length; }

  _groupOf(battleId) {
    const id = String(battleId);
    return this._groups.find((g) => g.battleIds.has(id)) ?? null;
  }

  /**
   * `battle:resolved` bitwy z graczem, dla której wyjdzie baner (wołający: po wszystkich bramkach banera). Bitwa, po której rajd trwa
   * (`continuing` — podejście: rajderzy dalej z misją `attack`; kolonia: rajderzy w aktywnym starciu DSCS), otwiera grupę; bitwa, której
   * strona wroga ma wspólny statek z grupą, dołącza (kolejne grupy z tym statkiem łączą się).
   * @param {{ battleId:string, kind:'approach'|'colony', enemyIds:string[], continuing?:string[] }} p
   * @returns {object|null} grupa albo null (bitwa poza rajdem)
   */
  noteBattle({ battleId, kind, enemyIds = [], continuing = [] }) {
    if (battleId == null) return null;
    const id = String(battleId);
    const ships = new Set((enemyIds ?? []).map(String));
    const linked = this._groups.filter((g) => [...ships].some((s) => g.raiders.has(s)));
    let g = linked[0] ?? null;
    for (const other of linked.slice(1)) {
      for (const s of other.raiders) g.raiders.add(s);
      for (const b of other.battleIds) g.battleIds.add(b);
      for (const [b, k] of other.kinds) g.kinds.set(b, k);
      for (const b of other.pendBanner) g.pendBanner.add(b);
      g.items.push(...other.items);
      g.extras.push(...other.extras);
      this._groups.splice(this._groups.indexOf(other), 1);
    }
    if (!g) {
      if (!(continuing ?? []).length) return null;
      g = { raiders: new Set(), battleIds: new Set(), kinds: new Map(), pendBanner: new Set(), items: [], extras: [], seq: ++this._seq, graceUntil: null, readySince: null };
      this._groups.push(g);
    }
    for (const s of ships) g.raiders.add(s);
    g.battleIds.add(id);
    g.kinds.set(id, kind === 'colony' ? 'colony' : 'approach');
    g.pendBanner.add(id);
    g.graceUntil = null;
    g.readySince = null;
    return g;
  }

  /** Czy bitwa należy do czekającej grupy rajdu. */
  isRaidBattle(battleId) {
    return battleId != null && !!this._groupOf(battleId);
  }

  /**
   * Gotowy baner (po klastrze, oknie łaski, powtórce): bitwa grupy — zaparkowany (true); inaczej false (wołający pokazuje go jak dotąd).
   * Baner klastra obejmujący bitwę grupy parkuje się w całości (to już jedno ogłoszenie).
   */
  offerBanner(banner) {
    const ids = bannerBattleIds(banner);
    const g = ids.map((id) => this._groupOf(id)).find(Boolean);
    if (!g) return false;
    g.items.push({ banner, rank: Math.max(...ids.map((id) => (g.kinds.get(id) === 'colony' ? 1 : 0))), seq: g.items.length });
    for (const id of ids) g.pendBanner.delete(id);
    g.graceUntil = null;
    g.readySince = null;
    return true;
  }

  /** Linia bitwy w Dzienniku: bitwa grupy albo już ogłoszona w scalonej linii — połknięta (true). */
  offerLine(battleIds = []) {
    for (const raw of battleIds ?? []) {
      if (raw == null) continue;
      const id = String(raw);
      if (this._groupOf(id) || this._released.has(id)) return true;
    }
    return false;
  }

  /** Wpisy skutków bitwy EAH (#713): bitwa grupy — zaparkowane do ogłoszenia rajdu (true). */
  offerExtras(battleId, entries = []) {
    const g = battleId != null ? this._groupOf(battleId) : null;
    if (!g) return false;
    g.extras.push(...(entries ?? []).filter(Boolean));
    return true;
  }

  /**
   * Raz na klatkę (zegar prezentacji): grupy bez czekających banerów, bez rajdera w drodze (`busy`), po oknie łaski — wychodzą; grupa
   * bez czekających banerów, której rajder dalej jest w drodze — po `holdMaxMs` od chwili, gdy przestała czekać na banery (sufit).
   * @param {{ nowMs:number, graceMs:number, busy:(vesselId:string)=>boolean, holdMaxMs?:number }} p
   * @returns {Array<{ banner:object, extras:object[], battleIds:string[], capped:boolean }>}
   */
  releaseDue({ nowMs = 0, graceMs = 0, busy = () => false, holdMaxMs = RAID_ANNOUNCE.HOLD_MAX_MS } = {}) {
    const out = [];
    for (const g of [...this._groups]) {
      if (g.pendBanner.size) { g.graceUntil = null; g.readySince = null; continue; }
      if (g.readySince == null) g.readySince = nowMs;
      const capped = holdMaxMs > 0 && nowMs - g.readySince >= holdMaxMs;
      if (!capped) {
        if ([...g.raiders].some((id) => busy(id))) { g.graceUntil = null; continue; }
        if (graceMs > 0) {
          if (g.graceUntil == null) g.graceUntil = nowMs + graceMs;
          if (nowMs < g.graceUntil) continue;
        }
      }
      this._groups.splice(this._groups.indexOf(g), 1);
      const items = [...g.items].sort((a, b) => a.rank - b.rank || a.seq - b.seq).map((x) => x.banner);
      for (const id of g.battleIds) {
        this._released.add(id);
        if (this._released.size > RELEASED_CAP) this._released.delete(this._released.values().next().value);
      }
      out.push({ banner: mergeRaidBattles(items), extras: g.extras, battleIds: [...g.battleIds], capped });
    }
    return out;
  }
}
