// ClickIntentLogic — ARKUSZ UI, U1 (D-UI-5; decyzja 2 a–d; UI_PLAN §4.2, §7.7–§7.9): JEDNA reguła kliku dla mapy 3D,
// outlinerów, etykiet mapy i Doku taktycznego.
//   1. klik w obiekt (statek / ciało / stacja)        → zaznaczenie + jego okno, kamera STOI;
//   2. klik w TEN SAM obiekt (bieżące zaznaczenie)    → focus kamery.
//   Obiekt z INNEGO układu (§7.8): 1. klik bez przełączania układu, 2. klik = przełączenie układu + focus.
//   Wrogi statek (decyzja 2d): 1. klik = ping celu, 2. klik = focus. Gwiazda: focus = domyślny widok układu
//   (`ThreeRenderer.resetToSystemView` → kadr `frameSystem`), nigdy bliżej (wymóg z bramki U0, Finding 473).
//   „Drugi klik”, nie dwuklik z oknem czasu: „bieżące zaznaczenie” czytane z ISTNIEJĄCEGO stanu (§7.7) — lider
//   zaznaczenia przy N == 1, zaznaczone ciało (karta), stacja w otwartym StationPanel, zaznaczona flota; wróg —
//   ostatni ping (`ThreeRenderer._pingedEnemyId`, jedyne nowe pole: wroga nie da się zaznaczyć). CTRL+klik — bez zmian
//   (przełącza zbiór; obsługuje go wołający, reguła go nie dotyczy).
//
// Czysty: bez `window` i bez EventBusa. Stan zaznaczenia czyta `readClickSelection(K)` z JAWNIE przekazanego
// `window.KOSMOS`, a wykonanie (`applyClickIntent`) dostaje zależności argumentem — keeper woła wszystko pod node.
// Jedyny import — kanon układu encji (`systemIdOf`: brak pola = `sys_home`, `null` = tranzyt między układami).

import { systemIdOf } from '../utils/SystemScope.js';

export const CLICK_INTENT = Object.freeze({
  SELECT:       'select',
  FOCUS:        'focus',
  SWITCH_FOCUS: 'switchSystem+focus',
});

/**
 * Klucz celu kliku — `typ:id`; klaster statków (plakietka mapy) — `vessels:` + posortowane id.
 * @param {{type:string, id?:string, ids?:string[]}} target
 * @returns {string|null}
 */
export function clickTargetKey(target) {
  if (!target?.type) return null;
  if (target.type === 'vessels') {
    const ids = Array.isArray(target.ids) ? target.ids.filter(i => i != null).map(String) : [];
    return ids.length ? `vessels:${[...ids].sort().join(',')}` : null;
  }
  return target.id == null ? null : `${target.type}:${target.id}`;
}

/**
 * Bieżące zaznaczenie jako zbiór kluczy celu (§7.7). Statek: lider przy N == 1; klaster: dokładnie ten zbiór.
 * @param {object} sel — wynik `readClickSelection`
 * @returns {Set<string>}
 */
export function selectionKeys(sel) {
  const keys = new Set();
  const ids = Array.isArray(sel?.vesselIds) ? sel.vesselIds.filter(i => i != null) : [];
  if (ids.length === 1 && sel?.leadId != null && String(ids[0]) === String(sel.leadId)) keys.add(`vessel:${sel.leadId}`);
  const k = clickTargetKey({ type: 'vessels', ids });
  if (k) keys.add(k);
  if (sel?.entityId != null)      keys.add(`body:${sel.entityId}`);
  if (sel?.stationId != null)     keys.add(`station:${sel.stationId}`);
  if (sel?.pingedEnemyId != null) keys.add(`enemy:${sel.pingedEnemyId}`);
  if (sel?.fleetId != null)       keys.add(`fleet:${sel.fleetId}`);
  return keys;
}

/**
 * Intencja kliku (D-UI-5): obiekt spoza bieżącego zaznaczenia → `select`; bieżące zaznaczenie → `focus`, a gdy leży
 * w INNYM układzie niż oglądany → `switchSystem+focus`. Układ nieznany po którejkolwiek stronie (`null` — tranzyt
 * warp) → `focus` bez przełączania.
 * @returns {'select'|'focus'|'switchSystem+focus'|null}
 */
