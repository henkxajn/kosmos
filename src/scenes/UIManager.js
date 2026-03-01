// UIManager — zarządzanie interfejsem gry na Canvas 2D
// Zastępuje UIScene.js (Phaser) + wszystkie panele UI
//
// Rysuje na #ui-canvas nakładanym nad Three.js.
// Obsługuje kliknięcia przez metodę handleClick(x, y) zwracającą true/false.
// Wszystkie dane UI aktualizowane przez EventBus.

import EventBus    from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { TECHS, TECH_BRANCHES } from '../data/TechData.js';
import { BUILDINGS, RESOURCE_ICONS, formatRates, formatCost } from '../data/BuildingsData.js';
import { SHIPS } from '../data/ShipsData.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { showRenameModal } from '../ui/ModalInput.js';
import { showTransportModal } from '../ui/TransportModal.js';
import { DistanceUtils }     from '../utils/DistanceUtils.js';

// Wymiary fizyczne canvas (piksele urządzenia)
const _PW = window.innerWidth;
const _PH = window.innerHeight;
// Skala UI względem bazowego 1280×720 — automatycznie skaluje tekst i panele
const UI_SCALE = Math.min(_PW / 1280, _PH / 720);
// Wymiary logiczne (używane w kodzie rysującym — niezależne od DPI/rozdzielczości)
const W = Math.round(_PW / UI_SCALE);
const H = Math.round(_PH / UI_SCALE);

// ── Kolory i style UI ────────────────────────────────────────
const C = {
  bg:       '#060d18',
  border:   '#1a3050',
  title:    '#88ffcc',
  label:    '#2a4060',
  text:     '#6888aa',
  bright:   '#c8e8ff',
  green:    '#44ff88',
  red:      '#ff4444',
  orange:   '#ffaa44',
  yellow:   '#ffcc44',
  blue:     '#4488ff',
  purple:   '#cc88ff',
  mint:     '#44ffaa',
};

// Kolory zdarzeń EventLog
const LOG_COLORS = {
  collision_absorb:   '#ffcc44',
  collision_destroy:  '#ff6644',
  collision_redirect: '#ff9933',
  ejection:           '#cc88ff',
  new_planet:         '#88ffcc',
  life_good:          '#44ff88',
  life_bad:           '#ff4488',
  info:               '#6888aa',
  auto_slow:          '#ffaa44',
  disk_phase:         '#88aaff',
  civ_epoch:          '#ffcc88',
  civ_unrest:         '#ff4444',
  civ_famine:         '#ff8800',
  expedition_ok:      '#44ffaa',
  expedition_fail:    '#ff6644',
  pop_born:           '#44ff88',
  pop_died:           '#ff4444',
};

// Koszty akcji gracza (zsynchronizowane z PlayerActionSystem)
const ACTION_COSTS = { stabilize: 25, nudgeToHz: 35, bombard: 20 };

// ── CivPanel — panel informacyjny cywilizacji ────────────────────────
const CIV_SIDEBAR_W    = 40;   // szerokość pionowego paska ikon
const CIV_SIDEBAR_BTN  = 36;   // wysokość jednego przycisku ikony
const CIV_SIDEBAR_GAP  = 2;    // przerwa między przyciskami
const CIV_SIDEBAR_PAD  = 2;    // padding górny w sidebarze
const CIV_PANEL_BODY_H = 220;  // wysokość treści (rozszerzone dla kolonii)
const CIV_PANEL_Y      = 44;   // pozycja Y (pod ResourcePanel)

// Zakładki CivPanel — pionowy sidebar z ikonami sci-fi
const CIV_TABS = [
  { id: 'economy',     icon: '⚙', label: 'Gospodarka' },
  { id: 'tech',        icon: '🧬', label: 'Technologie' },
  { id: 'buildings',   icon: '🔧', label: 'Budowle' },
  { id: 'expeditions', icon: '🚀', label: 'Ekspedycje' },
];

// Maksymalne wartości składników morale (do rysowania pasków)
const MORALE_MAX = { housing: 20, food: 20, water: 15, energy: 15, employment: 15, safety: 15 };
const MORALE_LABELS = {
  housing: '🏠 Mieszkania', food: '🌿 Żywność', water: '💧 Woda',
  energy: '⚡ Energia', employment: '👷 Zatrudnienie', safety: '🛡 Bezpiecz.',
};

// ── Tooltip CivPanel ────────────────────────────────────────────
const TOOLTIP_PAD    = 8;     // margines wewnętrzny
const TOOLTIP_MAX_W  = 260;   // maks szerokość
const TOOLTIP_LINE_H = 13;    // wysokość wiersza
const TOOLTIP_HDR_H  = 16;    // wysokość nagłówka
const TOOLTIP_SEP_H  = 8;     // separator (z marginesami)
const TOOLTIP_WRAP   = 30;    // maks znaków na wiersz (word-wrap)
const TOOLTIP_OFS    = 14;    // offset od kursora

export class UIManager {
  constructor(uiCanvas) {
    // Ustaw fizyczny rozmiar canvas (piksele urządzenia, nie logiczne)
    uiCanvas.width  = _PW;
    uiCanvas.height = _PH;
    this.canvas = uiCanvas;
    this.ctx    = uiCanvas.getContext('2d');

    // ── Stan UI ───────────────────────────────────────────────
    this._selectedEntity  = null;
    this._infoPanelTab    = 'orbit';  // 'orbit' | 'physics' | 'composition'
    this._stability       = { score: 50, trend: 'stable' };
    this._timeState       = { isPaused: false, multiplierIndex: 1, displayText: 'Rok 0, dzień 0', autoSlow: true };
    this._diskPhase       = 'DISK';
    this._diskPhasePL     = 'Dysk';
    this._energy          = 0;
    this._energyMax       = 100;
    this._hoverAction     = null;
    this._audioEnabled    = true;
    this._notifications   = [];    // { text, alpha, endTime }
    this._confirmDialog   = null;  // { visible, type }

    // ── Stan zasobów (4X) ─────────────────────────────────────
    this._resources = { minerals: 0, energy: 0, organics: 0, water: 0, research: 0 };
    this._resCap    = { minerals: 500, energy: 500, organics: 500, water: 500, research: 1000 };
    this._resDelta  = { minerals: 0, energy: 0, organics: 0, water: 0, research: 0 };

    // ── Stan ekspedycji ───────────────────────────────────────
    this._expeditions = [];     // lista aktywnych ekspedycji
    this._expPanelOpen = false;

    // ── Stan CivPanel (panel informacyjny cywilizacji) ──────
    this._civPanelTab = 'economy'; // 'economy' | 'tech' | 'buildings' | null (zwinięty)
    this._civData     = null;      // snapshot z civ:populationChanged
    this._moraleData  = null;      // snapshot z civ:moraleChanged

    // ── EventLog ──────────────────────────────────────────────
    this._logEntries = [];      // { year, text, color }
    this._logYear    = 0;

    // ── Hover buttonów ────────────────────────────────────────
    this._hoveredBtn = null;

    // ── Tooltip CivPanel ────────────────────────────────────
    this._tooltip       = null;  // { type, data, x, y } lub null
    this._tooltipMouseX = 0;
    this._tooltipMouseY = 0;

    this._setupEvents();
    this._startDrawLoop();
  }

  // ── EventBus ──────────────────────────────────────────────────
  _setupEvents() {
    // Czas
    EventBus.on('time:stateChanged', ({ isPaused, multiplierIndex }) => {
      this._timeState.isPaused          = isPaused;
      this._timeState.multiplierIndex   = multiplierIndex;
    });
    EventBus.on('time:display', ({ displayText, multiplierIndex, autoSlow }) => {
      this._timeState.displayText       = displayText;
      this._timeState.multiplierIndex   = multiplierIndex;
      this._timeState.autoSlow          = autoSlow;
    });

    // Stabilność
    EventBus.on('system:stabilityChanged', ({ score, trend }) => {
      this._stability = { score, trend };
    });

    // Faza dysku
    EventBus.on('disk:phaseChanged', ({ newPhase, newPhasePL }) => {
      this._diskPhase   = newPhase;
      this._diskPhasePL = newPhasePL;
    });

    // Zaznaczenie
    EventBus.on('body:selected', ({ entity }) => {
      this._selectedEntity = entity;
      if (this._infoPanelTab === 'composition' && !entity.composition) {
        this._infoPanelTab = 'orbit';
      }
    });
    EventBus.on('body:deselected', () => { this._selectedEntity = null; });
    EventBus.on('player:planetUpdated', ({ planet }) => {
      if (this._selectedEntity?.id === planet.id) this._selectedEntity = planet;
    });
    EventBus.on('planet:compositionChanged', ({ planet }) => {
      if (this._selectedEntity?.id === planet.id) this._selectedEntity = planet;
    });
    EventBus.on('body:collision', () => {
      // Po kolizji zaznaczona planeta mogła zostać usunięta
    });

    // Energia gracza
    EventBus.on('player:energyChanged', ({ energy, max }) => {
      this._energy    = energy;
      this._energyMax = max;
    });

    // Zasoby 4X — ResourceSystem emituje { resources: { key: { amount, capacity, perYear } } }
    const _applyResources = ({ resources }) => {
      if (!resources) return;
      for (const [key, res] of Object.entries(resources)) {
        this._resources[key] = res.amount   ?? 0;
        this._resDelta[key]  = res.perYear  ?? 0;
        this._resCap[key]    = res.capacity ?? 500;
      }
    };
    EventBus.on('resource:changed',  _applyResources);
    EventBus.on('resource:snapshot', _applyResources);
    EventBus.on('resource:shortage', ({ resource }) => {
      this._flashResource(resource);
    });

    // CivPanel — cache danych cywilizacji
    EventBus.on('civ:populationChanged', (data) => { this._civData = data; });
    EventBus.on('civ:moraleChanged',     (data) => { this._moraleData = data; });

    // Powiadomienia o badaniach (tech)
    EventBus.on('tech:researched', ({ tech, restored }) => {
      if (!restored) this.addInfo(`Zbadano: ${tech.namePL}`);
    });
    EventBus.on('tech:researchFailed', ({ techId, reason }) => {
      this.addInfo(`Badanie: ${reason}`);
    });

    // Ekspedycje
    EventBus.on('expedition:launched', ({ expedition }) => {
      this._expeditions.push(expedition);
    });
    EventBus.on('expedition:arrived',  ({ expedition }) => {
      this._expeditions = this._expeditions.filter(e => e.id !== expedition.id);
    });
    EventBus.on('expedition:disaster', ({ expedition }) => {
      this._expeditions = this._expeditions.filter(e => e.id !== expedition.id);
    });
    EventBus.on('expedition:returned', ({ expedition }) => {
      this._expeditions = this._expeditions.filter(e => e.id !== expedition.id);
    });

    // Flota — powiadomienia o budowie statków
    EventBus.on('fleet:buildStarted', ({ shipId }) => {
      const ship = SHIPS[shipId];
      this._addNotification(`⚓ Stocznia: budowa ${ship?.namePL ?? shipId}`);
    });
    EventBus.on('fleet:shipCompleted', ({ shipId }) => {
      const ship = SHIPS[shipId];
      this._addNotification(`✅ Statek gotowy: ${ship?.icon ?? '🚀'} ${ship?.namePL ?? shipId}`);
    });
    EventBus.on('fleet:buildFailed', ({ reason }) => {
      this._addNotification(`⚠ Stocznia: ${reason}`);
    });

    // Autosave
    EventBus.on('game:saved', ({ gameTime }) => {
      const y = Math.round(gameTime).toLocaleString('pl-PL');
      this._addNotification(`\u{1F4BE} Zapisano (${y} lat)`);
    });

    // EventLog subskrypcje
    this._setupLogEvents();
  }

