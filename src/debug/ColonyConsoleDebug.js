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

export function colonyConsoleDebugHelpers() { return { csConsole, csOutpost, csColony, csStationTech, csPoor, csRich }; }
