// FleetAssignModal — wspólny DOM popup wyboru floty do przypisania zaznaczonych statków.
// Wyekstrahowany z FleetManagerOverlay (Slice 8b reuse): używany przez FleetManagerOverlay
// (pasek „Przypisz (N) ▼") i FleetGroupPanel (przycisk „→ Flota"). Lista istniejących flot
// (nazwa + licznik) + akcja „Nowa flota". Cancel/Escape/klik-tła = null.
//
// @param {Array<{id:string, name:string, memberIds:string[]}>} fleets
// @returns {Promise<{action:'existing', fleetId:string} | {action:'new'} | null>}

import { THEME } from '../config/ThemeConfig.js';
import { t }     from '../i18n/i18n.js';

export function showFleetAssignModal(fleets) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'kosmos-modal-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0',
      background: 'rgba(2,4,5,0.75)',
      zIndex: '1001',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      background: THEME.bgSecondary,
      border: `1px solid ${THEME.border}`,
      borderRadius: '6px',
      padding: '16px 20px',
      width: '340px',
      maxHeight: '70vh',
      overflowY: 'auto',
      fontFamily: THEME.fontFamily,
      color: THEME.textPrimary,
    });

    const title = document.createElement('div');
    title.textContent = t('fleet.assignToFleetTitle');
    Object.assign(title.style, {
      color: THEME.accent,
      fontSize: `${THEME.fontSizeLarge}px`,
      marginBottom: '10px',
      letterSpacing: '1px',
    });
    panel.appendChild(title);

    const list = document.createElement('div');
    Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' });

    const cleanup = () => { if (overlay.parentNode) document.body.removeChild(overlay); };
    const resolveAndClose = (val) => { cleanup(); resolve(val); };

    const makeRow = (label, onClick, isAction = false) => {
      const row = document.createElement('button');
      row.textContent = label;
      Object.assign(row.style, {
        background: 'transparent',
        border: `1px solid ${isAction ? THEME.borderActive : THEME.border}`,
        borderRadius: '3px',
        color: isAction ? THEME.accent : THEME.textPrimary,
        fontFamily: THEME.fontFamily,
        fontSize: `${THEME.fontSizeNormal}px`,
        padding: '8px 12px',
        cursor: 'pointer',
        textAlign: 'left',
      });
      row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.04)'; });
      row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
      row.addEventListener('click', onClick);
      list.appendChild(row);
      return row;
    };

    // Istniejące floty
    for (const f of fleets) {
      const memberInfo = ` (${f.memberIds.length})`;
      makeRow(f.name + memberInfo, () => resolveAndClose({ action: 'existing', fleetId: f.id }));
    }
    if (fleets.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = t('fleet.fleetsEmpty');
      Object.assign(empty.style, { color: THEME.textDim, fontSize: `${THEME.fontSizeSmall}px`, padding: '8px 0' });
      list.appendChild(empty);
    }
    // Akcja: Nowa flota
    makeRow('＋ ' + t('fleet.newFleet'), () => resolveAndClose({ action: 'new' }), true);

    panel.appendChild(list);

    // Cancel
    const cancelRow = document.createElement('div');
    Object.assign(cancelRow.style, { display: 'flex', justifyContent: 'flex-end' });
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = t('ui.cancel');
    Object.assign(cancelBtn.style, {
      background: 'transparent',
      border: `1px solid ${THEME.textDim}`,
      borderRadius: '3px',
      color: THEME.textSecondary,
      fontFamily: THEME.fontFamily,
      fontSize: `${THEME.fontSizeNormal}px`,
      padding: '6px 14px',
      cursor: 'pointer',
    });
    cancelBtn.addEventListener('click', () => resolveAndClose(null));
    cancelRow.appendChild(cancelBtn);
    panel.appendChild(cancelRow);

    overlay.appendChild(panel);
    for (const evt of ['click', 'mousedown', 'mouseup']) {
      panel.addEventListener(evt, (e) => e.stopPropagation());
    }
    overlay.addEventListener('click', (e) => { if (e.target === overlay) resolveAndClose(null); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); resolveAndClose(null); }
    });
    document.body.appendChild(overlay);
  });
}
