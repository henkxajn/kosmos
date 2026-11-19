// ═══════════════════════════════════════════════════════════
// KEEPER — COLONY SPHERE CS-2: reguły geometrii siatki za TileGraph + Finding 779
// Uruchom: node src/testing/smoke/colony_sphere_geometry_smoke.mjs
// ───────────────────────────────────────────────────────────
// Siatki: każda klasa rozmiaru płaskiej siatki (rocky floor/1M⊕/cap, ice floor/cap, hot_rocky, gas, moon, planetoid,
// largestHexMaps) + 22 siatki kolonii z fixture GATE-S4-fresh-gy60 (prawdziwe budynki, ocean, stolice).
// G1  latitudeBand vs dawne HexGrid.getLatitudeModifier(r, height) na KAŻDYM polu (pole / {q,r} / id), dane
//     LatitudeBands = dawne liczby; KONTROLA skutku: produkcja research_station na siatce związanej tak, jak wiąże ją
//     nowa gra danego drzewa (zielona po obu stronach).
// G2  kara polarna AI: aiPolarPenalty vs dawny wzór inline (wysokość siatki i dawne _inferRows); skutek: sekwencje
//     wyboru pól BuildingSystem.autoPlaceBuilding (faza 1 i 2) i ColonyAutoExpander._findFreeTile = zamrożone dawne.
// G3  isLandingEdge vs dawne InvasionSystem._isEdgeHex (getNeighbors < 6); skutek: _findLandingHexes = dawna pula.
// G4  stepDirection vs dawny kod pikselowy (każde pole × każdy sąsiad z szwem, pary przez szew); skutek:
//     GroundUnitManager._setupNextStep = dawne pola kroku (_wrapStep, _facingLeft, piksele, koszt).
// G5  equatorTile vs dawny fallback RandomEvent (r = floor(height/2)); skutek: _damageBuildings na budynku bez pola.
// G6  anyTile vs dawne {q:0, r:0} (to samo pole na każdej siatce).
// G7  Interfejs nie zaszywa reguły płaskiej siatki (D-CS-9: na kuli < 6 sąsiadów = 12 pięciokątów, CS-5 ma własną
//     regułę lądowania): reguły są metodami FlatHexTileGraph, nie modułu ani bazy; kod poza klasą bez „< 6” i rzędów.
// G8  Piny źródła: brak _gridHeight (produkcja), brak odczytów tileR, brak tabeli gridSizes, brak rachunku rzędów /
//     krawędzi / pikseli w dawnych miejscach CS-2; każde miejsce woła metodę grafu (świadkowie wzorców).
// G9  Finding 779 — okno po wczytaniu: kolonie fixture przywrócone PRAWDZIWYM ColonyManager.restore (mapa kolonii
//     nigdy nie otwarta, BuildingSystem._grid = null): pas / produkcja / koszt budowy = ta sama kolonia po otwarciu
//     mapy = kolonia świeżej gry = dawna reguła z prawdziwą wysokością siatki; dokończenie budowy z kolejki ze starym
//     tileR → pas z pola, nie z tileR.
// G10 Zapis: kolejki nie zapisują tileR, a tileR ze starych zapisów jest ignorowane.
// ═══════════════════════════════════════════════════════════

import '../headless/env.js'; // MUSI być pierwszy
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { HexGrid } from '../../map/HexGrid.js';
import { PlanetMapGenerator } from '../../map/PlanetMapGenerator.js';
import { TERRAIN_TYPES, evaluatePlacement } from '../../map/HexTile.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { GROUND_MOVE_COST } from '../../data/GroundUnitData.js';
import { computeBuildResourceCost, computeBuildCommodityCost } from '../../data/EnvironmentCost.js';
import { getTerrainRule } from '../../data/ai/AiTerrainRules.js';
import * as ATR from '../../data/ai/AiTerrainRules.js';            // aiPolarPenalty powstaje w CS-2 — namespace, bez SyntaxError na bazie
import * as TG from '../../map/TileGraph.js';                      // LATITUDE_BAND powstaje w CS-2
import { GroundUnitManager } from '../../systems/GroundUnitManager.js';
import { InvasionSystem } from '../../systems/InvasionSystem.js';
import { BuildingSystem } from '../../systems/BuildingSystem.js';
import { ColonyAutoExpander } from '../../systems/ColonyAutoExpander.js';
import { RandomEventSystem } from '../../systems/RandomEventSystem.js';
import EntityManager from '../../core/EntityManager.js';
import EventBus from '../../core/EventBus.js';
import { GameCore } from '../headless/GameCore.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const quiet = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };
let LB = null;
try { LB = await import('../../data/LatitudeBands.js'); } catch { /* baza: modułu nie ma — piny degradują */ }
const { tileGraphOf } = TG;

