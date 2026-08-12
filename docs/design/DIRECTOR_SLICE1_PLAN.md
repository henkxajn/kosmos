# DIRECTOR SLICE 1 — szkielet reguł, mapa wpływów, produkcja statków AI · plan doc

**Status:** 🟢 **ZATWIERDZONY — wszystkie osiem decyzji PODPISANE 2026-08-10**, w tym dwa **orzeczenia
właścicielskie Filipa** (R-1, R-2) nadpisujące jego własne wcześniejsze ustalenia (§Rulings).

**Postęp:** **S0 ✅** `e9f1853` (weryfikacja szwów WYKONANIEM — 11 potwierdzonych, **V4 ZŁAMANE**;
stąd dwa orzeczenia i trzy wymagania dla S4) · **S1 ✅** `31bd81b` (szkielet reguł + rejestry + stan
bez migracji; wymusił wydzielenie `SeedMath.js` z `AcceptanceMath.js` — pin **P14 przeszedł BEZ
EDYCJI**, 206/206) · **audyt stacji AI ✅** (pod **R-3**, §Audyt stacji AI — premisa potwierdzona,
zasiew MAŁY pod warunkiem prerekwizytu 3D i dwóch decyzji właścicielskich) · **S3 ✅** (katalog
szablonów Filipa + resolver, 52/52) · **S2 ✅** (pomiar R-2 → **17,7 %**, warunek spełniony dla
dzisiejszej gry; mapa wpływów + `BORDER_LY`, 45/45) · **prerekwizyt 3D ✅** `3596c0c` ·
**S4 ✅ + GATE 1 PASSED** (`8006ceb` fundament + `499ff7b` zasiew/tech + `9bebe0d` akcja +
`0ff5b50` fix własności + `1ee9a99` lewar załogi + `831a3e7` izolacja Dziennika; keepery
54 + 25 + 30 + 32) — **zamknięty WARUNKOWO: wyciek zdarzeń KOLONII AI do Dziennika OTWARTY**
(pierwsze zadanie następnej sesji) · **S5 ⏭ NASTĘPNY = GATE 2** (łańcuch pierwszego kontaktu) ·
S6–S7 nierozpoczęte · **Gate 3 przed nami.**

✅ **Wszystkie podpisy dostarczone 2026-08-11:** zwężenie R-2 ratyfikowane · decyzje 9/10
(odczyt A, metryka 3D) ratyfikowane · **R-3** podpisane (żeton bez modułów + predykat
`empireHasOrbitalStation`, zwolnienie AI w `startShipBuild` NIETKNIĘTE) · `point_defense`
do `startingTechs` wszystkich spawnowanych archetypów · prerekwizyt 3D wykonany · **R-4**
(drabinka technologiczna zostaje) podpisane.

✅ **GATE 1 — PRZEBIEG 3: PASSED** (2026-08-11). Cztery punkty nienegocjowalne zielone: **G1.5**
własność na OBU trasach (bezpośredni start `v_1` + promocja `pending→queue` `v_2` — dokładnie ta,
na której padł przebieg 1), **G1.10** wpis `shipRejected` przy `no_crew`, **G1.15** naturalne
wygaśnięcie TTL bez zjawy, **G1.18/G1.19** żeton bramkujący per-imperium. Round-trip zapisu
(liczba stacji, właściciele, v100) przeszedł; `grantFreePops` zadziałał (0→20, po budowie 19,6 —
zużycie załogi widoczne).
**Przebiegi 1–2 i ich naprawy:** §Wyniki GATE 1 (trzy dziury stempla) + `1ee9a99` (martwy lewar
załogi w skrypcie).
**Dwie rozbieżności zgłoszone przy PASS, obie naprawione w `831a3e7`:** wyciek zdarzeń stoczni
i statków AI do Dziennika gracza (**darmowy wywiad** — omijał warstwę intelu) oraz zgubiona
adnotacja `directorOrigin` (naprawiona tą samą zasadą co własność: wyprowadzana z ładunku, nie
z pamięci).

🔴 **JEDNA RZECZ OTWARTA — S4 zamknięty WARUNKOWO.** Spot-check ujawnił **trzecią warstwę tego
samego defektu**: zdarzenia ŻYCIA KOLONII AI (głód, niepokoje, populacja, niedobory) nadal
przechodzą do Dziennika gracza bez filtra właściciela. To pierwsze zadanie następnej sesji —
razem z PEŁNYM audytem i tabelą klasyfikacji subskrybentów (szczegóły i rozmiar: blok
§PLAN NA JUTRO na górze).

📌 **Do WAR_BACKBONE (zapisane, NIE naprawiane tutaj) — dwa znaleziska ekonomiczne:**
1. **Popyt na niewytwarzalne — i odwrotnie: pominięte RUDY, które realnie blokują.**
   Sprzężenie ustawia popyt na `warp_cores`, których fabryka kolonii najpewniej **nie umie
   wytworzyć** — ta sama klasa teatru, którą Ruling 2 wykluczył dla rud, tylko wykryta na
   komodycie. Docelowo `_feedCommodityDemand` potrzebuje filtra **„wytwarzalne TUTAJ"**
   (receptura dostępna w TEJ kolonii), a nie tylko „to komodyta".
   ⚠ **Druga strona tego samego problemu, zmierzona w przebiegu 3:** lista braków przy zamówieniu
   zawierała **RUDY** (`Ti` luka 155, `Hv` 30) obok komodytów. Ruling 2 wykluczył rudy z popytu
   „bo fabryka ich nie produkuje" — ale to właśnie one bywają wąskim gardłem, a dziś **nie
   uruchamiają żadnej reakcji gospodarczej**; zostaje im wyłącznie TTL. Wykluczenie rud wymaga
   więc **ponownego rozpatrzenia razem z filtrem wytwarzalności** (rudy → wydobycie/import,
   nie fabryka). Dziś skutek ograniczony: TTL zamknie zlecenie po 3 latach.
2. 🔴 **ZAŁOGA JEST STAŁYM OGRANICZENIEM produkcji okrętów AI** (czwarte znalezisko ekonomiczne).
   `freePops = population − (employedPops − syntheticJobs) − lockedPops`, a `_employedPops` liczy
   **ETATY zarejestrowane przez budynki**, nie pracowników. Autorozbudowa AI stawia budynki, aż
   etatów jest **tyle samo lub więcej** niż POPów w stratach — czyli **pełne zatrudnienie jest
   zaprojektowanym stanem ustalonym kolonii AI**, a pula wolnych POPów zbiega do zera.
   Zmierzone trzykrotnie: S0 (`freePops = 0` przy pop 47 przez 400 civY), przebieg 1 gate'u
   (naturalne `no_crew`), przebieg 2 (pop 51, etaty ≥ 51 ⇒ `freePops = 0`).
   **Konsekwencja dla łańcucha nacisku:** `startShipBuild` bramkuje załogę TWARDO (odmowa, nie
   kolejka), więc rozwinięta kolonia AI może być trwale niezdolna do zbudowania okrętu mimo
   stoczni, techu, surowców i żetonu. To **nie jest** usterka S4 — Director poprawnie raportuje
   `no_crew` — ale przesądza o realnej grywalności nacisku i należy do reformy ekonomii AI.

🔴 **HOLD — nie zaczynamy S5.** Następny ruch należy do przebiegu Gate 1 na ŚWIEŻEJ grze
(zasiew żetonu leci wyłącznie przy generacji imperiów, więc stary zapis pokaże
`no_orbital_station` — to poprawne). Po wyniku: triaż albo S5.

⚠ **Kolejność S3 ↔ S2 ZAMIENIONA** (decyzja właściciela, 2026-08-11): katalog szablonów wszedł przed
mapą wpływów, bo szablony były gotowe do wpisania, a S2 zaczyna się od pomiaru. Zależności to nie
narusza — S3 jest czysty (zero wywołań produkcyjnych), a S4 konsumuje OBA.

---

## RESUME — start świeżej sesji (czytaj to PIERWSZE)

### ⏭ PLAN NA JUTRO — kolejność wiążąca (stan na koniec sesji 2026-08-11)

**Gdzie jesteśmy:** **GATE 1 PASSED** (przebieg 3). Wszystkie cztery punkty nienegocjowalne
zielone: własność na OBU trasach (bezpośredni start + promocja `pending→queue` — dokładnie ta,
na której gate padł za pierwszym razem), wpis `shipRejected` przy `no_crew`, naturalne wygaśnięcie
TTL bez zjawy, żeton bramkujący per-imperium. Round-trip zapisu (stacje, właściciele, v100) też
przeszedł. **S4 jest ZAMKNIĘTY warunkowo** — czeka na jedną naprawę niżej.

**(a) ✅ ZROBIONE 2026-08-12 — wyciek zdarzeń KOLONII AI do Dziennika gracza.** Produkt audytu:
§Audyt Dziennika — TABELA KLASYFIKACJI (niżej). Zmierzono **78** subskrybentów (nie 44), trzy
pozycje ze spisu poniżej okazały się NIE-wyciekami, a dwie realne dziury (`trade:imported`,
`impact:colonyDamage`) plus trzecia (`civ:epochChanged`) doszły z audytu. Opis pierwotny zostaje
niżej jako kontekst zgłoszenia.

**(a) [oryginalne zgłoszenie] wyciek zdarzeń KOLONII AI do Dziennika gracza** — trzecia warstwa tego samego
defektu. Poprzednia naprawa (`831a3e7`) objęła stocznię i statki; zdarzenia ŻYCIA KOLONII
(głód, niepokoje społeczne, populacja, niedobory) **nadal przechodzą bez filtra właściciela**,
więc gracz czyta o głodzie w koloniach AI.
⚠ **TYM RAZEM PEŁNY AUDYT, nie łatanie po jednym objawie** — trzecia niespodzianka z rzędu robi
się droga. Rozmiar zmierzony: **113 subskrypcji `EventBus.on` w `UIManager`, z czego 44 pisze do
Dziennika** (`_log`/`_addNotification`); do tego emitenci spoza UIManagera
(`ColonyAutoExpander`, `EmpireLogisticsSystem`, `EmpireResearchSystem`, `EmpireStrategySystem`,
`WarpRouteSystem`). Kandydaci warstwy kolonii są zlokalizowani i **niosą już `planetId`**:
`civ:unrest` (`:970`), `civ:unrestLifted` (`:974`), `civ:famine` (`:978`), `civ:famineLifted`
(`:982`), `civ:popBorn` (`:987`), `civ:popDied`, `resource:shortage` (`:682`), brownout (`:645`).
**Produkt audytu = TABELA KLASYFIKACJI** każdego z 44 subskrybentów jako
`player-scoped | AI-scoped | global-by-design` (zmiany epoki i zdarzenia galaktyczne mogą być
globalne CELOWO) — do commit message albo do tego planu, żeby gate miał z czym porównywać.
Bramka: `_isPlayerColonyEvent(planetId)`, **fail-closed**, DebugLog NIETKNIĘTY.
Keeper: rozszerzyć `director_feed_isolation_smoke` o warstwę kolonii, **fail-first** — głód
kolonii AI ⇒ ZERO wpisów w Dzienniku, głód kolonii gracza ⇒ wpis obecny.

**(b) POTEM: pełny spot-check Filipa** (konsola, bez pełnego przebiegu gate'u): build gracza →
wpis; build AI → cisza; fregaty niosą `szablon` (`directorOrigin`); głód kolonii AI → cisza.
⚠ **Pozycja OTWARTA z poprzedniego spot-checku, do domknięcia przy okazji:** po
`grantFreePops` + `aiWarships` zlecenie stanęło na `queued` i nie potwierdzono ukończenia budowy.
To **jeszcze nie jest defekt** — najpewniej braki komodytów. Domknąć jednolinijkowcem z §5b
skryptu (odczyt braków z `director:commodityDemand`, NIE z pamięci), uzupełnić i doczekać do
`shipQueues`.

**(c) ✅ ZAIMPLEMENTOWANE 2026-08-12 — S5, czeka na GATE 2.** Checklist:
`DIRECTOR_S5_GATE2_CHECKLIST.md`. Keeper `director_first_contact_smoke` 41/41, sweep 122/122.
🔴 **Znalezione przy implementacji, wiąże dalsze reguły:** `roll.unit: 'displayedYear'` był
**zadeklarowany, ale nieegzekwowany** — `rollFires` liczy wyłącznie PRÓBY, a `tickEmpire` chodzi
raz na rok CYWILIZACYJNY, więc „10 % +10 pkt/rok" osiągało 100 % po 0,83 roku wyświetlanego zamiast
~3,7 (decyzja 2 byłaby martwa). `DirectorSystem._evaluate` ma teraz bramkę „jedna próba na rok
wyświetlany" (`lastAttemptYear` w stanie reguły, pusty default = bez migracji). **Każda przyszła
reguła z `roll` dziedziczy tę semantykę.** Druga rzecz: S5 jest pierwszą realną regułą, więc dopiero
teraz `DirectorSystem` jest w ogóle instancjonowany i tickowany z `AlienCivSystem._tickAll`;
kolejność „rejestracja zachowań PRZED konstrukcją silnika" jest wymuszona (walidacja katalogu rzuca
na nieznanej nazwie) i pinowana w `director_skeleton_smoke`.

**(c) [oryginalny zakres] S5 — łańcuch pierwszego kontaktu (GATE 2).** Zakres bez zmian względem
tabeli commitów: wyzwalacz „obserwatorium L5" (sonda `playerObservatoryLevel`), rzut kumulatywny
w latach **WYŚWIETLANYCH** (decyzja 2), akcja `scienceFlyby` (spawn wzorem
`EmpireFleetMaterializer` + kurs przez układ gracza + despawn na wyjściu), **Director PRZEJMUJE
beat** `vessel:firstSighting` (decyzja 5) — a przy okazji **trzeba naprawić nieserializowany
`_reportedVesselSightings`**, inaczej przeładowanie odpali beat drugi raz. Narracja przez
`queueMissionEvent`/`ScheduledEventPopup` (kanał bez przycisku, który coś robi — Slice 1 się
mieści, bo beat jest czysto narracyjny), intel imperium → `rumor`, oraz
**`first_contact_kill`** (modyfikator opinii + wpis pamięci) na zestrzelenie przelotu (decyzja 4).
i18n PL+EN.

