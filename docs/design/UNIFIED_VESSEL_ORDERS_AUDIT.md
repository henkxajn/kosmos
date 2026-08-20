# AUDYT — model rozkazów floty: dlaczego statek nie jest wolny (nigdzie, nie tylko w obcym układzie)

**Data:** 2026-08-20 · **Zakres:** read-only, **zero zmian w kodzie**. **Zero propozycji do wdrożenia teraz** —
to materiał wejściowy pod decyzję o zakresie osobnego arca.
**Metoda:** odczyt źródeł + **pomiar WYKONANIEM** na headless `GameCore` (6 sond, `scratchpad/probe-orders*.mjs`,
poza repo). Gra NIE była uruchamiana. Każde twierdzenie oznaczone: ZMIERZONE (wykonaniem) / ODCZYTANE (ze źródła).
**Numeracja findingów:** ciągła po 114 (`AI_CAPTURE`) ⇒ **od 115**.
**Zlecenie:** 6 pytań właściciela — odpowiedzi w §0, dowody w §1-§6.

---

## §0 WERDYKT — sześć odpowiedzi na wejściu

> ## 🔑 JEDNO ZDANIE
> **Gra ma dwie niezależne prawdy o tym, gdzie jest statek — `vessel.position` (fizyka) i rekord ekspedycji
> w `MissionSystem` (kalendarz) — i NIC ich nie spina. Menu akcji jest zaszytym automatem na `position.state`,
> a nie funkcją tego, co statek POTRAFI.** Wszystko, na co właściciel się skarży, wypada z tych dwóch zdań.

