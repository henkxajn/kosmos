// CrtOverlay — efekty CRT (scanlines, vignette) na całym ekranie
//
// Lekki moduł CSS-only: dwie warstwy position:fixed pointer-events:none.
// Czyta THEME.crtEnabled/crtScanlines/crtVignette.
// Sweep usunięty z pełnoekranowego overlay — lepiej wygląda na małych panelach.
// Wywoływany automatycznie z applyTheme() przez callback w ThemeConfig.

import { THEME, setCrtUpdateCallback } from '../config/ThemeConfig.js';

let _scanlines = null;
let _vignette  = null;
let _style     = null;  // <style> z efektami globalnymi

const Z = 9999; // z-index — nad całą grą, ale pointer-events: none

// ── Publiczny init — rejestruje callback w ThemeConfig ──────────

export function initCrt() {
  setCrtUpdateCallback(updateCrt);
  updateCrt(); // zastosuj stan początkowy
}

// ── Synchronizuj overlay z aktualnym THEME ──────────────────────

export function updateCrt() {
  if (THEME.crtEnabled) {
    _ensureStyle();
    _ensureScanlines(THEME.crtScanlines);
    _ensureVignette(THEME.crtVignette);
  } else {
    _removeScanlines();
    _removeVignette();
    _removeStyle();
  }
}

// ── Style globalne (CRT text-shadow glow na Canvas kontenerach) ─

function _ensureStyle() {
  if (_style) return;
  _style = document.createElement('style');
  _style.id = 'crt-overlay-css';
  _style.textContent = `
    /* Delikatna poświata na tekście Canvas kontenerów */
    #ui-canvas, #planet-canvas {
      filter: contrast(1.08);
    }
  `;
  document.head.appendChild(_style);
}

function _removeStyle() {
  if (_style) { _style.remove(); _style = null; }
}

// ── Scanlines ───────────────────────────────────────────────────

function _ensureScanlines(enabled) {
  if (!enabled) { _removeScanlines(); return; }
  if (_scanlines) return;
  _scanlines = document.createElement('div');
  _scanlines.id = 'crt-scanlines';
  Object.assign(_scanlines.style, {
    position:       'fixed',
    inset:          '0',
    pointerEvents:  'none',
    zIndex:         String(Z),
    background:     'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 3px)',
  });
  document.body.appendChild(_scanlines);
}

function _removeScanlines() {
  if (_scanlines) { _scanlines.remove(); _scanlines = null; }
}

// ── Vignette ────────────────────────────────────────────────────

function _ensureVignette(enabled) {
  if (!enabled) { _removeVignette(); return; }
  if (_vignette) return;
  _vignette = document.createElement('div');
  _vignette.id = 'crt-vignette';
  Object.assign(_vignette.style, {
    position:       'fixed',
    inset:          '0',
    pointerEvents:  'none',
    zIndex:         String(Z),
    background:     'radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,0.7) 100%)',
  });
  document.body.appendChild(_vignette);
}

function _removeVignette() {
  if (_vignette) { _vignette.remove(); _vignette = null; }
}
