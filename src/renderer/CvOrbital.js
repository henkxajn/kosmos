// CvOrbital — klej POWTÓRKI BITWY ORBITALNEJ w rendererze (ARC COMBAT VISUALS, krok CV-8a; plan §2.8, D-CV-25 / D-CV-26 /
// D-CV-27, Findingi 628 / 632 / 635; flaga `cvOrbital`). Logika powtórki — czysty `combat/OrbitalReplayLogic.js`.
//
// Przepływ:
//   `battle:resolved` z kluczem `fx` (EnemyAttackHandler — atak na kolonię) → `handle(payload)` (idempotentne: woła je słuchacz
//   renderera i `GameScene`, kolejność słuchaczy bez znaczenia) → powtórka tylko w OGLĄDANYM układzie, poza galaktyką (628) →
//   STARCIE WIRTUALNE w kształcie starcia DSCS (`sideA` / `sideB` / `vesselStates` / `timeline` / `currentRound` / `location` /
//   `isActive`) — czytają je scena bitwy (`_stageClusters` → `stageClusters()`), rejestr salw (`_cvWpnRoundFx` z rundami powtórki),
//   osłony, uszkodzenia, warstwa taktyczna, pasek walki i reżyser przez akcesory renderera (`_cvEncList` / `_cvEncById` / `_cvEncOf`);
//   logika gry tego obiektu NIE widzi (powtórka czyta, logika pisze — §2.1).
//   Co klatkę (`tick`, zegar prezentacji — pauza = pauza): runda k wchodzi do rejestru w chwili start + ORB_LEAD_MS + (k − 1)·R;
//   po ostatniej rundzie starcie czeka na ostatnie trafienia (≤ ORB_TAIL_ROUNDS·R), potem `combatfx:orbitalReplayEnd` (baner).
//   Wraki: `EnemyAttackHandler` robi wraki ZARAZ po zdarzeniu — `deferWreck` wstrzymuje zamianę we wrak do zniszczenia w powtórce
//   (`afterKill`); okręty z hangaru (bez sprite'a) — wybuch na emiterze i sprite wraku dopiero po zniszczeniu (`holdsHidden`).
//   Zmiana układu / galaktyka w trakcie — przerwanie: zaległe zamiany we wrak od razu, baner.
//
// ⚠ Kod warstwy wizualnej NIGDY nie woła `Math.random` (reguła CV-0b) — ziarno = `battleId`.

import { GAME_CONFIG } from '../config/GameConfig.js';
import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { HULLS } from '../data/HullsData.js';
import { SHIP_MODULES } from '../data/ShipModulesData.js';
import {
  buildOrbitalReplay, orbitalFormation, orbitalBearing, orbitalEmitterDirs, orbitalReplayInView, orbitalEncounterId, orbitalOutcome, ORB_TUNING,
} from './combat/OrbitalReplayLogic.js';
import { VESSEL_TARGET_SIZE } from './VesselModelResolver.js';

const L_FRIGATE = VESSEL_TARGET_SIZE.frigate;
const S = (v) => v / 10;   // gameplay px → j. świata (WORLD_SCALE renderera)

/** Okręt powtórki z obiektu statku: HP kadłuba jak `playerVesselsToBattleUnit` (bez premii modułów), osłona i broń z modułów. */
export function orbitalShipOf(v, { hangar = false } = {}) {
  const hull = HULLS?.[v?.hullId] ?? HULLS?.[v?.shipId];
  let shield = 0, regen = 0;
  const weapons = [];
  for (const m of v?.modules ?? []) {
    const st = SHIP_MODULES?.[m]?.stats;
    if (!st) continue;
    if (st.shieldHP) shield += st.shieldHP;
    if (st.shieldRegen) regen += st.shieldRegen;
    if (st.damage != null) weapons.push({ category: st.category ?? st.range ?? 'medium', damage: st.damage, moduleId: m, rangeAU: st.rangeAU ?? null });
  }
  return { id: String(v.id), hpStart: hull?.baseHP ?? 50, shieldStart: shield, shieldRegen: regen, weapons, hangar, knownHull: !!hull };
}

