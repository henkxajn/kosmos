// CvDirector — klej KAMERY REŻYSERA z rendererem (ARC COMBAT VISUALS, krok CV-7; plan §2.7, D-CV-23, D-CV-24 / §3.1-3; flaga
// `cvDirector`). Logika (harmonogram, spowolnienie, kadr, strażnicy, wstrząs, 9:16) — `combat/CameraDirectorLogic.js` (czysta,
// keeper); tutaj: odczyt sceny bitwy z renderera, zapis stanu kamery kontrolera, przejęcie kamery przez gracza, chip paska walki,
// mnożnik tempa obu zegarów prezentacji, wstrząs kamery, przewodnik 9:16 (DOM) i tryb nagrywania (DOM, `ui/CaptureMode.js`).
//
// Zasady (D-CV-23 — kamera zawsze należy do gracza):
//   • chip domyślnie WYŁĄCZONY (`uiPrefs.cvDirector`); włączony reżyser prowadzi bitwę w oglądanym układzie, kiedy trwa (także
//     następną — zamiast auto-fokusu), a po kadrze wyniku oddaje kamerę;
//   • KAŻDE wejście kamery gracza (przeciąganie, kółko, klawisze kamery, fokus z outlinera, „Obserwuj”, klik w ikonę / znak
//     bitwy) zmienia stan kontrolera, który reżyser zapisał w poprzedniej klatce — reżyser to widzi w następnej klatce i od razu
//     przestaje pisać (chip „Reżyser (wstrzymany)”); klik chipa wznawia; koniec bitwy — chip wraca do „Reżyser” (gotowy);
//   • pauza = pauza: harmonogram, kamera, spowolnienie i wstrząs na zegarze prezentacji.
// ⚠ Reżyser pisze stan kontrolera WPROST (cel = cel bieżący, dystans = dystans bieżący, kąty bez animacji) — lerpy kontrolera
//   nic już nie dodają, więc porównanie z ostatnim zapisem jest dokładne (wejście gracza = każda różnica).
// Kod warstwy wizualnej nigdy nie woła `Math.random` (reguła CV-0b).

import * as THREE from 'three';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { COSMIC } from '../config/LayoutConfig.js';
import { getMapInsets } from '../ui/MapInsets.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { vesselTargetSize, vesselSizeClass, VESSEL_TARGET_SIZE } from './VesselModelResolver.js';
import { watchSafeRect, COMBAT_WATCH } from './CombatWatchLogic.js';
import { lengthPx } from './combat/SemanticZoomLogic.js';
import { DirectorSchedule, PresentationWarp, ShakeState, dirTuning, frameShot, guardCamera, approachCamera, blendCamera,
  cameraTaken, shotSubjects, heroWorthy, shakeTrauma, promoRect916, promoSafe916, promoGuideStyle, chipNext, SHOT, pickBy,
  nextShotType, cameraClearance, insetRect, shotCut } from './combat/CameraDirectorLogic.js';
import { enterCapture, exitCapture } from '../ui/CaptureMode.js';
import { ReelRecorder } from './ReelRecorder.js';   // zmiana 2 po kontroli właściciela — nagrywarka rolek (F10)

let _Vs = null;   // wektor roboczy — leniwie (moduł importuje się pod node: atrapa three bez konstruktorów)
const vec = () => (_Vs ??= new THREE.Vector3());
const PROMO_ID = 'cv916-guide';

/** Stan kamery kontrolera (do porównania z ostatnim zapisem reżysera). */
function camState(cc) {
  return { theta: cc._theta, phi: cc._phi, dist: cc._targetDist,
    target: { x: cc._goalTarget.x, y: cc._goalTarget.y, z: cc._goalTarget.z },
    animating: cc._goalTheta != null || cc._goalPhi != null };
}

export class CvDirector {
  constructor(renderer) {
    this.r = renderer;
    this.warp = new PresentationWarp();
    this.shake = new ShakeState();
    this.schedule = null;
    this.battle = null;           // { key, encIds:Set, ids:string[], seed, startedAt }
    this.paused = false;          // gracz przejął kamerę w tej bitwie
    this.pauseReason = null;
    this.want = null;             // id bitwy z chipa (wiersz paska) — pierwszeństwo przy wyborze
    this.promo916 = false;
    this.capture = false;
    this._captureSnap = null;
    this._cam = null;             // wyjście reżysera (stan kamery) z ostatniej klatki
    this._live = null;            // wygładzony cel ujęcia
    this._from = null;            // stan na starcie przejścia
    this._fromAt = 0;             // chwila startu przejścia [ms prezentacji]
    this._shotIdx = -1;
    this._shotEase = 0;
    this._lastWrite = null;
    this._lastReal = null;
    this._heroSlowFor = -1;       // indeks ujęcia bohatera, dla którego ruszyło spowolnienie
    this._lastCutAt = -Infinity;  // chwila ostatniego cięcia [ms prezentacji] — `DIR_CUT_GAP_MS`
    this._resultUntil = null;
    this._vel = new Map();        // statek → próbka położenia rysowanego (prędkość)
    this._guideKey = null;
    this.stats = { battles: 0, shots: 0, heroes: 0, heroSlows: 0, takeBacks: 0, cuts: 0, guards: 0, minClearance: Infinity };
    // Nagrywarka rolek (F10, `KOSMOS.debug.cvRecord`) — płótno 3D, przy przewodniku 9:16 wycinek 1080 × 1920; pętla renderu woła
    // `reel.onFrame()` tuż po `render()`.
    this.reel = new ReelRecorder(renderer, { promo: () => this.flag && this.promo916 });
    this.lastTakeBack = null;
  }

