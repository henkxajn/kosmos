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
- **Canvas 2D** (natywny) — warstwa UI (UIManager) i mapa planety (PlanetScene)
- JavaScript ES Modules (natywne, bez bundlera)
- **Brak Node.js** — otwierać przez Live Server w VS Code
- Zapis: localStorage (klucz `kosmos_save_v1`), wersja save: v4

### Architektura renderingu (3D + 2D overlay)
```
index.html
  #three-canvas   → ThreeRenderer (Three.js WebGL) — gwiazda, planety, księżyce, orbity
  #ui-canvas      → UIManager (Canvas 2D)           — panel info, paski czasu, EventLog
  #planet-canvas  → PlanetScene (Canvas 2D)         — mapa hex planety (4X)
  #event-layer    → przezroczysta warstwa zdarzeń myszy (z-index nad wszystkim)
```

**ThreeRenderer** (`src/renderer/ThreeRenderer.js`):
- Sfera dla gwiazdy + planety (MeshPhongMaterial, atmosfera glow jako sprite)
- Księżyce: małe sfery w scenie głównej + RingGeometry jako child grupy planety
- OrbitLine: TubeGeometry po punktach Keplera
- `initSystem(star, planets, planetesimals, moons)` — buduje scenę przy starcie
- `physics:updated { planets, star, moons }` → `_syncPlanetMeshes()` — synchronizuje pozycje

**ThreeCameraController** (`src/renderer/ThreeCameraController.js`):
- Sferyczny orbit: LPM drag = obrót, scroll = zoom (10–450 j.), H = reset
- `wasDrag` — flaga odróżniająca drag od kliknięcia

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
  game, edenScenario,
  civMode,          // bool — czy gracz przejął cywilizację
  homePlanet,       // planeta gracza
  resourceSystem,   // ResourceSystem
  civSystem,        // CivilizationSystem
  buildingSystem,   // BuildingSystem
  techSystem,       // TechSystem
  savedData,        // dane z localStorage (BootScene → GameScene)
}
```

### Zasada komunikacji
```
PlanetScene → EventBus.emit('planet:buildRequest') → BuildingSystem._build()
BuildingSystem → EventBus.emit('resource:registerProducer') → ResourceSystem
BuildingSystem → EventBus.emit('planet:buildResult') → PlanetScene (UI update)
```
NIE importuj systemów bezpośrednio między sobą.

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

---

## Pliki krytyczne — nie modyfikuj bez planu

| Plik | Dlaczego krytyczny |
|------|-------------------|
| `src/core/EventBus.js` | Serce komunikacji — błąd tu psuje wszystko |
| `src/core/EntityManager.js` | Rejestr encji — modyfikacja rozbija save/restore |
| `src/systems/PhysicsSystem.js` | Prawa Keplera + kolizje — fizyka orbitalna |
| `src/config/GameConfig.js` | Globalne stałe gry |
| `src/map/HexGrid.js` | Matematyka hex cube coordinates |

---

## Pliki kluczowe 4X (mapa zależności)

```
GameScene.create()
  └─ ResourceSystem         ← surowce (minerals/energy/organics/water/research)
  └─ TechSystem(resSys)     ← drzewo tech, mnożniki produkcji
  └─ CivilizationSystem({}, techSys)  ← POPy, morale, epoki, consumption
  └─ BuildingSystem(resSys, civSys, techSys)  ← budowa (wymaga POP), demolish, rateReapply

PlanetScene
  └─ importuje: HexGrid, PlanetMapGenerator, BUILDINGS, TECHS, ResourcePanel
  └─ nasłuchuje: resource:changed, planet:buildResult, planet:demolishResult, tech:researched
  └─ emituje:   planet:buildRequest, planet:demolishRequest, tech:researchRequest

SaveSystem._serializeCiv4x()
  └─ czyta: window.KOSMOS.{resourceSystem, civSystem, buildingSystem, techSystem, expeditionSystem}
  └─ zapisuje: resources, civ, buildings (z baseRates + popCost!), techs, expeditions
```

---

## Kluczowe zdarzenia EventBus (4X)

| Zdarzenie | Emitent | Odbiorcy |
|-----------|---------|----------|
| `resource:registerProducer { id, rates }` | BuildingSystem, CivSystem | ResourceSystem |
| `resource:removeProducer { id }` | BuildingSystem | ResourceSystem |
| `resource:changed { resources }` | ResourceSystem | PlanetScene, ResourcePanel |
| `resource:shortage { resource }` | ResourceSystem | CivilizationSystem |
| `planet:buildRequest { tile, buildingId }` | PlanetScene | BuildingSystem |
| `planet:buildResult { success, tile, reason }` | BuildingSystem | PlanetScene |
| `planet:demolishRequest { tile }` | PlanetScene | BuildingSystem |
| `planet:demolishResult { success, tile }` | BuildingSystem | PlanetScene |
| `tech:researchRequest { techId }` | PlanetScene | TechSystem |
| `tech:researched { tech, restored }` | TechSystem | BuildingSystem, PlanetScene |
| `civ:addHousing / removeHousing` | BuildingSystem | CivilizationSystem |
| `civ:popBorn { population }` | CivilizationSystem | UIManager, BuildingSystem |
| `civ:popDied { cause, population }` | CivilizationSystem | UIManager, BuildingSystem |
| `civ:employmentChanged { delta }` | BuildingSystem | CivilizationSystem |
| `expedition:sendRequest { type, targetId }` | UIManager | ExpeditionSystem |
| `civ:lockPops / unlockPops { amount }` | ExpeditionSystem | CivilizationSystem |
| `fleet:buildRequest { shipId }` | UIManager | ColonyManager |
| `fleet:buildStarted { planetId, shipId }` | ColonyManager | UIManager |
| `fleet:shipCompleted { planetId, shipId }` | ColonyManager | UIManager |
| `fleet:buildFailed { reason }` | ColonyManager | UIManager |
| `fleet:shipConsumed { planetId, shipId }` | ColonyManager | — |
| `expedition:reconComplete { scope, discovered }` | ExpeditionSystem | UIManager (EventLog) |
| `planet:colonize { planet }` | UIScene | GameScene → PlanetScene |
| `planet:openMap { planet }` | UIScene | GameScene → PlanetScene |

---

## Dodawanie nowych funkcji

1. Nowa mechanika → nowy plik w `src/systems/` (logika) lub `src/data/` (definicje)
2. Subskrybuj zdarzenia przez `EventBus.on('event', cb)`
3. Emituj zdarzenia przez `EventBus.emit('event', data)`
4. NIE importuj systemów bezpośrednio między sobą
5. Dane gry (budynki, tech, składy chemiczne) → `src/data/` — oddzielone od logiki
6. Nowy budynek tier-2: dodaj `requires: 'tech_id'` w BuildingsData + odpowiednie `unlockBuilding` w TechData
7. Nowy statek: dodaj definicję w `ShipsData.js` + `unlockShip` w TechData + budowa przez Stocznię (ColonyManager.startShipBuild)

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

### Następne etapy (plan)
- [ ] **Etap 14** — Kolonizacja: colony_pod → osada na innym ciele → druga PlanetScene
- [x] **Etap 15** — Zdarzenia losowe: RandomEventSystem (tymczasowo wstrzymany, flaga disabled=true)
- [ ] **Etap 16** — Ekspansja między planetami: handel, migracja, zarządzanie imperium
- [ ] **Etap 17** — Cel gry: warunki zwycięstwa / milestones cywilizacyjne

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
| RandomEventSystem disabled | System wstrzymany (flaga disabled=true) do czasu dopracowania logiki zdarzeń |
