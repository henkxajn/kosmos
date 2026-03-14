// TitleScene — nowy ekran startowy KOSMOS (CRT retro, AMBER NOIR)
// Czyste HTML/CSS + minimalne JS (gwiazdy, callbacki menu).
// Interfejs: show() / destroy() / _handleChoice(action)

import { SaveSystem } from '../systems/SaveSystem.js';
import { migrate }    from '../systems/SaveMigration.js';

// ── Paleta AMBER NOIR ──────────────────────────────────────────
const ACC = '#c49830';
const BG  = '#060504';

// Hex kolor z alpha (8-znakowy hex)
const a = (alpha) => ACC + alpha;

export class TitleScene {
  constructor() {
    this._container = null;
  }

  show() {
    this._buildDOM();
    this._generateStars();
  }

  destroy() {
    if (this._container) this._container.remove();
    const style = document.getElementById('ss-styles');
    if (style) style.remove();
  }

  // ── DOM ──────────────────────────────────────────────────────

  _buildDOM() {
    // Wstrzyknij style (raz)
    if (!document.getElementById('ss-styles')) {
      const style = document.createElement('style');
      style.id = 'ss-styles';
      style.textContent = this._buildCSS();
      document.head.appendChild(style);
    }

    const hasSave = SaveSystem.hasSave();
    const saveYears = hasSave !== null ? Math.round(hasSave).toLocaleString('pl-PL') : null;

    const c = document.createElement('div');
    c.id = 'start-screen';

    c.innerHTML = `
      <div class="ss-scanlines"></div>
      <div class="ss-vignette"></div>
      <div class="ss-noise"></div>
      <div class="ss-sweep"></div>
      <div class="ss-stars"></div>

      <div class="ss-topbar">
        <span class="ss-logo-small">KOSMOS</span>
        <span class="ss-build">BUILD 2026.03 // 4X STRATEGY</span>
      </div>

      <div class="ss-center">
        <div class="ss-solar">
          <div class="ss-sun-glow"></div>
          <div class="ss-sun"></div>

          <div class="ss-orbit" style="width:110px;height:110px;margin:-55px"></div>
          <div class="ss-orbit" style="width:180px;height:180px;margin:-90px"></div>
          <div class="ss-orbit" style="width:264px;height:264px;margin:-132px;border-style:dashed;opacity:0.5"></div>
          <div class="ss-orbit" style="width:336px;height:336px;margin:-168px;opacity:0.3"></div>

          <div class="ss-planet ss-planet-1"></div>
          <div class="ss-planet ss-planet-2"></div>
          <div class="ss-planet ss-planet-3"></div>
          <div class="ss-planet ss-planet-4"></div>

          <div class="ss-logo-main">
            <span class="ss-logo-text">KOSMOS</span>
            <span class="ss-logo-sub">BEYOND THE CELESTIAL SPHERE</span>
          </div>
        </div>
      </div>

      <div class="ss-menu">
        ${hasSave !== null ? `
        <button class="ss-menu-item" data-action="continue">
          <span class="ss-item-num">01</span>
          <span class="ss-item-label">KONTYNUUJ</span>
          <span class="ss-item-info">${saveYears} lat</span>
        </button>
        ` : ''}
        <button class="ss-menu-item" data-action="new">
          <span class="ss-item-num">${hasSave !== null ? '02' : '01'}</span>
          <span class="ss-item-label">NOWA GRA</span>
        </button>
        <button class="ss-menu-item" data-action="new_boosted">
          <span class="ss-item-num">${hasSave !== null ? '03' : '02'}</span>
          <span class="ss-item-label">NOWA GRA +</span>
        </button>
        <button class="ss-menu-item" data-action="power_test">
          <span class="ss-item-num">${hasSave !== null ? '04' : '03'}</span>
          <span class="ss-item-label">POWER TEST</span>
        </button>
      </div>
    `;

    document.body.appendChild(c);
    this._container = c;

    // Bind menu
    c.querySelectorAll('.ss-menu-item').forEach(btn => {
      btn.addEventListener('click', () => this._handleChoice(btn.dataset.action));
    });
  }

  // ── Gwiazdy (generowane JS) ──────────────────────────────────

  _generateStars() {
    const container = this._container.querySelector('.ss-stars');
    for (let i = 0; i < 160; i++) {
      const s = document.createElement('div');
      s.className = 'ss-star';
      const sz = Math.random() * 1.8 + 0.3;
      const twinkle = Math.random() > 0.7;
      const dur = 1.5 + Math.random() * 3;
      const delay = Math.random() * 3;
      s.style.cssText = `
        position:absolute; border-radius:50%; background:#fff;
        width:${sz}px; height:${sz}px;
        top:${Math.random() * 100}%; left:${Math.random() * 100}%;
        opacity:${Math.random() * 0.4 + 0.05};
        ${twinkle ? `animation:ss-twinkle ${dur}s ease-in-out ${delay}s infinite alternate` : ''}
      `;
      container.appendChild(s);
    }
  }

