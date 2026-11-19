// Cs2GeometryDebug — pomocniki konsoli bramki ARC COLONY SPHERE, krok CS-2 (reguły geometrii siatki za TileGraph,
// Finding 779). Wszystkie bez argumentów i bez cudzysłowów; każdy wypisuje, NA CO PATRZEĆ.
//
//   cs2Latitude()     — TYLKO ODCZYT. Kolonie gracza: wysokość siatki, czy mapa kolonii była otwarta (BuildingSystem ma
//                       siatkę), i dla każdego pasa (biegun / przedbiegun / równik) pierwsze od południa wolne pole, na którym stanie
//                       research_station: etykieta pasa, produkcja (research/rok) i koszt budowy liczone TĄ SAMĄ drogą co
//                       budowa (_calcBaseRates, modyfikator pasa _build). Okno po wczytaniu (Finding 779): liczby przed
//                       otwarciem mapy = po otwarciu. Druga tabela: już zbudowane research_station — zapisana stawka
//                       research vs oczekiwana z pasa pola.
//   cs2Seam()         — TEST (sprząta po sobie): jednostka testowa gracza (shock_infantry) na aktywnej kolonii jedno pole
//                       przed szwem mapy, rozkaz marszu 3 pola przez szew; mapa kolonii otwarta, czas 3d/s. Log każdego kroku:
//                       przez szew (teleport bez animacji) / zwrot sprite'a. Po dojściu (albo po 60 s) jednostka znika,
//                       prędkość czasu wraca.
//   cs2Invasion()     — TEST (zostawia stan — po teście wczytaj zapis): wojna z imperium AI (jeśli jej nie ma) i desant
//                       3 jednostek na AKTYWNĄ kolonię prawdziwą drogą InvasionSystem.launchInvasion. Log: pola lądowania
//                       i czy każde jest polem strefy lądowania (TileGraph.isLandingEdge = brzeg płaskiej mapy).
//   cs2Strike()       — TEST (zostawia stan — po teście wczytaj zapis): eskadra imperium AI na aktywną kolonię prawdziwą
//                       drogą StrikeSquadronSystem.launchSquadron (2 eskorty). Log: kotwica fali przy stolicy AI (pole stolicy
//                       / budynku / zapasowe anyTile) i pozycje jednostek fali; dla każdej stolicy AI: anyTile = (0,0).
//   cs2EquatorEvent() — TEST bez zmian w grze: zdarzenie losowe „uszkodzenie budynków” (RandomEventSystem._damageBuildings)
//                       na testowym budynku Lv2 BEZ pola na siatce aktywnej kolonii → stawki z pola równikowego
//                       (TileGraph.equatorTile). Testowy BuildingSystem znika po pomiarze; kolonia nietknięta.
//
// Wywołanie: `cs2Latitude()` itd. (window) albo `KOSMOS.debug.cs2Latitude()`.

import EventBus from '../core/EventBus.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { GROUND_MOVE_COST, isStandableTile } from '../data/GroundUnitData.js';
import { evaluatePlacement } from '../map/HexTile.js';
import { tileGraphOf, parseTileKey, LATITUDE_BAND } from '../map/TileGraph.js';
import { latitudeModifierOf } from '../data/LatitudeBands.js';
import { computeBuildResourceCost, computeBuildCommodityCost } from '../data/EnvironmentCost.js';
import { isPlayerColony } from '../utils/ColonyOwnership.js';
import { garrisonAnchor } from '../utils/GarrisonPlanner.js';

export const CS2_DEBUG = Object.freeze({
  PROBE_BUILDING: 'research_station',   // budynek pomiarowy: produkcja bez mnożnika terenu, bez wymagań technologii
  SEAM_UNIT: 'shock_infantry',          // archetyp jednostki testowej szwu
  SEAM_SPEED_INDEX: 2,                  // indeks TIME_MULTIPLIERS na czas marszu (3d/s ≈ 3 s na pole równiny)
  SEAM_LINGER_MS: 5000,                 // ms czasu realnego — jednostka stoi u celu, zanim zniknie
  SEAM_TIMEOUT_MS: 60000,               // ms czasu realnego — limit marszu, potem sprzątanie
  INVASION_TROOPS: 3,
  STRIKE_ESCORTS: 2,
});

