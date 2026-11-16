# CONSOLES — visual reform of the full-screen tabs (plan and findings registry)

Status: **Phase A closed; K0a delivered (`8a820d2`, owner PASS 2026-11-16 — §8); next step K0b (Intel).** Phase A
(read-only audit) delivered 2026-11-16; decisions D-K-5…D-K-20 signed by the owner 2026-11-16 (§6.2; D-K-5 amended at
the K0a gate). Register: findings #723–#735 filed; **next free finding number: 736**.
Anchor: `e5e422c` (HEAD = main). Tree at audit time: the only tracked change was `.claude/settings.local.json` (harness
allowlist, not game code); 41 untracked files, all older than 2026-11-02, none from the combat-visuals arc.
Handover: `C:\Users\Komputer\kosmos-handover\consoles-phase-a\` (`STOP_A.md`, `kontakt_now.html`, `shots_now/`,
`shots/holo_*` hologram prototype frames, `probes/`, `tools/`). Measurements: headless Chrome 154 + CDP on the real GPU
(ANGLE D3D11, RTX 3070), 1600×1041 CSS (UI scale 1.25 → logical 1280×833), save `ZF120`, tree = `git archive HEAD`
outside the repo; `assets/` served read-only from the repo by the probe server (no junction).

## 0. Owner's frame (signed 2026-11-16 — not re-opened here)

- **D-K-1** One 4-zone template for every tab screen: (1) header = title + sub-tabs as `[ chips ]` + `[ x ]`;
  (2) list = what the player selects (screen-owned, not a map outliner); (3) hero = the one large thing that defines the
  screen; (4) inspector = details of the selection + actions. Optional strip under the hero (queue / timeline / slipway).
- **D-K-2** Map outliners stay hidden while a tab is open.
- **D-K-3** Bottom nav tiles stay as the tab switcher; top resource bar unchanged.
- **D-K-4** Shipyard hero = the hull's existing GLB with a hologram shader that ignores the texture + 3–6 slot anchors
  per model; modules = markers + labels on anchors. Fallback = flat line drawing generated from the same GLB. No modular
  ship models.
- Visual language = map HUD idiom (1 px lines, corner brackets, uppercase labels with underline leaders, `[ chip ]`
  actions, colours only from `HudPalette` roles, big numeric instruments). Visuals only — no mechanics, no save changes.
  Science (Tech, Observatory) is the next arc — only shared components are inventoried here.

## 1. Inventory

### 1.0 Shared mechanics (all screens)

- **Switcher.** 7 bottom-nav groups (`buildNavGroups`, `src/ui/CivPanelDrawer.js:164-176`): Civilization
  `[civilization, dyson]` · Economy `[budget, economy(=Production), trade, flows]` (tile opens Production) · Colonies
  `[colony]` · Shipyard `[shipyard]` · Diplomacy `[diplomacy, intel, war]` · Command `[fleet]` · Science
  `[tech, observatory]`. Groups with >1 member get the 24 px **subnav strip** (`drawSubNav` `:206`, hit `:254`; drawn by
  `UIManager.js:2486` after the overlay). `OverlayManager` (142 LOC): one active overlay; hotkeys C E H S D F T + I W U O,
  K (Command → wrecks), L, N (`OverlayManager.js:21-36`). Esc closes the active overlay (each screen may intercept first).
- **Off-nav screen.** `unit_design` (U) is in no nav group — reachable only by key.
- **Base class.** 13 canvas overlays extend `BaseOverlay` (`src/ui/BaseOverlay.js`, 252 LOC): `HEADER_H` 44,
  `_drawOverlayHeader` (bgAlpha .5 band, bold Medium accent title, 1 px line), `_drawButton` (hard-coded mint rgba),
  `_drawBar`, `_addHit/_hitTest` (first hit wins → background absorber last), `_getOverlayBounds`
  (`:197-224`: `oy = TOP_BAND_H 28 + subnav 24?`, `oh = H − oy − 42`). `FleetManagerOverlay` (open/close) and
  `ObservatoryOverlay` (DOM) are not BaseOverlays.
- **Draw order** (`UIManager._draw`, one `#ui-canvas` z2): TopBar → BottomBar → **active overlay** → subnav → outliners
  (hidden) → **CombatStrip (over the tab)** → TopResourceDrawer → BottomNavBar → BottomControlBar (clock cluster + `[⚔]`
  only) → EventLogDrawer, menu, tooltips. `#hud-canvas` is cleared and idles under any tab (`HudLayer.js:66-74`).
- **D-K-2 today — already holds for every id.** `OutlinerColumn.outlinerShown()` (`src/ui/OutlinerColumn.js:40-41`,
  `isShown :71-79`) returns false whenever `overlayManager.isAnyOpen()`; both outliners inherit it and give back their
  width. **Measured:** `isShown()` = false for left and right in all 32 tab frames of the Amber Noir sheet (true only on
  the map control frame). One-draw gap when an overlay closes itself (`OverlayManager.js:107`) — invisible.
- **Scene behind the tab — measured.** `ThreeRenderer._startLoop` (`:4431-4563`) has no overlay gate: the full HDR
  composer pass runs every frame under every tab — 180 renders / 3 s on the map and under Production, Colonies and
  Command alike; **5.3 ms per frame GPU-synced** at 1600×1041 (CPU submit ≈ 0.85 ms). Backgrounds are inconsistent:
  `bgAlpha(.38–.40)` (Civilization, Dyson, Economy ×3, Trade, Diplomacy, Intel, War, Tech) → orbits and the star show
  through the text (see `kontakt_now.html`); Colonies `.92`; Command opaque `#000`. → Finding **730**, decision **D-K-5**.
- **Theme.** `THEME` (live object, `src/config/ThemeConfig.js:9`); roles `resolveHudRoles(THEME)` (`src/ui/HudPalette.js:168`)
  → `primary`(accent) `dim`(textDim) `foreign`(textPrimary) `alert`(danger|warning by ΔE2000). **No tab screen imports
  HudPalette** (only HUD layers, `FleetPanelHudLayer`, `ShipPanelHudLayer`, `CombatStrip`, `BottomControlBar`). The 5 player
  themes = title-screen `SS_THEMES` (`TitleScene.js:17-60`): Amber Noir `ambient_1`, Cold Blue `ambient_2`, Galactic
  Violet `ambient_3`, Biopunk Green `ambient_4`, Neon Cyber `neon_cyber` (Rajdhani — proportional digits). Shared chrome
  that ignores the theme: subnav bottom line `GLASS_BORDER` (`ThemeConfig.js:802`, mint) and `BaseOverlay._drawButton`.

