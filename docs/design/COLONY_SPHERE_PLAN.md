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
| **D-CS-25 (signed 2026-11-19)** | Moon-orbit generation change in scaled-orbit worlds accepted: moon orbit radii × k at generation for `orbitModel: 2` worlds, no new RNG draws, legacy worlds unchanged, scaled test saves made before the change keep their old moon orbits (§3.9.3). |

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
| **D-CS-20 (new, signed ✅ 2026-11-18)** | Ocean tiles on terran worlds. The terrain report (§3.4.1) shows the terran buildable share dropping from 100% today (today's terran maps have no ocean) to a median 30% (min 14%, max 79%), because terran is always oceanic (D-CS-1 v2). **Accept fewer buildable tiles for now** — fewer does not automatically mean too few; re-evaluate after in-game testing once the sphere grid is live (after CS-5 / CS-8). Ocean buildings (e.g. sea platforms via tech, possibly reusing / fixing the unreachable `force_fields` ocean unlock #762) stay an unscheduled idea, not part of this arc. No grid-size or water-band changes because of this. |

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
| **764** | ✅ CS-1b | `ActionCatalog` reads tiles via the non-existent `grid.getByKey` / `grid._map` (`src/testing/actions/ActionCatalog.js:112,131` ✔), so the tile is always `undefined` (test tooling). |
| **765** | ✅ CS-1b | `ColonyOverlay._hexDist` is defined twice (`:738`, `:2921` ✔); the later one silently wins. |
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

### 3.4 CS-4a — SurfaceField + owner preview (2026-11-18; not committed, owner look pending)

CS-4 is split: **CS-4a** = the pure surface engine + a debug preview + measurements (this section); **CS-4b** = worker,
`SurfaceCache` LRU, worker = main bit-identical keeper, worker throughput per system. Nothing in gameplay or the renderer
uses `SurfaceField` yet (CS-5 / CS-6). `lib/` untouched (noise and craters ported, not edited).

**Files.** `src/utils/SurfaceField.js` (engine, zero imports), `src/utils/SurfacePreviewLogic.js` (raw biome palette +
hillshade, pure), `src/debug/SurfacePreviewDebug.js` (`csSurface()` / `csSurfaceAll()` DOM overlay),
`src/debug/ColonySphereDebug.js` (helpers return both), `src/scenes/GameScene.js` (2 window aliases),
`src/data/BodyArchetypes.js` (`field` knobs of the 18 surface rows tuned; a comment lists the knobs),
keeper `src/testing/smoke/colony_sphere_surface_smoke.mjs`, probe `src/testing/headless/probe-cs4a-surface.mjs`
(+ `cs4a-measure.mjs`), sheets `docs/design/prototypes/cs4a-archetype-sheet.png` and `cs4a-terran-waterbands.png`.

**API** (all take `(seed, archetypeRow, params)`; `params` = `{waterCoverage, palette}` or the body itself):
- `evalAt(seed, arch, params, x, y, z) → {e, m, t, a}` — gameplay path; input normalised; channels in [0, 1].
- `classify(sample, arch, seaLevel) → {biome, terrain}` — biome from the row's table, terrain one of the 10 (D-CS-3);
  total (null row → `wasteland`; a class not in the row → the row's first class).
- `seaLevelOf`, `surfaceInfo` (sea level / share, recipe, seed variation incl. planetoid albedo), `prepareSurface`
  (context: 3 seeded simplex permutations, offsets, variation, calibrated sea; LRU of 48), `fibonacciSphere(n)`.
- `bakeEquirect(seed, arch, params, w, h) → Uint8Array` RGBA8 = e, m, t, a. Pixel (i, j): lon = ((i+0.5)/w)·2π − π,
  lat = π/2 − ((j+0.5)/h)·π, vector (cos lon cos lat, sin lat, sin lon cos lat). `LOD_SIZES` hero 1024×512,
  body 256×128, planetoid 128×64. `SURFACE_FIELD_VERSION` (future cache key; 2 after the tuning pass, §3.4.1).
- Channels: e elevation (sea: e < seaLevel), m moisture / composition / feature mask (cracks, lava, veins, maria),
  t temperature (latitude − lapse; tidally locked: illumination, substellar point = +x), a crater / dome profile
  (0.5 none, < 0.5 floor, > 0.5 rim or cone).

**Determinism approach (D-CS-16).** The gameplay path uses only `+ − × ÷ sqrt floor` plus exact `abs/min/max/imul` and
int32 bit operations. Seeds: splitmix32 finalizer + mulberry32 Fisher–Yates permutations; crater cells via an `imul`
hash. Fibonacci points without trig: rotation by the golden angle through a complex multiply with literal cos / sin
constants, renormalised by `sqrt` each step. Sea level = quantile of e over 4096 Fibonacci points (sorted
`Float64Array`), so the terran ocean share equals the stored `waterCoverage`; e never depends on the sea level.
Measured: node and headless Chrome give **identical** values for 21 archetypes × 3 seeds × 362 points (114 093 values
incl. biome names and sea levels). Caveat: both engines are V8; Firefox (SpiderMonkey) is not measured — the
arithmetic-only rule is what makes the result engine-independent, pinned by source + runtime keepers.

**Archetype params** (placeholders tuned on the contact sheet; the owner tunes further). Recipe = archetype id.

| Archetype | Look (raw preview) | Key knobs |
|---|---|---|
| terran | continents + oceans from the stored `waterCoverage`, ragged polar caps, forest / plains / steppe / tundra, mountains + snowy peaks | continent 1.0, warp 0.35, ridge 0.5, polarCapBias 0.5 |
| ocean | 90% sea, island chains | seaShare 0.9, islands 0.25 |
| jungle | dense forest, shallow seas 18%, swamps | seaShare 0.18, wetBias 0.15, tropic 0.5 |
| desert | Mars: dark / bright albedo regions, craters, hemispheric dichotomy, small caps, basin on ½ of seeds | craterDensity 0.35, basinChance 0.5 |
| ice | ice plains, blue ridges / cryovolcanoes, exposed rock patches | ridge 0.6 |
| volcanic | lava channel network + lava basins, calderas, basalt ridges, ash | lava 1.0, calderas 0.35 |
| hothouse | cloud-free Venus: plains, highland continents, sulphur volcano cones | volcanoes 0.3 |
| cryo_haze | Titan: polar methane lakes 7%, equatorial dunes, water-ice bedrock | seaShare 0.07, polarLow 0.3 |
| scorched | Mercury: craters, lobate scarps, glassy basins, giant basin on ½ of seeds | scarps 1.0, basinChance 0.5 |
| barren | grey cratered regolith, polar crater ice | craterDensity 0.6, basinChance 0.3 |
| tidally_locked | eyeball: substellar rock, scorched day side, terminator band, ice night side | (geometry) |
| rocky_cratered | Luna: maria + highlands, multi-scale craters | maria 1.0, craterDensity 0.7 |
| volcanic_moon | Io: sulphur plains, paterae with lava-lake cores, silicate mountains | paterae 0.35 |
| icy_cracked | Europa: lineae network (3 scales), chaos patches, ridged plains | cracks 1.0 |
| icy_cratered | Callisto: saturated craters with bright rims, dark rock patches | craterDensity 0.85, patches 1.0 |
| hazy_moon | small Titan: polar lakes 4% | seaShare 0.04 |
| planetoid | palette per `planetoidType`; seed: craters ×0.6–1.4, albedo ×0.8–1.2, giant crater ≈ 1 in 6, metal veins strongest on metallic | veins 1.0, craterScale 0.7 |
| planetoid_icy | frost regolith, dirty ice, craters | patches 1.0 |

Gas giants are out of scope (`GasGiantShader` stays); `classify` still answers for gas rows (latitude bands) for
totality. Known look limits for CS-6: cryo_haze and hazy_moon share a recipe (they differ by lake share only);
tidally_locked always centres the day side at lon 0 (a variant knob for CS-6); colours are a debug palette only.

**Measurements** (`node src/testing/headless/probe-cs4a-surface.mjs --measure`; median of 3 cold runs with a new seed
each; main thread; prep = context incl. sea calibration; eval = 1000 `evalAt` on a warm context):

| Archetype | LOD | node prep / LOD / hero ms | Chrome prep / LOD / hero ms | evalAt per 1000 (node / Chrome) ms |
|---|---|---|---|---|
| terran | 256×128 | 5.8 / 45 / 564 | 6.5 / 48 / 594 | 2.1 / 1.8 |
| ocean | 256×128 | 6.4 / 49 / 608 | 7.3 / 52 / 651 | 2.1 / 1.9 |
| jungle | 256×128 | 5.9 / 45 / 565 | 7.0 / 49 / 606 | 2.0 / 1.9 |
| desert | 256×128 | 0.04 / 68 / 966 | 0.1 / 65 / 920 | 3.2 / 3.0 |
| ice | 256×128 | 0.04 / 54 / 779 | 0.1 / 53 / 747 | 2.5 / 2.3 |
| volcanic | 256×128 | 0.04 / 40 / 565 | 0.1 / 41 / 575 | 2.1 / 1.8 |
| hothouse | 256×128 | 0.04 / 46 / 621 | 0.0 / 48 / 668 | 2.2 / 2.0 |
| cryo_haze | 256×128 | 7.0 / 56 / 709 | 7.5 / 58 / 738 | 2.3 / 2.0 |
| scorched | 256×128 | 0.05 / 39 / 562 | 0.0 / 40 / 576 | 2.2 / 2.6 |
| barren | 256×128 | 0.04 / 37 / 538 | 0.1 / 38 / 546 | 2.0 / 1.7 |
| tidally_locked | 256×128 | 0.03 / 44 / 628 | 0.1 / 45 / 644 | 2.1 / 2.0 |
| rocky_cratered | 256×128 | 0.03 / 43 / 625 | 0.1 / 44 / 638 | 2.1 / 2.0 |
| volcanic_moon | 256×128 | 0.04 / 33 / 460 | 0.0 / 34 / 484 | 1.8 / 1.8 |
| icy_cracked | 256×128 | 0.04 / 50 / 720 | 0.1 / 53 / 759 | 2.4 / 2.2 |
| icy_cratered | 256×128 | 0.04 / 48 / 694 | 0.0 / 48 / 707 | 2.2 / 1.9 |
| hazy_moon | 256×128 | 7.0 / 56 / 711 | 7.7 / 58 / 745 | 2.3 / 2.0 |
| planetoid | 128×64 | 0.05 / 11 / 625 | 0.1 / 11 / 624 | 2.1 / 1.8 |
| planetoid_icy | 128×64 | 0.04 / 12 / 628 | 0.0 / 12 / 638 | 2.7 / 2.0 |

Per family (Chrome, LOD): planets 38–65 ms, moons 34–58 ms, planetoids 11–12 ms; hero 0.48–0.92 s. Real new game (probe
`--game`): `csSurfaceAll()` baked 45 bodies at 128×64 in 662 ms total; `csSurface()` at 512×256 ≈ 220 ms.
**Budget verdict vs §1.I:** body LOD is inside the 30–80 ms estimate; a 52-body system (≈ 15 planets/moons at 256×128 +
≈ 30 planetoids at 128×64) ≈ 1.1–1.3 s of main-thread JS → worker + progressive order needed (CS-4b), no GPU
contingency. Hero 0.5–0.9 s → worker only. Gameplay tile terrain: 362 × ≈ 2 µs ≈ 0.8 ms + 6–8 ms context prep for
bodies with a sea → main thread is fine (CS-5).

**Keepers** (`colony_sphere_surface_smoke`, 33 PASS): B1 golden values (84 samples: 7 archetypes × 3 seeds × 4 points)
bit for bit, identical after LRU eviction, bake twice identical; B2 call-graph source pin (no trig / pow / exp / log /
`**` reachable from evalAt / classify / seaLevelOf / surfaceInfo / prepareSurface / fibonacciSphere; witness:
bakeEquirect is flagged) + import pins; B3 runtime trap (Math.sin / cos / … throw → the gameplay path passes for all
21 rows; witness: bake throws); B4 classify total (> 100 000 samples incl. NaN; every biome class of every row
reachable; fallbacks); B5 terran ocean share ±5 pp on an independent point set (30 seeds, coverage 0.17–0.90, max
1.2 pp) + coverage in the context key + archetype sanity on 162 points (no ocean on dry rows, ice ≥ 60% ice_sheet,
volcanic ≥ 2 volcano, cryo_haze lakes ≥ 70% polar, tidally locked night side ice, Europa lineae, jungle forest-dominant);
B6 bake vs evalAt biome agreement ≥ 99% (18 rows × 2 seeds; worst 99.26%); B7 no wiring (only `src/debug/` imports
SurfaceField; GameScene has only the 2 aliases), golden-angle literals = Math.cos / sin, LOD sizes; B8 debug helpers
importable under node.
**Fail-first** in a real `git worktree --detach e630c21`: 11 FAIL / 1 PASS (the PASS is the no-wiring exclusion pin, a
control whose witness is red on the base), no abort. **14 mutations, all killed:** sin in the terran recipe, import in
SurfaceField, sea calibration ×0.9, classify without the first-class fallback (killed after the fallback pin was
added), class-name typo `lineae`, permutation salt, bake latitude flipped, Math.random in offsets, SurfaceField imported
by BuildingSystem, context key without waterCoverage, volcanic lava 0, bake quantisation ×250, `**` in clamp01, extra
import in SurfacePreviewLogic. Sweep `run-all` 430/430 OK, `check-i18n` PASS. CS-3a OFF trace and CS-3b world
baseline unchanged (archetypes keeper A5 / A7 green; the `field` edits are data placeholders, not pinned).

**Owner check (light loop; Polish script in chat).** Seeded new game → `csSurfaceAll()` → select a few bodies →
`csSurface()`. Expected: every body has a distinct, believable map matching its archetype. Validated headless on the
live engine (probe `--game`: 48 bodies, 45 shown, 3 gas skipped, overlay canvases = shown, the close button removes
the overlay, 0 page exceptions).

#### 3.4.1 CS-4a tuning pass (2026-11-18; owner + reviewer feedback; not committed)

Owner likes the natural randomness (a mountain-heavy homeworld stays). `SURFACE_FIELD_VERSION` 1 → **2**; golden values
of keeper B1 **re-recorded deliberately** (intentional look change).

- **Terran snow:** elevation lapse in t 0.3 → 0.12; snowy `peaks` only above a latitude-aware snowline
  h > 0.45 + 0.7·t (t ≳ 0.79 → none, i.e. no snowy peaks in the tropics); polar caps unchanged. Measured on 3 seeds,
  |y| < 0.5: peaks 38/100/63 → 10/28/5 samples (the rest stay `mountains`; terrain shares unchanged).
  Preview hillshade capped (×1.25) so bright slopes no longer saturate to white.
- **Ice:** large-scale region field (seed scale 0.6–1.3) → `old_ice` (m > 0.62, blue-grey), `smooth_plain` (m < 0.36,
  lower, no ridges), rifts via the a channel (a > 0.74, seed strength 0.5–1.5), exposed rock only m > 0.9. Ice row gets 3
  biome classes: `old_ice` / `smooth_plain` → ice_sheet, `rift` → wasteland. Knobs `rifts`, `oldIce`.
- **Craters:** knob `regional` — crater density × (1 − 0.8·regional·(1 − region)), region = old highlands vs younger
  plains (seed bias ±0.15): barren 0.8, scorched 0.9, icy_cratered 0.7, rocky_cratered 0.5. **Scorched ≠ barren:**
  `lavaPlains` 1.0 → dark smooth lowered lava plains (`glassy_basin`, desert) + lobate scarps + cratered highlands.
- **Seed variety:** tidally_locked — substellar direction tilted (±0.5 in lon, ±0.4 in lat), day-side size shift ±0.4,
  band slope 0.55–1.7 (terminator width), boundary wobble 0.25–0.65, water in the terminator on ≈ ½ of seeds (new class
  `terminator_sea` → ocean). Volcanic — low-frequency elevation (large lava lowlands vs highlands), lava network
  frequency 0.7–1.4, strength 0.75–1.3, basin level 0.3–0.5.
- cryo_haze vs hazy_moon unchanged (CS-6 haze).

**Terrain-share report — information only, no tuning** (`node src/testing/headless/probe-cs4a-terrain-report.mjs`;
galaxies −2102099243 and 612055237, ≤ 30 bodies per archetype per galaxy, same bodies; today = `PlanetMapGenerator`,
new = classify(evalAt) at D-CS-8 tile counts; buildable = `TERRAIN_TYPES.buildable` = every terrain except `ocean`):

| Archetype | n | today buildable (median) | new buildable min / median / max | Δ median | today top terrains % | new top terrains % |
|---|---|---|---|---|---|---|
| terran | 28 | 100% | 14 / 30 / 79% | **−70% ⚠** | tundra 21, plains 21, mountains 18, ice_sheet 14, desert 9 | ocean 71, mountains 10, ice_sheet 7 |
| jungle | 7 | 100% | 80 / 83 / 85% | −17% | plains 45, mountains 26, tundra 12, desert 11, crater 9 | forest 55, mountains 17, ocean 17, plains 12 |
| desert | 60 | 100% | 100 / 100 / 100% | 0 | ice_sheet 33, tundra 25, mountains 15, plains 7, desert 7 | desert 58, wasteland 28, mountains 8, ice_sheet 6 |
| ice | 60 | 96% | 100 / 100 / 100% | +4% | ice_sheet 60, tundra 21, mountains 8 | ice_sheet 80, wasteland 19 |
| volcanic | 41 | 100% | 100 / 100 / 100% | 0 | ice_sheet 31, tundra 24, mountains 17, plains 8, desert 6 | wasteland 71, volcano 18, mountains 10 |
| hothouse | 9 | 100% | 100 / 100 / 100% | 0 | plains 27, mountains 24, desert 16, tundra 11, ice_sheet 7, crater 6 | wasteland 79, mountains 10, desert 8 |
| cryo_haze | 60 | 93% | 90 / 93 / 97% | 0 | ice_sheet 40, tundra 23, mountains 10, ocean 7 | tundra 38, desert 26, ice_sheet 26, ocean 7 |
| scorched | 1 | 100% | 100% | 0 | mountains 88, desert 7, crater 6 | wasteland 64, desert 24, mountains 7 |
| barren | 56 | 100% | 100 / 100 / 100% | 0 | ice_sheet 45, mountains 29, desert 12, crater 7 | wasteland 90, crater 6 |
| tidally_locked | 60 | 100% | 91 / 100 / 100% | 0 | mountains 23, ice_sheet 18, tundra 10, desert 9 | ice_sheet 38, desert 26, tundra 19, wasteland 11 |
| rocky_cratered | 60 | 100% | 100 / 100 / 100% | 0 | ice_sheet 66, mountains 20, desert 8 | wasteland 91, crater 5 |
| volcanic_moon | 60 | 100% | 100 / 100 / 100% | 0 | ice_sheet 69, mountains 19, desert 6 | wasteland 92, volcano 7 |
| icy_cracked | 60 | 100% | 100 / 100 / 100% | 0 | ice_sheet 94 | ice_sheet 76, tundra 14, mountains 9 |
| icy_cratered | 60 | 100% | 100 / 100 / 100% | 0 | ice_sheet 95 | ice_sheet 62, wasteland 26, crater 8, mountains 5 |
| hazy_moon | 60 | 100% | 91 / 96 / 100% | −4% | ice_sheet 58, tundra 22, mountains 6 | tundra 37, ice_sheet 32, desert 27 |
| planetoid | 60 | 100% | 100 / 100 / 100% | 0 | ice_sheet 58, desert 14, mountains 8, volcano 6 | wasteland 54, mountains 28, crater 15 |
| planetoid_icy | 60 | 100% | 100 / 100 / 100% | 0 | ice_sheet 56, desert 17, mountains 6, volcano 6 | ice_sheet 52, wasteland 32, crater 11, mountains 5 |

(`ocean` archetype: 0 bodies in these galaxies.) Reading: with `ocean` the only unbuildable terrain, the buildable share
moves only where water appears. **Flag: terran −70%** — today's terran maps have no ocean at all (median 100% buildable),
the new terran is always oceanic by design (D-CS-1 v2, waterCoverage 0.15–0.90, spread 14–79%). Jungle −17% is within
±20%. The **terrain mix** changes much more than the buildable share (today ice_sheet / tundra dominate nearly every
archetype; new mixes follow the archetype: wasteland on airless bodies, desert on Mars-like, volcano on lava worlds) —
yield / building-category effects are a D-CS-8 / CS-5 question, not changed now.

Results: keeper `colony_sphere_surface_smoke` 33 PASS (B5 dry list no longer includes tidally_locked: terminator water;
bake ↔ evalAt worst 99.44%; terran ocean max 1.10 pp; ice ≥ 112/162 ice_sheet; volcanic ≥ 24/162 volcano); sweep
430/430 OK; check-i18n PASS. Sheets regenerated (title "SurfaceField v2 (tuning pass)").

**Gate log (light loop, 2026-11-18): PASS.** Owner checked the in-game preview (`csSurfaceAll` / `csSurface`: 51 bodies
shown, home terran continental 0.371) and is happy; the owner explicitly likes the natural randomness (mountain-heavy
homeworlds are fine). Review of the v2 sheets: PASS — terran inland snow fixed (polar caps + highest peaks only),
scorched clearly Mercury-like, tidally_locked varies per seed incl. terminator water, volcanic varies per seed, ice has
rifts / old-ice structure. `SURFACE_FIELD_VERSION` = 2. The terran buildable-share flag is decided by **D-CS-20**.
**Carried to CS-6 (visual variants):** ice seeds 1 / 3 still similar; barren crater modulation weak; cryo_haze vs
hazy_moon share a recipe (haze covers them); tidally_locked day side always centred on the map (fine once the body is
oriented to its star).

### 3.5 CS-4b — surface worker + SurfaceCache (2026-11-18; not committed, owner check pending)

Surfaces are baked off the main thread, cached under a byte budget and served by priority. **Nothing renders differently**:
the only consumers are the debug preview (`csSurface` / `csSurfaceAll` now go through the cache) and an inert
`prefetchSystem()` hook for CS-6. Gameplay terrain (`evalAt` at tile centres, CS-5) is **not** routed through the worker
or the cache. No critical file touched (`GameConfig.js` untouched: the budget is a constant in `SurfaceCache.js`).

**Files.** `src/workers/surface.worker.js` (new), `src/systems/SurfaceCache.js` (new), `src/debug/SurfacePreviewDebug.js`
(csSurface / csSurfaceAll via the cache, new `csCache`), `src/debug/ColonySphereDebug.js` (helpers return `csCache` and
`csNextSystem`), `src/scenes/GameScene.js` (import, `KOSMOS.surfaceCache = new SurfaceCache()` with dispose of a
previous instance, aliases `window.csCache` / `window.csNextSystem`), keeper `src/testing/smoke/colony_sphere_cache_smoke.mjs`
(new), keeper `colony_sphere_surface_smoke` B7 whitelist (+ SurfaceCache, worker), probe
`src/testing/headless/probe-cs4b-cache.mjs` (new; `--owner` replays the owner one-liners), probe-cs4a `--game` awaits the now
asynchronous helpers, `docs/ARCHITECTURE.md` event table (+ `surface:ready`).

**Worker** (`new Worker(new URL('../workers/surface.worker.js', import.meta.url), {type:'module'})`, created lazily on
the first request). Import graph = `{surface.worker.js, SurfaceField.js}` only (module workers do not inherit the
importmap, §1.I). Protocol: start → `{type:'ready', version}`; `{type:'bake', jobId, seed, arch:{id, family, field,
biomes}, params:{waterCoverage, palette}, w, h}` → `{type:'baked', jobId, w, h, ms, version, buffer}` (RGBA8 = e, m, t,
a; buffer **transferred**) or `{type:'error', jobId, message}` (the worker survives). The worker keeps one archetype
row object per id (SurfaceField's WeakMap / context caches stay small).

**SurfaceCache API** (the single entry point; `KOSMOS.surfaceCache`):
- `request(body, lod = lodOf(body), priority) → Promise<map | null>` — never rejects; `null` = no surface (gas, no seed,
  unknown LOD), job dropped (other system) or cache disposed. Same key already queued → the same promise (priority raised).
- `get(body, lod) → map | null` — synchronous, refreshes LRU, does not count hits / misses (CS-6 may poll per frame).
- `map = {key, bodyId, systemId, lod, w, h, data: Uint8Array RGBA8, bytes, ms, source: 'worker' | 'main'}`.
- Key = `surfaceSeed | archetype | v<SURFACE_FIELD_VERSION> | waterCoverage/palette | lod` (`surfaceKeyOf`, pure).
- LODs = `LOD_SIZES`: `hero` 1024×512, `body` 256×128 (planets, moons), `planetoid` 128×64; `lodOf(body)`.
- Priorities `SURFACE_PRIORITY = {HERO: 300, FOCUS: 200, SYSTEM: 100}`; `surfaceSystemPriority(body)` = SYSTEM + planet 60
  / moon 30 / planetoid 0 + min(29, 2·visualRadius). One job in flight → a new hero overtakes queued LODs after the
  current bake at the latest.
- `setActiveSystem(id)` (wired to `system:switched`): queued non-hero jobs of other systems resolve `null`; an in-flight
  non-hero result for a system no longer active is **not cached** (cannot displace the current system); hero jobs survive.
- LRU by bytes: `SURFACE_CACHE_BUDGET_BYTES = 20 MiB` (one constant); after every insert `bytesUsed ≤ budget`; a map larger
  than the whole budget is returned but not cached.
- `prefetchSystem(systemId)` — queues LOD maps of every surface body of a system (inert until CS-6 calls it).
- `clear()` (game load), `dispose()` (scene restart: queue → null, worker terminated, unsubscribed). Return to title and
  game load are full page reloads today; GameScene disposes a previous instance before creating a new one.
- `snapshot()` → `csCache()`: mode, workerAlive, entries, bytesUsed / budget, queue, inFlight, hits, misses, evictions,
  evictedBytes, staleDropped, staleDiscarded, oversize, errors, workerFailures, avg ms per LOD (worker / main), bytes per system.
- **Event `surface:ready {key, bodyId, systemId, lod, w, h, ms, source}`** — emitted after a map is inserted into the cache
  (not for dropped / discarded jobs; a throwing listener is caught).
- **Fail-soft:** factory throws / no Worker API / worker `error` or `messageerror` / no `ready` or no answer within
  `SURFACE_WORKER_TIMEOUT_MS` (15 s) / worker reports a different `SURFACE_FIELD_VERSION` → **one** console warning, the
  in-flight job is re-queued, every job is baked on the main thread with the same SurfaceField (bit-identical), one job
  per macrotask (`schedule` option; default `setTimeout(…, 0)`). A single bake error inside a live worker → that job is
  re-baked on the main thread, the worker stays. Never throws into the game.

**Debug.** `csSurfaceAll()` lists the active system's surface bodies in priority order with placeholders, requests each
at its LOD and fills thumbnails as results arrive (label: name · archetype · ms · W worker / M main / C cache; header:
progress, wall ms, Σ bake, sources). `csSurface()` requests the selected body's **hero** map (1024×512, HERO priority).
Both return `{…, done: Promise}` (summary logged when done). `csCache()` prints the snapshot. `csNextSystem()` switches
the view to the next already-generated system (a new game has home + the AI home systems) via `switchActiveSystem`;
it generates nothing (it does show an AI system the player has not discovered — test games only).

**Measurements** (real game in headless Chrome over CDP: title → seeded new game → wait for the intro to end →
`node src/testing/headless/probe-cs4b-cache.mjs`; SwiftShader, so the game itself renders at ≈ 100–117 ms/frame and the
frame columns are only comparable within a row; long tasks = `PerformanceObserver('longtask')`, > 50 ms on the main
thread). Clean run 3 (home system 62 surface bodies = 27 at 256×128 + 35 at 128×64); runs 1–2 (49 and 39 bodies) agree
on every conclusion (run 1 started during the intro, whose mouse lockdown and texture gate polluted its idle row).

| Phase | Wall ms | Σ bake ms | First map ms | Main-thread long tasks (count / max / Σ ms) | Max frame ms |
|---|---|---|---|---|---|
| P0 idle 3 s (reference) | — | — | — | **0 / 0 / 0** | 167 |
| P1 whole system via **worker** (cold worker) | 3110 | 3006 | 133 | **0 / 0 / 0** | 124 |
| P4 same system on the **main thread** (fallback) | 3269 | 2941 | 82 | **27 / 123 / 2323** | 120 |
| P3 hero 1024×512 via worker (warm) | 1135 | 1135 | — | **0** | 117 |
| P4 hero on the main thread | 1156 | 1150 | — | **1 / 1149 / 1149** (one 1.08 s frame) | 1079 |
| P2 hero requested with 61 LODs queued | hero after **1221** (bake 1135; 1 LOD done before it) | — | — | — | — |
| P6 owner path `csSurfaceAll()` (cache + preview compose) | 3140 | 2960 | — | **0 / 0 / 0** | 137 |
| P6 owner path `csSurface()` hero | 1014 | 1014 | — | 1 / 107 / 107 | 117 |
| P6 second `csSurfaceAll()` (all 62 cache hits) | 279 | 0 | — | — | — |
| P7/P8 systems 2…6 `csSurfaceAll()` (55–58 bodies each) | 2254–2552 | 2168–2456 | — | **0 / 0 / 0** in all five | 117–133 |

- **Main thread stays smooth with the worker:** zero long tasks while a whole system or a hero map is generated (three
  runs). The fallback produces ≈ one long task per body (max ≈ 100–123 ms) and blocks ≈ 0.7–1.15 s for a hero map.
- **Worker vs main totals:** Σ bake is equal within noise on the same bodies (3006 vs 2941 ms run 3; 2187 vs 1971 and
  2212 vs 1943 in runs 1–2, i.e. worker +2…+14 %); wall time is ≈ the same (one worker, one job in flight; message latency
  is negligible against 18–90 ms bakes). Per body in the game: body LOD ≈ 80–90 ms, planetoid ≈ 15–19 ms, hero ≈ 1.0–1.1 s,
  i.e. ≈ 1.5× the CS-4a bench numbers (34–65 ms / 11–12 ms / 0.5–0.9 s), which were measured on an idle page: in the game
  the CPU is shared with SwiftShader's render threads (the main-thread fallback in the game is equally slower).
- **Time to fill a system:** ≈ 2.3–3.1 s for 55–62 bodies (first thumbnail after ≈ 130 ms incl. cold worker start).
  **Time to the hero:** ≈ 1.0–1.1 s alone; ≈ 1.2 s with a full LOD queue (it overtakes all queued LODs).
- **Bit-identical:** worker vs main-thread maps of the whole system compared byte for byte: 63/63, 40/40, 50/50 (incl. hero).
- **Stale jobs:** switching system 120 ms into a 58-body fill → 56 queued jobs dropped, 1 in-flight result discarded, the
  old system keeps only the 1 map finished before the switch; the new system fills completely.
- Long tasks right after `switchActiveSystem` (10–26 in the 3 s after a switch, also with no surface work) belong to the
  system switch itself (scene / texture rebuild), not to the cache; the fills that follow have none.

**Memory and budget** (cache bytes = typed arrays; GPU copies come with CS-6):

| After | Entries | Bytes held | Evictions |
|---|---|---|---|
| system 1 LOD (62 bodies) | 62 | 4.47 MiB | 0 |
| + hero (2 MiB) | 63 | 6.47 MiB | 0 |
| + system 2 | 121 | 10.06 MiB | 0 |
| + system 3 | 179 | 13.66 MiB | 0 |
| + system 4 | 235 | 17.38 MiB | 0 |
| + system 5 | 290 | 18.81 MiB | 1 (the hero, oldest) |
| + system 6 | 328 | 19.91 MiB | 18 (oldest home LODs) |

One system's LOD set = **3.2–5.1 MiB** (128 KiB per planet / moon, 32 KiB per planetoid; 39–67 bodies; runs 1–3). **Verdict: the ≈ 20 MiB budget
holds** with margin — it keeps the hero + the active system + **≈ 3–4 previous systems** (the §1.I estimate assumed ≈ 6 MiB
per system, real sets are smaller because most bodies are 32 KiB planetoids). It was never exceeded (max 20 873 216 of
20 971 520 B). No GPU contingency needed. `SURFACE_CACHE_BUDGET_BYTES` stays 20 MiB; CS-6 may lower it if GPU copies
become the real memory cost.

**Keepers** (`colony_sphere_cache_smoke`, 55 PASS): C1 worker = main bit for bit — (a) the worker module in-process with a
`self` shim and `structuredClone`d messages for 7 bodies (body / planetoid / hero), buffer transferred, a bad job → `error`
and the worker lives; (b) a **real thread** (node `worker_threads` + a Web-Worker adapter) through SurfaceCache: 7/7 maps
from `worker` = 7/7 from `main`; C2 worker import graph = {worker, SurfaceField}, no document / window / localStorage /
importScripts / THREE / GAME_CONFIG / EventBus (witness: the same scanner sees EventBus / EntityManager / BodyArchetypes
from SurfaceCache), worker URL + `{type:'module'}`; C3 LRU — budget never exceeded (every step + 160-request random
stress incl. 2 MiB heroes over budget), eviction order with get-refresh, same key → hit without a bake, changed
SURFACE_FIELD_VERSION / waterCoverage / palette / LOD / seed / archetype → miss, oversize not cached; C4 priority — most
important LOD first, hero overtakes queued LODs, then planet > moon > planetoid; system switch: queued old LODs → null,
in-flight old result not cached, hero survives, new system next; `surface:ready` only for inserted maps; dedup → same
promise; dispose terminates the worker; C5 fail-soft — factory throws / worker error mid-job / wrong field version /
silent worker (watchdog) / bake error in the worker (twice) / no Worker API under node → one warning, main-thread result
bit for bit, no exception; a throwing `surface:ready` listener is caught; gas / no seed / unknown LOD → null; C6 no wiring
— only GameScene (import + dispose + `new SurfaceCache()` + `csCache` alias) and `src/debug/` import SurfaceCache, nobody
outside debug calls request / get / prefetchSystem, SurfaceCache imports only bake + constants from SurfaceField (no
evalAt / classify), only SurfaceCache references the worker file; C7 `prefetchSystem` queues exactly the system's surface
bodies; helpers return `csCache`, `csSurfaceAll` goes through the cache.
**Fail-first** in a real `git worktree --detach 6c063d6`: **22 FAIL / 2 PASS**, no abort (the 2 PASS are the exclusion pins
"nobody outside GameScene / debug imports / calls SurfaceCache", whose witness is red on the base). **21 mutations, all
killed** (each a clean FAIL, none a hang): worker imports EventBus, no transfer list, w/h swapped; key without version,
without waterCoverage; LRU evicts newest; get() does not refresh; evict only after overflow; oversize cached; FIFO ignores
priority; switch keeps old queue; stale result cached; crash loses the in-flight job; warn every time; no version check on
`ready`; no watchdog; `surface:ready` not emitted; SurfaceCache imports evalAt; prefetch ignores the system; GameScene
prefetches; csSurfaceAll bakes on the main thread. `colony_sphere_surface_smoke` 33 PASS (B7 whitelist: + SurfaceCache,
worker). Headless note: `env.js` defers `setTimeout(…, 0)` to the Ticker flush, so SurfaceCache takes a `schedule` option and
the keeper passes a real node timer.

**Owner check (light loop; Polish script in chat).** Validated headless on the live engine (`probe-cs4b-cache.mjs --owner`:
the exact quote-free one-liners after the intro; thumbnails progressive — 2–3 canvases and the rest placeholders after
400 ms; close button works in every system; `csNextSystem()` cycles home → 2 AI home systems → home, last pass all cache
hits; 0 warnings, 0 exceptions). Evictions do not occur within the 3 systems a fresh game has (≈ 10–15 MiB); they are shown
by the probe (systems 5–6). Note: during the new-game intro fly-in the game swallows every mouse event in the capture
phase (GameScene lockdown, pre-existing) — the overlay's × works only after the intro.

**Gate log (owner check, 2026-11-18): PASS** on a seeded test game. (1) `csSurfaceAll()` home (34 bodies, 31 shown):
W 31 / M 0, wall 758 ms, camera smooth while filling; second call C 31, 57 ms. (2) `csCache()`: 31 maps, 2.00 / 20.00 MiB,
worker OK, avg worker ms body 46 / planetoid 11. (3) `csSurface()` hero New Earth (terran oceanic 0.737): 1024×512,
606 ms, worker. (4) `csNextSystem()` → sys_054 (40 maps, W only, 1263 ms) → 7.22 MiB; → sys_063 (54 maps, W only,
1532 ms) → 11.06 MiB; evictions 0, errors 0, worker failures 0. (5) Back home: all C, 71 ms.

**Carried forward (owner feedback):**
- **CS-6 (MUST):** colours look repetitive across bodies and systems — the preview palette is fixed per biome. CS-6 adds
  per-body colour variation: hue / saturation / albedo from `surfaceSeed`, star-class tint, palette variants within each
  archetype (e.g. desert rust → ochre → grey, ice white → blue → beige, oceans navy → teal). No two bodies of the same
  archetype may look the same.
- **CS-6:** the old texture pipeline still rebakes on every system switch ("Rebake: N tekstur") — the shared surface path
  replaces it.
- **CS-7:** the hero map takes ≈ 0.6–1.1 s — show the upscaled LOD map immediately and swap in the hero map when ready;
  prefetch the player's capital hero map in idle time after game start.

### 3.6 CS-6a — shared surface shader on the system map + per-body colours (2026-11-18; not committed, owner look pending)

> Tuning pass after the first owner look: §3.6.1 (supersedes the ocean / glint / star-tint numbers below).

**Scope (owner split of CS-6, 2026-11-18).** 6a = surface shader + per-body colours + lighting + system-map integration +
old texture pipeline off. 6b = atmospheres, clouds, Venus / Titan decks (realistic on the system map: hothouse = opaque
cloud deck with subtle banding, cryo_haze = orange haze; thinned later in the colony view), tidally-locked orientation,
carried SurfaceField fixes. **Hard requirement:** colours must not repeat — no two bodies of one archetype look alike.

**Files.** New: `src/renderer/SurfaceShader.js` (GLSL + uniform builder + material / texture factories, zero three
imports — THREE is injected), `src/data/BodyPalettes.js` (palette variants, star tint, jitter amplitudes),
`src/utils/SurfacePaletteLogic.js` (pure: `resolveSurfaceLook`, `surfaceSeaLevelOf`, `paletteDistance`),
`src/testing/smoke/colony_sphere_shader_smoke.mjs`, `src/testing/headless/probe-cs6a-shader.mjs` +
`cs6a-sheet-page.js`. Changed: `ThreeRenderer.js` (+168 lines, one block of methods + 4 call sites + tick + event),
`GameConfig.js` (**critical file** — flag `sharedSurface: false` only), `ColonySphereDebug.js` + `GameScene.js`
(`csShared` alias + one flag-gated `rebuildBodySurfaces()` call), three keepers (below). Not touched: `SurfaceField.js`, `SurfaceCache.js`, the worker, gas giants,
`AtmosphereShader`, clouds, the colony screen, saves.

**Shader** (one program for every body; per-body values only through uniforms):
- Equirect lookup computed per fragment from the object-space direction (no mesh UVs) with an explicit LOD
  (`textureLod`, LOD from the screen-space derivative of the direction) → no seam at ±180°, no pole pinch, smooth
  shading on the low-poly moon / planetoid spheres. Map = RGBA8 (e, m, t, a) from SurfaceCache, mipmapped, repeat in u.
- 10 look functions selected by `uLook` (terran / ocean / jungle, desert, ice, volcanic, hothouse, cryo, cratered ×6
  archetypes, tidal, Io, Europa). **Their thresholds mirror the SurfaceField classifiers** (`cTerran` …), softened with
  `smoothstep`, so the system map agrees with the tile terrain of CS-5.
- Object-space value noise (3 octaves at ×38 + one at ×150) perturbs e / m / t before the look function (fractal biome
  borders below map resolution) and mottles the albedo; it fades out when a noise feature drops under ≈ 2 px.
- Normals: central differences of the elevation channel (sea level clamps water flat) + the noise gradient, soft-
  saturated; strength per archetype (`relief`).
- Oceans: depth colour, coast shallows, thin beach, sharp glint + broad sheen; pack ice. Ice: matte sheen. Lava
  (volcanic, volcanic_moon): HDR emissive from the lava mask, constant day and night (bloom picks it up).
- Light: gate on the geometric normal (relief never lights the night side), wrap = atmosphere softness, warm tint at
  the terminator on worlds with air, ambient from the scene's AmbientLight, `uCityLights` + `uCityGain` wired, black.
- Placeholder: `uMapMix` 0 → 1 over 0.35 s blends a palette mean colour into the real surface (no mesh rebuild).
- Log depth via `LogDepthChunks` (derived variant, round-trip pinned); output through three's tone-mapping and
  colour-space chunks. Shared uniforms `SURFACE_SHARED_UNIFORMS` (sun position / colour, ambient, `uTune` = live knobs
  relief × / specular × / emissive × / detail ×).

**Colour variety** (deterministic from `surfaceSeed`, archetype, planetoid type, star class):
1. variant A of the archetype's palette table (weighted; some weights depend on the star class, e.g. red foliage ×3
   at M, blue-green ×2.5 at F);
2. a blend of a second variant B ≠ A with weight 0 … 0.42 — a continuous space, not a finite list;
3. palette-wide jitter: hue ±9°, saturation ±16%, value ±11%, warm↔cool ±3.5% (grey bodies: hue ±5°, sat ±22%,
   value ±14%, warm↔cool ±7%);
4. per-slot jitter (hue ±3°, value ±4.5%);
5. star-class albedo tint (M ×[1.05, 0.97, 0.90]·0.94, K, G neutral, F ×[0.97, 1.00, 1.05]·1.04). Emissive slots skip 3–5.

| Archetype | Look | Variants |
|---|---|---|
| terran | TERRAN | earth, teal, olive, crimson, viridian, amber, jade_sea (7) |
| ocean | TERRAN (ocean mode) | navy, teal, jade, steel, cobalt (5) |
| jungle | TERRAN (jungle mode) | emerald, olive, teal, maroon, dark, lime (6) |
| desert | DESERT | rust, ochre, greybrown, crimson, pale_sand, umber (6) |
| ice | ICE | white, pale_blue, beige, mint, rosy, slate (6) |
| volcanic | VOLCANIC | basalt, rusty, sulphur, obsidian, cinder (5) |
| hothouse | HOTHOUSE | venus, ochre_red, pale, acid, brown (5) |
| cryo_haze / hazy_moon | CRYO | titan, amber, tan, tholin, olive / titan, honey, grey, red, khaki (5 + 5) |
| scorched | CRATERED | mercury, charcoal, baked, tan, bronze (5) |
| barren | CRATERED | grey, warm, cool, brown, basalt, pale (6) |
| tidally_locked | TIDAL | ember, ochre, ashen, violet, pale (5) |
| rocky_cratered | CRATERED | luna, warm, cool, rusty, carbon, ochre (6) |
| volcanic_moon | IO | io, orange, lemon, green, ochre (5) |
| icy_cracked | EUROPA | europa, blue, rust, tan, teal, enceladus (6) |
| icy_cratered | CRATERED | callisto, bright, tan, blue, dark (5) |
| planetoid | CRATERED | metallic / carbonaceous / silicate × 4 each |
| planetoid_icy | CRATERED | frost, cream, blue, rose (4) |

**Star light on surfaces (decision by CC, owner may tune).** The star PointLight colour of an M star is `0xff6b47`; used
directly it turns every surface monochrome red and every ocean black. `surfaceSunColor` keeps the game's intensity
(2.8 · L^0.22, so M is dim and F bright) but mixes only `SURFACE_SUN_TINT = 0.3` of the star hue into white. Gas giants
and ships still take the PointLight as is — a small mismatch inside one frame (issue 3 below).

**System-map integration** (`FEATURES.sharedSurface`, default false):
- `_sharedSurfaceMaterial(body)` returns null as its first statement when the flag is OFF; the three build paths
  (`addPlanetMesh`, `_addMoonMesh`, `_initPlanetoids`) and `_updatePlanetMesh` fall through to today's code. A body
  without seed / archetype also falls through.
- ON: material with the placeholder colour at build time. `_tickSharedSurfaces` (real time, per frame): star light →
  shared uniforms; first tick with a cache calls `prefetchSystem(activeSystemId)` (lazy, because at game start the
  cache is created after `initSystem`), then per body `get` (hit → map at once) or `request`; `surface:ready` /
  the request promise swap the texture into the existing material; fade.
- No `_bakePlanetTexture`, no `loadPlanetTextures` for these bodies; `_rebakePlanetTextures` finds no `.map` and
  ends without the "Rebake: N tekstur" log (measured: log absent).
- The map texture belongs to the material and is released by the material's `dispose` event, so every existing
  clean-up path (system switch, body removal, `_updatePlanetMesh`) frees it without edits; the registry entry leaves
  on the same event.
- **Start order.** The first `initSystem` of a scene runs before surface seeds / archetypes are assigned (the seed needs
  the galaxy), so with the flag ON the start system was first built on the old path. `GameScene.start()` now calls
  `rebuildBodySurfaces()` right after the SurfaceCache is created (flag ON only; synchronous, before the terrain
  textures load and the rebake could start). Found by running the owner script 1:1 (`--owner`): before the fix 0 of 56
  bodies used the shared shader at game start. The old synchronous bake of the start system still runs once (issue 9).
- `csShared()` flips the flag and swaps materials in place (`rebuildBodySurfaces` — camera, meshes, atmosphere, clouds
  untouched). The OFF direction uses `_legacyBodyMaterial`, a copy of today's recipe used **only** by this debug tool.

**Measurements** (real game, headless Chrome over CDP, **real GPU**: ANGLE D3D11, RTX 3070; 1600×1041; seeded new
game; `node src/testing/headless/probe-cs6a-shader.mjs --game`; three runs, last one shown, the others within ±15%):

| Measure | sharedSurface OFF | sharedSurface ON |
|---|---|---|
| frame time, full system view (43 bodies) | 16.7 ms median, p95 16.8 (60 fps, vsync cap) | 16.7 ms median, p95 16.7 |
| frame time, close-up on the home planet | 16.7 ms median, p95 16.7 | 16.7 ms median, p95 16.8 |
| system switch, main-thread stall (`csNextSystem()` call) | **2 912 ms** (47 bodies) | **15 ms** (39 bodies) |
| fully textured after a system switch | **6 739 ms** (until "Rebake: 45 tekstur") | **1 415 ms** (39 maps, worker), bodies visible from frame 1 in the placeholder colour |
| `csShared()` on a cold cache (39 bodies) | 2 273 ms (legacy bake, main thread) | 3 ms swap + 2 008 ms until all maps |
| "Rebake" log on switch | present | absent |

Both paths sit on the 60 fps vsync cap, so the frame-time rows only show "no regression at the cap"; uncapped GPU cost
was not measured. Other runs: ON fully textured in 1 426 ms (40 bodies), 1 949 ms (53), 2 256 ms (65). SurfaceCache
after 2 ON systems: 76 maps, 6.03 MiB, 0 errors, 0 worker failures.

**Proof.**
- GLSL compile probe (`--compile`): game program with and without log-depth chunks compiles and draws a lit pixel;
  the control (same fragment + an undeclared identifier) fails with `ERROR: 0:311` / `0:322`.
- Contact sheets (`--sheets`, `--game`; real GPU): `docs/design/prototypes/cs6a-archetypes.png` (20 rows: every surface
  archetype incl. 3 planetoid types × M / G / F), `cs6a-variety.png` (ice, desert, rocky_cratered, terran × 6 seeds),
  `cs6a-systemmap-before-after.png` (2 systems, OFF | ON, same camera).
- Keeper `colony_sphere_shader_smoke`: 52 PASS — palette table complete (every archetype, ≥ 4 variants, slot counts),
  determinism, 40 seeds × every archetype: no near-identical pair, median palette distance > 0.03, ≥ 3 base variants hit;
  star-class ordering; null cases with a witness; GLSL text pins (no interpolation, every look has a branch, explicit
  LOD only, log-depth round-trip); uniform sharing; texture life cycle on a fake THREE (re-apply and `dispose` free the
  map); flag wiring by source pins.
- Signed pin changes: `colony_sphere_cache_smoke` C6 (ThreeRenderer is now the one caller outside debug, with a
  witness; 56 PASS), `colony_sphere_surface_smoke` B7 (SurfacePaletteLogic may import `seaLevelOf`; 33 PASS),
  `hud_orbits_smoke` (fake renderer gets `_sharedSurfaceMaterial: () => null`; 46 PASS).
- Sweep 432 / 432, 0 FAIL; `check-i18n` PASS.
- **Flag OFF:** proven by construction and source pins (null in the first statement, old build code not edited), by the
  sweep, and by the OFF legs of the game probe. **No pixel-level before / after comparison of the OFF path was run** and
  no fail-first worktree run (VIS step, light loop).

**Known visual issues (for the tuning loop and CS-6b).**
1. tidally_locked reads as an almost uniform day-side ball: the field's substellar point (+x) is not turned toward
   the star yet (6b orientation).
2. hothouse is a flat yellow-brown surface until the 6b cloud deck; cryo_haze and hazy_moon show their surface under
   today's generic white clouds (visible in the before / after sheet).
3. Surfaces use the softened star colour, gas giants and ships the raw PointLight colour — in an M system rocky bodies
   look warm-white lit next to red-lit giants.
4. Today's atmosphere shell and white cloud layer sit on top unchanged (same blue rim on every planet, V-275); the
   ocean glint shows through cloud gaps.
5. Terran land on high-water worlds can read grey (rock / tundra slots dominate small continents); oceans are darker
   than the old baked look; desert dark-rock regions can read as near-black patches under dim stars.
6. Maps are 256×128 (planetoids 128×64); close zoom is carried by the detail noise. Requesting the hero map
   (1024×512) for the focused body is not wired.
7. Night side is close to black (scene ambient only); there are no city lights until CS-9.
8. Carried, untouched: ice seeds can still be similar in structure (colour now differs), barren crater modulation weak.

9. With the flag ON, a new game / load still pays today's synchronous bake of the start system once (seeds are assigned
   after the first `initSystem`); removing it means moving seed / archetype assignment before the renderer init
   (start-order change, not done in a VIS step).

**Owner script validated on the live engine** (`probe-cs6a-shader.mjs --owner`, real GPU): both flags set on the title
screen → new game: 56 / 56 bodies on the shared shader, 0 legacy diffuse maps, 0 "Rebake" logs; `csShared()` → OFF
(56 swapped, 4 502 ms legacy bake on the main thread) → `csShared()` → ON (1 ms, all maps from cache at once);
`csNextSystem()` → 54 / 54 textured in 1 391 ms, 0 "Rebake" logs.

**Owner check (light loop; Polish script in chat).** F5 → on the title screen set `sharedSurface` and `seededSystems`
to true → new game → look around, zoom on bodies → `csShared()` A/B → `csNextSystem()`.

#### 3.6.1 CS-6a tuning pass (2026-11-18; owner check PASS 2026-11-19)

Owner review of the first sheets and the in-game look: moons, variety, Io / Europa glow and the system-switch time
accepted; six items to tune before commit. All changes stay behind `FEATURES.sharedSurface`; `SurfaceField.js`, the
worker, `SurfaceCache.js`, `GasGiantShader.js`, the colony screen and saves are not touched.

| # | Item | Cause found | Change |
|---|---|---|---|
| 1 | terran / ocean looked cartoonish | the sea colour was the *shallow* slot over most of the depth range (× 1.2), a 40-power sheen lobe drew a large white blob, land was flat mixes of saturated slots | oceans = deep slot with a mild depth gradient, shallows only on a narrow shelf (depth < 0.07); terran / ocean / jungle palettes re-drawn (desaturated navy seas, olive / green / ochre / brown land; `crimson` foliage is now russet and rare outside M); glint = 900-power lobe + a faint 150-power halo, Fresnel-weighted; land gets dry-vegetation patches, stronger moisture / albedo noise, a fourth noise octave (× 460) and micro-normal roughness at close zoom |
| 2 | terran land grey at high water coverage | **Finding 771**: the field's elevation channel saturates at 1.0, so `h = (e − sea) / (1 − sea)` is ≈ 1 on most land; measured share of land classified `mountains` + `peaks`: 30% at water 0.2, 44–50% at 0.7, 58–74% at 0.9 (3 seeds × 6 000 points). The shader mirrored the classifier → rock slot everywhere | shader only: mountains are vegetated (darker montane tone), bare rock appears only where dry or on noise ridges (≤ 72%); peak snow also needs cold (`t`), not height alone. **Deliberate divergence from `cTerran`** until the field is fixed (CS-6b: stop the clamp / renormalise `e`, then re-align) |
| 3 | black ragged patches (hazy_moon pole, cryo_haze lake edges) | lake slot was near black (`#1e1a22`) and the shoreline used the detail-noise-perturbed elevation against a ± 0.004 threshold → ragged teeth; the polar patch is a polar lake (the field lowers `e` toward the poles), not a pole-mapping fault | shoreline from the raw map elevation, ± 0.012 soft threshold, lighter shallows, lake slots re-drawn dark but not black (10 variants) |
| 4 | dark regions crush to black under weak stars | albedo × dim star (M: 0.49 × G) fell under the display floor | soft luminance floor in linear albedo (`ALB_FLOOR` 0.03, hue-preserving, × up to 2.5 under a weak star, 60% on open water) + albedo gain up to × 1.4 under a weak star |
| 5 | soft at close zoom | only the 256×128 LOD map was wired | `_tickSurfaceHero`: every 6th frame the body with the largest on-screen disc gets the 1024×512 hero map from SurfaceCache (worker, priority `focus`) once its disc is ≥ 260 device px; back to the LOD map under 180 px; another body takes over only when 1.4 × larger. One hero at a time. Pure rule: `surfaceHeroDecision` |
| 6 | M-dwarf light differed between rocks and gas giants | surfaces used a softened star colour, everything else the raw PointLight | `SURFACE_SUN_TINT` 0.3 → **0.4**, and one fill PointLight at the star (flag ON only) adds exactly `soft − raw`, so raw + fill = `surfaceSunColor` for the **whole scene**. GasGiantShader untouched (D-CS-5). **Side effect to confirm with the owner:** rings, clouds, atmosphere shells, ships and stations get the same softened light (a per-body light is not possible in three without editing the gas shader) |

**Measurements** (real game, headless Chrome over CDP, real GPU, 1600×1041, `probe-cs6a-shader.mjs`, two full runs):
frame time OFF / ON, wide and close-up: 16.7 ms median, p95 16.7–16.8, max 16.8–17.0 (60 fps vsync cap, as before);
hero swap window (focus → hero map applied): max frame 16.8 ms, map width 256 → 1024, back to 256 after zoom-out;
system switch ON: 18–22 ms stall, fully textured after 1 682–1 733 ms (39–46 bodies), no "Rebake" log;
OFF: 3 091–3 264 ms stall, rebake after 7 189–7 651 ms. `csShared()` → ON with the camera already close: all maps
after 3 763 ms (includes the hero bake). Two visible PointLights with the flag ON, one with it OFF.

**Proof.** `cs6a-archetypes.png`, `cs6a-variety.png`, `cs6a-systemmap-before-after.png` regenerated;
new `cs6a-terran-closeup.png` (6 terran seeds, two per water band, hero map, stars G and K, terminator in frame).
The homeworld frame OFF | ON is the top row of the before / after sheet. GLSL compile probe: game program OK with and
without log depth, control fails (`ERROR: 0:337` / `0:348`). Keeper `colony_sphere_shader_smoke` 62 PASS (new S9:
hero hysteresis rule, raw + fill = surface sun colour for M / K / white / Dyson purple, white star → zero fill, fill
light created only behind the registry gate, switched off by `csShared` → OFF, hero map requested from SurfaceCache).
Sweep 432 / 432, 0 FAIL; `check-i18n` PASS. Flag OFF: no edit on the OFF path (the fill light and the hero tick sit
behind the empty-registry return); no pixel-level OFF comparison was run.

**Not verified / open after this pass.**
- The fill light was verified by count and by the keeper identity, and is visible on the gas giant in the before /
  after sheet; an M-system frame with a rock and a gas giant side by side was not captured.
- Adding / hiding the fill light changes the light count, so three recompiles lit programs once per toggle; the
  cost of that one-off recompile was not measured separately.
- Sheets after the last weak-star gain change were regenerated but not re-inspected frame by frame.
- Known issues 1, 2, 4, 7, 8, 9 of §3.6 are unchanged (CS-6b / later); 3, 5, 6 are addressed here.

**Finding 771** ✅ (fixed in CS-6b, §3.7 — SurfaceField v3, shader re-aligned) — SurfaceField terran recipe: elevation saturates at the 1.0 clamp, so the height-normalised
classes `mountains` / `peaks` take 30–74% of land (rising with water coverage) and the plateau has no relief gradient.
Gameplay terrain (CS-5) will inherit it. Fix belongs to CS-6b (carried SurfaceField fixes, version bump); the shader
divergence in item 2 is then removed. **The classifier must agree with the shader before CS-5.**

**Owner check 2026-11-19: PASS** ("everything looks good"): terran realistic (dark muted navy oceans, green / olive
land, small glint), homeworld land green, hero map sharpens on close zoom, no hitches, `csShared()` A/B and
`csNextSystem()` fine.

**Decision D-CS-21 (signed 2026-11-19):** item 6 option (a) — keep the whole-scene softened fill light; ships,
stations, rings, clouds and atmosphere shells share the same light as planets. GasGiantShader stays untouched.

**Carry list for CS-6b:** atmospheres per archetype; per-body clouds; Venus cloud deck; Titan haze with an opacity
parameter for the colony view; tidally-locked orientation; ice seed similarity; barren crater modulation; cryo_haze vs
hazy_moon differentiation; moon crater A/B sheet (current vs ≈ +40% density — owner picks, default stays current);
Finding 771 field fix + re-align the shader; verify an M / K frame with rock + gas giant + ship under one light.

### 3.7 CS-6b — atmospheres, clouds, decks, tidal lock, SurfaceField v3 (2026-11-19; not committed, owner look pending)

Everything new sits behind `FEATURES.sharedSurface` (default `false`). The colony screen, saves, gameplay systems,
`GasGiantShader.js` (D-CS-5) and the critical files are not touched. `SurfaceField.js` changes value (version 2 → **3**),
but nothing gameplay-side reads it yet (CS-5).

**Files.** New: `src/data/BodyAtmospheres.js` (per-archetype air data), `src/utils/SurfaceAirLogic.js` (pure:
`resolveAirLook`, `isStarLocked`, `substellarDirOf`, `starLockQuat`), `src/renderer/SurfaceAirShader.js` (two GLSL
programs, THREE injected), keeper `colony_sphere_air_smoke.mjs`, probe `probe-cs6b-air.mjs` + `cs6b-sheet-page.js`.
Changed: `SurfaceField.js` (v3), `BodyArchetypes.js` (barren field knobs, comments), `SurfaceShader.js` (terran look
re-aligned), `ThreeRenderer.js` (air shells, tidal lock, `bodyHazeOpacity`), `SurfacePaletteLogic.js` (three colour
helpers exported), `ColonySphereDebug.js` + `GameScene.js` (`csDeck` / `csLocked` / `csHaze`),
`colony_sphere_surface_smoke.mjs` (golden v3 + B9), `probe-cs4a-terrain-report.mjs` (`--cut`), `cs6a-sheet-page.js`
(three helpers exported).

#### Finding 771 — fixed (SurfaceField v3)

Cause confirmed by measurement: the terran recipe's raw elevation runs well past 1.0 and was clamped to [0, 1] (up to 54% of the land of a
water-0.9 world sat exactly at e = 1); the
classifier's height `h = (e − sea) / (1 − sea)` divides by what is left under the clamp, so the higher the sea level,
the more land sits at h ≈ 1.