export function resolveClickIntent(target, sel) {
  const key = clickTargetKey(target);
  if (!key) return null;
  if (!selectionKeys(sel).has(key)) return CLICK_INTENT.SELECT;
  const sys = target.systemId ?? null;
  const act = sel?.activeSystemId ?? null;
  if (sys != null && act != null && sys !== act) return CLICK_INTENT.SWITCH_FOCUS;
  return CLICK_INTENT.FOCUS;
}

/**
 * Stan zaznaczenia z ISTNIEJĄCYCH pól gry (bez nowego stanu poza pingiem wroga).
 * @param {object} K — `window.KOSMOS` (przekazany jawnie)
 */
export function readClickSelection(K) {
  const um = K?.uiManager ?? null;
  const ids = um?.getSelectedVesselIds?.() ?? [];
  const sp = K?.stationPanel ?? null;
  const stationOpen = !!(sp?.visible && !sp?._float?.minimized && sp?._stationId != null);
  return {
    vesselIds:     [...ids],
    leadId:        um?.getSelectedVesselId?.() ?? null,
    entityId:      um?._selectedEntity?.id ?? null,
    stationId:     stationOpen ? sp._stationId : null,
    fleetId:       um?.getSelectedFleetId?.() ?? null,
    pingedEnemyId: K?.threeRenderer?._pingedEnemyId ?? null,
    activeSystemId: K?.activeSystemId ?? K?.starSystemManager?.activeSystemId ?? 'sys_home',
  };
}

// ── Cele kliku — jedno źródło układu celu (kanon `systemIdOf`) ────────────────────────────────────────────────────
export const vesselTarget  = (id, vessel) => ({ type: 'vessel', id, systemId: systemIdOf(vessel) });
export const enemyTarget   = (id, vessel) => ({ type: 'enemy', id, systemId: systemIdOf(vessel) });
export const vesselsTarget = (ids, systemId) => ({ type: 'vessels', ids: [...(ids ?? [])], id: ids?.[0] ?? null, systemId: systemId ?? null });
export const stationTarget = (id, station, fallbackSystemId = null) => ({ type: 'station', id, systemId: station ? systemIdOf(station) : fallbackSystemId });
export const bodyTarget    = (entity) => ({ type: 'body', id: entity?.id ?? null, entity, systemId: systemIdOf(entity) });
/**
 * ARKUSZ UI U3-2 (D-UI-7, §7.11) — węzeł floty w prawym outlinerze: układ celu = układ PROWADZĄCEGO (pierwszy żywy
 * członek — decyzja 6 (a)); bez prowadzącego układ nieznany (focus bez przełączania).
 */
export const fleetTarget   = (id, lead) => ({ type: 'fleet', id, leadId: lead?.id ?? null, systemId: lead ? systemIdOf(lead) : null });

/**
 * Wykonanie intencji — jedno miejsce dla wszystkich powierzchni.
 *   select → zaznaczenie + okno (statek: `setSelectedVesselId`; klaster: lider + reszta zbioru; stacja:
 *            `station:selected`; ciało: `body:selected { focus: false }`; wróg: ping celu), BEZ polecenia kamery;
 *   focus  → kamera (statek / klaster / wróg: `vessel:focus` lidera; stacja: `station:focus`; ciało:
 *            `body:selected { focus: true }`; gwiazda: `resetToSystemView`); zaznaczenie bez zmian;
 *   switchSystem+focus → najpierw `switchActiveSystem(układ celu)` (odmowa = nic), potem jak `focus`.
 *   Flota (U3-2, §7.11): select → menu floty (`setSelectedFleetId`) + mutex — zaznaczenie statków zdjęte (jak klik floty
 *   w Dowództwie); focus → `vessel:focus` prowadzącego.
 * @param {object} target
 * @param {string|null} intent
 * @param {{K?:object, emit?:Function}} env — K = `window.KOSMOS`, emit = `EventBus.emit`
 * @returns {string|null} wykonana intencja (wołający dokłada sygnał swojej powierzchni, np. ping w Doku)
 */
