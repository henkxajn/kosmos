// Keeper ARC GALAXY, krok G1 — PRAWY outliner w trybie galaktyki (docs/design/GALAXY_PLAN.md §4 G1; D-GX-10, D-GX-12).
// Protokół lekki F8: keeper wyłącznie dla LOGIKI (filtr napędu, przygaszenia, tranzyt, rezerwa, kolejność sekcji, drzewo
// trybu układu, kotwica paneli) — bez pinów na stałych rysunku.
//   S0  API
//   S1  filtr napędu warp (`warpFuel.max > 0`): kadłub bez napędu poza listą; wrak poza listą
//   S2  SEDNO: flota mieszana zostaje, gdy ≥ 1 członek ma napęd — reszta przygaszona (`fleet.warpErrConfig`); flota bez
//       żadnego napędu — poza listą w całości
//   S3  „W drodze” zostaje (statek w tranzycie warp, `systemId === null`)
//   S4  SEDNO: kadłub w rezerwie W2 (i w mobilizacji) — na liście, przygaszony z powodem `vessel.reasonVesselInReserve`
//   S5  test napędu: konfiguracja, nie paliwo (pusty bak warp = napęd jest)
//   S6  kolejność sekcji z WŁASNEJ reguły (dom → własne układy wg odległości → reszta), nie z listy lewego (tam kolonia
//       z POP przed placówką)
//   S7  prawdziwy `Outliner.draw` w trybie galaktyki: wiersze statków z napędem, przygaszenia (`textDim`), podpowiedź z powodem,
//       sekcja „W drodze”, wróg i statek bez napędu nieobecne
//   S8  SEDNO: tryb układu bez zmian — drzewo co do bajtu JSON jak bez kontrolera trybu; statek bez napędu jest; brak
//       `dimReason`
//   S9  panele statku i floty dokują do wiersza w trybie galaktyki (`shipRowKeys` / `fleetRowKeys` + `resolveRowAnchor`)
// Uruchom: node src/testing/smoke/galaxy_ship_tree_smoke.mjs
import '../headless/env.js';           // MUSI być pierwszy
import EntityManager from '../../core/EntityManager.js';
import { THEME } from '../../config/ThemeConfig.js';
import { t, setLocale } from '../../i18n/i18n.js';

let GOL = null, OL = null, SPA = null, FPH = null;
try { GOL = await import('../../ui/GalaxyOutlinerLogic.js'); } catch (e) { console.log('  (GalaxyOutlinerLogic:', e.message + ')'); }
try { OL = await import('../../ui/Outliner.js'); } catch (e) { console.log('  (Outliner:', e.message + ')'); }
try { SPA = await import('../../ui/ShipPanelAnchorLogic.js'); } catch { /* piny padną */ }
try { FPH = await import('../../ui/FleetPanelHudLogic.js'); } catch { /* piny padną */ }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
const header = (s) => console.log(`\n── ${s}`);
const call = (fn, ...a) => { try { return fn ? fn(...a) : undefined; } catch (e) { return `WYJĄTEK: ${e.message}`; } };
setLocale('pl');
const W = 1280, H = 900;

const recCtx = () => {
  const calls = { text: [] };
  let fillStyle = '#000';
  return new Proxy({}, {
    get(o, k) {
      if (k === '_calls') return calls;
      if (k === 'fillStyle') return fillStyle;
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'fillText') return (s, x, y) => { calls.text.push({ s: String(s), x, y, fillStyle }); };
      if (k in o) return o[k];
      return () => {};
    },
    set(o, k, v) { if (k === 'fillStyle') fillStyle = v; else o[k] = v; return true; },
  });
};

