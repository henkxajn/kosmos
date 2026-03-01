// KOSMOS — nowy punkt wejścia (bez Phasera)
// Inicjalizuje BootScene na Canvas 2D, potem uruchamia GameScene z Three.js

import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';

// Globalny stan gry (dostępny przez window.KOSMOS)
window.KOSMOS = {
  edenScenario: false,
  civMode:      false,
  homePlanet:   null,
  savedData:    null,
};

// Uruchom ekran startowy na #ui-canvas
const uiCanvas    = document.getElementById('ui-canvas');
const threeCanvas = document.getElementById('three-canvas');
const eventLayer  = document.getElementById('event-layer');

const boot = new BootScene(uiCanvas);
boot.show();

// Wywoływane przez BootScene po wyborze gracza
window._startMainGame = function () {
  const scene = new GameScene();
  scene.start(threeCanvas, uiCanvas, eventLayer);
};