  // ── Stan chipa ─────────────────────────────────────────────────────────────────────────────────────────────────────

  get flag() { return !!GAME_CONFIG.FEATURES?.cvDirector; }
  get armed() { return this.flag && window.KOSMOS?.uiPrefs?.cvDirector === true; }
  /** Reżyser pisze kamerę w tej klatce (włączony, z bitwą, bez przejęcia). */
  get active() { return this.armed && !this.paused && !!this.battle; }
  /** Chip: 'off' | 'armed' | 'paused'. */
  get chipState() { return !this.armed ? 'off' : this.paused ? 'paused' : 'armed'; }
  /** Auto-fokus nowego starcia ustępuje reżyserowi (włączony, bez przejęcia). */
  wantsBattles() { return this.armed && !this.paused; }

  setArmed(on, battleId = null) {
    const K = window.KOSMOS;
    if (!K) return this.chipState;
    K.uiPrefs = K.uiPrefs ?? {};
    K.uiPrefs.cvDirector = !!on;
    if (on) { this.paused = false; this.pauseReason = null; if (battleId != null) this.want = String(battleId); }
    else this._stopBattle('off');
    K.hudLayer?.wake?.();
    return this.chipState;
  }

  /** Klik chipa na wierszu bitwy `battleId`: wyłączony → włączony (ta bitwa), włączony → wyłączony, wstrzymany → wznowiony. */
  chipClick(battleId = null) {
    const id = battleId != null ? String(battleId) : null;
    const st = this.chipState;
    const other = id != null && this.battle && !this.battle.encIds.has(id);
    if (st === 'armed' && other) { this._stopBattle('switch'); this.want = id; return this.chipState; }   // inna bitwa — przełącz
    if (chipNext(st) === 'off') { this.setArmed(false); return this.chipState; }
    const wasPaused = st === 'paused';
    this.setArmed(true, id);
    if (other) { this._stopBattle('switch'); this.want = id; }
    else if (wasPaused && this.battle) this._resumeFromHere();
    return this.chipState;
  }

  /** Chip dla wiersza paska: { state, mine } — `mine`: reżyser prowadzi właśnie tę bitwę. */
  chipFor(rowId) {
    const mine = !!this.battle && this.battle.encIds.has(String(rowId));
    return { state: this.chipState, mine };
  }

  /** Gracz przejął kamerę (wejście) — reżyser przestaje pisać od tej klatki. */
  takeBack(reason = 'input') {
    if (!this.armed || this.paused) return false;
    this.paused = true;
    this.pauseReason = reason;
    this.stats.takeBacks++;
    this.lastTakeBack = { reason, presMs: Math.round(this.r._presClock?.nowMs ?? 0), frame: this.r._frameNo };
    this._lastWrite = null;
    this.warp.endHero();
    window.KOSMOS?.uiManager && (window.KOSMOS.uiManager._dirty = true);
    return true;
  }

  // ── Zegary: spowolnienie bohatera ───────────────────────────────────────────────────────────────────────────────────

