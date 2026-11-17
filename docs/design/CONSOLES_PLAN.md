# CONSOLES — visual reform of the full-screen tabs (plan and findings registry)

Status: **Phase A closed; K0a delivered (`8a820d2`, owner PASS 2026-11-16 — §8); K0b delivered (`c36ac18` + `b4b71a4`,
owner PASS 2026-11-16 — §9); K1a delivered (`3f41ba3`, owner OK 2026-11-16 after one look round — §10); K1b delivered (`574ee3f`, owner PASS
2026-11-16 after three review rounds — §11); K1c-A delivered (`301b66b`, owner PASS 2026-11-16 — §12); K1c-B delivered (`eb59908`, owner PASS
2026-11-16 — §13) — **Shipyard console DONE**; K2 delivered (`1685293` + `1f6c960`, owner PASS 2026-11-16 — §15) — **Diplomacy group DONE**; K3 delivered (`79c8ba3` + `a75a402` +
`bd72f73`, owner PASS 2026-11-17 — §16); K4 delivered (`886b659`, owner PASS 2026-11-17 — §17) — **Economy group DONE**; KZ-E delivered (`f47b0b8` — §18); K5 delivered (`3678990` fix(743) + `e3af2db`, owner PASS 2026-11-17 — §19) — **Civilization group DONE**; K6 moved out of this arc (§16, owner 2026-11-17).** Phase A
(read-only audit) delivered 2026-11-16; decisions D-K-5…D-K-20 signed by the owner 2026-11-16 (§6.2; D-K-5 amended at
the K0a gate). Register: findings #723–#749 filed; **next free finding number: 750**.
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

**Civilization.** **Signed hero table (owner, project design doc, copied here at K5):** L = Imperium · Frakcje · Historia ·
H = leader portrait + emblem + 4 big numbers · I = factions, bonuses · S = history timeline with repeats grouped. Delivered in K5
(§19); the colony table moved into the list (Imperium section) and into the empire overview inspector («Kolonie i placówki»).
(Phase A proposal, superseded: L = colony table, H = portrait + faction slider, S = 4 summary cards, History as ∅.)
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

This plan files **#723–#737** (Phase A), **#738–#741** (K3, §16), **#742** (K4, §17), **#743–#744** (K5, §19) **#745–#746** (K7-A, §20) and **#747–#749** (K7-B, §22). **Next free finding number: 750.**

