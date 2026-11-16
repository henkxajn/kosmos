# Architecture reference — stack, rendering, 4X dependency map, EventBus events, save protocol and save files (moved from CLAUDE.md)
> Moved verbatim from CLAUDE.md on 2026-11-16 (source lines 22–134, 163–480, 3008–3123). Reference material accumulated over many slices — check file:line details, flag names and event consumers against the code before relying on them. Kept in the original language (Polish).

<!-- CLAUDE.md L22–134 -->
## Technologia

- **Three.js** (przez CDN, bez npm) — renderer 3D warstwy symulacyjnej (zastąpił Phaser 3)
- **Canvas 2D** (natywny) — warstwa UI (UIManager) i mapa planety (ColonyOverlay; PlanetScene.js wciąż instancjonowany w `GameScene` ale nigdy nie otwierany — kandydat do usunięcia)
- JavaScript ES Modules (natywne, bez bundlera)
- **Node.js** (v24) — generator tekstur planet (`generate-planets.js` + `lib/`), zależności: `sharp`, `simplex-noise`
- Grę otwierać przez Live Server w VS Code (brak bundlera)
- Zapis: localStorage (klucz `kosmos_save_v1`), wersja save: **v101** (patrz `SaveMigration.CURRENT_VERSION` — **to jest jedyne źródło prawdy**; ten nagłówek stał na v99 przez trzy bumpy, więc przy każdej migracji sprawdź stałą, nie ten wiersz)

### Architektura renderingu (3D + 2D overlay)
```
index.html
  #three-canvas   → ThreeRenderer (Three.js WebGL) — gwiazda, planety, księżyce, orbity
  #ui-canvas      → UIManager (Canvas 2D)           — panel info, paski czasu, EventLog
  #planet-canvas  → (legacy PlanetScene — instancjonowany w GameScene ale .open/.show nigdy nie wołane; mapa planety idzie przez ColonyOverlay na #ui-canvas)
  #event-layer    → przezroczysta warstwa zdarzeń myszy (z-index nad wszystkim)

TitleScene (src/scenes/TitleScene.js):
  Canvas starfield + mgławica + mini-słońce + hero planet (iron_02 PBR tekstura)
  HTML overlay: logo KOSMOS, przyciski (Nowa gra / Kontynuuj / Power Test)
  CSS atmospheric layers + gradient tło

generate-planets.js (CLI, Node.js) → assets/planet-textures/*.png
  lib/noise.js     → SimplexNoise3D, Worley, fBm, ridgedFbm, turbulence, domainWarp
  lib/terrain.js   → heightmap pipeline (10 faz: fBm → plates → ridges → cracks → warp → craters → erosion)
  lib/craters.js   → fizyczne kratery (4 klasy wielkości, central peak, ejecta rays)
  lib/erosion.js   → erozja hydrauliczna (droplet-based) + termiczna (talus angle)
  lib/colors.js    → gradient gamma-correct, Worley jitter, polar ice, lava flow
  lib/maps.js      → normal, roughness, AO, specular, emission, clouds, night lights
  lib/postprocess.js → sharp (unsharp mask, gamma) + fallback PNG encoder
```

**ThreeRenderer** (`src/renderer/ThreeRenderer.js`):
- Planety rocky/ice/volcanic: pre-generowane tekstury PNG (diffuse + normal + roughness) → `MeshStandardMaterial` (PBR)
- Planety gas: proceduralne pasma (canvas) → `MeshPhongMaterial`
- `resolveTextureType(planet)` — mapuje planetType + temperatureK na typ tekstury generatora
- `loadPlanetTextures(texType, variant)` — TextureLoader + `_textureCache` (współdzielone instancje)
- Wariant deterministyczny: `hashCode(planet.id) % 3 + 1` → `"01"/"02"/"03"`
- Księżyce: małe sfery w scenie głównej + RingGeometry jako child grupy planety
- OrbitLine: TubeGeometry po punktach Keplera
- `initSystem(star, planets, planetesimals, moons)` — buduje scenę przy starcie
- `physics:updated { planets, star, moons }` → `_syncPlanetMeshes()` — synchronizuje pozycje

**ThreeCameraController** (`src/renderer/ThreeCameraController.js`):
- Sferyczny orbit: LPM drag = obrót, scroll = zoom (podłoga `minDist` – 450 j.), Home = reset kamery — domyślny
  widok układu (`ThreeRenderer.resetToSystemView`, kadr `frameSystem`; ARKUSZ UI U1-1); H w trybie cywilizacji = Kolonia
- `wasDrag` — flaga odróżniająca drag od kliknięcia
- `_minDist` — podłoga z fokusu: 0,3 (domyślnie), 0,15 (księżyc), 0,05 (statek), 0,005 (stacja / „Obserwuj”)
- `setMinDist(val)` — wywoływany przez ThreeRenderer przy body:selected/deselected (sam próg — kamera stoi)
- `minDist` (getter, ARKUSZ UI 501) — podłoga EFEKTYWNA: cel kamery w strefie `STAR_ZONE_MULT` × R (1,3) od środka
  gwiazdy ⇒ max(`_minDist`, `STAR_FLOOR_MULT` × R) (2,2 — cała tarcza w kadrze); R = `_sunCoreRadius`
  (`setStarCoreRadius` z `ThreeRenderer`); kółko (`wheelZoom`), suwak zoomu i auto-zoom (`setTargetDist` / `snapDist`
  / `flyTo`) klamrują do `minDist`
- Adaptacyjna czułość scrolla: dist<5→0.01, dist<20→0.02, else→0.05

---

## Architektura

### Wzorzec ECS + EventBus (warstwa symulacyjna)
- **Encja** = ciało niebieskie (Star, Planet, Moon, Asteroid, Comet, Planetoid)
- **Komponenty** = dane encji: `orbital`, `physics`, `atmosphere`, `composition`, `lifeScore`
- **Systemy** = logika: PhysicsSystem, LifeSystem, GravitySystem, StabilitySystem…
- **EventBus** = JEDYNA dozwolona komunikacja między systemami

### Globalny service locator (warstwa 4X)
`window.KOSMOS` — referencje do wszystkich systemów 4X:
```
window.KOSMOS = {
  game, scenario,     // 'civilization' (aktywny) | 'generator' (zamrożony) | 'power_test'
  civMode,          // bool — czy gracz przejął cywilizację
  homePlanet,       // planeta gracza
  resourceSystem,   // ResourceSystem
  civSystem,        // CivilizationSystem
  buildingSystem,   // BuildingSystem
  techSystem,       // TechSystem
  vesselManager,    // VesselManager — rejestr statków (pozycje, paliwo, misje)
  civilianTradeSystem, // CivilianTradeSystem — auto-routing towarów, Kredyty (Kr)
  savedData,        // dane z localStorage (BootScene → GameScene)
}
```

### Zasada komunikacji
```
ColonyOverlay → EventBus.emit('planet:buildRequest') → BuildingSystem._build()
BuildingSystem → EventBus.emit('resource:registerProducer') → ResourceSystem
BuildingSystem → EventBus.emit('planet:buildResult') → ColonyOverlay (UI update)
```
NIE importuj systemów bezpośrednio między sobą.

