# KOSMOS — Symulator Układu Słonecznego + Strategia 4X

## Wizja gry

Dwuwarstwowa gra przeglądarkowa:
1. **Warstwa symulacyjna** — generujesz układ planetarny i obserwujesz jego ewolucję (Tamagotchi kosmiczne)
2. **Warstwa 4X** — gdy powstaje cywilizacja, przejmujesz nad nią kontrolę. Budujesz instalacje na mapie hex planety, rozwijasz technologię, wysyłasz ekspedycje na asteroidy i inne planety

Cel warstwy 4X (oryginalna wizja gracza):
> "Jak braknie surowców lub nie ma dostępu do unikalnych surowców, gracz wysyła ekspedycje na asteroidy lub inne planety. Tak robi ekspansję swojej cywilizacji."

---

## Technologia

- **Three.js** (przez CDN, bez npm) — renderer 3D warstwy symulacyjnej (zastąpił Phaser 3)
- **Canvas 2D** (natywny) — warstwa UI (UIManager) i mapa planety (ColonyOverlay; PlanetScene.js wciąż instancjonowany w `GameScene` ale nigdy nie otwierany — kandydat do usunięcia)
- JavaScript ES Modules (natywne, bez bundlera)
- **Node.js** (v24) — generator tekstur planet (`generate-planets.js` + `lib/`), zależności: `sharp`, `simplex-noise`
- Grę otwierać przez Live Server w VS Code (brak bundlera)
- Zapis: localStorage (klucz `kosmos_save_v1`), wersja save: v91 (patrz `SaveMigration.CURRENT_VERSION`)

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
- Sferyczny orbit: LPM drag = obrót, scroll = zoom (3–450 j., 0.5 przy focus na księżycu), H = reset
- `wasDrag` — flaga odróżniająca drag od kliknięcia
- `_minDist` — dynamiczny min zoom: 3 (domyślny), 0.5 (focus na księżycu)
- `setMinDist(val)` — wywoływany przez ThreeRenderer przy body:selected/deselected
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

## Akademickie zasady projektowania gry

Projekt realizuje podejście **MDA (Mechanics → Dynamics → Aesthetics)**:

### Mechaniki (Mechanics) — zasady i dane
- Dane oddzielone od logiki: `TechData.js`, `BuildingsData.js`, `TERRAIN_TYPES` w `HexTile.js`
- Każda mechanika to osobny system (`src/systems/`) — bez bożych obiektów
- Parametry nazwane stałymi z jednostkami: `GRAVITY_STEP = 3000 // lat gry`

### Dynamika (Dynamics) — emergencja z reguł
- Klimat planety = orbita × atmosfera × gwiazda (nie hardkodowany)
- Życie = temperatura + skład chemiczny (H₂O, C, P) — emergentnie
- Populacja reaguje na surowce, morale, housing — nie ma sztywnego skryptu

### Estetyka (Aesthetics) — cel doświadczenia
- Napięcie zasobowe: gracz zawsze czegoś mu brakuje → musi wybrać priorytety
- Poczucie skali: gra działa w milionach lat, ale 1s = 1 dzień też jest możliwe
- Odkrycie: każdy układ planetarny inny (PRNG seed z planet.id — deterministyczny)

### Reguły projektowe wynikające z podejścia akademickiego
1. **Separacja danych od logiki** — definicje w `src/data/`, logika w `src/systems/`
2. **Prostota reguł, złożoność emergentna** — nie dodawaj wyjątków, upraszczaj reguły
3. **Pętle sprzężenia zwrotnego** — niedobór → kara → motywacja do zmiany (nie game over)
4. **Czas jako zasób** — gracz zarządza prędkością czasu; auto-slow przy ważnych zdarzeniach
5. **Grywalna fizyka** — dokładność poświęcana na rzecz stabilności (`GRAVITY_MASS_SCALE`)

