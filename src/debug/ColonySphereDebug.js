// ColonySphereDebug — pomocniki konsoli bramki ARC COLONY SPHERE, kroki CS-3a / CS-3b / CS-3b-v2.
//
//   csWorlds()  — AKTYWNY układ: seed galaktyki, stan flagi seededSystems, po wierszu na ciało
//                 (rodzaj, typ, ordinal, surfaceSeed, archetype, tidallyLocked — CS-3b; waterBand, waterCoverage,
//                 palette — CS-3b-v2). Bez argumentów, bez cudzysłowów.
//   csArchetypes() — CS-3b: rozkład archetypów ciał po WSZYSTKICH wygenerowanych układach bieżącej gry, per rodzina
//                 (liczby i %), plus ciała bez archetypu i udział tidallyLocked wśród planet; CS-3b-v2: wszystkie
//                 archetypy v2 (księżyce ×5, planetoidy ×2), palety planetoid i podział pasm wody terran.
//   csPeek()    — dla KAŻDEGO wygenerowanego układu obcego: liczby z peekCountsForStar (kontekst świata
//                 z galaxyData — seed + stempel seededSystems, czyli to, co pokazałby skan) vs liczby encji
//                 w EntityManager. Plus `starsDifferFromLegacySeed` — ile z 71 gwiazd daje w TYM świecie
//                 INNE liczby niż dotychczasowe ziarno hashString(starId): wyróżnik trybu świata
//                 (dotychczasowy → 0, seedowany → większość). CS-3a-fix: tryb świata, nie bieżąca flaga —
//                 przełączenie flagi po starcie nie zmienia wyniku.
//
//   csSurface() / csSurfaceAll() — CS-4a: podgląd powierzchni (SurfacePreviewDebug.js); CS-4b: przez SurfaceCache.
//   csCache() — CS-4b: stan SurfaceCache (wpisy, bajty / budżet, trafienia, wyrzucenia, kolejka, worker).
//   csNextSystem() — CS-4b: przełącza widok na NASTĘPNY już wygenerowany układ (w nowej grze: domy imperiów AI) tą
//                    samą drogą co mapa galaktyki (`switchActiveSystem`). Niczego nie generuje; tylko kontrola właściciela
//                    (pokazuje układ AI, którego gracz jeszcze nie odkrył — używać na grze testowej).
//
//   csShared() — CS-6a: A/B wspólnego shadera powierzchni (przełącza FEATURES.sharedSurface i podmienia materiały).
//   csDeck() / csLocked() — CS-6b: kamera na kolejne ciało z pokładem / mgłą (hothouse, cryo_haze, hazy_moon) albo na
//                    planetę związaną pływowo; gdy w układzie nie ma (więcej) — przechodzi do następnego układu.
//   csHaze(v) — CS-6b: nieprzezroczystość pokładu / mgły ciała pod kamerą (0…1); bez argumentu = wartość z archetypu.
//
// Wywołanie: `csWorlds()` / `csPeek()` / `csArchetypes()` (window) albo `KOSMOS.debug.csWorlds()` itd.
// Importowalne pod node (bez THREE) — keeper colony_sphere_seeds_smoke wykonuje oba pomocniki.

import EntityManager from '../core/EntityManager.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { SystemGenerator } from '../generators/SystemGenerator.js';
import { SURFACE_SEED_KINDS } from '../utils/SurfaceSeed.js';
import { BODY_ARCHETYPES, ARCHETYPE_FAMILIES } from '../data/BodyArchetypes.js';
import { familyOf, planetoidPaletteOf } from '../utils/BodyArchetypeLogic.js';
import { HOMEWORLD_TEMP_MIN_C, HOMEWORLD_TEMP_MAX_C } from '../utils/HomeworldClimate.js';
import { climateModelOfWorld, equilibriumK, lookContradicts, KELVIN } from '../utils/ClimateModel.js';
import { orbitModelOfWorld, orbitZoneOf, frostLineAU, scaledMinOrbitAU, compactionOf } from '../utils/OrbitModel.js';
import { csSurface, csSurfaceAll, csCache } from './SurfacePreviewDebug.js';   // CS-4a / CS-4b — podgląd powierzchni + stan cache

