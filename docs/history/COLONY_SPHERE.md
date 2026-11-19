# COLONY SPHERE — arc log

Plan, decisions and findings registry: `docs/design/COLONY_SPHERE_PLAN.md`.

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
