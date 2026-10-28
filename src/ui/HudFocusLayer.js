// HudFocusLayer — ARKUSZ HUD paczka B (B-1, B-2; D-HUD-11, D-HUD-12, D-HUD-c; HUD_PLAN.md §4.5): podwarstwa NAWIASÓW
// zaznaczenia i ALERTÓW na intruzie warstwy HUD 2D (`HudLayer`, na wierzchu — po etykietach tej klatki). Logika — czyste
// `HudAttentionLogic` (nawiasy, oddech) i `HudAlertLogic` (pierścienie, wektor); tu: odczyt świata, rzut, rysunek Canvas 2D.
//   • nawiasy statków zastępują dawne ramki RTS (`UIManager._drawBracketForVessel` rysuje już tylko paski paliwa i warp; od B-Z
//     bez ścieżki OFF);
//   • nawiasy ⌜ ⌟ w roli `primary` wokół tarczy zaznaczonego ciała (`entityId`), przypiętej stacji (`stationId`) i zaznaczonych
//     statków (zbiór — prowadzący jaśniej; statek zawsze, ciało / stacja od tarczy `BRACKET_MIN_DISC_PX`), oddech krycia na
//     zegarze symulacji (pauza — statycznie); narożnik pod przypiętą albo rozwiniętą etykietą tej klatki — pominięty;
//   • alert (obcy w zasięgu wykrycia obiektu gracza): dwa cienkie pierścienie na intruzie w roli `alert` — gdy intruz NIE ma
//     celownika wroga (z celownikiem: jeden rysunek — celownik pulsuje w rytmie alertu, `ThreeRenderer._syncEnemyAlertMarkers`);
//     kropkowany wektor od obiektu gracza do intruza; oba gasną z pulsem alertu; intruz niewidoczny (mgła wojny) — nic;
//     kolonia ∞ — alert przez etykietę (`HudLabelLayer`), bez wektora.
// ⚠ Moduł importuje się pod node (keeper `hud_attention_smoke` — atrapa ctx): bez three i bez DOM.
import { HUD_ATTENTION, breathAlpha, bracketBox, bracketCorners, dropCornersUnder } from './HudAttentionLogic.js';
import { HUD_ALERT } from './HudAlertLogic.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { systemIdOf } from '../utils/SystemScope.js';
import { clipRunsToRect } from './HudRadarLogic.js';

const q = (v) => Math.round(v * 1000);
const RECT_PAD = 1;    // [px] zapas prostokąta etykiety przy odcinaniu narożnika

export class HudFocusLayer {
  constructor(hud = null) {
    this._hud = hud;
    this._prep = { on: false, targets: [] };
    this._last = { brackets: [], rings: [], vectors: [] };
  }

  /** Cele nawiasów: zaznaczone ciało, przypięta stacja, zaznaczone statki gracza w oglądanym układzie (widoczny sprite). */
  _targets(F) {
    const K = F.K, sel = F.sel, tr = K.threeRenderer, vm = K.vesselManager;
    const out = [];
    if (sel.entityId != null) {
      const w = tr?.getBodyWorldInfo?.(sel.entityId);
      if (w) out.push({ key: 'b:' + sel.entityId, kind: 'body', id: sel.entityId, world: w, lead: true });
    }
    if (sel.stationId != null) {
      const w = tr?.getStationWorldInfo?.(sel.stationId) ?? tr?.getBodyWorldInfo?.(sel.stationId);
      if (w) out.push({ key: 's:' + sel.stationId, kind: 'station', id: sel.stationId, world: w, lead: true });
    }
    // Statki — nawiasy w miejscu ramek RTS (`UIManager._drawBracketForVessel` rysuje wtedy same paski paliwa i warp); ta sama
    // flaga co ramki (`fcBrackets`).
    const ids = !F.features?.fcBrackets ? [] : (sel.vesselIds?.length ? sel.vesselIds : (sel.leadId != null ? [sel.leadId] : []));
    for (const id of ids) {
      const v = vm?.getVessel?.(id);
      if (!v || v.isWreck || isEnemyVessel(v) || systemIdOf(v) !== F.activeSystemId) continue;
      const e = tr?._vessels?.get?.(id);
      if (!e?.sprite || e.sprite.visible === false) continue;
      const w = tr.getVesselWorldInfo?.(id) ?? tr.getVesselWorldPosition?.(id);
      if (!w) continue;
      out.push({ key: 'v:' + id, kind: 'vessel', id, world: w, lead: sel.leadId == null || String(id) === String(sel.leadId) });
    }
    return out;
  }