// ── Świat ────────────────────────────────────────────────────────────────────────────────────────────────────────
const SYS = [
  { id: 'sys_home', name: 'Dom', isHome: true, x: 0, y: 0, z: 0, distanceLY: 0, spectralType: 'G', explored: true },
  { id: 'sys_far', name: 'Kochab', x: 7, y: 0, z: 0, distanceLY: 7.0, spectralType: 'K', explored: true },
  { id: 'sys_near', name: 'Pollux', x: 3, y: 0, z: 0, distanceLY: 3.0, spectralType: 'K', explored: true },
  { id: 'sys_x', name: 'Altair', x: 2, y: 0, z: 0, distanceLY: 2.0, spectralType: 'A', explored: true },
];
const BODIES = [
  { id: 'star_h', type: 'star', name: 'Dom', systemId: 'sys_home' }, { id: 'star_f', type: 'star', name: 'Kochab', systemId: 'sys_far' },
  { id: 'star_n', type: 'star', name: 'Pollux', systemId: 'sys_near' }, { id: 'star_x', type: 'star', name: 'Altair', systemId: 'sys_x' },
  { id: 'H1', type: 'planet', name: 'Ziemia', systemId: 'sys_home', orbital: { a: 1 } },
  { id: 'F1', type: 'planet', name: 'Kochab c', systemId: 'sys_far', orbital: { a: 1 } },
  { id: 'N1', type: 'moon', name: 'Pollux b-I', systemId: 'sys_near', orbital: { a: 0.1 } },
];
EntityManager.clear?.();
for (const e of BODIES) EntityManager.add({ ...e });
const COLONIES = [
  { planetId: 'H1', name: 'Ziemia', isHomePlanet: true, isOutpost: false, ownerEmpireId: null },
  { planetId: 'F1', name: 'Nowa Ziemia', isOutpost: false, ownerEmpireId: null },
  { planetId: 'N1', name: 'Placówka', isOutpost: true, ownerEmpireId: null },
];
const WARP = { current: 0, max: 20 }, NOWARP = { current: 0, max: 0 };
const ship = (id, name, systemId, extra = {}) => ({
  id, name, shipId: 'hull_small', systemId, modules: ['engine_ion'], position: { state: 'orbiting', dockedAt: 'H1', x: 100, y: 0 },
  fuel: { current: 10, max: 10 }, warpFuel: NOWARP, status: 'idle', mission: null, movementOrder: null, fleetId: null,
  unpaidYears: 0, isWreck: false, ...extra,
});
const VESSELS = [
  ship('w1', 'Skoczek', 'sys_home', { warpFuel: WARP, modules: ['engine_warp', 'warp_tank'] }),
  ship('n1', 'Kurier', 'sys_home'),
  ship('w2', 'Miecz', 'sys_far', { warpFuel: { current: 4, max: 20 }, fleetId: 'f1', position: { state: 'orbiting', dockedAt: 'F1', x: 100, y: 0 } }),
  ship('n2', 'Tarcza', 'sys_far', { fleetId: 'f1', position: { state: 'orbiting', dockedAt: 'F1', x: 100, y: 0 } }),
  ship('n3', 'Hol', 'sys_home', { fleetId: 'f2' }),
  ship('n4', 'Barka', 'sys_home', { fleetId: 'f2' }),
  ship('t1', 'Wedrowiec', null, { warpFuel: WARP, position: { state: 'orbiting', dockedAt: null, x: 0, y: 0 },
    mission: { type: 'interstellar_jump', phase: 'warp_transit' } }),
  ship('r1', 'Rezerwa', 'sys_home', { warpFuel: WARP, serviceState: 'stored' }),
  ship('m1', 'Mobil', 'sys_home', { warpFuel: WARP, serviceState: 'mobilizing' }),
  ship('e1', 'Obcy', 'sys_home', { warpFuel: WARP, ownerEmpireId: 'emp_001' }),
  ship('k1', 'Wrak', 'sys_home', { warpFuel: WARP, isWreck: true }),
];
const VMAP = new Map(VESSELS.map((v) => [v.id, v]));
const FLEETS = [{ id: 'f1', name: 'Grupa Alfa', memberIds: ['w2', 'n2'] }, { id: 'f2', name: 'Konwój', memberIds: ['n3', 'n4'] }];
const GM = { isActive: true, selectedSystemId: null };
let sel = [], fleetSel = null;
const K = globalThis.window.KOSMOS;
Object.assign(K, {
  civMode: true, planetGlobeOpen: false, activeSystemId: 'sys_home',
  galaxyData: { systems: SYS }, galaxyMode: GM, entityManager: EntityManager,
  starSystemManager: { activeSystemId: 'sys_home', getSystem: () => ({}), getAllSystems: () => SYS.map((s) => ({ systemId: s.id, galaxyStar: s })) },
  intelSystem: { isAtLeast: () => false }, observatorySystem: { getSystemScanResult: () => null },
  uiManager: { _selectedEntity: null, getSelectedVesselIds: () => [...sel], getSelectedVesselId: () => sel[0] ?? null,
    getSelectedFleetId: () => fleetSel, setSelectedVesselId: (id) => { sel = id == null ? [] : [id]; }, setSelectedFleetId: (id) => { fleetSel = id; },
    overlayManager: { isAnyOpen: () => false } },
  threeRenderer: { _pingedEnemyId: null, resetToSystemView: () => true },
  stationPanel: { visible: false }, tacticalDock: { isExpanded: () => false, getReservedHeight: () => 0 },
  colonyManager: { getAllColonies: () => COLONIES, getColony: (id) => COLONIES.find((c) => c.planetId === id) ?? null },
  stationSystem: { getAllStations: () => [] },
  vesselManager: { _vessels: VMAP, getVessel: (id) => VMAP.get(id) ?? null, getAllVessels: () => [...VMAP.values()], isImmobilized: () => false },
  fleetSystem: { listFleets: () => FLEETS, getFleet: (id) => FLEETS.find((f) => f.id === id) ?? null },
  deepSpaceCombatSystem: { _findActiveEncounterContaining: () => null },
  timeSystem: { gameTime: 10 },
});
const playerVessels = VESSELS.filter((v) => !v.ownerEmpireId);
const view = GOL?.buildGalaxyShipView?.({ vessels: playerVessels, fleets: FLEETS });
const keptIds = new Set((view?.vessels ?? []).map((v) => v.id));

