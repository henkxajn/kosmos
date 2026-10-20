// ShipTreeLogic — ARKUSZ UI, U3-1: czysta warstwa drzewa PRAWEGO outlinera — statki gracza (UI_PLAN §4.4).
//
// Reguły (podpisane — UI_PLAN §2, §5, §7):
//   • „W DRODZE” (D-UI-8, §7.3): statki w tranzycie warp (`systemId === null` — wyłącznie faza `warp_transit`) w osobnej
//     sekcji na górze, tylko gdy niepusta; flota, której prowadzący jest w skoku — jako węzeł tej sekcji.
//   • UKŁAD → TYP (D-UI-6, §7.1): układy w kolejności LEWEGO outlinera — `ctx.systems` to wynik
//     `SystemTreeLogic.buildSystemTree` (reguła D-UI-2 mieszka tam; tu bez drugiej kopii). W układzie kubełki: WOJENNE
//     (warship, assault, transport) · NAUKOWE (science) · CARGO (cargo) · POZOSTAŁE (colony, scout); w kubełku rola
//     w tej kolejności, potem nazwa. Pusty kubełek — bez nagłówka; układ bez Twoich statków — poza listą. Układ ze
//     statkami spoza `ctx.systems` (obrona w głąb — po Findingu 489 każdy układ z Twoim statkiem jest w lewym) — na końcu.
//   • FLOTY (D-UI-7 + decyzja 6 (a)): jeden węzeł na flotę, w układzie PROWADZĄCEGO — pierwszy żywy członek w kolejności
//     `fleet.memberIds` (ten sam reprezentant co w Findingu 272) — w kubełku jego roli, przed luźnymi statkami kubełka
//     (floty wg nazwy). Członkowie pod węzłem (rola, potem nazwa); członek z innego układu — z dopiskiem układu, w skoku —
//     z dopiskiem „w drodze”. Członek floty nie pojawia się drugi raz jako luźny statek.
//   • ZNACZNIK (D-UI-9, §7.2): JEDEN na wiersz — kolor glifu roli: w walce > bez paliwa (alert `stranded` ∨ `immobilized`)
//     > w ruchu > zadokowany > bezczynny. Wejście: wpis `FleetPictureLogic.buildShipEntry` (jedno źródło tonu, alertów
//     i stanu). „W ruchu” = `entry.moving` (lot ∨ aktywny rozkaz — warunek tonu `move`, wystawiony osobno, bo ton
//     przejmuje każdy alert, np. niski poziom paliwa w locie) ∨ skok warp (`systemId === null`). Reszta — także misja
//     stojąca (zwiad zaparkowany na orbicie) — „bezczynny”; aktywność mówi podpowiedź. Węzeł floty — najpilniejszy
//     znacznik członków.
//   • KOLORY znaczników — nazwy tokenów motywu (`MARKER_TONES`; widok rozwiązuje je z `THEME`). Wybór z pomiaru
//     odległości barw (CIEDE2000) w pięciu motywach ekranu tytułowego i w `default`: „w ruchu” = `textPrimary` (jasny),
//     nie `info` — w motywie Amber Noir `info` to złoto obok pomarańczowego „bez paliwa” (ΔE 12,6 wobec ≥ 21,8).
//   • ZWIJANIE (D-UI-4, §7.5): układ rozwinięty wg `ctx.expanded` (domyślnie bieżący); „W drodze” — zawsze.
//
// Czysty: bez `window`, EventBusa, UI i i18n — kubełki niosą identyfikator (`group.id`), napisy daje widok.
// Importy — wyłącznie kanon układu (`SystemScope`).

import { systemIdOf } from '../utils/SystemScope.js';

/** Klucz sekcji „W drodze” (statki i floty w tranzycie warp). */
export const TRANSIT = 'transit';

/** Kubełki typów w układzie (D-UI-6, §7.1) — kolejność kubełków i ról w kubełku. */
export const SHIP_TYPE_GROUPS = Object.freeze([
  Object.freeze({ id: 'war',     roles: Object.freeze(['warship', 'assault', 'transport']) }),
  Object.freeze({ id: 'science', roles: Object.freeze(['science']) }),
  Object.freeze({ id: 'cargo',   roles: Object.freeze(['cargo']) }),
  Object.freeze({ id: 'other',   roles: Object.freeze(['colony', 'scout']) }),
]);