  prepare(F) {
    const targets = this._targets(F);
    let key = 'f:1';
    for (const tg of targets) key += `|${tg.key}:${q(tg.world.x)},${q(tg.world.y)},${q(tg.world.z)}:${q(tg.world.r ?? 0)}:${tg.lead ? 1 : 0}`;
    // Oddech nawiasów na zegarze symulacji — klatka przy każdym przyroście zegara (pauza — spoczynek).
    if (targets.length) key += `|fb${F.sim == null ? '-' : Math.round(F.sim)}`;
    this._prep = { on: true, targets };
    return key;
  }

  /** Prostokąty etykiet przypiętych i rozwiniętych z tej klatki (podwarstwa etykiet zebrana wcześniej). */
  _labelRects() {
    const out = [];
    for (const s of this._hud?._sublayers ?? []) {
      if (!s || s === this || typeof s.debugPlacement !== 'function') continue;
      for (const p of s._last?.labels ?? []) {
        if (!(p.pinLabel || p.expanded || p.alertLine)) continue;
        out.push({ x: p.x - RECT_PAD, y: p.y - RECT_PAD, w: p.w + 2 * RECT_PAD, h: p.h + 2 * RECT_PAD });
      }
    }
    return out;
  }

  collect(F, proj) {
    const P = this._prep;
    if (!P.on || !proj) { this._last = { brackets: [], rings: [], vectors: [] }; return { count: 0, animating: false }; }
    const map = F.mapRect;
    const breath = breathAlpha(F.sim);
    const rects = this._labelRects();
    const brackets = [];
    for (const tg of P.targets) {
      const p = proj.point(tg.world.x, tg.world.y, tg.world.z, 1e-4);
      if (!p) continue;
      const discR = tg.world.r > 0 ? tg.world.r * proj.pxPerWorld(p.depth) : 0;
      const box = bracketBox({ cx: p.x, cy: p.y, discR, kind: tg.kind === 'vessel' ? 'vessel' : tg.kind, frame: map });
      if (!box) continue;
      if (box.cx + box.half < map.x || box.cx - box.half > map.x + map.w || box.cy + box.half < map.y || box.cy - box.half > map.y + map.h) continue;
      const corners = dropCornersUnder(bracketCorners(box), rects);
      if (!corners.length) continue;
      const alpha = breath * box.fade * (tg.lead ? 1 : HUD_ATTENTION.SHIP_SET_ALPHA);
      brackets.push({ key: tg.key, kind: tg.kind, box, corners, alpha, dot: tg.kind === 'vessel' });
    }
    // Alerty na intruzie (kolonia ∞ — przez etykietę): pierścienie (bez celownika wroga) i kropkowany wektor.
    const rings = [], vectors = [];
    const M = 4, view = { x0: -M, y0: -M, x1: F.W + M, y1: F.H + M };
    for (const a of F.alertView?.(proj) ?? []) {
      if (a.infinite || !a.visible || !a.primary || !(a.env > 0)) continue;   // jeden komplet na intruza (`primary`)
      if (!a.crosshair) rings.push({ id: a.id, x: a.foeScr.x, y: a.foeScr.y, env: a.env });
      if (a.holderScr) {
        const dx = a.foeScr.x - a.holderScr.x, dy = a.foeScr.y - a.holderScr.y, d = Math.hypot(dx, dy);
        const r0 = Math.max(0, a.holderDiscPx ?? 0) + 2, r1 = HUD_ALERT.RING_R1 + 2;
        if (d > r0 + r1 + 2) {
          const ux = dx / d, uy = dy / d;
          const run = [a.holderScr.x + ux * r0, a.holderScr.y + uy * r0, a.foeScr.x - ux * r1, a.foeScr.y - uy * r1];
          const pieces = clipRunsToRect([run], view);
          if (pieces.length) vectors.push({ id: a.id, pieces, env: a.env });
        }
      }
    }
    this._last = { brackets, rings, vectors };
    return { count: brackets.length + rings.length + vectors.length, animating: false, brackets, rings, vectors };
  }

