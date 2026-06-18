// BottomResourceBar — zunifikowany cienki pasek nad BottomBar (redesign UI v1, Slice 3).
//
// Łączy dawny mini-HUD kolonii (lewa część) z paskiem surowców (prawa część) w JEDEN element:
//   LEWO:  nazwa aktywnej kolonii · 👤 Pop · Kr · (⚠ BROWNOUT)
//   PRAWO: WSZYSTKIE surowce (10 MINED + Food + Water, ikony PNG) · bilans energii ⚡ · dobrobyt ⭐
// Jedna linia. (Faza 1 ikon PNG — TopBar nie rysuje już surowców; ten pasek jest jedynym stałym HUD surowców.)
//
// Zawsze widoczny w civMode (rysowany PO overlayManager → nad overlay'em). Pas CENTRALNY
// (między sidebarem a Outlinerem) — nie rusza ich offsetów. Klik w część kolonii → panel
// kolonii (jak klawisz C); reszta paska pochłania klik (bez przelotu do 3D).

import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import { COSMIC }            from '../config/LayoutConfig.js';
import { MINED_RESOURCES, HARVESTED_RESOURCES } from '../data/ResourcesData.js';
import { COMMODITIES }       from '../data/CommoditiesData.js';
import EntityManager         from '../core/EntityManager.js';
import { t, getName }        from '../i18n/i18n.js';
import { drawResourceIcon, hasIconFile, hasResourceIcon } from './ResourceIcons.js';

const BAR_H      = COSMIC.RESOURCE_BAR_H; // 28
const BOTTOM_H   = COSMIC.BOTTOM_BAR_H;   // 26
const SIDEBAR_W  = COSMIC.CIV_SIDEBAR_W;  // 0
const OUTLINER_W = COSMIC.OUTLINER_W;     // 150
const PAD        = 8;

// Odstępy tokenów paska — ciasne, by zmieścić cały ogon (energia ⚡ + dobrobyt ⭐),
// który przy luźniejszych odstępach wypadał poza prawą krawędź paska.
const GAP_ICON   = 2;  // ikona → wartość
const GAP_VAL    = 2;  // wartość → delta (gdy delta rysowana)
const GAP_PLAIN  = 5;  // wartość → następny token (token bez delty, np. energia) [było 10]
const GAP_TOKEN  = 4;  // delta → następny token (główny odstęp międzytokenowy) [było 10]
const GAP_DELTA0 = 3;  // odstęp gdy delta ≈ 0 (utrzymuje rytm) [było 7]
const GAP_GROUP  = 6;  // odstęp przy separatorze grupy [było 10]

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

// POP ułamkowy (wolni/zajęci/zablokowani) — max 2 miejsca po przecinku, bez szumu
// zmiennoprzecinkowego (2.5999999999999996 → 2.6) i bez zer końcowych (3 → "3").
function _fmtPopFrac(n) {
  return String(Math.round((n ?? 0) * 100) / 100);
}

// Inline delta na pasku: zwięzły zapis ze znakiem (+/−), kompaktowy dla dużych wartości.
function _fmtDelta(n) {
  const a = Math.abs(n);
  let r;
  if (a >= 1_000) r = `${(n / 1_000).toFixed(1)}k`;
  else if (a >= 10) r = n.toFixed(0);
  else r = n.toFixed(1);
  return (n >= 0 ? '+' : '') + r;
}

export class BottomResourceBar {
  constructor() {
    this._rect       = null; // cały pasek — pochłanianie klików
    this._colonyRect = null; // część kolonii — klik otwiera panel kolonii
    this._hitItems   = [];   // hit-rects pod tooltipy: { x, y, w, h, tip }
    this._hoverTip   = null; // dane aktualnie najechanego tooltipa (lines + mx/my)
  }

