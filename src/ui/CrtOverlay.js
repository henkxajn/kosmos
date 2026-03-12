// CrtOverlay — efekty CRT (scanlines, vignette, sweep) na całym ekranie
//
// Lekki moduł CSS-only: trzy warstwy position:fixed pointer-events:none.
// Czyta THEME.crtEnabled/crtScanlines/crtVignette/crtSweep/crtSweepColor.
// Wywoływany automatycznie z applyTheme() przez callback w ThemeConfig.

import { THEME, setCrtUpdateCallback } from '../config/ThemeConfig.js';

let _scanlines = null;
let _vignette  = null;
let _sweep     = null;
let _style     = null;  // <style> z @keyframes

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
    _ensureSweep(THEME.crtSweep, THEME.crtSweepColor);
  } else {
    _removeScanlines();
    _removeVignette();
    _removeSweep();
    _removeStyle();
  }
}

// ── Style (keyframes) ───────────────────────────────────────────

function _ensureStyle() {
  if (_style) return;
  _style = document.createElement('style');
  _style.id = 'crt-overlay-css';
  _style.textContent = `
    @keyframes crt-sweep {
      0%   { top: -2px; }
      100% { top: 100%; }
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
    background:     'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 3px)',
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
    background:     'radial-gradient(ellipse at 50% 50%, transparent 50%, rgba(0,0,0,0.85) 100%)',
  });
  document.body.appendChild(_vignette);
}

function _removeVignette() {
  if (_vignette) { _vignette.remove(); _vignette = null; }
}

// ── Sweep (animowana linia) ─────────────────────────────────────

function _ensureSweep(enabled, color) {
  if (!enabled) { _removeSweep(); return; }
  if (!_sweep) {
    _sweep = document.createElement('div');
    _sweep.id = 'crt-sweep';
    Object.assign(_sweep.style, {
      position:       'fixed',
      left:           '0',
      right:          '0',
      height:         '2px',
      pointerEvents:  'none',
      zIndex:         String(Z),
      opacity:        '0.12',
      animation:      'crt-sweep 6s linear infinite',
    });
    document.body.appendChild(_sweep);
  }
  // Aktualizuj kolor (może się zmienić przy zmianie presetu)
  _sweep.style.background = `linear-gradient(90deg, transparent, ${color || '#ffaa40'}, transparent)`;
}

function _removeSweep() {
  if (_sweep) { _sweep.remove(); _sweep = null; }
}
