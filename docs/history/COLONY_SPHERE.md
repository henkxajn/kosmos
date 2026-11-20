# COLONY SPHERE — arc log

Plan, decisions and findings registry: `docs/design/COLONY_SPHERE_PLAN.md`.

## CS-9 — buildings as portraits on the sphere + city lights (2026-11-20; owner gate PASS, all 10 steps)

- Gate PASS 2026-11-20: D-CS-29 signed as proposed; Finding 784 closed, Finding 793 open. Owner notes for later (after his
  trip): buildings may be a bit too big (one tuning value); portraits vs Meshy 3D building models to be decided after a
  side-by-side test of 2–3 models; system-map icon clutter and hero light strength to re-check.
- Owner direction: his building portraits are the art. Billboards from an atlas (`ColonyBillboardLogic` / `ColonyBillboardAtlas`),
  states (construction, upgrade, damaged, level pips), category colour as a subtle outline (A/B full tint), far dot LOD.
- City lights: one intensity function + one shader on the colony sphere and on the system map (`CityLights*`, `ColonyCityLights`).
- Finding 784 closed (system-map icons for geo colonies); Finding 793 opened (no game path damages a building).
- Proof: keeper 39 PASS (fail-first 1/38), mutations 41/41, real-game probe 10/10, flag-OFF trace unchanged, sweep 447/447,
  i18n PASS; `cs9-buildings.png`. Billboard pass 0.3 ms with 37 markers in frame.

## CS-8c — colony pages on the console kit + Finding 789 (2026-11-20; owner check PASS)

- Crew / Population / Station pages, recruitment, station pickers and the unit group drawer moved to `ColonyConsolePages` +
  `ColonyConsolePagesLogic` (D-CS-28 items 2 and 9 done); windows and drawer next to the inspector; disabled elements give reasons;
  Crew tooltips restored on canvas.
- Finding 789 fixed (`cancelConstruction` takes the tile state from the queue); Finding 790 measured, open.
- Proof: keeper 24 PASS (fail-first 2/21), mutations 43/43, real-game probe 18/18, flag-OFF trace unchanged, sweep 446/446,
  i18n PASS; `cs8c-pages.png`.

## CS-8 — Colonies console on the CONSOLES template (2026-11-20; owner gate PASS)

- Owner gate PASS incl. the re-check after the post-gate fixes (console for every geo colony regardless of the flag,
  transparent hero background with vignette, Finding 791). D-CS-28 signed with item 1 amended (the flag only decides the grid
  of new colonies); items 2 and 9 (embedded Crew / Population / Station pages, unit group drawer in today's look) interim
  until CS-8c (new step row).
- Part A: `ColonyConsoleLogic` / `ColonyConsoleView` — colony list, planet card, inspector (tile / building / construction /
  unit / palette / station / summary), queue strip with reorder (`BuildingSystem.movePending`), lens chips, CS-7 sphere as hero.
- Part B: one cost function (780), tile → building and building → tiles build modes admitting the same pairs, upgrade /
  demolish, unit orders and troop loading; 740 behind the flag (founding an outpost keeps the active colony).
- Fixes: 780, 785, 788 (geo colony opened on a flat grid in the live founding flow), 791 (new colony / outpost factory set
  reactive before registration), 792 (same for the home colony — 3 fail-closed warnings per new game → 0; flag-OFF trace
  baseline unchanged on both seeds, so no hash moved). Findings 789, 790 open; free 793.
- Proof and numbers: plan §3.16 / §3.16.1 (sheets `cs8a-console.png`, `cs8b-build-flow.png`; real-game probe 54 / 54; keeper
  `colony_console_smoke` 37 PASS; mutations 83 / 83 red).

## CS-7 — colony sphere hero + playable sphere colonies (2026-11-20; owner check PASS)

- Owner check PASS; D-CS-27 signed (camera-locked light). Pre-commit fix: the capital marker used `buildingId` (null on the
  virtual capital) → emoji; now `colony_base` portrait, gold ring, larger, farm on the capital as a badge, gold outline also for
  AI capitals. Finding 787 (same lookup on the flat 2D map) recorded; free 788. CS-8 owner decisions recorded in the CS-8 row.

- Part A: `ColonySphereRenderer` (own WebGL context, ShipHologram pattern) with the system map's `SurfaceShader` /
  `SurfaceAirShader`, LOD-first map with a crossfade to the hero map, auto-rotation state machine, exact Voronoi-cell picking,
  tile overlay shader fed by one tile-state texture (hover, selection, cursor grid, build mode, lenses), render on demand,
  context-loss handling, 2D fallback, hero frame chrome.
- Part B: with `FEATURES.colonySphere` ON new colonies of the live game (incl. the home colony) get the geo grid and today's
  colony screen shows the sphere instead of the 2D map — tile panel, build menu, demolish, unit select / move, Shift+S, lenses
  on the sphere; old flat colonies keep the 2D map; geo grids are never regenerated; UI coordinate sites moved to
  `ColonyTilePosLogic`.
- Proof and numbers: plan §3.15 (sheets `cs7a-hero-sheet.png`, `cs7b-*.png`; real-game probe 22 / 22; keepers 58 + 42 PASS;
  mutations 29 + 25 red; flag OFF trace = HEAD `eb7144b`; sweep 444 / 444). Findings 784, 785, 786 recorded (open, ⚪); free 787.
  Decisions proposed as D-CS-27 (to sign).

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
