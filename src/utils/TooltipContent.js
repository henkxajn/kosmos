// ── M3 P1.5 — Tooltip content lookup (pure helper) ──────────────────────
// Pure functions zwracające schema tooltip dla danej encji. Dep injection
// (flag #2 z aprobaty): getTooltipContent(entityType, entity, deps) gdzie
// deps = { t, colonyManager, empireRegistry } — testowalne offline z mockami.
//
// L24 mandate (robust schema): graceful skip linii dla missing fields.
//   - vessel.hp NIE ISTNIEJE na entity (off-spec #1) → no HP line.
//   - vessel.empire NIE ISTNIEJE → resolve przez _resolveVesselEmpireName
//     (flag #1: multi-shape isEnemy / owner / ownerEmpireId).
//   - planet.owner NIE ISTNIEJE na entity → colonyManager.getColony(planetId).
//   - planet.population NIE ISTNIEJE na entity → colony.civSystem.population.
//   - planet.systemName brak (off-spec #4) → skip linia "System:" (single-system MVP).
//
// L31 mandate: explicit type discriminator + null guards. Multi-shape per type.
//
// Output shape: { title, lines: [string] } | null
//   null gdy entity null/invalid lub unknown type.

/**
 * Główny entry point.
 *
 * @param {string} entityType — 'vessel' | 'planet' | 'poi'
 * @param {object} entity — runtime instance (Vessel/Planet/POI shape)
 * @param {object} [deps] — { t, colonyManager, empireRegistry }
 * @returns {{ title: string, lines: string[] } | null}
 */
export function getTooltipContent(entityType, entity, deps = {}) {
  if (!entity) return null;
  const t = deps.t ?? _identityT;
  switch (entityType) {
    case 'vessel': return _vesselContent(entity, t, deps);
    case 'ownVessel':   return _vesselContent(entity, t, deps);  // P1.2 target.type alias
    case 'enemyVessel': return _vesselContent(entity, t, deps);  // P1.2 target.type alias
    case 'planet': return _planetContent(entity, t, deps);
    case 'poi':    return _poiContent(entity, t, deps);
    default:       return null;
  }
}

/**
 * Resolve empire name dla vessel — flag #1 (multi-shape, null guards).
 *
 * Honoruje 3 ownership shapes z Vessel.js:isEnemyVessel:
 *   - vessel.isEnemy=true
 *   - vessel.owner !== 'player'
 *   - vessel.ownerEmpireId !== 'player'
 *
 * @returns {string} display name imperium
 */
export function _resolveVesselEmpireName(vessel, t, deps = {}) {
  if (!vessel) return t('tooltip.empire.unknown');

  const er = deps.empireRegistry ?? null;
  // ownerEmpireId ma najwyższy priorytet (M2b explicit ownership)
  if (vessel.ownerEmpireId && vessel.ownerEmpireId !== 'player') {
    const emp = er?.get?.(vessel.ownerEmpireId);
    return emp?.name ?? vessel.ownerEmpireId;
  }
  // Legacy: owner string ('player' | empireId | nazwa)
  if (vessel.owner && vessel.owner !== 'player') {
    const emp = er?.get?.(vessel.owner);
    return emp?.name ?? vessel.owner;
  }
  // isEnemy=true bez ID → generic "wrogie"
  if (vessel.isEnemy === true) return t('tooltip.empire.hostile');
  // Default: gracz
  return t('tooltip.empire.player');
}

// ── Vessel ──────────────────────────────────────────────────────────────────

function _vesselContent(vessel, t, deps) {
  const lines = [];
  const empireName = _resolveVesselEmpireName(vessel, t, deps);
  lines.push(`${t('tooltip.vessel.empire')}: ${empireName}`);

  // HP: SKIP — vessel.hp brak na entity (off-spec #1, L24 robust). Future M4.

  // Fuel — może być { current, max } lub brak gdy stary save bez tankowania
  if (vessel.fuel && typeof vessel.fuel.current === 'number') {
    const cur = vessel.fuel.current.toFixed(1);
    const max = (vessel.fuel.max ?? 0).toFixed(1);
    lines.push(`${t('tooltip.vessel.fuel')}: ${cur}/${max}`);
  }

  // Endurance (M1) — pokazujemy jeśli istnieje, mówi o gotowości operacyjnej
  if (vessel.endurance && typeof vessel.endurance.current === 'number') {
    const cur = Math.round(vessel.endurance.current);
    const max = Math.round(vessel.endurance.max ?? 100);
    lines.push(`${t('tooltip.vessel.endurance')}: ${cur}/${max}`);
  }

  // MovementOrder — tylko gdy status='active' (cancelled/completed/blocked → skip)
  const mo = vessel.movementOrder;
  if (mo && mo.status === 'active' && mo.type) {
    lines.push(`${t('tooltip.vessel.order')}: ${mo.type}`);
  }

  // Mission — tylko gdy istnieje
  if (vessel.mission && vessel.mission.type) {
    const target = vessel.mission.targetName ?? vessel.mission.targetId ?? '';
    const arrow  = target ? ` → ${target}` : '';
    lines.push(`${t('tooltip.vessel.mission')}: ${vessel.mission.type}${arrow}`);
  }

  // Position — robust na missing nested fields
  if (vessel.position && typeof vessel.position.x === 'number') {
    const x = vessel.position.x.toFixed(1);
    const y = vessel.position.y.toFixed(1);
    const state = vessel.position.state ?? '?';
    lines.push(`${t('tooltip.vessel.position')}: (${x}, ${y}) [${state}]`);
  }

  return { title: vessel.name ?? `vessel_${vessel.id ?? '?'}`, lines };
}

