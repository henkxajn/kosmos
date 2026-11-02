// GalaxyModeController — ARC GALAXY, krok G1 (docs/design/GALAXY_PLAN.md §4 G1; D-GX-2, D-GX-3, D-GX-8, D-GX-13):
// orkiestrator TRYBU GALAKTYKI głównego widoku 3D (wzór `TacticalModeController`: plan czysty + przywrócenie 1:1).
//   • enter / exit / toggle, `isActive`; migawka kamery systemu przy wejściu → przywrócenie 1:1 przy wyjściu (twarde
//     cięcie: płyta i etykiety rozjaśniają się w 0,25 s, kamera bez ruchu); zdarzenie `galaxy:modeChanged`.
//   • D-GX-8: wejście kończy tryb taktyczny (Y w galaktyce — nic) i zdejmuje uzbrojony picker (cel w ramce układu nie ma
//     sensu nad płytą); overlay otwarty w trybie galaktyki tryb zostawia (bez auto-wyjścia — inaczej niż tryb Y); tryb NIE
//     jest zapisywany (wczytanie zaczyna w trybie układu — opcja O8 planu).
//   • Zaznaczenie gwiazdy (halo na płycie, nawiasy warstwy HUD, wiersz lewego outlinera) — sesja; zdarzenie
//     `galaxy:selectionChanged`. 1. klik = zaznaczenie, 2. klik w zaznaczoną = fokus kamery (z bliska — wejście); dwuklik albo [Enter] = wejście, gdy układ da się otworzyć (D-GX-13, bramka 186).
//   • Wejście w układ (G1, bez lotu): wyjście z trybu + przełączenie układu — kamera ląduje w kadrze układu (`frameSystem`);
//     wejście w AKTYWNY układ — wyjście + domyślny widok układu (`resetToSystemView`, bez przebudowy sceny).
// Flaga `FEATURES.galaxyView` (idiom „brak klucza = OFF”): OFF → `enter` nic nie robi (tryb nieosiągalny — HEAD bit w bit).
//
// ARC GALAXY, krok G2-1 (flaga `FEATURES.galaxyLook`; D-GX-7, D-GX-13, D-GX-14; rama F2, F3 (d)):
//   • LOT zamiast twardego cięcia — G, pigułka, wiersz korzenia lewego outlinera, Esc, [Enter], dwuklik, gest kółka
//     i [ Wejdź ] przypięcia: WYLOT do galaktyki (~1,4 s) i WLOT (~1,2 s; powrót = migawka 1:1, wejście = kadr układu, inny
//     układ — przesunięcie początku świata + `switchSystem` w chwili, gdy płyta i prawdziwe gwiazdy nieba są na zerze).
//     Oś czasu — czysty `GalaxyFlightLogic`; sterownik kamery = slot `setCinematicDriver` (wzór lotu intro); wejście
//     połknięte (słuchacze przechwytu myszy, klawisze — `GameScene`: Esc → stan końcowy); polecenia kamery na obiekty układu
//     (`_leaveGalaxyFor`) wychodzą twardo, bez lotu. Twarde cięcie G1 zostaje WYŁĄCZNIE przy `prefers-reduced-motion` albo
//     pokrętle `galaxyTuning.FLIGHT = 0`.
//   • GEST semantyczny (D-GX-7): `onWheel` (hak kontrolera kamery PRZED krokiem zoomu — gałąź `wheelZoom` układu bez zmian)
//     — 3 ząbki (300 px znormalizowanych; strojenie 1 — było 2) w 600 ms za sufitem układu → wylot; lustrzanie przy podłodze
//     galaktyki → nurkowanie w cel (`diveTargetId`, D-GX-13); lot w toku połyka kółko.
// Flaga `galaxyLook` OFF → wszystkie ścieżki G1 co do bitu (twarde cięcie, brak gestu).

import EventBus from '../core/EventBus.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { buildGalaxyEnterPlan, buildGalaxyExitPlan, galaxyCameraConfig, galaxyPresetView, plateClickAction, systemById,
  isSystemEnterable, LIVE_GALAXY, GALAXY_K } from './GalaxyModeLogic.js';
import { galaxyWorldContext } from './GalaxyOutlinerLogic.js';
import { isSystemExplored } from '../utils/SystemExploration.js';
import { systemIdOf } from '../utils/SystemScope.js';
import { CLICK_INTENT, applyClickIntent, bodyTarget } from './ClickIntentLogic.js';
import { buildFlyOutPlan, buildFlyInPlan, sampleFlight, flightEndState, flightEnabled, applyFlightPose } from './GalaxyFlightLogic.js';
import { makeSemanticZoom, diveTarget, diveBracketsVisible } from './GalaxyGestureLogic.js';

