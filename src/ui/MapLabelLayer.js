// MapLabelLayer — etykiety kolonii + stacji na mapie 3D (FAZA 5, S3.4). Trasa A (z FAZY 0):
// overlay 2D na #ui-canvas rysowany w UIManager.draw() (nad WebGL), NIE sprite'y 3D. Wzór gate jak
// _drawSelectionBrackets (civMode && !overlayManager.isAnyOpen()). Pozycje przez getBodyScreenPosition
// (kolonie) / getStationScreenPosition (stacje) — oba z-clamp, NIGDY legacy getScreenPosition. Dane
// (mgła wojny, badge, LOD, stacking) w MapLabelLogic.js.
//
// W2.1 (live-gate FAZY 5 — wybór Filipa: W2 z korektami; W1/wariant usunięte w cleanupie):
//   K1 LOD — 3 poziomy wg dystansu kamery (plakietka → znacznik → fade), przejścia płynne (cross-fade).
//   K2 anty-nakładanie — greedy vertical stacking + łącznik do ciała (stackLabels).
//   K3 klik stacji — station:selected ORAZ station:focus (najazd kamery, reuse ścieżki Outlinera).
//   K4 kosmetyka — ucinanie nazw „…" + plakietka NAD/POD tarczą ciała (nie na niej) + łącznik.
//
// Etykieta stacji KLIKALNA (bez body:selected). Kolonie = display-only (klik ciała = raycast 3D).

import { THEME } from '../config/ThemeConfig.js';
import EventBus from '../core/EventBus.js';
import {
  gatherColonyLabels, gatherStationLabels, labelLOD, stackLabels, BADGE_ICON,
  gatherVesselLabels, vesselLabelLOD, toLogicalPx,
} from './MapLabelLogic.js';
import { clusterScreenPoints, toneColor } from './FleetPictureLogic.js';

const KIND_COLOR = () => ({
  home:    THEME.accent,
  colony:  THEME.mint ?? THEME.success,
  outpost: THEME.textSecondary,
  station: '#8fb8ff',
});

const COLONY_PLAQUE_OFFSET  = -34;   // K4: plakietka kolonii NAD ciałem (nie zasłania tarczy)
const STATION_PLAQUE_OFFSET =  30;   // K4: plakietka stacji POD kotwicą
// B2 (W2.1): plakietka dopasowuje szerokość do nazwy (measureText + padding, patrz _measurePlaque)
// aż do tego MAKSIMUM — dopiero powyżej ucina „…". 200px ≈ ~30 znaków przy fontSizeNormal 10-11px:
// pełne realne nazwy kolonii/stacji (np. „Stacja Orbitalna Alfa") mieszczą się bez ucinania,
// a absurdalnie długa nazwa i tak nie rozsadzi układu. Stacking/łączniki liczą realną szerokość.
const MAX_NAME_W = 200;              // K4/B2: max szerokość nazwy przed „…" (sensowne maksimum)
const STACK_GAP  = 3;                // K2: odstęp pionowy przy zsuwaniu

// Obraz Operacyjny F1 — plakietki flotowe (profil light).
const VESSEL_PLAQUE_OFFSET = -22;    // plakietka NAD statkiem
const VESSEL_MAX_NAME_W    = 140;    // krótsze niż kolonie — plakietki mają być dyskretne

