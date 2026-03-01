// Scena UI — nakładka HUD wyświetlana nad GameScene
// Uruchamiana równolegle z GameScene przez Phaser (scene.start('UIScene'))

import EventBus              from '../core/EventBus.js';
import { TimeControls }     from '../ui/TimeControls.js';
import { EventLog }         from '../ui/EventLog.js';
import { ActionPanel }      from '../ui/ActionPanel.js';
import { ExpeditionPanel }  from '../ui/ExpeditionPanel.js';

// Wysokości paneli (muszą odpowiadać ActionPanel.js)
const ACTION_PANEL_H   = 166;  // PANEL_H z ActionPanel.js
const ACTION_PANEL_OFS = 56;   // offset od dołu (nad TimeControls)
const INFO_PANEL_H     = 220;  // stała wysokość panelu info
const INFO_PANEL_W     = 300;  // szerokość panelu info
const INFO_GAP         = 8;    // odstęp między panelami

export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
    this._infoPanelTab    = 'orbit';  // 'orbit' | 'physics' | 'composition'
    this._infoPanelEntity = null;
  }

  create() {
    this.scene.bringToTop();  // upewnij się, że UI jest nad sceną gry

    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    // Kontrolki czasu (dół ekranu)
    this.timeControls = new TimeControls(this);

    // Tytuł (lewy górny róg)
    this.add.text(14, 12, 'K O S M O S', {
      fontSize:   '15px',
      fontFamily: 'monospace',
      color:      '#88ffcc',
    });

    this.add.text(14, 30, 'Symulator Układu Słonecznego', {
      fontSize:   '9px',
      fontFamily: 'monospace',
      color:      '#2a4060',
    });

    // ── Pasek stabilności (prawy górny róg) ─────────────────────
    this._buildStabilityBar(W);

    // ── Etykieta fazy dysku (górny środek) ───────────────────────
    this._buildDiskPhaseLabel(W);

    // ── Dziennik zdarzeń (lewy górny róg, pod tytułem) ──────────
    this.eventLog = new EventLog(this, 14, 50);
    this.eventLog.addInfo('Układ planetarny uformowany');

    // ── Panel ekspedycji (lewy bok, pod EventLog) ─────────────
    // EventLog: y=50, wysokość MAX_ENTRIES*14+30 = 198px → kończy się przy y=248
    this.expeditionPanel = new ExpeditionPanel(this, 14, 260);

    // ── Panel akcji gracza (prawy dolny róg) ─────────────────────
    this.actionPanel = new ActionPanel(this);

    // Panel informacji o wybranym ciele (prawy dolny róg, nad ActionPanel)
    this.infoPanel = null;

    // Panel pomocy klawiaturowej (toggle przez ?)
    this.helpPanel = null;

    // Podpowiedź sterowania (lewy dolny róg)
    this.add.text(14, H - 28, 'kółko: zoom  |  PPM: pan  |  ?: pomoc', {
      fontSize:   '9px',
      fontFamily: 'monospace',
      color:      '#2a4060',
    });

    // Nasłuchuj na zaznaczenie ciała niebieskiego
    EventBus.on('body:selected', ({ entity }) => {
      this._infoPanelEntity = entity;
      if (this._infoPanelTab === 'composition' && !entity.composition) {
        this._infoPanelTab = 'orbit';
      }
      this._buildInfoPanel();
    });

    // Odśwież panel gdy planeta jest aktualizowana (po bombardowaniu, pchnięciu itp.)
    EventBus.on('player:planetUpdated', ({ planet }) => {
      if (this._infoPanelEntity && this._infoPanelEntity.id === planet.id) {
        this._buildInfoPanel();
      }
    });

    // Odśwież po zmianie składu przez bombardowanie
    EventBus.on('planet:compositionChanged', ({ planet }) => {
      if (this._infoPanelEntity && this._infoPanelEntity.id === planet.id) {
        this._buildInfoPanel();
      }
    });

    // Odśwież po kolizji (zmiana orbity, życia)
    EventBus.on('body:collision', () => {
      if (this._infoPanelEntity) this._buildInfoPanel();
    });

    // Toggle panelu pomocy (emitowany przez GameScene na Shift+/)
    EventBus.on('ui:toggleHelp', () => {
      if (this.helpPanel) {
        this._closeHelp();
      } else {
        this._openHelp();
      }
    });

    // Aktualizuj pasek stabilności
    EventBus.on('system:stabilityChanged', ({ score, trend }) => {
      this._updateStabilityBar(score, trend);
    });

    // ── Przyciski zarządzania grą (prawy górny róg, pod stability barem) ──
    this._audioEnabled   = true;
    this._autoSlowActive = true;  // domyślnie auto-slow włączone
    this._autoBtnText    = null;
    this._buildGameButtons(W);

    // Synchronizuj przycisk [AUT] ze stanem TimeSystem
    EventBus.on('time:display', ({ autoSlow }) => {
      this._autoSlowActive = autoSlow;
      if (this._autoBtnText) {
        this._autoBtnText.setStyle({ color: autoSlow ? '#2a4060' : '#cc4422' });
      }
    });

    // Aktualizuj etykietę fazy dysku przy zmianie fazy
    EventBus.on('disk:phaseChanged', ({ newPhase, newPhasePL }) => {
      this._updateDiskPhaseLabel(newPhase, newPhasePL);
    });

    // Notyfikacja autosave — krótki tekst fade-out
    EventBus.on('game:saved', ({ gameTime }) => {
      const years = Math.round(gameTime).toLocaleString('pl-PL');
      const notif = this.add.text(W - 10, 36, `\u{1F4BE} Zapisano (${years} lat)`, {
        fontSize:   '10px',
        fontFamily: 'monospace',
        color:      '#88ffcc',
      }).setOrigin(1, 0).setDepth(30);
      this.tweens.add({
        targets:  notif,
        alpha:    0,
        delay:    2200,
        duration: 600,
        onComplete: () => notif.destroy(),
      });
    });
  }

  // ── Przyciski zarządzania grą ─────────────────────────────────
  // [ZAP] = Zapisz  [NOW] = Nowa gra  [DZW] = Dźwięk  [AUT] = Auto-slow toggle
  _buildGameButtons(W) {
    const y    = 36;   // poniżej paska stabilności
    const btnW = 34;
    const gap  = 4;

    // Pozycje (od prawej): [DZW] [NOW] [ZAP] [AUT]
    const positions = [
      { x: W - 14,                         label: '[DZW]', key: 'sound' },
      { x: W - 14 - (btnW + gap),          label: '[NOW]', key: 'new'   },
      { x: W - 14 - (btnW + gap) * 2,      label: '[ZAP]', key: 'save'  },
      { x: W - 14 - (btnW + gap) * 3,      label: '[AUT]', key: 'auto'  },
    ];

    this._soundBtnText = null;

    for (const { x, label, key } of positions) {
      const btn = this.add.text(x, y, label, {
        fontSize:   '9px',
        fontFamily: 'monospace',
        color:      '#2a4060',
      }).setOrigin(1, 0).setDepth(25).setInteractive({ useHandCursor: true });

      btn.on('pointerover', () => btn.setStyle({ color: '#6888aa' }));
      btn.on('pointerout',  () => {
        if (key === 'sound') {
          btn.setStyle({ color: this._audioEnabled   ? '#2a4060' : '#cc4422' });
        } else if (key === 'auto') {
          btn.setStyle({ color: this._autoSlowActive ? '#2a4060' : '#cc4422' });
        } else {
          btn.setStyle({ color: '#2a4060' });
        }
      });

      btn.on('pointerdown', () => {
        if (key === 'save') {
          EventBus.emit('game:save');
        } else if (key === 'new') {
          this._showNewGameConfirm();
        } else if (key === 'sound') {
          this._audioEnabled = !this._audioEnabled;
          EventBus.emit('audio:toggle');
          btn.setStyle({ color: this._audioEnabled ? '#2a4060' : '#cc4422' });
        } else if (key === 'auto') {
          EventBus.emit('time:autoSlowToggle');
          // Kolor zaktualizuje listener time:display po odpowiedzi TimeSystem
        }
      });

      if (key === 'sound') this._soundBtnText = btn;
      if (key === 'auto')  this._autoBtnText  = btn;
    }
  }

  // Dialog potwierdzenia nowej gry
  _showNewGameConfirm() {
    if (this._confirmPanel) return;  // nie duplikuj
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    const overlay = this.add.graphics().setDepth(50);
    overlay.fillStyle(0x000000, 0.55);
    overlay.fillRect(0, 0, W, H);

    const panelW = 300;
    const panelH = 90;
    const px = W / 2 - panelW / 2;
    const py = H / 2 - panelH / 2;

    overlay.fillStyle(0x111828, 1);
    overlay.fillRect(px, py, panelW, panelH);
    overlay.lineStyle(1, 0x2a4060, 1);
    overlay.strokeRect(px, py, panelW, panelH);

    const question = this.add.text(W / 2, py + 22, 'Rozpocząć nową grę?', {
      fontSize: '13px', fontFamily: 'monospace', color: '#c8e8ff',
    }).setOrigin(0.5).setDepth(51);

    const sub = this.add.text(W / 2, py + 40, 'Aktualny postęp zostanie utracony.', {
      fontSize: '10px', fontFamily: 'monospace', color: '#6888aa',
    }).setOrigin(0.5).setDepth(51);

    const btnYes = this.add.text(W / 2 - 50, py + 62, '[ TAK ]', {
      fontSize: '11px', fontFamily: 'monospace', color: '#ff8888',
    }).setOrigin(0.5).setDepth(51).setInteractive({ useHandCursor: true });

    const btnNo = this.add.text(W / 2 + 50, py + 62, '[ ANULUJ ]', {
      fontSize: '11px', fontFamily: 'monospace', color: '#88ffcc',
    }).setOrigin(0.5).setDepth(51).setInteractive({ useHandCursor: true });

    const close = () => {
      overlay.destroy(); question.destroy(); sub.destroy();
      btnYes.destroy(); btnNo.destroy();
      this._confirmPanel = null;
    };

    btnYes.on('pointerdown', () => { close(); EventBus.emit('game:new'); });
    btnNo.on('pointerdown',  () => close());
    btnYes.on('pointerover', () => btnYes.setStyle({ color: '#ffaaaa' }));
    btnYes.on('pointerout',  () => btnYes.setStyle({ color: '#ff8888' }));

    this._confirmPanel = { overlay, question, sub, btnYes, btnNo };
  }

  // ── Pasek stabilności ─────────────────────────────────────────
  _buildStabilityBar(W) {
    const BAR_W = 140;
    const BAR_H = 8;
    const TXT_W = 46;              // miejsce na "100 ▲" (4 znaki + strzałka)
    const BAR_X = W - BAR_W - TXT_W - 14;
    const BAR_Y = 14;

    // Etykieta
    this.add.text(BAR_X, BAR_Y, 'STABILNOŚĆ', {
      fontSize:   '9px',
      fontFamily: 'monospace',
      color:      '#2a4060',
    }).setDepth(20);

    // Tło paska
    const bgBar = this.add.graphics().setDepth(20);
    bgBar.fillStyle(0x0d1520, 1);
    bgBar.fillRect(BAR_X, BAR_Y + 12, BAR_W, BAR_H);
    bgBar.lineStyle(1, 0x1a3050, 1);
    bgBar.strokeRect(BAR_X, BAR_Y + 12, BAR_W, BAR_H);

    // Wypełnienie (dynamiczne)
    this._stabilityFill = this.add.graphics().setDepth(21);
    this._stabilityBarX = BAR_X;
    this._stabilityBarY = BAR_Y + 12;
    this._stabilityBarW = BAR_W;
    this._stabilityBarH = BAR_H;

    // Liczba i strzałka trendu — zakotwiczone do prawej krawędzi ekranu
    this._stabilityText = this.add.text(W - 6, BAR_Y + 10, '50 –', {
      fontSize:   '10px',
      fontFamily: 'monospace',
      color:      '#6888aa',
    }).setOrigin(1, 0.5).setDepth(20);

    this._updateStabilityBar(50, 'stable');
  }

  _updateStabilityBar(score, trend) {
    const fillW = Math.round((score / 100) * this._stabilityBarW);

    let color;
    if (score >= 70)      color = 0x44cc66;
    else if (score >= 40) color = 0xccaa22;
    else                  color = 0xcc4422;

    this._stabilityFill.clear();
    if (fillW > 0) {
      this._stabilityFill.fillStyle(color, 0.85);
      this._stabilityFill.fillRect(
        this._stabilityBarX,
        this._stabilityBarY,
        fillW,
        this._stabilityBarH
      );
    }

    const arrow  = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '–';
    const tColor = trend === 'up' ? '#44cc66' : trend === 'down' ? '#cc4422' : '#6888aa';
    this._stabilityText.setText(`${score} ${arrow}`);
    this._stabilityText.setStyle({ color: tColor });
  }

  // ── Panel informacji — system zakładek ────────────────────────
  // Stała wysokość INFO_PANEL_H, pozycja nad ActionPanel
  _buildInfoPanel() {
    // Usuń stary panel
    if (this.infoPanel) {
      this.infoPanel.forEach(obj => obj.destroy());
      this.infoPanel = null;
    }

    const entity = this._infoPanelEntity;
    if (!entity) return;

    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    // Pozycja panelu — stała, nad ActionPanel (nie nakłada się)
    const panelW = INFO_PANEL_W;
    const panelH = INFO_PANEL_H;
    const panelX = W - panelW - 12;
    const panelY = H - (ACTION_PANEL_H + ACTION_PANEL_OFS) - INFO_GAP - panelH;

    const objects = [];

    // ── Tło i obramowanie ────────────────────────────────────────
    const bg = this.add.rectangle(
      panelX + panelW / 2, panelY + panelH / 2,
      panelW, panelH, 0x0d1520, 0.94
    ).setDepth(20);
    objects.push(bg);

    const border = this.add.graphics().setDepth(20);
    border.lineStyle(1, 0x2a4060, 1);
    border.strokeRect(panelX, panelY, panelW, panelH);
    objects.push(border);

    // ── Tytuł (nazwa ciała) ──────────────────────────────────────
    objects.push(this.add.text(panelX + 8, panelY + 6, `● ${entity.name}`, {
      fontSize: '14px', fontFamily: 'monospace', color: '#88ffcc',
    }).setDepth(21));

    // ── Przycisk zamknij [×] ─────────────────────────────────────
    const closeBtn = this.add.text(panelX + panelW - 6, panelY + 4, '×', {
      fontSize: '13px', fontFamily: 'monospace', color: '#ff8888',
    }).setOrigin(1, 0).setDepth(22).setInteractive()
      .on('pointerdown', () => {
        objects.forEach(o => o.destroy());
        this.infoPanel        = null;
        this._infoPanelEntity = null;
      })
      .on('pointerover', () => closeBtn.setStyle({ color: '#ffaaaa' }))
      .on('pointerout',  () => closeBtn.setStyle({ color: '#ff8888' }));
    objects.push(closeBtn);

    // ── Zakładki (tylko dla planet) ───────────────────────────────
    const isPlanet = entity.type === 'planet';
    if (isPlanet) {
      const TABS = [
        { id: 'orbit',       label: 'ORBITA' },
        { id: 'physics',     label: 'FIZYKA' },
        { id: 'composition', label: 'SKŁAD'  },
      ];
      const tabAreaW = panelW - 16;
      const tabW     = Math.floor(tabAreaW / TABS.length);
      const tabY     = panelY + 22;

      TABS.forEach((tab, i) => {
        const tx       = panelX + 8 + i * tabW;
        const isActive = this._infoPanelTab === tab.id;

        const tabBg = this.add.rectangle(
          tx + tabW / 2, tabY + 8, tabW - 2, 16,
          isActive ? 0x1a3a5a : 0x080f18, 1
        ).setDepth(21).setInteractive()
          .on('pointerdown', () => {
            this._infoPanelTab = tab.id;
            this._buildInfoPanel();
          })
          .on('pointerover', () => {
            if (!isActive) tabBg.setFillStyle(0x1a2a40, 1);
          })
          .on('pointerout', () => {
            if (!isActive) tabBg.setFillStyle(0x080f18, 1);
          });
        objects.push(tabBg);

        objects.push(this.add.text(tx + tabW / 2, tabY + 8, tab.label, {
          fontSize: '10px', fontFamily: 'monospace',
          color: isActive ? '#88ffcc' : '#3a5a7a',
        }).setOrigin(0.5, 0.5).setDepth(22));
      });

      // Separator pod zakładkami
      const sep = this.add.graphics().setDepth(21);
      sep.lineStyle(1, 0x1a3050, 1);
      sep.lineBetween(panelX + 4, panelY + 41, panelX + panelW - 4, panelY + 41);
      objects.push(sep);
    }

    // ── Wiersze zawartości ────────────────────────────────────────
    const contentStartY = isPlanet ? panelY + 47 : panelY + 26;
    const rows = this._getTabContent(entity);

    rows.forEach(([key, val], i) => {
      objects.push(this.add.text(panelX + 8, contentStartY + i * 18, key + ':', {
        fontSize: '12px', fontFamily: 'monospace', color: '#4a6a8a',
      }).setDepth(21));
      objects.push(this.add.text(panelX + panelW - 8, contentStartY + i * 18, String(val), {
        fontSize: '12px', fontFamily: 'monospace', color: '#c8e8ff',
      }).setOrigin(1, 0).setDepth(21));
    });

    // ── Przycisk "Przejmij cywilizację" / "Mapa planety" ────────────────────
    // Widoczny gdy zaznaczona planeta ma cywilizację (lifeScore > 80)
    // lub gracz jest już w trybie 4X i patrzy na swoją kolonię
    if (isPlanet) {
      const hasCiv    = entity.lifeScore > 80;
      const civActive = !!window.KOSMOS?.civMode;
      const isHome    = entity === window.KOSMOS?.homePlanet;

      if (hasCiv || (civActive && isHome)) {
        const isTakeover = !civActive;
        const btnLabel   = isTakeover ? '▶  Przejmij cywilizację' : '▶  Mapa planety';
        const btnEvt     = isTakeover ? 'planet:colonize'         : 'planet:openMap';
        const btnColor   = isTakeover ? '#88ffcc'                 : '#aaccff';

        const mapBtn = this.add.text(
          panelX + panelW / 2,
          panelY + panelH + 5,
          btnLabel,
          {
            fontSize:        '10px',
            fontFamily:      'monospace',
            color:           btnColor,
            backgroundColor: '#070f1a',
            padding:         { x: 10, y: 5 },
          }
        ).setOrigin(0.5, 0).setDepth(21)
         .setInteractive({ useHandCursor: true })
         .on('pointerover',  () => mapBtn.setStyle({ color: '#eeffee' }))
         .on('pointerout',   () => mapBtn.setStyle({ color: btnColor }))
         .on('pointerdown',  () => EventBus.emit(btnEvt, { planet: entity }));

        objects.push(mapBtn);
      }
    }

    this.infoPanel = objects;
  }

  // Zwraca tablicę [klucz, wartość] dla aktywnej zakładki
  _getTabContent(entity) {
    if (entity.type === 'planet') return this._getPlanetTabContent(entity);
    if (entity.type === 'star')   return this._getStarContent(entity);
    // Fallback dla innych typów
    const info = entity.getDisplayInfo();
    return Object.entries(info).slice(1, 8);
  }

  _getPlanetTabContent(planet) {
    switch (this._infoPanelTab) {

      case 'orbit': {
        const tempC   = planet.surface.temperature;
        const tempStr = tempC >= 0 ? `+${tempC.toFixed(0)} °C` : `${tempC.toFixed(0)} °C`;
        // physics.mass przechowywane w masach Ziemi (0.2–300+ M⊕) — bez przelicznika
        const M_E     = planet.physics.mass.toFixed(2);
        return [
          ['Orbita',   planet.orbital.a.toFixed(3) + ' AU'],
          ['Mimośród', planet.orbital.e.toFixed(3)],
          ['Rok',      planet.orbital.T.toFixed(2) + ' lat'],
          ['Typ',      planet.planetType],
          ['Masa',     M_E + ' M⊕'],
          ['Temp.',    tempStr],
          ['Albedo',   planet.albedo.toFixed(2)],
        ];
      }

      case 'physics': {
        const ls = planet.lifeScore;
        const lifeLabel = ls <= 0  ? 'Jałowa'      :
                          ls <= 20 ? 'Prebiotyczna' :
                          ls <= 50 ? 'Mikroby'      :
                          ls <= 80 ? 'Złożone'      : 'Cywilizacja';
        const lifeVal = ls > 0 ? `${lifeLabel} ${Math.round(ls)}%` : 'Jałowa';
        const magPct  = planet.surface.magneticField > 0
          ? (planet.surface.magneticField * 100).toFixed(0) + '%' : 'brak';
        return [
          ['Stabilność', Math.round(planet.orbitalStability * 100) + '%'],
          ['Atmosfera',  planet.atmosphere],
          ['Woda',       planet.surface.hasWater ? '✓ tak' : 'nie'],
          ['Mag. pole',  magPct],
          ['Życie',      lifeVal],
          ['Wiek',       Math.floor(planet.age).toLocaleString() + ' lat'],
        ];
      }

      case 'composition': {
        if (!planet.composition) {
          return [['Skład', 'brak danych']];
        }
        // Top-7 pierwiastków wg zawartości procentowej
        const sorted = Object.entries(planet.composition)
          .filter(([, v]) => v >= 0.1)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 7);
        if (sorted.length === 0) return [['Skład', 'nieznany']];
        return sorted.map(([el, pct]) => [el, pct.toFixed(1) + '%']);
      }

      default:
        return [];
    }
  }

  _getStarContent(star) {
    return [
      ['Typ spekt.',  star.spectralType || '?'],
      ['Masa',        (star.physics?.mass || 0).toFixed(2) + ' M☉'],
      ['Jasność',     (star.luminosity   || 0).toFixed(3) + ' L☉'],
      ['HZ min',      (star.habitableZone?.min || 0).toFixed(2) + ' AU'],
      ['HZ max',      (star.habitableZone?.max || 0).toFixed(2) + ' AU'],
      ['Wiek',        Math.floor(star.age || 0).toLocaleString() + ' lat'],
    ];
  }

  // ── Panel pomocy klawiaturowej ─────────────────────────────
  _openHelp() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    const KEYS = [
      { key: 'SPACJA',  desc: 'pauza / graj' },
      { key: '1',       desc: '1 dzień / sekundę' },
      { key: '2',       desc: '1 miesiąc / sekundę' },
      { key: '3',       desc: '1 rok / sekundę' },
      { key: '4',       desc: '10 lat / sekundę' },
      { key: '5',       desc: '10 000 lat / sekundę' },
      { key: '[ ]',     desc: 'wolniej / szybciej' },
      { key: 'H',       desc: 'resetuj kamerę' },
      { key: 'kółko',   desc: 'zoom kamery' },
      { key: 'PPM',     desc: 'przesuń kamerę' },
      { key: '?',       desc: 'ta pomoc (toggle)' },
    ];

    const panelW = 280;
    const rowH   = 18;
    const panelH = 36 + KEYS.length * rowH + 10;
    const panelX = (W - panelW) / 2;
    const panelY = (H - panelH) / 2;

    const objs = [];

    // Przyciemnienie tła
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setDepth(30);
    objs.push(dim);

    // Tło panelu
    const bg = this.add.rectangle(W / 2, H / 2, panelW, panelH, 0x0d1520, 0.97).setDepth(31);
    objs.push(bg);

    // Obramowanie
    const border = this.add.graphics().setDepth(31);
    border.lineStyle(1, 0x2a6080, 1);
    border.strokeRect(panelX, panelY, panelW, panelH);
    objs.push(border);

    // Nagłówek
    objs.push(this.add.text(W / 2, panelY + 12, 'SKRÓTY KLAWIATUROWE', {
      fontSize:   '12px',
      fontFamily: 'monospace',
      color:      '#88ffcc',
    }).setOrigin(0.5, 0).setDepth(32));

    // Linia pod nagłówkiem
    const line = this.add.graphics().setDepth(32);
    line.lineStyle(1, 0x2a4060, 1);
    line.lineBetween(panelX + 10, panelY + 28, panelX + panelW - 10, panelY + 28);
    objs.push(line);

    // Wiersze klawiszy
    KEYS.forEach(({ key, desc }, i) => {
      const rowY = panelY + 36 + i * rowH;
      // Klawisz (lewa kolumna)
      objs.push(this.add.text(panelX + 14, rowY, key, {
        fontSize: '11px', fontFamily: 'monospace', color: '#ffcc66',
      }).setDepth(32));
      // Opis (prawa kolumna)
      objs.push(this.add.text(panelX + 90, rowY, desc, {
        fontSize: '11px', fontFamily: 'monospace', color: '#c8e8ff',
      }).setDepth(32));
    });

    // Przycisk zamknij [×] i podpowiedź
    objs.push(this.add.text(panelX + panelW - 8, panelY + 6, '×', {
      fontSize: '14px', fontFamily: 'monospace', color: '#ff8888',
    }).setOrigin(1, 0).setDepth(33).setInteractive()
      .on('pointerdown', () => this._closeHelp())
      .on('pointerover', function() { this.setStyle({ color: '#ffaaaa' }); })
      .on('pointerout',  function() { this.setStyle({ color: '#ff8888' }); }));

    // Kliknięcie poza panelem → zamknij
    dim.setInteractive().on('pointerdown', () => this._closeHelp());

    this.helpPanel = objs;
  }

  _closeHelp() {
    if (this.helpPanel) {
      this.helpPanel.forEach(o => o.destroy());
      this.helpPanel = null;
    }
  }

  // ── Etykieta fazy dysku protoplanetarnego (górny środek) ────────
  _buildDiskPhaseLabel(W) {
    const PHASE_INFO = {
      DISK:     { namePL: 'Dysk protoplanetarny', color: '#cc4422', icon: '🌑' },
      CLEARING: { namePL: 'Oczyszczanie orbit',   color: '#ccaa22', icon: '🌓' },
      MATURE:   { namePL: 'Układ dojrzały',       color: '#44cc66', icon: '🌍' },
    };
    const phase = window.KOSMOS?.diskPhase ?? 'DISK';
    const p     = PHASE_INFO[phase] ?? PHASE_INFO.DISK;

    this._diskPhaseText = this.add.text(W / 2, 14, `${p.icon} ${p.namePL}`, {
      fontSize:   '9px',
      fontFamily: 'monospace',
      color:      p.color,
    }).setOrigin(0.5, 0).setDepth(20);
  }

  _updateDiskPhaseLabel(newPhase, newPhasePL) {
    if (!this._diskPhaseText) return;
    const PHASE_COLORS = { DISK: '#cc4422', CLEARING: '#ccaa22', MATURE: '#44cc66' };
    const PHASE_ICONS  = { DISK: '🌑',      CLEARING: '🌓',      MATURE: '🌍'     };
    const color = PHASE_COLORS[newPhase] ?? '#6888aa';
    const icon  = PHASE_ICONS[newPhase]  ?? '●';
    this._diskPhaseText.setText(`${icon} ${newPhasePL}`);
    this._diskPhaseText.setStyle({ color });
  }
}
