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
// ODRASTANIE (SB15, wzór `GarrisonSystem` G3-1): od mobilizacji, na granicy roku kalendarzowego, `fleetRegrowthPerYear`
// kadłubów (domyślnie 1) na imperium na rok — ta sama reguła miejsca i wzorca co mobilizacja (plan TERAZ), w wojnie
// i w pokoju. Rok gry = 1,0 `gameTime`; DOKŁADNIE RAZ na rok także przez zapis, pauzę i prędkość: rekord flagi niesie
// `regrowthYear` (`EmpireRegistry.setFleetPoolRegrowthYear`), jeden tick może rozliczyć kilka lat. Bez stolicy — w tym
// roku nic i bez nadrabiania (lustro garnizonu). Plan pusty (limit pełny, minimum z bakiem spełnione) — nic.
//
// STRAŻNICY (S2 — SB30, SB31, SB33, SB34): od mobilizacji imperium trzyma przy stolicy `fleetGuardsPerBody` strażników
// (domyślnie 1) — uzbrojone kadłuby w służbie BEZ baku warp, NA ORBICIE stolicy (`VesselManager.undockToOrbit`).
// Stanowisko obsadzane w chwili mobilizacji, a gdy żaden kadłub nie jest jeszcze w służbie (rezerwa przechodzi do służby
// miesiąc) — na pierwszej granicy miesiąca kalendarzowego, na której jest. Strażnik trzyma orbitę i nie ściga: nie dostaje
// żadnego rozkazu poza powrotem na stanowisko, gdy coś go z niego zepchnęło (kontrola miesięczna). Roster w stanie doktryn
// (`DirectorDoctrine` — `director.doctrine.<id>.guard`, SB31): doktryny i pula uderzenia go pomijają. Strażnicy zostają
// także w pokoju. Dominacja orbitalna zostaje per UKŁAD (SB34). Wyłącznik `enabled` obejmuje strażników.
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
import EntityManager from '../core/EntityManager.js';
import { readEmpirePoolPlan, empireFleetHulls, fleetRegrowthPerYear, readEmpireFleetSnapshot, fleetGuardsPerBody } from '../utils/FleetLimit.js';
import { isGuardHull, isAtGuardPost, readGuardPosts } from '../utils/GuardPostPlanner.js';

// Lustro `GarrisonSystem`: `gameTime` to suma kroków zmiennoprzecinkowych — bez tolerancji granica roku spóźniałaby się.
const YEAR_EPS = 1e-9;
const calendarYear = (gameTime) => Math.floor(gameTime + YEAR_EPS);
/** Miesiąc kalendarzowy (rok gry / 12 — 1 rok cywilizacyjny) — granica kontroli stanowisk strażników. */
const calendarMonth = (gameTime) => Math.floor(gameTime * 12 + YEAR_EPS);

