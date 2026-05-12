// M3 P3.1 — RallyAssignModal
//
// DOM modal do przypisania vessel do rally POI (single-rally per vessel).
// Pattern function-based + Promise (jak ConfirmModal, POIModal):
//   showRallyAssignModal({currentVesselId, currentRallyId})
//     → Promise<{action: 'assign'|'remove'|'cancel', rallyId?}>
//
// Wywoływane z FleetManagerOverlay RIGHT detail panel:
//   - Stan A (vessel NIE assigned): button "Przypisz do Rally..." otwiera
//     modal z currentRallyId=null → user wybiera rally → action='assign'
//   - Stan B (vessel assigned): button "Zmień rally..." otwiera modal z
//     currentRallyId=poi.id → user wybiera new rally lub klik "Usuń przypisanie"
//
// Single-rally rule: vessel może być w maksymalnie 1 rally na raz. Re-assign
// (zmień rally) = remove from old + add to new (handled w FleetOverlay click handler).
//
// Modal layout:
//   Header — "Przypisz do Rally" lub "Zmień rally"
//   Body — scrollable lista rally POI (icon + name + "{N}/{M} vessels" + complete badge)
//          empty state: "Brak rally POI"
//   Footer — "Usuń przypisanie" (danger, lewa, tylko gdy currentRallyId set) +
//            "Anuluj" (secondary, prawa)
//
// Z-INDEX: 1000 (above FleetOverlay)
// Cleanup: idempotent (cleanedUp flag), removes ESC handler + DOM
// ESC / backdrop click / Cancel = action='cancel'

import { THEME, hexToRgb } from '../config/ThemeConfig.js';
import { t }              from '../i18n/i18n.js';

const Z_INDEX = 1000;

/**
 * Pokaż modal przypisania vessel do rally POI.
 * @param {object} opts
 * @param {string} opts.currentVesselId — vesselId, dla którego konfigurujemy assignment
 * @param {string|null} [opts.currentRallyId] — istniejący rally assignment (null gdy nie assigned)
 * @returns {Promise<{action: 'assign'|'remove'|'cancel', rallyId?: string}>}
 */
export function showRallyAssignModal({ currentVesselId, currentRallyId = null } = {}) {
  return new Promise((resolve) => {
    const isChange = currentRallyId != null;

    // ── Dimming overlay ──────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'kosmos-rally-assign-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0',
      background: 'rgba(2,4,5,0.75)',
      zIndex: String(Z_INDEX),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });

    // ── Card ─────────────────────────────────────────────────
    const card = document.createElement('div');
    Object.assign(card.style, {
      background: THEME.bgSecondary,
      border: `1px solid ${THEME.border}`,
      borderRadius: '6px',
      boxShadow: (() => { const c = hexToRgb(THEME.borderActive); return `0 0 30px rgba(${c.r},${c.g},${c.b},0.3)`; })(),
      padding: '20px 24px',
      width: '460px',
      maxWidth: '90vw',
      maxHeight: '70vh',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: THEME.fontFamily,
      color: THEME.textPrimary,
    });

    // Title
    const titleEl = document.createElement('div');
    titleEl.textContent = isChange ? t('rallyModal.title.change') : t('rallyModal.title.assign');
    Object.assign(titleEl.style, {
      color: THEME.accent,
      fontSize: `${THEME.fontSizeLarge}px`,
      letterSpacing: '1px',
      marginBottom: '12px',
      paddingBottom: '10px',
      borderBottom: `1px solid ${THEME.border}`,
      flexShrink: '0',
    });
    card.appendChild(titleEl);

    // Body — scrollable list
    const body = document.createElement('div');
    Object.assign(body.style, {
      flex: '1 1 auto',
      overflowY: 'auto',
      marginBottom: '16px',
      maxHeight: '40vh',
    });

    const reg = window.KOSMOS?.poiRegistry;
    const rallies = reg?.listPOIs?.({ type: 'rally' }) ?? [];

    if (rallies.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = t('rallyModal.empty');
      Object.assign(empty.style, {
        color: THEME.textDim,
        fontSize: `${THEME.fontSizeNormal}px`,
        padding: '20px 8px',
        textAlign: 'center',
        lineHeight: '1.4',
      });
      body.appendChild(empty);
    } else {
      for (const rally of rallies) {
        const row = _makeRallyRow(rally, currentRallyId, () => {
          finishWith({ action: 'assign', rallyId: rally.id });
        });
        body.appendChild(row);
      }
    }
    card.appendChild(body);

    // Footer — buttons
    const footer = document.createElement('div');
    Object.assign(footer.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexShrink: '0',
    });

    // Lewa strona — Remove (tylko gdy isChange)
    const leftWrap = document.createElement('div');
    if (isChange) {
      const btnRemove = _makeButton(t('rallyModal.removeAssignment'), 'danger');
      btnRemove.addEventListener('click', () => finishWith({ action: 'remove', rallyId: currentRallyId }));
      leftWrap.appendChild(btnRemove);
    }
    footer.appendChild(leftWrap);

    // Prawa strona — Cancel
    const rightWrap = document.createElement('div');
    const btnCancel = _makeButton(t('confirm.cancel'), 'secondary');
    btnCancel.addEventListener('click', () => finishWith({ action: 'cancel' }));
    rightWrap.appendChild(btnCancel);
    footer.appendChild(rightWrap);

    card.appendChild(footer);

    // ── Cleanup + resolve ────────────────────────────────────
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      document.removeEventListener('keydown', onKeyDown, true);
      if (overlay.parentNode) document.body.removeChild(overlay);
    };
    const finishWith = (result) => { cleanup(); resolve(result); };

    // Backdrop click = cancel
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finishWith({ action: 'cancel' });
    });
    for (const evt of ['click', 'mousedown', 'mouseup']) {
      card.addEventListener(evt, (e) => e.stopPropagation());
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        finishWith({ action: 'cancel' });
      }
      e.stopPropagation();  // block all keys do GameScene
    }
    document.addEventListener('keydown', onKeyDown, true);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { btnCancel.focus(); });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────

