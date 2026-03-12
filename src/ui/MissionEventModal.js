// MissionEventModal — system popupów misji z pauzą i kolejką
//
// Każde ważne zdarzenie misji (dotarcie, katastrofa, odkrycie, kolonizacja)
// pauzuje grę, wyświetla popup z danymi, po OK przywraca prędkość.
// Kolejka: jeśli wiele zdarzeń naraz — jeden popup po drugim, czas wraca po ostatnim.
// Styl: Amber Terminal (2-kolumnowy layout, CRT wewnątrz panelu).

import EventBus      from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { DistanceUtils } from '../utils/DistanceUtils.js';
import { DepositSystem } from '../systems/DepositSystem.js';
import { THEME }     from '../config/ThemeConfig.js';
import {
  buildTerminalPopup,
  formatStatLine,
  formatStatLineWithCursor,
  formatSectionTitle,
  formatStatsGrid,
} from './TerminalPopupBase.js';

// ── Stan wewnętrzny ──────────────────────────────────────────────────────
let _queue = [];
let _active = null;           // aktualny overlay DOM
let _savedTimeState = null;   // { multiplierIndex, isPaused } sprzed 1. popupu
let _currentTimeState = { multiplierIndex: 1, isPaused: false };

// ── Helpery ──────────────────────────────────────────────────────────────

function _findBody(bodyId) {
  const TYPES = ['planet', 'moon', 'asteroid', 'comet', 'planetoid'];
  for (const t of TYPES) {
    const found = EntityManager.getByType(t).find(b => b.id === bodyId);
    if (found) return found;
  }
  return null;
}

function _getVesselName(vesselId) {
  return window.KOSMOS?.vesselManager?.getVessel(vesselId)?.name ?? 'Nieznany';
}

function _typeIcon(body) {
  if (!body) return '?';
  if (body.type === 'moon')      return '🌙';
  if (body.type === 'planetoid') return '🪨';
  return '🪐';
}

function _missionTypePL(type) {
  switch (type) {
    case 'mining':     return 'Wydobycie';
    case 'scientific': return 'Naukowa';
    case 'recon':      return 'Rozpoznanie';
    case 'colony':     return 'Kolonizacja';
    case 'transport':  return 'Transport';
    default:           return type;
  }
}

function _richStars(richness) {
  if (richness >= 0.7) return '★★★';
  if (richness >= 0.35) return '★★';
  return '★';
}

function _distFromHome(body) {
  try {
    return DistanceUtils.orbitalFromHomeAU(body).toFixed(2);
  } catch {
    return '?';
  }
}

function _gameYear() {
  return window.KOSMOS?.game?.yearLabel ?? '';
}

// ── Budowa HTML statystyk ciała (reużywalna) ────────────────────────────

