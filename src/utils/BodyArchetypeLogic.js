// BodyArchetypeLogic — czysty selektor archetypu ciała (ARC COLONY SPHERE, kroki CS-3b + CS-3b-v2; COLONY_SPHERE_PLAN §2, §3.3).
//
// select(bodyParams, starContext, surfaceSeed) → id archetypu z `src/data/BodyArchetypes.js`.
//   • DETERMINISTYCZNY: te same parametry + to samo ziarno = ten sam wynik; zero `Math.random`, zero stanu.
//   • TOTALNY: każde ciało dostaje poprawny archetyp SWOJEJ rodziny (fallback priority 0 w każdej rodzinie).
//   • Remis (równy najwyższy priorytet) rozstrzyga WYŁĄCZNIE `surfaceSeed` (mixSeed → indeks wśród remisujących,
//     w kolejności tabeli).
//   • Wejścia wyłącznie z ZAPISANYCH parametrów: planetType / moonType / planetoidType, temperatura, atmosfera,
//     composition.H2O, masa, lifeScore, tidallyLocked (zapisana flaga), klasa gwiazdy (przez tidallyLocked),
//     CS-3b-v2: strumień gwiazdy S = L/a² (jasność gwiazdy + orbita ciała albo rodzica), typ planety-rodzica i strefa
//     księżyca wśród księżyców rodzica (kontekst z `archetypeContext`).
//   • Terran dostaje też zamrożone `waterBand` + `waterCoverage` (czysty hash ziarna + H2O, WATER_BANDS).
//
// Zapis i zamrożenie (D-CS-2): `assignBodyArchetype` niżej (`body.bodyArchetype ??=`; nazwa pola odróżnia archetyp
// CIAŁA od archetypu IMPERIUM — `empire.archetype`, EmpireData.ARCHETYPES). Ten moduł nie zna
// EntityManager, window ani EventBus — importuje tylko czyste dane i SeedMath (Node-testowalny).

import {
  BODY_ARCHETYPES, ARCHETYPE_BY_ID, GRID_LARGE_ROCKY_MASS,
  TIDAL_LOCK_BASE_AU, STAR_CLASS_MASS, STAR_CLASS_MASS_DEFAULT,
  STAR_CLASS_LUMINOSITY, STAR_CLASS_LUMINOSITY_DEFAULT, MOON_ZONE_INNER, MOON_ZONE_MID,
  WATER_BANDS, WATER_H2O_REF, WATER_H2O_GAIN, WATER_H2O_SHIFT_MAX,
} from '../data/BodyArchetypes.js';
import { mixSeed } from './SeedMath.js';

// Sól remisu — inna niż sole SurfaceSeed / strumienia układu, żeby wybór w remisie nie korelował z niczym innym.
const TIE_SALT = 0xA7C4E7B3;
// Sól pasma wody terran — niezależna od remisu (inaczej świat z remisu korelowałby z pasmem).
const WATER_SALT = 0x5EA1B0D7;
/** Archetyp domowy każdego imperium (gracz i AI) — właściciel, pkt 5 (CS-3b-v2). */
export const HOMEWORLD_ARCHETYPE = 'terran';

/** Rodzina archetypu dla ciała: 'planet' | 'gas' | 'moon' | 'planetoid'. */
export function familyOf(kind, planetType) {
  if (kind === 'moon') return 'moon';
  if (kind === 'planetoid') return 'planetoid';
  return planetType === 'gas' ? 'gas' : 'planet';
}

/** Temperatura °C z encji/rekordu — ten sam porządek co `resolveTextureType` (temperatureC, potem temperatureK). */
function tempCOf(body) {
  if (typeof body.temperatureC === 'number' && Number.isFinite(body.temperatureC)) return body.temperatureC;
  if (typeof body.temperatureK === 'number' && body.temperatureK) return body.temperatureK - 273.15;
  return null;
}

/**
 * Rotacja związana z gwiazdą (D-CS-1): planeta z a < TIDAL_LOCK_BASE_AU · ∛M_klasy. Księżyc / planetoida → false.
 * Czysta funkcja orbity i klasy — NIE losuje (wołana przy generacji i przy `??=` po wczytaniu).
 * @param {string} kind — 'planet' | 'moon' | 'planetoid'
 * @param {number} a — półoś wielka orbity wokół gwiazdy [AU]
 * @param {string} spectralType — klasa widmowa gwiazdy ('M','K','G','F')
 */
