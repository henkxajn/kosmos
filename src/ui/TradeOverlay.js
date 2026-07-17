// TradeOverlay — panel Handlu (klawisz H)
//
// Pełnoekranowy overlay handlu: handel cywilny (L), log/wykresy/trasy (R).
// Wyodrębniony z EconomyOverlay — wszystko co dotyczy handlu między koloniami.

import { BaseOverlay, HEADER_H }   from './BaseOverlay.js';
import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { ALL_RESOURCES }  from '../data/ResourcesData.js';
import { COMMODITIES }    from '../data/CommoditiesData.js';
import { BASE_PRICE, scarcityMultiplier, TRADEABLE_GOODS } from '../data/TradeValuesData.js';
import EventBus           from '../core/EventBus.js';
import EntityManager      from '../core/EntityManager.js';
import { t, getName, getLocale } from '../i18n/i18n.js';

const LEFT_W  = 320;
const TAB_H   = HEADER_H;   // pasmo nagłówka = standard (było 32)

// ══════════════════════════════════════════════════════════════════════════════
// TradeOverlay
// ══════════════════════════════════════════════════════════════════════════════

export class TradeOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._scrollLeft  = 0;
    this._scrollRight = 0;

    // S3.5b — zakładka Rynek (Order Board cross-empire)
    this._tab            = 'trade';   // 'trade' | 'market'
    this._marketEmpireId = null;
    this._marketAiColId  = null;
    this._marketGoodId   = null;
    this._marketQty      = 10;

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
    this._closeQtyInput();
  }

  // ── Inline input ilości (wpisanie z klawiatury nad polem, wzór EconomyOverlay safety stock) ──
  _openQtyInput(canvasX, canvasY, boxW, boxH) {
    this._closeQtyInput();

    // Skala logiczne → fizyczne piksele (identyczna jak w UIManager/EconomyOverlay)
    const SCALE = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    const sx = canvasX * SCALE, sy = canvasY * SCALE;
    const sw = boxW * SCALE, sh = boxH * SCALE;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.value = String(this._marketQty ?? 10);
    Object.assign(input.style, {
      position: 'fixed',
      left: `${Math.round(sx)}px`,
      top:  `${Math.round(sy)}px`,
      width: `${Math.round(sw)}px`,
      height: `${Math.round(sh)}px`,
      boxSizing: 'border-box',
      padding: '0 3px',
      margin: '0',
      background: THEME.bgPrimary,
      border: `1px solid ${THEME.borderActive}`,
      color: THEME.accent,
      fontFamily: THEME.fontFamily,
      fontSize: `${Math.max(10, Math.round(sh * 0.7))}px`,
      textAlign: 'center',
      outline: 'none',
      zIndex: '300',
      caretColor: THEME.accent,
      appearance: 'textfield',
    });

    document.body.appendChild(input);
    this._qtyInput = input;

    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      const raw = parseInt(input.value, 10);
      this._marketQty = Number.isFinite(raw) ? Math.max(1, raw) : (this._marketQty ?? 10);
      this._closeQtyInput();
    };
    const cancel = () => {
      if (done) return;
      done = true;
      this._closeQtyInput();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      e.stopPropagation(); // nie propaguj do GameScene (Space, 1-5, etc.)
    });
    input.addEventListener('blur', commit);
    // Nie propaguj klików do canvas (nie zamknij overlay ani nie trigger hit zones)
    for (const evt of ['click', 'mousedown', 'mouseup']) {
      input.addEventListener(evt, (e) => e.stopPropagation());
    }

    requestAnimationFrame(() => { input.focus(); input.select(); });
  }

  _closeQtyInput() {
    const el = this._qtyInput;
    if (!el) return;
    this._qtyInput = null;
    el.onblur = null;
    if (el.parentNode) el.parentNode.removeChild(el);
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

    // Tło
    ctx.fillStyle = bgAlpha(0.38);
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, ow, oh);

    // Treść wg aktywnej zakładki (S3.5b)
    if (this._tab === 'market') {
      this._drawMarket(ctx, ox, oy, ow, oh);
    } else {
      // Separator kolumn
      ctx.strokeStyle = THEME.borderActive;
      ctx.beginPath();
      ctx.moveTo(ox + LEFT_W, oy); ctx.lineTo(ox + LEFT_W, oy + oh);
      ctx.stroke();
      this._drawLeft(ctx, ox, oy, LEFT_W, oh);
      this._drawRight(ctx, ox + LEFT_W, oy, ow - LEFT_W, oh);
    }

    // Zakładki — PO treści (na wierzchu), żeby nagłówki kolumn ich nie zamalowały
    this._drawTabs(ctx, ox, oy, ow);

    // Przycisk zamknięcia [X] — na końcu
    const closeX = ox + ow - 24;
    const closeY = oy + 4;
    ctx.font = `bold 14px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('✕', closeX, closeY + 14);
    this._addHit(closeX - 4, closeY, 22, 22, 'close');
  }

  // ── Pasek zakładek (Handel | Rynek) — prawy górny róg, przed [X] ──────────
  _drawTabs(ctx, ox, oy, ow) {
    const tabs = [
      { id: 'trade',  label: t('tradePanel.tabTrade') },
      { id: 'market', label: t('tradePanel.tabMarket') },
    ];
    let tx = ox + ow - 28; // tuż przed [X]
    for (let i = tabs.length - 1; i >= 0; i--) {
      const tb = tabs[i];
      const tw = 84;
      tx -= tw + 4;
      const active = this._tab === tb.id;
      ctx.fillStyle = active ? 'rgba(255,200,60,0.14)' : 'rgba(0,0,0,0.30)';
      ctx.fillRect(tx, oy + 5, tw, 22);
      ctx.strokeStyle = active ? THEME.accent : THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(tx + 0.5, oy + 5.5, tw - 1, 21);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = active ? THEME.accent : THEME.textSecondary;
      ctx.textAlign = 'center';
      ctx.fillText(tb.label, tx + tw / 2, oy + 20);
      ctx.textAlign = 'left';
      this._addHit(tx, oy + 4, tw, 24, 'tab', { tab: tb.id });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ZAKŁADKA RYNEK (S3.5b) — Order Board: kupno/sprzedaż z koloniami AI
  // ══════════════════════════════════════════════════════════════════════════
  _drawMarket(ctx, ox, oy, ow, oh) {
    const colMgr   = window.KOSMOS?.colonyManager;
    const dipl     = window.KOSMOS?.diplomacySystem;
    const civTrade = window.KOSMOS?.civilianTradeSystem;
    const empReg   = window.KOSMOS?.empireRegistry;
    const board    = window.KOSMOS?.tradeOrderBoard;
    const warp     = window.KOSMOS?.techSystem?.isResearched?.('ion_drives') ?? false;
    const now      = window.KOSMOS?.timeSystem?.gameTime ?? 0;

    const activeColId = colMgr?.activePlanetId;
    const playerCol   = colMgr?.getColony?.(activeColId);
    const playerOk    = !!playerCol && !playerCol.ownerEmpireId && !playerCol.isOutpost;

    // Separator kolumn
    ctx.strokeStyle = THEME.borderActive;
    ctx.beginPath(); ctx.moveTo(ox + LEFT_W, oy); ctx.lineTo(ox + LEFT_W, oy + oh); ctx.stroke();

    // Partnerzy = kolonie AI z traktatem handlowym, grupowane po imperium
    const byEmpire = new Map();
    for (const c of (colMgr?.getAllColonies?.() ?? [])) {
      if (!c.ownerEmpireId) continue;
      if (!(dipl?.hasTradeAgreement?.(c.ownerEmpireId) ?? false)) continue;
      if (!byEmpire.has(c.ownerEmpireId)) byEmpire.set(c.ownerEmpireId, []);
      byEmpire.get(c.ownerEmpireId).push(c);
    }

    this._drawMarketLeft(ctx, ox, oy, LEFT_W, oh, { byEmpire, civTrade, empReg, warp });
    this._drawMarketRight(ctx, ox + LEFT_W, oy, ow - LEFT_W, oh,
      { colMgr, civTrade, board, playerCol, playerOk, activeColId, now });
  }

  _drawMarketLeft(ctx, x, y, w, h, d) {
    const { byEmpire, civTrade, empReg, warp } = d;
    const pad = 14;

    this._drawOverlayHeader(ctx, x, y, w, t('market.header'));

    const listY = y + TAB_H;
    const listH = h - TAB_H;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, listY, w, listH); ctx.clip();
    let ry = listY + 6 - this._scrollLeft;

    if (byEmpire.size === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(warp ? t('market.noPartners') : t('market.requiresWarpTreaty'), x + pad, ry + 12);
      ctx.restore();
      return;
    }

    for (const [empireId, cols] of byEmpire) {
      const emp = empReg?.get?.(empireId);
      const empName = this._empireName(emp, empireId);
      const selected = this._marketEmpireId === empireId;

      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = selected ? THEME.accent : THEME.textPrimary;
      ctx.fillText(`${selected ? '▾' : '▸'} ${empName.slice(0, 16)}`, x + pad, ry + 12);
      this._addHit(x + pad, ry, w - pad * 2 - 60, 16, 'market_empire', { empireId });

      // Toggle Auto-handel (po prawej)
      const autoOn = civTrade?.isCrossEmpireTradeEnabled?.(empireId) ?? true;
      const tgW = 52;
      const tgX = x + w - pad - tgW;
      ctx.fillStyle = autoOn ? 'rgba(0,255,180,0.10)' : 'rgba(216,90,48,0.12)';
      ctx.fillRect(tgX, ry, tgW, 16);
      ctx.strokeStyle = autoOn ? THEME.accent : '#D85A30';
      ctx.lineWidth = 1; ctx.strokeRect(tgX + 0.5, ry + 0.5, tgW - 1, 15);
      ctx.fillStyle = autoOn ? THEME.accent : '#D85A30';
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(`⇄ ${autoOn ? t('market.on') : t('market.off')}`, tgX + tgW / 2, ry + 12);
      ctx.textAlign = 'left';
      this._addHit(tgX, ry, tgW, 16, 'market_empire_toggle', { empireId });
      ry += 20;

      if (selected) {
        for (const col of cols) {
          const cSel = this._marketAiColId === col.planetId;
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillStyle = cSel ? THEME.accent : THEME.textSecondary;
          ctx.fillText(`   ${cSel ? '●' : '○'} ${(col.name ?? col.planetId).slice(0, 22)}`, x + pad, ry + 11);
          this._addHit(x + pad, ry, w - pad * 2, 15, 'market_colony', { aiColId: col.planetId, empireId });
          ry += 16;
        }
        ry += 2;
      }
    }
    ctx.restore();
  }

  _drawMarketRight(ctx, x, y, w, h, d) {
    const { colMgr, civTrade, board, playerCol, playerOk, activeColId, now } = d;
    const pad = 14;

    const aiCol = this._marketAiColId ? colMgr?.getColony?.(this._marketAiColId) : null;

    const title = aiCol
      ? `${t('market.tradeWith')} ${(aiCol.name ?? this._marketAiColId).slice(0, 18)}`
      : t('market.selectColony');
    this._drawOverlayHeader(ctx, x, y, w, title);

    const listY = y + TAB_H;
    const listH = h - TAB_H;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, listY, w, listH); ctx.clip();
    let ry = listY + 6 - this._scrollRight;

    if (!aiCol) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('market.selectColonyHint'), x + pad, ry + 12);
      ctx.restore();
      return;
    }

    if (!playerOk) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      ctx.fillText(t('market.activeColonyRequired'), x + pad, ry + 11);
      ry += 18;
    }

    // Panel akcji wybranego towaru
    if (this._marketGoodId) {
      ry = this._drawMarketAction(ctx, x, ry, w, { civTrade, playerCol, playerOk, aiCol });
    }

    // Inventory AI (klikalne wiersze)
    const aiRes = aiCol.resourceSystem;
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('market.inventory'), x + pad, ry + 11);
    ry += 16;

    for (const goodId of TRADEABLE_GOODS) {
      const stock = aiRes?.inventory?.get(goodId) ?? 0;
      const cd = COMMODITIES[goodId]; const rd = ALL_RESOURCES[goodId];
      const nm = cd ? getName(cd, 'commodity') : rd ? getName(rd, 'resource') : goodId;
      const icon = (cd ?? rd)?.icon ?? '';
      const price = civTrade?.getLocalPrice ? civTrade.getLocalPrice(goodId, playerCol ?? aiCol) : (BASE_PRICE[goodId] ?? 1);
      const sel = this._marketGoodId === goodId;
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = sel ? THEME.accent : (stock > 0 ? THEME.textSecondary : THEME.textDim);
      ctx.fillText(`${icon} ${nm.slice(0, 15)}`, x + pad, ry + 12);
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(stock)} · ~${this._fmtKr(price)}Kr`, x + w - pad, ry + 12);
      ctx.textAlign = 'left';
      this._addHit(x + pad, ry, w - pad * 2, 17, 'market_good', { goodId });
      ry += 17;
    }
    ry += 6;

    // Zlecenia w toku (aktywna kolonia gracza)
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, ry); ctx.lineTo(x + w - pad, ry); ctx.stroke();
    ry += 8;
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(t('market.pendingOrders'), x + pad, ry + 11);
    ry += 16;

    const orders = board?.getOrders?.({ playerColonyId: activeColId }) ?? [];
    if (orders.length === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('market.noPendingOrders'), x + pad + 4, ry + 10);
      ry += 16;
    } else {
      for (const o of orders) {
        const cd = COMMODITIES[o.goodId]; const rd = ALL_RESOURCES[o.goodId];
        const nm = cd ? getName(cd, 'commodity') : rd ? getName(rd, 'resource') : o.goodId;
        const sideLbl = o.side === 'buy' ? t('market.buy') : t('market.sell');
        const yrs = Math.max(0, (o.deliverYear - now)).toFixed(1);
        const cbW = 44;
        const cbX = x + w - pad - cbW;

        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = o.side === 'buy' ? THEME.info : THEME.warning;
        ctx.fillText(`${sideLbl} ${nm.slice(0, 11)} ×${Math.round(o.qty)}`, x + pad + 4, ry + 11);
        ctx.fillStyle = THEME.textDim;
        ctx.textAlign = 'right';
        ctx.fillText(`${this._fmtKr(o.total)}Kr·${yrs}${t('market.yearsShort')}`, cbX - 6, ry + 11);
        ctx.textAlign = 'left';

        ctx.fillStyle = 'rgba(216,90,48,0.12)';
        ctx.fillRect(cbX, ry, cbW, 14);
        ctx.strokeStyle = '#D85A30'; ctx.lineWidth = 1; ctx.strokeRect(cbX + 0.5, ry + 0.5, cbW - 1, 13);
        ctx.fillStyle = '#D85A30';
        ctx.textAlign = 'center';
        ctx.fillText(t('market.cancelShort'), cbX + cbW / 2, ry + 11);
        ctx.textAlign = 'left';
        this._addHit(cbX, ry, cbW, 14, 'market_cancel', { orderId: o.id });
        ry += 16;
      }
    }
    ctx.restore();
  }

  // Panel akcji: ilość +/-, ceny kup/sprzedaj, przyciski. Zwraca nowe ry.
  _drawMarketAction(ctx, x, ry, w, d) {
    const { civTrade, playerCol, playerOk, aiCol } = d;
    const pad = 14;
    const goodId = this._marketGoodId;
    const cd = COMMODITIES[goodId]; const rd = ALL_RESOURCES[goodId];
    const nm = cd ? getName(cd, 'commodity') : rd ? getName(rd, 'resource') : goodId;
    const qty = this._marketQty;

    const buyPrice  = civTrade?.getLocalPrice ? civTrade.getLocalPrice(goodId, playerCol ?? aiCol) : (BASE_PRICE[goodId] ?? 1);
    const sellPrice = civTrade?.getLocalPrice ? civTrade.getLocalPrice(goodId, aiCol) : (BASE_PRICE[goodId] ?? 1);
    const buyTotal  = this._fmtKr(buyPrice * qty);
    const sellTotal = this._fmtKr(sellPrice * qty);

    const bx = x + pad;
    const bw = w - pad * 2;
    ctx.fillStyle = 'rgba(255,200,60,0.06)';
    ctx.fillRect(bx, ry, bw, 80);
    ctx.strokeStyle = THEME.border; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, ry + 0.5, bw - 1, 79);

    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(nm, bx + 6, ry + 15);

    // qty [-] N [+]
    const qy = ry + 26;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(t('market.qty'), bx + 6, qy + 12);
    const qbX = bx + 56;
    this._miniBtn(ctx, qbX, qy, 18, '−', 'market_qty', { delta: -10 });
    // Klikalne pole liczby — otwiera modal do wpisania ilości z klawiatury
    const numX = qbX + 22, numW = 44, numH = 16;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(numX, qy, numW, numH);
    ctx.strokeStyle = THEME.border; ctx.lineWidth = 1;
    ctx.strokeRect(numX + 0.5, qy + 0.5, numW - 1, numH - 1);
    ctx.fillStyle = THEME.textPrimary; ctx.textAlign = 'center';
    ctx.fillText(String(qty), numX + numW / 2, qy + 12);
    ctx.textAlign = 'left';
    this._addHit(numX, qy, numW, numH, 'market_qty_edit', {
      boxCanvasX: numX, boxCanvasY: qy, boxW: numW, boxH: numH,
    });
    this._miniBtn(ctx, qbX + 66, qy, 18, '+', 'market_qty', { delta: +10 });

    // Kup / Sprzedaj
    const aby = ry + 52;
    const abw = Math.floor((bw - 12) / 2);
    this._actionBtn(ctx, bx + 4, aby, abw, 22, `${t('market.buy')} ${buyTotal}Kr`, playerOk, 'buy');
    if (playerOk) this._addHit(bx + 4, aby, abw, 22, 'market_buy', { goodId, qty });
    this._actionBtn(ctx, bx + 8 + abw, aby, abw, 22, `${t('market.sell')} ${sellTotal}Kr`, playerOk, 'sell');
    if (playerOk) this._addHit(bx + 8 + abw, aby, abw, 22, 'market_sell', { goodId, qty });

    return ry + 80 + 8;
  }

  _miniBtn(ctx, bx, by, sz, label, type, data) {
    ctx.fillStyle = 'rgba(255,200,60,0.12)';
    ctx.fillRect(bx, by, sz, 16);
    ctx.strokeStyle = THEME.accent; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, sz - 1, 15);
    ctx.fillStyle = THEME.textPrimary; ctx.textAlign = 'center';
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillText(label, bx + sz / 2, by + 12);
    ctx.textAlign = 'left';
    this._addHit(bx, by, sz, 16, type, data);
  }

  _actionBtn(ctx, bx, by, bw, bh, label, enabled, style) {
    ctx.fillStyle = enabled ? (style === 'sell' ? 'rgba(0,255,180,0.10)' : 'rgba(120,180,255,0.12)') : 'rgba(80,80,80,0.10)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = enabled ? (style === 'sell' ? THEME.accent : THEME.info) : THEME.border;
    ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = enabled ? THEME.textPrimary : THEME.textDim;
    ctx.textAlign = 'center';
    ctx.fillText(label, bx + bw / 2, by + bh / 2 + 4);
    ctx.textAlign = 'left';
  }

  _empireName(emp, fallbackId) {
    if (!emp) return fallbackId;
    const en = getLocale() === 'en';
    return (en ? (emp.nameEN ?? emp.namePL) : (emp.namePL ?? emp.nameEN)) ?? emp.name ?? fallbackId;
  }

  // Format Kr: 1 miejsce po przecinku gdy < 100 (małe ceny scarcity nie znikają w „0"), inaczej zaokrąglone.
  _fmtKr(v) {
    if (!Number.isFinite(v)) return '0';
    return v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEWA KOLUMNA — handel cywilny (kredyty, połączenia, ceny, migracja)
  // ══════════════════════════════════════════════════════════════════════════

  _drawLeft(ctx, x, y, w, h) {
    const pad = 14;

    // Nagłówek (standard)
    this._drawOverlayHeader(ctx, x, y, w, t('tradePanel.header'));

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
    const colony = colMgr?.getColony(activeColId); // potrzebne też poniżej (Wydaj / Kontrola)
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

    // ── Wydaj Kredyty ──────────────────────────────────────────────────────
    ry += 8;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, ry); ctx.lineTo(x + w - pad, ry); ctx.stroke();
    ry += 8;

    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(t('tradePanel.spendHeader'), x + pad, ry + 11);
    ry += 18;

    const krAvail = civCredits;
    const btnH = 22;
    const btnW = w - pad * 2 - 4;

    // 1. Rush Build — przyspieszenie budowy o 50%
    const RUSH_COST = 30;
    const buildSys = window.KOSMOS?.buildingSystem;
    const hasConstruction = buildSys && buildSys._constructionQueue?.size > 0;
    const canRush = hasConstruction && krAvail >= RUSH_COST;

    this._drawSpendButton(ctx, x + pad + 2, ry, btnW, btnH,
      `${t('tradePanel.rushBuild')} (${RUSH_COST} Kr)`,
      hasConstruction ? t('tradePanel.rushBuildDesc') : t('tradePanel.rushBuildNone'),
      canRush);
    if (hasConstruction) {
      this._addHit(x + pad + 2, ry, btnW, btnH, 'spend_rush', { cost: RUSH_COST, colonyId: activeColId });
    }
    ry += btnH + 4;

    // 2. Awaryjny zakup — 50 jedn. najdroższego brakującego surowca
    const buyPrices = colony?.resourceSystem ? this._calcLocalPrices(colony) : [];
    const scarce = buyPrices.filter(p => p.mult >= 2.0).sort((a, b) => b.mult - a.mult);
    const buyTarget = scarce.length > 0 ? scarce[0] : null;
    const BUY_QTY = 50;
    const buyCost = buyTarget ? Math.ceil(BASE_PRICE[buyTarget.id] * buyTarget.mult * BUY_QTY * 0.15) : 0;
    const canBuy = buyTarget && krAvail >= buyCost;

    const buyLabel = buyTarget
      ? `${t('tradePanel.buyResource')} ${buyTarget.id} ×${BUY_QTY} (${buyCost} Kr)`
      : `${t('tradePanel.buyResource')} — ${t('tradePanel.cheap')}`;
    this._drawSpendButton(ctx, x + pad + 2, ry, btnW, btnH, buyLabel, t('tradePanel.buyResourceDesc'), canBuy);
    if (buyTarget) {
      this._addHit(x + pad + 2, ry, btnW, btnH, 'spend_buy', { cost: buyCost, goodId: buyTarget.id, qty: BUY_QTY, colonyId: activeColId });
    }
    ry += btnH + 4;

    // 3. Festyn — +5 prosperity na 3 lata
    const FEST_COST = 80;
    const prospSys = window.KOSMOS?.prosperitySystem;
    const festivalActive = prospSys?._eventBonuses?.has('trade_festival');
    const canFest = !festivalActive && krAvail >= FEST_COST;

    const festLabel = `${t('tradePanel.festival')} (${FEST_COST} Kr)` + (festivalActive ? ` ${t('tradePanel.festivalActive')}` : '');
    this._drawSpendButton(ctx, x + pad + 2, ry, btnW, btnH, festLabel, t('tradePanel.festivalDesc'), canFest);
    if (!festivalActive) {
      this._addHit(x + pad + 2, ry, btnW, btnH, 'spend_festival', { cost: FEST_COST, colonyId: activeColId });
    }
    ry += btnH + 6;

    // ── Kontrola handlu towarami ───────────────────────────────────────────
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, ry); ctx.lineTo(x + w - pad, ry); ctx.stroke();
    ry += 8;

    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(t('tradePanel.tradeControlHeader'), x + pad, ry + 11);
    ry += 18;

    const overrides = civTrade?.getOverrides(activeColId) ?? {};
    const toggleSize = 16;
    const colW = Math.floor((w - pad * 2) / 2); // 2 kolumny

    for (let i = 0; i < TRADEABLE_GOODS.length; i++) {
      const goodId = TRADEABLE_GOODS[i];
      const colIdx = i % 2;
      const gx = x + pad + colIdx * colW;
      const gy = ry + Math.floor(i / 2) * (toggleSize + 3);

      const isBlocked = overrides[goodId] === 'block';
      const icon = isBlocked ? t('tradePanel.goodBlocked') : t('tradePanel.goodAllowed');

      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = isBlocked ? THEME.danger : THEME.success;
      ctx.fillText(icon, gx, gy + 12);

      ctx.fillStyle = isBlocked ? THEME.textDim : THEME.textSecondary;
      const cd = COMMODITIES[goodId]; const rd = ALL_RESOURCES[goodId];
      const goodName = cd ? getName(cd, 'commodity') : rd ? getName(rd, 'resource') : goodId;
      ctx.fillText(goodName.slice(0, 14), gx + 18, gy + 12);

      this._addHit(gx, gy, colW - 4, toggleSize, 'trade_toggle_good', { goodId, colonyId: activeColId, blocked: isBlocked });
    }
    ry += Math.ceil(TRADEABLE_GOODS.length / 2) * (toggleSize + 3) + 4;

    ctx.restore();
  }

  // ── Przycisk wydawania Kr ──────────────────────────────────────────────

  _drawSpendButton(ctx, bx, by, bw, bh, label, desc, enabled) {
    // Tło przycisku
    ctx.fillStyle = enabled ? 'rgba(255,200,60,0.12)' : 'rgba(80,80,80,0.1)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = enabled ? THEME.accent : THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);

    // Etykieta
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = enabled ? THEME.textPrimary : THEME.textDim;
    ctx.fillText(label, bx + 6, by + 14);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRAWA KOLUMNA — wykresy, log transakcji, trasy handlowe
  // ══════════════════════════════════════════════════════════════════════════

  _drawRight(ctx, x, y, w, h) {
    const pad = 14;

    // Nagłówek (standard)
    this._drawOverlayHeader(ctx, x, y, w, t('tradePanel.activityHeader'));

    const colMgr   = window.KOSMOS?.colonyManager;
    const vMgr     = window.KOSMOS?.vesselManager;
    const tradeLog = window.KOSMOS?.tradeLog;
    const activeColId = colMgr?.activePlanetId;

    const log    = tradeLog?.getLog(activeColId, 30) ?? [];
    const yearly = tradeLog?.getYearlyAggregation(activeColId, 10) ?? [];

    const listY = y + TAB_H;
    const listH = h - TAB_H;

    const hasData = log.length > 0 || yearly.length > 0;
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
      // Pokaż towary z wyraźnym odchyleniem od ceny bazowej (>10% w górę/dół)
      if (mult > 1.1 || mult < 0.9) {
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
      // ── Wydawanie Kredytów ─────────────────────────────────────────────
      case 'spend_rush': {
        const { cost, colonyId } = zone.data;
        const civTrade = window.KOSMOS?.civilianTradeSystem;
        if (!civTrade || civTrade.getCredits(colonyId) < cost) break;
        const bSys = window.KOSMOS?.buildingSystem;
        if (!bSys || bSys._constructionQueue?.size === 0) break;
        // Przyspiesz wszystkie budowy o 50% postępu
        for (const [, entry] of bSys._constructionQueue) {
          entry.progress += entry.buildTime * 0.5;
        }
        EventBus.emit('trade:spendCredits', { colonyId, amount: cost, purpose: 'rush_build' });
        break;
      }
      case 'spend_buy': {
        const { cost, goodId, qty, colonyId } = zone.data;
        const civTrade = window.KOSMOS?.civilianTradeSystem;
        if (!civTrade || civTrade.getCredits(colonyId) < cost) break;
        const resSys = window.KOSMOS?.resourceSystem;
        if (!resSys) break;
        resSys.receive({ [goodId]: qty });
        EventBus.emit('trade:spendCredits', { colonyId, amount: cost, purpose: 'emergency_buy' });
        break;
      }
      case 'spend_festival': {
        const { cost, colonyId } = zone.data;
        const civTrade = window.KOSMOS?.civilianTradeSystem;
        if (!civTrade || civTrade.getCredits(colonyId) < cost) break;
        const prospSys = window.KOSMOS?.prosperitySystem;
        if (!prospSys) break;
        prospSys.addEventBonus('trade_festival', 5, 3);
        EventBus.emit('trade:spendCredits', { colonyId, amount: cost, purpose: 'festival' });
        break;
      }

      // ── Toggle blokady handlu towarem ──────────────────────────────────
      case 'trade_toggle_good': {
        const { goodId, colonyId, blocked } = zone.data;
        EventBus.emit('trade:setOverride', {
          colonyId,
          goodId,
          mode: blocked ? null : 'block',
        });
        break;
      }

      // ── S3.5b: zakładka Rynek (Order Board) ──────────────────────────────
      case 'tab':
        this._tab = zone.data.tab;
        this._scrollLeft = 0;
        this._scrollRight = 0;
        break;
      case 'market_empire':
        this._marketEmpireId = (this._marketEmpireId === zone.data.empireId) ? null : zone.data.empireId;
        this._marketAiColId = null;
        this._marketGoodId = null;
        break;
      case 'market_empire_toggle': {
        const civTrade = window.KOSMOS?.civilianTradeSystem;
        if (civTrade?.isCrossEmpireTradeEnabled) {
          civTrade.setCrossEmpireTrade(zone.data.empireId, !civTrade.isCrossEmpireTradeEnabled(zone.data.empireId));
        }
        break;
      }
      case 'market_colony':
        this._marketAiColId = zone.data.aiColId;
        this._marketGoodId = null;
        break;
      case 'market_good':
        this._marketGoodId = zone.data.goodId;
        break;
      case 'market_qty':
        this._marketQty = Math.max(1, (this._marketQty ?? 10) + zone.data.delta);
        break;
      case 'market_qty_edit':
        // Wpisanie ilości z klawiatury bezpośrednio w UI (input nad polem, wzór EconomyOverlay safety stock)
        this._openQtyInput(zone.data.boxCanvasX, zone.data.boxCanvasY, zone.data.boxW, zone.data.boxH);
        break;
      case 'market_buy':
      case 'market_sell': {
        const board = window.KOSMOS?.tradeOrderBoard;
        const activeColId = window.KOSMOS?.colonyManager?.activePlanetId;
        if (board && this._marketAiColId) {
          board.placeOrder({
            side: zone.type === 'market_buy' ? 'buy' : 'sell',
            goodId: zone.data.goodId,
            qty: zone.data.qty,
            playerColonyId: activeColId,
            aiColonyId: this._marketAiColId,
          });
        }
        break;
      }
      case 'market_cancel':
        window.KOSMOS?.tradeOrderBoard?.cancelOrder?.(zone.data.orderId);
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
