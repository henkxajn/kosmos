// GalaxyMapScene — overlay mapy galaktycznej (klawisz G)
//
// Pełnoekranowa scena 3D z okolicznymi układami gwiezdnymi.
// Extends BaseOverlay — OverlayManager zarządza show/hide.
// Osadza GalaxyMapRenderer (WebGL canvas) + panele Canvas 2D na #ui-canvas.
// Otwarcie pauzuje czas gry, zamknięcie wznawia.

import { BaseOverlay }         from '../ui/BaseOverlay.js';
import { THEME, bgAlpha }     from '../config/ThemeConfig.js';
import { COSMIC }              from '../config/LayoutConfig.js';
import { CIV_SIDEBAR_W }      from '../ui/CivPanelDrawer.js';
import { GalaxyMapRenderer }   from '../renderer/GalaxyMapRenderer.js';
import { STAR_TYPES }          from '../config/GameConfig.js';
import EventBus                from '../core/EventBus.js';

// ── Layout ────────────────────────────────────────────────────────────────────
const HDR_H   = 44;    // nagłówek
const LEFT_W  = 220;   // lewy panel info
const BOT_H   = 36;    // dolny pasek (legenda)

// Skala UI — dynamiczna
let _UI_SCALE = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
window.addEventListener('resize', () => {
  _UI_SCALE = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
});

// Etykiety typów spektralnych
const SPECTRAL_LABELS = {
  M: 'Czerwony karzeł (M)',
  K: 'Pomarańczowy karzeł (K)',
  G: 'Żółty karzeł (G)',
  F: 'Żółto-biały karzeł (F)',
};

// Kolory typów do legendy (CSS hex)
const SPECTRAL_COLORS = {
  M: '#ff6b47',
  K: '#ffaa55',
  G: '#fffacd',
  F: '#ffffff',
};

export class GalaxyMapScene extends BaseOverlay {
  constructor() {
    super(null);
    this._renderer       = new GalaxyMapRenderer();
    this._selectedSystem = null;
    this._wasPaused      = false;
    this._lastW = 0;
    this._lastH = 0;
  }

  // ── show / hide ─────────────────────────────────────────────────────────

  show() {
    super.show();

    // Pauzuj czas gry
    this._wasPaused = window.KOSMOS?.timeSystem?.paused ?? false;
    if (!this._wasPaused) EventBus.emit('time:pause');

    // Otwórz renderer 3D
    const galaxyData = window.KOSMOS?.galaxyData;
    if (!galaxyData) {
      console.warn('[GalaxyMapScene] Brak galaxyData');
      super.hide();
      return;
    }

    this._renderer.open(galaxyData, {
      onSelect: (sys) => this._selectSystem(sys),
    });

    // Domyślnie zaznacz home
    const home = galaxyData.systems.find(s => s.isHome);
    if (home) this._selectedSystem = home;
  }

  hide() {
    this._renderer.close();

    // Wznów czas jeśli nie był zapauzowany
    if (!this._wasPaused) EventBus.emit('time:resume');

    this._selectedSystem = null;
    super.hide();
  }

  _selectSystem(sys) {
    this._selectedSystem = sys;
  }