### 1.1 Per-screen table (A1 open/close · A2 tech · LOC)

| Screen (id) | Opens | File · LOC | Tech · layout source | Background |
|---|---|---|---|---|
| Civilization (`civilization`) | tile 1, C | `CivilizationOverlay.js` 748 | canvas · `_getColumns :59-66` (36 % / rest ÷ 2), 3 headers | .38 |
| Dyson (`dyson`) | subnav only | `DysonOverlay.js` 499 | canvas · `LEFT_W 340`; state via `dyson:panelUpdate :43` | .38 |
| Budget (`budget`) | subnav only | `EconomyOverlay.js` 3517 (one instance ×3) | canvas · `LEFT_W 220 RIGHT_W 260 TAB_H 32 FILTER_H 28 (:21-30)` | .38 |
| Production (`economy`) | tile 2, E | same | same; centre 50/50 + right column | .38 |
| Flows (`flows`) | subnav only | same | same; 46/54 split `:2701` | .38 |
| Trade (`trade`) | subnav only | `TradeOverlay.js` 1216 | canvas · `LEFT_W 320`; own 2nd-level tabs Handel/Rynek `_drawTabs :224` | .38 |
| Colonies (`colony`) | tile 3, H; body pin / card «Mapa ciała», top-bar colony list, outliner 🪖, StationPanel «Zarządzaj», planet/colony events (`GameScene.js:2723-2751`) | `ColonyOverlay.js` 5768 + StationManagementView 529 + GroundUnitPanel 867 + 6 Logic files | **mixed**: canvas + DOM WebGL globe (`PlanetGlobeRenderer`, z3 over ui-canvas) + DOM tooltip/modals · `_infoW :4519`, split inline `:915-921`, geometry recomputed in `_getMapBounds :4523` and `_fitMapToView :479` | .92 |
| Shipyard (`shipyard`) | tile 4, S; Command «back to shipyard» | `ShipyardOverlay.js` 669 + embedded `UnitDesignOverlay` 786 | canvas · ONE centred column `min(ow,560)` (`:82`), one vertical scroll, designer appended below the reserve | .38 |
| Unit design (`unit_design`) | U only | `UnitDesignOverlay.js` 786 | canvas · ship designer left + `GroundUnitPanel` right | .38 |
| Diplomacy (`diplomacy`) | tile 5, D | `DiplomacyOverlay.js` 727 | canvas · `LEFT_W 300`, actions band pinned `3×34+8` | .40 |
| Intel (`intel`) | subnav, I | `IntelOverlay.js` 413 | canvas · `LEFT_W 280` | .40 |
| War (`war`) | subnav, W; `PeaceOfferModal.js:99` | `WarOverlay.js` 749 | canvas · `LEFT_W 300`, right scroll via `InfoPanelLayoutLogic` | .40 |
| Command (`fleet`) | tile 6, F; K (wrecks); TacticalDock «show in registry» | `FleetManagerOverlay.js` 7804 + FleetRegistryLogic 241 + FleetPictureLogic 530 | canvas · own tab bar `:1236-1280` (no subnav); `LEFT_W 260 RIGHT_W 200 REGISTRY_RIGHT_W 300`; two DOM inputs | `#000` |
| Tech (`tech`) — next arc | tile 7, T | `TechOverlay.js` 730 | canvas · `DETAIL_W 252`, header hard-coded `oy+44` | .38 |
| Observatory (`observatory`) — next arc | subnav, O | `ObservatoryOverlay.js` 853 | **DOM** (fixed div z50, innerHTML); moves the main camera (`enterObservatoryPreview`) — the live 3D body is its hero; no ✕ | — |

Command sub-pages (verified): **SYSTEM TACTICAL** (registry only — `FEATURES.commandTacticalMap` = false hides the 2D map
view), **GROUND UNITS**, **STAR ATLAS**, **LOGISTICS** (`FEATURES.transportOrders`). **Stratcom no longer exists as a tab**
(removed in GALAXY G5, `FleetManagerOverlay.js:380-382`; the galaxy is a main-view mode, G/M). PopulationOverlay (1195 LOC)
is unreachable (`FEATURES.populationOverlay` false).

### 1.2 Content → zones (A3)

Legend: **L** list · **H** hero · **I** inspector · **S** strip · **∅** fits no zone.

**Civilization.** L = colony table (name, POP, prosperity, Kr, fleet, buildings; row click only switches the active colony,
`:728`) · H = leader portrait + faction slider/tension (proposed) · I = empire stats; selected colony summary (new, small) ·
S = 4 summary cards (POP, prosperity, Kr/yr, trade) · ∅ = History chronicle (right column today — candidate: second
header chip «History» or S). Leader bonus text wall → I.
**Dyson.** L = 4 phases × 20 segments · H = **missing** — sphere completion diagram (20 segments / 4 phases; the 3D rings
`_dysonRingsGroup` are a reference) · I = selected segment: delivered/needed per resource + `[ DELIVER MAX ]`
`[ DELIVER 10 % ]` · S = X/20, research bonus, stage N/4.
**Budget.** L = income/expense lines (credits, trade, tax, labor, unit upkeep, fleet upkeep + reserve, research) ·
H = net Kr/yr instrument + income-vs-expense bar with the tax slider · I = selected line breakdown + tax effect text ·
S = deficits/surpluses ticker · ∅ = left resource inventory + energy box (shared by all three Economy pages; duplicates
the top resource drawer — D-K-16).
**Production.** L = GLOBAL + colonies/stations (replaces the filter chips, which silently drop overflow — Finding 732) ·
H = factory floor of the selection (allocation rows with progress, FP gauge; GLOBAL = all colonies) · I = master
ON/OFF, one-shot, droid Build-N, reactive demand, export prefs, safety stock (collapsible sections) · S = queue / 10-year
produced-consumed chart · alerts → I warnings block or header badge.
**Flows.** L = resources · H = producers → resource → consumers flow (two bar lists today) · I = numeric breakdown.
**Trade.** Two tab levels (subnav + Handel/Rynek) → D-K-15. Handel: L = connections · H = export/import chart ·
I = connection flows, spend actions, migration toggle, goods allow grid · S = transaction log · ∅ = local prices (raw ids,
Finding 725). Rynek: L = partner empires → colonies · H = AI inventory/price board · I = buy/sell action box ·
S = pending orders.
**Colonies.** L = player colonies (pills in the header today; duplicate the top-bar colony list) · H = **hex map**
(confirmed — interactive centre, owns most input) · I = info tabs Planeta / Załoga (V2 live) / Populacja / Stacja **and**
selection panels (hex floating panel, unit stack, unit panel) — two content families compete → D-K-13 · S = buildings
bar (move under the hero) + multi-select unit drawer · globe (DOM, decorative) = top of I · ∅ = draft modal, station
picker (full-bounds), DOM modals, landing banner.
**Shipyard.** L = design library (saved templates, 5 build states) + hull picker · H = hull hologram with anchors
(D-K-4) · I = module picker + stats + deltas + `[ BUILD ]` `[ SAVE ]` `[ CLEAR ]` · S = slipway: active builds + surge,
pending orders, reserve. Gates S0 (no `exploration`) / S1 (no shipyard building) → header banner.
**Diplomacy.** L = empires (shared with Intel — identical rank/mask/row code) · H = relation readout: opinion + tension
instruments + status/truce · I = opinion breakdown, treaties, memory, `[ chips ]` war / peace / envoy / trade / pact /
alliance · S = ultimatum warning / flash.
**Intel.** L = empires (shared) · H = power balance (mine vs theirs) / dossier header · I = known systems, military,
incidents. No actions.
**War.** L = wars (status, exhaustion mini-bars) · H = peace table (demand | offer) or exhaustion tug-of-war ·
I = casus belli, battles, `[ PROPOSE PEACE ]`; «Force battle / Force invasion» are labelled `(debug)` and shown to
every player (Finding 735).
**Command.** Registry: L = filter chips + 12-column table (it is wide — the list *is* the screen) · H = none obvious ·
I = inspector (fleet / wreck report / enemy / own vessel, ~2300 LOC) · S = timeline lanes → D-K-14. Ground: L = archetype
tiles · H = unit sprite + stats · I = recruit (GroundUnitPanel, shared with 2 other hosts). Atlas: L = bodies ·
H = missing (system orrery?) · I = today's tooltip / report modal. Logistics: L = active orders · I = order builder ·
S = pool capacity.

