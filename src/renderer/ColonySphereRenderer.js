// ColonySphereRenderer — bohater kuli kolonii (ARC COLONY SPHERE, krok CS-7; plan §2, §3.15, D-CS-11).
//
// • Wzór ShipHologramRenderer: własny WebGLRenderer na płótnie poza DOM, tworzony leniwie przy pierwszym rysunku i
//   zwalniany w `release()`. Obraz trafia do płótna UI przez `ctx.drawImage` w prostokąt podany przez gospodarza.
// • TEN SAM shader powierzchni, atmosfery i chmur co mapa układu (SurfaceShader / SurfaceAirShader, te same wyglądy
//   `resolveSurfaceLook` / `resolveAirLook`, to samo mapowanie tonów) — ciało wygląda tak samo na obu ekranach.
// • Mapa: najpierw powiększona mapa LOD mapy układu (z SurfaceCache — zwykle już jest), potem mapa bohatera 1024×512
//   z krótkim przenikaniem (dwie siatki, stały współczynnik mieszania — shader nietknięty).
// • Kula stoi, kamera krąży (lon / lat / odległość), światło gwiazdy idzie za kamerą — patrz ColonySphereLogic.
// • Render NA ŻĄDANIE: bez zmian `draw` tylko komponuje ostatnią klatkę; auto-obrót i pogoda renderują w obniżonym
//   tempie (`frameIntervalMs`). Ukryty gospodarz nie woła `draw` → 0 pracy.
// • Fallback 2D (Canvas): kontekst się nie utworzył / został utracony / render rzucił → ta sama kamera i ten sam picking,
//   pola rysowane jako wielokąty w barwach terenu. Nigdy nie rzuca w pętlę UI.
// • Wszystko, co dotyka świata (THREE, kontekst, płótno, zegar, cache map, tempo pogody), jest wstrzykiwane — keeper
//   `colony_sphere_hero_smoke` wykonuje klasę pod node.

import * as THREE_NS from 'three';
import { SurfaceShader } from './SurfaceShader.js';
import { SurfaceAirShader } from './SurfaceAirShader.js';
import { ColonySphereOverlayShader as OV } from './ColonySphereOverlayShader.js';
import { resolveSurfaceLook, surfaceSeaLevelOf } from '../utils/SurfacePaletteLogic.js';
import { resolveAirLook, isStarLocked, substellarDirOf, weatherRate } from '../utils/SurfaceAirLogic.js';
import { geodesicTopology } from '../map/GeodesicTopology.js';
import {
  SPHERE_TUNING, SPHERE_LIGHT, MAP_PHASE, SPIN_MODE, sphereLight, viewOver, zoomRange, applyWheel, applyDrag, clampLat, pickDir, nearestTile,
  projectDir, discRadiusNdc, sunDirFor, turnStep, createSpin, stepSpin, mapSwapStep, crossProgress, frameIntervalMs,
  shouldRenderFrame, colonyHaze, buildTileMesh, createOverlayData, OVERLAY_ROWS,
} from './ColonySphereLogic.js';

const MAX_DT_S = 0.1;            // klamra kroku animacji [s] (po przerwie w rysowaniu nic nie skacze)
const MAX_PIXELS = 2.4e6;        // limit pikseli płótna GL (większy kadr jest skalowany przy składaniu)
const SUN_DISTANCE = 1000;       // odległość „gwiazdy" od środka kuli [promienie ciała] (światło prawie równoległe)
const BACKGROUND_HEX = 0x020408; // tło kadru = tło okna kolonii

function defaultCreateCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  return c;
}

function defaultCreateGL(THREE, canvas) {
  const r = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.toneMapping = THREE.ACESFilmicToneMapping;          // jak mapa układu (ThreeRenderer)
  r.toneMappingExposure = SPHERE_LIGHT.exposure;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.setClearColor(BACKGROUND_HEX, 1);
  return r;
}

function defaultWeatherRate() {
  const ts = (typeof window !== 'undefined') ? window.KOSMOS?.timeSystem : null;
  return ts ? weatherRate(ts.multiplier, ts.isPaused) : 1;
}

const smooth = (p) => (p <= 0 ? 0 : (p >= 1 ? 1 : p * p * (3 - 2 * p)));

