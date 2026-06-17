// BottomResourceBar — zunifikowany cienki pasek nad BottomBar (redesign UI v1, Slice 3).
//
// Łączy dawny mini-HUD kolonii (lewa część) z paskiem surowców (prawa część) w JEDEN element:
//   LEWO:  nazwa aktywnej kolonii · 👤 Pop · Kr · (⚠ BROWNOUT)
//   PRAWO: rzadkie surowce (Hv/Xe/Nt/H) · stocks (Food/Water/Fuel) · systemy (🔬 PC ⭐ ⚖)
// Jedna linia. TopBar slim trzyma częste surowce + energię + Kr + datę.
//
// Zawsze widoczny w civMode (rysowany PO overlayManager → nad overlay'em). Pas CENTRALNY
// (między sidebarem a Outlinerem) — nie rusza ich offsetów. Klik w część kolonii → panel
// kolonii (jak klawisz C); reszta paska pochłania klik (bez przelotu do 3D).

import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import { COSMIC }            from '../config/LayoutConfig.js';
import { MINED_RESOURCES, HARVESTED_RESOURCES, COMMON_MINED } from '../data/ResourcesData.js';
import { COMMODITIES }       from '../data/CommoditiesData.js';
import EntityManager         from '../core/EntityManager.js';
import { t }                 from '../i18n/i18n.js';

const BAR_H      = COSMIC.RESOURCE_BAR_H; // 20
const BOTTOM_H   = COSMIC.BOTTOM_BAR_H;   // 26
const SIDEBAR_W  = COSMIC.CIV_SIDEBAR_W;  // 30
const OUTLINER_W = COSMIC.OUTLINER_W;     // 170
const PAD        = 8;

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

export class BottomResourceBar {
  constructor() {
    this._rect       = null; // cały pasek — pochłanianie klików
    this._colonyRect = null; // część kolonii — klik otwiera panel kolonii
  }

  // Prawa część: grupy tokenów surowców/systemów. item: { icon, sym, val, delta?, color, raw? }
  _collect(state) {
    const { inventory = {}, invPerYear = {}, resources = {}, resDelta = {}, factoryData } = state;
    const groups = [];

    // Rzadkie surowce (MINED minus COMMON) — Hv/Xe/Nt/H
    const rare = [];
    for (const [id, def] of Object.entries(MINED_RESOURCES)) {
      if (COMMON_MINED.includes(id)) continue;
      rare.push({ icon: def.icon, sym: id, val: inventory[id] ?? 0, delta: invPerYear[id] ?? 0, color: def.color || THEME.textSecondary });
    }
    if (rare.length) groups.push({ label: t('topBar.resources'), items: rare });

    // Stocks: Food/Water + Fuel
    const stocks = [];
    for (const [id, def] of Object.entries(HARVESTED_RESOURCES)) {
      stocks.push({ icon: def.icon, sym: '', val: inventory[id] ?? 0, delta: invPerYear[id] ?? 0, color: def.color || THEME.textSecondary });
    }
    const fuelDef = COMMODITIES.fuel;
    if (fuelDef) stocks.push({ icon: fuelDef.icon, sym: '', val: inventory['fuel'] ?? 0, delta: invPerYear['fuel'] ?? 0, color: THEME.textSecondary });
    if (stocks.length) groups.push({ label: t('topBar.stocks'), items: stocks });

    // Systemy: science + PC + prosperity + faction (POP jest w lewej części — kolonia)
    const sys = [];
    sys.push({ icon: '🔬', sym: '', val: resources.research ?? 0, delta: resDelta.research ?? 0, color: THEME.purple });
    const fd = factoryData ?? window.KOSMOS?.factorySystem;
    if (window.KOSMOS?.civMode) {
      const used = fd?.usedPoints ?? 0, total = fd?.totalPoints ?? 0;
      sys.push({ icon: '🏭', sym: 'PC', val: `${used}/${total}`, raw: true,
        color: used >= total && total > 0 ? THEME.warning : THEME.textSecondary });
    }
    const prosp = window.KOSMOS?.prosperitySystem;
    if (prosp) {
      const p = Math.round(prosp.prosperity ?? 50);
      sys.push({ icon: '⭐', sym: '', val: p, raw: true,
        color: p < 30 ? THEME.danger : p < 60 ? THEME.warning : THEME.success });
    }
    const fac = window.KOSMOS?.factionSystem;
    if (fac && !fac.isLocked) {
      const s = Math.round(fac.slider ?? 50);
      const zc = s <= 30 ? '#D85A30' : s >= 70 ? '#378ADD' : THEME.textSecondary;
      sys.push({ icon: '⚖', sym: '', val: s, raw: true, color: zc });
    }
    if (sys.length) groups.push({ label: t('topBar.systems'), items: sys });

    return groups;
  }

  draw(ctx, W, H, state) {
    if (!state) { this._rect = null; this._colonyRect = null; return; }
    const x0 = SIDEBAR_W;
    const x1 = W - OUTLINER_W;
    const w  = x1 - x0;
    const y  = H - BOTTOM_H - BAR_H;
    if (w < 120) { this._rect = null; this._colonyRect = null; return; }
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

      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const popStr = `👤 ${_fmtPop(colony.civSystem?.population ?? 0)}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(popStr, cx, ty); cx += ctx.measureText(popStr).width + 8;

      const krStr = `${_fmtNum(colony.credits ?? 0)} Kr`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(krStr, cx, ty); cx += ctx.measureText(krStr).width + 8;

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

    // ── PRAWO: surowce / systemy ──
    const groups = this._collect(state);
    for (let gi = 0; gi < groups.length && cx < xMax; gi++) {
      const g = groups[gi];
      if (gi > 0) {
        ctx.strokeStyle = THEME.border;
        ctx.beginPath(); ctx.moveTo(cx + 2, y + 3); ctx.lineTo(cx + 2, y + BAR_H - 3); ctx.stroke();
        cx += 8;
      }
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textHeader;
      ctx.fillText(g.label, cx, ty);
      cx += ctx.measureText(g.label).width + 6;

      for (const it of g.items) {
        if (cx > xMax) break;
        const label  = `${it.icon}${it.sym}`;
        const valStr = it.raw ? String(it.val) : _fmtNum(it.val);

        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = it.color || THEME.textSecondary;
        ctx.fillText(label, cx, ty);
        cx += ctx.measureText(label).width + 2;

        ctx.fillStyle = THEME.textPrimary;
        ctx.fillText(valStr, cx, ty);
        cx += ctx.measureText(valStr).width;

        if (it.delta !== undefined && Math.abs(it.delta) > 0.01) {
          const sign = it.delta >= 0 ? '+' : '';
          const dStr = ` ${sign}${it.delta.toFixed(1)}`;
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = it.delta >= 0 ? THEME.successDim : THEME.dangerDim;
          ctx.fillText(dStr, cx, ty);
          cx += ctx.measureText(dStr).width;
        }
        cx += 10;
      }
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