### 1.3 Duplication with the map (A4) — what can be dropped

- **Colony lists** (Civilization table, Production chips, Colonies pills) repeat the top-bar colony list
  (`TopResourceDrawer.js:113-246`, visible over every tab) — keep one screen-owned L per screen, drop header pills.
- **Economy left inventory column** repeats the top resource drawer (D-K-3 keeps the drawer) → drop (D-K-16).
- **Command inspector ↔ T5/T6.** T5 (`ShipPanelHudLogic.js:6-13`) declares itself a mirror of `_drawRight` compact mode
  and dispatches into `FleetManagerOverlay._handleHit` / `_missionConfig`; T6 ≈ `_drawRightFleet`. Unique to Command:
  catalogue card (specs, modules, fuel/endurance bars, upkeep), mission log, **retreat threshold** (not in T6). Do not drop
  orders from Command (it is the full registry), but restyle around shared handlers; never rename hit-zone types.
- **Dormant / dead code** (no reskin): Command flag-OFF 2D map + left list (~1200 LOC) and `_drawLeftFleets`;
  `FleetTabPanel.js` (2678) and `FleetPanel.js` (474) — zero importers; EconomyOverlay priority/manual modes (~700 LOC,
  `:1335-1750`, `:2180-2423`); ColonyOverlay V1 workforce `:1801-1926` and `_stationMode`; `UIManager._drawCivPanel`
  (never called) with the stale `CIV_TABS[].key` hints → Finding 734.
- **Civilization Kr/yr** repeats Budget; **War battles** overlap CombatStrip (drawn over the tab).

### 1.4 Style debt (A5)

| Screen | Hex lit. | rgba lit. | THEME refs | HudPalette | Distinct font specs / px | Boxes |
|---|---|---|---|---|---|---|
| Civilization | 2 | 2 | 95 | 0 | ~12 · 9, 14, Large+4, italic | filled cards + strokeRect |
| Dyson | 4 | 1 | 63 | 0 | 10 | `_drawButton`, `_drawBar` |
| Economy (3 pages) | 8 | 43 | 439 | 0 | ≈{6,7,8,9,10,11,14,15,16} | filled tint panels, 5 button impls, 2 steppers, dashed lines |
| Trade | 4 | 14 | 175 | 0 | {7,9,11,14} | gold tint fills |
| Colonies | 162 (76 distinct) | 88 | 325 | 0 | 9–14 plain/bold, italic 10, `22px sans-serif`, serif, monospace | near-opaque panels, filled pills, `_drawBtn` |
| Shipyard | 13 | — | 101 | 0 | Small, Small−1/−2, Normal, `bold 14px` | 11 fill / 8 stroke, emoji |
| Unit design | 1 | — | 81 | 0 | Tiny, Small, Normal, Medium | `_drawButton` |
| Diplomacy | 29 | 9 | 89 | 0 | 9 · Medium+6 | amber selection |
| Intel | 4 | 1 | 68 | 0 | 7 | amber selection |
| War | 18 | 9 | 97 | 0 | 10 | red selection |
| Command | 46 | 119 | 908 | 0 | 28 · 8–16 | 97 fill / 57 stroke, tinted buttons, emoji |
| Tech (next arc) | 24 | — | 92 | 0 | Small, Normal, Medium, `bold 14px` | card-state rgba fills |
| Observatory (next arc) | 15 | — | 106 | 0 | CSS px 9–18 | radius 3–4 px |