export class CvOrbital {
  constructor(renderer) {
    this.r = renderer;
    this.replays = new Map();      // battleId → stan powtórki
    this._byEnc = new Map();       // id starcia wirtualnego → stan
    this.stats = { started: 0, refusedView: 0, refusedFlags: 0, ended: 0, aborted: 0, roundsFed: 0, killsShown: 0, hangarKills: 0, deferred: 0, last: null };
  }

  /** Warunki powtórki: `cvOrbital` + rejestr salw (`cvWeapons` / `fcCombatFx`). */
  get flag() {
    const F = GAME_CONFIG.FEATURES;
    return !!(F?.cvOrbital && F?.cvWeapons && F?.fcCombatFx);
  }

  get tuning() { return this.r?.cvTuning ?? ORB_TUNING; }

  // ── Start ────────────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * `battle:resolved` (słuchacz renderera i `GameScene`) — idempotentne. Zwraca true, gdy powtórka tej bitwy trwa (baner czeka).
   * @param {{ battleId:string, result:object, fx?:object }} payload
   */
  handle(payload) {
    const fx = payload?.fx;
    const battleId = payload?.battleId;
    if (!fx || fx.kind !== 'orbital' || battleId == null) return false;
    if (this.replays.has(battleId)) return true;
    if (this._done?.has(battleId)) return false;
    if (!this.flag) { this.stats.refusedFlags++; return false; }
    const K = window.KOSMOS;
    const r = this.r;
    const inView = orbitalReplayInView({ battleSystemId: fx.systemId, activeSystemId: K?.activeSystemId,
      galaxy: !!(r?._galaxyActive || r?._galaxyFlight) });
    if (!inView) { this.stats.refusedView++; (this._done ??= new Set()).add(battleId); return false; }
    const vm = K?.vesselManager;
    const getV = (id) => vm?.getVessel?.(id) ?? vm?._vessels?.get?.(id) ?? null;
    const hangarSet = new Set((fx.hangarIds ?? []).map(String));
    const attackers = (fx.attackerIds ?? []).map(getV).filter(Boolean).map((v) => orbitalShipOf(v));
    const defenders = (fx.defenderIds ?? []).map(getV).filter(Boolean).map((v) => orbitalShipOf(v, { hangar: hangarSet.has(String(v.id)) }));
    const def = fx.defence ?? {};
    const poolHp = Math.max(0, Number(def.poolHp) || 0);
    // HP startu stron jak w BattleSystem: suma znanych kadłubów (≥ 1), strona B + pula obrony (flota + obrona, sama obrona, żeton).
    const sum = (list) => list.filter((s) => s.knownHull).reduce((a, s) => a + s.hpStart, 0);
    const sideHp = { A: Math.max(1, sum(attackers)), B: defenders.length ? Math.max(1, sum(defenders)) + poolHp : (poolHp || 100) };
    // powód końca z `fx` (rekord bitwy wojny go nie niesie — pat ma zostać patem, bez zniszczeń)
    const result = { ...payload.result, endReason: payload.result?.endReason ?? fx.endReason ?? null };
    const rep = buildOrbitalReplay({ battleId, result, attackers, defenders, defence: { ...def, poolHp }, sideHp, tuning: this.tuning });
    if (!rep?.rounds) { (this._done ??= new Set()).add(battleId); return false; }
    const encId = rep.encounterId;
    const planet = fx.planetId ? EntityManager.get(fx.planetId) : null;
    const stageIds = [...attackers, ...defenders.filter((d) => !d.hangar)].map((s) => s.id);
    const vesselStates = new Map();
    for (const [id, m] of Object.entries(rep.members)) {
      vesselStates.set(id, { hp: m.hpStart, hpStart: m.hpStart, shieldHP: m.shieldStart, shieldHPStart: m.shieldStart, armor: 0, evasion: 0,
        weapons: m.weapons.map((w) => ({ moduleId: w.moduleId, category: w.category, rangeAU: SHIP_MODULES?.[w.moduleId]?.stats?.rangeAU ?? null })),
        uncounted: m.kind === 'pool' ? true : undefined, orbitalKind: m.kind });
    }
    const empId = fx.empireId ?? payload.result?.participantA?.empireId ?? null;
    const venc = {
      id: encId, orbital: true, battleId,
      sideA: { vesselIds: attackers.map((s) => s.id), joinedVesselIds: [], ownerEmpireId: empId, label: payload.result?.participantA?.label ?? null },
      sideB: { vesselIds: [...defenders.map((s) => s.id), ...(rep.poolId ? [rep.poolId] : [])], joinedVesselIds: [], ownerEmpireId: 'player',
        label: payload.result?.participantB?.label ?? null },
      vesselStates,
      location: { systemId: fx.systemId, planetId: fx.planetId ?? null,
        point: planet && Number.isFinite(planet.x) ? { x: planet.x, y: planet.y } : null },
      startYear: payload.result?.year ?? null, currentRound: 0, timeline: [], isActive: true, logicEnded: false, seedBase: rep.seed,
    };
    const now = r?._presClock?.nowMs ?? 0;
    const st = {
      battleId, encId, fx, rep, venc, startedAt: now, nextRound: 1, lastFeedAt: null, endAt: null, planetId: fx.planetId ?? null,
      systemId: fx.systemId, stageIds, hangar: new Set(defenders.filter((d) => d.hangar).map((d) => d.id)),
      holdHidden: new Set(defenders.filter((d) => d.hangar && rep.kills[d.id] != null).map((d) => d.id)),
      deferred: new Map(), shown: new Set(), bearing: null, emitterDirs: null,
      outcome: orbitalOutcome(result, { playerSide: 'B' }),   // CV-8b — wiersz wyniku na pasku walki po powtórce (§3.1-6)
    };
    this.replays.set(battleId, st);
    this._byEnc.set(encId, st);
    this.stats.started++;
    this.stats.last = { battleId, rounds: rep.rounds, turns: rep.turns, startedAt: now };
    this._reapplyIntel(st);   // napastnicy ujawnieni na czas powtórki (pełne krycie — starcie z graczem, P2a CP17)
    return true;
  }

