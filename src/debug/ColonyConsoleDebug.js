// ColonyConsoleDebug — pomocniki konsoli przeglądarki do kontroli kroku CS-8 (konsola Kolonii). Bez argumentów, bez cudzysłowów.
//
//   csConsole()     — stan okna kolonii: czy rysuje się konsola, stan inspektora, soczewka, tryb budowy i wybrany budynek,
//                     kolejka budowy (w toku / oczekujące w kolejności opłacania), kolonia pokazywana i aktywna.
//   csOutpost()     — zakłada placówkę gracza na pierwszym wolnym ciele układu macierzystego i ogłasza to zdarzeniem
//                     `outpost:founded` (jak statek) — do sprawdzenia listy konsoli i Finding 740 (aktywna kolonia zostaje).
//   csColony()      — zakłada pełną kolonię gracza drogą gry (`expedition:colonyFounded`: siatka z fabryki, stolica, port).
//   csStationTech() — odkrywa technologię Konstrukcji orbitalnych (czip [ STACJA ] przestaje być wyłączony).
//   csPoor()        — zeruje surowce budowlane pokazywanej kolonii (następne budowy trafią do kolejki zamówień);
//                     csRich() — dosypuje surowców i towarów (budowy ruszają od razu).
//   CS-8c:
//   csBarracks()    — stawia od razu Koszary Lv1 na pierwszym wolnym polu lądowym pokazywanej kolonii (rekrutacja dostępna).
//   csStation()     — stawia od razu stację orbitalną nad ciałem pokazywanej kolonii (strona Stacji: zarządzanie, pickery).
//   csGroup()       — zaznacza w oknie kolonii wszystkie własne jednostki na pokazywanej kolonii (szuflada grupy przy 2+).
//   csCancelOutside() — Finding 789: przy ZAMKNIĘTYM oknie kolonii zamawia budowę bez surowców (kolejka zamówień), dosypuje
//                     surowce i opłaca zamówienie tak, jak robi to tik gry (budowa rusza), po czym anuluje ją publicznym
//                     `cancelConstruction` — ścieżką spoza okna. Stan „okno nie widziało tej kolonii w tej sesji” (jak po F5
//                     i Kontynuuj) — kopia siatki okna dla tej kolonii jest pomijana. Wypisuje kolejkę przed / po i zwrot.
//
// Importowalne pod node (bez THREE): czyta wyłącznie window.KOSMOS.

const BUILD_RESOURCES = ['Fe', 'Si', 'Cu', 'C', 'Ti', 'Al'];
const BUILD_COMMODITIES = ['structural_alloys', 'polymer_composites', 'power_cells', 'conductor_bundles', 'pressure_modules', 'electronic_systems'];

function ctx() {
  const K = window.KOSMOS, cm = K?.colonyManager;
  const ov = K?.overlayManager?.overlays?.colony ?? null;
  const col = (ov?.visible ? ov._getColony?.() : null) ?? cm?.getColony?.(cm?.activePlanetId) ?? cm?.getColony?.(K?.homePlanet?.id) ?? null;
  return { K, cm, ov, col };
}

function freeBody(K, cm) {
  const EM = K?.entityManager, home = K?.homePlanet;
  const sys = home?.systemId ?? 'sys_home';
  const bodies = [...(EM?.getByType?.('planet') ?? []), ...(EM?.getByType?.('moon') ?? [])];
  return bodies.find((b) => b.id !== home?.id && (b.systemId ?? 'sys_home') === sys && b.planetType !== 'gas' && !cm.getColony(b.id)) ?? null;
}