export class FleetPoolSystem {
  constructor() {
    /** Wyłącznik — tylko dla setupu keeperów (patrz nagłówek). */
    this.enabled = true;
    this._reconciled = false;
    /** Ostatni rok kalendarzowy uzgodnienia rocznego w tej sesji (`null` = jeszcze nie ustawiony). */
    this._reconciledYear = null;
    /** S2 — ostatni miesiąc kalendarzowy kontroli stanowisk strażników w tej sesji (`null` = jeszcze nie ustawiony). */
    this._guardMonth = null;

    this._onWarDeclared = ({ empireId } = {}) => { this.mobilizeEmpire(empireId, 'war_declared'); };
    this._onFirstTick   = () => this._firstTick();
    this._onTick        = () => { this._yearlyCheck(); this._monthlyGuardCheck(); };
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

  /**
   * SB19 — odczyt floty / limitu dla wywiadu (`IntelSystem._reserveReadout`): uzbrojone kadłuby imperium (każdy stan
   * służby i położenia) i jego limit floty — ta sama migawka co odczyt konsoli. Tylko odczyt.
   * @returns {{armed:number, limit:number}}
   */
  fleetSnapshot(empireId) {
    const s = readEmpireFleetSnapshot(this._K(), empireId);
    return { armed: s.armed, limit: s.limit };
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
    // SB33 — strażnicy obejmują stanowiska W CHWILI mobilizacji (kadłub w służbie przy stolicy; brak — pierwszy miesiąc).
    const guards = this.stationGuards(empireId, 'mobilization');
    return { ok: true, empireId, vesselIds, refused, plan, wokenIds: wake.woken, guards };
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

  // ── Strażnicy (S2 — SB30, SB31, SB33, SB34) ──────────────────────────────────────────

  /**
   * Stanowiska strażników imperium — jedno wejście (mobilizacja, kontrola miesięczna):
   *  1. stanowisko NIGDY nieobsadzone (mniej wpisów rosteru dla ciała niż `fleetGuardsPerBody`) — kadłub-strażnik
   *     (`isGuardHull`) zadokowany przy stolicy, bez misji, rozkazu i roli patrolu (najpierw bez roli, potem z garnizonu
   *     `defend_home`), idzie na stanowisko i wchodzi do rosteru;
   *  2. strażnik, który zszedł ze stanowiska (dok, inne ciało, dryf — bez misji i rozkazu, poza starciem), wraca na nie;
   *  0. przed tym — `fleetGuardsPerBody` obniżone: nadmiarowe wpisy ciała zwolnione (`_trimPosts`).
   * Poza tym strażnik nie dostaje żadnego rozkazu — trzyma orbitę i nie ściga.
   * @param {string} empireId
   * @param {string} [trigger] — `'mobilization'` | `'monthly'`
   * @returns {{ok:true, posted:string[], returned:string[], released:Array<string|null>} | {ok:false, reason:string}}
   *   powody: `disabled` · `unknown_empire` · `not_mobilized` · `no_doctrine` (brak `directorDoctrine`) · `no_capital`
   */
  stationGuards(empireId, trigger = 'monthly') {
    if (!this.enabled) return { ok: false, reason: 'disabled' };
    const K = this._K();
    const dd = K?.directorDoctrine;
    const vm = K?.vesselManager;
    if (!empireId || empireId === 'player' || !K?.empireRegistry?.get?.(empireId)) return { ok: false, reason: 'unknown_empire' };
    if (!this.isMobilized(empireId)) return { ok: false, reason: 'not_mobilized' };
    if (typeof dd?.guardRoster !== 'function' || typeof vm?.undockToOrbit !== 'function') return { ok: false, reason: 'no_doctrine' };
    const posts = readGuardPosts(K, empireId, fleetGuardsPerBody());
    if (!posts.capitalId) return { ok: false, reason: 'no_capital' };
    const year = K?.timeSystem?.gameTime ?? null;
    const roster = dd.guardRoster(empireId);
    const posted = [], returned = [];
    const released = this._trimPosts(empireId, roster, posts, trigger, year);
    for (const { bodyId } of posts.bodies) {
      for (let k = roster.filter((e) => e.bodyId === bodyId).length; k < posts.perBody; k++) {
        const hull = this._pickGuardHull(empireId, posts.capitalId, roster);
        if (!hull || !this._sendToPost(hull, bodyId)) break;
        roster.push({ bodyId, vesselId: hull.id, sinceYear: year, lostYear: null });
        posted.push(hull.id);
        EventBus.emit('fleetGuard:posted', { empireId, bodyId, vesselId: hull.id, trigger, year });
      }
    }
    for (const e of roster) {
      const v = e.vesselId ? vm.getVessel?.(e.vesselId) : null;
      if (!isGuardHull(v, empireId) || isAtGuardPost(v, e.bodyId) || posted.includes(v.id)) continue;
      if (v.mission || v.movementOrder || v.pendingOrder || this._inEncounter(v.id)) continue;
      if (!this._sendToPost(v, e.bodyId)) continue;
      returned.push(v.id);
      EventBus.emit('fleetGuard:returnOrdered', { empireId, bodyId: e.bodyId, vesselId: v.id, trigger, year });
    }
    dd.setGuardRoster(empireId, roster, `fleet_guard_${trigger}`);
    return { ok: true, posted, returned, released };
  }

  /**
   * `fleetGuardsPerBody` obniżone z konsoli: nadmiarowe wpisy ciała zwolnione — najpierw stanowiska bez żywego strażnika,
   * potem najnowsze. Kadłub zostaje tam, gdzie stoi, bez roli strażnika (doktryny mogą go wziąć jak każdy inny).
   * @returns {Array<string|null>} id zwolnionych kadłubów
   */
  _trimPosts(empireId, roster, posts, trigger, year) {
    const vm = this._K()?.vesselManager;
    const live = (e) => !!e.vesselId && isGuardHull(vm?.getVessel?.(e.vesselId), empireId);
    const released = [];
    for (const { bodyId } of posts.bodies) {
      const mine = roster.filter((e) => e.bodyId === bodyId);
      const surplus = mine.length - posts.perBody;
      if (surplus <= 0) continue;
      const order = [...mine].sort((a, b) => (Number(live(a)) - Number(live(b))) || ((b.sinceYear ?? 0) - (a.sinceYear ?? 0)));
      for (const e of order.slice(0, surplus)) {
        roster.splice(roster.indexOf(e), 1);
        released.push(e.vesselId ?? null);
        EventBus.emit('fleetGuard:released', { empireId, bodyId, vesselId: e.vesselId ?? null, reason: 'tuning', trigger, year });
      }
    }
    return released;
  }

  /**
   * Kadłub na stanowisko: kadłub-strażnik imperium (SB30) zadokowany przy stolicy, bez misji, rozkazu i composite'u, spoza
   * rosteru strażników i spoza patrolu; najpierw bez roli, potem z garnizonu `defend_home` (stoi w doku przy stolicy).
   * Kolejność: kolejność rejestru statków (deterministyczna).
   */
  _pickGuardHull(empireId, capitalId, roster) {
    const K = this._K();
    const dd = K?.directorDoctrine;
    const taken = new Set(roster.map((e) => e.vesselId).filter(Boolean));
    const free = [], garrison = [];
    for (const v of K?.vesselManager?.getAllVessels?.() ?? []) {
      if (!isGuardHull(v, empireId) || taken.has(v.id)) continue;
      if (v.position?.state !== 'docked' || v.position?.dockedAt !== capitalId) continue;
      if (v.mission || v.movementOrder || v.pendingOrder) continue;
      const role = dd?.doctrineRoleOf?.(empireId, v.id) ?? null;
      if (role === null) free.push(v);
      else if (role === 'defend_home') garrison.push(v);
    }
    return free[0] ?? garrison[0] ?? null;
  }

  /**
   * Strażnik na stanowisko: zadokowany przy ciele stanowiska — orbita (`undockToOrbit`); gdzie indziej — rozkaz
   * `moveToPoint` na ciało (wzór doktryny `_sendOnPatrol`: ciało + punkt zapasowy, `bypassFuelCheck`, decyzja 12 W1-5).
   * @returns {boolean}
   */
  _sendToPost(v, bodyId) {
    const K = this._K();
    if (v.position?.state === 'docked' && v.position?.dockedAt === bodyId) return K?.vesselManager?.undockToOrbit?.(v.id) === true;
    const mos = K?.movementOrderSystem;
    const body = EntityManager.get(bodyId);
    if (typeof mos?.issueOrder !== 'function' || !body) return false;
    const res = mos.issueOrder(v.id, {
      type: 'moveToPoint', targetBodyId: bodyId, targetPoint: { x: body.x ?? 0, y: body.y ?? 0 },
      issuedBy: 'fleet_guard', bypassFuelCheck: true,
    });
    return res?.ok === true;
  }

  /** Czy kadłub jest w AKTYWNYM starciu (leniwy odczyt DSCS — wzór `DirectorOffensive._inActiveEncounter`). */
  _inEncounter(vesselId) {
    const dscs = this._K()?.deepSpaceCombatSystem;
    return typeof dscs?._findActiveEncounterContaining === 'function' && !!dscs._findActiveEncounterContaining(vesselId);
  }

  /**
   * Kontrola stanowisk strażników na granicy miesiąca kalendarzowego (rok gry / 12), dla każdego imperium z pulą: obsadza
   * stanowiska nigdy nieobsadzone (przy mobilizacji mogło nie być kadłuba w służbie) i zawraca strażników na stanowiska.
   * Pierwszy tick sesji tylko ustawia miesiąc (lustro kontroli rocznej).
   */
  _monthlyGuardCheck() {
    if (!this.enabled) return;
    const K = this._K();
    const reg = K?.empireRegistry;
    const now = K?.timeSystem?.gameTime;
    if (typeof reg?.listAll !== 'function' || !Number.isFinite(now)) return;
    const month = calendarMonth(now);
    if (this._guardMonth === null) { this._guardMonth = month; return; }
    if (month <= this._guardMonth) return;
    this._guardMonth = month;
    for (const emp of reg.listAll()) {
      if (emp?.id && this.isMobilized(emp.id)) this.stationGuards(emp.id, 'monthly');
    }
  }

  // ── Odrastanie (SB15) ────────────────────────────────────────────────────────────────

  /**
   * Jedna próba odrastania imperium (kontrola roczna; z konsoli — tylko do pomiaru): pierwszy kadłub planu TERAZ
   * (`readEmpirePoolPlan` — reguła miejsca i wzorca jak przy mobilizacji) powstaje przy stolicy przez `createAIVessel`.
   * @param {string} empireId
   * @param {number|null} [year] — rozliczany rok kalendarzowy (do śladu audytu)
   * @returns {{ok:true, vesselId:string, templateId:string} | {ok:false, reason:string, armed?:number, limit?:number}}
   *   powody: `disabled` · `unknown_empire` · `no_vessel_manager` · `not_mobilized` · `no_capital` (bez zdarzenia, jak
   *   garnizon) · `reparations` · `at_limit` (plan pusty) · `no_warp_template` (minimum z bakiem, a wzorzec bez baku) ·
   *   `create_failed` (ślad `fleetPool:regrowthSkipped`)
   */
  regrowEmpire(empireId, year = null) {
    if (!this.enabled) return { ok: false, reason: 'disabled' };
    const K = this._K();
    const vm = K?.vesselManager;
    if (!empireId || empireId === 'player' || !K?.empireRegistry?.get?.(empireId)) return { ok: false, reason: 'unknown_empire' };
    if (typeof vm?.createAIVessel !== 'function') return { ok: false, reason: 'no_vessel_manager' };
    if (!this.isMobilized(empireId)) return { ok: false, reason: 'not_mobilized' };
    const plan = readEmpirePoolPlan(K, empireId);
    if (!plan.capitalId) return { ok: false, reason: 'no_capital' };
    if (K?.diplomacySystem?.isUnderReparations?.(empireId) === true) {
      EventBus.emit('fleetPool:regrowthSkipped', { empireId, year, reason: 'reparations', armed: plan.armed, limit: plan.limit });
      return { ok: false, reason: 'reparations', armed: plan.armed, limit: plan.limit };
    }
    const templateId = plan.add[0];
    if (!templateId) {
      return { ok: false, reason: plan.missingWarpTemplate > 0 ? 'no_warp_template' : 'at_limit', armed: plan.armed, limit: plan.limit };
    }
    const res = vm.createAIVessel({ templateId, empireId, planetId: plan.capitalId, origin: 'pool' });
    if (!res?.ok) {
      EventBus.emit('fleetPool:regrowthSkipped', { empireId, year, reason: 'create_failed', detail: res?.reason ?? null, templateId });
      return { ok: false, reason: 'create_failed', armed: plan.armed, limit: plan.limit };
    }
    EventBus.emit('fleetPool:regrown', {
      empireId, year, vesselId: res.vessel.id, templateId, limit: plan.limit, armed: plan.armed + 1,
    });
    return { ok: true, vesselId: res.vessel.id, templateId };
  }

  /**
   * Kontrola roczna (co tick, tanio: porównanie roku). Najpierw odrastanie każdego imperium z pulą — raz na każdy rok od
   * `regrowthYear + 1` do bieżącego (SB15) — potem, przy granicy roku, uzgodnienie: imperium w wojnie bez mobilizacji
   * mobilizuje się (`'reconcile_yearly'`) — trzecie wejście, jak w garnizonie.
   */
  _yearlyCheck() {
    if (!this.enabled) return;
    const K = this._K();
    const reg = K?.empireRegistry;
    const now = K?.timeSystem?.gameTime;
    if (typeof reg?.listAll !== 'function' || !Number.isFinite(now)) return;
    const year = calendarYear(now);

    for (const emp of reg.listAll()) {
      if (!emp?.id || !this.isMobilized(emp.id)) continue;
      const last = emp.fleetPool?.regrowthYear;
      if (!Number.isFinite(last)) { reg.setFleetPoolRegrowthYear?.(emp.id, year); continue; }
      if (last >= year) continue;
      const perYear = Math.max(0, Math.floor(Number(fleetRegrowthPerYear()) || 0));
      for (let y = last + 1; y <= year; y++) {
        for (let k = 0; k < perYear; k++) {
          if (!this.regrowEmpire(emp.id, y).ok) break;
        }
      }
      reg.setFleetPoolRegrowthYear?.(emp.id, year);
    }

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
