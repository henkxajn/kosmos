// BottomBar — cienki pasek dolny (30px): stabilność + EventLog + przyciski gry
//
// Zastępuje: _drawStabilityBar(), _drawEventLog(), _drawGameButtons(), _drawHint()
// Zintegrowane w jednym pasku na dole ekranu.

import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { COSMIC }         from '../config/LayoutConfig.js';
import { SaveSystem }     from '../systems/SaveSystem.js';
import EventBus            from '../core/EventBus.js';

const BAR_H = COSMIC.BOTTOM_BAR_H; // 30px
const LOG_INLINE = 2; // ile wpisów widocznych inline
const LOG_EXPANDED = 6; // ile wpisów po rozwinięciu

const C = {
  get bg()     { return THEME.bgPrimary; },
  get border() { return THEME.border; },
  get title()  { return THEME.accent; },
  get label()  { return THEME.textLabel; },
  get text()   { return THEME.textSecondary; },
  get bright() { return THEME.textPrimary; },
  get red()    { return THEME.danger; },
  get dim()    { return THEME.textDim; },
};

function _shortYear(y) {
  if (y >= 1e9)  return (y / 1e9).toFixed(1) + 'G';
  if (y >= 1e6)  return (y / 1e6).toFixed(1) + 'M';
  if (y >= 1000) return (y / 1000).toFixed(0) + 'k';
  return String(Math.floor(y));
}

function _truncate(str, maxLen) {
  if (!str) return '';
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + '…';
}

export class BottomBar {
  constructor() {
    this._expanded = false; // rozwinięty EventLog
  }

  // ── Rysowanie ───────────────────────────────────────────
  draw(ctx, W, H, state) {
    const { stability, logEntries, audioEnabled, autoSlow, diskPhase, civMode } = state;
    const barY = H - BAR_H;

    // Rozwinięty log — dodatkowe tło nad paskiem
    const expandedH = this._expanded ? LOG_EXPANDED * 14 + 8 : 0;

    if (this._expanded && expandedH > 0) {
      const expY = barY - expandedH;
      ctx.fillStyle = bgAlpha(0.88);
      ctx.fillRect(0, expY, W, expandedH);
      ctx.strokeStyle = C.border;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, expY); ctx.lineTo(W, expY); ctx.stroke();

      // Rozwinięte wpisy
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const entries = (logEntries || []).slice(0, LOG_EXPANDED);
      entries.forEach((entry, i) => {
        ctx.fillStyle = entry.color || C.text;
        const yr = entry.year > 0 ? `${_shortYear(entry.year)} ` : '';
        ctx.fillText(yr + _truncate(entry.text, 60), 160, expY + 12 + i * 14);
      });
    }

