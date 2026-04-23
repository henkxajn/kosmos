// FleetCompositionPolicy — czysta funkcja: strength → lista statków (hull + modules).
//
// W M1 (Milestone 1 — Commit 7) uproszczony algorytm (docs/design §7.2):
//   count = clamp(2, floor(strength/50), MAX_MATERIALIZED_VESSELS_PER_FLEET)
//   mix: rozkład ról wg empire.archetype
//
// Statki są bez modułów — używają bazowej konfiguracji kadłuba. Uproszczenie M1.
// M2: doprecyzowanie modułów (weapon + engine + defense per archetype).

export const MAX_MATERIALIZED_VESSELS_PER_FLEET = 8;

// Rozkład ról per archetyp imperium (procent).
// Domyślnie: balanced — warship/transport/scout.
const _ARCHETYPE_MIX = {
  hegemon:      [['warship', 70], ['transport', 20], ['scout', 10]],
  xenophage:    [['warship', 70], ['transport', 20], ['scout', 10]],
  isolationist: [['warship', 50], ['scout', 50]],
  trader:       [['cargo', 40], ['scout', 40], ['warship', 20]],
  swarm:        [['scout', 90], ['warship', 10]],
  default:      [['warship', 50], ['transport', 25], ['scout', 25]],
};

// Mapowanie rola → hullId (muszą istnieć w HullsData).
const _ROLE_TO_HULL = {
  warship:   'hull_frigate',
  transport: 'hull_large',
  scout:     'hull_small',
  cargo:     'hull_medium',
  default:   'hull_small',
};

function _clamp(min, val, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Deterministyczny rozkład `total` między role mix'a.
 * Pierwszy element mix'a dostaje remainder (zaokrąglenie).
 */
function _distribute(total, mix) {
  const counts = {};
  let assigned = 0;
  for (const [role, share] of mix) {
    const n = Math.floor((total * share) / 100);
    counts[role] = n;
    assigned += n;
  }
  const remainder = total - assigned;
  if (remainder > 0 && mix.length > 0) {
    const firstRole = mix[0][0];
    counts[firstRole] = (counts[firstRole] ?? 0) + remainder;
  }
  return counts;
}

/**
 * Skomponuj listę vessel-defs z abstract strength + empire.
 *
 * @param {number} strength — fleet.strength (abstract siła)
 * @param {object} empire — empire object (używamy .archetype dla mix)
 * @returns {Array<{ hullId: string, modules: string[], role: string }>}
 */
export function composeFromStrength(strength, empire) {
  const count = _clamp(
    2,
    Math.floor((strength ?? 0) / 50),
    MAX_MATERIALIZED_VESSELS_PER_FLEET,
  );
  const archetype = empire?.archetype ?? 'default';
  const mix = _ARCHETYPE_MIX[archetype] ?? _ARCHETYPE_MIX.default;
  const roleCounts = _distribute(count, mix);

  const result = [];
  for (const [role, n] of Object.entries(roleCounts)) {
    for (let i = 0; i < n; i++) {
      result.push({
        hullId:  _ROLE_TO_HULL[role] ?? _ROLE_TO_HULL.default,
        modules: [],
        role,
      });
    }
  }
  return result;
}
