// TopResourceDrawer — górny wysuwany pasek surowców (redesign UI v1).
//
// Zastępuje BottomResourceBar (dolny pasek aktywnej kolonii) hover-drawerem przy GÓRNEJ
// krawędzi: cienki trigger 6px od SAMEJ GÓRY ekranu (y=0); hover → zjeżdża panel z JEDNYM WIERSZEM NA
// KOLONIĘ (aktywna pierwsza, reszta niżej, scroll gdy więcej). Wiersz = nazwa · 👤 Pop ·
// 10 surowców · paliwo · food · water · research 🔬 · bilans energii ⚡ · dobrobyt ⭐ ·
// kredyty ₡ (wszystko per-kolonia z col.resourceSystem/civSystem/prosperitySystem).
// Tooltipy per token zachowane (port z BottomResourceBar — wartości z danych kolonii,
// bez globalnego getResourceBreakdown). Substrat Canvas 2D; zdarzenia z window → UIManager.
//
// Wzorzec slide/hover/scroll: NavDrawer (stepSlide + _hovered/_hideAt + clampScroll),
// ale PIONOWO (panel zjeżdża w dół, clip-reveal). Non-exclusive: rysowany PO overlayManager.

import { THEME, bgAlpha, GLASS_BORDER, hexToRgb } from '../config/ThemeConfig.js';
import { COSMIC }            from '../config/LayoutConfig.js';
import { MINED_RESOURCES, HARVESTED_RESOURCES } from '../data/ResourcesData.js';
import { COMMODITIES }       from '../data/CommoditiesData.js';
import EntityManager         from '../core/EntityManager.js';
import { t, getName }        from '../i18n/i18n.js';
import { drawResourceIcon, hasIconFile, hasResourceIcon } from './ResourceIcons.js';
import { stepSlide, navIsAnimating, clampScroll, pointInRect, NAV_TRIGGER_W, NAV_HIDE_DELAY }
  from './NavDrawerLogic.js';

const BOTTOM_H   = COSMIC.BOTTOM_BAR_H;  // 26
// Trigger/panel kotwiczone od y=0 (sama góra ekranu). Chip czasu (TopBar) to overlay w
// prawym górnym rogu — panel przykrywa go tylko na czas hovera (po zjeździe chip wraca).
const ROW_H      = 24;                   // wysokość wiersza kolonii
const PAD        = 8;
const ROW_PAD_Y  = 3;                    // górny/dolny margines listy

// Odstępy tokenów (jak BottomResourceBar — ciasne, by zmieścić ogon)
const GAP_ICON   = 2;
const GAP_VAL    = 2;
const GAP_PLAIN  = 5;
const GAP_TOKEN  = 4;
const GAP_DELTA0 = 3;
const GAP_GROUP  = 6;

function _fmtNum(n) {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return Number.isInteger(n) ? String(Math.round(n)) : n.toFixed(1);
}
function _fmtPop(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}
function _fmtPopFrac(n) { return String(Math.round((n ?? 0) * 100) / 100); }
function _fmtDelta(n) {
  const a = Math.abs(n);
  let r;
  if (a >= 1_000) r = `${(n / 1_000).toFixed(1)}k`;
  else if (a >= 10) r = n.toFixed(0);
  else r = n.toFixed(1);
  return (n >= 0 ? '+' : '') + r;
}

export class TopResourceDrawer {
  constructor() {
    this._slideProgress = 0;   // 0=schowany, 1=wysunięty
    this._hovered       = false;
    this._hideAt        = 0;
    this._scrollY       = 0;
    this._maxScroll     = 0;
    this._triggerRect   = null;  // pasek 6px (zawsze hoverowalny)
    this._panelRect     = null;  // {x,y,w,h} widocznego panelu (revealH)
    this._colonyRects   = [];    // [{x,y,w,h, planetId}] — klik nazwy → panel kolonii
    this._hitItems      = [];    // [{x,y,w,h, tip}] — tooltipy per token
    this._hoverTip      = null;
  }

  _markDirty() { const um = window.KOSMOS?.uiManager; if (um) um._dirty = true; }
  isAnimating() { return navIsAnimating(this._slideProgress, this._hideAt); }
  isOpen() { return this._slideProgress > 0.001; }

