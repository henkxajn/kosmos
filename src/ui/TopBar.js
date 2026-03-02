// TopBar — pasek zasobów + kontrolki czasu (góra ekranu, 50px)
//
// Zastępuje ResourcePanel (4 wskaźniki) + TimeControls (dolny pasek).
// Wyświetla WSZYSTKIE zasoby w 4 grupach: MINED, HARVESTED, COMMODITIES, UTILITY.
// Kontrolki czasu po prawej stronie.
// Tooltip przy hover na zasobie — podsumowanie/bilans.

import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { GAME_CONFIG }    from '../config/GameConfig.js';
import { MINED_RESOURCES, HARVESTED_RESOURCES, UTILITY_RESOURCES } from '../data/ResourcesData.js';
import { COSMIC }         from '../config/LayoutConfig.js';
import EventBus            from '../core/EventBus.js';

// ── Stałe layoutu ──────────────────────────────────────────
const BAR_H     = COSMIC.TOP_BAR_H;    // 50px
const TIME_W    = 280;  // szerokość bloku czasu (prawa strona)
const GROUP_PAD = 8;    // padding między grupami
const ITEM_W    = 80;   // bazowa szerokość jednego zasobu
const ITEM_W_SM = 56;   // kompaktowa szerokość (wąski ekran)

// ── Kolory proxy ──────────────────────────────────────────
const C = {
  get bg()     { return THEME.bgPrimary; },
  get border() { return THEME.border; },
  get title()  { return THEME.accent; },
  get label()  { return THEME.textLabel; },
  get text()   { return THEME.textSecondary; },
  get bright() { return THEME.textPrimary; },
  get green()  { return THEME.success; },
  get red()    { return THEME.danger; },
  get orange() { return THEME.warning; },
  get dim()    { return THEME.textDim; },
};

function _fmtNum(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return Number.isInteger(n) ? String(Math.round(n)) : n.toFixed(1);
}

export class TopBar {
  constructor() {
    this._hoverItem = null;   // klucz zasobu pod kursorem
    this._itemRects = [];     // [{x, y, w, h, item}] — do hit test hover
    this._tooltip   = null;   // {x, y, lines: [{text, color}]} — aktywny tooltip
    this._lastState = null;   // cache stanu do tooltipów
  }

  // ── Rysowanie ───────────────────────────────────────────
  // startX: opcjonalny offset lewej krawędzi zasobów (np. dla "← Wróć" w globe view)
  draw(ctx, W, H, state, startX = 0) {
    const { inventory, invPerYear, energyFlow, resources, resDelta, timeState, factoryData } = state;
    this._lastState = state;
    this._itemRects = [];

    // Tło paska
    ctx.fillStyle = bgAlpha(0.92);
    ctx.fillRect(0, 0, W, BAR_H);
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, BAR_H); ctx.lineTo(W, BAR_H); ctx.stroke();

