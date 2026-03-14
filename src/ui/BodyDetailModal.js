// BodyDetailModal — panel szczegółów ciała niebieskiego w Star Atlas
//
// Otwierany po kliknięciu ciała w katalogu FleetTabPanel.
// Wyświetla dane zbadanego ciała (złoża, atmosfera, temperatura, skład)
// lub "???" dla niezbadanych. Umożliwia rename i "oznacz jako cel".

import { THEME, hexToRgb } from '../config/ThemeConfig.js';
import { showRenameModal } from './ModalInput.js';
import EventBus from '../core/EventBus.js';
import { t } from '../i18n/i18n.js';

// Mapowanie typów ciał na klucze i18n
function _typeName(type) {
  const key = `bodyType.${type.charAt(0).toUpperCase()}${type.slice(1)}`;
  return t(key) || type;
}

// Ikony typów planet
const PTYPE_ICONS = {
  rocky:    '🪨',
  gas:      '🌀',
  ice:      '🧊',
  volcanic: '🌋',
};

/**
 * Wyświetla modal ze szczegółami ciała niebieskiego.
 * @param {Object} body — encja ciała (planet/moon/planetoid)
 */
export function showBodyDetailModal(body) {
  // ── Dimming overlay ───────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'kosmos-modal-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0',
    background: 'rgba(2,4,5,0.75)',
    zIndex: '100',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });

  // ── Panel ─────────────────────────────────────────────────
  const panel = document.createElement('div');
  const glowC = hexToRgb(THEME.borderActive);
  Object.assign(panel.style, {
    background: THEME.bgSecondary,
    border: `1px solid ${THEME.border}`,
    borderRadius: '6px',
    boxShadow: `0 0 30px rgba(${glowC.r},${glowC.g},${glowC.b},0.3)`,
    padding: '18px 24px',
    width: '380px',
    maxHeight: '80vh',
    overflowY: 'auto',
    fontFamily: THEME.fontFamily,
    color: THEME.textPrimary,
  });

  const explored = body.explored === true;
  const typeName = _typeName(body.type);
  const ptypeIcon = PTYPE_ICONS[body.planetType] ?? '';
  const displayName = explored ? body.name : '???';

  // ── Header ────────────────────────────────────────────────
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '14px',
  });

  const titleDiv = document.createElement('div');
  const titleText = document.createElement('span');
  titleText.textContent = `${ptypeIcon} ${displayName}`;
  Object.assign(titleText.style, {
    color: THEME.accent,
    fontSize: `${THEME.fontSizeLarge + 2}px`,
    letterSpacing: '1px',
    fontWeight: 'bold',
  });
  titleDiv.appendChild(titleText);

  const subText = document.createElement('div');
  subText.textContent = `${typeName}${body.planetType ? ` (${body.planetType})` : ''}`;
  Object.assign(subText.style, {
    color: THEME.textDim,
    fontSize: `${THEME.fontSizeSmall}px`,
    marginTop: '2px',
  });
  titleDiv.appendChild(subText);
  header.appendChild(titleDiv);

  // Ikona celu
  if (body._markedAsTarget) {
    const targetIcon = document.createElement('span');
    targetIcon.textContent = '🎯';
    targetIcon.style.fontSize = '20px';
    header.appendChild(targetIcon);
  }

  panel.appendChild(header);

  // ── Separator ─────────────────────────────────────────────
  const addSep = () => {
    const sep = document.createElement('hr');
    Object.assign(sep.style, {
      border: 'none',
      borderTop: `1px solid ${THEME.border}`,
      margin: '10px 0',
    });
    panel.appendChild(sep);
  };

  // ── Helper: wiersz danych ─────────────────────────────────
  const addRow = (label, value, color = THEME.textPrimary) => {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', justifyContent: 'space-between',
      fontSize: `${THEME.fontSizeSmall + 1}px`,
      marginBottom: '4px',
    });
    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.color = THEME.textDim;
    const val = document.createElement('span');
    val.textContent = value;
    val.style.color = color;
    row.appendChild(lbl);
    row.appendChild(val);
    panel.appendChild(row);
  };

  // ── Dane orbitalne (zawsze widoczne) ──────────────────────
  addSep();
  const orbA = body.orbital?.a ?? 0;
  addRow(t('bodyDetail.orbit'), `${orbA.toFixed(2)} AU`);

  // Odległość od bazy
  const homePl = window.KOSMOS?.homePlanet;
  if (homePl && body !== homePl) {
    const dx = (body.physics?.x ?? 0) - (homePl.physics?.x ?? 0);
    const dy = (body.physics?.y ?? 0) - (homePl.physics?.y ?? 0);
    const dist = Math.sqrt(dx * dx + dy * dy);
    addRow(t('bodyDetail.distFromBase'), `${dist.toFixed(2)} AU`);
  }

  // ── Dane zbadanego ciała ──────────────────────────────────
  if (explored) {
    // Temperatura
    if (body.temperatureC != null || body.temperatureK != null) {
      const tempC = body.temperatureC ?? (body.temperatureK - 273.15);
      addRow(t('bodyDetail.temperature'), `${tempC > 0 ? '+' : ''}${tempC.toFixed(0)}°C`);
    }

    // Grawitacja powierzchniowa
    if (body.surfaceGravity != null) {
      addRow(t('bodyDetail.gravity'), `${body.surfaceGravity.toFixed(2)} g`);
    }

    // Atmosfera
    if (body.atmosphere) {
      const atmoLabel = t(`atmosphere.${body.atmosphere}`) || body.atmosphere;
      addRow(t('bodyDetail.atmosphere'), atmoLabel);
    }

    // Masa
    if (body.physics?.mass != null) {
      addRow(t('bodyDetail.mass'), `${body.physics.mass.toExponential(2)} M☉`);
    }

    // Kolonia/outpost
    const colMgr = window.KOSMOS?.colonyManager;
    if (colMgr) {
      const colony = colMgr.getColony(body.id);
      if (colony) {
        const status = colony.isOutpost ? t('bodyDetail.outpost') : t('colony.colony');
        addRow(t('bodyDetail.status'), status, THEME.success);
      }
    }

    // ── Złoża ─────────────────────────────────────────────
    const deposits = body.deposits ?? [];
    if (deposits.length > 0) {
      addSep();
      const depTitle = document.createElement('div');
      depTitle.textContent = t('ui.depositsHeader');
      Object.assign(depTitle.style, {
        color: THEME.accent,
        fontSize: `${THEME.fontSizeSmall}px`,
        letterSpacing: '1px',
        marginBottom: '6px',
      });
      panel.appendChild(depTitle);

      for (const dep of deposits) {
        if (dep.remaining <= 0) continue;
        const stars = dep.richness >= 0.7 ? '★★★' : dep.richness >= 0.4 ? '★★' : '★';
        const starColor = dep.richness >= 0.7 ? THEME.yellow : dep.richness >= 0.4 ? THEME.accent : THEME.textDim;
        addRow(`${dep.resourceId}`, `${stars}  (${Math.floor(dep.remaining)})`, starColor);
      }
    }

    // ── Skład chemiczny ───────────────────────────────────
    const comp = body.composition;
    if (comp && Object.keys(comp).length > 0) {
      addSep();
      const compTitle = document.createElement('div');
      compTitle.textContent = t('ui.compositionHeader');
      Object.assign(compTitle.style, {
        color: THEME.accent,
        fontSize: `${THEME.fontSizeSmall}px`,
        letterSpacing: '1px',
        marginBottom: '6px',
      });
      panel.appendChild(compTitle);

      // Top 6 elementów wg ilości
      const sorted = Object.entries(comp)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
      for (const [elem, pct] of sorted) {
        addRow(elem, `${(pct * 100).toFixed(1)}%`);
      }
    }
  } else {
    // Niezbadane ciało
    addSep();
    const unknownDiv = document.createElement('div');
    unknownDiv.textContent = t('ui.unexploredBody');
    Object.assign(unknownDiv.style, {
      color: THEME.textDim,
      fontSize: `${THEME.fontSizeSmall + 1}px`,
      fontStyle: 'italic',
      textAlign: 'center',
      padding: '12px 0',
    });
    panel.appendChild(unknownDiv);
  }

  // ── Przyciski ─────────────────────────────────────────────
  addSep();
  const btnRow = document.createElement('div');
  Object.assign(btnRow.style, {
    display: 'flex', gap: '8px', flexWrap: 'wrap',
  });

  const makeBtn = (label, borderColor, textColor) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      background: 'transparent',
      border: `1px solid ${borderColor}`,
      borderRadius: '3px',
      color: textColor,
      fontFamily: THEME.fontFamily,
      fontSize: `${THEME.fontSizeNormal}px`,
      padding: '6px 14px',
      cursor: 'pointer',
      letterSpacing: '0.5px',
      flex: '1',
      minWidth: '80px',
    });
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(255,255,255,0.05)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
    });
    return btn;
  };

  // Przycisk: Zmień nazwę (tylko zbadane)
  if (explored) {
    const btnRename = makeBtn(t('ui.rename'), THEME.accent, THEME.accent);
    btnRename.addEventListener('click', async () => {
      const newName = await showRenameModal(body.name);
      if (newName) {
        body.name = newName;
        titleText.textContent = `${ptypeIcon} ${newName}`;
        EventBus.emit('body:renamed', { entity: body, name: newName });
      }
    });
    btnRow.appendChild(btnRename);
  }

  // Przycisk: Oznacz/Odznacz jako cel
  const isTarget = !!body._markedAsTarget;
  const btnTarget = makeBtn(
    isTarget ? t('ui.unmarkTarget') : t('ui.markTarget'),
    isTarget ? THEME.textDim : THEME.yellow,
    isTarget ? THEME.textSecondary : THEME.yellow
  );
  btnTarget.addEventListener('click', () => {
    body._markedAsTarget = !body._markedAsTarget;
    EventBus.emit('body:markedAsTarget', { entity: body, marked: body._markedAsTarget });
    cleanup();
  });
  btnRow.appendChild(btnTarget);

  // Przycisk: Zamknij
  const btnClose = makeBtn(t('ui.close'), THEME.textDim, THEME.textSecondary);
  btnClose.addEventListener('click', () => cleanup());
  btnRow.appendChild(btnClose);

  panel.appendChild(btnRow);
  // Blokuj propagację kliknięć/mousedown do canvas/window
  for (const evt of ['click', 'mousedown', 'mouseup']) {
    panel.addEventListener(evt, (e) => e.stopPropagation());
    overlay.addEventListener(evt, (e) => e.stopPropagation());
  }
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // ── Cleanup ───────────────────────────────────────────────
  const cleanup = () => {
    if (overlay.parentNode) document.body.removeChild(overlay);
  };

  // Klik na dimming = zamknij
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cleanup();
  });

  // Escape = zamknij
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
}