### Silent notifications (bez pauzy gry)
`NotificationCenter` (`src/systems/NotificationCenter.js`) — router dla eventów
które NIE powinny pauzować gry ani pokazywać auto-popup. Subskrybuje silent
events (`expedition:reconProgress`, `expedition:reconComplete`,
`observatory:discovered`), przechowuje w `_items[]`, emituje `notify:listChanged`.
BottomBar pokazuje ikonę 🔔 z badge count, klik → `NotificationDropdown` (DOM
overlay) z auto-grupowaniem po typie. Klik wiersza → `notify:openDetail` →
`MissionEventModal.queueMissionEvent(cfg, {noPause:true})` (detail bez pauzy).
Equivalentny EventLog entry idzie przez `eventLogSystem.push()` (historia).
Nowe kategorie (intel rumor, dyplomacja) — dodać `_handleX` w NotificationCenter
+ ikonę grupy w `NotificationDropdown.GROUP_ICONS`.

### GameState (nowe domeny — wojna/dyplomacja/AI obcych)
Dla NOWYCH domen (empires, intel, diplomacy, wars, battles, invasions) używamy
reactive store `src/core/GameState.js` jako jedynego źródła prawdy. Mutacje
wyłącznie przez **intent methods** na systemach-właścicielach (nie raw `set()`
z UI). Audit trail AI: `src/core/DebugLog.js` (ring buffer eventów). Istniejące
systemy (ColonyManager, BuildingSystem, FactionSystem itd.) pozostają nietknięte
i komunikują się jak dotąd (EventBus + `window.KOSMOS`). Szczegóły:
`docs/plan-war-diplomacy-ai.md`.

---

<!-- CLAUDE.md L163–480 -->
## Konwencje kodu

- **Komentarze po POLSKU**
- **Nazwy zmiennych i funkcji po angielsku** (camelCase)
- **Każda jednostka fizyczna oznaczona** w komentarzu: `// AU`, `// lata`, `// masy słoneczne`
- Dane (stałe obiektów) — `WIELKIE_LITERY`
- Klasy — `PascalCase`
- Prywatne metody — `_prefixUnderscore`
- **Dwujęzyczność (PL + EN) — ZAWSZE**: każdy tekst widoczny w UI musi istnieć w obu wersjach językowych (polskiej i angielskiej). Dotyczy: nazw budynków (`namePL`/`nameEN`), technologii, surowców, komunikatów, tooltipów, etykiet przycisków, opisów w panelach. Przy dodawaniu nowej funkcji — od razu tworzyć oba warianty językowe.

---

## Pliki krytyczne — nie modyfikuj bez planu

| Plik | Dlaczego krytyczny |
|------|-------------------|
| `src/core/EventBus.js` | Serce komunikacji — błąd tu psuje wszystko |
| `src/core/EntityManager.js` | Rejestr encji — modyfikacja rozbija save/restore |
| `src/systems/PhysicsSystem.js` | Prawa Keplera + kolizje — fizyka orbitalna |
| `src/config/GameConfig.js` | Globalne stałe gry + `FEATURES` flagi (M4 P1: M1+M2a flagi flip ON — movementOrders, fleetMaterialization, proximitySystem, vesselCombat, unifiedAggregator; enduranceDrainActive zostaje OFF do M4 P4; +m4DriftFix/m4Notifications/m4FuelAwareRetreat ON; M4 P2: +m4SensorOverlay/m4EnemyGhosts/m4MiniMap ON + SENSOR_LOCK_AU=0.3 + RUMOR_FADE_YEARS=10; M4 P3: +m4DeepSpaceCombat ON + WEAPON_SHORT_AU=0.05/WEAPON_MED_AU=0.15/WEAPON_LONG_AU=0.30 + COMBAT_DISENGAGE_AU=0.50) |
| `src/map/HexGrid.js` | Matematyka hex cube coordinates |
| `src/systems/SaveMigration.js` | Łańcuch migracji save'ów — centralny punkt, nie rozpraszaj |
| `generate-planets.js` + `lib/` | Generator tekstur planet — 9 modułów, pipeline heightmap→color→PBR |
| `assets/planet-textures/` | Pre-generowane tekstury PNG — ładowane przez ThreeRenderer |

---

## Pliki kluczowe 4X (mapa zależności)

