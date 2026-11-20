// probe-cs8c-f790 — pomiar Finding 790 (CS-8c, plan §3.17): `planet:buildRequest` z polem WŁASNEJ, ale nieaktywnej kolonii trafia do
// BuildingSystem kolonii AKTYWNEJ. Wynik 2026-11-20 (flaga ON i OFF): odmowa z powodem `ui.tileNotOwned`, żadna kolejka się nie zmienia.
//   node src/testing/headless/probe-cs8c-f790.mjs
import './env.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import * as TG from '../../map/TileGraph.js';
const quiet = (fn) => { const l = console.log, w = console.warn, e = console.error; console.log = console.warn = console.error = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; console.error = e; } };
const { GameCore } = await import('./GameCore.js');
const { default: EventBus } = await import('../../core/EventBus.js');
const { BUILDINGS } = await import('../../data/BuildingsData.js');
const { evaluatePlacement } = await import('../../map/HexTile.js');
for (const flag of [true, false]) {
  GAME_CONFIG.FEATURES.colonySphere = flag;
  const core = new GameCore();
  quiet(() => core.boot({ quiet: true, scenario: 'civilization', galaxySeed: 20261120 }));
  const K = window.KOSMOS, cm = K.colonyManager, home = cm.getColony(K.homePlanet.id);
  const EM = K.entityManager;
  const bodies = [...(EM?.getByType?.('planet') ?? []), ...(EM?.getByType?.('moon') ?? [])];
  const body = bodies.find((b) => b.id !== K.homePlanet.id && (b.systemId ?? 'sys_home') === (K.homePlanet.systemId ?? 'sys_home') && b.planetType !== 'gas' && !cm.getColony(b.id));
  quiet(() => EventBus.emit('expedition:colonyFounded', { planetId: body.id, startResources: { Fe: 5000, Si: 5000, C: 5000, Cu: 5000 }, startPop: 4, autoSpaceport: true }));
  const B = cm.getColony(body.id);
  quiet(() => cm.switchActiveColony?.(home.planetId));
  const active = cm.activePlanetId;
  const bGrid = B.grid ?? B.buildingSystem._grid;
  if (!bGrid) { console.log(JSON.stringify({ flag, note: 'B has no grid (flat colony grid is made by the window)', bKind: null })); continue; }
  const graph = TG.tileGraphOf(bGrid);
  const b = BUILDINGS.solar_farm;
  const tile = graph.tiles().find((t) => !t.capitalBase && !t.buildingId && !t.underConstruction && !t.pendingBuild && evaluatePlacement(t, b, { techSystem: K.techSystem, planet: B.planet }).ok);
  const key = graph.idOf ? graph.idOf(tile) : tile.key;
  const snap = (c) => ({ constr: [...c.buildingSystem._constructionQueue.keys()].length, pending: [...c.buildingSystem._pendingQueue.keys()].length, active: c.buildingSystem._active.size });
  const before = { home: snap(home), B: snap(B) };
  const res = []; EventBus.on('planet:buildResult', (e) => res.push({ success: e.success, reason: e.reason ?? null }));
  quiet(() => EventBus.emit('planet:buildRequest', { tile, buildingId: b.id }));
  const after = { home: snap(home), B: snap(B) };
  console.log(JSON.stringify({ flag, bKind: bGrid.kind ?? 'flat', activeIsHome: active === home.planetId, key, tileOwner: tile.owner ?? null,
    before, after, homeHasKey: home.buildingSystem._constructionQueue.has(key) || home.buildingSystem._pendingQueue.has(key) || home.buildingSystem._active.has(key),
    bHasKey: B.buildingSystem._constructionQueue.has(key) || B.buildingSystem._pendingQueue.has(key) || B.buildingSystem._active.has(key), buildResults: res }));
}
process.exit(0);
