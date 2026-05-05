// ── M3 P1.3.5 — Tactical map raycaster (pure helpers) ─────────────────
// Analogiczne do RaycasterPure.js (P1.2) ale dla **2D tactical map**
// w FleetManagerOverlay (rendered na shared #ui-canvas w `_mapBounds`).
//
// Tactical map NIE ma dedicated <canvas> i NIE używa THREE — wszystko jest
// 2D Canvas 2D z własnym coord system (px screen ↔ vessel.position px).
// Pure funkcje: testowalne offline (Node ESM bez THREE / DOM).
//
// KEEP IN SYNC z FleetManagerOverlay._drawCenter (line ~1604) — coord
// transform `toSx/toSy` jest forward path; tutaj inverse `tacticalToWorld`.
//
// Zakres:
//   - tacticalToWorld(localX, localY, viewState)  — screen px → vessel.position px
//   - findHitZone(localX, localY, hitZones)       — match px vs FleetOverlay _hitZones
//   - resolveTacticalTarget(hit, worldPoint, lookups) — target shape kompatybilny
//     z RightClickMenu MENU_OPTIONS_BY_TARGET (P1.1)
//
// Off-spec discoveries z investigation #2:
//   - tactical map renderuje vessels + planets/moons/asteroids/comets/planetoids/star
//   - POI sprites NIE są renderowane (deferred do P2.x gdy POIs trafią na tactical)
//   - hit zones order: bodies first → vessels last (vessele wygrywają reverse-iter)

// Mirror Vessel.js:isEnemyVessel + RaycasterPure._isVesselEnemy.
// Inlinowane żeby moduł pozostał lekki dla offline testów.
function _isVesselEnemy(vessel) {
  if (!vessel) return false;
  if (vessel.isEnemy === true) return true;
  if (vessel.owner && vessel.owner !== 'player') return true;
  if (vessel.ownerEmpireId && vessel.ownerEmpireId !== 'player') return true;
  return false;
}

/**
 * Inverse of FleetOverlay `toSx/toSy` (line ~1604):
 *   toSx(bodyX) = bodyX / AU_TO_PX * auToPx + mapCx
 *   toSy(bodyY) = bodyY / AU_TO_PX * auToPx + mapCy
 *
 * Inverse:
 *   bodyX = (sx - mapCx) * AU_TO_PX / auToPx
 *
 * @param {number} localX — UI-canvas-local screen px (już po UI_SCALE division)
 * @param {number} localY
 * @param {object|null} viewState — { mapCx, mapCy, auToPx, AU_TO_PX } cached przez FleetOverlay
 * @returns {{x:number, y:number}|null} — null gdy viewState invalid (defensywny guard,
 *   np. handleRightClick przed first render)
 */
export function tacticalToWorld(localX, localY, viewState) {
  if (!viewState) return null;
  const { mapCx, mapCy, auToPx, AU_TO_PX } = viewState;
  if (typeof mapCx !== 'number' || typeof mapCy !== 'number') return null;
  if (typeof auToPx !== 'number' || auToPx === 0) return null;
  if (typeof AU_TO_PX !== 'number' || AU_TO_PX === 0) return null;
  return {
    x: (localX - mapCx) * AU_TO_PX / auToPx,
    y: (localY - mapCy) * AU_TO_PX / auToPx,
  };
}

/**
 * Znajdź pierwszy hit zone pod (localX, localY) — tylko typy ścieżki tactical
 * ('map_body', 'map_vessel'). Reverse-iter: vessele (last w push order) wygrywają
 * przy overlap z bodies (matches handleClick reverse logic line ~361).
 *
 * @param {number} localX
 * @param {number} localY
 * @param {Array<{x:number,y:number,w:number,h:number,type:string,data?:object}>} hitZones
 * @returns {object|null} — pierwsza pasująca strefa lub null
 */