  // ── Wybór scenariusza ─────────────────────────────────────────

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
      window.KOSMOS.scenario  = saveData?.scenario ?? 'civilization';
    } else if (action === 'new') {
      SaveSystem.clearSave();
      window.KOSMOS.savedData = null;
      window.KOSMOS.scenario  = 'civilization';
    } else if (action === 'new_boosted') {
      SaveSystem.clearSave();
      window.KOSMOS.savedData = null;
      window.KOSMOS.scenario  = 'civilization_boosted';
    } else if (action === 'power_test') {
      SaveSystem.clearSave();
      window.KOSMOS.savedData = null;
      window.KOSMOS.scenario  = 'power_test';
    }

    // Fade out
    const el = this._container;
    el.style.transition = 'opacity 0.6s ease';
    el.style.opacity = '0';

    setTimeout(() => {
      this.destroy();
      window._startMainGame();
    }, 600);
  }

  // ── CSS (kompletny) ──────────────────────────────────────────

  _buildCSS() {
    return `
      /* ── Kontener główny ── */
      #start-screen {
        position: fixed; inset: 0; z-index: 1000;
        background: ${BG};
        display: flex; flex-direction: column;
        overflow: hidden;
        font-family: 'Share Tech Mono', monospace;
      }

      /* ── CRT efekty ── */
      .ss-scanlines {
        position: absolute; inset: 0; pointer-events: none; z-index: 50;
        background: repeating-linear-gradient(
          0deg, transparent 0, transparent 3px, #00000016 3px, #00000016 4px
        );
      }
      .ss-vignette {
        position: absolute; inset: 0; pointer-events: none; z-index: 49;
        background: radial-gradient(ellipse at 50% 50%, transparent 40%, #00000099 100%);
      }
      .ss-noise {
        position: absolute; inset: 0; pointer-events: none; z-index: 48; opacity: 0.025;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
        background-size: 200px 200px;
      }
      .ss-sweep {
        position: absolute; left: 0; right: 0; height: 100px; pointer-events: none; z-index: 47;
        background: linear-gradient(180deg, transparent, ${a('10')}, transparent);
        animation: ss-sweep 12s linear infinite;
      }
      @keyframes ss-sweep { 0%{top:-100px} 100%{top:100%} }

      /* ── Gwiazdy ── */
      .ss-stars {
        position: absolute; inset: 0; pointer-events: none; z-index: 1;
      }
      @keyframes ss-twinkle { from{opacity:0.05} to{opacity:0.5} }

      /* ── Top bar ── */
      .ss-topbar {
        position: relative; z-index: 10;
        padding: 14px 32px; display: flex; justify-content: space-between; align-items: center;
        border-bottom: 1px solid ${a('18')};
      }
      .ss-logo-small {
        font-family: 'Orbitron', monospace; font-size: 12px; font-weight: 700;
        letter-spacing: 6px; color: ${ACC}; opacity: 0.6;
      }
      .ss-build {
        font-size: 9px; letter-spacing: 3px; color: ${ACC}; opacity: 0.2;
      }

      /* ── Center (układ słoneczny) ── */
      .ss-center {
        position: relative; z-index: 10; flex: 1;
        display: flex; align-items: center; justify-content: center;
      }
      .ss-solar {
        position: relative; width: 340px; height: 340px;
      }

      /* ── Gwiazda centralna ── */
      .ss-sun-glow {
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 140px; height: 140px; border-radius: 50%;
        background: radial-gradient(circle, ${a('25')} 0%, transparent 70%);
        pointer-events: none;
      }
      .ss-sun {
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 38px; height: 38px; border-radius: 50%; z-index: 5;
        background: radial-gradient(circle at 35% 35%, #ffe090, ${ACC}, #8a6010);
        box-shadow: 0 0 40px ${a('80')}, 0 0 80px ${a('30')};
        animation: ss-sun-pulse 4s ease-in-out infinite alternate;
      }
      @keyframes ss-sun-pulse {
        from { box-shadow: 0 0 40px ${a('80')}, 0 0 80px ${a('30')}; }
        to   { box-shadow: 0 0 65px ${a('aa')}, 0 0 120px ${a('50')}; }
      }

      /* ── Orbity ── */
      .ss-orbit {
        position: absolute; top: 50%; left: 50%;
        border-radius: 50%; border: 1px solid ${a('18')};
      }

      /* ── Planety ── */
      .ss-planet {
        position: absolute; top: 50%; left: 50%;
        border-radius: 50%; z-index: 6;
      }

      /* Planet 1 — mała ciepła rdzawa, orbit r=55, 5s */
      .ss-planet-1 {
        width: 7px; height: 7px; margin: -3.5px;
        background: #b86040; box-shadow: 0 0 5px #b8604080;
        transform-origin: 3.5px 58.5px;
        animation: ss-orbit-1 5s linear infinite;
      }
      /* Planet 2 — średnia niebieska (rocky HZ), orbit r=90, 10s */
      .ss-planet-2 {
        width: 11px; height: 11px; margin: -5.5px;
        background: #5888a8; box-shadow: 0 0 8px #5888a880;
        transform-origin: 5.5px 95.5px;
        animation: ss-orbit-2 10s linear infinite;
      }
      /* Planet 3 — duża, jaśniejszy akcent (gas giant), orbit r=132, 18s */
      .ss-planet-3 {
        width: 14px; height: 14px; margin: -7px;
        background: #d4b050; box-shadow: 0 0 10px #d4b05060;
        transform-origin: 7px 139px;
        animation: ss-orbit-3 18s linear infinite;
      }
      /* Planet 4 — największa, ciemna (ice giant), orbit r=168, 28s */
      .ss-planet-4 {
        width: 18px; height: 18px; margin: -9px;
        background: #6a5830; box-shadow: 0 0 12px #6a583040;
        transform-origin: 9px 177px;
        animation: ss-orbit-4 28s linear infinite;
        animation-delay: -8s;
      }

      @keyframes ss-orbit-1 { to { transform: rotate(360deg); } }
      @keyframes ss-orbit-2 { to { transform: rotate(360deg); } }
      @keyframes ss-orbit-3 { to { transform: rotate(360deg); } }
      @keyframes ss-orbit-4 { to { transform: rotate(360deg); } }

      /* ── Logo nad układem ── */
      .ss-logo-main {
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, calc(-50% + 110px));
        text-align: center; white-space: nowrap; z-index: 10; pointer-events: none;
      }
      .ss-logo-text {
        font-family: 'Orbitron', monospace; font-size: 36px; font-weight: 900;
        letter-spacing: 10px; color: ${ACC};
        text-shadow: 0 0 60px ${a('40')};
        animation: ss-logo-breath 4s ease-in-out infinite alternate;
      }
      @keyframes ss-logo-breath {
        from { text-shadow: 0 0 40px ${a('40')}; }
        to   { text-shadow: 0 0 80px ${a('60')}, 0 0 120px ${a('20')}; }
      }
      .ss-logo-sub {
        display: block; font-size: 9px; letter-spacing: 5px;
        font-family: 'Share Tech Mono', monospace; color: ${ACC}; opacity: 0.25; margin-top: 6px;
      }

      /* ── Menu dolne ── */
      .ss-menu {
        position: relative; z-index: 10;
        display: flex; border-top: 1px solid ${a('18')};
      }
      .ss-menu-item {
        flex: 1; padding: 18px 12px; text-align: center;
        border: none; border-right: 1px solid ${a('18')};
        background: transparent; cursor: pointer; transition: all 0.2s;
        position: relative;
        font-family: inherit;
      }
      .ss-menu-item:last-child { border-right: none; }

      /* Linia akcentu na górze przy hover */
      .ss-menu-item::before {
        content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
        background: ${ACC}; transform: scaleX(0); transition: transform 0.2s;
      }
      .ss-menu-item:hover::before { transform: scaleX(1); }
      .ss-menu-item:hover { background: ${a('08')}; }

      .ss-item-num {
        display: block; font-family: 'Orbitron', monospace; font-size: 9px;
        letter-spacing: 2px; color: ${ACC}; opacity: 0.3; margin-bottom: 5px; transition: opacity 0.2s;
      }
      .ss-item-label {
        display: block; font-family: 'VT323', monospace; font-size: 17px;
        letter-spacing: 3px; color: ${ACC}; opacity: 0.5; transition: opacity 0.2s;
      }
      .ss-item-info {
        display: block; font-family: 'Share Tech Mono', monospace; font-size: 9px;
        letter-spacing: 2px; color: ${ACC}; opacity: 0.2; margin-top: 4px;
      }
      .ss-menu-item:hover .ss-item-num { opacity: 0.7; }
      .ss-menu-item:hover .ss-item-label { opacity: 1; }
      .ss-menu-item:hover .ss-item-info { opacity: 0.5; }
    `;
  }
}