Cross-screen: three selection idioms (mint / amber / red); semantic colours duplicated as hex (#D85A30, #60B090,
#D8A030) instead of `danger/success/warning`; no corner brackets anywhere; buttons are filled rectangles, not
`[ chip ]`; the close glyph is a literal `bold 14px ✕` in 6 files; 5 screens recompute the UI scale from
`window.innerWidth/Height` inside input handlers; header heights differ (44 vs 32 vs 28 px). Font family is always
`THEME.fontFamily` (Share Tech Mono on Amber Noir etc., Rajdhani on Neon Cyber).

## 2. Shipyard hologram feasibility (D-K-4)

### B1 Hulls vs GLB models — nothing is missing

Model key = `VesselModelResolver.js`: `{nonwarp|warp}_{class}` → `assets/models/ships/<key>.glb`. Warp axis =
`warpFuel.max > 0` (a `warp_tank` module). Combat hulls map 1:1; **civil hulls resolve by role from the fitted modules**
(habitat / passenger → colony, science → science, else cargo) — the model changes while the player designs (D-K-10).

| Hull (designer offers all 6) | Slots | Model files (all present) | Standard |
|---|---|---|---|
| `hull_small` Small | 3 = 1P+2U (only ground-buildable) | `{nonwarp,warp}_small_{cargo,science,colony}` | legacy-textures@1 |
| `hull_medium` Medium | 6 = 2P+4U | `{nonwarp,warp}_medium_{cargo,science,colony}` | legacy (**medium_cargo ≡ large_cargo**, Finding 728) |
| `hull_large` Large | 9 = 3P+6U | `{nonwarp,warp}_large_{cargo,science,colony}` | legacy |
| `hull_frigate` Frigate | 4 = 1P+3U | `{nonwarp,warp}_frigate` + `@1k` | normalize-ship@1 |
| `hull_destroyer` Destroyer | 6 = 2P+4U | `{nonwarp,warp}_destroyer` + `@1k` | normalize-ship@1 |
| `hull_cruiser` Cruiser | 8 = 3P+5U | `{nonwarp,warp}_battleship` + `@1k` | normalize-ship@1 |

24 slot GLBs + `default.glb` on disk; `cargo3d.glb` (≡ `default.glb`) and `research1.glb` unused. Legacy `SHIPS`
(science_vessel, cargo_ship, space_supply_ship) are not in the designer. Loading today: one `GLTFLoader` in
`ThreeRenderer` (`:602`), `_loadShipModel :5271` with promise/template caches and `default.glb` fallback,
`_loadShipModelVariant :5257` (`@1k`), `buildShipRig` (`ShipModelRig.js:279`: canonical frame, bbox max = 1; a rim term
already exists — `paintRigRim` `:198`). An offscreen GLB → canvas path already exists: `GlbSnapshotRenderer.js` (own
WebGLRenderer, per-path cache; used only by `GroundUnitFactory.js:336`). Normalizer `npm run ship -- <slot>`
(`tools/ship-models/normalize-ship.mjs`, 533 LOC: centre, longest axis = 1, bow −X, 2K + `@1k`). Model Workshop
(`tools/model-workshop/`, workshop.js 1151 + WorkshopLogic 640): bow / nozzle / weapons / lights / select / mask modes,
saves `hardpoints/<slot>.json` via the File System Access API — no module-anchor mode yet.

### B2 Render path — recommendation: (b) a dedicated small WebGLRenderer, composited into the ui-canvas

**Measured prototype** (probe `probes/holo.mjs`, never in the repo): second `WebGLRenderer` 900×640 (≈ hero rect at
1600×1041), every mesh's material replaced by one `ShaderMaterial` (fresnel rim + screen-space scanlines, additive,
colour = `resolveHudRoles(THEME).primary`) + `EdgesGeometry(30°)` outline in the same role → the texture is never sampled.

| Model | Tris | Edges | Edge build (once) | Hologram frame, GPU-synced | CPU submit |
|---|---|---|---|---|---|
| warp_frigate@1k | 9 882 | 7 002 | 22 ms | 0.80 ms | 0.04 ms |
| warp_battleship@1k | 29 238 | 19 987 | 48 ms | 0.82 ms | 0.05 ms |
| nonwarp_medium_cargo | 10 183 | 7 222 | 21 ms | 0.53 ms | 0.03 ms |
| warp_small_science | 10 127 | 7 105 | 18 ms | 0.47 ms | 0.02 ms |
| main 3D scene (today, under every tab) | — | — | — | **5.3 ms** | 0.85 ms |

GLB load 81–228 ms (first time; cacheable). Composite `drawImage(webglCanvas)` + a forced `getImageData` readback
measured 2.3–5.8 ms — an **upper bound** (the readback forces a GPU→CPU sync that the real UI does not do); K1a must
measure the composite alone. Frames: `shots/holo_amber/holo_*.png`.

- (a) Main ThreeRenderer, camera moved to a staging spot — **rejected**: the main view is the live system (bloom/HDR,
  selection, combat replay clocks, galaxy mode); moving its camera is the trap class of `enterObservatoryPreview`.
- (b) **Second WebGLRenderer on an offscreen canvas**, `ctx.drawImage` into the hero rect of the ui-canvas each frame
  (or only while animating). Keeps z-order and hit zones in the canvas pipeline (unlike the DOM globe, which covers
  chrome). Second WebGL context = same pattern as `PlanetGlobeRenderer` / `GlbSnapshotRenderer`. Lazy create on first
  open, dispose on close. **Recommended.**
- (c) Render-to-texture inside the main renderer — rejected: extra pass inside the HDR/bloom pipeline, theme colours
  would be tone-mapped, and it still renders the full system scene.
- Net cost with D-K-5 (a): hologram ≈ 0.5–0.8 ms replaces the 5.3 ms invisible scene → the Shipyard becomes cheaper than
  today. Material override: one shared `ShaderMaterial` per theme epoch; uniforms only (GLSL trap: no string
  interpolation, no backticks; headless compile probe with failing control per commit).
- **Owner notes for K1a (2026-11-16, from the prototype frames):** Meshy meshes give a noisy `EdgesGeometry` at 30° (the
  medium cargo frame is cluttered) → K1a needs a **live edge-threshold knob** (try 45–60°) and the **rim/fresnel term
  dominant over the edges**. The prototype frames were rendered on white; the look is judged on the real dark console
  background (D-K-5), not on the prototype frames.

### B3 Anchor data

- Slot counts 3 / 6 / 9 / 4 / 6 / 8 exceed «3–6 anchors» on Large (9) and Cruiser (8) → anchors per **role group**, not
  per slot (D-K-8). Proposed roles (≤ 6): `drive` (propulsion — default = the model's nozzle hardpoint, every model has
  exactly one), `weapons`, `defence` (armor + shield), `hold` (cargo + fuel), `mission` (science + special + troop),
  `habitat`. Several modules on one anchor = a stacked label list on one leader line.
- Format (proposed, per model): `{ v:1, slot:'warp_frigate', anchors:[{ role:'drive', p:[x,y,z] }, …] }` in normalised
  model space (same space as hardpoints: bbox centre 0, longest axis 1, bow −X).
- Location → D-K-9. `hardpoints/<slot>.json` is validated strictly (`ShipHardpointsSchema.js` `TOP_KEYS :64` — an unknown
  key is an error), so either a schema v2 or a sibling folder `assets/models/ships/anchors/<slot>.json`.
- Owner placement → Model Workshop **anchors** mode (it already has click-to-place on the model, mirror, select/drag and
  FS-Access save — the smallest new tool). Defaults when no file exists: `drive` = nozzle hardpoint; others from the
  bbox along the bow axis (bow 0.35 · mid 0 · aft −0.25) with dorsal/ventral offsets — computed, never stored.

### B4 Fallback silhouette — in-browser, no Blender, no offline tool

