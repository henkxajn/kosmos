// OverlayManager — zarządza panelami overlay (jeden aktywny naraz)
//
// Rejestruje overlay'e po ID, obsługuje toggle klawiaturą (F/P/E/T),
// Escape zamyka aktywny panel. Deleguje draw/click/move do aktywnego overlay.
// Wspiera zarówno BaseOverlay (show/hide) jak i FleetManagerOverlay (open/close).

import { GAME_CONFIG } from '../config/GameConfig.js';   // C7 — bramka kill-switcha PopulationOverlay

export class OverlayManager {
  constructor() {
    this.overlays = {}; // id → overlay instance
    this.active = null; // aktualnie widoczny id
    // Konsolidacja nav 14→7 (Slice 3) — klawisze primary = przyciski TopBaru:
    //   C·civilization  E·economy  H·colony  P·population  D·diplomacy  F·fleet  T·tech
    //   (P·population degated w C7 — dodawany warunkowo niżej gdy FEATURES.populationOverlay=ON)
    //   (S·shipyard dodane w C8 — Stocznia zajęła slot po Populacji)
    // Skróty wtórne I/W/G/U/O zostają jako bezpośrednie (dostępne też przez subnav).
    // dyson/trade — BEZ skrótu (klawisze 'd'/'h' przejęte przez primary); tylko subnav.
    this._keyMap = {
      // primary (6 stałych + 's':'shipyard' C8; 'p':'population' warunkowo — niżej gdy FEATURES.populationOverlay)
      'c': 'civilization',
      'e': 'economy',
      'h': 'colony',
      'd': 'diplomacy',
      'f': 'fleet',
      't': 'tech',
      's': 'shipyard',   // C8 — Stocznia (mnemonic 's'; slot nav po Populacji)
      // wtórne overlaye — bezpośrednie skróty
      'i': 'intel',           // Faza 2 — Wywiad (obce imperia)
      'w': 'war',             // Faza 4 — Panel wojny
      // Stratcom zastąpił mapę galaktyki (G) i mini-mapę (M) — oba otwierają
      // Dowództwo Taktyczne na zakładce Stratcom (radar strategiczny).
      'g': { id: 'fleet', opts: { tab: 'stratcom' } },
      'u': 'unit_design',
      'o': 'observatory',
      // systemowe (poza grupami nav)
      'l': 'eventLog',        // Opcja B/3 — Dziennik zdarzeń
      'n': 'poi',             // M3 P2.1 — POI Panel (sidebar list)
      'm': { id: 'fleet', opts: { tab: 'stratcom' } }, // Stratcom zastąpił mini-mapę
      'k': { id: 'fleet', opts: { focusSection: 'wreck' } }, // M4 P2 — Fleet → sekcja Wraki
    };
    // C7 — hotkey P bramkowany kill-switchem PopulationOverlay (default OFF). OFF = P
    // całkowicie nieaktywne (handleKey → entry undefined → return false, bez console.log).
    // ON = przywraca 'p' → 'population'. Zob. GameConfig.FEATURES.populationOverlay.
    if (GAME_CONFIG.FEATURES.populationOverlay) this._keyMap['p'] = 'population';
  }

  register(id, overlay) {
    this.overlays[id] = overlay;
  }

  // ── Wewnętrzne — otwórz/zamknij overlay niezależnie od API ─────────
  _showOverlay(ov, opts = {}) {
    if (ov.show) ov.show(opts);
    else if (ov.open) ov.open(opts);
  }

  _hideOverlay(ov) {
    if (ov.hide) ov.hide();
    else if (ov.close) ov.close();
  }

  // Zwraca true jeśli klawisz obsłużony
  handleKey(key) {
    const entry = this._keyMap[key.toLowerCase()];
    if (!entry) return false;
    // Wpis: string (legacy) lub { id, opts } (M4 P2 — klawisz K → fleet z focusSection)
    const isObj = typeof entry !== 'string';
    const id    = isObj ? entry.id        : entry;
    const opts  = isObj ? (entry.opts ?? {}) : {};
    if (!this.overlays[id]) {
      console.log(`Panel ${id}: not yet registered`);
      return false;
    }
    if (this.active === id) {
      // M4 P2: gdy klawisz ma opts (np. 'k' → fleet+focusSection), drugie wciśnięcie
      // ponownie ustawia focus zamiast zamykać overlay (intuitive UX dla scroll).
      if (isObj && Object.keys(opts).length > 0) {
        this._showOverlay(this.overlays[id], opts);
        return true;
      }
      this._hideOverlay(this.overlays[id]);
      this.active = null;
    } else {
      if (this.active) this._hideOverlay(this.overlays[this.active]);
      this._showOverlay(this.overlays[id], opts);
      this.active = id;
    }
    return true;
  }

  openPanel(id, opts = {}) {
    if (!this.overlays[id]) return;
    if (this.active && this.active !== id) this._hideOverlay(this.overlays[this.active]);
    this._showOverlay(this.overlays[id], opts);
    this.active = id;
  }

  closeActive() {
    if (this.active) {
      this._hideOverlay(this.overlays[this.active]);
      this.active = null;
    }
  }

  isAnyOpen() { return this.active !== null; }

  draw(ctx, W, H) {
    if (!this.active) return;
    const ov = this.overlays[this.active];
    // Synchronizuj — overlay mógł się zamknąć wewnętrznie (np. przycisk [X])
    const isVis = ov.visible ?? ov.isVisible ?? ov._visible;
    if (!isVis) { this.active = null; return; }
    ov.draw(ctx, W, H);
  }

  handleClick(x, y) {
    if (!this.active) return false;
    return this.overlays[this.active].handleClick(x, y);
  }

  handleMouseMove(x, y) {
    if (!this.active) return;
    this.overlays[this.active].handleMouseMove(x, y);
  }

  handleScroll(delta, x, y) {
    if (!this.active) return false;
    const ov = this.overlays[this.active];
    if (ov.handleScroll) return ov.handleScroll(delta, x, y);
    return false;
  }

  handleMouseDown(x, y, button = 0) {
    if (!this.active) return;
    const ov = this.overlays[this.active];
    if (ov.handleMouseDown) ov.handleMouseDown(x, y, button);
  }

  handleMouseUp(x, y, button = 0) {
    if (!this.active) return;
    const ov = this.overlays[this.active];
    if (ov.handleMouseUp) ov.handleMouseUp(x, y, button);
  }
}