  // ── Rysowanie Canvas 2D (panele) ──────────────────────────────────────────

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];

    this._lastW = W;
    this._lastH = H;
    const ox = CIV_SIDEBAR_W; // offset za sidebar CivPanel

    // ── Pełnoekranowe tło — zakrywa cały HUD pod spodem ──────────────────
    ctx.fillStyle = bgAlpha(0.98);
    ctx.fillRect(0, 0, W, H);

    // ── Wyczyść środek — tu prześwituje WebGL galaktyki ──────────────────
    const viewX = ox + LEFT_W;
    const viewY = HDR_H;
    const viewW = W - viewX;
    const viewH = H - HDR_H - BOT_H;
    ctx.clearRect(viewX, viewY, viewW, viewH);

    // ── Nagłówek ──────────────────────────────────────────────────────────
    ctx.fillStyle = bgAlpha(0.95);
    ctx.fillRect(ox, 0, W - ox, HDR_H);
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, 0.5, W - ox - 1, HDR_H - 1);

    ctx.fillStyle = THEME.accent;
    ctx.font = `bold ${THEME.fontSizeTitle}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText('🌌 MAPA GALAKTYCZNA', ox + 12, HDR_H / 2 + 5);

    // Przycisk zamknij [ESC ×]
    const closeW = 60, closeH = 22;
    const closeX = W - closeW - 10;
    const closeY = (HDR_H - closeH) / 2;
    this._drawButton(ctx, 'ESC ×', closeX, closeY, closeW, closeH, 'secondary');
    this._addHit(closeX, closeY, closeW, closeH, 'close', { label: 'ESC ×' });

    // ── Lewy panel (info o wybranym systemie) ─────────────────────────────
    const panelY = HDR_H;
    const panelH = H - HDR_H - BOT_H;

    ctx.fillStyle = bgAlpha(0.88);
    ctx.fillRect(ox, panelY, LEFT_W, panelH);
    ctx.strokeStyle = THEME.border;
    ctx.strokeRect(ox + 0.5, panelY + 0.5, LEFT_W - 1, panelH - 1);

    const px = ox + 10;
    let py = panelY + 16;

    if (this._selectedSystem) {
      const sys = this._selectedSystem;

      // Nazwa
      ctx.fillStyle = THEME.accent;
      ctx.font = `bold 13px ${THEME.fontFamily}`;
      ctx.textAlign = 'left';
      ctx.fillText(sys.name, px, py);
      py += 20;

      // Typ spektralny z kolorową kropką
      const specColor = SPECTRAL_COLORS[sys.spectralType] || '#fff';
      ctx.fillStyle = specColor;
      ctx.beginPath();
      ctx.arc(px + 4, py - 3, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = THEME.textSecondary;
      ctx.font = `${THEME.fontSize}px ${THEME.fontFamily}`;
      ctx.fillText(SPECTRAL_LABELS[sys.spectralType] || sys.spectralType, px + 14, py);
      py += 18;

      // Separator
      ctx.strokeStyle = THEME.border;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + LEFT_W - 20, py);
      ctx.stroke();
      py += 12;

      // Masa
      ctx.fillStyle = THEME.textLabel;
      ctx.fillText('Masa:', px, py);
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(`${sys.mass} M☉`, px + 65, py);
      py += 16;

      // Luminosity
      ctx.fillStyle = THEME.textLabel;
      ctx.fillText('Jasność:', px, py);
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(`${sys.luminosity} L☉`, px + 65, py);
      py += 16;

      // Odległość
      ctx.fillStyle = THEME.textLabel;
      ctx.fillText('Odległość:', px, py);
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(`${sys.distanceLY} ly`, px + 80, py);
      py += 20;

      // Separator
      ctx.strokeStyle = THEME.border;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + LEFT_W - 20, py);
      ctx.stroke();
      py += 14;

      // Status
      ctx.fillStyle = THEME.textLabel;
      ctx.fillText('Status:', px, py);
      py += 16;
      if (sys.isHome) {
        ctx.fillStyle = THEME.accent;
        ctx.fillText('🏠 TWÓJ UKŁAD', px, py);
      } else if (sys.explored) {
        ctx.fillStyle = THEME.success;
        ctx.fillText('✅ ZBADANY', px, py);
      } else {
        ctx.fillStyle = THEME.warning;
        ctx.fillText('❓ NIEZBADANY', px, py);
      }
      py += 24;

      // Przyszłość (wyszarzony)
      if (!sys.isHome) {
        ctx.fillStyle = THEME.textDim;
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        const lines = this._wrapText(ctx, 'Ekspedycja międzygwiezdna — wkrótce', LEFT_W - 24);
        for (const line of lines) {
          ctx.fillText(line, px, py);
          py += 14;
        }
      }

    } else {
      // Nic nie wybrane
      ctx.fillStyle = THEME.textDim;
      ctx.font = `${THEME.fontSize}px ${THEME.fontFamily}`;
      const lines = this._wrapText(ctx, 'Kliknij gwiazdę aby zobaczyć szczegóły', LEFT_W - 24);
      for (const line of lines) {
        ctx.fillText(line, px, py);
        py += 16;
      }
    }

    // ── Dolny pasek (legenda typów) ───────────────────────────────────────
    const botY = H - BOT_H;
    ctx.fillStyle = bgAlpha(0.92);
    ctx.fillRect(ox, botY, W - ox, BOT_H);
    ctx.strokeStyle = THEME.border;
    ctx.strokeRect(ox + 0.5, botY + 0.5, W - ox - 1, BOT_H - 1);

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';

    let lx = ox + 12;
    const ly = botY + BOT_H / 2 + 4;
    for (const type of ['M', 'K', 'G', 'F']) {
      // Kolorowa kropka
      ctx.fillStyle = SPECTRAL_COLORS[type];
      ctx.beginPath();
      ctx.arc(lx + 4, ly - 3, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(type, lx + 12, ly);
      lx += 36;
    }

    // Informacja o ilości systemów
    const sysCount = window.KOSMOS?.galaxyData?.systems?.length ?? 0;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(`${sysCount} układów w zasięgu`, W - 12, ly);
    ctx.textAlign = 'left';
  }

  // ── Interakcje ────────────────────────────────────────────────────────────

  handleClick(x, y) {
    if (!this.visible) return false;

    // Sprawdź hit zones panelowe
    const hit = this._hitTest(x, y);
    if (hit) {
      this._onHit(hit);
      return true;
    }

    // Klik w obszar 3D → raycasting (renderer oczekuje screen coords)
    if (!this._renderer.wasDrag) {
      const sys = this._renderer.handleClick(x * _UI_SCALE, y * _UI_SCALE);
      if (sys) {
        this._selectedSystem = sys;
        if (this._renderer._callbacks.onSelect) {
          this._renderer._callbacks.onSelect(sys);
        }
      }
    }

    return true; // zawsze przechwytuj klik (fullscreen overlay)
  }

  _onHit(zone) {
    if (zone.type === 'close') {
      this.hide();
      // OverlayManager musi wyczyścić active
      if (window.KOSMOS?.overlayManager) {
        window.KOSMOS.overlayManager.active = null;
      }
    }
  }

  handleMouseMove(x, y) {
    if (!this.visible) return;
    super.handleMouseMove(x, y);
    // Jeśli dragging — deleguj do renderer (screen coords)
    this._renderer.applyDrag(x * _UI_SCALE, y * _UI_SCALE);
  }

  handleMouseDown(x, y) {
    if (!this.visible) return;
    // Ignoruj klik na panel lewy / header / dolny
    const ox = CIV_SIDEBAR_W;
    if (x >= ox && x <= ox + LEFT_W && y >= HDR_H) return; // lewy panel
    if (y < HDR_H) return; // nagłówek
    if (this._lastH && y > this._lastH - BOT_H) return; // dolny pasek

    this._renderer.startDrag(x * _UI_SCALE, y * _UI_SCALE);
  }

  handleMouseUp(x, y) {
    if (!this.visible) return;
    this._renderer.endDrag();
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    this._renderer.applyZoom(delta);
    return true; // przechwytuj scroll
  }

  // ── Pomocnicze ────────────────────────────────────────────────────────────

  _wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }
}