Measured: the same `EdgesGeometry(30°)` rendered with an orthographic side (and top) camera gives a clean line drawing in
≈ 4 ms per view (frames `shots/holo_amber/sil_*.png`, `silTop_*.png`). Generate on demand into a cached canvas per model
× theme epoch (or once per model as alpha mask, tinted at draw). Offline node is not needed (node has no WebGL; a JS mesh
edge extractor + SVG writer would duplicate what three already does). Trigger → D-K-11.
Owner note for K1a (2026-11-16): the silhouette inherits the same edge-threshold knob as the hologram (B2 — 30° is noisy
on Meshy meshes; try 45–60°) and is judged on the dark console background.

### B5 Module data for hover previews

- Slot types on hulls: only `propulsion` / `utility` (`HullsData.js` `getSlotCounts :291`). 38 modules
  (`ShipModulesData.js:11`); utility accepts cargo, science, special, habitat, armor, fuel, weapon, shield, troop
  (`UTILITY_SLOT_TYPES :632`).
- Stat keys: speedMult, fuelMult, rangeMult, cargoAdd, fuelCapacityAdd, warpCapacityAdd, survivalBonus, discoveryBonus,
  colonistCapacity, troopCapacity, hpBonus, armorRating; combat: attackPower, damage, rangeAU, tracking, armorPierce,
  fireCooldownYears, shieldHP, shieldRegen; plus mass, cost, commodityCost, requires, tier. No upkeep/crew per module
  (hull only).
- `calcShipStats(hull, modules)` (`:645-725`) and `calcShipCost` (`:728`) → a delta preview = stats(with) − stats(without):
  speed, range, cargo, fuel, mass, hp, armor, survival, colonists, troops, warp capacity, cost. **Weapons and shields are
  not aggregated** outside `BattleSystem.js:273/333` → show the module's raw damage / shieldHP (no mechanics change).
  Today's hover is a short string (`_moduleStatSummary` `UnitDesignOverlay.js:773-785`) without armor / hp / shield / damage.

## 3. Shared console kit (proposal)

New, small and mostly pure; reuse before invent. Every drawing call takes `roles = resolveHudRoles(THEME)` — no literals.

| Component | Purpose | Reuse |
|---|---|---|
| `ConsoleLayoutLogic.consoleZones(bounds, spec)` (pure) | header / list / hero / inspector / strip rects from one spec per screen (`listW`, `inspW`, `stripH`, variants 3-zone/4-zone) | replaces per-file `LEFT_W/RIGHT_W` and the UI-scale copies in input handlers |
| Frame | 1 px corner brackets per zone, no filled boxes; opaque console background (D-K-5) | `bracketCorners` (`HudAttentionLogic.js:149`) → add a rect variant; stroke loop of `HudFocusLayer.js:120-138` |
| Header | UPPERCASE title, sub-tabs as `[ chips ]`, `[ x ]` right; replaces the subnav strip and each file's `✕` | chip text/width `HudLayerChipsLogic.chipText/chipWidth :114/:122`, `layoutLayerChips :135`, hit `chipAt :149`; chip style of `BottomControlBar.js:159-178` |
| List | rows with selection (primary underline + bracket), hover fill .18, group headers, clip + scroll + 2 px scrollbar, reveal-to-selected | `OutlinerColumn.draw :119-171` (abstract list skeleton), `clampScroll/scrollThumb/pruneZones` (`InfoPanelLayoutLogic.js`), `truncateText` |
| Eyebrow / section | small uppercase label + underline leader | `railRows` / thread leader (`HudLabelLogic.js:220-246`), `OutlinerColumn._drawFrame :174` |
| Key–value rows, bars | label … value; 2 px track (dim .35) + primary fill | `ShipPanelHudLayer` 'bar' block `:325`; replaces `_drawBar`, `drawMiniBar` |
| Big instrument | big tabular number + unit + label + delta tone | `layoutTabular` (`HudLabelLogic.js:282`) + `_line/_drawLine` (`ShipPanelHudLayer.js:78/97`) → extract to a pure-ish helper; new size token (D-K-19) |
| Chips (actions) | `[ LABEL ]` states: normal / hover / disabled (dim) / off (strike) / danger (alert role) | `layoutButtonRows` (`LabelPinLogic.js:218`) |
| Stepper | `[−] value [+]` with optional DOM input (Economy ×3, Trade, Colonies) | Econ `_drawBonusBox :2472` pattern |
| Strip | queue chips / timeline lanes / slipway rows | `TacticalDock` lanes `:390/:464`, `FleetPictureLogic.toneColor` |
| Tooltip | canvas tooltip box (or keep DOM `Tooltip.js`) | `OutlinerColumn.drawTooltip :217` |
| Hero host | hologram canvas host (Shipyard), hex map (Colonies), diagrams (Dyson, Flows) | new `ShipHologramRenderer` (K1a) |
| Transitions | none in K0 (static frames); optional 120 ms fade later | — |

Hit zones stay per screen (first-hit-wins in BaseOverlay; Command keeps its own `_hitZones` and zone types).

## 4. Risks

1. **Hit-zone order = click priority** (Colonies `handleClick :4577` + `_onHit :4824` ≈ 700 lines; Command ~110 zone
   types shared with the T5 map panel). Move rects, never rename zone types or data shapes.
2. **Geometry computed in several places** (Colonies ×3 + cached `_floatX/_floatY`; Economy `handleScroll :3461`;
   UI scale recomputed from `window.inner*` in 5 screens) — the kit's `consoleZones` must become the single source per
   screen in the same step, or clicks drift.
3. **Golden traces** pin the Command inspector render bit-for-bit (`fixtures/T4-ship-panel-t3-baseline.*`, comment
   `FleetManagerOverlay.js:5606`) — the K7 inspector step must re-record them deliberately (flag OFF = old trace).
4. **Shared components with 3 hosts**: `GroundUnitPanel` (Unit design, Colonies draft, Command Ground) and
   `UnitDesignOverlay` (U screen + Shipyard embed) — restyling one host restyles all.
5. **DOM layers**: Colonies globe (z3 over the ui-canvas; full-bounds modals toggle it), floating `<input>`s positioned by
   canvas math (Economy, Trade, Command), DOM tooltips/modals with literal CSS — chrome under the globe is invisible.
6. **Second WebGL context** (hologram) on weak GPUs / SwiftShader: measured only on an RTX 3070; budget + fallback
   (D-K-11); context-loss handling; dispose on close.
7. **Suspending the 3D scene** (D-K-5): presentation clocks (CV-7 director, combat replay) tick inside the render loop —
   skip only the composer pass, keep the ticks; first frame after close must be correct (no stale bloom). Observatory
   needs the scene (next arc, stays exempt).
