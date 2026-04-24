// BattleLocation — helper konwersji `battleRec.location` legacy → v66 obiekt.
//
// Kontrakt v66:
//   location: { systemId: string, planetId: string | null, point: { x, y } | null }
//
// Legacy (pre-v66):
//   location: string  // traktowane jako systemId
//
// Migracja SaveMigration._migrateV65toV66 konwertuje wszystkie istniejące
// battleRecs w gameState. Ten helper pokrywa runtime call-sites które
// czytają/tworzą location — backward-compat dla save'ów między migracją
// a nowymi call-sites (commit 4/5) oraz punkt wejścia dla starszych eventów.

/**
 * Normalizuj location do postaci obiektu v66.
 * Akceptuje: string (legacy → {systemId}), null (→ fallback sys_home), obiekt.
 * @param {string | { systemId: string, planetId?: string|null, point?: {x,y}|null } | null | undefined} location
 * @returns {{ systemId: string, planetId: string|null, point: {x:number,y:number}|null }}
 */
export function normalize(location) {
  if (typeof location === 'string') {
    return { systemId: location, planetId: null, point: null };
  }
  if (!location || typeof location !== 'object') {
    return { systemId: 'sys_home', planetId: null, point: null };
  }
  return {
    systemId: location.systemId ?? 'sys_home',
    planetId: location.planetId ?? null,
    point:    location.point ?? null,
  };
}

/**
 * Czy bitwa rozegrała się w deep-space (poza planetą/księżycem)?
 * @param {ReturnType<typeof normalize> | any} location
 * @returns {boolean}
 */
export function isDeepSpace(location) {
  const loc = normalize(location);
  return loc.point !== null;
}
