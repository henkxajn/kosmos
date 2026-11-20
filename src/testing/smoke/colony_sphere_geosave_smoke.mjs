// ARC COLONY SPHERE CS-5b — keeper zapisu siatek geo, podpięcia tworzenia kolonii i AI na kuli. Plan §3.14.
//
//   S1 zapis RZADKI GeodesicGrid: round-trip dokładny (stany pól: budynki, budowa, właściciele mieszani, mgła mieszana,
//      anomalie, teren spoza listy kodów), rozmiar ≪ pełnej listy pól
//   S2 stary zapis (fixture GATE-S4-fresh-gy60, PRAWDZIWY ColonyManager.restore): 22 siatki płaskie (HexGrid), zapis bez
//      `kind`, ponowny zapis bajt w bajt = zapis z fixture
//   S3 świat geo (GameCore, FEATURES.colonySphere ON): kolonie gracza i AI na kuli; ColonyManager.serialize → JSON →
//      restore → te same siatki (GeodesicGrid, `kind: 'geo'`)
//   S4 createColonyGrid: flaga OFF albo brak zgody środowiska → DOKŁADNIE PlanetMapGenerator.generate; ON + zgoda → geo
//   S5 SupplyCoverageSystem na kuli: jednostka na polu stolicy dostaje zaopatrzenie (odczyt mapy zasięgu przez id grafu)
//   S6 headless gra na kuli (osobne procesy, ten sam seed ×2): zero wyjątków / błędów, deterministyczny hash, desant
//      ląduje, walka się toczy
//   S7 piny źródła: miejsca nowych kolonii → createColonyGrid; gałąź odczytu geo przed HexGrid; Supply `_key` z grafu
//      ciała; VesselManager kotwica anyTile
//   S8 Finding 783 — klucz pola kuli = id grafu (`tile.key` = `g<i>`, także po odczycie zapisu; płaskie `"q,r"` bez
//      zmian) i stolice w grach geo (GameCore, 3 galaktyki, 10 lat): klucz `capital_` rozwiązuje się w grafie ciała na pole
//      ze stolicą, teren zabudowywalny i do stania; każdy klucz `_active` rozwiązywalny; syncTileBuildings zachowuje stolicę
//
// Importy nowych symboli przez namespace / dynamicznie — na bazie piny degradują do FAIL.