8. **Scope**: ~23k LOC of overlay code; dead/dormant code (~5.5k LOC incl. FleetTabPanel) must not be reskinned —
   remove first (D-K-18). Neon Cyber's proportional font breaks column alignment unless numbers go through
   `layoutTabular`.
9. **i18n gate**: new labels in both `pl.js` / `en.js`; the literal ratchet catches new hard-coded strings; the raw-id
   strings found here (724, 725) will surface when touched.
10. **Keepers construct overlays directly** (FleetManagerOverlay, ColonyOverlay pins are source-only) — layout changes
    break assertions; contact-sheet steps keep keepers to logic only (no pins on drawing constants).

## 5. Findings (next free number verified: **723**; the brief expected 612 — the CV arc filed #612–#722)

This plan files **#723–#735**. **Next free finding number: 736.**

| # | Status | Finding | Evidence | Step |
|---|---|---|---|---|
| **723** | 🟠 | **The Shipyard ignores the 4-zone idea entirely**: one centred 560 px column (`ShipyardOverlay.js:82`) with build list, reserve and the ship designer stacked in one scroll; the designer (hull picker, slots, module picker, stats, SAVE) is reachable only by scrolling past the reserve, and its pinned action bar floats at the bottom of an otherwise empty screen | `shots_now/*/2x_shipyard_*.jpg`; `ShipyardOverlay.js:91-154` | K1 |
| **724** | 🟠 | **Diplomacy shows raw engine ids**: the AI stance prints `fsm.state` (`NEGOTIATING`, `IDLE`…) verbatim and the relation memory prints event keys (`research_intrusion`, `peace_offered`) | `DiplomacyOverlay.js:266-270`; `shots_now/amber_noir/30_diplomacy.jpg` | K2 |
| **725** | ⚪ | **Hard-coded literals bypassing i18n on tab screens**: Intel `(wymaga skanu naziemnego)` `:333`, `Ostatnie incydenty` ~`:346`, `(brak)` ~`:356`; Production demand headers `Źródło/Towar/Potrzeba` `EconomyOverlay.js:1774-1776`; Trade `Kr/rok` `:603` and local prices shown as raw resource ids `:696/:706`; War heading `Casus Belli`; Budget tax-effect labels inline PL/EN `:3105` | files as listed | the step that touches each screen |
| **726** | ⚪ | **Module picker shows raw keys for two module groups**: `UnitDesignOverlay` category labels are a local PL/EN map (`:37-68`) with no `shield` / `troop` entries → those groups render their raw slotType with no icon (`catLabel ?? cat`, `:436-439`) | `UnitDesignOverlay.js:37-68, 436-439` | K1 |
| **727** | ⚪ | **Diplomacy action band collides with the clock cluster**: the bottom-right action button («Zaproponuj sojusz») sits under the always-on clock/bell cluster drawn over every tab | `shots_now/amber_noir/30_diplomacy.jpg` | K2 (console frame reserves the clock rect) |
| **728** | ⚪ | **Medium and Large cargo hulls show the same model**: `nonwarp_medium_cargo.glb` ≡ `nonwarp_large_cargo.glb` (identical md5 `43be8bba…`); also `cargo3d.glb` ≡ `default.glb` (unused) | `md5sum assets/models/ships/*.glb` | art / model pipeline (no step) |
| **729** | ⚪ | **15 building/icon textures referenced but absent from `assets/`** (404 in the live game): e.g. `assets/buildings/{geothermal,synthesized_food_plant,terraformer,orbital_mine,ai_core,…}.png`, `assets/icons/building_autonomous_spaceport.png` | probe server `notFound` list (`shots/scout_amber/scout.json`); `ls` in the repo | art (no step) |
| **730** | 🟠 | **The full 3D system scene renders at 60 fps under every tab** — 5.3 ms GPU-synced per frame at 1600×1041, the same as on the map — even under the opaque Command (`#000`) and the .92 Colonies background; under the other ten screens (`bgAlpha .38–.40`) the orbits and the star bleed through the text | `probes/scout.mjs` (180 renders / 3 s map vs tabs), `probes/holo.mjs` (`mainScene.syncMsPerFrame`); `ThreeRenderer._startLoop :4431-4563` | K0 (D-K-5) |
| **731** | ⚪ | **Observatory has no close control** (DOM overlay — no `✕` in its header; close only by key / Esc / nav tile), and `NavEdgeShim` still lists `tech` among DOM overlays (`NavEdgeShim.js:16`; Tech is canvas) | `ObservatoryOverlay.js` (no close), `NavEdgeShim.js:16` | Science arc |
| **732** | ⚪ | **Production colony chips silently drop colonies that do not fit** (`if (cx + cw > x + w - pad) break;` `EconomyOverlay.js:1086`) — with enough colonies + stations the rest cannot be selected | `EconomyOverlay.js:1080-1090` | K4 (list replaces the chips) |
| **733** | ⚪ | **Economy tile alert and Budget disagree on «net»**: the nav alert uses trade + tax − fleet upkeep (`NavPeekProviders.js:33-36`), Budget subtracts labor and unit upkeep too (`EconomyOverlay.js:2974`) — the tile can stay calm while Budget shows a deficit | files as listed | mechanics/UI (owner: K3 or separate) |
| **734** | ⚪ | **Dead and dormant tab code** (do not reskin): `FleetTabPanel.js` 2678 + `FleetPanel.js` 474 (zero importers outside tests); Command flag-OFF map ~1200 LOC + `_drawLeftFleets`; EconomyOverlay priority/manual modes ~700 LOC; ColonyOverlay V1 workforce + `_stationMode`; `UIManager._drawCivPanel` never called, so `CIV_TABS[].key` hints are stale data (Civ `V`, Dyson `D`, Diplomacy `Y`, Trade `H`, Colonies `C`); PopulationOverlay unreachable | agents' call-site greps; `UIManager.js:2663` | D-K-18 (refactor before each K step) |
| **735** | 🟠 | **War screen ships two debug actions to the player, unconditionally**: «⚡ WYMUŚ STARCIE (debug)» → `warSystem.forceBattle` and «🪖 WYMUŚ DESANT (debug — pomija bitwę kosmiczną)» are drawn and clickable for every active war (`WarOverlay.js:380-386`, `:707`; i18n `warOverlay.btnForceBattle/btnForceInvasion`) — a cheat in the player UI | `shots_now/*/32_war.jpg`; files as listed | K2 (owner: hide behind a debug flag or `KOSMOS.debug.*`) |

## 6. Proposed cut, decisions, effort

### 6.1 Steps (each: one `FEATURES.console<X>` flag, OFF = today bit for bit; light UI loop = contact sheet on 5 themes +
owner look + tune; one `feat` commit + `docs` close-out; sized for one CC session — split where marked)

