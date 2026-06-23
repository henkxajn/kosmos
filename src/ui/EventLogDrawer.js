// EventLogDrawer — dziennik zdarzeń jako hover-drawer dolnej krawędzi (redesign UI v1).
//
// Zastępuje inline EventLog (2 wpisy) w BottomBar: cienki trigger 6px (~400px) na środku
// dolnej krawędzi, tuż nad paskiem bell/MENU. Hover → panel wysuwa się W GÓRĘ z listą
// ostatnich wpisów (najnowszy przy dole, flash 3s). Klik triggera/panelu → pełny overlay
// 'eventLog' (filtry + historia, klawisz L). Substrat Canvas 2D; zdarzenia z window → UIManager.
//
// Wzorzec slide/hover: NavDrawer (stepSlide + _hovered/_hideAt), ale PIONOWO od dołu (clip-reveal).
// Dane: window.KOSMOS.eventLogSystem.getVisible(). Kolory wpisów — kopie helperów z BottomBar.

import { THEME, bgAlpha, GLASS_BORDER, hexToRgb } from '../config/ThemeConfig.js';
import { COSMIC }            from '../config/LayoutConfig.js';
import { getLocale }         from '../i18n/i18n.js';
import { stepSlide, navIsAnimating, pointInRect, NAV_TRIGGER_W, NAV_HIDE_DELAY }
  from './NavDrawerLogic.js';

const BOTTOM_H  = COSMIC.BOTTOM_BAR_H;  // 26
const TOP_BAR_H = COSMIC.TOP_BAR_H;     // 46 (górny limit panelu)
const ROW_H     = 16;
const HEADER_H  = 18;
const MAX_ROWS  = 12;
const PAD       = 8;
const TRIG_H    = NAV_TRIGGER_W;        // 6
// Opóźnienie intencji hovera (ms) — panel otwiera się dopiero gdy kursor pozostaje na
// triggerze przez ten czas. Eliminuje przypadkowe otwarcia przy przelocie kursora nad
// dolną krawędzią ekranu (zob. handleMouseMove + draw + isAnimating).
const HOVER_OPEN_DELAY = 1000;

// ── Kolory wpisu (kopia z BottomBar — severity > kanał > default) ──
function _severityColor(sev) {
  if (sev === 'alert') return THEME.danger;
  if (sev === 'warn')  return THEME.warning;
  return null;
}
function _entryColor(entry) {
  const sevColor = _severityColor(entry.severity);
  if (sevColor) return sevColor;
  const chanColors = {
    fleet:  THEME.info,
    civ:    THEME.accent,
    life:   THEME.success,
    combat: THEME.danger,
    trade:  THEME.mint,
    intel:  THEME.purple ?? THEME.accent,
    system: THEME.textSecondary,
  };
  return chanColors[entry.channel] ?? THEME.textSecondary;
}
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

export class EventLogDrawer {
  constructor() {
    this._slideProgress = 0;
    this._hovered       = false;
    this._hideAt        = 0;
    this._hoverIntentAt = 0;            // ms (Date.now+delay) — pending otwarcie; 0 = brak
    this._triggerRect   = null;
    this._panelRect     = null;
  }

  _markDirty() { const um = window.KOSMOS?.uiManager; if (um) um._dirty = true; }
  // Animacja trwa też podczas oczekiwania na intencję hovera — inaczej pętla renderu
  // zamarłaby (kursor nieruchomy) i timer otwarcia nigdy by nie wystrzelił.
  isAnimating() { return this._hoverIntentAt > 0 || navIsAnimating(this._slideProgress, this._hideAt); }
  isOpen() { return this._slideProgress > 0.001; }

  _entries() {
    const log = window.KOSMOS?.eventLogSystem;
    const v = log?.getVisible?.() ?? [];
    return v.slice(0, MAX_ROWS);
  }

