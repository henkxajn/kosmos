// POIFormLogic — pure helpers dla POIModal (M3 P2.2)
//
// Schema-driven form rendering + validation per POI type. Multi-shape (L31)
// — 5 schemas dla waypoint/patrol/picket/rally/ambush. Bez DOM, bez i18n —
// zwraca klucze i18n które modal renderuje przez t().
//
// Walidacja off-the-record: zwraca tylko error keys (nie sformatowane stringi).
// Modal mapuje `errorKey` → `t('poi.modal.error.' + errorKey)` przy renderze.
//
// formToPOIParams / poiToFormData — symetryczna konwersja form ↔ POI entity.
// L24: defensywne, jeśli pole brakuje → pomija (POIRegistry waliduje resztę).

// ── Schema definitions ────────────────────────────────────────────────

const COMMON_FIELDS = [
  { id: 'name', type: 'text', label: 'poi.modal.name', required: true, maxLength: 50 },
];

/**
 * Zwraca tablicę pól dla danego typu POI. null gdy unknown type.
 * Pola: { id, type, label, required, maxLength?, min?, max?, options?, default?, minLength?, maxLength? }
 * Typy pól: 'text' | 'number' | 'point2d' | 'point2d_array' | 'enum' | 'checkbox' | 'string_array'
 */
export function getPOIFormSchema(type) {
  switch (type) {
    case 'waypoint':
      return [
        ...COMMON_FIELDS,
        { id: 'point', type: 'point2d', label: 'poi.modal.point.label', required: true },
      ];
    case 'patrol':
      return [
        ...COMMON_FIELDS,
        { id: 'waypoints', type: 'point2d_array', label: 'poi.modal.waypoints.label',
          required: true, minLength: 2, maxLength: 20 },
        { id: 'loopMode', type: 'enum', label: 'poi.modal.loopMode.label',
          options: ['loop', 'ping_pong'], default: 'loop', required: true },
      ];
    case 'picket':
      return [
        ...COMMON_FIELDS,
        { id: 'center', type: 'point2d', label: 'poi.modal.center.label', required: true },
        { id: 'rangePxLocal', type: 'number', label: 'poi.modal.range.label',
          required: true, min: 1, max: 1000 },
        { id: 'alertOnEmpireIds', type: 'string_array', label: 'poi.modal.alertOn.label', required: false },
      ];
    case 'rally':
      return [
        ...COMMON_FIELDS,
        { id: 'center', type: 'point2d', label: 'poi.modal.center.label', required: true },
        { id: 'waitForCount', type: 'number', label: 'poi.modal.waitFor.label',
          required: true, min: 1, max: 50 },
      ];
    case 'ambush':
      return [
        ...COMMON_FIELDS,
        { id: 'center', type: 'point2d', label: 'poi.modal.center.label', required: true },
        { id: 'rangePxLocal', type: 'number', label: 'poi.modal.range.label',
          required: true, min: 1, max: 1000 },
        { id: 'hidden', type: 'checkbox', label: 'poi.modal.hidden.label', default: true, required: true },
        { id: 'triggerOnEmpireIds', type: 'string_array', label: 'poi.modal.triggerOn.label', required: false },
      ];
    default:
      return null;
  }
}

// ── Validation ────────────────────────────────────────────────────────

/**
 * Waliduj formData zgodnie ze schema dla typu.
 * @returns {{ valid: boolean, errors: { [fieldId]: errorKey } }}
 *   Error keys: 'required' | 'too_long' | 'too_small' | 'too_big' |
 *               'invalid_point' | 'too_few_points' | 'too_many_points' | 'invalid_type'
 */
