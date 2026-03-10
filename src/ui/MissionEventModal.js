// MissionEventModal — system popupów misji z pauzą i kolejką
//
// Każde ważne zdarzenie misji (dotarcie, katastrofa, odkrycie, kolonizacja)
// pauzuje grę, wyświetla popup z danymi, po OK przywraca prędkość.
// Kolejka: jeśli wiele zdarzeń naraz — jeden popup po drugim, czas wraca po ostatnim.

import EventBus      from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { DistanceUtils } from '../utils/DistanceUtils.js';
import { DepositSystem } from '../systems/DepositSystem.js';
import { THEME, hexToRgb } from '../config/ThemeConfig.js';

// ── Kolory severity (generowane z THEME) ─────────────────────────────────
function _sevBg(hex, alpha = 0.97) {
  const { r, g, b } = hexToRgb(hex);
  // Ciemne tło z lekkim odcieniem severity
  const base = hexToRgb(THEME.bgPrimary);
  return `rgba(${Math.round(base.r * 0.6 + r * 0.12)},${Math.round(base.g * 0.6 + g * 0.12)},${Math.round(base.b * 0.6 + b * 0.12)},${alpha})`;
}

function _getSeverityStyles() {
  return {
    danger:    { border: THEME.danger,  bg: _sevBg(THEME.danger) },
    success:   { border: THEME.success, bg: _sevBg(THEME.success) },
    info:      { border: THEME.info,    bg: _sevBg(THEME.info) },
    discovery: { border: THEME.mint,    bg: _sevBg(THEME.mint) },
  };
}

// ── CSS animacja (inject raz) ────────────────────────────────────────────
function _injectCSS() {
  // Usuwamy stary CSS i wstawiamy nowy (THEME może się zmienić)
  const existing = document.getElementById('mission-modal-css');
  if (existing) existing.remove();

  const style = document.createElement('style');
  style.id = 'mission-modal-css';
  style.textContent = `
    @keyframes missionFadeIn {
      from { transform: translateY(-20px); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
    }
    .mission-modal-overlay {
      position: fixed; inset: 0;
      background: rgba(2,4,5,0.75);
      z-index: 100;
      display: flex; align-items: center; justify-content: center;
    }
    .mission-modal-panel {
      max-width: 575px; width: 90%;
      border-radius: 6px;
      padding: 24px 28px;
      font-family: ${THEME.fontFamily};
      color: ${THEME.textPrimary};
      animation: missionFadeIn 0.35s ease-out;
      box-shadow: 0 0 30px rgba(2,4,5,0.88);
    }
    .mission-modal-panel .mm-header {
      font-size: ${THEME.fontSizeTitle + 2}px; font-weight: bold;
      margin-bottom: 14px;
      display: flex; align-items: center; gap: 8px;
    }
    .mission-modal-panel .mm-content {
      font-size: ${THEME.fontSizeLarge}px; line-height: 1.6;
      max-height: 55vh; overflow-y: auto;
      padding-right: 4px;
    }
    .mission-modal-panel .mm-content::-webkit-scrollbar { width: 4px; }
    .mission-modal-panel .mm-content::-webkit-scrollbar-thumb { background: ${THEME.borderLight}; border-radius: 2px; }
    .mission-modal-panel .mm-row {
      display: flex; justify-content: space-between;
      padding: 2px 0;
    }
    .mission-modal-panel .mm-row .mm-label { color: ${THEME.textSecondary}; }
    .mission-modal-panel .mm-row .mm-value { color: ${THEME.textPrimary}; text-align: right; }
    .mission-modal-panel .mm-section {
      margin-top: 10px; padding-top: 8px;
      border-top: 1px solid ${THEME.border};
    }
    .mission-modal-panel .mm-section-title {
      font-size: 11px; color: ${THEME.textHeader};
      text-transform: uppercase; letter-spacing: 1px;
      margin-bottom: 4px;
    }
    .mission-modal-panel .mm-highlight {
      color: ${THEME.accent}; font-weight: bold;
    }
    .mission-modal-panel .mm-danger { color: ${THEME.danger}; }
    .mission-modal-panel .mm-success { color: ${THEME.success}; }
    .mission-modal-panel .mm-warning { color: ${THEME.warning}; }
    .mission-modal-panel .mm-dim { color: ${THEME.textDim}; }
    .mission-modal-panel .mm-btn {
      display: block; margin: 16px auto 0;
      padding: 8px 32px;
      background: ${THEME.bgTertiary};
      border: 1px solid ${THEME.borderActive};
      border-radius: 4px;
      color: ${THEME.textPrimary}; font-family: ${THEME.fontFamily}; font-size: 14px;
      cursor: pointer; transition: background 0.15s;
    }
    .mission-modal-panel .mm-btn:hover { background: ${THEME.bgSecondary}; }
    .mission-modal-panel .mm-resources {
      display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px;
    }
  `;
  document.head.appendChild(style);
}

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

