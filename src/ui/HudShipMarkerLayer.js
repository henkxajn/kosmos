// HudShipMarkerLayer — ZNACZNIK STATKU na mapie 3D (krok po ARKUSZU HUD; D-SM-1…6, HUD_PLAN.md §„Znacznik statku”):
// podwarstwa warstwy HUD 2D (`HudLayer`) między radarem a etykietami — rysowana POD etykietami, zbierana PRZED nimi (etykiety
// omijają znacznik jak nawiasy — `labelObstacles`). Logika — czysty `HudShipMarkerLogic`; tu: odczyt świata (`F.K` =
// `window.KOSMOS`), rzut wspólnym projektorem i rysunek Canvas 2D w px logicznych.
//   • zestaw statków = reguła insygnium (`ThreeRenderer._syncInsignia`, które przy fladze ON nie powstaje): sprite w scenie
//     i widoczny, nie wrak, obcy od `contact` albo w starciu z graczem — sprite'y istnieją wyłącznie w oglądanym układzie;
//   • kierunek ruchu z logiki gry (`classifyMotion`) rzutowany na ekran: punkt statku i punkt przesunięty wzdłuż ruchu
//     w świecie (płaszczyzna ekliptyki: x układu → oś X, y układu → oś Z);
//   • krycie: model uwagi warstwy (`F.att`) z przejściem `FADE_MS` czasu realnego (jak etykiety), krycie wywiadu sprite'a
//     (`intelOpacity` — `contact` 0,5), gaśnięcie przy bliskim zoomie (progi nawiasów); bez oddechu, bez strefy kliku.
// ⚠ Moduł importuje się pod node (keeper `hud_ship_marker_smoke` — atrapa ctx): bez three i bez DOM.
import { isEnemyVessel } from '../entities/Vessel.js';
import { areAtWar } from '../utils/WarGate.js';
import { orbitClockSec } from '../utils/SimClock.js';
import { routeSpec, warpSpec } from './HudRouteLogic.js';
import { makeAttentionMemory } from './HudAttentionLogic.js';
import {
  HUD_SHIP_MARKER, isHudShipMarkerOn, shipMarkerRelation, shipMarkerRole, shipMarkerVisible, classifyMotion,
  screenDirection, screenAngleDeg, markerGeometry, markerZoomFade, markerAttentionTarget, markerAlpha, routeMotionPoint,
} from './HudShipMarkerLogic.js';

const q = (v) => Math.round(v * 1000);
const OBJECT_NEAR = 1e-4;   // [j.] kotwica statku przed kamerą — próg jak nawiasy (`HudFocusLayer`)
const STEP_FRAC = 0.02;     // krok wzdłuż ruchu do rzutu kierunku — część głębi statku (stały kąt widzenia)
const RECT_PAD = 1;         // [px] zapas prostokąta przeszkody etykiet

export class HudShipMarkerLayer {
  constructor(hud = null) {
    this._hud = hud;
    this._prep = { on: false, items: [] };
    this._last = { markers: [] };
    this._rects = [];                        // prostokąty znaczników tej klatki (przeszkody etykiet)
    this._att = makeAttentionMemory();       // poziomy uwagi (przejście czasu realnego)
  }

