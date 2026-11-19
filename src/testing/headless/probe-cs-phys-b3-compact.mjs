// KOSMOS — CS-PHYS-b3 (plan COLONY_SPHERE §3.9.2): efekty kompaktowych układów w grze — orbity dotychczasowe vs
// skalowane (klimat v2 w obu), per klasa gwiazdy.
//
// Mierzy na wygenerowanych układach (5 seedów × dom + 72 układy obce), czytając ŻYWE stałe i funkcje gry:
//  · rozpiętość układu (aphelium najdalszej planety) i k (SystemScale),
//  · typowy lot wewnątrz układu: świat domowy (reguła pickHabitableHomeworld, brak → planeta najbliższa środka HZ) →
//    każda inna planeta, odległość RMS przy losowych fazach √(a₁² + a₂²); czas [dni gry] i paliwo [jedn.] dla kadłubów
//    z HullsData (speedAU = AU / rok gry, fuelPerAU), odsetek lotów pod podłogą MissionSystem (0.008 roku),
//  · pokrycie radarem jako ułamek POWIERZCHNI dysku układu: π(R·k)² / π·rozpiętość² (statek gracza sensorRangeAU,
//    statek AI DETECTION_BASE_AU, kolonia bez / z obserwatorium 1/3/6/15 AU; sufit 1),
//  · AI: pierścień patrolu (DirectorDoctrine._outerRadiusAU — klamry × k) względem orbit planet, promień przelotu
//    pierwszego kontaktu, punkt przylotu warp,
//  · próbkowanie wejścia w walkę: zbliżanie dwóch statków w jednej klatce przy 1 r/s (60 i 30 kl./s) względem średnicy
//    progu wejścia COMBAT_ENGAGEMENT_AU · k (TimeSystem nie ma podkroków; ProximitySystem sprawdza pozycje klatkowo).
//
// Uruchomienie: node src/testing/headless/probe-cs-phys-b3-compact.mjs [--seeds a,b,c] [--json out.json]
// Sonda READ-ONLY: nie edytuje repo, nie pisze do reports/.

import './env.js';
import { writeFileSync } from 'node:fs';

const { GAME_CONFIG }       = await import('../../config/GameConfig.js');
const { SystemGenerator }   = await import('../../generators/SystemGenerator.js');
const { GalaxyGenerator }   = await import('../../generators/GalaxyGenerator.js');
const { StarSystemManager } = await import('../../systems/StarSystemManager.js');
const EntityManager         = (await import('../../core/EntityManager.js')).default;
const OM                    = await import('../../utils/OrbitModel.js');
const { HULLS }             = await import('../../data/HullsData.js');
const { DETECTION_BASE_AU } = await import('../../utils/DetectionRange.js');
const { COMBAT_ENGAGEMENT_AU } = await import('../../systems/ProximitySystem.js');
const { DirectorDoctrine }  = await import('../../systems/director/DirectorDoctrine.js');
const { VesselManager }     = await import('../../systems/VesselManager.js');
const { KeplerMath }        = await import('../../utils/KeplerMath.js');

const DEFAULT_SEEDS = [-2102099243, 612055237, 572914822, 813683454, 1640489291];
const argI = (k) => process.argv.indexOf(k);
const SEEDS = argI('--seeds') >= 0 ? process.argv[argI('--seeds') + 1].split(',').map(Number) : DEFAULT_SEEDS;
const quietly = (fn) => { const o = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = o; console.warn = w; } };

const DAYS_PER_YEAR = 365.25;
const MIN_TRAVEL_YEARS = 0.008;                 // lustro MissionSystem.MIN_TRAVEL_YEARS (rok gry)
const OBS_LEVELS_AU = [1, 3, 6, 15];            // lustro ObservatorySystem.VESSEL_DETECTION_RANGE[0..3] (AU)
const PATROL_RING_FACTOR = 0.9;                 // lustro DirectorDoctrine
const FLYBY_RADIUS_AU = 2600 / GAME_CONFIG.AU_TO_PX;   // lustro DirectorFirstContact FLYBY_RADIUS_PX
const WARP_EDGE_AU = 30;                        // lustro VesselManager (punkt przylotu warp, AU od gwiazdy)
const FAST_YEARS_PER_S = GAME_CONFIG.TIME_MULTIPLIERS.at(-1);   // 1 r/s