---

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
| `vessel:docked { vessel }` | VesselManager | ThreeRenderer, UIManager |
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
| `groundUnit:capturingBuilding { unitId, planetId, q, r, progress }` | GroundUnitManager | ColonyOverlay |
| `groundUnit:buildingCaptured { unitId, planetId, q, r, buildingId, newOwner }` | GroundUnitManager | InvasionSystem (podbój gracza — `_tryPlayerCapture`) |
| `colony:capturedByPlayer { planetId, colonyName, previousOwner, isOutpost, reason }` | ColonyManager (`captureColonyForPlayer`) | GameScene (switchActiveColony), UIManager (EventLog + odśwież listę) |
| `groundUnit:captureInterrupted { unitId, planetId, q, r }` | GroundUnitManager | ColonyOverlay |
| `groundUnit:orbitalStrike { unitId, planetId, q, r, hits, friendlyFireHits, placeholder }` | GroundAbilities (orbital_support) | BattleSystem (placeholder) |
| `groundUnit:minefieldLaid { planetId, q, r, ownerId }` | GroundAbilities (lay_minefield) | ColonyOverlay, GameState |
| `groundUnit:mineTrigger { planetId, q, r, unitId, damage }` | GroundUnitManager | ColonyOverlay, EventLog |
| `groundUnit:fogRevealed { unitId, planetId, hexes[] }` | GroundUnitManager | FogSystem (TBD) |
| `groundUnit:healed { medicId, targetId, amount }` | GroundUnitManager | ColonyOverlay |
| `groundUnit:expired { unitId, planetId, reason }` | GroundUnitManager | ColonyOverlay |
| `groundUnit:stealthRevealed { unitId }` | GroundUnitManager | ColonyOverlay |
| `groundUnit:stealthHidden { unitId }` | GroundUnitManager | ColonyOverlay |
| `groundUnit:buildStarted { planetId, archetypeId, factionId }` | ColonyManager | — (emit-only; GroundUnitPanel czyta zwrotkę `startGroundUnitBuild`) |
| `groundUnit:buildCompleted { unitId, archetypeId, factionId, planetId, q, r }` | ColonyManager | — (emit-only) |
| `groundUnit:buildFailed { planetId, archetypeId, reason }` | ColonyManager | — (emit-only) |
| `groundUnit:supplyChanged { unitId, supply, max }` | SupplyCoverageSystem | ColonyOverlay |
| `groundUnit:orgChanged { unitId, org, max }` | GroundUnitManager, SupplyCoverageSystem | ColonyOverlay |
| `groundUnit:moraleChanged { unitId, morale, max }` | GroundUnitManager, SupplyCoverageSystem | ColonyOverlay |
| `groundUnit:starved { unitId, planetId }` | SupplyCoverageSystem | UIManager (EventLog) |
| `groundUnit:disbanded { unitId, planetId, reason, archetypeId }` | ColonyManager (upkeep) | UIManager, EventLog |
| `groundUnit:resumed { unitId, planetId }` | ColonyManager (upkeep) | ColonyOverlay |
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
| `territory:changed {}` (pole + kontury przeliczone) | TerritoryField (`recompute`) | FleetManagerOverlay (render 2D/3D via `setTerritory`) |
| `territory:merged { ownerId, from, to }` (bąble się zrosły — spadek liczby pętli przy niezmniejszonej liczbie źródeł) | TerritoryField | FleetManagerOverlay (rozbłysk izolinii 2D+3D) |
| `colony:capturedByPlayer { planetId, colonyName, previousOwner, isOutpost, reason }` (gracz przejmuje ciało AI po desancie) | ColonyManager (`captureColonyForPlayer`) | TerritoryService (invalidacja indeksu), GameScene |
| `colony:listChanged {}` — ⚠ teraz emitowane TAKŻE przez `registerHomePlanet` i `restore` (były ciche → TerritoryService cache'ował indeks bez kolonii gracza; fix B3) | ColonyManager | TerritoryService, listy UI |

---

## Reforma detekcji + Konsola Dowodzenia polish (post-handoff, save v88 bez migracji, live-gate PASS)

Plan: `C:\Users\Komputer\.claude\plans\przeczytaj-handoff-z-ostatniej-dynamic-wreath.md`. Handoff: `docs/KOSMOS_handoff_detekcja_multiselect.md`. Memory: `memory/detection-reform-multiselect.md`.

**Faza 1 — Detekcja/intel (główny lever walki):**
- **Per-kadłub `sensorRangeAU`** (HullsData/ShipsData; scout 2.5 / fregata 1.6 / niszczyciel 1.4 / krążownik 1.3 / transport 1.0–1.1) → `VesselManager.getVesselSensorRangeAU` (fallback 0.5) → `ProximitySystem._getDetectionRangeAU` gałąź gracza (`base × tech sensor_range`); wróg flat 0.5 (asymetria).
- **Techy sensorów ×mocniej**: `advanced_sensors_1/2/3` = ×1.6/×1.6/×1.8 (kumulatywnie ~×4.6).
- **Sensor-lock reveal** (gate `FEATURES.sensorLockContact`): 3. próg w ProximitySystem (`_activeSensorLockPairs` + `_getSensorLockAU` = `SENSOR_LOCK_AU 0.3 × tech`) → `vessel:sensorLockEnter` → `IntelSystem._onSensorLock` → `advanceVesselContact('contact')` (BYPASS dystansu w `_observeVessel`). Reveal tożsamości BEZ walki.
- **⚠ ROOT-CAUSE FIX `IntelSystem._isPlayerVessel`**: było `ownerEmpireId === 'player'`, statki gracza mają `undefined` → `_resolveObservedFromPair` zwracał null → **własny statek NIGDY nie podbijał intelu**. Teraz `!!v && !isEnemyVessel(v)` → proximity I sensor-lock działają.
- **Skan obserwatorium** (gate `observatoryVesselScan`): `ObservatorySystem._vesselScans` + `startVesselScan/cancelVesselScan/getVesselScanProgress/getActiveVesselScans` + `_tickVesselScans` (`SCAN_DURATION_YEARS 3.0 / level`, civDeltaYears) → `_completeVesselScan` rumor→contact zdalnie. UI: zakładka „Kontakty" w ObservatoryOverlay (Skanuj/Anuluj + pasek). serialize/restore `vesselScans` z `?? {}` (bez migracji). Wraki filtrowane u źródła (`_tickVesselDetection`).

**Faza 2 — Sprzątnięcie martwego kodu** (ThreeRenderer): usunięte `_syncSelectionRings`/`_upsert`/`_dispose*SelectionRing*` + `SELECTION_RING_*` + `_routeComet`/`_syncRouteComet`/`_disposeRouteComet`. `_orderLineColor` ZACHOWANE (3 route-line sites).

**Faza 3 — „Obserwuj bitwę"**: przycisk 👁 w nagłówku CombatHUD → `camera:watchBattle {x,y}` z `enc.location.point` (gameplay px); i18n `combat.watchBattle`.

**Faza 4 — Multi-select (Slice 8, `fcMultiSelect` flip ON)**: UIManager `_selectedVesselIds` Set + lead (`_selectedVesselId`); `getSelectedVesselIds/addToSelection/removeFromSelection/toggleSelection`; CTRL+klik toggle; **SHIFT+box-select** (`ThreeCameraController` ustępuje przy SHIFT; marquee w `_drawMarquee`; `ThreeRenderer._getOwnVesselsInScreenRect`); dispatch rozkazu do CAŁEGO zbioru (RightClickMenu pętla). GOTCHA: `_boxSelectConsumedClick` (pochłania artefakt-click po dragu, reset na mousedown); mouseup guard `e.button !== 0`.

**Fix live-gate T7 — moveToPoint na ruchome ciało**: `buildOrderSpec` planet → `targetBodyId` (+ fallback `targetPoint`); `_issueMoveToPoint` przewiduje pozycję ciała na ETA (`_predictPosition`) + `mission.targetId=bodyId` → przylot snapuje do ŻYWEJ pozycji planety i orbituje (statek śledzi planetę). Wzór rekon/atak. Pusty punkt = drift (bez zmian).

**Slice 8b — FleetGroupPanel (panel zaznaczonej grupy statków, gate `FEATURES.fcGroupPanel` ON, bez migracji save):**
Lekki non-exclusive panel (wzór StationPanel/CombatHUD; trzymany w UIManager, klik PRZED overlayManager,
draw PO — oba gated `fcGroupPanel && !overlayManager.isAnyOpen()`) w LEWYM-DOLNYM rogu pokazujący TRANSIENTNE
zaznaczenie mapy (`UIManager._selectedVesselIds`), NIEZALEŻNE od trwałych flot (FleetSystem). Self-managed:
`ui:selectionChanged` → show/hide (czyta `vesselIds`); `vessel:wrecked` → `removeFromSelection` (UIManager sam
NIE czyści zbioru). Zawiera: podsumowanie (liczba/paliwo%/utrzymanie Kr/uzbr. N/M/⚠unieruchomione) + roster
(nazwa·kadłub·status·rozkaz + mini-pasek paliwa, lead=accent) + akcje per-statek (🎯 `vessel:focus` / ✏
`showRenameModal`→`vessel:rename` / ✕ `removeFromSelection`) + rozkazy grupowe BEZ celu (Powrót `startReturn`
/ Tankuj `manualRefuel` docked / Stop `mos.cancelOrder` / Odwrót `mos.issueOrder retreat`) — szare gdy 0
kwalifikuje się (`countActionable`). Celowane (Move/Pursue/Engage) zostają na PPM mapy (już pętli zaznaczenie).
Minimize ▼→chip „⛬ Zazn. N"; stronicowanie ▲/▼ przy >6. Pliki: `src/ui/FleetGroupPanel.js` (widok) +
`src/ui/FleetGroupPanelLogic.js` (czyste `summarizeFleetGroup`/`buildRosterRows`/`countActionable`, node-test),
UIManager 5 wpięć, `fcGroupPanel` w GameConfig, i18n `fleetGroup.*` PL+EN. Smoke `tmp_slice8b_smoke.mjs` 33/33
+ regr fc_command 10 / fc_foundation 25 / fc_combat_fx 11 / sensor_detection 46. **Live-gate PENDING.**

**Skala 3D ↔ tactical + fix desync pozycji walki (post-Slice8b, save v88 bez migracji, live-gate PASS):**
- **Auto-fit kamery 3D do układu** (camera-only): `ThreeCameraController.frameSystem(maxOrbitAU)` ustawia
  dystans = `clamp(maxOrbitAU × SYSTEM_FIT_DIST_PER_AU(20), 70, 450)` + nowe pole `_defaultDist` (reset H /
  NaN-recovery wracają do ramki układu, nie sztywnego 85). `ThreeRenderer._computeSystemExtentAU` (max
  `orbital.a` planet+planetoid — IDENTYCZNA logika co mapa taktyczna) + `_frameActiveSystem` wpięte w
  `setCameraController` (start) i koniec `initSystem` (switchSystem/warp). Otwarcie układu kadruje CAŁY układ
  jak fit-to-bounds tactical (px/AU ~20–80 zamiast ~134). Startowy focus na home (GameScene) nadal wygrywa
  na starcie — ramka działa na H/reset/zmianę układu. Knob: `SYSTEM_FIT_DIST_PER_AU`.
- **⚠ ROOT-CAUSE fix desync 3D↔tactical podczas Engage**: `_issueEngage` ustawia `state='orbiting'`+`dockedAt=null`
  i lata statkiem mutując x/y, ale NIE zwalnia orbity w `OrbitalSpaceSystem` (engage omija ścieżkę
  in_transit/dock która normalnie woła `releaseOrbit`). `_tickOrbitingVessels` (co klatkę) pinował sprite do
  NIEAKTUALNEJ orbity macierzystej (~1 AU) gdy statek walczył 16 AU dalej (tactical czyta x/y wprost → był OK).
  Fix renderer-only (`dockedAt` = źródło prawdy): w `_tickOrbitingVessels` I `_syncVesselPositions` statek
  `orbiting`+`dockedAt==null`+`!wreck` (engage/pursue-hold/drift) pozycjonowany z REAL x/y, NIE z orbity.
  Genuine orbiter (`dockedAt=bodyId`) i wraki (graveyard/wreckLocation) bez zmian. Inwariant potwierdzony:
  wszystkie orbitery w VesselManager ustawiają `dockedAt=bodyId`, tylko deep-space free-float = null.
- Smoke `tmp_3d_scale_fit_smoke.mjs` 25/25 + `tmp_engage_desync_smoke.mjs` 12/12 (untracked).

**NEXT (jutro):** empire tech state (sensory/broń per imperium).

---

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
  **Z9 (bliźniaczy leak DOMKNIĘTY, `ac572f6`):** `transferColony` (przejęcie kolonii przez AI) woła te same 5×
  `dispose()` przed `_colonies.delete` — czysty dispose (przejęta kolonia = abstrakcyjny wpis imperium, AI nie
  adoptuje subsystemów). Orphan-guard `FactorySystem._update` zostaje jako defense-in-depth. Smoke
  `s34c_z9_transfer_dispose` 16/16 + live-gate PASS.
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

## Zunifikowana warstwa rozkazów floty — UKOŃCZONE (save v92, live-gate PASS, ARC ZAMKNIĘTY)

Jedna fasada wydawania rozkazów dla WSZYSTKICH UI + fix bug mis-homed statków po warpie + auto-łańcuch
cross-system transport (warp→lot→dostawa). Plan: `radiant-stirring-walrus.md`. Memory: `unified-order-service.md`.

**Bug wyjściowy:** statki po skoku warp pokazywały się w rejestrze jako „w home, wyszarzone" (nie w grupie
właściwego układu), a na mapie 3D poprawnie. **Root-cause:** jedyne źródło prawdy `vessel.systemId` pisane
tylko w ścieżce warp (`VesselManager:771` =null start, `:2197` =toSystemId przylot bramkowane
`phase==='warp_transit'`), a serialize/restore zwijały `null → 'sys_home'` (`?? 'sys_home'`). Statek zapisany
mid-warp / z fazą już poza `warp_transit` był trwale mis-homed (arrival hook się nie odpalał ponownie).