Fix: for the terran family (`terran` / `ocean` / `jungle`) the same 4 096-point calibration that finds the sea level now
first normalises the raw elevation affinely — the 1% quantile maps to 0.05 and the 99.5% quantile to 0.95 ± 0.06
(`ELEVATION_NORM`; the ± is a new per-seed `relief` value, flat world … rugged world), and the sea level is the quantile of
the normalised channel. No extra samples, no trig (D-CS-16 keeper green). Classifier thresholds re-tuned on the new
distribution: terran `mountains` h > 0.54 (was 0.58), `island_peaks` h > 0.55 (was 0.45); snowline rule unchanged.
Other recipes are not normalised and compute bit for bit as in v2 (keeper witness: 72 of 72 old golden rows).

Share of **land** per class, 12 seeds × 1 500 points per water coverage (min / median / max; keeper B9 prints this table):

| water coverage | v2 mountains + peaks | v2 peaks (median) | v2 land saturated at e = 1 (max) | v3 mountains + peaks | v3 peaks (median) | v3 saturated (max) |
|---|---|---|---|---|---|---|
| 0.2 | 20 / 27 / 35% | 8% | 7% | 9 / 15 / 25% | 2% | 1% |
| 0.5 | 21 / 27 / 35% | 9% | 11% | 8 / 13 / 22% | 1% | 1% |
| 0.7 | 24 / 33 / 39% | 11% | 18% | 10 / 15 / 21% | 2% | 2% |
| 0.9 | 32 / 54 / 72% | 23% | 54% | 13 / 20 / 30% | 3% | 6% |