// ── Dawne reguły (zamrożone z HEAD 4829bec) ──────────────────────────────────
const legacyLat = (r, h) => HexGrid.getLatitudeModifier(r, h);                       // BuildingSystem / ColonyOverlay
const legacyPenalty = (r, rows) => (r === 0 || r === rows - 1) ? -5 : (r === 1 || r === rows - 2) ? -2 : 0;   // ×3 kopie
const legacyInferRows = (grid) => { let m = 0; grid.forEach(t => { if (t.r > m) m = t.r; }); return m + 1; };  // Bootstrap
const legacyIsEdge = (grid, tile) => (grid.getNeighbors ? grid.getNeighbors(tile.q, tile.r) : []).length < 6;  // Invasion
function legacyStep(grid, from, to) {                                                  // GroundUnitManager._setupNextStep
  const fromLocal = grid.tilePixelPos(from.q, from.r, 1);
  const toLocal   = grid.tilePixelPos(to.q, to.r, 1);
  const gridW = grid.gridPixelSize(1).w;
  const dx = toLocal.x - fromLocal.x;
  const wrap = Math.abs(dx) > gridW * 0.4;
  return { fromLocal, toLocal, wrap, facingLeft: wrap ? dx > 0 : dx < 0, stepCost: (() => { const t = grid.get(to.q, to.r); return t ? (GROUND_MOVE_COST[t.type] ?? 1) : 1; })() };
}
const legacyEquatorRow = (grid) => Math.floor((grid?.height ?? 10) / 2);               // RandomEvent fallback
const isFreeHex = (tile) => !tile.buildingId && !tile.capitalBase && !tile.underConstruction && !tile.pendingBuild && TERRAIN_TYPES[tile.type]?.buildable === true;
function legacyAutoPlacePick(grid, buildingId, opts = {}) {                            // BuildingSystem.autoPlaceBuilding (wybór)
  const rows = grid.height ?? 10;
  const preferred = Array.isArray(opts.preferredTerrain) && opts.preferredTerrain.length > 0 ? opts.preferredTerrain : null;
  const rule = getTerrainRule(buildingId);
  const hard = rule?.mode === 'hard' ? rule.terrains : null;
  const soft = rule?.mode === 'soft' ? rule.terrains : null;
  let placed = null;
  if (preferred) {
    let bestScore = -Infinity;
    grid.forEach(tile => {
      if (!isFreeHex(tile) || !preferred.includes(tile.type)) return;
      const score = legacyPenalty(tile.r, rows);
      if (score > bestScore) { bestScore = score; placed = tile; }
    });
  }
  if (!placed) {
    const pick = (enforceHard) => {
      let best = null, bestScore = -Infinity;
      grid.forEach(tile => {
        if (!isFreeHex(tile)) return;
        if (enforceHard && hard && !hard.includes(tile.type)) return;
        let score = 0;
        if (soft && soft.includes(tile.type)) score += 10;
        score += legacyPenalty(tile.r, rows);
        if (score > bestScore) { bestScore = score; best = tile; }
      });
      return best;
    };
    placed = pick(!!hard);
    if (!placed && hard) placed = pick(false);
  }
  return placed;
}
function legacyFindFreeTile(grid, buildingId) {                                        // ColonyAutoExpander._findFreeTile
  const rule = getTerrainRule(buildingId);
  const hard = rule?.mode === 'hard' ? rule.terrains : null;
  const soft = rule?.mode === 'soft' ? rule.terrains : null;
  const rows = grid.height ?? 10;
  const pick = (enforceHard) => {
    let best = null, bestScore = -Infinity;
    grid.forEach(tile => {
      if (tile.buildingId || tile.capitalBase || tile.underConstruction || tile.pendingBuild) return;
      if (!TERRAIN_TYPES[tile.type]?.buildable) return;
      if (enforceHard && hard && !hard.includes(tile.type)) return;
      let score = 0;
      if (soft && soft.includes(tile.type)) score += 10;
      if (tile.r === 0 || tile.r === rows - 1) score -= 5;
      else if (tile.r === 1 || tile.r === rows - 2) score -= 2;
      if (score > bestScore) { bestScore = score; best = tile; }
    });
    return best;
  };
  if (hard) return pick(true) ?? pick(false);
  return pick(false);
}
function legacyLandingPool(grid) {                                                     // InvasionSystem._findLandingHexes
  const edge = [], fallback = [];
  for (const tile of grid.toArray()) {
    if (!tile || tile.type === 'ocean' || tile.capitalBase) continue;
    if (legacyIsEdge(grid, tile)) edge.push({ q: tile.q, r: tile.r }); else fallback.push({ q: tile.q, r: tile.r });
  }
  const pool = edge.length > 0 ? edge : fallback;
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool;
}
// Deterministyczny Math.random na czas porównania (obie strony dostają ten sam strumień).
function withRng(seed, fn) {
  const prev = Math.random; let s = seed >>> 0;
  Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  try { return fn(); } finally { Math.random = prev; }
}
const cloneGrid = (g) => HexGrid.restore(g.serialize());
const keyOf = (t) => t ? `${t.q},${t.r}` : null;
const sameModifier = (a, b) => !!a && !!b && a.production === b.production && a.buildCost === b.buildCost && a.label === b.label;
// Związanie siatki z BuildingSystem tak, jak robi to dane drzewo (nowa gra / otwarcie mapy kolonii — ColonyOverlay):
// na bazie lustro `_gridHeight` szło razem z siatką; po CS-2 pola nie ma.
const bindGrid = (bs, grid) => { bs._grid = grid; if ('_gridHeight' in bs) bs._gridHeight = grid.height ?? 10; };

// ── Siatki ───────────────────────────────────────────────────────────────────
const BODIES = [
  ['rocky floor (m=0.4)', { id: 'cs2_rocky_s', type: 'planet', planetType: 'rocky', physics: { mass: 0.4 } }],
  ['rocky 1M⊕',            { id: 'cs2_rocky_1', type: 'planet', planetType: 'rocky', physics: { mass: 1 } }],
  ['rocky cap (m=4)',      { id: 'cs2_rocky_c', type: 'planet', planetType: 'rocky', physics: { mass: 4 } }],
  ['ice floor (m=0.5)',    { id: 'cs2_ice_s',   type: 'planet', planetType: 'ice',   physics: { mass: 0.5 } }],
  ['ice cap (m=4)',        { id: 'cs2_ice_c',   type: 'planet', planetType: 'ice',   physics: { mass: 4 } }],
  ['hot_rocky',            { id: 'cs2_hot',     type: 'planet', planetType: 'hot_rocky', physics: { mass: 1 } }],
  ['gas',                  { id: 'cs2_gas',     type: 'planet', planetType: 'gas',   physics: { mass: 100 } }],
  ['moon',                 { id: 'cs2_moon',    type: 'moon',   planetType: 'rocky', physics: { mass: 0.01 } }],
  ['planetoid',            { id: 'cs2_pl',      type: 'planetoid', planetType: 'rocky', physics: { mass: 0.001 } }],
];
const genGrids = BODIES.map(([label, body]) => [label, quiet(() => PlanetMapGenerator.generate(body, false))]);
{
  const prev = GAME_CONFIG.FEATURES.largestHexMaps;
  GAME_CONFIG.FEATURES.largestHexMaps = true;
  try { genGrids.push(['rocky largestHexMaps (m=4)', quiet(() => PlanetMapGenerator.generate({ id: 'cs2_rocky_L', type: 'planet', planetType: 'rocky', physics: { mass: 4 } }, false))]); }
  finally { GAME_CONFIG.FEATURES.largestHexMaps = prev; }
}
const FX = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/GATE-S4-fresh-gy60.save.json.gz', import.meta.url))).toString());
const fxGrids = FX.civ4x.colonies.filter(c => c.grid).map(c => [`fixture ${c.planetId}`, HexGrid.restore(c.grid)]);
const grids = [...genGrids, ...fxGrids];
const tileTotal = grids.reduce((s, [, g]) => s + g.toArray().length, 0);
console.log(`Siatki: ${grids.length} (${genGrids.length} klas rozmiaru + ${fxGrids.length} z fixture), pól ${tileTotal}; wysokości ${[...new Set(grids.map(([, g]) => g.height))].sort((a, b) => a - b).join('/')}`);
assert(new Set(grids.map(([, g]) => g.height)).size >= 6 && fxGrids.length === 22, `G0 świadek: ≥6 różnych wysokości siatek i 22 siatki z fixture (${fxGrids.length})`);