function _buildBodyStats(body) {
  if (!body) return '<span class="at-stat-dim">Brak danych</span>';

  const lines = [];

  // Typ + temperatura + masa + orbita
  const tempC = body.temperatureC != null ? Math.round(body.temperatureC) : (body.temperatureK ? Math.round(body.temperatureK - 273) : null);
  const rawMass = body.physics?.mass;
  let massE = null;
  if (rawMass != null) {
    if (body.type === 'star') massE = (rawMass / 3e-6).toFixed(1);
    else if (rawMass < 0.01)  massE = rawMass.toFixed(4);
    else if (rawMass < 1)     massE = rawMass.toFixed(3);
    else                      massE = rawMass.toFixed(1);
  }
  const orbitAU = body.orbital?.a?.toFixed(2) ?? '?';

  lines.push(formatStatLine('TYP', `${_typeIcon(body)} ${body.planetType ?? body.type ?? '?'}`));
  if (tempC !== null)
    lines.push(formatStatLine('TEMP', `${tempC} °C`));
  if (massE !== null)
    lines.push(formatStatLine('MASA', `${massE} M⊕`));
  lines.push(formatStatLine('ORBITA', `${orbitAU} AU`));
  lines.push(formatStatLine('ODL', `${_distFromHome(body)} AU`));

  // Atmosfera
  if (body.atmosphere && typeof body.atmosphere === 'string' && body.atmosphere !== 'none') {
    const atmLabels = { dense: 'Gęsta', thin: 'Cienka', breathable: 'Oddychalna' };
    let atmLabel = atmLabels[body.atmosphere] || body.atmosphere;
    if (body.atmosphere === 'breathable' || body.breathableAtmosphere) atmLabel += ' ✅';
    lines.push(formatStatLine('ATM', atmLabel));
  } else if (body.atmosphere && typeof body.atmosphere === 'object') {
    const atmoEntries = Object.entries(body.atmosphere)
      .filter(([k]) => k !== 'pressure' && k !== 'total')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (atmoEntries.length > 0) {
      lines.push(formatSectionTitle('ATMOSFERA'));
      for (const [gas, pct] of atmoEntries) {
        lines.push(formatStatLine(gas, (pct * 100).toFixed(1) + '%'));
      }
    }
  } else {
    lines.push(formatStatLine('ATM', 'Brak'));
  }

  // Skład chemiczny — top 5
  if (body.composition && typeof body.composition === 'object') {
    const compEntries = Object.entries(body.composition)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (compEntries.length > 0) {
      lines.push(formatSectionTitle('SKŁAD'));
      for (const [elem, pct] of compEntries) {
        lines.push(formatStatLine(elem, pct.toFixed(1) + '%'));
      }
    }
  }

  // Złoża
  if (body.deposits && body.deposits.length > 0) {
    const summary = DepositSystem.getDepositsSummary(body.deposits);
    if (summary.length > 0) {
      lines.push(formatSectionTitle('ZŁOŻA'));
      for (const dep of summary) {
        lines.push(formatStatLine(
          `${dep.icon} ${dep.namePL}`,
          `${_richStars(dep.richness)} ${dep.remaining}`,
          'at-stat-pos'
        ));
      }
    }
  }

  return lines.join('');
}

// ── Tworzenie popupu ────────────────────────────────────────────────────

function _showNext() {
  if (_queue.length === 0) {
    _restoreTime();
    return;
  }

  const config = _queue.shift();

  // Przy pierwszym popupie — zapisz stan czasu i pauzuj
  if (_savedTimeState === null) {
    _savedTimeState = { ..._currentTimeState };
    EventBus.emit('time:pause');
  }

  // Buduj popup terminalowy
  const { overlay, dismiss, btnElements } = buildTerminalPopup({
    ...config,
    buttons: config.buttons ?? [{ label: '[ENTER] OK', primary: true }],
    onDismiss: () => {
      _active = null;
      _showNext();
    },
  });

  // Podłącz domyślne zachowanie przycisków do dismiss
  for (const btn of btnElements) {
    if (!btn._hasCustomClick) {
      btn.addEventListener('click', () => dismiss());
    }
  }

  // Klik na overlay = zamknij
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });

  // Keyboard
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
      e.preventDefault();
      document.removeEventListener('keydown', onKey, true);
      dismiss();
    }
  };
  document.addEventListener('keydown', onKey, true);

  document.body.appendChild(overlay);
  _active = overlay;

  // Focus na pierwszy przycisk
  requestAnimationFrame(() => { if (btnElements[0]) btnElements[0].focus(); });
}

function _restoreTime() {
  if (_savedTimeState === null) return;
  const saved = _savedTimeState;
  _savedTimeState = null;

  if (saved.isPaused) return;
  EventBus.emit('time:setMultiplier', { index: saved.multiplierIndex });
  EventBus.emit('time:play');
}

// ── Publiczne API ───────────────────────────────────────────────────────

export function queueMissionEvent(config) {
  _queue.push(config);
  if (!_active) _showNext();
}

// ── Handlery EventBus ───────────────────────────────────────────────────

function _onDisaster({ expedition: exp }) {
  const vesselName = exp.vesselId ? _getVesselName(exp.vesselId) : null;

  let stats = '';
  stats += formatStatLine('MISJA', _missionTypePL(exp.type));
  if (vesselName) stats += formatStatLine('STATEK', vesselName, 'at-stat-neg');
  stats += formatStatLine('CEL', exp.targetName ?? '?');
  stats += formatStatLineWithCursor('STATUS', 'UTRACONY', 'at-stat-neg');

  queueMissionEvent({
    severity: 'danger',
    barTitle: '⚠ ALARM KRYTYCZNY ⚠',
    barRight: _gameYear(),
    svgKey: 'disaster',
    svgLabel: 'STATEK<br>UTRACONY',
    prompt: '> ALERT_CORE.EXE_',
    headline: 'KATASTROFA',
    description: 'Statek utracony. Załoga zaginiona.',
    contentHTML: stats,
  });
}

