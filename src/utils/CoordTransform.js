// ── M3 P2.3 — CoordTransform (pure helpers) ─────────────────────────
// Konwersja między dwiema przestrzeniami współrzędnych:
//   gameplay coords (px from origin) — entity.x/y, vessel.position.x/y, poi.point.x/y
//   Three.js world coords (XZ plane, Y=0) — mesh.position, focusOn(worldX, worldZ)
//
// Skala: 1 AU = AU_TO_PX (110) px gameplay = AU_TO_PX/WORLD_SCALE (11) jednostek Three.js.
// Single divide: gameplay → world = px / WORLD_SCALE (10).
//
// Issue #5 (P2.1 deferred): POIPanel.handleClick focus_poi przekazywał
// gameplay px do focusOn(worldX, worldZ) bez konwersji → camera ślizgała się
// do złej pozycji. focusOnGameplayCoord(p) używa tych helperów jako
// single source of truth.

// WORLD_SCALE musi pozostać w synchronizacji z ThreeRenderer.js:29.
// Konstanta hardkodowana (nie ma jej w GameConfig — pure render concern).
const WORLD_SCALE = 10;

/**
 * Konwertuj gameplay coords (px from origin) → Three.js world coords (XZ plane).
 * @param {{x:number, y:number}|null} p
 * @returns {{worldX:number, worldZ:number}|null} — null gdy p invalid
 */
export function gameplayToWorld(p) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  return { worldX: p.x / WORLD_SCALE, worldZ: p.y / WORLD_SCALE };
}

/**
 * Konwertuj Three.js world coords → gameplay coords.
 * @param {number} worldX
 * @param {number} worldZ
 * @returns {{x:number, y:number}|null} — null gdy invalid
 */
export function worldToGameplay(worldX, worldZ) {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return null;
  return { x: worldX * WORLD_SCALE, y: worldZ * WORLD_SCALE };
}

// ── M3 P3.1 — Euclidean distance helper (gameplay px) ────────────────
// Używane przez POIRuntimeSystem dla picket detection oraz rally member
// assembly. Vessel.position.x/y i POI.center.x/y są w tym samym coord
// space (gameplay px), więc proste pitagoras wystarcza.
/**
 * @param {{x:number, y:number}|null} p1
 * @param {{x:number, y:number}|null} p2
 * @returns {number} — odległość w gameplay px, Infinity gdy invalid
 */
export function gameplayDistance(p1, p2) {
  if (!p1 || !p2) return Infinity;
  const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
  if (!Number.isFinite(x1) || !Number.isFinite(y1) ||
      !Number.isFinite(x2) || !Number.isFinite(y2)) return Infinity;
  const dx = x1 - x2, dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

export const _internals = { WORLD_SCALE };
