// StrikeSquadronSystem — AI STRIKES BACK S3 (SB51, SB52, SB53, SB55): ESKADRA UDERZENIOWA AI.
//
// JEDNO wejście produkcyjne: `launchSquadron(empireId, targetBodyId, escortIds)` —
//   1. TRANSPORTOWIEC (SB51): na każdą falę NOWY kadłub `transport_assault` przy stolicy imperium, przez funkcję
//      tworzenia puli (`VesselManager.createAIVessel`, „wszystko zbadane”), nieuzbrojony ⇒ poza limitem floty (SB23);
//   2. FALA (SB52, SB53): floor(limit garnizonu × `strikeWaveShare`) jednostek, obcięta do ładowni, skład i morale ze
//      szczebla imperium — jednostki NOWE (`GroundUnitManager.createAIUnit` przy stolicy), nie z garnizonu — załadowane
//      (`loadGroundUnit`);
//   3. GRUPA (SB54): eskorta + transportowiec lecą RAZEM (`OrderService.issueGroupAttack`: jeden punkt przylotu po skoku,
//      jedna chwila przylotu do celu, transportowiec nigdy przed eskortą);
//   4. REKORD (zapis gry): `gameState.strikeSquadrons.<id>` — klucz w `createDefaultState`, bez migracji (save v101).
// Desant (SB55) robi istniejąca ścieżka: bitwa z obroną celu (`EnemyAttackHandler`) → `InvasionSystem._onVesselGroupVictory`
// → dominacja orbity, ocalały zrzutowiec → `_landCargo` (ląduje to, co jest na pokładzie) — na CELU eskadry, czyli ciele
// bitwy (S3/2, SB64). Zestrzelony transportowiec zabiera ładunek ze sobą (SB41). Jedna wygrana orbita = jedna fala.
// PRZERWANIE (S3/2, SB66, Finding 435): eskadra w drodze, która straciła CAŁĄ eskortę, jest przerywana — transportowiec
// zawraca do stolicy istniejącym odwołaniem (`OrderService.issueRecall`), desantu nie ma; reguły bitwy planetarnej bez zmian.
// PO DESANCIE (S3/2, SB58 zmienione przez SB63, Finding 434): eskorta i transportowiec TRZYMAJĄ orbitę celu, aż walka
// naziemna się rozstrzygnie (ciało zdobyte albo fala zniszczona); potem wszyscy wracają do stolicy tym samym odwołaniem,
// a transportowiec, który dotarł na orbitę stolicy, jest usuwany (rekord `closed`). Odwołanie Directora
// (`DirectorRecall`) pomija kadłuby eskadry trzymającej orbitę (`isHolding`). POKÓJ z graczem w trakcie: eskadra wraca,
// nic nie ląduje. Atak bez desantu (odmowa przy lądowaniu) — eskadra wraca.
//
// ⚠ Wszystko albo nic: walidacja eskorty i fali PRZED utworzeniem czegokolwiek; odmowa rozkazu grupy cofa utworzony
//   transportowiec i jednostki (nic nie zostaje).
// ⚠ Wołający: reguła Directora `retake_lost_colony` (`DirectorRetake.launchRetake`, S3/2, SB57) i dźwignia debug
//   `KOSMOS.debug.sbLaunchSquadron`.
// ⚠ Zero importów systemów — kolaboratorzy leniwie przez `window.KOSMOS` (EventBus, nie importy między systemami).

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import gameState from '../core/GameState.js';
import { isInService, hasWeapons, isEnemyVessel, loadGroundUnit } from '../entities/Vessel.js';
import { garrisonAnchor, garrisonTier, readEmpireGarrisonSnapshot } from '../utils/GarrisonPlanner.js';
import { readEmpireWavePlan, planWave, STRIKE_TRANSPORT_TEMPLATE } from '../utils/StrikeWavePlanner.js';
import { systemIdOf } from '../utils/SystemScope.js';

/** Klucz najwyższego poziomu w `gameState` (deklaracja: `GameState.createDefaultState`). */
export const SQUADRON_STATE_KEY = 'strikeSquadrons';