const BAND_NAME = { [LATITUDE_BAND.POLAR]: 'biegun', [LATITUDE_BAND.SUBPOLAR]: 'przedbiegun', [LATITUDE_BAND.EQUATORIAL]: 'równik' };
const id2 = (t) => (t ? `${t.q},${t.r}` : '—');
const fmtCost = (c) => Object.entries(c).map(([k, v]) => `${k} ${v}`).join(', ');

/** Koszt budowy pola — te same składniki co BuildingSystem._build (modyfikator pasa × dopłata środowiskowa, Si skrajnej planety). */
export function cs2BuildCost(bSys, building, tile) {
  const planet = bSys._resolveOwnPlanet();
  const cost = { ...computeBuildResourceCost(building, planet, bSys._latitudeModifier(tile).buildCost), ...computeBuildCommodityCost(building, planet) };
  if (bSys._isPlanetExtreme() && (building.jobs ?? 0) > 0 && !building.isAutonomous) cost.Si = (cost.Si || 0) + 5;
  return cost;
}

/** Wiersze cs2Latitude dla jednej kolonii (pierwsze wolne pole każdego pasa, na którym stoi budynek pomiarowy). */
export function cs2LatitudeRows(colony) {
  const bSys = colony?.buildingSystem, grid = colony?.grid;
  if (!bSys || !grid) return [];
  const g = tileGraphOf(grid), RS = BUILDINGS[CS2_DEBUG.PROBE_BUILDING];
  const planet = bSys._resolveOwnPlanet();
  const rows = [];
  // Od POŁUDNIA (ostatnie rzędy pierwsze): tam dawna tabela wysokości GameScene (10 rzędów) i lustro _gridHeight = 0 dawały
  // po wczytaniu inny pas niż prawdziwa wysokość siatki (Finding 779) — krok bramki na tych polach rozróżnia stary i nowy kod.
  const southFirst = g.tiles().slice().reverse();
  for (const band of [LATITUDE_BAND.POLAR, LATITUDE_BAND.SUBPOLAR, LATITUDE_BAND.EQUATORIAL]) {
    const tile = southFirst.find(t => g.latitudeBand(t) === band && !t.isOccupied && !t.capitalBase && !t.anomalyEffect
      && evaluatePlacement(t, RS, { techSystem: bSys.techSystem, planet }).ok);
    rows.push({
      kolonia: colony.name, rzędów: grid.height, mapaOtwarta: bSys._grid === grid, pas: BAND_NAME[band],
      pole: id2(tile), etykieta: latitudeModifierOf(band).label ?? '—',
      produkcja: tile ? bSys._calcBaseRates(RS, tile, 1).research : null,
      koszt: tile ? fmtCost(cs2BuildCost(bSys, RS, tile)) : '(brak wolnego pola)',
    });
  }
  return rows;
}

/** Istniejące budynki pomiarowe kolonii: zapisana stawka research vs oczekiwana z pasa pola (× poziom), bez pól z anomalią. */
export function cs2ProbeBuildingRows(colony) {
  const bSys = colony?.buildingSystem, grid = colony?.grid;
  if (!bSys || !grid) return [];
  const g = tileGraphOf(grid), RS = BUILDINGS[CS2_DEBUG.PROBE_BUILDING];
  const rows = [];
  for (const [key, entry] of bSys._active) {
    if (entry.building?.id !== RS.id) continue;
    const tile = g.tile(parseTileKey(key).id);
    if (!tile) continue;
    const band = g.latitudeBand(tile);
    rows.push({ kolonia: colony.name, pole: id2(tile), pas: BAND_NAME[band], poziom: entry.level ?? 1, research: entry.baseRates?.research ?? null,
      oczekiwane: tile.anomalyEffect ? '(anomalia)' : RS.rates.research * (entry.level ?? 1) * latitudeModifierOf(band).production });
  }
  return rows;
}

