// HudGalaxyLabelLayer — ARC GALAXY, krok G1 (docs/design/GALAXY_PLAN.md §4 G1, HUD S0): podwarstwa NAZW płyty galaktyki
// warstwy HUD 2D (`HudLayer`, lista podwarstw trybu galaktyki — w trybie układu nie biegnie wcale).
//   • nazwa WERSALIKAMI pod każdą gwiazdą z ujawnioną nazwą (`reveal.name` — kanon `SystemReveal`, składany
//     w `SystemRevealWorld`) albo z własną obecnością gracza (ta sama reguła co lista lewego outlinera trybu galaktyki —
//     `GalaxyOutlinerLogic`); „???” nigdy — gwiazda bez nazwy zostaje goła;
//   • role motywu (H0): własny (dom albo układ z obecnością gracza) `primary`, zbadany `textPrimary`, niezbadany `dim`
//     (reguła etykiet nieba — `HudSkyLabelLogic`);
//   • istniejący anti-overlap warstwy etykiet (`placeLabels`) z kandydatem „pod gwiazdą, wyśrodkowana” na pierwszym miejscu
//     (`GalaxyModeLogic.galaxyLabelCandidates`); gwiazdy płyty są przeszkodami (etykieta nie przykrywa sąsiada); zaznaczona
//     i dom kładzione najpierw (priorytet);
//   • nawiasy ⌜⌟ wokół gwiazdy zaznaczonej (rola `primary`); klik w nazwę = klik w gwiazdę (strefa HUD przed wyborem płyty);
//   • twarde cięcie: cała podwarstwa rozjaśnia się w `GALAXY_FADE_MS` od wejścia w tryb (ten sam zegar co płyta).
// Bez rozwinięcia najechania i bez przypięcia (G2).
// ⚠ Moduł importuje się pod node (keeper `galaxy_pick_smoke` — atrapa świata): bez three i bez DOM.
import { THEME } from '../config/ThemeConfig.js';
import { getLocale } from '../i18n/i18n.js';
import { themeToken } from './HudPalette.js';
import { HUD_LABELS, placeLabels, threadGeometry, updateBorn, fadeAlpha, pointInRect, resolveLabelClick } from './HudLabelLogic.js';
import { HUD_ATTENTION, bracketCorners } from './HudAttentionLogic.js';
import { skyLabelRelation, skyLabelRole, skyLabelColor } from './HudSkyLabelLogic.js';
import { galaxyLabelCandidates, galaxyLabelPrio, galaxyLabelText, GALAXY_FADE_MS } from './GalaxyModeLogic.js';
import { galaxyWorldContext } from './GalaxyOutlinerLogic.js';
import { isSystemExplored, HOME_SYSTEM_ID } from '../utils/SystemExploration.js';

// Rysunek i układ (px logiczne). Strojenie okiem — stałe rysunku bez pinów keepera.
export const HUD_GALAXY_LABELS = Object.freeze({
  STAR_CLEAR_PX: 5,        // prześwit wokół gwiazdy (kandydat „pod” zaczyna się niżej)
  GAP_BELOW_PX: 3,         // odstęp nazwy pod gwiazdą
  STAR_OBSTACLE_PX: 4,     // promień gwiazdy jako przeszkoda etykiet
  BRACKET_HALF: 9,         // połowa boku nawiasów zaznaczonej gwiazdy
  LETTER_SPACING: 1,       // wersaliki — odstęp liter (px)
  WORLD_TTL_MS: 250,       // pamięć kontekstu świata (obecność gracza) — `prepare` biegnie co klatkę
});

const MEASURE_CACHE_MAX = 600;

export class HudGalaxyLabelLayer {
  constructor(hud = null) {
    this._hud = hud;
    this.mode = 'galaxy';                 // `HudLayer`: lista podwarstw trybu galaktyki
    this._prep = { on: false, items: [], sel: null };
    this._last = { labels: [], bracket: null };
    this._candPrev = new Map();
    this._born = new Map();
    this._measure = new Map();
    this._sysRef = null;
    this._byId = new Map();
    this._world = null;
    this._worldT = -Infinity;
  }

