// ═══════════════════════════════════════════════════════════
// KEEPER — COLONY SPHERE CS-1a: TileGraph + FlatHexTileGraph (refaktor bit w bit)
// Uruchom: node src/testing/smoke/colony_sphere_tilegraph_smoke.mjs
// ───────────────────────────────────────────────────────────
// T1  Równoważność: FlatHexTileGraph vs dawne helpery na KAŻDYM polu każdej klasy rozmiaru płaskiej
//     siatki (rocky floor/1M⊕/cap, ice floor/cap, hot_rocky, gas, moon, planetoid, largestHexMaps):
//     kolejność iteracji, tile(id|pole|klucz z prefiksem), idOf / parseKey / formatKey,
//     neighbors (z szwem i bez — dawna pętla odwrotu CombatSystem), distance dla WSZYSTKICH par
//     (HexGrid.distance + trzy dawne kopie wzoru: GroundUnitManager, CombatSystem, Supply),
//     within = spiral, ring = ring.
// T2  A*: graph.path i GroundUnitManager._aStar == zamrożona kopia dawnego _aStar (HEAD a36ad12),
//     te same kroki, ta sama kolejność, te same null — źródła × cele na każdej siatce, z oceanem.
//     KONTROLA: zamrożona kopia == _aStar na bazie (zielona po obu stronach).
// T3  Piny źródła: każdy przeniesiony plik importuje TileGraph i nie ma dawnego dostępu do siatki
//     (grid.get / getNeighbors / spiral / ring / forEach / toArray, split(',') kluczy pól, własne
//     wzory odległości, sklejanie kluczy "q,r") — poza jawnie wymienionymi regułami CS-2 (świadek).
// ═══════════════════════════════════════════════════════════

import '../headless/env.js'; // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { HexGrid, HEX_DIRECTIONS } from '../../map/HexGrid.js';
import { PlanetMapGenerator } from '../../map/PlanetMapGenerator.js';
import { GROUND_MOVE_COST } from '../../data/GroundUnitData.js';
import { GroundUnitManager } from '../../systems/GroundUnitManager.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// TileGraph przez dynamiczny import — na bazie (przed CS-1a) modułu nie ma: piny degradują, nie przerywają.
let TG = null, tgErr = null;
try { TG = await import('../../map/TileGraph.js'); } catch (e) { tgErr = e?.message ?? String(e); }

// ── Dawne helpery (zamrożone z HEAD a36ad12) ─────────────────────────────────
const MOVE_COST = GROUND_MOVE_COST;
function legacyAStar(grid, startQ, startR, goalQ, goalR) {   // GroundUnitManager._aStar + _reconstructPath
  const startKey = `${startQ},${startR}`;
  const goalKey  = `${goalQ},${goalR}`;
  const open = [{ q: startQ, r: startR, f: 0 }];
  const gScore = new Map(); const cameFrom = new Map();
  gScore.set(startKey, 0);
  const heuristic = (q, r) => HexGrid.distance(q, r, goalQ, goalR);
  let iterations = 0;
  while (open.length > 0 && iterations++ < 2000) {
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bestIdx].f) bestIdx = i;
    const current = open.splice(bestIdx, 1)[0];
    const curKey = `${current.q},${current.r}`;
    if (curKey === goalKey) {
      const path = []; let c = goalKey;
      while (cameFrom.has(c)) { const [q, r] = c.split(',').map(Number); path.unshift({ q, r }); c = cameFrom.get(c); }
      return path;
    }
    for (const neighbor of grid.getNeighbors(current.q, current.r)) {
      const terrainCost = MOVE_COST[neighbor.type] ?? 1;
      if (terrainCost === Infinity) continue;
      const nKey = `${neighbor.q},${neighbor.r}`;
      const tentativeG = (gScore.get(curKey) ?? Infinity) + 1;
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, curKey); gScore.set(nKey, tentativeG);
        const f = tentativeG + heuristic(neighbor.q, neighbor.r);
        const existing = open.find(n => `${n.q},${n.r}` === nKey);
        if (existing) existing.f = f; else open.push({ q: neighbor.q, r: neighbor.r, f });
      }
    }
  }
  return null;
}
const gumDist    = (q1, r1, q2, r2) => { const s1 = -q1 - r1, s2 = -q2 - r2; return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(s1 - s2)) / 2; };
const supplyDist = (q1, r1, q2, r2) => { const dq = q1 - q2, dr = r1 - r2; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; };
const legacyRetreatNeighbors = (grid, q, r) => {   // CombatSystem._tryRetreat: 6 kierunków bez zawijania
  const DIRS = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }];
  const out = []; for (const d of DIRS) { const t = grid.get(q + d.q, r + d.r); if (t) out.push(t); } return out;
};
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
const samePath = (a, b) => (a === null && b === null) || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((s, i) => s.q === b[i].q && s.r === b[i].r));

