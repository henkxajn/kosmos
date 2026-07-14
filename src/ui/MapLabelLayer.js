// MapLabelLayer — etykiety kolonii + stacji na mapie 3D (FAZA 5, S3.4). Trasa A (z FAZY 0):
// overlay 2D na #ui-canvas rysowany w UIManager.draw() (nad WebGL), NIE sprite'y 3D. Wzór gate jak
// _drawSelectionBrackets (civMode && !overlayManager.isAnyOpen()). Pozycje przez getBodyScreenPosition
// (kolonie) / getStationScreenPosition (stacje) — oba z-clamp, NIGDY legacy getScreenPosition. Dane
// (mgła wojny, badge) w MapLabelLogic.js. Dwa warianty W1/W2 za flagą (uiPrefs.mapLabelVariant / query).
//
// Etykieta stacji KLIKALNA → station:selected (selekcja/panel; bez station:focus — brak skoku kamery,
// bez body:selected). Kolonie = display-only (klik ciała obsługuje raycast 3D).

import { THEME } from '../config/ThemeConfig.js';
import EventBus from '../core/EventBus.js';
import {
  gatherColonyLabels, gatherStationLabels, labelAlphaForDistance, labelShowDetail,
  resolveLabelVariant, BADGE_ICON,
} from './MapLabelLogic.js';

// Kolory wg typu (spójne z brutalist terminal). Home = akcent, kolonia = mint, outpost = przygaszony.
const KIND_COLOR = () => ({
  home:    THEME.accent,
  colony:  THEME.mint ?? THEME.success,
  outpost: THEME.textSecondary,
  station: '#8fb8ff',          // ten sam błękit co etykiety stacji w trybie CTRL
});

const COLONY_Y_OFFSET  = -24;  // etykieta kolonii NAD ciałem
const STATION_Y_OFFSET =  18;  // etykieta stacji POD kotwicą (mniej koliduje z etykietą ciała)

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
   * Rysuj etykiety. ctx w transformacie UI_SCALE (jak reszta UIManager) → pozycje /uiScale.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} tr — ThreeRenderer (getBodyScreenPosition/getStationScreenPosition/getCameraDistance)
   * @param {number} W @param {number} H — logiczne wymiary @param {number} uiScale
   */
  draw(ctx, tr, W, H, uiScale) {
    this._hitZones = [];
    if (!tr) return;

    const dist  = tr.getCameraDistance?.() ?? null;
    const alpha = labelAlphaForDistance(dist);
    if (alpha <= 0.02) return;                         // całkowicie oddalone → clutter, nie rysuj
    const detail  = labelShowDetail(dist);
    const variant = this.variant;
    const colors  = KIND_COLOR();
    const colMgr  = window.KOSMOS?.colonyManager;
    const homePid = window.KOSMOS?.homePlanet?.id;

    ctx.save();
    ctx.textBaseline = 'middle';

    // ── Kolonie gracza (display-only) ──
    for (const item of gatherColonyLabels(colMgr, homePid)) {
      const pos = tr.getBodyScreenPosition?.(item.id);
      if (!pos) continue;
      const x = pos.x / uiScale, y = pos.y / uiScale + COLONY_Y_OFFSET;
      if (x < 0 || x > W || y < 0 || y > H) continue;
      this._drawLabel(ctx, x, y, item, colors[item.kind], alpha, detail, variant, false);
    }

    // ── Stacje gracza (klikalne) ──
    for (const item of gatherStationLabels(window.KOSMOS?.stationSystem)) {
      const pos = tr.getStationScreenPosition?.(item.id);
      if (!pos) continue;
      const x = pos.x / uiScale, y = pos.y / uiScale + STATION_Y_OFFSET;
      if (x < 0 || x > W || y < 0 || y > H) continue;
      const box = this._drawLabel(ctx, x, y, item, colors.station, alpha, detail, variant, true);
      if (box) this._hitZones.push({ ...box, stationId: item.id });
    }

    ctx.restore();
  }

  // Buduje treść etykiety (linia główna + opcjonalny detal) i deleguje do wariantu. Zwraca bbox (klik).
  _drawLabel(ctx, x, y, item, color, alpha, detail, variant, isStation) {
    const main = `${item.icon} ${item.name}`;
    let sub = '';
    if (detail) {
      if (isStation) {
        const badges = (item.badges ?? []).map(b => BADGE_ICON[b] ?? '').join('');
        sub = `${item.pop}/${item.popCapacity} POP${badges ? '  ' + badges : ''}`;
      } else if (item.pop != null) {
        sub = `${item.pop} POP`;
      }
    }
    return variant === 'W2'
      ? this._drawW2(ctx, x, y, main, sub, color, alpha)
      : this._drawW1(ctx, x, y, main, sub, color, alpha);
  }

  // W1 — minimalistyczny: tekst + cienka ramka + subtelne tło (czytelność na jasnym tle). Jedna linia
  // (main · sub) — kompaktowy. Zwraca bbox.
  _drawW1(ctx, x, y, main, sub, color, alpha) {
    const label = sub ? `${main}  ${sub}` : main;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const tw = ctx.measureText(label).width;
    const padX = 5, h = 15, w = tw + padX * 2;
    const bx = Math.round(x - w / 2), by = Math.round(y - h / 2);

    ctx.globalAlpha = alpha;
    // Tło + ramka
    ctx.fillStyle = 'rgba(6,10,16,0.62)';
    ctx.fillRect(bx, by, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
    // Tekst (cień pod spodem dla kontrastu)
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(label, bx + padX + 0.6, y + 0.6);
    ctx.fillStyle = color;
    ctx.fillText(label, bx + padX, y);
    ctx.globalAlpha = 1;
    return { x: bx, y: by, w, h };
  }

  // W2 — pełny: plakietka z tłem + ikonografia (2 linie: main pogrubiony, sub przygaszony). Zwraca bbox.
  _drawW2(ctx, x, y, main, sub, color, alpha) {
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    const mainW = ctx.measureText(main).width;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const subW = sub ? ctx.measureText(sub).width : 0;
    const padX = 8;
    const twoLine = !!sub;
    const w = Math.max(mainW, subW) + padX * 2;
    const h = twoLine ? 30 : 18;
    const bx = Math.round(x - w / 2), by = Math.round(y - h / 2);
    const r = 5;

    ctx.globalAlpha = alpha;
    // Plakietka (rounded rect)
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + w, by, bx + w, by + h, r);
    ctx.arcTo(bx + w, by + h, bx, by + h, r);
    ctx.arcTo(bx, by + h, bx, by, r);
    ctx.arcTo(bx, by, bx + w, by, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(8,12,20,0.82)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Akcentowy pasek z lewej (ikonografia typu)
    ctx.fillStyle = color;
    ctx.fillRect(bx + 1.5, by + 3, 2.5, h - 6);
    // Tekst
    ctx.textAlign = 'left';
    const tx = bx + padX;
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

  /** Klik etykiety stacji → selekcja (station:selected). x,y w logical px. */
  handleClick(x, y) {
    for (const z of this._hitZones) {
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
        EventBus.emit('station:selected', { stationId: z.stationId });
        return true;
      }
    }
    return false;
  }
}