| Step | Scope | Sessions |
|---|---|---|
| **K0a** | Console kit: `ConsoleLayoutLogic` (pure, keepers), frame/header/list/eyebrow/kv/bar/instrument/chip/strip drawing on roles; opaque console background + composer skip under consoles (D-K-5) behind `FEATURES.consoleKit`; contact-sheet probe from this phase reused | 1 |
| **K0b** | Template on the cheapest screen — **Intel** (413 LOC, read-only, no actions; its empire list is reused by Diplomacy) — D-K-6 | 1 |
| **K1a** | `ShipHologramRenderer`: offscreen WebGLRenderer, hologram material (roles, theme epoch), edges outline, silhouette fallback, budget + context-loss; GLSL compile probe with failing control; composite cost measured | 1 |
| **K1b** | Anchors: format + loader + computed defaults; Model Workshop «anchors» mode (owner places) | 1 |
| **K1c** | Shipyard console: L design library + hull picker · H hologram + module markers on anchors · I module picker, stats with deltas, BUILD/SAVE/CLEAR · S slipway (builds + surge, pending, reserve) · gates as header banner; U key → Shipyard designer (D-K-12); 723, 726 | 1–2 |
| **K2** | Diplomacy (shared empire list) + War; 724, 727, 735 | 1–2 |
| **K3** | Economy frame (drop left inventory, D-K-16) + Budget + Flows + Trade (D-K-15); dead code removed first | 1–2 |
| **K4** | Production (largest Economy page); 732 | 1–2 |
| **K5** | Civilization + Dyson (Dyson hero diagram is new) | 1–2 |
| **K6a / K6b** | Colonies: frame, colony list, buildings strip under the hero / inspector rule (D-K-13), globe placement | 2–3 |
| **K7a / K7b / K7c** | Command: frame + registry + timeline strip (D-K-14) / inspector reskin with T5 shared handlers + golden trace re-record / Atlas, Logistics, Ground | 3 |
| **KZ** | Flags permanent ON, OFF paths and old styles removed (`_drawButton`, `GLASS_BORDER` subnav, per-file `✕`), before/after frame comparison | 1–2 |

Total ≈ 16–22 sessions. Order rationale: K0 proves the kit on the cheapest read-only screen; K1 is the owner's pilot and
the only new rendering tech; then cheap screens that reuse the empire list (K2), then the Economy family (high player
value, mid effort), then the two biggest files (Colonies, Command) once the kit has stabilised.

### 6.2 Decisions for the owner (recommendation first)

**✅ SIGNED by the owner 2026-11-16 — D-K-5 … D-K-20 all as recommended (option (a) each), with one amendment:**
- **D-K-16 (a) is conditional:** the Economy left inventory column may be dropped **only if** the top resource drawer
  shows every resource **and** every goods line that the column shows today; anything missing moves to an inspector
  block in K3 instead of disappearing. Verified in K3, not before.

- **D-K-5 Console background and the scene behind it.** (a) **Opaque `bgPrimary` + skip the main composer pass while a
  console is open** (ticks keep running; saves the measured 5.3 ms/frame; Observatory exempt) · (b) opaque, keep
  rendering · (c) keep translucent. **Rec (a)**, flagged with K0a.
  **⚖ AMENDED by the owner at the K0a gate (2026-11-16):** no separate opaque window — the world stays visible and
  **moving** behind every console: **live** scene (keeps rendering; the ~5.5 ms/frame is accepted for the moving
  background), **sharp, only dimmed** — CSS filter on the main WebGL canvas `brightness(0.4)`, **no blur, no scrim**
  (`blur 0`, `sat 1`, `scrim 0`, no per-screen scrim override). Observatory unchanged (no filter). The full «no separate
  window» feel arrives as each screen drops its filled panels in its own K step. Modes **glass** (scene frozen after one
  fresh frame, composer skipped, ticks keep running) and **opaque** stay as debug modes (`KOSMOS.debug.consoleKit.glass()`
  / `.opaque()`) — **candidates for a future performance setting for weaker GPUs**; no settings UI now.
- **D-K-6 First screen for K0.** (a) **Intel** · (b) Dyson (few actions, needs a new hero diagram) · (c) Budget (shared
  Economy frame is heavier). **Rec (a)**.
- **D-K-7 Hologram render path.** (a) **dedicated offscreen WebGLRenderer → `drawImage` into the hero rect** · (b) DOM
  canvas layer like the globe (cheaper composite, covers chrome, z-order risk) · (c) RTT in the main renderer.
  **Rec (a)**; K1a measures the composite alone.
- **D-K-8 Anchor granularity.** (a) **≤ 6 role anchors per model** (drive, weapons, defence, hold, mission, habitat),
  modules stacked per anchor · (b) one anchor per slot (up to 9 — breaks «3–6»). **Rec (a)**.
- **D-K-9 Anchor file location.** (a) **sibling folder `assets/models/ships/anchors/<slot>.json`** (strict hardpoint
  schema untouched) · (b) `anchors` key in `hardpoints/<slot>.json` (schema v2, combat keepers touched) ·
  (c) `src/data/ShipAnchorsData.js`. **Rec (a)**.
- **D-K-10 Model in the designer for civil hulls.** (a) **follow `VesselModelResolver` live** (fitting a habitat or warp
  tank swaps the model — visible feedback) · (b) one fixed representative model per hull. **Rec (a)**.
- **D-K-11 Fallback trigger.** (a) **silhouette when WebGL context creation fails / is lost or the hologram frame
  budget (e.g. > 4 ms median) is exceeded; plus an owner toggle for testing** · (b) silhouette always (no hologram).
  **Rec (a)**.
- **D-K-12 Ship designer home.** (a) **Shipyard console owns ship design; U opens the Shipyard designer**
  (GroundUnitPanel stays in Command → Ground and Colonies draft) · (b) keep the U screen as is. **Rec (a)**.
- **D-K-13 Colonies inspector rule.** (a) **selection (hex / stack / unit) shows as a pane on top of the inspector,
  Esc returns to the colony tabs** · (b) selection stays floating over the hero (today) · (c) selection replaces the
  tab content. **Rec (a)**.
- **D-K-14 Command registry layout.** (a) **3-zone variant: wide list + inspector + timeline strip, no hero** ·
  (b) promote the timeline to hero. Plus: the dormant flag-OFF 2D map is removed, not reskinned. **Rec (a)**.
- **D-K-15 Trade's second tab level.** (a) **Handel and Rynek become two header chips of the Economy group** (one
  level) · (b) keep a second chip row inside Trade. **Rec (a)**.