  _width(font, size, s, spacing) {
    const k = font + '|' + spacing + '|' + s;
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
    w += spacing * Math.max(0, s.length - 1);
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

  // Kontekst świata (obecność gracza, kanon mgły) — co najwyżej raz na WORLD_TTL_MS czasu realnego.
  _worldCtx(K, now) {
    if (!this._world || !(now - this._worldT < HUD_GALAXY_LABELS.WORLD_TTL_MS) || this._world.__K !== K) {
      this._world = galaxyWorldContext(K, { groundUnits: K?.uiManager?._outlinerState?.groundUnits ?? [] });
      this._world.__K = K;
      this._worldT = now;
    }
    return this._world;
  }

  /** Tryb galaktyki aktywny i gwiazdy płyty z treścią etykiet — część klucza klatki. */
  prepare(F) {
    const K = F.K, gm = K?.galaxyMode, tr = K?.threeRenderer;
    if (gm?.isActive !== true || typeof tr?.getGalaxyStarsWorld !== 'function') {
      this._prep = { on: false, items: [], sel: null };
      return 'gal:0';
    }
    const stars = tr.getGalaxyStarsWorld();
    const byId = this._systems(K);
    const world = this._worldCtx(K, F.now);
    const sel = gm.selectedSystemId ?? null;
    const loc = getLocale();
    const items = [];
    for (const st of stars) {
      const id = String(st.id);
      const sys = byId.get(id) ?? null;
      const home = id === HOME_SYSTEM_ID || sys?.isHome === true;
      const own = home || world.presence.get(id)?.own === true;
      let named = own;
      if (!named) { try { named = world.reveal(sys).name === true; } catch { named = false; } }
      const relation = skyLabelRelation({ own, explored: isSystemExplored(sys) });
      items.push({ id, w: st, sys, home, selected: id === sel, relation, role: skyLabelRole(relation),
        text: named ? galaxyLabelText(sys?.name ?? id, loc) : null, distLy: Number(sys?.distanceLY) || 0 });
    }
    let key = `gal:1:${sel ?? ''}:${loc}:${Math.round(F.now - (tr._galaxyFadeT0 ?? 0)) < GALAXY_FADE_MS ? 'f' : 's'}`;
    for (const it of items) key += `|${it.id}:${it.role}:${it.text ? 1 : 0}`;
    this._prep = { on: true, items, sel };
    return key;
  }

  /** Geometria (px logiczne): rzut gwiazd, rozkład nazw, nawiasy zaznaczonej. */
  collect(F, proj) {
    const P = this._prep;
    if (!P.on || !proj) {
      this._born.clear();
      this._last = { labels: [], bracket: null };
      return { count: 0, animating: false, labels: [], bracket: null };
    }
    const K = F.K, tr = K?.threeRenderer, map = F.mapRect, G = HUD_GALAXY_LABELS, R = HUD_LABELS;
    const pts = [];
    for (const it of P.items) {
      const p = proj.point(it.w.x, it.w.y, it.w.z);
      if (p) pts.push({ ...it, x: p.x, y: p.y });
    }
    const obstacles = pts.map((p) => ({ cx: p.x, cy: p.y, r: G.STAR_OBSTACLE_PX, id: p.id }));
    const size = (THEME.fontSizeNormal ?? 11) + R.MAIN_SIZE_DELTA;
    const font = `${size}px ${THEME.fontFamily}`;
    const items = [];
    for (const p of pts) {
      if (!p.text || !pointInRect(p.x, p.y, map)) continue;
      const w = this._width(font, size, p.text, G.LETTER_SPACING) + 2 * R.PAD_X;
      const h = size + 3 + 2 * R.PAD_Y;
      items.push({ key: 'g:' + p.id, id: p.id, ax: p.x, ay: p.y, clear: G.STAR_CLEAR_PX, gapBelow: G.GAP_BELOW_PX, w, h,
        prio: galaxyLabelPrio({ selected: p.selected, home: p.home, relation: p.relation, distLy: p.distLy }),
        ownObstacle: obstacles.find((o) => o.id === p.id) ?? null, text: p.text, role: p.role, size, font });
    }
    const { placed } = placeLabels(items, { rect: map, obstacles, prev: this._candPrev, candidatesOf: galaxyLabelCandidates });
    this._candPrev = new Map(placed.map((p) => [p.key, p.cand]));
    const fading = updateBorn(this._born, placed.map((p) => p.key), F.now);
    const modeK = Math.min(1, Math.max(0, (F.now - (tr?._galaxyFadeT0 ?? -Infinity)) / GALAXY_FADE_MS));
    const labels = placed.map((p) => ({ ...p, fade: fadeAlpha(F.now, this._born.get(p.key)) * modeK }));
    let bracket = null;
    const selP = P.sel != null ? pts.find((p) => p.id === String(P.sel)) : null;
    if (selP && pointInRect(selP.x, selP.y, map)) {
      const half = G.BRACKET_HALF;
      bracket = { id: selP.id, cx: selP.x, cy: selP.y, half,
        arm: Math.max(1, Math.min(HUD_ATTENTION.BRACKET_ARM_PX, 2 * half * HUD_ATTENTION.BRACKET_ARM_FRAC)), fade: modeK };
    }
    this._last = { labels, bracket };
    return { count: labels.length + (bracket ? 1 : 0), animating: fading || modeK < 1, labels, bracket };
  }

  draw(ctx, F, c) {
    const R = HUD_LABELS, G = HUD_GALAXY_LABELS;
    const roles = F.roles;
    const textPrimary = themeToken(THEME, 'textPrimary');
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.setLineDash([]);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if (c.bracket) {
      const b = c.bracket;
      ctx.strokeStyle = roles.primary;
      ctx.lineWidth = HUD_ATTENTION.BRACKET_WIDTH;
      ctx.globalAlpha = b.fade ?? 1;
      ctx.beginPath();
      for (const cr of bracketCorners({ cx: b.cx, cy: b.cy, half: b.half, arm: b.arm })) {
        const q = cr.pts;
        ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); ctx.lineTo(q[4], q[5]);
      }
      ctx.stroke();
    }
    for (const m of c.labels ?? []) {
      const fade = m.fade ?? 1;
      if (!(fade > 0)) continue;
      const color = skyLabelColor(m.role, roles, textPrimary);
      if (m.side !== 'C') {
        // Kandydat zastępczy (nazwa nie zmieściła się pod gwiazdą) — nitka od gwiazdy, jak etykiety warstwy.
        const th = threadGeometry(m);
        ctx.strokeStyle = color;
        ctx.lineWidth = R.THREAD_WIDTH;
        ctx.globalAlpha = R.THREAD_ALPHA * fade;
        ctx.beginPath();
        ctx.moveTo(th.x0, th.y0);
        ctx.lineTo(th.x1, th.y1);
        ctx.stroke();
      }
      ctx.globalAlpha = R.BAR_ALPHA * fade;
      ctx.fillStyle = THEME.bgPrimary;
      ctx.fillRect(m.x, m.y, m.w, m.h);
      ctx.font = m.font;
      ctx.fillStyle = color;
      ctx.globalAlpha = fade;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${G.LETTER_SPACING}px`;
      ctx.fillText(m.text, m.x + R.PAD_X, m.y + R.PAD_Y + m.size);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }
    ctx.globalAlpha = 1;
  }

  _zoneAt(x, y) {
    const zones = (this._last.labels ?? []).map((l) => ({ x: l.x, y: l.y, w: l.w, h: l.h, id: l.id }));
    return resolveLabelClick(zones, x, y);
  }

  /** Klik w nazwę = klik w jej gwiazdę (zaznaczenie; dwuklik — wejście) — strefa HUD przed wyborem płyty. */
  handleClick(x, y) {
    const z = this._zoneAt(x, y);
    if (!z) return false;
    const K = (typeof window !== 'undefined') ? window.KOSMOS : null;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    K?.galaxyMode?.onPlateClick?.(z.id, now);
    return true;
  }

  coversPoint(lx, ly) { return !!this._zoneAt(lx, ly); }
  coversUiPoint(lx, ly) { return !!this._zoneAt(lx, ly); }

  /** Odczyt bramki: etykiety i nawiasy ostatniej klatki (px logiczne). */
  debug() {
    const r1 = (v) => (Number.isFinite(v) ? +v.toFixed(1) : v);
    return {
      id: 'galaxyLabels', on: this._prep.on, items: this._prep.items.length,
      named: this._prep.items.filter((i) => i.text).length,
      labels: this._last.labels.map((l) => ({ id: l.id, text: l.text, role: l.role, side: l.side, x: r1(l.x), y: r1(l.y), w: r1(l.w), h: r1(l.h) })),
      bracket: this._last.bracket ? { id: this._last.bracket.id, cx: r1(this._last.bracket.cx), cy: r1(this._last.bracket.cy) } : null,
    };
  }
}