/**
 * Etapy rekordu eskadry:
 *   `launched` (w drodze do celu) → `landed` (desant; eskorta i transportowiec trzymają orbitę celu — SB63) → `returning`
 *   (walka naziemna rozstrzygnięta albo pokój albo atak bez desantu — wszyscy wracają do stolicy; `outcome`) → `closed`
 *   (transportowiec usunięty na orbicie stolicy);
 *   `launched` → `aborted` (SB66 — cała eskorta stracona; transportowiec wraca) → `closed`;
 *   `launched` / `aborted` → `transport_lost` (transportowiec wrakiem razem z falą — koniec).
 * Etapy KOŃCOWE i „w drodze” (S3/2, SB57: reguła odbijania czeka, aż żadna eskadra imperium nie jest w drodze) niżej.
 */
export const TERMINAL_STAGES = new Set(['transport_lost', 'closed']);
export const UNDERWAY_STAGES = new Set(['launched', 'landed', 'aborted', 'returning']);

export class StrikeSquadronSystem {
  constructor() {
    this._onWrecked = ({ vessel } = {}) => this._onVesselWrecked(vessel);
    this._onLanded  = (e = {}) => this._onTroopsLanded(e);
    this._onTick    = () => this._tick();
    this._onPeace   = ({ empireId } = {}) => this._onPeaceSigned(empireId);
    this._onBlocked = (e = {}) => this._onLandingBlocked(e);
    EventBus.on('vessel:wrecked', this._onWrecked);
    EventBus.on('invasion:troopsLanded', this._onLanded);
    EventBus.on('time:tick', this._onTick);
    EventBus.on('diplomacy:peaceSigned', this._onPeace);
    EventBus.on('invasion:blocked', this._onBlocked);
  }

  destroy() {
    EventBus.off('vessel:wrecked', this._onWrecked);
    EventBus.off('invasion:troopsLanded', this._onLanded);
    EventBus.off('time:tick', this._onTick);
    EventBus.off('diplomacy:peaceSigned', this._onPeace);
    EventBus.off('invasion:blocked', this._onBlocked);
  }

  _K() { return (typeof window !== 'undefined') ? window.KOSMOS : null; }

  // ── Odczyty ──────────────────────────────────────────────────────────────────────────

  /** Rekordy eskadr (kopie), opcjonalnie jednego imperium. */
  listSquadrons(empireId = null) {
    const all = gameState.get(SQUADRON_STATE_KEY) ?? {};
    return Object.values(all).filter((s) => s && (!empireId || s.empireId === empireId)).map((s) => ({ ...s }));
  }

  getSquadron(id) {
    const s = gameState.get(`${SQUADRON_STATE_KEY}.${id}`);
    return s ? { ...s } : null;
  }

  /**
   * Eskadra, do której należy kadłub (transportowiec albo eskorta) — rekord nieskończony ma pierwszeństwo przed
   * zakończonym (kadłub eskorty może latać w kolejnych eskadrach). Kopia; brak — `null`.
   */
  squadronOfVessel(vesselId) {
    if (!vesselId) return null;
    let found = null;
    for (const s of this.listSquadrons()) {
      if (s.transportId !== vesselId && !(s.escortIds ?? []).includes(vesselId)) continue;
      if (!TERMINAL_STAGES.has(s.stage)) return s;
      found = found ?? s;
    }
    return found;
  }

  /** SB63 — czy kadłub należy do eskadry trzymającej orbitę celu po desancie (`landed`). `DirectorRecall` go pomija. */
  isHolding(vesselId) {
    return this.squadronOfVessel(vesselId)?.stage === 'landed';
  }

  /** SB57 — czy imperium ma eskadrę w drodze (etap nie-końcowy). */
  hasSquadronUnderway(empireId) {
    return this.listSquadrons(empireId).some((s) => UNDERWAY_STAGES.has(s.stage));
  }

  /** Fala, którą imperium wysłałoby teraz (tylko odczyt; ładownia — szablon transportowca). */
  wavePlan(empireId) {
    return readEmpireWavePlan(this._K(), empireId);
  }

  // ── Wejście produkcyjne ──────────────────────────────────────────────────────────────

