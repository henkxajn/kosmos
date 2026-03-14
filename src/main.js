// KOSMOS — punkt wejścia
// Inicjalizuje TitleScene (animowany ekran tytułowy), potem uruchamia GameScene z Three.js

import { TitleScene } from './scenes/TitleScene.js';
import { GameScene } from './scenes/GameScene.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { loadTheme } from './config/ThemeConfig.js';
import { initCrt } from './ui/CrtOverlay.js';

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

// Wywoływane przez TitleScene po wyborze gracza
window._startMainGame = function () {
  const scene = new GameScene();
  scene.start(threeCanvas, uiCanvas, eventLayer);
};
