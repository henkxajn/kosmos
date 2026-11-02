// GalaxyOutlinerLogic — ARC GALAXY, krok G1 (docs/design/GALAXY_PLAN.md §4 G1; D-GX-10, D-GX-11, D-GX-12; F4): CZYSTA
// logika OBU outlinerów w trybie galaktyki. Widoki — `LeftOutliner` / `Outliner` (gałąź `galaxyMode.isActive`); drzewa
// trybu układu (`SystemTreeLogic`, `ShipTreeLogic`) bez zmian.
//
// LEWY (D-GX-10, D-GX-11):
//   • ŹRÓDŁO: `galaxyData.systems` (wszystkie 72), nie rejestr wygenerowanych układów.
//   • LISTA: układ z ujawnioną NAZWĄ (`reveal.name` — kanon `SystemReveal`, składany w `SystemRevealWorld`) ∨ własna
//     obecność (kolonia, placówka, stacja, statek, wojska — reguła D-UI-3 lewego outlinera; zapisy sprzed naprawy 186 mają
//     układ z kolonią gracza z `explored = false`, Findingi 480 / 489). Własna obecność = gracz tam jest, więc zna nazwę
//     i miejsce.
//   • PRZYGASZENIE + ○: miejsce nieznane (`!reveal.place` ∧ brak obecności).
//   • KOLEJNOŚĆ (D-UI-2 rozszerzone): dom; własne układy z kolonią z POP; z placówką albo stacją; reszta — w grupie wg
//     odległości od domu, potem nazwy.
//   • WEJŚCIE: `GalaxyModeLogic.isSystemEnterable` — wygenerowany ∧ (zbadany ∨ obecność); wiersz bez wejścia ma podpowiedź.
//   • ROZWINIĘCIE: linia informacji (odległość ly · klasa widmowa · liczba kolonii) + właściciel (`fleet.stratcomEmpire*`)
//     + WŁASNE kolonie i stacje (zawsze — klik = wejście z fokusem na obiekcie) + OBCE kolonie wg DWÓCH OSI (D-GX-11):
//     nazwy (nazwy CIAŁ — nigdy nazwa nadana przez wroga) przy miejscu ∧ kontakcie z właścicielem kolonii, „?” przy samym
//     istnieniu właściciela (`rumor`), nic poza tym; populacja wyłącznie przy wywiadzie `detailed` właściciela.
// PRAWY (D-GX-12):
//   • statki z napędem warp (`warpFuel.max > 0`); flota zostaje, gdy ≥ 1 członek ma napęd — reszta członków przygaszona
//     (powód `fleet.warpErrConfig`); „W drodze” zostaje (statek w tranzycie warp); kadłub w rezerwie W2 — przygaszony
//     z powodem `vessel.reasonVesselInReserve`;
//   • kolejność sekcji z własnej reguły (własne układy najpierw, potem odległość od domu), nie z listy lewego.
// Czysty: bez `window`, bez EventBusa, bez i18n — napisy składa widok. Kanał świata (`K` = `window.KOSMOS`) wyłącznie
// w `galaxyWorldContext`, przekazany JAWNIE (atrapa w keeperze).

import { isPlayerColony } from '../utils/ColonyOwnership.js';
import { systemIdOf } from '../utils/SystemScope.js';
import { HOME_SYSTEM_ID, isSystemExplored } from '../utils/SystemExploration.js';
import { systemRevealFromWorld } from '../utils/SystemRevealWorld.js';
import { isSystemEnterable } from './GalaxyModeLogic.js';
import { isEnemyVessel, isInService } from '../entities/Vessel.js';   // kanony strony i służby statku (W2)

/** Grupy kolejności (mniejsza = wyżej). */
export const GALAXY_GROUP = Object.freeze({ HOME: 0, COLONY: 1, OUTPOST: 2, OTHER: 3 });

/** Znacznik miejsca nieznanego (jak ciało nierozpoznane w trybie układu). */
export const UNKNOWN_PLACE_GLYPH = '○';

/**
 * ARC GALAXY G2 (anty-lustro — trzy powierzchnie): JEDNA reguła „nazwa układu znana” — `reveal.name` (kanon `SystemReveal`)
 * ∨ własna obecność gracza (dom, kolonia, placówka, stacja, statek, wojska). Czytają ją: wiersz lewego outlinera
 * (`buildGalaxySystemList`), nazwa na płycie (`HudGalaxyLabelLayer`) i nagłówek przypięcia (`GalaxyChromeLogic`).
 */
