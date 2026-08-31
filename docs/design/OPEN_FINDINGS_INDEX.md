# OTWARTE FINDINGI — INDEKS PRZEKROJOWY

> **Stan na 2026-08-31** (po zamknięciu W3-32 + 186/187 + **86/87/190** + **188**; otwarte z tych rund: **189**, **191**, **192**, **193**) · **Save v101** ·
> Sweep: **189/189 OK, 0 FAIL, 24 advisory** (`run-all.mjs`).

---

## ⚠ CZYM TEN PLIK JEST, A CZYM NIE JEST — czytaj przed dopisaniem czegokolwiek

**To jest INDEKS, nie rejestr.** Repo ma już regułę zapisaną i kupioną doświadczeniem:
**żadnego siódmego rejestru — finding zamyka się w SWOIM rejestrze macierzystym**
(memory `close-findings-in-their-own-registry`).

Z tego wynikają trzy zasady użycia:

1. **Zamknięcie findingu wpisuje się w rejestrze macierzystym** (mapa numeracji niżej),
   a tutaj **najwyżej** zdejmuje się wiersz. Nigdy odwrotnie.
2. **Nowy finding NIE powstaje tutaj.** Powstaje w rejestrze slice'u, który go znalazł.
3. **Ten plik wolno wyrzucić w całości** bez utraty informacji. Jeśli kiedykolwiek przestanie
   to być prawdą — stał się siódmym rejestrem i trzeba go rozebrać.

**Po co więc istnieje:** numeracja 1-177 jest ciągła przez **sześć** dokumentów, więc pytanie
„co jest dziś otwarte" wymagało przeczytania sześciu plików i trzech osobnych przestrzeni nazw.
Ten plik odpowiada na nie w jednym miejscu — i **grupuje findingi po MECHANIZMIE**, żeby dało się
planować slice'y, a nie tylko je liczyć.

---

## ⚠ DEFEKT SAMEJ NUMERACJI — do rozstrzygnięcia, NIEZASTOSOWANY

**Numery 165 i 166 są użyte DWA RAZY, w tym samym pliku (`VESSEL_ORDERS_PLAN.md`), tego samego dnia.**
Trzy audyty domykały się równolegle i każdy wziął „następny wolny numer".

| nr | wpis **A** (wcześniejszy w pliku) | wpis **B** (tabela audytu Dziennika) |
|---|---|---|
| **165** | obrona orbitalna nie ma PRZEBIEGU (audyt 157) | tekst Dziennika renderowany przy emisji i persystowany |
| **166** | `_handleFleetEngage` — lista wrogów wg kamery (audyt 138/142) | `EnemyAttackHandler` ×4 — polskie literały |

**Rekomendacja (NIE zastosowana — czeka na decyzję właściciela):** wpisy **A zostają** (są starsze
w pliku i mają już odnośniki z `BATTLE_RESULT_CLASSIFICATION_AUDIT.md` oraz
`SYSTEM_SCOPE_138_142_AUDIT.md`), wpisy **B dostają 178 i 179**. Wpis 166B jest już **zamknięty**
(`ffc72fb`), więc przenumerowanie go jest czysto porządkowe; 165B jest **zaparkowany**, więc też nic
nie blokuje.
⚠ Do czasu decyzji w tym pliku obowiązuje zapis **165a/165b** i **166a/166b**.

---

## Mapa numeracji — gdzie mieszka który zakres

| zakres | rejestr macierzysty |
|---|---|
| **1-16** | `W3_PLAN.md` §Findings filed (not fixed in W3) |
| **17-51** | `W3_PLAN.md` §Added at GATE 1/2/3 |
| **52-68** | `AI_CAPTURE_PLAN.md` §Findings filed |
| **69-80** | `docs/audit/COLONY_OWNERSHIP_GATE_AUDIT.md` |
| **81-114 · 126-128 · 159-160** | `COLONY_OWNERSHIP_GUARD_PLAN.md` |
| **115-129** | `UNIFIED_VESSEL_ORDERS_AUDIT.md` §7 |
| **130-158 · 161-185** | `VESSEL_ORDERS_PLAN.md` §7 + §Findings z live-gate'ów |
| **W2 1-14** | `W2_PLAN.md` §Findings filed — ⚠ **OSOBNA przestrzeń nazw**, to NIE te same numery |
| bez numeru | `KOSMOS_backlog_niezrealizowane.md` · `VO3B_PLAN.md` §9 (GATE B2) |

---

## Granica dowodu tego indeksu

**Zweryfikowane W ŹRÓDLE przy tworzeniu pliku** (2026-08-27): `86` · `87` · `90` · `123` (reszta) ·
`W3-1` (**ZAMKNIĘTY** — bramka `isInService` stoi dziś w `MovementOrderSystem:240`, powód
`vessel_in_reserve`, obejmuje wszystkie typy rozkazów) · `W3-2` (**POTWIERDZONY jako otwarty** —
filtr rezerwy jest **tylko** w `_wreckPlayerVesselsInSystem:376`, `_resolveBatchedBattle:76` go nie ma) ·
`W3-7` · `W3-8` · `W3-10` · `124` (**ZAMKNIĘTY** — cztery kłamstwa o doku usunięte przy naprawie 125).

**Przepisane z rejestrów BEZ ponownego pomiaru:** cała reszta. W szczególności **72 · 73 · 84 · 85 ·
91 · 92 · 93 · 94** są po arcu D1-D6 prawdopodobnie latentne albo zdegradowane do higieny, ale
**nie sprawdzałem ich po kolei** — przed planowaniem czegokolwiek z tej grupy trzeba je przemierzyć.

**Niezweryfikowane w przeglądarce:** slice 138+142 ma **live-gate PENDING** (kod wszedł, sweep czysty).