  /** Raz na klatkę, PRZED tikami zegarów prezentacji: mnożnik tempa tej klatki (`r._presRate`). */
  tickWarp(realNowMs) {
    const r = this.r;
    const ts = window.KOSMOS?.timeSystem;
    const paused = !!ts?.isPaused || ts?.multiplier === 0;
    const raw = this._lastReal == null ? 0 : realNowMs - this._lastReal;
    this._lastReal = realNowMs;
    const dt = raw > 0 ? Math.min(raw, 100) : 0;
    const T = dirTuning(r.cvTuning);
    if (!this.flag) { this.warp.reset(); r._presRate = 1; return 1; }
    const R = ts?.combatRoundMs?.() ?? 1150;
    const led = r._cvLedger;
    const encIds = this.battle?.encIds ?? null;
    // Koniec LOGIKI (§3.1-3: „po końcu logicznym reszta w tempie 1,25×”) — z DSCS, nie ze sceny: scena zostaje po końcu logiki, dopóki
    // rejestr ma coś do pokazania (Finding 711).
    // ARC CV-8a — także starcie wirtualne powtórki bitwy orbitalnej (koniec „logiki” = ostatnia runda powtórki w rejestrze)
    const encOf = (id) => r._cvEncById?.(id) ?? window.KOSMOS?.deepSpaceCombatSystem?._activeEncounters?.get?.(id) ?? null;
    const activeHere = encIds ? [...encIds].some((id) => { const e = encOf(id); return e?.isActive === true && e.logicEnded !== true; }) : false;
    const anyActive = (r._stageFrame?.clusters ?? 0) > 0;
    const pending = led ? led.hasPending(encIds) : false;
    const ended = !!encIds && !activeHere;
    const done = (ended && !pending) || (!encIds && !anyActive && !(led?.hasPending?.() ?? false));
    r._presRate = this.warp.step(dt, { paused, R, ended, done }, T);
    return r._presRate;
  }

  // ── Kamera ──────────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Raz na klatkę, PO scenie bitwy (pozycje rysowane tej klatki), PRZED `update()` kontrolera. */
  tickCamera() {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    try { this._tickCamera(); } finally {
      if (this.battle && typeof performance !== 'undefined') { const ms = performance.now() - t0; this.stats.camMs = (this.stats.camMs ?? ms) * 0.95 + ms * 0.05; }
    }
  }

  _tickCamera() {
    const r = this.r, cc = r._cameraController;
    this._syncGuide();
    if (!cc) return;
    if (!this.armed) { if (this.battle) this._stopBattle('off'); return; }
    if (r._galaxyActive || r._galaxyFlight || r._observatoryPreviewActive || r._cinematicDriver) {
      if (this.battle && !this.paused) this.takeBack('mode');
      return;
    }
    // Przejęcie: stan kontrolera ≠ ostatni zapis reżysera.
    if (this._lastWrite && !this.paused && cameraTaken(this._lastWrite, camState(cc))) this.takeBack('input');
    if (cc._isDragging && cc._hasMoved && !this.paused && this.battle) this.takeBack('drag');

    const T = dirTuning(r.cvTuning);
    const now = r._presClock?.nowMs ?? 0;
    const info = this._pickCluster();
    if (!this.battle) {
      if (!info) return;
      this._startBattle(info, now);
    } else if (info) {
      for (const id of info.encounterIds ?? []) this.battle.encIds.add(String(id));
      this.battle.ids = [...new Set([...this.battle.ids, ...(info.ids ?? [])])];
    }
    const b = this.battle;
    const led = r._cvLedger;
    const active = !!info;
    const done = !active && !(led?.hasPending?.(b.encIds) ?? false);
    if (done && this.paused) { this._stopBattle('ended'); return; }   // koniec bitwy — chip wraca do „gotowy”
    if (this.paused) return;

    const scene = this._scene(b, info);
    const subj = shotSubjects(scene.ships, scene.pairs);
    const killsRaw = led ? led.upcomingKills(b.encIds) : [];
    const kills = this._killsCtx(killsRaw, scene);
    const R = window.KOSMOS?.timeSystem?.combatRoundMs?.() ?? 1150;
    const available = { follow: !!subj.flagship, duel: !!subj.pair, flyby: subj.frigates.length > 0 };
    this._lastAvail = available;
    const shot = this.schedule.step(now, { available, kills, heroAllowed: this.warp.canStartHero(R, T), done }, T);
    if (shot.type === SHOT.RESULT) {
      if (this._resultUntil == null) this._resultUntil = now + T.DIR_RESULT_HOLD_MS;
      if (now >= this._resultUntil) { this._stopBattle('result'); return; }
    }
    const view = this._view(T);
    if (shot.index !== this._shotIdx) this._beginShot(shot, scene, subj, view, T, now);
    // Spowolnienie bohatera — DIR_HERO_SLOW_LEAD_MS przed trafieniem zabijającym (rejestr zna chwilę z wyprzedzeniem).
    if (shot.type === SHOT.HERO && this._heroSlowFor !== shot.index && now >= shot.killAt - T.DIR_HERO_SLOW_LEAD_MS) {
      this._heroSlowFor = shot.index;
      if (this.warp.startHero(R, T)) this.stats.heroSlows++;
    }
    if (shot.type !== SHOT.HERO && this.warp.phase === 'slow') this.warp.endHero();

    let goal = frameShot(shot, scene, view, now, T);
    if (!goal) goal = frameShot({ ...shot, type: SHOT.WIDE }, scene, view, now, T);
    if (!goal) return;
    const obs = scene.obstacles;
    goal = guardCamera(goal, obs, T);
    const dt = r._presClock?.lastStepMs ?? 0;
    this._live = this._live ? approachCamera(this._live, goal, dt, T) : { ...goal, target: { ...goal.target } };
    let out = this._from ? blendCamera(this._from, this._live, this._shotEase > 0 ? (now - this._fromAt) / this._shotEase : 1) : this._live;
    if (this._from && now - this._fromAt >= this._shotEase) this._from = null;
    out = guardCamera(out, obs, T);
    if (out.guarded?.length) this.stats.guards++;
    this.stats.minClearance = Math.min(this.stats.minClearance, cameraClearance(out, obs, T));
    this._write(cc, out);
  }