**Slice A — integralność `systemId`:** `VesselManager._resolveSystemId` (null TYLKO w prawdziwym `warp_transit`;
inaczej `mission.toSystemId`) + `_reconcileSystemId` (idempotentny, NIE rusza tranzytu). serialize/restore
zachowują `null` (`=== undefined ? 'sys_home' : v.systemId`). Reconcile na końcu pętli restore + defensywnie w
`_updatePositions`. Migracja `_migrateV91toV92` (self-heal mis-homed + `pendingOrder`/mission `origin/destSystemId` defaults).

**Slice B — `OrderService`** (`src/systems/OrderService.js`, `window.KOSMOS.orderService`, wired w GameScene
po `warpRouteSystem`): cienki router, kolaboratorzy leniwie przez `window.KOSMOS` (zero cross-importów — JEDYNY
dozwolony orkiestrator multi-system). Intent: `issueTransport/issuePassenger/issueMove/issueWarp/issueReturn/getTraffic`.
WSZYSTKIE UI wołają fasadę: `FleetManagerOverlay._executeMission` (transport/pasażer) + `return_home` handler,
Stratcom zony `cluster_send`/`cluster_send_pick`/`warp_order_send` (→`issueWarp`), PPM `RightClickMenu:314`
(→`issueMove`). Same-system = emit `expedition:transportRequest` (MissionSystem właścicielem logiki). ⚠ NIGDY
oba (`action.execute` I orderService) — ryzyko double-dispatch.

