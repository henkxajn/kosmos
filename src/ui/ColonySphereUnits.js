// ColonySphereUnits — jednostki naziemne na kuli kolonii (ARC COLONY SPHERE, krok CS-10; plan §3.19, D-CS-14).
//
// Zastępuje rysowanie jednostek kodem mapy 2D na siatce-adapterze (CS-7): na kuli jednostka jest MODELEM GLB stojącym
// na polu (warstwa `ColonyUnitModels` w rendererze kuli), z daleka — zwartym znacznikiem z licznikiem stosu.
// Ten moduł: rozstawienie (`unitPlacements`), wybór LOD, grupy instancji dla renderera oraz HUD Canvas 2D nad obrazem
// (cień-podstawa w barwie strony, paski HP / zaopatrzenia / organizacji / morale, ramka zaznaczenia, plakietki stosów,
// znacznik bitwy na polu spornym, znacznik lądowania desantu). Barwy i warunki pasków — jak mapa 2D.
//
// Kolejność rysowania (gospodarz: `ColonySphereView.draw`): kula → portrety budynków → podstawy jednostek → warstwa
// modeli → HUD. Jednostka zawsze jest NAD portretami; na polu z budynkiem stoi przesunięta na południe (przed portretem).
// Ruch: pozycja z `greatCircleStep` (łuk między środkami pól) — bez interpolacji w przestrzeni ekranu.
// Moduł bez DOM i bez stanu gry — keeper wykonuje go pod node.

import {
  UNIT_VIEW, UNIT_LOD, UNIT_LOD_BIAS, UNIT_COLORS, unitLodOf, unitPlacements, groupUnitInstances, unitMarkerList, unitBarsOf, unitFrameDelayMs,
} from '../renderer/ColonyUnitLogic.js';
import { THEME } from '../config/ThemeConfig.js';

const READY = 'ready';
const clockNow = () => ((typeof performance !== 'undefined') ? performance.now() : Date.now());

export class ColonySphereUnits {
  /** @param {{ renderer: object, now?: () => number }} o */
  constructor(o = {}) {
    this.renderer = o.renderer;
    this._now = o.now ?? clockNow;
    this.lodBias = UNIT_LOD_BIAS.AUTO;
    this._landings = new Map();      // id jednostki → czas lądowania [ms]
    this._frame = null;              // ostatni stan klatki (sync)
    this._stats = { ms: [], models: 0, markers: 0, frames: 0, lod: null };
  }

  /** Przełącz podgląd LOD: auto → zawsze modele → zawsze znaczniki → auto. Zwraca nowy tryb. */
  cycleLod() {
    const order = [UNIT_LOD_BIAS.AUTO, UNIT_LOD_BIAS.MODELS, UNIT_LOD_BIAS.MARKERS];
    this.lodBias = order[(order.indexOf(this.lodBias) + 1) % order.length];
    return this.lodBias;
  }

  /** Zapisz lądowanie desantu (zdarzenie `invasion:troopsLanded`) — model opada na pole, nad polem znacznik. */
  noteLanding(unitIds, now = this._now()) {
    for (const id of unitIds ?? []) this._landings.set(id, now);
  }

  /**
   * Stan jednostek klatki — PRZED rysunkiem kuli (renderer musi znać instancje przed `draw`).
   * @param {object} s
   * @param {object[]} s.units jednostki ciała po regule widoczności gospodarza
   * @param {object} s.grid siatka geo kolonii
   * @param {object} [s.archetypes] UNIT_ARCHETYPES
   * @param {string|null} [s.selectedId] zaznaczona jednostka
   * @param {Set<string>} [s.selectedIds] zaznaczenie wielokrotne
   * @param {boolean} [s.paused] gra zapauzowana (marsz stoi — bez zamawiania klatek ruchu)
   * @param {{x:number,y:number,w:number,h:number}} rect kadr kuli
   */
  sync(s, rect) {
    const r = this.renderer, topo = r?.topo;
    if (!topo || !rect) { this._frame = null; r?.setUnits?.(null); return; }
    const now = this._now();
    for (const [id, t0] of this._landings) if (now - t0 >= UNIT_VIEW.landingMs) this._landings.delete(id);
    const placement = unitPlacements({ units: s.units ?? [], topo, tiles: s.grid?.tiles ?? null, archetypes: s.archetypes ?? null, landings: this._landings, now });
    const tilePx = r.tileScreenSize(rect);
    const lod = unitLodOf(tilePx, { bias: this.lodBias, gl: r.unitModelsAvailable?.() ?? false });
    const modelIds = new Set();
    let groups = null;
    if (lod === UNIT_LOD.MODEL) {
      const ready = placement.items.filter(it => it.shown && it.key && r.unitModelState(it.key, it.candidates) === READY);
      for (const it of ready) modelIds.add(it.id);
      groups = groupUnitInstances(ready);
    }
    r.setUnits?.(groups);
    const markers = unitMarkerList(placement, lod === UNIT_LOD.MARKER ? undefined : (it) => it.shown && !modelIds.has(it.id));
    this._frame = { placement, lod, tilePx, modelIds, markers, selectedId: s.selectedId ?? null, selectedIds: s.selectedIds ?? null, paused: !!s.paused, now };
  }

