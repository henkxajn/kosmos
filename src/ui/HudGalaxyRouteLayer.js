// HudGalaxyRouteLayer — ARC GALAXY, krok G2-2 (docs/design/GALAXY_PLAN.md §4 G2; D-GX-16; rama F5): podwarstwa SZLAKÓW i TRAS
// płyty galaktyki w idiomie tras warstwy HUD (`HudRouteLayer` — te same kreski, marsz na zegarze symulacji, przycięcie do okna).
//   • SZLAKI (H6, `TerritoryRenderLogic.computeOwnedLanes` — minimalne drzewo rozpinające układy GRACZA): kreski w roli
//     `primary`, stałe krycie, marsz kresek na `simClockMs` (stoi w pauzie) — zamiast płynącego światła 2D Stratcomu;
//   • TRASY: własny statek w skoku warp — od punktu tranzytu do układu celu skoku (rola `primary`, krycie gasnące ku celowi
//     — `routeAlpha`); FLOTA (≥ 2 członków na jednym przeskoku) — jedna trasa od układu ODLOTU do celu (T5); statek zaznaczony z trasą wieloprzeskokową — pozostałe przeskoki; obcy w skoku z wywiadem o STATKU
//     `contact` / `detailed` w zasięgu obserwatorium — linia skoku w roli `foreign` (kanon Stratcomu; `rumor` — bez linii);
//   • PODGLĄD SKOKU (G3-B): zaznaczony statek z napędem warp + gwiazda pod kursorem (ta sama, która dostaje
//     rozwinięcie — `hoverObjectKey`) — linia przez przeskoki i punkty w roli `primary`; odcinek poza zasięgiem baku i kadłub
//     odrzucony przez bramkę — przygaszony i kropkowany (rola `dim` to akcent × 0,32: na płycie niewidoczna, jak przy granicy radaru
//     w H1). Bez zaznaczenia nie ma podglądu (`warpHoverModel`). Znika razem z rozwinięciem;
//   • chip [T] (D-GX-16: „trasy + szlaki”) — wyłączony: nic; krycie całości × rozjaśnienie chromu trybu galaktyki.
// ⚠ Moduł importuje się pod node (atrapa świata w keeperze): bez three i bez DOM.
import { HUD_NEAR_CLIP } from './HudProjection.js';
import { clipRunsToRect } from './HudRadarLogic.js';
import { HUD_ROUTES, marchOffset, routeAlpha, projectPolyline } from './HudRouteLogic.js';
import { strokeRoutePieces } from './HudRouteLayer.js';
import { computeOwnedLanes } from './TerritoryRenderLogic.js';
import { GALAXY_K, GALAXY_FADE_MS, plateWorldOf } from './GalaxyModeLogic.js';
import { galaxyShipRail, galaxyEnemyBlips, galaxyChromeAlpha } from './GalaxyChromeLogic.js';
import { buildFleetIndex, groupTransitByFleet, routeEndpoints } from './GalaxyShipMarkerLogic.js';
import { observatoryRangeLY } from '../utils/ObservatoryRange.js';
import { warpHoverModel, fleetWarpStatus } from './GalaxyWarpLogic.js';

// Rysunek (px logiczne). Strojenie okiem — bez pinów keepera.
export const HUD_GALAXY_ROUTES = Object.freeze({
  LANE_DASH: Object.freeze([4, 8]),   // szlak — rzadsze kreski
  LANE_ALPHA: 0.42,
  LANE_WIDTH: 1.2,
  ROUTE_WIDTH: 1,
  PREVIEW_WIDTH: 2,      // podgląd skoku przy najechaniu (G3-B) — grubszy od nitek etykiet, które biegną obok
  PREVIEW_ALPHA: 1,
  PREVIEW_OUT_ALPHA: 0.45,                // odcinek i punkt poza zasięgiem
  PREVIEW_OUT_DASH: Object.freeze([2, 5]),
  PREVIEW_HOP_R: 3,      // punkt przeskoku [px]
  PREVIEW_TARGET_R: 5.5, // pierścień celu [px]
});

const q = (v) => Math.round(v * 10);

export class HudGalaxyRouteLayer {
  constructor(hud = null) {
    this._hud = hud;
    this.mode = 'galaxy';
    this._prep = { on: false };
    this._last = { lanes: [], routes: [] };
  }

