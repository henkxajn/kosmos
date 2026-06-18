// NavEdgeShim — cienki pasek DOM na LEWEJ krawędzi ekranu (z-index 60), aktywny TYLKO
// gdy otwarty jest DOM-owy overlay (Tech/Observatory, z-index 50). Slice B+C.
//
// Powód: NavDrawer rysuje na #ui-canvas (z2). DOM overlaye Tech/Observatory (z50) są NAD
// canvasem — canvas nie może namalować lewego drawera nad nimi, a ich lewa krawędź (left:0)
// zasłania trigger NavDrawera. Ten shim (z60, NAD overlayami) przejmuje klik krawędzi,
// zamyka DOM overlay (closeActive) i oddaje stery canvasowemu NavDrawerowi (który ma teraz
// czyste pole). Prawy drawer Outlinera NIE potrzebuje shima — Tech/Observatory zostawiają
// prawą rynnę OUTLINER_W, w której drawer rysuje się natywnie.
//
// Aktywny pointer-events TYLKO przy DOM overlayu → nie koliduje z canvasowym triggerem
// NavDrawera (ten działa przez zdarzenia window nad overlayami canvasowymi).

import { THEME } from '../config/ThemeConfig.js';

const DOM_OVERLAY_IDS = ['tech', 'observatory'];

export class NavEdgeShim {
  constructor() {
    this._el = null;
    this._active = false;
    this._createEl();
  }

  _createEl() {
    if (this._el) return;
    const el = document.createElement('div');
    el.id = 'nav-edge-shim-left';
    el.style.cssText = `
      position: fixed; left: 0; top: 0; bottom: 0; width: 8px;
      z-index: 60; pointer-events: none; cursor: pointer;
      background: transparent; border-left: 2px solid transparent;
    `;
    el.addEventListener('click', () => this._onActivate());
    document.body.appendChild(el);
    this._el = el;
  }

  // Klik krawędzi przy otwartym DOM overlayu → zamknij overlay + otwórz lewy NavDrawer.
  _onActivate() {
    const om = window.KOSMOS?.overlayManager;
    if (om?.active) om.closeActive();          // _destroyDOM Tech/Observatory
    const nav = window.KOSMOS?.navDrawer;
    if (nav) { nav._hovered = true; nav._hideAt = 0; nav._markDirty?.(); }
  }

  // Wywoływane co klatkę z UIManager. Włącza pointer-events + hint TYLKO gdy aktywny
  // overlay jest DOM-owy (Tech/Observatory).
  update() {
    const active = DOM_OVERLAY_IDS.includes(window.KOSMOS?.overlayManager?.active);
    if (active === this._active) return;
    this._active = active;
    if (!this._el) return;
    this._el.style.pointerEvents   = active ? 'auto' : 'none';
    this._el.style.borderLeftColor = active ? THEME.accent : 'transparent';
  }
}
