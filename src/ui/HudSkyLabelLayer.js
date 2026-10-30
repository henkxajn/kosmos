// HudSkyLabelLayer — NIEBO (ARC GALAXY; GALAXY_PLAN.md §4 NIEBO, opcja O1 wciągnięta decyzją właściciela 2026-10-30):
// podwarstwa ETYKIET NIEBA warstwy HUD 2D (`HudLayer`) — nawiasy + nazwa + odległość nad prawdziwymi układami galaktyki na
// kopule nieba, WYŁĄCZNIE przy przytrzymanym CTRL (ta sama flaga „pokaż wszystkie etykiety” co etykiety CTRL mapy układu).
// Logika — czysty `HudSkyLabelLogic`; tu: odczyt świata (`F.K` = `window.KOSMOS`), rzut kierunku W NIESKOŃCZONOŚCI wspólnym
// projektorem (`proj.direction` — gwiazda kopuły leży na kamerze + kierunek × R, więc rzut kierunku = rzut gwiazdy), rysunek
// Canvas 2D w px logicznych.
//   • ZBIERANA OSTATNIA (rozkład etykiet czyta etykiety mapy tej klatki — `HudLabelLayer._last` — i ich przeszkody, oraz
//     etykiety CTRL mapy z `ThreeRenderer.getAllVisibleLabels`), RYSOWANA PIERWSZA (`drawFirst`): niebo leży „w
//     nieskończoności”, pod resztą HUD;
//   • tarcze słońca, planet, księżyców i planetoid ZASŁANIAJĄ znacznik (jak planety zasłaniają kopułę w 3D, Finding 591);
//   • font etykiet warstwy (`HUD_LABELS`: pierwsza linia `fontSizeNormal − 1`, druga `fontSizeSmall` z `SUB_ALPHA`, pasek,
//     nitka z podkreśleniem, fade-in), nawiasy jak nawiasy zaznaczenia (`bracketCorners`, linia `BRACKET_WIDTH`);
//   • odległość: `fleet.clusterDistance` („{0} LY”) z separatorem dziesiętnym języka (`fmtDec`) — bez nowego klucza;
//   • bez strefy kliku (informacja na żądanie, jak etykiety CTRL mapy).
// ⚠ Moduł importuje się pod node (keeper `sky_labels_smoke` — atrapa świata): bez three i bez DOM.
import { THEME } from '../config/ThemeConfig.js';
import { t, getLocale } from '../i18n/i18n.js';
import { fmtDec } from './NumberFormatLogic.js';
import { themeToken } from './HudPalette.js';
import { HUD_LABELS, placeLabels, threadGeometry, updateBorn, fadeAlpha, pointInRect } from './HudLabelLogic.js';
import { HUD_ATTENTION, bracketCorners } from './HudAttentionLogic.js';
import { systemRevealFromWorld } from '../utils/SystemRevealWorld.js';
import { isSystemExplored, HOME_SYSTEM_ID } from '../utils/SystemExploration.js';
import { systemIdOf } from '../utils/SystemScope.js';
import {
  HUD_SKY_LABELS, skyLabelGate, skyLabelRelation, skyLabelRole, skyLabelColor, skyLabelName, coveredByDisc,
  pickSkyMarkers, skyLabelPrio,
} from './HudSkyLabelLogic.js';

const MEASURE_CACHE_MAX = 600;   // wpisów pamięci pomiaru tekstu

/** Układy z kolonią (także placówką) gracza — `systemIdOf` ciała (brak stempla ⇒ dom, tranzyt nie dotyczy ciał). */
export function playerSystemIds(K) {
  const out = new Set();
  const em = K?.entityManager;
  for (const c of K?.colonyManager?.getPlayerColonies?.() ?? []) {
    const body = em?.get?.(c?.planetId) ?? null;
    const sid = body ? systemIdOf(body) : null;
    if (sid != null) out.add(String(sid));
  }
  return out;
}

export class HudSkyLabelLayer {
  constructor(hud = null) {
    this._hud = hud;
    this.drawFirst = true;            // `HudLayer.frame`: zbierana ostatnia, rysowana pierwsza
    this._gate = { shown: false, reason: 'start' };
    this._prep = { on: false, items: [] };
    this._last = { markers: [] };
    this._clusterPrev = new Map();    // histereza skupisk na ekranie (`clusterScreenPoints`)
    this._candPrev = new Map();       // poprzedni kandydat rozkładu (bez skoków etykiet przy ruchu kamery)
    this._born = new Map();           // fade-in etykiet (czas realny, jak etykiety warstwy)
    this._measure = new Map();        // pomiar tekstu: `font|tekst` → szerokość
    this._sysRef = null;
    this._byId = new Map();
  }