`ocean` archetype: island peaks 9 / 20 / 30% of land (60 seeds; v2 24–43%). `jungle`: mountains 6 / 12 / 21% (v2 11–21%).

Terrain-share report re-run (`probe-cs4a-terrain-report.mjs --cut 0.01`, same galaxies and bodies as §3.4.1; share of
**all tiles**, today's generator column unchanged). Only these rows moved; the other 13 rows and every buildable share
(min / median / max) are identical to the CS-4a table:

| Archetype | n | buildable min / median / max | v2 terrains % | v3 terrains % |
|---|---|---|---|---|
| terran | 28 | 14 / 30 / 79% (unchanged) | ocean 71, mountains 10, ice_sheet 7, forest 5, plains 4, desert 3, tundra 1 | ocean 71, ice_sheet 7, forest 6, plains 5, desert 5, mountains 3, tundra 2 |
| jungle | 7 | 80 / 83 / 85% (unchanged) | forest 55, mountains 17, ocean 17, plains 12 | forest 61, ocean 17, plains 12, mountains 12 |
| ice | 60 | 100% (unchanged) | ice_sheet 80, wasteland 19 | ice_sheet 81, wasteland 19 |
| barren | 56 | 100% (unchanged) | wasteland 90, crater 6, mountains 4 | wasteland 90, crater 6, mountains 4 |

Terran mountains: 10 of 29 land-and-ice tiles (≈ 34%) → 3 of 29 (≈ 10%). D-CS-20 is not affected (mountains are buildable).

**Shader re-aligned (D-CS-16).** The CS-6a workaround is removed: `lookTerran` draws rock where the classifier says
`mountains` (smoothstep centred on the same threshold, partly vegetated only where wet) and snow exactly where it says
`peaks` (h > 0.45 + 0.7·t); the extra "needs cold and noise" conditions are gone. Sheet `cs6b-field-v3.png`.

**Carried field fixes (same version bump).**
- *Ice seeds too similar:* three new per-seed values — share of old ice vs smooth plains (region bias ± 0.15), ridge
  strength × 0.45–1.55, ridge scale 2.0–4.4. Measured spread of the old-ice share across 12 seeds: 19 pp → 29 pp.
- *Barren crater modulation too weak:* measured first — the regional density factor already existed, the regions just did
  not read. Barren now uses `regional` 0.95, new knobs `regionalDepth` 1.0 (plains nearly craterless) and `highlandBoost`
  0.35, plus `lavaPlains` 0.7 (plains smoother and slightly lower). Regional contrast of crater activity (90th / 10th
  percentile cell, median of 12 seeds): 4.9 × → 8.4 ×. The two new knobs default to the old arithmetic, so the moon
  archetypes are bit-identical (control: rocky_cratered 4.7 × before and after).

#### Atmosphere, clouds, decks (flag ON)

A body on the shared shader gets **two shells** in place of today's white cloud sphere + blue rim (same number of draw
calls): a cloud / veil shell at 1.016 r (front side, premultiplied alpha) and a limb halo at 1.035–1.115 r (back side,
additive). Both read the same shared light uniforms as the surface (softened star colour, D-CS-21). Airless bodies get
neither; today's pair is no longer created for shared-shader bodies.

| Archetype | Halo / veil | Clouds | Notes |
|---|---|---|---|
| terran / ocean | blue; veil 0.34 / 0.38, rising toward the limb, day side only | coverage 0.26–0.60 / 0.42–0.72 | the veil lifts the dark oceans; clouds range from scattered cumulus to storm bands and swirls |
| jungle | humid green-cyan, veil 0.46 | 0.46–0.76 | milkier than terran |
| desert | thin pinkish (Mars), veil 0.20 | 0.03–0.14 | bluish twilight |
| ice / volcanic / tidally_locked (with an atmosphere) | pale blue / smoky orange-brown / pale lilac, veil 0.20–0.30 | sparse (ash-grey on volcanic) | only when the stored atmosphere class is thin / breathable / dense |
| hothouse | thick cream halo; **opaque deck** (hazeOpacity 1.0) | — | banding + swirls; variants cream / sulphur / tan; surface hidden on the system map |
| cryo_haze | orange; **opaque haze** (0.97) | — | variants orange / amber / rust |
| hazy_moon | paler peach / ochre / salmon; **thinner** (0.86) | — | surface shows faintly; tone differs from cryo_haze |
| scorched, barren, the four airless moons, planetoids | none | none | |

- **Never the same twice:** variant A + up to 40% of variant B + hue / saturation / value jitter from `surfaceSeed`; cloud
  coverage, cell scale, banding and swirl drawn from the seed inside the archetype's range; the pattern itself is offset by
  a three-number phase from the seed. Stored atmosphere class scales density (thin 0.55, breathable 1.0, dense 1.3).
- **Light:** day-side scattering with a soft gate that wraps further behind the terminator for denser air, a warm (or, on
  Mars / Titan types, bluish) twilight band, cloud self-shading toward the star, forward-scatter boost when backlit.
- **Drift:** slow rigid rotation of the pattern (≈ 0.008–0.02 rad/s real time, about 1 body in 7 retrograde) plus a very
  slow evolution of the swirls.
- **`hazeOpacity` — one parameter per body** (uniform `uVeil.x`): `ThreeRenderer.bodyHazeOpacity(bodyId[, value])`,
  `SurfaceAirShader.setHazeOpacity`. The system map keeps the archetype value; CS-7 thins it in the colony view. Preview:
  `csHaze(0.3)` / `csHaze()`; last column of `cs6b-venus-titan.png`.

