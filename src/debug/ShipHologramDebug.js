// ShipHologramDebug — podgląd hologramu statku dla właściciela (ARC KONSOLE K1a, docs/design/CONSOLES_PLAN.md §2).
// Bez cudzysłowów (wklejka właściciela zamienia cudzysłowy na typograficzne):
//   KOSMOS.debug.holo.open()        — hologram w wyśrodkowanym prostokącie 900×640 nad żywą, przyciemnioną sceną (bez innych zmian UI)
//   KOSMOS.debug.holo.next() / prev() — kolejny / poprzedni z 24 kluczy modeli (nazwa w małej etykiecie)
//   KOSMOS.debug.holo.plan()        — przełącz widok 3/4 ↔ plan (rysunek techniczny: bok u góry, góra u dołu, dziób w lewo)
//   KOSMOS.debug.holo.spin()        — przełącz auto-obrót (widok 3/4)
//   KOSMOS.debug.holo.silhouette()  — przełącz wymuszoną sylwetkę (fallback D-K-11)
//   KOSMOS.debug.holo.tune.edgeAngle = 50 — pokrętła: edgeAngle, edgeAlpha, rim, scan, spin, budgetMs, xray (liczby; skutek od następnej klatki)
//   KOSMOS.debug.holo.info()        — { model, mode, gpuMsMedian, fallback, reason, … }
//   KOSMOS.debug.holo.reset()       — pokrętła domyślne · KOSMOS.debug.holo.close() — zamknij i zwolnij kontekst WebGL
//   KOSMOS.debug.holo.anchors()     — K1b: przełącz znaczniki kotwic modułów (rola + odnośnik; jasne = plik właściciela,
//                                     przygaszone = domyślne gry); KOSMOS.debug.holo.anchorsInfo() — kotwice bieżącego modelu
// Etykieta to napis debug (bez i18n).

import { THEME } from '../config/ThemeConfig.js';
import { resolveHudRoles } from '../ui/HudPalette.js';
import { ShipHologramRenderer } from '../renderer/ShipHologramRenderer.js';
import { drawShipAnchors } from '../ui/ShipAnchorOverlay.js';
import { HOLO_TUNING, HOLO_KNOB_RANGES, tuneHologram, resetHologramTuning, cycleModelKey, debugViewerRect } from '../renderer/ShipHologramLogic.js';

/** Gospodarz podglądu: rysowany przez UIManager (`_holoDebug`) na końcu `_draw`, gdy otwarty. */
export class HologramDebugViewer {
  constructor({ onChange = () => {}, rendererOpts = {} } = {}) {
    this.isOpen = false;
    this._onChange = onChange;
    this.renderer = new ShipHologramRenderer({ onChange, ...rendererOpts });
    this._key = 'warp_frigate';
    this.lastRect = null;
    this.showAnchors = false;         // K1b
    this.lastAnchors = null;
  }
  open() { this.isOpen = true; this.renderer.setModel(this._key); this._onChange(); }
  close() { this.isOpen = false; this.renderer.release(); this._onChange(); }
  cycle(dir) { this._key = cycleModelKey(this.renderer.modelKey ?? this._key, dir); this.renderer.setModel(this._key); this._onChange(); return this._key; }
  isAnimating() { return this.isOpen && this.renderer.isAnimating(); }
  draw(ctx, viewW, viewH) {
    if (!this.isOpen) return;
    const r = debugViewerRect(viewW, viewH);
    this.lastRect = r;
    this.renderer.draw(ctx, r);
    const inf = this.renderer.info();
    const roles = resolveHudRoles(THEME);
    ctx.save();
    ctx.font = `${THEME.fontSizeSmall ?? 10}px ${THEME.fontFamily ?? 'monospace'}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = roles.dim;
    const label = [inf.model ?? inf.pending ?? '-', inf.mode, inf.fallback ? 'sil:' + inf.reason : null, inf.pending ? 'load ' + inf.pending : null]
      .filter(Boolean).join('  ');
    ctx.fillText(label, r.x + 8, r.y + 6);
    ctx.restore();
    if (this.showAnchors) {
      this.lastAnchors = drawShipAnchors(ctx, this.renderer, r, {
        roles, font: `${THEME.fontSizeSmall ?? 10}px ${THEME.fontFamily ?? 'monospace'}`,
      });
    }
  }
}

export function shipHologramDebugHelpers({ getUIManager = null } = {}) {
  let viewer = null;
  const ui = () => (getUIManager ? getUIManager() : null) ?? window.KOSMOS?.uiManager ?? null;
  const dirty = () => { const u = ui(); if (u) u._dirty = true; };
  const need = () => viewer?.isOpen ? null : 'closed — KOSMOS.debug.holo.open()';
  const tune = new Proxy(HOLO_TUNING, {
    set(obj, k, v) {
      if (k in HOLO_KNOB_RANGES) { tuneHologram({ [k]: v }); viewer?.renderer.markDirty(); dirty(); }
      return true;
    },
  });
  return {
    holo: {
      open: () => {
        viewer ??= new HologramDebugViewer({ onChange: dirty });
        viewer.open();
        const u = ui(); if (u) u._holoDebug = viewer;
        return viewer.renderer.info();
      },
      close: () => { if (!viewer) return 'closed'; viewer.close(); const u = ui(); if (u && u._holoDebug === viewer) u._holoDebug = null; return 'closed'; },
      next: () => need() ?? viewer.cycle(1),
      prev: () => need() ?? viewer.cycle(-1),
      plan: () => need() ?? (viewer.renderer.setMode(viewer.renderer.mode === 'plan' ? '3q' : 'plan'), dirty(), viewer.renderer.mode),
      spin: () => need() ?? (dirty(), viewer.renderer.setSpin(!viewer.renderer._spinOn)),
      silhouette: () => need() ?? (dirty(), viewer.renderer.setForcedFallback(!viewer.renderer._forced)),
      info: () => viewer ? { open: viewer.isOpen, ...viewer.renderer.info(), tune: { ...HOLO_TUNING } } : 'closed',
      tune,
      reset: () => { const r = resetHologramTuning(); viewer?.renderer.markDirty(); dirty(); return r; },
      anchors: () => need() ?? (viewer.showAnchors = !viewer.showAnchors, dirty(), viewer.showAnchors ? 'anchors on' : 'anchors off'),
      anchorsInfo: () => {
        if (need()) return need();
        const a = viewer.renderer.anchors();
        if (!a) return 'loading';
        return { model: a.slot, fromFile: a.fromFile, fileOk: a.fileOk, anchors: a.anchors.map((x) => x.role + ' ' + x.src + ' ' + x.p.join(' ')) };
      },
      _viewer: () => viewer,
    },
  };
}