  /**
   * Eskadra: transportowiec z falą + eskorta, lot razem na ciało celu.
   * @param {string} empireId
   * @param {string} targetBodyId
   * @param {string[]} escortIds — uzbrojone kadłuby imperium w służbie, w układzie stolicy, bez zajęcia, nie strażnicy
   * @returns {{ok:true, squadronId:string, transportId:string, unitIds:string[], wave:Object, composite:boolean}
   *         | {ok:false, reason:string, vesselId?:string, detail?:any}}
   *   powody: `unknown_empire` · `target_not_found` · `own_target` · `no_capital` · `no_escorts` · `escort_*` (statek) ·
   *   `empty_wave` · `transport_failed` · `unit_failed` · `cargo_full` · `group_refused`
   */
  launchSquadron(empireId, targetBodyId, escortIds = []) {
    const K = this._K();
    const refuse = (reason, extra = {}) => {
      EventBus.emit('squadron:launchRefused', { empireId, targetBodyId, reason, ...extra });
      return { ok: false, reason, ...extra };
    };
    const reg = K?.empireRegistry;
    const vm = K?.vesselManager;
    const gum = K?.groundUnitManager;
    const os = K?.orderService;
    if (!empireId || empireId === 'player' || !reg?.get?.(empireId)) return refuse('unknown_empire');
    const body = EntityManager.get(targetBodyId);
    if (!body) return refuse('target_not_found');
    const targetOwner = K?.colonyManager?.getColony?.(targetBodyId)?.ownerEmpireId ?? null;
    if (targetOwner === empireId) return refuse('own_target');
    const capital = K?.directorProduction?.capitalOf?.(empireId) ?? null;
    if (!capital || capital.ownerEmpireId !== empireId) return refuse('no_capital');
    const homeSys = systemIdOf(EntityManager.get(capital.planetId));
    if (!vm || !gum || !os) return refuse('no_services');

    // ── eskorta (walidacja przed utworzeniem czegokolwiek) ──
    const ids = [...new Set(escortIds ?? [])];
    if (ids.length === 0) return refuse('no_escorts');
    const crossSystem = homeSys !== systemIdOf(body);
    for (const id of ids) {
      const v = vm.getVessel?.(id);
      if (!v || v.isWreck) return refuse('escort_missing', { vesselId: id });
      if ((v.ownerEmpireId ?? v.owner) !== empireId || !isEnemyVessel(v)) return refuse('escort_not_owned', { vesselId: id });
      if (!isInService(v)) return refuse('escort_not_in_service', { vesselId: id });
      if (!hasWeapons(v)) return refuse('escort_unarmed', { vesselId: id });
      if (systemIdOf(v) !== homeSys) return refuse('escort_not_home', { vesselId: id });
      if (v.mission || v.movementOrder || v.pendingOrder) return refuse('escort_busy', { vesselId: id });
      if (K?.directorDoctrine?.isGuard?.(empireId, id)) return refuse('escort_is_guard', { vesselId: id });
      if (crossSystem && !(v.warpFuel?.max > 0)) return refuse('escort_no_warp_tank', { vesselId: id });
      const st = v.position?.state;
      if (st !== 'docked' && st !== 'orbiting') return refuse('escort_not_ready', { vesselId: id });
    }

    // ── fala (plan przed utworzeniem; ładownia — szablon) ──
    const plan0 = readEmpireWavePlan(K, empireId);
    if (plan0.count <= 0) return refuse('empty_wave', { wave: plan0 });

    // ── transportowiec ──
    const tr = vm.createAIVessel?.({ templateId: STRIKE_TRANSPORT_TEMPLATE, empireId, planetId: capital.planetId, origin: 'squadron' });
    if (!tr?.ok) return refuse('transport_failed', { detail: tr?.reason ?? null });
    const transport = tr.vessel;

    // ── fala: obcięcie do ŻYWEJ ładowni kadłuba, jednostki NOWE przy stolicy, załadunek ──
    const tier = garrisonTier(readEmpireGarrisonSnapshot(K, empireId));
    const plan = planWave({ limit: plan0.limit, share: plan0.share, tier, capacity: transport.troopCapacity ?? 0 });
    const anchor = garrisonAnchor(capital.grid, !!capital.isOutpost) ?? { q: 0, r: 0 };
    const unitIds = [];
    const rollback = (reason, extra = {}) => {
      for (const uid of unitIds) gum.removeUnit?.(uid);
      vm.destroyVessel?.(transport.id);
      return refuse(reason, extra);
    };
    if (plan.count <= 0) return rollback('empty_wave', { wave: plan });
    for (const archetypeId of plan.composition) {
      const r = gum.createAIUnit?.({ archetypeId, empireId, planetId: capital.planetId, q: anchor.q, r: anchor.r, morale: tier.morale, deployed: false });
      if (!r?.ok) return rollback('unit_failed', { detail: r?.reason ?? null });
      unitIds.push(r.unit.id);
      if (loadGroundUnit(transport, r.unit)?.ok !== true) return rollback('cargo_full', { detail: archetypeId });
    }

    // ── grupa: lot razem (SB54) ──
    const squadronId = this._nextId(empireId);
    const members = [...ids, transport.id];
    const g = os.issueGroupAttack?.(members, { targetBodyId, targetSystemId: body.systemId ?? null, groupId: squadronId });
    if (!g?.ok) return rollback('group_refused', { detail: g?.reason ?? null, vesselId: g?.vesselId ?? null });

    const year = K?.timeSystem?.gameTime ?? null;
    const wave = { wanted: plan.wanted, count: plan.count, composition: [...plan.composition], morale: plan.morale,
                   rung: plan.rung, size: plan.size, capacity: plan.capacity, share: plan0.share, limit: plan0.limit };
    const record = {
      id: squadronId, empireId, targetBodyId, targetSystemId: body.systemId ?? null, capitalId: capital.planetId,
      escortIds: [...ids], transportId: transport.id, unitIds: [...unitIds], wave,
      launchedYear: year, crossSystem, stage: 'launched', stageYear: year,
    };
    gameState.set(`${SQUADRON_STATE_KEY}.${squadronId}`, record, 'squadron_launched');
    EventBus.emit('squadron:launched', { ...record, escortIds: [...ids], unitIds: [...unitIds] });
    return { ok: true, squadronId, transportId: transport.id, unitIds: [...unitIds], wave, composite: g.composite === true };
  }

