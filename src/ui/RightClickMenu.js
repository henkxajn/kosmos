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
import { outOfCameraFrame, fleetOffendersOutOfFrame, describeOrderFail } from '../utils/CameraFrame.js';
import { t } from '../i18n/i18n.js';

// ── Leg D (Finding 255, noga MAPY) — typy rozkazu, których cel POCHODZI Z KLIKANEGO
//    PUNKTU, czyli z ramki KAMERY. Tylko dla nich wolno pytać „czy statek jest w tej
//    ramce" — patrz komentarz przy `_outOfCameraFrame`.
//    `dock` jest tu, bo `MovementOrderSystem._issueDock` ZRZUCA `targetBodyId` przed
//    `_issueMoveToPoint` (Finding 256), więc bramka W3-4b nigdy tego celu nie ogląda.
const POINT_SOURCED_ORDER_TYPES = new Set(['moveToPoint', 'dock']);

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

    const um = window.KOSMOS?.uiManager;
    const selectedVesselId = um?.getSelectedVesselId?.() ?? null;
    const selectedFleetId = um?.getSelectedFleetId?.() ?? null;
    const options = buildMenuOptions(target, { vesselId: selectedVesselId, fleetId: selectedFleetId });
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

  // P2 — Build fleet spec z opcji menu + targetu. Analog buildOrderSpec
  // ale bez vessel ID (fleet jest kolektywnym issuerem). targetEntityId
  // pochodzi z target.entityId; targetPoint z target.planet.x/y lub worldPoint.
  _buildFleetSpec(option, target) {
    if (!option?.orderType || !target?.type) return null;
    const orderType = option.orderType;
    if (orderType === 'moveToPoint') {
      // Planet target — body.x/body.y
      if (target.type === 'planet' && target.planet
          && typeof target.planet.x === 'number'
          && typeof target.planet.y === 'number') {
        return { type: 'moveToPoint', targetPoint: { x: target.planet.x, y: target.planet.y } };
      }
      // Empty target — worldPoint może być 3D ({x,y,z}, XZ plane) lub 2D ({x,y}).
      const wp = target.worldPoint;
      if (wp && typeof wp.x === 'number' && Number.isFinite(wp.x)) {
        const yVal = typeof wp.z === 'number' ? wp.z : wp.y;
        if (typeof yVal === 'number' && Number.isFinite(yVal)) {
          return { type: 'moveToPoint', targetPoint: { x: wp.x, y: yVal } };
        }
      }
      return null;
    }
    if (orderType === 'pursue' || orderType === 'intercept' || orderType === 'engage') {
      if (!target.entityId) return null;
      return { type: orderType, targetEntityId: target.entityId };
    }
    return null;
  }

  // ── Termin ramki KAMERY (Finding 255) — PREDYKAT MIESZKA W `utils/CameraFrame.js` ────────
  // Leg D (`92e075f`) trzymał `_outOfCameraFrame` / `_fleetOffendersOutOfFrame` /
  // `_describeFail` TUTAJ, bo miał jednego konsumenta. Wiersze 8/9 dokładają dwóch
  // (`FleetManagerOverlay._handleFleetMoveToPoint`, `FleetCommandPanel._armMovePicker`),
  // więc D-89b wyprowadziło je do wspólnego modułu — trzy kopie jednego predykatu to
  // dokładnie mina „nieutwardzonego bliźniaka". PEŁNE UZASADNIENIE (dlaczego u wołającego,
  // dlaczego NIE w `issueFleetOrder`, dlaczego fail-open na warpie) — w nagłówku
  // `src/utils/CameraFrame.js`. Tutaj zostaje WYŁĄCZNIE zakres typów:
  // `POINT_SOURCED_ORDER_TYPES` (góra pliku) — bo to własność MENU, nie predykatu.

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

    // P2 — Fleet order dispatch (action === 'issueFleetOrder').
    if (option.action === 'issueFleetOrder' && option.orderType) {
      const fsUm = window.KOSMOS?.uiManager;
      const fleetId = fsUm?.getSelectedFleetId?.() ?? null;
      const fSys = window.KOSMOS?.fleetSystem;
      if (!fleetId || !fSys?.issueFleetOrder) {
        console.warn('[RightClickMenu] fleet order: brak selectedFleetId lub FleetSystem');
        return;
      }
      const spec = this._buildFleetSpec(option, target);
      if (!spec) {
        console.warn('[RightClickMenu] buildFleetSpec returned null');
        return;
      }
      // Leg D / D-LD2 — CAŁA flota odmawia, gdy CHOĆBY JEDEN członek jest poza ramką
      //   kamery. Wysłanie samego podzbioru złamałoby po cichu kontrakt rozkazu flotowego
      //   (zsynchronizowany przylot: `FleetSystem` liczy `_arrivalSyncYear` ze WSZYSTKICH
      //   eligible), a `issueFleetOrder` fan-outuje do wszystkich i nie przyjmuje listy
      //   wyjątków — per-członkowa odmowa wymagałaby albo nowego pola w `spec`, albo
      //   terminu w fan-oucie, który regresowałby „Powrót do bazy" (patrz `_outOfCameraFrame`).
      // ⚠ Raport nazywa KAŻDEGO winowajcę. Kanał `res.rejected?.[0]` (niżej) pokazuje
      //   TYLKO pierwszy powód, więc tutaj go nie używamy.
      if (POINT_SOURCED_ORDER_TYPES.has(option.orderType)) {
        const offenders = fleetOffendersOutOfFrame(fleetId);
        if (offenders.length > 0) {
          window.KOSMOS?.eventLogSystem?.push?.({
            text: t('vessel.orderNoneMoved', offenders.map(describeOrderFail).join(', ')),
            channel: 'fleet',
            severity: 'warn',
            entityRef: offenders[0].vesselId,
          });
          return;
        }
      }
      const res = fSys.issueFleetOrder(fleetId, spec);
      if (!res?.ok) {
        const reason = res?.rejected?.[0]?.reason ?? res?.reason ?? 'unknown';
        window.KOSMOS?.eventLogSystem?.push?.({
          text: t('log.el.orderRejected', reason),
          channel: 'fleet', severity: 'warn',
        });
      }
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

    if (!mos?.issueOrder) {
      console.warn('[RightClickMenu] MovementOrderSystem niedostępny — użyj enableMovementOrders()');
      return;
    }

    // Slice 8 — dispatch do CAŁEGO zbioru zaznaczonych (multi-select). W single-select
    // getSelectedVesselIds() = [lead], więc ścieżka identyczna jak wcześniej. Per-vessel
    // buildOrderSpec/issueOrder; vessele odrzucone (np. engage bez broni) pomijane.
    let ids = um?.getSelectedVesselIds ? um.getSelectedVesselIds() : [];
    if (ids.length === 0 && vesselId) ids = [vesselId];
    if (ids.length === 0) {
      console.warn('[RightClickMenu] brak zaznaczonego statku do rozkazu');
      return;
    }

    let anyOk = false;
    const fails = [];  // [{ vesselId, reason }] — WSZYSTKIE pominięte (nie tylko pierwszy)
    // Leg D — bramka WYŁĄCZNIE dla rozkazów, których cel pochodzi z klikanego punktu.
    // Odmowa wpada do `fails[]`, więc raport per-statek niżej niesie ją ZA DARMO.
    const pointSourced = POINT_SOURCED_ORDER_TYPES.has(option.orderType);
    for (const vid of ids) {
      const frameFail = pointSourced ? outOfCameraFrame(vid) : null;
      if (frameFail) {
        fails.push({ vesselId: vid, reason: frameFail });
        continue;
      }
      const built = buildOrderSpec(option, target, vid);
      if (!built.ok) {
        fails.push({ vesselId: vid, reason: built.reason });
        continue;
      }
      // Zunifikowana ścieżka rozkazu ruchu przez OrderService (forward do MOS.issueOrder).
      const os = window.KOSMOS?.orderService;
      const result = os ? os.issueMove(vid, built.spec) : mos.issueOrder(vid, built.spec);
      if (result?.ok) anyOk = true;
      else {
        fails.push({ vesselId: vid, reason: result?.reason });
        console.warn(`[RightClickMenu] MOS.issueOrder failed (${option.orderType}, ${vid}):`, result?.reason);
      }
    }

    // Feedback: pokaż KAŻDY pominięty statek z powodem — także gdy część floty poleciała.
    // Wcześniej log leciał wyłącznie gdy NIC się nie udało → przy „2 z 3 poleciały" gracz
    // nie wiedział, czemu trzeci (np. USS Enterprise bez uzbrojenia) został na orbicie.
    if (fails.length > 0) {
      const skipped = fails.map(describeOrderFail).join(', ');
      window.KOSMOS?.eventLogSystem?.push({
        text: anyOk
          ? t('vessel.orderPartial', ids.length - fails.length, ids.length, skipped)
          : t('vessel.orderNoneMoved', skipped),
        channel: 'fleet',
        severity: 'warn',
        entityRef: fails[0].vesselId,
      });
    }
  }
}

