// ConsulElectionModal — modal wyboru nowego Konsula (Poszukiwacze co 15 lat)
//
// Wyświetla 3 losowych kandydatów (bez aktualnego Konsula).
// Pauzuje grę, po wyborze przywraca prędkość.

import EventBus from '../core/EventBus.js';
import { LEADERS, SEEKER_CONSULS } from '../data/LeaderData.js';
import { THEME, hexToRgb } from '../config/ThemeConfig.js';
import { t, getLocale } from '../i18n/i18n.js';

const PL = () => getLocale() === 'pl';

let _active = null;
let _savedTimeState = null;

// ── Inicjalizacja ──────────────────────────────────────────────────────

export function initConsulElection() {
  EventBus.on('leader:consulElectionNeeded', _onElectionNeeded);
}

function _onElectionNeeded({ currentConsul, year }) {
  // Zapobiegaj wielokrotnym modalom
  if (_active) return;

  // Pobierz 3 losowych kandydatów (bez aktualnego)
  const available = SEEKER_CONSULS
    .filter(id => id !== currentConsul)
    .map(id => LEADERS[id]);

  // Wylosuj 3 z dostępnych 4
  const shuffled = available.sort(() => Math.random() - 0.5);
  const candidates = shuffled.slice(0, 3);

  // Pauzuj grę
  _savedTimeState = {
    multiplierIndex: window.KOSMOS?.timeSystem?.multiplierIndex ?? 1,
    isPaused: window.KOSMOS?.timeSystem?.isPaused ?? false,
  };
  EventBus.emit('time:pause');

  _showModal(candidates, year);
}

// ── Modal DOM ──────────────────────────────────────────────────────────