function _makeRallyRow(rally, currentRallyId, onClick) {
  const isCurrent = rally.id === currentRallyId;
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 12px',
    marginBottom: '6px',
    border: `1px solid ${isCurrent ? THEME.accent : THEME.border}`,
    background: isCurrent ? 'rgba(0,255,180,0.08)' : THEME.bgTertiary,
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background 0.1s, border-color 0.1s',
  });
  row.addEventListener('mouseenter', () => {
    if (!isCurrent) row.style.background = 'rgba(255,255,255,0.05)';
    row.style.borderColor = THEME.accent;
  });
  row.addEventListener('mouseleave', () => {
    if (!isCurrent) row.style.background = THEME.bgTertiary;
    row.style.borderColor = isCurrent ? THEME.accent : THEME.border;
  });
  row.addEventListener('click', onClick);

  // Icon
  const icon = document.createElement('span');
  icon.textContent = '🎯';
  Object.assign(icon.style, {
    fontSize: '18px',
    marginRight: '12px',
    flexShrink: '0',
  });
  row.appendChild(icon);

  // Name + progress
  const info = document.createElement('div');
  Object.assign(info.style, { flex: '1 1 auto', minWidth: '0' });

  const nameEl = document.createElement('div');
  nameEl.textContent = rally.name ?? '?';
  Object.assign(nameEl.style, {
    color: THEME.textPrimary,
    fontSize: `${THEME.fontSizeNormal}px`,
    fontWeight: 'bold',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  });
  info.appendChild(nameEl);

  const subEl = document.createElement('div');
  const cur = rally.currentMembers ?? 0;
  const wait = rally.waitForCount ?? 1;
  const memberCount = (rally.memberVesselIds ?? []).length;
  subEl.textContent = `${cur}/${wait} ${t('tooltip.poi.rally.progressLabel')} • ${memberCount} ${t('rallyModal.assignedLabel')}`;
  Object.assign(subEl.style, {
    color: THEME.textDim,
    fontSize: `${THEME.fontSizeSmall}px`,
    marginTop: '2px',
  });
  info.appendChild(subEl);

  row.appendChild(info);

  // Complete badge
  if (rally.complete) {
    const badge = document.createElement('span');
    badge.textContent = '✅';
    Object.assign(badge.style, {
      fontSize: '14px',
      marginLeft: '8px',
      flexShrink: '0',
    });
    row.appendChild(badge);
  }

  // Current marker
  if (isCurrent) {
    const marker = document.createElement('span');
    marker.textContent = '◆';
    Object.assign(marker.style, {
      color: THEME.accent,
      fontSize: '14px',
      marginLeft: '8px',
      flexShrink: '0',
    });
    row.appendChild(marker);
  }

  return row;
}

function _makeButton(label, kind /* 'primary' | 'secondary' | 'danger' */) {
  const btn = document.createElement('button');
  btn.textContent = label;
  const palette = {
    primary:   { border: THEME.successDim,        text: THEME.success },
    secondary: { border: THEME.textDim,           text: THEME.textSecondary },
    danger:    { border: 'rgba(255,51,68,0.6)',   text: THEME.danger },
  }[kind] ?? { border: THEME.border, text: THEME.textDim };

  Object.assign(btn.style, {
    background: 'transparent',
    border: `1px solid ${palette.border}`,
    borderRadius: '3px',
    color: palette.text,
    fontFamily: THEME.fontFamily,
    fontSize: `${THEME.fontSizeNormal + 1}px`,
    padding: '7px 18px',
    cursor: 'pointer',
    letterSpacing: '0.5px',
    outline: 'none',
  });
  btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.05)'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
  btn.addEventListener('focus',      () => { btn.style.boxShadow = `0 0 6px ${palette.border}`; });
  btn.addEventListener('blur',       () => { btn.style.boxShadow = 'none'; });
  return btn;
}