/** Flaga kroku G1 (czytana przy każdym wywołaniu). */
export const galaxyViewOn = () => !!GAME_CONFIG.FEATURES?.galaxyView;
/** Flaga kroku G2 (czytana przy każdym wywołaniu; wymaga G1). */
export const galaxyLookOn = () => galaxyViewOn() && !!GAME_CONFIG.FEATURES?.galaxyLook;

/** Powody wyjścia lotem (wejścia gracza); reszta (`focus`, `watch`, `switch`, `enter`) — twarde wyjście G1. */
export const FLIGHT_EXIT_REASONS = Object.freeze(['key', 'esc', 'pill', 'outliner', 'debug']);
const SWALLOW_TYPES = ['mousemove', 'mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'contextmenu'];
const perfNow = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());

export class GalaxyModeController {
  constructor() {
    this._active = false;
    this._snapshot = null;                         // stan sprzed wejścia (kamera systemu) — przywrócenie 1:1
    this._selectedId = null;                       // gwiazda zaznaczona na płycie (sesja)
    this._clickMemo = { id: null, t: -Infinity };  // dwuklik gwiazdy płyty
    this._flight = null;                           // G2-1 — lot w toku: { kind, reason, plan, startT, switched, … }
    this._gesture = makeSemanticZoom();            // G2-1 — gest semantyczny kółka (D-GX-7)
    this._swallow = null;                          // słuchacze przechwytu myszy na czas lotu
  }

  get isActive() { return this._active; }
  get selectedSystemId() { return this._selectedId; }
  /** G2-1 — lot kamery w toku (wejście połknięte; klawisze — `GameScene`). */
  get isFlying() { return this._flight != null; }

  toggle(reason = 'key') {
    if (this._flight) return false;
    return this._active ? this.exit(reason) : this.enter(reason);
  }

  _K() { return typeof window !== 'undefined' ? window.KOSMOS : null; }
  _dirty() { const K = this._K(); K?.hudLayer?.wake?.(); if (K?.uiManager) K.uiManager._dirty = true; }

  /** Kontekst świata dla bramek (obecność gracza, wygenerowanie, wywiad). */
  _world() { return galaxyWorldContext(this._K(), { groundUnits: this._K()?.uiManager?._outlinerState?.groundUnits ?? [] }); }

  /** Czy układ da się otworzyć (D-GX-13): wygenerowany ∧ (zbadany ∨ własna obecność). */
  canEnter(systemId, world = this._world()) {
    if (systemId == null) return false;
    const sys = systemById(world.systems, systemId);
    return isSystemEnterable({
      generated: world.generated(String(systemId)),
      explored: isSystemExplored(sys) || String(systemId) === 'sys_home',
      presence: world.presence.get(String(systemId))?.own === true,
    });
  }

  // ── G2-1: lot włączony? ──────────────────────────────────────────────────────────────────────────────────────────
  _reducedMotion() {
    try { return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; }
    catch { return false; }
  }

  /** Lot zamiast twardego cięcia: flaga `galaxyLook`, pokrętło `FLIGHT` > 0, bez `prefers-reduced-motion`, wolny slot sterownika. */
  flightOn(tr = this._K()?.threeRenderer) {
    return galaxyLookOn() && flightEnabled({ knob: LIVE_GALAXY.FLIGHT, reducedMotion: this._reducedMotion() })
      && typeof tr?.beginGalaxyFlight === 'function' && typeof tr?.setCinematicDriver === 'function' && !tr._cinematicDriver;
  }