function buildWorld(galaxySeed, orbitModel) {
  EntityManager.clear();
  const home = new SystemGenerator().generateCivScenario({ galaxySeed, seeded: true, climateModel: 2, orbitModel });
  const ssm = new StarSystemManager();
  ssm.registerHomeSystem(home.star, home.planets, home.moons, home.planetoids);
  globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? {};
  globalThis.window.KOSMOS.starSystemManager = ssm;
  const galaxyData = GalaxyGenerator.generate(galaxySeed, home.star.name, home.star.spectralType,
    { seededSystems: true, climateModel: 2, orbitModel });
  for (const gs of galaxyData.systems) if (gs.id !== 'sys_home') ssm.generateAndRegister(gs, galaxyData);
  return ssm;
}

const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };
const pct = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const HULL_IDS = ['hull_small', 'hull_medium', 'hull_large'];
const doctrine = Object.create(DirectorDoctrine.prototype);
const vm = Object.create(VesselManager.prototype);   // _calcRoute + omijanie ciał (metody prototypu, bez stanu)
const AU = GAME_CONFIG.AU_TO_PX;
// Pozycje ciał z elementów orbity (sonda nie tyka fizyki): planety i księżyce w px, gwiazda w (0,0)
function placeBodies(sysId) {
  for (const p of EntityManager.getByTypeInSystem('planet', sysId)) {
    const o = p.orbital, pos = KeplerMath.getPosition(o.a, o.e ?? 0, (o.theta ?? 0) + (o.inclinationOffset ?? 0));
    p.x = pos.x * AU; p.y = pos.y * AU;
  }
  for (const m of EntityManager.getByTypeInSystem('moon', sysId)) {
    const par = EntityManager.get(m.parentPlanetId), o = m.orbital;
    if (!par) continue;
    const pos = KeplerMath.getPosition(o.a, o.e ?? 0, o.theta ?? 0);
    m.x = par.x + pos.x * AU; m.y = par.y + pos.y * AU;
  }
}

function measure(orbitModel) {
  const per = {};
  for (const seed of SEEDS) {
    quietly(() => buildWorld(seed, orbitModel));
    for (const star of EntityManager.getByType('star')) {
      const sysId = star.systemId ?? 'sys_home';
      const planets = EntityManager.getByTypeInSystem('planet', sysId);
      if (planets.length < 2) continue;
      const c = per[star.spectralType] ??= { systems: 0, k: [], extent: [], trip: [], tripsUnderFloor: 0, trips: 0,
        cover: {}, patrolRing: [], patrolInsideOuter: 0, flybyOverExtent: [], warpOverExtent: [], innerA: [],
        routeRatio: [], routeWp: 0, routes: 0, straightened: 0 };
      c.systems++;
      const k = star.systemScale;
      c.k.push(k);
      const extent = Math.max(...planets.map(p => p.orbital.a * (1 + (p.orbital.e ?? 0))));
      c.extent.push(extent);
      c.innerA.push(Math.min(...planets.map(p => p.orbital.a)));
      const hz = star.habitableZone, hzMid = (hz.min + hz.max) / 2;
      const home = OM.pickHabitableHomeworld(planets, star)
        ?? planets.reduce((b, p) => (Math.abs(Math.log(p.orbital.a / hzMid)) < Math.abs(Math.log(b.orbital.a / hzMid)) ? p : b));
      placeBodies(sysId);
      for (const p of planets) {
        if (p === home) continue;
        // Trasa VesselManager._calcRoute (unikanie Słońca + ciał) przy bieżących fazach: dł. trasy / linia prosta
        const direct = Math.hypot(p.x - home.x, p.y - home.y);
        const route = vm._calcRoute(home.x, home.y, p.x, p.y, sysId);
        if (direct > 1) { c.routes++; c.routeRatio.push(route.totalDist / direct); c.routeWp += route.waypoints.length; }
        const d = Math.hypot(home.orbital.a, p.orbital.a);
        c.trip.push(d); c.trips++;
        if (d / HULLS.hull_small.speedAU < MIN_TRAVEL_YEARS) c.tripsUnderFloor++;
      }
      const area = (r) => Math.min(1, (r * k) ** 2 / extent ** 2);
      const cov = (key, r) => (c.cover[key] ??= []).push(area(r));
      cov('player hull_medium', HULLS.hull_medium.sensorRangeAU);
      cov('player hull_small', HULLS.hull_small.sensorRangeAU);
      cov('AI vessel', DETECTION_BASE_AU);
      OBS_LEVELS_AU.forEach((r, i) => cov(`colony obs L${i}`, r));
      const ring = doctrine._outerRadiusAU(sysId);
      c.patrolRing.push(ring / extent);
      const maxA = Math.max(...planets.map(p => p.orbital.a));
      if (ring <= maxA * 1.05 && ring >= maxA * PATROL_RING_FACTOR * 0.95) c.patrolInsideOuter++;
      c.flybyOverExtent.push(FLYBY_RADIUS_AU * k / extent);
      c.warpOverExtent.push(WARP_EDGE_AU * k / extent);
    }
  }
  return per;
}

