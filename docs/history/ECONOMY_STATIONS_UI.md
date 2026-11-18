# Economy, stations, population, colony UI — arc log (moved from CLAUDE.md)
> Moved verbatim from CLAUDE.md on 2026-11-16 (source lines 537–718, 806–1427, 2665–2775, 3578–3633). Historical record — it may describe code that has since changed or been removed; the authoritative records are the plan docs in docs/design/ named inside each section. Kept in the original language (Polish).

<!-- CLAUDE.md L537–718 -->
## S3.4 stacje — UKOŃCZONE (FAZY 0-6 + S3.4b, save v90, live-gate PASS — ARC ZAMKNIĘTY)

Przeprojektowanie stacji orbitalnych w pełny ekran gracza (moduły + POP + ekran zarządzania +
transport pasażerski + etykiety na mapie), plan wielofazowy. **WSZYSTKIE FAZY 0-6 DONE.** Wariant A
(stacja poza `ColonyManager._colonies`, fasady): `Station` extends CelestialBody (type='station',
orbital=null, x/y statyczne — anchored GEO); `StationDepot` façade store; NIGDY nie dotyka
CivilianTradeSystem/switchActiveColony/ColonyManager.serialize. Plan/raport: `docs/plans/s34-stations-continuation.md`.

**Model danych (S3.4):**
- `Station.modules[]` + gettery `popCapacity` (Σ habitat), `tradeCapacity` (aktywne trade), `hasActiveShipyard`;
  `pop`/`shipQueues[]`/`pendingModuleOrders[]`; `colonists`/`_awaitingHousing` (transport pasażerski).
- `src/data/StationModuleData.js` (8 modułów; balans TYLKO tutaj) — ⚠ `buildTime` w LATACH CYWILIZACYJNYCH
  (advance civDeltaYears, spójnie z kolonią). MODULE_SHED_ORDER trade→lab→shipyard; CREW_SHED_ORDER.
- `src/data/StationData.js` — koszt bazowy + commodityCost + maxModules (buildTime stacji USUNIĘTE w F6 —
  Wariant A = instant materialize; progresja czasowa dotyczy modułów, nie stacji).
- **obsada = pop** (F4 — likwidacja tymczasowego mostka `max(pop,popCapacity)`); `Vessel.canColonize` = ma
  moduł `slotType:'habitat'` (NIE colonistCapacity>0) — JEDNO źródło prawdy w UI.

**Fazy:** F0 audyt (`docs/audits/s34-phase0-findings.md`) · F1 dane+model+migracja v90 (`35ce5a2`) ·
F2 tick budowa/energia/praca/stocznia (`7073a99`+fixy) · F3 ekran zarządzania (`StationManagementView.js`
+ tryb stacji w ColonyOverlay: zakładki 🛰, siatka slotów, picker modułów+statków, depot, rozbiórka) ·
F4 transport pasażerski POP (`passenger_module` + misja `_launchPassenger`/`_processPassengerArrival` +
`_awaitingHousing`/no_housing + blokada rozbiórki zasiedlonego habitatu) · F5 etykiety mapy
(`MapLabelLayer` W2.1 — plakietki kolonii/stacji, LOD 3-poziomowy, anty-nakładanie, stacja klikalna →
`station:selected`+`station:focus`) · F6 domknięcie (sweep martwego kodu + `exportSave/importSave` debug +
regresja rot-proof).

**Save v90** (F1 `_migrateV89toV90`). Pola pasażerskie round-trip przez serialize misji (bez migracji F4-F6).
Debug: `KOSMOS.debug.{spawnStation, queueStationOrder, stationBuildModule, stationBuildShip, stationSetPop,
stationInfo, exportSave, importSave}`.

**Świadomie POZA zakresem S3.4 (backlog):** wpięcie stacji w `CivilianTradeSystem` (handel przez stację),
stacje w Outlinerze/minimapie, tier 2+ i klasy stacji, stacje AI, szablon „Statek pasażerski" w kreatorze,
budowa statków stacyjnych z Command/Shipyard, selektor ilości POP w transporcie.

**S3.4b — panele okienkowe (save v90 bez migracji, live-gate PASS — domknięcie arca stacji):**
Pływające panele (BottomContext „okno planety" + StationPanel) dostają: **drag za nagłówek** (clamp do
viewportu, pozycje NIESERIALIZOWANE), **minimalizacja do doku** (belki stackują się w lewym-dolnym rogu nad
paskiem nawigacji I nad panelami floty), **StationPanel 2× szerszy** (440 px, dwie kolumny: właściciel/orbita/
depot | handel/moduły). Architektura KOMPOZYCYJNA: `src/ui/FloatingPanel.js` (helper drag/clamp/reanchor) +
`src/ui/PanelDock.js` (rejestr belek, trzymany przez UIManager — rysowany PO overlayManager, klikany PRZED,
blokuje kamerę przez `isOverUI`) + `src/ui/PanelDockLogic.js` (`computeDockSlots` czysta geometria stacka).
Minimalizacja „w miejscu" USUNIĘTA — oba panele mają JEDEN model dokowania (klucze `body:<id>` / `station:<id>`).
Displaced panel (przełączenie na inną żywą stację) auto-dokuje (nic nie ginie). Smoke `tmp_s34b_paneldock`
19/19 + `tmp_s34b_bottomcontext` 14/14. Backlog polish: multi-instance panele, per-belka ✕, serializacja pozycji.