  // ── Co klatkę ────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Z `_tickCvFx` (po zegarze prezentacji, przed rejestrem salw): rundy powtórki do rejestru, koniec, przerwanie. */
  tick() {
    if (!this.replays.size) return;
    const K = window.KOSMOS, r = this.r;
    const now = r?._presClock?.nowMs ?? 0;
    const R = K?.timeSystem?.combatRoundMs?.() ?? 1150;
    const T = this.tuning;
    for (const st of [...this.replays.values()]) {
      const inView = orbitalReplayInView({ battleSystemId: st.systemId, activeSystemId: K?.activeSystemId, galaxy: !!(r?._galaxyActive || r?._galaxyFlight) });
      if (!inView) { this._end(st, 'aborted'); continue; }
      const lead = Math.max(0, Number(T.ORB_LEAD_MS ?? 700) || 0);
      // Finding 635 (sonda `probe-635-double-resolution`): rajder, który przeżył starcie DSCS w podejściu, przylatuje i ta sama walka
      // wraca jako bitwa orbitalna EAH — powtórka czeka, aż scena DSCS tych statków się skończy (starcie aktywne albo jego ogon w
      // rejestrze, Finding 711), inaczej dwie sceny pisałyby ten sam sprite.
      if (st.nextRound === 1 && this._busyInDeepSpace(st)) { st.startedAt = now; st.waitedDscs = (st.waitedDscs ?? 0) + 1; continue; }
      if (st.nextRound <= st.rep.rounds && now >= st.startedAt + lead + (st.nextRound - 1) * R) this._feed(st, now);
      if (st.nextRound > st.rep.rounds) {
        if (st.endAt == null) st.endAt = now;
        const pending = r?._cvLedger?.hasPending?.([st.encId]) ?? false;
        const tailMax = Math.max(1, Number(T.ORB_TAIL_ROUNDS ?? 3) || 3) * R;
        if ((!pending && now - st.endAt > 0.25 * R) || now - st.endAt > tailMax) this._end(st, 'ended');
      }
    }
  }

  _busyInDeepSpace(st) {
    const dscs = window.KOSMOS?.deepSpaceCombatSystem;
    const linger = this.r?._stageLinger;
    for (const id of st.stageIds) {
      if (dscs?._findActiveEncounterContaining?.(id)) return true;
      if (linger?.size) for (const [, rec] of linger) if (rec?.enc && (rec.enc.sideA?.vesselIds?.includes(id) || rec.enc.sideB?.vesselIds?.includes(id))) return true;
    }
    return false;
  }

