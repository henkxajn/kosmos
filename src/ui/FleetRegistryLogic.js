// FleetRegistryLogic — CZYSTA logika rejestru floty K3 (Obraz Operacyjny, Faza 3).
// Node-importowalna, zero canvas/THREE/i18n — wiersze tabeli WYŁĄCZNIE z
// FleetPictureLogic.buildShipEntry (twarda reguła planu §0: żaden widok nie
// liczy statusu/ETA po swojemu). Render/hit-testy w FleetManagerOverlay.

import { buildShipEntry } from './FleetPictureLogic.js';

// Klucz filtra tranzytu (systemId===null → statki w skoku międzygwiezdnym).
export const TRANSIT_KEY = '__transit';

// Token stanu → klucz i18n (kolumna „Stan"; te same klucze co aktywności stanu).
export const STATE_LABEL_KEYS = Object.freeze({
  docked:     'fleetPicture.state.docked',
  orbiting:   'fleetPicture.state.orbiting',
  in_transit: 'fleetPicture.state.inTransit',
});

// Kolumny tabeli (id → czy sortowalna); szerokości/etykiety to sprawa widoku.
export const REGISTRY_COLUMNS = Object.freeze(
  ['name', 'role', 'fleet', 'system', 'state', 'activity', 'eta', 'fuel', 'alerts']);

/**
 * Wiersze rejestru — własne żywe statki (wraki excluded, wrogowie poza rejestrem).
 * @param {object[]} vessels — vesselManager.getAllVessels()
 * @param {object} ctx —
 *   pictureCtx  — ctx dla buildShipEntry (combatCheck/isImmobilized/fleetSystem/gameYear)
 *   fleetName(fleetId) → string|null
 *   systemName(systemId) → string  (dla systemId=null zwracany klucz tranzytu — widok tłumaczy)
 * @returns {Array} row = { id, name, role, glyph, tone, stateKey, activityKey, activityArgs,
 *   eta:{year,confidence}, systemId, systemName, isTransit, fleetId, fleetName,
 *   fuelPct, warpFuelPct, alerts, alertCount }
 */
export function buildRegistryRows(vessels, ctx = {}) {
  const out = [];
  for (const v of vessels ?? []) {
    if (!v) continue;
    const e = buildShipEntry(v, ctx.pictureCtx ?? {});
    if (!e || e.excluded) continue;
    if (v.isEnemy === true || (v.owner && v.owner !== 'player')
        || (v.ownerEmpireId && v.ownerEmpireId !== 'player')) continue;   // rejestr = flota GRACZA
    const isTransit = e.systemId === null;
    out.push({
      id: e.id,
      name: e.name,
      role: e.role,
      glyph: e.glyph,
      tone: e.tone,
      stateKey: STATE_LABEL_KEYS[e.state] ?? 'fleetPicture.state.idle',
      activityKey: e.activityKey,
      activityArgs: e.activityArgs,
      eta: e.eta,
      systemId: e.systemId,
      systemName: isTransit ? null : (ctx.systemName?.(e.systemId) ?? e.systemId),
      isTransit,
      fleetId: e.fleetId,
      fleetName: e.fleetId ? (ctx.fleetName?.(e.fleetId) ?? null) : null,
      fuelPct: e.fuelPct,
      warpFuelPct: e.warpFuelPct,
      alerts: e.alerts,
      alertCount: e.alerts.length,
    });
  }
  return out;
}

// Komparatory kolumn (dir=1 rosnąco, -1 malejąco); tie-break po id → sort STABILNY
// niezależnie od implementacji Array.sort.
const CMP = {
  name:     (a, b) => String(a.name).localeCompare(String(b.name)),
  role:     (a, b) => String(a.role).localeCompare(String(b.role)),
  fleet:    (a, b) => String(a.fleetName ?? '￿').localeCompare(String(b.fleetName ?? '￿')),
  system:   (a, b) => (a.isTransit === b.isTransit ? 0 : a.isTransit ? 1 : -1)
                   || String(a.systemName ?? '').localeCompare(String(b.systemName ?? '')),
  state:    (a, b) => String(a.stateKey).localeCompare(String(b.stateKey)),
  activity: (a, b) => String(a.activityKey).localeCompare(String(b.activityKey)),
  eta:      (a, b) => (a.eta.year ?? Infinity) - (b.eta.year ?? Infinity),   // brak ETA na końcu
  fuel:     (a, b) => (a.fuelPct ?? -1) - (b.fuelPct ?? -1),
  alerts:   (a, b) => a.alertCount - b.alertCount,
};

/** Sort wiersza po kolumnie (nowa tablica; wejście nietknięte). */
export function sortRows(rows, col, dir = 1) {
  const cmp = CMP[col] ?? CMP.name;
  return [...(rows ?? [])].sort((a, b) =>
    (cmp(a, b) * dir) || String(a.id).localeCompare(String(b.id)));
}

/**
 * Filtry łączone: układ (systemId | TRANSIT_KEY | null=wszystkie) × rola × szukajka
 * (case-insensitive, po nazwie ORAZ nazwie floty).
 */
export function filterRows(rows, { systemKey = null, role = null, search = '' } = {}) {
  const q = String(search ?? '').trim().toLowerCase();
  return (rows ?? []).filter(r => {
    if (systemKey === TRANSIT_KEY) { if (!r.isTransit) return false; }
    else if (systemKey != null) { if (r.isTransit || r.systemId !== systemKey) return false; }
    if (role != null && r.role !== role) return false;
    if (q && !String(r.name).toLowerCase().includes(q)
          && !String(r.fleetName ?? '').toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Chipy filtrów układów: unikatowe układy wierszy (+ tranzyt na końcu gdy występuje). */
export function collectSystemChoices(rows) {
  const seen = new Map();   // systemId → name
  let transit = false;
  for (const r of rows ?? []) {
    if (r.isTransit) { transit = true; continue; }
    if (!seen.has(r.systemId)) seen.set(r.systemId, r.systemName ?? r.systemId);
  }
  const out = [...seen.entries()]
    .map(([systemId, name]) => ({ key: systemId, name, isTransit: false }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (transit) out.push({ key: TRANSIT_KEY, name: null, isTransit: true });
  return out;
}

/** Chipy filtrów ról: unikatowe role wierszy (kolejność deterministyczna). */
export function collectRoleChoices(rows) {
  return [...new Set((rows ?? []).map(r => r.role))].sort();
}