**Slice C — auto-chain cross-system** (warp→lot→dostawa): stan w `vessel.pendingOrder` (NIE loop/leg —
izolacja od `_tryResumeLoop`), serialize-safe. `_beginComposite`→`beginJourney`→ustaw `pendingOrder`. Łańcuch na
`interstellar:arrived`+`warpRoute:completed`→`_maybeDeliver` z guardami **jednokrotności**: `if(v.warpRoute)return`
(multi-hop trwa) + `if(v.systemId!==targetSystemId)return`. Re-walidacja celu (kolonia/stacja) → `order:compositeFailed`.
`warpRoute:aborted`→clear. `_resumePendingOrders()` po restore w GameScene. Dostawa reużywa `expedition:transportRequest`
(statek arrived=`orbiting`/`on_mission` → `_launchTransport` traktuje jako `isRedispatch` z orbity, bez spaceportu).

**Slice D — cele cross-system w rejestrze:** `_getValidTargets` pass cross-system (guard `warpFuel.max>0`):
kolonie/stacje GRACZA w innych układach (AI wykluczone → handel S3.5b), tag `{systemId, sameSystem, systemName,
distLY}`, `reachable = warpRange ≥ warpDist3D`. Picker: subheader układu + „X ly" + badge warp; `select_target`
zone niesie `targetSystemId` → `_missionConfig`. `_drawMissionConfirm` notka warp zamiast mylącej tabeli AU.
i18n `fleet.otherSystem/badgeWarp/crossSystemDelivery(+Hint)` + `order.compositeTargetLost`.

