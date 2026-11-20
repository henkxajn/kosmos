// ARC COLONY SPHERE CS-7 część B — keeper grywalnych kolonii na kuli w dzisiejszym oknie kolonii (ColonySphereView +
// ColonyTilePosLogic + reguły siatki nowej kolonii + naprawione miejsca UI). Plan §3.15.
//
//   P1  pozycje pól przez TileGraph (ColonyTilePosLogic): płaska = dotychczasowe napisy i współrzędne co do znaku, kula =
//       numer pola, pole wyładunku i cel ruchu z grafu ciała
//   P2  reguły siatki: geo nigdy nie jest odtwarzana (`shouldReuseColonyGrid`), płaska tabela prawdy bez zmian; pole pod
//       stolicę na kuli (budowalne, przy równiku, nie pięciokąt), budynki startowe przy stolicy; werdykt trybu budowy =
//       `evaluatePlacement`
//   P3  widok WYKONANIEM (prawdziwy renderer na three r171, atrapa GL): stan pól wysyłany tylko przy zmianie, tryb
//       budowy / blokada obrotu / soczewka / zaopatrzenie, picking → pole siatki, pozycja pola dla panelu, adapter siatki
//       dla dzisiejszego rysowania jednostek, dwuklik, klawisze, tempo klatek na żądanie, mała kula, znaczniki budynków
//   P4  gra headless na kuli (GameCore, flaga ON): budowa / odmowa / rozbiórka / ruch jednostki TYMI SAMYMI drogami co na
//       siatce płaskiej (`planet:buildRequest`, `planet:demolishRequest`, `moveUnit`); kontrola: te same kroki na płaskiej
//   P5  piny źródła naprawionych miejsc UI i rozgałęzień okna kolonii (ścieżka płaska nietknięta), flaga default OFF
//   P6  mapa bohatera stolicy w tle: bez flagi nic, z flagą zamówienie z priorytetem bezczynnym
//
// Importy nowych modułów dynamiczne — na bazie (przed CS-7) piny degradują do FAIL, nie przerywają.

import '../headless/env.js'; // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import * as TG from '../../map/TileGraph.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const tryImport = async (p) => { try { return await import(p); } catch (e) { return null; } };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const src = (rel) => { try { return readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const quiet = (fn) => { const l = console.log, w = console.warn, e = console.error; console.log = console.warn = console.error = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; console.error = e; } };

const POS = (await tryImport('../../ui/ColonyTilePosLogic.js')) ?? {};
const VIEW = (await tryImport('../../ui/ColonySphereView.js')) ?? {};
const OL = (await tryImport('../../ui/ColonySphereOverlayLogic.js')) ?? {};
const RES = await import('../../ui/ColonyGridResolveLogic.js');
const { generateGeoGrid } = await import('../../map/GeoColonyGridGenerator.js');
const { geodesicTopology } = await import('../../map/GeodesicTopology.js');
const { PlanetMapGenerator } = await import('../../map/PlanetMapGenerator.js');
const { TERRAIN_TYPES, evaluatePlacement } = await import('../../map/HexTile.js');
const { BUILDINGS } = await import('../../data/BuildingsData.js');
const { UNIT_ARCHETYPES } = await import('../../data/unitArchetypes.js');
const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);
const RMOD = await tryImport('../../renderer/ColonySphereRenderer.js');

const terranBody = (extra = {}) => ({ id: 'p_terran', type: 'planet', bodyArchetype: 'terran', surfaceSeed: 0xC57B, systemId: 'sys_home', atmosphere: 'breathable',
  waterCoverage: 0.6, temperatureC: 15, surface: { hasWater: true }, name: 'Terra', deposits: [], ...extra });

