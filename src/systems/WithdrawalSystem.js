// WithdrawalSystem — AI GARRISON G2-4 (D14; zakres R3–R5 podpisany 2026-10-03, `AI_GARRISON_PLAN.md` §5p):
// wycofanie wojsk po pokoju.
//
// R3 — przy podpisaniu pokoju (`diplomacy:peaceSigned` — emitowane PO wykonaniu cesji z traktatu,
//      `DiplomacySystem.offerPeace`) każda jednostka naziemna GRACZA stojąca na ciele drugiej strony dostaje flagę
//      wycofania z terminem 6 wyświetlanych miesięcy (= 6 civY). Flaga znika, gdy jednostka jest w ładowni statku,
//      gdy ciało staje się gracza albo gdy wojna z jego właścicielem wraca. Po terminie jednostka jest usuwana
//      i traktowana jak polegli: `groundUnit:destroyed` → reintegracja POP po śmierci w `ColonyManager`.
//      Ta sama flaga obejmuje jednostki gracza na ciele oddanym AI w traktacie (Finding 358): cesja wykonuje się
//      PRZED zdarzeniem, więc takie ciało jest w chwili flagowania ciałem drugiej strony.
// R4 — jednostki imperium, z którym zawarto pokój, stojące na ciałach gracza, znikają od razu (AI nie ma POP).
// R5 — meldunki jako zdarzenia: `withdrawal:ordered` (pokój: ile jednostek, które ciało, termin),
//      `withdrawal:warning` (miesiąc przed terminem), `withdrawal:expired` (po terminie). Teksty, Dziennik i dzwonek
//      — `NotificationCenter`; karta jednostki czyta flagę wprost z jednostki.
// F3 (Finding 366, decyzja właściciela 2026-10-03) — stary zapis: jednostki gracza stojące w POKOJU na ciele innego
//      imperium, bez flagi, dostają ją przy WCZYTANIU (`GameScene` uzbraja po `groundUnitManager.restore`, uzgodnienie
//      biegnie na pierwszym ticku — własność kolonii i relacje są już odtworzone); termin = chwila wczytania + 0,5 roku.
//      Sesja bez wczytania (nowa gra, uprząż keeperów) — nic: uzgodnienie należy do WCZYTANIA, nie do pierwszego ticku.
// (d) (odpowiedź właściciela 2026-10-04) — w tym samym uzgodnieniu jednostki IMPERIUM stojące na ciele GRACZA, gdy ich
//      imperium nie jest z graczem w wojnie, znikają jak przy R4 (zapisy sprzed G2-4: R4 działa tylko przy podpisaniu
//      pokoju); jeden meldunek na ciało i imperium (`withdrawal:aiRemoved`, `reason: 'load'`).
// (e) (odpowiedź właściciela 2026-10-04) — w tym samym uzgodnieniu kafle kolonii zajęte przez stronę, która NIE jest
//      w wojnie z właścicielem kolonii, wracają do właściciela, a jej liczniki okupacji są zerowane — reguła F1 dla wojen
//      zakończonych pokojem PRZED F1 (F1 działa w chwili pokoju, więc kafle z tamtych wojen zostawały przy zajmującym).
// F1 (Finding 363, decyzja właściciela 2026-10-03) — przy pokoju kafle zajęte w wojnie wracają do właściciela kolonii,
//      na koloniach OBU stron, a liczniki okupacji są zerowane (`TileOwnership.revertPeaceOccupation`). Bez tego kafel
//      stolicy AI trzymany przez gracza przeżywał pokój i nowa wojna dawała przejęcie bez jednej jednostki na ciele.
//
// ⚠ Stan flagi siedzi NA JEDNOSTCE (`unit.withdrawal = { empireId, orderedYear, deadline, warned }`) i jedzie z nią
//   przez zapis (`GroundUnitManager.serialize/restore`); ten system nie ma własnego stanu.
// ⚠ Czas: `timeSystem.gameTime` (lata WYŚWIETLANE), jak licznik okupacji: 6 miesięcy = 0,5 roku = 6 civY.
// ⚠ Brak ognia i okupacji w oknie wycofania daje R1 (`WarGate.groundOwnersHostile`) — ta flaga niczego nie bramkuje,
//   poza własnym terminem.
// ⚠ Kolaboratorzy leniwie przez `window.KOSMOS` (zero importów systemów).

