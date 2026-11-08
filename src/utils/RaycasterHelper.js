// ── M3 P1.2 — Raycaster Helper ──────────────────────────────────────────
// Mouse → world coords + sprite hit detection dla 3D taktycznej mapy.
//
// Pure helpers (mouseToNDC, findKosmosNode, resolveTargetFromHits) żyją
// w ./RaycasterPure.js — testowalne offline w Node bez THREE. Tutaj
// THREE-dependent castRay() + re-eksport całego API dla GameScene.
//
// Konwencja userData.kosmosType:
//   'vessel' | 'poi' | 'planet' — tylko obiekty z tym kluczem są "pickable".
//   Filter zapobiega false positives (orbit lines, atmoMesh, cloudMesh, ringi).
//   Walk-up parent chain — GLB model wrapper trzyma userData, raycaster trafia w child.
//
// Y-stack na mapie taktycznej (ważne dla occlusion D5):
//   Y=0     orbity, planety, gwiazdy
//   Y=0.02  POI sprites
//   Y=0.05  prediction cone
//   Y=0.3   vessele
//   Y=0.45  wraki cmentarz
// → Three.js Raycaster sortuje hits od najbliższego — closest wygrywa naturalnie.
//
// ARC CV-3a2 (Finding 646, decyzja właściciela (b)) — worldPoint z przecięcia z płaszczyzną STATKÓW (Y = 0.3), nie orbit
// (Y = 0): statki są rysowane na Y = 0.3, a przy kadrze walki (kamera 27° nad płaszczyzną) klik obok statku trafiał
// ≈ 0.3 · tg 63° ≈ 0.59 j. ≈ 0.054 AU dalej wzdłuż promienia — cały zasięg lasera. Dotyczy KAŻDEGO kliku w pustą
// przestrzeń, także poza bitwą. Kamera poniżej płaszczyzny statków (zbliżenie ciała) — płaszczyzna orbit, jak dotąd.
// worldPoint zwracany zawsze, nawet gdy klik trafia w sprite.

import * as THREE from 'three';
import { mouseToNDC, findKosmosNode, resolveTargetFromHits } from './RaycasterPure.js';

// Re-eksport pure API
export { mouseToNDC, findKosmosNode, resolveTargetFromHits };

/** Wysokość płaszczyzny statków [j.] — sprite'y statków w wolnej przestrzeni stoją na Y = 0.3 (`ThreeRenderer`). */
export const SHIP_PLANE_Y = 0.3;

/**
 * ARC CV-3a2 (Finding 646 (b)) — wysokość płaszczyzny kliku: statków, gdy kamera jest nad nią; inaczej (kamera przy ciele
 * poniżej Y = 0.3 — promień w dół nie przetnie płaszczyzny statków przed kamerą) płaszczyzna orbit Y = 0, jak dotąd.
 */
export function clickPlaneY(cameraY) {
  return Number.isFinite(cameraY) && cameraY > SHIP_PLANE_Y + 1e-6 ? SHIP_PLANE_Y : 0;
}

/**
 * Cast ray przez camera + intersect z płaszczyzną kliku (statków Y = 0.3 — `clickPlaneY`) i scene objects.
 * @param {{x:number, y:number}} ndc — z mouseToNDC()
 * @param {THREE.Camera} camera
 * @param {THREE.Scene} scene
 * @param {THREE.Raycaster} raycaster — reuse instance z ThreeRenderer (._ray)
 * @returns {{hits: Array, worldPoint: {x,y,z}}}
 */
export function castRay(ndc, camera, scene, raycaster) {
  raycaster.setFromCamera(ndc, camera);

  // Intersect ze wszystkimi obiektami (recursive=true) — child mesh GLB
  // też złapany. Filter po userData.kosmosType (lub parent chain).
  const allHits = raycaster.intersectObjects(scene.children, true);
  const hits = [];
  for (const hit of allHits) {
    const node = findKosmosNode(hit.object);
    if (node) hits.push({ ...hit, kosmosNode: node });
  }
  // hits już posortowane przez raycaster od najbliższego (closest wins — D5).

  // Płaszczyzna kliku dla worldPoint — zawsze zwracane, niezależnie od hits.
  // Wykorzystywane przez moveToPoint (P1.3) — klik w sprite zwraca worldPoint
  // pod sprite, klik w pusty obszar zwraca punkt na płaszczyźnie STATKÓW (ARC CV-3a2, Finding 646 (b): Y = 0.3 — tam, gdzie
  // statki są rysowane; dawniej płaszczyzna orbit Y = 0). Plane(normal, constant): punkty z normal·p + constant = 0 ⇒ y = −constant.
  const planeY = clickPlaneY(camera?.position?.y);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
  const wp = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, wp);

  return {
    hits,
    worldPoint: { x: wp.x, y: planeY, z: wp.z },
  };
}