// ── Planet / CelestialBody ─────────────────────────────────────────────────

function _planetContent(planet, t, deps) {
  const lines = [];

  // Type (planet.planetType lub fallback na CelestialBody.type)
  const ptype = planet.planetType ?? planet.type;
  if (ptype) lines.push(`${t('tooltip.planet.type')}: ${ptype}`);

  // System: SKIP linia — planet.systemName brak (off-spec #4, single-system MVP).

  // Owner / population — przez colonyManager.getColony lookup
  const colMgr = deps.colonyManager ?? null;
  const colony = colMgr?.getColony?.(planet.id) ?? null;
  if (colony) {
    // Owner — colony zawsze player (gracz zarządza własnymi koloniami).
    // Multi-empire planety obcych dodamy gdy colonyManager wesprze frakcje.
    lines.push(`${t('tooltip.planet.owner')}: ${t('tooltip.empire.player')}`);
    const pop = colony.civSystem?.population;
    if (typeof pop === 'number') {
      lines.push(`${t('tooltip.planet.population')}: ${Math.floor(pop * 10) / 10}`);
    }
  } else {
    lines.push(`${t('tooltip.planet.owner')}: ${t('tooltip.empire.neutral')}`);
  }

  // Resources — pokazujemy listę złóż gdy planet.explored
  if (planet.explored && Array.isArray(planet.deposits) && planet.deposits.length > 0) {
    const ids = planet.deposits.map(d => d.resourceId).filter(Boolean).slice(0, 5).join(', ');
    if (ids) lines.push(`${t('tooltip.planet.resources')}: ${ids}`);
  }

  // Temperatura — uzupełnia obraz dla unscanned (zawsze widoczna z generatora)
  if (typeof planet.temperatureC === 'number') {
    const tempStr = planet.temperatureC > 0
      ? `+${planet.temperatureC.toFixed(0)}°C`
      : `${planet.temperatureC.toFixed(0)}°C`;
    lines.push(`${t('tooltip.planet.temperature')}: ${tempStr}`);
  }

  return { title: planet.name ?? `planet_${planet.id ?? '?'}`, lines };
}

// ── POI ────────────────────────────────────────────────────────────────────

function _poiContent(poi, t, deps) {
  const lines = [];

  if (poi.type) lines.push(`${t('tooltip.poi.type')}: ${poi.type}`);

  // Owner — POI ownerEmpireId (default 'player')
  const ownerId = poi.ownerEmpireId ?? 'player';
  let ownerName = t('tooltip.empire.player');
  if (ownerId !== 'player') {
    const emp = deps.empireRegistry?.get?.(ownerId);
    ownerName = emp?.name ?? ownerId;
  }
  lines.push(`${t('tooltip.poi.owner')}: ${ownerName}`);

  if (typeof poi.createdYear === 'number') {
    lines.push(`${t('tooltip.poi.created')}: ${poi.createdYear.toFixed(0)}`);
  }

  // Per-type fields (POITypes.js: waypoint/patrol/picket/rally/ambush)
  switch (poi.type) {
    case 'waypoint':
      if (poi.point) {
        lines.push(`${t('tooltip.poi.position')}: (${poi.point.x.toFixed(1)}, ${poi.point.y.toFixed(1)})`);
      }
      break;
    case 'patrol':
      if (Array.isArray(poi.waypoints)) {
        lines.push(`${t('tooltip.poi.waypoints')}: ${poi.waypoints.length}`);
      }
      if (poi.loopMode) lines.push(`${t('tooltip.poi.loopMode')}: ${poi.loopMode}`);
      break;
    case 'picket':
      if (typeof poi.rangePxLocal === 'number') {
        lines.push(`${t('tooltip.poi.range')}: ${poi.rangePxLocal.toFixed(1)}`);
      }
      break;
    case 'rally':
      if (Array.isArray(poi.memberVesselIds)) {
        const cur = poi.memberVesselIds.length;
        const tgt = poi.waitForCount ?? '?';
        lines.push(`${t('tooltip.poi.members')}: ${cur}/${tgt}`);
      }
      break;
    case 'ambush':
      if (typeof poi.hidden === 'boolean') {
        lines.push(`${t('tooltip.poi.state')}: ${poi.triggered ? 'triggered' : (poi.hidden ? 'hidden' : 'revealed')}`);
      }
      break;
  }

  return { title: poi.name ?? `poi_${poi.id ?? '?'}`, lines };
}

// ── Internal ────────────────────────────────────────────────────────────────

// Fallback gdy `t` deps nie podane — zwraca raw key (niezbędne dla offline testów,
// L24 case T2.5).
function _identityT(key) { return key; }
