// FactionSelectScene — ekran wyboru lidera (Faza B → C4)
//
// Po kliknięciu "NOWA GRA" w TitleScene, przed GameScene.
// Faza C4: frakcje NIE istnieją na starcie — gracz wybiera tylko styl przywództwa.
// 2 kroki: (1) wybór z 6 liderów, (2) potwierdzenie.
// Klasa zachowuje starą nazwę FactionSelectScene dla zgodności z TitleScene importem.

import { LEADERS, STARTING_LEADERS } from '../data/LeaderData.js';
import { THEME } from '../config/ThemeConfig.js';
import { getLocale, getName, t } from '../i18n/i18n.js';
import { EMPIRE_COLOR_PALETTE } from '../data/EmpireData.js';

const PL = () => getLocale() === 'pl';

export class FactionSelectScene {
  constructor() {
    this._container       = null;
    this._step            = 1;
    this._selectedLeader  = null;
    // B2: barwa imperium (strefy wpływów). Domyślnie #33ccff (pierwsza w palecie).
    this._selectedColor   = EMPIRE_COLOR_PALETTE[0];
    this._onComplete      = null;
  }

  show(onComplete) {
    this._onComplete = onComplete;
    this._buildDOM();
    this._generateStars();
    requestAnimationFrame(() => {
      if (this._container) this._container.style.opacity = '1';
    });
  }

  destroy() {
    if (this._container) this._container.remove();
    const style = document.getElementById('fs-styles');
    if (style) style.remove();
  }

  // ── DOM ──────────────────────────────────────────────────────────────

  _buildDOM() {
    if (!document.getElementById('fs-styles')) {
      const style = document.createElement('style');
      style.id = 'fs-styles';
      style.textContent = this._buildCSS();
      document.head.appendChild(style);
    }

    const c = document.createElement('div');
    c.id = 'faction-select';
    c.style.opacity = '0';

    c.innerHTML = `
      <div class="fs-scanlines"></div>
      <div class="fs-vignette"></div>
      <div class="fs-stars"></div>
      <div class="fs-nebula"></div>

      <div class="fs-header">
        <div class="fs-step-indicator" id="fs-step-ind"></div>
        <h1 class="fs-title" id="fs-title-text"></h1>
        <p class="fs-subtitle" id="fs-subtitle-text"></p>
      </div>

      <div class="fs-body" id="fs-body"></div>

      <div class="fs-nav" id="fs-nav"></div>
    `;

    document.body.appendChild(c);
    this._container = c;

    this._renderStep1();
  }

  // ── Tło: gwiazdy (jak TitleScene) ────────────────────────────────────

  _generateStars() {
    const container = this._container.querySelector('.fs-stars');
    if (!container) return;
    for (let i = 0; i < 160; i++) {
      const s = document.createElement('div');
      s.className = 'fs-star';
      const sz = Math.random() * 1.8 + 0.3;
      const twinkle = Math.random() > 0.7;
      const dur = 1.5 + Math.random() * 3;
      const delay = Math.random() * 3;
      s.style.cssText = `
        position:absolute; border-radius:50%; background:#fff;
        width:${sz}px; height:${sz}px;
        top:${Math.random() * 100}%; left:${Math.random() * 100}%;
        opacity:${Math.random() * 0.4 + 0.05};
        ${twinkle ? `animation:fs-twinkle ${dur}s ease-in-out ${delay}s infinite alternate` : ''}
      `;
      container.appendChild(s);
    }
  }

  // ── Krok 1: wybór lidera (siatka 6 kart, 3+3) ────────────────────────

  _renderStep1() {
    this._setHeader(
      `${PL() ? 'KROK' : 'STEP'} 1/2`,
      PL() ? 'WYBIERZ LIDERA' : 'CHOOSE YOUR LEADER',
      PL()
        ? 'Twój styl przywództwa ukształtuje przyszłość kolonii'
        : 'Your leadership style will shape the colony\'s future'
    );

    document.getElementById('fs-nav').innerHTML = '';

    const candidates = STARTING_LEADERS.map(id => LEADERS[id]).filter(Boolean);
    const body = document.getElementById('fs-body');
    body.innerHTML = `
      <div class="fs-content fs-leaders-grid">
        ${candidates.map(leader => this._renderLeaderCard(leader)).join('')}
      </div>
    `;

    this._bindLeaderCards();
  }

