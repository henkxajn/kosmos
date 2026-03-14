// ThemeOverlay — panel debug motywu (F7)
//
// DOM overlay po prawej stronie ekranu (320px).
// Color pickery + presety + eksport/import/reset.
// Gra działa normalnie po lewej stronie.

import { THEME, DEFAULT_THEME, PRESET_THEMES, applyTheme, applyPreset, saveTheme, resetTheme, hexToRgb } from '../config/ThemeConfig.js';
import { t } from '../i18n/i18n.js';

// ── Sekcje edytora ──────────────────────────────────────────────

// Sekcje budowane dynamicznie — etykiety z i18n
function _getSections() {
  return [
    {
      label: t('theme.surfaces'),
      keys: ['bgPrimary', 'bgSecondary', 'bgTertiary'],
      labels: { bgPrimary: t('theme.bgPrimary'), bgSecondary: t('theme.bgSecondary'), bgTertiary: t('theme.bgTertiary') },
    },
    {
      label: t('theme.borders'),
      keys: ['border', 'borderLight', 'borderActive'],
      labels: { border: t('theme.border'), borderLight: t('theme.borderLight'), borderActive: t('theme.borderActive') },
    },
    {
      label: t('theme.text'),
      keys: ['textPrimary', 'textSecondary', 'textLabel', 'textDim', 'textHeader', 'accent'],
      labels: {
        textPrimary: t('theme.textPrimary'), textSecondary: t('theme.textSecondary'), textLabel: t('theme.textLabel'),
        textDim: t('theme.textDim'), textHeader: t('theme.textHeader'), accent: t('theme.accent'),
      },
    },
    {
      label: t('theme.statuses'),
      keys: ['success', 'successDim', 'danger', 'dangerDim', 'warning', 'yellow', 'info', 'purple', 'mint'],
      labels: {
        success: t('theme.success'), successDim: t('theme.successDim'), danger: t('theme.danger'), dangerDim: t('theme.dangerDim'),
        warning: t('theme.warning'), yellow: t('theme.yellow'), info: t('theme.info'), purple: t('theme.purple'), mint: t('theme.mint'),
      },
    },
  ];
}

function _getFontKeys() {
  return [
    { key: 'fontSizeSmall',  label: t('theme.small'),  min: 6, max: 16 },
    { key: 'fontSizeNormal', label: t('theme.normal'), min: 7, max: 18 },
    { key: 'fontSizeMedium', label: t('theme.medium'), min: 8, max: 20 },
    { key: 'fontSizeLarge',  label: t('theme.large'),  min: 10, max: 24 },
    { key: 'fontSizeTitle',  label: t('theme.title'), min: 12, max: 30 },
  ];
}

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
      boxShadow: '-4px 0 20px rgba(2,4,5,0.65)',
      padding: '8px',
      boxSizing: 'border-box',
    });

    // Nagłówek
    const header = this._el('div', {
      textContent: t('theme.header'),
      style: `color:${THEME.accent};font-size:14px;font-weight:bold;text-align:center;margin-bottom:8px;padding:6px 0;border-bottom:1px solid ${THEME.border};letter-spacing:2px;`,
    });
    root.appendChild(header);

    // Presety
    root.appendChild(this._buildPresets());

    // Sekcje kolorów
    for (const section of _getSections()) {
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

    // Podział presetów na klasyczne i terminalowe
    const classic  = [];
    const terminal = [];
    for (const [name, preset] of Object.entries(PRESET_THEMES)) {
      if (name.startsWith('terminal_')) {
        terminal.push([name, preset]);
      } else if (!name.startsWith('ss_') && !name.startsWith('ambient_')) {
        classic.push([name, preset]);
      }
    }

    // Nazwy wyświetlane (ładniejsze)
    const DISPLAY = {
      default: 'Default', cyberpunk: 'Cyberpunk', arctic: 'Arctic', amber: 'Amber',
      emerald: 'Emerald', crimson: 'Crimson', midnight: 'Midnight', kosmos: 'Kosmos', solar: 'Solar',
      neon_cyber: '⚡ Neon Cyber',
      terminal_amber: '🖥 Amber', terminal_red: '🖥 Red',
      terminal_green: '🖥 Green', terminal_gold: '🖥 Gold',
    };

    // — Sekcja: Klasyczne —
    const classicLabel = this._el('div', {
      textContent: t('theme.classic'),
      style: `color:${THEME.textHeader};font-size:9px;margin-bottom:4px;font-weight:bold;`,
    });
    wrap.appendChild(classicLabel);

    const classicRow = this._el('div', { style: 'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;' });
    for (const [name, preset] of classic) {
      classicRow.appendChild(this._presetBtn(name, preset, DISPLAY[name] || name));
    }
    wrap.appendChild(classicRow);

    // — Sekcja: Terminal (CRT) —
    const termLabel = this._el('div', {
      textContent: t('theme.terminal'),
      style: `color:${THEME.textHeader};font-size:9px;margin-bottom:4px;font-weight:bold;`,
    });
    wrap.appendChild(termLabel);

    const termRow = this._el('div', { style: 'display:flex;gap:4px;flex-wrap:wrap;' });
    for (const [name, preset] of terminal) {
      termRow.appendChild(this._presetBtn(name, preset, DISPLAY[name] || name));
    }
    wrap.appendChild(termRow);

    return wrap;
  }

  _presetBtn(name, preset, displayName) {
    const btn = this._el('button', {
      textContent: displayName,
      style: `
        background:${THEME.bgTertiary};border:1px solid ${THEME.border};border-radius:3px;
        color:${THEME.textPrimary};font-family:monospace;font-size:9px;padding:4px 10px;cursor:pointer;
      `,
    });
    btn.addEventListener('click', () => {
      applyPreset(preset);
      this._syncAll();
      saveTheme();
    });
    btn.addEventListener('mouseenter', () => { btn.style.borderColor = THEME.borderActive; });
    btn.addEventListener('mouseleave', () => { btn.style.borderColor = THEME.border; });
    return btn;
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
    const headerLabel = this._el('span', { textContent: t('theme.fonts') });
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
      textContent: t('theme.fontFamily'),
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
    for (const { key, label, min, max } of _getFontKeys()) {
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
    const btnExport = this._el('button', { textContent: t('theme.export'), style: btnStyle });
    btnExport.addEventListener('click', () => {
      const data = {};
      for (const key of Object.keys(DEFAULT_THEME)) {
        data[key] = THEME[key];
      }
      navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
        btnExport.textContent = t('theme.exported');
        setTimeout(() => { btnExport.textContent = t('theme.export'); }, 1500);
      }).catch(() => {
        btnExport.textContent = t('theme.exportError');
        setTimeout(() => { btnExport.textContent = t('theme.export'); }, 1500);
      });
    });
    wrap.appendChild(btnExport);

    // Import
    const btnImport = this._el('button', { textContent: t('theme.import'), style: btnStyle });
    btnImport.addEventListener('click', () => {
      navigator.clipboard.readText().then(text => {
        try {
          const data = JSON.parse(text);
          applyTheme(data);
          this._syncAll();
          saveTheme();
          btnImport.textContent = t('theme.imported');
        } catch {
          btnImport.textContent = t('theme.importError');
        }
        setTimeout(() => { btnImport.textContent = t('theme.import'); }, 1500);
      }).catch(() => {
        btnImport.textContent = t('theme.importNoAccess');
        setTimeout(() => { btnImport.textContent = t('theme.import'); }, 1500);
      });
    });
    wrap.appendChild(btnImport);

    // Reset
    const btnReset = this._el('button', {
      textContent: t('theme.reset'),
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