**Zamknięte 2026-08-27** (zdjęte z tego indeksu): 108 · 109 · 110 · 119 · 124 · 137 · 138 · 139 · 140 ·
142 · 150 · 155 · 157 · 160 · 166b-176 · 177 · W3-1 · W2-9.
**Zamknięte 2026-08-29 (runda 2):** **190** (pętla pauzy — domknięta dopiero za DRUGIM podejściem, pierwsza diagnoza obalona pomiarem — ZGŁOSZONA PRZEZ WŁAŚCICIELA w live-gate 86/87 i naprawiona w TYM SAMYM commicie, bo inaczej 87 dowoziłby regresję rozgrywki razem z funkcją) · **86** (termin tożsamości w `BuildingSystem`, G12 zielone bez dotknięcia) · **87** — ⚠ **SPROSTOWANY**: opisany mechanizm NIE ISTNIAŁ (`ColonyManager` nie ma akcesora `colonies`, `git log -S` pusty), skutek był ODWROTNY (brak alarmu o własnej koloni poza macierzystą), a treść wpisu okazała się opisem **pułapki w naprawie**. Trzy kopie martwej gałęzi naprawione razem.

**Zamknięte 2026-08-29:** **W3-32** — ⚠ okazał się zamknięty już **2026-08-18** (`61bdffe`),
czyli DZIEWIĘĆ DNI przed powstaniem tego pliku; wiersz był przepisany bez pomiaru i stał tu jako
pozycja nr 1 rekomendacji. Przy okazji audytu wyszła i została zamknięta jego **stanowa reszta** —
**186** (żywy od pierwszej tury: mgła nad układami AI przebita OR-em nad lustrem `sysData.explored`;
darmowy spis ciał w tierze 3 bez obserwatorium + wejście w widok 3D cudzego układu) i **187**
(ten sam mechanizm na ścieżce przylotu, latentny). Rejestr macierzysty obu: `VESSEL_ORDERS_PLAN.md`
§Findings z audytu W3-32; kanon `src/utils/SystemExploration.js`, keeper
`system_exploration_canon_smoke` 21/21.
⚠ **Wniosek dla tego pliku, nie dla tamtych findingów:** przed planowaniem czegokolwiek z listy
„przepisane bez ponownego pomiaru" **uruchom keeper i `git log -S`**. Jedno wywołanie odjęło cały
slice z kolejki.
**Przeklasyfikowane:** 159 (utajony za flagą) · 165b (zaparkowany).

---

# A · REJESTR PRZEKROJOWY — OTWARTE

Legenda: 🔴 defekt żywy i dotkliwy · 🟠 realny, ograniczony · ⚪ obserwacja/higiena ·
⬜ świadomie zaparkowany lub utajony.

## A1 — Zakres układu („globalne id ≠ położenie"), reszta po 138/142

| # | | opis | uwaga |
|---|---|---|---|
| **151** | 🟠 | `ProximitySystem:187` ma własną koercję `?? 'sys_home'`, która połyka `null` = tranzyt warp | bramkuje **detekcję i intel**, nie tylko walkę |
| **152** | 🟠 | POI **nie ma pola `systemId` w ogóle** | naprawa = nowe pole + **migracja zapisu** |
| **153** | 🟠 | `EmpireLogisticsSystem:240-242` dobiera outposty bez terminu układu, kurier bez warpu | **osiągalność NIEZMIERZONA** |
| **154** | 🟠 | `AutoRetreatSystem._findNearestFriendlyPlanet` dalej bez terminu układu | **ŻYWA** przez trzy przyciski „Powrót do bazy" (`FMO:4581`, `FleetGroupPanel:445`, `FleetCommandPanel:384`) |
| **166a** | 🟠 | `FMO._handleFleetEngage:4534` — lista wrogów wg KAMERY, poziom floty | **ODCZYT, nie pomiar** (D-SS6) |
| **123** | 🟠 | reszta po naprawie: `_calcDistAU` = surowy hypot na dwóch ramkach karmi `reachable` | dwie z trzech ścieżek zamknięte |

## A2 — Prawdomówność rozkazów (slice **ORDER_TRUTHFULNESS**, §7a — uzasadniony i oszacowany)

