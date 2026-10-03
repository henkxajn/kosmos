// GarrisonSystem — AI GARRISON (G2-3b): garnizony naziemne imperiów AI.
//
// C-S1 — MOBILIZACJA (D15, podpis 2026-10-02): rezerwa materializuje się jako prawdziwe jednostki RAZ na
// imperium, przy jego PIERWSZEJ wojnie. Ile, jakich, z jakim morale, na których ciałach i heksach — mówi
// planer G2-3a (`src/utils/GarrisonPlanner.js`); ten system tylko go WYKONUJE przez jedyne wejście
// tworzenia jednostki AI (`GroundUnitManager.createAIUnit`, G2-1).
//
//   • zaczep: `diplomacy:warDeclared` (jedyny emitent — `DiplomacySystem.declareWar`, para gracz↔imperium);
//   • zapis wczytany JUŻ w stanie wojny mobilizuje się na PIERWSZYM TICKU (`reconcile`) — przy wczytaniu
//     żadne zdarzenie wojny nie leci, a każda ścieżka, która ustawia status `'war'` bez zdarzenia (stary
//     zapis po migracji, konsola), trafia tutaj;
//   • flaga: `gameState.empires.<id>.garrison` (intencja `EmpireRegistry.markGarrisonMobilized`) — klucz
//     najwyższego poziomu `empires` jest zadeklarowany w `GameState`, więc pole wewnątrz przeżywa zapis
//     bez migracji (save v101); zapis bez pola = „nie zmobilizowano”;
//   • imperium BEZ pełnej kolonii (brak stolicy, D12) nie mobilizuje niczego i flagi NIE ustawia;
//   • jednostka bez wolnego heksu, na którym da się stanąć, NIE powstaje — zostaje w rezerwie (odp. (f));
//   • każda wojna, w której imperium bierze udział, się liczy (`isAtWar` — dowolna para relacji `'war'`);
//   • po wojnie jednostki zostają; drugiej mobilizacji nie ma (odrastanie strat = G3).
//
// ⚠ Determinizm: żadnego losowania — plan jest funkcją stanu świata (D1/D9/D10/D11/D12).
// ⚠ Jednostki AI powstają WYŁĄCZNIE przez `createAIUnit` (owner I factionId = imperium, popCost 0) —
//   `createUnit` z samym `{ owner }` wciągałby je w utrzymanie gracza (Finding 323, pin G2-0 P2).
// ⚠ Wyłącznik `enabled` istnieje dla setupu keeperów, które potrzebują NIEBRONIONEJ kolonii AI w stanie
//   wojny (zgoda właściciela 2026-10-03). To NIE jest flaga `FEATURES` gry — w grze jest zawsze `true`.
// ⚠ Brak wpisów w Dzienniku i dzwonka (poza zakresem G2-3b). Ślad audytu: `garrison:mobilized` /
//   `garrison:mobilizeSkipped` w `DebugLog.TRACKED_EVENTS` (reguła W3: nowy powód odmowy w tym samym commicie).

import EventBus from '../core/EventBus.js';
import { planEmpireGarrison, readEmpireGarrisonSnapshot, readGarrisonBodyContext } from '../utils/GarrisonPlanner.js';

export class GarrisonSystem {
  constructor() {
    /** Wyłącznik mobilizacji — tylko dla setupu keeperów (patrz nagłówek). */
    this.enabled = true;
    this._reconciled = false;

    this._onWarDeclared = ({ empireId } = {}) => { this.mobilizeEmpire(empireId, 'war_declared'); };
    this._onFirstTick   = () => this._firstTick();
    EventBus.on('diplomacy:warDeclared', this._onWarDeclared);
    EventBus.on('time:tick', this._onFirstTick);
  }

  /** Usługi gry (w grze `window.KOSMOS`). */
  _K() { return (typeof window !== 'undefined') ? window.KOSMOS : null; }

  // ── Odczyty ──────────────────────────────────────────────────────────────────────────

  /** Czy imperium już się zmobilizowało (flaga w `empires.<id>.garrison`). */
  isMobilized(empireId) {
    return this._K()?.empireRegistry?.isGarrisonMobilized?.(empireId) === true;
  }

  /**
   * Czy imperium bierze udział w JAKIEJKOLWIEK wojnie (dowolna para relacji ze statusem `'war'`).
   * Źródło prawdy jak w D13: status relacji, nie rekord wojny. Brak dyplomacji ⇒ `false`.
   */
  isAtWar(empireId) {
    const rel = this._K()?.diplomacySystem?.relations;
    if (!empireId || typeof rel?.listPairsWith !== 'function') return false;
    try {
      return rel.listPairsWith(empireId).some(r => r?.status === 'war');
    } catch {
      return false;
    }
  }

