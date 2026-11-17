// ARC KONSOLE K7-A — Dowództwo na szablonie konsoli: czysta logika (FEATURES.consoleCommand).
//
// Bez DOM, bez canvasu, bez window — wejście z FleetManagerOverlay / CommandConsoleView, wyjście = dane do rysunku i strefy.
// Filtry, sort i grupowanie zostają w `FleetRegistryLogic` (te same funkcje co ścieżka OFF — wynik ON == OFF z konstrukcji);
// tu są tylko rzeczy nowe dla konsoli: czipy grupy, role statusu, liczniki filtrów, bramki akcji z powodem i18n,
// temat osi czasu, podsumowanie multi-selekcji, układ kolumn tabeli w strefie bohatera, prostokąt pola szukania (px CSS).

import { filterRows, collectSystemChoices, collectRoleChoices, REGISTRY_COLUMNS, TRANSIT_KEY } from './FleetRegistryLogic.js';

// Zakładki Dowództwa w dzisiejszej kolejności paska (`_drawTabBar`); Logistyka tylko z `FEATURES.transportOrders`.
export const CMD_TABS = Object.freeze(['tactical', 'ground', 'atlas', 'logistics']);
const TAB_LABEL_KEYS = Object.freeze({
  tactical: 'fleet.tabTactical', ground: 'fleet.tabGround', atlas: 'fleet.tabAtlas', logistics: 'fleet.tabLogistics',
});

/** Czipy nagłówka (zastępują własny pasek zakładek Dowództwa): `{ id, label, active }`; id = id zakładki (`tab`). */
export function commandGroupChips(activeTab, features, t) {
  return CMD_TABS
    .filter((id) => id !== 'logistics' || !!features?.transportOrders)
    .map((id) => ({ id, label: t(TAB_LABEL_KEYS[id]), active: id === (activeTab ?? 'tactical') }));
}

/** Domyślny filtr rejestru (ten sam co `open({ focusVesselId })` w overlayu). */
export function defaultRegistryFilter() {
  return { systemKey: null, role: null, search: '', showWrecks: false, showContacts: false };
}

/** Czy filtr zawęża tabelę (układ, rola albo szukajka). Sekcje wraków / kontaktów poszerzają — nie liczą się. */
export function isFilterNarrowing(f) {
  return !!f && (f.systemKey != null || f.role != null || String(f.search ?? '').trim() !== '');
}

// ── Role statusu (kolory tylko przez role konsoli) ─────────────────────────────────────────────────────────────────────

/**
 * Rola wiersza: kontakt → foreign; wrak → dim; walka / wymaga uwagi (uszkodzony, mało paliwa, unieruchomiony…) → alert;
 * bezczynny → dim; ruch / misja → primary.
 */
export function rowRole(r) {
  const kind = r?.kind ?? 'own';
  if (kind === 'contact') return 'foreign';
  if (kind === 'wreck') return 'dim';
  if (r?.tone === 'combat' || r?.tone === 'alert') return 'alert';
  if (r?.tone === 'idle') return 'dim';
  return 'primary';
}

/** Rola komórki paliwa: < 20 % → alert (próg dzisiejszej kolumny), brak danych → dim. */
export function fuelRole(fuelPct) {
  if (fuelPct == null) return 'dim';
  return fuelPct < 0.2 ? 'alert' : 'dim';
}

// ── Układ kolumn w strefie bohatera ────────────────────────────────────────────────────────────────────────────────────

// Szerokości kolumn stałych ścieżki OFF (`_registryColumnRects`) — punkt wyjścia; w węższym bohaterze skalowane razem.
export const CMD_FIXED_COLS = Object.freeze({
  role: 54, fleet: 80, system: 66, body: 76, state: 62, activity: 96, from: 78, to: 82, eta: 42, fuel: 38, alerts: 28,
});
export const CMD_TABLE = Object.freeze({ CHECK_W: 18, FOCUS_W: 40, NAME_MIN: 96, MIN_SCALE: 0.6 });