// Odległość od bazy (home planet) w AU
function _distFromHome(body) {
  try {
    return DistanceUtils.orbitalFromHomeAU(body).toFixed(2);
  } catch {
    return '?';
  }
}

// ── Budowa HTML z danymi ciała (reużywalna) ──────────────────────────────

function _buildBodyHTML(body) {
  if (!body) return '<span class="mm-dim">Brak danych</span>';

  const lines = [];

  // Typ + temperatura + masa + orbita
  const tempC = body.temperatureK ? Math.round(body.temperatureK - 273) : null;
  // Planety/księżyce/planetoidy mają masę w M⊕, gwiazdy w M☉
  const rawMass = body.physics?.mass;
  let massE = null;
  if (rawMass != null) {
    if (body.type === 'star') massE = (rawMass / 3e-6).toFixed(1);
    else if (rawMass < 0.01)  massE = rawMass.toFixed(4);
    else if (rawMass < 1)     massE = rawMass.toFixed(3);
    else                      massE = rawMass.toFixed(1);
  }
  const orbitAU = body.orbital?.a?.toFixed(2) ?? '?';

  lines.push('<div class="mm-row"><span class="mm-label">Typ</span><span class="mm-value">' +
    _typeIcon(body) + ' ' + (body.planetType ?? body.type ?? '?') + '</span></div>');
  if (tempC !== null)
    lines.push('<div class="mm-row"><span class="mm-label">Temperatura</span><span class="mm-value">' +
      tempC + ' °C</span></div>');
  if (massE !== null)
    lines.push('<div class="mm-row"><span class="mm-label">Masa</span><span class="mm-value">' +
      massE + ' M⊕</span></div>');
  lines.push('<div class="mm-row"><span class="mm-label">Orbita</span><span class="mm-value">' +
    orbitAU + ' AU</span></div>');
  lines.push('<div class="mm-row"><span class="mm-label">Odl. od bazy</span><span class="mm-value">' +
    _distFromHome(body) + ' AU</span></div>');

  // Atmosfera — string (thin/dense/none) lub obiekt (stary format)
  if (body.atmosphere && typeof body.atmosphere === 'string' && body.atmosphere !== 'none') {
    const atmLabels = { dense: 'Gęsta', thin: 'Cienka' };
    let atmLabel = atmLabels[body.atmosphere] || body.atmosphere;
    if (body.breathableAtmosphere) atmLabel += ' — zdatna do życia ✅';
    lines.push('<div class="mm-row"><span class="mm-label">Atmosfera</span><span class="mm-value">' + atmLabel + '</span></div>');
  } else if (body.atmosphere && typeof body.atmosphere === 'object') {
    const atmoEntries = Object.entries(body.atmosphere)
      .filter(([k]) => k !== 'pressure' && k !== 'total')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (atmoEntries.length > 0) {
      lines.push('<div class="mm-section"><div class="mm-section-title">Atmosfera</div>');
      for (const [gas, pct] of atmoEntries) {
        lines.push('<div class="mm-row"><span class="mm-label">' + gas +
          '</span><span class="mm-value">' + (pct * 100).toFixed(1) + '%</span></div>');
      }
      lines.push('</div>');
    }
  } else {
    lines.push('<div class="mm-row"><span class="mm-label">Atmosfera</span><span class="mm-value">Brak</span></div>');
  }

  // Skład chemiczny — top 5
  if (body.composition && typeof body.composition === 'object') {
    const compEntries = Object.entries(body.composition)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (compEntries.length > 0) {
      lines.push('<div class="mm-section"><div class="mm-section-title">Skład chemiczny</div>');
      for (const [elem, pct] of compEntries) {
        // composition jest w % (0-100), nie trzeba mnożyć
        lines.push('<div class="mm-row"><span class="mm-label">' + elem +
          '</span><span class="mm-value">' + pct.toFixed(1) + '%</span></div>');
      }
      lines.push('</div>');
    }
  }

  // Złoża
  if (body.deposits && body.deposits.length > 0) {
    const summary = DepositSystem.getDepositsSummary(body.deposits);
    if (summary.length > 0) {
      lines.push('<div class="mm-section"><div class="mm-section-title">Złoża</div>');
      for (const dep of summary) {
        lines.push('<div class="mm-row"><span class="mm-label">' +
          dep.icon + ' ' + dep.namePL +
          '</span><span class="mm-value">' +
          _richStars(dep.richness) + ' ' + dep.remaining +
          '</span></div>');
      }
      lines.push('</div>');
    }
  }

  return lines.join('');
}