function bodyTypeOf(body, kind) {
  if (kind === 'planet')    return body.planetType ?? '?';
  if (kind === 'moon')      return body.moonType ?? '?';
  return body.planetoidType ?? '?';
}

/** Wiersze ciał układu w kolejności EntityManager (== kolejność generacji / zapisu → ordinal). */
export function colonySphereWorldRows(systemId) {
  const rows = [];
  for (const kind of SURFACE_SEED_KINDS) {
    let ordinal = 0;
    for (const b of EntityManager.getByType(kind)) {
      if ((b.systemId ?? 'sys_home') !== systemId) continue;
      rows.push({
        kind, type: bodyTypeOf(b, kind), ordinal: ordinal++, name: b.name, surfaceSeed: b.surfaceSeed ?? null,
        archetype: b.bodyArchetype ?? null, tidallyLocked: b.tidallyLocked ?? null,   // CS-3b
        waterBand: b.waterBand ?? null, waterCoverage: b.waterCoverage ?? null,       // CS-3b-v2 (terran)
        palette: kind === 'planetoid' ? planetoidPaletteOf(b) : null,                 // CS-3b-v2
      });
    }
  }
  return rows;
}

/**
 * CS-3b — rozkład archetypów po wszystkich ciałach w EntityManager (= wszystkie wygenerowane układy gry).
 * CS-3b-v2: + `palettes` (planetoidy: paleta → liczba) i `waterBands` (terran: pasmo → liczba).
 * @returns {{ systems: number, bodies: number, missing: number, tidallyLocked: string, families: Object,
 *            palettes: Object, waterBands: Object }}
 */
export function colonySphereArchetypeCensus() {
  const families = {};
  for (const f of ARCHETYPE_FAMILIES) {
    families[f] = { total: 0, counts: Object.fromEntries(BODY_ARCHETYPES.filter(a => a.family === f).map(a => [a.id, 0])) };
  }
  const systems = new Set();
  let bodies = 0, missing = 0, planets = 0, locked = 0;
  const palettes = { metallic: 0, carbonaceous: 0, silicate: 0, icy: 0 };
  const waterBands = { oceanic: 0, balanced: 0, continental: 0, missing: 0 };
  for (const kind of SURFACE_SEED_KINDS) {
    for (const b of EntityManager.getByType(kind)) {
      bodies++;
      systems.add(b.systemId ?? 'sys_home');
      if (kind === 'planet') { planets++; if (b.tidallyLocked === true) locked++; }
      const fam = families[familyOf(kind, b.planetType)];
      if (b.bodyArchetype == null || !(b.bodyArchetype in fam.counts)) { missing++; continue; }
      fam.total++;
      fam.counts[b.bodyArchetype]++;
      if (kind === 'planetoid') { const pal = planetoidPaletteOf(b); palettes[pal] = (palettes[pal] ?? 0) + 1; }
      if (b.bodyArchetype === 'terran') { const wb = b.waterBand ?? 'missing'; waterBands[wb] = (waterBands[wb] ?? 0) + 1; }
    }
  }
  return { systems: systems.size, bodies, missing, tidallyLocked: `${locked}/${planets}`, families, palettes, waterBands };
}

/** Porównanie peek vs encje dla wygenerowanych układów obcych. */
export function colonySphereGeneratedPeekRows() {
  const K = window.KOSMOS ?? {};
  const seedCtx = SystemGenerator.worldSeedContext(K.galaxyData);   // CS-3a-fix — jak ObservatorySystem
  const ssm = K.starSystemManager;
  const rows = [];
  for (const sys of ssm?.getAllSystems?.() ?? []) {
    if (sys.systemId === 'sys_home') continue;
    const gs = K.galaxyData?.systems?.find(s => s.id === sys.systemId);
    if (!gs) continue;
    const count = (kind) => EntityManager.getByType(kind).filter(b => b.systemId === sys.systemId).length;
    const gen  = { planets: count('planet'), moons: count('moon'), planetoids: count('planetoid') };
    // peek inkrementuje licznik id EntityManager (generateId bez RNG) — jak skan obserwatorium; nieszkodliwe.
    const peek = new SystemGenerator().peekCountsForStar(gs, seedCtx, SystemGenerator.worldOrbitModel(K.galaxyData),
      SystemGenerator.worldClimateModel(K.galaxyData));
    rows.push({
      systemId: sys.systemId,
      genP: gen.planets, peekP: peek.planets,
      genM: gen.moons, peekM: peek.moons,
      genPd: gen.planetoids, peekPd: peek.planetoids,
      match: gen.planets === peek.planets && gen.moons === peek.moons && gen.planetoids === peek.planetoids,
    });
  }
  return rows;
}

