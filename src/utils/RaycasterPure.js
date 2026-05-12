// ── M3 P1.2 — Raycaster Pure helpers (no THREE dependency) ──────────────
// Pure math + userData filter — testowalne offline w Node ESM bez 'three'.
// THREE-dependent castRay() w ./RaycasterHelper.js (re-eksport stąd).

/**
 * Konwersja screen pixel → NDC (Normalized Device Coords [-1, 1]).
 * @param {number} clientX — event.clientX
 * @param {number} clientY — event.clientY
 * @param {{getBoundingClientRect: ()=>{left,top,width,height}}} canvas
 * @returns {{x:number, y:number}}
 */
export function mouseToNDC(clientX, clientY, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: -((clientY - rect.top) / rect.height) * 2 + 1,
  };
}

/**
 * Walk up parent chain żeby znaleźć pierwszy obiekt z userData.kosmosType.
 * Konieczne dla GLB modeli — child mesh nie ma userData, ale wrapper Group ma.
 * @returns {Object|null}
 */
export function findKosmosNode(obj) {
  let node = obj;
  while (node) {
    if (node.userData && node.userData.kosmosType) return node;
    node = node.parent;
  }
  return null;
}

// Mirror isEnemyVessel z src/entities/Vessel.js:323 — tolerancyjny 3-field check.
// Player vessele typowo NIE mają żadnego z tych pól ustawionego (default = own).
// Inlinowane, żeby RaycasterPure pozostał lekki dla offline testów (Vessel.js
// ciągnie kaskadę EntityManager/ShipsData/etc. — niepotrzebne tutaj).
// KEEP IN SYNC z Vessel.js:isEnemyVessel.
function _isVesselEnemy(vessel) {
  if (!vessel) return false;
  if (vessel.isEnemy === true) return true;
  if (vessel.owner && vessel.owner !== 'player') return true;
  if (vessel.ownerEmpireId && vessel.ownerEmpireId !== 'player') return true;
  return false;
}

/**
 * Resolve target shape z hits (już posortowane od najbliższego) + worldPoint.
 * Hit shape: { object, kosmosNode? } — kosmosNode opcjonalne (gdy castRay
 * sam już zrobił walk-up); tu defensive fallback do object.userData lub
 * findKosmosNode(object).
 *
 * @param {Array} hits
 * @param {{x,y,z}} worldPoint
 * @param {string} _currentEmpireId — vestigial (kept dla wstecznej kompat).
 *   M4 multi-player: zastąp _isVesselEnemy logic empire-aware lookup'em.
 * @returns {{type, entityId?, vessel?, poi?, planet?, worldPoint}}
 */
export function resolveTargetFromHits(hits, worldPoint, _currentEmpireId) {
  if (!hits || hits.length === 0) {
    return { type: 'empty', worldPoint };
  }

  const closest = hits[0];
  // Preferuj pre-resolved kosmosNode (z castRay), fallback na obj/parent walk.
  const node = closest.kosmosNode ?? findKosmosNode(closest.object);
  const ud = node?.userData ?? {};

  if (ud.kosmosType === 'vessel') {
    const vessel = window.KOSMOS?.vesselManager?.getVessel?.(ud.vesselId);
    if (!vessel) return { type: 'empty', worldPoint };  // stale userData
    const isOwn = !_isVesselEnemy(vessel);
    return {
      type: isOwn ? 'ownVessel' : 'enemyVessel',
      entityId: ud.vesselId,
      vessel,
      worldPoint,
    };
  }

  if (ud.kosmosType === 'poi') {
    const poi = window.KOSMOS?.poiRegistry?.getPOI?.(ud.poiId);
    if (!poi) return { type: 'empty', worldPoint };
    return { type: 'poi', entityId: ud.poiId, poi, worldPoint };
  }

  if (ud.kosmosType === 'planet') {
    // EntityManager (singleton) has .get(id) — not .getEntity(). Two prior
    // gaps fixed in P4: missing window.KOSMOS.entityManager exposure +
    // method-name mismatch made planet hover return type:'empty'.
    const em = window.KOSMOS?.entityManager;
    const planet = em?.get?.(ud.planetId);
    if (!planet) return { type: 'empty', worldPoint };
    return { type: 'planet', entityId: ud.planetId, planet, worldPoint };
  }

  return { type: 'empty', worldPoint };
}