  /** Identyfikator unikalny w zapisie: `sq_<imperium>_<n>`. */
  _nextId(empireId) {
    const all = gameState.get(SQUADRON_STATE_KEY) ?? {};
    let n = Object.values(all).filter((s) => s?.empireId === empireId).length + 1;
    while (all[`sq_${empireId}_${n}`]) n++;
    return `sq_${empireId}_${n}`;
  }

  // ── Stan rekordu ─────────────────────────────────────────────────────────────────────

  _setStage(id, stage, extra = {}) {
    const s = gameState.get(`${SQUADRON_STATE_KEY}.${id}`);
    if (!s) return;
    const year = this._K()?.timeSystem?.gameTime ?? null;
    gameState.set(`${SQUADRON_STATE_KEY}.${id}`, { ...s, ...extra, stage, stageYear: year }, `squadron_${stage}`);
  }

  /** Dopisz pola rekordu bez zmiany etapu. */
  _patch(id, extra = {}) {
    const s = gameState.get(`${SQUADRON_STATE_KEY}.${id}`);
    if (!s) return;
    gameState.set(`${SQUADRON_STATE_KEY}.${id}`, { ...s, ...extra }, 'squadron_update');
  }

  /**
   * Wrak w eskadrze.
   *   • transportowiec — fala zginęła z nim (SB41); rekord: `transport_lost` (także eskadra przerwana, w drodze do domu);
   *   • eskorta — gdy w eskadrze lecącej do celu (`launched`) nie został ŻADEN żywy kadłub eskorty, eskadra jest
   *     PRZERYWANA (SB66, Finding 435): rekord `aborted`, composite grupy transportowca zdjęty natychmiast (przylot ze skoku
   *     nie wyda mu odcinka do celu), a sam transportowiec zawraca do stolicy — od razu albo na najbliższym ticku, gdy
   *     wyjdzie ze starcia / skoku (`_tick`). Desantu nie ma (`InvasionSystem._onVesselGroupVictory` pomija zrzutowiec
   *     eskadry, która nie jest w drodze do tego ciała).
   */
  _onVesselWrecked(vessel) {
    if (!vessel?.id) return;
    for (const s of this.listSquadrons()) {
      if (s.transportId === vessel.id && (s.stage === 'launched' || s.stage === 'aborted')) {
        this._setStage(s.id, 'transport_lost');
        continue;
      }
      if (s.transportId === vessel.id && (s.stage === 'landed' || s.stage === 'returning')) {
        this._setStage(s.id, 'closed', { closeReason: 'transport_lost' });   // fala już na ziemi albo rozstrzygnięta
        continue;
      }
      if (!(s.escortIds ?? []).includes(vessel.id) || this._liveEscorts(s).length > 0) continue;
      if (s.stage === 'launched') {
        this._setStage(s.id, 'aborted', { abortReason: 'escorts_lost', homeOrdered: false });
        const tr = this._K()?.vesselManager?.getVessel?.(s.transportId);
        if (tr && !tr.isWreck) tr.pendingOrder = null;
        this._returnTransport(this.getSquadron(s.id));
      } else if (s.stage === 'landed') {
        // SB66 przy trzymaniu orbity: fala walczy dalej na ziemi, transportowiec wraca.
        this._toReturning(s, 'escorts_lost');
      }
    }
  }