  // Pomiar tekstu ctx warstwy (atrapa bez `measureText` — przybliżenie z rozmiaru fontu), jak `HudLabelLayer._width`.
  _width(font, size, s) {
    const k = font + '|' + s;
    const hit = this._measure.get(k);
    if (hit != null) return hit;
    const ctx = this._hud?.ctx ?? null;
    let w = null;
    if (ctx?.measureText) {
      ctx.font = font;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      w = ctx.measureText(s)?.width;
    }
    if (!Number.isFinite(w)) w = s.length * size * 0.6;
    if (this._measure.size > MEASURE_CACHE_MAX) this._measure.clear();
    this._measure.set(k, w);
    return w;
  }

  _systems(K) {
    const systems = K?.galaxyData?.systems ?? [];
    if (this._sysRef !== systems) {
      this._sysRef = systems;
      this._byId = new Map(systems.map((s) => [String(s?.id), s]));
    }
    return this._byId;
  }

  /** Bramka (CTRL / przyrząd, SHIFT, overlay, tryb Y, flaga) i prawdziwe układy nieba z treścią — część klucza klatki. */
  prepare(F) {
    const K = F.K, tr = K?.threeRenderer, um = K?.uiManager;
    const gate = skyLabelGate({
      flag: F.features?.skyCatalog === true && !!tr?._sky,
      cleanView: um?._cleanView === true || tr?._cleanView === true,
      overlay: um?.overlayManager?.isAnyOpen?.() === true,
      yMode: F.tactical === true,
      ctrl: tr?._showAllLabels === true,
      forced: tr?._skyLabelsForced === true,
    });
    this._gate = gate;
    const buf = tr?._skyBuf, cat = tr?._skyCatalog;
    if (!gate.shown || !buf || !cat) { this._prep = { on: false, items: [] }; return `sky:0:${gate.reason ?? 'empty'}`; }
    const sid = String(tr._skySystemId ?? '');
    const oi = cat.index.has(sid) ? cat.index.get(sid) : -1;
    const p = cat.pos;
    const ox = oi >= 0 ? p[oi * 3] : 0, oy = oi >= 0 ? p[oi * 3 + 1] : 0, oz = oi >= 0 ? p[oi * 3 + 2] : 0;
    const byId = this._systems(K);
    const own = playerSystemIds(K);
    const loc = getLocale();
    const items = [];
    for (let k = 0; k < buf.count; k++) {
      if (buf.real[k] !== 1) continue;
      const i = buf.src[k];
      const id = String(cat.ids[i]);
      const sys = byId.get(id) ?? (id === HOME_SYSTEM_ID ? { id, isHome: true } : null);
      let revealed = false;
      try { revealed = systemRevealFromWorld(K, sys).name === true; } catch { revealed = false; }
      const relation = skyLabelRelation({ own: id === HOME_SYSTEM_ID || sys?.isHome === true || own.has(id), explored: isSystemExplored(sys) });
      const distLy = Math.hypot(p[i * 3] - ox, p[i * 3 + 1] - oy, p[i * 3 + 2] - oz);
      items.push({
        id, dir: [buf.dir[k * 3], buf.dir[k * 3 + 1], buf.dir[k * 3 + 2]], distLy, relation, role: skyLabelRole(relation),
        name: skyLabelName({ name: sys?.name, revealed }), dist: t('fleet.clusterDistance', fmtDec(distLy, 1, loc)),
      });
    }
    let key = `sky:1:${sid}:${buf.count}:${loc}`;
    for (const it of items) key += `|${it.id}:${it.role}:${it.name === '???' ? 0 : 1}`;
    this._prep = { on: true, items };
    return key;
  }

