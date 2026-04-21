// BattleReportModal — raport końcowy bitwy (Victoria 2 style)
//
// Pokazywany po rozstrzygnięciu bitwy na hexie (combat:hexResolved event).
// Top-right corner, non-blocking, znika po 8 sekundach lub klik.
// Kolejkuje wiele raportów — nie nadpisuje, stackuje.

import { THEME, hexToRgb } from '../config/ThemeConfig.js';

const REPORT_DURATION_MS = 10000;
const STACK_OFFSET = 10;    // odstęp między kolejnymi raportami

let _activeReports = [];    // { element, removeTimer }
let _stylesInjected = false;

function _injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes kosmos-battle-slide-in {
      from { transform: translateX(calc(100% + 20px)); opacity: 0; }
      to   { transform: translateX(0); opacity: 1; }
    }
    @keyframes kosmos-battle-slide-out {
      from { transform: translateX(0); opacity: 1; }
      to   { transform: translateX(calc(100% + 20px)); opacity: 0; }
    }
    .kosmos-battle-report {
      animation: kosmos-battle-slide-in 0.35s ease-out;
    }
    .kosmos-battle-report.closing {
      animation: kosmos-battle-slide-out 0.35s ease-in forwards;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Pokaż raport z bitwy.
 * @param {object} params
 * @param {string} params.winnerId - 'player' | empireId | null
 * @param {number} params.q, params.r - współrzędne hexu
 * @param {number} params.playerKilled
 * @param {number} params.enemyKilled
 * @param {number} params.playerDmg
 * @param {number} params.enemyDmg
 * @param {string} [params.planetName]
 */
export function showBattleReport({
  winnerId, q, r, planetName = '???',
  playerKilled = 0, enemyKilled = 0,
  playerDmg = 0, enemyDmg = 0,
}) {
  _injectStyles();

  let title, subtitle, color;
  if (winnerId === 'player') {
    title = '⚔ ZWYCIĘSTWO';
    subtitle = `${planetName} (${q},${r})`;
    color = '#40D880';
  } else if (winnerId && winnerId !== 'player') {
    title = '💀 PORAŻKA';
    subtitle = `${planetName} (${q},${r})`;
    color = '#D85A30';
  } else {
    title = '⚔ BITWA ZAKOŃCZONA';
    subtitle = `${planetName} (${q},${r})`;
    color = '#C4A060';
  }

  const c = hexToRgb(color);
  const _bc = hexToRgb(THEME.border);

  const container = document.createElement('div');
  container.className = 'kosmos-battle-report';
  container.style.cssText = `
    position: fixed; right: 20px; z-index: 99;
    background: rgba(8, 12, 20, 0.96);
    border: 2px solid ${color};
    border-radius: 4px;
    padding: 10px 14px;
    font-family: ${THEME.fontFamily};
    color: ${THEME.textPrimary};
    min-width: 260px; max-width: 340px;
    box-shadow: 0 0 24px rgba(${c.r},${c.g},${c.b},0.35), 0 4px 16px rgba(0,0,0,0.6);
    cursor: pointer;
    pointer-events: auto;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    font-size: 13px; font-weight: bold; color: ${color};
    letter-spacing: 1.5px; margin-bottom: 2px;
  `;
  header.textContent = title;
  container.appendChild(header);

  const sub = document.createElement('div');
  sub.style.cssText = `font-size: 10px; color: ${THEME.textSecondary}; margin-bottom: 8px;`;
  sub.textContent = subtitle;
  container.appendChild(sub);

  // Stats grid — 2 kolumny
  const stats = document.createElement('div');
  stats.style.cssText = `
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 8px; padding-top: 6px;
    border-top: 1px solid rgba(${_bc.r},${_bc.g},${_bc.b},0.4);
    font-size: 10.5px;
  `;

  const left = document.createElement('div');
  left.innerHTML = `
    <div style="color: #80B8FF; font-weight: 600; margin-bottom: 3px;">🇵🇱 Gracz</div>
    <div style="color: ${THEME.textDim};">Straty: <span style="color: ${THEME.textPrimary}; font-weight: 600;">${playerKilled}</span></div>
    <div style="color: ${THEME.textDim};">Zadano: <span style="color: ${THEME.textPrimary}; font-weight: 600;">${playerDmg} dmg</span></div>
  `;
  stats.appendChild(left);

  const right = document.createElement('div');
  right.innerHTML = `
    <div style="color: #FF6040; font-weight: 600; margin-bottom: 3px;">🟥 Wróg</div>
    <div style="color: ${THEME.textDim};">Straty: <span style="color: ${THEME.textPrimary}; font-weight: 600;">${enemyKilled}</span></div>
    <div style="color: ${THEME.textDim};">Zadano: <span style="color: ${THEME.textPrimary}; font-weight: 600;">${enemyDmg} dmg</span></div>
  `;
  stats.appendChild(right);
  container.appendChild(stats);

  const hint = document.createElement('div');
  hint.style.cssText = `
    margin-top: 8px; padding-top: 6px;
    border-top: 1px solid rgba(${_bc.r},${_bc.g},${_bc.b},0.3);
    font-size: 9px; color: ${THEME.textDim}; text-align: right;
  `;
  hint.textContent = 'Kliknij aby zamknąć · Dziennik: L';
  container.appendChild(hint);

  // Pozycja — stackuj nad istniejącymi raportami
  const stackIdx = _activeReports.length;
  _repositionAll(container, stackIdx);

  document.body.appendChild(container);
  const entry = { element: container };
  _activeReports.push(entry);
  _repositionStack();

  const close = () => {
    if (entry._closing) return;
    entry._closing = true;
    container.classList.add('closing');
    setTimeout(() => {
      if (container.parentNode) container.parentNode.removeChild(container);
      _activeReports = _activeReports.filter(r => r !== entry);
      _repositionStack();
    }, 350);
  };

  container.addEventListener('click', close);
  entry.removeTimer = setTimeout(close, REPORT_DURATION_MS);
}

function _repositionAll(newEl, idx) {
  newEl.style.top = `${80 + idx * (110 + STACK_OFFSET)}px`;
}

function _repositionStack() {
  _activeReports.forEach((r, i) => {
    r.element.style.top = `${80 + i * (110 + STACK_OFFSET)}px`;
  });
}