  /** Za ile ms narysować kolejną klatkę z powodu jednostek (marsz przy płynącym czasie, lądowanie, puls bitwy). */
  nextFrameDelayMs() {
    const f = this._frame;
    if (!f) return Infinity;
    if (f.paused && f.placement.moving > 0) return unitFrameDelayMs({ ...f.placement, moving: 0 });
    return unitFrameDelayMs(f.placement);
  }

  /** Rysunek jednostek nad kulą i portretami budynków. */
  draw(ctx, rect) {
    const f = this._frame, r = this.renderer;
    if (!f || !ctx) return;
    const t0 = clockNow();
    const C = UNIT_COLORS, T = UNIT_VIEW;
    const proj = (dir, radius = 1) => r.projectDirection(dir[0], dir[1], dir[2], rect, radius);
    const spacing = Math.sqrt(4 * Math.PI / r.topo.count);
    const models = [];
    ctx.save();

    // 1. Podstawy (cień w barwie strony) — pod warstwą modeli.
    for (const it of f.placement.items) {
      if (!f.modelIds.has(it.id)) continue;
      const p = proj(it.dir);
      if (!p.visible || p.facing < T.minFacing) continue;
      const size = it.share * f.tilePx;
      models.push({ it, p, size });
      // Koło na gruncie widziane pod kątem: spłaszczenie = cos kąta patrzenia (`facing`); z góry — pełne koło.
      const rx = size * 0.62, ry = rx * Math.max(0.25, p.facing);
      const g = ctx.createRadialGradient?.(p.x, p.y, 0, p.x, p.y, rx);
      ctx.save();
      ctx.translate(p.x, p.y); ctx.scale(1, ry / rx); ctx.translate(-p.x, -p.y);
      if (g) {
        const rgb = it.enemy ? '216,90,48' : '100,160,255';
        g.addColorStop(0, `rgba(${rgb},0.55)`); g.addColorStop(0.6, `rgba(${rgb},0.22)`); g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
      } else ctx.fillStyle = it.enemy ? C.enemy : C.own;
      ctx.beginPath(); ctx.arc(p.x, p.y, rx, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // Obrys podstawy w barwie strony — widać go także wtedy, gdy model oglądany z góry zasłania poświatę.
      ctx.strokeStyle = it.enemy ? 'rgba(216,90,48,0.9)' : 'rgba(100,160,255,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    }

    // 2. Warstwa modeli GLB (obraz z renderera kuli).
    r.drawUnits?.(ctx, rect);

    // 3. HUD modeli: zaznaczenie, paski, postęp skanu.
    for (const m of models) {
      const { it, p, size } = m, u = it.unit;
      const head = proj(it.dir, 1 + (it.height || 0) + it.share * spacing * 0.95);
      const sel = f.selectedId === it.id, multi = !!f.selectedIds?.has?.(it.id);
      if (sel || multi) {
        const rx = size * 0.74, ry = rx * Math.max(0.25, p.facing);
        ctx.strokeStyle = it.enemy ? C.enemyEdge : C.ownEdge; ctx.lineWidth = sel ? 2.5 : 1.5;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      }
      this._drawBars(ctx, u, head.x, Math.min(head.y, p.y - size * 0.5) - 4, Math.max(18, size * 0.7));
      if (u.status === 'scanning' && u.mission) this._drawBar(ctx, p.x, p.y + size * 0.3, Math.max(18, size * 0.7), 3, Math.max(0, Math.min(1, u.mission.progress)), C.scan);
      if (it.landing > 0) this._drawLanding(ctx, p, head, size, it.landing, f.now);
    }

    // 4. Zwarte znaczniki (LOD daleki, model niegotowy / brak pliku).
    const ms = Math.max(T.markerPx[0], Math.min(T.markerPx[1], f.tilePx * T.markerShare));
    let markers = 0;
    for (const mk of f.markers) {
      const p = proj(mk.dir);
      if (!p.visible || p.facing < T.minFacing) continue;
      const x = p.x + mk.side * ms * 0.62, y = p.y;
      const sel = mk.ids.some(id => id === f.selectedId || f.selectedIds?.has?.(id));
      this._drawMarker(ctx, x, y, ms, mk.enemy, mk.count, sel);
      const first = f.placement.items.find(it => it.id === mk.ids[0]);
      if (first && mk.count === 1) this._drawBars(ctx, first.unit, x, y - ms * 0.72 - 4, ms * 1.3);
      if (first?.landing > 0) this._drawLanding(ctx, { x, y }, { x, y: y - ms }, ms, first.landing, f.now);
      markers++;
    }

    // 5. Stosy i bitwy (modele): licznik strony przy > 1 jednostce, znacznik bitwy na polu spornym.
    for (const st of f.placement.stacks) {
      const p = proj(st.dir);
      if (!p.visible || p.facing < T.minFacing) continue;
      if (st.contested) this._drawBattle(ctx, p.x, p.y - Math.max(ms, f.tilePx * 0.42), Math.max(12, Math.min(26, f.tilePx * 0.24)), f.now);
      if (f.lod !== UNIT_LOD.MODEL) continue;
      const by = p.y + f.tilePx * 0.3, dx = st.contested ? f.tilePx * 0.26 : 0;
      if (st.own > 1 || (st.contested && st.own > 0)) this._drawBadge(ctx, p.x - dx, by, String(st.own), C.own);
      if (st.enemy > 1 || (st.contested && st.enemy > 0)) this._drawBadge(ctx, p.x + dx, by, String(st.enemy), C.enemy);
    }
    ctx.restore();

    const st = this._stats;
    st.ms.push(clockNow() - t0); if (st.ms.length > 240) st.ms.shift();
    st.models = models.length; st.markers = markers; st.frames++; st.lod = f.lod;
  }

  _drawBar(ctx, cx, y, w, h, pct, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - w / 2, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(cx - w / 2, y, Math.round(w * pct), h);
  }

  _drawBars(ctx, unit, cx, bottomY, w) {
    const bars = unitBarsOf(unit);
    let y = bottomY;
    for (let i = bars.length - 1; i >= 0; i--) {
      const b = bars[i], h = b.thick ? 3 : 2;
      y -= h + 1;
      this._drawBar(ctx, cx, y, w, h, b.pct, b.color);
    }
  }

  _drawMarker(ctx, x, y, s, enemy, count, selected) {
    const C = UNIT_COLORS, col = enemy ? C.enemy : C.own, edge = enemy ? C.enemyEdge : C.ownEdge, r = s / 2;
    ctx.fillStyle = 'rgba(6,10,18,0.82)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    if (selected) { ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke(); }
    // Trójkąt wierzchołkiem w dół — znak jednostki z mapy 2D.
    const t = r * 0.56;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x - t, y - t * 0.7); ctx.lineTo(x + t, y - t * 0.7); ctx.lineTo(x, y + t * 0.9); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.stroke();
    if (count > 1) this._drawBadge(ctx, x + r * 0.9, y + r * 0.8, String(count), col);
  }

  _drawBadge(ctx, x, y, label, color) {
    const h = 13, w = Math.max(h, 7 + label.length * 6);
    ctx.fillStyle = 'rgba(6,10,18,0.9)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, 4); else ctx.rect(x - w / 2, y - h / 2, w, h);
    ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `bold 10px ${THEME.fontFamily}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 0.5);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // Znacznik bitwy: skrzyżowane ostrza (wektor, bez emoji), puls jak ⚔ mapy 2D.
  _drawBattle(ctx, x, y, s, now) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 300);
    ctx.save();
    ctx.globalAlpha = 0.65 + 0.3 * pulse;
    ctx.lineCap = 'round';
    for (const [w, col] of [[4.5, '#000000'], [2.2, UNIT_COLORS.battle]]) {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.5, y - s * 0.5); ctx.lineTo(x + s * 0.5, y + s * 0.5);
      ctx.moveTo(x + s * 0.5, y - s * 0.5); ctx.lineTo(x - s * 0.5, y + s * 0.5);
      // jelce
      ctx.moveTo(x + s * 0.12, y + s * 0.44); ctx.lineTo(x + s * 0.44, y + s * 0.12);
      ctx.moveTo(x - s * 0.12, y + s * 0.44); ctx.lineTo(x - s * 0.44, y + s * 0.12);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Znacznik lądowania: pierścień na polu + szewrony opadające nad jednostką; gaśnie z czasem.
  _drawLanding(ctx, foot, head, size, k, now) {
    const col = UNIT_COLORS.landing;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.4));
    ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    const ring = size * (0.55 + 0.35 * ((now / 700) % 1));
    ctx.beginPath(); ctx.ellipse(foot.x, foot.y, ring, ring * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    const w = Math.max(5, size * 0.2), top = Math.min(head.y, foot.y - size * 0.6) - 8;
    for (let i = 0; i < 3; i++) {
      const y = top - i * (w * 0.9) + ((now / 180) % (w * 0.9));
      ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.4)) * (1 - i * 0.28);
      ctx.beginPath(); ctx.moveTo(foot.x - w, y - w * 0.6); ctx.lineTo(foot.x, y); ctx.lineTo(foot.x + w, y - w * 0.6); ctx.stroke();
    }
    ctx.restore();
  }

  info() {
    const f = this._frame, ms = this._stats.ms.slice().sort((a, b) => a - b);
    return {
      lod: f?.lod ?? null, lodBias: this.lodBias, tilePx: f?.tilePx ?? 0, units: f?.placement.items.length ?? 0, models: f?.modelIds.size ?? 0,
      markers: f?.markers.length ?? 0, stacks: f?.placement.stacks.length ?? 0, battles: f?.placement.stacks.filter(s => s.contested).length ?? 0,
      moving: f?.placement.moving ?? 0, landing: f?.placement.landing ?? 0, hudMsMedian: ms.length ? ms[ms.length >> 1] : null, frames: this._stats.frames,
    };
  }
}

export default ColonySphereUnits;
