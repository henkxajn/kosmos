// POIPanelLogic — pure helpers dla POIPanel (sort/filter/format/location)
//
// Schema POI per type (cytat za POIRegistry._extractTypeFields, POITypes.validatePOISpec):
//   waypoint: { point: {x,y} }                                  ← POJEDYNCZY punkt
//   patrol:   { waypoints: [{x,y},...], loopMode }              ← brak 'center'
//   picket:   { center: {x,y}, rangePxLocal, alertOnEmpireIds } ← rangePxLocal nie 'range'
//   rally:    { center: {x,y}, waitForCount, memberVesselIds }
//   ambush:   { center: {x,y}, rangePxLocal, triggerOnEmpireIds, hidden }
//
// Universal: id, type, name, ownerEmpireId, createdYear.
// L31 mandate: per-type discriminator + null guards (waypoint nie ma center, patrol nie ma point).
// L24 mandate: graceful missing fields (createdYear undefined → 0; brak point → fallback {x:0,y:0}).

const TYPE_ICONS = {
  waypoint: '📍',
  patrol:   '↻',
  picket:   '⚠',
  rally:    '🎯',
  ambush:   '👁',
};

/**
 * Stabilna sortująca funkcja po wybranym polu.
 * @param {Array} pois  — lista POI (z POIRegistry.listPOIs())
 * @param {'name'|'type'|'createdYear'} sortBy
 * @param {'asc'|'desc'} sortDir
 * @returns {Array} nowa posortowana tablica (nie mutuje wejściowej)
 */
export function sortPOIs(pois, sortBy = 'createdYear', sortDir = 'desc') {
  if (!Array.isArray(pois)) return [];
  const arr = [...pois];
  arr.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'name':
        cmp = String(a?.name ?? '').localeCompare(String(b?.name ?? ''));
        break;
      case 'type':
        cmp = String(a?.type ?? '').localeCompare(String(b?.type ?? ''));
        break;
      case 'createdYear':
      default:
        cmp = (a?.createdYear ?? 0) - (b?.createdYear ?? 0);
        break;
    }
    if (cmp === 0) {
      // Stabilność po id (deterministyczne dla testu)
      cmp = String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
    }
    return sortDir === 'desc' ? -cmp : cmp;
  });
  return arr;
}

/**
 * Filtruj POI po typie i właścicielu. 'all' = brak filtra.
 * @param {Array} pois
 * @param {string} filterType  — 'all' | POI_TYPES.*
 * @param {string} filterOwner — 'all' | empireId
 */
export function filterPOIs(pois, filterType = 'all', filterOwner = 'all') {
  if (!Array.isArray(pois)) return [];
  return pois.filter(poi => {
    if (!poi) return false;
    if (filterType !== 'all' && poi.type !== filterType) return false;
    if (filterOwner !== 'all' && poi.ownerEmpireId !== filterOwner) return false;
    return true;
  });
}

/**
 * Wyciągnij efektywną pozycję POI dla camera focus.
 * Per type: waypoint→point, patrol→waypoints[0], picket/rally/ambush→center.
 * @returns {{x:number, y:number} | null}
 */
export function getPOILocation(poi) {
  if (!poi || typeof poi !== 'object') return null;
  switch (poi.type) {
    case 'waypoint':
      return _isPoint(poi.point) ? { x: poi.point.x, y: poi.point.y } : null;
    case 'patrol': {
      const wps = poi.waypoints;
      if (!Array.isArray(wps) || wps.length === 0) return null;
      const wp0 = wps[0];
      return _isPoint(wp0) ? { x: wp0.x, y: wp0.y } : null;
    }
    case 'picket':
    case 'rally':
    case 'ambush':
      return _isPoint(poi.center) ? { x: poi.center.x, y: poi.center.y } : null;
    default:
      return null;
  }
}

/**
 * Buduj dane wiersza listy (icon + label + subtitle + meta).
 * Multi-shape per type (L31). Subtitle = type-specific summary.
 *
 * @param {object} poi
 * @param {(key:string, ...args) => string} t — i18n function
 * @returns {{ icon, label, subtitle, meta, ownerLabel } | null}
 */
export function formatPOIRow(poi, t) {
  if (!poi || typeof poi !== 'object') return null;
  const type = poi.type;
  if (!TYPE_ICONS[type]) return null;

  const icon = TYPE_ICONS[type];
  const label = (typeof t === 'function') ? (t(`poi.type.label.${type}`) ?? type) : type;
  const subtitle = _buildSubtitle(poi, t);
  const ownerLabel = _formatOwner(poi, t);
  const meta = `Y${Math.round(poi.createdYear ?? 0)}`;

  return { icon, label, subtitle, meta, ownerLabel };
}

function _buildSubtitle(poi, t) {
  const tt = typeof t === 'function' ? t : (k) => k;
  switch (poi.type) {
    case 'waypoint': {
      const p = poi.point;
      if (!_isPoint(p)) return '—';
      return `(${Math.round(p.x)}, ${Math.round(p.y)})`;
    }
    case 'patrol': {
      const wps = Array.isArray(poi.waypoints) ? poi.waypoints : [];
      const lm = poi.loopMode ?? '?';
      return `${wps.length} ${tt('poi.panel.subtitle.waypoints')} · ${lm}`;
    }
    case 'picket': {
      const r = poi.rangePxLocal ?? 0;
      return `${tt('poi.panel.subtitle.range')}: ${r}`;
    }
    case 'rally': {
      const want = poi.waitForCount ?? 0;
      const have = Array.isArray(poi.memberVesselIds) ? poi.memberVesselIds.length : 0;
      return `${have}/${want} ${tt('poi.panel.subtitle.members')}`;
    }
    case 'ambush': {
      const r = poi.rangePxLocal ?? 0;
      const hidden = !!poi.hidden;
      return `${tt('poi.panel.subtitle.range')}: ${r} · ${hidden ? tt('poi.panel.subtitle.hidden') : tt('poi.panel.subtitle.visible')}`;
    }
    default:
      return '—';
  }
}

function _formatOwner(poi, t) {
  const tt = typeof t === 'function' ? t : (k) => k;
  const oid = poi.ownerEmpireId;
  if (!oid || oid === 'player') return tt('poi.panel.owner.player');
  return String(oid);
}

function _isPoint(p) {
  return p && typeof p.x === 'number' && typeof p.y === 'number';
}

/**
 * Zbierz unikalne ownerEmpireIds z listy POI (dla dropdown filter).
 * @returns {string[]} np. ['player', 'emp_3']
 */
export function collectOwners(pois) {
  if (!Array.isArray(pois)) return [];
  const set = new Set();
  for (const p of pois) {
    if (p?.ownerEmpireId) set.add(p.ownerEmpireId);
  }
  return Array.from(set).sort();
}

export const POI_TYPE_ORDER = ['waypoint', 'patrol', 'picket', 'rally', 'ambush'];
export { TYPE_ICONS };