export function deriveTidallyLocked(kind, a, spectralType) {
  if (kind !== 'planet') return false;
  if (typeof a !== 'number' || !Number.isFinite(a) || a <= 0) return false;
  const m = STAR_CLASS_MASS[spectralType] ?? STAR_CLASS_MASS_DEFAULT;
  return a < TIDAL_LOCK_BASE_AU * Math.cbrt(m);
}

/** Jasność gwiazdy [L☉]: zapisana `luminosity`, inaczej z klasy widmowej. */
function luminosityOf(ctx) {
  const L = Number(ctx?.luminosity);
  if (Number.isFinite(L) && L > 0) return L;
  return STAR_CLASS_LUMINOSITY[ctx?.spectralType] ?? STAR_CLASS_LUMINOSITY_DEFAULT;
}

/**
 * Strumień gwiazdy na orbicie ciała S = L/a² [S⊕]. Księżyc: półoś RODZICA wokół gwiazdy (rodzic z kontekstu);
 * bez rodzica / bez orbity → null (klauzule `flux` nie pasują, zostaje reszta reguł i fallback).
 */
export function fluxOf(body, ctx) {
  let a;
  if (body?.type === 'moon') {
    const parent = ctx?.parentById?.get?.(body.parentPlanetId) ?? null;
    a = parent?.orbital?.a ?? parent?.a;
  } else {
    a = body?.orbital?.a ?? body?.a;
  }
  if (typeof a !== 'number' || !Number.isFinite(a) || a <= 0) return null;
  return luminosityOf(ctx) / (a * a);
}

/** Strefa księżyca wśród księżyców rodzica posortowanych po półosi: ranga r z n → inner / mid / outer. */
export function moonZoneOfRank(rank, count) {
  if (!(count > 0) || !(rank >= 0)) return null;
  if (rank < count * MOON_ZONE_INNER) return 'inner';
  if (rank < count * MOON_ZONE_MID) return 'mid';
  return 'outer';
}

/**
 * Kontekst selektora dla JEDNEGO układu: gwiazda (klasa, jasność), rodzice księżyców, strefy księżyców.
 * Księżyce grupowane po `parentPlanetId`, sortowane po półosi (remis: id) — deterministycznie, bez RNG.
 * @param {{spectralType?: string, luminosity?: number}|null} star
 * @param {Array} planets — planety układu (rodzice księżyców)
 * @param {Array} moons — księżyce układu
 */
export function archetypeContext(star, planets = [], moons = []) {
  const parentById = new Map();
  for (const p of planets) if (p?.id != null) parentById.set(p.id, p);
  const byParent = new Map();
  for (const m of moons) {
    if (!m || m.parentPlanetId == null) continue;
    if (!byParent.has(m.parentPlanetId)) byParent.set(m.parentPlanetId, []);
    byParent.get(m.parentPlanetId).push(m);
  }
  const moonZoneById = new Map();
  for (const arr of byParent.values()) {
    arr.sort((x, y) => ((x.orbital?.a ?? x.a ?? 0) - (y.orbital?.a ?? y.a ?? 0)) || String(x.id).localeCompare(String(y.id)));
    arr.forEach((m, i) => moonZoneById.set(m.id, moonZoneOfRank(i, arr.length)));
  }
  return {
    spectralType: star?.spectralType ?? null,
    luminosity:   star?.luminosity ?? null,
    parentById, moonZoneById,
  };
}

/** Parametry selektora z encji lub rekordu zapisu (pola jak w Planet / Moon / Planetoid) + kontekst układu. */
export function bodyParamsOf(body, ctx = null) {
  const parent = body?.type === 'moon' ? (ctx?.parentById?.get?.(body.parentPlanetId) ?? null) : null;
  return {
    kind:          body.type,
    planetType:    body.planetType ?? null,
    moonType:      body.moonType ?? null,
    planetoidType: body.planetoidType ?? null,
    tempC:         tempCOf(body),
    atmosphere:    body.atmosphere ?? 'none',
    h2o:           Number(body.composition?.H2O) || 0,
    mass:          body.physics?.mass ?? body.mass ?? null,
    lifeScore:     Number(body.lifeScore) || 0,
    tidallyLocked: body.tidallyLocked === true,
    flux:          fluxOf(body, ctx),
    parentType:    parent?.planetType ?? null,
    moonZone:      body?.type === 'moon' ? (ctx?.moonZoneById?.get?.(body.id) ?? null) : null,
  };
}