export function validatePOIForm(type, formData) {
  const schema = getPOIFormSchema(type);
  if (!schema) return { valid: false, errors: { _general: 'invalid_type' } };
  if (!formData || typeof formData !== 'object') {
    return { valid: false, errors: { _general: 'invalid_form' } };
  }

  const errors = {};
  for (const field of schema) {
    const v = formData[field.id];

    // Required check (per type)
    if (field.required) {
      if (field.type === 'checkbox') {
        // boolean — false jest OK (default może być false)
        if (typeof v !== 'boolean') { errors[field.id] = 'required'; continue; }
      } else if (v === undefined || v === null || v === '') {
        errors[field.id] = 'required'; continue;
      } else if (Array.isArray(v) && v.length === 0) {
        errors[field.id] = 'required'; continue;
      } else if (field.type === 'point2d' && (!v || typeof v !== 'object')) {
        errors[field.id] = 'required'; continue;
      }
    }

    // Per-type validation
    if (v === undefined || v === null || v === '') continue;  // optional empty — skip

    switch (field.type) {
      case 'text': {
        if (typeof v !== 'string') { errors[field.id] = 'invalid_type'; break; }
        if (field.maxLength && v.length > field.maxLength) errors[field.id] = 'too_long';
        break;
      }
      case 'number': {
        if (typeof v !== 'number' || !Number.isFinite(v)) { errors[field.id] = 'invalid_type'; break; }
        if (field.min != null && v < field.min) { errors[field.id] = 'too_small'; break; }
        if (field.max != null && v > field.max) { errors[field.id] = 'too_big'; break; }
        break;
      }
      case 'point2d': {
        if (!_isValidPoint(v)) errors[field.id] = 'invalid_point';
        break;
      }
      case 'point2d_array': {
        if (!Array.isArray(v)) { errors[field.id] = 'invalid_type'; break; }
        if (field.minLength && v.length < field.minLength) { errors[field.id] = 'too_few_points'; break; }
        if (field.maxLength && v.length > field.maxLength) { errors[field.id] = 'too_many_points'; break; }
        if (!v.every(_isValidPoint)) { errors[field.id] = 'invalid_point'; break; }
        break;
      }
      case 'enum': {
        if (field.options && !field.options.includes(v)) errors[field.id] = 'invalid_type';
        break;
      }
      case 'checkbox': {
        if (typeof v !== 'boolean') errors[field.id] = 'invalid_type';
        break;
      }
      case 'string_array': {
        if (!Array.isArray(v)) errors[field.id] = 'invalid_type';
        break;
      }
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

// ── form ↔ POI conversion ─────────────────────────────────────────────

/**
 * Konwertuj formData → params dla POIRegistry.createPOI / updatePOI.
 * Dodaje schema defaults dla brakujących pól. Strip optional empty arrays → undefined
 * (POIRegistry traktuje null/undefined jako OK dla optional).
 */
export function formToPOIParams(type, formData) {
  const schema = getPOIFormSchema(type);
  if (!schema || !formData) return null;

  const params = { type, name: formData.name };
  for (const field of schema) {
    if (field.id === 'name') continue;  // już zapisane
    let v = formData[field.id];

    // Apply schema default jeśli brak wartości
    if ((v === undefined || v === null || v === '') && field.default !== undefined) {
      v = field.default;
    }

    // Skip optional empty
    if (!field.required && (v === undefined || v === null || v === '')) continue;
    if (!field.required && Array.isArray(v) && v.length === 0) continue;

    params[field.id] = v;
  }
  return params;
}

/**
 * Konwertuj POI entity → formData dla edit mode (reverse mapping).
 * Per-type extract (waypoint=point, patrol=waypoints+loopMode, picket/rally/ambush=center+...).
 */
export function poiToFormData(poi) {
  if (!poi || typeof poi !== 'object') return null;
  const base = { name: poi.name ?? '' };
  switch (poi.type) {
    case 'waypoint':
      return { ...base, point: _clonePoint(poi.point) };
    case 'patrol':
      return {
        ...base,
        waypoints: Array.isArray(poi.waypoints) ? poi.waypoints.map(_clonePoint) : [],
        loopMode: poi.loopMode ?? 'loop',
      };
    case 'picket':
      return {
        ...base,
        center: _clonePoint(poi.center),
        rangePxLocal: poi.rangePxLocal ?? 0,
        alertOnEmpireIds: Array.isArray(poi.alertOnEmpireIds) ? [...poi.alertOnEmpireIds] : [],
      };
    case 'rally':
      return {
        ...base,
        center: _clonePoint(poi.center),
        waitForCount: poi.waitForCount ?? 1,
      };
    case 'ambush':
      return {
        ...base,
        center: _clonePoint(poi.center),
        rangePxLocal: poi.rangePxLocal ?? 0,
        hidden: typeof poi.hidden === 'boolean' ? poi.hidden : true,
        triggerOnEmpireIds: Array.isArray(poi.triggerOnEmpireIds) ? [...poi.triggerOnEmpireIds] : [],
      };
    default:
      return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function _isValidPoint(p) {
  return p && typeof p === 'object'
    && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function _clonePoint(p) {
  return _isValidPoint(p) ? { x: p.x, y: p.y } : { x: 0, y: 0 };
}

/** Default value dla pola wg schema (do init formData w create mode). */
export function getFieldDefault(field) {
  if (field.default !== undefined) return field.default;
  switch (field.type) {
    case 'text':           return '';
    case 'number':         return field.min ?? 0;
    case 'point2d':        return { x: 0, y: 0 };
    case 'point2d_array':  return [];
    case 'enum':           return field.options?.[0] ?? '';
    case 'checkbox':       return false;
    case 'string_array':   return [];
    default:               return null;
  }
}

/** Inicjuj formData ze schema defaults dla nowego POI. */
export function makeDefaultFormData(type) {
  const schema = getPOIFormSchema(type);
  if (!schema) return null;
  const data = {};
  for (const field of schema) {
    data[field.id] = getFieldDefault(field);
  }
  return data;
}
