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
import { t }                 from '../i18n/i18n.js';
import { drawResourceIcon, RESOURCE_ICON_FILES } from './ResourceIcons.js';

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

  // Prawa część: grupy tokenów. item: { id?, icon, val, color, raw?, signed? }
  // Faza 1: WSZYSTKIE surowce (10 MINED + Food + Water) z ikonami PNG, potem
  // bilans energii + dobrobyt aktywnej kolonii. Bez symboli/delty (czytelny pasek).
  _collect(state) {
    const { inventory = {}, energyFlow = {} } = state;
    const groups = [];

    // ── Surowce: 10 wydobywalnych (MINED) + Food + Water — ikony PNG ──
    const resItems = [];
    for (const [id, def] of Object.entries(MINED_RESOURCES)) {
      resItems.push({ id, icon: def.icon, val: inventory[id] ?? 0, color: def.color || THEME.textSecondary });
    }
    for (const [id, def] of Object.entries(HARVESTED_RESOURCES)) {
      resItems.push({ id, icon: def.icon, val: inventory[id] ?? 0, color: def.color || THEME.textSecondary });
    }
    // Paliwo — commodity witalny (S3.0a), ikona PNG jak surowce
    const fuelDef = COMMODITIES.fuel;
    if (fuelDef) resItems.push({ id: 'fuel', icon: fuelDef.icon, val: inventory['fuel'] ?? 0, color: THEME.textSecondary });
    groups.push({ items: resItems });

    // ── Bilans: energia (przepływ) + dobrobyt aktywnej kolonii ──
    const balItems = [];
    const brownout = !!energyFlow.brownout;
    const eBal = Math.round(energyFlow.balance ?? 0);
    balItems.push({
      icon: '⚡',
      val: brownout ? 0 : eBal,
      raw: true, signed: !brownout,
      color: brownout ? THEME.danger : eBal < 0 ? THEME.warning : THEME.success,
    });
    const activeCol = window.KOSMOS?.colonyManager?.getActiveColony?.();
    const prosp = activeCol?.prosperitySystem?.prosperity;
    if (prosp !== undefined && prosp !== null) {
      const p = Math.round(prosp);
      balItems.push({ icon: '⭐', val: p, raw: true,
        color: p < 30 ? THEME.danger : p < 60 ? THEME.warning : THEME.success });
    }
    groups.push({ items: balItems });

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

    // ── PRAWO: surowce (PNG) + bilans (energia/dobrobyt) ──
    const groups   = this._collect(state);
    const iconCY   = y + BAR_H / 2;   // środek pionowy ikon
    const iconSize = BAR_H - 6;       // 22 px przy BAR_H=28
    ctx.textBaseline = 'middle';
    for (let gi = 0; gi < groups.length && cx < xMax; gi++) {
      const g = groups[gi];
      if (gi > 0) {
        ctx.strokeStyle = THEME.border;
        ctx.beginPath(); ctx.moveTo(cx + 2, y + 4); ctx.lineTo(cx + 2, y + BAR_H - 4); ctx.stroke();
        cx += 10;
      }

      for (const it of g.items) {
        if (cx > xMax) break;

        // Ikona: PNG dla surowców, inaczej emoji (energia/dobrobyt) w większym foncie
        if (it.id && RESOURCE_ICON_FILES[it.id]) {
          cx += drawResourceIcon(ctx, it.id, cx, iconCY, iconSize, it.icon) + 2;
        } else {
          ctx.font = `${THEME.fontSizeNormal + 3}px ${THEME.fontFamily}`;
          ctx.fillStyle = it.color || THEME.textSecondary;
          ctx.fillText(it.icon, cx, iconCY);
          cx += ctx.measureText(it.icon).width + 2;
        }

        // Wartość (dla bilansu kolorowana statusowo; energia ze znakiem +/−)
        const valStr = it.raw
          ? (it.signed && it.val > 0 ? '+' : '') + String(it.val)
          : _fmtNum(it.val);
        ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
        ctx.fillStyle = it.raw ? (it.color || THEME.textPrimary) : THEME.textPrimary;
        ctx.fillText(valStr, cx, iconCY);
        cx += ctx.measureText(valStr).width + 10;
      }
    }
    ctx.textBaseline = 'alphabetic';
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
