// FleetPoolSystem — AI STRIKES BACK S1 (SB1, SB2, SB14, SB18, SB20–SB22): PULA okrętów imperium AI.
//
// MOBILIZACJA (SB1): RAZ na imperium, w chwili, w której mobilizują się jego garnizony — na TYCH SAMYCH trzech wejściach
// co `GarrisonSystem`, z WŁASNĄ flagą (zapis z garnizonem już zmobilizowanym, a bez puli, dostaje pulę przy pierwszym
// wejściu):
//   • `diplomacy:warDeclared` (jedyny emitent — `DiplomacySystem.declareWar`);
//   • pierwszy tick sesji — zapis wczytany JUŻ w stanie wojny (`reconcile`, `'reconcile_at_war'`);
//   • granica roku kalendarzowego — imperium w wojnie bez mobilizacji (`'reconcile_yearly'`).
// Imperium bez pełnej kolonii (brak stolicy z terminem właściciela — ten sam odczyt co garnizon) nie tworzy niczego
// i flagi NIE dostaje (wzór D12 garnizonu).
//
// ILE i KTÓRE (SB14 zmienione przez SB21, SB20): plan liczy `FleetLimit.readEmpirePoolPlan` (wzorzec z tabeli
// strojenia powtarzany do limitu, istniejące uzbrojone kadłuby pokrywają sloty swojej klasy, minimum kadłubów z bakiem
// warp także ponad limitem). Ten system plan WYKONUJE — kadłub po kadłubie, przez JEDYNE wejście tworzenia kadłuba puli
// (`VesselManager.createAIVessel`): przy stolicy, w doku, w służbie, bez załogi i bez POP (SB2, SB18), szablon
// rozwiązany „wszystko zbadane” (SB22), pochodzenie `origin: 'pool'` w zapisie.
//
// REZERWA (SB13): w tej samej chwili KAŻDY uzbrojony kadłub imperium w rezerwie (`serviceState: 'stored'`, gdziekolwiek
// stoi) wchodzi do służby przez `VesselManager.deployVessel` — bez względu na guard parytetu (`empireOutgunnedByPlayer`),
// który hamuje WYŁĄCZNIE regułę pokojową `mobilize_reserve` (ta zostaje bez zmian). Miejsce dla puli liczone PRZED
// obudzeniem — rezerwa liczy się do limitu tak samo (SB14).
//
// ⚠ Flaga: `gameState.empires.<id>.fleetPool` (intencja `EmpireRegistry.markFleetPoolMobilized`) — klucz `empires`
//   zadeklarowany w `GameState`, więc pole przeżywa zapis bez migracji (save v101); zapis bez pola = „nie zmobilizowano”.
// ⚠ Reparacje (WP-R, „blokada zbrojeń”): imperium pod reparacjami nie dostaje puli — odmowa `reparations` BEZ flagi
//   (mobilizacja przy następnym wejściu po ich końcu). Decyzja do potwierdzenia przez właściciela (pytanie w raporcie S1).
// ⚠ Gracz dowiaduje się o mobilizacji ISTNIEJĄCYM powiadomieniem (`NotificationCenter._handleMobilized`, bramka
//   `contact`, nazwa przy `detailed`) — zdarzenie `fleetPool:mobilized` — i istniejącymi regułami detekcji.
// ⚠ Determinizm: żadnego losowania — plan jest funkcją stanu świata i tabeli strojenia.
// ⚠ Wyłącznik `enabled` wyłącznie dla setupu keeperów (wzór `GarrisonSystem.enabled`). W grze zawsze `true`.

import EventBus from '../core/EventBus.js';
import { readEmpirePoolPlan, empireFleetHulls } from '../utils/FleetLimit.js';

// Lustro `GarrisonSystem`: `gameTime` to suma kroków zmiennoprzecinkowych — bez tolerancji granica roku spóźniałaby się.
const YEAR_EPS = 1e-9;
const calendarYear = (gameTime) => Math.floor(gameTime + YEAR_EPS);

export class FleetPoolSystem {
  constructor() {
    /** Wyłącznik — tylko dla setupu keeperów (patrz nagłówek). */
    this.enabled = true;
    this._reconciled = false;
    /** Ostatni rok kalendarzowy uzgodnienia rocznego w tej sesji (`null` = jeszcze nie ustawiony). */
    this._reconciledYear = null;

    this._onWarDeclared = ({ empireId } = {}) => { this.mobilizeEmpire(empireId, 'war_declared'); };
    this._onFirstTick   = () => this._firstTick();
    this._onTick        = () => this._yearlyCheck();
    EventBus.on('diplomacy:warDeclared', this._onWarDeclared);
    EventBus.on('time:tick', this._onFirstTick);
    EventBus.on('time:tick', this._onTick);
  }

  /** Usługi gry (w grze `window.KOSMOS`). */
  _K() { return (typeof window !== 'undefined') ? window.KOSMOS : null; }

  // ── Odczyty ──────────────────────────────────────────────────────────────────────────

  /** Czy imperium dostało już pulę (flaga w `empires.<id>.fleetPool`). */
  isMobilized(empireId) {
    return this._K()?.empireRegistry?.isFleetPoolMobilized?.(empireId) === true;
  }

  /**
   * Czy imperium bierze udział w JAKIEJKOLWIEK wojnie (dowolna para relacji `'war'`). LUSTRO `GarrisonSystem.isAtWar`
   * — te same wejścia (status relacji, nie rekord wojny); zgodność obu na tych samych światach pinuje keeper.
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

  /** Plan puli imperium TERAZ (tylko odczyt). */
  plan(empireId) {
    return readEmpirePoolPlan(this._K(), empireId);
  }

