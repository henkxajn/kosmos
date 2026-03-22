// GalaxyMapScene — overlay mapy galaktycznej (klawisz G)
//
// Pełnoekranowa scena 3D z okolicznymi układami gwiezdnymi.
// Extends BaseOverlay — OverlayManager zarządza show/hide.
// Osadza GalaxyMapRenderer (WebGL canvas) + panele Canvas 2D na #ui-canvas.
// Otwarcie pauzuje czas gry, zamknięcie wznawia.

import { BaseOverlay }         from '../ui/BaseOverlay.js';
import { THEME, bgAlpha, drawGlassPanel, GLASS_BORDER, GLASS_HIGHLIGHT } from '../config/ThemeConfig.js';
import { COSMIC }              from '../config/LayoutConfig.js';
import { CIV_SIDEBAR_W }      from '../ui/CivPanelDrawer.js';
import { GalaxyMapRenderer }   from '../renderer/GalaxyMapRenderer.js';
import { STAR_TYPES }          from '../config/GameConfig.js';
import EventBus                from '../core/EventBus.js';
import { t }                   from '../i18n/i18n.js';
import { SHIPS }               from '../data/ShipsData.js';

// ── Layout ────────────────────────────────────────────────────────────────────
const HDR_H   = 44;    // nagłówek
const LEFT_W  = 220;   // lewy panel info
const BOT_H   = 36;    // dolny pasek (legenda)

// Skala UI — dynamiczna
let _UI_SCALE = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
window.addEventListener('resize', () => {
  _UI_SCALE = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
});

