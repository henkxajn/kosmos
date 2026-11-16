# Game design reference — vision, MDA principles, design decisions, lore (moved from CLAUDE.md)
> Moved verbatim from CLAUDE.md on 2026-11-16 (source lines 11–21, 135–162, 3476–3577). Reference material accumulated over many slices — check file:line details, flag names and event consumers against the code before relying on them. Kept in the original language (Polish).

<!-- CLAUDE.md L11–21 -->
## Wizja gry

Dwuwarstwowa gra przeglądarkowa:
1. **Warstwa symulacyjna** — generujesz układ planetarny i obserwujesz jego ewolucję (Tamagotchi kosmiczne)
2. **Warstwa 4X** — gdy powstaje cywilizacja, przejmujesz nad nią kontrolę. Budujesz instalacje na mapie hex planety, rozwijasz technologię, wysyłasz ekspedycje na asteroidy i inne planety

Cel warstwy 4X (oryginalna wizja gracza):
> "Jak braknie surowców lub nie ma dostępu do unikalnych surowców, gracz wysyła ekspedycje na asteroidy lub inne planety. Tak robi ekspansję swojej cywilizacji."

---

<!-- CLAUDE.md L135–162 -->
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

<!-- CLAUDE.md L3476–3577 -->
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

---

