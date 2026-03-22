// GalaxyMapScene — overlay mapy galaktycznej (klawisz G)
//
// Widok Star Cluster: Canvas 2D z okolicznymi układami gwiezdnymi.
// Extends BaseOverlay — OverlayManager zarządza show/hide.
// Otwarcie pauzuje czas gry, zamknięcie wznawia.

import { BaseOverlay }         from '../ui/BaseOverlay.js';
import { THEME, bgAlpha, drawGlassPanel, GLASS_BORDER } from '../config/ThemeConfig.js';
import { COSMIC }              from '../config/LayoutConfig.js';
import { CIV_SIDEBAR_W }      from '../ui/CivPanelDrawer.js';
import { STAR_TYPES }          from '../config/GameConfig.js';
import { SHIPS }               from '../data/ShipsData.js';
import EventBus                from '../core/EventBus.js';
import EntityManager           from '../core/EntityManager.js';
import { t }                   from '../i18n/i18n.js';

export class GalaxyMapScene extends BaseOverlay {
  constructor() {
    super(null);
    this._selectedSystem = null;
    this._hoverSystem    = null;
    this._wasPaused      = false;
    this._lastW = 0;
    this._lastH = 0;

    // Nawigacja (pan + zoom)
    this._zoom = 1.0;
    this._panX = 0;
    this._panY = 0;
    this._dragging = false;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._wasDrag = false;
  }

  // ── show / hide ─────────────────────────────────────────────────────────

  show() {
    super.show();
    // Pauzuj czas gry
    this._wasPaused = window.KOSMOS?.timeSystem?.paused ?? false;
    if (!this._wasPaused) EventBus.emit('time:pause');

    // Domyślnie zaznacz home
    const gd = window.KOSMOS?.galaxyData;
    const home = gd?.systems?.find(s => s.isHome);
    if (home) this._selectedSystem = home;
  }

  hide() {
    // Wznów czas jeśli nie był zapauzowany
    if (!this._wasPaused) EventBus.emit('time:resume');
    this._selectedSystem = null;
    this._hoverSystem = null;
    super.hide();
  }