export function applyClickIntent(target, intent, { K = null, emit = null } = {}) {
  if (!target || !intent) return null;
  if (intent === CLICK_INTENT.SWITCH_FOCUS) {
    if (K?.starSystemManager?.switchActiveSystem?.(target.systemId) !== true) return null;
  }
  const focus = intent !== CLICK_INTENT.SELECT;
  const um = K?.uiManager ?? null;
  switch (target.type) {
    case 'vessel':
      if (focus) emit?.('vessel:focus', { vesselId: target.id });
      else um?.setSelectedVesselId?.(target.id);
      break;
    case 'vessels': {
      const ids = Array.isArray(target.ids) ? target.ids.filter(i => i != null) : [];
      if (!ids.length) return null;
      if (focus) emit?.('vessel:focus', { vesselId: ids[0] });
      else {
        um?.setSelectedVesselId?.(ids[0]);
        for (let i = 1; i < ids.length; i++) um?.addToSelection?.(ids[i]);
      }
      break;
    }
    case 'enemy':
      if (focus) emit?.('vessel:focus', { vesselId: target.id });
      else K?.threeRenderer?.pingEnemyTarget?.(target.id);
      break;
    case 'station':
      emit?.(focus ? 'station:focus' : 'station:selected', { stationId: target.id });
      break;
    case 'fleet':
      if (focus) {
        if (target.leadId == null) return null;
        emit?.('vessel:focus', { vesselId: target.leadId });
      } else {
        um?.setSelectedFleetId?.(target.id);
        um?.setSelectedVesselId?.(null);   // §7.11 — mutex flota / statek (flota wygrywa kontekst, jak w Dowództwie)
      }
      break;
    case 'body':
      if (!target.entity) return null;
      if (focus && target.entity.type === 'star') K?.threeRenderer?.resetToSystemView?.();
      else emit?.('body:selected', { entity: target.entity, focus });
      break;
    default:
      return null;
  }
  return intent;
}

/** Klik w obiekt wg reguły: intencja z bieżącego zaznaczenia, potem wykonanie. */
export function clickObject(target, env = {}) {
  return applyClickIntent(target, resolveClickIntent(target, readClickSelection(env.K)), env);
}

/**
 * ARKUSZ UI U2-3 (Finding 486): karta ciała przy przełączeniu układu (wołane z `system:switched`, PO przebudowie sceny).
 * Przebudowa (`ThreeRenderer.switchSystem` → `_disposeAllMeshes`) zeruje zaznaczenie renderera bez `body:deselected`,
 * więc karta i renderer się rozjeżdżały. Reguła: karta ciała SPOZA układu docelowego się zamyka (`body:deselected`
 * z `reason: 'system_switch'` — StationPanel go nie słucha: panel stacji przeżywa przełączenie jak dotąd); karta ciała
 * Z układu docelowego zostaje, a renderer dostaje zaznaczenie z powrotem (`body:selected { focus: false }` — bez kamery;
 * drugi klik reguły §7.8 dokłada potem swój `focus: true`). Reset widoku (Home, klik w bieżący układ) układu nie
 * zmienia, więc karty nie dotyka.
 * @param {object|null} entity — ciało na karcie (`UIManager._selectedEntity`)
 * @param {string|null} systemId — układ docelowy
 * @param {Function} [emit] — `EventBus.emit`
 * @returns {'deselect'|'reselect'|null}
 */
export function syncBodyCardOnSystemSwitch(entity, systemId, emit = null) {
  if (!entity || !systemId) return null;
  if (systemIdOf(entity) !== systemId) {
    emit?.('body:deselected', { reason: 'system_switch' });
    return 'deselect';
  }
  emit?.('body:selected', { entity, focus: false });
  return 'reselect';
}

/**
 * ARKUSZ UI U3-2 (Finding 491) — lustro 486 dla panelu stacji (wołane w tym samym miejscu: `system:switched`, PO
 * przebudowie sceny): przełączenie układu zamyka panel stacji SPOZA układu docelowego; panel stacji Z układu docelowego
 * zostaje (drugi klik reguły §7.8 w stację z innego układu przełącza układ, panel zostaje). Panel zadokowany jako belka
 * (zminimalizowany) — bez zmian (to wybór gracza).
 * @param {object|null} station — stacja w otwartym panelu (`StationPanel._station()`)
 * @param {string|null} systemId — układ docelowy
 * @param {Function} [close] — zamknięcie panelu
 * @returns {'close'|'keep'|null}
 */
export function syncStationPanelOnSystemSwitch(station, systemId, close = null) {
  if (!station || !systemId) return null;
  if (systemIdOf(station) !== systemId) {
    close?.();
    return 'close';
  }
  return 'keep';
}
