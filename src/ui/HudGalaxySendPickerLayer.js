// HudGalaxySendPickerLayer — ARC GALAXY G3-B (docs/design/GALAXY_PLAN.md §4 G3; Findingi 593, 594): picker [ Wyślij ▼ ] przypiętej
// gwiazdy w idiomie etykiet — ciemny pasek bez ramki pod przyciskiem, do 6 wierszy (reszta kółkiem): „nazwa · kadłub · paliwo”, pod
// spodem powód odmowy albo położenie statku. Klik wiersza = `OrderService.issueWarp` (`runGalaxyWarpOrder`: toast z powodem); sukces
// zamyka, odmowa zostawia listę. Esc i klik poza zamykają; klik poza nad płytą jest pochłaniany — nie zdejmuje przypięcia.
// Stan pickera należy do `GalaxyModeController.sendPicker`, wiersze i tekst do `GalaxyWarpLogic` (nazwy przez kanon mgły).
// G4: nad statkami sekcja floty (wiersz = `OrderService.issueFleetWarp`, ta sama faza 1 co menu); nagłówek sekcji nie jest strefą kliku.
// Flaga `galaxyWarp` OFF — podwarstwa milczy.
// ⚠ Moduł importuje się pod node (atrapa świata w keeperze): bez three i bez DOM.
import { THEME } from '../config/ThemeConfig.js';
import { themeToken } from './HudPalette.js';
import { HUD_LABELS, pointInRect } from './HudLabelLogic.js';
import { galaxyChromeAlpha } from './GalaxyChromeLogic.js';
import { GALAXY_FADE_MS } from './GalaxyModeLogic.js';
import { galaxyWarpOn, fleetWarpOn, sendPickerModel, sendPickerBox, sendPickerRowLines, sendRowKey, runGalaxyWarpOrder, runGalaxyFleetWarpOrder } from './GalaxyWarpLogic.js';

// Rysunek (px logiczne). Strojenie okiem — bez pinów keepera.
export const HUD_GALAXY_SEND_PICKER = Object.freeze({
  WIDTH: 300,
  GAP_Y: 3,            // odstęp od przycisku
  ROW_PAD_Y: 2,
  HOVER_ALPHA: 0.18,
  THUMB_W: 2,          // pasek przewijania
  THUMB_ALPHA: 0.6,
  REFUSED_ALPHA: 0.55, // nazwa statku odmówionego
  BAR_ALPHA: 0.97,     // G4: tło kryjące — wyższy picker z sekcją floty częściej otwiera się nad przyciskiem, na opisie przypiętej gwiazdy
});

export class HudGalaxySendPickerLayer {
  constructor(hud = null) {
    this._hud = hud;
    this.mode = 'galaxy';
    this._prep = { on: false };
    this._last = { box: null, zones: [] };
  }

  _measure(font, size, s) {
    const ctx = this._hud?.ctx ?? null;
    if (ctx?.measureText) {
      ctx.font = font;
      const w = ctx.measureText(s)?.width;
      if (Number.isFinite(w)) return w;
    }
    return s.length * size * 0.6;
  }

  _fit(text, font, size, maxW) {
    let s = String(text ?? '');
    if (this._measure(font, size, s) > maxW) {
      while (s.length > 1 && this._measure(font, size, s + '…') > maxW) s = s.slice(0, -1);
      s += '…';
    }
    return s;
  }

  _rowAt(lx, ly) {
    for (const z of this._last.zones) if (pointInRect(lx, ly, z)) return z;
    return null;
  }

  _inBox(lx, ly) { return !!this._last.box && pointInRect(lx, ly, this._last.box); }