  // ── Kolonie gracza (aktywna pierwsza) ──────────────────────────────────────
  _playerColonies() {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return [];
    const all = (colMgr.getAllColonies?.() ?? [])
      .filter(c => !c?.ownerEmpireId || c.ownerEmpireId === 'player');
    const activeId = colMgr.activePlanetId;
    return [
      ...all.filter(c => c.planetId === activeId),
      ...all.filter(c => c.planetId !== activeId),
    ];
  }

  // ── Tokeny jednej kolonii (port BottomResourceBar._collect, źródło = kolonia) ──
  _colonyTokens(col) {
    const rs = col.resourceSystem;
    if (!rs?.inventorySnapshot) return null;
    const snap = rs.inventorySnapshot();
    const perYear = (id) => snap._observedPerYear?.[id] ?? snap._perYear?.[id] ?? 0;
    const items = [];

    // 10 wydobywalnych + Food + Water (ikony PNG)
    for (const [id, def] of Object.entries(MINED_RESOURCES)) {
      items.push({ id, icon: def.icon, val: snap[id] ?? 0, color: def.color || THEME.textSecondary,
        kind: 'resource', delta: perYear(id), showDelta: true });
    }
    for (const [id, def] of Object.entries(HARVESTED_RESOURCES)) {
      items.push({ id, icon: def.icon, val: snap[id] ?? 0, color: def.color || THEME.textSecondary,
        kind: 'resource', delta: perYear(id), showDelta: true });
    }
    // Paliwo — commodity witalny (S3.0a)
    const fuelDef = COMMODITIES.fuel;
    if (fuelDef) items.push({ id: 'fuel', icon: fuelDef.icon, val: snap['fuel'] ?? 0,
      color: THEME.textSecondary, kind: 'commodity', delta: perYear('fuel'), showDelta: true });

    // Research (per-kolonia akumulator)
    const research = snap._research ?? {};
    items.push({ id: 'research', icon: '🔬', val: research.amount ?? 0, color: '#aa44ff',
      kind: 'research', delta: research.perYear ?? 0, showDelta: true });

    // Bilans energii (per-kolonia)
    const e = snap._energy ?? {};
    const brownout = !!e.brownout;
    const eBal = Math.round(e.balance ?? 0);
    items.push({ icon: '⚡', val: brownout ? 0 : eBal, raw: true, signed: !brownout,
      color: brownout ? THEME.danger : eBal < 0 ? THEME.warning : THEME.success,
      kind: 'energy', energy: { production: e.production ?? 0, consumption: e.consumption ?? 0,
        balance: e.balance ?? 0, brownout } });

    // Dobrobyt (per-kolonia)
    const ps = col.prosperitySystem;
    const prosp = ps?.prosperity;
    if (prosp !== undefined && prosp !== null) {
      const p = Math.round(prosp);
      const trend = (ps?.targetProsperity ?? prosp) - prosp;
      items.push({ icon: '⭐', val: p, raw: true,
        color: p < 30 ? THEME.danger : p < 60 ? THEME.warning : THEME.success,
        kind: 'prosperity', delta: trend, showDelta: true });
    }

    // Kredyty (per-kolonia)
    const credits = col.credits;
    if (credits !== undefined && credits !== null) {
      items.push({ id: 'credits', icon: '🪙', val: credits, valText: _fmtNum(credits),
        raw: true, color: THEME.warning, kind: 'credits' });
    }

    return { items, brownout };
  }

