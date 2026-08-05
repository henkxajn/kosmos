# BALANS 1.0 — Phase 2 · PRICES / affordability slice result

> **Status: PRICES vertical slice CLOSED.** Static audit → affordability telemetry → report → launcher
> are built and green. **Zero game-balance constants were changed.** This is a measurement record:
> findings are *logged*, not fixed. Tuning is Phase 3.

All figures are **game-years** (`gameTime`); **1 gy = 12 civ-years**. Measured on the **post-fix harness**
(`3fe634e`) — the same shared driver, bot and reference panel as the POP, RESOURCES and ROI slices.

Reproduce:

```
# the panel this record is based on (REAL generator, no deposit injection):
KOSMOS_QUIET=1 node src/testing/headless/balans-price-telemetry.mjs --class=REAL --seeds=8 --gy=45
#   → src/testing/reports/balans/price-telemetry-REAL.json + price-report-REAL.html

# same thing from the browser panel (metric dropdown now: POP | ZASOBY | ROI | CENY):
node src/testing/headless/balans-launcher.mjs        # → http://localhost:7333

# keepers (offline):
node src/testing/smoke/balans_price_audit_smoke.mjs      # 64/64   (layers A + A′, no game boot)
node src/testing/smoke/balans_price_telemetry_smoke.mjs  # 51/51   (layer B)
node src/testing/smoke/balans_price_report_smoke.mjs     # 43/43
node src/testing/smoke/balans_launcher_smoke.mjs         # 84/84   (T7 = prices end-to-end)
```

---

## 0. Why this slice is different in kind

POP, RESOURCES and ROI measured **behaviour over time**. A price is mostly a **static table**
(`TradeValuesData.BASE_PRICE` + `COMMODITIES.recipe`) — numbers written in data, not emergent from play.
So this slice has two layers and the code, the report and this document keep them apart:

| layer | file | what it is | evidential weight |
|---|---|---|---|
| **A** — price-table audit | `src/testing/headless/PriceAudit.js` | pure, no simulation, no `window` | deterministic property of the data |
| **A′** — base unit | same | is `energy = 1 Kr = 1 Fe` grounded? | data + measured run |
| **B** — affordability | `src/testing/headless/PriceTelemetry.js` | live run through the shared driver | depends on the reference bot too |
| report | `src/testing/report/PriceReport.js` | `renderPriceReport()` → self-contained HTML | — |
| launcher | `balans-launcher.mjs` | one `METRICS` entry → fourth option | — |

**The audit criterion is internal.** `TradeValuesData` declares its own rule — *"Formuła: koszt surowców
w recepturze × 1.3 (marża za przetworzenie)"*. The audit measures conformance **to that rule**, so a
deviation is a fact about the data, not my opinion about what something *should* cost.

**Design vs bug is decided by the data, not by me.** A commodity priced below its inputs is labelled
"probably intentional" **only** when the data carries a sink marker (`isDroidUnit` or `creditCost > 0` —
the explicit per-unit Kr charge described in `TradeValuesData`). Everything else is labelled
**unexplained** and left for Filip. The keeper enforces this: strip the marker off the droid in a test
and it moves to "suspect".

---

## 1. Layer A — the price table audits mostly clean

25 commodities; **22 have a computable input cost**; median conformance to the table's own convention is
**×0.96**. That is the headline and it is a *positive* result: the table largely obeys its own rule.

| class | n | which |
|---|---|---|
| in convention (×0.74–1.35) | **15** | the bulk of T1/T2/T3 |
| off convention, still covers inputs | 3 | `civilian_goods` ×1.63 · `antimatter_cells` ×1.52 · `semiconductor_arrays` ×1.36 |
| below cost, **marked as a sink in the data** | 2 | `android_worker` ×0.02 · `automation_droid` ×0.06 |
| below cost, **unexplained** | **2** | `warp_cores` · `propulsion_systems` |
| not auditable | 3 | `military_supplies`, `orbital_shells` (no price at all), `fuel` (input `H` has no price) |

### 1.1 The four below-cost prices, adjudicated only as far as the data allows