/**
 * Prostokąty kolumn tabeli: pole wyboru, 12 dzisiejszych kolumn (`REGISTRY_COLUMNS`), kolumna „Pokaż”.
 * Gdy szerokość nie mieści dzisiejszych stałych, wszystkie stałe kolumny kurczą się jednym współczynnikiem (≥ MIN_SCALE),
 * nazwa dostaje resztę (≥ NAME_MIN). Komórki ucina widok (pełny tekst w podpowiedzi).
 * @returns {{ check:{x,w}, cols:Array<{id,x,w}>, focus:{x,w}, scale:number }}
 */
export function registryColumnLayout(x0, totalW) {
  const fixedSum = Object.values(CMD_FIXED_COLS).reduce((a, b) => a + b, 0);
  const room = totalW - CMD_TABLE.CHECK_W - CMD_TABLE.FOCUS_W - CMD_TABLE.NAME_MIN;
  const scale = Math.max(CMD_TABLE.MIN_SCALE, Math.min(1, room / fixedSum));
  const fixed = Object.fromEntries(Object.entries(CMD_FIXED_COLS).map(([k, v]) => [k, Math.floor(v * scale)]));
  const usedFixed = Object.values(fixed).reduce((a, b) => a + b, 0);
  const nameW = Math.max(CMD_TABLE.NAME_MIN, totalW - CMD_TABLE.CHECK_W - CMD_TABLE.FOCUS_W - usedFixed);
  const cols = [];
  let cx = x0 + CMD_TABLE.CHECK_W;
  for (const id of REGISTRY_COLUMNS) {
    const w = id === 'name' ? nameW : fixed[id];
    cols.push({ id, x: cx, w });
    cx += w;
  }
  return { check: { x: x0, w: CMD_TABLE.CHECK_W }, cols, focus: { x: cx, w: CMD_TABLE.FOCUS_W }, scale };
}

// ── Liczniki filtrów (lista: grupy, floty, filtry z licznikami) ───────────────────────────────────────────────────────

/**
 * Liczniki fasetowe: ile wierszy pokaże tabela po wybraniu danej pozycji przy pozostałych filtrach bez zmian.
 * @returns {{ shown:number, allSystems:number, systems:Array<{key,name,isTransit,count}>, allRoles:number,
 *            roles:Array<{role,count}>, wrecks:number, contacts:number, own:number }}
 */
export function facetCounts(rowsAll, filter) {
  const f = { ...defaultRegistryFilter(), ...(filter ?? {}) };
  const rows = rowsAll ?? [];
  const n = (patch) => filterRows(rows, { ...f, ...patch }).length;
  return {
    shown: n({}),
    allSystems: n({ systemKey: null }),
    systems: collectSystemChoices(rows).map((c) => ({ ...c, count: n({ systemKey: c.key }) })),
    allRoles: n({ role: null }),
    roles: collectRoleChoices(rows.filter((r) => r.kind === 'own')).map((role) => ({ role, count: n({ role }) })),
    wrecks: rows.filter((r) => r.kind === 'wreck').length,
    contacts: rows.filter((r) => r.kind === 'contact').length,
    own: rows.filter((r) => (r.kind ?? 'own') === 'own').length,
  };
}

/**
 * Wiersze listy konsoli: nagłówki sekcji `{ group:true, label }` i pozycje `{ id, label, value, active, zone, dimmed }`.
 * `zone` = dzisiejsza strefa trafień (typ + dane bez zmian) albo null (pozycja nieklikalna — np. sekcja z licznikiem 0,
 * aktywna pozycja „Wszystkie”). Klik pozycji robi dokładnie to, co dziś klik czipa.
 * @param {{ counts, filter, groupMode, fleets:Array<{id,name,count}>, selectedFleetId, systemLabel:(c)=>string,
 *           roleLabel:(role)=>string }} m
 */
