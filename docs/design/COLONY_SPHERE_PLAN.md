# COLONY SPHERE — 3D body sphere replaces the flat 2D colony map (plan and findings registry)

Status: **Phase A (read-only audit) delivered 2026-11-18.** Decisions D-CS-1…D-CS-18 **signed 2026-11-18** (§0b).
**CS-3a + CS-3a-fix committed after the owner's live re-gate PASS 2026-11-18** (§3.1, §3.2). Next free finding number at the start of this arc: **759** (CONSOLES_PLAN §25). This plan files **#759–#767** and
**V-279** (§1.J). **Next free finding number after this plan: 768**; next free VISUALS number: **V-280**.
Anchor: `bf5a08d` (HEAD = main). Save version at audit time: `CURRENT_VERSION = 101` (`src/systems/SaveMigration.js:28`).
Method: grep + chunked reads by four parallel read-only audit passes, with key claims spot-checked by hand
(marked ✔ = re-read during the audit). The game was not run and no measurements were taken in a browser. Every
performance number marked *est.* is an estimate that step CS-4 must measure.
Reference prototype: `docs/design/prototypes/colony-sphere.html` (untracked, 1054 lines; fictional data). It is a
look-and-approach reference only.

## 0. Owner's frame (signed 2026-11-18 — not re-opened here)

- The Colonies tab (ColonyOverlay flat 2D hex map) becomes a 3D body sphere on the console template (CONSOLES D-K-1:
  header chips · list · hero · inspector · strip).
- **One continuous body surface** = biome data map (elevation, moisture, temperature, crater term) generated from the
  body's seed. The **same generator + same shader** draw the body on the 3D system map and on the colony screen
  (hard requirement).
- **Procedural worlds for every body, every new game** (hard requirement): every planet, moon and planetoid in every
  system (player, AI, unowned), gas giants for the look. Seed = f(game seed, body identity). The save stores only
  seeds/parameters. Body **archetypes** are parameter sets chosen from system context.
- No texture downloads; generation is **lazy** (only bodies being viewed), in a **worker**, with an **LRU cache**.
- Geodesic hex grid (dual of a subdivided icosahedron, 10n²+2 tiles, 12 pentagons) is a **logical** layer. Tile terrain
  = biome at the tile centre. Grid lines only near the cursor / in build mode.
- Building placement and ground-unit movement run on the **tile neighbour graph** (A*), not axial math.
- Buildings: procedural low-poly massing per category + HUD-role emissive accents; building PNGs stay as inspector
  portraits. City lights on the night side grow with buildings (also on the system map).
- Layout: left = body/colony list + planet card; hero = sphere (drag rotate, wheel zoom, click tile); right = inspector
  (tile / building / unit; nothing selected = planet details); strip = build queue. Header lenses:
  Terrain / Deposits / Ownership.

## 0b. Signed decisions (2026-11-18)

The owner signed every decision of §4 on 2026-11-18. This section is the binding text; §4 keeps the original options
for the record.

| Decision | Signed text |
|---|---|
| **D-CS-1** | All 12 archetypes, including **tidally locked**. Tidally locked is a new stored boolean, derivable on restore from the stored orbit + star (`??=`). |
| **D-CS-2** | Archetype frozen at first assignment. |
| **D-CS-3** | Exactly the 10 gameplay terrains; biomes are visual sub-classes. |
| **D-CS-4** | Dual grid during the arc; clean save break at arc end (CS-12). Seeds and archetypes are assigned to old bodies with `??=` (no break). |
| **D-CS-5** | **Signed with a condition.** The owner likes today's gas giants. Archetype params may feed `GasGiantShader` only if the result is at least as good; default and fallback = today's look. Platform-deck grid n=3 (92 tiles) for gas outposts. |
| **D-CS-6** | Deposits stay **per body**; per-tile deposit spots are visual only. Note: the owner may move to per-tile deposits in a future, separate economy design (strong gameplay consequences). Do not pre-build for it; do not block it. |
| **D-CS-7** | Latitude bands preserving today's ×0.5 / ×0.7 shares. |
| **D-CS-8** | **Signed, tunable.** Tile counts per class as recommended (92/92/92/162/162/252/362), kept in **one config table** so they can be reduced after in-game tests (the owner worries bodies may feel too big). Buildable share within ±20% of today. |
| **D-CS-9 … D-CS-16** | Signed as recommended (§4). |
| **D-CS-17 (new)** | Physical bodies must differ per new game, not only their surfaces. Foreign system RNG stream = f(galaxySeed, starId) instead of `hashString(starId)` alone; home system generation seeded from galaxySeed instead of unseeded `Math.random`. Old saves are unaffected (bodies are stored in full). This supersedes the §1.D remark that galaxy-seeded physical bodies are outside this arc. Implemented in CS-3a behind `FEATURES.seededSystems` (§3.1). |
| **D-CS-18 (new, signed 2026-11-18)** | The system-seed mode is a property of the **world**, decided once at world creation (`GameScene.start()` / `GameCore.boot()`) and stamped in `galaxyData.seededSystems = true` (only when ON; saved whole, no version bump; unstamped = unseeded). `SystemGenerator.worldSeedContext(galaxyData)` is the only reader; generation and scan derive their seed from it, so flipping the flag after start changes nothing. Fail-closed: a seeded world without a galaxySeed logs `[CS-3a]` `console.error`, counts `emergencySeedUses()` and uses `EMERGENCY_GALAXY_SEED = 0`, never the old seed. Homeworld mutation seeded from galaxySeed in a seeded world. CS-3a-fix (§3.2, Finding 769). |

**Step order (signed): surface track first.**
CS-3a → CS-3b → CS-4 → CS-6 → CS-1a → CS-1b → CS-2 → CS-5 → CS-7 → CS-8 → CS-9 → CS-10 → CS-11 → CS-12 → CS-Z.
CS-6 changes only the system map. The colony screen is unchanged until CS-7. The V-253 mismatch (system-map body vs
colony globe) already exists today, so CS-6 landing before the colony sphere is not a regression.

**Model policy (signed).**
- Fable 5.2 only for **CS-6** and **CS-7** (the owner has 2 limit resets).
- CS-9 and CS-10 default to **Opus**; Fable is optional if the limit allows.
- **CS-8** runs as a light loop (build → look → tune), except the build flow and unit move orders, which keep the heavy
  gate.

**Building portraits.** The owner has no missing art: he will create it. The inspector shows the building PNG
(`assets/buildings/{id}.png`, `BuildingTextures.js` naming) when it exists. **Fallback rule:** until the PNG exists, the
inspector shows the building's **category icon** as a placeholder (same slot, same size; no emoji). Asset to-do: the
31 `BUILDINGS` ids below have no PNG (61 ids, 30 with a PNG; `shipyardB.png` is an orphan with no id). Measured
2026-11-18 by listing `assets/buildings` against `Object.keys(BUILDINGS)`.

| id | PL name | category |
|---|---|---|
| `geothermal` | Elektrownia Geotermalna | energy |
| `vacuum_generator` | Generator Próżni | energy |
| `stellar_collector_relay` | Przekaźnik Zbieracza | energy |
| `synthesized_food_plant` | Zakład Syntetycznej Żywności | food |
| `orbital_mine` | Kopalnia Orbitalna | mining |
| `antimatter_factory` | Fabryka Antymaterii | mining |
| `orbital_fabricator` | Fabryka Orbitalna | mining |
| `genetics_lab` | Laboratorium Genetyczne | research |
| `ai_core` | Rdzeń AI | research |
| `seekers_institute` | Instytut Poszukiwaczy | research |
| `directional_observatory` | Obserwatorium Kierunkowe | research |
| `anomaly_research_lab` | Laboratorium Anomalii | research |
| `deep_space_array` | Tablica Głębokiego Kosmosu | research |
| `defense_grid` | Siatka Obronna | military |
| `orbital_habitat` | Habitat Orbitalny | population |
| `warp_beacon` | Radiolatarnia Osnowy | infrastructure |
| `jump_gate` | Brama Skokowa | infrastructure |
| `robot_assembly` | Montownia Robotów | synthetic |
| `android_lab` | Laboratorium Androidów | synthetic |
| `ai_nexus` | Centrum AI | synthetic |
| `admin_office` | Biuro Administracyjne | governance |
| `trade_union_hall` | Dom Związkowy | governance |
| `confederation_hall` | Hala Konfederatów | governance |
| `mediation_center` | Centrum Mediacji | governance |
| `cultural_center` | Centrum Kulturalne | civil |
| `historical_archive` | Archiwum Historyczne | civil |
| `memory_vault` | Skarbiec Pamięci | civil |
| `mission_archive` | Archiwum Misji | civil |
| `heritage_dome` | Kopuła Dziedzictwa | civil |
| `terraformer` | Terraformer | space |
| `dyson_command` | Centrum Dowodzenia Sferą | space |

This resolves §5 risk 10.

**Owner feedback on CS-3b (2026-11-18) — signed for CS-3b-v2.**