// ── Siatki: każda klasa rozmiaru ─────────────────────────────────────────────
const BODIES = [
  ['rocky floor (m=0.4)', { id: 'cs1a_rocky_s', type: 'planet', planetType: 'rocky', physics: { mass: 0.4 } }],
  ['rocky 1M⊕',            { id: 'cs1a_rocky_1', type: 'planet', planetType: 'rocky', physics: { mass: 1 } }],
  ['rocky cap (m=4)',      { id: 'cs1a_rocky_c', type: 'planet', planetType: 'rocky', physics: { mass: 4 } }],
  ['ice floor (m=0.5)',    { id: 'cs1a_ice_s',   type: 'planet', planetType: 'ice',   physics: { mass: 0.5 } }],
  ['ice cap (m=4)',        { id: 'cs1a_ice_c',   type: 'planet', planetType: 'ice',   physics: { mass: 4 } }],
  ['hot_rocky',            { id: 'cs1a_hot',     type: 'planet', planetType: 'hot_rocky', physics: { mass: 1 } }],
  ['gas',                  { id: 'cs1a_gas',     type: 'planet', planetType: 'gas',   physics: { mass: 100 } }],
  ['moon',                 { id: 'cs1a_moon',    type: 'moon',   planetType: 'rocky', physics: { mass: 0.01 } }],
  ['planetoid',            { id: 'cs1a_pl',      type: 'planetoid', planetType: 'rocky', physics: { mass: 0.001 } }],
];
const grids = [];
const quiet = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };
for (const [label, body] of BODIES) grids.push([label, quiet(() => PlanetMapGenerator.generate(body, false))]);
{
  const prev = GAME_CONFIG.FEATURES.largestHexMaps;
  GAME_CONFIG.FEATURES.largestHexMaps = true;
  try { grids.push(['rocky largestHexMaps (m=4)', quiet(() => PlanetMapGenerator.generate({ id: 'cs1a_rocky_L', type: 'planet', planetType: 'rocky', physics: { mass: 4 } }, false))]); }
  finally { GAME_CONFIG.FEATURES.largestHexMaps = prev; }
}
// Ocean deterministycznie (blokady A*), ponad wygenerowany teren
for (const [, g] of grids) g.toArray().forEach((t, i) => { if ((i * 7) % 11 === 0) t.type = 'ocean'; });
const sizes = grids.map(([l, g]) => `${l}: ${g.width}×${g.height}=${g.toArray().length}`);
console.log('Siatki: ' + sizes.join(' · '));
assert(new Set(grids.map(([, g]) => g.toArray().length)).size >= 8, `T0 świadek: ≥8 różnych liczności siatek (${grids.map(([, g]) => g.toArray().length).join('/')})`);

