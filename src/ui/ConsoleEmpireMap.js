// ConsoleEmpireMap — fog-safe mini-mapa imperium na zestawie konsoli (ARC KONSOLE K0b-1; od K2 wspólna dla Wywiadu i Dyplomacji).
//
// Wydzielona bez zmian z `IntelOverlay._drawConsoleMap` / `_drawMapMarker` (K2), żeby Dyplomacja rysowała TĘ SAMĄ mapę,
// zamiast forka. MGŁA: rysuje wyłącznie punkty podane przez wołającego — `EmpireListLogic.systemMapPoints` (znane układy
// z rekordu wywiadu + układy gracza); żadnego innego układu galaktyki. Bez stref trafień.

import { THEME } from '../config/ThemeConfig.js';
import { t } from '../i18n/i18n.js';
import { drawEyebrow } from './ConsoleKit.js';
import { mapFit, mergeMapMarkers, capitalLink, mapScaleBar, mapLabelLayout, INTEL_MAP } from './EmpireListLogic.js';
import { truncateText, threadGeometry } from './HudLabelLogic.js';

/**
 * Mini-mapa 2D (płaszczyzna galaktyki): układy gracza (primary) i ZNANE układy imperium (foreign, stolica w pierścieniu);
 * nic spoza `pts`. Legenda w eyebrow. `drawMarker` — rysownik znacznika (Wywiad podaje swoją metodę: keepery ją podglądają).
 */
export function drawEmpireMiniMap(ctx, r, pts, roles, { drawMarker = drawEmpireMapMarker } = {}) {
  const F = (sz, b = false) => `${b ? 'bold ' : ''}${sz}px ${THEME.fontFamily}`;
  let y = r.y + drawEyebrow(ctx, r.x, r.y, r.w, t('intel.console.map'), roles) + 2;
  ctx.font = F(THEME.fontSizeSmall);
  ctx.textBaseline = 'middle';
  // legenda
  const leg = [[roles.primary, t('intel.console.mapYours')], [roles.foreign, t('intel.console.mapTheirs')]];
  let lx = r.x;
  for (const [col, label] of leg) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(lx + 4, y + 7, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = roles.dim; ctx.fillText(label, lx + 12, y + 7);
    lx += 12 + ctx.measureText(label).width + 18;
  }
  if (!pts.some((p) => p.theirs)) { ctx.fillStyle = roles.dim; ctx.fillText(t('intel.none'), lx, y + 7); }   // obok legendy, nie na mapie
  y += 18;
  const area = { x: r.x, y, w: r.w, h: r.y + r.h - y };
  // K0b-1: auto-kadr na sumę obu zbiorów (minimalna rozpiętość), scalanie bliskich znaczników, stolice + odległość, podziałka
  const f = mapFit(pts, area, INTEL_MAP.PAD, INTEL_MAP.MIN_SPAN_LY);
  const fit = pts.map((p) => ({ ...p, ...f.map(p) }));
  const markers = mergeMapMarkers(fit, INTEL_MAP.MERGE_PX);
  const link = capitalLink(pts);
  const measure = (s) => ctx.measureText(s).width;
  const lineH = THEME.fontSizeSmall + 2;
  const obstacles = [], extra = [];
  // podziałka (lewy dolny róg kadru)
  const bar = mapScaleBar(f.k, INTEL_MAP.BAR_MAX_PX);
  const barY = area.y + area.h - 6, barX = area.x + 4;
  if (bar) obstacles.push({ x: barX - 2, y: barY - lineH - 4, w: Math.max(bar.px, measure(t('intel.console.mapLy', bar.ly))) + 4, h: lineH + 8 });
  // linia stolic (cienka, przygaszona) — podpis odległości wchodzi do rozkładu jak każdy podpis (zawsze kładziony)
  let la = null, lb = null;
  if (link) {
    const pos = (id) => fit.find((q) => q.id === id);
    la = pos(link.from.id); lb = pos(link.to.id);
    extra.push({ key: '__dist', ax: (la.sx + lb.sx) / 2, ay: (la.sy + lb.sy) / 2, text: t('intel.console.mapLy', link.distLy.toFixed(1)),
      essential: true, prio: 1, dist: true, pad: 4 });
  }
  const nameOf = (m) => {
    const nm = truncateText(m.name, INTEL_MAP.LABEL_MAX_PX, measure);
    return m.ids.length > 1 ? `${nm} +${m.ids.length - 1}` : nm;
  };
  const { placed } = mapLabelLayout(markers, { rect: area, measure, lineH, text: nameOf, extra, obstacles });
  if (la && lb) {
    ctx.save(); ctx.strokeStyle = roles.dim; ctx.globalAlpha = 0.6; ctx.lineWidth = 1; ctx.setLineDash?.([3, 3]);
    ctx.beginPath(); ctx.moveTo(la.sx, la.sy); ctx.lineTo(lb.sx, lb.sy); ctx.stroke(); ctx.restore();
  }
  if (bar) {
    ctx.strokeStyle = roles.dim; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(barX, barY - 3); ctx.lineTo(barX, barY); ctx.lineTo(barX + bar.px, barY); ctx.lineTo(barX + bar.px, barY - 3); ctx.stroke();
    ctx.fillStyle = roles.dim; ctx.textAlign = 'left';
    ctx.fillText(t('intel.console.mapLy', bar.ly), barX, barY - 3 - lineH / 2);
  }
  for (const m of markers) drawMarker(ctx, m, roles);
  ctx.textBaseline = 'top';
  for (const p of placed) {
    const m = p.marker;
    ctx.fillStyle = p.dist ? roles.dim : m.capitalMine || (m.mine && !m.theirs) ? roles.primary : m.capital || !m.mine ? roles.foreign : THEME.textPrimary;
    ctx.textAlign = 'left';
    ctx.fillText(p.text, p.x + 1 + (p.pad ?? 0), p.y + 1 + (p.pad ?? 0));
    // nitka jak na mapie galaktyki: podpis odsunięty od znacznika (nie „pod gwiazdą”) — linia do narożnika + podkreślenie
    if (!p.dist && p.side !== 'C') {
      const th = threadGeometry(p);
      const uy = p.y + p.h;
      ctx.save(); ctx.strokeStyle = ctx.fillStyle; ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(th.x0, th.y0); ctx.lineTo(th.x1, th.y1);
      if (!p.below) { ctx.moveTo(p.x, uy); ctx.lineTo(p.x + p.w, uy); }
      ctx.stroke(); ctx.restore();
    }
  }
  ctx.textBaseline = 'middle';
}

