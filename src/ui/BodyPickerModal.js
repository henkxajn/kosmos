// BodyPickerModal — DOM modal wyboru ciała docelowego (np. rozkaz Dock). Lista podanych ciał
// (np. kolonie gracza z homeplanet). Wzór FleetAssignModal. Promise<{bodyId} | null> (null=cancel).
//
// @param {Array<{id:string, name:string}>} bodies
// @param {string} titleKey — klucz i18n nagłówka
// @returns {Promise<{bodyId:string} | null>}

import { THEME } from '../config/ThemeConfig.js';
import { t }     from '../i18n/i18n.js';

export function showBodyPickerModal(bodies, titleKey = 'bodyPicker.title') {
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
      width: '320px',
      maxHeight: '70vh',
      overflowY: 'auto',
      fontFamily: THEME.fontFamily,
      color: THEME.textPrimary,
    });

    const title = document.createElement('div');
    title.textContent = t(titleKey);
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

    if (!bodies || bodies.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = t('bodyPicker.empty');
      Object.assign(empty.style, { color: THEME.textDim, fontSize: `${THEME.fontSizeSmall}px`, padding: '8px 0' });
      list.appendChild(empty);
    } else {
      for (const b of bodies) {
        const row = document.createElement('button');
        row.textContent = b.name ?? b.id;
        Object.assign(row.style, {
          background: 'transparent',
          border: `1px solid ${THEME.border}`,
          borderRadius: '3px',
          color: THEME.textPrimary,
          fontFamily: THEME.fontFamily,
          fontSize: `${THEME.fontSizeNormal}px`,
          padding: '8px 12px',
          cursor: 'pointer',
          textAlign: 'left',
        });
        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.04)'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
        row.addEventListener('click', () => resolveAndClose({ bodyId: b.id }));
        list.appendChild(row);
      }
    }
    panel.appendChild(list);

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
