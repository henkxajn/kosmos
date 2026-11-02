// HudGalaxyPingLayer — ARC GALAXY, krok G2-2 (docs/design/GALAXY_PLAN.md §4 G2; D-GX-22; rama F5): podwarstwa PINGU
// OBSERWATORIUM na płycie galaktyki — geometria i rysunek pierścienia radaru H1 (`HudRadarLayer.radarRingGeometry` /
// `radarPingRings` / `drawRadarRing`, styl `radarStyle(roles)`), w miejsce czterech koncentrycznych pierścieni Stratcomu.
//   • środek = DOM, promień = zasięg obserwatorium w ly (`ObservatoryRange.observatoryRangeLY` — tabela STRATCOM_LY_BY_LEVEL
//     bez zmian; płasko w płaszczyźnie dysku na wysokości domu — D-GX-22; Findingi 595 / 596 zostają zapisane);
//     zasięg 0 (obserwatorium < Lv4) — nic;
//   • odczyt przy najwyższej na ekranie kresce głównej: „5,0 LY” (`fleet.clusterDistance`, separator wg języka);
//   • ping (H1 — `pingPhase`): pierwszy w chwili, gdy chrom trybu galaktyki się pojawia (wejście w tryb) i przy starcie
//     skanu układu (`observatory:systemScanStarted`) — czas realny; kolejne co 6 s zegara symulacji; ping stoi, gdy pierścień
//     większy niż kadr (`pingStopReason`);
//   • chip [R] (D-GX-16: ping obserwatorium) — wyłączony: nic; krycie × rozjaśnienie chromu.
// Flaga `galaxyLook` OFF — podwarstwa milczy.
// ⚠ Moduł importuje się pod node: bez three i bez DOM.
import EventBus from '../core/EventBus.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { THEME } from '../config/ThemeConfig.js';
import { t, getLocale } from '../i18n/i18n.js';
import { fmtDec } from './NumberFormatLogic.js';
import { radarRingGeometry, radarPingRings, drawRadarRing } from './HudRadarLayer.js';
import { HUD_RADAR, pingPhase, pingStopReason, radarStyle, readoutCenter } from './HudRadarLogic.js';
import { GALAXY_K, GALAXY_FADE_MS } from './GalaxyModeLogic.js';
import { galaxyChromeAlpha } from './GalaxyChromeLogic.js';
import { observatoryRangeLY } from '../utils/ObservatoryRange.js';
import { HOME_SYSTEM_ID } from '../utils/SystemExploration.js';

const q = (v) => Math.round(v * 10);
const nowMs = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());

/** Odcinków w jednym kawałku granicy (rysunek pierścienia galaktyki — patrz `splitBoundary`). */
export const PING_CHUNK_SEGMENTS = 16;

/**
 * Granica z kropek w KAWAŁKACH po ≤ `maxSeg` odcinków, z ciągłą fazą kropek (`offset` = długość biegu od jego początku do
 * początku kawałka — te same kropki co jedna ścieżka). Powód — koszt rasteryzacji, nie JS: pierścień 10 ly przy zbliżeniu jest
 * większy od kadru, a obrys jednej ścieżki o obwiedni całego ekranu kosztował ~1,5 ms / klatkę (sonda budżetu G2: 297 → 464
 * kl./s po podziale, 497 bez pingu). Rysunek H1 trybu układu bez zmian.
 * @param {Array<{pts:number[], offset:number}>} boundary
 * @returns {Array<{pts:number[], offset:number}>}
 */
export function splitBoundary(boundary, maxSeg = PING_CHUNK_SEGMENTS) {
  const out = [];
  const step = Math.max(1, Math.floor(maxSeg)) * 2;
  for (const b of boundary ?? []) {
    const p = b?.pts ?? [];
    if (p.length < 4) { if (p.length) out.push({ pts: p.slice(), offset: b.offset ?? 0 }); continue; }
    let off = Number.isFinite(b.offset) ? b.offset : 0, i0 = 0;
    while (i0 < p.length - 2) {
      const i1 = Math.min(p.length - 2, i0 + step);
      out.push({ pts: p.slice(i0, i1 + 2), offset: off });
      for (let k = i0; k < i1; k += 2) off += Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]);
      i0 = i1;
    }
  }
  return out;
}

export class HudGalaxyPingLayer {
  constructor(hud = null) {
    this._hud = hud;
    this.mode = 'galaxy';
    this._prep = { on: false };
    this._start = null;          // { real, sim } — start pingu
    this._fadeT0Seen = null;     // `_galaxyFadeT0` renderera przy ostatnim starcie (wejście w tryb)
    this._last = null;
    this._onScan = () => { this._start = { real: nowMs(), sim: this._simNow ?? null }; this._hud?.wake?.(); };
    EventBus.on('observatory:systemScanStarted', this._onScan);
  }

  destroy() { EventBus.off('observatory:systemScanStarted', this._onScan); }

  _on() { return !!GAME_CONFIG.FEATURES?.galaxyView && !!GAME_CONFIG.FEATURES?.galaxyLook; }

