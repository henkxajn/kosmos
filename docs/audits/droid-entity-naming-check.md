# Droid entity naming check — `automation_droid` vs `android_worker`

> Pre-step of the **BALANS 1.0 / Phase 2 — AI empire instrumentation** slice.
> Question asked: *is `automation_droid` still a live, reachable entity, or a naming relic?*
> **Read-only check. Nothing was renamed, fixed or re-priced.**

## Answer

**Both are live, reachable entities. Neither is a relic.** They are the two tiers of the same
mechanic (synthetic workforce), and the confusion runs the *opposite* way to the hunch: the entity
that was recently pushed out of most call-sites is `android_worker` (tier 2), not `automation_droid`
(tier 1).

| | `automation_droid` | `android_worker` |
|---|---|---|
| definition | `CommoditiesData.js:227` | `CommoditiesData.js:201` |
| display name | Droid / *Droid* | Android Robotniczy / *Android Worker* |
| `tier` / `droidTier` | 1 / **1** | 3 / **2** |
| tech gate | `requiresTech: null` → **available from game start** | `requiresTech: 'android_engineering'` |
| recipe | `Li 300, C 1000, Fe 1000, Cu 500, Si 2000` | the same body + `electronic_systems 5, semiconductor_arrays 3, polymer_composites 2` |
| `creditCost` | 500 Kr/unit (AI colonies exempt — `FactorySystem.js:1449`) | 1200 Kr/unit (same exemption) |
| efficiency bonus | +40 % (`SYNTH_EFFICIENCY[1] = 1.4`) | +70 % (`SYNTH_EFFICIENCY[2] = 1.7`) |
| strata it may staff | `laborer, miner, worker` (`ALLOWED_SYNTH_STRATA[1]`) | unrestricted (no tier-2 entry) |
| install priority | **first** (`BuildingSystem.DROID_INSTALL_PRIORITY[0]`) | second |

## Reachability evidence (`automation_droid`)

* **Producible from turn one** — `requiresTech: null`, `isDroidUnit: true`, so it is ordered through
  the Build-N one-shot path (`FactorySystem.setDroidOrder` / `droidOrders`), not through reactive
  safety stock.
* **Consumed as a build cost** by five buildings: `autonomous_spaceport` (×2, `BuildingsData.js:345`),
  `autonomous_mine` (×1, `:417`), `autonomous_solar_farm` (×1, `:506`), `orbital_mine` (×1, `:677`),
  `ai_core` (×2, `:701`).
* **Consumed by the AI** — `EmpireStrategySystem.DROIDS_PER_OUTPOST = 2` (an AI outpost = autonomous
  solar + autonomous mine = 2 droids); `_maybeOrderOutpostDroids` places the Build-N order.
* **Consumed by the player** and by the reference bot — `BuildingSystem.installSynthetic` /
  `RuleBot.js:546,600,674`.
* Priced in `TradeValuesData.BASE_PRICE` at 450 Kr; declared (at 0) in `STARTER_RESOURCES`.

## Reachability evidence (`android_worker`)

* Still the only droid allowed to staff `engineer / scientist / merchant / bureaucrat`
  (`BuildingSystem.autonomizeBuilding`, `:613`, tier split at `:630`), still gated on
  `android_engineering` (`COMMODITIES.android_worker.requiresTech`; `unlockCommodity` effects in
  `TechData.js:1338` *robotics* and `:1354` *android_engineering*), still in the Industrialist
  research queue.
* What it **lost** in *Population 2.0 Phase 5B* (`a02f070`) was the **build-cost** role: every
  `android_worker: N` in `BuildingsData` was swapped to `automation_droid` (jobs-count rule). The
  literal `android_worker` tokens left in `BuildingsData` / `EmpireStrategySystem` are **comments
  documenting that swap**, not live references. That is very likely the source of the "is this thing
  still real?" feeling — but the *entity* is live, only its cost role moved.

## Consequence for this slice's metrics

The AI outpost blocker to measure is **`automation_droid`** (tier 1). Measuring `android_worker`
stock as "the AI's droid supply" would measure a phantom for outposts — the AI does not need it for
`autonomous_mine` / `autonomous_solar_farm` any more. `android_worker` remains relevant only as a
*staffing* option for high strata, and only after `android_engineering`.

## Side observation (not part of the question, not fixed)

`TradeValuesData.BASE_PRICE` lists `android_worker: 160` with the trailing comment
*"wymaga 5×electronic + 3×semiconductor + 2×polymer"* — that comment describes the **pre-5D recipe**.
Since *Phase 5D FIX A* the recipe is `automation_droid`'s full body **plus** those three advanced
components, so `android_worker` is strictly more expensive to build than `automation_droid` while
being priced at **160 Kr vs 450 Kr**. This is the same class of finding as the `warp_cores`
mispricing recorded in the PRICES slice: a stale price left behind by a recipe change. Logged here
only; **repricing is Phase 3**.