// ── P1 pozycje pól ────────────────────────────────────────────────────────────────────
console.log('\nP1 tile positions through TileGraph');
if (!POS.tilePosLabel) { for (const n of ['P1a', 'P1b', 'P1c', 'P1d']) assert(false, `${n} ColonyTilePosLogic missing`); } else {
  const flatGrid = PlanetMapGenerator.generate({ id: 'pf', type: 'planet', planetType: 'rocky', name: 'F', mass: 1, temperatureC: 10, atmosphere: 'thin' }, false);
  const flatGraph = TG.tileGraphOf(flatGrid);
  const geoGrid = generateGeoGrid(terranBody(), true), geoGraph = TG.tileGraphOf(geoGrid);
  const q = 3, r = 5;
  assert(POS.tilePosLabel({ q, r }) === `${q},${r}` && POS.tilePosLabel({ q, r }, ', ') === `${q}, ${r}` && POS.tilePosLabel({ q: -2, r: 0 }) === '-2,0',
    'P1a flat label = today\'s text exactly („q,r" and „q, r")');
  assert(POS.tilePosLabel({ q: 137, r: TG.GEO_TILE_R }) === '#137' && POS.tilePosLabel({ q: 137, r: TG.GEO_TILE_R }, ', ') === '#137' && POS.isGeoPos({ q: 1, r: -1 }) && !POS.isGeoPos({ q: 1, r: 0 }),
    'P1b sphere label = tile number (#n), not the interim coordinate (n, −1)');
  const anyFlat = flatGraph.anyTile();
  const u1 = POS.unloadPosFor({ q: 4, r: 2 }, flatGraph), u2 = POS.unloadPosFor({}, flatGraph), u3 = POS.unloadPosFor({ q: 99, r: 77 }, flatGraph), u4 = POS.unloadPosFor({ q: 4, r: 2 }, null);
  assert(u1.q === 4 && u1.r === 2 && u2.q === 0 && u2.r === 0 && u3.q === 99 && u3.r === 77 && u4.q === 4 && u4.r === 2 && !!anyFlat,
    'P1c unload position on a flat grid = today\'s `unit.q ?? 0, unit.r ?? 0` (no validation added)');
  const g1 = POS.unloadPosFor({ q: 40, r: TG.GEO_TILE_R }, geoGraph), g2 = POS.unloadPosFor({ q: 4, r: 2 }, geoGraph), g3 = POS.unloadPosFor({}, geoGraph), g4 = POS.unloadPosFor({ q: 9999, r: TG.GEO_TILE_R }, geoGraph);
  const onGeo = (p) => p.r === TG.GEO_TILE_R && !!geoGraph.tile(p);
  assert(g1.q === 40 && onGeo(g1) && onGeo(g2) && onGeo(g3) && onGeo(g4) && g2.q === geoGraph.anyTile().q,
    'P1d unload position on a sphere: the unit\'s own tile when it belongs to this grid, otherwise a tile of the body graph — never the flat (0, 0)');
  const ft = flatGraph.tiles()[7], gt = geoGrid.tiles[55];
  const m1 = POS.moveTargetFor(flatGraph, ft), m2 = POS.moveTargetFor(geoGraph, gt), m3 = POS.moveTargetFor(geoGraph, { q: 9999, r: TG.GEO_TILE_R }), m4 = POS.moveTargetFor(geoGraph, null);
  assert(m1.q === ft.q && m1.r === ft.r && m2.q === 55 && m2.r === TG.GEO_TILE_R && m3 === null && m4 === null,
    'P1e move target: flat = the clicked tile\'s (q, r); sphere = the tile resolved by the graph id (unknown tile → no order)');
}

// ── P2 reguły siatki i pola ───────────────────────────────────────────────────────────────
console.log('\nP2 grid rules');
{
  const geo = { kind: 'geo' }, flat = {};
  const tt = (c, h) => RES.shouldReuseColonyGrid(c, h);
  assert(tt({ grid: flat }, false) === false && tt({ grid: flat, _gridFromSave: true }, false) === true && tt({ grid: flat, _gridEnsured: true }, false) === true
    && tt({ grid: flat }, true) === true && tt({}, true) === false && tt(null, false) === false,
  'P2a shouldReuseColonyGrid: flat truth table unchanged');
  assert(tt({ grid: geo }, false) === true && tt({ grid: geo, _gridFromSave: true }, false) === true, 'P2b a geo grid is always reused — never regenerated into a flat map');
}
if (!VIEW.bestGeoCapitalTile) { for (const n of ['P2c', 'P2d', 'P2e', 'P2f']) assert(false, `${n} ColonySphereView missing`); } else {
  let capBad = 0, capN = 0, pent = 0, nearBad = 0;
  for (let s = 0; s < 12; s++) {
    const grid = generateGeoGrid(terranBody({ surfaceSeed: 0xC57B + s * 7919, waterCoverage: 0.45 + (s % 5) * 0.08 }), true);
    const topo = geodesicTopology(grid.n);
    const cap = VIEW.bestGeoCapitalTile(grid);
    capN++;
    if (!cap || !TERRAIN_TYPES[cap.type]?.buildable || cap.type === 'ocean' || cap.type === 'ice_sheet' || Math.abs(topo.cy[cap.q]) > 0.5) capBad++;
    if (cap && topo.isPentagon(cap.q)) pent++;
    const order = VIEW.ColonySphereView.tilesNearCapital(grid);
    if (order.length !== grid.tiles.length || order[0] !== cap || new Set(order).size !== order.length) nearBad++;
    for (let i = 1; i < order.length; i++) if (topo.distance(cap.q, order[i].q) < topo.distance(cap.q, order[i - 1].q)) { nearBad++; break; }
  }
  assert(capN === 12 && capBad === 0 && pent === 0, `P2c capital tile on a sphere: buildable land near the equator, not a pentagon (12 terran worlds, ${capBad} bad, ${pent} pentagons)`);
  assert(nearBad === 0, 'P2d starter-building order on a sphere: every tile once, capital first, by graph distance from the capital');
  const grid = generateGeoGrid(terranBody(), true);
  const planet = terranBody();
  const land = grid.tiles.find(t => t.type === 'plains'), sea = grid.tiles.find(t => t.type === 'ocean');
  const farm = BUILDINGS.farm, mine = BUILDINGS.mine;
  let agree = 0, total = 0;
  for (const t of grid.tiles) { for (const b of [farm, mine, BUILDINGS.solar_farm]) { total++; if ((VIEW.buildVerdictFor(t, b, { planet }) === 'ok') === evaluatePlacement(t, b, { planet }).ok) agree++; } }
  const occ = { ...land, buildingId: 'mine' }, uc = { ...land, underConstruction: { buildingId: 'farm' } }, capT = { ...land, capitalBase: true, buildingId: null };
  Object.setPrototypeOf(occ, Object.getPrototypeOf(land)); Object.setPrototypeOf(uc, Object.getPrototypeOf(land)); Object.setPrototypeOf(capT, Object.getPrototypeOf(land));
  assert(!!land && !!sea && agree === total && total > 400 && VIEW.buildVerdictFor(sea, farm, { planet }) === 'blocked' && VIEW.buildVerdictFor(sea, null, { planet }) === 'blocked'
    && VIEW.buildVerdictFor(land, null, { planet }) === 'ok',
  `P2e build-mode verdict = evaluatePlacement for every tile × 3 buildings (${agree}/${total}); no building picked → buildable terrain`);
  assert(VIEW.buildVerdictFor(occ, farm, { planet }) === 'occupied' && VIEW.buildVerdictFor(uc, farm, { planet }) === 'occupied' && VIEW.buildVerdictFor(capT, farm, { planet }) === 'ok',
    'P2f occupied = building / construction site; the capital tile stays free (virtual capital, as on the flat map)');
  const dressed = generateGeoGrid(terranBody(), true);
  const f0 = VIEW.focusTileOf(dressed, geodesicTopology(dressed.n));
  dressed.tiles[33].buildingId = 'mine'; const f1 = VIEW.focusTileOf(dressed, geodesicTopology(dressed.n));
  dressed.tiles[71].capitalBase = true; const f2 = VIEW.focusTileOf(dressed, geodesicTopology(dressed.n));
  assert(TERRAIN_TYPES[dressed.tiles[f0].type]?.buildable && f1 === 33 && f2 === 71 && VIEW.isSphereGrid(dressed) && !VIEW.isSphereGrid({}) && !VIEW.isSphereGrid(null),
    'P2g initial view: capital → first building → buildable tile near the equator; only a geo grid is a sphere');
}