export function registryListRows(m, t) {
  const f = { ...defaultRegistryFilter(), ...(m.filter ?? {}) };
  const c = m.counts;
  const out = [];
  const item = (id, label, value, active, zone, dimmed = false) => out.push({ id, label, value, active, zone, dimmed });

  out.push({ group: true, label: t('cmdConsole.secGroup') });
  for (const mode of ['none', 'fleet', 'system']) {
    const key = { none: 'cmdConsole.groupNone', fleet: 'cmdConsole.groupFleet', system: 'cmdConsole.groupSystem' }[mode];
    item(`grp:${mode}`, t(key), '', m.groupMode === mode, { type: 'registryGroupMode', data: { mode } });
  }

  out.push({ group: true, label: t('cmdConsole.secFleets') });
  if (!(m.fleets?.length > 0)) item('fleet:none', t('cmdConsole.noFleets'), '', false, null, true);
  for (const fl of m.fleets ?? []) {
    item(`fleet:${fl.id}`, fl.name, `×${fl.count}`, fl.id === m.selectedFleetId,
      { type: 'registryGroupFleet', data: { fleetId: fl.id } });
  }

  out.push({ group: true, label: t('cmdConsole.secSystem') });
  // „Wszystkie”: aktywna = brak filtra układu (nic do zrobienia); nieaktywna = klik zdejmuje filtr (ten sam przełącznik czipa)
  item('sys:*', t('cmdConsole.all'), String(c.allSystems), f.systemKey == null,
    f.systemKey == null ? null : { type: 'registryChipSystem', data: { key: f.systemKey } });
  for (const s of c.systems) {
    item(`sys:${s.key}`, s.isTransit ? t('cmdConsole.transit') : m.systemLabel(s), String(s.count),
      f.systemKey === s.key, { type: 'registryChipSystem', data: { key: s.key } }, s.count === 0);
  }

  out.push({ group: true, label: t('cmdConsole.secRole') });
  item('role:*', t('cmdConsole.all'), String(c.allRoles), f.role == null,
    f.role == null ? null : { type: 'registryChipRole', data: { role: f.role } });
  for (const r of c.roles) {
    item(`role:${r.role}`, m.roleLabel(r.role), String(r.count), f.role === r.role,
      { type: 'registryChipRole', data: { role: r.role } }, r.count === 0);
  }

  out.push({ group: true, label: t('cmdConsole.secSections') });
  item('kind:showWrecks', t('cmdConsole.wrecks'), String(c.wrecks), !!f.showWrecks,
    c.wrecks > 0 ? { type: 'registryChipKind', data: { field: 'showWrecks' } } : null, c.wrecks === 0);
  item('kind:showContacts', t('cmdConsole.contacts'), String(c.contacts), !!f.showContacts,
    c.contacts > 0 ? { type: 'registryChipKind', data: { field: 'showContacts' } } : null, c.contacts === 0);
  return out;
}

/** Członkowie floty (`fleetSystem` trzyma `memberIds`). */
export function fleetMemberIds(fl) {
  return Array.isArray(fl?.memberIds) ? fl.memberIds : [];
}

/** Floty gracza do listy: `{ id, name, count }` po nazwie; liczba = członkowie (`memberIds`). */
export function fleetListItems(fleets) {
  return (fleets ?? [])
    .map((fl) => ({ id: fl.id, name: fl.name ?? '—', count: fleetMemberIds(fl).length }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id)));
}

/**
 * Linia kontekstu nad tabelą: co widać i dlaczego (licznik, układ, rola, szukajka, sekcje, sort). Zwraca listę części.
 * @param {{ shown:number, total:number, filter, systemName:string|null, roleName:string|null, sortLabel:string, sortDir:number }} c
 */
export function contextParts(c, t) {
  const f = { ...defaultRegistryFilter(), ...(c.filter ?? {}) };
  const parts = [t('cmdConsole.ctxShown', c.shown, c.total)];
  if (f.systemKey === TRANSIT_KEY) parts.push(t('cmdConsole.ctxSystem', t('cmdConsole.transit')));
  else if (f.systemKey != null) parts.push(t('cmdConsole.ctxSystem', c.systemName ?? '—'));
  if (f.role != null) parts.push(t('cmdConsole.ctxRole', c.roleName ?? '—'));
  const q = String(f.search ?? '').trim();
  if (q) parts.push(t('cmdConsole.ctxSearch', q));
  if (!isFilterNarrowing(f)) parts.push(t('cmdConsole.ctxNoFilter'));
  if (f.showWrecks) parts.push(t('cmdConsole.ctxWrecks'));
  if (f.showContacts) parts.push(t('cmdConsole.ctxContacts'));
  parts.push(t('cmdConsole.ctxSort', c.sortLabel, c.sortDir > 0 ? '▲' : '▼'));
  return parts;
}