// ── T1 ───────────────────────────────────────────────────────────────────────
console.log('\nT1 — równoważność FlatHexTileGraph z dawnymi helperami (każde pole, każda klasa)');
if (!TG) {
  assert(false, `T1 moduł src/map/TileGraph.js istnieje (${tgErr})`);
} else {
  const { tileGraphOf, parseTileKey, formatTileKey, samePos, DETACHED_FLAT_GRAPH, TILE_KEY_PREFIXES, isCapitalKey } = TG;
  // Prefiksy dosłownie (nie z modułu — inaczej mutacja listy w module wyłączyłaby własny test).
  const PREFIXES_LITERAL = ['capital_', 'building_'];
  assert(Array.isArray(TILE_KEY_PREFIXES) && PREFIXES_LITERAL.every(p => TILE_KEY_PREFIXES.includes(p)) && TILE_KEY_PREFIXES.length === 2,
    `T1c' TILE_KEY_PREFIXES = capital_ + building_ (${JSON.stringify(TILE_KEY_PREFIXES)})`);
  assert(isCapitalKey('capital_3,4') && !isCapitalKey('3,4') && !isCapitalKey('building_3,4') && !isCapitalKey('x_capital_3,4'),
    "T1c'' isCapitalKey = startsWith('capital_')");
  let tiles = 0, pairs = 0;
  const bad = { order: 0, tile: 0, key: 0, nb: 0, nbNoSeam: 0, dist: 0, within: 0, ring: 0, legacyParse: 0 };
  let seamDiff = 0;   // świadek: z szwem ≠ bez szwu na jakimś polu (inaczej test crossSeam jest pusty)
  for (const [, grid] of grids) {
    const g = tileGraphOf(grid);
    const legacy = grid.toArray();
    const mine = g.tiles();
    if (!sameList(mine, legacy)) bad.order++;
    const fe = []; g.forEachTile(t => fe.push(t)); if (!sameList(fe, legacy)) bad.order++;
    if (g.anyTile() !== legacy[0]) bad.order++;
    for (const t of legacy) {
      tiles++;
      const id = g.idOf(t);
      if (id !== t.key) bad.key++;
      if (g.tile(id) !== grid.get(t.q, t.r) || g.tile(t) !== t || g.tile({ q: t.q, r: t.r }) !== t) bad.tile++;
      for (const p of PREFIXES_LITERAL) {
        const k = g.formatKey(t, p);
        const pk = g.parseKey(k);
        if (k !== p + t.key || pk.prefix !== p || pk.id !== id || formatTileKey(id, p) !== k) bad.key++;
        // klucz z prefiksem → brak pola, tak jak dawne split(',').map(Number) i parseInt
        const lp = k.split(',');
        if (g.tile(k) !== grid.get(...k.split(',').map(Number)) || g.tile(k) !== grid.get(parseInt(lp[0], 10), parseInt(lp[1], 10))) bad.legacyParse++;
      }
      if (parseTileKey(id).prefix !== '' || parseTileKey(id).id !== id) bad.key++;
      if (!sameList(g.neighbors(id), grid.getNeighbors(t.q, t.r)) || !sameList(g.neighbors(t), grid.getNeighbors(t.q, t.r))) bad.nb++;
      const ns = g.neighbors(t, { crossSeam: false });
      if (!sameList(ns, legacyRetreatNeighbors(grid, t.q, t.r))) bad.nbNoSeam++;
      if (!sameList(ns, grid.getNeighbors(t.q, t.r))) seamDiff++;
      for (const k of [0, 1, 2, 3, 15]) if (!sameList(g.within(t, k), grid.spiral(t.q, t.r, k))) bad.within++;
      for (const k of [1, 2, 3]) if (!sameList(g.ring(id, k), grid.ring(t.q, t.r, k))) bad.ring++;
      for (const u of legacy) {
        pairs++;
        const d = g.distance(t, u);
        if (d !== HexGrid.distance(t.q, t.r, u.q, u.r) || d !== gumDist(t.q, t.r, u.q, u.r) || d !== supplyDist(t.q, t.r, u.q, u.r)
            || d !== g.distance(id, g.idOf(u)) || d !== DETACHED_FLAT_GRAPH.distance(t, u)) bad.dist++;
      }
      if (!samePos(t, { q: t.q, r: t.r }) || samePos(t, { q: t.q + 1, r: t.r }) || samePos(t, { q: t.q, r: t.r + 1 })) bad.tile++;
    }
  }
  console.log(`  (${tiles} pól, ${pairs} par odległości, pola różniące się szwem: ${seamDiff})`);
  assert(bad.order === 0, `T1a kolejność iteracji tiles()/forEachTile()/anyTile() = toArray/forEach (błędy: ${bad.order})`);
  assert(bad.tile === 0, `T1b tile(id | pole | {q,r}) = grid.get(q,r); samePos (błędy: ${bad.tile})`);
  assert(bad.key === 0, `T1c idOf = tile.key; parseKey/formatKey w obie strony dla '' / capital_ / building_ (błędy: ${bad.key})`);
  assert(bad.legacyParse === 0, `T1d klucz z prefiksem w tile() → to samo co dawne split(',').map(Number) i parseInt (błędy: ${bad.legacyParse})`);
  assert(bad.nb === 0, `T1e neighbors() = getNeighbors (te same obiekty, ta sama kolejność, z szwem) (błędy: ${bad.nb})`);
  assert(bad.nbNoSeam === 0, `T1f neighbors({crossSeam:false}) = dawna pętla odwrotu CombatSystem (błędy: ${bad.nbNoSeam})`);
  assert(seamDiff > 0, `T1f świadek: szew faktycznie zmienia listę sąsiadów na ${seamDiff} polach`);
  assert(bad.dist === 0, `T1g distance() = HexGrid.distance = kopie GUM/Combat/Supply dla wszystkich ${pairs} par (błędy: ${bad.dist})`);
  assert(bad.within === 0, `T1h within(k) = spiral(k) dla k ∈ {0,1,2,3,15} (błędy: ${bad.within})`);
  assert(bad.ring === 0, `T1i ring(k) = ring(k) dla k ∈ {1,2,3} (błędy: ${bad.ring})`);
  assert(tileGraphOf(null) === null && tileGraphOf(undefined) === null, 'T1j tileGraphOf(null/undefined) → null (jak grid?.…)');
  assert(tileGraphOf(grids[0][1]) === tileGraphOf(grids[0][1]), 'T1k graf buforowany per instancja siatki');
}