  _feed(st, now) {
    const rd = st.rep.roundList[st.nextRound - 1];
    st.nextRound++;
    if (!rd) return;
    const v = st.venc;
    // stan „logiczny” prezentacji = po rundzie (rejestr dokłada obrażenia trafień jeszcze nie pokazanych — HP spada w chwili trafienia)
    for (const [id, a] of Object.entries(rd.after)) {
      const s = v.vesselStates.get(id);
      if (s) { s.hp = a.hp; s.shieldHP = a.shield; }
    }
    v.currentRound = rd.round;
    v.timeline.push({ round: rd.round, year: v.startYear, distanceAU: 0, events: rd.events.map((e) => ({ attacker: e.attacker, target: e.target,
      weapon: e.weapon, hit: e.hit, damage: e.dmg, blockedByShield: e.blockedByShield, category: e.category })) });
    if (st.nextRound > st.rep.rounds) v.logicEnded = true;
    st.lastFeedAt = now;
    this.stats.roundsFed++;
    if (!rd.events.length) return;
    this.r?._cvWpnRoundFx?.({ encounterId: st.encId, systemId: st.systemId, round: rd.round, seed: st.rep.seed, events: rd.events, orbital: true });
  }

  _end(st, why) {
    // zaległe zamiany we wrak (przerwanie, zniszczenie niepokazane) — od razu, bez drugiej eksplozji
    for (const [id, vessel] of st.deferred) {
      st.deferred.delete(id);
      this.r?._onVesselWreckedView?.(id, vessel);
    }
    for (const id of st.holdHidden) this._releaseHidden(st, id);
    this.replays.delete(st.battleId);
    this._byEnc.delete(st.encId);
    (this._done ??= new Set()).add(st.battleId);
    st.venc.isActive = false;
    this._reapplyIntel(st);   // po powtórce — widoczność wg wywiadu
    if (why === 'aborted') this.stats.aborted++; else this.stats.ended++;
    // ARC CV-8b (§3.1-6) — wynik zostaje widoczny po powtórce: wiersz WYNIKU na pasku walki (stan końcowy stron + słowo wyniku zamiast
    // „R n”) przez `ORB_RESULT_LINGER_MS` czasu prezentacji. Przerwana powtórka (zmiana układu, galaktyka) — bez wiersza (bitwa poza widokiem).
    if (why !== 'aborted') {
      (this._recent ??= []).push({ venc: st.venc, outcome: st.outcome, endedAt: this.r?._presClock?.nowMs ?? 0 });
      if (this._recent.length > 4) this._recent.shift();
    }
    EventBus.emit('combatfx:orbitalReplayEnd', { battleId: st.battleId, encounterId: st.encId, reason: why });
  }

  /**
   * ARC CV-8b (§3.1-6) — skończone powtórki do wiersza WYNIKU na pasku walki: `{ venc, outcome, endedAt }` z ostatnich
   * `ORB_RESULT_LINGER_MS` ms czasu prezentacji (starsze wypadają; pauza = pauza — w pauzie wiersz stoi), tylko w oglądanym układzie.
   */
  endedEncounters() {
    if (!this._recent?.length) return [];
    const now = this.r?._presClock?.nowMs ?? 0;
    const linger = Math.max(0, Number(this.tuning.ORB_RESULT_LINGER_MS ?? 10000) || 0);
    this._recent = this._recent.filter((x) => now - x.endedAt <= linger);
    const view = window.KOSMOS?.activeSystemId ?? null;
    return this._recent.filter((x) => x.venc?.location?.systemId === view);
  }

  _reapplyIntel(st) {
    const vm = window.KOSMOS?.vesselManager;
    for (const id of st.venc.sideA.vesselIds) {
      const e = this.r?._vessels?.get?.(id), v = vm?.getVessel?.(id);
      if (e && v) this.r?._applyVesselIntelVisibility?.(v, e);
    }
  }

  _releaseHidden(st, id) {
    if (!st.holdHidden.delete(id)) return;
    const v = window.KOSMOS?.vesselManager?.getVessel?.(id);
    if (v && v.systemId === window.KOSMOS?.activeSystemId && v.position?.state !== 'docked') this.r?._addVesselSprite?.(v);
  }

  // ── Odczyty dla renderera, paska walki, reżysera ────────────────────────────────────────────────────────────────

