// OrderTargetInfo — wspólny helper widoku floty.
//
// Dla statku gracza z AKTYWNYM rozkazem celującym we wrogi statek (engage / pursue /
// intercept) zwraca dane do wyświetlenia w panelach: ikonę typu rozkazu, nazwę celu
// (z mgłą wojny — przy intel < contact tożsamość ukryta) oraz ŻYWY dystans w AU.
// Współdzielony przez FleetGroupPanel, FleetCommandPanel i FleetManagerOverlay, by reguła
// mgły wojny i liczenia dystansu istniała w JEDNYM miejscu (uniknięcie 3 kopii, które
// mogłyby się rozjechać). Rdzeń (gating nazwy + dystans) wydzielony do czystych funkcji
// testowalnych headless; runtime `getOrderTargetInfo` czyta window.KOSMOS.

import { GAME_CONFIG }   from '../config/GameConfig.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { t }             from '../i18n/i18n.js';

// Typy rozkazów celujących we WROGI statek. escort celuje w sojusznika → świadomie pominięty
// (pokazanie dystansu do eskortowanego jest mylące — to nie cel ataku).
const ENEMY_TARGET_ORDERS = new Set(['engage', 'pursue', 'intercept']);

// Ikona wg typu rozkazu (spójne z _drawMovementOrderLabel / _orderLineColor).
const ORDER_ICON = { engage: '⊗', pursue: '⚔', intercept: '⊕' };

// Ranga intelu (kopia VESSEL_LEVEL_RANK — IntelSystem nie eksportuje jej).
const _INTEL_RANK = { unknown: 0, rumor: 1, contact: 2, detailed: 3 };

/**
 * Czysta: nazwa celu z mgłą wojny. Wróg przy intel < contact → anonimowy (rumor pokazuje
 * tylko „tu jest kontakt", bez tożsamości). Inaczej realna nazwa.
 * @param {object|null} target — encja celu (Vessel) lub null gdy zniknął.
 * @param {string|null} intelQuality — 'unknown'|'rumor'|'contact'|'detailed'.
 * @param {string} anonLabel — etykieta anonimowa (np. „Niezidentyfikowany kontakt").
 * @returns {string}
 */
export function targetDisplayName(target, intelQuality, anonLabel) {
  if (!target) return anonLabel;
  if (isEnemyVessel(target)) {
    const rank = _INTEL_RANK[intelQuality] ?? 0;
    if (rank < _INTEL_RANK.contact) return anonLabel;   // rumor/unknown → ukryta tożsamość
  }
  return target.name ?? target.shipId ?? target.id ?? anonLabel;
}

/**
 * Czysta: dystans AU między dwoma punktami {x,y} w px gry. null gdy brak współrzędnych.
 * @param {{x:number,y:number}|null} a
 * @param {{x:number,y:number}|null} b
 * @param {number} [auToPx]
 * @returns {number|null}
 */
export function distanceAUBetween(a, b, auToPx = GAME_CONFIG.AU_TO_PX) {
  const ax = a?.x, ay = a?.y, bx = b?.x, by = b?.y;
  if (![ax, ay, bx, by].every(Number.isFinite)) return null;
  return Math.hypot(ax - bx, ay - by) / auToPx;
}

/**
 * Runtime: pełna informacja o celu rozkazu dla statku gracza. Zwraca null gdy statek NIE
 * celuje aktywnie we wrogi statek (brak rozkazu / status != active / inny typ rozkazu).
 * Cel zniknął (zniszczony / poza intelem) → nazwa anonimowa + dystans z lastTargetPos.
 * @param {object} vessel — statek gracza (z vessel.movementOrder).
 * @returns {{ orderType:string, icon:string, targetId:string, name:string,
 *            distAU:(number|null), lost:boolean } | null}
 */
export function getOrderTargetInfo(vessel) {
  const mo = vessel?.movementOrder;
  if (!mo || mo.status !== 'active' || !mo.targetEntityId) return null;
  if (!ENEMY_TARGET_ORDERS.has(mo.type)) return null;

  const vm = window.KOSMOS?.vesselManager;
  const target = vm?.getVessel?.(mo.targetEntityId)
    ?? window.KOSMOS?.entityManager?.get?.(mo.targetEntityId)
    ?? null;

  const isEnemyTgt = !!(target && isEnemyVessel(target));
  const intelRec = isEnemyTgt
    ? (window.KOSMOS?.intelSystem?.getVesselContact?.(mo.targetEntityId) ?? null)
    : null;
  const q = intelRec ? (intelRec.quality ?? 'unknown') : null;
  const name = targetDisplayName(target, q, t('intel.unidentifiedContact'));

  // Pozycja celu z MGŁĄ WOJNY (spójność z markerem 3D / _resolveFxEndpoint): wróg poniżej
  // 'contact' (rumor/unknown) → ZAMROŻONA positionLastKnown, NIE żywa pozycja. Inaczej gracz
  // odczytywałby żywy, tykający dystans = ilościowy przeciek prawdziwej pozycji/kursu wroga
  // (a marker na mapie stoi zamrożony — niespójność). contact+/sojusznik → żywa pozycja.
  const useFrozen = isEnemyTgt && (_INTEL_RANK[q] ?? 0) < _INTEL_RANK.contact;
  let tgtPos;
  if (useFrozen) {
    tgtPos = intelRec?.positionLastKnown ?? mo.lastTargetPos ?? null;
  } else if (target?.position && Number.isFinite(target.position.x)) {
    tgtPos = { x: target.position.x, y: target.position.y };
  } else if (target && Number.isFinite(target.x)) {
    tgtPos = { x: target.x, y: target.y };
  } else {
    tgtPos = mo.lastTargetPos ?? null;
  }
  const distAU = distanceAUBetween(vessel?.position, tgtPos);

  return {
    orderType: mo.type,
    icon: ORDER_ICON[mo.type] ?? '🎯',
    targetId: mo.targetEntityId,
    name,
    distAU,
    lost: !target,
  };
}
