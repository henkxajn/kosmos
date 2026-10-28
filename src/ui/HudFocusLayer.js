// HudFocusLayer — ARKUSZ HUD paczka B (B-1; D-HUD-12, D-HUD-c; HUD_PLAN.md §4.5): podwarstwa NAWIASÓW zaznaczenia warstwy
// HUD 2D (`HudLayer`, na wierzchu — po etykietach tej klatki). Logika — czyste `HudAttentionLogic` (nawiasy, oddech); tu:
// odczyt świata, rzut, rysunek Canvas 2D.
//   • za flagą `FEATURES.hudAttention` (brak klucza = OFF; przy OFF podwarstwa pusta, a ramki RTS statków — `UIManager` — jak dziś);
//   • nawiasy ⌜ ⌟ w roli `primary` wokół tarczy zaznaczonego ciała (`entityId`), przypiętej stacji (`stationId`) i zaznaczonych
//     statków (zbiór — prowadzący jaśniej; statek zawsze, ciało / stacja od tarczy `BRACKET_MIN_DISC_PX`), oddech krycia na
//     zegarze symulacji (pauza — statycznie); narożnik pod przypiętą albo rozwiniętą etykietą tej klatki — pominięty.
// ⚠ Moduł importuje się pod node (keeper `hud_attention_smoke` — atrapa ctx): bez three i bez DOM.
import { isHudAttentionOn, HUD_ATTENTION, breathAlpha, bracketBox, bracketCorners, dropCornersUnder } from './HudAttentionLogic.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { systemIdOf } from '../utils/SystemScope.js';

const q = (v) => Math.round(v * 1000);
const RECT_PAD = 1;    // [px] zapas prostokąta etykiety przy odcinaniu narożnika

export class HudFocusLayer {
  constructor(hud = null) {
    this._hud = hud;
    this._prep = { on: false, targets: [] };
    this._last = { brackets: [] };
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
    if (!F.att) { this._prep = { on: false, targets: [] }; return 'f:0'; }
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
        if (!(p.pinLabel || p.expanded)) continue;
        out.push({ x: p.x - RECT_PAD, y: p.y - RECT_PAD, w: p.w + 2 * RECT_PAD, h: p.h + 2 * RECT_PAD });
      }
    }
    return out;
  }

  collect(F, proj) {
    const P = this._prep;
    if (!P.on || !proj) { this._last = { brackets: [] }; return { count: 0, animating: false }; }
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
    this._last = { brackets };
    return { count: brackets.length, animating: false, brackets };
  }

  draw(ctx, F, c) {
    if (!isHudAttentionOn(F.features)) return;
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
    ctx.globalAlpha = 1;
  }

  /** Odczyt dla bramki: nawiasy z ostatniej klatki (px logiczne). */
  debug() {
    const r1 = (v) => (Number.isFinite(v) ? +v.toFixed(1) : v);
    const L = this._last;
    return {
      id: 'focus', on: this._prep.on, targets: this._prep.targets.map((t) => t.key),
      brackets: L.brackets.map((b) => ({ key: b.key, kind: b.kind, cx: r1(b.box.cx), cy: r1(b.box.cy), half: r1(b.box.half),
        arm: r1(b.box.arm), corners: b.corners.map((k) => k.id), alpha: r1(b.alpha) })),
    };
  }
}
