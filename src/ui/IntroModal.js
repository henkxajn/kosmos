// IntroModal — sekwencja powitalna na starcie nowej gry
//
// 1. Transmisja rządowa (lore — komunikat Rady Najwyższej)
// 2. Nazwij swoją cywilizację
// 3. Nazwij swoją stolicę
//
// Styl: sci-fi terminal, kolory z THEME.

import { THEME, hexToRgb } from '../config/ThemeConfig.js';

// ── Helpery kolorów z THEME ──────────────────────────────────────────────
function _bgAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function _glowShadow(hex, spread = 40, alpha = 0.3) {
  const { r, g, b } = hexToRgb(hex);
  return `0 0 ${spread}px rgba(${r},${g},${b},${alpha})`;
}

// ── Inject CSS animacji ─────────────────────────────────────────────────
(function injectStyle() {
  if (document.getElementById('intro-modal-style')) return;
  const style = document.createElement('style');
  style.id = 'intro-modal-style';
  style.textContent = `
    @keyframes introFadeIn {
      from { transform: translateY(-20px); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
    }
    @keyframes terminalType {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
})();

// ── Helpers ─────────────────────────────────────────────────────────────

function _createOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'kosmos-modal-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0',
    background: 'rgba(2,4,5,0.85)',
    zIndex: '100',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });
  return overlay;
}

function _createPanel(maxWidth = '520px') {
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    background: _bgAlpha(THEME.bgPrimary, 0.97),
    border: `1px solid ${THEME.borderActive}`,
    borderRadius: '6px',
    boxShadow: `${_glowShadow(THEME.borderActive, 40, 0.3)}, inset ${_glowShadow(THEME.borderActive, 30, 0.1)}`,
    padding: '24px 32px',
    maxWidth,
    width: '90%',
    fontFamily: THEME.fontFamily,
    animation: 'introFadeIn 0.4s ease-out',
  });
  return panel;
}

function _createBtn(label, isPrimary = true) {
  const btn = document.createElement('button');
  const bg = isPrimary ? _bgAlpha(THEME.bgTertiary, 0.9) : _bgAlpha(THEME.bgSecondary, 0.8);
  const bgHover = isPrimary ? _bgAlpha(THEME.borderActive, 0.3) : _bgAlpha(THEME.bgTertiary, 0.8);
  Object.assign(btn.style, {
    display: 'block',
    margin: '0 auto',
    background: bg,
    border: `1px solid ${isPrimary ? THEME.borderActive : THEME.border}`,
    borderRadius: '4px',
    color: isPrimary ? THEME.accent : THEME.textSecondary,
    fontFamily: THEME.fontFamily,
    fontSize: '14px',
    padding: '8px 32px',
    cursor: 'pointer',
    letterSpacing: '1px',
  });
  btn.textContent = label;
  btn.addEventListener('mouseenter', () => btn.style.background = bgHover);
  btn.addEventListener('mouseleave', () => btn.style.background = bg);
  return btn;
}

// ── Ekran 1: Transmisja rządowa ─────────────────────────────────────────

function showTransmission() {
  return new Promise(resolve => {
    const overlay = _createOverlay();
    const panel = _createPanel('560px');

    // Terminal header (monospace, akcent)
    const terminal = document.createElement('div');
    Object.assign(terminal.style, {
      fontFamily: '"Courier New", Consolas, monospace',
      fontSize: '11px',
      color: THEME.success,
      marginBottom: '16px',
      lineHeight: '1.7',
      whiteSpace: 'pre',
    });
    terminal.textContent = [
      '> INICJALIZACJA SYSTEMU . . . . . . . . . OK',
      '> ŁĄCZNOŚĆ Z RADĄ FEDERACJI . . . . . . . OK',
      '> AUTORYZACJA PRZYWÓDCY . . . . . . . . . OCZEKUJE',
      '>',
      '> TRANSMISJA ZASZYFROWANA — PRIORYTET: ALFA',
    ].join('\n');
    panel.appendChild(terminal);

    // Separator
    const sep = document.createElement('hr');
    Object.assign(sep.style, {
      border: 'none', borderTop: `1px solid ${THEME.border}`,
      margin: '12px 0',
    });
    panel.appendChild(sep);

    // Nagłówek
    const greeting = document.createElement('div');
    Object.assign(greeting.style, {
      fontSize: '16px',
      fontWeight: 'bold',
      color: THEME.accent,
      marginBottom: '14px',
    });
    greeting.textContent = 'Drogi Przywódco,';
    panel.appendChild(greeting);

    // Treść transmisji
    const body = document.createElement('div');
    Object.assign(body.style, {
      fontSize: '13px',
      color: THEME.textSecondary,
      lineHeight: '1.65',
      marginBottom: '16px',
    });
    body.innerHTML = [
      'Ludzkość w końcu wyrwała się z kołyski. Po wiekach wojen, podziałów i uporu — opracowaliśmy technologię podróży planetarnych. Nasz układ gwiezdny stoi przed nami otwarty.',
      '',
      'Od tego momentu przejmujesz kontrolę nad losem naszej cywilizacji. Jedna planeta, miliardy istnień i cały układ do zbadania. Podróże międzygwiezdne pozostają poza naszym zasięgiem — ale to, co kryje się na okolicznych planetach i księżycach, może to zmienić.',
      '',
      'Jedna planeta to za mało, by zagwarantować przetrwanie naszego gatunku. Jedno uderzenie asteroidy, jedna katastrofa — i wszystko, czym jesteśmy, zniknie na zawsze. Musimy się rozprzestrzenić.',
      '',
      `<span style="color:${THEME.textPrimary};font-style:italic;">Eksploruj, kolonizuj, rozwijaj — rób co musisz, by ludzkość sięgnęła dalej niż kiedykolwiek.</span>`,
    ].join('<br>');
    panel.appendChild(body);

    // Ostrzeżenie
    const warning = document.createElement('div');
    Object.assign(warning.style, {
      fontSize: '14px',
      fontWeight: 'bold',
      color: THEME.warning,
      marginBottom: '16px',
    });
    warning.textContent = 'Nie zawiódź nas.';
    panel.appendChild(warning);

    // Terminal footer
    const footer = document.createElement('div');
    Object.assign(footer.style, {
      fontFamily: '"Courier New", Consolas, monospace',
      fontSize: '11px',
      color: THEME.success,
      marginBottom: '20px',
      whiteSpace: 'pre',
      lineHeight: '1.5',
    });
    footer.textContent = '> — Rada Najwyższa\n> KONIEC TRANSMISJI';
    panel.appendChild(footer);

    // Przycisk DALEJ
    const btn = _createBtn('DALEJ');
    btn.addEventListener('click', close);
    panel.appendChild(btn);

    // Blokuj propagację kliknięć/mousedown do canvas/window
    for (const evt of ['click', 'mousedown', 'mouseup']) {
      panel.addEventListener(evt, (e) => e.stopPropagation());
      overlay.addEventListener(evt, (e) => e.stopPropagation());
    }
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    function close() {
      document.removeEventListener('keydown', onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve();
    }

    const onKey = (e) => {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKey);

    requestAnimationFrame(() => btn.focus());
  });
}

// ── Ekran z inputem nazwy ───────────────────────────────────────────────

function showNameInput(title, defaultValue, placeholder) {
  return new Promise(resolve => {
    const overlay = _createOverlay();
    const panel = _createPanel('420px');

    // Tytuł
    const titleEl = document.createElement('div');
    Object.assign(titleEl.style, {
      color: THEME.accent,
      fontSize: '16px',
      fontWeight: 'bold',
      marginBottom: '16px',
      letterSpacing: '1px',
      textAlign: 'center',
    });
    titleEl.textContent = title;
    panel.appendChild(titleEl);

    // Input
    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultValue;
    input.maxLength = 30;
    input.placeholder = placeholder || '';
    Object.assign(input.style, {
      width: '100%',
      boxSizing: 'border-box',
      background: THEME.bgPrimary,
      border: `1px solid ${THEME.border}`,
      borderRadius: '4px',
      color: THEME.textPrimary,
      fontFamily: THEME.fontFamily,
      fontSize: '15px',
      padding: '10px 12px',
      outline: 'none',
      marginBottom: '20px',
      textAlign: 'center',
    });
    input.addEventListener('focus', () => {
      input.style.borderColor = THEME.borderActive;
      input.style.boxShadow = _glowShadow(THEME.borderActive, 10, 0.3);
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = THEME.border;
      input.style.boxShadow = 'none';
    });
    panel.appendChild(input);

    // Przycisk DALEJ
    const btn = _createBtn('DALEJ');

    const submit = () => {
      const val = input.value.trim();
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve(val || defaultValue);
    };

    btn.addEventListener('click', submit);
    panel.appendChild(btn);

    // Blokuj propagację kliknięć/mousedown do canvas/window
    for (const evt of ['click', 'mousedown', 'mouseup']) {
      panel.addEventListener(evt, (e) => e.stopPropagation());
      overlay.addEventListener(evt, (e) => e.stopPropagation());
    }
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      e.stopPropagation(); // blokuj propagację do GameScene (Space, 1-5, etc.)
    });

    requestAnimationFrame(() => {
      input.focus();
      input.select();
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
  // 1. Transmisja rządowa
  await showTransmission();

  // 2. Nazwij cywilizację
  const civName = await showNameInput(
    'NAZWIJ SWOJĄ CYWILIZACJĘ',
    'Zjednoczona Federacja',
    'Wprowadź nazwę cywilizacji...'
  );

  // 3. Nazwij stolicę
  const capitalName = await showNameInput(
    'NAZWIJ SWOJĄ STOLICĘ',
    'Nowa Ziemia',
    'Wprowadź nazwę stolicy...'
  );

  return { civName, capitalName };
}