// ── Tworzenie popupu ─────────────────────────────────────────────────────

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

  _injectCSS();

  const sevStyles = _getSeverityStyles();
  const sev = sevStyles[config.severity] ?? sevStyles.info;

  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'mission-modal-overlay';

  // Panel
  const panel = document.createElement('div');
  panel.className = 'mission-modal-panel';
  panel.style.background = sev.bg;
  panel.style.border = '1px solid ' + sev.border;

  // Header
  const header = document.createElement('div');
  header.className = 'mm-header';
  header.style.color = sev.border;
  header.innerHTML = (config.icon ?? '') + ' ' + (config.title ?? 'Raport');
  panel.appendChild(header);

  // Content
  const content = document.createElement('div');
  content.className = 'mm-content';
  content.innerHTML = config.html ?? '';
  panel.appendChild(content);

  // OK button
  const btn = document.createElement('button');
  btn.className = 'mm-btn';
  btn.textContent = 'OK';
  btn.style.borderColor = sev.border;
  panel.appendChild(btn);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  _active = overlay;

  // Zamknięcie
  const dismiss = () => {
    if (_active !== overlay) return;
    document.removeEventListener('keydown', onKey, true);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    _active = null;
    _showNext();
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();  // nie propaguj do canvas/window
    dismiss();
  });
  overlay.addEventListener('click', (e) => {
    e.stopPropagation();  // nie propaguj do canvas/window
    if (e.target === overlay) dismiss();
  });

  const onKey = (e) => {
    // Blokuj propagację do gry (Space, 1-5, etc.)
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
      e.preventDefault();
      dismiss();
    }
  };
  document.addEventListener('keydown', onKey, true);

  // Focus na przycisk
  requestAnimationFrame(() => btn.focus());
}

function _restoreTime() {
  if (_savedTimeState === null) return;
  const saved = _savedTimeState;
  _savedTimeState = null;

  if (saved.isPaused) {
    // Gra była zapauzowana — zostaje zapauzowana
    return;
  }
  // Przywróć poprzedni multiplier i odpauzuj
  EventBus.emit('time:setMultiplier', { index: saved.multiplierIndex });
  EventBus.emit('time:play');
}

// ── Publiczne API — dodaj popup do kolejki ───────────────────────────────

function queueMissionEvent(config) {
  _queue.push(config);
  if (!_active) _showNext();
}

// ── Handlery EventBus ────────────────────────────────────────────────────