  // ── Rysowanie Canvas 2D ──────────────────────────────────────────────────

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];
    this._lastW = W;
    this._lastH = H;

    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);

    // ── Tło glass ──────────────────────────────────────────────
    drawGlassPanel(ctx, ox, oy, ow, oh);

    // ── Nagłówek ───────────────────────────────────────────────
    const HDR_H = 28;
    drawGlassPanel(ctx, ox, oy, ow, HDR_H, { highlightTop: true, bottomBorder: GLASS_BORDER });

    ctx.fillStyle = THEME.accent;
    ctx.font = `bold ${THEME.fontSizeNormal + 2}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText(t('galaxy.title'), ox + 12, oy + HDR_H / 2 + 5);

    // Przycisk zamknij [ESC ×]
    const closeW = 52, closeH = 18;
    const closeX = ox + ow - closeW - 8;
    const closeY = oy + (HDR_H - closeH) / 2;
    const closeLabel = t('galaxy.close');
    this._drawButton(ctx, closeLabel, closeX, closeY, closeW, closeH, 'secondary');
    this._addHit(closeX, closeY, closeW, closeH, 'close', { label: closeLabel });

    // ── Obszar mapy ────────────────────────────────────────────
    const mapX = ox;
    const mapY = oy + HDR_H;
    const mapW = ow;
    const mapH = oh - HDR_H;

    this._drawStarCluster(ctx, mapX, mapY, mapW, mapH);
  }

  // ── Star Cluster rendering ──────────────────────────────────────────────

  _drawStarCluster(ctx, x, y, w, h) {
    const PAD = 10;
    const gd = window.KOSMOS?.galaxyData;
    if (!gd?.systems?.length) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('galaxy.noData') || 'No galaxy data', x + PAD, y + 20);
      return;
    }

    const systems = gd.systems;
    const ssMgr  = window.KOSMOS?.starSystemManager;
    const vMgr   = window.KOSMOS?.vesselManager;
    const colMgr = window.KOSMOS?.colonyManager;

    // Clip
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y, w - 2, h - 1);
    ctx.clip();

    // Skala — zmieść wszystkie gwiazdy w widoku
    let maxLY = 1;
    for (const s of systems) {
      const d = Math.sqrt(s.x * s.x + s.y * s.y);
      if (d > maxLY) maxLY = d;
    }
    maxLY *= 1.15;

    const cx = x + w / 2 + this._panX;
    const cy = y + h / 2 + this._panY;
    const baseR = Math.min(w / 2, h / 2) - 20;
    const scale = (baseR * this._zoom) / maxLY; // px per LY

    const toSx = (lx) => cx + lx * scale;
    const toSy = (ly) => cy + ly * scale;

    // ── Jump gate lines (fioletowe) ──
    const gates = systems.filter(s => s.jumpGate);
    for (const g of gates) {
      const sys = ssMgr?.getSystem(g.id);
      const connTo = sys?.jumpGate?.connectedTo;
      if (connTo) {
        const other = systems.find(s => s.id === connTo);
        if (other) {
          ctx.strokeStyle = 'rgba(170,136,255,0.4)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(toSx(g.x), toSy(g.y));
          ctx.lineTo(toSx(other.x), toSy(other.y));
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // ── Interstellar transit lines (pomarańczowe) ──
    const interVessels = vMgr?.getInterstellarVessels() ?? [];
    for (const v of interVessels) {
      const m = v.mission;
      if (!m || m.phase !== 'warp_transit') continue;
      const fromS = systems.find(s => s.id === m.fromSystemId);
      const toS   = systems.find(s => s.id === m.toSystemId);
      if (!fromS || !toS) continue;

      ctx.strokeStyle = 'rgba(255,170,50,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(toSx(fromS.x), toSy(fromS.y));
      ctx.lineTo(toSx(toS.x), toSy(toS.y));
      ctx.stroke();
      ctx.setLineDash([]);

      // Punkt pozycji statku
      const vsx = toSx(m.currentGalX ?? fromS.x);
      const vsy = toSy(m.currentGalY ?? fromS.y);
      ctx.fillStyle = THEME.warning;
      ctx.beginPath();
      ctx.arc(vsx, vsy, 3, 0, Math.PI * 2);
      ctx.fill();

      if (this._zoom > 1.5) {
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.warning;
        ctx.fillText(v.name, vsx + 5, vsy - 3);
      }
    }

    // ── Gwiazdy ──
    const selId = this._selectedSystem?.id;
    for (const s of systems) {
      const sx = toSx(s.x);
      const sy = toSy(s.y);

      // Cull poza widocznością
      if (sx < x - 20 || sx > x + w + 20 || sy < y - 20 || sy > y + h + 20) continue;

      const isHome     = !!s.isHome;
      const isExplored = !!s.explored;
      const isSelected = selId === s.id;
      const isHover    = this._hoverSystem === s.id;
      const hasCol = colMgr?.getAllColonies().some(c => {
        const body = EntityManager.get(c.planetId);
        return body?.systemId === s.id;
      }) ?? false;

      // Promień gwiazdy
      let r = isHome ? 6 : isExplored ? 4 : 3;
      if (isSelected || isHover) r += 1;

      // Glow
      if (isHome || isSelected) {
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3);
        grad.addColorStop(0, isHome ? 'rgba(255,204,68,0.3)' : 'rgba(170,136,255,0.3)');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Kolor gwiazdy
      ctx.fillStyle = s.colorHex ?? (isExplored ? THEME.accent : THEME.textDim);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();

      // Obwódka selekcji
      if (isSelected) {
        ctx.strokeStyle = THEME.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Ikony infrastruktury
      const sysData = ssMgr?.getSystem(s.id);
      if (hasCol) {
        ctx.font = `8px ${THEME.fontFamily}`;
        ctx.fillText('🏗', sx + r + 2, sy - r);
      }
      if (sysData?.warpBeacon || s.warpBeacon) {
        ctx.font = `7px ${THEME.fontFamily}`;
        ctx.fillText('📡', sx + r + 2, sy + 2);
      }
      if (sysData?.jumpGate || s.jumpGate) {
        ctx.font = `7px ${THEME.fontFamily}`;
        ctx.fillText('🌀', sx + r + 2, sy + 10);
      }

      // Nazwa
      if (this._zoom > 0.8 || isHome || isSelected || isHover) {
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = isHome ? THEME.yellow : isExplored ? THEME.textPrimary : THEME.textDim;
        ctx.textAlign = 'center';
        ctx.fillText(s.name, sx, sy + r + 12);
        ctx.textAlign = 'left';
      }

      // Hit zone
      const hitR = Math.max(r + 4, 10);
      this._hitZones.push({
        x: sx - hitR, y: sy - hitR, w: hitR * 2, h: hitR * 2,
        type: 'star_select', data: { systemId: s.id },
      });
    }

    // ── Legenda (lewy-dolny) ──
    {
      const lx = x + PAD;
      let ly = y + h - 60;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const items = [
        { color: THEME.yellow, label: t('fleet.clusterHome') },
        { color: THEME.accent, label: t('fleet.clusterExplored') },
        { color: THEME.textDim, label: t('fleet.clusterUnexplored') },
      ];
      for (const it of items) {
        ctx.fillStyle = it.color;
        ctx.beginPath();
        ctx.arc(lx + 4, ly + 4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(it.label, lx + 12, ly + 7);
        ly += 14;
      }
    }

    // ── Info panel zaznaczonego systemu (prawy-górny) ──
    if (this._selectedSystem) {
      this._drawInfoPanel(ctx, x, y, w, h);
    }

    // ── Ilość systemów (prawy-dolny) ──
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(t('galaxy.systemsInRange', systems.length), x + w - PAD, y + h - 8);
    ctx.textAlign = 'left';

    ctx.restore();
  }

  // ── Panel informacyjny o zaznaczonym systemie ──────────────────────────

  _drawInfoPanel(ctx, areaX, areaY, areaW, areaH) {
    const sys = this._selectedSystem;
    if (!sys) return;

    const ssMgr  = window.KOSMOS?.starSystemManager;
    const vMgr   = window.KOSMOS?.vesselManager;
    const colMgr = window.KOSMOS?.colonyManager;

    const panelW = 210;
    let panelH = 160;
    const px = areaX + areaW - panelW - 10;
    const py = areaY + 10;
    const PAD = 10;

    // Oblicz dynamiczną wysokość panelu
    const isExplored = !!(ssMgr?.getSystem(sys.id)?.explored || sys.explored);
    const hasCol = colMgr?.getAllColonies().some(c => {
      const body = EntityManager.get(c.planetId);
      return body?.systemId === sys.id;
    }) ?? false;
    if (!sys.isHome) panelH += 28;
    if (isExplored && ssMgr?.getSystem(sys.id)) panelH += 24;
    if (hasCol) panelH += 16;
    if (ssMgr?.hasBeacon(sys.id)) panelH += 14;
    if (ssMgr?.hasJumpGate(sys.id)) panelH += 14;

    // Tło glass
    drawGlassPanel(ctx, px, py, panelW, panelH);

    let iy = py + PAD;

    // Nazwa gwiazdy
    ctx.font = `bold ${THEME.fontSizeNormal + 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = sys.colorHex ?? THEME.textPrimary;
    ctx.fillText(`⭐ ${sys.name}`, px + PAD, iy + 12);
    iy += 22;

    // Typ, masa, odległość
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(`${t('galaxy.spectral') || 'Typ'}: ${sys.spectralType ?? '?'}`, px + PAD, iy + 10);
    iy += 16;
    ctx.fillText(`${t('galaxy.mass')}: ${(sys.mass ?? 1).toFixed(2)} M☉`, px + PAD, iy + 10);
    iy += 16;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(`${t('galaxy.distance')}: ${(sys.distanceLY ?? 0).toFixed(1)} ly`, px + PAD, iy + 10);
    iy += 20;

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath();
    ctx.moveTo(px + PAD, iy);
    ctx.lineTo(px + panelW - PAD, iy);
    ctx.stroke();
    iy += 10;

    // Status
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    if (sys.isHome) {
      ctx.fillStyle = THEME.accent;
      ctx.fillText(t('galaxy.yourSystem'), px + PAD, iy + 10);
    } else if (isExplored) {
      ctx.fillStyle = THEME.success;
      ctx.fillText(t('galaxy.explored'), px + PAD, iy + 10);
    } else {
      ctx.fillStyle = THEME.warning;
      ctx.fillText(t('galaxy.unexplored'), px + PAD, iy + 10);
    }
    iy += 18;

    // Infrastruktura
    if (hasCol) {
      ctx.fillStyle = THEME.accent;
      ctx.fillText('🏗 ' + t('galaxy.hasColony'), px + PAD, iy + 10);
      iy += 16;
    }
    if (ssMgr?.hasBeacon(sys.id)) {
      ctx.fillStyle = '#66ccff';
      ctx.fillText('📡 ' + t('galaxy.warpBeacon'), px + PAD, iy + 10);
      iy += 14;
    }
    if (ssMgr?.hasJumpGate(sys.id)) {
      ctx.fillStyle = '#cc88ff';
      ctx.fillText('🌀 ' + t('galaxy.jumpGate'), px + PAD, iy + 10);
      iy += 14;
    }

    // Przyciski
    const btnW = panelW - PAD * 2;
    const btnH = 20;

    // Przycisk: Przełącz widok (jeśli odwiedzony)
    if (isExplored && ssMgr?.getSystem(sys.id) && !sys.isHome) {
      this._drawButton(ctx, t('galaxy.switchView'), px + PAD, iy, btnW, btnH, 'primary');
      this._addHit(px + PAD, iy, btnW, btnH, 'switchView', { systemId: sys.id });
      iy += btnH + 6;
    }

    // Przycisk: Wyślij statek
    if (!sys.isHome && vMgr) {
      const warpShips = this._getAvailableWarpShips();
      const hasWarp = warpShips.length > 0;
      const style = hasWarp ? 'secondary' : 'disabled';
      this._drawButton(ctx, t('galaxy.sendShip'), px + PAD, iy, btnW, btnH, style);
      if (hasWarp) {
        this._addHit(px + PAD, iy, btnW, btnH, 'sendShipPanel', { systemId: sys.id });
      }
    }
  }

  // ── Interakcje ──────────────────────────────────────────────────────────

  handleClick(x, y) {
    if (!this.visible) return false;
    if (x < CIV_SIDEBAR_W) return false; // sidebar passthrough

    // Jeśli był drag — nie dispatch kliknięcia
    if (this._wasDrag) {
      this._wasDrag = false;
      return true;
    }

    // Sprawdź hit zones panelowe
    const hit = this._hitTest(x, y);
    if (hit) {
      this._onHit(hit);
      return true;
    }

    // Klik na gwiazdy obsługiwany przez hit zones (star_select)
    return true; // pochłoń klik w overlayu
  }

  _onHit(zone) {
    switch (zone.type) {
      case 'close':
        this.hide();
        if (window.KOSMOS?.overlayManager) {
          window.KOSMOS.overlayManager.active = null;
        }
        break;

      case 'star_select': {
        const gd = window.KOSMOS?.galaxyData;
        const sys = gd?.systems?.find(s => s.id === zone.data.systemId);
        if (sys) this._selectedSystem = sys;
        break;
      }

      case 'switchView': {
        const ssMgr = window.KOSMOS?.starSystemManager;
        if (ssMgr) {
          ssMgr.switchActiveSystem(zone.data.systemId);
          this.hide();
          if (window.KOSMOS?.overlayManager) {
            window.KOSMOS.overlayManager.active = null;
          }
        }
        break;
      }

      case 'sendShipPanel': {
        // Wyślij pierwszy statek warpowy
        const ships = this._getAvailableWarpShips();
        this._handleSendShip(zone.data.systemId, ships);
        break;
      }

      case 'buildBeacon':
        EventBus.emit('orbital:buildBeacon', { systemId: zone.data.systemId });
        break;

      case 'buildGate':
        EventBus.emit('orbital:buildJumpGate', { systemId: zone.data.systemId, connectedTo: null });
        break;
    }
  }

  _handleSendShip(targetSystemId, ships) {
    if (!ships || ships.length === 0) return;
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return;

    const gd = window.KOSMOS?.galaxyData;
    const targetStar = gd?.systems?.find(s => s.id === targetSystemId);
    if (!targetStar) return;

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
          this.hide();
          if (window.KOSMOS?.overlayManager) {
            window.KOSMOS.overlayManager.active = null;
          }
          return;
        }
      }
    }
  }

  _getAvailableWarpShips() {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return [];
    return vMgr.getAllVessels().filter(v => {
      if (v.position.state !== 'docked') return false;
      if (v.status !== 'idle' && v.status !== 'refueling') return false;
      const def = SHIPS[v.shipId];
      return def?.warpCapable === true;
    });
  }

  // ── Nawigacja (drag + zoom) ─────────────────────────────────────────────

  handleMouseMove(x, y) {
    if (!this.visible) return;
    if (x < CIV_SIDEBAR_W) return;

    // Drag
    if (this._dragging) {
      const dx = x - this._dragStartX;
      const dy = y - this._dragStartY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this._wasDrag = true;
      this._panX += dx;
      this._panY += dy;
      this._dragStartX = x;
      this._dragStartY = y;
      return;
    }

    // Hover na gwiazdach
    this._hoverSystem = null;
    for (const z of this._hitZones) {
      if (z.type === 'star_select' && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
        this._hoverSystem = z.data.systemId;
        break;
      }
    }

    super.handleMouseMove(x, y);
  }

  handleMouseDown(x, y) {
    if (!this.visible) return;
    if (x < CIV_SIDEBAR_W) return;

    this._dragging = true;
    this._dragStartX = x;
    this._dragStartY = y;
    this._wasDrag = false;
  }

  handleMouseUp(x, y) {
    if (!this.visible) return;
    this._dragging = false;
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    if (x < CIV_SIDEBAR_W) return false;
    const zf = delta > 0 ? 0.85 : 1.18;
    this._zoom = Math.max(0.3, Math.min(8, this._zoom * zf));
    return true;
  }
}
