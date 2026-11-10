# COMBAT_VISUALS_PLAN — one battle scene with semantic zoom (arc CV)

> **Status: Phase A (CV-0) — read-only audit + plan, SIGNED by the owner 2026-11-08 (§3 column "Signed"; conditions in
> §3.1; the cut reordered for an early visual payoff, §4). Phase A commits: `c855298 docs(CV A)` (plan) and
> `c0700de docs(CV sign)` (signatures). CV-0b ✅ DONE 2026-11-08 (`aeff511`, owner's check PASS, §4 CV-0b — delivered).
> CV-2a ✅ DONE 2026-11-08 (`230fd3c`, owner's check PASS, `cvFxEngine` default ON with the owner's tuning; §4 CV-2a — delivered).
> CV-3a split by the owner into CV-3a1 / CV-3a2 (§3.2-2). CV-3a1 ✅ DONE 2026-11-08 (`d78e8f6`, `cvStage` default ON — §4 CV-3a1 — delivered;
> owner's look 1–9 PASS). CV-3a2 split again by the owner (§3.2-6): CV-3a2 ✅ DONE 2026-11-08 (`1dfe5ae`, under `cvStage`; #646 (b)
> everywhere — §4 CV-3a2 — delivered; owner's live check 1–6 PASS; read-only diagnosis of the CV-3a1 look → #650–#658).
> Owner's decisions 10–14 (§3.2). CV-3a3 (extended — stage completeness: #654 stager mirror, #652 the stable stage, #653
> stop-gaps, D-CV-4 body shell #626) ✅ DONE 2026-11-09 (`0490ea5`, under `cvStage` — §4 CV-3a3 — delivered; owner's re-check
> PASS 2026-11-09). Owner's decisions 15–23 (§3.2). CV-6b (item 0 — a compact stage at every zoom, §3.2-20 — and the
> stutter fix, §3.2-22) ✅ DONE 2026-11-09 (`5f99a1a`, under `cvStage` — §4 CV-6b — delivered; owner's check PASS
> 2026-11-10). CV-6b2 (the combat strip, flag `cvStrip` default ON; #629, #630, #639) ✅ DONE 2026-11-10 (`de682b4` — §4 CV-6b2
> — delivered; owner's check PASS, steps 1–7, the strip at the top accepted). Owner's decisions 24–25 (§3.2: #676 accepted as
> designed; #675 → a grace window, scheduled with #640 outside CV). Next: CV-1a → CV-3b (§4 order).**
> Anchor HEAD `95f7ab7` (ARKUSZ GALAXY closed). Phase A implemented nothing — no `src/` edits, no keepers, no smokes, no
> probes in the browser. The only repo files written by this phase are this plan and one pointer line in `CLAUDE.md`,
> committed as `docs(CV A)`; that commit is the anchor of CV-0b.
> Evidence: six parallel read-only source audits (render seam · FX engine and P2 UI · DSCS core and clocks · orbital
> battles and audio · ship models · harness and perf) plus node measurements of the 27 ship GLBs (own GLB parser, PNG and
> baseline-JPEG decoders, software silhouettes), all run in a scratchpad outside the repo. Every claim carries `path:line`
> at `95f7ab7`; **[INF]** = inference from source, not run in the game.
> Units: **WU** = Three.js world unit (1 AU = 11 WU); **L** = one frigate length = `VESSEL_TARGET_SIZE.frigate` 0.016 WU;
> **R** = `combatRoundMs` (real milliseconds per watched round, default 1000 since 2026-11-08 — §3.2; 400 before).
> **Next free finding number: 677** (this plan files **#612–#676**; #637 from CV-2a; #638–#645 from the CV-2a owner's check;
> #646 from the CV-3a split; #647–#649 from CV-3a1; #650–#658 from the CV-3a2 diagnosis of the CV-3a1 look; #659–#661 from
> CV-3a3; #662–#667 from the CV-3a3 owner's check; #668 from validating the owner's decision on #662; #669–#674 from CV-6b's
> stutter measurement and item 0; #675–#676 from CV-6b2).

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

### §3.2 Owner's decisions after the sign-off

1. **2026-11-08 — watched round pace `combatRoundMs` defaults to 1000 ms (was 400, POLISH CP2).** Basis: the owner's live
   check with the `cvBattle` stager at 400 / 800 / 1000 ms per round — 400 and 800 too fast, 1000 right. Change: the
   default of the tuning key in `StrikesBackData` (range 50–1000 unchanged); the renderer's glide fallback follows it.
   The outcome does not depend on the pace (POLISH P1, CP1) — measured on the stager 10v10 (seed 1, headless world with the
   real `TimeSystem`): at 400 and 1000 ms the same signature `[[20,164,128,"B",null,7,3]]`, the same trace of all 20 rounds
   (events, hp / shield, logical positions), the same 12 game draws and orbit slots; real battle time 7 616 → 19 040 ms
   (keeper `cv_fx_results_smoke` A4; `combat_pace_smoke` T2 / T10 on its 3v1 scene). The tuning table stores only changed
   values (setting the default removes the entry), so every save without its own `combatRoundMs` entry reads 1000; a save
   with an explicit value (e.g. 800 set in the console) keeps it until `KOSMOS.debug.sbReset('combatRoundMs')`
   (`combat_pace_smoke` T10i). The numbers in §3.1-3 are rules in R and stay; their "at R = 400" example reads at the
   new default as: extra lag 0.52 s = 0.52 R, cap 1.5 R = 1.5 s.
2. **2026-11-08 — CV-3a split** (the whole step plus the findings of the CV-2a check did not fit one session):
   **CV-3a1 "you see the stage"** — commit 1 (round pace), the stage logic (law, lens, pair guard, deconfliction lattice,
   band check, uniform fallback), semantic zoom, the encounter cluster as the stage unit (#638), the renderer seam, the HUD
   radar ring hidden on the stage, the camera (#643), #642, #641, `fxStats` window-gap labels, battles with a body-pinned
   participant temporarily unstaged; **CV-3a2 "the stage answers"** — click inversion (D-CV-5) with the click plane at
   ship height (#646), the body shell (D-CV-4, #626), one card row and one result banner per cluster (#638). The name
   CV-3b stays with choreography. Fallback agreed: if CV-3a1 got too heavy, #643 moves to CV-3a2 (not needed).
3. **2026-11-08 — "one result" (#638) = one banner per cluster**; the Dziennik keeps one battle line per encounter until
   CV-6b (#639).
4. **2026-11-08 — everything of CV-3a under the flag `cvStage`, #641 included**; the flag ON right after the commit,
   switched off from the console (`KOSMOS.debug.cvStage(0)`).
5. **2026-11-08 — #646 variant (b):** in CV-3a2 the click plane goes to ship height for EVERY empty-space click, not only
   inside a stage; CV-3a1 does not touch it.
6. **2026-11-08 — CV-3a2 split again** (the CV-3a2 scope plus the read-only diagnosis of the CV-3a1 look did not fit one
   session): **CV-3a2** = #646 (b), click inversion (D-CV-5), one card row and one result banner per cluster (#638), #648 (b)
   and the diagnosis (#650–#658); **CV-3a3** = the body shell (D-CV-4, #626) with a stager option for a battle at a planet.
   Reason for the cut: the shell is the only item with open geometric questions (every body-pinned participant stands at the
   body — logically all in the laser band, ≤ 3.6 L — while drawn planets are 4–38 L in radius; the bearing "toward the
   opposing side" is undefined when both sides are pinned) and it needs new stager tooling to be seen at all.
7. **2026-11-08 — #648 → (b):** Watch dives into cinema by itself, no wheel needed.
8. **2026-11-08 — #647 → (a):** the per-frame stage solve stays; revisit in CV-2b. (The CV-3a2 diagnosis found that the same
   per-frame solve is also the cause of the "swimming" ships — #652 — whose natural place is CV-3b, before choreography.)
9. **2026-11-08 — #649 → (a):** a dense stack of 5+ ships at a band edge keeps the uniform fallback scale.
10. **2026-11-08 — #654 → stager variant (1):** mirrored loadouts — side B takes side A's per-index loadout (offset 0); "Engage"
    stays for side A only, as in real play. The DSCS asymmetries (side A fires first, player-only techs, AI-only auto-retreat) are
    mechanics — untouched.
11. **2026-11-08 — #653 → stop-gap under `cvStage` until CV-4 / CV-5 / CV-6a:** hide the 3D enemy reticle on staged ships; cap the
    wreck explosion fireball to ship scale (≈ 1–1.5 L instead of ≥ 5 L); reduce the shield ring and impact flash growth / size
    (tuning defaults, no pins). Final looks stay in CV-4b / CV-5 / CV-6a.
12. **2026-11-08 — #658 → accepted for now;** revisit in CV-7 (director camera).
13. **2026-11-08 — #652 moves from CV-3b into CV-3a3** (a stage-solver issue, not choreography). CV-3b = choreography only.
14. **2026-11-08 — #640 (contact flood) → a separate small step OUTSIDE CV right after CV-3a3;** not in the CV-3a3 session.
    *Superseded in its position by 15 — #640 now follows CV-1c.*
15. **2026-11-09 — the cut is reordered: CV-3a3 → CV-6b (combat strip) → CV-1a → CV-1b → CV-1c → #640 (small step OUTSIDE CV)
    → CV-3b**; the rest keeps its order (CV-2b → CV-4 → CV-5 → CV-6a → CV-7 → CV-8a → CV-8b → CV-Z). Reason: the combat card
    covers half the screen or more and hampers every later check; the owner's six new warship models are ready for CV-1. With CV-1a
    before CV-3b, CV-3b needs no bow shim (the `legacyBowSign` shim of §4 "Dependencies on CV-1" is dropped — CV-3b faces targets
    through CV-1a's hardpoints frame, canonical bow +Z).
16. **2026-11-09 — owner's requirements for CV-6b (combat strip replacing the card).** Today's card plus the rounds log cover half the
    screen or more and the style does not match the game UI. The strip must be much smaller, in the game's HUD / label idiom (dark
    bar, theme font, colours from palette roles — like the T5 / T6 panels), collapsible to ONE line of essentials (sides, ship counts
    alive / total, HP totals, round / time, Watch) and expandable on demand to detail (ship list, round log); losing information in
    the collapsed state is acceptable.
    **Dependency on CV-6a (checked 2026-11-09, read-only):** one — the card row "no 3D HP bars" (§4 CV-6b) assumes CV-6a's HUD micro
    bars; removing the 3D bars (`_syncCombatHpBars`, POLISH P2b) before CV-6a would leave the map without per-ship HP. **Minimal
    shim:** under `cvStrip` only the card and its round log go; the 3D HP bars stay until CV-6a retires them. Everything else the strip
    needs exists: palette roles (`HudPalette`, H0), the theme font, `MapInsets` (#629); HP totals, counts and the round log read the
    encounter (`vesselStates`, `timeline`) exactly like today's card (the presented-HP ledger arrives with CV-4 and is a drop-in
    source); `getPanelRect()` stays (D-CV-21 — its three consumers: the Watch safe rect `ThreeRenderer:7357, :7687` and the ship-panel
    anchor obstacle `ShipPanelAnchorLogic`, Finding 545). Not CV-6a but later: the Director chip waits for CV-7 (omitted until then);
    the orbital result row (§3.1-6) belongs to CV-8a / CV-8b.
17. **2026-11-09 — #662 → (a):** no body snap when an empty-space click resolves inside a battle stage — the ship flies to the
    point (± 2.5 L from the cursor) and stays there without orbit; everywhere else the snap rule stays as today. Narrowly at the
    click / order-spec seam (the issuing UI passes an explicit "no snap" when the click resolved inside a staged cluster), under
    `cvStage`, flag OFF = today. The body-pinned "both sides at the body" case (points under the group lie logically next to the
    planet) is accepted.
18. **2026-11-09 — #663 → a separate small MECHANICS step OUTSIDE CV, right after #640** (the rendezvous point on the far side of
    the orbit / behind the star). Not fixed in CV; the finding carries the measurements and a proposed fix shape.
19. **2026-11-09 — #666 → (b):** no 3D reticle on battle participants at any zoom while their cluster is in view; enemies stay
    marked by the HUD (red rhombs / the alert stack).
20. **2026-11-09 — D-CV-3 amended: a compact stage at EVERY zoom.** Owner's observation: at far zoom (`fregataPx` < 10) the stage
    un-blends to true scale, so a battle looks like ships on different orbits far apart and beams from distant ships cross the
    planet — a geometry very different from the compact cinema. Change: while a battle is in view its participants stay on the
    stage at every camera distance — the semantic-zoom blend no longer returns them to true scale. The far "tactical" look comes
    from CV-6a's layer (icons, fire lines), not from true-scale geometry. Done in CV-6b (item 0): the blend has a floor
    (`stageBlendFloored`, knob `cvTuning.STAGE_BLEND_FLOOR` — 1 by default = this decision; 0 = the CV-3a1 curve, for comparison
    only); `px_L` stays the zoom measure (readouts, CV-6a's icon hand-over). Joining and leaving the stage keep their 500 ms of
    presentation time (rule 4 — a battle that starts in a pause shows its true-scale positions until the game runs).
21. **2026-11-09 — the cut is reordered again: CV-6b → CV-1a → CV-3b → CV-1b → CV-1c → #640 (small step OUTSIDE CV) → #663
    (MECHANICS, OUTSIDE CV)**; the rest keeps its order (CV-2b → CV-4 → CV-5 → CV-6a → CV-7 → CV-8a → CV-8b → CV-Z). Reason: after
    the #652 fix battles look static (the earlier "circling" was the solver artefact); choreography needs only the canonical bow
    frame from CV-1a, so it moves right after CV-1a (no bow shim).
22. **2026-11-09 — owner's report, PRIORITY: battles stutter badly** (a round with shots — ships jitter; a fairly smooth round; jitter
    again; a visible stop-and-go at round boundaries). To be fixed right after item 0 (decision 20), before the strip and before
    more effects land: measure first (live, `cvBattle()` 10v10, cinema and mid zoom), then fix under `cvStage` — one continuous
    motion timeline across rounds (velocity-continuous, no easing to zero at boundaries, no mid-round re-solve from combat events,
    pause freezes everything). If item 0 + this fix fill the session, the strip becomes **CV-6b2** (it did — §4 CV-6b).
23. **2026-11-10 — #630 → as proposed:** `uiPrefs.combatFxVisible` is retired (it hid every combat FX and the orbital
    burst — against the arc's goal; performance gets its own knob in CV-2b's presets; the burst dies in CV-8b) and
    `uiPrefs.battleAutoFocus` becomes a ☰ toggle (a real player preference — the camera is not taken; CV-7's director inherits
    it). Done in CV-6b2, with the strip. Same day: the owner's check of CV-6b PASS (steps 1–8).
24. **2026-11-10 — #676 → accepted as designed:** the strip is in `isOverUI` like every other panel — the camera drag, the
    wheel and the map hover stop under it (the card never blocked them); the card on the `cvStrip` OFF path keeps the old
    behaviour until CV-Z removes it. Same day: the owner's check of CV-6b2 PASS (steps 1–7; the strip at the top accepted).
25. **2026-11-10 — #675 → yes to a short grace window before the result is announced (≈ 1–2 rounds)**: a battle's banner,
    battle line and skirmish line wait that long after its last `battle:resolved`, and an encounter that starts within it with
    ships of the same battle (the mop-up) folds into the same announcement — **but not now**: scheduled together with #640 in
    the small step OUTSIDE CV, whose rule is one message per event (#640 — contacts; #675 — the battle result).

---

## §4 The cut (each step sized for ONE session; split where marked)

Order (owner, 2026-11-08 — early visual payoff): **CV-0b → CV-2a → CV-3a → CV-3b → CV-1a → CV-1b → CV-1c → CV-2b →
CV-4 (a/b) → CV-5 → CV-6a → CV-6b → CV-7 → CV-8a → CV-8b → CV-Z** (≈ 16–17 sessions). CV-0b stays first: every later
step changes how many THREE objects exist. The step sections below keep their numbers; read them in this order.

**Reordered 2026-11-09 (owner, §3.2-15, §3.2-18):** … CV-3a3 → **CV-6b → CV-1a → CV-1b → CV-1c → #640 (outside CV) → #663 (MECHANICS, outside CV) → CV-3b** → CV-2b →
CV-4 (a/b) → CV-5 → CV-6a → CV-7 → CV-8a → CV-8b → CV-Z. CV-6b keeps the 3D HP bars until CV-6a (§3.2-16 shim); CV-3b runs after
CV-1a, so the bow shim below is no longer needed.

**Reordered again 2026-11-09 (owner, §3.2-21):** … CV-3a3 → **CV-6b → CV-1a → CV-3b → CV-1b → CV-1c → #640 (outside CV) → #663
(MECHANICS, outside CV)** → CV-2b → CV-4 (a/b) → CV-5 → CV-6a → CV-7 → CV-8a → CV-8b → CV-Z — choreography right after CV-1a's
canonical bow frame.

**CV-6b split 2026-11-09 (§3.2-22):** item 0 + the stutter fix filled the session ⇒ CV-6b = those two (delivered), the strip
= **CV-6b2**, next: … CV-3a3 → CV-6b → **CV-6b2** → CV-1a → CV-3b → CV-1b → CV-1c → #640 → #663 → CV-2b → …

**2026-11-10 (§3.2-25):** #675 joins #640 — ONE small step outside CV (one message per event); otherwise the order stands:
… CV-6b2 → CV-1a → CV-3b → CV-1b → CV-1c → **#640 + #675 (outside CV)** → #663 (MECHANICS, outside CV) → CV-2b → …

**Dependencies on CV-1 and the shims** (CV-2a, CV-3a and CV-3b now run before CV-1a):
- CV-2a (FX engine, stager) — none: endpoints are drawn positions; muzzle hardpoints arrive with CV-4.
- CV-3a (stage) — none: the ship length L comes from `VESSEL_TARGET_SIZE` (`VesselModelResolver.js:60-66`).
- CV-3b (choreography) — **the bow axis** (*dropped by the 2026-11-09 reorder: CV-1a now runs first and gives the hardpoints
  frame; kept for reference*): facing a target needs each model's bow, and models are not rotated today.
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

### CV-3a — the battle stage (flag `cvStage`) — split into CV-3a1 / CV-3a2 (§3.2-2)

| | |
|---|---|
| **Files** | NEW `BattleStageLogic.js`, `SemanticZoomLogic.js` · `ThreeRenderer` single write path `_stagePlace`, ten reads → `getVesselWorldPosition`, `stageWorldOf` export · body shell (#626) · click inversion at `GameScene.js:6436, :6343, :6073` · HUD radar ring hidden while staged |
| **Keepers (logic)** | (b) the renderer never writes logical positions — source tripwire over `ThreeRenderer.js` and `src/renderer/combat/*` (no assignment to a vessel's `position`), plus execution of the pure modules on frozen vessel objects; **every pair of combatants band-consistent after the guard** (§3.1-2: apparent band of the drawn gap == band of the logical gap, random + recorded 10v10 configurations, zero mis-banded pairs; a control configuration mis-bands under the bare radial law, so the guard is proven necessary); stage law monotonic, continuous, `G(d) ≤ d`; inverse round-trip; blend monotonic in `px_L`; shell never inside the body |
| **Owner looks at** | zooms into a 10v10: ships gather; near zoom gaps ~3–4 / 7–9 / 12–15 L; picking, labels, brackets follow; a right-click move inside the battle goes under the cursor; zoom out → true positions |

#### CV-3a1 — ✅ delivered 2026-11-08 (`d78e8f6`; "you see the stage"; `cvStage` default ON; owner's look pending)

**What changed.**
- Commit 1 (`b987691`, before the rest): `combatRoundMs` default 1000 ms — §3.2-1.
- NEW `src/renderer/combat/BattleStageLogic.js` (pure, zero imports): law `G(d) = min(d, K·d^α)` (D-CV-2), radial map
  `g(r) = G(2r) / 2` with a **lens** — the law compresses everywhere (G(d) < d from ≈ 6·10⁻⁵ WU), so outside the stage the
  map returns to true scale over a transition band (r_in → 3 r_in; without it the inverse of a click 1 WU from a battle
  would land ≈ 2.7 AU away); inverses of G, of the radial map and of the drawn radius at any blend; **pair guard**
  (§3.1-2): every pair gets its band's hard interval (apparent edges G(range), 4 % margin) with the deconfliction floor
  (1.6 L same side, 1.5 L any pair) and a target G(d); Gauss–Seidel passes (40 with pull + up to 96 hard-only), the best of
  seed / pull / hard kept (fewest mis-banded pairs — the relaxation must not spoil a seed that was already consistent),
  O(N²) band check, uniform similarity fallback (scale from the median pair — exact pair order, windows approximate);
  **deconfliction lattice** seed — a dense group (pairs whose staged gap would fall under the floor) starts on an
  icosahedral lattice around its radial seed (13 ships within 3.2 L, inside the laser band 3.64 L); **priority pairs** —
  attacker → target of the latest round get the full pull to G(d) (12 extra passes), the rest is the guard's compromise;
  warm start from the previous update; the solution is re-centred on the centroid without the stage, so the drawn battle
  centre stands still at any blend (the wheel is a focus pull). `clusterEncounters` — one battle on screen = co-located
  encounters (same system, centres ≤ 0.30 AU apart, single link; id = smallest encounter id) (#638).
- **Measured deviation from the plan — the stage is 3D.** In the plane a dense group cannot stay in the laser band with the
  1.6 L floor (10 ships at ≥ 1.6 L need a diameter > 3.64 L): the planar guard fell back on 70–96 % of random 10v10
  configurations. The seed gets a deterministic vertical spread (± 0.5 L) and the guard works on 3D gaps (F4 "not a flat
  y = 0.3 plane", D-CV-6): fallback 0–2 % (300 + 300 random), 0 on the stager layout and on every recorded round;
  vertical offsets mean ≈ 1 L, max ≈ 5–6 L.
- NEW `src/renderer/combat/SemanticZoomLogic.js` (pure): frigate length on screen → `stageBlend = smoothstep(4, 24, px_L)`
  (D-CV-3); 24 px ≈ 0.667 WU at 1041 px height.
- `ThreeRenderer` (all under `FEATURES.cvStage`, read every frame): `_unstageVessels` at the start of the frame (a staged
  sprite returns to its base position unless something wrote a new base between frames — orbit / movement events write it
  directly), `_tickBattleStage` after the glide (also in pause — the wheel changes the blend; joining and leaving the stage
  run on the presentation clock: 500 ms in, 500 ms back to true scale after the battle, frozen in pause), ONE write path
  `_stagePlace` (base + (stage − base) × blend × join), `_spriteBase` (the glide starts from the base, not from the drawn
  position — `_placeFreeVessel`), never in galaxy mode or for another system, clusters with a participant orbiting a body
  unstaged until the shell (D-CV-4 (b), temporary), a re-solve only when base positions or priority pairs change.
  Everything that reads the sprite follows by construction — FX endpoints, HUD labels, brackets, ship markers, routes,
  picking, the Watch frame (measured live: a click on the drawn position selects the ship whose unstaged position is
  280 px away). `getVesselStageBlend` → `HudRadarLayer` hides the radar ring of a staged ship (its radius is a logical
  distance). `stageInfo()` — clusters, blend, frigate px, guard result, drawn attacker → target gaps in L next to the
  logical AU.
- **#643 (camera):** Watch and the battle auto-focus pivot on the centroid of the DRAWN participants of the cluster at ship
  height (`_stageWatchFit`); the Watch distance is fitted on the positions WITHOUT the stage (`fitWatchFrameOffset`), so
  Watch shows the whole battle in true geometry and the wheel gives the stage (see #648); the composition above the combat
  card is a screen-space offset (`viewOffsetFrame` → `camera.setViewOffset`, eased, cleared after Watch, the observatory
  preview's own offset untouched). One battle = cluster: Watch frames every encounter of the cluster and moves to the next
  active encounter of the cluster when its own ends (#638).
- **#642:** the DSCS engagement ring hidden under the flag at the call site (`_hideEncounterRings` after
  `_tickEngagementMarkers` — the method body and its OFF-path pins untouched); the orbital burst marker unchanged (CV-8).
- **#641:** the wreck explosion keeps the fireball, drops the flat orange ring under the flag (the rest of the explosion —
  CV-5).
- `fxStats`: frame gaps labelled **"ukryte okno"** (tab hidden during the gap or now) / **"brak fokusu"** (blur or focus
  during the gap, or unfocused through a gap > 50 ms) — window listeners only while measuring; the report counts window
  gaps and the stage (frames staged, frames on the fallback, clusters, mis-banded pairs max).
- Console: `KOSMOS.debug.cvStage(1 | 0)`, `KOSMOS.debug.stageInfo()`; the stager reports `cvStage`.
- `GameConfig.FEATURES.cvStage: true` — default ON right after the commit (§3.2-4).

**Keepers.** NEW `cv_stage_logic_smoke` **35 / 0** — L1 law (≤ d, monotonic, continuous at the crossover) · L2 inverses
and the lens · L3 semantic zoom · L4 every pair band-consistent after the guard: stager layout and a control configuration
(KONTROLA: the bare radial law mis-bands 16 / 1 pairs), 150 + 150 random 10v10 (uniform and fleet formations) — every
solution consistent (law or fallback), fallback < 5 % (measured 0 / 0) · L5 recorded rounds of a real DSCS battle (stager
seed 1, headless world with the real `TimeSystem`): zero mis-banded, zero fallback, priority pairs on the law (median
drawn / G(d): laser 1.006, kinetic 0.991, missile 1.012; KONTROLA without priority: laser 0.841) · L6 deconfliction ≥ 1.6 L
(1 % tolerance — the relaxation leaves 1.5955 L on the stager layout) incl. a 10-stack; KONTROLA: without the lattice the
stack coincides · L7 clusters · L8 determinism, (b) frozen inputs · L9 #643 criterion headless: true-scale fit 2.705 WU →
wheel to 1/3 → 20 / 20 in frame (KONTROLA: the old framing 20 → 0 / 20). Fail-first on `b987691` **2 / 31** (the greens:
the battle-played control and the old-framing control). NEW `cv_stage_render_smoke` **28 / 0** — the real renderer
methods on real three r171: OFF untouched bit for bit; ON every drawn pair band-consistent, zero writes on vessels and
their positions (Proxy trap) while the stage runs; frame-start restore and new bases kept; `_spriteBase`; (d) joining
frozen in pause, blend follows the camera; release over 500 ms of presentation time, frozen in pause; galaxy; body-pinned;
#642 / #641 (KONTROLA: today's ring OFF); #643 view offset set / eased out / observatory untouched; #638 cluster frame and
Watch successor; glide from the base; source — tripwire (b) with a KONTROLA (an injected write is caught), loop order,
call-site gates. Fail-first on `b987691` **1 / 19** (the green: the OFF-path guard). `cv_fx_results_smoke` **34 / 0**
(+A1e: mode ON draws the stage at blend 1 for 1 230 frames; A2 ON == OFF == no renderer now covers both CV layers;
fail-first 32 / 2). `cv_renderer_rng_smoke` sets `cvStage` OFF inside its scripted battle (it pins today's explosion).
Sweep **376 / 376 OK, 0 FAIL** (28 advisory, pre-existing) · `check-i18n` PASS · no new i18n keys (console only) · save v101
untouched.

**Measured in the real game** (isolated headless Chrome, GATE-S4 fixture, window 1600×1041 CSS, RTX 3070, `cvBattle()`
10v10 seed 1): auto-focus at 6 WU — 20 / 20 in frame, blend 0 (frigate 2.7 px); Watch — true-scale fit 2.80 WU (blend
0.02), 20 / 20 above the card; **wheel to 1/3 → 20 / 20 in frame, 20 above the card**, blend 0.99, frigate 22.9 px
(KONTROLA `cvStage` OFF: wheel to 1/3 → **0 / 20**, target 0.12 WU under the battle — #643 as measured in CV-2a); kinetic
attacker → target gaps 6.6–7.6 L for logical 0.122–0.128 AU (law 7.25 L); pause + wheel to 1/8 — rounds 7 → 7, 20 / 20 in
frame; zoom out to 176 WU — blend 0, true positions; a click on a drawn ship selects it; 60 fps, frame p50 / p95
16.7 / 16.8 ms with the stage ON and OFF, JS loop p50 1.8 vs 1.0 ms (#647); fallback 0 / 300 frames; zero console errors.

#### CV-3a2 — ✅ delivered 2026-11-08 (`1dfe5ae`; "the stage answers"; under `cvStage`, #646 (b) everywhere)

**What changed.**
- **#646 (b)** — `RaycasterHelper.castRay` intersects the click ray with the plane at SHIP HEIGHT (`SHIP_PLANE_Y` 0.3,
  `clickPlaneY`) for EVERY empty-space click, inside and outside a stage; only when the camera is below that plane (a body
  close-up: target at y 0, camera ~0.14 above it) does it keep today's orbit plane y = 0 — otherwise a downward ray would never
  meet the ship plane in front of the camera. Not under the flag (owner's decision §3.2-5).
- **D-CV-5 click inversion** — one place: `GameScene._resolveClickTarget` maps the click point through the inverse of the
  stage field (`ThreeRenderer.stageLogicalOf(systemId, wx, wz)`; forward `stageWorldOf` for the HUD), so the target-point
  picker, the patrol waypoints, the right-click order and the coordinate tooltip all get the logical point that is DRAWN under
  the cursor; bodies and POIs (drawn at true scale) keep their point. The field (`BattleStageLogic.fieldMap` /
  `stagePointLogical` / `stagePointDrawn` / `pickStageField`) is the cluster's radial map — the law, or the uniform fallback
  scale — with the lens (identity beyond LENS_OUT·rIn), at the cluster's blend × the mean join of its ships; no field outside the
  flag, in galaxy mode, for another system, before the join (pause from the start) and for a body-pinned cluster (until
  CV-3a3). Ships lie on the field only approximately (the pair guard moves them by fractions of a band), so a click next to a
  drawn ship lands next to its logical position, not on it.
- **#638 rest** — clusters now come from LOGICAL participant positions (`encounterClusters`, `encounterCentre`: alive
  participants, else all, else the encounter point) — ONE source for the stage (renderer), the combat card and the banner.
  NEW `src/ui/BattleClusterLogic.js` (pure): `combatCardRows` (one row per cluster; a merged view — sides, ship states, the
  log aligned to the end, the longest round, the smallest encounter id; the input list untouched when nothing merges),
  `clusterPeerIds`, `clusterBannerStep` (groups waiting for the rest of their cluster; a group whose awaited encounter ended
  another way is flushed at the next step — nothing hangs), `mergeClusterBattles` (verdict from the count of encounters won /
  lost by the player, tie → fewer losses, tie → draw; turns = the longest; losses = sums). `CombatHUD._cardRows` under the flag
  (merged labels from i18n `battle.player` / the empire name); `GameScene._clusterBattleBanners` on path B (deep space) under
  the flag — the Dziennik keeps one line per encounter (CV-6b, #639).
- **#648 (b)** — `_stageWatchFit` fits the Watch distance on the stage solution × each ship's join (`_stageMarks.w`); before
  the join the fit is the true-scale one, so Watch pressed in pause before the battle has started its join does not dive onto
  unstaged ships (measured on the first try: a fit on the full stage dove to 0.4 WU with 8 / 20 ships in the window). Fitting on
  the DRAWN positions does not dive at all — measured: it stalls at ≈ 2.6 WU with blend ~3 % (the semantic-zoom step is flat at
  4 px), keeper A7b.
- **Stager** — `cvBattle({ split })`: every pair A_i–B_i gets "Engage" before the encounter forms and starts its own encounter
  (the DSCS player-intent path); seeds `cvSeedBase(seed) + k` — several encounters in one place, for the owner's look at one row
  / one banner.

**Keepers.** NEW `cv_stage_answers_smoke` **22 / 0** — A1 #646 (b) on `castRay` from source with real three r171 (a click at the
Watch frame lands at y 0.3 and a ship sent there is drawn under the cursor, 3·10⁻¹² px; KONTROLA, pure geometry: the old plane
y = 0 lands 0.0535 AU further along the centre ray — the plan's ≈ 0.054 — and that ship would be drawn 238 px from the cursor;
camera below the ship plane → y 0) · A2 field round trip drawn → logical → drawn at blends 0–1, law and fallback (270 points,
4·10⁻¹⁵ WU), lens identity, field choice · A3 sources (the one click place, `castRay` with `clickPlaneY`) · A4 clusters and card
(3 encounters → 2 rows, merged view; KONTROLA nothing merges → the same list; the real `CombatHUD.draw` — one Watch under the flag,
two without) · A5 banner (one after the second encounter of a cluster, merged result; KONTROLA two clusters → two banners; no
hanging group; source) · A6 merged view / result write nothing (frozen inputs) · A7 #648 (b) (premise: the full-stage fit gives
0.400 WU at blend 1 with the whole battle in frame; KONTROLA: the drawn fit stalls at 2.630 WU, blend 0.030; source). Fail-first on
`cec2b5e` **4 / 9** (greens: the two controls, the premise, the invariant "all clicks through `_resolveClickTarget`").
`cv_stage_render_smoke` **32 / 0** (+R15 field on the real renderer methods: a drawn point between ships → logical (0.080 WU
away) → drawn to 1e-9; far / other system / galaxy / flag OFF / pause before the join / body-pinned — unchanged; +R16 Watch: true
scale 2.657 WU before the join, cinema 0.400 WU after; fail-first 27 / 3). `cv_fx_results_smoke` **36 / 0** (+S7 split: 3
encounters of a pair each, one cluster, consecutive seeds; KONTROLA without split — one encounter). `combat_card_fit_smoke` T4 and
`ship_panel_outliner_smoke` S11f place their second battle 2 AU away — they pin a card with TWO battles, and under the cluster rule
two encounters in one place are one battle (one row). Sweep **377 / 377 OK, 0 FAIL** (28 advisory, pre-existing) · `check-i18n`
PASS (no new keys) · save v101 untouched.

**Measured in the real game** (isolated headless Chrome, GATE-S4 fixture, 1600×1041 CSS, RTX 3070, `cvStage` ON): Watch while
running — 5.14 → 0.40 WU in ≈ 0.66 s, blend 0 → 1, all 20 ships in frame from 0.58 s (during the dive as few as 6 / 20 inside
the safe rect and 18 / 20 in the window for ≈ 0.3 s — #658); a click between staged ships at cinema and at 0.25 WU — cursor →
logical → drawn → screen = 0 px, the inversion moves the point 0.15–1.35 WU from the raw ship-plane point; outside a battle
(#646 (b)) the target lies under the cursor at every zoom, while a ship sent to the old y = 0 point would be drawn 22–48 px from
the cursor at ~8 WU and 118–436 px at the cinema frame; two co-located encounters (player-intent pairs) — one card row and one
stage cluster, no banner after the first `forceFinalize`, one banner after the second; `cvBattle({nA: 4, nB: 4, split: 1})` with
real resolution — 4 encounters, one row, one merged banner for the cluster ("Tur: 16 · Straty: 2 / 4") plus one short banner for a
re-engaged retreating AI ship after the cluster ended (#657); zero exceptions (the console holds only the 31 + 1 known building
PNG 404s, O16).

**Owner's live check — PASS 2026-11-08 (steps 1–6).**

**Read-only diagnosis of the CV-3a1 look (owner's points 1–6)** — findings **#650–#658** in §5, each with its recommended step.
Probes (scratchpad, outside the repo): the stager battle in a headless node world with the real DSCS / MOS / `TimeSystem` (seeds
1–6; variants: engage orders as the stager / none / both sides; fire order B first — the source method with two calls swapped,
KONTROLA: the rebuilt unswapped method = today bit for bit) and live runs in the real game (timing seeds 1–3; frame samples of
drawn / base / logical positions at cinema and 1/3 zoom; the scene and HUD inventory and screenshots at hits and at the end).

#### CV-3a2 — the scope as signed (kept for reference)

| | |
|---|---|
| **Scope (owner, §3.2-2…5)** | **D-CV-5 click inversion** — empty-space clicks inside a staged battle invert through the stage (`drawnRadiusInverse` with the cluster's rIn, centre and current blend — `BattleStageLogic` already has the functions and the lens) at the three sites: 3D target-point picker (`GameScene.js:6083`, `_finalizeTargetPointPicker :5685`), patrol waypoints (`:6358`), right-click target (`:6451`); a renderer export `stageLogicalOf(systemId, wx, wz)` (+ `stageWorldOf` for the HUD). **#646 (b)** — the click ray meets the plane at SHIP HEIGHT (y = 0.3) for EVERY empty-space click (`RaycasterHelper.castRay :53`, today y = 0) — inside and outside a stage. **D-CV-4 body shell (#626)** — participants orbiting a body are placed on a presentation shell around the body (floor = body drawn radius + 2 L) at the bearing toward the opposing side's centroid; the temporary rule "cluster with a body-pinned participant = no stage" goes. **#638 rest** — one combat-card row per cluster (one Watch button, sides and log merged; `CombatHUD._drawPanel`, today a row per encounter, `MAX_VISIBLE_ENCOUNTERS` 2) and ONE result banner per cluster, shown after the cluster's last `battle:resolved` (dedupe in `GameScene._battleQueue :2790` / `_tryShowNextBattle :4225`; `BattleIntroModal.showBattleOutcome :215`); the Dziennik keeps a line per encounter until CV-6b (#639) |
| **Keepers (logic)** | click inversion round-trip (drawn → logical → drawn) at blends 0 … 1, a click outside the lens = today's point; the click plane at y = 0.3 (headless ray / plane maths; KONTROLA: today's y = 0 lands ≈ 0.054 AU off at Watch zoom); shell never inside the body, bearing toward the enemy, band consistency kept for body-pinned clusters; card rows = clusters; one banner per cluster (two co-located encounters resolving at different times → one banner after the second; KONTROLA: two clusters → two banners); (a) results unchanged |
| **Owner looks at** | a right-click move between staged ships goes under the cursor (also a plain empty-space click far from any battle, #646 (b)); a battle near a planet — ships on the shell, never inside the planet; two co-located encounters — one card row, one banner |
| **Open options for the owner** | #647 (stage cost), #648 (Watch lands at true scale vs cinema), #649 (stack at a band edge falls back) — §5 |

### CV-3a3 — stage completeness (flag `cvStage`; the body shell split out of CV-3a2 by the owner, §3.2-6; extended by §3.2-10…13)

#### CV-3a3 — ✅ delivered 2026-11-09 (`0490ea5`; under `cvStage`; owner's check 1–4, 6, 7 PASS, 5 FAIL → fixes and owner's decisions 17 / 19 implemented the same day; owner's re-check PASS 2026-11-09)

**What changed.**
- **#654 — stager mirror (§3.2-10).** `cvBattle`: side B takes side A's loadout per index (both from `CV_BATTLE.LOADOUTS[i % n]`,
  offset 0; before, side B was shifted by one index). "Engage" stays for side A only; the DSCS asymmetries are mechanics and
  untouched. In the real game (GATE-S4, 10v10, 19.8 s each): seed 1 defeat (losses 7 / 4), seed 2 defeat (7 / 4), seed 3 victory
  (6 / 6) — before the mirror the owner saw 7 / 3, 7 / 2 and 7 / 4; what still favours side B is the mechanics (side A's "Engage"
  focus, the DSCS order), not the stager. Seed 1 gives the same signature in the game and in the headless world
  (`[[20,168,133,"B",null,7,4]]`, was `[[20,164,128,"B",null,7,3]]`) — the recorded stager battle changed, hence the L5b re-aim
  below.
- **#652 — the stable stage (§3.2-13).** The stage solves ONCE per round per cluster: the key is each encounter's round + the
  member list (+ the shell body), no longer positions (base positions changed on every frame of the 1 000 ms glide, so the
  warm-started guard re-solved per frame and moved ships relative to each other by several L per second). The solver input is the
  LOGICAL positions (where the round's glide ends); the drawn stage offsets — relative to the cluster's origin (the centroid of the
  unstaged ships, or the drawn body centre for a shell) — go LINEARLY from the target displayed in the previous frame to the new
  solution over one round of the presentation clock (pause = pause). A joiner costs one extra solve; a cluster that changes id
  (its lowest encounter ended) inherits the warm start, and every ship starts from the target it was displayed at — no jump.
  Close-up motion is the logic's round-to-round motion, not the solver's; the per-frame solve cost (#647) is gone with it.
- **#653 — stop-gaps under `cvStage` (§3.2-11; tuning defaults, no pins on values).** (a) The 3D enemy reticle fades out with the
  ship's stage weight and is gone from 0.25 of it (`cvTuning.STAGE_RETICLE_FADE_K`); at true scale unchanged. Without the 3D
  reticle the HUD draws its own alert rings the way it already does for any intruder without one (B-2: two thin rings for 1.6 s
  of sim time on a FRESH radar alert, one set per intruder) — the permanent reticle on every enemy is gone (measured live at
  cinema, `cvBattle()` seed 1: 0 reticles and 0 HUD rings over 219 frames; before — 10 reticles on every frame). (b)(c) FX engine
  `update({ stage })`: hit flash 1.2 × model, growth ×1.5 (was 3.0, ×3); shield ring 1.8 × model, growth ×1.25 (was 4.0, ×3) —
  `STAGE_FLASH_K` / `STAGE_FLASH_GROW` / `STAGE_RING_K` / `STAGE_RING_GROW`; the spark shader reads the growth from a uniform
  (`uGrow`; without the stage 1 + 2p to the value). (d) Wreck explosion: the fireball peaks at hull size × `STAGE_FIREBALL_K` 1.5
  (a frigate — radius 1.5 L) with no 0.2 WU floor (was 5 L at the start, 15 L at the peak), no ring (#641). Final looks stay in
  CV-4b / CV-5 / CV-6a.
- **D-CV-4 — the body shell (#626).** A cluster with participants at a body (`dockedAt`) gets a shell body = the body of most of
  them (tie — the smaller id) with its drawn centre and radius (`getBodyWorldInfo`); a body without a drawing — the battle stays
  unstaged as before. `solveStage({ shell })`: the pair guard solves as always (logical positions), then the whole solution is
  translated RIGIDLY so the pinned group stands just beyond the shell (the body's drawn radius + `SHELL_FLOOR_L` 2 L) at the shell
  bearing, at the ship plane (y 0.3, `SHELL_PLANE_Y`); every pair gap is kept, so the band result passes unchanged; a free ship
  still inside the shell would be pushed out radially (`excluded` — 0 in every measured battle). The click field (D-CV-5) is
  centred on the shell group; Watch fits the displayed shell group and dives as on any stage. Ships orbiting the body keep the
  orbit as their base; an enemy pinned WITHOUT an orbit (#626 — logically at the body centre, its sprite used to stay frozen where
  it was pinned) gets a base just beyond the shell at the bearing (`shellBaseAt`, on the deconfliction lattice) and glides there
  from its last sprite position over `JOIN_MS`. The zoom path avoids the body: `_stagePlace` pushes every intermediate position
  out of the shell sphere (an orbiter behind the planet does not fly through it while zooming), and so does the return to true
  scale. Orbit writes between frames (`_tickOrbitingVessels` on `physics:updated`) go through `_setSpriteBase`: a staged ship
  keeps its drawn position and the new base waits in its mark (measured without it: the HUD and the click saw the orbiters
  off-stage on every physics tick — drawn relative speed mean 637 L/s at a median of 1.3 L/s).
- **Stager** — `cvBattle({ atBody })`: `atBody: 1` → the first planet (then moons, planetoids — by id) with no ship within the
  clear radius, `atBody: 'entity_10'` → that body; the player's ships on orbit slots of the body (`OrbitalSpaceSystem.assignOrbit`
  + `getPosition` on the orbit clock), the enemies near it, the encounter pinned the way DSCS pins it (`_freezeAsStationary` —
  enemies `dockedAt`, no orbit); `mixed: 1` → only a minority of side A at the body (`max(1, floor((nA − 1) / 2))`), the enemies
  free, "Engage" for the free side-A ships.
- **Instruments** — `fxStats` counts stage solves (`stage.solves`, `solvesPerSec`); `stageInfo` adds `rozwiazania` (solves since the
  cluster's stage began), `cialo` (the shell body; "(bez rysunku — bez sceny)" for a body without a drawing) and `kierunek` (the
  bearing source).

**Decided in the step — the shell bearing** (the open question of §3.2-6): toward the FREE opposing side when there is one
(`free-opposing`), else toward any free ships (`free`); when everyone is pinned — the side of the PLAYER's ships at true scale
(`player`: the centroid of their logical positions seen from the body centre — independent of the camera and stable, orbits
turn ≈ 0.1 rad/s); when that centroid lies within a quarter of the mean spread from the body centre (ships all around) — toward the
player ship with the lowest id (`player-first`); everyone at the centre — +X (`default`). The group sits at the ship plane, so a
click in it lands on the plane it is drawn on (#646 (b)) and a camera above the orbit plane sees it above the body's limb — on a
small body it floats well above the body (#659).

**Deviations from the plan text.**
1. No fixed points in the guard — the rigid translation keeps every pair gap of the guard's solution (P3: 157 configurations,
   0 differences to 1e-9), which is what fixed points were meant to protect.
2. The shell has no uniform-scale fallback — it would collapse the enemies pinned at the body centre into ONE point (measured:
   10 ships on one spot); the relaxed best arrangement is ranked floor-first instead (fewest pairs under the deconfliction floor,
   then fewest mis-banded pairs — the band-first ranking kept two ships on top of each other, smallest pair 0.06 L on 200
   configurations) and flagged `fallback` without `scale` (#661).
3. A warm-started shell stage runs no pull passes (`SHELL_WARM_PASSES` 0 — priority and hard passes only): pinned ships barely
   move in logic (orbits ≈ 0.01 rad per round), and the pull passes re-arranged the tight group every round — measured 2.0–2.2 L
   per round (median) against 0.03–0.23 L without them. Free-space stages keep the pull passes (their geometry changes every
   round and the owner's windows need the pull).
4. Enemies pinned without an orbit are drawn beyond the shell at every zoom while their battle is staged, true scale included —
   #626 asks exactly for that (no longer frozen where they were pinned).
5. `cv_stage_logic_smoke` L5b re-aimed (the mirror changed the recorded battle): the old ±5 % around the law was a tolerance fitted
   to the old battle (laser median 1.006 → now 0.940 — all laser shots at the stand-off, drawn 2.7–3.5 L, median 3.38 L, inside the
   owner's [3, 4] L window); the criterion is now the owner's F3 windows — every weapon's median ratio inside its window and ≥ 95 %
   of shooter → target pairs inside (96.4 %; KONTROLA without priority pairs 88.1 %). `cv_stage_render_smoke` R8 / R15c — labels
   only ("body without a drawing" instead of "body-pinned").

**Keepers.** NEW `cv_stage_temporal_smoke` **15 / 0** — T1 (654) per-index loadouts equal (10v10, 4v6, a fixed weapon; WITNESS:
loadouts differ between indices) · T2 (652) at most one solve per round per cluster with unchanged membership over 20 rounds
(WITNESS: base positions change on 1 240 / 1 240 frames — the old position key solved per frame) · T3 drawn positions continuous at
60 fps at cinema, no step > ε 0.25 L (KONTROLA: consecutive round solutions differ by more than ε — without the transition a jump)
· T4 (d) pause mid-transition freezes the drawn positions, the offsets and the solve count bit for bit over 60 frames; resume
continues · T5 a joiner — one extra solve, the rest without a jump · T6 a cluster id change — no jump · T7 (b) zero writes on ships
(Proxy trap) · T8 (653) the stop-gaps as a FLAG contract, not values (reticle on a staged ship at cinema — none, at true scale and
with the flag OFF — present; FX engine knobs chosen by `stage`; fireball radius ∝ hull under the flag, today's floor without).
NEW `cv_stage_shell_smoke` **35 / 0** — P1 bearing (free opposing / both pinned → player / spread → lowest id / default) · P2 on
168 random configurations (moon … gas giant, 3+3 … 10+10, both pinned and mixed): no ship inside the shell (KONTROLA: without the
shell 277 ships inside the body), no pair under 1 L (smallest 1.278 L), every solution band-consistent or flagged · P3 rigid
translation · P4 `shellBaseAt` beyond the shell for 25 ships · P5 (652) a warm-started shell stage stands still (median drawn
shift 0.094 L per round; KONTROLA with pull passes 1.548 L) · R1–R9 on the real renderer methods: cinema — every ship outside the
shell, the group on the player's side, bands; R2 zoom 6 → 0.4 WU — every frame outside the shell (KONTROLA: a straight base →
target lerp went 0.207 L inside); R3 mixed → toward the enemy; R4 (626) pinned without an orbit — frozen in a pause from the start,
glides onto the shell without a jump (largest step 1.78 L of 55.5 L), beyond the shell at true scale; R5 the group follows the
moving body; R6 click field round trip at a body battle (KONTROLA: a body without a drawing — no field); R7 Watch — true scale
before the join, cinema 0.400 WU after; R8 sources; R9 orbit writes between frames · S1 `cvBattle({ atBody })` on a headless world
with the real DSCS / MOS / Proximity / OrbitalSpace / `TimeSystem` (orbits, the DSCS pin, one encounter, a body by id; `mixed`;
KONTROLA: plain `cvBattle` — nobody at a body). `cv_fx_results_smoke` **40 / 0** (+A5 body battle: ON (shell) == OFF == no renderer
— signature, every round's trace, game draws (60), orbit slots; witness — ON drew the shell on 845 frames; the keeper's world now
resets the mocked clock and the vessel id counter — #660). `cv_stage_logic_smoke` **35 / 0** (L5b re-aimed), `cv_stage_render_smoke`
**32 / 0** (labels). Fail-first on `457f1f8` (the new keeper files in a detached worktree): temporal **3 / 12** (greens: two
witnesses, method extraction), shell **4 / 23** (greens: the P2b control, the P2d invariant — it holds without a shell too, R4a —
trivial before the shell, the S1d control; fewer asserts because a throwing block degrades to one red), results **38 / 2** (the A5
premise and witness), logic **35 / 0** and render **32 / 0** (the re-aim and the labels hold on both). Sweep **379 / 379 OK, 0 FAIL**
(28 advisory, pre-existing) · `check-i18n` PASS (no new keys) · save v101 untouched.

**Measured in the real game** (isolated headless Chrome on the RTX 3070, GATE-S4 fixture, 1600×1041 CSS, `cvStage` ON; 6 s sampled
at cinema after Watch and `fxStats(300)`; "before" = the same game with the HEAD renderer-side files served by the harness and the
same stager):

| | stage solves / s | JS loop p50 / p95 | drawn ship speed at cinema, centroid removed (mean / median / p95) | logic at true scale (mean) |
|---|---|---|---|---|
| `cvBattle()` 10v10 seed 1 — before | 60.2 (every frame) | 1.9 / 2.7 ms | 14.08 / 10.52 / 34.78 L/s | 2.12 L/s |
| the same — after | 1 (one per round) | 0.8 / 1.2 ms | 0.66 / 0.43 / 2.33 L/s | 2.05 L/s |
| `cvBattle({ atBody: 1 })` — after | 1 | 0.9 / 1.3 ms | 0.17 / 0.08 / 0.51 L/s | 0.40 L/s |
| `cvBattle({ atBody: 1, mixed: 1 })` — after | 1 | 0.8 / 1.2 ms | 0.11 / 0.07 / 0.31 L/s | 0.27 L/s |

60 fps in every run, zero exceptions, the console holds only the 32 known 404s (O16). `atBody: 1` picked `entity_10`, a gas giant
(drawn radius 0.588 WU ≈ 37 L): 10 player orbiters + 10 enemies pinned by DSCS (both sides pinned → bearing `player`), every ship
≥ 5.12 L beyond the shell floor, 0 pushed out, 0 mis-banded, no fallback, click field round trip 2·10⁻¹⁵ WU, Watch 0.40 WU (cinema),
0 enemy reticles at cinema; mixed — 4 player ships at the body, bearing `free-opposing`, margin ≥ 4.51 L. Node, on the recorded
deep battle: drawn per-round motion at full blend median 0.32–0.51 L against 2.9–3.2 L per round of the logic at true scale.

**Owner's check (2026-11-09, live).** PASS: (1) no swimming close up · (2) `stageInfo` — `awaryjna` false, `zlePasma` 0 ·
(3) no reticles in cinema, small flashes / rings, ship-sized explosions · (4) `cvBattle({atBody: 1})` — the group beside the planet,
never inside, Watch dives · (6) mixed — `kierunek` `free-opposing` · (7) F5 restores. **FAIL (5):** in the body battle, an own ship
selected, a right-click on empty space between the ships → "Lecisz tutaj": the target is not under the cursor, the ship goes "as if
through the planet's centre". **Observation:** red enemy reticles visible again in the body battle (owner's `stageInfo` at that
moment: `przyCiele` true, blend 0.019–0.092, `fregataPx` 5.6–7.7 — not cinema).

**Diagnosis of FAIL 5 (2026-11-09, measured in the real game — GATE-S4, RTX 3070, 1600×1041, `cvBattle({ atBody: 1 })` at
HD-4177 j, a gas giant of drawn radius 0.588 WU; the owner's path replayed through the real right-click and menu).** Two causes, one
in each layer, plus a secondary one:
1. **Mechanics (F1) — the move order snaps to the body.** The menu gives "Lecisz tutaj" (`type: 'empty'`), the spec is
   `{ type: 'moveToPoint', targetPoint }` with NO `targetBodyId`; `MovementOrderSystem._issueMoveToPoint` then takes the body nearest
   the point within `VesselManager.SNAP_TO_BODY_AU` = 0.5 AU (`_findBodyNearPoint`). A battle at a planet lies entirely inside that
   radius — the clicked point was 0.02–0.13 AU from the planet (logical, after the stage inverse; 0.066–0.071 AU even without it) —
   so EVERY empty-space click in a body battle becomes "fly to the planet": `mission.targetId` = the planet (3 / 3 runs). The target
   point is then the body intercept (`_interceptBody`, SB39): for a ship slower than the planet and behind it on the orbit, the first
   meeting is on the far side of the orbit — 2 of 3 runs put the target 32.7 AU away, beyond the star (CV-A03 at ≈ 1.2 AU/yr ⇒ ≈ 28
   years; panel "ruch: (222, −1683)" / "(202, −1686)"); the third (CV-A05, 1.54 AU/yr, ahead of the planet) — 0.06 AU, 12 days.
   **Not changed here** (order semantics = mechanics): Finding 662 (variants for the owner) and Finding 663 (the cross-system
   intercept for a ship that is already at the body).
2. **CV — freeing one ship swung the whole shell.** The order takes the ship off its orbit (`dockedAt` null), and the shell bearing
   (`shellBearing`) counted every free ship outside the side with more ships at the body as "the opposing side": in a 10 + 10 battle
   at the body the enemy then has 10 : 9, the freed player ship became `free-opposing` and the bearing jumped to it — the whole group
   rotated around the planet within one round, the transition cut straight through the body (`avoid` pressed the ships onto the
   shell). Measured, freeing the own ship farthest in slot angle from the group: rotation 158° / 161°, ships drawn over the planet's
   disc on 8 of 30 sampled frames, the freed ship down to 0.41 body radii from the centre — "through the planet's centre". The
   `player` / `player-first` source alone could also jump (its centroid was taken over the pinned player ships only). Finding 664 ✅.
3. **CV, secondary — the shell click field used the drawn group as the centre on BOTH sides.** The stage draws a body battle as the
   guard's radial map around the LOGICAL centroid of the inputs (at the body) translated rigidly by the shell shift; the field (D-CV-5)
   inverted the click around the drawn group for the logical side too, so the logical point was off by the shift compressed by the
   law. Measured as agreement between the field and what the stage draws (node, real renderer methods; median over the ships of
   |field(logical) − drawn target|): pinned 6 + 6 at bodies of drawn radius 0.1 / 0.3 / 0.6 — 1.27 / 2.40 / 4.22 L before, 0.81 / 0.91 /
   0.90 L after; free space 1.8 L. A free ship sent to the inverted point lands (median) 3.6 → 2.5 L from the cursor with the
   bearing held (pinned majority, free enemies; free space 3.2 L). Finding 665 ✅.

**Fixes (2026-11-09, under `cvStage`; the snap untouched).**
- `shellBearing` — "the opposing side" = an OUTSIDE force: with one side at the body, the free ships of the other sides (as before);
  with BOTH sides at the body, the free ships of a side whose MAJORITY is free (a ship leaving orbit is not one; when most of a side
  leaves, the group does turn toward them); the `free` fallback only with one side at the body; the `player` source over ALL player
  ships of the battle (pinned and free), so freeing one does not move its centroid. Measured in the game after the fix (two runs):
  rotation 2.4° / 5.1°, `kierunek` unchanged, 0 frames with a ship over the disc, the freed ship ≥ 1.08 body radii from the centre.
- Shifted click field — `applyShell` returns the rigid `shift`; the renderer's field for a shell = the logical centroid of the guard
  (in the offset frame, it follows the body like the targets) + `shift`, radius = the guard's `rIn`; `stagePointDrawn` /
  `stagePointLogical` / `pickStageField` take the optional `shift`: inside r_in full shift (× blend), linear to zero across the lens,
  identity beyond LENS_OUT·r_in as before; the field radius is at least |shift|, so the map stays one-to-one and the inverse is a
  1-D bisection on the logical radius. Free-space clusters unchanged (no shift).
- Reticles (the observation): **by design of the #653 stop-gap, no change.** The 3D reticle fades with the ship's stage weight and is
  gone from 0.25 of it — identical for free and body battles (measured in the game, both kinds, 10 zoom steps: 0 reticles at
  `fregataPx` ≥ 10.6 (blend ≥ 0.25), 10 of 10 below; at the owner's 5.6–7.7 px they show at 63–92 % of their opacity). Finding 666 —
  the owner decides (the tactical layer CV-6a owns enemy marking).

**Keepers.** `cv_stage_shell_smoke` **47 / 0** (was 35): P1e (both sides at the body, the player ship behind the planet freed while
the enemy has the majority 6 : 5 — the bearing stays), P1f (the lowest-id player ship freed — `player-first` stays), P1g KONTROLA
(most of a side left orbit — toward them), P6 (shifted field: round trip to 1e-9 on 600 points incl. |shift| > r_in, identity beyond
the lens, inside r_in = radial map + blend × shift; KONTROLA — without a shift the pre-CV-3a3 inverse), R6c (field ↔ stage agreement
at bodies 0.3 / 0.6 / 1 WU: 0.74 / 0.60 / 0.79 L ≤ the deconfliction floor 1.6 L; KONTROLA R6d — the pre-fix formula computed in the
keeper at 1 WU: 2.49 L), R10 (the player ship behind the planet freed in the renderer: rotation 0.4°, 0 frames over the disc, the
freed ship ≥ 1.30 body radii; witness: the enemy has the majority at the body, the ship 179° from the group). Fail-first on the
pre-fix tree (this session's edits reverse-applied to a copy of the working tree): **41 / 6** — red exactly P1e, P1f, P6c, R6c,
R10b, R10c; P1g, P6d, R6d, R10a green on both. The other CV keepers unchanged (answers 22, render 32, temporal 15, logic 35, results
40, engine 38, rng 62). Sweep **379 / 379 OK, 0 FAIL** (28 advisory, pre-existing) · `check-i18n` PASS (no new keys) · save v101
untouched.

**Owner's decisions 2026-11-09 (§3.2-17…19) — implemented the same day (under `cvStage`).**
- **#662 (a) — a click inside a battle stage is a point.** `GameScene._resolveClickTarget` stamps the target `staged` exactly
  when `ThreeRenderer.stageLogicalOf` answered `staged` (the only stamp in the file; with `cvStage` OFF the stage never answers
  `staged` ⇒ today); the left-click picker passes it with the point (`_finalizeTargetPointPicker({ …gp, staged: true })`). The
  producers add `noBodySnap: true` to a `moveToPoint` built from such a click — `OrderDispatcher.buildOrderSpec` (the ship),
  `RightClickMenu._buildFleetSpec` (the fleet), and the two fleet move pickers (`FleetManagerOverlay._handleFleetMoveToPoint`,
  `FleetCommandPanel._armMovePicker` — the same click seam, an unhardened twin otherwise). The consumers honour it:
  `MovementOrderSystem._issueMoveToPoint` skips `_findBodyNearPoint`, and so does `FleetSystem._bodyGroupArrival` (the fleet's
  arrival sync then treats the order as a point, not a body intercept). Without the flag nothing changes — the spec outside a stage
  is the same key for key. Measured in the game (GATE-S4, `cvBattle({ atBody: 1 })`, the real right-click and menu): "Lecisz
  tutaj" → `mission.targetId` null, the order's `targetPoint` = the clicked point (panel "ruch: (−379, 1871)"), `kierunek`
  unchanged, the ship drawn 0.9–2.4 L from the cursor at the start of its hop. Two consequences, both inherent to (a): the point is
  fixed in space while the planet moves on its orbit, so after arriving the ship separates from the group slowly (on the stage
  ≈ 0.2 L per game day at this gas giant; measured against the world-fixed cursor point 2.4 → 10.4 L over 1.8 game days, most of it
  the group following the body); and in this fixture the player usually loses the 10 + 10 body battle on time-out, and DSCS wrecks
  the losing side's survivors at the end (`_finalizeBattle`, mechanics) — the hop is to be watched during the battle.
- **#666 (b) — no reticle on battle participants.** `_tickBattleStage` collects the participants of every encounter cluster in view
  (`_stageParticipants`, also a cluster at a body without a drawing); `_syncEnemyAlertMarkers` skips them at every zoom. The fade with
  the stage weight stays only for ships leaving the stage after their encounter ended. Measured in the game during the body battle:
  0 reticles at `fregataPx` 40.9 / 15.0 / 9.1 / 6.3 / 4.3 (was 10 below ≈ 10.6 px); the enemies stay marked by the HUD alert stack
  "⚠ ×10" and its red rhomb.
- **#668 ✅ (found while validating #662) — a ship in flight inside a battle was written straight to its true-scale position
  between frames.** The in-flight branch of `_syncVesselPositions` (`vessel:positionUpdate`) set the sprite directly, like the orbit
  write before R9; every reader between that tick and the next frame (the HUD layer's own loop, the click) saw the ship off the stage
  — measured: the ship's drawn position jumped 26–31 L for one to two samples every ≈ 11 s. Now through `_setSpriteBase` (the
  in-flight branch; the no-mission branch stays a direct write — battle participants without a mission are frozen by DSCS as
  `orbiting` and go through `_placeFreeVessel`, and `patrol_render_sync_smoke` T6 pins that branch); outside a stage — the same
  direct write as before. After: 0 jumps over the flight.

**Keepers (second pass).** NEW `cv_stage_no_snap_smoke` **15 / 0** — N1 `buildOrderSpec` (staged → `targetPoint` + `noBodySnap`, no
`targetBodyId`; KONTROLA: unstaged — the spec key for key as before) · N2 the real MOS (a point 0.085 AU from the planet with the
flag → no body, the clicked point; KONTROLA: without the flag → the planet; far from bodies — the same with and without) · N3 the menu,
a ship · N4 the menu, a fleet (both members → the point; the body-intercept sync not used; KONTROLA → the planet) · N5 both fleet move
pickers (KONTROLA → the planet) · N6 `GameScene` source (the only `staged` stamp, from the stage's answer; the picker passes it) ·
N7 the flag contract through the real `_stageFields` / `stageLogicalOf` (ON → a point; OFF → the planet, today).
`cv_stage_temporal_smoke` **17 / 0** — T8a re-aimed deliberately (666 (b)): a participant of a viewed cluster has no reticle at cinema
AND at true scale; KONTROLA: an enemy in view outside the encounter — as before; the flag OFF — present. `cv_stage_shell_smoke`
**51 / 0** — R11 (body battle: 0 reticles at cinema and from afar, also at a body without a drawing; KONTROLA: an enemy outside the
encounter and the flag OFF — present), R9d (the in-flight branch writes through `_setSpriteBase`). The four renderer
harnesses mirror the new constructor field (`_stageParticipants`). Fail-first on a copy of the tree before this pass: no-snap **7 / 8**
(red exactly the eight SEDNO pins), temporal **16 / 1** (T8a), shell **49 / 2** (R9d, R11b); every KONTROLA green on both. Sweep
**380 / 380 OK, 0 FAIL** (28 advisory, pre-existing) · `check-i18n` PASS (no new keys) · save v101 untouched.

**Owner's re-check — PASS 2026-11-09 (every console line validated on the live engine).** (1) `KOSMOS.debug.cvBattle({atBody: 1})`, then
Watch on the card — the dive into cinema; (2) select an own ship, right-click empty space close to it between the ships → "Lecisz
tutaj" — the ship heads to the cursor and stops there; `KOSMOS.vesselManager.getVessel(KOSMOS.uiManager.getSelectedVesselId()).mission.targetId`
→ `null` (a point, not the planet); `KOSMOS.movementOrderSystem.getOrder(KOSMOS.uiManager.getSelectedVesselId()).targetPoint` →
`{x, y}`, the same pair as "ruch:" in the ship panel; (3) the group stays beside the planet, nothing crosses the disc;
`KOSMOS.debug.stageInfo()` — `kierunek` the same as before the order; (4) wheel out until `fregataPx` < 10 — no red reticles on the
battle; `KOSMOS.threeRenderer._enemyAlertMarkers.size` → `0`; the enemies keep the HUD "⚠ ×N" stack; (5) F5 without saving.

#### CV-3a3 — the scope as signed (kept for reference)

| | |
|---|---|
| **Scope** | **D-CV-4 body shell (#626)** — participants orbiting a body (and enemies pinned to it, `_freezeAsStationary`, with no orbit) are placed on a presentation shell around the body (floor = the body's drawn radius + 2 L) at the bearing toward the opposing side's centroid; the temporary rule "cluster with a body-pinned participant = no stage" goes (`_tickBattleStage`, `_stageFields`, `_stageWatchFit`). The pair guard gets fixed points (shell ships) and a body exclusion (free ships never inside the body). **Stager** — `cvBattle({ atBody })`: the player's ships on orbit slots of a body (`OrbitalSpaceSystem.assignOrbit` — a mutation of `position` alone does not move a sprite onto a visual orbit, memory U1-close), the enemies near it, the encounter pinned the way DSCS pins it |
| **Open questions (decide in the step)** | every pinned participant stands at the body (an orbiter's logical position is its orbit slot, a pinned enemy without an orbit is at the body centre — `VesselManager._updatePositions`), so all pinned pairs are in the laser band (≤ 3.64 L) while drawn bodies are 4–38 L in radius (rocky 0.06–0.14 WU, ice 0.14–0.24, gas 0.20–0.60, moons 0.015–0.04): the pinned group is a tight lattice on ONE side of the body; the bearing when BOTH sides are pinned (no free opposing centroid) — e.g. the camera side, or the side of the player's ships at true scale |
| **Keepers (logic)** | shell never inside the body; bearing toward the free enemy; band consistency kept for body-pinned clusters (fixed points honoured, zero mis-banded pairs or the fallback); the click field and the Watch fit on a body-pinned cluster |
| **Owner looks at** | a battle near a planet — ships on the shell, never inside the planet; Watch dives; a right-click inside it goes under the cursor |

### CV-3b — choreography (flag `cvChoreo`)

| | |
|---|---|
| **Scope (owner, §3.2-13)** | **choreography only** — the stable stage (#652) moved into CV-3a3 and is delivered there: the envelope rides on the per-round solve (`_stageState` `from` / `to`, offsets eased over one round of the presentation clock), so its motion (E ≤ 1 L, D-CV-6) is no longer drowned in solver motion |
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

#### CV-6b — item 0 + the stutter fix ✅ delivered 2026-11-09 (`5f99a1a`; under `cvStage`; owner's check PASS 2026-11-10) — the strip → CV-6b2

Item 0 (§3.2-20) and the stutter report (§3.2-22) filled the session; by the prompt's rule the strip moved to **CV-6b2**
(next section). Nothing of the strip is built; the card, ring mesh and hit glow are unchanged.

**Item 0 — the battle stays compressed at every zoom (D-CV-3 amended).**
- `SemanticZoomLogic.stageBlendFloored(pxL, floor)` = max(floor, the CV-3a1 curve); default floor **1**
  (`STAGE_BLEND_FLOOR_DEFAULT`); live knob `KOSMOS.threeRenderer.cvTuning.STAGE_BLEND_FLOOR` (1 = decision 20; 0 = the CV-3a1
  curve — comparison only).
- Every consumer reads the one floored value: placement weight `k = blend × join` (drawn = base + (target − base)·k);
  the click field (`blend × join` — the D-CV-5 / #662 inversion holds at every zoom); `_stageWatchFit` (Watch fit and dive);
  `stageInfo` (`blend` = used, NEW `krzywa` = the raw curve, a measure for CV-6a's icons). Blend-blind and unchanged: the
  reticle rule (#666 (b) — participants by `_stageParticipants`; the k fade now applies at every zoom), the body shell and the
  fallback (solver output), HUD markers and stacks (read the drawn sprite positions), `fxStats` (no blend reader).
- Measured (keeper R17): camera at 6 / 30 / 85 WU — curve 0, blend 1, every participant at its stage target (none at true
  scale), 0 mis-banded pairs, field round trip ≤ 1e-9 (1e-16 measured); KONTROLA floor 0: 20/20 at the base position,
  190 mis-banded pairs, no field. Body battle far (R12): every ship behind the shell, 0 / 36 player → enemy lines through the
  body; KONTROLA floor 0: 6 / 36 through it.
- Expected, not measured: **#658** (Watch dive overflow) should be gone — the drawn battle no longer changes shape with the
  distance. Owner's look.

**The stutter (§3.2-22) — measured first** (live, RTX 3070, GATE-S4 fixture, `cvBattle()` 10v10, cinema 0.4 WU and mid
≈ 2.5 WU; per-frame drawn positions of 4 ships over 6+ rounds, solves per round and their trigger, frame times; session probe
in the scratchpad, not in the repo). Four causes, all measured:
1. **#669** — the stage offset went linearly from the displayed target to the new solution in `combatRoundMs` and then stood
   at the solution; a round lasts longer than `combatRoundMs` in the game ⇒ ships stopped for the rest of the round and
   restarted with a velocity jump (boundary stops 18 % cinema / 11.1 % mid; speed down to 0.21 / 0.32 of the pre-boundary
   value, median).
2. **#670** — a free-space battle was drawn as the logic glide + the offset; the glide retargets in 150 ms steps and ends early
   ⇒ the knot jerked with the glide while the offsets stood.
3. **#671** — the Watch / auto-focus pivot was built from ships with hp > 0; a kill dropped a ship from the axis in one frame
   while its sprite stayed on the stage ⇒ the camera goal jerked 10–49 L/s on 4 / 4 kill frames.
4. **#672** — the warm-started solver random-walked: 40 pull passes at weight 0.5 over 190 pairs every round moved the whole
   solution although the logic barely changed (relative step median 0.41 L, p95 2.31 L; 40–52 % of consecutive steps reversed)
   ⇒ the "jitter rounds".
Rejected: mid-round re-solves from combat events (1 solve per round — the key holds rounds + membership) and frame hitches
(dt p95 16.8 ms, max 19.8 ms during the battle).

**The fix (under `cvStage`; pause freezes everything — D-CV-10, presentation clock):**
- NEW `src/renderer/combat/StageMotionLogic.js` (pure, zero imports): each solve starts a cubic Hermite segment
  (`motionSegment` / `motionAt`) from the CURRENT drawn state — position and velocity — to the new target with the target's own
  velocity (`targetVelocity` from the last two solutions) over `combatRoundMs`; past the end the motion continues and decays
  (`STAGE_MOTION.EXTRAP_E` 0.5 × segment) instead of clamping ⇒ position and velocity continuous at every boundary (C1).
- Free clusters solve and move in the WORLD frame, body battles in the body frame (`fid`, a frame change resets the segment
  start): the drawn stage no longer depends on the logic glide; the click field's shift = displayed centroid − field centre.
- `_stageWatchFit` takes every drawn participant, the dead included (DSCS keeps them in the encounter until the end and the
  sprite stays) ⇒ a kill does not move the pivot.
- Warm start: `STAGE.WARM_PASSES` 4 at `WARM_PULL` 0.25 (cold solves: 40 at 0.5, unchanged; the shell warm passes unchanged).
  Offline on 3 recorded battles: shots in the weapon window 96.4 / 90.9 / 93.3 % (40 × 0.5: 96.4 / 93.5 / 96.1; 0 passes:
  91–93 %), relative step median 0.17–0.21 L (was 0.40–0.55), p95 0.8–1.46 L (2.2–2.9), pairs within ±15 % of the law
  85.3–86.5 % (84–86 %). ⚠ One battle of three loses 2.6 points of shots in the window — taken for the smoothness; the keeper's
  battle keeps L5b at 96.4 % (≥ 95 %).

**Live, before → after** (same fixture, same stager seed, cinema / mid):

| measure | before | after |
|---|---|---|
| boundary checks where the ship stopped (< 10 % of its pre-boundary speed) | 18 % / 11.1 % | 1 % / 0 % |
| speed at the boundary ÷ speed before it (median) | 0.21 / 0.32 | 0.77 / 0.81 |
| velocity jump at the boundary, p95 (L/s between frames) | 4.25 / 1.43 | 0.64 / 0.065 |
| velocity jump at the boundary, max (L/s) | 4.63 / 2.16 | 0.99 / 0.23 |
| camera goal speed on the 4 kill frames (L/s) | 12.8 / 10.5 / 48.7 / 24.7 | 0.1 / 0.3 / 0.0 / 0.4 |
| solution step per round, median / p95 (L, relative) | 0.41 / 2.31 | 0.21 / 0.69 |
| solves per round | 1 | 1 |
| frame dt median / max (ms) | 16.7 / 19.8 | 16.7 / 20.9 |

Slowdowns anywhere in the round (not only at boundaries) rose in cinema 1.6 % → 4.4 %: these are smooth reversals through zero
speed when the next target lies behind the ship — before, the same reversal happened as a stop at the boundary.

**Keepers** (logic only): `cv_stage_logic` **43/0** (L3d/L3e floored blend; L5c the solver does not walk — KONTROLA the old
40 × 0.5 walks; L10 the motion segment — exact ends, C1 at the end, velocity = derivative, bounded decay) · `cv_stage_render`
**37/0** (R5b/R5c re-aimed to floor 0 — they pinned "far = true scale", the rule decision 20 replaced; R17 compact at every
zoom) · `cv_stage_shell` **53/0** (R4 / R11 far at floor 0; R12 body battle far) · `cv_stage_temporal` **24/0** (T8a far at
floor 0; T9 velocity continuous across boundaries — KONTROLA the CV-3a3 linear transition, computed in the keeper, stops on
219/219; T10 a kill does not move the pivot — KONTROLA the live-only axis moves 1.04 L; T11 the free stage does not depend on
the glide — witness: base positions differ by 0.05 WU) · `cv_fx_results` 40/0 (harness names only) · `cv_stage_answers` 22/0
· `cv_stage_no_snap` 15/0. **Fail-first** on HEAD + the CV-3a3 tree with the CV-6b keepers: logic 36/4 (L3d, L3e, L5c, L10),
render 33/4 (R5b, R17a–c), shell 52/1 (R12a), temporal 20/4 (T9a, T9b, T10a, T11a); every KONTROLA and witness green on
both sides (L3e is a property pin of the new function, not a control — relabelled). Sweep **380/380**, `check-i18n` PASS
(no new strings).

**Owner looks at** — (1) `cvBattle()` at cinema and mid: continuous motion, no stop at round boundaries, no jitter rounds, a
kill does not jerk the camera; (2) zoom out to the whole system: a compact knot, `stageInfo()` → `blend 1`, `krzywa` ≈ 0;
(3) `cvBattle({atBody: 1})` far: the knot behind the planet, no beams across it; (4) right-click "Leć tutaj" at far zoom lands
under the cursor; (5) `cvTuning.STAGE_BLEND_FLOOR = 0` → the old spreading, back to 1; (6) `cvStage(0)` = today; (7) pause
freezes, resume continues smoothly; F5 without saving.

**Owner's check — PASS 2026-11-10 (steps 1–8 of the session's check list).** **#630 → owner's decision 2026-11-10
(§3.2-23):** `uiPrefs.combatFxVisible` is retired and `uiPrefs.battleAutoFocus` becomes a ☰ toggle — done in CV-6b2,
together with the strip.

### CV-6b2 — combat strip replaces the card (flag `cvStrip`) — split from CV-6b (§3.2-22)

The scope as written for CV-6b (owner's requirements §3.2-16 and the CV-6b prompt), unchanged:
- NEW `src/ui/CombatStrip.js` + pure `CombatStripLogic.js`; the unit is the **encounter cluster** (`encounterClusters`,
  CV-3a2 — one source for the stage, the banner and the strip).
- **Collapsed**: one line per battle — `⚔ location · own alive/total + HP bar · enemy alive/total + HP bar · round n/20 ·
  [Obserwuj] · [▾]`; up to 3 lines, then "+N"; fog gating as the card today (`isEndpointVisibleInCombat`).
- **Expanded** per battle: ship lists of both sides, the last ~5 round-log lines, scroll, ▴ / Esc closes.
- **Placement**: never over the outliners or the bottom strip — `getPanelRect()` + `MapInsets` (#629); in cinema never over the
  battle (the Watch safe rect).
- [Obserwuj] emits `camera:watchBattle` with today's payload; the Director chip hidden until CV-7.
- ONE result banner per cluster (exists since CV-3a2 — kept); the Dziennik ONE battle line per CLUSTER (#639) — the skirmish
  semantics kept, not multiplied.
- Under `cvStrip`: no old card, no ring mesh, no hit glow; the 3D HP bars stay until CV-6a (§3.2-16 shim).
- **#630** — owner's decision 2026-11-10 (§3.2-23), as proposed: **retire** `uiPrefs.combatFxVisible` (it hides every combat FX and the
  orbital burst — against the arc's goal; performance gets its own knob in CV-2b's presets; the burst dies in CV-8b) and
  **expose** `uiPrefs.battleAutoFocus` as a ☰ toggle (a real player preference — the camera is not taken; CV-7's director
  inherits it).
- All strings PL + EN through `t()`.
- Keepers (logic): strip layout math (fits, insets, safe rect, "+N"); one line / one banner / one Dziennik line per cluster
  (split 4v4); Watch payload identical to today's; fog gating; i18n.
- Owner looks at: the strip at 1600×1041 on 5 themes (collapsed, expanded), split 4v4 — one line, one banner, one Dziennik
  line; Watch from the strip; `cvStrip` OFF = today's card.

#### CV-6b2 — the combat strip ✅ delivered 2026-11-10 (`de682b4`; flag `cvStrip` default ON; owner's check PASS 2026-11-10)

Built in one session; nothing of the scope moved to a CV-6b3.

**What changed**
- NEW `src/ui/CombatStripLogic.js` (pure — no three, no DOM, no `window`; runs under node): `stripBattles` (the unit is the
  encounter CLUSTER — `encounterClusters` with the stage radius `clusterRadiusPx`, the same rule as the stage, the banner and
  the Dziennik; per side alive / total and HP % from `vesselStates`; fog as the card today — `isEndpointVisibleInCombat` per
  ship: an invisible ship is not counted and the side shows "?"; battles in the viewed system first), `stripLayout` (the area
  of the MAP from `MapInsets` — never under the outliner columns, the top band or the bottom strip, #629; default edge **top**:
  the block centred in the map area 4 px under the top band, natural width clamped to 280–640 logical px, the location
  column ≤ 170 px with an ellipsis and a tooltip; the expansion under the block, capped at 45 % of the height and scrolled
  by the wheel; the block yields under the picker banner; `EDGE: 'bottom'` = above the bottom strip, a console comparison),
  `stripWatchPayload` (today's `camera:watchBattle` payload — encounter id, system, point — the same as the card's row under
  `cvStage`), `stripLog` (the last 5 shots of the battle), `stripHitAt`, `ROUND_CAP` (= DSCS `MAX_ROUNDS` 20).
- NEW `src/ui/CombatStrip.js` — the strip in the T5 / T6 idiom: a dark translucent bar without a frame (`THEME.bgPrimary`
  × 0.72), the theme font, colours only from the HUD roles (`primary` own, `alert` enemy, `dim` tracks), digits in the fixed
  grid (`layoutTabular`), columns aligned across lines. Collapsed: `⚔ location · own alive/total + bar + % · enemy the same ·
  R n/20 · [ Obserwuj ] · [ ▼ ]`, at most 3 lines, then "+N". Expanded (one battle at a time): both sides' ships
  (name · class · micro HP and shield bars, destroyed greyed) and "OSTATNIE STRZAŁY" (round · attacker → target (weapon)
  −damage / miss / shield); ▲ or Esc collapses. The expansion FOLLOWS the battle when the cluster id changes (its smallest
  encounter ends) and through a mop-up encounter of the same ships; it collapses when the battle ends. Every click inside
  the strip is consumed; tooltips in the same idiom. Knobs live: `KOSMOS.combatStrip.tune({…})` (`tune()` resets);
  readout `KOSMOS.combatStrip.debug()`.
- **Card façade:** `CombatHUD.getPanelRect()` returns the strip's rectangle under the flag, so the D-CV-21 consumers (the
  Watch frame, the ship / fleet panel obstacles) are unchanged; `CombatWatchLogic.watchSafeRect` learns `edge: 'top'` — the
  Watch frame starts UNDER a strip at the top (the old card at the bottom keeps today's rule). `isMinimized()` is false
  under the flag (the ☰ chip "⚔ Walki" has nothing to restore).
- `UIManager`: the strip drawn after the outliners and before the top drawer (over the map and an overlay like the card;
  under the top band's colony list, the bottom strips and the floating panels); click, mouse move (chip hover, cursor), wheel,
  `isOverUI` (the strip blocks the camera and map hover — #676) and the Esc hook `combatStripEscape`; under the flag the old
  card is neither drawn nor clickable. `GameScene` Esc cascade: an expanded strip collapses after DOM windows, before the
  fleet panel and the selection.
- **One battle line per cluster (#639).** NEW `src/ui/CombatNarration.js` — `ClusterNarrator`: under the flag a DSCS
  battle (`battle_ds_…`, no `warId`) is held until the cluster's LAST `battle:resolved` — the same grouping as the banner
  (`BattleClusterLogic.clusterGroupStep`, now shared: `clusterBannerStep` = group + merge) — then ONE skirmish line (per
  empire, when the encounters were skirmishes — the semantics kept, not multiplied) and ONE battle line (the text by
  `GameScene._battleLogEntry`, the old body 1:1, the cluster merged with `mergeClusterBattles` like the banner). War battles
  and non-DSCS battles keep today's line; the flag OFF = one line per encounter as today.
- Under `cvStrip`: no ring mesh (`_hideEncounterRings`), no white hit glow on the model; the 3D HP bars stay until CV-6a
  (§3.2-16 shim).
- **#630 (§3.2-23):** the readers of `uiPrefs.combatFxVisible` are removed from `ThreeRenderer` (both paths; the key in old
  saves is ignored); ☰ "Auto-fokus bitwy" / "Battle auto-focus" toggles `uiPrefs.battleAutoFocus` (no key = ON; the save
  carries `uiPrefs`, v101 without migration).
- G5-C parity: a HUD rectangle over the strip (the open jump picker, `HudLayer.uiPassThroughRects`) is cut out of the strip
  — the picker shows through and gets the click, like the card.
- Stager: `cvBattle({ battles: 2..5 })` — separate battles in the viewed system; `KOSMOS.debug.cvStrip(0|1)`.
- i18n: 10 new keys (9 `combatStrip.*`, `menu.battleAutoFocus`), pl = en = 3380.

**Measured (the real game, headless Chrome with GPU, fixture GATE-S4-fresh-gy60, window 1600×1041 CSS, UI scale 1.25)**
- Contact sheet `kosmos-handover/cv-6b2/kontakt_CV6b2.html` — 5 themes × 5 frames (1 battle collapsed / expanded, 3 battles
  collapsed / expanded, 4 battles = 3 lines + "+1"), 0 console errors. The strip: one battle (449, 32) 383 × 21 logical px,
  centred in the map area; 10v10 expanded 254 px (no scroll); 3 battles 55; 4 battles 67.
- Owner's check list run on the live engine (`kosmos-handover/cv-6b2/validate_CV6b2.mjs`, `validate.json`): **7/7 PASS** —
  one line under the top band, the card not drawn; ▼ by the mouse expands, Esc collapses (the ☰ menu does not open);
  Watch from the strip → cinema (distance 0.4), the battle framed under the strip (strip bottom 66 CSS px); split 4v4 → ONE
  strip line (4 encounters); at the end **2 banners = 2 battle lines = 2 skirmish lines** — the four duels (20 rounds, 3
  enemy losses) and then the mop-up of the last enemy in a new encounter (1 round) — **#675**; ☰ auto-focus OFF → the
  camera stays (distance 450 → 450), ON → it jumps to the battle (450 → 6); `cvStrip(0)` → today's card (560 × 248 at the
  bottom), the strip off; `cvStrip(1)` → the strip; 0 console errors.

**Keepers** — NEW `cv_strip_smoke` **48/0** (P1 layout at 1280×833 and 1600×1041 in both edges, insets, expansion,
scroll, width clamp, banner yield, #629 control with the real card · P2 split 4v4 on a real DSCS + stager + `WarSystem`
world: one strip line per cluster, fog · P3 the Watch payload — the card's click and the strip's click emit the same ·
P4 the Dziennik — the compiled `GameScene` narrator: lines == banners == battles counted independently from the encounter
timeline; the flag OFF control = one line per encounter; battle outcomes identical with and without the flag · P5 ☰ toggle
+ save / load round trip; `combatFxVisible` has no reader · P6 the flag OFF = the card; `watchSafeRect` edge · P7
interaction — "+N", Watch, ▼ / ▲, scroll, consumption, cursor, Esc; the expansion follows the battle; P7k the G5-C cut-out
· P8 source: the ring and the glow under the flag, the HP bars ungated, the Esc cascade, the Dziennik routing, i18n,
`ROUND_CAP`). Fail-first on a clean `git archive HEAD` tree **2/19** (green: the P4a timeline witness and the P4f outcome
control); on a copy without the G5-C cut-out **46/2** (exactly P7k). Re-aimed: `cv_fx_engine_smoke` T9d — the OFF-path
fingerprint `0eabc4f` is hashed after undoing the two documented CV-6b2 edits (the `combatFxVisible` reader, the glow gate);
witness T9g that both edits are in the source — 39/0 (fail-first on HEAD 38/1, T9g; T9d green on both sides);
`cv_stage_render_smoke` R14c — the ring hidden under `cvStage || cvStrip` — 37/0 (fail-first 36/1). Sweep **381/381**,
`check-i18n` PASS.

**Choices within the scope (for the owner's eye):** the strip at the TOP edge (the bottom holds the bottom strip with the Dock
chips; the Watch frame keeps the battle under the strip); "+N" is a count, not a list; the strip consumes every click
and blocks the camera under it (the card did not — #676); the contact sheet is in the Polish locale.

**Owner looks at** — (1) `KOSMOS.debug.cvBattle()`: one line under the top band, ▼ expands (ships, last shots), ▲ / Esc
collapses, [ Obserwuj ] dives with the battle under the strip; (2) `KOSMOS.debug.cvBattle({nA: 4, nB: 4, split: 1})`: one
strip line; at the end banners = battle lines (2 with the mop-up, #675); (3) ☰ "Auto-fokus bitwy" OFF / ON; (4)
`KOSMOS.debug.cvStrip(0)` = today's card, `cvStrip(1)` back; (5) the 5 themes on the contact sheet; F5 without saving.

**Owner's check — PASS 2026-11-10 (steps 1–7 of the session's check list; the strip at the top accepted).** Decisions the same
day (§3.2-24, -25): #676 accepted as designed; #675 → a grace window of ≈ 1–2 rounds before the result is announced, not now —
scheduled with #640 in the small step outside CV (one message per event).

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
| **619** | ⚪ | **Floors fix effect sizes**: explosion `Math.max(0.2, …)` ⇒ fireball 5 L, ring 25 L; exhaust floors ⇒ every plume 0.03 × 0.024 WU (1.9 L); the flicker scales plume thickness, not length | `ThreeRenderer.js:6498, :4716-4717, :4740, :6478-6492` | CV-1a (exhaust) / CV-5 (explosion) — under `cvStage` the fireball floor is lifted as a stop-gap (CV-3a3, #653 (d): peak = hull × 1.5) |
| **620** | 🟠 | **Enemy tint and wreck glow are invisible on 24 of 27 models** — `emissiveColor` multiplies an emissive map that is black on all six warships (max 12–29/255); a wreck rebuilt after load / system switch gets `0x110000` | `three.module.js:348`; `ThreeRenderer.js:4782, :4791, :1387-1388`; §1 Q6 Table B | CV-1a / CV-5 |
| **621** | 🟠 | **`nonwarp_large_science` flies stern-first**: 26/27 models have the bow at local −X, this one +X; the README says +X (wrong); the heading comment says +X (wrong); the exhaust code is right | silhouettes in the audit scratchpad; `README_modele_statkow.md:14-15`; `ThreeRenderer.js:4706-4707, :4715, :4759-4760` | CV-1a (hardpoints frame + README) |
| **622** | ⚪ | **Heading defects**: orbit heading `θ + π` turns the bow against the orbital motion (maths verified, not seen live); combat free-floaters are never rotated; a sprite recreated mid-battle gets yaw 0 | `ThreeRenderer.js:5107-5110, :6677-6711, :1761-1770, :4751-4761`; `OrbitalSpaceSystem.js:158, :211-213` | CV-1a (orbit) / CV-3b (combat) |
| **623** | ⚪ | **Duplicate GLBs** load and upload twice and look identical in different roles (`default = cargo3d`, `nonwarp_large_cargo = nonwarp_medium_cargo`, `warp_frigate = warp_large_science`); `cargo3d.glb` and `research1.glb` have no code reference | SHA-256 (audit); `VesselModelResolver.js` | owner's new models; CV-Z hygiene |
| **624** | ⚪ | **Material sharing**: player ships use the template materials ⇒ the maintenance tint greys every player ship of the same file [INF]; the wreck handler replaces enemy clones without disposing them [INF] | `ThreeRenderer.js:4767-4794, :5492-5528, :1381, :1397` | CV-1a |
| **625** | ⚪ | **Swallowed ReferenceError**: `entry` declared in a block at `:4828`, used at `:4837 / :4849` for wrecks with `dockedAt` ⇒ throws inside the GLB `.then`, caught as "GLB load failed (retry)" | `ThreeRenderer.js:4828-4868` (verified by reading) | CV-1a |
| **626** | ✅ | **A pinned enemy without an orbit never moves on screen** while its logical position snaps to the body centre — `_freezeAsStationary` sets `dockedAt` but nothing assigns an orbit | `DSCS:1309-1312`; `OrbitalSpaceSystem.js:62-70`; `ThreeRenderer.js:5088-5089, :5419-5435`; `VesselManager.js:2702-2707` (static trace, not run) | **✅ CV-3a3** (`0490ea5`, D-CV-4): the body shell — a pinned enemy without an orbit gets a base just beyond the shell (`shellBaseAt`) and glides there over `JOIN_MS`; the logic is untouched (the DSCS pin stays); owner's live check pending |
| **627** | ⚪ | **Wreck drawn ≠ logical**: DSCS wrecks' logical position is the battle-start midpoint; deep-space wrecks never enter `moving`, so the sprite stays where the ship died until recreated, then jumps; orbiters go to the graveyard orbit (Finding 460 family) | `DSCS:1055, :1101, :1112`; `VesselManager.js:2625`; `ThreeRenderer.js:4855-4861`; `OrbitalSpaceSystem.js:97-104` | CV-5 (presentation rule) |
| **628** | 🟠 | **The orbital burst ignores the viewed system and galaxy mode** — no `isEngagementInView` (unlike the round FX) ⇒ a battle elsewhere draws at planet-local coordinates in the viewed system (Finding 453 family) | `ThreeRenderer.js:6531, :6549-6575` | CV-8a / CV-8b |
| **629** | ✅ | **The combat card ignores `MapInsets`** (≈ 12 px overlap with the bottom strip without the Dock); the Watch top margin uses 46 while the map top inset is 28 | `CombatHUD.js:150-162`; `MapInsets.js:28, :41`; `CombatWatchLogic.js:97-110` | **CV-6b2 ✅ (`de682b4`, under `cvStrip`)** — the strip lays out in the map area from `MapInsets` (never under the outliners, the top band or the bottom strip; `cv_strip_smoke` P1, control P1e with the real card); the Watch frame starts under a strip at the top (`watchSafeRect` `edge: 'top'`); the card on the OFF path unchanged until CV-Z |
| **630** | ✅ | **Console-only switches**: `uiPrefs.combatFxVisible` and `battleAutoFocus` are read, never written | `ThreeRenderer.js:1546, :6528, :6551` | **CV-6b2 ✅ (`de682b4`, owner's decision §3.2-23)** — `combatFxVisible` retired (no reader left, both paths; `cv_strip_smoke` P5, `cv_fx_engine_smoke` T9d / T9g); ☰ "Auto-fokus bitwy" / "Battle auto-focus" toggles `uiPrefs.battleAutoFocus` (no key = ON; the save carries it, v101 without migration; live: OFF — the camera stays, ON — it jumps) |
| **631** | ⚪ | **Doctrine barely exists in deep-space mechanics**: DSCS never reads it; kite only moves the MOS band; hold_position does not hold; retreat_at_50 is checked once per 0.5 civ-years (≈ 14 % of maximal battles). Outside CV (F1) — a mechanics question for the owner | `DSCS:553-584`; `MovementOrderSystem.js:1385, :1391-1392`; `FleetSystem.js:478-486, :751` | candidate future MECHANICS arc — owner decides later (§3.1-7); CV-3b posture only |
| **632** | ⚪ | **EAH ordering and scope**: emits before applying wrecks; wrecks a retreating side anyway; `_wreckPlayerVesselsInSystem` uses `systemId ?? 'sys_home'` ⇒ a ship in warp transit is wrecked by a lost home battle it never defended (Finding 151 class); the no-war skirmish is tagged `source: 'dscs'` | `EnemyAttackHandler.js:228-301, :406`; `WarSystem.js:815`; `GameScene.js:2763` | mechanics outside CV; CV-8a relies on the emit order |
| **633** | ⚪ | **Possible fog leak**: the rumor-ghost override applies only to `in_transit`; orbiting enemies get their live position written back at physics cadence | `ThreeRenderer.js:5601-5603, :7682-7683` (static, not run) | CV-6a (fog audit) |
| **634** | ✅ | **No reproducible battle stager**: Combat Sandbox is not deterministic (global `Math.random` system generation); no helper places N ships of a loadout at a point; `DirectorRecall` recalls idle debug raiders on the first tick; `teleportVessel` never sets `systemId` | `CombatSandbox.js:145`; `SystemGenerator.js:689-690`; `DirectorRecall.js:96-121`; `GameScene.js:852-866` | **CV-2a ✅** — `KOSMOS.debug.cvBattle` (`src/debug/CvBattleStager.js`): viewed system, clear spot, pause, encounter before the first tick, fixed `seedBase`, engage orders; same seed = same battle (`cv_fx_results_smoke` S1–S6) |
| **635** | ⚪ | **Possible double resolution of one raid** — DSCS on approach and EAH on arrival (DSCS does not exclude ships orbiting a planet) | `DSCS:202-254`; `EnemyAttackHandler.js:41-71` (inference, not run) | CV-8a probe |
| **636** | ⚪ | **Hygiene bundle**: dead `_resolveFxEndpoint`; `entry._orbiting` written never read and `_calcVisualOrbit*` uncalled; FX kind `trail` without producer; hit-glow disposal frees the shared Sprite geometry (re-upload churn); BattleView3D's unused EventBus import and its own weapon-colour copy; `resolveBattle`'s `Date.now()` seed fallback; `round.year` mixes display and civ years; the CLAUDE.md M2a note lists `resolveDeepSpaceBattle` under `KOSMOS.debug` | `ThreeRenderer.js:6359-6372, :5282, :5329, :6447, :6408`; `BattleView3D.js:19, :30-37`; `BattleSystem.js:108`; `DSCS:617` | CV-2a — under `cvFxEngine` the hit glow is a pooled spark (no per-shot disposal); the legacy churn stays on the OFF path until CV-Z |
| **637** | ⚪ | **Below 10 fps the presentation clock runs slower than real time.** The 100 ms step cap (no jump after a stalled loop) also clips every frame of a steadily slow machine: at 2.3 fps (SwiftShader) an 8 s battle advanced 1.5 s of presentation time, so effects live longer in real time and trail the rounds. Irrelevant at ≥ 10 fps (the RTX 3070 runs 60). Matters for CV-4's lag budget (D-CV-9, ≤ 1 round) and CV-2b's Low preset: either cap only true gaps (e.g. > 1 s) or let the ledger re-sync to the round anchor (`PresentationClock.anchor`) | `src/renderer/combat/PresentationClock.js` (`PRESENTATION_DT_MAX_MS`); live probe CV-2a | CV-4 / CV-2b |
| **638** | ⚪ | **One battle, several encounters.** DSCS never merges encounters; under player intent (an `engage` order on the other ship of the trigger pair) an encounter starts with that pair only and the rest join one by one ⇒ normal play produces co-located encounters, each with its own ring, card and result (measured: 5v5 with a target per ship → two concurrent encounters 0.15 AU apart; one target → two sequential, 2 then 4). One `cvBattle` 10v10 = one encounter (12 seeds headless, 4 live); the `_n` id suffix is a 0.01-year stamp collision, not a fragment | `DSCS:186-188, :229-236, :241, :1506-1514`; probes §4 CV-2a findings 1 | **CV-3a1 ✅ part** — cluster = stage unit, Watch frames the cluster and follows its encounters (`clusterEncounters`, `cv_stage_logic_smoke` L7, `cv_stage_render_smoke` R12); **CV-3a2 ✅ rest** (`1dfe5ae`) — clusters from logical positions for stage, card and banner (`encounterClusters`), one card row and one result banner per cluster (`BattleClusterLogic`; `cv_stage_answers_smoke` A4–A6; live: one row, one banner); DSCS untouched; the Dziennik line per encounter stays until CV-6b (#639) |
| **639** | ✅ | **The result is told three times.** Banner with pause + Dziennik battle line + Dziennik skirmish line (every no-war battle) per encounter, plus auto-slow; co-located encounters multiply it (live: 4 battles → 4 banners, 4 battle lines, 4 skirmish lines; no toast, no bell) | `GameScene:2789, :2867`; `BattleIntroModal.js:215`; `UIManager:1829-1831`; `WarSystem:446` | **CV-6b2 ✅ (`de682b4`, under `cvStrip`)** on the CV-3a cluster id — one banner (CV-3a2, kept) and, by the same grouping (`clusterGroupStep`), ONE battle line and ONE skirmish line per cluster (`ClusterNarrator`; the skirmish line kept as a line — §4 CV-6b2 scope "the skirmish semantics kept, not multiplied"); live split 4v4: 2 banners = 2 battle lines = 2 skirmish lines instead of 5 + 5 (the second = the mop-up, #675); `cv_strip_smoke` P4 with the OFF control; the OFF path per encounter until CV-Z |
| **640** | 🔴 | **Contact flood — per ship and per pair.** Observatory first sighting: one pausing popup per ship, not queued (each dismiss resumes the game while the rest stay open [INF]) — 10 popups + 10 lines for one 10v10 in colony range (headless); proximity contact: one line per player × enemy pair — 130 per battle live (13 × 10); contact identified / lost: 10 + 2–10 per battle. 587 Dziennik entries in 4 battles vs a 500-entry runtime buffer (200 saved) ⇒ the earlier history was flushed (Finding 173 class) | `ObservatorySystem.js:676-697` → `GameScene:3084-3192`; `UIManager:1691-1710`; `GameScene:2878-2895, :2897-2912`; `EventLogSystem.js:17-18` | **owner's decision 2026-11-08 (§3.2-14): the NEXT step, outside CV, right after CV-3a3** — separate small step **outside CV** (owner decides scope): aggregation window per system — one popup / one line listing N contacts; ~3 i18n keys PL + EN + keeper · **+ #675 (owner's decision 2026-11-10, §3.2-25):** the same step carries the grace window (≈ 1–2 rounds) before a battle's result is announced — the step's rule: one message per event |
| **641** | ⚪ | **"End-of-action circles" are the wreck explosion rings** — flat orange `RingGeometry` 0.35–0.40 WU (22–25 L, the #619 floor), 800 ms, all at once when the battle ends (#615); live the only legacy FX in 4 battles: 55 fireballs + 55 rings at the battle ends | `ThreeRenderer:1356, :6533` | **CV-3a1 ✅ stop-gap** — no flat ring under `cvStage` (§3.2-4; `cv_stage_render_smoke` R10); **CV-5** — layered explosion sized from the ship, at the killing impact |
| **642** | ⚪ | **The engagement ring is smaller than the battle** — 0.285 WU (0.026 AU) around the encounter point while a 10v10 line-up stands 0.06–0.114 AU from the centre ⇒ every ship outside it | `VesselFxLogic.js:80, :109`; `ThreeRenderer:4214, :7156, :7189` | **CV-3a1 ✅** — hidden under `cvStage` at the call site (`_hideEncounterRings`; the OFF-path pins `combat_ring_subtle` / `combat_marker_life` / `combat_view_scope` T6e unchanged; `cv_stage_render_smoke` R9, R14c); code removed in CV-Z |
| **643** | 🟠 | **Watch zoom dives under the battle.** The composition shift (orbit target moved down so ships render above the card) is computed for the fit distance and kept after the wheel changes the distance; the wheel dollies toward that target ⇒ Watch at 0.605 WU shows 0 / 20 ships (fit at 1.816 WU: 20 / 20, target y −0.227; auto-focus at 6 WU: target y −0.997, ships at screen y 218 vs centre 403). Not the 0.3 vs 0 height (only the first auto-focus frame aims at y 0) | `CombatWatchLogic.js:121, :170`; `ThreeRenderer:1577, :7027-7050, :7108`; `ThreeCameraController.js:186` | **CV-3a1 ✅** — pivot on the drawn cluster centre at ship height, distance fitted without the stage, composition by `setViewOffset`; criterion live 20 / 20 at 1/3 of the start distance (KONTROLA OFF: 0 / 20); `cv_stage_logic_smoke` L9, `cv_stage_render_smoke` R11 |
| **644** | ⚪ | **Frame hitches are first-use costs; the owner's low mean is a few multi-second gaps.** Live 65 s / 4 battles: p50 16.6, p95 18.9, max 107.8 ms, 3 frames > 50 ms — staging (first hull model / texture upload, +13 textures), first salvo (lazy FX programs, +2), battle end (+25 geometries: one sphere + ring per explosion). The owner's 22.85 fps mean at p95 19.7 needs ≈ 8 s in ≤ 15 frames ⇒ suspended rAF (window covered / DevTools), not reproduced | live probe §4 CV-2a findings 7; instrument `ThreeRenderer.cvFxStats` / `_fxStatsBegin` / `_fxStatsEnd` | instrument delivered (`fc7334d` — `fxStats` max, mean, five longest frames with labels); prewarm FX programs **CV-2b**; pooled explosions **CV-5**; model prewarm CV-1b / CV-2b |
| **645** | 🟠 | **`combatRangeEnter` flood from the proximity self-heal** — any pair within combat range with no encounter (same faction included, rejected by DSCS at once) is re-emitted on every pass, twice per tick: a parked group of 5 own ships → 20 emits per tick, 12 000 in 10 s (headless); 36 439 during the 4 live battles; AI guard fleets on a capital orbit do the same [INF] | `ProximitySystem.js:272-281, :295`; `VesselManager.js:2052, :2073`; `DSCS:142`; `VesselCombatSystem.js:125` | separate small step **outside CV** — skip the self-heal / emit for `sameFaction` pairs (and pairs DSCS cannot start); own keeper |
| **646** | ⚪ | **Empty-space clicks hit the plane y = 0 while ships are drawn at y = 0.3.** At Watch zoom (camera 27° above the plane, φ ≈ 63°) a click beside a ship lands ≈ 0.3 × tan 63° ≈ 0.59 WU ≈ 0.054 AU further along the ray — the whole laser range; inside a stage that is several bands | `src/utils/RaycasterHelper.js:53` (`new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)`); `GameScene.js:6083, :6358, :6451` | **CV-3a2 ✅** (`1dfe5ae`, decision (b) §3.2-5) — `castRay` on the ship plane (`clickPlaneY`; y 0 only with the camera below it) for every empty-space click; inside a stage the point is also inverted through the stage (D-CV-5); keeper `cv_stage_answers_smoke` A1–A3 (KONTROLA: the old plane 0.0535 AU off along the centre ray); live: target under the cursor at every zoom (old: 22–48 px at ~8 WU, 118–436 px at the cinema frame) |
| **647** | ✅ | **The stage re-solves every frame while ships glide** — base positions change each frame during the 1 000 ms glide, so the guard (40 + ≤ 96 passes over 190 pairs) runs per frame: JS loop p50 1.8 vs 1.0 ms with the stage OFF (live, 10v10, RTX 3070; frame time unchanged 16.7 ms, 60 fps). Two co-located battles ≈ double | live probe CV-3a1 (`fxStats` at Watch 1/3 zoom); `ThreeRenderer._tickBattleStage` (key = base positions + priority pairs) | **✅ CV-3a3** (`0490ea5`, with #652 — §3.2-13 overtook the decision (a) of §3.2-8): the stage solves once per round per cluster — live 10v10: 60.2 → 1 solve/s, JS loop p50 1.9 → 0.8 ms (§4 CV-3a3) |
| **648** | ⚪ | **Watch lands at the true-scale frame, not in cinema** — the plan's D-CV-3 consequence says "Watch simply lands in cinema range"; CV-3a1 fits the Watch distance on positions WITHOUT the stage (2.5–2.8 WU, blend ≈ 0.02–0.04), so Watch first shows the whole battle in true geometry and the wheel gives the stage (the #643 criterion "wheel to 1/3 of the start distance" is meaningful only this way). Fitting on drawn positions instead makes Watch dive by itself (fit → blend → smaller fit) to ≈ 0.4 WU (cinema) | `ThreeRenderer._stageWatchFit` (`fitWatchFrameOffset` on `base`) | **CV-3a2 ✅ (b)** (`1dfe5ae`, decision §3.2-7) — Watch fits on the stage solution × each ship's join (the "one switch: fit on `points`" of this row does NOT dive — it stalls at ≈ 2.6 WU, blend ~3 %, measured; keeper A7b); `cv_stage_render_smoke` R16; live: 5.14 → 0.40 WU in ≈ 0.66 s; the dive transient → #658 |
| **649** | ⚪ | **Geometric limit of the band guard: a stack at a band edge.** ≥ 5 ships at one logical point engaged by an enemy parked near a band edge (DSCS parks at 0.95 × range, staged ≈ 3.8 % inside the apparent band) cannot all stay in the band with the 1.6 L floor in any 3D arrangement (they need a ball of radius ≤ 1 L) ⇒ that cluster takes the uniform fallback (stack overlapping as today, windows approximate; `fxStats` counts it). Measured fallback rate 0–2 % on random / formation 10v10, 0 on the stager and recorded battles | `BattleStageLogic.solveStage`; probes CV-3a1 (scratchpad) | **owner's decision (a) 2026-11-08 (§3.2-9):** accept — a dense stack at a band edge keeps the uniform fallback |
| **650** | ⚪ | **Battle time: 19 s measured, ~10 s seen by the owner.** In the GATE-S4 fixture at `combatRoundMs` 1000 every stager 10v10 runs the full 20 rounds (time-out): first salvo 0.16 s after unpausing (round 1 fires at the first grid tick), banner in the same frame as `battle:resolved` — first salvo → banner 18.98 / 19.07 / 19.07 s (seeds 1–3), = 19 rounds × 1000 ms; headless the same 20 rounds. The owner's ~10 s is ≈ 500 ms per round or a ≈ 10-round battle — candidates: a `combatRoundMs` value stored in the owner's save (the tuning table persists in the save; setting the default removes the entry, any other value stays until `sbReset`), or a battle that ends early (the banner's "Tur: N" shows the round count; player weapon techs make DSCS battles shorter — #654) | live probe CV-3a2 (timing seeds 1–3); `TimeSystem._updateCombatGrid`; `StrikesBackTuning` | owner checks `KOSMOS.timeSystem.combatRoundMs()` and the "Tur" on the banner; no code step |
| **651** | ⚪ | **`stageInfo` reads like a missing band, but it is a missile-only round.** It reports the LAST round's shots grouped by WEAPON; weapons fire on cooldowns (laser every 2nd round, kinetic every 3rd, missile every 5th), so a round with only missiles shows "laser —, kinetyk —"; and the bands are DISTANCE bands — the stager lines start 0.12 AU apart and close in, so missiles fire at kinetic-band distances: the owner's "rakiety 7.0–10.4 L (0.122–0.182 AU)" is exactly round 6 of seed 1 (missiles only, 0.122–0.182 AU), drawn on the law (G 7.2 / 8.3 / 9.6 L at 0.122 / 0.150 / 0.182 AU), zero mis-banded pairs. The windows 3–4 / 7–9 / 12–15 L are windows for PAIRS at those distances, not for weapons | node probe (per-round shots by weapon); `ThreeRenderer.stageInfo`; DSCS cooldowns | small instrument fix — `stageInfo` by distance band over the last N rounds (with the CV-3b look) |
| **652** | ✅ | **Close up the ships "swim": the motion is the stage solver, not the logic.** The stage re-solves on 232 of 240 frames (the key holds the base positions, which change every frame while ships glide and the MOS engage order kites) and each warm-started solve moves ships by several L: at 1/3 zoom (0.93 WU, blend 0.72) drawn motion 6.4 L/s against 0.4 L/s of the logical base (17×); at the cinema frame after the gathering 200–600 px/s against 4–190 px/s; no global rotation (−0.1 / +1.8 °/s) — the ships move RELATIVE to each other (the pair relaxation drifts along its many valid solutions; priority pairs change every round and get the full pull). Not missing choreography: CV-3b's envelope (E ≤ 1 L, mostly tangential, D-CV-6) would be invisible on top of 5–15 L/s of solver motion | live probe CV-3a2 (frame samples: drawn / base / logical, 4 s at cinema, 3 s at 1/3; decomposition drawn = base + stage offset) | **✅ CV-3a3** (`0490ea5`; moved from CV-3b by §3.2-13): one solve per round on the LOGICAL positions (the glide end), the drawn offsets eased linearly over one round from the target displayed in the previous frame; a warm-started shell stage without pull passes — live drawn relative speed at cinema 14.08 → 0.66 L/s mean (logic 2.05), a body battle 0.17 (logic 0.40); keepers `cv_stage_temporal_smoke` T2–T6, `cv_stage_shell_smoke` P5 |
| **653** | ⚪ | **The circles and rings the owner does not want — four effects.** (a) red reticles on every enemy all battle long = the enemy alert markers (`_syncEnemyAlertMarkers`, 3D sprite #cc4433, pulsing, every enemy with intel ≥ rumor; 10 in a 10v10); (b) cyan rings at hits = the FX engine shield ring (`FxEngine` spark kind 1, `FX_SHIELD_COLOR` 0x66ccff, grows ×1 → ×3 over 1.2 R ≈ 1.2 s, alpha 0.8); (c) bright yellow / beige blobs at hits = the impact flash (spark kind 0, weapon colour — laser cyan, kinetic amber 0xFFD060, missile red 0xFF6060 — with a white core, ×1 → ×3 over 1.2 R, 6–48 px) plus the model glow (kind 2, white); (d) at the end 13 big pale-yellow discs = the wreck explosion fireballs (`_spawnExplosion`: additive HDR sphere of radius ≥ 0.08 WU = 5 L, 600 ms; colour ≈ #ffff96 measured) in ONE frame, because kills only materialise in `_finalizeBattle` (#615); the flat ring is already gone (#641). No HUD-canvas arcs during the battle (patched `arc`: 0) | live probe CV-3a2 (scene inventory + screenshots at hits and at the end; `FxEngine.js:265-271`, `FxShaders.js` spark, `ThreeRenderer._spawnExplosion`, `_syncEnemyAlertMarkers`) | **owner's decision 2026-11-08 (§3.2-11): stop-gaps under `cvStage` until CV-4 / CV-5 / CV-6a — done in CV-3a3** (`0490ea5`): (a) the 3D reticle fades with the ship's stage weight (gone from 0.25); (b)(c) flash 1.2 × model, growth ×1.5 / shield ring 1.8 × model, ×1.25; (d) fireball peak = hull × 1.5, no floor. Final looks: (a) **CV-6a** (the tactical layer owns enemy marking), (b) **CV-4b** (shield ripple on the hull), (c) **CV-4** (weapon language), (d) **CV-5** (layered explosion at the killing impact) |
| **654** | ✅ | **"The player always wins" does not reproduce in the fixture — the stager favours the AI.** GATE-S4, live: seed 1 PORAŻKA (losses 7 / 3), seed 2 PORAŻKA (7 / 2), seed 3 ZWYCIĘSTWO (7 / 4), all 20 rounds (time-out by total HP); headless seeds 1–6: the player wins 1 / 6; the player loses 7 of 10 ships in every run. Cause in the stager: side B's weapons are shifted by one position in the cycle (`pickName(weapons, …, i + offset)`, offset 1 for B) ⇒ the player's frigates carry lasers (0.05 AU) and the AI's frigates kinetics (0.15 AU) while the lines start 0.12 AU apart. DSCS asymmetries (mechanics, untouched): side A — always the player — fires first in a round (a B ship killed in A's volley does not fire that round; measured with B first: the player wins 0 / 6, loses 7 in every seed, the AI loses 1–3 instead of 1–4); player-only tech multipliers (`weapon_range_*`, `weapon_tracking_*`); AI-only auto-retreat; "Engage" only for side A (variants: as the stager B,B,A · none A,B,A · both A,B,A for seeds 1–3). The owner's save (not the fixture) likely has player weapon techs — DSCS applies them to the player only | node probe (seeds 1–6, variants, fire-order swap); live timing seeds 1–3; `CvBattleStager.cvBattleLayout`; `DSCS._tickEncounter` (`fireFromSide` A then B), `_resolveWeaponRange` | **✅ CV-3a3** (`0490ea5`; owner's decision (1), §3.2-10): mirrored loadouts — B takes A's per-index loadout (offset 0), "Engage" for side A only; live after: seed 1 PORAŻKA (7 / 4), seed 2 PORAŻKA (7 / 4), seed 3 ZWYCIĘSTWO (6 / 6). The rest is mechanics — the fire order and player-only techs → the MECHANICS candidate (#631) |
| **655** | ⚪ | **The course shown during the battle does not match the result.** (i) dead ships stay drawn and on the card until `_finalizeBattle` (#615), then 10–13 vanish / explode in one frame; (ii) the time-out (20 rounds) decides by total HP, so the side with fewer living ships can win (seed 3, round 11: the player 6 alive / 54 % HP against the AI 8 / 49 % → the player wins at time-out) — the card's "żywych N / M" looks like a loss; (iii) the time-out loser's survivors are wrecked at the end (side-level wreck), so "3 player ships left" disappear in a defeat | node + live per-round side HP and alive counts; `DSCS._checkEndConditions`, `_finalizeBattle` | **CV-4** (presented HP and kills at the killing impact) and **CV-6b** (the strip shows HP, not only counts); the time-out rule — mechanics (#631) |
| **656** | ⚪ | **How a ship picks its target in DSCS today** (answer, not a defect). Each weapon off cooldown picks: the "Engage" target (only ships with that MOS order — in the stager side A) when it is alive, on the other side and within THIS weapon's range; otherwise the NEAREST living enemy by logical distance, regardless of range — and if that nearest one is out of the weapon's range, the weapon does not fire (no fallback to another target in range). AI ships have no orders ⇒ always the nearest; no threat, role or doctrine logic. Between rounds a ship with no enemy within its longest weapon closes toward its "Engage" target, else the nearest enemy | `DSCS._pickTarget`, `_tickEncounter`, `_closeToWeaponRange` | none in CV — targeting / doctrines belong to the MECHANICS candidate (#631) |
| **657** | ⚪ | **A retreating AI ship is re-engaged at once.** After an encounter ends with the AI's retreat, its survivor is still within combat range and a new `combatRangeEnter` starts another encounter (by the #645 description the ProximitySystem self-heal re-emits it for such pairs [INF]) ⇒ a 1-round follow-up encounter with its own banner and Dziennik line (measured: split 2 × 2 → 3 battles, 2 banners; split 4 × 4 live → 7 battles, a merged cluster banner plus one short banner after the cluster ended). Inside a cluster's lifetime it folds into the cluster banner; after the cluster — a separate banner | node and live probes CV-3a2 (`cvBattle({ split })`); `ProximitySystem.js:272-281`; `DSCS._checkEndConditions` (AI auto-retreat) | separate small step **outside CV** together with #645 (no re-engagement of a retreating ship for a short window, or no self-heal for it) |
| **658** | ⚪ | **The Watch dive overflows the frame for ≈ 0.3 s.** During the automatic dive (#648 (b)) the drawn battle exceeds the safe rect while the blend is still low (as few as 6 / 20 ships inside the safe rect, 18 / 20 inside the window, for ≈ 0.3 s), then all 20 are in frame from 0.58 s. Inherent to the semantic-zoom curve: the battle's on-screen size peaks mid-zoom (the fit of the drawn battle exceeds the camera distance between ≈ 0.95 and ≈ 2.6 WU), so no continuous dive keeps every ship in frame | live probe CV-3a2 (dive frames); keeper A7b (the drawn fit stalls at 2.63 WU) | **owner's decision 2026-11-08 (§3.2-12): (a) accept for now; revisit in CV-7** (director camera) |
| **659** | ⚪ | **The shell group at the ship plane floats above small bodies.** The group stands at y 0.3 (the ship plane, `SHELL_PLANE_Y`) so that a click in it lands on the plane it is drawn on (#646 (b)) and a camera above the orbit plane sees it over the body's limb; at a big body it stands beside the body (gas giant, drawn r 0.59 WU: 0.65 WU sideways, 0.3 up), but at a moon (r 0.015–0.04 WU) or a small rocky body it is ≈ 0.09–0.2 WU sideways and 0.3 WU (≈ 19 L) above the body's plane — it may read as hovering over the body rather than around it. Not seen live (the stager's `atBody: 1` picked a gas giant) | `BattleStageLogic.applyShell` (`P.y = planeY`), `STAGE.SHELL_PLANE_Y`; `RaycasterHelper.SHIP_PLANE_Y` | owner's look (`cvBattle({ atBody: '<moon id>' })`); option — height `min(0.3, body radius + k L)` with the click plane following the group (the #646 trade-off returns) — with CV-6a / CV-7 |
| **660** | ⚪ | **`cvBattle({ atBody })` — the same seed is not the same battle at another moment.** Orbit slots take their phase and ω jitter from a hash of the vessel id and their angle from the orbit clock (`orbitClockSec` — the sim clock, anchored to real time at the first tick); the stager makes new vessel ids on every call (a module counter) and reads the clock at the call ⇒ the orbiters' logical positions, and with them the DSCS result, differ between calls and sessions. Deep-space stager battles are unaffected (fixed points; seed 1 gives the same signature in the game and headless). Keepers reset the mocked clock and the id counter (`cv_fx_results_smoke` A5: without that, the same body battle without a renderer gave two different signatures) | `OrbitalSpaceSystem.js:148-158, :208`; `SimClock.orbitClockSec`; `CvBattleStager.cvBattle` (`atBody`) | accept — a body battle is for looking, not for comparing results; if needed, orbit phases from the seed (an `assignOrbit` option) — a small stager change |
| **661** | ⚪ | **Geometric limit of the shell: a dense 10+10 battle with both sides pinned at a rocky or icy body falls back.** With everyone at the body (10 enemies pinned at its centre, 10 orbiters at 1.9–2.5 body radii) almost every pair is in the laser band, so 20 ships must keep ALL pairwise gaps inside [1.6, 3.64] L — a packing limit. Node, 40 random configurations per cell: rocky / icy bodies (drawn r 0.06–0.20 WU) 10+10 — 43–78 % end in the relaxed arrangement (`fallback`, 1.5–4 mis-banded pairs of 190, smallest pair 1.0–1.3 L — once 0.93 L in 200); 8+8 and smaller, moons and gas giants — 0 %. Live (gas giant, 10+10) — 0 mis-banded. The class of #649 (accepted (a), §3.2-9), but without a uniform scale (it would collapse the pinned enemies into one point) | node probe (scratchpad, `solveStage({ shell })`); `cv_stage_shell_smoke` P2 (11 of 168 configurations, all 10+10 with both sides pinned) | owner's call — recommended: accept like #649 (a few pairs drawn one band off in the densest colony battles, `stageInfo` shows `awaryjna`) |
| **662** | ✅ | **A move order clicked inside a battle at a body always becomes "fly to the planet" — the 0.5 AU snap (FAIL 5 of the CV-3a3 check).** "Lecisz tutaj" builds `{ type: 'moveToPoint', targetPoint }` without a body; `_issueMoveToPoint` takes the body nearest the point within `SNAP_TO_BODY_AU` 0.5 AU (made for "a click next to a planet should orbit it", live gate T7). A battle at a planet lies entirely inside that radius (gas giant drawn radius 0.054 AU; the clicked point 0.02–0.13 AU from it after the stage inverse, 0.07 AU before), so no empty-space click in such a battle can be a point: 3 / 3 menu runs → `mission.targetId` = the planet. Order semantics are mechanics (F1) — not changed in CV. **Variants for the owner:** (a) no snap when the click resolves inside a staged battle (the producer marks the spec, e.g. `noBodySnap`, when `stageLogicalOf` answered `staged`; MOS skips `_findBodyNearPoint`) — the ship goes to the logical point (± the guard, measured 2.5 L median from the cursor), it leaves its orbit and drifts there; in a battle with BOTH sides at the body the logical points under the drawn group lie at the body itself (≤ 1–2 body radii, partly inside the planet at true scale) · (b) snap only within the body's drawn radius (× margin) — changes every move order in the game, and in a body battle the logical points still fall inside that radius (the ships are logically at the body) ⇒ does not fix FAIL 5 · (c) keep: a click in a body battle = "orbit this planet" (then 663 must be fixed and the menu should say so). Recommendation: **(a)**, scoped to staged clicks, together with 663 | real game, `f5_probe` / `gate_lines_probe` (scratchpad): spec, `_findBodyNearPoint` distance, `mission.targetId`; `MovementOrderSystem.js` `_issueMoveToPoint` (snap block); `VesselManager.js:99` `SNAP_TO_BODY_AU`; `RightClickMenuOptions.js` `empty` | **owner 2026-11-09: (a) ✅** — implemented in the CV-3a3 second pass: `staged` click → `noBodySnap` (menu ship / fleet, both fleet move pickers) → MOS and the fleet arrival sync skip the snap; flag OFF = today (`cv_stage_no_snap_smoke` 15 / 0) |
| **663** | 🟠 | **"Fly to the planet" for a ship already at the planet can send it across the system.** `_interceptBody` (SB39) takes the FIRST time the ship can meet the body; for a ship slower than the body's orbital speed and behind it on the orbit that meeting is on the far side of the orbit — measured twice: the target 32.7 AU away beyond the star (≈ 28 years at ≈ 1.2 AU/yr) for a ship that was 0.1 AU from the planet on its orbit slot; a ship ahead of the planet (1.54 AU/yr) — 12 days. Reachable without CV: a docked ship given "Lecisz do planety" on its own body, or any point within 0.5 AU (662). Mechanics, outside CV | real game (two of three runs; panel "ruch: (222, −1683)" / "(202, −1686)"); `VesselManager._interceptBody`, `_bodyMotionBound` | **owner 2026-11-09: a separate small MECHANICS step OUTSIDE CV, right after #640.** Measured three times: the game (two of three menu runs) — target 32.7 AU beyond the star (≈ 28 years at ≈ 1.2 AU/yr), panel "ruch: (222, −1683)" / "(202, −1686)"; headless (`cv_stage_no_snap_smoke` N2a on the pre-fix tree) — a 1.0 AU/yr ship 0.05 AU from a 3 AU planet (orbital 3.6 AU/yr) gets the target (41.4, −327.4) px, beyond the star. **Proposed fix shape:** (i) a ship docked at / orbiting the target body → no new intercept (keep the orbit; refuse with a translated `already_at_target`, or hide "Lecisz do planety" for its own body); (ii) otherwise cap the first-meeting search of `_interceptBody` at a short horizon (e.g. a quarter of the body's orbital period) — when the ship cannot meet the body within it, refuse with a translated reason (e.g. `target_outruns_ship`) instead of a cross-system rendezvous; (iii) keepers: slower ship behind the planet → refusal, not a 30 AU trip; ship ahead / faster → today's near meeting unchanged; fleets (`GroupArrival`) the same rule |
| **664** | ✅ | **Freeing one ship swung the whole body-battle stage around the planet.** `shellBearing` treated every free ship outside the side with more ships at the body as "the opposing side": a player ship taken off its orbit by an order (10 : 9 for the enemy) flipped the bearing to it, and the group rotated around the body in one round on a chord through it (measured 158° / 161°, ships over the disc on 8 / 30 frames, the freed ship at 0.41 body radii); the `player` source (centroid of the pinned player ships) could jump too | real game `swing_probe` before / after (scratchpad); `cv_stage_shell_smoke` P1e, P1f, R10 | **CV-3a3 fixes 2026-11-09 ✅** — outside force = sides mostly free (with both sides at the body); `player` over all player ships; after: 2.4° / 5.1°, 0 frames over the disc |
| **665** | ✅ | **The body-battle click field inverted around the drawn group on both sides.** The stage draws a shell battle as the radial map around the logical centroid translated by the shell shift; the field took the drawn group as the logical centre too — logical point off by the compressed shift (field ↔ stage agreement 1.3 / 2.4 / 4.2 L median at bodies 0.1 / 0.3 / 0.6 WU; a ship sent to the inverted point 3.6 L from the cursor vs 3.2 L in free space) | node, real renderer methods (scratchpad `agree_probe`, `field_probe3`); `cv_stage_shell_smoke` P6, R6c | **CV-3a3 fixes 2026-11-09 ✅** — shifted field (`shift`): agreement 0.6–0.9 L, a sent ship 2.5 L |
| **666** | ✅ | **Enemy 3D reticles return at the tactical zoom — by design of the #653 stop-gap.** The reticle fades with the ship's stage weight and is gone from 0.25 of it (`STAGE_RETICLE_FADE_K`) — identical for free and body battles (measured, both kinds: 0 reticles at `fregataPx` ≥ 10.6, 10 / 10 below; at the owner's 5.6–7.7 px 63–92 % opacity). Options: (a) keep until CV-6a · (b) no 3D reticle on any participant of a battle in view, at every zoom (the HUD ship markers — red rhombs, role `alert` — still mark enemies) · (c) hide from blend > 0 (frigate ≥ 4 px), keep only at true scale. Recommendation (b) — the owner's complaint was "reticles on every enemy all battle long", and CV-6a owns enemy marking | real game `reticle_probe` (scratchpad); `ThreeRenderer._syncEnemyAlertMarkers` (`stageFade`) | **owner 2026-11-09: (b) ✅** — implemented in the CV-3a3 second pass: `_stageParticipants` (every encounter cluster in view, also without a stage) — no reticle at any zoom; measured 0 at `fregataPx` 40.9 → 4.3 during the battle; `cv_stage_temporal_smoke` T8a (re-aimed), `cv_stage_shell_smoke` R11 |
| **667** | ⚪ | **A real bearing change is drawn as a straight transition through the body.** Offsets go linearly from the displayed target to the new solution over one round; when the shell bearing does change (after 664 only on a real change — most of a side leaves orbit, a free side appears), the chord crosses the body and `avoid` presses the ships onto the shell sphere for the round. An angular (polar, around the body) transition would arc around it | code reading + the 664 measurements before the fix | CV-3b (stage motion) or later |
| **668** | ✅ | **A ship in flight inside a battle was written straight to its true-scale position between frames.** The in-flight branch of `_syncVesselPositions` (on `vessel:positionUpdate`) set the sprite directly (the class of R9's orbit write); readers between that tick and the next frame — the HUD layer's own loop, the click — saw the ship off the stage. Measured in the game while validating #662 (a ship hopping inside the body battle): the read drawn position jumped 26–31 L for one to two samples every ≈ 11 s; the rendered frame was right (the next frame re-staged it) | real game `gate_lines2_probe` (scratchpad); `ThreeRenderer._syncVesselPositions` (in-flight branch) | **CV-3a3 second pass 2026-11-09 ✅** — the in-flight branch through `_setSpriteBase`; after: 0 jumps; `cv_stage_shell_smoke` R9d |

| **669** | ✅ | **Ships stopped at every round boundary (the "stop-and-go" of the owner's stutter report, §3.2-22).** The stage offset went linearly from the displayed target to the new solution in `combatRoundMs`, then stood at the solution; in the game a round lasts longer than `combatRoundMs`, so ships stood for the rest of the round and restarted with a velocity jump | live (RTX 3070, GATE-S4, `cvBattle()` 10v10): boundary stops 18 % cinema / 11.1 % mid, speed at the boundary 0.21 / 0.32 of the pre-boundary value (median), velocity jump p95 4.25 / 1.43 L/s | **CV-6b ✅** — `StageMotionLogic` Hermite segments from the drawn state with the target's velocity, decaying continuation past the end: stops 1 % / 0 %, ratio 0.77 / 0.81, jump p95 0.64 / 0.065 L/s; keeper T9 |
| **670** | ✅ | **A free-space battle rode on the logic glide.** Drawn = glided base + stage offset; the glide retargets in 150 ms steps and ends before the round does, so the knot jerked with the glide while the offsets stood | `_placeFreeVessel` / `_tickCombatGlide` (`glideRetarget` / `glideStep`, linear over `combatRoundMs`); live probe — the drawn path follows the base steps | **CV-6b ✅** — free clusters solve and move in the world frame (`fid 'w'`), body battles in the body frame; keeper T11 (another glide — identical drawn positions; witness: base positions differ by 0.05 WU) |
| **671** | ✅ | **A kill jerked the Watch / auto-focus camera.** `_stageWatchFit` built the pivot from ships with hp > 0; a kill dropped the ship from the axis in one frame while its sprite stayed on the stage | live: camera goal speed 12.8 / 10.5 / 48.7 / 24.7 L/s on 4 / 4 kill frames | **CV-6b ✅** — the pivot takes every drawn participant (DSCS keeps the dead in the encounter until the end): 0.1 / 0.3 / 0.0 / 0.4 L/s; keeper T10 (KONTROLA — the live-only axis moves 1.04 L) |
| **672** | ✅ | **The warm-started stage solver random-walked (the "jitter rounds").** Every round 40 pull passes at weight 0.5 over 190 pairs moved the whole solution although the logic barely changed | live: relative solution step per round median 0.41 L, p95 2.31 L; 40–52 % of consecutive steps reversed direction; offline on 3 recorded battles 0.40–0.55 / 2.2–2.9 L | **CV-6b ✅** — `STAGE.WARM_PASSES` 4 at `WARM_PULL` 0.25 (cold unchanged): live 0.21 / 0.69 L; shots in the weapon window 96.4 / 90.9 / 93.3 % (was 96.4 / 93.5 / 96.1); keeper L5c (KONTROLA — the old setting walks) |
| **673** | ⚪ | **The logic glide quantizes and ends early.** `glideRetarget` re-aims in 150 ms steps and the linear glide finishes before the next round, so a ship's base motion is a staircase of short linear moves. After CV-6b the stage no longer shows it in a free battle; it is still visible for a ship joining or leaving the stage (the 500 ms entry / exit blends base and stage) and with `cvStage` OFF | `CombatWatchLogic` `glideRetarget` / `glideStep`; `ThreeRenderer._tickCombatGlide`; live probe (before CV-6b) | CV-3b (choreography gives participants their own motion) or later — not blocking |
| **674** | ⚪ | **Far zoom after decision 20: a 10v10 is a knot of a few pixels.** With the stage held at every zoom the drawn battle keeps its stage size, which at the whole-system view (camera 85 WU) is a knot of ≈ 3.5 px; the HUD stack "⚠ ×N" carries it, while the FX engine's pixel floors (`MIN_PX` 3, `TRACER_CORE` 4 — the owner's tuning) make beams and sparks as wide as the knot itself [INF — not looked at live] | render harness at 85 WU (R17 setup); `LIVE_CV_FX.MIN_PX` / `TRACER_CORE` | CV-6a — the tactical layer's far language (icons, bands, fire lines) is meant for exactly this view |
| **675** | ⚪ | **A mop-up encounter re-tells the battle.** The banner and (under `cvStrip`) the Dziennik announce a cluster at its LAST `battle:resolved`; when survivors of the same battle engage again (a duel ran out at 20 rounds and the ships freed by the other duels, still in range, engage the last enemy), DSCS opens a NEW encounter in the same frame, after the announcement — a second cluster in time, so a second banner (pause), battle line and skirmish line. Live split 4v4: 5 encounters → 2 announcements (the four duels — 20 rounds, 3 enemy losses; then the mop-up — 1 round, 1 loss); the strip shows it as one battle (the expansion follows the same ships). Proposal: hold the cluster's announcement a short grace on presentation time and fold an encounter that starts within it with ships of the cluster — it changes the CV-3a2 banner timing ⇒ the owner's decision | `BattleClusterLogic.clusterGroupStep`; `GameScene._clusterBattleBanners` / `_narrateBattleCluster`; `DeepSpaceCombatSystem` (encounter start after `_finalizeBattle`); `validate.json` step 4 | **owner's decision 2026-11-10 (§3.2-25): yes to a grace window ≈ 1–2 rounds — not now; scheduled with #640 in the small step outside CV (one message per event)** |
| **676** | ✅ | **The combat card never took part in `isOverUI`.** The wheel, a camera drag and map hover went through the card (only its clicks were caught); the strip is in `isOverUI` like every other panel, so the camera does not move under it — a deliberate difference; the card on the OFF path keeps the old behaviour | `UIManager.isOverUI` (no `combatHud` test); `CombatHUD.handleClick` | **accepted as designed (owner 2026-11-10, §3.2-24)** — the strip blocks like every panel; the card's OFF path keeps the old behaviour until CV-Z removes the card |

Cross-references (existing numbers, not refiled): **165** (orbital defence has no rounds — CV-8a gives it a presentation),
**161** / **163** (banner pause and Polish literals — CV-8b), **453** (cross-system combat drawing — #628 is its orbital
twin), **456** (EAH real-time batching), **460** (wrecks teleported to the midpoint — #615 / #627 present around it).
