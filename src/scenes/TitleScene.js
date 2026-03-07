// TitleScene — animowany ekran tytułowy KOSMOS
// Star field + układ słoneczny na Canvas + HTML overlay z przyciskami.
// Fonty lokalne (assets/fonts/) — działa offline.

import { SaveSystem } from '../systems/SaveSystem.js';
import { migrate }    from '../systems/SaveMigration.js';

export class TitleScene {
  constructor() {
    this._raf = null;
    this._container = null;
    this._canvas = null;
    this._ctx = null;
    this._stars = [];
    this._dust = [];
    this._shootingStar = null;
    this._nextShootTime = 5000 + Math.random() * 10000;

    // Układ słoneczny w tle
    this._orbits = [0.07, 0.12, 0.18, 0.26, 0.37];
    let seed = 4451;
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    this._planetAngles = this._orbits.map(() => rand() * Math.PI * 2);
    this._planetSpeeds = [0.08, 0.05, 0.035, 0.02, 0.012];

    // Planeta hero — tekstura z pre-generowanego PNG
    this._heroPlanetTex = new Image();
    this._heroPlanetTex.src = './assets/planet-textures/iron_02_diffuse.png';
  }

  show() {
    this._buildDOM();
    this._generateStars();
    this._generateDust();
    this._animate(0);
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._container) this._container.remove();
    document.body.style.cursor = 'default';
  }

  // ── DOM ──────────────────────────────────────────────────────

  _buildDOM() {
    // Kontener na cały title screen
    const c = document.createElement('div');
    c.id = 'title-screen';
    c.style.cssText = `
      position: fixed; top:0; left:0; width:100%; height:100%;
      z-index: 1000; background: #000;
    `;

    // Canvas na star field
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%;';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    c.appendChild(canvas);
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');

    // Atmospheric layers (CSS) — insertAdjacentHTML aby nie niszczyć canvas
    c.insertAdjacentHTML('beforeend', `
      <div style="position:absolute;top:0;left:0;width:100%;height:100%;
        background:radial-gradient(ellipse at 50% 40%,transparent 30%,
        rgba(0,0,0,0.4) 60%,rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>

      <div style="position:absolute;top:-20%;left:20%;width:60%;height:50%;
        background:radial-gradient(ellipse,rgba(0,255,180,0.015) 0%,transparent 70%);
        pointer-events:none;animation:kosmos-breathe 8s ease-in-out infinite;"></div>

      <div style="position:absolute;top:30%;left:50%;width:40%;height:40%;
        background:radial-gradient(ellipse,rgba(0,200,255,0.015) 0%,transparent 60%);
        pointer-events:none;"></div>

      <div style="position:absolute;top:20%;left:50%;width:1px;height:30%;
        transform:translateX(-50%);pointer-events:none;
        background:linear-gradient(180deg,transparent,rgba(0,255,180,0.03) 30%,
        rgba(0,255,180,0.05) 50%,rgba(0,255,180,0.03) 70%,transparent);"></div>

      <div style="position:absolute;bottom:44%;left:0;width:100%;height:1px;
        pointer-events:none;
        background:linear-gradient(90deg,transparent 10%,rgba(0,255,180,0.06) 30%,
        rgba(0,255,180,0.12) 50%,rgba(0,255,180,0.06) 70%,transparent 90%);"></div>
    `);

    // Overlay z tytułem
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:absolute; top:0; left:0; width:100%; height:100%;
      display:flex; flex-direction:column; align-items:center; justify-content:flex-start;
      padding-top:18vh;
    `;
    overlay.innerHTML = this._buildUI();
    c.appendChild(overlay);

    // Style animacji i @font-face (dodaj do head raz)
    if (!document.getElementById('kosmos-styles')) {
      const style = document.createElement('style');
      style.id = 'kosmos-styles';
      style.textContent = `
        /* Lokalne fonty — offline */
        @font-face {
          font-family: 'Cinzel';
          font-style: normal; font-weight: 400; font-display: swap;
          src: url('./assets/fonts/cinzel-400-latin-ext.woff2') format('woff2');
          unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
        }
        @font-face {
          font-family: 'Cinzel';
          font-style: normal; font-weight: 400; font-display: swap;
          src: url('./assets/fonts/cinzel-400-latin.woff2') format('woff2');
          unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
        }
        @font-face {
          font-family: 'Outfit';
          font-style: normal; font-weight: 200; font-display: swap;
          src: url('./assets/fonts/outfit-latin-ext.woff2') format('woff2');
          unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
        }
        @font-face {
          font-family: 'Outfit';
          font-style: normal; font-weight: 200; font-display: swap;
          src: url('./assets/fonts/outfit-latin.woff2') format('woff2');
          unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
        }
        @font-face {
          font-family: 'Outfit';
          font-style: normal; font-weight: 300; font-display: swap;
          src: url('./assets/fonts/outfit-latin-ext.woff2') format('woff2');
          unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
        }
        @font-face {
          font-family: 'Outfit';
          font-style: normal; font-weight: 300; font-display: swap;
          src: url('./assets/fonts/outfit-latin.woff2') format('woff2');
          unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
        }
        @font-face {
          font-family: 'Outfit';
          font-style: normal; font-weight: 400; font-display: swap;
          src: url('./assets/fonts/outfit-latin-ext.woff2') format('woff2');
          unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
        }
        @font-face {
          font-family: 'Outfit';
          font-style: normal; font-weight: 400; font-display: swap;
          src: url('./assets/fonts/outfit-latin.woff2') format('woff2');
          unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
        }

        @keyframes kosmos-breathe { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.05)} }
        @keyframes kosmos-title { 0%{opacity:0;transform:translateY(20px);letter-spacing:80px} 60%{opacity:.7} 100%{opacity:1;transform:translateY(0);letter-spacing:42px} }
        @keyframes kosmos-sub { 0%{opacity:0;letter-spacing:30px} 100%{opacity:1;letter-spacing:14px} }
        @keyframes kosmos-fade { 0%{opacity:0} 100%{opacity:1} }
        @keyframes kosmos-shimmer { 0%,100%{background-position:-200% 0} 50%{background-position:200% 0} }
        @keyframes kosmos-line { 0%{opacity:0;width:0} 100%{opacity:1;width:200px} }

        .kosmos-title {
          font-family:'Cinzel',serif; font-weight:400;
          font-size:clamp(50px,11vw,140px); letter-spacing:42px; text-indent:42px;
          color:transparent; line-height:1; text-transform:uppercase;
          background:linear-gradient(180deg,rgba(200,255,230,0.95),rgba(100,255,200,0.85) 40%,rgba(0,180,130,0.55) 70%,rgba(0,100,70,0.2));
          -webkit-background-clip:text; background-clip:text;
          animation: kosmos-title 3s ease-out forwards; opacity:0;
        }
        .kosmos-subtitle {
          font-family:'Outfit',sans-serif; font-weight:200;
          font-size:clamp(10px,1.6vw,16px); letter-spacing:14px; text-indent:14px;
          text-transform:uppercase; color:rgba(160,200,190,0.35);
          animation: kosmos-sub 2s ease-out 2s forwards; opacity:0;
          margin-top:12px;
        }
        .kosmos-divider {
          width:200px; height:1px; margin:20px auto 0;
          background:linear-gradient(90deg,transparent,rgba(0,255,180,0.25),transparent);
          animation: kosmos-line 1.5s ease-out 2.5s forwards; opacity:0;
          position:relative;
        }
        .kosmos-divider::after {
          content:''; position:absolute; top:-2px; left:50%; transform:translateX(-50%);
          width:5px; height:5px; border-radius:50%;
          background:rgba(0,255,180,0.2);
          box-shadow:0 0 10px rgba(0,255,180,0.15);
        }
        .kosmos-buttons {
          position:absolute; top:60%; left:50%; transform:translateX(-50%);
          display:flex; flex-direction:column; gap:12px; align-items:center;
          animation: kosmos-fade 1.5s ease-out 3.5s forwards; opacity:0;
        }
        .kosmos-btn {
          font-family:'Outfit',sans-serif; font-weight:400;
          font-size:13px; letter-spacing:6px; text-transform:uppercase;
          color:rgba(160,200,190,0.5); background:none; border:none;
          padding:10px 30px; cursor:pointer; transition:all 0.4s;
          border:1px solid rgba(0,255,180,0.08); border-radius:0;
          pointer-events:all;
        }
        .kosmos-btn:hover {
          color:rgba(200,255,230,0.9); border-color:rgba(0,255,180,0.2);
          background:rgba(0,255,180,0.03);
          box-shadow:0 0 30px rgba(0,255,180,0.05);
          letter-spacing:8px;
        }
        .kosmos-btn.primary { color:rgba(160,230,200,0.7); border-color:rgba(0,255,180,0.15); }
        .kosmos-btn.primary:hover { color:#fff; border-color:rgba(0,255,180,0.3); }
        .kosmos-save-info {
          font-family:'Outfit',sans-serif; font-weight:300;
          font-size:11px; letter-spacing:4px; text-transform:uppercase;
          color:rgba(160,200,190,0.3); margin-bottom:4px;
        }
        .kosmos-footer {
          position:fixed; bottom:5%; left:0; right:0; text-align:center;
          font-family:'Outfit',sans-serif; font-weight:200;
          font-size:10px; letter-spacing:5px; text-transform:uppercase;
          color:rgba(160,200,190,0.15);
          animation: kosmos-fade 2s ease-out 5s forwards; opacity:0;
          pointer-events:none;
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(c);
    this._container = c;

    // Bind buttons
    c.querySelectorAll('.kosmos-btn').forEach(btn => {
      btn.addEventListener('click', () => this._handleChoice(btn.dataset.action));
    });
  }

  _buildUI() {
    const savedTime = SaveSystem.hasSave();
    let buttons = '';

    if (savedTime !== null) {
      const years = Math.round(savedTime).toLocaleString('pl-PL');
      buttons = `
        <div class="kosmos-buttons">
          <div class="kosmos-save-info">Zapisana gra — ${years} lat</div>
          <button class="kosmos-btn primary" data-action="continue">Kontynuuj</button>
          <button class="kosmos-btn" data-action="new">Nowa gra</button>
          <button class="kosmos-btn" data-action="power_test">Power Test</button>
        </div>
      `;
    } else {
      buttons = `
        <div class="kosmos-buttons">
          <button class="kosmos-btn primary" data-action="new">Nowa gra</button>
          <button class="kosmos-btn" data-action="power_test">Power Test</button>
        </div>
      `;
    }

    return `
      <div style="text-align:center">
        <div class="kosmos-title">KOSMOS</div>
        <div class="kosmos-subtitle">Beyond the celestial sphere</div>
        <div class="kosmos-divider"></div>
        ${buttons}
      </div>
      <div class="kosmos-footer">A cosmic 4X experience</div>
    `;
  }

  // ── Wybór scenariusza ───────────────────────────────────────

  _handleChoice(action) {
    if (action === 'continue') {
      let saveData = SaveSystem.loadData();
      if (saveData) {
        saveData = migrate(saveData);
        if (saveData.error) {
          console.error('[TitleScene] Migracja save:', saveData.message);
          alert(saveData.message);
          SaveSystem.clearSave();
          window.location.reload();
          return;
        }
      }
      window.KOSMOS.savedData = saveData;
      window.KOSMOS.scenario  = 'civilization';
    } else if (action === 'new') {
      SaveSystem.clearSave();
      window.KOSMOS.savedData = null;
      window.KOSMOS.scenario  = 'civilization';
    } else if (action === 'power_test') {
      SaveSystem.clearSave();
      window.KOSMOS.savedData = null;
      window.KOSMOS.scenario  = 'power_test';
    }

    // Fade out title screen
    this._container.style.transition = 'opacity 1.5s ease-out';
    this._container.style.opacity = '0';

    setTimeout(() => {
      this.destroy();
      window._startMainGame();
    }, 1500);
  }

  // ── Star field rendering ────────────────────────────────────

  // ── Planeta hero — pre-gen PNG + terminator ────────────────
  _drawHeroPlanet(ctx, W, H, t, sunX, sunY) {
    const tex = this._heroPlanetTex;
    if (!tex.complete || !tex.naturalWidth) return; // czekaj na załadowanie

    const cx = W * 0.5;             // Centrum — środek ekranu
    const cy = H * 0.46;            // Między słońcem (0.4) a linią (0.56)
    const pr = Math.min(W, H) * 0.022; // Promień — mały odległy księżyc
    const texW = tex.naturalWidth;
    const texH = tex.naturalHeight;

    // Rotacja pozioma (U) i pionowa (V — nachylenie osi)
    const scrollU = (t * 0.033 % 1); // ±15% przesunięcia V — wolna oscylacja

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, pr, 0, Math.PI * 2);
    ctx.clip();

    // Mapowanie cylindryczne na sferę — pionowe paski z asin() kompresją
    const slices = 48;
    for (let i = 0; i < slices; i++) {
      const xNorm = (i + 0.5) / slices;    // 0..1
      const xSphere = (xNorm - 0.5) * 2;   // -1..1
      if (Math.abs(xSphere) >= 0.999) continue;

      // Pozycja UV na teksturze (asin daje sferyczną kompresję na brzegach)
      const u = Math.asin(xSphere) / Math.PI + 0.5;
      const halfH = Math.sqrt(1 - xSphere * xSphere);

      const srcX = ((u + scrollU) % 1) * texW;
      const srcW = Math.max(1, texW / slices * 0.7);
      const dstX = cx - pr + xNorm * pr * 2;
      const dstW = (pr * 2) / slices + 0.5;
      const dstH = halfH * pr;

      ctx.drawImage(tex,
        srcX, 0, srcW, texH,
        dstX, cy - dstH, dstW, dstH * 2
      );
    }

    // ── Terminator — oświetlenie od słońca (góra-lewo) ─────
    const dx = sunX - cx, dy = sunY - cy;
    const lightAngle = Math.atan2(dy, dx);

    // Gradient: oświetlona strona → terminator → ciemna strona
    const termGrad = ctx.createLinearGradient(
      cx + Math.cos(lightAngle) * pr, cy + Math.sin(lightAngle) * pr,
      cx - Math.cos(lightAngle) * pr, cy - Math.sin(lightAngle) * pr
    );
    termGrad.addColorStop(0.0,  'rgba(0,0,0,0)');
    termGrad.addColorStop(0.3,  'rgba(0,0,0,0)');
    termGrad.addColorStop(0.45, 'rgba(0,0,0,0.3)');
    termGrad.addColorStop(0.55, 'rgba(0,0,0,0.7)');
    termGrad.addColorStop(0.7,  'rgba(0,0,0,0.92)');
    termGrad.addColorStop(1.0,  'rgba(0,0,0,0.98)');
    ctx.fillStyle = termGrad;
    ctx.fillRect(cx - pr, cy - pr, pr * 2, pr * 2);

    // Sferyczny cieniowanie (limb darkening) — krawędzie ciemniejsze
    const limbGrad = ctx.createRadialGradient(cx, cy, pr * 0.3, cx, cy, pr);
    limbGrad.addColorStop(0, 'rgba(0,0,0,0)');
    limbGrad.addColorStop(0.7, 'rgba(0,0,0,0)');
    limbGrad.addColorStop(1.0, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = limbGrad;
    ctx.fillRect(cx - pr, cy - pr, pr * 2, pr * 2);

    ctx.restore();
  }

  _generateStars() {
    let seed = 7741;
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

    for (let i = 0; i < 800; i++) {
      const depth = rand();
      this._stars.push({
        x: rand() * 2 - 0.5,
        y: rand(),
        size: depth < 0.3 ? 0.3 : depth < 0.7 ? 0.6 : 1.0 + rand() * 0.8,
        brightness: 0.2 + depth * 0.6 + rand() * 0.2,
        twinkleSpeed: 0.5 + rand() * 3,
        twinkleOffset: rand() * Math.PI * 2,
        // 12% kolorowych, więcej chłodnych
        hue: rand() < 0.12 ? (rand() < 0.4 ? 160 + rand() * 30 : 200 + rand() * 30) : 0,
        saturation: rand() < 0.12 ? 30 + rand() * 40 : 0,
      });
    }
  }

  _generateDust() {
    let seed = 3319;
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

    for (let i = 0; i < 12; i++) {
      this._dust.push({
        x: 0.1 + rand() * 0.8, y: 0.15 + rand() * 0.7,
        radius: 0.05 + rand() * 0.15,
        // Pół teal, pół blue-teal
        hue: rand() < 0.5 ? 160 + rand() * 20 : 190 + rand() * 30,
        alpha: 0.008 + rand() * 0.012,
        drift: (rand() - 0.5) * 0.00002,
      });
    }
  }

  _animate(time) {
    this._raf = requestAnimationFrame(t => this._animate(t));
    const t = time * 0.001;
    const ctx = this._ctx;
    const W = this._canvas.width;
    const H = this._canvas.height;

    // Tło — teal dark
    ctx.fillStyle = '#020405';
    ctx.fillRect(0, 0, W, H);

    // Dust clouds
    for (const cloud of this._dust) {
      cloud.x += cloud.drift;
      const cx = cloud.x * W, cy = cloud.y * H;
      const r = cloud.radius * Math.min(W, H);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const pulse = 1 + Math.sin(t * 0.3 + cloud.x * 10) * 0.2;
      grad.addColorStop(0, `hsla(${cloud.hue},40%,50%,${cloud.alpha * pulse})`);
      grad.addColorStop(0.5, `hsla(${cloud.hue},30%,30%,${cloud.alpha * 0.3 * pulse})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    // ── Układ słoneczny w tle ──────────────────────────────────

    const scx = W * 0.5, scy = H * 0.4;
    const sr = Math.min(W, H) * 0.018;
    const spulse = 1 + Math.sin(t * 0.4) * 0.08;

    // Szeroka atmosfera słońca
    const sg3 = ctx.createRadialGradient(scx, scy, 0, scx, scy, sr * 12 * spulse);
    sg3.addColorStop(0, 'rgba(255,200,120,0.012)');
    sg3.addColorStop(0.3, 'rgba(255,180,100,0.006)');
    sg3.addColorStop(1, 'transparent');
    ctx.fillStyle = sg3;
    ctx.fillRect(scx - sr * 12, scy - sr * 12, sr * 24, sr * 24);

    // Rdzeń słońca
    const sg1 = ctx.createRadialGradient(scx, scy, 0, scx, scy, sr * spulse);
    sg1.addColorStop(0, 'rgba(255,240,200,0.12)');
    sg1.addColorStop(0.5, 'rgba(255,200,140,0.04)');
    sg1.addColorStop(1, 'transparent');
    ctx.fillStyle = sg1;
    ctx.beginPath(); ctx.arc(scx, scy, sr * spulse, 0, Math.PI * 2); ctx.fill();

    // Gorący środek
    const sg2 = ctx.createRadialGradient(scx, scy, 0, scx, scy, sr * 0.25);
    sg2.addColorStop(0, 'rgba(255,250,230,0.15)');
    sg2.addColorStop(1, 'transparent');
    ctx.fillStyle = sg2;
    ctx.beginPath(); ctx.arc(scx, scy, sr * 0.25, 0, Math.PI * 2); ctx.fill();

    // Orbity + planety
    for (let i = 0; i < this._orbits.length; i++) {
      const rx = this._orbits[i] * W;
      const ry = this._orbits[i] * H * 0.35;

      // Orbit ring
      ctx.beginPath();
      ctx.ellipse(scx, scy, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0,255,180,${0.02 + i * 0.005})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Planet dot
      this._planetAngles[i] += this._planetSpeeds[i] * 0.016;
      const px = scx + Math.cos(this._planetAngles[i]) * rx;
      const py = scy + Math.sin(this._planetAngles[i]) * ry;
      const ps = 1.2 + i * 0.4;
      ctx.beginPath();
      ctx.arc(px, py, ps, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(160,200,190,${0.2 + i * 0.08})`;
      ctx.fill();
    }

    // ── Planeta hero (kręcąca się z terminatorem) ──────────────
    this._drawHeroPlanet(ctx, W, H, t, scx, scy);

    // Stars
    for (const star of this._stars) {
      const twinkle = Math.sin(t * star.twinkleSpeed + star.twinkleOffset);
      const alpha = star.brightness * (0.7 + twinkle * 0.3);
      if (alpha < 0.05) continue;
      const sx = star.x * W, sy = star.y * H;
      const s = star.size * (1 + twinkle * 0.15);

      if (s > 1.2) {
        ctx.beginPath(); ctx.arc(sx, sy, s * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,200,220,${alpha * 0.06})`; ctx.fill();
        ctx.beginPath(); ctx.arc(sx, sy, s, 0, Math.PI * 2);
      }
      const v = Math.floor(220 + alpha * 35);
      ctx.fillStyle = star.hue > 0
        ? `hsla(${star.hue},${star.saturation}%,85%,${alpha})`
        : `rgba(${v},${v},${Math.min(255, v + 8)},${alpha})`;
      if (s > 1.2) ctx.fill();
      else ctx.fillRect(sx - s/2, sy - s/2, s, s);
    }

    // Shooting star — chłodne kolory
    if (time > this._nextShootTime && !this._shootingStar) {
      this._shootingStar = {
        x: 0.1 + Math.random() * 0.6, y: 0.05 + Math.random() * 0.3,
        angle: 0.3 + Math.random() * 0.5, speed: 0.3 + Math.random() * 0.4,
        life: 0, maxLife: 0.6 + Math.random() * 0.4, startTime: time,
        brightness: 0.4 + Math.random() * 0.4,
      };
      this._nextShootTime = time + 8000 + Math.random() * 20000;
    }
    if (this._shootingStar) {
      const s = this._shootingStar;
      const elapsed = (time - s.startTime) / 1000;
      const progress = elapsed / s.maxLife;
      if (progress > 1) { this._shootingStar = null; }
      else {
        const fade = progress < 0.3 ? progress / 0.3 : 1 - (progress - 0.3) / 0.7;
        const sx = (s.x + Math.cos(s.angle) * s.speed * elapsed) * W;
        const sy = (s.y + Math.sin(s.angle) * s.speed * elapsed) * H;
        const tailLen = 60 + s.speed * 40;
        const tx = sx - Math.cos(s.angle) * tailLen;
        const ty = sy - Math.sin(s.angle) * tailLen;
        const grad = ctx.createLinearGradient(tx, ty, sx, sy);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.7, `rgba(0,255,180,${0.15 * fade * s.brightness})`);
        grad.addColorStop(1, `rgba(160,255,220,${0.6 * fade * s.brightness})`);
        ctx.strokeStyle = grad; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(sx, sy); ctx.stroke();
        ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(160,255,220,${0.5 * fade * s.brightness})`; ctx.fill();
      }
    }
  }
}