  prepare(F) {
    const K = F.K, gm = K?.galaxyMode;
    const sp = gm?.sendPicker ?? null;
    if (!galaxyWarpOn() || gm?.isActive !== true || gm.isFlying || !sp) {
      this._prep = { on: false };
      return 'gsp:0';
    }
    const model = sendPickerModel(sp, K);
    const ptr = F.pointer;
    const hoverRow = ptr ? this._rowAt(ptr.lx, ptr.ly) : null;
    const hoverId = hoverRow ? sendRowKey(hoverRow) : null;
    let key = `gsp:1:${sp.systemId}:${model.first}:${model.total}:${hoverId ?? ''}:${model.header}`;
    for (const r of model.rows) {
      const { main, sub } = sendPickerRowLines(r);
      key += `|${sendRowKey(r)}:${r.ok ? 1 : 0}:${main}:${sub}`;
    }
    this._prep = { on: true, model, hoverId };
    return key;
  }

  collect(F, proj) {
    const P = this._prep;
    this._last = { box: null, zones: [] };
    if (!P.on || !proj) return { count: 0, animating: false };
    const labels = (this._hud?._galaxySublayers ?? []).find((s) => typeof s?.sendButtonZone === 'function') ?? null;
    const anchor = labels?.sendButtonZone?.() ?? null;
    if (!anchor) return { count: 0, animating: false };   // przypięcie poza kadrem — picker czeka niewidoczny
    const R = HUD_LABELS, G = HUD_GALAXY_SEND_PICKER, m = P.model;
    const size = THEME.fontSizeSmall ?? 9;
    const font = `${size}px ${THEME.fontFamily}`, fontB = `bold ${font}`;
    const lineH = size + 3;
    const rowH = 2 * lineH + 2 * G.ROW_PAD_Y;
    const heightOf = (r) => (r.kind === 'section' ? lineH + 2 * G.ROW_PAD_Y : rowH);
    const body = m.empty ? lineH : m.rows.reduce((sum, r) => sum + heightOf(r), 0);
    const box = sendPickerBox({ anchor, w: G.WIDTH, h: 2 * R.PAD_Y + lineH + R.LINE_GAP + body, rect: F.mapRect, gap: G.GAP_Y });
    const inner = box.w - 2 * R.PAD_X - (m.maxScroll > 0 ? G.THUMB_W + 2 : 0);
    const bodyY = box.y + R.PAD_Y + lineH + R.LINE_GAP;
    let rowY = bodyY;
    const rows = m.rows.map((r) => {
      const { main, sub } = sendPickerRowLines(r);
      const h = heightOf(r);
      const out = { ...r, x: box.x, y: rowY, w: box.w, h, key: sendRowKey(r),
        mainText: this._fit(main, r.kind === 'section' ? fontB : font, size, inner), subText: this._fit(sub, font, size, inner) };
      rowY += h;
      return out;
    });
    this._last = { box, zones: rows.filter((r) => r.kind !== 'section') };
    const tr = F.K?.threeRenderer;
    const fade = galaxyChromeAlpha({ flightAlpha: tr?._galaxyChromeAlpha, now: F.now, fadeT0: tr?._galaxyFadeT0, fadeMs: GALAXY_FADE_MS });
    return { count: 1, animating: fade < 1, box, rows, size, font, fontB, lineH, fade,
      header: this._fit(m.header, fontB, size, box.w - 2 * R.PAD_X), empty: m.empty,
      first: m.first, total: m.total, maxScroll: m.maxScroll, hoverId: P.hoverId, bodyY, bodyH: body };
  }