import EventBus from '../core/EventBus.js';
import { bodyOwnerOf, areAtWar, groundOwnersHostile } from '../utils/WarGate.js';
import { revertPeaceOccupation } from '../utils/TileOwnership.js';

/** Termin wycofania w latach WYŚWIETLANYCH (6 miesięcy = 6 civY przy CIV_TIME_SCALE 12). */
export const WITHDRAWAL_YEARS = 0.5;
/** Ostrzeżenie: miesiąc wyświetlany przed terminem (lata WYŚWIETLANE). */
export const WITHDRAWAL_WARNING_YEARS = 1 / 12;
// `gameTime` to suma zmiennoprzecinkowych kroków, więc próg „równo w terminie” wypada raz 0,4999999…, raz 0,5000…01
// (zmierzone: ostrzeżenie i usunięcie spóźnione o jeden tick). Tolerancja jest o rzędy mniejsza od kroku (1/12 roku).
const EPS = 1e-9;

/**
 * Czy termin wycofania `deadline` nadszedł w chwili `now` (lata WYŚWIETLANE, tolerancja `EPS`). JEDNO źródło odpowiedzi:
 * czyta je usunięcie jednostki po terminie (`_tick`) i dzwonek — ostrzeżenie „został miesiąc” od terminu nie gaśnie
 * samo (G2-4 (a), Finding 370, `NotificationCenter`). Dwie kopie progu rozjechałyby się na granicy ticku.
 * @param {number} now
 * @param {number} deadline
 * @returns {boolean}
 */
export function withdrawalDeadlineReached(now, deadline) {
  return now >= deadline - EPS;
}

const isPlayerUnit = (u) => (u?.owner ?? 'player') === 'player';
const pushTo = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };

export class WithdrawalSystem {
  constructor() {
    this._onPeace = ({ empireId } = {}) => { this.onPeaceSigned(empireId); };
    // Wojna wraca albo ciało przechodzi na gracza — flagi zdejmowane od razu, bez czekania na tick (także na pauzie).
    this._onReconcile = () => { this._tick({ expire: false }); };
    /** F3 — rok wczytania czekający na pierwszy tick (`null` = brak wczytania do uzgodnienia). */
    this._loadReconcileYear = null;
    this._onTick = () => {
      if (this._loadReconcileYear !== null) {
        const loadYear = this._loadReconcileYear;
        this._loadReconcileYear = null;                          // jednorazowo — przed pracą, bez ponowień
        this.reconcileAfterLoad(loadYear);
      }
      this._tick();
    };
    EventBus.on('diplomacy:peaceSigned', this._onPeace);
    EventBus.on('diplomacy:warDeclared', this._onReconcile);
    EventBus.on('colony:capturedByPlayer', this._onReconcile);
    EventBus.on('time:tick', this._onTick);
  }

  /** Usługi gry (w grze `window.KOSMOS`). */
  _K() { return (typeof window !== 'undefined') ? window.KOSMOS : null; }
  _now() { return this._K()?.timeSystem?.gameTime ?? 0; }

  /**
   * Jednostki gracza z flagą wycofania (tylko odczyt) — do konsoli: `KOSMOS.withdrawalSystem.listFlagged()`.
   * @returns {Array<{unitId, planetId, empireId, deadline, warned, status}>}
   */
  listFlagged() {
    return (this._K()?.groundUnitManager?.getAllUnits?.() ?? [])
      .filter(u => u?.withdrawal)
      .map(u => ({ unitId: u.id, planetId: u.planetId, empireId: u.withdrawal.empireId,
                   deadline: u.withdrawal.deadline, warned: u.withdrawal.warned === true, status: u.status }));
  }