  _setupLogEvents() {
    EventBus.on('time:display', ({ displayText }) => {
      const m = displayText.match(/Rok\s+([\d\s,]+)/);
      if (m) this._logYear = parseInt(m[1].replace(/[\s,]/g, '')) || this._logYear;
    });

    EventBus.on('body:collision', ({ winner, loser, type }) => {
      const smallTypes = new Set(['asteroid', 'comet', 'planetesimal', 'planetoid']);
      if (loser && smallTypes.has(loser.type)) return;
      if (type === 'absorb') {
        this._log(`${winner?.name ?? '?'} pochłonął ${loser?.name ?? '?'}`, 'collision_absorb');
      } else if (type === 'redirect') {
        this._log(`Zderzenie: ${winner?.name ?? '?'} ↔ ${loser?.name ?? '?'}`, 'collision_redirect');
      } else if (type === 'eject') {
        this._log(`${loser?.name ?? '?'} wyrzucona!`, 'ejection');
      }
    });

    EventBus.on('planet:ejected', ({ planet }) => {
      this._log(`${planet.name} wyrzucona z układu`, 'ejection');
    });

    EventBus.on('accretion:newPlanet', (planet) => {
      this._log(`Nowa planeta: ${planet.name}`, 'new_planet');
    });

    EventBus.on('life:emerged', ({ planet }) => {
      this._log(`Życie na ${planet.name}!`, 'life_good');
    });
    EventBus.on('life:evolved', ({ planet, stage }) => {
      this._log(`${planet.name}: ${stage.label}`, 'life_good');
    });
    EventBus.on('life:extinct', ({ planet }) => {
      this._log(`Wymieranie na ${planet.name}`, 'life_bad');
    });

    EventBus.on('time:autoSlowTriggered', ({ reason }) => {
      this._log(`Auto-slow: ${reason}`, 'auto_slow');
    });

    EventBus.on('disk:phaseChanged', ({ newPhasePL }) => {
      this._log(`Faza dysku: ${newPhasePL}`, 'disk_phase');
    });

    EventBus.on('civ:epochChanged', ({ epoch }) => {
      this._log(`Nowa epoka: ${epoch}`, 'civ_epoch');
    });
    EventBus.on('civ:unrestStarted', () => {
      this._log('Niepokoje społeczne!', 'civ_unrest');
    });
    EventBus.on('civ:famine', () => {
      this._log('Głód w kolonii!', 'civ_famine');
    });

    EventBus.on('civ:popBorn', ({ population }) => {
      this._log(`Nowy POP! Populacja: ${population}`, 'pop_born');
    });
    EventBus.on('civ:popDied', ({ cause, population }) => {
      const causeText = cause === 'starvation' ? ' (głód)' : '';
      this._log(`Strata POPa${causeText}! Populacja: ${population}`, 'pop_died');
    });

    EventBus.on('expedition:reconComplete', ({ scope, discovered }) => {
      const label = scope === 'nearest' ? 'Rozpoznanie planety' : 'Rozpoznanie układu';
      this._log(`${label}: odkryto ${discovered.length} ciał`, 'expedition_ok');
    });
    EventBus.on('expedition:arrived', ({ expedition, multiplier }) => {
      const mult = multiplier != null ? ` ×${multiplier.toFixed(1)}` : '';
      const typeLabel = expedition.type === 'transport' ? 'Transport dostarczony'
        : expedition.type === 'colony' ? 'Kolonia założona'
        : expedition.type === 'recon' ? 'Rozpoznanie zakończone'
        : 'Ekspedycja wraca';
      this._log(`${typeLabel}: ${expedition.targetName}${mult}`, 'expedition_ok');
    });
    EventBus.on('expedition:disaster', ({ expedition }) => {
      this._log(`Katastrofa: ${expedition.targetName}!`, 'expedition_fail');
    });
    EventBus.on('colony:founded', ({ colony }) => {
      this._log(`🏙 Nowa kolonia: ${colony.name}`, 'new_planet');
    });
    EventBus.on('colony:tradeExecuted', ({ route }) => {
      this._log('📦 Droga handlowa: transfer wykonany', 'info');
    });
    EventBus.on('colony:migration', ({ from, to, count }) => {
      this._log(`👤 Migracja: ${count} POP z ${from} → ${to}`, 'info');
    });
  }

  _log(text, type = 'info') {
    const MAX = 8;
    this._logEntries.unshift({ year: this._logYear, text, color: LOG_COLORS[type] || C.text });
    if (this._logEntries.length > MAX) this._logEntries.length = MAX;
  }

  addInfo(text) { this._log(text, 'info'); }

  _addNotification(text) {
    this._notifications.push({ text, alpha: 1.0, endTime: Date.now() + 2800 });
  }

  _flashResource(resource) {
    // Prosta wizualna informacja — dodaj log
    this._log(`Niedobór: ${resource}`, 'civ_famine');
  }

  // Sprawdza czy współrzędne (fizyczne px) są nad interaktywnym elementem UI.
  // Używane przez ThreeCameraController do blokowania kamery.
  isOverUI(rawX, rawY) {
    const x = rawX / UI_SCALE;
    const y = rawY / UI_SCALE;

    // Dialog potwierdzenia — blokuje cały ekran
    if (this._confirmDialog?.visible) return true;

    // ResourcePanel (pasek zasobów, y < 44)
    if (window.KOSMOS?.civMode && y <= 44) return true;

    // CivPanel sidebar (zawsze widoczny gdy civMode)
    if (window.KOSMOS?.civMode) {
      const sidebarH = CIV_SIDEBAR_PAD + CIV_TABS.length * CIV_SIDEBAR_BTN
                     + (CIV_TABS.length - 1) * CIV_SIDEBAR_GAP;
      if (x <= CIV_SIDEBAR_W && y >= CIV_PANEL_Y && y <= CIV_PANEL_Y + sidebarH) return true;
    }
    // CivPanel body (treść — tylko gdy zakładka otwarta)
    if (window.KOSMOS?.civMode && this._civPanelTab !== null) {
      const bodyH = this._civPanelTab === 'expeditions' ? 300 : CIV_PANEL_BODY_H;
      const panelBottom = CIV_PANEL_Y + bodyH;
      if (x >= CIV_SIDEBAR_W && y >= CIV_PANEL_Y && y <= panelBottom) return true;
    }

    // Info panel (prawy dolny róg gdy encja zaznaczona)
    if (this._selectedEntity) {
      const { PX, PY, PW, PH } = this._infoPanelRect();
      if (x >= PX && x <= PX + PW && y >= PY && y <= PY + PH) return true;
    }

    // Dolny pasek: kontrolki czasu + przyciski gry (y > H - 44)
    if (y > H - 44) return true;

    // Akcje gracza (lewy panel gdy nie civMode)
    if (!window.KOSMOS?.civMode) {
      const PW2 = 220, PAD = 10, BTN_H2 = 36, BTN_G = 6;
      const PH2 = PAD + 16 + 3 * (BTN_H2 + BTN_G) + PAD;
      const PX2 = W - PW2 - 12;
      const PY2 = H - PH2 - 56;
      if (x >= PX2 && x <= PX2 + PW2 && y >= PY2 && y <= PY2 + PH2) return true;
    }

    return false;
  }

  // ── Hit testing (sprawdza czy kliknięcie trafiło w UI) ─────────
  handleClick(x, y) {
    // Przelicz fizyczne px → logiczne (uwzględnia UI_SCALE)
    x /= UI_SCALE; y /= UI_SCALE;
    // Dialog potwierdzenia ma priorytet
    if (this._confirmDialog?.visible) {
      return this._hitTestConfirm(x, y);
    }

    // CivPanel (zakładki, technologie)
    if (window.KOSMOS?.civMode && this._hitTestCivPanel(x, y)) return true;

    // Zakładki info panelu
    if (this._selectedEntity) {
      // Przycisk zmiany nazwy ✏
      if (this._hitTestRename(x, y))      return true;
      if (this._hitTestInfoTabs(x, y))    return true;
      // Przycisk akcji cywilizacji
      if (this._hitTestCivButton(x, y))   return true;
      // Pochłoń klik w tle panelu — zapobiega body:deselected
      if (this._isClickInInfoPanel(x, y)) return true;
    }

    // Przyciski czasu
    if (this._hitTestTimeControls(x, y)) return true;

    // Przyciski zarządzania grą
    if (this._hitTestGameButtons(x, y)) return true;

    // Przyciski akcji gracza
    if (this._hitTestActionPanel(x, y)) return true;

    return false;
  }

  handleMouseMove(x, y) {
    // Przelicz fizyczne px → logiczne (uwzględnia UI_SCALE)
    x /= UI_SCALE; y /= UI_SCALE;
    this._tooltipMouseX = x;
    this._tooltipMouseY = y;
    // Wykrywanie hovera przycisków (dla zmiany kursora)
    const prev = this._hoveredBtn;
    this._hoveredBtn = this._detectHoverBtn(x, y);
    if (this._hoveredBtn !== prev) {
      // Kursor ustawiamy na event-layer (ui-canvas ma pointer-events:none)
      const layer = document.getElementById('event-layer');
      if (layer) layer.style.cursor = this._hoveredBtn ? 'pointer' : 'default';
    }
    // Detekcja tooltipa CivPanel
    this._tooltip = this._detectCivPanelTooltip(x, y);
  }

  // ── Pętla rysowania ───────────────────────────────────────────
  _startDrawLoop() {
    const draw = () => {
      requestAnimationFrame(draw);
      this._draw();
    };
    draw();
  }

