// Scena startowa — ekran ładowania, dialog wyboru gry
// Przepisana: bez Phasera, Canvas 2D na #ui-canvas

import { SaveSystem } from '../systems/SaveSystem.js';

const W = window.innerWidth;
const H = window.innerHeight;

export class BootScene {
  constructor(uiCanvas) {
    uiCanvas.width  = W;
    uiCanvas.height = H;
    this.canvas      = uiCanvas;
    this.ctx         = uiCanvas.getContext('2d');
    this._hoveredBtn = null;
  }

  // Pokaż ekran startowy
  show() {
    this._btns = {};
    this._drawStatic();
    this._setupInput();
  }

  _drawStatic() {
    this._btns = {};
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    // Tytuł
    ctx.font      = '52px monospace';
    ctx.fillStyle = '#88ffcc';
    ctx.textAlign = 'center';
    ctx.fillText('K O S M O S', W / 2, H / 2 - 60);

    ctx.font      = '16px monospace';
    ctx.fillStyle = '#6888aa';
    ctx.fillText('Symulator Układu Słonecznego', W / 2, H / 2 - 20);

    ctx.textAlign = 'left';

    const savedTime = SaveSystem.hasSave();
    if (savedTime !== null) {
      this._drawContinueDialog(savedTime);
    } else {
      this._drawNewGameDialog();
    }
  }

  _drawNewGameDialog() {
    const ctx = this.ctx;
    const PW = 400, PH = 100;
    const PX = W / 2 - PW / 2;
    const PY = H / 2 + 30;

    this._roundRect(ctx, PX, PY, PW, PH);

    ctx.font      = '12px monospace';
    ctx.fillStyle = '#6888aa';
    ctx.textAlign = 'center';
    ctx.fillText('Wybierz tryb gry:', W / 2, PY + 22);

    this._drawBtn(ctx, W / 2 - 100, PY + 50, '[ NOWY UKŁAD ]',  '#88ffcc', 'new');
    this._drawBtn(ctx, W / 2 + 100, PY + 50, '[ EDEN — TEST ]', '#aaddff', 'eden');

    ctx.font      = '8px monospace';
    ctx.fillStyle = '#2a4060';
    ctx.textAlign = 'center';
    ctx.fillText('idealna orbita, szybkie życie', W / 2 + 100, PY + 68);

    ctx.textAlign = 'left';
  }

  _drawContinueDialog(savedTime) {
    const ctx = this.ctx;
    const PW = 360, PH = 90;
    const PX = W / 2 - PW / 2;
    const PY = H / 2 + 30;

    this._roundRect(ctx, PX, PY, PW, PH);

    const years = Math.round(savedTime).toLocaleString('pl-PL');
    ctx.font      = '13px monospace';
    ctx.fillStyle = '#c8e8ff';
    ctx.textAlign = 'center';
    ctx.fillText(`Zapisana gra: ${years} lat`, W / 2, PY + 22);

    ctx.font      = '11px monospace';
    ctx.fillStyle = '#6888aa';
    ctx.fillText('Kontynuować tę grę?', W / 2, PY + 40);

    this._drawBtn(ctx, W / 2 - 70,  PY + 66, '[ TAK — KONTYNUUJ ]', '#88ffcc', 'yes');
    this._drawBtn(ctx, W / 2 + 55,  PY + 66, '[ NOWA GRA ]',         '#ff8888', 'new');

    ctx.textAlign = 'left';
  }

  _drawBtn(ctx, x, y, label, color, id) {
    const hover = this._hoveredBtn === id;
    ctx.font      = '11px monospace';
    ctx.fillStyle = hover ? '#ffffff' : color;
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y);

    // Zapisz rect przycisku do detekcji — musi być po ustawieniu fontu
    const tw = ctx.measureText(label).width;
    const pad = 10;
    this._btns[id] = { x: x - tw / 2 - pad, y: y - 14, w: tw + pad * 2, h: 22 };
  }

  _roundRect(ctx, x, y, w, h) {
    ctx.fillStyle   = 'rgba(17,24,40,0.95)';
    ctx.strokeStyle = '#2a4060';
    ctx.lineWidth   = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }

  _setupInput() {
    const onClick = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mx   = e.clientX - rect.left;
      const my   = e.clientY - rect.top;
      const btn  = this._detectBtn(mx, my);
      if (btn) {
        document.removeEventListener('click',     onClick);
        document.removeEventListener('mousemove', onMove);
        this._handleBtn(btn);
      }
    };

    const onMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mx   = e.clientX - rect.left;
      const my   = e.clientY - rect.top;
      const btn  = this._detectBtn(mx, my);
      if (btn !== this._hoveredBtn) {
        this._hoveredBtn        = btn;
        document.body.style.cursor = btn ? 'pointer' : 'default';
        this._drawStatic();
      }
    };

    document.addEventListener('click',     onClick);
    document.addEventListener('mousemove', onMove);
  }

  _detectBtn(mx, my) {
    for (const [id, r] of Object.entries(this._btns || {})) {
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return id;
    }
    return null;
  }

  _handleBtn(btn) {
    if (btn === 'yes') {
      window.KOSMOS.savedData    = SaveSystem.loadData();
      window.KOSMOS.edenScenario = false;
    } else if (btn === 'new') {
      SaveSystem.clearSave();
      window.KOSMOS.savedData    = null;
      window.KOSMOS.edenScenario = false;
    } else if (btn === 'eden') {
      SaveSystem.clearSave();
      window.KOSMOS.savedData    = null;
      window.KOSMOS.edenScenario = true;
    }

    // Wyczyść boot screen
    this.ctx.clearRect(0, 0, W, H);
    document.getElementById('event-layer').style.cursor = 'default';

    // Uruchom główną grę
    window._startMainGame();
  }
}
