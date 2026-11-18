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
// Wywołanie: `csWorlds()` / `csPeek()` / `csArchetypes()` (window) albo `KOSMOS.debug.csWorlds()` itd.
// Importowalne pod node (bez THREE) — keeper colony_sphere_seeds_smoke wykonuje oba pomocniki.

import EntityManager from '../core/EntityManager.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { SystemGenerator } from '../generators/SystemGenerator.js';
import { SURFACE_SEED_KINDS } from '../utils/SurfaceSeed.js';
import { BODY_ARCHETYPES, ARCHETYPE_FAMILIES } from '../data/BodyArchetypes.js';
import { familyOf, planetoidPaletteOf } from '../utils/BodyArchetypeLogic.js';
import { HOMEWORLD_TEMP_MIN_C, HOMEWORLD_TEMP_MAX_C } from '../utils/HomeworldClimate.js';

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
    const peek = new SystemGenerator().peekCountsForStar(gs, seedCtx);
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
    const cur    = new SystemGenerator().peekCountsForStar(gs, seedCtx);
    const legacy = new SystemGenerator().peekCountsForStar(gs, { galaxySeed: seedCtx.galaxySeed, seeded: false });
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
  return { csWorlds, csPeek, csArchetypes, csTemp, csLifeTick };
}
