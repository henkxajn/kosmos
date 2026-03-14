// IntroModal — sekwencja powitalna na starcie nowej gry
//
// 1. Transmisja rządowa (lore — komunikat Rady Najwyższej)
// 2. Nazwij swoją cywilizację
// 3. Nazwij swoją stolicę
//
// Styl: Amber Terminal (CRT) — via TerminalPopupBase.

import { THEME, hexToRgb } from '../config/ThemeConfig.js';
import {
  buildTerminalPopup,
  injectTerminalPopupCSS,
} from './TerminalPopupBase.js';
import { t } from '../i18n/i18n.js';

// ── Helpery ─────────────────────────────────────────────────────────────

function _rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Ekran 1: Transmisja rządowa ─────────────────────────────────────────

function showTransmission() {
  return new Promise(resolve => {
    // Terminal header w monospace
    const terminalLines = [
      t('intro.sysInit'),
      t('intro.sysFed'),
      t('intro.sysAuth'),
      '>',
      t('intro.sysEncrypted'),
    ].join('\n');

    const terminalHTML = `<pre style="
      font-family: 'Courier New', Consolas, monospace;
      font-size: 11px;
      color: ${THEME.success};
      margin: 0 0 10px 0;
      line-height: 1.7;
      white-space: pre;
    ">${terminalLines}</pre>`;

    // Separator
    const sepHTML = `<hr style="border:none; border-top:1px solid ${THEME.border}; margin:8px 0;">`;

    // Treść transmisji
    const bodyHTML = `
      <div style="font-size:13px; color:${THEME.textSecondary}; line-height:1.65; margin-bottom:8px;">
        ${t('intro.msg1')}
      </div>
      <div style="font-size:13px; color:${THEME.textSecondary}; line-height:1.65; margin-bottom:8px;">
        ${t('intro.msg2')}
      </div>
      <div style="font-size:13px; color:${THEME.textSecondary}; line-height:1.65; margin-bottom:8px;">
        ${t('intro.msg3')}
      </div>
      <div style="font-size:13px; color:${THEME.textPrimary}; font-style:italic; line-height:1.65; margin-bottom:10px;">
        ${t('intro.msg4')}
      </div>
      <div style="font-size:14px; font-weight:bold; color:${THEME.warning}; margin-bottom:10px;">
        ${t('intro.msg5')}
      </div>
      <pre style="
        font-family: 'Courier New', Consolas, monospace;
        font-size: 11px;
        color: ${THEME.success};
        margin: 0;
        white-space: pre;
        line-height: 1.5;
      ">${t('intro.council')}</pre>
    `;

    const contentHTML = terminalHTML + sepHTML + bodyHTML;

    const { overlay, dismiss, btnElements } = buildTerminalPopup({
      severity: 'info',
      barTitle: t('intro.barTitle'),
      barRight: t('intro.barRight'),
      svgKey: 'alert',
      svgLabel: t('intro.svgLabel').replace(/\n/g, '<br>'),
      headline: t('intro.headline'),
      contentHTML,
      buttons: [{ label: t('ui.continue'), primary: true }],
      onDismiss: () => resolve(),
    });

    // Podłącz dismiss do przycisku
    for (const btn of btnElements) {
      btn.addEventListener('click', () => dismiss());
    }

    // Keyboard: Enter/Space/Escape
    const onKey = (e) => {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        document.removeEventListener('keydown', onKey, true);
        dismiss();
      }
    };
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(overlay);
    requestAnimationFrame(() => { if (btnElements[0]) btnElements[0].focus(); });
  });
}

// ── Ekran z inputem nazwy ───────────────────────────────────────────────

function showNameInput(title, defaultValue, placeholder, svgLabel) {
  return new Promise(resolve => {
    // Input HTML — zostanie osadzony w contentHTML
    const inputId = 'intro-name-input-' + Date.now();

    const contentHTML = `
      <div style="margin-top:8px;">
        <input id="${inputId}" type="text" value="${defaultValue}" maxlength="30"
          placeholder="${placeholder || ''}"
          style="
            width: 100%;
            box-sizing: border-box;
            background: ${THEME.bgPrimary};
            border: 1px solid ${THEME.border};
            border-radius: 2px;
            color: ${THEME.textPrimary};
            font-family: ${THEME.fontFamily};
            font-size: 15px;
            padding: 10px 12px;
            outline: none;
            text-align: center;
            transition: border-color 0.2s, box-shadow 0.2s;
          "
        />
      </div>
    `;

    let resolved = false;

    const { overlay, dismiss, btnElements } = buildTerminalPopup({
      severity: 'discovery',
      barTitle: title,
      svgKey: 'colony',
      svgLabel: svgLabel,
      headline: title,
      contentHTML,
      buttons: [{ label: t('ui.continue'), primary: true }],
      onDismiss: () => {
        if (!resolved) {
          resolved = true;
          resolve(defaultValue);
        }
      },
    });

    document.body.appendChild(overlay);

    // Znajdź input po wstawieniu do DOM
    const input = document.getElementById(inputId);

    // Stylizacja focus inputu
    if (input) {
      input.addEventListener('focus', () => {
        input.style.borderColor = THEME.borderActive;
        input.style.boxShadow = `0 0 10px ${_rgba(THEME.borderActive, 0.3)}`;
      });
      input.addEventListener('blur', () => {
        input.style.borderColor = THEME.border;
        input.style.boxShadow = 'none';
      });
    }

    const submit = () => {
      if (resolved) return;
      resolved = true;
      const val = input ? input.value.trim() : '';
      document.removeEventListener('keydown', onKey, true);
      dismiss();
      resolve(val || defaultValue);
    };

    // Przycisk DALEJ
    for (const btn of btnElements) {
      btn.addEventListener('click', submit);
    }

    // Keyboard — Enter w inpucie = submit, inne klawisze blokuj propagację
    const onKey = (e) => {
      // Pozwól na pisanie w inpucie — blokuj tylko propagację do gry
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    };
    document.addEventListener('keydown', onKey, true);

    // Focus na input
    requestAnimationFrame(() => {
      if (input) {
        input.focus();
        input.select();
      }
    });
  });
}

// ── Pełna sekwencja intro ───────────────────────────────────────────────

/**
 * Wyświetla sekwencję powitalną nowej gry:
 * 1. Transmisja rządowa (lore)
 * 2. Nazwa cywilizacji
 * 3. Nazwa stolicy
 *
 * @returns {Promise<{ civName: string, capitalName: string }>}
 */
export async function showIntroSequence() {
  // Upewnij się że CSS jest załadowany
  injectTerminalPopupCSS();

  // 1. Transmisja rządowa
  await showTransmission();

  // 2. Nazwij cywilizację
  const civName = await showNameInput(
    t('intro.nameCivTitle'),
    t('intro.defaultCivName'),
    t('intro.civPlaceholder'),
    t('intro.civSvg').replace(/\n/g, '<br>')
  );

  // 3. Nazwij stolicę
  const capitalName = await showNameInput(
    t('intro.nameCapitalTitle'),
    t('intro.defaultCapitalName'),
    t('intro.capitalPlaceholder'),
    t('intro.capitalSvg').replace(/\n/g, '<br>')
  );

  return { civName, capitalName };
}