/** Stan pustej tabeli: brak statków w ogóle / filtry wycięły wszystko (z akcją „wyczyść filtry”) / null (są wiersze). */
export function emptyState(shown, counts, filter) {
  if (shown > 0) return null;
  if ((counts?.own ?? 0) === 0 && (counts?.wrecks ?? 0) === 0 && (counts?.contacts ?? 0) === 0) {
    return { key: 'cmdConsole.emptyNoShips', canClear: isFilterNarrowing(filter) };
  }
  return { key: 'cmdConsole.emptyFiltered', canClear: true };
}

// ── Bramki akcji (wyłączona akcja zawsze z powodem i18n) ───────────────────────────────────────────────────────────────

/**
 * Plan „POKAŻ” (bramka K7-A: jedyna droga do statku z konsoli — wiersz tylko zaznacza) liczony z ŻYWEGO statku, nie z danych
 * strefy z ostatniej klatki:
 *   tranzyt między układami (systemId null)         → disabled, powód z celem skoku (`cmdConsole.focusTransit`);
 *   inny układ, którego nie da się otworzyć          → disabled, powód z nazwą układu (`cmdConsole.focusNoSystem`);
 *   inny układ                                       → `switchTo` = układ statku, potem kamera;
 *   zadokowany (hangar / stacja — bez obiektu 3D)    → cel = ciało / stacja dokowania (`target` 'body' | 'station');
 *   reszta (orbita, lot)                             → cel = statek; kamera śledzi jego bieżącą pozycję (renderer, `vessel:focus`).
 * Wrak / wróg / brak statku → null (kolumny nie ma — jak dziś).
 * @param {object|null} v — statek (VesselManager)
 * @param {{ activeSystemId:string, canSwitch:(sysId)=>boolean, isStation:(id)=>boolean, systemName:(sysId)=>string,
 *           transitTarget?:string|null }} env
 * @returns {null|{ ok:boolean, reasonKey:string, args:string[], switchTo:string|null, target:'ship'|'body'|'station'|null,
 *           systemId:string|null }}
 */
export function focusPlan(v, env = {}) {
  if (!v || v.isWreck || v.isEnemy === true) return null;
  const sys = v.systemId === undefined ? 'sys_home' : v.systemId;   // kanon `systemIdOf`: brak pola = dom, null = tranzyt
  const dash = '\u2014';
  if (sys === null) {
    return { ok: false, reasonKey: 'cmdConsole.focusTransit', args: [env.transitTarget ?? dash], switchTo: null, target: null, systemId: null };
  }
  const other = sys !== (env.activeSystemId ?? 'sys_home');
  if (other && env.canSwitch?.(sys) !== true) {
    return { ok: false, reasonKey: 'cmdConsole.focusNoSystem', args: [env.systemName?.(sys) ?? dash], switchTo: null, target: null, systemId: sys };
  }
  const dockedAt = v.position?.state === 'docked' ? (v.position?.dockedAt ?? null) : null;
  const target = dockedAt ? (env.isStation?.(dockedAt) ? 'station' : 'body') : 'ship';
  const reasonKey = other ? 'cmdConsole.focusOther' : (target === 'ship' ? 'cmdConsole.focusHint' : 'cmdConsole.focusDocked');
  return { ok: true, reasonKey, args: other ? [env.systemName?.(sys) ?? dash] : [], switchTo: other ? sys : null, target, systemId: sys };
}

/**
 * „Pokaż” w wierszu: wrak i kontakt → null (bez kolumny); plan z żywego statku, gdy podany; bez niego (keeper bez statku)
 * reguła wiersza: tranzyt wyłączony z powodem.
 */
export function focusGate(r, plan = undefined) {
  const kind = r?.kind ?? 'own';
  if (kind !== 'own') return null;
  if (plan !== undefined) return plan;
  if (r.isTransit) return { ok: false, reasonKey: 'cmdConsole.focusTransit', args: [r.toName ?? '\u2014'] };
  return { ok: true, reasonKey: 'cmdConsole.focusHint', args: [] };
}

/** Akcja zbiorcza „Przypisz do floty” (dzisiejsze `fleetAssignMenuOpen`): wymaga ≥ 1 zaznaczonego statku. */
export function bulkGate(count) {
  return count > 0 ? { ok: true, reasonKey: null } : { ok: false, reasonKey: 'cmdConsole.bulkNeed' };
}

