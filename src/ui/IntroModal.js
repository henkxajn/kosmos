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
      '> INICJALIZACJA SYSTEMU . . . . . . . . . OK',
      '> ŁĄCZNOŚĆ Z RADĄ FEDERACJI . . . . . . . OK',
      '> AUTORYZACJA PRZYWÓDCY . . . . . . . . . OCZEKUJE',
      '>',
      '> TRANSMISJA ZASZYFROWANA — PRIORYTET: ALFA',
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
        Ludzkość w końcu wyrwała się z kołyski. Po wiekach wojen, podziałów i uporu — opracowaliśmy technologię podróży planetarnych. Nasz układ gwiezdny stoi przed nami otwarty.
      </div>
      <div style="font-size:13px; color:${THEME.textSecondary}; line-height:1.65; margin-bottom:8px;">
        Od tego momentu przejmujesz kontrolę nad losem naszej cywilizacji. Jedna planeta, miliardy istnień i cały układ do zbadania. Podróże międzygwiezdne pozostają poza naszym zasięgiem — ale to, co kryje się na okolicznych planetach i księżycach, może to zmienić.
      </div>
      <div style="font-size:13px; color:${THEME.textSecondary}; line-height:1.65; margin-bottom:8px;">
        Jedna planeta to za mało, by zagwarantować przetrwanie naszego gatunku. Jedno uderzenie asteroidy, jedna katastrofa — i wszystko, czym jesteśmy, zniknie na zawsze. Musimy się rozprzestrzenić.
      </div>
      <div style="font-size:13px; color:${THEME.textPrimary}; font-style:italic; line-height:1.65; margin-bottom:10px;">
        Eksploruj, kolonizuj, rozwijaj — rób co musisz, by ludzkość sięgnęła dalej niż kiedykolwiek.
      </div>
      <div style="font-size:14px; font-weight:bold; color:${THEME.warning}; margin-bottom:10px;">
        Nie zawiódź nas.
      </div>
      <pre style="
        font-family: 'Courier New', Consolas, monospace;
        font-size: 11px;
        color: ${THEME.success};
        margin: 0;
        white-space: pre;
        line-height: 1.5;
      ">> — Rada Najwyższa\n> KONIEC TRANSMISJI</pre>
    `;

    const contentHTML = terminalHTML + sepHTML + bodyHTML;

    const { overlay, dismiss, btnElements } = buildTerminalPopup({
      severity: 'info',
      barTitle: 'TRANSMISJA ZASZYFROWANA',
      barRight: 'PRIORYTET: ALFA',
      svgKey: 'alert',
      svgLabel: 'RADA<br>NAJWYŻSZA',
      headline: 'Drogi Przywódco,',
      contentHTML,
      buttons: [{ label: '[ DALEJ ]', primary: true }],
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
      svgLabel: svgLabel || 'NOWA<br>ERA',
      headline: title,
      contentHTML,
      buttons: [{ label: '[ DALEJ ]', primary: true }],
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
    'NAZWIJ SWOJĄ CYWILIZACJĘ',
    'Zjednoczona Federacja',
    'Wprowadź nazwę cywilizacji...',
    'CYWILI-<br>ZACJA'
  );

  // 3. Nazwij stolicę
  const capitalName = await showNameInput(
    'NAZWIJ SWOJĄ STOLICĘ',
    'Nowa Ziemia',
    'Wprowadź nazwę stolicy...',
    'STOLICA'
  );

  return { civName, capitalName };
}
