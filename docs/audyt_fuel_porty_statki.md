# Audyt: paliwo · napędy · porty · rozmiary statków — stan PRZED reformą (Droga C)

**Data:** 2026-05-31
**Typ:** Krok 0 — audyt READ-ONLY stanu obecnego, wykonany ZANIM zaprojektujemy reformę napędów/paliwa/logistyki orbitalnej (**Droga C**).
**Zakres:** mapa „jak jest dziś" splecionych systemów: paliwo, napędy, lądowanie/porty, rozmiary statków, ich połączenia. Bez propozycji rozwiązań — decyzje projektowe zapadają osobno (z Filipem + research zewnętrzny).
**Zaufanie do danych:** wszystkie kluczowe twierdzenia o paliwie, gate'ach, tankowaniu, orbicie i rozmiarach zweryfikowane bezpośrednio w plikach (cytaty z linii poniżej). Wartości statystyk pojedynczych statków oraz linie `EmpireFleetMaterializer` pochodzą ze skanu pomocniczego (spójne, kod cytowany) — przed użyciem konkretnej liczby w decyzji balansowej warto zerknąć na dany obiekt. Balans ekonomii paliwa (ile realnie kosztuje vs produkuje) świadomie poza zakresem — to mapa stanu, nie tuning.

> Jedno odkrycie nadrzędne, które przewija się przez wszystkie 5 obszarów: **istnieje już 3-poziomowa drabina paliwa i pełen modularny system kadłub+moduły — ale spinające je „kleje" (rafineria, transfer orbita↔grunt, konsekwencje braku paliwa, stacje orbitalne) są albo placeholderem, albo zamrożone, albo nie istnieją.**

---

## 1. ⭐ PALIWO — **CZĘŚCIOWE** (mechanika realna, ekonomia dziurawa)

### Jak działa dziś

**Paliwo = commodity, nie zasób.** Trzy poziomy, każdy przypisany do klasy silnika:

| Paliwo | Tier | Recipe | Opis w grze | Silnik który go używa |
|---|---|---|---|---|
| `power_cells` | 2 | `Li:6, Cu:4, Si:2` (baseTime 0.375) | „Paliwo statków **Gen I**" | engine_chemical, engine_ion |
| `plasma_cores` | 3 | `Ti:8, Hv:6, Li:4` (baseTime 2.0, requiresTech `nuclear_power`) | „napędów statków **Gen III**" | engine_fusion |
| `warp_cores` | 5 | (endgame, unlock przez tech `warp_drive`) | „**Gen V** ship fuel" | engine_warp |

- Definicje: `src/data/CommoditiesData.js:79` (power_cells), `:204` (plasma_cores), `:318` (warp_cores).
- **Typ paliwa wynika z modułu silnika**, nie z kadłuba: `ShipModulesData.js:26/42` (→power_cells), `:58` (→plasma_cores), `:74` (→warp_cores). `calcShipStats` ustala `fuelType` regułą „ostatni silnik wygrywa" (`ShipModulesData.js:576`). Spływa na vessel: `Vessel.js:121,167,177`.

**Zużycie — REALNE.** `consumeFuel(vessel, distAU) = distAU × vessel.fuel.consumption` (`Vessel.js:291`). `consumption` liczone przy dispatchu: `baseFuelPerAU × techEff × dysonRangeMult` (`VesselManager.js:328`). Bazowe `baseFuelPerAU` per kadłub: 0.35 (small) / 0.5 (medium) / 0.7 (large) — `HullsData.js`. Zużycie jest **per-przelot** (odejmowane przy starcie misji + na nogę powrotną), **nie per-tick**.

**Tankowanie — REALNE, automatyczne.** `VesselManager._tickRefueling` (`:1345`) — tylko statki `state==='docked'`, pobiera właściwy typ paliwa z magazynu kolonii (`fuelType ?? 'power_cells'`, `:1363`) wg stawek `REFUEL_RATES` (`:54`): **power_cells 3/rok, plasma_cores 1/rok, warp_cores 0.5/rok**. Spend z inventory: `colony.resourceSystem.spend({ [ft]: canFuel })` (`:1378`).

### Co brakuje / co niedorobione (Filip miał rację — to słaby punkt)

