// MapLabelLayer — etykiety kolonii + stacji na mapie 3D (FAZA 5, S3.4). Trasa A (z FAZY 0):
// overlay 2D na #ui-canvas rysowany w UIManager.draw() (nad WebGL), NIE sprite'y 3D. Wzór gate jak
// _drawSelectionBrackets (civMode && !overlayManager.isAnyOpen()). Pozycje przez getBodyScreenPosition
// (kolonie) / getStationScreenPosition (stacje) — oba z-clamp, NIGDY legacy getScreenPosition. Dane
// (mgła wojny, badge, LOD, stacking) w MapLabelLogic.js.
//
// W2.1 (live-gate FAZY 5 — wybór Filipa: W2 z korektami):
//   K1 LOD — 3 poziomy wg dystansu kamery (plakietka → znacznik → fade), przejścia płynne (cross-fade).
//   K2 anty-nakładanie — greedy vertical stacking + łącznik do ciała (stackLabels).
//   K3 klik stacji — station:selected ORAZ station:focus (najazd kamery, reuse ścieżki Outlinera).
//   K4 kosmetyka — ucinanie nazw „…" + plakietka NAD/POD tarczą ciała (nie na niej) + łącznik.
//
// Etykieta stacji KLIKALNA (bez body:selected). Kolonie = display-only (klik ciała = raycast 3D).

import { THEME } from '../config/ThemeConfig.js';
import EventBus from '../core/EventBus.js';
import {
  gatherColonyLabels, gatherStationLabels, labelLOD, stackLabels, resolveLabelVariant, BADGE_ICON,
} from './MapLabelLogic.js';

const KIND_COLOR = () => ({
  home:    THEME.accent,
  colony:  THEME.mint ?? THEME.success,
  outpost: THEME.textSecondary,
  station: '#8fb8ff',
});

const COLONY_PLAQUE_OFFSET  = -34;   // K4: plakietka kolonii NAD ciałem (nie zasłania tarczy)
const STATION_PLAQUE_OFFSET =  30;   // K4: plakietka stacji POD kotwicą
const MAX_NAME_W = 120;              // K4: max szerokość nazwy przed „…"
const STACK_GAP  = 3;                // K2: odstęp pionowy przy zsuwaniu

export class MapLabelLayer {
  constructor() {
    this._hitZones = [];   // { x, y, w, h, stationId } — logical px, klik stacji
  }

  /** Wariant wizualny 'W1'|'W2' (uiPrefs → query → default W1). */
  get variant() {
    const qs = (typeof window !== 'undefined' && window.location) ? window.location.search : '';
    return resolveLabelVariant(window.KOSMOS?.uiPrefs, qs);
  }

  /**
   * Rysuj etykiety. ctx w transformacie UI_SCALE → pozycje /uiScale.
   * @param {CanvasRenderingContext2D} ctx @param {object} tr — ThreeRenderer @param {number} W @param {number} H @param {number} uiScale
   */
  draw(ctx, tr, W, H, uiScale) {
    this._hitZones = [];
    if (!tr) return;

    const { plaqueAlpha, markerAlpha } = labelLOD(tr.getCameraDistance?.() ?? null);
    if (plaqueAlpha <= 0.02 && markerAlpha <= 0.02) return;   // za daleko → declutter
    const variant = this.variant;
    const colors  = KIND_COLOR();

    // Zbierz itemy z pozycją ekranową (anchor = punkt ciała) — mgła wojny w MapLabelLogic.
    const raw = [];
    for (const it of gatherColonyLabels(window.KOSMOS?.colonyManager, window.KOSMOS?.homePlanet?.id)) {
      const pos = tr.getBodyScreenPosition?.(it.id);
      if (!pos) continue;
      raw.push({ ...it, isStation: false, anchorX: pos.x / uiScale, anchorY: pos.y / uiScale, offset: COLONY_PLAQUE_OFFSET, color: colors[it.kind] });
    }
    for (const it of gatherStationLabels(window.KOSMOS?.stationSystem)) {
      const pos = tr.getStationScreenPosition?.(it.id);
      if (!pos) continue;
      raw.push({ ...it, isStation: true, anchorX: pos.x / uiScale, anchorY: pos.y / uiScale, offset: STATION_PLAQUE_OFFSET, color: colors.station });
    }

    ctx.save();
    ctx.textBaseline = 'middle';

    // ── LOD-far: znaczniki przy ciele (K1) — bez stackingu (małe), klik gdy dominują ──
    if (markerAlpha > 0.02) {
      for (const it of raw) {
        if (it.anchorX < 0 || it.anchorX > W || it.anchorY < 0 || it.anchorY > H) continue;
        const box = this._drawMarker(ctx, it.anchorX, it.anchorY, it, markerAlpha);
        if (it.isStation && box && markerAlpha >= plaqueAlpha) this._hitZones.push({ ...box, stationId: it.id });
      }
    }

    // ── LOD-near/mid: plakietki z anty-nakładaniem (K2) + łącznikiem (K4) ──
    if (plaqueAlpha > 0.02) {
      const items = [];
      for (const it of raw) {
        if (it.anchorX < 0 || it.anchorX > W || it.anchorY < 0 || it.anchorY > H) continue;
        const dims = this._measurePlaque(ctx, it, variant);
        items.push({ id: it.id, anchorX: it.anchorX, targetY: it.anchorY + it.offset, w: dims.w, h: dims.h, _it: it, _dims: dims });
      }
      const stacked = stackLabels(items, STACK_GAP);
      // Łączniki pod plakietkami (K4/K2 — od plakietki do punktu ciała).
      for (const s of stacked) this._drawConnector(ctx, s.anchorX, s._it.anchorY, s.drawY, s._dims.h, s._it.color, plaqueAlpha);
      // Plakietki.
      for (const s of stacked) {
        const box = this._drawPlaque(ctx, s.anchorX, s.drawY, s._it, s._dims, variant, plaqueAlpha);
        if (s._it.isStation && box && plaqueAlpha > markerAlpha) this._hitZones.push({ ...box, stationId: s._it.id });
      }
    }

    ctx.restore();
  }