import '../headless/env.js'; // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { HexGrid } from '../../map/HexGrid.js';
import { PlanetMapGenerator } from '../../map/PlanetMapGenerator.js';
import * as TG from '../../map/TileGraph.js';
import EntityManager from '../../core/EntityManager.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const quiet = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };
const tryImport = async (p) => { try { return await import(p); } catch { return null; } };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const src = (rel) => { try { return readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1'); } catch { return ''; } };

const GRID = await tryImport('../../map/GeodesicGrid.js');
const GEN = await tryImport('../../map/GeoColonyGridGenerator.js');
const FAC = await tryImport('../../map/ColonyGridFactory.js');
const TERRAN = { id: 's1', name: 'S1', type: 'planet', planetType: 'rocky', bodyArchetype: 'terran', surfaceSeed: 0x1234567, waterCoverage: 0.55, physics: { mass: 1 }, composition: {}, lifeScore: 60 };
const ROID = { id: 's3', name: 'S3', type: 'planetoid', planetType: 'rocky', planetoidType: 'metallic', bodyArchetype: 'planetoid', surfaceSeed: 0x5555aaa, physics: { mass: 0.001 }, composition: { Fe: 30 } };

// ── S1 zapis rzadki ──────────────────────────────────────────────────────────
console.log('S1 sparse geo save round-trip');
if (GRID && GEN && typeof GRID.GeodesicGrid.restore === 'function') {
  for (const body of [TERRAN, ROID]) {
    const grid = GEN.generateGeoGrid(body, false);
    const g = TG.tileGraphOf(grid);
    const fresh = JSON.stringify(grid.serialize());
    // Stan gry: właściciel całego ciała + wyjątki, mgła mieszana, budynki, budowa, anomalia ujawniona, teren spoza kodów.
    for (const t of grid.tiles) t.owner = 'emp_x';
    const t5 = g.tile('g5'), t20 = g.tile('g20'), t40 = g.tile('g40'), t41 = g.tile('g41');
    t5.owner = null; t5.explored = true;
    Object.assign(t20, { buildingId: 'farm', buildingLevel: 3, capitalBase: true, syntheticSlot: { commodityId: 'automation_droid', tier: 1, count: 2 } });
    t40.underConstruction = { buildingId: 'mine', progress: 0.4, buildTime: 2 };
    Object.assign(t41, { anomaly: 'neutronium_vein', anomalyDetected: true, anomalyRevealed: true, anomalyEffect: { type: 'mining', miningBonus: 0.2 }, damaged: true, occupyEmpireId: 'player', occupyStart: 12.5, strategicResource: 'U' });
    g.tile('g7').type = 'lava_lake';   // teren spoza GEO_TERRAIN_CODES → rekord pola niesie `type`
    const data = grid.serialize();
    const json = JSON.stringify(data);
    const back = GRID.GeodesicGrid.restore(JSON.parse(json));
    const tilesEq = grid.tiles.every((t, i) => JSON.stringify(t.serialize()) === JSON.stringify(back.tiles[i].serialize()));
    const full = JSON.stringify(grid.tiles.map(t => t.serialize())).length;
    assert(data.kind === 'geo' && back instanceof GRID.GeodesicGrid && back.n === grid.n && back.gridClass === grid.gridClass
      && JSON.stringify(back.serialize()) === json && tilesEq && back.latCutoffs.polar === grid.latCutoffs.polar,
      `S1a ${body.bodyArchetype} n=${grid.n}: serialize → JSON → restore exact (every tile, n, class, band cutoffs)`);
    assert(json.length < full * 0.15 && fresh.length < full * 0.12 && data.tiles.length <= 12 && data.base.owner === 'emp_x' && data.base.explored === false
      && data.tiles.some(r => r.i === 7 && r.type === 'lava_lake') && data.terrain.length === grid.count,
      `S1b sparse: ${json.length} B with state / ${fresh.length} B fresh vs ${full} B as a full tile list; ${data.tiles.length} tile records; base owner/explored; unknown terrain kept`);
  }
} else for (const l of ['S1a', 'S1b']) assert(false, `${l} GeodesicGrid.restore`);

// ── S3 + S4 świat geo ────────────────────────────────────────────────────────
console.log('S3 geo world (GameCore, flag ON) + S4 createColonyGrid');
GAME_CONFIG.FEATURES.colonySphere = true;
const { GameCore } = await import('../headless/GameCore.js');
const core = new GameCore();
quiet(() => core.boot({ quiet: true, scenario: 'civilization' }));
const K = window.KOSMOS, cm = K.colonyManager;
const cols0 = cm.getAllColonies().filter(c => c.grid);
const geoCols = cols0.filter(c => c.grid.kind === 'geo');
const homeGeo = cm.getColony(K.homePlanet.id)?.grid?.kind === 'geo';
const aiGeo = geoCols.filter(c => c.ownerEmpireId).length;
let s3 = null;
quiet(() => {
  const before = cm.serialize();
  const json = JSON.stringify(before);
  cm.restore(JSON.parse(json));
  const after = cm.serialize();
  const map = (s) => new Map(s.colonies.map(c => [c.planetId, JSON.stringify(c.grid)]));
  const a = map(before), b = map(after);
  s3 = { n: a.size, same: [...a].every(([k, v]) => b.get(k) === v), kinds: cm.getAllColonies().filter(c => c.grid?.kind === 'geo' && GRID && c.grid instanceof GRID.GeodesicGrid).length };
});
GAME_CONFIG.FEATURES.colonySphere = false;
assert(homeGeo && aiGeo >= 1 && geoCols.length === cols0.length, `S3a flag ON headless: home colony geo ${homeGeo}, AI colonies geo ${aiGeo}, all ${geoCols.length}/${cols0.length} grids geo`);
assert(!!s3 && s3.same && geoCols.length >= 1 && s3.kinds === geoCols.length && s3.n >= geoCols.length, `S3b ColonyManager.serialize → JSON → restore: ${s3?.n} colonies, grids identical ${s3?.same}, restored as GeodesicGrid ${s3?.kinds}`);
if (FAC?.createColonyGrid) {
  const bodies = [...EntityManager.getByType('planet'), ...EntityManager.getByType('moon'), ...EntityManager.getByType('planetoid')].slice(0, 40);
  const same = (b, opts) => JSON.stringify(FAC.createColonyGrid(b, false, opts).serialize()) === JSON.stringify(PlanetMapGenerator.generate(b, false).serialize());
  const off = bodies.filter(b => same(b, { flag: false, allowed: true })).length;
  const live = bodies.filter(b => same(b, { flag: true, allowed: false })).length;
  const on = bodies.map(b => FAC.createColonyGrid(b, false, { flag: true, allowed: true }));
  const geoN = on.filter(g => g.kind === 'geo').length;
  const flatOk = bodies.every((b, i) => on[i].kind === 'geo' || (!GEN.geoGridSpecFor(b) && same(b, { flag: true, allowed: true })));
  assert(bodies.length >= 20 && off === bodies.length && live === bodies.length,
    `S4a flag OFF (${off}/${bodies.length}) and live game (${live}/${bodies.length}) → createColonyGrid = PlanetMapGenerator.generate byte for byte`);
  assert(geoN > 0 && flatOk, `S4b flag ON + allowed → geo for eligible bodies (${geoN}/${bodies.length}), the rest exactly the flat generator (gas)`);
} else for (const l of ['S4a', 'S4b']) assert(false, `${l} createColonyGrid`);

// ── S2 stary zapis ───────────────────────────────────────────────────────────
console.log('S2 legacy save (fixture) loads flat');
{
  const FX = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/GATE-S4-fresh-gy60.save.json.gz', import.meta.url))).toString());
  const want = new Set(FX.civ4x.colonies.map(c => c.planetId));
  for (const b of [...FX.planets, ...FX.moons, ...FX.planetoids]) if (want.has(b.id)) { if (EntityManager.get(b.id)) EntityManager.remove(b.id); EntityManager.add({ ...b }); }
  let err = null;
  quiet(() => { try { cm.restore({ colonies: FX.civ4x.colonies }); } catch (e) { err = e; } });
  const withGrid = FX.civ4x.colonies.filter(c => c.grid);
  const loaded = withGrid.map(c => [c, cm.getColony(c.planetId)]);
  const flat = loaded.filter(([, col]) => col?.grid instanceof HexGrid && col.grid.kind === undefined).length;
  const exact = loaded.filter(([c, col]) => JSON.stringify(col?.grid?.serialize()) === JSON.stringify(c.grid)).length;
  const noKind = withGrid.every(c => !('kind' in c.grid));
  assert(!err && withGrid.length === 22 && flat === 22 && noKind, `S2a fixture without grid.kind: ${flat}/22 grids restored as flat HexGrid (restore ${err ? 'ERROR ' + err.message : 'OK'})`);
  assert(exact === 22, `S2b re-serialised flat grids = fixture bytes (${exact}/22; a flat grid writes no kind)`);
}

// ── S5 zaopatrzenie na kuli ──────────────────────────────────────────────────
console.log('S5 SupplyCoverageSystem reads the coverage map through the body graph');
{
  const { SupplyCoverageSystem } = await import('../../systems/SupplyCoverageSystem.js');
  const run = (grid) => {
    const g = TG.tileGraphOf(grid);
    const cap = g.tiles().find(t => t.type !== 'ocean') ?? g.anyTile();
    cap.capitalBase = true;
    const u = { id: 'u1', planetId: 'P5', owner: 'player', q: cap.q, r: cap.r, supply: 10, supplyCap: 100, isSupplier: false, hp: 10, maxHp: 10 };
    const colony = { planetId: 'P5', grid, ownerEmpireId: null, buildingSystem: { _active: new Map() },
      resourceSystem: { getAmount: () => 500, spend: () => true } };
    const sys = new SupplyCoverageSystem({ getColony: () => colony, getAllColonies: () => [colony] }, { getAllUnits: () => [u], getUnitsOnPlanet: () => [u] });
    quiet(() => sys.update(1));
    sys.destroy?.(); sys.dispose?.();
    return u.supply;
  };
  const flatS = run(PlanetMapGenerator.generate({ ...TERRAN, id: 'p5flat' }, true));
  const geoS = GEN ? run(GEN.generateGeoGrid(TERRAN, true)) : 10;
  assert(flatS > 10 && geoS === flatS, `S5 unit on the capital tile refilled: flat ${flatS}, geo ${geoS} (before the fix geo stayed at 10 — key "q,r" vs graph id)`);
}

// ── S6 headless gra na kuli ──────────────────────────────────────────────────
console.log('S6 headless game on geo grids (two processes, same seed)');
{
  const runOnce = () => { try { return JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'src/testing/headless/probe-cs5b-geo-run.mjs'), '--geo', '--years', '15', '--yearsB', '8'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }).replace(/^[^{]*/, '')); } catch (e) { return { crash: String(e?.message ?? e).slice(0, 300) }; } };
  const a = runOnce(), b = runOnce();
  console.log(`    run: ${JSON.stringify({ colonies: a.colonies, kinds: a.gridKinds, buildings: a.buildings, invasion: a.scripted?.invasion, events: a.events, hash: a.stateHash, crash: a.crash, errors: a.consoleErrors })}`);
  assert(!a.crash && !b.crash && a.consoleErrors === 0 && b.consoleErrors === 0, `S6a no exception, no console error (crash ${a.crash ?? b.crash ?? 'none'})`);
  assert(a.gridKinds?.geo >= 2 && a.gridKinds?.flat === 0 && a.roundTrip?.bad === 0 && a.scripted?.invasion > 0 && (a.events?.['combat:round'] ?? 0) > 0,
    `S6b geo colonies ${a.gridKinds?.geo} (flat ${a.gridKinds?.flat}), save round-trip bad ${a.roundTrip?.bad}, invasion landed ${a.scripted?.invasion}, combat rounds ${a.events?.['combat:round']}`);
  assert(!!a.stateHash && a.stateHash === b.stateHash, `S6c deterministic: ${a.stateHash} = ${b.stateHash}`);
}

