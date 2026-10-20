// SystemTreeLogic — ARKUSZ UI, U2-1: czysta warstwa drzewa „układy → ciała” LEWEGO outlinera (UI_PLAN §4.3).
//
// Reguły (podpisane — UI_PLAN §2, §5, §7):
//   • WIDOCZNOŚĆ (D-UI-3 + decyzja 5 (b)): układ jest na liście ⇔ dom ∨ własna kolonia / placówka / stacja
//     ∨ `isSystemExploredData` ∨ własny statek w układzie ∨ własne jednostki naziemne na ciele układu. „Lub” własnej
//     obecności omija zapisy sprzed naprawy 186, w których układ odwiedzony niesie `galaxyStar.explored = false`
//     (Finding 480 — ZF gy120 `sys_024` z kolonią; Finding 489 — Polonia gy79 `sys_036` Akhernar z samym statkiem).
//     Statek i wojska — dosłowne D-UI-3 („dotarł tam statek gracza”), bez nowego stanu w zapisie (ARKUSZ UI U3-0,
//     decyzja właściciela z bramki U2). Statek w tranzycie warp (`systemId === null`) i wrak nie odsłaniają układu.
//   • KOLEJNOŚĆ (D-UI-2, §7.4): (1) dom; (2) własne układy z kolonią — najpierw z kolonią z POP, potem same
//     placówki; (3) reszta. W grupach remis rozstrzyga `galaxyStar.distanceLY`, potem nazwa. Układ z samą stacją
//     (bez kolonii) → grupa (3).
//   • CIAŁA (§7.6 — zmienione przez właściciela 2026-10-19): planety, księżyce i planetoidy (wszystko, co gracz
//     kolonizuje); asteroidy i komety poza listą. Planetoidy na poziomie planet, w kolejności orbit (`orbital.a`);
//     księżyce wcięte pod swoją planetą, bez osobnego zwijania. Lista = mapa (same nazwy), ciało nierozpoznane
//     (`explored !== true`) z „○”; skan obserwatorium nie zmienia listy (decyzja 5 (b)).
//   • STACJE (decyzja 3): stacje GRACZA pod ciałem-matką (`station.bodyId`); stacja bez ciała na liście — na końcu
//     układu.
//   • ZNACZNIKI (decyzja 3): 🪖N — żywe jednostki naziemne gracza na ciele (lista już przefiltrowana przez
//     `OutlinerGroundLogic.collectPlayerGroundUnits`: bez wroga, bez `in_cargo`, bez martwych); ⏳N — kolejka
//     kolonii gracza (`colonyQueueCount`).
//   • GLIF UKŁADU (§7.19): 🏛 kolonia z POP / ⛺ sama placówka / ⚑ obca obecność (kolonia / placówka AI) / brak.
//   • ZWIJANIE (D-UI-4, §7.5): domyślnie rozwinięty tylko bieżący układ; jawny stan użytkownika (sesja, nie zapis)
//     wygrywa z domyślnym (`isSystemExpanded`).
//
// Czysty: bez `window`, bez EventBusa, bez UI. Wszystkie wejścia przez `ctx` (wołający podaje funkcje rejestrów).
// Importy — wyłącznie kanony bez importów (`SystemExploration`, `ColonyOwnership`, `SystemScope`).

import { isSystemExploredData, HOME_SYSTEM_ID } from '../utils/SystemExploration.js';
import { isPlayerColony } from '../utils/ColonyOwnership.js';
import { systemIdOf } from '../utils/SystemScope.js';

/** Grupy kolejności D-UI-2 (mniejsza = wyżej na liście). */
export const SYSTEM_GROUP = Object.freeze({ HOME: 0, COLONY: 1, OUTPOST: 2, OTHER: 3 });

/** Glif obecności na wierszu układu (§7.19). */
export const PRESENCE_GLYPH = Object.freeze({ colony: '🏛', outpost: '⛺', foreign: '⚑' });

/** Znacznik ciała nierozpoznanego (decyzja 5 (b) — wzór katalogu obserwatorium). */
export const UNRECOGNIZED_GLYPH = '○';