  // ── Mobilizacja (SB1) ────────────────────────────────────────────────────────────────

  /**
   * Tworzy pulę imperium wg planu — RAZ na imperium.
   * @param {string} empireId
   * @param {string} [reason] — `'war_declared'` | `'reconcile_at_war'` | `'reconcile_yearly'`
   * @returns {{ok:true, empireId:string, vesselIds:string[], refused:number, plan:Object} | {ok:false, reason:string}}
   */
  mobilizeEmpire(empireId, reason = 'war_declared') {
    if (!this.enabled) return { ok: false, reason: 'disabled' };
    const K = this._K();
    const reg = K?.empireRegistry;
    const vm = K?.vesselManager;
    if (!empireId || empireId === 'player' || !reg?.get?.(empireId)) return { ok: false, reason: 'unknown_empire' };
    if (typeof vm?.createAIVessel !== 'function') return { ok: false, reason: 'no_vessel_manager' };
    if (this.isMobilized(empireId)) {
      EventBus.emit('fleetPool:mobilizeSkipped', { empireId, reason: 'already_mobilized', trigger: reason });
      return { ok: false, reason: 'already_mobilized' };
    }
    const plan = readEmpirePoolPlan(K, empireId);
    if (!plan.capitalId) {
      EventBus.emit('fleetPool:mobilizeSkipped', { empireId, reason: 'no_capital', trigger: reason });
      return { ok: false, reason: 'no_capital' };
    }
    if (K?.diplomacySystem?.isUnderReparations?.(empireId) === true) {
      EventBus.emit('fleetPool:mobilizeSkipped', { empireId, reason: 'reparations', trigger: reason });
      return { ok: false, reason: 'reparations' };
    }

    const vesselIds = [];
    let refused = 0;
    for (const templateId of plan.add) {
      const res = vm.createAIVessel({ templateId, empireId, planetId: plan.capitalId, origin: 'pool' });
      if (res?.ok) { vesselIds.push(res.vessel.id); continue; }
      refused++;
      EventBus.emit('fleetPool:createRefused', { empireId, templateId, reason: res?.reason ?? 'unknown', trigger: reason });
    }
    const wake = this._wakeReserve(empireId);

    const now = K?.timeSystem?.gameTime;
    const record = {
      mobilized:   true,
      year:        now ?? null,
      regrowthYear: Number.isFinite(now) ? calendarYear(now) : null,
      reason,
      limit:       plan.limit,
      armedBefore: plan.armed,
      warpBefore:  plan.warp,
      planned:     plan.add.length,
      created:     vesselIds.length,
      refused,
      missingWarpTemplate: plan.missingWarpTemplate,
      woken:       wake.woken.length,
      wakeRefused: wake.refused,
    };
    reg.markFleetPoolMobilized(empireId, record);
    EventBus.emit('fleetPool:mobilized', {
      empireId, ...record, capitalId: plan.capitalId, vesselIds, templates: [...plan.add], wokenIds: wake.woken,
    });
    return { ok: true, empireId, vesselIds, refused, plan, wokenIds: wake.woken };
  }

  /**
   * SB13 — każdy UZBROJONY kadłub imperium w rezerwie wchodzi do służby (`deployVessel`: miesiąc przejścia, bez załogi
   * — SB2). Bez guardu parytetu. Kadłub w trakcie przejścia (`mobilizing`) i nieuzbrojony (kurier) — bez zmian.
   * @returns {{woken:string[], refused:string[]}} id obudzonych; odmowy `id:powód`
   */
  _wakeReserve(empireId) {
    const K = this._K();
    const vm = K?.vesselManager;
    const woken = [], refused = [];
    if (typeof vm?.deployVessel !== 'function') return { woken, refused };
    for (const v of empireFleetHulls(K, empireId)) {
      if (v.serviceState !== 'stored') continue;
      const res = vm.deployVessel(v.id);
      if (res?.ok) woken.push(v.id); else refused.push(`${v.id}:${res?.reason ?? 'unknown'}`);
    }
    return { woken, refused };
  }

  /**
   * Kontrola roczna (co tick, tanio: porównanie roku). Przy granicy roku kalendarzowego: imperium w wojnie bez
   * mobilizacji mobilizuje się (`'reconcile_yearly'`) — trzecie wejście, jak w garnizonie.
   */
  _yearlyCheck() {
    if (!this.enabled) return;
    const K = this._K();
    const reg = K?.empireRegistry;
    const now = K?.timeSystem?.gameTime;
    if (typeof reg?.listAll !== 'function' || !Number.isFinite(now)) return;
    const year = calendarYear(now);
    if (this._reconciledYear === null) { this._reconciledYear = year; return; }
    if (year <= this._reconciledYear) return;
    this._reconciledYear = year;
    for (const emp of reg.listAll()) {
      if (!emp?.id || this.isMobilized(emp.id) || !this.isAtWar(emp.id)) continue;
      this.mobilizeEmpire(emp.id, 'reconcile_yearly');
    }
  }

  // ── Uzgodnienie na pierwszym ticku ───────────────────────────────────────────────────

  _firstTick() {
    EventBus.off('time:tick', this._onFirstTick);
    if (this._reconciled) return;
    this._reconciled = true;
    this.reconcile('first_tick');
  }

  /**
   * Pierwszy tick po starcie sceny (nowa gra albo wczytanie): każde imperium w stanie wojny bez puli dostaje pulę
   * (zapis sprzed puli albo status ustawiony bez zdarzenia).
   * @returns {{trigger:string, mobilized:string[]}}
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

export default FleetPoolSystem;