  encounters() { return this._byEnc.size ? [...this._byEnc.values()].map((s) => s.venc) : []; }
  byId(encId) { return this._byEnc.get(encId)?.venc ?? null; }
  encOf(vesselId) {
    for (const st of this._byEnc.values()) if (st.venc.vesselStates.has(String(vesselId))) return st.venc;
    return null;
  }
  isOrbitalEncounter(encId) { return this._byEnc.has(encId); }

  /** `vessel:wrecked` — zamiana we wrak czeka na zniszczenie w powtórce (okręt z zaplanowanym zniszczeniem, jeszcze niepokazanym). */
  deferWreck(vesselId, vessel) {
    for (const st of this.replays.values()) {
      if (st.rep.kills[vesselId] == null || st.shown.has(vesselId)) continue;
      st.deferred.set(vesselId, vessel);
      this.stats.deferred++;
      return true;
    }
    return false;
  }

  /** Napastnik powtórki w toku (atak na kolonię gracza = starcie z graczem — ujawniony na czas powtórki, reguła P2a CP17). */
  revealed(vesselId) {
    if (!this.replays.size) return false;
    for (const st of this.replays.values()) if (st.venc.sideA.vesselIds.includes(String(vesselId))) return true;
    return false;
  }

  /** Koniec strzału powtórki: sprite okrętu (rysowany — scena, choreografia) albo punkt na powierzchni (emiter, pula obrony, hangar). */
  endpoint(id) {
    const e = this.r?._vessels?.get?.(id);
    if (e?.sprite?.visible && Number.isFinite(e.sprite.position.x)) { const p = e.sprite.position; return { x: p.x, y: p.y, z: p.z }; }
    const a = this.anchorPos(id);
    return a ? { x: a.x, y: a.y, z: a.z } : null;
  }

  /** Zamiana we wrak wstrzymana przez powtórkę (okręt z zaplanowanym, jeszcze niepokazanym zniszczeniem — także zanim przyszedł wrak). */
  wreckDeferred(vesselId) {
    if (!this.replays.size) return false;
    for (const st of this.replays.values()) if (st.rep.kills[vesselId] != null && !st.shown.has(vesselId)) return true;
    return false;
  }

  /**
   * ARC CV-8b (#713) — bitwa powtórki w toku, w której okręt ma zaplanowane, jeszcze niepokazane zniszczenie (`battleId`) albo null.
   * `GameScene` wstrzymuje do końca tej powtórki wpisy Dziennika o jego stracie („Utracono kontakt” wraku) — wynik nie wyprzedza walki.
   */
  heldBattleOf(vesselId) {
    if (!this.replays.size || vesselId == null) return null;
    const id = String(vesselId);
    for (const st of this.replays.values()) if (st.rep.kills[id] != null && !st.shown.has(id)) return st.battleId;
    return null;
  }

  /** Okręt z hangaru z zaplanowanym zniszczeniem — sprite wraku dopiero po zniszczeniu w powtórce (bez udawanego statku). */
  holdsHidden(vesselId) {
    for (const st of this.replays.values()) if (st.holdHidden.has(vesselId)) return true;
    return false;
  }

  /**
   * Z `_cvWpnPresentKill` (chwila zniszczenia w rejestrze): okręt z HANGARU — wybuch na jego emiterze, sprite wraku po nim
   * (zwraca true — dalszy pokaz pomijany); inny — false (pokaz rejestru jak w wolnej przestrzeni, potem `afterKill`).
   */
  presentKill(id) {
    for (const st of this.replays.values()) {
      if (!st.hangar.has(id) || st.rep.kills[id] == null || st.shown.has(id)) continue;
      st.shown.add(id);
      const p = this.anchorPos(st.rep.emitterOf[id] ?? null);
      if (p && GAME_CONFIG.FEATURES?.fcCombatFx) {
        const size = L_FRIGATE * 0.8;   // wybuch hangaru na powierzchni — mniejszy niż okręt w przestrzeni (kula w skali kadłuba, CV-3a3)
        this.r?._spawnExplosion?.({ x: p.x, y: p.y, z: p.z }, size, null);
      }
      this.stats.killsShown++; this.stats.hangarKills++;
      st.deferred.delete(id);
      this._releaseHidden(st, id);   // sprite wraku powstaje od razu jako wrak (`_addVesselSprite` — wrak już nie jest wstrzymany)
      return true;
    }
    return false;
  }

