// SurfaceSeed — ziarno powierzchni ciała (ARC COLONY SPHERE, krok CS-3a; COLONY_SPHERE_PLAN §2, §0b).
//
// Każda planeta (także gazowa), księżyc i planetoida dostaje JEDNO ziarno uint32, z którego kolejne
// kroki (CS-4 SurfaceField, CS-6 shader) wygenerują powierzchnię. Ziarno jest:
//   • STRUKTURALNE — f(galaxySeed, systemId, rodzaj, ordinal), NIGDY `body.id`: id to globalny
//     licznik `entity_N` zależny od kolejności odwiedzin układów (EntityManager.js:19-21);
//   • CZYSTYM HASHEM liczonym PO generacji — nigdy rzutem ze strumienia RNG układu: rzut przesunąłby
//     każdy obcy układ i rozjechał `peekCountsForStar` z generacją;
//   • ZAPISYWANE na ciele (`body.surfaceSeed`), a przy wczytaniu starego zapisu nadawane przez `??=`
//     (bez bumpu wersji zapisu, D-CS-4). Zapisane ziarno jest prawdą — przyszła zmiana generatora
//     nie przemaluje istniejących światów.
//
// ordinal = indeks ciała danego rodzaju w obrębie jego układu, w kolejności generacji. Kolejność
// generacji == kolejność wstawienia do EntityManager == kolejność tablic w zapisie (SaveSystem
// serializuje `EntityManager.getByType(kind)`, a `_restoreSystem` wstawia z powrotem w tej samej
// kolejności). Dlatego dla starego zapisu ordinal odzyskujemy jako indeks wśród ZAPISANYCH ciał
// danego rodzaju w danym układzie (`assignSurfaceSeeds`). ⚠ Ciało zniszczone przed zapisem (kolizja)
// przesuwa indeksy następnych — dla starych zapisów to tylko inna (wciąż deterministyczna) powierzchnia,
// bo nic jej wcześniej nie pokazywało; nowe zapisy niosą ziarno i ten problem ich nie dotyczy.
//
// CZYSTY moduł: bez `window`, bez `Math.random`, bez stanu, jedyna zależność to SeedMath.

import { combineSeeds, hashStringToInt } from './SeedMath.js';

/** Rodzaje ciał z powierzchnią — wartości `entity.type`. Gazowy olbrzym to `planet` (planetType 'gas'). */
export const SURFACE_SEED_KINDS = Object.freeze(['planet', 'moon', 'planetoid']);

/** Układ domyślny dla rekordów bez `systemId` — ten sam fallback co SaveSystem / _restoreSystem. */
export const SURFACE_SEED_DEFAULT_SYSTEM = 'sys_home';

// Sól domeny „powierzchnia" — inna niż sól strumienia układu (SystemGenerator, D-CS-17), więc
// ziarno powierzchni nie koreluje z fizyką ciała wylosowaną z tego samego galaxySeed.
const SURFACE_SALT = 0x5C5EED03;

/**
 * @param {number} galaxySeed — seed galaktyki (`galaxyData.seed`, int32; ujemny poprawny)
 * @param {string} systemId — `sys_home` / `sys_NNN`
 * @param {'planet'|'moon'|'planetoid'} kindTag — `entity.type`
 * @param {number} ordinal — indeks ciała tego rodzaju w układzie (≥ 0, całkowity)
 * @returns {number} uint32
 */
export function surfaceSeedFor(galaxySeed, systemId, kindTag, ordinal) {
  if (typeof galaxySeed !== 'number' || !Number.isFinite(galaxySeed)) {
    throw new TypeError(`[SurfaceSeed] galaxySeed musi być liczbą — dostał ${String(galaxySeed)}`);
  }
  if (typeof systemId !== 'string' || systemId.length === 0) {
    throw new TypeError(`[SurfaceSeed] systemId musi być niepustym stringiem — dostał ${String(systemId)}`);
  }
  if (!SURFACE_SEED_KINDS.includes(kindTag)) {
    throw new TypeError(`[SurfaceSeed] nieznany rodzaj ciała: ${String(kindTag)}`);
  }
  if (!Number.isInteger(ordinal) || ordinal < 0) {
    throw new TypeError(`[SurfaceSeed] ordinal musi być całkowity ≥ 0 — dostał ${String(ordinal)}`);
  }
  return combineSeeds(SURFACE_SALT, galaxySeed | 0, hashStringToInt(systemId), hashStringToInt(kindTag), ordinal);
}

/**
 * Nadaje `surfaceSeed ??=` ciałom podanym per rodzaj. Ciała mogą pochodzić z wielu układów —
 * ordinal liczony jest osobno dla każdej pary (rodzaj, systemId), w kolejności tablicy. Ciała,
 * które już mają ziarno, ZACHOWUJĄ je, ale zajmują swój indeks (ordinal = pozycja w zapisie).
 *
 * @param {{planet?: Array, moon?: Array, planetoid?: Array}} bodiesByKind — encje albo rekordy zapisu
 * @param {number} galaxySeed — brak liczby ⇒ nic nie nadajemy (zwraca 0); wołający loguje
 * @returns {number} liczba nadanych ziaren
 */
export function assignSurfaceSeeds(bodiesByKind, galaxySeed) {
  if (typeof galaxySeed !== 'number' || !Number.isFinite(galaxySeed)) return 0;
  let assigned = 0;
  for (const kind of SURFACE_SEED_KINDS) {
    const list = bodiesByKind?.[kind] ?? [];
    const nextOrdinal = new Map();   // systemId → kolejny ordinal
    for (const body of list) {
      if (!body) continue;
      const systemId = body.systemId ?? SURFACE_SEED_DEFAULT_SYSTEM;
      const ordinal  = nextOrdinal.get(systemId) ?? 0;
      nextOrdinal.set(systemId, ordinal + 1);
      if (body.surfaceSeed == null) {
        body.surfaceSeed = surfaceSeedFor(galaxySeed, systemId, kind, ordinal);
        assigned++;
      }
    }
  }
  return assigned;
}