  _renderLeaderCard(leader) {
    const initials = getName(leader).split(' ')
      .filter(w => w.length > 2 && w[0] === w[0].toUpperCase())
      .map(w => w[0]).join('').slice(0, 2);

    // Tylko bonusy — bez maluses (frakcja nieznana, brak presji ideologicznej)
    const bonusesHtml = (leader.bonuses || []).map(b =>
      `<div class="fs-leader-bonus">✦ ${PL() ? b.descPL : (b.descEN || b.descPL)}</div>`
    ).join('');

    const archetypeText = PL() ? leader.archetype : (leader.archetypeEN || leader.archetype);

    return `
      <div class="fs-leader-card" data-leader="${leader.id}">
        <div class="fs-portrait-wrap">
          <img class="fs-portrait-img" src="${leader.portrait}"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
               alt="${getName(leader)}">
          <div class="fs-portrait-fallback" style="display:none">
            ${initials}
          </div>
        </div>
        <p class="fs-leader-archetype">${archetypeText ?? ''}</p>
        <h3 class="fs-leader-name">${getName(leader)}</h3>
        <p class="fs-leader-title">
          ${PL() ? leader.titlePL : (leader.titleEN || leader.titlePL)}
        </p>
        <p class="fs-leader-age">${PL() ? 'Wiek' : 'Age'}: ${leader.age}</p>
        <div class="fs-leader-stats">${bonusesHtml}</div>
      </div>
    `;
  }

  _bindLeaderCards() {
    const cards = document.getElementById('fs-body').querySelectorAll('.fs-leader-card');

    cards.forEach(card => {
      card.addEventListener('click', () => {
        this._selectedLeader = card.dataset.leader;
        cards.forEach(cc => cc.classList.remove('selected'));
        card.classList.add('selected');
        setTimeout(() => {
          this._fadeTransition(() => this._renderStep2());
        }, 350);
      });
    });
  }

  // ── Krok 2: potwierdzenie wyboru ─────────────────────────────────────