/** Typy ciał na liście (§7.6 — zmienione 2026-10-19); asteroidy i komety poza listą. */
export const LISTED_BODY_TYPES = Object.freeze(['planet', 'moon', 'planetoid']);

const orbitA = (b) => {
  const a = b?.orbital?.a ?? b?.a;
  return Number.isFinite(a) ? a : Infinity;
};
const byOrbitThenName = (a, b) => (orbitA(a) - orbitA(b)) || String(a?.name ?? '').localeCompare(String(b?.name ?? ''));

/**
 * Czy wiersze ciał układu są rozwinięte (D-UI-4, §7.5).
 * @param {string} systemId
 * @param {string|null} activeSystemId — bieżący (oglądany) układ
 * @param {Map<string, boolean>|null} explicit — jawny stan użytkownika (sesja)
 */
export function isSystemExpanded(systemId, activeSystemId, explicit = null) {
  if (explicit && typeof explicit.has === 'function' && explicit.has(systemId)) return explicit.get(systemId) === true;
  return systemId === activeSystemId;
}

/**
 * ⏳N — liczba pozycji kolejki kolonii (decyzja 3): budowa budynków (w toku + oczekujące na zasoby), statki
 * (w budowie + oczekujące), placówki oczekujące, kolejka fabryki. BEZ stałej produkcji fabryki (alokacje —
 * to nie kolejka) i bez zleceń stacji.
 * @param {object} colony — wpis `ColonyManager`
 * @returns {number}
 */
export function colonyQueueCount(colony) {
  if (!colony || typeof colony !== 'object') return 0;
  const n = (a) => (Array.isArray(a) ? a.length : 0);
  const bs = colony.buildingSystem, fs = colony.factorySystem;
  return n(bs?.serializeQueue?.()) + n(bs?.serializePendingQueue?.())
    + n(colony.shipQueues) + n(colony.pendingShipOrders) + n(colony.pendingOutpostOrders)
    + n(fs?.getQueue?.());
}

/**
 * Drzewo lewego outlinera.
 * @param {object} ctx
 * @param {Array<object>} ctx.systems — rekordy `StarSystemManager.getAllSystems()`
 * @param {string} [ctx.activeSystemId]
 * @param {Array<object>} [ctx.colonies] — WSZYSTKIE kolonie (gracz + AI); własność kanonem `isPlayerColony`
 * @param {Array<object>} [ctx.stations] — `StationSystem.getAllStations()` (pokazujemy tylko stacje gracza)
 * @param {Array<{planetId:string}>} [ctx.groundUnits] — jednostki gracza na powierzchniach (`collectPlayerGroundUnits`)
 * @param {Array<object>} [ctx.vessels] — statki GRACZA (wołający filtruje `isEnemyVessel`); wraki i statki w tranzycie
 *   warp (`systemId === null`) pomijane — reszta odsłania swój układ (Finding 489)
 * @param {(type:string, systemId:string) => Array<object>} [ctx.bodiesOf] — `EntityManager.getByTypeInSystem`
 * @param {(systemId:string) => string|null} [ctx.starName] — nazwa gwiazdy układu
 * @param {(bodyId:string) => string|null} [ctx.systemOfBody] — układ ciała (`EntityManager.get(id)?.systemId`)
 * @param {(colony:object) => number} [ctx.queueCountOf] — ⏳N (domyślnie `colonyQueueCount`)
 * @param {(systemId:string) => boolean} [ctx.expanded] — dla których układów liczyć wiersze ciał (domyślnie: wszystkie)
 * @returns {{ systems: Array<object> }}
 */