  /**
   * R3 + R4 (+ F1) — pokój z imperium `empireId` został podpisany (po wykonaniu cesji).
   * @returns {{flagged:number, removed:number, reverted:number}}
   */
  onPeaceSigned(empireId) {
    const gum = this._K()?.groundUnitManager;
    if (!empireId || empireId === 'player' || typeof gum?.getAllUnits !== 'function') {
      return { flagged: 0, removed: 0, reverted: 0 };
    }
    const reverted = this.revertOccupationAtPeace(empireId);
    const now = this._now();
    const deadline = now + WITHDRAWAL_YEARS;
    const flagged = new Map();     // planetId → unitIds
    const doomed = [];
    for (const u of gum.getAllUnits()) {
      if (!u || u.status === 'in_cargo' || (u.hp ?? 0) <= 0) continue;
      const owner = bodyOwnerOf(u.planetId);
      if (isPlayerUnit(u)) {
        if (owner !== empireId) continue;                        // tylko ciała drugiej strony tego pokoju
        u.withdrawal = { empireId, orderedYear: now, deadline, warned: false };
        pushTo(flagged, u.planetId, u.id);
      } else if (u.owner === empireId && owner === 'player') {
        doomed.push(u);                                          // R4 — jednostki tego imperium na ciałach gracza
      }
    }
    const removed = new Map();
    for (const u of doomed) { gum.removeUnit(u.id); pushTo(removed, u.planetId, u.id); }
    for (const [planetId, unitIds] of removed) {
      EventBus.emit('withdrawal:aiRemoved', { empireId, planetId, unitIds, count: unitIds.length });
    }
    let total = 0;
    for (const [planetId, unitIds] of flagged) {
      total += unitIds.length;
      EventBus.emit('withdrawal:ordered', { empireId, planetId, unitIds, count: unitIds.length, deadlineYear: deadline });
    }
    return { flagged: total, removed: doomed.length, reverted };
  }

  /**
   * F1 (Finding 363) — pokój z `empireId` cofa okupację kafli na koloniach OBU stron: na kolonii gracza kafle imperium
   * wracają do gracza, na kolonii imperium kafle gracza wracają do imperium; liczniki okupacji stron pokoju zerowane.
   * Kolonie stron trzecich — nietknięte. Każdy cofnięty kafel emituje `tile:ownerChanged` (jedyny pisarz właściciela
   * kafla w silniku też emituje); audyt per kolonia: `withdrawal:tilesReverted`.
   * @returns {number} ile kafli wróciło do właściciela kolonii
   */
  revertOccupationAtPeace(empireId) {
    const cm = this._K()?.colonyManager;
    if (!empireId || empireId === 'player' || typeof cm?.getAllColonies !== 'function') return 0;
    let total = 0;
    for (const col of cm.getAllColonies()) {
      const owner = bodyOwnerOf(col?.planetId);
      const occupier = owner === 'player' ? empireId : (owner === empireId ? 'player' : null);
      if (!occupier) continue;
      const res = revertPeaceOccupation(col.grid, owner, occupier);
      for (const t of res.reverted) {
        EventBus.emit('tile:ownerChanged', { planetId: col.planetId, q: t.q, r: t.r, oldOwner: t.oldOwner, newOwner: owner });
      }
      if (res.reverted.length > 0 || res.reset > 0) {
        EventBus.emit('withdrawal:tilesReverted', {
          empireId, planetId: col.planetId, owner, count: res.reverted.length, reset: res.reset,
        });
      }
      total += res.reverted.length;
    }
    return total;
  }

  /**
   * F3 (Finding 366) — scena odtworzyła jednostki z zapisu: uzgodnienie wykona się na pierwszym ticku, z terminem
   * liczonym od TEJ chwili (`gameTime` jest już odtworzony). Woła `GameScene` po `groundUnitManager.restore`.
   */
  armLoadReconcile() {
    this._loadReconcileYear = this._now();
  }