// ── T2 ───────────────────────────────────────────────────────────────────────
console.log('\nT2 — A*: graph.path i GroundUnitManager._aStar = zamrożony dawny _aStar');
{
  const gumAStar = (grid, a, b) => GroundUnitManager.prototype._aStar.call(GroundUnitManager.prototype, grid, a.q, a.r, b.q, b.r);
  let runs = 0, nulls = 0, badGum = 0, badPath = 0, longest = 0;
  const passable = (tile) => (MOVE_COST[tile.type] ?? 1) !== Infinity;
  for (const [, grid] of grids) {
    const all = grid.toArray();
    const targets = [0, 0.17, 0.33, 0.5, 0.71, 0.93].map(f => all[Math.floor(f * (all.length - 1))]);
    const g = TG ? TG.tileGraphOf(grid) : null;
    for (const s of all) {
      for (const t of targets) {
        runs++;
        const ref = legacyAStar(grid, s.q, s.r, t.q, t.r);
        if (ref === null) nulls++; else longest = Math.max(longest, ref.length);
        if (!samePath(gumAStar(grid, s, t), ref)) badGum++;
        if (g && !samePath(g.path(s, t, { passable, maxIterations: 2000 }), ref)) badPath++;
      }
    }
  }
  console.log(`  (${runs} wyszukań, ${nulls} bez ścieżki, najdłuższa ${longest} kroków)`);
  assert(nulls > 0 && longest >= 10, `T2 świadek: są ścieżki zablokowane (${nulls}) i długie (${longest})`);
  assert(badGum === 0, `T2a KONTROLA/CEL GroundUnitManager._aStar = zamrożona kopia (błędy: ${badGum})`);
  if (TG) assert(badPath === 0, `T2b graph.path = zamrożona kopia (błędy: ${badPath})`);
  else assert(false, 'T2b graph.path istnieje (brak TileGraph)');
}