**Slice E — system-aware traffic:** MissionSystem `_launchTransport`/`_launchPassenger` rekordy +
`originSystemId`/`destSystemId`. `OrderService.getTraffic()` = `{bySystem, inTransit, missions}` — czyta `systemId`
(nie `colonyId`) → obcy statek w WŁAŚCIWYM układzie (znika rozjazd rejestr↔3D).

**Save v91→v92** (`_migrateV91toV92`). Smoke: `tmp_systemid_integrity_smoke` 19 · `tmp_order_service_smoke` 28 ·
`tmp_cross_system_targets_smoke` 8 + pełna regresja 0 FAIL (warp/save/s34/s34c/load_colonists/fleet_list_rows).

---

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
- Backup: `kosmos_save_backup_v{N}` w localStorage
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
  i NIGDY nie były sprzątane (commit `77740c2`: gracz miał 9 backupów = 4,4 MB). **Ani one, ani
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
- [x] **Etap 28** — Scenariusz "Cywilizacja": losowy układ z gwarancją cywilizacji, wyłączone perturbacje/kolizje, auto-kolonizacja; zamrożony "Generator"; usunięty Eden
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
- [x] **Faza 3** — DiplomacySystem (hostility 0-100) + AlienCivSystem FSM + DiplomacyOverlay (klawisz Y)
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
      **Trigger `InvasionSystem`** dwutorowo: event `groundUnit:buildingCaptured` (feedback) + **skan
      okresowy `_tickPlayerConquestChecks`** (1 civYear) — skan KONIECZNY na starym save (event nie wraca
      po load) i gdy ostatni wróg ginie PO przejęciu stolicy. Wspólny `_tryPlayerCapture`: brak żywych
      wrogich jednostek naziemnych ORAZ (kolonia MA stolicę→gracz właściciel `capitalBase` | outpost bez
      stolicy→gracz kontroluje ≥1 przejęty hex z budynkiem). GameScene switchActiveColony, UIManager
      EventLog+odświeżenie belki/drawera, i18n `log.colonyCaptured`/`log.outpostCaptured`.
      Smoke `invasion_player_capture_smoke.mjs` 25/25. Poza zakresem: przejmowanie wrogich jednostek
      naziemnych, stacje AI, konwersja POP.