| # | pytanie | odpowiedź |
|---|---|---|
| **1** | Czym różni się model rozkazów w domu od obcego? | **Różnica jest ARCHITEKTONICZNA, ale NIE tam, gdzie jej szukano.** Nie ma „silnika domowego" i „silnika obcego" dla ruchu — jest **jeden** `MovementOrderSystem` i **jedno** menu (`getAvailableActions`), identyczne w obu układach. Rozjazd jest w **misjach**: `MissionSystem` (dom) i **drugi, nieformalny silnik misji w `VesselManager`** (`_redirectInterstellarVessel` / `_startForeignRecon` / `_startForeignColonize` / `_startForeignUnload`, 6 metod + własny tick). Obcy układ dostał je, bo `MissionSystem` jest **z konstrukcji zakotwiczony w `homePlanet`** — ZMIERZONE (§1.3). ⇒ **Nie „brakujące bramki w jednym miejscu", ale też nie dwie warstwy rozkazów: dwie warstwy MISJI.** |
| **2** | Czy nowy rozkaz naprawdę przerywa starą misję? | **NIE. I to NIE jest problem obcych układów — to jest wszędzie, w układzie macierzystym też.** Pięć osobnych mechanizmów, wszystkie ZMIERZONE w `sys_home` (§2): duch misji, który dokonuje dostawy pod nieobecność statku · duch, który **TELEPORTUJE** statek · automatyczne **wznowienie** starej misji po pościgu · trwały ślad rozkazu blokujący pulę logistyczną · pułapka kasująca cały panel obcego układu. ⚠ Podejrzenie właściciela jest **potwierdzone i było już raz częściowo naprawione** — patrz `moveto_no_return_smoke.mjs` (§2.3). |
| **3** | Ile miejsc bramkuje akcje `mission.phase`/`type`? | **11** miejsc, w których `mission.type`/`phase` decyduje, czy gracz DOSTANIE akcję (§3.2). ⚠ Ale to **nie jest** miara głębokości ograniczenia. Realna miara to **58 bramek na stanie FIZYCZNYM** (`position.state` / `status`), z czego **30 siedzi w `FleetActions.js`** (§3.1). `mission.phase` to cienka skorupa na obcym układzie; gorset to `position.state`. |
| **4** | Najmniejsza zmiana modelu? | **Pięć ruchów, cztery chokepointy** (§4): P1 jedna funkcja `_preempt` · P2 przylot = własność STATKU, nie kalendarza · P3 menu z możliwości, nie z kubełka · P4 `foreign_*` → zwykłe akcje · P5 `OrderService.issueColonize`. Trzy z nich to **usunięcie** kodu, nie dopisanie. |
| **5** | Ile to realnie kosztuje? | **Decyzji jest mało, miejsc dużo.** 4 chokepointy logiki (~150 linii netto) + **58 bramek do indywidualnego przesądzenia** (zostaw / rozluźnij / skasuj) + retirement ~455 linii `foreign_*`. Save: **prawdopodobnie bez bumpu** (kształt pól bez zmian). ⚠ Największy koszt nie jest w kodzie: **12 keeperów pinuje DZISIEJSZE zachowanie**, w tym jeden pinuje wprost to, co ma zniknąć (§5.4). |
| **6** | Czy to rozwiązuje Finding 111? | **NIE — i to trzeba powiedzieć wprost.** Rozwiązuje **przesłankę**, na której 111 stoi (kolonizacja przestaje być bramkowana fazą misji i stanem doku), ale **sam predykat `canReverseFate` zostaje bez zmian** — dalej liczy ISTNIENIE kadłuba, nie ZDOLNOŚĆ. Po tej zmianie 111 staje się **mniejszy** (trzecia konfiguracja „zadokowany gdzie indziej" przestaje być martwa), ale **nie znika**. Szczegóły i dowód: §6. |

---

## §1 DOM vs OBCY UKŁAD — co naprawdę się różni

### 1.1 Warstwa RUCHU jest wspólna — i to jest dobra wiadomość

`MovementOrderSystem` nie wie nic o „domu". Jedyna asymetria to bramka układu (`isSameSystem`, W3-4b),
która **odmawia** rozkazu na cel z innego układu — poprawnie, bo współrzędne są lokalne. Wszystkie osiem typów
rozkazu (`moveToPoint`, `pursue`, `intercept`, `engage`, `retreat`, `dock`, `goToPOI`, `patrol`, `escort`, `attack`)
działa w obcym układzie **identycznie**.

**ZMIERZONE (T8):** statek postawiony w stanie „przyleciał warpem i został skierowany na ciało"
(`mission.type='exploration'`, `phase='orbiting_body'`) przyjmuje `moveToPoint` bez mrugnięcia:
`{"ok":true,"orderId":"mo_4"}`.

### 1.2 Warstwa MENU jest wspólna — i to jest zła wiadomość

`getAvailableActions` (`FleetActions.js:610`) to **zaszyty automat na trzech kubełkach**:

```
position.state === 'docked'     → orbit, load_troops, survey, deep_scan, colonize,
                                   load_colonists, transport, transport_passenger, found_outpost
position.state === 'orbiting'   → load_troops, drop_troops, orbital_strike, full_scan,
                                   send_away_team, collect_away_team, return_home, redirect,
                                   transport, dock_station
position.state === 'in_transit' → return_home
```

**ZMIERZONE (T7b — prawdziwy lot, bez ręcznego mutowania stanu, `hull_medium` z habitatem i ładownią):**

| stan | menu (` ` = dostępne, `~` = zablokowane) |
|---|---|
| `docked` | `orbit  colonize  load_colonists  transport  transport_passenger  found_outpost` — **6 dostępnych** |
| `in_transit` | `return_home` — **1 pozycja, i tyle** |
| `orbiting` (po przylocie) | `return_home  redirect  transport` — **3** |

> 🔴 **Statek w locie ma DOKŁADNIE JEDNĄ akcję.** To nie jest „mniej swobody w obcym układzie" — to jest
> brak swobody **wszędzie**, po prostu w domu gracz częściej ma statek w hangarze i tego nie widzi.

Ten automat karmi **trzy** UI naraz — `FleetManagerOverlay`, `FleetTabPanel`, `FleetPanel` — więc jest
**jednym chokepointem** (dobra wiadomość dla kosztu, §5).

⚠ **Kubełek NIE jest tym samym co bramka akcji.** `ACTIONS.survey.canExecute` dopuszcza `orbiting`
(`FleetActions.js:63`), ale `getAvailableActions` pokazuje `survey` **wyłącznie** w kubełku `docked`
(`:640`). Zgoda istnieje i jest nieosiągalna. ⇒ **Finding 128.**

### 1.3 Warstwa MISJI jest rozdwojona — i to jest właściwa diagnoza

| | **układ macierzysty** | **obcy układ** |
|---|---|---|
| właściciel logiki | `MissionSystem` (2751 lin.) | **`VesselManager`** (6 metod: `_redirectInterstellarVessel:2839`, `_startForeignRecon:2907`, `_tickForeignRecon:3000`, `abortForeignRecon:3139`, `_startForeignColonize:3172`, `_startForeignUnload:3253`) |
| wejście z UI | `FLEET_ACTIONS` → `expedition:*Request` | **7 własnych hit-zon** w `FleetManagerOverlay` (`case 'foreign_*'`, `:2324-2385`) |
| bramka widoczności | `position.state` (kubełek) | **`mission.type==='exploration' && mission.phase==='orbiting_body'`** (`FMO:7405`) |
| kolonizacja: tech `colonization` | **wymagana** (`_launchColony:601`) | **NIE wymagana** (`_startForeignColonize` — brak testu) |
| kolonizacja: koszt startowy | **wymagany** (`COLONY_LAUNCH_COST`, `:648`) | **brak** |
| kolonizacja: zwolnienie załogi | `destroyVessel` → `releaseCrew` | **`this._vessels.delete()`** — omija (Finding 102/107) |
| dystans / paliwo | **od `homePlanet`** (§1.4) | od statku (`:2857`) |

**Dlaczego tak się stało — przyczyna jest jedna i konkretna:** `MissionSystem._calcDistance` (`:2674`) liczy
odległość **od `window.KOSMOS.homePlanet`**, a nie od statku. Dla statku w obcym układzie to jest liczba bez
znaczenia fizycznego, więc obcy układ **musiał** dostać własną arytmetykę — i dostał ją w `VesselManager`.

### 1.4 Kotwica w `homePlanet` — ZMIERZONE (T10)

Statek postawiony **dokładnie przy celu** (dystans rzeczywisty `0.000 AU`):

```
_calcDistance(cel) = 1.813 AU      ← tyle wyceni misja
realny dystans statek→cel = 0.000 AU
```

Ta sama liczba idzie w `travelTime`, `fuelCost` i pre-check paliwa dla `colony`, `mining` i `recon`.
`_launchTransport` (`:836-846`) **już to naprawił** dla siebie (liczy od `vessel.position`), reszta nie.
⇒ **Finding 122.**

### 1.5 Werdykt §1

> Różnica dom↔obcy **nie jest** „brakującymi bramkami w jednym miejscu" ani „dwoma systemami rozkazów".
> To **jedna warstwa ruchu, jedno menu — i dwa równoległe silniki MISJI**, z których drugi powstał wyłącznie
> dlatego, że pierwszy mierzy świat od planety macierzystej. Ujednolicenie zaczyna się od kotwicy, nie od UI.

---

## §2 CZY NOWY ROZKAZ PRZERYWA STARY — pięć mechanizmów, wszystkie zmierzone w `sys_home`

**Odpowiedź: nie przerywa. `MovementOrderSystem.issueOrder` (`:176-243`) nie woła `cancelOrder`, nie dotyka
rekordu w `MissionSystem`, nie czyści `vessel.pendingOrder`. Nadpisuje `vessel.movementOrder` i `vessel.mission`
i tyle.** Zdarzenie `vessel:orderIssued`, którym taka preempcja mogłaby biec, **nie ma ani jednego
subskrybenta** (grep całego `src/`) — mimo że tabela w `CLAUDE.md` deklaruje dwóch. ⇒ **Finding 127.**

### 2.1 🔴 DUCH MISJI — ekspedycja dostarcza pod nieobecność statku (ZMIERZONE, T1+T4)

Rekord w `MissionSystem` żyje własnym życiem, bo `_checkArrivals` (`:1447`) porównuje **wyłącznie kalendarz**:
`if (exp.status === 'en_route' && this._gameYear >= exp.arrivalYear)`. Ani słowa o tym, gdzie jest statek.

```
misja `mining` → entity_2 (-166.0, -62.0), arrival = 1.301
gracz wydaje moveToPoint → (169.2, -39.6)          ← w PRZECIWNĄ stronę
PO ROZKAZIE:  vessel.mission.type = move_to_point  |  exp.status = en_route   ← NIE anulowana
PO TIKU:      exp.status = orbiting
              exp.gained = {C:22, Fe:30, Si:30, Cu:16, Ti:5, Li:5, Hv:5}
              vessel: mission=null, dockedAt=null, pozycja (169.2, -39.6)
```

**Kontrola na SKUTEK, nie na bramkę (T4)** — delta magazynu kolonii: **`{Fe:+30, Si:+7.12, Ti:+5}`**,
przy statku oddalonym od celu misji o **3.05 AU**. ⇒ **Finding 115.**

### 2.2 🔴 TEN SAM DUCH TELEPORTUJE STATEK (ZMIERZONE, T5)

Gdy duch odpali **przed** dotarciem nowego rozkazu, `_processArrival` woła `vMgr.arriveAtTarget` (`:498`),
a ta metoda snapuje pozycję do `vessel.mission.targetX/Y` — czyli do celu **NOWEGO** rozkazu — i emituje
`vessel:arrived`, co domyka rozkaz przedwcześnie:

```
misja → BLISKIE ciało, arrival = 0.379
moveToPoint → punkt 2.2× poza układem, arrival = 8.171
start (98.8, -16.3)  →  po roku 0.379:  (1399.2, -1926.1)   = cel moveToPoint
order = completed, mission = null
```

**~21 AU pokonane natychmiast, 21× szybciej niż wynikało z prędkości statku, bez paliwa ponad opłacone.**
⇒ **Finding 116.**

### 2.3 🟠 WZNOWIENIE STAREJ MISJI — „statek sam wraca do poprzedniej roboty" (ZMIERZONE, T2)

```
misja `mining` → entity_3, statek in_transit
issueOrder(pursue) → {"ok":true}
  _suspendedMission = mining -> entity_3          ← snapshot
cancelOrder(player)
  vessel.mission = mining -> entity_3, status=on_mission, state=in_transit
  → statek SAM wrócił do starej misji: TAK
```

Ścieżka: `MOS._suspendMissionIfAny` (`:142`) → `VesselManager._resumeMissionAfterOrder` (`:2414`),
podpięte pod **trzy** zdarzenia (`orderCompleted`, `orderCancelled`, `orderBlocked` — `VesselManager:126/128/135`).
Dotyczy `pursue`, `intercept`, `engage`, `patrol` **i** pauzy bojowej (`DSCS:1202`).

> ⚠ **To jest znany, w połowie naprawiony problem — i właściciel pamięta go poprawnie.**
> Keeper `src/testing/smoke/moveto_no_return_smoke.mjs` nosi w nagłówku dosłownie:
> *„Fix »statek wraca na stare miejsce po rozkazie leć-do-X«"*. Naprawiono go **wyłącznie dla `moveToPoint`**
> (`_issueMoveToPoint` robi `delete vessel._suspendedMission`, `:661`), a keeper **T2 pinuje**, że dla
> pozostałych rozkazów wznowienie MA zostać: *„in_transit + żywa misja → snapshot (intencja pursue/intercept)"*.
> ⇒ zmiana modelu wymaga **odwrócenia tego keepera**, nie tylko edycji kodu. ⇒ **Finding 118.**

⚠ **Drugi rząd tej samej pułapki:** `_suspendMissionIfAny` wychodzi wcześnie, gdy snapshot już istnieje
(`:148`). Pościg → pościg → koniec ⇒ wznawiana jest misja sprzed **dwóch** rozkazów.

### 2.4 🟠 ŚLAD ROZKAZU NIGDY NIE ZNIKA (ZMIERZONE, T3+T6b)

`vessel.movementOrder` nie jest zerowane **nigdzie w kodzie produkcyjnym** — jedyne przypisanie `= null`
poza fabryką encji i migracją siedzi w `SpawnTestEnemy.js:670` (debug).

```
T3:  po przylocie  →  mission=null, status=idle,  movementOrder = moveToPoint/completed   ← zostaje
T6b: TransportOrderSystem._freePoolVessels
     PRZED rozkazem  n = 1
     PO rozkazie     n = 0     (statek z powrotem w doku, idle, mission=null, cargoMax=200)
     KONTROLA: po ręcznym `movementOrder = null`   n = 1        ← jedyna różnica
```

> 🔴 **Statek po JEDNYM ręcznym rozkazie ruchu wypada z puli logistycznej NA STAŁE.** `_freePoolVessels`
> (`:516`) odrzuca każdy `v.movementOrder`, a ten nigdy nie wygasa. ⇒ **Finding 119.**
> ⚠ Ten sam martwy marker czyta `FleetGroupPanelLogic:86` (`orderKey`) → panel grupy pokazuje ukończony
> rozkaz jako bieżący.

### 2.5 🟠 PUŁAPKA OBCEGO UKŁADU (ZMIERZONE, T8)

```
bramka panelu (type==='exploration' && phase==='orbiting_body')  PRZED rozkazem: true
issueOrder(moveToPoint na inne ciało) → ok
bramka PO rozkazie:      false   (mission.type = move_to_point)
bramka PO PRZYLOCIE:     false   (mission = null)
```

Gracz, który w obcym układzie użyje **mapy** („Leć do planety") zamiast listy „Leć do innego ciała"
w panelu, **bezpowrotnie traci** komplet akcji obcego układu: rekonesans ciała, rekonesans układu,
kolonizację, rozładunek i powrót. Nic nie mówi mu, co się stało. ⇒ **Finding 121.**
(Ta sama bramka rządzi klikalnością ciała na mapie — `_isForeignRedirectClickable`, `FMO:9175-9176`.)

### 2.6 🟠 COMPOSITE PRZEŻYWA PREEMPCJĘ (ODCZYTANE)

`vessel.pendingOrder` (auto-łańcuch warp→dostawa, Slice C) jest czyszczone tylko w `_beginComposite`,
`issueReturn` i `_abortComposite`. **`MOS.issueOrder` i `OrderService.issueMove` go nie ruszają.**
Statek przekierowany ręcznie w trakcie composite po dolocie i tak wykona zaplanowaną dostawę.
⇒ **Finding 126.** (⚠ ten akapit mówił „125" — literówka odsyłacza. Rejestr numeruje to jako **126**;
125 to brykanie po nieudanym powrocie. Poprawione przy zamknięciu 125.)

### 2.7 Werdykt §2

> Podejrzenie właściciela jest **potwierdzone i szersze, niż brzmiało**: problem „powrotu do poprzedniego
> rozkazu" występuje w układzie macierzystym, ma **pięć** niezależnych mechanizmów, a jeden z nich
> (§2.3) jest **świadomie zapinany keeperem** jako intencja.

---

## §3 MIARA OGRANICZENIA — ile bramek i jakich

### 3.1 Bramki na stanie FIZYCZNYM — **58** miejsc (to jest właściwa miara)

| plik | ile | co bramkuje |
|---|---|---|
| `data/FleetActions.js` | **30** (+3 gałęzie kubełka) | 17 z 18 akcji ma własny test `position.state` i/lub `status` |
| `systems/VesselManager.js` | 10 | `dispatchOnMission:395` (docked+idle) · `redispatchFromOrbit:455` (orbiting) · `getAvailable:296` · `:329` · `undockToOrbit:662` · `dispatchInterstellar:764` · `deployVessel:946` · `_startFullScan:1188-1189` · `_sendAwayTeam:1264` · `manualRefuel:2125` |
| `systems/MissionSystem.js` | 9 | `_checkPadForVessel:461` · `_launch:528` · `_launchColony:620` · `_launchFoundOutpost:724` · `_launchTransport:812-814` · `_launchPassenger:960-961` · `_launchReconTarget:1357` · `_launchEnvoy:1515` · `_tryResumeLoop:2053` |
| `systems/TransportOrderSystem.js` | 4 | `:225-226`, `:513-514` |
| `systems/MovementOrderSystem.js` | 1 (+3 implicit-launch) | `_suspendMissionIfAny:149` |
| `utils/SpaceportCheck.js` | 1 | `canLaunchFromCurrent:57` |
| `systems/WarpRouteSystem.js` | 2 | `canOrder:52-53` |
| `systems/FleetSystem.js` | 1 | `:681` |
| **razem** | **~58** | |

⚠ **Jedna z tych bramek jest wzorem do naśladowania, nie do usunięcia:** `WarpRouteSystem.canOrder` (`:47-55`)
odrzuca **wyłącznie** `in_transit` i przyjmuje `docked` **oraz** `orbiting`. To jest dokładnie model, o który
prosi właściciel, i on **już w grze istnieje** — tylko dla jednego rozkazu.

### 3.2 Bramki na `mission.type` / `mission.phase` — **11** miejsc decydujących o akcji gracza

| # | miejsce | co decyduje |
|---|---|---|
| 1 | `FleetActions.js:331` | „Powrót" niedostępny, gdy `phase==='returning'` |
| 2 | `FMO:7306` | panel po przylocie międzygwiezdnym (5 przycisków) |
| 3 | **`FMO:7405`** | **panel `orbiting_body` — rekon ciała/układu, kolonizacja, rozładunek, przekierowanie, powrót** |
| 4 | `FMO:7586` | panel trwającego `foreign_recon` (przerwij / wróć) |
| 5-6 | `FMO:9175`, `:9176` | czy klik ciała na mapie przekierowuje statek |
| 7-8 | `VesselManager:2845`, `:2846` | co `_redirectInterstellarVessel` w ogóle przyjmuje |
| 9 | `VesselManager:3143` | `abortForeignRecon` |
| 10 | `MissionSystem:2031` | zamknięcie pętli transportowej |
| 11 | `MovementOrderSystem:147` | czy stara misja zostanie wznowiona (`type==='move_to_point'` → nie) |

**Pełny rozkład 64 wystąpień `.phase`** (bez testów): 11 powyżej · **13** wewnętrznych gałęzi cyklu życia
(tick warp / rekon / powrót) · **7** w `TransportOrderSystem` — to **inne pole** (`assignment.phase`, nie
`mission.phase`) · **3** to `sprite.userData.phase` (animacja, bez związku) · reszta (**~30**) kosmetyka:
ikona, kolor trasy, etykieta.

> ⚠ **Wniosek liczbowy, który zmienia priorytet:** `mission.phase` to **11 miejsc i wszystkie dotyczą obcego
> układu**. Gorsetem jest `position.state`/`status` — **58 miejsc, z czego ponad połowa w jednym pliku
> danych.** Kto naprawi tylko `mission.phase`, naprawi obcy układ i **nie ruszy** problemu „statek w locie
> nie może nic".

### 3.3 Ile jest źródeł prawdy o misji

- **8 miejsc produkcyjnych** zapisuje `vessel.mission = {…}`: `VesselManager` ×5 (`:422`, `:470`, `:821`,
  `:2875`, `:2915/2972`), `MovementOrderSystem` ×2 (`_issueMoveToPoint`, `_issueEngage:871`),
  `_resumeMissionAfterOrder` ×1. (+2 w `SpawnTestEnemy`, debug.)
- **18 miejsc** zeruje `vessel.mission` — w **8 plikach**, w tym **2 razy w UI** (`FleetManagerOverlay:2319`,
  `:2375`) i raz w **danych** (`FleetActions:383`).
- Zero wspólnego konstruktora, zero walidacji kształtu, zero inwariantu.

---

## §4 PROJEKT NAJMNIEJSZEJ ZMIANY (bez kodu)

Cel właściciela w trzech zdaniach: **(a)** nowy rozkaz zawsze przerywa i zastępuje stary natychmiast;
**(b)** statek po przybyciu gdziekolwiek jest wolny — zero aktywnej misji, pełne menu; **(c)** kolonizacja
jest akcją jak każda inna, dostępną zawsze, gdy warunki fizyczne są spełnione.

Poniżej **pięć ruchów**. Trzy z nich to **usunięcie** kodu.

### P1 — Jeden szew preempcji (`_preempt`) — *nowe, ~40 linii*

Jedna funkcja, wołana **na wejściu** każdego intentu (`OrderService.issue*` **oraz** `MOS.issueOrder`, żeby
zejście na niższy poziom nie omijało reguły). Robi cztery rzeczy i nic więcej:

1. domyka aktywny `movementOrder` (`status='superseded'` + `vessel:orderCancelled` z powodem) **i zeruje
   `vessel.movementOrder`** — to jednocześnie kasuje Finding 119;
2. **kasuje** `vessel._suspendedMission` — rozkaz gracza nigdy nie wskrzesza poprzedniej roboty;
3. **anuluje rekord ekspedycji** tego statku w `MissionSystem` (nowy status terminalny) — to kasuje ducha
   u źródła (§2.1, §2.2);
4. czyści `vessel.pendingOrder` (Finding **126**; ⚠ było „125" — patrz korekta odsyłacza w §2.6).

⚠ **Jeden wyjątek, obowiązkowo jawny:** rozkazy wydawane przez SYSTEM, które z definicji są tymczasowe
— pauza bojowa (`DSCS._pausePlayerSideForCombat`) i auto-odwrót — wołają z `{ preempt:false }`. Bez tego
wznowienie misji po bitwie (świadoma, udokumentowana funkcja, `docs/player-combat-mission-pause.md`)
zniknęłoby razem z defektem.

### P2 — Przylot jest własnością STATKU, nie kalendarza — *jedna bramka + jedno zaostrzenie*

`MissionSystem._checkArrivals` dostaje jeden warunek: ekspedycja „przylatuje" tylko wtedy, gdy jej statek
**faktycznie jest u celu** (`position.dockedAt === exp.targetId` lub `euclideanAU(vessel, target) < ε`);
misje abstrakcyjne (envoy, bez statku) bez zmian.

⚠ **Druga połowa jest konieczna, inaczej P2 zamienia duchy w wieczne zombie:** dziś `_launch*` **tworzy
rekord misji, po czym ignoruje wynik `dispatchOnMission`** (`MissionSystem:919-931`, `:684-695`). Gdy
dyspozytor odmówi (statek nie w doku), rekord zostaje i staje się duchem. Po P2 taki rekord nigdy nie
„przyleci" ⇒ `_launch*` musi **odmówić głośno**, gdy dyspozytor odmówił, i nie tworzyć rekordu.

To jedno zdanie kasuje Findings 115, 116, 117 naraz.

### P3 — Menu z MOŻLIWOŚCI, nie z kubełka — *usunięcie automatu*

`getAvailableActions` przestaje rozgałęziać się na `position.state`. Iteruje **wszystkie** akcje, pyta
`canExecute` i zwraca **także te zablokowane, z powodem** — wzór już jest w tym samym drzewie
(`foreign_colonize` rysuje się wyszarzony z etykietą, `FMO:7490`), więc to jest ujednolicenie, nie wynalazek.
Rozwiązuje Finding 128 przy okazji i zamyka Finding 99 (afordancja znikała zamiast się blokować).

Wtedy **każda z 30 bramek w `FleetActions` staje się jedynym miejscem, gdzie zapada decyzja o tej akcji** —
i każdą trzeba przesądzić z osobna (§5.2). Reguła robocza, którą sugeruje kod:

- `docked` naprawdę wymagane **tylko** tam, gdzie trzeba sięgnąć do magazynu kolonii:
  `load_colonists`, `load_troops`, `transport_passenger` (zaokrętowanie POP), `found_outpost` (ładunek);
- wszystko inne (`colonize`, `survey`, `mining`, `orbit`, `transport`, `deep_scan`) potrzebuje
  **„w przestrzeni ALBO w doku"** — dokładnie tak, jak od dawna umie `WarpRouteSystem.canOrder`.

### P4 — `foreign_*` przestają istnieć jako osobny byt — *usunięcie ~455 linii*

Cztery przyciski panelu obcego (`rekon ciała`, `rekon układu`, `kolonizuj`, `rozładuj`) wchodzą do
`FLEET_ACTIONS` jako **zwykłe akcje** z warunkiem „orbituję ciało + cel spełnia warunki". Bramka
`type==='exploration' && phase==='orbiting_body'` (`FMO:7405`) **znika** — i z nią pułapka z §2.5.
Znika też `_isForeignRedirectClickable`, bo klik ciała na mapie to po prostu `moveToPoint`.

⚠ **Warunek konieczny P4:** dwie równoległe implementacje kolonizacji muszą się zejść do jednej.
Dziś `_startForeignColonize` omija tech, koszt, załogę i ładownię desantową (Findings 102/104/107).
**Zostawienie obu = utrwalenie tamtych trzech findingów.**

### P5 — `OrderService.issueColonize` — *nowe, ~25 linii*

Lustro `issueTransport`: ten sam układ → `expedition:sendRequest {type:'colony'}`; inny układ → composite
(`_beginComposite(vessel, 'colonize', …)` + gałąź w `_maybeDeliver`). To jest **dokładnie** ta funkcja,
której brakuje, żeby „wybór celu bezpośrednio LUB dolot i kolonizacja po przybyciu" było jednym rozkazem.
Dziś `OrderService` ma `issueTransport / issuePassenger / issueMove / issueWarp / issueAttack / issueReturn`
— i **nie ma kolonizacji ani skanu**.

### P0 (prerekwizyt, bez którego P3+P5 kłamią) — odkotwiczenie dystansu

`MissionSystem._calcDistance` liczy od statku, nie od `homePlanet` (§1.4). Bez tego „kolonizuj skądkolwiek"
wycenia lot z domu — ZMIERZONE 1.813 AU dla statku stojącego 0.000 AU od celu.
`_launchTransport` ma już gotowy wzór do skopiowania (`:836-846`).

### Co świadomie NIE wchodzi do minimum

- kolejkowanie rozkazów (shift-klik) — to jest **przeciwieństwo** „nowy rozkaz zastępuje stary";
- fizyczna podróż zamiast teleportu w auto-powrocie z dryfu (M5 backlog);
- retirement `MissionSystem` jako takiego — rekord ekspedycji zostaje, zmienia się tylko jego autorytet;
- ujednolicenie `mission` i `movementOrder` w jedno pole (kuszące, ale to już jest przepisanie, nie zmiana).

---

## §5 KOSZT — decyzji mało, miejsc dużo

### 5.1 Dobra wiadomość: chokepointów jest cztery

| ruch | plik | charakter |
|---|---|---|
| P1 `_preempt` | `OrderService` + `MovementOrderSystem` | **+~40 lin.**, jedna funkcja, dwa wywołania |
| P2 przylot | `MissionSystem` (`_checkArrivals` + `_launch*`) | **+~20 lin.**, jeden warunek + jedno „return po odmowie" ×5 |
| P3 menu | `FleetActions.getAvailableActions` | **−~70 lin.** (usunięcie automatu); karmi 3 UI naraz |
| P5 `issueColonize` | `OrderService` | **+~25 lin.**, lustro istniejącej metody |
| P0 kotwica | `MissionSystem._calcDistance` | **~5 lin.**, wzór już w pliku |

**Netto rdzenia: ~150 linii, w tym jedno usunięcie.**

### 5.2 Zła wiadomość: 58 bramek do indywidualnego przesądzenia

Każda z 58 bramek (§3.1) musi dostać decyzję *zostaw / rozluźnij do `docked|orbiting` / skasuj* **z
uzasadnieniem**. To praca mechaniczna, ale nie automatyczna — część bramek jest **poprawna** i chroni
inwarianty (np. `dispatchOnMission` wymaga doku, bo liczy pozycję startu z ciała macierzystego;
`_tryResumeLoop` wymaga doku, bo ładuje z magazynu).

### 5.3 Retirement `foreign_*` — ~455 linii w najcięższym pliku

Panel `FMO:7306-7660` (~355 lin.) + handlery `:2304-2385` (~80) + `_isForeignRedirectClickable` (~20),
w pliku 9274-liniowym. Precedens jest świeży i dobry: **`chore` prune C8 (`7201670`) wyciął z tego samego
pliku 558 linii jako IZOLOWANY commit** — ten sam wzór tu obowiązuje.
Po stronie `VesselManager` do zwinięcia 6 metod (~350 lin.) + 4 subskrypcje (`:119`, `:159`, `:161`, `:163`).

### 5.4 Najdroższy element nie jest w kodzie: **12 keeperów pinuje dzisiejsze zachowanie**

`a4_transport_outpost_explored_gate` · `ai_capture_last_stand` · `load_colonists` · **`moveto_no_return`** ·
**`order_blocked_resume`** · **`player_combat_mission_pause`** · `s34_faza4` · `s3_0a_d` ·
`stage4_launch_gravity` · `w2_deploy_model` · `w2_deploy_ui` · `w3_attack_dispatch`.

- **`moveto_no_return` T2** pinuje wprost to, co ma zniknąć („in_transit + żywa misja → snapshot") ⇒
  **keeper do ŚWIADOMEGO ODWRÓCENIA**, dokładnie jak `deploy_seams` T1/T2/T4 w W2 i `colony_ownership_seams`
  S4 w P0. To jest projektowa norma, nie wyjątek.
- **`order_blocked_resume`** (4 asercje) pinuje wznawianie po `orderBlocked` — po P1 zostaje tylko dla
  ścieżek systemowych.
- **`player_combat_mission_pause`** pinuje wznowienie po bitwie, które **ma zostać** ⇒ to jest test,
  który udowodni, że wyjątek `{preempt:false}` działa.

### 5.5 Save i AI

- **Save: prawdopodobnie bez bumpu.** Kształt `vessel.mission` / `movementOrder` / `pendingOrder` się nie
  zmienia; nowy status ekspedycji jest wartością, nie polem. Stary zapis z duchem `en_route` po prostu
  nigdy nie „przyleci" (P2) i zostanie przycięty. ⚠ Bump jako ubezpieczenie jest tani — decyzja właściciela.
- **AI biegnie tymi samymi torami.** `EmpireLogisticsSystem` czyta `mission.phase` w 4 miejscach
  (`:409`, `:431`, `:447`, `:596`), `Director` wydaje rozkazy przez `MOS`/`OrderService`.
  **Preempcja musi być bramkowana właścicielem** (albo jawnie bezpieczna dla AI), inaczej kurier AI
  będzie sam sobie kasował trasę. To ta sama klasa, co „AI nie płaci utrzymania" z W2.

### 5.6 Zalecana kolejność (najtańsze i najbardziej odkrywcze najpierw)

**P0 → P2 → P1 → P3 → P4 → P5.** P2 przed P1, bo P2 **sam z siebie** kasuje trzy najcięższe findingi
(115/116/117) i jest jednym warunkiem — to najlepszy stosunek wartości do ryzyka w całym zestawie.

---

## §6 CZY TO ROZWIĄZUJE FINDING 111 — odpowiedź wprost

**NIE. Rozwiązuje jego PRZESŁANKĘ, nie jego.** Trzeba to rozdzielić, bo pomylenie tych dwóch rzeczy jest
dokładnie tym błędem, który `COLONIZE_PATH_ZERO_COLONY_AUDIT.md` musiał potem prostować.

**Co Finding 111 mówi:** `canReverseFate` (`PlayerViability.js:57`) liczy **istnienie** kadłuba z habitatem
i **zero** stanu; `_tickPlayerViability` zeruje karencję, dopóki `state.ok`. Trzecia konfiguracja
(zadokowany gdzie indziej / dryfujący po `moveToPoint`) jest liczona jako ratunek, **choć nie może nic** ⇒
gra, która nigdy się nie kończy.

**Co robi ta zmiana — ZMIERZONE (T9):** kolonizator, który doleciał na miejsce **zwykłym `moveToPoint`**
(orbiting, idle, `mission=null`), dziś:

```
MENU na orbicie:              ["~return_home","~redirect","transport"]    ← BRAK kolonizacji
canLaunchColony(cel, statek): {"ok":true, techOk:true, padOk:true, shipOk:true,
                               exploredOk:true, typeOk:true, notColonized:true}
_launch('colony') ręcznie:    kolonie 1 → 2, statek skonsumowany
```

> **Wszystkie siedem bramek silnika mówi TAK. Odmawia wyłącznie MENU.** Po P3 ten statek dostaje przycisk.
> ⇒ konfiguracja, która dziś jest „potencjałem bez zdolności", staje się **realną zdolnością** —
> a to jest dokładnie ta konfiguracja, na którą właściciel trafił w normalnej grze.

**⚠ KONTROLA, która nie pozwala ogłosić więcej, niż zmierzono (T9b).** Sprawdziłem, czy „silnik już to
umie" jest zdolnością, czy tym samym ślepym przylotem:

```
statek zaparkowany przy entity_2, cel kolonizacji entity_4 (4.14 AU dalej)
_launch('colony') → misja utworzona; statek: mission = null, dockedAt = entity_2  ← NIGDY nie dostał misji ruchu
PO TIKU: kolonie 1 → 2, kolonia POWSTAŁA NA CELU, statek zniszczony
```

⇒ **kolonia powstała 4.14 AU od statku, który nigdzie nie poleciał.** „Silnik przyjmuje kolonizację
z orbity" jest **tym samym defektem** co §2.1/§2.2, nie zdolnością. ⇒ **Finding 117.**
Dlatego P2 (przylot = własność statku) jest **warunkiem koniecznym**, żeby P3 dał realną kolonizację,
a nie teleport.

**Co po zmianie z Findingiem 111 zostaje:**

| konfiguracja z 111 | dziś | po P0-P5 |
|---|---|---|
| statek w locie / po warpie | liczony ✅, słusznie | bez zmian ✅ |
| zadokowany przy traconej koloni | niszczony przy `transferColony:838-843`, predykat poprawny ✅ | bez zmian ✅ |
| **zadokowany gdzie indziej / dryfujący** | 🔴 liczony, choć **nie może nic** | ✅ **może** — dostaje przycisk „Kolonizuj" |

> **Werdykt §6:** zmiana **usuwa fałszywą przesłankę** („statek, który nie może nic") w trzeciej
> konfiguracji, ale **nie dotyka predykatu**. `canReverseFate` dalej nie pyta o paliwo, o zasięg, o to,
> czy jest gdzie lecieć, ani o to, czy cel jest zbadany. **Finding 111 był osobnym P1** (✅ ZAMKNIĘTY 2026-08-20, niezależnie od tego arca —
> `a180619`+`8537e78`; ten akapit zostaje, bo diagnoza „VESSEL_ORDERS nie rusza predykatu” **była trafna**)
> — po prostu przestaje być tak dotkliwy. ⚠ Odwrotna kolejność (napraw 111 najpierw) też jest sensowna
> i **tańsza** — i taka jest dziś ustalona kolejność właściciela (`CLAUDE.md`, „Kolejność dalszych prac").

---

## §7 FINDINGS FILED (ciągła numeracja po 114)

115. 🔴 **DUCH MISJI: nowy rozkaz nie anuluje ekspedycji, a ekspedycja dostarcza pod nieobecność statku.**
     `MissionSystem._checkArrivals:1451` bramkuje wyłącznie kalendarzem (`_gameYear >= exp.arrivalYear`),
     `MOS.issueOrder:176-243` nie dotyka rekordu misji, a `vessel:orderIssued` nie ma subskrybenta.
     **ZMIERZONE:** misja `mining` po wydaniu `moveToPoint` w przeciwną stronę zostaje `en_route`, dobija do
     `orbiting` i wypłaca do magazynu kolonii **`{Fe:+30, Si:+7.12, Ti:+5}`** przy statku oddalonym od celu
     o **3.05 AU**. Dotyczy WSZYSTKICH typów misji i OBU układów.
116. 🔴 **Ten sam duch TELEPORTUJE statek i przedwcześnie domyka rozkaz.** `_processArrival` woła
     `VesselManager.arriveAtTarget:498`, która snapuje pozycję do `vessel.mission.targetX/Y` — czyli do celu
     **nowego** rozkazu — i emituje `vessel:arrived`. **ZMIERZONE:** (98.8, −16.3) → (1399.2, −1926.1) w roku
     0.379 zamiast 8.171 — **~21 AU natychmiast**, `order=completed`, `mission=null`.
117. 🔴 **Kolonia powstaje tam, gdzie statku nigdy nie było.** Ta sama przyczyna po stronie kolonizacji:
     `_launchColony` tworzy rekord, `dispatchOnMission:395` odmawia (statek nie w doku), rekord zostaje
     i „przylatuje". **ZMIERZONE:** kolonia założona **4.14 AU** od zaparkowanego statku, `vessel.mission=null`
     przez cały czas, statek skonsumowany. ⚠ Unieważnia potoczny wniosek „silnik już umie kolonizować z orbity".
118. 🟠 **Statek sam wraca do poprzedniej roboty po pościgu/przechwycie/starciu/patrolu.**
     `MOS._suspendMissionIfAny:142` → `VesselManager._resumeMissionAfterOrder:2414`, podpięte pod trzy
     zdarzenia (`:126/128/135`). **ZMIERZONE:** `_suspendedMission = mining → entity_3`, po `cancelOrder`
     misja wraca (`in_transit`, ten sam cel). ⚠ **Znane i w połowie naprawione** — `moveto_no_return_smoke.mjs`
     naprawił to tylko dla `moveToPoint`, a jego **T2 PINUJE** zachowanie dla reszty jako intencję.
     ⚠ Drugi rząd: guard `if (vessel._suspendedMission) return false` (`:148`) ⇒ po dwóch pościgach wznawiana
     jest misja sprzed **dwóch** rozkazów.
119. 🟠 **`vessel.movementOrder` nigdy nie jest zerowane ⇒ statek po jednym ręcznym rozkazie wypada z puli
     logistycznej NA STAŁE.** Jedyne `= null` poza fabryką i migracją to `SpawnTestEnemy.js:670` (debug).
     **ZMIERZONE z kontrolą:** `_freePoolVessels` 1 → 0 → (po ręcznym wyzerowaniu markera) 1.
     Ten sam martwy marker czyta `FleetGroupPanelLogic:86`.
120. 🟠 **Statek w locie ma dokładnie jedną akcję; menu jest zaszytym automatem na `position.state`.**
     **ZMIERZONE (prawdziwy lot):** `docked` 6 akcji · `in_transit` **1** · `orbiting` 3.
     `getAvailableActions:610` karmi trzy UI (`FleetManagerOverlay`, `FleetTabPanel`, `FleetPanel`).
121. 🟠 **Pułapka obcego układu: `moveToPoint` bezpowrotnie gasi panel obcych rozkazów.** Bramka
     `FMO:7405` (`type==='exploration' && phase==='orbiting_body'`). **ZMIERZONE:** true → false → false
     (po przylocie `mission=null`). Gracz traci rekonesans, kolonizację, rozładunek i powrót — bez komunikatu.
122. 🟠 **`MissionSystem._calcDistance:2674` kotwiczy w `homePlanet`, nie w statku.** **ZMIERZONE:** 1.813 AU
     dla statku stojącego **0.000 AU** od celu. Idzie w `travelTime`, `fuelCost` i pre-check paliwa dla
     `colony`/`mining`/`recon`. `_launchTransport:836-846` ma już poprawkę — reszta nie.
     ⚠ **To jest przyczyna, dla której obcy układ w ogóle dostał drugi silnik misji.**
123. 🟠 **Cele misji nie są filtrowane po układzie na trzech niezależnych ścieżkach** (ODCZYTANE):
     `MissionSystem._findTarget:2733` używa `EntityManager.getByType` (cała galaktyka), nie
     `getByTypeInSystem` · `FMO._calcDistAU:9152` liczy dystans bez `isSameSystem` · `_getValidTargets:8987`
     czyta **`window.KOSMOS.activeSystemId`** (układ OGLĄDANY), nie `vessel.systemId`. Cross-system jawnie
     obsłużony tylko dla `transport`/`transport_passenger` (`:9082`). ⚠ Klasa „globalne id ≠ położenie" (W3).
     ⚠ **NIE zmierzone wykonaniem** — headless `GameCore` generuje jeden układ.
124. 🟠 **UI kłamie o stanie statku, żeby przejść bramkę — w czterech miejscach.**
     `FMO:2317-2319`, `FMO:2372-2375`, `FleetActions:381-383`, `OrderService:189-191` ustawiają
     `status='idle'; position.state='docked'; mission=null` przed `dispatchInterstellar`.
     Komentarz w kodzie mówi to wprost: *„Reset statusu — dispatchInterstellar wymaga idle+docked"*.
     ⚠ **Ta bramka od dawna akceptuje `orbiting`** (`VesselManager:764`) i **nie patrzy na status**
     (własny komentarz `:759`) ⇒ wszystkie cztery kłamstwa są dziś **zbędne**, a jedno z nich jest szkodliwe:
125. ✅ **ZAMKNIĘTY 2026-08-20** (`cc20af5`, save v101 bez migracji, live-gate + re-gate PASS).
     🔴 **Nieudany „Powrót do bazy" w obcym układzie BRYKUJE statek.** Konsekwencja 124: gdy skok odpadnie
     (najczęstszy powód: brak `warp_cores` — czyli dokładnie sytuacja, w której gracz klika ten przycisk),
     statek zostaje z `state='docked'` przy ciele **bez kolonii**. **ZMIERZONE:**
     `canLaunchFromCurrent` **`{ok:true}` → `{ok:false, no_spaceport_at_origin}`**, a `issueOrder(moveToPoint)`
     `{ok:true}` → `{ok:false}`. Statek był mobilny przed kliknięciem i nie jest po.
     - ⚠ **KOREKTA „bez wyjścia" (zmierzona przy naprawie):** wyjście było **jedno** — przycisk
       „Wystartuj na orbitę" (`undockToOrbit`, `FMO:7262`), który nie ma bramki portu. Pojawia się on
       jednak **wyłącznie dlatego, że statek jest fałszywie zadokowany**, i nic nie mówi, że to droga
       wyjścia. Reszta inwentarza potwierdzona wykonaniem: `startReturn` → `false` (wyzerowana `mission`),
       `manualRefuel` → `false` (pod fałszywym dokiem nie ma magazynu), a **z menu znika sam „Powrót"**
       (kubełek `orbiting`→`docked`). Dwie pozycje, które w tym stanie zostają „dostępne" (`orbit`,
       `transport`), są **kolejnym kłamstwem** — idą przez `MissionSystem._checkPadForVessel:456`, czyli
       lustro tej samej bramki, i odmówiłyby przy starcie.
     - **NAPRAWA:** NEW `src/utils/ReturnJump.js` — `returnJumpTransactional` (snapshot → przygotuj
       MINIMUM → skok → przy odmowie przywróć stan **co do pola**, z `pendingOrder` włącznie). Kłamstwo
       o doku **usunięte u wszystkich czterech producentów** (`OrderService.issueReturn`, FMO
       `interstellar_return`, FMO `foreign_return`/`…_from_recon`, `FleetActions.return_home.execute`).
       Ścieżka sukcesu jest **ścisłym no-opem** — `dispatchInterstellar` i tak nadpisuje wszystkie cztery pola.
     - **DOGRYWKA po live-gate (ten sam commit):** gracz zgłosił „Cannot issue order" **bez powodu** na
       ekranie „Interstellar Arrival" i podejrzewał **piątego producenta**. Zmierzone renderem: piątego
       **NIE MA** — ten ekran wystawia hit-zonę `interstellar_return`, już objętą (pin **T12** trzyma
       mapowanie ekran→hit-zona). Realnym defektem był **brak powodu**: te przyciski wołały
       `dispatchInterstellar`, który zwraca **goły bool**. Przepięte na `OrderService.issueWarp` (cel bez
       zmian) ⇒ „Nie można wydać rozkazu — ✗ Za mało rdzeni warp". ⚠ **Konsekwencja zadeklarowana:**
       powrót idzie teraz przez planer wielo-przeskokowy (ten sam silnik co „Powrót" z rejestru), więc
       trasa dłuższa niż jeden skok zostanie **złożona** zamiast po cichu odmówić.
     - ⚠ **`KOSMOS.debugLog` NIE JEST instrumentem floty** (zmierzone wykonaniem, pin **T13**): to audyt
       AI/wojny/dyplomacji z zamkniętą listą `TRACKED_EVENTS`, w której **nie ma ANI JEDNEGO** zdarzenia
       floty, a rozkazy floty nie ruszają `GameState` (brak nawet wpisu `state`). Pusty `tail()` **nie
       rozróżnia ścieżek** — milczy tak samo dla ścieżki naprawionej i nienaprawionej; live-gate wyciągnął
       z tej ciszy fałszywy wniosek i **słusznie**, bo instrument nie mówił prawdy o swoim zasięgu.
       Właściwym adresem jest **Dziennik, kanał `fleet`** — odmowa pisze tam teraz `severity:'warn'`
       (toast jest ulotny, wpis zostaje).
     - Keeper `src/testing/smoke/return_home_no_brick_smoke.mjs` **77/77** (T1-T13).
     - **Świadomie POZA naprawą:** `abortForeignRecon` zostaje **poza** transakcją (sam ląduje statek
       w pełni wykonalnym `exploration/orbiting_body`; cofanie go dałoby hybrydę — nowe limbo).
       `FleetActions.return_home.execute` utwardzony mimo że jest **uśpiony** (osiągalny tylko bez fasady) —
       nieutwardzony bliźniak to mina, lekcja z `removeColony:667` (blok P0 bramki własności).
126. 🟠 **`vessel.pendingOrder` (composite warp→dostawa) przeżywa ręczne przekierowanie.**
     Czyszczą go tylko `_beginComposite`, `issueReturn` i `_abortComposite`; `MOS.issueOrder` i
     `OrderService.issueMove` — nie. Statek przekierowany w trakcie composite po dolocie i tak dostarczy.
127. ⚪ **`vessel:orderIssued` nie ma ANI JEDNEGO subskrybenta** (grep całego `src/`), a tabela zdarzeń
     w `CLAUDE.md` deklaruje dwóch (`UIManager`, `VesselManager`). Kanał, którym najnaturalniej biegłaby
     preempcja, jest martwy i udokumentowany jako żywy.
128. ⚪ **`ACTIONS.survey.canExecute` dopuszcza `orbiting` (`FleetActions:63`), ale `getAvailableActions`
     pokazuje `survey` wyłącznie w kubełku `docked` (`:640`).** Zgoda istnieje i jest nieosiągalna —
     czysty objaw „menu to inna prawda niż bramka".
129. ⚪ **`arriveAtTarget(exp.vesselId, exp.targetId)` — drugi argument nie istnieje w sygnaturze.**
     `VesselManager.arriveAtTarget:498` przyjmuje jeden parametr; dwa wywołania (`MissionSystem:2170`, `:2195`)
     podają dwa. Cel przylotu jest brany z `vessel.mission.targetId`, nie z ekspedycji — co jest właśnie
     mechanizmem teleportu z Findingu 116.

---

## §8 METODA, PEWNOŚĆ, I CZEGO NIE ZMIERZONO

**Zmierzone WYKONANIEM** (headless `GameCore`, scenariusz `civilization_boosted`, solo, bez AI; sondy
`probe-orders{,2,3,4,5,6}.mjs` w scratchpadzie **poza repo**, żeby nie przeładować karty gracza):
duch misji i jego wypłata do magazynu (T1/T4) · teleport (T5) · wznowienie po pościgu (T2) · trwały marker
rozkazu z kontrolą (T3/T6b) · menu w trzech stanach na prawdziwym locie (T7b) · pułapka obcego układu (T8) ·
kolonizacja z orbity + kontrola odległego celu (T9/T9b) · kotwica dystansu (T10) · brykowanie po nieudanym
powrocie (T12).

**Zmierzone ODCZYTEM** (nie wykonaniem): wszystkie liczby bramek w §3 · rozdwojenie silnika misji w §1.3 ·
Findings 123, 126, 127, 129. `FleetManagerOverlay` **importuje się** pod node, ale jego metody rysujące
wymagają kontekstu 2D, więc bramki panelu obcego ustalono źródłowo — z jednym wyjątkiem: **sam predykat
bramki (T8) wykonano na żywym silniku**, tylko rysowanie pominięto.

**Świadomie NIE zmierzone:**
- **Gra nie była uruchamiana.** Wszystko powyżej to headless + źródło; potwierdzenie na żywo zostaje do gate'u,
  gdyby arc ruszył.
- **Wyciek celów cross-system (Finding 123)** — headless `GameCore` generuje **jeden** układ
  (`EntityManager.getByType('planet')` → `["sys_home"]`), więc leak jest ustalony ze źródła, nie z danych.
  Do zmierzenia potrzeba harnessu z `test-cross-system-integration.mjs` (realna galaktyka + `StarSystemManager`).
- **AI** — czy preempcja zepsułaby kurierów `EmpireLogisticsSystem` i rozkazy `Director`. Ryzyko wskazane
  (§5.5), niezmierzone.
- **Balans** — o ile „statek zawsze wolny" zmienia tempo gry. To jest pytanie do gate'u, nie do audytu.
- **Findings 102/104/107** (dwie implementacje kolonizacji, wyciek locka załogi, osierocone jednostki
  desantowe) **nie były re-mierzone** — pochodzą z `WARP_COLONIZE_ROUTE_AUDIT.md` i są tu cytowane jako
  warunek konieczny ruchu P4.

**Zero zmian w kodzie. Naprawa nie jest tu proponowana do wdrożenia — §4 jest projektem do PODPISANIA,
nie planem do wykonania.**
