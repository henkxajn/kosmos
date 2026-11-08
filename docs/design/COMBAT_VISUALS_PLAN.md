# COMBAT_VISUALS_PLAN — one battle scene with semantic zoom (arc CV)

> **Status: Phase A (CV-0) — read-only audit + plan, SIGNED by the owner 2026-11-08 (§3 column "Signed"; conditions in
> §3.1; the cut reordered for an early visual payoff, §4). Phase A commits: `c855298 docs(CV A)` (plan) and
> `c0700de docs(CV sign)` (signatures). CV-0b ✅ DONE 2026-11-08 (`aeff511`, owner's check PASS, §4 CV-0b — delivered).
> CV-2a ✅ DONE 2026-11-08 (`230fd3c`, owner's check PASS, `cvFxEngine` default ON with the owner's tuning; §4 CV-2a — delivered).
> Next: CV-3a.**
> Anchor HEAD `95f7ab7` (ARKUSZ GALAXY closed). Phase A implemented nothing — no `src/` edits, no keepers, no smokes, no
> probes in the browser. The only repo files written by this phase are this plan and one pointer line in `CLAUDE.md`,
> committed as `docs(CV A)`; that commit is the anchor of CV-0b.
> Evidence: six parallel read-only source audits (render seam · FX engine and P2 UI · DSCS core and clocks · orbital
> battles and audio · ship models · harness and perf) plus node measurements of the 27 ship GLBs (own GLB parser, PNG and
> baseline-JPEG decoders, software silhouettes), all run in a scratchpad outside the repo. Every claim carries `path:line`
> at `95f7ab7`; **[INF]** = inference from source, not run in the game.
> Units: **WU** = Three.js world unit (1 AU = 11 WU); **L** = one frigate length = `VESSEL_TARGET_SIZE.frigate` 0.016 WU;
> **R** = `combatRoundMs` (real milliseconds per watched round, default 400).
> **Next free finding number: 646** (this plan files **#612–#645**; #637 from CV-2a; #638–#645 from the CV-2a owner's check).

---

## §0 Owner's frame (signed 2026-11-07 — verbatim; not relitigated, the plan is built around it)

F1. Visual reform ONLY. Combat mechanics stay untouched: DSCS and BattleSystem math, round timing, logical positions, ranges, targeting, outcomes, save format. With every CV flag ON vs OFF, battle results must be identical.

F2. Chosen direction = "B + director camera": one battle scene with semantic zoom — far = tactical holo language (icons/silhouettes, vectors, fire lines, range bands, KOSMOS terminal aesthetic, theme palette roles); near = cinematic (3D models, choreography, full VFX, minimal HUD); smooth transition (same spirit as the galaxy-mode fly in/out). Plus an optional "Director camera" toggle (establishing shot, follow flagship, hero shot with short slow-down on a big kill, hit shake, 9:16 framing option for promo reels); the player can always take the camera back.

F3. Battle stage (presentation space): while a battle is in view, participants are drawn in a local stage around the battle centre with MONOTONIC distance compression (closer in logic ⇒ closer on screen). Targets: laser gap ~3–4 ship lengths, kinetic ~7–9, missile ~12–15 (today ~33 / ~98 / ~196 frigate lengths). Logical positions are never written by the renderer.

F4. Choreography inside an envelope: class profiles (frigate orbits/strafes, destroyer arcs at mid range, battleship turns broadside slowly), doctrine modifiers (engage_in_range / kite / hold_position / retreat_at_50) must be VISIBLE, ships face their target, engines lit in combat, 3D (not a flat y=0.3 plane). Envelope smaller than the gap between range bands — choreography never moves a ship into a different apparent range band. Deterministic (seeded by encounter id). "Pause is pause": everything freezes in pause, no catch-up.

F5. Weapon language with cause → effect: laser = charge + HDR beam; kinetic = muzzle flash + tracer projectile with flight time + sparks; missile = salvo with curved trail. Misses fly past the target. HP bar drops at IMPACT, not at round start. Shield = fresnel bubble with ripple at hit point; armor = sparks/scorch. Damage states (smoke 75% / fire 50% / sputtering engine 25%). Layered explosion (flash → fireball → shockwave → debris → embers → smoke) + dynamic light on neighbours. Wreck = burn-out with glowing edge and drift, not instant black.

F6. Orbital battles (EnemyAttackHandler / BattleSystem / WarSystem paths) are IN scope and use the same stage and VFX. Today's `_spawnBattleBurst` imitation and the legacy `BattleView3D` cone cinema are to be retired.

F7. Scale: up to 10 vs 10. Owner PC = "High" reference (Ryzen 5 5600X, 32 GB, RTX 3070 8 GB): full effects at 60 fps. Quality presets High / Medium / Low for weaker Steam machines; degradation drops secondary effects first, never shots.

F8. Sound: OUT of this arc, but build the structure now — a cue bus (e.g. `combatfx:cue` with kind fire/impact/shieldHit/explosion/destroyed, weapon, size, stage position, screen pan) + a cue→sound-id table with empty entries + a no-op listener, so sounds later = fill the table only.

F9. P2 combat UI (engagement ring, top combat card, HP bars, hit glow) is to be REDESIGNED as part of the new tactical layer. Keep the solid math (CombatWatchLogic framing, safe rect, fog-of-war gating).

F10. Ship model standard (owner makes new models in Midjourney → Meshy, NO Blender): one engine nozzle at the stern; hull not black; one KEY COLOUR for all windows/running lights = bright cyan, used nowhere else on the hull — the game derives real emission from it (Meshy produces no emission maps); visible turrets on warships; no text/logos; ~10–15k tris, 2K PBR, GLB; bow direction arbitrary. Pipeline: owner drops `<slot>.glb` into assets/models/ships/incoming/ → a normalizer script (center, scale, orientation, texture compression, tri reduction, archive old, swap slot) → a "Model Workshop" dev page in the game where the owner CLICKS: bow, nozzle, turrets W1..Wn, and tunes a key-colour mask threshold slider with live preview → saves `<slot>.hardpoints.json`. Legacy models without cyan: workshop lets the owner click individual light points instead.

F11. Protocol (owner's rule for visual work): light loop build → look → tune. One flag per step. Keepers ONLY for logic: (a) results identical flag ON/OFF, (b) renderer never writes logical positions, (c) fog-of-war gating, (d) pause freeze, (e) determinism of choreography, (f) perf budget in fps where measurable. No pins on drawing constants.

### §0.1 Where the measurement forces a reading of the frame (summary — evidence in §1, decisions in §3)

1. **F1 holds for the battle maths by construction, but NOT for the whole game.** DSCS is seeded
   (`mulberry32(seedBase + round)`, `DeepSpaceCombatSystem.js:620`; `seedBase` from `gameTime`, `:388`), paced by the
   combat clock and blind to the renderer (§1 Q4, Q11). But every THREE object draws **4×** from the game's global
   `Math.random` (`generateUUID`, `src/lib/three.core.js:312-317`), `ThreeRenderer.js` calls `Math.random` 12 more times,
   and today one hit shot of the current FX costs ≈32–44 draws **inside** the DSCS tick. The same stream places orbit
   slots that WRITE logical vessel positions (`OrbitalSpaceSystem.js:273-292` → `VesselManager.js:2600-2616`), arrival
   angles (`VesselManager.js:3098`), invasion landing hexes, ground combat and intel noise. ⇒ any flag that changes how
   many THREE objects exist (light sprites, pools, projectiles) would make "ON vs OFF" diverge in the world, and through
   it in later battles. **D-CV-1 / step CV-0b: take renderer randomness off the game stream first.** (#612)
2. **F3's three windows are met by ONE compression law.** DSCS parks a ship at 0.95 × its own max range: 32.7 / 98.0 /
   195.9 L for laser / kinetic / missile (`DSCS:580`; ranges `ShipModulesData.js:471, :487, :503`). A pair-gap law
   `G(d) = k · d^α` with **α = 0.7525, k = 0.0913** (d and G in WU) maps those parks to **3.50 / 8.00 / 13.5 L** and the
   full ranges to **3.64 / 8.31 / 14.0 L** — both inside the windows [3,4] / [7,9] / [12,15] (§2.2, D-CV-2).
3. **F4 "doctrine must be VISIBLE" can only be posture.** DSCS never reads doctrine (grep 0); `kite` moves only the MOS
   band (0.98 vs 0.95, `MovementOrderSystem.js:1385`), inside which the DSCS approach step already stops;
   `hold_position` blocks fleet engage orders but the DSCS approach step still moves free-floating members
   (`DSCS:553-584`); `retreat_at_50` is checked once per 0.5 civ-years (`FleetSystem.js:751`) while a maximal battle lasts
   ≈ 0.069 civ-years. Choreography shows stance (facing, motion style, engine use), never a distance behaviour the logic
   lacks (D-CV-7, #631).
4. **F5 "HP drops at impact" needs a presentation ledger — and mid-battle kills do not exist in the logic.** All damage
   of a round is applied before `combat:roundFx` is emitted (`DSCS:681-715` → `:721-740`); a ship at hp ≤ 0 stays a live
   vessel until `_finalizeBattle`, where every casualty AND every surviving loser becomes a wreck in the same frame, moved
   to the battle-start midpoint (`DSCS:1055, :1097-1114`; backlog #460). The presentation must derive the kill from the
   round data, hold HP and the wreck look until the killing impact, and dedupe the late `vessel:wrecked` (D-CV-8/9).
5. **F6: the only live orbital producer is EnemyAttackHandler** (`forceBattle` / `_fleetArrived` have no input since
   W3-8). It resolves in one call with no rounds (Finding 165), emits `battle:resolved` BEFORE applying wrecks, and its
   result object IS the persisted `gameState.battles[id]` — FX data must ride a sibling key on the event (D-CV-25).
6. **F8: the AudioSystem is deaf in the game scene** — its constructor subscriptions are wiped by `EventBus.clear()` at
   `GameScene.js:197`; the ☰ music / SFX toggles emit into nothing. The cue listener needs an attach hook (D-CV-19,
   #613).
7. **F7: there are no quality presets, no fps helper, and the biggest GPU lever is fixed** — supersampling at
   `min(dpr × 1.5, 2)` (`ThreeRenderer.js:269`: 2.25× the CSS pixels at DPR 1.0, 3.5× at DPR 1.25). Presets must own it.
   Three r171 compiles the light count into every lit shader ⇒ dynamic lights come from a FIXED pool (D-CV-17/18).
8. **F9: keep the maths, not the UI** — `CombatWatchLogic.js` (pure, no imports) and the gates in `VesselFxLogic.js:38-70`
   survive; the card ignores `MapInsets` (#629).
9. **F10, measured:** 26 of 27 GLBs point the bow along local **−X** (the README's "+X" is wrong); `nonwarp_large_science`
   points **+X** and flies stern-first in the game today (#621). The current Meshy files DO carry an emissive map, but it
   is black on all six warships (max 12–29/255), so the enemy tint and the wreck glow are multiplied by ~0 (#620). Cyan is
   almost absent today (≤ 0.06 % of surface) — key-colour emission starts with the owner's new models; legacy models get
   clicked light points. The base colours are JPEG 4:2:0 — thin cyan lines bleed after any lossy re-encode, so the
   normalizer must keep base colour lossless (D-CV-15).

---

## §1 Audit (read-only, HEAD `95f7ab7`)

### 1.0 The chat-audit facts — verdicts

| # | Fact (chat audit) | Verdict | Evidence |
|---|---|---|---|
| 1 | 1 AU = 11 world units | **CONFIRMED**; logical `vessel.position.x/y` are gameplay px (AU × 110), not AU; world = px / 10 on the XZ plane, world y is presentational | `ThreeRenderer.js:5-7, :82-83, :151`; `GameConfig.js:11`; `CoordTransform.js:3-4, :23-26` |
| 2 | target size frigate 0.016 / destroyer 0.020 / battleship 0.028 | **CONFIRMED** (maxDim values × `VESSEL_SIZE_SCALE` 1.0; `hull_cruiser` → battleship; default 0.018) | `VesselModelResolver.js:28, :60-68, :136-139` |
| 3 | weapons laser 0.05 / kinetic 0.15 / missile 0.30 AU | **CONFIRMED** (+ damage 5 / 8 / 12 × `DAMAGE_MULT` 3.0; hit chance `clamp(0.10, 0.95, tracking·1.5·(1−evasion))`; shields 15/1 and 35/3) | `ShipModulesData.js:471, :487, :503, :521, :537`; `DSCS:91, :97, :667` |
| 4 | approach stops at 0.95 × own max range; enemies pinned via `_freezeAsStationary` | **CONFIRMED + correction**: step `min(speed·0.025 y, dist − 0.95·range)` once per round, skipped inside 1.0 × range; the enemy side is always FROZEN (mission null) but PINNED to a body only when most player ships share a `dockedAt` — unpinned enemies close in too | `DSCS:83-86, :404, :553-584, :1289, :1294-1312` |
| 5 | FOV 55; watch MIN_DIST 0.4 ⇒ ships ~2–20 px | **CONFIRMED + correction**: FOV 55, near 0.001, far 5 000; Watch fit binary-searches 0.4–12 WU after `_startWatch` lowers the camera floor to min(prev, 0.05) | `ThreeRenderer.js:391, :6820-6847`; `CombatWatchLogic.js:170-202` |
| 6 | doctrine footprint (kite 0.98 vs 0.95, hold rejects pursuit, retreat_at_50 flag) | **CONFIRMED**; DSCS never reads doctrine | `FleetSystem.js:469-486, :749-812`; `MovementOrderSystem.js:1385, :1391-1392` |
| 7 | in combat ships keep their arrival heading | **CONFIRMED + corrections**: yaw is written only at creation with a mission (`:4751-4761`), in transit with a mission (`:5459-5472`) and for genuine orbiters from the orbit angle (`:5108-5110`, with a sign error — #622); combat free-floaters are never rotated; a sprite recreated mid-battle gets yaw 0 | `ThreeRenderer.js` lines as cited |
| 8 | exhaust only when `state === 'in_transit'` | **CONFIRMED** (and only for non-wreck GLB models, only behind `fcCombatFx`) | `VesselFxLogic.js:233-236`; `ThreeRenderer.js:4713, :6478-6492` |
| 9 | y fixed at 0.3 | **CORRECTED**: 0.3 for free-floaters, glide, creation and transit without a mission; `0.3 · ratio` in transit with a mission; `r · cos φ` for genuine orbiters; 0.45 for deep-space wrecks | `ThreeRenderer.js:4748, :4860, :5427, :5455`; `OrbitalSpaceSystem.js:212` |
| 10 | combat FX: 1-px Line, colour by category, misses to centre at 0.4, flash r 0.06, flat shield ring, HP reads state at once, explosion = sphere + ring, alloc per shot, `FX_MAX_ACTIVE` 120 drop-oldest | **CONFIRMED — all eight**; the cap is shared with non-combat pulses / pings and drops delayed effects that are not yet visible (#617) | `ThreeRenderer.js:6385-6387, :6496-6523, :6604-6669`; `CombatFxConfig.js:10-30` |
| 11 | rhythm: laser every 2 rounds, kinetic 3, missile 5 | **CONFIRMED + nuance**: `CIV_PER_ROUND` 0.3 vs cooldowns 0.3 / 0.5 / 1.0; the cooldown only runs once the target is in range | `DSCS:75, :638-655, :677, :708` |
| 12 | `combatRoundMs` 400; `MAX_ROUNDS` 20 ⇒ ≤ ~8 s | **CONFIRMED**: `SB_TUNING.combatRoundMs` 400 (persisted in `gameState.strikesBackTuning`), `MAX_ROUNDS` 20; round 1 is immediate ⇒ ≤ 19 × 400 = 7.6 s (measured 7 616 ms) | `StrikesBackData.js:145`; `TimeSystem.js:127-129`; `DSCS:61`; `POLISH_PLAN.md:335` |
| 13 | 27 GLBs, one mesh, ~10k tris, 1024² BC/MR/N/E, emissive black (max 2–6), 3 duplicate pairs, base PNG ~2.6 MB, folder 96 MB, README +X vs code −X | **Mostly CONFIRMED, four corrections**: 3 legacy files have no emissive map; emissive *mean* is 0–5.4/255 but *max* 5–229 (7 files carry lit features ≤ 2.5 % of texels; all six warships black); the ~2.5 MB PNGs are the **normal maps** (67 % of the folder) while 24 base colours are JPEG 4:2:0 (avg 271 KB); the bow is −X in 26/27 files (README wrong), +X in `nonwarp_large_science` | §1 Q6 |
| 14 | orbital battles: `_spawnBattleBurst` (16 lines to a point); queue → BattleIntroModal → optional BattleView3D (cones, 4 per side) | **CONFIRMED, narrower**: the cinema exists only on Path A (`warId` set, preference 'ask'); Path B (DSCS, VCS legacy, EAH skirmish) is banner-only under `fcCombatFx`; `_tryShowNextBattle` is at `:4210` (the `:3938` in `deferred-live-gates.md` ENTRY 4 is stale) | `ThreeRenderer.js:1540, :6549-6600`; `GameScene.js:2748-2756, :4210-4266`; `BattleView3D.js:26, :221` |
| 15 | AudioSystem knows no combat events; 3 music tracks | **CONFIRMED + bigger**: in the game scene it receives no events at all (#613) | `AudioSystem.js:58-100`; `assets/sounds/*.mp3` (3 files) |
| 16 | linear HDR → bloom 1.0 → ACES → sRGB; star PointLight + ambient 0.4; no combat lights | **CONFIRMED, made precise**: one composer `RenderPass → UnrealBloomPass(strength 0.5, radius 0.0, threshold 1.0)` (half-float, 5 mips, `smoothWidth` 0.01, factors `[1, 0.7, 0.4, 0.15, 0.03]`) → `OutputPass` (ACES, exposure 1.12, sRGB); supersampling `min(dpr × 1.5, 2)`, no MSAA; `AmbientLight(0x101a26, 0.4)` + `PointLight(0xfff1de, 2.8, 0, 0)` at the star. The old "BLOOM_LAYER + two composers" note is obsolete | `ThreeRenderer.js:85-89, :264-276, :408-427, :1203-1216` |

### Q1 — the render seam for the stage

**Writers of a vessel's drawn transform** (complete grep; other `sprite.position` writes are life-glow dots, trade
fireflies and POIs):

| Site | Cadence | Applies to | Position source | y | Rotation |
|---|---|---|---|---|---|
| `_addVesselModel3D` `:4673-4674, :4748` | creation (async GLB) | any vessel | logical | 0.3 | yaw only `if (vessel.mission)` `:4751-4761`; wreck random tilt `:4798-4801` |
| same, deep-space wreck `:4855-4861` | creation | wreck with `wreckLocation`, `dockedAt == null` | logical `wreckLocation` | 0.45 | — |
| `_addVesselSpriteFallback` `:4984-4986` | creation | GLB failed | logical | 0.3 | billboard |
| `_tickOrbitingVessels` free-floater branch `:5081-5085` → `_placeFreeVessel` | `physics:updated` (`:1225` → `:2842`) | `orbiting` + `dockedAt == null`, not wreck | logical | 0.3 | none |
| `_tickOrbitingVessels` orbit branch `:5088-5110` | `physics:updated` | vessels with an orbital-space orbit | `orbital.getPosition(id, drawnBodyPos, tSec)` | r·cos φ | `θ + π` (#622) |
| `_syncVesselPositions` orbiting branch `:5419-5435` | `vessel:positionUpdate` (`:1311`) | deep-space wreck `:5424-5427`; free-floater → `_placeFreeVessel` `:5432` | logical | 0.45 / 0.3 | none |
| `_syncVesselPositions` transit with mission `:5438-5474` | positionUpdate | `in_transit` + mission | logical | 0.3·ratio | yaw `:5462, :5471`; banking roll `:5463-5469` |
| `_syncVesselPositions` transit, no mission `:5475-5478` | positionUpdate | `in_transit` | logical | 0.3 | none |
| `_applyVesselIntelVisibility` `:5601-5603` | end of transit branch + intel events `:1318-1337` + `_syncCombatReveal` `:6340` | enemy at `rumor`, not revealed by combat | `positionLastKnown` | 0.3 | — |
| `_placeFreeVessel` `:6677-6692` | from `:5084`, `:5432` | free-floaters | logical `to`; snaps outside a viewed battle `:6685`; inside, starts / retargets a glide `:6686-6691` | 0.3 | none |
| `_tickCombatGlide` `:6695-6711` | every render frame `:4163`, frozen in pause `:6699` | free-floaters with a glide | lerp from → to over `combatRoundMs()` (`CombatWatchLogic.js:240-254`) | 0.3 | none |
| `vessel:wrecked` `:1347, :1400-1401` | event | dying vessel | explosion at the SPRITE position; sprite not moved | — | random tilt |

**Battle participants today.** On engagement `_freezeAsStationary` sets `mission = null`, `state = 'orbiting'`
(`DSCS:1294-1296`, both sides via `_pauseSideForCombat` `:398-409, :1360-1374`). From then on free-floaters are drawn
only by `_placeFreeVessel` + `_tickCombatGlide`; the logic moves them once per round (`_closeToWeaponRange` writes x/y
`:572-580`, skipping docked ones `:564`). A pinned enemy (`dockedAt = dominantDocked`, `:1309-1312`) gets no orbit
(orbits are assigned only on `vessel:arrived`, `OrbitalSpaceSystem.js:62-70`), so **no code moves its sprite** while its
logical position snaps to the body centre (`VesselManager.js:2702-2707`) — #626, static trace. Orbital battles have no
per-vessel combat drawing at all (burst only, Q3).

**Wrecks — drawn and logical disagree.** Every DSCS wreck gets its logical position at the battle-start midpoint
(`DSCS:1055, :1101, :1112` via `_wreckOne` `:1428-1446`); deep-space wrecks never enter `moving`
(`VesselManager.js:2625`), so the branch at `:5424-5427` never runs for them: the sprite stays where the ship died and
jumps to `wreckLocation` only when recreated (system switch, load). Orbiters go to a graveyard orbit
(`OrbitalSpaceSystem.js:97-104, :189-196`) while their logical position is the midpoint (#627).

**Consumers — drawn vs logical:**

| Consumer | Reads | Evidence |
|---|---|---|
| FX endpoints `_combatEndpointWorld`; tracer ends, flash, shield ring (followed per frame) | **drawn** (logical snapshot `aPos/tPos` at y 0.3 only when no sprite) | `:6604-6618, :6655-6669`; snapshot `DSCS:737` |
| `_resolveFxEndpoint` | logical — **dead code** | `:6359-6372` |
| hit glow, HP bars, enemy reticle | **drawn** | `:6723-6727`, `:6752-6789`, `:7743-7744` |
| engagement ring | created at logical `location.point` (y 0.05), then follows the **drawn** centroid | `:6993, :7015-7030` |
| prediction cones | **logical** (intercept orders) | `:6190-6212, :6257-6268` |
| click pick, hover, box-select, right-click vessel pick | **drawn** | `:3566, :3621-3626, :3859, :3969-3974, :4003-4007`; `GameScene.js:6279, :6444` |
| scene raycast empty-space point | plane y = 0 → `worldToGameplay` (**not stage-aware**) | `RaycasterHelper.js:42-60`; `GameScene.js:6343` (picker), `:6436` (right-click order), `:6073` (coordinate tooltip) |
| `vessel:focus`, camera follow `_updateCameraFocus` | **drawn** (logical only before a sprite exists) | `:1615-1631, :1659-1671, :2654-2662` |
| Watch (`camera:watchBattle`) + `CombatWatchLogic` | **drawn** live participants; fallback logical `location.point` | `:6937-6950, :6829, :6843`; `CombatHUD.js:354, :574` |
| auto-focus on battle start | first frame logical (`:1562`), then **drawn** | `:1544-1571, :6889-6933` |
| HUD labels, ship marker, focus brackets, route start, alert anchors, radar centre | **drawn** via `getVesselWorldInfo` / `getVesselWorldPosition` | `HudLabelLayer.js:225-229`; `HudShipMarkerLayer.js:80`; `HudFocusLayer.js:50`; `HudRouteLayer.js:136, :176`; `HudLayer.js:212-235`; `HudRadarLayer.js:219-231` |
| HUD pieces from **logical** data | ship-marker heading (logical velocity), radar ring radius (`rangeAU × worldPerAU`), route waypoints, alert distance text | `HudShipMarkerLayer.js:89-91`; `HudRadarLayer.js:314`; `HudRouteLayer.js:162, :185-186`; `HudLayer.js:238` |
| fuel / warp bars under selection, CTRL labels, ping, tactical glyphs | **drawn** (tactical ETA ghost logical) | `UIManager.js:2686, :2729-2737`; `:3797-3799, :7292-7296, :7344-7345, :7391` |
| `OrderTargetInfo` AU distances | **logical** (fog-aware) | `OrderTargetInfo.js:80-95` |
| galaxy mode | neither — `galaxyData` + `vessel.systemId` + `mission.galProgress`; system-mode pickers and watch are off | `HudGalaxyRailLayer.js:91-118`; `GalaxyChromeLogic.js:253-268`; `:3560, :4165-4167` |

**Read accessors.** One read path exists — `getVesselWorldPosition` (`:3703-3709`) and `getVesselWorldInfo`
(`:3714-3724`, adds the model radius) — and the HUD uses it; inside the renderer ten consumers read
`entry.sprite.position` directly (`:1622, :2657, :6611, :6660-6668, :6727, :6768, :6948, :7292, :7344, :7743`). There is
**no single write path**. Other helpers: `getHudView` `:3661`, `getBodyWorldInfo` `:3677`, `_getVesselAtScreen` `:3958`,
`_getOwnVesselsInScreenRect` `:3989`, `makeHudProjector` / `objectScreenDisc` (`HudProjection.js:21, :137`),
`gameplayToWorld` / `worldToGameplay` (`CoordTransform.js:23, :34`). `getScreenPosition` no longer exists.

**How the renderer knows "in combat"**: by querying DSCS — `_findActiveEncounterContaining` (marked `@private`,
`DSCS:1450-1457`; called at `:6321, :6680, :7248-7249`), `listActive()` and `_activeEncounters.get()` directly
(`:6825, :6859, :6893, :7027`), combined with `isEngagementInView` / `isPlayerEngagement` (`VesselFxLogic.js:38, :54`).
No vessel flag. `_vessels` entries hold `{sprite, color, isModel3D, enemyTint, isWreck, exhaust, _exhaustPhase}` plus
`glide`, `_prevYaw`, `intelQuality`, `_maintImmobilized` (`:4818-4824, :6687-6691`); no role or doctrine data —
everything is read through `window.KOSMOS` (`vesselManager`, `deepSpaceCombatSystem`, `orbitalSpaceSystem`,
`fleetSystem`, `timeSystem`, `intelSystem`, `empireRegistry`).

**Proposal (feeds §2.2):** the stage needs (1) ONE write path `_stagePlace(entry, vessel)` that `_placeFreeVessel`,
`_tickCombatGlide`, the orbit branch (for participants), the transit branch and the intel override all go through;
(2) ONE read path — the ten direct reads move to `getVesselWorldPosition`; (3) a renderer export
`stageWorldOf(systemId, x, y)` for the three HUD consumers that mix logical data; (4) the inverse stage map at the three
empty-space click sites. Deliberately LOGICAL stay: all simulation code, `OrderTargetInfo`, alert distance text, order
targets after inversion, `wreckLocation` and the save, prediction cones (hidden while staged), galaxy mode, the movement
pulse and the tactical ETA ghost.

### Q2 — `combat:roundFx` and FX-only fields

**One emitter**, `DSCS:727-739`, gated by `FEATURES.fcCombatFx && round.events.length > 0` (`:721`; flag ON,
`GameConfig.js:203`). Payload `{ encounterId, systemId, midpoint:{x,y}, events[{ attacker, target, category, hit,
blockedByShield, aPos, tPos }] }` — no round index, no duration, no damage, no weapon id, no hp, no kill flag; all objects
are fresh copies. One consumer: `ThreeRenderer.js:1535` → `_onCombatRoundFx` `:6526`, filtered by `isEngagementInView`.
DSCS emits for unwatched battles too.

**Order inside `_tickEncounter`:** approach step (`:527`) → **all of side A fires, then side B** (`:681-715`; a B ship
killed this round does not fire, `aState.hp <= 0` skip `:632`) → **emit** → shield regen (`:742-748`) → disengage and end
checks (`:761-793`) → `_finalizeBattle`. Firing is SEQUENTIAL (unlike `BattleSystem:126-128`, which is simultaneous).

**`round.events` is persisted.** Timeline entry `{ round, year, distanceAU, events[], joinEvents[] }` (`:1464-1465`);
event `{ attacker, target, weapon (moduleId), hit, damage (net hull), blockedByShield, distanceAU }` (`:671-675,
:703-706`). It is copied into the save for live encounters (`DSCS.serialize :1576-1580`) and stored BY REFERENCE in the
battle record (`:1072` → `gameState.battles` `:1143`; again in wartime by `WarSystem.recordBattle :526`; last 50 kept,
`GameState.js:142-155`). **Any field added to `round.events` lands in the save, twice in wartime** — FX fields must live
only on the emitted payload.

**What the VFX needs vs what is at hand inside the `.map(ev => …)` at `:733`:**

| Value | In payload | Available at the emit |
|---|---|---|
| weapon moduleId | no | **yes** `ev.weapon` |
| net hull damage / shield share | no / yes | **yes** `ev.damage` / `ev.blockedByShield` |
| raw damage, armor share | no | derivable: `SHIP_MODULES[ev.weapon].stats.damage × DAMAGE_MULT` (min-1 rule `:696`) |
| target hp / shield after the round's fire | no | **yes** `encounter.vesselStates.get(target).hp / .shieldHP` (pre-regen) |
| hp after EACH event | no | derivable by backward accumulation over this round's events on that target |
| killed flag | no | derivable: hp_end ≤ 0 and last hit on that target this round (dead targets are never re-picked, `:890, :907`) |
| attacker side | no | **yes** (`encounter.sideA` / `sideB`) |
| round index / combat-clock stamp | no | **yes** `encounter.currentRound` (`:616`) / `encounter._lastRoundMs` (`:526`) |
| real round duration | no | not in DSCS — consumer reads `timeSystem.combatRoundMs()` (as `ThreeRenderer:6535` already does) |

**Event ordering at the end** (one grid tick, `VesselManager._tick:2040-2075`): last round → `roundFx` → finalize:
`vessel:wrecked` per dead ship in `vesselStates` order (side A, B, joiners `:1098-1103`), each moved to the midpoint by
`EnemyAttackHandler._turnIntoWreck` before its emit (`EnemyAttackHandler.js:341-348`) → `vessel:wrecked` for living
losers (`:1106-1114`) → `combatDamage` stamps → mission resume → `gameState.set` → **`battle:resolved`** (`:1144`) →
`isActive = false` (`:1146`). A `combatRangeExit` can finalize outside any round (`DSCS:940-967`), so the last `roundFx`
may be rounds earlier. ⚠ `vessel:engaged.location` and `battle:resolved.result.location / .timeline` are LIVE references
(`:415, :1068`) — read-only for every listener.

### Q3 — orbital battles

**`BattleSystem.resolveBattle(fleetA, fleetB, context)`** (`BattleSystem.js:107-180`): fleets normalised
(`:32-67`, missing weapons ⇒ a default laser, `weapons:[]` = unarmed), seed `context.seed ?? Date.now()` (`:108`),
≤ `MAX_TURNS` 30, simultaneous volleys, retreat at 20 % HP. Timeline per turn `{ turn, aHP, bHP, aShield, bShield, dmgA,
dmgB }` (`:135-143`; the shield/hull split is computed and discarded, `:132-133`). Result `{ winner, retreated, lossesA,
lossesB, turns, finalHPA, finalHPB, timeline, seed, casusBelli, location }` (`:167-179`) — **no participants, no vessel
ids, no per-shot events, no per-ship outcome**; `lossesA/B` are HP deltas (vessel counts in DSCS — noted at
`WarSystem.js:480-481`).

**Paths without DSCS:**
- **EnemyAttackHandler (the only live producer).** Trigger `vessel:arrived` with `mission.type === 'attack'`
  (`EnemyAttackHandler.js:41-71`); batch window = real-time `setTimeout(500)` (`:29, :68-70`; Finding 456). Attackers =
  enemy vessels orbiting the planet (in orbit slots). Defenders = `WarSystem._buildPlayerBattleUnit(systemId, planetId)`
  (`WarSystem.js:882-952`): **every in-service player vessel in the system** (including hangar-docked ones, which have
  no sprite — `ThreeRenderer.js:5393-5396`) + `defense_tower` / `defense_grid` of the target colony (`defenseScope`) or a
  30 HP token. Seed `(year·7919 + Σhash(enemy ids)) & 0x7FFFFFFF` (`:194-197`). With a war it is booked by
  `recordBattle` (EAH declares one first if needed, `:157-166`); a refused declaration yields a skirmish emitted by EAH
  itself (`:262-264`). **The event fires before consequences** (`:228-265` vs `:267`): winner B wrecks every attacker into
  the planet's graveyard orbit, winner A wrecks every in-service player vessel in the system, a draw both — a retreating
  side is wrecked anyway (#632).
- **WarSystem** `forceBattle` (`:592-636`, debug button only) and `_fleetArrived` (`:745-790`) use abstract
  `empire.fleets`, which nothing produces since W3-8 ⇒ `no_fleet` in new games. `recordBattle` (`:509-563`) builds a NEW
  record `{ id, warId, year, location, winner, retreated, lossesA, lossesB, turns, participantA, participantB, timeline }`
  — it **drops `seed`, `finalHP`, `casusBelli`** — stores it by reference and emits `{ warId, battleId, result }`.
- **VesselCombatSystem legacy** — reachable only with `m4DeepSpaceCombat` off (`GameConfig.js:77` ON) or DSCS missing;
  wrecks BEFORE its emit (`:323-328` vs `:354`).

| Path | `warId` | seed in result | defender vessel ids | location |
|---|---|---|---|---|
| EAH + war | set | no | no | planetId |
| EAH skirmish | null | yes | no | planetId |
| forceBattle / `_fleetArrived` | set | no | no | system only |
| VCS legacy | null | yes | yes | point |

Subscribers of `battle:resolved` (synchronous, registration order): `WarSystem:101`, `VesselManager:169-183`,
`VesselCombatSystem:77`, `ProximitySystem:113`, `AutoRetreatSystem:53`, `InvasionSystem:48`, `OrderService:43`,
`GameScene:2730` (queue), `GameScene:2785` (log line), `UIManager:1753` (auto-slow), `ThreeRenderer:1540` (burst),
`DebugLog:48`.

**What a replay director has:** battle id, location, year, the per-turn aggregate HP / shield / damage curves (persisted —
replay from history is possible), attacker ids (EAH, VCS), weapon modules per vessel (`v.modules`; `_turnIntoWreck`
keeps them), live defence building levels. **Missing:** defender ids (no producer records them), the seed on the war
path, per-ship outcome (inferable from the EAH rule + `isWreck`), which buildings fought. **Constraints:** the `result`
object IS the persisted record (reference semantics, `GameState.js:103-119`) ⇒ FX data rides a sibling key on the
event, passed through `recordBattle`'s emit; adding `participantB.vesselIds` is NOT FX-only (it changes the
VesselManager stamp, VCS cooldowns, Proximity pair resets, OrderService). The reveal rule in `_combatEndpointWorld` is
DSCS-only; there is no endpoint type for planets or buildings; losers are wrecks before any replay starts.

**Presentation flow today:** `_battleQueue` (no dedupe, `GameScene.js:2687-2690`); Path B with `fcCombatFx` ⇒
`showBattleOutcome` banner only (`:4221-4227`); Path A ⇒ preference (localStorage `kosmos_battle_view_auto`) → intro
modal "ENGAGEMENT IMMINENT" shown AFTER the battle is resolved, Polish-only, reads the nonexistent `timeSystem.paused`
(Finding 161) → BattleView3D on `#three-canvas` (own Scene and camera, borrows the main renderer via `suspend` /
`resume`, own rAF, `Math.random` shooters and targets, PL DOM HUD; `BattleView3D.js:72-74, :98, :105, :113-115, :132,
:364-372, :497`; the sim keeps running during the cinema [INF]). Retirement touches: imports `GameScene.js:138-139`,
`ThreeRenderer.js:65, :69`; listener `:1537-1540`; methods `:6548-6600`; the `'burst'` marker (`:6975-7020`,
`VesselFxLogic.js:72-102`); `suspend` / `resume` and the loop gate (`:199-202, :4038-4042, :4108-4117`, `HudLayer.js:9,
:70`); `GameScene.js:2730-2777, :4209-4266`; `BattleIntroModal.js` intro + preference; keepers `combat_marker_life` T4 /
T6, `combat_ring_subtle`, `combat_view_scope`, `combat_turns`, `battle_result_classification` T6, `hud_layer`
`_renderingEnabled` fixtures; `check-i18n` baseline `BattleIntroModal.js: 3` (`tools/check-i18n.mjs:379`); docs
(`deferred-live-gates.md` ENTRY 4, `VISUALS_PLAN.md:606-615`, `GALAXY_PLAN.md` O10).

### Q4 — clocks

**The grid model (POLISH P1, CP1).** While any encounter is active, `TimeSystem.update` switches to `_updateCombatGrid`
(`TimeSystem.js:96-97`): each grid frame advances `simClockMs += 16` and emits a normal `time:tick` with 0.016 s of game
time at 1 day/s (`:148-161`); frames are released in real time at `110 / roundMs` (`:146-147`, `roundMs` =
`combatRoundMs()` if watched, else 110). DSCS fires a round when `simClockMs − _lastRoundMs ≥ 110` (`DSCS:516-530`) —
no `performance.now`, no speed multiplier; ≤ 1 round per tick in practice (`MAX_ROUNDS_PER_TICK` 4 is a cap).
`combatRoundMs` readers: `TimeSystem:146` (pace), `ThreeRenderer:6535` (FX pace via `combatFxPace`,
`CombatFxConfig.js:42-51`), `ThreeRenderer:6691` (glide). DSCS never reads it.

**Watched vs unwatched.** `engagementView(activeSystemId)` = `'watched'` if any active encounter is in the viewed
system (`DSCS:1540-1548`); ONE global grid — if one battle is watched, every battle plays at the watched pace. The Watch
camera and auto-focus are separate, purely visual notions; watching a battle in another system first switches
`activeSystemId` (`VesselFxLogic.watchBattleAction:44-48`).

**Pause.** `update()` returns before any tick when `isPaused || multiplier === 0` (`TimeSystem.js:89`): `simClockMs`
stands still; the accumulator is dropped on pause and capped at 8 frames (`:162-165`); no catch-up anywhere (CP3,
Finding 449). During a watched battle at R = 400 the whole world runs at **0.275 game-days per real second** (orbits and
economy keep ticking on grid frames).

**Which clock the CV layer ticks on (INF):** a renderer-local **presentation clock** advanced by real frame dt only
while `!isPaused && multiplier > 0` (the `_tickCombatGlide` pattern, `:6695-6711`), with `simClockMs` as the phase
reference for round arrivals. NOT absolute `performance.now()` — the current FX engine uses it (`:6393, :4194`, comment
`:6412`) and keeps animating in pause (#616). NOT raw `simClockMs` — it moves in 16 ms steps arriving every ~58 ms
watched (stutter). Requirement "no influence on results" holds while the layer is strictly read-only: never write
`simClockMs`, positions, encounter objects or `round.events`; never switch `activeSystemId`; never sort live arrays in
place; EventBus already isolates listener exceptions (`EventBus.js:31-36`).

### Q5 — the P2 combat UI

| Piece | Where | Keep (pure logic) | Replace (drawing) |
|---|---|---|---|
| combat card (`CombatHUD`) | `#ui-canvas`, `UIManager.js:353-355, :2489`; ≤ 2 rows + "+N", Watch 👁 (only emitter of `camera:watchBattle`, `:568-577`), side bars, per-ship lines, log; `_fitLayout` ≤ 45 % height; own placement constants ignoring `MapInsets` (#629); raw `THEME` colours | `getPanelRect()` contract (`:72-74`, used by Watch safe rect `ThreeRenderer:6958` and panel anchoring `UIManager:483, :592`), measure-and-fit idea | `CombatHUD.js` |
| engagement ring | 3D mesh (`:6978-7045`), alert role, hidden in Watch, 1.5 px band | `planEngagementMarkers`, `engagementRingBand`, `centroidOf` (`VesselFxLogic.js:80-131`) | mesh code |
| HP bars | 3D billboards, 2 sprites per ship, raw faction colour, no shield bar (`:6752-6811`) | `hpBarFrac`, `planCombatHpBars` (`VesselFxLogic.js:141-167`) | sprites |
| hit glow | additive sprite 200 ms (`:6716-6746`) | `hitGlowWorldSize` | sprite |
| Watch + auto-focus | `_startWatch` / `_updateWatchCamera` / `_endWatch` (`:6820-6884`), `_computeWatchFit` (`:6937-6967`) | ALL of `CombatWatchLogic.js` (no imports, keeper-pinned: `watchSafeRect` `:97-110`, `fitWatchFrame` `:170-202`, `watchTargetAt` `:121-160`, `autoFocusFollowStep` `:57-64`, `glideRetarget` / `glideStep` `:234-254`) | thin glue |
| fog gating | `_combatEndpointWorld` → `isEndpointVisibleInCombat` (own always; enemy visible in a player battle, else ≥ contact); model reveal `_applyVesselIntelVisibility`; explosion has NO intel gate | `isEngagementInView`, `watchBattleAction`, `isPlayerEngagement`, `isEndpointVisibleInCombat`, `resolveFxEndpointRaw` (`VesselFxLogic.js:38-70, :183-194`) | — |

**HUD layer contract** (target for the tactical layer): `#hud-canvas` (z 1, under `#ui-canvas` z 2,
`pointer-events: none`), own rAF (`HudLayer.js:351-359`); `hudGate` hides it outside civ mode / clean view / overlays
(`:64-72`); a frame key (camera epoch, `themeEpoch()`, viewed system, size, selection, attention, alert ages, each
sublayer's `prepare(F)`) — unchanged key + nothing animating ⇒ zero canvas calls (`:446-468`). Sublayer =
`prepare(F) → key`, `collect(F, proj) → {count, animating}`, `draw(ctx, F, c)` (`:15-18, :263-267`); `F.roles`, `F.sim`
(sim clock, stops in pause), `F.mapRect` (from `MapInsets`). **Palette — four roles** (`HudPalette.js:3-8, :168-178`):
`primary` = accent, `dim` = textDim, `foreign` = textPrimary, `alert` = danger (or warning when too close to primary,
ΔE2000 incl. three colour-blindness simulations); 3D via `hudRoleHex(role)` memoised per theme epoch
(`ThreeRenderer.js:7762-7789`); extra tokens via `themeToken` (`success`, `warning`, `info`, `purple`, `mint`,
`border*`). Not on roles today: the card, 3D HP fill, weapon colours, enemy tint, shield colour.

**Keepers that pin the P2 surfaces** — survive under flags OFF, re-aimed or retired at CV-6b / CV-Z:
`combat_watch_frame` (math = logic; T10 card rect, T11 / T12d-e drawing) · `combat_hp_bar` (T4 40×5 px, glow 200 ms;
T5-T6 source) · `combat_ring_subtle` (drawing) · `combat_marker_life` (logic + T6 source) · `combat_fx_pace` (pace
table logic; T5 source) · `combat_card_fit` (UI) · `combat_follow_centre` (logic; T5 source) · `combat_view_scope`
(logic; T5 clicks the card's Watch) · `combat_turns` (logic, unaffected) · `hud_ship_marker` **M0e** (requires
`_syncCombatHpBars()` in the loop — breaks when 3D bars go) · `hud_alert` A6f (reticle source) · plus card / chip stubs in
`ship_panel_outliner`, `fleet_panel_hud`, `galaxy_chrome`, `map_vessel_panel_compact`, `hud_bz_clean`, `bottom_strip`,
`zoom_slider`, `ui_top_belt_slots`, `nav_peek_off`, `hud_layer_chips`.

### Q6 — ship models (measured)

**Files.** 27 GLBs, 95.55 MiB. Each: 1 node (no TRS), 1 mesh, 1 primitive, 1 material; POSITION + NORMAL + TEXCOORD_0
(no TANGENT); u16 indices (u32 in `nonwarp_small_science`); written by glTF-Transform 4.4.0 (the earlier optimizer run,
`908cac8`: 2048 → 1024 px, 390 → 95.5 MB; originals kept under tag `backup-tekstury-2048` → `1377b1d`). One sampler
(LINEAR / LINEAR_MIPMAP_LINEAR / REPEAT), `doubleSided`, OPAQUE. Triangles 9 777–10 688; three low-poly files
(`warp_large_cargo` 3 049, `warp_medium_science` 3 081, `warp_small_colony` 3 106). Longest axis is **X** in every
file (extent 1.885–1.913, centred within 0.07, Y up). UV islands cover only 39.6–61.7 % of each texture.

**Textures.** 24 files: base colour **JPEG 4:2:0** (189–337 KB, avg 271 KB), metallic-roughness JPEG 4:4:4,
**normal map PNG 1.45–2.76 MiB** (26 PNGs = 63.8 MiB = **67 % of the folder**), emissive JPEG (6–44 KB); 3 legacy files
(`cargo3d`, `default`, `research1`) have PNG base colours and **no emissive map**. Exact duplicates (whole file and BIN
SHA-256): `default = cargo3d`, `nonwarp_large_cargo = nonwarp_medium_cargo`, `warp_frigate = warp_large_science`;
`cargo3d.glb` and `research1.glb` are referenced by no code (#623).

**Emissive.** Mean 0.0–5.4/255 everywhere; max 5–229: 13 files ≤ 29 (JPEG noise), 4 dim (37–68), 7 files (6 unique)
with real lit features ≤ 2.5 % of texels (`nonwarp_medium_colony` window 229, `warp_small_cargo` magenta, `warp_medium_
science` 160, `warp_medium_colony` 130, `nonwarp_small_colony` 120, cargo nozzles cyan 54/103/109). **All six warship
files are black (max 12–29).** Because `emissivemap_fragment` does `totalEmissiveRadiance *= emissiveColor.rgb`
(`src/lib/three.module.js:348`), the enemy tint `0x880022` (`ThreeRenderer.js:4791`) and the wreck glow
`0xff2200 × 2.2` (`:1387-1388`) are invisible on 24 of 27 models; nothing on any ship reaches the bloom threshold (#620).
**Hull not black:** surface luma 120–194 everywhere except `cargo3d` / `default` (66) and `warp_medium_science` (74, 24 %
near-black). **Cyan today:** key-cyan (R ≤ 60, G ≥ 200, B ≥ 200) ≤ 0.056 % of surface, cyan-hue ≤ 1.2 % — and where it
exists it IS engine / light paint, so a mask lights it harmlessly.

**Bow.** 26 of 27 files: bow at local **−X** (nose tapered or rounded at −X, engines at +X); the exception
**`nonwarp_large_science`: bow +X** (engine bells visible from −X; smooth porthole cap at +X); `warp_medium_colony` is
the only low-confidence call. The README says +X (`README_modele_statkow.md:14-15`) — **wrong**. The exhaust code is
right (`ThreeRenderer.js:4706-4707`, `rearX = box.max.x − center.x` `:4715`, cone at +X `:4740-4741`), and the heading
formula `rotation.y = atan2(dx, dy) + π/2` (`:4760, :5462`) makes local −X point along the direction of travel (verified
with the game's own three core) — the comment at `:4759` ("bow along +X") is wrong too. ⇒ `nonwarp_large_science` flies
stern-first with its plume at the nose (#621). Normalizer heuristic, measured against the visual verdict: **"the stern is
the end with more vertices in its last 8 % of length" — 27/27**; "the stern is the larger end" 26/27; area centroid 26/27.

**Code.** `GLTFLoader` from the CDN addons (`ThreeRenderer.js:10`; one instance `:506`, no Draco / KTX2 / meshopt
decoders); caches `_shipModelTemplates` / `_shipModelPromises` / `_missingModelPaths` (`:503-505`), `_loadShipModel`
`:4897-4921` (one retry after 400 ms → `default.glb` → sprite fallback `:4866-4892`); templates never evicted.
`_addVesselModel3D` (`:4668`): `template.clone()`, Box3 → `maxDim` → scale to `vesselTargetSize`, recentre
(`:4686-4700`); **no rotation on the model** — heading, banking and wreck tilt live on the wrapper Group; exhaust cone
`coneRadius = max(0.012, size.y·0.04)`, `coneLen = max(0.03, size.x·0.02)` — **the floors always win** (every plume
0.03 × 0.024 WU, 1.9 L) and `_applyExhaust` scales `scale.x`, which after `rotation.z = π/2` is the plume's thickness, not
its length (#619). Materials: **player ships share the template materials** (no clone) — `_applyVesselMaintenanceTint`
(`:5492-5528`) therefore greys every player ship using the same file [INF]; enemies clone + tint; wrecks clone
(`0x1a1a1a`, emissive `0x110000` at creation `:4779-4786`, `0xff2200 × 2.2` in the `vessel:wrecked` handler `:1377-1402`,
which leaks the old enemy clones [INF]) (#624). `entry` is used out of scope at `:4837 / :4849` for wrecks with
`dockedAt` — a swallowed ReferenceError (#625, verified by reading). `VesselModelResolver`: file key
`{nonwarp|warp}_{class}`, drive = `warpFuel.max > 0`, role colony > science > cargo (`:71-133`). Station for comparison:
fixed scale 0.015, `ROT_X π/2`, always-cloned tinted materials (`:4635-4650, :5178-5244`); `Ring_Station.glb` is 17.1 MB,
2048², never optimised, with real emissive windows.

**Tooling.** `optimize-ship-textures.mjs` = gltf-transform `NodeIO` + `ALL_EXTENSIONS` + `textureCompress({ encoder:
sharp, resize, lanczos3 })`, writes GLB (`:19-21, :43, :65-83`) — a ready skeleton for the normalizer, but **none of its
dependencies is installed** (`node_modules` holds only the `three` stub; `package.json:23, :27-29` declares sharp 0.34.5
and @gltf-transform 4.4.0 — `npm install` restores them; no meshoptimizer / Draco / KTX tooling in the lockfile).
`GlbSnapshotRenderer.js` offers a reusable studio rig (`:33-56, :111-154`) but caches by path only. The game imports six
addons (GLTFLoader ×2, EffectComposer, RenderPass, UnrealBloomPass, OutputPass — `ThreeRenderer.js:10-14`,
`GlbSnapshotRenderer.js:14`); the importmap (`index.html:73-80`) maps `three` locally and `three/addons/` to
`three@0.171` on jsdelivr; an untracked precedent page with the same map exists (`demo-grafika-ab.html:36-41`).

### Q7 — FX engine and performance

**Current engine.** `_spawnFx` (`:6378-6403`) + `_updateActiveEffects(performance.now())` (`:4194, :6414-6473`);
kinds tracer / flash / shieldRing / hitGlow / explosion / explosionRing / ring / beam / ping / pulse (`trail` has no
producer, `:6447`; the orbital `'burst'` is an engagement-marker kind, not an FX kind); **every spawn allocates** geometry + material (+ mesh), disposed on expiry (`:6405-6410`);
`hitGlow` disposal frees the module-level Sprite geometry shared by every sprite ⇒ re-upload churn (#636); per-round
salvo = one synchronous emit, each shot delayed `(stagger++ % 8) · staggerMs` (`:6541`; the wrap makes shots 0 and 8
coincide); at R = 400 tracer / flash / shield last 480 ms, impact delay 150 ms, stagger 40 ms; a tracer appears instantly
at full length (no travel); no layers (everything on layer 0). **Bloom reality** (computed with the CDN high-pass,
`luminance` Rec.709, `smoothstep(threshold, threshold + 0.01, v)`): tracers 0.27–0.61, flashes / shield rings ≤ 0.48, the
explosion ring 0.77 × 0.8, the wreck glow 0.49 — **only the fireball blooms** (p < ~0.55) and two comments claim
otherwise (`:6518, :1385-1386`; #618). The explosion is sized by a 0.2 floor (`Math.max(0.2, bboxSize || 0.5)`, `:6498`)
— fireball 0.08 WU (5 L), ring 0.40 WU (25 L) (#619).

**Performance tooling.** No fps / frame-time helper in `KOSMOS.debug`; only `KOSMOS.hudLayer.debugState()` (HUD cost
last / max / median / p95, `HudLayer.js:504-520`); `renderer.info` logged once (`:5220`). Two rAF loops (GameScene →
`TimeSystem.update`; renderer `:4105+` → `_composer.render()` `:4220`). **No quality presets anywhere**; ☰ menu has no
graphics row (`BottomBar.js:455-466`). Live tuning tokens exist (`gasTuning`, `sunTuning`, `atmoTuning`, `cloudTuning`,
`skyTuning`, `galaxyTuning`). External CDP tooling (untracked, `kosmos-handover/galaxy-g5/gate/kosmos_cdp_gpu.mjs` and
copies under `C:\Users\Komputer\kosmos-handover\`): own Chrome profile, SwiftShader by default, **`GPU=1`** → ANGLE d3d11
on the RTX 3070, **`UNCAPPED=1`** → no vsync limit; fixture boot via `SaveSystem.importSave`. Recorded measurement rules:
rAF averages are ~18 % noise, JS milliseconds miss rasterisation — **frame rate is the measure**, calibrated at the
owner's 1600×1041 window (`HUD_PLAN.md:29-31, :500`).

**Engine constraints the CV engine must respect.** Custom `ShaderMaterial`s must include the log-depth chunks
(`src/renderer/LogDepthChunks.js`; `logarithmicDepthBuffer: true`, `:264` — V4 lesson, V-267). Per-instance values go
through uniforms / attributes, never string interpolation into GLSL (one `WebGLProgram` per material type — V1 lesson).
The light count is compiled into every lit shader (three r171) — lights come from a fixed pool. Addons only from the
`three/addons/` importmap line (CDN rule); no new runtime dependency is needed — particles, beams and the shield bubble
are custom shaders.

### Q8 — audio

`AudioSystem` (`src/systems/AudioSystem.js`, created once at `main.js:37` as `window.KOSMOS.audioSystem`; reused by
`GameScene.js:284`; `startMusic('game')` `:3936`). API: `setVolume`, `setMusicVolume` (no callers), `toggle()` (SFX,
not persisted), `toggleMusic()` (persisted `kosmos_music_enabled`, emits `music:toggled`), `isEnabled`,
`isMusicEnabled`, `preloadMusic`, `startMusic`, `stopMusic`. Web Audio: music = fetch → `decodeAudioData` → looping
BufferSource on `_musicGain` 0.25; SFX are procedural (`_playTone` oscillator, `_playNoise` filtered noise, a new noise
buffer per call) on `_masterGain` 0.40; no panning, no listener (three's `AudioListener` / `PositionalAudio` unused).
Subscriptions in the constructor (`:58-100`): `body:collision`, `life:*`, `player:actionResult`, `time:stateChanged` ×2,
`audio:toggle`, `music:toggle` — **no combat events**. **Deaf in game:** `GameScene.start()` calls `EventBus.clear()`
(`GameScene.js:197`) AFTER the constructor subscribed, the instance is reused without re-attach (contrast
`DebugLog.attach()`, `DebugLog.js:206-213`, re-run at `GameScene.js:2288-2290`), and the ☰ toggles emit
`music:toggle` / `audio:toggle` (`BottomBar.js:321, :326`) into nothing (#613; static trace — live check
`KOSMOS.eventBus.listeners.get('music:toggle')?.length`). `assets/sounds`: `amber_terminals.mp3` (4.6 MB, the `main`
track, never started), `signal_main_menu.mp3` (4.1 MB), `signal_new_game.mp3` (7.2 MB).

### Q9 — test harness

**Staging tools.** `CombatSandbox` (TitleScene button → `loadCombatSandbox`, `CombatSandbox.js:145`; 3 vs 3 kinetic
warships in one system + war) is **not deterministic** despite its header (home system from the global `Math.random`,
`SystemGenerator.js:689-690`) and needs manual engage orders. Helpers (all `KOSMOS.debug.*`): `spawnMyVessel(hullId,
{modules, x, y, systemId, name})` (`GameScene.js:1642`; auto-researches warp / point-defence techs), `spawnEnemyRaider
({empireId, systemId, templateId, autoOrder, distanceAU})` (`SpawnTestEnemy.js:588`; random angle; refuses the player's
home system), `spawnEnemyAttack(opts)` (`:428`; orbital battle, random angle, default ETA 20 y), `spawnTestEnemy()`
(`:54`; colony + marines on the NEAREST body in the WHOLE galaxy — possibly another system), `fleetWarpBattle` /
`probe603Battle` (`FleetWarpDebug.js`; 1v1 with the correct `systemId`), `teleportVessel` (**never sets `systemId`**),
`issueOrder`, `dumpCombat`, `sbTuning` / `sbSet` / `sbReset`, fleet helpers; `DSCS.forceFinalize` (no alias);
`resolveDeepSpaceBattle` is NOT in `KOSMOS.debug` (the CLAUDE.md M2a note is stale). **No helper stages N ships of a
loadout at a point.** Pitfall: `DirectorRecall` recalls any idle armed AI ship outside its capital's system on the first
tick (`DirectorRecall.js:96-121`; kill-switch `FEATURES.aiStrikeRecall`) — stage on pause or order engage first.
Proven recipes (outside the repo): P2B gate step 1 (`C:\Users\Komputer\kosmos-handover\polish-p2b-code\gate\GATE_P2B.md:
77-84` — `createAIVessel` at the AI capital, then `systemId` + position; player `createAndRegister` + engage, paused); P1
seed protocol (encounter created on pause, `seedBase` set by hand — it is saved with the encounter, `DSCS:1582, :1617`);
the reels app battle scene (`E:\programy\claude_kody\kosmos-reels\scenes\fleet.mjs:224-246` — up to 9 raiders, reassigned
`systemId`, `_addVesselSprite`). Encounter team-up radius 0.225 AU (`DSCS:239-258`). Fixture
`src/testing/fixtures/GATE-S4-fresh-gy60.save.json.gz` (v101; replay headless impossible) + external
`E:\kosmos-work\hud-phase-a\fixtures\ZF120.json.gz`, `Polonia79.json.gz`.

**Keepers and sweep.** All keepers import `../headless/env.js` (seeded `Math.random`, `env.js:34-42`).
`combat_pace_smoke` is the template for "results identical ON / OFF": it mounts VM / MOS / Proximity / VCS / DSCS / EAH /
OrbitalSpace itself (GameCore mounts none of them; `GameCore.js:15-81`, `boot()` calls `EventBus.clear()` `:129`),
drives the real `TimeSystem.update(ms)` with a virtual `performance.now`, and records a battle signature `[rounds, shots,
hits, winner, retreated, lossesA, lossesB]` + sorted wreck names (`:88, :127-133`; run now: 71 / 0 in ~0.3 s).
`warp_combat_607` adds `traceOf` + a `--record` baseline in `fixtures/traces/`. Runner `run-all.mjs` discovers every
`*.mjs` (371 suites), one `spawnSync` each, 120 s timeout; exit code decides. Under node `ThreeRenderer.js` does NOT
import (the three stub has no postprocessing addons; `PlanetTextureUtils` needs `TextureLoader`), but **real three r171
from `src/lib/three.module.js` imports fine** (`combat_ring_subtle` already does) — so pools, shaders' JS side and
allocation counts are testable under node. `BattleView3D`, `CombatWatchLogic`, `VesselFxLogic`, `CombatFxConfig`, DSCS
and `CombatHUD` import fine. A seeded RNG class exists: `src/sim/rng.js`.

### Q10 — doctrine and role data for choreography

| Data | Accessor |
|---|---|
| fleet, doctrine | `vessel.fleetId` (`Vessel.js:285`); `fleetSystem.getVesselFleet(id)` / `getFleet` (`FleetSystem.js:652-669`); `fleet.doctrine` (`:527`; values `FleetDoctrines.js:11-16`), `fleet.retreatThreshold`, `fleet.activeOrder` |
| movement order | `vessel.movementOrder` (`Vessel.js:279`): `type`, `targetEntityId`, `engageTargetId` (`MOS:1257`), `preferMaxRange` (`:1262`), `_fromFleet`; retreat markers `_retreatFromCombat` / `retreatFromBattleId` (`MOS:650-654`; `DSCS._isRetreatingFromCombat :1626-1628`) |
| hull class | `vessel.shipId` = hull key (`Vessel.js:149`); `HULLS[id].size` small / medium / large (`HullsData.js:22, :67, :113`), frigate small, destroyer medium, cruiser large (`:162, :202, :244`); `vesselTargetSize` (`VesselModelResolver.js:136`) |
| weapons | `vessel.modules` (`Vessel.js:169`); in battle `vesselStates.get(id).weapons[]` with `moduleId, category, rangeAU, cooldownYearsRemaining` (`DSCS:1185-1195`) — rounds to the next volley = ceil(cd / 0.3) |
| combat state | `_findActiveEncounterContaining` (`DSCS:1451`), `listActive` (`:1530`), per-ship `hp`, `hpStart`, `shieldHP`, `joinedAtRound` |
| owner, role | `isEnemyVessel` (`Vessel.js:454`); side A is always the player (`DSCS:332`); `getPrimaryRole` (`:575`); `strikeSquadronSystem.squadronOfVessel` |

How doctrine shows today (INF from READ code): default vs `kite` — no visible distance difference against frozen enemies;
`hold_position` — free-floating members still close in; `retreat_at_50` — rarely triggers inside a battle; AI retreat is
a battle-ending verdict (`DSCS:840-845`) acted on by `AutoRetreatSystem` after `battle:resolved`.

### Q11 — determinism of results (added: it decides F1)

| Source | Location | Status |
|---|---|---|
| DSCS RNG | `mulberry32(seedBase + round)` (`DSCS:620`), `seedBase` from `gameTime` at creation (`:388`) | seeded; no `Math.random` |
| BattleSystem | `mulberry32(context.seed ?? Date.now())` (`:108`) | seeded by every caller; `Date.now` fallback dormant |
| EAH batching | real-time `setTimeout(500)` | real time (Finding 456) |
| TimeSystem outside combat | variable step from raw rAF delta | not frame-deterministic outside combat; grid frames inside combat are |
| THREE UUIDs + direct renderer calls | `three.core.js:312-317` (Source, Texture, Object3D, Material, BufferGeometry); `ThreeRenderer.js:1370, :1400-1401, :2976, :4799-4853, :5880-5886`; `BattleView3D` ×8 | **shift the global stream** used by `OrbitalSpaceSystem.assignOrbit` (writes logical positions), arrival angles, invasion hexes, ground combat, intel noise (#612) |

---

## §2 Architecture

### 2.1 The one rule and the pipeline

**The rule: presentation reads, logic writes.** Every CV module reads logic state and events; none writes positions,
encounter objects, `round.events`, `simClockMs`, `activeSystemId`, the save, or the game's `Math.random` stream.

```
LOGIC (untouched)                         PRESENTATION (CV, renderer-side)                       OUTPUT
DSCS ── combat:roundFx (+FX fields) ──▶ CombatPresenter (per encounter)                       ThreeRenderer meshes
EAH / War ── battle:resolved (+fx) ──▶ OrbitalReplay ─┐  ├─ CombatLedger: shot schedule,  ──▶ FxEngine pools (beams,
vessel:wrecked (held until impact) ──▶                ├──┤   presented HP / shield, kills        projectiles, particles,
TimeSystem.isPaused / simClockMs ──▶ PresentationClock┘  ├─ BattleStage: drawn positions  ──▶   shields, explosions, lights)
fleetSystem / movementOrder (read) ──▶                   ├─ Choreographer: offsets, facing ──▶ HudCombatLayer (tactical)
camera distance (px per frigate) ──▶ SemanticZoom ───────┴─ CameraDirector                ──▶ camera
                                                          └─ combatfx:cue ──▶ AudioSystem (no-op table)
```

Proposed modules (pure = no THREE, no `window`, node-testable):
`src/renderer/combat/PresentationClock.js` (pure) · `BattleStageLogic.js` (pure) · `ChoreographyLogic.js` (pure) ·
`CombatLedgerLogic.js` (pure) · `OrbitalReplayLogic.js` (pure) · `CameraDirectorLogic.js` (pure) · `SemanticZoomLogic.js`
(pure) · `FxEngine.js` + `FxShaders.js` + `LightPool.js` (THREE) · `src/data/CombatFxPresets.js`,
`src/data/CombatCueData.js` (data) · `src/ui/HudCombatLayer.js` + `HudCombatLogic.js` · `src/ui/CombatStrip.js` ·
model pipeline: `src/data/ShipHardpointsSchema.js`, `src/renderer/ShipHardpoints.js`, `src/renderer/KeyColourEmission.js`,
`tools/ship-models/normalize-ship.mjs`, `tools/model-workshop/`.

### 2.2 The battle stage (F3)

**Law (D-CV-2).** Pair-gap compression `G(d) = min(d, k·d^α)`, d and G in WU, **α = 0.7525, k = 0.0913** — one
parameter fitted on the laser anchor; it lands every park and every full range inside the owner's windows:

| weapon | park 0.95·range | logical gap | staged gap | full range | staged | window |
|---|---|---|---|---|---|---|
| laser | 0.0475 AU | 32.7 L | **3.50 L** | 0.05 AU | 3.64 L | [3, 4] |
| kinetic | 0.1425 AU | 98.0 L | **8.00 L** | 0.15 AU | 8.31 L | [7, 9] |
| missile | 0.285 AU | 195.9 L | **13.5 L** | 0.30 AU | 14.0 L | [12, 15] |

Compression factors 9.3× / 12.2× / 14.5×. Applied **radially about the encounter midpoint** (static,
`DSCS:219-222, :382`): `g(r) = G(2r) / 2`, so a symmetric duel lands exactly on the table; pairs not symmetric about the
midpoint CAN be mis-banded, so the radial map is only the seed — the guard of §3.1-2 (pair-faithful relaxation, a
per-pair band check every update, uniform-scale fallback) makes every pair band-consistent. Intra-side spacing compresses too ⇒ a **deconfliction lattice** spreads stacked or near-stacked ships
of one side (fleets often arrive on one point) at ≥ 1.6 L, deterministic by vessel id order.

**Blend (D-CV-3 — semantic zoom).** The stage is not a mode: `stageBlend = smoothstep(4, 24, px_L)` where `px_L` is the
projected frigate length in screen px at the camera's distance to the battle centre. Below 4 px (system view, today's
auto-focus distance 6 WU ≈ 2.7 px) the battle is drawn at TRUE scale (tactical holo, true-scale range bands); between 4
and 24 px ships gather toward the stage while the camera dives (the battle's screen size stays roughly constant — a focus
pull); above 24 px (≈ 0.67 WU at 1041 px height) everything is staged (cinema). `drawn = lerp(logical, staged,
stageBlend)` is monotonic for every blend. Reinforcements joining mid-battle blend in over 0.5 s of presentation time.

**Scope.** Deep-space DSCS encounters in the viewed system (`isEngagementInView`) and, from CV-8, orbital replays. Never
in galaxy mode, never for battles in other systems. **Body-pinned participants (D-CV-4)** — the player side orbiting a
planet, enemies pinned with `dockedAt` but no orbit (#626) — are placed on a presentation shell around the body (floor =
body drawn radius + 2 L) at the bearing toward the opposing side's centroid.

**Seam (from Q1).** One write path `_stagePlace(entry, vessel)` (glide endpoints live in stage space; the per-frame cache
pattern of `_engagementFit` `:6907-6914` is reused); one read path (`getVesselWorldPosition` everywhere inside the
renderer); `stageWorldOf(systemId, x, y)` for the HUD; the inverse map at the three empty-space click sites (D-CV-5 —
the order goes where the player sees; the inverse of a monotonic radial map is unique). The HUD radar ring is hidden while
`stageBlend > 0` (its radius is a logical distance); the ship-marker heading uses drawn velocity.

### 2.3 Choreography inside the envelope (F4)

Each ship's drawn position = staged anchor + offset(t); orientation and engine intensity from the same function.
`ChoreographyLogic.pose(encounterId, vesselId, class, posture, targetDir, t) → { offset, quat, engine }` — pure,
seeded by `hash(encounterId, vesselId)` (F4 determinism), driven by the presentation clock (F4 pause).

**Invariant (D-CV-6).** For every attacker → target pair of the latest round with weapon category W, the drawn gap stays
strictly between the neighbouring windows: laser (1.5 L collision floor, 7 L), kinetic (4 L, 12 L), missile (9 L, ∞).
With nominal gaps 3.5–3.64 / 8.0–8.31 / 13.5–14.0 L this leaves ≥ 2 L margin each way ⇒ **per-ship envelope E ≤ 1 L**
(frigate 1.0 L, destroyer 0.7 L, battleship 0.4 L; 3D sphere — vertical spread ±0.6 L, so no flat y = 0.3 plane). Motion
is mostly tangential around the target (orbit / strafe / arc), radial component bounded by the remaining margin.

**Class profiles.** Frigate: orbits / strafes the target, period 6–9 s, turn rate 120°/s, bow-on ± strafe angle.
Destroyer: wide arcs at mid range, 10–14 s, 60°/s. Battleship: near-stationary, turns broadside (target at ±90°) at
20°/s. All face the target (or present broadside), **engines lit in combat** (base intensity + choreography speed; retro
flare when backing).

**Doctrine posture (D-CV-7).** `engage_in_range`: full amplitude, bow-on. `kite`: radial bias outward within the margin,
retro flares, bow-on. `hold_position`: amplitude × 0.3, no strafing, steady broadside / bow-on. Retreating
(`_retreatFromCombat`, AI retreat verdict): turns away, full plume. Stance never fakes a distance the logic lacks.

### 2.4 Weapon language and the presentation ledger (F5)

**FX-only payload fields (D-CV-8)**, built inside the existing `.map` at `DSCS:733`, never on `round.events`:
`round` (encounter.currentRound), per event `weapon` (moduleId), `side` ('A' | 'B'), `dmg` (net hull), `hpAfter`,
`shieldAfter` (backward accumulation from the round-end state), `killed` (last hit on a target at hp ≤ 0).

**Ledger schedule** (pure, per encounter; all times in presentation ms scaled by R / 400):

| phase | window inside the round |
|---|---|
| side A volleys | 0–0.40 R (logic fires A first) |
| side B volleys | 0.45–0.85 R (a B ship killed by A this round has no event — consistent) |
| laser | charge 0.15 R → HDR beam 0.25 R; impact 20 ms after beam start |
| kinetic | muzzle flash → tracer projectile, flight `clamp(gap / v, 0.2 R, 0.45 R)` → sparks |
| missile | salvo launch → curved trail (seeded control point), flight 0.5–0.9 R (may spill into the next round) |

Presented HP / shield drop at each IMPACT by the event's values; after the last impact of a round the presented state
equals the logical round-end state (asserted by a keeper). **Presentation lag ≤ 1 round (D-CV-9)** — only a hero shot
may exceed it, within the caps of §3.1-3. Misses fly past at a
seeded offset and continue beyond the target. Shield hit ⇒ fresnel bubble with a ripple at the hit point (uniform array of
ripple origins / ages); hull hit ⇒ sparks + brief heat glow (scorch decals on High only). Weapon colours stay semantic
data (laser cyan, kinetic amber, missile red — `CombatFxConfig.js:10-21`) but rendered HDR so beam cores bloom.

### 2.5 Damage states, explosions, lights, wrecks (F5)

Damage states from **presented** HP: ≤ 75 % smoke, ≤ 50 % fire, ≤ 25 % sputtering engine (plume stutter + sparks);
emitters at three surface points sampled deterministically per slot (or `damagePoints` in hardpoints). **Kill** = the
killing event's impact: layered composite flash (HDR sprite, 80 ms) → fireball (particles, 300–600 ms) → shockwave
(ring shader, 400 ms) → debris (instanced chunks, 1.5–3 s) → embers (1–2 s) → smoke (2–4 s), sized from the ship (not the
0.2 floor, #619), plus a light from the pool (peak at 100 ms, gone by 600 ms) lighting neighbours. **Wreck** = burn-out
term in the key-colour chunk (glowing edge from fresnel × noise, cooling over 10–20 s of presentation time) + slow tumble
and drift inside the envelope. The late `vessel:wrecked` from `_finalizeBattle` is deduplicated — the kill was already
shown (#615). When the stage dissolves (zoom out) wrecks converge to their logical location (the midpoint — Finding 460
family, mechanics untouched, #627).

### 2.6 Tactical layer and semantic zoom (F2, F9)

`HudCombatLayer` — a HUD sublayer (D-CV-20) on the existing contract: class silhouettes / icons, heading and velocity
vectors (drawn), fire lines at the ledger's shot times, range bands of the selected / hovered ship (true scale when
`stageBlend` = 0, through the stage law while blending, faded out in cinema), micro HP / shield bars (presented values),
an engagement frame (replaces the ring). Icon alpha = 1 − smoothstep(8, 24, px_L) — the same `px_L` that drives the
stage, so the holo language and the cinema hand over in one motion. Colours by role only (D-CV-22): own `primary`, enemy
`alert`, neutral `foreign`, bands `dim`. Fog gating reuses `isEndpointVisibleInCombat` / `isEngagementInView`; the key
changes per ledger event so the layer never idles mid-battle. **Combat strip** (D-CV-21) replaces the card: top-centre,
`MapInsets`-aware, keeps the `getPanelRect()` contract, sides + strength bars + round + Watch and Director chips.
Retired behind the flag: the card, 3D HP bars, the ring mesh, hit glow sprites.

### 2.7 Director camera (F2)

Optional chip, default OFF (D-CV-23). Deterministic shot schedule from the encounter seed and ledger events: establishing
(wide orbit of the stage, 2–3 s) → follow flagship (largest player hull, else the most engaged) → hero shot on a big kill
(destroyer or larger, or the last ship): presentation-only slow-down 0.35× for ≤ 0.8 s, extra lag capped at 1.5 R,
catch-up at 1.25× afterwards (§3.1-3 — round pace untouched) → back to follow. Hit shake on near impacts (presentation only).
Framing reuses `fitWatchFrame` with a **9:16 safe rect** when the promo overlay is on (crop guide, darkened outside).
Any camera input (drag, wheel, keys, outliner focus) takes control back; the chip shows "Director (paused)". Pause
freezes the director.

### 2.8 Orbital battles: the replay director (F6)

Input: `battle:resolved` from EAH + a sibling **`fx`** key on the event (D-CV-25) — `{ attackerIds, defenderIds
(counted in-service player ships), defence: { tower, grid }, planetId, systemId }`, built in EAH where the lists are
local and passed through `recordBattle(…, { fx })` to its emit; the persisted result is untouched. Seed =
`hash(battleId)`. The BattleSystem `timeline` (≤ 30 turns of aggregate HP / shield / damage) maps onto presentation
rounds (merged to ≤ 8 rounds); per turn and side, the damage is distributed over that side's shooters (ship weapon
modules + defence buildings as surface batteries) with killing shots assigned to the ships the EAH rule wrecks.
Formation: attackers on an arc in the planet's orbit, defenders on the stage shell, batteries on the facing hemisphere;
hangar-docked defenders fire from the batteries (D-CV-26). The wreck look and explosions are held until each ship's
replay kill. In view only (#628); otherwise the banner as today. Path A's intro modal and BattleView3D retire (D-CV-27):
Watch = camera to the planet stage; the outcome banner follows the replay; auto-slow instead of a modal.

### 2.9 Cue bus (F8)

`EventBus.emit('combatfx:cue', { kind, weapon, size, pos:{x,y,z}, pan, dist, encounterId, vesselId })` from the FX
engine at presentation time — `kind` ∈ fire / impact / shieldHit / explosion / destroyed, `weapon` ∈ laser / kinetic /
missile, `size` ∈ small / medium / large, `pan` ∈ [−1, 1] from screen x, `dist` = camera distance; throttled (≤ 12 per
frame, same kind + weapon within 30 ms coalesced with a `count`). Table `src/data/CombatCueData.js`:

```js
export const COMBAT_CUE_SOUNDS = Object.freeze({
  fire:      { laser: null, kinetic: null, missile: null },
  impact:    { laser: null, kinetic: null, missile: null },
  shieldHit: { laser: null, kinetic: null, missile: null },
  explosion: { small: null, medium: null, large: null },
  destroyed: { small: null, medium: null, large: null },
});
export function cueSoundId(cue) { /* → string | null */ }
```

Listener `AudioSystem._onCombatCue(cue)`: `const id = cueSoundId(cue); if (!id) return;` — a no-op until the table is
filled. It needs `AudioSystem.attach()` re-run after `EventBus.clear()` (D-CV-19).

### 2.10 FX engine and quality presets (F7)

Zero allocation after warm-up: pools sized from the preset (beam ribbons and tracer billboards as instanced quads with
HDR cores; GPU particles — birth time, life, position, velocity, size and colour ramps as attributes in ring buffers, the
vertex shader computes the state from `uTime` = presentation time; shield bubbles; shockwave rings; instanced debris).
Own RNG (`src/sim/rng.js`) seeded per encounter / event. **Shots are never dropped**: projectile and beam pools are sized
for the worst 10v10 round (≈ 60 simultaneous shots) with headroom; only secondary effects degrade.

| budget | High | Medium | Low |
|---|---|---|---|
| pixel ratio | min(dpr × 1.5, 2) (today) | min(dpr, 1.5) | 1.0 |
| bloom | on | on | off |
| live particles | 16 000 | 6 000 | 2 000 |
| pool lights | 4 | 2 | 0 |
| debris per explosion | 24 | 12 | 0 |
| smoke / embers / damage smoke | on / on / on | on / off / fire only | off / off / off |
| shield ripples per bubble | 8 | 4 | 1 |
| ship textures | 2K | 1K | 1K |

Auto-throttle (secondary effects only, in the order smoke → embers → debris → damage smoke) when frame time stays above
20 ms for 2 s during combat. Preset stored per machine (localStorage `kosmos_gfx_quality`, try/catch), default from the
WebGL renderer string, ☰ menu row "Graphics: High / Medium / Low" (PL + EN) (D-CV-17). Light pool created at init, idle at
intensity 0; a preset switch recompiles once (D-CV-18). Measurement: `KOSMOS.debug.fxStats()` (pool use, active counts,
`renderer.info` calls / triangles, frame time p50 / p95 over 300 frames) and `KOSMOS.debug.cvBattle({ nA, nB, hulls,
weapons, kind: 'deep' | 'orbital', seed })` — a deterministic stager (correct `systemId`, grid placement, fixed
`seedBase`, scene built on pause, engage orders issued before the first tick so `DirectorRecall` leaves it alone).

### 2.11 Ship model pipeline (F10)

**Hardpoints schema v1** (`assets/models/ships/hardpoints/<slot>.json`; coordinates in normalized model space — centred,
longest axis = 1.0):

```json
{
  "schema": "kosmos-ship-hardpoints", "version": 1, "slot": "warp_frigate",
  "source":  { "file": "warp_frigate.glb", "sha256": "…", "normalizer": "normalize-ship@1" },
  "frame":   { "bow": [-1, 0, 0], "up": [0, 1, 0] },
  "nozzles": [ { "p": [0.48, 0.0, 0.0], "d": [1, 0, 0], "r": 0.04 } ],
  "weapons": [ { "id": "W1", "p": [-0.20, 0.06, 0.03], "d": null } ],
  "lights":  [ { "p": [-0.31, 0.02, 0.0], "size": 0.012 } ],
  "keyColour": { "mode": "mask", "hue": 187, "hueTol": 14, "satMin": 0.45, "valMin": 0.55, "soft": 0.06, "gain": 3.5 },
  "damagePoints": "auto"
}
```

`keyColour.mode` ∈ mask (new models) / points (legacy: the clicked `lights`) / none. The loader computes one quaternion
per slot from `frame` to the canonical frame **bow +Z, up +Y** (D-CV-11 — `Object3D.lookAt`-native, so facing a target
is one call); legacy files start from measured defaults (bow −X for 26 slots, +X for `nonwarp_large_science`; nozzle at
the stern slice centre; no turrets) — the Workshop refines them.

**Key-colour emission (D-CV-12)** — an `onBeforeCompile` chunk on the (now always cloned) `MeshStandardMaterial`,
injected at `emissivemap_fragment`: mask = hue distance to the key hue × saturation × value thresholds (smoothstep with
`soft`), `totalEmissiveRadiance += baseColor · mask · gain` (HDR — windows bloom), keeping the existing emissive-map term
(lit colony windows stay); the enemy tint and the wreck burn-out ride the same chunk as uniforms (#620); one program for
all ships (uniforms only, constant `customProgramCacheKey`). The Workshop imports the same chunk, so preview = game.

**Normalizer (D-CV-13/14/15)** — `node tools/ship-models/normalize-ship.mjs <slot>` (gltf-transform + sharp, already in
`package.json`; output free of Draco / meshopt / KTX2 — the loader has no decoders): read `incoming/<slot>.glb` → report
(tris, textures, cyan %, near-black hull %, single mesh, UV coverage) → weld / dedup / prune → centre → scale (longest
axis 1.0) → orient the longest axis to X with the bow sign guessed by the 8 %-slice vertex density (27/27 on the current
set) → textures: 2K cap, base colour LOSSLESS (PNG / WebP lossless — no 4:2:0 JPEG, thin cyan bleeds), normal maps WebP or
PNG, a `<slot>@1k.glb` variant for Medium / Low → archive the old slot (`_archive/`, not tracked) → write the slot →
create or MERGE `<slot>.hardpoints.json` (clicked points survive a re-normalize). Triangles: warn above 15k (the owner
sets the polycount in Meshy); automatic simplify only if D-CV-14 (b).

**Model Workshop (D-CV-16)** — `tools/model-workshop/index.html` served by Live Server, own importmap (`"three":
"../../src/lib/three.module.js"`, addons from the same CDN line), `OrbitControls`; slot picker (incoming + slots),
click modes Bow / Nozzle (+ direction) / Turret W1…Wn / Light points; key-colour sliders (hue, tolerance, saturation,
value, softness, gain) with live preview through the game's chunk; save via the File System Access API (a directory
handle to `assets/models/ships/hardpoints/`) with download fallback; state kept in sessionStorage because the save itself
makes Live Server reload the page.

### 2.12 Rules every CV step obeys

1. No `Math.random` in CV code (renderer RNG or encounter-seeded RNG); no THREE allocation in hot paths (pools).
2. Read positions through `getVesselWorldPosition`; write sprite transforms only through `_stagePlace`.
3. Gate by `isEngagementInView` (viewed system) and the existing fog predicates; never in galaxy mode.
4. Tick on the presentation clock; pause freezes everything; no catch-up.
5. Custom shaders: log-depth chunks, uniforms not string interpolation, HDR above the bloom threshold only for what
   should glow.
6. Treat `vessel:engaged.location`, `battle:resolved.result` and encounter objects as read-only live references.
7. Flags read at call time (`GAME_CONFIG.FEATURES.*`), OFF = today's code path bit for bit.
8. Every visible string PL + EN through `t()`; `check-i18n` cannot see literals in `fillText`.
9. Keepers logic-only (F11 a–f); no pins on drawing constants; tuning knobs exposed live (`KOSMOS.threeRenderer.cvTuning`).

---

## §3 Decisions for the owner's signature (D-CV-1 … D-CV-28)

`[step]` = the first step the decision gates. Each row: options, **recommendation**, consequence.

| D | [step] | Question → options | Recommendation | Consequence | Signed |
|---|---|---|---|---|---|
| **D-CV-1** | CV-0b | Renderer randomness vs the game stream → (a) patch vendored `generateUUID` (`three.core.js:312-317`) to a private PRNG + one renderer RNG for the 12 direct calls · (b) accept — F1 provable only for DSCS maths · (c) take world systems off `Math.random` | **(a)** | a 5-line patch in a vendored file (re-apply on any three upgrade; a keeper catches it); afterwards any renderer allocation is neutral to the world by construction | ✅ 2026-11-08 (a) + condition §3.1-1 |
| **D-CV-2** | CV-3a | Stage law → (a) power law on pair gaps, α 0.7525, k 0.0913, radial about the midpoint · (b) piecewise-linear through band anchors · (c) uniform scale | **(a)** | one knob (α) meets all three windows (§2.2); pairwise order exact for symmetric pairs, approximate otherwise (probe in CV-3a) | ✅ 2026-11-08 (a) + condition §3.1-2 |
| **D-CV-3** | CV-3a | Stage trigger → (a) semantic-zoom blend for every in-view battle (`px_L` 4 → 24) · (b) only in Watch | **(a)** | zooming into any battle stages it; Watch simply lands in cinema range | ✅ 2026-11-08 as recommended |
| **D-CV-4** | CV-3a | Body-pinned participants → (a) presentation shell around the body · (b) no stage for body-anchored battles | **(a)** | ships never drawn inside a planet; #626 gets a defined look | ✅ 2026-11-08 as recommended |
| **D-CV-5** | CV-3a | Empty-space clicks inside a staged battle → (a) invert through the stage law · (b) refuse with a toast · (c) today (unstaged point) | **(a)** | a move order goes where the player sees | ✅ 2026-11-08 as recommended |
| **D-CV-6** | CV-3b | Envelope + invariant → windows L [3,4] K [7,9] M [12,15]; pair gap strictly between neighbouring windows; E ≤ 1 L (frigate 1.0, destroyer 0.7, battleship 0.4); mostly tangential | **as stated** | "never into another apparent band" becomes a testable property | ✅ 2026-11-08 as recommended |
| **D-CV-7** | CV-3b | Doctrine visibility → (a) posture only + #631 to the owner as a mechanics question · (b) fake distance behaviour | **(a)** | stance visible, no lie about distance | ✅ 2026-11-08 as recommended |
| **D-CV-8** | CV-4 | FX data → (a) add `round`, `weapon`, `side`, `dmg`, `hpAfter`, `shieldAfter`, `killed` to the `combat:roundFx` payload only · (b) renderer reads `encounter.timeline` / `vesselStates` (private, live) | **(a)** | the one DSCS edit of the arc — payload-only, save and `round.events` byte-identical (keeper) | ✅ 2026-11-08 as recommended |
| **D-CV-9** | CV-4 | Presentation lag → ≤ 1 round; HP, shield and kill at IMPACT; wreck look and explosion held; late `vessel:wrecked` deduped | **yes** | the battle reads cause → effect; logic stays authoritative | ✅ 2026-11-08 — reconciled with D-CV-24, numbers §3.1-3 |
| **D-CV-10** | CV-2a | Presentation clock → (a) real dt while running (glide pattern), `simClockMs` as phase reference · (b) raw `simClockMs` | **(a)** | smooth and frozen in pause (#616) | ✅ 2026-11-08 as recommended |
| **D-CV-11** | CV-1a | Canonical model frame → (a) bow +Z, up +Y via a per-slot quaternion · (b) keep bow −X | **(a)** | `lookAt` faces targets; `nonwarp_large_science` fixed through its hardpoints | ✅ 2026-11-08 as recommended |
| **D-CV-12** | CV-1a | Key-colour emission → (a) runtime mask chunk with hardpoint params · (b) baked mask texture | **(a)**, (b) as fallback | live tuning = game; no extra texture | ✅ 2026-11-08 as recommended |
| **D-CV-13** | CV-1b | Normalizer stack → (a) node + gltf-transform + sharp (declared, `npm install`) · (b) zero-dependency · (c) in-browser | **(a)** | dev-only dependencies; runtime CDN rule untouched | ✅ 2026-11-08 as recommended |
| **D-CV-14** | CV-1b | Triangle reduction → (a) warn only (Meshy polycount) · (b) automatic simplify (new dev dependency `meshoptimizer`) | **(a)** | no new dependency now | ✅ 2026-11-08 as recommended |
| **D-CV-15** | CV-1b | Textures → (a) 2K master, base colour lossless, normal WebP / PNG, generated 1K variant · (b) KTX2 · (c) 1K only | **(a)** | cyan mask stays crisp; 1K for Medium / Low; normal maps are today's weight (67 %) | ✅ 2026-11-08 (a) + condition §3.1-4 |
| **D-CV-16** | CV-1c | Workshop → (a) `tools/model-workshop/` page, FS Access API save, state survives the Live Server reload · (b) in-game debug overlay · (c) download only | **(a)** | no game coupling; same chunk as the game | ✅ 2026-11-08 as recommended |
| **D-CV-17** | CV-2b | Presets → table §2.10, per machine (localStorage), default from the renderer string, auto-throttle secondary only, ☰ row | **yes** | presets own pixel ratio and bloom — the big levers | ✅ 2026-11-08 as recommended |
| **D-CV-18** | CV-2b | Lights → fixed pool High 4 / Medium 2 / Low 0, idle at 0 | **yes** | no shader recompiles mid-battle | ✅ 2026-11-08 as recommended |
| **D-CV-19** | CV-2b | Audio attach → (a) `AudioSystem.attach()` with ONLY the cue no-op listener (no audible change) · (b) re-attach everything (fixes the dead ☰ toggles, re-enables procedural SFX — audible) | **(a)**, #613 as a separate one-line follow-up | F8 stays strict | ✅ 2026-11-08 (a) + condition §3.1-5 |
| **D-CV-20** | CV-6a | Tactical layer tech → (a) HUD 2D sublayer · (b) 3D sprites | **(a)** | palette roles, crisp at any zoom, idle when nothing moves | ✅ 2026-11-08 as recommended |
| **D-CV-21** | CV-6b | Card replacement → (a) compact combat strip, `MapInsets`-aware, `getPanelRect()` kept · (b) restyled card | **(a)** | #629 closed by construction | ✅ 2026-11-08 as recommended |
| **D-CV-22** | CV-6a | Combat palette → roles only (own primary, enemy alert, neutral foreign, bands dim); weapon colours stay semantic data, HDR | **yes** | themes recolour the tactical layer | ✅ 2026-11-08 as recommended |
| **D-CV-23** | CV-7 | Director → default OFF, chip, input takes control back; 9:16 overlay separate | **yes** | the player always owns the camera | ✅ 2026-11-08 as recommended |
| **D-CV-24** | CV-7 | Hero slow-down → presentation-only warp ≤ 0.35× for ≤ 0.8 s, recovered ≤ 1.3× within one round | **yes** | round pace untouched (F1) | ✅ 2026-11-08 — reconciled with D-CV-9; §3.1-3 numbers supersede this row |
| **D-CV-25** | CV-8a | Orbital replay source → (a) BattleSystem timeline + sibling `fx` key on the event · (b) synthesis from `battleId` only | **(a)** | faithful pacing; result object untouched | ✅ 2026-11-08 as recommended |
| **D-CV-26** | CV-8a | Hangar-docked defenders (counted, no sprite) → (a) fire from planetary batteries · (b) temporary scrambled sprites | **(a)** | no fake ships | ✅ 2026-11-08 as recommended |
| **D-CV-27** | CV-8b | Path A → (a) retire intro modal + BattleView3D; Watch = camera to the stage; banner after the replay; auto-slow · (b) keep the modal | **(a)** | one battle scene for every path | ✅ 2026-11-08 (a) + condition §3.1-6 |
| **D-CV-28** | all | Protocol → F11 light loop; flag per step; keepers a–f only; owner views live with `cvBattle` at 1600×1041 on the RTX 3070 (a GPU CDP clip optional); STOP before every commit | **yes** | no contact sheets for 3D combat — live viewing is the gate | ✅ 2026-11-08 as recommended |

### §3.1 Owner's conditions (signed 2026-11-08)

1. **D-CV-1 (a).** CV-0b shifts the game's random stream ONCE: after the patch THREE objects and visual effects no
   longer draw from `Math.random`, so the same save evolves differently than before the patch — removal of
   contamination, not a mechanic change (the browser stream is unseeded anyway; keepers run on the seeded stream of
   `headless/env.js`). Every keeper that pins a `Math.random`-dependent outcome is listed and re-tuned in the CV-0b
   record (§4).
2. **D-CV-2 (a).** The band-invariant keeper checks EVERY PAIR of combatants — apparent band of the drawn gap == band of
   the logical gap (bands laser / kinetic / missile / beyond, edges `G(range)`) — never the distance from the centre.
   **The radial law can mis-band asymmetric pairs:** a pair on one side of the midpoint, far out, is compressed by the
   local slope `g′(r) = α·g(r)/r` instead of `G(d)` (allies close together far from the centre fall into a "closer"
   band; off-axis attacker–target pairs drift too). **Guard (CV-3a):** after the radial seed a deterministic
   pair-faithful relaxation (a few Gauss–Seidel passes on pair gaps toward `G(d)`, warm-started from the previous update,
   plus the deconfliction floor) runs on every update; an O(N²) band check (≤ 190 pairs at 10v10) verifies every pair;
   if any pair is still mis-banded after K passes, that encounter falls back to a uniform similarity scale (exact pair
   order, windows only approximate) and `fxStats` reports it. The keeper asserts zero mis-banded pairs after the guard on
   random and recorded 10v10 configurations.
3. **D-CV-9 + D-CV-24 reconciled.** Normal presentation lag ≤ 1 round (R). A hero shot is the ONLY state allowed to
   exceed it: presentation speed 0.35× for at most 0.8 s real ⇒ extra lag 0.52 s = 1.3 R at R = 400; hard cap on the
   extra lag **1.5 R** (the shot ends early when reached); afterwards the presentation catches up at **1.25×** (0.52 s
   recovered in ≈ 2.1 s); no new hero shot until the lag is back under 1 R; pause freezes both clocks; if the battle ends
   during a hero shot or the catch-up, the presentation plays out the remaining events at 1.25× after the logical end.
   Round pace (`combatRoundMs`, the combat grid) untouched.
4. **D-CV-15 (a).** The normalizer compresses the NORMAL maps first (26 PNG normal maps = 63.8 MiB = 67 % of the ship
   folder): WebP via `EXT_texture_webp` (GLTFLoader r171 supports it), quality chosen on a contact sheet against the PNG;
   then base colour (lossless), metallic-roughness, emissive. A one-off pass over the 27 legacy files belongs to CV-1b.
5. **D-CV-19 (a).** The no-op cue listener subscribes AFTER `EventBus.clear()` at game start (`GameScene.start` →
   `AudioSystem.attach()` → cue listener only); logic keeper: after a simulated game start (`EventBus.clear()` + attach)
   the listener is subscribed exactly once and receives a cue. **#613** (☰ audio toggles) stays a separate fix OUTSIDE
   CV.
6. **D-CV-27 (a).** When the intro modal and BattleView3D retire, the orbital battle outcome stays visible: the combat
   strip shows a result row after the replay and the Dziennik keeps `log.battleLine` (today's narrator in `GameScene`);
   CV-8b re-checks **Finding 157** (auto-slow classifies the player side with `isPlayerParticipant` on every orbital
   path).
7. **#631** (doctrines barely exist mechanically) — NOT in CV; registered as a candidate future **MECHANICS** arc; the
   owner decides later.

---

## §4 The cut (each step sized for ONE session; split where marked)

Order (owner, 2026-11-08 — early visual payoff): **CV-0b → CV-2a → CV-3a → CV-3b → CV-1a → CV-1b → CV-1c → CV-2b →
CV-4 (a/b) → CV-5 → CV-6a → CV-6b → CV-7 → CV-8a → CV-8b → CV-Z** (≈ 16–17 sessions). CV-0b stays first: every later
step changes how many THREE objects exist. The step sections below keep their numbers; read them in this order.

**Dependencies on CV-1 and the shims** (CV-2a, CV-3a and CV-3b now run before CV-1a):
- CV-2a (FX engine, stager) — none: endpoints are drawn positions; muzzle hardpoints arrive with CV-4.
- CV-3a (stage) — none: the ship length L comes from `VESSEL_TARGET_SIZE` (`VesselModelResolver.js:60-66`).
- CV-3b (choreography) — **the bow axis**: facing a target needs each model's bow, and models are not rotated today.
  Shim: `legacyBowSign(modelPath)` in `ChoreographyLogic` — bow along local **−X** with ONE exception,
  `nonwarp_large_science` (+X, #621); the same shim moves that slot's exhaust cone to `box.min.x` once engines are lit in
  combat. CV-1a replaces the shim with the hardpoints frame (canonical bow +Z) and deletes it; until then a keeper pins
  that the exception list has exactly one entry.

### CV-0b — renderer randomness off the game stream (D-CV-1)

| | |
|---|---|
| **Flag** | none — pure isolation, no visual change (the world's unseeded `Math.random` simply stops being advanced by THREE) |
| **Files** | `src/lib/three.core.js` (`generateUUID` → private xorshift seeded once from `crypto.getRandomValues`, with a comment why) · `ThreeRenderer.js` (12 direct `Math.random` → one renderer RNG from `src/sim/rng.js`) |
| **Keepers (logic)** | NEW `cv_renderer_rng_smoke`: import real three r171 from `src/lib` under node, wrap `Math.random` with a counter, construct Object3D / Mesh / BufferGeometry / Material / Texture ⇒ **0 draws** (control: a copy of the original function draws 4 per call); UUID uniqueness over 10⁵ calls; source tripwire: no `Math.random` in `ThreeRenderer.js` outside comments (control on a mutated copy) |
| **Owner looks at** | the game loads and plays as before (sanity) |

#### CV-0b — ✅ delivered 2026-11-08 (`aeff511`)

Owner's check PASS 2026-11-08: `KOSMOS.debug.rngCheck()` → `gameDraws: 0`; `KOSMOS.debug.rngWatch()` around a live
battle (`probe603Battle`) → 48 game draws, **0 from the visual layer**; the look unchanged (title stars, exhaust flicker,
wreck tilt, trade fireflies, battle FX).

**What changed.** `src/lib/three.core.js` — `generateUUID` draws from a private xorshift128 (`_uuidState`, seeded once
from `crypto.getRandomValues`; a clock fallback without `Math.random`), marker comment `KOSMOS CV-0b (Finding 612)`; the
other explicit THREE random APIs (`MathUtils.randInt / randFloat / randFloatSpread`, `Vector2 / 3 / 4.random`,
`Quaternion.random`, `Vector3.randomDirection`) are untouched — the game calls none of them (grep 0) and new visual code
uses `rendererRandom`. NEW `src/renderer/RendererRng.js` — `rendererRandom()` / `reseedRendererRandom(seed)` on
`src/sim/rng.js` (`RNG('kosmos-renderer')`, fixed seed ⇒ reproducible visuals). 40 purely visual calls moved (inventory
below). Console instruments (quote-free): `KOSMOS.debug.rngCheck()` (renderer `debugRngCheck` under `countGameDraws`)
and `KOSMOS.debug.rngWatch()` (NEW `src/debug/RngWatch.js` — start / stop, table "file → game draws", verdict).

**Inventory** (line numbers after the change; `src/lib/` and `src/testing/**` outside the inventory):

| Set | file:line | Why |
|---|---|---|
| **MOVED → `rendererRandom` (40)** | `ThreeRenderer.js:1371` (wreck orbit-cache phase, `vessel:wrecked`), `:1401-1402` (wreck tilt, `vessel:wrecked`), `:2977` (life-glow pulse phase), `:4800-4801` (wreck tilt at creation), `:4824` (exhaust flicker phase), `:4854` (wreck orbit-cache phase at creation), `:5881, :5883, :5885, :5887` (trade fireflies: phase, speed, direction, arc) · `BattleView3D.js:114-116` (starfield), `:245` (ship bob phase), `:498-499, :541-542` (shooter / target picks — cinema only) · `TitleScene.js:304-307, :311-312` · `FactionSelectScene.js:86-89, :93-94` · `EndgameScene.js:330, :337-339` (starfields) · `ScheduledEventPopup.js:367, :369` (hex noise text) | visual only — nothing feeds back into game state |
| **KEPT in presentation-adjacent files** | `GameScene.js:1734` (debug `simulateBattleRetreat` angle → fake battle and retreat order), `:4127, :4131` (event effect success / casualty rolls), `:4806` (moon period on restore — physics) · `ConsulElectionModal.js:44` (candidate order — the player's political choice) · `UnitDesignOverlay.js:716` (design id — saved) · `SpawnTestEnemy.js:482, :651` (debug spawn angles → positions) · `AudioSystem.js:340` (noise buffer — audio is outside CV, F8; it moves together with #613) | game state / outside CV |
| **KEPT — game state** | `OrbitalSpaceSystem.js:273-275, :290-292` (orbit slots — write logical positions) · `VesselManager.js:3098` (arrival angle) · `InvasionSystem.js:635` (landing hexes) · `CombatSystem.js:341, :409` (ground combat) · `GroundUnitManager.js:801` · `IntelSystem.js:372` (intel noise) · `Planet.js:21`, `Moon.js:22`, `Asteroid.js:22`, `Comet.js:22`, `Planetoid.js:23` (mean anomaly M) · `SystemGenerator.js` (79 references, `:111`–`:1068`, world generation) · `GalaxyGenerator.js:81` · `PhysicsSystem.js:211-212, :265-269, :374, :376, :422-423` · `RandomEventSystem.js:32, :215, :227, :240, :260, :268, :349, :457-458` · `ColonyManager.js:1180, :2127, :2219, :2340, :2676` · `ExpeditionSystem.js:1315, :1324, :1436, :1468, :1695` · `MissionSystem.js:1844, :1851, :2006, :2059, :2659` · `ImpactDamageSystem.js:145, :154, :160, :163, :235` · `OrderService.js:208, :304` · `StationSystem.js:55, :275` · `ScheduledEventSystem.js:102, :115` · `AnomalyEffectSystem.js:95` · `DiscoverySystem.js:118` · `SaveMigration.js:1742` · `EmpireData.js:129` (default `rng` parameter) · `StationModuleData.js:221` (module id) | untouched |

(The instrument's own wrapper — `RngWatch.js:51-77` — is the only new `Math.random` reference.)

**Keepers.** NEW `src/testing/smoke/cv_renderer_rng_smoke.mjs` **62 / 0**: T1 (b) 1 350 THREE objects of 16 types +
clones + `generateUUID` ⇒ 0 game draws, 100 000 UUIDs without a collision, v4 format · T2 source pin on the generator ·
T3 `RendererRng` · T4 zero `Math.random` in the six moved files and in the whole `src/renderer/` (32 files) + the KEPT
counts unchanged · T5 (a) scripted DSCS battle (3 frigates vs a destroyer, real `TimeSystem` combat grid) with the
renderer's REAL FX methods extracted from source and run on real Three.js r171 — 95 effects and 2 explosions inside the
measurement window, game-draw sequence ON == OFF (12 draws, identical values) · T6 (c) battle signature OFF == ON ==
recorded `[[17,31,27,A,B,1,0],[1,2,2,A,null,0,1]]` + 4 orbit slots assigned DURING the battle identical ON / OFF ·
T7 the console instruments (and `rngWatch` does not change the game stream). Controls green on both sides: the old-UUID
emulation shifts the sequence (1 152 vs 12 draws) and the slots. **Fail-first** against the pre-patch three
(`git show HEAD:src/lib/three.core.js` copied to the scratchpad, `CV0B_THREE_URL`): **58 / 4** — exactly T1b (6 008
draws), T5d (1 072 ≠ 12), T6d (slots differ) and T7b (5 600 draws).

**One-time stream shift (§3.1-1).** After CV-0b the same save evolves differently than before the patch — THREE
allocations no longer advance `Math.random` (removal of contamination, not a mechanic change). Re-tuned keepers:
**none** — the sweep stayed green without touching a single keeper: keepers that import game modules get the `three`
stub (no `generateUUID`), and the 17 keepers that import real Three.js r171 pin nothing that depends on the game stream
after a THREE allocation.

**Sweep 372 / 372 OK, 0 FAIL** (28 advisory, all pre-existing — the new keeper is not among them) · `check-i18n` PASS ·
no new i18n keys (console instruments only). **CV-0c:** not needed — the whole
migration fit this session.

### CV-1a — hardpoints, canonical frame, key-colour emission (flag `cvModels`)

| | |
|---|---|
| **Files** | NEW `src/data/ShipHardpointsSchema.js` (schema v1 + `validateHardpoints`) · NEW `src/renderer/ShipHardpoints.js` (load / cache per slot, legacy defaults, frame quaternion) · NEW `src/renderer/KeyColourEmission.js` (chunk + uniforms; enemy tint and wreck burn as uniforms) · NEW `assets/models/ships/hardpoints/*.json` (27 legacy files from the measurements) · `ThreeRenderer._addVesselModel3D` (canonical frame on the model, exhaust at the nozzle hardpoint, clone materials for ALL ships, fix #625) · orbit heading sign (#622) · README rewrite (#621) |
| **Keepers (logic)** | schema validation (valid / invalid files); legacy defaults complete for every resolver slot; frame quaternion maps ±X / ±Z inputs to bow +Z; mask classification function (pure JS mirror) on given parameters; maintenance tint touches only its own ship's materials (execution on real three) |
| **Owner looks at** | all ship types fly bow-first (incl. `nonwarp_large_science`), plume at the nozzle, enemy tint and wreck glow visible, maintenance grey only on the immobilised ship; key-colour glow on a test model (his first Meshy model if ready) |

### CV-1b — normalizer CLI (tools; no runtime flag)

| | |
|---|---|
| **Files** | NEW `tools/ship-models/normalize-ship.mjs` + `tools/ship-models/lib/*.mjs` (pure functions) · `.gitignore` (`assets/models/ships/incoming/`, `_archive/`) · `README_modele_statkow.md` (the owner's model standard F10 + pipeline) · **normal maps first** (§3.1-4): WebP normal maps, then lossless base colour; a one-off pass over the 27 legacy files with a before / after contact sheet |
| **Keepers (logic)** | pure functions on synthetic in-memory meshes: bbox / centre / scale, bow guess by 8 %-slice density, hardpoints MERGE keeps clicked points, report fields (cyan %, black %, tris) |
| **Owner looks at** | drops one Meshy GLB in `incoming/`, runs the CLI, reads the report, sees the slot in the game |

### CV-1c — Model Workshop (tools; no runtime flag)

| | |
|---|---|
| **Files** | NEW `tools/model-workshop/index.html`, `workshop.js`, pure `WorkshopLogic.js` |
| **Keepers (logic)** | `WorkshopLogic`: click → hardpoint in normalized model space; serialization is schema-valid; undo stack; slider values ↔ `keyColour` round-trip |
| **Owner looks at** | clicks bow / nozzle / turrets on his model, tunes the mask live, saves, sees it in the game |

### CV-2a — FX engine core, presentation clock, stager (flag `cvFxEngine`)

| | |
|---|---|
| **Files** | NEW `PresentationClock.js`, `FxEngine.js`, `FxShaders.js` (log-depth chunks), pools · `ThreeRenderer._onCombatRoundFx` routes to the engine under the flag at today's timing (`combatFxPace`; no ledger yet) · `KOSMOS.debug.cvBattle(...)`, `KOSMOS.debug.fxStats()` |
| **Keepers (logic)** | (d) presentation clock frozen while paused, no catch-up after resume; (f) zero geometry / material constructions after warm-up during 100 synthetic salvos (real three under node, prototype counters) and caps never exceeded; (a) headless 10v10 (combat_pace pattern): signature + per-round trace identical with the flag ON / OFF, plus a control — a fake subscriber drawing `Math.random` DOES shift `OrbitalSpaceSystem` slots (proves the instrument) |
| **Owner looks at** | a 10v10 from `cvBattle`: HDR beams / tracers on today's timing; pause freezes every effect; fps from `fxStats` ≈ 60 on High |

#### CV-2a — ✅ delivered 2026-11-08 (`230fd3c`; owner's check PASS; `cvFxEngine` default ON)

**What changed.**
- NEW `src/renderer/combat/PresentationClock.js` (pure, zero imports): real frame dt while the game runs, step 0 in pause
  (the real-time stamp keeps moving, so the first step after resume is ONE frame — no catch-up), step capped at 100 ms
  (background tab, suspended loop, `_renderingEnabled` off — the repo's `ANIM_DT_MAX_S` / `COMBAT_GLIDE.DT_MAX_MS`
  convention), a backward clock re-anchors, `anchor(simClockMs)` as the phase reference only (D-CV-10).
- NEW `src/renderer/combat/FxShaders.js`: two programs. STREAK — camera-facing ribbon between two points; half-width in
  WU with a screen-space floor `uMinPx` (CSS px, through `uPxToWorld = 2·tan(fov/2)/H`); HDR core above the bloom
  threshold 1.0; `uStyle` 0 = beam (even), 1 = tracer (bright head at the target, fading tail). SPARK — billboard (impact
  flash, shield ring, hit glow on the model), flash and ring grown ×1 → ×3 like today, size from the target model with a
  per-kind floor / cap in screen px (the cap takes the role of the Watch `watchFxScale`, CP14), pulled toward the camera by
  half its size so the model never hides the core. Log-depth chunks via `LogDepthChunks` (V-267); every per-effect value is
  an instance attribute or a uniform — beams and tracers share one program text.
- NEW `src/renderer/combat/FxEngine.js` (THREE injected — the node keepers build it on real r171): three instanced pools
  built once (beam 1024 · tracer 1024 · spark 8192), swap-remove so the active instances are contiguous, upload range
  [0, n), per-frame follow of the DRAWN vessel positions (today's `_followTracerEnds` / `_followFxTarget` semantics), the
  effect's age computed in the shader from the presentation clock; overflow policy — the oldest effect ends early, a new
  shot ALWAYS gets a slot (`steals`, zero at the worst load). Live knobs `LIVE_CV_FX`, aliased as
  `KOSMOS.threeRenderer.cvTuning` (beam / tracer width and core gain, min screen width, flash / ring / glow size and px
  floor / cap), rewritten to the uniforms every frame — no pins on their values. Defaults after the owner's tuning on the
  check: `TRACER_CORE` 4 (was 2.6), `MIN_PX` 3 (was 2).
- `ThreeRenderer`: `_onCombatRoundFx` → `_cvFxRoundFx` under `FEATURES.cvFxEngine` (read at call time) with today's
  `combatFxPace`, today's stagger `(i % 8) · staggerMs` and today's fog gate `_combatEndpointWorld`; misses as today (dim
  streak, no flash). `_tickCvFx` in the render loop after the legacy drain — flag OFF and nothing in flight ⇒ immediate
  return. Engine root hidden in galaxy mode. `cvFxStats(frames)` sampler: frame interval (what the player sees, incl.
  rasterisation), JS loop time, `renderer.info` calls / triangles summed over every composer pass (`autoReset` off only
  while sampling), pool peaks. Wreck explosions still use today's `_spawnExplosion` under the flag (CV-5).
- NEW `src/debug/CvBattleStager.js` (Finding 634): `KOSMOS.debug.cvBattle({ nA, nB, hulls, weapons, kind, seed })` — pure
  layout `cvBattleLayout` (two lines of 5 per side, front 0.06 AU from the centre, everyone inside the 0.225 AU team-up
  radius ⇒ the whole 10v10 enters one encounter at once), mixed hulls (frigate / destroyer / cruiser as battleship) and
  mixed weapons, the viewed system, a clear spot ≥ 1 AU from any other vessel and ≥ 0.5 AU from bodies
  (`cvBattleCenter`), pause, `vessel:combatRangeEnter` for the centre pair before the first tick, fixed
  `seedBase = cvSeedBase(seed)`, engage orders, names `CV-A01…` / `CV-B01…`, runtime marker `_cvBattle`, sprites restored
  at once (no position update arrives in pause), autosave interval 0 in memory only (F5 restores the menu value), warning
  "nie zapisuj gry po teście". A re-run after the battle removes the previous test ships (silent `dismantled`); during the
  battle — `battle_in_progress`. `kind: 'orbital'` → `not_yet` (CV-8a). `cvFx(1 | 0)` toggles the flag; `fxStats()`
  measures 300 frames.
- `GameConfig.FEATURES.cvFxEngine: true` — default ON by the owner's decision after the check (OFF path kept bit for bit
  until CV-Z; console: `KOSMOS.debug.cvFx(0)`). `cv_renderer_rng_smoke` now sets the flag OFF inside its scripted battle —
  it pins TODAY's FX path; the engine path's neutrality is pinned by `cv_fx_results_smoke`.

**Keepers.** NEW `cv_fx_engine_smoke` **38 / 0** — (d) clock frozen through a 30 s pause, one-frame step after resume,
a 60 s gap capped; engine uniforms / active counts / attributes unchanged through the pause, the last effect retiring at
exactly its presentation lifetime (KONTROLA: the same engine fed the absolute clock loses everything in the pause —
#616); (f) zero constructions (Object3D / Material / BufferGeometry / Texture id counters) and zero typed arrays after
warm-up through 100 worst-round salvos (KONTROLA: deliberate constructions counted exactly); the worst 10v10 round (20
ships × 5 utility slots = 100 shots, all hit and shield-blocked) at R 50 / 110 / 400 / 1000 — zero steals, every shot
drawn (peak sparks 4 068 / 8 192 at R 50, the upper bound); overflow keeps the four newest shots; log-depth chunks,
shared program text, knobs through uniforms; follow; zero `Math.random`, no `new` in the hot path (KONTROLA on a mutated
copy); flag OFF ⇒ `_tickCvFx` touches nothing and `_onCombatRoundFx` takes today's path, flag ON ⇒ `_cvFxRoundFx` with
today's pace; OFF-path fingerprint (SHA-256 of today's FX method bodies) == `0eabc4f`. Fail-first on a detached `0eabc4f`
worktree **2 / 13** — the two greens are the guards (the OFF route, the OFF fingerprint). NEW `cv_fx_results_smoke`
**28 / 0** — the stager on the headless world (S1–S6) and (a): flag ON (real renderer methods extracted from the source +
the real engine on r171) == OFF (today's path) == no renderer on the signature `[[20,164,128,"B",null,7,3]]`, the
per-round trace of all 20 rounds (events, hp / shield of every ship, logical positions), the game draw sequence and the
orbit slots of four ships arriving mid-battle; KONTROLA: a listener drawing `Math.random` shifts the slots (66 ≠ 12
draws); the real `DirectorRecall.strandedWarshipsAwayFromHome` skips the staged AI ships (witness: with the encounter
predicate off it lists all 10). Fail-first **0 / 28** — measured after adding witnesses to four pins that first passed
vacuously on an empty battle. `log_depth_chunks_smoke` — one pin RE-AIMED: it counted `logDepth: logDepthOn(),` in the
whole renderer and expected 2, and the FX engine is a legitimate third consumer; it now reads the arguments of the two
star factory calls it protects (control: the corona call without `logDepth` is caught) — 144 / 0.
`cv_renderer_rng_smoke` 62 / 0 unchanged. Sweep **374 / 374 OK, 0 FAIL** (28 advisory, pre-existing) · `check-i18n` PASS ·
no new i18n keys (console instruments only) · save v101 untouched.

**Measured in the real game** (isolated headless Chrome, GATE-S4 fixture, window 1600×900, pixel ratio 1.5):
- SwiftShader: the three programs compile and link; KONTROLA — the beam program with the log-depth prerequisite removed
  does NOT link (the S4 defect class is visible to the probe); `cvBattle()` 20 / 20 in one encounter, engage 10 / 10,
  sprites 20 / 20; pause — uniforms and active counts identical over 1.5 s; no exceptions or shader errors (only the known
  building-icon 404s, O16).
- RTX 3070 (ANGLE D3D11, Watch framing): idle 16.7 / 16.8 ms p50 / p95, 60 fps, 138 calls, 105 k triangles; 10v10 with the
  flag ON 16.7 / 16.8 ms, 59.6 fps, JS loop 1.4 / 2.1 ms, 149 calls (max 151), 255 k triangles; engine peaks beam 5 ·
  tracer 28 · spark 47, zero steals; the paused frames 1.5 s apart show every beam, tracer, ring and flash in the same
  place. Seed 1 in the fixture: 20 rounds, losses 7 / 3 — the same as the headless keeper (169 vs 164 shots: the save's
  own techs).

**Owner's check — PASS 2026-11-08** (steps 1–9 OK, four battles watched on the RTX 3070): flag ON, `cvBattle()` 10v10,
zoom in / out, pause freezes every effect, `fxStats()`, the same seed with the flag OFF, reload without saving; tuning on
the check `TRACER_CORE = 4`, `MIN_PX = 3`. Decisions: `cvFxEngine` default ON with that tuning as defaults; commit
`feat(CV-2a)` + `docs(CV-2a)`. The owner's observations from the check are diagnosed read-only in §4 CV-2a — findings
from the check (#638 onward).

#### CV-2a — findings from the owner's check (read-only diagnosis 2026-11-08; #638–#645)

The owner's seven observations from the check, diagnosed without changing game code — the only code is the `fxStats`
instrument (#644, its own commit). Measurements: headless node probes on the real DSCS / Proximity / Observatory systems
(scratchpad, outside the repo) and the GATE-S4 fixture in headless Chrome on the RTX 3070 (four `cvBattle` 10v10 back to
back, window 1584×805; every bus event, Dziennik entry, DOM banner and legacy FX recorded). Line numbers at
`fc7334d` (the instrument commit).

1. **"Several battles in one place" — #638.** One `cvBattle` 10v10 is exactly ONE DSCS encounter (all 20 ships), one
   `battle:resolved`, one banner: headless 12 seeds (never two encounters at once, no ship in two), live 4 / 4 / 4. The
   `_n` suffix is not a fragment — `_makeEncounterId` (`DSCS:1506-1514`) appends `_2`, `_3`, … when the same owner pair
   already has an active encounter or a battle record with the same 0.01-game-year stamp (runs started from the same
   paused year); a `_6` means five such encounters / records of the pair in that 0.01 year. Formation: the trigger pair →
   `startEngagement` gathers every free same-system ship within 0.225 AU of the pair's midpoint (`:241`), EXCEPT under
   player intent (one ship of the pair has an `engage` order on the other) — then the encounter starts with that pair only
   (`:229-236`) and the others join one by one through their own `combatRangeEnter` (`_joinEncounter`); two ships already
   in different encounters never merge (`:186-188`). So normal play does produce several co-located encounters — measured:
   5v5 with "Engage" on a different target per ship → two concurrent encounters 0.15 AU apart; 5v5 on one target → two
   sequential encounters (2 ships, then 4). Each encounter has its own engagement ring, card and result.
   **Proposal — CV-3a:** a presentation "battle" = cluster of co-located encounters (same system, centres within the stage
   radius) → one stage, one ring / strip (CV-6b), one result; DSCS untouched.
2. **Result shown many times — #639.** Per battle the result reaches the player THREE times: the banner
   `showBattleOutcome` with pause (`GameScene:2789` queue → `_tryShowNextBattle` → `BattleIntroModal.js:215`), the Dziennik
   battle line `log.battleLine` (`GameScene:2867`) and the Dziennik line `log.skirmish` "⚔ Potyczka … bez stanu wojny"
   (`UIManager:1829-1831` on `war:skirmish`, emitted for every no-war battle at `WarSystem:446`), plus auto-slow. Live, 4
   battles: banners 4, battle lines 4, skirmish lines 4; no toast, no bell entry, never the pausing intro modal (a DSCS
   battle shows the banner only). Two co-located encounters double all of it. **A single summary per cluster needs:** the
   cluster id from #638, the banner after the cluster's LAST `battle:resolved` (dedupe in `_battleQueue`), one Dziennik
   line with the skirmish note folded in. Step: CV-6b (on CV-3a's cluster id); the skirmish fold alone is a small i18n step.
3. **"Enemy detected" once per ship — #640** (outside pure VFX — sized only; the owner decides the scope). Three
   producers, all per ship or per pair:
   - observatory first sighting → popup "⚔ ENEMY UNIT DETECTED" / "⚠ UNIDENTIFIED CONTACT" with pause, ONE PER SHIP,
     appended straight to `document.body` — not queued, and each dismiss emits `time:resume` while the others are still
     open [INF] — plus a Dziennik line "niezidentyfikowany kontakt" (`ObservatorySystem.js:676-697` → `GameScene:3084-3192`).
     Measured headless: one 10v10 inside a player colony's detection range → 10 popups and 10 lines in the same tick. (In
     the GATE-S4 fixture the stager's clear spot lay outside colony range → 0; the owner's save evidently did not.)
   - `vessel:proximityEnter` → "Kontakt sensoryczny: wrogi statek X (d AU)" per (player ship × enemy ship) PAIR, 10-game-
     year cooldown per pair (`UIManager:1691-1710`). Live: 130 lines per battle in one tick (10 enemies × 13 player ships
     in sensor range — the 10 test ships and the fixture's 3 home frigates).
   - `intel:vesselContactChanged` → "🔭 Wykryto obcy statek (KONTAKT): X" per enemy (`GameScene:2878-2895`), 10 per
     battle; then "Utracono kontakt" per lost ship (`:2897-2912`), 2–10 per battle.
   Live total over the 4 battles: 520 + 40 + 18 Dziennik lines (587 entries in all — the runtime buffer holds 500 and the
   save keeps 200, `EventLogSystem.js:17-18`, so the whole earlier history was flushed: Finding 173 class); the bell got
   one deduplicated entry. **Smallest change:** an aggregation window per system (e.g. one game tick or ~250 ms real) in
   the three consumers — one popup listing the N new contacts, one line per enemy instead of per pair (or one "N contacts"
   line), one line listing the N identified ships; about three new i18n keys PL + EN and a keeper. Separate small step
   outside CV.
4. **Circles "marking the end of an action" — #641.** They are the wreck explosion rings: `vessel:wrecked`
   (`ThreeRenderer:1356`) → `_spawnExplosion` (`:6533`) — a flat orange `RingGeometry` 1.75b–2.0b with b = max(0.2, size)
   ⇒ 0.35–0.40 WU ≈ 22–25 L (the floor, #619), growing for 800 ms; all at once when the battle ends, because kills only
   materialise in `_finalizeBattle` (#615). Live: the only legacy FX in 4 battles were 55 fireballs + 55 rings, all at
   the battle ends (13 + 13 in one frame); no movement pulses (`:1625-1627`, `_spawnMovementPulse :7331`), and neither the
   HUD alert rings (`HudFocusLayer.js:104, :143`) nor the enemy reticle (`_syncEnemyAlertMarkers :7883`) appeared.
   **Fix — CV-5:** layered explosion sized from the ship, at the killing impact (CV-4 ledger), no flat ring. Earlier
   stop-gap if wanted: no ring under `cvFxEngine` (one line; the owner's call).
5. **Engagement ring — #642.** Fixed radius `ENGAGEMENT_RING.RADIUS` 0.285 WU = 0.026 AU (`VesselFxLogic.js:109`) around
   the encounter point (`planEngagementMarkers :80`; drawn by `_tickEngagementMarkers :7189` / `_upsertEngagementMarker
   :7156`, called at `ThreeRenderer:4214`), while the 10v10 line-up stands 0.06–0.114 AU (0.66–1.25 WU) from the centre ⇒
   every ship is outside it. **Retire in CV-3a under `cvStage`** (the stage marks the battle itself): gate
   `_tickEngagementMarkers` on the flag; `combat_ring_subtle_smoke`, `combat_marker_life_smoke` and
   `combat_view_scope_smoke` T6e pin the OFF path and stay valid; the code goes in CV-Z.
6. **Watch / zoom aims below the ships — #643.** Not the 0.3 vs 0 height: the drawn ships sit at y 0.3 and only the
   first auto-focus frame aims at y 0 (`ThreeRenderer:1577`), corrected the next frame. The cause is the composition
   shift: `watchTargetAt` / `fitWatchFrame` (`CombatWatchLogic.js:121, :170`) move the orbit target DOWN along the
   camera's up axis so the ships render above the combat card, and the wheel is a pure dolly toward that target
   (`ThreeCameraController.wheelZoom :186`). Watch re-fits every frame but always aims at the target computed for the FIT
   distance (`_updateWatchCamera :7027` → `focusOnSmooth(fit.target…)` `:7047`), also after the wheel has changed the
   distance (`w.fitDist = false`, `:7036`). Measured (1584×805,
   φ 63°): auto-focus at 6 WU — target y −0.997, the ships' screen centroid at y 218 against the frame centre 403; Watch
   fit at 1.816 WU — target y −0.227, 20 / 20 on screen; Watch after zooming to 0.605 WU — target unchanged, 0 / 20 ships
   on screen. **Fix — CV-3a** (the stage owns where the battle is drawn): pivot on the drawn battle centre at ship height
   and compose with a screen-space offset (`camera.setViewOffset` or equivalent), so the wheel converges on the ships;
   minimal alternative — recompute `watchTargetAt` at the current distance every frame in Watch, as auto-focus already
   does (`:7108`).
7. **Frame hitches — #644.** The owner's mean of 22.85 fps (43.8 ms) with p50 16.7 / p95 19.7 ms means at most 15 of 300
   frames held ≈ 8.3 s together — gaps of seconds, not 30–100 ms hitches. Live (RTX 3070, no DevTools, 65 s, 4 battles,
   3 938 frames): p50 16.6, p95 18.9, p99 20.3, mean 16.72, max 107.8 ms; 3 frames > 50 ms. The long frames: staging —
   107.8 ms (+3 programs, +4 geometries, +13 textures: first upload of the hull models and textures) and 43.8 ms (+2
   programs); first salvo — 37.7 ms (+2 programs: the FX engine compiles lazily); end of battle 1 — 99.9 ms (+25
   geometries, +1 program: 13 explosions, each a new sphere + ring geometry; end of battle 4: 30.7 ms, +17 geometries);
   one unlabelled 63.2 ms (battle 2, 1 s after play — GC or main-thread work); two long tasks of 98 / 94 ms (staging,
   battle end). The owner's multi-second gaps were not reproduced; the likely cause is a suspended `requestAnimationFrame`
   (window covered, tab hidden, DevTools undocked over the game), and the old `fxStats` derived fps from the mean, so one
   gap dominated. **Instrument** (the only code of this diagnosis, `fc7334d`): `fxStats()` now also reports the mean and max frame,
   the count over 50 ms and the five longest frames with time and label (bus events since the previous frame + new
   programs / geometries / textures). **Fixes:** prewarm the FX engine programs when the scene is built (CV-2b); pooled
   explosions (CV-5); optional hull model / texture prewarm before a battle (CV-1b / CV-2b); the owner re-measures with
   the game window in front — an unlabelled entry of seconds = suspended rAF, not the game.
8. **Found while measuring — #645.** The `ProximitySystem` self-heal (`:272-281`) re-emits `vessel:combatRangeEnter` on
   every pass for ANY pair within combat range of which neither ship is in an encounter — same-faction pairs included,
   which DSCS rejects at once (`DSCS:142`, `VesselCombatSystem:125`) — and `_tick` runs twice per game tick
   (`VesselManager:2052, :2073`). Measured headless: a parked group of 5 own ships 0.03 AU apart (no enemy, no battle) →
   20 emits per tick (10 pairs × 2 passes), 12 000 in 10 s; live 36 439 during the 4 battles (mostly the survivors standing
   together afterwards). AI guard fleets orbiting a capital do the same [INF]. **Fix:** skip the self-heal / emit for
   `sameFaction` pairs (and pairs DSCS cannot start). Separate small step outside CV (mechanics hygiene, its own keeper).

### CV-2b — presets, light pool, cue bus, audio attach (flag `cvPresets`)

| | |
|---|---|
| **Files** | NEW `src/data/CombatFxPresets.js`, `src/data/CombatCueData.js`, `LightPool.js`, `QualityPreset.js` (detect, localStorage, auto-throttle) · `AudioSystem.attach()` + `_onCombatCue` · `GameScene` calls attach after `EventBus.clear()` · ☰ "Graphics" row · i18n PL + EN |
| **Keepers (logic)** | presets ordered (Low ≤ Medium ≤ High for every budget); degradation never removes shots; cue table covers every (kind, weapon / size) the engine emits and resolves to `null` today; after a simulated game start (`EventBus.clear()` + `attach()`) the cue listener is subscribed exactly once and receives a cue (§3.1-5); localStorage wrapper tolerant of throws |
| **Owner looks at** | switches High / Medium / Low during a 10v10 — fps and look; Low stays readable (all shots visible) |

### CV-3a — the battle stage (flag `cvStage`)

| | |
|---|---|
| **Files** | NEW `BattleStageLogic.js`, `SemanticZoomLogic.js` · `ThreeRenderer` single write path `_stagePlace`, ten reads → `getVesselWorldPosition`, `stageWorldOf` export · body shell (#626) · click inversion at `GameScene.js:6436, :6343, :6073` · HUD radar ring hidden while staged |
| **Keepers (logic)** | (b) the renderer never writes logical positions — source tripwire over `ThreeRenderer.js` and `src/renderer/combat/*` (no assignment to a vessel's `position`), plus execution of the pure modules on frozen vessel objects; **every pair of combatants band-consistent after the guard** (§3.1-2: apparent band of the drawn gap == band of the logical gap, random + recorded 10v10 configurations, zero mis-banded pairs; a control configuration mis-bands under the bare radial law, so the guard is proven necessary); stage law monotonic, continuous, `G(d) ≤ d`; inverse round-trip; blend monotonic in `px_L`; shell never inside the body |
| **Owner looks at** | zooms into a 10v10: ships gather; near zoom gaps ~3–4 / 7–9 / 12–15 L; picking, labels, brackets follow; a right-click move inside the battle goes under the cursor; zoom out → true positions |

### CV-3b — choreography (flag `cvChoreo`)

| | |
|---|---|
| **Files** | NEW `ChoreographyLogic.js` · glue in `_stagePlace` (offset, quaternion, engine) · posture from `fleetSystem` / `movementOrder` / retreat markers · sprites recreated mid-battle take their heading from choreography (#622) |
| **Keepers (logic)** | (e) same inputs ⇒ same pose, other encounter ⇒ other phases; D-CV-6 band invariant over sampled time on random configurations; envelope bound per class; (d) frozen clock ⇒ frozen pose |
| **Owner looks at** | frigates strafe, destroyers arc, battleships turn broadside; ships face targets, engines lit, vertical spread; kite backs off, hold stays steady, retreating ships turn away |

### CV-4 — weapon language and the ledger (flag `cvWeapons`; split 4a / 4b if needed)

| | |
|---|---|
| **Files** | `DeepSpaceCombatSystem.js` emit (FX-only fields, D-CV-8) · NEW `CombatLedgerLogic.js` · engine emitters: laser charge + beam, kinetic flash + tracer + sparks, missile salvo; misses fly past; (4b) shield bubble ripple, armor sparks / scorch · presented HP feeds the (legacy) bars under the flag · cues at fire / impact |
| **Keepers (logic)** | (a) results identical ON / OFF **and** `round.events`, DSCS `serialize()` and the battle record byte-identical; ledger: presented HP after the last impact = logical round-end, kill time = killing impact, every event scheduled exactly once, side A before side B, deterministic; (c) hidden endpoints produce no shots |
| **Owner looks at** | laser charge → beam, kinetic flash → tracer → sparks, missile arcs; misses fly past; HP drops at impact; shields ripple where hit |

### CV-5 — damage states, explosions, lights, wrecks (flag `cvDamage`)

| | |
|---|---|
| **Files** | engine composites, `LightPool` use, damage-state emitters, burn-out term + drift, explosion size from the ship (#619), dedupe with `vessel:wrecked` (#615), wreck look held, wreck glow on rebuild (#620) |
| **Keepers (logic)** | exactly one kill presentation per vessel across `roundFx` kill + `vessel:wrecked`; damage-state function ordered smoke ⊂ fire ⊂ sputter; light pool never over its count; wreck drift deterministic and bounded; pause freezes |
| **Owner looks at** | a battleship dies: smoke → fire → sputter → layered explosion lighting its neighbours → a burning wreck drifting and cooling |

### CV-6a — tactical layer and semantic zoom (flag `cvTactical`)

| | |
|---|---|
| **Files** | NEW `HudCombatLayer.js`, `HudCombatLogic.js` (icons, vectors, fire lines, bands, micro bars, engagement frame) · `px_L` shared with the stage · fog audit #633 |
| **Keepers (logic)** | (c) fog gating of icons / lines / bars matches `isEndpointVisibleInCombat`; band functions monotonic; the HUD key changes on every ledger event (no idle stall) |
| **Owner looks at** | far = holo language, near = cinema, the hand-over smooth in both directions, on 5 themes |

### CV-6b — combat strip replaces the card (flag `cvStrip`)

| | |
|---|---|
| **Files** | NEW `CombatStrip.js` (+ logic) with `getPanelRect()`, `MapInsets` (#629), Watch / Director chips; `combatFxVisible` / `battleAutoFocus` exposed or retired (#630); under the flag no card, no 3D HP bars, no ring mesh, no hit glow |
| **Keepers (logic)** | strip layout math (fits, insets, safe rect); Watch emits `camera:watchBattle` with today's payload; i18n |
| **Owner looks at** | the strip at 1600×1041 on 5 themes; Watch works; nothing overlaps |

### CV-7 — director camera and 9:16 (flag `cvDirector`)

| | |
|---|---|
| **Files** | NEW `CameraDirectorLogic.js` · glue reusing `fitWatchFrame` with a 9:16 safe rect · hit shake · presentation time warp (D-CV-24) · 9:16 overlay toggle |
| **Keepers (logic)** | (e) shot schedule deterministic; any camera input disengages; warp bounded (lag ≤ 1 round, recovered); (d) pause freezes the director |
| **Owner looks at** | a directed 10v10; takes control back with the mouse; frames a 9:16 reel |

### CV-8a — orbital battles on the stage (flag `cvOrbital`)

| | |
|---|---|
| **Files** | EAH + `WarSystem.recordBattle` pass the sibling `fx` key to the emit · NEW `OrbitalReplayLogic.js` · planet stage (attacker arc, defender shell, batteries) · wreck look held until the replay kill · in-view gate (#628) · skirmish source tag (#632) · probe for a double resolution (#635) |
| **Keepers (logic)** | (a) `result` and the battle record JSON identical ON / OFF (`fx` only on the event); replay deterministic per `battleId`; presented losses = logical losses at the end; every `fx` id exists |
| **Owner looks at** | an attack on a colony plays as a fight around the planet; the banner follows |

### CV-8b — retire the burst, BattleView3D and the intro modal (T4 method)

| | |
|---|---|
| **Files** | remove `BattleView3D.js`, the intro flow of `BattleIntroModal.js` (banner may stay), `_onBattleResolvedFx` / `_spawnBattleBurst` / the `'burst'` marker, `suspend` / `resume` if unused, the localStorage preference; re-aim the keepers listed in Q3; lower the `check-i18n` baseline; close `deferred-live-gates.md` ENTRY 4 |
| **Keepers (logic)** | absence pins (no `BattleView3D` import, no burst producer); the outcome stays visible after the replay (strip result row + `log.battleLine` in the Dziennik, §3.1-6); Finding 157 re-check — auto-slow classifies the player side with `isPlayerParticipant` on every orbital path; T4 frame proof |
| **Owner looks at** | a Path A battle in view → the stage replay, then the outcome on the strip and in the Dziennik; out of view → the banner |

### CV-Z — flags permanent ON, OFF paths removed (T4 method)

Legacy combat FX kinds, the card, 3D HP bars, the ring mesh and hit glow removed; keepers pinning legacy drawing
constants retired (`combat_hp_bar` T4-T6, `combat_ring_subtle`, `combat_fx_pace` T5, `combat_card_fit`,
`combat_watch_frame` T10 / T12d-e, `hud_ship_marker` M0e); hygiene #636.

---

## §5 Findings register (#612 onward)

Status: 🔴 defect with a measured gameplay consequence now · 🟠 defect / latent defect the arc must close or route around
· ⚪ observation, hygiene or coupling · ✅ closed. "Step" = where the arc meets it.

| # | | Finding | Evidence | Step |
|---|---|---|---|---|
| **612** | ✅ | **Renderer randomness advances the game's `Math.random`.** `generateUUID` draws 4× per THREE object; `ThreeRenderer.js` calls `Math.random` 12 more times; one hit shot of today's FX ≈ 32–44 draws inside the DSCS tick. The stream places orbit slots that write logical positions, arrival angles, invasion hexes, ground combat, intel noise ⇒ any change in renderer allocations (incl. `fcCombatFx` ON vs OFF today) shifts the world | `three.core.js:312-317` (callers `:1945, :2071, :7274, :9218, :10607`); `ThreeRenderer.js:1370, :1400-1401, :2976, :4799-4853, :5880-5886, :6624-6747`; `OrbitalSpaceSystem.js:273-292` → `VesselManager.js:2600-2616`; `VesselManager.js:3098`; `InvasionSystem.js:635`; `CombatSystem.js:341, :409`; `IntelSystem.js:372` | **CV-0b ✅ (`aeff511`)** — private `generateUUID` generator + `RendererRng` for the 40 visual calls; game-state calls untouched; keeper `cv_renderer_rng_smoke` 62 / 0 (fail-first 58 / 4); owner's check PASS (`rngWatch`: 48 game draws, 0 from the visual layer) |
| **613** | 🟠 | **The AudioSystem is deaf in the game scene.** Constructor subscriptions wiped by `EventBus.clear()` at game start; instance reused without re-attach; ☰ music / SFX toggles emit into nothing. Static trace — live check `KOSMOS.eventBus.listeners.get('music:toggle')?.length` | `main.js:37`; `AudioSystem.js:58-100`; `GameScene.js:197, :284`; `BottomBar.js:321, :326`; contrast `DebugLog.js:206-213` | CV-2b (cue listener); toggles = D-CV-19 (b) follow-up |
| **614** | 🟠 | **HP drops before the hit is drawn.** Damage applied in the round, `roundFx` emitted after; 3D bars and the card read `vesselStates` every frame ⇒ bars and log move 150–430 ms before the flash at R = 400 | `DSCS:681-715, :721-740`; `ThreeRenderer.js:6752-6789` → `VesselFxLogic.js:151-167`; `CombatHUD.js:443-461, :509-540` | CV-4 |
| **615** | 🟠 | **Kills are invisible until the battle ends.** Wrecks only in `_finalizeBattle`; a dead ship keeps its live sprite and an empty bar; every casualty and every surviving loser explodes in one frame (mechanics untouched; Finding 460 family) | `DSCS:1097-1114, :1447`; `ThreeRenderer.js:1341-1348` | CV-4 / CV-5 (presentation) |
| **616** | ✅ | **Combat FX animate through pause** (absolute `performance.now`) and expire unseen while the main loop is suspended | `ThreeRenderer.js:4115-4117, :4194, :6393, :6412` | **CV-2a ✅** — presentation clock under `cvFxEngine` (default ON since the owner's check; `cv_fx_engine_smoke` T1–T2, live pause check); the OFF path keeps the old clock until CV-Z |
| **617** | ✅ | **FX cap shared and lossy**: 120 slots shared with pulses / pings; drop-oldest discards delayed effects not yet visible; ~30 hits fill it (4 meshes per hit) | `CombatFxConfig.js:26`; `ThreeRenderer.js:6385-6387, :7175, :7305` | **CV-2a ✅** — combat shots use the engine's own pools (beam 1024 · tracer 1024 · spark 8192; `cvFxEngine` default ON), a new shot always gets a slot (`cv_fx_engine_smoke` T4–T5); the shared 120-slot cap stays for non-combat FX and on the OFF path until CV-Z |
| **618** | ⚪ | **Only the fireball blooms**; the explosion ring (0.77 × 0.8) and the wreck glow (0.49) stay under threshold 1.0 although their comments say otherwise; tracers 0.27–0.61; ship emissive ≤ 0.78 linear | `ThreeRenderer.js:416, :6518, :1385-1386`; CDN UnrealBloomPass high-pass | CV-2a — under `cvFxEngine` beam / tracer / flash cores are HDR above the threshold (seen glowing on the RTX 3070); explosion ring and wreck glow → CV-5 |
| **619** | ⚪ | **Floors fix effect sizes**: explosion `Math.max(0.2, …)` ⇒ fireball 5 L, ring 25 L; exhaust floors ⇒ every plume 0.03 × 0.024 WU (1.9 L); the flicker scales plume thickness, not length | `ThreeRenderer.js:6498, :4716-4717, :4740, :6478-6492` | CV-1a (exhaust) / CV-5 (explosion) |
| **620** | 🟠 | **Enemy tint and wreck glow are invisible on 24 of 27 models** — `emissiveColor` multiplies an emissive map that is black on all six warships (max 12–29/255); a wreck rebuilt after load / system switch gets `0x110000` | `three.module.js:348`; `ThreeRenderer.js:4782, :4791, :1387-1388`; §1 Q6 Table B | CV-1a / CV-5 |
| **621** | 🟠 | **`nonwarp_large_science` flies stern-first**: 26/27 models have the bow at local −X, this one +X; the README says +X (wrong); the heading comment says +X (wrong); the exhaust code is right | silhouettes in the audit scratchpad; `README_modele_statkow.md:14-15`; `ThreeRenderer.js:4706-4707, :4715, :4759-4760` | CV-1a (hardpoints frame + README) |
| **622** | ⚪ | **Heading defects**: orbit heading `θ + π` turns the bow against the orbital motion (maths verified, not seen live); combat free-floaters are never rotated; a sprite recreated mid-battle gets yaw 0 | `ThreeRenderer.js:5107-5110, :6677-6711, :1761-1770, :4751-4761`; `OrbitalSpaceSystem.js:158, :211-213` | CV-1a (orbit) / CV-3b (combat) |
| **623** | ⚪ | **Duplicate GLBs** load and upload twice and look identical in different roles (`default = cargo3d`, `nonwarp_large_cargo = nonwarp_medium_cargo`, `warp_frigate = warp_large_science`); `cargo3d.glb` and `research1.glb` have no code reference | SHA-256 (audit); `VesselModelResolver.js` | owner's new models; CV-Z hygiene |
| **624** | ⚪ | **Material sharing**: player ships use the template materials ⇒ the maintenance tint greys every player ship of the same file [INF]; the wreck handler replaces enemy clones without disposing them [INF] | `ThreeRenderer.js:4767-4794, :5492-5528, :1381, :1397` | CV-1a |
| **625** | ⚪ | **Swallowed ReferenceError**: `entry` declared in a block at `:4828`, used at `:4837 / :4849` for wrecks with `dockedAt` ⇒ throws inside the GLB `.then`, caught as "GLB load failed (retry)" | `ThreeRenderer.js:4828-4868` (verified by reading) | CV-1a |
| **626** | 🟠 | **A pinned enemy without an orbit never moves on screen** while its logical position snaps to the body centre — `_freezeAsStationary` sets `dockedAt` but nothing assigns an orbit | `DSCS:1309-1312`; `OrbitalSpaceSystem.js:62-70`; `ThreeRenderer.js:5088-5089, :5419-5435`; `VesselManager.js:2702-2707` (static trace, not run) | CV-3a (shell) + live check |
| **627** | ⚪ | **Wreck drawn ≠ logical**: DSCS wrecks' logical position is the battle-start midpoint; deep-space wrecks never enter `moving`, so the sprite stays where the ship died until recreated, then jumps; orbiters go to the graveyard orbit (Finding 460 family) | `DSCS:1055, :1101, :1112`; `VesselManager.js:2625`; `ThreeRenderer.js:4855-4861`; `OrbitalSpaceSystem.js:97-104` | CV-5 (presentation rule) |
| **628** | 🟠 | **The orbital burst ignores the viewed system and galaxy mode** — no `isEngagementInView` (unlike the round FX) ⇒ a battle elsewhere draws at planet-local coordinates in the viewed system (Finding 453 family) | `ThreeRenderer.js:6531, :6549-6575` | CV-8a / CV-8b |
| **629** | ⚪ | **The combat card ignores `MapInsets`** (≈ 12 px overlap with the bottom strip without the Dock); the Watch top margin uses 46 while the map top inset is 28 | `CombatHUD.js:150-162`; `MapInsets.js:28, :41`; `CombatWatchLogic.js:97-110` | CV-6b |
| **630** | ⚪ | **Console-only switches**: `uiPrefs.combatFxVisible` and `battleAutoFocus` are read, never written | `ThreeRenderer.js:1546, :6528, :6551` | CV-6b |
| **631** | ⚪ | **Doctrine barely exists in deep-space mechanics**: DSCS never reads it; kite only moves the MOS band; hold_position does not hold; retreat_at_50 is checked once per 0.5 civ-years (≈ 14 % of maximal battles). Outside CV (F1) — a mechanics question for the owner | `DSCS:553-584`; `MovementOrderSystem.js:1385, :1391-1392`; `FleetSystem.js:478-486, :751` | candidate future MECHANICS arc — owner decides later (§3.1-7); CV-3b posture only |
| **632** | ⚪ | **EAH ordering and scope**: emits before applying wrecks; wrecks a retreating side anyway; `_wreckPlayerVesselsInSystem` uses `systemId ?? 'sys_home'` ⇒ a ship in warp transit is wrecked by a lost home battle it never defended (Finding 151 class); the no-war skirmish is tagged `source: 'dscs'` | `EnemyAttackHandler.js:228-301, :406`; `WarSystem.js:815`; `GameScene.js:2763` | mechanics outside CV; CV-8a relies on the emit order |
| **633** | ⚪ | **Possible fog leak**: the rumor-ghost override applies only to `in_transit`; orbiting enemies get their live position written back at physics cadence | `ThreeRenderer.js:5601-5603, :7682-7683` (static, not run) | CV-6a (fog audit) |
| **634** | ✅ | **No reproducible battle stager**: Combat Sandbox is not deterministic (global `Math.random` system generation); no helper places N ships of a loadout at a point; `DirectorRecall` recalls idle debug raiders on the first tick; `teleportVessel` never sets `systemId` | `CombatSandbox.js:145`; `SystemGenerator.js:689-690`; `DirectorRecall.js:96-121`; `GameScene.js:852-866` | **CV-2a ✅** — `KOSMOS.debug.cvBattle` (`src/debug/CvBattleStager.js`): viewed system, clear spot, pause, encounter before the first tick, fixed `seedBase`, engage orders; same seed = same battle (`cv_fx_results_smoke` S1–S6) |
| **635** | ⚪ | **Possible double resolution of one raid** — DSCS on approach and EAH on arrival (DSCS does not exclude ships orbiting a planet) | `DSCS:202-254`; `EnemyAttackHandler.js:41-71` (inference, not run) | CV-8a probe |
| **636** | ⚪ | **Hygiene bundle**: dead `_resolveFxEndpoint`; `entry._orbiting` written never read and `_calcVisualOrbit*` uncalled; FX kind `trail` without producer; hit-glow disposal frees the shared Sprite geometry (re-upload churn); BattleView3D's unused EventBus import and its own weapon-colour copy; `resolveBattle`'s `Date.now()` seed fallback; `round.year` mixes display and civ years; the CLAUDE.md M2a note lists `resolveDeepSpaceBattle` under `KOSMOS.debug` | `ThreeRenderer.js:6359-6372, :5282, :5329, :6447, :6408`; `BattleView3D.js:19, :30-37`; `BattleSystem.js:108`; `DSCS:617` | CV-2a — under `cvFxEngine` the hit glow is a pooled spark (no per-shot disposal); the legacy churn stays on the OFF path until CV-Z |
| **637** | ⚪ | **Below 10 fps the presentation clock runs slower than real time.** The 100 ms step cap (no jump after a stalled loop) also clips every frame of a steadily slow machine: at 2.3 fps (SwiftShader) an 8 s battle advanced 1.5 s of presentation time, so effects live longer in real time and trail the rounds. Irrelevant at ≥ 10 fps (the RTX 3070 runs 60). Matters for CV-4's lag budget (D-CV-9, ≤ 1 round) and CV-2b's Low preset: either cap only true gaps (e.g. > 1 s) or let the ledger re-sync to the round anchor (`PresentationClock.anchor`) | `src/renderer/combat/PresentationClock.js` (`PRESENTATION_DT_MAX_MS`); live probe CV-2a | CV-4 / CV-2b |
| **638** | ⚪ | **One battle, several encounters.** DSCS never merges encounters; under player intent (an `engage` order on the other ship of the trigger pair) an encounter starts with that pair only and the rest join one by one ⇒ normal play produces co-located encounters, each with its own ring, card and result (measured: 5v5 with a target per ship → two concurrent encounters 0.15 AU apart; one target → two sequential, 2 then 4). One `cvBattle` 10v10 = one encounter (12 seeds headless, 4 live); the `_n` id suffix is a 0.01-year stamp collision, not a fragment | `DSCS:186-188, :229-236, :241, :1506-1514`; probes §4 CV-2a findings 1 | **CV-3a** — presentation battle = cluster of co-located encounters (one stage, one ring / strip, one result); DSCS untouched |
| **639** | 🟠 | **The result is told three times.** Banner with pause + Dziennik battle line + Dziennik skirmish line (every no-war battle) per encounter, plus auto-slow; co-located encounters multiply it (live: 4 battles → 4 banners, 4 battle lines, 4 skirmish lines; no toast, no bell) | `GameScene:2789, :2867`; `BattleIntroModal.js:215`; `UIManager:1829-1831`; `WarSystem:446` | **CV-6b** on the CV-3a cluster id — one banner after the cluster's last `battle:resolved`, one Dziennik line (skirmish note folded in) |
| **640** | 🔴 | **Contact flood — per ship and per pair.** Observatory first sighting: one pausing popup per ship, not queued (each dismiss resumes the game while the rest stay open [INF]) — 10 popups + 10 lines for one 10v10 in colony range (headless); proximity contact: one line per player × enemy pair — 130 per battle live (13 × 10); contact identified / lost: 10 + 2–10 per battle. 587 Dziennik entries in 4 battles vs a 500-entry runtime buffer (200 saved) ⇒ the earlier history was flushed (Finding 173 class) | `ObservatorySystem.js:676-697` → `GameScene:3084-3192`; `UIManager:1691-1710`; `GameScene:2878-2895, :2897-2912`; `EventLogSystem.js:17-18` | separate small step **outside CV** (owner decides scope): aggregation window per system — one popup / one line listing N contacts; ~3 i18n keys PL + EN + keeper |
| **641** | ⚪ | **"End-of-action circles" are the wreck explosion rings** — flat orange `RingGeometry` 0.35–0.40 WU (22–25 L, the #619 floor), 800 ms, all at once when the battle ends (#615); live the only legacy FX in 4 battles: 55 fireballs + 55 rings at the battle ends | `ThreeRenderer:1356, :6533` | **CV-5** (layered explosion sized from the ship, at the killing impact); optional stop-gap: no ring under `cvFxEngine` |
| **642** | ⚪ | **The engagement ring is smaller than the battle** — 0.285 WU (0.026 AU) around the encounter point while a 10v10 line-up stands 0.06–0.114 AU from the centre ⇒ every ship outside it | `VesselFxLogic.js:80, :109`; `ThreeRenderer:4214, :7156, :7189` | **CV-3a** — retired under `cvStage` (gate `_tickEngagementMarkers`; `combat_ring_subtle` / `combat_marker_life` / `combat_view_scope` T6e pin the OFF path); code removed in CV-Z |
| **643** | 🟠 | **Watch zoom dives under the battle.** The composition shift (orbit target moved down so ships render above the card) is computed for the fit distance and kept after the wheel changes the distance; the wheel dollies toward that target ⇒ Watch at 0.605 WU shows 0 / 20 ships (fit at 1.816 WU: 20 / 20, target y −0.227; auto-focus at 6 WU: target y −0.997, ships at screen y 218 vs centre 403). Not the 0.3 vs 0 height (only the first auto-focus frame aims at y 0) | `CombatWatchLogic.js:121, :170`; `ThreeRenderer:1577, :7027-7050, :7108`; `ThreeCameraController.js:186` | **CV-3a** — pivot on the drawn battle centre at ship height + screen-space composition offset; minimal: recompute `watchTargetAt` at the current distance in Watch |
| **644** | ⚪ | **Frame hitches are first-use costs; the owner's low mean is a few multi-second gaps.** Live 65 s / 4 battles: p50 16.6, p95 18.9, max 107.8 ms, 3 frames > 50 ms — staging (first hull model / texture upload, +13 textures), first salvo (lazy FX programs, +2), battle end (+25 geometries: one sphere + ring per explosion). The owner's 22.85 fps mean at p95 19.7 needs ≈ 8 s in ≤ 15 frames ⇒ suspended rAF (window covered / DevTools), not reproduced | live probe §4 CV-2a findings 7; instrument `ThreeRenderer.cvFxStats` / `_fxStatsBegin` / `_fxStatsEnd` | instrument delivered (`fc7334d` — `fxStats` max, mean, five longest frames with labels); prewarm FX programs **CV-2b**; pooled explosions **CV-5**; model prewarm CV-1b / CV-2b |
| **645** | 🟠 | **`combatRangeEnter` flood from the proximity self-heal** — any pair within combat range with no encounter (same faction included, rejected by DSCS at once) is re-emitted on every pass, twice per tick: a parked group of 5 own ships → 20 emits per tick, 12 000 in 10 s (headless); 36 439 during the 4 live battles; AI guard fleets on a capital orbit do the same [INF] | `ProximitySystem.js:272-281, :295`; `VesselManager.js:2052, :2073`; `DSCS:142`; `VesselCombatSystem.js:125` | separate small step **outside CV** — skip the self-heal / emit for `sameFaction` pairs (and pairs DSCS cannot start); own keeper |

Cross-references (existing numbers, not refiled): **165** (orbital defence has no rounds — CV-8a gives it a presentation),
**161** / **163** (banner pause and Polish literals — CV-8b), **453** (cross-system combat drawing — #628 is its orbital
twin), **456** (EAH real-time batching), **460** (wrecks teleported to the midpoint — #615 / #627 present around it).
