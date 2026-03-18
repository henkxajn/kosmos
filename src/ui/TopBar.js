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
import { BUILDINGS }      from '../data/BuildingsData.js';
import EventBus            from '../core/EventBus.js';
import EntityManager       from '../core/EntityManager.js';
import { t, getName }     from '../i18n/i18n.js';

// ── Stałe layoutu ──────────────────────────────────────────
const BAR_H     = COSMIC.TOP_BAR_H;    // 50px
const TIME_W    = COSMIC.OUTLINER_W;  // szerokość bloku czasu = outliner (wyrównanie)
const GROUP_PAD = 5;    // padding między grupami
const ITEM_W    = 68;   // bazowa szerokość jednego zasobu — węższa
const ITEM_W_SM = 50;   // kompaktowa szerokość (wąski ekran)

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
    this._tooltipEl = null;   // DOM tooltip element (nad wszystkimi canvasami)
    this._createTooltipEl();
  }

  _createTooltipEl() {
    if (this._tooltipEl) return;
    const el = document.createElement('div');
    el.id = 'topbar-tooltip';
    el.style.cssText = `
      position: fixed; z-index: 60; pointer-events: none;
      display: none; max-width: 320px; padding: 8px 10px;
      background: rgba(6,12,20,0.96); border: 1px solid ${THEME.borderActive};
      border-radius: 4px; font-family: 'Courier New', monospace;
      font-size: 11px; color: ${THEME.textSecondary}; line-height: 1.5;
    `;
    document.body.appendChild(el);
    this._tooltipEl = el;
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
    const LOGO_W = startX > 0 ? startX : 56;
    if (startX <= 0) {
      ctx.font = `bold ${THEME.fontSizeNormal + 2}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.title;
      ctx.textAlign = 'left';
      ctx.fillText('KOSMOS', 6, 20);
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.label;
      // Wskaźnik aktywnego układu gwiezdnego (Etap 40)
      const ssMgr = window.KOSMOS?.starSystemManager;
      const sysCount = ssMgr?.getAllSystems().length ?? 0;
      if (sysCount > 1) {
        const activeId = ssMgr?.activeSystemId ?? 'sys_home';
        const activeStar = EntityManager.getStarOfSystem(activeId);
        const starName = activeStar?.name ?? activeId;
        ctx.fillText(`⭐ ${starName}`, 6, 32);
      } else {
        ctx.fillText('4X', 6, 32);
      }
    }

    // Kontrolki czasu (prawa strona)
    this._drawTimeBlock(ctx, W, timeState);

    // Dostępna szerokość na zasoby (między logo/startX a kontrolkami czasu)
    const resStartX = LOGO_W + 4;
    const resEndX   = W - TIME_W - 4;
    const resW      = resEndX - resStartX;

    // Zbierz widoczne zasoby per grupę
    const mined     = this._getVisibleMined(inventory, invPerYear);
    const harvested = this._getVisibleHarvested(inventory, invPerYear);
    const utility   = this._getVisibleUtility(energyFlow, resources, resDelta, factoryData);

    const groups = [
      { items: mined,     label: t('topBar.resources'),  color: THEME.textHeader },
      { items: harvested, label: t('topBar.stocks'),   color: THEME.textHeader },
      { items: utility,   label: t('topBar.systems'),  color: THEME.textHeader },
    ];

    // Policz łączną liczbę itemów + separatorów → dopasuj iw dynamicznie
    const totalItems = groups.reduce((s, g) => s + g.items.length, 0);
    const numSeps = groups.filter(g => g.items.length > 0).length - 1;
    const sepSpace = Math.max(0, numSeps) * GROUP_PAD;
    const availForItems = resW - sepSpace;
    let iw = Math.min(ITEM_W, Math.floor(availForItems / Math.max(totalItems, 1)));
    if (iw < 36) iw = 36; // minimum czytelności

    let x = resStartX;

    for (let gi = 0; gi < groups.length; gi++) {
      const grp = groups[gi];
      if (grp.items.length === 0) continue;

      // Separator pionowy między grupami
      if (gi > 0 && x > resStartX + 4) {
        ctx.strokeStyle = THEME.border;
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

      for (let i = 0; i < grp.items.length; i++) {
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

    // Tooltip rysowany osobno przez drawTooltip() — na samym wierzchu
  }

  // ── Tooltip (DOM — nad wszystkimi canvasami) ───────────
  _showDomTooltip(scale) {
    const tt = this._tooltip;
    if (!tt || !tt.lines || tt.lines.length === 0 || !this._tooltipEl) {
      this._hideDomTooltip();
      return;
    }

    // Buduj HTML
    const html = tt.lines.map(line => {
      const weight = line.bold ? 'font-weight:bold;' : '';
      const color  = line.color || THEME.textSecondary;
      return `<div style="${weight}color:${color}">${line.text}</div>`;
    }).join('');

    this._tooltipEl.innerHTML = html;
    this._tooltipEl.style.display = 'block';

    // Przelicz logiczne koordynaty → piksele ekranowe
    let tx = tt.x * scale;
    let ty = (BAR_H + 4) * scale;

    // Nie wychodź poza ekran
    const rect = this._tooltipEl.getBoundingClientRect();
    const W = window.innerWidth;
    if (tx + rect.width > W - 10) tx = W - rect.width - 10;
    if (tx < 4) tx = 4;

    this._tooltipEl.style.left = `${Math.round(tx)}px`;
    this._tooltipEl.style.top  = `${Math.round(ty)}px`;
  }

  _hideDomTooltip() {
    if (this._tooltipEl) this._tooltipEl.style.display = 'none';
  }

  // Publiczny — aktualizuj DOM tooltip (wywoływany co frame z draw)
  // scale = PS_SCALE (logiczne → ekranowe)
  drawTooltip(ctx, W, scale = 1) {
    if (this._tooltip) {
      this._showDomTooltip(scale);
    } else {
      this._hideDomTooltip();
    }
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
    lines.push({ text: t('ui.amount', _fmtNum(item.value)), color: C.text });

    // Delta / Flow
    if (item.delta !== undefined && Math.abs(item.delta) > 0.01) {
      const sign = item.delta >= 0 ? '+' : '';
      const color = item.delta >= 0 ? THEME.successDim : THEME.dangerDim;
      lines.push({ text: t('ui.change', sign + item.delta.toFixed(1)), color });
    }

    // Szczegóły energii
    if (item._energyDetails) {
      const e = item._energyDetails;
      lines.push({ text: t('ui.production', _fmtNum(e.production)), color: THEME.successDim });
      lines.push({ text: t('ui.consumption', _fmtNum(e.consumption)), color: THEME.dangerDim });
      lines.push({ text: t('ui.balance', (e.balance >= 0 ? '+' : '') + _fmtNum(e.balance)),
        color: e.balance >= 0 ? THEME.successDim : THEME.dangerDim });
      if (e.brownout) lines.push({ text: t('topBar.brownoutWarning'), color: C.red });
    }

    // Rozbicie per budynek — dla energii i wszystkich zasobów z deltą
    const breakdownKey = item._energyDetails ? 'energy' : item._breakdownKey;
    if (breakdownKey) {
      const resSys = window.KOSMOS?.resourceSystem;
      if (resSys) {
        const bd = resSys.getResourceBreakdown(breakdownKey);
        const prodKeys = Object.keys(bd.producers);
        const consKeys = Object.keys(bd.consumers);
        if (prodKeys.length > 0) {
          lines.push({ text: t('econPanel.producers'), color: C.dim });
          for (const type of prodKeys) {
            const g = bd.producers[type];
            const def = BUILDINGS[type];
            const name = def ? getName(def, 'building') : type;
            const icon = def?.icon ?? '?';
            const cnt = g.count > 1 ? ` ×${g.count}` : '';
            lines.push({ text: `${icon} ${name}${cnt}  +${_fmtNum(g.total)}/r`, color: THEME.successDim });
          }
        }
        if (consKeys.length > 0) {
          lines.push({ text: t('econPanel.consumers'), color: C.dim });
          for (const type of consKeys) {
            const g = bd.consumers[type];
            let name, icon;
            if (type === 'pop_consumption') {
              name = t('topBar.popConsumption'); icon = '👥';
            } else {
              const def = BUILDINGS[type];
              name = def ? getName(def, 'building') : type;
              icon = def?.icon ?? '?';
            }
            const cnt = g.count > 1 ? ` ×${g.count}` : '';
            lines.push({ text: `${icon} ${name}${cnt}  ${_fmtNum(g.total)}/r`, color: THEME.dangerDim });
          }
        }
      }
    }

    // Szczegóły PC (fabryki)
    if (item._pcDetails) {
      const pc = item._pcDetails;
      lines.push({ text: `${t('topBar.used')} ${pc.used}`, color: C.text });
      lines.push({ text: `${t('topBar.available')} ${pc.total}`, color: C.text });
      lines.push({ text: `${t('topBar.free')} ${pc.total - pc.used}`, color: pc.total - pc.used > 0 ? THEME.successDim : C.orange });
    }

    // Szczegóły POP
    if (item._popDetails) {
      const p = item._popDetails;
      lines.push({ text: `${t('topBar.employed')} ${p.employed}`, color: C.text });
      lines.push({ text: `${t('topBar.locked')} ${p.locked}`, color: p.locked > 0 ? C.orange : C.text });
      lines.push({ text: `${t('topBar.freePops')} ${p.free}`, color: p.free > 0 ? THEME.successDim : C.orange });
      lines.push({ text: `${t('topBar.housingLabel')} ${p.housing}`, color: p.pop >= p.housing ? C.orange : C.text });
    }

    // Flow label (dla elementów z flowLabel ale bez delta)
    if (item.flowLabel && !item._energyDetails && !item._pcDetails && !item._popDetails && item.delta === undefined) {
      lines.push({ text: item.flowLabel, color: item.flowColor || C.dim });
    }

    return { x, lines };
  }

  // ── Blok kontrolek czasu (prawa strona) ─────────────────
  _drawTimeBlock(ctx, W, timeState) {
    const { isPaused, multiplierIndex, displayText } = timeState;

    const blockX = W - TIME_W;
    const btnH = 16;        // wysokość przycisków
    const btnY = 6;         // pozycja Y przycisków (górny rząd)
    const btnGap = 2;       // odstęp między przyciskami
    const btnR = 0;         // brak zaokrągleń (spec: zero border-radius)

    // Separator pionowy
    ctx.strokeStyle = THEME.borderLight;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(blockX, 6);
    ctx.lineTo(blockX, BAR_H - 6);
    ctx.stroke();

    // Przycisk PAUZA/GRAJ (kwadratowy)
    const playX = blockX + 6;
    const playW = 20;
    const playActive = isPaused;
    this._drawBtn(ctx, playX, btnY, playW, btnH, btnR,
      isPaused ? '▶' : '⏸',
      playActive ? THEME.accent : THEME.textDim,
      playActive ? THEME.bgSecondary : null);

    // Przyciski prędkości — kompaktowe (6 przycisków: 1d, 1t, 1m, 1r, 10r, 10k)
    const speedLabels = [t('speed.1d'), t('speed.1w'), t('speed.1m'), t('speed.1y'), t('speed.10y'), t('speed.10k')];
    const speedBtnW = 20;
    let sx = playX + playW + btnGap + 2;
    for (let i = 0; i < speedLabels.length; i++) {
      const isActive = !isPaused && multiplierIndex === i + 1;
      this._drawBtn(ctx, sx, btnY, speedBtnW, btnH, btnR,
        speedLabels[i],
        isActive ? THEME.bgPrimary : THEME.textDim,
        isActive ? THEME.accent : null);
      sx += speedBtnW + btnGap;
    }

    // Dolny rząd: data + AutoSlow
    const row2Y = btnY + btnH + 5;

    // Data (lewa strona bloku czasu)
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.bright;
    ctx.textAlign = 'left';
    ctx.fillText(displayText || '', blockX + 8, row2Y + 9);

    // AutoSlow wskaźnik (prawa strona)
    const autoSlow = timeState.autoSlow;
    this._drawBtn(ctx, W - 30, row2Y, 24, 14, 0,
      'AUT',
      autoSlow ? THEME.bgPrimary : THEME.textDim,
      autoSlow ? THEME.successDim : null,
      THEME.fontSizeSmall - 2);

    ctx.textAlign = 'left';
  }

  // Rysuj mini-przycisk z opcjonalnym tłem
  _drawBtn(ctx, x, y, w, h, r, label, textColor, bgColor, fontSize) {
    // Tło (jeśli podane)
    if (bgColor) {
      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
    } else {
      // Obramowanie (subtelne)
      ctx.strokeStyle = THEME.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.stroke();
    }
    // Tekst wyśrodkowany
    ctx.font = `${fontSize ?? (THEME.fontSizeSmall - 1)}px ${THEME.fontFamily}`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + 3);
    ctx.textAlign = 'left';
  }

  // ── Zbierz widoczne zasoby per grupę ──────────────────
  _getVisibleMined(inv, perYear) {
    const items = [];
    for (const [id, def] of Object.entries(MINED_RESOURCES)) {
      const amt = inv[id] ?? 0;
      const dlt = perYear[id] ?? 0;
      // Pokaż wszystkie surowce — gracz widzi pełny bilans
      items.push({
        icon: def.icon, symbol: id, value: amt, delta: dlt,
        color: def.color || C.text,
        tooltipName: `${def.icon} ${getName(def, 'resource')} (${id})`,
        _breakdownKey: id,
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
        tooltipName: `${def.icon} ${getName(def, 'resource')}`,
        _breakdownKey: id,
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
      eColor = blink ? C.red : THEME.dangerDim;
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
      tooltipName: `⚡ ${t('resource.energy')}`,
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
      color: THEME.purple,
      tooltipName: `🔬 ${t('resource.research')}`,
      _breakdownKey: 'research',
    });

    // PC — Production Capacity (zawsze widoczne w civMode)
    const fd = factoryData ?? window.KOSMOS?.factorySystem;
    const totalPts = fd?.totalPoints ?? 0;
    const usedPts  = fd?.usedPoints  ?? 0;
    if (window.KOSMOS?.civMode) {
      items.push({
        icon: '🏭', symbol: 'PC',
        value: usedPts,
        color: usedPts >= totalPts && totalPts > 0 ? C.orange : THEME.textSecondary,
        flowLabel: `${usedPts}/${totalPts}`,
        flowColor: usedPts >= totalPts && totalPts > 0 ? C.orange : C.dim,
        tooltipName: `🏭 ${t('topBar.productionPoints')}`,
        _pcDetails: { used: usedPts, total: totalPts },
      });
    }

    // POP — Populacja (zawsze widoczne w civMode)
    const civSys = window.KOSMOS?.civSystem;
    if (window.KOSMOS?.civMode && civSys) {
      const pop     = civSys.population ?? 0;
      const free    = civSys.freePops ?? 0;
      const housing = civSys.housing ?? 0;
      const employed = civSys._employedPops ?? 0;
      const locked   = civSys._lockedPops ?? 0;
      const atCap    = pop >= housing && housing > 0;
      items.push({
        icon: '👤', symbol: 'POP',
        value: pop,
        color: atCap ? C.orange : free > 0 ? THEME.successDim : THEME.textSecondary,
        flowLabel: `${free}/${pop}`,
        flowColor: free > 0 ? THEME.successDim : C.orange,
        tooltipName: `👤 ${t('topBar.populationLabel')}`,
        _popDetails: { pop, free, employed, locked, housing },
      });
    }

    // Prosperity (zawsze widoczne w civMode)
    const prospSys = window.KOSMOS?.prosperitySystem;
    if (window.KOSMOS?.civMode && prospSys) {
      const pVal = Math.round(prospSys.prosperity ?? 50);
      const pColor = pVal < 30 ? THEME.dangerDim : pVal < 60 ? C.orange : THEME.successDim;
      items.push({
        icon: '⭐', symbol: '',
        value: pVal,
        color: pColor,
        tooltipName: '⭐ Prosperity',
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
    const btnY = 6;
    const btnH = 16;
    const btnGap = 2;

    // Przycisk PAUZA/GRAJ
    const playX = blockX + 6;
    const playW = 20;
    if (x >= playX && x <= playX + playW && y >= btnY && y <= btnY + btnH) {
      const isPaused = window.KOSMOS?.timeSystem?.isPaused ?? false;
      isPaused ? EventBus.emit('time:play') : EventBus.emit('time:pause');
      return true;
    }

    // Przyciski prędkości (6 przycisków)
    const speedBtnW = 20;
    let sx = playX + playW + btnGap + 2;
    for (let i = 0; i < 6; i++) {
      if (x >= sx && x <= sx + speedBtnW && y >= btnY && y <= btnY + btnH) {
        EventBus.emit('time:setMultiplier', { index: i + 1 });
        EventBus.emit('time:play');
        return true;
      }
      sx += speedBtnW + btnGap;
    }

    // AutoSlow toggle (dolny rząd, prawy róg)
    if (x >= W - 30 && y >= btnY + btnH + 5) {
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
