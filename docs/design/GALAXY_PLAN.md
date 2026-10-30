# GALAXY_PLAN — the galaxy map becomes a mode of the main 3D view

> **Status: Phase A — read-only audit + plan, SIGNED by the owner 2026-10-30 (§0.2, §5 column "Signed"); NIEBO in progress.**
> Anchor HEAD `e2f7943` (= origin/main).
> Nothing is implemented. The only repo file written by this phase is this plan; the handover folder is
> `C:\Users\Komputer\kosmos-handover\galaxy-phase-a\` (`STOP_A.md`, probes, results). Measurements ran in a scratch clone
> (`E:\kosmos-work\galaxy-phase-a\tree`, `git clone --shared`, read-only against the owner's objects) — the owner's tree
> was not touched (no `src/` edits, no keepers, no commits). Committed with the owner's signatures in
> `docs(GALAXY A): phase A plan + owner signatures` — the anchor of NIEBO.
> **Next free finding number after this plan: 600** (this plan files **#588–#599**; 578–587 are taken in
> `VESSEL_ORDERS_PLAN.md`).

## §0 Owner's frame (signed 2026-10-30 — verbatim; not relitigated, the plan is built around it)

Goal: the galaxy map stops being a tab of the Command overlay (key G → FleetManagerOverlay
tab 'stratcom') and becomes a MAP MODE of the main 3D view, swappable with the system map,
with a seamless transition, a visibly better look, and warp orders (ships and fleets) issued
from it. After the recent HUD + tab-reform arcs the system map is the visual benchmark; the
galaxy map must reach it, not stay in the pre-HUD idiom.

Decisions already taken by the owner:
- F1 ARCHITECTURE = "one scene": the galaxy lives inside ThreeRenderer's scene as a group
  (home at origin, a galaxy unit multiplier, e.g. ~40 world units per ly). StratcomGalaxyRenderer
  (separate WebGLRenderer, offscreen + drawImage) is to be RETIRED at the end of the arc.
  Precedent for the mode switch: TacticalModeController (snapshot → flyTo → restore).
- F2 TRANSITION = camera fly-out/fly-in. Leaving a system: HUD fades, camera dollies past the
  system frame, planets/orbits fade, the star shrinks to a point that IS the home point of the
  galaxy plate (both at origin), camera tilts to the holotable oblique (pitch 0.92, yaw 0.6 —
  constants already in HolotableCamera.js), galaxy fades in, galaxy labels last. Entering a
  system from the galaxy: short flight over the plate to that star, then dolly-in. The sky
  (star field + nebula) must stay bit-for-bit continuous across the transition.
- F3 ENTRY POINTS = (a) a two-segment pill [ SYSTEM ] [ GALAXY ] in the T5/B-3 chip idiom at the
  CENTRE of the bottom strip (between the layer chips and the zoom slider/clock);
  (b) key G toggles the mode (it no longer opens the Command overlay); (c) the left outliner
  tree root; (d) SEMANTIC ZOOM: in system view, 2 further wheel-out notches within ~0.6 s at
  MAX_DIST (hysteresis guard) trigger the fly-out; in galaxy view, wheel-in below the galaxy
  floor dives into the SELECTED system, else the system nearest the camera target — the dive
  target shows the selection brackets ⌜⌟ while approaching. The zoom slider spans the
  galaxy range in galaxy mode (maxDist becomes mode-dependent).
- F4 OUTLINERS stay in galaxy mode. Left: same system rows, NO body sublists; the expansion
  is (1) an info line (owner per intel, distance ly, spectral type, colony count), (2) the
  player's colonies and stations in that system (click → enter system focused on that body),
  (3) foreign colonies per intel (contact → names; rumor → count "?"; unknown → nothing;
  the SystemReveal canon). In galaxy mode the list = all systems with a revealed NAME
  (unexplored dimmed with ○), not only visited/owned (D-UI-3 stays for system mode).
  Right: ships filtered to warpFuel.max > 0; the "In transit" section stays; a fleet is shown
  if at least one member is warp-capable, non-capable members dimmed; a fleet warp order on a
  mixed fleet refuses and names who cannot jump.
- F5 LOOK. Stars: the same PSF point-sprite shader as the background star field (shared code),
  sized by luminosity, HDR > 1 for bloom; unexplored at 0.5; home/selected with a halo.
  No textured spheres. Territory ("rich, not poor"): A pooled-light shader plane from the
  influence field (soft core, thin bright rim from the field gradient, hot white contested
  seam, 1–2 % breathing) replacing the CanvasTexture mask + LineDashedMaterial isolines;
  B low translucent border curtains extruded from the isoline loops, fading with height;
  C ownership halo on owned stars in the empire colour. Empire colours stay
  EMPIRE_COLOR_PALETTE (identity); hostility stays a modifier (pulse); all chrome from HUD
  theme roles (H0 rule). Risers only for owned systems + the selected star. Observatory
  range as the H1 radar ping from home to rangeLY, not 4 concentric rings. MST warp lanes
  (H6) stay. Ship blips sit on a rail beside the star like label stacks (they must never
  steal the star's click — this closes the old "warp ship in system eats the star click" bug).
  Galaxy chrome = the label idiom: uppercase name under the star, hover expansion, click pin
  with actions [ Enter ] [ Send ▼ ] [ Scan ] [ Beacon ] [ Gate ]. The detail panel and the
  warp order panel of the stratcom tab disappear.
- F6 WARP FROM THE GALAXY. Ship/fleet-first: selection in the right outliner → right-click a
  star → RightClickMenu entry "Warp to X — N jumps, ETA, fuel" (planWarpRoute); hovering a star
  with a selection draws the route preview (polyline through intermediate systems, hop points,
  role primary; unreachable in role dim with the reason in the expansion). Star-first: pin →
  [ Send ▼ ] → picker of warp-capable ships. Single ship uses the existing
  OrderService.issueWarp. FLEET warp is a NEW MECHANIC: OrderService.issueFleetWarp(fleetId,
  systemId) → WarpRouteSystem group journey: ONE plan from min(maxHopLY) and the most
  constrained tank across members, the same hop list for every member, a shared arrival angle
  (SB54 mechanism), refuse the whole fleet if any member fails canOrder.
- F7 SKY ("NIEBO") — a separate small step BEFORE G1: the background star field is today built
  ONCE in ThreeRenderer._buildBackground (:594, called at :581) from Math.random() — identical
  in every system AND different on every launch; switchSystem never rebuilds it. Replace with a
  SkyCatalog: one catalogue generated from GALAXY_SEED — ~7 000 filler stars with real 3D
  positions in a shell ~30–3 000 ly around the galaxy, PLUS the 71 real systems from galaxyData
  with their spectral colour and luminosity. For the active system: direction =
  (starPos − systemPos), brightness from luminosity / d². switchSystem recomputes the position
  attribute (same geometry). Nebula dome stays static (physically right). The galaxy map later
  takes its stars from the same catalogue, and during the fly-out the real-system background
  stars fade as the galaxy points fade in (one set → no doubles).
- F8 PROCESS. Light UI loop (HUD_PLAN §4.0 annex): one flag per step, build → owner looks →
  tune, keepers ONLY for logic (wheel hysteresis, dive-target rule, fog-of-war in outliner
  expansions and labels, warp-capable filter, SkyCatalog maths: seed determinism, directions,
  parallax between two systems), contact sheet on 5 themes where drawing is involved, one commit
  per step + docs. The FLEET WARP mechanic (G4) gets the full gate (keepers with fail-first,
  live gate). Owner's scope rule: do not add steps on your own — anything beyond F1–F7 goes to
  §7 as an option.

Proposed cut (refine, do not replace): NIEBO (F7) → G1 galaxy in the scene behind
FEATURES.galaxyView + pill + G + outliner root + outliner galaxy modes + hard cut with fade →
G2 fly-out/fly-in, wheel gesture + dive rule, label hover/pin with actions, territory A+B+C,
halos, risers rule, ping → G3 single-ship warp from the galaxy (right-click, [ Send ▼ ],
route preview) → G4 fleet warp (mechanic, full gate) → G5 cleanup by the T4 method
(stratcom tab out of Command, StratcomGalaxyRenderer deleted, 5 stratcom keepers migrated or
retired, flag permanent ON).

### §0.1 Where the measurement forces a reading of the frame (summary — evidence in §1, decisions in §5)

Not a relitigation: each item below is a place where the frame, read literally, collides with code or with a
measured number. The plan keeps the intent and asks for a signature on the reading.

| # | Frame text | What the code / measurement says | Reading proposed | Decision |
|---|---|---|---|---|
| 1 | F1 "home at origin" + F2 "the star shrinks to a point that IS the home point" | The system star always sits at world (0,0,0) (`GameScene.js:4561-4574`, `ThreeRenderer` star group at origin), but the active system is not always home — the player can be in any generated system when leaving it | the **active** system sits at the origin (floating origin), i.e. the plate is translated by −P_active·K; for home this is exactly F1 | D-GX-2 |
| 2 | F1 "~40 world units per ly" | measured on 40 seeds (`results/galaxy_scale.json`): at K = 40 the active system's orbit disc (MAX_ORBIT_AU 35 × 11 = 385 WU = 9.6 ly) covers a **median 23 neighbouring stars (max 34)**; at K = 140 → median 0 (max 2), K = 200 → 0 (max 0) | K = 200 if cross-fades overlap in time; K = 40 only with strictly sequential fades | D-GX-1 |
| 3 | F3(c) "the left outliner tree root" | there is no root row: the header `UKŁADY [n]` click is consumed with no action (`OutlinerColumn.js:301, :308`) | a root row is added (galaxy entry) — or the header becomes the entry | D-GX-9 |
| 4 | F4 "list = all systems with a revealed NAME" | the tree source is `StarSystemManager.getAllSystems()` (generated systems only, `SystemTreeLogic.js:168-174`, `LeftOutliner.js:104-119`); `switchActiveSystem` refuses a never-generated id (`StarSystemManager.js:145-149`) | galaxy mode reads `galaxyData.systems` + `SystemReveal`; rows of never-generated systems have no "enter" | D-GX-10 |
| 5 | F4 "(3) foreign colonies … contact → names" | AI home systems are generated at galaxy bootstrap, so their bodies exist in `EntityManager` before the player has seen them; body names are a PLACE-axis fact in the `SystemReveal` canon (`SystemReveal.js:6-18, :63-64`) — names at `contact` alone would re-open the Finding 186 / 188 class | names need **place ∧ contact**; `ownerExists` → "?"; else nothing | D-GX-11 |
| 6 | F5 pin actions "[ Beacon ] [ Gate ]" | the FMO handlers `cluster_beacon` / `cluster_gate` have **no producer anywhere in `src/`**, and the backend `StarSystemManager.buildBeacon` / `buildJumpGate` is free, instant and tech-less; a beacon gives ×3 warp speed into the system (`VesselManager.js:984`) — Finding **590** | chips shown disabled ("not available") until a mechanic exists — or omitted | D-GX-17 |
| 7 | F6 "a shared arrival angle (SB54 mechanism)" | SB54 is AI-only: `issueGroupAttack` refuses player hulls (`OrderService.js:226`, `not_ai_vessel`) and the player warp path `WarpRouteSystem.beginJourney` takes no options (`OrderService.js:158`); the group start is not transactional across members (`OrderService.js:243-246`) | G4 extends the PLAYER path (route + speed + angle passed in); validate-all → dispatch-all | D-GX-19 |
| 8 | F7 "~7 000 filler stars … 30–3 000 ly" + "parallax between two systems" | with a volume-uniform shell, **96.5 % of filler stars lie beyond 1 000 ly** and their parallax between the two farthest systems is median **0.43°** (max 1.2°) (`results/sky_cost.json`); the visible parallax comes from the 71 real systems | keep the real density; the 71 real systems carry the parallax — or bias the radial law | D-GX-5 |
| 9 | F7 "one catalogue generated from GALAXY_SEED" at the sky's build time | the sky is built in the `ThreeRenderer` constructor (`GameScene.js:208` → `ThreeRenderer.js:581`), the galaxy (and its seed) appears only at `GameScene.js:2156-2165`, and a load never calls `switchSystem` (`StarSystemManager.restore` forces home) | the catalogue is attached once `galaxyData` exists, and recomputed on load explicitly | D-GX-6 |
| 10 | F3(d) "2 further wheel-out notches within ~0.6 s" | the controller consumes raw `deltaY` per event (`ThreeCameraController.js:113-137`); a trackpad sends dozens of small events per gesture; browsers differ in `deltaMode` (line mode ≈ 3 per notch where it is used) | count accumulated, normalised wheel delta beyond the clamp, not events | D-GX-7 |

### §0.2 Owner's signatures (2026-10-30)

D-GX-1 **(c)** K = 200 · D-GX-2 **(b)** the active system at the origin · D-GX-3 as recommended · D-GX-4 **(a)**
follow-camera dome · D-GX-5 **(a) + (ii)** · D-GX-6 · D-GX-7 · D-GX-8 · D-GX-9 · D-GX-10 as recommended · D-GX-11 **(b)** ·
D-GX-12 **(b)** · D-GX-13…16 as recommended · **D-GX-17 (c) OMITTED** — [ Beacon ] / [ Gate ] do not appear in the pin
until a mechanic exists (§7 O5); their dead i18n keys join the G5 retire list (§6) · D-GX-18…22 as recommended.
The readings of §0.1 (1–10) are accepted with these decisions. **Finding 597:** the dead sky config is retired in NIEBO
(`BACKGROUND_COLOR`, `STAR_COUNT_BACKGROUND`, `THEME.starfield` + the per-theme overrides) — the sky is physical, not
themed. **§7 stays unscheduled.** The commit carrying these signatures (`docs(GALAXY A)`) is the anchor of NIEBO.

## §1 Inventory (read-only, HEAD `e2f7943`) — A1–A15

Line numbers are for HEAD `e2f7943`. Paths are relative to the repo root. "Probe" = a script in
`kosmos-handover\galaxy-phase-a\probes\` run in the scratch clone (results in `results\`). "Sweep" (sky / HUD /
outliner / keymap-i18n / keeper sweep) = one of the five read-only sub-inventories of this phase; their findings are
folded into the tables below and spot-checked (160 explicit `file:line` references verified mechanically against the clone).

### A1 — the sky in `ThreeRenderer` today

| Element | Where | Facts |
|---|---|---|
| Build | `src/renderer/ThreeRenderer.js:594-728` (`_buildBackground`), called once from the constructor `:581` | **7 000** points (`:595`), radius `300 + Math.random() * 700` around the WORLD ORIGIN (`:611-616`), palette drawn from `Math.random` (`:603-620`, it even has O/B/A colours that `STAR_TYPES` does not), intensity `0.05 + 2.6·b⁶` (top ~3 % HDR > 1 → bloom) and size `1.6 + 3.4·b⁵` px (`:622-626`), phase (`:626`) |
| Star shader | `:639-671` (`starVert` / `starFrag`, PSF = gaussian core `exp(-38 d²)` + halo `0.18·exp(-9 d²)`, `gl_PointSize = aSize·uPx`), material `:672-683` (additive, `transparent`, `depthWrite:false`, depth TEST on, log-depth chunks when `logDepthOn()` `:677-678`) | the shader is local literals; keeper `log_depth_chunks_smoke.mjs:251-252` pins the literal `logDepthOn() ? withLogDepthVertex(starVert)` / `…withLogDepthFragment(starFrag)` |
| Twinkle | `:686` `this._starTwinkleUniform = starMat.uniforms.uTime`, ticked in the loop `:3632` | the ONLY handle kept |
| Points object | `:689` `this.scene.add(new THREE.Points(geo, starMat))` | **no handle** — cannot be moved, recoloured or rebuilt today |
| Nebula dome | `:694-727`: FBM band (axis `normalize(vec3(0.25,1,0.18))` `:714`), peak 0.014 linear, `BackSide`, `depthWrite:false`, `depthTest: !logDepthOn()` (D-D3 — "sky dome, not a depth participant", `:695-700`), `SphereGeometry(1400)` `:725`, `renderOrder -2` `:726` | **no handle**; keeper `log_depth_chunks_smoke.mjs:255-256` pins `depthTest: !logDepthOn()` and NO chunks on the nebula |
| Renderer / camera | `:252` `logarithmicDepthBuffer: true`; `:257` pixel ratio ×1.5 (cap 2); `:262-264` ACES 1.12 + sRGB; `:375` `PerspectiveCamera(55, W/H, 0.001, 5000)` | far = 5 000 WU |
| Bloom | `:388-411` one composer `RenderPass → UnrealBloomPass(W,H, 0.5, 0, 1.0)` + `bloomFactors [1, .7, .4, .15, .03]` → `OutputPass`; resize `:414-421` | bloom works in screen space at canvas resolution — independent of camera distance |
| Lights | `:731-744` ambient + `PointLight(…, 2.8, 0, 0)` at origin | kept across `switchSystem`, re-tinted by `renderStar` |
| `switchSystem` | `:1253-1267` → `_disposeAllMeshes` (`:1300-1446`) + `initSystem` (`:1233-1249`) | **never touches the sky** (and never touches the composer, lights, camera object) |
| Thumbnail / bake scenes | `renderBodyThumbnail` `:5527-5560` (own scene, flat background `0x020405` `:5547`; dead per V-254), planet bake `:1769`, `GasGiantShader.js:589` | no sky; unaffected |
| Other sky code | `GlbSnapshotRenderer.js:43,49` (transparent), `PlanetGlobeRenderer.js:121-134` (transparent), `BattleView3D._buildScene` (own 600 random points `:104-119`, reuses the main WebGLRenderer via `suspend()`), `TitleScene` / `FactionSelectScene` / `EndgameScene` (DOM `div` stars, own `Math.random`), `StratcomGalaxyRenderer` (PNG `deep_space.png`, screen-fixed `:131-149`) | **nothing shares `_buildBackground`** (sky sweep) |
| Dead config | `GameConfig.js:34-35` `BACKGROUND_COLOR`, `STAR_COUNT_BACKGROUND: 250`; `ThemeConfig.js:41` `starfield` + 10 per-theme overrides (`:484 … :761`) | zero readers (grep) — Finding **597** |

**Is the sky one group that can follow the camera?** No: two separate objects added straight to `this.scene` at the
world origin, no handles (`:689`, `:727`). Following = wrap both in one `Group` held as `this._sky`, set
`group.position.copy(camera.position)` after `cameraController.update()` (`:3677`) and before the composer
(`:3717`); rotation stays world-aligned (directions are directions).

**What breaks at a camera distance of ~2 000–3 000 WU (K = 40) or ~11 500 WU (K = 200):**
1. **The camera leaves the star shell (r ≤ 1 000) and the nebula sphere (R = 1 400).** The shell becomes a visible
   ball of stars around the system and the `BackSide` nebula becomes a disc (the far hemisphere seen from outside).
   This is not hypothetical even today: `MAX_DIST = 450` from a target that may sit ~385 WU from the origin puts the
   camera ~835 WU out — inside the shell's 300–1 000 band, so some "background" stars lie between the camera and
   the system and can draw over planets (depth test passes) — Finding **591**.
2. **Far plane.** At K = 40 the farthest plate point stays ≈ 4 460 WU from the camera (preset + pan clamp 30 ly +
   galaxy radius) — inside 5 000. At K ≥ 80 it does not (K = 200: ≈ 22 300 WU) → a mode-dependent far plane.
3. **Depth precision:** none at issue — with `logarithmicDepthBuffer` the relative resolution is ≈ ln(far+1)/2²⁴
   (5·10⁻⁷ at far 5 000, 6·10⁻⁷ at far 40 000).
4. **Bloom:** nothing (screen space).

### A2 — scale: galaxy extent vs system units (probe `probe_galaxy_scale.mjs`, 40 seeds, real `GalaxyGenerator`)

Generator: `src/generators/GalaxyGenerator.js:17-20` — `SYSTEM_COUNT 72` (home + 71), `MIN_DIST_LY 2.0`,
`MAX_DIST_LY 22.0`, `Z_SPREAD 5.0`; position `dist = 2 + rng()·20` (radius-uniform, so systems cluster near home),
`z = ±5` (`:150-156`); home at (0,0,0) (`:123-135`); units = ly; Three mapping X = gx, Y = gz (height), Z = gy
(`StratcomGalaxyRenderer.js:174-175`, `HolotableCamera.js:56-63`). System units: 1 AU = 11 WU
(`ThreeRenderer.js:70-71`, `AU_TO_PX 110 / WORLD_SCALE 10`), `MAX_ORBIT_AU 35` (`GameConfig.js:25`) → an orbit disc
of up to **385 WU**; the system frame is `clamp(maxOrbitAU × 20, 70, 450)` (`ThreeCameraController.js:188-197`).

| Measured (40 seeds) | min | median | max |
|---|---|---|---|
| galaxy radius from home, 3D [ly] | 21.18 | 21.87 | 22.51 |
| z range [ly] | −5.00 … | −4.90 / +4.94 | … +5.00 |
| nearest neighbour of home [ly] | 2.14 | 2.92 | 3.92 |
| minimum pair separation [ly] | 2.00 | 2.06 | 2.35 |
| systems within 7 ly of home | 9 | 13 | 23 |
| reachable from home at `WARP_MAX_JUMP_LY 10` | 71 | 72 | 72 |
| stratcom camera `fitDist` (`StratcomGalaxyRenderer.js:165-166`) [ly] | 55.5 | 57.3 | 59.0 |

| K [WU/ly] | camera preset [WU] (median / max) | farthest plate point from camera [WU] | active orbit disc in plate ly | neighbours of home INSIDE that disc (median / max) |
|---|---|---|---|---|
| 1 | 57 / 59 | 111 | 385 | 71 / 71 |
| **40** (frame) | 2 292 / 2 359 | 4 460 | 9.6 | **23 / 34** |
| 80 | 4 584 / 4 719 | 8 920 | 4.8 | 5 / 12 |
| 140 | 8 022 / 8 258 | 15 610 | 2.75 | 0 / 2 |
| **200** | 11 460 / 11 797 | 22 299 | 1.93 | **0 / 0** |

Reading: K only matters where the system and the plate are visible AT THE SAME TIME (the cross-fade). At K = 40
the fading orbit disc of the active system covers ~23 neighbouring stars; at K = 200 every neighbour lies outside
it for all 40 seeds. Authoring the plate in ly inside one `Group` with `group.scale = K` makes K a single constant
(D-GX-1). `logarithmicDepthBuffer: true` handles any of these ranges; the far plane is the only knob that must move.

**Camera preset proposal:** pitch `DEFAULT_OBLIQUE_PITCH 0.92` (from zenith — `HolotableCamera.js:20`; maps 1:1 onto
the controller's `_phi`, same convention `x = d·sinφ·cosθ, y = d·cosφ` — `ThreeCameraController.js:168-178` vs
`HolotableCamera.orbitPosition` `:29-37`), yaw 0.6 (`FleetManagerOverlay.js:471`) → `_theta`, distance = stratcom
`fitDist × K` (≈ 57 ly × K), galaxy floor ≈ 6 ly × K (stratcom wheel clamp `[4, 600]` ly — `FleetManagerOverlay.js:1617`),
galaxy max ≈ 120 ly × K, pan clamp ±30 ly × K (`FleetManagerOverlay.js:1784`).

### A3 — `ThreeCameraController` and the zoom slider

| Item | Where | Note for a mode-dependent range |
|---|---|---|
| `MAX_DIST = 450` | `src/renderer/ThreeCameraController.js:19` | module constant; read by `wheelZoom`, `setTargetDist`, `frameSystem`, `maxDist` |
| wheel listener on `window` | `:113-120` | blocked when an overlay is open (`:116`) or over UI (`:118`); passes RAW `deltaY` |
| `wheelZoom(deltaY)` | `:128-137` | ADDITIVE step, speed by distance band; ≥ 20 WU → 0.05 WU per px ⇒ 5 WU per 100-px notch — useless at galaxy distances (2 300 … 11 500 WU); the stratcom map uses MULTIPLICATIVE ×1.12 / ×0.89 per event (`FleetManagerOverlay.js:1617`) |
| `update()` lerps | `:139-166` | angles ×0.12, dist ×0.08, target ×0.08 PER FRAME — frame-rate dependent; a fly-out cannot ride on them (the intro uses a driver that neutralises them — A4) |
| drag | `:77-109` | LPM drag = ORBIT (θ/φ, φ ∈ [0.1, 0.9π]); the holotable is PAN on a fixed oblique (`HolotableCamera.panScreenToWorld` `:45-54`, FMO `:1778-1786`) |
| `minDist` getter (501 floor) | `:242-247` | `STAR_ZONE_MULT 1.3 × R` around the origin → floor `2.2 R`; in galaxy mode the target sits on the plate (active star at the origin) — the 501 floor (≈ 8 WU) is far below any galaxy floor, harmless |
| `maxDist` getter | `:255` | single source of the slider range (U4-4) |
| `setTargetDist` / `snapDist` / `flyTo` | `:250-262`, `:290-299` | all clamp to `MAX_DIST` ⇒ `flyTo` CANNOT reach galaxy distances today |
| `frameSystem` / `_defaultDist` | `:188-197`, `:41` | snaps θ/φ/dist/target — called inside every `switchSystem` (`ThreeRenderer.js:1248`) |
| `snapshotView` | `:276-283` | used by tactical mode; captures goal values |
| zoom slider | `src/ui/ZoomSliderLogic.js:13-38` (pure, log scale over [min,max]); `src/ui/BottomControlBar.js:278-293` (knob from `_targetDist`, `minDist`, `maxDist`), `:312-317` (`setTargetDist`), `:348-355` (`wheelZoom` over the slider) | reads `cam.minDist` / `cam.maxDist` every frame ⇒ a mode-dependent getter is enough for the slider |
| wheel over the slider | `src/scenes/UIManager.js:2228-2230` | same `wheelZoom` |

**Minimum for F3(d) without touching system-mode behaviour (U4-4, 501):** (1) a mode field in the controller
(`'system' | 'galaxy'`), `maxDist` / `minDist` / `wheelZoom` / `setTargetDist` branching on it, `MAX_DIST` and the
501 floor untouched in `'system'`; (2) the semantic-zoom detector OUTSIDE the controller (pure state machine fed by
the same wheel event and by `_targetDist === maxDist`), so the system branch of `wheelZoom` stays byte-identical;
(3) a pan drag in `'galaxy'` (pure maths already in `HolotableCamera`).

### A4 — `TacticalModeController` / `TacticalModeLogic`

| Part | Where | Reusable for galaxy mode? |
|---|---|---|
| snapshot → `flyTo` → restore 1:1 | `src/ui/TacticalModeController.js:25-58`, plans `src/ui/TacticalModeLogic.js:15-44` (pure) | **yes — the pattern** (pure enter/exit plan + 1:1 restore); the camera mechanics no (`flyTo` clamps at 450, lerps are fps-bound) |
| `tactical:modeChanged` event | `:42`, `:56` | yes — `galaxy:modeChanged` |
| auto-exit when an overlay opens | `:61-63` (called per frame from `UIManager` draw) | policy question (D-GX-8): an overlay over the galaxy can stay |
| layer re-sync (`uiPrefs.sensorOverlayVisible`, `setTacticalStyle`, glyphs) | `:69-79` | tactical-only |
| `TACTICAL_PHI 0.12` preset, `switchSystem` re-styling | `TacticalModeLogic.js:8`, `ThreeRenderer.js:1261-1266` | tactical-only; galaxy mode must exit tactical first (Y in galaxy = no-op) |
| camera driver precedent | `GameScene.js:5124-5172` (intro): `applyPose` writes `_theta/_phi/_dist/_targetDist/_target/_goalTarget` and nulls the angle goals each frame, time-based easing; input swallowed by a capture listener; renderer slot `setCinematicDriver` (`ThreeRenderer.js:3556`, called before `cameraController.update()` `:3660-3666`); `resetToSystemView` is a no-op while a driver runs (`:4104`; `_frameActiveSystem` inside `switchSystem` is not, but a driver that re-applies the pose every frame overrides its snap) | **yes — this is the transition mechanism** (D-GX-14) |

### A5 — raycast / hit-testing

| Step | Where | Galaxy-mode consequence |
|---|---|---|
| scene click chain | `GameScene.js:5550-5556`: `uiManager.handleClick` (HUD first: `UIManager.js:2199-2202`) → else `threeRenderer.handleClick` → `_handleTacticalLeftClick` | galaxy pick must sit between the HUD and the system picker |
| `ThreeRenderer.handleClick` | `:3071-3126`: (1) ship screen-pick `_pickVesselForClick` `:3132-3137` (6 px core on a body disc, hovered ship, else nearest within **40 px**), (2) stations raycast recursive + `userData.stationId` walk-up `:3099-3113`, (3) `_clickable` raycast `:3115-3123`, (4) `body:deselected` `:3124` | all four are system-mode; must be bypassed in galaxy mode |
| hover | `handleMouseMove` `:3351-3397`: `_clickable` raycast → `planet:hover`; ship screen-pick 28 px (`visibleOnly` false) | same |
| **hidden ≠ unpickable** | three r171 `intersect()` tests only `object.layers` (`src/lib/three.core.js:34655-34680`) — `visible = false` objects are still hit | hiding the system layer is NOT enough: route by mode at the top of `handleClick` / `handleMouseMove` (or move system objects to a layer the raycaster skips) |
| box select | `_getOwnVesselsInScreenRect` `:3497-3519` (SHIFT, `fcMultiSelect`) | system-only; no-op in galaxy |
| galaxy stars | 72 points, screen-space nearest-centre pick (the rule of `StratcomHitLogic.pickStarZone` — Finding 109) on projected plate positions | no raycast; blips/labels never steal the star (rail + `onDisc`-style veto — A6) |

### A6 — HUD layer: what assumes "ecliptic / AU / bodies", what is generic (HUD sweep)

**Fed by pull:** `HudLayer` (`src/ui/HudLayer.js:81-443`, own rAF loop, idle = zero ctx calls `:389-395`, budget
≤ 0.5 ms CPU `:45`) reads per frame `getHudView()` (`ThreeRenderer.js:3172-3184`: matrices, `cssW/H`,
`worldPerAU = 11`), `getBodyWorldInfo` (`:3187-3210`, no visibility check), `getVesselWorldPosition/Info`,
`getStationWorldInfo`, `_getVesselAtScreen`, `_hoverPlanetId`; sublayers fixed `[Route, Radar, ShipMarker, Label,
Focus]` (`HudLayer.js:114-116`), `addSublayer` appends only (`:222`). Gate `hudGate` (`:56-64`) hides the HUD when
an overlay is open, when `_renderingEnabled` is false or the context is lost.

| Module | Assumes | Generic |
|---|---|---|
| `HudProjection` | header "point and circle in the ecliptic plane"; `arc()` samples a horizontal circle at the centre's height (`:86`); one scale `worldPerAU` (`:49`) | `point / depth / pxPerWorld` for any world point; near-plane clip `HUD_NEAR_CLIP 0.01` |
| `HudLabelLayer` | labels only for objects in the scene (`:191`), stacks by `stationGroupAnchorId` (`:193,:203`), LOD by anchor disc px (`:839`), star disc obstacles (`:714-717`), "wykr. X AU" lines (`:626-628`), pins only for bodies/stations (`:295-323`) | `placeLabelsPinned`, yield / pin memory, fade, attention, click zones rebuilt per pass (`:1105-1120`), thread / rail / box drawing (`:1230-1265`), `labelObstacles(F)` hook (`:718-720`) |
| `HudLabelLogic` | `STACK_COLLAPSE_PX 6` / `STACK_EXPAND_PX 40` (`:34-35`), `DISC_OBSTACLE_MIN_PX 3` (`:41`); `labelCandidates` = 56 candidates, **no "centred under"** (`:141-157`); `placeLabels` never hides an overlapping label (`:171`, `:188-194`) | screen-space maths, `groupByAnchor` with explicit `anchorId` (`:83`), `railRows`, `resolveLabelClick(zones, x, y, onDisc)` (`:256`) |
| `LabelHoverLogic` / `LabelPinLogic` | hover kinds label/vessel/station/body (`:84-91`), keys `c/h/s/hs/k/e` (`:98-108`); pin = selection, keys `body:` / `station:` only (`LabelPinLogic.js:47-51`), closed action switch `runPinAction` (`:419-442`) | hover memory (150 ms in / 200 ms linger), `layoutButtonRows`, `pinHitAt` (button > name > body), `pinLabelPlacement` with keep-out circles, accordion |
| `HudRadarLayer` / `HudRadarLogic` | ranges in AU (`HudRadarLogic.js:80-88`), `rW = rangeAU × wpa` and bail-out `!(wpa > 0)` (`HudRadarLayer.js:193,:210`), holders = active-system entities (`:153-157`), readout "x,x AU" (`HudRadarLogic.js:232`), ping keyed to the selection (`:131-140`) | ring geometry `:204-243` + drawing `:273-327` given a world centre and world radius (inline today), `clipRunsToRect`, `pingPhase / pingFade / pingStopReason`, `radarStyle(roles)` |
| `HudShipMarkerLayer` | iterates `tr._vessels` (sprites = active system only, `:71`), motion step in XZ (`:133`) | marker geometry, roles |
| `HudRouteLayer` / `HudRouteLogic` | routes in gameplay px → world via `wpa / AU_TO_PX` (`HudRouteLayer.js:127`), targets at `y: 0` (`:150-151`), warp rays only in the departure system (`HudRouteLogic.js:9-14, :136-148, :272-307`) | `projectPolyline` (3D world points, near clip), `marchOffset` on `simClockMs`, `routeAlpha`, dashed pieces, end glyph |
| `HudAttentionLogic` / `HudFocusLayer` | ship bracket ≥ 17 px (`:28`), body brackets hidden below 6 px disc (`:27`); targets in the active system (`HudFocusLayer.js:31-55`) | bracket geometry, attention memory |
| `HudAlertLogic` | `distanceAU` (`:102-106`), "… AU" (`:148`), `systemId` filter (`HudLayer.js:142`) | clock / envelope, store |
| `HudPalette` / `HudLayerChipsLogic` / `MapInsets` | `HUD_LAYER_KEYS = ['radar','routes','labels','orbits']` fixed, unknown layers rejected (`HudLayerChipsLogic.js:17, :57`) | roles from the theme (`resolveHudRoles` `:168-178`), chip text/width/layout, map insets (screen space) |

**Minimum seams (HUD sweep, verified against the code above):**
- **S0 mode in the frame.** A `mode` field in `F` and in the frame key (`HudLayer.js:351-374`); every system
  sublayer returns `count: 0` in galaxy mode. Galaxy mode must NOT be built as an overlay or via
  `_renderingEnabled = false` — `hudGate` would hide the HUD and `UIManager` would skip HUD clicks (`UIManager.js:2201`).
- **S1 scale.** `worldPerLY` (= K) next to `worldPerAU` in `getHudView()` and `makeHudProjector` — the projection
  maths does not change.
- **S2 star position + pick API** on the renderer (galaxy world positions and "star under cursor" in raw CSS px) —
  replaces `_hoverPlanetId` / `_isOnBodyDisc` as the hover source and as the click veto.
- **S3 sublayer order.** `addSublayer` only appends; galaxy mode needs its own sublayer list (ping and routes under
  labels, `labelObstacles` seen by labels).
- **S4 click target.** `readClickSelection` has no system entry (`ClickIntentLogic.js:77-91`) and
  `applyClickIntent` has no `system` type (`:126-164`) — either a `type: 'system'` target or pin state kept inside the
  galaxy label sublayer.
- **Galaxy labels:** an injectable candidate generator ("centred under" first), density hiding (today never hides),
  stars as circle obstacles with a floor radius, `coversPoint` / `coversUiPoint` / `pinButtonAt` on the new sublayer.
- **Ping:** extract ring geometry/draw from `HudRadarLayer` (`:204-243`, `:273-327`), unit parameter in
  `rangeReadoutText`, the ly range moved out of FMO (`_getStratcomRangeLY` `FleetManagerOverlay.js:5651-5656`) into a
  pure util, ping trigger from its own source (entering galaxy mode / Scan) with the existing `pingPhase`.
- **Ship rail:** explicit LOD (stacks collapse below 6 px — always at galaxy zoom), grouping by `systemIdOf`, fog via
  `intelSystem.getVesselContact` / `VesselReveal.enemyVesselNamed`, a rule for `systemId === null` (warp transit);
  the 40-px system ship picker must never run in galaxy mode.
- **Route preview:** `projectPolyline` / `clipRunsToRect` / `marchOffset` / `routeAlpha` already take world points;
  extract `_strokePieces` + end glyph (`HudRouteLayer.js:229-285`).

**What visibly misbehaves at galaxy distances if nothing is gated (HUD sweep):** no distance culling (colony/station
labels and brackets of the active system stay, squeezed around the origin); disc-size LOD collapses everything to
"+N"; fixed-pixel glyphs don't shrink (34-px ship brackets, chevrons); the 28/40-px ship pickers run before any star
test and would steal the home star; labels pile up (never hidden, O(n·56·placed)); readouts say "AU"; warp rays shoot
from the origin to the screen edge; the empty-map coordinate tooltip (`GameScene.js:5843-5848`) shows SYSTEM
coordinates over the galaxy.

### A7 — the stratcom tab of `FleetManagerOverlay` (what moves, what dies)

Verdicts: **M** = migrate as logic (pure module, shared by the new surfaces) · **R** = rewrite in the new idiom
(scene / HUD / outliner) · **X** = retire in G5 · **K** = keep (has a producer outside the stratcom tab).

| Symbol | Where (FMO) | Role today | Verdict |
|---|---|---|---|
| `STRATCOM_LY_BY_LEVEL = [0,0,0,0,5,10,15]`, `_getStratcomRangeLY` | `:218`, `:5651-5656` | observatory range in ly (level from `getMaxObservatoryLevel`) | **M** → pure util (HUD ping, enemy-blip gate) |
| `_stratcomWarpBlipMode` | `:5663-5667` | own / `contact` / `rumor` blip mode (intel on the VESSEL) | **M** |
| `_drawStratcomGhostBlip` | `:5670-5681` | "?" ghost of a rumor contact | **R** (HUD) |
| `_systemReveal` | `:5693-5701` | the ONE assembly point of the `SystemReveal` record (explored / scanned / intel) — Finding 188 | **M** → shared helper (plate dimming, labels, pins, outliner, menu) |
| `_stratcomVisibleSystems` | `:5703-5724` | all `galaxyData.systems` + reveal + planar distance from home + `inSensor` | **M** (galaxy list model) |
| `_stratcomOwnShipBlips` | `:5737-5769` | own warp-capable ships + jump-gate transits, fan index per star | **R** (rail model) |
| `_starRgb` / `_starPhase` / `_drawStarGlyph` | `:5774-5820` | 2D "little sun" glyphs | **X** (PSF points) |
| `_getPanelBgImage` / `_drawPanelBg` | `:5826-5858` | `deep_space*.png` backgrounds | **X** |
| `_drawStratcomTab` | `:5865-5875` | tab layout + continuous redraw | **X** |
| `_ensureGalaxy3D` | `:5881-5890` | lazy dynamic import of `StratcomGalaxyRenderer` | **X** |
| `_drawStratcomOwnerGlyph` | `:5898-5908` | owner diamond (player always, AI at `contact`) | **R** → ownership halo C |
| `_drawStratcomTerritory2D` / `…Tint` / `…Labels` | `:5913-5987` / `:5991-6008` / `:6012-6029` | 2D territory + labels (`territory.playerEmpire`) | 2D **X**; labels **R** (HUD) |
| `_buildTerritory3DPayload` | `:6032-6040` | payload for the 3D plane (fog via `resolveTerritoryVisibility`) | **R** → plate payload (same fog) |
| `_promotePendingFlashes` / `_territoryFlashFactors` | `:6043-6062` | merge-flash lazy start | **M** |
| `_territoryTintCanvas` | `:6066-6086` | offscreen tint | **X** |
| `_largestLoop` / `_loopArea` / `_loopCentroid` | `:6088-6090` | label anchor of a territory | **M** (pure) |
| `_drawStratcomGalaxy` | `:6092-6336` | the whole map pass (3D + 2D chrome, hit zones, blips, panels) | **X** (split across plate + HUD sublayers) |
| `_drawOwnedLanes` | `:6341-6363` | H6 MST lanes, flowing dash (`computeOwnedLanes`) | **R** (HUD route idiom, `marchOffset`) |
| `_drawSensorSweep` / `_drawSensorLensButton` | `:6369-6396` / `:6399-6412` | H5 lens ring + sweep + toggle (`stratcom_lens_toggle`) | **X** (F5: ping replaces; toggle = chip [R]) |
| `_drawStratcomDetail` | `:6417-6546` | system detail: name / status / owner+hostility / territory / pop / life / scan / Send / Switch | **R** → pin expansion (content), outliner info line |
| `_systemDisplayName` | `:6552-6555` | `reveal.name ? name : '???'` | **M** |
| `_buildSystemScanLayout` / `_drawSystemScanSection` | `:6560-6620` / `:6623-6676` | scan result lines + control (`stratcom_scan` `:6667`, `stratcom_scan_cancel` `:6652`) | layout **M**, drawing **R** (pin [Scan]) |
| `_drawStratcomOwnBlip` / `_pushShipBlipHitZone` / `_drawOwnShipTriangle` / `_drawMyShipMarker` | `:6690-6773` | fan of ship icons above the star + their hit zones (Finding 110) | **X** (rail; the invariant "an icon never steals the star" lives on — A10) |
| `_drawWarpRouteLine` | `:6778-6802` | remaining hops of the selected ship (cyan current / violet rest) | **R** → route preview (HUD) |
| `_warpStatusLabel` | `:6805-6814` | canOrder reason → status text (only caller `:6874`) | **M** |
| `_drawWarpShipList` | `:6819-6885` | left list of warp ships (break on overflow, no scroll) | **X** → right outliner galaxy mode |
| `_warpErrLabel` | `:6888-6905` | gate / route reason → `fleet.warpErr*` | **M** → pure module; it is ALSO called by `_toastReturnFailed` (`:6933-6946`, return-to-base paths `:2418`, `:2473`, `:2646`) |
| `_dispatchReturnJump` / `_toastReturnFailed` | `:6919-6927` / `:6933-6946` | Finding 125 return jump | **K** (not stratcom) |
| `_drawWarpOrderPanel` | `:6950-7050` | per-frame `planWarpRoute` for the selected ship + Send / Cancel / Switch | **X** → RightClickMenu entry + preview + pin [Send ▼] |
| `_drawShipPicker` (send) | `:8100-8221`, drawn over the stratcom tab `:816-819` and in `_drawRight` `:7279-7282` | ship picker for `cluster_send` | **X** → [Send ▼] |
| handlers | `:2283-2401` | `stratcom_detail_bg` · `stratcom_lens_toggle` · `stratcom_scan` · `stratcom_scan_cancel` · `cluster_star` · `cluster_switch` · `cluster_send` · `cluster_send_pick` · `cluster_send_cancel` · `warp_ship_select` · `warp_order_send` · `warp_order_cancel` · `warp_order_bg` · `cluster_beacon` · `cluster_gate` | scan → **M** (pin [Scan]); `cluster_switch` → **K** (also produced by `_drawRight` `:7723` and by `ShipPanelHudLogic.js:208`, dispatched through `fmo._handleHit` with the overlay CLOSED); `cluster_beacon` / `cluster_gate` → dead (no producer — Finding **590**); the rest **X** |
| wheel / drag / hover | `:1610-1624` (×1.12 / ×0.89, clamp [4, 600] ly), `:1734-1755`, `:1778-1798` (PAN via `panScreenToWorld`, clamp 30 ly), `:1823-1824` (`resolveStratcomZone`) | holotable camera | **X** → camera controller galaxy branch + galaxy pick |
| state | `:456-474` (`_clusterZoom/Pan`, `_clusterHoverSystem`, `_galaxyYaw 0.6`, `_galaxyPitch = DEFAULT_OBLIQUE_PITCH`, `_galaxyDist`, `_holotablePanTarget`), `:477` `_galaxyPanelRect`, `:485` `_pendingSendSystemId`; resets in `_close` `:602-629` and `_switchTab` `:634-659` | — | **X** |

Two leaks in the dying code matter for the new surfaces (they are copied as "intent" into G3, not as code):
`_drawWarpOrderPanel:7006` prints `${ship} → ${sys.name}` and `_drawShipPicker:8116` prints `→ ${targetStar.name}`
**without the reveal gate**, and the warp logs do the same (`WarpRouteSystem.js:105-106`, `VesselManager.js:1019-1021`)
— Finding **589**.

### A8 — `StratcomGalaxyRenderer`, `HolotableCamera`, `TerritoryRenderLogic`, `TerritoryField`, `TerritoryService`

| Piece | Where | Survives? |
|---|---|---|
| offscreen WebGLRenderer + own composer + bloom, `preserveDrawingBuffer` | `src/renderer/StratcomGalaxyRenderer.js:68-125` | **X** (one scene — F1) |
| PNG background `deep_space.png`, `BG_BRIGHTNESS 0.25` | `:31-33`, `:131-149` | **X** (the main sky — F7) |
| textured star spheres (`loadStarTextures`, size `unit = max(0.35, 0.022·maxR)`, `fitDist = max(8, 2.4·maxR + 10·unit)`) | `:153-253` (`:165-166`) | **X** spheres (F5: no textured spheres); `fitDist` rule **M** (camera preset) |
| riser + base dot | `:228-250` (`RISER_COLOR 0x7796b5`, `RISER_OPACITY 0.35`) | **R** (F5 rule: owned + selected only; colour from roles) |
| range rings ×4 | `:275-295` | **X** (F5: H1 ping) |
| territory plane (CanvasTexture from `poolFillAlpha`) + `LineDashedMaterial` isolines with a patched `uDashOffset`, war-pulse, merge-flash, contours | `:301-399`, `:413-430` | **X** → pooled-light shader plane + curtains (F5 A/B) |
| `setCameraOrbit` via `orbitPosition` | `:404-411` | **X** |
| `project` / `projectXYZ` | `:441-452` | **X** (HUD projector) |
| `HolotableCamera.orbitPosition` · `clampPitch` · `PITCH_MIN/MAX` · `DEFAULT_OBLIQUE_PITCH 0.92` · `panScreenToWorld` · `riserEndpoints` | `src/renderer/HolotableCamera.js:14-64` (zero imports) | **✓ all survive** (camera preset, pan, risers) |
| `resolveTerritoryVisibility` (player full · AI ≥ contact full · rumor outline · unknown skip) | `src/ui/TerritoryRenderLogic.js:11-21` | **✓** |
| `buildTerritory3DPayload` (content-hash `sig`) | `:27-45` | **✓ reshaped** (plate payload; same `sig` idea) |
| `poolFillAlpha` (front → core ×2.6) | `:50-55` | its LAW moves into the shader (A) |
| `computeOwnedLanes` (Prim MST) · `mergeFlashFactor` · `classifyPendingFlash` | `:59-95` | **✓** |
| `TerritoryField` | `src/systems/TerritoryField.js` | **✓ unchanged except one exported field** (below) |
| `TerritoryService` | `src/systems/TerritoryService.js` (116 lines) | **✓ unchanged** |

**What the pooled-light plane (F5 A) needs from `TerritoryField`:** the field is computed per owner on a SHARED grid
(`:100-114`, Float64 `exp` sum) but **not kept** — the record holds only `mask` = `min(255, round(f/ISO·128))`
(`:131-132`, saturates at f ≥ 2·ISO, so the core loses its gradient), `loops` (marching squares, `:119-130`),
`contours` (`:134-138`), `maskBounds` (`:141`) and a content `hash` (`:142`, `:179-190`). Grid: `EXTENT =
max(6, maxCoord + 2·R_MAX + cell)` (`:93`), `nx = min(200, ceil(2·EXTENT/cell) + 1)` (`:94`); with the generator's
`maxCoord ≤ 22` ly, `R_MAX_LY 4` and `GRID_LY 0.75` (`GameConfig.js:579-605`): EXTENT ≈ 30.75 ly → **nx ≈ 83** (≈ 83×83
per owner). Recompute at most once per civMonth plus on `territory:ownersChanged` (`:44-49`). Minimum addition: keep the
per-owner field as a `Float32Array` (`field`) next to `mask` (≈ 27 KB per owner per recompute; the hash and every
existing consumer unchanged). The shader then samples a 1-channel float texture (bilinear) for the soft core, derives
the rim from the field gradient, and takes the contested seam from the per-texel maximum of the OTHER owners' fields
(a second texture, or channels of one RGBA when ≤ 4 owners). Resolution at K = 200 and the galaxy preset: 0.75 ly ≈
150 WU ≈ 13 px per cell on screen — the rim inherits the piecewise-linear iso-line of the loops (same grid → plane rim
and curtains coincide); finer grid = knob (D-GX-15).

### A9 — openers of tab `'stratcom'`, key G, i18n (keymap/i18n sweep)

**Every path to the tab (three, no more):** key **G** `src/ui/OverlayManager.js:33` and key **M** `:39`, both
`{ id: 'fleet', opts: { tab: 'stratcom' } }` → `_showOverlay(opts)` → `FleetManagerOverlay.open` (`:548`, `opts.tab` →
`_switchTab` `:552`); the tab bar of the Command overlay (`FleetManagerOverlay.js:1356-1364`, click `:2182-2183`).
`openPanel('fleet', {tab…})` exists nowhere else; `src/ui/GalacticMiniMap.js` and `minimap:systemClicked` no longer
exist (removed in `db48bc4`); `CivPanelDrawer.js:38` still lists a dead `galaxy` entry (key display only — the sidebar
has width 0, `:13`); no overlay is registered as `'galaxy'`.

**Key handling order** (`src/scenes/GameScene.js:4734` keydown): ignored in inputs (`:4735`) → active overlay's
`handleKeyDown` (`:4815-4824`) → Escape chains (`:4767-4840`) → Tab (`:4843-4852`) → `overlayManager.handleKey`
(`:4855-4857`, civMode only). `handleKey` lower-cases (Shift+G matches) and for `{id, opts}` entries RE-SHOWS instead of
closing (`OverlayManager.js:64-90`). `FleetManagerOverlay` has no `handleKeyDown`, so G and M reach the keymap even
while the Command overlay is open; G inside `ColonyOverlay` also opens it. **No other code reads G.** Letters free in
civMode: A, J, Q, R (unmodified), V, X, Z (and P while `populationOverlay` is OFF).

**Pins that break when G is rebound:** `overlay_tab_entry_smoke.mjs:176-186` asserts the `{id, opts}` entries are exactly
`['g','k','m']` (all → `fleet`); other keymap pins: `hud_layer_chips_smoke.mjs:107-109`, `wp_peace_cooldown_smoke.mjs:430-436`.
Docs saying G/M opens Stratcom: `MANUAL.md:856`, `OverlayManager.js:31-32, :39`, `FleetManagerOverlay.js:551, :618-621`,
`CivPanelDrawer.js:173`, `stratcom_warp_trap_smoke.mjs:13`, `STRATCOM_CONTROL_PLAN.md:155`,
`COLONY_OWNERSHIP_GUARD_PLAN.md:1504`.

**i18n** (pl = en = 3 401 keys at HEAD; `tools/check-i18n.mjs` PASS): the full key-by-key table is in §6. Summary —
keys that die with the tab (32+: `fleet.tabStratcom`, `fleet.galaxyMapTitle`, `fleet.sensorLens`,
`fleet.stratcomNoData/Empire/Hostility/Population/PopUnknown/Life*`, `fleet.clusterSend/Explored/Unexplored`,
`fleet.warpShipsTitle/NoShips/Status*/OrderTitle/Hops/TotalLY/FuelNeed/Eta/Feasible/Send/Cancel/OrderSent`, the
`fleet.scan*` family + `fleet.opsScan` + 3 toasts, the ship-picker trio, `territory.playerEmpire/controlRow`);
keys that are SHARED and stay (`fleet.stratcomEmpireForeign/Unknown`, `fleet.clusterSwitch`, the 7 `fleet.warpErr*`,
`fleet.warpOrderFailed`, …); keys already dead (`territory.legend*` ×3, `fleet.stratcomRange/Sensors/Blind/ObsLevel`,
11 `fleet.cluster*`, `fleet.starCluster`, `fleet.opsBodies/NoScan/ScanToast`, dead-code `fleet.tabVessels/Fleets`,
`civPanel.galaxy`). ⚠ `fleet.colonizeCrossSystemHint` (`pl.js:1504`, used by FMO `:8961` and `ShipPanelHudLogic.js:448`)
NAMES "STRATCOM" — needs new wording in G5. ⚠ The checker FAILS when a deleted key is still called as `t('…')`
anywhere in `src/` — tests included (`stratcom_reveal_smoke.mjs:109-116`, `system_exploration_canon_smoke.mjs:120-122`).

### A10 — keepers and smokes pinned to the stratcom tab

**How the sweep finds keepers:** `src/testing/smoke/run-all.mjs:72-77` — `readdirSync(__dirname)` (non-recursive) of
`src/testing/smoke/`, every `*.mjs` except itself, sorted; pass = exit code 0 (`:54`); a suite with no recognised
summary is an advisory (`:27-32`, `:55`). **Repo-root `tmp_*.mjs` files are NOT swept** (gitignored by `.gitignore:20`,
47 of 107 force-tracked); `src/testing/headless/probe-*.mjs` are not swept either. Several names from the brief are
gitignored on disk only (`tmp_territory_b1…b6`, `tmp_obs_stratcom_scan`, `tmp_obs_detection_reform`,
`tmp_command_crosssystem_leak`); there is no `territory_b*_smoke.mjs` anywhere.

**Swept keepers that pin the stratcom tab** (invariant → where it lives after the move; tags: DIE = drawing / hit wiring /
tab id of the overlay; L = logic that survives):

| Keeper (count) | Pins | Verdict after the move |
|---|---|---|
| `stratcom_star_pick_smoke` (10) | T1 click & hover pick the same star (FMO `:1472`, `:1824`) · T2 nearest centre wins (`StratcomHitLogic.pickStarZone` `:54`, tie `<=` `:63`) · T3 a later absorber beats stars (`topMostZoneAt` `:36`) · T4 hover does not light a star under the absorber · T5 `map_body` hover stays first-match on the tactical tab | **migrate** T2/T3 (L-PICK) onto the galaxy pick + HUD pin precedence; T1/T4 die (FMO wiring); **T5 is a tactical-tab invariant — keep** (re-home into a tactical keeper) |
| `stratcom_warp_trap_smoke` (14) | Finding 108: Cancel disarms; `_close` resets the field family; the warp panel always offers `cluster_switch`; unexplored → no switch (186 gate); `warp_order_send` keeps the selection (E2) | **migrate as intent** (L-TRAP): "the pin always offers [ Enter ] (gated by explored ∧ generated), also while a ship is selected"; "sending keeps the selection" — onto the pure pin-button model; FMO plumbing dies |
| `stratcom_ship_icon_smoke` (32) | Finding 110: icon anchor = drawn centre; icon picks its ship, star centre picks the star; fan tiles (zone width = `FAN_STEP`); "+N" has no zone; transit icon; off-view cull; absorber beats icon; T8 source tripwire on the `cluster_star` push line | **migrate** (L-ICON) onto the rail model: "a rail row never covers the star's pick disc", "rows tile", "+N has no zone", "off-view rows push no zone"; **T8 dies** (no push line) |
| `stratcom_reveal_smoke` (75) | Finding 188: 48-case reveal matrix read from the detail panel; rumor/contact/detailed ladders; T4 anti-mirror (map label name ≡ panel header name, 16 states); T5 IntelSystem source pin; T6 panel height (DIE); T7 own system shows population | **migrate** (L-REVEAL) onto the pure galaxy content builders (pin expansion + outliner info line): the matrix, the ladders, and **the anti-mirror widened to three surfaces** (label ≡ pin ≡ outliner row) — T5 stays as is; T6 dies |
| `warp_stratcom_smoke` (43) | W1–W6/W11/W16–W21 drawing & zones (DIE); W7 select toggle, W8 `warp_order_send → beginJourney`, W9/W10 cancel & reset, W12–W15 own-fleet blip set, W13 range table, W22 `cluster_send` picker | **migrate** W8 (L-WARP → menu entry / [ Send ▼ ] call `issueWarp`), W12–W15 (rail model input), W13 (pure range util); rest dies. ⚠ prints `43/43 PASS`, which `run-all` does not parse → advisory; W12e is vacuous (`ok(… ? true : true)`, `:205`) |
| `overlay_tab_entry_smoke` (28) | Finding 160: `open({tab})` cleans the leaving tab's DOM (T1/T2), `_switchTab`/`close` clean up (T3), T4 entering stratcom resets the warp fields, T5 K-key wreck focus, **T6 the `{id,opts}` keymap entries are exactly `['g','k','m']`**, T7 `open({})` | T1–T3/T5/T7 **re-target** to another tab (`_switchTab` does not validate ids — they would go stale, not red); T4 dies with the tab; **T6 re-aimed in G1** (G leaves the keymap) |
| `system_exploration_canon_smoke` (21) | T1–T3 the 186 gate through the detail / warp panels; T4–T6 the canon itself; **T7 control pin requires FMO to still import `SystemExploration.js`** | T4–T6 stay; T1–T3 **migrate** to the [ Enter ] / dive gate (pure); T7's control must move to the new consumer before the FMO import goes |
| `return_actions_removed_smoke` (16) | **A3**: `_drawWarpOrderPanel` is "the ONLY way home from the map" (pushes `warp_order_send` for a ship in a foreign orbit → home) | **re-aim in G3/G5**: the galaxy right-click / [ Send ▼ ] becomes the way home; the keeper's premise changes, not its intent |
| `log_depth_chunks_smoke` (146) | **T6** reads `src/renderer/StratcomGalaxyRenderer.js` (`:223-225`) + twin pins (`:233-237`); **T7** pins the sky literals `logDepthOn() ? withLogDepthVertex(starVert)` (`:251-252`) and the nebula `depthTest: !logDepthOn()` (`:255-256`) | **G5**: drop the file from both T6 lists (else `ENOENT` crash); **NIEBO**: T7's starfield pin re-aimed if the star layer becomes a dome (D-GX-4) |
| `influence_map_smoke` (T8) | reads `src/systems/TerritoryField.js` (radius formula twin) | stays (TerritoryField is kept) |
| `tooltip_foreign_colony_smoke` (24), `label_hover_smoke` (68) | reveal canon in tooltips / labels via the keys `fleet.stratcomEmpireForeign/Unknown` | stay (keys are SHARED; G5 must not delete them) |
| `return_home_no_brick_smoke` (T9, T12), `foreign_panel_slim_smoke` (f-1) | `_warpErrLabel` (FMO `:6888`); `cluster_switch` from `_drawRight` (`:7723`) | stay — `_warpErrLabel` moves to a pure module (re-aim T9's import); the `cluster_switch` handler is KEPT (also produced by `ShipPanelHudLogic.js:208`; fixture `traces/T4-ship-panel-t3-baseline.json` holds it) |

**Not swept but tracked:** `tmp_stratcom_smoke` (42; structure / keymap / render — die; H2 pan + H6 MST + range curve =
logic), `tmp_holotable_cam_smoke` (19, pure `HolotableCamera`), `tmp_territory_contours_smoke` (13), `tmp_tabscaffold_smoke`
(already stale: asserts `_hoverShipId`, which FMO no longer has). **Gitignored:** `tmp_territory_b1…b6` (b1 already stale —
asserts save v91 while `CURRENT_VERSION = 101`), `tmp_obs_stratcom_scan_smoke` (61, scan backend), `tmp_obs_detection_reform_smoke`
(range curve + blip mode). ⇒ the territory maths, the holotable camera maths and the scan backend have **no swept keeper
today** (Finding **599**).

**Deletion hazards (sweep):** deleting `StratcomGalaxyRenderer.js` crashes `log_depth_chunks` T6; deleting
`TerritoryField.js` crashes `influence_map` T8 (not proposed); `StratcomHitLogic.topMostZoneAt` is the generic click rule
for ALL FMO tabs (keep the module); FMO's `SystemExploration` import is held alive only by stratcom code
(`:5697, :6436, :6985`) and by `system_exploration_canon` T7's control. **Features that lose their only UI entry with the
tab:** the send picker (`_pendingSendSystemId`, set only by `cluster_send` `:2346`), `startSystemScan` /
`cancelSystemScan` (only from the stratcom handlers `:2291`, `:2303`), and the map's way home (A3 above) — all three are
re-provided by G2/G3 before G5 deletes anything.

### A11 — left outliner (`SystemTreeLogic` / `LeftOutliner` / `OutlinerColumn`) (outliner sweep)

| Item | Where | Fact |
|---|---|---|
| tree source | ctx `src/ui/LeftOutliner.js:104-119` → `buildSystemTree` `src/ui/SystemTreeLogic.js:111-198` | `systems = starSystemManager.getAllSystems()` — **generated systems only**, not `galaxyData.systems` |
| D-UI-3 filter | `SystemTreeLogic.js:173` `visible = isHome ‖ pop ‖ outpost ‖ station ‖ isSystemExploredData(sys) ‖ presence` (presence = own ships / troops, `:152-164`; transit `null` and wrecks don't count) | rule text `docs/design/UI_PLAN.md:58-59` (+ `:534-536` U3-0, decision 5 (b)) |
| D-UI-2 order | `:175-178` groups HOME / COLONY / OUTPOST / OTHER, sort `:196` (distance then name — UI_PLAN §7.4 `:1138`) | the right outliner REUSES this order (`src/ui/Outliner.js:79-84` calls `buildSystemTree` with `expanded: () => false`) |
| system node | `:181-191` `{ systemId, name, distanceLY, group, presence, glyph, isHome, isActive, bodies }` (`bodies` null when collapsed) | glyph 🏛 / ⛺ / ⚑ (UI_PLAN §7.19) |
| body / station rows | `_bodyRows` `:201-253` (planets + planetoids by `orbital.a`, moons nested, player stations under their body) | colonies are FIELDS of body rows, not rows; AI colonies set `foreign: true` and ⚑; **foreign stations never listed** (`:142`) |
| fog | neither tree module nor the column reads `galaxyData`, `intelSystem`, `observatorySystem`, `empireRegistry` or `SystemReveal` (grep); ⚑ is drawn for every AI colony in a listed system regardless of intel | the 531 rule lives in `TooltipContent.js:159-176`, `LabelHoverLogic.js:238-250`, `GameScene.js:5966-5974` |
| expansion state | `OutlinerColumn._expanded` Map per column (`OutlinerColumn.js:51`), default = active system only (`SystemTreeLogic.isSystemExpanded` `:57-60`) | session-only |
| draw | `OutlinerColumn.draw` `:119-171` → `LeftOutliner._model` `:131-150` (system item + its body/station items) → `_drawItem` `:152-156` → `_drawSystemRow` `:158-187` / `_drawBodyRow` `:189-226` / `_drawStationRow` `:229-242`; `SYS_H 18`, `ROW_H 16`, `INDENT 10`, `ARROW_W 14` (`:48-52`) | expansion rows are just items after the system item |
| clicks | `_onHit` `:245-273`: arrow toggles; system row → `switchActiveSystem` or `resetToSystemView` for the current one (`:247-253`); body / station → `clickObject` | `switchActiveSystem` refuses never-generated ids (`StarSystemManager.js:145-149`) and rebuilds the scene even for the current id |
| **tree root** | **none** — the header `UKŁADY [n]` (`OutlinerColumn._drawFrame` `:174-200`, `pl.js:2546`) is excluded from click targets (`:301`, `:308`), tooltip only | F3(c) needs a new row or a clickable header |
| click intents | `ClickIntentLogic.resolveClickIntent` `:63-71`, `applyClickIntent` `:119-166` — `SWITCH_FOCUS` = switch then focus (`:121-123`); station focus emits ONLY `station:focus` (`:145-147`) | "enter system focused on that body" = `applyClickIntent(bodyTarget(b), SWITCH_FOCUS)` exists; a station needs `station:selected` too |
| pinned UIManager text | `left_outliner_smoke.mjs:381-399` (L7a–L7g regex on `this._leftOutliner.draw(ctx, W, H, { colonies: this._cachedColonies, groundUnits: …`), `:716-729` (L16 — exactly one `this._outliner.draw(` and one `hitTest`) | a mode argument must keep the pinned prefix |

### A12 — right outliner (`Outliner` / `ShipTreeLogic`) and the panels

| Item | Where | Fact |
|---|---|---|
| tree | `src/ui/ShipTreeLogic.js:101-196` `buildShipTree` → `{ transit, systems, index, fleetIndex, total }`; ctx `src/ui/Outliner.js:86-99` | vessels = all non-enemy (`Outliner.js:87`), non-wreck (`ShipTreeLogic.js:106`) |
| sections | transit `:171-176` (only when non-empty); per system with ≥ 1 live ship `:178-193`; order from the LEFT list (`Outliner.js:79-84`) + extras by name | "In transit" = `systemIdOf(v) === null` (`:111`, `:117`) ⇔ `interstellar_jump` + `warp_transit` (`VesselManager.js:329-336`) |
| fleet node | `:124-147` members in `memberIds` order, lead = first, node in the lead's section, members depth 1, notes for members elsewhere (`:139`) | fleet members never also appear loose (`consumed`, `:148`) |
| warp data | `ShipTreeLogic` / `Outliner` never read `warpFuel`; each row carries `vessel` and `entry.warpFuelPct` (`FleetPictureLogic.js:341`, null when `max ≤ 0` `:128-132`) | **no shared `isWarpCapable` helper** (FMO tests `warpFuel.max > 0` at `:2333, :5745, :5868, :6528, :6830, :8130`; `ShipPanelHudLogic.js:447` also accepts a warp module) |
| dim style | none in the right outliner (the left uses `THEME.textDim` for unrecognised bodies, `LeftOutliner.js:218, :222`) | needed for "non-capable members dimmed" |
| clicks | `_onHit` `:282-315` vessel / fleet / system; transit & group rows inert | — |
| panel anchoring | `UIManager._shipPanelAtOutliner` `:470-481`, `_fleetPanelAtOutliner` `:578-590` → `ShipPanelAnchorLogic.resolveRowAnchor` `:76-91` + `computeShipPanelPlacement` `:109-155` — **row geometry only**; fallback top-right (`MapVesselPanelLogic.js:53-63`); no screen position of the ship used (grep) | panels work unchanged in galaxy mode; a ship filtered OUT of the tree falls back to the top-right slot; on `system:switched` a selected ship outside the new system is deselected (`ShipPanelAnchorLogic.js:172-177`, `UIManager.js:645-655, :936`) |
| visibility | `OutlinerColumn.outlinerShown` `:40-42` (civMode, no globe, user toggle, no overlay, dock not expanded) | no existing "mode" changes outliner CONTENT |

### A13 — warp: today's shape and the shape of `issueFleetWarp`

| Piece | Where | Fact |
|---|---|---|
| `OrderService.issueWarp(vesselId, systemId, opts)` | `src/systems/OrderService.js:132-164` | same-system → `same_system` (`:142-145`); PLAYER → `warpRouteSystem.beginJourney(vesselId, systemId)` **without opts** (`:158`); AI → `dispatchInterstellar(…, {arrivalAngle})` single hop (`:160-163`) |
| `issueGroupAttack` | `:215-248` | **AI-only** (`not_ai_vessel` `:226`); all members same system (`group_split` `:231`); pre-checks per member (`:236-241`); ONE `Math.random` angle (`:242`); then sequential `_beginComposite` per member (`:243-246`) — a failure of member k leaves members 1…k−1 already jumped (not transactional) |
| `_issueGroupLeg` / `_maybeDeliverGroup` / `_regroupAfterBattle` | `:532-553` / `:509-523` / `:561-575` | in-system leg synchronised by `GroupArrival` (`_arrivalSyncYear`); waits until the whole group is in the target system |
| `_beginComposite` / `_maybeDeliver` | `:362-382` / `:390-493` | `pendingOrder` kinds transport / passenger / move / attack / recall; guards `v.warpRoute` (multi-hop in progress) and `systemId` |
| `WarpRouteSystem.canOrder` | `src/systems/WarpRouteSystem.js:47-55` | not_player / not_warp_capable / immobilized / in_transit / bad_state — **no service-state term** (Finding **588**) |
| `beginJourney` | `:65-108` | per-vessel plan: `maxHopLY = min(WARP_MAX_JUMP_LY 10, max/consumption)` (`:78-79`), `currentFuel`, `consumption`, ETA speed (`:197-202`), `allowedIds` undefined = permissive fog (`:191-193`); writes `v.warpRoute = {hops, legIndex, finalSystemId, totalFuelPlanned, startedYear}` (`:90-96`), dispatches hop 1 (`:98-102`) |
| `_onArrived` chaining | `:112-146` | per vessel, on its own `interstellar:arrived`; aborts `diverted` / `config` / `stranded_fuel` / `dispatch_failed` |
| `planWarpRoute` | `src/utils/WarpRoutePlanner.js:54-141` (pure) | Dijkstra over 3D distance with hop ≤ maxHopLY; one-tank model (`totalFuel ≤ currentFuel`); returns `hops`, `legs[{from,to,distLY,fuelCost}]`, `totalLY`, `totalFuel`, `etaYears`; reasons `same_system / unknown_system / bad_config / no_route / insufficient_warp_fuel` (partial fields on the last — the UI can show the shortfall) |
| `dispatchInterstellar` | `src/systems/VesselManager.js:927-1026` | accepts docked / orbiting (`:935-937`); speed per vessel `baseSpeed × (beacon ? 3 : 1)` (`:982-986`); fuel paid at dispatch (`:991`); `opts.arrivalAngle` → `mission.arrivalAngle` (`:1011`); `systemId = null` in transit (`:1017`) |
| arrival | `_tickInterstellar` `:3039-3106` | 30 AU rim at `mission.arrivalAngle` or random (`:3066-3075`); `markSystemExplored` for the player only (`:3060`); `interstellar:arrived` (`:3088`); galaxy interpolation `galProgress / currentGalX / currentGalY` (`:3098-3105`) |
| RightClickMenu | `src/ui/RightClickMenu.js:45-153` show (renders **`opt.labelPL` only**, `:88` — Finding **592**), `:213+` `_handleOptionClick` (fleet path → `FleetSystem.issueFleetOrder`, per-vessel `:367-393` → `orderService.issueMove`); options keyed by `target.type` (`src/data/RightClickMenuOptions.js:39+`), `buildMenuOptions` `:179-222` | a galaxy star needs a new target type (`galaxyStar`) and the label must render per locale |

**Shape proposal for `issueFleetWarp(fleetId, systemId)` (G4, full gate):**
```
phase 1 — no side effects (275 rule: a refused fleet order must not touch fleet.activeOrder):
  members  = live members of the fleet (FleetSystem)
  rejected = members with !canOrder(v) (incl. the service-state term after 588)   → [{vesselId, reason}]
  split    = members not all in the same systemId                                  → reason group_split
  rangeLY_m = warpFuel.current / warpFuel.consumption (per member), maxHop_m = min(WARP_MAX_JUMP_LY, max/consumption)
  plan = planWarpRoute(systems, from, to, { maxHopLY: min_m maxHop_m, currentFuel: min_m rangeLY_m,
                                            consumption: 1, warpSpeed: min_m speed_m })
         → shortest distance = least fuel for EVERY member at once (fuel = distance × own consumption),
           so ONE Dijkstra serves the whole fleet; the binding member = argmin rangeLY_m (named in the refusal)
  any rejected / split / !plan.ok → { ok:false, reason, rejected, plan } — nothing touched
phase 2 — dispatch (must not fail after phase 1 except on a race):
  groupId; arrivalAngle drawn once (final hop); groupSpeed = min_m speed_m (beacon bonus is per target system,
  identical for all members)
  for each member: beginJourney(v.id, systemId, { hops: plan.hops, groupId, speedLY: groupSpeed, arrivalAngle })
  fleet.activeOrder = { type: 'warp', targetSystemId, groupId, … }; fleet:orderIssued
```
Needed underneath: `beginJourney(…, opts)` that accepts a precomputed route (re-validated against THIS vessel's tank),
`dispatchInterstellar(…, { speedLY })` (speed lock — all members depart each hop in the same tick and arrive in the
same tick, so `_onArrived` keeps them in lockstep with no rendezvous state), `warpRoute` carrying `groupId` /
`speedLY` / `arrivalAngle` (serialized with the route — keeper `warp_route_system_smoke` E9 pins the round-trip;
v101 without migration if the route is copied whole — to verify in G4), the fleet-level order record and its
completion / abort rules (D-GX-19).

**What the hover preview needs from the planner** (all already returned): `hops` (ids → plate positions),
`legs[].distLY / fuelCost`, `totalLY`, `totalFuel`, `etaYears`, `reason` (+ partial fields on
`insufficient_warp_fuel`) and the gate reason from `canOrder`; for a fleet, the group plan + the binding member + the
per-member reasons. Names on the preview and in the menu entry go through `reveal.name` (Finding 589).

### A14 — fog of war on the galaxy: one canon

| Fact | Today | Canon for every new surface |
|---|---|---|
| system name / place / owner / hostility / population / life | `resolveSystemReveal` (`src/utils/SystemReveal.js:52-99`, zero imports, fail-closed): `place = explored ‖ scanned`, `name = place ‖ rumor`, `ownerExists = rumor`, `ownerIdentity = hostility = contact`, `population = hasOwner ? detailed : explored`, `life = explored`; assembled ONLY in `FleetManagerOverlay._systemReveal` (`:5693-5701`) for the galaxy and in `HudLabelLayer.js:409-418` for system labels | one pure assembler (moved out of FMO) feeding plate dimming (0.5 when `!place`), labels, pins, outliner rows and the menu entry |
| foreign colonies | system mode: ⚑ in any listed system (outliner, no intel); tooltip 531: owner via the record (`TooltipContent.js:159-176`) | names = `place ∧ ownerIdentity`; "?" = `ownerExists`; nothing otherwise (D-GX-11) |
| territory | `resolveTerritoryVisibility` (player full · contact+ full (+ war pulse) · rumor outline · unknown skip) | unchanged |
| owner glyph / territory label | `contact` (`FleetManagerOverlay.js:5902`, `:6021`) | ownership halo C at `contact` (player always) |
| enemy warp transits | gated by PLANAR distance from home ≤ rangeLY (`:6218`), then `_stratcomWarpBlipMode`: vessel intel `contact`/`detailed` → solid + route line, else ghost "?" (`:6214-6240`) | same rule, HUD-drawn; Finding 595 (planar vs 3D) and 596 (centred on home) recorded |
| own ships | always visible (`:5726-5769`) | unchanged |
| observatory range | `STRATCOM_LY_BY_LEVEL[min(level, 6)]` (`:218`, `:5651-5656`), level from `getMaxObservatoryLevel()` (any colony), ring centred on HOME (`:6321`) | F5: ping from home to rangeLY |
| warp routing | permissive — any system can be a hop (`WarpRouteSystem._routableIds` returns `undefined`, `:191-193`) | the preview draws hops through unknown stars → hop labels via `reveal.name` |

### A15 — the sky catalogue (F7): readers, seed availability, cost, module boundary (sky sweep + probe)

- **Readers of the main sky:** none outside `_buildBackground` (sky sweep; table in A1). The intro cinematic drives the
  main renderer (`GameScene.js:5159`) and shows the same sky; `BattleView3D` draws its own (reuses the renderer via
  `suspend()`).
- **Seed:** there is no `GALAXY_SEED` constant — the seed is `galaxyData.seed` (int32), minted once by
  `GalaxyGenerator.mintSeed()` (`:79-81`) for a new game and restored from the save otherwise
  (`GameScene.js:2156-2165`), persisted by `SaveSystem.js:218` (only in civMode — GALAXY_SEED Deviation 2).
  Dispersion canon: never read the raw seed's first draw (`SeedMath.js:26`), one salt per stream
  (`EmpireGenerator.js:57-58, :90`), "structural seed needs dispersion everywhere" (`CLAUDE.md` W2 lesson); helpers
  `mixSeed` / `hashStringToInt` (`src/utils/SeedMath.js:31, :39`, pure, already imported by a renderer —
  `SunShader.js:20`).
- **Availability at the three moments:** ThreeRenderer construction (`GameScene.js:208`) — **no**; the only
  `initSystem` (`:214`) — **no**; `switchSystem` (UI / events after `start()`) — **yes**. On LOAD no `switchSystem`
  happens at all (`StarSystemManager.restore` forces home, `:261-264`), so the catalogue must be attached explicitly
  right after `galaxyData` is set (`GameScene.js:2165`) and computed for `activeSystemId`.
- **Mapping star → galaxy position:** the `star` passed to `switchSystem` carries `systemId` = the `galaxyData` id; every
  star entity sits at (0,0) of its own system — the galaxy position exists only in `galaxyData`.
- **Cost (probe `probe_sky_cost.mjs`, node 24):** one recompute of 7 000 directions + `L/d²` into `Float32Array`s =
  **0.04–0.06 ms**; the catalogue is bit-identical for the same seed. GPU upload = 7 071 × 3 floats ≈ 85 KB per switch.
- **Parallax and brightness (same probe, volume-uniform shell, between home and the farthest system 21.8 ly away):**

| filler shell | stars < 100 ly | 100–300 ly | 300–1 000 ly | > 1 000 ly | filler L/d² span | nearest real system vs brightest filler |
|---|---|---|---|---|---|---|
| 30–3 000 ly | 0 | 11 (median 4.5°) | 232 (1.3°) | 6 757 (**0.43°**, max 1.2°) | 4.3 decades | ×2 800 |
| 100–3 000 ly | 0 | 10 (4.4°) | 233 (1.3°) | 6 757 (0.43°) | 4.3 decades | ×3 200 |
| 300–3 000 ly | 0 | 0 | 231 (1.3°) | 6 769 (0.43°) | 3.8 decades | ×10 000 |

  Reading: with the real density the filler is effectively at infinity — the sky differs between systems through the
  71 real systems (2–44 ly away) — and brightness needs a magnitude law (log compression, HDR cap), not raw `L/d²`.
- **Module boundary proposal:** `src/utils/SkyCatalog.js` — pure, zero imports except `SeedMath`:
  `buildSkyCatalog(galaxySystems, seed, opts) → { N, pos: Float32Array (ly), lum, cls, realId: (string|null)[] }` and
  `skyFrom(catalog, systemId, out) → { dir: Float32Array, intensity: Float32Array, size, color }` (the active system
  excluded, `d → 0` guarded); renderer side: `this._sky = { group, points, nebula }` with handles, `setSkyGalaxy(galaxyData)`,
  recompute on `switchSystem`, `group.position = camera.position` per frame, a uniform for the real-star fade.
  **Keeper shape** (`sky_catalog_smoke`): determinism (same seed → same bytes; another seed → different), salt
  dispersion (catalogue stream ≠ `GalaxyGenerator` stream; the raw seed's first draw is not used), counts (7 000 + 71,
  the active system absent from its own sky), direction sign and unit length, parallax between two systems for a
  real star (exact angle) and for the filler (small), magnitude law bounded (no NaN / Inf, HDR ≤ cap).

## §2 Risks, ranked

| # | Risk | Evidence | Severity | Mitigation (where) |
|---|---|---|---|---|
| R1 | **The sky is world-anchored and small.** Stars at r 300–1 000 WU and the nebula sphere (R 1 400) are centred on the world origin; the galaxy camera sits at 2 300 WU (K = 40) … 11 500 WU (K = 200) — outside both: a visible ball of stars and a nebula disc, and the "bit-for-bit continuous sky" of F2 is impossible | A1; `ThreeRenderer.js:611-616`, `:725`; today already: MAX_DIST 450 + target ~385 from the origin puts the camera inside the shell band (Finding 591) | **high** | D-GX-4 follow-camera dome (NIEBO) |
| R2 | **Picking in galaxy mode.** Hidden system objects stay raycast-pickable (three r171 ignores `visible`); the 40-px / 28-px ship pickers and the HUD hover run before any star test; the empty-map coordinate tooltip prints SYSTEM coordinates | A5, A6; `three.core.js:34655-34680`; `ThreeRenderer.js:3077, :3136`; `HudLayer.js:359`; `GameScene.js:5843-5848` | **high** | one mode branch at the top of `handleClick` / `handleMouseMove` / HUD `F` (S0) + a galaxy pick (S2) — G1 |
| R3 | **Depth range and the far plane.** far = 5 000; at K = 200 the farthest plate point is ~22 300 WU; every new shader must carry the log-depth chunks (V4 rule) except sky domes | A1, A2; `ThreeRenderer.js:375`, `LogDepthChunks.js`; V4 rule (`VISUALS_PLAN.md` §V4) | **high** | D-GX-3: mode-dependent far (system bit-for-bit 5 000), shader factory with chunks — G1 |
| R4 | **The HUD has no mode.** Every sublayer pulls active-system entities and draws at any distance; fixed-pixel glyphs; disc LOD collapses; readouts in AU; `addSublayer` appends only | A6 | **med-high** | S0–S4 seams — G1 (gate) / G2 (galaxy sublayers) |
| R5 | **The transition.** Controller lerps are per-frame (fps-bound); `flyTo` clamps at 450; `switchSystem` snaps the camera via `frameSystem`; fading opaque ShaderMaterials (planets, star core, gas, atmosphere) means toggling `transparent` on six V4-depth materials | A3, A4; `ThreeCameraController.js:139-166, :250-299`; `ThreeRenderer.js:1248` | **med** | D-GX-14: intro-style driver (time-based, lerps neutralised), fades only on lines / sprites / points + sub-pixel hide of meshes, the `frameSystem` snap inside `switchSystem` overridden by the per-frame pose (`resetToSystemView` is already a no-op under a driver, `:4104`) — G2 |
| R6 | **Fleet warp is a new mechanic** over per-vessel state: per-vessel plans and speeds, chaining per vessel, no group rendezvous, SB54 AI-only, non-transactional group start, serialization of group state, the 275 two-phase preemption rule, members diverted / destroyed mid-route | A13; `OrderService.js:215-248`; `WarpRouteSystem.js:65-146`; `VesselManager.js:982-986` | **med** | D-GX-19 speed lock + two-phase refuse-all; full gate (fail-first + live) — G4 |
| R7 | **Frame budget.** 72 plate points + 7 071 sky points (exists) + a territory plane (≤ ~8 owner textures, large on screen) + curtains + HUD labels for up to 72 systems (greedy placement O(n·56·placed)) + ping + lanes + rail | A6 (`HudLayer.js:45` ≤ 0.5 ms CPU; label placement cost notes), HUD_PLAN Finding 527 (raster cost, not JS) | **med** | measure kl./s per the HUD protocol (with / without each layer), label density rule (D-GX-16) — G2 |
| R8 | **Keeper migration.** 9 swept keepers + 4 tracked tmp smokes pin the tab; two hidden crash hazards (`log_depth_chunks` T6, `system_exploration_canon` T7 control) | A10 | **med** | D-GX-21 list, re-aims with stated reasons (T4 method), sweep green at each step — G5 |
| R9 | **G / M rebinding.** G and M both open the tab today; the keymap is pinned (`overlay_tab_entry` T6); G reaches the keymap even inside the Command and Colony overlays; docs (`MANUAL.md:856`) name G/M | A9 | **low-med** | D-GX-8 — G1 |
| R10 | **Fog regressions on new surfaces.** Five surfaces get system facts (plate, labels, pins, outliner, menu); today two of the dying surfaces already leak names (Finding 589); the frame's "contact → names" would re-open 186 / 188 (D-GX-11) | A14 | **low-med** | one assembler for the reveal record + the anti-mirror widened to three surfaces (keeper) — G1/G2 |
| R11 | **Outliner coupling and pins.** The right outliner's system order derives from the left list's filter (`Outliner.js:79-84`); `left_outliner_smoke` L7 / L16 pin the `UIManager` call text | A11, A12 | **low** | D-GX-10 (decouple in galaxy mode; keep the pinned prefix) — G1 |
| R12 | **Two galaxy maps G1–G4.** The old tab (own WebGL context, `preserveDrawingBuffer`) coexists with the new mode until G5 | A7, A8 | **low** | D-GX-21: tab reachable only via the Command tab bar after G1; the context is disposed on `close()` today (`FleetManagerOverlay.js:624-625`) |
| R13 | **Load and seed.** The galaxy (seed) is created after the renderer; a load never switches systems; non-4X saves mint a new galaxy on each load (GALAXY_SEED Deviation 2) | A15 | **low** | D-GX-6 — NIEBO |

## §3 Findings register (#588 onward)

Status icons: 🔴 defect with a measured gameplay consequence now · 🟠 defect / latent defect the arc must close or
route around · ⚪ observation, hygiene or coupling. "Step" = where the arc meets it.

| # | | Finding | Evidence | Step |
|---|---|---|---|---|
| **588** | 🟠 | **A hull in the W2 reserve can jump.** `WarpRouteSystem.canOrder` has no service-state term (`src/systems/WarpRouteSystem.js:47-55`) and neither has `VesselManager.dispatchInterstellar` (`:927-1026`); the stratcom warp list and blips list every `warpFuel.max > 0` hull (`FleetManagerOverlay.js:5745, :6830`). **Measured** (probe `probe_reserve_warp.mjs`, real `VesselManager` + `WarpRouteSystem`, full tank, docked): `serviceState 'stored'` → `canOrder ok`, `beginJourney ok`, `in_transit`, 0.5 warp core spent; `'mobilizing'` → the same; control `'active'` → the same (the probe measures the gate, not silence). A crewless hull reaches another system, where MOS then refuses every movement order (`vessel_in_reserve`, `MovementOrderSystem.js:280-295` — the hole W3-4 / D6 closed for movement orders, §S24 of the W3 audit; the warp path is its unclosed twin). The W2 exclusion set (`deploy_seams`) never listed the warp path | G3 (gate gets `isInService`; the right outliner shows reserve hulls dimmed with the reason — D-GX-12) |
| **589** | 🟠 | **Warp-order surfaces print the target's real name without the reveal gate** (Finding 188 class, outside its tripwire): `_drawWarpOrderPanel` `"${ship} → ${sys.name}"` (`FleetManagerOverlay.js:7006`), the send picker `"→ ${targetStar.name}"` (`:8116`), the route log `warpRoute.started` via `_systemName` (`WarpRouteSystem.js:105-106, :204-207`), the mission log `vessel.interstellarLaunch` with `targetStar.name` (`VesselManager.js:1019-1021`). Reachable: select a warp ship, click a dim, unnamed star → the panel names it; sending the ship writes the name into the Log before arrival. The 188 keeper's T4 pins map label ≡ panel header only | G3 (menu entry, preview hop labels and logs through `reveal.name` — D-GX-18) |
| **590** | 🟠 | **[ Beacon ] / [ Gate ] (F5 pin actions) have no mechanic.** The FMO handlers `cluster_beacon` / `cluster_gate` (`FleetManagerOverlay.js:2394-2401`) have **no producer anywhere in `src/`** (grep: no `type: 'cluster_beacon'` / `'cluster_gate'`); the backend (`StarSystemManager.js:27-35` listeners, `:207-236` `buildBeacon` / `buildJumpGate`) is **free, instant and tech-less**; a beacon multiplies warp speed into its system ×3 (`VesselManager.js:984`); the i18n keys are dead (`fleet.clusterBeacon/Gate/BuildBeacon/BuildGate`). Exposing the chips as written would hand out free infrastructure | G2 — **D-GX-17 (c) signed: the chips are omitted** (no pin action until a mechanic exists, §7 O5); the dead FMO handlers go with the tab in G5 |
| **591** | ⚪ | **Background stars are world-anchored inside the camera's reach.** Shell r 300–1 000 WU around the origin (`ThreeRenderer.js:611-616`) while the camera reaches ~835 WU from the origin (MAX_DIST 450 from a target up to ~385 WU out); stars are depth-tested additive points (`:672-683`), so a star between the camera and a planet passes the depth test and draws over the planet. Derived from geometry, **not observed** | NIEBO (closed by D-GX-4) |
| **592** | ⚪ | **The right-click menu is Polish in the EN client.** `RightClickMenu.show` renders `opt.labelPL` only (`src/ui/RightClickMenu.js:88`) although every option carries `labelEN` (`RightClickMenuOptions.js:39-118`, kept by `buildMenuOptions` `:205-211`); the disabled reason is a Polish literal (`'Najpierw wybierz statek'`, `:216`) although `tooltip.menu.requiresSelection` exists. `check-i18n` does not see it (labels are data — the class of Finding 113) | G3 (the new "Warp to X" entry must render per locale; fix the renderer once) |
| **593** | ⚪ | **Stratcom "Send" is narrower than the warp gate.** The detail panel enables Send only for warp ships available at the ACTIVE colony (`FleetManagerOverlay.js:6526-6528`), and `cluster_send` dispatches only `docked` + `idle/refueling` (`:2333-2335`), while `canOrder` accepts `docked` and `orbiting` anywhere. A warp ship orbiting another body falls to the picker | G3 ([ Send ▼ ] lists by `canOrder`); dies in G5 |
| **594** | ⚪ | **`warp_order_send` refusal drops the reason** — toast `fleet.warpOrderFailed` only (`FleetManagerOverlay.js:2379`), unlike `_toastReturnFailed` (`:6933-6946`, reason + Log entry) | G3 (menu entry refusal carries the reason) |
| **595** | ⚪ | **Planar vs 3D distance.** The stratcom sensor gate uses the planar distance from home (`FleetManagerOverlay.js:5714-5719` `inSensor`, `:6218` enemy blips) while warp maths is 3D (`warpDist3D`); with `Z_SPREAD 5` a system 4.9 ly planar / 6.3 ly 3D reads "in range" at observatory Lv4 (5 ly) | G2 (D-GX-22) |
| **596** | ⚪ | **The observatory range is centred on home whatever colony holds the observatory** — level from `getMaxObservatoryLevel()` (any colony), ring and blip gate centred on home (`FleetManagerOverlay.js:5651-5656, :6321, :6218`). Galaxy twin of Finding 191 | G2 (D-GX-22) |
| **597** | ⚪ | **Dead sky config:** `GAME_CONFIG.BACKGROUND_COLOR`, `STAR_COUNT_BACKGROUND: 250` (`GameConfig.js:34-35`) and `THEME.starfield` + 10 per-theme overrides (`ThemeConfig.js:41, :484 … :761`) have zero readers | NIEBO — **retire** (signed 2026-10-30): the sky colour stays physical, not themed |
| **598** | ⚪ | **Stale descriptions of the galaxy:** `GalaxyGenerator.js:3` "~42 układów", `:5` "3-18 LY" vs `SYSTEM_COUNT 72` / 2–22 ly; `GALAXY_SEED_PLAN.md:49-50` "`sys_000…sys_071`" — the ids are `sys_001…sys_071` (home is `sys_home`) | NIEBO (comment fix; no behaviour) |
| **599** | ⚪ | **The maths that the arc rewrites has no swept keeper.** Territory field / loops / contested / merge (`tmp_territory_b3`, gitignored), territory fog (`b4`, gitignored), payload (`b5`), flashes (`b6`), contours (`tmp_territory_contours_smoke`, tracked, not swept), holotable camera (`tmp_holotable_cam_smoke`, not swept), the scan backend (`tmp_obs_stratcom_scan_smoke`, gitignored); `b1` is already stale (asserts save v91). In the sweep only `influence_map_smoke` T8 reads `TerritoryField.js` (radius formula) | G2 (move the logic keepers into `src/testing/smoke/` when the plate payload changes) |

**Next free number: 600.**

## §4 The cut: NIEBO → G1 → G2 → G3 → G4 → G5

Process for every step except G4 (F8, HUD_PLAN §4.0 annex): one flag (idiom `!!FEATURES.x` — a missing key = OFF),
code prepared in a clone outside the repo, keepers ONLY for logic (no pins on drawing constants, no drawing mutations,
no control on the previous commit, no second window), a contact sheet (HTML) on the 5 title-screen themes where drawing
is involved, the owner looks and tunes, PASS → one commit of code (+ tuning) and one commit of docs. G4 (fleet warp)
gets the full gate: keepers with fail-first in a fresh clone on the parent commit, a written checklist BEFORE the
gate, live gate in the owner's window (1600×1041 CSS, UI scale ≈ 1.25). Flags become permanent in G5 (T4 method).

### NIEBO — the sky catalogue (F7)

| | |
|---|---|
| **Flag** | `FEATURES.skyCatalog` (OFF → ON after PASS; permanent in G5) |
| **Goal** | the background sky is the same galaxy as the map: deterministic from `galaxyData.seed`, different per system through the 71 real systems, continuous by construction (follow-camera dome) |
| **Files** | NEW `src/utils/SkyCatalog.js` (pure: catalogue from `galaxyData.systems` + seed with its own salt through `SeedMath.mixSeed`, warm-up draws; `skyFrom(catalog, systemId, out)` → unit directions + magnitude-law intensity + size + colour; active system excluded) · NEW `src/renderer/StarPointShader.js` (the PSF literals moved VERBATIM from `ThreeRenderer.js:639-671` + material factory; shared with G1's plate) · `ThreeRenderer.js` (`_buildBackground` → sky with handles `this._sky = { group, points, nebula }`; `setSkyGalaxy(galaxyData)`; recompute after `initSystem` in `switchSystem`; `group.position.copy(camera.position)` after `cameraController.update()`; star layer as a dome — D-GX-4; `uRealFade` uniform, 1.0 in NIEBO) · `GameScene.js` (one call right after `galaxyData` is minted / restored, `:2156-2165` — covers the load path, D-GX-6) · comments for Finding 598; Finding 597 retirement (signed) |
| **Keepers (logic)** | NEW `sky_catalog_smoke`: same seed → same bytes / other seed → different; catalogue stream ≠ `GalaxyGenerator` stream and the raw seed's first draw unused; counts 7 000 + 71 and the active system absent; direction sign + unit length; parallax between two systems — exact angle for a real star, small for the filler (the measured 0.43° median is the reference); magnitude law bounded (no NaN / Inf, HDR ≤ cap); no galaxy → the sky stays empty, not random. **Re-aim:** `log_depth_chunks_smoke` T7 (the starfield literal moves with the shader; if the dome drops the chunks, the pin flips with the nebula's D-D3 precedent — reason in the commit) |
| **Contact sheet** | 1 theme is enough for the sky (no theme roles); one control frame on a second theme proves it. Frames: home default frame · MAX_DIST · a second system (the same frame, real-system stars moved) · the intro opening · after a load · Shift clean view; old (random) vs new |
| **Tuning knobs** | filler count, magnitude curve (floor, slope, HDR cap), size curve, real-system boost, band axis unchanged |
| **STOP** | code + probe numbers + contact sheet in `kosmos-handover\galaxy-niebo\`; owner looks / tunes; PASS → `feat(NIEBO)` + `docs(NIEBO)` |

### G1 — the galaxy in the scene, entry points, outliners, hard cut

| | |
|---|---|
| **Flag** | `FEATURES.galaxyView` |
| **Goal** | swap system ↔ galaxy in the same canvas with a hard cut + short fade; a readable plate (stars, names); both outliners in their galaxy mode; nothing of the system mode changes when the flag is ON and the player never leaves the system |
| **Scene** | NEW `src/renderer/GalaxyPlate.js` — one `Group` authored in ly, `scale = K` (D-GX-1), `position = −P_active·K` (D-GX-2); 72 PSF points from `StarPointShader` sized by luminosity, unexplored ×0.5, home / selected halo (bigger PSF); visible only in galaxy mode; picking = screen-space nearest centre (the `StratcomHitLogic.pickStarZone` rule) |
| **Mode** | NEW `src/ui/GalaxyModeLogic.js` (pure: enter/exit plans, anchor maths, camera preset, galaxy pick model) + NEW `src/ui/GalaxyModeController.js` (`isActive`, `enter / exit / toggle`, snapshot → restore 1:1 of the system camera, `galaxy:modeChanged`; exits tactical mode on entry; policy D-GX-8) |
| **Camera** | `ThreeCameraController`: mode field; galaxy branch of `maxDist` / `minDist` / `wheelZoom` (multiplicative) / `setTargetDist` / drag (PAN on the fixed oblique via `HolotableCamera.panScreenToWorld`) — system branch byte-identical; camera `far` per mode (D-GX-3) |
| **Renderer gates** | `handleClick` / `handleMouseMove` branch at the top (galaxy pick vs the system pickers — R2); `getHudView().worldPerLY`; system objects hidden in galaxy mode (meshes, orbits, sprites, stations, FX); the empty-map coordinate tooltip gated (`GameScene.js:5843-5848`) |
| **HUD** | S0: mode in `F` and the frame key; system sublayers return `count: 0` in galaxy mode; a minimal galaxy name layer (uppercase name under each star with `reveal.name`, no hover / pin yet) |
| **Entry points** | pill [ SYSTEM ] [ GALAXY ] at the centre of the bottom strip, inside the free span between the last layer chip and the right cluster (the ⚔ combat chip when shown, else the zoom slider — `BottomControlBar.js:243-270`; chip idiom `HudLayerChipsLogic`); key G (D-GX-8); root row of the left outliner (D-GX-9) |
| **Outliners** | left: galaxy ctx — `galaxyData.systems` filtered by `reveal.name`, ○ + dim when `!place`, expansion = info line + own colonies / stations (click → enter focused) + foreign colonies by the two-axis rule (D-GX-10, D-GX-11); right: warp filter (`warpFuel.max > 0`), fleets kept when ≥ 1 member is warp-capable with the rest dimmed, "In transit" kept, reserve hulls dimmed with the reason (D-GX-12); the right outliner's system order decoupled from the left list in galaxy mode; `UIManager` call prefixes pinned by `left_outliner_smoke` L7 / L16 kept |
| **Keepers (logic)** | NEW `galaxy_mode_logic_smoke` (plans + 1:1 restore; anchor = active system; rebase invariance; camera values in system mode identical to HEAD; galaxy zoom law) · NEW `galaxy_outliner_smoke` (galaxy list = `reveal.name`; dim; info line by the canon; two-axis foreign colonies; own colonies always; the system-mode tree byte-identical) · NEW `galaxy_ship_tree_smoke` (warp filter, mixed fleet dimming, transit, reserve) · NEW `galaxy_pick_smoke` (nearest centre among projected stars; HUD zones first; the system pickers never run in galaxy mode) · **re-aim** `overlay_tab_entry_smoke` T6 (G leaves the keymap) |
| **Contact sheet** | 5 themes × frames: system view with the pill · galaxy default · left outliner expanded (own colony, foreign rumor / contact, unexplored dim) · right outliner with a mixed fleet · a selected star · back to the system (same frame as before) |
| **STOP** | `kosmos-handover\galaxy-g1\`; PASS → `feat(G1)` + `docs(G1)` |

### G2 — flight, gesture, dive, galaxy chrome, territory

One flag, one gate with a tuning loop; three commits of code if the owner wants them separated (precedent: HUD package A).

| | |
|---|---|
| **Flag** | `FEATURES.galaxyLook` |
| **G2-1 flight** | transition driver (intro pattern — D-GX-14): fly-out (HUD fade → dolly past the system frame → orbit lines / sprites fade, meshes hidden once sub-pixel → star point = plate home point → tilt to pitch 0.92 / yaw 0.6 → plate fade-in → labels last) and fly-in (short flight over the plate → floating-origin rebase + `switchSystem` at the moment the plate is gone → dolly-in); sky: real-system stars fade out as plate points fade in (`uRealFade`); semantic zoom (D-GX-7) and the dive rule with ⌜⌟ on the target while approaching (D-GX-13); the zoom slider spans the galaxy range in galaxy mode |
| **G2-2 chrome** | galaxy label sublayer: name under the star, hover expansion (pin content model — system detail panel content: owner / hostility / territory / population / life / scan), click pin with actions [ Enter ] [ Send ▼ ] (disabled until G3) [ Scan ] (the existing `ObservatorySystem.startSystemScan` / `cancelSystemScan` with today's toasts) — no [ Beacon ] / [ Gate ] (D-GX-17 (c), signed: omitted until a mechanic exists); density rule (D-GX-16); ship rail beside the star (never covers the star's pick disc); observatory ping from home (H1 ring geometry extracted from `HudRadarLayer`, ly readout — D-GX-22); MST lanes in the route idiom; enemy warp blips by today's canon; chips [R] [T] [E] in galaxy semantics, [O] hidden |
| **G2-3 territory** | A pooled-light shader plane per owner from the exported field (D-GX-15): soft core, thin rim from the gradient, hot white contested seam, 1–2 % breathing; B curtains extruded from the loops, fading with height; C ownership halo on owned stars (empire colour from `EMPIRE_COLOR_PALETTE`, hostility as pulse); risers only for owned systems + the selected star (`riserEndpoints`); fog by `resolveTerritoryVisibility` |
| **Keepers (logic)** | gesture state machine (accumulated normalised delta, window, settled guard, arming notch, trackpad bursts) · dive target rule (selected > nearest enterable inside the capture radius; enterable = explored ∧ generated) · transition timeline (pure: phases, durations, Esc → end state; `frameSystem` neutralised) · pin model (buttons, availability, reasons) · reveal anti-mirror across label ≡ pin ≡ outliner row (16 states; migrated from `stratcom_reveal` T4) · rail geometry (migrated from `stratcom_ship_icon` T1–T7) · star pick (migrated from `stratcom_star_pick` T2/T3) · plate territory payload (field export, visibility, `sig`; the tmp territory b3–b5 maths moved into the sweep — Finding 599) · range util + blip mode (migrated from `warp_stratcom` W13 / `tmp_obs_detection_reform` T7/T8) · frame budget in kl./s with / without territory, curtains and labels |
| **Contact sheet** | 5 themes × frames: fly-out t = 0 / 0.3 / 0.6 / 1.0 · galaxy with territory A + B + C · a contested seam · pin with actions · hover expansion · rail with N ships · ping · lanes · dive approach with brackets · dive arrival |
| **STOP** | `kosmos-handover\galaxy-g2\`; PASS → up to three `feat(G2-n)` + `docs(G2)` |

### G3 — single-ship warp from the galaxy

| | |
|---|---|
| **Flag** | `FEATURES.galaxyWarp` |
| **Scope** | `RightClickMenu`: a `galaxyStar` target type; entry "Warp to X — N jumps, ETA, fuel" for the selected ship (`planWarpRoute` + `canOrder`), disabled with the reason when infeasible; the renderer shows labels per locale (Finding 592); hover preview of the route for the selection (polyline through hops, hop points, role `primary`; unreachable in `dim` with the reason in the expansion); pin [ Send ▼ ] → picker of warp-capable ships (by `canOrder`, not "docked at the active colony" — Finding 593); order through `OrderService.issueWarp`; refusal with the reason (Finding 594); names through `reveal.name` everywhere incl. the logs (Finding 589); `canOrder` gets the service-state term (Finding 588) |
| **Keepers (logic)** | menu option model (availability, reason, PL + EN label) · preview model (hops, legs, ETA, fuel, partial fields on `insufficient_warp_fuel`) · reveal gate on names (menu, preview, picker, `warpRoute.started` / `vessel.interstellarLaunch` texts) · 588 pin (stored / mobilizing refused, active accepted) — **with fail-first** (it changes a gameplay rule) · **re-aim** `return_actions_removed_smoke` A3 (the way home = the galaxy menu / [ Send ▼ ]) |
| **Contact sheet** | 5 themes: menu entry (feasible / infeasible), preview reachable / unreachable, [ Send ▼ ] open |
| **STOP** | `kosmos-handover\galaxy-g3\`; PASS → `feat(G3)` + `docs(G3)` |

### G4 — fleet warp (new mechanic, FULL gate)

| | |
|---|---|
| **Flag** | `FEATURES.fleetWarp` |
| **Mechanic** | `OrderService.issueFleetWarp(fleetId, systemId)` (shape in §1 A13, D-GX-19): phase 1 without side effects (canOrder per member incl. 588, same system, one plan with `min maxHop` and the binding range, speed = slowest member) → any failure refuses the whole fleet and names who (D-GX-20) and leaves `fleet.activeOrder` untouched (Finding 275 rule); phase 2: `beginJourney(v.id, systemId, { hops, groupId, speedLY, arrivalAngle })` per member + `dispatchInterstellar(…, { speedLY })` (speed lock → lockstep arrivals, no rendezvous state) + the fleet-level order record, completion when all members arrive, rules for a member that is diverted / destroyed / aborted |
| **UI** | right-click a star with a fleet selected → "Fleet: warp to X — N jumps, ETA (slowest), fuel (binding member)"; preview for the fleet; mixed fleet → disabled entry naming the members that cannot jump |
| **Keepers** | NEW `fleet_warp_smoke` with **fail-first in a fresh clone on the parent commit**: refuse-all leaves every member and `fleet.activeOrder` bit-for-bit; one plan for all (same hops); binding member named; lockstep arrival at every hop (same tick); shared final angle; diverted member leaves the group without breaking the others; wrecked member; save / load round-trip mid-route (v101 without migration if the route record is copied whole — verify); AI path (`issueGroupAttack`) byte-identical |
| **Gate** | written checklist BEFORE the gate (`docs/design/GALAXY_G4_GATE_CHECKLIST.md`), one-liners validated on the live engine, live gate in the owner's window |
| **STOP** | `kosmos-handover\galaxy-g4\`; PASS → `feat(G4)` + `docs(G4)` |

### G5 — cleanup (T4 method)

| | |
|---|---|
| **Flags** | `skyCatalog`, `galaxyView`, `galaxyLook`, `galaxyWarp`, `fleetWarp` permanent ON; OFF paths deleted |
| **Removed** | the `'stratcom'` tab (`FleetManagerOverlay.js:1356-1364`) and every **X** row of A7 (methods, handlers, state, resets); `src/renderer/StratcomGalaxyRenderer.js`; dead i18n keys (§6); `deep_space*.png` stays on disk unless the owner wants it gone (asset, not code) |
| **Kept** | `cluster_switch` handler (producers `_drawRight` `:7723`, `ShipPanelHudLogic.js:208`); `_dispatchReturnJump` / `_toastReturnFailed`; `_warpErrLabel` moved to a pure module; `StratcomHitLogic`; `HolotableCamera`; `TerritoryRenderLogic`; `TerritoryField`; `TerritoryService`; `SystemReveal`; `SystemExploration` |
| **Keepers** | D-GX-21 list (re-aims with stated reasons); `log_depth_chunks_smoke` T6 lists edited; a cleanliness pin (`galaxy_g5_clean_smoke`, wzór `tabs_t4_clean_smoke` / `hud_bz_clean_smoke`) |
| **Proof** | T4 method: deterministic traces of surviving surfaces before / after (Command tabs, ship panel, foreign panel `cluster_switch`), contact sheet pairs 0 px on the surviving surfaces |
| **Docs** | `MANUAL.md:856`, `fleet.colonizeCrossSystemHint` wording, comments naming G/M → Stratcom (A9) |
| **STOP** | `kosmos-handover\galaxy-g5\`; PASS → `chore(G5)` + `docs(G5)`; arc closed |

## §5 Decisions for the owner's signature (D-GX-1 … D-GX-22)

Each: options, **recommendation**, one line of consequence. `[step]` = the first step the decision gates. Items marked
**⚠ frame** are places where the frame, read literally, is infeasible or collides with a canon — with the evidence.

| D | [step] | Question | Options | Recommendation | Signed 2026-10-30 | Consequence |
|---|---|---|---|---|---|---|
| **D-GX-1** | G1 | Galaxy unit multiplier K (world units per ly) | (a) 40 (frame) · (b) 140 · (c) 200 | **(c) 200**, with the plate authored in ly inside one `Group` and `group.scale = K` (K stays one constant to tune) | **(c)** K = 200 | measured: at K = 40 the active system's orbit disc covers a median 23 neighbouring stars during the cross-fade (max 34); at 200 none in 40 seeds (`results/galaxy_scale.json`) ⇒ fly-out / fly-in may overlap their fades; costs a mode-dependent far plane (D-GX-3). (a) works only with strictly sequential fades (a visible "empty sky" beat in every transition) |
| **D-GX-2** ⚠ frame | G1 | What sits at the world origin in galaxy mode | (a) home, always (frame literal) · (b) the ACTIVE system (floating origin): `group.position = −P_active·K` | **(b)** | **(b)** | F2 needs "the star shrinks to a point that IS the plate point at the origin"; the star of the active system is always at (0,0,0) (`GameScene.js:4561-4574`), the active system is often not home. (b) = (a) when the player is home. Entering another system: the dive rebases plate + camera by the same vector in one frame (invisible; the sky follows the camera) |
| **D-GX-3** | G1 | Camera in galaxy mode | far plane · zoom law · drag · range | **far** per mode (system 5 000 bit-for-bit, galaxy 40 000 at K = 200); **zoom** multiplicative (the stratcom factors ×1.12 / ×0.89, `FleetManagerOverlay.js:1617` — applied per normalised 100-px notch, not per event); **drag = PAN** on the fixed oblique (holotable H2 — pitch 0.92, yaw 0.6, `panScreenToWorld`), no orbit; **range** floor 6 ly·K … max 120 ly·K, pan clamp ±30 ly·K; slider reads the galaxy range | as recommended | system-mode behaviour (U4-4, 501) untouched; the controller gets a mode field. Orbit in galaxy mode stays an option (§7) |
| **D-GX-4** | NIEBO | Sky model | (a) follow-camera dome · (b) enlarged world-anchored shell | **(a)**: one `Group` with handles, `position = camera.position` per frame; the star layer becomes a dome like the nebula (D-D3: opaque list, `renderOrder −1`, depth test and write off, additive — so planets always cover it); radius stays 300–1 000 | **(a)** | the sky depends only on camera ORIENTATION ⇒ continuous across any transition by construction; ends Finding 591 (stars over planets); system mode loses the unphysical camera parallax of stars 300–1 000 WU away; `log_depth_chunks_smoke` T7's starfield pin flips with the nebula precedent. (b) needs a shell beyond any camera position (> 25 000 WU at K = 200) and a far plane to match — and still shows parallax |
| **D-GX-5** ⚠ frame | NIEBO | Filler catalogue radial law and brightness | radial: (a) volume-uniform 30–3 000 ly (real density) · (b) radius-uniform (density ∝ r⁻², more near stars) · brightness: (i) raw L/d² · (ii) magnitude law (log, floor, HDR cap) | **(a) + (ii)**, the 71 real systems carry the parallax | **(a) + (ii)** | measured (volume-uniform): 96.5 % of filler stars > 1 000 ly, filler parallax between the two farthest systems median 0.43° (max 1.2°) — the "parallax between two systems" of F7 is real only for the 71 real systems; raw L/d² spans > 4 decades and the nearest real system is ~3 000× brighter than the brightest filler ⇒ a magnitude law is mandatory. (b) gives ~2 % of stars < 100 ly with visible parallax, at the price of a non-physical density |
| **D-GX-6** ⚠ frame | NIEBO | Catalogue lifecycle | when to build / recompute; what before the galaxy exists; galaxy-mode sky | **build** right after `galaxyData` is minted or restored (`GameScene.js:2156-2165`) via `threeRenderer.setSkyGalaxy`; **recompute** in `switchSystem` and in that call (covers load — no `switchSystem` happens on load); **before** the galaxy exists the sky is empty (no `Math.random` field ever); **galaxy mode** keeps the directions of the last active system (filler effectively at infinity) and fades the 71 real stars out (`uRealFade`) | as recommended | the seed is not available at renderer construction nor at the first `initSystem` (sky sweep); non-4X saves mint a new galaxy per load (GALAXY_SEED Deviation 2) — accepted, the generator scenario is frozen |
| **D-GX-7** ⚠ frame | G2 | Semantic-zoom gesture constants | count events · count accumulated delta | **accumulated, normalised wheel delta beyond the clamp**: arm only when `_targetDist === maxDist` and the camera has settled (`|_dist − max| < 2 %`); the notch that REACHES the clamp does not count; trigger when the excess reaches **2 notches = 200 px** (`deltaMode` LINE ×33, PAGE × viewport height) inside **600 ms**; any wheel-in or leaving the clamp resets; a transition in progress swallows the wheel. The dive mirrors it at the galaxy floor | as recommended | a trackpad sends dozens of small `deltaY` events per gesture — counting events would fire on a light touch; the raw per-event `deltaY` path of the system zoom stays byte-identical |
| **D-GX-8** | G1 | Keys and mode interplay | G · M · Esc · Y · overlays | **G** toggles galaxy mode (remove `'g'` from `OverlayManager._keyMap`; handled before `overlayManager.handleKey`, civMode only; Shift+G same); **M** keeps opening the old tab until G5, then becomes free; **Esc** in galaxy mode (nothing else to close) returns to the system; **Y** in galaxy = no-op, entering galaxy exits tactical mode; an **overlay** opened in galaxy mode keeps the mode (no auto-exit — unlike tactical); G with an overlay open closes the overlay and enters galaxy | as recommended | `overlay_tab_entry_smoke` T6 re-aimed; `MANUAL.md:856` updated in G5; today G inside `ColonyOverlay` opens Command (A9) — after the change it toggles the map (G is not an overlay-local key) |
| **D-GX-9** ⚠ frame | G1 | Pill and outliner root | pill: replaces or duplicates G · root: new row or clickable header | **pill duplicates G** (same toggle, tooltip names the key); **root = a new first row "GALAXY / GALAKTYKA"** in the left outliner (the header `UKŁADY [n]` stays as it is — tooltip only); in galaxy mode the root row is the "back to system" entry (active system name) | as recommended | there is no root today (A11); a clickable header would change the hit model the outliner keepers pin |
| **D-GX-10** ⚠ frame | G1 | Left outliner list in galaxy mode | source · filter · order · right outliner order | **source** `galaxyData.systems`; **filter** `reveal.name`; **dim + ○** when `!reveal.place`; **order** D-UI-2 extended (home, own systems with POP colonies, outposts / stations, then by distance from home); rows of never-generated systems have no "enter"; the **right** outliner in galaxy mode orders its sections itself (own systems first, then by distance) instead of reading the left list (`Outliner.js:79-84`) | as recommended | the system-mode tree (D-UI-3) and its keepers stay byte-identical; `switchActiveSystem` refuses never-generated ids (`StarSystemManager.js:145-149`) — the row says why |
| **D-GX-11** ⚠ frame | G1 | Foreign colonies in the expansion | (a) frame literal: contact → names · (b) two axes: names need **place ∧ contact** | **(b)**: names (body names) when `reveal.place ∧ reveal.ownerIdentity`; "?" when `reveal.ownerExists`; nothing otherwise; population only at `reveal.population` | **(b)** | AI home systems are generated at galaxy bootstrap, so their bodies are in `EntityManager` before the player saw them; body names are PLACE facts in the canon (`SystemReveal.js:6-18`) — (a) re-opens Finding 186 / 188 for every AI system at `contact` |
| **D-GX-12** | G1/G3 | Right outliner warp filter and the reserve | (a) `warpFuel.max > 0` only · (b) + reserve hulls dimmed with the reason, warp refused | **(b)**; `WarpRouteSystem.canOrder` gets `isInService` in G3 (Finding 588) | **(b)** | the stratcom tab (until G5) refuses reserve hulls too — a behaviour change of an existing path, deliberate (it closes the warp twin of W3 §S24) |
| **D-GX-13** | G2 | Dive target and [ Enter ] gate | target rule · enterable · capture radius · brackets | **target** = the selected (pinned) star, else the enterable star nearest to the camera target on the plate within **3 ly**, else none (the wheel stops at the floor); **enterable** = `isSystemExplored(sys) ∧ starSystemManager.getSystem(id)` — the `cluster_switch` gate of Finding 186 (`FleetManagerOverlay.js:6538, :6985`), shared by [ Enter ], the outliner and the dive; **brackets** ⌜⌟ on the target from the last two notches above the floor | as recommended | the dive can never become a new 186 leak (entering the 3D view of an unexplored AI system) |
| **D-GX-14** | G2 | Transition mechanism | controller `flyTo` · time-based driver | **driver** (the intro pattern: `applyPose` writes the controller's fields and neutralises its lerps, time-based easing, input swallowed by a capture listener, Esc → end state); **fades** only on lines / sprites / points and the HUD, meshes hidden once sub-pixel (no `transparent` toggling on the V4 depth materials); `switchSystem` during a dive happens when the plate and the real stars are at 0; **durations** ~1.4 s out / ~1.2 s in (knobs) | as recommended | `flyTo` clamps at 450 and its lerps are fps-bound; `resetToSystemView` is already a no-op under a driver (`ThreeRenderer.js:4104`), and the `frameSystem` snap inside `switchSystem` (`:1248`) is overridden because the driver re-applies the pose every frame (the intro proves it) |
| **D-GX-15** | G2 | Territory field for the shader plane | (a) the existing grid exported as a float texture · (b) analytic field per fragment from source uniforms | **(a)**: `TerritoryField` keeps a `Float32Array field` per owner next to `mask` (same grid, `GRID_LY 0.75`, nx ≈ 83); one 1-channel float texture per owner (bilinear); rim from the gradient; contested seam from the per-texel max of the other owners; `GRID_LY` = knob (0.5 if the owner sees kinks) | as recommended | plane rim and curtains come from the same grid (they coincide); +27 KB per owner per recompute; `hash` and every existing consumer unchanged. (b) is exact and resolution-free but its rim drifts up to ~½ cell from the curtains' loops |
| **D-GX-16** | G2 | Galaxy labels and chips | candidates · density · chips | **candidates**: "centred under" first, then the 56 standard ones (`labelCandidates` has no centred-under, A6); **density**: never hidden — home, owned, selected, hovered, pinned, dive target; others hidden on overlap and revealed on hover; **chips**: [R] = observatory ping, [T] = warp routes + lanes, [E] = labels, [O] hidden in galaxy mode | as recommended | `placeLabels` never hides a label today — 72 names on a dense plate would pile up |
| **D-GX-17** ⚠ frame | G2 | [ Beacon ] [ Gate ] in the pin | (a) as written · (b) disabled with "not available" · (c) omitted until a mechanic exists | **(b)** | **(c) OMITTED** — no [ Beacon ] / [ Gate ] in the pin until a mechanic exists (§7 O5); dead keys → G5 retire list | Finding 590: no producer anywhere, backend free / instant / tech-less, a beacon = ×3 warp speed — (a) would hand out free infrastructure; a mechanic (cost, tech, build time) is outside F1–F7 (§7) |
| **D-GX-18** | G3 | Names on warp surfaces | — | every system name on the menu entry, the preview hop labels, the [ Send ▼ ] picker and the warp logs (`warpRoute.started`, `vessel.interstellarLaunch`) goes through `reveal.name` ("???" otherwise) | as recommended | closes Finding 589 for the new surfaces and the logs; the dying stratcom surfaces are not patched |
| **D-GX-19** ⚠ frame | G4 | Fleet warp mechanic | group sync: (a) speed lock · (b) rendezvous at each hop · angle: SB54 as-is · extended player path | **(a) + extended player path**: one plan (`min maxHop`, binding range — one Dijkstra suffices because every member's fuel = distance × own consumption), groupSpeed = slowest member, `dispatchInterstellar(…, { speedLY })`, the final hop's arrival angle drawn once; validate-all → dispatch-all; fleet order record `{ type: 'warp', targetSystemId, groupId }`, complete when every surviving member arrived, a diverted member leaves the group | as recommended | SB54 cannot be reused as-is: `issueGroupAttack` refuses player hulls (`OrderService.js:226`), the player path takes no options (`:158`), and the group start is not transactional (`:243-246`); (b) needs a waiting state per hop and its serialization |
| **D-GX-20** | G4 | Mixed-fleet refusal wording | new key · reuse | **reuse** the D-E2 shape (`describeFleetOrderRefusal` + `vessel.orderNoneMoved` "No vessel moved · <Name> (<reason>)") with warp reasons mapped by the `_warpErrLabel` table moved into a pure module; the reserve reason reuses `vessel.reasonVesselInReserve` (no new key) | as recommended | the menu entry is disabled with the same text as the refusal; no second dictionary for the same event |
| **D-GX-21** | G5 | Keeper migration and the old tab G1–G4 | — | **old tab**: reachable only through the Command tab bar (and M) until G5; **keepers**: `stratcom_star_pick` T2/T3 → `galaxy_pick`, T5 → a tactical keeper; `stratcom_warp_trap` → pin-button model ("[ Enter ] always offered when enterable, also with a ship selected"); `stratcom_ship_icon` T1–T7 → rail geometry, T8 retired; `stratcom_reveal` T1–T3/T7 → galaxy content builders, T4 widened to label ≡ pin ≡ outliner, T5 kept, T6 retired; `warp_stratcom` W8/W12–W15/W13 → menu model / rail input / range util, rest retired; `overlay_tab_entry` T1–T3/T5/T7 re-targeted, T4 retired, T6 re-aimed in G1; `system_exploration_canon` T1–T3 → the enterable gate, T7 control moved to the new consumer; `return_actions_removed` A3 → the galaxy way home (G3); `log_depth_chunks` T6 file lists edited; `return_home_no_brick` T9 import re-aimed; tmp smokes: holotable camera + territory b3–b5 + contours moved into the sweep (Finding 599), the rest left as historical scratch | as recommended | the T4 method: every re-aim names its reason in the commit; sweep green at every step |
| **D-GX-22** | G2 | Observatory ping | centre · metric · range table | **home**, **planar** (the plate is a disc; status quo of H5 and `inSensor`), table `STRATCOM_LY_BY_LEVEL` moved to a pure util unchanged | as recommended | Findings 595 / 596 stay recorded (the observatory's own system as centre and a 3D metric are options — §7) |

**The 3–5 decisions that gate NIEBO / G1:** D-GX-4 (sky model) · D-GX-5 + D-GX-6 (catalogue law and lifecycle) ·
D-GX-1 + D-GX-2 (K and the anchor) · D-GX-8 + D-GX-9 (keys, pill, root) · D-GX-10 + D-GX-11 (outliner galaxy list and
the two-axis rule).

## §6 i18n — keys to add and to retire (PL + EN, `tools/check-i18n.mjs`)

Baseline at HEAD: pl = en = **3 401** keys, `check-i18n` PASS (keymap/i18n sweep). Rule of the arc: **reuse first** —
the stratcom detail panel already speaks every fact the pin needs; the keys move from "dies with the tab" to SHARED by
being reused, so G5 retires less. ⚠ The checker FAILS when a deleted key is still called as `t('…')` anywhere in `src/`
(tests included) — re-aim the tests before deleting (`stratcom_reveal_smoke.mjs:109-116`,
`system_exploration_canon_smoke.mjs:120-122`); keys read through `tx(` or `PL[…]` are invisible to the checker but fail
at runtime (`label_hover_smoke`, `w3_raider_lever_smoke.mjs:212`). Wording below is a proposal for the owner.

### Add

| Step | Key | PL | EN | Note |
|---|---|---|---|---|
| G1 | `bottomBar.mapSystem` | UKŁAD | SYSTEM | pill segment |
| G1 | `bottomBar.mapGalaxy` | GALAKTYKA | GALAXY | pill segment |
| G1 | `bottomBar.mapModeHint` | Widok mapy — klawisz G | Map view — key G | pill tooltip |
| G1 | `leftOutliner.galaxyRoot` | GALAKTYKA | GALAXY | root row in system mode (D-GX-9) |
| G1 | `leftOutliner.backToSystem` | ← Układ: {0} | ← System: {0} | root row in galaxy mode |
| G1 | `leftOutliner.galaxyInfo` | {0} ly · {1} · kolonie: {2} | {0} ly · {1} · colonies: {2} | info line (distance, spectral type, colony count); the owner part reuses `fleet.stratcomEmpire` / `fleet.stratcomEmpireForeign` / `fleet.stratcomEmpireUnknown` |
| G1 | `leftOutliner.cannotEnter` | Brak widoku — nikt tu nie dotarł | No view — nobody has been there | tooltip of rows without "enter" (D-GX-10) |
| G1 | `leftOutliner.foreignColoniesUnknown` | obce kolonie: ? | foreign colonies: ? | `ownerExists` without `place ∧ contact` (D-GX-11) |
| G2 | `galaxyPin.enter` | Wejdź | Enter | chip `[ … ]` (chip brackets added by the chip idiom) |
| G2 | `galaxyPin.send` | Wyślij ▼ | Send ▼ | disabled until G3 |
| G3 | `galaxyMenu.warpTo` | Skok do {0} | Warp to {0} | menu entry title; details reuse `fleet.warpHops` · `fleet.warpEta` · `fleet.warpFuelNeed` (neutral "Skoki: {0}" — avoids the PL plural trap of Finding 563) |
| G4 | `galaxyMenu.fleetWarpTo` | Flota: skok do {0} | Fleet: warp to {0} | fleet entry |
| G4 | `warpRoute.fleetStarted` | {0}: flota skacze do {1} (skoki: {2}) | {0}: fleet warping to {1} (hops: {2}) | one fleet-level Log line instead of N member lines |
| G4 | `warpRoute.fleetCompleted` | {0}: flota dotarła do {1} | {0}: fleet arrived at {1} | |

Reused without change (no new key): `vessel.reasonVesselInReserve` ("Kadłub w rezerwie — najpierw obsadź go załogą (Rozmieść)" /
"Hull in reserve — crew it first (Deploy)") for Finding 588's refusal; `tooltip.menu.requiresSelection` for the Polish literal in
`buildMenuOptions` (Finding 592); `vessel.orderNoneMoved` / `vessel.orderPartial` + `log.el.orderRejected` for the fleet
refusal (D-GX-20); the `fleet.warpErr*` set for route / gate reasons; `fleet.scan*` + `fleet.opsScan` + the three scan
toasts for [ Scan ]; `fleet.stratcomEmpire*`, `fleet.stratcomHostility`, `fleet.stratcomPopulation`,
`fleet.stratcomPopUnknown`, `fleet.stratcomLife*`, `territory.playerEmpire`, `territory.controlRow`,
`fleet.clusterExplored` / `fleet.clusterUnexplored` for the pin expansion; `fleet.selectShipToSend`,
`fleet.noWarpShipsAvailable`, `fleet.cancelSend`, `shipPicker.fuel` / `shipPicker.warp` for [ Send ▼ ];
`fleet.clusterDistance` ("{0} LY", dead today) for the ping readout.

### Retire in G5 (only what has no consumer left)

| Group | Keys | Why |
|---|---|---|
| tab chrome | `fleet.tabStratcom`, `fleet.galaxyMapTitle`, `fleet.sensorLens`, `fleet.stratcomNoData` | the tab, its title, the lens toggle and the empty state go |
| warp list / order panel | `fleet.warpShipsTitle`, `fleet.warpNoShips`, `fleet.warpOrderTitle`, `fleet.warpSend`, `fleet.warpCancel`, `fleet.warpFeasible`, `fleet.warpTotalLY` (unless the preview shows the distance), `fleet.warpStatusIdle` / `Busy` (unless the right outliner reuses them for dim reasons — `InTransit` / `Immobilized` likely reused) | replaced by the outliner, the menu entry and the preview |
| detail panel | `fleet.clusterSend` (replaced by `galaxyPin.send`) | |
| already dead (zero consumers at HEAD) | `territory.legendZone/Border/Owner`, `fleet.stratcomRange/Sensors/Blind/ObsLevel`, `fleet.clusterReturn/SelectTarget/Spectral/Mass/Home/Colony/Beacon/Gate/BuildBeacon/BuildGate` (Beacon / Gate: D-GX-17 (c)), `fleet.starCluster`, `fleet.opsBodies/NoScan/ScanToast`, `fleet.tabShipyard`, dead-code `fleet.tabVessels/Fleets`, `civPanel.galaxy` (with the dead `CivPanelDrawer.js:38` entry) | housekeeping in the T4 method (precedent: 24 keys retired in TABS T4); `fleet.clusterBeacon/Gate` and `fleet.clusterDistance` are revived above instead |
| reworded, not retired | `fleet.colonizeCrossSystemHint` (names "STRATCOM") | new wording: "Inny układ: skok z mapy galaktyki → „Kolonizuj obcy" na orbicie" / "Other system: warp from the galaxy map → "Colonize" while orbiting" |

Expected balance at G5 (proposal, after D-GX-17 (c)): +14 added, ~37 retired (most of them dead today) → pl = en ≈ 3 378.

## §7 Options outside the frame (NOT scheduled — owner's scope rule)

| # | Option | Why it came up | Cost / note |
|---|---|---|---|
| O1 | **Sky labels (P3)** — names of the brightest real systems in the background sky of system mode, reveal-gated | the 71 real systems are in the sky after NIEBO; the nearest are ~3 000× brighter than the filler | small HUD sublayer; must use `reveal.name` |
| O2 | **Zoom-slider detent** at the system / galaxy boundary (the slider spans both ranges, a notch marks the switch) | F3(d) makes `maxDist` mode-dependent; one continuous slider reads better than two | `ZoomSliderLogic` is pure — a detent is a mapping change |
| O3 | **Orbit (yaw) drag in galaxy mode**, e.g. right-drag rotates around the target while left-drag pans | D-GX-3 recommends the holotable's fixed oblique + pan | camera branch only |
| O4 | **Observatory range centred on the observatory's own system, 3D metric** | Findings 595 / 596 | changes what the player sees as "in sensor range" — a rules change |
| O5 | **Beacon / jump-gate mechanic** (cost, tech gate, build time, where it can be built) | Finding 590 — the pin chips have no honest backend | a design slice of its own |
| O6 | **Fleet warp by rendezvous** instead of speed lock (members wait at each hop) | D-GX-19 alternative | waiting state per hop + serialization |
| O7 | **One group-warp path for AI and player** (SB54 `issueGroupAttack` reusing the G4 group journey) | after G4 two group-start paths exist | AI behaviour change — needs the AI gates |
| O8 | **Remember the map mode across save / load** | G1 always starts in system mode | trivial, but changes the first frame after load |
| O9 | **Remove `assets/backgrounds/deep_space*.png`** after G5 | only the dying stratcom surfaces read them | asset deletion |
| O10 | **Sky of `BattleView3D` from the catalogue** (it draws its own 600 random points) | NIEBO makes the main sky deterministic; the battle cinema stays random | renderer of the cinema |
| O11 | **Dead config cleanup** (`BACKGROUND_COLOR`, `STAR_COUNT_BACKGROUND`, `THEME.starfield` ×11) if not done inside NIEBO | Finding 597 | trivial |
| O12 | **The dead `galaxy` entry of `CIV_TABS`** (`CivPanelDrawer.js:38`, key letters that disagree with the keymap) | A9 | housekeeping |
| O13 | **Stale tmp smokes** (`tmp_tabscaffold_smoke` `_hoverShipId`, `tmp_territory_b1` save v91, `warp_stratcom_smoke` W12e vacuous and its unparsed summary) | A10 | housekeeping; the swept one dies or is re-aimed in G5 anyway |
| O14 | **`M` as an alias of the map toggle** after G5 (today M = mini-map → Stratcom) | D-GX-8 leaves M free after G5 | key map only |
| O15 | **Enemy and allied territory history** (territory from the last intel snapshot instead of live ownership) | the plate shows live ownership for `contact+` empires | a fog-of-war rules question |