**S3.4c — unifikacja magazynu STACJA↔KOLONIA — ARC ZAMKNIĘTY (Commity 1-5 + Z4-Z8, save v90 bez bumpu, live-gate PASS).**
Wariant B (depot-jako-proxy): stacja gracza z kolonią-matką w systemie używa magazynu kolonii; sierota → własny depot.
- **`resolveHomeColony(station)`** (`src/utils/TransferStore.js`) — JEDNO źródło prawdy matki: guard AI → detached →
  silny link `_strictMotherLink` (stamp `ownerColonyId` → per-body → parent księżyc `parentPlanetId`) → jedyna kolonia
  gracza w systemie → null (sierota). **Z8: `resolveReadoptionColony`** = tylko silny link, ignoruje `depotDetached`
  (test „czy MOŻNA adoptować", BEZ single-in-system).
- **`StationDepot`** (D2) — `receive/spend/getAmount` + getter `inventory` DELEGUJĄ do `colony.resourceSystem` matki
  (przez `_target()`→resolveHomeColony); sierota trzyma `_ownInventory`. `serialize()` kształt bez zmian (matka `{}`,
  sierota płaski). `drainOwnInventoryTo(store)` idempotentny drain.
- **`Station`** — `ownerColonyId` (stamp: `createStation` opts, ColonyManager `:1736`=colony.planetId, debug spawn) +
  `depotDetached` (D5 osierocenie). Oba serializowane (round-trip, brak w starym save → null/false).
- **Restore drain (D3)** — `StationSystem._normalizeAndDrainDepot`: stamp normalizacyjny (stare save) + przelew
  depotu → magazyn kolonii (fuel/warp_cores też, D4). Idempotentny. Save v90 bez bumpu.
- **Osierocenie (D5)** — `StationSystem._onColonyDestroyed` (subskrybent `colony:destroyed`): stacje z
  `ownerColonyId`=zniszczona kolonia dostają `depotDetached` (wymusza własny depot, `resolveHomeColony→null` bez
  re-motheringu do rodzeństwa). Match po STAMPIE (kolonia usunięta z rejestru PRZED emitem `:591/593`). Stacja żyje.
- **Re-adopcja (Z8)** — flaga `depotDetached` była jednokierunkowa (ustawiana, nigdy czyszczona) → sierota NIE
  wracała do matki nawet po założeniu nowej kolonii na tym samym ciele. `StationSystem._tryAdoptStation` (silny link
  `resolveReadoptionColony` → clear flag + re-stamp `ownerColonyId` + drain lokalny depot → kolonia, idempotentnie).
  Dwa triggery: NA ŻYWO `colony:founded`/`outpost:founded` (`_onColonyFounded` sweep, bez F5) + PRZY RESTORE
  (`_normalizeAndDrainDepot` próbuje adopcji dla detached). D5 nienaruszone (passive resolver dalej null dla detached;
  brak single-in-system w adopcji → rodzeństwo nie adoptuje).
- **Trade bonus (D7)** — `CivilianTradeSystem._getStationTradeBonus(colony)` w `_allocateTC`: Σ `st.tradeCapacity`
  po stacjach gracza z `ownerColonyId===colony.planetId` (atrybucja → zero double-count przy 2+ koloniach). Bez capa.
  Detached/AI pominięte. Side-effect na `_tcPool` migracji POP zaakceptowany.
- **Self-cargo (D8) — ZNIESIONY (`7ee65de`)** — pierwotnie `FleetManagerOverlay._getValidTargets` wykluczał
  stację z matką z celów `transport` (`resolveHomeColony≠null`). Filtr USUNIĘTY: **każda stacja gracza** jest
  celem cargo I pasażerów (wykluczone tylko stacje AI + własny dok statku). Powód: start ze stacji jest tańszy
  paliwowo niż z planety (studnia grawitacyjna) → stacja = wysunięty skład/przeładunek. Mechanika magazynu
  nietknięta (stacja z matką dalej dzieli magazyn kolonii); jednorazowy transport bezpieczny, jałową pętlę
  (`loop=true` na wspólny magazyn) łapie `MissionSystem._evaluateLoopProductivity` (best-effort, nigdy nie
  zawiesza — leci pusta i ostrzega). `resolveHomeColony` nie bramkuje już listy celów (import zdjęty z overlay).
- **UI (D9)** — StationManagementView/StationPanel: „Wspólny magazyn: <kolonia>" (matka) / własny depot +
  „Odcięta od zaopatrzenia" (detached). EconomyOverlay `_playerStationFacades` filtr matki OUT (sierota zostaje).
  Pickery canAfford BEZ zmian (`station.depot.getAmount` deleguje przez proxy → poprawne). i18n PL+EN.
- **Debug** — `stationFillDepot(stationId?)` zasila magazyn kolonii (matka) / własny depot (sierota) przez proxy;
  Z6 log: cel + tryb magazynu + lista wszystkich stacji. `tradeCapacityBreakdown` licznik po koloniach HANDLOWYCH (T5 fix).
- **Higiena śmierci kolonii (Z4/Z5)** — 5 systemów per-kolonia (`FactorySystem`/`ResourceSystem`/`CivilizationSystem`/
  `BuildingSystem`/`ProsperitySystem`) dostało `dispose()` (off `time:tick`); `ColonyManager.removeColony` woła je →
  koniec leaku tickerów po `destroyColony` (był warn per-frame `FactorySystem.isRecipeAvailable` → zalew konsoli +
  spadek FPS). `FactorySystem._update` orphan-guard (`!_getOwnerColony()`→return) jako defense-in-depth.
  **Z9 — ⚠ STAN PO W3-1, ODWRÓCONY (sprostowanie AI_CAPTURE AC-1):** `transferColony` **NIE disposuje i NIE
  kasuje** — to przerzut własności W MIEJSCU (kolonia zostaje w `_colonies`, pięć subsystemów żyje i tyka —
  zmierzone). Przesłanka Z9 („przejęta kolonia = abstrakcyjny wpis imperium, AI nie adoptuje subsystemów")
  została odwrócona: **AI je adoptuje i na zdobyczy PROFITUJE** (`ColonyAutoExpander` 4 → 7 budynków w ~5
  civYears). Dispose ×5 został **wyłącznie** w `removeColony:596-622`. Orphan-guard `FactorySystem._update`
  zostaje jako defense-in-depth. Keeper przepisany i pinuje odwróconą własność: `s34c_z9_transfer_dispose`
  **20/20** (dawniej 16/16 przy starym zachowaniu) + live-gate PASS.
- **`getTradeCapacity` LIVE (Z7)** — `CivilianTradeSystem.getTradeCapacity` liczy `_allocateTC` (pure) zamiast stale
  echo `col.tradeCapacity` → single-colony widzi bonus stacji natychmiast (echo aktualizowany tylko w `_halfYearlyTick`).
- Commity: C1 `2b4c6fc` · C2 `cbfaeb9` · C3 `97e882e` · C4 `9bf3d4c` · C5 `b5e2ab0` · Z2/Z3 `7b91f71` · Z4-Z8 (ten arc).
  Smoke S3.4c: proxy 28 / drain_orphan 33 / trade_selfcargo 15 / ui_i18n 9 / z1(Z7) 12 / z3 11 / z4_dispose 14 /
  z8_readoption 24 (`src/testing/smoke/s34c_*`) + pełna regresja 0 FAIL. (trade_selfcargo/z3 zaktualizowane po
  zniesieniu D8 — patrz `7ee65de`.)
Plan: `docs/plans/s34c-depot-unification-plan.md` · `docs/plans/s34c-Z4-Z7-continuation.md` (Z4-Z8) ·
audyt: `docs/audits/s34c-depot-unification-audit.md`.

**S3.4d — gating kadłubów: stocznie naziemne budują TYLKO small, orbitalne (stacje) WSZYSTKO (Opcja A, save v90 bez migracji, live-gate PASS).**
Sens strategiczny stacji = JEDYNE miejsce budowy medium/large + wojennych (frigate/destroyer/cruiser). Twardy gate,
tylko dla GRACZA (AI zwolnione). Audyt: `docs/audits/s34d-hull-gating-audit.md`.
- **`canBuildHullAt(shipId, facilityType)`** (`src/data/ShipBuildRules.js`) — JEDNO źródło prawdy. `'orbital'`→zawsze
  true; `'ground'`→`spec.groundBuildable === true` (default-DENY: nowy kadłub bez flagi = tylko orbita). Flaga
  `groundBuildable:true` WYŁĄCZNIE na `hull_small` (`HullsData.js`); pole `size` istnieje ale NIEWYSTARCZAJĄCE
  (hull_frigate ma `size:'small'` a jest wojenny → orbital-only). Legacy `SHIPS` (science/cargo/supply) NIETKNIĘTE
  (martwy kod w UI — role osiągane przez moduły na HULLS). Brak „battleship" (najcięższy = hull_cruiser).
- **Gate = 2 chokepointy LOGIKI** (Opcja A): `ColonyManager.startShipBuild` (po tech-gate, guard
  `ColonyManager.isPlayerColony` → AI przechodzi; medium+/wojenny → `fleet:buildFailed` reason
  `fleet.requiresOrbitalShipyard`) + `StationSystem.queueStationShip` (symetryczny no-op `canBuildHullAt(...,'orbital')`
  — jedno źródło prawdy dla obu stoczni; martwa gałąź `facility_restricted`). Stare kolejki/floty NIETKNIĘTE (tick
  ukończenia `_tickShipBuilds`/`_tickShipQueues` nie rewaliduje; gate WYŁĄCZNIE przy enqueue). Bez SaveMigration (v90).
- **UX „widoczny+zablokowany"** (analogia tech-gate 🔒): `FleetManagerOverlay` lista szablonów — gałąź
  `!canBuildFacility` w łańcuchu powodów (`🛰 fleet.requiresOrbitalShipyard`, wiersz wyszarzony, hit-zone zdjęta) +
  `FleetTabPanel._drawDesignHull` — kadłuby wojenne/medium/large NIE ukrywane (usunięto `LEGACY_HIDDEN_HULLS`) lecz
  pokazane ZABLOKOWANE (🛰), by gracz ODKRYŁ progresję. Projekt medium+ MOŻNA tworzyć zawsze (gate na budowie, nie
  projektowaniu). i18n PL+EN `fleet.requiresOrbitalShipyard`.
- **Airtight (Opcja B) ROZWAŻONY i WYCOFANY** (rewizja #2): gate w fabryce `Vessel.createVessel` + `bypassHullGate`
  na ~10 ścieżkach spawnu. Wycofano po odkryciu: (a) **AI/enemy materializują floty z `colonyId = pozycja gracza
  (homePlanet.id)`, NIE właściciel** (`EmpireFleetMaterializer`/`SpawnTestEnemy` spawnują na orbicie gracza) →
  `isPlayerColony(colonyId)` fałszywie `true` → gate blokowałby floty wojenne AI; wymuszało bypassy na AI/enemy/dev =
  mina na przyszłość; (b) koszt/ryzyko dotykania WSPÓLNEJ fabryki bez realnej wartości — furtki dev/test
  (`spawnMyVessel`, Power Test, CombatSandbox) nieosiągalne w normalnej grze. Fabryka + wszystkie ścieżki spawnu =
  PRISTINE (jak przed slice'em).
- **Backlog (AI + stacje/gating kadłubów)**: docelowo mniej rozwinięte AI (bez stacji orbitalnej) buduje WIĘCEJ
  small hulli zamiast być zwolnione z gatingu — realny hull-gating AI przy PRZYSZŁYM skryptowaniu budowy statków AI
  (rozszerzyć `canBuildHullAt` również dla AI + stacje AI), NIE przez bypassy fabryki.
- Smoke `src/testing/smoke/s34d_hull_gating_smoke.mjs` 26/26 (G/P/AI/OLD/FLEET/UX/i18n) + pełna regresja 0 FAIL.

---

## Strefy wpływów — UKOŃCZONE (Wariant B, B0-B6, save v91, live-gate PASS — ARC ZAMKNIĘTY)

Warstwa polityczna mapy galaktycznej (Stratcom): każde imperium (gracz + AI) jako STREFA WPŁYWÓW —
pola wpływu posiadanych układów zlewają się (metaballe / marching squares) w organiczny kształt z tintem
koloru imperium + przerywaną izolinią; dwa odległe skupiska = dwa bąble; warstwa ZAWSZE widoczna (bez
user-toggle, tylko wewn. kill-switch `FEATURES.territoryOverlay`). Gracz wybiera barwę na starcie.

**Nowe systemy / pliki:**
- `src/systems/TerritoryService.js` — indeks własności układów (`getSystemOwner`/`getOwnedSystems`/
  `getSystemDevScore`/`getEmpireColor`/`reindex`; `Map<systemId,{owner,kind,devScore,colonyIds}>`).
  Event-invalidowany, leniwy rebuild, emituje `territory:ownersChanged`. Układ SPORNY: kolonia innego
  właściciela NIE zasila devScore strefy. `window.KOSMOS.territoryService`.
- `src/systems/TerritoryField.js` — pole `f=Σexp(-d²/r²)` per imperium na wspólnej siatce, marching
  squares (interpolacja) → **zamknięte pętle** + maska `Uint8` + `contested` + content-`hash`. Promień z
  devScore. Throttle: `territory:ownersChanged` + `time:tick`/civMonth WYMUSZA `reindex()`+`recompute()`
  (wzrost pop nie emituje eventu). `territory:merged` z guardem liczby źródeł. `window.KOSMOS.territoryField`.
- `src/ui/TerritoryRenderLogic.js` — pure: `resolveTerritoryVisibility` (fog + atWar),
  `buildTerritory3DPayload` (sig=content-hash+fog+atWar), `mergeFlashFactor`.
- `src/data/EmpireData.js` — `EMPIRE_COLOR_PALETTE` (8 barw; #33ccff domyślny gracza). `empire.color`
  przydzielany w `EmpireGenerator` (archetyp→wolny slot, ≠ gracz).

**Render:** `FleetManagerOverlay._drawStratcomGalaxy` 2D (tint maska→offscreen cache + izolinia dash+
war-pulse+contested+merge-flash + etykieta; romb właściciela **wariant B** = gracz + AI intel≥contact) +
radar (subtelny tint) + wiersz „Terytorium" (panel political/ops) + legenda. 3D:
`StratcomGalaxyRenderer.setTerritory` (płaszczyzna CanvasTexture na dysku y=-0.02 **DoubleSide** + izolinie
`LineDashedMaterial`; animacja dashu przez `onBeforeCompile` uDashOffset z fallbackiem statycznym; war-pulse
+merge-flash opacity per-frame; `_territorySig`=content-hash). Etykiety w chrome 2D. Miękkie krawędzie
tintu z `TERRITORY.SOFT_TINT`.

**Fazy/commity:** B0 `db48bc4` (wyburzenie 3 martwych map + `tools/check-i18n.mjs`) · B1 `110e753`
(TerritoryService + kolory + migracja **v90→v91** `_migrateV90toV91`) · B2 `9c2b4ff` (wybór barwy →
`gameState.player.empireColor` PRZED `EmpireGenerator.generate`) · B3 `1888a0c` (TerritoryField + **fix
root-cause**: `registerHomePlanet`/`restore` CICHO dodawały kolonię gracza → indeks stale; teraz emitują
`colony:listChanged`) · B4 `ea2e578` (render 2D) · B5 `46d8389` (render 3D) · B6 (polish + docs).

**Config `GameConfig.TERRITORY`:** ISO / GRID_LY / R_MIN_LY / R_MAX_LY / R_STATION_LY / BEACON_LY (hook) /
DEV_FULL / FILL_ALPHA / CONTESTED_T / SOFT_TINT / SOFT_RAMP_LO / SOFT_RAMP_HI. Kill-switch
`FEATURES.territoryOverlay`.

**Decyzje:** kolor gracza z palety (wybór na starcie, [[wybór-barwy]]); kolor=tożsamość, wrogość=
modyfikator (puls); fog-of-war (gracz zawsze / AI contact→pełny / rumor→szary / unknown→nic); romby
wariant B; warstwa zawsze widoczna; `empire.color` persystowany (migracja); układ sporny nie miesza
devScore; content-hash sig (miesięczny recompute nie przebudowuje sceny 3D). Plan/spec:
`prompt-cc-strefy-wplywow.md` + `plan-mapa-terytorium-imperium.md` (audyt).

---

<!-- CLAUDE.md L806–1427 -->
## Population 2.0 — Faza 1: jednostki całkowite + wzrost logistyczny + satysfakcja + rekalibracja prosperity (save v96, live-gate PASS — Faza 2 niżej)

Pierwsza faza redesignu populacji (`docs/POPULATION_REDESIGN.md` — źródło prawdy: §2.5/3.1/3.5/3.6/7).
Reszta (zatrudnienie/bezrobocie/płace/slider = Faza 2, ekonomia = Faza 3, droidy = Faza 4) czeka. **NIE
zaczynać Fazy 2 bez potwierdzenia.**

**Redenominacja ×4 (jednostka POP przedefiniowana; agregat NIEZMIENIONY — Decision 2 „pełna"):**
- Populacja ×4 (migracja `strata.count`; starty: `DEFAULT_POP 2→8`, Power Test 48, GameCore 16, CombatSandbox,
  SpawnTestEnemy, EmpireStrategy/Bootstrap), housing budynków ×4 (`BuildingsData` augment loop: colony_base
  16 / habitat 12 / launch_pad 4 / arcology 32 / orbital_habitat 80), `POP_CONSUMPTION ÷4` (food 0.625 / water
  0.375 / energy 0.25). Colonist ×4 (`SHIP_MODULES` colonistCapacity), crewCost ×4 (`HullsData`/`ShipsData`
  augment loops), `GROUND_UNIT_POP_COSTS`/`SURGE_POP_COST` ×4, MissionSystem crew consts (EXPEDITION/COLONY/
  RECON) ×4. Balans: pop×4 × per-pop÷4 = to samo.
- **`popCost → jobs`** (całkowite etaty, AUTORYTATYWNE): `BuildingsData` augment `jobs = popCost×4`
  (trade_union_hall 0.4→1). `BuildingSystem` czyta `jobs` w CAŁEJ logice zatrudnienia/demand/gating
  (`getSlotDemand`, `_getBuildingLaborEfficiency`, `installSynthetic`, build/upgrade/downgrade/demolish,
  `restoreFromSave` totalJobs, `entry.jobs`); `popCost`/`entry.popCost` ZOSTAJE tylko jako pole serialize
  (backward compat, NIEczytane przez logikę). Zewnętrzne modyfikatory zatrudnienia (`ImpactDamageSystem`,
  `RandomEventSystem`) też przełączone na `entry.jobs` (inaczej desync ×4). UI kosztu POP budynku (UIManager/
  ColonyOverlay/ThreeRenderer) pokazuje `jobs` (całkowite) zamiast ułamka.

**Model (§2.5, desync-proof):** `population` zostaje getterem `Σ strata.count`; NOWY getter
`humans = population + _growthProgress` (float). Inwariant `floor(humans)=Σ strata` Z KONSTRUKCJI (brak
drugiego zapisu totalu). Wzrost akumuluje `_growthProgress` (reużyty, martwy przed); pełna jednostka →
`addPop` (Faza 1 placeholder `_assignNewPopStrata`: max niezaspokojony demand, inaczej laborer, PHASE2_TODO).

**Wzrost logistyczny (§3.1, `CivilizationSystem._computeLogisticGrowth`/`_updateLogisticGrowth`):**
`growth = 0.04 × prosperityGrowthMult × planetMod × humans × (1 − humans/capacity)`. `planetMod` z pasm
temp/atmo/grav (`PopulationData.planetGrowthMod`, iloczyn clamp 0.6–1.0, ideał breathable+moderate+normal
= 1.0 baza, reużycie `EnvironmentBands`).
**Decision 1: capacity = Σ housing (skończony — dotyczy TAKŻE macierzystej)**; bramka non-breathable (hard
cap na `effectiveHabitatHousing`) ZACHOWANA. Stare `_updateStrataGrowth`/`_updatePopGrowth` = martwe (nie wołane).

**Satysfakcja kolonii (§3.5, NOWE `civSystem.satisfaction` 0-100):** `clamp(50 + 40×(1−unemp×3) −
15×crowding + tax, 0, 100)`; Faza 1 `unemploymentRate=0` (PHASE2_TODO), `crowding=max(0, humans/cap−0.85)/0.15`.
Dren podatkowy wydzielony do `ConsumerGoodsData.taxSatisfactionDrain` (reużyty przez `_calcSatisfaction` +
satysfakcję — jedno źródło progów, zero importu system↔system).

**Prosperity — rekalibracja (§3.6, 3 chirurgiczne zmiany, reszta NIETKNIĘTA):** (1) warstwa infrastructure →
`civSystem.satisfaction/100`; (2) GAMMA `target = 100×(raw/100)^1.5` PO wszystkich modyfikatorach (events/
tech/trade/faction), PRZED inercją; (3) inercja 0.15→0.08/rok. Efekt: zawyżone prosperity ze starych save
samo dryfuje w dół.

**Save v95→v96** (`_migrateV95toV96`): `col.civ.strata.count ×4` + `col.buildings[].housing ×4` +
population/housing/habitatHousing ×4 + `satisfaction=50`. `jobs` z ŻYWEJ definicji budynku przy restore (nie
w save); konsumpcja÷4 to zmiana danych. Poza tym format bez zmian.

**UI (minimum Fazy 1):** `displayPopulation → floor(humans)`; ColonyOverlay nagłówek
`POP: floor(humans)/capacity  ☺ satisfaction%`. Pełna zakładka Workforce = Faza 2.

**Pliki:** NEW `src/data/PopulationData.js`; edycje `CivilizationSystem`, `ProsperitySystem`, `BuildingSystem`,
`BuildingsData`, `ResourcesData`, `ConsumerGoodsData`, `SaveMigration`, `ShipModulesData`, `HullsData`,
`ShipsData`, `ColonyManager`, `MissionSystem`, `EmpireStrategySystem`/`EmpireColonyBootstrap`/`CombatSandbox`/
`SpawnTestEnemy`/`GameScene`/`GameCore`, `ImpactDamageSystem`, `RandomEventSystem`, `UIManager`/`ColonyOverlay`/
`ThreeRenderer`. i18n bez zmian (readout `POP`/`☺` neutralne). Legacy `PlanetScene` (nigdy nie otwierany) NIE
tknięty — czyta stary `popCost` w martwym UI.

**Testy:** `tmp_pop2_migration_smoke` 19 (migracja+neutralność konsumpcji/kolonizacji/rekrutacji) ·
`tmp_pop2_growth_smoke` 8 (krzywa logistyczna + gate non-breathable) · `tmp_pop2_prosperity_smoke` 5 (inercja
0.08 + GAMMA decay + math); regr colony-auto-expander (fixture'y ×4; T13 → nowy sygnał `humans`; 1 FAIL
pre-existing — well/waterless), bootstrap 33, breathable-home 23, save-restore-ai 18, transport 56, s34c 28 +
inne 0 FAIL. **Live-gate PENDING (użytkownik).**

**Re-gate FIX (po 1. live-gate — domknięcie redenominacji + growth/home UI):** live-gate złapał NIEPEŁNĄ
redenominację POZA `POP_CONSUMPTION`. Doskalowane (÷4 lub ×4, WSZYSTKIE site'y — grep raw-pop): survival
needs (`ProsperitySystem` food 3.0→0.75, water 1.5→0.375), consumer `BASE_DEMAND` ÷4 (`ProsperitySystem`
popyt/satysfakcja + `FactorySystem` cel produkcji — jedno źródło), `maturityFactor` popFactor /15→/60 +
distFactor gate pop<15→<60, `epochScore` totalPop/5→/20, `CIV_EPOCHS` minPop ×4 (40/120/320),
`CivilianTradeSystem` TC 200→50×pop, `ColonyManager` tax 5→1.25×pop + max ground units /4→/16 + „mała
kolonia" pop≤2→≤8, `PopulationOverlay` display ÷4, debug TC mirror. **AI/faction/war — ZERO progów pop**
(grep czysty; test-boty NIE skalowane — Faza 5 balans). planetMod: breathable 1.2→**1.0** (ideał=baza) →
growth breathable = `0.04 × humans × (1−h/K)` (weryfikacja: humans=48, cap=160 → **1.344/rok cyw., RAZ na
rok cywilny** — potwierdzone testem kadencji). **Home cap UI:** `effectiveHousing` NIE zwraca już ∞ na
macierzystej (Decision 1 — home capowana Σ housing) → wszystkie UI (TopBar/Outliner/PopOverlay/NavPeek)
pokazują skończony humans/capacity; ∞ zniknął.
**Growth display (re-gate #2):** JEDYNA metryka `CivilizationSystem.getAnnualGrowth()` (float z
`_computeLogisticGrowth` PRZED promocją, JEDNOSTKI POP/rok — NIE mieszkańcy); legacy `populationGrowthRate`
USUNIĘTE, `_lastGrowth` (binarny flag) MARTWY. Root-cause „+0/rok": `_fmtInhab`/`_fmtPop`/`fmtPeople`
(round(n) dla n<1000) zaokrąglały pop-unit float (0.2→„0") na TopBar/PopulationOverlay/NavPeek → teraz
`.toFixed(1)` (jednostki POP) WSZĘDZIE; ColonyOverlay nagłówek `+n.n/rok`. „0" = kolonia w capie (build habitaty).
Testy: migration **29** (+10 neutralność demand/survival/maturity/epoch/CIV_EPOCHS), growth **12** (+cadence
+getAnnualGrowth), prosperity 5; regr 0 FAIL (auto-expander 74/1 = pre-existing well/waterless). **Re-gate PENDING.**

**Świadomie POZA zakresem Fazy 1 (PHASE2_TODO):** zatrudnienie/bezrobocie/płace/pressure/slider, zakładka
Workforce, `_assignNewPopStrata` pełna alokacja, przeskalowanie zewnętrznych locków (crew/expedition/ground)
na całkowite jobs (dziś ×4 ułamkowo — spójne skalą), test-boty (RuleBot/MCTSBot/EvoBot) progi pop, droidy
tier-1 (`automation_droid`).

## Population 2.0 — Faza 2: zatrudnienie, bezrobocie, płace, migracja, focus, zakładka Workforce (save v97, commit `d95d9b8`, live-gate PASS)

Druga faza redesignu populacji (`docs/POPULATION_REDESIGN.md` §2.5/2.6/3.2/3.3/3.4/5.1/7.2). Buduje na Fazie 1.
Ekonomia (płace jako wydatek/tax/handel) = **Faza 3**; droidy = Faza 4. **NIE zaczynać Fazy 3 bez potwierdzenia.**

**Model B (fundament — „unemployed = realna pula POZA stratami"):**
- NOWE pola `civSystem._unemployed` (int) + `_focusBonus` (per strata). `population` getter = **Σstrata + _unemployed**
  (SUMA identyczna jak w Fazie 1 — nadwyżka, która pęchła w `laborer`, siedzi teraz w U → żaden konsument
  `population` nie widzi innej liczby; konsumpcja/housing/progi liczą wszystkich). `humans = population + _growthProgress`.
  Inwariant `floor(humans) = Σstrata + unemployed` z konstrukcji. Wzrost: nowy POP → `_unemployed++` (NIE `addPop`).
- **workers(type) = strata.count** (zawiera zablokowanych — spójne z produkcją). `unemployed = _unemployed`.
- `setPopulation` zeruje U; `removePop` fallback na U; `_recalcLoyalty` mianownik `_strataCount` (NIE population —
  inaczej U rozcieńcza lojalność); `emigrate/immigrate` przez pulę U (klucz breakdown `'unemployed'`).

**Alokacja `_allocateWorkforce()`** (raz/rok cyw. w `_yearlyUpdate` PRZED satysfakcją): (1) rekoncyliacja utraty
etatów — workers ponad `_humanJobs` (poza locked) → U; (2) Etap 1 bez tarcia — wolne etaty zasysają U wg płacy
malejąco; (3) Etap 2 z tarciem — migracja ≤10%/rok (`MIGRATION_FRICTION`) TYLKO do ściśle wyższej płacy z wolnym
etatem, locked nigdy nie migrują. Snapshot płac po rekoncyliacji (deterministyczne priorytety).

**Płace/pressure (§3.3):** `getStrataPressure = clamp((getSlotDemand+focus − workers − syntheticJobs)/effDemand,0,1)`;
`getStrataWage = BASE_WAGE[type]×(1+pressure)` (cap ×2). `getWorkforceBreakdown()` (name/icon/jobs/workers/pressure/
wage/focus/focusCap) zasila UI. `getTotalLaborCost()` = hook **Fazy 3** (BEZ odejmowania Kr — wydatek to Faza 3).
Stałe w `PopulationData.js`: `BASE_WAGE`, `MIGRATION_FRICTION=0.10`, `FOCUS_BONUS_MAX=0.25`.

**Focus slider (§2.6):** `_focusBonus[type]` int 0..`_focusCap = jobs>0 ? max(1, floor(0.25×jobs)) : 0` (FIX B — strata
z 1–3 etatami dostaje ≥1 krok; 0 budynków = brak slidera). Tworzy pressure/płacę, NIE realne etaty (staffing = `_humanJobs`).

**Synthetic (§3.4):** `BuildingSystem.getSyntheticJobs(type)` netuje syntetyki TYLKO w pressure/alokacji; `getSlotDemand`
zostaje brutto (`PHASE4_TODO` na kwirk: synth influje demand → niższa eff. innych budynków tej straty; behawior
syntetyków = Faza 4).

**FIX A (live-gate) — koniec bramki POP na budowie** (§1/§3.4 płynna obsada): usunięte gate'y `freePops<jobs` w
`BuildingSystem._build`/`_upgrade`/`_tickPendingQueue` + `ColonyAutoExpander` (`restFromBuilds` już nie odpoczywa na
`freePops≤0`, tylko limit kolejki). Budynek dodaje wolne etaty, działa `min(1, staffing)`, alokacja/wzrost go zapełniają.
Koszty surowców/Kr bez zmian. Player build UI nie miał gate'a POP (grep czysty). `convertToStrata` przy aktywacji =
best-effort (return ignorowany, teraz źródło = U najpierw). Crew-locki statków (ColonyManager) DALEJ gate'ują — poza A.

**⚠ freePops NIETKNIĘTE:** formuła `population − employedPops − lockedPops` zostaje (Model B → steady-state
freePops ≈ unemployed; test (f) pilnuje `freePops===unemployed` przy synth/lock=0). Komentarz „future-refactor hook"
(NIE `TODO`) przy getterze. ~40 konsumentów freePops (ekspedycje/załogi/ground/AI/UI) nietkniętych.

**Satysfakcja:** `_updateSatisfaction` czyta realny `unemploymentRate = _unemployed/population` (był stały 0, §3.5).
Desync-fixy Fazy 1 (ImpactDamage/RandomEvent) route'ują OK — oba `_active.delete` → getSlotDemand spada → alokacja
wiktuje nadmiar do U.

**Zakładka Workforce (ColonyOverlay, prawa kolumna, §5.1):** `_infoTab` 'planet'(default)|'workforce';
`_drawInfoTabs`+`_drawWorkforceTab`. Tabela `jobs | workers | wage (amber gdy pressure>0.25) | focus [− n +]` + stopka
(bezrobotni red>10% humans, satysfakcja, prosperity+strzałka trendu do targetu, wzrost `+n.n/rok`). Hity
`infoTab`/`focusMinus`/`focusPlus` → `_onHit`. Gate `canWorkforce = civSystem && !isPreview && !isOutpost`.
`STRATA_META` (hoisted PL+EN+ikona) reużyte w `getStrataBreakdown` + `getWorkforceBreakdown`. i18n `workforce.*` +
`colonyInfo.tabPlanet/tabWorkforce`.

**Debug:** `window.KOSMOS.debug.colonies()` (GameScene) — console.table wszystkich kolonii (gracz+AI): nazwa/
właściciel/pop(humans/cap)/bezrobotni/satysfakcja/prosperity(`colony.prosperitySystem`)/wzrost/budynki. Zwraca też
tablicę wierszy.

**Save v96→v97** (`_migrateV96toV97`: seed `unemployed:0`+`focusBonus:{}` per kolonia; restore broni `?? 0`/`?? {}`).
Serialize/restore + `_popSnapshot` niosą `unemployed`.

**Pliki:** `CivilizationSystem` (rdzeń), `BuildingSystem` (getSyntheticJobs + 3× usunięty gate POP), `PopulationData`
(BASE_WAGE/friction/focus), `ColonyAutoExpander` (rest bez freePops), `SaveMigration` (v97), `ColonyOverlay` (Workforce
tab), `GameScene` (debug.colonies), i18n pl/en. Testy: `tmp_pop2_employment_smoke` **43/43** (a–f + FIX A 6 + FIX B 6).
Regr 0 nowych FAIL (auto-expander 74/1 = pre-existing well/waterless; **s34c_trade_selfcargo 6/15 + s34c_z1_tradecap
7/12 = PRE-EXISTING**, stała formuła TC 200×pop vs 50×pop — naprawa w Fazie 3).

**Świadomie POZA zakresem Fazy 2 (Faza 3+):** płace jako wydatek imperium + tax na EMPLOYED + mnożnik handlu +
bilans per kolonia + staffing-scaled energy (Faza 3); naprawa fixture'ów s34c TC (Faza 3); droidy tier-1 (Faza 4);
re-ewaluacja sprzężenia bezrobocie→satysfakcja→prosperity→wzrost (Faza 5 — może za karzące).

## Population 2.0 — Faza 3: ekonomia (płace/podatek/handel/bilans) + staffing-scaled energy + UX (save v97 bez migracji, commit `6b7dc3b`, live-gate PASS)

Trzecia faza redesignu populacji (`docs/POPULATION_REDESIGN.md` §3.7/3.8/5.2/7.2). Buduje na Fazie 2. Droidy =
**Faza 4**; tuning + AI economy = Faza 5. **NIE zaczynać Fazy 4 bez potwierdzenia.**

**Ekonomia:**
- **Płace = realny wydatek** (`ColonyManager._applyTaxes`, miesięcznie per kolonia): `getTotalLaborCost × fraction`,
  floor przy 0 (soft flow, bez kary). **SYMETRYCZNIE gracz+AI** — kredyty AI drenują do 0 KOSMETYCZNIE (AI NIE ma
  powtarzalnego dochodu: podatek pomija AI, handel wymaga portu tylko-stolice, brak budżetu imperium, 1000 Kr
  stolica/0 ekspansja; AI działa na SUROWCACH, zero bramek kredytowych → 0 Kr nie psuje zachowania AI). 2× `PHASE5_TODO`
  przy sicie (pełna ekonomia AI + konsekwencje niepłacenia płac).
- **Podatek na ZATRUDNIONYCH** (`calculateTaxIncome`): `employed × 1.25 × prosperity × taxRate`; `employed =
  civSystem.employed` (= `_strataCount` = population − unemployed; WYKLUCZA bezrobotnych I etaty syntetyczne — żadne
  nie ma workera w stracie). Zablokowani (crew) PŁACĄ (trzymają etaty). taxRate/prosperity coupling NIETKNIĘTY.
- **Mnożnik handlu** (`CivilianTradeSystem._routeGoods`, colony→colony): `exportKr/importKr × (1 + K_TRADE ×
  getIndustryEmploymentShare())` per kolonia-beneficjent. `K_TRADE=0.5` (PopulationData). Share = {laborer,miner,
  worker}/employed (0→×1.0, sam przemysł→×1.5).
- **Bilans**: EconomyOverlay BUDŻET + CivilizationOverlay net `− totalLaborCost` (linia „Płace"/`civOverlay.laborCost`);
  Workforce footer: przychód(podatek+handel) / płace / netto ±Kr/rok. Inwariant: Δkredytów = Σpodatek − Σpłac (floor
  przy 0, bez fantomów — test a).

**Staffing-scaled energy** (`BuildingSystem._applyTechMultipliers`, gałąź `val<0 && key==='energy'`):
`× max(0.2, empPenalty)` — 20% standby dla wybudowanego-nieobsadzonego, pełny pobór przy pełnej obsadzie.
Autonomiczne (jobs=0 → empPenalty 1.0) bez zmian; TYLKO strona konsumpcji (produkcja plantów skaluje się w gałęzi
val>0). Brownout throttluje TYLKO nie-energetyczną PRODUKCJĘ, niezależny od obsady → **brak oscylacji** (brownout T11).

**Alokacja Etap 1 — pressure-desc** (§3.2, zmiana z Fazy 2): ranking bezrobotnych po PRESSURE malejąco (tie-break:
płaca desc), NIE po płacy. Inaczej focus na niskopłatnej stracie (laborer) bezużyteczny (focus podnosi pressure, nie
płacę). Etap 2 migracja ZOSTAJE wg płacy (ekonomiczny ciąg).

**⚠ 3 root-cause bugfixy z live-gate (kluczowe):**
- **BUG 1 (energia nie skalowała w LIVE bilansie) — ORDERING:** `_activateBuilding` liczył `effectiveRates` PRZED
  wpisem budynku do `_active` I przed `convertToStrata` → `getSlotDemand=0` → guard `_getBuildingLaborEfficiency`
  (`demand<=0 return 1.0`) → empPenalty=1 → pełna energia rejestrowana na starcie, nigdy nieskalowana. FIX: wpis do
  `_active` + obsada PRZED liczeniem stawek. `civ:staffingChanged` (event tylko-aktywna kolonia) ZASTĄPIONY
  bezpośrednim `this.buildingSystem._reapplyAllRates()` po `_allocateWorkforce` (KAŻDA kolonia). **Debug:
  `KOSMOS.debug.energyChain(planetId?)` STAŁE narzędzie** (console.table łańcucha energii per budynek — Faza 5 profiling).
- **BUG 2 (satysfakcja 0% obok prosperity 97↑100):** `ColonyManager.switchActiveColony` ustawiał `civSystem`
  bezwarunkowo, ale `prosperitySystem`/`factorySystem`/`buildingSystem` warunkowo `if (colony.X)` → przełączenie przez
  kolonię bez systemu zostawiało `prosperitySystem` STAREJ kolonii → UI czytało satysfakcję nowej OBOK prosperity
  innej. FIX: WSZYSTKIE bezwarunkowo `?? null`. (Model satysfakcji zweryfikowany OK: ~46 przy 35% bezrob.)
- **BUG 3 (Emp. 10.2 ułamkowe > Jobs):** `_lockedPerStrata` bywa UŁAMKOWE (`_distributeLock` proporcjonalnie) →
  `count − locked` wciekał ułamek do strata.count/_unemployed. FIX w MODELU (`_allocateWorkforce`): normalizacja
  całkowitości na wejściu (floor strata, reszta→U, suma zachowana) + `Math.floor(count − locked)` we WSZYSTKICH ruchach.

**UX:** Workforce strata-row hover → lista budynków tej straty; tooltip budynku (menu + postawiony) „Etaty: n× <warstwa>";
tooltip slidera focus (mechanika). FIX 4: w trybie Workforce globus 26% (nie 42%) → miejsce na linię Bilans. i18n
`workforce.*` + `civOverlay.laborCost`. `STRATA_META` eksportowane z CivilizationSystem (import w ColonyOverlay).

**Save v97 BEZ migracji** (round-trip przez istniejący format — zero nowego stanu persystentnego). **Fixture'y s34c
naprawione** (formuła TC 200→50/pop): z1 700→250 / 900→450, selfcargo base 150.

**Pliki:** `ColonyManager` (tax/wages/switchActiveColony), `CivilizationSystem` (employed/industryShare/Etap1 pressure/
BUG3), `BuildingSystem` (energy scale/`_activateBuilding` ordering), `CivilianTradeSystem` (mnożnik), `PopulationData`
(K_TRADE), `GameScene` (debug.energyChain), `ColonyOverlay`/`EconomyOverlay`/`CivilizationOverlay`, i18n. Testy:
`tmp_pop3_economy_smoke` **32** (a–e + BUG1 real-path), `tmp_pop2_employment_smoke` **52** (+BUG3 +F3 pressure),
`energy_brownout_gate_smoke` **32** (+T11). Regr 0 nowych FAIL.

**Świadomie POZA zakresem Fazy 3:** droidy tier-1 (`automation_droid`, Faza 4); pełna ekonomia AI (dochód/budżet AI,
Faza 5); re-ewaluacja sprzężenia bezrobocie→satysfakcja→prosperity→wzrost (Faza 5); konsekwencje chronicznego
niepłacenia płac (Faza 5).

## MVP Zlecenia Transportowe (logistyka) — UKOŃCZONE (save v95, live-gate PASS, commity `5fbe873`+`5009d41` push main)

Pierwszy, celowo wąski wycinek reformy logistyki (`docs/plan-gielda-ladunkowa.md`) — reszta (Giełda
Ładunkowa, tryby Manual/Priorytetowy/Reaktywny, auto-detekcja deficytu) czeka na ocenę tej wersji light.
Plan: `docs/plan-mvp-zlecenia-transportowe.md`. **NIE zaczynać pełnej Giełdy bez potwierdzenia gracza.**

**Zachowanie:** gracz jawnie deklaruje zlecenie (ile dobra A/B, z kolonii F do T), a statki z opt-in
„puli logistycznej" wożą to automatycznie — **przez `OrderService`, z realnym paliwem** (nie fuel-immune
jak kurierzy AI). Zlecenie jednorazowe (po dostawie znika), FIFO, wiele statków/zlecenie.

**Część A (osobny commit `e6a331c`):** zawór przepustowości handlu cywilnego — stawka `_routeGoods`
0.3→1.8 (90%/tick) + twardy clamp `qty=min(qty, surplus)` (ochrona rezerwy 2-letniej). Nic więcej w
`CivilianTradeSystem` nietknięte.

**System `src/systems/TransportOrderSystem.js`** (`window.KOSMOS.transportOrderSystem`, instancja w
GameScene po `orderService`, restore-hook `onRestore()` po `vesselManager.restore`):
- Stan w `gameState.transportOrders {orders, pool, nextId}` (reactive store). Przydział statku w
  `order.assignments[]` (NIE na Vessel — bez dual-source-of-truth jak martwy `assignedRouteId` AI).
  Pula = osobny rejestr vesselId (opt-in, `!isEnemyVessel` → rozłączna z kurierami AI).
- Maszyna stanów **event-driven** (`expedition:arrived`, NIE `mission:arrived` — MissionSystem emituje
  OBA, subskrypcja obu = podwójny `_onArrival` → „kończy" haul na statku w locie): `to_origin` (pusty
  lot/skok do źródła) → `_loadAndHaul` (mix dóbr wg wagi/cargoMax, ≤ `remaining−inFlight`) → `hauling` →
  dostawa (MissionSystem `dockAtTarget`+`store.receive`). `_completeHaul` idempotentne przez pusty courseCargo.
- Dispatcher **fair-share/round-robin** (`_pump` krok 2 + `_pickFreeVessel`): WSZYSTKIE otwarte zlecenia
  obsługiwane RÓWNOLEGLE. Statki dobierane wg GŁODU — zlecenie z mniejszą liczbą już przypisanych
  statków bierze pierwsze, FIFO (`createdYear`/`id`) tylko tie-break. ⚠ sort po LICZBIE PRZYDZIAŁÓW, nie
  tylko wewnątrz jednego `_pump` (statki dochodzą do puli pojedynczo → każdy `addToPool`/dostawa = osobny
  `_pump`; bez tego duże zlecenie łapało każdy kolejny statek — root-cause „idzie w kolejności"). Preferencja
  `_pickFreeVessel`: same-system zlecenie bierze statek BEZ warp (rzadkie warp zostają dla cross-system;
  fallback na warp gdy tylko taki zdatny). Anti-overshoot przez `inFlight` + rezerwację pojemności (`tonsLeft`);
  `consumed`-set (statek pominięty dla jednego zlecenia trafia do kolejnego). Cleanup na
  `vessel:wrecked`/`colony:destroyed`. Lekki sweep `time:tick` (`SWEEP_INTERVAL_CIVYEARS=0.5`) łapie fazę
  `waiting` (źródło puste) + launch-retry.
- **Cross-system (warp):** `createOrder` DOZWALA różne układy BEZ bramki tech (brak statku warp w puli →
  zlecenie czeka). Odcinki (`_issueHaul`/`_issueEmptyToF`) celują w układ celu/źródła **live** (`_sysOf`) →
  `OrderService` sam robi composite (skok warp→dostawa + skok powrotny przez `vessel.pendingOrder`). Dobór
  statku `_canServe`: same-system=dowolny cargo, cross-system=**warp-capable** (`warpFuel.max>0`).
  ⚠ **Tankowanie statków warp w puli = sprawa GRACZA** (świadomie brak automatycznej bramki round-trip;
  bez zapasu `warp_cores` na trasie statek utyka w źródle po załadunku).
- Kill-switch `FEATURES.transportOrders` (default ON). Kolaboratorzy leniwie przez `window.KOSMOS`.

**UI (zakładka LOGISTYKA w `FleetManagerOverlay`, gated `transportOrders`):**
- Builder (lewa, **scrollowalny** — przycisk „Utwórz" przypięty do dołu): drop-downy From/To (kolonie
  gracza + nazwa układu; przeciwny koniec niewybieralny) + drop-down **pełnego katalogu dóbr**
  (`_LOGI_GOOD_CATALOG` = surowce bez research/energy + wszystkie commodities) + wybrane towary z
  `[−]/[+]/[✕]` i **ręcznym wpisaniem ilości** (DOM `<input>`, wzór `EconomyOverlay._openOneShotQtyInput`,
  `×SCALE`, Enter/blur commit). Drop-downy wzajemnie wykluczające, wheel routowany per-panel, hit-zony
  przycinane poza widokiem (`_clipRightHitZones`).
- Lista zleceń (prawa, scrollowalna): paski postępu per dobro + **statki z fazą** (⇒ wiezie / → powrót /
  ⏳ czeka / **⚡ skok warp** gdy `mission.phase==='warp_transit'`) + FIFO + anuluj. **Badge ⚡** na
  zleceniu cross-system.
- Toggle „w puli logistycznej" w panelu statku (`_drawActions`, obok Refuel Auto, BEZ wymogu doku).
- Cleanup DOM inputu przy `_switchTab`/`close`.

**Save v94→v95** (`_migrateV94toV95` — jawny seed `transportOrders`; cross-system BEZ migracji, układy
live). i18n PL+EN `transportOrder.*` + `fleet.tabLogistics/addToPool/removeFromPool`.

**Smoke:** `tmp_transport_orders_smoke.mjs` 53/53 (walidacja, pula+odrzucenie AI, mix dóbr, kursy,
FIFO, anty-nadmiar, end-to-end pusty powrót, cleanup, round-trip, **T12 cross-system dobór warp + leg
target, T13 brak warp→czeka**) + `tmp_transport_ui_render_smoke.mjs` 32/32 (drop-downy, katalog,
qty-input, statki+fazy, badge ⚡, scroll) + regresja 0 FAIL. **3 realne bugi złapane przez smoke:**
podwójny `expedition:arrived`/`mission:arrived`, `_drawBar` (FMO nie dziedziczy BaseOverlay), izolacja testów.

**POZA zakresem (backlog, po ocenie gracza):** auto-detekcja deficytu, tryby Manual/Priorytetowy/Reaktywny,
Giełda Ładunkowa, zdarzenia logistyczne, auto-budowa statków gdy pula pusta, handel cross-empire (osobny
`TradeOrderBoard`/S3.5b), automatyczna bramka round-trip paliwa warp.

---

## Orbital Logistics Hub — „system pool" surowców matka+księżyce (moduł stacji, save v99 bez migracji, live-gate PASS — ARC ZAMKNIĘTY)

Moduł stacji `logistics_hub` (`StationModuleData.js` — `unique`, `motherEnergyUpkeep:6`, buildTime ~6 civY,
koszt Ti 600 + electronic_systems 100) spina kolonię-MATKĘ (planetę stacji) i kolonie JEJ KSIĘŻYCÓW we
WSPÓLNĄ pulę surowców MATERIALNYCH (minerały + towary). Rozszerza wzorzec runtime-poolingu z S3.4c
(depot-jako-proxy) na księżyce: magazyn FIZYCZNIE per-kolonia, persystuje TYLKO istnienie modułu
(`StationSystem.serialize` modules) — pula liczona w runtime. Save **v99 BEZ migracji**. Kill-switch
`FEATURES.orbitalLogisticsHub` (default ON) — OFF = `getStore` zwraca surowy ResourceSystem (zero poolowania).

**`SystemPoolService`** (`src/systems/SystemPoolService.js`, `window.KOSMOS.systemPoolService`, runtime-only —
wzór TerritoryService): per-tick LENIWY recompute (`_dirty` na `time:tick` + station/colony eventy) →
`_ensureFresh` (getStore/getPool zawsze świeże NIEZALEŻNIE od kolejności handlerów). Pula = stacja gracza z
AKTYWNYM `logistics_hub` + rozwiązana matka (`resolveHomeColony`) + planeta-kotwica/stacja NIE zablokowane;
członkowie = kolonia kotwicy + kolonie księżyców (`parentPlanetId===kotwica`), księżyc zablokowany wypada
osobno; **≥2 członków** (sama matka bez księżyców = brak puli). Anchor = `motherBody.type==='moon' ? parentPlanetId : id`.
- **`getStore(resSys|colonyId)`** → `PooledStore` gdy członek aktywnej puli, inaczej surowy magazyn (identyczność
  off-pool → zero zmian zachowania). JEDYNY punkt wejścia call-sites.
- **Blokada (per-body compose)** `_hostileWarshipInOrbit`: wrogi (`isEnemyVessel`) UZBROJONY (`hasWeapons`)
  statek `dockedAt===body.id` (orbiter TEGO ciała) LUB free-float (`dockedAt=null`) ≤ 0.5 AU (`euclideanAU`) +
  same-system guard. ⚠ dok przy INNYM ciele NIE liczy się przez bliskość (księżyc orbituje planetę <0.5 AU →
  inaczej dok przy księżycu blokowałby też planetę — złapane smoke'em). Reuse: brak per-body helpera
  (`WarSystem.playerHasOrbitalDominance` jest per-SYSTEM).
- **Upkeep energii hubu na MATCE** (`_syncHubEnergy`, always-on): `registerProducer('logi_hub_<id>',
  {energy:-motherEnergyUpkeep})` na `resolveHomeColony(station).resourceSystem`, DIFF (register/remove tylko
  przy zmianie — bez churn `_recalcPerYear` co tik). NIE bramkuje linku (decyzja „always-on") — może wepchnąć
  matkę we WŁASNY per-kolonia brownout. Energia NIGDY nie poolowana.
- **Survival reconciliation** (`_reconcileSurvival`, food/water): POP je UJEMNĄ stawką w `ResourceSystem._update`
  (NIE `spend()` → fasada tego nie widzi) → raz/turę dokarm niedoborowych członków z nadwyżki rodzeństwa (matka
  najpierw). Pusta pula → członek zostaje na 0 → normalne wygłodzenie (bez zmian). ≤1-tick lag akceptowany.
- **`poolCoversSurvival(resSys, resId)`** (reużyty przez 3 systemy — JEDNA reguła, zero forka): true gdy resSys jest
  członkiem puli I rodzeństwo ma dany surowiec. TŁUMI FAŁSZYWĄ karę „lokalny stan ≈0" dla członka karmionego §7 w:
  (a) `ResourceSystem._update` — flaga/flash `resource:shortage` (food/water); (b) `ProsperitySystem._calcSurvivalSatisfaction`
  — kara survival-scarcity (ratio→1); (c) `PopulationOverlay._calcNeeds` — wiersz NEEDS („🛰 Zasilane z puli" zamiast
  deficytu). Pula PUSTA / link ZERWANY / nie-pooled → false → kara/deficyt jak dotąd (realne wygłodzenie nietknięte).
  Tylko food/water (energia/materiał/przemysł poza tłumieniem).
- **Kill-switch hardening**: OFF-tick (`_onTick` gdy flag=false) czyści pule + `_dirty=true` → ponowne włączenie
  ZAWSZE odbudowuje od zera (koniec ryzyka „cache pustego wyniku"). ⚠ resztkowy wróg z testu blokady utrzymuje pulę
  rozpuszczoną po re-enable — to POPRAWNE (blokada), nie bug kill-switcha.

**`PooledStore`** (`src/utils/PooledStore.js`): wrapper dom + rodzeństwo. `receive`→dom (deposit ZAWSZE lokalny);
`spend`/`canAfford`/`getAmount`/`inventory` = pooled dla materiałów (draw local→matka→księżyce wg stanu),
energia/research delegowane do domu. **all-or-nothing** gdy pula nie pokrywa (draw-now — smooth proporcjonalny
throttle §5 ODROCZONY do follow-up).

**Call-sites pool-aware (`window.KOSMOS.systemPoolService?.getStore(...) ?? raw`):** `MissionSystem._bestEffortLoad`
(ładowanie cargo z ciała w puli; DOSTAWA zostaje lokalna — `_processTransportArrival` używa `targetCol.resourceSystem`).
`BuildingSystem` build/upgrade/pending/konwersja (wejście z puli, WYJŚCIE konwersji lokalne). `FactorySystem`
`_hasIngredients`/`_getMissingIngredients`/`_consumeIngredients` (bramka dostępności I konsumpcja z puli — inaczej
moon-factory bez lokalnych surowców nigdy nie startuje → pooling byłby martwy). `resolveTransferStore` NIETKNIĘTY
(bez niespodzianek dla refuel/innych callerów). Off-pool wszystkie te wraps = identyczność (`systemPoolService`
undefined w smoke'ach → `?? raw`).

**UI:** StationPanel + StationManagementView — gdy matka w puli, „Wspólna pula (planeta+księżyce)" + członkowie +
suma (zamiast „Wspólny magazyn"); moduł `unique` → picker `✓` (drugi hub niebudowalny) + guard w
`StationSystem.addPendingModuleOrder` (`already_present`). ColonyOverlay nagłówek (rząd 2, INLINE z klastrem POP/☺,
lewa strona): `🛰 Połączona z hubem orbitalnym ▸ <planeta>` (linked) / `⚠ Łącze zerwane — blokada` (severed) via
`getHubLinkInfo` (severed przez `_hubAnchors` — działa NAWET gdy blokada jedynego księżyca rozpuściła pulę <2).
`PopulationOverlay` NEEDS: food/water pool-aware — pool-fed → pasek pełny + „🛰 Zasilane z puli (bez kary)" zamiast
fałszywego deficytu. `TopResourceDrawer` plakietka `▸PULA`/`⚠PULA` per-kolonia (tooltip=`getPoolSnapshot`, liczby
LOKALNE). EconomyOverlay bez zmian. i18n `station.systemPool` + `colony.hubLinked/hubLinkSevered` + `popPanel.fedFromPool`
+ `topBar.hubPoolBadge` PL+EN.

**Decyzje (Q&A):** hub always-on (energia nie bramkuje linku, tylko kosztuje matkę); §5 draw-now-throttle-later
(all-or-nothing gdy pula nie pokrywa; smooth `available/required` throttle = follow-up); blokada per-body compose.
**Świadomie POZA zakresem (follow-up):** smooth proporcjonalny throttle §5; pooling paliwa/refuel; huby AI;
pooling cross-system (warp); instalacja droida (`BuildingSystem` synthetic install) zostaje lokalna.

**Pliki:** NEW `SystemPoolService.js` + `PooledStore.js` + smoke `orbital_logistics_hub_smoke.mjs` (70/70);
edycje `StationModuleData` (logistics_hub), `GameConfig` (flaga FEATURES), `GameScene` (wiring), `MissionSystem`,
`BuildingSystem`, `FactorySystem`, `StationSystem` (unique guard), `ResourceSystem` (shortage gate),
`ProsperitySystem` (survival branch), `StationPanel`, `StationManagementView`, `ColonyOverlay`, `PopulationOverlay`
(NEEDS), `TopResourceDrawer` (badge), i18n pl/en. Regresja: sweep 75/75 0 FAIL, i18n parity PASS.
**Live-gate PASS** (§7 feed 26→94, countertest drop 95→84; blokada per-body; kill-switch toggle; NEEDS/shortage/
prosperity suppression). Commity: C1 `ad1347f` (foundation) · C2 `3a7c321` (call-sites) · C3 `9726e5b` (UI+i18n) ·
C4 `c1b7e0a` (TopBar badge) · C5 (docs — ten commit).

---

## ColonyOverlay — prawy panel info: layout backbone Załogi (Option 1, save v99 bez migracji, live-gate PASS, commit `0f47498`)

Rework zakładki **Załoga** przed C5 (Populacja), by nowa treść siadała na zdrowym fundamencie, nie na
ciasnym. Problem wyjściowy: globus kurczył się do 0.26·h (flaga `compactGlobe`), a 7 strat × 2-linie tłoczyło
się w jednej wysokiej kolumnie. **Audyt + opcje: `AUDIT_ZALOGA_LAYOUT.md`** (untracked, wzór `AUDIT_COLONY_OVERLAY.md`).

**Co weszło (Option 1 „backbone"; Option 2 — kompaktowe 1-linijkowe wiersze + detal na klik — ODROCZONE):**
- **Przypięta stopka (S1/S2/S4):** `_drawInfoPanel` rezerwuje dolne pasmo (`WF_SUMMARY_H=54 + WF_SUMMARY_GAP=12`);
  `_drawWorkforceTableV2` rysuje TYLKO przewijaną tabelę strat (zwraca wysokość dla scrolla), a nowe
  `_drawWorkforceSummaryV2` rysuje zdrowie+bilans (Bezrobotni/Satysfakcja · Prosperity/Wzrost · Bilans) w 2 kolumnach
  **poza transformacją scrolla** → linia Bilans zawsze widoczna. Tabela strat przewija się (scroll C4) gdy wysoka.
- **Zunifikowany STAŁY globus (S3):** początkowo adaptywny (`adaptiveGlobeSize`, slack/floor/cap), ale „skok" przy
  przełączaniu zakładki lepiej rozwiązać ZNOSZĄC różnicę rozmiaru niż licząc ją sprytniej. Zastąpione jedną wspólną
  `fixedGlobeSize(h,w,pad)=round(0.42·h)` clamp do szer. — **obie zakładki liczą globus tą samą linią** → `discSize`
  i content-start-y IDENTYCZNE przy każdej wysokości Z KONSTRUKCJI (zweryfikowane 1080/900/720/600p).

**⚠ ZASADA STAŁA (C5/C6 też):** żadna zakładka NIE dostaje mniejszego globusa niż stała frakcja 0.42 — **scroll (C4)
jest jedynym zaworem na wysoką treść**. NIE przywracać per-zakładkowej frakcji globusa (`compactGlobe` usunięte). Zapis
w komentarzu `fixedGlobeSize` (`InfoPanelLayoutLogic.js`).

**⚠ `hasSummary` NIE jest jeszcze generyczne:** `hasSummary = tabCfg.summary === true && wfV2`; `wfV2` twardo koduje
`activeTab==='workforce'` (chroni przed podwójną stopką na ścieżce legacy V1, która ma stopkę wpisaną we własną
przewijaną treść). Przyszła zakładka `summary:true` (C5) potrzebuje WŁASNEGO odpowiednika guardu „stopka już
wyłączona z body", NIE dosłownie `wfV2`.

**ROW_H (30) + geometria stepperów focus/droid (`stepperButtonBand`) — NIETKNIĘTE** przez cały ten arc (bez re-tune,
browser-verified nadal celne kliknięcia). Bez i18n, bez migracji (pure UI, v99).

Pliki: `InfoPanelLayoutLogic.js` (`fixedGlobeSize` zastąpił `adaptiveGlobeSize`), `ColonyOverlay.js` (split tabela/
stopka + pinowanie + wspólny globus), NEW keeper `src/testing/smoke/info_panel_adaptive_globe_smoke.mjs` 17/17
(fixed-globe sanity + identyczność Planeta↔Załoga + krótkie okno room/clearance + no-crash). Sweep 76/76 0 FAIL.

---

## Stacja jako zakładka info-panelu — C6/C6c ARC ZAMKNIĘTY (save v99 bez migracji, live-gate PASS)

Dwie akcje nagłówka ColonyOverlay (🎖 Rekrutuj, 🛰 Stacja) + cały pełnoekranowy „tryb stacji" przeniesione do
zakładek prawego info-panelu; stacje orbitalne zyskały cap „1 na grupę planeta+księżyce" i PEŁNE zarządzanie w
zakładce. Buduje na backbone Załogi (`_getInfoTabs` data-driven + per-tab scroll + `fixedGlobeSize`).
**Commity:** C6a `e89f83c` · C6b `1e6930d` · C6c-1 `7709d0b` · C6c-2a `1dff2c9` · C6c-2b-i `9d12e40` · C6c-2b-ii
`990c638` · C6c-3 `6704ec7`. Close-out: `AUDIT_COLONY_OVERLAY.md` (untracked).

- **C6a — Rekrutuj → Załoga:** 🎖 trigger z nagłówka na GÓRĘ tabeli strat (`_drawWorkforceTableV2`), visible-locked 🔒
  bez koszar. Modal `_drawDraftModal`/`_handleDraftClick`/`_draftPanel` + bramka koszar BEZ zmian.
- **C6b — Stacja build dialog → zakładka:** dawny floating `_drawStationDialog` → `_drawStationTab` (panel-relative,
  clip/scroll/prune). Dołączana WARUNKOWO w `_getInfoTabs(colony)` (tech `orbital_construction` + pełna kolonia gracza
  — hide-entirely, NIE locked). NEW `fitTabFontPx` (InfoPanelLayoutLogic, pure) — 4-zakładkowy pasek auto-dobiera font
  (10px@INFO_MIN 300 / 11px≥314). **activeTab sanitacja**: stale 'stacja' → 'planet' gdy kontekst bez zakładki.
- **Cap „1 stacja na grupę" — NEW `src/utils/StationGroup.js`** (pure, DECOUPLED od HUB-gate; ⚠ NIE importuje
  SystemPoolService — ta sama derywacja `parentPlanetId`, wyciągnięta BEZ bramki `logistics_hub`):
  `stationGroupOf(body)` → `{anchorId, memberBodyIds}` (kotwica=planeta; księżyc→parentPlanetId) ·
  `resolveStationGroupState(group,{getStationsAt,getColony})` → `build | exists{station,stationBodyId} |
  pending{order,targetBodyId,issuerColonyId}` (pola ROZŁĄCZNE per-stan — brak przeciążonego `bodyId`) ·
  `resolveStationTabHost(station)` (C6c-3 redirect) · `_resolveStationGroupState(colony)` = wspólne źródło (body
  zakładki + pinowany nagłówek). Cap = **formularz budowy chowa się group-wide** gdy w grupie jest stacja/pending
  (formularz = jedyna ścieżka tworzenia zlecenia) + defensywny re-check w `ColonyManager.addPendingStationOrder`.
- **C6c-2a — pending group-aware:** „W kolejce" (`_drawStationPending`) + linia `🛰 ▸ <ciało>`. Cancel celuje w
  kolonię-WYSTAWCĘ (`issuerColonyId`), NIE oglądaną (pending grupy może pochodzić z rodzeństwa).
- **C6c-2b-i/ii — pełne zarządzanie (STATE exists):** `drawStationManageCompact` (StationManagementView, single-column
  scroll-aware embed) — 2b-i read-only, 2b-ii akcje (🗑/✕/＋moduł/＋statek) przez `bhit` (noop gdy picker otwarty).
  Dwa pickery jako **panel-floating modale** (`drawStationPickerModal` + `_drawStationPicker` backdrop na PEŁNYCH
  boundach + `_handleStationPickerClick` early-route — wzór `_drawDraftModal`). Reużywa handlery `station_mgmt_*` +
  `_selectedStationId` (akcja z DOWOLNEGO ciała-członka celuje w stację grupy). **2 bugfixy live-gate:** (a) picker
  click-through — `picker_bg`/`shippicker_bg` KONSUMUJ (tylko ✕ lub klik poza pudełkiem zamyka); (b) **pinowany
  nagłówek** nazwa+✏ (`_drawStationHeaderPinned`, stały `headerTop`, rysowany PO `_pruneHitsOutside` → scroll-invariant;
  dawniej ✏ w scrollowanym body prunowany). `pruneZones` wyciągnięte do InfoPanelLayoutLogic (dowód scroll-invariance
  przez WYKONANIE — keeper T6 na PRAWDZIWEJ pruneZones).
- **C6c-3 — retirement:** pigułki stacji + `stationTab`/`stationMgmtBg` handlery + `_drawStationManagement` delegator +
  import + `_stationMode` draw-branch (→ bare block) + `_drawStationGroupState` + 3 osierocone `station.group*` i18n
  USUNIĘTE. Pełnoekranowy `drawStationManagement` (~300 lin) SKASOWANY (sub-helpery computeBalance/moduleStatus/pickery
  zostają). StationPanel „Zarządzaj" → `openPanel('colony',{infoTab:'stacja'})` przez `resolveStationTabHost`.
  `_stationMode` = wygaszone pole `false` (brak writerów; nieszkodliwe strażniki — pełne usunięcie = kosmetyczny follow-up).

**⚠ Świadome limity / follow-up:**
- **Outpost NIE hostuje zakładki Stacja** (brak `canWorkforce` → brak paska). Budowa stacji z outpostu (dawny przycisk
  bez `!isOutpost`) UTRACONA — zaakceptowana; revisit tylko gdy blokuje realną grę.
- **Map-click flow (d)** (klik ciała w grupie → „manage" → zakładka Stacja) — ODROCZONY follow-up.
- **⚠ Ship picker (`drawShipPicker`) BEZ wewnętrznego scrolla** — przy wielu projektach gracza wiersze przelewają się
  poza pudełko (`PH = min(h-40, HEADER_H+bodyH+12)`, BRAK clip/scroll) → poza-fold projekty nieosiągalne. Pre-existing
  (ten sam brak w dawnym pełnym ekranie), ujawniony realnym użyciem. Fix = własny scroll pickera (self-contained). TODO.
- Balans czasu budowy stacji (obserwacja C6c-1) + `_stationMode` field cleanup — w `KOSMOS_backlog_niezrealizowane.md`.

Pliki: NEW `src/utils/StationGroup.js`; `ColonyOverlay.js`, `StationManagementView.js` (compact+pickery,
`drawStationManagement` skasowany), `StationPanel.js`, `InfoPanelLayoutLogic.js` (`fitTabFontPx`+`pruneZones`), i18n,
smokes (`station_group` 22, `station_manage_compact` 12, `info_panel` keeper 30 z T6, `s34_faza3` przepisany na
StationSystem-intent 15). Save v99 bez migracji (pure UI + grupy liczone w runtime).

---

## End of day — 2026-07-31 — trzy fixy post-C6/C6c (save v99 bez migracji, live-gate PASS)

Trzy naprawy UI wykryte podczas live-gate'u C6c, ale NIEZWiązane z tamtym arciem — osobne root-cause'y,
osobne atomowe commity (docs close-out C6/C6c `bac0338` był już napisany, gdy te wyszły → nieudokumentowane
razem). Każdy: headless-verify + browser live-gate PASS + explicit-path staging. Wszystkie reużywają
ISTNIEJĄCYCH czystych helperów (zero nowej równoważnej matematyki).

**a. `002a1dd` — fix(ui): scrollowalny ship-build picker.** Root-cause: `drawShipPicker`
(`StationManagementView.js`) miał UNBOUNDED, nieprzewijaną pętlę wierszy — pudełko clampowane do `h−40`,
ale wiersze rysowały się POZA nim bez clip/scroll → projekty za foldem NIEOSIĄGALNE + bleed-through tła.
Pre-existing; **ujawniony (nie spowodowany) przez C6c-3** (retire pełnego ekranu → ten floating picker to
JEDYNE wejście budowy statku na stacji). Fix: NEW lokalny `drawScrollBox(ctx, view, box, contentH, drawRows)`
reużywa `clampScroll`+`scrollThumb` (+ `pruneZones` via `view.pruneHits`→ColonyOverlay `_pruneHitsOutside`):
clamp → clip pasma treści (bleed-through) → prune hit-zon poza pasmem → kciuk. Wiersze rysowane
scroll-relative (`py+HEADER_H − scroll`); hity `station_mgmt_buildship` rejestrowane na SCROLLOWANYCH
pozycjach i prunowane poza pasmem (scroll-invariant, brak ghost-clicków — ✕ close i bg-absorber rejestrowane
POZA zakresem prune → przeżywają). Stan `_stationShipPickerScroll` (ColonyOverlay) + wheel-capture w
`handleScroll` (OBA pickery pochłaniają wheel, tylko ship scrolluje; górny klamp tu, dolny w draw → snap) +
reset-on-open (`station_mgmt_addship`). **Wzorzec „internal-scroll-box"** — module picker (stała liczba
typów, nie przekracza viewportu) może dostać to samo bez przepisywania (drawRows + contentH). Smoke
`station_ship_picker_scroll_smoke.mjs` 19/19 (T3 ghost-click + T4 reuse-equality + T5 clip-bounds via WYKONANIE).

**b. `ef0bbbb` — fix(ui): chowanie globusa 3D gdy otwarty modal pełnoekranowy.**
⚠ Root-cause = DOM z-index, NIE draw-order 2D: globus panelu info to OSOBNY element `<canvas>`
(`PlanetGlobeRenderer`, **z-index 3 NAD ui-canvas=2**) na WŁASNEJ pętli RAF; `_syncGlobe` tylko go
POZYCJONUJE (`_globe._canvas.style`), NIGDY nie rysuje w 2D ctx. Backdrop pickera (rysowany w ui-canvas)
NIE MOŻE go zasłonić — inny element DOM, wyższy z-index. Fix: NEW `src/ui/ColonyModalLogic.js` z predykatem
`anyFullBoundsModalOpen(flags)` (station module+ship picker + draft modal) + metoda `_anyFullBoundsModalOpen()`;
`_syncGlobe` toggluje `_globe._canvas.style.display` CO KLATKĘ z predykatu → restore po zamknięciu KAŻDĄ
ścieżką (✕, klik-poza, zmiana zakładki/kolonii). `hide()`→`_teardownGlobe()` (usuwa canvas) → brak
„zawieszony schowany". `#planet-canvas` (z-4, legacy nigdy nie otwierany) = nie drugi sprawca.

**c. `9a57bbb` — fix(ui): reset flag modali przy zmianie kolonii przez openPanel.**
Root-cause: WIELE wejść zmiany kolonii woła `colMgr.switchActiveColony()` BEZPOŚREDNIO — **top bar
(`TopResourceDrawer`), Outliner, BottomContext, CivilizationOverlay, EventLogOverlay** — OMIJAJĄC
`ColonyOverlay._switchColony` (`:1264`, jedyny dotąd resetujący flagi pickera). `switchActiveColony` nie
emituje eventu; overlay podąża przez `openPanel`→`_showOverlay`→`show()` (bezwarunkowe, `OverlayManager:87`),
które syncuje `_selectedColonyId` ale NIE resetowało modali → flaga zostaje true → `_anyFullBoundsModalOpen()`
true → **globus schowany po zmianie kolonii** (a picker rysowałby dane STAREJ stacji). Fix:
`ColonyModalLogic.closeFullBoundsModals(overlay)` (command bliźniaczy do predykatu — JEDNO źródło „które
flagi = modal pełnoekranowy") w `show()` zaraz po sync `_selectedColonyId` → pokrywa WSZYSTKIE
`openPanel('colony')` callery w JEDNYM chokepoincie (nie per-caller whack-a-mole). Smoke: tabela prawdy
predykatu + symulacja resetu w `colony_modal_logic_smoke.mjs` 27/27.

**⚠ ZASADA (b+c):** `ColonyModalLogic.js` = single source stanu modala pełnoekranowego (query
`anyFullBoundsModalOpen` + command `closeFullBoundsModals`). NOWY modal pełnoekranowy w ColonyOverlay → dodaj
flagę w OBU funkcjach, inaczej (1) globus przebije modal, (2) modal nie domknie się przy zmianie kolonii.

**Kolejka arca (NIEROZPOCZĘTE, następne gdy PO wróci):** **C7** — wyłączenie `PopulationOverlay` (zwolnienie
slotu nawigacji + hotkey `P`); zależność: zachować ~30 współdzielonych kluczy `popPanel.*` z C5. **C8** —
ekstrakcja `ShipyardOverlay` z Command do zwolnionego slotu. Backlog polish: ship-picker `AUDIT_COLONY_OVERLAY.md`
sekcja overflow wciąż oznaczona UNFIXED (untracked, nie aktualizowana); balans czasu budowy stacji;
`_stationMode` field cleanup (`KOSMOS_backlog_niezrealizowane.md`).

---

## PopulationOverlay OFF — C7 (kill-switch `FEATURES.populationOverlay`, save v99 bez migracji, live-gate PASS, commit `270df20`)

Wyłączenie samodzielnego `PopulationOverlay` (treść już w zakładce „Populacja" ColonyOverlay — C5) +
zwolnienie slotu nawigacji i hotkeya `P`. Kill-switch `FEATURES.populationOverlay` (default **OFF**, konwencja
C1/`largestHexMaps`) — flip ON przywraca WSZYSTKO 1:1 (rejestracja + slot + P + peek). **⚠ KOREKTA po C8
(`5da2c32`): już NIE „1:1" — flip ON przywraca rejestrację + hotkey P (rollback awaryjny: P otwiera panel),
ale NIE slot/kafel/peek; Stocznia (C8) przejęła strukturalny slot, NAV_GROUPS bez populacji ⇒ zawsze 7 slotów
(patrz sekcja C8).** Pure UI, zero migracji
(v99). Zwolniony slot przeznaczony dla **C8** (ekstrakcja `ShipyardOverlay`).

**Bramkowane na fladze (nav 7→6 slotów):**
- `UIManager` rejestracja (`if FEATURES.populationOverlay`) → overlay **nie konstruowany** → listener
  `civ:populationChanged` (`_ensureHistoryListener`) nigdy się nie rejestruje (audyt §2.3). **Import ZOSTAJE**
  (bramkowana konstrukcja go używa + smoke `orbital_logistics_hub` importuje klasę wprost — 70/70).
- `OverlayManager._keyMap` — `'p'` zdjęte z literału, dodawane warunkowo PO nim. OFF ⇒ `handleKey('p')` →
  `entry undefined` → `return false` (BEZ `console.log` „not registered"). ON ⇒ przywraca `'p':'population'`.
- `CivPanelDrawer` `CIV_TABS` + `NAV_GROUPS` — **conditional-spread** (populacja tylko gdy flag ON); import
  `GAME_CONFIG` dodany. NAV_GROUPS 7→6 (populacja była indeks 3) → BottomNavBar `navSlotLayout(…, NAV_GROUPS.length)`
  = 6 slotów; ostatni slot szerszy.

**Zostawione NIETKNIĘTE (celowo — dostęp KLUCZOWANY, nieosiągalne gdy OFF, potrzebne 1:1 przy restore):**
- `NavDrawerLogic.NAV_TILE_FILES['population']` — czytane tylko `[primary]` dla primary ∈ NAV_GROUPS → martwe
  gdy OFF; skasowanie dałoby 404→emoji przy flip ON. `NavPeekProviders` `case 'population'`+`_population()` —
  `getPeekData(groupId)` woływane wyłącznie dla primary ∈ NAV_GROUPS (`BottomNavBar:88`) → nieosiągalne gdy OFF.
`PopulationOverlay.js` **NIE skasowany** (reversible-via-flag, nie via-git). Zero zmian i18n → ~30 współdzielonych
kluczy `popPanel.*` (31 żywych `t()` w `_drawPopulationTab` ColonyOverlay) ZACHOWANE (check-i18n PASS).

**Bezpieczeństwo gatingu `CIV_TABS`:** jedyny iterator CAŁEGO `CIV_TABS` renderujący klikalny nav — `drawTopNav`
— jest MARTWY (0 call-sites; `TopBar.js:18` „legacy, nieużywane"). `drawCivPanelSidebar`/`hitTestSidebar` iterują
CIV_TABS ale `CIV_SIDEBAR_W=0` (niewidoczne, hit `x∈[0,0]`). Reszta konsumentów = keyed `.find(id===primary)`.
Brak `openPanel('population')`/deep-linku (grep czysty).

**Side-effect (nav 7→6) — `fleet_clock_band_smoke` T4:** pas zegara `BottomControlBar` ZAKOTWICZONY w OSTATNIM
slocie nav (`bgLeft=lastSlotX`); 6 slotów → ostatni slot zaczyna się na x=1061.67 (nie ≥1080). Render OK (band ==
ostatni slot; T1/T2/T3 pass — brak regresji przezroczystego pasa). Sztywne 7-slotowe proxy `bg.x>=1080` ZASTĄPIONE
inwariantem slot-count-agnostic: `approx(bg.x,lastSlot.x) && approx(bg.w,lastSlot.w)`, ε=`1e-6` (szum float
`(x+w)−x` ~8e-14). Przejdzie i przy 6 (C7), i przy 7 (C8). **Wniosek dla C8:** C8 przywraca 7. slot — T4
(slot-agnostic) go obejmuje bez zmian.

**Pliki:** `GameConfig.js` (flaga), `UIManager.js` (bramka rejestracji), `CivPanelDrawer.js` (+import, CIV_TABS/
NAV_GROUPS spread), `OverlayManager.js` (+import, keymap gate), `testing/smoke/fleet_clock_band_smoke.mjs` (T4
slot-agnostic). Sweep **80/80 OK 0 FAIL** (`fleet_clock_band` 14/14, info_panel keeper 30/30, `orbital_logistics_hub`
70/70) · `check-i18n` PASS. Live-gate 1-6 PASS (slot+P gone, Populacja tab+i18n intact, brak console errors, slot
nieprzejęty; opcjonalny flip-round-trip #7 świadomie pominięty).

**NEXT — C8:** ekstrakcja `ShipyardOverlay` z Command (FleetManagerOverlay) do zwolnionego slotu (6→7) + kafel +
hotkey. Refresh audytu §3 (file:line stale). ⚠ pre-existing ship-picker overflow (`AUDIT_COLONY_OVERLAY.md` sekcja
„post-C6c") wciąż UNFIXED.

---

## ShipyardOverlay — osobny nav-slot (C8, save v99 bez migracji, live-gate 1-9 PASS, commit `5da2c32`; docs+prune osobno)

Ekstrakcja UI budowy statków z zakładki `'shipyard'` FleetManagerOverlay (Command) do samodzielnego
`ShipyardOverlay` (BaseOverlay, `src/ui/ShipyardOverlay.js`) w **nowym slocie nav 🛠 / klawisz `S`** — zajął
strukturalny slot zwolniony po Populacji w C7. Kolonia = GLOBALNA aktywna (`colMgr.activePlanetId`, bez zmian);
budowa przez `fleet:buildRequest` (→ ColonyManager) + `surgeShipBuild`/`cancelPendingShip`. Osadzony edytor
projektów = WSPÓŁDZIELONA instancja `overlays.unit_design` (ta sama co klawisz U i zakładka Jednostki) —
`_hitZones` swap + delegacja `DESIGN_EDITOR_HIT_TYPES`. Martwa ścieżka `build_ship`/`_drawShipCostTooltip`
(0 producentów) NIE portowana. Save v99 bez migracji.

**Nav (Scenario A, §3.5 audytu — koniec ryzyka 8-slotów):** `CivPanelDrawer.buildNavGroups(_features)` czysta,
**IGNORUJE flagę** — `shipyard` bezwarunkowo na pozycji po `colony`, `population` USUNIĘTE z NAV_GROUPS ⇒
`NAV_GROUPS.length === 7` NIEZALEŻNIE od `FEATURES.populationOverlay` (brak warunkowej populacji = brak stanu
8-slotów, ta sama klasa co pułapka clock-band). `export const NAV_GROUPS = buildNavGroups(GAME_CONFIG.FEATURES)`
(konsumenci bez zmian). CIV_TABS: **nowy bezwarunkowy** `shipyard` + **zachowany warunkowy** `population` (C7).
`NAV_TILE_FILES` +`shipyard` (brak PNG → emoji 🛠 fallback). OverlayManager `'s'→'shipyard'`. UIManager
rejestruje `shipyard` bezwarunkowo. i18n `civPanel.shipyard` (PL „Stocznia"/EN „Shipyard").

**Rola flagi po C8 (korekta C7):** `populationOverlay` bramkuje już tylko rejestrację `PopulationOverlay` +
hotkey `'p'` (non-layout). Flip ON = rollback awaryjny (P otwiera stary panel) — **NIE** przywraca slotu nav
(Stocznia go trzyma). Korekta wpisana w sekcji C7 wyżej.

**FMO — usunięte (funkcjonalnie):** wpis zakładki (1321), dispatch (761), gałąź scrolla (1550), warunek hovera
`|| 'shipyard'` (1760 → tylko `'ground'`), `back_to_shipyard` przekierowane na `openPanel('shipyard')` (2014).
**⚠ `_activeTab` nie może już być `'shipyard'`** — dowód: WSZYSTKIE 8 site'ów przypisania (402/519/531/571/578/2238
= `'tactical'`; 514 `opts.tab` — żaden caller nie podaje `tab:'shipyard'`, grep 0; 591 `_switchTab(tab)` — pasek
zakładek bez `'shipyard'`). `back_to_shipyard` przyciski (6814/7046 vessel/enemy detail) + disband-`hasShipyard`
(9037) ZOSTAJĄ (poprawne). `fleet.requiresOrbitalShipyard` NIETKNIĘTE (ColonyManager:858 + FleetTabPanel).

**⚠ Martwy klaster w FMO (~545 lin) — ✅ USUNIĘTY (`chore` prune `7201670`, FMO 9753→9195):** `_drawShipyardTab`/`_drawShipyard`/
`_drawShipCostTooltip`/`_drawPendingOrderTooltip` + pola `_shipyard*` + `_hoverShipId`/`_hoverPendingOrder` +
handlery hitów `build_ship`/`build_template`/`surge_ship`/`cancel_pending_ship`. Self-consistent, NIEOSIĄGALNY
(`_activeTab` nigdy `'shipyard'`). Wycinanie 450-linii w krytycznym pliku 9753-lin = mniej ryzykowne jako
IZOLOWANY commit niż wplecione w ten slice. **✅ ZROBIONE (`7201670`):** node --check OK, 0 tokenów klastra w FMO,
0 refów cross-tree, sweep 81/81, live-gate PASS; `_activeTab` nigdy `'shipyard'` udowodnione raw-grepem (8 site'ów
przypisania + 0 feederów `tab:'shipyard'` + `_switchTab` 1 prod-caller z `zone.data.tab`). (FleetTabPanel ma WŁASNY `cancel_pending_ship` handler
:578 — niezależny; usunięcie handlera FMO go nie dotyka.)

**§3.5b — C7 „left-inert" → PERMANENTNIE martwe:** `NAV_TILE_FILES['population']` + `NavPeekProviders`
`case 'population'`/`_population()` + `population_symbol.png` straciły uzasadnienie „needed on restore" (restore
= rejestracja+hotkey, bez slotu) → z warunkowo-martwych stają się TRWALE martwe. Nie ruszane w C8; kandydat do
tego samego `chore` prune. (Patrz `AUDIT_COLONY_OVERLAY.md` §3.5/§3.5b — pełny audyt refresh.)

**Deliberately accepted gap (jak C7 #7):** live-gate #10 (flip `populationOverlay` ON w przeglądarce — layout
BottomNavBar / hotkey P / lookup ikon pod flagą ON) **NIE zweryfikowany w browserze** — świadomie pominięty.
Poziom funkcji: keeper dowodzi `NAV_GROUPS.length===7` przy fladze ON (`buildNavGroups`), ale render na żywo pod
flagą ON zostaje niezweryfikowany. NIE traktować jako w pełni zweryfikowane.

**Pliki:** NEW `ShipyardOverlay.js` + `shipyard_nav_slot_smoke.mjs`; edycje `FleetManagerOverlay`, `CivPanelDrawer`
(`buildNavGroups`+CIV_TABS), `NavDrawerLogic`, `OverlayManager`, `UIManager`, i18n pl/en. Testy: keeper **11/11**
(oba stany flagi = 7), `fleet_clock_band` 14/14 (7 slotów), sweep **81/81 OK 0 FAIL**, `check-i18n` PASS. Live-gate
1-9 PASS (slot 🛠, S/klik otwiera, budowa/surge/cancel, edytor osadzony, Command bez zakładki, „← Stocznia" →
overlay, C7 intact, brak console errors).

**C8 ARC ZAMKNIĘTY** (`5da2c32` code · `17f3e84` docs · `7201670` prune). **NEXT (drobne, niepilne):**
§3.5b trwale martwe wpisy populacji (`NAV_TILE_FILES['population']` + `NavPeekProviders` `case 'population'`/
`_population()` + `population_symbol.png`) + opcjonalnie `shipyard_symbol.png`.

---

<!-- CLAUDE.md L2665–2775 -->
## Findingi 86 + 87 (+190) — tożsamość zdarzenia, martwa gałąź i pętla pauzy (save **v101 bez migracji**, live-gate 86/87 PASS · 190 re-gate PASS)

Druga runda „szybkiej serii" przeglądu rejestru. Rejestr macierzysty obu:
`docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md`. ⚠ **Weryfikacja przed audytem (reguła z W3-32)
zwróciła nierówny wynik: 86 potwierdzone, 87 OBALONE co do mechanizmu.**

**86 — `civ:unrest` / `civ:unrestLifted` bez terminu tożsamości.** `BuildingSystem:124/128`
nasłuchiwał przez `() =>`, czyli wyrzucał `planetId`, który producent rzetelnie wysyła
(`CivilizationSystem:1125`/`:1111`); jedyna bramka (`window.KOSMOS?.buildingSystem !== this`) pyta
o **aktywność**, nie o to, czyje jest zdarzenie. Linia **nietknięta od pierwszego commitu repo**
(`9951d5e`). Skutek: niepokój dowolnej koloni (w tym AI) zabierał aktywnej koloni gracza −30 %
produkcji, a `unrestLifted` z cudzej koloni **kasował karę uzasadnioną** (groźniejsza połowa).

⚠ **TERMIN TOŻSAMOŚCI, NIE WŁASNOŚCI — i to jest cała subtelność.**
`colony_ownership_guard_smoke` **G12** pinuje wprost, że te bramki nie mają dostać terminu
własności („raportują FAKTY o ZWIĄZANEJ koloni"), z ostrzeżeniem „jeśli kiedyś padnie, ktoś
poprawił przy okazji". G12 ma rację — ale testuje przypadek **tej samej** koloni, a 86 to
przypadek **międzykoloniowy**. Pytanie „czy to zdarzenie jest o MOJEJ koloni" **przywraca
przesłankę G12**, której dotąd nic nie sprawdzało. **G12 zostało zielone bez dotknięcia.**
⚠ Wariant tańszy (porównanie z `colonyManager.activePlanetId`) **wykluczony pomiarem**: G12 ręcznie
ustawia aktywny `buildingSystem` na kolonię AI, zostawiając `activePlanetId` na domu, a fixture'u
**nie da się** „naprawić", bo po arcu D1 `switchActiveColony` odmawia koloni AI.
⚠ Tożsamość okazała się **już zamontowana**: `BuildingSystem._planetId` (`:222`) ustawiają
**wszystkie cztery** ścieżki `ColonyManager` (`:493`/`:565`/`:643`/`:2500`) — zapowiadana cena
„5 miejsc produkcyjnych" nie została zapłacona. `_isOwnColonyEvent` jest **fail-open po OBU
stronach** (ok. 40 konstrukcji testowych nigdy nie woła `setPlanetId`; zdarzenia bez `planetId`
nie wolno po cichu odrzucić). Bliźniak `civ:popBorn` (`:134`) **świadomie nietknięty**: przelicza
stawki, więc cudze zdarzenie kosztuje zbędne wywołanie, a nie BŁĘDNY STAN.

**87 — ⚠ REJESTR OPISYWAŁ MECHANIZM, KTÓREGO NIE MA.** ZMIERZONE WYKONANIEM: `ColonyManager`
**nie ma akcesora `colonies`** (publiczne są `getColony`/`getAllColonies`/`getPlayerColonies`),
a `git log -S` na `get colonies` i `this.colonies =` zwraca **pustkę** — to nie zgnilizna po
zmianie nazwy, tylko błąd od chwili napisania (`56a8069`). Strażnik `if (colMgr?.colonies)` czynił
gałąź **martwą**, wyglądając przy tym na obronny. ⇒ **skutek ODWROTNY do zapisanego**: nie fałszywy
alarm o cudzej koloni, tylko **brak alarmu o własnej** (do zbioru trafiał wyłącznie `homePlanet.id`).
**Trzy kopie**, nie jedna: `CollisionForecast:243` (kolizja grożąca koloni innej niż macierzysta nie
pauzowała gry) · `ObservatoryOverlay:423` (zakładka Zagrożenia nie oznaczała kolonii gracza) ·
`:783` (plakietka „🏠 kolonia na tym ciele" **nie renderowała się nigdy, dla żadnej koloni** — ten
site nie miał nawet fallbacku na dom).

⚠ **A TREŚĆ WPISU OKAZAŁA SIĘ OPISEM PUŁAPKI W NAPRAWIE:** gałąź „naprawiona" przez
`getAllColonies()` wpuściłaby kolonie AI i realnie wyprodukowała defekt, który rejestr opisywał
jako istniejący. Kanonem jest **`getPlayerColonies()`** — NEW `ColonyOwnership.playerBodyIds()`,
wpięty w trzy site'y naraz. Ładunek przemianowany `isHomePlanet` → `isPlayerColony` (flaga ZAWSZE
znaczyła „dowolna kolonia gracza" — mówił to wprost komentarz `GameScene:2637`), klucz
`log.collisionForecastHome` → `log.collisionForecastColony` PL+EN (EN mówił „COLLISION WITH HOME
PLANET" dla dowolnej koloni). Seed `window.KOSMOS.homePlanet.id` **usunięty**: redundantny (dom
siedzi w `_colonies`, `:524`) i niósł klasę Findingu 97 (wskaźnik nieprzecelowywany po utracie stolicy).

⚠ **Wypłynął przy tym Finding 189 (otwarty, NIE naprawiony):** `CivilizationSystem._updateUnrest:1104`
czyta `window.KOSMOS?.prosperitySystem?.prosperity` — prosperity **AKTYWNEJ** koloni — dla
**każdej** koloni, choć każda ma własny `ProsperitySystem`. Kolonie AI wpadają więc w niepokój, gdy
kryzys ma gracz. Naprawa wygląda na jedną linię, ale `CivilizationSystem` **nie trzyma referencji**
do swojego `ProsperitySystem` (zależność idzie w drugą stronę), a zmiana czyni niepokój zjawiskiem
**lokalnym zamiast globalnego** — czyli to **balans z własnym pomiarem**, nie higiena.

⚠ **LIVE-GATE 86/87 PASS, ale ujawnił trzy dalsze findingi — i jeden musiał wejść NATYCHMIAST.**

**190 (pętla pauzy, ZAMKNIĘTY tu) — domknięty dopiero za DRUGIM podejściem.** `_finalizeSimulation`
emitowało alert kolizyjny **bezwarunkowo** przy każdym przeliczeniu („nowy lub ZAKTUALIZOWANY”),
a konsument na każdym emicie robił `timeSystem.pause()`; przeliczenie wraca co 10/8/5/3/2/1 civYears
wg poziomu obserwatorium, czyli przy Lv6 **co jeden wyświetlany miesiąc**. Defekt PRE-EXISTING, ale
dopóki zbiór zawierał tylko `homePlanet.id`, wymagał kolizji ze stolicą — naprawa 87 uczyniła go
powszechnym ⇒ wchodzi w TEN SAM commit, inaczej 87 dowoziłby **regresję rozgrywki razem z funkcją**
(układ z W3-5b).

⚠ **PIERWSZA POPRAWKA (`if (existingId) continue;`) NIE WYSTARCZYŁA, a moja diagnoza była BŁĘDNA.**
Live-gate #2: pauzy trwają, jedno zagrożenie „pojawia się i znika naprzemiennie”. Postawiona wtedy
hipoteza **„loteria próbkowania”** (okno detekcji 7× węższe niż `SIM_STEP`) została **OBALONA
POMIAREM**: powtarzalność wykrycia jest **PŁASKA — 100 % w 40 przeliczeniach** dla par o horyzoncie
23, 155, 434, 452, 465, 585 i 601 lat, bo `updateMeanAnomaly` to **analityczna propagacja Keplera**,
bez błędu narastającego z liczbą kroków (wskaźnik 7× liczył prędkość ORBITALNĄ, a liczy się WZGLĘDNA
prędkość pary na kursie kolizyjnym).
**Prawdziwa przyczyna: ZAKRES CZYSZCZENIA.** `oldAlertIds = new Set(this._alerts.keys())` brało
**wszystkie** alerty, a skan jest kluczowany na `activeSystemId` (**191**) ⇒ każde spojrzenie na inny
układ kasowało alerty poprzedniego, a powrót tworzył je od nowa z **nowym id**, więc dedup nie miał
czego rozpoznać. ZMIERZONE: trzy skany pod rząd w jednym układzie = **0 skasowanych, 0 powtórnych
emisji**; jedno przełączenie tam i z powrotem = **+15 skasowanych i +15 alarmów**.
⇒ Zamknięcie ma trzy części: **(a)** dedup zostaje; **(b)** czyszczenie zawężone do przeskanowanego
układu (`alert.systemId` + backfill w `restore`, **v101 bez migracji**); **(c)** ZMIANA PROJEKTU
(decyzja właściciela): **twarda pauza usunięta**, meldunek idzie przez `NotificationCenter` (dzwonek
+ Dziennik, bez pauzy) — tam, gdzie od dawna są SIOSTRZANE zdarzenia obserwatorium
(`observatory:discovered`, `observatory:vesselScanComplete`) — a jedyną reakcją czasową jest
**auto-slow poniżej `COLLISION_AUTOSLOW_YEARS = 50`**.
⚠ **Próg nie jest nową magiczną liczbą ani nie opiera się na wiarygodności detekcji** (ta jest
płaska): to `HORIZON_BY_LEVEL[1]` — zasięg najprostszego obserwatorium; druga, niezależna derywacja
daje tę samą liczbę (przy 50 latach `MARGIN_PERCENT` schodzi do ±5 lat). Budżet przerwań ZMIERZONY:
**~7 %** zagrożeń (rozkład: 0-25 lat 7 %, 50-100 7 %, 100-200 20 %, 200-350 20 %, **350+ 47 %**).
✅ **RE-GATE PASS** (na żywo): meldunek raz bez pauzy; **przełączenie układu i powrót nie tworzy nowego alarmu**. ⚠ **Granica dowodu:** auto-slow <50 lat **nie sprowokowany w przeglądarce** (trudno wywołać takie zagrożenie na żądanie) — pinuje go wyłącznie keeper T9, derywacją z `HORIZON_BY_LEVEL[1]`; świadomie przyjęta luka. ⚠ **191 POTWIERDZONY NA ŻYWO** przy tej samej sesji: jedno obserwatorium, alerty z **dwóch** układów.

**191 (zasięg obserwatorium, OTWARTY):** hipotezę postawił właściciel („obserwatorium działa, jakby
wykrywało zagrożenia we wszystkich systemach”); pomiar **potwierdził rodzinę, ale skorygował
kształt** — to nie skan całej galaktyki, tylko **klucz na KAMERZE** (`_startSimulation:94` czyta
`activeSystemId`) **plus globalne włączenie** (`getMaxObservatoryLevel:117-131` iteruje wszystkie
kolonie gracza bez terminu układu). Obserwatorium z układu A daje prognozę w układzie B, gdy tam
patrzysz. ⚠ **SPROSTOWANIE: 191 był WARUNKIEM KONIECZNYM 190** (ta sama relacja co `130 + Z2`) —
pierwotny zapis „NIE łączyć” był błędny. Zawężenie czyszczenia domyka 190, ale **nie przesądza**
pytania z 191, czy obserwatorium ma w ogóle widzieć obce układy — i to pytanie jest projektowe.

**192 (OTWARTY):** prognoza propaguje **stałe elementy orbitalne** do 700 lat, a w „Cywilizacji”
perturbacje **działają**; `MARGIN_PERCENT = 10` jest sztywne niezależnie od horyzontu, a **47 %
zagrożeń leży 350+ lat w przyszłość**. Wpis powstał **zamiast** obalonej hipotezy o niepowtarzalności
detekcji: detekcja jest stabilna, ale **model może nie opisywać świata** tak daleko.


Keepery: NEW `unrest_event_identity_smoke` **7/7** (fail-first **5/2**; T7 pinuje MONTAŻ tożsamości
wykonaniem — bez niego bramka byłaby w grze martwa) · NEW `observatory_player_colonies_smoke`
**28/28** (fail-first **2/12**; T7 dedup, T8 zakres czyszczenia — fail-first **3 SEDNO**, T9 zmiana projektu). ⚠ Pierwszy przebieg dał **3/11**, bo pin „kolonia AI nie wchodzi do
zbioru" przechodził **jałowo na pustym zbiorze** — wymóg `ids.size === 2` jest częścią pinu.
Sweep **189/189 0 FAIL** · `check-i18n` PASS · zero migracji.

<!-- CLAUDE.md L3578–3633 -->
## DZIENNIK ZDARZEŃ — języki, surowe kody, poprawność (save **v101 bez migracji**, ARC ZAMKNIĘTY 2026-08-27)

Audyt na zgłoszenie właściciela („*w Dzienniku pojawiają się informacje w dwóch językach…
czasami `sys_home` albo `sys_xxx` zamiast nazwy… wiele kwestii w formie kodu*"). Raport
z pomiarami: `docs/audit/EVENT_LOG_AUDIT.md`; rejestr **Findingów 165-176**:
`docs/design/VESSEL_ORDERS_PLAN.md` §Findings z audytu Dziennika. Commity: `0aacf8c` ·
`1483a25` · `ffc72fb` · `8fe43eb`. Keeper: `event_log_entry_smoke` **34**.

**Jedno zdanie:** oba objawy były realne, ale miały **cztery różne przyczyny źródłowe** —
i żadna nie leżała w słownikach, które okazały się zdrowe (`pl=en`, 0 luk, 0 niezgodnych
placeholderów).

⚠ **NAJWAŻNIEJSZA LEKCJA — „gram w jednym języku" NIE znaczy „bez mieszania".** Właściciel gra
z **angielskim Dziennikiem**, a z 29 literałów omijających `t()` **26 było POLSKICH** ⇒ widział
je po polsku **bez żadnego przełączania języka**. Odwrotny kierunek też istniał (`Fleet order
rejected`, `[unknown]`, `waypoint`, `vessel` w słowniku PL). ⇒ **zanim zejdziesz z zakresu i18n
„bo gracz i tak gra w jednym języku", ZMIERZ, w którą stronę cieknie.**

**Cztery przyczyny (rozłączne, każda z osobną naprawą):**
1. **Tekst renderowany PRZY EMISJI i persystowany** (200 wpisów w save) ⇒ po zmianie języka
   Dziennik jest dwujęzyczny z konstrukcji. **Finding 165 — ZAPARKOWANY** (jedyna pozycja
   z bumpem save'a; dotyczy tylko gracza, który przełącza język).
2. **29 literałów omijających `t()`** w 5 plikach ⇒ ✅ zamknięte (56 nowych par kluczy).
3. **Surowe id/slugi**, mimo że rezolwery ISTNIAŁY w repo: `systemDisplayName` był
   **zaimportowany w tym samym pliku** i pomijany (167); `ORDER_ACTIVITY_KEYS`/
   `MISSION_ACTIVITY_KEYS` (kompletne, PL+EN) były **prywatne** w `FleetPictureLogic` (175);
   `resource.*` istniały od Etapu 6.1, a raporty pokazywały `minerals:12` ⇒ ✅ zamknięte.
4. **Niekompletne `TYPE_MAP`/`CHANNELS`** — `poi_alert`/`poi_rally` bez wpisu ⇒ alarm pikiety
   lądował w kanale System; brak kanału `diplomacy` w ogóle ⇒ ✅ zamknięte (D2: kanał +
   **trzy szczeble severity**, bo jeden typ nie umiał odróżnić sojuszu od wypowiedzenia wojny).

**Poprawki niejęzykowe przy okazji:** rok wpisu `---` po wczytaniu (168 — `restore` nie zasiewał
`_currentYear`, a `time:display` nie leci na pauzie) · martwy klik na wpisie bitwy (172 —
`entityRef` to id UKŁADU, a **układy nie są encjami**) · ring buffer wymiatany przez log walki
naziemnej per runda (173 — ~26 starć kasowało całą historię).

⚠ **MARTWY KĄT `check-i18n` (ta sama klasa co Finding 113).** Bramka pyta „*czy klucz użyty
w `t()` istnieje w pl i en*", a **nie** „*czy każdy widoczny napis przechodzi przez `t()`*" ⇒
świeciła na zielono przy 29 literałach. **Nowy literał w `push({text})` wejdzie przy zielonej
bramce.** Poprawka samego narzędzia (wykrywanie literałów w `push`/`fillText` poza `t()`) —
**otwarta**, i to ona jest realnym zabezpieczeniem przed nawrotem.

⚠ **`CHANNELS` trzyma `labelPL`/`labelEN` jako DANE** (jak reszta encji w repo) — etykiety
kanałów świadomie NIE idą przez słownik; wybór języka należy tam do widoku (`getLocale`).
Nowy kanał ⇒ dopisz OBIE etykiety.

⚠ **Stare wpisy z zapisu nie są migrowane** — dyplomacja sprzed D2 zostaje na `channel:'system'`,
a wszystkie zapisane teksty zostają w języku z chwili zapisu, aż wypadną z ring buffera.

**Świadomie POZA zakresem:** Finding 165 · gałąź macierzysta w `GameScene:2388` (nazwa PLANETY
w miejscu nazwy UKŁADU) · poprawka `check-i18n` · czy walka naziemna AI-vs-AI może zasilać
Dziennik gracza (niezmierzone). ⚠ **Live-gate NIEWYKONANY dla żadnego z czterech commitów** —
na wyraźne polecenie właściciela.

---


## ARC KONSOLE — K0a: zestaw konsoli + żywa, przyciemniona scena za zakładkami (`8a820d2`, bramka właściciela PASS 2026-11-16)

Plan i rejestr: `docs/design/CONSOLES_PLAN.md` (§6.2 D-K-5 poprawione na bramce, §8 K0a). Flaga `FEATURES.consoleKit` (ON).
`ConsoleLayoutLogic` (strefy 4/3, rezerwa zegara — #727, gniazdo paska walki — D-K-17, `uiViewport`), `ConsoleKit` (rysowanie
wyłącznie na rolach HudPalette; nawiasy narożne tylko na bohaterze i zaznaczeniu), `ConsoleSceneLogic` (jeden predykat dla UI
i renderera; tryby live / glass / opaque). D-K-5 po bramce: świat za konsolą żywy, ostry, przyciemniony (`brightness(0.4)`,
bez rozmycia i zasłony, ≈ 5,5 ms/klatkę przyjęte); glass i opaque — tryby debug, kandydaci na ustawienie wydajności dla słabszych
GPU. Pomiar: scena pod zakładką 5,7–5,8 ms (live), 0 w glass/opaque; filtr ≈ +0,4 ms GPU w najgorszym przypadku. Keepery
`console_layout` 33/0, `console_scene` 46/0, `console_kit` 25/0; sweep 409/409, `check-i18n` PASS. Następny krok: K0b (Wywiad).

---

## ARC KONSOLE — K0b: Wywiad na szablonie konsoli (`c36ac18` + `b4b71a4`, bramka właściciela PASS 2026-11-16)

Plan i rejestr: `docs/design/CONSOLES_PLAN.md` §9. Flaga `FEATURES.consoleIntel` (ON, tylko razem z `consoleKit`). Pierwszy prawdziwy
ekran zestawu: nagłówek z czipami grupy zamiast pasa subnav (`isKitScreen`), wspólna lista imperiów (`EmpireListLogic` +
`ConsoleEmpireList` — Dyplomacja w K2), bohater = dossier + układ sił TY | ONI + mini-mapa znanych układów pod mgłą, inspektor AKTA;
pasek walki w gnieździe nagłówka tylko na ekranach zestawu (D-K-17, gniazdo 520 px); czytelność C+A (rola dim konsoli `DIM_LIFT`,
poświata `HALO_BLUR`). Finding 725 (część Wywiadu) ✅; NOWE ⚪ 736 (2–3 bitwy wychodzą z gniazda nagłówka). Keeper
`console_intel_smoke` 39/0 (fail-first: 30 czerwonych, 9 kontroli); sweep 410/410, `check-i18n` PASS. Następny krok: K1a.

---

## ARC KONSOLE — K1a: hologram statku `ShipHologramRenderer` (`3f41ba3`, OK właściciela 2026-11-16 po jednej rundzie)

Plan i rejestr: `docs/design/CONSOLES_PLAN.md` §10. Flaga `FEATURES.shipHologram` (ON). Własny offscreen WebGLRenderer (leniwy, zwalniany)
→ `drawImage` w prostokąt gospodarza; render tylko przy zmianie / animacji (bezczynność i ukrycie = 0 renderów). Modele wg reguły
`VesselModelResolver` (D-K-10, rola cywilna i oś warp z modułów), szablony z pamięci ThreeRenderera, scena główna nietknięta (klony,
geometria tylko do odczytu). Wygląd: obwódka fresnela + linie skanowania + krawędzie w roli `primary`, przebieg głębi; widok 3/4 z obrotem
i plan = rysunek techniczny (bok + góra). Sylwetka Canvas 2D (wypełnienie rzutu + kontur + krawędzie) przy braku / utracie kontekstu,
przekroczonym budżecie albo wymuszeniu. Runda 1: widok z góry — przyczyna: krawędzie załamań nie obrysowują gładkich burt (nie oś, nie
wyspy), plus kadr ze stałych pasów; domyślne właściciela `edgeAngle` 30°, `xray` 0. Pomiar: hologram 0,12–0,20 ms GPU, kompozycja w szumie,
obrót kosztuje głównie przerysowanie całego UI (→ K1c: osobna warstwa płótna pod UI, przeciąganie myszą, opcjonalne lokalne przyciemnienie).
Podgląd `KOSMOS.debug.holo.*`. Keeper `ship_hologram_smoke` 58/0 (fail-first: 28 czerwonych, 2 kontrole; 4 mutacje czerwone); sweep 411/411,
`check-i18n` PASS. Następny krok: K1b (kotwice).

---

## ARC KONSOLE — K1b: kotwice modułów (`574ee3f`, PASS właściciela 2026-11-16 po trzech rundach)

Plan i rejestr: `docs/design/CONSOLES_PLAN.md` §11. Bez flagi (gracz bez zmian; podgląd w podglądzie debug K1a).
- **Pliki i schemat:** `assets/models/ships/anchors/<slot>.json`, ≤ 6 ról (napęd, uzbrojenie, obrona, ładownia, misja, habitat),
  ścisły walidator `ShipAnchorsSchema.js`. Hardpointy i ich schemat nietknięte. Plik niesie tylko role postawione przez właściciela.
- **Loader:** `ShipAnchors.js`, `anchorsFor` = plik nad domyślnymi, nigdy nie rzuca. Domyślne są deterministyczne:
  - napęd = środek dyszy;
  - uzbrojenie = środek wieżyczek W1…Wn (gdy są), inaczej reguła bbox;
  - reszta z bbox po stronie widocznej z kamery 3/4;
  - wszystko poza napędem przyciągnięte do najbliższego punktu kadłuba — ta sama siatka w grze i w Workshopie.
- **Moduł → rola:** wszystkie 35 modułów.
- **Model Workshop, tryb 6 „Kotwice modułów”:** wybór roli, blade kółka = domyślne, klik stawia, przeciąganie przesuwa, R przywraca,
  wspólne cofanie, zapis do `anchors/` przez File System Access.
- **Podgląd:** `KOSMOS.debug.holo.anchors()` / `anchorsInfo()` — znacznik + odnośnik + etykieta roli WIELKIMI literami (rola
  `primary`; domyślne przygaszone i przerywane), rzut w pozie ostatniej klatki (obrót, plan, sylwetka).
- **Przejście właściciela w Workshopie:** wieżyczki na pięciu okrętach (2 / 5 / 5 / 14 / 22), habitat na pięciu kolonijnych
  (warp_large_colony zostaje przy domyślnych).
- **Finding 737 ✅:** pin N11f keepera normalizatora dzielił sloty po dopisku Workshopu, więc zapis samych wieżyczek opróżnił świadka
  równości dysz. Teraz klasyfikacja po dyszy.
- **Testy:** keeper `ship_anchors_smoke` 93/0 (A10 na prawdziwych siatkach 24 GLB: kadłub ≤ 10⁻³, najgorzej 7·10⁻⁵); fail-first
  12 czerwonych / 3 zielone; 11/11 mutacji czerwonych; keepery `cv_*` zielone na plikach właściciela; sweep 412/412, `check-i18n` PASS.

Następny krok: K1c (Stocznia na szablonie konsoli: warstwa hologramu, etykiety kotwic z listą modułów).

---

## ARC KONSOLE — K1c-A: Stocznia na szablonie konsoli (`301b66b`, PASS właściciela 2026-11-16)

Plan i rejestr: `docs/design/CONSOLES_PLAN.md` §12. Flaga `FEATURES.consoleShipyard` (domyślnie ON; OFF = dzisiejsza Stocznia).
- **Nagłówek:** STOCZNIA · kolonia · stocznia naziemna · [ x ]; bramki S0/S1 jako linia banera; pasek walki w gnieździe nagłówka.
- **Lista:** zapisane projekty (kadłub, moduły, staty, stan budowy z powodem, [ EDYTUJ ] [ USUŃ ]) i kadłuby («1P+2U», masa, 🔒, 🛰).
- **Bohater:** hologram projektu (model cywilny zmienia się na żywo), etykieta na rolę z listą modułów na kotwicach K1b, [ 3D ] / [ PLAN ].
- **Inspektor:** sloty + picker (726: etykiety i ikony tarcz i desantu), instrumenty + wiersze, delta przy najechaniu modułu,
  [ BUDUJ ] [ ZAPISZ ] [ WYCZYŚĆ ] z dzisiejszymi regułami i powodami.
- **Pas:** budowy + Surge, oczekujące + anulowanie, rezerwa + Rozmieść — nic nie zginęło.
- **Findingi:** 723 ✅; 726 naprawiony w pickerze konsoli (ekran U w K1c-B). Ekran U (`UnitDesignOverlay`) nietknięty.
- **Testy:** keeper `console_shipyard_smoke` 71/0; fail-first 46 czerwonych / 25 zielonych; 6/6 mutacji czerwonych; sweep 413/413,
  `check-i18n` PASS.
- **Odstępstwa:** 3–5 zatwierdzone; 1–2 (budowa dwoma kliknięciami, wiersz = [ EDYTUJ ]) rozwiązuje K1c-B czipem [ BUDUJ ] w wierszu.

Następny krok: K1c-B (osobna warstwa hologramu, obrót i przeciąganie, czip [ BUDUJ ], U → projektant Stoczni, strojenie).

---

## ARC KONSOLE — K1c-B: szlif konsoli Stoczni (`eb59908`, PASS właściciela 2026-11-16) — konsola Stoczni GOTOWA

Plan i rejestr: `docs/design/CONSOLES_PLAN.md` §13. Flaga `FEATURES.consoleShipyard`.
- **Hologram:** osobna kanwa `#holo-canvas` pod `#ui-canvas` (UI czyści prostokąt bohatera); przeciąganie i przenikanie malują tylko
  warstwę — 0 przerysowań UI na 2 s przeciągania (kontrola bez warstwy: 58).
- **Bez auto-obrotu:** statyczne 3/4, obrót i lekkie pochylenie myszą, poza zostaje przy podmianie modelu, dwuklik = 3/4. Model ~75 %
  szerokości bohatera, wyśrodkowany. Lokalne przyciemnienie (`KOSMOS.debug.holo.tune.heroDim`, 0,45).
- **Etykiety ról** poza obrysem kadłuba (kolumny po stronach ekranu, obok albo nad / pod obrysem), bez nakładania, z poświatą.
- **Staty:** 14 stałych wierszy, stała kolumna delty (pary w podkolumnach), cyfry tabelaryczne — najechanie zmienia tylko teksty.
- **Listy:** wybór = same nawiasy (projekty i kadłuby); czip [ BUDUJ ] w wierszu (dzisiejsza reguła, powód w podpowiedzi);
  [ USUŃ ] → [ POTWIERDŹ ] przez 3 s.
- **U → Stocznia** (D-K-12); projektant naziemny w Dowództwie i w szkicu Kolonii. **726** naprawiony też w pickerze ekranu U.
- **Wybór stoczni** (uwaga C): tylko zapisany w planie (§14) — osobny audyt po zamknięciu arcu.
- **Testy:** `console_shipyard_b_smoke` 76/0; fail-first 39 czerwonych / 8 zielonych; 11/11 mutacji czerwonych; keeper K1c-A
  zaktualizowany 71/0; sweep 414/414, `check-i18n` PASS.

Następny krok: K2 (Dyplomacja + Wojna; 724, 727, 735).

---

## ARC KONSOLE — K2: Dyplomacja + Wojny na szablonie konsoli (`1685293` + `1f6c960`, PASS właściciela 2026-11-16) — grupa Dyplomacji GOTOWA

Plan i rejestr: `docs/design/CONSOLES_PLAN.md` §15. Flaga `FEATURES.consoleDiplomacy` (oba ekrany; OFF = dziś, z przyciskami debug do KZ).
- **Grupa:** czipy [ DYPLOMACJA ] [ WYWIAD ] [ WOJNY ] w nagłówku, bez pasa subnav; pasek walki w gnieździe nagłówka.
- **Dyplomacja:** wspólna lista imperiów K0b (status · napięcie w wierszu), bohater z opinią i napięciem jako instrumentami, statusem,
  postawą AI (etykieta) i mini-mapą K0b-1 (wydzielona do `ConsoleEmpireMap`); inspektor: rozbicie, traktaty, pamięć, sześć czipów akcji
  z dzisiejszymi regułami i powodem w podpowiedzi; pas: ultimatum / komunikat.
- **Wojny:** lista wojen (wyczerpanie, lata wojny), bohater = lina wyczerpania z mini-mapą znanych układów przeciwnika albo stół pokoju
  przy negocjacjach; inspektor: casus belli, bitwy, [ ZAPROPONUJ POKÓJ ]. Po bramce: tytuł = sama nazwa (2 linie), mapa w trybie liny.
- **Findingi:** 724 ✅, 725 (Wojny) ✅, 727 ✅, 735 ✅ — dźwignie tylko jako `KOSMOS.debug.war.forceBattle()` / `forceInvasion()` / `target()`.
- **Testy:** `console_diplomacy_smoke` 50/0; fail-first 33 czerwone / 14 zielonych; mutacje 6/6; sweep 415/415, `check-i18n` PASS.

Następny krok: K3 (rodzina Ekonomii).

---

## ARC KONSOLE — K3: rodzina Ekonomii na szablonie konsoli (`79c8ba3` + `a75a402` + `bd72f73`, PASS właściciela 2026-11-17) — Ekonomia GOTOWA poza Produkcją

Plan i rejestr: `docs/design/CONSOLES_PLAN.md` §16. Flaga `FEATURES.consoleEconomy` (Budżet, Przepływy, Handel; OFF = dziś bit w bit).
- **Rama:** czipy [ BUDŻET ] [ PRODUKCJA ] [ HANDEL ] [ RYNEK ] [ PRZEPŁYWY ], bez pasa subnav; lewa kolumna magazynu zdjęta (D-K-16:
  szuflada albo blok magazynu na Przepływach); Produkcja zostaje dzisiejsza do K4. Martwe tryby fabryk usunięte (−771 linii).
- **Budżet:** linie, netto i skarbiec, przychody / wydatki, suwak podatku; pas = surowce, deficyt budżetu pierwszy.
- **Przepływy:** lista zgodna z bohaterem (738), diagram w tercjach, przyciemnienie K1c-B pod liczbą.
- **Handel:** wiersz „Wszystkie połączenia”, wybrane połączenie steruje bohaterem, inspektorem i pasem; wydatki z powodem.
- **Rynek:** tablica kolonia · imperium, objaśnienie zlecenia (odbiorca, płatność, dostawa warpem), KUP / SPRZEDAJ wyłączone z powodem.
- **Runda 2:** lokalna kolonia Handlu („Twoja kolonia ▾”), globalna aktywna nietknięta; `KOSMOS.debug.trade.ctx()`.
- **Findingi:** 725 (Budżet + Handel) ✅, 738 ✅, 739 ⚪, 740 ⚪ (placówka przejmuje aktywną kolonię), 741 ⚪ (AI z 0 Kr — martwa sprzedaż).
- **Testy:** `console_economy_smoke` 89/0, `console_trade_smoke` 98/0; mutacje 8/8 + 15/15 + 10/10; sweep 417/417, `check-i18n` PASS.
- **Decyzja właściciela:** K6 (Kolonie) wychodzi z arcu do osobnego arcu „ekran planety/ciała”; zakładka Kolonie zostaje jak dziś.

Następny krok: K4 (Produkcja).

---

## ARC KONSOLE — K4: Produkcja na szablonie konsoli (`886b659`, PASS właściciela 2026-11-17) — Ekonomia GOTOWA

Plan i rejestr: `docs/design/CONSOLES_PLAN.md` §17. Flaga `FEATURES.consoleEconomy` (pięć czipów grupy na zestawie; OFF = dziś bit w bit).
- **Lista:** towary pod «Zakres: X ▾» (pełna lista encji — 732), kolumna «zapas / min», steppery minimalnego zapasu na wierszu pod
  kursorem i zaznaczonym (także zablokowane — próg przed odkryciem), znacznik «▸ buduj» przy droidzie.
- **Bohater w trzech pasmach:** «Produkcja teraz» (pasek w czasie gry, «+1», linia stojąca nigdy nie wygląda na pracującą) · łańcuch
  receptury · wąskie gardło + kolejka i zlecenia.
- **Inspektor:** instrument «zapas / minimum», blok budowy droida (nowy powód «brak źródła składników»), alerty kolonii zakresu,
  zlecenie jednorazowe przez pole, zapotrzebowanie, przełącznik fabryk, blok magazynu D-K-16.
- **Pas:** zlecenia eksportowe (742 — adresowane do kolonii zakresu) + jeden wykres 10 lat.
- **Findingi:** 725 ✅ (cały), 732 ✅, 742 ✅ (nowy: przełączniki eksportu zmieniały aktywną kolonię).
- **Testy:** `console_production_smoke` 101/0, mutacje 32/32; sweep 418/418, `check-i18n` PASS; żywy silnik 0 błędów strony; animacja bez
  własnych klatek, rysowanie ≈ 1,8 ms.

Następny krok: KZ grupy Ekonomii.

---

## ARC KONSOLE — KZ-E: Ekonomia na stałe konsolą (`f47b0b8`, smoke właściciela PASS 2026-11-17)

Plan i rejestr: `docs/design/CONSOLES_PLAN.md` §18. Decyzja właściciela 2026-11-17: KZ dla grupy Ekonomii teraz, reszta KZ na końcu arcu.
- **Flaga `FEATURES.consoleEconomy` usunięta:** Budżet, Przepływy, Handel + Rynek i Produkcja są w `PERMANENT_KIT_SCREENS` — zawsze konsola,
  także przy `consoleKit` OFF (zatwierdzone; tam `consoleKit` steruje tylko przyciemnieniem sceny do końcowego KZ).
- **Usunięte ścieżki OFF:** `EconomyOverlay` 2827 → 897 linii, `TradeOverlay` 1278 → 432, 80 kluczy i18n; kod produktu +100 / −3040.
- **Zachowanie i wygląd bez zmian:** strefy, handlery, akcje = dawna ścieżka ON; dziennik rysunku 20/20 identyczny z `762726c`.
- **Findingi:** 739 ✅ (zamknięty usunięciem), 742 — część OFF znika ze starą stroną; 740 ⚪, 741 ⚪ otwarte.
- **Testy:** piny ON == OFF zamienione na absolutne — `console_economy_smoke` 85/0, `console_production_smoke` 114/0, `console_trade_smoke`
  102/0, mutacje 33/33; sweep 418/418, `check-i18n` PASS; żywy silnik w obu rozmiarach 0 błędów strony.
- **Złapane przez skonwertowany keeper:** dwa wywołania usuniętego `kitPage()` w polach `<input>` (próg minimalnego zapasu, zlecenie
  jednorazowe) — klik rzucałby błąd; naprawione przed commitem i przypięte.

Następny krok: pozostałe kroki arcu (§6.1); końcowy KZ — flagi pozostałych ekranów i `consoleKit`.

---

---

## ARC KONSOLE — K5: Cywilizacja + Sfera Dysona na szablonie konsoli (`3678990` + `e3af2db`, PASS właściciela 2026-11-17) — Cywilizacja GOTOWA

Plan i rejestr: `docs/design/CONSOLES_PLAN.md` §19. Flaga `FEATURES.consoleCivilization` (OFF = dziś bit w bit).
- **Decyzje właściciela:** Sfera Dysona NIE jest zamrożona (jedyna ścieżka końca gry; jej przyszłość razem z nowym projektem końca gry);
  emblemat dostarcza właściciel (`assets/ui/emblems/player.png`, biały na przezroczystym, 512×512; bez pliku — nazwa imperium); podpisana
  tabela bohatera Cywilizacji przepisana do planu; po bramce sekcja «Kolonie i placówki» w przeglądzie imperium.
- **Cywilizacja:** czipy grupy zamiast subnav; lista Imperium / Frakcje / Historia (powtórzenia ×N); bohater = portret + emblemat + 4 liczby;
  inspektor = premie i tabela kolonii / cechy lidera / kolonia / frakcja / grupa kroniki; pas = oś kroniki.
- **Dyson:** pierścień 20 segmentów, koszt vs magazyn domu, [ DOSTARCZ ] albo powód (dziś cicha odmowa), ścieżka końca gry.
- **Findingi:** 743 ✅ (osobny `fix(743)`: etap i pierścienie 3D wracają po wczytaniu i po przebudowie układu, tylko przy gwieździe
  macierzystej), 744 ⚪ (martwa cecha lidera `dysonProgress`).
- **Testy:** `console_civilization_smoke` 60/0, `dyson_stage_restore_smoke` 9/0, mutacje 19/19; sweep 420/420, `check-i18n` PASS;
  żywy silnik 0 wyjątków (5 motywów, 1280×833, OFF, baza, placówka, zapis → wczytanie).

Następny krok: pozostałe kroki arcu (§6.1 — K7 Dowództwo); końcowy KZ obejmie `consoleCivilization`.

## ARC KONSOLE — K7-A: Dowództwo (rejestr) na szablonie konsoli (`44dd164` + `2c13b9f`, PASS właściciela 2026-11-17)

Plan i rejestr: `docs/design/CONSOLES_PLAN.md` §20 (podział K7 w §6.1). Flaga `FEATURES.consoleCommand` (OFF = dziś bit w bit).
- **Rama:** czipy zakładek Dowództwa w nagłówku zamiast własnego paska; Jednostki / Atlas / Logistyka — dzisiejsze strony pod czipami (K7-C).
- **Rejestr:** lista (szukajka, grupowanie, floty, układy, role, sekcje z licznikami) · bohater = tabela statków (12 kolumn, sort, grupy,
  zaznaczenie wielokrotne, stały pasek zbiorczy, „wyczyść filtry”) · inspektor = dzisiejszy panel (reskin K7-B) albo podsumowanie zaznaczenia
  · pas = oś misji dla zaznaczenia.
- **Po bramce (odstępstwo 9 zmienione):** klik wiersza tylko zaznacza; „POKAŻ” liczy plan z żywego statku (ten sam układ — kamera śledzi
  bieżącą pozycję; dok — ciało / stacja; inny układ — przełączenie; skok / nieotwieralny układ — wyłączone z powodem). Diagnoza
  zawodności zmierzona na żywym silniku per stan (§20).
- **Reguła zestawu:** plakietki mapy (ikony budynków, kropka planety gracza, glify / duchy / znaczniki trybu Y, znaczniki wrogów i POI)
  nie są rysowane pod żadną konsolą, wracają po zamknięciu; warstwa HUD gasła już wcześniej.
- **Findingi:** 745 ⚪ (etykiety torów osi rejestru OFF; ścieżka konsoli poprawna), 746 ✅ (osobny `fix(746)`: sprite statku w locie nie
  jest przypinany do niezwolnionej orbity — kamera na statku, nie w miejscu startu rozpoznania).
- **Testy:** `console_command_smoke` 214/0, `console_map_badges_smoke` 24/0, `transit_sprite_orbit_smoke` 7/0; mutacje 17/17 + 15/15;
  sweep 423/423, `check-i18n` PASS; żywy silnik 0 wyjątków (5 motywów, 1280×833, +60 statków, OFF, baza, POKAŻ per stan, plakietki).

Następny krok: K7-pre (usunięcie uśpionej mapy 2D, D-K-18), potem K7-B.

## ARC KONSOLE — K7-pre + K7-B: inspektor statku / floty na konsoli (`407607d` + `29b7e7d` + `0eab554`, PASS właściciela 2026-11-17)

Plan i rejestr: `docs/design/CONSOLES_PLAN.md` §21–§22. Flaga `FEATURES.consoleCommand` (OFF = dziś bit w bit).
- **K7-pre:** usunięta uśpiona mapa 2D i lewa lista flot Dowództwa (FMO 7917 → 6040 LOC), flagi `commandTacticalMap` i `fleetRegistry`
  oraz keeper `fleet_list_rows_smoke` (decyzje właściciela); tożsamość ON zmierzona w 19 stanach.
- **Inspektor statku:** nagłówek (nazwa = zmiana nazwy), linia statusu w rolach, przyrządy (paliwo, warp, wytrzymałość, kadłub = flaga
  uszkodzenia + naprawa), utrzymanie z konkretną naprawą, blok „Teraz”, akcje w grupach (główne → rozkazy → logistyka → rozbiórka),
  akta techniczne, log; akcja niemożliwa = czip wyłączony z powodem; „Brak rozkazów w locie” zamiast „Brak dostępnych akcji”.
- **Flota / zaznaczenie:** najwolniejszy, zasięg, paliwo; `[ ROZWIĄŻ FLOTĘ ]` i `[ + NOWA FLOTA ]` (747).
- **Okna dialogowe** przy strefie konsoli (bez `window.inner*`); **ROLA** = glif + skrót (zwiadowca „ZWD”), puste kolumny zwężone.
- **T4** nie nagrywany (migawka usuniętego panelu T3, bez zmian) — jego stany są wyrocznią keepera inspektora.
- **Odstępstwa zatwierdzone:** panel wroga i konfigurator misji w dzisiejszym rysunku (reskin w K7-C); 747 tylko na konsoli.
- **Findingi:** 747 ✅ (konsola), 748 ⚪, 749 ✅ (osobny `fix(749)`: pole zmiany nazwy startuje z nazwą statku).
- **Testy:** `console_inspector_smoke` 377/0, `rename_vessel_prefill_smoke` 7/0; mutacje 15/15; sweep 424/424, `check-i18n` PASS;
  żywy silnik 0 wyjątków (5 motywów, 1280×833, OFF, baza).

Następny krok: K7-C (Atlas, Logistyka, Jednostki na konsoli + reskin panelu wroga i konfiguratora misji).

## ARC KONSOLE — K7-C: wróg, konfigurator misji, Atlas, Logistyka, Jednostki na konsoli (`4e71750` + `7e59e26` + `cab95b4`, PASS właściciela 2026-11-17) — Dowództwo GOTOWE

Flaga `FEATURES.consoleCommand` (OFF = dziś bit w bit, 15 stanów identycznych z `880a81b`). Plan: `docs/design/CONSOLES_PLAN.md` §23.
- **Decyzje właściciela w sesji:** Atlas = ciała aktywnego układu; Jednostki = kolonie + rekrutacja (kolonia strony lokalna).
- **Wróg:** nazwa / imperium tylko przy pełnym kontakcie (mgła), status w roli alert, znane / nieznane; brak akcji → gdzie wydać rozkaz.
- **Konfigurator misji:** kroki Typ → Cel → Opcje → Potwierdź; cel poza zasięgiem paliwa bez strefy z powodem; `[ WYŚLIJ MISJĘ ]` wyłączone
  z powodem paliwa.
- **Atlas:** lista ciał ↔ orrery (jeden wybór, +9,8% promienia), inspektor z dzisiejszymi akcjami i wszystkimi złożami (przewijany).
- **Logistyka:** lista zleceń + kreator, trasy między koloniami z wąskim gardłem, pole ilości ze strefy konsoli, pas „W trasie”.
- **Jednostki:** kolonie z licznikami, tabela jednostek, siatka kafli z modelami właściciela (miniatury GLB z cache panelu), rekrutacja
  w kolonii strony z powodem blokady.
- **Findingi:** 750 ⚪ (gałąź „cel konfiguratora” z Atlasu nieosiągalna), 751 ✅ (okno ładunku i raport przy strefie), 752 ✅ (zapadka
  literałów 5 → 3), 753 ✅ (`fix(753)`: panel bez surowych id), 754 ✅ (`fix(754)`: każdy archetyp ma istniejący model), 755 ⚪ (czytelność
  tekstu konsoli na jasnej planecie z bliska — do KZ).
- **Testy:** `console_command_pages_smoke` 296/0; mutacje 20/20 + 4/4; sweep 425/425, `check-i18n` PASS; żywy silnik 0 wyjątków
  (5 motywów, 1280×833, OFF, baza).
- **Poprawka `9185f16` fix(K7-C-ground) (OK właściciela 2026-11-17):** kafle rekrutacji wróciły do rozmiaru sprzed „≈2×” w jednym rzędzie
  u dołu bohatera; tabela jednostek nad nimi przewija się kółkiem (stały nagłówek, strefy tylko widocznych wierszy); nazwy domyślne
  jednostek i etykieta zaopatrzenia przez i18n (tylko wyświetlanie). Keeper 387/0, mutacje 9/9 + 5/5, żywy silnik 0 wyjątków.

Następny krok: KZ (flagi na stałe, ścieżki OFF usunięte); 750 i 755 trafiają tam.

## ARC KONSOLE — KZ: wszystkie konsole na stałe + Finding 755 (smoke właściciela PASS 2026-11-18) — ARC KONSOLE ZAMKNIĘTY

- **Commity:** `d4bb003` KZ-Civ (Cywilizacja + Dyson) · `8e67ba2` KZ-Dipl (Dyplomacja, Wywiad, Wojny) · `8701aa8` KZ-Shipyard
  (flagi `consoleShipyard` + `shipHologram`; U → Stocznia zawsze) · `eff0233` KZ-Command (`consoleCommand`; FleetManagerOverlay
  6519 → 3012 linii, graf wywołań skryptem) · `d3a8d16` KZ-Kit (`consoleKit`; tło = dawny tryb `live` z ustawieniami właściciela,
  `glass` / `opaque` usunięte) · `5d2e7fd` fix(755).
- **Metoda:** jak KZ-E — tylko ścieżka konsoli, gałęzie OFF i wszystko, czego używały tylko one, usunięte; keepery ON-vs-OFF →
  bezwzględne piny konsoli; tożsamość dziennika rysowania i stref wobec `99bc358` przy 1600×1041 i 1280×833 = 0 różnych.
- **755:** poświata tekstu konsoli rośnie tylko nad jasnym tłem (per linia, wszystkie strefy), bez prostokątów; pomiar jasności
  asynchroniczny (WebGL2: blit → PBO → fence, klatka nigdy nie czeka) — próbnik ≈ 0,07 ms na klatkę (wersja synchroniczna 4–16 ms).
- **Findingi:** zamknięte usunięciem 745 i część OFF 747; 755 ✅; zgłoszone 756 (`createUnit` przyjmuje nieznany archetyp),
  757 (samodzielny ekran U bez gospodarza), 758 (EN Scrap / Disband).
- **Testy:** sweep 426/426, `check-i18n` PASS; żywy silnik (wszystkie ekrany i strony, Stocznia, Dowództwo, Rynek z placówką)
  0 błędów strony przy obu rozmiarach.
- **Zamknięcie arcu:** CONSOLES_PLAN.md §25 — poza arcem: Kolonie / ekran planety, Nauka / Obserwatorium, mechanika wyboru stoczni
  (§14), endgame / Dyson; otwarte: 730, 736, 740, 741, 744, 748, 750, 756–758.