function activeColony() {
  const cm = window.KOSMOS?.colonyManager;
  return cm?.getActiveColony?.() ?? null;
}

function pickAiEmpire(K) {
  const all = (K.empireRegistry?.listAll?.() ?? []).filter(e => e?.id && e.id !== 'player');
  const withCap = all.filter(e => K.directorProduction?.capitalOf?.(e.id));
  return withCap.find(e => K.diplomacySystem?.getStatus?.(e.id) === 'war') ?? withCap[0] ?? all[0] ?? null;
}

/**
 * Trasa przez szew na siatce: start → pole przy szwie → pole za szwem → cel. Warunek: ścieżka gry (TileGraph.path, te same
 * pola przejezdne) ma DOKŁADNIE 3 kroki i dokładnie jeden z nich przechodzi przez szew — wtedy rozkaz marszu na pewno
 * pokaże krok zwykły, teleport przez szew i znowu krok zwykły.
 */
export function cs2SeamRoute(grid, isFree) {
  const g = tileGraphOf(grid);
  const mid = Math.floor(grid.height / 2);
  const tiles = g.tiles().slice().sort((a, b) => Math.abs(a.r - mid) - Math.abs(b.r - mid));
  for (const a of tiles) {
    if (!isFree(a)) continue;
    for (const b of g.neighbors(a)) {
      if (!isFree(b) || !g.stepDirection(a, b).crossesSeam) continue;
      for (const start of g.neighbors(a)) {
        if (!isFree(start) || start === b) continue;
        for (const goal of g.neighbors(b)) {
          if (!isFree(goal) || goal === a) continue;
          const path = g.path(start, goal, { passable: (t) => (GROUND_MOVE_COST[t.type] ?? 1) !== Infinity });
          if (!path || path.length !== 3) continue;
          const hops = [start, ...path];
          const crossings = hops.slice(1).filter((t, i) => g.stepDirection(hops[i], t).crossesSeam).length;
          if (crossings === 1 && path.every(t => isFree(g.tile(t)))) return { start, a, b, goal };
        }
      }
    }
  }
  return null;
}