const out = { seeds: SEEDS, legacy: measure(1), scaled: measure(2) };
const f = (x, d = 2) => (x == null ? '—' : Number(x).toFixed(d));
console.log(`\n═══ CS-PHYS-b3 — kompaktowe układy (${SEEDS.length} seedów, klimat v2) ═══`);
for (const cls of ['F', 'G', 'K', 'M']) {
  const L = out.legacy[cls], S = out.scaled[cls];
  if (!L || !S) continue;
  console.log(`\n── ${cls}  (układy ${L.systems} → ${S.systems}) ──`);
  console.log(`  k mediana              ${f(med(L.k))} → ${f(med(S.k))}   (min ${f(Math.min(...S.k))})`);
  console.log(`  rozpiętość [AU] med    ${f(med(L.extent), 1)} → ${f(med(S.extent), 1)}`);
  console.log(`  najbliższa orbita med  ${f(med(L.innerA), 3)} → ${f(med(S.innerA), 3)} AU`);
  console.log(`  lot dom→planeta [AU]   med ${f(med(L.trip))} → ${f(med(S.trip))}   p90 ${f(pct(L.trip, 0.9))} → ${f(pct(S.trip, 0.9))}`);
  for (const h of HULL_IDS) {
    const H = HULLS[h];
    const dd = (t) => med(t) / H.speedAU * DAYS_PER_YEAR;
    console.log(`    ${h.padEnd(12)} (${H.speedAU} AU/r, ${H.fuelPerAU}/AU)  czas med ${f(dd(L.trip), 0)} → ${f(dd(S.trip), 0)} dni   paliwo med ${f(med(L.trip) * H.fuelPerAU)} → ${f(med(S.trip) * H.fuelPerAU)}`);
  }
  console.log(`  trasa _calcRoute / prosta: med ${f(med(L.routeRatio), 3)} → ${f(med(S.routeRatio), 3)}  p90 ${f(pct(L.routeRatio, 0.9), 3)} → ${f(pct(S.routeRatio, 0.9), 3)}  waypointów/lot ${f(L.routeWp / L.routes)} → ${f(S.routeWp / S.routes)}`);
  console.log(`  loty pod podłogą 0.008 r: ${L.tripsUnderFloor}/${L.trips} → ${S.tripsUnderFloor}/${S.trips}`);
  for (const key of Object.keys(L.cover)) console.log(`  pokrycie ${key.padEnd(18)} med ${f(med(L.cover[key]) * 100, 1)}% → ${f(med(S.cover[key]) * 100, 1)}%`);
  console.log(`  pierścień patrolu / rozpiętość med ${f(med(L.patrolRing))} → ${f(med(S.patrolRing))}  (pierścień przy zewn. planetach: ${L.patrolInsideOuter}/${L.systems} → ${S.patrolInsideOuter}/${S.systems})`);
  console.log(`  przelot 1. kontaktu / rozpiętość med ${f(med(L.flybyOverExtent))} → ${f(med(S.flybyOverExtent))}`);
  console.log(`  punkt przylotu warp / rozpiętość med ${f(med(L.warpOverExtent))} → ${f(med(S.warpOverExtent))}`);
}
console.log('\n── próbkowanie wejścia w walkę przy 1 r/s (TimeSystem bez podkroków) ──');
for (const fps of [60, 30]) for (const h of ['hull_small', 'hull_cruiser']) {
  const closing = 2 * HULLS[h].speedAU * FAST_YEARS_PER_S / fps;   // AU / klatkę, czołowo
  for (const k of [1, 0.2]) {
    const diam = 2 * COMBAT_ENGAGEMENT_AU * k;
    console.log(`  ${fps} kl/s ${h.padEnd(13)} k=${k}: zbliżenie ${f(closing, 4)} AU/kl vs średnica progu ${f(diam, 3)} AU → ${closing <= diam ? 'OK (zawsze próbka w progu)' : 'RYZYKO przeskoku'}`);
  }
}
const jsonI = argI('--json');
if (jsonI >= 0) writeFileSync(process.argv[jsonI + 1], JSON.stringify(out));
