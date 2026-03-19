// BottomBar — cienki pasek dolny (26px): stabilność + EventLog + przycisk MENU
//
// Zastępuje: _drawStabilityBar(), _drawEventLog(), _drawGameButtons(), _drawHint()
// Zintegrowane w jednym pasku na dole ekranu.
// Przycisk MENU otwiera panel z opcjami: Nowa gra, Zapisz, Autozapis, Muzyka, Dźwięki.

import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { COSMIC }         from '../config/LayoutConfig.js';
import EventBus            from '../core/EventBus.js';
import { t }              from '../i18n/i18n.js';

const BAR_H = COSMIC.BOTTOM_BAR_H; // 26px
const LOG_INLINE = 2; // ile wpisów widocznych inline
const LOG_EXPANDED = 6; // ile wpisów po rozwinięciu

// Wymiary panelu MENU
const MENU_W = 220;
const MENU_ROW_H = 28;
const MENU_PAD = 8;
const MENU_ROWS = 6; // Nowa gra, Zapisz, Autozapis, Orbity, Muzyka, Dźwięki
const MENU_H = MENU_PAD * 2 + MENU_ROWS * MENU_ROW_H;

// Opcje interwału autozapisu
const AUTOSAVE_OPTIONS = ['off', 'month', 'year', '10y'];
const AUTOSAVE_INTERVALS = { off: 0, month: 1 / 12, year: 1, '10y': 10 };
const AUTOSAVE_STORAGE_KEY = 'kosmos_autosave_interval';