| commodity | price | ore (recursive) | market inputs | ×ore | ×market | +Kr/unit | verdict |
|---|---|---|---|---|---|---|---|
| `android_worker` | 160 | 7 805 | 7 960 | ×0.02 | ×0.02 | 1 200 | **design sink** (marker in data) |
| `automation_droid` | 450 | 7 500 | 7 500 | ×0.06 | ×0.06 | 500 | **design sink** (marker in data) |
| `warp_cores` | 500 | 626 | 1 092 | ×0.80 | **×0.46** | — | **unexplained** |
| `propulsion_systems` | 100 | 114 | 114 | ×0.88 | ×0.88 | — | **unexplained** |

Two things this table does that the ROI slice's version could not:

1. **Two measures of input cost, deliberately not merged.** "Ore" = the recipe expanded recursively to raw
   resources (what the economy really gives up). "Market inputs" = sub-components at *their own* price
   (what a buyer pays). For `warp_cores` these disagree sharply: **×0.80 of its ore but ×0.46 of its
   market inputs** — because it eats 2×`quantum_cores` (250) + 2×`antimatter_cells` (280), both of which
   are themselves priced *above* their ore. Buying the parts costs 1 092 Kr; the assembled core sells for
   500. Whichever number is used, `warp_cores` is the strongest single anomaly in the table that is *not*
   marked as a sink (robust z = **−5.4** against the table's own convention).
2. **The droids' acquisition cost includes their Kr charge**: 7 500 Kr of ore **+ 500 Kr** cash for the
   tier-1 droid. Against a market price of 450 that is ×0.056 — this is exactly the "production sink"
   the data comments describe, so it is flagged as intentional and excluded from the outlier verdict.

`propulsion_systems` at ×0.88 is a **near-miss**, not a scandal; it is listed because the rule it breaks
is the table's own. `semiconductor_arrays` (×1.36) sits just over the tolerance on the other side.

### 1.2 Three holes in the price table

- **`H` has no price**, and it is the only input of `fuel` → the entire refinery chain is
  **unauditable in Kr** and invisible to every Kr-denominated metric in Phase 2, including ROI's.
- **`military_supplies` and `orbital_shells` have no `BASE_PRICE` at all.** Since `TRADEABLE_GOODS` is
  literally `Object.keys(BASE_PRICE)`, they are **not tradeable** — a war economy that cannot be bought
  or sold. Whether that is intended is a design question; the fact is recorded.
- `research` has no price either (known from the ROI slice, §9).

---

## 2. Layer A′ — the base unit is **not** grounded, and the answer flips with the scenario

Every Kr figure in this project — the whole ROI ranking — rests on `energy = 1 Kr = 1 Fe`. The only test
of that relation available *inside* the game's own data is: **how much investment does it take to produce
1 Kr of value of each resource?** (fully-loaded building cost ÷ net flow per game-year ÷ price). If the
price table tracked production effort, this number would be **similar for every resource**. It is not.

| resource | price | cheapest source | Kr of capex per 1 Kr/gy — **as run (mining ×5)** | **at ×1 mining** | implied price at ×1 |
|---|---|---|---|---|---|
| `food` | 2 | farm | 0.13 | 0.13 | **0.04** |
| `water` | 2 | well | 0.33 | 0.33 | **0.10** |
| `energy` | 1 | solar_farm | 0.92 | **0.92** | **0.15** |
| `Si` | 1.5 | mine | 0.80 | 4.02 | 0.96 |
| `Cu` | 2 | mine | 1.09 | 5.46 | 1.74 |
| `Fe` | 1 | mine | 1.24 | **8.53** | 1.36 |
| `C` | 1 | mine | 1.43 | 7.16 | 1.14 |
| `Hv` | 8 | mine | 1.42 | 7.07 | 9.03 |
| `Li` | 5 | mine | 2.10 | 10.50 | 8.38 |
| `Ti` | 4 | mine | 3.00 | **15.01** | 9.58 |

**The pair under the lens.** The table says energy : Fe = **×1.00**. Capex says **×0.74** as the panel was
run, and **×0.11 at ×1 mining** — i.e. once the reference scenario's ×5 mine multiplier is removed,
**producing 1 Kr worth of energy costs about a ninth of what producing 1 Kr worth of iron costs.** The ×1
column is the one to read as a property of the price table; the difference between the two columns is the
scenario's contribution (same counterfactual arithmetic as ROI §3.2, applied to the same measured series —
only mine output is divided, never the power plants).

Read plainly, at ×1 mining:

- **Utilities (energy, food, water) are cheap to produce and priced high**; their implied prices are
  0.04–0.15 against listed 1–2, i.e. **7–50× over**.