function inOpenRange(v, range) {
  if (v === null || v === undefined || !Number.isFinite(v)) return false;
  const [min, max] = range;
  if (min !== null && min !== undefined && !(v > min)) return false;
  if (max !== null && max !== undefined && !(v < max)) return false;
  return true;
}

/** Czy klauzula pasuje do parametrów (wszystkie podane warunki). */
export function clauseMatches(clause, p) {
  if (clause.planetType && !clause.planetType.includes(p.planetType)) return false;
  if (clause.moonType && !clause.moonType.includes(p.moonType)) return false;
  if (clause.planetoidType && !clause.planetoidType.includes(p.planetoidType)) return false;
  if (clause.atmosphere && !clause.atmosphere.includes(p.atmosphere)) return false;
  if (clause.tempC && !inOpenRange(p.tempC, clause.tempC)) return false;
  if (clause.h2o && !inOpenRange(p.h2o, clause.h2o)) return false;
  if (clause.mass && !inOpenRange(p.mass, clause.mass)) return false;
  if (clause.lifeMin !== undefined && !(p.lifeScore >= clause.lifeMin)) return false;
  if (clause.tidallyLocked !== undefined && p.tidallyLocked !== clause.tidallyLocked) return false;
  if (clause.flux && !inOpenRange(p.flux, clause.flux)) return false;
  if (clause.parentType && !clause.parentType.includes(p.parentType)) return false;
  if (clause.moonZone && !clause.moonZone.includes(p.moonZone)) return false;
  return true;
}

/** Wynik wiersza = najwyższy priorytet pasującej klauzuli; -1 gdy żadna. */
export function scoreArchetype(row, p) {
  let best = -1;
  for (const c of row.match) if (clauseMatches(c, p) && c.priority > best) best = c.priority;
  return best;
}

/**
 * Kandydaci z najwyższym wynikiem w rodzinie (kolejność tabeli). Do diagnostyki i keeperów.
 * @returns {{ family: string, score: number, ids: string[] }}
 */
export function candidatesFor(bodyParams) {
  const family = familyOf(bodyParams.kind, bodyParams.planetType);
  let score = -1, ids = [];
  for (const row of BODY_ARCHETYPES) {
    if (row.family !== family) continue;
    const s = scoreArchetype(row, bodyParams);
    if (s > score) { score = s; ids = [row.id]; }
    else if (s === score && s >= 0) ids.push(row.id);
  }
  return { family, score, ids };
}

/**
 * @param {object} bodyParams — z `bodyParamsOf(body)`
 * @param {object} [starContext] — kontekst układu; selektor czyta gwiazdę / rodzica WYŁĄCZNIE przez `bodyParams`
 *   (tidallyLocked, flux, parentType, moonZone — `bodyParamsOf(body, ctx)`). Parametr zostaje w sygnaturze (§2).
 * @param {number} surfaceSeed — uint32; jedyne źródło rozstrzygnięcia remisu (null/NaN → 0)
 * @returns {string} id archetypu
 */
export function select(bodyParams, starContext, surfaceSeed) {
  const { ids } = candidatesFor(bodyParams);
  if (ids.length === 1) return ids[0];
  // ids nigdy nie jest puste: każda rodzina ma klauzulę fallback bez warunków (keeper „totalny").
  const pick = mixSeed(((Number(surfaceSeed) >>> 0) ^ TIE_SALT) >>> 0) % ids.length;
  return ids[pick];
}

/**
 * Klasa rozmiaru siatki (D-CS-8) → klucz `GRID_TILE_COUNTS`. Archetyp z `gridClass: 'by_mass'` rozstrzyga typem
 * i masą ciała: hot_rocky → hot_rocky; ice / rocky ≤ 1.5 M⊕ → small_rocky; rocky > 1.5 M⊕ → large_rocky.
 */