    // Tło paska
    ctx.fillStyle = bgAlpha(0.90);
    ctx.fillRect(0, barY, W, BAR_H);
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, barY); ctx.lineTo(W, barY); ctx.stroke();

    const textY = barY + 19;

    // ── Sekcja lewa: Stabilność ──
    const { score, trend } = stability || { score: 50, trend: 'stable' };
    const arrow  = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '–';
    const tColor = trend === 'up' ? THEME.successDim : trend === 'down' ? THEME.dangerDim : C.text;

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label;
    ctx.textAlign = 'left';
    ctx.fillText('STAB:', 10, textY);

    ctx.fillStyle = tColor;
    ctx.fillText(`${score}${arrow}`, 46, textY);

    // Mini-pasek stabilności
    const sBarX = 80, sBarW = 50, sBarH = 5;
    const sBarY = textY - 4;
    ctx.fillStyle = THEME.bgTertiary;
    ctx.fillRect(sBarX, sBarY, sBarW, sBarH);
    const sFillW = Math.round((score / 100) * sBarW);
    if (sFillW > 0) {
      ctx.fillStyle = score >= 70 ? THEME.successDim : score >= 40 ? '#ccaa22' : THEME.dangerDim;
      ctx.fillRect(sBarX, sBarY, sFillW, sBarH);
    }
    ctx.strokeStyle = '#1a3050';
    ctx.lineWidth = 1;
    ctx.strokeRect(sBarX, sBarY, sBarW, sBarH);

    // Faza dysku
    if (diskPhase) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = '#88aaff';
      ctx.fillText(diskPhase, 140, textY);
    }

    // ── Sekcja centralna: EventLog (inline) ──
    const logX = 200;
    const logW = W - 400; // dostępna szerokość na log
    const maxChars = Math.floor(logW / 6);

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const entries = (logEntries || []).slice(0, LOG_INLINE);
    let lx = logX;
    entries.forEach((entry, i) => {
      ctx.fillStyle = entry.color || C.text;
      const yr = entry.year > 0 ? `${_shortYear(entry.year)} ` : '';
      const txt = yr + _truncate(entry.text, Math.floor(maxChars / LOG_INLINE) - 2);
      ctx.fillText(txt, lx, textY);
      lx += ctx.measureText(txt).width + 16;
    });

    // Przycisk rozwinięcia [▲/▼]
    const expandBtnX = logX - 16;
    ctx.fillStyle = this._expanded ? C.title : C.label;
    ctx.fillText(this._expanded ? '▼' : '▲', expandBtnX, textY);

    // ── Sekcja prawa: Przyciski gry ──
    const btns = this._getButtonDefs(W, audioEnabled, autoSlow);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    btns.forEach(b => {
      ctx.fillStyle = b.active === false ? THEME.dangerDim : C.label;
      ctx.textAlign = 'right';
      ctx.fillText(b.label, b.x, textY);
    });
    ctx.textAlign = 'left';

    // Hint (jeśli nie civMode)
    if (!civMode) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.label;
      ctx.fillText('scroll:zoom │ PPM:pan │ klik:zaznacz', 10, barY + BAR_H - 4);
    }
  }

  _getButtonDefs(W, audioEnabled, autoSlow) {
    const BTN_W = 38, GAP = 4;
    return [
      { id: 'sound', label: '[DZW]', x: W - 10,                    active: audioEnabled },
      { id: 'new',   label: '[NOW]', x: W - 10 - (BTN_W + GAP),    active: undefined },
      { id: 'load',  label: '[WCZ]', x: W - 10 - (BTN_W + GAP) * 2, active: undefined },
      { id: 'save',  label: '[ZAP]', x: W - 10 - (BTN_W + GAP) * 3, active: undefined },
      { id: 'auto',  label: '[AUT]', x: W - 10 - (BTN_W + GAP) * 4, active: autoSlow },
    ];
  }

  // ── Hit testing ──────────────────────────────────────────
  hitTest(x, y, W, H, audioEnabled, autoSlow) {
    const barY = H - BAR_H;
    if (y < barY) {
      // Rozwinięty EventLog
      if (this._expanded) {
        const expandedH = LOG_EXPANDED * 14 + 8;
        if (y >= barY - expandedH) return true; // pochłoń klik w rozw. logu
      }
      return false;
    }

    // Przycisk rozwinięcia EventLog
    const logExpandX = 184;
    if (x >= logExpandX - 8 && x <= logExpandX + 12) {
      this._expanded = !this._expanded;
      return true;
    }

    // Przyciski gry
    const btns = this._getButtonDefs(W, audioEnabled, autoSlow);
    for (const b of btns) {
      if (x >= b.x - 40 && x <= b.x) {
        this._handleButton(b.id);
        return true;
      }
    }

    return true; // pochłoń klik w pasku dolnym
  }

  _handleButton(id) {
    if (id === 'save') {
      EventBus.emit('game:save');
    } else if (id === 'load') {
      if (!SaveSystem.hasSave()) return;
      window.location.reload();
    } else if (id === 'new') {
      EventBus.emit('ui:confirmNew');
    } else if (id === 'sound') {
      EventBus.emit('audio:toggle');
    } else if (id === 'auto') {
      EventBus.emit('time:autoSlowToggle');
    }
  }

  // Sprawdza czy punkt jest nad BottomBar
  isOver(x, y, H) {
    const barY = H - BAR_H;
    if (y >= barY) return true;
    // Rozwinięty EventLog
    if (this._expanded) {
      const expandedH = LOG_EXPANDED * 14 + 8;
      if (y >= barY - expandedH) return true;
    }
    return false;
  }
}