/**
 * Znacznik mini-mapy: kropka w kolorze zbioru; układ w obu zbiorach (albo scalone bliskie) — JEDEN znacznik z dwukolorowym
 * pierścieniem (lewa połowa twoja, prawa ich); stolica — romb w kolorze właściciela (oba — dwa półromby).
 */
export function drawEmpireMapMarker(ctx, m, roles) {
  const { sx, sy } = m;
  const split = m.mine && m.theirs;
  if (split) {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = roles.primary; ctx.beginPath(); ctx.arc(sx, sy, 6, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
    ctx.strokeStyle = roles.foreign; ctx.beginPath(); ctx.arc(sx, sy, 6, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  }
  const diamond = (col, half) => {   // half: 'L' | 'R' | null (cały)
    const k = 4.5;
    const v = half === 'L' ? [[0, -k], [-k, 0], [0, k]] : half === 'R' ? [[0, -k], [k, 0], [0, k]] : [[0, -k], [-k, 0], [0, k], [k, 0]];
    ctx.fillStyle = col; ctx.beginPath();
    v.forEach(([dx, dy], i) => (i ? ctx.lineTo(sx + dx, sy + dy) : ctx.moveTo(sx + dx, sy + dy)));
    ctx.closePath(); ctx.fill();
  };
  if (m.capitalMine && m.capital) { diamond(roles.primary, 'L'); diamond(roles.foreign, 'R'); return; }
  if (m.capitalMine) { diamond(roles.primary, null); if (!split) { ctx.strokeStyle = roles.primary; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.stroke(); } return; }
  if (m.capital) { diamond(roles.foreign, null); if (!split) { ctx.strokeStyle = roles.foreign; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.stroke(); } return; }
  ctx.fillStyle = split ? THEME.textPrimary : m.mine ? roles.primary : roles.foreign;
  ctx.beginPath(); ctx.arc(sx, sy, split ? 2 : m.mine ? 3.5 : 3, 0, Math.PI * 2); ctx.fill();
}