/** Kolejność ról w obrębie listy (kubełek po kubełku). */
export const ROLE_ORDER = Object.freeze(SHIP_TYPE_GROUPS.flatMap((g) => g.roles));

/** Znaczniki statusu w kolejności PRIORYTETU (indeks 0 = najpilniejszy) — D-UI-9, §7.2. */
export const SHIP_MARKERS = Object.freeze(['combat', 'noFuel', 'moving', 'docked', 'idle']);

/** Kolor znacznika = nazwa tokenu motywu (`THEME[...]`). Patrz nagłówek — wybór z pomiaru ΔE. */
export const MARKER_TONES = Object.freeze({
  combat: 'danger',
  noFuel: 'warning',
  moving: 'textPrimary',
  docked: 'success',
  idle:   'textDim',
});

/** Kubełek typu dla roli (`getPrimaryRole`); nieznana rola → POZOSTAŁE. */
export function typeGroupOf(role) {
  for (const g of SHIP_TYPE_GROUPS) if (g.roles.includes(role)) return g.id;
  return 'other';
}

const roleRank = (role) => { const i = ROLE_ORDER.indexOf(role); return i < 0 ? ROLE_ORDER.length : i; };
const byName = (a, b) => String(a?.name ?? '').localeCompare(String(b?.name ?? ''));
const byRoleThenName = (a, b) => (roleRank(a.role) - roleRank(b.role)) || byName(a, b);

/**
 * Znacznik statusu wiersza statku (D-UI-9, §7.2) z wpisu `buildShipEntry`.
 * @param {object} entry — wpis `FleetPictureLogic.buildShipEntry` (tone, alerts, state, moving, systemId)
 * @returns {'combat'|'noFuel'|'moving'|'docked'|'idle'}
 */
export function shipMarker(entry) {
  if (!entry) return 'idle';
  if (entry.tone === 'combat') return 'combat';
  if ((entry.alerts ?? []).some((a) => a?.kind === 'stranded' || a?.kind === 'immobilized')) return 'noFuel';
  const moving = (typeof entry.moving === 'boolean' ? entry.moving : entry.tone === 'move') || entry.systemId === null;
  if (moving) return 'moving';
  if (entry.state === 'docked') return 'docked';
  return 'idle';
}

/** Najpilniejszy znacznik z listy (węzeł floty). */
export function worstMarker(markers) {
  let best = SHIP_MARKERS.length - 1;
  for (const m of markers ?? []) { const i = SHIP_MARKERS.indexOf(m); if (i >= 0 && i < best) best = i; }
  return SHIP_MARKERS[best];
}

/**
 * Drzewo prawego outlinera.
 * @param {object} ctx
 * @param {Array<object>} ctx.vessels — statki GRACZA (wołający filtruje `isEnemyVessel`); wraki pomijane tutaj
 * @param {(vessel:object) => object} ctx.entryOf — wpis `buildShipEntry(vessel, ctxPicture)` (rola, glif, ton, alerty, stan)
 * @param {Array<{id:string, name?:string, memberIds?:string[]}>} [ctx.fleets] — `FleetSystem.listFleets()`
 * @param {Array<{systemId:string, name?:string}>} [ctx.systems] — układy w kolejności LEWEGO outlinera (`buildSystemTree`)
 * @param {(systemId:string) => string|null} [ctx.systemName] — nazwa układu spoza `ctx.systems` (i dopisek członka floty)
 * @param {string} [ctx.activeSystemId]
 * @param {(systemId:string) => boolean} [ctx.expanded] — rozwinięcie układu (domyślnie: bieżący)
 * @returns {{ transit: object|null, systems: Array<object>, index: Map<string, object>, fleetIndex: Map<string, string>, total: number }}
 */