function _showModal(candidates, year) {
  _injectCSS();

  const overlay = document.createElement('div');
  overlay.className = 'ce-overlay';
  _active = overlay;

  const { r, g, b } = hexToRgb(THEME.bgPrimary);
  overlay.style.background = `rgba(${r},${g},${b},0.85)`;

  const factionColor = '#D85A30'; // Poszukiwacze

  const cardsHtml = candidates.map(leader => {
    const initials = leader.namePL.split(' ')
      .filter(w => w.length > 2 && w[0] === w[0].toUpperCase())
      .map(w => w[0]).join('').slice(0, 2);

    const bonuses = (leader.bonuses || []).map(b =>
      `<div class="ce-bonus">✦ ${PL() ? b.descPL : b.descEN}</div>`
    ).join('');
    const maluses = (leader.maluses || []).map(m =>
      `<div class="ce-malus">✗ ${PL() ? m.descPL : m.descEN}</div>`
    ).join('');

    return `
      <div class="ce-card" data-leader="${leader.id}">
        <div class="ce-portrait" style="background:${factionColor}20; color:${factionColor}">
          <img src="${leader.portrait}"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
               style="width:100%;height:100%;object-fit:cover;">
          <div class="ce-initials" style="display:none">${initials}</div>
        </div>
        <h3 class="ce-name">${leader.namePL}</h3>
        <p class="ce-title" style="color:${factionColor}aa">
          ${PL() ? leader.titlePL : (leader.titleEN || leader.titlePL)}
        </p>
        <p class="ce-program">${PL() ? leader.programDescPL : (leader.programDescEN || leader.programDescPL)}</p>
        <div class="ce-stats">
          ${bonuses}
          ${maluses}
        </div>
        <button class="ce-select-btn" style="border-color:${factionColor}; color:${factionColor}">
          ${PL() ? 'WYBIERZ' : 'SELECT'}
        </button>
      </div>
    `;
  }).join('');

  overlay.innerHTML = `
    <div class="ce-panel">
      <div class="ce-header">
        <div class="ce-bar" style="background:${factionColor}">
          <span class="ce-bar-title">${PL() ? 'WYBORY KONSULARNE' : 'CONSULAR ELECTION'}</span>
          <span class="ce-bar-year">${PL() ? 'ROK' : 'YEAR'} ${Math.round(year)}</span>
        </div>
        <p class="ce-desc">${PL()
          ? 'Kadencja Konsula dobiegła końca. Wybierz nowego przywódcę Poszukiwaczy Drogi.'
          : 'The Consul\'s term has ended. Choose a new leader for the Seekers of the Way.'}</p>
      </div>
      <div class="ce-cards">${cardsHtml}</div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Bind przycisków
  overlay.querySelectorAll('.ce-select-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.ce-card');
      const leaderId = card?.dataset.leader;
      if (!leaderId) return;
      _selectConsul(leaderId, year);
    });
  });

  // Hover efekt na kartach
  overlay.querySelectorAll('.ce-card').forEach(card => {
    card.addEventListener('click', () => {
      const leaderId = card.dataset.leader;
      if (leaderId) _selectConsul(leaderId, year);
    });
  });
}

function _selectConsul(leaderId, year) {
  const leaderSys = window.KOSMOS?.leaderSystem;
  if (leaderSys) {
    leaderSys.changeConsul(leaderId, year);
  }

  // Zamknij modal
  if (_active) {
    _active.style.transition = 'opacity 0.4s ease';
    _active.style.opacity = '0';
    setTimeout(() => {
      _active?.remove();
      _active = null;
    }, 400);
  }

  // Przywróć czas
  if (_savedTimeState && !_savedTimeState.isPaused) {
    EventBus.emit('time:resume');
  }
  _savedTimeState = null;
}

// ── CSS ────────────────────────────────────────────────────────────────

function _injectCSS() {
  if (document.getElementById('ce-modal-css')) return;

  const factionColor = '#D85A30';

  const style = document.createElement('style');
  style.id = 'ce-modal-css';
  style.textContent = `
    .ce-overlay {
      position: fixed; inset: 0; z-index: 200;
      display: flex; align-items: center; justify-content: center;
      animation: ceFadeIn 0.4s ease-out;
    }
    @keyframes ceFadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .ce-panel {
      max-width: 900px; width: 94%;
      font-family: ${THEME.fontFamily};
      border: 1px solid ${factionColor}40;
      background: ${THEME.bgPrimary};
      box-shadow: 0 0 30px ${factionColor}15;
      animation: cePanelIn 0.35s ease-out;
    }
    @keyframes cePanelIn {
      from { transform: translateY(-15px) scale(0.97); opacity: 0; }
      to   { transform: translateY(0) scale(1); opacity: 1; }
    }

    .ce-bar {
      padding: 8px 16px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .ce-bar-title {
      font-size: ${THEME.fontSizeLarge}px;
      letter-spacing: 3px; font-weight: bold;
      color: ${THEME.bgPrimary};
    }
    .ce-bar-year {
      font-size: ${THEME.fontSizeSmall + 1}px;
      color: ${THEME.bgPrimary}; opacity: 0.7;
    }

    .ce-desc {
      font-size: ${THEME.fontSizeNormal}px;
      color: ${THEME.textSecondary};
      padding: 14px 16px 6px;
      margin: 0;
      text-align: center;
    }

    .ce-cards {
      display: flex; gap: 12px; padding: 16px;
      justify-content: center; flex-wrap: wrap;
    }

    .ce-card {
      flex: 0 1 250px;
      padding: 16px;
      border: 1px solid rgba(255,255,255,0.06);
      background: rgba(255,255,255,0.02);
      cursor: pointer;
      transition: all 0.2s;
      text-align: center;
    }
    .ce-card:hover {
      border-color: ${factionColor}50;
      background: rgba(255,255,255,0.04);
      box-shadow: 0 0 15px ${factionColor}20;
    }

    .ce-portrait {
      width: 120px; height: 150px;
      margin: 0 auto 12px;
      border: 1px solid ${factionColor}60;
      overflow: hidden;
      position: relative;
    }
    .ce-portrait::after {
      content: ''; position: absolute; inset: 0;
      box-shadow: inset 0 0 40px rgba(0,0,0,0.8);
      pointer-events: none; z-index: 1;
    }
    .ce-initials {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Orbitron', monospace;
      font-size: 32px; font-weight: 700;
    }

    .ce-name {
      font-family: 'Orbitron', monospace;
      font-size: 11px; font-weight: 700;
      letter-spacing: 1px; color: #fff;
      margin: 0 0 3px; text-transform: uppercase;
    }
    .ce-title {
      font-size: 10px; margin: 0 0 3px;
      font-style: italic;
    }
    .ce-program {
      font-size: 9px; color: ${factionColor}88;
      letter-spacing: 1px; margin: 0 0 10px;
      text-transform: uppercase;
    }

    .ce-stats { text-align: left; margin-bottom: 12px; }
    .ce-bonus { font-size: 10px; color: #00ee88; margin: 2px 0; }
    .ce-malus { font-size: 10px; color: #ff4444; margin: 2px 0; }

    .ce-select-btn {
      font-family: 'Orbitron', monospace;
      font-size: 11px; font-weight: 700;
      letter-spacing: 2px; padding: 8px 20px;
      background: transparent; cursor: pointer;
      border: 1px solid; transition: all 0.2s;
      text-transform: uppercase;
    }
    .ce-select-btn:hover {
      background: ${factionColor}15;
      box-shadow: 0 0 10px ${factionColor}25;
    }
  `;
  document.head.appendChild(style);
}
