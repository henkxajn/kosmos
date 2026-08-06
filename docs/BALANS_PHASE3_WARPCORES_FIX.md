# BALANS 1.0 — Phase 3 · `warp_cores` re-priced + `android_worker` diagnosed — result

> **Status: CLOSED.** One balance constant changed (`BASE_PRICE.warp_cores`, 500 → 1420), recomputed from
> the recipe by the price table's **own declared formula**. `android_worker` was **investigated and left
> untouched** — the diagnosis is in §4 and it concludes *do not patch*.
>
> **This is Phase 3 (tuning), not Phase 2 (measurement).** The Phase-2 record
> (`docs/BALANS_PHASE2_PRICES.md`, findings 22–23) stands as the "before".

All figures are **game-years**; 1 gy = 12 civ-years. Panel: REAL / 8 seeds / 45 gy, the same shared driver
and reference bot as every other slice.

```
# after (this record):
KOSMOS_QUIET=1 node src/testing/headless/balans-price-telemetry.mjs --class=REAL --seeds=8 --gy=45
#   → src/testing/reports/balans/price-{telemetry,report}-REAL.{json,html}

# before (preserved, launcher-servable side by side):
#   → src/testing/reports/balans/price-{telemetry,report}-REAL_PRE_WARPFIX.{json,html}
#     (reports dir is gitignored — the numbers below are the durable record)

node src/testing/smoke/balans_price_audit_smoke.mjs      # 64/64  (T3 now pins the FIXED state)
node src/testing/smoke/balans_price_telemetry_smoke.mjs  # 51/51
node src/testing/smoke/balans_price_report_smoke.mjs     # 43/43
```

---

## 1. What was changed, and why exactly this number

`TradeValuesData` declares its own pricing rule in the header above the table it governs:

> *„Formuła: koszt surowców w recepturze × 1.3 (marża za przetworzenie)"*