export class ColonySphereRenderer {
  /**
   * @param {object} [o]
   * @param {object} [o.THREE] przestrzeń nazw three (domyślnie import 'three')
   * @param {(canvas:object) => object} [o.createGL] tworzy WebGLRenderer (rzuca, gdy brak kontekstu)
   * @param {(w:number, h:number) => object} [o.createCanvas]
   * @param {() => number} [o.now] zegar [ms]
   * @param {() => void} [o.onChange] prośba o przerysowanie gospodarza (mapa gotowa, utrata kontekstu…)
   * @param {() => object|null} [o.getCache] SurfaceCache (domyślnie window.KOSMOS.surfaceCache)
   * @param {() => number} [o.getWeatherRate] mnożnik zegara pogody (pauza gry = 0)
   * @param {object} [o.tuning] pokrętła (domyślnie wspólne SPHERE_TUNING)
   */
  constructor(o = {}) {
    this._THREE = o.THREE ?? THREE_NS;
    this._createGL = o.createGL ?? ((canvas) => defaultCreateGL(this._THREE, canvas));
    this._createCanvas = o.createCanvas ?? defaultCreateCanvas;
    this._now = o.now ?? (() => performance.now());
    this._onChange = o.onChange ?? (() => {});
    this._getCache = o.getCache ?? (() => ((typeof window !== 'undefined') ? window.KOSMOS?.surfaceCache : null) ?? null);
    this._getWeatherRate = o.getWeatherRate ?? defaultWeatherRate;
    this.tuning = o.tuning ?? SPHERE_TUNING;

    this._body = null; this._bodyKey = null; this._topo = null; this._star = {};
    this._look = null; this._airLook = null; this._sea = -1; this._lockedDir = null;
    this._capital = -1;
    this._view = { lon: 0, lat: 0, dist: 4 }; this._distTarget = 4; this._range = { near: 2, far: 4 }; this._aspect = 0;
    this._viewInit = false;
    this._turn = null;
    this._spin = createSpin(0);
    this._hover = { on: false, tile: -1, dir: null };
    this._drag = null;
    this._mode = { selectedTile: -1, gridAll: false, lock: false, work: false };
    this._overlay = null; this._overlayDirty = false;
    this._colors = null;
    this._fallbackColors = null;
    this._air = null;                    // { angle, phase } — zegar pogody
    this._mapPhase = MAP_PHASE.NONE; this._mapFade = false; this._crossT0 = null; this._requested = false;
    this._forced = false;

    this._gl = null; this._canvas = null; this._glFailed = false; this._glError = null; this._ctxLost = false; this._lostCount = 0;
    this._listeners = null; this._scene = null; this._obj = null;
    this._devW = 0; this._devH = 0;
    this._dirty = true; this._lastNow = null; this._lastRenderT = -Infinity;
    this._renders = 0; this._composites = 0; this._renderMs = []; this._measureSync = false;
  }

  // ── API gospodarza ─────────────────────────────────────────────────────────────────────

  get topo() { return this._topo; }
  get bodyId() { return this._body?.id ?? null; }
  get view() { return this._view; }
  get hoverTile() { return this._hover.on ? this._hover.tile : -1; }
  get mapPhase() { return this._mapPhase; }
  get spinMode() { return this._spin.mode; }

  /**
   * Ustaw ciało i siatkę. Powtórne wywołanie z tym samym ciałem i tą samą siatką niczego nie przebudowuje.
   * @param {object} spec
   * @param {object} spec.body encja ciała (id, type, surfaceSeed, bodyArchetype, …)
   * @param {number} spec.n częstość siatki geodezyjnej (GeodesicGrid.n)
   * @param {{colorHex?:number, spectralType?:string, luminosity?:number}} [spec.star] gwiazda układu ciała
   * @param {number} [spec.capitalTile] indeks pola stolicy (widok startowy); −1 / brak = pole 0
   * @param {{angle:number, phase:number}} [spec.airClock] zegar pogody ciała z mapy układu (ciągłość chmur)
   * @returns {boolean} true, gdy ciało ma wygląd wspólnego shadera (inaczej kula pójdzie fallbackiem 2D)
   */
  setBody(spec) {
    const body = spec?.body ?? null;
    const key = body ? `${body.id}|${body.surfaceSeed}|${body.bodyArchetype}|${spec.n}` : null;
    if (key === this._bodyKey) return !!this._look;
    this._disposeScene();
    this._body = body; this._bodyKey = key;
    this._topo = body && Number.isInteger(spec.n) ? geodesicTopology(spec.n) : null;
    this._star = spec?.star ?? {};
    this._look = null; this._airLook = null; this._sea = -1; this._lockedDir = null;
    if (body) {
      try { this._look = resolveSurfaceLook(body, this._star.spectralType); } catch (e) { this._look = null; }
      try { this._airLook = this._look ? resolveAirLook(body) : null; } catch (e) { this._airLook = null; }
      try { this._sea = surfaceSeaLevelOf(body); } catch (e) { this._sea = -1; }
      if (isStarLocked(body)) { try { this._lockedDir = substellarDirOf(body); } catch (e) { this._lockedDir = [1, 0, 0]; } }
    }
    this._capital = Number.isInteger(spec?.capitalTile) ? spec.capitalTile : -1;
    this._air = this._airLook
      ? { angle: Number.isFinite(spec?.airClock?.angle) ? spec.airClock.angle : 0,
        phase: Number.isFinite(spec?.airClock?.phase) ? spec.airClock.phase : this._airLook.weatherPhase }
      : null;
    this._overlay = this._topo ? createOverlayData(this._topo.count) : null;
    this._overlayDirty = true;
    this._fallbackColors = null;
    this._mapPhase = MAP_PHASE.NONE; this._mapFade = false; this._crossT0 = null; this._requested = false;
    this._viewInit = false; this._turn = null; this._drag = null;
    this._hover = { on: false, tile: -1, dir: null };
    this._spin = createSpin(this._now());
    this._mode = { selectedTile: -1, gridAll: false, lock: false, work: false };
    this._dirty = true;
    return !!this._look;
  }