export function cs2GeometryDebugHelpers() {
  const cs2Latitude = () => {
    const cm = window.KOSMOS?.colonyManager;
    const cols = (cm?.getAllColonies?.() ?? []).filter(c => c.grid && c.buildingSystem && isPlayerColony(c));
    const act = activeColony();
    cols.sort((a, b) => (b === act) - (a === act));
    const rows = cols.flatMap(cs2LatitudeRows);
    const built = cols.flatMap(cs2ProbeBuildingRows);
    const summary = { aktywna: act?.name ?? null, kolonieGracza: cols.length, mapaNieOtwarta: cols.filter(c => c.buildingSystem._grid !== c.grid).length,
      budynekPomiarowy: CS2_DEBUG.PROBE_BUILDING, zbudowanych: built.length, zbudowanychZgodnych: built.filter(r => r.research === r.oczekiwane).length };
    console.log('[cs2Latitude]', JSON.stringify(summary), '— patrz: produkcja i koszt w danym pasie mają być TE SAME przed i po otwarciu mapy kolonii (kolumna mapaOtwarta)');
    console.table(rows);
    if (built.length) { console.log('[cs2Latitude] zbudowane research_station — research = oczekiwane (biegun ×0.5, przedbiegun ×0.7, równik ×1.0, × poziom)'); console.table(built); }
    return { ...summary, rows, built };
  };

  let seamBusy = false;
  const cs2Seam = () => {
    const K = window.KOSMOS ?? {}, col = activeColony(), gum = K.groundUnitManager, ts = K.timeSystem;
    if (seamBusy) { console.warn('[cs2Seam] test już trwa'); return null; }
    if (!col?.grid || !gum) { console.warn('[cs2Seam] brak aktywnej kolonii z mapą albo GroundUnitManager'); return null; }
    const g = tileGraphOf(col.grid);
    const isFree = (t) => !!t && isStandableTile(t) && (GROUND_MOVE_COST[t.type] ?? 1) !== Infinity && !gum.getUnitAt(col.planetId, t.q, t.r);
    const route = cs2SeamRoute(col.grid, isFree);
    if (!route) { console.warn('[cs2Seam] nie ma wolnej trasy przez szew na tej mapie'); return null; }
    const unit = gum.createUnit(CS2_DEBUG.SEAM_UNIT, col.planetId, route.start.q, route.start.r, { owner: 'player' });
    if (!unit) { console.warn('[cs2Seam] jednostka testowa nie powstała'); return null; }
    seamBusy = true;
    const steps = [];
    const origSetup = gum._setupNextStep;
    const hadOwn = Object.prototype.hasOwnProperty.call(gum, '_setupNextStep');
    gum._setupNextStep = function (u, grid) {
      const r = origSetup.call(this, u, grid);
      if (u.id === unit.id && u._path?.[0]) {
        const s = { z: id2(u), do: id2(u._path[0]), przezSzew: u._wrapStep === true, zwrot: u._facingLeft ? 'w lewo' : 'w prawo' };
        steps.push(s);
        console.log(`[cs2Seam] krok ${steps.length}: ${s.z} → ${s.do}${s.przezSzew ? '  PRZEZ SZEW (teleport na drugą krawędź, bez animacji)' : ''}, sprite patrzy ${s.zwrot}`);
      }
      return r;
    };
    const prevSpeed = ts?.multiplierIndex, prevPaused = ts?.isPaused;
    K.uiManager?.overlayManager?.openPanel?.('colony');
    const ok = gum.moveUnit(unit.id, route.goal.q, route.goal.r);
    if (ts) { ts.setMultiplier(CS2_DEBUG.SEAM_SPEED_INDEX); ts.play?.(); }
    let done = false;
    const finish = (why) => {
      if (done) return; done = true;
      EventBus.off('groundUnit:moved', onMoved);
      clearTimeout(timer);
      setTimeout(() => {
        if (hadOwn) gum._setupNextStep = origSetup; else delete gum._setupNextStep;
        gum.removeUnit(unit.id);
        if (ts) { if (prevSpeed != null) ts.setMultiplier(prevSpeed); if (prevPaused) ts.pause?.(); }
        seamBusy = false;
        const crossings = steps.filter(s => s.przezSzew).length;
        const summary = { koniec: why, pozycjaKońcowa: id2(unit), cel: id2(route.goal), kroków: steps.length, przezSzew: crossings, jednostkaUsunięta: !gum.getUnit(unit.id) };
        console.log('[cs2Seam] KONIEC', JSON.stringify(summary), '— oczekiwane: 3 kroki, dokładnie 1 przez szew, cel osiągnięty');
      }, why === 'dotarła' ? CS2_DEBUG.SEAM_LINGER_MS : 0);
    };
    const onMoved = (e) => { if (e?.unitId === unit.id && unit.q === route.goal.q && unit.r === route.goal.r) finish('dotarła'); };
    EventBus.on('groundUnit:moved', onMoved);
    const timer = setTimeout(() => finish('limit czasu'), CS2_DEBUG.SEAM_TIMEOUT_MS);
    const crossDir = g.stepDirection(route.a, route.b);
    const summary = { kolonia: col.name, jednostka: unit.id, start: id2(route.start), przySzwie: id2(route.a), zaSzwem: id2(route.b), cel: id2(route.goal),
      rozkaz: ok, ścieżka: (unit._path ?? []).map(id2).join(' → '), krokPrzezSzew: `${id2(route.a)} → ${id2(route.b)} (sprite ${crossDir.facingLeft ? 'w lewo' : 'w prawo'})` };
    console.log('[cs2Seam] TEST', JSON.stringify(summary),
      '— patrz na mapę kolonii: jednostka idzie do krawędzi, znika i pojawia się NATYCHMIAST po drugiej stronie mapy (bez przelotu przez mapę), patrzy w stronę marszu; po dojściu stoi 5 s i znika');
    return summary;
  };

  const cs2Invasion = () => {
    const K = window.KOSMOS ?? {}, col = activeColony();
    if (!col?.grid || !K.invasionSystem) { console.warn('[cs2Invasion] brak aktywnej kolonii albo InvasionSystem'); return null; }
    const emp = pickAiEmpire(K);
    if (!emp) { console.warn('[cs2Invasion] brak imperium AI'); return null; }
    let declared = false;
    if (K.diplomacySystem?.getStatus?.(emp.id) !== 'war') declared = K.diplomacySystem?.declareWar?.(emp.id, 'cs2_gate_test') === true;
    const atWar = K.diplomacySystem?.getStatus?.(emp.id) === 'war';
    const res = K.invasionSystem.launchInvasion(emp.id, col.planetId, CS2_DEBUG.INVASION_TROOPS);
    const g = tileGraphOf(col.grid);
    const units = (res?.landed ?? []).map(id => K.groundUnitManager?.getUnit?.(id)).filter(Boolean);
    const rows = units.map(u => { const t = g.tile(u); return { jednostka: u.id, typ: u.type, pole: id2(u), rząd: u.r, sąsiadów: t ? g.neighbors(t).length : null, strefaLądowania: t ? g.isLandingEdge(t) : null }; });
    const edgeTiles = g.tiles().filter(t => t.type !== 'ocean' && !t.capitalBase && g.isLandingEdge(t)).length;
    K.uiManager?.overlayManager?.openPanel?.('colony');
    const summary = { kolonia: col.name, imperium: emp.id, wojnaWypowiedzianaTeraz: declared, wojna: atWar, desant: res?.success === true, powód: res?.reason ?? null,
      wylądowało: rows.length, naPolachStrefy: rows.filter(r => r.strefaLądowania).length, polStrefyNaMapie: edgeTiles };
    console.log('[cs2Invasion] TEST', JSON.stringify(summary),
      '— patrz na mapę kolonii: wrogie jednostki stoją na BRZEGU mapy (pierwszy / ostatni rząd albo krótsze rzędy przy biegunach), nie w środku; każda strefaLądowania = true. ⚠ wojna i desant ZOSTAJĄ — po teście wczytaj zapis sprzed scenariuszy');
    console.table(rows);
    return summary;
  };

  const cs2Strike = () => {
    const K = window.KOSMOS ?? {}, col = activeColony();
    if (!col?.grid || !K.strikeSquadronSystem) { console.warn('[cs2Strike] brak aktywnej kolonii albo StrikeSquadronSystem'); return null; }
    // Kotwice wszystkich stolic AI (odczyt): pole stolicy / budynku, a bez nich zapasowe pierwsze pole grafu = (0,0).
    const caps = (K.empireRegistry?.listAll?.() ?? []).filter(e => e?.id && e.id !== 'player')
      .map(e => ({ e, cap: K.directorProduction?.capitalOf?.(e.id) })).filter(x => x.cap?.grid);
    const anchors = caps.map(({ e, cap }) => {
      const a = garrisonAnchor(cap.grid, !!cap.isOutpost), any = tileGraphOf(cap.grid).anyTile();
      return { imperium: e.id, stolica: cap.name, kotwica: a ? id2(a) : '(brak → zapas)', źródło: a ? (a.capitalBase ? 'pole stolicy' : 'pole budynku') : 'anyTile', anyTile: id2(any) };
    });
    console.table(anchors);
    const emp = pickAiEmpire(K);
    if (!emp) { console.warn('[cs2Strike] brak imperium AI'); return null; }
    const r = K.debug?.sbLaunchSquadron?.(emp.id, col.planetId, CS2_DEBUG.STRIKE_ESCORTS) ?? { ok: false, reason: 'no_debug_lever' };
    const wave = (r.unitIds ?? []).map(id => K.groundUnitManager?.getUnit?.(id)).filter(Boolean);
    const anchor = anchors.find(a => a.imperium === emp.id);
    const summary = { cel: col.name, imperium: emp.id, eskadra: r.ok === true, powód: r.reason ?? null, transport: r.transportId ?? null,
      kotwica: anchor?.kotwica ?? null, źródłoKotwicy: anchor?.źródło ?? null, fala: wave.length, falaNaKotwicy: wave.filter(u => id2(u) === anchor?.kotwica || u.status === 'in_cargo').length,
      anyTileWszystkichStolic: [...new Set(anchors.map(a => a.anyTile))].join(' / ') };
    console.log('[cs2Strike] TEST', JSON.stringify(summary),
      '— patrz: eskadra wystartowała (eskadra = true) albo odmowa z powodem; fala powstała przy kotwicy stolicy AI (w ładowni transportowca); anyTile każdej stolicy = 0,0 (dawny zapas). ⚠ eskadra ZOSTAJE — po teście wczytaj zapis');
    return summary;
  };

  const cs2EquatorEvent = () => {
    const K = window.KOSMOS ?? {}, col = activeColony(), res = K.randomEventSystem;
    if (!col?.grid || !col.buildingSystem || !res) { console.warn('[cs2EquatorEvent] brak aktywnej kolonii albo RandomEventSystem'); return null; }
    const g = tileGraphOf(col.grid), RS = BUILDINGS[CS2_DEBUG.PROBE_BUILDING];
    const BS = col.buildingSystem.constructor;
    const test = new BS(null, null, col.buildingSystem.techSystem);   // testowy: bez zasobów kolonii, ta sama planeta (pas z siatki kolonii)
    test.setPlanetId?.(col.planetId);
    const KEY = '999,999';   // pole, którego nie ma na siatce → realTile = null → fallback równikowy
    test._active.set(KEY, { building: RS, baseRates: {}, effectiveRates: {}, level: 2, producerId: `building_${KEY}` });
    const prev = Math.random;
    Math.random = () => 0;   // szansa i wybór kandydata deterministycznie (jedyny kandydat)
    try { res._damageBuildings({ grid: col.grid, buildingSystem: test, name: col.name, planetId: col.planetId }, 1, 1); }
    finally { Math.random = prev; }
    const e = test._active.get(KEY);
    const eq = g.equatorTile();
    const polar = g.tiles().find(t => g.latitudeBand(t) === LATITUDE_BAND.POLAR && !t.anomalyEffect);
    const summary = { kolonia: col.name, poleZastępcze: id2(eq), pasPolaZastępczego: eq ? BAND_NAME[g.latitudeBand(eq)] : null, poziom: `2 → ${e?.level}`,
      researchPo: e?.baseRates?.research ?? null, oczekiwane: RS.rates.research * 1, gdybyBiegun: polar ? test._calcBaseRates(RS, polar, 1).research : null, koloniaNietknięta: !col.buildingSystem._active.has(KEY) };
    test.dispose?.();
    console.log('[cs2EquatorEvent] TEST', JSON.stringify(summary),
      `— patrz: pas pola zastępczego = równik, researchPo = oczekiwane (${RS.rates.research}, bez kary polarnej); gdybyBiegun pokazuje, ile byłoby z kary`);
    return summary;
  };

  return { cs2Latitude, cs2Seam, cs2Invasion, cs2Strike, cs2EquatorEvent };
}