  _write(cc, out) {
    if (!out || !Number.isFinite(out.theta) || !Number.isFinite(out.phi) || !Number.isFinite(out.dist) || !Number.isFinite(out.target?.x)) return;
    cc._theta = out.theta; cc._phi = out.phi; cc._goalTheta = null; cc._goalPhi = null;
    cc._targetDist = out.dist; cc._dist = out.dist;
    cc._goalTarget.set(out.target.x, out.target.y, out.target.z);
    cc._target.set(out.target.x, out.target.y, out.target.z);
    this._cam = { target: { ...out.target }, theta: out.theta, phi: out.phi, dist: out.dist };
    this._lastWrite = camState(cc);
  }

  _readCam(cc) {
    return { target: { x: cc._target.x, y: cc._target.y, z: cc._target.z }, theta: cc._theta, phi: cc._phi, dist: cc._dist };
  }

  _startBattle(info, now) {
    const r = this.r, cc = r._cameraController;
    const encIds = new Set((info.encounterIds ?? []).map(String));
    const primary = [...encIds].sort()[0];
    const enc0 = r._cvEncById?.(primary) ?? window.KOSMOS?.deepSpaceCombatSystem?._activeEncounters?.get?.(primary) ?? null;   // CV-8a — także powtórka
    const seed = Number(enc0?.seedBase) || 0;
    this.battle = { key: primary, encIds, ids: [...(info.ids ?? [])], seed, startedAt: now };
    this.schedule = new DirectorSchedule({ seed: seed ^ 0x5eed });
    this._shotIdx = -1; this._from = null; this._live = null; this._resultUntil = null; this._heroSlowFor = -1;
    this.want = null;
    this.stats.battles++;
    // Reżyser przejmuje kamerę: „Obserwuj” i auto-fokus kończą się, fokus ciała / statku / stacji zdjęty, przesunięcie ekranowe
    // kadru walki gaśnie samo (`_syncCombatViewOffset` bez „Obserwuj” i auto-fokusu).
    if (r._watch) r._endWatch?.();
    r._autoFocus = null;
    r._focusEntityId = null; r._focusVesselId = null; r._focusStationId = null; r._focusEncounterId = null;
    // Podłoga zoomu na czas bitwy jak przy „Obserwuj” (≤ 0,05 j.): reżyser filmuje bliżej niż domyślne 0,3 j. — bez tego pierwsze kółko
    // gracza po przejęciu skakałoby kamerą na podłogę. Po bitwie — wartość sprzed (gdy nikt jej nie zmienił).
    if (cc) { this._minDistBefore = cc._minDist; cc.setMinDist(Math.min(cc._minDist, COMBAT_WATCH.ZOOM_MIN_DIST)); this._minDistSet = cc._minDist; }
    this._cam = cc ? this._readCam(cc) : null;
    this._lastWrite = null;
  }

  _resumeFromHere() {
    const cc = this.r._cameraController;
    if (!cc) return;
    this._cam = this._readCam(cc);
    this._from = { ...this._cam, target: { ...this._cam.target } };
    this._shotEase = dirTuning(this.r.cvTuning).DIR_EASE_MS;
    this._fromAt = this.r._presClock?.nowMs ?? 0;   // przejście od bieżącego kadru gracza do ujęcia (harmonogram nietknięty)
    this._live = null;
    this._lastWrite = null;
  }

  _stopBattle(reason) {
    const cc = this.r._cameraController;
    if (cc && this._minDistSet != null && cc._minDist === this._minDistSet && this._minDistBefore != null) cc.setMinDist(this._minDistBefore);
    this._minDistSet = null; this._minDistBefore = null;
    this.battle = null; this.schedule = null; this._lastWrite = null; this._from = null; this._live = null; this._shotIdx = -1;
    this._resultUntil = null;
    if (reason === 'ended' || reason === 'result') { this.paused = false; this.pauseReason = null; }
    if (reason === 'off') { this.paused = false; this.pauseReason = null; this.want = null; }
    this.warp.endHero();
    this.lastStop = reason;
  }

