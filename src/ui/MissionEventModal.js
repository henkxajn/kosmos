// MissionEventModal — system popupów misji z pauzą i kolejką
//
// Każde ważne zdarzenie misji (dotarcie, katastrofa, odkrycie, kolonizacja)
// pauzuje grę, wyświetla popup z danymi, po OK przywraca prędkość.
// Kolejka: jeśli wiele zdarzeń naraz — jeden popup po drugim, czas wraca po ostatnim.
// Styl: Amber Terminal (2-kolumnowy layout, CRT wewnątrz panelu).

import EventBus      from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { DistanceUtils } from '../utils/DistanceUtils.js';
import { TECH_BRANCHES } from '../data/TechData.js';
import { DepositSystem } from '../systems/DepositSystem.js';
import { THEME }     from '../config/ThemeConfig.js';
import { t, getName, getLocale } from '../i18n/i18n.js';
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
  return window.KOSMOS?.vesselManager?.getVessel(vesselId)?.name ?? t('vessel.unknown');
}

function _typeIcon(body) {
  if (!body) return '?';
  if (body.type === 'moon')      return '🌙';
  if (body.type === 'planetoid') return '🪨';
  return '🪐';
}

function _missionTypeLabel(type) {
  switch (type) {
    case 'mining':     return t('mission.mining');
    // (scientific usunięty)
    case 'recon':      return t('mission.recon');
    case 'colony':     return t('mission.colonization');
    case 'transport':  return t('mission.transport');
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
  if (!body) return `<span class="at-stat-dim">${t('missionPopup.noData')}</span>`;

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

  lines.push(formatStatLine(t('missionPopup.type'), `${_typeIcon(body)} ${body.planetType ?? body.type ?? '?'}`));
  if (tempC !== null)
    lines.push(formatStatLine(t('missionPopup.temp'), `${tempC} °C`));
  if (massE !== null)
    lines.push(formatStatLine(t('missionPopup.mass'), `${massE} M⊕`));
  lines.push(formatStatLine(t('missionPopup.orbit'), `${orbitAU} AU`));
  lines.push(formatStatLine(t('missionPopup.dist'), `${_distFromHome(body)} AU`));

  // Atmosfera
  if (body.atmosphere && typeof body.atmosphere === 'string' && body.atmosphere !== 'none') {
    const atmLabel = t(`atmosphere.${body.atmosphere}`) || body.atmosphere;
    const atmSuffix = (body.atmosphere === 'breathable' || body.breathableAtmosphere) ? ' ✅' : '';
    lines.push(formatStatLine(t('missionPopup.atm'), atmLabel + atmSuffix));
  } else if (body.atmosphere && typeof body.atmosphere === 'object') {
    const atmoEntries = Object.entries(body.atmosphere)
      .filter(([k]) => k !== 'pressure' && k !== 'total')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (atmoEntries.length > 0) {
      lines.push(formatSectionTitle(t('missionPopup.atmosphereSection')));
      for (const [gas, pct] of atmoEntries) {
        lines.push(formatStatLine(gas, (pct * 100).toFixed(1) + '%'));
      }
    }
  } else {
    lines.push(formatStatLine(t('missionPopup.atm'), t('atmosphere.none')));
  }

  // Skład chemiczny — top 5
  if (body.composition && typeof body.composition === 'object') {
    const compEntries = Object.entries(body.composition)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (compEntries.length > 0) {
      lines.push(formatSectionTitle(t('ui.compositionHeader')));
      for (const [elem, pct] of compEntries) {
        lines.push(formatStatLine(elem, pct.toFixed(1) + '%'));
      }
    }
  }

  // Złoża
  if (body.deposits && body.deposits.length > 0) {
    const summary = DepositSystem.getDepositsSummary(body.deposits);
    if (summary.length > 0) {
      lines.push(formatSectionTitle(t('ui.depositsHeader')));
      for (const dep of summary) {
        lines.push(formatStatLine(
          `${dep.icon} ${getName({ id: dep.resourceId, namePL: dep.namePL }, 'resource')}`,
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

function _onDisaster({ expedition: exp, survived }) {
  const vesselName = exp.vesselId ? _getVesselName(exp.vesselId) : null;

  if (survived) {
    // Statek przeżył dzięki emergency_protocols / force_fields
    let stats = '';
    stats += formatStatLine(t('missionPopup.mission'), _missionTypeLabel(exp.type));
    if (vesselName) stats += formatStatLine(t('missionPopup.vessel'), vesselName, 'at-stat-neu');
    stats += formatStatLine(t('missionPopup.target'), exp.targetName ?? '?');
    stats += formatStatLineWithCursor(t('missionPopup.status'), t('missionPopup.damaged') ?? 'DAMAGED', 'at-stat-neu');

    queueMissionEvent({
      severity: 'warning',
      barTitle: t('missionPopup.emergencyProtocol') ?? 'EMERGENCY',
      barRight: _gameYear(),
      svgKey: 'disaster',
      svgLabel: (t('missionPopup.vesselDamaged') ?? 'VESSEL\nDAMAGED').replace(/\n/g, '<br>'),
      prompt: '> EMERGENCY_PROTOCOL.EXE_',
      headline: t('missionPopup.survived') ?? 'VESSEL SURVIVED',
      description: t('missionPopup.survivedDesc') ?? 'Emergency protocols activated. Vessel damaged but crew safe.',
      contentHTML: stats,
    });
    return;
  }

  const vesselName2 = exp.vesselId ? _getVesselName(exp.vesselId) : null;

  let stats = '';
  stats += formatStatLine(t('missionPopup.mission'), _missionTypeLabel(exp.type));
  if (vesselName2) stats += formatStatLine(t('missionPopup.vessel'), vesselName2, 'at-stat-neg');
  stats += formatStatLine(t('missionPopup.target'), exp.targetName ?? '?');
  stats += formatStatLineWithCursor(t('missionPopup.status'), t('missionPopup.lost'), 'at-stat-neg');

  queueMissionEvent({
    severity: 'danger',
    barTitle: t('missionPopup.criticalAlarm'),
    barRight: _gameYear(),
    svgKey: 'disaster',
    svgLabel: t('missionPopup.vesselLost').replace(/\n/g, '<br>'),
    prompt: '> ALERT_CORE.EXE_',
    headline: t('missionPopup.disaster'),
    description: t('missionPopup.disasterDesc'),
    contentHTML: stats,
  });
}

function _onColonyFounded({ expedition: exp, planetId, startResources, startPop, resourceMult }) {
  const body = _findBody(planetId);
  const planetName = body?.name ?? planetId;

  let qualityText, qualityClass;
  if (resourceMult <= 0.5) {
    qualityText = t('missionPopup.harsh');
    qualityClass = 'at-stat-neg';
  } else if (resourceMult >= 1.5) {
    qualityText = t('missionPopup.excellent');
    qualityClass = 'at-stat-pos';
  } else {
    qualityText = t('missionPopup.normal');
    qualityClass = 'at-stat-gld';
  }

  let stats = '';
  stats += formatStatLine(t('missionPopup.planet'), planetName, 'at-stat-gld');
  stats += formatStatLine(t('missionPopup.quality'), `${qualityText} (×${resourceMult})`, qualityClass);
  stats += formatStatLine(t('missionPopup.pop'), `${startPop}`, 'at-stat-pos');

  if (startResources) {
    const entries = Object.entries(startResources)
      .filter(([, v]) => v > 0)
      .map(([key, val]) => ({ label: key, value: `+${val}`, cssClass: 'at-stat-pos' }));
    if (entries.length > 0) {
      stats += formatSectionTitle(t('missionPopup.startResources'));
      stats += formatStatsGrid(entries);
    }
  }

  stats += formatStatLineWithCursor(t('missionPopup.status'), t('missionPopup.active'), 'at-stat-pos');

  queueMissionEvent({
    severity: 'success',
    barTitle: t('missionPopup.colonyFounded'),
    barRight: _gameYear(),
    svgKey: 'colony',
    svgLabel: t('missionPopup.colonyFoundedLabel').replace(/\n/g, '<br>'),
    prompt: '> COLONY_INIT.EXE_',
    headline: t('missionPopup.newColony', planetName.toUpperCase()).replace(/\n/g, '<br>'),
    description: t('missionPopup.colonyFoundedDesc'),
    contentHTML: stats,
  });
}

function _onMissionReport({ expedition: exp, gained, multiplier }) {
  const vesselName = exp.vesselId ? _getVesselName(exp.vesselId) : null;

  let multText, multClass;
  if (multiplier <= 0.5) {
    multText = t('missionPopup.partialSuccess');
    multClass = 'at-stat-neu';
  } else if (multiplier >= 1.5) {
    multText = t('missionPopup.outstandingSuccess');
    multClass = 'at-stat-pos';
  } else {
    multText = t('missionPopup.success');
    multClass = 'at-stat-gld';
  }

  const icon = exp.type === 'mining' ? 'deposit' : 'report';

  let stats = '';
  stats += formatStatLine(t('missionPopup.target'), exp.targetName ?? '?');
  if (vesselName) stats += formatStatLine(t('missionPopup.vessel'), vesselName);
  stats += formatStatLine(t('missionPopup.result'), `${multText} (×${multiplier})`, multClass);

  if (gained && Object.keys(gained).length > 0) {
    const entries = Object.entries(gained)
      .filter(([, v]) => v > 0)
      .map(([key, val]) => ({ label: key, value: `+${val}`, cssClass: 'at-stat-pos' }));
    if (entries.length > 0) {
      stats += formatSectionTitle(t('missionPopup.acquiredResources'));
      stats += formatStatsGrid(entries);
    }
  }

  stats += formatStatLineWithCursor(t('missionPopup.orbit'), t('missionPopup.awaitingOrders'), 'at-stat-dim');

  queueMissionEvent({
    severity: 'info',
    barTitle: t('missionPopup.reportBar'),
    barRight: _gameYear(),
    svgKey: icon,
    svgLabel: (exp.type === 'mining' ? t('missionPopup.miningComplete') : t('missionPopup.researchComplete')).replace(/\n/g, '<br>'),
    prompt: `> ${t('missionPopup.reportPrompt')}`,
    headline: t('missionPopup.reportHeadline', _missionTypeLabel(exp.type).toUpperCase()).replace(/\n/g, '<br>'),
    contentHTML: stats,
  });
}

function _onReconProgress({ expedition: exp, body, discovered }) {
  const bodyName = body?.name ?? '?';

  let stats = _buildBodyStats(body);
  stats += formatStatLineWithCursor(t('missionPopup.discovered'), `${discovered?.length ?? 0} ${t('missionPopup.bodies')}`, 'at-stat-gld');

  queueMissionEvent({
    severity: 'discovery',
    barTitle: t('missionPopup.discoveryBar'),
    barRight: _gameYear(),
    svgKey: 'recon',
    svgLabel: t('missionPopup.bodyDetected').replace(/\n/g, '<br>'),
    fanfareText: t('missionPopup.discoveryFanfare', bodyName.toUpperCase(), bodyName.toUpperCase()),
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
    if (vesselName) stats += formatStatLine(t('missionPopup.vessel'), vesselName);
    stats += formatStatLine(t('missionPopup.discovered'), `${discovered?.length ?? 0} ${t('missionPopup.bodies')}`, 'at-stat-pos');

    if (discovered && discovered.length > 0) {
      stats += formatSectionTitle(t('missionPopup.exploredBodies'));
      for (const id of discovered) {
        const b = _findBody(id);
        if (b) {
          stats += formatStatLine(`${_typeIcon(b)} ${b.name}`, b.planetType ?? b.type ?? '', 'at-stat-dim');
        }
      }
    }

    stats += formatStatLineWithCursor(t('missionPopup.orbit'), t('missionPopup.awaitingOrders'), 'at-stat-dim');

    queueMissionEvent({
      severity: 'info',
      barTitle: t('missionPopup.reconBar'),
      barRight: _gameYear(),
      svgKey: 'recon',
      svgLabel: t('missionPopup.scanComplete').replace(/\n/g, '<br>'),
      prompt: '> RECON_DONE.EXE_',
      headline: t('missionPopup.reconComplete').replace(/\n/g, '<br>'),
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
    stats += formatStatLineWithCursor(t('missionPopup.orbit'), t('missionPopup.awaitingOrders'), 'at-stat-dim');

    queueMissionEvent({
      severity: 'discovery',
      barTitle: t('missionPopup.discoveryBar'),
      barRight: _gameYear(),
      svgKey: 'recon',
      svgLabel: t('missionPopup.bodyDetected').replace(/\n/g, '<br>'),
      fanfareText: t('missionPopup.discoveryFanfareShort', bodyName.toUpperCase()),
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

// ── Handler odkrycia naukowego ────────────────────────────────────────

function _onDiscoveryFound({ discovery, expedition, bodyId }) {
  const disc = discovery;
  const body = _findBody(bodyId);
  const bodyName = body?.name ?? bodyId ?? '?';
  const vesselName = expedition?.vesselId ? _getVesselName(expedition.vesselId) : null;

  // Nazwa i opis odkrycia wg locale
  const isEN = getLocale() === 'en';
  const discName = isEN ? disc.nameEN : disc.namePL;
  const discDesc = isEN ? disc.descriptionEN : disc.descriptionPL;

  let stats = '';
  stats += formatStatLine(t('missionPopup.target'), `${_typeIcon(body)} ${bodyName}`);
  if (vesselName) stats += formatStatLine(t('missionPopup.vessel'), vesselName);

  // Efekty odkrycia
  const eff = disc.effects;
  if (eff.research) stats += formatStatLine('Research', `+${eff.research}`, 'at-stat-pos');
  if (eff.prosperity) stats += formatStatLine('Prosperity', `+${eff.prosperity}`, 'at-stat-pos');
  if (eff.unlockTech && eff.unlockTech.length > 0) {
    stats += formatSectionTitle(t('discovery.unlockedTech'));
    for (const techId of eff.unlockTech) {
      stats += formatStatLine('🔓', techId, 'at-stat-gld');
    }
  }
  if (eff.deposit) {
    stats += formatStatLine(t('missionPopup.deposit') ?? 'Deposit', `${eff.deposit} ★`, 'at-stat-pos');
  }
  if (eff.milestone) {
    stats += formatStatLineWithCursor('🏆', t('discovery.milestone'), 'at-stat-gld');
  }

  queueMissionEvent({
    severity: 'discovery',
    barTitle: t('discovery.found'),
    barRight: _gameYear(),
    svgKey: 'recon',
    svgLabel: t('discovery.scientificBreakthrough').replace(/\n/g, '<br>'),
    fanfareText: `✦ ${discName.toUpperCase()} ✦`,
    prompt: '> DISCOVERY.LOG_',
    headline: discName,
    description: discDesc,
    contentHTML: stats,
  });
}

// ── Handler ukończenia badań technologicznych ────────────────────────────

function _onTechResearched({ tech, restored }) {
  if (restored) return;  // nie pokazuj popupu przy wczytywaniu zapisu

  const isEN = getLocale() === 'en';
  const techName = isEN
    ? (t(`tech.${tech.id}.name`) || tech.namePL)
    : (tech.namePL || t(`tech.${tech.id}.name`));
  const techDesc = isEN
    ? (t(`tech.${tech.id}.desc`) || tech.description)
    : (tech.description || t(`tech.${tech.id}.desc`));
  const branch = TECH_BRANCHES[tech.branch];
  const branchName = isEN
    ? (t(`techBranch.${tech.branch}`) || branch?.namePL || tech.branch)
    : (branch?.namePL || tech.branch);
  const branchIcon = branch?.icon ?? '🔬';

  let stats = '';
  stats += formatStatLine(t('techPopup.branch'), `${branchIcon} ${branchName}`);
  stats += formatStatLine(t('techPopup.tier'), `${tech.tier}`);

  // Lista efektów technologii
  const effs = tech.effects || [];
  if (effs.length > 0) {
    stats += formatSectionTitle(t('techPopup.effects'));
    for (const eff of effs) {
      const line = _formatTechEffect(eff, isEN);
      if (line) stats += formatStatLine(line.icon, line.text, 'at-stat-pos');
    }
  }

  queueMissionEvent({
    severity:    'success',
    barTitle:    t('techPopup.barTitle'),
    barRight:    _gameYear(),
    svgKey:      'discovery',
    svgLabel:    t('techPopup.svgLabel').replace(/\n/g, '<br>'),
    fanfareText: `✦ ${techName.toUpperCase()} ✦`,
    prompt:      '> RESEARCH_COMPLETE.LOG_',
    headline:    techName,
    description: techDesc,
    contentHTML:  stats,
  });
}

/** Formatuje pojedynczy efekt technologii na czytelny tekst */
function _formatTechEffect(eff, isEN) {
  switch (eff.type) {
    case 'unlockBuilding':
      return { icon: '🔓', text: t(`building.${eff.buildingId}.name`) || eff.buildingId };
    case 'unlockShip':
      return { icon: '🚀', text: t(`ship.${eff.shipId}.name`) || eff.shipId };
    case 'unlockCommodity':
      return { icon: '📦', text: t(`commodity.${eff.commodityId}.name`) || eff.commodityId };
    case 'unlockFeature':
      return { icon: '✨', text: t(`feature.${eff.feature}`) || eff.feature };
    case 'modifier':
      return { icon: '📈', text: `${t(`resource.${eff.resource}`) || eff.resource} ×${eff.multiplier}` };
    case 'prosperityBonus':
      return { icon: '😊', text: `${isEN ? 'Prosperity' : 'Dobrobyt'} +${eff.amount}` };
    case 'shipSpeedMultiplier':
      return { icon: '⚡', text: `${isEN ? 'Ship speed' : 'Prędkość statków'} ×${eff.multiplier}` };
    case 'disasterReduction':
      return { icon: '🛡', text: `${isEN ? 'Disaster risk' : 'Ryzyko katastrof'} -${eff.amount}%` };
    case 'buildTimeMultiplier':
      return { icon: '🏗', text: `${isEN ? 'Build time' : 'Czas budowy'} ×${eff.multiplier}` };
    case 'terrainUnlock':
      return { icon: '🗺', text: `${isEN ? 'Terrain' : 'Teren'}: ${eff.terrain} → ${eff.categories.join(', ')}` };
    case 'consumptionMultiplier':
      return { icon: '📉', text: `${t(`resource.${eff.resource}`) || eff.resource} ${isEN ? 'consumption' : 'zużycie'} ×${eff.multiplier}` };
    case 'popGrowthBonus':
      return { icon: '👶', text: `${isEN ? 'Pop growth' : 'Wzrost populacji'} ×${eff.multiplier}` };
    case 'buildingLevelCap':
      return { icon: '🔝', text: `${isEN ? 'Max building level' : 'Maks. poziom budynku'}: ${eff.maxLevel}` };
    case 'factorySpeedMultiplier':
      return { icon: '⚙', text: `${isEN ? 'Factory speed' : 'Prędkość fabryki'} ×${eff.multiplier}` };
    default:
      return null;
  }
}

// ── Popup: przylot międzygwiezdny ────────────────────────────────────────

function _onInterstellarArrived({ vessel, systemId, star, targetName }) {
  const vesselName = vessel?.name ?? t('vessel.unknown');
  const sysName = targetName ?? systemId;

  // Zbierz statystyki nowego układu
  const planets = EntityManager.getByType('planet').filter(p => p.systemId === systemId);
  const moons   = EntityManager.getByType('moon').filter(m => m.systemId === systemId);

  let stats = '';
  stats += formatStatLine(t('missionPopup.vessel'), vesselName, 'at-stat-neu');
  stats += formatStatLine(t('galaxy.starType') ?? t('galaxy.status'), star?.spectralType ?? '?');
  stats += formatStatLine(t('missionPopup.interstellarPlanets') ?? 'Planets', `${planets.length}`);
  stats += formatStatLine(t('missionPopup.interstellarMoons') ?? 'Moons', `${moons.length}`);

  // Planety w strefie zamieszkiwalnej
  const hzPlanets = planets.filter(p => {
    if (!star) return false;
    const hz = Math.sqrt(star.luminosity ?? 1);
    const d = p.orbital?.a ?? 0;
    return d >= hz * 0.7 && d <= hz * 1.5;
  });
  if (hzPlanets.length > 0) {
    stats += formatStatLine(t('missionPopup.interstellarHZ') ?? 'In HZ', `${hzPlanets.length}`, 'at-stat-pos');
  }

  queueMissionEvent({
    severity: 'success',
    barTitle: t('missionPopup.interstellarArrival') ?? 'INTERSTELLAR ARRIVAL',
    barRight: _gameYear(),
    svgKey: 'colony',
    svgLabel: (t('missionPopup.newSystem') ?? 'NEW\nSYSTEM').replace(/\n/g, '<br>'),
    prompt: '> WARP_EXIT.EXE_',
    headline: `${t('vessel.interstellarArrived', sysName)}`,
    description: t('missionPopup.interstellarDesc', vesselName, sysName) ?? `${vesselName} has arrived at ${sysName}.`,
    contentHTML: stats,
  });
}

// ── Inicjalizacja — podłączenie EventBus ────────────────────────────────

export function initMissionEvents() {
  EventBus.on('expedition:disaster',      _onDisaster);
  EventBus.on('expedition:colonyFounded',  _onColonyFounded);
  EventBus.on('expedition:missionReport',  _onMissionReport);
  EventBus.on('expedition:reconProgress',  _onReconProgress);
  EventBus.on('expedition:reconComplete',  _onReconComplete);
  EventBus.on('discovery:found',           _onDiscoveryFound);
  EventBus.on('tech:researched',           _onTechResearched);
  EventBus.on('interstellar:arrived',      _onInterstellarArrived);
  EventBus.on('time:stateChanged',         _onTimeStateChanged);
}
