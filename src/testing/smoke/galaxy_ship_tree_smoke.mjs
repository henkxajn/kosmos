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
//   S10 po G3 (F3): sekcja układu bez nazwy — „???” + `textDim`; cel skoku ma sekcję bez statku na miejscu („→N”); dopisek i podpowiedź bez
//       prawdziwej nazwy
//   S11 po G3 (F4): CTRL+klik wiersza przełącza statek w zbiorze; klik nagłówka sekcji w trybie galaktyki — gwiazda + rozwinięcie, 2. klik —
//       wejście przez bramkę G1 (nie przełączenie układu z pominięciem bramki); KONTROLA: tryb układu jak dotąd
// PRZECELOWANE 2026-11-07 (ARC GALAXY G5-B): flaga `galaxyWarp` na stałe ON, ścieżki OFF usunięte — wycofane S10h (KONTROLA
//   OFF: prawdziwa nazwa, cel skoku bez sekcji) i S11g (KONTROLA OFF: klik sekcji przełącza układ jak przed krokiem); S11k bez
//   połówki OFF (zostaje tryb układu — bez podpowiedzi `cannotEnter`); świadkami ON zostają S10f (układy z nazwą — nazwa)
//   i S11h (tryb układu — klik sekcji przełącza układ); linie ustawiające i przywracające flagę usunięte (S10, S11).
// Uruchom: node src/testing/smoke/galaxy_ship_tree_smoke.mjs
import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
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

// ═══ S10 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('S10 sekcja układu bez nazwy i cel skoku');
{
  const fog = { id: 'sys_fog', name: 'Sekret', x: 4, y: 0, z: 0, distanceLY: 4.0, spectralType: 'M', explored: false };
  const dst = { id: 'sys_dst', name: 'Tajny Cel', x: 5, y: 0, z: 0, distanceLY: 5.0, spectralType: 'M', explored: false };
  SYS.push(fog, dst);
  EntityManager.add({ id: 'star_fog', type: 'star', name: 'Sekret', systemId: 'sys_fog' });
  EntityManager.add({ id: 'star_dst', type: 'star', name: 'Tajny Cel', systemId: 'sys_dst' });
  const add = (v) => { VMAP.set(v.id, v); return v; };
  add(ship('fs', 'Zwiadowca', 'sys_fog', { warpFuel: WARP }));
  add(ship('tj', 'Skoczek', null, { warpFuel: WARP, position: { state: 'orbiting', dockedAt: null, x: 0, y: 0 },
    mission: { type: 'interstellar_jump', phase: 'warp_transit', toSystemId: 'sys_dst' } }));
  // Członek floty w układzie bez nazwy — dopisek.
  const fl = { id: 'f9', name: 'Mieszana', memberIds: ['w1', 'fm'] };
  add(ship('fm', 'Daleki', 'sys_fog', { warpFuel: WARP, fleetId: 'f9' }));
  VMAP.get('w1').fleetId = 'f9';
  FLEETS.push(fl);
  GM.isActive = true; GM.selectedSystemId = null;
  const ro = newRO();
  call(() => ro.toggleExpanded('sys_fog', 'sys_home'));
  const calls = drawRO(ro), names = calls.map((c) => c.s);
  const tree = ro?._layout?.result;
  const sec = (id) => tree?.systems?.find?.((s) => s.systemId === id);
  ok(sec('sys_fog')?.name === '???' && sec('sys_fog')?.dim === true && sec('sys_fog')?.count === 1, 'S10a SEDNO: sekcja ze statkiem w układzie bez nazwy — „???”, `dim`');
  const fogRows = calls.filter((c) => c.s === '???');
  ok(fogRows.length >= 2 && fogRows.every((c) => c.fillStyle === THEME.textDim), 'S10b nagłówki rysowane `textDim`');
  ok(!names.some((s) => s.includes('Sekret') || s.includes('Tajny')), 'S10c prawdziwej nazwy nie ma w rysunku — także w dopisku członka floty');
  ok(sec('sys_dst')?.count === 0 && sec('sys_dst')?.inbound === 1 && sec('sys_dst')?.name === '???' && sec('sys_dst')?.groups?.length === 0,
    'S10d SEDNO: cel skoku — sekcja bez statku na miejscu, licznik w drodze');
  ok(names.includes('0 →1'), 'S10e licznik sekcji: „0 →1”');
  ok(sec('sys_home')?.dim === false && sec('sys_home')?.name === 'Dom' && sec('sys_far')?.name === 'Kochab' && sec('sys_far')?.dim === false,
    'S10f KONTROLA: układy z nazwą — nazwa, bez przygaszenia');
  const zf = zone(ro, 'vessel', 'fs');
  if (zf) call(() => ro.updateHover(zf.x + 60, zf.y + 4, W, H));
  const tip = (ro?._tip?.lines ?? []).map((l) => l.text).join(' | ');
  ok(!!zf && tip.includes('???') && !tip.includes('Sekret') && !tip.includes('Ziemia'), `S10g podpowiedź statku: układ „???”, bez nazwy gwiazdy i ciała („${tip}”)`);

  // Sprzątanie: reszta keepera liczy statki i floty.
  for (const id of ['fs', 'tj', 'fm']) VMAP.delete(id);
  VMAP.get('w1').fleetId = null;
  FLEETS.pop();
  SYS.splice(SYS.indexOf(fog), 1); SYS.splice(SYS.indexOf(dst), 1);
}