  draw(ctx, F, c) {
    if (!c?.box) return;
    const R = HUD_LABELS, G = HUD_GALAXY_SEND_PICKER, roles = F.roles, box = c.box;
    const textPrimary = themeToken(THEME, 'textPrimary');
    const a = c.fade ?? 1;
    ctx.setLineDash([]);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = (fleetWarpOn() ? G.BAR_ALPHA : R.BAR_ALPHA_SELECTED) * a;
    ctx.fillStyle = THEME.bgPrimary;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    const x = box.x + R.PAD_X;
    ctx.globalAlpha = a;
    ctx.font = c.fontB;
    ctx.fillStyle = roles.primary;
    ctx.fillText(c.header, x, box.y + R.PAD_Y + c.size);
    ctx.font = c.font;
    if (c.empty) {
      ctx.fillStyle = textPrimary;
      ctx.globalAlpha = R.SUB_ALPHA * a;
      ctx.fillText(c.empty, x, c.bodyY + c.size);
    }
    for (const r of c.rows) {
      if (r.kind === 'section') {
        ctx.font = c.fontB;
        ctx.globalAlpha = R.SUB_ALPHA * a;
        ctx.fillStyle = textPrimary;
        ctx.fillText(r.mainText, x, r.y + G.ROW_PAD_Y + c.size);
        ctx.font = c.font;
        continue;
      }
      if (r.key === c.hoverId) {
        ctx.globalAlpha = G.HOVER_ALPHA * a;
        ctx.fillStyle = r.ok ? roles.primary : roles.dim;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      // Odmówiony: nazwa przygaszona (rola `dim` jest tu nieczytelna, a gracz musi widzieć, który to statek), powód czytelny.
      ctx.globalAlpha = (r.ok ? 1 : G.REFUSED_ALPHA) * a;
      ctx.fillStyle = textPrimary;
      ctx.fillText(r.mainText, x, r.y + G.ROW_PAD_Y + c.size);
      ctx.globalAlpha = (r.ok ? R.SUB_ALPHA : 1) * a;
      ctx.fillStyle = textPrimary;
      ctx.fillText(r.subText, x, r.y + G.ROW_PAD_Y + c.lineH + c.size);
    }
    if (c.maxScroll > 0) {
      const span = c.bodyH, thumb = Math.max(8, span * (c.rows.length / c.total));
      const y = c.bodyY + (span - thumb) * (c.first / c.maxScroll);
      ctx.globalAlpha = G.THUMB_ALPHA * a;
      ctx.fillStyle = roles.primary;
      ctx.fillRect(box.x + box.w - G.THUMB_W - 1, y, G.THUMB_W, thumb);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Klik: wiersz — rozkaz; reszta pudełka — pochłonięty; poza pudełkiem — zamknięcie, pochłonięty (przycisk [ Wyślij ▼ ] leży poza
   * pudełkiem, więc drugi klik w niego też zamyka).
   */
  handleClick(x, y) {
    const K = (typeof window !== 'undefined') ? window.KOSMOS : null;
    const gm = K?.galaxyMode;
    const sp = gm?.sendPicker ?? null;
    if (!sp || !galaxyWarpOn()) return false;
    if (!this._inBox(x, y)) { gm.closeSendPicker(); return true; }
    const row = this._rowAt(x, y);
    if (row) {
      if (row.kind === 'fleet') {
        if (runGalaxyFleetWarpOrder({ fleetId: row.fleetId, targetSystemId: sp.systemId, K }).ok) gm.closeSendPicker();
        return true;
      }
      const res = runGalaxyWarpOrder({ vesselIds: [row.vesselId], targetSystemId: sp.systemId, K });
      if (res.moved > 0) gm.closeSendPicker();
    }
    return true;
  }

  /** Kółko nad pudełkiem przewija listę (`true` — kamera nie dostaje kroku). */
  wheel(dy) {
    const K = (typeof window !== 'undefined') ? window.KOSMOS : null;
    const ptr = this._hud?._pointer ?? null;
    if (!ptr || !this._inBox(ptr.lx, ptr.ly)) return false;
    if (dy) K?.galaxyMode?.scrollSendPicker?.(Math.sign(dy), this._prep.model?.maxScroll ?? 0);
    return true;
  }

  coversPoint(lx, ly) { return this._inBox(lx, ly); }
  coversUiPoint(lx, ly) { return this._inBox(lx, ly); }
  /** Kursor „rączki” nad wierszem statku zdolnego do skoku. */
  pinButtonAt(lx, ly) { return this._rowAt(lx, ly)?.ok ? 'sendRow' : null; }

  debug() {
    const m = this._prep.model;
    return { id: 'galaxySendPicker', on: this._prep.on === true, box: this._last.box, total: m?.total ?? 0, first: m?.first ?? 0,
      rows: (m?.rows ?? []).map((r) => ({ id: r.fleetId ?? r.vesselId ?? null, kind: r.kind ?? 'ship', ok: r.ok, reason: r.reason })) };
  }
}
