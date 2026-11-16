# Development stages (moved from CLAUDE.md)
> Moved verbatim from CLAUDE.md on 2026-11-16 (source lines 3124–3475). Historical record — it may describe code that has since changed or been removed; the authoritative records are the plan docs in docs/design/ named inside each section. Kept in the original language (Polish).

<!-- CLAUDE.md L3124–3475 -->
## Etapy rozwoju

### Warstwa symulacyjna (✅ ukończone)
- [x] **Etap 1** — Fundament: orbity Keplera, kamera, czas
- [x] **Etap 2** — Fizyka zaawansowana: perturbacje, kolizje, StabilitySystem, EventLog
- [x] **Etap 3** — Gameplay: PlayerActionSystem (Q/W/E), ActionPanel, energia+regen
- [x] **Etap 4** — Życie: LifeSystem 5 etapów, glow efekty, efekt cieplarniany, fizyka kolizji (LRL)
- [x] **Etap 4b** — Skład chemiczny: ElementsData (20 pierwiastków), GravitySystem N-body, zakładki UI
- [x] **Etap 5** — Polish: pixel art, AudioSystem (Web Audio API), SaveSystem, BootScene dialogi
- [x] **Etap 9** — DiskPhaseSystem: DISK→CLEARING→MATURE, auto-slow
- [x] **Etap 10b** — Stabilizacja fizyki: GRAVITY_MASS_SCALE, słabsze perturbacje, scenariusz EDEN
- [x] **Migracja 3D** — Renderer przepisany z Phaser 2D na Three.js WebGL; ThreeRenderer + ThreeCameraController; UIManager/PlanetScene pozostają na Canvas 2D
- [x] **Etap R1** — Różnorodność układów: 1–11 planet (rozkład prawdop.), typy per strefa (gas/rocky/ice), szeroka paleta kolorów, MAX_ORBIT_AU=25
- [x] **Etap R2** — Księżyce: Moon entity, PhysicsSystem orbita wokół planety, ThreeRenderer (sfera+ring), SaveSystem v3, wizualne okresy orbitalne (5–35 s przy 1d/s)
- [x] **Etap R3** — Naprawa life emergence: hasRockyHZ gwarancja skalistej w HZ, forceType='rocky', redukcja gas post-HZ 42%→28%; Eden: lifeScore=100 + auto-civMode z zasobami startowymi

### Warstwa 4X (✅ ukończone)
- [x] **Etap 6.1** — ResourceSystem: 5 surowców (minerals/energy/organics/water/research)
- [x] **Etap 6.2** — CivilizationSystem: populacja, housing, morale, 4 epoki
- [x] **Etap 6.3** — HexGrid + HexTile: cube coords, 10 biomów
- [x] **Etap 6.4** — PlanetMapGenerator: Voronoi, polar caps, PRNG deterministyczny
- [x] **Etap 6.5** — PlanetScene: rendering, kamera zoom/pan, lewy/prawy panel
- [x] **Etap 6.6** — BuildingSystem: 8 budynków, teren+środki+yieldBonus
- [x] **Etap 6.7** — ResourcePanel: pasek HUD z deltaYear i alarmami
- [x] **Etap 6.8** — Przejście KOSMOS→4X: civMode, homePlanet, PlanetScene launch
- [x] **Etap 6.9** — UI polish: HEX_SIZE=32, kolory kategorii, centering
- [x] **Etap 7** — SaveSystem v2: serializacja stanu 4X
- [x] **Etap 10** — Auto-slow, budynki na hexach (emoji ikony), naprawa allowedCategories
- [x] **Etap 11** — TechSystem + TechData: 10 tech w 5 gałęziach, modal panel [NAUKA], budynki tier-2
- [x] **Etap 12** — CivilizationSystem deep: model wzrostu pop, morale 6-składnikowe, kryzysy unrest/famine
- [x] **Etap 13** — ExpeditionSystem + ExpeditionPanel: misje mining/scientific, rocketry tech, launch_pad building
- [x] **Etap 18** — System POP: dyskretna populacja (start: 2 POPy), budynki wymagają 0.25–0.5 POP, konsumpcja 3 surowców per POP, wzrost akumulatorowy, głód, employmentPenalty, ekspedycje blokują 0.5 POP, SaveSystem v4
- [x] **Etap 19** — CivPanel UI: 3 zakładki (Gospodarka/Technologie/Budowle) w UIManager z widoku kosmicznego, floating tooltips hover na budynkach i technologiach, EventLog przeniesiony na dół-lewo

- [x] **Etap 14** — Kolonizacja: colony_ship, scientific expedition, ColonyManager, multi-kolonia
- [x] **Etap 15** — Zdarzenia losowe: RandomEventSystem (aktywny — eventy co 8-25 lat, obrona, blokady, prosperity bonusy)
- [x] **Etap 16** — Ekspansja między planetami: handel, migracja, zarządzanie imperium
- [x] **Etap 23** — Stocznia + Flota: statki jako jednostki, shipyard, hangar per-kolonia
- [x] **Etap 24** — Misje rozpoznawcze: recon w ExpeditionSystem, explored gating
- [x] **Etap 25** — System odległości + zoom: DistanceUtils (euclidean/orbital AU), range statków, dynamiczny min-zoom dla księżyców
- [x] **Etap 26** — Restrukturyzacja ekonomii: FactorySystem, DepositSystem, CivPanel 5 zakładek

### Tekstury i rendering
- [x] **Etap 27** — Generator tekstur: modularny pipeline (noise→terrain→craters→erosion→color→maps), 9 typów planet, PBR (diffuse+normal+roughness+height), integracja z ThreeRenderer (MeshStandardMaterial)

