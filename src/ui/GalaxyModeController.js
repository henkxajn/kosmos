// GalaxyModeController — ARC GALAXY, krok G1 (docs/design/GALAXY_PLAN.md §4 G1; D-GX-2, D-GX-3, D-GX-8, D-GX-13):
// orkiestrator TRYBU GALAKTYKI głównego widoku 3D (wzór `TacticalModeController`: plan czysty + przywrócenie 1:1).
//   • enter / exit / toggle, `isActive`; migawka kamery systemu przy wejściu → przywrócenie 1:1 przy wyjściu (twarde
//     cięcie: płyta i etykiety rozjaśniają się w 0,25 s, kamera bez ruchu); zdarzenie `galaxy:modeChanged`.
//   • D-GX-8: wejście kończy tryb taktyczny (Y w galaktyce — nic) i zdejmuje uzbrojony picker (cel w ramce układu nie ma
//     sensu nad płytą); overlay otwarty w trybie galaktyki tryb zostawia (bez auto-wyjścia — inaczej niż tryb Y); tryb NIE
//     jest zapisywany (wczytanie zaczyna w trybie układu — opcja O8 planu).
//   • Zaznaczenie gwiazdy (halo na płycie, nawiasy warstwy HUD, wiersz lewego outlinera) — sesja; zdarzenie
//     `galaxy:selectionChanged`. Dwuklik gwiazdy albo [Enter] = wejście, gdy układ da się otworzyć (D-GX-13, bramka 186).
//   • Wejście w układ (G1, bez lotu): wyjście z trybu + przełączenie układu — kamera ląduje w kadrze układu (`frameSystem`);
//     wejście w AKTYWNY układ — wyjście + domyślny widok układu (`resetToSystemView`, bez przebudowy sceny).
// Flaga `FEATURES.galaxyView` (idiom „brak klucza = OFF”): OFF → `enter` nic nie robi (tryb nieosiągalny — HEAD bit w bit).

import EventBus from '../core/EventBus.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { buildGalaxyEnterPlan, buildGalaxyExitPlan, galaxyCameraConfig, galaxyPresetView, plateClickAction, systemById,
  isSystemEnterable } from './GalaxyModeLogic.js';
import { galaxyWorldContext } from './GalaxyOutlinerLogic.js';
import { isSystemExplored } from '../utils/SystemExploration.js';
import { systemIdOf } from '../utils/SystemScope.js';
import { CLICK_INTENT, applyClickIntent, bodyTarget } from './ClickIntentLogic.js';

/** Flaga kroku G1 (czytana przy każdym wywołaniu). */
export const galaxyViewOn = () => !!GAME_CONFIG.FEATURES?.galaxyView;

export class GalaxyModeController {
  constructor() {
    this._active = false;
    this._snapshot = null;                         // stan sprzed wejścia (kamera systemu) — przywrócenie 1:1
    this._selectedId = null;                       // gwiazda zaznaczona na płycie (sesja)
    this._clickMemo = { id: null, t: -Infinity };  // dwuklik gwiazdy płyty
  }

  get isActive() { return this._active; }
  get selectedSystemId() { return this._selectedId; }

  toggle(reason = 'key') { return this._active ? this.exit(reason) : this.enter(reason); }

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

  enter(reason = 'key') {
    if (this._active || !galaxyViewOn()) return false;
    const K = this._K();
    const tr = K?.threeRenderer, cam = tr?._cameraController;
    if (!K?.civMode || !tr?.setGalaxyMode || !cam?.snapshotView || !cam?.setMode || !cam?.applyView) return false;
    if (K.tacticalMode?.isActive) K.tacticalMode.exit('galaxy');       // D-GX-8 — wejście kończy tryb taktyczny
    if (K.uiManager?.isPickerActive?.()) K.uiManager.cancelPickerMode?.();
    const world = this._world();
    const activeId = world.activeSystemId;
    const plan = buildGalaxyEnterPlan({ camera: cam.snapshotView(), systems: world.systems, activeId });
    this._snapshot = plan.snapshot;
    tr.setGalaxyMode(true, {
      systems: world.systems, activeId, selectedId: this._selectedId,
      brightOf: (sys) => world.reveal(sys).place === true || world.presence.get(String(sys.id))?.own === true || sys.isHome === true,
    });
    cam.setMode('galaxy', plan.config);
    cam.applyView(plan.apply);
    this._active = true;
    this._clickMemo = { id: null, t: -Infinity };
    EventBus.emit('galaxy:modeChanged', { active: true, reason });
    this._dirty();
    return true;
  }

  exit(reason = 'key') {
    if (!this._active) return false;
    const K = this._K();
    const tr = K?.threeRenderer, cam = tr?._cameraController;
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
    if (!this._active) return null;
    const r = plateClickAction(this._clickMemo, systemId, nowMs);
    this._clickMemo = r.memo;
    if (r.action === 'deselect') this.select(null);
    else if (r.action === 'select') this.select(r.id);
    else if (r.action === 'enter') { this.select(r.id); this.enterSystem(r.id); }
    return r.action;
  }

  /**
   * Wejście w układ (G1 — bez lotu): wyjście z trybu + przełączenie (kadr układu); aktywny układ — wyjście + domyślny widok.
   * Układ, którego nie da się otworzyć — nic (wiersz outlinera ma podpowiedź; G2 dołoży powód w przypięciu).
   */
  enterSystem(systemId) {
    const K = this._K();
    const world = this._world();
    if (!this.canEnter(systemId, world)) return false;
    const id = String(systemId);
    const active = String(world.activeSystemId);
    this.exit('enter');
    if (id === active) { K?.threeRenderer?.resetToSystemView?.(); return true; }
    return K?.starSystemManager?.switchActiveSystem?.(id) === true;
  }

  enterSelected() { return this._selectedId != null ? this.enterSystem(this._selectedId) : false; }

  /** Wejście z fokusem na WŁASNYM ciele (wiersz kolonii w rozwinięciu lewego outlinera) — reguła D-UI-5 (fokus kamery). */
  enterBody(body) {
    const K = this._K();
    if (!body?.id) return false;
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
    if (!station?.id) return false;
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
    if (!this._active) return false;
    const K = this._K();
    const cam = K?.threeRenderer?._cameraController;
    if (!cam?.applyView) return false;
    const cfg = galaxyCameraConfig(K?.galaxyData?.systems ?? [], K?.activeSystemId ?? 'sys_home');
    cam.setMode('galaxy', cfg);
    cam.applyView(galaxyPresetView(cfg));
    this._dirty();
    return true;
  }
}