and the audit measures conformance **to that rule** (`PriceAudit.js:134` — `conventionKr = directKr × 1.3`,
where `directKr` is the recipe's inputs at *their own listed price*). So the fix is arithmetic on the
table's own terms, not a judgement about what a warp core "should" cost:

| input (`CommoditiesData.js:369`) | qty × listed price | Kr |
|---|---|---|
| `quantum_cores` | 2 × 250 | 500 |
| `antimatter_cells` | 2 × 280 | 560 |
| `Ti` | 8 × 4 | 32 |
| **inputs** | | **1 092** |
| **rule: inputs × 1.3** | | **1 419.6 → 1 420** |

**1 420 is not hand-picked.** It is the formula's own output at the table's integer granularity — the
generated report was already printing *„konwencja 1420 Kr"* in this row while the table said 500. Choosing
any other value (a rounder 1 400, a "feels endgame" number) would have replaced one exception with another;
this restores the row to the rule and nothing else.

The old comment `// 2×quantum_cores + 2×antimatter + Ti:8 → endgame` listed the recipe but never derived a
number from it. The new one carries the arithmetic, so the next reader can check the price against the rule
without leaving the line.

## 2. Layer A — the static audit, before and after

Deterministic property of the data (no simulation), measured with the shared audit:

| | before | after |
|---|---|---|
| price | 500 | **1 420** |
| conformance to the table's rule | **×0.352** | **×1.000** |
| price ÷ market inputs | ×0.458 | ×1.300 |
| price ÷ ore (recursive) | ×0.799 | ×2.268 |
| class | `suspect_below_cost` | **`conforms`** |
| robust z vs the table's convention | **−5.45** | *(not an outlier)* |

Table-level: `conforms` **15 → 16**, `suspect` **2 → 1** (only `propulsion_systems` remains below cost
without a sink marker), `belowCost` **4 → 3**. **Median conformance stays ×0.962** (n = 22) — the slice's
headline "the table mostly obeys its own rule" is unchanged; one row moved from breaking it to keeping it.

No cascade to audit: **no commodity recipe consumes `warp_cores`** (verified — the recipe-user set is
empty). It is consumed only by two buildings and two ship modules, and those cost it in *units*, not in Kr.

### 2.1 Side effect worth naming: the outlier detector got sharper (observation, NOT adjudicated)

`priceOutliers` is a **robust z-score relative to the panel itself** (median + MAD on log-conformance).
Pulling the single worst violator back to ×1.00 tightens the spread, so everything else's z grows:

| row | z before | z after | class |
|---|---|---|---|
| `android_worker` | −22.57 | **−31.25** | `design_sink` (excluded from the verdict) |
| `automation_droid` | −16.49 | **−22.83** | `design_sink` (excluded) |
| `warp_cores` | **−5.45** | — | now conforms |
| `civilian_goods` | *(below threshold)* | **+3.96** | `off_convention` — **newly surfaced** |

`civilian_goods` (×1.63, i.e. priced *above* the rule — it covers its inputs with a fat margin) has not
changed at all; it simply stopped being hidden behind a bigger deviation. **Logged, not fixed** — this is
Phase 3's one-change-at-a-time rule, and a margin that is too generous is a different kind of finding from
a price below its inputs. The static verdict therefore still reads `1 SUSPECT` (from `propulsion_systems`),
with the single non-sink outlier now being `civilian_goods` instead of `warp_cores`.

## 3. Layer B — what moved in the measured panel: almost nothing, and that is the honest result

Full diff of the panel aggregates, before vs after (8 seeds × 45 gy, 0 crashes both runs):

```
Δ panel.localPriceMed.warp_cores  : 1500 → 4260
Δ panel.verdictStatic.suspect     : 2 → 1
Δ panel.verdictStatic.outlierIds.0: "warp_cores" → "civilian_goods"
Δ panel.verdictStatic.label       : "…2 cen poniżej wsadu…" → "…1 cen poniżej wsadu…"
```

That is the **entire** diff. Affordability classes, the Kr ledger (income / wages / fleet upkeep / droid
production / net), credits end and min, stockpile values, measured capex, nameplate rates — **byte-identical**.

Why so little moves, stated plainly:

- **The realised price is structurally pinned, not measured.** `warp_cores` is tech-gated and the reference
  bot never produces one, so its stock is 0 in every sampled year, `scarcityMultiplier` returns its maximum
  ×3.0, and the "realised" price is just `BASE_PRICE × 3` — 500 × 3 = 1 500 before, 1 420 × 3 = 4 260 after.
  Same structural pin the PRICES slice recorded for energy (§2.1, finding 28), reached by a different route:
  energy because it is a flow, `warp_cores` because it is never made.
- **`BASE_PRICE` has a small, contained consumer set** — `CivilianTradeSystem`, `TradeOrderBoard`,
  `TradeOverlay`. No build gate, no tech gate, no AI decision threshold reads it. The constant changes what
  a warp core is *worth*, never what anyone *does*.
- **Building costs are unaffected.** ROI measures buildings at their fully-loaded **ore** cost, which expands
  recipes to raw resources and never touches the assembled good's listed price. Only the informational
  "ticket" figure moves (`warp_beacon` 6 480 → 11 080 Kr, `jump_gate` 21 800 → 40 200 Kr with commodities at
  market price); ore-loaded cost stays 6 750 / 23 530 Kr — and neither building was ever built in the panel.

**So the honest summary is: this fix does not move a measured curve** — it removes a rule violation from the
table and corrects a valuation that would have mattered the moment a real player (who, unlike the bot,
researches `ion_drives` and builds warp cores) tried to trade one.

## 4. `android_worker` — diagnosed, deliberately NOT changed

The task was read-only: decide whether the 160 Kr price is a bug to fix, a dead value, or an active
mispricing. **Verdict: leave it.** Unlike `warp_cores`, this is not a rule violation — and "correcting" it
would break a *different* convention that the data declares explicitly.

1. **The price predates the recipe it claims to describe by four months.** `BASE_PRICE.android_worker: 160`
   was written in `5558ebd` (2026-03-27, "Trade economy reform"); the recipe was last rewritten in `8f6f649`
   (2026-07-30, Population 2.0 Phase 5D FIX A). The trailing comment *„wymaga 5×electronic + 3×semiconductor
   + 2×polymer"* describes the **pre-5D** recipe. Today it is `automation_droid`'s full body **plus** those
   three components, plus `creditCost: 1200`. Same class of staleness as `warp_cores`.
2. **No build / install / AI path reads the price.** Droid selection is by stratum and tier, never by cost:
   `BuildingSystem.DROID_INSTALL_PRIORITY` (`:426`), `droidTier` + `ALLOWED_SYNTH_STRATA` (`:443-513`),
   `autonomizeBuilding:630` (`tier1Ok ? 'automation_droid' : 'android_worker'`). Outside the trade layer
   there are **zero** `BASE_PRICE` reads.
3. **The AI cannot even hold one.** `targets/industrialist.js` still lists `safetyStocks.android_worker: 9`,
   but that routes through `FactorySystem.setDemandBonus`, which returns early for `isDroidUnit` (`:491`) —
   a no-op. The only AI caller of `setDroidOrder` is `EmpireStrategySystem:499`, hardcoded to
   `automation_droid`. There is therefore no "buy androids cheap from the AI" surface.
4. **What the 160 still does:** `TRADEABLE_GOODS = Object.keys(BASE_PRICE)`, so once a *player* researches
   `android_engineering` and builds androids, civilian routing values them at 160 × scarcity and a
   cross-empire order would sell them at that. That is the whole live footprint — a player *could* sell a
   1 200 Kr + superset-recipe unit for 160 Kr, a trade nobody takes. **It misvalues; it does not misbehave.**
5. **Repricing would break a declared convention rather than restore one.** `TradeValuesData:53-57` states
   that droid prices are *deliberately* not recipe-derived (raw × 1.3 would give ~14 300 Kr; the listed
   price is a manual sink price). That marker (`isDroidUnit` / `creditCost > 0`) is exactly why the audit
   classes `android_worker` as **`design_sink`, not `suspect`**, and excludes it from the outlier verdict.
   `warp_cores` had **no** marker — which is what made it a rule violation and this one not.

Also worth stating precisely, because the hypothesis going in was the opposite: **repricing would not revive
the role Phase 5B retired.** That role was `commodityCost` in `BuildingsData` (swapped to
`automation_droid`), which the price does not control. Repricing would neither restore the old behaviour nor
fix anything — it would only trade one convention for another on an entity slated for redesign.

### 4.1 The one real thing, recorded rather than patched

Inside the sink convention there **is** an ordering anomaly: tier-2 `android_worker` is priced **160 Kr**
against tier-1 `automation_droid`'s **450 Kr**, while being strictly more expensive to build (superset
recipe + 1 200 Kr vs 500 Kr) and strictly better (+70 % vs +40 % efficiency, unrestricted strata vs
`laborer/miner/worker`). If the manual sink prices are meant to be ordered by tier, this pair is inverted.