  enter(reason = 'key') {
    if (this._active || this._flight || !galaxyViewOn()) return false;
    const K = this._K();
    const tr = K?.threeRenderer, cam = tr?._cameraController;
    if (!K?.civMode || !tr?.setGalaxyMode || !cam?.snapshotView || !cam?.setMode || !cam?.applyView) return false;
    if (K.tacticalMode?.isActive) K.tacticalMode.exit('galaxy');       // D-GX-8 — wejście kończy tryb taktyczny
    if (K.uiManager?.isPickerActive?.()) K.uiManager.cancelPickerMode?.();
    const world = this._world();
    const activeId = world.activeSystemId;
    const plan = buildGalaxyEnterPlan({ camera: cam.snapshotView(), systems: world.systems, activeId });
    this._snapshot = plan.snapshot;
    const ctx = {
      systems: world.systems, activeId, selectedId: this._selectedId,
      brightOf: (sys) => world.reveal(sys).place === true || world.presence.get(String(sys.id))?.own === true || sys.isHome === true,
    };
    if (this.flightOn(tr)) return this._startFlyOut(reason, plan, ctx, cam, tr);
    tr.setGalaxyMode(true, ctx);
    cam.setMode('galaxy', plan.config);
    cam.applyView(plan.apply);
    this._active = true;
    this._clickMemo = { id: null, t: -Infinity };
    EventBus.emit('galaxy:modeChanged', { active: true, reason });
    this._dirty();
    return true;
  }

  exit(reason = 'key') {
    if (!this._active || this._flight) return false;
    const K = this._K();
    const tr = K?.threeRenderer, cam = tr?._cameraController;
    if (FLIGHT_EXIT_REASONS.includes(reason) && this._snapshot?.camera && this.flightOn(tr)) {
      return this._startFlyIn({ mode: 'back', reason });
    }
    const plan = buildGalaxyExitPlan(this._snapshot);
    // Stan PRZED wywołaniami renderera — słuchacze kamery (`_leaveGalaxyFor`) wołają exit ponownie: to musi być no-op.
    this._active = false;
    this._snapshot = null;
    tr?.setGalaxyMode?.(false);
    cam?.setMode?.('system');               // tryb PRZED widokiem — dystans klamrowany zakresem układu
    if (plan.camera) cam?.applyView?.(plan.camera);
    EventBus.emit('galaxy:modeChanged', { active: false, reason });
    this._dirty();
    return true;
  }

  /** Zaznaczenie gwiazdy (halo, nawiasy, wiersz lewego outlinera); `null` — odznaczenie. */
  select(systemId) {
    const k = systemId == null ? null : String(systemId);
    if (k === this._selectedId) return false;
    this._selectedId = k;
    this._K()?.threeRenderer?.setGalaxySelected?.(k);
    EventBus.emit('galaxy:selectionChanged', { systemId: k });
    this._dirty();
    return true;
  }

  /** Klik w płytę (renderer): gwiazda — zaznaczenie, dwuklik — wejście; pustka — odznaczenie. */
  onPlateClick(systemId, nowMs) {
    if (!this._active || this._flight) return null;
    const cam = this._K()?.threeRenderer?._cameraController;
    const dive = !!cam && diveBracketsVisible(cam._targetDist, cam.minDist);
    const r = plateClickAction(this._clickMemo, systemId, nowMs, undefined, { selectedId: this._selectedId, dive });
    this._clickMemo = r.memo;
    if (r.action === 'deselect') this.select(null);
    else if (r.action === 'select') this.select(r.id);
    else if (r.action === 'focus') this.focusStar(r.id);
    else if (r.action === 'enter') { this.select(r.id); this.enterSystem(r.id); }
    return r.action;
  }

  /** Fokus kamery na gwieździe płyty: cel kamery płynie do gwiazdy, zoom bez zmian (2. klik w zaznaczoną). */
  focusStar(systemId) {
    const tr = this._K()?.threeRenderer, cam = tr?._cameraController;
    const s = (tr?.getGalaxyStarsWorld?.() ?? []).find((x) => String(x.id) === String(systemId));
    if (!s || !cam?.focusOn) return false;
    cam.focusOn(s.x, s.z);
    this._dirty();
    return true;
  }

  /**
   * Wejście w układ (G1 — bez lotu): wyjście z trybu + przełączenie (kadr układu); aktywny układ — wyjście + domyślny widok.
   * Układ, którego nie da się otworzyć — nic (przypięcie G2 nie pokazuje wtedy [ Wejdź ]). G2-1 — lotem (WLOT), gdy lot włączony.
   */
  enterSystem(systemId) {
    if (this._flight) return false;
    const K = this._K();
    const world = this._world();
    if (!this.canEnter(systemId, world)) return false;
    const id = String(systemId);
    const active = String(world.activeSystemId);
    if (this._active && this.flightOn()) return this._startFlyIn({ mode: 'enter', systemId: id, reason: 'enter' });
    this.exit('enter');
    if (id === active) { K?.threeRenderer?.resetToSystemView?.(); return true; }
    return K?.starSystemManager?.switchActiveSystem?.(id) === true;
  }