// Opcje widoczności orbit
const ORBIT_MODES = ['all', 'planets_moons', 'planetoids', 'none'];
const ORBIT_STORAGE_KEY = 'kosmos_orbit_filter';

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
    this._menuOpen = false; // panel menu otwarty
    this._hoverRow = -1;    // podświetlony wiersz menu (-1 = żaden)
    this._domMenu = null;   // DOM element panelu menu (z-index nad wszystkimi canvasami)

    // Wczytaj ustawienie autozapisu z localStorage
    this._autosaveOption = 'year'; // domyślnie co rok
    try {
      const stored = localStorage.getItem(AUTOSAVE_STORAGE_KEY);
      if (stored && AUTOSAVE_OPTIONS.includes(stored)) {
        this._autosaveOption = stored;
      }
    } catch (e) { /* cicho */ }

    // Wczytaj ustawienie filtra orbit z localStorage
    this._orbitMode = 'planetoids'; // domyślnie — tylko planetoidy
    try {
      const stored = localStorage.getItem(ORBIT_STORAGE_KEY);
      if (stored && ORBIT_MODES.includes(stored)) {
        this._orbitMode = stored;
      }
    } catch (e) { /* cicho */ }
    // Wyemituj interwał przy starcie (SaveSystem nasłuchuje)
    this._emitAutosaveInterval();
    // Wyemituj filtr orbit przy starcie (ThreeRenderer nasłuchuje)
    this._emitOrbitFilter();
  }

  // ── Getter: czy menu otwarte ──
  get menuOpen() { return this._menuOpen; }

  // ── Toggle menu (ESC) ──
  toggleMenu() {
    this._menuOpen = !this._menuOpen;
    this._syncDomMenu();
  }

  // ── Rysowanie ───────────────────────────────────────────
  draw(ctx, W, H, state) {
    this._lastState = state; // zachowaj do DOM menu
    const { stability, logEntries, audioEnabled, musicEnabled, autoSlow, civMode } = state;
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
    ctx.fillText(t('bottomBar.stab'), 10, textY);

    ctx.fillStyle = tColor;
    ctx.fillText(`${score}${arrow}`, 46, textY);

    // Mini-pasek stabilności
    const sBarX = 80, sBarW = 50, sBarH = 5;
    const sBarY = textY - 4;
    ctx.fillStyle = THEME.bgTertiary;
    ctx.fillRect(sBarX, sBarY, sBarW, sBarH);
    const sFillW = Math.round((score / 100) * sBarW);
    if (sFillW > 0) {
      ctx.fillStyle = score >= 70 ? THEME.successDim : score >= 40 ? THEME.yellow : THEME.dangerDim;
      ctx.fillRect(sBarX, sBarY, sFillW, sBarH);
    }
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(sBarX, sBarY, sBarW, sBarH);

    // ── Sekcja centralna: EventLog (inline) ──
    const logX = 140;
    const logW = W - 240; // więcej miejsca (był W-340)
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
    const expandBtnX = logX - 14;
    ctx.fillStyle = this._expanded ? C.title : C.label;
    ctx.fillText(this._expanded ? '▼' : '▲', expandBtnX, textY);

    // ── Sekcja prawa: przycisk MENU ──
    this._drawMenuButton(ctx, W, H, textY);

    // Hint (jeśli nie civMode)
    if (!civMode) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.label;
      ctx.fillText(t('ui.hintControls'), 10, barY + BAR_H - 4);
    }

    // Panel MENU — DOM overlay (nad wszystkimi canvasami)
    this._syncDomMenu();
  }

  // Synchronizuj widoczność DOM panelu menu
  _syncDomMenu() {
    if (this._menuOpen) {
      this._showDomMenu();
    } else {
      this._hideDomMenu();
    }
  }

  // Pokaż DOM menu (tworzy jeśli nie istnieje, odświeża zawartość tylko raz)
  _showDomMenu() {
    if (!this._domMenu) this._createDomMenu();
    if (this._domMenu.style.display !== 'block') {
      // Odśwież zawartość tylko przy otwieraniu (nie co klatkę)
      this._updateDomMenu();
    }
    this._domMenu.style.display = 'block';
  }

  _hideDomMenu() {
    if (this._domMenu) this._domMenu.style.display = 'none';
  }

  _createDomMenu() {
    const el = document.createElement('div');
    el.className = 'kosmos-menu-panel';
    el.style.cssText = `
      position: fixed; z-index: 100; display: none;
      bottom: ${BAR_H + 4}px; right: 6px;
      width: ${MENU_W}px; padding: ${MENU_PAD}px 0;
      background: rgba(2,4,5,0.96);
      border: 1px solid ${THEME.borderActive};
      font-family: ${THEME.fontFamily};
      pointer-events: auto; user-select: none;
    `;
    // Kliknięcia w panelu nie propagują się do event-layer
    el.addEventListener('mousedown', e => e.stopPropagation());
    el.addEventListener('click', e => e.stopPropagation());
    document.body.appendChild(el);
    this._domMenu = el;
  }

  _updateDomMenu() {
    if (!this._domMenu) return;
    const audioEnabled = this._lastState?.audioEnabled ?? true;
    const musicEnabled = this._lastState?.musicEnabled ?? true;
    const rows = this._getMenuRows(audioEnabled, musicEnabled);

    let html = '';
    rows.forEach((row, i) => {
      const sep = i < rows.length - 1
        ? `border-bottom: 1px solid ${THEME.border};` : '';
      const valHtml = row.value !== undefined
        ? `<span style="color:${row.valueOn ? THEME.success : THEME.dangerDim};font-size:${THEME.fontSizeSmall}px">${row.value}</span>`
        : '';
      html += `<div data-idx="${i}" style="
        display:flex; justify-content:space-between; align-items:center;
        padding: 4px 12px; height:${MENU_ROW_H}px; box-sizing:border-box;
        cursor:pointer; color:${THEME.textSecondary}; font-size:${THEME.fontSizeNormal}px;
        ${sep}
      " onmouseenter="this.style.background='${THEME.accentDim}';this.style.color='${THEME.textPrimary}'"
         onmouseleave="this.style.background='transparent';this.style.color='${THEME.textSecondary}'"
      ><span>${row.label}</span>${valHtml}</div>`;
    });
    this._domMenu.innerHTML = html;

    // Dodaj click handlery
    this._domMenu.querySelectorAll('[data-idx]').forEach(div => {
      div.addEventListener('click', () => {
        const idx = parseInt(div.dataset.idx);
        const r = rows[idx];
        if (!r) return;
        this._executeMenuAction(r.id);
      });
    });
  }

  _executeMenuAction(actionId) {
    switch (actionId) {
      case 'newGame':
        this._menuOpen = false;
        this._syncDomMenu();
        EventBus.emit('ui:confirmNew');
        break;
      case 'save':
        EventBus.emit('game:save');
        this._menuOpen = false;
        this._syncDomMenu();
        break;
      case 'autosave':
        this._cycleAutosave();
        this._updateDomMenu(); // odśwież wartość
        break;
      case 'orbits':
        this._cycleOrbitMode();
        this._updateDomMenu();
        break;
      case 'music':
        EventBus.emit('music:toggle');
        // Wartości odświeżą się przy następnym otwarciu
        setTimeout(() => this._updateDomMenu(), 50);
        break;
      case 'sfx':
        EventBus.emit('audio:toggle');
        setTimeout(() => this._updateDomMenu(), 50);
        break;
    }
  }

  // Rysuj panel MENU — stub (menu jest teraz DOM, nie canvas)
  drawMenu() { /* noop — DOM menu zarządzane przez _syncDomMenu() */ }

  // ── Przycisk MENU w prawym rogu paska ──
  _drawMenuButton(ctx, W, H, textY) {
    const btnW = 64;
    const btnH = 20;
    const btnX = W - btnW - 6;
    const btnY = H - BAR_H + 3;

    // Tło przycisku
    ctx.fillStyle = this._menuOpen ? THEME.accentMed : THEME.bgTertiary;
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeStyle = this._menuOpen ? THEME.borderActive : THEME.borderLight;
    ctx.lineWidth = 1;
    ctx.strokeRect(btnX, btnY, btnW, btnH);

    // Tekst
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = this._menuOpen ? THEME.accent : C.bright;
    ctx.textAlign = 'center';
    ctx.fillText(t('ui.menu'), btnX + btnW / 2, textY);
    ctx.textAlign = 'left';
  }

  // ── Definicje wierszy menu ──
  _getMenuRows(audioEnabled, musicEnabled) {
    const autosaveLabel = this._getAutosaveLabel();
    const autosaveOn = this._autosaveOption !== 'off';
    const orbitLabel = this._getOrbitLabel();
    return [
      { id: 'newGame', label: t('menu.newGame') },
      { id: 'save',    label: t('menu.save') },
      { id: 'autosave', label: t('menu.autosave'), value: autosaveLabel, valueOn: autosaveOn },
      { id: 'orbits',   label: t('menu.orbits'), value: orbitLabel, valueOn: true },
      { id: 'music',   label: t('menu.music'), value: musicEnabled ? t('menu.on') : t('menu.off'), valueOn: musicEnabled },
      { id: 'sfx',     label: t('menu.sfx'),   value: audioEnabled ? t('menu.on') : t('menu.off'), valueOn: audioEnabled },
    ];
  }

  _getAutosaveLabel() {
    switch (this._autosaveOption) {
      case 'off':   return t('menu.autosaveOff');
      case 'month': return t('menu.autosaveMonth');
      case 'year':  return t('menu.autosaveYear');
      case '10y':   return t('menu.autosave10y');
      default:      return t('menu.autosaveYear');
    }
  }

  // Hit test TYLKO panelu menu + przycisku MENU (priorytet nad overlayami)
  // DOM menu obsługuje swoje kliknięcia — tu zamykamy na klik poza menu
  hitTestMenu(x, y, W, H) {
    if (!this._menuOpen) return false;

    // Klik w obszarze DOM menu — pochłoń (DOM sam obsłuży)
    const menuX = W - MENU_W - 6;
    const menuY = H - BAR_H - MENU_H - 4;
    if (x >= menuX && x <= menuX + MENU_W && y >= menuY && y <= menuY + MENU_H) {
      return true;
    }

    // Przycisk MENU (toggle zamknij)
    const btnW = 64;
    const btnX = W - btnW - 6;
    const barY = H - BAR_H;
    if (y >= barY && x >= btnX && x <= btnX + btnW) {
      this._menuOpen = false;
      this._syncDomMenu();
      return true;
    }

    // Klik poza menu — zamknij
    this._menuOpen = false;
    this._syncDomMenu();
    return false;
  }

  // ── Hit testing ──────────────────────────────────────────
  hitTest(x, y, W, H, audioEnabled, musicEnabled, autoSlow) {
    // Panel menu otwarty — zamknij przy kliknięciu poza nim
    if (this._menuOpen) {
      this._menuOpen = false;
      this._syncDomMenu();
      // Kontynuuj — sprawdź czy kliknięto w pasek dolny
    }

    const barY = H - BAR_H;
    if (y < barY) {
      // Rozwinięty EventLog
      if (this._expanded) {
        const expandedH = LOG_EXPANDED * 14 + 8;
        if (y >= barY - expandedH) return true; // pochłoń klik w rozw. logu
      }
      return false;
    }

    // Przycisk MENU
    const btnW = 64;
    const btnX = W - btnW - 6;
    if (x >= btnX && x <= btnX + btnW) {
      this._menuOpen = !this._menuOpen;
      this._syncDomMenu();
      this._hoverRow = -1;
      return true;
    }

    // Przycisk rozwinięcia EventLog
    const logExpandX = 126;
    if (x >= logExpandX - 8 && x <= logExpandX + 12) {
      this._expanded = !this._expanded;
      return true;
    }

    return true; // pochłoń klik w pasku dolnym
  }

  // ── Cyklowanie opcji autozapisu ──
  _cycleAutosave() {
    const idx = AUTOSAVE_OPTIONS.indexOf(this._autosaveOption);
    this._autosaveOption = AUTOSAVE_OPTIONS[(idx + 1) % AUTOSAVE_OPTIONS.length];
    try {
      localStorage.setItem(AUTOSAVE_STORAGE_KEY, this._autosaveOption);
    } catch (e) { /* cicho */ }
    this._emitAutosaveInterval();
  }

  _emitAutosaveInterval() {
    const interval = AUTOSAVE_INTERVALS[this._autosaveOption] || 0;
    EventBus.emit('autosave:intervalChanged', { interval });
  }

  // ── Cyklowanie trybu orbit ──
  _cycleOrbitMode() {
    const idx = ORBIT_MODES.indexOf(this._orbitMode);
    this._orbitMode = ORBIT_MODES[(idx + 1) % ORBIT_MODES.length];
    try {
      localStorage.setItem(ORBIT_STORAGE_KEY, this._orbitMode);
    } catch (e) { /* cicho */ }
    this._emitOrbitFilter();
  }

  _emitOrbitFilter() {
    EventBus.emit('orbits:filterChanged', { mode: this._orbitMode });
  }

  _getOrbitLabel() {
    switch (this._orbitMode) {
      case 'all':            return t('menu.orbitsAll');
      case 'planets_moons':  return t('menu.orbitsPlanets');
      case 'planetoids':     return t('menu.orbitsPlanetoids');
      case 'none':           return t('menu.orbitsNone');
      default:               return t('menu.orbitsPlanetoids');
    }
  }

  // ── Hover tracking (wywoływany z UIManager) ──
  // DOM menu obsługuje hover samodzielnie — tu tylko reset _hoverRow
  handleMouseMove() {
    this._hoverRow = -1;
  }

  // Sprawdza czy punkt jest nad BottomBar (lub otwartym menu)
  isOver(x, y, W, H) {
    const barY = H - BAR_H;
    if (y >= barY) return true;
    // Otwarty panel menu
    if (this._menuOpen) {
      const menuX = W - MENU_W - 6;
      const menuY = H - BAR_H - MENU_H - 4;
      if (x >= menuX && x <= menuX + MENU_W && y >= menuY && y <= menuY + MENU_H) return true;
    }
    // Rozwinięty EventLog
    if (this._expanded) {
      const expandedH = LOG_EXPANDED * 14 + 8;
      if (y >= barY - expandedH) return true;
    }
    return false;
  }
}