  draw(ctx, W, H) {
    if (this._hideAt > 0 && Date.now() >= this._hideAt) { this._hideAt = 0; this._hovered = false; }
    // Intencja hovera dojrzała → otwórz panel (kursor wytrzymał HOVER_OPEN_DELAY na triggerze).
    if (this._hoverIntentAt > 0 && Date.now() >= this._hoverIntentAt) { this._hoverIntentAt = 0; this._hovered = true; }
    this._slideProgress = stepSlide(this._slideProgress, this._hovered ? 1 : 0);

    const anchorBottom = H;                          // PRZYKLEJONY do dolnej krawędzi (y=H)
    // Inset 6px z lewej i prawej (= szerokość triggerów pionowych) — rogi należą wyłącznie
    // do NavDrawer (lewy) / Outliner (prawy); trigger poziomy ich nie nachodzi.
    const EDGE = NAV_TRIGGER_W;
    const px = EDGE;
    const pw = W - 2 * EDGE;

    // ── Trigger (pasek 6px na PEŁNEJ szerokości, przy samej dolnej krawędzi) ──
    // Kolor = THEME.accent (wspólny dla wszystkich triggerów krawędziowych) @ 0.4/0.85.
    const trigActive = this._hovered || this._slideProgress > 0.001;
    const a = hexToRgb(THEME.accent);
    ctx.fillStyle = `rgba(${a.r},${a.g},${a.b},${trigActive ? 0.85 : 0.4})`;
    ctx.fillRect(px, anchorBottom - TRIG_H, pw, TRIG_H);
    this._triggerRect = { x: px, y: anchorBottom - TRIG_H - 2, w: pw, h: TRIG_H + 2 };
    // Trigger = czysta cienka linia (bez ikon/symboli).

    if (this._slideProgress <= 0.001) { this._panelRect = null; return; }

    // ── Panel: wysuwa się W GÓRĘ (clip-reveal od dołu) ──
    const entries = this._entries();
    const rows = entries.length;
    const wantH = PAD + HEADER_H + Math.max(1, rows) * ROW_H + PAD;
    const maxH = Math.max(ROW_H * 2, H - TOP_BAR_H - 8);   // od y=H w górę do nad TopBarem
    const panelH = Math.min(wantH, maxH);
    const revealH = Math.round(panelH * this._slideProgress);
    const visTop = anchorBottom - revealH;
    this._panelRect = { x: px, y: visTop, w: pw, h: revealH };

    // Tło + górna krawędź
    ctx.fillStyle = bgAlpha(0.94);
    ctx.fillRect(px, visTop, pw, revealH);

    ctx.save();
    ctx.beginPath(); ctx.rect(px, visTop, pw, revealH); ctx.clip();

    const fullTop = anchorBottom - panelH;

    // Nagłówek (na górze pełnego panelu)
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(getLocale() === 'pl' ? '📜 Dziennik zdarzeń' : '📜 Event log', px + PAD, fullTop + HEADER_H / 2);

    // Wpisy: najnowszy (i=0) przy DOLE, starsze wyżej
    const now = Date.now();
    const maxChars = Math.max(20, Math.floor((pw - PAD * 2 - 36) / 6));
    for (let i = 0; i < rows; i++) {
      const entry = entries[i];
      const ey = anchorBottom - PAD - i * ROW_H - ROW_H / 2;
      if (ey < fullTop + HEADER_H) break;  // nie nachodź na nagłówek
      const age = now - (entry.createdAt ?? 0);
      const flashing = i === 0 && age < 3000 && age > 0;
      if (flashing) ctx.globalAlpha = 0.6 + 0.4 * (0.5 + 0.5 * Math.cos(age * 0.008));
      ctx.fillStyle = _entryColor(entry);
      const yr = entry.year > 0 ? `${_shortYear(entry.year)} ` : '';
      ctx.fillText(yr + _truncate(entry.text, maxChars), px + PAD, ey);
      ctx.globalAlpha = 1.0;
    }
    ctx.restore(); // clip

    // Górna krawędź panelu (akcentowa linia)
    ctx.strokeStyle = GLASS_BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, visTop + 0.5); ctx.lineTo(px + pw, visTop + 0.5); ctx.stroke();

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  handleMouseMove(x, y) {
    const overTrig  = pointInRect(this._triggerRect, x, y);
    const overPanel = this._slideProgress > 0.01 && pointInRect(this._panelRect, x, y);
    if (overTrig || overPanel) {
      this._hideAt = 0;
      if (this._hovered) return;                 // już otwarty — utrzymaj
      if (overPanel) { this._hovered = true; this._hoverIntentAt = 0; this._markDirty(); return; }
      // Sam trigger — uruchom opóźnienie intencji (anty-przypadkowe najechanie).
      if (this._hoverIntentAt === 0) { this._hoverIntentAt = Date.now() + HOVER_OPEN_DELAY; this._markDirty(); }
    } else {
      this._hoverIntentAt = 0;                   // opuszczenie triggera kasuje pending-otwarcie
      if (this._hovered && this._hideAt === 0) this._hideAt = Date.now() + NAV_HIDE_DELAY;
    }
  }

  handleClick(x, y) {
    const overTrig = pointInRect(this._triggerRect, x, y);
    const overPanel = this._slideProgress > 0.01 && pointInRect(this._panelRect, x, y);
    if (!overTrig && !overPanel) return false;
    // Klik → pełny overlay dziennika (filtry + historia)
    const om = window.KOSMOS?.overlayManager;
    if (om) { if (om.active === 'eventLog') om.closeActive(); else om.openPanel('eventLog'); }
    return true;
  }

  // Blokada kamery: trigger lub rozwinięty panel
  isOver(x, y) {
    if (pointInRect(this._triggerRect, x, y)) return true;
    return this._slideProgress > 0.01 && pointInRect(this._panelRect, x, y);
  }
}