  /** Po pokazie zniszczenia okrętu w przestrzeni — zaległa zamiana we wrak (bez drugiej eksplozji: rejestr zna to zniszczenie). */
  afterKill(id) {
    for (const st of this.replays.values()) {
      if (st.rep.kills[id] == null || st.shown.has(id)) continue;
      st.shown.add(id);
      this.stats.killsShown++;
      const v = st.deferred.get(id);
      st.deferred.delete(id);
      if (v) this.r?._onVesselWreckedView?.(id, v);
      return;
    }
  }

  // ── Geometria: ciało, kierunek bitwy, emitery ───────────────────────────────────────────────────────────────────

  _body(st) {
    // raz na klatkę (końce strzałów silnika FX pytają o emitery co klatkę — `getBodyWorldInfo` liczy macierze świata)
    const f = this.r?._frameNo;
    if (st._bodyFrame === f && f != null) return st._bodyCache;
    const b = st.planetId ? this.r?.getBodyWorldInfo?.(st.planetId) : null;
    st._bodyCache = b && Number.isFinite(b.x) && Number.isFinite(b.z) ? b : null;
    st._bodyFrame = f;
    return st._bodyCache;
  }

  _bearing(st, body) {
    if (st.bearing == null) st.bearing = orbitalBearing({ bodyX: body.x, bodyZ: body.z, seed: st.rep.seed, tuning: this.tuning });
    return st.bearing;
  }

  _emitterDirs(st, body) {
    if (!st.emitterDirs) {
      const list = st.rep.emitters;
      const dirs = orbitalEmitterDirs({ n: list.length, bearing: this._bearing(st, body), seed: st.rep.seed, tuning: this.tuning });
      st.emitterDirs = new Map(list.map((e, i) => [e.id, dirs[i]]));
    }
    return st.emitterDirs;
  }

  /**
   * Punkt świata końca strzału bez sprite'a: emiter (`…:eN`), pula obrony (`…:def` — biegun ciała ku bitwie), okręt z hangaru
   * (jego emiter). Null — nie dotyczy (statek ze sprite'em, inna powtórka).
   */
  anchorPos(id) {
    if (id == null || !this.replays.size) return null;
    const sid = String(id);
    for (const st of this.replays.values()) {
      let eid = null;
      if (sid.startsWith(st.encId + ':')) eid = sid;
      else if (st.hangar.has(sid)) eid = st.rep.emitterOf[sid] ?? null;
      else continue;
      const body = this._body(st);
      if (!body) return null;
      let dir;
      if (eid === st.rep.poolId || eid == null) { const a = this._bearing(st, body); dir = { x: Math.cos(a), y: 0.12, z: Math.sin(a) }; }
      else dir = this._emitterDirs(st, body).get(eid);
      if (!dir) return null;
      const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
      const R = body.r * 1.01;
      const out = this._anchorOut ?? (this._anchorOut = { x: 0, y: 0, z: 0 });
      out.x = body.x + dir.x / l * R; out.y = (Number.isFinite(body.y) ? body.y : 0) + dir.y / l * R; out.z = body.z + dir.z / l * R;
      return out;
    }
    return null;
  }

  /**
   * Cel efektów strzału w pulę obrony (`…:def`): emiter z ziarna wpisu (emitery wież / siatki / żetonu; brak — biegun ciała).
   * Inne cele — null (efekt idzie do celu z rejestru).
   */
  fxTarget(x) {
    if (!this.replays.size || x?.target == null) return null;
    const st = this._byEnc.get(x.encounterId);
    if (!st || x.target !== st.rep.poolId) return null;
    const list = st.rep.emitters.filter((e) => e.kind !== 'hangar');
    if (!list.length) return null;
    return list[(x.seed >>> 0) % list.length].id;
  }

  // ── Scena planety ────────────────────────────────────────────────────────────────────────────────────────────────

  /** Klastry sceny bitew orbitalnych w widoku (dla `_stageClusters`): skorupa = ciało, rozwiązanie własne (`solveStage`). */
  stageClusters() {
    if (!this.replays.size) return [];
    const out = [];
    for (const st of this.replays.values()) {
      if (st.nextRound === 1 && this._busyInDeepSpace(st)) continue;   // Finding 635 — scena DSCS tych statków jeszcze trwa
      out.push({ id: st.encId, encounterIds: [st.encId], ids: st.stageIds.slice().sort(), pinned: true, pinnedIds: new Set(),
        shellBodyId: st.planetId, encs: [st.venc], orbital: st });
    }
    return out;
  }

