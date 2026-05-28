# KOSMOS — ROADMAP (master)

> **Last updated:** 2026-05-28, po **TechDebt Faza 2C** (#3 — Faza 2 KOMPLETNA).
> Jeden punkt odniesienia dla całej sekwencji prac AI / multi-empire. Sekcje DONE
> oznaczone commit-hashem. TODO z zależnościami (co jest prerequisite czego).
> Szczegółowe plany NIE są tu kopiowane — linkowane (patrz „Gdzie są szczegóły").

## Legenda

- **Status:** DONE / TODO / DEFERRED / NIEAKTUALNE
- **Severity:** KRYTYCZNY (psuje gameplay) · WAŻNY (blokuje następny slice) · DROBNY (kosmetyka) · SPORNY (może być feature/by-design)
- **Effort:** S (1 plik, <30 min) · M (kilka plików) · L (refactor / nowy podsystem)
- **plik:linia** — wg audytu 2026-05-28; po commitach mogły się przesunąć → zweryfikuj grepem przy implementacji.

---

## 1. DONE (fundament)

| Etap | Commit | Co |
|------|--------|-----|
| **Slice 1 Faza 1** | (patch v5) | Warstwa A — symulacja ekonomii ECS (POPy, budynki, ResourceSystem, FactorySystem, EmpireColonyMaintenance) |
| **Slice 1 Faza 2** | `26c2ffc` | Warstwa B — ColonyAutoExpander (anti-deadlock Y1/Y2/Y3, `ae7ae57`); popCost=0 dla habitat/arcology/orbital_habitat |
| **Slice 2 S1** | `2f03019` | bootstrapColony + bootstrapAutonomousOutpost (2 ścieżki kolonizacji AI) + getColoniesByEmpire |
| **Slice 2 S2** | `8df4ac1` | EmpireStrategySystem (Warstwa C: P1/P2/P3/fallback) + per-empire tech isolation (anchor `buildingSystem.techSystem`, fail-closed) |
| **Slice 2 S3** | `adc4a5b` | EmpireLogisticsSystem route-based (kurierzy outpost↔stolica, cargo rare-first), save v76→v77 |
| **TechDebt Faza 1** | `77d39a4` | #2 save/restore AI + #14 outposty w EmpireRegistry, save v77→v78. Live game PASS |

**Slice 2 KOMPLETNY** (S1+S2+S3). AI: rośnie w stolicy (Warstwa B) + kolonizuje outposty Xe/Nt + pełne kolonie (Warstwa C) + per-empire tech + fizyczny transport surowca + **przeżywa save/load** (Faza 1).

Architektura AI (3 warstwy A/B/C, archetyp, tempo decyzji): **`docs/kosmos_ai_architecture.md`** (master plan AI).

---

## 2. TechDebt Faza 2 — prerequisite Slice 3 (WAŻNE)

Z audytu 2026-05-28. **Cel:** zamknąć izolację per-empire tech i czysty handel zanim wejdą 2+ imperia. Bez tego multi-empire ma ciche mosty (tech gracza wycieka do AI) i darmowy handel z wrogiem.

### #15 — Pozostałe mosty tech gracz↔AI
**Status:** ✅ DONE (`112b7ae`, Faza 2 A+B — wszystkie 5 mostów) · **Severity:** WAŻNY · **Effort:** M (zbiór fixów S + jeden M)
Systemy liczące coś dla kolonii/vessela AI globalnym `window.KOSMOS.techSystem` (= tech GRACZA). Wzorzec naprawy (precedens S2 S2 `FactorySystem.isRecipeAvailable`): `_getOwnerColony()?.buildingSystem?.techSystem` **fail-closed**.

| Most | plik:linia | Fix | Effort |
|------|-----------|-----|--------|
| FactorySystem factory speed | `FactorySystem.js:494` (display) + `:711` (produkcja) | owner colony anchor zamiast global | S |
| BuildingSystem asteroid_mining gate | `BuildingSystem.js:1750` | `this.techSystem` (już per-empire w instancji) zamiast global | S |
| VesselManager ship speed + fuel (kurierzy AI) | `VesselManager.js:311,313,2052,2062,2160,2308` | rozróżnić `vessel.ownerEmpireId` → tech imperium (jak combat `isPlayer`) | M (6 call-sites) |
| CivilianTradeSystem `_isRecipeGloballyAvailable` | `CivilianTradeSystem.js:635` | per-kolonia tech | S–M |
| RandomEventSystem defense/disaster na AI-koloniach | `RandomEventSystem.js:289,216,315,319` | `colony.buildingSystem.techSystem` zamiast global | S |

- **Combat (Proximity/DSCS/Movement)** — świadomie BASE dla vesseli AI (gated `isPlayer`). **NIE ruszać** — empire combat tech scaling to osobny temat „P5" (Slice 4).
- **Uśpione:** ColonyManager ground units (`:978,1034`) — dziś player-only (brak AI callera); stanie się mostem dopiero gdy AI buduje jednostki naziemne.

### Civilian trade — filtr same-empire
**Status:** ✅ DONE (`112b7ae`, Faza 2 A+B) · **Severity:** WAŻNY · **Effort:** S
`CivilianTradeSystem` to jedyny system iterujący `getAllColonies()` (`CivilianTradeSystem.js:75`) **bez filtra `ownerEmpireId`** → po odsłonięciu systemu AI (Slice 3) towary + Kr płyną gracz↔AI za darmo, bez ceny/dyplomacji/wojny. Dziś maskowane przez fog-of-war (`system.explored=false` dla AI).
- **Decyzja Filipa: A** — twardy filtr same-empire TERAZ (parowanie `a.ownerEmpireId === b.ownerEmpireId`, jak `_applyTaxes`/`_checkMigration`/`_autoCreateTradeRoutes` w `ColonyManager.js:1415/1850/2110`).
- **Inter-empire trade z cenami = osobny przyszły feature** (Slice 3/4, patrz §5) — NIE teraz.

### #3 — AutoExpander upgraduje tylko budynki bootstrap
**Status:** ✅ DONE (Faza 2C — `_syncGridFromActive` AI-only reconcile) · **Severity:** WAŻNY · **Effort:** M
`_activateBuilding` (`BuildingSystem.js:357-430`) NIE stempluje `tile.buildingId` na grid; budynki AutoExpandera (wszystkie `buildTime>0` → construction queue) trafiają tylko do `_active`. Kolonie AI nigdy nie otwarte w ColonyOverlay → grid niezsynchronizowany. `_tryUpgrade` (`ColonyAutoExpander.js:526-532`) skanuje grid → nie widzi tych budynków → **AI realizuje cele `count`, nie `avgLevel`** → utyka na Lv1 → słaba ekonomia w mid/late game → psuje rywalizację multi-empire.
- **Fix:** `_tryUpgrade` (+ pokrewne) czyta kandydatów z `bSys._active` (źródło prawdy) + queue, nie z flag grid; czyścić wiszący `tile.underConstruction` po ukończeniu nowej budowy.

---

## 3. TechDebt Faza 3 — quick wins (DROBNE)

| # | Status / Sev / Effort | Co + plik:linia | Decyzja |
|---|------------------------|------------------|---------|
| **#4** | TODO · DROBNY · S | `_runSurvival` (`ColonyAutoExpander.js:174-257`) nie sprawdza `_isUnreachable` (jak `_runTargets` `:313,340`). Realnie dotyczy tylko `factory` (requires metallurgy); tłumione anti-thrash+blacklist | wpiąć unreachable do survival |
| **#5** | TODO · DROBNY · S | `Snapshot.js`: `vessels.byType` nie istnieje (`:86-94`, tylko vesselsByStatus); per-building levels per-kategoria (`:16-33`). **Zero wpływu na grę** — tylko raporty botów | dodać byType + levelsById |
| **#18-sprite** | TODO · DROBNY · S | Skala GLB hardcoded `0.002` dla wszystkich (`ThreeRenderer.js:3167`); `hull_small`→`cargo3d.glb`. Dodać skalę per-hull | Linie kursu AI = świadomy fog-of-war, **NIE ruszać** (decyzja Filipa) |
| **#6** | TODO · SPORNY(artefakt) · S | „food rate=0" to bilans NETTO (prod−konsumpcja w `_inventoryPerYear`, `ResourceSystem.js:356-376`), **nie bug**. Famine wymaga `netFlow<0` | rozdzielić brutto/netto dla bota (`BotInterface.js:235`); fix CLAUDE.md `POP_CONSUMPTION.food` 3.0→2.5 (drift, w kodzie `ResourcesData.js` = 2.5) |
| **#12 test** | TODO · SPORNY · S | Dodać dedykowany test kolizji „1 ciało = 1 właściciel" (guard throw+blacklist, by-design w Slice 2) | per [[testing-rollback-paths]] |

---

## 4. TechDebt — odłożone / nieaktualne

- **#7** — `MAX_PENDING_BUILDS_PER_COLONY=3`/`MAX_PENDING_UPGRADES=2` (`ColonyAutoExpander.js:71-72`): heurystyka z nagrania, `_reconcilePending` zwalnia sloty → brak zatoru. **DEFERRED** (tuning, nic nie blokuje).
- **#13** — buildings=5 (duplikat colony_base): **NIEAKTUALNE** — guard idempotencji `BuildingSystem.autoPlaceBuilding:1162-1169` działa, buildings=4 poprawne.
- **#11** — „rozmiar statku → różne budynki startowe": **NIEAKTUALNE** — nie istnieje; budynki z `archetype.startingBuildings`/hardkod, nie zależą od statku.
- **AI/UI side-effects** (`docs/tech_debt_ai_ui_events.md`) — klik kolonii AI w UI `_setActiveColony` wpływa na gameplay + wycieka eventy AI za fog-of-war. **DEFERRED do Slice 3** (rozdzielić „active for view" vs „active for gameplay"). Powiązane z interakcjami multi-empire poniżej.

---

## 5. Slice 3 — Multi-Empire (główny następny rozdział)

> **Filip chce to PRZEMYŚLEĆ przed startem.** Sekcja design-first — otwarte tematy do rozstrzygnięcia, NIE gotowy plan implementacji. **Prerequisite: TechDebt Faza 2** (izolacja tech + czysty handel).

Cel: 2+ imperia AI na mapie jednocześnie + interakcje. Warstwa C: akcje handlu i eksploracji (per `docs/kosmos_ai_architecture.md` §Roadmapa).

**Otwarte tematy do designu:**
- **Wiele imperiów naraz** — dziś EmpireGenerator hardkoduje 1 archetyp (`industrialist`). Trzeba ≥2 archetypy realne (bootstrapowe, nie tylko personality-stuby w `EmpireData.js`): Diplomat? Militarist? Expansionist?
- **#1 — AI research (per-empire tech rozwijany w czasie).** Status: DEFERRED · Severity: WAŻNY (dla wizji „różne drzewa tech") · Effort: L lub M.
  Dziś `aiTech` 100% statyczny (`grantTechs(startingTechs)` w bootstrap); `ResearchSystem` jest globalny/tylko-gracz i siphonuje research AI do gracza (`ResearchSystem.js:62-73` zbiera z `getAllColonies()`).
  **Decyzja Filipa ODŁOŻONA:** pełny `EmpireResearchSystem` (imperia badają w czasie, L) vs ≥2 archetypy z różnymi STATYCZNYMI `startingTechs` (różne drzewa na starcie, M). Do rozstrzygnięcia w Slice 3. (Przy okazji: naprawić `ResearchSystem._tick` by zbierał tylko z kolonii gracza.)
- **#12 Model B — współistnienie 2 imperiów na jednym ciele.** Status: DEFERRED · Effort: L (refactor hex-grid).
  Dziś `ColonyManager._colonies` keyed by `planetId` → 1 ciało = 1 właściciel (guard throw+blacklist działa). **Decyzja Filipa: Model B (współistnienie, NIE przejęcie).** Sub-warianty TBD: **B1** (współdzielony grid, hexy z `ownerId`) vs **B2** (osobne gridy, composite key `planetId:ownerId`). Projektować w kontekście pełnej wizji Slice 3 (dotyka ColonyOverlay/BuildingSystem/save).
- **Interakcje między imperiami** — świadomość obecności (IntelSystem już istnieje: unknown→rumor→contact→detailed), granice, fog of war. Tu wpina się **AI/UI side-effects** (`docs/tech_debt_ai_ui_events.md`) — rozdzielić widok od gameplayu.
- **Civilian trade inter-empire** (z Fazy 2 odłożone jako feature) — świadomy handel między imperiami z cenami wg hostility (DiplomacySystem) + embargo przy wojnie. Kierunek Kr między skarbcami imperiów.
- **Save/load multi-empire** — fundament gotowy (Faza 1: re-link z `emp.colonies`, per-empire aiTech, ownerEmpireId). **Model B wymaga rozszerzenia o composite key** (`planetId:ownerId`) w ColonyManager + save.

---

## 6. Slice 4 — Conflict & Diplomacy (dalej)

Warstwa C: akcje militarne + FleetTacticalAI. Bazuje na istniejącej infrastrukturze wojny/dyplomacji (Fazy 0–7, `docs/plan-war-diplomacy-ai.md`) i combat core (M1–M4, `docs/design/milestone-*`).

- Wojna AI vs AI, AI vs gracz
- **Ataki na cargo shipy** — uzasadnienie fizycznego transportu z S3 (kurierki = cele do przechwycenia)
- Blokady ekonomiczne (halt civilian trade + orbital battle dla fizycznych shipów); events „przejęcie cargo" przy blokadzie
- Dyplomacja, sojusze, pakty, embarga
- **#17** — P4 porty / heavy cargo (Warstwa 3 transportu) — większy throughput, wymaga portów (stub w ESS decision tree)
- **#16** — wyczerpywalność deposits — AI reaguje proaktywnie (dziś tylko warning log)
- **P5 z #15** — combat tech scaling dla AI (obecnie BASE: weapon/sensor mult gated `isPlayer`); empire tech state per-imperium
- Endgame conditions

---

## 7. Future reforms / design tickets

> Tickety designerskie odłożone świadomie — wymagają playtestów/strojenia, nie blokują bieżącej sekwencji. Implementacja PO tech debt i (zwykle) PO Slice 3.

### Reforma generacji światów (presja kolonizacji)

**Status:** TODO, post tech debt, post Slice 3

**Problem (z mini-investigation 2026-05-28):**
- Rocky home ~180-210 buildowalnych hexów; referencyjna kolonia ~23 budynki
  (10-15% wypełnienia). Nawet bez upgrade'ów (~50-80 budynków) rocky home
  nigdy się nie zapełnia → brak naturalnej presji ekspansji
- Pressure dziś pochodzi z cap-5 outpostów + małych ciał (moon=72,
  planetoid=36), nie z zapełnienia rocky home

**Decyzja designerska (Filip):**
Reforma generacji światów: rocky z dobrą atmosferą + wodą generuje
WIĘKSZOŚĆ hexów jako ocean (buildable:false) → znacznie mniej miejsca na
budowę → gracz/AI musi szybciej kolonizować. Naturalna geograficzna
presja, nie sztuczne ograniczenia.

**Powiązane systemy do rozważenia w reformie:**
- PlanetMapGenerator (TAPERED_SIZES + waga ocean 12% — do podniesienia)
- HexTile terrain distribution per planet type
- _applyPolarEffects (czapy lodowe — już istnieje)
- Balans: rocky breathable+water = mało hexów (większa presja),
  rocky bez atmosfery/wody = więcej hexów (kompensacja)
- Tematycznie: "ziemiopodobność" = ograniczenie, nie bonus

**Effort:** L (rebalansowanie generacji + playtest)

**Dlaczego nie teraz:**
- Wymaga playtestów do strojenia
- Wpłynie na Slice 4 (różne wartości planet do podboju — wertykalne breathable rocky vs horyzontalne pustynne)
- Powiązane z #1 (AI research) i archetypami imperiów

**Plik investigation:**
Pełna analiza w pamięci CC: mini-invest-upgrade-vs-horizontal
(2026-05-28). Kluczowe ustalenia:
- Upgrade 1:1 zastępowalny horyzontalnie (z wyjątkiem orbital_fabricator
  endgame Dyson)
- buildingLevelCap scaffold już istnieje (deep_drilling/space_mining)
- Ranking imperiów Slice 3 nie używa level → horyzontal = potęga

---

## Gdzie są szczegóły (linki do planów)

**W repo (`docs/`):**
- `docs/kosmos_ai_architecture.md` — master plan AI (3 warstwy A/B/C, archetyp, tempo) + anti-deadlock tech debt
- `docs/plan-war-diplomacy-ai.md` — wojna/dyplomacja/AI obcych (Fazy 0–7, baza Slice 4)
- `docs/plan-multi-save-indexeddb.md` — reforma STORAGE save (5 slotów + IndexedDB + export), zatwierdzona NIEzaimplementowana. **Ortogonalna** do save-shape (#2) — warstwa storage vs serializacja
- `docs/tech_debt_ai_ui_events.md` — AI colony UI side-effects (view vs gameplay), DEFERRED Slice 3
- `docs/slice_1_plan.md` / `slice_1_patch_v5_plan.md` / `slice_1_handover.md` — Slice 1
- `docs/design/milestone-*` — combat core (M1–M4)

**Lokalne (maszyna Filipa — nie w repo):**
- Audyt tech debt (źródło Fazy 1/2/3): `~/Downloads/cc_techdebt_audit.md`
- Plan TechDebt Faza 1: `~/.claude/plans/c-users-komputer-downloads-cc-techdebt-f-radiant-robin.md`
- Memory (auto-pamięć projektu): `memory/techdebt-faza1-save-ai.md`, `memory/slice2-s1-bootstrap.md`, `memory/slice2-s2-empire-strategy.md`, `memory/slice2-s3-plan-approved.md`, `memory/autoexpander-anti-deadlock.md`, `memory/testing-rollback-paths.md`

---

## Sekwencja (zależności)

```
DONE: Slice 1 → Slice 2 (S1→S2→S3) → TechDebt Faza 1 ✅
                                            │
TODO:                          TechDebt Faza 2 (#15 + trade filtr + #3)   ← prerequisite Slice 3
                                            │
                              (Faza 3 quick wins — równolegle, dowolnie)
                                            │
                                      Slice 3 — Multi-Empire (design-first; #1, #12 Model B)
                                            │
                                      Slice 4 — Conflict & Diplomacy (#16, #17, P5)
```

Faza 3 nie blokuje niczego — można wpleść kiedykolwiek. Faza 2 jest twardym prerequisite Slice 3.