export function findHitZone(localX, localY, hitZones) {
  if (!Array.isArray(hitZones) || hitZones.length === 0) return null;
  for (let i = hitZones.length - 1; i >= 0; i--) {
    const z = hitZones[i];
    if (!z) continue;
    // M3 P2.3 — dodano 'map_poi' (POI sprites w tactical map)
    if (z.type !== 'map_body' && z.type !== 'map_vessel' && z.type !== 'map_poi') continue;
    if (localX >= z.x && localX <= z.x + z.w
        && localY >= z.y && localY <= z.y + z.h) {
      return z;
    }
  }
  return null;
}

/**
 * Buduje target shape z hit zone + worldPoint, kompatybilny z
 * RightClickMenu MENU_OPTIONS_BY_TARGET (P1.1):
 *   - 'empty'        → moveToPoint, createPOI
 *   - 'ownVessel'    → escort
 *   - 'enemyVessel'  → pursue, intercept
 *   - 'planet'       → moveToPlanet (treat all map_body jako 'planet' dla menu)
 *
 * Lookup deps wstrzykiwane (testowalność offline) — caller (FleetOverlay) podaje:
 *   { getVessel: id => vMgr.getVessel(id), getEntity: id => EntityManager.get(id) }
 *
 * map_body w tactical map obejmuje: planet, moon, asteroid, comet, planetoid, star.
 * Wszystkie traktowane jako 'planet' type — RightClickMenu/MENU_OPTIONS_BY_TARGET
 * obsługuje generycznie (orders typu "Lecisz do" działają dla każdego ciała).
 *
 * @param {object|null} hit — z findHitZone
 * @param {{x,y}|null} worldPoint — z tacticalToWorld (null gdy viewState invalid)
 * @param {{getVessel?:Function, getEntity?:Function}} [lookups]
 * @returns {{type, entityId?, vessel?, planet?, worldPoint}}
 */
export function resolveTacticalTarget(hit, worldPoint, lookups = {}) {
  if (!hit) {
    return { type: 'empty', worldPoint: worldPoint ?? null };
  }

  if (hit.type === 'map_vessel') {
    const vesselId = hit.data?.vesselId;
    if (!vesselId) return { type: 'empty', worldPoint: worldPoint ?? null };
    const vessel = lookups.getVessel?.(vesselId) ?? null;
    if (!vessel) return { type: 'empty', worldPoint: worldPoint ?? null };
    const isOwn = !_isVesselEnemy(vessel);
    return {
      type: isOwn ? 'ownVessel' : 'enemyVessel',
      entityId: vesselId,
      vessel,
      worldPoint: worldPoint ?? null,
    };
  }

  if (hit.type === 'map_body') {
    const bodyId = hit.data?.bodyId;
    if (!bodyId) return { type: 'empty', worldPoint: worldPoint ?? null };
    const planet = lookups.getEntity?.(bodyId) ?? null;
    if (!planet) return { type: 'empty', worldPoint: worldPoint ?? null };
    return {
      type: 'planet',
      entityId: bodyId,
      planet,
      worldPoint: worldPoint ?? null,
    };
  }

  // M3 P2.3 — POI sprites w tactical map. Resolves issue #6.
  // POI hover w tactical → NEW Tooltip (P1.5 _poiContent reuse).
  // PPM na POI → MENU_OPTIONS_BY_TARGET.poi (goToPOI/patrol/edit/delete).
  if (hit.type === 'map_poi') {
    const poiId = hit.data?.poiId;
    if (!poiId) return { type: 'empty', worldPoint: worldPoint ?? null };
    const poi = lookups.getPOI?.(poiId) ?? null;
    if (!poi) return { type: 'empty', worldPoint: worldPoint ?? null };
    return {
      type: 'poi',
      entityId: poiId,
      poi,
      worldPoint: worldPoint ?? null,
    };
  }

  return { type: 'empty', worldPoint: worldPoint ?? null };
}

// Eksport prywatnych do testów
export const _internals = { _isVesselEnemy };
