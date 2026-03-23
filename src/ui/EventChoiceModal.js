// EventChoiceModal — modal DOM do wyświetlania zdarzeń losowych
//
// Wyświetla powiadomienie o zdarzeniu losowym z opcjonalnym wyborem gracza.
// Styl: Amber Terminal (2-kolumnowy layout, CRT wewnątrz panelu).

import { THEME } from '../config/ThemeConfig.js';
import { t } from '../i18n/i18n.js';
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

    // Nazwa i opis z i18n (fallback na pola obiektu)
    const eventName = t(`event.${event.id}.name`) !== `event.${event.id}.name`
      ? t(`event.${event.id}.name`)
      : (event.namePL ?? event.id);
    const eventDesc = t(`event.${event.id}.desc`) !== `event.${event.id}.desc`
      ? t(`event.${event.id}.desc`)
      : (event.descriptionPL ?? event.description ?? '');

    let stats = '';
    stats += formatStatLine(t('eventChoice.colony'), colonyName);
    if (event.duration > 0) {
      stats += formatStatLine(t('eventChoice.time'), t('eventChoice.duration', event.duration), 'at-stat-neu');
    }

    // Prosperity delta z efektów
    const prosperityFx = event.effects?.find(fx => fx.type === 'prosperity');
    if (prosperityFx) {
      const sign = prosperityFx.delta > 0 ? '+' : '';
      const cls = prosperityFx.delta > 0 ? 'at-stat-pos' : 'at-stat-neg';
      stats += formatStatLine(t('eventChoice.prosperity'), `${sign}${prosperityFx.delta}`, cls);
    }

    stats += formatStatLineWithCursor(t('eventChoice.statusLabel'), t('eventChoice.active'), 'at-stat-neu');

    const { overlay, dismiss, btnElements } = buildTerminalPopup({
      severity,
      barTitle: t('eventChoice.barTitle'),
      svgKey: severity === 'danger' ? 'alert' : 'report',
      svgLabel: severity === 'danger' ? t('eventChoice.alarm') : t('eventChoice.event'),
      prompt: t('eventChoice.prompt'),
      headline: eventName.toUpperCase(),
      description: eventDesc,
      contentHTML: stats,
      buttons: [{ label: t('ui.accept'), primary: true }],
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
      title: t('impact.light.title'),
      desc: t('impact.light.desc'),
      severity: 'info',
      svgLabel: t('impact.light.label').replace(/\n/g, '<br>'),
      autoClose: 6000,
    },
    moderate: {
      icon: '💥',
      title: t('impact.medium.title'),
      desc: t('impact.medium.desc'),
      severity: 'danger',
      svgLabel: t('impact.medium.label').replace(/\n/g, '<br>'),
      autoClose: 10000,
    },
    heavy: {
      icon: '🔥',
      title: t('impact.heavy.title'),
      desc: t('impact.heavy.desc'),
      severity: 'danger',
      svgLabel: t('impact.heavy.label').replace(/\n/g, '<br>'),
      autoClose: 0,
    },
    extinction: {
      icon: '☠',
      title: t('impact.extinction.title'),
      desc: t('impact.extinction.desc'),
      severity: 'danger',
      svgLabel: t('impact.extinction.label').replace(/\n/g, '<br>'),
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
    stats += formatStatLine(t('eventChoice.colony'), planetName ?? '?');

    if (popLost > 0) {
      stats += formatStatLine(t('eventChoice.population'), t('eventChoice.popLost', popLost, popRemaining ?? '?'), 'at-stat-neg');
    }
    if (buildingsDestroyed > 0) {
      stats += formatStatLine(t('eventChoice.buildings'), t('eventChoice.buildingsDestroyed', buildingsDestroyed), 'at-stat-neg');
    }
    if (resourceLossPercent > 0) {
      stats += formatStatLine(t('eventChoice.resources'), t('eventChoice.resourcesLost', resourceLossPercent), 'at-stat-neg');
    }
    stats += formatStatLineWithCursor(t('eventChoice.riskLabel'), severity === 'extinction' ? t('eventChoice.extinction') : t('eventChoice.critical'), 'at-stat-neg');

    const { overlay, dismiss, btnElements } = buildTerminalPopup({
      severity: cfg.severity,
      barTitle: `⚠ ${cfg.title} ⚠`,
      svgKey: 'impact',
      svgLabel: cfg.svgLabel,
      prompt: t('eventChoice.impactPrompt'),
      headline: cfg.title,
      description: cfg.desc,
      contentHTML: stats,
      buttons: [{ label: t('ui.acknowledge'), primary: true }],
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

// ── Modal ruchu spolecznego ───────────────────────────────────────────────

/**
 * Pokaz modal ruchu spolecznego z 3 opcjami (negotiate/suppress/ignore).
 * @param {Object} data — dane z civ:movementStarted
 * @returns {Promise<string>} — resolutionId ('negotiate'|'suppress'|'ignore')
 */
export function showMovementModal(data) {
  return new Promise(resolve => {
    const { movementId, namePL, nameEN, demands, strength } = data;
    const isEN = (t('lang') === 'en');
    const title = isEN ? (nameEN ?? namePL) : namePL;
    const demandList = (demands ?? []).map(d => `\u2022 ${d}`).join('<br>');

    let stats = '';
    stats += formatStatLine(isEN ? 'Strength' : 'Sila', `${Math.round(strength * 100)}%`, 'at-stat-neg');
    stats += formatSectionTitle(isEN ? 'DEMANDS' : 'ZADANIA');
    stats += `<div style="padding:4px 8px;font-size:12px;color:${THEME.textSecondary}">${demandList}</div>`;

    const { overlay, dismiss, btnElements } = buildTerminalPopup({
      severity: 'danger',
      barTitle: `\u270A ${title}`,
      svgKey: 'alert',
      svgLabel: isEN ? 'SOCIAL<br>MOVEMENT' : 'RUCH<br>SPOLECZNY',
      prompt: isEN ? 'How do you respond?' : 'Jak reagujesz?',
      headline: title,
      description: isEN
        ? 'Workers are demanding change. Choose your response carefully.'
        : 'Robotnicy zadaja zmian. Wybierz odpowiedz ostroznie.',
      contentHTML: stats,
      buttons: [
        { label: isEN ? 'Negotiate' : 'Negocjuj', primary: true },
        { label: isEN ? 'Suppress' : 'Stlum', primary: false },
        { label: isEN ? 'Ignore' : 'Ignoruj', primary: false },
      ],
      onDismiss: () => {
        document.removeEventListener('keydown', onKey);
        resolve(_chosenResolution);
      },
    });

    let _chosenResolution = 'ignore';
    const resolutionMap = ['negotiate', 'suppress', 'ignore'];
    for (let i = 0; i < btnElements.length; i++) {
      const resId = resolutionMap[i];
      btnElements[i].addEventListener('click', () => {
        _chosenResolution = resId;
        dismiss();
      });
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { _chosenResolution = 'ignore'; dismiss(); }
    });

    const onKey = (e) => {
      if (e.code === 'Escape') { _chosenResolution = 'ignore'; dismiss(); }
      if (e.code === 'Enter') { _chosenResolution = 'negotiate'; dismiss(); }
    };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    requestAnimationFrame(() => { if (btnElements[0]) btnElements[0].focus(); });
  });
}
