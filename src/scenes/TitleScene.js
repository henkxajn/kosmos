// TitleScene — ekran startowy KOSMOS (CRT retro, 4 warianty kolorystyczne)
// Czyste HTML/CSS z CSS variables + minimalne JS (gwiazdy, menu, theme picker, muzyka).
// Interfejs: show() / destroy() / _handleChoice(action)

import { SaveSystem } from '../systems/SaveSystem.js';
import { migrate }    from '../systems/SaveMigration.js';
import { PRESET_THEMES, applyPreset, saveTheme } from '../config/ThemeConfig.js';
import { updateCrt } from '../ui/CrtOverlay.js';

// ── 4 warianty kolorystyczne ekranu startowego ────────────────
const SS_THEMES = [
  {
    id: 'amber_noir', label: 'AMBER NOIR', dot: '#c49830',
    acc: '#c49830', bg: '#060504',
    sunGrad: 'radial-gradient(circle at 35% 35%, #ffe090, #c49830, #8a6010)',
    sunGlow: '#c4983025',
    planets: ['#b06040', '#5888a8', '#c8a050', '#9060a8'],
    presetKey: 'ss_amber_noir',
  },
  {
    id: 'cold_blue', label: 'COLD BLUE', dot: '#4090c0',
    acc: '#4090c0', bg: '#040608',
    sunGrad: 'radial-gradient(circle at 35% 35%, #e0f0ff, #60a8d8, #2060a0)',
    sunGlow: '#4090c025',
    planets: ['#c07040', '#78a870', '#4090c0', '#2870b8'],
    presetKey: 'ss_cold_blue',
  },
  {
    id: 'galactic_violet', label: 'GALACTIC VIOLET', dot: '#a060b0',
    acc: '#a060c0', bg: '#060408',
    sunGrad: 'radial-gradient(circle at 35% 35%, #f0d0ff, #c080e0, #6030a0)',
    sunGlow: '#a060c025',
    planets: ['#c07050', '#6898a8', '#a060c0', '#7040a0'],
    presetKey: 'ss_galactic_violet',
  },
  {
    id: 'biopunk_green', label: 'BIOPUNK GREEN', dot: '#508050',
    acc: '#50a060', bg: '#040604',
    sunGrad: 'radial-gradient(circle at 35% 35%, #d0ffe0, #60c080, #208040)',
    sunGlow: '#50a06025',
    planets: ['#b86040', '#50a060', '#38a870', '#2890b8'],
    presetKey: 'ss_biopunk_green',
  },
];

const STORAGE_KEY = 'kosmos_ss_theme';

export class TitleScene {
  constructor() {
    this._container = null;
    this._currentTheme = 0; // indeks w SS_THEMES
    this._musicStarted = false;
  }