function _onColonyFounded({ expedition: exp, planetId, startResources, startPop, resourceMult }) {
  const body = _findBody(planetId);
  const planetName = body?.name ?? planetId;

  let qualityText, qualityClass;
  if (resourceMult <= 0.5) {
    qualityText = 'Trudne warunki';
    qualityClass = 'at-stat-neg';
  } else if (resourceMult >= 1.5) {
    qualityText = 'Świetne warunki!';
    qualityClass = 'at-stat-pos';
  } else {
    qualityText = 'Normalne warunki';
    qualityClass = 'at-stat-gld';
  }

  let stats = '';
  stats += formatStatLine('PLANETA', planetName, 'at-stat-gld');
  stats += formatStatLine('JAKOŚĆ', `${qualityText} (×${resourceMult})`, qualityClass);
  stats += formatStatLine('POP', `${startPop}`, 'at-stat-pos');

  if (startResources) {
    const entries = Object.entries(startResources)
      .filter(([, v]) => v > 0)
      .map(([key, val]) => ({ label: key, value: `+${val}`, cssClass: 'at-stat-pos' }));
    if (entries.length > 0) {
      stats += formatSectionTitle('ZASOBY STARTOWE');
      stats += formatStatsGrid(entries);
    }
  }

  stats += formatStatLineWithCursor('STATUS', 'AKTYWNA', 'at-stat-pos');

  queueMissionEvent({
    severity: 'success',
    barTitle: '✓ KOLONIA ZAŁOŻONA',
    barRight: _gameYear(),
    svgKey: 'colony',
    svgLabel: 'KOLONIA<br>ZAŁOŻONA!',
    prompt: '> COLONY_INIT.EXE_',
    headline: `NOWA KOLONIA<br>${planetName.toUpperCase()}`,
    description: 'Historyczny moment — nowa kolonia założona pomyślnie.',
    contentHTML: stats,
  });
}

function _onMissionReport({ expedition: exp, gained, multiplier }) {
  const vesselName = exp.vesselId ? _getVesselName(exp.vesselId) : null;

  let multText, multClass;
  if (multiplier <= 0.5) {
    multText = 'Częściowy sukces';
    multClass = 'at-stat-neu';
  } else if (multiplier >= 1.5) {
    multText = 'Wybitny sukces!';
    multClass = 'at-stat-pos';
  } else {
    multText = 'Sukces';
    multClass = 'at-stat-gld';
  }

  const icon = exp.type === 'mining' ? 'deposit' : 'report';

  let stats = '';
  stats += formatStatLine('CEL', exp.targetName ?? '?');
  if (vesselName) stats += formatStatLine('STATEK', vesselName);
  stats += formatStatLine('WYNIK', `${multText} (×${multiplier})`, multClass);

  if (gained && Object.keys(gained).length > 0) {
    const entries = Object.entries(gained)
      .filter(([, v]) => v > 0)
      .map(([key, val]) => ({ label: key, value: `+${val}`, cssClass: 'at-stat-pos' }));
    if (entries.length > 0) {
      stats += formatSectionTitle('POZYSKANE ZASOBY');
      stats += formatStatsGrid(entries);
    }
  }

  stats += formatStatLineWithCursor('ORBITA', 'czeka na rozkazy', 'at-stat-dim');

  queueMissionEvent({
    severity: 'info',
    barTitle: 'KOSMOS OS  ▌ RAPORT',
    barRight: _gameYear(),
    svgKey: icon,
    svgLabel: exp.type === 'mining' ? 'WYDOBYCIE<br>ZAKOŃCZONE' : 'BADANIA<br>ZAKOŃCZONE',
    prompt: '> MISJA_RAPORT.LOG_',
    headline: `RAPORT<br>${_missionTypePL(exp.type).toUpperCase()}`,
    contentHTML: stats,
  });
}

