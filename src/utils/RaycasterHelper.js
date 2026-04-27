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
// Y=0 plane intersect dla worldPoint: zawsze zwracane, nawet gdy klik trafia w sprite.

import * as THREE from 'three';
import { mouseToNDC, findKosmosNode, resolveTargetFromHits } from './RaycasterPure.js';

// Re-eksport pure API
export { mouseToNDC, findKosmosNode, resolveTargetFromHits };

/**
 * Cast ray przez camera + intersect z plane Y=0 i scene objects.
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

  // Plane Y=0 intersect dla worldPoint — zawsze zwracane, niezależnie od hits.
  // Wykorzystywane przez moveToPoint (P1.3) — klik w sprite zwraca worldPoint
  // pod sprite, klik w pusty obszar zwraca punkt na płaszczyźnie orbitalnej.
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const wp = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, wp);

  return {
    hits,
    worldPoint: { x: wp.x, y: 0, z: wp.z },
  };
}
