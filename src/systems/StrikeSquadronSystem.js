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
//
// ⚠ Wszystko albo nic: walidacja eskorty i fali PRZED utworzeniem czegokolwiek; odmowa rozkazu grupy cofa utworzony
//   transportowiec i jednostki (nic nie zostaje).
// ⚠ W S3 (sesja 1) jedynym wołającym jest dźwignia debug `KOSMOS.debug.sbLaunchSquadron` — reguła Directora (odbijanie,
//   SB57) przyjdzie w sesji 2 na tych samych częściach.
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
 * Etapy rekordu eskadry: `launched` (w drodze do celu) → `landed` (desant) · `aborted` (S3/2, SB66 — cała eskorta stracona,
 * transportowiec wraca do stolicy) · `transport_lost` (transportowiec wrakiem — koniec). Etapy KOŃCOWE niżej.
 */
export const TERMINAL_STAGES = new Set(['transport_lost']);

export class StrikeSquadronSystem {
  constructor() {
    this._onWrecked = ({ vessel } = {}) => this._onVesselWrecked(vessel);
    this._onLanded  = (e = {}) => this._onTroopsLanded(e);
    this._onTick    = () => this._tick();
    EventBus.on('vessel:wrecked', this._onWrecked);
    EventBus.on('invasion:troopsLanded', this._onLanded);
    EventBus.on('time:tick', this._onTick);
  }

  destroy() {
    EventBus.off('vessel:wrecked', this._onWrecked);
    EventBus.off('invasion:troopsLanded', this._onLanded);
    EventBus.off('time:tick', this._onTick);
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
      if (s.stage === 'launched' && (s.escortIds ?? []).includes(vessel.id) && this._liveEscorts(s).length === 0) {
        this._setStage(s.id, 'aborted', { abortReason: 'escorts_lost', homeOrdered: false });
        const tr = this._K()?.vesselManager?.getVessel?.(s.transportId);
        if (tr && !tr.isWreck) tr.pendingOrder = null;
        this._returnTransport(this.getSquadron(s.id));
      }
    }
  }

  /** Żywe kadłuby eskorty eskadry (nie wraki, w rejestrze). */
  _liveEscorts(s) {
    const vm = this._K()?.vesselManager;
    return (s?.escortIds ?? []).map((id) => vm?.getVessel?.(id)).filter((v) => v && !v.isWreck);
  }

  // ── Powrót do stolicy (SB66) ─────────────────────────────────────────────────────────

  /** Tik czasu: transportowiec eskadry przerwanej, który jeszcze nie dostał rozkazu powrotu, dostaje go. */
  _tick() {
    for (const s of this.listSquadrons()) {
      if (s.stage === 'aborted' && s.homeOrdered !== true) this._returnTransport(s);
    }
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