- [~] **Faza 7** — MilitaryAI + EconAI (GOAP + Utility) — ongoing, równolegle do balansu

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

## Ważne decyzje projektowe

| Decyzja | Uzasadnienie |
|---------|-------------|
| Czas płynny (nie turowy) | Spójność z warstwą symulacyjną; gracz kontroluje prędkość |
| Hex cube coordinates | Najlepsza matematyka dla algorytmów odległości/sąsiedztwa |
| baseRates vs effectiveRates | Umożliwia retroaktywne tech-mnożniki bez restartu budynków |
| research = 5. zasób | Jednolity system surowców — research to waluta dla TechSystem |
| PRNG z planet.id | Determinizm mapy — ta sama planeta zawsze ta sama mapa (save-safe) |
| `window.KOSMOS` service locator | Unika cyklicznych importów między systemami |
| `EventBus.off()` w PlanetScene._close() | Zapobiega wyciekom handlerów przy wielokrotnym otwieraniu sceny |
| Three.js zamiast Phaser dla warstwy 3D | Phaser to engine 2D — Three.js daje natywne 3D, orbitowanie kamery, lepszy performance |
| Księżyce: wizualne okresy orbitalne | KeplerMath daje T≈7–15 lat → przy 1d/s orbita trwa 3650 s (statyczna); hardkodowane T=0.014–0.09 lat (5–34 s orbita) |
| hasRockyHZ zamiast hasHZ | hasHZ akceptował gas w HZ → brak skalistej → zero życia w układzie; fix: tylko rocky liczy się do gwarancji |
| forceType='rocky' w HZ guarantee | _makePlanet() z losowym typem może dać gas; explicit override gwarantuje skalistą |
| POP = dyskretna jednostka populacji | Zastąpił ciągły model w tysiącach; start z 2 POP, budynek = 0.25 POP → napięcie zasobowe od początku |
| employmentPenalty w BuildingSystem | Gdy POPy giną a budynki stoją → produkcja spada proporcjonalnie; gracz musi rozebrać nadmiar |
| Konsumpcja per POP (3 surowce) | food: 2.5, water: 1.5, energy: 1.0 per POP/rok — emergentne napięcie zasobowe (POP_CONSUMPTION w ResourcesData.js) |
| Statki jako jednostki floty (nie budynki) | Stocznia buduje statki → trafiają do hangaru kolonii; intuicyjniejsze niż budynki na hexach |
| RandomEventSystem aktywny | Eventy co 8-25 lat napędzają presję na obronę (defense_tower/grid) i tworzą okazje (prosperity bonusy) |
| Dwie metryki odległości (euclidean/orbital) | Euclidean = dynamiczna (UI, travel time), orbital = stabilna (gating zasięgu statków) |
| Paliwo fuel-based (fuelCapacity/fuelPerAU) | Zastąpił statyczne `range` — emergentny zasięg z paliwa; power_cells jako Tier 1 |
| Vessel instances (nie stringi w fleet) | Indywidualne statki z ID/nazwą/pozycją/paliwem → przyszłe interakcje w kosmosie (walki, spotkania) |
| Auto-tankowanie w hangarze | 2 pc/rok z power_cells kolonii — napięcie zasobowe (produkcja power_cells vs tankowanie) |
| Dynamiczny min-zoom dla księżyców | Moon r=0.015–0.04 → minDist=0.5 przy focus (vs 3 domyślnie) |
| PBR tekstury (MeshStandardMaterial) | Pre-generowane PNG z normalMap+roughnessMap dają realistyczne oświetlenie 3D; gas giganty zachowują proceduralne pasma (MeshPhongMaterial) |
| Tekstury pre-generowane (nie runtime) | Gra działa w przeglądarce (Live Server) — brak Node.js runtime; generator CLI tworzy PNG offline |
| Typ tekstury wg temperatury planety | resolveTextureType: tempK → volcanic/lava-ocean/desert/ocean/rocky/iron — emergentna różnorodność wizualna |
| Scenariusz Cywilizacja (nie Eden) | Losowy układ + najlepsza rocky w HZ z lifeScore=100; fizyka uproszczona (Kepler bez perturbacji); auto-kolonizacja |
| Generator zamrożony (nie usunięty) | Kod generatora + systemy fizyki zachowane, ale niedostępne w UI (przycisk wyszarzony); łatwy powrót w przyszłości |
| `window.KOSMOS.scenario` zamiast `edenScenario` | Czytelniejsza semantyka; wartości: 'civilization' / 'generator' / 'power_test' |
| Rozbiórka per-level (downgrade) | Lv>1: obniż o 1, zwrot 50% kosztu ulepszenia (surowce+commodities); Lv==1: pełna rozbiórka z 50% zwrotem; emergentna decyzja gracza |
| Katalog ciał (nie tylko explored) | Gracz widzi WSZYSTKIE ciała w układzie — dane niezbadanych ukryte ("???"), ale typ i odległość widoczne (teleskop) |
| Recon na konkretne ciało | Gracz wybiera cel rozpoznania z listy — nie tylko "nearest"/"full_system" ale konkretne body.id |
| Sekwencyjny full_system recon | Statek odwiedza ciała jedno po drugim (greedy nearest neighbor) zamiast instant discover all |
| Strefa wykluczenia Słońca (0.3 AU) | Statki nie lecą przez gwiazdę — `_calcRoute()` dodaje waypoint tangencjalny; `_interpolateWaypoints()` |
| Dynamiczny powrót statku | `returnTargetX/Y` aktualizowane co tick z pozycji kolonii macierzystej — statek wraca do aktualnej pozycji planety |
| Waypoints w misji (vessel.mission) | `waypoints: [{x,y}]` i `returnWaypoints: [{x,y}]` — serializowane w save, wielopunktowe linie trasy w ThreeRenderer |
| shipQueues tablica (nie single shipQueue) | Lv stoczni = max slotów budowy; tablica pozwala na równoczesną budowę N statków; migracja save: `shipQueue → shipQueues` |
| Stocznia multi-slot: suma poziomów | `_getShipyardLevel()` sumuje level WSZYSTKICH stoczni w kolonii (nie tylko pierwszej); speed bonus = floor(totalSlots / usedSlots) |
| Unified THEME tokens | Wszystkie pliki UI Canvas 2D używają `THEME.*` z ThemeConfig.js zamiast hardkodowanych hex kolorów; preset `kosmos` (ciepły bursztyn) |
| TitleScene zamiast BootScene | Ekran tytułowy z animowanym canvas (gwiazdozbiór, mgławica, mini-słońce, hero planet z teksturą PBR); HTML overlay z przyciskami |
| Statki orbitują cel (nie auto-return) | Recon i inne misje: po dotarciu `status='orbiting'`; gracz decyduje: powrót lub redirect do nowego celu |
| Centralny SaveMigration (nie ad-hoc) | Łańcuchowa migracja v4→v5→v6→v7→...; backup w localStorage; wywołanie w BootScene przed GameScene |
| Popupy misji z pauzą (MissionEventModal) | Każde ważne zdarzenie misji pauzuje grę, popup z danymi, kolejka wielu zdarzeń, czas wraca po ostatnim OK |
| Autonomiczne budynki bez employmentPenalty | Budynki z `isAutonomous: true` lub `popCost === 0` nie tracą produkcji gdy brakuje POPów — logiczne, bo nie potrzebują pracowników |
| Czas budowy budynków (buildTime) | Budynki z `buildTime > 0` nie powstają natychmiast — `_constructionQueue` w BuildingSystem; event `planet:constructionProgress` co tick aktualizuje pasek progresu |
| Prefabrykaty deployowane z cargo | isPrefab commodities → `deploysBuilding` → `BuildingSystem.deployFromCargo()` — natychmiastowa budowa bez kosztu surowcowego |
| Outpost (mini-kolonia bez POPów) | `isOutpost: true` → BuildingSystem._isOutpost pomija POP; upgrade do pełnej kolonii przez colony_ship |
| Handel cywilny (prosperity gradients) | CivilianTradeSystem: towary płyną auto z nadwyżki do niedoboru, generując Kredyty (Kr); TC = 200×pop + budynki; tick co 0.5 civYear |
| Kredyty (Kr) — waluta handlowa | Eksporter: 6% wartości, Importer: 3%; scarcityMultiplier (0.2–5.0×) wg lat zapasu; wydawane na rush build, zakupy awaryjne |
| Trade network bonus do prosperity | +3 per połączenie (max +15), upkeep 2×distFactor per połączenie; dalekie kolonie mogą tracić prosperity |
| Kategoria 'market' w HexTile | Budynki handlowe: trade_hub (TC+zasięg), free_market (efektywność), trade_beacon (×1.5 zasięg), commodity_nexus (unlimited) |
| Obserwatorium jako "oczy cywilizacji" | Auto-scan ciał (0.5/lv civYears), −0.3%/lv katastrofa, +5%/lv yield, research 6 (nie 12 — główna rola to mechaniki, nie research) |