// ── P3 widok wykonaniem ───────────────────────────────────────────────────────────────────
console.log('\nP3 view by execution');
function fakeCanvas() { const ls = {}; return { width: 2, height: 2, addEventListener: (k, f) => { ls[k] = f; }, removeEventListener: (k) => { delete ls[k]; } }; }
function fakeCtx() {
  const calls = { drawImage: 0, fillText: 0, fillRect: 0 };
  return new Proxy({}, { get: (_, k) => (k === 'getTransform' ? () => ({ a: 1 }) : (k === 'calls' ? calls : (k === 'measureText' ? () => ({ width: 40 }) : (...a) => { if (k in calls) calls[k]++; }))), set: () => true });
}
if (!VIEW.ColonySphereView || !RMOD) { for (const n of ['P3a', 'P3b', 'P3c', 'P3d', 'P3e', 'P3f', 'P3g', 'P3h', 'P3i']) assert(false, `${n} ColonySphereView missing`); } else {
  const env = { now: 0, renders: 0, overlays: 0, made: [] };
  const mkRenderer = (opts) => {
    const r = new RMOD.ColonySphereRenderer({ ...opts, THREE, now: () => env.now, getCache: () => null, getWeatherRate: () => 0, createCanvas: fakeCanvas,
      createGL: () => ({ render: () => { env.renders++; }, setSize() {}, dispose() {}, forceContextLoss() {}, getContext: () => null }) });
    const orig = r.setOverlay.bind(r);
    r.setOverlay = (d) => { env.overlays++; return orig(d); };
    env.made.push(r);
    return r;
  };
  const icons = [];
  const view = new VIEW.ColonySphereView({ createRenderer: mkRenderer, getBuildingIcon: (id) => { icons.push(id); return id === 'mine' || id === 'colony_base' ? { png: true } : null; } });
  const planet = terranBody();
  const grid = generateGeoGrid(planet, true);
  for (const t of grid.tiles) t.owner = 'player';
  const land = grid.tiles.map((t, i) => i).filter(i => TERRAIN_TYPES[grid.tiles[i].type]?.buildable);
  const topo = geodesicTopology(grid.n);
  const cap = VIEW.bestGeoCapitalTile(grid).q;
  const near = topo.within(cap, 2).filter(i => i !== cap && land.includes(i));
  grid.tiles[cap].capitalBase = true; grid.tiles[near[0]].buildingId = 'mine'; grid.tiles[near[0]].buildingLevel = 3; grid.tiles[near[1]].buildingId = 'farm';
  grid.tiles[near[2]].underConstruction = { buildingId: 'solar_farm', progress: 0.5 };
  const colony = { planet, planetId: planet.id, name: 'Terra Nova' };
  const rect = { x: 0, y: 132, w: 896, h: 620 };
  const ctx = fakeCtx();
  const frame = (state = {}, n = 1) => { for (let i = 0; i < n; i++) { env.now += 1000 / 60; view.sync({ colony, grid, ...state }); view.draw(ctx, rect); view.drawChrome(ctx, rect); } };

  frame({}, 1);
  const capP = view.tileScreenPos(grid.tiles[cap], rect);   // pierwsza klatka — zanim auto-obrót ruszy kulę
  frame({}, 2);
  const o1 = env.overlays;
  frame({}, 30);
  assert(o1 === 1 && env.overlays === 1 && view.renderer.info().tiles === grid.tiles.length && view.renderer.info().mode === 'gl',
    'P3a tile state is sent to the renderer once and not again while nothing changes (30 frames, 1 upload)');
  assert(Math.abs(capP.x - (rect.x + rect.w / 2)) < 1e-6 && Math.abs(capP.y - (rect.y + rect.h / 2)) < 1e-6 && capP.visible, 'P3b initial view centred on the capital tile');

  // tryb budowy: menu na wolnym polu → cała siatka, blokada obrotu, werdykty; budynek pod kursorem zmienia werdykty
  const free = near[3];
  frame({ selected: { q: free, r: -1 }, buildMenu: true }, 2);
  const i1 = view.renderer.info(), o2 = env.overlays;
  frame({ selected: { q: free, r: -1 }, buildMenu: true, hoveredBuilding: BUILDINGS.farm }, 2);
  const o3 = env.overlays;
  frame({ selected: { q: free, r: -1 }, buildMenu: true, hoveredBuilding: BUILDINGS.farm }, 5);
  assert(i1.gridAll === true && i1.selectedTile === free && i1.spin === 'hold' && o2 === 2 && o3 === 3 && env.overlays === 3,
    'P3c build mode (build menu open on a free tile): full grid, selected tile, no auto-rotation; hovering a building re-marks the tiles once');
  frame({}, 2);
  frame({ lock: true }, 2);
  const lockOnly = view.renderer.info();
  frame({ selected: { q: free, r: -1 } }, 2);
  const selOnly = view.renderer.info();
  assert(lockOnly.spin === 'hold' && lockOnly.gridAll === false && selOnly.spin === 'hold' && selOnly.gridAll === false && selOnly.selectedTile === free,
    'P3d a selected tile or a special mode (landing / strike / unit selected) holds the rotation without the full grid');

  // soczewka i zaopatrzenie
  frame({}, 2);
  const before = env.overlays;
  const l1 = view.cycleLens(); frame({}, 2);
  const afterLens = env.overlays;
  const coverage = new Map([[`g${cap}`, { type: 'capital' }], ['3,4', { type: 'barracks' }]]);
  frame({ supply: true, coverage }, 2);
  const afterSupply = env.overlays;
  view.lens = 'none'; frame({}, 2);
  assert(l1 === 'terrain' && afterLens === before + 1 && afterSupply === afterLens + 1 && env.overlays === afterSupply + 1,
    'P3e lens key and Shift+S coverage change the tile state (one upload each); geo coverage keys g<i> are used, flat keys ignored');

  // picking → pole siatki; pole niewidoczne → ostatnia pozycja panelu
  const p = view.renderer.project(near[0], rect);
  const picked = view.pickTile(p.x, p.y, rect, grid);
  const outside = view.pickTile(rect.x + 4, rect.y + 4, rect, grid);
  const posVis = view.tileScreenPos(grid.tiles[near[0]], rect);
  view.renderer.rotateBy(Math.PI, 0);
  const posHidden = view.tileScreenPos(grid.tiles[near[0]], rect);
  view.renderer.rotateBy(-Math.PI, 0);
  assert(picked === grid.tiles[near[0]] && outside === null && posVis.visible && !posHidden.visible && posHidden.x === posVis.x && posHidden.y === posVis.y,
    'P3f picking returns the grid\'s own tile object; a tile turned to the far side keeps its last screen position (tile panel does not jump)');

  // adapter siatki dla dzisiejszego rysowania jednostek
  const ad = view.gridAdapter(grid, rect);
  const a1 = ad.tilePixelPos(cap, -1, 30), a2 = ad.tilePixelPos(near[0], -1, 30);
  const want1 = view.renderer.project(cap, rect), want2 = view.renderer.project(near[0], rect);
  view.renderer.rotateBy(Math.PI, 0);
  const aHidden = view.gridAdapter(grid, rect).tilePixelPos(cap, -1, 30);
  view.renderer.rotateBy(-Math.PI, 0);
  assert(Math.abs(a1.x - (want1.x - (rect.x + rect.w / 2))) < 1e-9 && Math.abs(a1.y - (want1.y - (rect.y + rect.h / 2))) < 1e-9 && Math.abs(a2.x - (want2.x - (rect.x + rect.w / 2))) < 1e-9 && Math.abs(a2.y - (want2.y - (rect.y + rect.h / 2))) < 1e-9
    && aHidden.x > 1e5 && ad.tiles === grid.tiles && TG.tileGraphOf(ad)?.tile(`g${cap}`) === grid.tiles[cap] && view.gridAdapter(grid, rect) === ad && ad.kind === 'geo',
  'P3g grid adapter: tilePixelPos = tile projection relative to the frame centre (far side → off-screen); still the same geo grid for TileGraph');

  // dwuklik, klawisze
  const lon0 = view.renderer.view.lon;
  const c1 = view.clickTile(grid.tiles[near[1]], 1000), c2 = view.clickTile(grid.tiles[near[1]], 1200), c3 = view.clickTile(grid.tiles[near[1]], 5000), c4 = view.clickTile(grid.tiles[near[2]], 5100);
  frame({ selected: { q: near[1], r: -1 } }, 60);
  const turned = view.renderer.project(near[1], rect);
  const k1 = view.key('ArrowRight'), lonK = view.renderer.view.lon, k2 = view.key('s', { shift: true }), k3 = view.key('x');
  assert(c1 === false && c2 === true && c3 === false && c4 === false && Math.hypot(turned.x - (rect.x + rect.w / 2), turned.y - (rect.y + rect.h / 2)) < 1e-3
    && k1 === true && k2 === false && k3 === false && lonK !== lon0,
  'P3h double-click (same tile within the window) turns the sphere to the tile; arrows / WASD rotate, Shift+S is left to the supply toggle');

  // tempo klatek na żądanie + mała kula
  frame({ selected: { q: near[1], r: -1 } }, 90);
  view.nextFrameDelayMs();
  frame({ selected: { q: near[1], r: -1 } }, 1);
  const dIdle = view.nextFrameDelayMs();
  const miniRect = { x: 900, y: 140, w: 300, h: 300 };
  const withMini = (state, n) => { for (let i = 0; i < n; i++) { env.now += 1000 / 60; view.sync({ colony, grid, ...state }); view.draw(ctx, rect); view.drawMini(ctx, miniRect, planet, grid); } };
  withMini({ selected: { q: near[1], r: -1 } }, 120);
  const mini = env.made[1];
  const dIdleMini = view.nextFrameDelayMs();
  const miniLon = mini.view.lon;
  withMini({ selected: { q: near[1], r: -1 } }, 30);
  const miniHeld = mini.view.lon === miniLon;
  view.renderer.pointerLeave();
  withMini({}, 2);
  const dWait = view.nextFrameDelayMs();
  withMini({}, 400);   // przerwa + rozpędzanie → obrót
  const dSpin = view.nextFrameDelayMs();
  const miniSpins = mini.view.lon !== miniLon;
  view.renderer.dragStart(rect.x + rect.w / 2, rect.y + rect.h / 2, rect);
  view.renderer.pointerMove(rect.x + rect.w / 2 + 30, rect.y + rect.h / 2, rect);
  const dDrag = view.nextFrameDelayMs();
  view.renderer.dragEnd();
  assert(dIdle === Infinity && dIdleMini === Infinity && miniHeld && dWait > 0 && dWait <= 1200 && dSpin >= 0 && dSpin <= 1000 / 30 + 1e-6 && miniSpins && dDrag === 0 && !!mini,
    `P3i frames on demand: idle (tile selected, weather paused) → no frame at all, mini sphere held too; after the mouse leaves → wake after the resume delay (${dWait.toFixed(0)} ms); spinning → ≤ 33 ms; dragging → next frame`);

  // znaczniki budynków: ikona PNG (drawImage) dla budynku z teksturą, emoji dla reszty, poziom, pasek budowy
  const ctx2 = fakeCtx();
  view.renderer.turnTo(cap); for (let i = 0; i < 60; i++) { env.now += 1000 / 60; view.sync({ colony, grid, selected: { q: cap, r: -1 } }); view.renderer.draw(ctx2, rect); }
  const d0 = ctx2.calls.drawImage, t0 = ctx2.calls.fillText, r0 = ctx2.calls.fillRect;
  icons.length = 0;
  view._drawMarkers(ctx2, rect);
  assert(ctx2.calls.drawImage === d0 + 2 && ctx2.calls.fillText >= t0 + 2 && ctx2.calls.fillRect === r0 + 2 && icons.includes('mine') && icons.includes('farm') && icons.includes('colony_base'),
    'P3j building markers: PNG portrait when the building has one (mine, capital), data icon otherwise, level number, construction bar — only for marked tiles');

  // Stolica (właściciel 2026-11-20: „nie widzę stolicy"): wirtualna stolica nie ma `buildingId` — portret z `colony_base`,
  //   budynek na polu stolicy (farma startowa) = plakietka, nie zasłona; złoty pierścień, większy portret; widoczna także
  //   z daleka, gdzie zwykłe znaczniki znikają.
  const specCap = VIEW.markerSpecOf({ capitalBase: true, buildingId: null }), specCapFarm = VIEW.markerSpecOf({ capitalBase: true, buildingId: 'farm' });
  const specMine = VIEW.markerSpecOf({ buildingId: 'mine' }), specNone = VIEW.markerSpecOf({ type: 'plains' });
  assert(specCap?.portraitId === 'colony_base' && specCap.capital && specCap.scale > 1.3 && specCap.badgeId === null
    && specCapFarm?.portraitId === 'colony_base' && specCapFarm.badgeId === 'farm' && specMine?.portraitId === 'mine' && specMine.scale === 1 && !specMine.capital && specNone === null,
    'P3l capital marker spec: portrait colony_base (not buildingId), larger, a building on the capital tile becomes a badge');
  grid.tiles[cap].buildingId = 'farm';
  const ctx3 = fakeCtx(); icons.length = 0;
  view._drawMarkers(ctx3, rect);
  const capFirst = icons.indexOf('colony_base'), farmBadge = icons.lastIndexOf('farm'), farms = icons.filter(id => id === 'farm').length;   // farma pola obok + plakietka
  grid.tiles[cap].buildingId = null;
  const ctxFar = fakeCtx(); icons.length = 0;
  const farRect = { x: 0, y: 0, w: 60, h: 40 };   // tarcza kilka pikseli — zwykłe znaczniki znikają
  view._drawMarkers(ctxFar, farRect);
  const farIcons = icons.slice();
  assert(capFirst >= 0 && farmBadge > capFirst && farms === 2 && farIcons.length >= 1 && farIcons.every(id => id === 'colony_base'),
    'P3m capital with the starter farm on it: capital portrait first, farm as a badge; far away only the capital is drawn');
  const ov = OL.composeSphereOverlay({ topo: geodesicTopology(grid.n), tiles: grid.tiles.map((t, i) => (i === near[5] ? Object.assign(Object.create(Object.getPrototypeOf(t)), t, { capitalBase: true, owner: 'emp_ai' }) : t)), lens: 'ownership', accent: [0, 255, 180] });
  const N = grid.tiles.length, line = (i) => Array.from(ov.slice((N + i) * 4, (N + i) * 4 + 4)), w = (i) => ov[(2 * N + i) * 4 + 1] / 16;
  assert(line(cap).join() === [...OL.SPHERE_OVERLAY_COLORS.capital, 255].join() && line(near[5]).join() === line(cap).join() && w(cap) >= 3 && w(near[0]) < w(cap)
    && OL.SPHERE_OVERLAY_COLORS.capital.join() !== '255,255,255',
    'P3n capital outline gold and thicker than buildings, independent of the theme accent; an AI capital on the ownership lens gets the same outline');
  let threw = false;
  try { view.release(); view.release(); } catch (e) { threw = true; }
  assert(!threw && view.renderer.info().device.join() === '0,0', 'P3k release frees the GL contexts (window hidden) and can be repeated');
}