  _beginShot(shot, scene, subj, view, T, now) {
    this._shotIdx = shot.index;
    this.stats.shots++;
    const cur = this._cam ?? this._readCam(this.r._cameraController);
    shot.theta0 = cur.theta;
    if (shot.type === SHOT.FOLLOW) {
      shot.subjectId = subj.flagship?.id ?? null;
      shot.targetId = this._targetOf(shot.subjectId, scene, now);
    } else if (shot.type === SHOT.DUEL) {
      shot.subjectId = subj.pair?.attacker ?? null; shot.targetId = subj.pair?.target ?? null;
    } else if (shot.type === SHOT.FLYBY) {
      shot.subjectId = pickBy(subj.frigates, shot.pick)?.id ?? null;
    } else if (shot.type === SHOT.HERO) {
      this.stats.heroes++;
    }
    // Cięcie: przelot; bohater — gdy podmiot poza kadrem; najwyżej raz na DIR_CUT_GAP_MS (`shotCut`). Reszta — przejście wygładzone.
    const inView = shot.type === SHOT.HERO ? this._inView(scene.byId.get(shot.subjectId)) : true;
    const cut = shotCut({ type: shot.type, subjectInView: inView, sinceCutMs: now - this._lastCutAt }, T);
    shot.cut = cut;
    if (cut) { this._from = null; this._live = null; this._shotEase = 0; this.stats.cuts++; this._lastCutAt = now; }
    else {
      this._from = { ...cur, target: { ...cur.target } };
      this._fromAt = now;
      this._live = null;
      this._shotEase = shot.type === SHOT.HERO ? T.DIR_HERO_EASE_MS : T.DIR_EASE_MS;
    }
  }

  /** Cel strzelca: ostatni cel z rejestru (żywy), inaczej najbliższy żywy wróg. */
  _targetOf(id, scene, now) {
    if (id == null) return null;
    const s = scene.byId.get(id);
    const t = this.r._cvLedger?.lastTargetOf?.(id, now) ?? null;
    if (t != null && scene.byId.get(t)?.alive) return t;
    let best = null, bd = Infinity;
    for (const o of scene.ships) {
      if (!o.alive || o.side === s?.side) continue;
      const d = Math.hypot(o.x - s.x, o.y - s.y, o.z - s.z);
      if (d < bd) { bd = d; best = o.id; }
    }
    return best;
  }

