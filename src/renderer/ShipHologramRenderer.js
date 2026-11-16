// ShipHologramRenderer — hologram statku do bohatera Stoczni (ARC KONSOLE, krok K1a; CONSOLES_PLAN.md §2 B2/B4,
// D-K-7 (a), D-K-10 (a), D-K-11 (a); flaga `FEATURES.shipHologram` sprawdzana przez GOSPODARZA, nie tutaj).
//
// • Własny WebGLRenderer na płótnie poza DOM — tworzony leniwie przy pierwszym rysunku, zwalniany w `release()` (dispose +
//   forceContextLoss). Obraz trafia do płótna UI przez `ctx.drawImage` w prostokąt podany przez gospodarza.
// • Renderuje TYLKO, gdy gospodarz rysuje (= jest widoczny) i coś się zmieniło albo trwa animacja (obrót, przenikanie);
//   w bezczynności `draw` jedynie komponuje ostatnią klatkę (0 wywołań `render`). Ukryty gospodarz nie woła `draw` → 0 pracy.
// • Modele: klucze `VesselModelResolver` (`setModel(key)` — podmiana na żywo z krótkim przenikaniem), szablony z pamięci
//   ThreeRenderera (`_shipModelTemplates` / `_loadShipModel`) albo własny GLTFLoader; scena główna nietknięta
//   (`ShipHologramScene` — klony siatek, geometria tylko do odczytu, materiały własne).
// • Fallback (sylwetka Canvas 2D, bez WebGL): kontekst się nie utworzył / utracony / mediana klatki > budżet / wymuszony.
//   Utrata kontekstu: preventDefault → po przywróceniu wraca hologram; nigdy nie rzuca.
// • Wszystko, co dotyka świata (THREE, tworzenie kontekstu, płótna, wczytywanie, zegar, kolor, epoka motywu), jest
//   wstrzykiwane — keeper `ship_hologram_smoke` wykonuje klasę pod node z atrapą kontekstu.

import * as THREE_NS from 'three';
import { THEME, themeEpoch } from '../config/ThemeConfig.js';
import { resolveHudRoles } from '../ui/HudPalette.js';
import { ShipHardpointsCache, slotOfModelPath } from './ShipHardpoints.js';
import {
  HOLO_TUNING, modelLoadPaths, fallbackState, median, pushSample, budgetExceeded, shouldSyncSample, shouldRender,
  fadeProgress, HOLO_FADE_MS, holoCameraSpec, holoYaw, technicalLayout, planViewCamera,
} from './ShipHologramLogic.js';
import {
  createHoloMaterials, recolorHoloMaterials, setHoloXray, disposeHoloMaterials, buildHoloModel, rebuildHoloEdges,
  disposeHoloModel, drawSilhouette, modelTriangles,
} from './ShipHologramScene.js';

const SCAN_LINE_PX = 3;          // okres linii skanowania [px urządzenia]
const SIL_ALPHA = 0.6;           // krycie linii sylwetki
const MAX_DT_S = 0.1;            // klamra kroku obrotu [s] (po przerwie w rysowaniu obrót nie skacze)

let _ownHardpoints = null;
let _ownLoader = null;

function defaultCreateCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  return c;
}

function defaultCreateGL(THREE, canvas) {
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setClearColor(0x000000, 0);
  return r;
}