### Scenariusze i architektura
- [x] **Etap 28** — Scenariusz "Cywilizacja": losowy układ z gwarancją cywilizacji, auto-kolonizacja; zamrożony "Generator"; usunięty Eden. ⚠ **Sprostowanie (AI_CAPTURE AC-1, ZMIERZONE w źródle): ani kolizje, ani perturbacje NIE są wyłączone w tym scenariuszu.** Kolizje biegną zawsze w aktywnym układzie (`PhysicsSystem.js:64-68` — brak bramki scenariusza, Finding 62); perturbacje pomijane są **wyłącznie w `power_test`** (`:71`), więc w „Cywilizacji" DZIAŁAJĄ (rozszerzenie Finding 62 o drugi mechanizm). Kolizje to m.in. jedyna realna ścieżka śmierci placówki (ciała małe: księżyce, planetoidy)
- [x] **Etap 29** — Planetoidy: 3 typy (metallic/carbonaceous/silicate), wzbogacone składy (Cu/Ti/W/Pt/Li), widoczne orbity, save/restore
- [x] **Etap 30** — System Transportowy: VesselManager (rejestr floty), Vessel entity (pozycja/paliwo/misja), VesselNames (auto-nazwy PL), paliwo Tier 1 (power_cells, fuelPerAU), statki jako 3D sprites na mapie, UI floty z panelem akcji, integracja z ExpeditionSystem (vesselId), save v6 z migracją string fleet → vessel instances
- [x] **Etap 31** — Katalog ciał + fizyka lotów: katalog WSZYSTKICH ciał (explored+unexplored), recon na konkretne ciało, sekwencyjny full_system recon (greedy NN), unikanie Słońca (strefa wykluczenia 0.3 AU + waypoints), dynamiczny powrót do ruchomej planety, wielopunktowe linie trasy w 3D
- [x] **Etap 32** — Stocznia wielopoziomowa + orbita statków: shipQueue→shipQueues (Lv=sloty), recon orbiting zamiast auto-return, rozkazy redirect/return dla orbitujących statków, UI sekcje "Na orbicie"/"W locie" w panelu floty

### UI i powiadomienia
- [x] **Etap 33** — Popupy misji: MissionEventModal z pauzą, kolejką, save/restore czasu; popupy dla katastrofy, kolonizacji, raportu misji, odkrycia ciała (recon)

### Gameplay i UI (✅ ukończone)
- [x] **Etap 34** — 8 zadań gameplay: kolejka produkcji, usunięcie mining, trasy handlowe, scroll misji, stocznia speed, popup theming, linia trasy, cargo bez limitu
- [x] **Etap 35** — Branding KOSMOS: TitleScene z animowanym tłem, hero planet, paleta ciepły bursztyn; unifikacja THEME tokenów we wszystkich plikach UI Canvas 2D; scenariusz Power Test
- [x] **Etap 36** — Czas budowy budynków + Deploy prefabów z cargo
- [x] **Etap 37** — System Outpost: mini-kolonia bez POPów, transport tworzy outpost, colony ship upgraduje do kolonii

### Ekonomia cywilna
- [x] **Etap 39** — Cywilna Ekonomia: CivilianTradeSystem (auto-routing towarów, Kredyty Kr), budynki market (trade_hub/free_market/trade_beacon/commodity_nexus), tech advanced_trade, prosperity trade network bonus, SaveMigration v23, panel Handel w EconomyOverlay (kredyty/połączenia/ceny lokalne), linie handlu 3D w ThreeRenderer

### Obserwatorium
- [x] **Etap 40A** — ObservatorySystem: pasywne skanowanie ciał (auto-scan), research 6
- [x] **Etap 40B** — Bonus do misji: −0.3%/lv katastrofa, +5%/lv yield mining/scientific
- [x] **Etap 40C** — Wczesne ostrzeżenie: RandomEventSystem warningQueue, opóźnienie negatywnych eventów
- [x] **Etap 40D** — Prognoza kolizji: CollisionForecast, inkrementalna symulacja KeplerMath, auto-pauza
- [x] **Etap 40E** — Zakładka Observatory UI: ObservatoryOverlay (SKAN/ORBITY/ZAGROŻENIA), klawisz O

### Endgame (✅ ukończone)
- [x] **Etap 17** — Cel gry: Sfera Dysona (20 segmentów, 4 fazy), techy `dyson_engineering/collector/transmitter` + `jump_gate_construction`, DysonSystem/DysonOverlay, 5 etapów wizualnych gwiazdy, EndgameScene z 3 zakończeniami (Powrót / Zostajemy / Wiadomość) — domyślne wg suwaka frakcji