- **Mined ore is expensive to produce and priced low.** The *relative* ordering of ores is roughly right
  (Ti/Li/Hv on top), but Ti's implied price is **9.6 against a listed 4** and Li's **8.4 against 5**.
- Fe, C, Si and Cu land within ~×1.4 of their listed price — the ore end of the table is internally
  consistent; it is the **ore-vs-utility relation** that is not.

### 2.1 The game's *other* internal valuation disagrees with the first one

The game already has a second, dynamic opinion about value: `BASE_PRICE × scarcityMultiplier`, read
through `CivilianTradeSystem.getLocalPrice`. Median realised prices over the panel:

| Fe | C | Si | Cu | Ti | Li | Hv | Xe | Nt | food | water | **energy** | `structural_alloys` | `electronic_systems` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.2 | 0.3 | 0.3 | 0.4 | 0.8 | 1.5 | 2.4 | 4.8 | 45 | 0.4 | 0.4 | **3.0** | 16 | 45 |

So **in play the game values 1 energy at 15× 1 Fe** (3.0 vs 0.2) while the table says they are equal —
and the *capex* lens says the opposite (energy is the cheap one). **The two internal lenses of the game
point in opposite directions for the same pair.** That is the honest answer to "is the base unit
grounded": it is grounded in neither production effort nor in-play scarcity.

⚠ **The energy figure is structurally pinned, not a market signal.** Energy is a flow, deliberately not
kept in `ResourceSystem.inventory` (`this.energy = {production, consumption, balance}`), so
`getLocalPrice('energy')` reads a stock of 0 and `scarcityMultiplier` returns its maximum **×3.0 — always,
on every seed, in every sampled year** (verified: the set of distinct energy prices across the panel is
`{3}`). Energy is nevertheless in `TRADEABLE_GOODS`. Since it can also never show a surplus, it never
actually moves — but every consumer of `getLocalPrice` sees a permanently desperate price for it.

---

## 3. Layer B — affordability: Kr is not the constraint, components are

20 purchasable items (hulls, legacy ships, droids, ground units, the orbital station, shipyard surge —
buildings belong to the ROI/RESOURCES slices). Over 8 seeds × 45 gy:

| class | n | meaning |
|---|---|---|
| trivial | **0** | nothing is affordable-with-large-headroom throughout |
| normal | 8 | affordable through most of the run |
| gating | 3 | affordable late or rarely (`hull_frigate`, `science_vessel`, `ground_garrison_unit`) |
| never | 9 | never affordable in 45 gy |

**What actually blocks a purchase** (the key the store could not cover, most frequent per item):

| blocker | items | kind |
|---|---|---|
| `structural_alloys` | 8 | manufactured component |
| `reactive_armor` | 3 | manufactured component |
| `electronic_systems` / `semiconductor_arrays` / `metamaterials` | 3 | manufactured components |
| `Fe` | 2 | ore |
| `Kr` | 4 | credits |

**14 of 20 purchases are gated by a factory-made component**, 2 by ore, 4 by credits — and the 4 credit-gated
ones are the cheapest items in the catalogue (ground units, shipyard surge). This is the RESOURCES slice's
component wall (97% of build-years) and the ROI slice's cost split (71% of build cost) showing up a third
time, now on the *purchase* side. Three independent sensors, one wall.

⚠ **"Never" is confounded with technology.** 8 of the 9 never-affordable items are also tech-gated
(`point_defense`, `exploration`, `fleet_logistics`, `orbital_construction`, `android_engineering`) — the bot
never unlocked them, so their price was never actually tested. **`ground_aa_platform` is the only item that
is never affordable with no tech gate at all**, blocked by `metamaterials`. The report prints the tech column
next to every row precisely so this is not misread as a pricing result.

### 3.1 The Kr economy: income piles up, and the fleet eats it — bimodally

Median panel, per game-year: **income 404 Kr** (tax **397** + civilian trade **7**) − wages **52** −
fleet upkeep **108** − droid production **17** = **net +163 Kr/gy**.

| seed | income | fleet upkeep | fleet as % of income | net | credits end | credits min |
|---|---|---|---|---|---|---|
| 1 | 410 | 109 | 27% | +237 | 11 230 | 550 |
| 2 | 367 | 277 | **75%** | 0 | **516** | **64** |
| 3 | 442 | 289 | **65%** | +36 | 2 163 | 550 |
| 4 | 451 | 73 | 16% | +297 | 13 926 | 550 |
| 5 | 397 | 108 | 27% | +227 | 10 770 | 548 |
| 6 | 314 | 226 | **72%** | −12 | **42** | **42** |
| 7 | 122 | 0 | 0% | +98 | 4 972 | 552 |
| 8 | 434 | 96 | 22% | +274 | 12 824 | 510 |