  prepare(F) {
    const K = F.K, gm = K?.galaxyMode, tr = K?.threeRenderer;
    if (gm?.isActive !== true || !F.att?.layers?.routes || typeof tr?.getGalaxyAnchorLy !== 'function') {
      this._prep = { on: false };
      return 'gr:0';
    }
    const systems = K.galaxyData?.systems ?? [];
    const byId = new Map(systems.map((s) => [String(s.id), s]));
    // Szlaki gracza (MST po układach z własnością gracza — `TerritoryService`).
    const owned = (K.territoryService?.getOwnedSystems?.('player') ?? []).map((o) => byId.get(String(o.systemId))).filter(Boolean);
    const edges = owned.length >= 2 ? computeOwnedLanes(owned.map((s) => ({ x: s.x ?? 0, y: s.y ?? 0, z: s.z ?? 0 }))) : [];
    const lanes = edges.map(([i, j]) => [owned[i], owned[j]]);
    // Trasy własne (tranzyt warp) i obce (kontakt w zasięgu obserwatorium).
    const vessels = K.vesselManager?.getAllVessels?.() ?? [];
    const rail = galaxyShipRail({ vessels, systems });
    const home = systems.find((s) => s?.isHome === true) ?? { x: 0, y: 0 };
    const rangeLY = observatoryRangeLY(K.observatorySystem?.getMaxObservatoryLevel?.() ?? 0);
    const enemies = galaxyEnemyBlips({ vessels, systems, home, rangeLY,
      qualityOf: (id) => K.intelSystem?.getVesselContact?.(id)?.quality ?? 'unknown' }).filter((b) => b.mode === 'contact');
    const sel = F.sel ?? {};
    const lead = sel.leadId ?? sel.vesselIds?.[0] ?? null;
    const routes = [];
    // Flota w tranzycie = JEDNA trasa od układu odlotu do celu (te same grupy co znaczniki szyny); pojedynczy statek —
    // od punktu tranzytu (T5). Zaznaczony członek nie zmienia trasy — podświetla znacznik.
    const selIds = new Set([...(sel.vesselIds ?? []), ...(sel.leadId != null ? [sel.leadId] : [])].map(String));
    const fleetIdx = buildFleetIndex(K.fleetSystem?.listFleets?.() ?? [], vessels);
    const groups = groupTransitByFleet(rail.transit, (id) => fleetIdx.get(String(id)) ?? null, selIds);
    for (const g of groups) {
      const ep = routeEndpoints(g, byId);
      if (ep) routes.push({ id: g.key, from: ep.from, to: ep.to, enemy: false });
    }
    for (const b of enemies) {
      const to = byId.get(String(b.toId));
      if (to) routes.push({ id: b.v.id, from: { x: b.gx, y: b.gy, z: b.gz }, to, enemy: true });
    }
    // Statek zaznaczony z trasą wieloprzeskokową — pozostałe przeskoki (od celu bieżącego skoku).
    let hops = null;
    // G4 — zaznaczona flota w skoku: trasa jej członka, czyli wspólne przeskoki rozkazu (`fleet.activeOrder.hops`).
    const fleetLead = lead == null && sel.fleetId != null ? fleetWarpStatus(K.fleetSystem?.getFleet?.(sel.fleetId), K)?.leadId ?? null : null;
    const lv = (lead ?? fleetLead) != null ? K.vesselManager?.getVessel?.(lead ?? fleetLead) : null;
    const wr = lv?.warpRoute;
    if (wr && Array.isArray(wr.hops) && Number.isInteger(wr.legIndex)) {
      const rest = wr.hops.slice(Math.max(0, wr.legIndex)).map((id) => byId.get(String(id))).filter(Boolean);
      if (rest.length >= 2) hops = rest;
    }
    // Podgląd skoku: gwiazda z rozwinięcia (ostatnia klatka warstwy etykiet) + zaznaczony statek.
    const hoverKey = this._hud?.hoverObjectKey?.() ?? null;
    const hoverId = typeof hoverKey === 'string' && hoverKey.startsWith('galaxy:') ? hoverKey.slice(7) : null;
    const preview = hoverId != null ? warpHoverModel(hoverId, K) : null;
    const anchor = tr.getGalaxyAnchorLy();
    let key = `gr:2:${q(anchor.x)},${q(anchor.y)},${q(anchor.z)}`;
    for (const [a, b] of lanes) key += `|l${a.id}-${b.id}`;
    for (const r of routes) key += `|r${r.id}:${q(r.from.x)},${q(r.from.y)}:${r.to.id}:${r.enemy ? 1 : 0}`;
    if (hops) key += `|h${hops.map((s) => s.id).join(',')}`;
    if (preview) key += `|p${preview.vesselId}>${preview.targetSystemId}:${preview.legs.map((l) => (l.reachable ? 1 : 0)).join('')}`;
    if ((lanes.length || routes.length || hops || preview) && F.sim != null) key += `|m${Math.round(F.sim)}`;
    this._prep = { on: true, lanes, routes, hops, anchor, preview };
    return key;
  }

  _pieces(ptsLy, anchor, proj, view) {
    const pr = { depth: (x, y, z) => proj.depth(x, y, z), point: (x, y, z) => proj.point(x, y, z), near: HUD_NEAR_CLIP };
    const pts = ptsLy.map((p) => plateWorldOf(p, anchor, GALAXY_K));
    const runs = projectPolyline(pts, pr);
    let total = 0;
    const runStart = [];
    for (const run of runs) { runStart.push(total); for (let i = 2; i < run.length; i += 2) total += Math.hypot(run[i] - run[i - 2], run[i + 1] - run[i - 1]); }
    const pieces = [];
    runs.forEach((run, ri) => { for (const pc of clipRunsToRect([run], view)) pieces.push({ pts: pc.pts, s0: runStart[ri] + pc.offset }); });
    return { pieces, total };
  }