    // Logo KOSMOS (lewa strona) — tylko gdy brak customowego startX
    const LOGO_W = startX > 0 ? startX : 80;
    if (startX <= 0) {
      ctx.font = `bold ${THEME.fontSizeLarge}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.title;
      ctx.textAlign = 'left';
      ctx.fillText('KOSMOS', 10, 20);
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.label;
      ctx.fillText('4X', 10, 32);
    }

    // Kontrolki czasu (prawa strona)
    this._drawTimeBlock(ctx, W, timeState);

    // Dostępna szerokość na zasoby (między logo/startX a kontrolkami czasu)
    const resStartX = LOGO_W + 4;
    const resEndX   = W - TIME_W - 4;
    const resW      = resEndX - resStartX;

    // Grupy zasobów
    const compact = resW < 700;
    const iw = compact ? ITEM_W_SM : ITEM_W;

    // Zbierz widoczne zasoby per grupę
    const mined     = this._getVisibleMined(inventory, invPerYear);
    const harvested = this._getVisibleHarvested(inventory, invPerYear);
    const utility   = this._getVisibleUtility(energyFlow, resources, resDelta, factoryData);

    const groups = [
      { items: mined,     label: 'SUROWCE',  color: '#886644' },
      { items: harvested, label: 'ZASOBY',   color: '#448866' },
      { items: utility,   label: 'SYSTEMY',  color: '#664488' },
    ];

    let x = resStartX;

    for (let gi = 0; gi < groups.length; gi++) {
      const grp = groups[gi];
      if (grp.items.length === 0) continue;

      // Separator pionowy między grupami
      if (gi > 0 && x > resStartX + 4) {
        ctx.strokeStyle = 'rgba(42,64,96,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 6);
        ctx.lineTo(x, BAR_H - 6);
        ctx.stroke();
        x += GROUP_PAD;
      }

      // Etykieta grupy
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      ctx.fillStyle = grp.color;
      ctx.textAlign = 'left';
      ctx.fillText(grp.label, x, 10);

      // Zasoby w grupie
      let ix = x;
      const row1Y = 22;
      const row2Y = 36;

      for (let i = 0; i < grp.items.length && ix + iw <= resEndX + iw; i++) {
        const item = grp.items[i];

        // Zapamiętaj prostokąt do hover/tooltip
        this._itemRects.push({ x: ix, y: 0, w: iw, h: BAR_H, item });

        // Rząd 1: ikona + symbol : wartość
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = item.color || C.text;
        ctx.textAlign = 'left';

        const valStr = _fmtNum(item.value);
        ctx.fillText(`${item.icon}${item.symbol}`, ix, row1Y);

        ctx.fillStyle = item.value < 1 ? C.dim : C.bright;
        const symW = ctx.measureText(`${item.icon}${item.symbol}`).width;
        ctx.fillText(valStr, ix + symW + 2, row1Y);

        // Rząd 2: delta (jeśli jest)
        if (item.delta !== undefined && Math.abs(item.delta) > 0.01) {
          const sign = item.delta >= 0 ? '+' : '';
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = item.delta >= 0 ? THEME.successDim : THEME.dangerDim;
          ctx.fillText(`${sign}${item.delta.toFixed(1)}`, ix, row2Y);
        } else if (item.flowLabel) {
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = item.flowColor || C.dim;
          ctx.fillText(item.flowLabel, ix, row2Y);
        }

        ix += iw;
      }

      x = ix + GROUP_PAD / 2;
    }

    ctx.textAlign = 'left';

    // ── Tooltip (rysuj na wierzchu) ──
    if (this._tooltip) {
      this._drawTooltip(ctx, W);
    }
  }

  // ── Tooltip ────────────────────────────────────────────
  _drawTooltip(ctx, W) {
    const tt = this._tooltip;
    if (!tt || !tt.lines || tt.lines.length === 0) return;

    const PAD = 8;
    const LH = 14;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;

    // Oblicz wymiary tooltipa
    let maxW = 0;
    for (const line of tt.lines) {
      const tw = ctx.measureText(line.text).width;
      if (tw > maxW) maxW = tw;
    }
    const boxW = maxW + PAD * 2;
    const boxH = tt.lines.length * LH + PAD * 2 - 4;

    // Pozycja — pod item, nie wychodząc poza ekran
    let bx = tt.x;
    let by = BAR_H + 4;
    if (bx + boxW > W - 10) bx = W - boxW - 10;
    if (bx < 4) bx = 4;

    // Tło
    ctx.fillStyle = 'rgba(8,14,28,0.95)';
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = '#3a6090';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, boxW, boxH);

    // Linie tekstu
    for (let i = 0; i < tt.lines.length; i++) {
      const line = tt.lines[i];
      ctx.font = line.bold
        ? `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`
        : `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = line.color || C.text;
      ctx.textAlign = 'left';
      ctx.fillText(line.text, bx + PAD, by + PAD + i * LH + 8);
    }
    ctx.textAlign = 'left';
  }

  // Aktualizuj hover — wywoływane z UIManager/PlanetGlobeScene przy mousemove
  updateHover(mx, my) {
    if (my < 0 || my > BAR_H) {
      this._tooltip = null;
      this._hoverItem = null;
      return;
    }
    // Szukaj itemu pod kursorem
    for (const rect of this._itemRects) {
      if (mx >= rect.x && mx < rect.x + rect.w && my >= rect.y && my < rect.y + rect.h) {
        if (this._hoverItem === rect.item) return; // bez zmian
        this._hoverItem = rect.item;
        this._tooltip = this._buildTooltip(rect.item, rect.x);
        return;
      }
    }
    this._tooltip = null;
    this._hoverItem = null;
  }

  // Buduj dane tooltipa dla danego itemu
  _buildTooltip(item, x) {
    const lines = [];

    // Tytuł
    const name = item.tooltipName || `${item.icon} ${item.symbol || ''}`.trim();
    lines.push({ text: name, color: C.bright, bold: true });

    // Ilość
    lines.push({ text: `Ilość: ${_fmtNum(item.value)}`, color: C.text });

    // Delta / Flow
    if (item.delta !== undefined && Math.abs(item.delta) > 0.01) {
      const sign = item.delta >= 0 ? '+' : '';
      const color = item.delta >= 0 ? THEME.successDim : THEME.dangerDim;
      lines.push({ text: `Zmiana: ${sign}${item.delta.toFixed(1)}/r`, color });
    }

    // Szczegóły energii
    if (item._energyDetails) {
      const e = item._energyDetails;
      lines.push({ text: `Produkcja: +${_fmtNum(e.production)}/r`, color: THEME.successDim });
      lines.push({ text: `Konsumpcja: -${_fmtNum(e.consumption)}/r`, color: THEME.dangerDim });
      lines.push({ text: `Bilans: ${e.balance >= 0 ? '+' : ''}${_fmtNum(e.balance)}/r`,
        color: e.balance >= 0 ? THEME.successDim : THEME.dangerDim });
      if (e.brownout) lines.push({ text: '⚠ BROWNOUT — produkcja wstrzymana', color: C.red });
    }

    // Szczegóły PC (fabryki)
    if (item._pcDetails) {
      const pc = item._pcDetails;
      lines.push({ text: `Używane: ${pc.used}`, color: C.text });
      lines.push({ text: `Dostępne: ${pc.total}`, color: C.text });
      lines.push({ text: `Wolne: ${pc.total - pc.used}`, color: pc.total - pc.used > 0 ? THEME.successDim : C.orange });
    }

    // Flow label (dla elementów z flowLabel ale bez delta)
    if (item.flowLabel && !item._energyDetails && !item._pcDetails && item.delta === undefined) {
      lines.push({ text: item.flowLabel, color: item.flowColor || C.dim });
    }

    return { x, lines };
  }

  // ── Blok kontrolek czasu (prawa strona) ─────────────────
  _drawTimeBlock(ctx, W, timeState) {
    const { isPaused, multiplierIndex, displayText } = timeState;
    const LABELS = GAME_CONFIG.TIME_MULTIPLIER_LABELS;

    const blockX = W - TIME_W;
    const midY   = BAR_H / 2;

    // Separator pionowy
    ctx.strokeStyle = 'rgba(42,64,96,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(blockX, 6);
    ctx.lineTo(blockX, BAR_H - 6);
    ctx.stroke();

    // Przycisk PAUZA/GRAJ
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = isPaused ? C.title : C.text;
    ctx.fillText(isPaused ? '▶' : '⏸', blockX + 8, midY - 6);

    // Przyciski prędkości
    const speedX = blockX + 28;
    const speedLabels = ['×1', '×2', '×4', '×8', '×16'];
    for (let i = 0; i < speedLabels.length; i++) {
      const sx = speedX + i * 32;
      const isActive = !isPaused && multiplierIndex === i + 1;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = isActive ? C.title : C.dim;
      ctx.fillText(speedLabels[i], sx, midY - 6);
    }

    // Czas (rok, dzień)
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.bright;
    ctx.textAlign = 'right';
    ctx.fillText(displayText || '', W - 8, midY - 6);

    // AutoSlow wskaźnik
    const autoSlow = timeState.autoSlow;
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = autoSlow ? THEME.successDim : C.dim;
    ctx.textAlign = 'right';
    ctx.fillText(autoSlow ? 'AUT' : 'aut', W - 8, midY + 8);

    ctx.textAlign = 'left';
  }

  // ── Zbierz widoczne zasoby per grupę ──────────────────
  _getVisibleMined(inv, perYear) {
    const items = [];
    for (const [id, def] of Object.entries(MINED_RESOURCES)) {
      const amt = inv[id] ?? 0;
      const dlt = perYear[id] ?? 0;
      if (amt < 0.5 && Math.abs(dlt) < 0.01) continue; // ukryj zerowe
      items.push({
        icon: def.icon, symbol: id, value: amt, delta: dlt,
        color: def.color || C.text,
        tooltipName: `${def.icon} ${def.namePL} (${id})`,
      });
    }
    return items;
  }

  _getVisibleHarvested(inv, perYear) {
    const items = [];
    for (const [id, def] of Object.entries(HARVESTED_RESOURCES)) {
      const amt = inv[id] ?? 0;
      const dlt = perYear[id] ?? 0;
      items.push({
        icon: def.icon, symbol: '', value: amt, delta: dlt,
        color: def.color || C.text,
        tooltipName: `${def.icon} ${def.namePL}`,
      });
    }
    return items;
  }

  _getVisibleUtility(energyFlow, resources, resDelta, factoryData) {
    const items = [];

    // Energia (flow balance)
    const bal = energyFlow.balance ?? 0;
    const brownout = energyFlow.brownout;
    let eIcon = '⚡';
    let eVal, eColor, eFlowLabel, eFlowColor;
    if (brownout) {
      const blink = Date.now() % 1000 < 500;
      eVal = 0;
      eColor = blink ? C.red : '#880000';
      eFlowLabel = '⚠ BROWNOUT';
      eFlowColor = C.red;
    } else {
      eVal = bal;
      eColor = bal < 0 ? C.orange : THEME.successDim;
      eFlowLabel = `+${_fmtNum(energyFlow.production ?? 0)}/-${_fmtNum(energyFlow.consumption ?? 0)}`;
      eFlowColor = C.dim;
    }
    items.push({
      icon: eIcon, symbol: '', value: eVal,
      color: eColor,
      flowLabel: eFlowLabel, flowColor: eFlowColor,
      tooltipName: '⚡ Energia',
      _energyDetails: {
        production: energyFlow.production ?? 0,
        consumption: energyFlow.consumption ?? 0,
        balance: bal,
        brownout,
      },
    });

    // Nauka (akumulator + delta)
    const resAmt = resources.research ?? 0;
    const resDlt = resDelta.research ?? 0;
    items.push({
      icon: '🔬', symbol: '', value: resAmt, delta: resDlt,
      color: '#aa44ff',
      tooltipName: '🔬 Nauka (research)',
    });

    // PC — Production Capacity (zawsze widoczne w civMode)
    const fd = factoryData ?? window.KOSMOS?.factorySystem;
    const totalPts = fd?.totalPoints ?? 0;
    const usedPts  = fd?.usedPoints  ?? 0;
    if (window.KOSMOS?.civMode) {
      items.push({
        icon: '🏭', symbol: 'PC',
        value: usedPts,
        color: usedPts >= totalPts && totalPts > 0 ? C.orange : '#6688aa',
        flowLabel: `${usedPts}/${totalPts}`,
        flowColor: usedPts >= totalPts && totalPts > 0 ? C.orange : C.dim,
        tooltipName: '🏭 Punkty Produkcji (PC)',
        _pcDetails: { used: usedPts, total: totalPts },
      });
    }

    return items;
  }

  // ── Hit testing ──────────────────────────────────────────
  hitTest(x, y, W) {
    if (y > BAR_H) return false;

    const blockX = W - TIME_W;

    // Klik w bloku czasu
    if (x >= blockX) {
      return this._hitTestTime(x, y, W);
    }
    return false;
  }

  _hitTestTime(x, y, W) {
    const blockX = W - TIME_W;
    const midY = BAR_H / 2;

    // Przycisk PAUZA/GRAJ
    if (x >= blockX + 4 && x <= blockX + 26) {
      const isPaused = window.KOSMOS?.timeSystem?.isPaused ?? false;
      isPaused ? EventBus.emit('time:play') : EventBus.emit('time:pause');
      return true;
    }

    // Przyciski prędkości
    const speedX = blockX + 28;
    for (let i = 0; i < 5; i++) {
      const sx = speedX + i * 32;
      if (x >= sx - 4 && x <= sx + 28) {
        EventBus.emit('time:setMultiplier', { index: i + 1 });
        EventBus.emit('time:play');
        return true;
      }
    }

    // AutoSlow toggle (w prawym dolnym rogu bloku)
    if (x >= W - 36 && y >= midY + 2) {
      EventBus.emit('time:autoSlowToggle');
      return true;
    }

    return true; // pochłoń klik w bloku czasu
  }

  // Sprawdza czy punkt jest nad TopBar (do blokady kamery)
  isOver(x, y) {
    return y <= BAR_H;
  }
}