function _onReconProgress({ expedition: exp, body, discovered }) {
  const bodyName = body?.name ?? '?';

  let stats = _buildBodyStats(body);
  stats += formatStatLineWithCursor('ODKRYTO', `${discovered} ciał`, 'at-stat-gld');

  queueMissionEvent({
    severity: 'discovery',
    barTitle: '★ ODKRYCIE ★',
    barRight: _gameYear(),
    svgKey: 'recon',
    svgLabel: 'CIAŁO<br>WYKRYTE',
    fanfareText: `★ ODKRYCIE ★ ${bodyName.toUpperCase()} ★ NOWE CIAŁO W KATALOGU ★ ODKRYCIE ★ ${bodyName.toUpperCase()} ★`,
    prompt: '> SCAN_COMPLETE.LOG_',
    headline: `${_typeIcon(body)} ${bodyName.toUpperCase()}`,
    contentHTML: stats,
  });
}

function _onReconComplete({ expedition: exp, scope, discovered }) {
  // full_system — podsumowanie
  if (scope === 'full_system') {
    const vesselName = exp.vesselId ? _getVesselName(exp.vesselId) : null;
    let stats = '';
    if (vesselName) stats += formatStatLine('STATEK', vesselName);
    stats += formatStatLine('ODKRYTO', `${discovered?.length ?? 0} ciał`, 'at-stat-pos');

    if (discovered && discovered.length > 0) {
      stats += formatSectionTitle('ZBADANE CIAŁA');
      for (const id of discovered) {
        const b = _findBody(id);
        if (b) {
          stats += formatStatLine(`${_typeIcon(b)} ${b.name}`, b.planetType ?? b.type ?? '', 'at-stat-dim');
        }
      }
    }

    stats += formatStatLineWithCursor('ORBITA', 'czeka na rozkazy', 'at-stat-dim');

    queueMissionEvent({
      severity: 'info',
      barTitle: 'KOSMOS OS  ▌ ROZPOZNANIE',
      barRight: _gameYear(),
      svgKey: 'recon',
      svgLabel: 'SKAN<br>UKOŃCZONY',
      prompt: '> RECON_DONE.EXE_',
      headline: 'ROZPOZNANIE<br>ZAKOŃCZONE',
      contentHTML: stats,
    });
    return;
  }

  // target / nearest — pojedyncze ciało
  if (discovered && discovered.length > 0) {
    const bodyId = discovered[0];
    const body = _findBody(bodyId);
    const bodyName = body?.name ?? bodyId;

    let stats = _buildBodyStats(body);
    stats += formatStatLineWithCursor('ORBITA', 'czeka na rozkazy', 'at-stat-dim');

    queueMissionEvent({
      severity: 'discovery',
      barTitle: '★ ODKRYCIE ★',
      barRight: _gameYear(),
      svgKey: 'recon',
      svgLabel: 'CIAŁO<br>WYKRYTE',
      fanfareText: `★ ODKRYCIE ★ ${bodyName.toUpperCase()} ★ NOWE CIAŁO W KATALOGU ★`,
      prompt: '> SCAN_COMPLETE.LOG_',
      headline: `${_typeIcon(body)} ${bodyName.toUpperCase()}`,
      contentHTML: stats,
    });
  }
}

// ── Śledzenie stanu czasu ───────────────────────────────────────────────

function _onTimeStateChanged({ isPaused, multiplierIndex }) {
  if (_savedTimeState === null) {
    _currentTimeState = { isPaused, multiplierIndex };
  }
}

// ── Inicjalizacja — podłączenie EventBus ────────────────────────────────

export function initMissionEvents() {
  EventBus.on('expedition:disaster',      _onDisaster);
  EventBus.on('expedition:colonyFounded',  _onColonyFounded);
  EventBus.on('expedition:missionReport',  _onMissionReport);
  EventBus.on('expedition:reconProgress',  _onReconProgress);
  EventBus.on('expedition:reconComplete',  _onReconComplete);
  EventBus.on('time:stateChanged',         _onTimeStateChanged);
}
