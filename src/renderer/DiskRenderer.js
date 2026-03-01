// Renderer dysku protoplanetarnego
// Rysuje planetezymale jako małe piksele na jednym obiekcie Graphics
// Komunikacja: nasłuchuje 'disk:updated' z AccretionSystem

import EventBus from '../core/EventBus.js';

export class DiskRenderer {
  constructor(scene) {
    this.scene          = scene;
    this._planetesimals = [];

    // Jeden obiekt Graphics dla całego dysku (clear+redraw co update)
    this.gfx = scene.add.graphics().setDepth(2);

    // Nasłuchuj na zmiany dysku
    EventBus.on('disk:updated', ({ planetesimals }) => {
      this._planetesimals = planetesimals;
      this._redraw();
    });
  }

  // Inicjalizacja przy starcie (bez zdarzenia)
  init(planetesimals) {
    this._planetesimals = planetesimals;
    this._redraw();
  }

  _redraw() {
    const gfx = this.gfx;
    gfx.clear();

    this._planetesimals.forEach(p => {
      // Deterministyczny odcień szarości — nie random() (zapobiega migotaniu)
      const brightness = 0.25 + (p.id % 9) * 0.04;   // 0.25 – 0.57
      gfx.fillStyle(0xaabbcc, brightness);

      // Rozmiar: większe ciała = 2px, mniejsze = 1px
      const size = p.mass > 0.02 ? 2 : 1;
      gfx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    });
  }

  destroy() {
    this.gfx.destroy();
  }
}