  enterSelected() { return this._selectedId != null ? this.enterSystem(this._selectedId) : false; }

  /** Wejście z fokusem na WŁASNYM ciele (wiersz kolonii w rozwinięciu lewego outlinera) — reguła D-UI-5 (fokus kamery). */
  enterBody(body) {
    const K = this._K();
    if (!body?.id || this._flight) return false;
    const sys = systemIdOf(body);
    if (!this.canEnter(sys)) return false;
    const active = String(K?.activeSystemId ?? 'sys_home');
    this.exit('enter');
    const intent = String(sys) === active ? CLICK_INTENT.FOCUS : CLICK_INTENT.SWITCH_FOCUS;
    return applyClickIntent(bodyTarget(body), intent, { K, emit: (n, p) => EventBus.emit(n, p) }) != null;
  }

  /** Wejście z fokusem na WŁASNEJ stacji — panel stacji (przypięcie) + kamera. */
  enterStation(station) {
    const K = this._K();
    if (!station?.id || this._flight) return false;
    const sys = systemIdOf(station);
    if (!this.canEnter(sys)) return false;
    const active = String(K?.activeSystemId ?? 'sys_home');
    this.exit('enter');
    if (String(sys) !== active && K?.starSystemManager?.switchActiveSystem?.(sys) !== true) return false;
    EventBus.emit('station:selected', { stationId: station.id });
    EventBus.emit('station:focus', { stationId: station.id });
    return true;
  }

  /** Klawisz Home w trybie galaktyki — preset (skos 0,92 / azymut 0,6 / kadr galaktyki, cel = aktywny układ). */
  applyPreset() {
    if (!this._active || this._flight) return false;
    const K = this._K();
    const cam = K?.threeRenderer?._cameraController;
    if (!cam?.applyView) return false;
    const cfg = galaxyCameraConfig(K?.galaxyData?.systems ?? [], K?.activeSystemId ?? 'sys_home');
    cam.setMode('galaxy', cfg);
    cam.applyView(galaxyPresetView(cfg));
    this._dirty();
    return true;
  }

  // ── G2-1: gest semantyczny i cel nurkowania ──────────────────────────────────────────────────────────────────────

  /**
   * Hak kółka (`ThreeCameraController` — PRZED krokiem zoomu, po bramkach overlayu i UI). `true` — zdarzenie połknięte
   * (lot w toku albo gest wyzwolił wylot / nurkowanie); `false` — zoom jak zawsze.
   */
  onWheel(e, cam) {
    if (this._flight) return true;
    if (!galaxyLookOn() || !cam) return false;
    const K = this._K();
    if (!K?.civMode) return false;
    const state = { mode: cam.mode, targetDist: cam._targetDist, dist: cam._dist, minDist: cam.minDist, maxDist: cam.maxDist };
    const vh = (typeof window !== 'undefined' && window.innerHeight) || 800;
    const r = this._gesture.feed({ deltaY: e?.deltaY ?? 0, deltaMode: e?.deltaMode ?? 0, viewportH: vh }, state, perfNow());
    if (r.trigger === 'out' && !this._active) return this.enter('wheel') === true;
    if (r.trigger === 'in' && this._active) {
      const id = this.diveTargetId();
      return id != null ? this.enterSystem(id) === true : false;
    }
    return false;
  }

  /** Cel nurkowania (D-GX-13): zaznaczona (gdy da się wejść), inaczej najbliższa celowi kamery w 3 ly; brak — `null`. */
  diveTargetId(world = null) {
    if (!this._active) return null;
    const tr = this._K()?.threeRenderer, cam = tr?._cameraController;
    if (!tr?.getGalaxyStarsWorld || !cam?._goalTarget) return null;
    const w = world ?? this._world();
    return diveTarget({ selectedId: this._selectedId, stars: tr.getGalaxyStarsWorld(), K: GALAXY_K,
      target: { x: cam._goalTarget.x, z: cam._goalTarget.z }, enterable: (id) => this.canEnter(id, w) });
  }

  // ── G2-1: lot ────────────────────────────────────────────────────────────────────────────────────────────────────

  _poseNow(cam) {
    return { theta: cam._theta, phi: cam._phi, dist: cam._dist, target: { x: cam._target.x, y: cam._target.y, z: cam._target.z } };
  }

