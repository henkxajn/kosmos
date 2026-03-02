// ThemeOverlay — panel debug motywu (F7)
//
// DOM overlay po prawej stronie ekranu (320px).
// Color pickery + presety + eksport/import/reset.
// Gra działa normalnie po lewej stronie.

import { THEME, DEFAULT_THEME, PRESET_THEMES, applyTheme, saveTheme, resetTheme, hexToRgb } from '../config/ThemeConfig.js';

// ── Sekcje edytora ──────────────────────────────────────────────

const SECTIONS = [
  {
    label: 'Powierzchnie',
    keys: ['bgPrimary', 'bgSecondary', 'bgTertiary'],
    labels: { bgPrimary: 'Tło główne', bgSecondary: 'Tło modali', bgTertiary: 'Tło przycisków' },
  },
  {
    label: 'Obramowania',
    keys: ['border', 'borderLight', 'borderActive'],
    labels: { border: 'Ramka', borderLight: 'Ramka jasna', borderActive: 'Ramka aktywna' },
  },
  {
    label: 'Tekst',
    keys: ['textPrimary', 'textSecondary', 'textLabel', 'textDim', 'textHeader', 'accent'],
    labels: {
      textPrimary: 'Jasny', textSecondary: 'Zwykły', textLabel: 'Label',
      textDim: 'Przyciemniony', textHeader: 'Nagłówek', accent: 'Akcent',
    },
  },
  {
    label: 'Statusy',
    keys: ['success', 'successDim', 'danger', 'dangerDim', 'warning', 'yellow', 'info', 'purple', 'mint'],
    labels: {
      success: 'Sukces', successDim: 'Sukces dim', danger: 'Błąd', dangerDim: 'Błąd dim',
      warning: 'Ostrzeżenie', yellow: 'Żółty', info: 'Info', purple: 'Specjalny', mint: 'Mint',
    },
  },
];

const FONT_KEYS = [
  { key: 'fontSizeSmall',  label: 'Mały',  min: 6, max: 16 },
  { key: 'fontSizeNormal', label: 'Normalny', min: 7, max: 18 },
  { key: 'fontSizeMedium', label: 'Średni', min: 8, max: 20 },
  { key: 'fontSizeLarge',  label: 'Duży',  min: 10, max: 24 },
  { key: 'fontSizeTitle',  label: 'Tytuł', min: 12, max: 30 },
];

// ── ThemeOverlay class ──────────────────────────────────────────

export class ThemeOverlay {
  constructor() {
    this._container = null;
    this._isOpen    = false;
    this._inputs    = {}; // klucz → { picker, text }
  }

  toggle() {
    if (this._isOpen) {
      this._close();
    } else {
      this._open();
    }
  }

  _open() {
    if (this._container) return;
    this._isOpen = true;
    this._build();
  }

  _close() {
    if (this._container) {
      document.body.removeChild(this._container);
      this._container = null;
    }
    this._isOpen = false;
    this._inputs = {};
    saveTheme();
  }

  // ── Budowanie panelu DOM ────────────────────────────────────────

  _build() {
    const root = document.createElement('div');
    root.id = 'theme-overlay';
    Object.assign(root.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      width: '310px',
      height: '100vh',
      overflowY: 'auto',
      zIndex: '101',
      background: THEME.bgSecondary,
      borderLeft: `2px solid ${THEME.border}`,
      fontFamily: 'monospace',
      fontSize: '10px',
      color: THEME.textPrimary,
      boxShadow: '-4px 0 20px rgba(0,0,0,0.5)',
      padding: '8px',
      boxSizing: 'border-box',
    });

    // Nagłówek
    const header = this._el('div', {
      textContent: 'MOTYW [F7]',
      style: `color:${THEME.accent};font-size:14px;font-weight:bold;text-align:center;margin-bottom:8px;padding:6px 0;border-bottom:1px solid ${THEME.border};letter-spacing:2px;`,
    });
    root.appendChild(header);

    // Presety
    root.appendChild(this._buildPresets());

    // Sekcje kolorów
    for (const section of SECTIONS) {
      root.appendChild(this._buildColorSection(section));
    }

    // Fonty
    root.appendChild(this._buildFontSection());

    // Akcje: export/import/reset
    root.appendChild(this._buildActions());