function _onDisaster({ expedition: exp }) {
  const vesselName = exp.vesselId ? _getVesselName(exp.vesselId) : null;
  const html = `
    <div class="mm-row"><span class="mm-label">Misja</span><span class="mm-value">${_missionTypePL(exp.type)}</span></div>
    ${vesselName ? `<div class="mm-row"><span class="mm-label">Statek</span><span class="mm-value">${vesselName}</span></div>` : ''}
    <div class="mm-row"><span class="mm-label">Cel</span><span class="mm-value">${exp.targetName ?? '?'}</span></div>
    <div class="mm-section" style="text-align:center; padding: 12px 0;">
      <span class="mm-danger" style="font-size:13px;">Statek utracony. Załoga zaginiona.</span>
    </div>
  `;
  queueMissionEvent({
    severity: 'danger',
    icon: '💥',
    title: 'Katastrofa',
    html,
  });
}

function _onColonyFounded({ expedition: exp, planetId, startResources, startPop, resourceMult }) {
  const body = _findBody(planetId);
  const planetName = body?.name ?? planetId;

  let qualityText, qualityClass;
  if (resourceMult <= 0.5) {
    qualityText = 'Trudne warunki';
    qualityClass = 'mm-warning';
  } else if (resourceMult >= 1.5) {
    qualityText = 'Świetne warunki!';
    qualityClass = 'mm-success';
  } else {
    qualityText = 'Normalne warunki';
    qualityClass = 'mm-highlight';
  }

  let resHtml = '';
  if (startResources) {
    resHtml = '<div class="mm-section"><div class="mm-section-title">Zasoby startowe</div><div class="mm-resources">';
    for (const [key, val] of Object.entries(startResources)) {
      if (val > 0) {
        resHtml += `<div class="mm-row"><span class="mm-label">${key}</span><span class="mm-value">${val}</span></div>`;
      }
    }
    resHtml += '</div></div>';
  }

  const html = `
    <div class="mm-row"><span class="mm-label">Planeta</span><span class="mm-value mm-highlight">${planetName}</span></div>
    <div class="mm-row"><span class="mm-label">Jakość startu</span><span class="mm-value ${qualityClass}">${qualityText} (×${resourceMult})</span></div>
    <div class="mm-row"><span class="mm-label">Populacja</span><span class="mm-value">${startPop} POP</span></div>
    ${resHtml}
  `;
  queueMissionEvent({
    severity: 'success',
    icon: '🏗',
    title: 'Kolonia założona',
    html,
  });
}

function _onMissionReport({ expedition: exp, gained, multiplier }) {
  const vesselName = exp.vesselId ? _getVesselName(exp.vesselId) : null;

  let multText, multClass;
  if (multiplier <= 0.5) {
    multText = 'Częściowy sukces';
    multClass = 'mm-warning';
  } else if (multiplier >= 1.5) {
    multText = 'Wybitny sukces!';
    multClass = 'mm-success';
  } else {
    multText = 'Sukces';
    multClass = 'mm-highlight';
  }

  const icon = exp.type === 'mining' ? '⛏' : '🔬';

  let resHtml = '';
  if (gained && Object.keys(gained).length > 0) {
    resHtml = '<div class="mm-section"><div class="mm-section-title">Pozyskane zasoby</div><div class="mm-resources">';
    for (const [key, val] of Object.entries(gained)) {
      if (val > 0) {
        resHtml += `<div class="mm-row"><span class="mm-label">${key}</span><span class="mm-value">+${val}</span></div>`;
      }
    }
    resHtml += '</div></div>';
  }

  const html = `
    <div class="mm-row"><span class="mm-label">Cel</span><span class="mm-value">${exp.targetName ?? '?'}</span></div>
    ${vesselName ? `<div class="mm-row"><span class="mm-label">Statek</span><span class="mm-value">${vesselName}</span></div>` : ''}
    <div class="mm-row"><span class="mm-label">Wynik</span><span class="mm-value ${multClass}">${multText} (×${multiplier})</span></div>
    ${resHtml}
    <div class="mm-section" style="text-align:center;">
      <span class="mm-dim">Statek na orbicie — czeka na rozkazy</span>
    </div>
  `;
  queueMissionEvent({
    severity: 'info',
    icon,
    title: 'Raport z misji — ' + _missionTypePL(exp.type),
    html,
  });
}