  _startFlyOut(reason, plan, ctx, cam, tr) {
    const fp = buildFlyOutPlan({ from: this._poseNow(cam), to: plan.apply, durationMs: LIVE_GALAXY.FLIGHT_OUT_MS,
      ease: LIVE_GALAXY.FLIGHT_EASE });
    tr.beginGalaxyFlight('out', ctx);
    this._flight = { kind: 'out', reason, plan: fp, config: plan.config, ctx, startT: null, switched: false, holdU: null };
    this._beginFlight(tr);
    return true;
  }

  _startFlyIn({ mode = 'back', systemId = null, reason = 'key' } = {}) {
    const K = this._K();
    const tr = K?.threeRenderer, cam = tr?._cameraController;
    if (!tr || !cam) return false;
    const active = String(K?.activeSystemId ?? 'sys_home');
    const target = mode === 'back' ? active : String(systemId);
    const rebase = target !== active;
    const star = rebase ? (tr.getGalaxyStarsWorld?.() ?? []).find((s) => String(s.id) === target) : { x: 0, y: 0, z: 0 };
    if (!star) return false;
    const snap = this._snapshot?.camera ?? null;
    const to = mode === 'back' && snap
      ? snap
      : { theta: 0.3, phi: 1.1, dist: cam._defaultDist ?? 85, target: { x: 0, y: 0, z: 0 } };   // kadr układu — dokładny w chwili przełączenia
    const fp = buildFlyInPlan({ from: this._poseNow(cam), star, approachDist: (Number(LIVE_GALAXY.FLIGHT_APPROACH_LY) || 6) * GALAXY_K,
      to, rebase, mode, systemId: target, durationMs: LIVE_GALAXY.FLIGHT_IN_MS, ease: LIVE_GALAXY.FLIGHT_EASE });
    tr.beginGalaxyFlight('in', {});
    this._flight = { kind: 'in', reason, plan: fp, startT: null, switched: false, holdU: null };
    this._beginFlight(tr);
    return true;
  }

  _beginFlight(tr) {
    this._installSwallow();
    this._gesture.reset();
    tr.setCinematicDriver((now) => this._flightFrame(now));
    this._dirty();
  }

  _installSwallow() {
    if (this._swallow || typeof window === 'undefined' || !window.addEventListener) return;
    const fn = (ev) => { ev.stopPropagation?.(); if (ev.type === 'wheel' || ev.type === 'contextmenu') ev.preventDefault?.(); };
    for (const t of SWALLOW_TYPES) window.addEventListener(t, fn, { capture: true, passive: false });
    this._swallow = fn;
  }

  _removeSwallow() {
    if (!this._swallow || typeof window === 'undefined') return;
    for (const t of SWALLOW_TYPES) window.removeEventListener(t, this._swallow, { capture: true });
    this._swallow = null;
  }

  /**
   * Klatka sterownika (renderer — przed `cameraController.update()`). Wyjątek w klatce kończy lot STANEM KOŃCOWYM (renderer
   * i tak odpina sterownik po błędzie — bez tego zostałoby połknięte wejście bez lotu).
   */
  _flightFrame(now) {
    try { this._flightStep(now); }
    catch (err) {
      console.error('[galaxy] błąd klatki lotu — stan końcowy', err);
      try { this.finishFlight(); }
      catch { this._flight = null; this._removeSwallow(); this._K()?.threeRenderer?.setCinematicDriver?.(null); }
    }
  }

  /** Poza, gaśnięcia, przejście logiczne, koniec. */
  _flightStep(now) {
    const f = this._flight;
    if (!f) return;
    const K = this._K();
    const tr = K?.threeRenderer, cam = tr?._cameraController;
    if (f.startT == null) f.startT = now;
    let t = now - f.startT;
    if (f.holdU != null) { t = f.holdU * f.plan.T; f.startT = now - t; }
    if (!f.switched && t >= f.plan.switchAt) this._flightSwitch(f, now);
    const s = sampleFlight(f.plan, t);
    applyFlightPose(cam, s.pose);
    tr?.setGalaxyFlightFrame?.({ systemFade: s.systemFade, plateFade: s.plateFade, realFade: s.realFade, chromeAlpha: s.chromeAlpha,
      hudAlpha: (f.kind === 'out') === f.switched ? 1 : s.hudAlpha });
    K?.hudLayer?.setFlightAlpha?.((f.kind === 'out') === f.switched ? 1 : s.hudAlpha);
    if (t >= f.plan.T && f.holdU == null) this.finishFlight();
  }

