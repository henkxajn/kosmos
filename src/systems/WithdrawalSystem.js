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
//
// ⚠ Stan flagi siedzi NA JEDNOSTCE (`unit.withdrawal = { empireId, orderedYear, deadline, warned }`) i jedzie z nią
//   przez zapis (`GroundUnitManager.serialize/restore`); ten system nie ma własnego stanu.
// ⚠ Czas: `timeSystem.gameTime` (lata WYŚWIETLANE), jak licznik okupacji: 6 miesięcy = 0,5 roku = 6 civY.
// ⚠ Brak ognia i okupacji w oknie wycofania daje R1 (`WarGate.groundOwnersHostile`) — ta flaga niczego nie bramkuje,
//   poza własnym terminem.
// ⚠ Kolaboratorzy leniwie przez `window.KOSMOS` (zero importów systemów).

import EventBus from '../core/EventBus.js';
import { bodyOwnerOf, areAtWar } from '../utils/WarGate.js';

/** Termin wycofania w latach WYŚWIETLANYCH (6 miesięcy = 6 civY przy CIV_TIME_SCALE 12). */
export const WITHDRAWAL_YEARS = 0.5;
/** Ostrzeżenie: miesiąc wyświetlany przed terminem (lata WYŚWIETLANE). */
export const WITHDRAWAL_WARNING_YEARS = 1 / 12;
// `gameTime` to suma zmiennoprzecinkowych kroków, więc próg „równo w terminie” wypada raz 0,4999999…, raz 0,5000…01
// (zmierzone: ostrzeżenie i usunięcie spóźnione o jeden tick). Tolerancja jest o rzędy mniejsza od kroku (1/12 roku).
const EPS = 1e-9;

const isPlayerUnit = (u) => (u?.owner ?? 'player') === 'player';
const pushTo = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };

export class WithdrawalSystem {
  constructor() {
    this._onPeace = ({ empireId } = {}) => { this.onPeaceSigned(empireId); };
    // Wojna wraca albo ciało przechodzi na gracza — flagi zdejmowane od razu, bez czekania na tick (także na pauzie).
    this._onReconcile = () => { this._tick({ expire: false }); };
    this._onTick = () => { this._tick(); };
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
   * R3 + R4 — pokój z imperium `empireId` został podpisany (po wykonaniu cesji).
   * @returns {{flagged:number, removed:number}}
   */
  onPeaceSigned(empireId) {
    const gum = this._K()?.groundUnitManager;
    if (!empireId || empireId === 'player' || typeof gum?.getAllUnits !== 'function') return { flagged: 0, removed: 0 };
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
    return { flagged: total, removed: doomed.length };
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
      if (now >= w.deadline - EPS) pushTo(dead, u.planetId, u);
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