  // Prawa część: grupy tokenów. item: { id?, icon, val, color, raw?, signed?, kind, delta? }
  // Faza 1: WSZYSTKIE surowce (10 MINED + Food + Water) z ikonami PNG, potem
  // bilans energii + dobrobyt aktywnej kolonii. Bez symboli/delty (czytelny pasek),
  // ale każdy token niesie metadane (kind/delta) do tooltipa.
  _collect(state) {
    const { inventory = {}, invPerYear = {}, energyFlow = {}, resources = {}, resDelta = {} } = state;
    const groups = [];

    // ── Surowce: 10 wydobywalnych (MINED) + Food + Water — ikony PNG ──
    const resItems = [];
    for (const [id, def] of Object.entries(MINED_RESOURCES)) {
      resItems.push({ id, icon: def.icon, val: inventory[id] ?? 0, color: def.color || THEME.textSecondary,
        kind: 'resource', delta: invPerYear[id] ?? 0, showDelta: true });
    }
    for (const [id, def] of Object.entries(HARVESTED_RESOURCES)) {
      resItems.push({ id, icon: def.icon, val: inventory[id] ?? 0, color: def.color || THEME.textSecondary,
        kind: 'resource', delta: invPerYear[id] ?? 0, showDelta: true });
    }
    // Paliwo — commodity witalny (S3.0a), ikona PNG jak surowce
    const fuelDef = COMMODITIES.fuel;
    if (fuelDef) resItems.push({ id: 'fuel', icon: fuelDef.icon, val: inventory['fuel'] ?? 0,
      color: THEME.textSecondary, kind: 'commodity', delta: invPerYear['fuel'] ?? 0, showDelta: true });
    groups.push({ items: resItems });

    // ── Nauka (research) — globalny zasób-akumulator (suma kolonii) ──
    const researchAmt = resources.research ?? 0;
    const researchDelta = resDelta.research ?? 0;
    groups.push({ items: [{
      id: 'research', icon: '🔬', val: researchAmt, color: '#aa44ff',
      kind: 'research', delta: researchDelta, showDelta: true,
    }] });

    // ── Bilans: energia (przepływ) + dobrobyt aktywnej kolonii ──
    const balItems = [];
    const brownout = !!energyFlow.brownout;
    const eBal = Math.round(energyFlow.balance ?? 0);
    balItems.push({
      icon: '⚡',
      val: brownout ? 0 : eBal,
      raw: true, signed: !brownout,
      color: brownout ? THEME.danger : eBal < 0 ? THEME.warning : THEME.success,
      kind: 'energy', energy: energyFlow,
    });
    const activeCol = window.KOSMOS?.colonyManager?.getActiveColony?.();
    const prospSys = activeCol?.prosperitySystem;
    const prosp = prospSys?.prosperity;
    if (prosp !== undefined && prosp !== null) {
      const p = Math.round(prosp);
      // Trend dobrobytu: kierunek do celu (target − bieżący) — gdzie zmierza prosperity.
      const trend = (prospSys?.targetProsperity ?? prosp) - prosp;
      balItems.push({ icon: '⭐', val: p, raw: true,
        color: p < 30 ? THEME.danger : p < 60 ? THEME.warning : THEME.success,
        kind: 'prosperity', delta: trend, showDelta: true });
    }
    // ── Kredyty (Kr) aktywnej kolonii — obok dobrobytu, ikona PNG (fallback emoji) ──
    const creditsVal = activeCol?.credits;
    if (creditsVal !== undefined && creditsVal !== null) {
      balItems.push({
        id: 'credits', icon: '🪙',
        val: creditsVal, valText: _fmtNum(creditsVal),
        raw: true, color: THEME.warning, kind: 'credits',
      });
    }
    groups.push({ items: balItems });

    return groups;
  }

  // Buduj wiersze tooltipa dla danego tokenu (kind decyduje o treści).
  // Zwraca [{ text, color, bold? }] lub null gdy brak treści.
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
      lines.push({ text: t('resBar.credits'), color: THEME.accent, bold: true,
        iconId: 'credits', emoji: item.icon });
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
      // Trend (kierunek do celu) — gdzie zmierza dobrobyt
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