  /**
   * F3 (Finding 366) — stary zapis: każda żywa jednostka gracza (nie w ładowni, BEZ flagi) stojąca na ciele imperium,
   * z którym gracz NIE jest w wojnie, dostaje flagę wycofania z terminem `loadYear + WITHDRAWAL_YEARS`. Flagi już
   * istniejące zostają z własnym terminem (bez dublowania). Meldunek jak przy pokoju: `withdrawal:ordered` raz na ciało,
   * z `reason: 'load'`.
   * (d) — w tym samym przebiegu jednostki IMPERIUM stojące na ciele GRACZA (nie w ładowni), gdy ich imperium nie jest
   * z graczem w wojnie, znikają jak przy R4 (AI nie ma POP — bez reintegracji); `withdrawal:aiRemoved` raz na ciało
   * i imperium, z `reason: 'load'`. Predykat „nie w wojnie” to `groundOwnersHostile` (R1 — ten sam, który decyduje o ogniu
   * i okupacji): przy żywej dyplomacji to samo co `areAtWar`, a bez modułu dyplomacji „wrogowie”, więc nic nie znika.
   * (e) — przed jednostkami: okupacja kafli stron bez wojny cofnięta (`revertOccupationAfterLoad`), jak F1 przy pokoju.
   * @returns {{flagged:number, removed:number, reverted:number}}
   */
  reconcileAfterLoad(loadYear = this._now()) {
    const reverted = this.revertOccupationAfterLoad();
    const gum = this._K()?.groundUnitManager;
    if (typeof gum?.getAllUnits !== 'function') return { flagged: 0, removed: 0, reverted };
    const deadline = loadYear + WITHDRAWAL_YEARS;
    const flagged = new Map();     // planetId → { empireId, unitIds }
    const doomed = [];
    for (const u of gum.getAllUnits()) {
      if (!u || u.status === 'in_cargo' || (u.hp ?? 0) <= 0) continue;
      const owner = bodyOwnerOf(u.planetId);
      if (!owner) continue;
      if (!isPlayerUnit(u)) {
        if (owner === 'player' && !groundOwnersHostile(u.owner, 'player')) doomed.push(u);   // (d)
        continue;
      }
      if (u.withdrawal || owner === 'player' || areAtWar('player', owner)) continue;
      u.withdrawal = { empireId: owner, orderedYear: loadYear, deadline, warned: false };
      if (!flagged.has(u.planetId)) flagged.set(u.planetId, { empireId: owner, unitIds: [] });
      flagged.get(u.planetId).unitIds.push(u.id);
    }
    const removed = new Map();     // `planetId|empireId` → { planetId, empireId, unitIds }
    for (const u of doomed) {
      gum.removeUnit(u.id);
      const key = `${u.planetId}|${u.owner}`;
      if (!removed.has(key)) removed.set(key, { planetId: u.planetId, empireId: u.owner, unitIds: [] });
      removed.get(key).unitIds.push(u.id);
    }
    for (const { planetId, empireId, unitIds } of removed.values()) {
      EventBus.emit('withdrawal:aiRemoved', { empireId, planetId, unitIds, count: unitIds.length, reason: 'load' });
    }
    let total = 0;
    for (const [planetId, { empireId, unitIds }] of flagged) {
      total += unitIds.length;
      EventBus.emit('withdrawal:ordered', {
        empireId, planetId, unitIds, count: unitIds.length, deadlineYear: deadline, reason: 'load',
      });
    }
    return { flagged: total, removed: doomed.length, reverted };
  }

  /**
   * (e) — stary zapis: na siatce każdej kolonii kafle należące do strony, która NIE jest w wojnie z właścicielem kolonii,
   * wracają do właściciela, a liczniki okupacji tej strony są zerowane — reguła F1 (`revertPeaceOccupation`, jedno źródło
   * „co pokój cofa”) dla pokoi zawartych PRZED F1. „Nie w wojnie” = `groundOwnersHostile` (R1): para gracz↔imperium —
   * status relacji; para AI↔AI — zawsze wrogowie, więc bez zmian (poza zakresem, 331/D5); bez modułu dyplomacji — bez
   * zmian. Emisje jak przy F1: `tile:ownerChanged` na cofnięty kafel, audyt `withdrawal:tilesReverted` raz na kolonię
   * i stronę, z `reason: 'load'` (`empireId` = imperium tej pary).
   * @returns {number} ile kafli wróciło do właściciela kolonii
   */
  revertOccupationAfterLoad() {
    const cm = this._K()?.colonyManager;
    if (typeof cm?.getAllColonies !== 'function') return 0;
    let total = 0;
    for (const col of cm.getAllColonies()) {
      const owner = bodyOwnerOf(col?.planetId);
      const tiles = col?.grid?.toArray?.() ?? [];
      if (!owner || tiles.length === 0) continue;
      const others = new Set();
      for (const tile of tiles) {
        if (!tile) continue;
        if (tile.owner != null && tile.owner !== owner) others.add(tile.owner);
        if (tile.occupyEmpireId != null && tile.occupyEmpireId !== owner) others.add(tile.occupyEmpireId);
      }
      for (const occupier of others) {
        if (groundOwnersHostile(owner, occupier)) continue;            // wojna trwa albo para AI↔AI — bez zmian
        const res = revertPeaceOccupation(col.grid, owner, occupier);
        for (const t of res.reverted) {
          EventBus.emit('tile:ownerChanged', { planetId: col.planetId, q: t.q, r: t.r, oldOwner: t.oldOwner, newOwner: owner });
        }
        if (res.reverted.length > 0 || res.reset > 0) {
          EventBus.emit('withdrawal:tilesReverted', {
            empireId: owner === 'player' ? occupier : owner, planetId: col.planetId, owner,
            count: res.reverted.length, reset: res.reset, reason: 'load',
          });
        }
        total += res.reverted.length;
      }
    }
    return total;
  }