  /** Przejście LOGICZNE w trakcie lotu: wylot — w tryb galaktyki; wlot — w tryb układu (+ przełączenie układu przy celu obcym). */
  _flightSwitch(f, now) {
    const K = this._K();
    const tr = K?.threeRenderer, cam = tr?._cameraController;
    f.switched = true;
    if (f.kind === 'out') {
      this._active = true;
      this._clickMemo = { id: null, t: -Infinity };
      tr?.setGalaxyMode?.(true, { ...f.ctx, flight: true, chromeT0: f.startT + f.plan.labelsAt });
      cam?.setMode?.('galaxy', f.config);
      EventBus.emit('galaxy:modeChanged', { active: true, reason: f.reason });
      this._dirty();
      return;
    }
    this._active = false;
    tr?.setGalaxyMode?.(false, { flight: true });
    cam?.setMode?.('system');
    if (f.plan.rebase && f.plan.systemId) {
      const ok = K?.starSystemManager?.switchActiveSystem?.(f.plan.systemId) === true;
      // `switchSystem` → `initSystem` → `frameSystem`: kadr NOWEGO układu w polach kontrolera (zaraz przykryty pozą lotu).
      if (ok) f.plan.to = { theta: cam._theta, phi: cam._phi, dist: cam._defaultDist ?? cam._dist, target: { x: 0, y: 0, z: 0 } };
      else { f.plan.rebase = false; f.plan.mode = 'enter'; f.fallbackActive = true; }
    }
    if (f.plan.mode === 'enter' && (!f.plan.rebase || f.fallbackActive) && cam?.frameSystem) {
      cam.frameSystem(tr?._computeSystemExtentAU?.() ?? 10);   // kadr aktywnego układu (ten sam wzór co `resetToSystemView`)
      f.plan.to = { theta: cam._theta, phi: cam._phi, dist: cam._defaultDist ?? cam._dist, target: { x: 0, y: 0, z: 0 } };
    }
    this._snapshot = null;
    EventBus.emit('galaxy:modeChanged', { active: false, reason: f.reason });
    this._dirty();
  }

  /** Koniec lotu (oś czasu albo Esc — STAN KOŃCOWY): poza docelowa co do bitu, scena trybu docelowego, wejście oddane. */
  finishFlight() {
    const f = this._flight;
    if (!f) return false;
    const K = this._K();
    const tr = K?.threeRenderer, cam = tr?._cameraController;
    if (!f.switched) this._flightSwitch(f, perfNow());
    const end = flightEndState(f.plan);
    tr?.setCinematicDriver?.(null);
    this._flight = null;
    this._removeSwallow();
    if (cam) cam._isDragging = false;                           // mouseup połknięty w trakcie lotu — bez „lepkiego” przeciągania
    if (f.kind === 'out') {
      tr?.endGalaxyFlight?.('galaxy');
      cam?.setMode?.('galaxy', f.config);
      cam?.applyView?.(end.pose);
    } else {
      tr?.endGalaxyFlight?.('system');
      cam?.setMode?.('system');
      if (f.plan.mode === 'enter' && !f.plan.rebase) tr?.resetToSystemView?.();   // aktywny układ — jak G1 (pola kamery wyzerowane)
      else cam?.applyView?.(end.pose);                                            // migawka 1:1 albo kadr nowego układu
    }
    K?.hudLayer?.setFlightAlpha?.(1);
    this._dirty();
    return true;
  }

  /** Przyrząd bramki: przesuń lot do ułamka `u` (0–1); `hold` — zatrzymaj tam (arkusz kontaktowy), `false` — leć dalej. */
  flightSeek(u, hold = true) {
    const f = this._flight;
    if (!f) return null;
    const uu = Math.max(0, Math.min(1, Number(u) || 0));
    f.startT = perfNow() - uu * f.plan.T;
    f.holdU = hold ? uu : null;
    return { kind: f.kind, mode: f.plan.mode ?? 'out', u: uu };
  }

  /** Odczyt bramki: lot w toku. */
  flightInfo() {
    const f = this._flight;
    if (!f) return null;
    const t = f.holdU != null ? f.holdU * f.plan.T : (f.startT == null ? 0 : perfNow() - f.startT);
    return { kind: f.kind, mode: f.plan.mode ?? 'out', reason: f.reason, T: f.plan.T, t: Math.min(f.plan.T, Math.max(0, t)),
      switched: f.switched, systemId: f.plan.systemId ?? null, held: f.holdU };
  }
}