export function buildShipTree(ctx = {}) {
  const active = ctx.activeSystemId ?? null;
  const expandedOf = typeof ctx.expanded === 'function' ? ctx.expanded : (sys) => sys === active;
  const known = new Map((ctx.systems ?? []).filter((s) => s?.systemId).map((s) => [s.systemId, s]));
  const nameOf = (sys) => known.get(sys)?.name ?? ctx.systemName?.(sys) ?? sys;
  const alive = (ctx.vessels ?? []).filter((v) => v && v.id != null && !v.isWreck);
  const byId = new Map(alive.map((v) => [v.id, v]));

  const shipRow = (v) => {
    const entry = (typeof ctx.entryOf === 'function' ? ctx.entryOf(v) : null) ?? {};
    const systemId = systemIdOf(v);
    return {
      kind: 'ship', id: v.id, vessel: v, entry,
      name: entry.name ?? v.name ?? String(v.id),
      role: entry.role ?? 'scout', glyph: entry.glyph ?? null,
      marker: shipMarker({ ...entry, systemId }),
      systemId, section: systemId ?? TRANSIT, fleetId: v.fleetId ?? null, note: null, depth: 0,
    };
  };

  // ── Floty: węzeł u prowadzącego (pierwszy żywy członek), członkowie pod nim ────────────────────────────────────────
  const consumed = new Set();
  const nodes = [];
  for (const f of (ctx.fleets ?? [])) {
    if (!f?.id) continue;
    const members = [];
    for (const id of (f.memberIds ?? [])) {
      const v = byId.get(id);
      if (!v || consumed.has(id) || members.includes(v)) continue;
      members.push(v);
    }
    if (!members.length) continue;
    const lead = members[0];
    const leadRow = shipRow(lead);
    const rows = members.map((v) => (v === lead ? leadRow : shipRow(v)));
    for (const r of rows) {
      consumed.add(r.id);
      r.depth = 1;
      if (r.section !== leadRow.section) r.note = r.systemId == null ? { kind: 'transit' } : { kind: 'system', systemId: r.systemId, name: nameOf(r.systemId) };
    }
    rows.sort(byRoleThenName);
    nodes.push({
      kind: 'fleet', id: f.id, fleet: f, name: f.name ?? String(f.id), leadId: lead.id,
      systemId: leadRow.systemId, section: leadRow.section, role: leadRow.role, group: typeGroupOf(leadRow.role),
      marker: worstMarker(rows.map((r) => r.marker)), members: rows, count: rows.length, depth: 0,
    });
  }
  const loose = alive.filter((v) => !consumed.has(v.id)).map(shipRow);

  // ── Sekcje ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const index = new Map();       // vesselId → { section, fleetId }
  const fleetIndex = new Map();  // fleetId → section
  const sectionOf = new Map();   // section → { fleets: [], ships: [] } (W drodze) / { groups: Map } (układ)
  const sec = (key) => {
    if (!sectionOf.has(key)) sectionOf.set(key, { fleets: [], ships: [], groups: new Map(SHIP_TYPE_GROUPS.map((g) => [g.id, { fleets: [], ships: [] }])) });
    return sectionOf.get(key);
  };
  for (const n of nodes) {
    const s = sec(n.section);
    (n.section === TRANSIT ? s.fleets : s.groups.get(n.group).fleets).push(n);
    fleetIndex.set(n.id, n.section);
    for (const r of n.members) index.set(r.id, { section: n.section, fleetId: n.id });
  }
  for (const r of loose) {
    const s = sec(r.section);
    (r.section === TRANSIT ? s.ships : s.groups.get(typeGroupOf(r.role)).ships).push(r);
    index.set(r.id, { section: r.section, fleetId: null });
  }
  const countOf = (fleets, ships) => fleets.reduce((n, f) => n + f.count, 0) + ships.length;

  let transit = null;
  if (sectionOf.has(TRANSIT)) {
    const s = sectionOf.get(TRANSIT);
    s.fleets.sort(byName); s.ships.sort(byRoleThenName);
    transit = { section: TRANSIT, count: countOf(s.fleets, s.ships), rows: [...s.fleets, ...s.ships] };
  }

  const order = [...known.keys()].filter((id) => sectionOf.has(id));
  const extra = [...sectionOf.keys()].filter((id) => id !== TRANSIT && !known.has(id))
    .sort((a, b) => String(nameOf(a)).localeCompare(String(nameOf(b))));
  const systems = [];
  for (const systemId of [...order, ...extra]) {
    const s = sectionOf.get(systemId);
    const groups = [];
    let count = 0;
    for (const g of SHIP_TYPE_GROUPS) {
      const b = s.groups.get(g.id);
      if (!b.fleets.length && !b.ships.length) continue;
      b.fleets.sort(byName); b.ships.sort(byRoleThenName);
      count += countOf(b.fleets, b.ships);
      groups.push({ id: g.id, rows: [...b.fleets, ...b.ships] });
    }
    systems.push({ systemId, name: nameOf(systemId), isActive: systemId === active, expanded: expandedOf(systemId) === true, count, groups });
  }
  return { transit, systems, index, fleetIndex, total: alive.length };
}
