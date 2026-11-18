// ColonySphereDebug — pomocniki konsoli bramki ARC COLONY SPHERE, krok CS-3a.
//
//   csWorlds()  — AKTYWNY układ: seed galaktyki, stan flagi seededSystems, po wierszu na ciało
//                 (rodzaj, typ, ordinal, surfaceSeed). Bez argumentów, bez cudzysłowów.
//   csPeek()    — dla KAŻDEGO wygenerowanego układu obcego: liczby z peekCountsForStar (kontekst świata
//                 z galaxyData — seed + stempel seededSystems, czyli to, co pokazałby skan) vs liczby encji
//                 w EntityManager. Plus `starsDifferFromLegacySeed` — ile z 71 gwiazd daje w TYM świecie
//                 INNE liczby niż dotychczasowe ziarno hashString(starId): wyróżnik trybu świata
//                 (dotychczasowy → 0, seedowany → większość). CS-3a-fix: tryb świata, nie bieżąca flaga —
//                 przełączenie flagi po starcie nie zmienia wyniku.
//
// Wywołanie: `csWorlds()` / `csPeek()` (window) albo `KOSMOS.debug.csWorlds()` / `KOSMOS.debug.csPeek()`.
// Importowalne pod node (bez THREE) — keeper colony_sphere_seeds_smoke wykonuje oba pomocniki.

import EntityManager from '../core/EntityManager.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { SystemGenerator } from '../generators/SystemGenerator.js';
import { SURFACE_SEED_KINDS } from '../utils/SurfaceSeed.js';

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
      rows.push({ kind, type: bodyTypeOf(b, kind), ordinal: ordinal++, name: b.name, surfaceSeed: b.surfaceSeed ?? null });
    }
  }
  return rows;
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
  return { csWorlds, csPeek };
}