  // Ucinanie tekstu do maxW z „…" (font musi być ustawiony na ctx wcześniej).
  _truncate(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  // Zmierz plakietkę + przygotuj treść (nazwa ucięta K4). Zwraca {w,h,main,sub,twoLine}.
  _measurePlaque(ctx, it, variant) {
    // Nazwa ucinana wg fontu głównego wariantu.
    ctx.font = variant === 'W2' ? `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}` : `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const name = this._truncate(ctx, it.name, MAX_NAME_W);
    const main = `${it.icon} ${name}`;
    let sub = '';
    if (it.isStation) {
      const badges = (it.badges ?? []).map(b => BADGE_ICON[b] ?? '').join('');
      sub = `${it.pop}/${it.popCapacity} POP${badges ? '  ' + badges : ''}`;
    } else if (it.pop != null) {
      sub = `${it.pop} POP`;
    }

    if (variant === 'W2') {
      ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      const mainW = ctx.measureText(main).width;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const subW = sub ? ctx.measureText(sub).width : 0;
      const twoLine = !!sub;
      return { w: Math.max(mainW, subW) + 16, h: twoLine ? 30 : 18, main, sub, twoLine };
    }
    // W1
    const label = sub ? `${main}  ${sub}` : main;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    return { w: ctx.measureText(label).width + 10, h: 15, main, sub, label, twoLine: false };
  }

  // Plakietka (wariant W1/W2) wyśrodkowana w (x,y). Zwraca bbox (klik).
  _drawPlaque(ctx, x, y, it, dims, variant, alpha) {
    return variant === 'W2'
      ? this._drawW2(ctx, x, y, dims, it.color, alpha)
      : this._drawW1(ctx, x, y, dims, it.color, alpha);
  }

  // Łącznik plakietka↔ciało (K4): cienka linia od bliższej krawędzi plakietki do punktu ciała + kropka.
  _drawConnector(ctx, x, bodyY, plaqueY, plaqueH, color, alpha) {
    const edgeY = plaqueY < bodyY ? plaqueY + plaqueH / 2 : plaqueY - plaqueH / 2;
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, edgeY);
    ctx.lineTo(x, bodyY);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, bodyY, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Znacznik LOD-far (K1): mała ikona + ewentualny badge, przy ciele. Zwraca bbox.
  _drawMarker(ctx, x, y, it, alpha) {
    const badge = it.isStation && (it.badges?.length) ? (BADGE_ICON[it.badges[0]] ?? '') : '';
    const txt = `${it.icon}${badge}`;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const tw = ctx.measureText(txt).width;
    const w = tw + 6, h = 15;
    const bx = Math.round(x - w / 2), by = Math.round(y - h / 2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(6,10,16,0.55)';
    ctx.fillRect(bx, by, w, h);
    ctx.strokeStyle = it.color; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = it.color;
    ctx.fillText(txt, x, y);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    return { x: bx, y: by, w, h };
  }

  // W1 — minimalistyczny: tekst + cienka ramka + subtelne tło. Jedna linia. Zwraca bbox.
  _drawW1(ctx, x, y, dims, color, alpha) {
    const { label, w, h } = dims;
    const bx = Math.round(x - w / 2), by = Math.round(y - h / 2);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(6,10,16,0.62)';
    ctx.fillRect(bx, by, w, h);
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(label, bx + 5.6, y + 0.6);
    ctx.fillStyle = color;
    ctx.fillText(label, bx + 5, y);
    ctx.globalAlpha = 1;
    return { x: bx, y: by, w, h };
  }

  // W2 — pełny: plakietka rounded-rect + pasek akcentu + 2 linie (main pogrubiony, sub przygaszony). Zwraca bbox.
  _drawW2(ctx, x, y, dims, color, alpha) {
    const { main, sub, twoLine, w, h } = dims;
    const bx = Math.round(x - w / 2), by = Math.round(y - h / 2), r = 5;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + w, by, bx + w, by + h, r);
    ctx.arcTo(bx + w, by + h, bx, by + h, r);
    ctx.arcTo(bx, by + h, bx, by, r);
    ctx.arcTo(bx, by, bx + w, by, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(8,12,20,0.82)';
    ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(bx + 1.5, by + 3, 2.5, h - 6);   // pasek akcentu (ikonografia typu)
    ctx.textAlign = 'left';
    const tx = bx + 8;
    if (twoLine) {
      ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = color;
      ctx.fillText(main, tx, by + 10);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(sub, tx, by + 22);
    } else {
      ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = color;
      ctx.fillText(main, tx, by + h / 2);
    }
    ctx.globalAlpha = 1;
    return { x: bx, y: by, w, h };
  }

  /** Klik etykiety stacji → selekcja + focus kamery (K3). x,y w logical px. */
  handleClick(x, y) {
    for (const z of this._hitZones) {
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
        EventBus.emit('station:selected', { stationId: z.stationId });   // panel (jak dotąd)
        EventBus.emit('station:focus',    { stationId: z.stationId });   // K3 — najazd kamery (reuse ścieżki)
        return true;
      }
    }
    return false;
  }
}
