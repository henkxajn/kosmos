// ConfirmModal — custom confirm dialog w stylu gry (zastępuje window.confirm)
//
// Pattern function-based + Promise<boolean>, jak inne modale (V4 z P2.2):
// ModalInput, TransportModal, EventChoiceModal, POIModal. z=1000 (równo z POIModal —
// modal nigdy nie koegzystuje z innym modalem, więc bezpiecznie).
//
// Resolves: M3 P2.2 known issue #7 (Windows-style native confirm UX).
// Reusable dla future delete operations (vessel, colony, save game, etc.).

import { THEME, hexToRgb } from '../config/ThemeConfig.js';
import { t }              from '../i18n/i18n.js';

const Z_INDEX = 1000;

/**
 * Pokaż custom confirm modal w stylu THEME.
 * @param {object} opts
 * @param {string} opts.title         — nagłówek (np. "Usuń POI")
 * @param {string} opts.message       — treść (np. 'Czy na pewno usunąć POI: "WP Alfa"?')
 * @param {string} [opts.confirmLabel] — etykieta przycisku potwierdzenia (default: t('confirm.yes'))
 * @param {string} [opts.cancelLabel]  — etykieta anulowania (default: t('confirm.cancel'))
 * @param {boolean} [opts.danger]     — true = czerwony confirm button (operacje destrukcyjne)
 * @returns {Promise<boolean>} — true gdy potwierdzono, false gdy Cancel/ESC/backdrop
 */
export function showConfirmModal({ title, message, confirmLabel, cancelLabel, danger = false } = {}) {
  return new Promise((resolve) => {
    // ── Dimming overlay ──────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'kosmos-confirm-modal-overlay';
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
      width: '400px',
      maxWidth: '90vw',
      fontFamily: THEME.fontFamily,
      color: THEME.textPrimary,
    });

    // Title
    const titleEl = document.createElement('div');
    titleEl.textContent = title ?? t('confirm.yes');
    Object.assign(titleEl.style, {
      color: THEME.accent,
      fontSize: `${THEME.fontSizeLarge}px`,
      letterSpacing: '1px',
      marginBottom: '12px',
      paddingBottom: '10px',
      borderBottom: `1px solid ${THEME.border}`,
    });
    card.appendChild(titleEl);

    // Message
    const msgEl = document.createElement('div');
    msgEl.textContent = message ?? '';
    Object.assign(msgEl.style, {
      color: THEME.textPrimary,
      fontSize: `${THEME.fontSizeMedium}px`,
      lineHeight: '1.4',
      marginBottom: '20px',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    });
    card.appendChild(msgEl);

    // Footer (buttons)
    const footer = document.createElement('div');
    Object.assign(footer.style, {
      display: 'flex', justifyContent: 'flex-end', gap: '10px',
    });

    const btnCancel  = _makeButton(cancelLabel ?? t('confirm.cancel'),  'secondary');
    const btnConfirm = _makeButton(confirmLabel ?? t('confirm.yes'), danger ? 'danger' : 'primary');
    footer.appendChild(btnCancel);
    footer.appendChild(btnConfirm);
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

    btnConfirm.addEventListener('click', () => finishWith(true));
    btnCancel .addEventListener('click', () => finishWith(false));

    // Backdrop click = cancel
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finishWith(false);
    });
    // Block propagation z karty
    for (const evt of ['click', 'mousedown', 'mouseup']) {
      card.addEventListener(evt, (e) => e.stopPropagation());
    }

    // Klawisze: ESC = cancel, ENTER = confirm
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        finishWith(false);
      } else if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        finishWith(true);
      }
      // Block all keys propagating do GameScene
      e.stopPropagation();
    }
    document.addEventListener('keydown', onKeyDown, true);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Autofocus na cancel button (safe default — nie commit'ujemy przypadkiem ENTERem)
    requestAnimationFrame(() => { btnCancel.focus(); });
  });
}

// ── Button factory (spójny styl z POIModal) ───────────────────────────

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