  _draw() {
    const ctx = this.ctx;
    // Zastosuj skalowanie UI — rysujemy w przestrzeni logicznej W×H
    // ctx.scale mnoży logiczne px → fizyczne px (tekst i panele proporcjonalnie większe)
    ctx.save();
    ctx.setTransform(UI_SCALE, 0, 0, UI_SCALE, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Tytuł
    this._drawTitle();

    // Etykieta fazy dysku (środek góry)
    this._drawDiskPhase();

    // ResourcePanel — tylko gdy civMode
    if (window.KOSMOS?.civMode) this._drawResourcePanel();

    // CivPanel — panel informacyjny cywilizacji (pod ResourcePanel)
    if (window.KOSMOS?.civMode) this._drawCivPanel();

    // EventLog (lewy bok)
    this._drawEventLog();

    // Panel informacji o zaznaczonym ciele (prawy bok)
    if (this._selectedEntity) this._drawInfoPanel();

    // Panel akcji gracza (prawy dolny róg)
    this._drawActionPanel();

    // TimeControls (dół)
    this._drawTimeControls();

    // Przyciski gry (ZAP, NOW, DZW, AUT) — w dolnym pasku, po prawej
    this._drawGameButtons();

    // Pasek stabilności (dolny pasek, lewa strona)
    this._drawStabilityBar();

    // Podpowiedź sterowania
    this._drawHint();

    // Powiadomienia (fade out)
    this._drawNotifications();

    // Tooltip CivPanel (nad panelami, pod dialogiem)
    if (this._tooltip) this._drawTooltip();

    // Dialog potwierdzenia
    if (this._confirmDialog?.visible) this._drawConfirmDialog();

    ctx.restore();
  }

  // ── Tytuł ─────────────────────────────────────────────────────
  _drawTitle() {
    const ctx = this.ctx;
    ctx.font = '15px monospace';
    ctx.fillStyle = C.title;
    ctx.fillText('K O S M O S', 14, 20);
    ctx.font = '9px monospace';
    ctx.fillStyle = C.label;
    ctx.fillText('Symulator Układu Słonecznego', 14, 34);
  }

  // ── Pasek stabilności ─────────────────────────────────────────
  _drawStabilityBar() {
    const ctx   = this.ctx;
    const { score, trend } = this._stability;

    // Inline z kontrolkami czasu — lewa strona dolnego paska
    const textY = H - 24;   // ta sama linia co PAUZA / prędkości
    const arrow  = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '–';
    const tColor = trend === 'up' ? '#44cc66' : trend === 'down' ? '#cc4422' : C.text;

    ctx.font      = '9px monospace';
    ctx.fillStyle = C.label;
    ctx.textAlign = 'left';
    ctx.fillText('STAB:', 14, textY);

    ctx.fillStyle = tColor;
    ctx.fillText(`${score}${arrow}`, 50, textY);

    // Mini-pasek obok tekstu
    const BAR_X = 86, BAR_W = 60, BAR_H = 5;
    const barY  = textY - 4;
    ctx.fillStyle = '#0d1520';
    ctx.fillRect(BAR_X, barY, BAR_W, BAR_H);
    const fillW = Math.round((score / 100) * BAR_W);
    if (fillW > 0) {
      ctx.fillStyle = score >= 70 ? '#44cc66' : score >= 40 ? '#ccaa22' : '#cc4422';
      ctx.fillRect(BAR_X, barY, fillW, BAR_H);
    }
    ctx.strokeStyle = '#1a3050';
    ctx.lineWidth   = 1;
    ctx.strokeRect(BAR_X, barY, BAR_W, BAR_H);
  }

  // ── Etykieta fazy dysku ───────────────────────────────────────
  _drawDiskPhase() {
    const ctx = this.ctx;
    ctx.font      = '10px monospace';
    ctx.fillStyle = '#88aaff';
    ctx.textAlign = 'center';
    ctx.fillText(`FAZA: ${this._diskPhasePL}`, W / 2, 16);
    ctx.textAlign = 'left';
  }

  // ── Przyciski gry ─────────────────────────────────────────────
  _drawGameButtons() {
    const ctx  = this.ctx;
    const textY = H - 24;   // dolny pasek — wyrównane z kontrolkami czasu
    const btns = this._getGameBtnDefs();
    ctx.font = '9px monospace';
    btns.forEach(b => {
      const hover = this._hoveredBtn === b.id;
      ctx.fillStyle = b.active === false ? '#cc4422' : (hover ? C.bright : C.label);
      ctx.textAlign = 'right';
      ctx.fillText(b.label, b.x, textY);
    });
    ctx.textAlign = 'left';
  }

  _getGameBtnDefs() {
    const BTN_W = 38, GAP = 4;
    return [
      { id: 'sound', label: '[DZW]', x: W - 14,                     active: this._audioEnabled },
      { id: 'new',   label: '[NOW]', x: W - 14 - (BTN_W + GAP),     active: undefined },
      { id: 'load',  label: '[WCZ]', x: W - 14 - (BTN_W + GAP) * 2, active: undefined },
      { id: 'save',  label: '[ZAP]', x: W - 14 - (BTN_W + GAP) * 3, active: undefined },
      { id: 'auto',  label: '[AUT]', x: W - 14 - (BTN_W + GAP) * 4, active: this._timeState.autoSlow },
    ];
  }

  // ── EventLog ──────────────────────────────────────────────────
  _drawEventLog() {
    const ctx     = this.ctx;
    const X       = 14;
    const PANEL_W = 220;
    const MAX_LOG = 8;  // maks wpisów
    const PANEL_H = MAX_LOG * 14 + 30;
    // Na dole po lewej, nad dolnym paskiem (H-44)
    const Y       = H - 44 - PANEL_H - 4;

    this._roundRect(ctx, X, Y, PANEL_W, PANEL_H, 3, '#060d18', 0.80, C.border);

    ctx.font      = '9px monospace';
    ctx.fillStyle = '#2a6080';
    ctx.fillText('DZIENNIK ZDARZEŃ', X + 8, Y + 14);

    ctx.strokeStyle = '#1a3050';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(X + 4, Y + 19); ctx.lineTo(X + PANEL_W - 4, Y + 19);
    ctx.stroke();

    this._logEntries.slice(0, MAX_LOG).forEach((entry, i) => {
      ctx.font      = '9px monospace';
      ctx.fillStyle = entry.color || C.text;
      const y = Y + 28 + i * 14;
      const yr = entry.year > 0 ? `${_shortYear(entry.year)} ` : '';
      ctx.fillText(yr + _truncate(entry.text, 26), X + 8, y);
    });
  }

  // ── Panel informacji ──────────────────────────────────────────
  _drawInfoPanel() {
    const entity = this._selectedEntity;
    if (!entity) return;

    const ctx = this.ctx;
    const { PX, PY, PW, PH } = this._infoPanelRect();

    this._roundRect(ctx, PX, PY, PW, PH, 3, '#060d18', 0.92, C.border);

    // Nagłówek
    ctx.font      = '12px monospace';
    ctx.fillStyle = C.bright;
    ctx.fillText(_truncate(entity.name, 20), PX + 10, PY + 18);

    // Przycisk zmiany nazwy ✏
    ctx.font      = '10px monospace';
    ctx.fillStyle = '#6888aa';
    ctx.fillText('✏', PX + PW - 22, PY + 18);

    ctx.font      = '9px monospace';
    ctx.fillStyle = C.label;
    ctx.fillText(entity.planetType ?? entity.type, PX + 10, PY + 30);

    // Zakładki
    const tabs = ['orbit', 'physics'];
    if (entity.composition) tabs.push('composition');
    const tabLabels = { orbit: 'ORBITA', physics: 'FIZYKA', composition: 'SKŁAD' };
    const tabW = Math.floor((PW - 16) / tabs.length);

    tabs.forEach((tab, i) => {
      const tx     = PX + 8 + i * (tabW + 2);
      const ty     = PY + 38;
      const active = tab === this._infoPanelTab;
      ctx.fillStyle = active ? '#1a3050' : '#080e18';
      ctx.fillRect(tx, ty, tabW, 16);
      ctx.strokeStyle = active ? '#3a6090' : C.border;
      ctx.lineWidth   = 1;
      ctx.strokeRect(tx, ty, tabW, 16);
      ctx.font      = '8px monospace';
      ctx.fillStyle = active ? C.bright : C.text;
      ctx.textAlign = 'center';
      ctx.fillText(tabLabels[tab], tx + tabW / 2, ty + 10);
    });
    ctx.textAlign = 'left';

    // Separator
    ctx.strokeStyle = C.border;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(PX + 8, PY + 58); ctx.lineTo(PX + PW - 8, PY + 58);
    ctx.stroke();

    // Treść zakładki
    const lines = this._getInfoLines(entity);
    lines.forEach((line, i) => {
      ctx.font      = '10px monospace';
      ctx.fillStyle = line.c || C.text;
      ctx.fillText(line.k + ': ', PX + 10, PY + 72 + i * 16);
      ctx.fillStyle = line.vc || C.bright;
      const kw = ctx.measureText(line.k + ': ').width;
      ctx.fillText(line.v, PX + 10 + kw, PY + 72 + i * 16);
    });

    // Przycisk cywilizacji (kolonizuj / mapa planety)
    this._drawCivButton(entity, PX, PY + PH - 36, PW);
  }

  _getInfoLines(entity) {
    const tab = this._infoPanelTab;

    if (tab === 'orbit' && entity.orbital) {
      const orb   = entity.orbital;
      const lines = [
        { k: 'Orbita',    v: `${orb.a.toFixed(3)} AU`                 },
        { k: 'Mimośród',  v: orb.e.toFixed(3)                         },
        { k: 'Okres',     v: `${orb.T.toFixed(2)} lat`                },
        { k: 'Stabilność', v: `${Math.round((entity.orbitalStability || 1) * 100)}%` },
        { k: 'Wiek',      v: `${Math.floor(entity.age || 0).toLocaleString()} lat` },
      ];
      // Odległość od planety gracza (tylko w civMode, nie dla homePlanet)
      const homePl = window.KOSMOS?.homePlanet;
      if (window.KOSMOS?.civMode && homePl && entity !== homePl) {
        const dist = DistanceUtils.fromHomePlanetAU(entity);
        const distStr = dist.toFixed(2);
        lines.push({
          k: 'Odległość', v: `${distStr} AU`,
          vc: dist > 15 ? '#ff8c00' : undefined,  // pomarańczowy > 15 AU
        });
      }
      return lines;
    }

    if (tab === 'physics') {
      // Niezbadane ciało — ukryj szczegółowe dane fizyczne
      const homePl = window.KOSMOS?.homePlanet;
      if (window.KOSMOS?.civMode && entity !== homePl && !entity.explored) {
        return [
          { k: 'Masa',  v: `${(entity.physics?.mass || 0).toFixed(2)} M⊕` },
          { k: 'Typ',   v: entity.planetType || '—' },
          { k: 'Temp',  v: '???', vc: C.orange },
          { k: 'Atm',   v: '???', vc: C.orange },
          { k: 'Życie', v: '??? (wymaga rozpoznania)', vc: C.orange },
        ];
      }
      const ls = entity.lifeScore || 0;
      const lifeLabel = ls <= 0  ? 'Jałowa'              :
                        ls <= 20 ? 'Chemia prebiotyczna' :
                        ls <= 50 ? 'Mikroorganizmy'      :
                        ls <= 80 ? 'Złożone życie'       : 'Cywilizacja';
      return [
        { k: 'Masa',      v: `${(entity.physics?.mass || 0).toFixed(2)} M⊕` },
        { k: 'Temp',      v: entity.temperatureK ? `${Math.round(entity.temperatureK - 273)} °C` : '—' },
        { k: 'Atm',       v: entity.atmosphere || '—' },
        { k: 'Typ',       v: entity.planetType || '—' },
        { k: 'Stabilność', v: `${Math.round((entity.orbitalStability || 1) * 100)}%` },
        { k: 'Życie',     v: `${Math.round(ls)}%  ${lifeLabel}`,
          vc: ls > 80 ? C.yellow : ls > 0 ? C.green : C.text },
      ];
    }

    if (tab === 'composition' && entity.composition) {
      // Niezbadane ciało — ukryj skład chemiczny
      const homePl = window.KOSMOS?.homePlanet;
      if (window.KOSMOS?.civMode && entity !== homePl && !entity.explored) {
        return [
          { k: 'Skład', v: '??? (wymaga rozpoznania)', vc: C.orange },
        ];
      }
      // Top-7 pierwiastków posortowanych malejąco
      const entries = Object.entries(entity.composition)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7);
      return entries.map(([k, v]) => ({
        k: k, v: `${v.toFixed(1)}%`,
        vc: v > 20 ? C.yellow : v > 10 ? C.orange : C.text,
      }));
    }

    return [{ k: 'Typ', v: entity.type || '—' }];
  }

  _drawCivButton(entity, px, py, pw) {
    const ctx  = this.ctx;
    const civMode  = window.KOSMOS?.civMode;
    const homePl   = window.KOSMOS?.homePlanet;
    const isHome   = homePl && entity.id === homePl.id;

    let label = null;
    if (!civMode && entity.type === 'planet' && (entity.lifeScore ?? 0) > 80) {
      label = '\u25ba Przejmij cywilizacj\u0119';
    } else if (civMode && isHome) {
      label = '\u25ba Mapa planety';
    }
    if (!label) return;

    const BW = pw - 20;
    const BX = px + 10;
    const BY = py + 4;
    const BH = 22;

    ctx.fillStyle = '#1a3050';
    ctx.fillRect(BX, BY, BW, BH);
    ctx.strokeStyle = '#3a6090';
    ctx.lineWidth   = 1;
    ctx.strokeRect(BX, BY, BW, BH);
    ctx.font      = '9px monospace';
    ctx.fillStyle = C.title;
    ctx.textAlign = 'center';
    ctx.fillText(label, BX + BW / 2, BY + 14);
    ctx.textAlign = 'left';
  }

  // ── ActionPanel (akcje gracza) ────────────────────────────────
  // Ukryty w trybie 4X — gracz nie może już ręcznie ingerować w fizykę układu
  _drawActionPanel() {
    if (window.KOSMOS?.civMode) return;
    const ctx    = this.ctx;
    const PW     = 220;
    const BTN_H  = 36;
    const BTN_G  = 6;
    const PAD    = 10;
    const PH     = PAD + 16 + 3 * (BTN_H + BTN_G) + PAD;
    const PX     = W - PW - 12;
    const PY     = H - PH - 56;

    this._roundRect(ctx, PX, PY, PW, PH, 3, '#060d18', 0.88, C.border);

    ctx.font      = '9px monospace';
    ctx.fillStyle = C.label;
    ctx.fillText('AKCJE GRACZA', PX + PAD, PY + 14);

    // Pasek energii
    const E_Y  = PY + PAD + 16;
    const E_W  = PW - PAD * 2;
    const frac = this._energyMax > 0 ? this._energy / this._energyMax : 0;
    ctx.fillStyle = '#0d1520';
    ctx.fillRect(PX + PAD, E_Y, E_W, 6);
    ctx.fillStyle = frac > 0.5 ? '#44aaff' : frac > 0.2 ? '#aabb22' : '#cc4422';
    ctx.fillRect(PX + PAD, E_Y, Math.round(E_W * frac), 6);
    ctx.strokeStyle = C.border;
    ctx.lineWidth   = 1;
    ctx.strokeRect(PX + PAD, E_Y, E_W, 6);

    // Przyciski akcji
    const actions = [
      { id: 'stabilize', label: '[Q] STABILIZUJ',  cost: ACTION_COSTS.stabilize,  color: '#44aaff' },
      { id: 'nudgeToHz', label: '[W] PCHNIJ → HZ', cost: ACTION_COSTS.nudgeToHz,  color: '#88ffcc' },
      { id: 'bombard',   label: '[E] BOMBARDUJ',   cost: ACTION_COSTS.bombard,     color: '#ffaa44' },
    ];

    const hasTarget = !!this._selectedEntity;
    actions.forEach((act, i) => {
      const bx = PX + PAD;
      const by = PY + PAD + 16 + 10 + i * (BTN_H + BTN_G);
      const bw = PW - PAD * 2;
      const canUse = hasTarget && this._energy >= act.cost;

      ctx.fillStyle = canUse ? '#0d1a2e' : '#080e18';
      ctx.fillRect(bx, by, bw, BTN_H);
      ctx.strokeStyle = canUse ? '#2a4060' : '#111828';
      ctx.lineWidth   = 1;
      ctx.strokeRect(bx, by, bw, BTN_H);

      // Linia kolorowa po lewej
      ctx.fillStyle = canUse ? act.color : '#2a3050';
      ctx.fillRect(bx, by, 2, BTN_H);

      ctx.font      = '10px monospace';
      ctx.fillStyle = canUse ? act.color : C.label;
      ctx.fillText(act.label, bx + 8, by + 14);

      ctx.font      = '9px monospace';
      ctx.fillStyle = C.label;
      ctx.fillText(`Koszt: ${act.cost} en.`, bx + 8, by + 26);
    });
  }