| # | Status | Finding | Evidence | Step |
|---|---|---|---|---|
| **723** | ✅ K1c-A | **The Shipyard ignores the 4-zone idea entirely**: one centred 560 px column (`ShipyardOverlay.js:82`) with build list, reserve and the ship designer stacked in one scroll; the designer (hull picker, slots, module picker, stats, SAVE) is reachable only by scrolling past the reserve, and its pinned action bar floats at the bottom of an otherwise empty screen | `shots_now/*/2x_shipyard_*.jpg`; `ShipyardOverlay.js:91-154` | K1 |
| **724** | ✅ K2 | **Diplomacy shows raw engine ids**: the AI stance prints `fsm.state` (`NEGOTIATING`, `IDLE`…) verbatim and the relation memory prints event keys (`research_intrusion`, `peace_offered`) | `DiplomacyOverlay.js:266-270`; `shots_now/amber_noir/30_diplomacy.jpg` | K2 |
| **725** | ✅ (Intel part K0b; War part K2; Budget + Trade parts K3; Production part K4 — fully closed) | **Hard-coded literals bypassing i18n on tab screens**: Intel `(wymaga skanu naziemnego)` `:333`, `Ostatnie incydenty` ~`:346`, `(brak)` ~`:356`; Production demand headers `Źródło/Towar/Potrzeba` `EconomyOverlay.js:1774-1776`; Trade `Kr/rok` `:603` and local prices shown as raw resource ids `:696/:706`; War heading `Casus Belli`; Budget tax-effect labels inline PL/EN `:3105` | files as listed | the step that touches each screen |
| **726** | ⚪ (console part ✅ K1c-A; U screen → K1c-B) | **Module picker shows raw keys for two module groups**: `UnitDesignOverlay` category labels are a local PL/EN map (`:37-68`) with no `shield` / `troop` entries → those groups render their raw slotType with no icon (`catLabel ?? cat`, `:436-439`) | `UnitDesignOverlay.js:37-68, 436-439` | K1 |
| **727** | ✅ K2 | **Diplomacy action band collides with the clock cluster**: the bottom-right action button («Zaproponuj sojusz») sits under the always-on clock/bell cluster drawn over every tab | `shots_now/amber_noir/30_diplomacy.jpg` | K2 (console frame reserves the clock rect) |
| **728** | ⚪ | **Medium and Large cargo hulls show the same model**: `nonwarp_medium_cargo.glb` ≡ `nonwarp_large_cargo.glb` (identical md5 `43be8bba…`); also `cargo3d.glb` ≡ `default.glb` (unused) | `md5sum assets/models/ships/*.glb` | art / model pipeline (no step) |
| **729** | ⚪ | **15 building/icon textures referenced but absent from `assets/`** (404 in the live game): e.g. `assets/buildings/{geothermal,synthesized_food_plant,terraformer,orbital_mine,ai_core,…}.png`, `assets/icons/building_autonomous_spaceport.png` | probe server `notFound` list (`shots/scout_amber/scout.json`); `ls` in the repo | art (no step) |
| **730** | 🟠 | **The full 3D system scene renders at 60 fps under every tab** — 5.3 ms GPU-synced per frame at 1600×1041, the same as on the map — even under the opaque Command (`#000`) and the .92 Colonies background; under the other ten screens (`bgAlpha .38–.40`) the orbits and the star bleed through the text | `probes/scout.mjs` (180 renders / 3 s map vs tabs), `probes/holo.mjs` (`mainScene.syncMsPerFrame`); `ThreeRenderer._startLoop :4431-4563` | K0 (D-K-5) |
| **731** | ⚪ | **Observatory has no close control** (DOM overlay — no `✕` in its header; close only by key / Esc / nav tile), and `NavEdgeShim` still lists `tech` among DOM overlays (`NavEdgeShim.js:16`; Tech is canvas) | `ObservatoryOverlay.js` (no close), `NavEdgeShim.js:16` | Science arc |
| **732** | ✅ K4 (console path; the flag-OFF chips stay until KZ) | **Production colony chips silently drop colonies that do not fit** (`if (cx + cw > x + w - pad) break;` `EconomyOverlay.js:1086`) — with enough colonies + stations the rest cannot be selected | `EconomyOverlay.js:1080-1090` | K4 (list replaces the chips) |
| **733** | ⚪ | **Economy tile alert and Budget disagree on «net»**: the nav alert uses trade + tax − fleet upkeep (`NavPeekProviders.js:33-36`), Budget subtracts labor and unit upkeep too (`EconomyOverlay.js:2974`) — the tile can stay calm while Budget shows a deficit | files as listed | mechanics/UI (owner: K3 or separate) |
| **734** | ⚪ | **Dead and dormant tab code** (do not reskin): `FleetTabPanel.js` 2678 + `FleetPanel.js` 474 (zero importers outside tests); Command flag-OFF map ~1200 LOC + `_drawLeftFleets`; EconomyOverlay priority/manual modes ~700 LOC; ColonyOverlay V1 workforce + `_stationMode`; `UIManager._drawCivPanel` never called, so `CIV_TABS[].key` hints are stale data (Civ `V`, Dyson `D`, Diplomacy `Y`, Trade `H`, Colonies `C`); PopulationOverlay unreachable | agents' call-site greps; `UIManager.js:2663` | D-K-18 (refactor before each K step) |
| **736** | ⚪ | **Combat strip overflows its console header slot with 2–3 simultaneous battles**: one battle line (21 px) fits the 30 px header slot (D-K-17), but each extra battle adds a line (`MAX_LINES` 3, `stripLayout`), so the block grows below the header over the top of the inspector | `combatSlotInsets` (`CombatStripLogic.js`), `stripLayout`; K0b review (not staged) | later (owner: collapse to one «⚔ N ▼» chip in the slot) |
| **737** | ✅ K1b | **Normalizer keeper N11f classified slots by the Workshop stamp, not by the nozzle**: every Workshop save stamps `notes` (turrets only too), so after the owner clicked turrets on the five remaining warships all six slots carried the stamp and the equality witness (`nozMeasured ≥ 1`) emptied while every nozzle was correct. Fix: classify by the nozzle — a nozzle equal to the measurement always counts as equality; the aft-half rule applies only to a nozzle moved in the Workshop; unstamped and not equal is still an error; the control takes the first stamped slot. Red on a moved nozzle without the stamp | `cv_normalizer_logic_smoke.mjs` N11f (56/1 → 57/0 on the owner's files; 57/0 on the base files) | K1b |
| **735** | ✅ K2 (console path; flag-OFF screen keeps the buttons until KZ) | **War screen ships two debug actions to the player, unconditionally**: «⚡ WYMUŚ STARCIE (debug)» → `warSystem.forceBattle` and «🪖 WYMUŚ DESANT (debug — pomija bitwę kosmiczną)» are drawn and clickable for every active war (`WarOverlay.js:380-386`, `:707`; i18n `warOverlay.btnForceBattle/btnForceInvasion`) — a cheat in the player UI | `shots_now/*/32_war.jpg`; files as listed | K2 (owner: hide behind a debug flag or `KOSMOS.debug.*`) |
| **738** | ✅ K3 (console path) | **Flows list balance disagreed with the hero**: the list summed `_producers` only (no mine output, no factory input) while the hero/inspector use `_gatherFlowBreakdown` → e.g. Fe list −1.0 vs hero −116 | `EconomyOverlay._drawFlows` list; K3-A `flowListItems` | K3 — list row = `flowDiagram(_gatherFlowBreakdown(id)).net` over `flowCandidateIds`; flag-OFF list unchanged until KZ |
| **739** | ✅ KZ-E (closed by removal — the flag-OFF Budget page and both keys are gone) | **Today's Budget prints «Kr//rok»** (`Kr/${t('tradePanel.perYear')}` with perYear = '/rok'; the console uses `econ.console.krPerYear`); `econPanel.stationLabel` has no `{0}`, so the station name is never shown in today's column header | `EconomyOverlay.js` Budget lines; `pl.js`/`en.js` `econPanel.stationLabel` | KZ (flag-OFF path removed) |
| **740** | ⚪ | **Founding an outpost switches the global active colony to it**: `outpost:founded` → `GameScene` calls `switchActiveColony(outpost)`, so the top bar shows the outpost's zeros and today's Trade page refuses orders («is_outpost») until the player re-selects a full colony | `GameScene.js` `outpost:founded` listener; `ColonyManager.switchActiveColony` | later UX fix (outside this arc); the Trade console is immune (Trade-local context, §16) |
| **741** | ⚪ | **AI partner colonies may hold 0 Kr, so SELL on Rynek can be dead**: settlement needs `aiCol.credits ≥ total`; on GATE-S4 the partner colony shows 0 Kr — check whether AI colony credits ever accumulate | `TradeOrderBoard._settle`; AI colony `credits` | audit later (economy) |
| **742** | ✅ K4 (console path) · KZ-E (the flag-OFF payload without `colonyId` is gone) | **Production export toggles changed the wrong colony**: today's [ Przyjmuj ] and tier chips emit `factory:setExportEnabled` / `setExportTier` without a colony, and `FactorySystem` applies them to the ACTIVE colony (`window.KOSMOS.factorySystem === this`) while the page shows the colony picked in the filter — a click on another colony's prefs silently changed the active colony's | `EconomyOverlay._handleFactoryBtn` export cases; `FactorySystem` listeners | K4 — the console sends `colonyId`; the listener honours it (`exportTarget`), no `colonyId` = today's behaviour |
| **743** | ✅ K5 (`3678990`) | **Dyson 3D stage and rings lost after loading a save**: `DysonSystem.restore` never emitted `dyson:visualStageChanged` and `ThreeRenderer.switchSystem` (`_disposeAllMeshes`) zeroed `_dysonStage` — measured: stage 1 + rings before save, stage 0 and no rings after load | live probe K5 (`k5.json` `dysonBeforeSave` / `dysonAfterLoad`); `DysonSystem.restore`, `ThreeRenderer._disposeAllMeshes` | K5 — `dysonViewStage` + `ThreeRenderer._restoreDysonStage()` after restore, after `switchSystem` and on segment completion; rings only around the home star |
| **745** | ⚪ (console path ✅ K7-A; OFF until KZ) | **Today's registry timeline labels lanes by table index**: `_drawTimelinePanel` names lane *i* after `rows[i]`, but `buildTimelineRows` skips wrecks and contacts — with wrecks shown a ship's mission bar sits next to another name (executed: Bravo's recon bar labelled «Aaa wrak») | `FleetManagerOverlay._drawTimelinePanel`; `FleetPictureLogic.buildTimelineRows` | K7-A (console labels by `entryId`) |
| **746** | ✅ `44dd164` | **Camera following a ship on full-system recon goes to where the recon started** (owner: outliner double-click on an exploration ship in another system): `_startForeignRecon` sets `in_transit` without `vessel:launched`, so the start body's orbit stays in `OrbitalSpaceSystem`; `_tickOrbitingVessels` (on `physics:updated`, right before `_updateCameraFocus`) put the sprite on that orbit every tick → camera goal 0.17 u from the start body, ship 17–43 u away. Same root cause as part of the «POKAŻ» unreliability | live probe `reconrun` (ship in `sys_059`, time running); `ThreeRenderer._tickOrbitingVessels`, `VesselManager._startForeignRecon` | fixed at the reader: in-flight vessels skip the orbit loop (after: goal 0.02–0.08 u from the ship) |
| **747** | ✅ K7-B `0eab554` (console path; flag-OFF screen keeps the gap until KZ) | **Fleet disband and „new fleet” unreachable in the live Command since stage 3g**: the only producer of the `fleetCreate` / `fleetDisband` zones was the dormant left list of the 2D map (removed in K7-pre); `_drawRightFleet` had rename / doctrine / retreat / orders but no disband. Fix: the list zone's „Floty” section gets `[ + NOWA FLOTA ]` (`fleetCreate` → `_handleCreateFleet`), the fleet inspector `[ ROZWIĄŻ FLOTĘ ]` (`fleetDisband` → `_handleDisbandFleet`, today's ConfirmModal); creating via bulk assign stays. Keeper `console_inspector_smoke` K (red on `407607d`). |
| **748** | ⚪ | **Logistics-pool toggle unreachable on today's ship panel when the ship has no mission actions**: `_drawActions` returns early on an empty `getAvailableActions` list (in flight), so the pool toggle — membership is permanent, not dock-bound — is not drawn; scrap and refuel likewise. The console inspector keeps parity for the pool (no zone) and shows scrap / refuel as disabled chips with a reason. |
| **749** | ✅ `29b7e7d` | **Ship rename input started with the label „Zmień nazwę statku”, not the ship's name**: `_renameVessel` passed `t('fleetPanel.rename')` as the initial value. Now the ship's current name (selected on open); the label only when the ship is gone. Keeper `rename_vessel_prefill_smoke` (red on `407607d`). |
| **744** | ⚪ | **Dead leader trait `dysonProgress`**: Viktor Havel-Osei's bonus «Sfera Dysona ×3 szybciej» (`LeaderData.js:193`) is shown to the player but `DysonSystem.getDysonProgressMultiplier()` is read nowhere | `grep dysonProgress src` | later — with the new endgame design (owner 2026-11-17: Dyson's future decided there) |

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
| ~~**K6a / K6b**~~ | ~~Colonies: frame, colony list, buildings strip under the hero / inspector rule (D-K-13), globe placement~~ — **moved out of this arc** (owner decision 2026-11-17) into its own arc «planet/body screen»; the Colonies tab keeps today's look and KZ does not touch it | — |
| **K7a / K7b / K7c** | Command: frame + registry + timeline strip (D-K-14) / inspector reskin with T5 shared handlers + golden trace re-record / Atlas, Logistics, Ground — **DONE (§20–§23)** | 3 |
| ↳ **K7 split (2026-11-17)** | Inventory: 4 pages (registry; Ground = GroundUnitPanel, 3 hosts; Atlas; Logistics), own tab bar (no subnav), ~110 hit-zone types (registry 15, inspector ~70, Logistics 20, Atlas 3, `close`/`tab`), DOM inputs (registry search, Logistics qty — both `window.inner*`; rename/disband dialogs), risks: golden trace T4 (inspector), T5 dispatch into `_handleHit`/`_missionConfig`, ~40 keepers construct the overlay, dormant 2D map. **K7-A** = header chips replace the tab bar + registry page (list = search / grouping / fleets / filters with counts, hero = ship table, inspector = today's panel in the inspector zone + multi-selection summary, strip = mission timeline for the selection); Ground / Atlas / Logistics stay today's pages under the chips · **K7-pre** (D-K-18, owner to confirm) = remove the dormant 2D map + `_drawLeftFleets` · **K7-B** = inspector reskin + golden trace re-record + rename input from `consoleZones` · **K7-C** = Atlas, Logistics (qty input from `consoleZones`), Ground on the console. Each ends at an owner gate. | — |
| **KZ** | Flags permanent ON, OFF paths and old styles removed (`_drawButton`, `GLASS_BORDER` subnav, per-file `✕`), before/after frame comparison — **Economy group done early as KZ-E (§18)**; the rest at the end of the arc | 1–2 |

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

## 9. K0b — delivered (Intel on the console template)

**Commits `c36ac18` refactor(K-pre Intel)** (D-K-18: IntelOverlay's two empty `EventBus.on` listeners + import removed) **and
`b4b71a4` feat(K0b)** · flag `FEATURES.consoleIntel` (ON; works only together with `consoleKit` — `isKitScreen`; OFF = today's
Intel) · owner PASS 2026-11-16 after one review round (handover `C:\Users\Komputer\kosmos-handover\consoles-k0b\`: `STOP_K0b.md`,
`kontakt_k0b.html`, `probes/{k0b,toggle_check}.mjs`, `shots/{before,after,after_1280,after_r2}`; trees outside the repo in
`E:\kosmos-work\consoles-k0b\{before,after}`).

- **Template**: header WYWIAD/INTEL + group chips `[ DYPLOMACJA ] [ WYWIAD ] [ WOJNY ]` (click = `openPanel`, like the subnav) +
  `[ x ]`. `ConsoleLayoutLogic.CONSOLE_KIT_SCREENS` / `isKitScreen(id, features)` gate `CivPanelDrawer.drawSubNav` / `hitTestSubNav` /
  `getSubNavHeight` — no 24 px strip over a kit screen (Diplomacy and War keep it until K2). Hit zones keep today's types
  (`close`, `select_empire`) plus `tab`; geometry only from `consoleZones` (wheel handler reads the last frame's zones).
- **D-K-17 (deferred from K0a)**: `UIManager._combatStripInsets` seats the combat strip in `zones.combatSlot` on kit screens only
  (`CombatStripLogic.combatSlotInsets`); map and other screens unchanged. **Slot 280 → 520 px** (approved deviation 1: the line
  with [ Reżyser ] [ Obserwuj ] [ ▼ ] is ≈ 510 px). 2–3 battles overflow the slot → **Finding 736**.
- **Shared empire list** (for K2 Diplomacy): `EmpireListLogic` (rank, mask, `empireRowView`, sort, default selection,
  `intelDossier` — every foreign field behind today's gates, `pairFractions`, `systemMapPoints`, `fitMapPoints`) +
  `ConsoleEmpireList` (two-line rows on `ConsoleKit.drawList`, which gains `rowH` / `renderRow`, backward compatible).
- **Hero**: dossier (name, archetype + description, 4 intel steps), balance of power as YOU | THEM pairs (combat strength,
  systems — theirs = length of today's known-systems list) with centre bars, verdict at `detailed` only, and (owner choice b)
  a **fog-safe mini-map**: only the dossier's known systems and the player's systems, galaxy x/y plane, theme roles.
  Own values are shown at every intel level (approved deviation 2 — not intel).
- **Inspector AKTA/FILE** (owner review): known systems (capital), armed / fleet limit, reserve, recent incidents; the hero's
  strength is not repeated and the full-width bar under «Jednostki bojowe» is gone.
- **Readability (owner choice C+A)**: console-only roles `ConsoleRolesLogic.consoleRoles` (dim mixed towards `textPrimary`,
  kit knob `DIM_LIFT` 0.35) and a theme-bg halo `applyConsoleHalo` (kit knob `HALO_BLUR` 2 px), both via
  `KOSMOS.debug.consoleKit.tuneKit({...})`; map and HUD roles unchanged.
- **Finding 725 (Intel part ✅)**: «(wymaga skanu naziemnego)», «Ostatnie incydenty», «(brak)» via `t()` (`intel.needsGroundScan`,
  `intel.recentIncidents`, `intel.none`) on both paths; PL text identical, EN now translated; i18n baseline IntelOverlay 2 → 0.
- **Keepers**: `console_intel_smoke` 39/0 — list logic, fog-of-war subset per level (new screen's text ⊆ today's on the same
  sentinel data; below `detailed` military numbers present in the record change neither text nor fills; a system outside the
  known list never drawn), chips, subnav gating, strip slot (method executed from its source), wheel without `window.inner*`,
  725, roles/halo/inspector/mini-map. Fail-first on a `git worktree` at `c36ac18`: 30 red, 9 green = named controls; three leak
  mutations (name at rumor, military at contact, whole galaxy into the mini-map) turn the fog pins red. K0a keepers green
  (kit 25/0, layout 33/0); sweep 410/410, `check-i18n` PASS.
- **Measured / viewed**: contact sheet 5 themes × (high intel, low intel, scrolled list, battle in the header slot), before/after
  pairs and a 1280×833 control in Amber Noir; no page errors. Owner A/B one-liners validated on the engine:
  `KOSMOS.debug.consoleKit.off()` → today's Intel, `.on()` → console.
- **Deviations / notes**: no strip zone on this screen (nothing natural); the scrolled-list frame used 24 synthetic intel records
  and the battle frame a synthetic encounter fed only to the strip instance (probe-only staging).
- **K0b-1 (`34f030c` fix, owner PASS 2026-11-16)** — mini-map readability, same flag: player capital diamond + name, empire
  capital only if known (fog) with a dashed distance line in ly; names via the galaxy label rule (capitals > own > theirs;
  approved deviation: ordinary labels only adjacent to the marker, capitals may move further; distance label padded); split-ring
  merge (both sets or < 10 px); auto-fit with 12 ly minimum span + scale bar. Keeper M1–M10 (49/0), fail-first 8 red / 1 control,
  3 leak mutations red; sweep 411/411; contact sheet `kosmos-handover/consoles-k0b1/kontakt_k0b1.html`.

## 10. K1a — delivered (ShipHologramRenderer) + inputs for K1c

**Commit `3f41ba3` feat(K1a)** · flag `FEATURES.shipHologram` (ON; OFF = no hologram, the debug viewer refuses, game bit for bit) ·
owner OK 2026-11-16 after one look round (handover `C:\Users\Komputer\kosmos-handover\consoles-k1a\`: `STOP_K1a.md`,
`kontakt_k1a.html`, `shots/{amber_noir,neon_cyber,r2_amber_noir}`, `probes/{k1a,k1a_r2,topdiag,oneliners,maskdbg,sheet}.mjs`;
probes served the repo tree read-only, Chrome profiles in `E:\kosmos-work\consoles-k1a\work`).

- **`ShipHologramRenderer`** (D-K-7 a): own offscreen `WebGLRenderer` created on first draw, released by `release()` (dispose +
  `forceContextLoss`, listeners removed); output `drawImage`d into the host's rect with `lighter` compositing. Renders only
  while the host draws **and** something changed or animates (spin, cross-fade); idle draws only composite the last frame.
  Every world dependency (THREE, context creation, canvases, loaders, clock, colour, theme epoch) is injected — the keeper
  executes the class under node on real three r171.
- **Models** (D-K-10 a): `designModelKey(hull, modules)` = the map rule (`resolveVesselModelKey`; warp axis from
  `calcShipStats().warpFuelCapacity`, civil role from modules); all 24 keys reachable from the designer. Templates from the
  ThreeRenderer cache (combat hulls `@1k` first — same mesh, smaller textures; `default.glb` only after both fail),
  hardpoint frame from `_shipHardpoints`. Main scene untouched: cloned meshes on read-only template geometry, matrices
  computed from position/quaternion/scale (no `updateMatrixWorld` on the template), own materials and edges.
  `setModel` swaps with a 220 ms cross-fade (snapshot of the last frame).
- **Look** (theme roles only): one `ShaderMaterial` per renderer (fresnel rim dominant, faint fill, screen-space scanlines,
  premultiplied additive; recoloured by uniform on theme epoch), depth pre-pass so the hull hides back edges and inner
  faces (`xray` knob), `EdgesGeometry` lines at low alpha. GLSL = plain quoted literals, per-object values by uniforms.
  3/4 view (slightly above, bow left) with slow spin; **plan = technical drawing**, side over top, two orthographic
  viewports framed by `technicalLayout` on the model's real extents.
- **Fallback silhouette** (D-K-11 a), Canvas 2D, no WebGL: projected fill + contour + crease edges, same layout, cached per
  model × theme epoch × edge angle × size. Triggers in priority order: forced > context failed > context lost (recovers on
  `webglcontextrestored`) > budget (median of 15 GPU samples > `budgetMs` after ≥ 8 samples; `EXT_disjoint_timer_query_webgl2`,
  else synchronous 1-px reads on the first 12 renders after a change and every 90th). Never throws.
- **Debug viewer** (quote-free, validated on the engine): `KOSMOS.debug.holo.open()` / `.next()` / `.prev()` / `.plan()` /
  `.spin()` / `.silhouette()` / `.info()` / `.reset()` / `.close()`; knobs `KOSMOS.debug.holo.tune.edgeAngle` (also
  `edgeAlpha`, `rim`, `scan`, `spin`, `budgetMs`, `xray`). Centred 900×640 logical rect (= 1125×800 px at UI scale 1.25);
  the open viewer counts as a console scene (`UIManager.isConsoleSceneActive`), so it sits on the live dimmed backdrop.
- **Owner defaults:** `edgeAngle` **30°**, edgeAlpha 0.22, rim 1.0, scan 0.22, spin 0.25 rad/s, budgetMs 4, `xray` 0.
- **Measured** (1600×1041, RTX 3070, ZF120, paused): hologram **0.12–0.20 ms GPU** per frame on all 24 models (timer query;
  battleship 29 k tris → 0.20); composite alone within noise (UI forced every frame: 3.92 ms CrGpuMain with the composite
  vs 4.00 without; `drawImage` CPU < 0.1 ms) — the Phase-A 2.3–5.8 ms was the forced readback; viewer open and idle:
  0 hologram renders, 0 UI draws (CrGpuMain 1.45 vs 1.33 map — noise); after `close()` 0 renders, context released;
  spinning 4.24 ms CrGpuMain vs 1.45 idle — almost all of it the full-UI redraw (→ K1c layer below). First load: GLB
  42–58 ms (≈ 0 when the map already holds the template) + edge build 5–48 ms.
- **GLSL compile probe** (Chrome, `probes/k1a.mjs`): hologram and line materials link; the control (`void mian()`) fails
  with «Fragment shader is not compiled».
- **Keepers:** `ship_hologram_smoke` **58/0** — key resolution incl. civil role swap, template materials / geometry /
  matrices byte-identical after use + `release` (zero `dispose` events), fallback triggers and priority, idle = no renders,
  release frees the context, GLSL literals, knobs / flag / UIManager hooks, technical layout + plan viewports + mask
  winding. Fail-first on a `git worktree` at `6a68570` (51-pin round-1 keeper): 28 red, 2 green = controls (module
  witnesses, fingerprint detects a material swap); mutations red: template `updateMatrixWorld` + `needsUpdate`, template
  geometry `dispose`, render while idle, winding not normalised (round 2). Sweep 411/411, `check-i18n` PASS (no player-facing
  strings).
- **Deviations (approved):** rect in UI units (larger than the Phase-A estimate — measurements conservative); extra `xray`
  knob; additive composite; cross-fade instead of an instant swap; in the debug viewer the map HUD layer stays (it is not a tab).

### 10.1 Owner look round 1 (2026-11-16) → inputs for K1c

Recorded at the owner's request before the close-out.

- **Defaults chosen by the owner:** `edgeAngle` **30°** (denser detail preferred over the noise), `xray` 0; rim 1.0, edgeAlpha 0.22,
  scan 0.22, spin 0.25 rad/s, budgetMs 4 kept.
- **Top-view diagnosis** (24 models, probe `topdiag.mjs`): not (a) the camera axis — every frame is bow ±X / up +Y and the side
  view is right; not (b) geometry islands — 1–4 connected components per model, main component 93–100 % of the triangles,
  0 components under 0.05 and 0 outside the main hull; partly (c) the framing — fixed 58/42 % bands and a scale that assumed
  |z| ≤ 0.3 let wide hulls (|z| 0.35, `nonwarp_small_science`, `nonwarp_small_cargo`) spill out of the top band. **Main cause:**
  `EdgesGeometry` draws crease edges only, so smooth curved hulls (the medium-cargo tanks) have no outline and the details on
  them float «outside the ship». Fix: the silhouette fills the projected triangles and draws the projection's contour
  (mask − erosion, canvas compositing; each triangle's winding normalised first — with front and back faces cancelling
  under nonzero the medium-cargo mask covered 965 px instead of the hull), the crease edges on top as detail; the frame
  comes from the model's real extents (band heights in the y : z ratio, shared scale, each view centred on its extent).
- **Plan view = technical drawing:** with the top view clean, `plan()` renders side + top stacked in the same layout as the
  silhouette (two orthographic viewports of one canvas; the fresnel rim draws the outline). **This view doubles as the
  Shipyard `[ PLAN ]` view in K1c.**
- **K1c — spin cost:** spinning forces a full `#ui-canvas` redraw every frame (≈ +2.8 ms CrGpuMain; the hologram itself
  ≈ 0.2 ms). K1c moves the hologram to a **dedicated canvas layer between the 3D scene canvas and `#ui-canvas`** (under the
  UI, never covers chrome; the UI leaves the hero rect transparent), so a spinning hologram never redraws the UI. Slow spin by
  default + **mouse-drag rotate**.
- **K1c — map showing through:** the owner saw the system map through the additive hologram in the debug viewer. In a real
  console `#hud-canvas` is cleared (map labels gone). If the dimmed scene still competes there, add an **optional extra local
  dim behind the hero rect only** (owner knob).

## 11. K1b — delivered (module anchors: data, loader, computed defaults, Model Workshop «anchors» mode)

**Commit `574ee3f` feat(K1b)** · no `FEATURES` flag: nothing changes for the player. The preview lives in the K1a debug viewer, which
refuses when `FEATURES.shipHologram` is false. Owner PASS 2026-11-16 after three review rounds (handover
`C:\Users\Komputer\kosmos-handover\consoles-k1b\`: `STOP_K1b.md`, `kontakt_k1b.html`, `shots/{amber_noir_r1, amber_noir,
amber_noir_r3, workshop}`, `probes/{k1b, workshop, sheet, montage}.mjs`. The probes served a `git worktree` copy outside the repo,
since removed; Chrome profiles are in `E:\kosmos-work\consoles-k1b\work`).

- **Data (D-K-8 a, D-K-9 a):** `assets/models/ships/anchors/<slot>.json` = `{ v:1, slot, anchors:[{ role, p }] }`, at most one anchor
  per role (`drive`, `weapons`, `defence`, `hold`, `mission`, `habitat`). Points use the hardpoints' normalised model space. The strict
  validator is `src/data/ShipAnchorsSchema.js`: an unknown key, unknown role, duplicate role, non-finite or out-of-space point, wrong
  version or wrong slot is an error. `hardpoints/<slot>.json` and `ShipHardpointsSchema` are unchanged (the strict schema still
  rejects an `anchors` key). Files are per model key (Finding 728: medium and large cargo share a GLB). A file holds only the roles the
  owner placed (decision 1); an empty list is valid.
- **Loader + computed defaults** (`src/renderer/ShipAnchors.js`): `anchorsFor(slot, ctx)` puts file roles over the defaults and never
  throws; a missing, invalid or foreign-slot file falls back to defaults only. `ShipAnchorsCache` validates once and shares parallel
  requests. Defaults are deterministic and computed, never stored:
  - **drive** = nozzle hardpoint centre, never snapped (round 3);
  - **weapons** = turret centroid W1…Wn when the model has turrets, else the bbox rule (round 2). On battleships with 14–22 turrets the
    anchor lands midship; K1c lists all weapons on that one label;
  - **the rest** follow the bbox along the bow axis from the file frame, all on the side the 3/4 camera sees: hold midship dorsal,
    mission 0.2 towards the bow on the upper starboard flank (round 3), defence midship starboard, habitat aft dorsal (left bbox-based;
    the owner places it on colony models);
  - **hull snap:** every default except drive moves to the closest point of the hull mesh (`closestPointOnMesh`, Ericson 5.1.5). The
    game uses `modelNormTriangles` and the Workshop `templateNormTriangles`, with the same meshes, matrices and bbox, so Workshop
    defaults equal game defaults.
- **Module → role** (`moduleAnchorRole`, by `slotType`): propulsion → drive · weapon → weapons · armor, shield → defence · cargo, fuel
  (incl. warp tank) → hold · science, special, troop → mission · habitat → habitat. All 35 modules are mapped. `groupModulesByRole`
  feeds K1c's stacked labels.
- **Model Workshop mode 6 «Kotwice modułów»:** role picker with placed / default state, ghost markers for defaults, click on the hull
  places the selected role, click on a marker selects it, drag moves it, R resets it to the default. Undo history is shared with the
  hardpoint edits. **Zapisz kotwice** writes through File System Access to a separately remembered folder (`anchors/`, or `ships/` with
  `anchors/` created); there is a download fallback. The hardpoints document, its signature and its save path ignore the anchors
  field. All existing modes are unchanged.
- **Preview** (`KOSMOS.debug.holo.anchors()` toggles, `KOSMOS.debug.holo.anchorsInfo()`, both quote-free and checked on the engine):
  - each anchor shows a marker, a leader line and an uppercase role label (`shipAnchor.*`, PL/EN). Labels point outward, never
    overlap on one side and stay inside the hero rect (`ShipAnchorOverlayLogic`);
  - projection `ShipHologramRenderer.projectPoints` uses the pose of the last frame (3/4 spin; plan and silhouette = technical drawing,
    labels on the side view only);
  - anchors load lazily (no requests from the hologram alone), and snapped defaults are computed once per model;
  - colour is the theme `primary` role: file anchors full and solid, defaults at 0.5 alpha and dashed (decision 2 — `dim` vanished on
    Amber Noir).
- **Owner's Workshop pass (in the commit):** turrets on nonwarp_frigate 2, nonwarp_destroyer 5, warp_destroyer 5, nonwarp_battleship 14,
  warp_battleship 22 (warp_frigate already had 2). Habitat is placed on nonwarp_small/medium/large_colony and warp_small/medium_colony;
  warp_large_colony keeps defaults (empty file). The `nonwarp_small_colony` hardpoints change is only the Workshop save stamp in
  `notes`. No nozzle was moved.
- **Finding 737 ✅** (filed and closed here): see §5.
- **Keepers:**
  - `ship_anchors_smoke` **93/0**: schema table and disk files with witness, defaults, loader / cache, module coverage, Workshop
    round-trip (hardpoints blind to anchors, session, revert), label layout, lazy load and projection on three r171. A10 runs on the
    **real meshes of all 24 GLBs** via `@gltf-transform`: weapons = turret centroid and its hull projection (6/6), the five snapped roles
    ≤ 10⁻³ from the hull (worst 7·10⁻⁵), drive = nozzle, hold and mission on the visible side, deterministic. Closest-point-on-triangle
    is checked against dense sampling; control: without the mesh the warp_battleship rule points float > 0.01.
  - Fail-first on a `git worktree` at `cb06d7a`: 12 red, 3 green (2 controls, plus an exclusion pin whose witness is red).
  - Mutations red 11/11: merge ignores the file, unmapped troop, duplicate role accepted, eager load, coinciding defaults, anchors
    leaking into the hardpoints doc, wrong projection yaw, no snap, no centroid, dropped triangle vertex region, wrong early reject.
  - `cv_normalizer_logic_smoke` 57/0, `cv_models_logic_smoke` 69/0, `cv_workshop_logic_smoke` 95/0 and `ship_hologram_smoke` 58/0 pass
    on the owner's files. Sweep 412/412, `check-i18n` PASS. Workshop live in headless Chrome: 14/14.
- **Deviations (approved):** decisions 1–3 above. Proposal 4 was extended in rounds 2–3: turret centroid, hull snap, drive exempt,
  hold and mission moved to the visible side. Labels in plan view are on the side view only. A10 reads GLBs through the devDependency
  `@gltf-transform` (without `node_modules` the section degrades red; the suite does not abort).

### 11.1 Inputs for K1c

- Use `anchorsFor(key, …)` plus `groupModulesByRole(design modules, SHIP_MODULES)`: one leader per non-empty role, with the module list
  stacked under the role label. `drawShipAnchors` is the starting point; drop the default/file distinction for the player.
- The renderer computes snapped defaults once per model. The hero rect for K1c is the hologram layer (§10.1); project with the same
  `projectPoints`.
- Anchor files are missing for 18 keys. Each one costs a 404 when its anchors are first requested. Saving any model in mode 6
  writes a file, an empty one included.

## 12. K1c-A — delivered (Shipyard on the console template)

**Commit `301b66b` feat(K1c-A)** · flag `FEATURES.consoleShipyard` (default ON, works with `consoleKit`; OFF = today's Shipyard bit
for bit). Owner PASS 2026-11-16 (handover `C:\Users\Komputer\kosmos-handover\consoles-k1c\`: `STOP_K1c-A.md`, `kontakt_k1c_a.html`,
`shots/{after/<5 themes>, before/amber_noir, after_1280/amber_noir}`, `probes/{k1c, oneliners, sheet}.mjs`; the before/after
`git worktree` copies were removed at commit time).

- **Files:** new `ShipyardConsoleLogic.js` (pure: delta, role stacks, build state, build target, gates, hull rows, category icons) and
  `ShipyardConsoleView.js` (four zones + strip, wheel scroll). `ShipyardOverlay.js` gains a console branch in draw / `_onHit` /
  `handleScroll` / `hide`, a lazy hologram released on close, and `isAnimating` (frames driven from `UIManager`).
  `ShipAnchorOverlay.drawDesignAnchors` is new (`drawShipAnchors` untouched); `ShipAnchorOverlayLogic` items accept `subs` (stacked
  lines, backward compatible). `CONSOLE_KIT_SCREENS.shipyard` puts the CombatStrip in the header slot. `UnitDesignOverlay.js` is
  untouched: its zones are identical with the flag ON and OFF, so the U key and Command Ground keep working.
- **What moved where:**
  - header ⚓ + ✕ → STOCZNIA · colony · facility · [ x ]; gates S0/S1 → banner line in the header, same texts and rules;
  - build cards + the designer's saved list → **designs list** (hull, module count, key stats, build state with reason, [ EDYTUJ ]
    [ USUŃ ]; select = load);
  - hull buttons → **hull list** (slot layout «1P+2U», mass, 🔒 tech, 🛰 orbital-only — still selectable for design, as today);
  - slots, picker, stats preview, SAVE/CLEAR → **inspector** (slots + picker scroll; 2 instruments + kv rows; delta = stats(with) −
    stats(without) on hover, raw damage / shieldHP for weapons and shields; [ BUDUJ ] [ ZAPISZ ] [ WYCZYŚĆ ] with today's rules and
    reasons);
  - builds + surge, pending + cancel, reserve + deploy → **strip** (3 columns 30/30/40 %, each scrolls; pending tooltip kept);
  - hero = K1a hologram of the current design (D-K-10 live civil swap), one label per non-empty role on the K1b anchors with the
    stacked module list, [ 3D ] / [ PLAN ].
- **Findings:** 723 ✅ closed by this layout. 726 fixed in the console picker (`unitDesign.cat.*` PL/EN + icons); the U screen gets it
  with U → Shipyard (K1c-B, D-K-12).
- **Keepers:** `console_shipyard_smoke` **71/0** (delta vs independent calc, role stacks, locked hull, 16-case build-state matrix vs
  today, hit-zone inventory ON ⊇ OFF with handler effects, OFF = today, U screen identical ON/OFF, 726, geometry from `consoleZones`,
  gate banner in the header band, scroll pruning). Fail-first on a `git worktree` at `1275823`: 46 red / 25 green (named controls and
  witnesses). Mutations 6/6 red. `w2_deploy_ui_smoke` and `design_action_bar_smoke` set the flag OFF (they pin today's path). K1b 93/0,
  K1a 58/0, K0 33/25/49; sweep 413/413, `check-i18n` PASS. Live engine (headless Chrome, GPU): 7 frames × 5 themes + before/after +
  1280×833, 0 console errors; one-liners checked.
- **Deviations:** 3–5 approved (726 console part only; under a gate the strip hides builds and pending as today; strip 158 px and the
  hologram still composited in `#ui-canvas`). 1–2 (BUILD = two clicks via the loaded saved design; row select duplicates
  [ EDYTUJ ]) are resolved in K1c-B: a row chip **[ BUDUJ ]** replaces [ EDYTUJ ].

### 12.1 Inputs for K1c-B

- Hologram on its own canvas layer (§10.1), slow spin + drag rotate, optional local dim (labels over small hulls — Neon Cyber,
  freighter).
- Designs row: chip [ BUDUJ ] (today's build rule via `templateBuildState`) replaces [ EDYTUJ ]; row select keeps loading.
- U key → Shipyard designer (D-K-12), which brings 726 to the U path; tuning from the owner's look.

## 13. K1c-B — delivered (Shipyard console polish) — Shipyard console DONE

**Commit `eb59908` feat(K1c-B)** · flag `FEATURES.consoleShipyard` (OFF = today's Shipyard; the 726 label fix in the U-screen picker applies
with the flag OFF too). Owner PASS 2026-11-16 with decisions 1–3 approved, decision 4 = yes (hull list without underline as well) and two
label fixes before the commit (handover `C:\Users\Komputer\kosmos-handover\consoles-k1c\`: `STOP_K1c-B.md`, `kontakt_k1c_b.html`,
`shots_b/{after/<5 themes>, after_1280/amber_noir, fix/amber_noir}`, `probes/{k1c_b, oneliners_b, sheet_b}.mjs`, `run_b.sh`, `run_c.sh`;
the fail-first `git worktree` was removed at commit time).

- **Owner note A — no auto-spin:** the hero shows a static 3/4 view. Mouse drag in the hero sets yaw (wrapped) and a small pitch (camera
  elevation 8°…40°); the pose lives in `ShipyardOverlay`, survives model swaps and closing the tab; double-click resets it; [ PLAN ] does
  not rotate. Pure helpers `dragPose`, `isDragMove`, `isDoubleTap`, `HOLO_POSE` in `ShipHologramLogic`; renderer `setPose` (camera and
  anchor projection use the same pose). `setSpin` now marks the renderer dirty only on a change.
- **Owner note B — static stats:** `inspectorStatLayout` gives 14 fixed rows (`STAT_ROW_KEYS`: pairs «Przeżywalność / Odkrycia» and
  «Koloniści / Desant», row «Broń / tarcza modułu», a reserved cost-delta line), a fixed 64 px delta column (pair deltas in two sub-slots,
  the second on the column's right edge), tabular digits and two reserved reason lines. Hovering a module changes texts only — measured
  on the live engine for the troop bay, colony module and warp tank in 5 themes and at 1280×833.
- **Owner note C — shipyard choice:** recorded only (§14), no audit or code.
- **Owner note D + decision 4:** the design list and the hull list draw the selection with brackets only (`drawList` option `underline`).
- **§10.1 hologram layer:** `ShipyardHoloLayer` is a `#holo-canvas` inserted right before `#ui-canvas` (z-index 1, pointer-events none),
  sized to the hero rect on whole CSS pixels (`snapRectToCss`). The UI clears exactly that rect; the layer repeats the console scrim
  there, then the local dim, the hologram and the labels. The layer repaints only when its state signature changes (rect, model, mode,
  stacks, pose, scrim, knobs, theme, language), on drag (rAF-coalesced) and during the cross-fade. `UIManager` routes mouse moves to the
  drag **before** marking the UI dirty and brackets each UI frame with `beginUiFrame` / `endUiFrame`, so a frame without the hero (clean
  view, other tab) hides the layer in the same task. `hide()` removes the layer from the DOM. **Measured** (headless Chrome, GPU,
  1600×1041, paused, 60 CDP mouse moves ≈ 2 s): **0 UI redraws, 58 layer paints**; control without the layer: **58 UI redraws**; map
  camera untouched; same in all 5 themes and at 1280×833.
- **Framing:** renderer option `fit: 'hero'` scales and centres the projection in NDC (`heroFraming`) from a hull vertex sample
  (`model.hullPts`, ≤ 1500 points) at the default pose: the model fills ~75 % of the hero width, height clamped at 72 %; the frame stays
  constant while rotating. Without `fit` (debug viewer) the camera is K1a bit for bit.
- **Local dim:** soft ellipse in `bgPrimary` behind the hologram, knob `KOSMOS.debug.holo.tune.heroDim` (0..1, default **0.45**).
- **Labels outside the hull:** `layoutHeroLabels` (with `renderer.projectHullBox`): an anchor left of the hull box centre goes to the left
  column, right → right column (approved deviation 1: columns follow the screen side, so in the default 3/4 pose the left column is the
  bow side; literal «aft left / fore right» would run leaders across the hull). A column that fits beside the box stands beside it;
  otherwise its labels stand at the rect edge above / below the box (long hulls). No label rect enters the box, no overlaps. Text gets
  the console halo. [ PLAN ] keeps the K1b layout on the side view (approved deviation 2).
- **Design rows:** chip [ BUDUJ ] / [ DO KOLEJKI ] replaces [ EDYTUJ ] with today's template-card rule (`build_template`, same data keys); a
  disabled chip is a `tpl_build_blocked` zone whose hover shows the reason. Row click still loads the design. [ USUŃ ] arms
  [ POTWIERDŹ ] for 3 s (`deleteClick`, `DELETE_CONFIRM_MS`); the second click within the window deletes.
- **U key (D-K-12 a):** `routeOverlayId` sends `unit_design` to `shipyard` when the Shipyard console is on; the ground-unit designer stays in
  Command → Ground and the Colonies draft. **Finding 726** is fixed in the U-screen picker too: the category canon moved to
  `src/data/ShipModuleCategories.js` (icons + `unitDesign.cat.*` keys), re-exported by `ShipyardConsoleLogic`.
- **Keepers:** `console_shipyard_b_smoke` **76/0** (stats rects with and without hover incl. colonists / troops / warp / weapon / shield,
  pose, drag and double-click, renderer pose + framing on three r171, UIManager source pins, layer lifecycle with a fake DOM, label
  layout in three hull shapes, underline, 16-case [ BUDUJ ] matrix without loading the design, delete window, U routing and ground hosts,
  726 in the U picker). Fail-first on a `git worktree` at `1990799`: 39 red / 8 green (named controls and witnesses; sections degrade
  instead of aborting). Mutations 11/11 red. `console_shipyard_smoke` updated for the new behaviour (S4c inspector-only, S5b/S5d
  [ EDYTUJ ] replaced by the row click, S5k two clicks, S9b [ BUDUJ ] in list or inspector) 71/0; K1a 58/0, K1b 93/0; sweep 414/414;
  `check-i18n` PASS. One-liners checked on the live engine (U / S keys, `heroDim`, layer before `#ui-canvas`, removed on close).
- **Approved deviations:** 1 (screen-side columns), 2 ([ PLAN ] labels as K1b), 3 (paired stat rows, zeros as 0, smaller scroll area for
  slots and picker); halo on labels only, not on the hologram image; 726 also on the OFF path (labels only, zones unchanged).

## 14. Next after the arc (recorded, not scheduled)

- **Shipyard choice and build location** (owner's requirement, recorded during K1c-B, 2026-11-16; owner note C). In the Shipyard the
  player picks **any shipyard that can build the current design**: ground shipyards and orbital stations with a shipyard module.
  Hull rules apply (an orbital-only hull lists only orbital shipyards). The ship is built **at** that shipyard: its builds, pending
  orders and surge live there. A finished hull can be deployed from reserve **only at the shipyard that built it**. This changes
  mechanics (order and reserve data, possibly the save version, AI build paths), so it gets its own audit, plan and owner sign-off
  after the CONSOLES arc closes. Until then the Shipyard keeps today's build target (the active colony's ground shipyard).

## 15. K2 — delivered (Diplomacy + War on the console template) — Diplomacy group DONE

**Commits `1685293` refactor(K-pre Diplomacy/War)** (D-K-18: DiplomacyOverlay had no dead code — its EventBus listeners drive the
action flash; WarOverlay had one unused local) **and `1f6c960` feat(K2)** · flag `FEATURES.consoleDiplomacy` (both screens; ON, works
with `consoleKit`; OFF = today's Diplomacy and War bit for bit, debug buttons included until KZ) · owner PASS 2026-11-16, deviations
1–6 approved, two fixes before commit (War hero title = opponent name only, wrapped to two lines; shared mini-map in the tug-of-war
hero). Handover `C:\Users\Komputer\kosmos-handover\consoles-k2\`: `STOP_K2.md`, `kontakt_k2.html`,
`shots/{after/<5 themes>, before/amber_noir, after_1280/amber_noir, after_fix/amber_noir}`, `probes/{k2, oneliners, sheet}.mjs`;
the before/after `git worktree` copies were removed at commit time.

- **Group:** `diplomacy` and `war` join `CONSOLE_KIT_SCREENS` → `[ DYPLOMACJA ] [ WYWIAD ] [ WOJNY ]` header chips (click = `openPanel`,
  like the subnav), no 24 px strip over the group, CombatStrip in the header slot.
- **Diplomacy** (`DiplomacyConsoleLogic` + `DiplomacyConsoleView`): list = the shared K0b empire list (`empireRowView` + `drawEmpireList`,
  new optional `line1Right` = status · tension), today's entry set (intel ≥ rumor) and order (tension desc); hero = identity line as in
  Intel, status (peace / war / truce with years / alliance) + AI stance label, opinion (−100…+100) and tension (0…100) instruments with
  scale bars, **K0b-1 mini-map reused** (extracted to `ConsoleEmpireMap`; Intel keeps thin wrappers); inspector = opinion breakdown
  (top 5 + more, as today), treaties + reparations, relation memory (3 newest), six action chips mirroring today's enable rules — a
  disabled chip carries a hover tooltip with the reason (`action_blocked`, no effect; `ConsoleKit.drawActionChip` /
  `drawConsoleTooltip`); strip = ultimatum / action flash, only when present.
- **War** (`WarConsoleLogic` + `WarConsoleView`): list = wars in today's order (opponent, status, exhaustion mini-bars, years at war in
  game years); hero = exhaustion tug-of-war with today's numbers (declared year, duration, battles) and the shared mini-map of the
  opponent's known systems vs the player's, or — when negotiating — the peace table (same overlay methods and zone types:
  `peace_toggle`, `reparations_toggle`, `peace_clear`); inspector = casus belli, recent battles, `[ ZAPROPONUJ POKÓJ ]` with today's
  cooldown rule (reason tooltip).
- **Approved deviations:** (1) «negotiating» = hero chip `[ STÓŁ POKOJU ]`, terms on the table, or the counter-proposal dispatch
  (`show({ warId })`); new zone type `hero_mode`. (2) Fog basis for identity and map = today's Diplomacy ∪ Intel at the same level;
  opinion, breakdown and stance from contact as today; no military numbers. (3) Mini-map reused. (4) Debug calls act on the war selected
  in the War panel, else the first active; a selected ended war is refused (`war_not_active`); in the gate save `forceBattle()` returns
  `no_fleet` (same as the old button). (5) Flag OFF keeps the debug buttons and the raw ids until KZ. (6) Memory labels for all 13 types
  (incl. Director's `border_pressure`, `first_contact_kill`), generic fallback.
- **Findings:** **724 ✅** (stance and memory keys through `diplo.stance.*` / `diplo.memEvent.*`, fallback label); **725 War part ✅**
  (`warOverlay.casusBelli` on both paths, PL/EN text unchanged; i18n baseline WarOverlay 1 → 0 — the Production / Trade / Budget parts
  stay open for K3/K4); **727 ✅** (chips end above the clock reserve at 1600×1041 and 1280×833); **735 ✅** (the console never draws
  force battle / invasion; `KOSMOS.debug.war.forceBattle()` / `.forceInvasion()` / `.target()` call the same `forceWarBattle` /
  `forceWarInvasion` as the old buttons).
- **Keepers:** `console_diplomacy_smoke` **50/0** (list reuse, fog subset per level, 724 token scan + fallback + label completeness vs
  every `addMemory` producer and `INCIDENT_CHANNELS`, action inventory ON == OFF on 96 states + handler effect + reasons, 727 at both
  sizes with a witness, group chips and subnav, War list / hero mode / table inventory ON ⊇ OFF without debug zones, 735 debug API =
  old button calls, 725, empty state, wheel without `window.inner*`, geometry from `consoleZones`, title wrap, tug mini-map).
  Fail-first on a `git worktree` at `1685293`: 33 red / 14 green (named controls, scanner witness, exclusions with witnesses); the two
  post-gate pins red on the pre-fix view (control green). Mutations 6/6 red. `diplomacy_overlay_breakdown`, `wp_peace_cooldown`,
  `wp_peace_table` set the flag OFF (they pin today's panels); `console_intel_smoke` S3 sets `consoleDiplomacy` OFF explicitly;
  `i18n_hardcoded_gate_smoke` T3 uses POIModal as its sample. Sweep 415/415, `check-i18n` PASS. Live engine: 7 frames × 5 themes +
  before/after + 1280×833 + post-fix frame, 0 console errors; one-liners validated on the engine.

## 16. K3 — delivered (Economy group on the console template: Budget, Flows, Trade) — Economy group DONE except Production

**Commits `79c8ba3` refactor(K-pre Economy)** (D-K-18: dormant manual/priority factory modes and an unused Trade helper, −771 LOC),
**`a75a402` feat(K3-A)** (Economy frame + Budget + Flows) **and `bd72f73` feat(K3-B)** (Trade + polish) · flag `FEATURES.consoleEconomy`
(Budget, Flows, Trade; ON, with `consoleKit`; OFF = today's pages bit for bit, proven by draw-log + zone hashes against the base) ·
owner PASS 2026-11-17 after two polish rounds. Handover `C:\Users\Komputer\kosmos-handover\consoles-k3\`: `STOP_K3-A.md`,
`STOP_K3.md`, `STOP_K3_POLISH.md`, `STOP_K3_R2.md`, `kontakt_k3.html`, `shots{,_p,_r2}/`, `probes/{k3, k3r2, sheet, sheet_p, sheet_r2}.mjs`,
`run{,_p,_p2,_r2}.sh`; fail-first worktrees removed.

- **Frame (D-K-15, D-K-16):** header chips `[ BUDŻET ] [ PRODUKCJA ] [ HANDEL ] [ RYNEK ] [ PRZEPŁYWY ]` (`applyEconChip`), no subnav
  strip; Production stays today's page with the strip until K4. The left inventory column is dropped: every line is either in the top
  drawer or in the Flows stock block «Magazyn — poza szufladą» (goods beyond fuel, orphan-station depots); D-K-16 deviation approved
  (no energy balance for a selected station). After the gate the stock block lives on Flows only.
- **Budget:** budget lines list, hero = net + treasury instruments, income vs expense bars, tax slider (today's `tax_slider` rule);
  inspector = breakdown + tax effect (725); strip = resource deficits / surpluses labelled «Surowce», with the budget deficit first in
  alert role when net < 0.
- **Flows:** resource list (Finding 738 fix: row value = hero net), hero = producer / resource / consumer diagram in hero thirds
  (headers above columns, band thickness by value, K1c-B local dim under the centre number), inspector = production, consumption,
  balance, stock, years to empty, full breakdown + stock block.
- **Handel:** connection list with «Wszystkie połączenia» first (today's global chart); a selected connection drives the hero (its
  history from the trade log, else its current flows as bars, else plain «no data»), the inspector (partner, distance, prosperity gap,
  its flows, the partner endpoint's prices) and the strip (its log entries); spend actions, migration, goods control below.
  **Report A:** per connection = partner, distance, gradient, current flows (`_flowsPerYear`, rebuilt every half-year, not saved — empty
  after load / while paused), history (the trade log stores the partner NAME, matched by name), endpoint prices (prices are per colony);
  per colony = credits, Kr/yr, capacity, spends, migration, goods control.
- **Rynek:** partner empires → colonies, board titled colony · empire with «Towar / Zapas · cena» column headers, order box (qty chips +
  typed `<input>` placed from `consoleZones`), recipient / pay / receive / warp delivery (`TradeOrderBoard.DELAY_YEARS`, now exported)
  and how BUY / SELL settle; pending orders always in the strip. **Report B:** `placeOrder` gates = full player colony → AI colony →
  `ion_drives` → trade treaty (the partner list already requires the treaty); settlement cancels on missing credits / stock. The flag-OFF
  page rejects the same way (same method, result ignored — silent). The console disables BUY / SELL with an i18n reason (`orderGate`).
- **Round 2 — which colony trades:** the active colony is the global `colonyManager.activePlanetId`, set only by `switchActiveColony`
  (Outliner, map label, event log, Civilization list, colony panel switcher, opening a colony map, founding a colony **or outpost**,
  capture, colony loss); it swaps the per-colony systems of the whole UI. No console click changes it (pin K8). The owner's refusal was an
  outpost as active colony (Finding 740). «Full colony» in code = player colony with `isOutpost !== true`; «outpost» = `isOutpost === true`
  (pop 0, no civilization). Fix: a **Trade-local colony context** («Twoja kolonia: X ▾» picker on both pages; outposts dimmed with the
  reason) — the global active colony is never switched; credits, connections, spends, migration, goods, stock and orders follow it.
  `KOSMOS.debug.trade.ctx()` prints the active and the trade colony (id, name, type, pop) and every order and spend gate.
- **Approved deviations:** (1) pending orders always in the Rynek strip; (2) local / partner prices in the Handel inspector, spend
  descriptions shown; (3) 725 names only in the console (OFF keeps raw ids until KZ), `Kr/rok` via `t()` on both paths (EN «Kr/yr»);
  (4) the Flows list has more rows than today (mine / factory-input resources — 738); (5) Rynek board in 2 columns, import in the
  foreign role; (6) a blocked BUY / SELL has no hit zone (OFF: zone with a silent refusal); (7) credits and stock are checked before the
  order (today: accepted, cancelled after a year); (8) the K1c-B local dim is copied (`drawHeroDim`), Shipyard untouched; (9) Trade-local
  colony context, global active colony untouched; (10) spend actions act on the selected Trade colony and are disabled with a reason.
- **Findings:** **725** Budget + Trade parts ✅ (Production part → K4); **738 ✅**; **739 ⚪** filed; **740 ⚪** and **741 ⚪** new.
- **Keepers:** `console_economy_smoke` **89/0** (actions ON == OFF, D-K-16 reachability drawer ∪ Flows block, chips, Production ON == OFF,
  geometry, 725, formulas, strip, Flows layout); `console_trade_smoke` **98/0** (hit-zone inventory ON ⊇ OFF, qty `<input>` at 1600×1041
  and 1280×833 with patched `innerWidth`, no raw ids, chips, 738, connection selection, order gate per condition, OFF rejects the same way,
  chart / board labels, colony context, reason keys PL + EN, spend gates, order explanation, debug dump). Fail-first per round on the
  previous state (only named controls green); mutations 8/8, 15/15, 10/10 red. Sweep 417/417, `check-i18n` PASS. Live engine (CDP mouse
  + keyboard, GATE-S4): 5 themes ON, OFF, pre-change, 1280×833, outpost-active and no-active cases — 0 page errors.
- **Owner decision 2026-11-17:** K6 (Colonies) leaves this arc for its own arc «planet/body screen»; the Colonies tab keeps today's look
  and KZ does not touch it. Next step here: K4 (Production; 732, 725 Production part).

## 17. K4 — delivered (Production on the console template) — Economy group DONE

**Commit `886b659` feat(K4)** · flag `FEATURES.consoleEconomy` (Production joins Budget, Flows, Trade; OFF = today's page bit for bit — draw
log + zones vs `f2a3604`: PL 18/18 identical, EN differs only in the 725 headers) · owner PASS 2026-11-17 after one polish round and two
final fixes. Handover `C:\Users\Komputer\kosmos-handover\consoles-k4\`: `STOP_K4.md`, `STOP_K4_POLISH.md`, `kontakt_k4.html`,
`kontakt_k4_polerka.html`, `shots/`, `shots_p/`, `probes/{k4, k4p, offhash, mutate, mutate2, mutate3, sheet, sheet_p}.mjs`, `run.sh`, `run_p.sh`;
fail-first worktrees removed.

- **Frame:** all five Economy chips are kit pages (`economy` in `CONSOLE_KIT_SCREENS`); no subnav on ON, kept on OFF. `econConsoleFrame`
  (EconomyConsoleView) is shared; the inspector, stock block and hero dim are reused from K3.
- **List:** goods «W produkcji» / «Pozostałe» under «Zakres: X ▾». The expanded picker lists every colony, outpost and station, scrolled,
  selection = today's `colony_filter` (Finding 732). Fixed stock / min column (alert when stock < min). Min-stock [ − ] [ + ] on the hovered
  and selected row, locked goods included (dim, min stock pre-set before unlock; no value box, as today). Today's `demand_*` zones, added before
  the row zone. A cut name shows in full on hover. The droid row carries «▸ buduj».
- **Hero in three bands:**
  - «Produkcja teraz»: every line in the scope with progress to the next unit in game time, a «+1» pulse when a unit completes, rate and FP.
    A stalled line shows a stopped bar in the alert role with its reason and never pulses. Click = select.
  - Recipe chain of the selected good: inputs → factory (rate, «FP przydzielone x / y», status) → product, headers directly above their
    columns, one-line nodes for 6–8 ingredients.
  - Bottleneck banner (missing input / no free FP / factories off / recipe locked) + queue and orders.
- **Inspector:**
  - Status, then a big «zapas / minimum» instrument with its steppers.
  - Droid build block: qty, big [ ZBUDUJ × N ], cost line. Disabled with an i18n reason: scope, tech, or the new «brak źródła składników»
    (today such an order is accepted and never starts).
  - Alerts of the scope colonies (the engine stall reason names the ingredient; today «brak ?»), selected-good trend, one-off order with a
    DOM `<input>` placed from `consoleZones`, automatic demand, factory switch, D-K-16 stock block.
- **Strip:** export orders (Finding 742 fix) + one 10-year chart labelled «wszystkie kolonie».
- **Animation cost:** no own frames (source pin). UI cadence ~10 redraws/s while running and 0 while paused (bars static). The Production
  draw takes ≈ 1.8 ms per frame (live engine).
- **Approved deviations:**
  1. `oneshot_toggle_picker` exists only OFF — the goods list is the picker.
  2. Outpost and station scopes: factory actions disabled with a reason (today: 44 no-op actions on an outpost).
  3. Rate = engine rate 1/timePerUnit (today's row prints points/baseTime without multipliers).
  4. Stall alert names the engine's missing ingredient.
  5. Inspector alerts only from the scope colonies.
  6. Finding 742 fixed on the console path.
  7. Trend and 10-year chart are global (the history log has no colony) — labelled.
- **Polish decisions (owner gate):** min stock on the list; stock instrument; three-band hero; droid build block; new droid reason «brak
  źródła składników». Final fixes: a stalled line never looks like it is working (`nowBarState`); locked goods keep today's min-stock
  steppers. Recording correction: «locked goods without steppers» had been wrongly logged as an owner decision; the capability is restored.
- **Findings:** **725 ✅** (Production part — fully closed); **732 ✅**; **742 ✅** new, filed with the console fix.
- **Keepers:**
  - `console_production_smoke` 101/0: A actions ON ⊇ OFF, C chips / subnav, F scope + 732, D D-K-16, B chain / bottleneck / alerts / layout,
    R reasons, N no raw ids, S geometry + `<input>` at 1600×1041 and 1280×833, X 742, L list steppers ON == OFF incl. locked, I instrument,
    H bands / «+1» / stalled bar, DR droid build ON == OFF.
  - Fail-first on `f2a3604`: only witnesses and controls green; sections degrade instead of aborting. Mutations 32/32 red.
  - `console_economy_smoke` 89/0 (G9 / P1 / P2 updated for the signed change); sweep 418/418; `check-i18n` PASS (EconomyOverlay literal
    baseline 1 → 0).
- **Live engine (CDP mouse + keyboard, GATE-S4):** 5 themes, 1280×833, OFF, base, outpost as active colony, staged orphan station and
  factory lines; bar advance and unit completion watched — 0 page errors.
- **Next:** KZ (flags permanent, OFF paths removed) for the Economy group; remaining arc steps per §6.1.

## 18. KZ-E — delivered (Economy group permanently on the console; flag and OFF paths removed)

**Commit `f47b0b8` refactor(KZ-E)** · owner decision 2026-11-17: KZ for the Economy group now, the rest of KZ stays at the end of the arc ·
owner smoke PASS 2026-11-17. Handover `C:\Users\Komputer\kosmos-handover\consoles-kz-e\`: `STOP_KZ-E.md`, `probes/kze.mjs`, `shots/`.
- **Flag removed:** `FEATURES.consoleEconomy` is gone. Budget, Flows, Trade (Handel + Rynek) and Production (`economy`) are listed in
  `PERMANENT_KIT_SCREENS` (`ConsoleLayoutLogic.js`); `isKitScreen` returns true for them without any flag. **Approved decision:** this holds
  also with `consoleKit` OFF — there `consoleKit` only drives the backdrop dim until the final KZ. Other screens' flags are untouched.
- **Removed:** all flag-OFF page drawing in `EconomyOverlay` (2827 → 897 lines) and `TradeOverlay` (1278 → 432): three-column pages, old
  subnav tabs, left inventory column, per-file `✕`, colony chips, min-stock table, alerts column, charts, old Trade / Market pages; OFF-only
  state, the unreachable `oneshot_toggle_picker` case, every `kitPage` / `kitOn` branch, unused imports; 80 i18n keys used only by the OFF
  pages (PL/EN parity kept, literal baseline unchanged). **LOC: product +100 / −3040** (with keepers +696 / −3409). The commit body carries
  the no-callers grep proof for every removed symbol.
- **Behaviour:** hit-zone types, handlers and actions are the former ON path; export toggles always carry `colonyId`; Trade spend and Market
  orders always use the console trade colony.
- **Visual identity:** draw log + hit zones of the five pages in all probed states at 1600×1041 and 1280×833 (20 frames) identical to
  `762726c`.
- **Findings:** **739 ✅** closed by removal («Kr//rok» and `econPanel.stationLabel` without `{0}` lived only on the OFF Budget page);
  **742** — the OFF part (payload without `colonyId`) is gone with the old page, as are the old pages' silent no-ops (e.g. 44 outpost actions);
  **740 ⚪** and **741 ⚪** stay open.
- **Keepers:** ON == OFF comparisons converted into absolute pins from today's ON path; only pins that tested the OFF path itself removed, each
  with a reason (table in `STOP_KZ-E.md` and in the commit body):
  - `console_economy_smoke` 85/0 (removed A0, A4, P2, P3, T5; new permanence pins G9–G11); mutations 13/13 red.
  - `console_production_smoke` 114/0 (exact factory-button sets per state incl. locked goods, list steppers, droid qty, export payloads,
    scope list, alert list; removed A3-OFF witness, A4, C5-OFF, C6, F4, R4, L7, X2-OFF); mutations 11/11 red.
  - `console_trade_smoke` 102/0 (exact Trade 10 / Market 12 type sets, payloads, trade colony incl. outpost-active, ion_drives gate; removed
    H0, R0; OFF controls replaced by ON witnesses); mutations 9/9 red.
  - Sweep 418/418, `check-i18n` PASS.
- **Bug caught by the converted keeper:** two leftover `kitPage()` calls in `_openMinStockInput` / `_openOneShotQtyInput` — clicking the
  min-stock threshold field or [ ZLEĆ JEDNORAZOWO ] would throw and no `<input>` would open. The draw-log comparison could not see it (click
  path only); `console_production_smoke` S2/S3 went red, fixed before the commit and pinned (SCALE comes only from `_uiScale`).
- **Live engine (CDP mouse + keyboard, GATE-S4, 1600×1041 and 1280×833):** five chips (subnav 0), tax slider, Budget line, Flows, scope picker,
  min-stock [+]/[−] and threshold `<input>`, one-shot `<input>`, droid build / cancel, Trade colony picker, Market gates (no ion_drives → no
  BUY; with it the order uses the trade colony, also with an outpost active); staged: trade agreement, ion_drives, outpost — 0 page errors.
- **Next:** remaining arc steps per §6.1; the final KZ covers the other screens' flags and `consoleKit`.

## 19. K5 — delivered (Civilization + Dyson on the console template) — Civilization group DONE

**Commits `3678990` fix(743)** (separate, before the feature) **and `e3af2db` feat(K5)** · flag `FEATURES.consoleCivilization` (ON, with
`consoleKit`; OFF = today's Civilization and Dyson pages bit for bit — draw log + hit zones, 14 states, PL and EN identical to `adae333`) ·
owner gate PASS 2026-11-17, deviations 1–8 approved, one post-gate addition. Handover `C:\Users\Komputer\kosmos-handover\consoles-k5\`:
`STOP_K5-0.md` (Dyson freeze audit), `STOP_K5-A.md`, `STOP_K5.md`, `kontakt_k5.html`, `shots/`, `probes/{k5, k5b, offhash, mutate, mutate_t,
oneliners, sheet, mkemblem}`; fail-first / mutation worktrees and the test emblem removed.

- **Owner decisions 2026-11-17:**
  - **Dyson is NOT frozen** — it is the only endgame path and carries late economy (collector energy ×3, transmitter range ×2,
    fabricator, relay). No mechanics change in K5; Dyson's future is decided later together with a new endgame design (separate topic).
    The K5-0 freeze proposal is withdrawn.
  - **Emblem:** the owner provides `assets/ui/emblems/player.png` (white mark on transparent, 512×512). Present → drawn tinted with the
    theme primary role; absent → the empire name in large type takes its place (never an empty frame). No emblem is committed.
  - **Signed Civilization hero table** copied into §1.2 (list Imperium · Frakcje · Historia; hero portrait + emblem + 4 big numbers;
    inspector factions, bonuses; strip history timeline with repeats grouped).
  - **Post-gate addition:** «Kolonie i placówki» section at the bottom of the empire overview inspector — one row per player colony and
    outpost (name, type — outposts in the dim role —, POP, prosperity, Kr/yr, ships, buildings); row click = the list's colony action
    (`goto_colony`: switch active colony + its inspector).
- **Frame:** chips `[ CYWILIZACJA ] [ SFERA DYSONA ]` (`civilization`, `dyson` in `CONSOLE_KIT_SCREENS`), no subnav strip; a chip switch keeps
  each overlay's selection.
- **Civilization:** list Imperium (overview, leader, colonies) / Frakcje (support %) / Historia (repeats ×N); hero = portrait, emblem slot,
  POP / prosperity / Kr/yr / trade instruments with the hero dim; inspector = empire bonuses + colonies table / leader traits / colony /
  faction (support, demands, what raises support from the slider tables, zone effects; locked factions show the reason and the same data
  dimmed) / chronicle group; strip = chronicle timeline (newest right, wheel = older, «◂ +N starszych»).
- **Dyson:** list phases → all 20 segments; hero = ring of 20 arcs in 4 phases (built / open / locked, roles only), current phase, X/20,
  delivery %, star stage; inspector = effective cost vs home-planet stock, `[ DOSTARCZ ]` / `[ DOSTARCZ 10 % ]` or an i18n reason (phase
  locked + tech name, segment tech, no stock, completed, sphere locked), research bonus, related techs and buildings; strip = endgame path
  Faza I → II → III → IV → Brama Skoku → final decision with «tu jesteś».
- **Hit zones:** today's types kept (`close`, `goto_colony`, `selectSegment`, `deliverMax`, `deliverPercent`); new `tab`, `civ_item`. Input
  from the last frame's `consoleZones`; no DOM inputs.
- **System touches without mechanics change:** `FactionSystem` exports `ZONE_MODIFIERS`; `DysonSystem` exports `RESEARCH_PER_SEGMENT` and
  `getCostMultiplier()` (same formula, now the single source). Gate helpers `KOSMOS.debug.civConsole.state() / stageDyson() /
  stageStock(1|0) / unlockFactions()` (`src/debug/CivConsoleDebug.js`, registered in `GameScene.js`).
- **Approved deviations:**
  1. The Dyson chip keeps today's subnav label «SFERA DYSONA» (brief: «DYSON»).
  2. Colonies live in the Imperium section; a click does what it does today (switch active colony) and opens the colony inspector.
  3. All 20 segments selectable (a locked one shows why); delivery only for the selected segment in the inspector (today a button per row).
  4. A blocked delivery has no hit zone (today a zone with a silent refusal: segment 20 without the tech, no stock).
  5. Effective cost shown (with the orbital fabricator — what the engine takes); today the base cost.
  6. Faction «demands» are new i18n text (from the FactionSystem description); «what raises support» comes from the slider tables.
  7. Population «/ max» hidden when max = 0 (today «67.0 / 0»).
  8. Gate helper `KOSMOS.debug.civConsole` (no mechanics change).
- **Findings:** **743 ✅** fixed (`3678990`): Dyson stage and rings restored from the saved segment count after load and after a system rebuild,
  only around the home star. **744 ⚪** filed (dead leader trait `dysonProgress`).
- **Keepers:**
  - `console_civilization_smoke` 60/0: A actions ON == OFF + effects, T colonies/outposts table (logic + row click == list click), C chips /
    subnav / state, G deliver gates → reason, M segment / phase states, H chronicle grouping, E emblem slot, N no raw ids, S geometry at
    1600×1041 and 1280×833 + input, D gate helpers. Fail-first on `adae333`: only 6 witnesses / controls green. Mutations 19/19 red.
  - `dyson_stage_restore_smoke` 9/0 (view stage, save → load stage == saved for 0..20, live-path source pins); fail-first: only the witness.
  - Sweep 420/420, `check-i18n` PASS (+96 `civConsole.*` keys, parity kept).
- **Live engine (CDP mouse, GATE-S4):** 5 themes, no emblem, 1280×833, OFF, base; outpost staged via `createOutpost`; Dyson staged with the
  engine event + real `deliverMax`; 743 after the fix: other system stage 0 / no rings, back home stage 1 + rings, save → load stage 1 + rings
  — 0 page exceptions in every run.
- **Next:** remaining arc steps per §6.1 (K7 Command — §20); the final KZ covers `consoleCivilization` with the other screens' flags.

## 20. K7-A — delivered (Command registry on the console template; console-wide map-badge rule)

**Commits `44dd164` fix(746)** (separate, before the feature) **and `2c13b9f` feat(K7-A)** · flag `FEATURES.consoleCommand` (ON, with
`consoleKit`; OFF = today's Command bit for bit — draw log + hit zones, 11 states, PL and EN identical to `19e8b3d`) · owner gate PASS
2026-11-17: deviations 1–8 approved, deviation 9 changed (applied after the gate, below); K7-pre confirmed for the next session.
Handover `C:\Users\Komputer\kosmos-handover\consoles-k7\`: `STOP_K7-A.md`, `kontakt_k7a.html`, `shots/{after,after_r2,off,before,badges}/`,
`probes/{k7a, focusdiag, reconrun, clickdbg, badges, layers, oneliners, offhash, mutate, mutate2, sheet}`; fail-first / mutation worktrees removed.

- **K7 split** (row in §6.1): K7-A (this) · K7-pre = remove the dormant 2D map + `_drawLeftFleets` (D-K-18, confirmed) · K7-B = inspector
  reskin + golden trace T4 re-record + rename input from `consoleZones` · K7-C = Atlas, Logistics, Ground on the console.
- **Frame:** `fleet` in `CONSOLE_KIT_SCREENS`; header chips `[ TAKTYKA SYSTEMU ] [ JEDNOSTKI ] [ ATLAS GWIAZD ] [ LOGISTYKA ]` replace the
  own tab bar (same `tab` zones, registry state kept across chips); combat strip in the header slot.
- **Registry:** list = search (DOM `<input>` placed from `consoleZones` + `uiViewport`, no `window.inner*` in the handler), grouping, fleets
  (new access path), systems, roles, sections — faceted counts, today's zone types · hero = ship table: today's 12 columns (fixed columns
  scaled ×0.8 in the 720 px hero, cut cells in full on hover), sort, groups, checkboxes, row = select, „POKAŻ”, context line, fixed bulk
  line (disabled + reason when nothing is ticked), empty result → [ WYCZYŚĆ FILTRY ] (new zone `registryClearFilters`) · inspector =
  today's `_drawRight` (reskin K7-B) or a multi-selection summary (roles, systems, combat, attention, low fuel, bulk actions, names) ·
  strip = mission timeline: selected fleet › ticked › selected ship › rows visible in the table; plain message when nothing is under way.
- **Approved deviations (owner):** (1) chips keep today's tab labels; (2) strip without selection = rows visible in the table;
  (3) Ground / Atlas / Logistics = today's pages under the chips on today's opaque background; (4) inspector body unchanged until K7-B,
  multi-selection summary new; (5) narrower columns, words instead of emoji (Pal., Alarm, POKAŻ); (6) bulk line always shown;
  (7) fleets in the list, faceted counts, clear-filters, contact hint, transit „POKAŻ” disabled with reason; (8) `commandTacticalMap`
  ON shows no map switch on the console (map dormant, D-K-14).
- **Deviation 9 CHANGED by the owner — row = select, „POKAŻ” = fly:** a registry row click only selects (`vessel` zone without
  `vessel:focus` on the console; OFF unchanged). „POKAŻ” is the way to fly to a ship, planned from the LIVE vessel
  (`CommandConsoleLogic.focusPlan`, executed by `FleetManagerOverlay._focusVesselKit`): same system → camera follows the ship's current
  position (renderer `_focusVesselId` follows the sprite); docked (hangar / station, no 3D object) → its body / station; other system →
  switch the view, then follow; switch refused → message, no camera; jump between systems → disabled, reason names the target
  system; a system that cannot be opened → disabled, reason names it.
- **„POKAŻ” diagnosis (live engine, real CDP mouse, GATE-S4; camera goal vs live sprite after 2 s, per state):**
  - Today's handler worked per state when its click arrived — docked → body (0.000), orbit → ship (0), other system → switch + ship (0).
  - Sources of „sometimes / not the exact spot”: (a) recon ships — stale orbit pinned the sprite → camera at the recon start point
    (Finding 746, below); (b) the row click itself already flew the camera (deviation 9), so „POKAŻ” often looked like a no-op;
    (c) the zone carried the system from the last drawn frame and the switch refusal was ignored; (d) docked ships have no 3D object
    — the camera shows the body / station (now said in the hint); (e) one-tick follow lag 0.02–0.08 u on a moving ship (accepted);
    (f) an event modal over the console swallows the click (general DOM-modal behaviour, not a console defect).
  - After the change, measured: row click moves the camera 0 and selects; docked → body 0; orbit, recon at home and recon in another
    system → ship 0; transit → no zone, reason «cel: Propus».
- **Console-wide rule (all console screens) — map badges hidden while a console covers the scene:** `ConsoleSceneLogic.
  CONSOLE_HIDDEN_MAP_BADGES` + `consoleHidesMapBadges(covered)` (same predicate as the backdrop; `consoleKit` OFF → never), executed by
  `ThreeRenderer._hideConsoleMapBadges` only for the frame's render and restored right after (no state change). Suppressed: colony
  building icons (`ColonyBuildingMarkers`), player-planet dot (`_lifeGlows`), tactical-mode glyphs, ETA ghosts and orbit markers,
  enemy markers, POI markers. `#hud-canvas` (body and ship labels, alerts, routes) was already gated under any overlay (`hudGate` →
  `overlay`). The scene itself (star, planets, orbits, ship models, effects) stays. Measured: 23 building icons hidden under Command
  and under Civilization, all 23 back after close; `KOSMOS.debug.consoleKit.scene().badgesHidden`.
- **Findings:** **745 ⚪** filed (OFF timeline lane labels; console path fixed) · **746 ✅** filed and fixed (`44dd164`).
- **Keepers:** `console_command_smoke` 214/0 (A–X as staged + F: row click without `vessel:focus` ON / with it OFF, `focusPlan` per state,
  execution order close → switch → select → focus, refusal, live system over zone data); `console_map_badges_smoke` 24/0;
  `transit_sprite_orbit_smoke` 7/0; `fleet_clock_band_smoke` pins the flag-OFF Command. Fail-first on `19e8b3d`: sections red via
  their witnesses, green only equivalence pins and named controls. Mutations 17/17 + 15/15 red (the old transit-gate mutation moved
  into `focusPlan`, F4). Sweep 423/423, `check-i18n` PASS.
- **Live engine (CDP mouse + keyboard, GATE-S4):** 5 themes, 1280×833, +60 ships (scroll), OFF, OFF + 60, base; after the gate:
  „POKAŻ” per state, row click, recon in another system with time running, badges under Command and Civilization, frames
  regenerated (Amber Noir, Cold Blue) — 0 page exceptions.
- **Next:** K7-pre (remove the dormant 2D map, D-K-18), then K7-B — both delivered (§21, §22).

## 21. K7-pre — delivered (dormant 2D map and left fleet list removed from Command)

**Commit `407607d` refactor(K7-pre)** (D-K-18, Finding 734) · owner decisions 2026-11-17: removal of `FEATURES.fleetRegistry` APPROVED (its OFF
path only restored the map — deviation recorded in the commit), removal of `fleet_list_rows_smoke` APPROVED.
- FleetManagerOverlay 7917 → 6040 LOC (src −2200 / +96, 15 files): `_drawLeft`, `_drawLeftFleets` (never called), `_drawFleetRow`,
  `_drawCenter`, map sprites / ghost blip / view switch, map focus and zoom helpers, `_filterVessels`, their state, map-only hit handlers,
  `FEATURES.commandTacticalMap` and `FEATURES.fleetRegistry`, GameScene's `_mapBounds` tooltip branches, 13 i18n keys.
- Identity (draw log + hit zones + input results, 19 states × PL/EN × 2 sizes): ON identical; OFF identical except the base's first
  frame of a fresh overlay (2 stray map column separators). Keepers re-aimed with witnesses; sweep 422/422.
- Kept on purpose: the `fleetCreate` / `fleetDisband` handlers — their only producer was the removed list → Finding 747 (fixed in K7-B).

## 22. K7-B — delivered (ship / fleet inspector on the console)

**Commits `29b7e7d` fix(749)** (separate, before the feature) **and `0eab554` feat(K7-B)** · flag `FEATURES.consoleCommand` (OFF = today bit
for bit) · owner gate PASS 2026-11-17: deviations 1–4 approved; after the gate applied: 749 fix, state-aware „no orders” line, scout tag
`ZWD`. Handover `C:\Users\Komputer\kosmos-handover\consoles-k7\`: `STOP_K7-B.md`, `kontakt_k7b.html`, `shots/k7b/`,
`probes/{k7b, run_k7b, sheet_k7b, mutate_k7b}`; fail-first worktrees removed.
- **Ship inspector** (`CommandInspectorView` + pure `CommandInspectorLogic`; facts from `FleetManagerOverlay._inspectorShipFacts`, same
  predicates as `_drawRight`): header = name (click = rename) + class + `[ STOCZNIA ]`; status line in roles (dock / orbit / transit /
  other system); fuel, warp, endurance and hull as 2 px instruments with numbers (the game has no hull HP: `damaged` + repair progress);
  upkeep with the concrete fix in alert role („Brakuje 252 Kr w skarbcu”); „Teraz” block (order, mission + manifest, arrival, foreign
  orbit, recon, loop); actions as bracket chips grouped primary → orders → logistics → `[ ROZBIÓRKA ]` (alert, today's confirm);
  technical file (modules, performance, hull description); mission log. Every impossible action = disabled chip with an i18n reason
  (or the ready reason text of `getAvailableActions`), never a silent no-op. No orders but logistics → „Brak rozkazów w locie / na
  orbicie / w doku / w tym stanie”.
- **Fleet inspector and multi-selection summary** in the same language: members, slowest speed, shortest range, lowest fuel; today's
  fleet orders (2×2), doctrine list, retreat threshold, members with fleet / own order tags; `[ ROZWIĄŻ FLOTĘ ]` (747).
- **Dialogs from `consoleZones`:** rename (ship, fleet), new fleet, bulk-assign picker, scrap and disband confirms open at the inspector
  (new fleet: at the list) — `dialogAnchorCss(zone, uiScale)` via `ModalAnchor.applyModalAnchor`; no `window.inner*` in handlers;
  outside the console (flag OFF, other tabs) — today's centred dialog. Measured: inspector (1210, 113, 375) at 1600×1041,
  (968, 90, 300) at 1280×833.
- **Registry polish:** ROLA = role glyph + 3–4-letter tag (`cmdConsole.roleTag.*`, every role incl. envoy; scout `ZWD`), full role on
  hover; columns empty for every visible row shrink to `MIN_COL_W` (never disappear), truncated header → full label on hover.
- **T4 — not re-recorded, diff list: none.** T4 is the frozen zone snapshot of the removed T3 map ship panel (oracle of
  `ship_panel_hud_smoke` H1–H3), not the Command inspector; it cannot be re-recorded from the current tree and K7-B does not change it
  (127/0). Its 20 states are instead the oracle of the inspector keeper (zones ON == live `_drawRight`).
- **Approved deviations (owner):** (1) enemy panel (`_drawEnemyDetails`) and (2) mission configurator (`_drawMissionConfig`) keep
  today's drawing inside the inspector zone — reskin moves to K7-C; (3) 747 fixed on the console path only (OFF bit for bit);
  (4) availability ON == OFF by hit zones — disabled chips are added only as chips without a zone, with a reason.
- **Findings:** **747 ✅** (console path) · **748 ⚪** filed · **749 ✅** (`29b7e7d`). Next free: **750**.
- **Keepers:** `console_inspector_smoke` 377/0 (I zones ON == live `_drawRight` on 26 ship states; W; D reasons PL+EN; F; K 747; M; R;
  C; A dialogs at 1600×1041 and 1280×833; L); `rename_vessel_prefill_smoke` 7/0; `console_command_smoke` 214/0 (A: `fleetCreate`,
  `fleetDisband` new ON types). Fail-first on `407607d`: inspector 19/122, 749 5/7. Mutations 15/15 red. Sweep 424/424, `check-i18n` PASS.
- **Live engine (CDP mouse + keyboard, GATE-S4):** 5 themes, 1280×833, OFF, base — 0 page exceptions; undock → orbiting, auto-refuel
  toggle and back, mission configurator, typed rename, scrap confirm opened + cancelled, fleet created from the list and disbanded with
  confirm, multi-selection, „POKAŻ” (close + one `vessel:focus`). Frames regenerated after the gate changes.
- **Next:** K7-C — delivered (§23).

## 23. K7-C — delivered (enemy panel, mission setup, Atlas, Logistics, Ground on the console) — Command DONE

**Commits `4e71750` fix(753), `7e59e26` fix(754)** (separate, before the feature) **and `cab95b4` feat(K7-C)** · flag `FEATURES.consoleCommand`
(OFF = today bit for bit: draw log + hit zones of 15 states identical to `880a81b`) · owner gate PASS 2026-11-17: deviations 1–6 approved,
three owner changes applied after the gate (below). Handover `C:\Users\Komputer\kosmos-handover\consoles-k7\`: `STOP_K7-C.md`,
`STOP_K7-C-GATE.md`, `kontakt_k7c.html`, `shots/k7c/`, `probes/{k7c, run_k7c, sheet_k7c}`; fail-first / mutation worktrees removed.

- **Command DONE (K7-A / pre / B / C):** header chips `[ TAKTYKA SYSTEMU ] [ JEDNOSTKI ] [ ATLAS GWIAZD ] [ LOGISTYKA ]`; registry (§20),
  dormant 2D map and left fleet list removed (§21), ship / fleet inspector (§22), and in K7-C the last four surfaces — no Command page
  stands on today's opaque background any more. Each tab has its own 4-zone split (`CommandPagesView.PAGES`).
- **Owner decisions in session (2026-11-17, asked before code):** Atlas = **bodies of the active system** (today's content; the brief's
  known-systems list + galaxy mini-map was new content); Jednostki = **colonies + recruitment** (page-local colony; the global active
  colony is never switched — like the Trade colony context).
- **Enemy panel:** name / empire only at full contact; an unidentified contact shows only its distance from home (fog of the same
  `_isEnemyTracked` predicate); status in alert role; known / unknown facts; no actions today → a line says where to order (map, right
  click); today's only zone `back_to_shipyard` = `[ STOCZNIA ]`.
- **Mission setup:** steps Typ → Cel → Opcje → Potwierdź read top to bottom; target list (out of fuel range: no zone + reason); confirm
  with distance / flight time / fuel / arrival, options (repeat, return cargo), `[ WYŚLIJ MISJĘ ]` full width, disabled with the fuel
  reason. `_missionConfirmFacts` is the single source for the OFF drawing and the console.
- **Atlas:** list of bodies (explored X / Y, colonies), hero = orrery (planet orbits only, capital ◆, colony ring, own ships ▲, unexplored
  bodies without names; list ↔ orrery = one selection), inspector = body + today's `map_body` (`[ ZAZNACZ NA MAPIE ]`) and `atlas_report`
  (`[ RAPORT CIAŁA ]`, unexplored: reason) + deposits, strip = one-line summary. New zone `atlasSelect`.
- **Logistics:** list = «+ Nowe zlecenie» + orders (progress, bottleneck in alert role: empty pool / queued / waiting for cargo); hero =
  routes between colonies (warp dashed, delivery progress, red = bottleneck); inspector = builder (from / to / goods / [−] qty [+] [✕] /
  `[ UTWÓRZ ]` with the missing-step reason; dropdowns inside the zone) or the selected order (per-good progress, ships and phases,
  `[ ANULUJ ZLECENIE ]`); strip = ships en route. All 15 `logi_*` types kept; new `logiSelect`. The qty `<input>` is placed from the zone
  rect × UI scale (no `window.inner*`): measured (1455, 281, 58×23) at 1600×1041, (1164, 225, 46×18) at 1280×833.
- **Ground:** list = player colonies with unit counts; hero = unit table + archetype tile grid; inspector = archetype (stats, counters,
  costs by name, barracks, `[ REKRUTUJ W: X ]` or the reason: no colony / tech / barracks level / slots / cap / cost) or the selected unit
  (HP, organisation, morale, supply). Recruitment targets the page colony through the panel's injectable colony source (swapped for the
  click, restored — pinned). GroundUnitPanel's other hosts (unit designer, colony draft) unchanged except fixes 753 / 754. New zones
  `groundColony`, `groundUnit`.
- **Owner changes at the gate:** (1) Atlas inspector lists **all** non-depleted deposits (name, ★, amount; scrolls; actions moved above the
  orbit block; unexplored body still hides them); (2) orrery **+9.8 % radius** (full hero height with the legend in the free corner, strip
  40 → 22 px, margin 18 → 5) — owner OK; (3) Jednostki tiles and table icons use the **owner's unit models**: GLB in
  `assets/units/ground/humanity/` → `GroundUnitFactory.loadUnitSprite` → `GlbSnapshotRenderer` (256 px, rendered once, cached by the
  panel); the console reads the same cached image (`img._kosmosAsset` = glb / png / missing / loading), glyph only when missing; tiles ≈2×
  (≈96 px thumbnail) in a grid under the unit table, locked tiles keep the model at 60 % + lock + reason; fits 1280×833 (pinned).
- **Approved deviations:** (1) Atlas and Jednostki per the session decisions, not literally per the brief; (2) the recruitment panel's
  hover-only zones (`stat_hover`, `ability_hover`, `counter_hover`) replaced by inline text (a click did nothing); (3) body / order
  actions only after selection (row = select, as the registry); (4) enemy without actions — a line names where to order; (5) Logistics
  steppers as chips, the empty page says «kreator po prawej»; (6) recruitment into the page colony via the panel's colony source.
- **Findings:** **750 ⚪** filed — the `map_body` «set mission target» branch is unreachable since K7-pre (`_switchTab` drops the select
  step, the 2D map is gone), so the Atlas chip «Ustaw jako cel misji» is theoretical · **751 ✅** cargo window and body report anchored at
  the console inspector (`applyModalAnchor`, K7-B mechanism; `_dialogAnchor(zone, { anyTab, minWcss })`; OFF centred) — measured cargo
  (1160, 113, 440) and report (1080, 113, 520) at 1600×1041 · **752 ✅** FleetManagerOverlay literal ratchet 5 → 3 (measured 3 already on
  `880a81b`) · **753 ✅** (`4e71750`) the panel never shows a raw archetype id (`_archName`: faction name → `unit.<id>.name` → «unnamed
  unit»; tile tag SUPPLY) · **754 ✅** (`7e59e26`) every archetype resolves to an existing GLB: garrison `catalogSprite` = mobile model
  (a new player unit starts mobile; the colony map keeps deriving `_mobile` / `_deployed` from the base path), ground_supply_unit faction
  entry with `human_supply` · **755 ⚪** filed for KZ — console text over a bright close-up planet (camera near a body) loses readability
  in the list / inspector zones; KZ to strengthen the zone text treatment over a bright backdrop. Next free: **756**.
- **Keepers:** `console_command_pages_smoke` 296/0 — E enemy zones ON == OFF + fog; G configurator zones ON == OFF in 8 states + reasons +
  reading order; A Atlas actions per body ON ⊇ OFF, list ↔ orrery, fog, config target; L Logistics actions ON == OFF in 7 builder states +
  orders + qty input at 1600×1041 / 1280×833 + bottleneck; N Ground actions ON == OFF, page colony, recruitment target, other hosts
  unchanged (draw log + zones ON / OFF), chips keep every page's state; P post-gate: all deposits, model thumbnail used when present
  (glyph only when missing), 753 on every host, 754 every GLB on disk, tile grid inside the hero without overlap at both sizes, 751
  anchors; R reason / label keys PL + EN. `transport_ui_render_smoke` pinned to flag OFF (guards today's page). Fail-first on `880a81b`:
  76/121 green = only equivalence pins (the base drew ON with today's panel) and witnesses; mutations 20/20 + 4/4 red; 754 pin red on
  the old data. Sweep 425/425, `check-i18n` PASS (+131 `cmdPages.*` keys, parity kept).
- **Live engine (CDP mouse + keyboard, GATE-S4, 1600×1041):** 5 themes, 1280×833, OFF, base — 0 page exceptions. Staged with the real
  API: 2 hulls, a ground unit, an outpost (`createOutpost`); enemy selected via `_selectedVesselId`. Orbit mission sent (idle / docked →
  on_mission / in_transit); Atlas list + orrery select + one `body:selected`; report anchored; order created with a typed qty of 40;
  page colony switched (global active colony unchanged); 7 / 7 archetype models ready; chips tour keeps state; close.
- **Next:** remaining arc steps per §6.1 — KZ (flags permanent, OFF paths removed) for Command, Civilization and the other screens; 750 and
  755 go there.
