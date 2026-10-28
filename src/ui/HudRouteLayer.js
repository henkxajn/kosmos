// HudRouteLayer — ARKUSZ HUD H3 (D-HUD-8, D-HUD-9, D-HUD-10, D-HUD-12; HUD_PLAN.md §4.4): podwarstwa TRAS statków warstwy
// HUD 2D (`HudLayer`). Logika — czysty `HudRouteLogic`; tu: odczyt świata (`F.K` = `window.KOSMOS`), rzut wspólnym
// projektorem, przycięcie do okna i rysunek Canvas 2D w px logicznych.
//   • za flagą `FEATURES.hudRoutes` (brak klucza = OFF; przy OFF podwarstwa pusta, a linie 3D `ThreeRenderer` — jak dziś;
//     przy ON linie 3D (`LineDashedMaterial`) wyłączone);
//   • linia 1 px w roli `primary` (obce — `foreign`), krycie gasnące od statku (0,6) do celu (0,15), × 0,25 dla
//     niezaznaczonych; wzór kresek w px ekranu, marsz na `simClockMs` (stoi w pauzie); cel: puste kółko (ciało, obiekt
//     pościgu), chevron (punkt w przestrzeni); bez strzałek na długości;
//   • najechanie statku podświetla trasę (× 1, grubiej): wiersz Doku taktycznego (`ThreeRenderer._tacticalHoverVid` — jak
//     dziś) i statek pod kursorem na mapie (picker tylko widocznych — `F.hover`);
//   • skok warp: w układzie odlotu dłuższe kreski od punktu odlotu do krawędzi kadru + glif z nazwą układu DOCELOWEGO TRASY
//     (trasa wieloprzeskokowa — cel trasy, kierunek — bieżący przeskok);
//   • linia rysowana tylko w oknie (+ margines) — `clipRunsToRect` z fazą kresek (koszt rasteryzacji — Finding 527).
//   • paczka B (flaga `hudAttention` — `F.att`): mnożnik uwagi z modelu uwagi — zaznaczona (także członek zaznaczonej floty),
//     najechana i alertowana 1,0, reszta `HUD_ATTENTION.ROUTE_DIM` (przejście `FADE_MS` czasu realnego). Przy OFF — kod
//     paczki A co do bitu.
// ⚠ Moduł importuje się pod node (keeper `hud_routes_smoke` — atrapa ctx): bez three i bez DOM.
import { GAME_CONFIG } from '../config/GameConfig.js';
import { THEME } from '../config/ThemeConfig.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { systemIdOf } from '../utils/SystemScope.js';
import { parseColorToken } from './HudPalette.js';
import { HUD_NEAR_CLIP } from './HudProjection.js';
import { clipRunsToRect } from './HudRadarLogic.js';
import { routeAttentionTarget, makeAttentionMemory } from './HudAttentionLogic.js';   // paczka B — model uwagi tras
import {
  HUD_ROUTES, isHudRoutesOn, routeSpec, warpSpec, routeVisible, warpVisible, detectedNowIds, marchOffset, routeAlpha,
  routeAttention, projectPolyline, warpScreenRay,
} from './HudRouteLogic.js';

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;
const q = (v) => Math.round(v * 1000);

/** Kolor roli z kryciem (gradient krycia wymaga `rgba`). */
function rgba(token, a) {
  const c = parseColorToken(String(token ?? ''));
  if (!c) return token;
  return `rgba(${c.r},${c.g},${c.b},${Math.max(0, Math.min(1, a * c.a)).toFixed(4)})`;
}

export class HudRouteLayer {
  constructor(hud = null) {
    this._hud = hud;
    this._prep = { on: false, routes: [], warps: [] };
    this._last = { routes: [], warps: [] };
    this._glyphRects = [];          // prostokąty glifów warp (przeszkody etykiet)
    this._att = makeAttentionMemory();   // paczka B — poziomy uwagi tras (przejście czasu realnego)
  }