| # | | opis |
|---|---|---|
| **141** | 🟠 | **30 z 41** powodów odmowy bez klucza i18n; **6 z 15** producentów połyka odmowę całkowicie. Silnik mówi — UI połyka |
| **145** | 🔴 | `OrderService.issueReturn:206` połyka `false` i zwraca `{ok:true}` — **fasada kłamie o sukcesie**, a sama odmowa jest fałszywa (`exploration` bez `returnYear` → NaN → „brak paliwa" statkowi z 27 AU zasięgu) |
| **127** | ⚪ | `vessel:orderIssued` ma ZERO subskrybentów, a tabela w `CLAUDE.md` deklaruje dwóch |

## A3 — VESSEL_ORDERS: to, co zamyka PODPISANY plan (VO-4 = P3 · VO-5 = P5 · VO-6/7 = P4)

| # | | opis | trafia do |
|---|---|---|---|
| **120** | 🟠 | statek w locie ma **jedną** akcję; menu to zaszyty automat na `position.state` | P3 |
| **121** | 🟠 | `moveToPoint` bezpowrotnie gasi panel obcego układu (rekon, kolonizacja, rozładunek, powrót) | P4 |
| **128** | ⚪ | `survey.canExecute` dopuszcza `orbiting`, menu pokazuje wyłącznie w kubełku `docked` | P3 |
| **129** | ⚪ | `arriveAtTarget(a, b)` — drugi argument nie istnieje w sygnaturze | P4 |
| **132** | 🟠 | `drop_troops` bierze cel z `position.dockedAt` bez guardu na `null` | VO-4 (R-8) |
| **133** | 🟠 | `_suspendMissionIfAny` snapshotuje tylko przy `in_transit` — orbitujący kolonizator z `engage` traci misję bez śladu | residuum P1 |
| **134** | ⚪ | `foreign_recon` zaszyty w 3 miejscach poza `VesselManager`/`FMO` (w tym predykat końca gry) | inwentarz P4 |
| **136** | ⚪ | `ExpeditionPanel:453` — latentny (zero importerów) | P4 |
| **144** | 🟠 | `exploration/orbiting_body` **nie ma żadnego samodomknięcia** — statek zajęty na zawsze (zmierzone: 200 lat gry) | **znika z konstrukcji** w P4 |
| **146** | 🔴 | leg powrotny bez rekordu w `MissionSystem` **nigdy się nie kończy**; po ośmiu „Powrotach" dystans do domu **rośnie** | **znika z konstrukcji** w P4 |
| **147** | 🟠 | rozkaz ruchu **kasuje misję statku w skoku warp** — MOS nie ma bramki na `warp_transit` | `OrderService` albo P4 |

## A4 — Pula logistyczna

| # | | opis |
|---|---|---|
| **148** | 🟠 | rozkaz ruchu zostawia zlecenie przypisane: `_driveVessel` bramkuje na `docked`, a rozkaz kończy w `orbiting` ⇒ statek stoi **przy koloni docelowej z ładunkiem** i nie rozładowuje (93 lata, 0 dostarczone) |
| **149** | ⚪ | `removeFromPool` nie zwalnia przydziału — zlecenie dalej wypisuje statek wyjęty z puli |

## A5 — Walka: narracja, rekordy, przebieg, czas

| # | | opis |
|---|---|---|
| **130** | 🔴 | DSCS **rozpuszcza uderzenie AI w chwili starcia**: `_freezeAsStationary` zeruje `mission` bezwarunkowo dla strony B, **bez snapshotu i bez wznowienia** ⇒ `EAH` po bitwie nie rozpozna napastnika |
| **156** | 🟠 | jedna bitwa DSCS-w-wojnie zostawia **DWA rekordy** w `gameState.battles` o niepowiązanych id — i duplikat **idzie do zapisu** |
| **158** | 🟠 | `BattleIntroModal` — zaszyty polski + nagłówki „AGRESOR/OBROŃCA" postawione na indeksach uczestników (to nie są role wojny) |
| **161** | 🟠 | baner bitwy **odpauzowuje ręcznie zapauzowaną grę** — czyta `timeSystem.paused`, a pole nazywa się `isPaused` ⇒ `wasPaused` zawsze `false` |
| **162** | 🟠 | potyczka bez wojny daje **dwie linie Dziennika**, jedna zaszyta po polsku (EAH pisze własny wpis obok kanonicznego `log.battleLine`) |
| **163** | 🟠 | `showBattleOutcome` — drugi blok zaszytego polskiego w tym samym pliku; **najczęściej oglądane okno walki w grze** (także po pominięciu kina) |
| **164** | 🟠 | przełącznik auto-slow **nie ma producenta** — `time:autoSlowToggle` zero nadawców, pole nieserializowane ⇒ gracz **nie może** tego wyłączyć; resztki w `time:display` i `BottomBar` |
| **165a** | 🟠 | obrona orbitalna **nie ma PRZEBIEGU** — jedno `resolveBattle`, brak `vessel:engaged`, brak rund ⇒ walka o stolicę jest wyłącznie wynikiem po fakcie |
| **W3-26** | 🟠 | `playerVesselsToBattleUnit([])` fabrykuje obrońcę `{hp:100, weapons:[]}`; fantom pinowany jako zachowanie silnika, kandydat do balansu |

## A6 — Własność / kolonia: reszta po arcu BRAMKA WŁASNOŚCI

| # | | opis | uwaga |
|---|---|---|---|
| **95** | 🔴 | statek ze stoczni orbitalnej na koloni WTÓRNEJ po utracie stolicy wychodzi jako **obcy kontakt** i nie trafia na listę rozmieszczenia | OBSERWOWANE, **niezbadane** |
| **96** | ⚠ | czy utrata głównej koloni osierocą stację **drugiej** koloni (`transferColony` nie emituje `colony:destroyed`) | niepotwierdzone |
| **F6** | 🟠 | **brak płatnika = flota DARMOWA** — `_resolvePayHomeId` → `null`, `_tickVesselMaintenance` robi `continue` | pin w `fleet_upkeep_payer_smoke`; wymaga **trzeciego szczebla drabiny** |
| **90** | ⚪ | `isTestEnemy` nadal nieserializowane ⇒ `undefined` po każdym wczytaniu | ✔ zweryfikowane |
| **83** | ⚪ | `destroyEmpire:230-238` nie odpina kolonii ⇒ kolonia skasowanego imperium wraca z wczytania jako kolonia GRACZA | dziś debug/sandbox |
| **88 · 89** | ⚪ | dwie migracje kluczują się na `isHomePlanet` i przyznają realne korzyści · **cztery** ścieżki `game:over` kluczują się ENCJĄ, nie flagą | ograniczenie na przyszłość |
| **112** | 🟠 | ekran „CIVILIZATION DESTROYED" **nie ma pojęcia zawijania** — pięć gołych `fillText` w ramce o zaszytych `DW=420, DH=180`; nowy powód ma 100 zn. wobec 49 | helper `_wrapText:2800` istnieje **w tej samej klasie** |
| **113** | 🟠 | ten sam ekran ma **zaszyty polski** (`Czas przetrwania…`, `NOWA GRA`) | wpis SAMODZIELNY wobec 112 (inna przyczyna) |
| **114** | ⚪ | `debugLog.query` pusty przy działającym ekranie — mechanizm sprawny, przyczyna środowiskowa | wartością wpisu jest **reguła**: `debugLog` nie przeżywa restartu sceny |
| **126** | 🟠 | trzy flashe budowy po polsku (`ColonyOverlay:171-173`) | w baseline Findingu 177 |
| **127o** | ⬜ | backlog: lazy-init loadera w `PlanetTextureUtils:16` odblokowałby `ColonyOverlay` pod node | **największa luka testowa repo** |
| **128o** | 🟠 | cztery wejścia nawigacyjne wołają `switchActiveColony` wprost — bezpieczne **przez odmowę**, ale żadne nie oferuje **stanu neutralnego** | stąd UX z GATE OG-3 §3 |
| **72 · 73 · 84 · 85 · 91 · 92 · 93 · 94** | ⚪ | filed przy audycie własności; po D1-D6 prawdopodobnie **latentne albo higiena** | ⚠ **nie weryfikowane po kolei** |

## A7 — Kolonizacja (98-107, BEZ decyzji o zakresie)

| # | opis |
|---|---|
| **98** | kolonia statku rozwiązywana bez filtru własności — ugryzie, gdy kolonia zostanie USUNIĘTA |
| **99** | afordancja kolonizacji **znika** zamiast pokazać się zablokowana z powodem |
| **100** | `MissionSystem.createMission('colonize', …)` ma **ZERO** wołających produkcyjnych |
| **101 · 105** | komentarz `MovementOrderSystem:1857` („orbiting bez `dockedAt`") jest nieprawdziwy — dwa niezależne potwierdzenia |
| **102** | trasa „obca" blokuje POPy załogi **na zawsze** (surowy `_vessels.delete` zamiast `destroyVessel`) |
| **103** | `_redirectInterstellarVessel` omija bramkowanie startu; paliwo **klampuje zamiast odmawiać** |
| **104** | **dwie równoległe implementacje kolonizacji** — wspólna przyczyna 102 i 107 |
| **106** | przycisk kolonizacji zostaje **aktywny** po odmowie (defekt węższy niż pierwotny tytuł „ślepy zaułek") |
| **107** | trasa „obca" **osierocą jednostki w ładowni desantowej** (`troop_bay`) |

## A8 — AI: produkcja, desant, wiedza, zachowanie

| # | | opis | uwaga |
|---|---|---|---|
| **49** | 🔴 | katalog AI **nie ma roli transportowej** ⇒ `no_drop_capable_hull` to jedyna osiągalna odpowiedź złącza bitwa→desant | `AI_DROP_HULL_AUDIT.md` |
| **50** | 🔴 | desant AI biegnie na modelu **LEGACY** (60 HP / 12 atak vs 15 / 7), bez morale i zaopatrzenia | `GROUND_UNITS_AUDIT.md` |
| **65** | 🔴 | **przyczyna 50, w dwóch liniach**: morale legacy `?? 0` przy odejmowaniu vs `?? 100` przy odczycie ⇒ **pierwsze trafienie usuwa jednostkę z gry**. Dotyczy też startowej piechoty gracza | + martwy wyjątek „garnizon się nie wycofuje" |
| **53** | 🟠 | „wieczna inwazja" na placówce gracza — rekord `active:true` nie może wygasnąć i trafia do **każdego** zapisu | |
| **54** | 🟠 | startowy garnizon gracza wisi na **efekcie ubocznym UI**; kolonie wtórne i placówki: 0 jednostek na zawsze | |
| **55** | 🟠 | kolonia macierzysta nie ma siatki do pierwszego otwarcia mapy ⇒ `launchInvasion` zwraca `no_grid` | |
| **56 · 57 · 58 · 59 · 60 · 61 · 64 · 66 · 67 · 68** | 🟠/⚪ | drugi mover (`CombatSystem._tryRetreat`) · martwa dysjunkcja `capitalBase` · kafle placówki **nigdy** nie dostają stempla `owner` · najeźdźcy zostają po przejęciu · `startGroundUnitBuild` bez guardu właściciela · `autoPlaceBuilding` bez guardu placówki · kłamliwy komentarz `HexTile:321` · `_autoSpawnRover` · legacy `infantry` w katalogu · redesign `INVASION_UNIT_POOLS` | |
| **62 · 63** | ⚪ | kolizje `PhysicsSystem` nie są bramkowane scenariuszem (rozjazd z dokumentacją) · `empire:colonyRemoved` brak w `DebugLog.TRACKED_EVENTS` | |
| **W3-2** | 🟠 | `_resolveBatchedBattle` **nie filtruje rezerwy**, a `_wreckPlayerVesselsInSystem` **filtruje** ⇒ kadłub rezerwowy AI walczy, kadłub gracza jest zwolniony z wrakowania | ✔ zweryfikowane w źródle |
| **W3-3** | 🟠 | **AI nigdy nie demobilizuje** — każdy `withdrawVessel` jest po stronie gracza ⇒ rezerwy drenują populację AI monotonicznie | |
| **191** | 🟠 | prognoza kolizji skanuje `activeSystemId` (KAMERA), a włącza ją `getMaxObservatoryLevel()` liczone po WSZYSTKICH koloniach gracza bez terminu układu ⇒ obserwatorium z układu A działa w układzie B, gdy tam patrzysz | rodzina „brak granicy systemu"; kierunek naprawy **projektowy**, nie techniczny. ⚠ **był WARUNKIEM KONIECZNYM 190** (jak 130+Z2) — 190 domknięto zawężeniem czyszczenia, ale pytanie „czy obserwatorium ma widzieć obce układy” zostaje **projektowe**; ✅ **POTWIERDZONY NA ŻYWO** (1 obserwatorium, alerty z 2 układów) |
| **192** | 🟠 | prognoza propaguje **stałe elementy orbitalne** do 700 lat, a świat ma perturbacje; `MARGIN_PERCENT` sztywne niezależnie od horyzontu, a **47 % zagrożeń leży 350+ lat w przyszłość** | zastąpiło **obaloną pomiarem** hipotezę „niepowtarzalność detekcji”; wymaga pomiaru rozjazdu model↔świat |
| **189** | 🟠 | `CivilizationSystem._updateUnrest:1104` czyta prosperity **AKTYWNEJ** koloni dla KAŻDEJ koloni ⇒ kolonie AI wpadają w niepokój, gdy kryzys ma gracz | zmiana **BALANSU** (niepokój globalny → lokalny), własny pomiar; `CivilizationSystem` nie ma referencji do swojego `ProsperitySystem` |
| ~~188~~ | ✅ | **ZAMKNIĘTY 2026-08-31** — mgła wojny STRATCOM rozdzielona na oś MIEJSCA i oś WŁAŚCICIELA (kanon `SystemReveal.js`). ⚠ reweali było **sześć**, nie trzy; nazwa w panelu była już poprawna, wyciekała na mapie | `docs/design/STRATCOM_REVEAL_PLAN.md` |
| **193** | 🔴 | **`IntelSystem._tickPassiveListening` MARTWY od napisania** — czyta `col.systemId` z tablicy **stringów**; `inRange` zawsze `false`, więc „8 lat w 10 ly → rumor" nie odpaliło ani razu | trzecia gałąź klasy Findingu 87; ZMIERZONE wykonaniem. ⚠ ożywić dopiero PO 188 (inaczej wyciek staje się automatyczny) — i to zmiana **tempa gry**, nie higiena |
| ~~194~~ | ✅ | **`debug.dumpIntel()` nie raportował imperiów** — `getAll`/`getEmpireContact` nie istnieją (są `listAll`/`getLevel`); pętla bez obrotu | ZAMKNIĘTY 2026-08-31 przy gate 188; czwarty przypadek klasy 87/193 |
| **W3-4** | 🟠 | `ThreatAssessment` to prawda **globalna**, nie bramkowana intelem; 3 z 7 metod publicznych bez konsumentów | |
| **W3-5** | ⚪ | `director.posture` pisany, serializowany i **czytany przez nikogo**; `director:doctrineAssigned` emitowany w nicość | |
| **W3-6** | ⚪ | jednostka ETA pomylona **12×** (JSDoc civYears vs arytmetyka `gameTime`) — bezwładna po retirementcie W3-8, ożyje z abstrakcyjnymi flotami | |
| **W3-7** | 🟠 | `WarSystem._isPlayerInSystem:556` liczy **każdą** kolonię, w tym AI ⇒ kolonia AI czyni „gracz jest obecny" prawdą. Bezpośrednie wejście do decyzji o ataku | ✔ zweryfikowane w źródle |
| **W3-8** | 🟠 | pasywne odkrywanie rumoru **nigdy nie odpaliło** — `emp.colonies` to tablica **stringów**, więc `col.systemId` = `undefined` ⇒ `inRange` zawsze false, a `PASSIVE_RUMOR_LY/YEARS` są martwe | ✔ zweryfikowane w źródle |
| **W3-9 · W3-10** | 🟠 | `ArmySystem` **nigdy nieaudytowany** (żywy, wpięty, serializowany) · `CombatSystem` **nie ma `serialize` w ogóle** ⇒ po wczytaniu `combat:hexResolved` nie odpala | ✔ 10 zweryfikowane |
| **W3-11 · W3-12 · W3-15** | 🟠 | `offer_peace` bez gałęzi blokady stempluje `peace_refused` i ustawia cooldown, którego kod jawnie zabrania · podstawa `war_status` nieaktualna · `buildScheduledEventPopup` nie czyta per-button `onClick` | **wszystkie trzy to warunki wstępne W4** |
| **W3-13 · W3-14** | ⚪ | historia bitew przycinana do **50** przy serialize (dowody wygasają przy wczytaniu) · martwe powierzchnie krzywiące grepy | |
| **W3-16 · W2-12** | 🟠 | dwa dalsze site'y bez rozproszenia seeda: `DirectorPressure._pickRoamer` · **pierwszy kontakt to zsynchronizowana para sond z jednego namiaru w KAŻDEJ partii** (226°/227°, ZMIERZONE) | sonda `probe-firstcontact-seed.mjs` |
| **W3-23 · W3-27** | ⚪ | bramka portu jest nieaktywna dla AI **tylko przez przypadek katalogu** — dzień, w którym dojdzie cięższy szablon, AI zacznie **cicho** odmawiać startów · AI ma **jeden skok bez limitu odległości** | |
| **GATE B2 (a)** | 🟠 | **produkcja okrętów AI stoi na głodzie komodytów** — `startShipBuild` zwraca `queued`, a `ORDER_TTL_DISPLAYED_YEARS = 3.0` kasuje zlecenie **cicho** (`director:orderExpired`) | `VO3B_PLAN.md` §9 · **rodzina:** `docs/BALANS_PHASE2_AI.md` §4.1/§4.2/§5 — połowa PLACÓWKOWA tej samej rodziny, ZMIERZONA i zapisana jako naprawiona w BALANS Phase 3; ta (okrętowa) jest obserwacją PO tych fiksach. Warunek wstępny: **178** |
| **GATE B2 (Z2)** | 🟠 | rajder AI po uderzeniu **parkuje w układzie gracza i bije co cooldown** — bez powrotu do domu, bez tankowania, bez ryzyka przechwycenia na własnej granicy | `VO3B_PLAN.md` §9 |
| **178** | 🟠 | **kurierzy AI: wysłano ≫ dostarczono** (HEAD 12→2, 12→2, 8→0; `214127a` 14→4, 14→4, 11→1) — obecne po OBU stronach A/B ⇒ **stan zastany, nie regresja**; 4/8 imperiów buduje ZERO kurierów; zatrzask `pendingBuildRoute` zapalony na koniec mimo W1-6. ⚠ **zmierzony LICZNIK `stats.delivered`, NIE przepływ towaru** — pierwszy krok to porównanie magazynów placówka↔stolica (klasa 106). ⚠ **Poszerzone 2026-08-28:** kanału NIE MA dla **całej klasy towarów wytwarzanych** — `_loadByRarity` ładuje wyłącznie `MINED_RESOURCES`, a trasa jest jednokierunkowa (outpost → stolica) ⇒ wtórne kolonie AI nigdy nie dostają komponentów; pomiar przepływu potwierdzi zero **z definicji** | `VESSEL_ORDERS_PLAN.md` §Findings z A/B ekonomii AI · sonda `probe-ai-economy-health.mjs` · kandydat na warunek wstępny **GATE B2 (a)** |
| **179** | ⚪ | kolonizacja **bota referencyjnego** pada na `2335c4b` (VO-2): mediana ciał gracza 5 → 1, w 8/8 seedach, AI nietknięte. ⚠ **bot headless, NIE ścieżka UI** — właściciel gra regularnie i objawu nie widzi, VO-2 przeszedł live-gate ⇒ **nie cytować jako bug rozgrywki**. Zapisane, bo przekrzywia punkt odniesienia panelu BALANS | niski priorytet, decyzja właściciela 2026-08-28 |
| **180** | ⬜ | **(d) BRAK PROCESU — paliwo AI.** `_scanFuelDemand()` zwraca `[]` bezwarunkowo (paliwo to produkt rafinerii, nie fabryki); obie rafinerie są dla AI otwarte technologicznie (`exploration` w `startingTechs`, `popCost: 0`, koszt trywialny), ale `BUILD_PRIORITY` to zamknięta lista 10 pozycji **bez rafinerii** (grep `refinery` w warstwie decyzyjnej AI = 0). Kurier nie uniesie towaru (`MINED_RESOURCES` only), trasa jednokierunkowa. `H` ma `rarity: 5` ⇒ zwożony pierwszy i nieprzetwarzany (żywa gra: `emp_001` H = 78 620 przy `fuel` = 0) | **UTAJONY** — statki AI zwolnione z bramek paliwowych (`canReach:588`, `canJump:818`), więc dziś nic nie blokuje. ⚠ Gate na tej naprawie **zmierzy ciszę**, dopóki zwolnienie stoi; naprawa ma sens tylko RAZEM ze zdjęciem zwolnienia. Klasa W3-23. NIE rodzina B2(a) (grep: `fuel` poza kosztami statków). `VESSEL_ORDERS_PLAN.md` §Findings z A/B ekonomii AI |
| **183** | 🟡 | **wyciek drzewa technologii gracza do placówek AI** (`EmpireColonyBootstrap:385-390`) — ZMIERZONE tożsamościowo: **każda placówka AI** czyta `window.KOSMOS.techSystem` (drzewo GRACZA), pełne kolonie czytają własne `aiTech` | trop z diagnozy (c); zakres skutku niezmierzony (czy placówki w ogóle czytają techy) — **do sprawdzenia PRZED slice'em (c)** |
| **184** | 🟡 | **deklarowana bramka tech ≠ egzekwowana — 4 z 12 towarów, u GRACZA tak samo jak u AI** — `isRecipeAvailable` to OR trzech gałęzi, a `isCommodityUnlocked` przebija `requiresTech`: `android_worker`←`robotics` (w `startingTechs` AI, więc otwarte od pierwszej tury), `antimatter_cells`←`antimatter_containment`, `quantum_processors`←`quantum_physics`, `warp_cores`←`warp_drive` | **pytanie PROJEKTOWE, nie bug** — która strona jest prawdą, rozstrzyga projektant. ⚠ `requiresTech` **nie jest wiarygodnym opisem bramki**; efektywną czytać z OBU źródeł |
| **185** | 🟠 | **`military_supplies` nieosiągalne dla OBU archetypów AI** — wydzielone z 181 przy jego zamykaniu. `military_logistics` (150 rp) nie ma w żadnym planie badań, a jej prereq **`ground_warfare` też jest spoza kolejki**, więc koszt to cała gałąź, nie 150 rp. Brak obejścia przez `unlockCommodity`. Towar zasila zaopatrzenie naziemne (`BuildingsData:765`) i magazyn statku zaopatrzeniowego (`ShipsData:132`) | **świadomie poza zakresem** (F4). ⚠ Należy do slice'u **GROUND** (rodzina 49/50), nie do ekonomii AI. ⚠ Wycenić dopiero po sprawdzeniu, czy jednostki naziemne AI w ogóle czytają ten towar — legacy model z 50 może go omijać |

## A9 — Higiena dokumentacji / i18n / zapis

| # | | opis | uwaga |
|---|---|---|---|
| **165b** | ⬜ | tekst wpisu Dziennika renderowany PRZY EMISJI i persystowany (200 wpisów w save) ⇒ po zmianie języka Dziennik jest dwujęzyczny **z konstrukcji** | **jedyna pozycja z bumpem zapisu**; zaparkowana decyzją właściciela |
| **167 residuum** | ⚪ | gałąź macierzysta pokazuje nazwę **PLANETY** w miejscu nazwy **UKŁADU** | widoczne w każdej bitwie u siebie |
| **159** | ⬜ | `map_body` ma tę samą klasę co 109, ale `commandTacticalMap:false` ⇒ **utajony**, wraca z flagą | NIE planować |
| **dług baseline `check-i18n`** | 🟠 | **62 napisy w 11 plikach UI** siedzą w zapadce Findingu 177 (w tym 112/113/126 i 9 w martwym `PlanetScene`) | zapadka nie pozwala go **powiększyć**; spłata = osobna praca |
| **76 · 93** | ⚪ | `BuildingSystem.deployFromCargo()` z `CLAUDE.md` **nie istnieje** · liczba keeperów w `CLAUDE.md` nieaktualna (dziś **186**) | Załącznik A przy sprzątaniu |
| **niezweryfikowane** | ⚪ | czy `combat:round` / `combat:hexResolved` mogą odpalić dla walki **AI-vs-AI** (handler zakłada udział gracza) | |

---

# B · REJESTR W2 — osobna numeracja 1-14

| # | opis |
|---|---|
| **1** | historyczny wyciek załogi w zapisach v100 (Decision 8 grandfathers) — pozycja BALANS, jeśli się ujawni jako nierekrutowalny POP |
| **2** | `ActionCatalog` **podwójnie martwy** — każda akcja `BUILD_SHIP` harnessu jest odrzucana; filtr `status === 'docked'` na wartości, której `status` nigdy nie przyjmuje |
| **3** | `FleetPictureLogic` — **zero pokrycia** przy sześciu konsumentach i statusie „single source of truth" dla każdej soczewki floty |
| **4** | `ShipyardOverlay:435` czyta **globalne** `freePops`, gdy reszta pliku czyta aktywną kolonię |
| **5** | dwie **martwe** powierzchnie stoczniowe lustrzane wobec żywej (`FleetTabPanel`, `FMO._drawLeftFleets`) — grep prowadzi do złego pliku |
| **6** | **trzy formuły „netto Kr/rok" już się nie zgadzają** (`NavPeekProviders:125`, `ColonyOverlay:2111`, vs Civ/Economy) |
| **7** | obowiązek re-pomiaru R-2 (`BORDER_LY` ≥ 60 lat wyświetlanych, outposty osobno od kolonii) |
| **8** | cap magazynu **nie ma mierzalnego podmiotu** — „hoarding at scale" jest dla AI dziś nieosiągalny |
| ~~**9**~~ | ✅ **ZAMKNIĘTE 2026-08-27** (`ed084da`, N1 — `_tickArrearsRetry`, wyjście z zaległości w ciągu miesiąca gry) |
| **10** | materializowane floty AI omijały model załogi — ⚠ **temat w większości rozpuszczony przez retirement W3-8**; residuum: sonda pierwszego kontaktu + spawnery debug |
| **11** | wariancja ekspansji AI należy do **imperium i seeda**, nie do progu silnika |
| **12** | patrz W3-16 — pierwszy kontakt bez rozproszenia seeda |
| **13** | wiersz dzwonka mobilizacji **nie otwiera niczego** (`default: return;`), a subtitle fizycznie się nie mieści (320 px, `nowrap`) |
| **14** | deploy-pod-zaległością ma **dwie przeciwne konwencje** jednej odmowy — `ShipyardOverlay` chowa hit-zonę, `FMO` rejestruje ją i odmawia do Dziennika |

⚠ **W2 §Pułapka 2 — niezaadresowana:** `_tickRepair` szuka stoczni po `entry.buildingId`, a wpisy
`BuildingSystem._active` mają `entry.building.id` ⇒ **naprawa statków jest martwa u wszystkich**.
Włączenie jej to zmiana balansu, własny commit i własny pomiar.

---

# C · Bez numeru

**Podwójne pobranie Kr za jednostki naziemne** (`KOSMOS_backlog_niezrealizowane.md`, ZMIERZONE,
świadomie nienaprawione). `ColonyManager._tickGroundUnitUpkeep:1543-1546` odejmuje kredyty **ręcznie**
i emituje `trade:spendCredits`, które ma żywego odbiorcę.
⚠ Bogata kolonia płaci **2×**, biedna **1×** (bramka salda `CivilianTradeSystem:879`) — bez tego niuansu
pomiar wygląda na losowy. Kadencja w latach **cywilizacyjnych** = 12 rozliczeń na rok gry.
Bliźniak przy rekrutacji (`:1441-1442`) **niezmierzony**; trzy inne miejsca używają przeciwnej konwencji.
⚠ **Keeper naprawy MUSI mieć bogatą kolonię w fixture** — inaczej bramka salda ukryje drugie pobranie
i test przejdzie **jałowo**.

---

# D · CO SIĘ ŁĄCZY, A CO NIE

> Ocena po **MECHANIZMIE**, nie po podobieństwie tytułów. Wzorzec: rozstrzygnięcie 110/159/160 —
> trzy findingi o „mapie STRATCOM", z których dwa nie miały ze sobą nic wspólnego.

## D1 — Łączyć

### ① `130` + GATE B2 `Z2` — slice „AI wraca po ataku" ⭐ najmocniejszy merge na liście
Wyglądają na dwa tematy (state-clobber w DSCS vs brakująca reguła Directora), ale **130 jest
warunkiem koniecznym Z2**: `_freezeAsStationary` zeruje misję rajdera bez snapshotu, więc rajder,
który miałby wrócić do domu, **nie ma czym** — zostaje z `movementOrder` w `active` na zawsze
(ta sama obserwacja stoi w `RETREAT_TARGET_PLAN` §Poza zakresem: strona AI nie ma snapshotu ani
wznowienia, gracz ma). Reguła powrotu napisana bez 130 **nie widziałaby własnej przesłanki**,
a gate zmierzyłby ciszę.

### ② `49` + GATE B2 `(a)` — slice „AI ma czym desantować"
Różne przyczyny, **identyczny widoczny skutek**: AI nigdy nie wystawia transportowca. Sam wpis
w katalogu i tak umrze na głodzie komodytów i TTL 3 lat ⇒ **naprawa pojedyncza wyglądałaby jak brak
naprawy**. Idą razem albo wcale.

### ③ `50` + `65` + `56` + `54` + `58` + `67` + `68` — slice **GROUND**
`65` jest **przyczyną** `50` (dwie linie: `?? 0` vs `?? 100`). `56` to drugi mover, który GROUND
obudzi. `54`/`58` to warunki wstępne uczciwego pomiaru (kto w ogóle ma jednostki, czyj jest kafel).
`67`/`68` to redesign katalogu. **Jeden slice balansowy, nie siedem poprawek.** Dołącza tu S12
(morale) i R13 (RNG) z wcześniejszych rejestrów.

### ④ `141` + `145` + `127` — slice **ORDER_TRUTHFULNESS** (już uzasadniony w §7a)
Jeden chokepoint (`MOS.issueOrder:181-246` — wszystkie 9 gałęzi `_issueX` wychodzi tym samym
`return`), jeden konsument w `UIManager`, gotowy wzorzec w repo (`_toastReturnFailed` +
`_warpErrLabel`). `145` wchodzi, bo to **odmowa raportująca sukces** — ta sama powierzchnia.
⚠ **Rozdzielić na wejściu:** część „powiedz powód" jest tutaj, **korzeń NaN-a** (`exploration`
bez `returnYear`) należy do **P4**.
⚠ Trzy rzeczy do nazwania w podpisie (zmierzone): chokepoint **nie pokryje** odmów sprzed wejścia
do MOS ani blokad w locie · konieczny filtr `isEnemyVessel` · ryzyko **podwójnego komunikatu**
przy producentach fan-out.

### ⑤ `161` + `164` — mini-slice „gracz odzyskuje kontrolę nad czasem"
Oba na styku `TimeSystem` ↔ UI, oba drobne, i **oba wymagają tej samej decyzji**: czyja wola
wygrywa o zegar. `164` ma nierozstrzygnięty zakres (podłączyć przełącznik vs wyciąć resztki) —
rozstrzyga się go **raz, dla całej powierzchni**.

### ⑥ `112` + `113` + `158` + `163` + `162` + `126` — spłata baseline i18n na ekranach o najwyższym ruchu
Wszystkie siedzą w tej samej zapadce (Finding 177) i wszystkie to jeden rodzaj edycji.
`112` to inny **mechanizm** (brak zawijania), ale **te same pięć `fillText`** — rozdzielenie
znaczyłoby dotknięcie tej funkcji dwa razy. `162` wchodzi, bo naprawą jest **skasowanie wpisu EAH**
(kanoniczny `log.battleLine` już go pokrywa), a nie tłumaczenie.
⚠ `DH = 180` zostawia ~20 px zapasu ⇒ zawinięty powód **zderzy się** z linią niżej; to jest praca,
nie jednolinijkowiec.

### ⑦ `154` + `166a` — granica układu w selektorach POZIOMU FLOTY
Ten sam kształt naprawy co zamknięte `138`/`142`, z gotowym wzorcem (`systemIdOf`, **fail-open** —
nie `getByTypeInSystem`, które jest fail-CLOSED) i gotowym keeperem.
⚠ Cena: `154` dotyka przycisku używanego w normalnej grze — to decyzja o **promieniu rażenia**,
nie konflikt mechanizmu.

### ⑧ `148` + `149` — księga przydziałów `TransportOrderSystem`
Oba to „przydział nie zostaje zwolniony", jeden plik, jeden keeper.

### ⑨ `95` + `96` — jeden **AUDYT**, nie slice naprawczy
Dzielą scenę i jedną sesję pomiarową u właściciela. Obie są **obserwacjami**, nie pomiarami —
naprawa bez pomiaru byłaby zgadywaniem.
⚠ Kontekst czyniący `95` prawdopodobnym: `createAndRegister:186-211` **nigdy** nie stempluje
własności, więc stempel wroga musi pochodzić **skądinąd** — i to trzeba znaleźć.

### ⑩ `podwójne Kr` + `F6` — przecieki pieniądza
Oba to realny **przepływ** (nie wyświetlanie) i oba wymagają tego samego kształtu dowodu:
**kredyty w czasie, nie zwrotka**. `W2-6` (trzy niezgodne formuły) można dołożyć jako trzeci,
ale to warstwa prezentacji — inny rodzaj dowodu.

## D2 — NIE łączyć, i dlaczego konkretnie

| nie łączyć | powód (mechanizm, nie gust) |
|---|---|
| `151` z `152`/`153`/`154` | **`151` ma ODWROTNY kierunek fail** (fail-closed dla walki vs fail-open dla rozkazów) — jeden podpis nie może zawierać dwóch przeciwnych odpowiedzi na to samo pytanie. Do tego `151` bramkuje **intel**, więc jego gate mierzy co innego. Rozstrzygnięte pomiarem w `SYSTEM_SCOPE_138_142_AUDIT.md` §5.3 |
| `152` z czymkolwiek | to **brak POLA**, nie zły filtr ⇒ naprawa = dodanie pola + **migracja zapisu**, czyli decyzja o zakresie |
| `153` z czymkolwiek | **osiągalność niezmierzona** — gate zmierzyłby ciszę. Najpierw pomiar, czy AI w ogóle zakłada outposty poza układem stolicy |
| `156` z narracją (`158`/`162`/`163`) | `156` dotyka **treści zapisu**, reszta to napisy. Wspólny slice zamieniłby zerowe ryzyko w ryzyko formatu |
| `165a` z `164` | `165a` to **zmiana projektu** (dać EAH przebieg albo przenieść obronę orbitalną na potok DSCS, z własnym pomiarem tempa); `164` to podłączenie przełącznika. Wspólny gate nie umiałby powiedzieć, co zadziałało |
| `146`/`144`/`121` osobno od **P4** | kuszące, bo bolą — ale **znikają z konstrukcji**, gdy `foreign_*` dostanie rekord w `MissionSystem`. Naprawa punktowa to praca do wyrzucenia |
| `W3-11` z czymkolwiek dziś | to **warunek wstępny W4**, nie samodzielny defekt: bez stołu pokojowego nie ma czego nim zepsuć |
| `W3-7` z `W3-8` | brzmią jak jedna „wiedza AI", ale `7` to bramka **decyzji o ataku** (zmiana zachowania AI = balans), a `8` to zwykły bug typu (tablica stringów) o zerowym ryzyku. Sklejenie podniosłoby taniemu fixowi próg dowodu do gate'u balansowego |
| `98-107` jako „kolonizacja" | to nie jest jedna rzecz: `100`/`102`/`104`/`105`/`107` **rozpuszcza P4** · `99`/`106` to UI/afordancja · `98` to własność · `103` to bramkowanie startu. Wspólny slice odtworzyłby dokładnie stan, który `104` opisuje jako defekt |

## D3 — Osobno, bo tak zdecydował właściciel albo bo to nie jest defekt

`165b` (zaparkowany; jedyny bump zapisu) · `159` (utajony za flagą) · `127o` (backlog: lazy-init
loadera) · `W2-7` / `W2-8` / `W2-11` (obowiązki **pomiarowe**, nie usterki) · `114` (środowiskowe —
wartością jest zapisana reguła, nie naprawa).

---

# E · Rekomendacja kolejności — trzy pozycje, każda z innego powodu

1. ~~**`W3-32`**~~ — ✅ **wykonane 2026-08-29**, a właściwie: **zamknięte 2026-08-18**, o czym ten
   plik nie wiedział. Audyt dowiózł zamiast tego jego stanową resztę (186 + 187). Wiersz zostaje
   jako ślad procesowy: **pozycja nr 1 rekomendacji była nieaktualna**, bo przepisano ją z rejestru
   bez uruchomienia keepera.
2. **`87` + `86`** — dwa **zmierzone w źródle** przecieki „kolonia AI wpływa na grę gracza":
   jeden **pauzuje grę fałszywym alarmem o utracie stolicy**, drugi zabiera **−30 % produkcji**.
   Ta sama rodzina co domknięty arc własności, ta sama tania naprawa, ten sam kształt keepera.
3. **① `130` + `Z2`** — bo dopóki rajder parkuje z wyzerowaną misją, **każdy pomiar tempa wojny
   mierzy artefakt**.

⚠ **Kolejka wielosesyjna uzgodniona z właścicielem 2026-08-29:** (1) szybka seria `W3-32` →
`87`+`86` → `130`+`Z2`; (2) `151` · `152` · `153` · `154` **osobno**, każdy z innego powodu
wykluczenia (§D2); (3) trzy duże sloty pełnym cyklem audyt→pomiar→plan→implementacja→live-gate:
**GROUND** (49, 50, 65, 56, 54, 58, 67, 68 + `185`) · **kolonizacja** (98-107, ⚠ §D2: to NIE jest
jedna rzecz — zakres rozstrzygnąć na wejściu) · **ORDER_TRUTHFULNESS** (141, 145, 127).

---

## Utrzymanie tego pliku

- **Zamknąłeś finding?** Wpisz to w rejestrze macierzystym (mapa numeracji wyżej), a **tutaj zdejmij
  wiersz**. Nigdy odwrotnie.
- **Znalazłeś finding?** Zapisz w rejestrze slice'u, który go znalazł. Tutaj **co najwyżej** dopisz
  wiersz z odsyłaczem.
- **Ten plik nie jest źródłem prawdy o niczym.** Przy rozbieżności wygrywa rejestr macierzysty.
