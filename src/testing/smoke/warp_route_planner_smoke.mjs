// Smoke test: WarpRoutePlanner (czysty, headless). Uruchom: node tmp_warp_route_planner_smoke.mjs
import { planWarpRoute, warpDist3D, WARP_ROUTE_REASONS } from '../../utils/WarpRoutePlanner.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } };
const eqf = (a, b, msg, eps = 1e-6) => ok(Math.abs(a - b) <= eps, `${msg} (got ${a}, want ${b})`);

// Układy testowe (LY): home(0,0,0) — B(5) — C(10) na osi X; F(5,3) off-axis; G(100) izolowany.
const SYS = [
  { id: 'sys_home', x: 0,   y: 0, z: 0 },
  { id: 'B',        x: 5,   y: 0, z: 0 },
  { id: 'C',        x: 10,  y: 0, z: 0 },
  { id: 'F',        x: 5,   y: 3, z: 0 },
  { id: 'M9',       x: 9,   y: 0, z: 0 },
  { id: 'X15',      x: 15,  y: 0, z: 0 },
  { id: 'G',        x: 100, y: 0, z: 0 },
];
const OPTS = (over = {}) => ({ maxHopLY: 6, currentFuel: 10, consumption: 0.5, ...over });

// T1 — same_system
{
  const r = planWarpRoute(SYS, 'sys_home', 'sys_home', OPTS());
  ok(!r.ok && r.reason === WARP_ROUTE_REASONS.SAME_SYSTEM, 'T1 same_system');
}
// T2 — unknown_system
{
  const r = planWarpRoute(SYS, 'sys_home', 'nope', OPTS());
  ok(!r.ok && r.reason === WARP_ROUTE_REASONS.UNKNOWN_SYSTEM, 'T2 unknown_system');
}
// T3 — bad_config (maxHopLY=0) + (consumption=0)
{
  const r1 = planWarpRoute(SYS, 'sys_home', 'B', OPTS({ maxHopLY: 0 }));
  ok(!r1.ok && r1.reason === WARP_ROUTE_REASONS.BAD_CONFIG, 'T3a bad_config maxHopLY');
  const r2 = planWarpRoute(SYS, 'sys_home', 'B', OPTS({ consumption: 0 }));
  ok(!r2.ok && r2.reason === WARP_ROUTE_REASONS.BAD_CONFIG, 'T3b bad_config consumption');
}
// T4 — direct single hop
{
  const r = planWarpRoute(SYS, 'sys_home', 'B', OPTS());
  ok(r.ok, 'T4 direct ok');
  ok(r.hops.length === 2 && r.hops[0] === 'sys_home' && r.hops[1] === 'B', 'T4 hops=[home,B]');
  ok(r.legs.length === 1, 'T4 1 leg');
  eqf(r.totalLY, 5, 'T4 totalLY');
  eqf(r.totalFuel, 2.5, 'T4 totalFuel=dist*consumption');
}
// T5/T6 — multi-hop + shortest (A→C poza jednym skokiem; przez B krócej niż przez F)
{
  const r = planWarpRoute(SYS, 'sys_home', 'C', OPTS());
  ok(r.ok, 'T5 multi-hop ok');
  ok(r.hops.length === 3 && r.hops[1] === 'B', 'T5 hops=[home,B,C] (B krócej niż F)');
  eqf(r.totalLY, 10, 'T5 totalLY=10 (nie 11.66 przez F)');
  eqf(r.totalFuel, 5, 'T6 totalFuel=5');
}
// T7 — no_route (G izolowany)
{
  const r = planWarpRoute(SYS, 'sys_home', 'G', OPTS());
  ok(!r.ok && r.reason === WARP_ROUTE_REASONS.NO_ROUTE, 'T7 no_route');
}
// T8 — insufficient_warp_fuel (trasa jest, bak za mały) + pola partial
{
  const r = planWarpRoute(SYS, 'sys_home', 'C', OPTS({ currentFuel: 3 }));
  ok(!r.ok && r.reason === WARP_ROUTE_REASONS.INSUFFICIENT_FUEL, 'T8 insufficient_warp_fuel');
  ok(Array.isArray(r.hops) && r.hops.length === 3, 'T8 partial hops obecne');
  eqf(r.totalFuel, 5, 'T8 partial totalFuel');
}
// T9 — HOME jako cel (z obcego układu)
{
  const r = planWarpRoute(SYS, 'B', 'sys_home', OPTS());
  ok(r.ok && r.hops[r.hops.length - 1] === 'sys_home', 'T9 HOME jako cel');
}
// T10 — determinizm (dwa przebiegi deep-equal)
{
  const a = planWarpRoute(SYS, 'sys_home', 'C', OPTS());
  const b = planWarpRoute(SYS, 'sys_home', 'C', OPTS());
  ok(JSON.stringify(a) === JSON.stringify(b), 'T10 determinizm');
}
// T11 — ETA iff warpSpeed>0
{
  const withSpeed = planWarpRoute(SYS, 'sys_home', 'C', OPTS({ warpSpeed: 2 }));
  ok(withSpeed.etaYears != null, 'T11a etaYears obecne gdy warpSpeed>0');
  eqf(withSpeed.etaYears, 5, 'T11b etaYears=totalLY/warpSpeed');
  const noSpeed = planWarpRoute(SYS, 'sys_home', 'C', OPTS());
  ok(noSpeed.etaYears === undefined, 'T11c brak etaYears gdy warpSpeed niezdefiniowany');
}
// T12 — warpDist3D (z??0)
{
  eqf(warpDist3D({ x: 0, y: 0, z: 0 }, { x: 3, y: 4 }), 5, 'T12 warpDist3D 3-4-5 (z default 0)');
}
// T13 — allowedIds wyklucza pośrednika → no_route, ale from/to zawsze dozwolone
{
  const r = planWarpRoute(SYS, 'sys_home', 'C', OPTS({ allowedIds: new Set(['sys_home', 'C']) }));
  ok(!r.ok && r.reason === WARP_ROUTE_REASONS.NO_ROUTE, 'T13 allowedIds wyklucza B/F → no_route');
}

// T14 — twardy limit skoku 10 LY: cel 15 LY (direct >10) → multi-hop przez pośredni ≤10
{
  const r = planWarpRoute(SYS, 'sys_home', 'X15', { maxHopLY: 10, currentFuel: 100, consumption: 0.125, warpSpeed: 2 });
  ok(r.ok, 'T14 cel 15 LY z limitem 10 → ok (multi-hop)');
  ok(r.hops.length >= 3, `T14 multi-hop (${r.hops?.length - 1} skoki, nie direct)`);
  ok(r.legs.every(l => l.distLY <= 10 + 1e-6), 'T14 każdy odcinek ≤ 10 LY (limit skoku)');
  eqf(r.totalLY, 15, 'T14 totalLY = 15 (suma odcinków = dystans colinear)');
}
// T15 — bez limitu (maxHopLY=20) ten sam cel = pojedynczy skok (kontrast do T14)
{
  const r = planWarpRoute(SYS, 'sys_home', 'X15', { maxHopLY: 20, currentFuel: 100, consumption: 0.125 });
  ok(r.ok && r.hops.length === 2, 'T15 maxHopLY=20 → direct (1 skok) — limit jest wiążący w T14');
}

console.log(`\nWarpRoutePlanner: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