  // ── Rysowanie ───────────────────────────────────────────────────────────
  draw(ctx, W, H) {
    if (this._hideAt > 0 && Date.now() >= this._hideAt) { this._hideAt = 0; this._hovered = false; }
    this._slideProgress = stepSlide(this._slideProgress, this._hovered ? 1 : 0);

    this._hitItems = [];
    this._colonyRects = [];

    // Inset 6px z lewej i prawej (= szerokość triggerów pionowych) — rogi należą wyłącznie
    // do NavDrawer (lewy) / Outliner (prawy); trigger poziomy ich nie nachodzi.
    const EDGE = NAV_TRIGGER_W;
    const px = EDGE;
    const pw = W - 2 * EDGE;
    const panelTop = 0;    // od samej góry ekranu

    // ── Trigger (pasek 6px przy samej górnej krawędzi, pełna szerokość) ──
    // Kolor = THEME.accent (wspólny dla wszystkich triggerów krawędziowych) @ 0.4/0.85.
    const trigActive = this._hovered || this._slideProgress > 0.001;
    const a = hexToRgb(THEME.accent);
    ctx.fillStyle = `rgba(${a.r},${a.g},${a.b},${trigActive ? 0.85 : 0.4})`;
    ctx.fillRect(px, panelTop, pw, NAV_TRIGGER_W);
    this._triggerRect = { x: px, y: panelTop, w: pw, h: NAV_TRIGGER_W + 2 };

    if (this._slideProgress <= 0.001) { this._panelRect = null; this._hoverTip = null; return; }

    // ── Panel: wiersz na kolonię, clip-reveal w dół ──
    const cols = this._playerColonies();
    const contentH = ROW_PAD_Y * 2 + Math.max(1, cols.length) * ROW_H;
    const maxPanelH = Math.max(ROW_H, H - BOTTOM_H - 8);   // od y=0 do nad dolnym paskiem
    const panelH = Math.min(contentH, maxPanelH);
    const revealH = Math.round(panelH * this._slideProgress);
    this._maxScroll = Math.max(0, contentH - panelH);
    this._scrollY = clampScroll(this._scrollY, this._maxScroll);
    this._panelRect = { x: px, y: panelTop, w: pw, h: revealH };

    // Tło panelu + dolna krawędź (czerwona jeśli brownout dowolnej kolonii)
    let anyBrownout = false;
    ctx.fillStyle = bgAlpha(0.94);
    ctx.fillRect(px, panelTop, pw, revealH);

    ctx.save();
    ctx.beginPath(); ctx.rect(px, panelTop, pw, revealH); ctx.clip();
    ctx.textAlign = 'left';

    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const rowTop = panelTop + ROW_PAD_Y - this._scrollY + i * ROW_H;
      // Pomiń wiersze poza widocznym pasem (i hit-rects też)
      if (rowTop + ROW_H <= panelTop || rowTop >= panelTop + revealH) continue;
      const isActive = col.planetId === window.KOSMOS?.colonyManager?.activePlanetId;
      const data = this._colonyTokens(col);
      if (data?.brownout) anyBrownout = true;
      this._drawRow(ctx, col, data, px, rowTop, pw, isActive);
    }
    ctx.restore(); // clip

