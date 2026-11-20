# COLONY SPHERE — arc log

Plan, decisions and findings registry: `docs/design/COLONY_SPHERE_PLAN.md`.

## CS-5a + CS-5b — GeodesicTileGraph, geo save format, AI on geo grids + Finding 783 (2026-11-20)

- CS-5a: `GeodesicTopology` (combinatorial ids, fixed neighbour order, BFS distances, straight A* — Finding 781),
  `GeodesicTileGraph` (sphere bands D-CS-7, landing distance ≥ 2 D-CS-9, seamless step direction), `GeodesicGrid`,
  `GeoColonyGridGenerator` (n from D-CS-8, terrain = `classify(evalAt)`), `ColonyGridFactory`, owner helper `csGeoGrid()`;
  flag `FEATURES.colonySphere` (default OFF).
- CS-5b: sparse geo save (`kind:'geo'`; no `kind` = flat, flat saves byte-identical, no version bump), `createColonyGrid` at
  every new-colony site (live game flat until CS-7), supply coverage key from the body graph, disembark anchor `anyTile()`;
  AI plays headless on geo grids with 0 exceptions.
- Finding 783 ✅ (pre-commit check): a geo tile's `key` was flat `"i,-1"` instead of the graph id `"g<i>"`, so buildings
  placed via `planet:buildRequest` (incl. the headless home capital) had unresolvable keys and the sync dropped them.
  `GeoTile` (key = graph id). Capitals measured on 66 geo colonies / 11 galaxies: all on buildable land. The AI colony-count
  excess on geo (6–7 vs 5) disappeared with the fix (5 = 5); re-check at balance.
- Finding 782 ⚪ kept open (option B, re-evaluate at CS-8). D-CS-26 signed (live flat until CS-7, `(index, −1)` interim →
  tile ids at CS-12, key strings unchanged, landing k = 2, `ensureColonyGrid` flat, gas flat until CS-11). Free 784.
- Proof: keepers `colony_sphere_geogrid_smoke` 69 PASS (18/18 mutations red), `colony_sphere_geosave_smoke` 21 PASS
  (10/10 mutations + 783 revert red); flag OFF traces seeds A / B = HEAD 641b7cf; sweep 442/442, i18n PASS; owner check PASS.
- Next: CS-7.

## CS-2 — grid-geometry rules behind TileGraph + Finding 779 (2026-11-19)

- `FlatHexTileGraph` gains `latitudeBand`, `equatorTile`, `isLandingEdge`, `stepDirection` (flat-only methods; CS-5 brings
  its own, D-CS-9); data `LatitudeBands.js`; one polar-penalty canon `AiTerrainRules.aiPolarPenalty`; `_gridHeight`,
  `gridSizes`, `_inferRows`, `_isEdgeHex` removed; queues no longer write `tileR` (old values ignored).
- Finding 779 ✅: after a load the band came from a mirror (active colony: table height 10; others: 0 = no modifier — AI
  colonies for the whole session). Now always from the colony's own grid.
- Findings 780 (build panel shows equatorial cost on polar tiles → CS-8) and 781 (zig-zag A* paths → CS-5) recorded; free 782.
- Proof: keeper `colony_sphere_geometry_smoke` 49 PASS (fail-first 15/34), 20/20 mutations red; `probe-cs2-postload`
  (base vs CS-2, post-load save identical otherwise); `probe-cs2-gate` 15/15; sweep 440/440, i18n PASS; owner gate PASS.
- Next: CS-5 (GeodesicGrid).

## CS-1b — remaining TileGraph sites + Findings 764, 765 (2026-11-19)

- UI (ColonyOverlay, BattleGroupPanel, EconomyOverlay), GameScene, PlanetGlobeRenderer keys, PlanetMapGenerator,
  debug/scenario helpers and test tooling moved onto TileGraph; remaining raw-hex hits listed with reasons in plan §3.11
  (2D-map geometry → CS-7/CS-8, bake pipeline → CS-Z, unit q,r → CS-5).
- #765 ✅ duplicate `ColonyOverlay._hexDist` removed (identical formula, no behaviour change). #764 ✅ ActionCatalog /
  ScriptedBot tile lookup fixed — bots now upgrade and demolish, so **BALANS / RuleBot numbers before CS-1b are not
  directly comparable; the next BALANS run is a new baseline.**
- Finding 778 🟡 recorded (headless `underConstruction` progress stays 0 while `_active` flips immediately → BALANS
  economy may be optimistic). Free number 779.
- Proof: trace/state identical to `003cb3f` on two seeds; keeper `colony_sphere_tilegraph_smoke` 63 PASS (fail-first
  43/19), new `action_catalog_tile_lookup_smoke` 6/6 (fail-first 1/5); 9 of 10 mutations red (M8 ColonyOverlay
  capital filter covered only by source pins + owner smoke); sweep 439/439, i18n PASS; owner smoke PASS.
- Next: CS-2 (geometry rules behind TileGraph, owner live gate).

## CS-1a — TileGraph interface + FlatHexTileGraph (2026-11-19)

- New `src/map/TileGraph.js`: `tileGraphOf(grid)`, `FlatHexTileGraph` (delegates to `HexGrid`, bit-identical),
  key helpers (`parseTileKey`, `formatTileKey`, `isCapitalKey`), `samePos`, `DETACHED_FLAT_GRAPH`; A* moved into
  `graph.path`.
- 18 systems / utils files moved onto TileGraph. Geometry rules are left for CS-2 and key formats for CS-5
  (plan §3.10 lists both).
- Proof: headless trace and state hashes identical to `a36ad12` on two seeds; keeper `colony_sphere_tilegraph_smoke`
  37 PASS (fail-first 4/20 at HEAD), 11 mutations red; sweep 438/438, i18n PASS; owner smoke PASS.
- Next: CS-1b (UI / renderer / test sites, #764, #765), then CS-2.
