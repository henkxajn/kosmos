# KOSMOS — Symulator Układu Słonecznego + Strategia 4X

> **Odroczone live-gate'y** (weryfikacje w przeglądarce świadomie odroczone + luki znalezione przy próbie): `docs/deferred-live-gates.md`.

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
| `groundUnit:capturingBuilding { unitId, planetId, q, r, progress }` | GroundUnitManager | ⛔ **MARTWY — producent bez wywołań; ZERO subskrybentów** (ColonyOverlay go NIE słucha) |
| `groundUnit:buildingCaptured { unitId, planetId, q, r, buildingId, newOwner }` | GroundUnitManager | ⛔ **MARTWY U ŹRÓDŁA** — InvasionSystem subskrybuje (`:57-59`), ale event nigdy nie leci |
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

## STRATCOM — „stół holograficzny" (holotable), jedna mapa galaktyki 2.5D (H0–H6, save v92 bez migracji, live-gate PASS)

Przeprojektowanie zakładki STRATCOM: DWIE mapy obok siebie (radar 2D + galaktyka 3D, karmione tym samym
`_stratcomVisibleSystems` → redundancja „rozmyte") → JEDNA mapa („stół holograficzny"): stała pochylona płyta
z panem, głębia bez brył. Rozwiązuje redundancję i płaskość stref wpływów. Warstwa prezentacji — BEZ migracji
save. Plan: `C:\Users\Komputer\.claude\plans\troche-mi-sie-nie-curried-meerkat.md`.

- **H0** `src/renderer/HolotableCamera.js` (NEW, ZERO importu three — headless-testowalny): `orbitPosition`
  (lustro setCameraOrbit — regresja w smoke), `clampPitch`, `DEFAULT_OBLIQUE_PITCH=0.92`, `panScreenToWorld`,
  `riserEndpoints`, `computeOwnedLanes` (MST — w TerritoryRenderLogic). `setCameraOrbit` deleguje do `orbitPosition`.
- **H1 — jedna mapa**: `_drawStratcomTab` = pełnowymiarowa `_drawStratcomGalaxy` + pasek statków warp z lewej.
  USUNIĘTE (~801 linii): radar `_drawStratcom`, martwe `_drawStarCluster`/`_drawClusterInfoPanel`, flaga
  `_stratcomBig`, `stratcom_expand`. Panele „polityczny"+„operacyjny" SCALONE w `_drawStratcomDetail` + absorber
  `stratcom_detail_bg`. Warp/skany/fog-of-war/blipy/jump-gate/switchSystem zachowane. **Fix async-flash**:
  `_ensureGalaxy3D` ładuje renderer async → klatka 1 była płaskim 2D, potem skok w 3D. Teraz pending → SAMO tło
  (2D fallback TYLKO przy `_galaxy3DFailed`). **Ciągły redraw** przywrócony w `_drawStratcomTab`
  (`uiManager._dirty=true` — radar robił to przez STRATCOM_GLOW).
- **H2 — stały skos + pan**: przeciąganie = PAN po dysku (`panScreenToWorld` → `_holotablePanTarget` = look-at),
  NIE obrót. Pitch/yaw stałe. Clamp ±30 ly. Reset panu przy `close`. Zoom (scroll) bez zmian.
- **H3 — słupki (risers)**: pionowa szpilka dysk(Y=0)→gwiazda(Y=z) — `z` jako głębia bez brył
  (`RISER_COLOR/OPACITY`, `depthWrite:false`) + kropka u podstawy (CircleGeometry na dysku). Sierota w
  `_starGroup` (dispose przez `_disposeGroup` traverse).
- **H4 — strefy jako rozlane światło + warstwice** (koniec płaskości): `poolFillAlpha` (TerritoryRenderLogic,
  pure) — jasny rdzeń → gasnący front zamiast binarnego `m>=128`; wspólny helper 3D (`setTerritory`) + 2D
  (`_territoryTintCanvas`). `TerritoryField` liczy zagnieżdżone warstwice przy ISO×`CONTOUR_LEVELS` [1.5,2.2]
  (`contours:[{isoMul,loops}]`; hash niezmieniony — pochodne pola); render inner solid lines (3D static w
  `_territoryGroup`, 2D mirror dla `full`). Config `POOL_LUMA_LO/HI`, `POOL_CORE_MULT`, `CONTOUR_LEVELS`.
- **H5 — soczewka sensora**: przycisk „📡 Sensory" (`stratcom_lens_toggle`, `_sensorLens`) → pierścień zasięgu
  (obs-gated `STRATCOM_LY_BY_LEVEL`, wymaga Obs Lv4+) + obracający się sweep z zanikającym śladem (2D chrome via
  projS/projPt). Ghost-blipy wroga bez zmian. i18n `fleet.sensorLens` PL+EN.
- **H6 — warp-lane / konstelacja**: płynące światło (animowany dash) po MST (`computeOwnedLanes`, pure) między
  układami GRACZA, kolor imperium; 2D chrome via projS (działa 3D+2D). `LANE_FLOW_PX_PER_SEC=22`. ≥2 układów.

Smoke: `tmp_holotable_cam_smoke` 19 · `tmp_stratcom_smoke` 42 (przepisany: jedna mapa + H2/H5/H6) ·
`tmp_territory_contours_smoke` 13 · `tmp_warp_stratcom_smoke` 43 (przepięte z radaru na jedną mapę) + regr
territory b2-b6 / obs-scan / cross-system-leak / fc-command 0 FAIL. Pliki: `StratcomGalaxyRenderer.js`,
`FleetManagerOverlay.js`, `TerritoryField.js`, `TerritoryRenderLogic.js`, `GameConfig.js`, i18n; NEW
`HolotableCamera.js`. Backlog: kalibracja (riser/pool/sweep), foreshortening panu, invert flags kierunku panu.

---

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

## W2 — MODEL ROZMIESZCZENIA: budowa to przemysł, rozmieszczenie to ludzie (save **v101**, GATE 1+2+3 PASS — SLICE ZAMKNIĘTY 2026-08-17)

Slice W2 arca WOJNA I POKÓJ 1.0 (workstream B). Plan + rejestr decyzji: `docs/design/W2_PLAN.md`.
Kadłub schodzi ze stoczni **do REZERWY**; dopiero obsadzenie załogą (POP) czyni z niego okręt
w służbie. Commity: `7f606b7` (W2-0 piny szwów) · `7db3043`+`3f35c36` (W2-1 towary wojenne AI) ·
`c4526b6` (W2-2 `serviceState`) · `c9f728e` (W2-3 **bump v100→v101**) · `496067c` (W2-4 załoga) ·
`e84bb72` (W2-5 utrzymanie rezerwy) · `c9062a1` (W2-6 UI) · `adc0fbd` (W2-7 mobilizacja AI).

**Model (jedna oś, jeden predykat).** `vessel.serviceState` ∈ `'active' | 'stored' | 'mobilizing'`
+ `isInService(vessel)` w `Vessel.js` — **JEDYNE** źródło prawdy o służbie (obok `isEnemyVessel`/
`hasWeapons`). `mobilizing` NIE jest służbą. Brak pola = służba (stary zapis, spawn spoza stoczni).
Pola per statek: `mobilizeProgress` (civYears) · `mobilizeTarget` (`'active'|'stored'|null` — stan
`mobilizing` obsługuje OBA kierunki) · `crewLocked` (POP) · `crewStrataLocked` (rozkład po warstwach)
· `crewColonyId` (kolonia-PŁATNIK). Wszystkie przez obie białe listy `VesselManager` serialize/restore.

**Szwy magazynu — DWA i tylko dwa:** `VesselManager._onShipCompleted` (stocznia kolonijna, jedyna
ścieżka AI) i `StationSystem._spawnStationShip` (stocznia orbitalna, jedyna ścieżka okrętów wojennych
GRACZA). ⚠ `EmpireFleetMaterializer` i sonda pierwszego kontaktu tworzą kadłuby `'active'` z pominięciem
obu szwów — **flota zmaterializowana omija model załogi w całości** (filed, W3).

**Zbiór wykluczeń rezerwy** (każdy pinowany osobno): doktryny · `WarSystem._buildPlayerBattleUnit` ·
`EnemyAttackHandler._wreckPlayerVesselsInSystem` · `dispatchOnMission`/`getAvailable` ·
`ProximitySystem` · `TransportOrderSystem` · `_tickRefueling` · `_tickRepair`.

**Załoga (R-B/R-C, decyzje 7-9, 18-19).** `deployVessel`/`withdrawVessel` + `_tickMobilization` w
`VesselManager`; `DEPLOY_DURATION_CIVYEARS = 1.0` (**1.0 civYear = 1 WYŚWIETLANY MIESIĄC**, pinowane
WYKONANIEM przez prawdziwy łańcuch `time:tick`). Płacimy przy ROZKAZIE, oddajemy przy UKOŃCZENIU
wycofania. `CivilizationSystem.commitCrew/releaseCrew/killCrew`:
- ⚠ `removePop(type, count)` iteruje `for (i=0; i<count; i++)`, więc dla 0.4 zabija CAŁEGO człowieka
  (2.5× za dużo). Śmierć załogi jest **akumulatorowa** — nośnikiem ułamka jest `_growthProgress`, więc
  `humans` spada dokładnie o załogę, a inwariant `floor(humans) = Σ strata + bezrobotni` trzyma.
- ⚠ Zwolnienie jest **TYPOWANE** (`crewStrataLocked`). `_lockedPerStrata` dzieli worek z jednostkami
  naziemnymi, a `_distributeUnlock` zdejmuje proporcjonalnie do AKTUALNYCH blokad — nietypowany zwrot
  zjadałby lock garnizonu, którego własne zwolnienie klamruje się do zera (POPy zablokowane NA ZAWSZE).
- ⚠ Płaci **`crewColonyId`**, nie `colonyId`/`homeColonyId` — te są przy śmierci kolonii przepisywane
  na macierzystą GRACZA bez filtru imperium (`_onColonyDestroyed`).
- R-C: `vessel:wrecked` → `killCrew` (przemoc), `destroyVessel` → `releaseCrew` (rozbiórka/zużycie).
  OBA **zerują księgę na wejściu** — to cały mechanizm anty-podwójnego-naliczenia (`MissionSystem` ma
  obie kolejności: załoga-przed-kadłubem `:1631`/`:2417`, kadłub-przed-załogą `:1817`).
- Decyzja 18: `commitCrew` bierze **bezrobotnych, potem EKSMITUJE z najtańszej warstwy** — bez tego
  deploy byłby niewykonalny przy projektowanej równowadze AI `freePops ≈ 0`.

**Utrzymanie (R-A).** `RESERVE_UPKEEP_FACTOR = 0.10`; `getVesselUpkeepCredits` zwraca stawkę
**EFEKTYWNĄ** (5 konsumentów — rabat liczony u każdego z osobna gwarantowałby, że któryś kłamie),
`getVesselBaseUpkeepCredits` = pełna. Sortowanie naliczania: **SŁUŻBA PIERWSZA, potem najtańszy**
(rabat w kluczu odwróciłby ranking i magazyn płaciłby przed obrońcą). ⚠ **Rezerwa NIE zalega**
(decyzja 17); zamiast tego **DEPLOY jest odmawiany, gdy kolonia zalega** — a „zaległość" to
**ZATRZASK po nieopłaconym rozliczeniu, zdejmowany przy najbliższym UDANYM**, przy kadencji raz na
ROK GRY (dosypanie kredytów NIE odblokowuje natychmiast; zmierzone na GATE 2). AI **nie płaci**
utrzymania (decyzja 14, `PHASE5_TODO` przy guardzie `isEnemyVessel`).

**Mobilizacja AI (W2-7).** `DirectorMobilization` + reguła `mobilize_reserve`: trigger
`storedWarshipsAtCapital gte 1`, guardy `empireHasFreeCrew` (pierwszy konsument guardu ze Slice 1)
+ `empireOutgunnedByPlayer` (`getStrength(player) > getStrength(empire)` — **zero autorskich progów**,
parytet zatrzymuje wyścig sam), `roll` 40/30/100 displayedYear, **`delay: 0` OBOWIĄZKOWO**, porcja 2.
⚠ Kurier AI (`hull_small` z ładownią) NIE przechodzi przez tę regułę — budzi go
`EmpireLogisticsSystem._advanceRouteCourier`, w miejscu, gdzie stall był dotąd CAŁKOWICIE cichy.
Intel: `knownReserve` + `knownCrewCapacity` obok `knownMilitary` (bramka `detailed`, odświeżane tą
samą ścieżką co `knownMilitary` — inaczej zamarzłyby). Powiadomienie `NotificationCenter._handleMobilized`
bramkowane na `contact`, nazwa imperium dopiero na `detailed` — **dwa szczeble ujawnienia są zamierzone**.

**⚠ TRZY PUŁAPKI ODKRYTE PRZY OKAZJI (nie zakładaj, że ich nie ma):**
1. `EventLogSystem.TYPE_MAP` NIE miał kluczy `intel`/`combat`/`diplomacy`, choć `CHANNELS` je ma →
   `_log(text, 'combat')` lądował na kanale **system** z poprawnym KOLOREM (18 wywołań M4 P1). Naprawione.
2. `_tickRepair` szuka stoczni po `entry.buildingId === 'shipyard'`, a wpisy `BuildingSystem._active`
   mają `entry.building.id` → **naprawa statków jest martwa u wszystkich**. Pinowane jako luka, NIE
   naprawione (włączenie naprawy floty w całej grze = zmiana balansu, własny commit i pomiar).
