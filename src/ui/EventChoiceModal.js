// EventChoiceModal — modal DOM do wyświetlania zdarzeń losowych
//
// Wyświetla powiadomienie o zdarzeniu losowym z opcjonalnym wyborem gracza.
// Styl: sci-fi, ciemny panel, z-index 100. Kolory z THEME.

import { THEME, hexToRgb } from '../config/ThemeConfig.js';

const MODAL_TIMEOUT = 8000; // ms — auto-zamknięcie po 8 sekundach

// ── Helpery kolorów ─────────────────────────────────────────────────────
function _bgAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function _sevBg(colorHex) {
  // Ciemne tło z lekkim odcieniem severity
  const base = hexToRgb(THEME.bgPrimary);
  const sev = hexToRgb(colorHex);
  return `rgba(${Math.round(base.r * 0.7 + sev.r * 0.15)},${Math.round(base.g * 0.7 + sev.g * 0.15)},${Math.round(base.b * 0.7 + sev.b * 0.15)},0.95)`;
}

/**
 * Pokaż powiadomienie o zdarzeniu losowym.
 * @param {Object} event — definicja zdarzenia z RandomEventsData
 * @param {string} colonyName — nazwa kolonii
 * @returns {Promise<void>}
 */
export function showEventNotification(event, colonyName) {
  return new Promise(resolve => {
    // Kontener
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      z-index: 100; display: flex; justify-content: center; align-items: flex-start;
      padding-top: 80px; pointer-events: none;
    `;

    // Panel
    const panel = document.createElement('div');
    const borderColor = event.severity === 'danger' ? THEME.danger
                      : event.severity === 'warning' ? THEME.warning
                      : THEME.info;
    const bgColor = _sevBg(borderColor);
    panel.style.cssText = `
      background: ${bgColor}; border: 1px solid ${borderColor};
      border-radius: 6px; padding: 16px 24px; max-width: 400px; min-width: 280px;
      font-family: ${THEME.fontFamily}; color: ${THEME.textPrimary}; pointer-events: auto;
      box-shadow: 0 0 20px rgba(2,4,5,0.88); animation: slideDown 0.3s ease-out;
    `;

    // Nagłówek
    const header = document.createElement('div');
    header.style.cssText = 'font-size: 14px; margin-bottom: 8px; font-weight: bold;';
    header.textContent = `${event.icon} ${event.namePL}`;
    panel.appendChild(header);

    // Kolonia
    const colony = document.createElement('div');
    colony.style.cssText = `font-size: ${THEME.fontSizeNormal}px; color: ${THEME.textSecondary}; margin-bottom: 8px;`;
    colony.textContent = `Kolonia: ${colonyName}`;
    panel.appendChild(colony);

    // Opis
    const desc = document.createElement('div');
    desc.style.cssText = `font-size: ${THEME.fontSizeNormal + 1}px; color: ${THEME.textSecondary}; margin-bottom: 12px; line-height: 1.4;`;
    desc.textContent = event.description;
    panel.appendChild(desc);

    // Czas trwania
    if (event.duration > 0) {
      const dur = document.createElement('div');
      dur.style.cssText = `font-size: ${THEME.fontSizeSmall}px; color: ${THEME.textSecondary}; margin-bottom: 8px;`;
      dur.textContent = `Czas trwania: ${event.duration} lat`;
      panel.appendChild(dur);
    }

    // Przycisk OK
    const btn = document.createElement('button');
    btn.style.cssText = `
      background: ${_bgAlpha(THEME.bgTertiary, 0.9)}; border: 1px solid ${borderColor};
      color: ${THEME.accent}; padding: 4px 16px; cursor: pointer; font-family: ${THEME.fontFamily};
      font-size: ${THEME.fontSizeNormal + 1}px; border-radius: 3px;
    `;
    btn.textContent = 'OK';
    btn.onclick = close;
    panel.appendChild(btn);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Auto-zamknięcie po timeout
    const timer = setTimeout(close, MODAL_TIMEOUT);

    function close() {
      clearTimeout(timer);
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      resolve();
    }

    // Keydown: Enter/Escape zamyka
    const onKey = (e) => {
      if (e.code === 'Enter' || e.code === 'Escape') {
        e.stopPropagation();
        document.removeEventListener('keydown', onKey);
        close();
      }
    };
    document.addEventListener('keydown', onKey);
  });
}

// ── Konfiguracja uderzeń kosmicznych ─────────────────────────────────────
// Kolory severity dynamiczne — generowane z THEME w runtime
function _getImpactConfig() {
  return {
    light: {
      icon: '☄',
      title: 'Uderzenie meteorytyczne',
      desc: 'Niewielki obiekt kosmiczny uderzył w powierzchnię planety. Szkody są ograniczone.',
      borderColor: THEME.warning,
      bgColor: _sevBg(THEME.warning),
      autoClose: 6000,
      pause: false,
    },
    moderate: {
      icon: '💥',
      title: 'Bombardowanie kosmiczne!',
      desc: 'Znaczący obiekt uderzył w planetę powodując poważne zniszczenia infrastruktury i straty wśród populacji.',
      borderColor: THEME.dangerDim,
      bgColor: _sevBg(THEME.dangerDim),
      autoClose: 10000,
      pause: true,
    },
    heavy: {
      icon: '🔥',
      title: 'KATASTROFALNE UDERZENIE!',
      desc: 'Ogromne ciało kosmiczne uderzyło w planetę. Większość infrastruktury i populacji została zniszczona. Cywilizacja walczy o przetrwanie.',
      borderColor: THEME.danger,
      bgColor: _sevBg(THEME.danger),
      autoClose: 0,
      pause: true,
    },
    extinction: {
      icon: '☠',
      title: 'APOKALIPSA — ZAGŁADA!',
      desc: 'Masywne ciało planetarne uderzyło w planetę. Cała cywilizacja została unicestwiona. Powierzchnia planety jest pokryta morzem lawy.',
      borderColor: THEME.danger,
      bgColor: _sevBg(THEME.danger),
      autoClose: 0,
      pause: true,
    },
  };
}

/**
 * Pokaż powiadomienie o uderzeniu kosmicznym.
 * @param {Object} data — dane z impact:colonyDamage
 * @returns {Promise<void>}
 */
export function showImpactNotification(data) {
  const { severity, planetName, popLost, buildingsDestroyed, resourceLossPercent, popRemaining } = data;
  const IMPACT_CONFIG = _getImpactConfig();
  const cfg = IMPACT_CONFIG[severity];
  if (!cfg) return Promise.resolve();

  return new Promise(resolve => {
    // Kontener
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      z-index: 100; display: flex; justify-content: center; align-items: flex-start;
      padding-top: 80px; pointer-events: none;
    `;

    // Panel
    const panel = document.createElement('div');
    panel.style.cssText = `
      background: ${cfg.bgColor}; border: 2px solid ${cfg.borderColor};
      border-radius: 6px; padding: 18px 26px; max-width: 420px; min-width: 300px;
      font-family: ${THEME.fontFamily}; color: ${THEME.textPrimary}; pointer-events: auto;
      box-shadow: 0 0 30px rgba(2,4,5,0.88), 0 0 60px ${cfg.borderColor}33;
      animation: slideDown 0.3s ease-out;
    `;

    // Nagłówek (ikona + tytuł)
    const header = document.createElement('div');
    header.style.cssText = `font-size: 16px; margin-bottom: 6px; font-weight: bold; color: ${cfg.borderColor};`;
    header.textContent = `${cfg.icon}  ${cfg.title}`;
    panel.appendChild(header);

    // Kolonia
    const colEl = document.createElement('div');
    colEl.style.cssText = `font-size: 12px; color: ${THEME.textSecondary}; margin-bottom: 10px;`;
    colEl.textContent = `Kolonia: ${planetName ?? '?'}`;
    panel.appendChild(colEl);

    // Opis fabularny
    const desc = document.createElement('div');
    desc.style.cssText = `font-size: 12px; color: ${THEME.textSecondary}; margin-bottom: 14px; line-height: 1.5;`;
    desc.textContent = cfg.desc;
    panel.appendChild(desc);

    // Raport szkód
    const dmgLines = [];
    if (popLost > 0) {
      dmgLines.push(`👤 Stracono ${popLost} POP${popLost > 1 ? 'ów' : 'a'} (pozostało: ${popRemaining ?? '?'})`);
    }
    if (buildingsDestroyed > 0) {
      dmgLines.push(`🏗 Zniszczono ${buildingsDestroyed} budynk${buildingsDestroyed === 1 ? '' : buildingsDestroyed < 5 ? 'i' : 'ów'}`);
    }
    if (resourceLossPercent > 0) {
      dmgLines.push(`📦 Utracono ${resourceLossPercent}% zgromadzonych zasobów`);
    }

    if (dmgLines.length > 0) {
      const dmgHeader = document.createElement('div');
      dmgHeader.style.cssText = `font-size: 11px; color: ${THEME.textLabel}; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px;`;
      dmgHeader.textContent = 'Raport szkód';
      panel.appendChild(dmgHeader);

      const dmgBox = document.createElement('div');
      dmgBox.style.cssText = `
        background: rgba(2,4,5,0.45); border: 1px solid ${cfg.borderColor}44;
        border-radius: 4px; padding: 8px 10px; margin-bottom: 14px;
        font-size: 12px; line-height: 1.6;
      `;
      for (const line of dmgLines) {
        const row = document.createElement('div');
        row.style.color = THEME.textPrimary;
        row.textContent = line;
        dmgBox.appendChild(row);
      }
      panel.appendChild(dmgBox);
    }

    // Przycisk OK
    const btn = document.createElement('button');
    btn.style.cssText = `
      background: ${_bgAlpha(THEME.bgTertiary, 0.9)}; border: 1px solid ${cfg.borderColor};
      color: ${THEME.accent}; padding: 6px 20px; cursor: pointer; font-family: ${THEME.fontFamily};
      font-size: 13px; border-radius: 3px; display: block; margin: 0 auto;
    `;
    btn.textContent = 'Przyjmuję do wiadomości';
    btn.onclick = close;
    panel.appendChild(btn);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Auto-zamknięcie (0 = brak — gracz musi kliknąć)
    let timer = null;
    if (cfg.autoClose > 0) {
      timer = setTimeout(close, cfg.autoClose);
    }

    function close() {
      if (timer) clearTimeout(timer);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey);
      resolve();
    }

    const onKey = (e) => {
      if (e.code === 'Enter' || e.code === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey);

    // Focus na przycisku
    setTimeout(() => btn.focus(), 50);
  });
}

// Animacja CSS wstrzykiwana do <head>
(function injectStyle() {
  if (document.getElementById('event-modal-style')) return;
  const style = document.createElement('style');
  style.id = 'event-modal-style';
  style.textContent = `
    @keyframes slideDown {
      from { transform: translateY(-30px); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
    }
  `;
  document.head.appendChild(style);
})();