  /** Stan pól (bajty `createOverlayData` wypełnione `writeOverlayTile`) — kopiowany do własnego bufora. */
  setOverlay(data) {
    if (!this._overlay || !data || data.length !== this._overlay.length) return false;
    this._overlay.set(data);
    this._overlayDirty = true; this._dirty = true;
    return true;
  }

  /** Barwy nakładki z motywu: { grid, hover, selection, own, foreign } — każda [r, g, b, a] w 0…1. */
  setColors(c) { this._colors = { ...(this._colors ?? {}), ...c }; this._dirty = true; }

  /** Barwy pól dla fallbacku 2D (napisy CSS, indeks = pole). */
  setFallbackColors(list) { this._fallbackColors = list; if (this.fallback().fallback) this._dirty = true; }

  /**
   * Tryb gospodarza. `selectedTile` — zaznaczone pole (−1 = brak); `gridAll` — cała siatka (tryb budowy);
   * `lock` — blokada auto-obrotu (zaznaczone pole / tryb budowy); `work` — chmury rozrzedzone (budowa / soczewka).
   */
  setMode(m = {}) {
    const next = { ...this._mode, ...m };
    if (next.selectedTile === this._mode.selectedTile && next.gridAll === this._mode.gridAll && next.lock === this._mode.lock
      && next.work === this._mode.work) return;
    this._mode = next; this._dirty = true;
  }

  /** Wymuś fallback 2D (podgląd / test). */
  forceFallback(on = true) { this._forced = on === true; this._dirty = true; this._onChange(); }

  /** Pomiar: po każdym renderze czekaj na GPU (readPixels) — tylko sondy wydajności. */
  setMeasureSync(on) { this._measureSync = on === true; }

  // ── Wejście (współrzędne w jednostkach logicznych kontekstu gospodarza) ─────────────────────────────────────

  _ndc(x, y, rect) { return [((x - rect.x) / rect.w) * 2 - 1, 1 - ((y - rect.y) / rect.h) * 2]; }

  /** Kierunek na kuli pod punktem ekranu albo null (poza tarczą / poza kadrem). */
  pickDirection(x, y, rect) {
    if (!this._topo || !rect || rect.w <= 0 || rect.h <= 0) return null;
    if (x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) return null;
    const [nx, ny] = this._ndc(x, y, rect);
    return pickDir(this._view, rect.w / rect.h, nx, ny, this.tuning);
  }

  /** Indeks pola pod punktem ekranu (−1 = brak). */
  pick(x, y, rect) {
    const p = this.pickDirection(x, y, rect);
    return p ? nearestTile(this._topo, p[0], p[1], p[2]) : -1;
  }