3. `_firePending` dereferencuje wpis, który `GameState.set(..., null)` zostawia jako `null` → pierwsza
   reguła z `delay > 0` zabija tik wszystkich kolejnych imperiów. Keeper pinuje `delay: 0` dla CAŁEGO
   katalogu.

Keepery: `deploy_seams` (T1/T2/T4 świadomie odwrócone) · `w2_deploy_model` · `w2_migration_v101` ·
`w2_crew_ledger` 65 · `w2_reserve_upkeep` 27 · `w2_deploy_ui` 23 · `w2_ai_mobilization` 39.
Sweep **136/136 0 FAIL** · `check-i18n` PASS (pl=en=3240).

**GATE 3 (2026-08-17) — pętla AI, live-only, FULL PASS.** Mobilizacja odpaliła SAMA dwa razy (rok
25,35 na `emp_001`, potem `emp_002` w chwili, gdy jego pierwszy kadłub trafił do magazynu), AI
zapłaciło POP za załogę, a potem **parytet uciszył regułę** (`slabszy` → `false`). Rozdział siła /
potencjał / rezerwa widoczny w liczbach i w panelu wywiadu; powiadomienie anonimowe na `contact`
zgodnie ze specyfikacją; kurierzy `dispatched` 4 → 8. Cztery odpowiedzi domknięcia (klauzula źródła,
zagadka przelotu, symetria Rozmieść/Wycofaj, dane do rejestru): `docs/design/W2_GATE3_CHECKLIST.md`
§Domknięcie. **Pięć nowych wpisów rejestru** (`W2_PLAN.md` §Findings filed 11-15), w tym realny
defekt: **pierwszy kontakt jest w KAŻDEJ partii zsynchronizowaną parą sond z tego samego namiaru** —
klucz rzutu bez soli galaktyki (`DirectorRuleMath.js:105`) i `_courseAngle` bez `mixSeed`
(`DirectorFirstContact.js:191-196`) ⇒ oba imperia odpalają na próbie 3 i wchodzą pod 226°/227°
(ZMIERZONE). ⚠ Lekcja wiążąca dalej: **seed strukturalny wymaga rozproszenia w KAŻDYM miejscu, nie
tylko tam, gdzie się o tym nauczyliśmy** — `DirectorRuleMath.js:71-74` ostrzega przed tą klasą wprost.

---

## W3 — OFENSYWNE AI: podbój, który się trzyma i który da się odwrócić (save **v101 bez migracji**, GATE 1+2 PASS, GATE 3 **ZDANY WARUNKOWO** — SLICE ZAMKNIĘTY 2026-08-18)

Slice W3 arca WOJNA I POKÓJ 1.0. Plan + rejestr decyzji (D1-D7) + **51 findings**:
`docs/design/W3_PLAN.md`; checklisty `W3_GATE{1,2,3}_CHECKLIST.md`. ⚠ **D1 SPLIT: pokój terytorialny
ODSZEDŁ do W4** — stół pokojowy przed podbojem wyceniałby transakcję, której towar nie istnieje.
Commity: `ea05d8f` (W3-0 keeper szwów) · `efa8f85` (W3-1 odwracalny przerzut własności) · `d5a9b8d`
(W3-2 DSCS/VCS księgowane) · `1e57d1b` (W3-3 dominacja przeżywa wczytanie) · `4724e46` (W3-4
`ORDER_TYPES.attack`) · `369adfc`+`cb815cd` (W3-4b cross-system) · `a7b84bd`+`9a96382` (W3-4c
dźwignia rajdera) · `07c1087`+`61bdffe`+`807bd85`+`994935e` (W3-5/5b wybór celu + naprawa montażu) ·
`0eae716` (W3-6 desant AI) · `cced9df` (W3-7 widoczność) · `6e14b34`+`2eb9bf5` (W3-6b) ·
**`814fb38` (W3-8 retirement)** · W3-9 (docs).

**Co dowiózł (mechanizm jest MNIEJSZY niż wygląda, warunki wstępne WIĘKSZE — ten sam kształt co W2):**
- **Podbój ZOSTAJE** — `ColonyManager.transferColony` przerobiony na **odwracalny przerzut własności
  w miejscu** (lustro `captureColonyForPlayer`: kolonia zostaje w `_colonies` z pięcioma podsystemami,
  zmienia się `ownerEmpireId` + hexy). Owner ruling **D7: przegrana jest ODWRACALNA, SYMETRYCZNIE**.
- **Bitwy DSCS/VCS wreszcie księgowane** (`WarSystem.recordBattle` = jedyny księgowy) — trzecia,
  cicha ścieżka zamknięta.
- **`ORDER_TYPES.attack`** (`MovementOrderSystem._issueAttack` + `OrderService.issueAttack`) — producent
  misji, którego brakowało CAŁEMU istniejącemu potokowi orbitalnemu (`EnemyAttackHandler` bramkuje na
  `mission.type='attack'`, a jedynym producentem był cheat). Bramka **`isInService`** (D6, reason
  `vessel_in_reserve`) + bramka układu (`target_other_system`).
- **Uderzenia CROSS-SYSTEM przez PRAWDZIWĄ podróż** (W3-4b) — po tym, jak GATE 2 wyd. 1 został
  PRZERWANY na realnym defekcie klasy **„globalne id ≠ położenie"**. NEW `src/utils/SystemScope.js`
  (`systemIdOf`/`isSameSystem`, fail-open) + `WarSystem.hasPlayerPresenceInSystem` (koniec
  obrońcy-widma walczącego rok świetlny dalej).
- **`strike_player_target`** (`src/systems/director/DirectorOffensive.js` + katalog
  `DirectorRuleData`) — **AI wybiera cel SAMO**: zasięg z `InfluenceMap` (powłoka), wartość z
  `TerritoryService.getSystemDevScore`, siła z `ThreatAssessment`, eskadra 2+ przeciw obronie, dobór
  kadłubów po **`warpFuel.max > 0`** (D4 — NIGDY po id szablonu), rzut solony `GALAXY_SEED`,
  **`delay: 0` obowiązkowo**. Drabina odmów jest PRAWDOMÓWNA (`no_target_in_reach` /
  `no_warp_capable_hull` / `insufficient_squadron` / `all_orders_rejected`).
- **Desant AI z bitew `vessel_group`** (`InvasionSystem._onVesselGroupVictory`) — próg wyprowadzony
  z KADŁUBÓW zamiast abstrakcyjnej siły; frakcja naziemna najeźdźcy przestała być ludzka
  (`GroundUnitFactory` mapuje id imperium → frakcja nie-ludzka przez `mixSeed`).
- **Gracz WIDZI atak** (W3-7): `invasion:*` → `NotificationCenter` (dzwonek + Dziennik kanał Walka +
  auto-slow), stempel `empireId: 'player'` naprawiający TRZECH filtrujących konsumentów, **natywny
  `alert()` skasowany**, i18n S26 PL+EN.

**W3-8 — RETIREMENT (`814fb38`).** Wycofana CAŁA warstwa abstrakcyjnej floty: `MilitaryAI`, `EconAI`,
`EmpireFleetMaterializer`, `EmpireRegistry.spawnFleet`/`moveFleet`, gałąź `unifiedAggregator`
(+ flagi `FEATURES.fleetMaterialization`/`unifiedAggregator`), `spawnEnemyFleet`, martwe nasłuchy
`empire:fleetMoved`/`empire:fleetMaterialized`. Powód (korekta C-3): **zero wejść w normalnej grze** —
`MilitaryAI`/`EconAI` scorowały 0 od zawsze (`createEmpire` wycina `resources`, `updateMilitaryPower`
to no-op), więc dług z W2 („wycenić załogę floty zmaterializowanej") **rozpuścił się, nie został
spłacony**. ZOSTAJĄ: czytelniki `empire.fleets` (stary zapis musi się wczytać), `spawnEnemyRaider`,
`spawnEnemyAttack`, `launchInvasion`, `KOSMOS.debug.aiWarships`. `war_seams_smoke` T2 mierzyło CISZĘ
martwej pętli → przeniesione na **pin źródłowy T2b** (pętli NIE MA + kontrola pinu: Director dalej
tika).

**⚠ TRZY WARUNKI GATE 3 — każdy z osobną, przypisaną PRZYSZŁĄ pracą** (`W3_PLAN.md` §Findings 49-51;
numeracja orkiestratora 42-44): **(49)** katalog AI (`SHIP_TEMPLATES`) NIE MA roli transportowej ⇒
`no_drop_capable_hull` to jedyna osiągalna odpowiedź złącza bitwa→desant (`docs/audit/AI_DROP_HULL_AUDIT.md`)
· **(50)** desant AI biegnie na modelu **LEGACY** (`GROUND_UNITS`), nie archetypach — inny balans
(60 HP/12 atak vs 15 HP/7), brak morale/zaopatrzenia, sprzeczne domyślne morale ⇒ jednostka rozpada
się po pierwszym trafieniu, chyba że grę przeładowano (`docs/audit/GROUND_UNITS_AUDIT.md`) ·
**(51)** **desant AI NIGDY nie kończy się przejęciem kolonii** — `_tryPlayerCapture` nie ma lustra po
stronie AI; §4/§5 gate'u zweryfikowane OBEJŚCIEM przez `transferColony`.

**⚠ Trzy lekcje wiążące dalej** (poza tymi z W2): **globalne id ≠ położenie** — encja ma jedno id
w całej galaktyce, ale współrzędne są WEWNĄTRZ układu (gwiazda w (0,0)); porównuj układy, nie id ·
**„skonstruowany ≠ zamontowany"** — reguła żyła i była oceniana, ale brak wiersza w bloku lokatora
`GameScene` czynił ją NIEWIDZIALNĄ dla gate'u (wszyscy konsumenci czytają przez `?.`, więc **nic nie
krzyczy**); keeper musi pinować **SPOSÓB SKŁADANIA SCENY**, nie zachowanie przy gotowej scenie ·
**księgowy musi domknąć własne księgi, ZANIM przemówi** — `recordBattle` emitował `battle:resolved`
przed `_updateOrbitalDominance`, więc bramka desantu czytała świat SPRZED ogłaszanej bitwy.
⚠ I reguła instrumentu: **NOWY POWÓD ODMOWY DOŁĄCZA DO `DebugLog.TRACKED_EVENTS` W TYM SAMYM
COMMICIE** — dwa razy w W3 gate zmierzył CISZĘ tam, gdzie system mówił.

**⚠ STANDING LESSON (proces, nie kod):** pisanie plików przez CC — **także raportu z audytu
read-only** — przeładowuje kartę gracza przez **Live Server** i **resetuje stan runtime do ostatniego
zapisu**. Audyty uruchamiamy, gdy gracz nie ma otwartej karty (albo gracz wie z góry, że karta
się przeładuje); **CC nie pisze w trakcie gate'u** (to ta sama reguła co „gate nigdy równolegle z CC",
teraz z zapisanym mechanizmem: konflikt to file watcher, nie uwaga).

Keepery W3: `w3_dominance_persist` 16 · `w3_attack_dispatch` 35 · `w3_cross_system_attack` 42 ·
`w3_raider_lever` 24 · `w3_target_selection` 30 · `w3_foreign_arrival_gate` 5 · `w3_director_mounting`
17 · `w3_ai_invasion` 23 · `w3_attack_visibility` 42 · `w3_battle_booking` 19 · sondy
`probe-w3-seams`/`probe-w3-targets`. Sweep **148/148 0 FAIL** (stan W3; dziś **165/165** — patrz blok BRAMKA WŁASNOŚCI CZĘŚĆ II) · `check-i18n` PASS.

**NASTĘPNE (osobne, nowe sesje — NIE w tym wątku):** **W4 — pokój terytorialny** (charter
`WAR_BACKBONE.md` §6a + addendum po W3) · nowy gate **„AI przejmuje kolonię"** (Finding 51) ·
**katalog transportowca AI** (Finding 49) · slice **GROUND** (S12 morale → R13 RNG → pule desantu na
archetypy, Finding 50).

---

## AI_CAPTURE — podbój, który AI domyka SAMO (save **v101 bez migracji**, GATE 1 + GATE 2 oba PASS — SLICE ZAMKNIĘTY 2026-08-20)

Slice arca WOJNA I POKÓJ, workstream B. Plan + 9 decyzji + rejestr: `docs/design/AI_CAPTURE_PLAN.md`;
audyt wejściowy `AI_CAPTURE_AUDIT.md`; checklisty `AI_CAPTURE_GATE2_CHECKLIST.md`.
Commity: `990255f` (AC-7) · `bb614ed` (AC-8) · `105b873` (AC-9) + wcześniejsze AC-0…AC-6.

**Jedno zdanie:** W3 dowiózł uderzenie (AI wychodzi z domu, wygrywa orbitę, zrzuca wojsko), ale
**zdobycz nie zmieniała właściciela z własnej inicjatywy AI**. Ten slice domknął ostatni krok pętli.

**Co odblokowało pętlę** (mechanizm istniał — brakowało intencji, bramek i księgowości):
- **AC-4** — jednostka desantowa dostała **cel terytorialny** (marsz na `capitalBase`, fallback:
  najbliższy kafel z budynkiem). ⚠ To rozwiązało **deadlock**: dotąd `_tickCombatAI` celował wyłącznie
  w ŻYWĄ jednostkę gracza i przy `if (!best) continue` stawał, więc warunki „armia wybita" i „stolica
  zdobyta" były **wzajemnie wykluczające się**.