export class MapLabelLayer {
  constructor() {
    this._hitZones = [];   // { x, y, w, h, stationId } — logical px, klik stacji
    // Obraz Operacyjny F1 — stan plakietek flotowych:
    this._vesselPrevClusters      = new Map();   // histereza klastrów WŁASNYCH (id → klucz klastra)
    this._vesselPrevClustersEnemy = new Map();   // osobna histereza WROGÓW (stron nie sklejamy)
    this._vesselHitZones          = [];          // { x, y, w, h, vesselIds[] } — klik plakietki (1c)
    this._lastOffscreenPoints     = [];          // punkty poza kadrem → strzałki krawędziowe (1c)
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
        const dims = this._measurePlaque(ctx, it);
        items.push({ id: it.id, anchorX: it.anchorX, targetY: it.anchorY + it.offset, w: dims.w, h: dims.h, _it: it, _dims: dims });
      }
      const stacked = stackLabels(items, STACK_GAP);
      // Łączniki pod plakietkami (K4/K2 — od plakietki do punktu ciała).
      for (const s of stacked) this._drawConnector(ctx, s.anchorX, s._it.anchorY, s.drawY, s._dims.h, s._it.color, plaqueAlpha);
      // Plakietki (W2 — jedyny render po cleanupie FAZY 5).
      for (const s of stacked) {
        const box = this._drawW2(ctx, s.anchorX, s.drawY, s._dims, s._it.color, plaqueAlpha);
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

  // Zmierz plakietkę W2 + przygotuj treść (nazwa ucięta K4). Zwraca {w,h,main,sub,twoLine}.
  _measurePlaque(ctx, it) {
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    const name = this._truncate(ctx, it.name, MAX_NAME_W);
    const main = `${it.icon} ${name}`;
    let sub = '';
    if (it.isStation) {
      const badges = (it.badges ?? []).map(b => BADGE_ICON[b] ?? '').join('');
      sub = `${it.pop}/${it.popCapacity} POP${badges ? '  ' + badges : ''}`;
    } else if (it.pop != null) {
      sub = `${it.pop} POP`;
    }
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    const mainW = ctx.measureText(main).width;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const subW = sub ? ctx.measureText(sub).width : 0;
    const twoLine = !!sub;
    return { w: Math.max(mainW, subW) + 16, h: twoLine ? 30 : 18, main, sub, twoLine };
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

  // Plakietka: rounded-rect + pasek akcentu + 1-2 linie (main pogrubiony, sub przygaszony). Zwraca bbox.
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

  // ═══ Obraz Operacyjny F1 — plakietki flotowe (profil light) ═══════════════
  // Wołane OSOBNYM gate'em z UIManagera (FEATURES.fleetMapLabels niezależna od
  // mapLabels). Pipeline: gather (mgła wojny w MapLabelLogic) → clusterScreenPoints
  // (histereza 44/56, prev między klatkami) → stackLabels → plakietki.
  // Profil light: multi-klaster/flota/alert → clusterAlpha; pojedynczy WYBRANY →
  // detailAlpha; samotny zdrowy statek bez floty → nic (spokój wizualny).

  /** @param ctx transformata UI_SCALE @param tr ThreeRenderer @param uiScale UI_SCALE */
  drawVesselLabels(ctx, tr, W, H, uiScale) {
    this._vesselHitZones = [];
    this._lastOffscreenPoints = [];
    if (!tr) return;
    if (window.KOSMOS?.uiPrefs?.fleetMapLabelsVisible === false) {
      this._vesselPrevClusters.clear();
      this._vesselPrevClustersEnemy.clear();
      return;
    }
    const K = window.KOSMOS;
    const vm = K?.vesselManager;
    if (!vm?.getAllVessels) return;

    const { clusterAlpha, detailAlpha } = vesselLabelLOD(tr.getCameraDistance?.() ?? null);
    if (clusterAlpha <= 0.02 && detailAlpha <= 0.02) {
      this._vesselPrevClusters.clear();
      this._vesselPrevClustersEnemy.clear();
      return;
    }

    // ctx dla FleetPictureLogic — wpięcia świata (DSCS/VesselManager/FleetSystem).
    const dscs = K?.deepSpaceCombatSystem;
    const pictureCtx = {
      gameYear:      K?.timeSystem?.gameTime ?? 0,
      fleetSystem:   K?.fleetSystem ?? null,
      combatCheck:   dscs?._findActiveEncounterContaining
        ? (id) => !!dscs._findActiveEncounterContaining(id) : null,
      isImmobilized: vm.isImmobilized ? (v) => vm.isImmobilized(v) : null,
    };
    const intel = K?.intelSystem;
    const points = gatherVesselLabels(vm.getAllVessels(), {
      getScreenPos:   (id) => toLogicalPx(tr.getVesselScreenPosition?.(id), uiScale),
      pictureCtx,
      enemyQuality:   (id) => intel?.getVesselContact?.(id)?.quality ?? 'unknown',
      activeSystemId: K?.activeSystemId ?? 'sys_home',
      selectedIds:    new Set(K?.uiManager?.getSelectedVesselIds?.() ?? []),
    });
    if (!points.length) {
      this._vesselPrevClusters.clear();
      this._vesselPrevClustersEnemy.clear();
      return;
    }

    // On-screen → klastry/plakietki; off-screen → strzałki krawędziowe (slice 1c).
    const onScreen = [];
    for (const p of points) {
      if (p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H) onScreen.push(p);
      else this._lastOffscreenPoints.push(p);
    }

    // Klastrowanie STRON OSOBNO (własne ≠ wrogie w jednej plakietce) — dwie mapy histerezy.
    const ownClusters = clusterScreenPoints(onScreen.filter(p => p.kind === 'own'),
                                            { prev: this._vesselPrevClusters });
    const enemyClusters = clusterScreenPoints(onScreen.filter(p => p.kind === 'enemy'),
                                              { prev: this._vesselPrevClustersEnemy });

    const jobs = [];
    for (const c of ownClusters) {
      const single = c.items.length === 1;
      const isFleet = c.label === 'fleet';
      let alpha = 0;
      if (!single || isFleet || c.alertCount > 0) alpha = Math.max(alpha, clusterAlpha);
      if (c.items.some(p => p.selected))          alpha = Math.max(alpha, detailAlpha);
      if (alpha <= 0.02) continue;
      jobs.push({ cluster: c, alpha, isEnemy: false });
    }
    if (clusterAlpha > 0.02) {
      for (const c of enemyClusters) jobs.push({ cluster: c, alpha: clusterAlpha, isEnemy: true });
    }
    if (!jobs.length) return;

    ctx.save();
    ctx.textBaseline = 'middle';
    const items = jobs.map((j, i) => {
      const dims = this._measureVesselPlaque(ctx, j);
      return {
        id: `vp_${i}`, anchorX: j.cluster.x, targetY: j.cluster.y + VESSEL_PLAQUE_OFFSET,
        w: dims.w, h: dims.h, _j: j, _dims: dims,
      };
    });
    for (const s of stackLabels(items, STACK_GAP)) {
      // Łącznik tylko gdy plakietka zsunięta z kotwicy (anty-nakładanie).
      if (s.displaced) {
        this._drawConnector(ctx, s.anchorX, s._j.cluster.y, s.drawY, s._dims.h,
                            s._dims.color, s._j.alpha * 0.8);
      }
      const box = this._drawVesselPlaque(ctx, s.anchorX, s.drawY, s._dims, s._j);
      if (box) this._vesselHitZones.push({ ...box, vesselIds: s._j.cluster.items.map(p => p.id) });
    }
    ctx.restore();
  }

  // Zmierz plakietkę flotową + przygotuj treść. Zwraca {w,h,text,color,alertCount}.
  _measureVesselPlaque(ctx, job) {
    const c = job.cluster;
    const single = c.items.length === 1;
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    let text;
    if (single) {
      const p = c.items[0];
      const name = this._truncate(ctx, p.name ?? '', VESSEL_MAX_NAME_W);
      text = p.glyph ? `${p.glyph} ${name}` : name;
    } else if (job.isEnemy) {
      text = `⚠ ×${c.items.length}`;
    } else if (c.label === 'fleet') {
      const fleetName = window.KOSMOS?.fleetSystem?.getFleet?.(c.fleetId)?.name ?? '';
      text = this._truncate(ctx, `⚑ ${fleetName} ×${c.items.length}`, VESSEL_MAX_NAME_W + 30);
    } else {
      text = `×${c.items.length}`;
    }
    if (job.isEnemy && single) text = `⚠ ${text}`;
    const color = job.isEnemy ? THEME.danger : toneColor(c.worstTone, THEME);
    const w = ctx.measureText(text).width + 14;
    return { w, h: 16, text, color, alertCount: c.alertCount };
  }

  // Plakietka flotowa: rounded-rect 1-liniowy + kropka alertu (prawy-górny róg).
  _drawVesselPlaque(ctx, x, y, dims, job) {
    const { text, color, w, h, alertCount } = dims;
    const bx = Math.round(x - w / 2), by = Math.round(y - h / 2), r = 4;
    ctx.globalAlpha = job.alpha;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + w, by, bx + w, by + h, r);
    ctx.arcTo(bx + w, by + h, bx, by + h, r);
    ctx.arcTo(bx, by + h, bx, by, r);
    ctx.arcTo(bx, by, bx + w, by, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(8,12,20,0.80)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.fillText(text, bx + 7, by + h / 2);
    if (alertCount > 0) {   // kropka alertu — świadomość „coś wymaga uwagi"
      ctx.fillStyle = THEME.warning;
      ctx.beginPath();
      ctx.arc(bx + w - 2, by + 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
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