/**
 * Ile obcych gwiazd galaktyki daje w kontekście TEGO świata INNE liczby ciał niż ziarno dotychczasowe.
 * CS-3a-fix: porównanie jawnych kontekstów (świat vs `{ seeded: false }`) — bez przełączania flagi
 * (dawny pomocnik był jedynym pisarzem FEATURES.seededSystems w czasie gry). Jak skan obserwatorium,
 * peek zużywa numery id EntityManager (generateId bez RNG) — bez wpływu na rozgrywkę.
 */
export function colonySphereLegacyDiff() {
  const K = window.KOSMOS ?? {};
  const seedCtx = SystemGenerator.worldSeedContext(K.galaxyData);
  const stars = (K.galaxyData?.systems ?? []).filter(s => s.id !== 'sys_home');
  let differ = 0;
  for (const gs of stars) {
    const om     = SystemGenerator.worldOrbitModel(K.galaxyData);   // CS-PHYS-b — ten sam model orbit po obu stronach
    const cm     = SystemGenerator.worldClimateModel(K.galaxyData);  // CS-PHYS-b2 — orbita slotu domu zależy od klimatu
    const cur    = new SystemGenerator().peekCountsForStar(gs, seedCtx, om, cm);
    const legacy = new SystemGenerator().peekCountsForStar(gs, { galaxySeed: seedCtx.galaxySeed, seeded: false }, om, cm);
    if (cur.planets !== legacy.planets || cur.moons !== legacy.moons || cur.planetoids !== legacy.planetoids) differ++;
  }
  return { differ, stars: stars.length };
}

// Finding 770 — LifeSystem gry (GameScene) albo harnessu (keeper podaje K.lifeSystem).
function lifeSystemOf(K) {
  return K.lifeSystem ?? K.gameScene?.lifeSystem ?? null;
}

const round1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

/**
 * Finding 770 — temperatury ciał aktywnego układu: gwiazda układu ciała, temperatureC, pasmo clampu (światy
 * macierzyste) i wartość, którą zapisze najbliższe sprawdzenie LifeSystem (tylko planety; flaga ON).
 */
export function colonySphereTempRows(systemId) {
  const K = window.KOSMOS ?? {};
  const ls = lifeSystemOf(K);
  const flagOn = GAME_CONFIG.FEATURES.lifeTempOwnStar === true;
  const homes = ls?.homeworldIds?.() ?? new Set();
  const rows = [];
  for (const kind of ['planet', 'moon', 'planetoid']) {
    for (const b of EntityManager.getByTypeInSystem(kind, systemId)) {
      const st = EntityManager.getStarOfSystem(b.systemId ?? 'sys_home');
      const home = homes.has(b.id);
      rows.push({
        name: b.name, kind, star: st ? `${st.name} ${st.spectralType ?? ''}`.trim() : null,
        temperatureC: round1(b.temperatureC),
        homeworld: home ? (b.id === K.homePlanet?.id ? 'player' : 'ai') : '',
        clamp: home ? `${HOMEWORLD_TEMP_MIN_C}..${HOMEWORLD_TEMP_MAX_C}` : '',
        nextCheckC: (kind === 'planet' && flagOn && ls?.ownStarTempC) ? round1(ls.ownStarTempC(b, homes)) : null,
      });
    }
  }
  return rows;
}

/**
 * CS-PHYS-a — klimat ciał aktywnego układu: strumień, równowaga, cieplarnia, pływy, temperatura końcowa, zakres
 * dzień/noc (rekord v2), archetyp i niespójność wygląd ↔ temperatura. Ciało bez rekordu (świat dotychczasowy):
 * strumień i równowaga liczone z orbity, cieplarnia = temperatura − równowaga (stała tablica dotychczasowa).
 */