  _renderStep2() {
    const leader = LEADERS[this._selectedLeader];
    if (!leader) {
      this._renderStep1();
      return;
    }

    const initials = getName(leader).split(' ')
      .filter(w => w.length > 2 && w[0] === w[0].toUpperCase())
      .map(w => w[0]).join('').slice(0, 2);

    const bonusesHtml = (leader.bonuses || []).map(b =>
      `<div class="fs-confirm-bonus">✦ ${PL() ? b.descPL : (b.descEN || b.descPL)}</div>`
    ).join('');

    const archetypeText = PL() ? leader.archetype : (leader.archetypeEN || leader.archetype);

    this._setHeader(
      `${PL() ? 'KROK' : 'STEP'} 2/2`,
      PL() ? 'POTWIERDZENIE' : 'CONFIRMATION',
      ''
    );

    const nav = document.getElementById('fs-nav');
    nav.innerHTML = `
      <button class="fs-btn fs-btn-back" id="fs-back">← ${PL() ? 'WSTECZ' : 'BACK'}</button>
      <button class="fs-btn fs-btn-start" id="fs-start">${PL() ? 'ROZPOCZNIJ GRĘ' : 'START GAME'} ►</button>
    `;

    const body = document.getElementById('fs-body');
    body.innerHTML = `
      <div class="fs-content fs-confirm-layout">
        <div class="fs-confirm-portrait">
          <img class="fs-confirm-img" src="${leader.portrait}"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
               alt="${getName(leader)}">
          <div class="fs-confirm-fallback" style="display:none">
            ${initials}
          </div>
        </div>

        <div class="fs-confirm-info">
          <p class="fs-confirm-archetype">${archetypeText ?? ''}</p>
          <h2 class="fs-confirm-name">${getName(leader)}</h2>
          <p class="fs-confirm-title-text">
            ${PL() ? leader.titlePL : (leader.titleEN || leader.titlePL)}
          </p>
          <p class="fs-confirm-quote">
            "${PL() ? leader.quote : (leader.quoteEN || leader.quote)}"
          </p>

          <p class="fs-colors-label">${t('faction.empireColor')}</p>
          <div class="fs-swatch-row" id="fs-swatch-row">
            ${EMPIRE_COLOR_PALETTE.map(c =>
              `<div class="fs-swatch${c === this._selectedColor ? ' selected' : ''}" data-color="${c}" style="background:${c}" title="${c}"></div>`
            ).join('')}
          </div>

          <div class="fs-confirm-sep"></div>
          <div class="fs-confirm-stats">${bonusesHtml}</div>
        </div>
      </div>
    `;

    // B2: wybór barwy imperium — toggle .selected + zapis this._selectedColor
    body.querySelectorAll('.fs-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        this._selectedColor = sw.dataset.color;
        body.querySelectorAll('.fs-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
      });
    });

    nav.querySelector('#fs-back').addEventListener('click', () => {
      this._fadeTransition(() => this._renderStep1());
    });

    nav.querySelector('#fs-start').addEventListener('click', () => {
      // Faza C4: frakcja nieznana — tylko leader id
      window.KOSMOS.selectedLeader  = this._selectedLeader;
      window.KOSMOS.selectedFaction = null;
      window.KOSMOS.selectedColor   = this._selectedColor;   // B2: barwa imperium (→ gameState w GameScene)

      this._container.style.transition = 'opacity 0.6s ease';
      this._container.style.opacity = '0';
      setTimeout(() => {
        this.destroy();
        this._onComplete?.();
      }, 600);
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  _setHeader(step, title, subtitle) {
    const stepEl = document.getElementById('fs-step-ind');
    const titleEl = document.getElementById('fs-title-text');
    const subEl = document.getElementById('fs-subtitle-text');
    if (stepEl) stepEl.textContent = step;
    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = subtitle || '';
  }

  _fadeTransition(renderFn) {
    const body = document.getElementById('fs-body');
    if (!body) { renderFn(); return; }
    body.style.transition = 'opacity 0.3s ease';
    body.style.opacity = '0';
    setTimeout(() => {
      renderFn();
      body.style.opacity = '1';
    }, 300);
  }

  // ── CSS ──────────────────────────────────────────────────────────────

  _buildCSS() {
    // Faza C4: jeden neutralny accent — bez kolorów frakcji
    const acc = THEME.accent || '#00ffb4';
    const bg  = '#060504';

    return `
      /* ── Kontener główny ── */
      #faction-select {
        position: fixed; inset: 0; z-index: 1000;
        background: ${bg};
        display: flex; flex-direction: column;
        overflow: hidden; overflow-y: auto;
        font-family: 'Share Tech Mono', 'Space Mono', monospace;
        transition: opacity 0.6s ease;
      }

      /* ── CRT efekty (identyczne z TitleScene) ── */
      .fs-scanlines {
        position: fixed; inset: 0; pointer-events: none; z-index: 50;
        background: repeating-linear-gradient(
          0deg, transparent 0, transparent 3px, #00000016 3px, #00000016 4px
        );
      }
      .fs-vignette {
        position: fixed; inset: 0; pointer-events: none; z-index: 49;
        background: radial-gradient(ellipse at 50% 50%, transparent 40%, #00000099 100%);
      }
      .fs-stars { position: fixed; inset: 0; pointer-events: none; z-index: 1; }
      .fs-nebula {
        position: fixed; inset: 0; pointer-events: none; z-index: 2;
        background: radial-gradient(ellipse at 30% 40%, ${acc}10 0%, transparent 50%),
                    radial-gradient(ellipse at 70% 60%, ${acc}08 0%, transparent 50%);
      }
      @keyframes fs-twinkle { from{opacity:0.05} to{opacity:0.5} }

      /* ── Nagłówek ── */
      .fs-header {
        position: relative; z-index: 10;
        text-align: center;
        padding: 28px 20px 8px;
      }
      .fs-step-indicator {
        font-size: 11px; letter-spacing: 5px; color: ${acc};
        opacity: 0.4; margin-bottom: 10px;
      }
      .fs-title {
        font-family: 'Orbitron', 'Share Tech Mono', monospace;
        font-size: 34px; font-weight: 700;
        letter-spacing: 8px; color: ${acc};
        text-shadow: 0 0 40px ${acc}30;
        margin: 0 0 10px;
      }
      .fs-subtitle {
        font-size: 14px; letter-spacing: 2px;
        color: ${acc}88; margin: 0;
      }

      /* ── Body (wymienna zawartość środkowa) ── */
      .fs-body {
        position: relative; z-index: 10;
        flex: 1;
        display: flex; flex-direction: column;
        transition: opacity 0.3s ease;
      }
      .fs-content {
        position: relative; z-index: 10;
        flex: 1; display: flex; align-items: center; justify-content: center;
        padding: 20px 48px;
        gap: 28px;
      }

      /* ── Krok 1: siatka 6 kart liderów (3 kolumny × 2 rzędy) ── */
      .fs-leaders-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(280px, 320px));
        gap: 22px;
        max-width: 1080px;
        margin: 0 auto;
        padding: 22px 0;
        align-items: start;
      }
      @media (max-width: 1100px) {
        .fs-leaders-grid { grid-template-columns: repeat(2, minmax(260px, 320px)); }
      }
      @media (max-width: 720px) {
        .fs-leaders-grid { grid-template-columns: 1fr; }
      }

      .fs-leader-card {
        padding: 22px 20px;
        border: 1px solid ${acc}20;
        border-radius: 4px;
        background: ${acc}05;
        cursor: pointer;
        transition: all 0.25s ease-out;
        text-align: center;
        position: relative;
        overflow: visible;
      }
      .fs-leader-card:hover {
        background: ${acc}0c;
        border-color: ${acc}55;
        box-shadow: 0 0 22px ${acc}18, 0 0 44px ${acc}08;
        transform: translateY(-2px);
      }
      .fs-leader-card.selected {
        background: ${acc}12;
        border-color: ${acc}80;
        box-shadow: 0 0 30px ${acc}25, 0 0 60px ${acc}10;
      }

      /* ── Portret ── */
      .fs-portrait-wrap {
        width: 160px; height: 200px;
        margin: 0 auto 14px;
        border: 1px solid ${acc}30;
        border-radius: 4px;
        overflow: hidden;
        position: relative;
        transition: transform 0.3s ease-out, box-shadow 0.3s ease-out, border-color 0.3s ease-out;
      }
      .fs-leader-card:hover .fs-portrait-wrap {
        border-color: ${acc}60;
        transform: scale(1.04);
        box-shadow: 0 6px 22px ${acc}20;
      }
      .fs-leader-card.selected .fs-portrait-wrap {
        border-color: ${acc}80;
        transform: scale(1.04);
        box-shadow: 0 6px 28px ${acc}25;
      }
      .fs-portrait-wrap::after {
        content: ''; position: absolute; inset: 0;
        box-shadow: inset 0 0 30px rgba(0,0,0,0.75);
        pointer-events: none; z-index: 2;
      }
      .fs-portrait-img {
        width: 100%; height: 100%; object-fit: cover;
      }
      .fs-portrait-fallback {
        width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Orbitron', monospace;
        font-size: 42px; font-weight: 700;
        letter-spacing: 4px;
        background: ${acc}15;
        color: ${acc};
      }

      .fs-leader-archetype {
        font-family: 'Orbitron', monospace;
        font-size: 10px; letter-spacing: 3px;
        color: ${acc}99;
        text-transform: uppercase;
        margin: 0 0 6px;
      }
      .fs-leader-name {
        font-family: 'Orbitron', monospace;
        font-size: 13px; font-weight: 700;
        letter-spacing: 1.5px; color: ${acc};
        margin: 0 0 4px; text-transform: uppercase;
      }
      .fs-leader-title {
        font-size: 11px; margin: 0 0 4px;
        font-style: italic; color: ${acc}88;
      }
      .fs-leader-age {
        font-size: 11px; color: ${acc}55;
        margin: 0 0 12px;
      }
      .fs-leader-stats {
        text-align: left;
      }
      .fs-leader-bonus {
        font-size: 11px; color: ${THEME.success || '#00ee88'}; margin: 3px 0;
      }

      /* ── Potwierdzenie (Krok 2) ── */
      .fs-confirm-layout {
        gap: 56px; max-width: 960px; margin: 0 auto;
        align-items: center;
      }
      .fs-confirm-portrait {
        width: 300px; height: 380px; flex-shrink: 0;
        border: 1px solid ${acc}40;
        border-radius: 4px; overflow: hidden;
        box-shadow: 0 0 24px ${acc}18;
        position: relative;
      }
      .fs-confirm-portrait::after {
        content: ''; position: absolute; inset: 0;
        box-shadow: inset 0 0 50px rgba(0,0,0,0.8);
        pointer-events: none; z-index: 1;
      }
      .fs-confirm-img {
        width: 100%; height: 100%; object-fit: cover;
      }
      .fs-confirm-fallback {
        width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Orbitron', monospace;
        font-size: 64px; font-weight: 700;
        letter-spacing: 6px; color: ${acc};
        background: ${acc}15;
      }
      .fs-confirm-info {
        flex: 1; text-align: left;
      }
      .fs-confirm-archetype {
        font-family: 'Orbitron', monospace;
        font-size: 12px; letter-spacing: 4px;
        color: ${acc}aa;
        text-transform: uppercase;
        margin: 0 0 8px;
      }
      .fs-confirm-name {
        font-family: 'Orbitron', monospace;
        font-size: 24px; font-weight: 700;
        letter-spacing: 4px; color: ${acc};
        margin: 0 0 8px; text-transform: uppercase;
      }
      .fs-confirm-title-text {
        font-size: 15px; margin: 0 0 20px;
        font-style: italic; letter-spacing: 1px;
        color: ${acc}aa;
      }
      .fs-confirm-quote {
        font-size: 14px; color: ${acc}bb;
        font-style: italic; line-height: 1.8;
        margin: 0 0 24px;
        padding-left: 16px;
        border-left: 2px solid ${acc}30;
      }
      .fs-confirm-sep {
        height: 1px; background: ${acc}15;
        margin: 20px 0;
      }
      .fs-confirm-stats {
        margin: 0;
      }
      .fs-confirm-bonus {
        font-size: 13px; color: ${THEME.success || '#00ee88'}; margin: 5px 0;
      }

      /* ── Barwy imperium (B2) ── */
      .fs-colors-label {
        font-family: 'Orbitron', monospace;
        font-size: 10px; letter-spacing: 3px;
        color: ${acc}99; text-transform: uppercase;
        margin: 0 0 10px;
      }
      .fs-swatch-row { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 4px; }
      .fs-swatch {
        width: 28px; height: 28px; border-radius: 4px; cursor: pointer;
        border: 2px solid rgba(255,255,255,0.15);
        box-shadow: inset 0 0 0 1px rgba(0,0,0,0.35);
        transition: transform 0.15s ease-out, border-color 0.15s ease-out, box-shadow 0.15s ease-out;
      }
      .fs-swatch:hover { transform: translateY(-2px) scale(1.08); border-color: rgba(255,255,255,0.45); }
      .fs-swatch.selected { border-color: #ffffff; box-shadow: 0 0 0 2px ${acc}, 0 0 14px ${acc}66; }

      /* ── Nawigacja ── */
      .fs-nav {
        position: relative; z-index: 10;
        display: flex; justify-content: space-between;
        padding: 16px 48px 28px;
      }
      .fs-btn {
        font-family: 'Orbitron', 'Share Tech Mono', monospace;
        font-size: 14px; font-weight: 700;
        letter-spacing: 3px; padding: 14px 36px;
        background: transparent; cursor: pointer;
        border-radius: 2px; transition: all 0.2s;
        text-transform: uppercase;
      }
      .fs-btn:disabled {
        opacity: 0.2; cursor: not-allowed;
      }
      .fs-btn-back {
        border: 1px solid ${acc}25;
        color: ${acc}60;
      }
      .fs-btn-back:hover {
        border-color: ${acc}50;
        color: ${acc};
        background: ${acc}08;
      }
      .fs-btn-start {
        border: 1px solid ${acc}60;
        color: ${acc};
        font-size: 16px; padding: 16px 48px;
      }
      .fs-btn-start:hover {
        background: ${acc}0a;
        box-shadow: 0 0 20px ${acc}25;
      }
    `;
  }
}
