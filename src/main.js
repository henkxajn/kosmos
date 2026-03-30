// KOSMOS — punkt wejścia
// Inicjalizuje TitleScene (animowany ekran tytułowy), potem uruchamia GameScene z Three.js

import { TitleScene } from './scenes/TitleScene.js';
import { GameScene } from './scenes/GameScene.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { loadTheme, THEME } from './config/ThemeConfig.js';
import { initCrt } from './ui/CrtOverlay.js';

// Inicjalizacja i18n — import wymusza rejestrację słowników
import './i18n/i18n.js';

// Globalny stan gry (dostępny przez window.KOSMOS)
window.KOSMOS = {
  scenario:     'civilization',   // 'civilization' (aktywny) | 'generator' (zamrożony)
  civMode:      false,
  homePlanet:   null,
  savedData:    null,
};

// Uruchom ekran tytułowy
const uiCanvas    = document.getElementById('ui-canvas');
const threeCanvas = document.getElementById('three-canvas');
const eventLayer  = document.getElementById('event-layer');

// Przywróć zapisany motyw kolorystyczny + zainicjuj CRT overlay
loadTheme();
initCrt();

// AudioSystem globalny — tworzony raz, reużywany przez GameScene
window.KOSMOS.audioSystem = new AudioSystem();

const title = new TitleScene();
title.show();

// ── Loading screen (stylistyka KOSMOS) ──────────────────────────────────────
let _loadingEl = null;

window._showLoadingScreen = function () {
  // Czytaj aktualne kolory motywu (THEME jest już załadowany przez loadTheme())
  const acc = THEME.accent;
  const bg  = THEME.bgPrimary;
  const bgS = THEME.bgSecondary;
  const brd = THEME.border;
  const brdL = THEME.borderLight;
  const txtD = THEME.textDim;
  const font = THEME.fontFamily;

  // Wyciągnij RGB z accent do rgba()
  const _hexToRgba = (hex, a) => {
    const m = hex.match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
    if (!m) return hex; // fallback jeśli rgba/named
    return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})`;
  };

  _loadingEl = document.createElement('div');
  _loadingEl.id = 'loading-screen';
  _loadingEl.innerHTML = `
    <div class="ld-scanlines"></div>
    <div class="ld-vignette"></div>
    <div class="ld-content">
      <div class="ld-logo">KOSMOS</div>
      <div class="ld-sub">PLANETARY SIMULATION ENGINE</div>
      <div class="ld-bar-wrap">
        <div class="ld-bar-track"><div class="ld-bar-fill" id="loading-fill"></div></div>
        <div class="ld-pct" id="loading-pct">0%</div>
      </div>
      <div class="ld-status" id="loading-text">Inicjalizacja...</div>
    </div>
  `;
  const style = document.createElement('style');
  style.textContent = `
    #loading-screen {
      position:fixed; inset:0; z-index:9999;
      background: ${bg};
      display:flex; align-items:center; justify-content:center;
      font-family: ${font};
    }
    .ld-scanlines {
      position:absolute; inset:0; pointer-events:none; z-index:1;
      background: repeating-linear-gradient(
        0deg, transparent, transparent 2px,
        ${_hexToRgba(acc, 0.015)} 2px, ${_hexToRgba(acc, 0.015)} 4px
      );
    }
    .ld-vignette {
      position:absolute; inset:0; pointer-events:none; z-index:1;
      background: radial-gradient(ellipse at center, transparent 50%, ${bg} 100%);
    }
    .ld-content { position:relative; z-index:2; text-align:center; }
    .ld-logo {
      font-size: 52px; letter-spacing: 18px; color: ${acc};
      text-shadow: 0 0 30px ${_hexToRgba(acc, 0.25)}, 0 0 60px ${_hexToRgba(acc, 0.08)};
      margin-bottom: 6px;
      animation: ld-glow 3s ease-in-out infinite;
    }
    .ld-sub {
      font-size: 10px; letter-spacing: 6px; color: ${_hexToRgba(acc, 0.3)};
      margin-bottom: 48px;
    }
    .ld-bar-wrap { display:flex; align-items:center; gap:12px; justify-content:center; margin-bottom:20px; }
    .ld-bar-track {
      width: 280px; height: 2px;
      background: ${brd};
      border: 1px solid ${brdL};
      overflow: hidden;
    }
    .ld-bar-fill {
      height: 100%; width: 0%;
      background: linear-gradient(90deg, ${_hexToRgba(acc, 0.4)}, ${acc});
      box-shadow: 0 0 8px ${_hexToRgba(acc, 0.4)};
      transition: width 0.3s ease;
    }
    .ld-pct { font-size:10px; color:${_hexToRgba(acc, 0.5)}; min-width:32px; text-align:left; }
    .ld-status {
      font-size: 11px; color: ${txtD};
      letter-spacing: 2px; text-transform: uppercase;
    }
    @keyframes ld-glow {
      0%, 100% { text-shadow: 0 0 30px ${_hexToRgba(acc, 0.25)}, 0 0 60px ${_hexToRgba(acc, 0.08)}; }
      50%      { text-shadow: 0 0 40px ${_hexToRgba(acc, 0.4)},  0 0 80px ${_hexToRgba(acc, 0.15)}; }
    }
  `;
  _loadingEl.appendChild(style);
  document.body.appendChild(_loadingEl);
};

window._updateLoading = function (progress, text) {
  const fill = document.getElementById('loading-fill');
  const pct  = document.getElementById('loading-pct');
  const txt  = document.getElementById('loading-text');
  const p = Math.min(100, Math.round(progress));
  if (fill) fill.style.width = `${p}%`;
  if (pct)  pct.textContent = `${p}%`;
  if (txt && text) txt.textContent = text;
};

window._hideLoadingScreen = function () {
  if (!_loadingEl) return;
  _loadingEl.style.transition = 'opacity 0.6s ease';
  _loadingEl.style.opacity = '0';
  setTimeout(() => { _loadingEl?.remove(); _loadingEl = null; }, 600);
};

// Wywoływane przez TitleScene po wyborze gracza
window._startMainGame = function () {
  const scene = new GameScene();
  scene.start(threeCanvas, uiCanvas, eventLayer);
};
