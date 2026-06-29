// BattlegroupPanelLogic — czyste helpery dla BattlegroupPanel (Slice 8b). Bez UI/DOM/three —
// testowalne headless. Cykliczne przejścia: następna flota (◀▶) i następna doktryna (▾).

/**
 * Id następnej/poprzedniej floty w cyklu (wraparound). dir=+1 next, -1 prev.
 * @param {Array<{id:string}>} fleets
 * @param {string|null} currentId
 * @param {number} dir
 * @returns {string|null}
 */
export function nextFleetId(fleets, currentId, dir) {
  if (!fleets?.length) return null;
  const idx = fleets.findIndex((f) => f.id === currentId);
  if (idx < 0) return fleets[0].id;          // bieżąca poza listą → pierwsza
  const n = fleets.length;
  return fleets[(((idx + dir) % n) + n) % n].id;
}

/**
 * Następna/poprzednia doktryna w cyklu (wraparound).
 * @param {string} current
 * @param {number} dir
 * @param {string[]} all — ALL_DOCTRINES
 * @returns {string}
 */
export function nextDoctrine(current, dir, all) {
  if (!all?.length) return current;
  const idx = all.indexOf(current);
  const n = all.length;
  if (idx < 0) return all[0];
  return all[(((idx + dir) % n) + n) % n];
}

/**
 * Najbliższy wrogi statek do punktu (gameplay px) w promieniu thresholdPx.
 * Zwraca id lub null. Wraki/bez pozycji pomijane. isEnemy = predykat (np. isEnemyVessel).
 * @param {Array<object>} vessels
 * @param {{x:number,y:number}} point
 * @param {number} thresholdPx
 * @param {(v:object)=>boolean} isEnemy
 * @returns {string|null}
 */
export function nearestEnemyToPoint(vessels, point, thresholdPx, isEnemy) {
  if (!vessels?.length || !point) return null;
  let bestId = null, bestD = Infinity;
  for (const v of vessels) {
    if (!v?.position || v.isWreck || !isEnemy(v)) continue;
    const d = Math.hypot(v.position.x - point.x, v.position.y - point.y);
    if (d < bestD) { bestD = d; bestId = v.id; }
  }
  return bestD <= thresholdPx ? bestId : null;
}