// ── G1 ───────────────────────────────────────────────────────────────────────
console.log('\nG1 — latitudeBand vs dawne getLatitudeModifier(r, height)');
{
  const B = TG.LATITUDE_BAND;
  const hasApi = !!B && !!LB && typeof tileGraphOf(grids[0][1]).latitudeBand === 'function';
  assert(hasApi && new Set(Object.values(B)).size === 3, `G1a API: LATITUDE_BAND (3 różne pasy), LatitudeBands.latitudeModifierOf, graph.latitudeBand (${hasApi})`);
  let n = 0, bad = 0, badRef = 0; const cnt = new Map();
  if (hasApi) {
    for (const [, grid] of grids) {
      const g = tileGraphOf(grid);
      for (const t of g.tiles()) {
        n++;
        const band = g.latitudeBand(t);
        if (g.latitudeBand({ q: t.q, r: t.r }) !== band || g.latitudeBand(g.idOf(t)) !== band) badRef++;
        if (!sameModifier(LB.latitudeModifierOf(band), legacyLat(t.r, grid.height))) bad++;
        cnt.set(band, (cnt.get(band) ?? 0) + 1);
      }
    }
  }
  assert(hasApi && bad === 0 && n === tileTotal, `G1b modyfikator pasa = dawny (produkcja, koszt, etykieta) na ${n}/${tileTotal} polach (różnic ${bad})`);
  assert(hasApi && badRef === 0, `G1c ten sam pas dla pola, {q,r} i id "q,r" (różnic ${badRef})`);
  assert(hasApi && cnt.get(B.POLAR) > 0 && cnt.get(B.SUBPOLAR) > 0 && cnt.get(B.EQUATORIAL) > 0,
    `G1d świadek: każdy pas obecny (biegun ${cnt.get(B?.POLAR)}, przedbiegun ${cnt.get(B?.SUBPOLAR)}, równik ${cnt.get(B?.EQUATORIAL)})`);
  // KONTROLA skutku na siatce związanej (stan nowej gry / po otwarciu mapy): research_station = 8 × dawny modyfikator.
  const RS = BUILDINGS.research_station, rate = RS.rates.research;
  let m = 0, badRate = 0, polarSeen = 0;
  for (const [, grid] of grids) {
    const bs = new BuildingSystem(null, null, null); bindGrid(bs, grid);
    for (const t of grid.toArray()) {
      if (t.anomalyEffect) continue;
      m++;
      const want = rate * legacyLat(t.r, grid.height).production;
      if (want < rate) polarSeen++;
      if (bs._calcBaseRates(RS, t, 1).research !== want) badRate++;
    }
    bs.dispose?.();
  }
  assert(badRate === 0 && polarSeen > 0, `G1e KONTROLA siatka związana: produkcja research_station = ${rate} × dawny modyfikator na ${m} polach (różnic ${badRate}; pól z karą ${polarSeen})`);
}

// ── G2 ───────────────────────────────────────────────────────────────────────
console.log('\nG2 — jedna kara polarna AI (×3 kopie → AiTerrainRules.aiPolarPenalty)');
{
  const fn = ATR.aiPolarPenalty;
  let n = 0, bad = 0, badInfer = 0; const cnt = { '-5': 0, '-2': 0, '0': 0 };
  if (typeof fn === 'function') {
    for (const [, grid] of grids) {
      const g = tileGraphOf(grid), inferred = legacyInferRows(grid);
      for (const t of g.tiles()) {
        n++;
        const p = fn(g, t);
        if (p !== legacyPenalty(t.r, grid.height)) bad++;
        if (p !== legacyPenalty(t.r, inferred)) badInfer++;
        cnt[String(p)] = (cnt[String(p)] ?? 0) + 1;
      }
    }
  }
  assert(typeof fn === 'function' && bad === 0 && n === tileTotal, `G2a aiPolarPenalty = dawny wzór inline (wysokość siatki) na ${n} polach (różnic ${bad})`);
  assert(typeof fn === 'function' && badInfer === 0, `G2b = dawny wzór z _inferRows (Bootstrap) (różnic ${badInfer})`);
  assert(cnt['-5'] > 0 && cnt['-2'] > 0 && cnt['0'] > 0, `G2c świadek: −5 ${cnt['-5']}, −2 ${cnt['-2']}, 0 ${cnt['0']}`);
  // Skutek: sekwencje wyboru pól (po każdym wyborze pole zajęte) = zamrożone dawne.
  const CASES = [['research_station', {}], ['mine', {}], ['habitat', {}], ['solar_farm', { preferredTerrain: ['plains', 'tundra'] }]];
  const PICKS = 25;
  let seqs = 0, badAuto = 0, badFree = 0, picks = 0, polarAvoided = 0;
  const firstDiff = [];
  for (const [label, grid] of grids) {
    for (const [id, opts] of CASES) {
      // autoPlaceBuilding (prawdziwa metoda; aktywacja zastąpiona zapisem klucza — wybór jest przed nią)
      const gNew = cloneGrid(grid), gOld = cloneGrid(grid);
      const bs = new BuildingSystem(null, null, null); bindGrid(bs, gNew);
      const placed = []; bs._activateBuilding = (key) => placed.push(String(key));
      const legacyKeys = [];
      for (let i = 0; i < PICKS; i++) {
        bs.autoPlaceBuilding(id, opts);
        const t = legacyAutoPlacePick(gOld, id, opts);
        if (t) { t.buildingId = id; t.buildingLevel = 1; legacyKeys.push(keyOf(t)); }
      }
      seqs++; picks += legacyKeys.length;
      if (placed.join(';') !== legacyKeys.join(';')) { badAuto++; if (firstDiff.length < 3) firstDiff.push(`${label} ${id}: ${placed.slice(0, 4).join(' ')} vs ${legacyKeys.slice(0, 4).join(' ')}`); }
      bs.dispose?.();
      // _findFreeTile (prawdziwa metoda na prototypie; czarna lista pusta)
      const gF = cloneGrid(grid), gFo = cloneGrid(grid);
      const stub = { _isTileBlacklisted: () => false, _civYear: () => 0, _log: () => {} };
      const col = { buildingSystem: { _grid: gF } };
      const a = [], b = [];
      for (let i = 0; i < PICKS; i++) {
        const t1 = ColonyAutoExpander.prototype._findFreeTile.call(stub, col, id);
        const t2 = legacyFindFreeTile(gFo, id);
        if (t1) { t1.buildingId = id; a.push(keyOf(t1)); }
        if (t2) { t2.buildingId = id; b.push(keyOf(t2)); if (t2.r > 1 && t2.r < grid.height - 2) polarAvoided++; }
      }
      if (a.join(';') !== b.join(';')) { badFree++; if (firstDiff.length < 3) firstDiff.push(`${label} ${id} findFree: ${a.slice(0, 4).join(' ')} vs ${b.slice(0, 4).join(' ')}`); }
    }
  }
  assert(badAuto === 0 && picks > 0, `G2d autoPlaceBuilding: ${seqs} sekwencji × ≤${PICKS} wyborów (${picks}) = dawny wybór (różnych ${badAuto})${firstDiff.length ? ' — ' + firstDiff.join(' | ') : ''}`);
  assert(badFree === 0, `G2e ColonyAutoExpander._findFreeTile: ${seqs} sekwencji = dawny wybór (różnych ${badFree})`);
  assert(polarAvoided > 0, `G2f świadek: kara działa — dawny wybór omija pasy polarne (${polarAvoided} wyborów poza biegunami)`);
}