export function csConsole() {
  const { cm, ov, col } = ctx();
  const b = col?.buildingSystem ?? null;
  const out = {
    open: !!ov?.visible, console: !!(ov?.visible && ov._consoleOn), grid: col?.grid?.kind ?? (col ? 'flat' : null),
    shown: col?.planetId ?? null, active: cm?.activePlanetId ?? null,
    inspector: ov?._cInspector?.kind ?? null, lens: ov?._sphere?.lens ?? null, supply: !!ov?._showSupplyCoverage,
    buildMode: !!ov?._cBuildMode, picked: ov?._cPick ?? null, placeable: ov?._cPlaceable?.count ?? null,
    building: b ? [...b._constructionQueue.keys()] : [], waiting: b ? [...b._pendingQueue.keys()] : [],
    colonies: (cm?.getPlayerColonies?.() ?? []).map((c) => `${c.planet?.name ?? c.planetId}${c.isOutpost ? ' (outpost)' : ''}`),
  };
  console.log('[csConsole]', JSON.stringify(out));
  return out;
}

export function csOutpost() {
  const { K, cm } = ctx();
  const body = cm ? freeBody(K, cm) : null;
  if (!body) { console.warn('[csOutpost] no free body in the home system'); return null; }
  const before = cm.activePlanetId;
  const o = cm.createOutpost(body.id, { Fe: 50 }, K.timeSystem?.gameTime ?? 0);
  K.eventBus?.emit?.('outpost:founded', { colony: o });
  const out = { id: body.id, outpost: body.name ?? body.id, grid: o?.grid?.kind ?? 'flat', activeBefore: before, activeAfter: cm.activePlanetId, activeKept: before === cm.activePlanetId };
  console.log('[csOutpost]', JSON.stringify(out));
  if (K.uiManager) K.uiManager._dirty = true;
  return out;
}

export function csColony() {
  const { K, cm } = ctx();
  const body = cm ? freeBody(K, cm) : null;
  if (!body) { console.warn('[csColony] no free body in the home system'); return null; }
  K.eventBus?.emit?.('expedition:colonyFounded', { planetId: body.id, startResources: { Fe: 200, Si: 200, C: 100 }, startPop: 4, autoSpaceport: true });
  const c = cm.getColony(body.id);
  const out = { id: body.id, colony: body.name ?? body.id, grid: c?.grid?.kind ?? 'flat', keys: c ? [...c.buildingSystem._active.keys()] : [] };
  console.log('[csColony]', JSON.stringify(out));
  return out;
}

export function csStationTech() {
  const { K } = ctx();
  K?.techSystem?.grantTechs?.(['orbital_construction']);
  const ok = !!K?.techSystem?.isResearched?.('orbital_construction');
  if (K?.uiManager) K.uiManager._dirty = true;
  console.log('[csStationTech]', ok ? 'Orbital Construction researched' : 'not researched');
  return ok;
}

function setStock(amountOf) {
  const { K, col } = ctx();
  const rs = col?.resourceSystem;
  if (!rs) { console.warn('[csPoor / csRich] no colony'); return null; }
  const store = K?.systemPoolService?.getStore?.(rs) ?? rs;
  const out = {};
  for (const k of [...BUILD_RESOURCES, ...BUILD_COMMODITIES]) {
    const v = amountOf(k);
    if (v == null) continue;
    store.inventory?.set?.(k, v);
    out[k] = v;
  }
  if (K?.uiManager) K.uiManager._dirty = true;
  return { colony: col.planet?.name ?? col.planetId, stock: out };
}

export function csPoor() {
  const out = setStock((k) => (BUILD_RESOURCES.includes(k) ? 0 : null));
  console.log('[csPoor]', JSON.stringify(out));
  return out;
}

export function csRich() {
  const out = setStock((k) => (BUILD_RESOURCES.includes(k) ? 2000 : 200));
  console.log('[csRich]', JSON.stringify(out));
  return out;
}

function freeLandTile(col) {
  const g = col?.grid ?? col?.buildingSystem?._grid;
  const tiles = g?.tiles ?? (g?.toArray?.() ?? []);
  const list = Array.isArray(tiles) ? tiles : [...(tiles?.values?.() ?? [])];
  return list.find((t) => !t.capitalBase && !t.buildingId && !t.underConstruction && !t.pendingBuild && !t.isOccupied
    && ['plains', 'forest', 'desert', 'tundra', 'mountains'].includes(t.type)) ?? null;
}