/** Wiersz kontaktu (wrogi, intel) — tylko podgląd: podpowiedź zamiast cichego braku reakcji. */
export function rowHintKey(r) {
  return (r?.kind ?? 'own') === 'contact' ? 'cmdConsole.contactHint' : null;
}

// ── Pas: temat osi czasu ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Czyje tory pokazuje pas: wybrana flota → jej członkowie; zaznaczenie wielokrotne → zaznaczone (+ wybrany statek);
 * wybrany statek → on; nic → wiersze widoczne w tabeli (dzisiejsza oś — kolejność i grupowanie tabeli).
 * @returns {{ kind:'fleet'|'multi'|'vessel'|'visible', ids:string[], label:string|null }}
 */
export function timelineSubject({ selVesselId = null, fleet = null, multiIds = [], visibleRows = [], vesselName = null }) {
  if (fleet) return { kind: 'fleet', ids: [...fleetMemberIds(fleet)], label: fleet.name ?? null };
  const multi = [...(multiIds ?? [])];
  if (multi.length > 0) {
    const ids = selVesselId && !multi.includes(selVesselId) ? [selVesselId, ...multi] : multi;
    return { kind: 'multi', ids, label: String(ids.length) };
  }
  if (selVesselId) return { kind: 'vessel', ids: [selVesselId], label: vesselName };
  return { kind: 'visible', ids: (visibleRows ?? []).map((r) => r.id), label: String((visibleRows ?? []).length) };
}

/** Etykieta tematu osi (i18n). */
export function subjectLabel(subj, t) {
  switch (subj?.kind) {
    case 'fleet':  return t('cmdConsole.subjFleet', subj.label ?? '—');
    case 'multi':  return t('cmdConsole.subjMulti', subj.label);
    case 'vessel': return t('cmdConsole.subjVessel', subj.label ?? '—');
    default:       return t('cmdConsole.subjVisible', subj?.label ?? '0');
  }
}

// ── Inspektor: podsumowanie zaznaczenia wielokrotnego ─────────────────────────────────────────────────────────────────

/**
 * Podsumowanie zaznaczonych statków z wierszy rejestru: liczba, role, układy, w walce, wymaga uwagi, mało paliwa, nazwy.
 * Zaznaczone id bez wiersza (statek zniknął) są pomijane.
 */
export function multiSummary(rowsAll, multiIds) {
  const set = new Set(multiIds ?? []);
  const rows = (rowsAll ?? []).filter((r) => set.has(r.id) && (r.kind ?? 'own') === 'own');
  const roleCount = new Map();
  for (const r of rows) roleCount.set(r.role, (roleCount.get(r.role) ?? 0) + 1);
  return {
    count: rows.length,
    roles: [...roleCount.entries()].map(([role, n]) => ({ role, n })).sort((a, b) => b.n - a.n || String(a.role).localeCompare(String(b.role))),
    systems: new Set(rows.map((r) => (r.isTransit ? TRANSIT_KEY : r.systemId))).size,
    combat: rows.filter((r) => r.tone === 'combat').length,
    alert: rows.filter((r) => r.alertCount > 0).length,
    lowFuel: rows.filter((r) => r.fuelPct != null && r.fuelPct < 0.2).length,
    names: rows.map((r) => ({ id: r.id, name: r.name })).sort((a, b) => String(a.name).localeCompare(String(b.name))),
  };
}

// ── Pole szukania (DOM) z prostokąta strefy konsoli ───────────────────────────────────────────────────────────────────

/**
 * Pozycja `<input>` szukajki w px CSS z prostokąta pola w px logicznych (`consoleZones` → lista) i skali UI (`uiViewport`).
 * @returns {{ left:number, top:number, width:number, height:number, fontPx:number }}
 */
export function searchInputCss(rect, scale) {
  const s = Number(scale) > 0 ? Number(scale) : 1;
  return {
    left: Math.round(rect.x * s), top: Math.round(rect.y * s),
    width: Math.round(rect.w * s), height: Math.round(rect.h * s),
    fontPx: Math.max(9, Math.round(10 * s)),
  };
}