  /** Statki ze znacznikiem i ich stan (relacja, ruch, uwaga) — część klucza klatki. */
  prepare(F) {
    if (!isHudShipMarkerOn(F.features)) { this._prep = { on: false, items: [] }; return 'sm:0'; }
    const K = F.K, tr = K.threeRenderer, vm = K.vesselManager, intel = K.intelSystem, dip = K.diplomacySystem;
    const orbital = K.orbitalSpaceSystem;
    const cleanView = tr?._cleanView === true || K.uiManager?._cleanView === true;
    const tSec = orbitClockSec();
    const gameYear = K.timeSystem?.gameTime ?? 0;
    // Uwaga (paczka B): zaznaczone (zbiór, prowadzący, członkowie floty), alertowane, najechane (mapa, wiersz Doku).
    const att = F.att ?? {};
    const focusIds = att.focusIds ?? new Set();
    const alerted = att.alertedVessels ?? new Set();
    const hovIds = new Set();
    if (tr?._tacticalHoverVid != null) hovIds.add(String(tr._tacticalHoverVid));
    if (F.hover?.vesselId != null) hovIds.add(String(F.hover.vesselId));
    // Relacja z imperium — raz na imperium w klatce.
    const relMemo = new Map();
    const relationOf = (v) => {
      const isEnemy = isEnemyVessel(v);
      const empireId = v.ownerEmpireId ?? (v.owner && v.owner !== 'player' ? v.owner : null);
      if (!isEnemy || !empireId) return shipMarkerRelation({ isEnemy, empireId });
      if (!relMemo.has(empireId)) {
        let hostile = false;
        try { hostile = dip?.getOpinionBand?.(empireId) === 'hostile'; } catch { hostile = false; }
        relMemo.set(empireId, shipMarkerRelation({ isEnemy, empireId, atWar: areAtWar('player', empireId), hostile }));
      }
      return relMemo.get(empireId);
    };
    // Cel pościgu widoczny na mapie (jak trasy H3) — kierunek z geometrii trasy nie może zdradzić niewidocznego celu.
    const visTarget = (id) => {
      const e = tr?._vessels?.get?.(id);
      if (!e?.sprite || e.sprite.visible === false) return null;
      const p = vm?.getVessel?.(id)?.position;
      return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
    };
    const items = [];
    for (const [vid, entry] of tr?._vessels ?? []) {
      const v = vm?.getVessel?.(vid);
      if (!v) continue;
      const isEnemy = isEnemyVessel(v);
      const quality = isEnemy ? (intel?.getVesselContact?.(vid)?.quality ?? 'unknown') : null;
      let inEng = false;
      if (isEnemy) { try { inEng = tr?._isCombatRevealed?.(vid) === true; } catch { inEng = false; } }
      if (!shipMarkerVisible({ hasSprite: !!entry?.sprite, spriteVisible: entry?.sprite?.visible === true, isWreck: !!v.isWreck,
        isEnemy, quality, inPlayerEngagement: inEng, cleanView })) continue;
      const w = tr?.getVesselWorldInfo?.(vid) ?? tr?.getVesselWorldPosition?.(vid) ?? null;
      if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.y) || !Number.isFinite(w.z)) continue;
      const st = v.position?.state ?? null, dockedAt = v.position?.dockedAt ?? null;
      const orbit = (st === 'orbiting' && dockedAt != null) ? (orbital?.getOrbit?.(vid) ?? null) : null;
      const warpDir = warpSpec(v, F.activeSystemId)?.dir ?? null;
      let routeDir = null;
      if (!isEnemy && st === 'in_transit' && !warpDir) {
        const to = routeMotionPoint(routeSpec(v, { gameYear, targetVisiblePos: visTarget }), v.mission);
        const p = v.position;
        if (to && p && Number.isFinite(p.x) && Number.isFinite(p.y)) routeDir = { x: to.x - p.x, y: to.y - p.y };
      }
      const motion = classifyMotion({ state: st, dockedAt, isWreck: !!v.isWreck, velocity: v.velocity ?? null, orbit, tSec, warpDir, routeDir });
      const relation = relationOf(v);
      const id = String(vid);
      const selected = focusIds.has(id);
      items.push({
        id: vid, world: { x: w.x, y: w.y, z: w.z, r: w.r ?? 0 }, motion, relation, role: shipMarkerRole(relation),
        selected, alerted: alerted.has(id), hovered: hovIds.has(id),
        intelOpacity: Number.isFinite(entry?.intelOpacity) ? entry.intelOpacity : 1,
      });
    }
    let key = `sm:1:${att.focus ? 1 : 0}`;
    for (const it of items) {
      const d = it.motion.dir;
      key += `|${it.id}:${q(it.world.x)},${q(it.world.y)},${q(it.world.z)}:${q(it.world.r)}:${d ? `${q(d.x)},${q(d.y)}` : '-'}`
        + `:${it.role}:${it.selected ? 1 : 0}${it.alerted ? 1 : 0}${it.hovered ? 1 : 0}:${q(it.intelOpacity)}`;
    }
    this._prep = { on: true, items };
    return key;
  }

  /** Geometria znaczników (px logiczne): rzut, kierunek na ekranie, glif, krycie; prostokąty — przeszkody etykiet. */
  collect(F, proj) {
    const P = this._prep;
    this._rects = [];
    if (!P.on || !proj || !P.items.length) { this._last = { markers: [] }; return { count: 0, animating: false, markers: [] }; }
    const map = F.mapRect;
    const focus = F.att?.focus === true;
    this._att.begin();
    const alive = new Set();
    const markers = [];
    for (const it of P.items) {
      const w = it.world;
      const p0 = proj.point(w.x, w.y, w.z, OBJECT_NEAR);
      if (!p0) continue;
      const discR = w.r > 0 ? w.r * proj.pxPerWorld(p0.depth) : 0;
      const fade = markerZoomFade(discR, map);
      if (!(fade > 0)) continue;
      // Kierunek na ekranie: rzut kroku wzdłuż ruchu (świat: x układu → X, y układu → Z).
      let dir = null;
      const md = it.motion.moving ? it.motion.dir : null;
      if (md) {
        const s = Math.max(1e-6, p0.depth * STEP_FRAC);
        dir = screenDirection(p0, proj.point(w.x + md.x * s, w.y, w.z + md.y * s, OBJECT_NEAR));
      }
      const g = markerGeometry({ cx: p0.x, cy: p0.y, discR, dir });
      if (!g) continue;
      const r = g.rect;
      if (r.x + r.w < map.x || r.x > map.x + map.w || r.y + r.h < map.y || r.y > map.y + map.h) continue;
      const k = 'm:' + it.id;
      alive.add(k);
      const attention = this._att.step(k, markerAttentionTarget({ focus, selected: it.selected, alerted: it.alerted, hovered: it.hovered }), F.now);
      const alpha = markerAlpha({ selected: it.selected, attention, intelOpacity: it.intelOpacity, zoomFade: fade });
      if (!(alpha > 0)) continue;
      markers.push({ id: it.id, role: it.role, relation: it.relation, kind: g.kind, pts: g.pts, closed: g.closed, rect: r, alpha,
        cx: p0.x, cy: p0.y, discR, angle: dir ? screenAngleDeg(dir) : null, source: it.motion.source });
      this._rects.push({ x: r.x - RECT_PAD, y: r.y - RECT_PAD, w: r.w + 2 * RECT_PAD, h: r.h + 2 * RECT_PAD });
    }
    this._att.prune(alive);
    this._last = { markers };
    return { count: markers.length, animating: this._att.animating, markers };
  }

  /** Przeszkody dla etykiet (anti-overlap): prostokąty znaczników tej klatki; `MARKER_OBSTACLE` 0 — brak (strojenie). */
  labelObstacles() { return HUD_SHIP_MARKER.MARKER_OBSTACLE ? this._rects : []; }

  draw(ctx, F, c) {
    const roles = F.roles;
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.lineWidth = HUD_SHIP_MARKER.MARKER_WIDTH;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    for (const m of c.markers ?? []) {
      ctx.strokeStyle = roles[m.role] ?? roles.primary;
      ctx.globalAlpha = m.alpha;
      const p = m.pts;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      if (m.closed) ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Odczyt dla bramki: znaczniki z ostatniej klatki (px logiczne). */
  debug() {
    const r1 = (v) => (Number.isFinite(v) ? +v.toFixed(1) : v);
    return {
      id: 'shipMarker', on: this._prep.on, items: this._prep.items.length,
      markers: this._last.markers.map((m) => ({ id: m.id, kind: m.kind, role: m.role, relation: m.relation, source: m.source,
        cx: r1(m.cx), cy: r1(m.cy), angle: m.angle == null ? null : Math.round(m.angle) % 360, alpha: r1(m.alpha),
        rect: { x: r1(m.rect.x), y: r1(m.rect.y), w: r1(m.rect.w), h: r1(m.rect.h) } })),
    };
  }
}