  show() {
    // Przywróć zapisany wariant
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        const idx = SS_THEMES.findIndex(t => t.id === saved);
        if (idx >= 0) this._currentTheme = idx;
      }
    } catch { /* ignoruj */ }

    this._buildDOM();
    this._generateStars();
    this._applyTheme(this._currentTheme);
  }

  destroy() {
    if (this._container) this._container.remove();
    const style = document.getElementById('ss-styles');
    if (style) style.remove();
  }

  // ── Muzyka ────────────────────────────────────────────────────

  _ensureMusic() {
    if (this._musicStarted) return;
    this._musicStarted = true;
    const audio = window.KOSMOS?.audioSystem;
    if (audio) audio.startMusic('main');
  }

  // ── Zmiana motywu ─────────────────────────────────────────────

  _applyTheme(idx) {
    this._currentTheme = idx;
    const theme = SS_THEMES[idx];
    const el = this._container;
    if (!el) return;

    // CSS variables na kontenerze
    el.style.setProperty('--acc', theme.acc);
    el.style.setProperty('--bg', theme.bg);
    el.style.setProperty('--bdr', theme.acc + '18');
    el.style.setProperty('--bg-hover', theme.acc + '08');
    el.style.setProperty('--acc-glow', theme.acc + '40');
    el.style.setProperty('--acc-glow2', theme.acc + '15');
    el.style.background = theme.bg;

    // Słońce
    const sun = el.querySelector('.ss-sun');
    if (sun) sun.style.background = theme.sunGrad;

    const glow = el.querySelector('.ss-sun-glow');
    if (glow) glow.style.background = `radial-gradient(circle, ${theme.sunGlow} 0%, transparent 70%)`;

    // Sweep
    const sweep = el.querySelector('.ss-sweep');
    if (sweep) sweep.style.background = `linear-gradient(180deg, transparent, ${theme.acc}10, transparent)`;

    // Planety
    el.querySelectorAll('.ss-planet').forEach((p, i) => {
      if (theme.planets[i]) {
        p.style.background = theme.planets[i];
        p.style.boxShadow = `0 0 8px ${theme.planets[i]}80`;
      }
    });

    // Theme picker dots — aktywny
    el.querySelectorAll('.ss-theme-dot').forEach((d, i) => {
      d.classList.toggle('active', i === idx);
    });

    // Zapisz wybór
    try { localStorage.setItem(STORAGE_KEY, theme.id); } catch { /* ignoruj */ }

    // Zastosuj preset do gry (THEME tokens)
    const preset = PRESET_THEMES[theme.presetKey];
    if (preset) {
      applyPreset(preset);
      saveTheme();
      updateCrt();
    }
  }

  // ── DOM ──────────────────────────────────────────────────────

  _buildDOM() {
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

    // Theme picker dots
    const dots = SS_THEMES.map((t, i) =>
      `<button class="ss-theme-dot${i === this._currentTheme ? ' active' : ''}"
              data-theme="${i}" title="${t.label}"
              style="--dot-color:${t.dot}"></button>`
    ).join('');

    c.innerHTML = `
      <div class="ss-scanlines"></div>
      <div class="ss-vignette"></div>
      <div class="ss-noise"></div>
      <div class="ss-sweep"></div>
      <div class="ss-stars"></div>

      <div class="ss-topbar">
        <span class="ss-logo-small">KOSMOS</span>
        <div class="ss-theme-picker">${dots}</div>
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
      btn.addEventListener('click', () => {
        this._ensureMusic();
        this._handleChoice(btn.dataset.action);
      });
    });

    // Bind theme picker
    c.querySelectorAll('.ss-theme-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        this._ensureMusic();
        this._applyTheme(+dot.dataset.theme);
      });
    });

    // Startuj muzykę przy pierwszym kliknięciu gdziekolwiek (Chrome autoplay)
    c.addEventListener('click', () => this._ensureMusic(), { once: true });
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
        animation: ss-sweep 12s linear infinite;
      }
      @keyframes ss-sweep { 0%{top:-100px} 100%{top:100%} }

      /* ── Gwiazdy ── */
      .ss-stars { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
      @keyframes ss-twinkle { from{opacity:0.05} to{opacity:0.5} }

      /* ── Top bar ── */
      .ss-topbar {
        position: relative; z-index: 10;
        padding: 14px 32px; display: flex; justify-content: space-between; align-items: center;
        border-bottom: 1px solid var(--bdr);
      }
      .ss-logo-small {
        font-family: 'Orbitron', monospace; font-size: 12px; font-weight: 700;
        letter-spacing: 6px; color: var(--acc); opacity: 0.6;
      }
      .ss-build {
        font-size: 9px; letter-spacing: 3px; color: var(--acc); opacity: 0.2;
      }

      /* ── Theme picker ── */
      .ss-theme-picker {
        display: flex; gap: 10px; align-items: center;
      }
      .ss-theme-dot {
        width: 10px; height: 10px; border-radius: 50%; border: none; padding: 0;
        background: var(--dot-color); opacity: 0.35; cursor: pointer;
        transition: all 0.25s; box-shadow: none;
      }
      .ss-theme-dot:hover {
        opacity: 0.7; transform: scale(1.3);
      }
      .ss-theme-dot.active {
        opacity: 1; transform: scale(1.4);
        box-shadow: 0 0 8px var(--dot-color);
      }

      /* ── Center (uklad sloneczny) ── */
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
        pointer-events: none;
      }
      .ss-sun {
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 38px; height: 38px; border-radius: 50%; z-index: 5;
        box-shadow: 0 0 40px color-mix(in srgb, var(--acc) 50%, transparent),
                    0 0 80px color-mix(in srgb, var(--acc) 19%, transparent);
        animation: ss-sun-pulse 4s ease-in-out infinite alternate;
      }
      @keyframes ss-sun-pulse {
        from { filter: brightness(1); }
        to   { filter: brightness(1.25); }
      }

      /* ── Orbity ── */
      .ss-orbit {
        position: absolute; top: 50%; left: 50%;
        border-radius: 50%; border: 1px solid var(--bdr);
      }

      /* ── Planety ── */
      .ss-planet {
        position: absolute; top: 50%; left: 50%;
        border-radius: 50%; z-index: 6;
      }
      .ss-planet-1 {
        width: 7px; height: 7px; margin: -3.5px;
        transform-origin: 3.5px 58.5px;
        animation: ss-orbit-1 5s linear infinite;
      }
      .ss-planet-2 {
        width: 11px; height: 11px; margin: -5.5px;
        transform-origin: 5.5px 95.5px;
        animation: ss-orbit-2 10s linear infinite;
      }
      .ss-planet-3 {
        width: 14px; height: 14px; margin: -7px;
        transform-origin: 7px 139px;
        animation: ss-orbit-3 18s linear infinite;
      }
      .ss-planet-4 {
        width: 18px; height: 18px; margin: -9px;
        transform-origin: 9px 177px;
        animation: ss-orbit-4 28s linear infinite;
        animation-delay: -8s;
      }
      @keyframes ss-orbit-1 { to { transform: rotate(360deg); } }
      @keyframes ss-orbit-2 { to { transform: rotate(360deg); } }
      @keyframes ss-orbit-3 { to { transform: rotate(360deg); } }
      @keyframes ss-orbit-4 { to { transform: rotate(360deg); } }

      /* ── Logo nad ukladem ── */
      .ss-logo-main {
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, calc(-50% + 110px));
        text-align: center; white-space: nowrap; z-index: 10; pointer-events: none;
      }
      .ss-logo-text {
        font-family: 'Orbitron', monospace; font-size: 36px; font-weight: 900;
        letter-spacing: 10px; color: var(--acc);
        text-shadow: 0 0 60px var(--acc-glow);
        animation: ss-logo-breath 4s ease-in-out infinite alternate;
      }
      @keyframes ss-logo-breath {
        from { text-shadow: 0 0 40px var(--acc-glow); }
        to   { text-shadow: 0 0 80px var(--acc-glow), 0 0 120px var(--acc-glow2); }
      }
      .ss-logo-sub {
        display: block; font-size: 9px; letter-spacing: 5px;
        font-family: 'Share Tech Mono', monospace; color: var(--acc); opacity: 0.25; margin-top: 6px;
      }

      /* ── Menu dolne ── */
      .ss-menu {
        position: relative; z-index: 10;
        display: flex; border-top: 1px solid var(--bdr);
      }
      .ss-menu-item {
        flex: 1; padding: 18px 12px; text-align: center;
        border: none; border-right: 1px solid var(--bdr);
        background: transparent; cursor: pointer; transition: all 0.2s;
        position: relative; font-family: inherit;
      }
      .ss-menu-item:last-child { border-right: none; }

      .ss-menu-item::before {
        content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
        background: var(--acc); transform: scaleX(0); transition: transform 0.2s;
      }
      .ss-menu-item:hover::before { transform: scaleX(1); }
      .ss-menu-item:hover { background: var(--bg-hover); }

      .ss-item-num {
        display: block; font-family: 'Orbitron', monospace; font-size: 9px;
        letter-spacing: 2px; color: var(--acc); opacity: 0.3; margin-bottom: 5px; transition: opacity 0.2s;
      }
      .ss-item-label {
        display: block; font-family: 'VT323', monospace; font-size: 17px;
        letter-spacing: 3px; color: var(--acc); opacity: 0.5; transition: opacity 0.2s;
      }
      .ss-item-info {
        display: block; font-family: 'Share Tech Mono', monospace; font-size: 9px;
        letter-spacing: 2px; color: var(--acc); opacity: 0.2; margin-top: 4px;
      }
      .ss-menu-item:hover .ss-item-num { opacity: 0.7; }
      .ss-menu-item:hover .ss-item-label { opacity: 1; }
      .ss-menu-item:hover .ss-item-info { opacity: 0.5; }
    `;
  }
}