  /** Część klucza klatki: flaga, trasy (statek, cel, punkty pośrednie), zaznaczenie, najechanie, zegar symulacji (marsz). */
  prepare(F) {
    const on = isHudRoutesOn(F.features);
    if (!on) { this._prep = { on: false, routes: [], warps: [] }; return 't:0'; }
    const K = F.K, tr = K.threeRenderer, vm = K.vesselManager, ps = K.proximitySystem, obs = K.observatorySystem;
    const intel = K.intelSystem;
    const sys = F.activeSystemId;
    const gameYear = K.timeSystem?.gameTime ?? 0;
    // Kandydaci: statki oglądanego układu i statki w skoku z niego (reszta nie ma tu trasy — filtr przed regułami).
    const vessels = (vm?.getAllVessels?.() ?? []).filter((v) => v && (systemIdOf(v) === sys
      || (v.systemId === null && v.mission?.fromSystemId === sys)));
    const isPlayerId = (id) => { const v = vm?.getVessel?.(id); return !!v && !v.isWreck && !isEnemyVessel(v); };
    let detected = null;   // leniwie — tylko gdy jest obcy z trasą
    const detNow = (id) => {
      detected ??= detectedNowIds({ pairs: ps?._activePairs ?? [], isPlayerVesselId: isPlayerId,
        observatoryDetected: obs?.getDetectedVesselIds?.() ?? [] });
      return detected.has(String(id));
    };
    const qual = (v) => (isEnemyVessel(v) ? (intel?.getVesselContact?.(v.id)?.quality ?? 'unknown') : null);
    // Cel pościgu: tylko gdy jego sprite jest widoczny na mapie (wróg `rumor` — duch w ostatnio znanym położeniu; rysujemy
    // do sprite'a, nie do żywego położenia — `collect`); niewidoczny — bez trasy (linia zdradzałaby położenie).
    const visTarget = (id) => {
      const e = tr?._vessels?.get?.(id);
      if (!e?.sprite || e.sprite.visible === false) return null;
      const p = vm?.getVessel?.(id)?.position;
      return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
    };
    const sel = F.sel;
    const selIds = new Set((sel.vesselIds ?? []).map(String));
    if (sel.leadId != null) selIds.add(String(sel.leadId));
    if (F.att) for (const id of F.att.focusIds) selIds.add(id);   // paczka B — także członkowie zaznaczonej floty
    const alertIds = F.att?.alertedVessels ?? null;                // paczka B — statki w trwającym alercie
    const hovIds = new Set();
    if (tr?._tacticalHoverVid != null) hovIds.add(String(tr._tacticalHoverVid));
    if (F.hover?.vesselId != null) hovIds.add(String(F.hover.vesselId));
    // Nazwa układu docelowego trasy warp — mapa galaktyki (jak dziennik `WarpRouteSystem`).
    const systemName = (id) => (id ? (K.galaxyData?.systems?.find?.((s) => s?.id === id)?.name ?? null) : null);
    const routes = [], warps = [];
    for (const v of vessels) {
      if (!v || v.isWreck) continue;
      const w = warpSpec(v, sys, { systemName });
      if (w) {
        if (warpVisible({ vessel: v, quality: qual(v), detectedNow: detNow(v.id) })) {
          warps.push({ id: v.id, ...w, enemy: isEnemyVessel(v), selected: selIds.has(String(v.id)), hovered: hovIds.has(String(v.id)),
            alerted: !!alertIds?.has(String(v.id)) });
        }
        continue;
      }
      if (!routeVisible({ vessel: v, activeSystemId: sys, quality: qual(v), detectedNow: isEnemyVessel(v) ? detNow(v.id) : false })) continue;
      const spec = routeSpec(v, { gameYear, targetVisiblePos: visTarget });
      if (!spec) continue;
      if (spec.kind === 'pursue') spec.toWorld = tr?.getVesselWorldPosition?.(spec.targetId) ?? null;   // sprite celu
      routes.push({ id: v.id, spec, enemy: isEnemyVessel(v), selected: selIds.has(String(v.id)), hovered: hovIds.has(String(v.id)),
        alerted: !!alertIds?.has(String(v.id)) });
    }
    let key = `t:1`;
    for (const r of routes) {
      const s = tr?.getVesselWorldPosition?.(r.id);
      const tw = r.spec.toWorld;
      key += `|${r.id}:${r.spec.kind}:${s ? `${q(s.x)},${q(s.y)},${q(s.z)}` : '-'}:${q(r.spec.to.x)},${q(r.spec.to.y)}`
        + `:${tw ? `${q(tw.x)},${q(tw.y)},${q(tw.z)}` : ''}:${r.spec.targetId ?? ''}:${r.spec.via.length}:${r.selected ? 1 : 0}${r.hovered ? 1 : 0}${r.alerted ? 1 : ''}`;
    }
    for (const w of warps) key += `|w${w.id}:${q(w.from.x)},${q(w.from.y)}:${q(w.dir.x)},${q(w.dir.y)}:${w.name}:${w.selected ? 1 : 0}${w.hovered ? 1 : 0}${w.alerted ? 1 : ''}`;
    if ((routes.length || warps.length) && F.sim != null) key += `|m${Math.round(F.sim)}`;   // marsz — klatka przy biegu gry
    this._prep = { on: true, routes, warps };
    return key;
  }