export function csBarracks() {
  const { K, col, ov } = ctx();
  const b = col?.buildingSystem, t = freeLandTile(col);
  if (!b || !t) { console.warn('[csBarracks] no colony or no free land tile'); return null; }
  b._activateBuilding(t.key, 'barracks_lv1', null, t.type, false);
  if (ov?._gridCache?.[col.planetId]) ov._syncTileBuildings?.(ov._gridCache[col.planetId], b);
  if (K?.uiManager) K.uiManager._dirty = true;
  const out = { colony: col.planet?.name ?? col.planetId, tile: t.key, barracksLv: K?.colonyManager?._getBarracksLevel?.(col) ?? 0 };
  console.log('[csBarracks]', JSON.stringify(out));
  return out;
}

export function csStation() {
  const { K, col } = ctx();
  const st = col ? K?.debug?.spawnStation?.(col.planetId) : null;
  if (K?.uiManager) K.uiManager._dirty = true;
  const out = { colony: col?.planet?.name ?? col?.planetId ?? null, station: st?.id ?? null, name: st?.name ?? null };
  console.log('[csStation]', JSON.stringify(out));
  return out;
}

export function csGroup() {
  const { K, col, ov } = ctx();
  const mine = (K?.groundUnitManager?.getUnitsOnPlanet?.(col?.planetId) ?? []).filter((u) => u.owner === 'player' || u.factionId === 'humanity');
  if (!ov || mine.length < 1) { console.warn('[csGroup] no own units on the shown colony (csSphereUnit places one)'); return null; }
  ov._selectedUnits = new Set(mine.map((u) => u.id));
  ov._selectedUnit = mine[0];
  if (K?.uiManager) K.uiManager._dirty = true;
  const out = { colony: col.planet?.name ?? col.planetId, selected: mine.map((u) => u.id) };
  console.log('[csGroup]', JSON.stringify(out));
  return out;
}

export function csCancelOutside() {
  const { K, cm, ov } = ctx();
  const col = cm?.getColony?.(cm?.activePlanetId) ?? null;
  const b = col?.buildingSystem, t = freeLandTile(col);
  if (!b || !t) { console.warn('[csCancelOutside] no active colony or no free land tile'); return null; }
  if (ov?.visible) { if (K?.overlayManager) K.overlayManager.closeActive(); else ov.hide?.(); }
  if (ov?._gridCache) delete ov._gridCache[col.planetId];   // okno nie widziało tej kolonii w tej sesji (jak po F5 + Kontynuuj)
  const rs = col.resourceSystem, store = K?.systemPoolService?.getStore?.(rs) ?? rs;
  const saved = Object.fromEntries(BUILD_RESOURCES.map((k) => [k, store.inventory?.get?.(k) ?? 0]));
  for (const k of BUILD_RESOURCES) store.inventory?.set?.(k, 0);
  K?.eventBus?.emit?.('planet:buildRequest', { tile: t, buildingId: 'solar_farm' });
  const pending = b._pendingQueue.has(t.key);
  for (const k of BUILD_RESOURCES) store.inventory?.set?.(k, (saved[k] ?? 0) + 500);
  b._tickPendingQueue();
  const started = b._constructionQueue.has(t.key);
  const staleTile = !!t.pendingBuild && !t.underConstruction;
  const fe0 = store.inventory?.get?.('Fe') ?? 0;
  const ok = b.cancelConstruction(t.key);
  const out = { colony: col.planet?.name ?? col.planetId, tile: t.key, pendingFirst: pending, constructionStarted: started, staleTileBeforeCancel: staleTile,
    cancelReturned: ok, stillBuilding: b._constructionQueue.has(t.key), refundFe: (store.inventory?.get?.('Fe') ?? 0) - fe0 };
  console.log('[csCancelOutside]', JSON.stringify(out));
  return out;
}

export function colonyConsoleDebugHelpers() { return { csConsole, csOutpost, csColony, csStationTech, csPoor, csRich, csBarracks, csStation, csGroup, csCancelOutside }; }
