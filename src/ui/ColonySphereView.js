// ColonySphereView — kula kolonii w oknie kolonii (ARC COLONY SPHERE, krok CS-7 część B; decyzja właściciela 1 „A":
// kula zastępuje obszar mapy 2D, dzisiejsze panele boczne zostają).
//
// Klej między ColonyOverlay a `ColonySphereRenderer`: z kolonii i stanu okna składa stan pól (budynki, tryb budowy,
// soczewka, zaopatrzenie — `composeSphereOverlay`), rysuje kulę, proste znaczniki budynków (Canvas 2D nad obrazem kuli:
// ikona budynku jak na mapie 2D, poziom, pasek budowy, anomalia, okupacja) i ramę; tłumaczy mysz / klawisze na obrót,
// zoom, soczewkę i picking pola. Jednostki rysuje DZISIEJSZY kod okna (`_drawUnits`) przez `gridAdapter` — siatkę, której
// `tilePixelPos` zwraca rzut pola na ekran (stosy, bitwy, paski HP, zaznaczenia jak na mapie 2D).
//
// ⚠ Kula działa dla siatki `kind === 'geo'` — niezależnie od bieżącej flagi (kolonia geo z zapisu nie ma mapy 2D).
//   Siatka płaska nigdy tu nie trafia: przy fladze OFF okno kolonii nie dotyka tego modułu.
// Moduł bez ColonyOverlay i bez tekstur (ikony budynków wstrzykiwane) — keeper wykonuje go pod node.

import { ColonySphereRenderer } from '../renderer/ColonySphereRenderer.js';
import { SPHERE_TUNING } from '../renderer/ColonySphereLogic.js';
import { geodesicTopology } from '../map/GeodesicTopology.js';
import { composeSphereOverlay, sphereLegend, fallbackColorsOf, nextLens, BUILD_VERDICT } from './ColonySphereOverlayLogic.js';
import { drawSphereChrome, sphereThemeColors } from './ColonySphereChrome.js';
import { TERRAIN_TYPES, evaluatePlacement } from '../map/HexTile.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { ANOMALIES } from '../data/AnomalyData.js';
import { STAR_TYPES } from '../config/GameConfig.js';
import { themeEpoch, THEME } from '../config/ThemeConfig.js';
import EntityManager from '../core/EntityManager.js';

const HOME_SYSTEM = 'sys_home';
const CAPITAL_BUILDING_ID = Object.keys(BUILDINGS).find(id => BUILDINGS[id].isCapital) ?? 'colony_base';
const KEY_TURN_RAD = 0.14;            // obrót klawiszem [rad]
const DOUBLE_CLICK_MS = 350;          // dwuklik w to samo pole → obrót do pola
const MARKER_MIN_FACING = 0.16;       // znaczniki gasną przy limbie
const MARKER_MIN_PX = 7;              // poniżej tego promienia pola znaczników nie rysujemy (stolica — zawsze)
const CAPITAL_ICON_SCALE = 1.6;       // portret stolicy względem portretu zwykłego budynku
const CAPITAL_RING = '#ffc83c';       // złoty pierścień pod portretem stolicy
const OCCUPATION_YEARS = 6 / 12;      // czas przejmowania budynku [lata gry] — jak mapa 2D
const GEO_CAPITAL_NODE_PENALTY = 0.05;   // dopłata do kwadratu szerokości pola (≈ 13° od równika)
const MINI_TUNING = Object.freeze({ ...SPHERE_TUNING, fitFraction: 0.94, spinRate: 0.16, resumeDelayMs: 0, easeInMs: 1 });

/**
 * Co narysować na polu (czyste). Stolica jest WIRTUALNA: `capitalBase = true`, a `buildingId` zostaje pusty albo
 * niesie budynek postawiony na polu stolicy (farma startowa) — portret stolicy to `colony_base` (`isCapital` w danych),
 * nie `buildingId`. Budynek na polu stolicy staje się małą plakietką obok portretu stolicy.
 * @returns {null | {portraitId:string|null, scale:number, capital:boolean, badgeId:string|null}}
 */
export function markerSpecOf(tile) {
  if (tile?.capitalBase) return { portraitId: CAPITAL_BUILDING_ID, scale: CAPITAL_ICON_SCALE, capital: true, badgeId: tile.buildingId ?? null };
  if (tile?.buildingId) return { portraitId: tile.buildingId, scale: 1, capital: false, badgeId: null };
  return null;
}