// ── S7 piny źródła ───────────────────────────────────────────────────────────
console.log('S7 source pins');
{
  const cmS = src('src/systems/ColonyManager.js'), boS = src('src/systems/EmpireColonyBootstrap.js'), miS = src('src/systems/MissionSystem.js'), gcS = src('src/testing/headless/GameCore.js');
  const cnt = (s, re) => (s.match(re) ?? []).length;
  const calls = { cm: cnt(cmS, /createColonyGrid\(/g), bo: cnt(boS, /createColonyGrid\(/g), mi: cnt(miS, /createColonyGrid\(/g), gc: cnt(gcS, /createColonyGrid\(/g) };
  const left = { cm: cnt(cmS, /PlanetMapGenerator\.generate\(/g), bo: cnt(boS, /PlanetMapGenerator\.generate\(/g), mi: cnt(miS, /PlanetMapGenerator\.generate\(/g), gc: cnt(gcS, /PlanetMapGenerator\.generate\(/g) };
  assert(calls.cm === 2 && calls.bo === 2 && calls.mi === 1 && calls.gc === 1 && left.cm === 0 && left.bo === 0 && left.mi === 0 && left.gc === 0,
    `S7a new-colony sites use createColonyGrid (ColonyManager ${calls.cm}/2, Bootstrap ${calls.bo}/2, Mission ${calls.mi}/1, GameCore ${calls.gc}/1; generator calls left ${JSON.stringify(left)})`);
  const gi = cmS.indexOf("colData.grid.kind === 'geo'"), hi = cmS.indexOf('HexGrid.restore(colData.grid)');
  assert(gi > 0 && hi > gi && /GeodesicGrid\.restore\(colData\.grid\)/.test(cmS), 'S7b ColonyManager.restore: geo branch (kind === geo) before the HexGrid branch; kind-less grids stay HexGrid');
  const sup = src('src/systems/SupplyCoverageSystem.js');
  assert(cnt(sup, /this\._key\(u, colony\)/g) === 2 && /_key\(u, colony\) \{ return \(tileGraphOf\(colony\?\.grid\) \?\? DETACHED_FLAT_GRAPH\)\.idOf/.test(sup), 'S7c Supply coverage key from the body graph (2 readers)');
  const vm = src('src/systems/VesselManager.js');
  assert(/tileGraphOf\(colony\?\.grid\)\?\.anyTile\(\)/.test(vm) && !/unit\.q \?\? 0, unit\.r \?\? 0/.test(vm), 'S7d VesselManager disembark fallback = body graph anyTile (flat: (0,0))');
}

// ── S8 klucz pola kuli + stolice w grach geo (Finding 783) ──────────────────
console.log('S8 geo tile key = graph id; capitals in geo games resolve to buildable land');
if (GRID && GEN) {
  const grid = GEN.generateGeoGrid(TERRAN, true);
  const g = TG.tileGraphOf(grid);
  const back = GRID.GeodesicGrid.restore(JSON.parse(JSON.stringify(grid.serialize())));
  const gb = TG.tileGraphOf(back);
  const okFresh = grid.tiles.length > 0 && grid.tiles.every(t => t.key === g.idOf(t) && g.tile(t.key) === t);
  const okBack = back.tiles.length === grid.tiles.length && back.tiles.every(t => t.key === gb.idOf(t) && gb.tile(t.key) === t);
  const flatG = PlanetMapGenerator.generate({ ...TERRAN, id: 's8flat' }, true), fg = TG.tileGraphOf(flatG);
  const okFlat = fg.tiles().length > 0 && fg.tiles().every(t => t.key === `${t.q},${t.r}` && t.key === fg.idOf(t));
  assert(okFresh && okBack && okFlat, `S8a tile.key = graph id: geo fresh ${okFresh} (${grid.tiles[0]?.key}), geo restored ${okBack}, flat "q,r" unchanged ${okFlat}`);
} else assert(false, 'S8a GeodesicGrid / generator');
{
  const { TERRAIN_TYPES } = await import('../../map/HexTile.js');
  const { isStandableTile } = await import('../../data/GroundUnitData.js');
  const { syncTileBuildings } = await import('../../utils/ColonyGrid.js');
  const { Ticker } = await import('../headless/Ticker.js');
  const stats = { caps: 0, geoCols: 0, badCap: [], orphan: [], syncLost: 0 };
  GAME_CONFIG.FEATURES.colonySphere = true;
  for (const galaxySeed of [undefined, 222, 44444]) {
    const c8 = new GameCore();
    quiet(() => c8.boot({ quiet: true, scenario: 'civilization', ...(galaxySeed != null ? { galaxySeed } : {}) }));
    quiet(() => new Ticker(c8.timeSystem).run(10, { tickSize: 1.0 }));
    for (const col of window.KOSMOS.colonyManager.getAllColonies()) {
      if (col.grid?.kind !== 'geo') continue;
      stats.geoCols++;
      const g = TG.tileGraphOf(col.grid), bs = col.buildingSystem;
      for (const k of bs?._active?.keys() ?? []) {
        const pk = TG.parseTileKey(k), t = g.tile(pk.id);
        if (!t) { stats.orphan.push(`${col.planetId}:${k}`); continue; }
        if (pk.prefix !== TG.CAPITAL_PREFIX) continue;
        stats.caps++;
        if (!t.capitalBase || TERRAIN_TYPES[t.type]?.buildable !== true || !isStandableTile(t)) stats.badCap.push(`${col.planetId}:${k}:${t.type}`);
      }
      const capTile = g.tiles().find(t => t.capitalBase);
      quiet(() => syncTileBuildings(col.grid, bs));
      if (capTile && !capTile.capitalBase) stats.syncLost++;
    }
  }
  GAME_CONFIG.FEATURES.colonySphere = false;
  assert(stats.geoCols >= 9 && stats.caps >= stats.geoCols && stats.badCap.length === 0,
    `S8b ${stats.caps} capitals on ${stats.geoCols} geo colonies (3 galaxies): key resolves to the capital tile on buildable, standable land (bad ${JSON.stringify(stats.badCap.slice(0, 3))})`);
  assert(stats.geoCols >= 9 && stats.orphan.length === 0 && stats.syncLost === 0,
    `S8c every _active key resolves in the body graph (orphans ${stats.orphan.length} ${JSON.stringify(stats.orphan.slice(0, 3))}); syncTileBuildings keeps the capital (lost ${stats.syncLost})`);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