// ═══ S11 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('S11 CTRL+klik i klik nagłówka sekcji');
{
  const log = [];
  const um = K.uiManager;
  um.toggleSelection = (id) => { log.push(['toggle', id]); sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]; };
  K.starSystemManager.switchActiveSystem = (id) => { log.push(['switch', id]); return true; };
  GM.select = (id) => { log.push(['select', id]); GM.selectedSystemId = id; };
  GM.enterSystem = (id) => { log.push(['enter', id]); return true; };
  GM.isActive = true; GM.selectedSystemId = null; sel = []; fleetSel = null;
  const ro = newRO();
  drawRO(ro);
  const click = (z, ctrl = false, dx = 60) => { ro._lastMouseMods = { shift: false, ctrl }; return call(() => ro.hitTest(z.x + dx, z.y + 4, W, H)); };
  const zw = zone(ro, 'vessel', 'w1'), zr = zone(ro, 'vessel', 'r1');
  click(zw, true); click(zr, true);
  ok(!!zw && !!zr && sel.join(',') === 'w1,r1' && log.every((e) => e[0] === 'toggle'), `S11a SEDNO: CTRL+klik dwóch wierszy — oba w zbiorze (${sel.join(',')})`);
  click(zw, true);
  ok(sel.join(',') === 'r1', 'S11b CTRL+klik zaznaczonego — wypada ze zbioru');
  sel = []; log.length = 0;
  click(zw, false);
  ok(sel.join(',') === 'w1' && !log.some((e) => e[0] === 'toggle'), 'S11c KONTROLA: zwykły klik — pojedyncze zaznaczenie, bez przełączania zbioru');
  sel = []; log.length = 0;

  const zs = zone(ro, 'system', 'sys_far');
  click(zs);
  ok(JSON.stringify(log) === '[["select","sys_far"]]' && ro.isExpanded('sys_far', 'sys_home') === true,
    'S11d SEDNO: klik nazwy sekcji w trybie galaktyki — gwiazda + rozwinięcie, bez przełączenia układu (dawniej wyrzucało z trybu)');
  drawRO(ro); log.length = 0;
  click(zone(ro, 'system', 'sys_far'));
  ok(JSON.stringify(log) === '[["enter","sys_far"]]', 'S11e 2. klik — wejście przez kontroler (bramka G1), nie `switchActiveSystem`');
  log.length = 0; GM.selectedSystemId = null;
  drawRO(ro);
  const exp0 = ro.isExpanded('sys_far', 'sys_home');
  click(zone(ro, 'system', 'sys_far'), false, 4);
  ok(ro.isExpanded('sys_far', 'sys_home') !== exp0 && log.length === 0, 'S11f strzałka — samo rozwinięcie, bez zaznaczenia i wejścia');

  log.length = 0;
  GM.isActive = false;
  const roSys = newRO(); drawRO(roSys);
  roSys._lastMouseMods = { shift: false, ctrl: false };
  const zy = zone(roSys, 'system', 'sys_far');
  call(() => roSys.hitTest(zy.x + 60, zy.y + 4, W, H));
  ok(JSON.stringify(log) === '[["switch","sys_far"]]', 'S11h KONTROLA: tryb układu — klik sekcji przełącza układ (reguła D-UI-5 bez zmian)');
  GM.isActive = true;

  // CTRL+klik kolejnego statku w trybie galaktyki nie przewija listy do lidera (następny klik trafiłby w inny wiersz).
  const roR = newRO();
  roR._revealKey = null;
  EventBus.emit('ui:selectionChanged', { vesselId: 'w1', vesselIds: ['w1', 'r1'], prevVesselId: 'w1' });
  const multiKey = roR._revealKey;
  EventBus.emit('ui:selectionChanged', { vesselId: 'w1', vesselIds: ['w1'], prevVesselId: null });
  const singleKey = roR._revealKey;
  roR._revealKey = null; GM.isActive = false;
  EventBus.emit('ui:selectionChanged', { vesselId: 'w1', vesselIds: ['w1', 'r1'], prevVesselId: 'w1' });
  ok(multiKey == null && singleKey === 'vessel:w1' && roR._revealKey === 'vessel:w1',
    'S11i zbiór ≥ 2 w trybie galaktyki — bez przewijania do lidera; KONTROLA: pojedynczy i tryb układu — jak dotąd (§7.12)');
  GM.isActive = true;

  // Nagłówek sekcji układu bez wejścia: 2. klik nic nie zrobi, więc podpowiedź mówi dlaczego.
  const roT = newRO(); drawRO(roT);
  const zt = zone(roT, 'system', 'sys_far');
  GM.canEnter = () => false;
  call(() => roT.updateHover(zt.x + 60, zt.y + 4, W, H));
  const tipNo = roT._tip?.text;
  GM.canEnter = () => true;
  call(() => roT.updateHover(zt.x + 60, zt.y + 4, W, H));
  const tipYes = roT._tip;
  ok(tipNo === t('leftOutliner.cannotEnter') && tipYes == null, 'S11j układ bez wejścia — podpowiedź z powodem; KONTROLA: z wejściem — bez niej');
  GM.canEnter = () => false;
  GM.isActive = false;
  call(() => roT.updateHover(zt.x + 60, zt.y + 4, W, H));
  const tipSys = roT._tip;
  GM.isActive = true;
  ok(tipSys == null, 'S11k KONTROLA: tryb układu — bez tej podpowiedzi (klik sekcji przełącza tam układ)');
  delete GM.canEnter;
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