| Decision | Signed text |
|---|---|
| **D-CS-1 (revised, signed 2026-11-18)** | Realistic and diverse worlds. Archetypes are selected primarily from physical drivers (stellar flux at the orbit, atmosphere, `composition.H2O`, mass, parent body, moon position among the parent's moons); stored temperature is a secondary input. Planets: terran (always oceanic, stored frozen `waterBand` oceanic ~60% / balanced ~25% / continental ~15% + exact `waterCoverage`), jungle, desert, ice, volcanic, **hothouse** (replaces `toxic`), **cryo_haze** (new), **scorched** (new), barren, tidally_locked, ocean (rare). Moons ×5: rocky_cratered, volcanic_moon, icy_cracked, icy_cratered, hazy_moon. Planetoids: metallic / carbonaceous / silicate + icy palette. Gas giants unchanged. The homeworld of every empire is terran. CS-6 adds visual variants within each archetype. Implemented in CS-3b-v2 (§3.3). |
| **D-CS-1 v2 (archetypes v2, signed ✅ 2026-11-18 after the light check)** | 21 rows incl. hothouse replacing toxic, cryo_haze, scorched, 5 moon archetypes, planetoid_icy, terran waterBand 60/25/15 — as implemented in §3.3.1. |
| **D-CS-19 (signed ✅ 2026-11-18)** | Option (b) extended with orbits — step **CS-PHYS** after CS-6 (§3 table, §4). Finding 770 is fixed earlier, in a separate small fix step together with #768. |

---

## 1. Findings

### 1.A Colony map today — data model

**Coordinates and shape.**
- Axial coordinates: only `q`, `r` are stored, and `s = -q-r` (`src/map/HexGrid.js:3-4`, `src/map/HexTile.js:205-207`).
  Hexes are pointy-top (`HexGrid.js:6`).
- The grid is built from "odd-r" offset rows: `r = row`, `q = col - (row - (row&1))/2` (`HexGrid.js:209-221`), so
  **`tile.r` is literally the row (= latitude) index**.
- Tiles live in `Map<"q,r", HexTile>` (`HexGrid.js:47-48`, key getter `HexTile.js:282`).
- **Tapered** shape is the only live mode (`src/map/PlanetMapGenerator.js:120`). Row width is
  `max(4, round(eqW·max(0.33, sin(lat))))`, with parity matched to eqW (`HexGrid.js:56-66` ✔). Narrow rows are centred
  **only in pixel space** (`getRowPixelOffset`, `HexGrid.js:91-98` ✔). Axial coordinates are not shifted
  (→ Finding 759).
- Horizontal wrap exists **only in `getNeighbors`**, and only within the target row (`HexGrid.js:123-146` ✔).
  `distance` (:147), `ring` (:155) and `spiral` (:174) do not wrap (→ Finding 760).

**HexGrid API split** (full table in §1.B):
- Graph-like: `get`, `getNeighbors`, `distance`, `forEach/toArray/filter`, `serialize/restore`.
- Geometry: `HEX_DIRECTIONS`, row widths and offsets, offset↔cube, pixel projection, `gridCenter`, `pixelToTile`, and
  `getLatitudeModifier(r, h)` (`HexGrid.js:314-318` ✔).

**HexTile fields** (`HexTile.js:204-261`): `q, r, type, buildingId, buildingLevel, explored, strategicResource, damaged,
capitalBase, anomaly, anomalyDetected, anomalyRevealed, anomalyEffect, underConstruction, pendingBuild, syntheticSlot,
owner, occupyEmpireId, occupyStart`. `pendingBuild` is not serialized (:286-306).

**Map size per body type.** `TAPERED_SIZES` (`PlanetMapGenerator.js:35-42` ✔). The size key is `moon` / `planetoid`
from the entity type, otherwise `getEffectivePlanetType` (`:95-97`; `src/utils/EntityUtils.js:7-13`). Rocky and ice grids
scale with mass: `clamp(0.8, cap, 0.8 + log2(max(0.3,m))·0.3)`, cap 1.15, or 1.4 with `FEATURES.largestHexMaps` (default
`false`, `src/config/GameConfig.js:263` ✔) (`PlanetMapGenerator.js:106-118`). Tile counts from the formula:

| Body | eqW×rows | Tiles today |
|---|---|---|
| rocky, m ≤ 1 M⊕ (0.8 floor) | 19×12 | 152 |
| rocky, m ≥ ~2.25 M⊕ (cap) | 28×16 | 300 |
| ice, m ≤ 1 / cap | 16×10 / 23×14 | 104 / 218 |
| hot_rocky | 16×10 | 104 |
| gas | 14×10 | 96 |
| moon | 12×8 | 64 |
| planetoid | 8×6 | 36 |

- The source comments ("~244 hex (1M⊕ baseline)", `:36`) are stale.
- Two dead size tables: `GRID_SIZES` (`PlanetMapGenerator.js:25-32`) and `ColonyManager.GRID_SIZES` / `getGridSize`
  (`src/systems/ColonyManager.js:52-62, 470-481`, no callers).

**Generation** (`PlanetMapGenerator.generate`, `:91-145`):
- Deterministic mulberry32 seeded by a djb2 hash of **`planet.id`** (`:46-63, 92`). No `Math.random`.
- Pipeline:
  1. Biome weights from `surface.temperature`, `hasWater`, `lifeScore`, `composition.H2O/Fe`, `atmosphere` and
     effective type (`_calcWeights` `:149-237`; base weights `:264-289`).
  2. Airless bodies lose biotic biomes (`:243-261`).
  3. Voronoi fill: about total/4 seeds by non-wrapping `HexGrid.distance` (`:293-321`).
  4. Smoothing, "≥4 of 6 neighbours" (`:326-352`).
  5. Polar caps by **row** (`:356-404`).
  6. hot_rocky gets ≥2 volcanoes (`:407-417`).
  7. Forest next to desert or volcano → plains (`:420-425`).
  8. Anomalies (`:431-462`).
  9. `explored` (`:140-142`).
- `_placeStrategicResources` (`:467-495`) is never called (`:134`).
- **Deposits are not on tiles.** They are a per-body array `entity.deposits = [{resourceId, richness, totalAmount,
  remaining}]` (`src/systems/DepositSystem.js:3-4, 46-91`). Mines extract from all deposits of the body
  (`src/systems/BuildingSystem.js:405-424, 2562-2569`).
- `BodyTerrainUtils.js:11-` duplicates the weight logic (not audited in depth).
- `RegionSystem` (`src/map/RegionSystem.js`) is an earlier Fibonacci-sphere Voronoi with the HexGrid API. It is never
  enabled for gameplay (`ensureColonyGrid` forces `false`, `src/utils/ColonyGrid.js:109-110`). It survives only as a
  shader-texture fallback (`src/renderer/ThreeRenderer.js:2540-2548`) and a v2 restore branch (`ColonyManager.js:2803-2804`).
  It is prior art for the sphere work (`getByLatLon`, great-circle distance `RegionSystem.js:179-201`), but it is not a
  geodesic grid.

**Runtime ownership.**
- The grid is `colony.grid`; colonies are keyed by planet id (`ColonyManager.js:527, 605`).
- The same instance is shared as `buildingSystem._grid` + `_gridHeight`. Ground units fetch it via
  `colonyManager.getColony(pid).grid` (`src/systems/GroundUnitManager.js:1435-1443`).
- Grids are created at:
  - the colony window: `src/ui/ColonyOverlay.js:550-610` via `ensureColonyGrid` (`src/utils/ColonyGrid.js:82-115`);
  - outposts: `ColonyManager.js:649`;
  - founding: `ColonyManager.js:2917`;
  - AI colonies: `src/systems/EmpireColonyBootstrap.js:173, 383`;
  - new game: `src/scenes/GameScene.js:3848, 3882, 3906`.

**Save.**
- The grid is **stored in full, terrain included**: `grid: col.grid.serialize()` (`ColonyManager.js:2728`) gives
  `{width, height, tiles[], tapered, rowWidths}` (`HexGrid.js:322-333`), each tile with all fields except `pendingBuild`.
  Restore prefers the saved grid (`ColonyManager.js:2799-2830`, `_gridFromSave`). A `null` grid is regenerated from the
  id-seed (precedent: v36→v37 nulled non-tapered grids, `SaveMigration.js:1253-1263`).
- Buildings are stored separately, keyed by `"q,r"` / `"capital_q,r"` (`BuildingSystem.serialize` :1840-1855). The
  queue also stores `tileR` and `tileType` (:1858-1876), plus a pending queue (:1895-1901).
- `syncTileBuildings` (`ColonyGrid.js:34-71`) re-derives tile `buildingId` and similar fields. **A key without a matching
  tile is skipped silently**: the building keeps producing in `_active`, but no tile shows it.
- Fixture measurement (audit pass, in memory): colony grids are ≈1.24 MB of the 2.09 MB canonical save
  `src/testing/fixtures/GATE-S4-fresh-gy60.save.json.gz` (v101, `GATE-S4-fresh-gy60.md:7`). 22 colonies, 3,744 tiles.

**Terrain overwrite from a biome PNG is dead.** `ColonyOverlay._loadBiomeMap` / `_applyBiomeMap`
(`ColonyOverlay.js:5685-5767` ✔) would overwrite `tile.type` from `assets/planet-textures/{type}_{vv}_biome.png`
(`:5693` ✔), but **0 of the 216 files** in that folder are `_biome` files ✔. Every colony open issues a 404, recorded in
`assets/event-videos/midjourney_prompts.md:325-326` ✔ → Finding 761. The terrain you play on is therefore the
`PlanetMapGenerator` output.

### 1.B Every consumer of hex coordinates / hex math

Class **(1)** = pure neighbour / distance / path / tile-by-key lookup → maps cleanly onto a `TileGraph` API.
Class **(2)** = relies on grid geometry (rows, edges, bounds, pixel projection, direction indices, wrap) → needs
redesign. A "site" is one logical call cluster. Line numbers are exact; the grouping into sites is a judgement call.

| File | sites | C1 | C2 | notes |
|---|---|---|---|---|
| map/HexTile.js | 4 | 4 | 0 | ctor :204-207; `key` "q,r" :282; serialize :287-288; restore :310 |
| map/PlanetMapGenerator.js | 8 | 5 | 3 | C2: size tables :26-41, tapered + mass :105-120, polar caps by row :378-402. C1: Voronoi `distance` :313, smoothing "≥4 of 6" :331/:346, :422, anomalies :438+ |
| systems/BuildingSystem.js | 19 | 14 | 5 | C1: `tileKey.split(',')`→`grid.get` :358, 477, 524, 581, 663, 739, 758, 1584, 2354, 2378, 2457; adjacency :2134-2153 ✔; re-rate :2158-2175; `_isOwnTile` :1962. C2: `_gridHeight` :80; latitude mod :944-946, :2043-2044; polar penalty :1631, 1654-1658, 1670, 1691; **`tileR` persisted** in queues :72-76, 751/759, 1013, 1042, 1139, 1164, 1486-1491, 1540-1565, 1866, 1886, 1913 |
| systems/ColonyManager.js | 5 | 2 | 3 | C1: capital find :1975, spawn spiral :1991. C2: `_gridHeight` :651, 2919; restore `HexGrid.restore` :2805-2807 |
| systems/ColonyAutoExpander.js | 5 | 4 | 1 | C1: key parse incl. `capital_` :927-953. C2: polar penalty :620, 636-637 |
| systems/EmpireColonyBootstrap.js | 6 | 1 | 5 | C1: adjacency score :757-765. C2: `_gridHeight` :175, 385; polar :716, 754-755; `_inferRows` :810-814; `_activateBuilding(…, bestTile.r)` :806 |
| systems/GroundUnitManager.js | 18 | 15 | 3 | C1: `_hexDistance` :1083 (used :280, 793, 1117, 1221); units at hex :301, 317; move + A* :372, 382, `_aStar` :1360-1430 (uniform cost 1, only Infinity blocks :1391-1398 ✔; heuristic `HexGrid.distance` :1372); survey spiral :1320; lookups :445, 670, 735, 869, 916, 1342, 1475; minefield key `${q}_${r}` :1046. C2: reveal_fog cube loop :987-991; seam by pixel dx :1450-1460; `_wrapStep` teleport :1242-1263; facing :1468-1472 |
| systems/CombatSystem.js | 6 | 6 | 0 | battle keys `${pid}|${q}|${r}` :105, 125, 141, 176, 185; :422; `_getTile` :488; `_hexDist` :494; `_tryRetreat` 6 hard-coded dirs :444-475 (order carries no meaning → `neighbors()`); `defenseBonus` :218-220 |
| systems/ArmySystem.js | 4 | 4 | 0 | q/r equality :72, 191, 222, 249-255 |
| systems/InvasionSystem.js | 4 | 3 | 1 | C1 :164, 252, 476, 587, 619-629. **C2 `_isEdgeHex` = `neighbors.length < 6`** :641-645 ✔ |
| systems/GarrisonSystem.js · utils/GarrisonPlanner.js | 3 · 3 | 3 · 3 | 0 | :144, 190, 252 · anchor :206-213, spiral :233, keys :236, 378 |
| systems/SupplyCoverageSystem.js | 4 | 4 | 0 | `_key` :91, 111; :295-320; `ring(q,r,1)` :333; `_hexDistance` :351-361 |
| systems/StrikeSquadronSystem.js | 1 | 1 | 0 | fallback `{q:0,r:0}` :190 (assumes the origin tile exists — on a geodesic grid an id, see D-CS-9) |
| utils/TileOwnership.js · WithdrawalSystem.js | 2 · 2 | 2 · 2 | 0 | :25, 46 · :154, 241-253 |
| AnomalyEffectSystem · ResourceSystem · ImpactDamageSystem | 1 · 1 · 1 | 1 · 1 · 1 | 0 | key parse :124-125 · `capital_`/`building_` keys :302 · :244 |
| systems/RandomEventSystem.js | 2 | 1 | 1 | C1 :466-467; C2 fallback `r = height/2` (equator) :468 |
| systems/MissionSystem.js · SaveMigration.js | 1 · 1 | 0 | 1 · 1 | `_gridHeight` :2594 · v36→37 `tapered` check :1258 |
| VesselManager · entities/Vessel · ui/CargoLoadModal | 3 · 2 · 1 | all | 0 | :1383, 1556, 1592 · :763-775, 809 · :406 |
| data/groundAbilities.js | 2 | 2 | 0 | minefield key :64, 89-104 |
| utils/ColonyGrid.js | 5 | 4 | 1 | key parse :44-64; `_gridHeight` :104 |
| scenes/GameScene.js | 6 | 2 | 4 | C1 :1225, :6252. C2 hard-coded `gridSizes` :2560-2561; `_gridHeight` :3850, 3883, 3907 |
| ui/ColonyOverlay.js | ~35 | 20 | 15 | C1: `_hexDist` defined **twice** :738 and :2921 ✔ (→ #765); `grid.get` :937, 2496, 4056, 4071, 4845, 5662; keys :2462, 3207, 3819, 3982, 4098-4127, 5020, 5100; drop teams :4619-4691. C2: `_fitMapToView` :485; `_findBestTileForCapital` via `gridCenter` :649-662; `_centerOnCapital` :689-711; `_drawMap` :2422-2437; `_drawHex` + `HEX_DIRECTIONS[ei]` :3581-3640; borders :3747-3759; latitude label :3923-3924; `_screenToTile` :4532-4541; `_applyBiomeMap` :5717-5748 |
| ui/UnitCardPanel · BattleGroupPanel | 2 · 1 | C1 | 0 | display "(q,r)" :189, 192 · :153 |
| renderer/PlanetGlobeRenderer.js | 5 | 4 | 1 | C1 keys :441-547. C2 picking UV→`pixelToHex` + seam brute force :872-899 |
| renderer/PlanetGlobeTexture · PlanetTerrainTexture · BiomeMapGenerator · BuildingMapGenerator · ColonyBuildingMarkers · SurfaceMarkers · ThreeRenderer | 6 · 3 · 2 · 3 · 2 · 2 · 1 | 0 · 0 · 0 · 1 · 0 · 0 · 0 | 6 · 3 · 2 · 2 · 2 · 2 · 1 | all hexToPixel→equirect UV (:67-436 · :231-338 · :50, 114-125, 182-195 · :28-121 · :210-214, 278-279 · :212-215, 254-255 · flat-grid bake :2528) |

Not hex consumers (checked): BattleSystem, GroundUnitFactory, DepositSystem, POIRegistry, SaveSystem (the grid goes
through ColonyManager), `src/systems/ai`, `src/systems/director`, EmpireColonyMaintenance, GroundUnitPanel,
ColonyGridResolveLogic, HudCombatLogic. The `.q` hits in ChoreographyLogic and ThreeRenderer :7852+ are quaternions.

**Dead / legacy (≈35 sites):**
- `PlanetScene.js`: ≈24 sites (:121-1157). It is created at GameScene :2735, but `open()` is never called.
- RegionSystem shims (:234-262).
- `ColonyManager.GRID_SIZES` and `getGridSize`.
- `CombatSandbox` imports `HEX_DIRECTIONS` (:25) unused.
- The `groundUnit:fogRevealed` emit (GroundUnitManager :993) has no listener.
- Debug BFS over `HEX_DIRECTIONS` (SpawnTestEnemy :270-295).

**Totals (live code):** **≈119 class-1 sites** · **≈63 class-2 sites** + ≈17 HexGrid-internal geometry methods replaced
wholesale · ≈35 dead/legacy.

**Tests:** 68 files (61 smoke of 427, 7 headless of 78), ≈506 lines.
- 24 files / 57 lines are geometry-specific: mostly `bSys._gridHeight = grid.height`, `g2_planner_smoke` `ring(…,1)`
  :260-292, `pop2_5c2` `tileR`, `test-colony-auto-expander` `_gridHeight` ×17.
- 13 files use literal `'q,r'` keys, and 14 construct `HexGrid` / `HexTile` directly.
- `src/testing/actions/ActionCatalog.js:112,131` ✔ calls `grid.getByKey` / `grid._map`, neither of which exists (→ #764).

**The class-2 sites that need real design (not mechanical porting):**
1. **ColonyOverlay 2D map** (`_drawMap`, `_drawHex`, borders, `_screenToTile`, camera). Replaced wholesale by the
   sphere hero; it is not ported.
2. **Globe/system-map texture pipeline** (hexToPixel → equirect in 7 renderer files). Replaced by the shared surface.
3. **PlanetGlobeRenderer picking** (:872-899). Replaced by ray → nearest tile centre.
4. **Latitude economy** keyed to row index (`getLatitudeModifier` ✔, BuildingSystem :944, :2043), with `tileR`
   **persisted** in queues → needs `latitudeBand(tileId)` (D-CS-7).
5. **AI polar penalty, copied three times** (BuildingSystem :1654, ColonyAutoExpander :636, EmpireColonyBootstrap :754
   + `_inferRows` :810). Becomes one canon.
6. **`InvasionSystem._isEdgeHex`** (:641-645 ✔). "Fewer than 6 neighbours" means "map border". On a geodesic grid that
   is **exactly the 12 pentagons**, so every landing would cluster there (D-CS-9).
7. **GroundUnitManager seam handling** (:1242-1263, :1450-1472). Pixel-dx seam detection, teleport and sprite facing →
   a tangent-plane step direction.
8. **Save keys**: every persisted `"q,r"` key (`_active`, queues, `capital_*`, `building_*` producer ids, minefields
   `${q}_${r}`, unit q/r, battle keys) (D-CS-4).
9. **PlanetMapGenerator sizing and polar caps** → subdivision frequency `n` + latitude.
10. **`_findBestTileForCapital`** ("map centre" via `gridCenter`, ColonyOverlay :649-662). A sphere has no centre.

### 1.C Body rendering on the system map today (VISUALS 1.0)

**Rocky and ice planets** (`ThreeRenderer.addPlanetMesh`, `src/renderer/ThreeRenderer.js:2705-2829`):
- `MeshStandardMaterial` with:
  - **diffuse** = procedural bake per body;
  - **normalMap + roughnessMap** = PNG files from `assets/planet-textures/`, chosen by `resolveTextureType` + variant
    (`:2751-2757`; `src/renderer/PlanetTextureUtils.js:65-106`, `TEXTURE_VARIANTS = 3` :18).
- The PNG diffuse is used only if the bake fails (`:2768-2778`); the last fallback is flat `planet.visual.color` (`:2780-2783`).
- **The diffuse bake** (`_bakePlanetTexture` `:2524-2537`) has two modes:
  - **Mode 1, once terrain tiles are loaded.** It builds the gameplay grid with `PlanetMapGenerator.generate(planet)`
    (`:2528`), then calls `BiomeMapGenerator.generateColorMap` (`src/renderer/BiomeMapGenerator.js:180-328`). That
    function takes the nearest hex per pixel of a 1024×512 canvas and samples webp terrain-tile pixels
    (`TerrainTextures.js:365-391`). This is **CPU, main thread, unmeasured**.
  - **Mode 2, fallback.** A RegionSystem Voronoi DataTexture is rendered through `PlanetShader.bakeFragmentShader` into
    a 1024×512 render target, then read back (`:2540-2626`).
- `_rebakePlanetTextures` (`:2630-2702`) re-bakes all bodies one per `setTimeout(0)` after the tiles load (`:2025`).
- *Inferred, unmeasured:* on a system switch this may double-bake (`docs/design/UI_PLAN.md:546` reports "Rebake: 58
  tekstur").

**Moons** (`_addMoonMesh` `:3175-3255`, `SphereGeometry(r,24,16)`) and **planetoids** (`_initPlanetoids`
`:3410-3464`, `(r,16,12)`) use the same pattern.

**Asteroids and comets** are a `THREE.Points` cloud behind `FEATURES.smallBodies` (off, `GameConfig.js:48` ✔). They are
not entities in play.

**Gas giants are already fully procedural.** With `FEATURES.liveGasShaders: true` (`GameConfig.js:413` ✔), a live
`MeshStandardMaterial` built with `onBeforeCompile` (`src/renderer/GasGiantShader.js:912-972`) draws bands, storms, poles
and rim from `createGasBakeUniforms(planet)` (`:486`). Inputs are `GAS_PRESETS` (`:33+`) and `mulberry32(hashCode(id))`.

**Other per-body visuals:**
- Atmosphere shell (`AtmosphereShader.js:238-275`): one colour, `visual.glowColor ?? 0x4488ff` (V-275).
- Clouds (`ThreeRenderer.js:2995-3088`): no per-body input (*inferred: same pattern on every planet*).
- Rings (`:2436-2520`).
- Axial tilt from `id` (`:2791`).

**Per-body visual state.** Only `visual.color` and `visual.glowColor` are stored (`src/entities/CelestialBody.js:26-30`).
Everything else is derived at runtime from `planet.id` hashes and physical parameters. There is **no seed field**
(`src/entities/Planet.js:12-60`). Three different id hashes are in use: `PlanetTextureUtils.hashCode` (:182),
`PlanetMapGenerator.hashString` (:57) and `SeedMath.hashStringToInt` (`src/utils/SeedMath.js:39`).

**Shader files:**
- `PlanetShader.js` (519 lines): GLSL 2D simplex + triplanar `sphereNoise` `:60-100`, biome colours `:103-144`, globe
  fragment `:227+`, uniforms `:438-510`.
- Also: `GasGiantShader.js` (996), `AtmosphereShader.js` (287), `SunShader.js` (637), inline cloud GLSL,
  `LogDepthChunks.js`.
- The bump thresholds are off by one biome id (`PlanetShader.js:254-255` ✔ vs `BiomeMapGenerator.js:16-27` ✔): mountains
  (id 1) get the plains bump and ocean (id 2) gets the mountain bump → V-279.

**Assets:** `assets/planet-textures/`: 216 PNGs ✔, ≈154 MB, each 1024×512.
- 16 body types × 3 variants × {diffuse, height, normal, roughness} = 192 files, plus 36 star files.
- Normal play loads only normal + roughness (and star emission). **Height maps are never loaded.**
- Loader: global `Map` cache, no LOD, no disposal (`PlanetTextureUtils.js:114-132`).

**Colony-screen globe today** (`ColonyOverlay._syncGlobe` `:2377-2414` → `PlanetGlobeRenderer.open`, `:94-240`):
- Its **own WebGLRenderer** and DOM canvas (z 3, `:121`).
- Live `PlanetShader` driven by a biome DataTexture built **from the colony's saved grid** (`BiomeMapGenerator.generate`
  + `BuildingMapGenerator`, `:150-165`).
- Hex overlay sphere (`:222-235`) and emoji building sprites (`SurfaceMarkers`).
- rAF every frame, **no render-on-demand** (`:791-814`).
- `close()` → `forceContextLoss` (`:392-398`), so every reopen rebuilds from scratch (V-252).

**System map vs colony globe already differ today** (V-253):
- The system map uses the CPU colour map with real tile pixels; the globe uses the shader with 10 averaged colours.
- The system map uses a freshly generated grid; the globe uses the saved one.

**Can one shared SurfaceGenerator feed both views? Yes**, and it closes V-253 by construction. Both views already reduce
to "biome data on a sphere → colour".

What breaks for bodies drawn from image files:
1. All rocky planets, moons and planetoids lose their relief detail (PNG normal + roughness), unless the generator or
   the shader produces normals. **Recommendation:** shader-side normals from the elevation channel plus GLSL detail
   noise; never load the PNG set on the new path.
2. The PNG fallbacks (no grid; bake failure) and the `_cachedTexType` / `_cachedTexVariant` consumers
   (`ThreeRenderer.js:2712-2715`, `ColonyOverlay.js:5688`) need a replacement on the new path.
3. Gas giants need no biome data; they keep `GasGiantShader` (D-CS-5).
4. Atmosphere colour and clouds gain per-body inputs from the archetype (fixes V-275 on the way).
5. `generate-planets.js`, `lib/` and `assets/planet-textures/` are **critical files**. Deleting them is a separate owner
   decision at arc end (D-CS-15).

### 1.D Body generation at new-game start

**Where bodies are created:**
- **Galaxy.** `src/generators/GalaxyGenerator.js:18` sets `SYSTEM_COUNT = 72`. `mintSeed()` uses `Math.random` (`:80-82`).
  `generate(seed)` (`:102-207`) returns star records only. System ids are positional: `sys_home`, `sys_001…` (`:188`).
  Minted only for a new game; otherwise loaded (`src/scenes/GameScene.js:2405-2414`).
- **Home system.** `GameScene._generateFreshSystem` (`:4964-4980`) → `SystemGenerator.generateCivScenario()`
  (`src/generators/SystemGenerator.js:689-752`). `generate()` (`:59-90`) uses **unseeded `Math.random`**
  (`docs/design/GALAXY_SEED_PLAN.md:45-47`). The homeworld is then mutated: `makeHomeworldBreathable` (`:654-682`), a Ti
  floor and regenerated deposits (`:727-733`).
- **Foreign systems (lazy).** `StarSystemManager.generateAndRegister` (`src/systems/StarSystemManager.js:96-136`) →
  `generateForStar` (`SystemGenerator.js:817-869`):
  - Seed = `hashString(galaxyStar.id)` (`:819` ✔). `Math.random` is swapped for mulberry32 (`:822-824`).
  - **It does not depend on the galaxy seed**: `sys_037` gets the same RNG stream in every game. Only the galaxy
    star's spectral type, mass and luminosity vary (`GALAXY_SEED_PLAN.md:49-54`).
  - `peekCountsForStar` (`:881-919`) replays the same stream; its comment (`:877-880`) says the call order must not
    change.
  - Triggers: AI bootstrap (`EmpireColonyBootstrap.js:623`), AI expansion (`EmpireStrategySystem.js:346-358`), any
    vessel arrival (`VesselManager.js:3119`). **Unvisited systems have no bodies at all.**
- Generators: planets `:152-284` (type by 5 zones `:424-441`), moons `:947-1050`, planetoids `:558-645`, deposits for
  all bodies `:93-105`.

**Entities** (no GasGiant class: gas = `Planet` with `planetType === 'gas'`):

| Class | Attributes |
|---|---|
| `CelestialBody` | id/name/type :7-9; physics {mass, radius, density} :16-20; visual {color, glowColor} :26-30; lifeScore :35; explored/analyzed :36-37; deposits :38 |
| `Planet` | orbital :17-24; planetType hot_rocky/rocky/gas/ice :27; surfaceRadius/Gravity :30-31; temperatureK/C :35-37; albedo :40; atmosphere none/thin/breathable/dense/thick :43; surface {temperature, hasWater, magneticField} :46-50; orbitalStability :56; composition (~20 elements) :60 |
| `Moon` | parentPlanetId :28; moonType rocky/icy :31; surface radius/gravity, composition, temperature, atmosphere :34-51 |
| `Planetoid` | planetoidType metallic/carbonaceous/silicate :29; atmosphere 'none' :36; :39-65 |
| `Star` | spectralType :21; luminosity :22; temperature :23; habitableZone :27-30 |

**Seeds today:**
- A game seed exists (`galaxyData.seed`), but only the galaxy layout and `EmpireGenerator` use it
  (`src/generators/EmpireGenerator.js:78-95, 130`).
- Shared seed utilities: `mixSeed` (`SeedMath.js:31-36`), `hashStringToInt` (:39), `noiseUnit` (:50). EmpireGenerator
  keeps a private duplicate (`:66`).
- **There is no per-body seed.** Three implicit seeds exist: the system stream, deposits seeded from `entity.id`
  (`DepositSystem.js:25-31, 54-57`), and the hex map seeded from `planet.id`.
- ⚠ **Entity ids are a global counter** (`entity_${_nextId++}`, `src/core/EntityManager.js:19-21` ✔). A body's id depends
  on the order in which systems were generated, so **`body.id` is not a stable seed input**. This is already on the
  backlog (`WOJNA_I_POKOJ_MASTER_PLAN.md:989-995`, `GALAXY_SEED_PLAN.md:191-195`).

**Save per body** (`src/systems/SaveSystem.js:78-94`):
- **Every** planet, moon and planetoid of every generated system is stored in full, with stored parameters (planet
  :265-311, moon :313-342, planetoid :344-370; deposits with `remaining`). Restore rebuilds from stored parameters
  (`GameScene._restoreSystem` `:5113-5249`).
- Asteroids and comets are not stored.
- Fixture: 7 of 72 systems generated; 61 planets, 113 moons, 190 planetoids; body JSON ≈591 KB (≈1.6 KB per body).

**Bodies per galaxy:**
- Per system: planets 5-11 roll (`SystemGenerator.js:137-146`) with corrections (`:178-219, 305-309`), moons 0-5 per
  planet (`:961-967`), planetoids 15-40 (`:559`).
- Fixture average ≈ 8.7 + 16.1 + 27.1 ≈ **52 bodies per system** → **≈3,700 bodies** if all 72 systems were generated
  (range ≈2,000-6,000). A fully explored galaxy's body JSON (≈6 MB) would exceed the localStorage budget noted at
  `SaveMigration.js:36` already today. This is independent of this arc, but it is a reason not to add per-body bulk data.

**AI body evaluation** (reads only `planetType`, `atmosphere`, `deposits[]`, `moonType`, `planetoidType`):
- Home body: `_pickHomePlanet` (`EmpireColonyBootstrap.js:644-650`) takes the first rocky body, then forces breathable
  (`:107`).
- Expansion (`EmpireStrategySystem.js`):
  - nearest unowned system (`:377-398`);
  - quality gate: Xe, or a rocky + breathable body (`:402-411`);
  - outposts by deposit score (`:644-688, 717-730`);
  - full colony needs `planetType === 'rocky'` (`:698-715, 876-878`).
- `ColonyAutoExpander` scores **tiles** (terrain + row) (`:613-638`).
- *Not found:* body selection in `director/` or `ai/UtilityAI.js`.

**Assessment for the signed direction:**
- **Seed key must be structural, not `body.id`.** Proposal:
  `surfaceSeed = mixSeed(galaxySeed, hashStringToInt(systemId), kindTag, ordinal)`, where `ordinal` is the body's
  generation index within its system. It must be computed by a **pure hash after generation**: drawing from the
  system's `Math.random` stream would shift every foreign system and break `peekCountsForStar`. The seed is
  **stored** on the body (one int). Storing it, rather than re-deriving it, makes old and new saves robust to any future
  generator change.
- **Archetype** = pure function of the stored physical parameters (`planetType`/`moonType`/`planetoidType`,
  temperature, atmosphere, `composition.H2O`, mass, star class, `lifeScore`) → `BODY_ARCHETYPES` row. It is frozen at
  first assignment and stored (D-CS-2), so that a temperature drift (`LifeSystem._recalcTemp`, `LifeSystem.js:117-131`)
  or a collision (`PhysicsSystem.js:182-183, 235`) does not silently repaint a colonised world.
- **Direction of derivation: parameters → archetype → surface → tile terrain. Never surface → parameters.**
  - Keep as today: habitability (`LifeSystem._calcPotential` `:134-178`), atmosphere, temperature, composition,
    `hasWater`, deposits (per body).
  - Derive from the surface: tile terrain (replacing the Voronoi), the ocean fraction (from `composition.H2O`), and the
    visual palette.
  - Optional later: per-tile deposit placement for the Deposits lens (D-CS-6).
- **AI impact: none in the core path**. The AI reads body parameters, which stay. The AI tile scoring (polar penalty,
  adjacency) moves to `TileGraph` with the gameplay steps. Later option: an archetype-level "expected buildable tiles"
  table, so the AI can value bodies without generating surfaces.
- Every new game differs even where the physical bodies of a foreign system repeat, because `galaxySeed` enters the
  surface seed. (Making the physical bodies themselves galaxy-seeded is the existing GALAXY_SEED backlog, outside this
  arc.) **Superseded 2026-11-18 by D-CS-17 (§0b): galaxy-seeded physical bodies are in this arc (CS-3a).**

### 1.E Terrain types and gameplay effects → biome mapping

All 10 terrains are defined in `src/map/HexTile.js:24-159`; ground move costs are in `src/data/GroundUnitData.js:109-120`.

| id | line | buildable | allowed categories | yield bonus | move | defence |
|---|---|---|---|---|---|---|
| plains | :25 | yes | all | food 1.4 | 1 | 1.0 |
| mountains | :39 | yes | mining, energy, military, synthetic, governance, research | mining 1.6, else 0.8 | 3 | 1.25 |
| ocean | :52 | **no** | — | — | ∞ | — |
| forest | :65 | yes | food, population, research, governance | food 1.3, else 0.9 | 2 | 1.15 |
| desert | :80 | yes | mining, energy, military, space, market, synthetic | energy 1.5, else 0.9 | 2 | 0.95 |
| tundra | :93 | yes | mining, energy, food, military, market, governance | mining 1.2, else 0.8 | 2 | 1.05 |
| volcano | :107 | yes | energy, mining, market | energy 2.0, mining 1.3, else 0.7 | 4 | 1.1 |
| crater | :120 | yes | mining, research, military, synthetic | mining 1.8, else 0.9 | 2 | 1.15 |
| ice_sheet | :134 | yes | mining, energy, food | 0.8 | 3 | 0.9 |
| wasteland | :147 | yes | mining, energy, military, synthetic, research, market | 0.7 | 1 | 1.0 |

How the effects apply:
- **Placement** has one gate, `evaluatePlacement` (`HexTile.js:177-200` ✔): buildable/damaged → `terrainOnly` →
  `terrainAny` → `allowedCategories` → tech `terrainUnlock`.
  - `terrainOnly`: `geothermal` = volcano (`src/data/BuildingsData.js:138`); `directional_observatory` (`:1437`).
  - Category-gated buildings: `BuildingsData.js:53-1114`.
  - `force_fields` unlocks ocean (`TechData.js:1037` ✔), but the buildable gate fires first → #762.
- **Yield**: terrain multiplier by category (`BuildingSystem.js:2033-2035, 2079-2086`).
- **Latitude**: polar rows ×0.5 production / ×1.5 build cost, next rows ×0.7 / ×1.25 (`HexGrid.js:314-318` ✔).
- **Adjacency**: +`adjMult` per neighbour with the same category after `urban_planning` (`TechSystem.js:337-340`;
  `BuildingSystem.js:2134-2153` ✔). The neighbour **count** matters, so pentagons give at most 5.
- **Move cost** slows movement only; A* uses uniform cost (✔ `GroundUnitManager.js:1391-1398`).
- **Defence**: `CombatSystem.js:218-220`.
- **Anomaly eligibility** by terrain: `src/data/AnomalyData.js:462-477`.
- **AI terrain rules** are a separate layer (`src/data/ai/AiTerrainRules.js:21-38` ✔): `mine` hard = mountains only.
  The rules reference the non-existent terrain `industrial_zones` (#766).
- `baseYield`, `clearCost` and `strategic` are display-only or unused.

No terrain is body-specific; variety comes only from weights (`PlanetMapGenerator.js:264-289`, airless gate `:234`).

**Proposed mapping: biome class (visual) → gameplay terrain (one of the existing 10).** The 10 terrains stay the only
gameplay vocabulary: BuildingsData, TechData, AnomalyData, AiTerrainRules and saves all key on them, and adding a terrain
is a balance change (D-CS-3). Biomes are *visual* sub-classes of the surface classifier.

| Archetype family | Biome class (surface) | → terrain | Note |
|---|---|---|---|
| terran / ocean / jungle | deep sea, shallow sea | ocean | sea level from `composition.H2O` quantile |
| | pack ice | ice_sheet | buildable today; prototype marks it unbuildable → D-CS-3 |
| | glacier | ice_sheet | |
| | peaks | mountains | prototype: unbuildable "peaks" → D-CS-3 (new terrain = balance) |
| | mountains | mountains | |
| | tundra | tundra | |
| | desert / steppe | desert | steppe could be plains (moisture split) |
| | plains | plains | |
| | forest / jungle / swamp | forest | jungle and swamp are colour variants |
| desert / hot_rocky / volcanic | dune sea, salt flat | desert | |
| | lava field, caldera | volcano | ≥2 guaranteed volcano tiles (today `:407-417`) |
| | ash plain, scorched rock | wasteland | |
| ice world / icy moon | ice plain | ice_sheet | |
| | cryo-volcano, fractured ridge | mountains | |
| | exposed rock | wasteland | |
| toxic (dense or thick atmosphere, hot) | acid flats | wasteland | biotic terrains removed (airless rule extended) |
| | sulphur volcano | volcano | |
| tidally locked | day side scorched, terminator band, night ice | desert, tundra/plains (if breathable), ice_sheet | needs `tidallyLocked` stored on the body (new param) → D-CS-1 |
| rocky moon | highlands, maria | wasteland | prototype classes |
| | crater floor | crater | |
| | crater rim | mountains | prototype: unbuildable |
| | polar crater ice | ice_sheet | |
| planetoid (metallic / carbonaceous / silicate) | regolith | wasteland | |
| | solid rock | mountains | |
| | metal vein | crater | mining 1.8 — best match for "vein" |
| | crater floor / rim | crater / mountains | |
| gas giant (if a grid is kept) | high / mid / low platform deck | desert / wasteland / mountains / crater | same 4-terrain mix as today (`PlanetMapGenerator.js:272-274`) |

### 1.F Reuse

- **ShipHologramRenderer** (`src/renderer/ShipHologramRenderer.js`, 640 lines) is the template for the hero:
  - its own `WebGLRenderer` on an off-DOM canvas, created lazily (`:39-49, 425-451`);
  - composited into the host's 2D UI canvas with `drawImage` (`:604-617`);
  - **render-on-demand** via `shouldRender({visible, dirty, spinning, fading})` (`ShipHologramLogic.js:123-125`);
  - a frame budget with a Canvas2D fallback;
  - context loss and restore (`:438-439`), `release()` → `forceContextLoss` (`:342, 461-470`);
  - THREE, canvas and loader are injected, so it is **testable under Node**.
  - Host: ShipyardOverlay `:64` / `:313`.
- **Alternative**: render inside the main ThreeRenderer into a render target. Precedent: `renderBodyThumbnail`
  (`ThreeRenderer.js:6616-6700+`, dead, V-254). This shares one GL context, so the system map and the hero would use the
  literal same material instance. Downside: it couples the hero to the main scene's render loop (Finding 730: the scene
  already renders under every tab) and loses the injected-THREE testability. Contexts that can be alive at once today:
  main, globe, hologram, GLB snapshot. **Recommendation (D-CS-11):** ShipHologram pattern (own context). "Same shader"
  means the same GLSL module, the same uniform builder and the same cached data array, uploaded once per context
  (≈2 MiB for the colony body).
- **Ground-unit GLBs**: 21 files in `assets/units/ground/{humanity, UNE, Konfederaci, Syndykat}`, ≈1-1.9 MB each.
  `human_supply` and `une_supply` are **38.5 MB each** (must be optimized before any live 3D use). Only
  `human_garrison_mobile.glb` and `_deployed.glb` exist as deploy variants. Today GLBs are **only 2D snapshots**:
  `GroundUnitFactory.loadUnitSprite` (`:325-355`); variants come from `ColonyOverlay._deriveVariantPath` (`:2963-2965`).
  None is drawn in a live 3D scene, and no template is kept in memory. A sphere needs a GLB template cache + instancing,
  a marker LOD, and missing-variant fallback rules (D-CS-14).
- **Building PNGs**: `assets/buildings/` holds **31** PNGs ✔ (128×128), loaded per `BUILDINGS` id by
  `loadBuildingTextures` (`src/renderer/BuildingTextures.js:12, 24-45`). ≈58 building definitions exist, so ≈27 requests
  404 silently. They are used only in the 2D hex map (`ColonyOverlay.js:3686-3687`). The globe and system-map markers use
  emoji sprites (`SurfaceMarkers.js`, `ColonyBuildingMarkers.js`). ⚠ The brief says "61 building PNGs"; the repo has 31
  (+18 icon PNGs in `assets/icons`). See §5.

### 1.G Bodies that can host colonies / outposts today

`ColonyManager.createColony` / `createOutpost` (`:542-611`, `:615-`) have **no type gate**. Gating is in the callers:

| Path | Allowed |
|---|---|
| Player full colony, in-system (`MissionSystem.canLaunchColony` :209-212) | planetoid, moon, rocky/ice planet (no gas, no hot_rocky) |
| Player outpost (`MissionSystem.canFoundOutpost` :250-253; same in dead `ExpeditionSystem` :187) | planetoid, moon, rocky/ice/**gas** planet |
| UI found-outpost filter (`FleetManagerOverlay.js:2745-2750`) | rocky/ice/iron/volcanic/moon/planetoid/gas |
| Cross-system colonize (`VesselManager._startForeignColonize` :3698-3700) | rocky/ice/planetoid — **moons excluded** (#767) |
| AI full colony | rocky only |
| AI outpost (`bootstrapAutonomousOutpost` :458-502) | no type check, gas included |

Asteroids and comets are not colonizable and not registered. Fixture colony bodies: 12 rocky planets, 10 planetoids.
**Gas giants host outposts today** (player and AI), so they need a TileGraph of some kind (D-CS-5).

### 1.H Save compatibility

- `CURRENT_VERSION = 101`, `MIN_SUPPORTED_VERSION = 4` (`SaveMigration.js:28-29`). `MIGRATIONS` maps version → fn
  (`:76-174`). `migrate()` chains them; a throw becomes `incompatible_save` (`:249-271`) and ends in TitleScene
  `clearSave()` (comment `:2403-2405`).
- Precedents:
  - grid reset v36→37 (`:1253-1263`);
  - **deliberate clean break** v75→76 throws (`:2005-2010` ✔);
  - galaxy regeneration v19→20 (`:814-818`);
  - tile walk v97→98 (`:2368-2384`).

**What breaks with a geodesic grid:**
- every `"q,r"`-keyed map (`_active`, queue, pending queue, `capital_*`, `building_*`, minefields `${q}_${r}`);
- unit `q,r` (`GroundUnitManager.js:1487-1488`), invasion (`InvasionSystem.js:164`), capture, garrison, army,
  withdrawal state;
- battle keys `pid|q|r`;
- persisted `tileR`;
- the grid blob itself (width/height/rowWidths).

`syncTileBuildings` would silently skip unmatched keys, giving invisible but producing buildings. **This is the main
migration risk.**

**What breaks with seeded bodies: nothing, if seeds are additive.** Bodies keep their stored parameters. `surfaceSeed`
and `archetype` can be assigned on load with `??=` in `restore()` (derived from `galaxySeed` + systemId + ordinal), so the
system-map look works on old saves **without a version bump**. Existing bodies cannot be reproduced from seeds anyway:
the home system was unseeded, deposits depend on `entity_N`, and homeworlds were mutated after generation. **Stored
parameters remain the truth; the seed only drives the surface.**

**Option costs** (estimates):
- **(a) One-shot migration.** Generate the geodesic grid per colony; map each building, unit and tile state to the
  nearest free tile with the same terrain (fallback: nearest buildable); rewrite three key maps plus unit, invasion,
  capture and minefield coordinates. Fixture scale: 22 colonies, 3,744 tiles. ≈500-900 lines + keepers. Risks:
  invisible buildings, changed adjacency bonuses, broken in-flight invasions.
- **(b) Clean break** at arc end (v75→76 pattern). ≈10 lines + fixture re-capture + the 4 smoke tests that gunzip the
  fixture without migrating it (`g2_planner_smoke.mjs:339`, `g2_mobilisation_smoke.mjs:478`,
  `sb1_dock_heal_smoke.mjs:42`, `sb1_fleet_tuning_smoke.mjs:63`).
- **(c) Dual grid during the arc.** Old colonies keep the flat grid behind `TileGraph`; new colonies (or new games under
  the flag) get the geodesic grid. The save carries `grid.kind`. This costs nothing extra once TileGraph exists, but the
  flat implementation lives until arc end, when (a) or (b) is chosen.
- Either final option makes the canonical fixture "dead" under the fixtures README rule
  (`src/testing/fixtures/README.md:22-33`). Re-capture is a step.
- **Save size**: today ≈1.24 MB of 2.09 MB is grid blobs, every tile with every field. Proposed geodesic format per
  colony: `{kind:'geo', n, terrain:"<1 char per tile>", tiles:{<id>: <non-default state only>}}`. That is ≈400 B + sparse
  state, an order-of-magnitude reduction, which helps the localStorage budget.

### 1.I Performance

- **Workers:**
  - No `new Worker`, no OffscreenCanvas anywhere in `src/` or `tools/` today.
  - Live Server serves static files, so `new Worker(url, {type:'module'})` works in current Chromium/Firefox.
  - **Module workers do not inherit the importmap** (`index.html:73-80`: `three` → local `./src/lib/three.module.js`,
    addons → CDN). So the worker module graph must not import `three`, `GameConfig` (→ `i18n.js:8` reads `localStorage`
    at module top level) or `TerrainTextures` (creates a canvas via `document` at top level, `:362-363`).
  - **Requirement:** `SurfaceField` is a dependency-free ESM module (the `*Logic.js` style, Node-testable). It returns
    transferable typed arrays; `DataTexture` is built on the main thread. A synchronous main-thread fallback (same
    module) serves headless and Node.
- **Noise:**
  - There is **no JS simplex/perlin in `src/`**; GLSL noise lives in `PlanetShader.GLSL_NOISE_LIB`.
  - `lib/noise.js` (CommonJS, critical path) has `SimplexNoise3DFallback`, `fbm3d`, `ridgedFbm3d`, `domainWarp3d`,
    `worley3d`; `lib/craters.js` has craters. They are to be **copied** into an ESM module, not edited.
  - RNG: `src/sim/rng.js:1-31` (xmur3 + mulberry32) and `SeedMath`. `RendererRng` is a single global visual stream and
    is **not usable** for per-body seeds.
- **Determinism (new risk, not in the brief).** ECMAScript does not require `Math.sin/cos/atan2/asin/exp/pow` to be
  bit-identical across engines. The prototype classifies tiles by sampling an equirect map indexed with `atan2/asin`
  (`colony-sphere.html:324-336`). If gameplay terrain is derived that way, the same save could yield different tile
  terrain in Chrome and Firefox. **Rules:**
  1. Gameplay terrain is computed by evaluating the field **directly at the tile-centre unit vector** using only
     `+ − × ÷ sqrt floor` (IEEE-exact). The geodesic construction uses only normalize/sqrt, so it is exact too.
  2. Terrain of **colonised** bodies is persisted (1 char per tile, above), so even a generator change cannot move
     buildings off valid ground.
  3. The visual texture may use trig freely (cosmetic).
- **Generation budget** (*est.*; the prototype prints its own timing, but it was not run in this audit):
  - Full-resolution 1024×512 with 6-octave fbm + domain warp ≈ 0.5-1.5 s of JS per body → worker only.
  - System-map LOD: 256×128 RGBA8 (128 KiB) for planets/moons, 128×64 for planetoids → ≈30-80 ms per body. With ≈52
    bodies per system, ≈2-4 s in a worker, progressive (nearest/largest first; placeholder colour from the archetype
    until ready).
  - Tile terrain at centres: ≤362 field evaluations → <5 ms, main thread is fine.
  - Today's comparison: the rocky GPU bake costs 6.5 ms per body after V-251 (`docs/design/VISUALS_PLAN.md:108`); the CPU
    `generateColorMap` cost is unmeasured.
  - **Contingency** (if CS-4 measures worse): GPU generation of the *visual* map from a GLSL port of the same field.
    Gameplay stays on CPU tile centres; consistency then holds only up to float precision at biome borders.
- **Memory:** the prototype holds 1024×512 Float32 RGBA = **8 MiB per body**; 52 of those is impossible.
  - RGBA8 instead: 2 MiB at full resolution, 128 KiB at LOD.
  - LRU budget proposal: 1 full-resolution body (colony hero) + the active system's LOD set (≈52 × ≤128 KiB ≈ 6 MiB) +
    the 2 previous systems ≈ **≈20 MiB** typed arrays + GPU copies.
  - Elevation may need 16 bits for relief (pack into two channels, or a separate R16 if banding shows).
- **Render-on-demand** for the hero: the ShipHologram `shouldRender` gate; redraw on drag, zoom, hover, lens change or
  a city-light tick. Today's `PlanetGlobeRenderer` renders every frame (`:791-814`).

### 1.J Findings filed by this audit

| # | Status | Finding |
|---|---|---|
| **759** | 🟠 | Tapered rows are centred only in pixel space (`HexGrid.js:91-98` ✔, `:279-283`), while `getNeighbors` uses unshifted axial directions (`:123-146` ✔). Between rows of different widths, the logical neighbours (adjacency bonus, A*, smoothing) are probably not the hexes drawn as adjacent. *Inferred from code; measure in game before any fix.* Superseded by the geodesic grid; CS-1 preserves it bit for bit. |
| **760** | ⚪ | Seam inconsistency: `getNeighbors` wraps, but `distance` / `ring` / `spiral` and 6 private `_hexDist` copies do not (`HexGrid.js:147-185`; `GroundUnitManager.js:1083`, `CombatSystem.js:494`, `SupplyCoverageSystem.js:351`, `ColonyOverlay.js:738/2921`). Ranges are wrong across the seam, and the A* heuristic (`GroundUnitManager.js:1372`) is inadmissible there. |
| **761** | ⚪ | Dead biome-PNG terrain overwrite: `_loadBiomeMap` requests `_biome.png` files that do not exist (`ColonyOverlay.js:5685-5767` ✔; 0 of 216 files ✔). A 404 on every colony open. Removed in CS-Z. |
| **762** | ⚪ | The `force_fields` ocean unlock is unreachable (`TechData.js:1037` ✔): `evaluatePlacement` rejects `buildable:false` before it reads unlocks (`HexTile.js:179` ✔). |
| **763** | ⚪ | Moon/planetoid anomaly caps are dead: `getEffectivePlanetType` never returns `moon`/`planetoid` (`EntityUtils.js:7-13` vs `PlanetMapGenerator.js:433-435`). Polar and anomaly eligibility read raw `planetType`, undefined for moons and planetoids (`PlanetMapGenerator.js:358`, `AnomalyData.js:463`). |
| **764** | ⚪ | `ActionCatalog` reads tiles via the non-existent `grid.getByKey` / `grid._map` (`src/testing/actions/ActionCatalog.js:112,131` ✔), so the tile is always `undefined` (test tooling). |
| **765** | ⚪ | `ColonyOverlay._hexDist` is defined twice (`:738`, `:2921` ✔); the later one silently wins. |
| **766** | ⚪ | `AI_TERRAIN_RULES` lists the non-existent terrain `industrial_zones` (`src/data/ai/AiTerrainRules.js:25-26` ✔). An audit pass also reports AI non-capital placement allowed on ocean (`EmpireColonyBootstrap.js:743-747`, not re-read). |
| **767** | ⚪ | Cross-system colonize excludes moons, in-system allows them (`VesselManager.js:3698-3700` vs `MissionSystem.js:209-212`). |
| **V-279** | ⚪ | Globe bump thresholds off by one biome id (`PlanetShader.js:254-255` ✔ vs `BiomeMapGenerator.js:16-27` ✔). Superseded by the new surface shader. |

Unverified observations (no number until measured): identical cloud pattern on every planet (`ThreeRenderer.js:3073-3081`);
possible double rebake on system switch (`UI_PLAN.md:546`); whether real saved grids differ from regenerated ones.

---

## 2. Proposed architecture

```
 body params (stored)  ──►  BodyArchetypes.select()  ──►  archetype id (stored, frozen)
 galaxySeed + systemId + ordinal ──► surfaceSeed (stored)
                                         │
                       SurfaceField (pure ESM, no deps; deterministic arithmetic)
                     ┌───────────────────┼─────────────────────────┐
           evalAt(unitVec) (main)   bakeEquirect(w,h) (worker)   classify(sample, archetype) → biome → terrain
                     │                   │ transferable RGBA8
           TileGraph terrain        SurfaceCache (LRU, per body × LOD)
                                         │
                         SurfaceShader (one GLSL module + uniform builder)
                    ┌────────────────────┴────────────────────┐
         system map (ThreeRenderer)                 ColonySphereRenderer (hero, own context)
```

**`src/utils/SurfaceSeed.js`** (pure)
- `surfaceSeedFor(galaxySeed, systemId, kindTag, ordinal)` built on `mixSeed`.
- Assigned after generation in `SystemGenerator` callers. `??=` on restore for old saves.

**`src/data/BodyArchetypes.js`** (data) + **`src/utils/BodyArchetypeLogic.js`** (pure selector)
- Each row: `{id, namePL, nameEN, family: planet|moon|planetoid|gas, match(params)→score, field: {octaves, warp,
  ridge, craterDensity, seaFromH2O, polarCapBias, …}, biomes: [{class, terrain, colorRole}], atmosphere:{tint, density},
  clouds:{coverage}, gridN: by size class}`.
- Selection is deterministic from the stored parameters + star class, with ties broken by `surfaceSeed`.

**`src/utils/SurfaceField.js`** (pure, Node-testable, worker-safe)
- Copied simplex3D / fbm / ridged / warp / craters (from `lib/noise.js` and `lib/craters.js`, ported to ESM).
- `evalAt(seed, archetype, x, y, z) → {e, m, t, a}` using only IEEE-exact operations.
- `bakeEquirect(seed, archetype, w, h) → Uint8Array` (trig allowed).
- `classify(sample, archetype) → biomeIndex`.

**`src/workers/surface.worker.js`** + **`src/systems/SurfaceCache.js`**
- Job queue with priorities (colony hero > focused body > active-system LOD by apparent size).
- LRU by byte budget (§1.I).
- Main-thread synchronous fallback; headless uses the fallback.
- An event fires when a body's surface is ready. EventBus is the bus.

**`TileGraph` interface** (`src/map/TileGraph.js`, doc + adapters):
`tiles()`, `tile(id)`, `idOf(tile)`, `parseKey(key)` / `formatKey(id, prefix)`, `neighbors(id)`, `distance(a,b)`,
`within(id, k)` (BFS ring/spiral replacement, stable order), `path(a, b, passFn, costFn)`, `latitude(id)` (−1…1) /
`latitudeBand(id)`, `isLandingEdge(id)`, `stepDirection(a, b)` (unit animation), `serialize()` / `restore()`.

**`FlatHexTileGraph`** (first implementation: wraps `HexGrid`, **behaviour bit-identical**)
- id = today's `"q,r"` key, so **no save change**.
- `distance` = today's non-wrapping cube distance (preserves #760 on purpose).
- `within` = today's `spiral` order.
- `latitudeBand` = today's row rule (`getLatitudeModifier`).
- `isLandingEdge` = `neighbors < 6`.
- All ≈119 class-1 sites and the ≈20 gameplay class-2 sites (latitude, polar ×3, `_isEdgeHex`, `tileR`, `_gridHeight`,
  `_inferRows`, RandomEvent fallback, seam step) move behind it.
- Proof: keepers comparing the old and new call paths over every tile of every size class, plus a recorded headless trace
  compared bit for bit.

**`GeodesicGrid`** (second implementation)
- `buildGrid(n)` as in the prototype, but **integer ids, deterministic vertex ordering, no Map keyed by rounded floats
  in the gameplay path**. Precomputed neighbour lists (5 or 6); a centroid KD-lookup for picking.
- Terrain = `classify(evalAt(centre))`. Latitude = centre `y`. `isLandingEdge` per D-CS-9.
- Key format `"g<id>"` (prefix to avoid confusion with `"q,r"`). `capital_g<id>`, `building_…` likewise through
  `formatKey`.
- Save: `{kind:'geo', n, terrain, tiles}` (§1.H).
- Geometry is cached per `n` (5 shared topologies; terrain differs per body).

**`SurfaceShader.js`** (one GLSL module, `LogDepthChunks`, per-object values only as uniforms)
- Inputs: the data texture (e, m, t, a) + archetype palette uniforms + sea level + light.
- Normals from the elevation gradient + detail noise. Night side `uCityLights` from a per-tile intensity texture.
- Lens overlay channel for the colony screen (terrain / deposits / ownership colours per tile via a small tile-id → colour
  texture).
- Used by `ThreeRenderer` (system map: planets, moons, planetoids) and `ColonySphereRenderer`.
- Gas giants keep `GasGiantShader`, with archetype parameters fed into it.

**`ColonySphereRenderer`** (`src/renderer/`, ShipHologram pattern, injected THREE)
- Hero sphere, drag rotate / wheel zoom.
- Ray → tile (nearest centroid); hover outline; grid lines near the cursor / in build mode.
- Building meshes (instanced massing per category), unit markers / GLBs.
- Render-on-demand; context-loss handling; a Canvas2D fallback (flat disc + tile dots) when the GPU is missing.

**Console layout mapping** (CONSOLES D-K-1):

| Zone | Content | Source today |
|---|---|---|
| header | title, sub-tabs `[ COLONY ] [ STATION ]` (`_stationMode`), lenses `[ TERRAIN ] [ DEPOSITS ] [ OWNERSHIP ]`, `[ x ]` | ColonyOverlay V2 header |
| list (left) | colonies + outposts of the empire (system-grouped), planet card (archetype, radius, g, temperature, atmosphere, deposits, tile stats) | ColonyOverlay colony list / info panel |
| hero | ColonySphereRenderer | 2D hex map + globe (both retired) |
| inspector (right) | tile (terrain, yield multipliers, latitude band, placement verdict from `evaluatePlacement`, build buttons) · building (portrait PNG, level, rates, upgrade/demolish) · unit (card, move/order) · nothing = planet details | ColonyOverlay side panels, UnitCardPanel |
| strip | build queue (+ pending queue) | BuildingSystem queue UI |

New full-screen modals still register in `src/ui/ColonyModalLogic.js` (CLAUDE.md trap).

---

## 3. Step cut (each step = one CC session)

Tags: **MECH** = mechanics (heavy gate: `FEATURES` flag where behaviour changes, fail-first keepers in a real
`git worktree --detach`, mutations, sweep + i18n green, owner live gate). **VIS** = visual (light loop: build → contact
sheet → owner looks → tune). Model: **Fable 5.2** for creative visual implementation, **Opus** for refactors, audits and
docs. Pure refactors (CS-1, CS-2) are proven bit-identical rather than flagged.

**Signed order (§0b):** CS-3a → CS-3b → CS-4 → CS-6 → CS-1a → CS-1b → CS-2 → CS-5 → CS-7 → CS-8 → CS-9 → CS-10 → CS-11 →
CS-12 → CS-Z. The table is in that order. *Depends* lists technical prerequisites only; a step never starts before the
previous step in the order is closed. **Model policy (signed):** Fable only for CS-6 and CS-7; CS-9 / CS-10 default Opus
(Fable optional if the limit allows); CS-8 is a light loop except the build flow and unit move orders (heavy gate).

| Step | Tag | Model | Content | Depends |
|---|---|---|---|---|
| **CS-0** | doc | Opus | This audit + owner decisions | — |
| **CS-3a** | MECH | Opus | `SurfaceSeed` (pure hash, not the system RNG stream); `surfaceSeed` stored on every planet/moon/planetoid, `??=` on restore (no version bump); **D-CS-17** behind `FEATURES.seededSystems`: foreign and home system RNG streams from galaxySeed, `peekCountsForStar` on the same seed path; gate helpers `csWorlds()` / `csPeek()`. Details §3.1 | CS-0 |
| **CS-3b** | MECH | Opus | `BodyArchetypes` data + selector (12 archetypes, D-CS-1) + the stored **tidally-locked** boolean (`??=` from stored orbit + star); `archetype` stored and frozen at first assignment (D-CS-2), `??=` on restore. Keepers: determinism, archetype distribution over a generated galaxy (headless), save round-trip | CS-3a |
| **CS-4** | MECH | Opus | `SurfaceField` pure ESM (noise port), worker + main fallback, `SurfaceCache` LRU. Keepers: worker = main bit-identical; `evalAt` uses no trig (source pin) and is cross-checked with a fixed vector set. **Headless Chrome measurement** of bake cost per LOD, worker throughput per system, memory → fixes the budgets in §1.I or triggers the GPU contingency | CS-3b |
| **CS-6** | VIS | **Fable** | `SurfaceShader` + archetype looks; system-map planets/moons/planetoids switched under `FEATURES.sharedSurface` (lazy LOD, archetype placeholder colour while pending); normals from elevation; per-body atmosphere tint + clouds (V-275). Contact sheet: every archetype × 3 star classes × day/terminator; system-map frames vs today. Headless GLSL compile probe with a failing control | CS-4 (independent of CS-5). Changes **only the system map**; the colony screen is unchanged until CS-7. The V-253 mismatch exists today, so this order is no regression |
| **CS-PHYS** | MECH | Opus 5.5 | D-CS-19 (b)+orbits: physical temperature model at generation (greenhouse by atmosphere AND flux incl. runaway/collapse, thick<dense inversion fixed, airless day/night extremes for display, tidal + parent heating for moons) + `minOrbitAU` scaled by stellar luminosity (M systems get HZ planets). Behind a `FEATURES` flag (OFF = today bit-identical), new worlds only, no save migration, BALANS run, heavy gate | CS-6 |
| **CS-1a** | MECH (refactor) | Opus | `TileGraph` interface + `FlatHexTileGraph`; key helpers (`parseKey`/`formatKey`); move the **systems** class-1 sites (Building, GroundUnit, Combat, Army, Invasion, Garrison/Planner, Supply, AutoExpander, Bootstrap, Withdrawal, TileOwnership, Anomaly/Resource/Impact/RandomEvent key parse, ColonyGrid, Vessel/VesselManager). Keepers: equivalence over all tiles of every size class; headless trace bit-identical | CS-0 (scheduled after CS-6 by the signed order) |
| **CS-1b** | MECH (refactor) | Opus | Remaining class-1 sites in UI/renderer/tests (ColonyOverlay C1, CargoLoadModal, UnitCard, BattleGroup, PlanetGlobeRenderer keys, test helpers); fix #764 and #765 on the way | CS-1a |
| **CS-2** | MECH (refactor) | Opus | Grid-geometry gameplay rules behind TileGraph, still bit-identical on flat: `latitudeBand` (BuildingSystem latitude + `tileR` derived from tile), one polar-penalty canon (×3 → 1, `_inferRows` gone), `isLandingEdge`, `stepDirection` (seam teleport/facing), RandomEvent equator fallback, `_gridHeight` removal, StrikeSquadron origin fallback → `TileGraph.anyTile()`. **Gate: owner live gate on a real save — flat game unchanged.** This is the gate before any visual work depends on TileGraph | CS-1b |
| **CS-5** | MECH | Opus | `GeodesicGrid` TileGraph (n by size class, D-CS-8), terrain via classify→terrain table (D-CS-3), anomalies, latitude bands, landing rule (D-CS-9), sparse save format, `grid.kind`. Behind `FEATURES.colonySphere` (new colonies only; old colonies stay flat = dual grid). Keepers: 10n²+2, 12 pentagons, neighbour symmetry, A* optimal vs BFS, determinism, terrain shares vs today's per type, save round-trip; AI bootstrap + auto-expander + invasion headless runs on geo grids | CS-2, CS-4 |
| **CS-7** | VIS | **Fable** | `ColonySphereRenderer` hero: same shader, drag/zoom, picking → TileGraph id, hover/selection outlines, grid near the cursor / build mode, lens overlay, render-on-demand, context loss, 2D fallback. Contact sheet across the 5 UI themes (hero frame chrome) | CS-5, CS-6 |
| **CS-8** | MECH (UI) — light loop, heavy gate for build flow + unit move orders | Opus | Colonies console on the CONSOLES template: list + planet card, inspector (tile/building/unit/planet), strip (queue), lenses; build flow (`evaluatePlacement` per tile) and unit move orders on the sphere; `_stationMode` sub-tab; i18n PL/EN; `ColonyModalLogic`. Behind `FEATURES.colonySphere` (OFF = today's ColonyOverlay) | CS-7 |
| **CS-9** | VIS | Opus (Fable optional) | Building massing (procedural low-poly per category, `HudPalette` role emissives, instanced) on the hero; city lights per tile on the night side, also on the system map; under-construction / damaged states | CS-8 |
| **CS-10** | VIS + MECH | Opus (Fable optional for the visual part) | Ground units on the sphere: GLB template cache + instancing near, marker far (D-CS-14), `_mobile`/`_deployed` swap, great-circle step animation via `stepDirection`, battle markers; optimize the 38.5 MB supply GLBs first | CS-8 |
| **CS-11** | MECH | Opus | Gas giants per D-CS-5 (archetype → `GasGiantShader` params **only if at least as good as today; default and fallback = today's look**; platform grid on the geo graph or look-only); optional AI archetype "expected buildable tiles" table (D-CS-12) | CS-5, CS-6 |
| **CS-12** | MECH | Opus | Save end-state per D-CS-4 (clean break or migration), version bump, fixture re-capture + README metadata, fix the 4 fixture-reading smokes | CS-8 |
| **CS-Z** | MECH (removal) | Opus | Flags permanent; remove the 2D colony map and the old globe pipeline (`PlanetGlobeRenderer`, `PlanetGlobeTexture`, `PlanetTerrainTexture`, `BiomeMapGenerator`, `BuildingMapGenerator`, `SurfaceMarkers`, `ColonyBuildingMarkers`, the dead `_loadBiomeMap` #761, `PlanetScene`, RegionSystem); `FlatHexTileGraph` removed if D-CS-4 = break; asset decision D-CS-15; before/after frame comparison per CLAUDE.md | CS-9…CS-12 |

Critical files touched: `src/map/HexGrid.js` (CS-1/2: wrapped, not rewritten), `src/config/GameConfig.js` (flags),
`src/systems/SaveMigration.js` (CS-12 only). Each of these needs this plan's sign-off before its step. CS-3a touches
`GameConfig.js` (flag `seededSystems`) and, as signed for this step, `SystemGenerator.js`, `SaveSystem.js` and the
restore path in `GameScene.js` (§3.1). `SaveMigration.js` is not touched (no version bump).

### 3.1 CS-3a — implementation notes (2026-11-18; gate log and commit in §3.2)

**Surface seed** (`src/utils/SurfaceSeed.js`, pure, imports only `SeedMath.js`).
- `surfaceSeedFor(galaxySeed, systemId, kindTag, ordinal)` =
  `combineSeeds(SURFACE_SALT, galaxySeed | 0, hashStringToInt(systemId), hashStringToInt(kindTag), ordinal)` → uint32.
  `combineSeeds(...parts)` is new in `SeedMath.js`: a chain of `mixSeed` finalizers, order-sensitive.
- `kindTag` = `entity.type`: `planet` (gas giants included), `moon`, `planetoid`. Bad input throws `TypeError`.
- `assignSurfaceSeeds(bodiesByKind, galaxySeed)` sets `surfaceSeed ??=` per body; the ordinal counter runs per
  (kind, systemId) in array order. A body that already has a seed keeps it but takes its index.
- The seed is never drawn from the system RNG stream: assignment draws 0 numbers from the caller's stream (keeper S5).

**Where seeds are assigned.**
- Foreign system: `StarSystemManager.generateAndRegister`, right after the `systemId` stamps, on the generator's
  arrays (ordinal = generation index).
- Home system and every restored body: `StarSystemManager.assignMissingSurfaceSeeds(galaxySeed)` (a pass over
  `EntityManager.getByType` for the three kinds). It is called once in `GameScene.start()` immediately after
  `window.KOSMOS.galaxyData` is minted or loaded, and in `GameCore.boot()` after `K.galaxyData`. The pass runs there
  because the home system is generated **before** the galaxy (the galaxy takes the home star's name and type).
- Save: `surfaceSeed` is written by `_serializePlanet` / `_serializeMoon` / `_serializePlanetoid` (`null` when
  unset). Restore: `_restoreSystem` reads `pd.surfaceSeed ?? null`, and the start-up pass fills the gaps.
  **No save version bump**: an old save loads with `null` seeds and gets them from the pass.

**How the ordinal is recovered for old saves.** The ordinal is the index of the body among the **stored** bodies of
the same kind in the same system, in stored order. That order equals generation order, because:
- `SaveSystem` serializes `EntityManager.getByType(kind)`, which iterates in insertion order;
- the generators insert each system's bodies in array order;
- `_restoreSystem` re-inserts them in file order.

A body destroyed before an old save was written (collision) shifts the indices of later bodies of that kind in that
system. The result is a different but deterministic surface for a world nothing has ever drawn. New saves store the
seed, so this cannot happen to them. The canonical fixture is pinned: 364 bodies in 7 systems all get seeds,
`ordinal == stored index` for 364/364, seeds are unique, and re-save + reload gives the same seeds (keeper S8).

**D-CS-17 behind `FEATURES.seededSystems`** (default `false`; OFF = bit-identical, keeper S2 against a trace
recorded on `bf5a08d`).
- **One seed function** for both kinds of system: `SystemGenerator.seededRngSeed(galaxySeed, systemId)` =
  `combineSeeds(SYSTEM_RNG_SALT, galaxySeed | 0, hashStringToInt(systemId)) | 0`. The salt differs from the surface
  salt.
- **Foreign systems.** `generateForStar(galaxyStar, seedCtx)` and `peekCountsForStar(galaxyStar, seedCtx)` both
  take their seed from `_foreignRngSeed(starId, seedCtx)`; the sequence of generator calls is unchanged. `seedCtx` is
  the world's seed context (§3.2); without it (old API) both use the old seed. A seeded world without a galaxySeed takes
  the loud emergency path (§3.2), never the old seed in silence.
- **Home system.** `generate({ galaxySeed })` / `generateCivScenario({ galaxySeed })` swap `Math.random` for
  `mulberry32(seededRngSeed(galaxySeed, 'sys_home'))` around body generation, deposits included (the same pattern as
  `generateForStar`).
  - The homeworld mutations after generation (`makeHomeworldBreathable` temperature, the Ti deposit regeneration) run
    on their own stream from galaxySeed (`HOMEWORLD_MUTATION_SALT`) in a seeded world, so the same galaxy seed gives
    an identical start world, temperature included (CS-3a-fix, keeper S3). Unseeded: the caller's `Math.random`, as before.
  - POWER TEST stays unseeded.
- **How galaxySeed reaches the call sites (no new globals).** `galaxyData.seed`, persisted in the save, stays the only
  owner of the seed.
  - New game, flag ON: `GameScene.start()` mints the seed **before** the home system
    (`preMintedGalaxySeed`, only when `!savedData && seededSystems`) and passes it to
    `_generateFreshSystem(cx, cy, galaxySeed)` → `generateCivScenario`. The `isNewGame` branch then uses
    `preMintedGalaxySeed ?? GalaxyGenerator.mintSeed()`, so there is one mint per path. Flag OFF: no pre-mint, and the
    `Math.random` order is as before.
  - Headless: `GameCore.boot()` already knows `galaxySeed` before the home system and passes it.
  - Foreign generation: `StarSystemManager.generateAndRegister(galaxyStar, galaxyData)` takes the world record
    explicitly (AI bootstrap and ship arrival pass it; default = lazy `window.KOSMOS.galaxyData`) and derives
    `SystemGenerator.worldSeedContext(galaxyData)`.
  - Scan: `ObservatorySystem._countSystemBodies` passes the same `worldSeedContext(galaxyData)` to `peekCountsForStar`.
  - `galaxy_seed_smoke` T9 ("GameScene mints exactly once") was updated to the new shape: exactly two mint sites, the
    pre-mint gated `!savedData && seededSystems`, and the `isNewGame` branch minting only via
    `preMintedGalaxySeed ?? mintSeed()`. The R2 intent holds.
- **Old saves.** All bodies of generated systems are stored in full. An old save has no world stamp, so it stays an
  unseeded world whatever the flag: systems it never generated are generated and scanned with the old seed (§3.2).

**Gate helpers** (`src/debug/ColonySphereDebug.js`): `csWorlds()` (active system: galaxy seed, flag, one row per body
with kind / type / ordinal / surfaceSeed) and `csPeek()` (peek vs entity counts for every generated foreign system).
`csPeek()` also reports `starsDifferFromLegacySeed`: how many of the 71 stars give different peek counts than the old
`hashString(starId)` seed in this world. It is the in-game discriminator of the world mode (unseeded → `0/71`, seeded →
`71/71` measured), plus `worldSeeded` and `emergencySeedUses` (CS-3a-fix). Both are also
available as `KOSMOS.debug.csWorlds()` / `KOSMOS.debug.csPeek()`. Gate checklist: `docs/design/COLONY_SPHERE_GATE1_CHECKLIST.md`.

`src/main.js` now sets `window.KOSMOS.gameConfig = GAME_CONFIG` at boot. This is the same object `GameScene.start()`
already exposes. It is needed because a new-game flag must be set on the **title screen**, and every way back to the
title reloads the page.

**Keeper** `src/testing/smoke/colony_sphere_seeds_smoke.mjs` (S1–S9; 94 pins). Trace
`src/testing/fixtures/traces/CS3a-sysgen-off-baseline.json` + `.md`, helper `src/testing/headless/SysGenDigest.mjs`.
- Fail-first on a real `git worktree --detach bf5a08d`: 32 red / 32 green, plus the `main.js` pin added afterwards (red
  on base: `bf5a08d:src/main.js` has no `KOSMOS.gameConfig`). The green ones are controls: the OFF trace, peek ==
  generation on the old seed, 0 draws, witnesses.
- 14 mutations, all killed.
- `galaxy_seed_smoke` T9: 3 updated pins, red on base.

**Live engine (headless Chrome + CDP, 2026-11-18; probe in the session scratchpad).** The gate one-liners were typed
exactly as in the checklist.

| Scenario | Result |
|---|---|
| Flag OFF, new game | `csWorlds()`: `missingSeeds: 0`. `csPeek()`: 2 generated foreign systems, 0 mismatches, `starsDifferFromLegacySeed: 0/71`. Seeds = formula. |
| Flag ON, new game ×2 | Galaxy seeds `1299954837` / `-2113281230`; homes 42 / 39 bodies, `missingSeeds: 0`; `csPeek()` 0 mismatches; a second run gave `starsDifferFromLegacySeed: 71/71` in both games. **Home planets (type, mass, a) identical to node `generateCivScenario({ galaxySeed })` for the same seed** (both games). |
| Old save (fixture v101) | `[CS-3a] surfaceSeed nadane: 364`; `csWorlds()` 63 bodies, 0 missing; seeds = formula with stored order. |
| Old save → ☰ Zapisz (`game:save`) → F5 → Kontynuuj | 61/61 planets saved with a seed; `nadane: 0` after reload; every seed identical. |
| Old save with flag ON | Before CS-3a-fix: `csPeek()` 6/6 mismatches (the flag was read live). After: 0 — an unstamped world stays unseeded (§3.2). |

### 3.2 CS-3a-fix — owner gate step 5 FAIL, Finding 769 (2026-11-18; re-gate PASS, committed)

**Gate result.** Steps 1, 2, 3, 4, 6 PASS. Step 5 FAIL: galaxySeed 813683454, `csPeek()` 2/2 mismatches (sys_025 gen
4/10/37 vs peek 5/9/31; sys_018 11/28/17 vs 9/16/22). Identical flow with galaxySeed 1640489291: 0 mismatches.

**Finding 769 ✅ — the system-seed mode was read from the live flag, not from the world.** `_foreignRngSeed` /
`_homeRngSeed` read `FEATURES.seededSystems` on every call, so a world's generation and its later scans could use
different modes. The brief's race hypothesis (AI bootstrap generating before `galaxyData.seed` exists) is refuted.
- Offline: the owner's "gen" rows equal `peekCountsForStar` with the **old** seed exactly (sys_025 4/10/37, sys_018
  11/28/17). The seeded home for 813683454 has 36 bodies; the owner's home had 59. So the home **and** both AI homes
  were generated unseeded, meaning the flag was OFF during `GameScene.start()` and ON when `csWorlds()` / `csPeek()` ran.
  Node `generateCivScenario` matches the browser home count exactly for four other seeds (47/53/44/65), so the body
  count is a valid discriminator.
- Real UI flow (headless Chrome + CDP; hooks on `generateForStar`, an accessor trapping every write to the flag):
  20 fresh games with the flag set on the title screen gave **0/20** games with a mismatch. All 40 foreign generations
  ran `EmpireGenerator → bootstrapHomeColony → _ensureSystemGenerated → generateAndRegister` with flag ON and
  `galaxySeed === galaxyData.seed`. The only runtime writer of the flag was `csPeek()`'s own synchronous toggle.
- **Exact reproduction**: `mintSeed` pinned to 813683454, new game with the flag OFF (`[CS-3a] … seededSystems=false`),
  flag set ON after start, `csPeek()` → 2/2 mismatches with the owner's numbers to the digit. With the flag set on the
  title screen, the same seed gives a 36-body home and 0 mismatches.
- How the flag was OFF at start in the owner's tab is not observable from here (a Live Server reload on the title
  screen resets flags to the file; so does typing the flag before F5 finishes). The defect is that the code let it matter.

**Fix (decision D-CS-18, signed by Filip 2026-11-18, §0b): the mode belongs to the world.**
- One decision per world, taken where the world is created: `GameScene.start()` (`preMintedGalaxySeed !== null`,
  i.e. `!savedData && FEATURES.seededSystems`) and `GameCore.boot()` (`worldSeededSystems`). The same value seeds the
  home (`generateCivScenario({ galaxySeed, seeded })`) and stamps the galaxy
  (`GalaxyGenerator.generate(…, { seededSystems })` → `galaxyData.seededSystems = true`, only when ON; OFF keeps the
  old object shape). `galaxyData` is already saved whole: no version bump, no migration; old saves are unstamped, so unseeded.
- `SystemGenerator.worldSeedContext(galaxyData)` → `{ galaxySeed, seeded }` is the only reader. Stamp → seeded.
  Seed without stamp → unseeded. No world record → the flag decides. Generation (`StarSystemManager.generateAndRegister`,
  world record passed explicitly by `EmpireColonyBootstrap` and `VesselManager`) and scan
  (`ObservatorySystem._countSystemBodies`) both derive the context from it. `SystemGenerator` reads the flag nowhere else.
- **Fail-closed.** A seeded context without a finite galaxySeed (corrupt save, or generation before the world record
  exists while the flag is ON) → `console.error('[CS-3a] świat seedowany bez galaxySeed …')` once per system,
  counter `SystemGenerator.emergencySeedUses()` +1, seed = `seededRngSeed(EMERGENCY_GALAXY_SEED = 0, systemId)` for both
  generation and peek (still consistent, never the old seed).
- `csPeek()` / `csWorlds()` report `worldSeeded` and `emergencySeedUses`; `csPeek()` no longer writes the flag (it
  compares explicit contexts).

**Measurements (real UI flow, headless Chrome).** Before the fix: flag on the title screen 0/20 games with a mismatch;
flag flipped after start 2/2 mismatches (owner's rows exactly). After: `probe-cs3a-newgame-ui --games 20 --flip 10`
30/30 PASS (title: `worldSeeded: true`; flip: `worldSeeded: false`; every game `mismatches: 0`, `emergencySeedUses: 0`,
no `[CS-3a]` error). Pinned seed 813683454 twice: identical 36-body home, homeworld 286.15 K both times, same AI systems.
Browser mutation (StarSystemManager ignores the world record) → 3/3 RED (`emergency 2`, `[CS-3a]` errors, 2 mismatches).
The machine gate is
`node src/testing/headless/probe-cs3a-newgame-ui.mjs --games 20 --flip 10` (exit 0 = every game `mismatches: 0`,
`emergencySeedUses: 0`, no `[CS-3a]` error, `worldSeeded` true for title-flag games and false for flip games).

**Keeper** `colony_sphere_seeds_smoke` S3 (identical home incl. temperature/deposits for the same galaxySeed), S4/S6
(world stamp), S10 (the owner's scenario: world OFF → flag ON after start and the reverse; csPeek, new systems after the
flip, a control that reading an OFF world as seeded diverges), S11 (worldSeedContext table, emergency path: error +
counter + EMERGENCY seed ≠ old seed, late world record → loud). 12 mutations killed, among them M1 = the pre-fix live-flag
read (17 red, all four S10 owner-scenario pins).

**Finding 768 🟠 (not CS-3a; pre-existing since `5d2e7fd` / Finding 755)** — Chrome performance warning `READ-usage buffer
was written, then fenced, but written again before being read back`. Source: the console-backdrop luminance sampler in
`src/renderer/ThreeRenderer.js` — one PBO created once with `STREAM_READ` (`:4657`), reused by every sample:
`_bdStart` `readPixels` into it (`:4669`) + `fenceSync` (`:4672`), `_bdPoll` `getBufferSubData` (`:4687`). Chrome keeps
a shadow copy of a READ-usage buffer at each fence; the next `readPixels` into the same buffer discards it and warns,
even though the previous sample was read back. Measured on real-GPU headless Chrome (ANGLE D3D11) with CDP: warnings
= `_bdStart` calls exactly, ≈5.5/s (one per `SAMPLE_MS` = 200 ms) while any console tab covers the scene, 0 with
nothing open; the `clear` path is not involved; no other PBO/fence code. Working tree 230, HEAD `bf5a08d` 231 (same
per phase), `d3a8d16` (before 755) 0. A standalone repro gives the same on SwiftShader. Candidate fix (measured 0
warnings, correct data, keeps the async design): re-specify the storage right before the read —
`gl.bufferData(gl.PIXEL_PACK_BUFFER, gw * gh * 4, gl.STREAM_READ)` with `R.pbo` bound in `_bdStart` — plus a
`console_backdrop_smoke` pin. Not fixed in CS-3a-fix (outside the step). Queue row: `FINDINGS_BACKLOG.md`.

**Gate log (owner, live browser, 2026-11-18).**
- **Gate 1 (CS-3a):** steps 1, 2, 3, 4, 6 PASS; step 5 FAIL (galaxySeed 813683454, 2/2 csPeek mismatches) — explained
  by Finding 769 above (the flag was OFF at world creation and ON at `csPeek()`; the code read the live flag).
- **Re-gate (CS-3a-fix): PASS, all four runs.**
  1. Seeded game #1: `seededSystems=true · świat=seedowany`, galaxySeed 612055237, 57 bodies, `worldSeeded: true`,
     `missingSeeds: 0`; `csPeek()` `mismatches: 0`, `emergencySeedUses: 0`, 71/71 (sys_047, sys_006 match).
  2. Seeded game #2: galaxySeed 572914822, 61 bodies (different home system); `mismatches: 0`, emergency 0, 71/71
     (sys_068, sys_036 match).
  3. OFF game, flag flipped after start: `świat=dotychczasowy`, `mismatches: 0`, `worldSeeded: false`, 0/71.
  4. Same as 3, galaxySeed 368141017: `mismatches: 0`, `worldSeeded: false`, 0/71.
- D-CS-18 signed. Finding 769 ✅ closed. Finding 768 🟠 stays open (owner decides separately; queue row in
  `FINDINGS_BACKLOG.md`).

### 3.3 CS-3b — body archetypes (2026-11-18; not committed, owner check pending)

> The rules, table and distribution below are CS-3b **v1**. Owner feedback replaced them with **v2** (§3.3.1:
> flux-driven selection, 21 archetypes, `toxic` → `hothouse`, 5 moon archetypes, terran water bands).

Data only. Nothing renders differently: the renderer does not read the new fields (keeper pin), and the gas giant bake
uniforms are bit-identical to `0286487` (keeper A6).

**Files.**
- `src/data/BodyArchetypes.js` (pure data, no imports): 15 rows = the 12 D-CS-1 surface archetypes + 3 gas rows. Each
  row: `id`, `family`, `nameKey` (i18n), `match` clauses, `field` (noise parameters), `biomes` (class → one of the 10
  terrains of §1.E, D-CS-3), `atmosphere {tint, density}`, `clouds {coverage}`, `gridClass`; planetoid `palettes` per
  `planetoidType`; gas `gasPreset`. `field` / `atmosphere` / `clouds` are **placeholders**, tuned in CS-4 / CS-6, not pinned.
  `GRID_TILE_COUNTS` is the one D-CS-8 table (`planetoid 92, moon 92, gas 92, hot_rocky 162, small_rocky 162,
  large_rocky 252, largest_cap 362`; small/large split at 1.5 M⊕).
- `src/utils/BodyArchetypeLogic.js` (pure; imports only the data file and `SeedMath`): `select`, `candidatesFor`,
  `deriveTidallyLocked`, `bodyParamsOf`, `gridClassFor`, `assignBodyArchetype` (`??=`).
- Body fields: **`bodyArchetype`** (string) and **`tidallyLocked`** (boolean). The field is not called `archetype`
  because `empire.archetype` (EmpireData `ARCHETYPES`) is read in ~25 places.

**Selection.** Clauses of a row match when all their conditions hold; a row scores the highest `priority` among its
matching clauses; the highest score in the body's family wins. Ranges are open on both ends (`min < v < max`). Equal
top scores are a tie, decided only by `surfaceSeed` (`mixSeed(seed ^ salt) % n`, table order). Ties happen on purpose
where two rows of equal priority overlap (for example terran/jungle at 25–30 °C). Every family has one condition-free
fallback clause (priority 0), so the selector is total. Inputs: `planetType` / `moonType` / `planetoidType`, surface
temperature °C, `atmosphere`, `composition.H2O` (% mass), mass (M⊕), `lifeScore`, `tidallyLocked`.

| Archetype | Family | Clause (priority) |
|---|---|---|
| terran | planet | breathable + lifeScore ≥ 50 (**90**) · breathable, −25 < T < 30 (60) |
| ocean | planet | thin/breathable/dense/thick, 0 < T < 60, H2O > 8 (65) |
| jungle | planet | breathable, 25 < T < 80, H2O > 2.5 (60) |
| desert | planet | breathable, 25 < T < 80, H2O < 2.5 (60) · rocky/hot_rocky, thin, H2O < 3, −80 < T < 150 (40) |
| ice | planet | breathable, T < −20 (60) · planetType ice (45) · rocky/hot_rocky, H2O > 8, T < 0 (40) |
| tidally_locked | planet | rocky/hot_rocky + tidallyLocked (55) |
| volcanic | planet | rocky/hot_rocky, T > 150 (50) · rocky/hot_rocky, mass > 4.5, thin/dense/thick, T > −60 (50) |
| toxic | planet | rocky/hot_rocky, dense/thick, T > −30 (50) |
| barren | planet | atmosphere none (30) · fallback (0) |
| gas_warm → preset `gas_warm` | gas | T > −73 (10) |
| gas_temperate → preset `gas_giant` | gas | fallback (0) |
| gas_cold → preset `gas_cold` | gas | T < −193 (10) |
| rocky_moon | moon | moonType rocky (10) · fallback (0) |
| icy_moon | moon | moonType icy (10) |
| planetoid (palette = `planetoidType`) | planetoid | fallback (0) |

The gas thresholds are the `resolveTextureType` thresholds (`PlanetTextureUtils.js`), pinned on both sides.
`GasGiantShader` still picks its preset from `resolveTextureType`, not from the archetype (D-CS-5).

**tidallyLocked.** `planet` and `a < TIDAL_LOCK_BASE_AU · ∛M_class` with `TIDAL_LOCK_BASE_AU = 0.85` and the
class mass from `STAR_TYPES` (`M 0.3, K 0.7, G 1.0, F 1.4`; unknown class → 1.0). Lock radius: M 0.569, K 0.755,
G 0.850, F 0.951 AU. The shape (∝ M★^(1/3)) is the Peale/Gladman synchronisation radius at a fixed system age. The base is
calibrated to the game's compressed inner orbits: the generator places no planet inside ≈0.55 AU (M), 0.56 (K),
0.71 (G), 1.22 (F) (5 seeds × 72 systems), so a physical base of ≈0.3–0.5 AU would lock no planet at all. Moons and
planetoids: `false` (a moon is locked to its planet, not to the star). Eccentricity is ignored (game e ≤ 0.09). Pure
function of the stored orbit and star class: no RNG.

**Assignment (all after `surfaceSeed`, never in the generator, 0 RNG draws).**
- Foreign systems: `StarSystemManager.generateAndRegister`, right after `assignSurfaceSeeds`, with the system star.
- Home system and old saves: `StarSystemManager.assignMissingArchetypes()` (star = the `star` entity with the same
  `systemId`), called right after `assignMissingSurfaceSeeds` in `GameScene.start()` (log `[CS-3b] archetyp nadany: N`)
  and in `GameCore.boot()`. In a new game this runs after `generateCivScenario`, that is after `makeHomeworldBreathable`.
- **AI homes.** `EmpireColonyBootstrap` mutates the AI home (`makeHomeworldBreathable`) after `generateAndRegister`
  has already picked the archetype from the pre-mutation parameters. The bootstrap clears and re-selects the archetype
  of that one body right after the mutation. This is the only re-selection; it happens during world creation, before the
  body is ever shown. Without it, AI homes came out `desert` / `tidally_locked` (mutation M9). D-CS-2 (freeze) applies
  from there on.
- Frozen (D-CS-2): `assignBodyArchetype` is `??=`. Later drift of temperature, atmosphere, orbit or `lifeScore` never
  re-selects.
- Save: `_serializePlanet` / `_serializeMoon` / `_serializePlanetoid` write both fields (`null` when unset).
  `_restoreSystem` reads `?? null`, and the start-up pass fills the gaps. No save version bump (`CURRENT_VERSION` 101).
  The canonical fixture gets an archetype for 364/364 bodies; re-save + reload is stable.
- Debug: `csWorlds()` gains `archetype` and `tidallyLocked` columns and `missingArchetypes` in its summary;
  `csArchetypes()` prints the distribution over all generated systems of the current game (per family, counts, %).

**Headless distribution (all 72 systems, seeded world).** `node src/testing/headless/probe-cs3b-archetypes.mjs`. Seeds:
the harness seed plus the four owner gate seeds of CS-3a. Real game path (`registerHomeSystem` → seeds → archetypes →
`generateAndRegister` × 71). AI home mutations are not part of the census (they run in the boot column).

| Planet family | −2102099243 | 612055237 | 572914822 | 813683454 | 1640489291 | Σ | % |
|---|---|---|---|---|---|---|---|
| terran | 10 | 10 | 11 | 8 | 14 | 53 | 2.8 |
| ocean | 0 | 0 | 0 | 0 | 0 | 0 | **0.0** |
| jungle | 3 | 2 | 0 | 1 | 4 | 10 | 0.5 |
| desert | 46 | 38 | 31 | 41 | 29 | 185 | 9.6 |
| ice | 168 | 185 | 202 | 186 | 182 | 923 | **48.1** |
| volcanic | 23 | 9 | 14 | 15 | 16 | 77 | 4.0 |
| toxic | 11 | 15 | 8 | 13 | 13 | 60 | 3.1 |
| barren | 75 | 63 | 87 | 71 | 70 | 366 | 19.1 |
| tidally_locked | 46 | 55 | 46 | 49 | 49 | 245 | 12.8 |

| Other families (Σ over 5 seeds) | count | % |
|---|---|---|
| gas_warm / gas_temperate / gas_cold | 0 / 318 / 430 | **0.0** / 42.5 / 57.5 |
| rocky_moon / icy_moon | 2548 / 2561 | 49.9 / 50.1 (two-archetype family: structural) |
| planetoid | 10088 | 100 |

Bodies per seed: 3639 / 3468 / 3465 / 3736 / 3556, 0 without an archetype. tidallyLocked: 269 / 2667 planets = 10.1%
(gas giants included); 24 of them are breathable and stay in the terran family.

**Homeworld archetype per seed** (player = census and `GameCore.boot`; AI = boot, after the bootstrap mutation):

| Seed | Player home | AI homes |
|---|---|---|
| −2102099243 | terran (F star, 1.457 AU, 22 °C, H2O 6%) | terran (locked), **ocean** (locked) |
| 612055237 | terran (M, 1.05 AU, 10 °C, H2O 30.7%) | terran (locked), terran |
| 572914822 | terran (K, 0.59 AU, **locked**) | terran, terran (locked) |
| 813683454 | terran (M, 0.55 AU, **locked**, H2O 25.4%) | **ocean** (locked), terran (locked) |
| 1640489291 | terran (K, 0.753 AU, **locked**) | terran (locked) ×2 |

The player home is terran in 5/5 seeds through the biosphere clause (`lifeScore` 100 set by `generateCivScenario`).
Without that clause, M-star homes (H2O 25–31%) would be `ocean` (mutation M18). AI homes have `lifeScore` 0, so 2/10
are `ocean` (habitable, but more ocean tiles later in CS-5).

**Outliers and open questions for the owner (not tuned; recommendation first).**
1. **`ice` 48.1% of planets (> 40%).** 586 are `planetType 'ice'` (30.5% alone), 337 are frozen water-rich rocky
   planets. Cause: the generator is cold-heavy (85.0% of planets, gas included, orbit beyond 2× the HZ inner edge). Options: *(a, recommended)*
   `planetType 'ice'` with a dense atmosphere → `toxic` (Titan-like haze; −197 → ice ≈ 38%, toxic ≈ 13%);
   *(b)* frozen rocky → `ice` only below −100 °C (ice ≈ 42.5%); *(c)* keep (physically honest).
2. **`ocean` never appears in a generated galaxy.** Liquid-water temperatures and H2O > 8% never meet in the
   generator: H2O-rich rocky planets sit beyond the frost line, and breathable worlds carry H2O 2–3%. Only mutated
   AI homes reach it. Measured alternative: ocean = breathable + H2O ≥ 3 (`hasWater`) + 0 < T < 40 → 3 planets in 5
   galaxies (0.16%), so a rule change alone does not make ocean worlds common. Options: *(a, recommended)* keep (ocean
   = rare look, mostly AI homes) and decide in CS-4/CS-6 whether ocean coverage should come from the surface sea level
   instead; *(b)* generator-side water (composition templates) — a physics/balance change outside this step.
3. **`gas_warm` never appears**, the same as today: no gas giant is warmer than −73 °C, so the `gas_warm` shader
   preset is unused today too. The mapping is faithful (D-CS-5); a change belongs in CS-11.
4. **Tidal lock vs breathable.** 3/5 player homes and 8/10 AI homes are tidally locked (K/M stars). Breathable worlds
   stay in the terran family; the flag is stored, so CS-6 can still use it (for example a fixed terminator). *Option:*
   let `tidally_locked` win over the breathable rows (priority 61); homes would then be eyeball worlds in ≈60% of games.
5. **AI homes `ocean` vs player `terran`.** The asymmetry comes from `lifeScore` (player 100, AI 0). *Option:* the AI
   bootstrap could set the same biosphere marker, so that every civilisation homeworld is terran.

**Keeper** `src/testing/smoke/colony_sphere_archetypes_smoke.mjs` (A1–A10, 116 pins). Trace
`src/testing/fixtures/traces/CS3b-world-baseline.json` (recorded with this keeper's `--record` on a
`git worktree --detach 0286487`), helper `src/testing/headless/GasUniformsDigest.mjs` (a process-local
`registerHooks` resolve hook replaces `three` only for `GasGiantShader` / `PlanetTextureUtils` / `PlanetShader`; the
tracked stub is not touched).
- Fail-first on the base worktree: 37 red / 11 green. The 11 green are controls: trace loaded, witness, schema, seeded
  world identical to the base apart from the new fields (3 seeds), gas uniforms = base, renderer pin, CS-3a OFF trace.
- 19 mutations, all killed (tie without seed, tie via `Math.random`, missing planet / planetoid fallback, freeze removed,
  `generateAndRegister` without assignment, GameCore without the pass, pass before seeds, save without the field,
  restore without the field, AI home without re-selection, moons locked, gas threshold −80, tidal lock drawing
  `Math.random`, missing EN key, pass ignoring the star, tie with seed 0, missing `csArchetypes` alias, missing
  biosphere clause).
- Sweep `node src/testing/smoke/run-all.mjs --quiet`: 428/428 OK, 0 FAIL. `node tools/check-i18n.mjs`: PASS.

#### 3.3.1 CS-3b-v2 — realistic + diverse archetypes (2026-11-18; not committed, owner away)

Owner feedback: the CS-3b galaxy was too uniform (ice 48%, barren 19%, locked 13%, terran+jungle 3%, ocean 0%).
D-CS-1 revised (§0b). Data + selector only: no visual change, no physics change, colony grid untouched, gas bake
uniforms still bit-identical to `0286487` (keeper A6).

**Part 1 — temperature model audit (read + measure; physics unchanged).**
- Planets: `SystemGenerator._makePlanet` (`src/generators/SystemGenerator.js:345-349`): `T_eq = 278·(1−albedo)^¼·L^¼/√a`
  (`:436-437`), albedo per `planetType` (`GameConfig.js:707+`), plus a **flat additive greenhouse** per atmosphere
  `GREENHOUSE = { none 0, thin 15, breathable 20, dense 60, thick 35 }` °C (`:21`; `thick` < `dense` — inverted).
  Atmosphere is rolled from `T_base_C` (`getAtmosphere :482`). Orbit change: `_adjustOrbit :418-430` (same formula).
- Moons: `_makeMoon :1139-1149`: `T_eq` from the **parent's** orbit, albedo icy 0.6 / rocky 0.12, same flat greenhouse;
  no tidal or parent heating. Moon atmospheres only when cold (`getAtmosphereMoon :508`).
- Planetoids: `:707-712`: `T_eq` only, airless.
- Homeworld: `makeHomeworldBreathable :751-775` clamps to 5–35 °C (Earth-like) regardless of the orbit.
- Later: `LifeSystem._recalcTemp` (`src/systems/LifeSystem.js:117-131`) re-applies the same formula (its own copy of the
  greenhouse table) to every planet of the **active** system every 1000 game years (`CHECK_INTERVAL :28`), with the
  **home** star (`this.star`, `:32`) → **Finding 770** below.
- No day/night (airless) model, no runaway greenhouse, no tidal heating anywhere.

Headless table (`node src/testing/headless/probe-cs3b-temperature.mjs`, 5 seeds × 72 systems; zones by the stored class
HZ: inner `a < hz.min`, hz, outer `≤ 2.2·hz.max`, frost beyond; moons use the parent's `a`). °C min / median / max (n):

| Body | Atmosphere | inner | hz | outer | frost |
|---|---|---|---|---|---|
| rocky | none | −4 / 39 / 67 (22) | −85 / −21 / 28 (74) | −144 / −108 / −51 (150) | −237 / −156 / −134 (29) |
| rocky | thin | 6 / 39 / 82 (33) | −62 / −6 / 53 (170) | −130 / −90 / −36 (421) | −213 / −143 / −114 (93) |
| rocky | breathable | 16 / 41 / 56 (9) | −37 / 1 / 54 (75) | −71 / −44 / 13 (31) | 10 (1, home) |
| rocky | dense/thick | 114 / 117 / 125 (5) | −25 / 11 / 84 (18) | −86 / −43 / 2 (164) | −150 / −97 / −73 (37) |
| ice | none / thin / dense | — | — | −160…−60 (38) | −243…−84 (548) |
| gas | none | — | — | −155 / −131 / −107 (19) | −242 / −198 / −138 (729) |
| moon rocky | none | −4 / 29 / 70 (61) | −83 / −19 / 41 (346) | −145 / −103 / −48 (750) | −240 / −187 / −127 (1265) |
| moon rocky / icy | thin | — | −53 / −49 / −49 (2) | −136…−41 (56) | −231…−112 (154) |
| moon icy | none | — | — | −168 / −148 / −119 (117) | −246 / −206 / −150 (2358) |
| planetoid | none | — | −43 (1) | −146 / −115 / −51 (120) | −252 / −221 / −124 (9967) |

Owner-rule violations (rule / bodies it applies to):

| Rule | Test | Violations |
|---|---|---|
| R1 airless and not close to the star is very cold | `none`, `a ≥ hz.min`, T > 0 °C | 101 / 16044 (0.6%) |
| R1b airless close to the star is Mercury-hot | `none`, `a < 0.5·hz.min`, T < 100 °C | 0 / **0** (no body exists that close) |
| R2 atmosphere in the HZ is temperate | thin/breathable in HZ, T ∉ (−20, 50) | 83 / 247 (33.6%) |
| R3 dense/thick is greenhouse-hot | dense/thick at `a ≤ hz.max`, T < 100 °C | 18 / 23 (78.3%) |
| R4 distant moon with atmosphere is below zero | moon, atmosphere, parent `a > hz.max`, T ≥ 0 | 0 / 210 |

Structural facts found by the same probe: **M-star systems have 0 planets in their HZ** (0/684; `minOrbitAU =
max(0.35, 0.15 + 0.4·M★)` = 0.35 AU = the M HZ outer edge, `SystemGenerator.js:269`); `hot_rocky` exists once in
5 galaxies; the class HZ is fixed while luminosity varies ×0.41–2.07 per star (`L ∝ M⁴`, `:213`), so the stored HZ and
the real flux disagree. Homeworld clamp vs the formula: F 1.457 AU 22 → 43.5 °C, **M 1.05 AU 10 → −130.6 °C**,
K 0.59 AU 21 → 20.7, **M 0.55 AU 13 → −100.7**, K 0.753 AU 14 → −22.3 (what `LifeSystem` writes on its first check).
Options and gameplay consequences: **D-CS-19** in §4.

**Part 2 — archetypes v2.** Files: `src/data/BodyArchetypes.js` (21 rows), `src/utils/BodyArchetypeLogic.js`
(`archetypeContext`, `fluxOf`, `moonZoneOfRank`, `waterBandOf`, `planetoidPaletteOf`, `HOMEWORLD_ARCHETYPE`;
`assignBodyArchetype(body, ctx, { homeworld })`), `StarSystemManager` (per-system context in `generateAndRegister`
and `assignMissingArchetypes`), `EmpireColonyBootstrap` (AI home → `homeworld: true`), `SaveSystem._serializePlanet` /
`GameScene._restoreSystem` (`waterBand`, `waterCoverage`), `ColonySphereDebug`, i18n PL/EN (`toxic` key removed;
+hothouse, cryo_haze, scorched, 5 moons, planetoid_icy).

Drivers: flux `S = L/a²` in S⊕ (moon: the parent's `a`; star `luminosity`, else class luminosity), thresholds
`FLUX_HOT 1.5`, `FLUX_WARM 1.1`, `FLUX_HZ_OUTER 0.35` (= `L/hz.max²` of every class ±0.03; also the CO₂
maximum-greenhouse limit), `FLUX_FROST 0.072` (= 2.2·hz.max), `FLUX_KUIPER = FLUX_FROST/100` (10× the frost distance).
Moon zone = rank among the parent's moons sorted by `a`: inner `r < n/3`, mid `r < 2n/3`, outer.

| Archetype | Family | Clauses (priority) |
|---|---|---|
| terran | planet | breathable + lifeScore ≥ 50 (90) · breathable, 0.35 < S < 1.5 (60) |
| ocean | planet | thin/breathable/dense/thick, 0.35 < S < 1.5, H2O > 8 (65) — rare |
| jungle | planet | breathable, H2O > 2.5, S > 1.1 or T > 35 °C (61) |
| desert | planet | breathable, H2O < 2.5, S > 1.1 or T > 35 (61) · rocky/hot_rocky, thin, H2O < 8, S > 0.072 (40) |
| ice | planet | breathable, S < 0.35 (62) · ice, none/thin (45) · rocky, none/thin, H2O > 8, S < 0.35 (40) |
| hothouse | planet | rocky/hot_rocky, dense/thick, S > 0.35 (60) |
| cryo_haze | planet | dense/thick, S < 0.35 (60) — includes ice planets with a dense atmosphere |
| tidally_locked | planet | rocky/hot_rocky, locked, none/thin (55) |
| volcanic | planet | rocky, T > 150 (50) · rocky, mass > 4.5, thin, S > 0.072 (50) |
| scorched | planet | none, S > 1.5 (50) · none, T > 100 (50) |
| barren | planet | none (30) · fallback (0) |
| gas_warm / gas_temperate / gas_cold | gas | unchanged (`resolveTextureType` thresholds) |
| hazy_moon | moon | atmosphere, T < 0 (50) · atmosphere, S < 0.35 (50) |
| volcanic_moon | moon | rocky, parent gas, inner (40) |
| icy_cracked | moon | icy, parent gas, inner/mid (40) · icy, parent ice, inner (40) |
| icy_cratered | moon | icy (10) |
| rocky_cratered | moon | rocky (10) · fallback (0) |
| planetoid_icy | planetoid | carbonaceous/silicate, S < FLUX_KUIPER (10) — palette `icy` |
| planetoid | planetoid | fallback (0) — palette = `planetoidType` |

Every row keeps `nameKey` (PL + EN), family, rules, biome → one of the 10 terrains (D-CS-3), placeholder `field`,
`atmosphere.tint`, `clouds.coverage`, `gridClass` (D-CS-8 table). Terran rows read `seaFromWaterCoverage`.
**CS-6 must add visual variants within each archetype** (from `surfaceSeed` and star-class palettes) so that two
worlds of the same archetype never look identical. Planetoid seed variation for CS-4/CS-6 (documented in the data file,
not stored, not computed now): crater density ×0.6–1.4, albedo ×0.8–1.2, one giant crater on ≈1 in 6 bodies.

`waterBand` / `waterCoverage` (terran only, frozen `??=`): `s = u + clamp(0.02·(H2O − 3), ±0.1)`, `u =
mixSeed(surfaceSeed ^ salt)/2³²`; bands by share continental 15% (15–40%) · balanced 25% (40–65%) · oceanic 60%
(65–90%); coverage linear inside the band, rounded to 0.001. Pure hash, 0 RNG draws.

**Distribution** (`node src/testing/headless/probe-cs3b-archetypes.mjs`, 5 seeds × 72 systems; per-galaxy counts in
the probe output):

| Planets (n = 1919) | count | % | galaxies |
|---|---|---|---|
| ice | 621 | 32.4 | 5/5 |
| cryo_haze | 395 | 20.6 | 5/5 |
| desert | 313 | 16.3 | 5/5 |
| tidally_locked | 203 | 10.6 | 5/5 |
| barren | 149 | 7.8 | 5/5 |
| volcanic | 110 | 5.7 | 5/5 |
| terran | 81 | 4.2 | 5/5 |
| hothouse | 26 | 1.4 | 5/5 |
| jungle | 13 | 0.7 | 4/5 |
| scorched | 8 | 0.4 | 4/5 |
| ocean | 0 | 0 | 0/5 (exempt) |

| Moons (n = 5109) | count | % | | Planetoid palettes (n = 10088) | count | % |
|---|---|---|---|---|---|---|
| rocky_cratered | 1955 | 38.3 | | metallic | 2990 | 29.6 |
| icy_cracked | 1625 | 31.8 | | carbonaceous | 2585 | 25.6 |
| icy_cratered | 850 | 16.6 | | icy | 2607 | 25.8 |
| volcanic_moon | 467 | 9.1 | | silicate | 1906 | 18.9 |
| hazy_moon | 212 | 4.1 | | | | |

Gas (unchanged): gas_warm 0 / gas_temperate 318 / gas_cold 430 (exempt). Terran `waterBand` (n = 81): oceanic 60.5% ·
balanced 25.9% · continental 13.6% (target 60/25/15 ± 7). Homeworlds: **15/15 terran** (5 player + 10 AI). tidallyLocked
269/2667 planets. **All targets met**: max planet archetype 32.4% (≤ 35), max moon 38.3% (≤ 45), every archetype in
≥ 3/5 galaxies except the exempt `ocean` / `gas_warm`.
Physically limited, not forced: terran + jungle stay ≈ 5% because breathable atmospheres are ≤ 2 per system and ≈ 6% of
rocky/ice planets in the generator; `ocean` stays 0 (no water-rich world sits in the HZ flux band); `scorched` / `hothouse`
are rare because no planet orbits inside ≈ 0.5·hz.min (`minOrbitAU`). Changing these is generator/physics work (D-CS-19).

**Look vs stored temperature** (input to D-CS-19; contradiction = terran/ocean T ≤ −10 or ≥ 60, jungle ≤ 10 or ≥ 80,
ice/cryo_haze/icy moons > 0, hazy_moon ≥ 0, hothouse/scorched < 50): **71 / 3831** bodies — terran 43/81 (HZ worlds the
flat model leaves frozen), hothouse 20/26 (flat +60 °C instead of a runaway greenhouse), scorched 8/8 (mean equilibrium,
no day side); 0 for ice, cryo_haze, jungle, icy moons, hazy moons.

**Decisions taken by CC while owner away — ✅ ALL 10 SIGNED by the owner (2026-11-18).**
1. **Flux is the primary driver** for planets and planetoids; thresholds are anchored on the game's own HZ table
   (`FLUX_HZ_OUTER` = `L/hz.max²` of every class) rather than on literature values; stored temperature is a secondary
   clause (jungle/desert > 35 °C, volcanic > 150 °C, scorched > 100 °C, hazy_moon < 0 °C).
2. **hothouse ↔ cryo_haze split at the HZ outer edge** (S = 0.35, the CO₂ maximum-greenhouse limit): dense rocky planets
   beyond it (164, stored −86…2 °C) are cryo_haze, not hothouse.
3. **Breathable beyond the HZ (S < 0.35) → ice** (snowball), breathable on the warm side (S > 1.1) → jungle / desert by
   H2O; breathable in the HZ stays terran even when the stored temperature is −37 °C (flux wins; counted above).
4. **tidally_locked only for none/thin atmospheres**: a dense atmosphere evens out day and night (hothouse / cryo_haze
   win); breathable stays terran (owner OK).
5. **Moon zones by rank** among the parent's moons (n/3, 2n/3), not by absolute distance; icy inner moons of ice giants
   are also `icy_cracked` (Miranda/Ariel).
6. **Icy planetoids only beyond 10× the frost line and only carbonaceous/silicate**: almost every planetoid is beyond the
   frost line (5th percentile 1.7×), so "beyond the frost line" would make 99% icy; metallic keeps the metallic look so
   the look agrees with the gameplay `planetoidType`. The icy look is a separate archetype id `planetoid_icy`
   (frozen like every archetype), palette via `planetoidPaletteOf`.
7. **Homeworlds**: AI homes are forced terran in `EmpireColonyBootstrap` (`homeworld: true`, after the mutation); the
   player home is terran through the biosphere clause (lifeScore 100, priority 90). Old saves: the player home is terran
   the same way; AI homes of an old save get the rules (colonies are restored after the start pass, so the pass cannot
   know them) — almost always terran, possibly jungle/ocean/ice.
8. **Stored ids outside the table** (`toxic`, `rocky_moon`, `icy_moon` from uncommitted CS-3b v1 test saves) are not
   archetypes: the start pass re-selects them. Valid ids stay frozen.
9. `waterBand` H2O shift ±0.1 max (homeworld H2O ≥ 6% leans oceanic); exact `waterCoverage` stored for CS-4/CS-6.
10. No save version bump (`CURRENT_VERSION` 101); new planet fields `waterBand`, `waterCoverage` written as `null` when
    unset, restored `?? null`, filled by the start pass.

**Keeper** `colony_sphere_archetypes_smoke.mjs` (A1–A11, 161 pins): new pins for the v2 table, flux thresholds vs
`STAR_TYPES`, `STAR_CLASS_LUMINOSITY`, `WATER_BANDS`, rename (no `toxic` / `rocky_moon` / `icy_moon` in data or i18n),
totality over 1 041 600 parameter combinations incl. flux / parent / moon zone, tie witness volcanic/scorched, 32 point
rules, `fluxOf` / moon zones, waterBand frozen under H2O drift, legacy-id re-selection, homeworld forcing, 20 000-seed
band split ±1.5 pp, world path vs `select` with the system context, AI homes terran with bands, save/restore of the
bands (serializer + source pin), fixture `??=` gives every terran a band, debug columns, **A11 headless galaxy**
(5 seeds: planet ≤ 35%, moon ≤ 45%, presence ≥ 3/5, waterBand ± 7 pp, 15/15 homes terran). Trace `CS3b-world-baseline.json`
unchanged (the v2 fields join the skipped key set; base digests still equal).
- Fail-first on `git worktree --detach 0286487` (keeper + trace + `GasUniformsDigest.mjs` + probe copied; `three` stub
  **copied** into the worktree's `node_modules`, no junction): **18 green / 74 red**, no abort. The 18 green are controls
  and witnesses (trace, schema, 3 seeded worlds = base, 3 gas-uniform pins, renderer pin, CS-3a OFF trace, AI-home and
  SaveSystem witnesses, no version bump, generator pin, fixture witnesses).
- **24 mutations, all killed**: waterBand not frozen, waterBand via `Math.random`, AI home without `homeworld`, moon flux
  from its own `a`, moon zones unsorted, legacy id kept, save without `waterBand`, restore without `waterCoverage`,
  luminosity ignored, cryo_haze only beyond the frost line, `toxic` key back in pl.js, csWorlds without `waterBand`,
  metallic planetoids icy, terran without bands, SSM pass without system context, `generateAndRegister` without context,
  H2O gain sign flipped, ice planets with dense atmosphere → ice, band shares 50/30/20, locked over dense atmosphere,
  hazy_moon without the atmosphere condition, freeze removed, tie via `Math.random`, AI home without re-selection.
- Sweep `node src/testing/smoke/run-all.mjs --quiet`: **428/428 OK, 0 FAIL** (30 advisory). `node tools/check-i18n.mjs`:
  **PASS**.
- Debug: `csWorlds()` adds `waterBand`, `waterCoverage`, `palette` columns and `terranWithoutWaterBand` (0);
  `csArchetypes()` lists all 21 archetypes plus `planetoidPalettes` and `terranWaterBands`.

**Finding 770 🟠 (filed by this step, no step yet).** `LifeSystem._checkAll` (`src/systems/LifeSystem.js:69-72`) recomputes
`temperatureC` of every planet of the **active** system every 1000 game years with the **home** star's luminosity
(`this.star`, set once in `GameScene.js:309`). (a) In a foreign system it writes temperatures from the wrong star;
(b) on the home system it undoes the homeworld clamp (M-star homes: 10 → −131 °C, 13 → −101 °C; K: 14 → −22 °C), after
which `_calcPotential` may decay the homeworld's `lifeScore`. Reachable at 1 y/s after ≈ 17 real minutes. Archetypes are
frozen, so the look does not change. Owner decision (2026-11-18): fixed in a separate small fix step together with #768,
before CS-PHYS (not part of D-CS-19).

**Finding 770 ✅ closed (fix step 770+768, 2026-11-18).** `LifeSystem` recomputes each planet with its own system's star
(`starOf`, `ownStarTempC`); homeworlds (player + every AI empire, picked by the bootstrap rule from `homeSystemId`) pass
`guardHomeworldTempC` (`src/utils/HomeworldClimate.js`): formula in 5–35 °C → formula; else the current clamped value; both
out of band (save corrupted by the old bug) → 10 / 25 °C. Flag `FEATURES.lifeTempOwnStar` (default true, OFF = old path
bit-identical). Measured: 5 player homes F 22 / M 10 / K 21→20.7 / M 13 / K 14 stay in band over 3 checks (OFF: 43.5 / −130.6 /
20.7 / −100.7 / −22.3); 40 foreign planets equal generation values (OFF 40/40 wrong). Keeper `life_temperature_smoke` (24 pins,
fail-first 14 red, 10 mutants killed). Known limitation: a destroyed empire's homeworld loses the protection. The lifeScore rise
on AI homeworlds has no gameplay effect (LifeSystem is legacy). Debug: `csTemp()`, `csLifeTick()`.
**Owner light check (2026-11-18): PASS** — existing save, home Tycho I (GJ-2653 M): csTemp out of band 0, temperatureC 10;
csLifeTick ×2 10 → 10, life 100 → 100, changed 0; console over a bright scene 2 min: 0 READ-usage warnings (#768 ✅), glow adapts.
CS-PHYS no longer carries 770; when temperatures become generation-time frozen it switches `LifeSystem._recalcTemp` off.
Idea (not scheduled): reuse LifeSystem as a life generator for the player to discover in unowned systems.

**Gate log — owner light check (live browser, 2026-11-18): PASS.**
1. Old save (pre-CS-3b, galaxySeed 1533524380, world legacy): log `[CS-3b] archetyp nadany: 611`; `csArchetypes`
   missingArchetypes 0, terranWaterBands missing 0, 21 rows, tidallyLocked 10/95.
2. Save → F5 → Continue: `archetyp nadany: 0`, identical counts.
3. Seeded new game (galaxySeed -138766827): `świat=seedowany`, `archetyp nadany: 31`; missing 0, terranWaterBands
   missing 0, planetoid palette icy present.
4. `csWorlds`: missingArchetypes 0, terranWithoutWaterBand 0; homeworld New Earth = terran, tidallyLocked true,
   waterBand oceanic, waterCoverage 0.701.
5. System map + colony open: no visual change, no red console errors.

---

## 4. Decisions for Filip (recommendation first)

> ✅ All signed 2026-11-18. The binding text, with conditions (D-CS-5, D-CS-8) and the new D-CS-17 / D-CS-18, is **§0b**. This
> section keeps the original options for the record.

- **✅ D-CS-1 Archetype list and selection rules.**
  - *Recommended:* 12 archetypes:
    - planets: terran, ocean, jungle, desert, ice, volcanic, toxic, barren, tidally-locked;
    - moons: rocky moon, icy moon;
    - planetoids: metallic / carbonaceous / silicate as one family with 3 palettes;
    - gas: warm / temperate / cold bands (existing `GAS_PRESETS`).
  - Selection by stored params: `planetType`/`moonType`/`planetoidType` → family; then temperature × atmosphere ×
    `composition.H2O` × `lifeScore` → archetype; star class tints the palette; ties broken by `surfaceSeed`.
  - Tidally locked needs a new stored boolean (rule: orbit < x AU around K/M stars). This is a param addition, so it
    could be deferred.
  - *Alternatives:* fewer (6, faster to tune) or more (sub-variants per star class).
- **✅ D-CS-2 Freeze the archetype.** *Recommended:* store `archetype` at first assignment; parameter drift does not repaint.
  *Alt:* recompute live (a world can change look after a climate event; tile terrain must then stay frozen anyway).
- **✅ D-CS-3 Gameplay terrain vocabulary.** *Recommended:* keep exactly the 10 terrains; biomes map onto them (§1.E table).
  No new unbuildable "peaks / pack ice / rim" in this arc. *Alt:* add 1-3 new terrains (impassable peaks, crater rim) as
  a separate balance step after CS-5.
- **✅ D-CS-4 Save: break vs migration.** *Recommended:* dual grid during the arc (old colonies stay flat behind TileGraph);
  **clean break at arc end** (CS-12, v75→76 pattern) with fixture re-capture. Seeds and archetypes are assigned to old
  bodies with `??=` without any break. *Alt:* one-shot migration (≈500-900 lines, risk of silently invisible buildings,
  §1.H); or keep the flat grid forever for old colonies (violates the arc-end flag rule).
- **✅ D-CS-5 Gas giants.** Today they host player and AI outposts (§1.G). *Recommended:* look via the existing
  `GasGiantShader` fed by archetype params; on the colony screen a geodesic "platform deck" grid (n=3, 92 tiles, today's
  4-terrain mix, drawn as a cloud-top lattice). *Alt:* look-only, with outposts on gas giants as abstract slots (a
  gameplay change for an outpost path the AI uses).
- **✅ D-CS-6 Derived vs kept attributes.** *Recommended:* parameters → archetype → surface → terrain; habitability,
  atmosphere, temperature, composition and per-body deposits stay as today; ocean fraction from H2O. Per-tile deposit
  spots for the Deposits lens: **visual only** in this arc (mines keep extracting body-wide); real per-tile deposits would
  be an economy arc. *Alt:* per-tile deposits now (economy + AI change).
- **✅ D-CS-7 Latitude rule on a sphere.** *Recommended:* bands by tile-centre latitude, with thresholds chosen per `n` so
  the *share* of ×0.5 and ×0.7 tiles matches today's average per size class (keeper-checked). *Alt:* drop the latitude
  penalty (balance change) or a smooth cos-latitude curve.
- **✅ D-CS-8 Tile count per body size.** Options are 42 (n=2), 92, 162, 252, 362 (today 36-300, §1.A). *Recommended:*

  | Body | Tiles |
  |---|---|
  | planetoid | 92 |
  | moon | 92 |
  | gas | 92 |
  | hot_rocky | 162 |
  | ice / rocky ≤1.5 M⊕ | 162 |
  | rocky >1.5 M⊕ | 252 |
  | `largestHexMaps` cap | 362 |

  n=2 is rejected: 12 pentagons out of 42 tiles is 29%. Because planetoids and moons gain tiles, the archetype's
  unbuildable share (rim, rock, ocean) is tuned so **buildable tiles per class stay within ±20% of today's mean**
  (measured in CS-5). *Alt:* the brief's 92/162/252/362 by size with no buildable-share control.
- **✅ D-CS-9 Pentagons and landings.** *Recommended:* pentagons are "anomaly nodes" (bias anomaly placement there,
  prototype idea; 5 neighbours = −1 adjacency slot, noted in the tile inspector). Landing zone = tiles at graph distance
  ≥ k from any enemy-owned tile or building (replaces `_isEdgeHex`, which would select exactly the pentagons). *Alt:*
  pentagons neutral; landing anywhere not occupied.
- **✅ D-CS-10 Regions (tile groups).** *Recommended:* later; this arc keeps the per-tile model. The ownership lens shows
  today's tile owners. *Alt:* regions now (new ownership/territory mechanics).
- **✅ D-CS-11 Hero render path.** *Recommended:* own WebGL context (ShipHologram pattern) + the same shader module and
  cached data. *Alt:* main renderer into a render target (one context, couples to the main loop).
- **✅ D-CS-12 AI and the new surface.** *Recommended:* no AI body-selection change in this arc; AI tile scoring moves to
  TileGraph (CS-2); optional CS-11 table "expected buildable tiles per archetype". *Alt:* the AI generates surfaces of
  candidate bodies (worker cost, async decisions).
- **✅ D-CS-13 When the 2D colony map is removed.** *Recommended:* at CS-Z after CS-8…CS-12 gates (flag OFF = the 2D map
  until then). *Alt:* remove at CS-8 (faster, no fallback during visual tuning).
- **✅ D-CS-14 Building and unit representation.** *Recommended:* buildings = procedural massing (instanced, category
  silhouettes, role emissives); PNGs stay as inspector portraits (31 exist, see §5). Units = GLB at close zoom, HUD
  marker at mid/far zoom, threshold by on-screen tile size; `_mobile`/`_deployed` where the variant exists, else the base
  GLB. *Alt:* sprites (billboards) from today's GLB snapshots, cheaper and less 3D.
- **✅ D-CS-15 Image-texture assets after the switch.** *Recommended:* keep `assets/planet-textures/` and
  `generate-planets.js` + `lib/` untouched during the arc (critical files). Decide at CS-Z whether to delete
  (≈154 MB; the height maps were never used). *Alt:* delete at CS-Z unconditionally.
- **✅ D-CS-16 Determinism policy.** *Recommended:* gameplay terrain only from `evalAt` at tile centres (no trig);
  colonised bodies persist their terrain string. *Alt:* seed-only (smaller save, cross-browser risk §1.I).
- **✅ D-CS-19 Make the temperature model realistic (SIGNED 2026-11-18: option (b) extended with orbits → step
  CS-PHYS after CS-6: generation-time physical model + `minOrbitAU` scaled by stellar luminosity, behind a `FEATURES`
  flag with OFF = today bit-identical, new worlds only, no save migration, BALANS run, heavy gate. Finding 770 is NOT
  part of CS-PHYS — fixed earlier in a small fix step with #768; item (6) below is superseded.)** Audit in §3.3.1 Part 1. Today: equilibrium
  temperature + a flat greenhouse table, moons from the parent's orbit, no day side, no runaway greenhouse, no tidal
  heating; violations R2 33.6%, R3 78.3%; M systems have no HZ planet; LifeSystem re-applies the formula with the home
  star (Finding 770). Archetypes v2 already look right from the drivers, so the visual layer does not depend on this
  decision (71 / 3831 look-vs-temperature contradictions today).
  - *(a) Keep.* No gameplay change, no save impact. The displayed °C keeps contradicting the look on ≈ half of the terran
    worlds (frozen HZ worlds) and on hothouse/scorched worlds; Finding 770 stays.
  - *(b, recommended) Physical model, generation-time only, frozen afterwards:* greenhouse as a function of atmosphere
    **and** flux (runaway above the HZ inner edge for dense/thick → Venus 300–470 °C; CO₂ collapse beyond the HZ outer edge),
    fix the `thick < dense` inversion, airless bodies get a day-side/night-side pair (stored mean unchanged for
    gameplay, extremes for display), moons add tidal heating for inner moons of giants (Io/Europa) and the parent's
    flux. Gameplay consequences: (1) **habitability** — `_calcPotential` / `LifeSystem` thresholds see different numbers:
    HZ worlds warm up (more life emergence), dense HZ worlds become uninhabitable (hothouse); (2) **population growth**
    and colony comfort read temperature through `CivilizationSystem` (shelter rules) and building gates — needs a
    balance pass (BALANS harness); (3) **AI body evaluation** (Director / `AcceptanceEngine` colony scoring, bootstrap home
    pick `_applyCivHomeworld` scores 0–50 °C) changes targets; (4) **saves**: generated bodies store temperatures, so old
    saves keep old values unless a migration recomputes them (prefer: new worlds only, flag-gated; no migration);
    (5) **RNG**: atmosphere is rolled from `T_base_C`, so changing the base formula changes the RNG-driven atmosphere
    rolls → new worlds differ (fine for a new game, must be behind `FEATURES` with OFF = today bit for bit);
    (6) fix Finding 770 in the same step (LifeSystem uses the body's own star, keeps the homeworld clamp or the new model).
    Also consider `minOrbitAU` for M stars (so M systems can have HZ planets) — a generator change with the same flag.
  - *(c) Display-only.* Keep stored gameplay temperatures, show a "surface range" derived from the drivers in the UI
    (day/night, greenhouse). Zero balance risk, no save change, but two temperatures per body can confuse the player
    and Finding 770 still needs its own fix.
  - Recommendation: **(b)** in its own step after CS-6 (so the archetype look is settled first), behind a flag, new
    worlds only, with a BALANS run; Finding 770 fixed in that step.

---

## 5. Risks and open questions

1. **Cross-engine determinism** (§1.I). Mitigated by D-CS-16. Must be pinned by a source keeper (no `Math.sin|cos|atan2|
   asin|pow|exp` in `evalAt`) and a fixed-vector test.
2. **Seed identity**: `body.id` is order-dependent (`EntityManager.js:19-21`). Using it would make worlds depend on visit
   order. The structural key + stored seed (D-CS-1/§1.D) is mandatory, and the brief's "game seed + body id" is read as
   "game seed + body identity".
3. **Worker + importmap**: any accidental import of `three`, `GameConfig` or `i18n` in the worker graph fails silently in
   the browser. Pin it with a keeper that parses the worker's import graph.
4. **Generation cost is unmeasured** (§1.I *est.*). CS-4 measures in headless Chrome before CS-6 commits to the CPU path.
5. **Balance drift**: tile counts (D-CS-8), latitude bands (D-CS-7), pentagon adjacency (−1 neighbour), and terrain
   shares from a new classifier change the economy of new colonies. CS-5 must report per-type terrain and buildable
   shares vs today, and the AI headless economy probes should run on geo grids.
6. **Invasion / garrison / capture semantics** on a sphere without edges (D-CS-9). AI_CAPTURE and AI_GARRISON plans
   must be re-read before CS-5 (not audited in depth here: Garrison, Army, Withdrawal and StrikeSquadron q,r persistence
   rests on grep hits; `gameState.invasions` shape not read).
7. **Dual grid period**: two TileGraph implementations live at once; every keeper of CS-1/2 must run on both.
8. **Supply GLBs 38.5 MB each**: must be optimized (`npm run ship`-style normalizer or a ground equivalent) before live
   3D units.
9. **Fourth/fifth WebGL context** (hero + existing): a context-loss path is mandatory. The old globe context must be gone
   when the hero opens.
10. **Building PNG count mismatch**: the brief says 61, the repo has 31 in `assets/buildings` (+18 in `assets/icons`)
    for ≈58 definitions. Which art is meant for the inspector portraits?
11. **Finding 759** may mean today's adjacency bonuses differ from what players see. If the owner wants it fixed on the
    flat grid before the sphere lands, that is a behaviour change with its own flag (not part of the CS-1 refactor).
12. **Not audited** (context limit / scope): `BodyTerrainUtils.js` in depth; `CombatSandbox` body creation; RegionSystem
    v2 save reachability; `LifeSystem` scope outside the home system; the exact `gameState.invasions` shape; the
    prototype's shader section (`colony-sphere.html:403-566`) and city-light model (`:716-731`), read only by function
    list.