export function gridClassFor(archetypeId, body) {
  const row = ARCHETYPE_BY_ID[archetypeId];
  if (row && row.gridClass !== 'by_mass') return row.gridClass;
  const pt = body?.planetType;
  if (pt === 'hot_rocky') return 'hot_rocky';
  if (pt === 'ice') return 'small_rocky';
  const mass = body?.physics?.mass ?? body?.mass ?? 0;
  return mass > GRID_LARGE_ROCKY_MASS ? 'large_rocky' : 'small_rocky';
}

/**
 * Pasmo wody terran z ziarna + H2O (czysty hash, zero RNG): s = u(seed) + clamp(gain·(H2O − ref)), obcięte do [0, 1);
 * pasma WATER_BANDS po kolei wg udziału, pokrycie liniowo w paśmie (lo…hi), zaokrąglone do 0.001.
 * @returns {{ waterBand: string, waterCoverage: number }}
 */
export function waterBandOf(surfaceSeed, h2o) {
  const u = mixSeed(((Number(surfaceSeed) >>> 0) ^ WATER_SALT) >>> 0) / 4294967296;
  const shift = Math.max(-WATER_H2O_SHIFT_MAX, Math.min(WATER_H2O_SHIFT_MAX, WATER_H2O_GAIN * ((Number(h2o) || 0) - WATER_H2O_REF)));
  const sc = Math.min(0.999999, Math.max(0, u + shift));
  let lo = 0;
  for (let i = 0; i < WATER_BANDS.length; i++) {
    const band = WATER_BANDS[i];
    const hi = lo + band.share;
    if (sc < hi || i === WATER_BANDS.length - 1) {
      const t = Math.min(1, Math.max(0, (sc - lo) / band.share));
      return { waterBand: band.id, waterCoverage: Math.round((band.lo + t * (band.hi - band.lo)) * 1000) / 1000 };
    }
    lo = hi;
  }
  return null;   // nieosiągalne: ostatnie pasmo zawsze zwraca
}

/** Paleta planetoidy: lodowa dla `planetoid_icy`, inaczej rozgrywkowy `planetoidType` (CS-3b-v2). */
export function planetoidPaletteOf(body) {
  if (body?.bodyArchetype === 'planetoid_icy') return 'icy';
  return body?.planetoidType ?? null;
}

/**
 * Nadaje ciału `tidallyLocked ??=`, `bodyArchetype ??=` i — dla terran — `waterBand ??=` / `waterCoverage ??=`
 * (D-CS-2: istniejący archetyp NIGDY nie jest wybierany ponownie). Zapisany id SPOZA tabeli (np. `toxic`,
 * `rocky_moon`, `icy_moon` z niezacommitowanego CS-3b v1) nie jest archetypem → wybór od nowa (decyzja CC, §3.3).
 * Archetyp wymaga ziarna powierzchni (remis); bez `surfaceSeed` zostawia `bodyArchetype` puste (nada je późniejszy pass).
 * @param {object} body — encja Planet / Moon / Planetoid (albo rekord o tych polach)
 * @param {object} ctx — `archetypeContext(star, planets, moons)` albo `{spectralType, luminosity}`
 * @param {{homeworld?: boolean}} [opts] — homeworld: planeta domowa imperium → zawsze HOMEWORLD_ARCHETYPE (pkt 5)
 * @returns {boolean} true gdy nadano archetyp
 */
export function assignBodyArchetype(body, ctx, opts = {}) {
  if (!body) return false;
  if (body.tidallyLocked == null) {
    const a = body.orbital?.a ?? body.a;
    body.tidallyLocked = deriveTidallyLocked(body.type, a, ctx?.spectralType);
  }
  if (body.bodyArchetype != null && !ARCHETYPE_BY_ID[body.bodyArchetype]) body.bodyArchetype = null;
  let assigned = false;
  if (body.bodyArchetype == null && body.surfaceSeed != null) {
    body.bodyArchetype = (opts.homeworld && body.type === 'planet')
      ? HOMEWORLD_ARCHETYPE
      : select(bodyParamsOf(body, ctx), ctx, body.surfaceSeed);
    assigned = true;
  }
  if (body.bodyArchetype === 'terran' && body.surfaceSeed != null && (body.waterBand == null || body.waterCoverage == null)) {
    const w = waterBandOf(body.surfaceSeed, body.composition?.H2O);
    body.waterBand ??= w.waterBand;
    body.waterCoverage ??= w.waterCoverage;
  }
  return assigned;
}
