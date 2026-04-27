// ── M3 P1.1 — RightClickMenu (DOM popup) ────────────────────────────
// Context menu dla prawego kliknięcia. Self-managed DOM element (nie
// canvas-based jak OverlayManager-owned overlays — vide ModalInput.js
// jako wzór). Subskrybuje EventBus.ui:rightClickMenuOpened/Closed.
//
// P1.1 scope:
//  - render listy opcji z buildMenuOptions(target, selectedVesselId)
//  - boundary check (flip jeśli wystaje poza viewport)
//  - click outside zamyka menu
//  - kliknięcie opcji loguje placeholder ("Order action TODO P1.3")
// P1.2 doda real mouse → menu (raycaster + sprite pick).
// P1.3 doda real wiring do MOS.issueOrder.

import EventBus from '../core/EventBus.js';
import { THEME } from '../config/ThemeConfig.js';
import { buildMenuOptions } from '../data/RightClickMenuOptions.js';

export class RightClickMenu {
  constructor() {
    this._isOpen = false;
    this._element = null;
    this._onDocumentClick = null;
    this._target = null;

    EventBus.on('ui:rightClickMenuOpened', ({ target, screenPoint }) => {
      this.show(target, screenPoint);
    });
    EventBus.on('ui:rightClickMenuClosed', () => {
      this.hide();
    });
  }

  show(target, screenPoint) {
    this.hide();  // wyczyść poprzednie menu (re-open)
    this._target = target;

    const selectedVesselId = window.KOSMOS?.uiManager?.getSelectedVesselId() ?? null;
    const options = buildMenuOptions(target, selectedVesselId);
    if (options.length === 0) return;  // brak opcji → nie pokazuj

    const menu = document.createElement('div');
    menu.className = 'kosmos-rcm';
    menu.style.cssText = `
      position: fixed;
      left: ${screenPoint.x + 5}px;
      top: ${screenPoint.y + 5}px;
      background: ${THEME.bgPrimary};
      border: 1px solid ${THEME.border};
      border-radius: 4px;
      padding: 4px 0;
      z-index: 9999;
      font-family: ${THEME.fontFamily};
      font-size: ${THEME.fontSizeNormal}px;
      min-width: 180px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.6);
      user-select: none;
    `;

    options.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'kosmos-rcm-item';
      item.style.cssText = `
        padding: 6px 12px;
        cursor: ${opt.enabled ? 'pointer' : 'not-allowed'};
        color: ${opt.enabled ? THEME.textPrimary : THEME.textDim};
        opacity: ${opt.enabled ? 1 : 0.5};
        display: flex;
        gap: 8px;
        align-items: center;
        white-space: nowrap;
      `;
      item.textContent = `${opt.icon}  ${opt.labelPL}`;
      if (opt.disabledReason) item.title = opt.disabledReason;

      if (opt.enabled) {
        item.addEventListener('mouseenter', () => {
          item.style.background = THEME.accentDim;
        });
        item.addEventListener('mouseleave', () => {
          item.style.background = 'transparent';
        });
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this._handleOptionClick(opt, target);
        });
      }

      menu.appendChild(item);
    });

    document.body.appendChild(menu);
    this._element = menu;
    this._isOpen = true;

    // Boundary flip — po insertcie zmierz wymiary i ewentualnie przesuń.
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${Math.max(0, screenPoint.x - rect.width - 5)}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${Math.max(0, screenPoint.y - rect.height - 5)}px`;
    }

    // Click outside → zamknij. Delay przez setTimeout(0) — bez tego sam
    // click otwierający (np. kontrol z keyboard shortcut) złapałby się tu.
    setTimeout(() => {
      this._onDocumentClick = () => this.hide();
      document.addEventListener('click', this._onDocumentClick, { once: true });
    }, 0);
  }

  hide() {
    if (!this._isOpen) return;
    if (this._element) {
      this._element.remove();
      this._element = null;
    }
    if (this._onDocumentClick) {
      document.removeEventListener('click', this._onDocumentClick);
      this._onDocumentClick = null;
    }
    this._isOpen = false;
    this._target = null;
  }

  isOpen() {
    return this._isOpen;
  }

  _handleOptionClick(option, target) {
    this.hide();
    // P1.1 placeholder — logiczna routing do MOS.issueOrder w P1.3.
    console.log('[RightClickMenu] Option clicked:', option.id, 'target:', target);
    console.warn('[RightClickMenu] Order action TODO P1.3 — wiring to MOS.issueOrder');
  }
}
