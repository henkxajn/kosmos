// HudRadarLayer — ARKUSZ HUD H1 (D-HUD-3, D-HUD-4, D-HUD-12, D-HUD-18, D-HUD-b; HUD_PLAN.md §4.2): podwarstwa RADARU
// warstwy HUD 2D (`HudLayer`). Logika — czysty `HudRadarLogic`; tu: odczyt świata (`F.K` = `window.KOSMOS`), pamięć chwili
// zaznaczenia (start pingu), rzut przez wspólny projektor (`HudProjection`) i rysunek Canvas 2D w px logicznych.
//   • za flagą `FEATURES.hudRadar` (brak klucza = OFF; przy OFF podwarstwa pusta, a pierścienie 3D `ThreeRenderer` — jak dziś);
//   • widoczność: preferencja ☰ „Radar” przy ON = `uiPrefs.hudRadarVisible` (brak klucza = widoczna); tryb Y wymusza;
//   • środek radaru: statek — sprite w świecie (`getVesselWorldPosition`; bez sprite'a — pozycja logiczna × skala świata),
//     statek zadokowany — ciało (albo stacja) postoju (`getBodyWorldInfo`); kolonia — jej ciało. Okrąg w płaszczyźnie
//     równoległej do ekliptyki na wysokości środka — ping rusza OD obiektu;
//   • granica (korekta 1b): kropki, podziałka 10 / 16 px i odczyt zasięgu przy najwyższej na ekranie kresce głównej;
//     rola granicy = `HUD_RADAR.BOUNDARY_ROLE` (`primary` — wybór właściciela na bramce H1 2026-10-23);
//   • kolory z ról motywu (`F.roles`, czytane w każdej klatce rysunku) — zero hexów.
import { GAME_CONFIG } from '../config/GameConfig.js';
import { THEME } from '../config/ThemeConfig.js';   // korekta 1b — font odczytu zasięgu
import { getLocale } from '../i18n/i18n.js';         // korekta 1b — separator dziesiętny odczytu
import {
  HUD_RADAR, isHudRadarOn, radarLayerVisible, radarSelection, radarHolders, vesselRadarRangeAU, colonyRadarRangeAU,
  pingPhase, pingRadiusFrac, pingFade, pingStopReason, tickAngles, ringSegments, radarStyle,
  isMajorTick, rangeReadoutText, radarReadout, readoutCenter, clipRunsToRect,
} from './HudRadarLogic.js';

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;     // px logiki gry na 1 AU (pozycje statków)
const TICK_INNER = 0.999;                  // punkt pomocniczy kierunku kreski podziałki (część promienia)
const q = (v) => Math.round(v * 1000);     // klucz klatki — położenie z dokładnością 0,001 j.

export class HudRadarLayer {
  constructor(hud = null) {
    this._hud = hud;
    this._sel = { vesselId: null, bodyId: null };   // ostatnio widziane zaznaczenie (start pingu przy zmianie)
    this._starts = new Map();                       // klucz obiektu → { real, sim } — chwila zaznaczenia
    this._prep = { on: false, visible: false, holders: [] };
    this._last = [];                                // ostatnio zebrane (odczyt bramki)
  }

  // Zaznaczenie → chwila startu pingu (czas realny + zegar symulacji); zegar, który pojawił się dopiero po wczytaniu
  // (pierwszy tik), kotwiczy kolejne pingi od tej chwili.
  _trackSelection(pick, F) {
    const prev = this._sel;
    if (pick.vesselId != null && pick.vesselId !== prev.vesselId) this._starts.set('v:' + pick.vesselId, { real: F.now, sim: F.sim });
    if (pick.bodyId != null && pick.bodyId !== prev.bodyId) this._starts.set('c:' + pick.bodyId, { real: F.now, sim: F.sim });
    for (const k of [...this._starts.keys()]) {
      if (k !== 'v:' + pick.vesselId && k !== 'c:' + pick.bodyId) this._starts.delete(k);
    }
    for (const st of this._starts.values()) if (st.sim == null && F.sim != null) st.sim = F.sim;
    this._sel = pick;
  }