export function isGalaxyNameKnown(rec, own) {
  return rec?.name === true || own === true;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// ── Obecność gracza w układach (reguła D-UI-3) ───────────────────────────────────────────────────────────────────────

/**
 * Indeks układ → obecność gracza i kolonie (własne i obce) oraz stacje gracza.
 * @param {{ colonies?:Array, stations?:Array, vessels?:Array, groundUnits?:Array, systemOfBody?:Function }} ctx —
 *   `vessels` = statki GRACZA (wołający filtruje wroga); wraki i tranzyt warp (`systemId === null`) nie odsłaniają układu
 * @returns {Map<string, {pop:boolean, outpost:boolean, station:boolean, ship:boolean, troops:boolean, own:boolean,
 *   ownColonies:object[], ownStations:object[], foreignColonies:object[]}>}
 */
export function systemPresenceIndex({ colonies = [], stations = [], vessels = [], groundUnits = [], systemOfBody = () => null } = {}) {
  const idx = new Map();
  const get = (sid) => {
    const k = String(sid);
    if (!idx.has(k)) idx.set(k, { pop: false, outpost: false, station: false, ship: false, troops: false, own: false,
      ownColonies: [], ownStations: [], foreignColonies: [] });
    return idx.get(k);
  };
  const sysOf = (id, fallback) => systemOfBody(id) ?? fallback ?? null;
  for (const col of colonies ?? []) {
    if (!col?.planetId) continue;
    const e = get(sysOf(col.planetId, col.planet?.systemId ?? col.systemId) ?? HOME_SYSTEM_ID);
    if (isPlayerColony(col)) { e.ownColonies.push(col); if (col.isOutpost === true) e.outpost = true; else e.pop = true; }
    else e.foreignColonies.push(col);
  }
  for (const st of stations ?? []) {
    // Stacje GRACZA — ten sam filtr co drzewo trybu układu (`SystemTreeLogic`).
    if (!st || (st.ownerEmpireId && st.ownerEmpireId !== 'player')) continue;
    const e = get(st.systemId ?? sysOf(st.bodyId) ?? HOME_SYSTEM_ID);
    e.station = true;
    e.ownStations.push(st);
  }
  for (const v of vessels ?? []) {
    if (!v || v.isWreck) continue;
    const s = systemIdOf(v);
    if (s) get(s).ship = true;
  }
  for (const u of groundUnits ?? []) {
    const s = u?.planetId ? sysOf(u.planetId) : null;
    if (s) get(s).troops = true;
  }
  for (const e of idx.values()) e.own = e.pop || e.outpost || e.station || e.ship || e.troops;
  return idx;
}

// ── Lewy outliner — lista układów galaktyki ──────────────────────────────────────────────────────────────────────────

/**
 * Lista układów trybu galaktyki.
 * @param {object} ctx
 * @param {Array} ctx.systems — `galaxyData.systems`
 * @param {string} [ctx.activeSystemId]
 * @param {string|null} [ctx.selectedId] — gwiazda zaznaczona na płycie
 * @param {(sys:object) => object} ctx.reveal — rekord `SystemReveal` układu
 * @param {(sys:object) => boolean} [ctx.explored] — `isSystemExplored`
 * @param {(id:string) => boolean} [ctx.generated] — układ wygenerowany (`starSystemManager.getSystem`)
 * @param {Map} [ctx.presence] — `systemPresenceIndex`
 * @param {(empireId:string, level:string) => boolean} [ctx.intelAtLeast] — wywiad o imperium (kolonie obce)
 * @param {(id:string) => boolean} [ctx.expanded] — czy wiersz rozwinięty
 * @param {(bodyId:string) => string|null} [ctx.bodyName] — nazwa ciała
 * @param {(colony:object) => number|null} [ctx.population] — populacja kolonii [POP]
 * @param {boolean} [ctx.includeUnknown] — ARC GALAXY G2: także układy bez nazwy (`known: false`) — treść przypięcia
 *   i najechania gwiazdy bez nazwy; lista lewego outlinera NIE używa (domyślnie `false` — wynik G1 bez zmian)
 * @returns {{ rows: object[], byId: Map<string, object> }}
 */
export function buildGalaxySystemList(ctx = {}) {
  const active = ctx.activeSystemId ?? HOME_SYSTEM_ID;
  const sel = ctx.selectedId == null ? null : String(ctx.selectedId);
  const presence = ctx.presence instanceof Map ? ctx.presence : new Map();
  const exploredOf = typeof ctx.explored === 'function' ? ctx.explored : isSystemExplored;
  const generatedOf = typeof ctx.generated === 'function' ? ctx.generated : () => false;
  const intel = typeof ctx.intelAtLeast === 'function' ? ctx.intelAtLeast : () => false;
  const expandedOf = typeof ctx.expanded === 'function' ? ctx.expanded : () => false;
  const bodyName = typeof ctx.bodyName === 'function' ? ctx.bodyName : (id) => id;
  const popOf = typeof ctx.population === 'function' ? ctx.population : () => null;
  const rows = [];
  for (const sys of (Array.isArray(ctx.systems) ? ctx.systems : [])) {
    if (!sys || sys.id == null) continue;
    const id = String(sys.id);
    const isHome = sys.isHome === true || id === HOME_SYSTEM_ID;
    const rec = (typeof ctx.reveal === 'function' ? ctx.reveal(sys) : null) ?? {};
    const pres = presence.get(id) ?? null;
    const own = isHome || pres?.own === true;
    const known = isGalaxyNameKnown(rec, own);
    if (!known && ctx.includeUnknown !== true) continue;   // brak nazwy i brak obecności — układ poza listą (mgła wojny)
    const placeKnown = rec.place === true || own;
    const group = isHome ? GALAXY_GROUP.HOME
      : pres?.pop ? GALAXY_GROUP.COLONY
      : (pres?.outpost || pres?.station) ? GALAXY_GROUP.OUTPOST
      : GALAXY_GROUP.OTHER;
    const dist = num(sys.distanceLY) ?? (isHome ? 0 : Math.hypot(num(sys.x) ?? 0, num(sys.y) ?? 0, num(sys.z) ?? 0));
    // Właściciel: imperium AI wg osi właściciela; bez imperium z kolonią gracza — gracz; reszta — nieznany (kanon panelu
    // Stratcom: pusty układ też „nieznany”, żeby nie zdradzać pustki).
    const owner = sys.empireId
      ? (rec.ownerIdentity === true ? { kind: 'identity', empireId: sys.empireId }
        : rec.ownerExists === true ? { kind: 'foreign', empireId: null } : { kind: 'unknown', empireId: null })
      : ((pres?.pop || pres?.outpost) ? { kind: 'player', empireId: null } : { kind: 'unknown', empireId: null });
    // Kolonie obce — dwie osie (D-GX-11), per właściciel kolonii.
    const foreignAll = pres?.foreignColonies ?? [];
    const named = [], unknownOwners = [];
    for (const col of foreignAll) {
      const emp = col.ownerEmpireId ?? sys.empireId ?? null;
      if (placeKnown && emp && intel(emp, 'contact')) {
        named.push({ bodyId: col.planetId, name: bodyName(col.planetId) ?? col.planetId,
          population: intel(emp, 'detailed') ? popOf(col) : null });
      } else if ((emp && intel(emp, 'rumor')) || rec.ownerExists === true) {
        unknownOwners.push(col.planetId);
      }
    }
    const foreign = named.length ? { kind: 'names', colonies: named, more: unknownOwners.length > 0 }
      : unknownOwners.length ? { kind: 'unknown', colonies: [], more: false }
      : { kind: 'none', colonies: [], more: false };
    const ownCount = pres?.ownColonies?.length ?? 0;
    const colonyCount = foreign.kind === 'names'
      ? (foreign.more ? `${ownCount + named.length}+?` : String(ownCount + named.length))
      : foreign.kind === 'unknown' ? (ownCount > 0 ? `${ownCount}+?` : '?') : String(ownCount);
    const generated = generatedOf(id) === true;
    const row = {
      systemId: id, sys, name: sys.name ?? id, isHome, isActive: id === String(active), isSelected: id === sel,
      known, placeKnown, dim: !placeKnown, own, group, distanceLY: dist, spectral: sys.spectralType ?? null,
      generated, enterable: isSystemEnterable({ generated, explored: exploredOf(sys) === true || isHome, presence: own }),
      expanded: expandedOf(id) === true,
      owner, colonyCount,
      ownColonies: (pres?.ownColonies ?? []).map((c) => ({ bodyId: c.planetId, name: c.name || bodyName(c.planetId) || c.planetId,
        isOutpost: c.isOutpost === true })),
      ownStations: (pres?.ownStations ?? []).map((s) => ({ stationId: s.id, name: s.name ?? s.id, bodyId: s.bodyId ?? null })),
      foreign,
    };
    rows.push(row);
  }
  rows.sort((a, b) => (a.group - b.group) || (a.distanceLY - b.distanceLY) || String(a.name).localeCompare(String(b.name)));
  return { rows, byId: new Map(rows.map((r) => [r.systemId, r])) };
}

/**
 * Kontekst listy z żywego świata (`K` = `window.KOSMOS`, jawnie). `input.colonies` / `input.groundUnits` — dane, które
 * UIManager i tak liczy dla outlinerów w każdej klatce.
 */
export function galaxyWorldContext(K, input = {}) {
  const em = K?.entityManager ?? null;
  const ssm = K?.starSystemManager ?? null;
  const systemOfBody = (id) => {
    const e = em?.get?.(id) ?? null;
    return e ? systemIdOf(e) : null;
  };
  const playerVessels = input.vessels ?? (K?.vesselManager?.getAllVessels?.() ?? []).filter((v) => v && !isEnemyVessel(v));
  const presence = systemPresenceIndex({
    colonies: input.colonies ?? K?.colonyManager?.getAllColonies?.() ?? [],
    stations: K?.stationSystem?.getAllStations?.() ?? [],
    vessels: playerVessels,
    groundUnits: input.groundUnits ?? [],
    systemOfBody,
  });
  return {
    systems: K?.galaxyData?.systems ?? [],
    activeSystemId: K?.activeSystemId ?? ssm?.activeSystemId ?? HOME_SYSTEM_ID,
    selectedId: K?.galaxyMode?.selectedSystemId ?? null,
    reveal: (sys) => systemRevealFromWorld(K, sys),
    explored: isSystemExplored,
    generated: (id) => !!ssm?.getSystem?.(id),
    presence,
    intelAtLeast: (emp, lvl) => K?.intelSystem?.isAtLeast?.(emp, lvl) === true,
    bodyName: (id) => em?.get?.(id)?.name ?? null,
    population: (col) => (Number.isFinite(col?.civSystem?.population) ? col.civSystem.population : null),
    systemOfBody,
  };
}

// ── Prawy outliner — statki z napędem warp ───────────────────────────────────────────────────────────────────────────

/** Napęd warp: `warpFuel.max > 0` (D-GX-12 — ten sam test co Stratcom). */
export function isWarpCapable(v) { return Number(v?.warpFuel?.max) > 0; }

/**
 * Statki trybu galaktyki i przygaszenia.
 * @param {{ vessels:Array, fleets?:Array, warpCapable?:Function, inService?:Function }} ctx — `vessels` = statki GRACZA
 * @returns {{ vessels:object[], dim: Map<string, string> }} — `dim`: id statku → klucz powodu (i18n)
 */
export function buildGalaxyShipView({ vessels = [], fleets = [], warpCapable = isWarpCapable, inService = isInService } = {}) {
  const alive = (vessels ?? []).filter((v) => v && v.id != null && !v.isWreck);
  const capable = new Set(alive.filter((v) => warpCapable(v)).map((v) => String(v.id)));
  const inFleetWithDrive = new Set();
  for (const f of fleets ?? []) {
    const ids = (f?.memberIds ?? []).map(String);
    if (ids.some((id) => capable.has(id))) for (const id of ids) inFleetWithDrive.add(id);
  }
  const kept = alive.filter((v) => {
    const id = String(v.id);
    return capable.has(id) || inFleetWithDrive.has(id) || systemIdOf(v) === null;   // tranzyt warp zostaje
  });
  const dim = new Map();
  for (const v of kept) {
    const id = String(v.id);
    if (!capable.has(id)) dim.set(id, 'fleet.warpErrConfig');
    else if (!inService(v)) dim.set(id, 'vessel.reasonVesselInReserve');
  }
  return { vessels: kept, dim };
}

/**
 * Kolejność sekcji prawego outlinera w trybie galaktyki: dom, własne układy (kolonia, placówka, stacja), potem reszta —
 * w grupie wg odległości od domu, potem nazwy.
 * @param {{ systems:Array, presence?:Map, systemName?:Function }} ctx
 * @returns {Array<{systemId:string, name:string}>}
 */
export function galaxyShipSectionOrder({ systems = [], presence = new Map(), systemName = null } = {}) {
  const out = [];
  for (const sys of systems ?? []) {
    if (!sys || sys.id == null) continue;
    const id = String(sys.id);
    const isHome = sys.isHome === true || id === HOME_SYSTEM_ID;
    const p = presence.get(id);
    const ownSys = isHome || !!(p?.pop || p?.outpost || p?.station);
    const dist = num(sys.distanceLY) ?? (isHome ? 0 : Infinity);
    out.push({ systemId: id, name: systemName?.(id) ?? sys.name ?? id, rank: isHome ? 0 : ownSys ? 1 : 2, dist });
  }
  out.sort((a, b) => (a.rank - b.rank) || (a.dist - b.dist) || String(a.name).localeCompare(String(b.name)));
  return out.map(({ systemId, name }) => ({ systemId, name }));
}