// Etykiety typów spektralnych — runtime getter (i18n)
const SPECTRAL_LABELS = {
  get M() { return t('galaxy.starM'); },
  get K() { return t('galaxy.starK'); },
  get G() { return t('galaxy.starG'); },
  get F() { return t('galaxy.starF'); },
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

    // ── Wyczyść środek — tu prześwituje WebGL galaktyki ──────────────────
    const viewX = ox + LEFT_W;
    const viewY = HDR_H;
    const viewW = W - viewX;
    const viewH = H - HDR_H - BOT_H;
    ctx.clearRect(viewX, viewY, viewW, viewH);

    // ── Nagłówek (glass) ────────────────────────────────────────────────
    drawGlassPanel(ctx, ox, 0, W - ox, HDR_H, { leftBorder: false });

    ctx.fillStyle = THEME.accent;
    ctx.font = `bold ${THEME.fontSizeTitle}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText(t('galaxy.title'), ox + 12, HDR_H / 2 + 5);

    // Przycisk zamknij [ESC ×]
    const closeW = 60, closeH = 22;
    const closeX = W - closeW - 10;
    const closeY = (HDR_H - closeH) / 2;
    const closeLabel = t('galaxy.close');
    this._drawButton(ctx, closeLabel, closeX, closeY, closeW, closeH, 'secondary');
    this._addHit(closeX, closeY, closeW, closeH, 'close', { label: closeLabel });

    // ── Lewy panel (info o wybranym systemie) ─────────────────────────────
    const panelY = HDR_H;
    const panelH = H - HDR_H - BOT_H;

    drawGlassPanel(ctx, ox, panelY, LEFT_W, panelH, { topBorder: false, leftBorder: false });

    const px = ox + 10;
    let py = panelY + 16;

    if (this._selectedSystem) {
      const sys = this._selectedSystem;

      // Nazwa
      ctx.fillStyle = THEME.accent;
      ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
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
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
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
      ctx.fillText(t('galaxy.mass'), px, py);
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(`${sys.mass} M☉`, px + 65, py);
      py += 16;

      // Luminosity
      ctx.fillStyle = THEME.textLabel;
      ctx.fillText(t('galaxy.luminosity'), px, py);
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(`${sys.luminosity} L☉`, px + 65, py);
      py += 16;

      // Odległość
      ctx.fillStyle = THEME.textLabel;
      ctx.fillText(t('galaxy.distance'), px, py);
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
      ctx.fillText(t('galaxy.status'), px, py);
      py += 16;
      if (sys.isHome) {
        ctx.fillStyle = THEME.accent;
        ctx.fillText(t('galaxy.yourSystem'), px, py);
      } else if (sys.explored) {
        ctx.fillStyle = THEME.success;
        ctx.fillText(t('galaxy.explored'), px, py);
      } else {
        ctx.fillStyle = THEME.warning;
        ctx.fillText(t('galaxy.unexplored'), px, py);
      }
      py += 24;

      // ── Infrastruktura ──
      const ssMgr = window.KOSMOS?.starSystemManager;
      if (ssMgr && !sys.isHome) {
        const hasBeacon = ssMgr.hasBeacon(sys.id);
        const hasGate   = ssMgr.hasJumpGate(sys.id);
        const sysData   = ssMgr.getSystem(sys.id);
        const hasColony = sysData ? ssMgr.getSystemColonies(sys.id).length > 0 : false;

        // Ikony infrastruktury
        ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
        if (hasColony) {
          ctx.fillStyle = THEME.accent;
          ctx.fillText('🏗 ' + t('galaxy.hasColony'), px, py);
          py += 16;
        }
        if (hasBeacon) {
          ctx.fillStyle = '#66ccff';
          ctx.fillText('📡 ' + t('galaxy.warpBeacon'), px, py);
          py += 16;
        }
        if (hasGate) {
          ctx.fillStyle = '#cc88ff';
          ctx.fillText('🌀 ' + t('galaxy.jumpGate'), px, py);
          py += 16;
        }

        // Przyciski budowy orbitalnej (jeśli kolonia w tym układzie)
        const tSys0 = window.KOSMOS?.techSystem;
        if (hasColony && !hasBeacon && tSys0?.isResearched('warp_theory')) {
          const btnW = LEFT_W - 24;
          const btnH = 22;
          this._drawButton(ctx, '📡 ' + t('galaxy.buildBeacon'), px, py, btnW, btnH, 'primary');
          this._addHit(px, py, btnW, btnH, 'buildBeacon', { systemId: sys.id });
          py += btnH + 4;
        }
        if (hasColony && !hasGate && tSys0?.isResearched('interstellar_colonization')) {
          const btnW = LEFT_W - 24;
          const btnH = 22;
          this._drawButton(ctx, '🌀 ' + t('galaxy.buildGate'), px, py, btnW, btnH, 'primary');
          this._addHit(px, py, btnW, btnH, 'buildGate', { systemId: sys.id });
          py += btnH + 4;
        }
        py += 4;
      }

      // ── Przyciski akcji ──
      if (!sys.isHome) {
        const ssMgr2  = window.KOSMOS?.starSystemManager;
        const sysData = ssMgr2?.getSystem(sys.id);
        const vMgr    = window.KOSMOS?.vesselManager;
        const tSys    = window.KOSMOS?.techSystem;

        // Czy interstellar odblokowany (tech warp_drive)
        const hasWarpTech = tSys?.isResearched('warp_drive') ?? false;

        // Przycisk "Przełącz widok" — tylko dla odwiedzonych układów
        if (sysData) {
          const btnW = LEFT_W - 24;
          const btnH = 24;
          this._drawButton(ctx, t('galaxy.switchView'), px, py, btnW, btnH, 'primary');
          this._addHit(px, py, btnW, btnH, 'switchView', { systemId: sys.id });
          py += btnH + 8;
        }

        // Przycisk "Wyślij statek" — potrzebna tech warp_drive + warpCapable ship
        if (hasWarpTech && vMgr) {
          const warpShips = this._getAvailableWarpShips();
          if (warpShips.length > 0) {
            // Nagłówek
            ctx.fillStyle = THEME.accent;
            ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
            ctx.fillText(t('galaxy.sendShip'), px, py);
            py += 18;

            // Klikalna lista statków
            const btnW = LEFT_W - 24;
            const shipBtnH = 32;
            for (const v of warpShips.slice(0, 5)) {
              const shipDef = SHIPS[v.shipId];
              const rangeLY = (v.fuel.current / (shipDef?.fuelPerLY ?? 0.5)).toFixed(1);

              // Sprawdź paliwo na dystans
              let hasFuel = true;
              const gd = window.KOSMOS?.galaxyData;
              const fromStar = gd?.systems?.find(s => s.id === (v.systemId ?? 'sys_home'));
              if (fromStar && sys) {
                const dx = sys.x - fromStar.x;
                const dy = sys.y - fromStar.y;
                const dz = (sys.z ?? 0) - (fromStar.z ?? 0);
                const distLY = Math.sqrt(dx * dx + dy * dy + dz * dz);
                hasFuel = v.fuel.current >= distLY * (shipDef?.fuelPerLY ?? 0.5);
              }

              // Tło przycisku
              ctx.fillStyle = hasFuel ? 'rgba(0,255,180,0.06)' : 'rgba(60,60,60,0.15)';
              ctx.fillRect(px, py, btnW, shipBtnH);
              ctx.strokeStyle = hasFuel ? THEME.accent : THEME.border;
              ctx.lineWidth = 1;
              ctx.strokeRect(px, py, btnW, shipBtnH);

              // Ikona + nazwa
              ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
              ctx.fillStyle = hasFuel ? THEME.textPrimary : THEME.textDim;
              const icon = shipDef?.icon ?? '🚀';
              const name = v.name.length > 16 ? v.name.slice(0, 15) + '…' : v.name;
              ctx.fillText(`${icon} ${name}`, px + 4, py + 13);

              // Zasięg
              ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
              ctx.fillStyle = hasFuel ? THEME.textSecondary : THEME.textDim;
              ctx.fillText(`⛽ ${rangeLY} LY`, px + 4, py + 26);

              if (hasFuel) {
                this._addHit(px, py, btnW, shipBtnH, 'sendShipSelect', { vesselId: v.id, systemId: sys.id });
              }

              py += shipBtnH + 3;
            }
            if (warpShips.length > 5) {
              ctx.fillStyle = THEME.textDim;
              ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
              ctx.fillText(`  +${warpShips.length - 5} ${t('galaxy.more')}...`, px, py + 10);
              py += 16;
            }
          } else {
            // Brak statków warpowych
            ctx.fillStyle = THEME.textDim;
            ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
            ctx.fillText(t('galaxy.noWarpShips'), px, py);
            py += 16;
          }
        } else if (!hasWarpTech) {
          // Tech nie zbadana
          ctx.fillStyle = THEME.textDim;
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          const lines = this._wrapText(ctx, t('galaxy.needWarpTech'), LEFT_W - 24);
          for (const line of lines) {
            ctx.fillText(line, px, py);
            py += 14;
          }
        }

        // ── Statki w tranzycie do tego systemu ──
        py += 8;
        const transitVessels = vMgr?.getInterstellarVessels()?.filter(
          v => v.mission?.toSystemId === sys.id
        ) ?? [];
        if (transitVessels.length > 0) {
          ctx.fillStyle = THEME.textLabel;
          ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillText(t('galaxy.inTransit'), px, py);
          py += 14;
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          for (const v of transitVessels) {
            const progress = v.mission?.galProgress ?? 0;
            ctx.fillStyle = THEME.textSecondary;
            ctx.fillText(`  ${v.name} (${(progress * 100).toFixed(0)}%)`, px, py);
            py += 14;
          }
        }
      }

    } else {
      // Nic nie wybrane
      ctx.fillStyle = THEME.textDim;
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      const lines = this._wrapText(ctx, t('galaxy.clickStar'), LEFT_W - 24);
      for (const line of lines) {
        ctx.fillText(line, px, py);
        py += 16;
      }
    }

    // ── Dolny pasek (legenda typów) ───────────────────────────────────────
    const botY = H - BOT_H;
    drawGlassPanel(ctx, ox, botY, W - ox, BOT_H, { leftBorder: false, bottomBorder: false });

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
    ctx.fillText(t('galaxy.systemsInRange', sysCount), W - 12, ly);
    ctx.textAlign = 'left';
  }

  // ── Interakcje ────────────────────────────────────────────────────────────

  handleClick(x, y) {
    if (!this.visible) return false;

    // Nie przechwytuj kliknięć na CivPanel sidebar — pozwól UIManager je obsłużyć
    if (x < CIV_SIDEBAR_W) return false;

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

    return true; // przechwytuj klik w obszarze overlaya
  }

  _onHit(zone) {
    if (zone.type === 'close') {
      this.hide();
      if (window.KOSMOS?.overlayManager) {
        window.KOSMOS.overlayManager.active = null;
      }
    }

    if (zone.type === 'switchView') {
      const ssMgr = window.KOSMOS?.starSystemManager;
      if (ssMgr) {
        ssMgr.switchActiveSystem(zone.systemId);
        this.hide();
        if (window.KOSMOS?.overlayManager) {
          window.KOSMOS.overlayManager.active = null;
        }
      }
    }

    if (zone.type === 'sendShip') {
      this._handleSendShip(zone.systemId, zone.ships);
    }

    if (zone.type === 'sendShipSelect') {
      this._handleSendShipDirect(zone.data.vesselId, zone.data.systemId);
    }

    if (zone.type === 'buildBeacon') {
      // TODO: sprawdź koszty zasobów i odejmij (na razie: bezkosztowo dla prototypu)
      EventBus.emit('orbital:buildBeacon', { systemId: zone.systemId });
    }

    if (zone.type === 'buildGate') {
      EventBus.emit('orbital:buildJumpGate', { systemId: zone.systemId, connectedTo: null });
    }
  }

  /**
   * Wyślij pierwszy dostępny statek warpowy do wybranego układu.
   * (Przyszłość: dialog wyboru statku; na razie — pierwszy z listy)
   */
  _handleSendShip(targetSystemId, ships) {
    if (!ships || ships.length === 0) return;
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return;

    // Wybierz pierwszy statek z wystarczającym paliwem
    const gd = window.KOSMOS?.galaxyData;
    const targetStar = gd?.systems?.find(s => s.id === targetSystemId);
    if (!targetStar) return;

    // Odległość od systemu statku do celu
    for (const v of ships) {
      const fromStar = gd.systems.find(s => s.id === (v.systemId ?? 'sys_home'));
      if (!fromStar) continue;
      const dx = targetStar.x - fromStar.x;
      const dy = targetStar.y - fromStar.y;
      const dz = (targetStar.z ?? 0) - (fromStar.z ?? 0);
      const distLY = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const shipDef = SHIPS[v.shipId];
      const fuelCost = distLY * (shipDef?.fuelPerLY ?? 0.5);

      if (v.fuel.current >= fuelCost) {
        const ok = vMgr.dispatchInterstellar(v.id, targetSystemId);
        if (ok) {
          // Zamknij mapę po wysłaniu
          this.hide();
          if (window.KOSMOS?.overlayManager) {
            window.KOSMOS.overlayManager.active = null;
          }
          return;
        }
      }
    }
  }

  /**
   * Wyślij konkretny statek do wybranego układu.
   */
  _handleSendShipDirect(vesselId, targetSystemId) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return;
    const ok = vMgr.dispatchInterstellar(vesselId, targetSystemId);
    if (ok) {
      this.hide();
      if (window.KOSMOS?.overlayManager) {
        window.KOSMOS.overlayManager.active = null;
      }
    }
  }

  /**
   * Pobierz listę statków warpCapable docked + idle w dowolnej kolonii.
   */
  _getAvailableWarpShips() {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return [];
    const all = vMgr.getAllVessels();
    return all.filter(v => {
      if (v.position.state !== 'docked') return false;
      if (v.status !== 'idle' && v.status !== 'refueling') return false;
      const def = SHIPS[v.shipId];
      return def?.warpCapable === true;
    });
  }

  handleMouseMove(x, y) {
    if (!this.visible) return;
    if (x < CIV_SIDEBAR_W) return; // nie blokuj hover nad sidebar
    super.handleMouseMove(x, y);
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
    if (x < CIV_SIDEBAR_W) return false; // nie blokuj scrolla nad sidebare
    this._renderer.applyZoom(delta);
    return true;
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