```
GameScene.create()
  └─ ResourceSystem         ← surowce (minerals/energy/organics/water/research)
  └─ TechSystem(resSys)     ← drzewo tech, mnożniki produkcji
  └─ CivilizationSystem({}, techSys)  ← POPy, morale, epoki, consumption
  └─ BuildingSystem(resSys, civSys, techSys)  ← budowa (wymaga POP), demolish, rateReapply
  └─ CivilianTradeSystem(colMgr)  ← auto-routing towarów, Kredyty (Kr)

ColonyOverlay  (src/ui/ColonyOverlay.js — realna mapa planety 2D hex tapered)
  └─ importuje: HexGrid, PlanetMapGenerator, BUILDINGS, TERRAIN_TYPES, TerrainTextures
  └─ nasłuchuje: resource:changed, planet:buildResult, planet:demolishResult,
                 planet:upgradeResult, planet:constructionProgress, tech:researched,
                 vessel:awayTeamLanding, groundUnit:select
  └─ emituje:   planet:buildRequest, planet:demolishRequest, tech:researchRequest
  └─ UWAGA: src/scenes/PlanetScene.js — legacy, instancjonowany w GameScene ale .open/.show nigdy nie wołane, nie używać

DistanceUtils (src/utils/DistanceUtils.js)
  └─ euclideanAU(a, b)          ← dynamiczna odległość z physics.x/y → AU
  └─ orbitalAU(a, b)            ← stabilna |a.orbital.a - b.orbital.a| → AU
  └─ fromHomePlanetAU(entity)   ← skrót euclidean od homePlanet
  └─ orbitalFromHomeAU(entity)  ← skrót orbital od homePlanet (zasięg statków)

SaveSystem._serializeCiv4x()
  └─ czyta: window.KOSMOS.{resourceSystem, civSystem, buildingSystem, techSystem, expeditionSystem, vesselManager}
  └─ zapisuje: resources, civ, buildings (z baseRates + popCost!), techs, expeditions, vesselManager

MovementOrderSystem (src/systems/MovementOrderSystem.js) — M1, feature flag OFF
  └─ issueOrder(vesselId, spec) → { ok, reason?, orderId? }
  └─ cancelOrder(vesselId, reason) → bool
  └─ getOrder(vesselId), listActive()
  └─ _tick(civDy) — pursue/intercept zarządzają pozycją bezpośrednio; moveToPoint przez mission.
  └─ Typy: moveToPoint, pursue, intercept (pełne) + patrol, escort (stub M2).
  └─ Devtools: KOSMOS.debug.{enableMovementOrders, issueOrder, cancelOrder, listOrders, enableTargetingTrace}.

EmpireFleetMaterializer (src/systems/EmpireFleetMaterializer.js) — M1, feature flag OFF
  └─ materializeFleet(empireId, fleetId) — strength → vessels (via FleetCompositionPolicy)
  └─ dematerializeFleet(...) — cleanup przy full loss
  └─ Trigger: empire:fleetMoved gdy destSystemId='sys_home' + ETA ≤ 2 civYears
  └─ Budżety: MAX_MATERIALIZE_PER_TICK=2, MAX_TOTAL_MATERIALIZED_VESSELS=40
  └─ Devtools: KOSMOS.debug.{enableFleetMaterialization, materializeFleet}.

ProximitySystem (src/systems/ProximitySystem.js) — M2a, feature flag OFF
  └─ _tick(civDy) — per-tick detection par vessel↔vessel (O(n²/2) z rotującym offsetem)
  └─ Hysteresis: enter <0.5 AU, exit ≥0.6 AU (nie miga na granicy)
  └─ Budget MAX_PAIRS_PER_TICK=500 — pełny skan 100 vesseli w ~10 ticków
  └─ Emituje: vessel:proximityEnter {vesselAId, vesselBId, distanceAU, sameFaction}, vessel:proximityExit
  └─ Cleanup aktywnych par na vessel:wrecked (zapobiega false-positive reuse ID)
  └─ Devtools: KOSMOS.debug.{enableProximity, disableProximity}

VesselCombatSystem (src/systems/VesselCombatSystem.js) — M2a, feature flag OFF
  └─ Event-driven na vessel:proximityEnter (dist ≤ 0.15 AU, !sameFaction)
  └─ Team-up by ownerEmpireId — M2a tylko player ↔ highest-hostility empire
  └─ BattleSystem.resolveBattle z location={systemId, planetId:null, point:{x,y}}
  └─ Wreck placement przez EnemyAttackHandler._turnIntoWreck(v, midpoint, year)
  └─ Cooldown ENGAGEMENT_COOLDOWN_YEARS=2 na parę (zapobiega spam przy draw/retreat)
  └─ Devtools: KOSMOS.debug.{enableVesselCombat, disableVesselCombat, resolveDeepSpaceBattle}

AutoRetreatSystem (src/systems/AutoRetreatSystem.js) — M2a, aktywny z vesselCombat
  └─ Event-driven na battle:resolved (retreated='A'|'B')
  └─ _findNearestFriendlyPlanet: preferencja full colonies > outposts > wrak
  └─ issueOrder(moveToPoint, targetPoint=planet) przez MovementOrderSystem
  └─ Marker vessel.movementOrder.retreatFromBattleId = battleId
  └─ Fallback: brak friendly planet → delegacja do EAH._turnIntoWreck z wreckLocation=current pos
  └─ Emituje: vessel:autoRetreatIssued, vessel:autoRetreatFailed

Unified aggregator (WarSystem._fleetArrived) — M2a, feature flag unifiedAggregator OFF
  └─ Gdy FEATURES.unifiedAggregator=true I fleet.materializationState='full' I materializedVesselIds[]:
      - SKIP abstract battle (strength=0 byłoby duplikacją)
      - destSystemId/etaYear=null (flota zaparkowana jako materialized)
      - konkretne vessele walczą przez EnemyAttackHandler lub VesselCombatSystem
  └─ Rozwiązuje §P2/P3 z m2-reconnaissance.md (double-hit materialized fleet)

EnemyAttackHandler._turnIntoWreck — M2a rozszerzony kontrakt (commit 5)
  └─ arg2 dockedAtOrPoint:
      string → planetId (M1 legacy orbital graveyard path)
      {x, y} → deep-space point (wrak zamrożony, wreckLocation serializowane)
      null   → smart fallback: dockedAt istnieje→orbital, inaczej freeze w pozycji
  └─ Expose przez window.KOSMOS.enemyAttackHandler (commit 5 dodał)

Endurance drain multiplier (VesselManager._tickEndurance) — M2a commit 8
  └─ PURSUE_DRAIN_MULT=3.0 gdy movementOrder.type ∈ ('pursue','intercept')
  └─ Wywoływany dla state='in_transit' LUB isPursuing (pursue orbiting też drainuje)
  └─ Presja zasobowa — hard-stop na endurance=0 → M3

StationSystem (src/systems/StationSystem.js) — S3.3b-S2, Wariant A (instant materialize)
  └─ createStation(bodyId, opts) → Station (type='station') + orbital.assignOrbit(bodyId, id, 'station')
  └─ destroyStation(id), getStationsAt(bodyId), serialize/restore (encje w civ4x.stationSystem; orbita w civ4x.orbitalSpace)
  └─ Encja: src/entities/Station.js (extends CelestialBody, orbital=null, x/y STATYCZNE — anchored GEO; depot=StationDepot magazyn ogólny S3.3b-S3b)
  └─ Dane: src/data/StationData.js (STATIONS.orbital_station: cost Fe/Ti/Cu/Si + 7 commodities; buildTime placeholder; stationTotalCost())
  └─ Pending (ColonyManager): addPendingStationOrder/cancel/get + _tickPendingStationOrders (canAfford→spend→createStation; no-refund pre-check ciała)
  └─ Render: ThreeRenderer._stations Map + _addStationMesh/_removeStationMesh/_tickOrbitingStations (anchored GEO, bez rotacji; 9f instant-position; S3.3b-S4a: GLB zamiast placeholdera — niżej)
  └─ Devtools: KOSMOS.debug.{spawnStation(bodyId?, opts?), queueStationOrder(target?, costOverride?), destroyStation(id)}
  └─ S3.3b-S3b — HUB handlowy (save v85): StationDepot (src/entities/StationDepot.js) façade resSys-podobny
     (inventory Map + receive/spend/getAmount, BEZ filtra = dowolne towary, sink I source; NIE ResourceSystem reuse).
     resolveTransferStore (src/utils/TransferStore.js: kolonia.resourceSystem | station.depot) + VesselManager.dockAtTarget
     (stacja→dockAtStation). Pętla cargo cel/źródło=stacja: MissionSystem _processTransportArrival/_continueTransportLoop/
     _bestEffortLoad(col→STORE)/_tryResumeLoop + **_findTarget zwraca stację-WIDOK z pozycją LIVE bodyId→body** (encja
     x/y statyczne; root bug#1: brak 'station' → pętla nie dispatchowała outbound). refuelAutomatically (Vessel,
     default-true, restore ?? true=bez migracji; gate _tickRefueling `=== false`) + manualRefuel + przycisk Refuel/toggle
     (_drawActions). Tactical: render map_station (offset bodyScale) + Fix A priorytet handleClick (ciało/stacja>statek
     w step=select) + Fix B guard map_vessel. _getValidTargets: stacje GRACZA tylko (cross-empire→S3.4/S3.5).
  └─ S3.3b-S4a — render GLB (render-only): assets/models/stations/Ring_Station.glb (~16 MB, glTF2 bez
     Draco/KTX2) zastępuje placeholder. _addStationMesh: placeholder sfera+torus NATYCHMIAST → async
     _loadShipModel (reuse vessel cache) + retry-once → _swapStationModel podmienia children Group
     (clone→scale→Box3 center→rot.x π/2 płasko→tint→add; placeholder dispose; fallback=placeholder zostaje).
     Consts STATION_MODEL_MAP/SCALE(0.015)/MODEL_ROT_X/EMISSIVE_INTENSITY(1.0)/TINT(0x8899bb). Tint=mnożnik
     baseColor na KLONIE materiału (template czysty, emissive/okna nietknięte); entry.tintedMats →
     _removeStationMesh dispose klonu (tekstury współdzielone nie ruszane). Focus kamery: klik→station:focus
     (mirror vessel:focus, BEZ selekcji) — _focusStationId + raycast handleClick PRZED ciałami
     (userData.stationId walk-up) + śledzenie _updateCameraFocus (focusOnSmooth). NoToneMapping bez zmian.
     Bez migracji save. Selekcja/panel/klik 3D = S3.3b-S4-2 (osobny sub-slice).
  └─ S3.3b-S4-1 (a9dec31+) — orbital_construction tech (space tier 3, ←space_mining, 350rp) +
     data-driven gate (StationData.requires + ColonyManager early reject + station:orderRejected,
     kontrakt string|null zachowany) + ColonyOverlay [🛰 Station] header button (locked/enabled) +
     station build dialog (target: statyczna linia / picker przy księżycach, cost, queue, cancel) +
     i18n PL+EN. Fix: stationDialogBg _addHit na KOŃCU (priorytet przycisków nad tłem; _hitTest=find).
     Live-gate PASS. Bez migracji save.
  └─ S3.3b-S4-2 (S4-2) — selekcja + pływający panel info stacji (klik 3D). ThreeRenderer.handleClick
     dual-emit station:selected OBOK station:focus (kamera bez zmian) + getStationScreenPosition
     (anchor px, mirror getScreenPosition, null gdy mesh za kamerą). NEW StationPanel.js — panel
     canvas NON-EXCLUSIVE (wzór CombatHUD: trzymany w UIManager, rysowany PO overlayManager, coexist
     z colony): self-subscribe station:selected/destroyed/body:deselected; sekcje nazwa+właściciel,
     orbita/tier/rok, depot (surowce vs towary), handel (live snapshot), moduły placeholder, rename
     (showRenameModal → station:rename → StationSystem._renameStation); anchor do
     getStationScreenPosition + clamp do map-area; tło _addHit na KOŃCU (S4-1 gotcha). NEW
     StationPanelLogic.js — czyste helpery classifyStationDepot (COMMODITIES split) +
     gatherStationTraders (docked z VesselManager + inbound/outbound z MissionSystem.getActive
     targetId/loopTargetId). UIManager: import+hold+handleClick(PRZED overlayManager)+draw(PO)+
     handleMouseMove. i18n PL+EN station.* (panel). Bugfixy: (A1) SpaceportCheck.hasSpaceportAt
     stacja→port (wszystkie ścieżki launch); (A2) MissionSystem._checkPadForVessel station origin
     (isStationId) → pass; (B) ThreeRenderer.getAllVisibleLabels +stacje w trybie CTRL (#8fb8ff).
     Live-gate PASS. Bez migracji save (v85). Smoke tmp_s4_2 25/25 + S4-1 regr 23/23.
  └─ S3.3b-S4-3 (S4-3) — stacje jako zakładki w EconomyOverlay (produkcja). Fasada OVERLAY-LOCAL:
     _playerStationFacades/_getTabEntities/_resolveEntity (NIGDY ColonyManager.getAllColonies — ~40
     konsumentów: trade/war/AI/observatory). Depot jako resourceSystem (inventory renderuje, stawki
     puste — depot bez _deltaTracker/_inventoryPerYear, energy 0). 3 array sites→_getTabEntities
     (tooltip/_drawLeft/_drawFactoriesTab), 2 by-id→_resolveEntity (tooltip+_drawLeft selCol; zwraca
     FASADĘ nie surową encję — _drawLeft czyta .resourceSystem); flows+right alerts zostają colony-only.
     🛰 prefix zakładki + "Stacja:"/"Station:" nagłówek (econPanel.stationLabel) + center "Stacja
     orbitalna — brak produkcji" (econPanel.stationNoProduction; hasManagement guard `!isStation` →
     pełny przegląd zamiast pustego panelu zarządzania). Fix BUG A: _buildResourceTooltip guard
     `typeof rs.getResourceBreakdown !== 'function'` continue (StationDepot nie ma breakdown).
     i18n PL+EN. Live-gate PASS. Bez migracji save (v85). Smoke tmp_s4_3 14/14 + S4-2 regr 25/25 +
     S4-1 regr 23/23. NEXT: S3.5 (cross-empire trade). [S3.4 light diplomacy DONE — sekcja „S3.4 — Light Diplomacy" niżej.]
```