  prepare(F) {
    const K = F.K, gm = K?.galaxyMode, tr = K?.threeRenderer;
    this._simNow = F.sim;
    if (!this._on() || gm?.isActive !== true || !F.att?.layers?.radar || typeof tr?.getGalaxyStarsWorld !== 'function') {
      this._prep = { on: false };
      return 'gp:0';
    }
    const rangeLY = observatoryRangeLY(K.observatorySystem?.getMaxObservatoryLevel?.() ?? 0);
    if (!(rangeLY > 0)) { this._prep = { on: false }; return 'gp:1:0'; }
    const home = tr.getGalaxyStarsWorld().find((s) => String(s.id) === HOME_SYSTEM_ID)
      ?? (() => { const hs = (K.galaxyData?.systems ?? []).find((s) => s?.isHome === true); return hs ? tr.getGalaxyStarsWorld().find((s) => s.id === String(hs.id)) : null; })();
    if (!home) { this._prep = { on: false }; return 'gp:1:-'; }
    // Start pingu przy pojawieniu się chromu trybu galaktyki (wejście w tryb — `_galaxyFadeT0`).
    const t0 = tr._galaxyFadeT0 ?? null;
    if (t0 !== this._fadeT0Seen) { this._fadeT0Seen = t0; this._start = { real: Math.max(F.now, t0 ?? F.now), sim: F.sim }; }
    if (this._start && this._start.sim == null && F.sim != null) this._start.sim = F.sim;
    const ph = this._start ? pingPhase({ realNowMs: F.now, realStartMs: this._start.real, simNowMs: F.sim, simStartMs: this._start.sim }) : null;
    this._prep = { on: true, rangeLY, home, ph };
    return `gp:1:${rangeLY}:${q(home.x)},${q(home.y)},${q(home.z)}:${ph ? Math.round(ph.u * 200) + ph.clock + ph.n : '-'}`;
  }

  collect(F, proj) {
    const P = this._prep;
    if (!P.on || !proj) { this._last = null; return { count: 0, animating: false, item: null }; }
    const M = HUD_RADAR.BOUNDARY_CLIP_PX;
    const view = { x0: -M, y0: -M, x1: F.W + M, y1: F.H + M };
    const c = { x: P.home.x, y: P.home.y, z: P.home.z };
    const rW = P.rangeLY * GALAXY_K;
    const text = t('fleet.clusterDistance', fmtDec(P.rangeLY, 1, getLocale()));
    const g = radarRingGeometry(proj, c, rW, { view, readoutText: text });
    const map = F.mapRect;
    const it = { boundary: splitBoundary(g.boundary), ticks: g.ticks, readout: g.readout, ring: g.ring, ringPx: g.ringPx, ping: null, pingRing: null, echoRing: null };
    const stop = pingStopReason({ ringPx: g.ringPx, mapW: map.w, mapH: map.h });
    if (P.ph && !stop) {
      it.ping = P.ph;
      const pr = radarPingRings(proj, c, rW, P.ph.u, g.ppw);
      it.pingRing = pr.pingRing; it.echoRing = pr.echoRing;
    }
    const tr = F.K?.threeRenderer;
    const alpha = galaxyChromeAlpha({ flightAlpha: tr?._galaxyChromeAlpha, now: F.now, fadeT0: tr?._galaxyFadeT0, fadeMs: GALAXY_FADE_MS });
    this._last = { ...it, stop, alpha, rangeLY: P.rangeLY };
    return { count: g.ring.runs.length ? 1 : 0, animating: !!it.ping || alpha < 1, item: it, alpha };
  }

  draw(ctx, F, c) {
    if (!c.item?.ring?.runs?.length) return;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    const s = radarStyle(F.roles), a = c.alpha ?? 1;
    // Granica w kawałkach (`splitBoundary`) i podziałka — każda kreska osobnym obrysem: jedna ścieżka dwunastu kresek ma obwiednię
    // całego pierścienia (koszt rasteryzacji jak granica w jednym kawałku). Styl i kolejność jak H1.
    drawRadarRing(ctx, { ...c.item, ticks: [], readout: null, ping: null }, s, a);           // granica
    if (c.item.ticks?.length) {                                                              // podziałka
      ctx.strokeStyle = s.tick.color;
      ctx.globalAlpha = s.tick.alpha * a;
      ctx.lineWidth = s.tick.width;
      for (const t of c.item.ticks) { ctx.beginPath(); ctx.moveTo(t[0], t[1]); ctx.lineTo(t[2], t[3]); ctx.stroke(); }
    }
    drawRadarRing(ctx, { ...c.item, boundary: [], ticks: [] }, s, a);                        // odczyt i ping
    ctx.globalAlpha = 1;
  }

  /** Przeszkoda etykiet płyty: pole odczytu zasięgu (jak odczyt radaru dla etykiet mapy układu — 525). */
  labelObstacles() {
    const r = this._last?.readout;
    if (!r?.text) return [];
    const rs = THEME.fontSizeSmall ?? 9;
    const rw = r.text.length * rs * 0.6;
    const rc = readoutCenter(r, rw, rs);
    return [{ x: rc.x - rw / 2 - 2, y: rc.y - rs / 2 - 2, w: rw + 4, h: rs + 4 }];
  }

  debug() {
    const L = this._last;
    return { id: 'galaxyPing', on: this._prep.on, rangeLY: L?.rangeLY ?? null, ringPx: L?.ringPx != null ? +L.ringPx.toFixed(1) : null,
      ping: L?.ping ? { u: +L.ping.u.toFixed(3), clock: L.ping.clock, n: L.ping.n } : null, stop: L?.stop ?? null,
      readout: L?.readout?.text ?? null };
  }
}