  // ── ResourcePanel (4X) ────────────────────────────────────────
  _drawResourcePanel() {
    const ctx  = this.ctx;
    const BAR_H = 44;
    const TOP   = 0;

    ctx.fillStyle = 'rgba(6,13,24,0.90)';
    ctx.fillRect(0, TOP, W, BAR_H);
    ctx.strokeStyle = C.border;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(0, TOP + BAR_H); ctx.lineTo(W, TOP + BAR_H); ctx.stroke();

    const icons   = { minerals: '⛏', energy: '⚡', organics: '🌿', water: '💧', research: '🔬' };
    const RES     = ['minerals', 'energy', 'organics', 'water', 'research'];
    const colW    = W / 5;

    RES.forEach((r, i) => {
      const cx   = i * colW + colW / 2;
      const amt  = this._resources[r] ?? 0;
      const cap  = this._resCap[r]    ?? 500;
      const dlt  = this._resDelta[r]  ?? 0;
      const frac = cap > 0 ? amt / cap : 0;

      ctx.font      = '9px monospace';
      ctx.fillStyle = C.label;
      ctx.textAlign = 'center';
      ctx.fillText(icons[r] + ' ' + r.toUpperCase(), cx, TOP + 11);

      ctx.font      = '11px monospace';
      ctx.fillStyle = frac < 0.10 ? C.red : frac < 0.25 ? C.orange : C.bright;
      ctx.fillText(`${Math.floor(amt)} / ${cap}`, cx, TOP + 24);

      ctx.font      = '9px monospace';
      ctx.fillStyle = dlt >= 0 ? '#44cc66' : '#cc4422';
      ctx.fillText(`${dlt >= 0 ? '+' : ''}${dlt.toFixed(1)}/r`, cx, TOP + 37);
    });
    ctx.textAlign = 'left';
  }

  // ── CivPanel — panel informacyjny cywilizacji ─────────────
  // Współrzędne obszaru treści CivPanel (prawo od sidebara)
  _civPanelBodyRect() {
    // Ekspedycje mają więcej treści (misje + flota + kolonie)
    const h = this._civPanelTab === 'expeditions' ? 300 : CIV_PANEL_BODY_H;
    return {
      x: CIV_SIDEBAR_W,
      y: CIV_PANEL_Y,
      w: W - CIV_SIDEBAR_W,
      h,
    };
  }

  _drawCivPanel() {
    const ctx = this.ctx;

    // Sidebar — zawsze widoczny
    this._drawCivPanelSidebar(ctx);

    // Treść — tylko gdy zakładka otwarta
    if (!this._civPanelTab) return;

    const { x: bodyX, y: bodyY, w: bodyW, h: bodyH } = this._civPanelBodyRect();

    // Tło treści
    ctx.fillStyle = 'rgba(6,13,24,0.88)';
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
    ctx.strokeStyle = C.border;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(bodyX, bodyY + bodyH); ctx.lineTo(bodyX + bodyW, bodyY + bodyH); ctx.stroke();

    if (this._civPanelTab === 'economy')     this._drawEconomyTab(ctx, bodyY, bodyX, bodyW);
    if (this._civPanelTab === 'tech')        this._drawTechTab(ctx, bodyY, bodyX, bodyW);
    if (this._civPanelTab === 'buildings')   this._drawBuildingsTab(ctx, bodyY, bodyX, bodyW);
    if (this._civPanelTab === 'expeditions') this._drawExpeditionsTab(ctx, bodyY, bodyX, bodyW);
  }

  _drawCivPanelSidebar(ctx) {
    const sx = 0;
    const sy = CIV_PANEL_Y;
    const sidebarH = CIV_SIDEBAR_PAD + CIV_TABS.length * CIV_SIDEBAR_BTN
                   + (CIV_TABS.length - 1) * CIV_SIDEBAR_GAP;

    // Tło paska bocznego
    ctx.fillStyle = 'rgba(4,8,16,0.92)';
    ctx.fillRect(sx, sy, CIV_SIDEBAR_W, sidebarH);
    // Prawa krawędź
    ctx.strokeStyle = C.border;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(sx + CIV_SIDEBAR_W, sy);
    ctx.lineTo(sx + CIV_SIDEBAR_W, sy + sidebarH);
    ctx.stroke();

    CIV_TABS.forEach((tab, i) => {
      const btnY = sy + CIV_SIDEBAR_PAD + i * (CIV_SIDEBAR_BTN + CIV_SIDEBAR_GAP);
      const active = this._civPanelTab === tab.id;

      // Tło przycisku
      ctx.fillStyle = active ? 'rgba(26,48,80,0.95)' : 'rgba(8,14,24,0.80)';
      ctx.fillRect(sx, btnY, CIV_SIDEBAR_W, CIV_SIDEBAR_BTN);

      // Lewy akcent aktywnej zakładki
      if (active) {
        ctx.fillStyle = '#4488ff';
        ctx.fillRect(sx, btnY, 3, CIV_SIDEBAR_BTN);
      }

      // Ikona wycentrowana
      ctx.font      = '16px monospace';
      ctx.fillStyle = active ? C.bright : C.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tab.icon, sx + CIV_SIDEBAR_W / 2, btnY + CIV_SIDEBAR_BTN / 2);
    });

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ── Zakładka: Gospodarka ──────────────────────────────────
  _drawEconomyTab(ctx, bodyY, bodyX, bodyW) {
    const civ  = window.KOSMOS?.civSystem;
    const colW = Math.floor(bodyW / 3);
    const PAD  = 14;
    const LH   = 14; // line height

    // ── Kolumna 1: Populacja ──
    const x1 = bodyX + PAD;
    let y1 = bodyY + 16;

    ctx.font      = '9px monospace';
    ctx.fillStyle = C.title;
    ctx.fillText('POPULACJA', x1, y1);
    y1 += LH + 2;

    const pop     = civ?.population ?? 0;
    const housing = civ?.housing    ?? 0;
    const gp      = this._civData?.growthProgress ?? 0;
    const freePop = this._civData?.freePops ?? 0;
    const empPop  = this._civData?.employedPops ?? 0;
    const lockPop = this._civData?.lockedPops ?? 0;
    const epoch   = this._civData?.epoch ?? civ?.epochName ?? '—';
    const isUnrest = this._civData?.isUnrest ?? false;
    const isFamine = this._civData?.isFamine ?? false;

    ctx.font      = '10px monospace';
    ctx.fillStyle = C.bright;
    ctx.fillText(`👤 POP: ${pop} / ${housing}`, x1, y1);
    y1 += LH;

    // Pasek wzrostu
    ctx.fillStyle = C.text;
    ctx.font      = '9px monospace';
    ctx.fillText('Wzrost:', x1, y1);
    this._drawMiniBar(x1 + 52, y1 - 7, 70, 7, gp, '#44cc66');
    ctx.fillStyle = C.text;
    ctx.fillText(`${Math.round(gp * 100)}%`, x1 + 126, y1);
    y1 += LH;

    ctx.fillStyle = C.text;
    ctx.fillText(`Epoka: ${epoch}`, x1, y1);
    y1 += LH;

    ctx.fillText(`Wolni: ${freePop.toFixed(1)}  Zatr: ${empPop.toFixed(1)}  Zabl: ${lockPop.toFixed(1)}`, x1, y1);
    y1 += LH + 2;

    if (isUnrest) {
      ctx.fillStyle = C.red;
      ctx.font      = '9px monospace';
      ctx.fillText('⚠ NIEPOKOJE!', x1, y1);
      y1 += LH;
    }
    if (isFamine) {
      ctx.fillStyle = C.orange;
      ctx.font      = '9px monospace';
      ctx.fillText('⚠ GŁÓD!', x1, y1);
    }

    // ── Kolumna 2: Morale ──
    const x2 = bodyX + colW + PAD;
    let y2 = bodyY + 16;

    ctx.font      = '9px monospace';
    ctx.fillStyle = C.title;
    ctx.fillText('MORALE', x2, y2);
    y2 += LH + 2;

    const morale = Math.round(civ?.morale ?? 50);
    const mColor = morale >= 60 ? C.green : morale >= 30 ? C.orange : C.red;
    ctx.font      = '10px monospace';
    ctx.fillStyle = mColor;
    ctx.fillText(`${morale}%`, x2, y2);
    this._drawMiniBar(x2 + 36, y2 - 7, 90, 7, morale / 100, mColor);
    y2 += LH + 4;

    // Separator
    ctx.strokeStyle = C.border;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(x2, y2 - 2); ctx.lineTo(x2 + colW - PAD * 2, y2 - 2); ctx.stroke();
    y2 += 2;

    // Składniki morale
    const comp = this._moraleData?.components ?? civ?.moraleComponents ?? {};
    for (const key of ['housing', 'food', 'water', 'energy', 'employment', 'safety']) {
      const val = comp[key] ?? 0;
      const max = MORALE_MAX[key];
      const frac = max > 0 ? val / max : 0;
      const cmpColor = frac >= 0.6 ? C.green : frac >= 0.3 ? C.orange : C.red;

      ctx.font      = '8px monospace';
      ctx.fillStyle = C.text;
      const label = MORALE_LABELS[key] ?? key;
      ctx.fillText(label, x2, y2);
      ctx.fillStyle = cmpColor;
      ctx.fillText(`${val}/${max}`, x2 + 100, y2);
      this._drawMiniBar(x2 + 132, y2 - 6, 50, 5, frac, cmpColor);
      y2 += 13;
    }

    // ── Kolumna 3: Bilans zasobów ──
    const x3 = bodyX + colW * 2 + PAD;
    let y3 = bodyY + 16;

    ctx.font      = '9px monospace';
    ctx.fillStyle = C.title;
    ctx.fillText('BILANS ROCZNY', x3, y3);
    y3 += LH + 2;

    // Oblicz produkcję/konsumpcję z podziałem na budynki i POP
    const resSys    = window.KOSMOS?.resourceSystem;
    const producers = resSys?._producers ?? new Map();
    const RES = ['minerals', 'energy', 'organics', 'water', 'research'];
    const icons = RESOURCE_ICONS;

    for (const r of RES) {
      let buildTotal = 0, popCons = 0;
      for (const [id, rates] of producers) {
        const val = rates[r] ?? 0;
        if (id === 'civilization_consumption') {
          popCons += val;
        } else {
          buildTotal += val;
        }
      }
      const total = buildTotal + popCons;
      const icon = icons[r] ?? r;

      ctx.font      = '9px monospace';

      // "⛏ +25.0 bud  -1.0 POP  = +24.0/r"
      let line = `${icon} `;
      if (buildTotal !== 0) {
        line += `${buildTotal >= 0 ? '+' : ''}${buildTotal.toFixed(1)} bud`;
      }
      ctx.fillStyle = buildTotal >= 0 ? '#44cc66' : '#cc4422';
      ctx.fillText(line, x3, y3);

      if (popCons < -0.01) {
        const bw = ctx.measureText(line).width;
        ctx.fillStyle = '#cc4422';
        ctx.fillText(` ${popCons.toFixed(1)} POP`, x3 + bw, y3);
      }

      // Suma
      const totalStr = `= ${total >= 0 ? '+' : ''}${total.toFixed(1)}/r`;
      ctx.fillStyle = total >= 0 ? '#44cc66' : '#cc4422';
      ctx.textAlign = 'right';
      ctx.fillText(totalStr, x3 + colW - PAD * 2, y3);
      ctx.textAlign = 'left';

      y3 += LH;
    }
  }