  /** Dlaczego flaga przestała obowiązywać — `null` = nadal obowiązuje. */
  _clearReason(u) {
    if (u.status === 'in_cargo') return 'loaded';                // R3: załadunek na statek
    const owner = bodyOwnerOf(u.planetId);
    if (owner === 'player') return 'body_owned';                 // R3: ciało stało się gracza
    if (!owner) return 'body_neutral';                           // kolonii już nie ma — nie ma czyjego ciała opuszczać
    if (areAtWar('player', owner)) return 'war_resumed';         // R3: wojna z właścicielem ciała wraca
    return null;
  }

  /**
   * Co tick: zdejmuje flagi, które przestały obowiązywać; miesiąc przed terminem ostrzega; po terminie usuwa
   * jednostkę jak poległą. Ostrzeżenie leci zawsze PRZED usunięciem — także gdy jeden tick przeskoczy oba progi.
   */
  _tick({ expire = true } = {}) {
    const gum = this._K()?.groundUnitManager;
    if (typeof gum?.getAllUnits !== 'function') return;
    const now = this._now();
    const warn = new Map(), dead = new Map();
    for (const u of gum.getAllUnits()) {
      const w = u?.withdrawal;
      if (!w) continue;
      if (!isPlayerUnit(u)) { u.withdrawal = null; continue; }   // flaga dotyczy wyłącznie jednostek gracza
      const why = this._clearReason(u);
      if (why) {
        u.withdrawal = null;
        EventBus.emit('withdrawal:cleared', { unitId: u.id, planetId: u.planetId, empireId: w.empireId, reason: why });
        continue;
      }
      if (!expire) continue;
      if (!w.warned && now >= w.deadline - WITHDRAWAL_WARNING_YEARS - EPS) {
        w.warned = true;
        pushTo(warn, u.planetId, u);
      }
      if (withdrawalDeadlineReached(now, w.deadline)) pushTo(dead, u.planetId, u);
    }
    for (const [planetId, units] of warn) {
      EventBus.emit('withdrawal:warning', {
        empireId: units[0].withdrawal?.empireId ?? null, planetId,
        unitIds: units.map(u => u.id), count: units.length, deadlineYear: units[0].withdrawal?.deadline ?? null,
      });
    }
    for (const [planetId, units] of dead) {
      const empireId = units[0].withdrawal?.empireId ?? null;
      for (const u of units) {
        // R3 — „traktowana jak polegli”: ta sama ścieżka co śmierć (reintegracja POP wg tabeli, z terminem
        //   właściciela). Emisja PRZED `removeUnit` — handler czyta jednostkę z rejestru (kontrakt emitentów).
        EventBus.emit('groundUnit:destroyed', {
          unitId: u.id, planetId: u.planetId, owner: u.owner ?? 'player',
          archetypeId: u.archetypeId ?? null, popCost: u.popCost ?? 0, cause: 'withdrawal_deadline',
        });
        gum.removeUnit(u.id);
      }
      EventBus.emit('withdrawal:expired', { empireId, planetId, unitIds: units.map(u => u.id), count: units.length });
    }
  }
}

export default WithdrawalSystem;
