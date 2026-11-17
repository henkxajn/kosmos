// DysonOverlay — megaprojekt Sfery Dysona (Faza D3)
//
// ARC KONSOLE K5 / KZ — ekran konsoli (szablon 4-strefowy, `drawDysonConsole` w `CivilizationConsoleView.js`): bohater =
// pierścień 20 segmentów w 4 fazach, lista faz → segmentów, inspektor = koszt vs magazyn + [ DOSTARCZ ], pas = ścieżka końca
// gry. Dawny układ 2-kolumnowy usunięty w KZ (ścieżka konsoli jedyna).
//
// Nasłuchuje:
//   'dyson:panelUpdate' { state } → cache state
// Emituje:
//   (przez DysonSystem.deliverMax / deliverPercent wywołane z handleClick)

import { BaseOverlay } from './BaseOverlay.js';
import EventBus from '../core/EventBus.js';
import { applyConsoleHalo } from './ConsoleKit.js';
import { drawDysonConsole } from './CivilizationConsoleView.js';
import { applyCivChip } from './CivilizationConsoleLogic.js';

export class DysonOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._state = null;
    this._selectedSeg  = null;  // Segment id wybrany w UI
    // K5 — konsola: strefy ostatniej klatki, przewinięcia listy / inspektora
    this.consoleZones   = null;
    this._kitScrollList = 0;
    this._kitScrollInsp = 0;

    // Nasłuch eventów DysonSystem
    EventBus.on('dyson:panelUpdate', (state) => {
      this._state = state;
    });
  }

  // ── Główna metoda rysowania ──────────────────────────────────────────────

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];
    // K5 — poświata za całym rysunkiem konsoli; zdjęta przez restore
    ctx.save();
    applyConsoleHalo(ctx);
    try { drawDysonConsole(this, ctx, W, H); } finally { ctx.restore(); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Obsługa kliknięć
  // ══════════════════════════════════════════════════════════════════════════

  // K5 — klik na konsoli: ramka ze stref ostatniej klatki; klik wewnątrz zawsze pochłonięty
  handleClick(x, y) {
    if (!this.visible) return false;
    const f = this.consoleZones?.frame;
    if (!f || x < f.x || x > f.x + f.w || y < f.y || y > f.y + f.h) return false;
    const hit = this._hitTest(x, y);
    if (hit) this._onHit(hit);
    return true;
  }

  _onHit(zone) {
    switch (zone.type) {
      case 'close':
        this.hide();
        break;
      case 'selectSegment':
        this._selectedSeg = zone.data.segmentId;
        this._kitScrollInsp = 0;   // K5 — nowy segment w inspektorze od góry
        break;
      case 'tab':   // K5 — czip grupy w nagłówku konsoli (jak klik w pas subnav)
        applyCivChip(zone.data?.id, window.KOSMOS?.overlayManager);
        break;
      case 'deliverMax': {
        // Klik na segment row = również wybierz segment (UX: feedback w sub-panelu)
        this._selectedSeg = zone.data.segmentId;
        const result = window.KOSMOS?.dysonSystem?.deliverMax?.(zone.data.segmentId);
        if (result && !result.ok) {
          console.warn('[DysonOverlay] deliverMax failed:', result.reason);
        }
        break;
      }
      case 'deliverPercent': {
        this._selectedSeg = zone.data.segmentId;
        const result = window.KOSMOS?.dysonSystem?.deliverPercent?.(
          zone.data.segmentId,
          zone.data.percent ?? 0.10
        );
        if (result && !result.ok) {
          console.warn('[DysonOverlay] deliverPercent failed:', result.reason);
        }
        break;
      }
    }
  }

  // K5 — kółko na konsoli: geometria wyłącznie ze stref ostatniej klatki (bez window.inner*)
  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    const f = this.consoleZones?.frame;
    if (!f || x < f.x || x > f.x + f.w || y < f.y || y > f.y + f.h) return false;
    const inR = (r) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (inR(this._consoleListRect)) this._kitScrollList = Math.max(0, (this._kitScrollList ?? 0) + delta * 0.5);
    else if (inR(this._consoleInspRect)) this._kitScrollInsp = Math.max(0, (this._kitScrollInsp ?? 0) + delta * 0.5);
    else if (inR(this._consoleStripRect)) this._kitStripOff = Math.max(0, (this._kitStripOff ?? 0) + (delta > 0 ? 1 : -1));
    return true;
  }
}