// Szablon GLB: najpierw pamięć ThreeRenderera (dowolna ze ścieżek), potem jego `_loadShipModel` (deduplikacja), w ostateczności
// własny GLTFLoader. Wynik: { template, path, cached }.
async function defaultLoadTemplate(key) {
  const tr = window.KOSMOS?.threeRenderer;
  const paths = modelLoadPaths(key);
  // pamięć — tylko ścieżki właściwego modelu (`default.glb`, ostatni na liście, jest w pamięci zawsze — tylko gdy reszta zawiedzie)
  for (const p of paths.slice(0, -1)) {
    const t = tr?._shipModelTemplates?.get?.(p);
    if (t) return { template: t, path: p, cached: true };
  }
  let lastErr = null;
  for (const p of paths) {
    if (tr?._missingModelPaths?.has?.(p)) continue;
    try {
      if (tr?._loadShipModel) return { template: await tr._loadShipModel(p), path: p, cached: false };
      if (!_ownLoader) { const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'); _ownLoader = new GLTFLoader(); }
      const gltf = await _ownLoader.loadAsync(p);
      return { template: gltf.scene, path: p, cached: false };
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error('no_model');
}

async function defaultLoadFrame(slot) {
  const tr = window.KOSMOS?.threeRenderer;
  const cache = tr?._shipHardpoints ?? (_ownHardpoints ??= new ShipHardpointsCache({
    fetchJson: (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  }));
  const doc = await cache.load(slot);
  return doc?.frame ?? null;
}

export class ShipHologramRenderer {
  /**
   * @param {object} [o]
   * @param {object} [o.THREE] — przestrzeń nazw Three.js (domyślnie import 'three')
   * @param {(canvas:object) => object} [o.createGL] — tworzy WebGLRenderer na płótnie (rzuca, gdy brak kontekstu)
   * @param {(w:number, h:number) => object} [o.createCanvas]
   * @param {(key:string) => Promise<{template:object, path:string, cached?:boolean}>} [o.loadTemplate]
   * @param {(slot:string) => Promise<object|null>} [o.loadFrame] — rama (dziób / góra) z hardpointów
   * @param {() => string} [o.getColor] — kolor CSS roli `primary`
   * @param {() => number} [o.getEpoch] — epoka motywu
   * @param {() => number} [o.now] — zegar [ms]
   * @param {() => void} [o.onChange] — prośba o przerysowanie gospodarza (wczytany model, utrata kontekstu…)
   * @param {object} [o.tuning] — pokrętła (domyślnie wspólne `HOLO_TUNING`)
   */
  constructor(o = {}) {
    this._THREE = o.THREE ?? THREE_NS;
    this._createGL = o.createGL ?? ((canvas) => defaultCreateGL(this._THREE, canvas));
    this._createCanvas = o.createCanvas ?? defaultCreateCanvas;
    this._loadTemplate = o.loadTemplate ?? defaultLoadTemplate;
    this._loadFrame = o.loadFrame ?? defaultLoadFrame;
    this._getColor = o.getColor ?? (() => resolveHudRoles(THEME).primary);
    this._getEpoch = o.getEpoch ?? themeEpoch;
    this._now = o.now ?? (() => performance.now());
    this._onChange = o.onChange ?? (() => {});
    this.tuning = o.tuning ?? HOLO_TUNING;

    this._mode = '3q';
    this._spinOn = true;
    this._forced = false;
    this._key = null; this._pendingKey = null; this._loadToken = 0; this._loadError = null;
    this._models = new Map();          // key → model (zbudowany; zwalniany w release)
    this._model = null;
    this._loadTimes = {};              // key → { templateMs, buildMs, path, cached, tris, edges }

    this._gl = null; this._canvas = null; this._scene = null; this._mats = null; this._epoch = null;
    this._glFailed = false; this._glError = null; this._ctxLost = false; this._lostCount = 0;
    this._listeners = null;
    this._timer = null;                // EXT_disjoint_timer_query_webgl2 albo null
    this._samples = []; this._budgetTripped = false; this._budgetAt = this.tuning.budgetMs;
    this._renderIdx = 0;               // renderów od ostatniej zmiany (próbkowanie synchroniczne)
    this._renders = 0;                 // wszystkich wywołań render (keeper bezczynności, pomiar)
    this._composites = 0; this._compositeMs = [];
    this._dirty = true; this._spinT = 0; this._lastNow = null;
    this._devW = 0; this._devH = 0;
    this._fadeCanvas = null; this._fadeT0 = null;
    this._silCache = new Map();
    this._xrayAt = null;
  }

  // ── API gospodarza ──────────────────────────────────────────────────────────────────────────────────────────────────

  get modelKey() { return this._key; }
  get mode() { return this._mode; }

  /** Podmiana modelu (D-K-10). Wczytanie asynchroniczne; po nim — przenikanie i prośba o przerysowanie. */
  setModel(key) {
    if (!key || key === this._pendingKey) return;
    if (key === this._key) { this._loadToken++; this._pendingKey = null; return; }   // powrót do bieżącego — anuluj oczekujący
    if (this._models.has(key)) { this._loadToken++; this._swapTo(key, this._models.get(key)); return; }
    this._pendingKey = key;
    const token = ++this._loadToken;
    const t0 = this._now();
    Promise.resolve().then(() => this._loadTemplate(key)).then(async (res) => {
      if (token !== this._loadToken) return;
      const templateMs = this._now() - t0;
      const slot = slotOfModelPath(res.path)?.slot ?? key;
      let frame = null;
      try { frame = await this._loadFrame(slot); } catch (e) { frame = null; }
      if (token !== this._loadToken) return;
      if (!this._mats) this._mats = createHoloMaterials(this._THREE, this._getColor());
      const b0 = this._now();
      const model = buildHoloModel(this._THREE, res.template, { frame, edgeAngle: this.tuning.edgeAngle, mats: this._mats });
      this._loadTimes[key] = { templateMs: +templateMs.toFixed(1), buildMs: +(this._now() - b0).toFixed(1), path: res.path,
        cached: !!res.cached, tris: model.tris, edges: model.edgeCount };
      this._models.set(key, model);
      this._swapTo(key, model);
    }).catch((e) => {
      if (token !== this._loadToken) return;
      this._pendingKey = null; this._loadError = String(e?.message ?? e);
      this._onChange();
    });
  }

  setMode(mode) { const m = mode === 'plan' ? 'plan' : '3q'; if (m !== this._mode) { this._mode = m; this._resetSamples(); this._dirty = true; } return this._mode; }
  setSpin(on) { this._spinOn = !!on; this._dirty = true; return this._spinOn; }
  setForcedFallback(on) { this._forced = !!on; this._dirty = true; return this._forced; }
  markDirty() { this._dirty = true; }

  /** Stan fallbacku `{ fallback, reason }` (D-K-11). */
  fallback() {
    return fallbackState({ forced: this._forced, contextFailed: this._glFailed, contextLost: this._ctxLost, budgetTripped: this._budgetTripped });
  }

  /** Czy gospodarz powinien rysować w kolejnej klatce (obrót / przenikanie / oczekiwanie na model nie wymaga klatek). */
  isAnimating() {
    if (this.fallback().fallback || !this._model) return false;
    return this._spinning() || this._fading(this._now());
  }

  /**
   * Rysuje hologram (albo sylwetkę) w prostokąt `rect` (jednostki logiczne kontekstu). Woła go gospodarz w swoim rysunku.
   * @returns {{ rendered:boolean, fallback:boolean, animating:boolean }}
   */
  draw(ctx, rect, { now = null } = {}) {
    const t = Number.isFinite(now) ? now : this._now();
    const dt = this._lastNow == null ? 0 : Math.min(MAX_DT_S, Math.max(0, (t - this._lastNow) / 1000));
    this._lastNow = t;
    this._syncEpoch();
    this._syncTuning();
    const scale = (typeof ctx?.getTransform === 'function' ? Math.abs(ctx.getTransform().a) : 1) || 1;
    const devW = Math.max(1, Math.round(rect.w * scale)), devH = Math.max(1, Math.round(rect.h * scale));

    let fb = this.fallback();
    if (!fb.fallback && !this._ensureGL()) fb = this.fallback();
    if (fb.fallback) { this._drawSilhouette(ctx, rect, devW, devH); return { rendered: false, fallback: true, animating: false }; }
    if (!this._model) return { rendered: false, fallback: false, animating: false };

    if (devW !== this._devW || devH !== this._devH) {
      this._devW = devW; this._devH = devH;
      this._gl.setSize(devW, devH, false);
      this._resetSamples(); this._dirty = true;
    }
    const spinning = this._spinning();
    if (spinning) this._spinT += dt * (this.tuning.spin || 0);
    const fading = this._fading(t);
    let rendered = false;
    if (shouldRender({ visible: true, dirty: this._dirty, spinning, fading })) {
      rendered = this._render();
      this._dirty = false;
    }
    this._composite(ctx, rect, t);
    return { rendered, fallback: false, animating: spinning || this._fading(t) };
  }

  /** Zwalnia kontekst WebGL i własne zasoby (geometria szablonów i scena główna nietknięte). Bezpieczne wielokrotnie. */
  release() {
    this._loadToken++;
    this._pendingKey = null;
    for (const m of this._models.values()) disposeHoloModel(m);
    this._models.clear(); this._model = null; this._key = null;
    disposeHoloMaterials(this._mats); this._mats = null; this._epoch = null;
    this._releaseGL();
    this._silCache.clear(); this._fadeCanvas = null; this._fadeT0 = null;
    this._glFailed = false; this._glError = null;
    this._resetSamples(); this._budgetTripped = false;
    this._dirty = true; this._lastNow = null;
  }

  info() {
    const fb = this.fallback();
    const g = median(this._samples), c = median(this._compositeMs);
    return {
      model: this._key, pending: this._pendingKey, mode: this._mode, spin: this._spinOn,
      gpuMsMedian: g === null ? null : +g.toFixed(3), samples: this._samples.length,
      timing: this._timer ? 'timer-query' : 'sync-sample',
      compositeCpuMsMedian: c === null ? null : +c.toFixed(3),
      fallback: fb.fallback, reason: fb.reason,
      context: this._gl ? (this._ctxLost ? 'lost' : 'ok') : (this._glFailed ? 'failed' : 'none'), contextLosses: this._lostCount,
      renders: this._renders, composites: this._composites, size: [this._devW, this._devH],
      load: this._key ? this._loadTimes[this._key] ?? null : null, loadError: this._loadError,
    };
  }

  loadTimes() { return { ...this._loadTimes }; }

  // ── wnętrze ─────────────────────────────────────────────────────────────────────────────────────────────────────────

  _swapTo(key, model) {
    // Przenikanie: zdjęcie ostatniej klatki starego modelu (płótno 2D), nowy wchodzi w HOLO_FADE_MS.
    if (this._model && this._gl && !this._ctxLost && this._devW > 0) {
      try {
        if (!this._fadeCanvas) this._fadeCanvas = this._createCanvas(this._devW, this._devH);
        if (this._fadeCanvas.width !== this._devW) this._fadeCanvas.width = this._devW;
        if (this._fadeCanvas.height !== this._devH) this._fadeCanvas.height = this._devH;
        const fc = this._fadeCanvas.getContext('2d');
        fc.clearRect(0, 0, this._devW, this._devH);
        fc.drawImage(this._canvas, 0, 0);
        this._fadeT0 = this._now();
      } catch (e) { this._fadeT0 = null; }
    }
    if (this._scene && this._model) this._scene.remove(this._model.root);
    this._model = model; this._key = key; this._pendingKey = null; this._loadError = null;
    if (this._scene) this._scene.add(model.root);
    this._resetSamples(); this._dirty = true;
    this._onChange();
  }

  _spinning() { return this._mode === '3q' && this._spinOn && (this.tuning.spin || 0) > 0 && !!this._model; }
  _fading(t) { return this._fadeT0 != null && fadeProgress(this._fadeT0, t, HOLO_FADE_MS) < 1; }

  _resetSamples() { this._samples = []; this._renderIdx = 0; }

  _syncEpoch() {
    const ep = this._getEpoch();
    if (ep === this._epoch) return;
    this._epoch = ep;
    if (this._mats) recolorHoloMaterials(this._THREE, this._mats, this._getColor());
    this._silCache.clear();
    this._dirty = true;
  }

  _syncTuning() {
    const tu = this.tuning;
    if (this._model && this._model.edgeAngle !== tu.edgeAngle) {
      rebuildHoloEdges(this._THREE, this._model, tu.edgeAngle, this._mats);
      this._silCache.clear(); this._dirty = true;
    }
    if (this._mats) {
      if (setHoloXray(this._mats, tu.xray, this._THREE)) this._dirty = true;
      const u = this._mats.holo.uniforms;
      if (u.uRim.value !== tu.rim || u.uScan.value !== tu.scan || this._mats.line.opacity !== tu.edgeAlpha) {
        u.uRim.value = tu.rim; u.uScan.value = tu.scan; this._mats.line.opacity = tu.edgeAlpha; this._dirty = true;
      }
    }
    if (tu.budgetMs !== this._budgetAt) { this._budgetAt = tu.budgetMs; this._budgetTripped = false; this._resetSamples(); this._dirty = true; }
  }

  _ensureGL() {
    if (this._gl) return !this._ctxLost;
    if (this._glFailed) return false;
    try {
      this._canvas = this._createCanvas(this._devW || 2, this._devH || 2);
      const gl = this._createGL(this._canvas);
      if (!gl) throw new Error('no_renderer');
      this._gl = gl;
    } catch (e) {
      this._glFailed = true; this._glError = String(e?.message ?? e); this._gl = null; this._canvas = null;
      this._onChange();
      return false;
    }
    const lost = (e) => { try { e?.preventDefault?.(); } catch (_) { /* nic */ } this._ctxLost = true; this._lostCount++; this._dirty = true; this._onChange(); };
    const restored = () => { this._ctxLost = false; this._resetSamples(); this._timer = null; this._initTimer(); this._dirty = true; this._onChange(); };
    this._listeners = { lost, restored };
    this._canvas.addEventListener?.('webglcontextlost', lost, false);
    this._canvas.addEventListener?.('webglcontextrestored', restored, false);
    const T = this._THREE;
    this._scene = new T.Scene();
    if (!this._mats) this._mats = createHoloMaterials(T, this._getColor());
    this._mats.holo.uniforms.uLinePx.value = SCAN_LINE_PX;
    if (this._model) this._scene.add(this._model.root);
    this._devW = 0; this._devH = 0;   // wymusza setSize przy pierwszym rysunku
    this._initTimer();
    return true;
  }

  _initTimer() {
    try {
      const c = this._gl?.getContext?.();
      const ext = c?.getExtension?.('EXT_disjoint_timer_query_webgl2');
      this._timer = ext && typeof c.createQuery === 'function' ? { c, ext, pending: [] } : null;
    } catch (e) { this._timer = null; }
  }

  _releaseGL() {
    if (this._canvas && this._listeners) {
      this._canvas.removeEventListener?.('webglcontextlost', this._listeners.lost, false);
      this._canvas.removeEventListener?.('webglcontextrestored', this._listeners.restored, false);
    }
    if (this._timer) { try { for (const q of this._timer.pending) this._timer.c.deleteQuery(q); } catch (e) { /* nic */ } }
    if (this._gl) {
      try { this._gl.dispose?.(); } catch (e) { /* nic */ }
      try { this._gl.forceContextLoss?.(); } catch (e) { /* nic */ }
    }
    this._gl = null; this._canvas = null; this._scene = null; this._listeners = null; this._timer = null;
    this._ctxLost = false; this._devW = 0; this._devH = 0;
  }

  _camera() {
    const T = this._THREE;
    const spec = holoCameraSpec(this._mode, this._devW / Math.max(1, this._devH));
    let cam;
    if (spec.type === 'ortho') cam = new T.OrthographicCamera(-spec.halfW, spec.halfW, spec.halfH, -spec.halfH, 0.01, 10);
    else cam = new T.PerspectiveCamera(spec.fov, this._devW / Math.max(1, this._devH), spec.near, spec.far);
    cam.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
    cam.up.set(spec.up[0], spec.up[1], spec.up[2]);
    cam.lookAt(spec.target[0], spec.target[1], spec.target[2]);
    return { cam, ortho: spec.type === 'ortho' };
  }

  _render() {
    if (!this._gl || this._ctxLost || !this._model) return false;
    try {
      const { cam, ortho } = this._camera();
      this._model.root.rotation.y = -Math.PI / 2 + holoYaw(this._mode, this._spinOn, 1, this._spinT);
      const u = this._mats.holo.uniforms;
      u.uOrtho.value = ortho ? 1 : 0;
      u.uTime.value = this._spinT;
      const timer = this._timer;
      let q = null;
      if (timer) { this._pollTimer(); if (!timer.active) { q = timer.c.createQuery(); timer.c.beginQuery(timer.ext.TIME_ELAPSED_EXT, q); timer.active = true; } }
      const t0 = this._now();
      if (ortho) this._renderPlan();
      else this._gl.render(this._scene, cam);
      if (q) { timer.c.endQuery(timer.ext.TIME_ELAPSED_EXT); timer.active = false; timer.pending.push(q); }
      else if (!timer && shouldSyncSample(this._renderIdx)) {
        const c = this._gl.getContext?.();
        if (c?.readPixels) { c.readPixels(0, 0, 1, 1, c.RGBA, c.UNSIGNED_BYTE, new Uint8Array(4)); this._addSample(this._now() - t0); }
      }
      this._renderIdx++; this._renders++;
      return true;
    } catch (e) {
      // Błąd renderu (np. kontekst padł w trakcie) — sylwetka zamiast wyjątku w pętli UI.
      this._ctxLost = true; this._lostCount++; this._onChange();
      return false;
    }
  }

  // Plan = rysunek techniczny jak sylwetka: bok u góry, góra u dołu — dwa obszary (viewport + scissor) tego samego płótna,
  // kamery ortogonalne dopasowane do pasów `technicalLayout` (obrys z obwódki fresnela przy uOrtho = 1).
  _renderPlan() {
    const T = this._THREE, gl = this._gl, W = this._devW, H = this._devH;
    const lay = technicalLayout(W, H, this._model.extent);
    const auto = gl.autoClear;
    gl.clear?.();
    gl.autoClear = false;
    gl.setScissorTest?.(true);
    for (const view of ['side', 'top']) {
      const c = planViewCamera(view, lay), r = c.rect;
      const cam = new T.OrthographicCamera(-c.halfW, c.halfW, c.halfH, -c.halfH, 0.01, 10);
      cam.position.set(c.pos[0], c.pos[1], c.pos[2]); cam.up.set(c.up[0], c.up[1], c.up[2]); cam.lookAt(c.target[0], c.target[1], c.target[2]);
      const vy = H - (r.y + r.h);   // viewport WebGL liczony od dołu
      gl.setViewport?.(r.x, vy, r.w, r.h); gl.setScissor?.(r.x, vy, r.w, r.h);
      gl.render(this._scene, cam);
    }
    gl.setScissorTest?.(false);
    gl.setViewport?.(0, 0, W, H);
    gl.autoClear = auto;
  }

  _pollTimer() {
    const tm = this._timer; if (!tm) return;
    const { c, ext } = tm;
    const disjoint = c.getParameter(ext.GPU_DISJOINT_EXT);
    while (tm.pending.length) {
      const q = tm.pending[0];
      if (!c.getQueryParameter(q, c.QUERY_RESULT_AVAILABLE)) break;
      const ns = c.getQueryParameter(q, c.QUERY_RESULT);
      tm.pending.shift(); c.deleteQuery(q);
      if (!disjoint) this._addSample(ns / 1e6);
    }
  }

  _addSample(ms) {
    this._samples = pushSample(this._samples, ms);
    if (!this._budgetTripped && budgetExceeded(this._samples, this.tuning.budgetMs)) {
      this._budgetTripped = true; this._dirty = true; this._onChange();
    }
  }

  _composite(ctx, rect, t) {
    const a0 = this._now();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const p = this._fadeT0 != null ? fadeProgress(this._fadeT0, t, HOLO_FADE_MS) : 1;
    if (p < 1 && this._fadeCanvas) { ctx.globalAlpha = 1 - p; ctx.drawImage(this._fadeCanvas, rect.x, rect.y, rect.w, rect.h); }
    if (p >= 1) this._fadeT0 = null;
    ctx.globalAlpha = p;
    ctx.drawImage(this._canvas, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
    this._composites++;
    this._compositeMs = pushSample(this._compositeMs, this._now() - a0);
  }

  _drawSilhouette(ctx, rect, devW, devH) {
    const model = this._model;
    if (!model) return;
    const ck = `${this._key}|${this._epoch}|${model.edgeAngle}|${devW}x${devH}`;
    let cv = this._silCache.get(ck);
    if (!cv) {
      try {
        cv = this._createCanvas(devW, devH);
        const c2 = cv.getContext('2d');
        c2.clearRect(0, 0, devW, devH);
        drawSilhouette(c2, model.segments, technicalLayout(devW, devH, model.extent), { color: this._getColor(), alpha: SIL_ALPHA,
          lineWidth: Math.max(1, devW / 900), triangles: modelTriangles(this._THREE, model), createCanvas: this._createCanvas, w: devW, h: devH });
        this._silCache.clear();          // jedna sylwetka naraz (model × epoka × próg × rozmiar)
        this._silCache.set(ck, cv);
      } catch (e) { return; }
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(cv, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
    this._composites++;
  }
}
