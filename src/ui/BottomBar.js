// BottomBar — cienki pasek dolny (26px): stabilność + EventLog + przycisk MENU
//
// Zastępuje: _drawStabilityBar(), _drawEventLog(), _drawGameButtons(), _drawHint()
// Zintegrowane w jednym pasku na dole ekranu.
// Przycisk MENU otwiera panel z opcjami: Nowa gra, Zapisz, Autozapis, Muzyka, Dźwięki.

import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import { COSMIC }         from '../config/LayoutConfig.js';
import EventBus            from '../core/EventBus.js';
import { t, getLocale }   from '../i18n/i18n.js';
import { showAutoPauseSettings } from './AutoPauseSettingsModal.js';
import { toggleNotificationDropdown, isNotificationDropdownOpen } from './NotificationDropdown.js';
import { TIME_W } from './TopBar.js';

const BAR_H = COSMIC.BOTTOM_BAR_H; // 26px
const LOG_INLINE = 2; // ile wpisów widocznych inline w zwiniętym pasku

// Kolory per severity (info/warn/alert) — używane do wyróżnienia ważnych wpisów
function _severityColor(sev) {
  if (sev === 'alert') return THEME.danger;
  if (sev === 'warn')  return THEME.warning;
  return null; // info → kolor domyślny z THEME
}

