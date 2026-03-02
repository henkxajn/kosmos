// TopBar — pasek zasobów + kontrolki czasu (góra ekranu, 50px)
//
// Zastępuje ResourcePanel (4 wskaźniki) + TimeControls (dolny pasek).
// Wyświetla WSZYSTKIE zasoby w 4 grupach: MINED, HARVESTED, COMMODITIES, UTILITY.
// Kontrolki czasu po prawej stronie.

import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { GAME_CONFIG }    from '../config/GameConfig.js';
import { MINED_RESOURCES, HARVESTED_RESOURCES, UTILITY_RESOURCES } from '../data/ResourcesData.js';
// Commodities usunięte z TopBar — za dużo elementów
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
    this._hoverItem = null; // klucz zasobu pod kursorem
  }

  // ── Rysowanie ───────────────────────────────────────────
  // startX: opcjonalny offset lewej krawędzi zasobów (np. dla "← Wróć" w globe view)
  draw(ctx, W, H, state, startX = 0) {
    const { inventory, invPerYear, energyFlow, resources, resDelta, timeState } = state;

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

    // Zbierz widoczne zasoby per grupę (bez commodities — za dużo)
    const mined     = this._getVisibleMined(inventory, invPerYear);
    const harvested = this._getVisibleHarvested(inventory, invPerYear);
    const utility   = this._getVisibleUtility(energyFlow, resources, resDelta);

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
      let maxPerRow = Math.floor((resEndX - x) / iw);
      let cols = Math.min(grp.items.length, Math.max(2, maxPerRow));

      for (let i = 0; i < grp.items.length && ix + iw <= resEndX + iw; i++) {
        const item = grp.items[i];
        // Nazwa/symbol
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = item.color || C.text;
        ctx.textAlign = 'left';

        // Rząd 1: ikona + symbol : wartość
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
      });
    }
    return items;
  }

  _getVisibleUtility(energyFlow, resources, resDelta) {
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
    });

    // Nauka (akumulator + delta)
    const resAmt = resources.research ?? 0;
    const resDlt = resDelta.research ?? 0;
    items.push({
      icon: '🔬', symbol: '', value: resAmt, delta: resDlt,
      color: '#aa44ff',
    });

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