  // ── Zakładka: Technologie ─────────────────────────────────
  _drawTechTab(ctx, bodyY, bodyX, bodyW) {
    const tSys     = window.KOSMOS?.techSystem;
    const branches = Object.entries(TECH_BRANCHES);
    const colW     = Math.floor(bodyW / branches.length);
    const PAD      = 8;

    branches.forEach(([branchId, branch], bi) => {
      const bx = bodyX + bi * colW + PAD;
      let by = bodyY + 16;

      // Nagłówek gałęzi
      ctx.font      = '9px monospace';
      ctx.fillStyle = branch.color;
      ctx.fillText(`${branch.icon} ${branch.namePL}`, bx, by);
      by += 4;

      // Separator
      ctx.strokeStyle = C.border;
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + colW - PAD * 2, by); ctx.stroke();
      by += 10;

      // Technologie w tej gałęzi (sortowane wg tier)
      const techs = Object.values(TECHS)
        .filter(t => t.branch === branchId)
        .sort((a, b) => a.tier - b.tier);

      techs.forEach(tech => {
        const researched = tSys?.isResearched(tech.id) ?? false;
        const available  = !researched && tech.requires.every(r => tSys?.isResearched(r) ?? false);

        // Status ikona + kolor
        let statusIcon, statusColor;
        if (researched)     { statusIcon = '✅'; statusColor = C.green; }
        else if (available) { statusIcon = '🔓'; statusColor = C.yellow; }
        else                { statusIcon = '🔒'; statusColor = '#555555'; }

        ctx.font      = '9px monospace';
        ctx.fillStyle = statusColor;
        ctx.fillText(`${statusIcon} ${_truncate(tech.namePL, 14)}`, bx, by);
        by += 12;

        // Efekty / koszt
        ctx.font      = '8px monospace';
        if (researched) {
          ctx.fillStyle = '#6888aa';
          const fx = this._techEffectSummary(tech);
          ctx.fillText(_truncate(fx, 20), bx + 10, by);
        } else {
          ctx.fillStyle = available ? C.yellow : '#444444';
          ctx.fillText(`${tech.cost.research} 🔬`, bx + 10, by);
        }
        by += 14;
      });
    });
  }

  // Krótkie podsumowanie efektów technologii
  _techEffectSummary(tech) {
    const parts = [];
    for (const fx of tech.effects) {
      if (fx.type === 'modifier') {
        const icon = RESOURCE_ICONS[fx.resource] ?? fx.resource;
        parts.push(`+${Math.round((fx.multiplier - 1) * 100)}%${icon}`);
      } else if (fx.type === 'unlockBuilding') {
        const b = BUILDINGS[fx.buildingId];
        parts.push(`→${b?.namePL ?? fx.buildingId}`);
      } else if (fx.type === 'unlockShip') {
        const s = SHIPS[fx.shipId];
        parts.push(`→${s?.icon ?? '🚀'}${s?.namePL ?? fx.shipId}`);
      } else if (fx.type === 'moraleBonus') {
        parts.push(`+${fx.amount} mor.`);
      } else if (fx.type === 'popGrowthBonus') {
        parts.push(`+${Math.round((fx.multiplier - 1) * 100)}% wzr.`);
      } else if (fx.type === 'consumptionMultiplier') {
        const icon = RESOURCE_ICONS[fx.resource] ?? fx.resource;
        parts.push(`${Math.round((fx.multiplier - 1) * 100)}%${icon}`);
      }
    }
    return parts.join(' ');
  }

  // ── Zakładka: Budowle ─────────────────────────────────────
  _drawBuildingsTab(ctx, bodyY, bodyX, bodyW) {
    const bSys   = window.KOSMOS?.buildingSystem;
    const active = bSys?._active ?? new Map();

    const PAD = 14;
    const LH  = 13;
    let y = bodyY + 16;

    ctx.font      = '9px monospace';
    ctx.fillStyle = C.title;
    ctx.fillText(`INSTALACJE AKTYWNE (${active.size})`, bodyX + PAD, y);
    y += 4;

    // Separator
    ctx.strokeStyle = C.border;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(bodyX + PAD, y); ctx.lineTo(bodyX + bodyW - PAD, y); ctx.stroke();
    y += 10;

    // Grupuj budynki wg buildingId (współdzielone z _detectBuildingTooltip)
    const { groups, totals } = this._getBuildingGroups(bSys);

    // Rysuj grupy
    const icons = RESOURCE_ICONS;
    let rowCount = 0;
    for (const [, g] of groups) {
      if (rowCount >= 9) break;
      const b = g.building;
      const countStr = g.count > 1 ? ` ×${g.count}` : '';

      ctx.font      = '9px monospace';
      ctx.fillStyle = C.bright;
      ctx.fillText(`${b.icon} ${b.namePL}${countStr}`, bodyX + PAD, y);

      // Stawki po prawej
      const rateStr = this._formatGroupRates(g.totalRates, icons);
      ctx.fillStyle = C.text;
      ctx.textAlign = 'right';
      ctx.fillText(rateStr, bodyX + bodyW - PAD, y);
      ctx.textAlign = 'left';

      y += LH;
      rowCount++;
    }

    // Separator + wiersz RAZEM
    y += 2;
    ctx.strokeStyle = C.border;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(bodyX + PAD, y); ctx.lineTo(bodyX + bodyW - PAD, y); ctx.stroke();
    y += 12;

    ctx.font      = '9px monospace';
    ctx.fillStyle = C.title;
    ctx.fillText('RAZEM:', bodyX + PAD, y);

    const totalParts = [];
    for (const r of ['minerals', 'energy', 'organics', 'water', 'research']) {
      if (Math.abs(totals[r]) > 0.01) {
        const v = totals[r];
        const color = v >= 0 ? '#44cc66' : '#cc4422';
        totalParts.push({ text: `${v >= 0 ? '+' : ''}${v.toFixed(1)}${icons[r]}`, color });
      }
    }
    let tx = bodyX + PAD + 54;
    for (const p of totalParts) {
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, tx, y);
      tx += ctx.measureText(p.text).width + 8;
    }
  }

  // Formatuj sumaryczne stawki grupy budynków
  _formatGroupRates(rates, icons) {
    const parts = [];
    for (const [key, val] of Object.entries(rates)) {
      if (Math.abs(val) < 0.01) continue;
      parts.push(`${val >= 0 ? '+' : ''}${val.toFixed(1)}${icons[key] ?? key}`);
    }
    return parts.join(' ') + '/r';
  }

  // ── Zakładka: Ekspedycje + Kolonie + Transport ─────────────
  _drawExpeditionsTab(ctx, bodyY, bodyX, bodyW) {
    const exSys  = window.KOSMOS?.expeditionSystem;
    const colMgr = window.KOSMOS?.colonyManager;
    const PAD    = 14;
    const LH     = 14;
    const halfW  = Math.floor(bodyW / 2);
    let y = bodyY + 16;

    // ── MISJE (lewa kolumna) ────────────────────────────────
    ctx.font      = '9px monospace';
    ctx.fillStyle = C.title;
    ctx.fillText('AKTYWNE MISJE', bodyX + PAD, y);

    const count = this._expeditions.length;
    ctx.fillStyle = count > 0 ? C.mint : C.label;
    ctx.textAlign = 'right';
    ctx.fillText(`${count} w locie`, bodyX + halfW - PAD, y);
    ctx.textAlign = 'left';
    y += 4;

    // Separator
    ctx.strokeStyle = C.border;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(bodyX + PAD, y);
    ctx.lineTo(bodyX + halfW - PAD, y);
    ctx.stroke();
    y += 10;

    // Lista aktywnych ekspedycji
    if (count === 0) {
      ctx.font      = '9px monospace';
      ctx.fillStyle = C.text;
      ctx.fillText('Brak aktywnych misji', bodyX + PAD, y);
      y += LH;
    } else {
      for (const exp of this._expeditions.slice(0, 6)) {
        const icon = exp.type === 'scientific' ? '🔬'
          : exp.type === 'colony' ? '🚢'
          : exp.type === 'transport' ? '📦'
          : exp.type === 'recon' ? '🔭'
          : '⛏';
        const arrow = exp.status === 'returning' ? '↩' : '→';
        const color = exp.status === 'returning' ? C.mint : '#88ccff';

        ctx.font      = '9px monospace';
        ctx.fillStyle = color;
        ctx.fillText(`${arrow} ${icon} ${_truncate(exp.targetName ?? '?', 14)}`, bodyX + PAD, y);

        const eta = exp.status === 'returning'
          ? `↩ ${_shortYear(exp.returnYear ?? 0)}`
          : `▶ ${_shortYear(exp.arrivalYear ?? 0)}`;
        ctx.fillStyle = C.label;
        ctx.textAlign = 'right';
        ctx.fillText(eta, bodyX + halfW - PAD, y);
        ctx.textAlign = 'left';

        y += LH;
      }
      if (count > 6) {
        ctx.fillStyle = C.text;
        ctx.fillText(`...i ${count - 6} więcej`, bodyX + PAD, y);
        y += LH;
      }
    }

    // Separator + status gotowości
    y += 4;
    ctx.strokeStyle = C.border;
    ctx.beginPath();
    ctx.moveTo(bodyX + PAD, y);
    ctx.lineTo(bodyX + halfW - PAD, y);
    ctx.stroke();
    y += 10;

    const { techOk, padOk, crewOk } = exSys?.canLaunch() ?? {};
    ctx.font      = '9px monospace';
    if (!techOk) {
      ctx.fillStyle = C.orange;
      ctx.fillText('🔒 Wymaga: Rakietnictwo', bodyX + PAD, y);
    } else if (!padOk) {
      ctx.fillStyle = C.orange;
      ctx.fillText('🔒 Wymaga: Wyrzutnia', bodyX + PAD, y);
    } else if (!crewOk) {
      ctx.fillStyle = C.orange;
      ctx.fillText('🔒 Brak POPów (0.5👤)', bodyX + PAD, y);
    } else {
      ctx.fillStyle = C.green;
      ctx.fillText('✅ Gotowy do startu', bodyX + PAD, y);
    }
    y += LH + 2;

    // ── MISJE ROZPOZNAWCZE (lewa kolumna) ─────────────────────
    this._reconBtns = [];
    const unexplored = exSys?.getUnexploredCount() ?? { planets: 0, moons: 0, other: 0, total: 0 };

    ctx.strokeStyle = C.border;
    ctx.beginPath();
    ctx.moveTo(bodyX + PAD, y);
    ctx.lineTo(bodyX + halfW - PAD, y);
    ctx.stroke();
    y += 10;

    ctx.font      = '9px monospace';
    ctx.fillStyle = C.title;
    ctx.fillText('MISJE', bodyX + PAD, y);
    y += 4;

    ctx.strokeStyle = C.border;
    ctx.beginPath();
    ctx.moveTo(bodyX + PAD, y);
    ctx.lineTo(bodyX + halfW - PAD, y);
    ctx.stroke();
    y += 10;

    if (unexplored.total === 0) {
      ctx.fillStyle = C.green;
      ctx.fillText('✅ Układ w pełni zbadany', bodyX + PAD, y);
      y += LH;
    } else {
      // Licznik niezbadanych
      ctx.fillStyle = C.text;
      let countStr = `Niezbadane: ${unexplored.planets}🪐`;
      if (unexplored.moons > 0) countStr += ` ${unexplored.moons}🌙`;
      if (unexplored.other > 0) countStr += ` ${unexplored.other}☄`;
      ctx.fillText(countStr, bodyX + PAD, y);
      y += LH;

      const reconOk = exSys?.canLaunchRecon() ?? {};
      const btnW = (halfW - PAD * 3) / 2 - 2;
      const btnH = 16;

      // Przycisk: Najbliższa 🪐
      {
        const bx = bodyX + PAD;
        const by = y;
        const enabled = reconOk.ok && unexplored.planets > 0;
        ctx.fillStyle = enabled ? 'rgba(20,40,60,0.8)' : 'rgba(20,20,30,0.6)';
        ctx.fillRect(bx, by, btnW, btnH);
        ctx.strokeStyle = enabled ? '#4488cc' : '#333';
        ctx.strokeRect(bx, by, btnW, btnH);
        ctx.font      = '8px monospace';
        ctx.fillStyle = enabled ? '#88ccff' : '#555';
        ctx.textAlign = 'center';
        ctx.fillText('Najbliższa 🪐', bx + btnW / 2, by + 11);
        ctx.textAlign = 'left';
        this._reconBtns.push({ x: bx, y: by, w: btnW, h: btnH, scope: 'nearest', enabled });
      }

      // Przycisk: Cały układ ☀
      {
        const bx = bodyX + PAD + btnW + 4;
        const by = y;
        const enabled = reconOk.ok && unexplored.total > 0;
        ctx.fillStyle = enabled ? 'rgba(20,40,60,0.8)' : 'rgba(20,20,30,0.6)';
        ctx.fillRect(bx, by, btnW, btnH);
        ctx.strokeStyle = enabled ? '#4488cc' : '#333';
        ctx.strokeRect(bx, by, btnW, btnH);
        ctx.font      = '8px monospace';
        ctx.fillStyle = enabled ? '#88ccff' : '#555';
        ctx.textAlign = 'center';
        ctx.fillText('Cały układ ☀', bx + btnW / 2, by + 11);
        ctx.textAlign = 'left';
        this._reconBtns.push({ x: bx, y: by, w: btnW, h: btnH, scope: 'full_system', enabled });
      }
      y += btnH + 2;

      // Koszt i czas pod przyciskami
      ctx.font      = '7px monospace';
      ctx.fillStyle = C.label;
      const nearT = exSys?.getReconTime('nearest') ?? 3;
      const fullT = exSys?.getReconTime('full_system') ?? 16;
      ctx.fillText(`~${nearT} lat, 100⚡`, bodyX + PAD, y);
      ctx.textAlign = 'right';
      ctx.fillText(`~${fullT} lat, 100⚡`, bodyX + halfW - PAD, y);
      ctx.textAlign = 'left';
      y += LH - 4;
    }
    y += 2;

    // ── FLOTA (lewa kolumna, pod statusem gotowości) ──────────
    this._fleetBuildBtns = [];
    const hasExploration = window.KOSMOS?.techSystem?.isResearched('exploration') ?? false;

    ctx.strokeStyle = C.border;
    ctx.beginPath();
    ctx.moveTo(bodyX + PAD, y);
    ctx.lineTo(bodyX + halfW - PAD, y);
    ctx.stroke();
    y += 10;

    ctx.font      = '9px monospace';
    ctx.fillStyle = C.title;
    ctx.fillText('FLOTA', bodyX + PAD, y);
    y += 4;

    ctx.strokeStyle = C.border;
    ctx.beginPath();
    ctx.moveTo(bodyX + PAD, y);
    ctx.lineTo(bodyX + halfW - PAD, y);
    ctx.stroke();
    y += 10;

    // Status stoczni
    const activePid = colMgr?.activePlanetId;
    const activeCol = colMgr?.getColony(activePid);
    const hasShipyard = activeCol?.buildingSystem
      ? (() => { for (const [, e] of activeCol.buildingSystem._active) { if (e.building.id === 'shipyard') return true; } return false; })()
      : false;

    ctx.font      = '9px monospace';
    if (!hasExploration) {
      ctx.fillStyle = C.orange;
      ctx.fillText('🔒 Wymaga: Eksploracja', bodyX + PAD, y);
      y += LH;
    } else if (!hasShipyard) {
      ctx.fillStyle = C.orange;
      ctx.fillText('⚓ Stocznia: ❌ (zbuduj)', bodyX + PAD, y);
      y += LH;
    } else {
      ctx.fillStyle = C.green;
      ctx.fillText('⚓ Stocznia: ✅', bodyX + PAD, y);
      y += LH;

      // Aktualnie budowany statek — pasek postępu
      const queue = colMgr?.getShipQueue(activePid);
      if (queue) {
        const shipDef = SHIPS[queue.shipId];
        const shipName = shipDef?.namePL ?? queue.shipId;
        const shipIcon = shipDef?.icon ?? '🚀';
        const frac = queue.buildTime > 0 ? queue.progress / queue.buildTime : 0;
        const progYears = Math.floor(queue.progress);
        const totalYears = queue.buildTime;

        ctx.fillStyle = '#88ccff';
        ctx.fillText(`Budowa: ${shipIcon} ${shipName}`, bodyX + PAD, y);
        y += LH - 2;

        // Pasek postępu
        const barX = bodyX + PAD;
        const barW = halfW - PAD * 3;
        this._drawMiniBar(barX, y, barW, 6, frac, '#4488cc');
        y += 8;

        ctx.fillStyle = C.text;
        ctx.fillText(`${progYears}/${totalYears} lat`, bodyX + PAD, y);
        y += LH;
      }

      // Hangar — lista statków we flocie
      const fleet = colMgr?.getFleet(activePid) ?? [];
      const vesselCount = fleet.filter(s => s === 'science_vessel').length;
      const colonyCount = fleet.filter(s => s === 'colony_ship').length;

      ctx.fillStyle = C.label;
      ctx.fillText('Hangar:', bodyX + PAD, y);
      y += LH - 2;

      ctx.fillStyle = C.text;
      ctx.fillText(`  🛸 Statek Nauk.  ×${vesselCount}`, bodyX + PAD, y);
      y += LH - 2;

      const hasColonization = window.KOSMOS?.techSystem?.isResearched('colonization') ?? false;
      if (hasColonization) {
        ctx.fillText(`  🚢 Statek Kolon. ×${colonyCount}`, bodyX + PAD, y);
        y += LH - 2;
      }
      y += 4;

      // Przyciski budowy statków
      const btnW = (halfW - PAD * 3) / 2 - 2;
      const btnH = 16;
      const canBuildAny = hasShipyard && !queue;

      // Przycisk: Buduj 🛸
      {
        const bx = bodyX + PAD;
        const by = y;
        const canBuild = canBuildAny && (activeCol?.resourceSystem?.canAfford({ minerals: 250, energy: 150 }) ?? false);
        ctx.fillStyle = canBuild ? 'rgba(20,40,60,0.8)' : 'rgba(20,20,30,0.6)';
        ctx.fillRect(bx, by, btnW, btnH);
        ctx.strokeStyle = canBuild ? '#4488cc' : '#333';
        ctx.strokeRect(bx, by, btnW, btnH);
        ctx.font      = '8px monospace';
        ctx.fillStyle = canBuild ? '#88ccff' : '#555';
        ctx.textAlign = 'center';
        ctx.fillText('Buduj 🛸', bx + btnW / 2, by + 11);
        ctx.textAlign = 'left';

        this._fleetBuildBtns.push({ x: bx, y: by, w: btnW, h: btnH, shipId: 'science_vessel', enabled: canBuild });
      }

      // Przycisk: Buduj 🚢 (jeśli tech kolonizacja zbadana)
      if (hasColonization) {
        const bx = bodyX + PAD + btnW + 4;
        const by = y;
        const canBuild = canBuildAny && (activeCol?.resourceSystem?.canAfford({ minerals: 400, energy: 200, organics: 100 }) ?? false);
        ctx.fillStyle = canBuild ? 'rgba(20,40,60,0.8)' : 'rgba(20,20,30,0.6)';
        ctx.fillRect(bx, by, btnW, btnH);
        ctx.strokeStyle = canBuild ? '#4488cc' : '#333';
        ctx.strokeRect(bx, by, btnW, btnH);
        ctx.font      = '8px monospace';
        ctx.fillStyle = canBuild ? '#88ccff' : '#555';
        ctx.textAlign = 'center';
        ctx.fillText('Buduj 🚢', bx + btnW / 2, by + 11);
        ctx.textAlign = 'left';

        this._fleetBuildBtns.push({ x: bx, y: by, w: btnW, h: btnH, shipId: 'colony_ship', enabled: canBuild });
      }
    }

    // ── KOLONIE (prawa kolumna) ─────────────────────────────
    const cx = bodyX + halfW + PAD;
    let cy = bodyY + 16;

    ctx.font      = '9px monospace';
    ctx.fillStyle = C.title;
    ctx.fillText('KOLONIE', cx, cy);

    const colonies = colMgr?.getAllColonies() ?? [];
    ctx.fillStyle = colonies.length > 0 ? C.mint : C.label;
    ctx.textAlign = 'right';
    ctx.fillText(`${colonies.length}`, bodyX + bodyW - PAD, cy);
    ctx.textAlign = 'left';
    cy += 4;

    ctx.strokeStyle = C.border;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(bodyX + bodyW - PAD, cy);
    ctx.stroke();
    cy += 10;

    // Lista kolonii — zapamiętaj pozycje do hit-testingu
    this._colonyListItems = [];
    if (colonies.length === 0) {
      ctx.font      = '9px monospace';
      ctx.fillStyle = C.text;
      ctx.fillText('Brak kolonii', cx, cy);
      cy += LH;
    } else {
      for (const col of colonies.slice(0, 5)) {
        const icon = col.isHomePlanet ? '🏛' : '🏙';
        const pop  = col.civSystem?.population ?? 0;
        const mor  = Math.round(col.civSystem?.morale ?? 50);

        ctx.font      = '9px monospace';
        ctx.fillStyle = C.bright;
        ctx.fillText(`${icon} ${_truncate(col.name, 12)}`, cx, cy);

        ctx.fillStyle = C.text;
        ctx.textAlign = 'right';
        ctx.fillText(`${pop}👤 ${mor}%`, bodyX + bodyW - PAD, cy);
        ctx.textAlign = 'left';

        // Zapamiętaj pozycję do kliknięcia
        this._colonyListItems.push({ planetId: col.planetId, y: cy - 10, h: LH });
        cy += LH;
      }
    }

    // Separator + transport
    cy += 4;
    ctx.strokeStyle = C.border;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(bodyX + bodyW - PAD, cy);
    ctx.stroke();
    cy += 10;

    // Przycisk TRANSPORT (jeśli >1 kolonia)
    this._transportBtnRect = null;
    if (colonies.length >= 2) {
      const btnW = bodyW / 2 - PAD * 2;
      const btnH = 16;
      const btnX = cx;
      const btnY = cy - 6;

      ctx.fillStyle = 'rgba(20,60,40,0.8)';
      ctx.fillRect(btnX, btnY, btnW, btnH);
      ctx.strokeStyle = '#44cc66';
      ctx.strokeRect(btnX, btnY, btnW, btnH);

      ctx.font      = '9px monospace';
      ctx.fillStyle = '#88ffcc';
      ctx.textAlign = 'center';
      ctx.fillText('📦 TRANSPORT', btnX + btnW / 2, cy + 4);
      ctx.textAlign = 'left';

      this._transportBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
      cy += 16;

      // Drogi handlowe info
      const hasLogistics = window.KOSMOS?.techSystem?.isResearched('interplanetary_logistics');
      const routes = colMgr?.getTradeRoutes() ?? [];
      if (hasLogistics && routes.length > 0) {
        ctx.font      = '8px monospace';
        ctx.fillStyle = C.text;
        ctx.fillText(`🔄 Drogi handlowe: ${routes.length}`, cx, cy);
      } else if (!hasLogistics && colonies.length >= 2) {
        ctx.font      = '8px monospace';
        ctx.fillStyle = C.label;
        ctx.fillText('🔒 Logistyka Międzypl. → auto-trasy', cx, cy);
      }
    } else if (colonies.length < 2) {
      ctx.font      = '8px monospace';
      ctx.fillStyle = C.label;
      ctx.fillText('Transport: min. 2 kolonie', cx, cy);
    }
  }

  // ── Mini pasek postępu (reusable) ─────────────────────────
  _drawMiniBar(x, y, w, h, frac, color) {
    const ctx = this.ctx;
    ctx.fillStyle = '#0d1520';
    ctx.fillRect(x, y, w, h);
    const fillW = Math.round(Math.max(0, Math.min(1, frac)) * w);
    if (fillW > 0) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, fillW, h);
    }
    ctx.strokeStyle = C.border;
    ctx.lineWidth   = 1;
    ctx.strokeRect(x, y, w, h);
  }

  // ── Tooltip CivPanel ──────────────────────────────────────────

  // Grupowanie budynków wg typu (współdzielone: draw + detect)
  _getBuildingGroups(bSys) {
    const active = bSys?._active ?? new Map();
    const groups = new Map();
    const totals = { minerals: 0, energy: 0, organics: 0, water: 0, research: 0 };
    for (const [, entry] of active) {
      const bid = entry.building.id;
      if (!groups.has(bid)) {
        groups.set(bid, { count: 0, totalRates: {}, building: entry.building });
      }
      const g = groups.get(bid);
      g.count++;
      for (const [key, val] of Object.entries(entry.effectiveRates)) {
        g.totalRates[key] = (g.totalRates[key] ?? 0) + val;
        if (totals[key] !== undefined) totals[key] += val;
      }
    }
    return { groups, totals };
  }

  // Detekcja elementu pod kursorem w CivPanel
  _detectCivPanelTooltip(x, y) {
    if (!window.KOSMOS?.civMode) return null;
    const { x: bodyX, y: bodyY, w: bodyW, h: bodyH } = this._civPanelBodyRect();

    // Tooltip na sidebar ikonie (pokaż nazwę zakładki)
    const sidebarH = CIV_SIDEBAR_PAD + CIV_TABS.length * CIV_SIDEBAR_BTN
                   + (CIV_TABS.length - 1) * CIV_SIDEBAR_GAP;
    if (x <= CIV_SIDEBAR_W && y >= CIV_PANEL_Y && y <= CIV_PANEL_Y + sidebarH) {
      for (let i = 0; i < CIV_TABS.length; i++) {
        const btnY = CIV_PANEL_Y + CIV_SIDEBAR_PAD + i * (CIV_SIDEBAR_BTN + CIV_SIDEBAR_GAP);
        if (y >= btnY && y <= btnY + CIV_SIDEBAR_BTN) {
          return { type: 'sidebar_tab', data: { label: CIV_TABS[i].label } };
        }
      }
      return null;
    }

    // Tooltip w treści panelu
    if (!this._civPanelTab) return null;
    if (x < bodyX || y < bodyY || y > bodyY + bodyH) return null;
    if (this._civPanelTab === 'buildings') return this._detectBuildingTooltip(x, y, bodyY, bodyX, bodyW);
    if (this._civPanelTab === 'tech')     return this._detectTechTooltip(x, y, bodyY, bodyX, bodyW);
    return null;
  }

  _detectBuildingTooltip(x, y, bodyY, bodyX, bodyW) {
    const bSys = window.KOSMOS?.buildingSystem;
    if (!bSys) return null;
    const PAD = 14;
    const LH  = 13;
    const firstRowY = bodyY + 30; // 16 header + 4 gap + 10 post-sep
    if (x < bodyX + PAD || x > bodyX + bodyW - PAD) return null;
    if (y < firstRowY || y > firstRowY + 9 * LH) return null;
    const rowIndex = Math.floor((y - firstRowY) / LH);
    const { groups } = this._getBuildingGroups(bSys);
    const groupArr = [...groups.values()];
    if (rowIndex < 0 || rowIndex >= groupArr.length) return null;
    return { type: 'building', data: { building: groupArr[rowIndex].building, group: groupArr[rowIndex] } };
  }

  _detectTechTooltip(x, y, bodyY, bodyX, bodyW) {
    const tSys = window.KOSMOS?.techSystem;
    if (!tSys) return null;
    const branches = Object.entries(TECH_BRANCHES);
    const colW = Math.floor(bodyW / branches.length);
    const PAD  = 8;
    for (let bi = 0; bi < branches.length; bi++) {
      const [branchId] = branches[bi];
      const bx = bodyX + bi * colW + PAD;
      if (x < bx || x > bx + colW - PAD * 2) continue;
      let by = bodyY + 30; // header + separator
      const techs = Object.values(TECHS)
        .filter(t => t.branch === branchId)
        .sort((a, b) => a.tier - b.tier);
      for (const tech of techs) {
        const rowH = 26;
        if (y >= by - 10 && y < by + rowH - 10) {
          const researched = tSys.isResearched(tech.id);
          const available  = !researched && tech.requires.every(r => tSys.isResearched(r));
          return { type: 'tech', data: { tech, researched, available } };
        }
        by += rowH;
      }
    }
    return null;
  }

  // Rysowanie floating tooltipa
  _drawTooltip() {
    const tt = this._tooltip;
    if (!tt) return;
    const ctx = this.ctx;

    // Zbuduj linie
    let lines;
    if (tt.type === 'sidebar_tab') {
      lines = [{ type: 'header', text: tt.data.label, color: C.bright }];
    } else if (tt.type === 'building') {
      lines = this._buildBuildingTooltipLines(tt.data);
    } else {
      lines = this._buildTechTooltipLines(tt.data);
    }
    if (lines.length === 0) return;

    // Oblicz wymiary
    ctx.font = '9px monospace';
    let maxTextW = 0;
    let totalH = TOOLTIP_PAD * 2;
    for (const line of lines) {
      if (line.type === 'separator') { totalH += TOOLTIP_SEP_H; continue; }
      if (line.type === 'header') {
        ctx.font = '10px monospace';
        maxTextW = Math.max(maxTextW, ctx.measureText(line.text).width);
        ctx.font = '9px monospace';
        totalH += TOOLTIP_HDR_H;
      } else {
        maxTextW = Math.max(maxTextW, ctx.measureText(line.text).width + (line.indent ?? 0));
        totalH += TOOLTIP_LINE_H;
      }
    }
    const tw = Math.min(TOOLTIP_MAX_W, maxTextW + TOOLTIP_PAD * 2 + 4);
    const th = totalH;

    // Pozycja z clampem do viewport
    let tx = this._tooltipMouseX + TOOLTIP_OFS;
    let ty = this._tooltipMouseY + TOOLTIP_OFS;
    if (tx + tw > W - 4) tx = this._tooltipMouseX - tw - 4;
    if (ty + th > H - 4) ty = this._tooltipMouseY - th - 4;
    if (tx < 4) tx = 4;
    if (ty < 4) ty = 4;

    // Tło
    this._roundRect(ctx, tx, ty, tw, th, 4, '#0a1020', 0.94, '#2a5080');

    // Rysuj linie
    let cy = ty + TOOLTIP_PAD;
    for (const line of lines) {
      if (line.type === 'separator') {
        cy += 3;
        ctx.strokeStyle = '#1a3050';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx + 6, cy); ctx.lineTo(tx + tw - 6, cy);
        ctx.stroke();
        cy += TOOLTIP_SEP_H - 3;
      } else if (line.type === 'header') {
        ctx.font      = '10px monospace';
        ctx.fillStyle = line.color ?? C.bright;
        ctx.fillText(line.text, tx + TOOLTIP_PAD, cy + 11);
        cy += TOOLTIP_HDR_H;
      } else {
        ctx.font      = '9px monospace';
        ctx.fillStyle = line.color ?? C.text;
        ctx.fillText(line.text, tx + TOOLTIP_PAD + (line.indent ?? 0), cy + 10);
        cy += TOOLTIP_LINE_H;
      }
    }
  }

  // Budowanie linii tooltipa: budynek
  _buildBuildingTooltipLines({ building, group }) {
    const lines = [];
    const b = building;
    const countStr = group.count > 1 ? ` ×${group.count}` : '';

    // Nagłówek
    lines.push({ type: 'header', text: `${b.icon} ${b.namePL}${countStr}`, color: C.bright });
    lines.push({ type: 'separator' });

    // Opis (word-wrap)
    if (b.description) {
      for (const wl of this._wrapText(b.description, TOOLTIP_WRAP)) {
        lines.push({ type: 'line', text: wl });
      }
      lines.push({ type: 'separator' });
    }

    // Stawki bazowe (per instancja)
    const baseStr = formatRates(b.rates);
    if (baseStr) {
      lines.push({ type: 'line', text: 'Na instancję:', color: C.label });
      lines.push({ type: 'line', text: `  ${baseStr}`, color: C.bright });
    }

    // Stawki efektywne (suma z tech + penalties)
    if (group.count > 0) {
      lines.push({ type: 'line', text: `Razem (×${group.count}):`, color: C.label });
      for (const [key, val] of Object.entries(group.totalRates)) {
        if (Math.abs(val) < 0.01) continue;
        const icon  = RESOURCE_ICONS[key] ?? key;
        const sign  = val >= 0 ? '+' : '';
        const color = val >= 0 ? C.green : C.red;
        lines.push({ type: 'line', text: `  ${sign}${val.toFixed(1)} ${icon}/rok`, color, indent: 4 });
      }
    }

    lines.push({ type: 'separator' });

    // Koszt budowy
    const costStr = formatCost(b.cost, b.popCost);
    if (costStr) {
      lines.push({ type: 'line', text: `Koszt: ${costStr}`, color: C.yellow });
    }

    // Housing
    if (b.housing > 0) {
      lines.push({ type: 'line', text: `Mieszkania: +${b.housing} POPów`, color: C.green });
    }

    // Pojemność magazynu
    if (b.capacityBonus) {
      const capParts = Object.entries(b.capacityBonus)
        .map(([k, v]) => `+${v}${RESOURCE_ICONS[k] ?? k}`)
        .join(' ');
      lines.push({ type: 'line', text: `Pojemność: ${capParts}`, color: C.blue });
    }

    // Wymagana technologia
    if (b.requires) {
      const techName = TECHS[b.requires]?.namePL ?? b.requires;
      lines.push({ type: 'line', text: `Wymaga: ${techName}`, color: C.purple });
    }

    return lines;
  }

  // Budowanie linii tooltipa: technologia
  _buildTechTooltipLines({ tech, researched, available }) {
    const lines = [];

    // Status
    let statusIcon, statusColor, statusText;
    if (researched)     { statusIcon = '✅'; statusColor = C.green;  statusText = 'Zbadana'; }
    else if (available) { statusIcon = '🔓'; statusColor = C.yellow; statusText = 'Dostępna (kliknij)'; }
    else                { statusIcon = '🔒'; statusColor = '#555555'; statusText = 'Zablokowana'; }

    // Nagłówek
    lines.push({ type: 'header', text: `${statusIcon} ${tech.namePL}`, color: statusColor });
    lines.push({ type: 'separator' });

    // Opis (word-wrap)
    if (tech.description) {
      for (const wl of this._wrapText(tech.description, TOOLTIP_WRAP)) {
        lines.push({ type: 'line', text: wl });
      }
      lines.push({ type: 'separator' });
    }

    // Efekty
    if (tech.effects.length > 0) {
      lines.push({ type: 'line', text: 'Efekty:', color: C.label });
      for (const fx of tech.effects) {
        lines.push({ type: 'line', text: `  ${this._formatTechEffect(fx)}`, color: C.bright, indent: 4 });
      }
      lines.push({ type: 'separator' });
    }

    // Koszt
    lines.push({ type: 'line', text: `Koszt: ${tech.cost.research} 🔬`, color: C.yellow });

    // Prerequisites
    if (tech.requires.length > 0) {
      const reqNames = tech.requires.map(id => TECHS[id]?.namePL ?? id).join(', ');
      lines.push({ type: 'line', text: `Wymaga: ${reqNames}`, color: C.purple });
    }

    // Status
    lines.push({ type: 'line', text: `Status: ${statusText}`, color: statusColor });

    return lines;
  }

  // Formatowanie efektu technologii do czytelnego stringa
  _formatTechEffect(fx) {
    const icons = RESOURCE_ICONS;
    switch (fx.type) {
      case 'modifier': {
        const pct = Math.round((fx.multiplier - 1) * 100);
        return `+${pct}% ${icons[fx.resource] ?? fx.resource} produkcji`;
      }
      case 'unlockBuilding': {
        const b = BUILDINGS[fx.buildingId];
        return `Odblokowanie: ${b?.namePL ?? fx.buildingId}`;
      }
      case 'unlockShip': {
        const s = SHIPS[fx.shipId];
        return `Odblokowanie statku: ${s?.icon ?? '🚀'} ${s?.namePL ?? fx.shipId}`;
      }
      case 'moraleBonus':
        return `+${fx.amount} morale/rok`;
      case 'popGrowthBonus': {
        const pct = Math.round((fx.multiplier - 1) * 100);
        return `+${pct}% wzrost populacji`;
      }
      case 'consumptionMultiplier': {
        const pct = Math.round((fx.multiplier - 1) * 100);
        return `${pct}% zużycie ${icons[fx.resource] ?? fx.resource}`;
      }
      default:
        return fx.type;
    }
  }

  // Word-wrap tekstu dla tooltipa (monospace)
  _wrapText(text, maxChars) {
    if (!text) return [];
    const words = text.split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
      if (current.length + word.length + 1 > maxChars && current.length > 0) {
        lines.push(current);
        current = word;
      } else {
        current = current ? current + ' ' + word : word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  // ── TimeControls ──────────────────────────────────────────────
  _drawTimeControls() {
    const ctx     = this.ctx;
    const CX      = W / 2;
    const Y       = H - 28;
    const LABELS  = GAME_CONFIG.TIME_MULTIPLIER_LABELS;
    const { isPaused, multiplierIndex, displayText } = this._timeState;

    const styleNormal = C.text;
    const styleActive = C.title;

    // Tło paska
    ctx.fillStyle = 'rgba(6,13,24,0.80)';
    ctx.fillRect(0, H - 44, W, 44);
    ctx.strokeStyle = C.border;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(0, H - 44); ctx.lineTo(W, H - 44); ctx.stroke();

    ctx.font = '13px monospace';

    // Przycisk PAUZA / GRAJ
    ctx.fillStyle = isPaused ? styleActive : styleNormal;
    ctx.textAlign = 'center';
    ctx.fillText(isPaused ? '▶ GRAJ' : '⏸ PAUZA', CX - 210, Y + 4);

    // Separatory
    ctx.font      = '13px monospace';
    ctx.fillStyle = C.label;
    ctx.fillText('|', CX - 162, Y + 4);
    ctx.fillText('|', CX + 162, Y + 4);

    // Przyciski prędkości
    LABELS.slice(1).forEach((label, i) => {
      const bx = CX - 124 + i * 62;
      const isActive = !isPaused && multiplierIndex === i + 1;
      ctx.font      = '13px monospace';
      ctx.fillStyle = isActive ? styleActive : styleNormal;
      ctx.textAlign = 'center';
      ctx.fillText(label, bx, Y + 4);
    });

    // Wyświetlacz czasu
    ctx.font      = '12px monospace';
    ctx.fillStyle = C.bright;
    ctx.textAlign = 'center';
    ctx.fillText(displayText, CX + 210, Y + 4);

    ctx.textAlign = 'left';
  }

  // ── Hint (lewy dolny róg) ─────────────────────────────────────
  _drawHint() {
    const ctx = this.ctx;
    ctx.font      = '9px monospace';
    ctx.fillStyle = C.label;
    ctx.fillText('kółko: zoom  |  PPM: pan  |  klik: zaznacz', 14, H - 8);
  }

  // ── Powiadomienia (fade out) ──────────────────────────────────
  _drawNotifications() {
    const ctx = this.ctx;
    const now = Date.now();
    this._notifications = this._notifications.filter(n => n.endTime > now);
    this._notifications.forEach((n, i) => {
      const remaining = n.endTime - now;
      n.alpha = Math.min(1.0, remaining / 600);
      ctx.globalAlpha = n.alpha;
      ctx.font        = '10px monospace';
      ctx.fillStyle   = C.title;
      ctx.textAlign   = 'right';
      ctx.fillText(n.text, W - 14, 52 + i * 14);
      ctx.textAlign   = 'left';
      ctx.globalAlpha = 1.0;
    });
  }

  // ── Dialog potwierdzenia ──────────────────────────────────────
  _drawConfirmDialog() {
    const ctx = this.ctx;
    const DW  = 300;
    const DH  = 90;
    const DX  = W / 2 - DW / 2;
    const DY  = H / 2 - DH / 2;

    // Przyciemnienie
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);

    // Panel
    this._roundRect(ctx, DX, DY, DW, DH, 4, '#111828', 1.0, '#3a6090');

    ctx.font      = '13px monospace';
    ctx.fillStyle = C.bright;
    ctx.textAlign = 'center';
    ctx.fillText('Rozpocząć nową grę?', W / 2, DY + 22);

    ctx.font      = '10px monospace';
    ctx.fillStyle = C.text;
    ctx.fillText('Aktualny postęp zostanie utracony.', W / 2, DY + 40);

    ctx.font      = '11px monospace';
    ctx.fillStyle = C.red;
    ctx.fillText('[ TAK ]', W / 2 - 50, DY + 62);
    ctx.fillStyle = C.title;
    ctx.fillText('[ ANULUJ ]', W / 2 + 50, DY + 62);

    ctx.textAlign = 'left';
  }

  // ── Hit testing ───────────────────────────────────────────────

  // CivPanel: kliknięcia w zakładki i interaktywne elementy
  _hitTestCivPanel(x, y) {
    const sy = CIV_PANEL_Y;
    const sidebarH = CIV_SIDEBAR_PAD + CIV_TABS.length * CIV_SIDEBAR_BTN
                   + (CIV_TABS.length - 1) * CIV_SIDEBAR_GAP;

    // Klik w sidebar (ikony zakładek)
    if (x >= 0 && x <= CIV_SIDEBAR_W && y >= sy && y <= sy + sidebarH) {
      for (let i = 0; i < CIV_TABS.length; i++) {
        const btnY = sy + CIV_SIDEBAR_PAD + i * (CIV_SIDEBAR_BTN + CIV_SIDEBAR_GAP);
        if (y >= btnY && y <= btnY + CIV_SIDEBAR_BTN) {
          const tabId = CIV_TABS[i].id;
          // Toggle: kliknięcie aktywnej zakładki → zwija panel
          this._civPanelTab = (this._civPanelTab === tabId) ? null : tabId;
          return true;
        }
      }
      return true; // pochłoń klik w sidebar
    }

    // Klik w treść panelu (gdy otwarty)
    if (this._civPanelTab) {
      const { x: bx, y: by, w: bw, h: bh } = this._civPanelBodyRect();
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
        if (this._civPanelTab === 'tech') {
          this._handleTechClick(x, y, by, bx, bw);
        } else if (this._civPanelTab === 'expeditions') {
          this._handleExpeditionsClick(x, y);
        }
        return true; // pochłoń klik w body panelu
      }
    }

    return false;
  }

  // Obsługa kliknięcia na technologię — badanie dostępnej tech
  _handleTechClick(x, y, bodyY, bodyX, bodyW) {
    const tSys = window.KOSMOS?.techSystem;
    if (!tSys) return;

    const branches = Object.entries(TECH_BRANCHES);
    const colW     = Math.floor(bodyW / branches.length);
    const PAD      = 8;

    for (let bi = 0; bi < branches.length; bi++) {
      const [branchId] = branches[bi];
      const bx = bodyX + bi * colW + PAD;

      // Technologie w gałęzi (sortowane wg tier)
      const techs = Object.values(TECHS)
        .filter(t => t.branch === branchId)
        .sort((a, b) => a.tier - b.tier);

      let by = bodyY + 30; // nagłówek + separator

      for (const tech of techs) {
        const rowH = 26; // 12px nazwa + 14px efekty
        if (x >= bx && x <= bx + colW - PAD * 2 && y >= by - 10 && y <= by + rowH - 10) {
          const researched = tSys.isResearched(tech.id);
          const available  = !researched && tech.requires.every(r => tSys.isResearched(r));

          if (available) {
            EventBus.emit('tech:researchRequest', { techId: tech.id });
          }
          return;
        }
        by += rowH;
      }
    }
  }

  // Obsługa kliknięcia w zakładce Ekspedycje — kolonie + transport + flota
  _handleExpeditionsClick(x, y) {
    // Klik na przycisk misji rozpoznawczej (MISJE)
    const reconBtns = this._reconBtns ?? [];
    for (const rb of reconBtns) {
      if (rb.enabled && x >= rb.x && x <= rb.x + rb.w && y >= rb.y && y <= rb.y + rb.h) {
        EventBus.emit('expedition:sendRequest', { type: 'recon', targetId: rb.scope });
        return;
      }
    }

    // Klik na przycisk budowy statku (FLOTA)
    const fleetBtns = this._fleetBuildBtns ?? [];
    for (const fb of fleetBtns) {
      if (fb.enabled && x >= fb.x && x <= fb.x + fb.w && y >= fb.y && y <= fb.y + fb.h) {
        EventBus.emit('fleet:buildRequest', { shipId: fb.shipId });
        return;
      }
    }

    // Klik na przycisk TRANSPORT
    const btn = this._transportBtnRect;
    if (btn && x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
      this._openTransportModal();
      return;
    }

    // Klik na kolonię — otwórz jej mapę (globus)
    const items = this._colonyListItems ?? [];
    for (const item of items) {
      if (y >= item.y && y <= item.y + item.h) {
        const colMgr = window.KOSMOS?.colonyManager;
        const colony = colMgr?.getColony(item.planetId);
        if (colony?.planet) {
          EventBus.emit('planet:openGlobe', { planet: colony.planet });
        }
        return;
      }
    }
  }

  // Otwiera modal transferu zasobów
  _openTransportModal() {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;

    const colonies = colMgr.getAllColonies();
    if (colonies.length < 2) return;

    // Źródło: aktywna kolonia (homePlanet jeśli brak aktywnej)
    const sourcePlanetId = colMgr.activePlanetId ?? colonies[0]?.planetId;
    const sourceColony   = colMgr.getColony(sourcePlanetId);
    if (!sourceColony) return;

    // Cele: wszystkie kolonie oprócz źródłowej
    const targets = colonies
      .filter(c => c.planetId !== sourcePlanetId)
      .map(c => ({
        planetId:     c.planetId,
        name:         c.name,
        isHomePlanet: c.isHomePlanet,
      }));

    showTransportModal(sourceColony, targets).then(result => {
      if (!result) return;
      EventBus.emit('expedition:transportRequest', {
        targetId: result.targetId,
        cargo:    result.cargo,
      });
    });
  }

  _hitTestConfirm(x, y) {
    const DW = 300;
    const DH = 90;
    const DX = W / 2 - DW / 2;
    const DY = H / 2 - DH / 2;
    if (x < DX || x > DX + DW || y < DY || y > DY + DH) return false;

    const btnY = DY + 52;
    const BTN_H = 20;

    // TAK (lewo)
    if (x >= W / 2 - 80 && x <= W / 2 - 10 && y >= btnY && y <= btnY + BTN_H) {
      this._confirmDialog = { visible: false };
      EventBus.emit('game:new');
      return true;
    }
    // ANULUJ (prawo)
    if (x >= W / 2 + 10 && x <= W / 2 + 90 && y >= btnY && y <= btnY + BTN_H) {
      this._confirmDialog = { visible: false };
      return true;
    }

    return true; // klik wewnątrz dialogu — pochłoń
  }

  // Zwraca stałe pozycji panelu info (jedyne źródło prawdy — PH=250)
  // W trybie 4X (civMode) ActionPanel jest ukryty — panel info przesuwa się w dół
  _infoPanelRect() {
    const PW = 300, AP_OFS = 56;
    const AP_H = window.KOSMOS?.civMode ? 0 : 166;
    const PH = 250;
    return { PX: W - PW - 12, PY: H - (AP_H + AP_OFS) - 8 - PH, PW, PH };
  }

  // Przycisk zmiany nazwy ✏ w nagłówku panelu info
  _hitTestRename(x, y) {
    const entity = this._selectedEntity;
    if (!entity) return false;
    const { PX, PY, PW } = this._infoPanelRect();
    // Przycisk ✏ jest w prawym górnym rogu nagłówka
    if (x >= PX + PW - 30 && x <= PX + PW - 4 && y >= PY + 4 && y <= PY + 24) {
      showRenameModal(entity.name).then(newName => {
        if (newName) entity.name = newName;
      });
      return true;
    }
    return false;
  }

  // Pochłania klik gdziekolwiek wewnątrz panelu info (zapobiega body:deselected)
  _isClickInInfoPanel(x, y) {
    const { PX, PY, PW, PH } = this._infoPanelRect();
    return x >= PX && x <= PX + PW && y >= PY && y <= PY + PH;
  }

  _hitTestInfoTabs(x, y) {
    const entity = this._selectedEntity;
    if (!entity) return false;

    const { PX, PY, PW } = this._infoPanelRect();

    const tabs = ['orbit', 'physics'];
    if (entity.composition) tabs.push('composition');
    const tabW = Math.floor((PW - 16) / tabs.length);

    for (let i = 0; i < tabs.length; i++) {
      const tx = PX + 8 + i * (tabW + 2);
      const ty = PY + 38;
      if (x >= tx && x <= tx + tabW && y >= ty && y <= ty + 16) {
        this._infoPanelTab = tabs[i];
        return true;
      }
    }

    return false;
  }

  _hitTestCivButton(x, y) {
    const entity = this._selectedEntity;
    if (!entity) return false;

    const { PX, PY, PW, PH } = this._infoPanelRect();

    const BY = PY + PH - 32;
    const BX = PX + 10;
    const BW = PW - 20;
    const civMode = window.KOSMOS?.civMode;
    const homePl  = window.KOSMOS?.homePlanet;
    const isHome  = homePl && entity.id === homePl.id;
    if (x >= BX && x <= BX + BW && y >= BY && y <= BY + 22) {
      if (!civMode && entity.type === 'planet' && (entity.lifeScore ?? 0) > 80) {
        EventBus.emit('planet:colonize', { planet: entity });
        return true;
      }
      if (civMode && isHome) {
        EventBus.emit('planet:openGlobe', { planet: entity });
        return true;
      }
    }
    return false;
  }

  _hitTestTimeControls(x, y) {
    if (y < H - 44 || y > H) return false;
    const CX      = W / 2;
    const LABELS  = GAME_CONFIG.TIME_MULTIPLIER_LABELS;
    const { isPaused } = this._timeState;

    // Przycisk PAUZA/GRAJ
    if (x >= CX - 255 && x <= CX - 165) {
      isPaused ? EventBus.emit('time:play') : EventBus.emit('time:pause');
      return true;
    }

    // Przyciski prędkości
    for (let i = 0; i < 5; i++) {
      const bx = CX - 124 + i * 62;
      if (x >= bx - 30 && x <= bx + 30) {
        EventBus.emit('time:setMultiplier', { index: i + 1 });
        EventBus.emit('time:play');
        return true;
      }
    }

    return false;
  }

  _hitTestGameButtons(x, y) {
    if (y < H - 44 || y > H) return false;
    const btns = this._getGameBtnDefs();
    for (const b of btns) {
      if (x >= b.x - 40 && x <= b.x) {
        this._handleGameBtn(b.id);
        return true;
      }
    }
    return false;
  }

  _handleGameBtn(id) {
    if (id === 'save') {
      EventBus.emit('game:save');
    } else if (id === 'load') {
      if (!SaveSystem.hasSave()) {
        this._addNotification('Brak zapisu do wczytania');
        return;
      }
      // Przeładuj stronę — BootScene automatycznie wykryje save w localStorage
      window.location.reload();
    } else if (id === 'new') {
      this._confirmDialog = { visible: true };
    } else if (id === 'sound') {
      this._audioEnabled = !this._audioEnabled;
      EventBus.emit('audio:toggle');
    } else if (id === 'auto') {
      EventBus.emit('time:autoSlowToggle');
    }
  }

  _hitTestActionPanel(x, y) {
    if (window.KOSMOS?.civMode) return false;
    const PW   = 220;
    const BTN_H = 36;
    const BTN_G = 6;
    const PAD   = 10;
    const PH    = PAD + 16 + 3 * (BTN_H + BTN_G) + PAD;
    const PX    = W - PW - 12;
    const PY    = H - PH - 56;

    if (x < PX || x > PX + PW || y < PY || y > PY + PH) return false;

    const actions = ['stabilize', 'nudgeToHz', 'bombard'];
    actions.forEach((act, i) => {
      const by = PY + PAD + 16 + 10 + i * (BTN_H + BTN_G);
      if (y >= by && y <= by + BTN_H) {
        EventBus.emit(`action:${act}`);
      }
    });
    return true;
  }

  // Wykrywanie hovera (dla kursora pointer)
  _detectHoverBtn(x, y) {
    // Dolny pasek: GameButtons (po prawej) → TimeControls (fallback)
    if (y >= H - 44 && y <= H) {
      const btns = this._getGameBtnDefs();
      for (const b of btns) {
        if (x >= b.x - 40 && x <= b.x) return b.id;
      }
      return 'time';
    }
    // CivPanel — sidebar i interaktywne elementy (tech klikalne)
    if (window.KOSMOS?.civMode) {
      const sidebarH = CIV_SIDEBAR_PAD + CIV_TABS.length * CIV_SIDEBAR_BTN
                     + (CIV_TABS.length - 1) * CIV_SIDEBAR_GAP;
      // Sidebar ikony
      if (x <= CIV_SIDEBAR_W && y >= CIV_PANEL_Y && y <= CIV_PANEL_Y + sidebarH) return 'civpanel';
      // Body panelu
      if (this._civPanelTab) {
        const bodyH = this._civPanelTab === 'expeditions' ? 300 : CIV_PANEL_BODY_H;
        if (x >= CIV_SIDEBAR_W && y >= CIV_PANEL_Y && y <= CIV_PANEL_Y + bodyH) return 'civpanel';
      }
    }
    // ActionPanel — ukryty w trybie 4X
    if (!window.KOSMOS?.civMode) {
      const PW  = 220;
      const PH  = 166;
      const PX  = W - PW - 12;
      const PY  = H - PH - 56;
      if (x >= PX && x <= PX + PW && y >= PY && y <= PY + PH) return 'action';
    }
    // InfoPanel zakładki
    if (this._selectedEntity) {
      const { PX: iPX, PY: iPY, PW: iPW } = this._infoPanelRect();
      if (x >= iPX && x <= iPX + iPW && y >= iPY + 38 && y <= iPY + 54) return 'tab';
    }
    return null;
  }

  // ── Narzędzie: zaokrąglony prostokąt ─────────────────────────
  _roundRect(ctx, x, y, w, h, r, fill, alpha, stroke) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = fill;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    if (stroke) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = stroke;
      ctx.lineWidth   = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Skrót roku do wyświetlenia w logu
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
