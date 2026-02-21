export class Camera2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.zoom = 0.12;
    this.offsetX = canvas.width / 2;
    this.offsetY = canvas.height / 2;
    this.followId = null;

    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;

    this._installEvents();
    this._resizeObserver();
  }

  _resizeObserver() {
    const resize = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      this.canvas.width = Math.floor(this.canvas.clientWidth * dpr);
      this.canvas.height = Math.floor(this.canvas.clientHeight * dpr);
      if (!this._dragging) {
        this.offsetX = this.canvas.width / 2;
        this.offsetY = this.canvas.height / 2;
      }
    };
    window.addEventListener("resize", resize);
    resize();
  }

  _installEvents() {
    const c = this.canvas;

    c.addEventListener("mousedown", (e) => {
      this._dragging = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    });

    window.addEventListener("mouseup", () => (this._dragging = false));

    window.addEventListener("mousemove", (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;

      const dpr = Math.max(1, window.devicePixelRatio || 1);
      this.offsetX += dx * dpr;
      this.offsetY += dy * dpr;
      this.followId = null;
    });

    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const mx = e.clientX * dpr;
      const my = e.clientY * dpr;

      const zoomFactor = Math.exp(-e.deltaY * 0.0012);
      const newZoom = Math.max(0.02, Math.min(3.0, this.zoom * zoomFactor));

      const k = newZoom / this.zoom;
      this.offsetX = mx - (mx - this.offsetX) * k;
      this.offsetY = my - (my - this.offsetY) * k;

      this.zoom = newZoom;
    }, { passive: false });
  }

  setFollow(id) { this.followId = id; }

  setOffsetToCenterWorld(baseNoOffset) {
    this.offsetX = this.canvas.width / 2 - baseNoOffset.x;
    this.offsetY = this.canvas.height / 2 - baseNoOffset.y;
  }

  reset() {
    this.zoom = 0.12;
    this.offsetX = this.canvas.width / 2;
    this.offsetY = this.canvas.height / 2;
    this.followId = null;
  }
}