// ── P4 gra headless na kuli ────────────────────────────────────────────────────────────────
console.log('\nP4 headless game: build / demolish / move on a sphere through the flat paths');
const { GameCore } = await import('../headless/GameCore.js');
const { default: EventBus } = await import('../../core/EventBus.js');
function playOnce(flagOn) {
  GAME_CONFIG.FEATURES.colonySphere = flagOn;
  const core = new GameCore();
  quiet(() => core.boot({ quiet: true, scenario: 'civilization', galaxySeed: 20261120 }));
  const K = window.KOSMOS, colony = K.colonyManager.getColony(K.homePlanet.id), grid = colony.grid, graph = TG.tileGraphOf(grid), bSys = colony.buildingSystem;
  const planet = colony.planet, gum = K.groundUnitManager;
  const out = { kind: grid.kind ?? 'flat', results: [] };
  const onRes = (e) => out.results.push({ success: e.success, key: e.tile ? graph.idOf(e.tile) : null, uc: !!e.underConstruction });
  EventBus.on('planet:buildResult', onRes);
  const tiles = graph.tiles();
  const b = BUILDINGS.solar_farm;
  const verdict = (t) => (VIEW.buildVerdictFor ? VIEW.buildVerdictFor(t, b, { techSystem: K.techSystem, planet }) : null);
  const okTile = tiles.find(t => verdict(t) === 'ok' && !t.capitalBase), badTile = tiles.find(t => verdict(t) === 'blocked');
  out.haveTiles = !!okTile && !!badTile;
  quiet(() => {
    if (badTile) EventBus.emit('planet:buildRequest', { tile: badTile, buildingId: b.id });
    if (okTile) EventBus.emit('planet:buildRequest', { tile: okTile, buildingId: b.id });
  });
  out.bad = out.results[0] ?? null; out.ok = out.results[1] ?? null;
  out.okState = okTile ? { key: graph.idOf(okTile), marked: !!(okTile.buildingId || okTile.underConstruction || okTile.pendingBuild), tileKey: okTile.key } : null;
  out.badState = badTile ? { marked: !!(badTile.buildingId || badTile.underConstruction || badTile.pendingBuild) } : null;
  // rozbiórka: istniejący budynek (nie stolica)
  const victimKey = [...bSys._active.keys()].find(k => !TG.isCapitalKey(k));
  const victim = victimKey ? graph.tile(victimKey) : null;
  out.victim = victim ? { key: victimKey, had: victim.buildingId } : null;
  quiet(() => { if (victim) EventBus.emit('planet:demolishRequest', { tile: victim }); });
  out.demolished = victim ? { tileEmpty: !victim.buildingId, keyGone: !bSys._active.has(victimKey) } : null;
  // ruch jednostki: z pola stolicy na pole w odległości 2, cel przez `moveTargetFor`
  const capTile = tiles.find(t => t.capitalBase);
  const standable = (t) => TERRAIN_TYPES[t.type]?.buildable && t.type !== 'ocean';
  const goal = capTile ? graph.within(capTile, 2).map(x => graph.tile(x) ?? x).find(t => t && graph.distance(capTile, t) === 2 && standable(t)) : null;
  let unit = null, moved = false, target = null;
  quiet(() => {
    if (capTile && goal) {
      unit = gum.createUnit(Object.keys(UNIT_ARCHETYPES)[0], planet.id, capTile.q, capTile.r, { owner: 'player' });
      target = POS.moveTargetFor ? POS.moveTargetFor(graph, goal) : null;
      if (unit && target) moved = gum.moveUnit(unit.id, target.q, target.r);
    }
  });
  out.move = { made: !!unit, target, moved, status: unit?.status ?? null, pathLen: unit?._path?.length ?? 0,
    pathOnGrid: (unit?._path ?? []).every(st => !!graph.tile(st)), goalIsLast: unit?._path?.length ? TG.samePos(unit._path[unit._path.length - 1], goal) : false };
  EventBus.off?.('planet:buildResult', onRes);
  return out;
}
let geoRun = null, flatRun = null, runErr = null;
try { geoRun = playOnce(true); flatRun = playOnce(false); } catch (e) { runErr = e; }
GAME_CONFIG.FEATURES.colonySphere = false;
if (!geoRun || !flatRun) { for (const n of ['P4a', 'P4b', 'P4c', 'P4d', 'P4e']) assert(false, `${n} headless run failed: ${runErr?.message ?? 'no result'}`); } else {
  const g = geoRun, f = flatRun;
  assert(g.kind === 'geo' && f.kind === 'flat' && g.haveTiles && f.haveTiles, 'P4a flag ON → home colony on a geo grid; flag OFF (control) → flat; both have an allowed and a forbidden tile for the building');
  assert(g.bad?.success === false && g.badState?.marked === false && f.bad?.success === false && f.badState?.marked === false,
    'P4b a tile marked forbidden in build mode is refused by planet:buildRequest (sphere and flat)');
  assert(g.ok?.success === true && g.okState?.marked && /^g\d+$/.test(g.okState?.key) && g.okState?.tileKey === g.okState?.key && g.ok.key === g.okState?.key
    && f.ok?.success === true && f.okState?.marked && /^-?\d+,-?\d+$/.test(f.okState?.key),
  `P4c a tile marked allowed is built through the same planet:buildRequest (sphere key ${g.okState?.key}, flat key ${f.okState?.key})`);
  assert(!!g.victim && g.demolished?.tileEmpty && g.demolished?.keyGone && !!f.victim && f.demolished?.tileEmpty && f.demolished?.keyGone,
    `P4d planet:demolishRequest removes a building from the tile and from the active set (sphere ${g.victim?.key}, flat ${f.victim?.key})`);
  assert(g.move.made && g.move.moved === true && g.move.target?.r === TG.GEO_TILE_R && g.move.pathLen >= 2 && g.move.pathOnGrid && g.move.goalIsLast
    && f.move.made && f.move.moved === true && f.move.pathLen >= 2 && f.move.pathOnGrid && f.move.goalIsLast,
  `P4e unit move order via moveTargetFor → moveUnit: path of ${g.move.pathLen} sphere tiles ends on the clicked tile (flat control: ${f.move.pathLen} tiles)`);
}