    document.body.appendChild(root);
    this._container = root;
  }

  // ── Presety ───────────────────────────────────────────────────

  _buildPresets() {
    const wrap = this._el('div', {
      style: 'margin-bottom:8px;padding:6px;border:1px solid ' + THEME.border + ';border-radius:4px;',
    });
    const label = this._el('div', {
      textContent: 'PRESETY',
      style: `color:${THEME.textHeader};font-size:9px;margin-bottom:6px;font-weight:bold;`,
    });
    wrap.appendChild(label);

    const row = this._el('div', { style: 'display:flex;gap:4px;flex-wrap:wrap;' });
    for (const [name, preset] of Object.entries(PRESET_THEMES)) {
      const btn = this._el('button', {
        textContent: name.charAt(0).toUpperCase() + name.slice(1),
        style: `
          background:${THEME.bgTertiary};border:1px solid ${THEME.border};border-radius:3px;
          color:${THEME.textPrimary};font-family:monospace;font-size:9px;padding:4px 10px;cursor:pointer;
        `,
      });
      btn.addEventListener('click', () => {
        applyTheme(preset);
        this._syncAll();
        saveTheme();
      });
      btn.addEventListener('mouseenter', () => { btn.style.borderColor = THEME.borderActive; });
      btn.addEventListener('mouseleave', () => { btn.style.borderColor = THEME.border; });
      row.appendChild(btn);
    }
    wrap.appendChild(row);
    return wrap;
  }

  // ── Sekcja kolorów ────────────────────────────────────────────

  _buildColorSection({ label, keys, labels }) {
    const wrap = this._el('div', {
      style: 'margin-bottom:6px;padding:6px;border:1px solid ' + THEME.border + ';border-radius:4px;',
    });

    // Nagłówek sekcji (klik → toggle)
    const headerRow = this._el('div', {
      style: `display:flex;justify-content:space-between;cursor:pointer;color:${THEME.textHeader};font-size:9px;font-weight:bold;margin-bottom:4px;`,
    });
    const headerLabel = this._el('span', { textContent: label.toUpperCase() });
    const arrow = this._el('span', { textContent: '▼', style: 'font-size:8px;' });
    headerRow.appendChild(headerLabel);
    headerRow.appendChild(arrow);
    wrap.appendChild(headerRow);

    const content = this._el('div', {});
    let collapsed = false;

    headerRow.addEventListener('click', () => {
      collapsed = !collapsed;
      content.style.display = collapsed ? 'none' : 'block';
      arrow.textContent = collapsed ? '►' : '▼';
    });

    for (const key of keys) {
      const row = this._el('div', {
        style: 'display:flex;align-items:center;margin-bottom:3px;gap:4px;',
      });

      const lbl = this._el('span', {
        textContent: labels[key] || key,
        style: `width:80px;color:${THEME.textSecondary};font-size:9px;`,
      });
      row.appendChild(lbl);

      // Color picker
      const picker = this._el('input', {
        style: 'width:28px;height:20px;border:none;cursor:pointer;padding:0;background:none;',
      });
      picker.type = 'color';
      picker.value = THEME[key];
      row.appendChild(picker);

      // Hex text input
      const text = this._el('input', {
        style: `width:70px;background:${THEME.bgPrimary};border:1px solid ${THEME.border};border-radius:2px;color:${THEME.textPrimary};font-family:monospace;font-size:9px;padding:2px 4px;`,
      });
      text.type = 'text';
      text.value = THEME[key];
      row.appendChild(text);

      // Synchronizacja picker ↔ text → THEME
      picker.addEventListener('input', () => {
        THEME[key] = picker.value;
        text.value = picker.value;
      });
      text.addEventListener('change', () => {
        const val = text.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
          THEME[key] = val;
          picker.value = val;
        } else {
          text.value = THEME[key]; // przywróć poprawną wartość
        }
      });

      this._inputs[key] = { picker, text };
      content.appendChild(row);
    }

    wrap.appendChild(content);
    return wrap;
  }

  // ── Fonty ─────────────────────────────────────────────────────

  _buildFontSection() {
    const wrap = this._el('div', {
      style: 'margin-bottom:6px;padding:6px;border:1px solid ' + THEME.border + ';border-radius:4px;',
    });

    const headerRow = this._el('div', {
      style: `display:flex;justify-content:space-between;cursor:pointer;color:${THEME.textHeader};font-size:9px;font-weight:bold;margin-bottom:4px;`,
    });
    const headerLabel = this._el('span', { textContent: 'FONTY' });
    const arrow = this._el('span', { textContent: '▼', style: 'font-size:8px;' });
    headerRow.appendChild(headerLabel);
    headerRow.appendChild(arrow);
    wrap.appendChild(headerRow);

    const content = this._el('div', {});
    let collapsed = false;

    headerRow.addEventListener('click', () => {
      collapsed = !collapsed;
      content.style.display = collapsed ? 'none' : 'block';
      arrow.textContent = collapsed ? '►' : '▼';
    });

    // fontFamily input
    const famRow = this._el('div', {
      style: 'display:flex;align-items:center;margin-bottom:6px;gap:4px;',
    });
    const famLbl = this._el('span', {
      textContent: 'Rodzina',
      style: `width:60px;color:${THEME.textSecondary};font-size:9px;`,
    });
    famRow.appendChild(famLbl);

    const famInput = this._el('input', {
      style: `flex:1;background:${THEME.bgPrimary};border:1px solid ${THEME.border};border-radius:2px;color:${THEME.textPrimary};font-family:monospace;font-size:9px;padding:2px 4px;`,
    });
    famInput.type = 'text';
    famInput.value = THEME.fontFamily;
    famInput.addEventListener('change', () => {
      THEME.fontFamily = famInput.value.trim() || 'monospace';
    });
    famRow.appendChild(famInput);
    content.appendChild(famRow);

    this._inputs.fontFamily = { text: famInput };

    // Slidery rozmiarów
    for (const { key, label, min, max } of FONT_KEYS) {
      const row = this._el('div', {
        style: 'display:flex;align-items:center;margin-bottom:3px;gap:4px;',
      });

      const lbl = this._el('span', {
        textContent: label,
        style: `width:60px;color:${THEME.textSecondary};font-size:9px;`,
      });
      row.appendChild(lbl);

      const slider = this._el('input', {
        style: 'flex:1;cursor:pointer;',
      });
      slider.type = 'range';
      slider.min = min;
      slider.max = max;
      slider.value = THEME[key];
      row.appendChild(slider);

      const valSpan = this._el('span', {
        textContent: `${THEME[key]}px`,
        style: `width:30px;color:${THEME.textPrimary};font-size:9px;text-align:right;`,
      });
      row.appendChild(valSpan);

      slider.addEventListener('input', () => {
        THEME[key] = parseInt(slider.value);
        valSpan.textContent = `${THEME[key]}px`;
      });

      this._inputs[key] = { slider, valSpan };
      content.appendChild(row);
    }

    wrap.appendChild(content);
    return wrap;
  }

  // ── Akcje: export/import/reset ────────────────────────────────

  _buildActions() {
    const wrap = this._el('div', {
      style: `padding:8px;border-top:1px solid ${THEME.border};margin-top:4px;display:flex;flex-direction:column;gap:4px;`,
    });

    const btnStyle = `
      background:${THEME.bgTertiary};border:1px solid ${THEME.border};border-radius:3px;
      color:${THEME.textPrimary};font-family:monospace;font-size:9px;padding:5px 8px;cursor:pointer;text-align:center;
    `;

    // Eksport
    const btnExport = this._el('button', { textContent: 'EKSPORTUJ (schowek)', style: btnStyle });
    btnExport.addEventListener('click', () => {
      const data = {};
      for (const key of Object.keys(DEFAULT_THEME)) {
        data[key] = THEME[key];
      }
      navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
        btnExport.textContent = 'Skopiowano!';
        setTimeout(() => { btnExport.textContent = 'EKSPORTUJ (schowek)'; }, 1500);
      }).catch(() => {
        btnExport.textContent = 'Błąd kopiowania';
        setTimeout(() => { btnExport.textContent = 'EKSPORTUJ (schowek)'; }, 1500);
      });
    });
    wrap.appendChild(btnExport);

    // Import
    const btnImport = this._el('button', { textContent: 'IMPORTUJ (ze schowka)', style: btnStyle });
    btnImport.addEventListener('click', () => {
      navigator.clipboard.readText().then(text => {
        try {
          const data = JSON.parse(text);
          applyTheme(data);
          this._syncAll();
          saveTheme();
          btnImport.textContent = 'Zaimportowano!';
        } catch {
          btnImport.textContent = 'Błędny JSON!';
        }
        setTimeout(() => { btnImport.textContent = 'IMPORTUJ (ze schowka)'; }, 1500);
      }).catch(() => {
        btnImport.textContent = 'Brak dostępu do schowka';
        setTimeout(() => { btnImport.textContent = 'IMPORTUJ (ze schowka)'; }, 1500);
      });
    });
    wrap.appendChild(btnImport);

    // Reset
    const btnReset = this._el('button', {
      textContent: 'RESET DO DOMYŚLNYCH',
      style: btnStyle.replace(THEME.border, THEME.dangerDim),
    });
    btnReset.addEventListener('click', () => {
      resetTheme();
      this._syncAll();
    });
    wrap.appendChild(btnReset);

    return wrap;
  }

  // ── Synchronizacja inputów z aktualnym THEME ──────────────────

  _syncAll() {
    for (const [key, controls] of Object.entries(this._inputs)) {
      if (controls.picker) {
        controls.picker.value = THEME[key];
        controls.text.value = THEME[key];
      } else if (controls.slider) {
        controls.slider.value = THEME[key];
        controls.valSpan.textContent = `${THEME[key]}px`;
      } else if (controls.text) {
        controls.text.value = THEME[key];
      }
    }
  }

  // ── Helper: tworzenie elementu DOM ────────────────────────────

  _el(tag, props = {}) {
    const el = document.createElement(tag);
    if (props.style) el.style.cssText = props.style;
    if (props.textContent !== undefined) el.textContent = props.textContent;
    return el;
  }
}