/** Czy siatka kolonii jest kulą (siatka geodezyjna). */
export function isSphereGrid(grid) { return grid?.kind === 'geo'; }

/** Gwiazda układu ciała → światło kuli ({ colorHex, spectralType, luminosity }). */
export function starOfBody(body) {
  const sid = body?.systemId ?? HOME_SYSTEM;
  let star = null;
  try { star = EntityManager.getByType('star').find(s => (s.systemId ?? HOME_SYSTEM) === sid) ?? null; } catch (e) { star = null; }
  const spec = star?.spectralType ?? 'G';
  const st = STAR_TYPES[spec] ?? STAR_TYPES.G;
  return { colorHex: star?.visual?.color ?? st.color, spectralType: spec, luminosity: st.luminosity ?? 1 };
}

/** Pole widoku startowego: stolica; bez stolicy — pierwszy budynek; inaczej budowalne pole najbliżej równika. */
export function focusTileOf(grid, topo) {
  const tiles = grid.tiles;
  let i = tiles.findIndex(t => t.capitalBase === true);
  if (i >= 0) return i;
  i = tiles.findIndex(t => !!t.buildingId);
  if (i >= 0) return i;
  let best = 0, bd = Infinity;
  for (let k = 0; k < tiles.length; k++) {
    if (!TERRAIN_TYPES[tiles[k].type]?.buildable) continue;
    const d = Math.abs(topo.cy[k]);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

/**
 * Pole pod stolicę NOWEJ kolonii na kuli (odpowiednik `_findBestTileForCapital` mapy 2D: tam „blisko środka mapy",
 * tu blisko równika; równiny / las preferowane ×0,5; ocean i lądolód wykluczone). Remis → niższy indeks pola.
 */
export function bestGeoCapitalTile(grid) {
  const topo = geodesicTopology(grid.n);
  let best = null, bd = Infinity;
  for (let i = 0; i < grid.tiles.length; i++) {
    const tile = grid.tiles[i];
    if (tile.type === 'ocean' || tile.type === 'ice_sheet' || !TERRAIN_TYPES[tile.type]?.buildable) continue;
    let d = topo.cy[i] * topo.cy[i];
    if (tile.type === 'plains' || tile.type === 'forest') d *= 0.5;
    if (topo.isPentagon(i) || tile.anomaly) d += GEO_CAPITAL_NODE_PENALTY;   // pięciokąty to węzły anomalii (D-CS-9) — stolica obok
    if (d < bd) { bd = d; best = tile; }
  }
  return best;
}

/**
 * Werdykt trybu budowy dla pola (ta sama bramka co panel budowy: `evaluatePlacement`).
 * `building` = budynek pod kursorem w menu budowy; null → werdykt ogólny (czy na polu da się cokolwiek postawić).
 */
export function buildVerdictFor(tile, building, ctx = {}) {
  // Zajęte = budynek / budowa / zamówienie (jak `HexTile.isOccupied`); stolica jest wirtualna — jej pole zostaje wolne.
  if (tile.buildingId || tile.underConstruction || tile.pendingBuild) return BUILD_VERDICT.OCCUPIED;
  if (building) return evaluatePlacement(tile, building, ctx).ok ? BUILD_VERDICT.OK : BUILD_VERDICT.BLOCKED;
  return TERRAIN_TYPES[tile.type]?.buildable && !tile.damaged ? BUILD_VERDICT.OK : BUILD_VERDICT.BLOCKED;
}

function sameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class ColonySphereView {
  /**
   * @param {object} [o]
   * @param {() => void} [o.onChange] prośba o przerysowanie okna
   * @param {(buildingId:string) => object|null} [o.getBuildingIcon] obraz PNG budynku (albo null → emoji z danych)
   * @param {(opts:object) => object} [o.createRenderer] fabryka renderera (testy)
   */
  constructor(o = {}) {
    this._onChange = o.onChange ?? (() => {});
    this._getIcon = o.getBuildingIcon ?? (() => null);
    this._mk = o.createRenderer ?? ((opts) => new ColonySphereRenderer(opts));
    this.renderer = this._mk({ onChange: this._onChange });
    this._mini = null;
    this.lens = 'none';
    this._grid = null; this._topoCount = 0;
    this._bytes = null; this._scratch = null;
    this._epoch = null; this._colors = null;
    this._adapter = null; this._adapterGrid = null; this._adapterRect = null;
    this._lastClick = { tile: -1, t: -Infinity };
    this._state = null;
    this._lastPos = new Map();
  }

  /** Przełącz soczewkę klawiszem (brak → Teren → Złoża → Własność → brak). Zwraca nową. */
  cycleLens() { this.lens = nextLens(this.lens); return this.lens; }

  /**
   * Zsynchronizuj kulę ze stanem okna (wołane co klatkę przed `draw`).
   * @param {object} s
   * @param {object} s.colony wpis kolonii (planet, planetId, name)
   * @param {object} s.grid siatka geo kolonii
   * @param {{q:number, r:number}|null} [s.selected] zaznaczone pole
   * @param {boolean} [s.buildMenu] otwarte menu budowy na wolnym polu (tryb budowy)
   * @param {object|null} [s.hoveredBuilding] definicja budynku pod kursorem w menu
   * @param {boolean} [s.supply] pokrycie zaopatrzenia (Shift+S)
   * @param {Map<string, {type:string}>|null} [s.coverage] mapa pokrycia (klucz = id pola grafu)
   * @param {boolean} [s.lock] dodatkowa blokada auto-obrotu (tryby specjalne: desant, ostrzał…)
   * @param {object|null} [s.techSystem] system technologii kolonii (bramka terenu)
   */
  sync(s) {
    const grid = s.grid, planet = s.colony?.planet ?? null, r = this.renderer;
    const n = grid.tiles.length;
    if (this._grid !== grid || r.bodyId !== (planet?.id ?? null)) {
      const focus = focusTileOf(grid, geodesicTopology(grid.n));
      const tr = (typeof window !== 'undefined') ? window.KOSMOS?.threeRenderer : null;
      let airClock = null;
      try { airClock = tr?.bodyAirClock?.(planet?.id) ?? null; } catch (e) { airClock = null; }
      r.setBody({ body: planet, n: grid.n, star: starOfBody(planet), capitalTile: focus, airClock });
      r.setFallbackColors(fallbackColorsOf(grid.tiles));
      this._grid = grid; this._topoCount = n; this._bytes = null; this._scratch = null; this._epoch = null;
      this._adapter = null; this._lastPos.clear();
    }
    const topo = r.topo;
    if (!topo) return;
    if (this._epoch !== themeEpoch()) {
      this._epoch = themeEpoch();
      this._colors = sphereThemeColors(THEME);
      r.setColors(this._colors);
      this._bytes = null;
    }
    const build = !!s.buildMenu;
    const ctx = { techSystem: s.techSystem ?? null, planet };
    let supply = null;
    if (s.supply && s.coverage?.size) {
      supply = new Map();
      for (const [key, info] of s.coverage) {
        const i = typeof key === 'string' && key[0] === 'g' ? Number(key.slice(1)) : NaN;
        if (Number.isInteger(i) && i >= 0 && i < n) supply.set(i, info);
      }
    }
    this._scratch = composeSphereOverlay({
      topo, tiles: grid.tiles, lens: this.lens, supply, accent: this._colors.accentBytes,
      buildVerdict: build ? (tile) => buildVerdictFor(tile, s.hoveredBuilding ?? null, ctx) : null,
    }, this._scratch);
    if (!sameBytes(this._scratch, this._bytes)) {
      this._bytes = (this._bytes && this._bytes.length === this._scratch.length) ? this._bytes : new Uint8Array(this._scratch.length);
      this._bytes.set(this._scratch);
      r.setOverlay(this._bytes);
      r.setFallbackColors(fallbackColorsOf(grid.tiles));
    }
    const sel = s.selected && s.selected.r === -1 && Number.isInteger(s.selected.q) ? s.selected.q : -1;
    r.setMode({ selectedTile: sel, gridAll: build, lock: sel >= 0 || build || !!s.lock, work: build || this.lens !== 'none' || !!s.supply });
    // Rama pokazuje tryb zaopatrzenia od razu po Shift+S — także gdy kolonia nie ma jeszcze żadnego pokrycia.
    this._state = { build, supply: !!s.supply, name: s.colony?.name ?? planet?.name ?? '', archetype: planet?.bodyArchetype ?? null };
  }

  /** Kula + znaczniki budynków + rama. Jednostki dorysowuje gospodarz MIĘDZY `draw` a `drawChrome` (przez `gridAdapter`). */
  draw(ctx, rect) {
    const res = this.renderer.draw(ctx, rect);
    this._drawMarkers(ctx, rect);
    return res;
  }

  drawChrome(ctx, rect) {
    const st = this._state ?? {};
    drawSphereChrome(ctx, rect, {
      title: st.name, archetype: st.archetype, tiles: this._topoCount, lens: this.lens, build: st.build, supply: st.supply,
      legend: sphereLegend({ lens: this.lens, build: st.build, supply: st.supply }), fallback: this.renderer.fallback().fallback,
    });
  }

  /** Promień „heksa" znaczników na ekranie [jednostki gospodarza] (odpowiednik `_hexSize` mapy 2D). */
  markerHexSize(rect) { return this.renderer.tileScreenSize(rect) * 0.5; }

  // Znaczniki budynków: ikona (PNG albo emoji z danych — jak mapa 2D), poziom, pasek budowy, anomalia, pasek okupacji.
  _drawMarkers(ctx, rect) {
    const grid = this._grid, r = this.renderer;
    if (!grid || !r.topo) return;
    const base = this.markerHexSize(rect);
    const small = base < MARKER_MIN_PX;   // za daleko na zwykłe znaczniki — stolica i tak (decyzja właściciela: zawsze widoczna)
    const tiles = grid.tiles;
    ctx.save();
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (small && !tile.capitalBase) continue;
      const hasB = !!tile.buildingId || !!tile.capitalBase;
      const anomaly = tile.anomaly && tile.anomalyDetected;
      const occupying = tile.occupyEmpireId && tile.occupyStart != null;
      if (!hasB && !tile.underConstruction && !anomaly && !occupying) continue;
      const p = r.project(i, rect);
      if (!p || !p.visible || p.facing < MARKER_MIN_FACING) continue;
      const k = Math.sqrt(Math.min(1, p.facing));
      const rad = base * k;
      ctx.globalAlpha = Math.min(1, (p.facing - MARKER_MIN_FACING) * 5);
      if (hasB) {
        const spec = markerSpecOf(tile);
        const size = Math.max(spec.capital ? 18 : 0, rad * 1.25 * spec.scale);
        if (spec.capital) {
          // Złoty pierścień + ciemny dysk pod portretem: stolica czytelna przy domyślnym zoomie i w trakcie obrotu.
          ctx.beginPath(); ctx.arc(p.x, p.y, size * 0.56, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(8,10,14,0.55)'; ctx.fill();
          ctx.lineWidth = Math.max(2, size * 0.07); ctx.strokeStyle = CAPITAL_RING; ctx.stroke();
        }
        this._drawIcon(ctx, spec.portraitId, p.x, p.y, size);
        if (spec.badgeId && rad > 9) {
          const bs = size * 0.42, bx = p.x + size * 0.42, by = p.y + size * 0.36;
          ctx.beginPath(); ctx.arc(bx, by, bs * 0.58, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(8,10,14,0.75)'; ctx.fill();
          ctx.lineWidth = 1; ctx.strokeStyle = CAPITAL_RING; ctx.stroke();
          this._drawIcon(ctx, spec.badgeId, bx, by, bs);
        }
        if (!spec.capital && (tile.buildingLevel ?? 1) > 1 && rad > 12) {
          ctx.font = `bold ${Math.max(7, rad * 0.24)}px ${THEME.fontFamily}`;
          ctx.fillStyle = '#ffd700'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
          ctx.fillText(`${tile.buildingLevel}`, p.x + rad * 0.62, p.y + rad * 0.62);
        }
      }
      if (tile.underConstruction && rad > 10) {
        const prog = Math.max(0, Math.min(1, tile.underConstruction.progress ?? 0));
        const bw = rad * 1.1, bh = Math.max(2, rad * 0.09);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - bw / 2, p.y + rad * 0.42, bw, bh);
        ctx.fillStyle = '#ffdd44'; ctx.fillRect(p.x - bw / 2, p.y + rad * 0.42, bw * prog, bh);
      }
      if (anomaly && rad > 9) {
        const icon = tile.anomalyRevealed ? (ANOMALIES[tile.anomaly]?.icon ?? '⚠') : '❓';
        ctx.font = `${Math.max(8, Math.round(rad * 0.5))}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffdd44';
        ctx.fillText(icon, p.x, hasB ? p.y + rad * 0.36 : p.y);
      }
      if (occupying) {
        const now = (typeof window !== 'undefined' ? window.KOSMOS?.timeSystem?.gameTime : 0) ?? 0;
        const prog = Math.max(0, Math.min(1, (now - tile.occupyStart) / OCCUPATION_YEARS));
        if (prog > 0 && prog < 1) {
          const bw = rad * 1.2, bh = Math.max(2, rad * 0.1);
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - bw / 2, p.y + rad * 0.55, bw, bh);
          ctx.fillStyle = '#D85A30'; ctx.fillRect(p.x - bw / 2, p.y + rad * 0.55, bw * prog, bh);
        }
      }
    }
    ctx.restore();
  }

  // Portret PNG budynku; brak pliku → ikona z danych (jak mapa 2D).
  _drawIcon(ctx, id, x, y, size) {
    const tex = id ? this._getIcon(id) : null;
    if (tex) { ctx.drawImage(tex, x - size / 2, y - size / 2, size, size); return; }
    const icon = BUILDINGS[id]?.icon ?? '';
    if (!icon) return;
    ctx.font = `${Math.max(8, Math.round(size * 0.5))}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(icon, x, y);
  }

  // ── Wejście ─────────────────────────────────────────────────────────────────────────

  /** Pole siatki pod punktem ekranu (albo null). */
  pickTile(x, y, rect, grid = this._grid) {
    const i = this.renderer.pick(x, y, rect);
    return i >= 0 ? (grid?.tiles?.[i] ?? null) : null;
  }

  /** Ruch myszy. `blocked` = kursor nad panelem / przyciskiem okna (kula nie reaguje, auto-obrót może wrócić). */
  pointerMove(x, y, rect, blocked = false) {
    if (blocked && !this.renderer.dragging) { this.renderer.pointerLeave(); return { tile: -1, onSphere: false, dragging: false }; }
    return this.renderer.pointerMove(x, y, rect);
  }

  pointerLeave() { this.renderer.pointerLeave(); }
  dragStart(x, y, rect) { return this.renderer.dragStart(x, y, rect); }
  dragEnd() { return this.renderer.dragEnd(); }
  get dragging() { return this.renderer.dragging; }
  wheel(delta) { this.renderer.wheel(delta); }

  /** Klik w pole: zwraca true, gdy to dwuklik (kula obraca się do pola). */
  clickTile(tile, now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
    const i = tile?.r === -1 ? tile.q : -1;
    const dbl = i >= 0 && this._lastClick.tile === i && now - this._lastClick.t <= DOUBLE_CLICK_MS;
    this._lastClick = dbl ? { tile: -1, t: -Infinity } : { tile: i, t: now };
    if (dbl) this.renderer.turnTo(i);
    return dbl;
  }

  /** Obróć kulę do pola (np. zaznaczenie jednostki z listy). */
  turnToTile(pos) { return pos?.r === -1 ? this.renderer.turnTo(pos.q) : false; }

  /**
   * Klawisze kuli: strzałki / WASD — obrót (gdy bez Shift). Zwraca true, gdy klawisz zużyty.
   * Soczewkę przełącza gospodarz (`cycleLens`) — ma komunikat do pokazania.
   */
  key(key, mods = {}) {
    if (mods.shift || mods.ctrl) return false;
    const r = this.renderer;
    if (key === 'ArrowLeft' || key === 'a') { r.rotateBy(-KEY_TURN_RAD, 0); return true; }
    if (key === 'ArrowRight' || key === 'd') { r.rotateBy(KEY_TURN_RAD, 0); return true; }
    if (key === 'ArrowUp' || key === 'w') { r.rotateBy(0, KEY_TURN_RAD); return true; }
    if (key === 'ArrowDown' || key === 's') { r.rotateBy(0, -KEY_TURN_RAD); return true; }
    return false;
  }

  /**
   * Pozycja pola na ekranie. Pole po niewidocznej stronie kuli → ostatnia widoczna pozycja (panel pola nie skacze),
   * a gdy jej nie ma — brzeg tarczy.
   */
  tileScreenPos(tile, rect) {
    const i = tile?.r === -1 ? tile.q : -1;
    const p = this.renderer.project(i, rect);
    if (p?.visible) { const out = { x: p.x, y: p.y, visible: true }; this._lastPos.set(i, out); return out; }
    const last = this._lastPos.get(i);
    if (last) return { x: last.x, y: last.y, visible: false };
    const d = this.renderer.discOnScreen(rect);
    return { x: d.x + d.r, y: d.y, visible: false };
  }

  /**
   * Siatka dla dzisiejszego rysowania jednostek: `tilePixelPos(q, r)` = rzut pola na ekran względem środka kadru
   * (gospodarz rysuje z kamerą (0, 0)); pole za horyzontem → daleko poza kadrem.
   */
  gridAdapter(grid, rect) {
    if (this._adapterGrid !== grid || !this._adapter) {
      const view = this;
      this._adapter = Object.create(grid);
      this._adapter.tilePixelPos = function tilePixelPos(q, r) {
        const rc = view._adapterRect;
        const p = r === -1 && rc ? view.renderer.project(q, rc) : null;
        if (!p || !p.visible || p.facing < MARKER_MIN_FACING * 0.5) return { x: 1e6, y: 1e6 };
        return { x: p.x - (rc.x + rc.w / 2), y: p.y - (rc.y + rc.h / 2) };
      };
      this._adapterGrid = grid;
    }
    this._adapterRect = rect;
    return this._adapter;
  }

  // ── Mała kula w panelu informacji (zastępuje dekoracyjny globus mapy 2D dla kolonii geo) ───────────────────────────

  /** Narysuj małą, obracającą się kulę tego samego ciała (bez nakładki, bez interakcji). */
  drawMini(ctx, rect, planet, grid) {
    if (!planet || !grid) return;
    if (!this._mini) this._mini = this._mk({ onChange: this._onChange, tuning: MINI_TUNING });
    if (this._mini.bodyId !== planet.id) this._mini.setBody({ body: planet, n: grid.n, star: starOfBody(planet), capitalTile: focusTileOf(grid, geodesicTopology(grid.n)) });
    // Mała kula jest dekoracją: obraca się tylko wtedy, gdy duża się obraca (zatrzymana duża = bezczynne okno, 0 klatek).
    this._mini.setMode({ lock: this.renderer.spinMode !== 'spin' });
    this._mini.draw(ctx, rect);
    this._miniDrawn = true;
  }

  /**
   * Pola kolonii w kolejności od pola pod stolicę (odległość po grafie, remis → indeks) — rozstawienie budynków
   * startowych NOWEJ kolonii macierzystej na kuli: budynki stają przy stolicy, nie rozsiane po globie.
   */
  static tilesNearCapital(grid) {
    const topo = geodesicTopology(grid.n);
    const cap = bestGeoCapitalTile(grid);
    if (!cap) return grid.tiles.slice();
    const c = cap.q;
    return grid.tiles.map((t, i) => i).sort((a, b) => (topo.distance(c, a) - topo.distance(c, b)) || (a - b)).map(i => grid.tiles[i]);
  }

  /** Za ile ms okno ma narysować kolejną klatkę (kula + mała kula); ∞ = bez zmian. */
  nextFrameDelayMs() {
    const a = this.renderer.nextFrameDelayMs();
    const b = this._mini && this._miniDrawn ? this._mini.nextFrameDelayMs() : Infinity;
    this._miniDrawn = false;
    return Math.min(a, b);
  }

  /** Zwolnij konteksty WebGL (okno ukryte). */
  release() {
    this.renderer.release();
    this._mini?.release();
    this._lastClick = { tile: -1, t: -Infinity };
  }
}

/**
 * Wczytaj w tle mapę bohatera stolicy po starcie gry (priorytet bezczynny — za mapami LOD układu). Tylko przy fladze
 * `colonySphere`; brak cache / ciała → ponawia co 2 s, najwyżej przez 5 minut. Zwraca funkcję anulującą.
 */
export const SURFACE_PRIORITY_IDLE = 10;
export function scheduleCapitalHeroPrefetch({ flag, getCache = () => ((typeof window !== 'undefined') ? window.KOSMOS?.surfaceCache : null) ?? null, getBody,
  setTimer = setInterval, clearTimer = clearInterval, everyMs = 2000, tries = 150 } = {}) {
  if (!flag) return () => {};
  let left = tries, id = null;
  const tick = () => {
    const cache = getCache?.(), body = getBody?.();
    if (cache && body) {
      try { cache.request(body, 'hero', SURFACE_PRIORITY_IDLE); } catch (e) { /* cache zamknięty */ }
      clearTimer(id);
    } else if (--left <= 0) clearTimer(id);
  };
  id = setTimer(tick, everyMs);
  return () => clearTimer(id);
}