- **D-K-16 Economy left inventory column.** (a) **drop it** (top resource drawer carries it, D-K-3) · (b) keep it as a
  collapsible inspector block. **Rec (a)**. **Signed (a), conditional** — see the amendment above (drawer must carry
  every resource and goods line; anything missing → K3 inspector block).
- **D-K-17 CombatStrip over consoles.** (a) **keep it drawn over consoles, in a reserved header-right slot** ·
  (b) hide it while a console is open. **Rec (a)**.
- **D-K-18 Dead code.** (a) **one `refactor(K-pre)` commit removing the dead code of a screen before its K step**
  (Finding 734) · (b) leave it. **Rec (a)**.
- **D-K-19 Big numeric instrument size.** (a) **new `THEME` size token used only by consoles (≈ 2× fontSizeLarge),
  digits through `layoutTabular`** · (b) reuse fontSizeLarge (16) — not «big». **Rec (a)**.
- **D-K-20 Flags.** (a) **one flag per screen family** (`consoleKit`, `consoleIntel`, `consoleShipyard`,
  `consoleDiplomacy`, `consoleEconomy`, `consoleProduction`, `consoleCivilization`, `consoleColony`, `consoleCommand`)
  · (b) one umbrella flag. **Rec (a)** — matches «each step one flag».

## 7. Contact sheet «state today»

`C:\Users\Komputer\kosmos-handover\consoles-phase-a\kontakt_now.html` (relative paths into `shots_now/<theme>/`):
33 frames per full theme (Amber Noir, Neon Cyber — every tab and sub-page incl. Colonies info tabs + hex selection,
Command 4 sub-pages + vessel inspector, Trade Rynek, Observatory catalog/threats) and the Shipyard (7 states:
status/designs, pending/reserve, designer without hull, hull selected, module picker, loaded design + stats, propulsion
picker) + Production (GLOBAL and one colony) in all 5 themes; each frame captioned with the measured outliner state
(D-K-2). Probe: `probes/sheet.mjs`; scout + cost: `probes/scout.mjs`; hologram prototype: `probes/holo.mjs`.

## 8. K0a — delivered (console kit + scene behind consoles)

**Commit `8a820d2` feat(K0a)** · flag `FEATURES.consoleKit` (ON; OFF = pre-K0a bit for bit) · owner PASS 2026-11-16 after
two tuning rounds (handover `C:\Users\Komputer\kosmos-handover\consoles-k0a\`: `STOP_K0a.md`, `kontakt_k0a.html`,
`probes/{k0a,modes,modes_damage,specimen,live_check}.mjs`, specimen page in the clone `E:\kosmos-work\consoles-k0a\after`).

- **`ConsoleLayoutLogic`** (pure): `consoleZones(bounds, spec)` → header / title / close / combatSlot (D-K-17) / list / hero /
  inspector / strip, variants 4-zone and 3-zone, strip optional; zones under the clock/bell cluster end above it
  (`consoleClockRect`, Finding 727); `uiViewport(innerW, innerH)` = the single UI-scale rule for kit screens (no
  `window.inner*` in their input handlers); `CONSOLE_SCREEN_SPECS` per screen (empty after the gate); `insetRect`, `zoneAt`,
  `zonesOverlap`; knobs `KOSMOS.debug.consoleKit.tuneLayout({...})`.
- **`ConsoleKit`** (drawing, roles only — zero colour literals, pinned): zone frame with corner brackets **only on the hero
  zone and on selected items / cards** (owner tuning 1); other zones = `drawZoneRule` (1 px dim top rule + label); header with
  `[ chips ]` and `[ x ]`; list (selection = underline + small brackets, hover .18, clip, 2 px scrollbar, `revealScroll`);
  eyebrow; key–value rows; 2 px bars; big instrument (`THEME.fontSizeInstrument` = 2 × fontSizeLarge in every preset, D-K-19;
  digits through `layoutTabular`); action chips normal / hover / disabled / off / danger; queue cards; timeline lanes;
  `bracketCornersRect` added to `HudAttentionLogic`. Knobs `tuneKit({...})`. Stepper and canvas tooltip (§3) not built yet.
- **D-K-5 (amended, §6.2)**: `ConsoleSceneLogic` decides per frame for UIManager and ThreeRenderer from one predicate
  (`consoleSceneActive`: nav-group members + U, Observatory exempt, side panels excluded, internal close honoured);
  `consoleBackdrop` mode table (live renders + filter; glass filter + skip after one fresh frame; opaque skip, full cover).
  The renderer writes the canvas `style.filter` only on change (flag OFF never touches the DOM) and removes it on close;
  `#hud-canvas` was already cleared under any overlay (`hudGate` → `overlay`, now pinned). Defaults: mode **live**,
  `brightness(0.4)`, blur 0, sat 1, scrim 0. Debug API (quote-free): `KOSMOS.debug.consoleKit.scene()` (rendered / skipped /
  skipping / mode / filter), `.live()`, `.glass()`, `.opaque()`, `.tune.blur / .bright / .sat / .scrim / .fadeMs = <number>`,
  `.on()`, `.off()`, `.reset()`.
- **Measured** (1600×1041, ZF120, RTX 3070; scene = composer render with GPU sync; GPU process = Chrome trace CrGpuMain +
  VizCompositorThread, includes CSS filter compositing): map 5.39 ms scene / 8.14 + 0.44 ms GPU process per frame; under
  Civilization / Production — live 5.84 / 5.69 ms scene, 9.21 / 8.84 ms GPU; glass and opaque 0 renders, ≈ 0.02 ms GPU with
  a static UI. Worst case (UI redrawn every frame), Production: glass 4.00, live 14.17, opaque 3.61 ms GPU — the filter
  costs ≈ 0.4 ms GPU + 0.2 ms Viz over opaque. Ticks keep running when the composer is skipped (loop frames and star breath
  phase equal to the map); first frame after close is fresh (mean luminance 1.29 = map, 1 loop frame after close). Live
  defaults re-checked on the engine after the gate (mode live, filter `brightness(0.4)`, scene rendering under Production,
  Observatory unfiltered).
- **Keepers**: `console_layout_smoke` 33/0, `console_scene_smoke` 46/0, `console_kit_smoke` 25/0 — fail-first on a
  `git worktree` at `36e20f7`: red except the named controls / witnesses. Sweep 409/409, `check-i18n` PASS (no new labels).
- **Deviations**: the combat strip is not moved into its header slot yet (slot reserved; first kit screen moves it); the
  reel recorder (F10) captures no frames while the composer is skipped (glass / opaque only); `tune.scrim` is the default
  scrim — a per-screen `scrimAlpha` in `CONSOLE_SCREEN_SPECS` would override it.