function _onReconProgress({ expedition: exp, body, discovered }) {
  const bodyName = body?.name ?? '?';
  const html = `
    <div class="mm-row"><span class="mm-label">Ciało</span><span class="mm-value mm-highlight">${_typeIcon(body)} ${bodyName}</span></div>
    ${_buildBodyHTML(body)}
    <div class="mm-section" style="text-align:center;">
      <span class="mm-dim">Odkryto ${discovered} ciał dotychczas</span>
    </div>
  `;
  queueMissionEvent({
    severity: 'discovery',
    icon: '🔭',
    title: 'Ciało odkryte',
    html,
  });
}

function _onReconComplete({ expedition: exp, scope, discovered }) {
  // full_system — podsumowanie
  if (scope === 'full_system') {
    const vesselName = exp.vesselId ? _getVesselName(exp.vesselId) : null;
    let listHtml = '';
    if (discovered && discovered.length > 0) {
      listHtml = '<div class="mm-section"><div class="mm-section-title">Odkryte ciała</div>';
      for (const id of discovered) {
        const b = _findBody(id);
        if (b) {
          listHtml += `<div class="mm-row"><span class="mm-label">${_typeIcon(b)} ${b.name}</span><span class="mm-value mm-dim">${b.planetType ?? b.type ?? ''}</span></div>`;
        }
      }
      listHtml += '</div>';
    }
    const html = `
      ${vesselName ? `<div class="mm-row"><span class="mm-label">Statek</span><span class="mm-value">${vesselName}</span></div>` : ''}
      <div style="text-align:center; margin: 8px 0;">
        <span class="mm-highlight">Rozpoznanie ukończone — odkryto ${discovered?.length ?? 0} ciał</span>
      </div>
      ${listHtml}
      <div class="mm-section" style="text-align:center;">
        <span class="mm-dim">Statek na orbicie — czeka na rozkazy</span>
      </div>
    `;
    queueMissionEvent({
      severity: 'info',
      icon: '🔭',
      title: 'Rozpoznanie zakończone',
      html,
    });
    return;
  }

  // target / nearest — pojedyncze ciało
  if (discovered && discovered.length > 0) {
    const bodyId = discovered[0];
    const body = _findBody(bodyId);
    const bodyName = body?.name ?? bodyId;
    const html = `
      <div class="mm-row"><span class="mm-label">Ciało</span><span class="mm-value mm-highlight">${_typeIcon(body)} ${bodyName}</span></div>
      ${_buildBodyHTML(body)}
      <div class="mm-section" style="text-align:center;">
        <span class="mm-dim">Statek na orbicie — czeka na rozkazy</span>
      </div>
    `;
    queueMissionEvent({
      severity: 'discovery',
      icon: '🔭',
      title: 'Ciało odkryte',
      html,
    });
  }
}

// ── Śledzenie stanu czasu ────────────────────────────────────────────────

function _onTimeStateChanged({ isPaused, multiplierIndex }) {
  // Aktualizuj TYLKO gdy nie mamy zapisanego stanu (popup nie jest aktywny)
  if (_savedTimeState === null) {
    _currentTimeState = { isPaused, multiplierIndex };
  }
}

// ── Inicjalizacja — podłączenie EventBus ─────────────────────────────────

export function initMissionEvents() {
  EventBus.on('expedition:disaster',      _onDisaster);
  EventBus.on('expedition:colonyFounded',  _onColonyFounded);
  EventBus.on('expedition:missionReport',  _onMissionReport);
  EventBus.on('expedition:reconProgress',  _onReconProgress);
  EventBus.on('expedition:reconComplete',  _onReconComplete);
  EventBus.on('time:stateChanged',         _onTimeStateChanged);
}
