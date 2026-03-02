// IntroModal — sekwencja powitalna na starcie nowej gry
//
// 1. Transmisja rządowa (lore — komunikat Rady Najwyższej)
// 2. Nazwij swoją cywilizację
// 3. Nazwij swoją stolicę
//
// Styl: sci-fi terminal + formalna transmisja, ciemne tło, niebieski akcent.

import { THEME } from '../config/ThemeConfig.js';

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
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0',
    background: 'rgba(0,0,0,0.75)',
    zIndex: '100',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });
  return overlay;
}

function _createPanel(maxWidth = '520px') {
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    background: 'rgba(6,14,28,0.97)',
    border: '1px solid #2288cc',
    borderRadius: '6px',
    boxShadow: '0 0 40px rgba(0,80,180,0.3), inset 0 0 30px rgba(0,40,80,0.1)',
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
  const bg = isPrimary ? 'rgba(20,50,80,0.9)' : 'rgba(30,30,40,0.8)';
  const bgHover = isPrimary ? 'rgba(30,70,110,0.9)' : 'rgba(50,50,60,0.8)';
  Object.assign(btn.style, {
    display: 'block',
    margin: '0 auto',
    background: bg,
    border: `1px solid ${isPrimary ? '#2288cc' : '#445566'}`,
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

    // Terminal header (monospace, zielony)
    const terminal = document.createElement('div');
    Object.assign(terminal.style, {
      fontFamily: '"Courier New", Consolas, monospace',
      fontSize: '11px',
      color: '#44aa66',
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
      border: 'none', borderTop: '1px solid #2a4060',
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
      '<span style="color:#88bbdd;font-style:italic;">Eksploruj, kolonizuj, rozwijaj — rób co musisz, by ludzkość sięgnęła dalej niż kiedykolwiek.</span>',
    ].join('<br>');
    panel.appendChild(body);

    // Ostrzeżenie
    const warning = document.createElement('div');
    Object.assign(warning.style, {
      fontSize: '14px',
      fontWeight: 'bold',
      color: '#cc6644',
      marginBottom: '16px',
    });
    warning.textContent = 'Nie zawiódź nas.';
    panel.appendChild(warning);

    // Terminal footer
    const footer = document.createElement('div');
    Object.assign(footer.style, {
      fontFamily: '"Courier New", Consolas, monospace',
      fontSize: '11px',
      color: '#44aa66',
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
      border: '1px solid #2a4060',
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
      input.style.borderColor = '#2288cc';
      input.style.boxShadow = '0 0 10px rgba(34,136,204,0.3)';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = '#2a4060';
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