  /**
   * Jednostki naziemne imperium AI (tylko odczyt) — do konsoli: `KOSMOS.garrisonSystem.listUnits('emp_001')`.
   * Bez argumentu — wszystkie imperia AI z rejestru.
   * @returns {Array<{empireId, unitId, planetId, archetypeId, morale, maxMorale, deployState, q, r, hp, status}>}
   */
  listUnits(empireId = null) {
    const K = this._K();
    const ids = new Set(empireId ? [empireId] : (K?.empireRegistry?.listIds?.() ?? []));
    return (K?.groundUnitManager?.getAllUnits?.() ?? [])
      .filter(u => ids.has(u?.owner))
      .map(u => ({
        empireId: u.owner, unitId: u.id, planetId: u.planetId, archetypeId: u.archetypeId ?? u.type,
        morale: u.morale, maxMorale: u.maxMorale, deployState: u.deployState ?? null,
        q: u.q, r: u.r, hp: u.hp, status: u.status,
      }));
  }

  // ── Mobilizacja (D15) ────────────────────────────────────────────────────────────────

  /**
   * Mobilizuje garnizon imperium wg planera — RAZ na imperium.
   * @param {string} empireId
   * @param {string} [reason] — `'war_declared'` (zaczep) | `'reconcile_at_war'` (pierwszy tick)
   * @returns {{ok:true, empireId:string, unitIds:string[], reserve:number, plan:Object} | {ok:false, reason:string}}
   */
  mobilizeEmpire(empireId, reason = 'war_declared') {
    if (!this.enabled) return { ok: false, reason: 'disabled' };
    const K = this._K();
    const reg = K?.empireRegistry;
    const gum = K?.groundUnitManager;
    if (!empireId || empireId === 'player' || !reg?.get?.(empireId)) return { ok: false, reason: 'unknown_empire' };
    if (typeof gum?.createAIUnit !== 'function') return { ok: false, reason: 'no_ground_unit_manager' };
    if (this.isMobilized(empireId)) {
      // D15: RAZ na imperium — kolejna wojna nie tworzy nic (odrastanie strat = G3). Ślad audytu jawny.
      EventBus.emit('garrison:mobilizeSkipped', { empireId, reason: 'already_mobilized', trigger: reason });
      return { ok: false, reason: 'already_mobilized' };
    }

    const snap = readEmpireGarrisonSnapshot(K, empireId);
    if (!snap.capitalId) {
      // Imperium bez pełnej kolonii: nic nie powstaje i flaga NIE jest ustawiana (mobilizacja przy
      // następnej wojnie albo przy następnym wczytaniu w stanie wojny).
      EventBus.emit('garrison:mobilizeSkipped', { empireId, reason: 'no_capital', trigger: reason });
      return { ok: false, reason: 'no_capital' };
    }

    const plan = planEmpireGarrison(snap, (planetId) => readGarrisonBodyContext(K, planetId));
    const unitIds = [];
    const perBody = [];
    let reserve = 0;
    let refused = 0;
    for (const body of plan.perBody) {
      const hexes = body.hexes?.hexes ?? [];
      let created = 0;
      for (let i = 0; i < body.count; i++) {
        const hex = hexes[i];
        if (!hex) { reserve++; continue; }      // brak wolnego heksu ⇒ nie powstaje, zostaje w rezerwie (f)
        const res = gum.createAIUnit({
          archetypeId: body.composition[i], empireId, planetId: body.planetId,
          q: hex.q, r: hex.r, morale: body.morale, deployed: true,
        });
        if (res?.ok) { unitIds.push(res.unit.id); created++; } else { refused++; reserve++; }
      }
      perBody.push({ planetId: body.planetId, role: body.role, planned: body.count, created });
    }

    const record = {
      mobilized: true,
      year:      K?.timeSystem?.gameTime ?? null,
      reason,
      tier:      plan.tier.index,
      morale:    plan.tier.morale,
      limit:     plan.limit,
      created:   unitIds.length,
      reserve,
      refused,
    };
    reg.markGarrisonMobilized(empireId, record);
    EventBus.emit('garrison:mobilized', { empireId, ...record, perBody });
    return { ok: true, empireId, unitIds, reserve, plan };
  }

  // ── Uzgodnienie na pierwszym ticku ───────────────────────────────────────────────────

  _firstTick() {
    EventBus.off('time:tick', this._onFirstTick);
    if (this._reconciled) return;
    this._reconciled = true;
    this.reconcile('first_tick');
  }

  /**
   * Pierwszy tick po starcie sceny (nowa gra albo wczytanie): mobilizuje każde imperium, które JEST
   * w stanie wojny, a flagi nie ma (zapis sprzed G2-3b albo status ustawiony bez zdarzenia).
   * @returns {{mobilized:string[]}}
   */
  reconcile(trigger = 'first_tick') {
    const reg = this._K()?.empireRegistry;
    const mobilized = [];
    for (const emp of reg?.listAll?.() ?? []) {
      if (!emp?.id || this.isMobilized(emp.id) || !this.isAtWar(emp.id)) continue;
      const res = this.mobilizeEmpire(emp.id, 'reconcile_at_war');
      if (res.ok) mobilized.push(emp.id);
    }
    return { trigger, mobilized };
  }
}

export default GarrisonSystem;
