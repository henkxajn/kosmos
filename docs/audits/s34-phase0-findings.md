# S3.4 FAZA 0 — Wyniki mini-audytów (read-only)

> **Status:** read-only, 2026-07-04. Żaden plik gry nie zmieniony (jedyny utworzony to ten raport).
> **Zakres:** 4 obszary, których audyt główny (`orbital-stations-audit.md`) nie mapował, a na których opiera się plan S3.4: **A1** etykiety kolonii na mapie 3D · **A2** trade capacity kolonii · **A3** moduły statków / colony ship · **A4** misje transportowe.
> **Metoda:** 4 równoległe agenty-śledcze (każdy czyta konkretne pliki i zwraca ustalenia z cytatami `plik:linia`+symbol) + 4 agenty-weryfikatory adversarial (ponownie czytają cytowane linie load-bearing, potwierdzają/obalają). Wszystkie 4 obszary: **confidence = high**, 0 błędów merytorycznych; 3 doprecyzowania (⚠) naniesione poniżej.
>
> **⚠ WERDYKT NAGŁÓWKOWY (kluczowy deliverable FAZY 0):** Założenie planu o transferze POP jest **POPRAWNE po stronie kolonii** (colony ship to realny transfer, nie abstrakcyjny `startPop`), ale **FAZA 4 WYMAGA KOREKTY po stronie stacji** — encja `Station` nie ma pola populacji ani `CivilizationSystem`, więc `station.pop +1` to kod greenfield, nie one-liner. Szczegóły w sekcji [Korekta FAZY 4](#korekta-fazy-4--kluczowy-deliverable). Rekomendacja: przesunąć pola `pop/popCapacity` na encję `Station` **do FAZY 1** (idą razem z modułami i migracją v90).

---

## A1 — Etykiety kolonii na mapie 3D

### Stan faktyczny: istnieją TRZY osobne mechanizmy, żaden nie pokazuje nazwy+POP kolonii

1. **Znacznik-romb (`_colonyLabels`, THREE.Sprite)** — nad każdą kolonią. Dostaje `name`, ale **nigdy nie rysuje tekstu** (brak `fillText` w `_createColonyMarker`). To czysty glif statusu kodowany kolorem/kształtem: home `#ffcc44` złoty / kolonia `#00ee88` zielony / outpost `#44ddaa` pusty miętowy. `depthTest:false` (nigdy zasłonięty geometrią), `sizeAttenuation:true` (stały rozmiar ŚWIATA → rośnie ekranowo przy zbliżeniu), `renderOrder 10`, anchor `(0.5,-0.3)` (unosi się nad ciałem). Sync co ~90 klatek (`_syncColonyLabels`), pozycja co klatkę (`_updateColonyLabelPositions`).
   - Cytaty: `ThreeRenderer.js:338` (`_colonyLabels`), `:2109` (`_syncColonyLabels`), `:2192` (`_createColonyMarker` — bez tekstu), `:2258` (SpriteMaterial), `:2160` (update pozycji).
2. **Etykiety tekstowe „CTRL-hold" (2D overlay na `#ui-canvas`)** — `getAllVisibleLabels()` zbiera pozycje ekranowe (przez `project()`), `UIManager._drawAllLabels` rysuje: 10px pastel + cień, kropka-lokator, **bez tła, bez ramki, nieklikalne**. Widoczne **tylko gdy fizycznie trzymany CTRL** (`GameScene` keydown→`setShowAllLabels(true)`, keyup→false); gated `!overlayManager.isAnyOpen()`. **Nie ma trwałej etykiety nazwy na mapie.**
   - Cytaty: `ThreeRenderer.js:3010` (`getAllVisibleLabels`), `:3005` (`setShowAllLabels`), `UIManager.js:1940` (`_drawAllLabels`), `GameScene.js:3658` (CTRL), `UIManager.js:74` (`UI_SCALE`).
3. **`BottomContext` (pływająca plakietka)** — tło+ramka+zakładki+akcja, kotwiczona do klikniętego ciała przez `getBodyScreenPosition`, clamp do map-area. **Najbliższy istniejący precedens stylu W2** i jedyne miejsce pokazujące dziś dane „okoł-POP", ale tylko dla POJEDYNCZEGO zaznaczonego ciała. Stacje reużywają identyczny wzór kotwiczenia (`getStationScreenPosition` → `StationPanel`).

### Źródła danych (do etykiety nazwa+POP)
- Nazwa kolonii: `colony.name`. ⚠ **Korekta weryfikatora:** `ColonyManager:131` to handler `body:renamed` (SYNC nazwy przy zmianie), **nie** miejsce pierwotnego nadania — pole `colony.name` jest realne i mutowalne, ale nie cytować :131 jako „set".
- POP (zajęty): `colony.civSystem.population`. ⚠ **Korekta:** odczyt na `ColonyManager:589` (`colony.civSystem?.population ?? 0`), **nie** :587 (587 = `colonyName`).
- Pojemność: getter `civSystem.effectiveHousing` (fallback `housing`); wzrost habitatowy → `effectiveHabitatHousing`/`habitatHousing`.
- ⚠ **`getAllColonies()` zwraca też kolonie AI** — filtr mgły wojny `!c.ownerEmpireId` **obowiązkowy** (precedens S3.5a-1). Potwierdzone przez weryfikatora.
- **Stacja NIE MA populacji** — nosi `StationDepot` (inventory), nie housing. „POP zajęty/capacity" dla stacji **nie ma pokrycia w danych** → wariant stacji musi zdefiniować treść inaczej (zajętość depotu / liczba modułów / zadokowane statki) = decyzja projektowa.

### Klikalność / okluzja
- Klikalny jest **znacznik-romb** (sprite w `_clickable`, `_entityByUUID.set(sprite.uuid, col.planet)`); etykiety tekstowe CTRL **nie** są klikalne. ⚠ Mapowanie sprite→encja jest **guardowane `if(col.planet)`** (`ThreeRenderer:2154`) — kolonia bez rozwiązanego `planet` dostaje klikalny sprite bez mapowania (raycast zwróci null).
- Okluzja „za kamerą": `getBodyScreenPosition`/`getStationScreenPosition` **null-ują** przez z-clamp (`pos.z<-1||>1`). **⚠ NIE używać `getScreenPosition`** (planet-only, legacy, BEZ z-clamp → bogus coords za kamerą). Okluzja „za planetą" nie jest obsługiwana nigdzie (sprite `depthTest:false`, overlay 2D bez depth-testu).

### Rekomendacja FAZA 5
Zbudować **NOWĄ dedykowaną warstwę etykiet** (nie przeciążać `_createColonyMarker`, który jest glifem-celem-klik). Dwie trasy:
- **Trasa A (rekomendowana): overlay 2D na `#ui-canvas`** (`MapLabelLayer`), rysowana po `_drawAllLabels` a przed overlayami, gated `civMode && !overlayManager.isAnyOpen() && !globeOpen`. Per klatkę: kolonie gracza (`getAllColonies().filter(c=>!c.ownerEmpireId)`) przez `getBodyScreenPosition`, stacje przez `getStationScreenPosition`; dziel przez `UI_SCALE`. Krisp tekst, łatwe LOD/fade + badge; wymaga per-frame project+clamp i jawnych hit-zones. Wzór gate: `_drawSelectionBrackets` (`UIManager:1774`).
- **Trasa B: rozszerzyć CanvasTexture sprite'a** (auto body-follow, zero kosztu project, już klikalny, okluzjo-odporny) — ale regeneracja tekstury przy zmianie POP/nazwy/statusu i `sizeAttenuation` kurczy tekst z dala (potrzeba clamp LOD). Pasuje do W1, gorzej do W2.
- **Wariant W1** (minimal): tekst nazwa+POP + 1px ramka, fade tylko blisko kamery. **Wariant W2** (plakietka): styl `BottomContext` (bg 0.92 + `GLASS_BORDER` + PAD 8), kolumna ikony/statusu, pasek POP `population/effectiveHousing`, chip badge (⚠ deficyt / 🔨 budowa). Oba warianty przez JEDEN `draw({variant, name, popCur, popMax|null, status, icon})` — kolonia/stacja różnią się danymi, nie layoutem.

### Decyzje projektowe (A1)
1. Trasa A (overlay 2D) czy B (sprite CanvasTexture)?
2. Co znaczy „POP" dla stacji (brak populacji): zajętość depotu %, sloty modułów, czy liczba zadokowanych?
3. LOD: always-on, reveal wg zoomu, czy zostać przy CTRL-hold? (Wiele kolonii+stacji → W2 always-on zaśmieci.)
4. Etykieta klikalna (otwiera ColonyOverlay/StationPanel) czy tylko informacyjna?
5. Koegzystencja z overlayem CTRL i kartą `BottomContext` — dedupe czy warstwowanie?
6. Źródło statusu: deficyt = `resource:shortage` vs morale/`employmentPenalty`; budowa = `_constructionQueue` vs `_pendingQueue` vs pending station orders?
7. W1 vs W2 domyślny (toggle w uiPrefs czy auto-switch wg zoomu)?
8. Ujednolicić ucinanie nazwy (dziś marker 12 zn. / BottomContext 18 zn.).

---

## A2 — Trade capacity kolonii (baza pod `trade_module` stacji)

### Formuła (z korektą)
`tradeCapacity` = pochodny budżet przepustowości handlu (jednostki „Kr/rok" = `BASE_PRICE × qty`). Inicjalizowany na 0, **przeliczany co pół roku** w `CivilianTradeSystem._allocateTC`:

```
tc = 200*pop + floor(prosperity/20)*50 + Σ(building.tcBonus * level)
```

⚠ Podpowiedź audytu „TC = 200×pop + budynki" jest OK, ale **POMIJA człon prosperity** (+100 przy prosperity 50, +250 przy 100). Skalowanie budynku ściśle liniowe z poziomem (`_getBuildingBonus` = `val × level`). Przepustowość połączenia = `min(fromTcAvail, toTcAvail)/price`; każdy transfer obciąża pule OBU końców.

### Budynki
- **Tylko `trade_hub` podnosi TC**: `tcBonus 200/level`, `maxLevel 5` → max +1000.
- `free_market` / `trade_beacon` / `commodity_nexus` dają **0 TC** (efektywność routingu / zasięg / upkeep).
- ⚠ `capacityBonus` (pole w BuildingsData, u wszystkich elektrowni/research `null`) to **housing/storage tooltip**, **NIE** klucz trade capacity — nie mylić.

### Rekomendacja `trade_module` (FAZA 1/2)
Stacja nie ma pop/prosperity → jest analogiczna do **outpostu** (TC wyłącznie z budynków). Parytet z `trade_hub` (200/level):

| Poziom | tradeCapacity | Uzasadnienie |
|--------|---------------|--------------|
| lv1 | **200** | konserwatywne — stacja to węzeł, nie dominator |
| lv2 | **400** | ≈ mała kolonia |
| lv3 | **600** | lekko powyżej małej kolonii (start pop2/prosp50 = 500 TC) |

Alternatywa „stacja-specjalista": 250/500/750. **Rekomendacja: 200/400/600** (dokładny parytet trade_hub). Wystawić jako **ABSOLUTNĄ** wartość per poziom (`tradeCapacityByLevel: [200,400,600]`), bo stacja nie ma bazy pop/prosperity do dodania.

- ⚠ **Korekta weryfikatora (ważna dla FAZY 3):** `getTradeCapacity(colonyId)` przyjmuje **ID (string)** i rozwiązuje przez `colonyManager.getColony(colonyId)` — **NIE** przyjmuje obiektu. Nazwanie pola `station.tradeCapacity` jest konieczne, ale NIEwystarczające: przyszła FAZA-3 (realne wpięcie) musi zarejestrować stację w ścieżce lookup (albo dodać gałąź/`getStationTradeCapacity`). FAZA 2 = **tylko wystawienie liczby**, bez wpięcia w CivilianTradeSystem (zgodnie z zakresem planu).

### Decyzje projektowe (A2)
1. Parytet trade_hub (200/400/600) vs specjalista (250/500/750)? Rekomendacja: 200/400/600.
2. Czy `trade_module` wystawia też analog zasięgu/efektywności? FAZA 2 = tylko capacity, ale bez zasięgu liczba nie ma efektu do FAZY 3.
3. Gdzie żyje poziom modułu — `station.tier` czy osobna mapa `modules`? (Plan FAZA 1.2 mówi `modules: []` — patrz uwaga niżej.)

---

## A3 — Moduły statków + colony ship  ⭐ KLUCZOWE

### System modułów
Statek = kadłub (`HullsData`/`ShipsData`) + lista id modułów (`ShipModulesData`). Moduł: `{id, namePL, nameEN, icon, slotType, tier, mass, cost{}, commodityCost{}, stats{}, requires, description}`. Wartości `slotType`: `propulsion, cargo, science, special, habitat, armor, fuel, weapon, shield, troop`.
- **Istnieje już mechanika „ładunku specjalnego" (nie-towar) — dokładnie to, czego potrzebuje passenger:** `habitat_pod` (`slotType:'habitat'`, `stats.colonistCapacity 1.0`) i `cryo_pod` (3.0). `calcShipStats` sumuje `colonistCapacity` → `vessel.colonistCapacity`; realni pasażerowie jadą w serializowanym polu `vessel.colonists`.
- `diplomatic_module` NIE nosi ładunku instancji — tylko `stats.enablesMissions:['envoy']` (statek blokowany abstrakcyjnie). `troop_bay` = `troopCapacity` (jednostki naziemne, osobne).

### ⭐ Colony ship = REALNY transfer POP (nie abstrakcyjny startPop)
Potwierdzone przez weryfikator (0 z 22 obalonych):
- **Załadunek:** `loadColonists` → `civSystem.removePop` (odejmuje z kolonii-źródła), `Vessel.js:754/763`.
- **Rozładunek do istniejącej kolonii:** `unloadColonists` → `civSystem.addPop`, `Vessel.js:774/780`; ścieżka migracji `MissionSystem.js:1514` (`existingCol.civSystem.addPop('laborer', colonistsLoaded)`).
- **Założenie nowej kolonii:** `createColony` ustawia `population = vessel.colonists`, `ColonyManager.js:376`.
- Transfer jedzie przez serializowane `vessel.colonists`. **Jedyne ścieżki abstrakcyjne:** fallback legacy-save `Math.max(2, crewCost)` oraz osobna ścieżka `foreign_colonize` (`VesselManager.js:2762`, zawsze 2, bez dekrementu).

### `passenger_module` — minimalny diff (data-only + i18n)
Wstawić JEDEN wpis do `SHIP_MODULES` obok `habitat_pod` (~`ShipModulesData.js:253`, habitat_pod 240-253 / cryo_pod 255-268):
```js
passenger_module: {
  id:'passenger_module', namePL:'Moduł Pasażerski', nameEN:'Passenger Module',
  icon:'🧑‍🚀', slotType:'special', tier:1, mass:8,
  cost:{Fe:20,Ti:8}, commodityCost:{pressure_modules:2},
  stats:{ colonistCapacity:1 }, requires:null,
  description:'Kabina ciśnieniowa dla 1 POP pasażera.'
}
```
`colonistCapacity` auto-przepływa do `vessel.colonistCapacity` (`VesselManager.js:160-167` create, `1294-1301` restore) i jedzie w `vessel.colonists` — **zero zmian renderer/VesselManager/save dla samej pojemności**. + `namePL/nameEN/description` w `pl.js` i `en.js` (reguła dwujęzyczności).

- ⚠ **PUŁAPKA `canColonize`:** `colonistCapacity>0` **samo w sobie** przełącza `canColonize()=true` (`Vessel.js:421`), **niezależnie od slotType**. Jeśli chcemy CZYSTEGO pasażera (nie kolonizatora), trzeba ALBO bramkować `canColonize`, ALBO użyć NOWEGO klucza `stats.passengerCapacity` + nowego pola `vessel.passengers` (nie reużywać `colonists`). `slotType:'special'` trzyma moduł poza klasyfikacją modelu-kolonii i poza rodziną utility-habitat, a `VesselModelResolver` traktuje jako kolonię tylko `slotType:'habitat'` → `'special'` jest bezpieczny dla GLB.

### Decyzje projektowe (A3)
1. FAZA 4 ładuje pasażera Z KOLONII (działa dziś: `loadColonists`/`freePops`) czy ZE STACJI (dziś niewspierane — stacja bez `civSystem`/`freePops`)?
2. Gdzie stacja przechowuje POP — nowe pole `Station.pop` czy klucz w `StationDepot.inventory`? (Żadne dziś nie istnieje.)
3. `passenger_module` = prawdziwy kolonizator (reuse `colonists`+`canColonize`) czy osobny stat (`passengerCapacity`+`vessel.passengers`)? Reuse = najmniejszy diff, ale przeciąża ścieżkę zakładania kolonii.

---

## A4 — Misje transportowe (dodanie „passenger transport")

### Pipeline i precedens mutacji POP
- Misje **już dziś mutują populację** ścieżką colony ship (`loadColonists→removePop` / `unloadColonists→addPop` / `_processColonyArrival addPop`) → założenie planu jest **poprawne po stronie kolonii**.
- Dyspozytor przylotu: **`_processArrival`** (`MissionSystem.js:1394`), blok dispatch `1408-1412` (⚠ korekta nazwy: nie `_onMissionArrived`). Nowy typ `passenger` wchodzi obok `transport`/`colony`/`envoy` z dedykowanym `_processPassengerArrival`.
- Cargo ład/rozład przez `resolveTransferStore` (`TransferStore.js` — `colony.resourceSystem | station.depot`); dok przez `dockAtTarget`/`dockAtStation` (`VesselManager.js:645-674`).

### Minimalny „passenger" (punkty wstawienia)
1. `Station.js` (~:33): `this.pop = config.pop ?? 0; this.popCapacity = config.popCapacity ?? DEFAULT;`
2. `StationSystem.serialize()` (`:82`): dodać `pop`, `popCapacity`; restore automatyczny (`new Station({...sd})`). Round-trip jak depot.
3. `Vessel.js`: reuse `vessel.colonists`/`colonistCapacity` jako payload **albo** nowe `vessel.passengers` (patrz A3 pkt 3).
4. `MissionSystem.js`: rejestracja w dispatcher (`:1408`); `_launchPassenger` (klon `_launchTransport` `:757`) — przy ORIGIN guard `civSystem.population>1` (**NOWY** — `loadColonists` guarduje `freePops/colonistCapacity`, nie last-POP), `removePop`, `vessel.colonists=1`; `_processPassengerArrival` — stacja → guard `station.pop<station.popCapacity` → `station.pop++` + emit `station:popArrived`; pełna stacja → `status='no_housing'` (retry wzorem `_tryResumeLoop` `:1844`); kolonia → `civSystem.addPop('laborer',1)` + **własny emit** (patrz niżej).
5. `FleetManagerOverlay._getValidTargets` (`:8029`): rozszerzyć bramkę o `actionId==='passenger'` + wpis akcji w menu floty (stacje gracza już tam są dla kierunku odwrotnego).
6. Flash `station:popArrived`/`popDeparted` w `StationPanel` + linia EventLog w `UIManager` (wzór `station:built`) + i18n PL+EN.

### ⚠ Korekty weryfikatora (A4)
- **`addPop` NIE emituje `civ:popBorn`** → przylot pasażera do kolonii **nie zaloguje się sam**. `civ:popBorn` leci z growth-tickera (`:853` agregat + `:1108` per-strata, oba active-civ-guarded) oraz ręcznie w `RandomEventSystem:389` i `ExpeditionSystem:1407`. **Wzór do skopiowania:** `ExpeditionSystem.js:1407` już paruje `addPop` z fallback-emitem `civ:popBorn` — użyć jako szablon, nie wymyślać nowego eventu.
- **Guard „never-last-POP" (`population>1`) jest NOWY** — `loadColonists` guarduje tylko `freePops/colonistCapacity` (`Vessel.js:759`); famine-guard `CivilizationSystem:888` to co innego.

### Decyzje projektowe (A4)
1. Co ustala `station.popCapacity`? (`StationData` bez pola pop — flat default per tier, czy bramkowane modułem habitat/`pressure_modules`?)
2. Migracja: potwierdzić „bez bumpa" (round-trip `?? 0` jak depot) — ale protokół CLAUDE.md i tak każe FAZIE 1 robić v90, więc pola pop mogą jechać z tą migracją.
3. Semantyka `no_housing`: statek czeka zadokowany i retry co tick, czy odwozi POP z powrotem?
4. Payload: reuse `vessel.colonists` czy osobne `vessel.passengers`?
5. Czy passenger obsługuje pętlę cykliczną (outbound/return), czy strict one-shot 1-POP?

---

## Korekta FAZY 4  ⭐ (kluczowy deliverable)

FAZA 0 miała wykryć rozjazd między planem a rzeczywistością — wykryła **jeden, po stronie stacji**:

| Element planu FAZA 4 | Rzeczywistość | Werdykt |
|----------------------|---------------|---------|
| „kolonia→stacja: załadunek `civSystem.population −1`" | `loadColonists→removePop` istnieje, REALNY transfer | ✅ **OK, reuse** |
| „stacja→kolonia: `civSystem.population +1`" | `unloadColonists`/`addPop`/`_processColonyArrival` istnieją | ✅ **OK, reuse** (ale dodać własny emit — `addPop` nie robi `civ:popBorn`) |
| „rozładunek `station.pop +1`" | **`station.pop` NIE ISTNIEJE** — `Station` nie ma `civSystem` ani pola populacji (potwierdzone bezpośrednim odczytem `Station.js`: pola to `depot/bodyId/ownerEmpireId/tier/stationType/createdYear/systemId/explored`) | ❌ **GREENFIELD** |
| „załadunek ZE stacji `station.pop −1`" | brak `freePops`/`removePop` na stacji | ❌ **GREENFIELD** |
| „guard: pop>1, nigdy ostatni POP" | `loadColonists` tego nie ma | ⚠ **NOWY guard** |

**Konsekwencja architektoniczna:** część pracy FAZY 4 przesuwa się do FAZY 1. Rekomendacja:
- **Dodać `Station.pop` (default 0) + `Station.popCapacity` JUŻ w FAZIE 1**, razem z modułami i migracją v90 (i tak bumpujemy wersję; `StationSystem.serialize` i tak rozszerzamy o moduły). Wtedy FAZA 4 dostaje pola gotowe i sprowadza się do: nowy typ misji + `_processPassengerArrival` z gałęzią stacja (`station.pop++`/`--`) zamiast `civSystem.addPop`.
- **`popCapacity` naturalnie wiąże się z modułem `habitat`** z FAZY 1 (plan: habitat → `+1 popCapacity`). To domyka pętlę: habitat daje miejsca, passenger je zapełnia, `no_crew` znika. Rekomendacja: `station.popCapacity` = Σ `habitat.level` (moduły), nie flat default — spójne z tabelą modułów planu.

To nie unieważnia planu — potwierdza jego kierunek (reuse mechaniki colony ship) i tylko **domyka lukę „strony stacji"**, którą FAZA 0 miała znaleźć.

---

## Załącznik — dane pod decyzje FAZY 1 (`[DECYZJA]` z planu)

Zweryfikowane bezpośrednio (spot-check), gotowe do użycia:

| Pozycja planu | Ustalenie | Cytat |
|---------------|-----------|-------|
| `power_fusion` gated tech | `requires:'fusion_power'` (istnieje; ← `nuclear_power`+`plasma_physics`) | `TechData.js:235` |
| `power_solar_auto` gated tech | `requires:'automation'` (istnieje; ten sam gate co `autonomous_solar_farm`) | `TechData.js:398` |
| `lab` RP/rok (parytet naziemny) | `research_station` = **8 RP/rok**, `energyCost 6`, `popCost 0.25`, `maxLevel 10` → rekomendacja: `lab` 4 RP/rok (moduł lżejszy, `popCost 0.1`) albo 8 dla parytetu | `BuildingsData.js:227-228` |
| `trade_module` capacity lv1/2/3 | **200/400/600** (parytet `trade_hub.tcBonus 200/lv`) | patrz A2 |
| `maxModules` (tier 1) | 8 — z planu, brak przeciwwskazań w danych | plan |
| Priorytet gaszenia przy deficycie | trade → lab → shipyard (habitat nigdy) — z planu | plan |
| Tech-gate stacji | `orbital_construction` (`space`, tier 3, 350rp, ← `space_mining`) | `TechData.js:592-599` |

**Uwaga do FAZY 1.2 (gdzie żyje poziom modułu):** plan mówi `modules: []` (lista `{id, moduleType, level, active}`) — to jest OK i spójne. Agent A2 sugerował „mapę" — trzymamy się listy z planu; helper „daj poziom modułu X" wystarczy.

---

## Potwierdzone kotwice (spot-check własny, poza A1-A4)

- **`CURRENT_VERSION = 89`** (`SaveMigration.js:20`) → plan bumpuje do **v90** w FAZIE 1. ✅
- **Kolejność restore:** `orbitalSpace.restore` (`GameScene.js:1268`) **przed** `stationSystem.restore` (`:1273`) — zachować. Nowe pola `pop/popCapacity/modules` na encji `Station` serializują się przez `StationSystem` (po `orbitalSpace`) → bez nowej zależności kolejności. ✅
- **`Station.js:3-4`** — nieaktualny komentarz `fuelStore/fuelCapacity` (usunięte w v85, konstruktor używa `depot`) → do usunięcia w FAZIE 1.2 (plan już to przewiduje). ✅
- `Station.serialize` (`StationSystem.js:82`) mapuje dziś 9 pól + `depot` → rozszerzenie o `modules/pop/popCapacity` jest addytywne, idempotentny restore zachowany. ✅

---

## STOP — decyzje do zatwierdzenia przed FAZĄ 1

FAZA 0 zakończona (read-only). Przed startem FAZY 1 potrzebuję decyzji:

1. **[Architektura FAZY 4 — najważniejsze]** Akceptujesz korektę: `Station.pop` + `popCapacity` dochodzą **już w FAZIE 1** (z modułami + migracją v90), a passenger ładuje/rozładowuje przez gałąź stacji (`station.pop±`) zamiast `civSystem.addPop`? `popCapacity` = Σ poziomów modułów `habitat`?
2. **[A3 — pułapka]** `passenger_module` jako prawdziwy kolonizator (reuse `vessel.colonists`, najmniejszy diff, ale trzeba świadomie zostawić/zbramkować `canColonize`) czy osobny stat `passengerCapacity`+`vessel.passengers` (czysty pasażer, więcej kodu)?
3. **[A2 — balans]** `trade_module` = 200/400/600 (parytet trade_hub) czy 250/500/750 (specjalista)?
4. **[A1 — FAZA 5]** Trasa etykiet: overlay 2D (rekomendacja) czy sprite CanvasTexture? I co oznacza „POP" dla stacji (brak populacji)? — to można rozstrzygnąć później, ale zaważy na wspólnym komponencie.
5. **[lab]** RP modułu `lab`: 4/rok (lżejszy) czy 8/rok (parytet `research_station`)?

Po zatwierdzeniu ruszam FAZĄ 1 (dane + model + migracja v90), commit atomowy, STOP na live-gate.