**Tidally locked.** Planets with the stored `tidallyLocked` flag (moons never — they are locked to their planet) get no
axial spin and no axial tilt with the flag ON; the mesh is oriented every physics tick so the sub-stellar point faces the
star. For the `tidally_locked` archetype that point is the centre of the field's "eye" (`surfaceInfo().variation.
substellar`, the seed-tilted direction the recipe already used); other locked archetypes show the field's +x. The
rotation is "fixed turn of the sub-stellar point onto +x, then a turn about the vertical axis" — poles stay upright
and the motion is uniform (the naive shortest-arc rotation flips the poles once per orbit; keeper control).
**Scope note for the owner:** the flag is set on every close-in planet, so with the flag ON a locked *terran* around an
M dwarf also stops spinning and keeps one face to its star. Easy to narrow to the `tidally_locked` archetype if unwanted.

**Moon craters A/B (owner decides — default NOT changed).** `cs6b-moon-craters-ab.png`: rocky_cratered (density 0.70 vs
0.98) and icy_cratered (0.85 vs 1.19), 3 seeds each, same light. **D-CS-22:** signed 2026-11-19 — B (§3.7.1).

**Light check (D-CS-21).** `cs6b-mk-light.png`: one in-game camera frame in a K system — rocky moon, its gas giant and
an orbital station (spawned by the probe with `debug.spawnStation`), two visible PointLights (star + fill). Moon and
giant are lit from the same side with the same warm-white tone. The station model reads very dark and small in that
frame; its lighting cannot be judged from it.

**Measurements** (real game, headless Chrome over CDP, real GPU RTX 3070, 1600×1041, `probe-cs6b-air.mjs --game`, three
runs, each a different random galaxy):
- frame time, home system, wide and close-up, OFF and ON: median 16.7 ms, p95 16.7–16.8, max 16.8–16.9 in all twelve
  measurements (60 fps vsync cap — the cap hides any difference below it, as in CS-6a);
- system switch with the flag ON: 17–23 ms synchronous stall; all maps in after 1 153 ms (30 bodies), 1 373 ms (43),
  1 398 ms (39), 2 816 ms (48), 3 014 ms (50). CS-6a measured 1 682–1 733 ms for 39–46 bodies; the two slow samples are
  the two largest systems. Field bake cost itself is unchanged: 18 surface archetypes at 256×128 take 839 ms in v3 vs
  851 ms in v2 (node, same seeds);
- owner path (`--owner`, both flags on the title screen): air present right after start (4 bodies with air in the home
  system), no legacy cloud / halo left on any shared-shader planet in 9 system visits, `csShared()` → OFF restores
  today's layers (3 planets) and removes every shell and lock, sub-stellar alignment dot product 1.00000 wherever a
  locked planet exists, `bodyHazeOpacity` set / read / restore exact.

**Proof** (`docs/design/prototypes/`): `cs6b-atmospheres.png` (every archetype, star G, terminator in frame),
`cs6b-clouds.png` (terran / ocean / jungle / desert × 6 seeds), `cs6b-venus-titan.png` (hothouse, cryo_haze, hazy_moon × 3
seeds + hazeOpacity 0.35 column), `cs6b-tidally-locked.png` (top view at 4 orbit positions + the body seen from the star
at each — the surface is identical, the clouds are not, they drift), `cs6b-moon-craters-ab.png`, `cs6b-mk-light.png`,
`cs6b-systemmap-before-after.png` (homeworld + a cryo_haze planet, OFF | ON), `cs6b-field-v3.png`.

**Keepers.** GLSL compile probe (`probe-cs6b-air.mjs --compile`): shell and halo programs compile with and without log
depth and draw lit pixels; the four controls fail (`'cs6b_broken_control' : undeclared identifier`).
`colony_sphere_air_smoke` 44 PASS (new). `colony_sphere_surface_smoke` 44 PASS — golden values **re-recorded
deliberately** (132 rows, 11 archetypes; of the previous 84 rows only the 12 terran rows changed). Fail-first in a
detached worktree of 9d3ff56 with the final file: 9 red (golden, version, four Finding-771 pins, relief, ice, barren),
controls green on both sides (72 untouched v2 rows, seed variation, rocky_cratered contrast).
`colony_sphere_shader_smoke` 62, `colony_sphere_cache_smoke` 56 (cache key now `v3`), archetypes 161, seeds 123. Sweep
433 / 433, 0 FAIL; `check-i18n` PASS. One signed-style pin change: `SurfaceAirLogic.js` joins the list of modules allowed
to import `SurfaceField` (it reads `surfaceInfo` only; pinned in the air keeper).

**Flag OFF.** Edits on the OFF path of `ThreeRenderer`: a `sharedBody` constant that is `false` without a shared-shader
material (gates the two legacy blocks), the planet entry object built before `_planets.set`, and an `if (entry.starLock)`
test in front of the unchanged spin line. Verified by source pins and by the in-game state readout (OFF: 0 shells, 0
locks, legacy layers present). **No pixel-level OFF comparison was run.**

**Not verified / open.**
- Frame cost above the 60 fps cap is not measured (no uncapped run); the shell shader does 13 value-noise lookups per
  cloud fragment vs 15 simplex lookups in today's cloud shader.
- Cloud coverage numbers are archetype knobs, not measured area shares (the threshold mapping is tuned by eye).
- The station in the light frame is too dark to judge; a ship was not captured.
- The second system of the before / after sheet is whichever generated system has a deck planet; a hothouse deck was
  seen in game only in the home system of one run, not on a sheet (sheets cover it).
- `csDeck` / `csLocked` move the renderer camera directly (no selection event).

**Finding 772** ⚪ — `BodyArchetypes` rows still carry the placeholder fields `atmosphere { tint, density }` and
`clouds { coverage }`; nothing reads them (the live source is `BodyAtmospheres.js`), but `colony_sphere_archetypes_smoke`
pins their shape. Two sources for one thing — remove the placeholders (and the shape pin) in CS-Z or fold the table in.

**Owner check (console lines without quotes).** Title screen: `KOSMOS.gameConfig.FEATURES.sharedSurface=true`, then
`KOSMOS.gameConfig.FEATURES.seededSystems=true` → new game → (1) homeworld close-up: blue haze on the limb, clouds with
structure, drifting slowly; (2) a desert, an ice and an airless body from the outliner: thin pinkish / pale / no air;
(3) `csDeck()` — camera jumps to the next hothouse / cryo_haze / hazy_moon body (switches system when needed), then
`csHaze(0.3)` and `csHaze()` to see the one opacity parameter; (4) `csNextSystem()` until an M or K star, look at a rock
next to a gas giant; `csLocked()` — a locked planet, day side toward the star; (5) `csShared()` twice for A/B in place.
Decisions given back 2026-11-19: D-CS-22 = B, tidal-lock scope = archetype only (D-CS-23) — see §3.7.1.

**Carry to CS-7 / later:** thin `hazeOpacity` in the colony view; cloud shadows on the surface; night-side city lights
under clouds (CS-9); Finding 772.

#### 3.7.1 CS-6b tuning pass (2026-11-19; owner approved the CS-6b look, seven tuning items; not committed, owner look pending)

Owner check of §3.7: atmospheres, Venus decks, Titan haze, tidal lock and the Finding 771 fix approved. Everything below
still sits behind `FEATURES.sharedSurface`; no gameplay, colony-screen or `GasGiantShader.js` change.

**Decisions signed 2026-11-19.**
- **D-CS-22 — moon craters: option B.** `rocky_cratered` crater density 0.70 → 0.98, `icy_cratered` 0.85 → 1.19 (≈ +40%).
  `SURFACE_FIELD_VERSION` 3 → **4** (cache key `v4`).
- **D-CS-23 — tidal-lock scope: the archetype only.** Only planets of the `tidally_locked` archetype stop spinning and
  face the star (`isStarLocked`). A terran (or any other) world that merely carries the stored `tidallyLocked` flag
  keeps its normal rotation — its surface is generated with a rotation-based climate. The flag stays as data.
  This supersedes the "Tidally locked" scope paragraph of §3.7. `csLocked()` now looks for the archetype; it returns
  `null` in a galaxy without such a planet (seen in 2 of 3 probe galaxies — the archetype is rare).

**1. Clouds evolve (was: rigid drift only).** `SurfaceAirShader` cloud block rewritten, new uniform `uFlow`
(weather phase, band wind, wind-band count, puffiness):
- *Weather systems* (where the clouds are): low-frequency field sampled in **two phases half a cycle apart**, cross-faded
  with triangle weights; each phase lives one cycle and returns with a new pattern, so systems form, grow and dissipate
  without a pop (contrast is variance-compensated at mid-fade). Cycle ≈ 117–175 s of weather time per body
  (`AIR_WEATHER.cycleSeconds` 140 ± 20% from the seed), start phase from the seed (bodies do not pulse together).
- *Latitude-band wind:* inside a phase the pattern is shifted along the parallels by `wind · sin(π · bands · sin lat)`
  (0.6–1.2 rad per cycle, 1.6–3.4 bands, sign from the seed) — neighbouring bands move in opposite directions. The shift
  is bounded to half a cycle and is zero where the phase weight peaks, so the pattern never winds up into streaks.
- *Cumulus cells:* cellular noise whose feature points orbit inside their cells with the weather phase — cells grow,
  shrink and merge. The rigid whole-pattern drift (`uShape.w`) stays.
- **Clock = game clock** (`weatherRate` in `SurfaceAirLogic`, `ThreeRenderer._tickSharedSurfaces`): paused → 0 (frozen);
  1 day/s → 1 ×; faster game → √(days/s), capped at 3 × (`AIR_WEATHER.speedCap`). Measured in game over 3 s of real time
  (`--owner`): paused 0 cycles and 0 rad; 1 d/s 0.0214 cycles; 3 d/s 0.0369 (1.72 ×); 1 y/s 0.0643 (3.0 ×).
  Decks (hothouse / cryo_haze / hazy_moon) keep their approved look; their slow swirl evolution now runs on the same clock.

**2. Smear removed.** Measured cause: the domain warp displaced the detail lookup by up to ≈ ± 3.8 noise cells, and the
storm-belt term carried 55% of the system mask. Now: warp ≤ ± 0.5 cell, belt share 28%, archetype `warp` / `band` ranges
lowered (terran / ocean / jungle), cell detail from cellular noise, narrower threshold (crisp-but-soft edge), cloud alpha
eased by 30% at the very limb. Same lookup budget order as before (11 noise lookups, two of them cellular, vs 13).

**3. Gas giant highlight — measured before fixing.** Same paused frame, M star, camera on the star side
(`probe-cs6b-air.mjs --gasspec`, sheet `cs6b-gas-highlight.png`): the soft highlight in the middle of the disc **exists
with the flag OFF** — it is the giant's own specular reflection of the star (`MeshStandardMaterial`, roughness 0.45,
VISUALS arc). The D-CS-21 fill `PointLight` added a second, cool specular on top of it, which turned it into the white
blob (peak pixel 108 / 85 / 112 with the fill specular vs 102 / 35 / 73 without). Fix: the fill light now only tints.
three has no diffuse-only light and `GasGiantShader.js` must not change, so the marker lives in the light: new
`src/renderer/DiffuseOnlyLight.js` patches the text of three's `lights_fragment_begin` chunk once at `ThreeRenderer`
import — after a point light with `distance < 0` the accumulated `directSpecular` is restored; the fill light is created
with `distance = -1` (attenuation is unchanged: decay 0, no cutoff). The star light is untouched, so what remains on the
giant is exactly today's star highlight, now on a correctly tinted disc. **Flag OFF:** the chunk text is patched for
every lit material, but no light carries the marker, so the branch is never taken (no pixel-level OFF comparison run).
If a three update removes the anchors, the patch is skipped with a console warning and the fill keeps its specular.

**4. Jungle alien foliage.** `maroon` variant weights `{ M: 3, K: 1.5, G: 0.5, F: 0.4 }` → `{ M: 3, K: 1.2, G: 0.1,
F: 0.08 }`. Share as the main variant over 600 seeds: M 40.8%, K 23.0%, G 3.3%, F 2.0%.

**5. D-CS-22 applied.** Golden values re-recorded deliberately: of the 132 previous rows only `rocky_cratered` rows
changed (2 of 12 sample points sit on a crater); 12 `icy_cratered` rows added so that archetype is pinned too (144 rows).
`rocky_cratered` regional contrast 4.7 × → 3.6 × (denser craters fill the quiet regions). `cs6b-moon-craters-ab.png`
now reads "B = new default"; column A reproduces the previous density.

**6. D-CS-23 applied** (see above). Witness in game: a terran planet with the flag in an M system has no star lock.

**7. Titan haze.** `cryo_haze` `hazeOpacity` 0.97 → **0.90** (owner's value); `hazy_moon` unchanged (0.86), tones unchanged.

**Performance** (real game, headless Chrome over CDP, RTX 3070, 1600×1041, `--perf`). New instrument: `--uncapped`
removes vsync and a 1×1 `readPixels` per frame synchronises with the GPU, so the number includes GPU work. Mean frame
time, two runs each (different random galaxies), previous CS-6b build → this build: full system view 1.41 / 1.38 →
1.47 / 1.40 ms; homeworld close-up 1.50 / 1.43 → 1.56 / 1.47 ms; disc filling the frame 1.69 / 1.44 → 1.50 / 1.60 ms.
Inside run-to-run noise — no regression. Capped run: 16.67 ms mean, p95 16.7–16.8 in all views.

**Proof** (`docs/design/prototypes/`): `cs6b-clouds-evolution.png` (terran and ocean at t = 0 / 20 / 40 / 60 s, same
camera, surface fixed; third row with the rigid drift frozen — band wind + evolution), `cs6b-gas-highlight.png` (new),
and regenerated `cs6b-clouds.png`, `cs6b-mk-light.png`, `cs6b-moon-craters-ab.png`, `cs6b-venus-titan.png`,
`cs6b-atmospheres.png`, `cs6b-tidally-locked.png`, `cs6b-field-v3.png`, `cs6b-systemmap-before-after.png`.

**Keepers.** GLSL compile probe: both programs compile with and without log depth, four failing controls fail.
`colony_sphere_air_smoke` 53 PASS (new block A8: `weatherRate`, weather look from the seed, `setAirClock`, two-phase
shader pins, `DiffuseOnlyLight` against the real three chunk with an anchor-less control, fill-light marker only on the
fill light, jungle `maroon` shares; `isStarLocked` and `cryo_haze` pins re-signed). `colony_sphere_surface_smoke` 45 PASS
(golden v4, D-CS-22 pin; the "moon rows equal v2" witness now covers the 60 non-moon rows and requires the moon rows to
differ). Shader 62, cache 56, archetypes 161. Sweep 433 / 433, 0 FAIL; `check-i18n` PASS. Owner path (`--owner`): OK.

**Not verified / open.**
- The band-wind row of the evolution sheet cannot isolate the wind from the evolution (both run on the weather phase).
- Cloud coverage of the visible hemisphere swings as systems form and dissipate; it is not normalised per frame.
- The fill light is diffuse-only for **every** lit material (rings, ships, stations too) — not looked at separately.
- No pixel-level flag-OFF comparison (as in §3.7).
- `cs6b-mk-light.png` label still reads "lights: star + fill"; the fill there is the tint-only light.

**Owner check (console lines without quotes).** Title screen: `KOSMOS.gameConfig.FEATURES.sharedSurface=true`, then
`KOSMOS.gameConfig.FEATURES.seededSystems=true` → new game → homeworld close-up: watch the clouds ≈ 1 minute at 1 d/s
(shapes form and dissipate, bands drift apart), then at a faster speed (faster, no flicker), then paused (frozen);
`csDeck()` (cryo_haze at 0.90); `csLocked()` (archetype only; `null` = this galaxy has none); `csNextSystem()` to an
M / K system with a gas giant — the highlight on the giant is the star's own, no white blob.

##### Cloud tuning pass #2 (2026-11-19; owner check of the pass above; not committed, owner look pending)

Owner check: Titan haze 0.90, `csLocked`, the gas giant highlight and D-CS-22 / D-CS-23 accepted. Clouds only in this
pass; it **supersedes items 1–2 above where they differ** (cellular noise, cycle length, speed cap).

**1. Clouds co-rotate with the planet.** Measured cause: a planet's air shell is a child of the planet *group*, while
only the body *mesh* spins — the cloud layer stood still over a turning surface. `_tickSharedSurfaces` now copies the
mesh orientation to the shell every frame (moon shells are children of the mesh and already turned with it). The band
winds and the slow whole-pattern drift are therefore motion **relative to the surface**. A star-locked body
(D-CS-23) gets no drift at all — band winds and evolution only. In game (`--owner`, 3 s): body turned 0.54 rad, shell
within 0.003 rad of it (one frame); paused: body 0, clouds 0.

**2. Evolution about twice as fast.** `AIR_WEATHER.cycleSeconds` 140 → **70** (per body 58–88 s from the seed);
`speedCap` 3 → **2.5** (shortest full renewal ≈ 28 s — no flicker). Weather phase advance per 3 s of real time:

| game speed | `weatherRate` | cycles / 3 s (75 s-cycle body) | previous pass |
|---|---|---|---|
| paused | 0 | 0 (measured) | 0 |
| 1 day/s | 1.00 | 0.0402 (measured) | 0.0214 |
| 3 days/s | 1.73 | 0.0696 (measured) | 0.0369 |
| 1 week/s | 2.50 (cap) | 0.100 (computed) | 0.0567 (computed) |
| 1 month/s, 1 year/s | 2.50 (cap) | 0.100 (computed) | 0.0643 (measured) |

The in-game sample at 1 year/s was cut short by the game's own auto-pause (0.0692 in the part that ran); the cap is
pinned by the keeper (`weatherRate`).

**3. Look — soft again, without the smears.** The cellular noise is gone (functions removed from the shader). Density
now comes from three soft octaves that slide against each other with the weather phase, read through **two ramps**: a
wide one for thin semi-transparent veils and feathered edges (42% of the alpha) and a higher one for thick cores (58%).
Thick parts are gently shaded toward their shadowed side (detail sampled toward the star; × 0.72–1.12) and are slightly
brighter on top. Fronts and spirals come from a mild warp of the *systems* layer only (the detail warp stays ≤ ± 0.5
cell — that was the smear). Whole-world white-outs: system contrast 2.5 → 1.7 and threshold `0.69 − 0.25 · coverage`
(tuned on the sheet — the first version of this pass still whited out ocean / jungle worlds). 13 noise lookups per cloud
fragment (the pre-tuning shader had 13).

**Performance** (same instrument as above, mean frame ms, two runs each; previous pass → this pass): full system view
1.44 / 1.55 → 1.40 / 1.41; close-up 1.45 / 1.51 → 1.45 / 1.40; disc filling the frame 1.55 / 1.77 → 1.58 / 1.40. No
regression.

**Proof:** `cs6b-clouds.png`, `cs6b-clouds-evolution.png` (rows 1–2: surface held, t = 0 / 20 / 40 / 60 s; row 3: the
planet turns 0.22 rad per step and the cloud layer turns with the continents), all other CS-6b sheets regenerated.

**Keepers.** Compile probe OK with four failing controls. `colony_sphere_air_smoke` 54 PASS (co-rotation and
locked-body pins added; cycle range, cap and shader-shape pins re-signed), surface 45, shader 62, cache 56. Sweep
433 / 433, 0 FAIL; `check-i18n` PASS; owner path OK.

**Not verified / open.** Coverage of the visible hemisphere still swings while systems form and dissipate (not
normalised). The shell follows the mesh one frame late (0.003 rad at the measured spin). On the turning row of the sheet
the clouds also evolve, so the match with the continents is approximate by design.

**Owner check.** Both flags on the title screen as above → new game → homeworld close-up ≈ 1 minute at 1 d/s (clearly
different layout after a minute; the clouds turn with the continents), faster speed, paused (planet and clouds stop).

##### Owner check — PASS (2026-11-19)

Owner in-game check of CS-6b with both tuning passes: **PASS**. Approved: atmospheres per archetype, Venus decks, Titan
haze, tidal lock, gas giant highlight fix (fill light diffuse-only), Finding 771 fix (SurfaceField v3 → v4), clouds
(evolving, co-rotating with band winds relative to the surface, soft look without smears or cellular texture).

- **D-CS-22 — SIGNED:** moon craters option B (rocky_cratered 0.98, icy_cratered 1.19; SurfaceField v4).
- **D-CS-23 — SIGNED:** tidal lock (no spin, sub-stellar point toward the star) only for the `tidally_locked` archetype;
  the stored `tidallyLocked` flag stays as data.
- **cryo_haze `hazeOpacity` 0.90** — owner's choice (hazy_moon 0.86 unchanged).
- **Finding 772** ⚪ open — `BodyArchetypes` rows carry unused `atmosphere` / `clouds` placeholder fields; the live data is
  `BodyAtmospheres.js`. Remove (with the archetypes keeper shape pin) in CS-Z or fold in.

**Carry to CS-7:** thin `hazeOpacity` in the colony view (`ThreeRenderer.bodyHazeOpacity`); show the upscaled LOD map
first and swap in the hero map; prefetch the capital's hero map after game start; clouds on the colony sphere must use
the same co-rotating, evolving field (`SurfaceAirShader`, weather clock `weatherRate`).

**Next step in the plan: CS-PHYS (Opus).**

### 3.8 CS-PHYS-a — realistic climate at generation (D-CS-19 part 1 of 2; design 2026-11-19)

CS-PHYS is cut in two: **CS-PHYS-a** climate only (this section, `FEATURES.realisticClimate`), **CS-PHYS-b** orbits
scaled by stellar luminosity (separate step, separate flag). No orbit, RNG-stream or visual code changes here.

**World property (as D-CS-18).** The model is decided once at world creation — `GameScene.start()` (new game only,
the same branch as the pre-minted galaxy seed) and `GameCore.boot()` — read from the flag exactly once, passed to the
home-system generator and stamped as `galaxyData.climateModel = 2` (only when ON; saved whole inside `galaxyData`, no
version bump). `SystemGenerator.worldClimateModel(galaxyData)` is the only reader for foreign systems: stamp 2 → 2;
a world record without the stamp → 1 (legacy, every old save); no record → the flag (headless API only).
`worldSeedContext` is unchanged (its JSON shape is pinned). Flipping the flag later changes nothing.

**Zero RNG draws.** The climate is a pure function of values the generator already drew, computed after the draws
that use temperature. The atmosphere is still rolled from the pre-greenhouse equilibrium temperature `T_base_C`;
`getPlanetColor` keeps receiving the legacy temperature (no visual change, the same draw count). So a climate-v2 world
has exactly the same bodies, orbits, atmospheres, compositions and deposits as a legacy world with the same seed —
only `temperatureC/K` differ and a `climate` record is added. `peekCountsForStar == generated` holds trivially.

**Formulas** (new pure module `src/utils/ClimateModel.js`; flux `S = L/a²` in S⊕, moon: the parent's `a`):
- Equilibrium (unchanged): `T_eq = 278 K · (1−A)^¼ · L^¼ / √a`, albedo per type (rocky 0.15, hot_rocky 0.05, ice 0.50,
  gas 0.35; moons icy 0.6 / rocky 0.12; planetoids 0.05–0.15).
- Greenhouse, grey-atmosphere approximation: `T_s = T_eq · (1 + ¾·τ)^¼`, `ΔT = T_s − T_eq`, optical depth τ(atmosphere, S):

| Atmosphere | τ for S ≥ S_col (0.35) | runaway (S 1.1 → 1.5, smoothstep) | collapse floor (S → 0) |
|---|---|---|---|
| none | 0 | — | 0 |
| thin | 0.1 | none | 0.05 |
| breathable | 0.478 · S^−1.70 (carbonate–silicate thermostat: Earth at S 1, ≈ 0 °C at the HZ outer edge) | none | 0.3 |
| dense | 7 | → 33 (Venus ≈ 434 °C) | 1.7 (Titan ≈ −180 °C) |
| thick | 14 | → 40 (Venus ≈ 467 °C) | 2.5 |

  Below `S_col = FLUX_HZ_OUTER = 0.35` (the CO₂ maximum-greenhouse limit, the same constant that splits hothouse /
  cryo_haze) the CO₂ part condenses: `τ = floor + (τ(S_col) − floor) · (S/S_col)^8` (sharp collapse). Every τ of thick
  ≥ dense at every flux, so the `thick < dense` inversion is gone. Calibration note: the game's rocky albedo 0.15 puts
  Earth's `T_eq` at −6 °C, so the breathable greenhouse at Earth flux is **+21 K** (Earth = +15 °C); measured against
  real Earth's Bond-albedo `T_eq` 255 K it is the textbook +33 K — the lighter game albedo carries 12 K of it.
- Airless bodies (`none`; gas giants excluded) — **display only**, stored, the gameplay value stays the mean:
  day max = subsolar `√2 · T_eq` at perihelion flux `L/(a(1−e))²`; night min = `min(95 K, 0.75 · T_eq)` (slow-rotator
  regolith night). Mercury (A 0.05, a 0.387, e 0.206) → +427 / −178 °C. Thin atmospheres: the same range halved toward
  the final temperature (Mars ≈ −4 / −116 °C).
- Moons: greenhouse from the parent's flux; tidal + parent-IR heating for moons of **gas** giants by rank zone
  (`moonZoneOfRank`, same as the archetypes): inner 2.5 W/m² (Io), mid 0.05 W/m² (Europa), outer 0:
  `T = (T_s⁴ + F/σ)^¼`; night min raised to `(F/σ)^¼`. Effect at Jupiter: Io-like +6 K; negligible near the star.
- Planetoids: equilibrium only (temperature unchanged), plus the airless display range.
- Homeworlds (player + every AI): `makeHomeworldBreathable` recomputes with the stored `climate` record
  (`T_eq + ΔT(breathable, S)`), then the same 5–35 °C clamp with the same draws; HomeworldClimate band unchanged.
- `LifeSystem._recalcTemp` / `_recalcTempOwnStar` do nothing in a climate-v2 world (temperatures are generation-time
  and frozen, D-CS-19); `_calcPotential` still runs; LifeSystem otherwise untouched.

Stored per body (planet / moon / planetoid, only in v2 worlds, key omitted otherwise so legacy saves stay byte-equal):
`climate = { model: 2, flux, eqC, greenhouseC, tidalC, dayMaxC, nightMinC }` (°C rounded to 0.01; range `null` when
not airless/thin); restored `?? null`, no version bump.

**Order of operations** (per body, generator): orbit + type + mass → radius, gravity → `T_eq` → atmosphere rolled from
`T_base_C` (unchanged) → `T = T_eq + ΔT(atm, S)` (v2) → colour from the legacy temperature → … → `_enforceMinSeparation`
recomputes moved planets with the same model → moons (parent's final `a`), tidal pass per parent after all its moons →
planetoids → (home) `makeHomeworldBreathable` → archetypes assigned from the stored values (frozen, D-CS-2; secondary
temperature clauses see v2 values in new worlds; not re-selected anywhere).

**Expected analogues:** Earth (rocky, breathable, S 1) +15 °C · Venus (rocky, S 1.91) dense 434 / thick 467 °C ·
Mars (rocky, thin, S 0.43) −53 °C · Titan (ice planet, dense, S 0.011) −180 °C (thick −175) · Mercury day/night
+427 / −178 °C · Io-like inner moon of a Jovian giant +6 K tidal.

**Every gameplay consumer of temperature** (expected effect in v2 worlds; measured in §3.8 results):
- `EnvironmentBands.temperatureBand` (`src/data/EnvironmentBands.js:20`, cold < −53 / hot > 77 °C) feeds
  `PopulationData.planetGrowthMod` (`:32`, pop growth ×0.85 outside moderate), `EnvironmentCost.envMultiplier`
  (`:44`, build/upkeep surcharge cold +25% / hot +15%), `ProsperitySystem` (`:207`), `ConsumerGoodsData` (`:14`) and the
  colony info panel (`EnvironmentEffectLogic.js:40`). Expect: thin/none bodies a few K warmer (≈ same band), dense/thick
  HZ bodies move moderate → hot, breathable HZ worlds stay moderate.
- `HexTile.js:191` open-air climate gate (`requiresOpenAirClimate` buildings need T ≥ 0 °C): breathable worlds near the
  HZ outer edge sit at ≈ 0 °C (gate flips either way), dense worlds open up, cold thin worlds stay closed.
- Colony map terrain: `PlanetMapGenerator._calcWeights` / `_applyPolarEffects` (`src/map/PlanetMapGenerator.js:150,357`),
  `RegionSystem` (`src/map/RegionSystem.js:404,470`), `BodyTerrainUtils.getBodyTerrains` (`:32`, outpost picker) read
  `surface.temperature`: hot greenhouse worlds lose ice caps / gain hot biomes.
- `LifeSystem._calcPotential` (`src/systems/LifeSystem.js:187-199`, life only in −35…85 °C): frozen v2 temperatures;
  hothouse worlds drop out, HZ breathable worlds stay in.
- `BuildingSystem._isPlanetExtreme` (`src/systems/BuildingSystem.js:1926`, home planet only): homeworld in band → none.
- `SystemGenerator._applyCivHomeworld` home pick (`:820`, +30 for 0–50 °C, +15 for −23…77): v2 temperatures can pick a
  different rocky planet as the player's home (then clamped to 5–35 °C).
- Archetype secondary clauses (`BodyArchetypes.js:196,213,250,302,440` — jungle/desert > 35, volcanic > 150,
  scorched > 100, hazy_moon < 0) at world creation only.
- Display only: tooltips (`TooltipContent.js:191`), `Planet/Moon.getInfo`, `LabelHoverLogic.js:208`, colony info
  (`ColonyOverlay.js:1458`), observatory / body modal. Legacy texture choice `PlanetTextureUtils.resolveTextureType`
  (`:75,85,99`) and `TerrainTextures` (`:111`) read temperature — a v2 world can show a different legacy texture on the
  system map with `sharedSurface` OFF (counted, not changed). AI empires have no direct temperature term (Director /
  `AcceptanceEngine` grep = 0); they feel it through the colony-map terrain, growth and cost multipliers above.

Critical files touched (covered by this plan's sign-off): `src/config/GameConfig.js` (flag), `src/generators/SystemGenerator.js`.

#### 3.8.1 CS-PHYS-a — implementation and measurements (2026-11-19; not committed, owner gate pending)

**Files.** New: `src/utils/ClimateModel.js` (pure model + `LOOK_TEMP_CONTRADICTION`), keeper
`src/testing/smoke/colony_sphere_climate_smoke.mjs`, trace `src/testing/fixtures/traces/CSPHYS-world-off-baseline.json`
(recorded on a detached worktree at `66f924f`), probes `src/testing/headless/probe-cs-phys-climate.mjs` (5 seeds × 72
systems, legacy vs v2), `probe-cs-phys-balans.mjs` (BALANS wrapper), `probe-cs-phys-gate.mjs` (live engine, headless
Chrome). Changed: **`GameConfig.js`** (critical, flag), **`SystemGenerator.js`** (critical: `worldClimateModel`, climate in
`_makePlanet` / `_adjustOrbit` / `_makeMoon` + `_applyMoonTidalHeating` / planetoids / `makeHomeworldBreathable`),
`GalaxyGenerator.js` (stamp), `GameScene.js` (one decision + stamp + restore ×3 + `csClimate` alias), `GameCore.js`,
`StarSystemManager.js`, `LifeSystem.js` (no-op in v2 worlds), `SaveSystem.js` (key only when present),
`ColonySphereDebug.js` (`csClimate`, `colonySphereClimateRows`), `colony_sphere_seeds_smoke.mjs` (4 call-shape pins
widened to accept the sibling `climateModel` argument; core assertion unchanged).

**Live-probe finding fixed in this step.** A world saved before 4X starts has no persisted `galaxyData` (§G1 comment in
`GameScene.start`): on load a new galaxy is minted, and the climate stamp would be lost while the home bodies keep their
v2 records — LifeSystem then rewrote the frozen temperatures with the legacy formula (probe `save2`: 7 planets changed).
Fix: on that load path the regenerated galaxy's model comes from the restored home bodies (`galaxyClimateModel`).
**Finding 773 ⚪** (pre-existing since CS-3a-fix, no step): the same path re-stamps `seededSystems` as `false`
(`preMintedGalaxySeed` is null for any save), so a seeded world saved before 4X loads as unseeded.

**Analogues (code values):** Earth +15.0 °C (ΔT +21.3 K; legacy 13.8) · Venus dense 433.9 / thick 467.4 °C (legacy
100.7 / 75.7 — inversion gone) · Mars −53.0 °C, day/night −2 / −116 (legacy −41.9) · Titan ice dense −180.2 / thick
−174.6 °C (legacy −137.5 / −162.5); Titan-like icy moon with game `thin` −200.9 °C (real Titan is 1.5 bar ≈ `dense`) ·
Mercury mean 168 °C (unchanged), day +426.9 / night −178.2 °C · Moon −3.9 °C, +107.6 / −178.2 · Io +6.2 K tidal, Europa
+0.24 K.

**Rules and contradictions** (`probe-cs-phys-climate`, 5 seeds × 72 systems, same bodies in both models — verified):

| | legacy | climate v2 |
|---|---|---|
| R1 airless beyond hz.min, T > 0 | 101 / 15193 | 101 / 15193 (means unchanged by design) |
| R1b airless < 0.5·hz.min, T < 100 | 0 / 0 | 0 / 0 (no such orbit — CS-PHYS-b) |
| R2 thin/breathable in HZ ∉ (−20, 50) | 83 / 247 (33.6%) | 82 / 247 (33.2%) — breathable 16/75 → **0/75**, thin 67/172 → 82/172 |
| R3 dense/thick at a ≤ hz.max, T < 100 | 18 / 23 (78.3%) | 14 / 23 (60.9%) — the rest sit beyond S_col (class HZ ≠ flux HZ) |
| R4 distant moon with atmosphere ≥ 0 | 0 / 205 | 0 / 205 |
| look ↔ temperature contradictions | **71** / 3751 | **14** / 3751 (6 cryo_haze at S 0.3–0.35 boundary + 8 scorched judged on the mean); scorched judged on the day side → **6** |

R2 for `thin` gets worse on purpose: a Mars-class thin atmosphere gives +4 K (Mars anchor), so thin HZ worlds near the
outer edge are cold. Archetypes: **identical** in both models (0 / 6868 changed; secondary temperature clauses never flip).

**Temperature distribution** (°C min / median / max, n; full table in the probe JSON): rocky breathable HZ −37/1/54 →
**−1/8/44** (75); rocky dense/thick inner 114/117/125 → **465/471/489** (5); dense/thick HZ −25/11/84 → −36/81/396 (18);
dense/thick outer −86/−42/2 → −116/−63/68 (155); rocky thin HZ −62/−6/53 → −74/−16/44 (170); ice dense/thick frost
−181/−143/−84 → −234/−187/−114 (176); airless bodies, planetoids and gas giants unchanged; icy/rocky moons of gas giants
+1…+9 K median (tidal floor ≈ −192 °C far out; max +52 K at the coldest inner moons).

**Gameplay consumers — observed** (6868 non-gas planets + moons, 5 galaxies): temperature band changed on 110 bodies
(moderate → cold 98 — mostly thin worlds losing the flat +15; moderate → hot 9; cold/hot → moderate 3); open-air
climate gate (atmosphere and T ≥ 0) open on 175 → 193 bodies; LifeSystem window (−35…85 °C) 698 → 676; colony-terrain
set (`getBodyTerrains`) changed on 77 bodies; legacy texture (`resolveTextureType` thresholds, `sharedSurface` OFF)
changed on 116 (iron↔rocky 57, ocean↔rocky 35, → toxic/lava 8, desert/ocean 16); player home pick changed 0/5;
homeworlds (player + AI, 15) all 5–35 °C in both (e.g. 22/29/7 → 22/25/14).

**BALANS** (`probe-cs-phys-balans.mjs`, the AI-empire runner = player bot + 2 AI empires, real economy, galaxy
`HEADLESS_GALAXY_SEED`; 8 seeds × 45 gy and 8 seeds × 120 gy; POP runner 8 × 45 gy): **every summary metric identical
OFF vs ON** — AI colonies 56 / outposts 56 / systems 32, first outpost Σ97 gy, pop end 2175 (45 gy) / 4519 (120 gy),
jobs, buildings, pop-decline years, zero-stock years for food/water/energy, the player's colonies/pop/buildings/first
expansion; POP JSON byte-identical. Only the capped decision log moves: AI `expander:build:fail` 314 → 217, successful
decisions 2437 → 2459 (+0.9%). Reading: within this harness the climate change is economically inert — homes are
clamped into the same moderate band, outpost targets are mostly airless (means unchanged), the AI has no temperature term,
and the player bot stays on its home world. The fewer failed AI builds are consistent with the open-air gate opening on
warmer greenhouse worlds. Not covered by the harness: a player who settles thin / dense worlds (band and gate changes
above). No retune.

**Keeper** `colony_sphere_climate_smoke` K1–K10: **51 pins**. Fail-first on `git worktree --detach 66f924f` (three stub
copied, no junction): **14 green / 37 red**, no abort; the 14 green are the OFF trace (5 + flip), legacy behaviour
controls (LifeSystem recalculates, legacy save omits the key, flag ON in a legacy world adds nothing), determinism / same
bodies / peek (controls) and the outer-zone exclusion. **19 mutations, all killed**: thick < dense, no runaway, no CO₂
collapse, LifeSystem not frozen, worldClimateModel reads the flag, GalaxyGenerator always writes the key, SaveSystem
always writes `climate`, colour from the v2 temperature, homeworld ignores the record, tidal on ice giants, moon flux from
its own orbit, StarSystemManager without the world model, GameScene without the `savedData` gate, atmosphere rolled from
the v2 temperature, `_adjustOrbit` without v2, thermostat off, planetoid temperature changed, moon restore dropped,
pre-4X load without `galaxyClimateModel`. Sweep `run-all.mjs --quiet`: **434/434 OK, 0 FAIL** (31 advisory). `check-i18n`: PASS (no new UI strings; debug
output only).

**Live engine** (`probe-cs-phys-gate.mjs`, headless Chrome, the real title → new game flow): `title` climateModel 2,
stamp 2, v2 records on every body, csLifeTick changed 0 · `flip` climateModel 1, 0 records · `save` (legacy save,
flag ON on the title, Continue) climateModel 1, 0 records · `save2` (v2 world saved before 4X, flag OFF, Continue)
climateModel 2, records kept, csLifeTick changed 0. Only page exceptions: headless `AudioContext is closed` (known).

**Owner live gate — PASS (2026-11-19).** (1) Old save: csClimate climateModel 1, worldStamp null, withV2Record 0; after
`realisticClimate=true` still climateModel 1, same numbers. (2) New world with the flag set on the title screen: log
`klimat=v2`; climateModel 2, worldStamp 2, withV2Record 48/48, withDayNight 44, contradictions 0; csLifeTick changed 0
(home New Earth 12 °C stays); tidal heating visible on gas-giant moons (+20…+38 °C). (3) Same world after save → F5 →
Continue (flag false): climateModel 2, identical numbers. (4) OFF game, flag set after start: climateModel 1, withV2Record 0.

**Observation for CS-PHYS-b:** in the v2 world the homeworld sits at flux 0.192 (equilibrium −96.5 °C) and is playable
only through the 5–35 °C homeworld band — the orbit problem CS-PHYS-b fixes.

**Finding 773 ⚪ open** (no step): the `seededSystems` world stamp is lost for worlds saved before 4X mode (regenerated
galaxy re-stamped unseeded) — the same gap fixed here for climate via `galaxyClimateModel`.

**BALANS caveat:** the harness does not colonise thin / dense worlds. The temperature-band shift on ≈ 110 bodies (mostly
thin Mars-like worlds becoming "cold" → harder colonisation) is to be judged in play after CS-5.

---

### 3.9 CS-PHYS-b — orbits scaled by stellar luminosity + homeworlds in the HZ (D-CS-19 part 2 of 2; 2026-11-19; PARTIAL, not committed)

Owner decisions (2026-11-19): (1) fix Finding 773 in this step; (2) in new worlds every empire's homeworld lies on an
orbit inside its star's HZ; the 5–35 °C band stays only as a safety net. Session stopped at the context budget —
status and the remaining list are at the end of this section.

**World property (as D-CS-18 / climateModel).** `FEATURES.scaledOrbits` (default false) is read once at world creation
(`GameScene.start()` new-game branch, `GameCore.boot()`), passed to the home generator (`seedCtx.orbitModel`) and
stamped as `galaxyData.orbitModel = 2` (only when ON). `SystemGenerator.worldOrbitModel(galaxyData)` is the only reader
for foreign systems (generation, `peekCountsForStar`, observatory scan, `csPeek` / `csWorlds`). Every star of an
orbit-model-2 world carries its own stamp `star.orbitModel = 2` (saved only when present; restored in
`GameScene._restoreSystem` ×2), from which `Star` derives the HZ — no dependency on galaxy load order. Unstamped / old
saves: legacy forever. Independent of `realisticClimate` (the intended configuration is both ON).

**Orbit model (pure, `src/utils/OrbitModel.js`).** ℓ = √L [AU] (distance of 1 S⊕).

| Quantity | Legacy | Orbit model 2 |
|---|---|---|
| HZ | class table (M 0.10–0.35, K 0.40–1.05, G 0.85–1.70, F 1.45–2.95 AU) | 0.85·ℓ – 1.70·ℓ = S 1.384 – 0.346 S⊕ (G table = Sun calibration; F table agrees within 1.5%; the K/M tables were stretched inward to S 2.5 / 4.0 to survive the fixed minimum orbit) |
| Frost line | 2.2 · hz.max | same ratio → 3.74·ℓ |
| Minimum planet orbit | max(0.35, 0.15 + 0.4·M★) AU | max(0.03, 0.40·ℓ) AU (S 6.25 S⊕, Mercury 6.7) |
| Titius-Bode scale | class hzMid / 1.075 | the star's own hzMid / 1.075 (same perturbation draw per slot) |
| Separation | `MIN_ORBIT_HALF_SEP` (AU) | × κ, κ = clamp(ℓ, 0.2, 1), **and** a collision floor: a·(1−e_out) ≥ a_in·(1+e_in) + 0.65·Σ visual radii [px]/110 + 0.01 AU (`collisionMinOrbitAU` — mirror of `PhysicsSystem.checkCollisions`, which merges planets on a px threshold in the active system) |
| Planetoids / belt / comets / disk | fixed AU ranges | ranges × κ; planetoid margins = max(κ·legacy, 1.3·(r_planet + 5 px)/110 + a·e) (mirror of `checkSmallBodyCollisions`) |
| HZ guarantee | rocky in HZ before separation | same, plus after separation `_ensureRockyInHZ`: home band first (S 1.10–1.384, `homeworldBandAU`), then the whole HZ; insert at the widest clear point, else move the nearest rocky there |
| Homeworld | player: score (+50 HZ, temp, atmosphere); AI: first rocky | both: `pickHabitableHomeworld` — rocky inside the HZ, flux nearest the home-band centre 1.234 S⊕ (ln), tie → smaller a; none → legacy rule. Same pure rule in `EmpireColonyBootstrap._pickHomePlanet(planets, star)` and the `LifeSystem` mirror `pickHomeworldBody(planets, star)` |

Home band: a breathable rocky world reaches 5 °C at S ≈ 1.09 (ClimateModel, albedo 0.3; 0.15 is warmer) and ≈ 1.06 in
the legacy +20 °C model, so S 1.10–1.384 is inside the 5–35 °C band in both climate models.

**RNG stream.** The TB loop keeps one perturbation draw per slot, so the slot draws are a deterministic transform. The
stream length still changes, and cannot stay identical: (1) a lower minimum orbit turns previously skipped slots into
planets (`_makePlanet` draws: e, type, mass, atmosphere, composition, M, inclination); (2) orbit → type/mass → moon
count (`_moonCount`, `_makeMoon` draws) and atmosphere branches; (3) the HZ / giant guarantees fire in different systems;
(4) the planetoid rejection loop's attempt count depends on the (scaled) forbidden zones. Kept: same seed → same world,
and `peekCountsForStar` takes the same `orbitModel` → **peek == generated (0 mismatches in 5 × 72 × 2)**.

**Consumers of orbit radius / in-system distance** (survey 2026-11-19; [P] scales with distance, [F] fixed threshold; the
"NOT handled" rows are handled by CS-PHYS-b2 — per-consumer status with file:line in §3.9.1).
Effect of compact M systems (planets 0.12–5.4 AU, rocky gaps ≈ 0.12–0.18 AU because of the collision floor):

| Area | file:line | Effect |
|---|---|---|
| Collisions | `PhysicsSystem.js:113-129` px threshold 0.65·Σr (≈0.07–0.12 AU), active system | **[F] critical** — would merge neighbouring planets; **handled in the generator** (collision floor; 0 violations measured) |
| Star mesh | `ThreeRenderer.js:136,2307-2309,2356` core r×3 ≈ 2.37 WU = 0.215 AU for M; corona half-size 0.47 AU | **[F] critical visual** — planets at 0.12–0.2 AU sit inside the opaque core; **NOT handled** |
| Star picking | `ThreeRenderer.js:2393` click sphere r×2.5 ≈ 0.18 AU, first hit wins (`:4601,:4616`) | **[F]** planets inside 0.18 AU unclickable; NOT handled |
| Camera | `ThreeCameraController.js:28-29,306-311` star zone 1.3R, zoom floor 2.2R; `:252-254` fit ≥ 70 WU; `ThreeRenderer.js:5533` extent incl. planetoids | **[F]** cannot zoom onto inner M planets; framing floor; NOT handled |
| Sun exclusion | `MovementOrderSystem.js:32,992` 0.3 AU → `unreachable_target`; `RetreatTarget.js:51,90,217`; `VesselManager.js:65-67,3192-3215` (0.3 + 0.1 AU, SHORT_HOP 0.5 AU straight line) | **[F] critical gameplay** — planets < 0.3 AU (M homeworlds 0.14–0.25 AU) cannot be targeted; NOT handled |
| Arrival / snap | `RendezvousData.js:18` CAPTURE_AU 0.5; `VesselManager.js:100` SNAP_TO_BODY_AU 0.5; `MovementOrderSystem.js:45` THREAT_RADIUS 0.15 | **[F]** "fly to" arrives instantly across most of an M inner system; free-space clicks snap |
| Combat / detection | `ProximitySystem.js:48-55` (0.5 / 0.15 AU); weapons 0.05–0.30 AU (`GameConfig.js:605-610`); `SENSOR_LOCK_AU` 0.3; `SystemPoolService.js:31` blockade 0.5 AU; `BattleStageLogic.js:46` cluster 0.30 | **[F]** ships at neighbouring planets engage / blockade / merge battles |
| Sensors | `sensorRangeAU` 1.0–2.5, `DetectionRange.js` 0.5, observatory levels 1/3/6/15 AU | **[F]** whole M system always visible (observatory levels pointless there) |
| Travel / fuel | `HullsData` speedAU 0.7–1.4, fuelPerAU; `VesselManager.js:3349`, `MovementOrderSystem.js:1652` | [P] in-system trips ~4–10× shorter, fuel irrelevant in-system; `MissionSystem.js:39-40` / `ExpeditionSystem.js:247,255` floors (0.008–0.1 yr) start to bite |
| Warp / AI | `VesselManager.js:3137-3145` warp arrival 30 AU out; `DirectorDoctrine.js:41-48` patrol ring ≥ 6 AU; `DirectorFirstContact.js:37` flyby 23.6 AU | **[F]** long empty legs in compact systems, AI patrols far outside every planet |
| Time | `TimeSystem.js:103-110` no substeps; M periods 12–30 days; `CollisionForecast.js:22` step 0.1 yr | [P] analytic Kepler is stable, but strobing at high warp; collision forecast aliasing |
| Moons | `SystemGenerator._makeMoon` visual 3D floors | 0 moons beyond half the neighbour gap (measured); physically all game moons are outside Hill spheres already (legacy too: planets are drawn ×200) |
| Tidal lock | `BodyArchetypes.js:81` 0.85·∛M AU | M 19.4% → 34.7% locked (expected); D-CS-23 kept |
| Labels / readouts | `HudLabelLayer.js:699-718` star obstacle; several `toFixed(1)` AU readouts | inner labels pushed; "0.1 AU" readouts |

**Measurements** (`probe-cs-phys-orbits.mjs`, 5 seeds × 72 systems + home, realisticClimate ON in both):

| Class | planets legacy → scaled | in HZ | systems with a rocky HZ planet | locked | orbit range AU | median extent AU (incl. planetoids) |
|---|---|---|---|---|---|---|
| F (43) | 396 → 395 | 116 → 115 | 43 → 43 | 0 → 0% | 1.27–34.9 → 1.14–31.5 | 24.8 → 24.9 |
| G (85) | 795 → 795 | 122 → 138 | 85 → 85 | 6.2 → 5.9% | 0.71–23.9 → 0.58–26.1 | 24.6 → 23.4 |
| K (99) | 792 → 927 | 99 → 131 | 99 → 99 | 11.0 → 12.7% | 0.55–14.0 → 0.36–16.5 | 24.6 → 15.6 |
| M (133) | 684 → 1235 | **0 → 176** | **0 → 131** | 19.4 → 34.7% | 0.55–12.5 → 0.12–5.4 | 24.6 → 5.1 |

M archetypes legacy → scaled: terran 2 → 37, jungle 0 → 29, desert 0 → 66, barren 0 → 48, volcanic 0 → 12,
tidally_locked 92 → 302, gas_cold 244 → 106, gas_temperate 17 → 173, ice 202 → 287, cryo_haze 127 → 175. G/F nearly
unchanged (G terran 32 → 22, jungle 6 → 11). Collision-floor violations 0, moons beyond half gap 0, peek mismatches 0.

**Homeworlds** (GameCore.boot, 20 worlds × 3 empires, both flags ON vs climate only): inside the HZ **60/60** (legacy
33/60; legacy M homes 0/20 → 20/20); home flux 0.359–1.380, median 1.122 S⊕ (legacy 0.045–2.81). **Safety band still
acts 22/60 (cold), 0 hot** (legacy 26 cold + 11 hot) — target ≈ 0 NOT met: `_ensureRockyInBand` often cannot fit a
planet into the narrow home band (G/K: κ half-separations 0.5 AU vs a band 0.1·ℓ wide), so the pick falls back to an
outer-HZ rocky world (−1 … −40 °C before the clamp).

**Finding 773 — fixed (code, keeper pending).** `SaveSystem._serializePreCivWorld()` writes `preCivWorld = { seed,
seededSystems?, climateModel?, orbitModel? }` only when `civ4x` is not saved (pre-4X) and a galaxy exists; optional key,
no version bump (old saves lack it → old behaviour). `GameScene.start()` on that load path regenerates the galaxy from
`GalaxyGenerator.preCivWorldOf(savedData)` — same seed, `applyWorldStamps` re-stamps `seededSystems` / `orbitModel`
(also derived from the restored home star's `orbitModel`). Side effect (positive): a pre-4X save now gets the same
galaxy on every load (closes the "fresh galaxy per load" limitation noted in GameScene for new saves).

**Files.** New: `src/utils/OrbitModel.js`, `src/testing/headless/probe-cs-phys-orbits.mjs`. Changed: **`GameConfig.js`**
(critical — flag), **`SystemGenerator.js`** (critical — `worldOrbitModel`, min orbit, κ separation + collision floor,
`_ensureRockyInHZ` / `_ensureRockyInBand`, small-body ranges, homeworld pick, band counter `homeworldBandStats`,
`generateForStar` / `peekCountsForStar` orbitModel argument), `GalaxyGenerator.js` (stamp, `applyWorldStamps`,
`preCivWorldOf`), `Star.js` (stamp → HZ), `SaveSystem.js` (star stamp, `preCivWorld`), `GameScene.js` (decision,
stamp, 773 path, restore ×2, log, `csOrbits` alias), `GameCore.js`, `StarSystemManager.js`, `ObservatorySystem.js`,
`EmpireColonyBootstrap.js`, `HomeworldClimate.js`, `LifeSystem.js`, `ColonySphereDebug.js` (`csOrbits`, peek with
the world orbit model). No `PhysicsSystem` / renderer change.

**Status / left (next session).**
1. Homeworld safety band ≈ 0: make the home-band guarantee succeed (e.g. move the HZ rocky planet into the band with a
   local re-separation, or place the home slot before separation), then re-measure.
2. Owner decision needed before the gate — **critical consumers not handled**: star core / corona / click sphere
   swallowing planets < 0.2 AU, camera star zone, sun exclusion 0.3 AU (M homeworlds unreachable), CAPTURE / SNAP 0.5 AU,
   ProximitySystem / blockade / battle-cluster ranges. Recommendation: a per-star distance scale (ℓ-based, legacy = 1)
   for the star mesh/picking/camera zone and for the sun exclusion; the fleet ranges as a separate decision (they are
   gameplay balance).
3. Keeper `colony_sphere_orbits_smoke` (fail-first on a detached worktree at b0f3106, mutations): OFF trace bit-identical
   (reuse `CSPHYS-world-off-baseline.json` + climate-v2 baseline), world stamp (flag after start, old save, pre-4X save),
   determinism + peek == generated, homes inside HZ, M HZ share, min-orbit floor / collision floor / moons, save round
   trip, Finding 773. Already done: 7 call-shape pins widened to accept the optional orbit argument (core assertions
   unchanged) — `colony_sphere_seeds_smoke` ×4, `colony_sphere_climate_smoke` ×3. Sweep with flag OFF: **434/434 OK,
   0 FAIL** (31 advisory), incl. the CS-PHYS-a OFF trace K1; `check-i18n` PASS.
4. BALANS a/b/c (both OFF / climate only / both ON), consumer effects in-game (travel time per class, radar coverage).
5. Gate checklist + live-engine probe.

#### 3.9.1 CS-PHYS-b2 — homeworld orbit +15 °C, per-system distance scale, keepers (2026-11-19; not committed, owner gate pending)

**D-CS-24 (owner, 2026-11-19) — option (b): ONE distance scale per system for ALL in-system spatial thresholds.**
k = κ = clamp(√L, 0.2, 1) — the same factor the generator uses for orbit separations (`OrbitModel.compactionOf`);
k = 1 **exactly** for every star without the `orbitModel: 2` stamp (legacy worlds, old saves → bit-identical: `x · 1`
is exact in IEEE). Ship speeds, fuel use and galaxy-level (warp) distances are NOT scaled — compact systems are faster
to cross, an intended strategic trait of M dwarfs.

**1. Homeworld orbit (+15 °C).** `OrbitModel.homeworldFinalTempC({L, a, e, albedo, climateModel})` mirrors
`makeHomeworldBreathable` before its clamp (climate v2: `bodyClimate` with a breathable atmosphere; legacy: T_eq + 20 °C);
`homeworldOrbitAU` bisects a for +15 °C (60 iterations, clamped to the HZ). Results: legacy climate a = 0.899·ℓ
(S 1.24), climate v2 a = 0.858·ℓ (S 1.36) for albedo 0.3; the rocky albedo 0.15 used in game gives S ≈ 1.00 — all inside
the HZ (0.85–1.70·ℓ). `SystemGenerator._placeHomeworldSlot` (replaces `_ensureRockyInHZ` / `_ensureRockyInBand` and
`homeworldBandAU`) runs in EVERY system of an orbit-model-2 world (any system can become an AI home; peek must match):
candidate = the rocky planet inside the HZ nearest the target (ln a), else a new rocky (`_makePlanet` — the only RNG
draws of the step); it is moved to the exact orbit with its own e / albedo; inner neighbours are pulled inwards to keep
κ separation + collision floor (`collisionMaxInnerOrbitAU`, the inverse of `collisionMinOrbitAU`), removed below the
minimum orbit; outer neighbours pushed out by `_enforceMinSeparation`. `pickHabitableHomeworld` now picks the rocky
HZ planet whose final temperature is nearest +15 °C (same pure rule for the player, the AI bootstrap and the LifeSystem
guard). `peekCountsForStar` takes the world climate model (4th argument; ObservatorySystem, `csPeek`, `csWorlds`, probe
pass `worldClimateModel`) — the home-slot orbit depends on it.
**Result:** 5–35 °C safety band acts **0 times** — probe 20 worlds × 3 empires (60/60 in HZ, 0 cold, 0 hot; was 22/60
cold) and keeper O4 5 seeds × all empires × both climate models (15 + 15 empires, all in HZ, all at +15 ± 1 °C, band
checked 15× per model, active 0×). M systems: 133/133 with a rocky HZ planet (was 131/133), terran 37 → 51, jungle 29 → 6.

**2. Distance-scale helper — `src/utils/SystemScale.js`.** `systemScaleOfStar(star)`, `systemScaleOf(systemId)` (star via
`StarSystemManager`, else `EntityManager.getStarOfSystem`; unknown system → 1), `activeSystemScale()`,
`systemScaleOfEntity(e)`; `Star.systemScale` getter; `window.KOSMOS.systemScale` (scene code that keepers compile
with a fixed scope reads it through `K`, renderer through `this._star.systemScale`). Consumers scaled:

| Area | file:line (after CS-PHYS-b2) | Threshold × k |
|---|---|---|
| Star mesh / core / corona / click sphere / silhouette mask / camera star zone + zoom floor / HUD label obstacle | `ThreeRenderer.js:2312` (`r` × `star.systemScale`; everything derived from `r`, incl. `setStarCoreRadius`) | yes |
| Camera system-framing floor 70 WU | `ThreeRenderer.js:5554` → `ThreeCameraController.frameSystem(maxAU, scale)` | yes |
| Battle-cluster radius (scene, banners, strip) | `ThreeRenderer.js:9126`, `GameScene.js:4609,4715`, `CombatStrip.js` (`clusterRadiusPx(auToPx, scale)`) | yes |
| Sun exclusion for orders 0.3 AU | `MovementOrderSystem.js:996`; route avoidance + 0.1 AU margin + SHORT_HOP 0.5 AU `VesselManager.js:3194-3211`; shelters / escape `RetreatTarget.js:91,218` | yes |
| Arrival / pursuit / patrol radius 0.15 AU, escort 0.1 AU | `MovementOrderSystem.js:50` (`threatRadiusPx`) used at `:1157,1645,1682,1761,1943`; escort `:862` | yes |
| Snap-to-body 0.5 AU, rendezvous capture 0.5 AU | `VesselManager.js:4111`, `:4014` | yes |
| Weapon ranges (engage, proximity, DSCS rounds, deadlock) | `MovementOrderSystem.js:2421`, `ProximitySystem.js:459`, `DeepSpaceCombatSystem.js:1561` (+ encounter system id at the call sites) | yes |
| Combat enter base 0.15 AU, team-up buffer, disengage 0.5 AU | `ProximitySystem.js:260`, `DeepSpaceCombatSystem.js:262,983,1304`, `VesselCombatSystem.js:238`, retreat bubble `RetreatTarget.js:127,202` | yes |
| Detection 0.5 AU / sensorRangeAU (= HUD radar rings), sensor-lock 0.3 AU | `DetectionRange.js:23` (one function for ProximitySystem and `HudRadarLogic`), `ProximitySystem.js:350` | yes |
| Blockade 0.5 AU | `SystemPoolService.js:365` | yes |
| Observatory detection levels 1/3/6/15 AU | `ObservatorySystem.js:180` | yes |
| Intel contact 0.3 AU | `IntelSystem.js:413` | yes |
| AI patrol ring clamps 6–30 AU (ring itself already ∝ max orbit) | `DirectorDoctrine.js:379` | yes |
| AI first-contact flyby radius 2600 px | `DirectorFirstContact.js:107` | yes |
| Warp arrival point 30 AU out (in-system position, not a galaxy distance) | `VesselManager.js:3142` | yes |
| PhysicsSystem planet merge (px on visual radii) | unchanged — handled in the generator (collision floor, 0 violations) | n/a |
| Ship speeds, fuel/AU, warp (ly) | unchanged (D-CS-24) | no |
| AccretionSystem accretion zone 0.12 AU, cluster bin 0.15 AU (Generator scenario only) | `AccretionSystem.js:58,97` (CS-PHYS-b3, §3.9.2) | yes |
| HUD sensor-lock fallback (no ProximitySystem) | `HudLabelLayer.js:649` (CS-PHYS-b3) | yes |
| Star mesh drawn radius | CS-PHYS-b3 / Finding 774: drawn scale ℓ without the 0.2 floor, clipped to 1.5× clearance (§3.9.2) — visual only | drawn scale |
| Route body-avoidance margin 0.15 AU (+0.05 AU waypoint offset) | `VesselManager.js:3221` — tied to the drawn planet radius (px, not scaled); measured detour M p90 1.021 → 1.061 (§3.9.2) | no (decision) |

**Keeper `colony_sphere_orbits_smoke.mjs` (61 pins).** O1 OFF trace bit-identical to the 66f924f baseline
(`CSPHYS-world-off-baseline.json`, 5 digests) with the flag OFF and with the flag flipped ON after world creation,
k = 1 for all 13 stars of a legacy world, unknown system → 1; O2 world stamp (old star / old galaxy → 1, stamped star
k = √L, Finding 773: `preCivWorld` carries seed + 3 stamps and regenerates an identical galaxy, absent with civ4x,
GameScene pins); O3 determinism + peek == generated in 213 systems × 2 climate models; O4 homes (above); O5 geometry over
5 seeds × 2 climate models (> 5000 planets): minimum orbit, collision floor (independent mirror of PhysicsSystem), κ
separation, moons inside half the neighbour gap (the game's operational Hill sphere — planets are drawn ×200, so the
physical Hill sphere does not contain game moons even in legacy worlds); O6 consumers in a compact M system (k = 0.2)
vs a legacy control (k = 1): M planets outside the star core / click sphere (1195 planets, 0 inside, worst periapsis
1.05× the core radius), order to a body at 0.17 AU passes the sun gate (witness getter right after the gate; control
rejected), snap 0.3 AU → free space (control snaps), 0.05 AU → the intended body, missile range 0.06 AU, detection
0.1 AU, sensor-lock × k, blockade at 0.3 AU off / 0.05 AU on (control on at 0.3), source pins for the live paths.
**Fail-first** (detached worktree at b0f3106, final keeper): 26 PASS / 35 FAIL (green = OFF-trace, determinism, legacy
geometry and legacy controls). **Mutations** (12, each red): SystemScale always 1 (9 red), sun gate unscaled, home slot
off, target 30 °C, snap unscaled, peek without climate model, no inward pull, renderStar unscaled, blockade unscaled,
weapon range unscaled, detection unscaled, 773 without orbitModel. Widened call-shape pins (core assertions unchanged):
`click_focus_rule` T6e (second `frameSystem` argument), `zoom_floor` F8e (`× (star.systemScale ?? 1)`),
`colony_sphere_seeds` (ObservatorySystem peek with the climate model). **Sweep 435/435 OK, 0 FAIL (31 advisory);
`check-i18n` PASS.**

**Live engine** (`probe-cs-phys-b2-live.mjs`, headless Chrome, real title → new game with both flags, Enter through the
civ intro, retries until the home star is M): M star L 0.040, k 0.2, home a 0.199 AU at +15 °C, core 0.72 WU; 5 innermost
planets (0.086–0.734 AU) clicked at the system framing AND zoomed — 10/10 hit the intended planet; orders of a player
ship to bodies at 0.086 and 0.199 AU (inside the legacy 0.3 AU exclusion) accepted; colony overlay opens and closes;
0 exceptions except 2× `AudioContext is closed` after same-tab re-navigation — identical on b0f3106 (control run: same 2
errors; different result otherwise: no stamp, home 0.55 AU, core 3.6 WU), tagged as harness noise (Finding 775).

**Findings.** **774 ⚪** — thin star-core margin in the dimmest M systems: orbits scale with ℓ but k is floored at 0.2,
so for ℓ < 0.2 the innermost periapsis approaches the scaled core (worst 1.05× in 5 seeds; L ≥ 0.026 generated). Options
for CS-PHYS-b3: floor the minimum orbit at ≥ 1.3× the scaled core, or scale the star mesh by ℓ below the floor.
**775 ⚪** — 2× `InvalidStateError: AudioContext is closed` on same-tab re-navigation (pre-existing, base too; harness
artefact, no owner impact expected).

**Files.** New: `src/utils/SystemScale.js`, `src/testing/smoke/colony_sphere_orbits_smoke.mjs`,
`src/testing/headless/probe-cs-phys-b2-live.mjs`, `src/testing/headless/probe-cs-phys-b2-star.mjs`. Changed
(on top of §3.9): `OrbitModel.js`, **`SystemGenerator.js`** (critical — home slot, peek climate argument), `Star.js`,
`ThreeRenderer.js`, `ThreeCameraController.js`, `GameScene.js`, `MovementOrderSystem.js`, `VesselManager.js`,
`RetreatTarget.js`, `ProximitySystem.js`, `DeepSpaceCombatSystem.js`, `VesselCombatSystem.js`, `SystemPoolService.js`,
`DetectionRange.js`, `ObservatorySystem.js`, `IntelSystem.js`, `DirectorDoctrine.js`, `DirectorFirstContact.js`,
`BattleClusterLogic.js`, `CombatStrip.js`, `ColonySphereDebug.js`, `probe-cs-phys-orbits.mjs`, 3 widened keepers.
Critical files touched in this arc step: `GameConfig.js` (flag, from §3.9) and `SystemGenerator.js`; `PhysicsSystem.js`,
`EventBus.js`, `EntityManager.js`, `HexGrid.js`, `SaveMigration.js` untouched (no save-version bump).

**Left for CS-PHYS-b3.** (1) BALANS a/b/c (both OFF / realisticClimate only / both ON) on the CS-PHYS-a seeds — not
started in this session (context budget). (2) In-game consumer effects: travel time per class, radar coverage, AI
behaviour in compact systems (patrol, strikes), fleet-order feel. (3) Finding 774 decision. (4) Remaining fixed
in-system numbers not on the table: AccretionSystem (disk phase), `toFixed(1)` AU readouts ("0.1 AU"), label LOD
distances — survey + owner look. (5) Gate checklist (1600×1041) + owner gate; then the `feat` / `docs` commit pair.

#### 3.9.2 CS-PHYS-b3 — BALANS a/b/c, compact-system effects, Finding 774, constant sweep (2026-11-19; not committed, owner gate pending)

**1. BALANS a/b/c** (`probe-cs-phys-balans.mjs`, now `--orbits=on|off` + `--tag=X`; the tag redirects the runner's
`<prefix>-telemetry-REAL.json` / `-report-REAL.html` to `…REAL.<tag>.json/html`, so the REAL files are no longer
overwritten — md5 of the REAL files unchanged before/after, backup in the session scratchpad). Same panel as CS-PHYS-a:
AI runner 8 seeds × 45 gy and × 120 gy, POP runner 8 × 45 gy, galaxy `HEADLESS_GALAXY_SEED`. (a) both OFF, (b)
realisticClimate, (c) realisticClimate + scaledOrbits. 0 crashes in all 9 runs.

| AI runner, Σ over 8 seeds × 2 AI empires | a 45 gy | b 45 gy | c 45 gy | a 120 | b 120 | c 120 |
|---|---|---|---|---|---|---|
| AI colonies / outposts / systems at end | 56 / 56 / 32 | = a | **93 / 80 / 48** | 56 / 56 / 32 | = a | **93 / 80 / 48** |
| … colonies outside the home system | 0 | 0 | 13 | 0 | 0 | 13 |
| Σ first outpost gy · Σ first-3-colonies gy (expansionist never reaches 3 in a/b) | 97 · 103 | = a | 95 · 42 | = 45 gy | = a | = 45 gy |
| AI pop end | 2175 | 2175 | 2097 (−3.6%) | 4519 | 4519 | 4491 (−0.6%) |
| AI buildings / jobs / unfilled | 690 / 1975 / 7 | = a | 695 / 1965 / 9 | 884 / 1988 / 8 | = a | 879 / 2032 / 1 |
| pop-decline years | 14 | 14 | 26 | 19 | 19 | 32 |
| zero-stock years food / water / energy | 18 / 128 / 356 | = a | 0 / 156 / 428 | 156 / 326 / 430 | = a | 22 / 258 / 428 |
| player colonies / pop / buildings / credits | 8 / 500 / 303 / 101.8k | = a | 8 / 536 / 324 / 108.3k | 8 / 500 / 314 / 282.8k | = a | 8 / 536 / 342 / 313.6k |
| decisions effective · AI build fails (capped log) | 2437 · 1492 | 2459 · 1397 | 2128 · 1142 | same as 45 gy (log cap) | | |
| strategy colony / outpost actions (all succeeded) | 38 / 56 | = a | 62 / 80 | = | = | = |

POP runner: a ≡ b byte-identical JSON; c: player pop Σ 500 → 536 (+7.2%), unemployed 176 → 190, surplus years WASTED
44 → 17 (seed 7 had a 31-pop home in b → 67 in c). Per-seed player pop takes only the values 31/43/67/91 — each value is
one home world; scaledOrbits changes which home a seed gets (home system regenerated), not the economy.

**Reading.** (1) realisticClimate alone stays economically inert (= CS-PHYS-a). (2) The whole c-delta comes from ONE
outlier: the expansionist AI's home `sys_040` is a dim star with **4 planets in the legacy model → 9 in the scaled
model**; in a/b that empire sits on 1 colony + 2 outposts in 1 system for the entire 120 gy (targets saturated — the
harness hid a stuck AI empire), in c it reaches 4–7 colonies / 5 outposts / 3 systems, and 3 of its colonies are in
other systems. The industrialist (`sys_061`) is unchanged (6/5/3 in every seed). (3) More colonies spread the same
population: AI pop −3.6% at 45 gy, −0.6% at 120 gy; more pop-decline years (new small colonies) and more zero-water
years at 45 gy, but far fewer food shortages (18 → 0, 156 → 22). (4) The player bot stays on its home world; its +7%
pop / +7–11% credits is the home world itself (now on the +15 °C orbit instead of a band-clamped one). (5) Fewer AI
build failures (1397 → 1142) and fewer effective decisions (2459 → 2128 — the capped log fills with upgrades of more
colonies). Nothing points at a broken mechanic; no retune (as instructed). Outlier to keep in mind for BALANS 2: a
legacy dim-star AI home starves the expansionist archetype.

**2. In-game effects of compact systems** (`probe-cs-phys-b3-compact.mjs`, 5 seeds × 73 systems, climate v2 in both,
medians; trip = home world → every other planet, RMS distance over random phases √(a₁² + a₂²); hull_medium 1.0 AU/yr,
0.5 fuel/AU — the probe also prints hull_small / hull_large):

| Class | k | extent AU | innermost a AU | trip AU | trip days (hull_medium) | fuel | radar cover: player medium / AI vessel / colony L0 / L2 | patrol ring / extent | warp arrival / extent | route / straight p90 |
|---|---|---|---|---|---|---|---|---|---|---|
| F | 1 → 1 | 19.5 → 20.3 | 1.46 → 1.40 | 5.41 → 5.28 | 1974 → 1929 | 2.70 → 2.64 | 0.6 / 0.1 / 0.3 / 9.5 → 0.5 / 0.1 / 0.2 / 8.7 % | 0.86 → 0.86 | 1.54 → 1.48 | 1.005 → 1.005 |
| G | 1 → 0.98 | 12.9 → 12.0 | 0.83 → 0.65 | 3.57 → 3.49 | 1306 → 1276 | 1.79 → 1.75 | 1.4 / 0.2 / 0.6 / 21.8 → 1.3 / 0.1 / 0.6 / 20.7 % | 0.85 → 0.85 | 2.33 → 2.28 | 1.006 → 1.008 |
| K | 1 → 0.64 | 9.4 → 9.0 | 0.63 → 0.35 | 3.37 → 2.38 | 1231 → 870 | 1.69 → 1.19 | 2.6 / 0.3 / 1.1 / 41.0 → 1.2 / 0.1 / 0.5 / 19.0 % | 0.86 → 0.86 | 3.20 → 2.18 | 1.019 → 1.020 |
| M | 1 → 0.21 | 7.1 → 2.7 | 0.55 → 0.18 | 3.94 → 1.05 | 1439 → 384 | 1.97 → 0.53 | 4.5 / 0.5 / 2.0 / 71.5 → 1.4 / 0.2 / 0.6 / 22.8 % | 0.88 → 0.85 | 4.23 → 2.39 | 1.021 → 1.061 |

Reading: M in-system trips are ~3.7× shorter and cheaper (intended, D-CS-24); K ~1.4×; F/G unchanged. **Radar coverage
falls** in compact systems because thresholds scale with k (0.21) while the M extent shrinks only to 0.38× (the legacy
M class table was already compact) — observatory levels become meaningful in M systems again (L2 72% → 23% of the disk;
L3 still 100%). No trip falls under the MissionSystem floor (0.008 yr). AI patrol ring stays at 0.85–0.88 of the extent
and now sits at the outer planets in 133/133 M systems (legacy 112/133 — the 6 AU floor pushed it beyond them).
First-contact flyby and warp arrival stay outside the outermost planet (1.9× / 2.4× extent in M). Route detours from
the unscaled body margin stay small (waypoints per trip 0.45 → 0.64 in M).
**Not measured:** AI patrol / strike EXECUTION in compact systems — headless `GameCore` mounts no MovementOrderSystem /
ProximitySystem / DSCS / FleetSystem (CLAUDE.md trap), so "stuck / oscillating / never engaging" is not observable
here; the geometry above shows no ring or radius outside its system. One analytic risk found → **Finding 776 ⚪**:
the combat-entry threshold is sampled per frame with no substeps; at 1 r/s a head-on pass of two hull_small ships
closes 0.047 AU per frame at 60 fps and 0.093 AU at 30 fps, while the entry diameter in a k = 0.2 system is
2 × 0.15 × 0.2 = 0.06 AU — at ≤ 30 fps two fast ships can pass through each other without an engage sample (legacy
0.30 AU: no risk; cruisers 0.047 AU at 30 fps: OK). Not observed in play; candidate fix (later, mechanics arc):
segment-distance test over the frame step in ProximitySystem, or substeps at 1 r/s.

**3. Finding 774 — fixed (visual only, no generation change).** Measured before the change (5 seeds, scaled worlds):
innermost periapsis / drawn core — M worst 1.05×, and **pure ℓ scaling would not reach 1.5×**: below 1.5× in 37/133 M,
63/99 K, 23/85 G systems (minimum orbit 0.40·ℓ AU vs core radius 0.21–0.38·ℓ AU, minus eccentricity). Implementation:
`SystemScale.starDrawScale(star, { baseCoreAU, innermostPeriapsisAU })` = 1 exactly without the `orbitModel: 2` stamp;
stamped: min(1, ℓ) (no 0.2 floor, ceiling 1) clipped to periapsis / (1.5 × core radius at scale 1)
(`STAR_CORE_CLEARANCE = 1.5`). `ThreeRenderer.renderStar(star, planets)` (`initSystem` passes the system's planets):
`r = baseR × _starDrawScale` — core, corona, click sphere, silhouette mask and the camera star zone / zoom floor
(`setStarCoreRadius(_sunCoreRadius)`) follow `r`. Screen floor `_applyStarScreenFloor` (render loop, only when
`_starDrawScale < 1`): core + click sphere get a multiplier ≥ 1 so the core radius stays ≥ `STAR_MIN_CORE_PX = 4` CSS px
(far zoom; near zoom multiplier 1, so the camera zone matches the drawing); the corona is not scaled (its shader works in
world units and already reaches ~10 px). Gameplay k (floor 0.2) unchanged. Result: 3312 planets in 360 stamped systems,
0 below 1.5× (worst exactly 1.500×); clipping active in 121 systems, drawn scale < k in 172.

**4. Constant sweep.** Scaled (D-CS-24 spatial thresholds): AccretionSystem accretion zone 0.12 AU and cluster bin
0.15 AU × `systemScaleOfStar(this.star)` (Generator scenario only; unstamped stars → 1); HUD label sensor-lock fallback
× k (`HudLabelLayer.js:649`, used only without ProximitySystem). "0.1 AU" readouts: `SystemScale.auReadoutDecimals`
(< 0.25 AU → 2 decimals, else 1) in the HUD label detect/lock readouts, the radar ring readout
(`HudRadarLogic.rangeReadoutText`) and the body-list orbit in `FleetTabPanel` — legacy values are all ≥ 0.3 AU (minimum
orbit 0.35, lock ≥ 0.3, detection ≥ 0.5), so legacy text is unchanged. Left unscaled on purpose: the route
body-avoidance margin 0.15 AU (+0.05 AU) — it protects the DRAWN planet disc (visual radius in px, not scaled; scaling
it would route ships through planet discs), measured detours small (above); ship speeds, fuel, warp (D-CS-24); other
`toFixed(1)` AU readouts are distances (ship ↔ body, travel) that are small in legacy too — not a scale issue. Label
LOD distances: none in AU found by the grep (`HudLabelLayer` works in screen px). Consumer table §3.9.1 updated.
`csOrbits()` reports `systemScale` (k) and `starDrawScale` (Finding 774) for the gate.

**Keepers.** `colony_sphere_orbits_smoke` 61 → **84 pins**: O6 updated to the drawn scale (M planets outside core /
click sphere, worst 1.500×); **O7** Finding 774 (legacy 1 exactly, ℓ below the floor, k still 0.2, ceiling, clipping
formula, periapsis helper, 3312 planets ≥ 1.5×, clipping witness, legacy world 13 stars = 1, screen floor 4 px / near
1 / degenerate 1, live-path pins: loop gate, floor scales core + click sphere not corona, camera zone from
`_sunCoreRadius`); **O8** sweep (accretion executed: 0.06 AU absorbed in legacy, not at k = 0.2; source pins
Accretion / HudLabelLayer / FleetTabPanel; readout decimals; radar readout 0.06 → "0.06 AU", legacy 1.5 / 0.5 unchanged;
witness: body margin intentionally unscaled). Widened call-shape pin: `zoom_floor` F8c/F8e (new `renderStar(star,
planets = [])` signature and `baseR × _starDrawScale`; core assertions unchanged). **Fail-first** (`git worktree --detach
b0f3106`, three stub copied, no junction, final keeper): **29 PASS / 55 FAIL**, no abort; green = OFF trace,
determinism, legacy controls incl. O8a (legacy accretion) and O8e (legacy radar text), witnesses. **Mutations (12, all
killed):** 0.2 floor back (774b), no clearance clip (774e/g/h), legacy = ℓ (774a/i), ceiling removed (774d),
renderStar on k (pin), screen floor always on (pin), 2 px floor (774j), floor scales corona (pin), accretion unscaled
(O8b + pin), readout threshold ≤ 0.3 (O8c), radar 1 decimal (O8d), HUD lock fallback without k (pin).
**Sweep 435/435 OK, 0 FAIL (31 advisory); `check-i18n` PASS** (keepers reading `ColonySphereDebug` re-run after the
`csOrbits` field change: archetypes 161, cache 56, climate 51, seeds 123, surface 45, life_temperature 24 — all green).

**Live engine** (variant of `probe-cs-phys-b2-live.mjs` with `csOrbits()` / `csClimate()` / far-zoom checks, headless
Chrome, real title → new game with both flags): PASS — home star M, L 0.035, `systemScale` 0.2, `starDrawScale` 0.188
(= ℓ, not clipped), home 0.188 AU at +15 °C (`csClimate` climateModel 2, contradictions 0); innermost planets clicked
at the system framing and zoomed **10/10**; orders to bodies at 0.295 / 0.452 AU and to the home world at 0.188 AU
(inside the legacy 0.3 AU exclusion) accepted; colony overlay opens / closes; 0 page exceptions; screen floor ×2.66 at
camera distance 450, ×1 at distance 3. Gate steps 3–5 (old save, flag after start, pre-4X seeded save) use commands
already validated by the CS-PHYS-a live probe and keeper O1/O2 (not re-driven live in this session).

**Findings.** **774 ✅** fixed (above). **776 ⚪** (new, no step) — combat-entry sampling at 1 r/s in k = 0.2 systems
(analytic, above). Free number: 777.

**Owner live gate — PASS (functional), 2026-11-19.** (1) Old save unavailable (single slot overwritten by earlier gate
games) — checked on a new no-flag world instead: csOrbits orbitModel 1, worldStamp null, systemScale 1, starDrawScale 1.
(2) New world with realisticClimate + scaledOrbits on the title: climateModel 2, homeworld New Earth 15 °C (flux 0.999,
zone hz), no planet inside the star disc. **Visual issue (owner screenshot):** in compact systems planets look far too
big relative to their orbits — drawn body radii, moon orbit radii and the star glow/corona do not follow the system
scale (the moon orbit ring around the homeworld is larger than the planet spacing) → CS-PHYS-c. (3) csNextSystem → M
dwarf sys_063 (k 0.2, starDrawScale 0.195): inner planets easy to click, star small. (4) Flag set after start:
orbitModel 1, systemScale 1. (5) Finding 773: seeded + climate + orbits world saved before 4X, F5 → Continue: same
galaxy seed 107300328, orbitModel 2. Findings: 774 ✅, 776 ⚪ open.

**Next step CS-PHYS-c (before the flags become permanent).** (a) Compact-system visual scale: drawn planet / moon radii,
moon orbit radii, star glow / corona and default camera framing follow the system scale, with minimum pixel sizes
(ships / icons unscaled); revisit the 0.15 AU route-avoidance margin once drawn radii scale. (b) Finding 776: combat
entry must not be skipped between frames at high game speed in small-k systems.

**Files (CS-PHYS-b3).** New: `src/testing/headless/probe-cs-phys-b3-compact.mjs`,
`docs/design/COLONY_SPHERE_CSPHYS_B_GATE_CHECKLIST.md`. Changed: `SystemScale.js` (`starDrawScale`,
`innermostPeriapsisAU`, `starScreenFloorScale`, `auReadoutDecimals`), `ThreeRenderer.js` (renderStar draw scale, screen
floor), `AccretionSystem.js`, `HudLabelLayer.js`, `HudRadarLogic.js`, `FleetTabPanel.js`, `ColonySphereDebug.js`
(`csOrbits` fields), `probe-cs-phys-balans.mjs` (orbits flag, tag), keepers `colony_sphere_orbits_smoke`,
`zoom_floor_smoke`. No critical file touched in this step (GameConfig / SystemGenerator changes are from §3.9 / §3.9.1).

#### 3.9.3 CS-PHYS-c — compact-system visual scale + Finding 776 (2026-11-19; owner gate PASS)

**Owner gate PASS 2026-11-19** (including the long-tick fix, §3.9.3.1). **Finding 776 ✅ closed** (`sweptProximity`, speed-derived teleport guard). Star corona left as is. **D-CS-25 signed:** moon orbit radii × k at generation in `orbitModel: 2` worlds accepted (no new RNG draws, legacy worlds unchanged, earlier scaled test saves keep old moon orbits).
**Finding 777 🟡 (record only, no fix):** the game loop does not clamp frame dt (`GameScene` `gameLoop` → `TimeSystem.update(deltaMs)`), so at 1 r/s a single hitch (~0.7 s) moves every vessel several AU in one tick. Combat entry is covered by the swept check; other per-tick effects of such jumps (MOS completion beyond intercept, missions, detection exits, economy steps) are unaudited. Next free finding number: 778.

**A. Visual scale (stamped worlds only; legacy k = 1 bit-identical: every factor is `x · 1`).** Body drawing scale =
k (`SystemScale.bodyDrawScale(star)` ≡ `systemScaleOfStar`, the D-CS-24 factor the orbits shrank by). Scaled:
planet / moon / planetoid mesh radii (`ThreeRenderer` — `_getEntityRadius`, `addPlanetMesh`, material rebuild, life
glow, `_addMoonMesh`, planetoids; clouds, atmosphere, gas-giant rings, colony building markers follow `r`); visual
ship / wreck orbits around bodies (minima 0.06 / 0.5 WU × k); station and ship orbital lanes
(`OrbitalRolesData.getOrbitRange(role, r, scale)` + `OrbitalSpaceSystem.assignOrbit` × `systemScaleOfEntity`); camera
min zoom on a body (0.3 / moon 0.15 × k), default min zoom, auto-zoom floor 0.8 × k (disc pixel sizes at min zoom =
legacy → the 260 px hero trigger stays reachable), system-frame floor 1 AU × k. **Moon orbits**: they are defined in
units of the drawn planet radius (`_makeMoon`: 2.5 radii, type caps, +0.15, jitter 0.1 WU), so in an orbit-model-2 world
all those lengths × k at generation (no new RNG draws; legacy worlds unchanged — keeper orbits O1 trace green). This is
the one generation change of the step (moon positions move by ≤ 0.04 AU; saves made before keep their moon orbits).
Measured (5 seeds): widest moon ring / neighbour gap in M systems 0.921 → 0.365. **Screen floor**
(`_applyBodyScreenFloor`, render loop only when scale < 1): disc radius ≥ `BODY_MIN_PX` = 2 CSS px, multiplier capped at
1/k (never larger than legacy); moon orbit rings get the inverse multiplier (moons stay on physics positions). **Star**:
already drawn with `starDrawScale` (Finding 774, ℓ, corona follows `r`); measured core / home orbit 0.23 in the seed-11 M
home vs 0.33 legacy G → no change in this step (owner judges by eye). Ships, station models, icons, labels unscaled.
**Route margin (decision §3.9.2 reversed):** body-avoidance margin 0.15 AU and waypoint offset 0.05 AU × k
(`VesselManager._calcRoute`) — margin / drawn radius identical to legacy. Proof: `docs/design/prototypes/
csphys-c-compact-before-after.png` (`probe-cs-phys-c-shots.mjs`, forced galaxy seed 11 → M home L 0.028, k 0.2; frames:
system frame, inner system 9 WU, homeworld auto-zoom (camera still lerping at 8 s in both), homeworld 1.5 WU, K system
k 0.62, G system k 1 = control identical). Numbers: homeworld drawn radius 0.107 → 0.0214 WU, home moon rings
0.366 / 0.422 → 0.093 / 0.144 WU, min zoom 0.3 → 0.06.

**B. Finding 776 ✅ (behind `FEATURES.sweptProximity`, default ON; OFF = old behaviour).** Root cause: ProximitySystem
sampled end positions once per tick; at 1 r/s and low fps the relative step of two hull_small ships (0.047 AU at 60 fps,
0.09 at 30) exceeds the k = 0.2 entry diameter 0.063 AU. Fix: per-vessel end-of-tick samples; `_sweptApproach` = closest
approach of the two uniform motions (`utils/SweptProximity.closestApproach`, relative motion, t ∈ [0, 1]) used for the
ENTER branches of detection, sensor-lock and combat (exits / hysteresis stay on end positions). Excluded: no sample,
system change, jump longer than the vessel's largest possible travel in that tick (teleport — §3.9.3.1; the first
version used a fixed 1 AU cap, which the owner check broke). Combat entered only by the sweep: cross-faction pair rewound
to the closest-approach positions before DSCS freezes it (otherwise the "no damage possible" guard refuses the start);
payload `swept: true`, `distanceAU` = closest approach. Same-faction: event, no rewind. `combatEnterAUOf` extracted
unchanged. Audit: MovementOrderSystem intercept/pursue completion — step-segment vs target point (`segmentPointDistance`)
— changed; patrol / pursue steps are clamped to the waypoint (land exactly) — unchanged; mission arrival is
time-parametric — n/a; snap-to-body (click), blockade (presence state), escort (clamped) — not crossing tests; accretion
(co-orbiting planetesimals, Generator scenario) — unchanged. Earlier-than-before triggers (legacy worlds too): only when
two ships' motions cross the threshold between samples while both end samples are outside (the pass-through case);
head-on approach at 60 fps triggers in the same tick (keeper control). Budget rotation (500 pairs/tick) unchanged.
Debug `csCollisionTest()` (`src/debug/CollisionTestDebug.js`): live engine (headless Chrome, M home k 0.2) ON 3/3 combat
started (`trigger: swept`), OFF 0/3; battles resolve, test hulls removed, 0 exceptions.

**Keepers.** New `colony_sphere_compact_smoke` (48 pins: C1 scale + floor rules, C2 moon orbits, C3 orbital lanes,
C4 renderer methods extracted from source and executed + live-path pins, C5 route margin executed) and
`swept_proximity_smoke` (27 pins: S1 math, S2 pass-through in k 0.2 executed, S3 controls/exclusions, S4 same faction,
S5 MOS intercept step). `colony_sphere_orbits` O8 witness → pin of the new margin. Fail-first (`git worktree --detach
98f7316`, three stub copied, no junction): compact 17 PASS / 31 FAIL, swept 12 PASS / 15 FAIL, no abort. Mutations 21/21
killed (bodyDrawScale 1, moon kDraw 1, rMinAbs unscaled, lanes unscaled, moon radius unscaled, floor cap removed, ring
compensation removed, margin unscaled, offset unscaled, auto-zoom unscaled, renderStar scale 1, swept off, no rewind,
rewind same faction, teleport cap A, teleport cap B, system check removed, samples not stored, MOS segment removed, t not
clamped, combat enter on end distance). Sweep 437/437 OK (31 advisory), `check-i18n` PASS.

**Files.** New: `src/utils/SweptProximity.js`, `src/debug/CollisionTestDebug.js`, keepers above,
`src/testing/headless/probe-cs-phys-c-shots.mjs`, the PNG. Changed: `SystemScale.js`, `ThreeRenderer.js`,
`SystemGenerator.js` (moon orbits), `OrbitalRolesData.js`, `OrbitalSpaceSystem.js`, `VesselManager.js`,
`ProximitySystem.js`, `MovementOrderSystem.js`, `ColonySphereDebug.js` (`csOrbits.bodyDrawScale`, `csCollisionTest`),
`GameScene.js` (alias), **critical file** `GameConfig.js` (flag `sweptProximity` only). Free finding number: 778 (777 recorded above).

#### 3.9.3.1 CS-PHYS-c owner check — long-tick fix of the sweep guard (2026-11-19; owner gate PASS)

**Owner check:** everything PASS except `csCollisionTest()` with `sweptProximity` ON in a G home (k = 1): `combatStarted:
false`, 6 frames at 6 fps during an AI `bootstrapColony` hitch, `minFrameSampleAU` 1.79 with `lateralAU` 0.1418 <
`enterAU` 0.1575; the re-run at normal fps started combat (`trigger: point`, 0.1478 AU).

**Root cause (reproduced, numbers).** `hull_small` + `engine_ion` flies 2.4955 AU/yr (not 1.4). The game loop does not
clamp `deltaMs`, so at 1 r/s one tick of t seconds moves each ship 2.5·t AU. The fixed `SWEEP_MAX_STEP_AU` = 1 AU rejected
every tick longer than 0.40 s as a teleport → point test only. Node reproduction on the owner geometry (gap 2.205 AU,
lateral 0.1418): tick 1/60 s → point entry 0.1479 AU (= owner's 0.1478); 1/6 s (step 0.42 AU) → swept; 0.5 / 0.7 / 1.0 /
1.3 s (step 1.25–3.24 AU) → **no combat** on the 1 AU tree, swept 0.1418 AU after the fix. The owner's sample (≥ 1.79 AU
apart before and after the pass) means ≥ 1.79 AU per ship in one tick, i.e. a hitch ≥ 0.72 s — exactly the Finding 776
case, and it also happens at k = 1.

**Fix (behind `sweptProximity`).** The guard is the vessel's largest possible travel in that tick: `maxFlightStepAU` =
speedAU × tech ship-speed multiplier (missions apply it; product up to ×7) × `SWEEP_SPEED_MARGIN` 1.5 × dt +
`SWEEP_STEP_FLOOR_AU` 0.05, with dt = max(this call, previous call) / `CIV_TIME_SCALE` (the pre-move pass sees motion of
listeners from the previous frame). A vessel docked / orbiting a body also gets the body's motion: |Δbody| + distance to the
body in the sample + distance now (triangle bound, covers any jump around the orbit). Constants and the formula live in
`utils/SweptProximity.js` (shared with MOS; systems do not import each other). Explicit teleport tagging was rejected:
~50 position-write sites (missions, docking, combat rewind, debug stagers) — a new one is easy to miss; the speed × dt bound
covers them all without touching producers. Warp arrival / system change stay caught by the systemId check. Debug
position sets happen while paused, so the next tick's dt is short and they remain teleports (the old fixed 1 AU cap
would have swept any placement under 1 AU). Combat-grid ticks (DSCS close steps on the round clock) can exceed the bound —
they fall back to the point test (legacy).

**MovementOrderSystem re-check.** The CS-PHYS-c change (step segment vs the target's point) misses long ticks: a mission
target moves in `_updatePositions` after MOS, so in a hitch the pursuer's step ends at the intercept point and the target
passes it later in the same tick — an equal-speed chase then never completes. Fix: `_sweptPrevStepHit` — at the next tick,
closest approach of the previous step vs the target's real motion over the same interval (target position from the
**start** of the MOS tick, `_tickStartTargetPos`, so the result does not depend on order iteration); skipped when the
pursuer was moved outside MOS, the target changed system, or the target's free-flight jump exceeds `maxFlightStepAU`.
Hostile pairs are already entered into combat by ProximitySystem pass 2 in the same tick; this closes order completion.
**Snap-back** for long ticks: the cross-faction rewind puts both ships at the closest-approach points of their (up to
~4 AU) tick segments — keeper S6 (x = 0, 0.9 AU back along the track) and live runs (`at.distanceAU` = lateral).

**Debug.** `csCollisionTest()` now reports `sweptSkip` (flagOff / noPrevSample / systemChanged / teleportGuard /
noProximitySystem; most frequent excluding noPrevSample), `sweepSkips`, `minSweptAU`, `maxShipStepAU`, `stepLimitAU`,
`ticks`, `routeStraight` / `placeSeed` (first of 12 placement seeds whose two routes need no body-avoidance waypoints — a bent
route changes the approach), and refuses with `combat_in_progress` while the system ticks on the combat grid (one live run
had the ships standing still for that reason). New `csCollisionTestLowFps()`: the same scenario with forced long ticks —
frame time is fed to the game in chunks of `tickMs` (721 ms) so each ship moves `LOW_FPS_STEP_AU` 1.8 AU per tick (the
owner's measured hitch). A uniform 6 fps (0.42 AU steps) would not reproduce the case — the 1 AU cap passed such steps.

**Live (headless Chrome, seed 11; M home k 0.2 and `sys_003` G k 1, 3 runs each):** ON — `csCollisionTest` 6/6 and
`csCollisionTestLowFps` 6/6 combat, all `trigger: swept`, ship steps 0.33–3.95 AU per tick; OFF — 0/12 (`sweptSkip:
flagOff`); battles resolve, test hulls removed, 0 exceptions.

**Keepers.** `swept_proximity_smoke` 27 → 54 pins: existing cases now use a dt consistent with the motion (`civFor(step)`;
the old `_tick(0.01)` with 0.16 AU steps was physically impossible and is now correctly a teleport); S5 long-tick MOS
(completion, OFF control, target teleport, pursuer moved, start-of-tick target position, `_tick` snapshot executed); S6 long
tick (k 1 and k 0.2 swept + rewind; controls green on both sides: same 1.8 AU jump in a short tick, 6 AU jump in a long
tick, warp arrival, system change; tech multiplier; previous-call dt; orbit carry with a free-flight witness; `_sweepWatch`
reasons; `summarizeSweep`). Fail-first on the pre-fix working tree (1 AU cap, detached worktree at 98f7316 + the tree's
files): 37 PASS / 16 FAIL, no abort. Mutations 17/18 killed (fixed 1 AU cap, bound without dt, dt of the current call only,
no tech multiplier, no body carry ×2, no guard A / B, no system check, MOS: no previous-step sweep, no pursuer-moved check,
no target jump guard, current instead of start-of-tick target, no start-of-tick snapshot, step not remembered;
csCollisionTest reason ranking; watch entry missing); survived: `SWEEP_SPEED_MARGIN` 1.5 → 1.0 — a tolerance constant, no
known producer exceeds speed × tech × dt (not pinned). Earlier part-B mutations re-run on the new code: 7/7 killed. Sweep
437/437 OK (31 advisory), `check-i18n` PASS.

### 3.10 CS-1a — TileGraph interface + FlatHexTileGraph, systems sites (2026-11-19; owner smoke PASS)

Pure refactor, no flag, no save change, no critical file touched (`HexGrid.js` is wrapped, not edited).

**Interface as built** (`src/map/TileGraph.js`):
- Entry: `tileGraphOf(grid)` (one graph per grid instance, WeakMap; falsy grid → `null`, like `grid?.`).
- Tile ref = id string (flat: today's `"q,r"`) or any object with `q,r` (tile, unit, `{q,r}`).
- Methods: `tiles()`, `forEachTile(cb)`, `anyTile()`, `tile(ref)`, `idOf(ref)`, `parseKey` / `formatKey`,
  `neighbors(ref, {crossSeam})`, `distance(a,b)`, `within(ref,k)` (= spiral), `ring(ref,k)`,
  `path(from, to, {passable, maxIterations})` (A* moved 1:1 from `GroundUnitManager._aStar`).
- Module helpers: `parseTileKey`, `formatTileKey`, `isCapitalKey`, `samePos`, `CAPITAL_PREFIX`, `BUILDING_PREFIX`,
  `DETACHED_FLAT_GRAPH` (coordinate math only, for positions without a grid).
- `FlatHexTileGraph` only delegates to `HexGrid` methods → same neighbour order, tie-breaks, iteration order.
- Not yet: `latitude` / `latitudeBand` / `isLandingEdge` / `stepDirection` (CS-2), `serialize` / `restore` (CS-5).

**Sites moved:**

| File | Moved |
|---|---|
| BuildingSystem | 11× key split + `grid.get`, adjacency + neighbour re-rate, `_isOwnTile`, iterations, all `capital_` / `building_` keys |
| GroundUnitManager | A* (`_aStar` = wrapper on `graph.path`), 4 distances, 8 tile lookups, survey spiral, position equality, occupation keys |
| CombatSystem | `_getTile`, support distance, retreat via `neighbors(…, {crossSeam:false})` |
| ArmySystem | position equality → `samePos` |
| InvasionSystem, GarrisonPlanner, SupplyCoverageSystem | iterations, spiral/ring, keys, distance |
| ColonyAutoExpander, EmpireColonyBootstrap | iterations, `_tileByKey`, `_active` sync, neighbours, keys |
| Withdrawal, TileOwnership, Anomaly, Resource, Impact, RandomEvent, ColonyGrid, VesselManager, ColonyManager | lookups, iterations, producer keys |

**Left for CS-1b:** all UI / renderer / test-helper sites, #764, #765.

**Left for CS-2 (grid-geometry rules, `// CS-2` notes in source):** Invasion `_isEdgeHex`; Combat retreat does not cross
the seam (`crossSeam:false`); GroundUnitManager seam teleport / sprite facing and the `reveal_fog` cube loop;
RandomEvent equator fallback; Bootstrap `_inferRows`; the three polar penalties; latitude modifier + persisted `tileR`;
`_gridHeight`; StrikeSquadron origin fallback.