**(d) NA KONIEC: checklist GATE 2** w formacie skryptu sesji, z one-linerami **WYKONANYMI na
żywym silniku** przed wpisaniem. Obowiązują WSZYSTKIE stałe reguły skryptów, każda kupiona
błędem: **zero wieloliniowego kodu w cytatach blokowych** (kopiuje się z `> ` → SyntaxError) ·
stolica **wyłącznie** przez `KOSMOS.directorProduction.capitalOf(empireId)` (kolonie nie mają
`.id`, „pierwsza pełna" pęka przy wielu) · braki **odczytywać z silnika**, nigdy z listy
w pamięci · **DebugLog to pierścień czyszczony przy przeładowaniu** — kroki po wczytaniu gry
nie mogą odpytywać wpisów sprzed reloadu · **nie uruchamiać gate'u równolegle z pracą CC**
(commit przeładowuje Live Server i kasuje przebieg; zapis do pliku PRZED wklejeniem promptu) ·
lewary stanu tylko przez zwalidowane narzędzia (`grantFreePops`), nigdy przez „naturalnie
wyglądające" pole.


---

## Audyt Dziennika — TABELA KLASYFIKACJI (produkt zadania (a), 2026-08-12)

Wykonany zamiast łatania po objawie. Metoda: parser `EventBus.on(...)` po **domknięciu nawiasu**
na źródle **ze zdjętymi komentarzami** (polskie komentarze niosą apostrofy i nawiasy — licznik
głębokości na surowym źródle rozjeżdża się i skleja sąsiednie subskrypcje; pierwszy przebieg dał
przez to fałszywe wiersze).

🔴 **KOREKTA ROZMIARU.** Plan mówił o **44** subskrybentach piszących do Dziennika. Zmierzone:
**78** (na 113 `EventBus.on` w `UIManager`; 69 wywołań `_log` + 20 `_addNotification`). Liczba 44
nie odpowiada żadnej mierzalnej wielkości — traktować jako oszacowanie poprzedniej sesji, nie fakt.

🔴 **KOREKTA SPISU KANDYDATÓW.** Trzy z sześciu pozycji wskazanych w planie **nie były wyciekiem**,
a dwa realne wycieki w tej samej warstwie **nie były w spisie**:

| pozycja z planu | werdykt audytu |
|---|---|
| `resource:shortage` (`:682`) | **NIE wycieka** — nie pisze do Dziennika w ogóle (miga ikoną zasobu), a emitent i tak stoi za `isActive` |
| brownout (`:645`) | **NIE wycieka** — to nie osobny subskrybent, tylko helper `_applyResources`; już scope'owany do kolonii AKTYWNEJ |
| `prosperity:changed` | **NIE wycieka** — emit pod `KOSMOS.prosperitySystem === this` (tak samo `epoch:changed`, `consumer:shortage`) |
| — | **`trade:imported` WYCIEKA** — dostawy kurierów AI (2 emitentów bez filtra) |
| — | **`impact:colonyDamage` WYCIEKA** — uderzenie w kolonię AI |
| — | **`civ:epochChanged` WYCIEKA** — i to najgorzej: bez `planetId` i bez nazwy kolonii gracz czytał awans epoki AI **jako własny** |

🔴 **BRAMKA BEZ DANYCH JEST ŚLEPA — potwierdzone drugi raz.** `civ:popDied` ma **dziewięciu**
emitentów, a `planetId` niosło **dwóch**. Predykat przepuszcza nieotagowane (żeby nie wyciszyć
zdarzeń gracza), więc sama bramka zostawiłaby siedem tras otwartych. Dotagowane: `MissionSystem`
×3, `ImpactDamageSystem` (przez `_killPops`), `RandomEventSystem` ×2 (player-scoped, tag defensywny),
`CivilizationSystem` (`civ:epochChanged`). `ExpeditionSystem.js` **pominięty świadomie — to martwy
kod** (zero importów poza testami).

**Kanon własności.** Predykat powielał regułę (`!colony.ownerEmpireId`) i **rozjeżdżał się z kanonem**
`ColonyManager.isPlayerColony`, który dopuszcza także jawne `ownerEmpireId === 'player'`. Teraz
deleguje. Reguła wyprowadzona do `src/utils/JournalScope.js`, bo `UIManager` nie importuje się
headless (THREE/canvas) — keeper trzymał KOPIĘ predykatu i ta kopia zdążyła się zestarzeć.

**Legenda:** `player-scoped (BRAMKA)` = filtr właściciela w kodzie · `player-scoped (z konstrukcji)`
= emitent fizycznie nie odpala się dla AI (guard `isActive`, `getPlayerColonies`, wywołanie tylko
z UI gracza) · `global-by-design` = zdarzenie bez właściciela-kolonii (symulacja układu, dyplomacja,
stan aplikacji) albo świadomie pokazywane wg intelu.

#### player-scoped (BRAMKA) — 18

| linia | zdarzenie | podstawa |
|---|---|---|
| 765 | `fleet:buildStarted` | 831a3e7 |
| 770 | `fleet:shipCompleted` | 831a3e7 |
| 775 | `fleet:buildFailed` | 831a3e7 |
| 792 | `fleet:buildQueued` | 831a3e7 |
| 852 | `vessel:launched` | 831a3e7 — isEnemyVessel |
| 860 | `vessel:docked` | 831a3e7 — isEnemyVessel (2 subskrybentów) |
| 937 | `impact:colonyDamage` | uderzenie w kolonię AI; planetId już był w payloadzie |
| 977 | `civ:epochChanged` | epoka kolonii AI czytana jako epoka gracza; dodany planetId |
| 981 | `civ:unrest` | CivilizationSystem per-kolonia tyka też dla AI |
| 986 | `civ:unrestLifted` | j.w. |
| 991 | `civ:famine` | j.w. — objaw zgłoszony przez Filipa |
| 996 | `civ:famineLifted` | j.w. |
| 1002 | `civ:popBorn` | j.w. |
| 1018 | `civ:popDied` | j.w. + 9 emitentów, 7 nieotagowanych → dotagowane |
| 1080 | `colony:founded` | bramka INLINE (ownerEmpireId) — sprzed audytu |
| 1122 | `trade:migrationExecuted` | bramka INLINE (getColony(toId)) — sprzed audytu |
| 1155 | `vessel:docked` | 831a3e7 — isEnemyVessel (2 subskrybentów) |
| 1159 | `trade:imported` | kurierzy AI / routing AI↔AI (2 emitentów bez filtra) |

#### player-scoped (z konstrukcji) — 36

| linia | zdarzenie | podstawa |
|---|---|---|
| 753 | `expedition:redirectFailed` | j.w. |
| 779 | `fleet:disbandFailed` | j.w. |
| 783 | `fleet:disbanded` | j.w. |
| 799 | `fleet:created` | grupy flot tworzy gracz |
| 802 | `fleet:disbanded` | j.w. |
| 809 | `fleet:orderIssued` | rozkazy wydaje gracz |
| 832 | `fleet:orderCompleted` | j.w. |
| 836 | `fleet:orderCancelled` | j.w. |
| 841 | `fleet:retreatTriggered` | doktryna floty gracza |
| 1008 | `station:popArrived` | transport pasażerski gracza (MissionSystem) |
| 1011 | `station:popDeparted` | j.w. |
| 1015 | `vessel:awaitingHousing` | transport pasażerski gracza |
| 1025 | `expedition:reconProgress` | misje tworzy gracz; AI (EmpireLogisticsSystem) NIE używa MissionSystem |
| 1030 | `expedition:reconComplete` | j.w. |
| 1035 | `expedition:arrived` | j.w. |
| 1045 | `expedition:missionReport` | j.w. |
| 1049 | `expedition:disaster` | j.w. |
| 1052 | `expedition:launchFailed` | j.w. |
| 1062 | `vessel:strandedNoFuel` | j.w. |
| 1068 | `vessel:returnBlocked` | j.w. |
| 1073 | `outpost:orderQueued` | jedyny caller: FleetManagerOverlay (UI gracza) |
| 1110 | `colony:capturedByPlayer` | zdarzenie z definicji o graczu |
| 1116 | `colony:tradeExecuted` | trasy handlowe zakładane wyłącznie z UI gracza |
| 1119 | `colony:migration` | _checkMigration filtruje `!c.ownerEmpireId` |
| 1131 | `epoch:changed` | ten sam guard co wyżej |
| 1143 | `consumer:shortage` | ten sam guard co wyżej |
| 1173 | `tradeOrder:delivered` | Order Board jest panelem gracza |
| 1180 | `tradeOrder:cancelled` | j.w. |
| 1191 | `prosperity:changed` | emit pod `KOSMOS.prosperitySystem === this` (kolonia aktywna) |
| 1204 | `poi:alertTriggered` | POI należą do gracza |
| 1208 | `poi:rallyComplete` | j.w. |
| 1287 | `vessel:retreatIssued` | rozkaz gracza |
| 1315 | `vessel:autoRetreatFailed` | AutoRetreat pomija stronę gracza tylko przy rozkazach; wpis dotyczy statku gracza |
| 1322 | `vessel:autoRetreatLowFuel` | j.w. |
| 1331 | `vessel:driftIdle` | j.w. |
| 1337 | `vessel:driftAutoReturn` | j.w. |

#### global-by-design — 24

| linia | zdarzenie | podstawa |
|---|---|---|
| 866 | `game:saved` | stan aplikacji |
| 877 | `game:saveFailed` | stan aplikacji |
| 887 | `game:saveLargeWarning` | stan aplikacji |
| 920 | `body:collision` | symulacja układu |
| 932 | `planet:ejected` | symulacja układu |
| 953 | `accretion:newPlanet` | symulacja układu |
| 957 | `life:emerged` | symulacja układu |
| 960 | `life:evolved` | symulacja układu |
| 963 | `life:extinct` | symulacja układu |
| 967 | `time:autoSlowTriggered` | sterowanie czasem |
| 1230 | `empire:fleetMoved` | ruch flot AI pokazywany świadomie wg intelu (M4 P1) |
| 1246 | `empire:fleetMaterialized` | j.w. |
| 1256 | `vessel:proximityEnter` | wykrycie przez sensory GRACZA — to jest wywiad, nie wyciek |
| 1293 | `battle:resolved` | bitwa z udziałem gracza (CombatHUD/EventLog) |
| 1346 | `diplomacy:warDeclared` | dyplomacja dotyczy gracza z definicji |
| 1358 | `diplomacy:aiEnvoy` | j.w. |
| 1363 | `diplomacy:envoyArrived` | j.w. |
| 1364 | `diplomacy:envoyReturned` | j.w. |
| 1382 | `diplomacy:peaceSigned` | j.w. |
| 1396 | `diplomacy:peaceRejected` | j.w. |
| 1409 | `diplomacy:envoyRefused` | j.w. |
| 1414 | `war:autoPeaceRefused` | j.w. |
| 1419 | `diplomacy:treatyAccepted` | j.w. |
| 1420 | `diplomacy:treatyRejected` | j.w. |


**Adnotacja `directorOrigin` — semantyka RETRO (doprecyzowanie po spot-checku 2026-08-12).**
Spot-check pokazał `directorOrigin: BRAK` na `v_1`/`v_2` (emp_001, zbudowane PRZED naprawą) i pytanie,
czy retro-adnotacja działa dopiero przy zapisie/wczytaniu. **Nie działa wcale — i tak ma być.**
Odwrócenie resolvera odpala się WYŁĄCZNIE w `_claimVessel`, a to wisi na `vessel:created`, które
`VesselManager` emituje TYLKO w `createVessel` (`:181`) — `restore()` go NIE re-emituje. Do tego
`_claimVessel` ma wczesny powrót `if (vessel.ownerEmpireId) return;`, więc nawet re-emisja
ominęłaby statek już ostemplowany.

🔴 **ORZECZENIE (Filip, 2026-08-12): ŻADNEGO przemiatu retro dla `v_1`/`v_2` — to relikty testowe.**
Notatka o wykonalności zostaje jako WARUNKOWA: jednorazowy przemiat wraca na stół **tylko wtedy, gdy
liczenie eskalacji („ile fregat nacisku już stoi") zetknie się z okrętami sprzed naprawy** — dopóki
te liczniki widzą wyłącznie okręty zamówione po `831a3e7`, problemu nie ma.

⇒ Statek **zbudowany** przed naprawą nie dostanie adnotacji nigdy: ani na żywo, ani po `save/load`.
Zdanie z commita `831a3e7` mówiło o okrętach **ZAMÓWIONYCH** przed restartem (zlecenie `pending`,
które promuje się do `vessel:created` już po przeładowaniu) — te są adnotowane poprawnie i pilnuje
tego T6 keepera. To NIE jest defekt: dane (kadłub + moduły) wciąż są, więc jednorazowy przemiat
retro byłby wykonalny, ale to osobna decyzja zakresowa, nie naprawa. Praktycznie: liczniki „ile
fregat nacisku stoi" pomijają okręty sprzed naprawy — dotyczy to wyłącznie sesji debugowych z GATE 1.

⚠ **Granica dowodu.** Klasa `BRAMKA` jest sprawdzana wykonaniem i pinami keepera. Klasa
`z konstrukcji` opiera się na zbadaniu emitenta (guard / jedyny caller) — **nie** na przebiegu
w żywej grze; jeśli któryś system kiedyś zacznie tykać dla AI, wpis trzeba przeklasyfikować.
`global-by-design` to decyzja projektowa, nie pomiar.

---

1. **Gdzie jesteśmy:** szkielet Directora stoi samodzielnie — katalog reguł PUSTY, nic go jeszcze nie
   instancjonuje. Save **v100, zero migracji**, i to jest własność KONSTRUKCYJNA (wszystkie domyślne
   wartości puste), nie szczęśliwy zbieg okoliczności.
2. **S2 zaczyna od POMIARU, nie od kodu.** Zanim stała 5 LY (orzeczenie R-2) się utwardzi: zmierz
   pokrycie na prawdziwych 72 układach × kilka seedów — jaki ułamek galaktyki wpada w strefę graniczną
   ≥ jednego imperium, **na starcie partii i na rozwiniętym mid-game**. **Zbliża się do połowy
   galaktyki ⇒ STOP i przynieś tabelę** (przed Gate 3, nie po).
3. **Dwa ustalenia wiążące S4** (wprost z pomiaru S0): (a) **kolejność OD FUNDAMENTU W GÓRĘ** — stempel
   własności + trzy guardy (załoga, stocznia, komodyty) z fail-first PIERWSZE, zamówienia z szablonów
   dopiero NA NICH; (b) **komodyty = guard ze SPRZĘŻENIEM EKONOMICZNYM**, nie ślepe czekanie i nie
   twarde odcięcie — brakujące komodyty wchodzą w priorytety produkcji tej kolonii (fabryki się
   przezbrajają, potem stocznia dowozi, intel widzi OBIE fazy). Fallback, gdyby sprzężenie okazało się
   za drogie w S4: zlecenie czeka z **TTL ~3 lat wyświetlanych** + wpis w `DebugLog` przy wygaśnięciu —
   **nigdy wiecznie wisząca zjawa**. W commicie napisać, który wariant poszedł i dlaczego.
4. ~~**Stała: `ShipTemplateData.js` musi przyjąć katalog Filipa BEZ ZMIAN W KODZIE.**~~ **SPEŁNIONE
   w S3** — katalog v1 (trzy fregaty) wpisany, resolver + walidator pojemności stoją. Kolejny wpis
   nadal = wiersz w mapie i nic więcej.
5. **Nie relitygujemy podpisanych decyzji** (osiem + R-1 + R-2 + **R-3**). Sprzeczność z kodem → korekta
   w §Corrections, z pomiarem i podpisem — nigdy cicha zmiana.
6. **S4 ma teraz PREREKWIZYT poza tym planem:** `docs/plans/fix-stacje-3d-bramka-ukladu.md` (bramka
   `systemId` w `_addStationMesh`) musi wejść PRZED zasiewem stacji AI, inaczej każda nowa partia
   dostaje fantom przy gwieździe gracza. Szczegóły: §Audyt stacji AI, punkt 1.
**Arc:** WOJNA I POKÓJ 1.0 · **Workstream:** C (ReactionDirector) · **Parent:** `WOJNA_I_POKOJ_MASTER_PLAN.md` §C + `DIPLOMACY_BACKBONE.md` §5
**Zależy od:** D1 ✅ (relacje parowe) · D2 ✅ (Acceptance Engine, faza ZAMKNIĘTA 2026-08-10, save v100) · GALAXY_SEED ✅
**Basis:** audyt ośmiu szwów przeprowadzony na potrzeby tego planu (§Audit) + `docs/audit/COMBAT_DIPLO_AUDIT.md`
(2026-08-05 — **PRZEDAWNIONY w pięciu punktach**, patrz §Corrections)
**Cel zapisu:** **v100, zero migracji** — wykonalne, ale pod jednym twardym warunkiem (§Audit G).

⚠ **Ten dokument NIE jest `REACTION_DIRECTOR.md`.** Companion doc całego workstreamu C (Slice 1–3) wciąż nie
istnieje. Ten plan definiuje kontrakt reguł i szablonów na tyle, na ile potrzebuje go Slice 1, i **świadomie
nie rozstrzyga** rzeczy, które należą do Slice 2/3 (§Out of scope).

---

## Rulings — orzeczenia właścicielskie (Filip, 2026-08-10)

Dwa ustalenia podjęte przez właściciela projektu, **nadpisujące jego własne wcześniejsze specyfikacje**.
Zapisane tutaj, bo master plan i backbone nadal niosły stare brzmienie i bez tego wpisu ktoś odtworzyłby
sprzeczność z dokumentu źródłowego.

**R-1 — „ECONOMY EXECUTES" zastępuje „instant spawn" (master plan §C).**
Decyzja 6 przyjęta zgodnie z rekomendacją. Pierwotne orzeczenie o natychmiastowym spawnie było motywowane
**unikaniem budowy nowej maszynerii kolejkowej**; audyt pokazał, że maszyneria istnieje (`ColonyManager.startShipBuild`
→ `shipQueues` / `pendingShipOrders`), więc motywacja odpadła. Master plan §C zaktualizowany, sprzeczność
z §B.3 („scripts order, economy executes") usunięta, supersesja odnotowana.
⚠ **Uwaga z pomiaru S0:** podstawa dowodowa tej rekomendacji była CZĘŚCIOWO błędna — patrz §Wyniki
weryfikacji, V4. Mechanizm działa (zmierzone), ale **nie jest dziś przez nikogo wykonywany**. Orzeczenie
zostaje w mocy; zmienia się jego uzasadnienie i lista wymagań dla S4.

**R-2 — strefa graniczna = promień 5 LY (zastępuje „1 skok").**
Przestrzeń ROSZCZONA zachowuje istniejące promienie `TERRITORY.R_MIN_LY 1.5 → R_MAX_LY 4.0`;
strefa graniczna to **powłoka 5 LY** wokół terytorium AI. Język D3 do skorygowania zgodnie z §Kolizje.
🔴 **WARUNEK PRZED UTWARDZENIEM STAŁEJ:** zmierzyć pokrycie na prawdziwej galaktyce 72 układów, na kilku
seedach — jaki UŁAMEK układów wpada w strefę graniczną ≥ jednego imperium przy 5 LY, **na starcie partii
i na rozwiniętym zapisie mid-game**. Jeśli zbliża się do połowy galaktyki → zgłosić do strojenia
**PRZED Gate 3**, z tabelą pomiarową. Pomiar należy do S2 (mapa wpływów).

**R-4 — drabinka technologiczna katalogu ZOSTAJE bez zmian (2026-08-11).** Orzeczenie po pomiarze
z S4: `point_defense` był bramką **BEZ TRASY** (klasa R12 — AI nie miało jak go zdobyć), dlatego
wszedł do `startingTechs`. `ion_drives` i `warp_drive` **mają trasę** — siedzą w kolejce badań obu
archetypów — więc **nie dostają tego samego traktowania**. Katalog zostaje, drabinka zostaje.

| moduł | wymaga | industrialist | expansionist |
|---|---|---|---|
| `armor_heavy` · `weapon_missile` · `weapon_laser` | `point_defense` | **START** | **START** |
| `engine_warp` (napęd wszystkich trzech fregat) | `ion_drives` | kolejka 6/9 | kolejka 1/10 |
| `warp_tank` (tylko FRG-1/FRG-2) | `warp_drive` | kolejka 9/9 | kolejka 9/10 |

Wynikająca z tego progresja jest **darmowym uzasadnieniem technologicznym eskalacji**:
incydent bez odpowiedzi → `ion_drives` → **FRG-3** (obrona układu, bez skoku) = **L1** →
`warp_drive` → **FRG-1/FRG-2** (eskorty zdolne do skoku) = **L2 „możemy przyjść do was"**.

🔴 **ŚWIADOMA KONSEKWENCJA DO PRZYJĘCIA:** w oknie przed `ion_drives` nacisk militarny produkuje
**incydent BEZ odpowiedzi zbrojnej**. Jest to uczciwe technologicznie (AI naprawdę nie ma czym
odpowiedzieć) i **nie jest ciche** — `director:shipRejected` z powodem `no_module` mówi wprost,
czego zabrakło. **Do przeglądu przy Gate 3** (tam nacisk jest oceniany jako łańcuch).
📌 **Kandydat Slice 2, NIE zmiana teraz:** szczebel **L0 — odpowiedź czysto dyplomatyczna**
(czasownik „protest") na to okno. Wymaga czasowników D4 i naprawy kanału (§Kolizje), więc
z definicji nie mieści się w Slice 1.

**Odrzucone:** drabinka zapasowa slotu napędu (`['engine_warp','engine_ion','engine_chemical']`).
Pomogłaby FRG-3, ale **odebrałaby rolę FRG-1/FRG-2** — bez silnika warp `warp_tank` jest
bezużyteczny, więc „eskorta zdolna do skoku" przestałaby nią być.
📌 **Notatka katalogowa dla autora:** `engine_warp` w **FRG-3** to 30 ton martwego balastu
(ta fregata z założenia nie skacze). Naturalny przyszły szczebel katalogu: **„silnik układowy"** —
tani, lekki napęd bez zdolności warp. To rozszerzenie danych, nie kodu.

**🔴 KOREKTA R-2 PO GATE 1 (2026-08-11) — HORYZONT POMIARU BYŁ ZA KRÓTKI.** Gate ujawnił, że
w roku **~38 wyświetlanym** imperium AI **założyło nową kolonię** (`bootstrapColony`,
`Cursa l` @ `sys_015`). Mój pomiar S2 biegł **400 lat CYWILIZACYJNYCH ≈ 33 lata wyświetlane**,
czyli **urwał się tuż przed** progiem ekspansji. Diagnoza „martwa ekspansja AI" była więc
prawdziwa co do OBSERWACJI, ale jej brzmienie było za mocne:

| brzmienie | status |
|---|---|
| ~~„AI nie zakłada kolonii"~~ | **OBALONE** — zakłada, tylko później niż mierzyłem |
| „AI nie zakłada kolonii **przez pierwsze ~400 lat cyw. (~33 wyśw.)**" | ✅ stoi (3 potwierdzenia: S0/V4, BALANS Phase 2, S2) |

**Co to zmienia dla stałej 5 LY:** projekcja z tabeli 4 sondy **przestaje być hipotetyczna** —
`k > 1` jest osiągalne w normalnej partii, a przy **k = 6 pokrycie sięga 46 %**, przy **k = 8
przekracza połowę galaktyki**. Zwężenie warunku („zmierzone na dzisiejszej ekonomii AI") **zostaje
w mocy, ale jego termin ważności właśnie się skrócił**: pomiar trzeba powtórzyć **na horyzoncie
obejmującym ekspansję** (≥ 60 lat wyświetlanych), a nie dopiero „gdy WAR_BACKBONE odblokuje AI".
**🔴 TRZECIA KOREKTA (przebieg 3 gate'u, PASS) — OUTPOSTY SĄ LICZNE, NIE POJEDYNCZE.**
Zmierzone w jednym przebiegu, na obu imperiach: outposty w latach **CYWILIZACYJNYCH
85 / 140 / 155 / 160 / 185**. To już nie jest „jeden wyjątek późno" — to **regularny, gęsty
harmonogram zaczynający się ~7 lat wyświetlanych**, podczas gdy pełne kolonie pozostają rzadkie.
Ponieważ `TerritoryService` liczy outposty do stref (`R_MIN_LY 1.5`), **pokrycie rośnie od
wczesnej gry**, a pomiar S2 (17,7 % na 400 civY, zero outpostów) jest tym bardziej
niereprezentatywny — najpewniej trafił w seedy/przebieg bez ekspansji.
📌 Ponowny pomiar `BORDER_LY` **musi** liczyć outposty osobno od kolonii i biec ≥ 60 lat
wyświetlanych na kilku seedach.

**🔴 DRUGA KOREKTA (przebieg 2 gate'u) — OUTPOSTY MAJĄ WŁASNY, DUŻO WCZEŚNIEJSZY HARMONOGRAM.**
Filip zaobserwował `bootstrapAutonomousOutpost` (`entity_144`) już w **85. roku CYWILIZACYJNYM**
— czyli ~7 lat wyświetlanych, **pięciokrotnie wcześniej** niż pełna kolonia z przebiegu 1 (~456
civY). Ekspansja AI nie jest więc jednym zjawiskiem z jednym progiem: **outposty i pełne kolonie
biegną osobno**, a mój pomiar S2 (400 civY) mieścił w sobie okno outpostów i mimo to naliczył
ZERO. Dwa wnioski: (a) brzmienie „AI nie zakłada ani jednego outpostu" z S0/V4 jest **słabsze,
niż wyglądało** — to zależy od seeda i przebiegu, nie jest własnością silnika; (b) `TerritoryService`
liczy outposty do stref (`R_MIN_LY 1.5`), więc pokrycie może rosnąć **od ~7 roku wyświetlanego**,
a nie dopiero po pierwszej pełnej kolonii.
📌 **Zadanie dla WAR_BACKBONE/BALANS:** ustalić OSOBNO harmonogram outpostów i pełnych kolonii
(po ilu latach, jak często, od czego zależy) — dopiero wtedy `BORDER_LY` da się utwardzić na
dobre. Ponowny pomiar musi objąć OBA zjawiska, więc horyzont ≥ 60 lat wyświetlanych i kilka
seedów; sonda `probe-border-zone-coverage.mjs` już to potrafi, brakuje jej tylko dłuższego biegu.

**⚠ WYNIK POMIARU R-2 (2026-08-11) — warunek SPEŁNIONY dla dzisiejszej gry, ale połowa warunku
okazała się NIEMIERZALNA.** Instrument: `src/testing/headless/probe-border-zone-coverage.mjs`
(4 seedy × 72 układy, `TerritoryService` + prawdziwe promienie `TERRITORY.R_*`).

| co | wynik |
|---|---|
| **ZMIERZONE dziś** (5 LY, odczyt A, 3D, średnia 4 seedów) | **17,7 %** galaktyki w strefie granicznej (rozrzut 11,1–30,6 %) |
| próg STOP z orzeczenia („zbliża się do połowy") | **nieosiągnięty** — margines 17,7 % wobec 50 % |
| krzywa strojenia | 2 LY → 8,3 % · 4 → 14,9 % · **5 → 17,7 %** · 8 → 29,9 % · 10 → 40,3 % |
| rzut 2D (jak `TerritoryField`) vs 3D (jak `warpDist3D`) | 2D **zawyża o 1,4–5,6 pkt proc.** |
| **PROJEKCJA** przy ekspansji AI (k układów/imperium) | k=2 → 25,0 % · k=3 → 31,9 % · k=4 → 35,8 % · k=6 → 46,2 % · **k=8 → 58,7 %** |

🔴 **Połowa warunku była niemierzalna i to jest osobne znalezisko.** Orzeczenie żądało pomiaru
„na starcie partii **i na rozwiniętym mid-game**". Mid-game nie istnieje jako drugi punkt pomiarowy,
z dwóch niezależnych, zmierzonych powodów: **(a)** fora startowa AI (24 POPy + 18 budynków) daje
`devScore ≈ 42` przy `DEV_FULL = 20`, więc promień roszczony jest **nasycony na `R_MAX` od sekundy
zero** — rozwój nie ma go już czym poszerzyć; **(b)** w 400 latach cyw. × 4 seedy AI **nie zajęło ani
jednego nowego układu** (zero `bootstrapColony`/`bootstrapOutpost`; zamawia droidy „pod outpost"
i staje). Pokrycie w 400. roku jest **co do bitu** równe pokryciu w roku zerowym.
To ta sama martwa ekspansja, którą zmierzył **S0/V4** i BALANS Phase 2 — należy do **WAR_BACKBONE/
BALANS**, nie do Directora.

**Zwężenie warunku DO PODPISU** (wzór D2/E6: podpisaną własność zwęża się do czegoś, co wciąż
dowodzi tezy, i podpisuje się zwężenie): *„zmierzone na ekonomii AI, którą się dziś uruchamia,
+ projekcja obwiedni po `k`"* zamiast *„start i mid-game"*. Teza oryginalna — „5 LY nie zabiera
połowy galaktyki" — zostaje dowiedziona; **z zastrzeżeniem, że projekcja przebija 50 % przy k = 8
i jest przy 46,2 % już przy k = 6**, więc odblokowanie ekspansji AI w WAR_BACKBONE **wymusza
ponowny pomiar**. To nie jest stała „na zawsze", tylko stała na dzisiejsze AI.

**Dwie decyzje geometryczne, których orzeczenie nie rozstrzygało** (ujawnione pomiarem, patrz
§Decisions taken 9–10): odczyt **A** (`outer = r_roszczony + 5`) vs **B** (`outer = max(r, 5)`)
oraz metryka **3D** vs rzut **2D**.

**R-3 — produkcja okrętów wojennych AI WYMAGA stacji orbitalnej nad planetą macierzystą imperium
(2026-08-11).** Nowe wymaganie właścicielskie, wchodzi do zakresu **S4**. Stacja jest **ŻETONEM
uprawnienia**, nie fabryką: okręty dalej powstają w stoczni naziemnej AI przez `startShipBuild`, a
stacja jest warunkiem, bez którego Director nie wystawi zamówienia. To brzmienie wprost z intencji
właściciela („stacja staje się widocznym w intelu znacznikiem potencjału militarnego, a WAR_BACKBONE
może później sprawić, że jej zniszczenie wyłącza produkcję") — żeton daje się zniszczyć, fabryka
wymagałaby przeniesienia całej produkcji.
Sposób powstania stacji: **ZASIEW przy generacji imperium**, tym samym mechanizmem co istniejąca fora
startowa (POPy + darmowe budynki + darmowe techy). **Świadomie NIE budujemy maszynerii „AI stawia
stacje"** — audyt niżej pokazuje, ile by to kosztowało.
Zakres audytu, wynik i trzy rzeczy, które to wymaganie wnosi do S4 — §Audyt stacji AI.

---

## Wyniki GATE 1 — przebieg 1 (FAIL) i naprawa

**Objaw:** dwa `hull_frigate` z `owner`/`ownerEmpireId`/`isEnemy`/`directorOrigin` = `undefined`,
widoczne **we flocie GRACZA**. Powód, dla którego objaw jest właśnie taki:
`isEnemyVessel` (`Vessel.js:385-391`) to trzy testy PRAWDZIWOŚCIOWE (`if (v.owner && …)`), więc
**brak pól = statek gracza**. Bezpański okręt AI nie jest „niczyj" — jest NASZ.

**Root-cause (zreprodukowany wykonaniem, nie wywnioskowany):** stempel wyprowadzał WŁASNOŚĆ
z rejestru oczekiwań kluczowanego po kolonii i otwieranego w chwili zamówienia. Trzy niezależne
dziury, każda wystarczająca sama:

| # | dziura | przebieg |
|---|---|---|
| 1 | **nadpisanie** — jeden slot na kolonię, zamówienie na N okrętów | drugie `expectVessel` kasowało pierwsze |
| 2 | **kasowanie sąsiada** — odmowa N-tego builda robiła `delete` okna | `count:2` + stocznia lv1 → drugi build odrzucony → okno zniknęło, zanim pierwszy okręt powstał |
| 3 | **brak okna na ścieżce pending→queue** | `_tickPendingShipOrders` promuje zlecenie SAM; okręt czekający na surowce był bezpański Z KONSTRUKCJI |

(+ rejestr nie był serializowany, więc zapis/wczytanie gubiło go bezpowrotnie.)
Dziura **2** to dokładnie przebieg z gate'u; dziura **3** wyprodukowała drugi okręt.

**Naprawa — własność STRUKTURALNA.** Wyprowadzamy ją z KOLONII-BUDOWNICZEGO
(`vessel.colonyId` → `colonyManager.getColony` → `ownerEmpireId`). Nie ma okna, czasu życia ani
stanu do zgubienia; działa dla kolonii założonych PÓŹNIEJ i po round-tripie zapisu. Rejestr
zostaje wyłącznie jako **adnotacja szablonu** i jego brak nigdy nie wpływa na własność.
Zakres jest szerszy niż zamówienia Directora — **i to jest poprawne**: okręt zbudowany przez
kolonię imperium należy do tego imperium. Stan zastany był defektem, nie funkcją.

⚠ **Dwie asercje keepera ZMIENIŁY KONTRAKT**, bo kodowały błąd: „okno jednorazowe ⇒ drugi statek
bez stempla" i „bez okna brak właściciela". Obie opisywały to, co gate wywrócił.

**Odpowiedzi na anomalie ze zgłoszenia:** (a) okręty stoją przy kolonii-budowniczym — w repro
`colonyId` = stolica, zgodnie; (b) **kolonizacja AI w roku ~38 jest realna i obala zbyt mocne
brzmienie diagnozy — patrz KOREKTA R-2 wyżej**; (c) `v_1`/`v_2` to licznik per-partia
(`getNextVesselId`), a nie recykling — w repro pierwszy okręt AI dostał `v_1` w świeżej grze,
w której gracz nie zbudował żadnego statku; (d) tak — stempel keyed-at-order-time był dziurą,
i dlatego został zastąpiony strukturalnym.

---

## Audyt stacji AI (read-only, 2026-08-11, pod R-3)

**Metoda:** sześć równoległych przebiegów po `src/` + **adwersaryjna weryfikacja każdego twierdzenia
nośnego** (obalaj, nie potwierdzaj) — czyli przebieg, którego zabrakło audytowi ośmiu szwów (§Audit,
„limit budżetu ubił 8 z 9 agentów"). Twierdzenia poniżej z cytatem `plik:linia`; cztery kluczowe
przeczytałem powtórnie sam.

**Premisa Filipa POTWIERDZONA: dziś żadne imperium AI nie ma stacji i nie ma jak jej zdobyć.**
Jedyny produkcyjny materializator (`ColonyManager._tickPendingStationOrders`) opróżnia kolejkę, do
której pisze **wyłącznie** zakładka „stacja" gracza, bramkowana `isPlayerColony`
(`ColonyOverlay.js:1459-1460`). `grep -rni station` po `EmpireGenerator` / `EmpireColonyBootstrap` /
`EmpireStrategySystem` / `EmpireRegistry` / `EmpireData` / `EmpireArchetype*` zwraca wyłącznie
budynek heksowy `research_station`. Pozostałe dwa miejsca tworzące encję to helpery debugowe.

**Zapis: BEZ migracji.** `Station.ownerEmpireId` istnieje od pierwszego commitu stacji
(`Station.js:26`, default `'player'`) i jest serializowane od v84 (`StationSystem.js:113`). v100 stoi.

### Dwa produkty pod jednym zdaniem — i to one decydują o rozmiarze

| wariant | rozmiar |
|---|---|
| **Stacja jako ŻETON** (zasiana, posiadana, bezczynna; okręty z naziemnej stoczni, ale tylko gdy imperium ma stację) | **MAŁY, OGRANICZONY — robimy** |
| **AI faktycznie BUDUJE okręty NA stacji** | **WIĘKSZY NIŻ OGRANICZONY — nie robimy** |

R-3 wybiera żeton. Wariant drugi wymaga czterech nowych maszynerii i **wyciekłby do gracza**:
`StationSystem._resolveHomeColony` (`:486`) kieruje badania stacji do kolonii **gracza**; okręt
zbudowany na stacji dostaje `colonyId` gracza i ląduje w **jego** flocie (`:512`, `:521`);
`TransferStore.js:68` odmawia łącza matczynego każdej stacji nie-gracza, więc depot AI to zapieczętowana
pusta `Map`, której nic w grze nie napełnia; bramki techu stacji czytają `window.KOSMOS.techSystem`,
czyli drzewo **człowieka** (`:240`, `:348`).
⚠ Te dwa wycieki są **śmiertelne, ale dziś UŚPIONE**: `createStarterModules()` daje wyłącznie habitat
+ power_atom, więc nie ma ani laboratorium, ani stoczni, przez które mogłyby przeciec. Odpalą w chwili,
gdy zasiew doda funkcjonalny moduł. **Zasiew NIE dodaje modułów.**

### Trzy rzeczy, które R-3 wnosi do S4 (żadnej nie było w planie)

1. 🔴 **PREREKWIZYT: bramka układu dla meshu stacji.** `_addStationMesh` nie ma filtra `systemId`
   (`ThreeRenderer.js:4012-4013`), więc stacja zasiana w układzie AI dostaje **prawdziwy mesh w origin
   sceny — czyli przy gwieździe GRACZA**: niewidoczny, ale wygrywający raycast, z nazwą w kolorze
   stacji gracza pod CTRL i jednym pobraniem ~16 MB GLB na imperium. Odpala na **nowej grze** i przy
   każdym wczytaniu. Naprawa jest już **zatwierdzona i rozpisana co do linii**
   (`docs/plans/fix-stacje-3d-bramka-ukladu.md`) i **w 100% NIEWYKONANA** (`StationRenderLogic.js` nie
   istnieje, 0 odwołań do `isStationInActiveSystem`). **Musi wejść PRZED zasiewem**, inaczej regresja
   dotyka każdej nowej partii.
2. 🔴 **`point_defense` — bez tego łańcuch nacisku nie dowozi ANI JEDNEGO okrętu.** Techu nie ma ani
   w `startingTechs`, ani w `researchQueue` żadnego archetypu (grep po `src/data/EmpireArchetype*.js`,
   `EmpireData.js`, `src/systems/Empire*.js` → **0 trafień**), a `EmpireResearchSystem` nie potrafi
   przyznać techu spoza kolejki. Wymagają go **wszystkie trzy kadłuby wojenne ORAZ każdy moduł broni
   w grze**. Bramka techu jest per-imperium naprawdę (`ColonyManager.js:846` —
   `colony.techSystem ?? this.techSystem`, kolonie AI mają własny), więc fallback na drzewo gracza nas
   NIE uratuje. **Decyzja balansowa właściciela, nie usterka.**
3. **Mechanizm bramki: predykat po stronie Directora, NIE odwrócenie zwolnienia AI.** Wariant
   „skasuj `ColonyManager.isPlayerColony(colony) &&` w `:857`" odrzucony z trzech powodów:
   (a) odwraca dwa **zacommitowane piny**, które dokumentują decyzję S3.4d
   (`s34d_hull_gating_smoke.mjs:91`, `director_seams_smoke.mjs:136-137`); (b) `fleet:buildFailed` ma
   subskrybenta bez filtra właściciela (`UIManager.js:765-766`), więc każda odmowa dla AI wyskoczyłaby
   w powiadomieniach **gracza**; (c) to bramka **bez trasy** — nie istnieje ścieżka AI do
   `queueStationShip`, więc zamieniłaby „AI potrzebuje stacji" w „AI nigdy nie zbuduje okrętu".
   Zamiast tego: `empireHasOrbitalStation(empireId)` w rejestrze `DirectorGuards` (S4). Zero wspólnych
   plików, zero odwróconych pinów, `EmpireFleetMaterializer` i spawnery testowe nietknięte.

### Miejsce zasiewu (ustalone, do wykonania w S4)

`EmpireColonyBootstrap.bootstrapHomeColony`, zaraz po `empireRegistry.addColony(...)` (`:191`) —
`homePlanet`, `colony`, `empireId` są w zasięgu, `StationSystem` jest już opublikowany
(`GameScene.js:391`), a generacja imperiów leci wyłącznie przy nowej grze (`GameScene.js:1652`).
`ownerEmpireId` **MUSI być podane jawnie** — default to `'player'`, a wtedy odwracają się WSZYSTKIE
filtry własności naraz (EconomyOverlay, Outliner, plakietki mapy, cele transportu, SystemPool, proxy
depotu). Świadomie **nie** przez `ColonyManager.addPendingStationOrder`: jego bramka techu jest
fail-closed wobec drzewa **gracza** (`:1773-1774`).

**Do backlogu (NIE budujemy tutaj):** cykl życia stacji AI (nic jej nie niszczy przy śmierci imperium
ani podboju — jedyny caller `destroyStation` to debug), stacja jako znacznik potencjału w intelu,
„zniszczenie stacji wyłącza produkcję" (WAR_BACKBONE), rzutowanie terytorium przez stacje AI
(`TerritoryService.js:98` świadomie je pomija).

---

## Context

Master plan zamyka D2 zdaniem: „AI potrafi powiedzieć nie i powiedzieć dlaczego". Czego AI nadal **nie potrafi**,
to zrobić cokolwiek **z własnej inicjatywy, w odpowiedzi na to, co robi gracz**. Audyt R1 nazwał to wprost:
warstwa militarna AI jest bezwładna (`EconAI`/`MilitaryAI` czytają pola skasowane przez refaktor Slice 1),
`MilitaryAI.attack_player` i `build_fleet` punktują 0 przy każdym wejściu, jakie gra potrafi wytworzyć.

Director to warstwa **dramaturgii** nad systemową AI: deklaratywne reguły `trigger → guard → delay → response`,
parametryzowane osobowością, z cooldownami i eskalacją. Slice 1 stawia szkielet i dowozi **dwa łańcuchy**, które
razem sprawdzają obie połowy kontraktu — jeden reaktywny na PROGRES gracza (pierwszy kontakt), drugi na jego
OBECNOŚĆ WOJSKOWĄ (nacisk L1–L2) — plus dwa fundamenty, które i tak muszą powstać: mapę wpływów (współdzielona
z D3) i produkcję statków AI z szablonów (minimalna wersja B.3).

**Najważniejszy wynik audytu, w jednym zdaniu:** produkcja statków AI **NIE jest nową maszynerią** —
`EmpireLogisticsSystem` buduje kurierów przez `ColonyManager.startShipBuild` od Slice 2 S3, z doborem modułów
zależnym od techu i fallbackiem, więc B.3 to **uogólnienie działającego mechanizmu**, a nie budowa od zera.
Drugi co do wagi: **„1 skok" nie ma w tym kodzie definicji** — sąsiedztwo układów liczy się z baku warp
KONKRETNEGO statku, więc strefa graniczna musi być promieniem w latach świetlnych (§Corrections K-2).

---

## Audit — stan ośmiu szwów (read-only, 2026-08-10)

> **⚠ Ograniczenie metody.** Audyt miał iść dwuprzebiegowo (znalezienie → adwersaryjna weryfikacja
> osiągalności). Przebieg adwersaryjny **nie odbył się dla żadnego obszaru** (limit budżetu konta ubił 8 z 9
> agentów). Obszar **G** pochodzi z pełnego przebiegu agenta; obszary **A–F, H** przeszedłem sam,
> jednoprzebiegowo. Twierdzenia oznaczone **[✔ZWERYFIKOWANE]** przeczytałem powtórnie wprost w kodzie.
> **Commit S0 zamyka tę lukę WYKONANIEM dla twierdzeń nośnych** — wyniki niżej.

### Wyniki weryfikacji (commit S0, pomiar wykonaniem na żywym boocie)

**Instrument:** `src/testing/headless/probe-director-seams.mjs` (pomiar jednorazowy, READ-ONLY) +
keeper `src/testing/smoke/director_seams_smoke.mjs` (16 asercji, w sweepie).
Reprodukcja: `node src/testing/headless/probe-director-seams.mjs`.

| # | twierdzenie | wynik |
|---|---|---|
| **V1a** | każdy krok `_tickAll` przechodzi po **WSZYSTKICH** imperiach (nie round-robin) | ✅ **POTWIERDZONE** — 2/2 imperia w każdym z 24 kroków. Korekta **K-5** stoi. Koszt reguł = `reguły × imperia` na krok |
| **V1b** | kadencja 1 krok = 1 rok cywilizacyjny | ✅ **POTWIERDZONE** — 24 kroki / 24 civY |
| **V1c** | `MAX_STEPS_PER_TICK = 8` klamruje pojedynczy tick | ✅ **POTWIERDZONE** — tick 100 civY dał 8 kroków |
| **V2a** | `planet:constructionComplete` z `BuildingSystem` niesie `buildingId` | ✅ **POTWIERDZONE** wykonaniem — klucze `buildingId, isUpgrade, planetId, tileKey` |
| **V2b** | drugi emitent niesie **wyłącznie** `{planetId}` | ✅ **POTWIERDZONE (źródło)** — `MissionSystem.js:1786`; pułapka realna |
| **V2c** | wyzwalacz bramkowany `buildingId === X` przeżywa OBU emitentów | ✅ **POTWIERDZONE** — nie rzuca, nie odpala się fałszywie |
| **V3a** | niedobór surowców ⇒ zlecenie **czeka** w `pendingShipOrders` | ✅ **POTWIERDZONE** — `{ok:true, queued:true}` |
| **V3b** | kadłub **WOJENNY** przyjęty na kolonii AI, **kolejka widoczna** | ✅ **POTWIERDZONE** — `{ok:true}`, `shipQueues` 0→1 |
| **V3c** | okręt zbudowany przez kolonię AI **nie ma właściciela** | ✅ **POTWIERDZONE (luka realna)** — `v_1/hull_frigate` z `ownerEmpireId=undefined`. **S4 MUSI dołożyć własny stempel** |
| **V3z** | wolne POPy na załogę | ⚠ **OSTRZEŻENIE** — **1 z 2 kolonii AI ma `freePops = 0` przez 400 civY** (pop rośnie 28→47, wszystko zatrudnione). Bramka załogi jest TWARDA (odmowa, nie kolejka) |
| **V3y** | kolonia AI stać na okręt | ⚠ **OSTRZEŻENIE** — brakuje `Fe, Ti, Cu, reactive_armor, electronic_systems, propulsion_systems`. Bootstrap AI **nie zawiera** trzech komodytów z listy kosztów fregaty |
| **V4** | istniejący konsument `startShipBuild` po stronie AI **odpala w praktyce** | 🔴 **ZŁAMANE** — patrz niżej |

#### 🔴 V4 — twierdzenie, które padło (i co z niego wynika)

Plan cytował `EmpireLogisticsSystem.js:209` jako dowód, że *„AI już buduje statki tą ścieżką"*.
Pomiar: **400 lat cyw. (≈33 lata wyświetlane = pełna partia) × 4 seedy** ⇒

| seed | kolonie AI | outposty AI | `logistics:shipBuildRequested` | statków w grze |
|---|---|---|---|---|
| −2102099243 | 2 | **0** | **0** | **0** |
| 12345 | 10 | **0** | **0** | **0** |
| 777777 | 3 | **0** | **0** | **0** |
| −55555 | 2 | **0** | **0** | **0** |

**Przyczyna:** trasy kurierskie powstają **wyłącznie pod OUTPOSTY** (`route.outpostId`), a AI ekspanduje
przez **pełne kolonie** i w żadnym z czterech seedów nie założyło ani jednego outpostu. Ścieżka jest
**prawdziwa co do kodu i niewykonywana w praktyce** — dokładnie klasa **R1** z audytu, tym razem trafiona
we własną rekomendację planu.

**Co to zmienia, a czego nie:**
- ✅ **Decyzja 6 / orzeczenie R-1 zostaje w mocy.** Mechanizm jest sprawny — S0 udowodnił go **wprost**:
  kolonia AI przyjęła kadłub wojenny, kolejka była widoczna, fregata faktycznie powstała (V3a/V3b/V3c).
- ❌ **Znika argument „to jest przetestowane w boju".** Director będzie **pierwszym konsumentem tej ścieżki,
  który realnie odpala** — i musi być pisany jak pierwszy konsument, nie jak drugi.
- ➕ **Trzy twarde wymagania dla S4** (żadnego nie było w pierwotnym planie):
  1. **własny stempel własności** na `vessel:created` — kluczowany inaczej niż `logi.pendingBuildRoute`
     i **bez** filtra `shipId === 'hull_small'` (V3c);
  2. **guard załogowy** `empireHasFreeCrew` — `startShipBuild` odmawia TWARDO, a połowa kolonii AI stoi
     na `freePops = 0` (V3z);
  3. **guard komodytowy albo świadoma akceptacja czekania** — fregata potrzebuje czterech komodytów,
     których bootstrap AI nie ma; bez tego zlecenie osiądzie w `pendingShipOrders` na czas nieokreślony
     i „nacisk militarny" nie dowiezie ani jednego okrętu (V3y).
- 📌 **Do backlogu (nie do tego slice'u):** martwa w praktyce produkcja kurierów AI (outposty nie powstają)
  — to jest osobna diagnoza ekonomii AI, należy do WAR_BACKBONE/BALANS, nie do Directora.

**Fail-first udowodniony wykonaniem** dla dwóch pinów nośnych: symulacja round-robina wywraca pin V1a;
objęcie kolonii AI bramką kadłubową S3.4d wywraca pin V3b (`„Wymaga stoczni orbitalnej"`).

### A. Źródła wyzwalaczy + gospodarz ticku

| Fakt | Dowód | Status |
|---|---|---|
| „Obserwatorium L5" = **odczyt, nie zdarzenie**: `getMaxObservatoryLevel()` bierze max `entry.level` budynku `observatory` po koloniach z odfiltrowanym `ownerEmpireId` (czyli tylko gracza) | `ObservatorySystem.js:117-132` | LIVE |
| `observatory` ma `maxLevel: 6`, `requires: 'orbital_survey'` — **L5 jest osiągalne i nie jest szczytem** | `BuildingsData.js:575-598` | LIVE |
| Zdarzenie kamienia milowego budynku ISTNIEJE: `planet:constructionComplete { tileKey, buildingId, isUpgrade, planetId }`, z realnymi subskrybentami; `AutoPauseSystem:86` już bramkuje po `buildingId` — **gotowy precedens wyzwalacza budowlanego** | `BuildingSystem.js:14`, `AutoPauseSystem.js:86`, `ColonyManager.js:168` | LIVE |
| ⚠ **Pułapka:** `MissionSystem.js:1786` emituje to samo zdarzenie z payloadem **wyłącznie `{planetId}`** — subskrybent zakładający obecność `buildingId` dostanie `undefined` | `MissionSystem.js:1786` | LIVE |
| „Uzbrojony statek wszedł do układu" = `vessel:arrived { vessel, mission }`; **szew już zajęty i działający** przez `DiplomacySystem._onVesselArrived` i `IntelSystem` | `DiplomacySystem.js:147, 602`, `IntelSystem.js:55` | LIVE |
| **Zdarzenia WYJŚCIA nie ma** — `grep 'vessel:departed\|vessel:left'` pusty | grep po `src/` | MISSING |
| „Czyja to przestrzeń" liczy się dziś **binarnie po jednym układzie**: `galaxyData.systems.find(s => s.id === sysId)?.empireId` | `DiplomacySystem.js:637` (`_resolveArrivalEmpire`) | LIVE |
| Wzorzec „czy wciąż zalega": transientna `Map` uzgadniana co tick z żywym stanem statku (`systemId` + `position.state === 'orbiting'`), wpis kasowany gdy warunek znika | `DiplomacySystem.js:98-99, 641-663` | LIVE |
| **Gospodarz ticku:** `AlienCivSystem` akumuluje `civDeltaYears`, `MAX_STEPS_PER_TICK = 8`, po czym `_tickAll(1)` na krok; **każdy krok przechodzi po WSZYSTKICH imperiach** (`reg.listAll()`) | `AlienCivSystem.js:54-66, 94-110` | LIVE |
| Precedensy odroczonej odpowiedzi: `RandomEventSystem._warningQueue` **jest serializowany** (oczekujące skutki to w tym repo stan warty zapisu), `ScheduledEventSystem` (`_firedOnce` Set + `_nextTrigger`, side-channel), `ColonyManager._tickPending*Orders` | `RandomEventSystem.js:43, 102, 127`; `ScheduledEventSystem.js:20-23, 130-153`; `ColonyManager.js:145-147` | LIVE |

**Wniosek A.** Oba wyzwalacze mają gotowe źródła zdarzeń — **nic nie trzeba pollować**. Reaktywność i tak nie
wymaga szybszego haka niż roczny: nacisk militarny to nie sytuacja, w której sekunda robi różnicę, a odroczenie
(`delay`) jest w tym projekcie **cechą reguły**, nie ograniczeniem. Rekomendacja: **zdarzenia zbierają fakty
natychmiast, Director ocenia je w `_tickAll`** (decyzja 1).

### B. Mapa wpływów — wejścia

| Fakt | Dowód | Status |
|---|---|---|
| 🔴 **Grafu skoków NIE MA.** `planWarpRoute` buduje krawędzie w locie: `warpDist3D(a,b) ≤ maxHopLY`, gdzie `maxHopLY = warpFuel.max / warpFuel.consumption` — **własność STATKU, nie galaktyki** | `WarpRoutePlanner.js:1-13, 33-38` | MISSING |
| Układów jest **72**, pozycje 3D w latach świetlnych (`x/y/z`, `distanceLY`) | `GalaxyGenerator.js:17, 186-197` | LIVE |
| Promienie wpływu **w LY już istnieją** i są strojone: `R_MIN_LY 1.5` (outpost) → `R_MAX_LY 4.0` (rozwinięta kolonia), `R_STATION_LY 1.0`, skala przez `DEV_FULL 20` | `GameConfig.js:313-332` | LIVE |
| Własność układów, źródło **(a)**: `TerritoryService._index` = `Map<systemId,{owner,kind,devScore,colonyIds}>` — **obejmuje gracza I AI**, invalidacja 11 zdarzeniami, leniwa przebudowa, **runtime-only (zero serializacji)** | `TerritoryService.js:22-45, 67-104` | LIVE |
| Własność układów, źródło **(b)**: `galaxyData.systems[].empireId` — **wyłącznie AI** (`syncToGalaxyData` czyści wszystko i stempluje tylko imperia), i to **jego czyta dyplomacja** | `EmpireRegistry.js:268-289`, `DiplomacySystem.js:637` | LIVE |
| `bordersOpen` leży na rekordzie pary od D1 i **nie ma czytelnika** (świadomie — konsument to D3) | `RelationsModel.js:87-89`; D2_PLAN §Out of scope | DEAD (planowo) |

**Wniosek B.** Baza to **TerritoryService** (jedyne źródło obejmujące obie strony, już event-invalidowane).
`TerritoryField` jest warstwą RENDERU (marching squares → kontury) i do zapytania o przynależność się nie nadaje,
ale jego **model promieni w LY tak** — i należy go reużyć zamiast wymyślać drugą definicję strefy.
Koszt: 72² = 5 184 par, policzalne raz i trzymane w pamięci; przy invalidacji przeliczany jest wyłącznie indeks
właścicieli, nie odległości (te są stałe w obrębie partii).

### C. Spawn statku AI na misji

| Fakt | Dowód | Status |
|---|---|---|
| Wzorzec legalnego spawnu **istnieje i działa**: `createVessel(hullId, colonyId, {modules, x, y, systemId, name})` → stempel `ownerEmpireId`/`owner`/`isEnemy` → `_vm._vessels.set(...)` → emisja `vessel:created` + `vessel:launched` | `EmpireFleetMaterializer.js:104-126` | LIVE |
| ⚠ `colonyId` przekazywany materializatorowi to **`homePlanet.id` GRACZA** — pozycja, nie właściciel (pułapka udokumentowana w `CLAUDE.md` przy S3.4d) | `EmpireFleetMaterializer.js:105` | LIVE |
| 🔴 **Nie ma pojęcia „neutralny obcy statek".** `isEnemyVessel` zwraca true dla `isEnemy===true` **lub** `owner!=='player'` **lub** `ownerEmpireId!=='player'` — statek naukowy obcych jest wrogi **z konstrukcji** | `Vessel.js:385-391` | LIVE |
| Uzbrojony **przeciw** bezbronnemu **rozpoczyna walkę** — bramka `anyArmed` to OR po obu stronach, a komentarz mówi to wprost: *„Uzbrojony vs bezbronny = walka rusza normalnie"* | `DeepSpaceCombatSystem.js:275-283` **[✔ZWERYFIKOWANE]** | LIVE |
| DSCS wymaga strony `'player'`; przeciwnika wybiera po **najwyższym napięciu** | `DeepSpaceCombatSystem.js:242-268` | LIVE |
| Ścieżka despawnu: jedyny generyczny zamiatacz to wygaszanie wraków — `_vessels.delete(id)` + `_removeVesselSprite(id)` + emisja `vessel:destroyed` | `VesselManager.js:1545-1556` | LIVE |

**Wniosek C.** Przelot da się zbudować z gotowych klocków, ale **przelot jest zestrzeliwalny** — uzbrojony statek
gracza w promieniu `COMBAT_ENGAGEMENT_AU = 0.15` wykona jednostronną egzekucję. To nie jest defekt do naprawy:
`DIPLOMACY_BACKBONE.md` §1.2 przewiduje `first-contact kill +20` w rejestrze reputacji. Wymaga jednak **decyzji**
(decyzja 4), bo dziś ten raiser nie istnieje, a przelot bez niego można zabić bezkarnie.

### D. Detekcja — jak gracz zauważa obcy statek

| Fakt | Dowód | Status |
|---|---|---|
| Kanał 1 (statek↔statek): `ProximitySystem`, próg bazowy `0.5 AU`, per-kadłub dla gracza, histereza `×1.2`; walka `0.15 AU` | `ProximitySystem.js:45-52, 192-195` | LIVE |
| Kanał 2 (radar kolonii): `VESSEL_DETECTION_RANGE = [1, 3, 6, 15, Infinity, Infinity, Infinity]`, indeks = poziom obserwatorium | `ObservatorySystem.js:30, 168-179` **[✔ZWERYFIKOWANE]** | LIVE |
| 🔴 **Zasięg nasyca się na L4 (`Infinity`).** Na progu wyzwalacza (L5) radar gracza jest **już nieskończony** — przelotu **NIE DA SIĘ przegapić** | `ObservatorySystem.js:30` **[✔ZWERYFIKOWANE]** | LIVE |
| **Narracyjny beat pierwszego wykrycia JUŻ ISTNIEJE**: wpis Dziennika (`channel:'intel'`, `severity:'warn'`) + `vessel:firstSighting` → popup z pauzą w `GameScene:2321`; podnosi też intel imperium do `rumor` | `ObservatorySystem.js:645-668`, `GameScene.js:2321` | LIVE |
| ⚠ Jego „raz na zawsze" to `_reportedVesselSightings` — **Set nieserializowany** → po przeładowaniu popup potrafi wystrzelić drugi raz dla tego samego statku | `ObservatorySystem.js:64`, brak w `serialize()` `:697-705` | LIVE (wada) |
| ⚠ Dwa łańcuchy tekstu na tej ścieżce są **zahardkodowane po polsku** (`'nieznane imperium'`, `🔭 Wykryto niezidentyfikowany kontakt w układzie.`) — naruszenie zasady PL+EN **sprzed** tego slice'u, ale dokładnie na jego trasie | `ObservatorySystem.js:655-659` | LIVE (dług) |

**Wniosek D.** Detekcja przelotu jest **darmowa i pewna** — i to zmienia projekt beatu: „wykrywalny normalnymi
sensorami" jest spełnione trywialnie, a ryzyko przegapienia nie istnieje. Realny problem jest odwrotny:
**dwa popupy** (generyczny `firstSighting` + narracyjny „Nie jesteśmy sami") o tym samym zdarzeniu (decyzja 5).

### E. Produkcja statków AI + szablony

| Fakt | Dowód | Status |
|---|---|---|
| 🟢 **AI JUŻ buduje statki tą ścieżką**: `cm.startShipBuild(capital.planetId, 'hull_small', modules)` | `EmpireLogisticsSystem.js:209` **[✔ZWERYFIKOWANE]** | LIVE |
| 🟢 **AI JUŻ ma stocznie**: `{ buildingId: 'shipyard', count: 1 }` w `startingBuildings`, a `'shipyard'` jest na liście priorytetów autorozbudowy | `EmpireArchetypeIndustrialist.js:104`, `ColonyAutoExpander.js:99` | LIVE |
| 🟢 **Dobór modułu zależny od techu z gwarantowanym fallbackiem JUŻ istnieje**: `ENGINE_TIERS` (lista od najlepszego) + `_bestEngine(techSystem)` zwraca pierwszy spełniony, a `engine_chemical` ma `requires: null` | `EmpireLogisticsSystem.js:50-58, 207` | LIVE |
| 🟢 **Config per-archetyp z fallbackiem per-klucz JUŻ istnieje**: `DEFAULT_LOGISTICS_CONFIG` nadpisywany przez `ARCHETYPES[a].logisticsConfig` | `EmpireLogisticsSystem.js:60-66, 111-113` | LIVE |
| `startShipBuild` dla AI: tech przez `colony.techSystem ?? this.techSystem`; **bramka kadłubowa TYLKO dla gracza** (AI zwolnione); wymaga stoczni i wolnego slotu; twardo wymaga POP na załogę; **brak surowców ⇒ `pendingShipOrders` i `{ok:true, queued:true}`** | `ColonyManager.js:830-936` | LIVE |
| ⚠ **Własność stemplowana PO fakcie**: `startShipBuild` produkuje statek bez właściciela; `_onVesselCreatedClaim` dopiero na `vessel:created` ustawia `ownerEmpireId`/`isEnemy`/`owner` — **z filtrem `shipId === 'hull_small'` i JEDNYM oczekiwanym buildem na imperium** (`logi.pendingBuildRoute`) | `EmpireLogisticsSystem.js:403-432` | LIVE |
| ⚠ `hull_frigate` wymaga techu `point_defense`; bez niego `startShipBuild` odrzuca z `requiresTech` | `HullsData.js:186`, `ColonyManager.js:846-850` | LIVE |
| **Nic nie waliduje mieszczenia się w slotach.** `calcShipStats` tylko sumuje; jedyny kontroler pojemności siedzi w UI edytora projektów | `ShipModulesData.js:645`, `FleetTabPanel.js:1747-1748` | LIVE |
| `FleetCompositionPolicy.composeFromStrength` nadal zwraca `modules: []` (audyt R3 — materializowane floty bez broni) | `FleetCompositionPolicy.js:78` | LIVE (wada, poza zakresem) |

**Wniosek E.** To jest najlepsza wiadomość audytu: **B.3 ma działający prototyp w repo.** Szablon to
uogólnienie `ENGINE_TIERS` + `logisticsConfig` na wszystkie sloty kadłuba. Dwie rzeczy trzeba jednak dopisać,
bo nie istnieją: **walidator pojemności** (nic go nie robi poza UI, więc szablon przepełni kadłub w ciszy)
i **własny stempel własności** (mechanizm `pendingBuildRoute` obsługuje dokładnie jeden oczekiwany statek
na imperium i filtruje po `hull_small` — fregaty Directora przez niego nie przejdą).

### F. Kanał narracyjny

| Fakt | Dowód | Status |
|---|---|---|
| Kanał kanoniczny: `queueMissionEvent(cfg)` (`MissionEventModal` — kolejka + pauza) → `buildScheduledEventPopup` (render). Kontrakt: `{ severity: 'info'\|'warning'\|'danger'\|'discovery', headline, description, videoSrc[]\|svgKey, gameYear, options[{label,cost,effectDesc}], buttons[{label,primary}], contentHTML, onDismiss }` | `ScheduledEventPopup.js:424-431`, `DiplomacyRefusalModal.js:13-14` | LIVE |
| 🔴 **Przyciski w tym kanale są WYŁĄCZNIE zamykające.** `buildScheduledEventPopup` nie czyta `onClick`, a `MissionEventModal` podpina `dismiss()` każdemu przyciskowi bez znacznika `_hasCustomClick` — którego **nic nie ustawia** | `DiplomacyRefusalModal.js:15-18` (D2 udokumentował to przy budowie kanału) | LIVE (ograniczenie) |
| Precedens do skopiowania: `DiplomacyRefusalModal` — **bez importu `Acceptance*`** (pin P14 trzyma import silnika w `DiplomacySystem`), payload niesie `labelKey`, `MAX_ROWS = 6`, bo karta popupu **nie ma przewijania** | `DiplomacyRefusalModal.js:8-32` | LIVE |
| Dziennik: whitelist severities `['info','warn','alert']`, nieznana **po cichu** degradowana do `info` (pułapka `'warning'`→`'warn'` opisana w `CLAUDE.md`) | `EventLogSystem.js:90` | LIVE |

**Wniosek F.** Beat pierwszego kontaktu (bez wyboru) mieści się w kanale **idealnie**. Ale **Slice 2 się w nim
nie zmieści**: żądania i ultimatum wymagają przycisku, który coś robi, a tego kanał nie umie. To trzeba powiedzieć
teraz, a nie odkryć w Slice 2 (§Kolizje).

### G. Trwałość stanu reguł

*(jedyny obszar z pełnym przebiegiem agenta; kluczowe twierdzenie potwierdziłem osobno)*

| Fakt | Dowód | Status |
|---|---|---|
| `restore()` merguje **po `Object.keys(default)`**: `merged[k] = data[k] ?? def[k]` ⇒ domena **zadeklarowana** w `createDefaultState` wraca za darmo (brak w starym zapisie → default) | `GameState.js:126-137` **[✔ZWERYFIKOWANE]** | LIVE |
| ⇒ **domena NIEzadeklarowana jest po cichu WYRZUCANA przy wczytaniu** — pętla nie iteruje po zapisie. Kod już o tym wie: *„Klucz MUSI tu być, inaczej restore() go pominie"* | `GameState.js:133, 42-43` **[✔ZWERYFIKOWANE]** | LIVE |
| 🔴 **Ta pułapka JUŻ DZIŚ tnie `orbitalDominance`**: pisany przez `WarSystem:197` i `EnemyAttackHandler:174/176`, czytany przez bramki desantu, zasiewany przez migrację `SaveMigration:1642-1644` — i **nieobecny w `createDefaultState`** | grep po `src/` **[✔ZWERYFIKOWANE]** | MISSING (błąd sprzed slice'u) |
| Precedens „nowa domena bez bumpu": `tradeOrders` + `crossEmpireTrade` (v86) — zero wystąpień w `SaveMigration` | `GameState.js:35-36` | LIVE |
| Kontr-precedens: `transportOrders` **wziął** bump (v95) dla samej spójności, z komentarzem że funkcjonalnie migracja jest zbędna | `SaveMigration.js:2324-2336` | LIVE |
| Wzorzec cooldownu bez bumpu: `verbCooldowns` na rekordzie pary, czytane `?? {}` — komentarz podaje **regułę**: bump jest zbędny, gdy pusta wartość jest bezpiecznym defaultem | `RelationsModel.js:93-97`, `AcceptanceEngine.js:324` | LIVE |
| Kontrast: `bordersOpen` **poszedł** do migracji, bo defaultu per stronę nie da się dopowiedzieć przy odczycie | `RelationsModel.js:87-89`, `SaveMigration.js:2637` | LIVE |
| ⚠ `restore` podmienia domenę najwyższego poziomu **w całości** ⇒ pod-klucze dodane później **nie są uzupełniane**; obejście w repo to hooki `init*Subdomain()` wołane PO restore | `GameState.js:27-28`, `IntelSystem.js:586-591`, `GameScene.js:1712-1717` | LIVE |
| ⚠ Każdy `gameState.set()` emituje `gameState:changed`, które `DebugLog` wpycha do ringu 10 000 wpisów ⇒ licznik bity co tick **wypłucze ścieżkę audytu AI**, którą Director ma wzmacniać | `GameState.js:86`, `DebugLog.js:43, 52` | LIVE |
| Dowód na żywym organizmie, że nieserializowany „raz na zawsze" **strzela ponownie**: `_reportedVesselSightings` (§D) | `ObservatorySystem.js:64` | LIVE |

**Wniosek G.** **v100 bez migracji jest osiągalne** pod warunkiem, że wszystkie domyślne wartości Directora są
puste/fałszywe (`{}`, `[]`, `false`, `0`) — wtedy „brak w zapisie" jest nieodróżnialne od poprawnego defaultu,
czyli spełniony jest test z `verbCooldowns`, a nie z `bordersOpen`.

### H. Ścieżka zapisu incydentu przez kręgosłup D1/D2

| Fakt | Dowód | Status |
|---|---|---|
| API zapisu: `DiplomacySystem.addOpinionModifier(ofId, aboutId, modId, { source })` · `addMemory(ofId, type, payload)` · `changeTension(empireId, delta, reason)` | `DiplomacySystem.js:602-620` (miejsce użycia) | LIVE |
| Katalog: `OPINION_MODIFIERS` = `{ id, labelKey, defaultValue, decayPerYear (na rok **WYŚWIETLANY** — D2/E6), combine: REFRESH\|ACCUMULATE, persistent }`. **Nowy modyfikator = wpis danych + klucz i18n PL+EN**; smoke pilnuje `id === klucz` | `OpinionModifierData.js:31-60` | LIVE |
| 🔴 **Twarda reguła D2:** każdy typ incydentu wchodzi do wyniku **DOKŁADNIE JEDNYM kanałem** — `INCIDENT_CHANNELS` mapuje typ → `opinion \| tension \| status \| memory`, term `memory` czyta wyłącznie kanał `memory`, **a smoke sprawdza to WYKONANIEM** | `AcceptanceWeightData.js:360-381` **[✔ZWERYFIKOWANE]** | LIVE |
| 🔴 **Kolizja wprost z łańcuchem nacisku:** `military_presence` (−5, `ACCUMULATE`, kanał `opinion`) **już się nalicza** dla uzbrojonego statku gracza przybywającego do układu AI | `DiplomacySystem.js:613-615`, `OpinionModifierData.js:63-66` **[✔ZWERYFIKOWANE]** | LIVE |
| Drabina napięcia: 40 ostrzeżenie / 60 ultimatum / 80 **automatyczna wojna** | `DiplomacySystem.js` (progi), audyt §4.2 | LIVE |
| FSM `AlienCivSystem` ma **dokładnie dwóch czytelników**, obu w `MilitaryAI` (`:54`, `:132` — bonus ×2.0 w `REARMING`), czyli w kodzie, który audyt R1 uznał za martwy | grep po `src/` | STUB |

**Wniosek H.** Zapis incydentu jest łatwy, ale **dwie rzeczy mogą wysadzić balans po cichu**: (1) ponowne
naliczenie `military_presence` przez Directora **podwoiłoby** karę, którą dyplomacja już nakłada — a reguła
anty-podwójnego-liczenia jest pinowana wykonaniem, więc smoke padnie (dobrze) albo Director użyje własnego id
i podwoi karę bocznymi drzwiami (źle); (2) incydent piszący **napięcie** może przypadkiem przekroczyć 80 i
**wypowiedzieć wojnę** — a nacisk L1–L2 ma z definicji wojny NIE wypowiadać.

---

## Corrections to spec

Pięć miejsc, w których master plan / backbone / audyt z 2026-08-05 mówią coś, czego kod nie potwierdza.
Zapisane teraz, bo audyt R9 uczy, że martwe dane czytają się jak zaimplementowana funkcja.

| # | Spec mówi | Rzeczywistość / korekta |
|---|---|---|
| **K-1** | Master plan §C: *„AI ship production from templates — spawned instantly when resources + criteria are met (no physical build queue)"*, a §B.3 równocześnie: *„scripts order, economy executes"* — tak, by intel **widział rozbudowę** | **Te dwa zdania się wykluczają.** Natychmiastowy spawn omija `startShipBuild`, więc **nie zostawia kolejki**, w którą intel mógłby zajrzeć; kolejka (`shipQueues` / `pendingShipOrders`) powstaje wyłącznie na ścieżce ekonomicznej. **Rekomendacja: wybrać „economy executes"** — bo ta ścieżka JUŻ DZIAŁA dla AI (`EmpireLogisticsSystem:209`), sama kolejkuje przy braku surowców i daje `buildTime` fregaty 5.0 jako naturalne opóźnienie dramaturgiczne. „Instant" było obejściem problemu, którego nie ma. **Decyzja 6.** |
| **K-2** | Master plan §C i backbone §5/D3: strefa graniczna = *„claimed + 1-jump border zone"* | **„1 skok" nie ma w tym kodzie definicji galaktycznej.** Krawędź istnieje, gdy `warpDist3D ≤ maxHopLY`, a `maxHopLY = warpFuel.max / warpFuel.consumption` **konkretnego statku** (`WarpRoutePlanner.js:1-13`). Dwa statki widzą dwa różne grafy. **Korekta: strefa graniczna to PROMIEŃ W LY**, reużywający modelu `TERRITORY.R_*_LY` (1.0–4.0 wg `devScore`), a nie topologii skoków. **Wiąże też D3** — to jest współdzielony fundament. |
| **K-3** ⚠ **SKORYGOWANE PO POMIARZE S0** | Audyt §3.5: *„AI ship production — **none** — AI never calls `startShipBuild` for warships"* | Pierwsza wersja tej korekty brzmiała: *„AI wywołuje `startShipBuild` dla kurierów, więc ścieżka jest przetestowana"*. **Pomiar V4 ją obalił:** wywołanie istnieje w kodzie (`EmpireLogisticsSystem:209`), ale w 4 seedach × 400 civY **nie odpaliło ani razu** (trasy kurierskie wymagają outpostów, których AI nie zakłada). Poprawne brzmienie: **ścieżka produkcji DZIAŁA** (S0 udowodnił ją wprost — fregata powstała na kolonii AI), ale **nie ma dziś działającego konsumenta**. Rozmiar B.3 to nadal „katalog + wywołanie", lecz Director jest **pierwszym** realnym konsumentem i musi dołożyć stempel własności, guard załogi i guard komodytów (§Wyniki weryfikacji). |
| **K-4** | Audyt §5.4: `orbitalDominance` wymieniony wśród domen **utrwalanych** | **Nieprawda w bieżącym kodzie** (`GameState.js:20-46` go nie deklaruje ⇒ `restore` go wyrzuca). Nie jest to problem Slice 1, ale **jest to dokładnie ta klasa błędu**, którą Slice 1 popełni, jeśli zapomni linii w `createDefaultState`. Zgłoszone do backlogu jako osobna, jednolinijkowa naprawa. |
| **K-5** | Audyt §6.1: `AlienCivSystem._tickAll` jako pętla *„1 civYear, ≤8 kroków/tick"*, backbone §4: pary AI↔AI *„round-robin"* | Kroki są clampowane do 8, ale **każdy krok przechodzi po WSZYSTKICH imperiach** — nie ma tu round-robinu po imperiach (`AlienCivSystem.js:62-66, 94`). Przy 3–6 imperiach to bez znaczenia; przy ocenie kosztu reguł Directora **liczy się jako `regułyxImperia` na krok**, nie `reguły`. |
| **K-6** (S3) | §Template format spec: *„Fallback jest OBOWIĄZKOWY: `hull_frigate` wymaga techu `point_defense`, którego imperium może nie mieć"* | **Wymóg zostaje, jego uzasadnienie NIE działa dla okrętów bojowych.** `point_defense` bramkuje JEDNOCZEŚNIE kadłub fregaty (`HullsData.js:186`) **i każdy moduł broni w grze** (`weapon_laser/_kinetic/_missile` — `ShipModulesData.js:472/488/504`; czwarty ma próg jeszcze wyższy). Imperium bez tego techu zejdzie po drabince na `hull_small` i **odbije się od slotu broni**: wynikiem jest `no_module`, nie „gorszy okręt". Kadłub zapasowy jest więc dla trzech fregat katalogu v1 **strukturalnie nieosiągalny**. Zostawiony w danych (instrukcja właściciela, koszt zerowy) i **PINOWANY wykonaniem** — `ship_template_resolver_smoke` T10 asertuje `no_module`, więc gdyby ktoś przeniósł broń spod `point_defense`, pin padnie i fallback naprawdę się obudzi. Fallback modułu (drabinka `tiers`) jest niezależny i **działa** — ćwiczy go `science_probe` (T5). |

**Dodatkowo — jednostka czasu wyzwalacza pierwszego kontaktu (nie ma jej w specyfikacji, a musi być).**
Master plan pisze *„cumulative yearly roll 10%/20%/30%…→100%"* **bez jednostki**. D2/E6 znalazło **trzy komentarze
kłamiące o jednostce** i ujednoliciło całą dyplomację do **lat WYŚWIETLANYCH**; `AlienCivSystem` tyka w latach
**cywilizacyjnych** (`CIV_TIME_SCALE = 12`). Różnica jest jakościowa, nie kosmetyczna:

| jednostka | nasycenie do 100% | wartość oczekiwana rzutu | w partii ~30–40 lat wyśw. (D2_PLAN §B4) |
|---|---|---|---|
| lata cywilizacyjne | 10 civY = **0,83 roku wyśw.** | ~0,3 roku wyśw. | pierwszy kontakt praktycznie **natychmiast po L5** |
| **lata wyświetlane** | 10 lat wyśw. | **~3,7 roku wyśw.** | oczekiwanie mierzalne, gwarancja przed końcem partii |

**Rekomendacja: lata WYŚWIETLANE**, stała nazwana z jednostką w komentarzu (dyscyplina E6). **Decyzja 2.**

---

## Rule format spec

Deklaratywna reguła, plik danych, zero logiki. Wzór składni: `OPINION_MODIFIERS` (płaska mapa `id → obiekt`,
`id` równy kluczowi, pinowane smoke'iem).

```js
// src/data/DirectorRuleData.js — WYŁĄCZNIE dane. Balans strojymy TUTAJ i nigdzie indziej.
export const DIRECTOR_RULES = {
  first_contact: {
    id:        'first_contact',
    // ── TRIGGER: co zbiera fakt. 'event' = subskrypcja, 'poll' = odczyt w tick.
    trigger:   { kind: 'poll', probe: 'playerObservatoryLevel', gte: 5 },
    // ── GUARD: warunki dodatkowe, oceniane w ticku (czyste predykaty po ctx).
    guard:     ['empireNotAtWarWithPlayer', 'empireIntelAtMost:contact'],
    // ── ROLL: kumulatywny rzut roczny. Jednostka: rok WYŚWIETLANY (decyzja 2).
    roll:      { startPct: 10, stepPct: 10, capPct: 100, unit: 'displayedYear' },
    // ── DELAY: ile lat WYŚWIETLANYCH od rzutu do odpowiedzi (0 = natychmiast).
    delay:     0,
    // ── RESPONSE: nazwa akcji z rejestru DirectorActions (kod, nie dane).
    response:  { action: 'scienceFlyby', params: { template: 'science_probe' } },
    // ── PERSONALITY: mnożnik szansy/opóźnienia z wektora osobowości archetypu.
    //    Slice 1: JEDNA oś na regułę, mnożnik w [0.5, 1.5]. Bez tabel krzyżowych.
    personalityMod: { axis: 'science', at0: 0.5, at1: 1.5 },
    // ── COOLDOWN: lata WYŚWIETLANE; `once: true` = raz na parę, na zawsze.
    cooldown:  { once: true },
  },

  military_pressure_l1: {
    id:        'military_pressure_l1',
    trigger:   { kind: 'event', on: 'director:borderPresence', where: { armed: true } },
    guard:     ['empireNotAtWarWithPlayer', 'empireHasShipyard'],
    delay:     1.0,
    response:  { action: 'queueWarships', params: { template: 'frigate_line', count: [2, 3] } },
    personalityMod: { axis: 'aggression', at0: 0.5, at1: 1.5 },
    cooldown:  { years: 5.0 },
    escalatesTo: 'military_pressure_l2',   // powtórka w oknie → następny szczebel
    escalationWindowYears: 10.0,
  },
  // military_pressure_l2: ... (squadron + defensive posture)
};
```

**Zasady kontraktu:**

1. **Dane nie zawierają kodu.** `response.action` i wpisy `guard` to **nazwy** rozwiązywane w rejestrach
   (`DirectorActions`, `DirectorGuards`) w `src/systems/director/`. Precedens: `UtilityAI` `{id, score, execute}`.
2. **Wszystkie czasy w latach WYŚWIETLANYCH**, każda stała z jednostką w komentarzu (dyscyplina D2/E6).
3. **Cooldown i licznik eskalacji są stanem trwałym** (§Audit G), `delay` w locie też — precedens
   `RandomEventSystem._warningQueue` jest serializowany.
4. **`personalityMod` to jedna oś, mnożnik liniowy** — Slice 1 nie wprowadza tabel `archetyp × reguła`.
   Warianty per archetyp dla pierwszego kontaktu są **świadomie odroczone** (podpisane w master planie).
5. **Loud-fail (audyt R12):** brak kolaboratora = **rzuć**, nie no-op. Żadnych `window.KOSMOS?.x?.y?.()`
   w ścieżce decyzyjnej Directora — to jest mechanizm, którym R1 przetrwał niezauważony.

---

## Template format spec — kontrakt dla katalogu Filipa

**Plik:** `src/data/ShipTemplateData.js` · **Ładowanie:** import mapy + `resolveTemplate(templateId, ctx)`
w `src/utils/ShipTemplateResolver.js` (czysta funkcja, node-testowalna). **Nowy szablon = wpis w mapie i nic
więcej** — zero zmian w kodzie.

```js
export const SHIP_TEMPLATES = {
  frigate_line: {
    id:   'frigate_line',
    role: 'warship',                 // warship | science | courier | transport
    // Kadłuby od najlepszego; wybierany PIERWSZY z spełnionym `requires`.
    // Fallback jest OBOWIĄZKOWY: hull_frigate wymaga techu `point_defense`,
    // którego imperium może nie mieć (HullsData.js:186).
    hullTiers: ['hull_frigate', 'hull_small'],
    // Sloty w kolejności wypełniania. `tiers` = preferencje od najlepszej
    // (wzór ENGINE_TIERS + _bestEngine, EmpireLogisticsSystem.js:50-58).
    // `required: false` = slot porzucany PIERWSZY przy braku pojemności.
    slots: [
      { tiers: ['engine_fusion', 'engine_ion', 'engine_chemical'], required: true  },
      { tiers: ['armor_composite', 'armor_standard'],              required: true  },
      { tiers: ['weapon_kinetic'],                                 required: true  },
      { tiers: ['weapon_kinetic'],                                 required: false },
    ],
    // Nadpisania per archetyp, per klucz (wzór _logisticsConfig).
    archetypeOverrides: {
      xenophage: { slots: [ /* … */ ] },
    },
  },
};
```

**Kontrakt rozwiązywania (`resolveTemplate`) — cztery reguły, wszystkie wymuszone testem:**

1. **Kadłub:** pierwszy z `hullTiers`, którego `requires` spełnia `colony.techSystem`. Brak żadnego ⇒
   `{ ok: false, reason: 'no_hull' }` (a **nie** cichy fallback na cokolwiek).
2. **Moduł:** w każdym slocie pierwszy z `tiers` z spełnionym `requires`. Slot `required: true` bez trafienia ⇒
   `{ ok: false, reason: 'no_module' }`; slot `required: false` po prostu wypada.
3. **Pojemność:** liczba modułów ≤ `HULLS[hull].slots.length`, z poszanowaniem typu slotu
   (`propulsion` vs `utility`). **Przy przekroczeniu odpadają sloty `required: false`, od końca.**
   ⚠ **To musi zrobić resolver — nikt inny tego nie sprawdza**: `calcShipStats` tylko sumuje, a jedyny
   walidator pojemności w repo siedzi w UI edytora (`FleetTabPanel.js:1747-1748`).
4. **Czysto i deterministycznie:** bez `window`, bez `Math.random`, techy wstrzykiwane przez `ctx`
   (wzór `WarpRoutePlanner`, `OpinionMath`). Rezultat: `{ ok: true, hullId, modules: string[] }` —
   dokładnie ten kształt, którego oczekuje `startShipBuild(planetId, hullId, modules)`.

**Placeholder na czas pracy Filipa:** jeden wpis `frigate_line` dokładnie jak wyżej + `science_probe`
(`hullTiers: ['hull_small']`, sloty: silnik + `science_lab`). Katalog Filipa podmienia zawartość mapy;
resolver, testy i wywołania zostają bez zmian.

---

## Decisions taken

1. **Director jest systemem, nie rozszerzeniem `AlienCivSystem`.** Nowy `src/systems/director/DirectorSystem.js`,
   tickowany **z** `AlienCivSystem._tickAll` (jedno wywołanie na imperium na krok), ale własny plik, własny
   stan, własne testy. Powód: `AlienCivSystem` to dziś FSM z dwoma martwymi czytelnikami (§Audit H) — wstawienie
   tam dramaturgii zrosłoby żywy kod z martwym.
2. **Mapa wpływów to osobny, runtime-only serwis** `src/systems/InfluenceMap.js`, czytający `TerritoryService`
   i `galaxyData` (pozycje) — **bez serializacji**, invalidacja przez `territory:ownersChanged`. Wzór:
   `TerritoryService`/`SystemPoolService`. D3 konsumuje go bez zmian.
3. **Zero zmian wizualnych.** Mapa wpływów jest **danymi**; `TerritoryField`/Stratcom nietknięte
   (master plan: „data-only, no visual map changes").
4. **Kill-switch `FEATURES.reactionDirector`, domyślnie ON**, w bloku `FEATURES` w `GameConfig.js`
   z komentarzem w konwencji sąsiadów. OFF = Director się nie konstruuje, zero subskrypcji, zero spawnów.
   Precedens ON-by-default dla mechaniki do oceny w praktyce: `transportOrders`.
5. **Threat assessment ZOSTAJE POZA.** Nacisk L1–L2 liczy **obecność** (ile uzbrojonych statków gracza jest
   w strefie), nie siłę. Audyt R2 (`estimatePlayerMilitary` czyta `m?.id` po `string[]` ⇒ zawsze false) należy
   do WAR_BACKBONE i **nie wolno go naprawiać tutaj** — naprawa rusza `milRatio` z ~0 na realne wartości
   i może natychmiast wepchnąć imperia w `AGGRESSIVE`/`WAR` (to samo ostrzeżenie co K-1 w D2_PLAN).
6. **Wszystkie domyślne wartości stanu Directora są puste/fałszywe** — to jest warunek „v100 bez migracji"
   (§Audit G, test `verbCooldowns` vs `bordersOpen`).
7. **`initDirectorSubdomain()` wołane po `gameState.restore()` od pierwszego commita**, żeby Slice 2/3 mogły
   dokładać pod-klucze bez bumpu wersji (`restore` podmienia domenę w całości — `GameState.js:27-28`).
   Precedens: `IntelSystem.initVesselSubdomain`, `POIRegistry.initPOISubdomain`.
8. **Zapisy do `gameState` są wsadowe, tylko przy zmianie** — nigdy per tick per imperium (ring `DebugLog`
   ma 10 000 wpisów i to jest ścieżka audytu AI, którą Director ma wzmacniać, a nie wypłukiwać).

### Dwie decyzje dołożone przez pomiar R-2 (S2) — DO PODPISU

9. **Kształt strefy: ODCZYT A — `outer = r_roszczony + BORDER_LY`.** *Rekomendacja: TAK.*
   Wariant B (`outer = max(r_roszczony, BORDER_LY)`) ma własność, która przeczy sensowi mechaniki:
   przy `R_MAX_LY 4.0` i stałej 5 LY powłoka rozwiniętego imperium ma **1 LY grubości**, czyli
   **im potężniejsze imperium, tym CIEŃSZA jego strefa nacisku**. Pomiar pokazuje też, jak wąski
   jest wtedy efekt: odczyt B daje dziś 2,8–12,5 % pokrycia wobec 11,1–30,6 % dla A — nacisk
   militarny praktycznie przestałby się wyzwalać. **Konsekwencja do przyjęcia:** dla dzisiejszego
   AI (devScore nasycony) A znaczy po prostu „9 LY od stolicy".
10. **Metryka: 3D (`x/y/z`), nie rzut 2D.** *Rekomendacja: TAK.* Mapa wpływów jest **danymi dla
    reguł**, a nie rysunkiem, więc powinna mierzyć to, co realnie rządzi osiągalnością — a to jest
    `warpDist3D` (`WarpRoutePlanner.js:32-37`), 3D. `TerritoryField` liczy 2D (`:81`), ale to
    warstwa RENDERU i jej uproszczenie nie jest kontraktem. Rzut 2D **zawyża pokrycie o 1,4–5,6 pkt
    proc.** (zmierzone), bo rzutowanie zawsze skraca odległości. **Świadoma niespójność do
    przyjęcia:** obraz na Stratcomie (2D) będzie odrobinę hojniejszy niż strefa, którą liczą reguły
    — to jest tańsze niż zmiana renderu, którego ten slice ma nie dotykać (decyzja 3).

---

## Commit plan

Atomowo, po jednym slice'ie na commit, ścieżki dodawane jawnie. **Trzy live-gate'y** — bo trzy różne rzeczy
mogą się zepsuć niezależnie i regresji nie da się inaczej przypisać.

| # | commit | zawartość | gate |
|---|---|---|---|
| **S0** ✅ | `test(director): weryfikacja szwów przed szkieletem` | NEW `src/testing/headless/probe-director-seams.mjs` (pomiar V1–V4) + keeper `src/testing/smoke/director_seams_smoke.mjs` (16 asercji, fail-first na V1a/V3b). **Wynik: 11 potwierdzonych, 1 ZŁAMANE (V4)** — §Wyniki weryfikacji. Zero kodu produkcyjnego. | — |
| **S1** | `feat(director): szkielet reguł + rejestry` | NEW `src/data/DirectorRuleData.js` (katalog, ZERO reguł aktywnych) · `src/utils/DirectorRuleMath.js` (czysta: rzut kumulatywny, `personalityMod`, cooldown, okno eskalacji) · `src/systems/director/DirectorSystem.js` (+ rejestry `DirectorGuards`/`DirectorActions`, puste) · flaga `FEATURES.reactionDirector` · `gameState.director` w `createDefaultState` + `initDirectorSubdomain`. **Stoi samodzielnie — nic tego nie importuje** (wzór E1 z D2). | — |
| **S2** | `feat(director): mapa wpływów (claimed + strefa graniczna w LY)` | NEW `src/systems/InfluenceMap.js` + `src/utils/InfluenceMath.js` (czysta: `systemsWithinLY`, promień z `devScore`) · wpięcie w `GameScene` po `territoryService` · `KOSMOS.debug.influenceMap()`. Data-only. | — |
| **S3** ✅ | `feat(director): szablony statków + resolver` | NEW `src/data/ShipTemplateData.js` (**katalog v1 Filipa: `frigate_laser_escort` / `frigate_missile_escort` / `frigate_system_defender`** + `science_probe`) · `src/utils/ShipTemplateResolver.js` · **walidator pojemności** (§Template §3). Bez wywołań produkcyjnych. | — |
| **S4** | `feat(director): produkcja okrętów AI przez startShipBuild` | Akcja `queueWarships`: `resolveTemplate` → `cm.startShipBuild(capital.planetId, hullId, modules)` · **własny stempel własności** na `vessel:created` (klucz inny niż `logi.pendingBuildRoute`, BEZ filtra `hull_small` — V3c) · **guard `empireHasFreeCrew`** (V3z — połowa kolonii AI stoi na `freePops=0`, a bramka jest twarda) · **obsługa braku komodytów** (V3y — decyzja: guard czy świadome czekanie w `pendingShipOrders`) · `director:shipQueued`. **+R-3:** zasiew stacji w `EmpireColonyBootstrap` (po prerekwizycie 3D) · guard `empireHasOrbitalStation` · decyzja o `point_defense`. | **GATE 1** |
| **S5 ✅** | `feat(director): łańcuch pierwszego kontaktu` | Reguła `first_contact` (rzut w latach **wyświetlanych**) · akcja `scienceFlyby` (spawn wzorem `EmpireFleetMaterializer` + kurs przez układ gracza + despawn na wyjściu) · beat narracyjny przez `queueMissionEvent` · i18n PL+EN · uzgodnienie z `vessel:firstSighting` (decyzja 5). | **GATE 2** |
| **S6** | `feat(director): nacisk militarny L1-L2` | `director:borderPresence` z `InfluenceMap` · reguły L1/L2 + eskalacja w oknie · **nowy typ incydentu z zadeklarowanym kanałem w `INCIDENT_CHANNELS`** (§Audit H) · „postawa obronna stolicy" · i18n. | **GATE 3** |
| **S7** | `docs(director): domknięcie + wynik gate'ów` | `CLAUDE.md` + `MEMORY.md` + ten plan (wyniki), `REACTION_DIRECTOR.md` jeśli orkiestrator zdecyduje, że Slice 1 ma go otworzyć. | — |

**Bramki per commit:** `node src/testing/smoke/run-all.mjs` 0 FAIL · `node tools/check-i18n.mjs` PASS ·
`grep` na brak `window.KOSMOS?.` w ścieżce decyzyjnej Directora (R12).

---

## Tests

Keepery w `src/testing/smoke/` (bez prefiksu `tmp_`, importy przez `../../`).
**Fail-first tam, gdzie się da** — przy S4 i S6 jest to wykonalne i wymagane.

- **`director_rule_math_smoke`** (S1, czysty): rzut kumulatywny 10/20/…/100 osiąga 100% **dokładnie** w 10.
  kroku; wartość oczekiwana ≈ 3,66 kroku (pin liczbowy — chroni przed cichą zmianą krzywej); `personalityMod`
  na obu końcach osi; cooldown i okno eskalacji na granicy (`==` vs `>`); **determinizm** przy tym samym seedzie.
- **`director_persistence_smoke`** (S1, **pin klasy K-4**): `gameState.director` przeżywa
  `serialize → restore`; **fail-first: usunięcie wpisu z `createDefaultState` MUSI wywalić test** — to jest
  dokładnie ten błąd, który dziś zjada `orbitalDominance`. Plus: wszystkie defaulty są puste/fałszywe
  (warunek „v100 bez migracji"), `CURRENT_VERSION` bez zmian.
- **`influence_map_smoke`** (S2, czysty): przynależność do strefy po promieniu LY; promień rośnie z `devScore`
  między `R_MIN_LY` a `R_MAX_LY`; układ sporny nie należy do obu stref; **pin korekty K-2** — test jawnie
  asertuje, że strefa NIE zależy od baku warp żadnego statku.
- **`ship_template_resolver_smoke`** (S3, czysty): fallback kadłuba przy braku `point_defense`;
  fallback modułu po `tiers`; **odrzucenie slotów `required:false` przy przekroczeniu pojemności** (§3);
  `no_hull`/`no_module` zamiast cichego fallbacku; determinizm; **kształt wyniku zgodny z `startShipBuild`**.
- **`director_ai_production_smoke`** (S4, **fail-first**): kolonia AI ze stocznią + surowcami → kolejka rośnie;
  bez surowców → `pendingShipOrders` (`{ok:true, queued:true}`); **statek po ukończeniu MA `ownerEmpireId`**
  (fail-first: bez stempla test pada — to jest okno z §Audit E) i **nie zderza się z `pendingBuildRoute`
  logistyki**, gdy oba budują naraz.
- **`director_first_contact_smoke`** (S5): rzut nie startuje poniżej L5; `once` naprawdę raz **także po
  round-tripie zapisu**; przelot nie odpala drugiego popupu obok `vessel:firstSighting` (decyzja 5).
- **`director_pressure_smoke`** (S6, **fail-first na dwóch hazardach z §Audit H**): (a) incydent nacisku
  **nie dubluje** `military_presence` — reguła jednego kanału trzyma, a test pada, jeśli Director doda drugi
  wpis o tym samym skutku; (b) L1+L2 **nie potrafią przekroczyć progu automatycznej wojny (80)** przy żadnej
  liczbie powtórzeń w oknie.
- **Regresja (musi przejść bez edycji):** `acceptance_engine_smoke` · `diplomacy_d1_smoke` ·
  `diplomacy_opinion_smoke` · `diplomacy_time_units_smoke` · `diplomacy_migration_v100_smoke` ·
  `empire_objective_smoke` · `warp_route_planner_smoke` · pełny sweep (dziś **114** keeperów).

---

## Verification (live gate)

**GATE 1 (S4) — produkcja.** Kolonia AI dostaje zlecenie z szablonu: kolejka stoczni rośnie, statek powstaje,
**ma właściciela** (nie pokazuje się we flocie gracza, nie obciąża jego utrzymania), a przy braku surowców
zlecenie czeka zamiast zniknąć. Kurier logistyczny budowany równolegle **nie gubi swojego stempla**.

**GATE 2 (S5) — pierwszy kontakt.** Na zapisie z obserwatorium L5: przelot się pojawia, gracz widzi
**dokładnie jeden** beat narracyjny (nie dwa), intel imperium rusza do `rumor`, przeładowanie zapisu **nie
odpala beatu ponownie**. Kontrtest: zestrzelenie przelotu uzbrojonym statkiem daje wynik zgodny z decyzją 4.

**GATE 3 (S6) — nacisk.** Uzbrojony statek gracza w strefie granicznej AI: incydent trafia do panelu dyplomacji
**jednym wierszem** (nie dwoma), AI kolejkuje 2–3 fregaty, powtórka w oknie eskaluje do L2, a **napięcie nie
przekracza progu ultimatum** przy samym nacisku. Panel opinii pokazuje jednostkę czasu (dług E6 utrzymany).

---

## Out of scope (świadomie)

Warianty pierwszego kontaktu per archetyp (**odroczone i podpisane** w master planie) · nacisk **L3**
(żądania/ultimatum — potrzebuje czasowników D4 **i naprawy kanału**, §Kolizje) · żądania trybutu,
kontrwywiad, wyścig zbrojeń, oportunizm wojenny (**Slice 2–3**) · naprawa R2 i wspólny threat assessment
(**WAR_BACKBONE**, decyzja 5) · uzbrojenie flot materializowanych `composeFromStrength` (audyt R3 —
**WAR_BACKBONE**) · `bordersOpen` i incydenty przekroczenia granicy jako czasownik (**D3**) · pary AI↔AI
(**D5**) · reforma mapy 2D (**koniec arca**) · naprawa `orbitalDominance` (K-4) i i18n zahardkodowanych
łańcuchów w `ObservatorySystem` (§Audit D) — **backlog, jednolinijkowe, nie mieszać z tym slice'em**.

---

## Kolizje z przyszłym zakresem

**Z D3 (granice, incydenty, mapa wpływów).** Mapa wpływów jest **wspólna** i ten plan ją buduje pierwszy
(decyzja 2). D3 dostaje ją gotową, ale musi wiedzieć o dwóch rzeczach: (1) **korekta K-2** — strefa jest
promieniem w LY, nie „jednym skokiem", więc język D3 wymaga sprostowania; (2) **dwa źródła własności układu**
(§Audit B) — `TerritoryService` (obie strony) i `galaxyData.empireId` (tylko AI, i to jego czyta dyplomacja).
D3 powinno je uzgodnić; Slice 1 **świadomie tego nie robi** — czyta TerritoryService i zostawia zastaną
atrybucję incydentów w spokoju, żeby nie wnieść zmiany balansu bocznymi drzwiami.

**Z WAR_BACKBONE.** Threat assessment zostaje **poza** (decyzja 5) — L1–L2 liczy obecność. Kiedy WAR_BACKBONE
naprawi R2, reguły nacisku będą mogły dostać term siły **bez zmiany formatu reguły** (dojdzie `guard`).
Slice 1 nie dotyka `MilitaryAI`, `FLEET_AGGRO_INTERVAL` ani `composeFromStrength`.

**Ze Slice 2 (żądania) — najważniejsza kolizja i najlepszy moment, żeby ją zgłosić.**
Kanał `queueMissionEvent → buildScheduledEventPopup` **nie umie przycisku, który coś robi**: `onClick` nie jest
czytany, a `MissionEventModal` podpina `dismiss()` każdemu przyciskowi bez `_hasCustomClick`, którego nic nie
ustawia (`DiplomacyRefusalModal.js:15-18` — D2 udokumentowało to, budując ten kanał). Slice 1 się mieści,
bo jego beat jest **czysto narracyjny**. **Slice 2 nie ruszy, dopóki kanał nie dostanie realnego wyboru** —
i to jest osobna robota UI, którą trzeba zaplanować **przed** Slice 2, nie w jego trakcie.

---

## Open decisions — DO PODPISU (osiem)

1. **Gospodarz ticku: zdarzenia zbierają, tick ocenia.** Fakty (`vessel:arrived`, `planet:constructionComplete`)
   lądują natychmiast w buforze Directora; **decyzje zapadają w `AlienCivSystem._tickAll`** (1 rok cyw.).
   *Rekomendacja: TAK.* Reaktywność podroczna nie jest tu potrzebna (`delay` i tak jest cechą reguły), a jeden
   punkt oceny = jeden punkt audytu i jedno miejsce na cooldowny. **Wariant odrzucony:** ocena wprost w handlerze
   zdarzenia — rozsypuje decyzje po całym kodzie i sprawia, że kolejność zdarzeń zmienia wynik.
2. **Jednostka rzutu pierwszego kontaktu: lata WYŚWIETLANE.** *Rekomendacja: TAK* — spójne z D2/E6, daje
   wartość oczekiwaną ~3,7 roku w partii 30–40 lat; w latach cywilizacyjnych beat wystrzeliwałby ~10 miesięcy
   po L5, czyli praktycznie natychmiast (tabela w §Corrections).
3. **Próg wyzwalacza zostaje L5, mimo że detekcja nasyca się na L4.** *Rekomendacja: TAK* — L5 jest bramką
   **progresji narracyjnej**, nie sensoryczną, a `maxLevel: 6` zostawia jej zapas. **Konsekwencja do przyjęcia
   świadomie: przelotu nie da się przegapić** (§Audit D). Wariant alternatywny (próg L3, gdzie radar ma 6 AU
   i przegapienie jest realne) daje ciekawszą niepewność, ale przesuwa pierwszy kontakt bardzo wcześnie.
4. **Co się dzieje, gdy gracz zestrzeli przelot.** Przelot jest zestrzeliwalny (§Audit C, potwierdzone w kodzie).
   *Rekomendacja: Slice 1 dowozi minimum — modyfikator opinii `first_contact_kill` (duży minus, kanał `opinion`)
   i wpis pamięci; raiser reputacji `aggression +20` z backbone §1.2 zostaje D4*, bo dziś **żaden** raiser
   reputacji nie istnieje (D2 korekta K-2) i pojedynczy wyjątek byłby niespójny.
5. **Jeden beat czy dwa.** `vessel:firstSighting` już emituje popup dla pierwszego wykrycia dowolnego obcego
   statku (§Audit D). *Rekomendacja: Director PRZEJMUJE beat* — dla statku oznaczonego jako przelot pierwszego
   kontaktu generyczny popup jest tłumiony, a gracz dostaje „Nie jesteśmy sami". **Przy okazji trzeba naprawić
   nieserializowany `_reportedVesselSightings`**, inaczej przeładowanie zapisu odpali beat drugi raz.
6. **„Economy executes" zamiast „instant spawn"** (korekta K-1). *Rekomendacja: TAK* — ścieżka ekonomiczna
   już działa dla AI, sama kolejkuje przy braku surowców, `buildTime` fregaty 5.0 daje darmowe napięcie
   dramaturgiczne, a intel dostaje kolejkę, w którą **da się** zajrzeć. **Ryzyko do przyjęcia:** AI bez stoczni
   lub bez techu `point_defense` nie zbuduje nic — dlatego `hullTiers` ma obowiązkowy fallback, a `guard`
   `empireHasShipyard` odsiewa resztę **cicho, ale z wpisem w `DebugLog`** (nigdy po cichu-po cichu).
7. **Nowy typ incydentu dla nacisku, nie reużycie `military_presence`.** *Rekomendacja: TAK* —
   `military_presence` **już się nalicza** przy przybyciu uzbrojonego statku (§Audit H), więc reużycie
   podwoiłoby karę. Nowy id + wpis w `INCIDENT_CHANNELS` + i18n PL+EN.
   **Otwarte pod-pytanie do rozstrzygnięcia: kanał `opinion` czy `tension`?** *Rekomendacja: `opinion`* —
   `tension` prowadzi po drabinie 40/60/80 wprost do automatycznej wojny, a nacisk L1–L2 ma z definicji
   **grozić, nie wypowiadać**. Wtedy L3 (Slice 2, z czasownikami D4) będzie tym, co dopiero rusza napięcie.
8. **Czy Slice 1 otwiera `REACTION_DIRECTOR.md`.** Master plan wymienia go jako companion doc „pending".
   *Rekomendacja: NIE teraz* — ten plan wystarcza Slice'owi 1, a companion doc napisany przed Slice 2/3
   opisywałby czasowniki, których jeszcze nie ma (dokładnie ta klasa błędu, którą audyt R9 nazwał „martwe dane
   czytają się jak funkcja"). Otworzyć go **po gate'cie 3**, z formatem reguł zweryfikowanym na dwóch łańcuchach.