  collect(F, proj) {
    const P = this._prep;
    if (!P.on || !proj) { this._last = { lanes: [], routes: [], preview: null }; return { count: 0, animating: false, lanes: [], routes: [], preview: null }; }
    const M = HUD_ROUTES.CLIP_PX;
    const view = { x0: -M, y0: -M, x1: F.W + M, y1: F.H + M };
    const lanes = [], routes = [];
    for (const [a, b] of P.lanes) {
      const g = this._pieces([a, b], P.anchor, proj, view);
      if (g.pieces.length) lanes.push({ ids: [a.id, b.id], ...g });
    }
    for (const r of P.routes) {
      const g = this._pieces([r.from, r.to], P.anchor, proj, view);
      if (g.pieces.length) routes.push({ id: r.id, enemy: r.enemy, ...g });
    }
    if (P.hops) {
      const g = this._pieces(P.hops, P.anchor, proj, view);
      if (g.pieces.length) routes.push({ id: 'hops', enemy: false, hops: true, ...g });
    }
    const preview = P.preview ? this._collectPreview(P.preview, P.anchor, proj, view) : null;
    const tr = F.K?.threeRenderer;
    const alpha = galaxyChromeAlpha({ flightAlpha: tr?._galaxyChromeAlpha, now: F.now, fadeT0: tr?._galaxyFadeT0, fadeMs: GALAXY_FADE_MS });
    this._last = { lanes, routes, preview };
    return { count: lanes.length + routes.length + (preview ? 1 : 0), animating: alpha < 1, lanes, routes, preview, alpha };
  }

  /** Odcinki podglądu (po jednym na przeskok — każdy z własną rolą) i punkty przeskoków w px logicznych. */
  _collectPreview(m, anchor, proj, view) {
    const legs = [];
    m.legs.forEach((leg, i) => {
      const a = m.polyline[i], b = m.polyline[i + 1];
      if (!a || !b) return;
      const g = this._pieces([a, b], anchor, proj, view);
      if (g.pieces.length) legs.push({ reachable: leg.reachable, ...g });
    });
    const hops = [];
    m.hopPoints.forEach((h, i) => {
      const w = plateWorldOf(h, anchor, GALAXY_K);
      const p = proj.point(w.x, w.y, w.z);
      // Punkt należy do odcinka, który do niego prowadzi (start — do pierwszego).
      if (p) hops.push({ x: p.x, y: p.y, role: h.role, reachable: m.legs[Math.max(0, i - 1)]?.reachable === true });
    });
    return legs.length || hops.length ? { legs, hops } : null;
  }

  draw(ctx, F, c) {
    const roles = F.roles, R = HUD_ROUTES, G = HUD_GALAXY_ROUTES;
    const a = c.alpha ?? 1;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1;
    const marchL = marchOffset(F.sim, G.LANE_DASH[0] + G.LANE_DASH[1]);
    const marchR = marchOffset(F.sim, R.WARP_DASH[0] + R.WARP_DASH[1]);
    for (const l of c.lanes) strokeRoutePieces(ctx, l.pieces, l.total, roles.primary, 1, G.LANE_DASH, marchL, G.LANE_WIDTH, () => G.LANE_ALPHA * a);
    for (const r of c.routes) {
      strokeRoutePieces(ctx, r.pieces, r.total, r.enemy ? roles.foreign : roles.primary, 1, R.WARP_DASH, marchR, G.ROUTE_WIDTH,
        (u) => routeAlpha(u, 1) * a);
    }
    if (c.preview) {
      const marchO = marchOffset(F.sim, G.PREVIEW_OUT_DASH[0] + G.PREVIEW_OUT_DASH[1]);
      for (const l of c.preview.legs) {
        const al = (l.reachable ? G.PREVIEW_ALPHA : G.PREVIEW_OUT_ALPHA) * a;
        strokeRoutePieces(ctx, l.pieces, l.total, roles.primary, 1, l.reachable ? R.WARP_DASH : G.PREVIEW_OUT_DASH,
          l.reachable ? marchR : marchO, G.PREVIEW_WIDTH, () => al);
      }
      ctx.setLineDash([]);
      for (const h of c.preview.hops) {
        ctx.globalAlpha = (h.reachable ? G.PREVIEW_ALPHA : G.PREVIEW_OUT_ALPHA) * a;
        ctx.beginPath();
        if (h.role === 'target') {
          ctx.strokeStyle = roles.primary; ctx.lineWidth = G.PREVIEW_WIDTH;
          ctx.arc(h.x, h.y, G.PREVIEW_TARGET_R, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = roles.primary;
          ctx.arc(h.x, h.y, G.PREVIEW_HOP_R, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  debug() {
    return { id: 'galaxyRoutes', on: this._prep.on, lanes: this._last.lanes.length, routes: this._last.routes.length,
      preview: this._last.preview ? this._last.preview.legs.map((l) => (l.reachable ? 1 : 0)).join('') : null };
  }
}