**Recorded for the REFORMA ENERGII arc** (where `android_worker` is planned to become the energy-powered AI
Droid) rather than patched now — pricing an entity on the eve of its redesign spends the decision twice.
Noted in `docs/BALANS_STATE.md` so it does not get lost.

## 5. Instrument changes — and why they are part of the fix, not additions

- **`balans_price_audit_smoke.mjs` T3** pinned `warp_cores` as `suspect_below_cost`. After the fix that
  assertion would have been a **green test asserting a false statement**, so it is flipped to pin the fixed
  state (`!belowOre && !belowDirect && cls === CONFORMS`) — now a regression guard against the price drifting
  back under its inputs. `propulsion_systems` is kept as the live *unmarked below-cost* example with an
  added `!sinkMarked` assertion, so T3 still proves what it exists to prove: **the design/suspect split is
  computed from the DATA, not from a hand-maintained list of ids.** Keeper stays 64/64.
- **`PriceReport.js:189`** cited `warp_cores` as the didactic example of the two input measures with the
  numbers *„×0.80 i ×0.46"*. Those became false at the moment of the fix; corrected to ×2.27 / ×1.30. The
  point of the sentence (ore and market inputs are different questions and must not be merged) is unchanged
  — and `warp_cores` remains the sharpest illustration of it, since the two measures still disagree.
- The keeper's header comment carried the same stale pair; updated with it.
- **`balans_price_report_smoke.mjs` was deliberately left alone.** It also contains `warp_cores` at ×0.352 /
  1 500 — but as a **synthetic fixture it builds itself** to exercise the renderer's below-cost and outlier
  rows, not as a claim about the live table. A renderer test needs a fixed input; that input happens to be
  the historical numbers, which makes it a fine specimen of a suspect row. 43/43 unchanged.

**No measurement logic, threshold or knob was touched** — `CONVENTION_MARGIN`, `CONVENTION_TOL`, `OUTLIER_Z`
and every telemetry rule are exactly as they were.

## 6. Scope boundary

**Changed:** one constant, `BASE_PRICE.warp_cores` 500 → 1420. Nothing else in the game.

**Deliberately not changed:** `android_worker` (§4 — verdict: leave it); `propulsion_systems` (×0.88, the
remaining unmarked below-cost row, a near-miss the PRICES slice already logged); `civilian_goods` (§2.1,
newly surfaced by the sharper detector); the unpriced goods `military_supplies` / `orbital_shells` / `H`
(findings 24–25); the base-unit `energy = 1 Kr = 1 Fe` question (findings 26–27 — a category mismatch, and
moving it moves the whole ROI ranking, so it is its own decision).

**Next in Phase 3 (from `docs/BALANS_STATE.md`):** the unadjudicated reads — ballooning POP levers,
buildings' per-year energy drain (never measured), AI expansion under Fe scarcity.