- **AC-5** — symetryczny predykat obrońcy: blokuje **każda żywa** jednostka (był filtr `role==='military'`).
- **AC-6** — ciało **bez stolicy** (placówka) stało się zdobywalne (retire bramki `if (!capital) continue`).
- **AC-7** — **jedna kampania na ciało** (koniec podwójnych fal, jedno `colony:captured`).
- **AC-8** — higiena po utracie + `game:over` `reason:'conquered'` (D5 + **D9=W3**, karencja 12 civY).
- **AC-9** — gracz **widzi**, że traci teren (`tile:ownerChanged` → dzwonek + Dziennik/Walka).
- **AC-3 (D8)** — **partia zaczyna się PUSTA**: zero jednostek startowych po obu stronach. To warunek,
  przy którym symetryczny predykat AC-5 jest uczciwy — nikt nie dostaje wojska za darmo.

**GATE 2 PASS w całości (2026-08-20):** §1 księga · §2 widoczność · §3 higiena · **§4-A rekolonizacja
realnie osiągalna** (zmierzone end-to-end trasą warp: `getPlayerColonies()` 0 → 1, statek skonsumowany) ·
**§4-B ekran końca gry pada** („CIVILIZATION DESTROYED", tekst o **podboju**, nie o wymarciu) ·
§5 regresja odbicia (potwierdzona wcześniej dwukrotnie: W3 GATE 3 §5 + GATE P0 §7).

⚠ **§3 kosztował osobny blok pracy i to był dobry koszt** — ujawnił, że higiena AC-8 **nie przeżywa
wczytania zapisu**. Domknięte arciem **BRAMKA WŁASNOŚCI, blok P0** (sekcja niżej).

⚠ **ŚWIADOMIE OTWARTE (nie blokuje zamknięcia):** **Finding 49** — katalog AI **nie ma kadłuba
transportowego**, więc *produkcyjne* wejście AI w desant pozostaje zamknięte (gate wchodził dźwignią
`WarOverlay force_invasion`) · **Finding 50** — desant AI biegnie na modelu **LEGACY**, nie archetypach ·
✅ **Finding 111 (P1)** — `canReverseFate` liczył *istnienie* kolonizatora, nie *zdolność*;
**ZAMKNIĘTY 2026-08-20** (sekcja niżej).

⚠ **Trzy drobne findingi z domknięcia GATE 2** (żaden nie blokował): **112** ekran „CIVILIZATION
DESTROYED" (`UIManager._drawGameOver:2412-2475`) **nie ma pojęcia zawijania** — wszystkie pięć napisów
to gołe `fillText` w ramce o zaszytych `DW=420, DH=180`; nowy tekst o podboju ma **100 zn. wobec 49**
najdłuższego dotychczasowego, stąd przepełnienie (⚠ helper `_wrapText:2800` istnieje **w tej samej
klasie**, nigdy niepodłączony; ⚠ `DH=180` zostawia ~20 px zapasu, więc zawinięcie zderzy się z linią
niżej) · **113** (wpis **samodzielny**, nie dodatek do 112) ten sam ekran ma **zahardkodowany polski**
(`Czas przetrwania…` `:2460`, `NOWA GRA` `:2472`) — gracz EN widzi polskie napisy w jednym
z najbardziej pamiętanych miejsc gry. ⚠ **MARTWY KĄT NARZĘDZIA:** `check-i18n` pyta „*czy klucz
użyty w `t()` istnieje w PL i EN*", a **nie** „*czy każdy widoczny napis przechodzi przez `t()`*" —
literał w `fillText` jest dla niego **niewidzialny**, więc bramka przechodzi mimo polskiego UI.
⇒ kandydat na poprawkę **samego narzędzia** (wykrywanie literałów w `fillText`/`strokeText` poza
`t()`), nie tylko tego ekranu; ⚠ zasięg w reszcie UI **niezmierzony** · **114** `debugLog.query` pusty przy
działającym ekranie: mechanizm **sprawny** (kształt zapytania OK, oba zdarzenia w `TRACKED_EVENTS`,
`clear()` nie leży na tej ścieżce) ⇒ przyczyna **środowiskowa**.
⚠ **REGUŁA Z 114: `debugLog` NIE przeżywa restartu sceny** (`GameScene:1914`) — odczyty gate'u zbierać
w tej samej partii i karcie; **nie opierać kryterium PASS na odczycie, który może być pusty z powodu
cyklu życia sceny**.

**Kolejność dalszych prac (ustalona z właścicielem 2026-08-20):** **1.** ~~Finding 111~~ ✅ **ZROBIONE** →
**2.** część II `COLONY_OWNERSHIP_GUARD_PLAN` (D1-D6) → **3.** reszta rejestru (97, bug mapy 108-110,
przepełnienie tekstu na ekranie końca gry).

---

## BRAMKA WŁASNOŚCI KOLONII — blok P0: wczytanie nie oddaje gracza koloni wroga (save **v101 bez migracji**, GATE P0 §1-§7 PASS — BLOK ZAMKNIĘTY 2026-08-20)

> ⚠ **CZĘŚĆ II (D1-D6 + Finding 97) JEST ZAMKNIĘTA — sekcja niżej.** Ten blok opisuje wyłącznie P0.

Slice **przekrojowy, NIE należący do AI_CAPTURE**. Plan + 10 decyzji + rejestr:
`docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md`; audyt read-only: `docs/audit/COLONY_OWNERSHIP_GATE_AUDIT.md`;
checklista: `COLONY_OWNERSHIP_GATE_P0_CHECKLIST.md`. Commity: `e86c091` (OG-0 keeper szwów) ·
`0085a37` (OG-2 naprawa) · `a03be51` (docs) · `c4ab33b` (checklista) · `6796617` (fix po §6).

**Jedno zdanie:** gra ma bramkę **„KTÓRA kolonia"** i nie ma bramki **„CZYJA"** — `switchActiveColony`
sprawdza ISTNIENIE (`ColonyManager.js:262-264`), a guard `window.KOSMOS?.buildingSystem !== this`
(`BuildingSystem.js:99-102`, 35 wystąpień w repo) sprawdza AKTYWNOŚĆ. **Żadne nie pyta o właściciela.**
⚠ Dziura jest **PRE-EXISTING** (guard stoi w pierwszym commicie repo, `9951d5e`, 2026-03-01); warunkiem
koniecznym osiągalności była **W3-1** (`efa8f85` — przejęta kolonia ZOSTAJE w `_colonies`), **nie AC-8**.
⚠ **Gracz nie „kradł sobie gospodarki" — KARMIŁ gospodarkę wroga**: `_activateBuilding:755` rejestruje
producenta na WŁASNEJ instancji koloni, więc kopalnia była płacona z magazynu wroga i produkowała do
magazynu wroga; `switchActiveColony` przecelował tylko HUD.

**Blok P0 (podpisany 2026-08-19, wdrożony i zweryfikowany 2026-08-20) — zamknięcie ścieżki WCZYTANIA:**
- **P0-A=W1** — `ColonyManager.restore` **nie wiąże już niczego** (było: uzbrojenie `_activePlanetId`
  z samej flagi `isHomePlanet` + wiązanie **DWÓCH z pięciu** wskaźników, ślepo na własność, wbrew
  inwariantowi `switchActiveColony` „NIGDY stale-inna-kolonia"). Zapisany `activePlanetId` to teraz
  PODPOWIEDŹ (`_pendingActivePlanetId`). NEW **`resolveActiveColonyAfterRestore()`** — drabina:
  zapisana-jeśli-gracza → dom-jeśli-gracza → dowolna kolonia GRACZA → `_detachActiveColony`.
  Wołane z bloku odroczonego `GameScene`, **wyjętego spod `if (homePlanetId)`**.
  ⚠ **KOLEJNOŚĆ JEST KONTRAKTEM:** blok biegnie **PO** `relinkColoniesAfterRestore` (`GameScene:2046`,
  synchronicznie) i jako **JEDYNE** miejsce w łańcuchu ładowania widzi `ownerEmpireId`.
- **P0-B=W1** — własność zostaje **WYPROWADZANA** z `empires[].colonies` (`EmpireColonyBootstrap.js:543`
  mówi to wprost). **Bez zmiany formatu zapisu.**
- **P0-C=W2** — `transferColony` **czyści** `colony.isHomePlanet` **PO** snapshocie `wasHomePlanet`
  (inaczej „Stolica utracona" cicho degraduje do „Kolonia utracona"); `captureColonyForPlayer`
  **przywraca** flagę przy odbiciu WŁASNEJ stolicy. Dwa **podpisane** skutki uboczne: ex-dom przestaje
  być niezniszczalny; wpada w gałąź heal-up przy restore (już dziś ślepą na własność dla kolonii AI).
- **P0-D=W1** — `removeColony:667` miał **NIEUTWARDZONEGO BLIŹNIAKA** fallbacku AC-8 i był **ŻYWY**:
  test PRZYNALEŻNOŚCI (`_colonies.has`) zamiast własności ⇒ po przejęciu stolicy zniszczenie
  **dowolnej innej** aktywnej koloni gracza (kolizja, wyrzucenie, `entity:removed`) przepinało wszystkie
  pięć wskaźników na kolonię WROGA. Drabina wyciągnięta do `_pickFallbackActiveColony(excludeId)` —
  jedno źródło dla **trzech** ścieżek (utrata / zniszczenie / wczytanie).

**⚠ GATE P0 §6 PADŁ i to była wartość gate'u.** Kryterium „**nic nie rzuca wyjątkiem**" (nie „panel jest
pusty") złapało crash **co klatkę**: `GroundUnitPanel._drawActions` → `ColonyManager._canRecruitMoreUnits`
(`colony.planetId` przy `colony === null`), a za nim **drugi, ukryty**: `_getMaxGroundUnits`
(`colony.civSystem`, wołany z `GroundUnitPanel:623`). Naprawione w `6796617`. **Żaden nie był defektem
P0** — to ta sama KLASA w pliku, którego P0 nie dotykał.
⚠ **LEKCJA WIĄŻĄCA DALEJ:** `mgr?._method?.(nullColony)` — **opcjonalne łańcuchowanie chroni ODBIORNIK,
nigdy ARGUMENT**. Guard należy do **helpera**, bo to helper jest kontraktem; poprawka wyłącznie
u wołającego zostawia minę następnemu.
⚠ **`GroundUnitPanel` i `FleetManagerOverlay` IMPORTUJĄ SIĘ pod node** (inaczej niż `GameScene`/
`ColonyOverlay`), a `getColony` jest **wstrzykiwane do konstruktora** ⇒ tę klasę paneli da się pinować
**WYKONANIEM** (prawdziwa pętla `draw()` na atrapie ctx z `getColony: () => null`).

**Keepery:** `colony_ownership_seams` 11 (⚠ trzy szwy świadomie odwrócone; **S4 ŻYJE** — `switchActiveColony`
przyjmuje kolonię AI, to **D1**) · `colony_ownership_load` 33 (⚠ **T8 pinuje ŹRÓDŁOWO SPOSÓB SKŁADANIA
SCENY**: wywołanie istnieje, stoi **PO relinku**, nie jest zagnieżdżone w bramce — pin kolejnościowy
**dowiedziony MUTACJĄ źródła**, bo bez niego przeniesienie wywołania przed relink odtwarzało defekt
w całości przy **zielonych** keeperach) · `zero_colony_panels` 11 (wykonaniowy).
Sweep **159/159 0 FAIL** · `check-i18n` PASS.

**⬜ NIEPODPISANE i NADAL ŻYWE (D1-D6, osobny podpis):** **D1** ścieżka klikana (4 wejścia:
`GameScene:3287-3295` `system:switched` bierze `cols[0]` z `getAllColonies()` filtrowanego tylko po
`systemId` · `BottomContext:423` · `GameScene:5366` · `EventLogOverlay:348`) · **D5** przynależność kafla
(⚠ `_build` **zero** odwołań do `this._grid` w `:796-1015`; stan „mój portfel, cudzy kafel" jest żywy
**już dziś** przez zaprojektowany podgląd obcej planety — `show({colonyId})` nie woła
`switchActiveColony`, a pasek budowy bramkuje tylko `!isPreview`) · **D2/D3/D4/D6**.
⚠ **Klasa A to nie „34 miejsca"**: **9** żywych bramek intencji gracza · **8** systemowych (termin
własności byłby tam **błędem kategorii**) · **17** martwych (zdarzenie bez emitenta).

**Findings 69-114** (rejestr w planie). ⚠ **NAJCIĘŻSZE jest 111 (P1, niżej); 97 jest drugie i też ZMIERZONE:**
🔴 **kolonia WROGA płaci za utrzymanie floty gracza** — `VesselManager._resolvePayHomeId:2062-2067`
filtruje **tylko** `!col.isOutpost`, bez terminu własności, z fallbackiem na nigdy nieprzecelowywany
`homePlanet`; po W3-1 zdobycz zostaje w `_colonies`, więc płaci. Zmierzone: 300 Kr/rozliczenie,
5000→3094 przez 80 lat, `unpaidYears` = 0. ⚠ **Osiągalne przy ŻYWYCH koloniach gracza** (statek
w drodze do koloni, która zostaje przejęta) — nie chowa się w scenariuszu D9. **Ta sama rodzina co
D1-D6; zakres NIEROZSTRZYGNIĘTY** — do decyzji przy podpisywaniu części II planu.
**98-105** (audyty kolonizacji) — bez decyzji o zakresie; m.in. `createMission('colonize')` ma **ZERO**
wołających produkcyjnych (100), a trasa „obca" blokuje POPy załogi **na zawsze** (102) i osierocą
jednostki z `troop_bay` (107). Raporty: `docs/audit/COLONIZE_PATH_ZERO_COLONY_AUDIT.md` ·
`docs/audit/WARP_COLONIZE_ROUTE_AUDIT.md`.
🔴 **106 — TRASA ZADOKOWANA JEST PRZY ZERZE KOLONII ŚLEPYM ZAUŁKIEM.** Bramka przechodzi
(`canLaunchColony` `ok:true`, `canExecute` `{ok:true}`, przycisk **aktywny**), a klik umiera cicho
w `MissionSystem._launchColony:648`, bo `_detachActiveColony` wyzerował `missionSystem.resourceSystem`.
Zmierzone: misji przed/po **0/0**. ⚠ **Unieważnia werdykt 1** poprzedniego audytu (sprostowanie wpisane
w jego nagłówku). ⚠ **LEKCJA WIĄŻĄCA: przy pytaniu „czy X działa" BRAMKA NIE JEST ODPOWIEDZIĄ** —
dowodem jest SKUTEK (`getPlayerColonies()` 0 → 1, statek znika z rejestru).
🔴 **111 (P1, NAJCIĘŻSZE) — `canReverseFate` liczy statki, ktore NIE MAJA JAK NIC ZROBIC ⇒ gra,
ktora NIGDY sie nie konczy.** `PlayerViability.js:57` sprawdza istnienie kadluba z habitatem i **zero**
stanu (dok/orbita/misja), a `_tickPlayerViability` (`ColonyManager.js:314`) zeruje licznik karencji przy
kazdym tiku, dopoki `state.ok`. Zmierzone trzy konfiguracje: **w locie/po warpie** 0 → 1 ✅ ·
**zadokowany przy traconej koloni** — `transferColony:838-843` go niszczy, predykat poprawny ✅ ·
**zadokowany gdzie indziej / dryfujacy po `moveToPoint`** — liczony jako ratunek, a nie moze nic ⇒
🔴 **LIMBO bez konca gry**. ⚠ Trzecia konfiguracja to ta, na ktora wlasciciel trafil w normalnej grze.
⚠ D9 stoi na przeslance, ktora opisuje BRAMKE, nie skutek (Finding 106) — to powrot D9 na stol,
nie poprawka. Kandydat na osobny **P1**.
🔴 **108-110 — BUG MAPY STRATCOM, blokuje sterowanie grą** (poza tematem tego arca): **108** zaznaczony
statek warp ukrywa `cluster_switch`, jedyne wejście do widoku układu, a `warp_order_cancel` **nie czyści**
`_selectedWarpShipId` ⇒ pułapka · **109** klik iteruje strefy od końca, hover od początku ⇒ przy
nakładających się gwiazdach **hover pokazuje bliższy układ, klik wybiera dalszy** (15/15 zmierzonych) ·
**110** ikona statku w martwym pasie nad gwiazdą, klik cicho połykany.
⚠ `FleetManagerOverlay` **NIE dziedziczy po `BaseOverlay`** — `_hitTest` z `.find()` tu nie obowiązuje.
✅ **Obejście:** `switchActiveSystem` wołają chipy `MapLabelLayer:541`, Outliner i górny pasek zasobów.
**95/96** to **obserwacje z gate'u, NIEZBADANE**:
**95** statek ze stoczni orbitalnej na koloni WTÓRNEJ po utracie stolicy wychodzi jako **obcy/nieznany
kontakt** i nie trafia na listę rozmieszczenia (⚠ kontekst: `createAndRegister:186-211` **nigdy** nie
stempluje własności, więc stempel wroga musi pochodzić skądinąd) · **96** czy utrata głównej koloni
osierocą stację orbitalną **drugiej** koloni (⚠ `transferColony`, w odróżnieniu od `removeColony`,
**nie emituje** `colony:destroyed`, na którym stoi mechanizm osierocenia z S3.4c). ⇒ **osobny audyt.**

---

## BRAMKA WŁASNOŚCI KOLONII — CZĘŚĆ II: D1-D6 + Finding 97 (save **v101 bez migracji**, GATE OG-1/OG-1b/OG-3 live PASS, GATE 2 headless — ARC ZAMKNIĘTY 2026-08-22)

Domknięcie arca rozpoczętego blokiem P0. **Podpis części II: 2026-08-22** — D1=W2+W1 · D2=W3+W1 ·
D3=W1 · D4=W3+flash · D5=W1 · D6=W2, plus **Finding 97 w zakresie** jako osobny commit.
Plan + rejestr: `docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md`. Commity: `4c928ca` (podpis) ·
`f63ef74` (OG-1 / D5) · `01a1b2d` (OG-1b) · `89c78e7` (OG-3 / D1+D2) · `6973639` (OG-4 / D4) ·
`6423b59` (GATE 2 headless) · `f89c1d2` (OG-5 / D6) · `80adbf2` (OG-3b / Finding 97) · OG-6 (docs).

**Jedno zdanie:** gra miała bramkę **„KTÓRA kolonia"** i nie miała bramki **„CZYJA"**; P0 zamknął
ścieżkę wczytania, część II zamyka **wszystkie cztery pozostałe powierzchnie** — wiązanie, szynę
zdarzeń, panel i rozliczenie okresowe.

⚠ **SKUTEK BYŁ ODWROTNY, NIŻ BRZMI.** Nie „gracz kradnie sobie gospodarkę", tylko
**gracz KARMIŁ gospodarkę wroga**: `_activateBuilding` rejestruje producenta na WŁASNEJ instancji
koloni, więc kopalnia postawiona na związanej koloni wroga była płacona z magazynu WROGA
i produkowała do magazynu WROGA — a `switchActiveColony` przecelowywał tylko HUD.

**Cztery powierzchnie, cztery różne bramki** (i to jest sedno — żadna nie zastępuje pozostałych):

| powierzchnia | bramka | gdzie |
|---|---|---|
| **przynależność kafla** (D5/OG-1) | `_isOwnTile` — `grid.get(q,r) === tile`, **tożsamość, nie współrzędne** | `BuildingSystem._build/_upgrade/_demolish` |
| **kontrola kafla** (OG-1b) | `_isTileControlledByOther` — `tile.owner` z okupacji; **tylko rozbiórka** | `BuildingSystem._demolish` |
| **wiązanie koloni** (D1/OG-3) | odmowa w `switchActiveColony` + **dziewiątka bramek intencji** (D2) | `ColonyManager`, `BuildingSystem`/`FactorySystem`/`CivilizationSystem` |
| **panel** (D4/OG-4) | allowlista + inwariant na górze `_onHit` + wygaszeni producenci | `ColonyOverlay`, NEW `ColonyOrderGuard.js` |
| **rozliczenie okresowe** (Finding 97/OG-3b) | termin własności w `_resolvePayHomeId` **i w jego fallbacku** | `VesselManager` |

**Kanon (D6/OG-5):** NEW `src/utils/ColonyOwnership.js` — **rodzina nazw**, nie jeden przeciążony
predykat: `isPlayerColony(colony)` · `isPlayerColonyId(planetId)` (fail-closed) ·
`isLivePlayerColony` (+`resourceSystem`) · `isManageablePlayerColony` (+`!isPreview && !isOutpost`).
`ColonyManager.isPlayerColony` **deleguje** (~40 konsumentów nietkniętych). Osiem nazwanych kopii
zmigrowanych. **Zero migracji save (v101), zero nowych kluczy i18n poza trzema powodami odmowy.**

---

### ⚠ Reguły, które wychodzą poza ten arc

1. **`node --check` NIE jest testem.** W OG-4 producent trafił w `_drawWorkforceTab` (**legacy V1**),
   podczas gdy żywa jest `_drawWorkforceTableV2` — `ordersOk` było w V2 **używane bez deklaracji**
   i żywa tabela rzuciłaby `ReferenceError` przy pierwszym rysowaniu. Składnia była poprawna.
   ⇒ **W `ColonyOverlay` żyją pary „V1 legacy + V2 żywa"; pin producenta MUSI nazwać ŻYWĄ.**
2. **Pin, który celuje w martwą ścieżkę, świeci na zielono dokładnie tam, gdzie jest defekt.**
   Ta sama runda złapała to tylko dzięki **kontroli pinu**. Każdy pin źródłowy bez kontroli jest
   zgadywaniem.
3. **Predykat opisany w komentarzu ≠ predykat egzekwowany.** `isPlayerColony` przez cztery commity
   miało w dokumentacji ostrzeżenie „bierze OBIEKT, nie id", a kod **przepuszczał string**
   (`'p_ai'.ownerEmpireId === undefined` ⇒ „kolonia gracza" dla DOWOLNEGO id).
4. **Allowlista jest bezpieczniejsza od bloklisty, ale ma cenę: pominięty ODCZYT też zostaje
   zablokowany.** `wfInfo` (tooltip satysfakcji) wypadł z pierwszej wersji i znalazła go dopiero
   ekstrakcja **wszechświata etykiet** (`_addHit` + `case`, 68 pozycji).
5. **Jałowa kontrola pinu to fałszywa zieleń.** Trzy złapane w tym arcu: listener rejestrowany przed
   `GameCore.boot()` (który woła `EventBus.clear()`), `setCredits` przez nieistniejące `addCredits`,
   porównanie `0 Kr` z `0 Kr` bez własnego statku.
6. **Nie podnoś stuba w `node_modules/`, żeby zazielenić test.** `ColonyOverlay` nie importuje się
   pod node (`PlanetTextureUtils:16` → `new THREE.TextureLoader()`); stub jest **gitignorowany**,
   więc łatka dawałaby zieleń wyłącznie na jednej maszynie. Granicę dowodu nazywa się wprost.
7. **Furtki tylko wtedy, gdy pomiar ich wymaga.** Plan przewidywał dwie (`GameCore`,
   `CombatSandbox`) — pomiar pokazał, że **oba wiążą planetę macierzystą gracza**, więc przechodzą
   samym terminem. Zero furtek; sweep 165/165 to potwierdza.

---

### ⚠ Otwarte po tym arcu (żadne nie blokuje)

- 🟠 **Brak płatnika = flota DARMOWA** (pin F6 w `fleet_upkeep_payer_smoke`): `_resolvePayHomeId`
  zwraca `null`, a `_tickVesselMaintenance` robi `if (!homeId) continue`. Osiągalne, gdy gracz
  stracił dom, a `window.KOSMOS.homePlanet` nadal go nazywa. Zamknięcie = **trzeci szczebel
  drabiny** („dowolna żywa kolonia gracza"), poza podpisem OG-3b.
- **Obserwacja UX z GATE OG-3 §3:** klik na kolonię AI na mapie 3D + „mapa ciała" **przekierowuje
  na WŁASNĄ kolonię** zamiast stanu neutralnego. Nie wyciek (`activePlanetId` się nie zmienia) —
  myląca prezentacja. To wejście woła `switchActiveColony` + `openPanel`, a nie zaprojektowany
  podgląd `show({colonyId})`.
- **Zahardkodowany polski w `ColonyOverlay:171-173`** — trzy flashe sukcesu budowy
  (`'⏳ W kolejce…'`, `'🔨 Budowa rozpoczęta'`, `'✓ Zbudowano'`). Ta sama klasa co **Finding 113**;
  `check-i18n` ich nie widzi (pyta o klucze w `t()`, nie o napisy w `fillText`/flashu).
- **Backlog (decyzja właściciela: NIE w tym arcu):** lazy-init loadera w `PlanetTextureUtils`
  odblokowałby import `ColonyOverlay` pod node i **wykonaniowe** testowanie całej warstwy UI.
- **D1-D6 nie objęły wejść NAWIGACYJNYCH** — 4 miejsca wołające `switchActiveColony` bezpośrednio
  (`GameScene:3302`, `BottomContext:424`, `CivilizationOverlay:730`, `EventLogOverlay:368`) są dziś
  bezpieczne **przez odmowę**, ale żadne nie oferuje stanu neutralnego.

**Keepery arca:** `colony_tile_membership` 48 · `colony_ownership_guard` 30 · `colony_order_guard` 61
· `colony_ownership_canon` 40 · `fleet_upkeep_payer` 19 · `colony_ownership_seams` 11 (**S4 odwrócony
— wszystkie cztery szwy zamknięte**) · `colony_ownership_load` 33 · `zero_colony_panels` 11.
Sweep **165/165 0 FAIL** · `check-i18n` PASS.

---

## Finding 125 — „Powrót do bazy" nie brykuje statku (naprawa IZOLOWANA, save **v101 bez migracji**, live-gate + re-gate PASS, commit `cc20af5`)

Mała, samodzielna naprawa **poza** arciem VESSEL_ORDERS (P0-P5 zostaje osobnym, podpisanym planem).
Rejestr: `docs/design/UNIFIED_VESSEL_ORDERS_AUDIT.md` §Findings 125 (wpis zamknięty, z pełnym inwentarzem).

**Defekt:** rozkaz powrotu z obcego układu **kłamał o stanie statku**, żeby przejść bramkę dyspozytora
(`status='idle'; position.state='docked'; mission=null`), a kłamstwa **nikt nie cofał**, gdy skok odpadał —
najczęściej z braku `warp_cores`, czyli dokładnie wtedy, gdy gracz ten przycisk klika. Statek zostawał
„zadokowany" przy ciele **BEZ portu**. ⚠ **Sprzeczności nie było w bramce** — `canLaunchFromCurrent`
odpowiadała poprawnie o stanie, który rozkaz sam przed chwilą sfałszował.

**⚠ KŁAMSTWO BYŁO ZBĘDNE OD POCZĄTKU:** `dispatchInterstellar` (`VesselManager:757-763`) przyjmuje `docked`
**I** `orbiting` i we własnym komentarzu pisze „Status nie blokuje"; `WarpRouteSystem.canOrder:51-53` tak samo.
Jedyny stan blokujący skok to lot w układzie (`in_transit`).

**Naprawa — NEW `src/utils/ReturnJump.js`** (czysty moduł, zero importów, wzór `MovementOrderCancellation.js`):
`returnJumpTransactional(vessel, jumpFn)` — snapshot → przygotuj **MINIMUM** (tylko `in_transit`, i to do
**swobodnego dryfu** `orbiting`+`dockedAt=null`, **nie** do fałszywego doku) → skok → przy odmowie przywróć
stan **CO DO POLA** (z `pendingOrder` włącznie — odmowa nie kasuje zakolejkowanej dostawy gracza).
⚠ **Ścieżka sukcesu jest ścisłym NO-OPEM** względem starego kodu: `dispatchInterstellar` i tak nadpisuje
wszystkie cztery pola. Zmienia się **wyłącznie** zachowanie przy odmowie. Wzór zasady stoi w tym repo od dawna:
`VesselManager.dockAtColony` przy braku portu **nie dokuje na siłę**, tylko zostawia statek na orbicie.

**CZTERECH producentów tego samego przycisku** (grep `position.state = 'docked'` dał 5 zapisów: 2 prawdziwe
dokowania + te 4) — wszyscy przez jedną transakcję: `OrderService.issueReturn` (rejestr floty) ·
FMO `interstellar_return` (ekran „Interstellar Arrival") · FMO `foreign_return`/`foreign_return_from_recon`
(panel obcego układu) · `FleetActions.return_home.execute` (**uśpiony** bliźniak — `FleetPanel`/`FleetTabPanel`
nie są nigdzie importowane; utwardzony mimo to, bo nieutwardzony bliźniak to mina — lekcja `removeColony:667`).

**Dogrywka po 1. live-gate — brak POWODU:** gracz zobaczył „Cannot issue order" bez wyjaśnienia i podejrzewał
**piątego producenta**. Zmierzone renderem: piątego **NIE MA** (ekran „Interstellar Arrival" wystawia
`interstellar_return`, już objętą). Realnym defektem był brak powodu: te przyciski wołały `dispatchInterstellar`,
który zwraca **GOŁY BOOL**. Przepięte na `OrderService.issueWarp` (cel skoku **bez zmian** — ten sam `systemId`
z hit-zony) ⇒ „Nie można wydać rozkazu — ✗ Za mało rdzeni warp". Były to **ostatnie surowe wywołania dyspozytora**
wśród przycisków powrotu. ⚠ **Konsekwencja ZADEKLAROWANA:** powrót idzie teraz przez planer wielo-przeskokowy
(ten sam silnik co „Powrót" z rejestru), więc trasa dłuższa niż jeden skok zostanie **ZŁOŻONA** zamiast po cichu
odmówić.

**⚠ `KOSMOS.debugLog` NIE JEST instrumentem floty** (zmierzone WYKONANIEM, keeper T13): to audyt
AI/wojny/dyplomacji z **zamkniętą** listą `TRACKED_EVENTS`, w której nie ma **ANI JEDNEGO** zdarzenia floty,
a rozkazy floty nie ruszają `GameState` (brak nawet wpisu `state`). **Pusty `tail()` NIE ROZRÓŻNIA ŚCIEŻEK** —
milczy tak samo dla naprawionej i nienaprawionej; live-gate wyciągnął z tej ciszy fałszywy wniosek i słusznie,
bo instrument nie mówił prawdy o swoim zasięgu. Kanałem floty jest **Dziennik** (`EventLogSystem`, `channel:'fleet'`)
— odmowa pisze tam `severity:'warn'` (toast jest ulotny, wpis zostaje). ⚠ **NIE dopisywać zdarzeń floty do
`TRACKED_EVENTS`** — to rozcieńczyłoby narzędzie zbudowane pod audyt AI.

**Świadomie POZA transakcją:** `abortForeignRecon` — sam ląduje statek w pełni wykonalnym
`exploration/orbiting_body`, więc odmowa zostawia go SPRAWNYM; cofanie dałoby hybrydę (misja przemianowana,
pozycja przywrócona) = **nowe limbo**.

**Testy:** keeper `src/testing/smoke/return_home_no_brick_smoke.mjs` **77/77** (T1-T13). ⚠ **T12 = pin RENDERU**
(który ekran wystawia którą hit-zonę) — **pin, którego brak kosztował jedną rundę live-gate'u**; T10 = pin
źródłowy (komentarze zdejmowane) z **dwiema** kontrolami pinu; T13 = cisza `debugLog` z kontrolą pinu.
Sweep **160/160 0 FAIL** · `check-i18n` PASS · zero migracji · **zero nowych kluczy i18n** (reuse słownika
`_warpErrLabel` + `fleet.warpOrderFailed`).

**NASTĘPNE (kolejka właściciela, NIE w tej sesji):** ~~Finding 111~~ ✅ **ZROBIONE** (sekcja niżej) →
**VESSEL_ORDERS** (P0-P5, osobny podpisany plan) → reszta rejestru.

---

## Finding 111 — predykat końca gry pyta o ZDOLNOŚĆ, nie o ISTNIENIE (save **v101 bez migracji**, live-gate §1-§4 PASS, ARC ZAMKNIĘTY 2026-08-20)

Samodzielny **P1**, **poza** arciem BRAMKA WŁASNOŚCI (D1-D6) i **poza** VESSEL_ORDERS. Plan + rejestr
decyzji + wynik gate'u: `docs/design/PLAYER_VIABILITY_PREDICATE_PLAN.md`.
Commity: `a180619` (kod) · `8537e78` (keeper) · `1ee611d` (plan) · close-out.

**Defekt:** `PlayerViability.hasColonyCapableShip` pytał o sam moduł habitacyjny, a `_tickPlayerViability`
zeruje karencję przy każdym tiku, dopóki `state.ok` ⇒ **dopóki gdziekolwiek stał taki kadłub, `game:over`
nie padał NIGDY** — także gdy statek był zadokowany albo dryfował i nie miał jak nic zacząć.
⚠ Fundament D9 stał na przesłance, którą Finding 106 obalił: *„przy ZERZE kolonii `canLaunchColony`
przechodzi, a przylot zakłada kolonię"* — **bramka przechodzi, start nie**.

**Model (jedna oś):** `hasLiveRecolonizationPath` klasyfikuje po **TYPIE MISJI**, nie po kadłubie i nie
po stanie: `COLONY_OUTLET_MISSIONS` = `colony` | `found_outpost` (sam PRZYLOT tworzy kolonię — **bez
wymogu habitatu**, bo placówkę wozi frachtowiec) · `FOREIGN_FLOW_MISSIONS` = `interstellar_jump` |
`exploration` | `foreign_recon` (**wymagają** `canColonize` — tam kolonizuje przycisk, nie przylot).
`hasColonyCapableHull` zostaje **wyłącznie do diagnostyki**. Zaparkowany, dryfujący i orbitujący po
zwiadzie **nie liczą się**.

**⚠ TRZY REGUŁY, KAŻDA KUPIONA POMIAREM (nie zakładaj, że da się prościej):**
1. **`mission` I `_suspendedMission` — NIGDY `??`.** Rozkaz ruchu **podmienia** `vessel.mission`
   (`move_to_point`), a prawdziwą chowa w `_suspendedMission`; fallback nigdy by po nią nie sięgnął.
   Zmierzone: prototyp z `??` odrzucał kolonizatora w misji `colony` przerwanej rozkazem ruchu.
2. **BRAK terminu paliwowego.** Paliwo pobierane jest **z góry przy starcie**, a stranding
   *„emituje wyłącznie sygnał — niczego nie blokuje"*; `_redirectInterstellarVessel` paliwo **klampuje
   zamiast odmawiać** (Finding 103). Termin paliwowy dokładałby fałszywe negatywy.
3. **BRAK terminu stanu.** `status='on_mission'` + `orbiting` opisuje ZARÓWNO zwiad zaparkowany
   **bezterminowo** (zmierzone: `mission=recon` wisi po 100 latach gry), JAK I statek z żywym panelem
   po warpie. Odrzucony wariant „licz każdą żywą misję" zostawiłby limbo w innym kształcie.

**⚠ ZNALEZISKO, KTÓREGO NIE ZAMAWIANO — nieutwardzony BLIŹNIAK bramki D9 (decyzja D-111 = W1):**
`MissionSystem._launchFoundOutpost` miał **miękkie** `if (this.resourceSystem) { spend… }`, a
`canFoundOutpost` liczy `canAfford` równie miękko (`if (resSys) …`) ⇒ przy ZERZE kolonii **placówka
zakładała się ZA DARMO** (zmierzone: `getPlayerColonies()` **0 → 1**). Utwardzone bliźniaczo do
`_launchColony`. **Zasięg zmiany WYŁĄCZNIE przy `resourceSystem == null`** — przy żywej koloni
`check.canAfford` odmawia już w bramce wyżej, więc zwykła gra jest bit w bit.
⚠ Obie zmiany są **SPRZĘŻONE**: samo zawężenie predykatu bez utwardzenia bliźniaka dawałoby **fałszywy
negatyw** (koniec gry przy żywej trasie). ⚠ Kolejka `pendingOutpostOrders` kończy na
`expedition:foundOutpostRequest` ⇒ **ten sam chokepoint**, jedno utwardzenie zamyka obie ścieżki.

**⚠ `canFoundOutpost` DALEJ zwraca `ok:true` przy zerze kolonii — I TAK MA BYĆ.** To wzorzec Findingu
106: bramka opisuje możliwość, odmowa mieszka przy STARCIE. „Naprawienie" bramki na czerwono skasowałoby
jedyne miejsce, gdzie różnica bramka↔skutek jest widoczna.

**Diagnostyka:** `describeNoReversal` rozróżnia **`colony_ship_no_route`** (kadłub JEST, zaparkowany)
od `no_colony_ship` (nie ma żadnego) — inaczej gate mierzyłby ciszę.

**⚠ GAŁĄŹ DESANTU ZOSTAJE ISTNIENIOWA** (podpisane D9, reguła 1 w nagłówku modułu): `transferColony`
**nie tyka jednostek naziemnych** (przepisuje tylko `tile.owner`), więc „statek z `drop_pods` + ocalały
oddział" **nadal wstrzymuje koniec gry**. To znany, świadomie przyjęty fałszywy pozytyw — zawężenie tej
gałęzi wymaga OSOBNEGO podpisu i trudniejszego pomiaru.

**Keeper** `ai_capture_last_stand_smoke` **25 → 40 asercji, 0 FAIL**. ⚠ **T4 i T5 KONTROLA PINU A
ODWRÓCONE ŚWIADOMIE** — w starym kształcie pinowały DEFEKT („sam kolonizator wystarcza", „zaparkowany
wstrzymuje koniec gry BEZTERMINOWO"); powód wpisany w nagłówku pliku (wzór `deploy_seams`,
`s34c_z9_transfer_dispose`). Nowe: T7 (tabela tras + pomiar „zwiad wisi 60 lat" + **pin na `??`** +
pin na rozróżnienie powodów) · T8 (bliźniak T2 + kontrola pinu przy żywej koloni).
Sweep **160/160 0 FAIL** · `check-i18n` PASS · zero nowych kluczy i18n.

**Live-gate:** §1/§2 **na żywo** (właściciel) · §3/§4 **headless** na przekazanie właściciela,
**15 PASS / 0 FAIL** (odmowa z powodem, misje 0 → 0, statek i paliwo nietknięte, kolonie 0 → 0 przy
zerze / 1 → 2 przy żywej). ⚠ **Granica dowodu:** headless pinuje **chokepoint silnika**, NIE klikalność
UI — ścieżka `FLEET_ACTIONS.found_outpost` → `_openOutpostBuildingPicker` (DOM, async) nie była
przechodzona; nie nazywać jej zweryfikowaną.

**NASTĘPNE (kolejka właściciela):** część II `COLONY_OWNERSHIP_GUARD_PLAN` (D1-D6) · **VESSEL_ORDERS**
(P0-P5) · reszta rejestru (97, bug mapy 108-110, 112/113 ekran końca gry).

---

## RETREAT_TARGET — odwrót z bitwy dobiera SCHRONIENIE, nie BAZĘ (F-D + F-E) (save **v101 bez migracji**, live-gate 4/4 PASS — ARC ZAMKNIĘTY 2026-08-26)

Slice **przekrojowy**, NIE należy do VESSEL_ORDERS (P0-P5 zostaje osobnym, podpisanym planem).
Plan + decyzje **D-FDa…D-FDk** + trzy pomiary wykonane PRZED kodem: `docs/design/RETREAT_TARGET_PLAN.md`.
Rejestr wyjściowy: `UNIFIED_VESSEL_ORDERS_AUDIT.md` (F-D/F-E). Commity: `aeef035` (kod) ·
`ee71fc7` (rejestr + korekta komentarza, który kłamał o liczbie konsumentów: „cztery ścieżki" → **trzy**).

**Jedno zdanie:** odwrót z bitwy i „Powrót do bazy" dzieliły JEDNĄ funkcję doboru celu
(`AutoRetreatSystem._findNearestFriendlyPlanet`), która filtruje po WŁAŚCICIELU i **nie ma terminu
układu** — a gwiazda każdego układu stoi w (0,0), więc selektor wskazywał kolonie z INNYCH układów,
rozkaz odpadał na `target_other_system` ⇒ **odwrót nie działał dla NIKOGO, gracza włącznie**
(zmierzone na żywo 3×).

**Rozszczepienie na dwie nazwy** — rdzeń slice'u: jedna funkcja odpowiadała naraz na DWA różne
pytania i dlatego na żadne nie odpowiadała dobrze.

| pytanie | odpowiedź | własność | koniec drogi |
|---|---|---|---|
| „gdzie mogę się **SCHRONIĆ**?" | NEW `src/utils/RetreatTarget.js` | **kolejność preferencji** (D-FDb) | **ORBITA**, `colonyId` NIETKNIĘTY |
| „gdzie jest moja **BAZA**?" | `_findNearestFriendlyPlanet` **NIETKNIĘTA** | filtr (poprawny) | dok + re-homing `colonyId` |

⚠ **`_findNearestFriendlyPlanet` NADAL nie ma terminu układu i jest ŻYWA** przez TRZY produkcyjne
ścieżki „Powrót do bazy" (`FleetManagerOverlay:4550`, `FleetGroupPanel:445`, `FleetCommandPanel:384`)
— **Finding 154, otwarty, własny podpis**. Świadomie nietknięta: tam filtr własności jest właściwy,
a promień rażenia zmiany obejmowałby przycisk używany w normalnej grze.

**`MovementOrderSystem.resolveShelterOrderSpec` = JEDNO ŹRÓDŁO** doboru celu **i kształtu rozkazu**
dla WSZYSTKICH TRZECH producentów odwrotu (`_issueRetreat` gracza z PPM · `AutoRetreatSystem` na
`battle:resolved` · doktryna `retreat_at_50` we `FleetSystem`). Rozwiązuje cel — **nie wydaje**
rozkazu, bo każdy producent dyspozycjonuje inaczej (ten wewnątrz `issueOrder` woła `_issueMoveToPoint`
wprost, żeby nie zdublować preempcji i bramek; pozostali wchodzą normalnie przez `issueOrder`).

**Drabina rang (D-FDb + D-FDg) — BEZWZGLĘDNA**, odległość porządkuje dopiero WEWNĄTRZ tieru:

```
tier 0  własna kolonia/stacja Z PORTEM   ← jedyny tier, na którym da się zatankować
tier 1  własna kolonia/stacja bez portu
tier 2  ciało NICZYJE
tier 3  kolonia OBCEGO właściciela        ← ostatni (Z1: wrogi orbiter blokuje pulę hubu SAMYM
                                            faktem `dockedAt` i dolicza się do następnej fali)
```

Powód pierwszeństwa portu: rozkaz leci z `bypassFuelCheck`, a **paliwo pobierane jest PRZY WYDANIU**
(`MOS:765-767`) — statek doleci wszędzie, ale z bakiem na zerze, a tankowanie wymaga `state==='docked'`
(przylot daje `orbiting`). Bez tej preferencji produkowaliśmy limbo klasy **Finding 111/125**.

**Drabina szczebli (D-FDe) — ŻADEN szczebel nie robi wraku:** ciało-schronienie → wektor ucieczki
w pusty punkt → **odmowa z POWODEM**. `_turnIntoWreck` **USUNIĘTY** z `AutoRetreatSystem`.
⚠ Ta gałąź była praktycznie martwa PRZED naprawą (selektor przeszukiwał całą galaktykę, więc zawsze
coś znajdował) — po dodaniu terminu układu stałaby się **TYPOWA**, bo AI atakuje z definicji w cudzym
układzie. I **zabijałaby także flotę GRACZA**: `DeepSpaceCombatSystem:1236` woła `_issueRetreatOrder`
WPROST, omijając bramkę `empireId === 'player'`.

⚠ **`AutoRetreatSystem:56` NIE JEST bramką symetrii i nie należy jej tak czytać.** Gracz DOSTAJE
auto-odwrót — drugimi drzwiami, tą ścieżką z `:1236`. Symetria mieszka w SELEKTORZE i w drabinie,
nie w tym `return`.

**D-FDk — ucieczka przebija `vessel_immobilized` I `vessel_in_reserve`.** Prawo do przeżycia nie jest
nagrodą za opłacone utrzymanie ani za obsadzenie załogą. Predykat `isRetreatSpec` (`MovementOrderTypes.js`)
jest **jednym źródłem**, bo tylko JEDEN z trzech producentów używa `ORDER_TYPES.retreat` — dwaj pozostali
wydają zwykły `moveToPoint`, więc sam test typu dałby asymetrię „ten sam czyn, inna odpowiedź, zależnie
od producenta". Znacznik `isRetreat` ustawiają producenci JAWNIE (nie wyprowadzamy go z `issuedBy` —
to pole jest opisowe i trafia do logów).

**D-FDd — `DSCS._allOutsideOf` uczy się markera odwrotu.** Po naprawie udany odwrót KOŃCZY SIĘ orbitą
(`dockedAt = bodyId`), a guard z 2026-05-21 („zadokowany ≠ uciekający", prawdziwy dla OBROŃCY) wypychał
uciekiniera z liczenia ⇒ `aliveCount` → 0 ⇒ `retreated = null` ⇒ **side-level wrak ŻYWYCH przegranych**.
Bez wyjątku **udany odwrót byłby groźniejszy od nieudanego**. Marker dopuszcza uciekiniera wyłącznie
do TESTU ODLEGŁOŚCI — ciało bliżej niż clearance dalej liczy się jako „w środku".

**D-FDf — orbita zamiast doku.** `_pendingReturnDock` **usunięty ze ścieżki doktryny**: jego konsument
`FleetSystem._maybeAutoDockOnReturn:653` przepisuje `vessel.colonyId` **BEZWARUNKOWO**, więc odwrót na
ciało niczyje albo cudze robiłby z niego nową BAZĘ całej floty. (⚠ próg `RETURN_DOCK_THRESHOLD_AU:30`
jest **martwy** — stała bez konsumenta.)

**F-E (D-FDh) — dryf.** `_findNearestFriendlyPlanetForDrift` był klonem 1:1 tamtej funkcji i dziedziczył
ten sam defekt; **tu groźniejszy**, bo ratunek z dryfu **NIE wydaje rozkazu — TELEPORTUJE**, więc bramka
`target_other_system` w ogóle go nie chroniła i statek lądował na współrzędnych ciała z OBCEGO układu
z niezmienionym `systemId`. Teraz delegacja do `nearestOwnColonyBodyInSystem` (⚠ **własność ZOSTAJE
FILTREM** — dryf znaczy „wróć do siebie", nie „schowaj się gdziekolwiek") + **drugi szczebel zamiast
niemej pętli „+5 lat"**: `vessel:driftStranded` mówi RAZ, że statek utknął.

**D-FDj — widoczność.** Udany odwrót **nie miał ANI JEDNEGO subskrybenta** w całym `src/`, więc naprawa
objawiałaby się WYŁĄCZNIE zniknięciem komunikatów o porażce — **gate mierzyłby ciszę i nie odróżniłby
jej od „nic się nie stało"**. Doszły konsumenty `vessel:autoRetreatIssued` + `vessel:driftStranded`
(`UIManager`, kanał `combat`/`fleet`) oraz **klucze, których NIE BYŁO W ŻADNYM JĘZYKU** mimo że powody
`no_friendly_planet` / `not_in_combat` są zwracane od M4 P3 (gracz widział **surowy slug**):
`vessel.reasonNoShelterInSystem` / `reasonNoFriendlyPlanet` / `reasonNotInCombat` PL+EN.

### ⚠ Pomiary PRZED kodem (sondy poza repo) — trzy rzeczy, których nie dało się zgadnąć

1. **Bąbel clearance NIGDY nie opróżnia zbioru: 0/7200** (12 wygenerowanych układów, 38-57 ciał każdy)
   ⇒ **szczebel 2 (wektor ucieczki) jest w praktyce NIEOSIĄGALNY** i dlatego keeper pinuje go na
   układzie **ZDEGENEROWANYM** — inaczej mierzyłby ciszę.
2. **Knob `RETREAT_CLEARANCE_AU` = 0,50 jest NIEWRAŻLIWY.** Rozkład jest bimodalny: przy ciele najbliższe
   leży ≤0,15 AU, następne dopiero ~3 AU ⇒ każda wartość z ~0,16-3,0 AU wybiera TO SAMO ciało.
   **Nie ma czego stroić.** Cena bąbla realna, ale opłacalna: mediana odwrotu 3 AU = **12 % baku fregaty**.
3. **Wyścig jest realny — i sam clearance go NIE zamyka.** Przy 1 d/s klasyfikacja uciekiniera nie
   następuje NIGDY w oknie życia bitwy; przy 1 r/s statek pokonuje **1,85 AU na jedną rundę** (110 ms),
   więc potrafi przejść z „wewnątrz" wprost w „zadokowany" **nie będąc policzonym ani razu**.
   ⇒ marker D-FDd był **konieczny, dowiedziony**, a nie ostrożnościowy.

⚠ **POMIAR, KTÓRY ZMIENIA INTUICJĘ O ODWROCIE:** bitwa DSCS żyje **~2,2 s REALNEGO czasu**
(`MAX_ROUNDS 20` × `ROUND_INTERVAL_MS 110`), a `speedAU` to AU na rok **GRY** — pokonanie 0,5 AU przy
1 d/s trwa ~130 s, czyli **~59× dłużej niż cała bitwa**. **Cel odwrotu NIE decyduje o wyniku bitwy**;
decyduje o tym, GDZIE ocalały wyląduje i czy nie zostanie zwarty ponownie. Odwrót jest z natury
**post-battle**.

### Live-gate 2026-08-26 — 4/4 PASS (właściciel, na żywo)

1. **Komunikat o odwrocie w Dzienniku** — potwierdzony DWUKROTNIE, przy dwóch różnych bitwach
   (to jest dokładnie ten konsument, którego brak czyniłby naprawę niemierzalną — D-FDj).
2. **Orbita we WŁASNYM układzie, baza NIETKNIĘTA** — na `v_49 „Żmija"`: pierwszy odwrót do własnej
   stolicy (**tier 0, port**), drugi odwrót (inna walka) do innego ciała (**Nowy Księżyc**).
   ⇒ drabina rang i D-FDf potwierdzone **zachowaniem**, nie odczytem.
3. **D-FDk — OBIE POŁÓWKI czysto:** odwrót przechodzi mimo `unpaidYears = 2`, a **zwykły `moveToPoint`
   na TYM SAMYM statku z TYM SAMYM długiem** dostaje `vessel_immobilized`. Kontrola pinu na żywym silniku.
4. **Czytelny powód odmowy w UI**, nie surowy slug w konsoli.

**Keepery:** NEW `retreat_target_smoke` **44/44** (fail-first startował 12/25) · `retreat_preempt_smoke`
**29/29** — ⚠ **T4 ODWRÓCONY ŚWIADOMIE** (pinował DEFEKT: `reason === 'target_other_system'`), a jedyny
pin inwariantu **D-VO3a** stracił swojego producenta odmowy ⇒ przeniesiony do nowego **T4b** na powód
`not_in_combat` (po D-FDk `vessel_immobilized` przestał blokować `retreat`, więc stary pin znowu
mierzyłby ciszę). Sweep **173/173 OK, 0 FAIL** (`run-all.mjs`) · `check-i18n` PASS · zero migracji.

**⚠ Świadomie POZA zakresem (filed):** **Finding 154** (`_findNearestFriendlyPlanet` bez terminu układu,
żywa przez trzy przyciski „Powrót do bazy") · **Finding 138** (`_findBodyNearPoint` skanuje całą
galaktykę — dotyka KAŻDEGO rozkazu celowanego punktem, D-FDi=W2) · `_pendingReturnDock` stawiany PRZED
`issueOrder` i **niesprzątany przy odmowie** na trzech ścieżkach POWROTU (wzór poprawki jest w repo:
`_issueDock` stawia `_pendingDock` pod `if (result?.ok)`, `MOS:427`) · kara dyplomatyczna za przylot
uciekiniera zostaje jak jest · strona AI **nie ma snapshotu/wznowienia misji** po `_freezeAsStationary`
(gracz ma) ⇒ okręt AI z wyzerowaną misją zostaje z `movementOrder` w `active` na zawsze · **balans**:
czy 3 AU odwrotu od kolonii to właściwa cena.

---

## Starcie jest JEDNOUKŁADOWE Z KONSTRUKCJI — bramka + gather + stempel (save **v101 bez migracji**, live-gate PASS — ARC ZAMKNIĘTY 2026-08-26)

**KRYTYCZNE, złapane MIMOCHODEM.** Live-gate naprawy F-D wyłapał defekt **niezależny od F-D i cięższy**:
`DeepSpaceCombatSystem` łączył w JEDNO starcie statki z RÓŻNYCH układów. Commit `131cc2e`; rejestr
findingów 150-154 `ee71fc7` (sekcja w `docs/design/VESSEL_ORDERS_PLAN.md`).

**ZMIERZONE W ŻYWEJ GRZE:** encounter ze stemplem `location.systemId = 'sys_024'` zawierał statek gracza
z `sys_024` **ORAZ** statki z `sys_061` i `sys_home` (potwierdzone dwoma zrzutami przy przełączaniu widoku
układu). Podważało to zaufanie do **KAŻDEGO** wyniku bitwy, nie tylko do odwrotu.

**Mechanizm — klasa „globalne id ≠ położenie"** (ta sama co Finding 138 i W3-4b): każdy układ ma własną
ramkę współrzędnych ze swoją gwiazdą w (0,0), a rejestry (`EntityManager`, `VesselManager._vessels`) są
**PŁASKIE**. Statek 0,2 AU od SWOJEJ gwiazdy ma niemal te same surowe `x/y` co statek 0,2 AU od INNEJ.

**TRZY MIEJSCA, nie jedno** (i trzecie maskowało dwa pierwsze):

1. **`startEngagement` team-up gather** iterował `vm._vessels.values()` po CAŁEJ galaktyce i kwalifikował
   po gołym `hypot` → skład bitwy zbierany z całej mapy.
2. **`handleCombatRangeEnter`** — jedyne publiczne wejście — bramkował tylko `sameFaction`/wrak.
3. **`_createEncounter` ZGADYWAŁ** `location.systemId` z `sideAVessels[0]`, czyli **z kolejności iteracji
   płaskiego rejestru**. ⚠ To był **CICHY STEMPEL**: rekord bitwy o mieszanym składzie dostawał jedną,
   wiarygodnie wyglądającą etykietę, więc żaden konsument `battle:resolved` nie miał jak wykryć anomalii
   — a etykieta idzie dalej do `WarSystem._updateOrbitalDominance`, czyli do **TRWAŁEGO STANU ZAPISU**.

Teraz: bramka w **dyspozytorze**, termin układu w **gatherze**, stempel z **pary WYZWALAJĄCEJ**.

### ⚠ LEKCJA WIĄŻĄCA DALEJ: guard u JEDNEGO producenta nie jest guardem SYSTEMU

`ProximitySystem._checkPair` **MA** guard międzyukładowy (dostał go 2026-07-15) — ale **nie jest jedynym
producentem** `vessel:combatRangeEnter`. `MovementOrderSystem` emituje je **wprost w dwóch miejscach**
(`:1163` force-engage, `:1505` po pursue/intercept — ten drugi z dystansem **wpisanym na sztywno**), oba
majstrują dodatkowo przy `ps._activeCombatPairs`, więc strażnik proximity nie łapie ich nawet pośrednio.
**Utwardzony był JEDEN z TRZECH — i właśnie dlatego dziura przeżyła dwa wcześniejsze utwardzenia tej
klasy.** Bramka stoi teraz w **dyspozytorze DSCS**, bo to jedyne publiczne wejście, które widzi
wszystkich trzech producentów. ⇒ **policz PRODUCENTÓW zdarzenia, zanim uznasz klasę za utwardzoną.**

### ⚠ `isSameSystemStrict` — fail-CLOSED, WYŁĄCZNIE dla warstwy walki

NEW w `src/utils/SystemScope.js`, **osobno** zamiast zmiany `isSameSystem`, bo **bilans kosztu błędu jest
odwrotny**: przy wydawaniu rozkazu cena fałszywego NEGATYWU to cichy paraliż floty (fail-open słuszny),
a w WALCE cena fałszywego POZYTYWU to **trwale stracone kadłuby, wraki w międzyukładowym punkcie
i zatruty `orbitalDominance` W ZAPISIE** — wobec jednej niestoczonej bitwy. `isSameSystem` (fail-open)
**NIETKNIĘTY** dla bramek rozkazów.
⚠ **`null` NIE ZNACZY TU „nie wiemy":** `systemIdOf` mapuje `undefined` → `'sys_home'`, więc **stary zapis
sprzed multi-system walczy normalnie** (pin T5), a do `null` dochodzi **wyłącznie prawdziwy tranzyt warp**
— a statek w warpie nie ma prawa walczyć: jest fizycznie pomiędzy układami, a jego `x/y` to współrzędne
SPRZED skoku.

**Lustrzana trójka w `VesselCombatSystem` W TYM SAMYM COMMICIE** — znakowo ta sama pętla i ten sam stempel.
Gałąź jest uśpiona flagą `m4DeepSpaceCombat`, ale ma **jawny fallback i utrzymywaną ścieżkę rollbacku**
⇒ reguła **nieutwardzonego bliźniaka** (`removeColony:667`).

**Defense-in-depth (dwa miejsca, świadomie nadmiarowe):** `_joinEncounter` odmawia obcemu układowi
(dziś nieosiągalne — ma dwóch wołających, obu wewnątrz dyspozytora; guard stoi, żeby „członkostwo
w starciu" było prawdą LOKALNĄ, gdyby doszedł trzeci wołający) · `_freezeAsStationary` **nie przypina
ciała z innego układu** — to **jedyny zapis w tej ścieżce trwale mutujący statek**: `pinDockedAt` brany
z większości strony GRACZA, wpisany statkowi z innego układu, dawał `dockedAt` na ciało, którego w jego
układzie NIE MA, a `VesselManager._updatePositions` przeliczał z niego `x/y` ⇒ statek przenoszony we
własnym układzie i „dokowany" przy nieistniejącym ciele. **Nikt tego później nie czyścił, więc szkoda
szła do zapisu.**

**Keeper `combat_system_scope_smoke` 25/25** (fail-first 11/8); **T3 odtwarza pomiar z gry co do nazw
statków**. ⚠ **Pierwsza wersja T1/T3 PRZECHODZIŁA na NIEPOPRAWIONYM kodzie** — intruz wypadał przy
wyborze `bestGroup`, nie przez filtr; fixture poprawiony, powód wpisany w komentarzu. Każdy pin ma
kontrolę pinu, w tym **T4** (tranzyt warp = fail-closed) i **T5** (stary zapis bez `systemId` walczy
normalnie). Sweep **173/173 OK, 0 FAIL** · `check-i18n` PASS · bez migracji save.

**Live-gate 2026-08-26 — PASS przez BRAK NAWROTU:** wiele bitew w jednej sesji, **zero kolejnej
kontaminacji cross-system**. ⚠ Nazywam to wprost: to potwierdzenie **przez nieobecność** — ale jest
mocne, bo defekt był wcześniej **głośny i reprodukowalny w tej samej klasie sesji** (dwa zrzuty).
Nie jest to dowód na każdą ścieżkę z osobna.

⚠ **NAPRAWA NIE COFA SZKÓD JUŻ ZAPISANYCH:** fałszywe `position.dockedAt`, zatrute klucze
`orbitalDominance`, wraki w międzyukładowych punktach, wyczerpanie wojenne z fikcyjnych bitew. Sonda
diagnostyczna read-only powstała i **została zweryfikowana wykonaniem** na syntetycznym zapisie, ale
**właściciel świadomie zrezygnował** z naprawy stanu (zapis testowy). **Przy PRAWDZIWEJ partii temat wraca.**

### Findingi 150-153 — otwarte, każdy z własnym powodem odroczenia

- 🔴 **150 — `battle:resolved` leci DWA RAZY przy zadeklarowanej wojnie.** DSCS emituje z `warId: null`
  (`:1022`), potem `WarSystem.recordBattle:314` emituje PONOWNIE, z `warId` ⇒ każdy subskrybent
  (`AutoRetreatSystem`, `InvasionSystem`, `GameScene`, `ProximitySystem`, UI) dostaje ten sam wynik
  dwukrotnie, **w dwóch różnych kształtach**. ⚠ **POTWIERDZONY ŻYWO 2026-08-26, DWUKROTNIE w jednej
  sesji** (dwie różne pary id bitew, za każdym razem **dwie sprzeczne linijki o zwycięzcy TEJ SAMEJ
  walki** w Dzienniku) ⇒ z „odczyt, nie pomiar" przechodzi na **reprodukowalny w żywej rozgrywce**,
  a duplikat okazuje się **WIDOCZNY DLA GRACZA**, nie tylko wewnętrzny. NADAL NIEZMIERZONE: którzy
  konsumenci są idempotentni. **Osobny pomiar, osobny slice.**
- 🟠 **151 — `ProximitySystem:187` ma WŁASNĄ koercję zamiast `systemIdOf`, i ta koercja połyka tranzyt
  warp** (`?? 'sys_home'` łapie także `null`, który znaczy „między układami") ⇒ statek w warpie liczony
  jako mieszkaniec `sys_home`, na współrzędnych SPRZED skoku. ⚠ Ta linia bramkuje **nie tylko walkę, ale
  i DETEKCJĘ oraz INTEL** (rumor/contact) ⇒ własny slice, własny gate; `131cc2e` świadomie jej nie tknął.
- 🟠 **152 — POI nie ma pojęcia układu i NIE DA SIĘ tego załatać guardem:** `POIRegistry.js`/`POITypes.js`
  **nie mają pola `systemId` w ogóle** ⇒ naprawa = DODANIE pola + **migracja zapisu**, czyli decyzja
  o zakresie, nie jedna linia.
- 🟠 **153 — `EmpireLogisticsSystem` dobiera outposty bez terminu układu, a kurier nie ma warpu**
  (`:240-242` filtruje po właścicielu i złożu, trasa wyceniana surowym `hypot`). ⚠ **NIEUSTALONE**, czy AI
  realnie zakłada outposty poza układem stolicy — bez tego pomiaru nie wiadomo, czy dziura jest osiągalna.
- **Już zarejestrowane, nie duplikują:** **138** (`_findBodyNearPoint` skanuje całą galaktykę) i **142**
  (`_getValidTargets` klucza się na OGLĄDANYM układzie, nie na `vessel.systemId`) — ta sama klasa, otwarte.

---

## NARRACJA BITWY — jedno ogłoszenie, zwycięzca z uczestników (Findingi 150 + 155, save **v101 bez migracji**)

Slice przekrojowy, **NIE należy** do VESSEL_ORDERS (P0-P5 zostaje osobnym planem). Plan + pomiar +
decyzje D1-D6: `docs/design/BATTLE_NARRATION_PLAN.md`; rejestr macierzysty: `VESSEL_ORDERS_PLAN.md`
§Findings 150/155 (zamknięte) + 156-158 (nowe).

**Dwa różne defekty, jeden objaw.** Gra **ogłaszała jedną bitwę dwa razy** (150) i **czytała
zwycięzcę z kolejności ról wojny zamiast z uczestników** (155) — razem dawały cztery linie o jednej
walce, z których część kłamała o tym, kto wygrał.

- **150 — `announce: false` w JEDNYM szwie.** `DeepSpaceCombatSystem` emituje `battle:resolved` sam
  (`warId: null`), po czym `WarSystem._classifyBattle` księguje starcie przez `recordBattle`, a ta
  **emitowała ponownie**. Naprawa: `recordBattle(warId, result, { announce: false })` **wyłącznie**
  z `_classifyBattle` — jedyne wejście re-entrantne. Domyślnie ogłaszamy, więc `EnemyAttackHandler`,
  `forceBattle` i `_fleetArrived` (wywołania WPROST, jedyne ogłoszenie swojej bitwy) są nietknięte.
  **Jeden szew pokrywa DSCS i VCS** — lekcja `131cc2e` odwrócona: nie łatamy N producentów, tylko
  miejsce, przez które wszyscy przechodzą.
  ⚠ **KOREKTA ZAKRESU wobec rejestru:** duplikat dotyczył **tylko DSCS/VCS** (producent emituje sam,
  a księgowanie dokłada drugie ogłoszenie). EAH ogłaszał **raz**.
- **155 — tożsamość z UCZESTNIKA, nigdy z ról wojny.** NEW czysty `src/utils/BattleSides.js`
  (`isPlayerParticipant` / `participantName` / `resolveBattleSides` / `battleWinnerName`), wpięty
  w OBA listenery `battle:resolved` w `GameScene`. `_hasPlayerSide` deleguje do kanonu (D5);
  `_battleLoserSide` **nietknięte** (odpowiada na inne pytanie).
  ⚠ **Gracz jest oznaczony NIEJEDNOLICIE** — `{type:'vessel_group', empireId:'player'}` (DSCS/VCS),
  `{type:'player', empireId:'player'}` (EAH), `{type:'player'}` bez `empireId` (stary zapis).
  Predykat pyta o OBA znaczniki; zawężenie do `empireId` po cichu gubi obronę orbitalną (klasa S25).
  ⚠ **REGUŁA BRAKU:** nie da się przypisać gracza do strony ⇒ `playerSide === null` i **nie
  zgadujemy** — mniej treści zamiast odwróconej treści (wzór `_battleLoserSide`).

**⚠ TRZY RZECZY, KTÓRYCH POMIAR NIE POTWIERDZIŁ, TYLKO ZMIENIŁ:**
1. **Szkoda 150 była STANOWA, nie kosmetyczna.** `AutoRetreatSystem` nie jest idempotentny: drugi
   emit = drugi rozkaz odwrotu, a paliwo pobierane jest **przy wydaniu** (`MovementOrderSystem:924`)
   ⇒ **zmierzone ×2,0** (0,817 spalone przy koszcie kursu 0,409). Do tego `_battleQueue` nie
   deduplikuje po `battleId`, więc bitwa deep-space dostawała baner **i** pauzujący modal kina —
   wbrew decyzji Slice 1.
2. **Zagnieżdżony emit wyprzedza oryginalny.** `EventBus.emit` jest synchroniczny; zagnieżdżone
   ogłoszenie domyka się **w całości**, zanim zewnętrzny `forEach` dojdzie do kolejnego subskrybenta
   ⇒ **błędna linia trafiała do Dziennika PRZED poprawną**.
3. **Z2 okazał się KONTRAKTEM POZYCYJNYM, nie regresją.** Po naprawie jedynym ogłoszeniem bitwy DSCS
   jest emit producenta — czyli sprzed księgowania. Świat pozostaje spójny **tylko dlatego**, że
   `WarSystem` jest zarejestrowany PRZED `InvasionSystem` (`GameScene:318/319`), więc `recordBattle`
   domyka księgi wewnątrz tego samego emitu. **Zmierzone wykonaniem** (keeper T7a). ⚠ Kto zmieni
   kolejność konstrukcji albo udrożni desant AI z bitew DSCS — **T7 padnie**, i o to chodzi (D2).

**⚠ Dwie lekcje procesowe z tego slice'u:**
- **Próg dobrany do niewłaściwej skali to fałszywa zieleń.** Mój pierwszy pin paliwowy asertował
  „spalone ≤ połowa baku" i **przeszedł na niepoprawionym kodzie** — kurs odwrotu jest o rzędy
  wielkości tańszy niż bak. Pin musi porównywać z **kosztem jednego kursu**, nie z pojemnością.
- **Pin źródłowy bez kontroli na kodzie SPRZED naprawy jest zgadywaniem.** Wszystkie sześć pinów T6
  przepuszczono przez `git show HEAD` — każdy tam pada.

**i18n (D3):** linia Dziennika była **zahardkodowana po polsku** i `check-i18n` jej nie widział
(pyta o klucze w `t()`, nie o literały) — gracz EN dostawał polski meldunek o najgłośniejszym
zdarzeniu w grze. Siedem kluczy PL+EN (`log.battleLine`, `battle.player/unknownForce/homeSystem/
deepSpaceIn/retreatPlayer/retreatEnemy`). ⚠ **Prefiks `⚔` zostaje w OBU językach** — to językowo
neutralny uchwyt filtra na gate'cie (właściciel gra po EN).

**⚠ Środowisko headless:** `node_modules/` zniknęło z maszyny, a łańcuch `GameCore → GroundUnitManager
→ GroundUnitFactory → GlbSnapshotRenderer` importuje `three`, które **nie jest zależnością
produkcyjną** (Three.js idzie z CDN). Odtworzono **udokumentowany** stub (`0.0.0-headless-stub`, tylko
`.` + `GLTFLoader`). ⚠ **Granica dowodu zachowana i zweryfikowana**: stub nadal NIE eksportuje
`TextureLoader`, więc `ColonyOverlay`/`GameScene` dalej nie importują się pod node. `node_modules/`
jest gitignorowane ⇒ nie wchodzi do commita.

Keepery: NEW `battle_announce_once_smoke` **19/19** (T5 = szkoda stanowa, T6 = pin limitu 156,
T7 = pin Z2 z kontrolą pinu na kształcie EAH) · NEW `battle_sides_smoke` **35/35** ·
`w3_battle_booking` T4 **ODWRÓCONY ŚWIADOMIE** (pinował `withWar === 1`, czyli sam defekt, pod
nagłówkiem „brak re-entrancji"; inwariant „jedno zaksięgowanie na starcie" został jako kontrola pinu),
20/20. Sweep **176/176 OK, 0 FAIL** · `check-i18n` PASS (pl=en=3279).

**Otwarte po tym slice'ie:** **156** (dwa rekordy jednej bitwy w zapisie, niepowiązane id) ·
**157** (`UIManager` filtruje `type === 'vessel_group'` ⇒ obrona orbitalna bez klasyfikacji wyniku
i bez auto-slow) · **158** (`BattleIntroModal`: zahardkodowany polski + nagłówki „AGRESOR/OBROŃCA"
na indeksach uczestników).

---

## STEROWANIE MAPĄ STRATCOM — Findingi 108 + 109 (save **v101 bez migracji**)

Plan + decyzje E1-E5 + gate: `docs/design/STRATCOM_CONTROL_PLAN.md`; rejestr macierzysty:
`COLONY_OWNERSHIP_GUARD_PLAN.md` §108-110 (108/109 zamknięte) + nowe 159/160.

**Dwa niezależne mechanizmy, jeden objaw: gracz tracił sterowanie mapą.** 109 — mapa **wybierała
inny układ, niż podświetlała**; 108 — tryb rozkazu warp **odcinał jedyne wejście do widoku układu
i nie dawał się rozbroić**.

- **109 — NEW `src/ui/StratcomHitLogic.js`** (czysty, zero importów): `topMostZoneAt` /
  `pickStarZone` / `resolveStratcomZone`, używany przez **klik i hover**.
  ⚠ **DWIE REGUŁY, NIE JEDNA — to jest cała subtelność.** `topMostZoneAt` rozstrzyga między
  **warstwami** (panel bije mapę — ta reguła **chroni absorbery**), `pickStarZone` rozstrzyga
  **między gwiazdami** (najbliższy środek). Zlanie ich w pre-pass — kuszące, bo taki wzór stoi
  w tym samym pliku przy `:1369` — **przebiłoby `warp_order_bg`** i przywróciło klik-przez-panel,
  czyli defekt cięższy od naprawianego. Rozstrzygacz jest **doprecyzowaniem zwycięzcy**.
- **108 — trzy dopięcia**: (a) `warp_order_cancel` czyści też `_selectedWarpShipId` („Anuluj" =
  *rozbrój tryb*); (b) `cluster_switch` **także** w `_drawWarpOrderPanel`, z bramką **skopiowaną**
  `explored && sysReg`; (c) `_close()` zeruje `_selectedWarpShipId` + `_warpShipScrollY`.
  ⚠ **`warp_order_send` świadomie NIE rozbraja** (decyzja E2) — marker przydaje się przy wysyłaniu
  kolejnych statków, a po (b) nie tworzy pułapki. Pinowane, żeby nikt tego nie „naprawił".

**⚠ CZTERY RZECZY, KTÓRYCH POMIAR NIE POTWIERDZIŁ, TYLKO ZMIENIŁ:**
1. **To KLIK miał rację, nie hover** — rysowanie idzie w kolejności pushu, więc „ostatnia pushowana"
   znaczy „na wierzchu". Ale **żadne nie miało racji do końca**: strefy 22×22 przy glifie r ≤ 7
   nakładają się także wtedy, gdy gwiazdy wizualnie się nie stykają ⇒ właściwą odpowiedzią jest
   **najbliższy środek**, a nie kolejność. Samo odwrócenie pętli **nie wystarczyło**.
2. **Ucieczki z pułapki 108 były WĘŻSZE, niż zapisano.** `_close()` czyścił **dwóch z czterech**
   członków rodziny, a `open({tab})` przypisuje zakładkę **z pominięciem `_switchTab`** ⇒
   **Esc + `M`/`G` nie odblokowywało**; pułapka przeżywała zamknięcie overlaya.
3. **`cluster_switch` ma DRUGIEGO producenta** (`:7395`, panel „Interstellar Arrival") — wąska
   furtka, której rejestr nie odnotował.
4. **Kolejność wobec Findingu 110 jest wiążąca**: 110 naprawia się przez **powiększenie** stref
   gwiazd, co **zwiększyłoby nakładanie** i pogorszyło 109. Dlatego 109 poszło pierwsze.

**⚠ `FleetManagerOverlay` IMPORTUJE SIĘ pod node** (zweryfikowane wykonaniem), a `handleClick`
i `handleMouseMove` są na prototypie ⇒ **oba findingi pinowane WYKONANIEM, nie źródłowo** — dla
warstwy UI w tym repo to rzadkość. Panel testowany **prawdziwą ścieżką rysującą** na atrapie `ctx`
(wzór `zero_colony_panels`), z kontrolą pinu „panel realnie się narysował" — inaczej brak przycisku
myliłby się z brakiem rysowania.

Keepery: NEW `stratcom_star_pick_smoke` **10/10** (fail-first 4/6; T2 ma **dwa** przypadki o różnych
poprawnych odpowiedziach, więc „naprawa przez odwrócenie pętli" zdałaby połowę i padła na drugiej;
T3 absorber **przechodził już przed naprawą** = strażnik regresji) · NEW `stratcom_warp_trap_smoke`
**14/14** (fail-first 9/5). Sweep **178/178 OK, 0 FAIL** · `check-i18n` PASS · **zero nowych kluczy**
(reuse `fleet.clusterSwitch`).

**Otwarte:** **110** — ⚠ **naprawa NIE jest „powiększeniem strefy"** (audyt
`docs/audit/STRATCOM_110_159_160_AUDIT.md`): `pickStarZone` liczy odległość do środka STREFY, więc
rozciągnięcie jej **cofa Finding 109** (zmierzone: 2 przewroty dla gwiazd różniących się w osi Y;
okno nakładania +59 %, z wachlarzem +385 %). Kotwica celowania musi być **JAWNA** w `zone.data`.
Decyzja właściciela: **wariant (c)** — ikona wybiera STATEK, reszta strefy UKŁAD.
**159** — ⬜ **PRZEKLASYFIKOWANY na UTAJONY**: `commandTacticalMap: false` ⇒ 6 z 7 producentów
`map_body` nigdy nie biegnie, a siódmy (Atlas) to rozłączne wiersze z tooltipem już iterującym od
końca. Wraca tylko z flagą — i **po 110**. · **160** ✅ ZAMKNIĘTE (sekcja niżej).

---

## Wejście w zakładkę Dowództwa — Finding 160 (save **v101 bez migracji**, live-gate 6/6 PASS — ZAMKNIĘTE)

Domknięcie **niedokończonej połowy Findingu 108**. Plan + decyzje T1-T6: `docs/design/OVERLAY_TAB_ENTRY_PLAN.md`;
audyt: `docs/audit/STRATCOM_110_159_160_AUDIT.md` §3.

**Jedno zdanie:** klawisz otwierający Dowództwo **na już otwartym Dowództwie** przełączał zakładkę
z pominięciem `_switchTab` **i** `close()`, więc nic nie sprzątało po zakładce, z której gracz wyszedł.

⚠ **`close()` NIE JEST ratunkiem, bo NIE BIEGNIE.** `OverlayManager.handleKey:75-80` przy JUŻ aktywnym
overlayu woła `_showOverlay` **bez** `_hideOverlay` (żeby drugie wciśnięcie `K` ponawiało focus zamiast
zamykać) ⇒ `open(opts)` wykonuje się na ŻYWYM overlayu. W `open()` były **TRZY** przypisania
`_activeTab` (`opts.tab` · `focusSection` · `view:'registry'`) i żadne nie szło przez `_switchTab`.
Naprawa utwardza **wszystkie trzy** — nieutwardzony bliźniak to mina (`removeColony:667`, `ReturnJump`).

⚠ **OSIĄGALNOŚĆ ROZSTRZYGA POJEDYNCZY BRAK HANDLERA.** Pole ilości Logistyki ma `blur → commit →
close` (`:1089`) ⇒ samo się leczy, a póki ma fokus, jego `keydown` robi `stopPropagation`, więc `M`
i tak nie dotrze do gry ⇒ **nieosiągalne**. **Wyszukiwarka Rejestru (`:4366-4393`) NIE MA `blur`** —
celowo, fraza ma przeżyć przeglądanie listy ⇒ wpisz frazę, kliknij kanwę, wciśnij `M` i **pole
tekstowe zostaje nad mapą galaktyki**. To jedyna osiągalna ścieżka i to ona jest rdzeniem gate'u.
`blur` **świadomie NIE dołożony** (T5) — po zamknięciu chokepointu byłby naprawą objawu.

⚠ **`_switchTab` ma early-return `tab === _activeTab` i TO ZOSTAJE** (T4, pinowane): wyciek polega na
**PRZENIESIENIU** pola DOM tam, gdzie nie należy; gdy zakładka się nie zmienia, nic się nie przenosi.
Gracz w Rejestrze, który wciska `K`, ma zobaczyć pole **na miejscu** — to poprawny wynik, nie defekt.

⚠ **PRZY OKAZJI DOMKNIĘTA RESZTKA 108:** kontrola pinu T4 padła fail-first — przed naprawą wejście na
Stratcom **z innej zakładki** nie resetowało `_selectedWarpShipId`/`_selectedClusterSystem`, bo tamten
slice zamknął to wyłącznie w `_close()` (ścieżka Esc). Druga droga do tej samej pułapki zamknięta.

**Zbiór producentów zamknięty:** dokładnie `g`, `m`, `k` — jedyne wpisy keymapy w formie `{id, opts}`,
wszystkie celujące w `fleet`. `Outliner:732/736` woła `openPanel('fleet')` **bez opcji**, a
`TacticalDock:671` jest przy otwartym overlayu **nieklikalny** (`UIManager:1724`). ⚠ Ale **Outliner
JEST klikalny przy otwartym overlayu** (`UIManager:1715` bez bramki `isAnyOpen`, inaczej niż Dok) —
dziś nieszkodliwe, furtka na przyszłość, gdyby ktoś dodał tam `opts.tab`.

Pliki: `FleetManagerOverlay.open()` (3 linie), NEW keeper `src/testing/smoke/overlay_tab_entry_smoke.mjs`
**28/28** (fail-first 20/8; T6 = pin **wykonaniowy** na `new OverlayManager()._keyMap`, nie regex na
źródle). Sweep **179/179 0 FAIL** · `check-i18n` PASS · zero migracji · zero nowych kluczy i18n.
⚠ Granica dowodu live-gate §4: brak wraków w zapisie ⇒ potwierdzone **zachowanie**, nie **treść**
filtra wraków (ta pinowana wykonaniowo, T5).

**NEXT: Finding 110** (wariant (c), kotwica jawna w `zone.data`).

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

## Ważne decyzje projektowe

| Decyzja | Uzasadnienie |
|---------|-------------|
| Globus panelu info STAŁY (`fixedGlobeSize` 0.42) — wspólny dla WSZYSTKICH zakładek | Scroll (C4) + przypięta stopka (S4) = zawór na wysoką treść; brak per-zakładkowej frakcji (C5/C6 też). Załoga==Planeta z konstrukcji → koniec „skoku" przy przełączaniu zakładki |
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