- **Civilian trade contributes 7 Kr/gy** against tax's 397 — i.e. **~2% of income**. The trade network is
  not, at this scale, an income source.
- **Fleet upkeep is the only sink that can swallow the economy**, and it does so on 3 of 8 seeds (65–75% of
  income, credits ending at 42–2 163). On the other 5 it is 16–27% and credits pile to 10–14k. The
  distribution is bimodal, driven by how many hulls the bot happens to build. (This quantifies open finding
  #4 "fleet-upkeep Kr drain" from the ROI queue.)
- **Credits are not the binding constraint**: `Kr` appears among the missing keys in only **13%** of the
  5 050 unaffordable item-years, and the median stockpile is worth **490 000 Kr of ore against 7 900 Kr of
  cash — a factor of 62**. The player is materially rich and monetarily idle.
- Nameplate vs realised: end-of-run nameplate tax is 507 Kr/gy against 397 realised — the run-long average
  is lower than the end-state rate because the tax base grows with population. Not a defect; stated so the
  two numbers are not confused.

### 3.2 Droid pricing confirms healthy — and its binding cost is ore, not the Kr charge

`automation_droid`: first affordable at **gy 8**, affordable in **78%** of panel years, median headroom
**4.9 units at once**, class *normal*. The earlier finding stands: **there is no desired→attainable gap for
droids once the loop runs.** New detail: its most frequent blocker is **`Fe` (87 item-years), with `Kr`
second (59)** — the 500 Kr charge is real but secondary to the 1 000 Fe / 2 000 Si mass. The android
(`android_worker`, 1 200 Kr + `semiconductor_arrays`) is never affordable, but it is tech-gated
(`android_engineering`), so its price is untested here.

---

## 4. NEW candidate findings (observations — NOT adjudicated, NOT fixed)

Continuing the Phase-2 numbering (ROI ended at 21).

22. **The price table mostly obeys its own rule.** Median conformance ×0.96; 15 of 22 auditable commodities
    within ±35% of the declared "inputs × 1.3". A rare "this looks fine" result, recorded as such. (§1)
23. **`warp_cores` is the one unexplained pricing anomaly of consequence** — ×0.80 of its ore but **×0.46 of
    its market inputs** (500 Kr for parts worth 1 092 Kr), robust z = −5.4. No sink marker in the data.
    `propulsion_systems` (×0.88) is a near-miss on the same rule. (§1.1)
24. **Two commodities have no price at all** (`military_supplies`, `orbital_shells`) and are therefore
    outside `TRADEABLE_GOODS` — a war economy that cannot be traded. (§1.2)
25. **`H` has no price**, so the whole fuel/refinery chain is invisible to every Kr-denominated metric in
    Phase 2 — including the ROI slice's. (§1.2)
26. **The base unit `energy = 1 Kr = 1 Fe` is not grounded in production effort.** At ×1 mining, 1 Kr of
    energy costs **0.92** Kr of capex to produce and 1 Kr of iron **8.53** — a ratio of **×0.11** against a
    listed ×1.00. Utilities are implied 7–50× cheaper than their listed price; Ti is implied ×2.4 and Li
    ×1.7 *higher* than theirs. **Every Kr-denominated ranking in Phase 2 moves with this.** (§2)
27. **The game's two internal valuations of the same pair point in opposite directions**: capex says energy
    is cheap relative to Fe, in-play scarcity says energy is worth **15× Fe** (3.0 vs 0.2). Neither
    supports the 1:1 listing. (§2.1)
28. **The dynamic price of energy is structurally pinned at ×3.0** — energy is a flow, not an inventory
    entry, so `scarcityMultiplier` always sees stock 0 and returns its maximum, on every seed and every
    year. It is in `TRADEABLE_GOODS` regardless. (§2.1)
29. **14 of 20 purchasable items are gated by a manufactured component, 2 by ore, 4 by credits.** Third
    independent confirmation of the component wall (RESOURCES §8.6 from the build side, ROI §3.1 from the
    cost side). (§3)
30. **Credits are not a real constraint at panel scale**: `Kr` is among the missing keys in only 13% of
    unaffordable item-years, and the ore stockpile is worth **62× the cash balance**. (§3.1)
31. **Fleet upkeep is bimodal and can consume the Kr economy**: 16–27% of income on 5 seeds, **65–75% on 3**,
    where credits end at 42–2 163 instead of 10–14k. (§3.1)
32. **Civilian trade contributes ~2% of Kr income** (7 vs 397 Kr/gy from tax). At this scale the trade
    network is not an income source. (§3.1)
33. **Droid pricing confirmed healthy, and its binding cost is ore, not the Kr charge** — affordable from
    gy 8, 78% of years, headroom ×4.9; blocker `Fe` before `Kr`. (§3.2)

---

## 5. Metric limitations — stated plainly

- **This is the one slice that must not assume its own unit, and it says so.** Where the report converts
  anything to Kr it is using the very table under audit. The *capex* lens (§2) is the attempt to escape
  that circularity from inside the data; it is not an external standard.
- **The capex lens is one lens.** It uses **nominal** rates where no measurement exists (ROI §3.3 showed
  nominal understates live output 2–3×; the comparison here is *relative*, so it survives that, but not
  gracefully if the understatement differs by resource type). A multi-output building has its **whole cost
  attributed to each output**. And it ignores land, jobs and depletion horizon.
- **The measured capex is an end-of-run snapshot** (gy45), so for mines it embeds that moment's deposit
  depletion and tech level, not a run average.
- **Layer B measures the reference bot as much as the price table.** "Never affordable" for 8 of 9 items is
  a tech-unlock fact, not a price fact. A different doctrine would produce a different affordability table.
- **The catalogue excludes buildings** (ROI slice owns their cost, RESOURCES their blocking) and excludes
  fitted ship designs — only bare hulls plus the legacy `SHIPS` entries are priced.
- **The Kr ledger's tax line is residual** (Δcredits − sum of events) because tax emits no event. Any Kr
  movement that neither emits `trade:creditsChanged` nor is visible in the balance would land in that line.
- **Two clocks.** Kr flows run on the *game* clock (tax and fleet upkeep tick per game-year), production and
  ground-unit upkeep on the *civilisation* clock (×12). Every conversion is annotated in the sensor; a
  mistake here would silently scale a whole column by 12.
- **Home colony only**, as in POP / RESOURCES / ROI.

---

## 6. Scope boundary of this slice

Deliberately **not** built (next slice, Filip's call): **AI telemetry** — the last and likely final Phase-2
slice. Deliberately untouched (fence): outpost droid slots (5B.2), AI economy, Time 1.0, AI Droid/Data
Center epic. Deliberately unchanged: every game-balance constant, the bot's decision policy, the shared driver.

**Phase-2 findings queue after this slice:**

1. ~~POP-glut~~ — dropped in the POP slice.
2. **Factory-pacing / Fe-contention** — open; now confirmed from a third side (§3: components gate 14/20 purchases).
3. **POOR-class survivability** — open, untouched (REAL panel only).
4. **Fleet-upkeep Kr drain** — open; **quantified here** (§3.1, §4.31): 65–75% of income on 3 of 8 seeds.
5. **Ballooning regime** — open, untouched.
6. **Component-gated build economy** — open; now measured from three ends (RESOURCES §8.6, ROI §3.1, PRICES §3).
7. **Ore glut / deposit sizing** — open; §2.1 adds that the game's own scarcity multiplier prices ore at its
   floor (×0.2) all game, which is the same statement in the price domain.
8. **Ti scarcity bimodality** — open; §2 adds that Ti's implied price is ×2.4 its listed one.
9. **Energy permanently marginal** — open; §2.1 adds that its dynamic price is *pinned* at maximum scarcity
   for structural reasons, so the price system cannot express energy's state at all.
10. **Xe one-way sink** — open (minor).
11. **Nt / H never in play** — open; §1.2 adds that H is also *unpriced*, so it is invisible to Kr metrics.
12.–21. — ROI slice's findings, unchanged.
22.–33. — **NEW, this slice** (§4).

**Recommended next slice:** AI telemetry (the remaining Phase-2 metric). The price thread itself is now
closed as a *measurement*: the table is internally consistent except for two named commodities, and the
base unit is the open question — but that is a **tuning decision**, i.e. Phase 3, and it should be taken
together with findings 26/27, because moving the energy:ore relation moves the ROI ranking with it.