// ── G3 ───────────────────────────────────────────────────────────────────────
console.log('\nG3 — isLandingEdge vs dawne _isEdgeHex (strefa lądowania desantu)');
{
  let n = 0, bad = 0, edges = 0, inner = 0, seamOnly = 0;
  const ok = typeof tileGraphOf(grids[0][1]).isLandingEdge === 'function';
  if (ok) {
    for (const [, grid] of grids) {
      const g = tileGraphOf(grid);
      for (const t of g.tiles()) {
        n++;
        const e = g.isLandingEdge(t);
        if (e !== legacyIsEdge(grid, t)) bad++;
        if (e) edges++; else inner++;
        if (!e && g.neighbors(t, { crossSeam: false }).length < 6) seamOnly++;   // pełne dopiero przez szew
      }
    }
  }
  assert(ok && bad === 0 && n === tileTotal, `G3a isLandingEdge = getNeighbors(q,r).length < 6 na ${n} polach (różnic ${bad})`);
  assert(edges > 0 && inner > 0 && seamOnly > 0, `G3b świadek: brzeg ${edges}, wnętrze ${inner}, pola wnętrza dzięki zawinięciu przez szew ${seamOnly}`);
  let pools = 0, badPool = 0, poolTiles = 0;
  for (const [i, [, grid]] of grids.entries()) {
    const mine = withRng(1000 + i, () => InvasionSystem.prototype._findLandingHexes.call(InvasionSystem.prototype, grid, { planetId: 'cs2_none' }));
    const old = withRng(1000 + i, () => legacyLandingPool(grid));
    pools++; poolTiles += old.length;
    if (mine.map(keyOf).join(';') !== old.map(keyOf).join(';')) badPool++;
  }
  assert(badPool === 0 && poolTiles > 0, `G3c InvasionSystem._findLandingHexes = dawna pula (ta sama kolejność po tasowaniu) na ${pools} siatkach, ${poolTiles} pól (różnych ${badPool})`);
}

// ── G4 ───────────────────────────────────────────────────────────────────────
console.log('\nG4 — stepDirection vs dawny kod pikselowy (szew + zwrot sprite\'a)');
{
  const ok = typeof tileGraphOf(grids[0][1]).stepDirection === 'function';
  let pairs = 0, bad = 0, seam = 0, seamLeft = 0, seamRight = 0, flatLeft = 0, flatRight = 0, badSetup = 0;
  for (const [, grid] of grids) {
    const g = tileGraphOf(grid);
    for (const t of grid.toArray()) {
      for (const nb of grid.getNeighbors(t.q, t.r)) {
        pairs++;
        const old = legacyStep(grid, t, nb);
        if (ok) {
          const s = g.stepDirection(t, nb);
          if (s.crossesSeam !== old.wrap || s.facingLeft !== old.facingLeft) bad++;
        }
        if (old.wrap) { seam++; if (old.facingLeft) seamLeft++; else seamRight++; }
        else if (old.facingLeft) flatLeft++; else flatRight++;
        const unit = { q: t.q, r: t.r, _path: [{ q: nb.q, r: nb.r }] };
        GroundUnitManager.prototype._setupNextStep.call(GroundUnitManager.prototype, unit, grid);
        if (unit._wrapStep !== old.wrap || unit._facingLeft !== old.facingLeft || unit._stepCost !== old.stepCost
          || unit._fromPixel?.x !== old.fromLocal.x || unit._fromPixel?.y !== old.fromLocal.y
          || unit._toPixel?.x !== old.toLocal.x || unit._toPixel?.y !== old.toLocal.y) badSetup++;
      }
    }
  }
  assert(ok && bad === 0, `G4a stepDirection = dawne |dx| > 0.4·szerokość / zwrot (odwrócony przy szwie) na ${pairs} parach (różnic ${bad})`);
  assert(seam > 0 && seamLeft > 0 && seamRight > 0 && flatLeft > 0 && flatRight > 0,
    `G4b świadek: par przez szew ${seam} (w lewo ${seamLeft}, w prawo ${seamRight}), zwykłych w lewo ${flatLeft}, w prawo ${flatRight}`);
  assert(badSetup === 0, `G4c GroundUnitManager._setupNextStep = dawne pola kroku (_wrapStep, _facingLeft, piksele, _stepCost) na ${pairs} parach (różnic ${badSetup})`);
}

