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
 * Wiersze rejestru — flota gracza + (3f) WRAKI i KONTAKTY (intel-gated).
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
    if (!e) continue;
    const isTransit = e.systemId === null;
    const sysName = isTransit ? null : (ctx.systemName?.(e.systemId) ?? e.systemId);

    // 3f — WRAKI: pełny wiersz read-only (własne I wrogie; sekcja za chipem 💀).
    if (e.isWreck) {
      out.push({
        kind: 'wreck', id: e.id, name: e.name,
        role: null, glyph: e.glyph, tone: e.tone,
        stateKey: 'fleetPicture.state.wreck',
        activityKey: null, activityArgs: [],
        eta: { year: null, confidence: 'firm' },
        systemId: e.systemId, systemName: sysName, isTransit,
        fleetId: null, fleetName: null,
        fuelPct: null, warpFuelPct: null, alerts: [], alertCount: 0,
        wreckedYear: e.wreckedYear, isEnemy: e.isEnemy, anonymous: false,
      });
      continue;
    }

    // 3f — KONTAKTY: wrogowie żywi WYŁĄCZNIE przez bramki intel (unknown → brak;
    // rumor → anonimowy „?"; contact+ → pełny wiersz READ-ONLY). Zero akcji;
    // intencje wroga (zadanie/ETA/paliwo) NIEJAWNE niezależnie od jakości.
    if (e.isEnemy) {
      const q = ctx.enemyQuality?.(v.id) ?? 'unknown';
      if (q === 'unknown') continue;
      const anonymous = q === 'rumor';
      out.push({
        kind: 'contact', id: e.id,
        name: anonymous ? '?' : e.name,
        role: anonymous ? null : e.role,
        glyph: anonymous ? '?' : e.glyph,
        tone: e.tone,
        stateKey: anonymous ? null : (STATE_LABEL_KEYS[e.state] ?? null),
        activityKey: null, activityArgs: [],
        eta: { year: null, confidence: 'firm' },
        systemId: e.systemId, systemName: sysName, isTransit,
        fleetId: null, fleetName: null,
        fuelPct: null, warpFuelPct: null, alerts: [], alertCount: 0,
        isEnemy: true, anonymous,
      });
      continue;
    }

    out.push({
      kind: 'own',
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
      systemName: sysName,
      isTransit,
      fleetId: e.fleetId,
      fleetName: e.fleetId ? (ctx.fleetName?.(e.fleetId) ?? null) : null,
      fuelPct: e.fuelPct,
      warpFuelPct: e.warpFuelPct,
      alerts: e.alerts,
      alertCount: e.alerts.length,
      isEnemy: false, anonymous: false,
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
export function filterRows(rows, { systemKey = null, role = null, search = '',
                                   showWrecks = false, showContacts = false } = {}) {
  const q = String(search ?? '').trim().toLowerCase();
  return (rows ?? []).filter(r => {
    // 3f — sekcje WRAKI/KONTAKTY domyślnie ODFILTROWANE (chipy je włączają).
    if (r.kind === 'wreck' && !showWrecks) return false;
    if (r.kind === 'contact' && !showContacts) return false;
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

// ── Rejestr 2.0 (slice 3e) — grupowanie ──────────────────────────────────────
export const GROUP_MODES = Object.freeze(['none', 'fleet', 'system']);
export const UNGROUPED_KEY = '__ungrouped';   // „Bez floty"

/**
 * Grupuje POSORTOWANE/PRZEFILTROWANE wiersze w płaską listę pozycji do renderu:
 * nagłówki grup (zwijane) + wiersze widoczne. Sort wewnątrz grup = kolejność
 * wejścia (czyli sort tabeli); grupy sortowane po etykiecie (bez-floty/tranzyt
 * na końcu). Oś czasu przejmuje TĘ SAMĄ spłaszczoną listę wierszy (visibleRows).
 *
 * @param {Array} rows — wynik sortRows(filterRows(...))
 * @param {'none'|'fleet'|'system'} mode
 * @param {Set<string>} collapsed — klucze zwiniętych grup
 * @returns {{items: Array<{type:'header',key,label,count,fleetId?,isTransit?,collapsed}
 *                        |{type:'row',row}>, visibleRows: Array}}
 */
export function groupRows(rows, mode = 'none', collapsed = new Set()) {
  if (mode === 'none' || !GROUP_MODES.includes(mode)) {
    return { items: (rows ?? []).map(row => ({ type: 'row', row })), visibleRows: rows ?? [] };
  }
  const groups = new Map();   // key → { label, fleetId?, isTransit?, rows: [] }
  for (const r of rows ?? []) {
    let key, label, meta = {};
    if (mode === 'fleet') {
      key = r.fleetId ?? UNGROUPED_KEY;
      label = r.fleetName ?? null;                 // null → widok tłumaczy „Bez floty"
      meta = { fleetId: r.fleetId ?? null };
    } else {
      key = r.isTransit ? TRANSIT_KEY : r.systemId;
      label = r.isTransit ? null : (r.systemName ?? r.systemId);
      meta = { isTransit: r.isTransit };
    }
    if (!groups.has(key)) groups.set(key, { label, ...meta, rows: [] });
    groups.get(key).rows.push(r);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    const last = (k) => k === UNGROUPED_KEY || k === TRANSIT_KEY;   // specjalne na końcu
    if (last(a) !== last(b)) return last(a) ? 1 : -1;
    return String(groups.get(a).label ?? '').localeCompare(String(groups.get(b).label ?? ''));
  });
  const items = [];
  const visibleRows = [];
  for (const key of keys) {
    const g = groups.get(key);
    const isCollapsed = collapsed.has(key);
    items.push({ type: 'header', key, label: g.label, count: g.rows.length,
                 fleetId: g.fleetId, isTransit: g.isTransit, collapsed: isCollapsed });
    if (!isCollapsed) {
      for (const row of g.rows) { items.push({ type: 'row', row }); visibleRows.push(row); }
    }
  }
  return { items, visibleRows };
}
