// TradeOverlay — panel Handlu (klawisz H)
//
// Handel (handel cywilny między koloniami) i Rynek (Order Board cross-empire) — strony grupy Ekonomii na zestawie konsoli
// (ARC KONSOLE K3-B; KZ-E: ścieżka konsoli jest jedyną ścieżką). Rysunek: `TradeConsoleView.js`; tu — stan, wejście,
// akcje (strefy trafień), ceny lokalne i podpowiedzi DOM.

import { BaseOverlay }    from './BaseOverlay.js';
import { THEME }          from '../config/ThemeConfig.js';
import { ALL_RESOURCES }  from '../data/ResourcesData.js';
import { COMMODITIES }    from '../data/CommoditiesData.js';
import { BASE_PRICE, scarcityMultiplier } from '../data/TradeValuesData.js';
import EventBus           from '../core/EventBus.js';
import { t, getName, getLocale } from '../i18n/i18n.js';
import { applyConsoleHalo } from './ConsoleKit.js';
import { drawTradeConsole } from './TradeConsoleView.js';
import { applyEconChip }  from './EconomyConsoleLogic.js';
import { tradeColonyOptions, pickTradeColony } from './TradeConsoleLogic.js';
import { installTradeDebug } from './TradeConsoleView.js';

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

    // K3-B — konsola: strefy ostatniej klatki (wejście czyta je stąd, bez window.inner*), skala UI z rysunku, wybrane
    // połączenie Handlu, przewijanie pasa (lista = _scrollLeft, inspektor = _scrollRight — jak dzisiejsze kolumny)
    this.consoleZones   = null;
    this._uiScale       = 1;
    this._tradeConnId   = null;
    this._kitScrollStrip = 0;
    this._tradeColId    = null;   // K3 runda 2 — lokalna kolonia Handlu (wybrana w konsoli; bez switchActiveColony)
    this._ctxOpen       = false;  // lista wyboru kolonii otwarta

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
    // K3-B — skala zapamiętana w draw() (prostokąt pola pochodzi ze stref konsoli)
    const SCALE = this._uiScale || 1;
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
    lines.push(`<div style="font-weight:bold;color:${color}">${arrow} ${label}${year != null ? ` — ${t('tradePanel.year')} ${year}` : ''}</div>`);
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

  /**
   * K3 runda 2 — kolonia, która handluje. Konsola: lokalny wybór (`_tradeColId`) → aktywna gry, gdy pełna → pierwsza pełna
   * (globalnej aktywnej NIE przełącza — `switchActiveColony` podmienia systemy całego UI).
   */
  _tradeColonyId() {
    const cm = window.KOSMOS?.colonyManager;
    return pickTradeColony(tradeColonyOptions(cm?.getPlayerColonies?.() ?? []), this._tradeColId, cm?.activePlanetId);
  }

  // ── Główna metoda rysowania ──────────────────────────────────────────────

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];
    installTradeDebug(this);

    // K3-B — poświata za całym rysunkiem konsoli; zdjęta przez restore (pasek walki i reszta UI bez niej)
    ctx.save();
    applyConsoleHalo(ctx);
    try { drawTradeConsole(this, ctx, W, H); } finally { ctx.restore(); }
  }

  _empireName(emp, fallbackId) {
    if (!emp) return fallbackId;
    const en = getLocale() === 'en';
    return (en ? (emp.nameEN ?? emp.namePL) : (emp.namePL ?? emp.nameEN)) ?? emp.name ?? fallbackId;
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

  // ── Obsługa kliknięć ───────────────────────────────────────────────────

  handleClick(x, y) {
    if (!this.visible) return false;
    // K3-B — geometria wyłącznie ze stref ostatniej klatki (bez window.inner*); klik w ramie zawsze pochłonięty
    const f = this.consoleZones?.frame;
    if (!f || x < f.x || x > f.x + f.w || y < f.y || y > f.y + f.h) return false;
    const hit = this._hitTest(x, y);
    if (hit) this._onHit(hit);
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
        const bSys = window.KOSMOS?.colonyManager?.getColony?.(colonyId)?.buildingSystem;
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
        const resSys = window.KOSMOS?.colonyManager?.getColony?.(colonyId)?.resourceSystem;
        if (!resSys) break;
        resSys.receive({ [goodId]: qty });
        EventBus.emit('trade:spendCredits', { colonyId, amount: cost, purpose: 'emergency_buy' });
        break;
      }
      case 'spend_festival': {
        const { cost, colonyId } = zone.data;
        const civTrade = window.KOSMOS?.civilianTradeSystem;
        if (!civTrade || civTrade.getCredits(colonyId) < cost) break;
        const prospSys = window.KOSMOS?.colonyManager?.getColony?.(colonyId)?.prosperitySystem;
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
        // K3-B — czip grupy w nagłówku konsoli (D-K-15): Budżet / Produkcja / Handel / Rynek / Przepływy
        if (zone.data?.id) applyEconChip(zone.data.id, window.KOSMOS?.overlayManager);
        break;
      case 'trade_ctx_toggle':   // K3 runda 2 — „Twoja kolonia ▾” otwiera / zamyka listę kolonii
        this._ctxOpen = !this._ctxOpen;
        break;
      case 'trade_ctx_pick':     // wybór kolonii Handlu (tylko pełne kolonie mają strefę); lokalnie, bez switchActiveColony
        this._tradeColId = zone.data.colonyId;
        this._ctxOpen = false;
        this._tradeConnId = null;
        this._scrollLeft = 0;
        this._scrollRight = 0;
        break;
      case 'trade_conn':   // K3-B — wybór połączenia na liście konsoli (inspektor pokazuje jego przepływy)
        this._tradeConnId = zone.data.partnerId;
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
        const tradeColId = this._tradeColonyId();
        if (board && this._marketAiColId) {
          board.placeOrder({
            side: zone.type === 'market_buy' ? 'buy' : 'sell',
            goodId: zone.data.goodId,
            qty: zone.data.qty,
            playerColonyId: tradeColId,
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

    // K3-B — skala UI zapamiętana w draw()
    const scale = this._uiScale || 1;
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
    // K3-B — lista, inspektor i pas przewijane osobno ze stref ostatniej klatki; klamra w rysunku
    const f = this.consoleZones?.frame;
    if (!f || x < f.x || x > f.x + f.w || y < f.y || y > f.y + f.h) return false;
    const inR = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (inR(this._consoleListRect)) this._scrollLeft = Math.max(0, this._scrollLeft + delta * 0.5);
    else if (inR(this._consoleInspRect)) this._scrollRight = Math.max(0, this._scrollRight + delta * 0.5);
    else if (inR(this._consoleStripRect)) this._kitScrollStrip = Math.max(0, this._kitScrollStrip + delta * 0.5);
    return true;
  }
}