**Left for CS-5 (key format / tile-id migration, not geometry; `// CS-5` notes in source):** minefield key
`${q}_${r}` (GroundUnitManager, groundAbilities); battle keys `pid|q|r` (CombatSystem); `q,r` fields on units and armies
(incl. writes in `Vessel.unloadGroundUnit` / `dropTroop`, VesselManager `unit.q ?? 0`); event payloads `{q, r}`;
`getUnitAt(pid,q,r)`-style signatures; Supply coverage map keys (read by the UI overlay); `HexGrid.restore` in
ColonyManager.

**Proof:**
- `probe-cs1a-trace.mjs` (30 y AI + scripted ground phase: 6 units, 12 A* moves, survey, army, war, garrison mobilisation,
  4-troop invasion, combat): seed A trace `d3bc84c5…` / state `14ee8ac7…` (1,992 events), seed B 60 y trace `52afc4cd…` /
  state `3597f337…` (2,910 events) — identical to HEAD `a36ad12`. HexGrid call counts identical except `distance`
  +101 (the three distance copies now call it).
- Keeper `colony_sphere_tilegraph_smoke.mjs` 37 PASS: every tile of 10 flat grids (all size classes + `largestHexMaps`,
  4,031 tiles, 427,908 distance pairs vs the three old formula copies), 10,092 A* searches (2,743 blocked) vs a frozen
  HEAD copy, source pins for 18 files with witnesses. Fail-first in a detached worktree at HEAD: 4 PASS / 20 FAIL
  (control T2a green on both sides).