  /** Geometria tras w px logicznych. */
  collect(F, proj) {
    const P = this._prep;
    const wpa = proj?.worldPerAU;
    if (!P.on || !(P.routes.length || P.warps.length) || !(wpa > 0)) {
      this._last = { routes: [], warps: [] }; this._glyphRects = [];
      return { count: 0, animating: false, routes: [], warps: [] };
    }
    const K = F.K, tr = K.threeRenderer, vm = K.vesselManager;
    const k = wpa / AU_TO_PX;                                    // px logiki gry → j. świata
    const M = HUD_ROUTES.CLIP_PX;
    const view = { x0: -M, y0: -M, x1: F.W + M, y1: F.H + M };
    const pr = { depth: (x, y, z) => proj.depth(x, y, z), point: (x, y, z) => proj.point(x, y, z), near: HUD_NEAR_CLIP };
    // Paczka B — mnożnik uwagi z pamięci przejść (czas realny); przy OFF — stała H3 (`routeAttention`).
    const ATT = F.att ?? null;
    if (ATT) this._att.begin();
    const alive = ATT ? new Set() : null;
    const attMult = (key, r) => {
      if (!ATT) return routeAttention({ selected: r.selected, hovered: r.hovered });
      alive.add(key);
      return this._att.step(key, routeAttentionTarget({ selected: r.selected, hovered: r.hovered, alerted: r.alerted }), F.now);
    };
    const out = [];
    for (const r of P.routes) {
      const v = vm?.getVessel?.(r.id);
      const sp = tr?.getVesselWorldPosition?.(r.id) ?? (v?.position ? { x: v.position.x * k, y: 0.3, z: v.position.y * k } : null);
      if (!sp) continue;
      // Cel w świecie: ciało w scenie — żywy środek (i tarcza); obiekt pościgu — widoczny sprite; punkt — płaszczyzna ekliptyki.
      let tw = null, tDisc = 0;
      if (r.spec.toKind === 'object') { tw = r.spec.toWorld ?? null; if (!tw) continue; }
      else if (r.spec.toKind === 'body' && r.spec.targetId != null) {
        const b = tr?.getBodyWorldInfo?.(r.spec.targetId);
        if (b) { tw = { x: b.x, y: b.y, z: b.z }; tDisc = b.r ?? 0; }
      }
      if (!tw) tw = { x: r.spec.to.x * k, y: 0, z: r.spec.to.y * k };
      const pts = [sp, ...r.spec.via.map((p) => ({ x: p.x * k, y: 0, z: p.y * k })), tw];
      const runs = projectPolyline(pts, pr);
      if (!runs.length) continue;
      // Cel na ekranie (glif) i jego promień; linia kończy się na krawędzi kółka.
      const ts = proj.point(tw.x, tw.y, tw.z);
      const glyphR = ts ? Math.max(HUD_ROUTES.GLYPH_R, tDisc > 0 ? tDisc * proj.pxPerWorld(ts.depth) + 2 : 0) : HUD_ROUTES.GLYPH_R;
      const lastRun = runs[runs.length - 1];
      const n = lastRun.length;
      let dirEnd = null;
      if (n >= 4) {
        const ex = lastRun[n - 2], ey = lastRun[n - 1], px = lastRun[n - 4], py = lastRun[n - 3];
        const dl = Math.hypot(ex - px, ey - py);
        if (dl > 0) {
          dirEnd = { x: (ex - px) / dl, y: (ey - py) / dl };
          if (r.spec.toKind !== 'point' && ts && dl > glyphR) { lastRun[n - 2] = ex - dirEnd.x * glyphR; lastRun[n - 1] = ey - dirEnd.y * glyphR; }
        }
      }
      // Długość całości (u — część długości od statku) i biegi przycięte do okna z fazą.
      let total = 0;
      const runStart = [];
      for (const run of runs) { runStart.push(total); for (let i = 2; i < run.length; i += 2) total += Math.hypot(run[i] - run[i - 2], run[i + 1] - run[i - 1]); }
      const pieces = [];
      runs.forEach((run, ri) => { for (const pc of clipRunsToRect([run], view)) pieces.push({ pts: pc.pts, s0: runStart[ri] + pc.offset }); });
      const mult = attMult('r:' + r.id, r);
      out.push({ id: r.id, kind: r.spec.kind, toKind: r.spec.toKind, enemy: r.enemy, selected: r.selected, hovered: r.hovered,
        mult, total, pieces, target: ts ? { x: ts.x, y: ts.y } : null, glyphR, dirEnd,
        targetOnScreen: !!ts && ts.x >= 0 && ts.x <= F.W && ts.y >= 0 && ts.y <= F.H });
    }
    // Skoki warp — promień do krawędzi kadru (obszar mapy) w kierunku układu docelowego.
    const warps = [];
    this._glyphRects = [];
    const map = F.mapRect;
    const size = THEME.fontSizeSmall ?? 9;
    const ctx = this._hud?.ctx ?? null;
    for (const w of P.warps) {
      const start = { x: w.from.x * k, y: 0, z: w.from.y * k };
      const ray = warpScreenRay({ start, dir: { x: w.dir.x, z: w.dir.y }, worldPerAU: wpa, toScreen: (x, y, z) => proj.point(x, y, z), rect: map });
      if (ray.pts.length < 2) continue;
      const flat = [];
      for (const p of ray.pts) flat.push(p.x, p.y);
      let total = 0;
      for (let i = 2; i < flat.length; i += 2) total += Math.hypot(flat[i] - flat[i - 2], flat[i + 1] - flat[i - 1]);
      const mapView = { x0: map.x, y0: map.y, x1: map.x + map.w, y1: map.y + map.h };
      const pieces = clipRunsToRect([flat], mapView).map((pc) => ({ pts: pc.pts, s0: pc.offset }));
      let glyph = null;
      if (ray.exit) {
        const ex = ray.exit, back = ray.pts[ray.pts.length - 2] ?? ray.pts[0];
        const dl = Math.hypot(ex.x - back.x, ex.y - back.y);
        const ux = dl > 0 ? (ex.x - back.x) / dl : 0, uy = dl > 0 ? (ex.y - back.y) / dl : 0;
        const gx = Math.max(map.x + HUD_ROUTES.WARP_INSET, Math.min(map.x + map.w - HUD_ROUTES.WARP_INSET, ex.x - ux * HUD_ROUTES.WARP_INSET));
        const gy = Math.max(map.y + HUD_ROUTES.WARP_INSET, Math.min(map.y + map.h - HUD_ROUTES.WARP_INSET, ex.y - uy * HUD_ROUTES.WARP_INSET));
        let tw = w.name.length * size * 0.6;
        if (ctx?.measureText) { ctx.font = `${size}px ${THEME.fontFamily}`; if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'; const m = ctx.measureText(w.name)?.width; if (Number.isFinite(m)) tw = m; }
        // Nazwa po stronie wnętrza kadru: krawędź prawa — tekst na lewo od glifu, lewa — na prawo; góra / dół — pod / nad.
        const gap = HUD_ROUTES.WARP_GLYPH_R + 4;
        let tx = gx + gap, ty = gy, align = 'left', base = 'middle';
        if (ray.edge === 'right') { tx = gx - gap; align = 'right'; }
        else if (ray.edge === 'top') { tx = gx; ty = gy + gap + size / 2; align = 'center'; }
        else if (ray.edge === 'bottom') { tx = gx; ty = gy - gap - size / 2; align = 'center'; }
        const bx = align === 'left' ? tx : align === 'right' ? tx - tw : tx - tw / 2;
        const box = { x: Math.min(bx, gx - HUD_ROUTES.WARP_GLYPH_R) - 2, y: Math.min(ty - size / 2, gy - HUD_ROUTES.WARP_GLYPH_R) - 2,
          w: Math.abs((align === 'left' ? tx + tw : align === 'right' ? gx + HUD_ROUTES.WARP_GLYPH_R : tx + tw / 2) - Math.min(bx, gx - HUD_ROUTES.WARP_GLYPH_R)) + 4,
          h: Math.abs(Math.max(ty + size / 2, gy + HUD_ROUTES.WARP_GLYPH_R) - Math.min(ty - size / 2, gy - HUD_ROUTES.WARP_GLYPH_R)) + 4 };
        glyph = { x: gx, y: gy, name: w.name, tx, ty, align, base, edge: ray.edge, box };
        this._glyphRects.push(box);
      }
      warps.push({ id: w.id, enemy: w.enemy, selected: w.selected, hovered: w.hovered, mult: attMult('w:' + w.id, w),
        total, pieces, glyph, start: ray.pts[0] });
    }
    this._last = { routes: out, warps };
    const count = out.reduce((a, r) => a + r.pieces.length, 0) + warps.length;
    let animating = false;
    if (ATT) { this._att.prune(alive); animating = this._att.animating; }
    return { count, animating, routes: out, warps };
  }

  /** Przeszkody dla etykiet (anti-overlap): glify i nazwy układów skoku warp przy krawędzi kadru. */
  labelObstacles() { return this._glyphRects; }

  _strokePieces(ctx, pieces, total, color, mult, dash, march, width) {
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    for (const pc of pieces) {
      let s = pc.s0;
      for (let i = 2; i < pc.pts.length; i += 2) {
        const x0 = pc.pts[i - 2], y0 = pc.pts[i - 1], x1 = pc.pts[i], y1 = pc.pts[i + 1];
        const l = Math.hypot(x1 - x0, y1 - y0);
        if (!(l > 0)) continue;
        const a0 = routeAlpha(total > 0 ? s / total : 0, mult), a1 = routeAlpha(total > 0 ? (s + l) / total : 1, mult);
        let style = rgba(color, a0);
        if (Math.abs(a1 - a0) > 0.004 && typeof ctx.createLinearGradient === 'function') {
          const g = ctx.createLinearGradient(x0, y0, x1, y1);
          if (g?.addColorStop) { g.addColorStop(0, rgba(color, a0)); g.addColorStop(1, rgba(color, a1)); style = g; }
        }
        ctx.strokeStyle = style;
        ctx.lineDashOffset = s - march;          // faza wzoru ciągła wzdłuż trasy; marsz przesuwa wzór ku celowi
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        s += l;
      }
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  draw(ctx, F, c) {
    const roles = F.roles;
    const R = HUD_ROUTES;
    const marchA = marchOffset(F.sim, R.DASH[0] + R.DASH[1]);
    const marchW = marchOffset(F.sim, R.WARP_DASH[0] + R.WARP_DASH[1]);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1;
    for (const r of c.routes) {
      const color = r.enemy ? roles.foreign : roles.primary;
      this._strokePieces(ctx, r.pieces, r.total, color, r.mult, R.DASH, marchA, r.hovered ? R.HOVER_WIDTH : R.WIDTH);
      // Cel: puste kółko (ciało, obiekt) albo chevron (punkt).
      if (!r.target || !r.targetOnScreen) continue;
      ctx.strokeStyle = color;
      ctx.globalAlpha = R.GLYPH_ALPHA * r.mult;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (r.toKind === 'point') {
        const d = r.dirEnd ?? { x: 1, y: 0 };
        const nx = -d.y, ny = d.x, bx = r.target.x - d.x * R.CHEVRON_LEN, by = r.target.y - d.y * R.CHEVRON_LEN;
        ctx.moveTo(bx + nx * R.CHEVRON_HALF, by + ny * R.CHEVRON_HALF);
        ctx.lineTo(r.target.x, r.target.y);
        ctx.lineTo(bx - nx * R.CHEVRON_HALF, by - ny * R.CHEVRON_HALF);
      } else {
        ctx.arc(r.target.x, r.target.y, r.glyphR, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const w of c.warps) {
      const color = w.enemy ? roles.foreign : roles.primary;
      this._strokePieces(ctx, w.pieces, w.total, color, w.mult, R.WARP_DASH, marchW, w.hovered ? R.HOVER_WIDTH : R.WIDTH);
      if (!w.glyph) continue;
      const g = w.glyph, gr = R.WARP_GLYPH_R;
      ctx.globalAlpha = R.WARP_GLYPH_ALPHA * Math.max(w.mult, 0.6);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(g.x, g.y - gr); ctx.lineTo(g.x + gr, g.y); ctx.lineTo(g.x, g.y + gr); ctx.lineTo(g.x - gr, g.y); ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = `${THEME.fontSizeSmall ?? 9}px ${THEME.fontFamily}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      ctx.textAlign = g.align;
      ctx.textBaseline = 'middle';
      ctx.fillText(g.name, g.tx, g.ty);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = 1;
    }
  }

  /** Odczyt dla bramki: trasy z ostatniej klatki rysunku (px logiczne). */
  debug() {
    const r1 = (v) => (Number.isFinite(v) ? +v.toFixed(1) : v);
    return {
      id: 'routes', on: this._prep.on,
      routes: this._last.routes.map((r) => ({ id: r.id, kind: r.kind, toKind: r.toKind, enemy: r.enemy, selected: r.selected, hovered: r.hovered,
        mult: r.mult, lenPx: r1(r.total), pieces: r.pieces.length, target: r.target ? { x: r1(r.target.x), y: r1(r.target.y) } : null })),
      warps: this._last.warps.map((w) => ({ id: w.id, enemy: w.enemy, lenPx: r1(w.total), pieces: w.pieces.length,
        glyph: w.glyph ? { x: r1(w.glyph.x), y: r1(w.glyph.y), name: w.glyph.name, edge: w.glyph.edge } : null })),
    };
  }
}