  /** Część klucza klatki: flaga, widoczność, tryb Y, obiekty z radarem (środek, zasięg), zegar symulacji przy zaznaczonym. */
  prepare(F) {
    const K = F.K;
    const on = isHudRadarOn(F.features);
    this._trackSelection(radarSelection(F.sel), F);
    const visible = on && radarLayerVisible(K?.uiPrefs, F.tactical);
    if (!visible) { this._prep = { on, visible, holders: [] }; return `r:${on ? 1 : 0}:0`; }
    const tr = K.threeRenderer;
    const vm = K.vesselManager, cm = K.colonyManager;
    const raw = radarHolders({
      vessels: vm?.getAllVessels?.() ?? [],
      colonies: cm?.getAllColonies?.() ?? [],
      sel: F.sel, tactical: F.tactical, activeSystemId: F.activeSystemId,
      vesselRange: (v) => vesselRadarRangeAU(v, { vesselManager: vm, techSystem: K.techSystem }),
      colonyRange: (c) => colonyRadarRangeAU(c, K.observatorySystem),
    });
    const holders = [];
    let key = `r:1:${F.tactical ? 1 : 0}`;
    let anySelected = false;
    for (const h of raw) {
      let c = null, discR = null;
      if (h.anchorBodyId != null) {
        const b = tr?.getBodyWorldInfo?.(h.anchorBodyId);
        if (b) { c = { x: b.x, y: b.y, z: b.z }; discR = b.r > 0 ? b.r : null; }
      } else {
        const s = tr?.getVesselWorldPosition?.(h.id);
        if (s) c = s;
        else {
          const v = vm?.getVessel?.(h.id);
          if (v?.position && Number.isFinite(v.position.x) && Number.isFinite(v.position.y)) c = { gx: v.position.x, gy: v.position.y };
        }
      }
      if (!c) continue;
      if (h.selected) anySelected = true;
      holders.push({ ...h, c, discR });
      key += c.gx != null ? `|${h.key}:${h.rangeAU}:${h.selected ? 1 : 0}:g${q(c.gx)},${q(c.gy)}`
        : `|${h.key}:${h.rangeAU}:${h.selected ? 1 : 0}:${q(c.x)},${q(c.y)},${q(c.z)}`;
    }
    if (anySelected) key += `|s${F.sim == null ? '-' : Math.round(F.sim)}`;
    this._prep = { on, visible, holders };
    return key;
  }

  /** Geometria w px logicznych + `animating` (ping biegnie). */
  collect(F, proj) {
    const P = this._prep;
    const wpa = proj?.worldPerAU;
    if (!P.visible || !P.holders.length || !(wpa > 0)) { this._last = []; return { count: 0, animating: false, items: [] }; }
    const map = F.mapRect;
    const M = HUD_RADAR.BOUNDARY_CLIP_PX;
    const view = { x0: -M, y0: -M, x1: F.W + M, y1: F.H + M };   // okno w px logicznych + margines (kropki tylko na ekranie)
    const items = [];
    let animating = false, drawn = 0;
    for (const h of P.holders) {
      const c = h.c.gx != null ? { x: h.c.gx * wpa / AU_TO_PX, y: 0, z: h.c.gy * wpa / AU_TO_PX } : h.c;
      const ctr = proj.point(c.x, c.y, c.z);
      const it = { key: h.key, kind: h.kind, id: h.id, selected: h.selected, docked: h.docked, rangeAU: h.rangeAU,
        circle: h.circle, center: ctr ? { x: ctr.x, y: ctr.y } : null, ringPx: null, discPx: null, stop: null, ping: null,
        ring: null, boundary: [], ticks: [], readout: null, pingRing: null, echoRing: null };
      if (!h.circle) { items.push(it); continue; }                // zasięg ∞ — bez okręgu
      const rW = h.rangeAU * wpa;
      const ppw = ctr ? proj.pxPerWorld(ctr.depth) : Infinity;
      it.ring = proj.arc(c.x, c.y, c.z, rW, ringSegments(rW * ppw));
      it.ringPx = it.ring.maxR;
      it.boundary = clipRunsToRect(it.ring.runs, view);           // kropki tylko w oknie (koszt — K11 S5), ta sama faza
      it.discPx = (h.discR > 0 && ctr) ? 2 * h.discR * ppw : null;
      const angles = tickAngles();
      for (let k = 0; k < angles.length; k++) {
        const cs = Math.cos(angles[k]), sn = Math.sin(angles[k]);
        const o = proj.point(c.x + rW * cs, c.y, c.z + rW * sn);
        const i = proj.point(c.x + rW * TICK_INNER * cs, c.y, c.z + rW * TICK_INNER * sn);
        if (!o || !i) continue;
        const dx = i.x - o.x, dy = i.y - o.y, d = Math.hypot(dx, dy);
        if (!(d > 0)) continue;
        const len = isMajorTick(k) ? HUD_RADAR.TICK_MAJOR_LEN : HUD_RADAR.TICK_LEN;   // główne 0°, 90°, 180°, 270°
        it.ticks.push([o.x, o.y, o.x + (dx / d) * len, o.y + (dy / d) * len, k]);
      }
      // Odczyt zasięgu przy najwyższej na ekranie kresce głównej (decyzja właściciela 2026-10-23), na zewnątrz granicy.
      it.readout = radarReadout(it.ticks, rangeReadoutText(h.rangeAU, getLocale()));
      if (h.selected) {
        const st = this._starts.get(h.key);
        const ph = st ? pingPhase({ realNowMs: F.now, realStartMs: st.real, simNowMs: F.sim, simStartMs: st.sim }) : null;
        it.stop = pingStopReason({ ringPx: it.ringPx, mapW: map.w, mapH: map.h, discPx: it.discPx });
        if (ph && !it.stop) {
          it.ping = ph;
          animating = true;
          const rp = rW * pingRadiusFrac(ph.u);
          it.pingRing = proj.arc(c.x, c.y, c.z, rp, ringSegments(rp * ppw));
          const gapW = Number.isFinite(ppw) && ppw > 0 ? HUD_RADAR.PING_ECHO_GAP / ppw : 0;
          if (rp - gapW > 0) it.echoRing = proj.arc(c.x, c.y, c.z, rp - gapW, ringSegments((rp - gapW) * ppw));
        }
      }
      if (it.ring.runs.length) drawn++;
      items.push(it);
    }
    this._last = items;
    return { count: drawn, animating, items };
  }