1. **BRAK RAFINERII.** `grep "refinery"` w całym `/src` = 0 trafień. Paliwo to **zwykły produkt fabryki** — `factory` daje 1 punkt produkcji (`FactorySystem.js:3`), a power_cells konkuruje o te same punkty co pancerz/elektronika/stopy. Jest tylko szablon priorytetu `PRIORITY_TEMPLATES.fuel` „⛽ Paliwo & Logistyka" (`FactorySystem.js:21`, stockTarget power_cells 20) — ale to UI-preset, nie budynek. **Łańcuch surowiec→paliwo nie istnieje jako osobny system.**
2. **Paliwo nie blokuje ruchu (prawie).** Twardy gate jest **tylko** w `MovementOrderSystem._issueMoveToPoint` (`:443-446`, `reason:'insufficient_fuel'`) — czyli tylko dla rozkazów M4 (moveToPoint/pursue/intercept/engage), i **da się go ominąć** (`bypassFuelCheck`). Zwykły dispatch misji/ekspedycji (`VesselManager.dispatchOnMission:352-355`) **ślepo odejmuje i clampuje do 0**, bez żadnego sprawdzenia. Statek dolatuje z `fuel=0` i **nic się nie dzieje** — komentarz wprost: *„reforma w P4 nada temu real consequences (degradacja velocity)"* (`MovementOrderSystem.js:442`).
3. **Koszt energii tankowania zdefiniowany, ale NIEEGZEKWOWANY.** `ENERGY_PER_PC = 5` (`VesselManager.js:60`) — nigdzie nie wydawany w `_tickRefueling`. Martwa stała.
4. **Auto-produkcja paliwa (reactive) widzi tylko power_cells.** `FactorySystem.js:1163` hardkoduje `fuelType='power_cells'` przy skanie popytu — fusion/warp (plasma/warp cores) nie są auto-dosypywane.
5. **Świeże kolonie startują bez paliwa.** Nowo założone kolonie/outposty dostają minimum (food/water); nie mają power_cells → nie zatankują, dopóki nie postawią fabryki lub nie dowiozą paliwa transportem.
6. **Endurance — równoległy, ZAMROŻONY system.** „Wytrzymałość operacyjna" (drain 1-2/regen 20 per rok, `Vessel.js`) istnieje w kodzie, ale `FEATURES.enduranceDrainActive=false` (`GameConfig.js:52`) → `_tickEndurance` robi early-return (`:1238`). Komentarz: *„Unfreeze w M3 po pełnej reformie fuel"*. To jest **drugi, niezależny od paliwa licznik**, świadomie odłożony do tej samej reformy.

---

## 2. NAPĘDY — **ZAIMPLEMENTOWANE** (ale to ruch liniowy, nie fizyka)

### Ruch WEWNĄTRZ systemu (sublight)

- **Interpolacja liniowa ze stałą prędkością** — `VesselManager._updatePositions:1389`. `t = (gameYear − departYear)/(arrivalYear − departYear)`, pozycja = piecewise-linear po waypointach (`_interpolateWaypoints:1773`). `arrivalYear` policzone z `travelYears = dist/speedAU` przy dispatchu. **Brak przyspieszenia, brak flip-and-burn — średnia prędkość = stała.**
- **Prędkość per-statek**, jednostka **AU/civYear**: `baseSpeedAU` 1.4 (small) / 1.0 (medium) / 0.7 (large) — `HullsData.js`. Statki = interpolacja liniowa; tylko ciała niebieskie liczą Keplera (`PhysicsSystem`). Cel ruchomy: predykcja Keplera celu (`_predictPosition:336`) + dynamiczny powrót do bieżącej pozycji kolonii.
- **Trasowanie:** strefa wykluczenia Słońca 0.3 AU + margines 0.1 AU (`VesselManager.js:49-51`), omijanie ciał (margines 0.15 AU), waypointy tangencjalne (`_calcRoute:1875`).
- **Moduły silników** mnożą prędkość/paliwo (`ShipModulesData.js:14-79`): chemical ×1.0, ion ×1.8 (fuel ×0.6), fusion ×3.0 (fuel ×0.4), warp ×50. **Kara masy:** `speed /= ∛(mass/baseMass)`, `fuelPerAU *= ∛(...)` (`ShipModulesData.js:585-590`). Redundancja silników: +25%/dodatkowy silnik.

