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
import { GAME_CONFIG } from '../config/GameConfig.js';
import { buildOrderSpec, buildPatrolFromWaypoints } from '../utils/OrderDispatcher.js';
import { t } from '../i18n/i18n.js';

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
      // M4 P1.5 — warning suffix (np. ⚠) dla enabled options z warning code.
      const warningPrefix = opt.warning ? '⚠ ' : '';
      item.textContent = `${warningPrefix}${opt.icon}  ${opt.labelPL}`;
      if (opt.disabledReason) item.title = opt.disabledReason;

      // M3 P1.5 — universal tooltip dla disabled options. data-tooltip
      // pattern (Filip D6=α) — Tooltip.js global mouseover/mouseout listener
      // pickup'uje atrybut. Pre-existing P1.3 known issue "out of range" UI feedback.
      if (!opt.enabled) {
        const reason = opt.disabledReason ?? 'requires_selection';
        // Mapuj kody na klucze tłumaczeń; fallback na surowy reason
        let tipKey;
        if (reason === 'requires_selection' || /selection|wybierz/i.test(reason)) {
          tipKey = 'tooltip.menu.requiresSelection';
        } else if (/range|zasięg/i.test(reason)) {
          tipKey = 'tooltip.menu.outOfRange';
        } else {
          tipKey = null;
        }
        const tipText = tipKey ? t(tipKey) : reason;
        item.setAttribute('data-tooltip', tipText);
      } else if (opt.warning) {
        // M4 P1.5 — enabled option z warning. Tooltip pokazuje powód ostrzeżenia,
        // ale opcja jest klikalna (player może świadomie wykonać akcję).
        let tipKey = null;
        if (opt.warning === 'no_weapons') tipKey = 'tooltip.menu.noWeapons';
        const tipText = tipKey ? t(tipKey) : opt.warning;
        item.setAttribute('data-tooltip', tipText);
        // Dyskretna wizualna sygnalizacja warning — żółtawy tinit textu.
        item.style.color = THEME.warning ?? THEME.textPrimary;
      }

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

    // FEATURES gate (D1) — rollback safety. Filip toggle false → placeholder
    // behavior (P1.1/P1.2 console.log) bez restartu sesji.
    if (!GAME_CONFIG.FEATURES?.m3OrdersInteractive) {
      console.log('[RightClickMenu] Option (placeholder, FEATURES off):', option.id, 'target:', target);
      return;
    }

    // POI actions — listener w GameScene._setupPOICreateFlow (M3 P2.3).
    if (option.action === 'openCreatePOIModal') {
      // Legacy entry — pozostawiony dla future compat. P2.3 default flow
      // używa openCreatePOIPicker (per-type), ale ui:openPOIModal listener
      // honoruje też mode='create' bez poiType (waypoint default).
      EventBus.emit('ui:openPOIModal', { mode: 'create', target });
      return;
    }
    if (option.action === 'openEditPOIModal') {
      EventBus.emit('ui:openPOIModal', { mode: 'edit', poiId: target.entityId });
      return;
    }
    if (option.action === 'deletePOI') {
      const poiId = target.entityId;
      const reg = window.KOSMOS?.poiRegistry;
      if (poiId && reg?.deletePOI) reg.deletePOI(poiId);
      else console.warn('[RightClickMenu] deletePOI: brak poiRegistry lub poiId');
      return;
    }
    // M3 P2.3 — Create POI picker mode. PPM worldPoint jest 1st click dla
    // single-click types (waypoint/picket/rally/ambush) → fast path do modal'u.
    // Patrol type startuje picker (multi-click ≥2 + ENTER).
    if (option.action === 'openCreatePOIPicker') {
      const poiType = option.poiType ?? 'waypoint';
      const worldPoint = target?.worldPoint ?? null;
      EventBus.emit('ui:openCreatePOIPicker', { poiType, worldPoint });
      return;
    }

    // Order actions — wymagają orderType.
    if (option.action !== 'issueOrder' || !option.orderType) {
      console.warn('[RightClickMenu] Unknown action:', option.action);
      return;
    }

    const um = window.KOSMOS?.uiManager;
    const vesselId = um?.getSelectedVesselId?.() ?? null;
    const mos = window.KOSMOS?.movementOrderSystem;

    // Specjalna ścieżka: patrol z empty target (option.id='patrolManual') →
    //   uruchom picker mode dla waypointów. POI patrol (target.type==='poi')
    //   leci klasycznie przez buildOrderSpec → MOS używa POI.waypoints.
    if (option.orderType === 'patrol' && target.type !== 'poi') {
      if (!um || !vesselId) {
        console.warn('[RightClickMenu] patrol picker: brak uiManager lub selectedVesselId');
        return;
      }
      um.setPickerMode('patrolWaypoints', (waypoints) => {
        if (!waypoints) return;  // cancelled
        const built = buildPatrolFromWaypoints(waypoints);
        if (!built.ok) {
          console.warn(`[RightClickMenu] buildPatrolFromWaypoints: ${built.reason}`);
          return;
        }
        const r = window.KOSMOS?.movementOrderSystem?.issueOrder?.(vesselId, built.spec);
        if (!r || r.ok === false) {
          console.warn(`[RightClickMenu] patrol issueOrder failed:`, r);
        }
      }, { vesselId, source: 'rightClickMenu_patrolManual' });
      return;
    }

    // Standard issue: build spec → MOS.issueOrder(vesselId, spec).
    const built = buildOrderSpec(option, target, vesselId);
    if (!built.ok) {
      console.warn(`[RightClickMenu] buildOrderSpec rejected: ${built.reason}`);
      return;
    }
    if (!mos?.issueOrder) {
      console.warn('[RightClickMenu] MovementOrderSystem niedostępny — użyj enableMovementOrders()');
      return;
    }
    const result = mos.issueOrder(vesselId, built.spec);
    if (!result?.ok) {
      console.warn(`[RightClickMenu] MOS.issueOrder failed (${option.orderType}):`, result?.reason);
    }
  }
}