---

## Kluczowe zdarzenia EventBus (4X)

| Zdarzenie | Emitent | Odbiorcy |
|-----------|---------|----------|
| `resource:registerProducer { id, rates }` | BuildingSystem, CivSystem | ResourceSystem |
| `resource:removeProducer { id }` | BuildingSystem | ResourceSystem |
| `resource:changed { resources }` | ResourceSystem | ColonyOverlay, ResourcePanel |
| `resource:shortage { resource }` | ResourceSystem | CivilizationSystem |
| `planet:buildRequest { tile, buildingId }` | ColonyOverlay | BuildingSystem |
| `planet:buildResult { success, tile, reason }` | BuildingSystem | ColonyOverlay |
| `planet:demolishRequest { tile }` | ColonyOverlay | BuildingSystem |
| `planet:demolishResult { success, tile }` | BuildingSystem | ColonyOverlay |
| `tech:researchRequest { techId }` | ColonyOverlay | TechSystem |
| `tech:researched { tech, restored }` | TechSystem | BuildingSystem, ColonyOverlay |
| `civ:addHousing / removeHousing` | BuildingSystem | CivilizationSystem |
| `civ:popBorn { population }` | CivilizationSystem | UIManager, BuildingSystem |
| `civ:popDied { cause, population }` | CivilizationSystem | UIManager, BuildingSystem |
| `civ:employmentChanged { delta }` | BuildingSystem | CivilizationSystem |
| `expedition:sendRequest { type, targetId, vesselId }` | UIManager | ExpeditionSystem |
| `civ:lockPops / unlockPops { amount }` | ExpeditionSystem | CivilizationSystem |
| `fleet:buildRequest { shipId }` | UIManager | ColonyManager |
| `fleet:buildStarted { planetId, shipId }` | ColonyManager | UIManager |
| `fleet:shipCompleted { planetId, shipId }` | ColonyManager | UIManager |
| `fleet:buildFailed { reason }` | ColonyManager | UIManager |
| `fleet:shipConsumed { planetId, shipId }` | ColonyManager | — |
| `expedition:reconComplete { scope, discovered }` | ExpeditionSystem | UIManager (EventLog), MissionEventModal |
| `expedition:reconProgress { expedition, body, discovered }` | ExpeditionSystem | UIManager (EventLog), MissionEventModal |
| `expedition:disaster { expedition }` | ExpeditionSystem | MissionEventModal |
| `expedition:colonyFounded { expedition, planetId, startResources, startPop, resourceMult }` | ExpeditionSystem | MissionEventModal |
| `expedition:missionReport { expedition, gained, multiplier, text }` | ExpeditionSystem | MissionEventModal |
| `vessel:created { vessel }` | VesselManager | — |
| `vessel:launched { vessel, mission }` | VesselManager | ThreeRenderer, UIManager |
| `vessel:arrived { vessel, mission }` | VesselManager | ExpeditionSystem |
| `vessel:returning { vessel }` | VesselManager | — |
| `vessel:docked { vessel }` — WYŁĄCZNIE prawdziwy dok (od 582 nie leci przy usunięciu statku; jawny wyjątek: katastrofy misji, `legacyDockedEmit` — Finding 583) | VesselManager | ThreeRenderer, UIManager |
| `vessel:removed { vesselId, vessel, reason, atBodyId }` — statek zużyty albo usunięty POZA walką; `reason` ∈ colonized / outpost_upgraded / dismantled / colony_lost / consumed (Finding 582) | VesselManager (`destroyVessel` — JEDYNY producent) | ThreeRenderer (sprite), OrbitalSpaceSystem (orbita), UIManager (narrator wg powodu, `utils/VesselRemoval.js`) |
| `vessel:positionUpdate { vessels[] }` | VesselManager | ThreeRenderer |
| `vessel:rename { vesselId, name }` | UIManager | VesselManager |
| `expedition:orderReturn { expeditionId }` | UIManager | ExpeditionSystem |
| `expedition:orderRedirect { expeditionId, targetId }` | UIManager | ExpeditionSystem |
| `expedition:redirected { expedition }` | ExpeditionSystem | UIManager |
| `expedition:redirectFailed { reason }` | ExpeditionSystem | UIManager |
| `planet:colonize { planet }` | UIScene | GameScene → ColonyOverlay |
| `planet:openMap { planet }` | UIScene | GameScene → ColonyOverlay |
| `factory:setTarget { commodityId, qty }` | CivPanelDrawer | FactorySystem |
| `factory:enqueue { commodityId, qty }` | CivPanelDrawer | FactorySystem |
| `factory:dequeue { index }` | CivPanelDrawer | FactorySystem |
| `tradeRoute:create/pause/resume/delete` | TradeRouteModal | TradeRouteManager |
| `expedition:deliverCargo { expeditionId }` | UIManager | ExpeditionSystem |
| `outpost:founded { colony }` | ColonyManager | GameScene |
| `colony:destroyed { planetId, colonyName, reason, isOutpost, population, destroyedVesselIds }` | ColonyManager | GameScene, VesselManager, MissionSystem, TradeRouteManager |
| `planet:constructionProgress` | BuildingSystem | ColonyOverlay |
| `planet:constructionComplete { tileKey, buildingId }` | BuildingSystem | ColonyOverlay |
| `planet:buildQueued { tile, buildingId, cost }` | BuildingSystem | ColonyOverlay, EventLog |
| `planet:upgradeQueued { tile, cost }` | BuildingSystem | ColonyOverlay, EventLog |
| `planet:pendingFulfilled { tileKey, buildingId, isUpgrade }` | BuildingSystem | ColonyOverlay, EventLog |
| `planet:pendingCancelled { tileKey }` | BuildingSystem | ColonyOverlay |
| `fleet:buildQueued { planetId, shipId, cost }` | ColonyManager | UIManager, EventLog |
| `fleet:pendingCancelled { planetId, orderId }` | ColonyManager | UIManager |
| `trade:connectionsUpdated { connections[] }` | CivilianTradeSystem | UIManager |
| `trade:creditsChanged { colonyId, credits, delta }` | CivilianTradeSystem | UIManager |
| `trade:transferExecuted { from, to, goodId, qty }` | CivilianTradeSystem | UIManager |
| `trade:spendCredits { colonyId, amount, purpose }` | UIManager | CivilianTradeSystem |
| `trade:setOverride { colonyId, goodId, mode }` | UIManager | CivilianTradeSystem |
| `observatory:discovered { body, discovered, colonyName }` | ObservatorySystem | EventLog, UIManager |
| `randomEvent:warning { event, planetId, colonyName, yearsUntil }` | RandomEventSystem | EventLog, GameScene |
| `observatory:collisionAlert { bodyA, bodyB, yearsUntil, margin }` | CollisionForecast | EventLog, GameScene |
| `observatory:alertCleared { alertId }` | CollisionForecast | UIManager |
| `groundUnit:capturingBuilding { unitId, planetId, q, r, progress }` | GroundUnitManager | ⛔ **MARTWY — producent bez wywołań; ZERO subskrybentów** (ColonyOverlay go NIE słucha) |
| `groundUnit:buildingCaptured { unitId, planetId, q, r, buildingId, newOwner }` | GroundUnitManager | ⛔ **MARTWY U ŹRÓDŁA** — InvasionSystem subskrybuje (`:64`), ale event nigdy nie leci |
| `colony:capturedByPlayer { planetId, colonyName, previousOwner, isOutpost, reason }` | ColonyManager (`captureColonyForPlayer`) | GameScene (switchActiveColony), UIManager (EventLog + odśwież listę) |
| `groundUnit:captureInterrupted { unitId, planetId, q, r }` | GroundUnitManager | ⛔ **MARTWY — producent bez wywołań; ZERO subskrybentów** |
| ⚠ **Dlaczego te trzy są martwe** (raz, dla wszystkich): `GroundUnitManager.capture()` jest wołane WYŁĄCZNIE z `GROUND_ABILITIES.capture_building.execute` (`groundAbilities.js:28`), a `.execute` żadnej zdolności naziemnej nie jest w `src/` wywoływane. **Realna okupacja emituje `tile:ownerChanged`** (wiersz niżej), nie te trzy. Zmierzone: 600 civYears pełnej autonomii ⇒ `buildingCaptured = 0`, `capturingBuilding = 0`, przy `tileOwnerChanged = 26`. ||
| `tile:ownerChanged { planetId, q, r, oldOwner, newOwner }` | GroundUnitManager (`:619` — okupacja kafla) | NotificationCenter (`_handleTileOwnerChanged`, AC-9) → dzwonek + Dziennik/Walka. ⚠ **AGREGOWANE**: meldunek nie częściej niż raz na 0.5 roku wyświetlanego per ciało, z liczbą kafli; tylko strata na koloni GRACZA (odzysk i cudze ciała = cisza). Do AC-9 miał **zero konsumentów** |
| `invasion:repelled { invasionId, planetId }` | InvasionSystem (ostatni najeźdźca zginął) | NotificationCenter (`_handleInvasionRepelled`, AC-9) → dzwonek + Dziennik/Walka; DebugLog. Do AC-9 szło **wyłącznie** do DebugLog |
| `game:over { reason, planetName, detail? }` — ⚠ `reason: 'conquered'` (AC-8/D9=W3) to **NOWA gałąź**: gracz nie ma ŻADNEJ kolonii ANI zdolności odwrócenia (statek desantowy **i** wojsko, albo statek kolonizacyjny) przez `VIABILITY_GRACE_CIVYEARS` = 12 civY. Reszta powodów = fizyczne zniszczenie ciała / pop=0 | ColonyManager (`_tickPlayerViability`), GameScene (`checkHomeDestroyed`), ImpactDamageSystem | UIManager (ekran końca gry) |
| `player:noReversalPossible { reason, state }` | ColonyManager (`_tickPlayerViability`) | — (kanał audytu; `reason` mówi, KTÓREGO ogniwa zabrakło) |
| `station:orphaned { stationId, … }` | StationSystem (`:223`) | ⛔ **ZERO konsumentów** |
| `empire:colonyAdded { empireId, colonyId }` | EmpireRegistry (`:127`) | TerritoryService, DebugLog |
| `empire:colonyRemoved { empireId, colonyId }` | EmpireRegistry (`:144`) | TerritoryService; ⚠ **BRAK w `DebugLog.TRACKED_EVENTS`** (asymetria wobec `colonyAdded` — utrata kolonii przez imperium jest w audycie AI niewidoczna) |
| ⚠ **Konsumenci `groundUnit:*` niżej = stan z grepa 2026-10-02** (`c7c5a74`, Finding **332**): 37 zdarzeń, 98 trafień; poza `EventBus.on` z dosłowną nazwą subskrybuje pośrednio WYŁĄCZNIE `DebugLog` (`TRACKED_EVENTS`: `territorialIntent`, `territorialBlocked`). Wiersze podawały konsumentów, których nie ma (`ColonyOverlay`, `UIManager`/`EventLog`, `GameState`, `FogSystem`, `BattleSystem`). ||
| `groundUnit:orbitalStrike { vesselId, planetId, q, r, damage, ownerId }` | ColonyOverlay (tryb ostrzału z orbity, `:4622`); GroundAbilities (`orbital_support`, `:61` — ⛔ martwe: `.execute` bez wołających) | GroundUnitManager (`:51` → `_onOrbitalStrike`: obrażenia dla wszystkich jednostek na heksie) |
| `groundUnit:minefieldLaid { planetId, q, r, ownerId }` | GroundAbilities (`lay_minefield`, `:102` — ⛔ martwe: `.execute` bez wołających) | ⛔ **ZERO subskrybentów** (stan miny zapisuje sam emitent: `gs.set`, `groundAbilities.js:94-100`) |
| `groundUnit:mineTrigger { planetId, q, r, unitId, damage }` | GroundUnitManager (`:956`) | ⛔ **ZERO subskrybentów** |
| `groundUnit:fogRevealed { unitId, planetId, hexes[] }` | GroundUnitManager (`:893`) | ⛔ **ZERO subskrybentów** (`FogSystem` nie istnieje) |
| `groundUnit:healed { medicId, targetId, amount }` | GroundUnitManager (`:873`) | ⛔ **ZERO subskrybentów** |
| `groundUnit:expired { unitId, planetId, reason }` | GroundUnitManager (`:847`) | ⛔ **ZERO subskrybentów** |
| `groundUnit:stealthRevealed { unitId }` | GroundUnitManager (`:729`) | ⛔ **ZERO subskrybentów** |
| `groundUnit:stealthHidden { unitId }` | GroundUnitManager (`:905`) | ⛔ **ZERO subskrybentów** |
| `groundUnit:buildStarted { planetId, archetypeId, factionId }` | ColonyManager | — (emit-only; GroundUnitPanel czyta zwrotkę `startGroundUnitBuild`) |
| `groundUnit:buildCompleted { unitId, archetypeId, factionId, planetId, q, r }` | ColonyManager | — (emit-only) |
| `groundUnit:buildFailed { planetId, archetypeId, reason }` | ColonyManager | — (emit-only) |
| `groundUnit:supplyChanged { unitId, supply, max }` | SupplyCoverageSystem | ⛔ **ZERO subskrybentów** |
| `groundUnit:orgChanged { unitId, org, max }` | GroundUnitManager, SupplyCoverageSystem, CombatSystem | ⛔ **ZERO subskrybentów** |
| `groundUnit:moraleChanged { unitId, morale, max }` | GroundUnitManager, SupplyCoverageSystem, CombatSystem | ⛔ **ZERO subskrybentów** |
| `groundUnit:starved { unitId, planetId }` | SupplyCoverageSystem (`:194`) | ⛔ **ZERO subskrybentów** — Dziennik milczy przy śmierci głodowej |
| `groundUnit:disbanded { unitId, planetId, reason, archetypeId, owner, type, customName }` | ColonyManager (utrzymanie, `:1586`; ręczne rozwiązanie `disbandGroundUnit`, `:1804`, G1c/P2), CombatSystem (`morale_collapse`, `:282`) | NotificationCenter (`:70` → wpis TYLKO w Dzienniku, tylko jednostki gracza, bez dzwonka; G1b/S3, Finding **312** ✅; `manual` bez wpisu). ⚠ Subskrybent NIE zwalnia POP — robi to emitent, zawsze przez `releaseGroundUnitPops` z terminem właściciela (utrzymanie od G1c/P4, rozpad, ręczne rozwiązanie) |
| `groundUnit:resumed { unitId, planetId }` | ColonyManager (utrzymanie, `:1558`) | ⛔ **ZERO subskrybentów** |
| `groundUnit:destroyed { unitId, planetId, archetypeId, popCost, cause, owner \| ownerId }` | CombatSystem (`:258`), GroundUnitManager (ostrzał `:74`; mina `:1067` — z `popCost`/`archetypeId`/`cause: 'mine'` od G1c/P5, Finding **327** ✅), SupplyCoverageSystem (głód, `:200`), VesselManager (`:1138`), WithdrawalSystem (termin wycofania, `:314`), GarrisonSystem (zniszczone ciało, `:330`, G1c/P6); `GroundUnitManager:843` w martwej `attackUnit`. ⚠ `UnitCardPanel` śmierci NIE emituje — od G1c/P2 woła `ColonyManager.disbandGroundUnit` (`UnitCardPanel.js:227`, Finding **330** ✅) | ColonyManager (`:1686` → zwrot `rate` po zwłoce do kolonii MACIERZYSTEJ z terminem właściciela, G1b/S4, Finding **326** ✅; reszta ginie od razu z blokadą, G1c/P1; koszt i archetyp z rejestru, rozliczenie dokładnie raz `_popsReleased`, G1c/P5), ArmySystem (`:46`). ⚠ Każdy żywy emitent emituje PRZED `removeUnit` — handler czyta jednostkę z rejestru |
| `groundUnit:popsLost { unitId, owner, type, customName, planetId, homeColonyId, amount, cause }` | ColonyManager (`_reportPopsLost`, `:1860`) — brak kolonii właściciela przy zwolnieniu albo reintegracji (G1b); od **380** jednostka, której dom przejęto, nie ma już więzi POP — meldunku nie ma | NotificationCenter (`:67` → wpis TYLKO w Dzienniku, tylko gracz, bez dzwonka) |
| `supply:coverageChanged {}` | SupplyCoverageSystem | ColonyOverlay |
| `vessel:orderIssued { vesselId, order }` | MovementOrderSystem | UIManager (FleetManagerOverlay), VesselManager (suspend mission) |
| `vessel:orderCompleted { vesselId, orderId, type, completedYear }` | MovementOrderSystem | UIManager, VesselManager (resume mission), EventLog |
| `vessel:orderCancelled { vesselId, orderId, reason }` | MovementOrderSystem | UIManager, VesselManager (resume mission) |
| `vessel:orderBlocked { vesselId, orderId, reason }` (`target_lost`/`out_of_range`/`endurance_zero`) | MovementOrderSystem | UIManager (alert), EventLog |
| `vessel:enduranceLow { vesselId, endurance }` (≤20% z hysteresis reset @40%) | VesselManager (_tickEndurance) | UIManager, EventLog |
| `vessel:enduranceDepleted { vesselId }` (current=0) | VesselManager (_tickEndurance) | UIManager, EventLog |
| `empire:fleetMaterialized { empireId, fleetId, vesselIds[], strengthConsumed }` | EmpireFleetMaterializer | UIManager, IntelSystem |
| `empire:fleetDematerialized { empireId, fleetId, reason }` (`all_vessels_lost`/`returned_home`/`fleet_disbanded`) | EmpireFleetMaterializer | UIManager |
| `empire:fleetMaterializedVesselLost { empireId, fleetId, vesselId, remainingStrength }` | EmpireFleetMaterializer (on vessel:wrecked) | WarSystem, IntelSystem |
| `vessel:proximityEnter { vesselAId, vesselBId, distanceAU, sameFaction }` | ProximitySystem (M2a) | VesselCombatSystem; (M2b: IntelSystem) |
| `vessel:proximityExit { vesselAId, vesselBId }` | ProximitySystem (M2a) | (M2b: IntelSystem) |
| `vessel:engaged { sideA: vesselIds[], sideB: vesselIds[], location }` | VesselCombatSystem (M2a; opt) | UIManager (EventLog) |
| `vessel:autoRetreatIssued { vesselId, battleId, destinationPlanetId, orderId }` | AutoRetreatSystem (M2a) | UIManager (EventLog) |
| `vessel:autoRetreatFailed { vesselId, battleId, reason }` (`no_friendly_planet` / order_rejected) | AutoRetreatSystem (M2a) | UIManager (EventLog) |
| `battle:resolved { warId, battleId, result }` z `result.location: {systemId, planetId, point}` (v66) | VesselCombatSystem (deep-space), EnemyAttackHandler, WarSystem | GameScene, AutoRetreatSystem, InvasionSystem |
| `notify:added { notif }` (silent notification) | NotificationCenter | — |
| `notify:listChanged { count }` (active count change) | NotificationCenter | BottomBar (bell badge), NotificationDropdown |
| `notify:dismissed { id }` | NotificationCenter | NotificationDropdown |
| `notify:openDetail { notif }` (klik wiersza w dropdown) | NotificationDropdown | MissionEventModal (`noPause:true`) |
| `station:created { station }` | StationSystem (createStation + restore) | ThreeRenderer (`_addStationMesh`) |
| `station:destroyed { stationId }` | StationSystem (destroyStation) | ThreeRenderer (`_removeStationMesh`) |
| `station:orderQueued { planetId, order }` | ColonyManager (addPendingStationOrder) | wired in ColonyOverlay (flash, S4-1) |
| `station:orderCancelled { planetId, orderId }` | ColonyManager (cancelPendingStationOrder) | wired in ColonyOverlay (flash, S4-1) |
| `station:orderRejected { planetId, reason, requires }` (`requiresTech`) | ColonyManager (addPendingStationOrder — bramka tech) | wired in ColonyOverlay (flash, S4-1) |
| `station:built { planetId, stationId, targetBodyId }` | ColonyManager (_tickPendingStationOrders) | wired in ColonyOverlay (flash, S4-1) |
| `station:buildFailed { planetId, orderId, reason }` (`body_lost`/`no_station_system`/`create_failed`) | ColonyManager (_tickPendingStationOrders) | wired in ColonyOverlay (flash, S4-1) |
| `vessel:sensorLockEnter { vesselAId, vesselBId, distanceAU, sameFaction }` (reforma detekcji — reveal tożsamości) | ProximitySystem (3. próg, gate `sensorLockContact`) | IntelSystem (`_onSensorLock` → `advanceVesselContact('contact')`) |
| `vessel:sensorLockExit { vesselAId, vesselBId }` | ProximitySystem | — (cleanup pary) |
| `observatory:vesselScanStarted { vesselId, durationYears }` | ObservatorySystem (`startVesselScan`) | ObservatoryOverlay (zakładka Kontakty) |
| `observatory:vesselScanComplete { vesselId, vessel }` (rumor→contact zdalnie) | ObservatorySystem (`_completeVesselScan`) | NotificationCenter (`_handleVesselScanComplete`) |
| `observatory:vesselScanCancelled { vesselId, reason }` (`manual`/`target_lost`) | ObservatorySystem (`cancelVesselScan`/`_tickVesselScans`) | ObservatoryOverlay |
| `intel:vesselContactChanged { vesselId, oldQuality, newQuality, reason }` (`proximity_observation`/`sensor_lock`/`observatory_scan`/`observatory_sighting`) | IntelSystem | UIManager/GameScene EventLog (**tylko contact+**, fog-of-war: rumor anonimowy), ThreeRenderer (ghost) |
| `territory:ownersChanged {}` (indeks własności układów unieważniony/przebudowany) | TerritoryService (`_invalidate`/`reindex`) | TerritoryField (recompute) |
| `territory:changed {}` (pole + kontury przeliczone) | TerritoryField (`recompute`) | ThreeRenderer (`_galaxyTerrDirty` — terytorium płyty galaktyki; do G5 także FleetManagerOverlay / zakładka Stratcom) |
| `territory:merged { ownerId, from, to }` (bąble się zrosły — spadek liczby pętli przy niezmniejszonej liczbie źródeł) | TerritoryField | ⛔ **ZERO konsumentów od G5** (rozbłysk izolinii mieszkał w zakładce Stratcom); emisję pinuje `galaxy_territory_smoke` B3 |
| `colony:capturedByPlayer { planetId, colonyName, previousOwner, isOutpost, reason }` (gracz przejmuje ciało AI po desancie) | ColonyManager (`captureColonyForPlayer`) | TerritoryService (invalidacja indeksu), GameScene |
| `colony:listChanged {}` — ⚠ teraz emitowane TAKŻE przez `registerHomePlanet` i `restore` (były ciche → TerritoryService cache'ował indeks bez kolonii gracza; fix B3) | ColonyManager | TerritoryService, listy UI |

---

<!-- CLAUDE.md L3008–3123 -->
## Dodawanie nowych funkcji

1. Nowa mechanika → nowy plik w `src/systems/` (logika) lub `src/data/` (definicje)
2. Subskrybuj zdarzenia przez `EventBus.on('event', cb)`
3. Emituj zdarzenia przez `EventBus.emit('event', data)`
4. NIE importuj systemów bezpośrednio między sobą
5. Dane gry (budynki, tech, składy chemiczne) → `src/data/` — oddzielone od logiki
6. Nowy budynek tier-2: dodaj `requires: 'tech_id'` w BuildingsData + odpowiednie `unlockBuilding` w TechData
7. Nowy statek: dodaj definicję w `ShipsData.js` (z `fuelCapacity`, `fuelPerAU`) + `unlockShip` w TechData + budowa przez Stocznię (ColonyManager.startShipBuild) + pula nazw w `VesselNames.js`
8. Odległość między ciałami → `DistanceUtils` (`src/utils/DistanceUtils.js`): euclidean (dynamiczna) i orbital (stabilna)
9. Nowy typ planety wizualnie → dodaj typ w `generate-planets.js` (PLANET_TYPES) + wygeneruj tekstury CLI → dodaj mapowanie w `resolveTextureType()` w ThreeRenderer
10. Regeneracja tekstur: `node generate-planets.js --type <typ> --count 3 --resolution 1024 --quality high --output ./assets/planet-textures --name <typ>`
11. Ground unit sprite 3D: wrzuć `<name>.glb` do `assets/units/ground/<faction>/` → `GlbSnapshotRenderer` zrobi PNG snapshot 128×128 przy pierwszym load'zie (cache per sesja); kolejność fallback: GLB → PNG → runtime placeholder

---

## Protokół migracji save'ów

Centralny system migracji: `src/systems/SaveMigration.js`

**Przy dodawaniu nowej funkcji zmieniającej format save:**

1. **`SaveMigration.js`**: bump `CURRENT_VERSION`, dodaj `_migrateVNtoVN+1(data)`, zarejestruj w mapie `MIGRATIONS`
2. **W migracji**: dodaj nowe pola ze sensownymi defaults (per-kolonia w `c4x.colonies[]` i/lub globalne w `c4x`)
3. **W `restore()` systemu**: `?? defaultValue` dla nowych pól (defensywne)
4. **W `serialize()`**: zapisz nowe pola

**Architektura:**
- `migrate(data)` — backup → łańcuch v4→v5→v6→v7→... → persist
- Backup migracji do localStorage: **WYCOFANY w D2/E9** (był `kosmos_save_backup_v{N}`) — gwarantowaną
  ścieżką ratunkową jest plik `.json` na dysku; `pruneMigrationBackups()` został jako SPRZĄTACZ pozostałości
- Wywołanie: `BootScene._handleBtn('yes')` po `SaveSystem.loadData()`
- `SaveSystem.save()` używa `CURRENT_VERSION` (import z SaveMigration)
- Migracje entity-level (Moon T, deposits) pozostają w `GameScene._restoreSystem()` (wymagają żywych instancji)
- Migracja string fleet → vessel instances pozostaje w `GameScene._migrateStringFleets()` (wymaga VesselManager)

**NIE dodawaj ad-hoc migracji** w `restore()` poszczególnych systemów — centralizuj w `SaveMigration.js`.

---

## Strategia zapisu: localStorage vs pliki (save-do-pliku, save v90 bez migracji)

**Dwie warstwy, różne role — żadna nie zastępuje drugiej:**
- **`localStorage['kosmos_save_v1']`** = BIEŻĄCA gra: autozapis (co 1 rok gry), ochrona przed crashem/F5,
  JEDEN slot. Nadpisywany.
- **plik `.json` na dysku** = TRWAŁE zapisy gracza: ręczne, nieograniczone, przenośne.
  **Pliki pełnią rolę slotów** — system plików gracza jest lepszym menedżerem zapisów niż picker w grze.
  Dlatego **multi-slot/IndexedDB (Etap 1 z `docs/plan-multi-save-indexeddb.md`) świadomie ODRZUCONY** —
  ten plan jest nieaktualny (zakładał też zmiany w `BootScene`, który jest martwym kodem: `main.js:38`
  instancjonuje `TitleScene`).

**`src/utils/SaveFile.js`** — `slugify` / `buildSaveFileName` / `downloadSave` / `pickSaveFile` /
`IMPORT_REASON_KEYS`. Nazwa pliku liczona **z zawartości zapisu** (`data.civ4x.civName`, `gameTime`,
`version`), NIE z żywego `window.KOSMOS` → funkcja czysta, ta sama w grze i na ekranie tytułowym:
`kosmos_Zjednoczona_Federacja_r39_v90.json` (generator: `civ4x=null` → `kosmos_r5_v90.json`).
`pickSaveFile` — anulowanie natywnego dialogu NIE emituje `change`, więc null idzie przez
`window focus` + 500 ms grace (flaga `reading` chroni odczyt dużych plików).

**⚠ ROOT-CAUSE FIX `SaveSystem.importSave`** — walidacja była `version >= 1`, więc przepuszczała v91/v3.
Przy następnym „Kontynuuj" `migrate()` zwracał `error` → `TitleScene:305-311` robił `clearSave()`.
`future_version`/`too_old` wracają PRZED blokiem backupu (`SaveMigration.js:150`) → **ginął i import, i
poprzedni zapis gracza, bez śladu**. Teraz bramka zakresu (`CURRENT_VERSION`/`MIN_SUPPORTED_VERSION`)
odrzuca PRZED `setItem` → slot nietknięty; + kopia `kosmos_save_backup_preimport` (łapie pomyłkę
„poprawny plik, ale nie ten"). Powody `reason` lustrzane do kodów `migrate()`.

**Wejścia (jedna wspólna ścieżka importu):** menu ☰ (`BottomBar._saveToFile`/`_loadFromFile`) +
ekran tytułowy (`TitleScene._loadFromFile` → `importSave` → `_handleChoice('continue')`).
GOTCHA: **eksport MUSI najpierw `emit('game:save')`** — `exportSave()` czyta wyłącznie slot, więc bez
tego na dysk poszedłby stary stan. **Import MUSI reloadować natychmiast** — stan w pamięci jest już
nieaktualny, a ręczny zapis nadpisze slot niezależnie od pauzy (autozapis stoi przy pauzie:
`TimeSystem.js:70` wraca przed `emit('time:tick')`).
`TitleScene` — numeracja pozycji menu z licznika `num()` (ręczne ternary rozjeżdżały się przy każdej
nowej pozycji). Autosave ZOSTAJE (ma kill-switch `off` w menu; chroni przed crashem — pliki są ręczne).

**⚠ QUOTA localStorage — reguły, bez których import padnie (live-gate fix):**
- **Quota = 10 MiB liczone w UTF-16 (2 B/znak) = ~5,2 mln ZNAKÓW na WSZYSTKIE klucze razem** (per origin).
  `SaveSystem.js:105` mierzy `json.length/1024/1024` = ZNAKI, nie bajty → próg 3.5 „MB" = ~67% realnego
  sufitu (dobrze dobrany, zostawiony). **Save ≥2,6 mln znaków ⇒ DWIE kopie nie mieszczą się fizycznie.**
- **Chromium sprawdza quotę TYLKO gdy element ROŚNIE** (`storage_area_map.cc`: `new_item_size >
  old_item_size && new_quota_used > quota_`; zapisy kurczące przechodzą ponad budżet). Wniosek:
  podmiana slotu na porównywalny save NIE MOŻE paść — pada tylko, gdy ktoś zjadł headroom tuż przed nią.
- **Kolejność w `importSave` jest kontraktem**: `prev` do ZMIENNEJ → `pruneMigrationBackups()` → `setItem`
  slotu → (na quota: `removeItem(PREIMPORT)` + retry) → **kopia przedimportowa PO fakcie, best-effort**.
  Kopia PRZED importem = regresja z live-gate (kradła headroom → `write_error` „brak miejsca").
  `setItem` jest atomowy → nieudany zapis nie rusza slotu (poprzedni save żyje).
- **`pruneMigrationBackups({keepVersion})`** (`SaveMigration.js`, tam bo `SaveSystem`→`SaveMigration` jest
  jednokierunkowe — odwrotny import = cykl). `kosmos_save_backup_v{N}` powstawały przy każdym bumpie
  i NIGDY nie były sprzątane (commit `77740c2`: gracz miał 9 backupów = 4,4 MB). **⚠ D2/E9: ZAPIS
  tych kluczy WYCOFANY** — prune jest teraz czystym sprzątaczem pozostałości u graczy ze starszych
  wersji, a `keepVersion` nie ma już wywołania produkcyjnego. **Ani one, ani
  `kosmos_save_backup_preimport` NIE MAJĄ ścieżki odczytu w grze** (odzysk = ręcznie w DevTools) —
  trwały backup to plik `.json`. Prune: przy imporcie (wszystkie) + w `migrate()` przed backupem
  (`keepVersion=fromVersion`). Używa Storage API `length`/`key(i)`, NIE `Object.keys` (mockowalne;
  stare mocki bez `length` degradują do zera usunięć).
- Smoke `tmp_save_file_smoke.mjs` 77/77 — mock odwzorowuje semantykę Chrome (rzut tylko przy wzroście);
  T4 = odrzucony import nie rusza slotu, T7 = import przechodzi przy ciasnej quocie (zweryfikowane:
  na kodzie z `a462e10` te asercje PADAJĄ), T8 = prune.

**Alarm o awarii zapisu (utrata zapisu = JEDYNE nieodwracalne zdarzenie w grze):**
- **Self-healing w `save()`** — na quocie: `pruneMigrationBackups()` + ponowny `_trySetItem` ZANIM
  poleci `game:saveFailed`. Najczęściej wystarcza i gracz nie zauważa problemu.
- **⚠ FIX severity `'warning'`→`'warn'`** (`UIManager.js` saveFailed + saveLargeWarning):
  `EventLogSystem.js:90` waliduje whitelistą `['info','warn','alert']` i po cichu koercuje nieznane
  do `'info'` → „Save NIE zapisany" wyglądał IDENTYCZNIE jak „💾 Zapisano". Literówka, nie decyzja.
- **Toast + throttle** — `UIManager._saveAlertToast(msg, color, stampField)`; `SAVE_ALERT_COOLDOWN_YEARS=25`,
  osobny stamp per rodzaj (`_lastSaveFailToastYear`/`_lastSaveLargeToastYear`), pierwsza awaria zawsze.
  **Throttle jest warunkiem koniecznym**: quota to błąd TRWAŁY, autosave leci co rok gry → bez tego alarm
  zalewa ekran i wypłukuje ring buffer Dziennika (`MAX_RUNTIME`), kasując dowody innych zdarzeń.
  Różnica lat przez `Math.abs` — wczytanie zapisu cofa zegar, inaczej toast zamilkłby na zawsze.
- **i18n `save.failedQuota/failedSerialization/failedUnknown/largeWarning`** PL+EN (był hardkod PL
  z połamanymi znakami: „pelny", „Usun", „blad" — gracz EN dostawał zepsuty polski).
- **Debug**: `KOSMOS.debug.storageReport()` (console.table per klucz + % quoty) ·
  `fillStorage(MiB)` (balast do testowania ścieżek quota; `fillStorage(0)` sprząta).

---