// ═══ S0 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('S0  API');
ok(typeof GOL?.buildGalaxyShipView === 'function' && typeof GOL?.isWarpCapable === 'function' && typeof GOL?.galaxyShipSectionOrder === 'function',
  'S0a buildGalaxyShipView / isWarpCapable / galaxyShipSectionOrder');
ok(typeof OL?.Outliner === 'function', 'S0b Outliner (importuje się pod node — prawdziwy `draw`)');

// ═══ S1 – S5 ══════════════════════════════════════════════════════════════════════════════════════════════════════
header('S1  filtr napędu warp');
ok(keptIds.has('w1') && !keptIds.has('n1') && !keptIds.has('k1'), 'S1a statek z napędem — jest; bez napędu — poza listą; wrak — poza listą');
header('S2  flota mieszana');
ok(keptIds.has('w2') && keptIds.has('n2') && view?.dim?.get('n2') === 'fleet.warpErrConfig' && !view?.dim?.has('w2'),
  'S2a SEDNO: flota z ≥ 1 napędem zostaje w całości; członek bez napędu przygaszony (`fleet.warpErrConfig`)');
ok(!keptIds.has('n3') && !keptIds.has('n4'), 'S2b flota bez żadnego napędu — poza listą w całości');
header('S3  „W drodze”');
ok(keptIds.has('t1') && !view?.dim?.has('t1'), 'S3a statek w tranzycie warp (`systemId === null`) — na liście, nieprzygaszony');
header('S4  rezerwa');
ok(keptIds.has('r1') && view?.dim?.get('r1') === 'vessel.reasonVesselInReserve' && view?.dim?.get('m1') === 'vessel.reasonVesselInReserve',
  'S4a SEDNO: kadłub w rezerwie i w mobilizacji — na liście, przygaszony z powodem `vessel.reasonVesselInReserve`');
ok(!view?.dim?.has('w1') && view?.vessels?.length === 6, `S4b w służbie z napędem — bez przygaszenia; na liście 6 statków (${view?.vessels?.length})`);
header('S5  test napędu = konfiguracja');
const iw = GOL?.isWarpCapable;
ok(iw?.({ warpFuel: { current: 0, max: 20 } }) === true && iw?.({ warpFuel: { current: 5, max: 0 } }) === false && iw?.({}) === false && iw?.(null) === false,
  'S5a pusty bak warp — napęd jest; max 0 / brak pola — brak napędu');

// ═══ S6 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('S6  kolejność sekcji — reguła prawego, nie lista lewego');
{
  const world = call(() => GOL.galaxyWorldContext(K, { colonies: COLONIES, groundUnits: [] }));
  const order = call(() => GOL.galaxyShipSectionOrder({ systems: world.systems, presence: world.presence }))?.map?.((s) => s.systemId) ?? [];
  const left = call(() => GOL.buildGalaxySystemList({ ...world }))?.rows?.map?.((r) => r.systemId) ?? [];
  ok(order.join(' ') === 'sys_home sys_near sys_far sys_x', `S6a dom → własne układy wg odległości (placówka 3 ly przed kolonią 7 ly) → reszta (${order.join(' ')})`);
  ok(left.join(' ') === 'sys_home sys_far sys_near sys_x' && left.join(' ') !== order.join(' '),
    'S6b KONTROLA: lewy ma inną kolejność (kolonia z POP przed placówką) — prawy nie czyta listy lewego');
}