  draw(ctx, W, H, state) {
    this._hitItems = [];
    if (!state) { this._rect = null; this._colonyRect = null; this._hoverTip = null; return; }
    const x0 = SIDEBAR_W;
    const x1 = W;            // pełna szerokość — pasek wchodzi pod kolumnę Outlinera
                            // (Outliner skrócony o RESOURCE_BAR_H, więc nie nachodzą)
    const w  = x1 - x0;
    const y  = H - BOTTOM_H - BAR_H;
    if (w < 120) { this._rect = null; this._colonyRect = null; this._hoverTip = null; return; }
    this._rect = { x: x0, y, w, h: BAR_H };

    const brownout = !!state.energyFlow?.brownout;

    // Tło (nieprzezroczyste — czytelne także nad overlay'em) + górna krawędź (czerwona przy brownout)
    ctx.fillStyle = bgAlpha(0.94);
    ctx.fillRect(x0, y, w, BAR_H);
    ctx.strokeStyle = brownout ? THEME.danger : GLASS_BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y + 0.5); ctx.lineTo(x1, y + 0.5); ctx.stroke();

    const ty = y + BAR_H / 2 + 3;
    const xMax = x1 - PAD;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    let cx = x0 + PAD;

    // ── LEWO: aktywna kolonia (nazwa · Pop · Kr · brownout) ──
    const colony = window.KOSMOS?.colonyManager?.getActiveColony?.();
    const colStart = cx;
    if (colony) {
      const name = colony.name ?? EntityManager.get(colony.planetId)?.name ?? colony.planetId ?? '—';
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.accent;
      ctx.fillText(name, cx, ty); cx += ctx.measureText(name).width + 10;

      // Pop: 👤 łącznie (N wolne) — wolne POPy bez pracy wyraźnie widoczne w pasku.
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const civSys   = colony.civSystem;
      const popTotal = civSys?.population ?? 0;
      const popFree  = civSys?.freePops ?? 0;
      const popEmp   = civSys?._employedPops ?? 0;
      const popLock  = civSys?._lockedPops ?? 0;
      const popBase  = `👤 ${_fmtPop(popTotal)} `;
      const popFreeS = t('resBar.freeSuffix', _fmtPopFrac(popFree));
      const popStartX = cx;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(popBase, cx, ty); cx += ctx.measureText(popBase).width;
      // Wolne POPy: kolor statusowy (zielony gdy są wolni, szary gdy 0)
      ctx.fillStyle = popFree > 0 ? THEME.success : THEME.textSecondary;
      ctx.fillText(popFreeS, cx, ty); cx += ctx.measureText(popFreeS).width + 8;
      this._hitItems.push({
        x: popStartX, y, w: cx - popStartX - 8, h: BAR_H,
        tip: { kind: 'pop', total: popTotal, free: popFree, employed: popEmp, locked: popLock },
      });

      // Kredyty przeniesione do grupy bilansu po prawej (obok dobrobytu) — _collect.

      if (brownout) {
        const b = t('econPanel.brownout');
        ctx.fillStyle = THEME.danger;
        ctx.fillText(b, cx, ty); cx += ctx.measureText(b).width + 8;
      }
      this._colonyRect = { x: colStart - PAD, y, w: cx - (colStart - PAD), h: BAR_H };
    } else {
      this._colonyRect = null;
    }

