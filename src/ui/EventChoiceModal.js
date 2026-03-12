// EventChoiceModal — modal DOM do wyświetlania zdarzeń losowych
//
// Wyświetla powiadomienie o zdarzeniu losowym z opcjonalnym wyborem gracza.
// Styl: Amber Terminal (2-kolumnowy layout, CRT wewnątrz panelu).

import { THEME } from '../config/ThemeConfig.js';
import {
  buildTerminalPopup,
  formatStatLine,
  formatStatLineWithCursor,
  formatSectionTitle,
} from './TerminalPopupBase.js';

const MODAL_TIMEOUT = 8000; // ms — auto-zamknięcie po 8 sekundach

/**
 * Pokaż powiadomienie o zdarzeniu losowym.
 * @param {Object} event — definicja zdarzenia z RandomEventsData
 * @param {string} colonyName — nazwa kolonii
 * @returns {Promise<void>}
 */
export function showEventNotification(event, colonyName) {
  return new Promise(resolve => {
    const severity = event.severity === 'danger' ? 'danger'
                   : event.severity === 'warning' ? 'info'
                   : 'info';

    let stats = '';
    stats += formatStatLine('KOLONIA', colonyName);
    if (event.duration > 0) {
      stats += formatStatLine('CZAS', `${event.duration} lat`, 'at-stat-neu');
    }
    stats += formatStatLineWithCursor('STATUS', 'AKTYWNE', 'at-stat-neu');

    const { overlay, dismiss, btnElements } = buildTerminalPopup({
      severity,
      barTitle: 'KOSMOS OS  ▌ POWIADOMIENIE',
      svgKey: severity === 'danger' ? 'alert' : 'report',
      svgLabel: severity === 'danger' ? 'ALARM' : 'ZDARZENIE',
      prompt: '> EVENT_SYS.LOG_',
      headline: (event.namePL ?? event.name ?? 'ZDARZENIE').toUpperCase(),
      description: event.description,
      contentHTML: stats,
      buttons: [{ label: '[ENTER] PRZYJMIJ', primary: true }],
      onDismiss: () => {
        clearTimeout(timer);
        resolve();
      },
    });

    // Podłącz dismiss do przycisku
    for (const btn of btnElements) {
      btn.addEventListener('click', () => dismiss());
    }

    // Klik na overlay = zamknij
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) dismiss();
    });

    // Keyboard
    const onKey = (e) => {
      if (e.code === 'Enter' || e.code === 'Escape') {
        e.stopPropagation();
        document.removeEventListener('keydown', onKey);
        dismiss();
      }
    };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);

    // Auto-zamknięcie po timeout
    const timer = setTimeout(() => dismiss(), MODAL_TIMEOUT);

    requestAnimationFrame(() => { if (btnElements[0]) btnElements[0].focus(); });
  });
}

// ── Konfiguracja uderzeń kosmicznych ────────────────────────────────────

function _getImpactConfig() {
  return {
    light: {
      icon: '☄',
      title: 'UDERZENIE METEORYTYCZNE',
      desc: 'Niewielki obiekt kosmiczny uderzył w powierzchnię planety. Szkody są ograniczone.',
      severity: 'info',
      svgLabel: 'UDERZENIE<br>LEKKIE',
      autoClose: 6000,
    },
    moderate: {
      icon: '💥',
      title: 'BOMBARDOWANIE KOSMICZNE!',
      desc: 'Znaczący obiekt uderzył w planetę powodując poważne zniszczenia infrastruktury i straty wśród populacji.',
      severity: 'danger',
      svgLabel: 'UDERZENIE<br>ŚREDNIE',
      autoClose: 10000,
    },
    heavy: {
      icon: '🔥',
      title: 'KATASTROFALNE UDERZENIE!',
      desc: 'Ogromne ciało kosmiczne uderzyło w planetę. Większość infrastruktury i populacji została zniszczona. Cywilizacja walczy o przetrwanie.',
      severity: 'danger',
      svgLabel: 'UDERZENIE<br>KRYTYCZNE',
      autoClose: 0,
    },
    extinction: {
      icon: '☠',
      title: 'APOKALIPSA — ZAGŁADA!',
      desc: 'Masywne ciało planetarne uderzyło w planetę. Cała cywilizacja została unicestwiona. Powierzchnia planety jest pokryta morzem lawy.',
      severity: 'danger',
      svgLabel: 'ZAGŁADA',
      autoClose: 0,
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
    let stats = '';
    stats += formatStatLine('KOLONIA', planetName ?? '?');

    if (popLost > 0) {
      stats += formatStatLine('POPULACJA', `−${popLost} POP (${popRemaining ?? '?'} pozostało)`, 'at-stat-neg');
    }
    if (buildingsDestroyed > 0) {
      stats += formatStatLine('BUDYNKI', `−${buildingsDestroyed} zniszczonych`, 'at-stat-neg');
    }
    if (resourceLossPercent > 0) {
      stats += formatStatLine('ZASOBY', `−${resourceLossPercent}% utraconych`, 'at-stat-neg');
    }
    stats += formatStatLineWithCursor('RYZYKO', severity === 'extinction' ? 'ZAGŁADA' : 'KRYTYCZNE', 'at-stat-neg');

    const { overlay, dismiss, btnElements } = buildTerminalPopup({
      severity: cfg.severity,
      barTitle: `⚠ ${cfg.title} ⚠`,
      svgKey: 'impact',
      svgLabel: cfg.svgLabel,
      prompt: '> IMPACT_ALERT.EXE_',
      headline: cfg.title,
      description: cfg.desc,
      contentHTML: stats,
      buttons: [{ label: '[ENTER] PRZYJMUJĘ DO WIADOMOŚCI', primary: true }],
      onDismiss: () => {
        if (timer) clearTimeout(timer);
        document.removeEventListener('keydown', onKey);
        resolve();
      },
    });

    // Podłącz dismiss do przycisku
    for (const btn of btnElements) {
      btn.addEventListener('click', () => dismiss());
    }

    // Klik na overlay = zamknij
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) dismiss();
    });

    // Keyboard
    const onKey = (e) => {
      if (e.code === 'Enter' || e.code === 'Escape') {
        e.stopPropagation();
        dismiss();
      }
    };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);

    // Auto-zamknięcie (0 = brak — gracz musi kliknąć)
    let timer = null;
    if (cfg.autoClose > 0) {
      timer = setTimeout(() => dismiss(), cfg.autoClose);
    }

    requestAnimationFrame(() => { if (btnElements[0]) btnElements[0].focus(); });
  });
}