  /** SB63 — `returning` z wynikiem; composite członków zdjęte od razu (przylot ze skoku nie wyda odcinka), powrót. */
  _toReturning(s, outcome) {
    this._setStage(s.id, 'returning', { outcome });
    const vm = this._K()?.vesselManager;
    for (const id of [s.transportId, ...(s.escortIds ?? [])]) {
      const v = vm?.getVessel?.(id);
      if (v && !v.isWreck && v.pendingOrder && v.pendingOrder.kind !== 'recall') v.pendingOrder = null;
    }
    this._sendMembersHome(this.getSquadron(s.id));
  }

  /** POKÓJ z graczem (`diplomacy:peaceSigned`): eskadra w drodze albo trzymająca orbitę wraca; nic nie ląduje. */
  _onPeaceSigned(empireId) {
    if (!empireId || empireId === 'player') return;
    for (const s of this.listSquadrons(empireId)) {
      if (s.stage === 'launched' || s.stage === 'landed') this._toReturning(s, 'peace');
    }
  }

  /** Odmowa desantu (`invasion:blocked`) — powód zapisany na eskadrze imperium lecącej do tego ciała / układu. */
  _onLandingBlocked({ empireId, systemId, planetId, reason } = {}) {
    if (!empireId || !reason) return;
    for (const s of this.listSquadrons(empireId)) {
      if (s.stage !== 'launched') continue;
      if (planetId ? s.targetBodyId !== planetId : s.targetSystemId !== systemId) continue;
      this._patch(s.id, { lastBlockReason: reason });
    }
  }

  /** Żywe kadłuby eskorty eskadry (nie wraki, w rejestrze). */
  _liveEscorts(s) {
    const vm = this._K()?.vesselManager;
    return (s?.escortIds ?? []).map((id) => vm?.getVessel?.(id)).filter((v) => v && !v.isWreck);
  }

  // ── Powrót do stolicy (SB66) ─────────────────────────────────────────────────────────

  /**
   * Tik czasu:
   *   • `launched` — atak skończony BEZ desantu (transportowiec bezczynny na orbicie celu, bitwa nie czeka w oknie
   *     `EnemyAttackHandler`) → `returning` (`not_landed`, powód ostatniej odmowy w `lastBlockReason`);
   *   • `landed` — walka naziemna rozstrzygnięta (`_groundDecision`) → `returning`;
   *   • `aborted` — transportowiec bez rozkazu powrotu dostaje go; w domu — usunięty, `closed`;
   *   • `returning` — członek bezczynny poza domem dostaje rozkaz powrotu; transportowiec w domu — usunięty, `closed`.
   */
  _tick() {
    for (const s of this.listSquadrons()) {
      if (s.stage === 'launched') {
        if (this._attackEndedWithoutLanding(s)) this._toReturning(s, 'not_landed');
      } else if (s.stage === 'landed') {
        const d = this._groundDecision(s);
        if (d) this._toReturning(s, d);
      } else if (s.stage === 'aborted') {
        if (s.homeOrdered !== true) this._returnTransport(s);
        this._closeIfHome(this.getSquadron(s.id));
      } else if (s.stage === 'returning') {
        this._sendMembersHome(s);
        this._closeIfHome(this.getSquadron(s.id));
      }
    }
  }