- 11 mutations, all red. **Probe weakness:** M1 (neighbour order), M2 (distance), M6 (seam), M7 (ring), M8 (`building_`
  prefix) leave the trace unchanged — they are covered by the keeper only.
- Sweep 438/438, 0 FAIL, 31 advisories (same as HEAD); `check-i18n` PASS. Owner smoke 2026-11-19 PASS.

### 3.11 CS-1b — remaining TileGraph sites (UI, renderer, test tooling) + Findings 764, 765 (2026-11-19; owner smoke PASS)

Pure refactor except the #764 test-tooling fix; no flag, no save change, no critical file touched (`HexGrid.js`,
`TileGraph.js`, `GameConfig.js`, `SaveMigration.js` unchanged).

**Sites moved:**

| File | Moved |
|---|---|
| ColonyOverlay | capital checks ×3 → `isCapitalKey`; 4 distances → `graph.distance` via new `_graphFor(planetId)`; `grid.get` ×6 → `graph.tile`; tile keys ×8 → `graph.idOf`; supply-overlay key parse → `graph.tile(key)`; position equality ×3 → `samePos`; 6 "(q,r)" texts → `idOf` (identical text) |
| GameScene | debug `energyChain` producer key + key parse; starter / power-test placement `toArray` ×3 → `tiles()` |
| PlanetGlobeRenderer | keys ×4 → `idOf`; build-mode highlight iteration → `forEachTile` |
| BattleGroupPanel, EconomyOverlay | unit position → `idOf`; producer key → `parseTileKey` + prefix constants |
| PlanetMapGenerator | iterations ×5, `filter` ×3, Voronoi distance, smoothing + desert neighbours |
| SpawnTestEnemy, CombatSandbox | iterations, `building_` keys, BFS over `HEX_DIRECTIONS` → `neighbors({crossSeam:false})`, unused import removed |
| Test tooling | ActionCatalog, ScriptedBot (#764), RuleBot, GameCore, Pop/Resource/Price/RoiTelemetry |

**Remaining raw-hex hits (reason):** ColonyOverlay 2D-map geometry (4 iterations in `_findBestTileForCapital`,
`_centerOnCapital`, `_drawMap`, `_applyBiomeMap` #761; 2 `grid.get` by edge direction + `HEX_DIRECTIONS`; latitude label
= CS-2; `_screenToTile`) → replaced in CS-7/CS-8. PlanetGlobeRenderer RegionSystem legacy ×3 + UV picking ×2 → CS-7.
Texture bake pipeline (PlanetGlobeTexture, PlanetTerrainTexture, BiomeMapGenerator, BuildingMapGenerator,
SurfaceMarkers, ColonyBuildingMarkers) → C2, removed in CS-Z. PlanetMapGenerator polar caps by row → CS-5. CS-5
(unit q,r fields / signatures, `// CS-5` notes): UnitCardPanel ×2 and the ColonyOverlay unit panel ×1 (spaced
"(q, r)" ≠ id, kept for no visual change), CargoLoadModal `unit.q ?? 0`, GameScene `gum.moveUnit(q,r)`. Not tile keys:
AI log texts (ColonyAutoExpander, EmpireColonyBootstrap), `HexTile.key` (the id definition), RegionSystem / PlanetScene
(dead).

**Finding 765 ✅** — the two `_hexDist` copies computed the same cube formula (no wrap); the later silently won. Both
removed → `graph.distance` (= `HexGrid.distance`, keeper T1g over 427,908 pairs). No behaviour change.

**Finding 764 ✅** — ActionCatalog (and the twin in ScriptedBot's `tileKey` path) read tiles via the non-existent
`grid.getByKey` / `grid._map`; now `graph.tile(key)`. **Behaviour change (test tooling only):** fresh boot catalog
upgrade/demolish 0/0 → 3/3; RuleBot boosted 60 cy: upgrade requests 0 → 7, Lv≥2 buildings 1 → 3, buildings 20 → 18.
**BALANS / RuleBot harness numbers before CS-1b are not directly comparable — the next BALANS run is a new baseline.**

**Finding 778 🟡 (record only, no fix):** in headless runs `tile.underConstruction` progress stays at 0 for builds and
upgrades while `_active` flips immediately (measured: farm build and farm upgrade, 6 civ-years). Pre-existing,
unrelated to #764. If construction time is effectively skipped headless, BALANS economy results are optimistic.
Free finding number: 779.

**Proof:**
- `probe-cs1a-trace`: seed A 30 y trace `d3bc84c5…` / state `14ee8ac7…` (1,992 events); seed B (`KOSMOS_SEED=cs1b-seedB`,
  60 y) trace `25ae0a1f…` / state `ea79a395…` (2,893 events) — identical to HEAD `003cb3f`; HexGrid call counts identical.
- Keeper `colony_sphere_tilegraph_smoke` 37 → 63 PASS: T4 source pins on 18 files (exact allowed counts with reasons;
  comment-aware scanner), T5 no duplicate methods in any `src/ui` class (#765), T6 SpawnTestEnemy BFS = frozen old BFS
  (6,728 cases), T7 control: generator fingerprint `6ffc0c8f…` = HEAD. Fail-first at HEAD: 43 PASS / 19 FAIL.
- New keeper `action_catalog_tile_lookup_smoke` 6/6 (fail-first 1/5; K1 control green both sides): catalog = expected
  entries, ScriptedBot by key and q/r, effect upgrade Lv 1 → 2.
- 10 mutations, 9 red. M7 (GameCore tile order) caught by the trace probe only. **M8 survives:** inverting the
  capital filter in ColonyOverlay `_buildingSummary` — ColonyOverlay cannot be imported under node, so its logic is
  covered only by source pins, helper equivalence (T1) and the owner smoke.
- Sweep 439/439, 0 FAIL, 31 advisories (same as HEAD); `check-i18n` PASS. Owner smoke 2026-11-19 PASS.

### 3.12 CS-2 — grid-geometry rules behind TileGraph + Finding 779 (2026-11-19; owner gate PASS)

Refactor, bit-identical on flat **except Finding 779** (owner decision, option 1). No flag, no save-version change, no
critical file touched (`HexGrid.js`, `GameConfig.js`, `SaveMigration.js`, `EventBus.js` unchanged; `HexGrid.getLatitudeModifier`
stays as the oracle for keepers and the dead `PlanetScene`).

**Interface as built** (`src/map/TileGraph.js`, methods of `FlatHexTileGraph` — not generic formulas, see the CS-5 note):
- `latitudeBand(ref)` → `LATITUDE_BAND.EQUATORIAL / SUBPOLAR / POLAR` from the tile's row and the height of **its own grid**
  (same condition order as the old `getLatitudeModifier`); ref = tile, `{q,r}` or id (band from the id, never from a stored `tileR`).
- `equatorTile()` → first tile of row `floor(height/2)` (the old RandomEvent fallback row), `null` if none.
- `isLandingEdge(ref)` → `neighbors(ref).length < 6` (with seam wrap = first/last row and the short polar rows).
- `stepDirection(from, to)` → `{crossesSeam, facingLeft}`: the old GroundUnitManager pixel rule (|dx| > 0.4 × grid width at
  hexSize 1 → teleport; facing inverted on the seam step).
- Data: `src/data/LatitudeBands.js` (`latitudeModifierOf(band)`: production ×0.5 / ×0.7, build cost ×1.5 / ×1.25, label);
  `AiTerrainRules.AI_POLAR_PENALTY` + `aiPolarPenalty(graph, tile)` (−5 / −2) — the one canon for the three former copies.

**Sites moved:**

| File | Moved |
|---|---|
| BuildingSystem | latitude modifier → `_latitudeModifier(tile, graph)` / `_latitudeGraph(graph)` (explicit graph → `_grid` → the colony's grid); `_gridHeight` removed; queues no longer write `tileR`, restore ignores it; polar penalty → `aiPolarPenalty` (×2); `HexGrid` import gone |
| ColonyAutoExpander, EmpireColonyBootstrap | polar penalty → `aiPolarPenalty`; Bootstrap `_inferRows` removed; `_activateBuilding(…, null, …)` |
| InvasionSystem | `_isEdgeHex` removed → `graph.isLandingEdge(tile)` |
| GroundUnitManager | seam teleport + sprite facing → `graph.stepDirection(unit, nextHex)` (pixels stay for 2D interpolation only, CS-7/CS-8); `reveal_fog` cube loop left as is (event has no listener; CS-5 at its first listener) |
| RandomEventSystem | equator fallback → `graph.equatorTile()` |
| StrikeSquadronSystem | anchor fallback `{q:0,r:0}` → `graph.anyTile()` (= tile (0,0) on every flat grid, keeper G6a); `{q:0,r:0}` only for a body without a grid |
| ColonyOverlay | latitude label → `latitudeModifierOf(graph.latitudeBand(tile))`; `_gridHeight` mirror gone |
| GameScene | `gridSizes` height table (active colony after load) and 3 `_gridHeight` writes removed; new-game starter / boosted / power-test placement passes the grid's graph to `_calcBaseRates` (the grid is not yet on the colony or the BuildingSystem there) |
| ColonyManager, ColonyGrid, MissionSystem, SpawnTestEnemy, CombatSandbox, GameCore | `_gridHeight` writes removed |
| CombatSystem | retreat comment only (`crossSeam:false` is a graph option; no seam on a sphere) |

**Finding 779 ✅ closed (fixed in CS-2; the only behaviour change of the step — the latitude band always comes from the colony's own grid; AI colonies after load now pay / produce on polar bands as in a new game).** After loading a save the latitude modifier of a
colony came from the mirror `BuildingSystem._gridHeight`, not from its grid: the **active** colony got 10 from a planet-type
table in `GameScene` (`rocky: 10` — the real grids are 6…20 rows), every **other** colony got 0 = modifier OFF. The mirror was
set again only when the player opened that colony's map (`ColonyOverlay`); `ensureColonyGrid` returns early for a colony that
already has a grid and `syncTileBuildings` sets `_grid` only — so **AI colonies (whose map the player never opens) ran without
the modifier for the whole session after every load**, and the player's non-active colonies until their map was opened. Wrong
rates computed in the window were stored in `baseRates` and persisted by the next save. Fix: the band always comes from the
colony's own grid; the stale `tileR` of old saves is ignored (not recomputed — the band is derived from the tile key).
Measured on the real engine (`probe-cs2-postload.mjs`, fixture `GATE-S4-fresh-gy60`, clock frozen before «Continue», no tick;
one free tile per row, research_station production per year and build cost through the real `_build`):

| Colony (rows) | State before CS-2 (4829bec) | Rows that differ | Before → after (production · cost) |
|---|---|---|---|
| Pik1, player, **active** (16) | `_gridHeight` = 10 (table) until the map is opened | r8, r9, r14, r15 of 16 | r8 equatorial: 5.6 · Si 29 Cu 12 → **8 · Si 23 Cu 9**; r9: 4 · Si 34 Cu 14 → **8 · Si 23 Cu 9**; r14 subpolar: 8 · Si 23 Cu 9 → **5.6 · Si 29 Cu 12**; r15 polar: 8 → **4** |
| Propus b, AI (12) | `_gridHeight` = 0, `_grid` null — still after opening the player's map and after 1 game year | r0, r1, r10, r11 | polar 8 · Si 20 Cu 8 → **4 · Si 30 Cu 12**; subpolar 8 · Si 20 Cu 8 → **5.6 · Si 25 Cu 10** |
| Regulus c, AI (16) | same | r0, r1, r14, r15 | polar 8 · Si 23 Cu 9 → **4 · Si 34 Cu 14**; subpolar → **5.6 · Si 29 Cu 12** |
| Propus d, AI (14) | same | r0, r1, r12, r13 | as Propus b |
| Plt-15, AI outpost (6) | same | r0, r1, r4, r5 | production 8 → **4** / **5.6** (outposts: no research_station cost) |

After CS-2 every row of every measured colony equals the old rule with the **true** grid height (= a fresh game) in all three
phases (window, after opening the map, after 1 game year); before CS-2 only the active colony after opening its map did.
Equatorial rows are identical before and after. **No other state differs:** the save written right after load (tileR stripped)
has 108,155 leaves identical except 2 wall-clock `eventLog.createdAt` stamps — the same 2 as a base-vs-base control run;
2,125,661 bytes on both trees. (Without the frozen clock the rAF loop advances game time by ~3·10⁻⁵ y before the pause and
~840 numbers drift — not comparable.) The fixture's 36 pending orders carry `tileR` but sit on rows 2–5 (equatorial) → no
change there. AI tile choice is unaffected (it never read `_gridHeight`; the penalty canon is bit-identical, G2d/G2e).

**Trace normalisation (session 1).** `probe-cs1a-trace` raw hashes differ from 4829bec only by removed fields: `_gridHeight`
in the `colony:founded` payload, `game:saved.sizeBytes`, `tileR` in `underConstruction`. With those stripped the traces are
identical: seed A `21d6fdf57aca`, seed B `0335241b8e9f`.

**Note for CS-5 (D-CS-9).** On the geodesic grid "fewer than 6 neighbours" is exactly the 12 pentagons, so the flat landing
rule must not travel: `isLandingEdge`, `latitudeBand`, `equatorTile` and `stepDirection` are methods of `FlatHexTileGraph`
only; the interface header names `isLandingEdge` by D-CS-9 without a neighbour count. Keeper G7 pins it (methods own to the
flat class, nothing above it in the prototype chain, no module-level export, no `< 6` / row / pixel rule outside the class
body). `GeodesicGrid` must bring its own landing rule (D-CS-9), latitude thresholds per `n` (D-CS-7), an equator tile, and a
`stepDirection` without a seam (facing from the tangent-plane direction).

**Finding 780 ⚪ (recorded — pre-existing, not CS-2; fix in CS-8 with the new build panel).** The colony-map build preview and the affordability check
(`ColonyOverlay._canAfford`, `_getMissing`, the cost text in the build panel) call `computeBuildResourceCost(building, planet)`
without the latitude multiplier, while `_build` charges `× latMod.buildCost`. Measured: research_station on Pik1 subpolar
(2,14) charged Si 29 / Cu 12, the panel shows the equatorial Si 23 / Cu 9; a build the panel calls affordable can land in the
pending queue.

**Finding 781 ⚪ (recorded at the owner gate — pre-existing, not CS-2).** Ground units walk zig-zag paths: A* tie-breaking
among equal-cost neighbours (first in queue wins). Revisit in CS-5 with the geodesic A* (straight-looking tie-break).
Free finding number: 782.

**CS-Z cleanup list (added by CS-2):**
- the dead `_tileR` argument slot of `BuildingSystem._activateBuilding` (all callers pass `null`; kept so positional callers in
  tests do not shift);
- `PlanetScene`'s dead `_gridHeight` write and its `getLatitudeModifier` read (scene never opened); then
  `HexGrid.getLatitudeModifier` (critical file — only keepers' oracle and `RegionSystem` compat remain);
- 20 test files still write the dead `_gridHeight` (harmless; `farm_climate_gate`, `stage2_water_envcost`, `stage3_well_gate`
  comment "latMod = 1.0" — now true because those BuildingSystems have no grid, not because of the field).

**Gate helpers** (`src/debug/Cs2GeometryDebug.js`, aliases `cs2Latitude()`, `cs2Seam()`, `cs2Invasion()`, `cs2Strike()`,
`cs2EquatorEvent()`; quote-free, no args): latitude readout per band (production + cost through the build path, plus already
built research stations vs the band); seam walk of a test unit (removed after 5 s, time speed restored); war + invasion of the
active colony (test-only, reload after); strike squadron on the active colony (test-only, reload after); equator-fallback damage
event on a throw-away BuildingSystem (colony untouched). Checklist: `COLONY_SPHERE_CS2_GATE_CHECKLIST.md`.

**Proof:**
- Keeper `colony_sphere_geometry_smoke` 49 PASS — 32 grids (10 size classes incl. `largestHexMaps` + the 22 fixture grids,
  5,426 tiles): G1 band = old rule on every tile and ref form; G2 penalty = the three old copies (incl. `_inferRows`), 128
  autoPlace / `_findFreeTile` pick sequences = frozen old pickers; G3 landing edge + `_findLandingHexes` pool (seeded shuffle);
  G4 `stepDirection` + `_setupNextStep` on 31,648 neighbour pairs (1,731 across the seam); G5 equator tile + `_damageBuildings`;
  G6 `anyTile` = (0,0); G7 interface (CS-5 note); G8 source pins (`_gridHeight` only in `PlanetScene` ×1, no `tileR`,
  `_activateBuilding` null slot ×5 calls, no row/edge/pixel math at the 11 former sites, witnesses on a legacy sample); G9
  Finding 779 on colonies restored by the **real** `ColonyManager.restore` from the fixture (window = after opening the map =
  old rule with the true height = fresh-game colony; `_build` cost; queue completion with stale `tileR` 0); G10 `tileR` neither
  written nor read.
- Fail-first in a detached worktree at 4829bec: **15 PASS / 34 FAIL**; green on both sides = controls (G0, G1e bound-grid
  production, G2d–f picks, G3c pool, G4b–c, G5b, G6a, G8e–f, G9a, G9e, G9f).
- 20 mutations, **20 red** (each new method, data and penalty values, the 779 graph fallback and stale-`tileR` path, the
  interface, each former site's source pin, `serializeQueue` / `restorePendingQueue` keeping `tileR`). M11 / M12 (`_gridHeight`
  mirror / `gridSizes` table back), M13 (Invasion edge inlined again, same behaviour), M16 (Strike `{q:0,r:0}` back) and M18
  (Bootstrap penalty sign) are caught by source pins only (no headless effect path: ColonyOverlay / GameScene do not import,
  Bootstrap placement is not executed by the keeper).
- `probe-cs2-gate.mjs` 15/15 on the live engine (every checklist command and scenario); its new-game part (starter rates =
  recomputed on the tile, 8/8) is green on 4829bec too (no-change control).
- Sweep 440/440, 0 FAIL, 31 advisories (same as before the step); `check-i18n` PASS.

**Owner gate — PASS (2026-11-19).** Post-load window: all 21 `cs2Latitude` rows identical before / after opening the map;
band labels; a post-load build on a polar tile produces 4 = expected before and after opening the map; ground-unit move with
ocean blocking; save / load mid-gate; equator event; seam crossing; invasion landing 3/3 on edge rows; strike squadron
launched at the capital anchor; flat new game unchanged. Note: step 5 (cost deduction) could not be judged in game (large
stockpile) — covered by keeper G9d and gate probe L4.

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
- **✅ D-CS-20 Ocean tiles on terran worlds (SIGNED 2026-11-18).** Ocean tiles on terran worlds. The terrain report (§3.4.1) shows the terran buildable share dropping from 100% today (today's terran maps have no ocean) to a median 30% (min 14%, max 79%), because terran is always oceanic (D-CS-1 v2). **Accept fewer buildable tiles for now** — fewer does not automatically mean too few; re-evaluate after in-game testing once the sphere grid is live (after CS-5 / CS-8). Ocean buildings (e.g. sea platforms via tech, possibly reusing / fixing the unreachable `force_fields` ocean unlock #762) stay an unscheduled idea, not part of this arc. No grid-size or water-band changes because of this.

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