export function buildSystemTree(ctx = {}) {
  const active = ctx.activeSystemId ?? HOME_SYSTEM_ID;
  const bodiesOf = typeof ctx.bodiesOf === 'function' ? ctx.bodiesOf : () => [];
  const queueOf = typeof ctx.queueCountOf === 'function' ? ctx.queueCountOf : colonyQueueCount;
  const wantBodies = typeof ctx.expanded === 'function' ? ctx.expanded : () => true;
  const sysOfBody = (id, fallback) => ctx.systemOfBody?.(id) ?? fallback ?? null;

  // ── Indeksy jednorazowe (kolonie, stacje, jednostki) ─────────────────────────────────────────────────────────
  const ownColonyByBody = new Map();   // bodyId → kolonia gracza
  const aiColonyByBody  = new Map();   // bodyId → kolonia AI
  const sysStats = new Map();          // systemId → { pop, outpost, foreign, station }
  const stat = (sysId) => {
    if (!sysStats.has(sysId)) sysStats.set(sysId, { pop: false, outpost: false, foreign: false, station: false });
    return sysStats.get(sysId);
  };
  for (const col of (ctx.colonies ?? [])) {
    if (!col?.planetId) continue;
    const sysId = sysOfBody(col.planetId, col.planet?.systemId ?? col.systemId) ?? HOME_SYSTEM_ID;
    if (isPlayerColony(col)) {
      ownColonyByBody.set(col.planetId, col);
      if (col.isOutpost === true) stat(sysId).outpost = true; else stat(sysId).pop = true;
    } else {
      aiColonyByBody.set(col.planetId, col);
      stat(sysId).foreign = true;
    }
  }
  const stationsByBody = new Map();    // bodyId → [stacje gracza]
  const stationsBySystem = new Map();  // systemId → [stacje gracza]
  for (const st of (ctx.stations ?? [])) {
    // Stacje GRACZA — filtr przeniesiony 1:1 z sekcji KOLONIE dzisiejszego Outlinera (`Outliner.js`). Kanon własności
    // kolonii (`isPlayerColony`, D6) nie obejmuje stacji (podpis D6; `StationGroup` trzyma własny predykat).
    if (!st || (st.ownerEmpireId && st.ownerEmpireId !== 'player')) continue;
    const sysId = st.systemId ?? sysOfBody(st.bodyId) ?? HOME_SYSTEM_ID;
    stat(sysId).station = true;
    if (!stationsBySystem.has(sysId)) stationsBySystem.set(sysId, []);
    stationsBySystem.get(sysId).push(st);
    if (st.bodyId) {
      if (!stationsByBody.has(st.bodyId)) stationsByBody.set(st.bodyId, []);
      stationsByBody.get(st.bodyId).push(st);
    }
  }
  const unitsByBody = new Map();
  const presenceSystems = new Set();   // Finding 489: układy z własnym statkiem albo własnymi wojskami na ciele
  for (const u of (ctx.groundUnits ?? [])) {
    if (!u?.planetId) continue;
    unitsByBody.set(u.planetId, (unitsByBody.get(u.planetId) ?? 0) + 1);
    const us = sysOfBody(u.planetId);
    if (us) presenceSystems.add(us);
  }
  for (const v of (ctx.vessels ?? [])) {
    if (!v || v.isWreck) continue;
    const vs = systemIdOf(v);              // kanon: brak pola = `sys_home`; `null` = tranzyt warp (między układami)
    if (vs) presenceSystems.add(vs);
  }

  // ── Układy: widoczność, grupa, glif, odległość ──────────────────────────────────────────────────────────────
  const out = [];
  for (const sys of (ctx.systems ?? [])) {
    const systemId = sys?.systemId;
    if (!systemId) continue;
    const s = sysStats.get(systemId) ?? { pop: false, outpost: false, foreign: false, station: false };
    const isHome = systemId === HOME_SYSTEM_ID;
    const visible = isHome || s.pop || s.outpost || s.station || isSystemExploredData(sys) || presenceSystems.has(systemId);
    if (!visible) continue;
    const group = isHome ? SYSTEM_GROUP.HOME
      : s.pop ? SYSTEM_GROUP.COLONY
      : s.outpost ? SYSTEM_GROUP.OUTPOST
      : SYSTEM_GROUP.OTHER;
    const presence = s.pop ? 'colony' : s.outpost ? 'outpost' : s.foreign ? 'foreign' : null;
    const dist = sys.galaxyStar?.distanceLY;
    const node = {
      systemId,
      name: ctx.starName?.(systemId) ?? sys.galaxyStar?.name ?? systemId,
      distanceLY: Number.isFinite(dist) ? dist : (isHome ? 0 : Infinity),
      group,
      presence,
      glyph: presence ? PRESENCE_GLYPH[presence] : '',
      isHome,
      isActive: systemId === active,
      bodies: null,   // null = nie liczone (układ zwinięty)
    };
    if (wantBodies(systemId)) node.bodies = _bodyRows(systemId, { bodiesOf, ownColonyByBody, aiColonyByBody,
      stationsByBody, stationsBySystem, unitsByBody, queueOf });
    out.push(node);
  }
  out.sort((a, b) => (a.group - b.group) || (a.distanceLY - b.distanceLY) || String(a.name).localeCompare(String(b.name)));
  return { systems: out };
}

