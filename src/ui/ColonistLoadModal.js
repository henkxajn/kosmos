// ColonistLoadModal — modal DOM do załadunku kolonistów na statek
//
// Gracz wybiera ile POPów załadować (1 do colonistCapacity).
// Zwraca Promise<number> — ilość załadowanych (0 = anulowano).

import { THEME } from '../config/ThemeConfig.js';
import { t } from '../i18n/i18n.js';

let _instance = null;

export class ColonistLoadModal {
  constructor() {
    this._el = null;
    this._resolve = null;
  }

  /**
   * Pokaż modal i zwróć Promise<number> (ile POPów załadować, 0 = anulowano).
   * @param {number} maxColonists — max pojemność statku (colonistCapacity)
   * @param {number} freePops — wolne POPy w kolonii
   * @returns {Promise<number>}
   */
  show(maxColonists, freePops) {
    return new Promise(resolve => {
      this._resolve = resolve;
      const max = Math.min(maxColonists, Math.floor(freePops));
      if (max <= 0) { resolve(0); return; }

      this._createDOM(max);
    });
  }

  _createDOM(max) {
    // Usuń stary modal
    if (this._el) { this._el.remove(); this._el = null; }

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.7); z-index: 200; display: flex;
      align-items: center; justify-content: center;
      font-family: 'Courier New', monospace;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: rgba(8,16,24,0.96); border: 1px solid ${THEME.accent};
      border-radius: 6px; padding: 20px 28px; min-width: 300px; max-width: 400px;
      color: ${THEME.textPrimary}; text-align: center;
    `;

    // Tytuł
    const title = document.createElement('div');
    title.textContent = t('colonistModal.title');
    title.style.cssText = `font-size: 14px; font-weight: bold; color: ${THEME.accent}; margin-bottom: 16px;`;
    panel.appendChild(title);

    // Info
    const info = document.createElement('div');
    info.textContent = t('colonistModal.info', max);
    info.style.cssText = `font-size: 11px; color: ${THEME.textSecondary}; margin-bottom: 12px;`;
    panel.appendChild(info);

    // Wartość
    let value = Math.min(2, max); // domyślnie 2 POPy (lub max)
    const valueEl = document.createElement('div');
    valueEl.textContent = `${value} POP`;
    valueEl.style.cssText = `font-size: 24px; font-weight: bold; color: ${THEME.accent}; margin-bottom: 8px;`;
    panel.appendChild(valueEl);

    // Slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = String(max);
    slider.value = String(value);
    slider.style.cssText = `width: 100%; margin-bottom: 16px; accent-color: ${THEME.accent};`;
    slider.oninput = () => {
      value = parseInt(slider.value);
      valueEl.textContent = `${value} POP`;
    };
    panel.appendChild(slider);

    // Przyciski
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 12px; justify-content: center;';

    const btnOk = document.createElement('button');
    btnOk.textContent = t('colonistModal.confirm');
    btnOk.style.cssText = `
      padding: 6px 20px; background: rgba(0,255,180,0.15);
      border: 1px solid ${THEME.accent}; color: ${THEME.accent};
      font-family: inherit; font-size: 12px; cursor: pointer; border-radius: 3px;
    `;
    btnOk.onclick = () => { this._close(); this._resolve?.(value); };

    const btnCancel = document.createElement('button');
    btnCancel.textContent = t('colonistModal.cancel');
    btnCancel.style.cssText = `
      padding: 6px 20px; background: rgba(255,51,68,0.1);
      border: 1px solid ${THEME.danger}; color: ${THEME.danger};
      font-family: inherit; font-size: 12px; cursor: pointer; border-radius: 3px;
    `;
    btnCancel.onclick = () => { this._close(); this._resolve?.(0); };

    btnRow.appendChild(btnOk);
    btnRow.appendChild(btnCancel);
    panel.appendChild(btnRow);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    this._el = overlay;

    // Kliknięcie poza panel = anuluj
    overlay.onclick = (e) => {
      if (e.target === overlay) { this._close(); this._resolve?.(0); }
    };
  }

  _close() {
    if (this._el) { this._el.remove(); this._el = null; }
  }

  static getInstance() {
    if (!_instance) _instance = new ColonistLoadModal();
    return _instance;
  }
}