  /** Atak skończony bez desantu: transportowiec żywy, bezczynny na orbicie celu, poza starciem i poza oknem bitwy EAH. */
  _attackEndedWithoutLanding(s) {
    const K = this._K();
    const tr = K?.vesselManager?.getVessel?.(s.transportId);
    if (!tr || tr.isWreck) return false;
    if (tr.position?.dockedAt !== s.targetBodyId || tr.position?.state !== 'orbiting') return false;
    if (tr.mission || tr.movementOrder || tr.pendingOrder) return false;
    if (K?.enemyAttackHandler?._pendingBattles?.has?.(s.targetBodyId)) return false;
    return !this._inEncounter(tr.id);
  }

  /**
   * SB63 — czy walka naziemna o cel się rozstrzygnęła: ciało ZDOBYTE (kolonia imperium eskadry) → `captured`; żadna
   * jednostka desantu nie żyje na ciele → `wave_destroyed`; ciało albo kolonia zniknęły → `target_lost`; inaczej `null`.
   */
  _groundDecision(s) {
    const K = this._K();
    const bodyId = s.landedOn ?? s.targetBodyId;
    if (!EntityManager.get(bodyId)) return 'target_lost';
    const col = K?.colonyManager?.getColony?.(bodyId);
    if (!col) return 'target_lost';
    if (col.ownerEmpireId === s.empireId) return 'captured';
    const gum = K?.groundUnitManager;
    const alive = (s.landedUnitIds ?? []).some((uid) => {
      const u = gum?.getUnit?.(uid);
      return !!u && (u.hp ?? 0) > 0 && u.planetId === bodyId;
    });
    return alive ? null : 'wave_destroyed';
  }

  /** Kadłub w domu: na orbicie (albo w doku) ciała stolicy, bez misji, rozkazu i composite. */
  _isHome(v, empireId) {
    const capitalId = this._K()?.directorProduction?.capitalOf?.(empireId)?.planetId ?? null;
    if (!v || !capitalId) return false;
    const st = v.position?.state;
    return v.position?.dockedAt === capitalId && (st === 'orbiting' || st === 'docked')
      && !v.mission && !v.movementOrder && !v.pendingOrder;
  }

  /** Kadłub już w drodze do domu tym odwołaniem: composite `recall` albo odcinek domowy (`ai_recall`). */
  _homeBound(v) {
    return v?.pendingOrder?.kind === 'recall' || v?.movementOrder?.issuedBy === 'ai_recall';
  }

  /** Członkowie eskadry (`returning`: transportowiec i eskorta; `aborted`: transportowiec) — powrót tam, gdzie trzeba. */
  _sendMembersHome(s) {
    if (!s) return;
    const vm = this._K()?.vesselManager;
    const ids = s.stage === 'returning' ? [s.transportId, ...(s.escortIds ?? [])] : [s.transportId];
    for (const id of ids) {
      const v = vm?.getVessel?.(id);
      if (!v || v.isWreck || this._isHome(v, s.empireId) || this._homeBound(v)) continue;
      this._sendHome(v, s.empireId);
    }
  }

  /**
   * SB63 — transportowiec na orbicie stolicy: niewylądowana fala (eskadra przerwana albo wracająca po pokoju) znika z nim
   * CICHO (`removeUnit` — jak przy cofnięciu wysyłki; fala powstała dla tej eskadry), kadłub usunięty (`destroyVessel`),
   * rekord `closed`. Bez stolicy (imperium bez pełnej kolonii) — to samo, z powodem `no_capital`.
   */
  _closeIfHome(s) {
    if (!s || TERMINAL_STAGES.has(s.stage)) return;
    const K = this._K();
    const vm = K?.vesselManager;
    const tr = vm?.getVessel?.(s.transportId);
    if (!tr || tr.isWreck) return;
    const hasCapital = !!K?.directorProduction?.capitalOf?.(s.empireId);
    if (hasCapital && !this._isHome(tr, s.empireId)) return;
    const dissolved = [...(tr.groundUnits ?? [])];
    for (const uid of dissolved) K?.groundUnitManager?.removeUnit?.(uid);
    vm.destroyVessel?.(tr.id);
    this._setStage(s.id, 'closed', { closeReason: hasCapital ? 'transport_home' : 'no_capital', dissolvedUnitIds: dissolved });
    EventBus.emit('squadron:closed', { squadronId: s.id, empireId: s.empireId, outcome: s.outcome ?? s.abortReason ?? null,
                                       closeReason: hasCapital ? 'transport_home' : 'no_capital', dissolved: dissolved.length });
  }