---

## Lore i kierunek narracyjny

### Koncept "Zagubieni Kolonizatorzy"
Rok 2051. Statek kolonizacyjny z 400 000 ochotnikami wpada w anomalię
czasoprzestrzenną i wyładowuje 47 280 lat świetlnych od Ziemi.
Koloniści zakładają kolonię w nowym układzie. Gra zaczyna się tu.

**Cel endgame:** Sfera Dysona (20 segmentów, 4 fazy) daje energię
Cywilizacji Typu II potrzebną do aktywacji Bramy Skoku.

**Trzy zakończenia:** Powrót do Ziemi / Zostajemy (Projekt Labirynt) /
Wysyłamy Wiadomość

### Dwie frakcje (wewnętrzna presja, nie wybór gracza)
Gracz zarządza całą cywilizacją. Frakcje to presja polityczna kształtowana
przez decyzje gracza (suwak 0-100). Zakończenie wynika organicznie z historii.

**Konfederaci Misji** — "Jesteśmy tu na zawsze. To jest nasz dom."
- Kolor: #378ADD (niebieski)
- Przywódca: Dożywotni Archont (wybierany przy starcie z 3 kandydatów)
- Kandydaci: Dr. Yara Osei-Mensah, Komandor Aleksei Borodin-Vasek,
  Mirela Santos-Ikeda

**Poszukiwacze Drogi** — "Dom jest tam skąd przyszliśmy."
- Kolor: #D85A30 (pomarańczowy)
- Przywódca: Wybieralny Konsul co 15 lat (5 postaci rotujących)
- Konsulowie: Fatima Al-Rashidi, Tomás Ferreira-Okonkwo,
  Ingrid Solberg-Nakamura, Viktor Havel-Osei, Amara Diallo-Chen

### Klimat
Mroczny, hard sci-fi. The Expanse + Dark + Lem.
Kosmos jest zimny i obojętny. Decyzje mają ludzką cenę.
Zakończenia są niejednoznaczne — nie ma gwarantowanego happy endu.

### Systemy frakcji i lore (zaimplementowane)

- `src/data/LeaderData.js` — dane frakcji i przywódców
- `src/systems/LeaderSystem.js` — bonusy przywódcy, kadencje Konsula
- `src/systems/FactionSystem.js` — suwak frakcji, napięcie polityczne
- `src/scenes/FactionSelectScene.js` — ekran wyboru przy nowej grze
- Sfera Dysona — 20 segmentów w 4 fazach (Etap 17, ukończone)