### Ruch MIĘDZY systemami (FTL/warp) — osobny mechanizm

- `VesselManager.dispatchInterstellar:534` + `_tickInterstellar:1814`. **To drugi, oddzielny system:** dystans **3D w latach świetlnych**, prędkość `warpSpeedLY` (domyślnie 2.5 LY/civYear, ×3 z beaconem), paliwo `warp_cores` (`fuelPerLY` domyślnie 0.5). Misja typu `interstellar_jump`, faza `warp_transit`; po dolocie lazy-generacja systemu i lądowanie na krawędzi (~30 AU). Podczas tranzytu `systemId=null` (statek „między gwiazdami").
- **Łańcuch tech:** `warp_theory` (T3) → `warp_drive` (T4, odblokowuje moduł `engine_warp` + commodity `warp_cores` + flagę `interstellar_travel`) → `interstellar_colonization` (T5, wymaga 5× warp_cores) — `TechData.js:801-847`.
- **Gating warpa jest pośredni:** `dispatchInterstellar` **nie sprawdza techa wprost** — bramką jest dostępność modułu `engine_warp` (spawnable dopiero po techu) i paliwa `warp_cores`.

### Sublight vs FTL = **dwa różne mechanizmy** (AU/px vs LY 3D, power/plasma vs warp_cores, waypointy vs wektor prosty).

### Ruch AI obcych — **ABSTRAKCYJNY**

Floty imperiów to `strength + destSystemId + etaYear` (nie statki). Materializacja w konkretne vessele tylko gdy `destSystemId==='sys_home'` i ETA ≤ 2 civYears (`EmpireFleetMaterializer.js`). Brak prędkości/sublightu dla flot AI — ETA liczone abstrakcyjnie.

---

## 3. ⭐ LĄDOWANIE / PORTY — **CZĘŚCIOWE** (dok/orbita realne; transfer i stacje = dziura)

### Dok vs orbita — statki NIE lądują na powierzchni

Stany vessela: `docked | in_transit | orbiting` (`Vessel.js`). Po dolocie `dockAtColony` (`VesselManager.js:478`):
- **Gate portu (REALNY):** `needsSpaceportForVessel` + `hasSpaceportAt` (`SpaceportCheck.js`). Mały kadłub (`size==='small'`) — ląduje/dokuje wszędzie. **Medium/large bez portu → zostają `orbiting`** (mogą robić orbital-ops: deploy prefab, transfer, desant), z logiem `orbitingNoPort` (`:490-505`). Z portem → `docked` (hangar, tankowanie, dispatch).
- Gate startu (analogiczny) jest wpięty **tylko** w `MovementOrderSystem:423` (`canLaunchFromCurrent`) — zwykły dispatch ekspedycji go nie woła.

### Spaceporty — wszystkie NAZIEMNE (na hex-mapie)

- `launch_pad` (`BuildingsData.js:310`, `isSpaceport:true`, wymaga `rocketry`), `autonomous_spaceport` (`:333`, `isAutonomous`, wymaga `automation`), `shipyard` (`:359`, buduje statki). Metoda `BuildingSystem.hasSpaceport():194`.

### Stacje orbitalne — **scaffolding bez funkcji**

- Istnieje pełny `OrbitalSpaceSystem.js` (Sins-of-a-Solar-Empire-style): pozycjonuje obiekty w sferycznych orbitach (r,θ,φ) wg ról z `OrbitalRolesData.js` — w tym rola **`station`** (GEO, anchored, omega=0, `:57`). **ALE: jest to system czysto WIZUALNY** (rozmieszczenie sprite'ów statków/wraków w 3D) — bez pojemności dokowania, bez przeładunku, bez funkcji portu. Co więcej, flaga `isStation` jest **odczytywana** (`OrbitalRolesData.js:121`) ale **nigdzie nie ustawiana** → rola `station` to martwy scaffolding.
- `orbital_habitat` (`BuildingsData.js:815`, `isOrbital:true`) — to tylko **budynek-housing** (20 mieszkań, nie zajmuje hexa), nie port. Podobnie `orbital_mine`, `orbital_fabricator` — funkcje produkcyjne, nie dokowe.

### Transfer orbita↔grunt — **BRAK etapu przeładunku**

Cargo „teleportuje": `unloadCargo` wlewa towar wprost do `colony.resourceSystem` (`Vessel.js:657-677`). Brak promu/shuttle/etapu pośredniego. POPy analogicznie (`loadColonists/unloadColonists`).

### Handel cywilny ≠ fizyczny transport

`CivilianTradeSystem` — **abstrakcyjny przepływ kredytowy** (gradient nadwyżka→deficyt, generuje Kredyty). **Nie wozi towaru statkami.** Wymaga portu by uczestniczyć (`_hasSpaceport` filtr), ale sam ruch towaru jest „udawany" (księgowy). Fizyczny transport gracza = ręczne misje cargo. Kurierzy `EmpireLogisticsSystem` (route-based, 2× hull_small+cargo_small/route) to **logistyka AI-imperiów**, nie gracza.

### ⭐ Zlecenia imperialne — **NIE ISTNIEJĄ, ale fundament jest mocny**

Gracz dziś „zleca" przez wzorzec *koszt→kolejka/defer*: budynki (`planet:buildRequest`), statki (`fleet:buildRequest`), jednostki (`army:recruitRequest`). Istniejące kolejki do oparcia feature'a:
- **`ProductionRequestBoard.js`** ⭐ — gotowy **board zleceń cross-colony**: `createOrUpdate(requester, commodity, qty, urgency)`, `assign`, `fulfill`, `cancel`, expiry 2 lata, serializacja. Dziś używany: CivTrade wykrywa deficyt → zlecenie → fabryka innej kolonii przyjmuje (`_scanExportOrdersDemand`). **To najbliższy istniejący szkielet pod „zamówienie imperialne".**
- `colony.shipQueues` (sloty = poziom stoczni), `BuildingSystem._constructionQueue` + `_pendingQueue` (defer do zasobów), `colony.pendingShipOrders`, `groundUnitQueues`.

### Grawitacja — wpływa TYLKO na popyt konsumpcyjny

`surfaceGravity` (`Planet.js:31`) → 3 pasma w `ConsumerGoodsData.js:27` → mnożniki popytu w `ProsperitySystem.js:191`. **Zero wpływu na koszt startu / paliwo / lądowanie / escape velocity.** `GravitySystem` to czysta symulacja N-body orbit gwiazdy.

---

## 4. ROZMIARY STATKÓW — **ZAIMPLEMENTOWANE** (najlepiej dopracowany z 5 obszarów)

- **Jawne pole `size`** (`small/medium/large`) w `HullsData.js` na 6 kadłubach modularnych: hull_small/medium/large + bojowe frigate(small)/destroyer(medium)/cruiser(large). Legacy `ShipsData.js` (science_vessel, cargo_ship, space_supply_ship) — bez pola `size` (rozmiar implicit przez masę).
- **Rozmiar wpływa na wszystko (skorelowane):** fuel/AU 0.35→0.5→0.7, prędkość 1.4→1.0→0.7 AU/y, masa 25→50→90 t, sloty 3→6→9. Plus dynamiczna kara masy `∛(mass/baseMass)` na prędkość i paliwo (`ShipModulesData.js:585`).
- **Cargo = tylko z modułów** (wszystkie kadłuby `baseCargoCapacity:0`): `cargo_small` +200t, `cargo_large` +1000t, `cargo_mass` +5000t. Egzekwowane wagowo: `loadCargo` sprawdza `cargoUsed + waga ≤ cargoMax` (`Vessel.js:494`). Kurier logistyki (hull_small+cargo_small) = **200t/przelot**, ładowanie „rare-first" (Xe/Nt przed Fe/C).
- **Ograniczenie dużych statków = miękkie:** medium/large wymagają portu do dok/startu (inaczej zostają na orbicie). **Brak twardego zakazu lądowania.** Małe — bez ograniczeń.
- Statki budowane przez `ColonyManager.startShipBuild` → `fleet:shipCompleted` → `VesselManager.createAndRegister` → `calcShipStats(hull, modules)` wlewa WSZYSTKIE statystyki w instancję (`Vessel.js:113-129`). Nic nie ginie poza zamierzoną karą masy.

---

## 5. JAK TE SYSTEMY SIĘ ŁĄCZĄ

- **Paliwo ↔ napęd ↔ rozmiar:** spięte. Rozmiar → baseFuelPerAU; moduł silnika → mnożnik paliwa **i typ paliwa** (power/plasma/warp cores); masa → kara ∛. Większy statek realnie pali więcej.
- **Logistyka ↔ paliwo:** kurierzy AI (`EmpireLogisticsSystem`) to vessele → **palą paliwo jak każdy** (przez dispatch). Trasy nie mają osobnego „kosztu paliwowego" — koszt wynika z dystansu × consumption. Handel **cywilny gracza** (`CivilianTradeSystem`) jest abstrakcyjny → **nie pali nic** (księgowość kredytowa).
- **Porty ↔ logistyka:** uczestnictwo w handlu cywilnym wymaga portu (`_hasSpaceport`); dok medium/large wymaga portu. Ale port jest **naziemny** — brak warstwy „port orbitalny jako węzeł logistyczny".
- **Udawane vs realne:** REALNE → zużycie paliwa, tankowanie, prędkości, kara masy, gate portu, warp. UDAWANE/placeholder → transfer orbita↔grunt (teleport), handel cywilny (kredyty bez haulu), stacje orbitalne (`OrbitalSpaceSystem` wizualny, `isStation` martwe), konsekwencja braku paliwa (zero), endurance (zamrożony), ENERGY_PER_PC (martwy).

### MAPA POŁĄCZEŃ (stan dziś)

```
                          ┌─────────────────────────────────────────────┐
   FABRYKA (generyczna)   │  ⚠ BRAK RAFINERII — paliwo = zwykłe commodity │
   factory = 1 punkt  ───►│  power_cells(T2) plasma_cores(T3) warp_cores(T5)
                          └───────────────┬─────────────────────────────┘
                                          │ spend z inventory kolonii (3/1/0.5 per rok)
                                          ▼
        ┌──────────── KADŁUB (size) ──────────────┐      _tickRefueling
        │ baseFuelPerAU 0.35/0.5/0.7              │◄──── (tylko docked)
        │ baseSpeedAU   1.4/1.0/0.7               │
        └──────┬───────────────────────┬──────────┘
               │ + MODUŁ SILNIKA        │ + kara masy ∛(m/m0)
               │ chem/ion→power_cells   │
               │ fusion →plasma_cores   ▼
               │ warp   →warp_cores   consumption = baseFuelPerAU×techEff×dyson
               ▼
   ┌─ RUCH W SYSTEMIE ───────────┐        ┌─ WARP (osobny system) ─┐
   │ interp. LINIOWA, stała v    │        │ LY 3D, 2.5 LY/y (×3 beacon)
   │ AU/civYear, waypointy       │        │ paliwo: warp_cores
   │ ⚠ brak accel/flip-burn      │        │ gate: engine_warp (tech T4)
   └──────────┬──────────────────┘        └────────────┬───────────┘
              │ arrival                                 │ arrival = krawędź systemu
              ▼                                         ▼
   ┌─ DOK / ORBITA ──────────────────────────────────────────────────┐
   │ small → docked wszędzie                                          │
   │ medium/large → docked TYLKO z portem, inaczej 'orbiting'         │
   │ GATE: SpaceportCheck (launch_pad / autonomous_spaceport — NAZIEMNE)
   │ ⚠ fuel-gate tylko dla movement orders; misje: odejmij i clampuj 0│
   └──────────┬──────────────────────────────────────────────────────┘
              │ unloadCargo
              ▼
   MAGAZYN KOLONII  ◄──── ⚠ cargo TELEPORTUJE (brak transferu orbita↔grunt)
              ▲
              │ (abstrakcyjnie, bez statków)
   CivilianTradeSystem (kredyty) ──► ProductionRequestBoard (zlecenia cross-colony) ── fundament pod „zlecenia imperialne"

   [OrbitalSpaceSystem: rola 'station' istnieje, isStation nigdy nie ustawiane — WIZUALNE only]
   [Endurance: kod jest, enduranceDrainActive=false — ZAMROŻONY]
   [Grawitacja: wpływa tylko na popyt konsumpcyjny]
```

---

## NAJSŁABSZE OGNIWA (potwierdzenie podejrzeń Filipa)

1. **⭐ Brak rafinerii — paliwo to zwykły produkt fabryki (POTWIERDZONE).** `power_cells/plasma_cores/warp_cores` rywalizują o te same punkty `factory` co pancerz i elektronika. Zero dedykowanego łańcucha surowiec→paliwo, zero budynku-rafinerii. To jest jednoznacznie najsłabszy punkt.
2. **Paliwo nie ma konsekwencji.** Twardy gate tylko na rozkazach M4 (i omijalny); misje/ekspedycje tylko odejmują i clampują do 0; dolot na zerze = bez kary. Komentarze w kodzie wprost odsyłają „real consequences" do nieistniejącej reformy P4.
3. **Brak transferu orbita↔grunt + brak funkcjonalnych stacji.** Cargo teleportuje do magazynu; handel cywilny jest abstrakcyjny (kredyty, nie haul); `OrbitalSpaceSystem` to dekoracja, a rola `station`/`isStation` jest martwa. Cała warstwa „port orbitalny ↔ port naziemny" nie istnieje funkcjonalnie.
4. **Endurance zamrożony + ENERGY_PER_PC martwy.** Dwa świadome placeholdery czekające na „reformę paliwa" — czyli reforma, którą teraz projektujemy (Droga C), była z góry zaplanowana w kodzie.
5. **Reactive auto-paliwo widzi tylko power_cells.** Statki fusion/warp nie są automatycznie zaopatrywane (`FactorySystem.js:1163` hardcode) — drabina paliwa istnieje, ale automatyka ekonomiczna jej nie obsługuje.

---

## CO BY TRZEBA dla wizji (jest / dodać / przebudować)

Wizja: Epstein-style ruch w systemie + warp od startu + orbital stations + ground spaceport + transfer orbita↔grunt + paliwo z rafinerii + rozmiary statków wpływające na paliwo.

| Element wizji | Status | Szczegół |
|---|---|---|
| **Epstein-style ruch w systemie** | 🟡 **przebudować** | Jest ruch per-statek ze stałą prędkością (AU/civYear) + moduły silników + kara masy. Brakuje profilu przyspieszenia / flip-and-burn — dziś czysta interpolacja liniowa. Fizyka „Expanse" = przebudowa modelu ruchu (`_updatePositions`). |
| **Warp od startu** | 🟡 **przebudować gating** | Mechanizm warpa **istnieje i działa** (`dispatchInterstellar`, LY/civYear, engine_warp+warp_cores). Ale zablokowany za tech `warp_drive` (T4). „Od startu" = przesunąć/znieść gate albo dodać słaby starter-warp. |
| **Stacje orbitalne** | 🔴 **dodać** (scaffolding jest) | `OrbitalSpaceSystem` + rola `station` + `orbital_habitat(isOrbital)` istnieją, ale jako wizual/housing. Funkcjonalna stacja (port orbitalny, dokowanie, węzeł) — do zbudowania; `isStation` czeka gotowe. |
| **Ground spaceport** | 🟢 **jest** | `launch_pad`, `autonomous_spaceport` + gate medium/large. Działa. |
| **Transfer orbita↔grunt** | 🔴 **dodać** | Dziś cargo teleportuje; handel cywilny abstrakcyjny. Brak etapu przeładunku/promu. Cała mechanika do dodania. |
| **Paliwo z rafinerii** | 🔴 **dodać** | Brak rafinerii; paliwo przez generyczną fabrykę. Do dodania: budynek/łańcuch surowiec→paliwo + ew. konsekwencje braku. |
| **Rozmiary wpływające na paliwo** | 🟢 **jest** | `baseFuelPerAU` per size + kara masy ∛. Działa; co najwyżej tuning balansu. |
| **Zlecenia imperialne** (pula→skarbiec→civ-trade→orbita) | 🟡 **zbudować na fundamencie** | Nie istnieją, ale `ProductionRequestBoard` (board zleceń cross-colony z assign/fulfill/expiry) + kolejki (shipQueues, _constructionQueue, pendingShipOrders) to gotowe wzorce do oparcia feature'a. |

---

*Audyt READ-ONLY. Nie projektowano rozwiązań ani nie zmieniano kodu gry. Następny krok: projekt reformy (Droga C) z Filipem + research zewnętrzny.*