  /** Ruch myszy: aktualizuje pole pod kursorem (albo przeciąganie). Zwraca { tile, onSphere, dragging }. */
  pointerMove(x, y, rect) {
    if (this._drag) {
      const dx = x - this._drag.x, dy = y - this._drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 0) {
        if (!this._drag.moved && Math.hypot(x - this._drag.x0, y - this._drag.y0) > 3) this._drag.moved = true;
        if (this._drag.moved) {
          const nv = applyDrag(this._view, dx, dy, rect.h, this.tuning);
          this._view.lon = nv.lon; this._view.lat = nv.lat;
          this._turn = null; this._dirty = true;
        }
        this._drag.x = x; this._drag.y = y;
      }
      return { tile: -1, onSphere: true, dragging: this._drag.moved };
    }
    const p = this.pickDirection(x, y, rect);
    const tile = p ? nearestTile(this._topo, p[0], p[1], p[2]) : -1;
    const was = this._hover;
    if (was.on !== !!p || was.tile !== tile || (p && (!was.dir || was.dir[0] !== p[0] || was.dir[1] !== p[1] || was.dir[2] !== p[2]))) {
      this._hover = { on: !!p, tile, dir: p };
      this._dirty = true;
    }
    return { tile, onSphere: !!p, dragging: false };
  }

  /** Kursor opuścił kulę (poza kadrem, nad panelem, okno zamknięte). */
  pointerLeave() {
    if (this._hover.on) { this._hover = { on: false, tile: -1, dir: null }; this._dirty = true; }
  }

  /** Początek przeciągania (tylko gdy kursor jest na tarczy). Zwraca true, gdy przeciąganie się zaczęło. */
  dragStart(x, y, rect) {
    if (!this.pickDirection(x, y, rect)) return false;
    this._drag = { x, y, x0: x, y0: y, moved: false };
    return true;
  }

  /** Koniec przeciągania. Zwraca true, gdy mysz faktycznie przesunęła kulę (wtedy klik nie wybiera pola). */
  dragEnd() {
    const moved = !!this._drag?.moved;
    this._drag = null;
    return moved;
  }

  get dragging() { return !!this._drag?.moved; }

  /** Kółko myszy (delta > 0 = oddalenie). */
  wheel(delta) {
    this._distTarget = applyWheel(this._distTarget, delta, this._range, this.tuning);
    this._dirty = true; this._onChange();
  }

  /** Obrót klawiaturą o kąt [rad]. */
  rotateBy(dLon, dLat) {
    this._turn = null;
    this._view.lon += dLon;
    this._view.lat = clampLat(this._view.lat + dLat, this.tuning);
    this._dirty = true; this._onChange();
  }

  /** Obróć kulę tak, by pole znalazło się pod kamerą (dwuklik). */
  turnTo(tile) {
    if (!this._topo || !(tile >= 0 && tile < this._topo.count)) return false;
    const to = viewOver(this._topo.cx[tile], this._topo.cy[tile], this._topo.cz[tile], this._view.dist, this.tuning);
    this._turn = { from: { lon: this._view.lon, lat: this._view.lat }, to, t0: this._now() };
    this._dirty = true; this._onChange();
    return true;
  }

  /** Rzut środka pola na ekran: { x, y, visible, facing } w jednostkach gospodarza. */
  project(tile, rect) {
    if (!this._topo || !(tile >= 0 && tile < this._topo.count)) return null;
    return this.projectDirection(this._topo.cx[tile], this._topo.cy[tile], this._topo.cz[tile], rect);
  }

  projectDirection(x, y, z, rect) {
    const p = projectDir(this._view, rect.w / rect.h, x, y, z, 1, this.tuning);
    return { x: rect.x + (p.nx + 1) * 0.5 * rect.w, y: rect.y + (1 - p.ny) * 0.5 * rect.h, visible: p.front, facing: p.facing };
  }

  /** Średni rozmiar pola na ekranie pod kamerą [jednostki gospodarza] — skala znaczników. */
  tileScreenSize(rect) {
    if (!this._topo) return 0;
    const spacing = Math.sqrt(4 * Math.PI / this._topo.count);
    return spacing * rect.h / (2 * Math.max(0.05, this._view.dist - 1) * Math.tan(this.tuning.fovDeg * Math.PI / 360));
  }

  /** Środek i promień tarczy na ekranie. */
  discOnScreen(rect) {
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, r: discRadiusNdc(this._view, this.tuning) * rect.h / 2 };
  }

  fallback() {
    if (this._forced) return { fallback: true, reason: 'forced' };
    if (!this._look) return { fallback: true, reason: 'no_look' };
    if (this._glFailed) return { fallback: true, reason: 'context_failed' };
    if (this._ctxLost) return { fallback: true, reason: 'context_lost' };
    return { fallback: false, reason: null };
  }

  /** Czy gospodarz powinien rysować kolejną klatkę (animacja w toku). */
  isAnimating() {
    if (!this._topo) return false;
    return this._interactive() || this._spin.factor > 0 || this._spin.mode !== SPIN_MODE.HOLD || this._weatherOn();
  }

  /**
   * Za ile ms gospodarz powinien narysować kolejną klatkę: 0 = od razu (interakcja, animacja, rozpędzanie obrotu),
   * ∞ = nic się nie zmienia. Płótno UI gry rysuje się NA ŻĄDANIE — bez tej podpowiedzi auto-obrót stałby w miejscu.
   */
  nextFrameDelayMs(now = this._now()) {
    if (!this._topo) return Infinity;
    if (this._dirty || this._interactive()) return 0;
    const s = stepSpin(this._spin, { now, hover: this._hover.on, dragging: !!this._drag, locked: this._mode.lock }, this.tuning);
    if (s.mode === SPIN_MODE.EASE) return 0;
    if (s.mode === SPIN_MODE.WAIT) return Math.max(0, this.tuning.resumeDelayMs - (now - s.since));
    const interval = frameIntervalMs({ interactive: false, spinFactor: s.factor, weather: this._weatherOn() }, this.tuning);
    return Number.isFinite(interval) ? Math.max(0, interval - (now - this._lastRenderT)) : Infinity;
  }

  // ── Rysunek ────────────────────────────────────────────────────────────────────────

  /**
   * Rysuje kulę w prostokąt `rect` (jednostki logiczne kontekstu). Woła go gospodarz w swoim rysunku.
   * @returns {{rendered:boolean, fallback:boolean, animating:boolean}}
   */
  draw(ctx, rect, { now = null } = {}) {
    if (!this._topo || !rect || rect.w <= 0 || rect.h <= 0) return { rendered: false, fallback: false, animating: false };
    const t = Number.isFinite(now) ? now : this._now();
    const dt = this._lastNow == null ? 0 : Math.min(MAX_DT_S, Math.max(0, (t - this._lastNow) / 1000));
    this._lastNow = t;
    this._syncFrame(rect);
    this._advance(t, dt);

    let fb = this.fallback();
    if (!fb.fallback && !this._ensureGL()) fb = this.fallback();
    if (fb.fallback) {
      this._drawFallback(ctx, rect);
      this._dirty = false; this._lastRenderT = t;
      return { rendered: false, fallback: true, animating: this._spin.factor > 0 || !!this._turn };
    }

    const scale = (typeof ctx?.getTransform === 'function' ? Math.abs(ctx.getTransform().a) : 1) || 1;
    let devW = Math.max(1, Math.round(rect.w * scale)), devH = Math.max(1, Math.round(rect.h * scale));
    if (devW * devH > MAX_PIXELS) { const k = Math.sqrt(MAX_PIXELS / (devW * devH)); devW = Math.max(1, Math.round(devW * k)); devH = Math.max(1, Math.round(devH * k)); }
    if (devW !== this._devW || devH !== this._devH) {
      this._devW = devW; this._devH = devH;
      this._gl.setSize(devW, devH, false);
      this._dirty = true;
    }
    this._pxScale = devH / rect.h;

    this._syncMaps(t);
    const interactive = this._interactive();
    const interval = frameIntervalMs({ interactive, spinFactor: this._spin.factor, weather: this._weatherOn() }, this.tuning);
    let rendered = false;
    if (shouldRenderFrame({ dirty: this._dirty, sinceLastMs: t - this._lastRenderT, intervalMs: interval })) {
      rendered = this._render(t);
      this._dirty = false;
      if (!rendered && this.fallback().fallback) { this._drawFallback(ctx, rect); return { rendered: false, fallback: true, animating: false }; }
    }
    ctx.drawImage(this._canvas, rect.x, rect.y, rect.w, rect.h);
    this._composites++;
    return { rendered, fallback: false, animating: interactive || Number.isFinite(interval) };
  }

  // Kadr: zakres zoomu z proporcji i widok startowy nad stolicą.
  _syncFrame(rect) {
    const aspect = rect.w / rect.h;
    if (aspect !== this._aspect) {
      this._aspect = aspect;
      const prevFar = this._range.far;
      this._range = zoomRange(this._topo.count, aspect, this.tuning);
      if (this._viewInit) {   // zmiana kadru: pełne oddalenie zostaje pełnym oddaleniem
        const atFar = this._distTarget >= prevFar - 1e-6;
        this._distTarget = atFar ? this._range.far : Math.max(this._range.near, Math.min(this._range.far, this._distTarget));
      }
      this._dirty = true;
    }
    if (!this._viewInit) {
      const c = this._capital >= 0 && this._capital < this._topo.count ? this._capital : 0;
      this._view = viewOver(this._topo.cx[c], this._topo.cy[c], this._topo.cz[c], this._range.far, this.tuning);
      this._distTarget = this._range.far;
      this._viewInit = true;
      this._dirty = true;
    }
  }

  // Automaty i animacje (bez GL — działają także w fallbacku 2D).
  _advance(t, dt) {
    this._spin = stepSpin(this._spin, { now: t, hover: this._hover.on, dragging: !!this._drag, locked: this._mode.lock }, this.tuning);
    if (this._turn) {
      const p = (t - this._turn.t0) / Math.max(1, this.tuning.turnMs);
      const s = turnStep(this._turn.from, this._turn.to, p);
      this._view.lon = s.lon; this._view.lat = s.lat;
      if (p >= 1) this._turn = null;
    } else if (this._spin.factor > 0 && dt > 0) {
      this._view.lon += this.tuning.spinRate * this._spin.factor * dt;
    }
    const dd = this._distTarget - this._view.dist;
    if (dd !== 0) {
      if (Math.abs(dd) < 1e-4) this._view.dist = this._distTarget;
      else this._view.dist += dd * (1 - Math.exp(-this.tuning.zoomEasePerSec * dt));
    }
    if (this._air && dt > 0) {
      const wdt = dt * this._getWeatherRate();
      if (wdt > 0) {
        if (!this._lockedDir) this._air.angle += wdt * this._airLook.drift;   // związane pływowo: tylko wiatry pasmowe
        this._air.phase += wdt * this._airLook.evolve;
      }
    }
  }

  _weatherOn() { return !!this._air && this._getWeatherRate() > 0; }

  _interactive() {
    return !!this._drag?.moved || !!this._turn || this._view.dist !== this._distTarget || this._mapFade
      || this._mapPhase === MAP_PHASE.CROSS;
  }

  // ── Mapy powierzchni (SurfaceCache) ───────────────────────────────────────────────────────────

  _syncMaps(t) {
    const cache = this._getCache();
    if (!cache || !this._body || !this._obj) return;
    if (!this._requested) {
      this._requested = true;
      const again = () => { this._dirty = true; this._onChange(); };
      try {
        if (!cache.get(this._body)) cache.request(this._body, undefined, 'hero').then(again);     // LOD mapy układu (szybki)
        if (!cache.get(this._body, 'hero')) cache.request(this._body, 'hero', 'hero').then(again);
      } catch (e) { /* cache zamknięty — zostaje barwa zastępcza */ }
    }
    const crossDone = this._mapPhase === MAP_PHASE.CROSS && crossProgress(this._crossT0, t, this.tuning.crossFadeMs) >= 1;
    const lod = this._mapPhase === MAP_PHASE.NONE ? cache.get(this._body) : null;
    const hero = (this._mapPhase === MAP_PHASE.NONE || this._mapPhase === MAP_PHASE.LOD) ? cache.get(this._body, 'hero') : null;
    const step = mapSwapStep(this._mapPhase, { lod: !!lod, hero: !!hero, crossDone });
    if (!step.action) return;
    const T = this._THREE, o = this._obj;
    if (step.action === 'show-lod' || step.action === 'show-hero') {
      if (!SurfaceShader.applySurfaceMap(T, o.surface.material, step.action === 'show-hero' ? hero : lod, this._sea, false)) return;
      this._mapFade = true;
    } else if (step.action === 'cross-to-hero') {
      const mat = SurfaceShader.createSurfaceMaterial(T, this._look, { logDepth: false, shared: this._shared, surfaceSeed: this._body.surfaceSeed });
      if (!SurfaceShader.applySurfaceMap(T, mat, hero, this._sea, true)) { mat.dispose(); return; }
      mat.transparent = true; mat.depthWrite = false;
      mat.blending = T.CustomBlending; mat.blendSrc = T.ConstantAlphaFactor; mat.blendDst = T.OneMinusConstantAlphaFactor;
      mat.blendAlpha = 0;
      o.cross = new T.Mesh(o.surface.geometry, mat);
      o.cross.renderOrder = 1;
      this._scene.add(o.cross);
      this._crossT0 = t;
    } else if (step.action === 'finish-cross') {
      const mat = o.cross.material;
      this._scene.remove(o.cross);
      mat.transparent = false; mat.depthWrite = true; mat.blending = T.NormalBlending;
      o.surface.material.dispose();
      o.surface.material = mat;
      o.cross = null; this._crossT0 = null;
    }
    this._mapPhase = step.phase;
    this._dirty = true;
  }

  // ── WebGL ─────────────────────────────────────────────────────────────────────────

  _ensureGL() {
    if (this._gl) return !this._ctxLost;
    if (this._glFailed) return false;
    try {
      this._canvas = this._createCanvas(this._devW || 2, this._devH || 2);
      const gl = this._createGL(this._canvas);
      if (!gl) throw new Error('no_renderer');
      this._gl = gl;
      this._buildScene();
    } catch (e) {
      this._glFailed = true; this._glError = String(e?.message ?? e);
      this._teardownGL();
      this._onChange();
      return false;
    }
    const lost = (e) => { try { e?.preventDefault?.(); } catch (_) { /* nic */ } this._ctxLost = true; this._lostCount++; this._dirty = true; this._onChange(); };
    const restored = () => { this._ctxLost = false; this._dirty = true; this._onChange(); };
    this._listeners = { lost, restored };
    this._canvas.addEventListener?.('webglcontextlost', lost, false);
    this._canvas.addEventListener?.('webglcontextrestored', restored, false);
    this._devW = 0; this._devH = 0;   // wymusza setSize przy pierwszym rysunku
    return true;
  }

  _buildScene() {
    const T = this._THREE, tn = this.tuning;
    this._scene = new T.Scene();
    const light = sphereLight(this._star, tn);
    this._shared = {
      uSunPos: { value: [0, 0, SUN_DISTANCE] }, uSunColor: { value: light.sun }, uAmbient: { value: light.ambient },
      uTune: { value: [1, 1, 1, 1] },
    };
    const o = { surface: null, cross: null, shell: null, halo: null, overlay: null, overlayTex: null, camera: null, cloudAlpha: 0 };
    const geo = new T.SphereGeometry(1, tn.sphereSegments[0], tn.sphereSegments[1]);
    const mat = SurfaceShader.createSurfaceMaterial(T, this._look, { logDepth: false, shared: this._shared, surfaceSeed: this._body.surfaceSeed });
    o.surface = new T.Mesh(geo, mat);
    this._scene.add(o.surface);
    if (this._airLook) {
      const mats = SurfaceAirShader.createAirMaterials(T, this._airLook, { logDepth: false, shared: this._shared });
      SurfaceAirShader.setHazeOpacity(mats.shell, colonyHaze(this._airLook.hazeOpacity, tn));   // Wenus / Tytan: teren widoczny
      o.cloudAlpha = mats.shell.uniforms.uCloud.value[1];
      o.shell = new T.Mesh(new T.SphereGeometry(this._airLook.shellScale, 96, 64), mats.shell);
      o.halo = new T.Mesh(new T.SphereGeometry(this._airLook.haloScale, 64, 48), mats.halo);
      o.shell.renderOrder = 2; o.halo.renderOrder = 3;
      this._scene.add(o.shell); this._scene.add(o.halo);
    }
    const mesh = buildTileMesh(this._topo);
    o.overlayTex = OV.createOverlayTexture(T, this._overlay, this._topo.count);
    o.overlay = new T.Mesh(OV.createOverlayGeometry(T, mesh), OV.createOverlayMaterial(T, o.overlayTex, tn.overlayRadius));
    o.overlay.renderOrder = 5;
    o.overlay.frustumCulled = false;
    this._scene.add(o.overlay);
    o.camera = new T.PerspectiveCamera(tn.fovDeg, 1, 0.05, 60);
    this._obj = o;
    this._mapPhase = MAP_PHASE.NONE; this._mapFade = false; this._crossT0 = null; this._requested = false;
    this._overlayDirty = true;
  }

  _disposeScene() {
    const o = this._obj;
    if (o) {
      for (const m of [o.surface, o.cross, o.shell, o.halo, o.overlay]) {
        if (!m) continue;
        try { if (m !== o.cross) m.geometry?.dispose?.(); m.material?.dispose?.(); } catch (e) { /* nic */ }
      }
      try { o.overlayTex?.dispose?.(); } catch (e) { /* nic */ }
    }
    this._obj = null; this._scene = null; this._shared = null;
    this._mapPhase = MAP_PHASE.NONE; this._mapFade = false; this._crossT0 = null; this._requested = false;
  }

  _teardownGL() {
    if (this._canvas && this._listeners) {
      this._canvas.removeEventListener?.('webglcontextlost', this._listeners.lost, false);
      this._canvas.removeEventListener?.('webglcontextrestored', this._listeners.restored, false);
    }
    this._disposeScene();
    if (this._gl) {
      try { this._gl.dispose?.(); } catch (e) { /* nic */ }
      try { this._gl.forceContextLoss?.(); } catch (e) { /* nic */ }
    }
    this._gl = null; this._canvas = null; this._listeners = null;
    this._ctxLost = false; this._devW = 0; this._devH = 0;
  }

  _render(t) {
    if (!this._gl || this._ctxLost) return false;
    try {
      if (!this._obj) this._buildScene();
      const T = this._THREE, o = this._obj, v = this._view, tn = this.tuning;
      const d = [Math.cos(v.lat) * Math.cos(v.lon), Math.sin(v.lat), Math.cos(v.lat) * Math.sin(v.lon)];
      o.camera.aspect = this._devW / Math.max(1, this._devH);
      o.camera.position.set(d[0] * v.dist, d[1] * v.dist, d[2] * v.dist);
      o.camera.up.set(0, 1, 0);
      o.camera.lookAt(0, 0, 0);
      o.camera.updateProjectionMatrix();
      const sun = sunDirFor(v, this._lockedDir, tn);
      const sp = this._shared.uSunPos.value;
      sp[0] = sun[0] * SUN_DISTANCE; sp[1] = sun[1] * SUN_DISTANCE; sp[2] = sun[2] * SUN_DISTANCE;

      if (this._mapFade) {
        const u = o.surface.material.uniforms.uMapMix;
        const dt = Math.max(0, (t - (this._fadeLast ?? t)) / 1000);
        u.value = Math.min(1, u.value + Math.max(dt, 1 / 120) / SurfaceShader.SURFACE_FADE_SECONDS);
        this._fadeLast = t;
        if (u.value >= 1) { this._mapFade = false; this._fadeLast = null; }
      }
      if (o.cross) o.cross.material.blendAlpha = smooth(crossProgress(this._crossT0, t, tn.crossFadeMs));
      if (o.shell) {
        SurfaceAirShader.setAirClock(o.shell.material, this._air.angle, this._air.phase);
        o.shell.material.uniforms.uCloud.value[1] = o.cloudAlpha * (this._mode.work ? tn.cloudAlphaWork : 1);
      }

      const u = o.overlay.material.uniforms;
      if (this._overlayDirty) { o.overlayTex.needsUpdate = true; this._overlayDirty = false; }
      const c = this._colors;
      if (c) {
        if (c.grid) u.uGridColor.value = c.grid;
        if (c.hover) u.uHoverColor.value = c.hover;
        if (c.selection) u.uSelColor.value = c.selection;
        if (c.own) u.uOwnColor.value = c.own;
        if (c.foreign) u.uForeignColor.value = c.foreign;
      }
      const hov = this._hover.on && !this._drag?.moved;
      u.uHover.value = hov ? this._hover.tile : -1;
      u.uSel.value = this._mode.selectedTile;
      u.uGridAll.value = this._mode.gridAll ? 1 : 0;
      u.uPxScale.value = this._pxScale || 1;
      if (hov && this._hover.dir) {
        const R = tn.gridCursorTiles * Math.sqrt(4 * Math.PI / this._topo.count);
        u.uCursor.value = this._hover.dir;
        u.uCursorCos.value = [Math.cos(R * 0.5), Math.cos(R)];
      } else {
        u.uCursorCos.value = [2, 2];   // poza zakresem cosinusa → brak siatki przy kursorze
      }

      const t0 = this._now();
      this._gl.render(this._scene, o.camera);
      if (this._measureSync) {
        const g = this._gl.getContext?.();
        if (g?.readPixels) g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array(4));
      }
      const ms = this._now() - t0;
      this._renderMs.push(ms); if (this._renderMs.length > 240) this._renderMs.shift();
      this._renders++; this._lastRenderT = t;
      return true;
    } catch (e) {
      // Błąd renderu (np. kontekst padł w trakcie) — fallback 2D zamiast wyjątku w pętli UI.
      this._glFailed = true; this._glError = String(e?.message ?? e);
      this._onChange();
      return false;
    }
  }

  // ── Fallback 2D ───────────────────────────────────────────────────────────────────────
  // Ta sama kamera i te same komórki pól co w WebGL; pola = wielokąty w barwach terenu, przyciemnione po nocnej stronie.

  _drawFallback(ctx, rect) {
    const topo = this._topo, mesh = buildTileMesh(topo), aspect = rect.w / rect.h, tn = this.tuning;
    const disc = this.discOnScreen(rect);
    const sun = sunDirFor(this._view, this._lockedDir, tn);
    const ov = this._overlay, n = topo.count;
    ctx.save();
    ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
    ctx.fillStyle = '#020408'; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = '#0a0f16'; ctx.beginPath(); ctx.arc(disc.x, disc.y, disc.r, 0, Math.PI * 2); ctx.fill();
    const sx = (nx) => rect.x + (nx + 1) * 0.5 * rect.w, sy = (ny) => rect.y + (1 - ny) * 0.5 * rect.h;
    const hov = this._hover.on ? this._hover.tile : -1, sel = this._mode.selectedTile;
    const outline = [];
    for (let i = 0; i < n; i++) {
      const c = projectDir(this._view, aspect, topo.cx[i], topo.cy[i], topo.cz[i], 1, tn);
      if (!c.front || c.facing < 0.06) continue;
      ctx.beginPath();
      for (let k = mesh.cornerStart[i]; k < mesh.cornerStart[i + 1]; k++) {
        const p = projectDir(this._view, aspect, mesh.corners[k * 3], mesh.corners[k * 3 + 1], mesh.corners[k * 3 + 2], 1, tn);
        if (k === mesh.cornerStart[i]) ctx.moveTo(sx(p.nx), sy(p.ny)); else ctx.lineTo(sx(p.nx), sy(p.ny));
      }
      ctx.closePath();
      ctx.fillStyle = this._fallbackColors?.[i] ?? '#3a4654';
      ctx.fill();
      const lit = Math.max(0, topo.cx[i] * sun[0] + topo.cy[i] * sun[1] + topo.cz[i] * sun[2]);
      ctx.fillStyle = `rgba(0,0,0,${(0.62 * (1 - Math.min(1, lit * 2.2))).toFixed(3)})`;
      ctx.fill();
      if (ov) {
        const fa = ov[i * 4 + 3];
        if (fa > 0) { ctx.fillStyle = `rgba(${ov[i * 4]},${ov[i * 4 + 1]},${ov[i * 4 + 2]},${(fa / 255).toFixed(3)})`; ctx.fill(); }
        const lo = (n + i) * 4, la = ov[lo + 3];
        if (la > 0) { ctx.strokeStyle = `rgba(${ov[lo]},${ov[lo + 1]},${ov[lo + 2]},${(la / 255).toFixed(3)})`; ctx.lineWidth = 1.5; ctx.stroke(); }
        else { ctx.strokeStyle = 'rgba(190,220,255,0.16)'; ctx.lineWidth = 0.75; ctx.stroke(); }
      }
      if (i === hov || i === sel) outline.push(i);
    }
    for (const i of outline) {
      ctx.beginPath();
      for (let k = mesh.cornerStart[i]; k < mesh.cornerStart[i + 1]; k++) {
        const p = projectDir(this._view, aspect, mesh.corners[k * 3], mesh.corners[k * 3 + 1], mesh.corners[k * 3 + 2], 1, tn);
        if (k === mesh.cornerStart[i]) ctx.moveTo(sx(p.nx), sy(p.ny)); else ctx.lineTo(sx(p.nx), sy(p.ny));
      }
      ctx.closePath();
      ctx.strokeStyle = i === sel ? 'rgba(255,217,90,1)' : 'rgba(255,255,255,0.95)';
      ctx.lineWidth = i === sel ? 2.4 : 1.6;
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Sprzątanie i stan ────────────────────────────────────────────────────────────────────

  /** Zwolnij kontekst i zasoby (gospodarz ukryty). Ciało i widok zostają — kolejny `draw` odtworzy scenę. */
  release() {
    this._teardownGL();
    this._glFailed = false; this._glError = null;
    this._dirty = true; this._lastNow = null; this._lastRenderT = -Infinity;
    this._drag = null; this._hover = { on: false, tile: -1, dir: null };
  }

  info() {
    const fb = this.fallback();
    const ms = this._renderMs.slice().sort((a, b) => a - b);
    return {
      bodyId: this.bodyId, tiles: this._topo?.count ?? 0, mode: fb.fallback ? '2d' : 'gl', fallbackReason: fb.reason, glError: this._glError,
      contextLost: this._ctxLost, lostCount: this._lostCount, mapPhase: this._mapPhase, spin: this._spin.mode, spinFactor: this._spin.factor,
      view: { lon: this._view.lon, lat: this._view.lat, dist: this._view.dist }, range: { ...this._range },
      renders: this._renders, composites: this._composites, device: [this._devW, this._devH],
      renderMsMedian: ms.length ? ms[ms.length >> 1] : null, hoverTile: this.hoverTile, selectedTile: this._mode.selectedTile,
      gridAll: this._mode.gridAll, haze: this._obj?.shell ? SurfaceAirShader.hazeOpacityOf(this._obj.shell.material) : null,
      hasAir: !!this._airLook, locked: !!this._lockedDir,
    };
  }
}

export { OVERLAY_ROWS };
export default ColonySphereRenderer;