// ── P5 piny źródła ────────────────────────────────────────────────────────────────────────
console.log('\nP5 source pins');
const co = stripComments(src('src/ui/ColonyOverlay.js'));
const gs = stripComments(src('src/scenes/GameScene.js'));
const body = (text, head) => { const i = text.indexOf(head); if (i < 0) return ''; const j = text.indexOf('\n  }\n', i); return text.slice(i, j < 0 ? i + 4000 : j); };
const s2t = body(co, '  _screenToTile(sx, sy, grid) {');
assert(/if \(isSphereGrid\(grid\)\) return this\._sphereOf\(\)\.pickTile\(/.test(s2t) && s2t.indexOf('isSphereGrid(grid)') < s2t.indexOf('grid.pixelToTile(') && /return grid\.pixelToTile\(sx - cx, sy - cy, this\._hexSize\);/.test(s2t),
  'P5a _screenToTile (live path of every click, hover and the right-click move order): sphere picking for a geo grid, flat pixelToTile line untouched');
const tsp = body(co, '  _tileScreenPos(tile, grid, ox, oy, ow, oh) {');
assert(/isSphereGrid\(grid\)/.test(tsp) && /this\._sphere\.tileScreenPos\(tile, rect\)/.test(tsp) && /grid\.tilePixelPos\(tile\.q, tile\.r, this\._hexSize\)/.test(tsp), 'P5b _tileScreenPos: tile projection on a sphere, flat formula untouched');
assert(/if \(grid && isSphereGrid\(grid\)\) \{\s*this\._drawSphereMap\(ctx, ox, mapY, mapW, mapH, grid, colony\);\s*\} else if \(grid\) \{\s*ctx\.save\(\);\s*ctx\.beginPath\(\); ctx\.rect\(ox, mapY, mapW, mapH\); ctx\.clip\(\);\s*this\._drawMap\(ctx, ox, mapY, mapW, mapH, grid, colony\?\.planet\);/.test(co),
  'P5c draw(): geo grid → sphere, any other grid → today\'s clipped _drawMap call');
const dsm = body(co, '  _drawSphereMap(ctx, ox, oy, ow, oh, grid, colony) {');
assert(/this\._drawUnits\(ctx, ox, oy, ow, oh, sv\.gridAdapter\(grid, rect\)\)/.test(dsm) && /finally \{ \[this\._camX, this\._camY, this\._hexSize\] = keep; \}/.test(dsm)
  && /buildMenu = !!selTile && !this\._selectedUnit && !!colony && !colony\.isPreview && !selTile\.isOccupied/.test(dsm) && /this\._sphereActive = true/.test(dsm),
'P5d sphere map: units drawn by today\'s _drawUnits through the grid adapter, flat camera restored; build mode = build menu on a free tile');
assert(/_canStartRectSelect\(x, y\) \{\s*if \(!this\.visible\) return false;\s*if \(this\._sphereActive\) return false;/.test(co)
  && /_loadBiomeMap\(planet, grid, planetId\) \{\s*if \(!planet \|\| !grid\) return;\s*if \(isSphereGrid\(grid\)\) return;/.test(co)
  && /this\._sphere\?\.release\(\); this\._sphereActive = false;/.test(co)
  && /this\._sphereActive = false;\s*this\._infoView = null;/.test(co),
'P5e sphere flag reset every frame and on hide; no rectangle select and no 2D biome map on a geo grid; contexts released on hide');
const flashes = (co.match(/tilePosLabel\(\{ q, r \}\)/g) ?? []).length;
assert(flashes === 5 && !/\(\$\{q\},\$\{r\}\)/.test(co) && /`Hex: \(\$\{tilePosLabel\(unit, ', '\)\}\)`/.test(co) && !/\$\{unit\.q\}, \$\{unit\.r\}/.test(co),
  `P5f colony screen texts go through tilePosLabel (${flashes} battle / contact flashes + the unit panel); no hand-built „(q,r)" left`);
const ucp = stripComments(src('src/ui/UnitCardPanel.js')), brm = stripComments(src('src/ui/BattleReportModal.js')), clm = stripComments(src('src/ui/CargoLoadModal.js'));
assert((ucp.match(/tilePosLabel\(/g) ?? []).length === 2 && !/\$\{unit\.q\}, \$\{unit\.r\}/.test(ucp) && (brm.match(/tilePosLabel\(\{ q, r \}\)/g) ?? []).length === 3 && !/\(\$\{q\},\$\{r\}\)/.test(brm),
  'P5g unit card (position, support target) and battle report subtitle use tilePosLabel');
assert(/const unloadPos = unloadPosFor\(unit, tileGraphOf\(colony\?\.grid\)\);\s*if \(!unloadGroundUnit\(vessel, unit, planetId, unloadPos\.q, unloadPos\.r\)\)/.test(clm) && !/unit\.q \?\? 0/.test(clm),
  'P5h CargoLoadModal unloads at a tile from the body graph (no `unit.q ?? 0` fallback of its own)');
assert(/const target = moveTargetFor\(tileGraphOf\(grid\), tile\);\s*if \(target\) gum\.moveUnit\(uid, target\.q, target\.r\);/.test(gs) && !/gum\.moveUnit\(uid, tile\.q, tile\.r\)/.test(gs),
  'P5i GameScene right-click move order takes its target from the body graph');
const homeSites = (gs.match(/const grid = this\._newHomeGrid\(civPlanet\);/g) ?? []).length;
assert(homeSites === 3 && !/PlanetMapGenerator\.generate\(civPlanet, true\)/.test(gs) && /_newHomeGrid\(civPlanet\) \{\s*const grid = createColonyGrid\(civPlanet, true\);\s*if \(grid\?\.kind === 'geo'\) \{/.test(gs)
  && /setGeoGridsAllowed\(true\);/.test(gs) && (gs.match(/const allTiles = this\._homeTilesInOrder\(grid\);/g) ?? []).length === 3
  && /return grid\?\.kind === 'geo' \? ColonySphereView\.tilesNearCapital\(grid\) : tileGraphOf\(grid\)\.tiles\(\);/.test(gs),
`P5j new home colony grid through the factory at all ${homeSites} start scenarios (flag OFF = the flat generator); the grid is adopted only when geo; flat tile order untouched`);
assert(/colonySphere:\s+false,/.test(src('src/config/GameConfig.js')) && /colony\.grid\.kind === 'geo';/.test(stripComments(src('src/ui/ColonyGridResolveLogic.js'))),
  'P5k FEATURES.colonySphere stays OFF by default; the reuse rule names the geo kind');
const um = stripComments(src('src/scenes/UIManager.js'));
assert(/onChange: \(\) => \{ if \(window\.KOSMOS\?\.uiManager\) window\.KOSMOS\.uiManager\._dirty = true; \}/.test(body(co, '  _sphereOf() {'))
  && !/colonySphere|ColonySphere|_sphere/.test(um) && /queueMicrotask\(\(\) => this\._scheduleSphereFrame\(sv\.nextFrameDelayMs\(\)\)\);/.test(co) && /window\.KOSMOS\.uiManager\._dirty = true;/.test(body(co, '  _scheduleSphereFrame(delayMs) {')),
  'P5l the UI draw loop is untouched: the sphere asks for frames through the existing dirty flag — at its own pace, and on async changes (map ready, turn to tile)');

// ── P6 mapa bohatera stolicy w tle ─────────────────────────────────────────────────────────────
console.log('\nP6 capital hero-map prefetch');
if (!VIEW.scheduleCapitalHeroPrefetch) { for (const n of ['P6a', 'P6b']) assert(false, `${n} scheduleCapitalHeroPrefetch missing`); } else {
  const mkTimers = () => { const t = { fn: null, set: 0, cleared: 0 }; t.setTimer = (fn) => { t.fn = fn; t.set++; return 7; }; t.clearTimer = () => { t.cleared++; t.fn = null; }; return t; };
  const off = mkTimers(), reqOff = [];
  VIEW.scheduleCapitalHeroPrefetch({ flag: false, getCache: () => ({ request: (...a) => reqOff.push(a) }), getBody: () => ({ id: 'h' }), setTimer: off.setTimer, clearTimer: off.clearTimer });
  assert(off.set === 0 && reqOff.length === 0, 'P6a flag OFF: no timer, no request');
  const on = mkTimers(), req = [];
  let cache = null, bodyNow = null;
  VIEW.scheduleCapitalHeroPrefetch({ flag: true, getCache: () => cache, getBody: () => bodyNow, setTimer: on.setTimer, clearTimer: on.clearTimer, tries: 5 });
  on.fn(); on.fn();
  const early = req.length;
  cache = { request: (...a) => req.push(a) }; bodyNow = { id: 'home' };
  on.fn();
  const gaveUp = mkTimers();
  VIEW.scheduleCapitalHeroPrefetch({ flag: true, getCache: () => null, getBody: () => null, setTimer: gaveUp.setTimer, clearTimer: gaveUp.clearTimer, tries: 3 });
  gaveUp.fn(); gaveUp.fn(); const stillOn = gaveUp.cleared; gaveUp.fn?.();
  assert(on.set === 1 && early === 0 && req.length === 1 && req[0][0].id === 'home' && req[0][1] === 'hero' && req[0][2] === VIEW.SURFACE_PRIORITY_IDLE && VIEW.SURFACE_PRIORITY_IDLE < 100
    && on.cleared === 1 && stillOn === 0 && gaveUp.cleared === 1,
  'P6b flag ON: waits for the cache and the home body, requests the hero map once at idle priority (below the system LOD queue), stops; gives up after its tries');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