### Wojna, dyplomacja, AI obcych (✅ Fazy 0-7, plan: `docs/plan-war-diplomacy-ai.md`)
- [x] **Faza 0** — GameState reactive store + DebugLog (ring buffer) + SaveMigration v51→v52
- [x] **Faza 1** — EmpireRegistry + EmpireGenerator + 5 archetypów, 3-6 obcych imperiów na GalaxyMap
- [x] **Faza 2** — IntelSystem (unknown→rumor→contact→detailed) + IntelOverlay (klawisz I)
- [x] **Faza 3** — DiplomacySystem (hostility 0-100) + AlienCivSystem FSM + DiplomacyOverlay (klawisz **D**)
- [x] **Faza 4** — WarSystem + BattleSystem (deterministic seeded) + moduły bojowe + WarOverlay (klawisz W)
- [x] **Faza 5** — BattleView3D cinematic (proceduralne statki, timeline, laser/flash) + BattleIntroModal
- [x] **Faza 6** — InvasionSystem + ColonyOverlay combat (desant, HP bars, przycisk ⚔ ATAKUJ)
- [x] **Faza 6b — podbój ciała AI PRZEZ gracza** (`2d1b825`+`53e0127`, save bez migracji, live-gate PASS).
      Dotąd desant zmieniał tylko `tile.owner` (event `groundUnit:buildingCaptured` BEZ subskrybenta),
      a `transferColony` działał jednostronnie (gracz→imperium). Teraz:
      **`ColonyManager.captureColonyForPlayer(planetId)`** — odwrotność transferColony: kolonia ZOSTAJE
      w `_colonies` (inventory/budynki/produkcja liczą się na gracza), zdejmuje `ownerEmpireId`+`isTestEnemy`,
      czyści „[WRÓG]", hexy→`player`, wypina z EmpireRegistry+galaxyData; emituje `colony:capturedByPlayer`
      (NIE `colony:captured` — ten wyzwala alert „utracono") + `colony:listChanged`.
      **Trigger `InvasionSystem`** — ⚠ **sprostowanie (AI_CAPTURE AC-1): „dwutorowo" było FAŁSZEM.**
      Subskrypcja `groundUnit:buildingCaptured` istnieje (`:57-59`), ale ten event NIGDY nie leci
      (producent bez wywołań — patrz tabela zdarzeń), więc **żywa jest JEDNA tora: skan okresowy
      `_tickPlayerConquestChecks`** (1 civYear). Skan jest konieczny także na starym save i gdy ostatni
      wróg ginie PO przejęciu stolicy. Wspólny `_tryPlayerCapture`: brak żywych
      wrogich jednostek naziemnych ORAZ (kolonia MA stolicę→gracz właściciel `capitalBase` | outpost bez
      stolicy→gracz kontroluje ≥1 przejęty hex z budynkiem). GameScene switchActiveColony, UIManager
      EventLog+odświeżenie belki/drawera, i18n `log.colonyCaptured`/`log.outpostCaptured`.
      Smoke `invasion_player_capture_smoke.mjs` 25/25. Poza zakresem: przejmowanie wrogich jednostek
      naziemnych, stacje AI, konwersja POP.
- [⛔] **Faza 7** — MilitaryAI + EconAI (GOAP + Utility) — ⚠ **WYCOFANE w W3-8 (`814fb38`)**, nie „ongoing":
      obie pętle scorowały 0 od zawsze (`createEmpire` wycina `resources`, `updateMilitaryPower` to no-op),
      więc miały ZERO wejść w normalnej grze. Decyzje wojenne AI ma dziś WYŁĄCZNIE Director
      (`AlienCivSystem` → `directorSystem.tickEmpire`). Pin źródłowy: `war_seams_smoke` T2b.

### S3.4 — Light Diplomacy (✅ ukończony, save v85 bez migracji, live-gate PASS)
Oś trust + emisariusze + traktaty nad istniejącym DiplomacySystem (Faza 3). `FEATURES.lightDiplomacy=true`.
- [x] **Trust axis** — `changeTrust/getTrust/getTrustStatus` (0-100, 50=neutral, display −10..+10;
      hostile/neutral/friendly/ally-via-treaty). Bez auto-decay; emituje `diplomacy:trustChanged`.
- [x] **Abstract envoy mission** — 5y (+5 trust @2.5y + @5y), statek z `diplomatic_module` (slotType special)
      zablokowany BEZ fizycznego lotu (`VesselManager.lockOnAbstractMission`/`releaseFromAbstractMission`);
      `canDoEnvoy()` helper; cel = imperium (nie ciało).
- [x] **Border triggers** — `vessel:arrived` w systemie obcego → military −5 / research −3 / trespass −5
      (tick-reconciled, bez `vessel:departed`); `KOSMOS.debug.simulateVesselArrival(empireId, kind)`.
- [x] **Traktaty** (`src/data/TreatyData.js`) — trade_agreement (+1 trust/yr) / non_aggression (blokuje
      AI auto-war) / alliance (status „Sojusznik") + heurystyka akceptacji AI (personality × trust).
- [x] **War consequences** — `declareWar` zeruje trust (drive-to-0) + zrywa WSZYSTKIE traktaty.
- [x] **AI envoy** — abstrakcyjny (cooldown 15 civY, `ui:toast`, war-guard: brak envoy w stanie wojny);
      `KOSMOS.debug.triggerAIEnvoy(empireId)`.
- [x] **DiplomacyOverlay** — pasek trust (−10..+10), status label, 6 przycisków w 3 wierszach
      (wojna/pokój · emisariusz/handel · pakt/sojusz) + tło-absorber klików (first-match `_hitTest`).
- [x] **i18n PL+EN** + UIManager EventLog/toast. Smoke `tmp_s3_4_smoke.mjs` 44/44 + regr faza3 20/20,
      s4-3 14/14, s4-2 25/25, s4-1 23/23. NEXT: S3.5 (cross-empire trade).

### S3.5a-1 — Fleet maintenance credit sink (✅ ukończony, save v86, live-gate PASS)
Utrzymanie floty jako GŁÓWNY sink Kredytów (Kr). Bez `FEATURES` flagi (core mechanic).
- [x] **upkeepCredits per kadłub** (data-driven w `HullsData.js` + `ShipsData.js`): hull_small 50,
      hull_medium 300, hull_large 500, hull_frigate 300, hull_destroyer 500, hull_cruiser 1000;
      legacy science_vessel 50, cargo_ship 300, space_supply_ship 300; fallback 50 (nieznany shipId).
- [x] **VesselManager** — `_tickVesselMaintenance` (raz na **1.0 ROKU GRY** = physDt, NIE civYear;
      per-vessel **cheapest-first**; woła `civilianTradeSystem.spendCredits()` BEZPOŚREDNIO — 1 odejmowanie
      + bool, omija double-deduct latentny w ground-unit upkeep) + helpery `getVesselUpkeepCredits`
      (fallback `DEFAULT_VESSEL_UPKEEP=50`), `isImmobilized` (**pochodna flaga**: `unpaidYears ≥ UPKEEP_GRACE_YEARS=2`,
      NIE status enum — zero ryzyka dla ~10 sites resetujących status), `getTotalFleetUpkeep`,
      `_resolvePayHomeId` (homeColonyId pełna kolonia → fallback `KOSMOS.homePlanet`). Serialize/restore `unpaidYears`.
- [x] **MovementOrderSystem** — `issueOrder` gate `vessel_immobilized` (blokuje moveToPoint/pursue/intercept/
      engage/retreat/patrol/escort/goToPOI; Return-to-base przez `startReturn` poza issueOrder = dozwolony).
      `_resumeMissionAfterOrder` drop suspended mission gdy immobilized.
- [x] **SaveMigration v85→v86** — `_migrateV85toV86`: **force-reset** `unpaidYears=0` na wszystkich vessel
      (nie tylko default — celowo nadpisuje zawyżone wartości ze starych save z buggy cadence).
- [x] **UI** — FleetManagerOverlay: ⚠ badge w wierszu + linia „Utrzymanie −X Kr/rok" + „Unpaid: N lat" w detalu.
      ThreeRenderer: szary tint (`setRGB(0.5,0.5,0.5)`, opacity 0.6) immobilized statków gracza
      (`_applyVesselMaintenanceTint`, cache `_maintOrigColorHex/_maintOrigOpacity`; wołany PRZED rozgałęzieniem
      stanu w `_syncVesselPositions` — orbiterzy robią `continue`, więc na końcu pętli ich nie obejmował).
      CivilizationOverlay: linia utrzymania floty + **uczciwy Bilans Kr = netto** (handel + podatki − utrzymanie
      jednostek − utrzymanie floty; wcześniej tylko przepływ handlu → mylące +0.0 mimo deficytu).
- [x] **i18n PL+EN** — `fleet.maintenance/upkeepPerYear/immobilized/unpaidYears`, `civOverlay.fleetUpkeep`,
      `vessel.reasonVesselImmobilized` (EventLog na odrzucony rozkaz).
- [x] **Bugfixy live-gate**: (1) cadence **civYear→physYear** — `_tick(deltaYears, physDt)` z `time:tick`;
      przy CIV_TIME_SCALE=12 civYear naliczał upkeep 12×/rok gry → kolonia nie nadążała (fałszywy immobilize +
      brak deduct). (2) **TopBar + CivOverlay filtr kolonii AI** (`!c.ownerEmpireId`) — getAllColonies zawiera
      kolonie AI; sumowanie ich kredytów maskowało drain (kredyty „nie spadały poniżej ~2000", skok przy
      kolonizacji AI). (3) **tint przed orbit branch** (ISSUE C). (4) **migracja force-reset** stale unpaidYears.
- [x] Smoke `tmp_s3_5a_1_smoke.mjs` **43/43** (T1-T12: koszty/cheapest-first/immobilize/resume/fallback/gate/
      resume-drop/no-double-deduct/akumulator/migracja/cadence-wiring/rate-guard) + regr s3_4 44/44, s4_3 14/14,
      s4_2 25/25. **NEXT: S3.5a-2 (pozostałe sinki Kr).**

### S3.5b — Cross-Empire Trade (✅ ukończony, save v86 bez migracji, live-gate PASS)
Handel z imperiami AI: brama handlu cywilnego (abstrakcyjnego, bez statków) + ręczny Order Board (zakładka
„Rynek"). Bez `FEATURES` flagi (core). Ceny = ten sam mechanizm co handel cywilny (`BASE_PRICE × scarcityMultiplier`).
- [x] **Civilian trade gate** (`CivilianTradeSystem._calcAllConnections`) — para gracz↔AI dozwolona gdy
      `isResearched('ion_drives')` + `hasTradeAgreement(empireId)` + per-empire toggle (domyślnie ON); zasięg
      nieograniczony jak `hasNexus`; same-empire nietknięte; AI↔AI cross-empire zablokowane. Pool filter
      (`_halfYearlyTick`) **omija bramkę explored (fog-of-war) gdy jest traktat** (traktat ⇒ kontakt).
      `_routeMigration` guard `crossEmpire` (towary przekraczają granicę, POPy NIE).
- [x] **getLocalPrice(goodId, colony)** (parytet cen — JEDNO źródło prawdy) + `setCrossEmpireTrade`/
      `isCrossEmpireTradeEnabled` (intent methods owner; `gameState.crossEmpireTrade[empireId]`, brak klucza ⇒ ON).
- [x] **TradeOrderBoard** (`src/systems/TradeOrderBoard.js`) — `placeOrder/cancelOrder/getOrders/_tick`.
      Settle-at-delivery (1 ROK GRY, **absolutny zegar** `timeSystem.gameTime` — omija pułapkę civYear/physYear
      z S3.5a-1), płatność **ZERO-SUM** (BUY: gracz −Kr/+towar, AI +Kr/−towar; SELL odwrotnie), all-or-nothing
      z 4 powodami anulowania (`agreement_broken`/`insufficient_funds`/`insufficient_goods`/`colony_lost`).
      Cena lock przy złożeniu; importer = gracz(BUY)/AI(SELL). Emituje `tradeOrder:placed/delivered/cancelled`.
- [x] **GameState** — `tradeOrders:[]` + `crossEmpireTrade:{}` w `createDefaultState()` (precedens `pois:{}`).
      **BEZ SaveMigration — save zostaje v86** (round-trip przez `gameState.serialize/restore`; stary save → default []).
      Wired w GameScene (instancja + `window.KOSMOS.tradeOrderBoard`; restore automatyczny z `gameState.restore`).
- [x] **TradeOverlay** — zakładka „Rynek" (mechanizm zakładek wzór `EconomyOverlay:590-609` + `case 'tab'`):
      lista imperiów z traktatem + kolonie (**per-colony counterparty**) + inventory AI z cenami live + panel
      Kup/Sprzedaj (qty +/−) + zlecenia w toku z anulowaniem + per-empire toggle Auto-handel.
- [x] **DiplomacyOverlay** — toggle Auto-handel ON/OFF w slocie traktatu (gdy traktat aktywny; martwy przycisk
      propozycji zastąpiony). **UIManager** — `tradeOrder:delivered/cancelled` → EventLog; `TradeOrderBoard`
      zasila **TradeLog** (log aktywności + wykresy w zakładce Handel) przez `trade:imported`(BUY)/`trade:exported`
      (SELL) z `orderBoard:true` (UIManager pomija duplikat 📦).
- [x] **i18n PL+EN** — `tradePanel.tabTrade/tabMarket` + grupa `market.*` (panel, ceny, zlecenia, powody, toggle).
- [x] **Bugfixy live-gate**: (A) **explored gate bypass** dla partnerów z traktatem (handel cywilny nie ruszał —
      system AI `explored=false`). (B) **`scarcityMultiplier` koercja** `undefined/NaN → 0` (brak danych = pusty,
      nie nadwyżka); ceny OK (0.2 Kr = poprawny floor nadwyżki Fe, nie bug — BASE_PRICE kompletne dla 34 towarów).
      (C) Order Board → TradeLog (dostawy w logu aktywności). (D) **`_fmtKr`** (małe ceny <100 Kr z miejscem
      dziesiętnym, nie „0Kr"). (E) font inventory **9→11px** (fontSizeNormal, wiersz 15→17px).
- [x] **Debug** — `KOSMOS.debug.crossEmpireTradeStatus()` (per kolonia AI: TRADEABLE/BLOCKED + powód; per-empire
      warp/treaty/toggle).
- [x] Smoke `tmp_s3_5b_smoke.mjs` **51/51** (G1-G7 bramka+migration guard, P1-P2 cena/toggle, B1-B9 board,
      S1-S2 save round-trip, A1-A2 explored bypass, C1-C2 TradeLog feed, Bfix scarcity) + regr s3_5a_1 43/43,
      s3_4 44/44, s4_3 14/14, s4_2 25/25. **NEXT: S3.5a-2 (pozostałe sinki Kr) lub dług techniczny AI.**

### Testowanie AI (✅ ukończone)
- [x] Headless bots + runner + UI + raporty (commit `f296032`)
- [x] ConclusionsEngine (18 reguł wniosków) + rich metrics + RuleBot v4 priorytetyzujący łańcuch kosmiczny (commit `5d5ffed`)

### Milestone 2a — Combat Core (✅ ukończony, save v66, implementacja 2026-04-24)
Design: `docs/design/milestone-2a-combat-core.md` + Appendix A (post-implementation).
Raport: `docs/design/milestone-2a-implementation-report.md`. 8 atomowych commitów,
169 asercji offline PASS.

- [x] **ProximitySystem** (`src/systems/ProximitySystem.js`) — per-tick detection
      O(n²/2) z rotującym offset + hysteresis 0.5/0.6 AU + budget 500 pairs/tick.
      Emituje `vessel:proximityEnter/Exit`. Feature flag OFF-by-default.
- [x] **VesselCombatSystem** (`src/systems/VesselCombatSystem.js`) — event-driven
      na `vessel:proximityEnter` (dist ≤ 0.15 AU), team-up by ownerEmpireId
      (M2a: player↔empire), deep-space battle przez BattleSystem.resolveBattle,
      cooldown 2 civYears. Feature flag OFF.
- [x] **AutoRetreatSystem** (`src/systems/AutoRetreatSystem.js`) — event-driven
      na `battle:resolved` z `retreated`. Wydaje `moveToPoint` do najbliższej
      friendly planety (preferencja full colonies > outposts > wrak). Aktywny
      z vesselCombat (bez osobnej flagi).
- [x] **Unified aggregator** — `WarSystem._fleetArrived` skip gdy
      `materializationState='full' && materializedVesselIds[]`. Eliminuje
      double-hit dla materialized fleet. Feature flag OFF.
- [x] **Deep-space wrak handling** — `EnemyAttackHandler._turnIntoWreck`
      rozszerzony kontrakt (string | {x,y} | null). `vessel.wreckLocation` (v66
      serialized). ThreeRenderer._syncVesselPositions + _addVesselSprite
      fallback na wreckLocation dla sprite.
- [x] **Endurance drain multiplier** — PURSUE_DRAIN_MULT=3.0 dla
      `movementOrder.type ∈ ('pursue','intercept')` w `VesselManager._tickEndurance`.
- [x] **Devtools** — `KOSMOS.debug.{enableProximity, enableVesselCombat,
      enableUnifiedAggregator}` + disable wariants. Combat Sandbox aktywuje
      flagi automatycznie.

Save v65 → v66 migracja (centralna `_migrateV65toV66`): wreckLocation=null,
movementOrder.retreatFromBattleId=null, battleRec.location: string → object.

Ryzyka z design doca §10 zaadresowane: R1 budget, R2 cooldown, R3 wreckLocation
serialize, R4 MilitaryAI idle-materialized, R5 ×3 (nie ×4), R6 hysteresis,
R8 sync events order. R7 out-of-scope (empire↔empire → M3).

**Post-playtest fixes (§11 raportu):**
- `d7b27e2` — pursue/intercept release-from-orbit (§11.1, MOS jedna linia)
- `bc1e268` — Location schema unification (§11.2a, EAH + WarSystem × 4
  call-sites zapisujących → object; GameScene/WarSystem/InvasionSystem ×
  3 call-sites czytających → `BattleLocation.normalize()`)
- `23270dd` — VCS engagement via `vessel:orderCompleted` (§11.2b, dług
  techniczny). **Tymczasowy hook** — ProximitySystem emituje tylko przy
  0.5 AU (detection), VCS wymaga ≤ 0.15 AU (combat) → event nie dociera.
  MOS rozszerzony o `targetEntityId` w payload orderCompleted. VCS
  nasłuchuje z luźniejszym filter chain (decyzja B: pomija `_inCombatState`
  — jawna player-issued akcja). **Docelowy fix w M2b §11.5**:
  ProximitySystem dwuprogowy (detection + combat) + combatRangeEnter
  event — BLOCKER przed M2b patrol/escort auto-engage (R10).
- `4109a59` — Endurance drain freeze (§12.1, `FEATURES.enduranceDrainActive=false`).
  Kod drain + `PURSUE_DRAIN_MULT=3.0` + hysteresis events zostają w
  `_tickEndurance` — early return gdy flaga off. Unfreeze w M3 po pełnej
  reformie fuel/power cells. Velocity degradation przy endurance=0 (nowy
  bug z playtestu) **nie badany** — zamrożenie obchodzi problem dla
  nowych sesji.

**Known issues deferred do M2b/M3 (§12 raportu):**
- §12.1 Endurance drain frozen (M3 reforma fuel)
- §12.2 BUG#4 drift state po auto-retreat — `moveToPoint` nie dokuje do
  planety docelowej (M2b §11.6 O2, warto przed patrol/escort)
- §12.3 Deep-space wrak real-flow weryfikacja — offline 25/25 PASS, ale
  wszystkie bitwy M2a kończyły się retreat (M2b playtest)

### Milestone 4 P1 — Activation + Drift + Notifications (✅ ukończony, save v69, tag `m4-p1-complete`)
Plan: `C:\Users\Komputer\.claude\plans\clever-forging-ember.md` §P1+P1.5. Test flow: `docs/m4-p1-test-flow.md` (Rev 7). Commits: `b2be101` (implementacja) + `fa045d8` (playtest closure TEST 6/7 + firstSighting auto-slow).
- [x] **Feature flag flip** — movementOrders, fleetMaterialization, proximitySystem, vesselCombat, unifiedAggregator ON by default. enduranceDrainActive zostaje OFF do P4.
- [x] **MovementOrderSystem drift state** — po pursue/intercept na vessel target marker `driftIdle` (5y timer) → inline rescue teleport do najbliższej friendly planety (orbital speed problem). Player override w issueOrder czyści marker.
- [x] **AutoRetreatSystem fuel-aware fallback** — `bypassFuelCheck` retry przy `insufficient_fuel`, marker `lowFuelDrift` + emit `vessel:autoRetreatLowFuel`.
- [x] **UIManager M4 notifications** — 7 subskrypcji (empire:fleetMoved/Materialized, vessel:proximityEnter, battle:resolved, autoRetreatFailed/LowFuel, driftIdle, diplomacy:warDeclared) + LOG_COLORS intel/combat/diplomacy + auto-slow reuse + i18n PL/EN.
- [x] **VesselCombatSystem cooldown reform A+B+C** — drop team-up smearing (cooldown tylko dla strzelającej pary) + reset na combatRangeExit (dist ≥ 0.20 AU) + ENGAGEMENT_COOLDOWN_YEARS 2→1.
- [x] **P1.5 debug helpers** — `KOSMOS.debug.spawnMyVessel('hull_frigate', opts?)` + `simulateBattleRetreat(opts?)` + Power Test starting frigate + RightClickMenu warning ⚠ "Brak broni" dla pursue/intercept bez weapon module.
- [x] **Save v68→v69** — centralna migracja: lazy defaults `driftIdle`/`lowFuelDrift` per vessel. VesselManager.serialize/restore rozszerzony o oba pola + re-call `_indexExistingOrders` po vesselManager.restore (MOS konstruowany przed restore).
- [x] **Playtest closure** (`fa045d8`): firstSighting popup `_triggerAutoSlow` przed `time:pause` → po dismiss 1d/s, nie poprzedni multiplier. spawnEnemyAttack default etaYears 20.0 (1.5 AU/rok = player speedAU = realnie interceptable).

**Known issues deferred do M4 P2+:**
- 3D map LPM nie wybiera vessela (działa w FleetManagerOverlay) — P2 fix candidate.
- War declared powinno być popup modal nie log entry — defer P5.
- Pełna fizyka travel dla auto-return (zamiast inline teleport) — M5 backlog.
- Endurance unfreeze + presja fuel reform — P4.

### Milestone 4 P2 — Sensor + Ghosts + MiniMap + Wraki polish + Tab (✅ ukończony, save v70, tag `m4-p2-complete`)
Plan: `C:\Users\Komputer\.claude\plans\ok-zacznij-plan-p2-precious-turtle.md`.
Smoke tests: `tmp_m4_p2_smoke.mjs` (30/30 PASS) + `tmp_m4_p1_smoke.mjs` regression (33/33 PASS).
- [x] **P2-1 Sensor overlay** (commit `082b1cd`) — `ThreeRenderer._syncSensorOverlay`: cyan ring (`SENSOR_LOCK_AU=0.3`) wokół własnych vesseli + yellow ring (`ObservatorySystem.getVesselDetectionRangeAU`, clamp 35 AU dla Lv5∞) wokół kolonii. Mark&sweep + dispose 1:1 z `_syncPredictionCones`. Hooki: `physics:updated` + `vessel:positionUpdate` + `ui:sensorOverlayToggle`. BottomBar menu row "Radar" flipuje `uiPrefs.sensorOverlayVisible`.
- [x] **P2-2 Enemy ghosts** (commit `4c28815`) — `_applyVesselIntelVisibility` w ThreeRenderer: quality z `IntelSystem.getVesselContact` → rumor (positionLastKnown, opacity 0.3 × fade(yearsAgo/`RUMOR_FADE_YEARS=10`)) / contact (0.5) / detailed (1.0). Detection override: w radarze obserwatorium → bump z unknown/rumor do contact. `_applyVesselOpacity` cachuje `_origOpacity` per mat (Sprite + GLB). Hook: `intel:vesselContactChanged` + `vessel:detectionChanged` deleguje do helpera.
- [x] **P2-3 Galactic mini-map** (commit `d51184c`) — `src/ui/GalacticMiniMap.js` (Canvas overlay top-right za Outlinerem, ~260×280 px, klawisz `M`). Per-frame re-read galaxyData/EmpireRegistry/Diplomacy/Intel (bez cache, ETA live). Imperia filter `IntelSystem.isAtLeast(empireId, 'rumor')`. Hostility kolor: zielony 0-30 / żółty 31-70 / czerwony 71-100. Strzałki flot `empire.fleets[].destSystemId` z ETA label. Klik systemu → `minimap:systemClicked` (M5 hook).
- [x] **P2-4 Wraki polish** (commit `07b2c3d`) — OverlayManager keymap obsługuje `{id, opts}`. Klawisz `K` → fleet z `focusSection='wreck'` (drugie wciśnięcie re-applikuje focus, nie zamyka). FleetManagerOverlay.open(opts) → `_pendingFocusSection`, pierwszy draw oblicza scroll + auto-select pierwszy wrak + emit `vessel:focus` (kamera 3D fly-to deep-space wraki przez sprite.position w wreckLocation). Klik vessel → emit `vessel:focus`. Selected wrak row expand o 36px z battle report (`WarSystem.getBattleRecord(lastBattleId)`). `vessel.lastBattleId/lastBattleYear` stampowane przez VesselManager `battle:resolved` listener.
- [x] **P2-5 Tab cycling** (commit z P2-6) — `UIManager.cycleSelectedVessel(direction)`: filter `!isWreck && !isEnemyVessel`, sort `String(id).localeCompare`, wraparound + null-start (forward=first, backward=last). GameScene keydown: Tab/Shift+Tab z `preventDefault`, skip gdy input/textarea/contentEditable active.
- [x] **Save v69→v70** — `_migrateV69toV70` w `SaveMigration.js`: `uiPrefs.sensorOverlayVisible/miniMapVisible` defaults + per vessel `lastBattleId/lastBattleYear` null. SaveSystem serializuje `window.KOSMOS.uiPrefs`, GameScene restoruje po loadData. VesselManager serialize/restore round-trip lastBattleId/Year.

**Known issues deferred do M4 P3:**
- MiniMap UX (tooltipy hover na empire/strzałki, label nazwy systemu) — backlog.
- MiniMap pokazuje tylko inter-system fleet movement (galaktyka), nie lokalne vessele w sys_home (główna mapa 3D pełni tę rolę).
- 3D map LPM nadal nie wybiera vessela (Tab cycling jako alternatywa).

### Milestone 4 P3 — Tick-based Deep-Space Combat (✅ ukończony, save v71, tag `m4-p3-complete`)
Plan: `C:\Users\Komputer\.claude\plans\ok-stworz-plan-p3-agile-haven.md` + staging file `C:\Users\Komputer\.claude\plans\rozpoczynamy-implementacje-plan-pod-silly-gem.md`. 8 atomic commitów pogrupowanych w 4 etapy (tagi pośrednie: `m4-p3a-foundation`, `m4-p3b-combat`, `m4-p3c-ux`, finalny `m4-p3-complete`).
Smoke tests: `tmp_m4_p3_smoke.mjs` (51/51 PASS consolidated) + per-commit `tmp_m4_p3_{1..7}_smoke.mjs` + regression `tmp_m4_p1` 33/33, `tmp_m4_p2` 30/30.
- [x] **P3-1 weapon rangeAU + tech multipliers** (commit `06e803d`) — ShipModulesData: weapon_laser/kinetic/missile dostają `rangeAU` (0.05/0.15/0.30) + `fireCooldownYears` (0.3/0.5/1.0) + `category`. Legacy `range` zachowane (BattleSystem orbital). TechData: 7 nowych techów (defense): weapon_optics/kinetic_targeting/missile_guidance_ai/range_finder_array + advanced_sensors_1/2/3 z effect schema `{type:'multiplier', category, value}`. TechSystem.getMultiplier(category): generyczny iterator. GameConfig: WEAPON_*_AU + COMBAT_DISENGAGE_AU stałe. i18n PL+EN 14 nowych wpisów.
- [x] **P3-2 DSCS skeleton + VCS delegation** (commit `59701be`) — NEW `src/systems/DeepSpaceCombatSystem.js` (~550 LoC): handleCombatRangeEnter dispatch (startEngagement | _joinEncounter), startEngagement (team-up gather kopia z VCS, build EncounterState z per-vessel vesselStates, stationary AI: enemy.mission=null), _joinEncounter (Opcja B reinforcement z joinedAtRound), _tickEncounter STUB (P3-3 dopisuje), _finalizeBattle pełna semantyka (per-vessel wreck always + side-level wreck żywych przegranych + emit battle:resolved). VCS delegacja w `_handleCombatRangeEnter` przez `FEATURES.m4DeepSpaceCombat`. VesselManager._tick wpięcie DSCS._tick (po proximity, przed MOS). GameScene `_ensureDeepSpaceCombatSystem` + devtools `KOSMOS.debug.enableDeepSpaceCombat`.
- [x] **P3-3 per-tick fire exchange + engage target priority** (commit `1d06141`) — _tickEncounter pełna logika: cooldown decrement, range gating, target picking (Opcja D engage priority + closest fallback), roll hit (tracking × (1-evasion)), damage cascade (shield → armor → hp), shield regen, timeline events. mulberry32 seed=seedBase+currentRound (deterministyczne). Tech mult per category + all. FEATURES.m4DeepSpaceCombat flip false → true (combat działa end-to-end).
- [x] **P3-4 battle conclude** (commit `1898aae`) — _checkEndConditions: kill (sideX hp=0 → winner=Y), retreat threshold dynamic (`pctX ≤ RETREAT_THRESHOLD=0.2 × sideAggregateHpStart AND pctX < pctY`), time-out MAX_ROUNDS=30 (highest HP wins). _sideAggregateHpStart liczone z reinforcement (Opcja B — większa siła = więcej buffera). _handleCombatRangeExit: gdy wszyscy żywi jednej strony > COMBAT_DISENGAGE_AU od midpoint → draw, no wreck żywych.
- [x] **P3-5 engage order + PPM** (commit `1bf95c2`) — ORDER_TYPES.engage + validateOrder (wymaga targetEntityId). MovementOrderSystem `_issueEngage` (reject: no_target/self/wreck/not_vessel/no_weapons) + `_tickEngageOrder` (kiting: dist > optimal × 1.05 → toward, < × 0.95 → away, hold; cancel target_lost/target_out_of_range). `_computeMaxWeaponRangeAU` helper z tech mult. RightClickMenuOptions.enemyVessel: nowa opcja `{id:'engage', icon:'⊗', labelPL:'Zaangażuj'}` + warning no_weapons. OrderDispatcher.buildOrderSpec: case 'engage'.
- [x] **P3-6 BattleView3D adapter** (commit `906e451`) — `_playTurn` z format detection (`turn.events` array → 'dscs', inaczej 'legacy'). `_playTurnDSCS` iteruje events, per event `_spawnEventVolley` z color wg category (short=cyan/medium=amber/long=red), opacity 0.9 hit vs 0.4 miss, flash sphere tylko przy hit. `_guessSideFromVesselId` via battleData.result.participantA/B.vesselIds lookup.
- [x] **P3-7 ProximitySystem dynamic detection** (commit `9d627bd`) — `_checkPair` używa per-pair threshold `enterAU = max(_getDetectionRangeAU(v1), _getDetectionRangeAU(v2))`, `exitAU = enterAU × DETECTION_HYSTERESIS=1.2`. `_getDetectionRangeAU` per vessel: player z `TechSystem.getMultiplier('sensor_range')`, empire bez tech → BASE 0.5 (P5 doda empire tech state). COMBAT_ENGAGEMENT_AU/EXIT_AU pozostają hardcoded (fizyczne ograniczenie engagement, nie sensor).
- [x] **P3-8 migration v70→v71 + consolidated smoke + docs** (this commit) — SaveMigration `_migrateV70toV71`: deepSpaceEngagements default `{}` + vessel.movementOrder.engageTargetId lazy null. SaveSystem._serializeCiv4x dodaje `deepSpaceEngagements: dscs.serialize()`. DSCS.serialize/restore (vesselStates Map ↔ object, encounter `isActive=true` only). GameScene restore po VesselManager. `tmp_m4_p3_smoke.mjs` 51/51 PASS (T1-T11). CLAUDE.md + MEMORY.md + `memory/m4-p3-complete.md` update.

**M4 P3 polish 2026-05-18 — retreat semantics redesign:**
- **Enemy AI auto-retreat:** HP comparison `pctEnemy ≤ 0.2 AND pctEnemy < pctPlayer × 0.5` (krytycznie nisko HP I clearly losing damage exchange). Bez tego warunku enemy wycofywał się przy 19% HP nawet wygrywając.
- **Player NIE ma auto-retreat** — manual only. Dwie ścieżki: (a) nowy `ORDER_TYPES.retreat` (PPM "Wycofaj się z bitwy" na własny vessel w combat → auto-pick najbliższej friendly planet via `AutoRetreatSystem._findNearestFriendlyPlanet` + moveToPoint + `_retreatFromCombat=true` marker + emit `vessel:retreatIssued`); (b) implicit fallback: cancel engage + moveToPoint poza COMBAT_DISENGAGE_AU (0.50 AU).
- **`_handleCombatRangeExit` identyfikuje retreating side** — strona z WSZYSTKIMI alive members poza disengage radius = uciekająca (LOSS, retreated='A'|'B'). Oba sides poza = mutual disengagement (draw, retreated=null).
- **AutoRetreatSystem skip player side** — gdy `result.participantX.empireId === 'player'`, system returns bez akcji (gracz sam zarządza moveToPoint po retreat). Enemy AI dalej dostaje auto moveToPoint do friendly territory.
- Pliki: `DeepSpaceCombatSystem.js`, `AutoRetreatSystem.js`, `MovementOrderSystem.js`, `MovementOrderTypes.js`, `OrderDispatcher.js`, `RightClickMenuOptions.js`, `UIManager.js`, `pl/en.js`. Bez save migration.
- Smoke: `tmp_m4_p3_smoke.mjs` 61/61 PASS (rewrite T6 enemy retreat + 4 nowe case'y w T6 + 2 manual retreat test cases w T7).

**Combat tempo + celność + feedback rozkazu grupowego (2026-07-26, bez migracji save):**
- **Tempo walki = STAŁE tempo realnego czasu** (`DeepSpaceCombatSystem._tick`): rundy odpięte od
  `civDeltaYears`. Wcześniej runda bramkowana akumulatorem `CIV_PER_ROUND=0.3 civY` → przy 1 dzień/s
  (domyślna prędkość ORAZ cel auto-slow przy starciu) ~9 SEKUND realnych na rundę → do ~4.5 min na bitwę.
  Teraz `_lastRoundMs` + `ROUND_INTERVAL_MS=110` (~9 rund/s) niezależnie od prędkości gry; `_nowMs()`
  (performance.now / Date.now fallback). `MAX_ROUNDS_PER_TICK 1→4` (catch-up). `CIV_PER_ROUND` ZOSTAJE jako
  krok symulacji/rundę (cooldowny broni w rundach: laser co 2, kinetyk co 3, rakieta co 5). Pacing wizualny —
  NIE serializowany (save/load resetuje zegar); wynik deterministyczny (liczba rund + seed).
- **Śmiertelność** `DAMAGE_MULT=3.0` (DSCS-local, nie rusza orbital BattleSystem) — bazowe obrażenia (5/8/12)
  vs HP kadłubów (120-350) sprawiały, że bitwa NIGDY nie kończyła się zabiciem, zawsze time-out po `MAX_ROUNDS`.
  `MAX_ROUNDS 30→20`. Teraz starcia rozstrzygają się przez zniszczenie w kilku-kilkunastu rundach (~1-2 s real).
- **Celność** `HIT_CHANCE_MULT=1.5` + floor 0.05→0.10 (`_tickEncounter`) — kinetyk 0.6 / rakieta 0.5 ×
  (1−evasion) dawało ~40-55% trafień (przeważnie pudła); teraz ~70-90% (laser clampuje 0.95), evasion dalej
  różnicuje cele. Walidacja headless: 13 rund do killa (cap 20), celność 80%.
- **Feedback rozkazu grupowego** (fix „nie wiem, czemu 1 statek nie poleciał"): fan-out rozkazu ataku do
  wielu statków (multi-select `RightClickMenu._handleOptionClick` ORAZ flota `fleet:orderIssued` w UIManager)
  CICHO pomijał statki odrzucone przez `MovementOrderSystem` (engage bramkuje na uzbrojeniu → `no_weapons`;
  też `vessel_immobilized`/`target_already_in_range`), logując TYLKO gdy ŻADEN nie ruszył. Teraz KAŻDY pominięty
  statek raportowany z nazwą + powodem (`vessel.orderPartial`/`orderNoneMoved` + brakujące `vessel.reason*` PL+EN).
  Root: statek bez modułu broni nie może „Zaangażuj" (jedyny rozkaz ataku bramkowany bronią; „Ścigaj" nie jest).

**Known issues deferred do M4 P4:**
- Range bands cyan ring wokół player vessel w BattleView3D cinematic (range gating feedback) — backlog P6.
- Distance label HUD per round w cinematic — backlog P6.
- Empire tech state (per-empire sensor + weapon mult) — P5 wymóg dla AI kiting doctrine + obcy sensor scale.
- Multi-engage same target offset radial (0/120/240°) — opcjonalny polish (R10 z planu).
- Skip cinematic checkbox z localStorage persist — opcjonalne (skip per-bitwę wystarcza).

### Milestone 1 — Targeting Foundation (✅ ukończony, save v65, tag `m1-complete`)
Design: `docs/design/milestone-1-targeting-foundation.md` + Appendix C (implementation notes + playtest bugfixes). Podsumowanie: `docs/design/milestone-1-summary.md`.
- [x] **MovementOrder** (`src/systems/MovementOrderSystem.js`) — moveToPoint (mission-based), pursue/intercept (MOS-controlled, linear intercept math), patrol/escort stub. Feature flag OFF-by-default.
- [x] **Shadow fleet materialization** (`src/systems/EmpireFleetMaterializer.js` + `src/data/FleetCompositionPolicy.js`) — wrogie floty strength→vessels gdy leci na sys_home; full consumption; retreat blocked dla materialized. Feature flag OFF-by-default.
- [x] **Endurance** — stamina operacyjna (drain/regen per civYear), hysteresis events, stub pod reformę fuel w M2.
- [x] **Velocity tracking** — per-tick velocity w AU/civYear (derived, nie serializowane).
- [x] **mission.suspended** — MOS suspenduje oryginalną mission przez `vessel._suspendedMission` snapshot, resume po orderCompleted/Cancelled.
- [x] **Save v64→v65** — centralna migracja w SaveMigration, wszystkie nowe pola z sensownymi defaults.
- [x] **Playtest bugfixes** (tag `m1-complete`): THREAT_RADIUS 0.05→0.15 AU + issue-time reject `target_already_in_range`; init `lastTargetPos` fallback pattern; `enableTargetingTrace` flag + 6 call points; deep-space drift state udokumentowany.

---