// Wiersze ciał jednego układu w kolejności wyświetlania (spłaszczone, z głębokością wcięcia).
function _bodyRows(systemId, ix) {
  const rows = [];
  const listed = new Set();
  const planets = [...(ix.bodiesOf('planet', systemId) ?? [])];
  const planetoids = [...(ix.bodiesOf('planetoid', systemId) ?? [])];
  const moons = [...(ix.bodiesOf('moon', systemId) ?? [])];
  const planetIds = new Set(planets.map((p) => p?.id));
  const moonsOf = new Map();
  const orphanMoons = [];
  for (const m of moons) {
    if (!m?.id) continue;
    if (m.parentPlanetId && planetIds.has(m.parentPlanetId)) {
      if (!moonsOf.has(m.parentPlanetId)) moonsOf.set(m.parentPlanetId, []);
      moonsOf.get(m.parentPlanetId).push(m);
    } else orphanMoons.push(m);
  }
  const pushStations = (bodyId, depth) => {
    for (const st of (ix.stationsByBody.get(bodyId) ?? [])) {
      rows.push({ kind: 'station', id: st.id, station: st, systemId, depth, name: st.name ?? st.id, parentId: bodyId });
      listed.add(st.id);
    }
  };
  const pushBody = (b, depth, parentId = null) => {
    const own = ix.ownColonyByBody.get(b.id) ?? null;
    rows.push({
      kind: 'body', id: b.id, type: b.type, entity: b, systemId, depth, parentId,
      // Własna kolonia → JEJ nazwa; ciało obce / bez kolonii → nazwa CIAŁA (nigdy nazwa nadana przez wroga —
      // polityka `OutlinerGroundLogic`).
      name: (own?.name || b.name) ?? b.id,
      // Kolonia gracza na ciele = gracz je zna (kolonizacja wymaga rozpoznania) — wiersz bez „○” także przy niespójnej
      // fladze w zapisie.
      recognized: b.explored === true || !!own,
      colony: own ? (own.isOutpost === true ? 'outpost' : 'colony') : null,
      isHomeColony: own?.isHomePlanet === true,
      foreign: ix.aiColonyByBody.has(b.id),
      groundUnits: ix.unitsByBody.get(b.id) ?? 0,
      queue: own ? (Number(ix.queueOf(own)) || 0) : 0,
    });
    pushStations(b.id, depth + 1);
  };
  const top = [...planets, ...planetoids].filter((b) => b?.id).sort(byOrbitThenName);
  for (const b of top) {
    pushBody(b, 0);
    if (b.type === 'planet') for (const m of (moonsOf.get(b.id) ?? []).sort(byOrbitThenName)) pushBody(m, 1, b.id);
  }
  for (const m of orphanMoons.sort(byOrbitThenName)) pushBody(m, 0);
  // Stacje gracza w układzie, których ciała-matki nie ma na liście (np. ciało zniszczone) — na końcu.
  for (const st of (ix.stationsBySystem.get(systemId) ?? [])) {
    if (listed.has(st.id)) continue;
    rows.push({ kind: 'station', id: st.id, station: st, systemId, depth: 0, name: st.name ?? st.id, parentId: null });
  }
  return rows;
}
