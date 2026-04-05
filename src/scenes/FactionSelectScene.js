// FactionSelectScene — ekran wyboru frakcji i przywódcy (Faza B)
//
// Pojawia się po kliknięciu "NOWA GRA" w TitleScene, przed GameScene.
// 3 kroki: (1) wybór frakcji, (2) wybór przywódcy, (3) potwierdzenie.
// Klimat identyczny z TitleScene (gwiazdozbiór, CRT, ten sam font/kolory).

import { FACTIONS, LEADERS, CONFEDERATE_CANDIDATES, SEEKER_CONSULS } from '../data/LeaderData.js';
import { THEME } from '../config/ThemeConfig.js';
import { t, getLocale } from '../i18n/i18n.js';

const PL = () => getLocale() === 'pl';

// ── Ikony frakcji (PNG z przezroczystym tłem) ───────────────────────────
const IMG_CONFEDERATES = `<img class="fs-faction-logo" src="assets/ui/faction_confederates.png" alt="Confederates">`;
const IMG_SEEKERS      = `<img class="fs-faction-logo" src="assets/ui/faction_seekers.png" alt="Seekers">`;

export class FactionSelectScene {
  constructor() {
    this._container = null;
    this._step = 1;
    this._selectedFaction = null;
    this._selectedLeader  = null;
    this._onComplete = null;
  }

