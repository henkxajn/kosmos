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
// ── CS-1b ──
// T4  Piny źródła miejsc UI / renderer / generator / narzędzia testów: dokładne liczby dozwolonych
//     trafień dawnego kodu z uzasadnieniem (geometria 2D mapy → CS-7/CS-8, CS-2, CS-5, legacy).
// T5  Finding 765: żadna klasa src/ui nie definiuje metody dwa razy (ColonyOverlay._hexDist ×2).
// T6  SpawnTestEnemy BFS sąsiadów (neighbors bez szwu) = zamrożony dawny BFS po HEX_DIRECTIONS.
// T7  KONTROLA: odcisk wyjścia PlanetMapGenerator (10 siatek) = HEAD 003cb3f.
//     Finding 764 (ActionCatalog) — osobny keeper z bootem gry: action_catalog_tile_lookup_smoke.
// ═══════════════════════════════════════════════════════════

import '../headless/env.js'; // MUSI być pierwszy
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
// CS-1b T7 — odcisk wyjścia generatora (PlanetMapGenerator przeszedł na TileGraph) PRZED nałożeniem oceanu.
const GEN_PRINT = createHash('sha256').update(grids.map(([l, g]) => l + ':' + g.toArray()
  .map(t => `${t.q},${t.r},${t.type},${t.strategicResource},${t.anomaly},${t.explored}`).join(';')).join('|')).digest('hex');
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