  /** Zawróć transportowiec eskadry do stolicy; zapisuje `homeOrdered`, gdy rozkaz poszedł. */
  _returnTransport(s) {
    if (!s) return;
    const tr = this._K()?.vesselManager?.getVessel?.(s.transportId);
    if (!tr || tr.isWreck) return;
    const r = this._sendHome(tr, s.empireId);
    if (r === 'ordered' || r === 'at_home') this._patch(s.id, { homeOrdered: true, homeOrderedYear: this._K()?.timeSystem?.gameTime ?? null });
  }

  /** Czy kadłub jest w aktywnym starciu (DSCS) — odczyt jak w `DirectorOffensive` / `DirectorRecall`. */
  _inEncounter(vesselId) {
    const dscs = this._K()?.deepSpaceCombatSystem;
    return !!dscs?._findActiveEncounterContaining?.(vesselId);
  }

  /**
   * Zatrzymaj kadłub i wyślij go do stolicy istniejącym odwołaniem (`OrderService.issueRecall` — skok warp, potem orbita
   * ciała stolicy). W starciu albo w skoku — czekamy (`'wait'`): starcie wznawia misje po bitwie, skoku nie da się
   * przerwać. Zatrzymanie: migawka wstrzymanej misji usunięta PRZED anulowaniem rozkazu (inaczej anulowanie wznowiłoby
   * atak), composite zdjęty, misja wyzerowana, lot przerwany w miejscu (dryf — jak `MovementOrderSystem._stopVesselMotion`).
   * @returns {'ordered'|'at_home'|'wait'|'no_capital'|'gone'|string} — `refused:<powód>` przy odmowie odwołania
   */
  _sendHome(v, empireId) {
    if (!v || v.isWreck) return 'gone';
    if (this._inEncounter(v.id)) return 'wait';
    if (v.mission?.type === 'interstellar_jump' && v.mission.phase === 'warp_transit') return 'wait';
    const K = this._K();
    const capitalId = K?.directorProduction?.capitalOf?.(empireId)?.planetId ?? null;
    const homeSystemId = capitalId ? (EntityManager.get(capitalId)?.systemId ?? null) : null;
    if (!capitalId || !homeSystemId) return 'no_capital';
    if (v.position?.dockedAt === capitalId && !v.mission && !v.movementOrder && !v.pendingOrder) return 'at_home';
    delete v._suspendedMission;
    v.pendingOrder = null;
    if (v.movementOrder?.status === 'active') K?.movementOrderSystem?.cancelOrder?.(v.id, 'squadron_return');
    v.mission = null;
    if (v.position?.state === 'in_transit') { v.position.state = 'orbiting'; v.position.dockedAt = null; }
    if (v.velocity) { v.velocity.vx = 0; v.velocity.vy = 0; }
    v.status = 'idle';
    const r = K?.orderService?.issueRecall?.(v.id, { homeSystemId, capitalBodyId: capitalId });
    return r?.ok ? 'ordered' : `refused:${r?.reason ?? 'unknown'}`;
  }

  /** Desant z ładunku transportowca eskadry (`InvasionSystem._landCargo` niesie `vesselIds`); rekord: `landed`. */
  _onTroopsLanded({ vesselIds, unitIds, planetId } = {}) {
    if (!Array.isArray(vesselIds)) return;
    for (const s of this.listSquadrons()) {
      if (s.stage === 'launched' && vesselIds.includes(s.transportId)) {
        this._setStage(s.id, 'landed', { landedUnitIds: [...(unitIds ?? [])], landedOn: planetId ?? null });
      }
    }
  }
}

export default StrikeSquadronSystem;