  /**
   * Rozwiązanie sceny klastra orbitalnego (zastępuje `solveStage` dla tego klastra): formacja wokół RYSOWANEGO środka ciała —
   * napastnicy na łuku, obrońcy na skorupie (D-CV-4), kierunek bitwy ku stronie dziennej. Pozycje świata (początek = ciało teraz).
   */
  solveStage(cl, pts, body, L, spread = 1) {
    const st = cl.orbital;
    const vm = window.KOSMOS?.vesselManager;
    const isA = (id) => st.venc.sideA.vesselIds.includes(id);
    const A = pts.filter((q) => isA(q.id)).map((q) => q.id).sort();
    const B = pts.filter((q) => !isA(q.id)).map((q) => q.id).sort();
    const bearing = this._bearing(st, body);
    const f = orbitalFormation({ bodyR: body.r, L, spread, nA: A.length, nB: B.length, bearing, seed: st.rep.seed, tuning: this.tuning });
    const y0 = Number.isFinite(body.y) ? body.y : 0;
    const pos = new Map();
    A.forEach((id, i) => { const o = f.A[i]; pos.set(id, { x: body.x + o.x, y: y0 + o.y, z: body.z + o.z }); });
    B.forEach((id, i) => { const o = f.B[i]; pos.set(id, { x: body.x + o.x, y: y0 + o.y, z: body.z + o.z }); });
    void vm;
    const u = { x: Math.cos(bearing), z: Math.sin(bearing), source: 'orbital' };
    return { pos, offsets: null, fallback: false, misbanded: 0, misbandedBefore: 0, passes: 0, rIn: f.rA, scale: null, law: null, spread,
      shell: { shift: { x: 0, z: 0 }, u, bodyR: body.r, excluded: 0, pinned: 0 }, orbital: { rA: f.rA, rB: f.rB, bearing } };
  }

  // ── Odczyt konsoli ───────────────────────────────────────────────────────────────────────────────────────────────

  /** `KOSMOS.debug.orbitalInfo()` — powtórki w toku i liczniki. */
  info() {
    const K = window.KOSMOS, r = this.r;
    const now = r?._presClock?.nowMs ?? 0;
    const led = r?._cvLedger ?? null;
    const list = [...this.replays.values()].map((st) => {
      const rep = st.rep;
      const shooters = { A: 0, B: 0 };
      for (const [, m] of Object.entries(rep.members)) if (m.weapons.length && m.kind !== 'pool') shooters[m.side]++;
      const killsPlanned = Object.keys(rep.kills).length;
      const ledStats = led?.encounterStats?.(st.encId) ?? null;
      return {
        bitwa: st.battleId, starcie: st.encId, cialo: st.planetId, uklad: st.systemId,
        wWidoku: orbitalReplayInView({ battleSystemId: st.systemId, activeSystemId: K?.activeSystemId, galaxy: !!(r?._galaxyActive || r?._galaxyFlight) }),
        turyLogiki: rep.turns, rundy: rep.rounds, runda: st.venc.currentRound, pat: rep.stalemate, skazani: rep.doomed,
        strzelcy: { A: shooters.A, B: shooters.B + rep.emitters.filter((e) => e.weapons.length).length },
        emitery: rep.emitters.map((e) => `${e.kind}:${e.id.split(':').pop()}`), hangar: [...st.hangar],
        naScenie: st.stageIds.length, zniszczeniaPlan: killsPlanned, zniszczeniaPokazane: st.shown.size,
        rejestr: ledStats ? { rounds: ledStats.rounds, events: ledStats.events, kills: ledStats.kills, killsShown: ledStats.killsShown, violations: ledStats.violations } : null,
        czasMs: Math.round(now - st.startedAt), nadwyzka: rep.stats.excess, odrzucone: rep.stats.dropped,
      };
    });
    return { flaga: !!GAME_CONFIG.FEATURES?.cvOrbital, gotowa: this.flag, powtorki: list, liczniki: { ...this.stats } };
  }
}
