// Kontroler kamery — zoom kółkiem myszy, pan prawym przyciskiem
// Obsługuje nawigację po widoku układu słonecznego

export class CameraController {
  constructor(scene) {
    this.scene  = scene;
    this.camera = scene.cameras.main;

    // Limity zoom
    this.minZoom  = 0.08;
    this.maxZoom  = 5.0;
    this.zoomStep = 0.12;

    // Stan pan (przeciągania)
    this.isDragging  = false;
    this.lastPointer = { x: 0, y: 0 };

    this.setupControls();
  }

  setupControls() {
    const { scene } = this;

    // Zoom kółkiem myszy (w kierunku kursora)
    scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      const zoomDelta = deltaY > 0 ? -this.zoomStep : this.zoomStep;
      this.camera.zoom = Phaser.Math.Clamp(
        this.camera.zoom + zoomDelta,
        this.minZoom,
        this.maxZoom
      );
    });

    // Pan: prawy przycisk lub środkowy przycisk myszy
    scene.input.on('pointerdown', (pointer) => {
      if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
        this.isDragging  = true;
        this.lastPointer = { x: pointer.x, y: pointer.y };
      }
    });

    scene.input.on('pointermove', (pointer) => {
      if (!this.isDragging) return;

      const dx = (pointer.x - this.lastPointer.x) / this.camera.zoom;
      const dy = (pointer.y - this.lastPointer.y) / this.camera.zoom;

      this.camera.scrollX -= dx;
      this.camera.scrollY -= dy;

      this.lastPointer = { x: pointer.x, y: pointer.y };
    });

    scene.input.on('pointerup', () => {
      this.isDragging = false;
    });

    // Wyłącz menu kontekstowe przy prawym kliknięciu (żeby nie przeszkadzało)
    scene.input.mouse.disableContextMenu();
  }

  // Wyśrodkuj kamerę na podanych koordynatach (piksele)
  focusOn(x, y) {
    this.camera.setScroll(
      x - this.camera.width  / 2,
      y - this.camera.height / 2
    );
  }

  // Wróć do centrum układu (gwiazda w środku ekranu)
  resetToCenter() {
    this.focusOn(0, 0);
    this.camera.zoom = 1.0;
  }
}