// ── T4 (CS-1b) ───────────────────────────────────────────────────────────────
// Piny źródła dla miejsc CS-1b (UI / renderer / generator / narzędzia testów). Każda kategoria dawnego
// kodu ma DOKŁADNĄ liczbę dozwolonych trafień z uzasadnieniem (reguła CS-2, geometria 2D mapy
// wymieniana w CS-7/CS-8, format CS-5, martwy legacy) — więcej = nowy surowy kod, mniej = nieaktualny
// wyjątek (keeper trzeba świadomie poprawić).
console.log('\nT4 — piny źródła CS-1b: UI / renderer / generator / narzędzia testów');
// Usuwanie komentarzy skanerem znaków (świadomy napisów '"`): regexowe `src()` traktuje „/*” wewnątrz
// komentarza liniowego (np. „src/core/*”) jako początek bloku i zjada importy aż do najbliższego „*/”.
const stripComments = (text) => {
  let out = '', i = 0, q = null;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (q) { out += c; if (c === '\\') { out += n ?? ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? text.length : e + 2; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    out += c; i++;
  }
  return out;
};
const srcB = (rel) => stripComments(readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n'));
{
  const w = stripComments("a = 1; // src/core/* x\nimport { tileGraphOf } from '../map/TileGraph.js';\nb = 'http://x/*y'; /* blok // */ c = `${u.q}`; // */\n");
  assert(w.includes("from '../map/TileGraph.js'") && w.includes("'http://x/*y'") && !w.includes('blok') && w.includes('c = `${u.q}`') && !w.includes('src/core'),
    'T4 świadek skanera komentarzy: „/*” w komentarzu liniowym nie zjada importu; napisy nietknięte');
}
const B_PATTERNS = {
  grid:   /\b(?:_grid|grid)\??\.(?:get|getNeighbors|spiral|ring|forEach|toArray|filter|getByKey)\??\.?\(/g,
  dead:   /\.(?:getByKey|_map)\b/g,                                   // #764 — akcesory, których HexGrid nie ma
  split:  RAW_SPLIT,
  dist:   RAW_DIST,
  hexDist: /\b_hexDist\s*\(|\bHexGrid\.distance\(/g,                   // #765 + statyczna odległość poza grafem
  qr:     /\$\{[\w.?]+\.q\},\s?\$\{[\w.?]+\.r\}/g,                     // sklejenie "q,r" (klucz albo tekst)
  qrEq:   /\.q\s*===\s*[\w.?[\]]+\.q\s*&&\s*[\w.?[\]]*\.r\s*===/g,      // ręczne porównanie pozycji
  prefix: /startsWith\('(?:capital|building)_'\)|`(?:building|capital)_\$\{|'(?:building|capital)_'\.length/g,
  dirs:   /\bHEX_DIRECTIONS\b/g,
};
const TG_CALL_B = /\b(?:tileGraphOf|parseTileKey|formatTileKey|isCapitalKey|samePos|DETACHED_FLAT_GRAPH|BUILDING_PREFIX|CAPITAL_PREFIX)\b|\bgraph\.(?:tile|tiles|idOf|neighbors|distance|within|ring|path|forEachTile|parseKey|formatKey)\(|_graphFor\(|_tileGraph\(/g;
const SITES_B = [
  // [plik, min. wywołań TileGraph (bez linii import), wymaga importu, {kategoria: [n, uzasadnienie]}]
  ['ui/ColonyOverlay.js', 25, true, {
    grid: [6, 'mapa 2D (CS-7/CS-8 wymienia): forEach ×4 — _findBestTileForCapital, _centerOnCapital, _drawMap, _applyBiomeMap (#761); get ×2 — przejścia/granice wg indeksu kierunku'],
    dirs: [3, 'import + _drawHex/_drawBorders: indeks krawędzi heksa (geometria 2D)'],
    // qr: 1 → 0 w CS-7 — napis „Hex: (q, r)” idzie przez `tilePosLabel` (płaska bez zmiany wyglądu, kula „#n”)
  }],
  ['ui/BattleGroupPanel.js',   1, true,  {}],
  ['ui/EconomyOverlay.js',     2, true,  {}],
  ['ui/UnitCardPanel.js',      0, false, {}],   // qr: 2 → 0 w CS-7 — „(q, r)” przez `tilePosLabel` (ColonyTilePosLogic)
  ['ui/CargoLoadModal.js',     0, false, {}],
  ['scenes/GameScene.js',      5, true,  {}],
  ['renderer/PlanetGlobeRenderer.js', 5, true, {
    grid: [5, 'RegionSystem legacy ×3 (get(id) ×2, forEach markerów) + picking UV→heks ×2 (C2, CS-7: promień → pole)'],
  }],
  ['map/PlanetMapGenerator.js', 8, true, { grid: [1, 'czapy polarne wg wiersza (forEach z col,row) — C2, CS-5'] }],
  ['debug/SpawnTestEnemy.js',   6, true,  {}],
  ['scenarios/CombatSandbox.js', 4, true, {}],
  ['testing/actions/ActionCatalog.js', 5, true, {}],
  ['testing/bots/ScriptedBot.js', 2, true, {}],
  ['testing/bots/RuleBot.js',   1, true,  {}],
  ['testing/headless/GameCore.js', 3, true, {}],
  ['testing/headless/PopTelemetry.js', 1, true, {}],
  ['testing/headless/ResourceTelemetry.js', 1, true, {}],
  ['testing/headless/PriceTelemetry.js', 1, true, {}],
  ['testing/headless/RoiTelemetry.js', 1, true, {}],
];
for (const [rel, minCalls, needImport, allowed] of SITES_B) {
  let s;
  try { s = srcB(rel); } catch (e) { assert(false, `T4 ${rel} czytelny (${e.message})`); continue; }
  const imports = /^import [^\n]*from '[./]*(?:map\/)?TileGraph\.js'/m.test(s);
  const calls = (s.replace(/^import [^\n]*$/gm, '').match(TG_CALL_B) ?? []).length;
  const got = {}, bad = [];
  for (const [k, re] of Object.entries(B_PATTERNS)) {
    got[k] = (s.match(re) ?? []).length;
    const want = allowed[k]?.[0] ?? 0;
    if (got[k] !== want) bad.push(`${k}=${got[k]}≠${want}`);
  }
  const allowTxt = Object.entries(allowed).map(([k, [n, why]]) => `${k}×${n}: ${why}`).join('; ');
  assert((imports || !needImport) && calls >= minCalls && bad.length === 0,
    `T4 ${rel}: import=${imports}${needImport ? '' : ' (niewymagany)'}, wywołań=${calls} (≥${minCalls}), dawny kod ${bad.length ? 'NIEZGODNY ' + bad.join(' ') : 'zgodny z wyjątkami'}${allowTxt ? ` [${allowTxt}]` : ''}`);
}
{
  const sample = "a = grid.filter(t => t); b = grid.getByKey?.(k) ?? grid._map?.get?.(k); c = this._hexDist(1,2,3,4); d = HexGrid.distance(1,2,3,4); e = `(${u.q}, ${u.r})`; f = `${t.q},${t.r}`; g = x.q === y.q && x.r === y.r; h = k.startsWith('building_'); i = 'building_'.length; for (const d of HEX_DIRECTIONS) {}";
  const hits = Object.fromEntries(Object.entries(B_PATTERNS).map(([k, re]) => [k, (sample.match(re) ?? []).length]));
  assert(hits.grid === 2 && hits.dead === 2 && hits.hexDist === 2 && hits.qr === 2 && hits.qrEq === 1 && hits.prefix === 2 && hits.dirs === 1,
    `T4 świadek wzorców na próbce dawnego kodu: ${JSON.stringify(hits)}`);
}

// ── T5 (Finding 765) ─────────────────────────────────────────────────────────
// Klasa nie może definiować tej samej metody dwa razy (późniejsza po cichu wygrywa). Skan każdego pliku
// src/ui z dokładnie jedną klasą; ColonyOverlay nie ma już żadnej kopii `_hexDist`.
console.log('\nT5 — Finding 765: brak zdublowanych metod w klasach UI');
const METHOD_DEF = /^ {2}((?:async |static |get |set )*)([A-Za-z_$][\w$]*)\s*\([^)\n]*\)\s*\{\s*$/gm;
const NOT_METHOD = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return']);
const duplicateMethods = (text) => {
  const seen = new Map();
  // getter i setter tej samej właściwości to para, nie duplikat → klucz z prefiksem get/set/static
  for (const m of text.matchAll(METHOD_DEF)) {
    if (NOT_METHOD.has(m[2])) continue;
    const k = (/\b(get|set)\b/.exec(m[1])?.[1] ?? '') + (/\bstatic\b/.test(m[1]) ? 'static ' : '') + m[2];
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return { count: [...seen.values()].reduce((a, b) => a + b, 0), dups: [...seen].filter(([, n]) => n > 1).map(([k, n]) => `${k}×${n}`) };
};
{
  const w = duplicateMethods('class A {\n  _hexDist(a, b) {\n    return 1;\n  }\n  other() {\n  }\n  _hexDist(q1, r1, q2, r2) {\n    return 2;\n  }\n}\n');
  assert(w.dups.join() === '_hexDist×2' && w.count === 3, `T5 świadek: detektor łapie zdublowaną metodę w próbce (${w.dups.join()}, metod=${w.count})`);
  const co = duplicateMethods(srcB('ui/ColonyOverlay.js'));
  assert(co.count >= 90 && co.dups.length === 0, `T5 ColonyOverlay: metod=${co.count} (≥90 — detektor widzi klasę), duplikaty=${co.dups.join(', ') || 'brak'}`);
  const uiDir = new URL('ui/', ROOT);
  const offenders = []; let scanned = 0;
  for (const f of readdirSync(uiDir).filter(n => n.endsWith('.js'))) {
    const t = srcB('ui/' + f);
    if ((t.match(/^(?:export )?(?:default )?class\s/gm) ?? []).length !== 1) continue;
    scanned++;
    const d = duplicateMethods(t);
    if (d.dups.length) offenders.push(`${f}: ${d.dups.join(', ')}`);
  }
  assert(scanned >= 20 && offenders.length === 0, `T5 wszystkie klasy src/ui (${scanned} plików z jedną klasą): zdublowane metody — ${offenders.join(' · ') || 'brak'}`);
}

// ── T6 (CS-1b) ───────────────────────────────────────────────────────────────
// SpawnTestEnemy._findAdjacentFreeHexes: BFS po neighbors({crossSeam:false}) == zamrożony dawny BFS po
// HEX_DIRECTIONS (HEAD 003cb3f) — każde pole każdej siatki jako start, n ∈ {1,3,8,60}.
console.log('\nT6 — SpawnTestEnemy BFS sąsiadów = zamrożony dawny BFS');
function legacyFindAdjacentFreeHexes(grid, tile, n) {
  const out = [];
  const visited = new Set([tile.key]);
  const queue = [{ q: tile.q, r: tile.r, depth: 0 }];
  while (queue.length > 0 && out.length < n) {
    const { q, r, depth } = queue.shift();
    if (depth >= 3) break;
    for (const d of HEX_DIRECTIONS) {
      const nq = q + d.q, nr = r + d.r;
      const key = `${nq},${nr}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const nt = grid.get(nq, nr);
      if (!nt) continue;
      queue.push({ q: nq, r: nr, depth: depth + 1 });
      if (nt.buildingId) continue;
      if (nt.capitalBase) continue;
      if (nt.type === 'ocean') continue;
      out.push(nt);
      if (out.length >= n) break;
    }
  }
  return out;
}
{
  let STE = null, steErr = null;
  try { STE = await import('../../debug/SpawnTestEnemy.js'); } catch (e) { steErr = e?.message ?? String(e); }
  const fn = STE?._findAdjacentFreeHexes;
  if (typeof fn !== 'function') {
    assert(false, `T6 SpawnTestEnemy eksportuje _findAdjacentFreeHexes (${steErr ?? 'brak eksportu'})`);
  } else {
    const prevK = globalThis.window.KOSMOS;
    globalThis.window.KOSMOS = prevK ?? {};
    let cases = 0, badB = 0, full = 0, short = 0;
    try {
      for (const [, g] of grids) {
        // Zabudowa / stolica deterministycznie (filtry BFS mają co odrzucać)
        g.toArray().forEach((t, i) => { if ((i * 5) % 13 === 0) t.buildingId = 'farm'; if (i === 3) t.capitalBase = true; });
        for (const t of g.toArray()) for (const n of [1, 3, 8, 60]) {
          cases++;
          const a = fn(g, t, n), b = legacyFindAdjacentFreeHexes(g, t, n);
          if (!(a.length === b.length && a.every((x, i) => x === b[i]))) badB++;
          if (b.length === n) full++; else short++;
        }
      }
    } finally { globalThis.window.KOSMOS = prevK; }
    assert(full > 0 && short > 0, `T6 świadek: wyniki pełne (${full}) i ucięte głębokością/filtrami (${short})`);
    assert(badB === 0, `T6 _findAdjacentFreeHexes = dawny BFS w ${cases} przypadkach (błędy: ${badB})`);
  }
}

// ── T7 (CS-1b) — KONTROLA ────────────────────────────────────────────────────
// Generator (iteracja / Voronoi / wygładzanie / anomalie przez TileGraph) daje bit w bit ten sam teren
// co HEAD 003cb3f: odcisk 10 siatek wszystkich klas rozmiaru (zielony po obu stronach).
console.log('\nT7 — KONTROLA: odcisk wyjścia PlanetMapGenerator = HEAD');
const GEN_PRINT_HEAD = '6ffc0c8fa535bd43a44f2dce2ef66316389c2c2ab6440551336666f3a12b8689';   // HEAD 003cb3f
assert(GEN_PRINT === GEN_PRINT_HEAD, `T7 odcisk generatora ${GEN_PRINT.slice(0, 16)}… = HEAD ${GEN_PRINT_HEAD.slice(0, 16)}…`);

console.log(`\n=== colony_sphere_tilegraph_smoke: ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