  /** Tarcze ciał oglądanego układu na ekranie (px logiczne): słońce, planety, księżyce, planetoidy. */
  _bodyDiscs(K, proj) {
    const tr = K?.threeRenderer, em = K?.entityManager;
    const out = [];
    const push = (w) => {
      if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.y) || !Number.isFinite(w.z)) return;
      const p = proj.point(w.x, w.y, w.z);
      if (!p) return;
      const r = w.r > 0 ? w.r * proj.pxPerWorld(p.depth) : 0;
      if (r >= HUD_SKY_LABELS.MIN_DISC_PX) out.push({ cx: p.x, cy: p.y, r });
    };
    const star = em?.getByType?.('star')?.[0] ?? null;
    if (star) push(tr?.getBodyWorldInfo?.(star.id));
    for (const m of [tr?._planets, tr?._moons, tr?._planetoids]) {
      for (const id of m?.keys?.() ?? []) push(tr.getBodyWorldInfo?.(id));
    }
    return out;
  }

  /** Przeszkody rozkładu: przeszkody i etykiety warstwy etykiet tej klatki (gdy działa) + etykiety CTRL mapy układu. */
  _obstacles(F, K, discs) {
    const R = HUD_LABELS;
    const out = [];
    const lab = (this._hud?._sublayers ?? []).find((s) => s && s !== this && Array.isArray(s._last?.labels) && Array.isArray(s._last?.obstacles));
    if (lab) {
      for (const o of lab._last.obstacles) if (o) out.push(o);
      for (const p of lab._last.labels) {
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) out.push({ x: p.x - R.GAP, y: p.y - R.GAP, w: p.w + 2 * R.GAP, h: p.h + 2 * R.GAP });
      }
    } else {
      // Warstwa etykiet wyłączona (chip [E]) — tarcze i przeszkody pozostałych podwarstw wprost.
      for (const d of discs) if (d.r >= R.DISC_OBSTACLE_MIN_PX) out.push({ cx: d.cx, cy: d.cy, r: d.r });
      for (const s of this._hud?._sublayers ?? []) {
        if (s && s !== this && typeof s.labelObstacles === 'function') for (const o of s.labelObstacles(F) ?? []) if (o) out.push(o);
      }
    }
    // Etykiety CTRL mapy układu (`UIManager._drawAllLabels` — ten sam CTRL): nazwa na prawo od kropki obiektu.
    const tr = K?.threeRenderer;
    if (tr?._showAllLabels === true) {
      const fs = HUD_SKY_LABELS.CTRL_LABEL_FONT_PX, font = `${fs}px ${THEME.fontFamily}`, us = F.uiScale > 0 ? F.uiScale : 1;
      let list = [];
      try { list = tr.getAllVisibleLabels?.() ?? []; } catch { list = []; }
      for (const l of list) {
        const sx = l?.x / us, sy = l?.y / us;
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
        out.push({ x: sx + 7, y: sy - fs / 2 - 1, w: this._width(font, fs, String(l.name ?? '?')) + 2, h: fs + 2 });
      }
    }
    return out;
  }

  /** Geometria znaczników (px logiczne): rzut, zasłonięcie, jedna etykieta na skupisko, rozkład anti-overlap. */
  collect(F, proj) {
    const P = this._prep;
    if (!P.on || !proj || !P.items.length || typeof proj.direction !== 'function') {
      this._born.clear();
      this._last = { markers: [] };
      return { count: 0, animating: false, markers: [] };
    }
    const K = F.K, map = F.mapRect;
    const discs = this._bodyDiscs(K, proj);
    const pts = [];
    for (const it of P.items) {
      const s = proj.direction(it.dir[0], it.dir[1], it.dir[2]);
      if (!s || !pointInRect(s.x, s.y, map) || coveredByDisc(s.x, s.y, discs)) continue;
      pts.push({ ...it, x: s.x, y: s.y });
    }
    const winners = pickSkyMarkers(pts, { prev: this._clusterPrev });
    const R = HUD_LABELS, S = HUD_SKY_LABELS;
    const size = (THEME.fontSizeNormal ?? 11) + R.MAIN_SIZE_DELTA, subSize = THEME.fontSizeSmall ?? 9;
    const font = `${size}px ${THEME.fontFamily}`, subFont = `${subSize}px ${THEME.fontFamily}`;
    const half = S.BRACKET_HALF;
    const arm = Math.max(1, Math.min(HUD_ATTENTION.BRACKET_ARM_PX, 2 * half * HUD_ATTENTION.BRACKET_ARM_FRAC));
    const items = winners.map((w, rank) => {
      const lines = [
        { text: w.name, font, size, w: this._width(font, size, w.name), h: size + 3 },
        { text: w.dist, font: subFont, size: subSize, w: this._width(subFont, subSize, w.dist), h: subSize + 3 },
      ];
      const bw = Math.max(...lines.map((ln) => ln.w)) + 2 * R.PAD_X;
      const bh = lines.reduce((a, ln) => a + ln.h, 0) + R.LINE_GAP * (lines.length - 1) + 2 * R.PAD_Y;
      return { key: 's:' + w.id, id: w.id, ax: w.x, ay: w.y, clear: half * Math.SQRT2, w: bw, h: bh,
        prio: skyLabelPrio(w.relation, rank), lines, role: w.role, relation: w.relation, distLy: w.distLy, clusterSize: w.clusterSize };
    });
    const { placed } = placeLabels(items, { rect: map, obstacles: this._obstacles(F, K, discs), prev: this._candPrev });
    this._candPrev = new Map(placed.map((p) => [p.key, p.cand]));
    const fading = updateBorn(this._born, placed.map((p) => p.key), F.now);
    const markers = placed.map((p) => ({ ...p, half, arm, fade: fadeAlpha(F.now, this._born.get(p.key)) }));
    this._last = { markers };
    return { count: markers.length, animating: fading, markers };
  }

  draw(ctx, F, c) {
    const R = HUD_LABELS;
    const roles = F.roles;
    const textPrimary = themeToken(THEME, 'textPrimary');
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.setLineDash([]);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (const m of c.markers ?? []) {
      const fade = m.fade ?? 1;
      if (!(fade > 0)) continue;
      const color = skyLabelColor(m.role, roles, textPrimary);
      // Nawiasy ⌜ ⌟ wokół gwiazdy.
      ctx.strokeStyle = color;
      ctx.lineWidth = HUD_ATTENTION.BRACKET_WIDTH;
      ctx.globalAlpha = fade;
      ctx.beginPath();
      for (const cr of bracketCorners({ cx: m.ax, cy: m.ay, half: m.half, arm: m.arm })) {
        const q = cr.pts;
        ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); ctx.lineTo(q[4], q[5]);
      }
      ctx.stroke();
      // Nitka od nawiasów do etykiety, dalej podkreślenie pod tekstem (idiom etykiet warstwy).
      const th = threadGeometry(m);
      ctx.lineWidth = R.THREAD_WIDTH;
      ctx.globalAlpha = R.THREAD_ALPHA * fade;
      ctx.beginPath();
      ctx.moveTo(th.x0, th.y0);
      ctx.lineTo(th.x1, th.y1);
      ctx.moveTo(m.attach.x, m.attach.y);
      ctx.lineTo(m.side === 'E' ? m.x + m.w : m.x, m.attach.y);
      ctx.stroke();
      // Pasek pod tekstem i dwie linie: nazwa (albo „???”) i odległość.
      ctx.globalAlpha = R.BAR_ALPHA * fade;
      ctx.fillStyle = THEME.bgPrimary;
      ctx.fillRect(m.x, m.y, m.w, m.h);
      let y = m.y + R.PAD_Y;
      m.lines.forEach((ln, i) => {
        if (i > 0) y += R.LINE_GAP;
        ctx.font = ln.font;
        ctx.fillStyle = color;
        ctx.globalAlpha = (i === 0 ? 1 : R.SUB_ALPHA) * fade;
        ctx.fillText(ln.text, m.x + R.PAD_X, y + ln.size);
        y += ln.h;
      });
    }
    ctx.globalAlpha = 1;
  }

  /** Odczyt dla bramki: bramka i znaczniki z ostatniej klatki (px logiczne). */
  debug() {
    const r1 = (v) => (Number.isFinite(v) ? +v.toFixed(1) : v);
    return {
      id: 'skyLabels', shown: this._gate.shown, reason: this._gate.reason, items: this._prep.items.length,
      markers: this._last.markers.map((m) => ({ id: m.id, name: m.lines?.[0]?.text ?? null, dist: m.lines?.[1]?.text ?? null,
        role: m.role, relation: m.relation, cluster: m.clusterSize, ax: r1(m.ax), ay: r1(m.ay), side: m.side,
        rect: { x: r1(m.x), y: r1(m.y), w: r1(m.w), h: r1(m.h) } })),
    };
  }
}