// ── G5 / G6 ──────────────────────────────────────────────────────────────────
console.log('\nG5/G6 — equatorTile (fallback RandomEvent) i anyTile (fallback StrikeSquadron)');
{
  const okE = typeof tileGraphOf(grids[0][1]).equatorTile === 'function';
  let badE = 0, badAny = 0;
  for (const [, grid] of grids) {
    const g = tileGraphOf(grid);
    if (okE) {
      const e = g.equatorTile(), row = legacyEquatorRow(grid);
      const firstOfRow = grid.toArray().find(t => t.r === row);
      if (!e || e !== firstOfRow || e.r !== row || legacyLat(e.r, grid.height).production !== 1) badE++;
    }
    const a = g.anyTile(), z = grid.get(0, 0);
    if (!a || !z || a !== z) badAny++;
  }
  assert(okE && badE === 0, `G5a equatorTile = pierwsze pole rzędu floor(height/2) (dawny fallback), pas równikowy, na ${grids.length} siatkach (różnic ${badE})`);
  assert(badAny === 0, `G6a anyTile() = pole (0,0) — dawne {q:0, r:0} — na ${grids.length} siatkach (różnic ${badAny})`);
  // Skutek fallbacku: degradacja budynku, którego pola nie ma w siatce (realTile = null) → stawki z pola równikowego.
  let runs = 0, badDmg = 0;
  for (const [, grid] of grids) {
    const bs = new BuildingSystem(null, null, null); bindGrid(bs, grid);
    const RS = BUILDINGS.research_station;
    bs._active.set('999,999', { building: RS, baseRates: {}, effectiveRates: {}, level: 2, producerId: 'building_999,999' });
    const prev = Math.random; Math.random = () => 0;
    try { RandomEventSystem.prototype._damageBuildings.call(RandomEventSystem.prototype, { grid, buildingSystem: bs }, 1, 1); }
    finally { Math.random = prev; }
    runs++;
    const e = bs._active.get('999,999');
    if (!e || e.level !== 1 || e.baseRates?.research !== RS.rates.research * 1) badDmg++;
    bs.dispose?.();
  }
  assert(badDmg === 0, `G5b RandomEventSystem._damageBuildings: budynek bez pola, Lv2 → Lv1, stawki z pola równikowego (research ${BUILDINGS.research_station.rates.research} × 1.0) na ${runs} siatkach (różnic ${badDmg})`);
}

