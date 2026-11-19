# COLONY SPHERE — arc log

Plan, decisions and findings registry: `docs/design/COLONY_SPHERE_PLAN.md`.

## CS-1a — TileGraph interface + FlatHexTileGraph (2026-11-19)

- New `src/map/TileGraph.js`: `tileGraphOf(grid)`, `FlatHexTileGraph` (delegates to `HexGrid`, bit-identical),
  key helpers (`parseTileKey`, `formatTileKey`, `isCapitalKey`), `samePos`, `DETACHED_FLAT_GRAPH`; A* moved into
  `graph.path`.
- 18 systems / utils files moved onto TileGraph. Geometry rules are left for CS-2 and key formats for CS-5
  (plan §3.10 lists both).
- Proof: headless trace and state hashes identical to `a36ad12` on two seeds; keeper `colony_sphere_tilegraph_smoke`
  37 PASS (fail-first 4/20 at HEAD), 11 mutations red; sweep 438/438, i18n PASS; owner smoke PASS.
- Next: CS-1b (UI / renderer / test sites, #764, #765), then CS-2.