  show(onComplete) {
    this._onComplete = onComplete;
    this._buildDOM();
    this._generateStars();
    // Fade in
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

    // Stały szkielet: tło + header + środek (wymienny) + nav
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

  // ── Gwiazdy (jak TitleScene) ─────────────────────────────────────────

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

  // ── Krok 1: Wybór frakcji ────────────────────────────────────────────

  _renderStep1() {
    const conf = FACTIONS.confederates;
    const seek = FACTIONS.seekers;

    // Header
    this._setHeader(
      `${PL() ? 'KROK' : 'STEP'} 1/3`,
      PL() ? 'WYBIERZ FRAKCJĘ' : 'CHOOSE YOUR FACTION',
      PL() ? 'Twoja decyzja ukształtuje przyszłość kolonii' : 'Your decision will shape the future of the colony'
    );

    // Nav — brak (krok 1 nie ma przycisków)
    document.getElementById('fs-nav').innerHTML = '';

    // Body — karty poziome
    const body = document.getElementById('fs-body');
    body.innerHTML = `
      <div class="fs-split-container">
        <div class="fs-split-half" data-faction="confederates" style="--fc:${conf.color}">
          <img class="fs-watermark" src="assets/ui/faction_confederates.png" alt="">
          <div class="fs-half-content">
            <div class="fs-half-logo">
              <img class="fs-faction-logo-small" src="assets/ui/faction_confederates.png" alt="">
            </div>
            <div class="fs-half-center">
              <div class="fs-faction-tag">${PL() ? 'FRAKCJA I' : 'FACTION I'}</div>
              <h2 class="fs-faction-name" style="color:${conf.color}">${PL() ? conf.namePL : conf.nameEN}</h2>
              <p class="fs-faction-motto"><em>"${PL() ? conf.motto : conf.mottoEN}"</em></p>
              <div class="fs-faction-system">${PL() ? 'SYSTEM: Dożywotni Archont' : 'SYSTEM: Lifetime Archon'}</div>
            </div>
            <div class="fs-half-stats">
              <div class="fs-stat-header">${PL() ? 'BONUSY' : 'BONUSES'}</div>
              <div class="fs-stat-bonus"><span class="sym">✦</span> ${PL() ? '+20% efektywność kolonizacji' : '+20% colonization efficiency'}</div>
              <div class="fs-stat-bonus"><span class="sym">✦</span> ${PL() ? '-15% koszt budynków populacji' : '-15% population building cost'}</div>
              <div class="fs-stat-header" style="margin-top:10px">${PL() ? 'KARY' : 'PENALTIES'}</div>
              <div class="fs-stat-malus"><span class="sym">✗</span> ${PL() ? '-30% badania FTL' : '-30% FTL research'}</div>
            </div>
          </div>
        </div>

        <div class="fs-split-or">${PL() ? 'LUB' : 'OR'}</div>

        <div class="fs-split-half" data-faction="seekers" style="--fc:${seek.color}">
          <img class="fs-watermark" src="assets/ui/faction_seekers.png" alt="">
          <div class="fs-half-content">
            <div class="fs-half-logo">
              <img class="fs-faction-logo-small" src="assets/ui/faction_seekers.png" alt="">
            </div>
            <div class="fs-half-center">
              <div class="fs-faction-tag">${PL() ? 'FRAKCJA II' : 'FACTION II'}</div>
              <h2 class="fs-faction-name" style="color:${seek.color}">${PL() ? seek.namePL : seek.nameEN}</h2>
              <p class="fs-faction-motto"><em>"${PL() ? seek.motto : seek.mottoEN}"</em></p>
              <div class="fs-faction-system">${PL() ? 'SYSTEM: Konsul co 15 lat' : 'SYSTEM: Consul every 15 years'}</div>
            </div>
            <div class="fs-half-stats">
              <div class="fs-stat-header">${PL() ? 'BONUSY' : 'BONUSES'}</div>
              <div class="fs-stat-bonus"><span class="sym">✦</span> ${PL() ? '+40% badania FTL' : '+40% FTL research'}</div>
              <div class="fs-stat-bonus"><span class="sym">✦</span> ${PL() ? '+40% badania energetyczne' : '+40% energy research'}</div>
              <div class="fs-stat-header" style="margin-top:10px">${PL() ? 'KARY' : 'PENALTIES'}</div>
              <div class="fs-stat-malus"><span class="sym">✗</span> ${PL() ? '-20% morale kolonii' : '-20% colony morale'}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    this._bindFactionCards();
  }

  _bindFactionCards() {
    const halves = document.getElementById('fs-body').querySelectorAll('.fs-split-half');

    halves.forEach(half => {
      half.addEventListener('mouseenter', () => {
        halves.forEach(h => {
          if (h === half) {
            h.classList.remove('fs-card-collapsed');
            h.classList.add('fs-card-expanded');
          } else {
            h.classList.remove('fs-card-expanded');
            h.classList.add('fs-card-collapsed');
          }
        });
      });

      half.addEventListener('click', () => {
        const factionId = half.dataset.faction;
        this._selectedFaction = factionId;

        halves.forEach(h => h.classList.remove('selected'));
        half.classList.add('selected');

        setTimeout(() => {
          this._fadeTransition(() => this._renderStep2());
        }, 350);
      });
    });

    // Powrót do domyślnego stanu po opuszczeniu kontenera
    const container = document.getElementById('fs-body').querySelector('.fs-split-container');
    container.addEventListener('mouseleave', () => {
      halves.forEach(h => {
        h.classList.remove('fs-card-collapsed', 'fs-card-expanded');
      });
    });
  }

  // ── Krok 2: Wybór przywódcy ──────────────────────────────────────────

  _renderStep2() {
    const faction = FACTIONS[this._selectedFaction];
    const isSeekers = this._selectedFaction === 'seekers';

    const candidateIds = isSeekers
      ? [SEEKER_CONSULS[0]]
      : CONFEDERATE_CANDIDATES;
    const candidates = candidateIds.map(id => LEADERS[id]);

    // Header
    this._setHeader(
      `${PL() ? 'KROK' : 'STEP'} 2/3`,
      PL() ? 'WYBIERZ PRZYWÓDCĘ' : 'CHOOSE YOUR LEADER',
      PL() ? faction.namePL : faction.nameEN
    );

    // Nav
    document.getElementById('fs-nav').innerHTML = `
      <button class="fs-btn fs-btn-back" id="fs-back">← ${PL() ? 'WSTECZ' : 'BACK'}</button>
      <div></div>
    `;

    // Body
    const body = document.getElementById('fs-body');
    body.style.setProperty('--fc', faction.color);
    body.innerHTML = `
      <div class="fs-content fs-leaders-row ${isSeekers ? 'fs-single-leader' : ''}">
        ${candidates.map(leader => this._renderLeaderCard(leader, faction.color)).join('')}
      </div>
      ${isSeekers ? `<p class="fs-consul-info">${PL()
        ? '◈ Kolejni Konsulowie wyłaniani będą co 15 lat w wyborach'
        : '◈ Subsequent Consuls will be elected every 15 years'}</p>` : ''}
    `;

    this._bindLeaderCards(faction.color);
  }

  _renderLeaderCard(leader, factionColor) {
    const initials = leader.namePL.split(' ')
      .filter(w => w.length > 2 && w[0] === w[0].toUpperCase())
      .map(w => w[0]).join('').slice(0, 2);

    const bonusesHtml = (leader.bonuses || []).map(b =>
      `<div class="fs-leader-bonus">✦ ${PL() ? b.descPL : b.descEN}</div>`
    ).join('');

    const malusesHtml = (leader.maluses || []).map(m =>
      `<div class="fs-leader-malus">✗ ${PL() ? m.descPL : m.descEN}</div>`
    ).join('');

    return `
      <div class="fs-leader-card" data-leader="${leader.id}" style="--fc: ${factionColor}">
        <div class="fs-portrait-wrap" style="--fc: ${factionColor}">
          <img class="fs-portrait-img" src="${leader.portrait}"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
               alt="${leader.namePL}">
          <div class="fs-portrait-fallback" style="display:none">
            ${initials}
          </div>
        </div>
        <h3 class="fs-leader-name">${PL() ? leader.namePL : leader.namePL}</h3>
        <p class="fs-leader-title">
          ${PL() ? leader.titlePL : (leader.titleEN || leader.titlePL)}
        </p>
        <p class="fs-leader-age">${PL() ? 'Wiek' : 'Age'}: ${leader.age}</p>
        <div class="fs-leader-stats">
          ${bonusesHtml}
          ${malusesHtml}
        </div>
      </div>
    `;
  }

  _bindLeaderCards(factionColor) {
    const cards = document.getElementById('fs-body').querySelectorAll('.fs-leader-card');
    const backBtn = document.getElementById('fs-back');

    cards.forEach(card => {
      card.addEventListener('click', () => {
        this._selectedLeader = card.dataset.leader;

        cards.forEach(cc => cc.classList.remove('selected'));
        card.classList.add('selected');

        // Natychmiastowe przejście do kroku 3
        setTimeout(() => {
          this._fadeTransition(() => this._renderStep3());
        }, 350);
      });
    });

    backBtn.addEventListener('click', () => {
      this._selectedLeader = null;
      this._fadeTransition(() => this._renderStep1());
    });
  }

  // ── Krok 3: Potwierdzenie ────────────────────────────────────────────

  _renderStep3() {
    const faction = FACTIONS[this._selectedFaction];
    const leader = LEADERS[this._selectedLeader];
    const factionColor = faction.color;

    const initials = leader.namePL.split(' ')
      .filter(w => w.length > 2 && w[0] === w[0].toUpperCase())
      .map(w => w[0]).join('').slice(0, 2);

    const bonusesHtml = (leader.bonuses || []).map(b =>
      `<div class="fs-confirm-bonus">✦ ${PL() ? b.descPL : b.descEN}</div>`
    ).join('');

    const malusesHtml = (leader.maluses || []).map(m =>
      `<div class="fs-confirm-malus">✗ ${PL() ? m.descPL : m.descEN}</div>`
    ).join('');

    // Header
    this._setHeader(
      `${PL() ? 'KROK' : 'STEP'} 3/3`,
      PL() ? 'POTWIERDZENIE' : 'CONFIRMATION',
      ''
    );

    // Nav
    const nav = document.getElementById('fs-nav');
    nav.innerHTML = `
      <button class="fs-btn fs-btn-back" id="fs-back">← ${PL() ? 'WSTECZ' : 'BACK'}</button>
      <button class="fs-btn fs-btn-start" id="fs-start">${PL() ? 'ROZPOCZNIJ GRĘ' : 'START GAME'} ►</button>
    `;

    // Body
    const body = document.getElementById('fs-body');
    body.innerHTML = `
      <div class="fs-content fs-confirm-layout">
        <div class="fs-confirm-portrait" style="--fc: ${factionColor}">
          <img class="fs-confirm-img" src="${leader.portrait}"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
               alt="${leader.namePL}">
          <div class="fs-confirm-fallback" style="display:none">
            ${initials}
          </div>
        </div>

        <div class="fs-confirm-info">
          <h2 class="fs-confirm-name">${leader.namePL}</h2>
          <p class="fs-confirm-title-text">
            ${PL() ? leader.titlePL : (leader.titleEN || leader.titlePL)}
          </p>
          <p class="fs-confirm-quote">
            "${PL() ? leader.quote : (leader.quoteEN || leader.quote)}"
          </p>
          <div class="fs-confirm-sep"></div>
          <div class="fs-confirm-stats">
            ${bonusesHtml}
            ${malusesHtml}
          </div>
          <div class="fs-confirm-sep"></div>
          <p class="fs-confirm-faction">
            ${PL() ? faction.namePL : faction.nameEN}
          </p>
        </div>
      </div>
    `;

    nav.querySelector('#fs-back').addEventListener('click', () => {
      this._fadeTransition(() => this._renderStep2());
    });

    nav.querySelector('#fs-start').addEventListener('click', () => {
      window.KOSMOS.selectedFaction = this._selectedFaction;
      window.KOSMOS.selectedLeader  = this._selectedLeader;

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
    // Kolory z aktywnego theme
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
        background: radial-gradient(ellipse at 30% 40%, rgba(55,138,221,0.06) 0%, transparent 50%),
                    radial-gradient(ellipse at 70% 60%, rgba(216,90,48,0.06) 0%, transparent 50%);
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

      /* ── Zawartość (kroki 2, 3) ── */
      .fs-content {
        position: relative; z-index: 10;
        flex: 1; display: flex; align-items: center; justify-content: center;
        padding: 20px 48px;
        gap: 28px;
      }

      /* ── Body (wymienna zawartość środkowa) ── */
      .fs-body {
        position: relative; z-index: 10;
        flex: 1;
        display: flex; flex-direction: column;
        transition: opacity 0.3s ease;
      }

      /* ── Krok 1: karty poziome ── */
      .fs-split-container {
        z-index: 10;
        display: flex; align-items: center; justify-content: center;
        gap: 0;
        max-width: 1100px;
        width: 90%;
        margin: auto;
      }
      .fs-split-half {
        flex: 42;
        height: 280px;
        position: relative;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        overflow: hidden;
        border: 1px solid transparent;
        border-radius: 4px;
        opacity: 0.8;
        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        background: color-mix(in srgb, var(--fc) 4%, transparent);
      }
      /* Domyślnie: ukryj motto, stats, system, tag */
      .fs-split-half .fs-faction-motto,
      .fs-split-half .fs-half-stats,
      .fs-split-half .fs-faction-system,
      .fs-split-half .fs-faction-tag {
        opacity: 0;
        max-height: 0;
        overflow: hidden;
        margin: 0;
        transition: opacity 0.4s ease, max-height 0.4s ease, margin 0.4s ease;
      }
      /* Expanded: pokaż wszystko */
      .fs-split-half.fs-card-expanded {
        flex: 52;
        opacity: 1;
        background: color-mix(in srgb, var(--fc) 9%, transparent);
        border-color: ${acc}40;
        box-shadow: inset 0 0 30px color-mix(in srgb, var(--fc) 8%, transparent),
                    0 0 25px ${acc}15;
      }
      .fs-split-half.fs-card-expanded .fs-faction-motto {
        opacity: 1; max-height: 60px; margin: 0 0 10px;
      }
      .fs-split-half.fs-card-expanded .fs-half-stats {
        opacity: 1; max-height: 200px;
      }
      .fs-split-half.fs-card-expanded .fs-faction-system {
        opacity: 1; max-height: 30px; margin-top: 10px;
      }
      .fs-split-half.fs-card-expanded .fs-faction-tag {
        opacity: 0.4; max-height: 20px; margin-bottom: 8px;
      }
      /* Collapsed: dim */
      .fs-split-half.fs-card-collapsed {
        flex: 32;
        opacity: 0.5;
      }
      /* Selected */
      .fs-split-half.selected {
        flex: 55;
        opacity: 1;
        background: color-mix(in srgb, var(--fc) 12%, transparent);
        border-color: ${acc}60;
        box-shadow: inset 0 0 40px color-mix(in srgb, var(--fc) 12%, transparent),
                    0 0 35px ${acc}25;
      }
      /* Watermark logo w tle */
      .fs-watermark {
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: 220px; height: 220px;
        object-fit: contain;
        filter: brightness(0) invert(1);
        opacity: 0.06;
        pointer-events: none;
        transition: opacity 0.4s ease;
      }
      .fs-split-half:hover .fs-watermark {
        opacity: 0.12;
      }
      .fs-split-half.selected .fs-watermark {
        opacity: 0.15;
      }
      /* Treść — row layout: logo | text | stats */
      .fs-half-content {
        position: relative; z-index: 2;
        display: flex; align-items: center; gap: 24px;
        padding: 28px 32px;
        width: 100%; height: 100%;
        box-sizing: border-box;
      }
      .fs-half-logo {
        flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
      }
      .fs-half-center {
        flex: 1; min-width: 0;
      }
      .fs-half-stats {
        flex-shrink: 0;
        text-align: left;
      }
      /* Tag frakcji */
      .fs-faction-tag {
        font-size: 9px; letter-spacing: 3px;
        text-transform: uppercase;
        color: rgba(255,255,255,0.3);
        margin-bottom: 8px;
      }
      /* Logo w karcie */
      .fs-faction-logo-small {
        width: 80px; height: 80px;
        object-fit: contain;
        filter: brightness(0) invert(1);
        opacity: 0.85;
      }
      .fs-faction-name {
        font-family: 'Space Mono', 'Orbitron', monospace;
        font-size: 18px; font-weight: 700;
        letter-spacing: 3px; margin: 0 0 8px;
        text-transform: uppercase;
        /* kolor ustawiany inline style="color:..." */
      }
      .fs-faction-motto {
        font-size: 12px; color: rgba(255,255,255,0.4);
        margin: 0 0 10px; line-height: 1.5;
      }
      .fs-faction-stats {
        margin-bottom: 0;
      }
      .fs-stat-header {
        font-size: 9px; letter-spacing: 3px; color: rgba(255,255,255,0.2);
        margin-bottom: 4px; text-transform: uppercase;
      }
      .fs-stat-bonus, .fs-stat-malus {
        font-size: 12px; color: rgba(255,255,255,0.65); margin: 3px 0;
      }
      .sym {
        color: rgba(255,255,255,0.4);
        margin-right: 2px;
      }
      .fs-faction-system {
        font-size: 9px; letter-spacing: 2px;
        color: rgba(255,255,255,0.3); margin-top: 10px;
        text-transform: uppercase;
      }

      /* ── Separator "OR" ── */
      .fs-split-or {
        flex-shrink: 0;
        width: 48px;
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; letter-spacing: 4px;
        color: ${acc}30;
        z-index: 11;
      }

      /* ── Karty przywódców (Krok 2) ── */
      .fs-leaders-row {
        gap: 28px; flex-wrap: wrap;
        padding-top: 30px; /* miejsce na pop-out portretu */
      }
      .fs-leaders-row.fs-single-leader {
        justify-content: center;
      }
      @keyframes fs-holo-shimmer {
        0%   { transform: translateY(100%); }
        100% { transform: translateY(-100%); }
      }
      .fs-leader-card {
        flex: 0 1 340px;
        padding: 32px 28px;
        border: 1px solid transparent;
        border-radius: 4px;
        background: color-mix(in srgb, var(--fc) 4%, transparent);
        cursor: pointer;
        transition: all 0.3s ease-out;
        text-align: center;
        overflow: visible;
      }
      .fs-leader-card:hover {
        background: color-mix(in srgb, var(--fc) 8%, transparent);
        border-color: ${acc}40;
        box-shadow: 0 0 25px ${acc}15, 0 0 50px ${acc}08;
      }
      .fs-leader-card.selected {
        background: color-mix(in srgb, var(--fc) 10%, transparent);
        border-color: ${acc}60;
        box-shadow: 0 0 35px ${acc}25, 0 0 70px ${acc}10;
      }

      /* ── Portret ── */
      .fs-portrait-wrap {
        width: 220px; height: 275px;
        margin: 0 auto 20px;
        border: 1px solid transparent;
        border-radius: 4px;
        overflow: hidden;
        box-shadow: none;
        position: relative;
        transition: transform 0.3s ease-out, box-shadow 0.3s ease-out, border-color 0.3s ease-out;
      }
      .fs-leader-card:hover .fs-portrait-wrap {
        border-color: ${acc}50;
      }
      .fs-leader-card.selected .fs-portrait-wrap {
        border-color: ${acc}70;
      }
      /* Inset shadow — przyciemnienie krawędzi */
      .fs-portrait-wrap::after {
        content: ''; position: absolute; inset: 0;
        box-shadow: inset 0 0 40px rgba(0,0,0,0.8);
        pointer-events: none; z-index: 2;
      }
      /* Holograficzny shimmer */
      .fs-portrait-wrap::before {
        content: ''; position: absolute; inset: 0;
        background: linear-gradient(
          180deg,
          transparent 0%,
          ${acc}25 45%,
          ${acc}25 55%,
          transparent 100%
        );
        z-index: 3; pointer-events: none;
        opacity: 0;
        transform: translateY(100%);
        transition: opacity 0.3s ease-out;
      }
      /* Hover: pop-out + shimmer aktywny */
      .fs-leader-card:hover .fs-portrait-wrap {
        transform: scale(1.12) translateY(-25px);
        box-shadow: 0 8px 30px ${acc}20;
      }
      .fs-leader-card:hover .fs-portrait-wrap::before {
        opacity: 1;
        animation: fs-holo-shimmer 3s ease-in-out infinite;
      }
      /* Selected: permanentny pop-out + mocniejszy glow */
      .fs-leader-card.selected .fs-portrait-wrap {
        transform: scale(1.12) translateY(-25px);
        box-shadow: 0 8px 40px ${acc}30, 0 0 60px ${acc}10;
      }
      .fs-leader-card.selected .fs-portrait-wrap::before {
        opacity: 1;
        animation: fs-holo-shimmer 3s ease-in-out infinite;
      }
      .fs-portrait-img {
        width: 100%; height: 100%; object-fit: cover;
      }
      .fs-portrait-fallback {
        width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Orbitron', monospace;
        font-size: 52px; font-weight: 700;
        letter-spacing: 4px;
        background: ${acc}15;
        color: ${acc};
      }

      .fs-leader-name {
        font-family: 'Orbitron', monospace;
        font-size: 15px; font-weight: 700;
        letter-spacing: 2px; color: var(--fc);
        margin: 0 0 6px; text-transform: uppercase;
      }
      .fs-leader-title {
        font-size: 13px; margin: 0 0 6px;
        font-style: italic; color: color-mix(in srgb, var(--fc) 60%, transparent);
      }
      .fs-leader-age {
        font-size: 12px; color: color-mix(in srgb, var(--fc) 40%, transparent);
        margin: 0 0 16px;
      }
      .fs-leader-stats {
        text-align: left;
      }
      .fs-leader-bonus {
        font-size: 12px; color: ${THEME.success || '#00ee88'}; margin: 4px 0;
      }
      .fs-leader-malus {
        font-size: 12px; color: ${THEME.danger || '#ff3344'}; margin: 4px 0;
      }

      .fs-consul-info {
        position: relative; z-index: 10;
        text-align: center;
        font-size: 13px; color: color-mix(in srgb, var(--fc, #D85A30) 50%, transparent);
        letter-spacing: 1px; margin: 0; padding: 0 20px 10px;
      }

      /* ── Potwierdzenie (Krok 3) ── */
      .fs-confirm-layout {
        gap: 56px; max-width: 960px; margin: 0 auto;
      }
      .fs-confirm-portrait {
        width: 300px; height: 380px; flex-shrink: 0;
        border: 1px solid transparent;
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
      }
      .fs-confirm-info {
        flex: 1; text-align: left;
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
      .fs-confirm-malus {
        font-size: 13px; color: ${THEME.danger || '#ff3344'}; margin: 5px 0;
      }
      .fs-confirm-faction {
        font-family: 'Orbitron', monospace;
        font-size: 14px; font-weight: 700;
        letter-spacing: 5px; margin: 0;
        text-transform: uppercase;
      }

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
