// WarpRoutePlanner — czysty solver najkrótszej trasy warp (multi-hop) dla floty gracza.
//
// Model: graf gwiazd (galaxyData.systems). Krawędź a→b istnieje, gdy dystans 3D
// (LY) ≤ maxHopLY (= fizyczny zasięg JEDNEGO skoku na PEŁNYM baku warp =
// warpFuel.max / warpFuel.consumption). Najkrótsza trasa = Dijkstra po wadze
// = dystans. Ponieważ paliwo = dystans × consumption (stałe), minimalizacja
// dystansu minimalizuje ZARAZEM paliwo → jeden przebieg wystarcza dla modelu
// "tylko obecny bak" (cała trasa musi zmieścić się w warpFuel.current, BEZ
// tankowania po drodze — decyzja gracza S3.x).
//
// CZYSTY moduł: bez `window`, bez Three, bez `Math.random`, bez stanu — w pełni
// testowalny w node (tmp_warp_route_planner_smoke.mjs). Jednostki: LY.

const EPS = 1e-6;

// Kody powodu niepowodzenia (eksportowane stałe — UI mapuje na i18n).
export const WARP_ROUTE_REASONS = {
  SAME_SYSTEM:        'same_system',          // from === to (skok 0 LY; lustro dispatchInterstellar distLY<=0)
  UNKNOWN_SYSTEM:     'unknown_system',        // from/to nie istnieje w galaxyData.systems
  BAD_CONFIG:         'bad_config',            // maxHopLY<=0 / consumption<=0 / currentFuel<0 (zepsuty warp)
  NO_ROUTE:           'no_route',              // graf rozspójny w zasięgu (brak ścieżki)
  INSUFFICIENT_FUEL:  'insufficient_warp_fuel',// trasa istnieje, ale totalFuel > currentFuel
};

/**
 * Dystans 3D w LY między dwoma układami (z?? 0). Eksport — reużywany przez
 * WarpRouteSystem przy per-hop re-checku paliwa.
 * @param {{x?:number,y?:number,z?:number}} a
 * @param {{x?:number,y?:number,z?:number}} b
 * @returns {number} LY
 */
export function warpDist3D(a, b) {
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Zaplanuj trasę warp z fromId do toId (najkrótszy dystans, model jedno-bakowy).
 *
 * @param {Array<{id:string,x?:number,y?:number,z?:number}>} systems — galaxyData.systems (extra pola ignorowane)
 * @param {string} fromId — układ startowy (vessel.systemId ?? 'sys_home')
 * @param {string} toId — układ docelowy
 * @param {Object} opts
 * @param {number} opts.maxHopLY — fizyczny zasięg jednego skoku (warpFuel.max/consumption)
 * @param {number} opts.currentFuel — aktualne paliwo warp (warpFuel.current)
 * @param {number} opts.consumption — zużycie paliwa na LY (warpFuel.consumption)
 * @param {number} [opts.warpSpeed] — LY/rok dla estymaty ETA (gdy >0 dodaje etaYears)
 * @param {Set<string>} [opts.allowedIds] — zbiór routowalnych id (fog-gate); from/to zawsze dozwolone
 * @returns {{ok:true, hops:string[], legs:Array, totalLY:number, totalFuel:number, etaYears?:number}
 *          | {ok:false, reason:string, hops?:string[], legs?:Array, totalLY?:number, totalFuel?:number, etaYears?:number}}
 */
export function planWarpRoute(systems, fromId, toId, opts = {}) {
  const { maxHopLY, currentFuel, consumption, warpSpeed, allowedIds } = opts;

  if (fromId === toId) return { ok: false, reason: WARP_ROUTE_REASONS.SAME_SYSTEM };
  if (!Array.isArray(systems) || systems.length === 0) {
    return { ok: false, reason: WARP_ROUTE_REASONS.UNKNOWN_SYSTEM };
  }

  const byId = new Map();
  for (const s of systems) if (s && s.id != null) byId.set(s.id, s);
  if (!byId.has(fromId) || !byId.has(toId)) {
    return { ok: false, reason: WARP_ROUTE_REASONS.UNKNOWN_SYSTEM };
  }
  if (!(maxHopLY > 0) || !(consumption > 0) || !(currentFuel >= 0)) {
    return { ok: false, reason: WARP_ROUTE_REASONS.BAD_CONFIG };
  }

  // Węzły grafu: gdy allowedIds podane → tylko one, ale from/to ZAWSZE w środku.
  const nodes = (allowedIds instanceof Set)
    ? systems.filter(s => s && s.id != null && (allowedIds.has(s.id) || s.id === fromId || s.id === toId))
    : systems.filter(s => s && s.id != null);

  // ── Dijkstra (linear extraction; N małe — galaktyka ~kilkadziesiąt układów) ──
  // Tie-break deterministyczny: kolejność tablicy `nodes` (= kolejność wejścia)
  // poprzez strict `< best - EPS` zarówno przy ekstrakcji, jak i relaksacji.
  const best = new Map();
  const prev = new Map();
  const visited = new Set();
  for (const n of nodes) best.set(n.id, Infinity);
  best.set(fromId, 0);

  while (true) {
    let u = null;
    let uBest = Infinity;
    for (const n of nodes) {
      if (visited.has(n.id)) continue;
      const b = best.get(n.id);
      if (b < uBest - EPS) { uBest = b; u = n; }
    }
    if (u === null || uBest === Infinity) break;   // reszta nieosiągalna
    if (u.id === toId) break;                       // dotarliśmy do celu
    visited.add(u.id);
    for (const v of nodes) {
      if (v.id === u.id || visited.has(v.id)) continue;
      const d = warpDist3D(u, v);
      if (d <= maxHopLY + EPS) {                    // krawędź = skok w fizycznym zasięgu
        const nd = uBest + d;
        if (nd < best.get(v.id) - EPS) { best.set(v.id, nd); prev.set(v.id, u.id); }
      }
    }
  }

  if (!(best.get(toId) < Infinity)) return { ok: false, reason: WARP_ROUTE_REASONS.NO_ROUTE };

  // Rekonstrukcja ścieżki (od toId wstecz po prev, guard przeciw cyklowi)
  const hops = [];
  const seen = new Set();
  let cur = toId;
  while (cur != null && !seen.has(cur)) {
    hops.unshift(cur);
    seen.add(cur);
    if (cur === fromId) break;
    cur = prev.get(cur);
  }
  if (hops[0] !== fromId) return { ok: false, reason: WARP_ROUTE_REASONS.NO_ROUTE };

  const legs = [];
  let totalLY = 0;
  let totalFuel = 0;
  for (let i = 0; i < hops.length - 1; i++) {
    const a = byId.get(hops[i]);
    const b = byId.get(hops[i + 1]);
    const d = warpDist3D(a, b);
    const fc = d * consumption;
    legs.push({ from: hops[i], to: hops[i + 1], distLY: d, fuelCost: fc });
    totalLY += d;
    totalFuel += fc;
  }

  const base = { hops, legs, totalLY, totalFuel };
  if (warpSpeed > 0) base.etaYears = totalLY / warpSpeed;

  if (totalFuel > currentFuel + EPS) {
    // Trasa istnieje, ale bak nie wystarcza — zwróć pola partial dla UI (pokaże braki).
    return { ok: false, reason: WARP_ROUTE_REASONS.INSUFFICIENT_FUEL, ...base };
  }
  return { ok: true, ...base };
}