// ── T3 ───────────────────────────────────────────────────────────────────────
console.log('\nT3 — piny źródła: przeniesione miejsca wołają TileGraph');
const ROOT = new URL('../../', import.meta.url);
const src = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
// Dawny dostęp do siatki (wywołanie metody HexGrid na zmiennej siatki).
const RAW_GRID = /\b(?:_grid|grid)\??\.(?:get|getNeighbors|spiral|ring|forEach|toArray)\??\.?\(/g;
const RAW_SPLIT = /\.split\(','\)/g;
const RAW_DIST = /Math\.abs\(\s*(?:q1|dq)\s*-?\s*(?:q2)?\s*\)\s*\+\s*Math\.abs/g;
const RAW_KEYFMT = /[^(]`\$\{[\w.?]+\.q\},\$\{[\w.?]+\.r\}`|`(?:building|capital)_\$\{|startsWith\('(?:capital|building)_'\)/g;
const SITES = [
  // [plik, min. wywołań TileGraph, dozwolone dawne wywołania (reguły CS-2 / strażniki) z uzasadnieniem]
  ['systems/BuildingSystem.js',        20, []],
  ['systems/GroundUnitManager.js',     20, []],
  ['systems/CombatSystem.js',           3, []],
  ['systems/ArmySystem.js',             5, []],
  ['systems/InvasionSystem.js',         3, [['grid.getNeighbors(', 1, '_isEdgeHex — CS-2 isLandingEdge']]],
  ['utils/GarrisonPlanner.js',          3, []],
  ['systems/SupplyCoverageSystem.js',   5, []],
  ['systems/ColonyAutoExpander.js',     6, []],
  ['systems/EmpireColonyBootstrap.js',  4, []],
  ['systems/WithdrawalSystem.js',       1, []],
  ['utils/TileOwnership.js',            2, []],
  ['systems/AnomalyEffectSystem.js',    1, []],
  ['systems/ResourceSystem.js',         1, []],
  ['systems/ImpactDamageSystem.js',     1, []],
  ['systems/RandomEventSystem.js',      3, []],
  ['utils/ColonyGrid.js',               5, []],
  ['systems/VesselManager.js',          1, []],
  ['systems/ColonyManager.js',          3, []],
];
const TG_CALL = /\b(?:tileGraphOf|parseTileKey|formatTileKey|samePos|DETACHED_FLAT_GRAPH)\b|\bgraph\.(?:tile|tiles|idOf|neighbors|distance|within|ring|path|forEachTile|parseKey|formatKey)\(|_graphFor\(/g;
for (const [rel, minCalls, allowed] of SITES) {
  let s;
  try { s = src(rel); } catch (e) { assert(false, `T3 ${rel} czytelny (${e.message})`); continue; }
  const imports = /from '\.\.\/map\/TileGraph\.js'/.test(s);
  const calls = (s.match(TG_CALL) ?? []).length;
  const raw = (s.match(RAW_GRID) ?? []);
  const allowedLeft = [...raw];
  for (const [needle, n] of allowed) {
    let k = 0;
    for (let i = allowedLeft.length - 1; i >= 0; i--) if (allowedLeft[i].startsWith(needle.replace('(', '')) && k < n) { allowedLeft.splice(i, 1); k++; }
  }
  const splits = (s.match(RAW_SPLIT) ?? []).length;
  const dists = (s.match(RAW_DIST) ?? []).length;
  const keyfmt = (s.match(RAW_KEYFMT) ?? []).length;
  assert(imports && calls >= minCalls && allowedLeft.length === 0 && splits === 0 && dists === 0 && keyfmt === 0,
    `T3 ${rel}: import TileGraph=${imports}, wywołań=${calls} (≥${minCalls}), dawny dostęp=${allowedLeft.length}${allowed.length ? ` (+${raw.length - allowedLeft.length} dozwolone: ${allowed.map(a => a[2]).join('; ')})` : ''}, split(',')=${splits}, wzór odległości=${dists}, klucz "q,r"=${keyfmt}`);
}
// Świadkowie wzorców: każdy regex łapie dawny kod (inaczej „0 trafień” jest pustą zielenią).
{
  const legacySample = "const [q, r] = tileKey.split(',').map(Number);\n const t = this._grid?.get(q, r); grid.getNeighbors(q, r); grid.spiral(q, r, 3); grid.toArray?.(); grid.forEach(t => t);\n return (Math.abs(q1 - q2) + Math.abs(r1 - r2)); const k = `${tile.q},${tile.r}`; const p = `building_${key}`; const c = `capital_${key}`; key.startsWith('capital_');";
  const hits = [RAW_GRID, RAW_SPLIT, RAW_DIST, RAW_KEYFMT].map(re => (legacySample.match(re) ?? []).length);
  assert(hits[0] === 5 && hits[1] === 1 && hits[2] === 1 && hits[3] === 4, `T3 świadek wzorców na próbce dawnego kodu: grid=${hits[0]}/5, split=${hits[1]}/1, odległość=${hits[2]}/1, klucz/prefiks=${hits[3]}/4`);
}

console.log(`\n=== colony_sphere_tilegraph_smoke: ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