// ═══ S7 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('S7  prawdziwy Outliner.draw w trybie galaktyki');
const newRO = () => { const ro = OL?.Outliner ? new OL.Outliner() : null; K.rightOutliner = ro; return ro; };
const drawRO = (ro) => { const ctx = recCtx(); call(() => ro.draw(ctx, W, H, { treeColonies: COLONIES, colonies: [], groundUnits: [] })); return ctx._calls.text; };
const zone = (ro, type, id) => (ro?._clickTargets ?? []).find((z) => z.type === type && (id == null || z.vesselId === id || z.fleetId === id || z.systemId === id)) ?? null;
{
  GM.isActive = true;
  const ro = newRO();
  call(() => ro.toggleExpanded('sys_far', 'sys_home'));
  const calls = drawRO(ro), names = calls.map((c) => c.s);
  ok(['Skoczek', 'Miecz', 'Tarcza', 'Wedrowiec', 'Rezerwa', 'Mobil'].every((n) => names.includes(n)), 'S7a wiersze: z napędem, flota mieszana (oba), w tranzycie, rezerwa, mobilizacja');
  ok(!['Kurier', 'Hol', 'Barka', 'Obcy', 'Wrak'].some((n) => names.includes(n)), 'S7b nieobecne: bez napędu, flota bez napędu, wróg, wrak');
  const col = (n) => calls.find((c) => c.s === n)?.fillStyle;
  ok(col('Tarcza') === THEME.textDim && col('Rezerwa') === THEME.textDim && col('Skoczek') !== THEME.textDim,
    'S7c przygaszone wiersze rysowane `textDim`; statek w służbie z napędem — nie');
  ok(!!zone(ro, 'transit'), 'S7d sekcja „W drodze” w liście');
  const zr = zone(ro, 'vessel', 'r1');
  if (zr) call(() => ro.updateHover(zr.x + 60, zr.y + 4, W, H));
  const tipR = (ro?._tip?.lines ?? []).map((l) => l.text);
  const zt = zone(ro, 'vessel', 'n2');
  if (zt) call(() => ro.updateHover(zt.x + 60, zt.y + 4, W, H));
  const tipT = (ro?._tip?.lines ?? []).map((l) => l.text);
  ok(tipR.includes(t('vessel.reasonVesselInReserve')) && tipT.includes(t('fleet.warpErrConfig')), 'S7e podpowiedź wiersza przygaszonego — z powodem');
  const zs = zone(ro, 'vessel', 'w1');
  if (zs) call(() => ro.updateHover(zs.x + 60, zs.y + 4, W, H));
  ok(!(ro?._tip?.lines ?? []).some((l) => l.text === t('vessel.reasonVesselInReserve') || l.text === t('fleet.warpErrConfig')), 'S7f KONTROLA: wiersz w służbie z napędem — bez powodu przygaszenia');
  const secs = (ro?._clickTargets ?? []).filter((z) => z.type === 'system').map((z) => z.systemId);
  ok(secs.indexOf('sys_home') === 0 && secs.indexOf('sys_far') > 0, `S7g sekcje w kolejności reguły prawego (${secs.join(' ')})`);

  // ═══ S9 (na tym samym rysunku) ═════════════════════════════════════════════════════════════════════════════════
  header('S9  panele dokują do wiersza w trybie galaktyki');
  const a1 = SPA?.resolveRowAnchor?.(ro?._layout, SPA?.shipRowKeys?.('w1', ro?._layout?.result));
  ok(a1?.key === 'vessel:w1', `S9a panel statku: kotwica przy wierszu (${a1?.key})`);
  const af = SPA?.resolveRowAnchor?.(ro?._layout, FPH?.fleetRowKeys?.('f1', ro?._layout?.result));
  ok(!!af && String(af.key).includes('f1'), `S9b panel floty: kotwica przy węźle floty (${af?.key})`);
  const an = SPA?.resolveRowAnchor?.(ro?._layout, SPA?.shipRowKeys?.('n1', ro?._layout?.result));
  ok(an === null || an.key !== 'vessel:n1', 'S9c KONTROLA: statek spoza listy galaktyki — bez kotwicy przy wierszu (panel w miejscu zapasowym)');
}

// ═══ S8 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('S8  tryb układu bez zmian');
{
  const input = { treeColonies: COLONIES, colonies: [], groundUnits: [], systems: SYS.map((s) => ({ systemId: s.id, name: s.name })) };
  const ro = newRO();
  GM.isActive = false;
  const a = call(() => ro._tree(K, input, 'sys_home'));
  const gm0 = K.galaxyMode; delete K.galaxyMode;
  const b = call(() => ro._tree(K, input, 'sys_home'));
  K.galaxyMode = gm0;
  const js = (tr) => JSON.stringify(tr, (k, v) => (v instanceof Map ? [...v.entries()] : v));
  ok(typeof a === 'object' && js(a) === js(b), 'S8a SEDNO: drzewo z nieaktywnym trybem galaktyki ≡ drzewo bez kontrolera (co do bajtu JSON)');
  const all = [...(a?.transit?.rows ?? []), ...(a?.systems ?? []).flatMap((s) => (s.groups ?? []).flatMap((g) => g.rows ?? []))];
  const flat = all.flatMap((r) => (r.kind === 'fleet' ? (r.members ?? []) : [r]));
  ok(a?.index?.has?.('n1') && a?.index?.has?.('n3') && !flat.some((r) => r.dimReason), 'S8b tryb układu: statki bez napędu są, żaden wiersz nie ma `dimReason`');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
