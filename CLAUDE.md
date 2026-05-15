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
- Zapis: localStorage (klucz `kosmos_save_v1`), wersja save: v69 (patrz `SaveMigration.CURRENT_VERSION`)

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
| `src/config/GameConfig.js` | Globalne stałe gry + `FEATURES` flagi (M4 P1: M1+M2a flagi flip ON — movementOrders, fleetMaterialization, proximitySystem, vesselCombat, unifiedAggregator; enduranceDrainActive zostaje OFF do M4 P4; +m4DriftFix/m4Notifications/m4FuelAwareRetreat ON) |
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
| `groundUnit:buildingCaptured { unitId, planetId, q, r, buildingId, newOwner }` | GroundUnitManager | ColonyOverlay, ColonyManager |
| `groundUnit:captureInterrupted { unitId, planetId, q, r }` | GroundUnitManager | ColonyOverlay |
| `groundUnit:orbitalStrike { unitId, planetId, q, r, hits, friendlyFireHits, placeholder }` | GroundAbilities (orbital_support) | BattleSystem (placeholder) |
| `groundUnit:minefieldLaid { planetId, q, r, ownerId }` | GroundAbilities (lay_minefield) | ColonyOverlay, GameState |
| `groundUnit:mineTrigger { planetId, q, r, unitId, damage }` | GroundUnitManager | ColonyOverlay, EventLog |
| `groundUnit:fogRevealed { unitId, planetId, hexes[] }` | GroundUnitManager | FogSystem (TBD) |
| `groundUnit:healed { medicId, targetId, amount }` | GroundUnitManager | ColonyOverlay |
| `groundUnit:expired { unitId, planetId, reason }` | GroundUnitManager | ColonyOverlay |
| `groundUnit:stealthRevealed { unitId }` | GroundUnitManager | ColonyOverlay |
| `groundUnit:stealthHidden { unitId }` | GroundUnitManager | ColonyOverlay |
| `groundUnit:buildStarted { planetId, archetypeId, factionId }` | ColonyManager | GroundUnitPanel, EventLog |
| `groundUnit:buildCompleted { unitId, archetypeId, factionId, planetId, q, r }` | ColonyManager | GroundUnitPanel, ColonyOverlay |
| `groundUnit:buildFailed { planetId, archetypeId, reason }` | ColonyManager | GroundUnitPanel |
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
- [x] **Etap 18** — System POP: dyskretna populacja (start: 2 POPy), budynki wymagają 0.25–0.5 POP, konsumpcja 4 surowców per POP, wzrost akumulatorowy, głód, employmentPenalty, ekspedycje blokują 0.5 POP, SaveSystem v4
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
- [~] **Faza 7** — MilitaryAI + EconAI (GOAP + Utility) — ongoing, równolegle do balansu

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
| Konsumpcja per POP (4 surowce) | organics: 3.0, water: 1.5, energy: 1.0, minerals: 0.5 per POP/rok — emergentne napięcie zasobowe |
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