export function colonySphereClimateRows(systemId) {
  const rows = [];
  for (const kind of ['planet', 'moon', 'planetoid']) {
    for (const b of EntityManager.getByTypeInSystem(kind, systemId)) {
      const st = EntityManager.getStarOfSystem(b.systemId ?? 'sys_home');
      const c = b.climate ?? null;
      const parent = kind === 'moon' ? EntityManager.get(b.parentPlanetId) : null;
      const a = kind === 'moon' ? parent?.orbital?.a : b.orbital?.a;
      const L = st?.luminosity;
      const albedo = b.albedo ?? (kind === 'moon' ? (b.moonType === 'icy' ? 0.6 : 0.12) : null);
      const flux = c ? c.flux : (L > 0 && a > 0 ? L / (a * a) : null);
      const eqC = c ? c.eqC : (L > 0 && a > 0 && albedo != null ? equilibriumK(L, a, albedo) - KELVIN : null);
      const T = b.temperatureC;
      rows.push({
        name: b.name, kind, type: b.planetType ?? b.moonType ?? b.planetoidType ?? null, atmosphere: b.atmosphere ?? 'none',
        flux: Number.isFinite(flux) ? Math.round(flux * 1000) / 1000 : null,
        eqC: round1(eqC), greenhouseC: c ? round1(c.greenhouseC) : (eqC != null ? round1(T - eqC) : null),
        tidalC: c ? round1(c.tidalC) : 0, finalC: round1(T),
        dayMaxC: c ? round1(c.dayMaxC) : null, nightMinC: c ? round1(c.nightMinC) : null,
        archetype: b.bodyArchetype ?? null, contradiction: lookContradicts(b.bodyArchetype, T) ? 'yes' : 'no',
        record: c ? 'v2' : 'legacy',
      });
    }
  }
  return rows;
}

const outOfBand = (r) => r.homeworld && !(r.temperatureC >= HOMEWORLD_TEMP_MIN_C && r.temperatureC <= HOMEWORLD_TEMP_MAX_C);