  draw(ctx, F, collected) {
    const s = radarStyle(F.roles);
    const runs = (r) => {
      for (const run of r?.runs ?? []) {
        ctx.moveTo(run[0], run[1]);
        for (let i = 2; i < run.length; i += 2) ctx.lineTo(run[i], run[i + 1]);
      }
    };
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    for (const it of collected.items) {
      if (!it.ring?.runs?.length) continue;
      // Granica zasięgu — kropki (kreska zerowej długości z okrągłym końcem = kropka o średnicy szerokości linii).
      ctx.strokeStyle = s.boundary.color;
      ctx.globalAlpha = s.boundary.alpha;
      ctx.lineWidth = s.boundary.width;
      ctx.lineCap = s.boundary.cap;
      ctx.setLineDash(s.boundary.dash);
      for (const b of it.boundary) {
        ctx.lineDashOffset = b.offset;   // faza kropek jak na całej ścieżce
        ctx.beginPath(); ctx.moveTo(b.pts[0], b.pts[1]);
        for (let i = 2; i < b.pts.length; i += 2) ctx.lineTo(b.pts[i], b.pts[i + 1]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.lineCap = 'butt';
      // Podziałka co 30° — kreski do wewnątrz, główne (0°, 90°, 180°, 270°) dłuższe.
      if (it.ticks.length) {
        ctx.strokeStyle = s.tick.color;
        ctx.globalAlpha = s.tick.alpha;
        ctx.lineWidth = s.tick.width;
        ctx.beginPath();
        for (const t of it.ticks) { ctx.moveTo(t[0], t[1]); ctx.lineTo(t[2], t[3]); }
        ctx.stroke();
      }
      // Odczyt zasięgu — font motywu, bez tła, na zewnątrz granicy przy najwyższej na ekranie kresce głównej.
      if (it.readout) {
        const size = THEME.fontSizeSmall;
        ctx.font = `${size}px ${THEME.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = s.readout.color;
        ctx.globalAlpha = s.readout.alpha;
        const w = ctx.measureText(it.readout.text)?.width;
        const p = readoutCenter(it.readout, Number.isFinite(w) ? w : it.readout.text.length * size * 0.6, size);
        ctx.fillText(it.readout.text, p.x, p.y);
      }
      // Ping — poświata (nałożone szerokie warstwy), ostra linia, echo tuż za nią; gaśnie na granicy.
      if (it.ping && it.pingRing?.runs?.length) {
        const f = pingFade(it.ping.u);
        ctx.strokeStyle = s.ping.color;
        ctx.beginPath(); runs(it.pingRing);
        for (const w of s.ping.glow.widths) { ctx.globalAlpha = s.ping.glow.alpha * f; ctx.lineWidth = w; ctx.stroke(); }
        ctx.globalAlpha = s.ping.line.alpha * f;
        ctx.lineWidth = s.ping.line.width;
        ctx.stroke();
        if (it.echoRing?.runs?.length) {
          ctx.beginPath(); runs(it.echoRing);
          ctx.globalAlpha = s.ping.echo.alpha * f;
          ctx.lineWidth = s.ping.echo.width;
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Odczyt dla bramki: obiekty z radarem z ostatniej klatki rysunku (px logiczne). */
  debug() {
    const r2 = (v) => (Number.isFinite(v) ? +v.toFixed(2) : v);
    const plen = (pts) => { let s = 0; for (let i = 2; i < pts.length; i += 2) s += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]); return s; };
    return {
      id: 'radar', on: this._prep.on, visible: this._prep.visible, prepared: this._prep.holders.length,
      boundaryRole: HUD_RADAR.BOUNDARY_ROLE,
      holders: this._last.map((it) => ({
        key: it.key, kind: it.kind, id: it.id, selected: it.selected, docked: it.docked, rangeAU: it.rangeAU, circle: it.circle,
        center: it.center ? { x: r2(it.center.x), y: r2(it.center.y) } : null, ringPx: r2(it.ringPx), discPx: r2(it.discPx),
        stop: it.stop, ping: it.ping ? { u: +it.ping.u.toFixed(3), clock: it.ping.clock, n: it.ping.n } : null,
        runs: it.ring?.runs?.length ?? 0, ticks: it.ticks.length,
        readout: it.readout ? { text: it.readout.text, deg: it.readout.deg, x: r2(it.readout.x), y: r2(it.readout.y) } : null,
        ringLen: Math.round((it.ring?.runs ?? []).reduce((a, r) => a + plen(r), 0)), boundaryLen: Math.round(it.boundary.reduce((a, b) => a + plen(b.pts), 0)),
      })),
    };
  }
}
