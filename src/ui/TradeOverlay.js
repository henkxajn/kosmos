// TradeOverlay — panel Handlu (klawisz H)
//
// Pełnoekranowy overlay handlu: handel cywilny (L), log/wykresy/trasy (R).
// Wyodrębniony z EconomyOverlay — wszystko co dotyczy handlu między koloniami.

import { BaseOverlay }   from './BaseOverlay.js';
import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import { ALL_RESOURCES }  from '../data/ResourcesData.js';
import { COMMODITIES }    from '../data/CommoditiesData.js';
import { BASE_PRICE, scarcityMultiplier } from '../data/TradeValuesData.js';
import EventBus           from '../core/EventBus.js';
import EntityManager      from '../core/EntityManager.js';
import { t, getName }     from '../i18n/i18n.js';

const LEFT_W  = 320;
const TAB_H   = 32;

// ══════════════════════════════════════════════════════════════════════════════
// TradeOverlay
// ══════════════════════════════════════════════════════════════════════════════

export class TradeOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._scrollLeft  = 0;
    this._scrollRight = 0;

    // Tooltip DOM (hover na słupkach wykresu)
    this._hoverTradeBar = null;
    this._mouseScreenX  = 0;
    this._mouseScreenY  = 0;
    this._createTooltipEl();
  }

  // ── Tooltip DOM ─────────────────────────────────────────────────────────

  hide() {
    super.hide();
    this._hoverTradeBar = null;
    this._hideTooltip();
  }

  _createTooltipEl() {
    if (this._tooltipEl) return;
    const el = document.createElement('div');
    el.id = 'trade-tooltip';
    el.style.cssText = `
      position: fixed; z-index: 200; pointer-events: none;
      display: none; max-width: 340px; padding: 8px 10px;
      background: rgba(6,12,20,0.96); border: 1px solid ${THEME.borderActive};
      border-radius: 4px; font-family: 'Courier New', monospace;
      font-size: 11px; color: ${THEME.textSecondary}; line-height: 1.5;
    `;
    document.body.appendChild(el);
    this._tooltipEl = el;
  }

  _showTradeBarTooltip(data) {
    if (!this._tooltipEl) return;
    const html = this._buildTradeBarTooltip(data);
    if (!html) { this._hideTooltip(); return; }
    this._tooltipEl.innerHTML = html;
    this._tooltipEl.style.display = 'block';
    const rect = this._tooltipEl.getBoundingClientRect();
    let tx = this._mouseScreenX + 16;
    let ty = this._mouseScreenY - 8;
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (tx + rect.width > W - 10) tx = this._mouseScreenX - rect.width - 12;
    if (ty + rect.height > H - 10) ty = H - rect.height - 10;
    if (ty < 4) ty = 4;
    if (tx < 4) tx = 4;
    this._tooltipEl.style.left = `${Math.round(tx)}px`;
    this._tooltipEl.style.top  = `${Math.round(ty)}px`;
  }

  _hideTooltip() {
    if (this._tooltipEl) this._tooltipEl.style.display = 'none';
  }

  _buildTradeBarTooltip(data) {
    const { year, items, total, isExport } = data;
    const lines = [];
    const color = isExport ? THEME.warning : THEME.info;
    const arrow = isExport ? '↑' : '↓';
    const label = isExport ? t('tradePanel.exports') : t('tradePanel.imports');
    lines.push(`<div style="font-weight:bold;color:${color}">${arrow} ${label} — ${t('tradePanel.year')} ${year}</div>`);
    lines.push(`<div style="color:${THEME.textDim};margin-bottom:2px">${t('tradePanel.tooltipTotal')}: ${total}</div>`);

    const sorted = Object.entries(items).sort((a, b) => b[1] - a[1]);
    for (const [id, qty] of sorted) {
      const cd = COMMODITIES[id]; const rd = ALL_RESOURCES[id];
      const icon = (cd ?? rd)?.icon ?? '';
      const nm = cd ? getName(cd, 'commodity') : rd ? getName(rd, 'resource') : id;
      const qStr = qty < 10 ? qty.toFixed(1) : Math.round(qty);
      lines.push(`<div style="color:${THEME.textSecondary}">${icon} ${nm}: <span style="color:${THEME.textPrimary}">${qStr}</span></div>`);
    }
    return lines.join('');
  }

  // ── Główna metoda rysowania ──────────────────────────────────────────────

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];

    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);
    const rightW = ow - LEFT_W;

    // Tło
    ctx.fillStyle = bgAlpha(0.38);
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = GLASS_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, ow, oh);

    // Separator kolumn
    ctx.beginPath();
    ctx.moveTo(ox + LEFT_W, oy); ctx.lineTo(ox + LEFT_W, oy + oh);
    ctx.stroke();

    // Przycisk zamknięcia [X]
    const closeX = ox + ow - 24;
    const closeY = oy + 4;
    ctx.font = `bold 14px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('✕', closeX, closeY + 14);
    this._addHit(closeX - 4, closeY, 22, 22, 'close');

    // Rysuj 2 kolumny
    this._drawLeft(ctx, ox, oy, LEFT_W, oh);
    this._drawRight(ctx, ox + LEFT_W, oy, rightW, oh);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEWA KOLUMNA — handel cywilny (kredyty, połączenia, ceny, migracja)
  // ══════════════════════════════════════════════════════════════════════════

  _drawLeft(ctx, x, y, w, h) {
    const pad = 14;

    // Nagłówek
    ctx.fillStyle = bgAlpha(0.50);
    ctx.fillRect(x, y, w, TAB_H);
    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(t('tradePanel.header'), x + pad, y + 20);

    const colMgr   = window.KOSMOS?.colonyManager;
    const civTrade = window.KOSMOS?.civilianTradeSystem;
    const activeColId = colMgr?.activePlanetId;

    const civCredits = civTrade?.getCredits(activeColId) ?? 0;
    const civPerYear = civTrade?.getCreditsPerYear(activeColId) ?? 0;
    const civTC      = civTrade?.getTradeCapacity(activeColId) ?? 0;
    const civConns   = civTrade?.getConnections(activeColId) ?? [];
    const hasCivTrade = civConns.length > 0 || civCredits > 0;

    const listY = y + TAB_H;
    const listH = h - TAB_H;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listY, w, listH);
    ctx.clip();

    let ry = listY + 4 - this._scrollLeft;

    if (!hasCivTrade) {
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(t('tradePanel.noTrade'), x + w / 2, listY + listH / 2);
      ctx.textAlign = 'left';
      ctx.restore();
      return;
    }

    // ── Kredyty ──────────────────────────────────────────────────────────
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(t('tradePanel.civHeader'), x + pad, ry + 12);
    ry += 18;

    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    const krStr = `${t('tradePanel.credits')}: ${civCredits.toFixed(0)} Kr`;
    ctx.fillText(krStr, x + pad, ry + 12);
    const perYearColor = civPerYear >= 0 ? THEME.success : THEME.danger;
    ctx.fillStyle = perYearColor;
    const sign = civPerYear >= 0 ? '+' : '';
    ctx.fillText(`(${sign}${civPerYear.toFixed(1)}${t('tradePanel.perYear')})`, x + pad + ctx.measureText(krStr).width + 8, ry + 12);
    ry += 18;

    // TC
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(`${t('tradePanel.tradeCapacity')}: ${civTC.toFixed(0)} Kr/rok`, x + pad, ry + 10);
    ry += 16;

    // ── Migracja cywilna — toggle ────────────────────────────────────────
    const migCol = colMgr?.getColony(activeColId);
    const migBlocked = migCol?.tradeOverrides?.migration === 'block';
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = migBlocked ? THEME.danger : THEME.success;
    const migLabel = migBlocked ? t('tradePanel.migrationBlocked') : t('tradePanel.migrationAllow');
    ctx.fillText(`${t('tradePanel.migration')}: ${migLabel}`, x + pad, ry + 10);
    const toggleLabel = t('tradePanel.migrationToggle');
    const toggleX = x + pad + ctx.measureText(`${t('tradePanel.migration')}: ${migLabel}`).width + 8;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(toggleLabel, toggleX, ry + 10);
    const toggleW = ctx.measureText(toggleLabel).width + 4;
    this._addHit(x + pad, ry - 2, toggleX - x - pad + toggleW + 4, 16, 'migration_toggle', { colonyId: activeColId });
    ry += 16;

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, ry); ctx.lineTo(x + w - pad, ry); ctx.stroke();
    ry += 6;

    // ── Połączenia ───────────────────────────────────────────────────────
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('tradePanel.connections'), x + pad, ry + 11);
    ry += 16;

    if (civConns.length === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('tradePanel.noConnections'), x + pad + 4, ry + 10);
      ry += 16;
    } else {
      const flows = civTrade?.getFlowsForColony(activeColId) ?? [];

      for (const conn of civConns) {
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textSecondary;
        const distStr = `[${conn.distance.toFixed(1)} AU]`;
        const nameStr = (conn.partnerName ?? '???').slice(0, 20);
        ctx.fillText(`<-> ${nameStr} ${distStr}`, x + pad + 4, ry + 10);
        ry += 14;

        const connFlows = flows.filter(f => f.partnerId === conn.partnerId);
        if (connFlows.length > 0) {
          for (const f of connFlows) {
            const arrow = f.direction === 'export' ? '↑' : '↓';
            const color = f.direction === 'export' ? THEME.warning : THEME.info;
            const comDef = COMMODITIES[f.goodId];
            const resDef = ALL_RESOURCES[f.goodId];
            const goodName = comDef ? getName(comDef, 'commodity') : resDef ? getName(resDef, 'resource') : f.goodId;
            ctx.fillStyle = color;
            ctx.fillText(`  ${arrow} ${goodName}: ${f.qtyPerYear.toFixed(1)}/${t('tradePanel.perYear')}`, x + pad + 8, ry + 10);
            ry += 13;
          }
        } else {
          ctx.fillStyle = THEME.textDim;
          ctx.fillText(`  ${t('tradePanel.noFlow')}`, x + pad + 8, ry + 10);
          ry += 13;
        }
        ry += 2;
      }
    }

    // Separator
    ry += 4;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, ry); ctx.lineTo(x + w - pad, ry); ctx.stroke();
    ry += 6;

    // ── Ceny lokalne ─────────────────────────────────────────────────────
    const colony = colMgr?.getColony(activeColId);
    if (colony?.resourceSystem) {
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textHeader;
      ctx.fillText(t('tradePanel.localPrices'), x + pad, ry + 11);
      ry += 16;

      const prices = this._calcLocalPrices(colony);
      const sorted = [...prices].sort((a, b) => b.mult - a.mult);
      const expensive = sorted.filter(p => p.mult > 1.5).slice(0, 5);
      const cheap = sorted.filter(p => p.mult < 0.8).slice(-5).reverse();

      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;

      if (expensive.length > 0) {
        ctx.fillStyle = THEME.danger;
        ctx.fillText(`${t('tradePanel.expensive')}:`, x + pad + 4, ry + 10);
        ry += 14;
        for (const p of expensive) {
          ctx.fillStyle = THEME.textSecondary;
          ctx.fillText(`  ${p.id}  x${p.mult.toFixed(1)}`, x + pad + 8, ry + 10);
          ry += 13;
        }
      }
      if (cheap.length > 0) {
        ctx.fillStyle = THEME.success;
        ctx.fillText(`${t('tradePanel.cheap')}:`, x + pad + 4, ry + 10);
        ry += 14;
        for (const p of cheap) {
          ctx.fillStyle = THEME.textSecondary;
          ctx.fillText(`  ${p.id}  x${p.mult.toFixed(1)}`, x + pad + 8, ry + 10);
          ry += 13;
        }
      }
    }

    ctx.restore();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRAWA KOLUMNA — wykresy, log transakcji, trasy handlowe
  // ══════════════════════════════════════════════════════════════════════════

  _drawRight(ctx, x, y, w, h) {
    const pad = 14;

    // Nagłówek
    ctx.fillStyle = bgAlpha(0.50);
    ctx.fillRect(x, y, w, TAB_H);
    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('tradePanel.activityHeader'), x + pad, y + 20);

    const colMgr   = window.KOSMOS?.colonyManager;
    const vMgr     = window.KOSMOS?.vesselManager;
    const tradeLog = window.KOSMOS?.tradeLog;
    const trm      = window.KOSMOS?.tradeRouteManager;
    const activeColId = colMgr?.activePlanetId;

    const routes = trm?.getRoutes() ?? [];
    const log    = tradeLog?.getLog(activeColId, 30) ?? [];
    const yearly = tradeLog?.getYearlyAggregation(activeColId, 10) ?? [];

    const listY = y + TAB_H;
    const listH = h - TAB_H;

    const hasData = log.length > 0 || routes.length > 0 || yearly.length > 0;
    if (!hasData) {
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(t('tradePanel.noActivity'), x + w / 2, listY + listH / 2);
      ctx.textAlign = 'left';
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listY, w, listH);
    ctx.clip();

    let ry = listY + 4 - this._scrollRight;

    // ═════════════════════════════════════════════════════════════════════
    // A) WYKRESY — stacked bar charts (EKSPORT | IMPORT)
    // ═════════════════════════════════════════════════════════════════════

    if (yearly.length > 0) {
      const chartH = 90;
      const halfW = Math.floor((w - pad * 3) / 2);

      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(`↑ ${t('tradePanel.exports')}`, x + pad, ry + 12);
      ctx.fillStyle = THEME.info;
      ctx.fillText(`↓ ${t('tradePanel.imports')}`, x + pad * 2 + halfW, ry + 12);
      ry += 18;

      let maxVal = 1;
      for (const yr of yearly) {
        if (yr.exports > maxVal) maxVal = yr.exports;
        if (yr.imports > maxVal) maxVal = yr.imports;
      }

      const barW = Math.max(4, Math.floor(halfW / yearly.length) - 2);
      this._drawBarChart(ctx, x + pad, ry, halfW, chartH, yearly, 'exports', 'exportItems', barW, maxVal, THEME.warning);
      this._drawBarChart(ctx, x + pad * 2 + halfW, ry, halfW, chartH, yearly, 'imports', 'importItems', barW, maxVal, THEME.info);
      ry += chartH + 8;

      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(x + pad, ry); ctx.lineTo(x + w - pad, ry); ctx.stroke();
      ry += 8;
    }

    // ═════════════════════════════════════════════════════════════════════
    // B) LOG TRANSAKCJI
    // ═════════════════════════════════════════════════════════════════════

    if (log.length > 0) {
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textHeader;
      ctx.fillText(t('tradePanel.logHeader'), x + pad, ry + 11);
      ry += 18;

      const reversed = [...log].reverse();
      const maxLogEntries = 20;
      for (let i = 0; i < Math.min(reversed.length, maxLogEntries); i++) {
        const entry = reversed[i];
        const isExport = entry.type === 'export';

        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = isExport ? THEME.warning : THEME.info;
        const arrow = isExport ? '↑' : '↓';
        const yearStr = `${t('tradePanel.year')} ${entry.year.toFixed(1)}`;
        ctx.fillText(`${arrow} ${yearStr}`, x + pad, ry + 10);

        ctx.fillStyle = THEME.textSecondary;
        const partnerDir = isExport ? '→' : '←';
        const partnerStr = `${entry.vesselName} ${partnerDir} ${entry.partnerName}`;
        ctx.fillText(partnerStr.slice(0, 32), x + pad + 90, ry + 10);

        ctx.fillStyle = THEME.textDim;
        const itemsStr = Object.entries(entry.items)
          .map(([id, qty]) => {
            const cd = COMMODITIES[id]; const rd = ALL_RESOURCES[id];
            const nm = cd ? getName(cd, 'commodity') : rd ? getName(rd, 'resource') : id;
            return `${nm}:${qty < 10 ? qty.toFixed(1) : Math.round(qty)}`;
          })
          .join(' ');
        ctx.fillText(`[${itemsStr}]`.slice(0, 45), x + pad + 4, ry + 22);

        ry += 26;
      }

      if (reversed.length > maxLogEntries) {
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(`... +${reversed.length - maxLogEntries}`, x + pad, ry + 10);
        ry += 16;
      }

      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(x + pad, ry); ctx.lineTo(x + w - pad, ry); ctx.stroke();
      ry += 8;
    }

    // ═════════════════════════════════════════════════════════════════════
    // C) TRASY HANDLOWE
    // ═════════════════════════════════════════════════════════════════════

    if (routes.length > 0) {
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textHeader;
      ctx.fillText(t('tradePanel.routesHeader'), x + pad, ry + 11);
      ry += 18;

      ry = this._drawTradeRoutes(ctx, x, ry, w, routes, colMgr, vMgr);
    }

    ctx.restore();
  }

  // ── Wykres słupkowy ─────────────────────────────────────────────────────

  _drawBarChart(ctx, x, y, w, h, yearly, totalKey, itemsKey, barW, maxVal, color) {
    const pad = 4;

    ctx.strokeStyle = THEME.border;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();

    const barSpacing = Math.floor(w / yearly.length);
    for (let i = 0; i < yearly.length; i++) {
      const yr = yearly[i];
      const val = yr[totalKey];
      if (val <= 0) continue;

      const barH = Math.max(2, Math.floor((val / maxVal) * (h - 14)));
      const bx = x + i * barSpacing + pad;
      const by = y + h - barH;

      ctx.globalAlpha = 0.7;
      ctx.fillStyle = color;
      ctx.fillRect(bx, by, barW, barH);
      ctx.globalAlpha = 1.0;

      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(`${yr.year}`, bx + barW / 2, y + h + 10);
      ctx.textAlign = 'left';

      if (barH > 14) {
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textPrimary;
        ctx.textAlign = 'center';
        ctx.fillText(`${val}`, bx + barW / 2, by - 2);
        ctx.textAlign = 'left';
      }

      const items = yr[itemsKey] ?? {};
      if (Object.keys(items).length > 0) {
        this._addHit(bx, by, barW, barH, 'trade_bar_hover', {
          year: yr.year, items, total: val, isExport: totalKey === 'exports'
        });
      }
    }
  }

  // ── Trasy handlowe ──────────────────────────────────────────────────────

  _drawTradeRoutes(ctx, x, ry, w, routes, colMgr, vMgr) {
    const pad = 14;

    for (const route of routes) {
      const sourceCol = colMgr?.getColony(route.sourceColonyId);
      const sourceName = sourceCol?.name ?? route.sourceColonyId;
      const targetBody = this._findBody(route.targetBodyId);
      const targetName = targetBody?.name ?? route.targetBodyId;

      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(`📦 ${sourceName}`, x + pad, ry + 12);
      const hasReturn = route.returnCargo && Object.keys(route.returnCargo).length > 0;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(hasReturn ? '⇄' : '→', x + pad + 120, ry + 12);
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(targetName, x + pad + 135, ry + 12);

      // Ładunek outbound
      const cargoStr = Object.entries(route.cargo ?? {})
        .map(([id, qty]) => `${qty}t ${id}`)
        .join(', ') || '—';
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(`➡ ${cargoStr}`.slice(0, 40), x + pad + 10, ry + 26);

      // Ładunek powrotny
      if (hasReturn) {
        const retStr = Object.entries(route.returnCargo)
          .map(([id, qty]) => `${qty}t ${id}`)
          .join(', ');
        ctx.fillStyle = THEME.info ?? THEME.accent;
        ctx.fillText(`⬅ ${retStr}`.slice(0, 40), x + pad + 10, ry + 38);
      }

      // Status
      const status = route.status === 'active' ? t('tradePanel.routeActive')
                   : route.status === 'paused' ? t('tradePanel.routePaused') : t('tradePanel.routeCompleted');
      const statusColor = route.status === 'active' ? THEME.accent
                        : route.status === 'paused' ? THEME.warning : THEME.textDim;

      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = statusColor;
      ctx.textAlign = 'right';
      ctx.fillText(status, x + w - pad, ry + 12);

      // Kursy
      const trips = route.tripsTotal !== null
        ? `${route.tripsCompleted}/${route.tripsTotal}`
        : `${route.tripsCompleted}/∞`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(trips, x + w - pad, ry + 26);
      ctx.textAlign = 'left';

      // Przyciski: ⏸/▶ + ✕
      const btnW = 20; const btnH2 = 16;
      const btnY = ry + (hasReturn ? 44 : 30);
      const delX = x + w - pad - btnW;
      const pauseX = delX - btnW - 4;

      const isPaused = route.status === 'paused';
      ctx.fillStyle = isPaused ? 'rgba(20,60,40,0.6)' : 'rgba(60,50,10,0.6)';
      ctx.fillRect(pauseX, btnY, btnW, btnH2);
      ctx.strokeStyle = isPaused ? THEME.success : THEME.warning;
      ctx.strokeRect(pauseX, btnY, btnW, btnH2);
      ctx.fillStyle = isPaused ? THEME.success : THEME.warning;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(isPaused ? '▶' : '⏸', pauseX + btnW / 2, btnY + btnH2 - 3);
      ctx.textAlign = 'left';
      this._addHit(pauseX, btnY, btnW, btnH2, 'trade_toggle_pause', { routeId: route.id, paused: isPaused });

      // ✕ (delete)
      ctx.fillStyle = 'rgba(80,20,20,0.6)';
      ctx.fillRect(delX, btnY, btnW, btnH2);
      ctx.strokeStyle = THEME.danger;
      ctx.strokeRect(delX, btnY, btnW, btnH2);
      ctx.fillStyle = THEME.danger;
      ctx.textAlign = 'center';
      ctx.fillText('✕', delX + btnW / 2, btnY + btnH2 - 3);
      ctx.textAlign = 'left';
      this._addHit(delX, btnY, btnW, btnH2, 'trade_delete', { routeId: route.id });

      ry = btnY + btnH2 + 8;
      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(x + pad, ry); ctx.lineTo(x + w - pad, ry); ctx.stroke();
      ry += 6;
    }

    return ry;
  }

  // ── Ceny lokalne ────────────────────────────────────────────────────────

  _calcLocalPrices(colony) {
    const resSys = colony.resourceSystem;
    const producers = resSys?._producers;
    if (!resSys || !producers) return [];

    const results = [];
    for (const goodId in BASE_PRICE) {
      const stock = resSys.inventory?.get(goodId) ?? 0;
      let consumption = 0;
      let production = 0;
      for (const rates of producers.values()) {
        if (rates[goodId] && rates[goodId] < 0) consumption += Math.abs(rates[goodId]);
        if (rates[goodId] && rates[goodId] > 0) production += rates[goodId];
      }
      if (stock <= 0 && consumption <= 0 && production <= 0) continue;
      const mult = scarcityMultiplier(stock, consumption);
      if (mult !== 1.0) {
        results.push({ id: goodId, mult });
      }
    }
    return results;
  }

  // ── Pomocnik: szukaj ciała w EntityManager ──────────────────────────────

  _findBody(id) {
    if (!id) return null;
    for (const t of ['planet', 'moon', 'asteroid', 'comet', 'planetoid']) {
      for (const b of EntityManager.getByType(t)) {
        if (b.id === id) return b;
      }
    }
    return null;
  }

  // ── Obsługa kliknięć ───────────────────────────────────────────────────

  handleClick(x, y) {
    if (!this.visible) return false;
    const { ox, oy, ow, oh } = this._getOverlayBounds(
      Math.round(window.innerWidth / (Math.min(window.innerWidth / 1280, window.innerHeight / 720))),
      Math.round(window.innerHeight / (Math.min(window.innerWidth / 1280, window.innerHeight / 720)))
    );
    if (x < ox || x > ox + ow || y < oy || y > oy + oh) return false;

    const hit = this._hitTest(x, y);
    if (hit) {
      this._onHit(hit);
      return true;
    }
    return true;
  }

  _onHit(zone) {
    switch (zone.type) {
      case 'close':
        this.hide();
        break;
      case 'migration_toggle': {
        const colId = zone.data.colonyId;
        const col = window.KOSMOS?.colonyManager?.getColony(colId);
        if (col) {
          const isBlocked = col.tradeOverrides?.migration === 'block';
          EventBus.emit('trade:setOverride', {
            colonyId: colId,
            goodId: 'migration',
            mode: isBlocked ? null : 'block',
          });
        }
        break;
      }
      case 'trade_toggle_pause':
        if (zone.data.paused) {
          EventBus.emit('tradeRoute:resume', { routeId: zone.data.routeId });
        } else {
          EventBus.emit('tradeRoute:pause', { routeId: zone.data.routeId });
        }
        break;
      case 'trade_delete':
        EventBus.emit('tradeRoute:delete', { routeId: zone.data.routeId });
        break;
    }
  }

  handleMouseMove(x, y) {
    if (!this.visible) {
      this._hoverTradeBar = null;
      this._hideTooltip();
      return;
    }
    this._hoverZone = this._hitTest(x, y);

    const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    this._mouseScreenX = x * scale;
    this._mouseScreenY = y * scale;

    if (this._hoverZone?.type === 'trade_bar_hover') {
      const key = `${this._hoverZone.data.year}_${this._hoverZone.data.isExport}`;
      if (this._hoverTradeBar !== key) {
        this._hoverTradeBar = key;
        this._showTradeBarTooltip(this._hoverZone.data);
      } else {
        this._showTradeBarTooltip(this._hoverZone.data);
      }
    } else {
      if (this._hoverTradeBar) {
        this._hoverTradeBar = null;
        this._hideTooltip();
      }
    }
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    const { ox, oy, ow, oh } = this._getOverlayBounds(
      Math.round(window.innerWidth / (Math.min(window.innerWidth / 1280, window.innerHeight / 720))),
      Math.round(window.innerHeight / (Math.min(window.innerWidth / 1280, window.innerHeight / 720)))
    );
    if (x < ox || x > ox + ow || y < oy || y > oy + oh) return false;

    if (x < ox + LEFT_W) {
      this._scrollLeft = Math.max(0, this._scrollLeft + delta * 0.5);
    } else {
      this._scrollRight = Math.max(0, this._scrollRight + delta * 0.5);
    }
    return true;
  }
}