export function colonySphereDebugHelpers() {
  const csWorlds = () => {
    const K = window.KOSMOS ?? {};
    const systemId = K.activeSystemId ?? 'sys_home';
    const rows = colonySphereWorldRows(systemId);
    const missing = rows.filter(r => r.surfaceSeed == null).length;
    const summary = {
      systemId,
      galaxySeed: K.galaxyData?.seed ?? null,
      seededSystems: GAME_CONFIG.FEATURES.seededSystems === true,
      worldSeeded: K.galaxyData?.seededSystems === true,   // CS-3a-fix — tryb świata (stempel z chwili jego tworzenia)
      bodies: rows.length,
      missingSeeds: missing,
      uniqueSeeds: new Set(rows.map(r => r.surfaceSeed)).size,
      missingArchetypes: rows.filter(r => r.archetype == null).length,   // CS-3b — ma być 0
      terranWithoutWaterBand: rows.filter(r => r.archetype === 'terran' && r.waterBand == null).length,   // CS-3b-v2 — 0
    };
    console.log('[csWorlds]', JSON.stringify(summary));
    console.table(rows);
    return summary;
  };
  const csPeek = () => {
    const rows = colonySphereGeneratedPeekRows();
    const summary = {
      seededSystems: GAME_CONFIG.FEATURES.seededSystems === true,
      worldSeeded: window.KOSMOS?.galaxyData?.seededSystems === true,
      galaxySeed: window.KOSMOS?.galaxyData?.seed ?? null,
      generatedForeign: rows.length,
      mismatches: rows.filter(r => !r.match).length,
      emergencySeedUses: SystemGenerator.emergencySeedUses(),   // CS-3a-fix — ścieżka awaryjna: ma być 0
    };
    const diff = colonySphereLegacyDiff();
    summary.starsDifferFromLegacySeed = `${diff.differ}/${diff.stars}`;
    console.log('[csPeek]', JSON.stringify(summary));
    console.table(rows);
    return summary;
  };
  const csArchetypes = () => {
    const c = colonySphereArchetypeCensus();
    const summary = {
      galaxySeed: window.KOSMOS?.galaxyData?.seed ?? null,
      worldSeeded: window.KOSMOS?.galaxyData?.seededSystems === true,
      systems: c.systems, bodies: c.bodies, missingArchetypes: c.missing, tidallyLocked: c.tidallyLocked,
      planetoidPalettes: c.palettes, terranWaterBands: c.waterBands,   // CS-3b-v2
    };
    console.log('[csArchetypes]', JSON.stringify(summary));
    const rows = [];
    for (const [family, f] of Object.entries(c.families)) {
      for (const [id, n] of Object.entries(f.counts)) {
        rows.push({ family, archetype: id, count: n, pct: f.total ? +(100 * n / f.total).toFixed(1) : 0 });
      }
    }
    console.table(rows);
    summary.rows = rows;
    return summary;
  };
  // CS-PHYS-a — csClimate(): klimat ciał aktywnego układu + model klimatu świata (stempel) i stan flagi.
  const csClimate = () => {
    const K = window.KOSMOS ?? {};
    const systemId = K.activeSystemId ?? 'sys_home';
    const rows = colonySphereClimateRows(systemId);
    const summary = {
      systemId,
      climateModel: climateModelOfWorld(K.galaxyData),           // 2 = realistyczny (stempel świata), 1 = dotychczasowy
      worldStamp: K.galaxyData?.climateModel ?? null,
      realisticClimateFlag: GAME_CONFIG.FEATURES.realisticClimate === true,
      bodies: rows.length,
      withV2Record: rows.filter(r => r.record === 'v2').length,
      withDayNight: rows.filter(r => r.dayMaxC != null).length,
      contradictions: rows.filter(r => r.contradiction === 'yes').length,
      playerHome: K.homePlanet ? { name: K.homePlanet.name, finalC: round1(K.homePlanet.temperatureC),
                                   record: K.homePlanet.climate ? 'v2' : 'legacy' } : null,
    };
    console.table(rows);
    console.log('[csClimate]', JSON.stringify(summary));
    return summary;
  };

  // CS-PHYS-b — csOrbits(): gwiazda (klasa, L, HZ, linia mrozu, model orbit świata i gwiazdy) + orbity ciał aktywnego układu.
  const csOrbits = () => {
    const K = window.KOSMOS ?? {};
    const systemId = K.activeSystemId ?? 'sys_home';
    const st = EntityManager.getStarOfSystem(systemId);
    const hz = st?.habitableZone;
    const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
    const rows = EntityManager.getByTypeInSystem('planet', systemId).sort((a, b) => a.orbital.a - b.orbital.a).map(p => ({
      name: p.name, type: p.planetType, orbitAU: r3(p.orbital.a), flux: r3(st?.luminosity / (p.orbital.a ** 2)),
      zone: orbitZoneOf(p.orbital.a, hz), archetype: p.bodyArchetype ?? null, tidallyLocked: p.tidallyLocked === true,
      finalC: round1(p.temperatureC), home: p.id === K.homePlanet?.id || p.lifeScore === 100,
    }));
    const summary = {
      systemId, starClass: st?.spectralType ?? null, luminosity: r3(st?.luminosity),
      hzInnerAU: r3(hz?.min), hzOuterAU: r3(hz?.max), frostLineAU: r3(frostLineAU(hz)),
      orbitModel: orbitModelOfWorld(K.galaxyData), worldStamp: K.galaxyData?.orbitModel ?? null,
      starStamp: st?.orbitModel ?? null, scaledOrbitsFlag: GAME_CONFIG.FEATURES.scaledOrbits === true,
      minOrbitAU: r3(st?.orbitModel === 2 ? scaledMinOrbitAU(st.luminosity) : null),
      compaction: r3(st?.orbitModel === 2 ? compactionOf(st.luminosity) : null),
      // CS-PHYS-b3: k progów rozgrywki (SystemScale; świat dotychczasowy 1) i skala RYSUNKU tarczy (Finding 774)
      systemScale: r3(st?.systemScale ?? null),
      starDrawScale: r3(K.threeRenderer?._starDrawScale ?? null),
      planets: rows.length, inHZ: rows.filter(r => r.zone === 'hz').length,
      tidallyLocked: rows.filter(r => r.tidallyLocked).length,
    };
    console.table(rows);
    console.log('[csOrbits]', JSON.stringify(summary));
    summary.rows = rows;
    return summary;
  };

  // Finding 770 — csTemp(): temperatury aktywnego układu; homeworldsOutOfBand ma być 0.
  const csTemp = () => {
    const K = window.KOSMOS ?? {};
    const systemId = K.activeSystemId ?? 'sys_home';
    const rows = colonySphereTempRows(systemId);
    const summary = {
      systemId,
      lifeTempOwnStar: GAME_CONFIG.FEATURES.lifeTempOwnStar === true,
      bodies: rows.length,
      homeworlds: rows.filter(r => r.homeworld).map(r => `${r.name}=${r.temperatureC}`),
      homeworldsOutOfBand: rows.filter(outOfBand).length,
    };
    console.log('[csTemp]', JSON.stringify(summary));
    console.table(rows);
    return summary;
  };
  // Finding 770 — csLifeTick(): jedno sprawdzenie LifeSystem TERAZ (to samo, co co 1000 lat gry: temperatura + życie).
  const csLifeTick = () => {
    const K = window.KOSMOS ?? {};
    const ls = lifeSystemOf(K);
    if (!ls) { console.warn('[csLifeTick] brak LifeSystem'); return null; }
    const systemId = K.activeSystemId ?? 'sys_home';
    const planets = EntityManager.getByTypeInSystem('planet', systemId);
    const before = new Map(planets.map(p => [p.id, { t: round1(p.temperatureC), life: p.lifeScore ?? 0 }]));
    ls._checkAll();
    const homes = ls.homeworldIds?.() ?? new Set();
    const homeworlds = planets.filter(p => homes.has(p.id)).map(p => ({
      name: p.name, tempBefore: before.get(p.id).t, tempAfter: round1(p.temperatureC),
      lifeBefore: before.get(p.id).life, lifeAfter: p.lifeScore ?? 0,
    }));
    const summary = {
      systemId,
      lifeTempOwnStar: GAME_CONFIG.FEATURES.lifeTempOwnStar === true,
      planets: planets.length,
      changed: planets.filter(p => before.get(p.id).t !== round1(p.temperatureC)).length,
      homeworlds,
      homeworldsOutOfBand: homeworlds.filter(h => !(h.tempAfter >= HOMEWORLD_TEMP_MIN_C && h.tempAfter <= HOMEWORLD_TEMP_MAX_C)).length,
    };
    console.log('[csLifeTick]', JSON.stringify(summary));
    return summary;
  };
  // CS-4b — csNextSystem(): następny wygenerowany układ (kolejność id), cyklicznie.
  const csNextSystem = () => {
    const K = window.KOSMOS ?? {};
    const ssm = K.starSystemManager;
    const ids = (ssm?.getAllSystems?.() ?? []).map(sd => String(sd.systemId ?? sd.id)).filter(Boolean).sort();
    const from = K.activeSystemId ?? 'sys_home';
    if (ids.length < 2) { console.warn('[csNextSystem] brak innego wygenerowanego układu', ids); return { from, to: null, systems: ids.length }; }
    const to = ids[(ids.indexOf(String(from)) + 1) % ids.length];
    const ok = ssm.switchActiveSystem(to) === true;
    const summary = { from, to: ok ? to : null, systems: ids.length, index: ids.indexOf(to) + 1 };
    console.log('[csNextSystem]', JSON.stringify(summary));
    return summary;
  };
  // CS-6a — csShared(): przełącza FEATURES.sharedSurface i OD RAZU podmienia materiały ciał aktywnego układu
  // (ThreeRenderer.rebuildBodySurfaces — bez ruszania kamery i siatek), żeby właściciel mógł porównać A/B w miejscu.
  const csShared = () => {
    const F = GAME_CONFIG.FEATURES;
    F.sharedSurface = !F.sharedSurface;
    const tr = window.KOSMOS?.threeRenderer;
    const t0 = performance.now();
    const bodies = tr?.rebuildBodySurfaces?.() ?? 0;
    const summary = { sharedSurface: F.sharedSurface, swapped: bodies, rebuildMs: Math.round(performance.now() - t0), ...(tr?.sharedSurfaceStats?.() ?? {}) };
    console.log('[csShared]', JSON.stringify(summary));
    return summary;
  };
  // CS-6b — csDeck() / csLocked(): pokaż kolejne ciało z pokładem lub mgłą (hothouse / cryo_haze / hazy_moon) albo
  // planetę związaną pływowo. Najpierw aktywny układ (kolejne wywołania przechodzą po jego ciałach), potem następne
  // wygenerowane układy (csNextSystem), aż coś znajdzie. Kamera renderera zbliża się do ciała od strony dnia.
  const DECK_ARCHETYPES = new Set(['hothouse', 'cryo_haze', 'hazy_moon']);
  const seen = { deck: new Set(), locked: new Set() };
  const csFind = (kind, test) => {
    const K = window.KOSMOS ?? {}, tr = K.threeRenderer, em = K.entityManager;
    const systems = (K.starSystemManager?.getAllSystems?.() ?? []).length || 1;
    for (let hop = 0; hop <= systems; hop++) {
      const sys = K.activeSystemId ?? 'sys_home';
      const bodies = [...(em?.getByTypeInSystem?.('planet', sys) ?? []), ...(em?.getByTypeInSystem?.('moon', sys) ?? [])].filter(test);
      const body = bodies.find(b => !seen[kind].has(b.id));
      if (body) {
        seen[kind].add(body.id);
        const mesh = tr?._planets?.get(body.id)?.group ?? tr?._moons?.get(body.id)?.mesh;
        const cc = tr?._cameraController;
        if (mesh && cc) {
          tr._focusVesselId = null; tr._focusStationId = null; tr._focusEntityId = body.id;
          const r = tr._getEntityRadius(body);
          cc.setMinDist?.(0.05);
          cc.applyView({ target: { x: mesh.position.x, y: 0, z: mesh.position.z }, theta: Math.atan2(-mesh.position.z, -mesh.position.x) + 0.96, phi: 1.22, dist: Math.max(r * 4.2, 0.12) });
        }
        const summary = { system: sys, body: body.name, id: body.id, archetype: body.bodyArchetype, atmosphere: body.atmosphere ?? null,
          tidallyLocked: body.tidallyLocked === true, hazeOpacity: tr?.bodyHazeOpacity?.(body.id) ?? null, moreHere: bodies.filter(b => !seen[kind].has(b.id)).length };
        console.log(`[cs${kind === 'deck' ? 'Deck' : 'Locked'}]`, JSON.stringify(summary));
        return summary;
      }
      if (!csNextSystem().to) break;
    }
    seen[kind].clear();
    console.warn(`[cs${kind === 'deck' ? 'Deck' : 'Locked'}] nic więcej w wygenerowanych układach — kolejne wywołanie zaczyna od początku`);
    return null;
  };
  const csDeck = () => csFind('deck', b => DECK_ARCHETYPES.has(b.bodyArchetype));
  const csLocked = () => csFind('locked', b => b.type === 'planet' && b.bodyArchetype === 'tidally_locked');   // D-CS-23: tylko archetyp (sama flaga nie zatrzymuje obrotu)
  // CS-6b — csHaze(v): nieprzezroczystość pokładu / mgły ciała pod kamerą (0…1) — JEDEN parametr, który CS-7 rozrzedzi
  // w widoku kolonii. csHaze() bez argumentu przywraca wartość z archetypu. Tylko podgląd (nic nie zapisuje).
  const csHaze = (value) => {
    const tr = window.KOSMOS?.threeRenderer;
    const id = tr?._focusEntityId, rec = id != null ? tr?._sharedSurfaces?.get(id) : null;
    if (!rec?.air) { console.warn('[csHaze] ciało pod kamerą nie ma powłoki powietrza (najpierw csDeck())'); return null; }
    const set = tr.bodyHazeOpacity(id, value === undefined ? rec.air.look.hazeOpacity : value);
    const summary = { id, archetype: rec.body.bodyArchetype, hazeOpacity: set, archetypeDefault: rec.air.look.hazeOpacity };
    console.log('[csHaze]', JSON.stringify(summary));
    return summary;
  };
  return { csWorlds, csPeek, csArchetypes, csTemp, csLifeTick, csClimate, csOrbits, csSurface, csSurfaceAll, csCache, csNextSystem, csShared, csDeck, csLocked, csHaze };
}