// Wymiary panelu MENU
const MENU_W = 220;
const MENU_ROW_H = 28;
const MENU_PAD = 8;
const MENU_ROWS = 8; // Nowa gra, Zapisz, Autozapis, Auto-pauza, Orbity, Radar, Muzyka, Dźwięki
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
    // Opcja B/3: rozwinięcie dziennika = osobny pełnoekranowy overlay (klawisz L).
    // Przycisk ▲ deleguje otwarcie do OverlayManager — BottomBar nie rysuje już
    // żadnego rozwiniętego panelu sam.
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
    const { stability, logSystem, logEntriesFallback, audioEnabled, musicEnabled, autoSlow, civMode } = state;
    const barY = H - BAR_H;

    // Czy tryb Generator (stabilność widoczna)
    const isGenerator = window.KOSMOS?.scenario === 'generator';

    // EventLog → EventLogDrawer (hover-drawer dolnej krawędzi). Bell/MENU → prawy górny róg.
    // W civMode dolny pasek NIE rysuje tła — dolna krawędź to czysty trigger EventLogDrawer
    // (nad sceną 3D, ten sam kolor co pozostałe triggery). Tło + stabilność tylko w Generatorze.
    if (!civMode) {
      ctx.fillStyle = bgAlpha(0.40);
      ctx.fillRect(0, barY, W, BAR_H);
      ctx.strokeStyle = GLASS_BORDER;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, barY); ctx.lineTo(W, barY); ctx.stroke();

      const textY = barY + 19;
      if (isGenerator) {
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
      }
    }

    // ── Klaster prawego GÓRNEGO rogu — bell 🔔 + MENU (+ chip walk), na lewo od chipa czasu.
    // Przeniesione z dolnego paska: BottomBar (dół) jest teraz tylko obszarem triggera
    // EventLogDrawer. Pozycje liczone od lewej krawędzi chipa czasu (W − TIME_W).
    const clTopY = 6;     // górny rząd (jak przyciski chipa czasu)
    const clBtnH = 20;
    const chipLeft = W - TIME_W;
    const menuBtnW = 64;
    const menuBtnX = chipLeft - menuBtnW - 8;
    const bellBtnW = 38;
    const bellBtnX = menuBtnX - bellBtnW - 4;
    this._bellClickBounds = { x: bellBtnX, y: clTopY, w: bellBtnW, h: clBtnH };
    this._menuClickBounds = { x: menuBtnX, y: clTopY, w: menuBtnW, h: clBtnH };

    // Chip „⚔ Walki [N]" — gdy CombatHUD zminimalizowany i DSCS ma active encounters.
    const combatHud = window.KOSMOS?.combatHud;
    if (combatHud?.isMinimized?.() && combatHud?.hasActiveEncounters?.()) {
      const dscs = window.KOSMOS?.deepSpaceCombatSystem;
      const n = dscs?.listActive?.()?.length ?? 0;
      const chipLabel = n > 1 ? `⚔ Walki [${n}]` : '⚔ Walki';
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const combatChipW = Math.ceil(ctx.measureText(chipLabel).width) + 14;
      const combatChipX = bellBtnX - combatChipW - 6;
      this._combatChipClickBounds = { x: combatChipX, y: clTopY, w: combatChipW, h: clBtnH, label: chipLabel };
    } else {
      this._combatChipClickBounds = null;
    }

    this._logClickBounds = null;  // EventLog → EventLogDrawer

    if (this._combatChipClickBounds) this._drawCombatChip(ctx, this._combatChipClickBounds, clTopY + 14);
    this._drawBellButton(ctx, bellBtnX, clTopY, bellBtnW, clBtnH, clTopY + 14);
    this._drawMenuButton(ctx, menuBtnX, clTopY, menuBtnW, clBtnH);

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
    // Pozycja: prawy górny róg, pod przyciskiem MENU (skala logiczne→ekran).
    const scale = window.KOSMOS?.uiScale ?? 1;
    const m = this._menuClickBounds;
    const rightPx = m ? Math.max(6, Math.round(window.innerWidth - (m.x + m.w) * scale)) : 6;
    const topPx = Math.round(((m ? m.y + m.h : COSMIC.TOP_BAR_H) + 4) * scale);
    this._domMenu.style.right  = `${rightPx}px`;
    this._domMenu.style.top    = `${topPx}px`;
    this._domMenu.style.bottom = 'auto';
    this._domMenu.style.left   = 'auto';
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
      top: 50px; right: 6px;
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
      case 'autopause':
        showAutoPauseSettings();
        this._menuOpen = false;
        this._syncDomMenu();
        break;
      case 'orbits':
        this._cycleOrbitMode();
        this._updateDomMenu();
        break;
      case 'radar':
        this._toggleSensorOverlay();
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

  // ── Chip „⚔ Walki [N]" — restoreuje zminimalizowany CombatHUD ──
  _drawCombatChip(ctx, b, textY) {
    ctx.fillStyle = THEME.accentMed ?? 'rgba(60, 60, 60, 0.6)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = THEME.danger ?? '#ff4466';
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.danger ?? '#ff4466';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x + b.w / 2, textY);
    ctx.textAlign = 'left';
  }

  // ── Przycisk bell (🔔 + badge count) — silent notifications ──
  // Stan żyje w window.KOSMOS.notificationCenter. Klik toggle DOM dropdown.
  _drawBellButton(ctx, x, y, w, h, textY) {
    const nc = window.KOSMOS?.notificationCenter;
    const count = nc?.getActiveCount?.() ?? 0;
    const open = isNotificationDropdownOpen();

    // Tło przycisku (subtelne — dzwonek ma być akcentem ikony, nie ramki)
    if (open) {
      ctx.fillStyle = THEME.accentMed;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = THEME.borderActive;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
    }

    // Ikona dzwonka — emoji
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = count > 0 ? THEME.accent : THEME.textSecondary;
    ctx.textAlign = 'center';
    ctx.fillText('🔔', x + w / 2, textY);
    ctx.textAlign = 'left';

    // Badge z licznikiem (top-right na ikonie)
    if (count > 0) {
      const cx = x + w - 8;
      const cy = y + 4;
      const r = 7;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = THEME.danger;
      ctx.fill();
      ctx.strokeStyle = THEME.bgPrimary;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = THEME.textPrimary;
      ctx.font = `bold ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(count > 99 ? '99+' : String(count), cx, cy + 0.5);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
    }
  }

  // ── Przycisk MENU (prawy górny róg, obok chipa czasu) — tylko tekst (t('ui.menu')
  //    zawiera już ikonę „☰ MENU"), bez ramki/tła. Podświetlenie tekstu gdy otwarte. ──
  _drawMenuButton(ctx, x, y, w, h) {
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = this._menuOpen ? THEME.accent : C.bright;
    ctx.textAlign = 'center';
    ctx.fillText(t('ui.menu'), x + w / 2, y + h / 2 + 4);
    ctx.textAlign = 'left';
  }

  // ── Definicje wierszy menu ──
  _getMenuRows(audioEnabled, musicEnabled) {
    const autosaveLabel = this._getAutosaveLabel();
    const autosaveOn = this._autosaveOption !== 'off';
    const orbitLabel = this._getOrbitLabel();
    const pl = getLocale() === 'pl';
    const apSys = window.KOSMOS?.autoPauseSystem;
    const apEnabled = apSys ? apSys.isEnabled() : true;
    const apLabel = pl ? 'Auto-pauza...' : 'Auto-pause...';
    const apValue = apEnabled ? (pl ? 'WŁ' : 'ON') : (pl ? 'WYŁ' : 'OFF');
    // M4 P2 — radar toggle (window.KOSMOS.uiPrefs.sensorOverlayVisible)
    const radarOn = window.KOSMOS?.uiPrefs?.sensorOverlayVisible === true;
    return [
      { id: 'newGame', label: t('menu.newGame') },
      { id: 'save',    label: t('menu.save') },
      { id: 'autosave', label: t('menu.autosave'), value: autosaveLabel, valueOn: autosaveOn },
      { id: 'autopause', label: apLabel, value: apValue, valueOn: apEnabled },
      { id: 'orbits',   label: t('menu.orbits'), value: orbitLabel, valueOn: true },
      { id: 'radar',   label: t('menu.radar'),  value: radarOn ? t('menu.on') : t('menu.off'), valueOn: radarOn },
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

  // Hit test przy otwartym DOM menu (priorytet nad overlayami). DOM menu pochłania
  // własne kliki (stopPropagation), więc każdy klik docierający tu jest POZA menu →
  // zamykamy. Wyjątek: klik w przycisk MENU (prawy górny róg) = jawny toggle off.
  hitTestMenu(x, y, W, H) {
    if (!this._menuOpen) return false;
    const m = this._menuClickBounds;
    if (m && x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) {
      this._menuOpen = false; this._syncDomMenu(); return true;
    }
    // Klik poza menu (canvas) — zamknij, ale nie pochłaniaj (klik wykona swoją akcję).
    this._menuOpen = false; this._syncDomMenu(); return false;
  }

  // ── Klik w klaster prawego górnego rogu (MENU / chip walk / bell). True = obsłużono. ──
  // Wołane też z UIManager.handleClick PRZED overlayManager (priorytet, dostępne zawsze).
  _hitTestTopButtons(x, y) {
    const m = this._menuClickBounds;
    if (m && x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) {
      this._menuOpen = !this._menuOpen;
      this._syncDomMenu();
      this._hoverRow = -1;
      return true;
    }
    const cc = this._combatChipClickBounds;
    if (cc && x >= cc.x && x <= cc.x + cc.w && y >= cc.y && y <= cc.y + cc.h) {
      window.KOSMOS?.combatHud?.toggleMinimize?.();
      return true;
    }
    const b = this._bellClickBounds;
    if (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      // bellRect+scale → NotificationDropdown rozpozna klik w bell (pominie close,
      // uniknie close+reopen). topY → dropdown rozwija się W DÓŁ poniżej bella.
      toggleNotificationDropdown({
        anchorX: b.x + b.w / 2, anchorY: b.y, barH: BAR_H,
        bellRect: { x: b.x, y: b.y, w: b.w, h: b.h },
        topY: b.y + b.h + 4,
        scale: window.KOSMOS?.uiScale ?? 1,
      });
      return true;
    }
    return false;
  }

  // ── Hit testing ──────────────────────────────────────────
  hitTest(x, y, W, H, audioEnabled, musicEnabled, autoSlow) {
    // Klaster prawego górnego rogu (bell/MENU/combat) — przeniesiony z dolnego paska.
    if (this._hitTestTopButtons(x, y)) return true;

    // Klik poza klastrem przy otwartym menu → zamknij menu (kontynuuj).
    if (this._menuOpen) { this._menuOpen = false; this._syncDomMenu(); }

    const barY = H - BAR_H;
    if (y < barY) return false;
    return true; // pochłoń klik w pasku dolnym (obszar triggera EventLogDrawer)
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

  // ── Toggle radar (M4 P2) ──────────────────────────────────────────────
  // Stan żyje w window.KOSMOS.uiPrefs.sensorOverlayVisible (persistowane w save
  // v70+). BottomBar tylko flipuje i emituje. ThreeRenderer reaguje na event.
  _toggleSensorOverlay() {
    if (!window.KOSMOS) return;
    window.KOSMOS.uiPrefs = window.KOSMOS.uiPrefs ?? {};
    const next = !window.KOSMOS.uiPrefs.sensorOverlayVisible;
    window.KOSMOS.uiPrefs.sensorOverlayVisible = next;
    EventBus.emit('ui:sensorOverlayToggle', { visible: next });
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

  // Sprawdza czy punkt jest nad BottomBar. W civMode dolny pasek nie istnieje (dolna
  // krawędź = trigger EventLogDrawer, który blokuje kamerę przez własny isOver w isOverUI);
  // bell/MENU w górnym pasku blokuje TopBar.isOver. Poza civMode (Generator) — dolny pasek.
  isOver(x, y, W, H) {
    if (window.KOSMOS?.civMode) return false;
    return y >= (H - BAR_H);
  }
}

// ── Helper: kolor wpisu (severity > type > default) ───────────────────────────
// Eksport lokalny dla BottomBar — używa THEME.
function _entryColor(entry) {
  const sevColor = _severityColor(entry.severity);
  if (sevColor) return sevColor;
  // Info → kolor wg kanału (fleet info niebieskawy, civ zielony itp.)
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