  /** Klaster sceny do prowadzenia: bieżąca bitwa (któreś z jej starć), inaczej wybrany chipem, inaczej pierwszy (id rosnąco). */
  _pickCluster() {
    const list = this.r._stageFrame?.list ?? [];
    if (!list.length) return null;
    if (this.battle) return list.find((c) => (c.encounterIds ?? []).some((id) => this.battle.encIds.has(String(id)))) ?? null;
    if (this.want != null) {
      const w = list.find((c) => (c.encounterIds ?? []).some((id) => String(id) === this.want));
      if (w) return w;
    }
    return [...list].sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1))[0] ?? null;
  }

  /** Scena ujęć: okręty bitwy (pozycje rysowane, klasa, długość, kurs, prędkość), pary z rejestru, przeszkody strażników. */
  _scene(b, info) {
    const r = this.r, vm = window.KOSMOS?.vesselManager;
    const now = r._presClock?.nowMs ?? 0;
    const ships = [], byId = new Map();
    const encs = info?.encs ?? [];
    const playerIn = encs.some((e) => e?.sideA?.ownerEmpireId === 'player' || e?.sideB?.ownerEmpireId === 'player');
    const sideA = new Set();
    for (const e of encs) for (const id of [...(e.sideA?.vesselIds ?? []), ...(e.sideA?.joinedVesselIds ?? [])]) sideA.add(String(id));
    for (const id of b.ids) {
      const e = r._vessels?.get?.(id), v = vm?.getVessel?.(id);
      if (!e?.sprite?.visible || !v) continue;
      const p = e.sprite.position;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
      // Żywy = żywy w PREZENTACJI: wrak logiki z zabójczym trafieniem jeszcze w drodze (rejestr: 'pending') nadal leci i strzela.
      const alive = !(e.cvKilled || ((r._cvVisWreck ? r._cvVisWreck(v) : v.isWreck) && r._cvLedger?.killState?.(id) !== 'pending'));   // CV-8a — wrak powtórki
      const bow = alive ? r.getVesselBowWorld?.(id) : null;
      const vel = this._velocity(id, p, now);
      const own = playerIn ? !isEnemyVessel(v) : sideA.has(String(id));
      const s = { id, x: p.x, y: p.y, z: p.z, len: vesselTargetSize(v) || VESSEL_TARGET_SIZE.frigate, alive,
        side: own ? 'own' : 'enemy', cls: vesselSizeClass(v), heading: bow ? { x: bow.x, z: bow.z } : null,
        speed: Math.hypot(vel.x, vel.z), engaged: 0 };
      ships.push(s); byId.set(id, s);
    }
    for (const id of [...this._vel.keys()]) if (!byId.has(id)) this._vel.delete(id);
    const R = window.KOSMOS?.timeSystem?.combatRoundMs?.() ?? 1150;
    const pairs = (r._cvLedger?.pairIntensity?.(b.encIds, now - 2 * R, now + R) ?? [])
      .filter((p) => byId.get(p.attacker)?.alive && byId.get(p.target)?.alive);
    for (const p of pairs) { const a = byId.get(p.attacker); if (a) a.engaged += p.shots; }
    // Ciała strażników — przeliczane co ~0,5 s prezentacji (ruch orbit w tym czasie ≪ zapas strażnika), nie co klatkę.
    if (!this._bodies || !(now - this._bodiesAt < 500) || now < this._bodiesAt) {
      const bodies = [];
      for (const map of [r._planets, r._moons, r._planetoids]) {
        for (const [bid] of map ?? []) { const bi = r.getBodyWorldInfo?.(bid); if (bi && bi.r > 0) bodies.push(bi); }
      }
      this._bodies = bodies; this._bodiesAt = now;
    }
    const bodies = this._bodies;
    const star = r._starGroup ? { x: r._starGroup.position.x, y: r._starGroup.position.y, z: r._starGroup.position.z, r: r._sunCoreRadius ?? 1 } : null;
    return { ships, byId, pairs, obstacles: { ships, bodies, star } };
  }

  _velocity(id, p, now) {
    const s = this._vel.get(id);
    if (!s) { this._vel.set(id, { x: p.x, y: p.y, z: p.z, t: now, vx: 0, vz: 0 }); return { x: 0, z: 0 }; }
    const dt = (now - s.t) / 1000;
    if (dt > 1e-4) {
      const k = Math.min(1, dt / 0.3);
      s.vx += ((p.x - s.x) / dt - s.vx) * k; s.vz += ((p.z - s.z) / dt - s.vz) * k;
      s.x = p.x; s.y = p.y; s.z = p.z; s.t = now;
    } else if (dt < 0) { s.x = p.x; s.y = p.y; s.z = p.z; s.t = now; s.vx = s.vz = 0; }
    return { x: s.vx, z: s.vz };
  }

  /** Zniszczenia rejestru → wejście harmonogramu: godne bohatera (klasa ≥ niszczyciel albo ostatni okręt strony). */
  _killsCtx(kills, scene) {
    const aliveOf = { own: new Set(), enemy: new Set() };
    for (const s of scene.ships) if (s.alive) aliveOf[s.side].add(s.id);
    const out = [];
    const gone = new Set();
    for (const k of kills) {
      const s = scene.byId.get(k.vesselId);
      if (!s) continue;
      gone.add(k.vesselId);
      const rem = [...aliveOf[s.side]].filter((id) => !gone.has(id));
      out.push({ id: k.vesselId, at: k.at, attacker: k.attacker, hero: heroWorthy({ cls: s.cls, lastOfSide: rem.length === 0 }) });
    }
    return out;
  }

  /** Prostokąt kadru: 9:16 (przewodnik) albo prostokąt bezpieczny „Obserwuj” (pasek walki, outlinery); tryb nagrywania — cały ekran. */
  _view(T) {
    const r = this.r, K = window.KOSMOS;
    const W = window.innerWidth || 1, H = window.innerHeight || 1;
    const uiScale = K?.uiScale ?? 1;
    const hud = this.capture ? null : (K?.combatHud?.getPanelRect?.() ?? null);
    let safe;
    if (this.promo916) {
      const stripBottom = hud && hud.edge === 'top' && Number.isFinite(hud.y) ? (hud.y + hud.h) * uiScale + 8 : null;
      safe = promoSafe916(promoRect916(W, H), T, { stripBottom });
    } else if (this.capture) {
      safe = watchSafeRect({ W, H, uiScale, hudRect: null, topBarH: 0, bottomH: 0, rightW: 0, leftW: 0 });
    } else {
      const ins = getMapInsets(K);
      safe = watchSafeRect({ W, H, uiScale, hudRect: hud, topBarH: COSMIC.TOP_BAR_H, bottomH: ins.bottom, rightW: ins.right, leftW: ins.left });
    }
    return { fovDeg: r.camera.fov, aspect: r.camera.aspect, W, H, safe: insetRect(safe, T), rect: safe };
  }

  /** Czy punkt okrętu jest w kadrze kamery (rzut z bieżącej macierzy). */
  _inView(s) {
    if (!s) return false;
    const cam = this.r.camera;
    cam.updateMatrixWorld();
    const V = vec().set(s.x, s.y, s.z).project(cam);
    return V.z < 1 && Math.abs(V.x) <= 1 && Math.abs(V.y) <= 1;
  }

  // ── Wstrząs ─────────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Pokazane zniszczenie okrętu (rejestr) — uraz wg klasy i odległości, gdy w kadrze. */
  onKillShown(id) {
    if (!this.flag || !this._shakeOn()) return;
    const e = this.r._vessels?.get?.(id), v = window.KOSMOS?.vesselManager?.getVessel?.(id);
    if (!e?.sprite?.visible) return;
    this.shake.add(shakeTrauma({ kind: 'kill', cls: v ? vesselSizeClass(v) : null, ...this._eventView(e.sprite.position) }, dirTuning(this.r.cvTuning)));
  }

  /** Trafienia z rejestru tej klatki — wielkie (rakieta, duże obrażenia) blisko kamery dodają uraz. */
  onImpacts(impacts) {
    if (!this.flag || !this._shakeOn() || !impacts?.length) return;
    const T = dirTuning(this.r.cvTuning);
    for (const x of impacts) {
      if (!x?.hit) continue;
      if (x.kind !== 'missile' && !(x.dmg >= T.DIR_SHAKE_HIT_DMG)) continue;
      const e = this.r._vessels?.get?.(x.target);
      if (!e?.sprite?.visible) continue;
      this.shake.add(shakeTrauma({ kind: 'hit', dmg: x.dmg, missile: x.kind === 'missile', ...this._eventView(e.sprite.position) }, T));
    }
  }

  _shakeOn() { return this.active || dirTuning(this.r.cvTuning).DIR_SHAKE_MANUAL > 0; }

  _eventView(p) {
    const cam = this.r.camera;
    cam.updateMatrixWorld();
    const V = vec().copy(p).applyMatrix4(cam.matrixWorldInverse);
    const depth = -V.z;
    V.copy(p).project(cam);
    const inFrame = depth > 0 && Math.abs(V.x) <= 1.1 && Math.abs(V.y) <= 1.1;
    const pxL = depth > 0 ? lengthPx({ length: VESSEL_TARGET_SIZE.frigate, depth, fovDeg: cam.fov, H: window.innerHeight || 1 }) : 0;
    return { pxL, inFrame };
  }

  /** Po `update()` kontrolera: mały obrót kamery (następna klatka liczy kamerę od nowa — bez kumulacji). */
  applyShake() {
    const T = dirTuning(this.r.cvTuning);
    this.shake.step(this.r._presClock?.lastStepMs ?? 0, T);
    if (!(this.shake.trauma > 0) || !this.flag) return;
    if (!this._shakeOn()) { this.shake.trauma = 0; return; }
    const o = this.shake.offset(T);
    const cam = this.r.camera;
    cam.rotateY(o.yaw); cam.rotateX(o.pitch); cam.rotateZ(o.roll);
  }

  // ── 9:16 i tryb nagrywania ───────────────────────────────────────────────────────────────────────────────────────────

  setPromo916(on) { this.promo916 = !!on; this._syncGuide(true); return this.promo916; }

  /** Nagrywarka rolek: start / stop (Promise przy stopie). Bez flagi — nic. */
  setRecording(on) {
    if (!this.flag) return Promise.resolve({ ok: false, reason: 'flag_off' });
    on = !!on;
    if (on === this.reel.recording) return Promise.resolve({ ok: true, recording: on });
    return on ? Promise.resolve(this.reel.start()) : this.reel.stop();
  }

  setCapture(on) {
    on = !!on;
    if (on === this.capture) return this.capture;
    const doc = typeof document !== 'undefined' ? document : null;
    if (on) { this._captureSnap = enterCapture({ doc, renderer: this.r, K: window.KOSMOS }); this.capture = true; }
    else { exitCapture(this._captureSnap, { doc, renderer: this.r, K: window.KOSMOS }); this._captureSnap = null; this.capture = false; }
    this._syncGuide(true);
    return this.capture;
  }

  _syncGuide(force = false) {
    if (typeof document === 'undefined') return;
    const T = dirTuning(this.r.cvTuning);
    const st = promoGuideStyle({ on: this.flag && this.promo916, capture: this.capture }, T);
    const W = window.innerWidth || 1, H = window.innerHeight || 1;
    const rc = promoRect916(W, H);
    const key = `${st.visible}|${st.dark}|${st.frame}|${W}x${H}`;
    if (!force && key === this._guideKey) return;
    this._guideKey = key;
    let el = document.getElementById(PROMO_ID);
    if (!st.visible || !rc) { if (el) el.style.display = 'none'; return; }
    if (!el) {
      el = document.createElement('div');
      el.id = PROMO_ID;
      const host = document.getElementById('game-container') ?? document.body;
      const ui = document.getElementById('ui-canvas');
      if (ui && ui.parentNode === host) host.insertBefore(el, ui); else host.appendChild(el);
    }
    const s = el.style;
    s.position = 'fixed'; s.pointerEvents = 'none'; s.zIndex = '1'; s.display = 'block'; s.boxSizing = 'content-box';
    s.left = `${rc.x0}px`; s.top = `${rc.y0}px`; s.width = `${rc.x1 - rc.x0}px`; s.height = `${rc.y1 - rc.y0}px`;
    s.outline = st.frame ? '1px solid rgba(255,255,255,0.55)' : 'none';
    s.outlineOffset = '1px';   // ramka POZA kadrem — wycięcie 9:16 jej nie łapie
    s.boxShadow = st.dark > 0 ? `0 0 0 9999px rgba(0,0,0,${st.dark})` : 'none';
  }

  // ── Odczyt ──────────────────────────────────────────────────────────────────────────────────────────────────────────

  info() {
    const r = this.r;
    const T = dirTuning(r.cvTuning);
    const R = window.KOSMOS?.timeSystem?.combatRoundMs?.() ?? 1150;
    const now = r._presClock?.nowMs ?? 0;
    const sh = this.schedule?.shot ?? null;
    const r1 = (x) => (Number.isFinite(x) ? Math.round(x) : x);
    // Następne ujęcia — przewidywanie z bieżącej dostępności (harmonogram decyduje na bieżąco; bohater ma pierwszeństwo).
    const next = [];
    if (this.schedule && sh && sh.type !== SHOT.RESULT) {
      let prev = sh.type, since = this.schedule.sinceWide, idx = this.schedule.index;
      const subj = this.battle ? shotSubjects(this._scene(this.battle, this._pickCluster()).ships, []) : null;
      for (let i = 0; i < 3; i++) {
        const u = this.schedule.rng(idx)();
        const type = nextShotType({ prev, sinceWide: since, available: { follow: !!subj?.flagship, duel: true, flyby: (subj?.frigates?.length ?? 0) > 0 },
        recent: this.schedule.history.slice(-4), u }, T);
        next.push(type);
        since = type === SHOT.WIDE ? 0 : since + 1; prev = type; idx++;
      }
    }
    const ph = this.schedule?.pendingHero ?? null;
    return {
      flag: this.flag, chip: this.chipState, control: this.active ? 'director' : 'player',
      pauseReason: this.paused ? this.pauseReason : null, lastTakeBack: this.lastTakeBack,
      battle: this.battle ? { key: this.battle.key, encounters: [...this.battle.encIds], ships: this.battle.ids.length, seed: this.battle.seed } : null,
      shot: sh ? { type: sh.type, index: sh.index, subject: sh.subjectId ?? null, target: sh.targetId ?? sh.attackerId ?? null,
        cut: !!sh.cut, startMs: r1(sh.startMs), endMs: r1(sh.endMs), leftMs: r1((sh.endMs ?? now) - now), killAt: r1(sh.killAt) } : null,
      nextShots: next, available: this._lastAvail ?? null,
      pendingHero: ph ? { vessel: ph.id, inMs: r1(ph.startAt - now), killInMs: r1(ph.at - now) } : null,
      recent: (this.schedule?.log ?? []).slice(-8).map((x) => ({ type: x.type, ms: r1(x.endMs - x.startMs), subject: x.subject })),
      hero: { phase: this.warp.phase, rate: +this.warp.rate.toFixed(3), lagR: +(this.warp.lagMs / R).toFixed(3),
        slowMs: r1(this.warp.slowMs), tail: this.warp.tail, maxLagR: +(this.warp.maxLagMs / R).toFixed(3), minRate: +this.warp.minRate.toFixed(3),
        slowTotalMs: r1(this.warp.slowTotalMs), heroes: this.warp.heroes },
      shake: { trauma: +this.shake.trauma.toFixed(3), peak: +this.shake.peak.toFixed(3), manual: T.DIR_SHAKE_MANUAL > 0 },
      promo916: this.promo916, capture: this.capture, reel: this.reel.info(),
      stats: { ...this.stats, minClearance: Number.isFinite(this.stats.minClearance) ? +this.stats.minClearance.toFixed(4) : null,
        camMs: Number.isFinite(this.stats.camMs) ? +this.stats.camMs.toFixed(3) : null },
      presMs: r1(now), roundMs: R,
    };
  }
}