    // Dolna krawędź panelu
    ctx.strokeStyle = anyBrownout ? THEME.danger : GLASS_BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, panelTop + revealH - 0.5); ctx.lineTo(px + pw, panelTop + revealH - 0.5); ctx.stroke();
  }

  _drawRow(ctx, col, data, px, rowTop, pw, isActive) {
    const cy = rowTop + ROW_H / 2;
    let cx = px + PAD;

    // Subtelny separator wiersza (dolna linia)
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, rowTop + ROW_H - 0.5); ctx.lineTo(px + pw, rowTop + ROW_H - 0.5); ctx.stroke();

    // Highlight aktywnego wiersza
    if (isActive) {
      ctx.fillStyle = THEME.accentDim;
      ctx.fillRect(px, rowTop, pw, ROW_H);
    }

    ctx.textBaseline = 'middle';

    // Nazwa kolonii (aktywna = accent, reszta = textPrimary)
    const name = col.name ?? EntityManager.get(col.planetId)?.name ?? col.planetId ?? '—';
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = isActive ? THEME.accent : THEME.textPrimary;
    ctx.fillText(name, cx, cy);
    const colStart = px;
    cx += ctx.measureText(name).width + 8;

    // Pop: 👤 łącznie (N wolne)
    const civSys = col.civSystem;
    if (civSys) {
      const popTotal = civSys.population ?? 0;
      const popFree  = civSys.freePops ?? 0;
      const popEmp   = civSys._employedPops ?? 0;
      const popLock  = civSys._lockedPops ?? 0;
      const popBase  = `👤 ${_fmtPop(popTotal)} `;
      const popFreeS = t('resBar.freeSuffix', _fmtPopFrac(popFree));
      const popStartX = cx;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(popBase, cx, cy); cx += ctx.measureText(popBase).width;
      ctx.fillStyle = popFree > 0 ? THEME.success : THEME.textSecondary;
      ctx.fillText(popFreeS, cx, cy); cx += ctx.measureText(popFreeS).width + 8;
      this._hitItems.push({ x: popStartX, y: rowTop, w: cx - popStartX - 8, h: ROW_H,
        tip: { kind: 'pop', total: popTotal, free: popFree, employed: popEmp, locked: popLock } });
    }

    // Klik nazwy/pop → panel kolonii (jak dawny colonyRect)
    this._colonyRects.push({ x: colStart, y: rowTop, w: cx - colStart, h: ROW_H, planetId: col.planetId });

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(cx, rowTop + 4); ctx.lineTo(cx, rowTop + ROW_H - 4); ctx.stroke();
    cx += 8;

    // Tokeny (surowce/research/energia/dobrobyt/kredyty) — lewo→prawo
    if (data?.items) {
      const iconCY = cy;
      const iconSize = ROW_H - 8;  // 16px
      for (const it of data.items) {
        if (cx > px + pw - 4) break;  // clip do prawej krawędzi panelu
        cx = this._drawItem(ctx, it, cx, iconCY, rowTop, iconSize);
      }
    }
    ctx.textBaseline = 'alphabetic';
  }

  // Rysuje token (ikona PNG/emoji + wartość + delta) i dorzuca hit-rect. Zwraca nowe cx.
  // Port z BottomResourceBar._drawItem (zawsze render).
  _drawItem(ctx, it, cx, iconCY, rowTop, iconSize) {
    const itemStartX = cx;

    if (it.id && hasIconFile(it.id)) {
      ctx.font = `${THEME.fontSizeNormal + 3}px ${THEME.fontFamily}`;
      ctx.fillStyle = it.color || THEME.textSecondary;
      cx += drawResourceIcon(ctx, it.id, cx, iconCY, iconSize, it.icon) + GAP_ICON;
    } else {
      ctx.font = `${THEME.fontSizeNormal + 3}px ${THEME.fontFamily}`;
      ctx.fillStyle = it.color || THEME.textSecondary;
      ctx.textBaseline = 'middle';
      ctx.fillText(it.icon, cx, iconCY);
      cx += ctx.measureText(it.icon).width + GAP_ICON;
    }

    const valStr = it.valText != null
      ? it.valText
      : it.raw
        ? (it.signed && it.val > 0 ? '+' : '') + String(it.val)
        : _fmtNum(it.val);
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = it.raw ? (it.color || THEME.textPrimary) : THEME.textPrimary;
    ctx.textBaseline = 'middle';
    ctx.fillText(valStr, cx, iconCY);
    cx += ctx.measureText(valStr).width + (it.showDelta ? GAP_VAL : GAP_PLAIN);

    const dThresh = it.kind === 'prosperity' ? 0.5 : 0.05;
    if (it.showDelta && Math.abs(it.delta ?? 0) > dThresh) {
      const dStr = _fmtDelta(it.delta);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = it.delta >= 0 ? THEME.success : THEME.danger;
      ctx.fillText(dStr, cx, iconCY);
      cx += ctx.measureText(dStr).width + GAP_TOKEN;
    } else if (it.showDelta) {
      cx += GAP_DELTA0;
    }

    if (it.kind) this._hitItems.push({ x: itemStartX, y: rowTop, w: cx - itemStartX - 4, h: ROW_H, tip: it });
    return cx;
  }

  // ── Tooltip (port z BottomResourceBar — dane per token, bez globalnego breakdown) ──
  _buildTooltipLines(item) {
    const lines = [];
    if (item.kind === 'resource' || item.kind === 'commodity') {
      const prefix = item.kind === 'commodity' ? 'commodity' : 'resource';
      const def = item.kind === 'commodity'
        ? (COMMODITIES[item.id] ?? { id: item.id })
        : (MINED_RESOURCES[item.id] ?? HARVESTED_RESOURCES[item.id] ?? { id: item.id });
      const name = getName({ id: item.id, namePL: def.namePL, nameEN: def.nameEN }, prefix);
      lines.push({ text: name, color: THEME.accent, bold: true, iconId: item.id, emoji: item.icon });
      lines.push({ text: t('ui.amount', _fmtNum(item.val)), color: THEME.textPrimary });
      if (Math.abs(item.delta) > 0.01) {
        const sign = item.delta >= 0 ? '+' : '';
        lines.push({ text: t('ui.change', sign + item.delta.toFixed(1)),
          color: item.delta >= 0 ? THEME.success : THEME.danger });
      }
      return lines;
    }
    if (item.kind === 'research') {
      lines.push({ text: `🔬 ${t('resource.research')}`, color: THEME.accent, bold: true });
      lines.push({ text: t('ui.amount', _fmtNum(item.val)), color: THEME.textPrimary });
      if (Math.abs(item.delta) > 0.01) {
        const sign = item.delta >= 0 ? '+' : '';
        lines.push({ text: t('ui.change', sign + item.delta.toFixed(1)),
          color: item.delta >= 0 ? THEME.success : THEME.danger });
      }
      return lines;
    }
    if (item.kind === 'credits') {
      lines.push({ text: t('resBar.credits'), color: THEME.accent, bold: true, iconId: 'credits', emoji: item.icon });
      lines.push({ text: t('ui.amount', _fmtNum(item.val)), color: THEME.warning });
      return lines;
    }
    if (item.kind === 'pop') {
      lines.push({ text: `👤 ${t('topBar.populationLabel')}`, color: THEME.accent, bold: true });
      lines.push({ text: `${t('topBar.employed')} ${_fmtPopFrac(item.employed)}`, color: THEME.textPrimary });
      lines.push({ text: `${t('topBar.freePops')} ${_fmtPopFrac(item.free)}`,
        color: item.free > 0 ? THEME.success : THEME.textSecondary });
      if (item.locked > 0) lines.push({ text: `${t('topBar.locked')} ${_fmtPopFrac(item.locked)}`, color: THEME.warning });
      lines.push({ text: `${t('ui.amount', _fmtPopFrac(item.total))}`, color: THEME.textSecondary });
      return lines;
    }
    if (item.kind === 'prosperity') {
      const descKey = item.val < 30 ? 'resBar.prospLow' : item.val < 60 ? 'resBar.prospMedium' : 'resBar.prospHigh';
      lines.push({ text: '⭐ Prosperity', color: THEME.accent, bold: true });
      lines.push({ text: t('resBar.prospValue', item.val, t(descKey)), color: item.color || THEME.textPrimary });
      if (Math.abs(item.delta) > 0.5) {
        const sign = item.delta >= 0 ? '+' : '';
        lines.push({ text: t('ui.change', sign + item.delta.toFixed(1)),
          color: item.delta >= 0 ? THEME.success : THEME.danger });
      }
      return lines;
    }
    if (item.kind === 'energy') {
      const e = item.energy || {};
      lines.push({ text: `⚡ ${t('resource.energy')}`, color: THEME.accent, bold: true });
      lines.push({ text: t('ui.production', _fmtNum(e.production ?? 0)), color: THEME.success });
      lines.push({ text: t('ui.consumption', _fmtNum(e.consumption ?? 0)), color: THEME.danger });
      const bal = e.balance ?? 0;
      lines.push({ text: t('ui.balance', (bal >= 0 ? '+' : '') + _fmtNum(bal)),
        color: bal >= 0 ? THEME.success : THEME.danger });
      if (e.brownout) lines.push({ text: t('topBar.brownoutWarning'), color: THEME.danger });
      return lines;
    }
    return null;
  }

  drawTooltip(ctx, W, H) {
    const tip = this._hoverTip;
    if (!tip || !tip.lines?.length) return;
    const PADX = 8, PADY = 6, LINE_H = 15, HDR_H = 17, TIP_ICON = 14, ICON_GAP = 4;

    let maxW = 0, totalH = PADY * 2;
    for (const ln of tip.lines) {
      ctx.font = `${ln.bold ? THEME.fontSizeNormal : THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const iconW = ln.iconId ? TIP_ICON + ICON_GAP : 0;
      maxW = Math.max(maxW, iconW + ctx.measureText(ln.text).width);
      totalH += ln.bold ? HDR_H : LINE_H;
    }
    const tw = maxW + PADX * 2;
    const th = totalH;

    // Pozycja: POD kursorem (pasek jest u góry), z clampem
    let tx = tip.mx + 12;
    let ty = tip.my + 16;
    if (tx + tw > W - 4) tx = W - tw - 4;
    if (tx < 4) tx = 4;
    if (ty + th > H - 4) ty = tip.my - th - 8;

    ctx.fillStyle = bgAlpha(0.96);
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = GLASS_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    let cyy = ty + PADY;
    for (const ln of tip.lines) {
      ctx.font = `${ln.bold ? THEME.fontSizeNormal : THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = ln.color || THEME.textPrimary;
      const lh = ln.bold ? HDR_H : LINE_H;
      let textX = tx + PADX;
      if (ln.iconId) {
        drawResourceIcon(ctx, ln.iconId, tx + PADX, cyy + lh / 2, TIP_ICON, ln.emoji);
        textX += TIP_ICON + ICON_GAP;
      }
      ctx.fillText(ln.text, textX, cyy + lh - 5);
      cyy += lh;
    }
  }

  // ── Hit / zdarzenia ─────────────────────────────────────────────────────
  handleMouseMove(x, y) {
    const overTrigger = pointInRect(this._triggerRect, x, y);
    const overPanel   = this._slideProgress > 0.01 && pointInRect(this._panelRect, x, y);
    if (overTrigger || overPanel) {
      if (!this._hovered) this._markDirty();
      this._hovered = true; this._hideAt = 0;
    } else if (this._hovered && this._hideAt === 0) {
      this._hideAt = Date.now() + NAV_HIDE_DELAY;
    }

    // Tooltip per token (tylko gdy panel widoczny)
    this._hoverTip = null;
    if (overPanel) {
      for (const hit of this._hitItems) {
        if (x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h) {
          const lines = this._buildTooltipLines(hit.tip);
          if (lines && lines.length) this._hoverTip = { lines, mx: x, my: y };
          break;
        }
      }
    }
  }

  handleClick(x, y) {
    // Klik triggera = wymuś otwarcie
    if (pointInRect(this._triggerRect, x, y)) {
      this._hovered = true; this._hideAt = 0; this._markDirty();
      return true;
    }
    if (this._slideProgress > 0.01 && pointInRect(this._panelRect, x, y)) {
      // Klik nazwy kolonii → przełącz aktywną (swap systemów) + otwórz panel kolonii.
      // Wzór z Outliner._handleClick (colony): switchActiveSystem (gdy inny układ) → switchActiveColony.
      for (const c of this._colonyRects) {
        if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
          const colMgr = window.KOSMOS?.colonyManager;
          if (colMgr && c.planetId) {
            const colony = colMgr.getColony?.(c.planetId);
            const colSysId = colony?.systemId ?? 'sys_home';
            const ssMgr = window.KOSMOS?.starSystemManager;
            if (ssMgr?.activeSystemId && colSysId !== ssMgr.activeSystemId) ssMgr.switchActiveSystem(colSysId);
            colMgr.switchActiveColony(c.planetId);
          }
          window.KOSMOS?.overlayManager?.openPanel?.('colony');
          return true;
        }
      }
      return true; // absorbuj klik w panel (nie spadaj na overlay/3D)
    }
    return false;
  }

  handleWheel(x, y, deltaY) {
    if (this._slideProgress <= 0.001 || !pointInRect(this._panelRect, x, y)) return false;
    const prev = this._scrollY;
    this._scrollY = clampScroll(this._scrollY + deltaY, this._maxScroll);
    if (this._scrollY !== prev) this._markDirty();
    return true;
  }

  // Blokada kamery: trigger lub rozwinięty panel
  isOver(x, y) {
    if (pointInRect(this._triggerRect, x, y)) return true;
    return this._slideProgress > 0.01 && pointInRect(this._panelRect, x, y);
  }
}