// ── G7 ───────────────────────────────────────────────────────────────────────
console.log('\nG7 — interfejs nie zaszywa reguły płaskiej siatki (D-CS-9 → CS-5)');
const ROOT = new URL('../../', import.meta.url);
const raw = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(raw(rel));
{
  const RULES = ['latitudeBand', 'equatorTile', 'isLandingEdge', 'stepDirection'];
  const Flat = TG.FlatHexTileGraph;
  const own = RULES.filter(m => Flat && Object.prototype.hasOwnProperty.call(Flat.prototype, m) && typeof Flat.prototype[m] === 'function');
  assert(own.length === RULES.length, `G7a reguły są metodami FlatHexTileGraph (własne: ${own.join(', ') || '—'})`);
  const above = [];
  for (let p = Flat ? Object.getPrototypeOf(Flat.prototype) : null; p; p = Object.getPrototypeOf(p)) for (const m of RULES) if (Object.prototype.hasOwnProperty.call(p, m)) above.push(m);
  const moduleLevel = RULES.filter(m => m in TG);
  assert(own.length === RULES.length && above.length === 0 && moduleLevel.length === 0,
    `G7b żadna baza / moduł nie definiuje reguły ogólnie (w bazie: ${above.join(',') || '—'}; eksport modułu: ${moduleLevel.join(',') || '—'})`);
  // Kod modułu POZA ciałem klasy FlatHexTileGraph: bez „< 6”, bez rzędów / wysokości siatki.
  const s = src('map/TileGraph.js');
  const start = s.indexOf('class FlatHexTileGraph');
  let outside = s, bodyLen = 0;
  if (start >= 0) {
    let i = s.indexOf('{', start), depth = 0, end = -1;
    for (; i < s.length; i++) { if (s[i] === '{') depth++; else if (s[i] === '}') { depth--; if (depth === 0) { end = i; break; } } }
    bodyLen = end - start;
    outside = s.slice(0, start) + s.slice(end + 1);
  }
  const FLAT_RULE = /length\s*<\s*6|\.height\b|r\s*===\s*0\b|tilePixelPos|gridPixelSize/g;
  const outHits = outside.match(FLAT_RULE) ?? [];
  const inHits = (start >= 0 ? s.slice(start, start + bodyLen) : '').match(FLAT_RULE) ?? [];
  assert(start >= 0 && outHits.length === 0 && inHits.length >= 4, `G7c poza klasą płaską brak reguły płaskiej siatki (trafień ${outHits.length}: ${outHits.join(' ')}); świadek: w klasie ${inHits.length} (≥4)`);
  // Opis interfejsu w nagłówku (komentarz) — isLandingEdge nazwany przez D-CS-9, bez liczby sąsiadów.
  const header = raw('map/TileGraph.js').split('\n').filter(l => /^\/\/\s+isLandingEdge\(/.test(l));
  assert(header.length === 1 && !/6|sąsiad|neighbo/i.test(header[0]) && /D-CS-9/.test(header[0]), `G7d nagłówek interfejsu: isLandingEdge bez reguły „< 6 sąsiadów”, z odesłaniem do D-CS-9 (${JSON.stringify(header[0] ?? null)})`);
}

// ── G8 ───────────────────────────────────────────────────────────────────────
console.log('\nG8 — piny źródła: dawne miejsca CS-2');
{
  const walk = (dir, out = []) => {
    for (const name of readdirSync(new URL(dir, ROOT))) {
      const rel = dir + name;
      if (statSync(new URL(rel, ROOT)).isDirectory()) { if (rel !== 'testing') walk(rel + '/', out); }
      else if (/\.(m?js)$/.test(name)) out.push(rel);
    }
    return out;
  };
  const files = walk('').filter(f => !f.startsWith('testing/') && !f.startsWith('lib/'));
  const GH = /\b_gridHeight\b/g;
  const ghHits = files.map(f => [f, (src(f).match(GH) ?? []).length]).filter(([, n]) => n > 0);
  const ghAllowed = { 'scenes/PlanetScene.js': 1 };   // martwa scena (nigdy nie otwierana) — martwy zapis → lista CS-Z
  const ghBad = ghHits.filter(([f, n]) => ghAllowed[f] !== n);
  assert(files.length > 300 && ghBad.length === 0 && ghHits.length === Object.keys(ghAllowed).length,
    `G8a _gridHeight w kodzie produkcyjnym (${files.length} plików): ${ghHits.map(([f, n]) => `${f}×${n}`).join(', ') || '—'} (dozwolone: PlanetScene ×1 — martwa scena, CS-Z)`);
  // tileR: żaden system nie czyta ani nie zapisuje rzędu pola w kolejce; _activateBuilding dostaje null w slocie _tileR.
  const sysFiles = files.filter(f => f.startsWith('systems/') || f.startsWith('utils/') || f === 'scenes/GameScene.js');
  const TILER = /\btileR\b/g;
  const trHits = sysFiles.map(f => [f, (src(f).match(TILER) ?? []).length]).filter(([, n]) => n > 0);
  assert(trHits.length === 0, `G8b tileR w systemach / utils / GameScene: ${trHits.map(([f, n]) => `${f}×${n}`).join(', ') || '—'}`);
  const calls = [];
  for (const f of files) {
    const s = src(f);
    let i = -1;
    while ((i = s.indexOf('_activateBuilding(', i + 1)) >= 0) {
      let j = i + '_activateBuilding('.length, depth = 1; const args = []; let cur = '';
      for (; j < s.length && depth > 0; j++) {
        const ch = s[j];
        if (ch === '(' || ch === '{' || ch === '[') depth++;
        if (ch === ')' || ch === '}' || ch === ']') depth--;
        if (depth === 0) break;
        if (ch === ',' && depth === 1) { args.push(cur.trim()); cur = ''; } else cur += ch;
      }
      args.push(cur.trim());
      calls.push([f, args]);
    }
  }
  const defs = calls.filter(([, a]) => a[2] === '_tileR');
  const realCalls = calls.filter(([, a]) => a[2] !== '_tileR');
  const badCalls = realCalls.filter(([, a]) => a[2] !== 'null');
  assert(defs.length === 1 && realCalls.length >= 5 && badCalls.length === 0,
    `G8c _activateBuilding: ${realCalls.length} wywołań, wszystkie z null w martwym slocie _tileR (złe: ${badCalls.map(([f, a]) => f + ':' + a[2]).join(', ') || '—'}); definicja ze slotem _tileR ×${defs.length}`);
  // Rachunek rzędów / krawędzi / pikseli w dawnych miejscach + wywołanie metody grafu.
  const SITES = [
    // [plik, zakazane (wzorzec dawnego kodu), wymagane (wzorzec nowego), min. wymaganych]
    ['systems/BuildingSystem.js', /HexGrid|getLatitudeModifier|\brows\s*-\s*[12]\b|\.r\s*===\s*[01]\b|polarPenalty\s*\(/g, /\.latitudeBand\(|score \+= aiPolarPenalty\(graph, tile\)|const score = aiPolarPenalty\(graph, tile\)/g, 3],
    ['systems/ColonyAutoExpander.js', /\brows\b|tile\.r\s*===|score\s*-=\s*[25]/g, /score \+= aiPolarPenalty\(graph, tile\)/g, 1],
    ['systems/EmpireColonyBootstrap.js', /_inferRows|totalRows|tile\.r\s*===|score\s*-=\s*[25]/g, /score \+= aiPolarPenalty\(graph, tile\)/g, 1],
    ['systems/RandomEventSystem.js', /height\s*\?\?\s*10|\.height\s*\)?\s*\/\s*2|Math\.floor\(\([^)]*height/g, /\.equatorTile\(\)/g, 1],
    ['systems/InvasionSystem.js', /_isEdgeHex|getNeighbors|length\s*<\s*6/g, /\.isLandingEdge\(tile\)/g, 1],
    ['systems/GroundUnitManager.js', /gridPixelSize|gridW\s*\*\s*0\.4|_facingLeft\s*=\s*dx/g, /\.stepDirection\(unit, nextHex\)/g, 1],
    ['systems/StrikeSquadronSystem.js', /garrisonAnchor\([^()]*\)\s*\?\?\s*\{\s*q:\s*0/g, /garrisonAnchor\([^;\n]*\)\s*\?\?\s*tileGraphOf\(capital\.grid\)\?\.anyTile\(\)/g, 1],
    ['ui/ColonyOverlay.js', /getLatitudeModifier|_gridHeight/g, /latitudeModifierOf\(graph\.latitudeBand\(tile\)\)/g, 1],
    ['scenes/GameScene.js', /gridSizes|_gridHeight|planetType\]\s*\?\?\s*10/g, /_calcBaseRates\(building, tile, plan\.level, tileGraphOf\(grid\)\)/g, 3],
    ['utils/ColonyGrid.js', /_gridHeight/g, /bSys\._grid = grid/g, 1],
    ['systems/ColonyManager.js', /_gridHeight/g, /_grid = (?:savedGrid|grid)/g, 3],
  ];
  for (const [rel, bad, good, min] of SITES) {
    const s = src(rel);
    const b = s.match(bad) ?? [], g = s.match(good) ?? [];
    assert(b.length === 0 && g.length >= min, `G8d ${rel}: dawny rachunek ${b.length}${b.length ? ' (' + b.slice(0, 3).join(' | ') + ')' : ''}, metoda grafu ${g.length} (≥${min})`);
  }
  // ColonyOverlay — otwarcie mapy wiąże siatkę bez lustra wysokości (to jest „po otwarciu mapy” w G9).
  {
    const s = src('ui/ColonyOverlay.js');
    assert(/bSys\._grid = colony\.grid;/.test(s), 'G8e ColonyOverlay przy otwarciu mapy: bSys._grid = colony.grid (krok symulowany w G9)');
  }
  // Świadkowie wzorców na próbce dawnego kodu (inaczej „0 trafień” to pusta zieleń).
  {
    const legacy = "this._gridHeight = grid.height ?? 10; const rows = grid.height ?? 10; if (r === 0 || r === rows - 1) return -5; const totalRows = grid.height ?? this._inferRows(grid);"
      + " if (tile.r === 0 || tile.r === totalRows - 1) score -= 5; const tileLike = realTile ?? { r: Math.floor((colony.grid?.height ?? 10) / 2) };"
      + " const isEdge = this._isEdgeHex(grid, tile); return neighbors.length < 6; const gridW = grid.gridPixelSize(1).w; if (Math.abs(dx) > gridW * 0.4) {}"
      + " const anchor = garrisonAnchor(capital.grid, !!capital.isOutpost) ?? { q: 0, r: 0 }; const gridSizes = { rocky: 10 }; HexGrid.getLatitudeModifier(tile.r, grid.height);"
      + " this._activateBuilding(bestKey, buildingId, bestTile.r, bestTile.type, isCapital); entry.tileR;";
    const hits = SITES.map(([, bad]) => (legacy.match(bad) ?? []).length);
    const ghW = (legacy.match(GH) ?? []).length, trW = (legacy.match(TILER) ?? []).length;
    assert(hits.every(h => h > 0) && ghW === 1 && trW === 1, `G8f świadek wzorców na próbce dawnego kodu: ${hits.join('/')} · _gridHeight ${ghW} · tileR ${trW}`);
  }
}

// ── G9 ───────────────────────────────────────────────────────────────────────
console.log('\nG9 — Finding 779: okno po wczytaniu (mapa kolonii nie otwarta) = po otwarciu = świeża gra');
const core = new GameCore();
quiet(() => core.boot({ quiet: true, scenario: 'civilization' }));
const K = window.KOSMOS, cm = K.colonyManager;
// Kolonia świeżej gry (siatka związana od założenia) — przed wczytaniem, bo restore dokłada kolonie.
const fresh = cm.getAllColonies().find(c => c.grid && c.buildingSystem?._grid === c.grid && !c.isOutpost);
// Encje ciał z fixture (id kolizyjne z bootem — podmienione), potem PRAWDZIWY ColonyManager.restore.
const want = new Set(FX.civ4x.colonies.map(c => c.planetId));
for (const b of [...FX.planets, ...FX.moons, ...FX.planetoids]) if (want.has(b.id)) { if (EntityManager.get(b.id)) EntityManager.remove(b.id); EntityManager.add({ ...b }); }
let restoreErr = null;
quiet(() => { try { cm.restore({ colonies: FX.civ4x.colonies }); } catch (e) { restoreErr = e; } });
const loaded = FX.civ4x.colonies.map(c => cm.getColony(c.planetId)).filter(Boolean);
const windowOpen = loaded.filter(c => c.grid && c.buildingSystem && c.buildingSystem._grid == null);
assert(!restoreErr && loaded.length === 22 && windowOpen.length === 22 && !!fresh,
  `G9a świadek stanu: restore ${restoreErr ? 'BŁĄD ' + restoreErr.message : 'OK'}, kolonii ${loaded.length}/22, w oknie (siatka kolonii jest, BuildingSystem._grid = null) ${windowOpen.length}, kolonia świeżej gry ${fresh?.planetId ?? '—'}`);
const RS = BUILDINGS.research_station, RATE = RS.rates.research;
const openMap = (col) => bindGrid(col.buildingSystem, col.grid);   // ColonyOverlay :579 (G8e)
const prodOf = (col) => {
  const bs = col.buildingSystem, out = new Map();
  for (const t of col.grid.toArray()) out.set(keyOf(t), bs._calcBaseRates(RS, t, 1).research);
  return out;
};
// Koszt budowy przez PRAWDZIWE _build: zakup „nie stać” → zamówienie w kolejce oczekujących niesie policzony koszt;
// po odczycie zamówienie jest zdejmowane (pole wraca do stanu sprzed).
const buildCost = (col, tile) => {
  const bs = col.buildingSystem, rs = bs.resourceSystem;
  const store = K.systemPoolService?.getStore?.(rs) ?? rs;
  const prevCa = store.canAfford; store.canAfford = () => false;
  const had = bs._pendingQueue.has(tile.key);
  let reason = null; const onRes = (e) => { if (e?.tile === tile && e.success === false) reason = e.reason; };
  EventBus.on('planet:buildResult', onRes);
  try { bs._build(tile, RS.id); } finally { store.canAfford = prevCa; EventBus.off('planet:buildResult', onRes); }
  if (had) return { refused: 'pre-existing order' };
  const order = bs._pendingQueue.get(tile.key);
  if (order) { bs._pendingQueue.delete(tile.key); tile.pendingBuild = null; }
  return order?.cost ?? { refused: reason };
};
const sameCost = (a, b) => !!a && !!b && JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const expectedCost = (col, tile) => {   // dawna reguła: modyfikator pasa z PRAWDZIWEJ wysokości siatki (stan nowej gry)
  const bs = col.buildingSystem, planet = bs._resolveOwnPlanet();
  const c = { ...computeBuildResourceCost(RS, planet, legacyLat(tile.r, col.grid.height).buildCost), ...computeBuildCommodityCost(RS, planet) };
  if (bs._isPlanetExtreme() && (RS.jobs ?? 0) > 0 && !RS.isAutonomous) c.Si = (c.Si || 0) + 5;
  return c;
};
const pickTiles = (col) => {   // po jednym wolnym polu na pas, na którym research_station przechodzi bramkę terenu
  const planet = col.buildingSystem._resolveOwnPlanet(), H = col.grid.height, by = {};
  for (const t of col.grid.toArray()) {
    if (t.buildingId || t.capitalBase || t.underConstruction || t.pendingBuild || t.isOccupied || t.anomalyEffect) continue;
    if (col.buildingSystem._pendingQueue.has(t.key) || col.buildingSystem._constructionQueue.has(t.key)) continue;
    if (!evaluatePlacement(t, RS, { techSystem: col.buildingSystem.techSystem, planet }).ok) continue;
    const band = legacyLat(t.r, H).production;
    if (!(band in by)) by[band] = t;
  }
  return by;
};
{
  const CHECK = ['entity_2', 'entity_115', 'entity_117', 'entity_116', 'entity_208'];   // aktywna gracza (16 rzędów), 12, 14, AI 16, placówka 6
  const PLAYER_ACTIVE = FX.civ4x.activePlanetId;
  let tiles = 0, badWin = 0, badLegacy = 0, polarTiles = 0, costChecks = 0, badCost = 0, badActivate = 0, activations = 0;
  const notes = [];
  for (const pid of CHECK) {
    const col = cm.getColony(pid);
    if (!col) { notes.push(`${pid}: brak`); continue; }
    const H = col.grid.height;
    // okno: mapa nie otwarta
    const win = prodOf(col);
    const tilesBy = col.isOutpost ? {} : pickTiles(col);
    const costWin = Object.fromEntries(Object.entries(tilesBy).map(([band, t]) => [band, buildCost(col, t)]));
    // dokończenie budowy z kolejki w oknie: _activateBuilding ze STARYM rzędem 0 (biegun) w slocie tileR
    const actTile = Object.values(tilesBy).find(t => legacyLat(t.r, H).production === 1);
    let actWin = null;
    if (actTile) {
      col.buildingSystem._activateBuilding(actTile.key, RS.id, 0, actTile.type, false);
      actWin = col.buildingSystem._active.get(actTile.key)?.baseRates?.research ?? null;
      col.buildingSystem._active.delete(actTile.key); col.buildingSystem.resourceSystem?.removeProducer?.(`building_${actTile.key}`);
      actTile.buildingId = null; actTile.buildingLevel = 1;
    }
    // po otwarciu mapy
    openMap(col);
    const bound = prodOf(col);
    const costBound = Object.fromEntries(Object.entries(tilesBy).map(([band, t]) => [band, buildCost(col, t)]));
    if (actTile) {
      col.buildingSystem._activateBuilding(actTile.key, RS.id, null, actTile.type, false);
      const actBound = col.buildingSystem._active.get(actTile.key)?.baseRates?.research ?? null;
      activations++;
      if (actWin !== actBound || actBound !== RATE) badActivate++;
      col.buildingSystem._active.delete(actTile.key); col.buildingSystem.resourceSystem?.removeProducer?.(`building_${actTile.key}`);
    }
    for (const t of col.grid.toArray()) {
      tiles++;
      const k = keyOf(t);
      if (win.get(k) !== bound.get(k)) badWin++;
      if (!t.anomalyEffect) {
        const want = RATE * legacyLat(t.r, H).production;
        if (want < RATE) polarTiles++;
        if (win.get(k) !== want) badLegacy++;
      }
    }
    for (const [band, t] of Object.entries(tilesBy)) {
      costChecks++;
      const exp = expectedCost(col, t);
      if (!sameCost(costWin[band], costBound[band]) || !sameCost(costWin[band], exp)) { badCost++; if (notes.length < 4) notes.push(`${pid} r${t.r}/${H}: okno ${JSON.stringify(costWin[band])} mapa ${JSON.stringify(costBound[band])} oczek. ${JSON.stringify(exp)}`); }
    }
    if (pid === PLAYER_ACTIVE) notes.unshift(`aktywna ${pid}: ${H} rzędów, pasy z kosztem ${Object.keys(tilesBy).join('/')}`);
  }
  assert(badWin === 0 && tiles > 0, `G9b produkcja research_station w oknie = po otwarciu mapy na ${tiles} polach 5 kolonii (różnic ${badWin})`);
  assert(badLegacy === 0 && polarTiles > 0, `G9c = dawna reguła z prawdziwą wysokością siatki (stan nowej gry) (różnic ${badLegacy}; pól z karą ${polarTiles})`);
  assert(badCost === 0 && costChecks >= 9, `G9d koszt budowy (_build) w oknie = po otwarciu = dawna reguła, ${costChecks} pól × pasy (różnic ${badCost})${notes.length ? ' — ' + notes.join(' | ') : ''}`);
  assert(badActivate === 0 && activations >= 4, `G9e dokończenie budowy z kolejki w oknie ze starym tileR = 0 (biegun) na polu równikowym → stawki równikowe = po otwarciu (${activations} kolonii, różnic ${badActivate})`);
  // Kolonia świeżej gry: ta sama reguła (produkcja i koszt na polu każdego pasa).
  let fTiles = 0, fBad = 0, fCost = 0, fCostBad = 0;
  for (const t of fresh.grid.toArray()) {
    if (t.anomalyEffect) continue;
    fTiles++;
    if (fresh.buildingSystem._calcBaseRates(RS, t, 1).research !== RATE * legacyLat(t.r, fresh.grid.height).production) fBad++;
  }
  for (const t of Object.values(pickTiles(fresh))) { fCost++; if (!sameCost(buildCost(fresh, t), expectedCost(fresh, t))) fCostBad++; }
  assert(fBad === 0 && fCostBad === 0 && fTiles > 0 && fCost >= 2, `G9f kolonia świeżej gry ${fresh.planetId}: produkcja (${fTiles} pól) i koszt (${fCost} pasy) wg tej samej reguły (różnic ${fBad} / ${fCostBad})`);
}

// ── G10 ──────────────────────────────────────────────────────────────────────
console.log('\nG10 — zapis: tileR nie jest zapisywane, a ze starego zapisu ignorowane');
{
  const withTileR = FX.civ4x.colonies.reduce((s, c) => s + (c.pendingQueue ?? []).filter(o => 'tileR' in o).length, 0);
  const restoredPending = windowOpen.flatMap(c => [...c.buildingSystem._pendingQueue.values()]);
  const leaked = restoredPending.filter(o => 'tileR' in o).length;
  assert(withTileR > 0 && restoredPending.length >= withTileR && leaked === 0,
    `G10a stary zapis: ${withTileR} zamówień oczekujących z tileR w fixture → po restore ${restoredPending.length} zamówień, z tileR ${leaked}`);
  const bs = new BuildingSystem(null, null, null);
  bs.restoreQueue([{ tileKey: '3,1', buildingId: 'research_station', progress: 0.5, buildTime: 1, tileR: 0, tileType: 'plains' }]);
  bs.restorePendingQueue([{ tileKey: '4,2', buildingId: 'research_station', cost: {}, tileR: 0, tileType: 'plains' }]);
  const q = bs._constructionQueue.get('3,1'), p = bs._pendingQueue.get('4,2');
  const out = JSON.stringify([bs.serializeQueue(), bs.serializePendingQueue()]);
  assert(!!q && !!p && !('tileR' in q) && !('tileR' in p) && !/tileR/.test(out) && /3,1/.test(out) && /4,2/.test(out),
    `G10b restoreQueue / restorePendingQueue gubią tileR, serializeQueue / serializePendingQueue go nie piszą (${out.length} B, świadek: oba klucze w zapisie)`);
  bs.dispose?.();
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