    // Separator lewo|prawo
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, y + 3); ctx.lineTo(cx, y + BAR_H - 3); ctx.stroke();
    cx += 8;

    // ── PRAWO: surowce (PNG) + bilans (energia/dobrobyt) ──
    // Grupa bilansu (energia ⚡ + dobrobyt ⭐) jest ZAKOTWICZONA do prawej krawędzi
    // paska — zawsze widoczna, nawet gdy surowców jest tyle, że wypełniają cały pas
    // (wcześniej wypadała poza krawędź i ginęła). Surowce + nauka płyną od lewej i
    // zatrzymują się tuż przed grupą bilansu.
    const groups       = this._collect(state);
    const balanceGroup = groups[groups.length - 1];   // energia + dobrobyt (zawsze ostatnia)
    const mainGroups   = groups.slice(0, -1);          // surowce + nauka
    const iconCY   = y + BAR_H / 2;   // środek pionowy ikon
    const iconSize = BAR_H - 6;       // 22 px przy BAR_H=28
    ctx.textBaseline = 'middle';

    // Zmierz bilans i zakotwicz go do prawej (nie wchodząc na sekcję kolonii).
    const balW          = this._measureItems(ctx, balanceGroup.items, iconSize);
    const balanceStartX = Math.max(cx + GAP_GROUP, xMax - balW);
    const mainXMax      = balanceStartX - GAP_GROUP;

    // Surowce + nauka — lewo→prawo, do mainXMax (przed bilansem)
    for (let gi = 0; gi < mainGroups.length && cx < mainXMax; gi++) {
      const g = mainGroups[gi];
      if (gi > 0) {
        ctx.strokeStyle = THEME.border;
        ctx.beginPath(); ctx.moveTo(cx + 2, y + 4); ctx.lineTo(cx + 2, y + BAR_H - 4); ctx.stroke();
        cx += GAP_GROUP;
      }
      for (const it of g.items) {
        if (cx > mainXMax) break;
        cx = this._drawItem(ctx, it, cx, iconCY, y, iconSize, true);
      }
    }

    // Bilans (energia/dobrobyt) — zakotwiczony do prawej, z separatorem grupy po lewej
    ctx.strokeStyle = THEME.border;
    ctx.beginPath();
    ctx.moveTo(balanceStartX - GAP_GROUP + 2, y + 4);
    ctx.lineTo(balanceStartX - GAP_GROUP + 2, y + BAR_H - 4);
    ctx.stroke();
    let bcx = balanceStartX;
    for (const it of balanceGroup.items) {
      bcx = this._drawItem(ctx, it, bcx, iconCY, y, iconSize, true);
    }
    ctx.textBaseline = 'alphabetic';
  }

  // ── Rysowanie/pomiar pojedynczego tokenu ──────────────────────────────────
  // render=true rysuje token i dorzuca hit-rect; render=false TYLKO liczy szerokość
  // (ta sama matematyka → pomiar grupy bilansu zgadza się 1:1 z jej rysowaniem).
  // Zwraca nowe cx.
  _drawItem(ctx, it, cx, iconCY, y, iconSize, render) {
    const itemStartX = cx;

    // Ikona: PNG (surowce/towary/kredyty), inaczej emoji (energia/dobrobyt) w większym foncie
    if (it.id && hasIconFile(it.id)) {
      if (render) {
        // font+kolor dla fallbacku emoji gdy PNG jeszcze nie istnieje (np. kredyty);
        // załadowany PNG idzie przez drawImage, który ignoruje font/fillStyle.
        ctx.font = `${THEME.fontSizeNormal + 3}px ${THEME.fontFamily}`;
        ctx.fillStyle = it.color || THEME.textSecondary;
        cx += drawResourceIcon(ctx, it.id, cx, iconCY, iconSize, it.icon) + GAP_ICON;
      } else {
        let iconW = iconSize;   // PNG zajmuje iconSize; bez PNG — szerokość emoji (fallback)
        if (!hasResourceIcon(it.id)) {
          ctx.font = `${THEME.fontSizeNormal + 3}px ${THEME.fontFamily}`;
          iconW = ctx.measureText(it.icon).width;
        }
        cx += iconW + GAP_ICON;
      }
    } else {
      ctx.font = `${THEME.fontSizeNormal + 3}px ${THEME.fontFamily}`;
      if (render) {
        ctx.fillStyle = it.color || THEME.textSecondary;
        ctx.fillText(it.icon, cx, iconCY);
      }
      cx += ctx.measureText(it.icon).width + GAP_ICON;
    }

    // Wartość (dla bilansu kolorowana statusowo; energia ze znakiem +/−).
    // valText = gotowy string (np. kredyty "1.6k" w kolorze) — omija raw/_fmtNum.
    const valStr = it.valText != null
      ? it.valText
      : it.raw
        ? (it.signed && it.val > 0 ? '+' : '') + String(it.val)
        : _fmtNum(it.val);
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    if (render) {
      ctx.fillStyle = it.raw ? (it.color || THEME.textPrimary) : THEME.textPrimary;
      ctx.fillText(valStr, cx, iconCY);
    }
    cx += ctx.measureText(valStr).width + (it.showDelta ? GAP_VAL : GAP_PLAIN);

    // Inline delta (+/−) — realna zmiana per rok (surowce/paliwo/nauka) lub trend (dobrobyt).
    // Energia pomijana: jej wartość TO już bilans netto (+/−).
    const dThresh = it.kind === 'prosperity' ? 0.5 : 0.05;
    if (it.showDelta && Math.abs(it.delta ?? 0) > dThresh) {
      const dStr = _fmtDelta(it.delta);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      if (render) {
        ctx.fillStyle = it.delta >= 0 ? THEME.success : THEME.danger;
        ctx.fillText(dStr, cx, iconCY);
      }
      cx += ctx.measureText(dStr).width + GAP_TOKEN;
    } else if (it.showDelta) {
      cx += GAP_DELTA0; // odstęp gdy delta ~0 (zachowaj rytm)
    }

    // Hit-rect tokenu (tooltip nazwa/wartość/delta/bilans)
    if (render && it.kind) this._hitItems.push({ x: itemStartX, y, w: cx - itemStartX - 4, h: BAR_H, tip: it });
    return cx;
  }

  // Łączna szerokość listy tokenów (render=false) — do zakotwiczenia bilansu do prawej.
  _measureItems(ctx, items, iconSize) {
    let w = 0;
    for (const it of items) w = this._drawItem(ctx, it, w, 0, 0, iconSize, false);
    return w;
  }

  // ── Tooltip: hover (z UIManager.handleMouseMove) + render (po wszystkim) ──
  handleMouseMove(x, y) {
    this._hoverTip = null;
    for (const hit of this._hitItems) {
      if (x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h) {
        const lines = this._buildTooltipLines(hit.tip);
        if (lines && lines.length) this._hoverTip = { lines, mx: x, my: y };
        return;
      }
    }
  }

  drawTooltip(ctx, W, H) {
    const tip = this._hoverTip;
    if (!tip || !tip.lines?.length) return;
    const PADX = 8, PADY = 6, LINE_H = 15, HDR_H = 17, TIP_ICON = 14, ICON_GAP = 4;

    // Wymiary (wiersz z iconId rezerwuje miejsce na ikonę PNG przed tekstem)
    let maxW = 0, totalH = PADY * 2;
    for (let i = 0; i < tip.lines.length; i++) {
      const ln = tip.lines[i];
      ctx.font = `${ln.bold ? THEME.fontSizeNormal : THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const iconW = ln.iconId ? TIP_ICON + ICON_GAP : 0;
      maxW = Math.max(maxW, iconW + ctx.measureText(ln.text).width);
      totalH += ln.bold ? HDR_H : LINE_H;
    }
    const tw = maxW + PADX * 2;
    const th = totalH;

    // Pozycja: nad kursorem (pasek jest przy dole ekranu), z clampem
    let tx = tip.mx + 12;
    let ty = tip.my - th - 8;
    if (tx + tw > W - 4) tx = W - tw - 4;
    if (tx < 4) tx = 4;
    if (ty < 4) ty = tip.my + 16;

    ctx.fillStyle = bgAlpha(0.96);
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = GLASS_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    let cy = ty + PADY;
    for (const ln of tip.lines) {
      ctx.font = `${ln.bold ? THEME.fontSizeNormal : THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = ln.color || THEME.textPrimary;
      const lh = ln.bold ? HDR_H : LINE_H;
      let textX = tx + PADX;
      // Ikona PNG (fallback emoji) przed tekstem — header surowca/towaru
      if (ln.iconId) {
        drawResourceIcon(ctx, ln.iconId, tx + PADX, cy + lh / 2, TIP_ICON, ln.emoji);
        textX += TIP_ICON + ICON_GAP;
      }
      ctx.fillText(ln.text, textX, cy + lh - 5);
      cy += lh;
    }
  }

  // Klik w część kolonii → panel kolonii; reszta paska pochłania klik.
  handleClick(x, y) {
    if (this._colonyRect) {
      const c = this._colonyRect;
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
        window.KOSMOS?.overlayManager?.openPanel?.('colony');
        return true;
      }
    }
    if (this._rect) {
      const r = this._rect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
    }
    return false;
  }
}
