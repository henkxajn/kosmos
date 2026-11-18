# FINDINGS BACKLOG — open items after ARC CONSOLES (recorded 2026-11-18)

Recorded after the CONSOLES arc closed (`d393d21`). Each finding's truth stays in its own arc registry
(`CONSOLES_PLAN.md` §5 / §25); this file is a work queue: the problem, where it lives, status, owner decision and
the ready next step. Before starting any item: run its keeper / `git log -S`, re-measure. Next free finding number: **771**. (#769 — system-seed mode read from the live flag — ✅ closed in CS-3a-fix, `COLONY_SPHERE_PLAN.md` §3.2.)

## Findings

| # | Status | Problem (one line) | Where | Owner decision | Ready next step |
|---|---|---|---|---|---|
| **740** | ⚪ | Founding an outpost switches the global active colony to it — top bar shows the outpost's zeros, today's Trade refuses orders («is_outpost») | `GameScene.js` `outpost:founded` listener → `ColonyManager.switchActiveColony` | **2026-11-18:** founding an outpost must NOT change the active colony; switch only when the player has no valid active full colony (`isOutpost !== true`) | Small fix + fail-first keeper: `createOutpost` with an active full colony keeps `activePlanetId`; with none it switches. Report the other automatic switches (founded / captured / lost) without changing them |
| **741** | ⚪ | AI partner colonies may hold 0 Kr, so a player SELL order on Rynek can be dead (settlement needs `aiCol.credits ≥ total`) | `TradeOrderBoard._settle`; AI colony `credits` vs empire treasury | — | **Audit only first:** credit sources/sinks for AI colonies (empire vs colony treasury); 20–30 year headless run for 2–3 AI empires with per-colony Kr; can any AI colony ever pay a player sell order; 2–3 fix shapes with trade-offs |
| **730** | 🟠 | Full 3D system scene renders at 60 fps under every tab (5.3 ms GPU/frame at 1600×1041) — live backdrop cost accepted at arc close | `ThreeRenderer._startLoop`; console backdrop (D-K-5) | Live backdrop kept (KZ-Kit) | If needed: design a low-GPU mode anew (own audit) |
| **736** | ⚪ | Combat strip overflows the console header slot with 2–3 simultaneous battles (each battle adds a 21 px line over the inspector) | `CombatStripLogic.js` `combatSlotInsets`, `stripLayout` | Owner: collapse to one «⚔ N ▼» chip in the slot | Small UI step: chip + dropdown, logic keeper |
| **744** | ⚪ | Dead leader trait `dysonProgress` — bonus «Sfera Dysona ×3 szybciej» shown, `DysonSystem.getDysonProgressMultiplier()` read nowhere | `LeaderData.js:193`; `DysonSystem` | 2026-11-17: Dyson's future decided in the new endgame design | Resolve inside the endgame design (below) |
| **748** | ⚪ | Logistics-pool toggle (also scrap / refuel) unreachable on today's ship panel when the ship has no mission actions (in flight) — console keeps parity | `_drawActions` early return on empty `getAvailableActions`; console inspector | — | Decide: pool zone on the console inspector regardless of actions |
| **750** | ⚪ | Atlas «set as mission target» branch unreachable since K7-pre (`_switchTab` drops `_missionConfig.step === 'select'`) | `FleetManagerOverlay._handleHit` `map_body` | — | Remove the dead branch or restore a path from Atlas to the configurator (owner pick) |
| **756** | ⚪ | `GroundUnitManager.createUnit` silently accepts a non-existent archetype id (no error, no refusal reason); not called by the game today | `GroundUnitManager.createUnit` | — | Guard + reason, keeper red on an unknown id |
| **757** | ⚪ | Standalone U screen has no in-game host (U routes to Shipyard); `UnitDesignOverlay.draw` / `_drawShipDesigner` / pinned footer and `UIManager._drawCivPanel` / `_hitTestCivPanel` unreachable (instance stays as shared editor). Covers 726 | `UnitDesignOverlay.js`, `UIManager.js` | — | Candidate removal step (keep the shared editor) |
| **758** | ⚪ | EN label mismatch: inspector chip «Scrap (75% refund)» vs confirm title «Disband (75% refund)»; PL consistent | `en.js` `cmdInsp.scrap`, `fleet.disbandReturn` | — | One-line i18n fix + `check-i18n` |
| **768** | ✅ | Chrome perf warning «READ-usage buffer was written, then fenced, but written again before being read back» under any console | `ThreeRenderer.js` `_bdStart` | — | **Closed 2026-11-18 (fix step 770+768):** `gl.bufferData(PIXEL_PACK_BUFFER, gw·gh·4, STREAM_READ)` right before `readPixels` (no flag — identical data). CDP GPU: 256 (Chrome cap) → 0 warnings over ~290 samples; luma byte-identical. Keeper `console_backdrop_smoke` W8. Owner check PASS |
| **770** | ✅ | `LifeSystem` recomputed active-system `temperatureC` every 1000 game years with the HOME star; wrong star in foreign systems, undid the homeworld clamp (M home 10 → −131 °C) | `LifeSystem.js`, `utils/HomeworldClimate.js` | — | **Closed 2026-11-18 (fix step 770+768):** each planet uses its own system's star; player + AI homeworlds keep the 5–35 °C generation band (corrupted saves repaired to 10/25 °C). `FEATURES.lifeTempOwnStar` default true (OFF = old path bit-identical). Known limitation: a destroyed empire's homeworld loses the clamp protection. lifeScore rise on AI homeworlds: no gameplay effect (LifeSystem is legacy). Keeper `life_temperature_smoke`. Owner check PASS. Notes: (1) CS-PHYS makes temperatures generation-time frozen → `LifeSystem._recalcTemp` gets switched off there; (2) idea, not scheduled: reuse LifeSystem as a life generator for the player to discover in unowned systems |

## Art / assets

| # | Status | Problem | Next step |
|---|---|---|---|
| **728** | ⚪ | Medium and Large cargo hulls share one model (`nonwarp_medium_cargo.glb` ≡ `nonwarp_large_cargo.glb`); `cargo3d.glb` ≡ `default.glb` (unused) | New model for one of the hulls (art pipeline, `npm run ship`) |
| **729** | ⚪ | 15 building / icon textures referenced but missing in `assets/` (404 live), e.g. `assets/buildings/{geothermal,terraformer,orbital_mine,ai_core,…}.png` | Produce the art, or map to existing icons |
| — | waiting for owner | Player emblem asset `assets/ui/emblems/player.png` — white on transparent, 512×512 | Owner provides the file; then wire it |

## Topics (own audit, plan and owner sign-off)

- **Shipyard choice mechanics** — `CONSOLES_PLAN.md` §14: pick any capable shipyard (ground or orbital station with a shipyard module),
  build and reserve at that shipyard, deploy only there. Data / save / AI impact → Phase A audit.
- **Science / Observatory on the console template** — Tech and Observatory still non-console screens (incl. 731: Observatory has no close
  control; `NavEdgeShim` lists `tech` as DOM).
- **New endgame design + Dyson future** — includes 744.
- **Next arc (owner, 2026-11-18): Colonies tab revolution** — the flat 2D colony map becomes a 3D planet sphere in the console style.
  Concept discussion first, then a Phase A read-only audit. Not started.

Earlier minors still open (see `CONSOLES_PLAN.md` §5): 731, 733, 734.