  draw(ctx, F, c) {
    const roles = F.roles;
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    // Nawiasy — rola `primary`, linia 1 px; statek — znacznik środka (lustro ramki RTS).
    ctx.strokeStyle = roles.primary;
    ctx.lineWidth = HUD_ATTENTION.BRACKET_WIDTH;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    for (const b of c.brackets ?? []) {
      ctx.globalAlpha = b.alpha;
      ctx.beginPath();
      for (const k of b.corners) { const p = k.pts; ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); ctx.lineTo(p[4], p[5]); }
      ctx.stroke();
      if (b.dot) {
        ctx.fillStyle = roles.primary;
        ctx.beginPath(); ctx.arc(b.box.cx, b.box.cy, 1.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Pierścienie alertu na intruzie — dwie obwódki różnej jasności, rola `alert`.
    const A = HUD_ALERT;
    ctx.strokeStyle = roles.alert;
    ctx.lineWidth = A.RING_WIDTH;
    for (const r of c.rings ?? []) {
      ctx.globalAlpha = A.RING_A0 * r.env;
      ctx.beginPath(); ctx.arc(r.x, r.y, A.RING_R0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = A.RING_A1 * r.env;
      ctx.beginPath(); ctx.arc(r.x, r.y, A.RING_R1, 0, Math.PI * 2); ctx.stroke();
    }
    // Wektor obiekt → intruz — kropki (kreska zerowej długości z okrągłym końcem), rola `alert`.
    ctx.lineCap = 'round';
    ctx.lineWidth = A.VECTOR_DOT;
    ctx.setLineDash([0, A.VECTOR_GAP]);
    for (const v of c.vectors ?? []) {
      ctx.globalAlpha = A.VECTOR_ALPHA * v.env;
      for (const pc of v.pieces) {
        ctx.lineDashOffset = pc.offset;
        ctx.beginPath(); ctx.moveTo(pc.pts[0], pc.pts[1]);
        for (let i = 2; i < pc.pts.length; i += 2) ctx.lineTo(pc.pts[i], pc.pts[i + 1]);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  }

  /** Odczyt dla bramki: nawiasy, pierścienie i wektory z ostatniej klatki (px logiczne). */
  debug() {
    const r1 = (v) => (Number.isFinite(v) ? +v.toFixed(1) : v);
    const L = this._last;
    return {
      id: 'focus', on: this._prep.on, targets: this._prep.targets.map((t) => t.key),
      brackets: L.brackets.map((b) => ({ key: b.key, kind: b.kind, cx: r1(b.box.cx), cy: r1(b.box.cy), half: r1(b.box.half),
        arm: r1(b.box.arm), corners: b.corners.map((k) => k.id), alpha: r1(b.alpha) })),
      rings: L.rings.map((r) => ({ id: r.id, x: r1(r.x), y: r1(r.y), env: r1(r.env) })),
      vectors: L.vectors.map((v) => ({ id: v.id, pieces: v.pieces.length, env: r1(v.env) })),
    };
  }
}
