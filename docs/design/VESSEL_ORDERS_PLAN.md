# VESSEL_ORDERS — plan doc (✅ **PODPISANY 2026-08-23** — P0-P5, decyzje D-VO1…D-VO5)

> # ✅ PODPIS KOMPLETNY — 2026-08-23
> **D-VO1 = W1** (preempcja identyczna dla obu stron + jawna flaga `force`; `AutoRetreatSystem`
> dostaje wymuszenie **w tym samym commicie VO-3**) ·
> **D-VO1b = W1 ROZDZIELONE** (zerowanie `movementOrder` **przy preempcji** → VO-3; **przy domknięciu**
> → **osobny VO-3b z własnym gate'em mierzącym tempo AI**) ·
> **D-VO2 = W2** (`P0 → P2 → P1 → P3 → P5 → P4`) + **kill-switch = B**
> (jedna flaga `FEATURES.unifiedVesselOrders`, obejmuje **P1 + P3**, default **ON**) ·
> **D-VO3 = W2** (VO-6 semantyka → VO-7 izolowany prune wzorem `7201670`); cztery klauzule
> obowiązkowe przyjęte, w tym **`abortForeignRecon` ZOSTAJE** (4 żywe call-site'y) ·
> **D-VO4 = W1** (P5 bez `found_outpost` cross-system; **D9 rozstrzygane OSOBNO w VO-6**) + **obie
> klauzule §3.4.3 podpisane** ·
> **D-VO5 = zgoda z klasyfikacją 1/13** (do odwrócenia wyłącznie `moveto_no_return` T2).
>
> **Plan commitów VO-0…VO-8 zatwierdzony w całości**, z gate'ami A-E; **GATE B najważniejszy**.
> **Zero migracji w VO-1…VO-5. Migracja pojawia się DOPIERO w VO-6** (§2.2, oznaczone przy commicie).
> **Tryb pracy:** fail-first · sweep + `check-i18n` czyste przy każdym commicie · **live-gate robi
> właściciel**, headless po stronie CC wszędzie, gdzie się da.
>
> ⚠ Poniższy tekst **zostaje w formie sprzed podpisu** (warianty i rekomendacje), bo to jest zapis
> tego, **co** było wybierane i **dlaczego** — zgodnie z konwencją `COLONY_OWNERSHIP_GUARD_PLAN.md`.
> **Zakres kodu w tym dokumencie: ŻADEN.**
>
> **Nowego audytu NIE robiono.** Podstawą jest `UNIFIED_VESSEL_ORDERS_AUDIT.md` (2026-08-20, 577 lin.,
> Findings 115-129). Wykonano wyłącznie **pomiar uzupełniający pod warianty tych decyzji**
> (2026-08-23, 8 agentów: 6 sond źródłowych + 2 przebiegi adwersarialne, plus dwie weryfikacje własne
> prowadzącego) — bo audyt ma trzy dni, a w międzyczasie weszły **`cc20af5`** (Finding 125) i
> **`a180619`** (Finding 111), które **unieważniły część jego twierdzeń**. Korekty: **§2**.
>
> ⚠ **Trzy rzeczy z pomiaru zmieniają TREŚĆ decyzji, nie tylko liczby** — czytać przed wariantami:
> **(1)** retirement `foreign_*` to **926 linii, nie ~455**, i **wymaga migracji save** (§2.1, §2.2);
> **(2)** `foreign_*` **NIE umiera** po P1-P3 — to samowystarczalna powierzchnia UI, omijająca
> `FLEET_ACTIONS` w całości (§2.3); **(3)** najcięższe ryzyko całego zestawu **nie jest w P1, tylko
> w P4**, i jest **binarne wobec D9** (§3.4).

---

**Arc:** WOJNA I POKÓJ 1.0 · **Workstream:** przekrojowy (flota — nie należy do AI_CAPTURE ani do W3)
**Slice:** VESSEL_ORDERS · **Status:** ✅ **PODPISANY 2026-08-23** — wdrożenie od **VO-0**
**Basis:** `docs/design/UNIFIED_VESSEL_ORDERS_AUDIT.md` (§0-§8, Findings 115-129) + pomiar uzupełniający
2026-08-23 (ten dokument, §2 i §5)
**Sąsiedzi (oba ZAMKNIĘTE, oba tylko współistnieją — §6):** `PLAYER_VIABILITY_PREDICATE_PLAN.md`
(Finding 111, `a180619`) · `COLONY_OWNERSHIP_GUARD_PLAN.md` (P0 + D1-D6, `e964c6b`)
**Save:** v101 · `CURRENT_VERSION = 101`, `MIN_SUPPORTED_VERSION = 4` (`SaveMigration.js:28-29`).
⚠ **Ten plan NIE przesądza bumpu — to treść decyzji D-VO3** (audyt mówił „prawdopodobnie bez bumpu";
pomiar mówi, że dla P4 **to nieprawda** — §2.2).
**Baza keeperów:** **165 suit** (`src/testing/smoke/*.mjs` = 166 plików minus `run-all.mjs`); ostatni
zmierzony sweep **165/165 0 FAIL**.
**Konwencja językowa:** polski, jak `AI_CAPTURE_PLAN.md` / `W2_PLAN.md` / `COLONY_OWNERSHIP_GUARD_PLAN.md`.

---

## RESUME — czytaj to PIERWSZE

**Jedno zdanie, z którego wynika cały ten plan:**

> Gra ma **dwie niezależne prawdy o tym, gdzie jest statek** — `vessel.position` (fizyka) i rekord
> ekspedycji w `MissionSystem` (kalendarz) — i **nic ich nie spina**; a menu akcji jest **zaszytym
> automatem na `position.state`**, nie funkcją tego, co statek POTRAFI. Nie dokładamy mechaniki —
> **spinamy dwie prawdy w jedną i zdejmujemy automat**.

**Trzy z pięciu ruchów to USUNIĘCIE kodu.** Rdzeń logiki: ~150 linii netto w **czterech**
chokepointach + prerekwizyt. Koszt nie leży w rdzeniu — leży w **58 bramkach do indywidualnego
przesądzenia**, w **926 liniach `foreign_*`** i w **13 keeperach** (audyt mówił 12), z których
**jeden trzeba świadomie odwrócić**.

**Cel właściciela, dosłownie (audyt §4):** (a) nowy rozkaz zawsze przerywa i zastępuje stary
natychmiast; (b) statek po przybyciu gdziekolwiek jest wolny; (c) kolonizacja jest akcją jak każda
inna, dostępną zawsze, gdy warunki fizyczne są spełnione.

---

# §1 CHOKEPOINTY — 4 + 1, streszczenie

Pełny wywód, dowody i pomiary: **audyt §4** (projekt) i **§5** (koszt). Tu wyłącznie tyle, ile trzeba,
żeby czytać decyzje. **Numery linii — po odświeżeniu 2026-08-23** (audyt miał 21 z 30 przesuniętych, §2.4).

### P0 — Odkotwiczenie dystansu (prerekwizyt)

`MissionSystem._calcDistance` (`:2686-2689`) liczy odległość **od `window.KOSMOS.homePlanet`**, nie od
statku. **ZMIERZONE (audyt T10):** dla statku stojącego **0,000 AU** od celu misja wycenia **1,813 AU** —
i ta liczba idzie w `travelTime`, `fuelCost` oraz pre-check paliwa dla `colony`, `mining` i `recon`.
Bez tego „kolonizuj skądkolwiek" (P3/P5) **kłamie o koszcie lotu**, a to jest właśnie przyczyna, dla
której obcy układ w ogóle dostał drugi silnik misji. Wzór do skopiowania jest **w tym samym pliku**:
`_launchTransport:849-856` już dziś liczy od `vessel.position`. ⇒ **Finding 122.**

### P1 — Jeden szew preempcji (`_preempt`)

`MovementOrderSystem.issueOrder` (`:181-246`) **nie woła `cancelOrder`, nie dotyka rekordu misji, nie
czyści `pendingOrder`** — nadpisuje `vessel.movementOrder` i `vessel.mission` i tyle. Kanał, którym
preempcja mogłaby biec (`vessel:orderIssued`), **nie ma ani jednego subskrybenta** (Finding 127).
Jedna funkcja na wejściu każdego intentu robi cztery rzeczy: domyka rozkaz · kasuje
`_suspendedMission` · **anuluje rekord ekspedycji** · czyści `pendingOrder`. Kasuje Findings
115/116/118/119/126. ⚠ Wymaga jawnego wyjątku dla ścieżek SYSTEMOWYCH — **treść D-VO1**.

### P2 — Przylot jest własnością STATKU, nie kalendarza

`_checkArrivals` (`:1463`) bramkuje **wyłącznie zegarem**: `exp.status === 'en_route' && this._gameYear
>= exp.arrivalYear`. Ani słowa o tym, gdzie jest statek. Jeden warunek („statek faktycznie u celu")
kasuje **ducha misji** (115), **teleport** (116) i **kolonię 4,14 AU od statku, który nigdzie nie
poleciał** (117). ⚠ **Druga połowa jest obowiązkowa w tym samym commicie:** dziś `_launch*` tworzy
rekord i **ignoruje zwrotkę `dispatchOnMission`** (`:678` push przed `:682` dispatch) — po P2 taki
rekord nigdy nie „przyleci", więc `_launch*` musi **odmówić głośno** i rekordu nie tworzyć.

### P3 — Menu z MOŻLIWOŚCI, nie z kubełka

`getAvailableActions` (`FleetActions.js:610`) to automat na trzech kubełkach `position.state`
(`:614` docked / `:646` orbiting / `:680` in_transit). **ZMIERZONE (audyt T7b, prawdziwy lot):**
`docked` 6 akcji · **`in_transit` 1** · `orbiting` 3. Zmiana: iteruj **wszystkie** akcje, pytaj
`canExecute`, zwracaj **także zablokowane, z powodem** — wzór już jest w tym drzewie
(`foreign_colonize` rysuje się wyszarzony). Karmi **trzy** UI naraz, więc to jeden chokepoint.
⚠ Wtedy każda z **58 bramek** staje się jedynym miejscem decyzji i **każdą trzeba przesądzić z osobna**.

### P4 — `foreign_*` przestają istnieć jako osobny byt

Cztery przyciski panelu obcego (rekon ciała, rekon układu, kolonizuj, rozładuj) wchodzą do
`FLEET_ACTIONS` jako **zwykłe akcje**; bramka `type==='exploration' && phase==='orbiting_body'`
(`FMO:7449`) znika, a z nią pułapka z Findingu 121. ⚠ **Warunek konieczny:** dwie równoległe
implementacje kolonizacji muszą się zejść do jednej — i **to jest najcięższa decyzja całego planu**
(D-VO4/§3.4), bo `_startForeignColonize` **omija bramkę D9**.

### P5 — `OrderService.issueColonize`

`OrderService` ma `issueTransport / issuePassenger / issueMove / issueWarp / issueAttack / issueReturn`
— i **nie ma kolonizacji ani skanu**. P5 to lustro `issueTransport`: ten sam układ → emit do
`MissionSystem`; inny układ → composite. To dokładnie ta funkcja, której brakuje, żeby „wybór celu
bezpośrednio LUB dolot i kolonizacja po przybyciu" był **jednym rozkazem**.
⚠ **Pułapka wdrożeniowa zmierzona dziś:** `_maybeDeliver` rewaliduje cel jako **kolonię albo stację
gracza** (`OrderService.js:270`), a cel kolonizacji jest z definicji ciałem **nieskolonizowanym** ⇒
composite kolonizacji **bez własnej gałęzi** zawsze skończy się `target_lost`.

---

# §2 KOREKTY DO AUDYTU — zmierzone 2026-08-23, zmieniają decyzje

> Audyt jest z 2026-08-20. Od tego czasu weszły `cc20af5` i `a180619`. Poniższe **nie są uzupełnieniem
> — są sprostowaniem**, i każde ma wpływ na wariant, który właściciel wybierze.

### 2.1 🔴 `foreign_*` to **926 linii**, nie ~455

Audyt liczył **osobno** FMO (~455) i `VesselManager` (~350) i te liczby zlewały się w rozmowie do
jednej. **ZMIERZONE dziś:**

| miejsce | zakres | linie |
|---|---|---|
| `VesselManager` — **jeden ciągły blok** 6 metod | `:2848-3320` | **473** (ciała 444) |
| `FMO` — panel obcego układu | `:7348-7689` | 342 |
| `FMO` — handlery `case 'foreign_*'` | `:2305-2384` | 80 |
| `FMO` — `_isForeignRedirectClickable` | `:9205-9223` | 19 |
| `FMO` — gałąź klik-mapy | `:1994-2005` | 12 |
| **razem** | | **~926** |

⚠ Do tego **18 kluczy i18n w `pl.js` + 20 w `en.js`** osieroci się bezgłośnie — `check-i18n` pyta
*„czy klucz użyty w `t()` istnieje w obu językach"*, a **nie** *„czy klucz jest jeszcze używany"*.
⚠ **Struktura jest za to nietypowo czysta:** 5 z 6 metod jest osiągalnych **wyłącznie przez EventBus**,
a **wszystkich 7 emitentów siedzi w JEDNYM pliku** (FMO). Jedyny wyciek to `abortForeignRecon` —
**4 zewnętrzne call-site'y** (`FleetActions:379`, `OrderService:189`, `FMO:2372`, `FMO:2382`).

### 2.2 🔴 P4 **WYMAGA migracji save** — audyt mówił „prawdopodobnie bez bumpu"

Misja jest serializowana **hurtem, przez spread, bez białej listy pól**: `VesselManager.serialize:1318`
(`missionData = { ...v.mission }`) i `restore:1479`. ⇒ stary zapis wraca **verbatim** z
`type:'foreign_recon'` oraz polami wyłącznymi dla tej misji (`scope`, `targets[]`, `currentIdx`,
`scanCompleteYear`) i **bez handlera zamraża statek na zawsze**.
⚠ **Faza `orbiting_body` jest WSPÓŁDZIELONA** z misją `exploration` (rekon macierzysty) — nie wolno
jej usuwać razem z `foreign_recon`.
⚠ Typ `foreign_recon` jest zaszyty **poza** tymi dwoma plikami w **trzech** miejscach:
`PlayerViability.js:68` (**predykat końca gry — zamknięty Finding 111**), `FleetPictureLogic.js:97`,
`NavPeekProviders.js:47`.

### 2.3 🔴 `foreign_*` **NIE staje się martwe** po P1-P3 — to odpowiedź na D-VO3

Panel obcego układu jest **samowystarczalną powierzchnią UI**: bramkuje się **bezpośrednio** na
`vessel.mission.type/phase` (`:7350`, `:7449`, `:7630`) i pcha **własne hit-zony**, **całkowicie omijając
`FLEET_ACTIONS`/`getAvailableActions`**. `FleetActions.js` ma **dwie** wzmianki o `foreign` (`:377-378`,
abort w `return_home`). ⇒ **P3 tych przycisków nie retire'uje.** Odroczenie P4 = **dwie żywe,
równoległe implementacje kolonizacji obok siebie**.

### 2.4 🟠 21 z 30 odnośników audytu **przesunięte** (żaden nie zniknął)

Dryf: +9…+15 lin. w `VesselManager`, +12 w `MissionSystem`, **+42…+44 w `FleetManagerOverlay`**.
Największy dryf to skutek `cc20af5`. Trafiają co do linii i są bezpieczne: `WarpRouteSystem.canOrder`
(`:47-55`), `MOS._suspendMissionIfAny` (`:142/:147/:148/:149`), trzy subskrypcje `VesselManager`
(`:126/:128/:135`), `FleetActions.survey.canExecute` (`:63`) i `getAvailableActions` (`:610`), trzy
bramki `_launchColony` (`:601/:620/:648`).

### 2.5 🟠 Dwa twierdzenia audytu są **NIEAKTUALNE** — nie cytować ich dalej

- **„Przycisk powrotu kłamie o doku"** — **zniesione** przez `cc20af5`. `ReturnJump.js:57-72` przerywa
  wyłącznie `in_transit` i to do **swobodnego dryfu**, nie do fałszywego doku. Findings 124/125 zamknięte.
- **„Darmowa placówka przy zerze kolonii"** — **zniesione** przez `a180619` (D-111 = W1).
  `_launchFoundOutpost` ma dziś **twardą** bramkę kosztu (`:754-758`), bliźniaczą do `_launchColony:648`.
  ⚠ Audytowy odnośnik `:724` wskazuje dziś **inną treść** (bramkę stanu statku).

### 2.6 ⚪ Dokumentacja pauzy bojowej **kłamie o fladze**

`docs/player-combat-mission-pause.md` deklaruje *„flag default **OFF**"*, a `GameConfig.js:86` ma
`m4PlayerCombatMissionPause: true`. Keeper `player_combat_mission_pause_smoke.mjs:126` ustawia `false`
z komentarzem *„przywróć default"*. ⇒ **wyjątek `{preempt:false}` jest nośny DZIŚ, nie hipotetycznie.**
⇒ **Finding 135.**

---

# §3 DECYZJE DO PODPISU

---

## D-VO1 — Bezpieczeństwo AI przy preempcji (P1) ✅ **PODPISANA: W1** · **NAJWAŻNIEJSZA DECYZJA TEGO PLANU**

### 3.1.1 Co zmierzono (bo pytanie brzmiało „czy to w ogóle osiągalny scenariusz")

**Odpowiedź krótka: TAK, jest osiągalny — ale dyscyplina siedzi WYŁĄCZNIE po stronie PRODUCENTÓW,
a nie w silniku.**

`MOS.issueOrder` (`:181-206`) **nie ma ŻADNEGO guardu „statek ma już rozkaz"**. Sprawdza tylko
`vessel_not_found` (`:183`), `vessel_is_wreck` (`:184`), `validateOrder` (`:186-187`),
`vessel_immobilized` (`:193`) i `vessel_in_reserve` (`:205`). **Nadpisanie żywego rozkazu jest dziś
w pełni dozwolone i całkowicie ciche** — `_issueMoveToPoint:673-677` pisze wprost po polach,
podmienia wpis w rejestrze (`:679`) i **nie emituje anulowania poprzedniego**.

**Inwentarz producentów AI (ZMIERZONE, 10 miejsc):**

| producent | API | guard „statek zajęty"? |
|---|---|---|
| `DirectorOffensive:202` (`strike_player_target`) | `OrderService.issueAttack` | ✅ **potrójny**: `strikeReadyVessels:82-84` — `if (v.mission) continue` / `if (v.movementOrder) continue` / `if (v.pendingOrder) continue` |
| `DirectorDoctrine:187` (patrol/obrona) | `MOS.issueOrder` | ✅ `_idleArmedAtCapital:268-275` — dok + `mission` + `movementOrder` + `_hasAnyDoctrine` |
| `EmpireLogisticsSystem:390` (kurier) | `dispatchOnMission` | ✅ **stanowy**: `:357` idle/refueling + docked, **drugi zamek** w `VesselManager:396` |
| `EmpireLogisticsSystem:423` (powrót) | `startReturn` | ✅ ta sama misja, nie nowy rozkaz |
| `EmpireLogisticsSystem:601` (`colony:destroyed`) | `startReturn` | ⚠ **odwrócony** — `:596` **wymaga** trwającej misji, żeby ją przerwać |
| `DirectorMobilization:112`, `ELS:375` | `deployVessel` | ✅ inna oś (`serviceState`), nie tyka rozkazów |
| **`AutoRetreatSystem:97` i `:109`** | `MOS.issueOrder` | 🔴 **BRAK. Zero testu `mission`/`movementOrder`** |
| `DirectorFirstContact:225` (sonda) | **brak API** — bezpośredni zapis `position.x/y` co tik | ⚠ nieosiągalna dla żadnego mechanizmu rozkazów |

**Kadencja (ZMIERZONE):** Director chodzi **raz na rok cywilizacyjny na imperium**
(`AlienCivSystem:55-66/:128`), z dławikiem **jednej próby rzutu na rok wyświetlany**
(`DirectorSystem:212-213`) i cooldownami 3-5 lat (`DirectorRuleData:159/179/221/254`). ⇒ **preempcja
byłaby rzadka nawet po zdjęciu wszystkich filtrów.** Jedyna pętla naprawdę per-tick
(`ELS._advanceAllCouriers:205`) dyspatchuje **wyłącznie** statek `idle` + `docked`.

⚠ **Kontrprzykład znaleziony przez przebieg adwersarialny — i on zmienia obraz:** mechanizm zrywający
uderzenie AI w locie **istnieje już dziś i jest cięższy od wszystkiego, co robi P1**.
`DSCS._freezeAsStationary:1157` ustawia `vessel.mission = null` **bezwarunkowo dla każdego statku
strony B** (`:355` — strona B to **zawsze** AI, `:293`), **bez snapshotu i bez ścieżki wznowienia**
(`:1217-1219` wychodzi, gdy nie ma strony gracza). Okręt AI wysłany regułą `strike_player_target`
**traci misję `attack` bezpowrotnie**, gdy tylko wejdzie w zasięg walki — a `EnemyAttackHandler:41`
bramkuje na `mission.type !== 'attack'` i po bitwie go **nie rozpozna**.
✅ **Zweryfikowane osobiście** (`DeepSpaceCombatSystem.js:1155-1157` + `:355`). ⇒ **Finding 130.**

> **Wniosek dla decyzji:** pytanie *„czy P1 zepsuje AI"* jest źle postawione. **AI już dziś ma trzy
> mechanizmy zrywające własne rozkazy** (DSCS, AutoRetreat, zawrócenie kuriera), z których **jeden jest
> cichym defektem**. `_preempt` — który misji **nie zeruje** — jest przy tym tle **mniej inwazyjny**.

### 3.1.2 Warianty D-VO1 — oś właściciela

| | **W1 — preempcja IDENTYCZNA dla obu, + jawna flaga `force`** | **W2 — preempcja bramkowana WŁAŚCICIELEM** | **W3 — preempcja identyczna, BEZ flagi (ścieżki systemowe nie preemptują z definicji)** |
|---|---|---|---|
| istota | jeden szew, jedna reguła; ścieżki systemowe (auto-odwrót, doktryna floty, pauza bojowa) wołają z `{ preempt:false }` / `{ force:true }` | `_preempt` odpala tylko dla `!isEnemyVessel(vessel)`; rozkazy AI nadpisują jak dziś, po cichu | `_preempt` woła się zawsze; ścieżki systemowe rozpoznaje się po `issuedBy`, bez nowego parametru |
| precedens w repo | ✅ **jest** — `VesselManager.startReturn:577`: `if (!opts.force && !isEnemyVessel(vessel) && …)` — bramka paliwa obowiązuje **tylko gracza** | ✅ ten sam precedens, druga strona | ⚠ `issuedBy` istnieje (`AutoRetreat` podaje `'auto_retreat'`), ale nigdy nie sterował zachowaniem |
| `AutoRetreatSystem` | ✅ dostaje `force` **w tym samym commicie** — odwrót **ma** bić atak | ✅ nietknięty (statki AI i tak nie preemptują) | ⚠ musi trafić na listę „systemowych", inaczej odwrót AI **przestanie działać** |
| ryzyko regresji AI | 🟠 średnie — ale **zmierzalne**: `w3_attack_dispatch` jedzie `mos.issueOrder` na statkach AI (34 asercje) i **zaświeci na czerwono**, jeśli szew jest zły | 🟢 najniższe — AI dosłownie bit w bit | 🔴 najwyższe — brak jawnego opt-outu; każda przyszła ścieżka systemowa musi pamiętać |
| co zostaje niespójne | nic | ⛔ **AI dalej ma cichy ślad rozkazu i ducha misji** — czyli Findings 119 i 115 zostają naprawione **połowicznie** | nic |
| ⚠ pułapka | flaga bez inwariantu **gnije** (lekcja R-5 z OG: producent zapomina terminu) | „bezpieczne, bo nie ruszamy AI" jest **złudzeniem** — DSCS już dziś zeruje misję AI (Finding 130) | wymyśla klasyfikację, której repo nie ma |

**Rekomendacja formalna: W1.** Jeden szew i jedna reguła to cała wartość P1; bramkowanie właścicielem
(W2) zostawia AI z **połową** naprawy przy zerowym zysku bezpieczeństwa — bo zmierzona kadencja
Directora (raz/rok cyw., cooldown 3-5 lat, potrójny filtr u producenta) sprawia, że **AI i tak prawie
nigdy nie trafi w preempcję**. Precedens `force` **już w tym pliku istnieje** (`startReturn:577`).
⚠ Cena W1 jest jawna i musi być podpisana: **`AutoRetreatSystem` dostaje wymuszenie w TYM SAMYM
commicie**, inaczej odwrót AI po bitwie wyląduje w `vessel:autoRetreatFailed` (`:137-139`) zamiast
w odwrocie.

### 3.1.4b ✅ POPRAWKI DO WARUNKÓW MECHANICZNYCH — **PODPISANE 2026-08-23**, po pomiarze pod VO-3

⚠ **Rozpoznanie przed VO-3 wykazało, że warunki z §3.1.4 są w podpisanym brzmieniu
NIEWYSTARCZAJĄCE.** Cztery poprawki, każda wynikająca z POMIARU, nie z preferencji.

**D-VO3a ✅ — `_preempt` jest DWUFAZOWY; destrukcja dopiero po `res.ok`.**
Warunek (a) („`_preempt` POD bramkami `:193`/`:205`") pokrywa **5 z ~30** ścieżek odmowy
`issueOrder`; pozostałe ~25 leży **PONIŻEJ rozgałęzienia na typy** (`no_weapons`,
`insufficient_fuel`, `target_other_system`, `unreachable_target`, `target_already_in_range`…).
⚠ Najdotkliwszy przypadek osiągalny **jednym kliknięciem gracza**: „Zaangażuj" na statku bez broni
→ `no_weapons` (`:830`) ⇒ **odrzucony rozkaz skasowałby żywe uderzenie**. ⇒ faza 1 (odczyt) przed
rozgałęzieniem, faza 2 (destrukcja) **wyłącznie po `res.ok`**.

**D-VO3b ✅ — `_preempt` ZERUJE `vessel.mission`, z guardem `phase !== 'warp_transit'`.**
Bez tego VO-3 **WPROWADZA TELEPORT**: dla `pursue`/`intercept`/`engage` `vessel.mission` nigdy nie
jest podmieniana, a para `state='orbiting'` + żywa misja trafia w gałąź
`VesselManager._updatePositions:2224`, która **PINUJE statek do `m.targetId`**.
**ZMIERZONE: skok 5,05 AU w jednym tiku 0,001 roku** (limit uczciwy 0,0010 AU); po dołożeniu
`vessel.mission = null` — **0,0000 AU**. To byłaby regresja **klasy Findingu 116** w commicie, który
ma zamykać 118/119/126/127.
⚠ **Guard warp jest obowiązkowy:** MOS **nie ma ŻADNEJ bramki** na `interstellar_jump` /
`phase === 'warp_transit'` (grep = 0), a `_reconcileSystemId` i cała **Slice A** stoją na
`mission.toSystemId`. Zerowanie misji w trakcie skoku rozbiłoby podróż międzygwiezdną.
⚠ **Ta sama poprawka leczy DRUGIE, nowo zmierzone ryzyko przeciwnego znaku niż R-6:** punkt 3
(anulowanie rekordu) przy `pursue`/`intercept`/`escort`/`patrol` zostawiał `vessel.mission='colony'`
**nad martwym rekordem** ⇒ predykat mówił „trasa żyje", a kolonie **2→2**. To odtwarzało limbo
**Findingu 111 od strony fałszywego POZYTYWU**.

**D-VO3c ✅ — punkt 2 rusza `_suspendMissionIfAny`, nie tylko wejście intentu.**
`delete vessel._suspendedMission` na wejściu jest **NO-OPEM**: cztery call-site'y
(`MOS:426/757/866/1438`) **odtwarzają snapshot w tej samej ramce**. ZMIERZONE: pin „pościg ROBI
snapshot" świeci na **zielono mimo preempcji**.
⚠ **DETEKTOR WDROŻENIA:** jeśli po VO-3 `moveto_no_return` dalej daje **15/15**, punkt 2 **nie
wszedł** — a żaden inny test tego nie zauważy.

**D-VO3d ✅ — zakres wymuszenia obejmuje `FleetSystem:585`; `OrderService.issueReturn` WYŁĄCZONY
z preempcji.**
⚠ `FleetSystem.js:585` (doktryna `retreat_at_50`) to **TRZECI producent odwrotu**, który omija
`AutoRetreatSystem._issueRetreatOrder` i woła `mos.issueOrder` wprost. Podpis D-VO1 wymieniał tylko
`AutoRetreatSystem:97/:109` — **to jest nieutwardzony bliźniak, ta sama klasa co `removeColony:667`**.
⚠ `_preempt` na wejściu `issueReturn` **COFNĄŁBY Finding 125**: skasowałby `pendingOrder` PRZED
snapshotem `ReturnJump.js:58`, więc odmowa skoku przywróciłaby `null` i po cichu skasowała
zakolejkowaną dostawę gracza (pinuje to `return_home_no_brick` T4b).

⚠ **DWA DALSZE OGRANICZENIA IMPLEMENTACJI, zmierzone:**
· `_preempt` **NIE MOŻE być zbudowany na `cancelOrder`** — jej `_stopVesselMotion` (`:1618-1631`)
  kasuje `vessel.mission`, ustawia `orbiting`/`dockedAt=null`/`idle`, więc wywołana po zainstalowaniu
  nowego rozkazu **zdemolowałaby świeży rozkaz**.
· `_preempt` **NIE MOŻE użyć `MissionSystem.cancelMission`** — to alias `_orderReturn`, który
  **odsyła statek do domu** i **nie zamyka rekordu** (`status='returning'`, ZMIERZONE). Właściwy
  prymityw to kształt `_onVesselWrecked` z VO-2: `status='completed'` bez ruszania statku.

**D-VO3e ✅ — guard kluczuje się na PRZEŻYCIU misji warp, nie na fakcie warpu; `_preempt` przerywa
też TRASĘ WARP przez publiczną intencję.** ⚠ **PODPISANE po tym, jak pomiar wykazał, że guard
D-VO3b był w pierwotnym kształcie SZKODLIWY** — czyli była to regresja wprowadzona przez sam ten commit.

**Co zmierzono:** gałąź typu (`_issueMoveToPoint:768`, `_issueEngage:966`) **NADPISUJE
`vessel.mission` ZANIM `_preemptCommit` w ogóle ruszy** (biegnie w `_dispatchByType`, przed
`if (res?.ok)`). Guard `prev.mission?.phase === 'warp_transit'` pilnował więc **pola, którego już
nie ma** — misja warp ginęła tak czy owak (`interstellar_jump` → `move_to_point`) — a w zamian
**zostawiał żywy `pendingOrder` i OSIEROCONĄ trasę warp**.

**Skutek osieroconej trasy (ZMIERZONY, nie wywnioskowany):**
· podróż **NIGDY się nie domyka** — 400 lat gry, **zero zdarzeń warp**; detekcja przylotu stoi na
  `mission.type === 'interstellar_jump'`, a misję właśnie nadpisano. Kontrola: ta sama podróż **bez**
  rozkazu ruchu kończy się `warpRoute:completed` + `interstellar:arrived`.
· `OrderService._maybeDeliver:242` ma `if (v.warpRoute) return` ⇒ sierota **BLOKUJE dostawy
  composite DO KOŃCA PARTII**, także **po wczytaniu zapisu** (oba pola są serializowane).
· samoleczenie istniało, ale **przypadkowe**: dopiero NASTĘPNY skok gracza kończył sierotę jako
  `diverted`.

**Kształt poprawki:** `warpMissionSurvived = inWarp && vessel.mission === prev.mission`.
Gdy misja warp **przeżyła** (`pursue`/`intercept` jej nie podmieniają) — nie ruszamy niczego.
Gdy **zginęła** — pełne sprzątanie: `pendingOrder`, rekord ekspedycji **oraz trasa warp**.
⚠ Trasę przerywa **NOWA publiczna intencja `WarpRouteSystem.abortJourney(vesselId, reason)`**, bo
`vessel.warpRoute` ma jednego producenta i trzy miejsca kasowania, **wszystkie w `WarpRouteSystem`**,
a `_abort` jest prywatne. To ten sam wzorzec, którym preempcja sięga po rekordy misji —
**mutacja przez intencję u WŁAŚCICIELA STANU**, nigdy przez cudze pole.
⚠ Obejmuje TAKŻE statek **spoza** warpu z żywą trasą wielo-przeskokową (zmierzone: `pendingOrder`
był czyszczony, a `warpRoute` zostawał).

⚠ **Brakująca bramka „nie wolno wydać rozkazu ruchu statkowi w skoku" (Finding 147) ZOSTAJE POZA
ZAKRESEM** — jest koncepcyjnie czystsza i czyniłaby ten guard zbędnym, ale to zmiana zachowania
poza P1; należy do `OrderService`/P4.

**D-VO3f ✅ — pula logistyczna sprząta się SAMA, na `mission:aborted`.** ⚠ Druga regresja
wprowadzona przez ten commit, znaleziona w live-gate B.
`TransportOrderSystem` nie subskrybował **żadnego** zdarzenia rozkazu ani przerwania misji (tylko
`expedition:arrived`, `vessel:wrecked`, `colony:destroyed`, `colony:captured`, `time:tick`). Do VO-3
istniała **działająca ścieżka leczenia** przez `_suspendedMission` → `_resumeMissionAfterOrder`:
po pościgu wydanym wożącemu kurierowi zlecenie **szło dalej**. Guard D-VO3c ją usuwa.
**ZMIERZONE (60 lat gry, ON vs OFF):** OFF → `assignments: to_origin`, cargo puste, **50 Fe
dostarczone**; ON → `assignments: hauling {Fe:50}` **zamrożone**, **0 dostarczone**.
⚠ **Koszt ukryty:** `inFlight` **rezerwuje** te jednostki, więc **inne statki z puli też ich nie
wezmą**.
**Kształt:** TOS słucha **`mission:aborted`** (zdarzenie dodane w tym commicie przez
`abortMissionsForVessel`) i sam zwalnia przydział — lustro `_onVesselWrecked`.
⚠ **NIE `vessel:orderCancelled`**, choć tak brzmiał pierwszy pomysł: ten leci **tylko gdy istniał
POPRZEDNI `movementOrder`**, a kurier na kursie jedzie na **misji** (`issueTransport`) i żadnego
rozkazu ruchu nie ma — emisja by go **nie dosięgła** (zmierzone).
⚠ **Świadomie NIE trzeci `abortX()` w `_preemptCommit`:** łańcuch rósłby o wywołanie na każdy nowo
odkryty system, a czwarty zostałby przeoczony — ta sama klasa co nieutwardzony bliźniak
(`removeColony:667`, `FleetSystem:585`). Właściciel stanu ogłasza, zainteresowani słuchają.
⚠ **Guard niepotrzebny — zwolnienie jest IDEMPOTENTNE** (potwierdzone): `_findAssignment` zwraca
`null`, gdy nic nie ma, a `_releaseAssignment` ma własne bramki (`!a?.courseCargo`, `if (i >= 0)`).
⚠ Statek **ZOSTAJE w puli** — gracz go stamtąd nie wypisał, więc po zwolnieniu ma być znów dostępny.

**⚠ SIATKA AI NIE MIERZY TEGO, O CO PYTA D-VO1 — nowa asercja obowiązkowa w keeperze VO-3.**
`w3_attack_dispatch` przechodzi 36/36, ale przy **`liveOrder = 0`**: w całym sweepie preempcja nad
ŻYWYM rozkazem odpala **dokładnie raz**, i to nie na statku AI. Dowodzi więc „preempcja nie psuje
normalnej ścieżki AI", a **nie** „preempcja nad żywym uderzeniem AI jest bezpieczna".
⇒ **keeper VO-3 MUSI mieć: statek AI z aktywnym `attack` + drugi, ODRZUCONY rozkaz ⇒ uderzenie
przeżywa.** To jest sedno GATE B.

**Do odwrócenia w VO-3: 6 asercji w 2 plikach** (plan mówił o 2 w 1) — `moveto_no_return` T2
(`:86`, `:87` **oraz `:88`**, pominięta w planie) + `vessel_orders_seams` (`:287` S3 snapshot,
`:445` S5 osierocony rozkaz, `:448` S5 cisza). ⚠ Dodatkowo `seams:292` **zostanie zielone, ale
zrobi się JAŁOWE** — wymaga przepisania, nie odwrócenia.

---

### 3.1.3 ✅ D-VO1b (sub-decyzja) — **PODPISANA: W1 ROZDZIELONE** — czy `_preempt` zeruje `movementOrder`?

> ⚠ **To NIE jest sprzątanie. To zmiana balansu AI, przemycona w slice'ie o preempcji.**

**ZMIERZONE:** `vessel.movementOrder` **nigdy nie jest zerowane w kodzie produkcyjnym**. Domknięcia
ustawiają wyłącznie status: `MOS:1234-1236` (`completed` + `_byVessel.delete`), `:1853-1855` (przylot),
`:1591-1593` (`cancelled`). Jedyne `= null` poza fabryką to `SaveMigration.js:1786` (default migracji).
⇒ filtry Directora `if (v.movementOrder) continue` (`DirectorOffensive:83`, `DirectorDoctrine:270`)
są **LEPKIE i JEDNORAZOWE**: **okręt AI po PIERWSZYM ukończonym rozkazie już nigdy nie wejdzie do puli
uderzeniowej ani doktrynalnej.**

| | **W1 — TAK, zeruj (naprawa Findingu 119 wchodzi w zakres)** | **W2 — NIE, zostaw pole; 119 dostaje osobny podpis** |
|---|---|---|
| co naprawia | 🟢 statek gracza **wraca do puli logistycznej** (Finding 119 — dziś wypada **na stałe** po jednym rozkazie, `TransportOrderSystem:517`) · `FleetGroupPanelLogic:86` przestaje pokazywać ukończony rozkaz jako bieżący | tylko strona gracza zostaje zepsuta jak dziś |
| skutek dla AI | 🔴 **AI odzyskuje okręty**: po ukończonym uderzeniu/patrolu wracają do puli ⇒ **wielokrotne uderzenia** ⇒ **więcej `_onVesselGroupVictory`** ⇒ **więcej desantów**. To zmiana tempa AI_CAPTURE | 🟢 zero |
| keeper | 🔴 **łamie `w3_attack_dispatch` T2** (`:176`): *„rozkaz uderzenia DOMYKA SIĘ przy przylocie … nie zostaje"* — asercja **wymaga**, by `movementOrder` przeżyło przylot | ✅ nietknięty |
| ⚠ | rozdziela się na dwie osie: zerowanie **przy PREEMPCJI** (bezpieczne, pole i tak jest zastępowane) vs zerowanie **przy DOMKNIĘCIU** (to jest ta zmiana balansu) | Finding 119 zostaje otwarty i jest **realnie dokuczliwy dla gracza** |

**Rekomendacja: W1, ale ROZDZIELONE** — `_preempt` zeruje/zastępuje `movementOrder` **przy preempcji**
(darmowe, pole i tak ginie), a zerowanie **przy domknięciu rozkazu** dostaje **własny commit i własny
live-gate**, bo to jest jedyna zmiana w całym planie, która **przyspiesza AI**. ⚠ Bez rozdzielenia
gate zmierzy „AI atakuje częściej" i nie będzie wiadomo, czy to preempcja, czy odblokowanie puli.

### 3.1.4 Trzy warunki mechaniczne — **wiążące niezależnie od wariantu**

1. ⚠ **`_preempt` MUSI stać POD bramkami `issueOrder`, nie NAD nimi.** Bramki (`:193`, `:205`) są dziś
   jawnym kontraktem „odmowa PRZED mutacją stanu". `_preempt` powyżej sprawi, że **odrzucony** rozkaz
   (`vessel_in_reserve`, `target_other_system`) **skasuje żywe uderzenie** — Director sam anulowałby
   własny strike próbą nielegalnego drugiego.
2. ⚠ **Kolejność wewnątrz `_preempt` jest kontraktem.** Emisja `vessel:orderCancelled` odpala
   **synchronicznie** `VesselManager._resumeMissionAfterOrder` (`:128-129`) — czyli dokładnie mechanizm,
   który P1 ma zabić. Skasowanie `_suspendedMission` **po** emisji wskrzesi starą misję i nadpisze
   świeżo wydany rozkaz.
3. ⚠ **Punkt 2 (kasuj `_suspendedMission`) i punkt 3 (anuluj rekord ekspedycji) muszą wejść w JEDNYM
   commicie.** Sam punkt 2 daje **fałszywy negatyw predykatu końca gry** — przylot jest kalendarzowy
   (`MissionSystem:1463`), więc duch `en_route` **założy kolonię**, a karencja D9 już leci
   (`ColonyManager:339` zeruje licznik tylko przy `state.ok`).

---

## D-VO2 — Kolejność wdrożenia ✅ **PODPISANA: W2** (+ kill-switch **B**)

**Zależności są zmierzone, nie preferencyjne:**

- **P0 przed P3 i P5** — bez odkotwiczenia dystansu „kolonizuj skądkolwiek" wycenia lot z domu
  (1,813 AU dla statku stojącego 0,000 AU od celu).
- **P2 przed P3** — inaczej P3 daje przycisk „Kolonizuj", który wywołuje **teleport**, nie kolonizację
  (Finding 117: kolonia powstała **4,14 AU** od statku, który nigdzie nie poleciał). Audyt §6 mówi to
  wprost: P2 jest **warunkiem koniecznym**, żeby P3 dał realną kolonizację.
- **P5 przed P4** — P4 wymaga, żeby dwie implementacje kolonizacji zeszły się do jednej; **replacement
  musi istnieć zanim usuniemy oryginał**. ⚠ Audyt zapisał `P4 → P5`; **pomiar mówi, że to odwrotnie**.
- **P1 i P2 — wzajemnie niezależne**, ale każde zostawia inne okno niespójności (niżej).

| | **W1 — kolejność z audytu: P0 → P2 → P1 → P3 → P4 → P5** | **W2 (REKOMENDOWANA) — P0 → P2 → P1 → P3 → P5 → P4** | **W3 — P0 → P1 → P2 → P3 → P5 → P4** |
|---|---|---|---|
| różnica | P4 przed P5 | **retirement OSTATNI**, po replacement | P1 przed P2 |
| ⚠ wada | 🔴 retiruje `_startForeignColonize`, **zanim** `issueColonize` istnieje ⇒ okno, w którym kolonizacja w obcym układzie **nie ma żadnej implementacji** | brak znanej | 🟠 P1 sam kasuje ducha tylko dla **przekierowania przez gracza**; duch z **odmowy dyspozytora** (`_launch*` ignoruje zwrotkę) zostaje do P2 |
| okno niespójności | dwa | **jedno, jednocommitowe** (niżej) | jedno, ale szersze |

**Okno niespójności przy W2 — jedno, świadome, jednocommitowe.** Po **VO-2** (P2) rekord ekspedycji
statku, który został przekierowany, przestaje być **duchem dostarczającym** i staje się **zombie, który
nigdy nie przyleci**. To jest **krok do przodu** (koniec fantomowych surowców i teleportu), ale nie jest
stanem docelowym — zamyka go **VO-3** (P1, anulowanie rekordu). ⚠ Ten sam wzór, co odwrócone okno
OG-1↔OG-2 w bramce własności: **każdy moment przerwania sekwencji jest lepszy od stanu dzisiejszego**.

**Rekomendacja: W2.** Jedyna zmiana wobec audytu to **zamiana P4↔P5**, i wynika z zależności
(replacement przed retirementem), nie z wygody.

### 3.2.1 ✅ Oś towarzysząca: kill-switch — **PODPISANA: B**

Repo ma silną konwencję flag (`FEATURES.transportOrders`, `orbitalLogisticsHub`, `territoryOverlay` —
wszystkie default ON, „cały sens tej fazy to ocena w praktyce").

- **A — bez flagi** (jak P0 bramki własności): najprostsze; rollback = `git revert`. ⚠ P1 i P3 zmieniają
  **odczuwalne tempo gry**, a to jest dokładnie ta klasa, dla której konwencja flag powstała.
- **B (rekomendowane) — jedna flaga `FEATURES.unifiedVesselOrders`, default ON, obejmująca P1 + P3**
  (dwa ruchy zmieniające zachowanie gracza). P0/P2/P5 bez flagi (naprawy poprawności — nie ma czego
  wyłączać). P4 bez flagi (usunięcie kodu; flaga na usuniętym kodzie nie ma sensu).
- **C — flaga per ruch**: pięć kill-switchy. ⚠ Kombinatoryka stanów jest wtedy **niepinowalna** keeperem.

---

## D-VO3 — Retirement P4: jeden duży commit czy stopniowo? ✅ **PODPISANA: W2**

**Obawa ze zlecenia jest trafna i zmierzona: „zostawienie martwego kodu obok żywego kusi do
przypadkowego wywołania starej ścieżki".** Ale pomiar mówi coś mocniejszego (§2.3): **po P1-P3 ten kod
NIE jest martwy — jest w pełni osiągalny.** Panel obcego układu omija `FLEET_ACTIONS` w całości. ⇒
pytanie nie brzmi *„kiedy usunąć martwe"*, tylko *„kiedy zabić żywe"*.

| | **W1 — jeden duży commit po P1-P3** | **W2 (REKOMENDOWANA) — rozdzielenie po RODZAJU: semantyka w slice'ie, prune izolowany na końcu** | **W3 — wycinanie po każdym P** |
|---|---|---|---|
| kształt | jeden commit: unifikacja + usunięcie 926 lin. + migracja + i18n | **VO-6** (semantyka: unifikacja kolonizacji + przepięcie 4 przycisków w `FLEET_ACTIONS` + migracja) → **VO-7** (`chore`: prune 926 lin., **jeden commit, dwa pliki**) | fragmenty przy każdym ruchu |
| precedens | — | ✅ **`7201670`** — `chore(ui): prune dead FMO shipyard render cluster`, **1 plik, 545 usunięć, PO slice'ie funkcjonalnym**, z raw-proof nieosiągalności + `node --check` + zero-token grep + sweep + live-gate. Ten sam plik, ta sama klasa | — |
| ryzyko „przypadkowego wywołania" | 🟢 znika naraz | 🟢 znika w **VO-6** (przycisk przestaje być emitentem); **VO-7** usuwa już-nieosiągalne | 🔴 **największe** — długi stan pół-żywy |
| przeglądalność diffu | 🔴 926 usunięć **wymieszanych** ze zmianą zachowania | 🟢 diff semantyczny mały; diff prune **czysto mechaniczny** | 🟠 rozmyta |
| ⚠ | migracja save ląduje w jednym worku ze zmianą UI | wymaga **raw-proof nieosiągalności** przed VO-7 (wzór 7201670: „8 site'ów przypisania, zero feederów") | każdy krok potrzebuje własnego gate'u |

**Rekomendacja: W2.** To nie jest kompromis między W1 a W3 — to **inna oś cięcia**. Ryzyko, o które
pyta zlecenie (przypadkowe wywołanie starej ścieżki), znika w **VO-6**, gdy przycisk przestaje być
emitentem; **VO-7** usuwa wtedy kod, który jest już **dowiedzenie** nieosiągalny — dokładnie tak, jak
`7201670`.

**✅ Cztery klauzule obowiązkowe — PODPISANE 2026-08-23:**

1. **Migracja save** (§2.2) — albo bump, albo normalizator przy restore. Milczenie = zamrożone statki
   u graczy ze starym zapisem.
2. ✅ **`abortForeignRecon` ZOSTAJE** — ma **4 żywe zewnętrzne call-site'y** (`FleetActions:379`,
   `OrderService:189`, `FMO:2372/2382`) i **przeżył** naprawę Findingu 125 jako świadomie wyłączony
   z transakcji. ⇒ **VO-7 go NIE wycina**, a keeper `return_home_no_brick` **T5 przeżywa bez zmian**.
3. **`interstellar_return` NIE JEST `foreign_*`** (`FMO:2312-2324`) — to ścieżka powrotu z `cc20af5`
   (`_dispatchReturnJump`) i **musi przeżyć cięcie**. Siedzi w tym samym bloku handlerów.
4. ✅ **i18n: osierocone klucze czyszczone RĘCZNIE** w VO-7 (18 PL + 20 EN) — `check-i18n` **tego nie
   zobaczy** (§2.1), więc lista idzie do commita jawnie, nie „przy okazji”.

---

## D-VO4 — Zakres P5 (`issueColonize`) i zgodność z dzisiejszym D9 ✅ **PODPISANA: W1** (+ obie klauzule §3.4.3)

**Zlecenie prosiło o potwierdzenie, że dzisiejsze ustalenia (D9 zabrania startu z zera, ale statek
już w locie ma działać) zgadzają się z tym, co P0-P5 zmienia w modelu stanu statku. Odpowiedź: TAK
dla P5, ale przy okazji wyszło, że najcięższy problem jest w P4.**

### 3.4.1 P5 jest dla D9 i dla predykatu 111 **BEZPIECZNY** — z dowodem

- **Nie powstaje nowy typ misji.** Pełen inwentarz typów produkcyjnych to 11 pozycji;
  `issueColonize` w kształcie z audytu emituje `expedition:sendRequest {type:'colony'}` →
  `_launch` → `_launchColony`, czyli typ **już w `COLONY_OUTLET_MISSIONS`** (`PlayerViability.js:59`).
- **Noga cross-system też nie tworzy typu** — `kind` żyje w `vessel.pendingOrder`
  (`OrderService:217`), a misją zostaje `interstellar_jump` (`VesselManager:2640-2641`), czyli
  **`FOREIGN_FLOW_MISSIONS`**. Kolonizator z habitatem przechodzi zbiorem 2.
- **D9 nie jest obchodzone** — `OrderService` **nigdy nie zakłada kolonii sam**, deleguje eventem, więc
  wchodzi w `_launchColony` **razem z twardą bramką** `:648`.

⚠ **Jedno rozszerzenie, którego NIE wolno zrobić bez osobnego podpisu:** rozciągnięcie P5 na
**`found_outpost` cross-system**. Frachtowiec placówkowy **nie ma habitatu**, więc na nodze warpowej ma
tylko `interstellar_jump` i **przegrywa warunek `canColonize`** (`PlayerViability.js:119`) ⇒ predykat
odpowie „brak trasy" statkowi, który realnie leci założyć kolonię. **Fałszywy negatyw = koniec gry
przy żywej trasie.**

### 3.4.2 🔴 Ryzyko, którego zlecenie nie zamawiało: **P4 jest binarne wobec D9**

**ZMIERZONE i zweryfikowane osobiście:** `VesselManager._startForeignColonize` (`:3185-3261`) zakłada
kolonię z **zaszytym na sztywno** zestawem zasobów (`:3209-3212`: `Fe:200, C:100, Si:80, Cu:30, Ti:10,
food:80, water:80`) i ma w całym ciele **ZERO** wystąpień `canAfford` / `resourceSystem` / `spend(`
(policzone: **0**). ⇒ **przy zerze kolonii ta trasa DZIAŁA, gdy in-system odmawia.**

> ⚠ **I to obejście jest DOKŁADNIE tym, co uzasadnia zbiór 2 predykatu.** `FOREIGN_FLOW_MISSIONS`
> liczy się jako ratunek **wyłącznie dlatego**, że trasa obca omija bramkę D9. **Zbiór 2 predykatu
> i obejście D9 to jedna i ta sama rzecz, widziana z dwóch stron.**

Skutek unifikacji jest **binarny i w obu kierunkach dotyka podpisanej decyzji**:

| kierunek unifikacji | skutek |
|---|---|
| **(a) na `_launchColony`** (z bramką kosztu) | trasa obca **zamyka się** przy zerze kolonii ⇒ `FOREIGN_FLOW_MISSIONS` staje się **fałszywym POZYTYWEM** ⇒ **wraca defekt Findingu 111** („gra, która się nie kończy") w nowym miejscu |
| **(b) bez bramki** | **CICHO odwraca D9** — start z zera znów możliwy |

**Trzeciej opcji nie ma.**

| | **W1 (REKOMENDOWANA) — P5 w zakresie audytu; P4 dostaje WŁASNY podpis na D9** | **W2 — P5 + P4 razem, D9 rozstrzygane teraz** | **W3 — P5 poza zakresem (odłóż)** |
|---|---|---|---|
| istota | `issueColonize` = lustro `issueTransport`, same-system + composite, **bez** `found_outpost` cross-system | jeden podpis obejmuje kolonizację i D9 | zostaje `issueTransport/Passenger/Move/Warp/Attack/Return`, kolonizacja dalej bez fasady |
| D9 | ✅ nietknięte (P5 deleguje eventem) | ⚠ przesądzane w slice'ie o rozkazach — **zły adres**, D9 należy do arca końca gry | ✅ nietknięte |
| Finding 111 | ✅ nietknięty; zbiory **przeglądane**, nie przepisywane | 🔴 zbiór 2 predykatu trzeba przepisać **w tym samym commicie** | ✅ |
| cel (c) właściciela | ✅ osiągnięty (kolonizacja = jeden rozkaz) | ✅ | ⛔ **nieosiągnięty** |

**Rekomendacja: W1.** P5 realizuje cel (c) i jest dla obu zamkniętych arców obojętny. Pytanie „czy
trasa obca ma dalej omijać D9" jest pytaniem **o regułę gry**, nie o model rozkazów — i zasługuje na
osobny podpis w **VO-6**, z własnym wariantem i własnym live-gate'em.

### 3.4.3 ⚠ Dwie klauzule, które **muszą** trafić do zapisu decyzji

1. **Wyjątek `{preempt:false}` chroni TAKŻE predykat końca gry — nikt tego nie zapisał.**
   Audyt uzasadnia go **wyłącznie** wznowieniem misji po bitwie (`:299-302`). Ale
   `_freezeAsStationary:1157` **zeruje `vessel.mission`**, więc **w czasie bitwy `_suspendedMission`
   jest JEDYNYM nośnikiem misji `colony`**. Objęcie tej ścieżki preempcją **oślepiłoby predykat na
   czas walki** ⇒ koniec gry statkowi, który bitwę przeżyje. ⇒ to jest **drugi, niezależny powód**
   istnienia wyjątku i musi być w komentarzu, inaczej następna sesja go „posprząta".
   ⚠ **Sprostowanie mechaniczne:** `_pausePlayerSideForCombat` **nie przechodzi przez `issueOrder`** —
   woła `mos._suspendMissionIfAny` **bezpośrednio** (`DSCS:1202`). Realnym nosicielem wyjątku są więc
   **auto-odwrót i doktryna floty**, nie sama pauza. Audyt umieścił wyjątek pod złym adresem.
2. 🔴 **Para P1 × P3 daje fałszywy negatyw, którego żaden z nich nie daje osobno.** Po P3 statek
   z habitatem dostaje **klikalny** przycisk „Kolonizuj", a po P1 traci ostatni nośnik typu misji
   (po `engage`) ⇒ `canReverseFate` powie **„brak trasy"** statkowi, który **może kolonizować**.
   ⚠ Dziś predykat jest **lustrem bramki UI `FMO:7449`** — P3 tę bramkę zdejmuje, więc lustro pęka.
   ⇒ **przegląd zbiorów `PlayerViability` jest obowiązkowym punktem gate'u po VO-4**, nie
   opcjonalnym follow-upem.

---

## D-VO5 — Zasięg keeperów do świadomego odwrócenia ✅ **PODPISANA: zgoda z klasyfikacją 1/13**

**Audyt wymienił 12 keeperów „pinujących dzisiejsze zachowanie". Pomiar mówi: 13 (jeden pominięty),
a klasyfikacja ryczałtowa byłaby błędna — z 13 tylko JEDEN pinuje defekt do odwrócenia.**

| # | keeper | asercje | werdykt | uzasadnienie (indywidualne) |
|---|---|---|---|---|
| 1 | **`moveto_no_return`** | 15 | 🔴 **DO ODWRÓCENIA — i tylko T2** | **T2 (`:86`, `:87`) pinuje wprost mechanizm, który P1 kasuje**: *„in_transit + żywa misja → snapshot (intencja pursue/intercept)"*. ⚠ **T5/T6 pinują już DZIŚ stan docelowy** (`_suspendedMission` wyczyszczony po `moveToPoint`) — P1 je **uogólnia**, nie łamie. ⇒ odwracamy **2 asercje**, nie plik |
| 2 | `order_blocked_resume` | **9** (audyt mówił „4" — to **4 TESTY**, nie asercje) | 🟢 **ZOSTAJE** | Pinuje stronę **wznawiania** po `orderBlocked`, która po P1 zostaje żywa dla ścieżek systemowych. ⚠ Do przepisania sama **narracja fixture'u T2** (`:66-75` opisuje osierocenie wyprodukowane przez `pursue` **gracza**); stan wejściowy jest ustawiany ręcznie, więc **asercje nie padną** |
| 3 | `player_combat_mission_pause` | 19 | 🟢 **ZOSTAJE** — ⚠ **ale NIE udowodni `{preempt:false}`** | Kierunek audytu potwierdzony (wznowienie po bitwie **ma zostać**), ale siła dowodowa **skorygowana**: keeper **mockuje obie granice** (`:39` `_suspendMissionIfAny: () => true`, `:35` `_resumeMissionAfterOrder`) i **nie woła ani `OrderService`, ani `MOS.issueOrder`**. ⇒ dowód wyjątku wymaga **nowej asercji na realnej ścieżce** |
| 4 | `ai_capture_last_stand` | 40 | 🟠 **DO PRZEJRZENIA** | Dwa punkty wiszą na modelu, który ten slice rusza: **(a)** blok pomiarowy T7 (`:339`) pinuje *„po przylocie zwiad NADAL trzyma misję … i wisi tak bezterminowo"* — to **przesłanka**, którą cel (b) właściciela ma usunąć; **(b)** pin na `??` (`:313`) opisuje stan (`mission=move_to_point` + `_suspendedMission=colony`), który po P1 **przestanie powstawać** ⇒ pin zrobi się **jałowy** (zielony test przestanie opisywać rzeczywistość) |
| 5 | `s34_faza4` | 80 | 🟠 **DO PRZEJRZENIA — największa robota** | **9 wywołań `_checkArrivals` jedzie na mocku `dispatchOnMission` (`:85`), który zostawia statek `in_transit` i NIGDY nie stempluje `dockedAt` celu** ⇒ po P2 te przyloty przestaną się odpalać i **~40 asercji sekcji 4/5/6/9/10 padnie NA FIXTURZE, nie na intencji**. Osobno: **8.1** (`:290`) pinuje **BRAK** pozycji w menu — po P3 `hasAction()` będzie `true`. **7.8 zostaje** (dok wymagany do zaokrętowania POP — zgodne z regułą P3) |
| 6 | `load_colonists` | 27 | 🟠 **DO PRZEJRZENIA** | **2.3** (`:84`) mierzy **NIEOBECNOŚĆ** pozycji w menu, a P3 zamienia nieobecność na „obecna + zablokowana" ⇒ do przepisania na „obecna z `reason`". **3.2 zostaje** (`orbiting` → `reasonNotDocked`) — to dokładnie ta bramka, którą P3 **jawnie zostawia**. ⚠ **4.7** (`:156`) odwzorowuje wzór `_startForeignColonize` — po P4 komentarz przestanie wskazywać istniejący kod |
| 7 | `w2_deploy_ui` | 23 | 🟠 **DO PRZEJRZENIA (kosmetyka)** | **T4a** (`:166-167`) wchodzi w early-return `_drawActions` **wyłącznie** przez stan `'none'` spoza trzech kubełków. Po P3 lista **nigdy nie będzie pusta** ⇒ asercja **dalej przejdzie, ale przestanie cokolwiek mierzyć** — klasyczna **jałowa kontrola pinu** |
| 8 | `a4_transport_outpost_explored_gate` | 14 | 🟢 **ZOSTAJE** | Wchodzi **poniżej** bramki, którą rusza P2: woła `_processTransportArrival` **wprost** (`:57`), z pominięciem `_checkArrivals`. Pinowana intencja jest ortogonalna |
| 9 | `s3_0a_d` | 33 | 🟢 **ZOSTAJE** | **T7** (`:176-178`) pinuje **dokładnie tę zasadę**, którą domknął Finding 125: odmowa rozkazu powrotu **nie może mutować stanu statku**. ⚠ Ale woła `startReturn` **bezpośrednio**, więc **NIE pokrywa** ryzyka, że destrukcyjny `_preempt` odpali się na wejściu intentu **zanim** bramka paliwa odmówi ⇒ **potrzebna nowa asercja przez `OrderService.issueReturn`** |
| 10 | `stage4_launch_gravity` | 47 | 🟢 **ZOSTAJE** | Jedyne odwołania do `position.state` są **CENNIKOWE, nie uprawnieniowe** (`docked` rozstrzyga studnię grawitacyjną startu; start z przestrzeni = fail-open ×1.0). P3 czyni tę gałąź **częstszą**, nie błędną |
| 11 | `w2_deploy_model` | 27 | 🟢 **ZOSTAJE** | Wszystkie wykluczenia stoją na osi **ZDOLNOŚCI** (`isInService`), nie na kubełku `position.state` — czyli **dokładnie tam, gdzie P3 chce, żeby decyzja zapadała**. Zero styku z preempcją, przylotem i `foreign_*` |
| 12 | `w3_attack_dispatch` | 34 | 🟢 **ZOSTAJE — i jest SIATKĄ BEZPIECZEŃSTWA dla D-VO1** | T1-T4 jadą `mos.issueOrder` **na statkach AI** (`:77` `owner: empireId`) ⇒ **jeśli szew preempcji jest zły, ten keeper zaświeci na czerwono**. ⚠ **T2 (`:176`) łamie się przy D-VO1b = W1 w wariancie „zeruj przy domknięciu"** — wymaga, by `movementOrder` przeżyło przylot |
| **13** | **`foreign_recon_analyzed`** ⬅ **NIE BYŁO W AUDYCIE** | 14 | 🔴 **UMIERA z P4** | Woła `_tickForeignRecon` (`:66/:80/:110`) i `_startForeignRecon` (`:94`) **bezpośrednio** ⇒ do skasowania albo przepisania na nową ścieżkę. **Bez tego wpisu inwentarz keeperów P4 jest niepełny** |

**Poza tą trzynastką (do odnotowania):** `return_home_no_brick` **T5** stubuje `abortForeignRecon`
(`:92`) ⇒ **przeżyje, o ile `abort` zostaje** (D-VO3 punkt 2).
**Fałszywe trafienia grepu `foreign`** (5 plików — nie dotyczą): `colony_tile_membership` („cudzy
kafel"), `w3_cross_system_attack` (funkcja `foreignBody()`), `moveto_*` (`systemId: 'sys_foreign'`).

**Rekomendacja D-VO5: DO ODWRÓCENIA jest DOKŁADNIE JEDEN keeper i DOKŁADNIE DWIE asercje**
(`moveto_no_return` T2, `:86` i `:87`). Cztery keepery to **przegląd fixture'ów** (4-7), jeden
**umiera z P4** (13), siedem **zostaje bez zmian**.
⚠ **Odwrócenie MUSI być opisane w komentarzu keepera** — precedens: `deploy_seams` T1/T2/T4 (W2),
`colony_ownership_seams` S4 (P0), `s34c_z9_transfer_dispose`, `ai_capture_last_stand` T4/T5A (D-111).
Bez tego następna sesja przywróci defekt, „naprawiając regresję".

---

# §4 PLAN COMMITÓW (do podpisu razem z decyzjami)

✅ **ZATWIERDZONY W CAŁOŚCI 2026-08-23.**
⚠ **Kolejność wynika z zależności z D-VO2, nie z wygody.** Nazewnictwo wzorem `OG-*` / `W2-*` / `AC-*`.
⚠ **SAVE: VO-1…VO-5 = ZERO MIGRACJI (v101 bez zmian). Migracja pojawia się DOPIERO w VO-6** —
to jedyny commit w tym planie, który dotyka formatu zapisu.

| # | commit | treść | wynika z | gate |
|---|---|---|---|---|
| **VO-0** | `test: keeper szwow modelu rozkazow` | Pinuje **STAN DZISIEJSZY wykonaniem**, z kontrolą pinu przy każdym: **S1** duch misji dostarcza pod nieobecność statku · **S2** `arriveAtTarget` teleportuje do celu **nowego** rozkazu · **S3** `_suspendedMission` wskrzeszany po `pursue` · **S4** `movementOrder` przeżywa domknięcie i wypycha statek z puli logistycznej · **S5** `issueOrder` **nie ma** guardu „statek ma już rozkaz" · **S6** menu = 3 kubełki (`docked` 6 / `in_transit` 1 / `orbiting` 3). ⚠ **Wszystkie sześć MA paść** w VO-2..VO-4 i zostać **świadomie odwrócone** | — | — |
| **VO-1** | `fix(fleet): dystans misji liczony od statku, nie od planety macierzystej` | **P0** — `_calcDistance` wzorem `_launchTransport:849-856`. Finding 122 | P0 | — |
| **VO-2** | `fix(fleet): przylot misji nalezy do statku, nie do kalendarza` | **P2, obie połowy w jednym commicie** — warunek „statek u celu" w `_checkArrivals` + **głośna odmowa** w pięciu `_launch*`. Kasuje 115/116/117. ⚠ Przegląd fixture'ów `s34_faza4` | P2 | 🔒 **GATE A** |
| **VO-3** | `fix(fleet): nowy rozkaz przerywa stary` | **P1 + D-VO1=W1** (za flagą `FEATURES.unifiedVesselOrders`) — `_preempt` **pod** bramkami `issueOrder`; kolejność wewnętrzna wg §3.1.4; `AutoRetreatSystem` dostaje wymuszenie **tu**; zerowanie `movementOrder` **tylko przy preempcji**. Kasuje 118/119(część)/126/127. ⚠ Odwrócenie `moveto_no_return` T2 | P1, D-VO1 | 🔒 **GATE B** (największe ryzyko regresji AI) |
| **VO-3b** | `fix(fleet): rozkaz domyka sie i zwalnia statek` | **D-VO1b** — zerowanie `movementOrder` **przy domknięciu**. **OSOBNY commit, bo to JEDYNA zmiana balansu w planie.** Domyka Finding 119. ⚠ Odwrócenie `w3_attack_dispatch` T2 | D-VO1b | 🔒 **GATE B2** (pomiar tempa AI) |
| **VO-4** | `feat(fleet): menu akcji z mozliwosci, nie ze stanu` | **P3** (za tą samą flagą `unifiedVesselOrders`) — `getAvailableActions` bez kubełków, akcje zablokowane **z powodem**; **58 bramek przesądzonych indywidualnie** (tabela w commicie). ⚠ `drop_troops`/`orbital_strike` **zostają przy `orbiting`** i dostają brakujący guard `dockedAt != null` (R-8). Kasuje 120/128, zamyka 99 | P3 | 🔒 **GATE C** (+ obowiązkowy przegląd zbiorów `PlayerViability`, §3.4.3 pkt 2) |
| **VO-5** | `feat(fleet): OrderService.issueColonize` | **P5 = D-VO4/W1** — lustro `issueTransport` + **własna gałąź w `_maybeDeliver`** (inaczej `target_lost`, `OrderService:270`). **Bez** `found_outpost` cross-system | P5, D-VO4 | — |
| **VO-6** ⚠ **JEDYNY COMMIT Z MIGRACJĄ SAVE** | `refactor(fleet): jedna kolonizacja, rozkazy obcego ukladu jako zwykle akcje` | **P4 semantyka** — cztery przyciski do `FLEET_ACTIONS`; bramka `FMO:7449` znika (Finding 121); **unifikacja dwóch kolonizacji** + **podpis D9** (§3.4.2 a/b) + **migracja save** (§2.2). ⚠ `interstellar_return` **zostaje** | P4, D9 | 🔒 **GATE D** |
| **VO-7** | `chore(fleet): prune martwej warstwy foreign_*` | **P4 mechanika, wzorem `7201670`** — `VesselManager:2848-3320` **minus `abortForeignRecon` (ZOSTAJE)** + 4 bloki FMO + subskrypcje + **ręczne** czyszczenie 18/20 kluczy i18n. **Poprzedzone raw-proofem nieosiągalności.** ⚠ `interstellar_return` **zostaje**. Keeper `foreign_recon_analyzed` skasowany/przepisany | D-VO3/W2 | 🔒 **GATE E** |
| **VO-8** | `docs: rejestr + close-out` | Findings 130-135, sprostowania audytu (§2), `CLAUDE.md`, `MEMORY.md` | — | — |

**Per-commit, bez wyjątków (konwencja projektu):** `node src/testing/smoke/run-all.mjs` **0 FAIL** ·
`node tools/check-i18n.mjs` **PASS** · commit atomowy · staging **po jawnych ścieżkach** ·
`git status --short` + `--cached --stat` pokazane właścicielowi **przed** commitem · **live-gate robi
właściciel**.

### 4.1 Gate'y — co konkretnie musi zostać zmierzone

> ⚠ **Dowodem jest SKUTEK, nie bramka** (lekcja Findingu 106) · ⚠ **`KOSMOS.debugLog` NIE zna zdarzeń
> floty** (`TRACKED_EVENTS` bez ani jednego) — pusty `tail()` **nie rozróżnia ścieżek**; kanałem floty
> jest **Dziennik, kanał `fleet`** · ⚠ **filtry gate'u nigdy po TEKŚCIE Dziennika** (gra po angielsku).

- **GATE A (po VO-2)** — wydaj rozkaz ruchu statkowi na misji `mining` w przeciwną stronę; **magazyn
  kolonii bez zmian** (dziś: `{Fe:+30, Si:+7.12, Ti:+5}`) i **statek nie teleportuje się**.
  Kontrola pinu: normalna misja **dolatuje i wypłaca** jak dotąd.
- 🔒 **GATE B (po VO-3) — NAJWAŻNIEJSZY, bo mierzy AI.** (1) Rozkaz gracza przerywa misję i statek
  **nie wraca** do starej roboty. (2) **Statek wraca do puli logistycznej** po ukończonym rozkazie.
  (3) **AI: uderzenie `strike_player_target` dolatuje i rozlicza się jak dotąd** (keeper
  `w3_attack_dispatch` to lustro headless). (4) **Odwrót AI po bitwie DZIAŁA** (wymuszenie).
  (5) Kontrola pinu: **wznowienie misji po bitwie żyje** (`m4PlayerCombatMissionPause`, §2.6).
- **GATE B2 (po VO-3b)** — **pomiar tempa**: liczba uderzeń AI i desantów w N lat gry, **porównana
  z przebiegiem sprzed VO-3b**. To jedyny gate w tym planie mierzący **balans**, nie poprawność.
- **GATE C (po VO-4)** — zaparkowany kolonizator ma **klikalny** przycisk „Kolonizuj" i klik daje
  **realną kolonię NA CELU** (`getPlayerColonies()` +1, statek skonsumowany) — **nie teleport**.
  ⚠ Plus obowiązkowo: **przegląd `PlayerViability`** (§3.4.3 pkt 2) — czy predykat nadal odpowiada
  prawdę dla statku, który dostał nowy przycisk.
- **GATE D (po VO-6)** — kolonizacja w obcym układzie **przechodzi jedną ścieżką**; zachowanie przy
  **zerze kolonii** zgodne z podpisanym kierunkiem D9; **stary zapis z misją `foreign_recon` wczytuje
  się i statek NIE jest zamrożony**.
- **GATE E (po VO-7)** — zero błędów konsoli, panel floty i obcy układ działają, sweep 0 FAIL.

---

# §5 RYZYKA (rankowane)

**R-1 (wysokie) — 🔴 zerowanie `movementOrder` przy domknięciu to ZMIANA BALANSU AI, nie sprzątanie.**
Filtry `DirectorOffensive:83` / `DirectorDoctrine:270` są dziś **lepkie i jednorazowe** (pole nigdy nie
jest zerowane). Odblokowanie ich daje **wielokrotne uderzenia AI ⇒ więcej desantów ⇒ szybsze
AI_CAPTURE**. **Mitygacja: D-VO1b jako osobny commit + GATE B2 mierzący tempo.**

**R-2 (wysokie) — 🔴 `_preempt` emitujący `orderCancelled` wskrzesza to, co ma zabić.**
`VesselManager:128-129` subskrybuje **synchronicznie** i woła `_resumeMissionAfterOrder`. Zła kolejność
⇒ stara misja nadpisuje świeżo wydany rozkaz. **Mitygacja: kolejność wewnętrzna jako kontrakt (§3.1.4
pkt 2) + asercja w keeperze.**

**R-3 (wysokie) — 🔴 `_preempt` NAD bramkami sprawia, że ODRZUCONY rozkaz kasuje żywy.**
`issueOrder` ma jawny kontrakt „odmowa przed mutacją" (`:193`, `:205`). Dotyczy **też AI**: Director
anulowałby własny strike próbą nielegalnego drugiego. ⚠ `s3_0a_d` T7 **tego nie pokrywa** (woła
`startReturn` wprost). **Mitygacja: `_preempt` pod bramkami + nowa asercja przez `OrderService.issueReturn`.**

**R-4 (wysokie) — 🔴 P4 jest binarne wobec D9** (§3.4.2): albo wraca defekt Findingu 111, albo cicho
odwracamy podpisaną regułę. **Mitygacja: osobny podpis D9 w VO-6, własny live-gate.**

**R-5 (wysokie) — 🔴 P4 wymaga migracji save** (§2.2). Milczenie = **zamrożone statki** u graczy ze
starym zapisem (misja serializowana spreadem, bez białej listy). **Mitygacja: migracja albo
normalizator przy restore, przesądzone w VO-6.**

**R-6 (średnie) — 🟠 para P1 × P3 daje fałszywy negatyw predykatu końca gry** (§3.4.3 pkt 2), którego
**żaden z nich nie daje osobno**. ⚠ `ai_capture_last_stand` **tego nie złapie** — T7 testuje czystą
funkcję na ręcznie budowanych obiektach (`:304`, `:313`), więc **zielony test przestanie opisywać
rzeczywistość**. **Mitygacja: przegląd zbiorów jako punkt GATE C.**

**R-7 (średnie) — 🟠 `AutoRetreatSystem` jest jedynym producentem bez guardu i to jest ZAMIERZONE.**
Odwrót **ma** bić atak. Każda odmowa typu „statek ma już rozkaz" złamie odwrót AI i wyląduje
w `vessel:autoRetreatFailed` (`:137-139`). ⚠ **Metoda jest osiągalna dla OBU stron** — `DSCS:1236`
woła `_issueRetreatOrder` także dla statków **gracza**. **Mitygacja: wymuszenie w VO-3.**

**R-8 (średnie) — 🟠 `drop_troops` bierze cel z `position.dockedAt` BEZ guardu na `null`**
(`FleetActions:541/546/561`), a stan `orbiting` + `dockedAt=null` jest **realny** (`MOS:1252-1253` —
dryf/engage). **Dziura jest PRE-EXISTING**; P3 ją **uwidoczni w menu**. ⇒ `drop_troops` i
`orbital_strike` **zostają przy `orbiting`** i dostają brakujący guard. ⇒ **Finding 132.**

**R-9 (średnie) — 🟠 ~40 asercji `s34_faza4` padnie NA FIXTURZE, nie na intencji** (mock
`dispatchOnMission` nigdy nie stempluje `dockedAt`). ⚠ **Największe ryzyko procesowe:** pokusa
„naprawienia" testu przez **osłabienie P2**. **Mitygacja: fixture naprawiany, warunek P2 nietykalny.**

**R-10 (średnie) — 🟠 `EmpireLogisticsSystem` ma ZERO odwołań do `movementOrder`** (grep = 0) —
wyprowadza stan kuriera z (`status`, `position.state`, `mission.phase`). Gdyby kurier kiedykolwiek
dostał `movementOrder`, maszyna stanów **jej nie zobaczy**, a `_advanceAllCouriers` chodzi **każdy
tick**: MOS parkuje statek w `orbiting` (`:1623-1625`), gałąź dispatchu wymaga `docked` ⇒ **ciche
limbo**. Dokładnie ta klasa, przed którą ostrzega komentarz W2-7 (`:360-372`).

**R-11 (średnie) — 🟠 P3 × P2 blokuje dowóz wojska.** `orbit` (`FleetActions:302`) jest bramkowany na
`docked` i tworzy misję; rozluźnienie go **bez zmiany dyspozytora** (`VesselManager:396` wymaga
`docked`+`idle`) da po P2 **przycisk aktywny + głośną odmowę**. Wariant z orbity **istnieje osobno**
(`redispatchFromOrbit:453`) i to jest właściwy adres.

**R-12 (niskie, mina) — ⚪ `DirectorFirstContact` porusza sondą bezpośrednim zapisem `position.x/y`
co tik** (`:225-226`), bez `mission` i bez `movementOrder`. **Żaden mechanizm rozkazów jej nie
dosięgnie.** Jeśli którykolwiek keeper założy „każdy statek AI da się zatrzymać rozkazem" — założenie
jest **fałszywe** dla tej klasy.

**R-13 (niskie) — ⚪ i18n: 18 kluczy PL + 20 EN osieroci się przy P4, a `check-i18n` tego nie zobaczy**
(pyta o klucze **użyte** w `t()`, nie o **nieużywane**). Ta sama klasa martwego kąta co Finding 113.

**R-14 (niskie) — ⚪ typ `foreign_recon` jest zaszyty poza dwoma dużymi plikami w trzech miejscach:**
`PlayerViability.js:68`, `FleetPictureLogic.js:97`, `NavPeekProviders.js:47`. Pierwsze z nich to
**predykat końca gry z zamkniętego arca**.

### 5.1 ⚠ Czy to dotyka AI_CAPTURE? — odpowiedź wprost

**Rdzeń AI_CAPTURE jest ODPORNY, z dowodem — ale są cztery styki, wszystkie wymienione wyżej.**

**Co jest bezpieczne (ZMIERZONE):**
- `InvasionSystem` (524 lin.) ma **ZERO trafień** na `mission|movementOrder|position\.|dockedAt|
  expedition|arriv`. Czyta wyłącznie `isWreck`, właściciela, `canDropTroops`, `troopCapacity`,
  `groundUnits` (`:222-226`) i dominację orbitalną (`:211`).
- **Desant nie idzie przez `MissionSystem` w ŻADNĄ stronę**: AI = `battle:resolved` → `launchInvasion`
  → `createUnit` (`:130`); gracz = `vessel:dropTroopsRequest` → `ColonyOverlay:310` →
  `unloadGroundUnit` (`Vessel.js:734`). Żadna nie tworzy rekordu ekspedycji.
- `transferColony` czyta **tylko** `position.state === 'docked'` (`ColonyManager:865`);
  `captureColonyForPlayer` (`:982-1048`) **nie ma ani jednego odwołania do statku**.
- **Uderzenie AI omija `_checkArrivals` w całości** — `_issueAttack` pisze `vessel.mission` wprost
  (`MOS:673`, `:294`), a przylot łapie `VesselManager._updatePositions:2369`. ⇒ **P2 nie dotyka pętli
  AI_CAPTURE**; Findings 115/116 **nie są jej podporą**.
- Keepery `ai_capture_army/intent/ledger/outpost/seams/visibility` i `invasion_player_capture` mają
  **zero** odwołań do modelu misji/rozkazów.

**Cztery styki:** **R-1** (tempo desantów) · **R-2/R-3** (kolejność i miejsce wpięcia mogą zerwać
uderzenie AI) · **R-6** (D9/koniec gry) · **R-8** (desant gracza).
⚠ **Tło, które zmienia proporcje:** mechanizm zrywający uderzenie AI **istnieje już dziś i jest
cięższy** — `DSCS:1157` zeruje misję wroga przy starciu (**Finding 130**).

---

# §6 POZA ZAKRESEM (świadomie)

**Potwierdzenie, o które prosiło zlecenie — oba sąsiednie arce są ZAMKNIĘTE i ten plan ich NIE RUSZA,
tylko z nimi WSPÓŁISTNIEJE:**

- ✅ **Finding 111** (`PLAYER_VIABILITY_PREDICATE_PLAN.md`, `a180619`, zamknięty 2026-08-20).
  Ten plan **nie dotyka `PlayerViability.js`**. Rozwiązuje **przesłankę**, na której 111 stał
  (zaparkowany statek odzyska realne rozkazy), ale **predykatu nie zmienia**. ⚠ **Jedyny obowiązek:
  PRZEGLĄD zbiorów po VO-4** (§3.4.3 pkt 2) — plan 111 zapisał to wprost: *„zbiory trzeba będzie
  **przejrzeć ponownie**, nie przepisać"*. ⚠ Jeśli przegląd wykaże konieczność zmiany zbiorów —
  to jest **osobny podpis w tamtym planie**, nie w tym.
- ✅ **D1-D6 + P0 bramki własności** (`COLONY_OWNERSHIP_GUARD_PLAN.md`, `e964c6b`, zamknięty
  2026-08-22). Ten plan **nie dotyka `ColonyOwnership.js`, `ColonyOrderGuard.js` ani
  `switchActiveColony`**. Rodziny terminów **nie mieszamy**: własność KOLONII to tamten kanon,
  własność STATKU to `isEnemyVessel` (`Vessel.js:437-443`).
- ✅ **Finding 125** (`cc20af5`) — `ReturnJump.js` **zostaje nietknięty**; P1 nie może go obejść
  (`s3_0a_d` T7 + `return_home_no_brick` 77/77 to pilnują).
- ✅ **W2 `serviceState` / `isInService`** — oś rezerwy jest **ortogonalna** i zostaje
  (`w2_deploy_model` bez zmian).

**Poza zakresem także (z audytu §4, potwierdzone):**
- **kolejkowanie rozkazów (shift-klik)** — to **przeciwieństwo** celu (a);
- **fizyczna podróż zamiast teleportu w auto-powrocie z dryfu** (M5 backlog);
- **retirement `MissionSystem`** — rekord ekspedycji zostaje, zmienia się tylko jego **autorytet**;
- **ujednolicenie `mission` i `movementOrder` w jedno pole** — kuszące, ale to przepisanie, nie zmiana;
- **Findings 102/104/107** (wyciek locka załogi, osierocone jednostki desantowe na trasie obcej) —
  ta sama trasa, **inne defekty**; wchodzą w zakres **tylko wtedy**, gdy D-VO4 pójdzie wariantem W2;
- **Finding 123** (wyciek celów cross-system na trzech ścieżkach) — audyt oznaczył go jako
  **NIE zmierzony wykonaniem** (headless generuje jeden układ); wymaga harnessu z realną galaktyką;
- **Findings 130-135** (nowe, §7) — **filed, nie w zakresie**, poza R-8, który wchodzi w VO-4.

---

# §7 FINDINGS FILED (numeracja ciągła po 129 z audytu)

130. 🔴 **DSCS rozpuszcza uderzenie AI w chwili starcia.** `_freezeAsStationary:1155-1157` ustawia
     `vessel.mission = null` **bezwarunkowo** dla każdego statku strony B (`:355`; strona B to zawsze
     AI, `:293`), **bez snapshotu i bez ścieżki wznowienia** (`:1217-1219` wychodzi przy braku strony
     gracza). `EnemyAttackHandler:41` bramkuje na `mission.type !== 'attack'` ⇒ **po bitwie nie
     rozpozna napastnika**. Okręt wysłany regułą `strike_player_target` traci misję, gdy tylko wejdzie
     w zasięg walki. **Zweryfikowane osobiście.** ⚠ To jest **cięższa** ingerencja w rozkazy AI niż
     cokolwiek, co proponuje P1.
131. 🟠 **`VesselManager._onColonyDestroyed` re-homuje statki AI do kolonii GRACZA.** `:1123` iteruje
     **wszystkie** statki **bez filtru właściciela**; `:1130` przypisuje `vessel.colonyId = homePlanetId`
     z `_resolvePlayerHomePort` (`:1100-1105`, **wyłącznie kolonie gracza**), `:1133-1135` dopisuje do
     `homeColony.fleet`, `:1137` wymusza `startReturn({force:true})`. ⇒ statek AI lecący z misją
     `attack` na kolonię gracza, która ginie fizycznie, zostaje **przepisany na gracza** i zawrócony.
132. 🟠 **`drop_troops` bierze cel z `position.dockedAt` bez guardu na `null`.**
     `FleetActions:541/546/561`; stan `orbiting` + `dockedAt=null` jest udokumentowany jako realny
     (`MOS:1252-1253`). **Pre-existing**; P3 uwidoczni go w menu. ⇒ w zakresie **VO-4** (R-8).
133. 🟠 **`_suspendMissionIfAny` snapshotuje wyłącznie przy `in_transit`** (`MOS:149`) ⇒ **orbitujący**
     kolonizator z misją `colony`, któremu wydano `engage`, traci ją **bez śladu już dziś**
     (`:871` nadpisuje `vessel.mission`, snapshot nie powstaje). Pre-existing, poza P1.
134. ⚪ **Typ `foreign_recon` zaszyty poza `VesselManager`/`FMO` w trzech miejscach:**
     `PlayerViability.js:68` (predykat końca gry), `FleetPictureLogic.js:97`, `NavPeekProviders.js:47`.
     Inwentarz P4 bez nich jest niepełny.
135. ⚪ **`docs/player-combat-mission-pause.md` deklaruje flagę `default OFF`, a `GameConfig.js:86` ma
     `true`.** `player_combat_mission_pause_smoke.mjs:126` ustawia `false` z komentarzem *„przywróć
     default"*. ⇒ wyjątek `{preempt:false}` jest nośny **dziś**, nie hipotetycznie.

136. ⚪ **`ExpeditionPanel.js:453` przekazuje drugi argument, którego żywy `MissionSystem` nie
     przyjmował** — `exSys?._calcDistance(body, activeColonyPlanet)`, przy `exSys` = alias na
     `MissionSystem`. **ZMIERZONE:** to samo wejście dawało `3.3450 AU` (żywy, ignorował origin) vs
     `4.1370 AU` (martwy fork, honorował) — **0.7920 AU po cichu połknięte**. ⚠ Defekt **LATENTNY**:
     `ExpeditionPanel` ma **zero importerów** w repo, więc ta linia nigdy się nie wykonuje.
     ⚠ Komentarz nad nią (`:443`) mówi wprost *„Odległości od aktywnej kolonii (nie zawsze
     homePlanet)"* — **intencja została zapisana, mechanizm nie**. Po VO-1 sygnatura wreszcie
     przyjmuje ten argument, więc gdyby panel ożył, wywołanie stałoby się poprawne.
     ⚠ **Historia (git, ZMIERZONE):** naprawa **nigdy nie była** w `MissionSystem`. Ten powstał
     2026-03-06 (`503eff3`) jako kopia ówczesnego forka. Naprawa trafiła do forka **12 dni później**
     (`18b38f1`) — w commicie, który **w tym samym diffie ruszał żywy `MissionSystem`**. Fork był
     potem pielęgnowany na ślepo jeszcze ~4 miesiące (16 commitów, w tym 410-liniowa „Colonization
     reform"), a pliki rozjechały się o ~848/1547 linii.

---

## Findings z live-gate VO-1 (2026-08-23) — obserwacje z ŻYWEJ gry

⚠ **Żaden z poniższych nie jest skutkiem VO-1** — wykluczone WYKONANIEM (kontrola odwrotna:
ta sama sekwencja na dzisiejszym kodzie i na semantyce sprzed VO-1 → **zero różnic**, przy dowiedzionej
skuteczności patcha: `exp.distance` 0.0500 vs 5.0500 AU). `ecf8233` tknął **dwa pliki**, a
`MovementOrderSystem` i `MissionSystem` **nie znają nawzajem swoich nazw** (grep w obie strony = 0).

137. 🟠 **Domknięty rozkaz jest w UI nieodróżnialny od żywego, a statek cicho wypada z trzech pul.**
     Konsekwencja Findingu 119 **zaobserwowana na żywo**. Po domknięciu `moveToPoint` w **pusty punkt**
     (`targetEntityId: null`) statek zostaje z markerem `status:'completed'`, `_byVessel` pusta
     (**poprawnie** — `_indexExistingOrders:115` pomija nie-`active`), pozycja zamrożona
     (**zaprojektowany dryf**, `MovementOrderSystem.js:1857`: *„statek dryfuje w punkcie… gracz musi
     wydać kolejny order"*).
     ⚠ **Mechanicznie wszystko działa** — nowy rozkaz przechodzi natychmiast (ZMIERZONE: `ok:true`,
     1.000 AU w rok). **Szkoda jest informacyjna:** martwy marker wypisuje statek z puli logistycznej
     (`TransportOrderSystem:517`), uderzeniowej AI (`DirectorOffensive:83`) i doktrynalnej
     (`DirectorDoctrine:270`), a panel floty pokazuje **domknięty rozkaz jako bieżący**
     (`FleetGroupPanelLogic:86`). Gracz nie dostaje sygnału, że statek doleciał i czeka.
     ⚠ **Koszt zmierzony w praktyce: jedna runda live-gate'u** — obserwator uznał statek za trwale
     zamrożony i wstrzymał weryfikację.
     ⚠ Wspólny wzorzec z **Findingiem 125**, ale **inna klasa szkody**: 125 odbierał ZDOLNOŚĆ startu,
     137 odbiera wyłącznie WIEDZĘ. ⇒ **naprawa w VO-3b**; do jego gate'u dochodzi kryterium
     *„statek po ukończonym rozkazie WRACA do puli i panel przestaje pokazywać rozkaz"*.

138. 🔴 **`VesselManager._findBodyNearPoint` skanuje CAŁĄ GALAKTYKĘ — blokuje graczowi rozkaz ruchu
     we WŁASNYM układzie.** Iteruje `EntityManager.getByType(type)` **bez filtru układu**, z progiem
     `SNAP_TO_BODY_AU = 0.5 AU`. Ponieważ **współrzędne są LOKALNE dla układu** (gwiazda każdego stoi
     w `(0,0)`), ciała obcych układów siedzą w tych samych zakresach liczbowych.
     Łańcuch: „leć tutaj" → `_issueMoveToPoint:534-537` auto-przejmuje ciało spod punktu → snap trafia
     w **obce** ciało → bramka W3-4b (`isSameSystem`) odrzuca jako **`target_other_system`**.
     ⚠ **Bramka jest poprawna — zepsuty jest snap tuż nad nią.** Komentarz nad bramką (`:539-545`)
     tłumaczy dokładnie lekcję *„identyfikatory GLOBALNE, współrzędne lokalne"*, a wywołanie trzy
     linie wyżej ją łamie.
     ⚠ **`EntityManager.getByTypeInSystem(type, systemId)` ISTNIEJE** (`:82`) i jest używane gdzie
     indziej — naprawa to podmiana wywołania + przekazanie `vessel.systemId`.
     ⚠ **Czwarty site klasy Findingu 123 — i pierwszy, który BLOKUJE gracza**, a nie tylko cicho źle
     liczy. Im więcej wygenerowanych układów, tym częstsze trafienie.
     **PRE-EXISTING, poza zakresem VESSEL_ORDERS** (to bramkowanie celu, nie model rozkazów).
     Obejście na czas arca: podawać **jawny cel-ciało** zamiast punktu (`spec.targetBodyId` pomija snap).
     **ZAMKNIĘTE 2026-08-27** — slice `138+142`, audyt `docs/audit/SYSTEM_SCOPE_138_142_AUDIT.md`,
     decyzje D-SS1..D-SS5b. Naprawa: `_findBodyNearPoint(x, y, maxAU, vessel)` — zakres liczony
     WEWNĄTRZ funkcji przez `systemIdOf` (D-SS1=W1), bo kontrakt należy do helpera, nie do
     jedynego dzisiejszego wołającego.
     ⚠ **PROPOZYCJA Z TEGO WPISU BYŁA BŁĘDNA:** `getByTypeInSystem` jest **fail-CLOSED**
     (zmierzone: ciało bez stempla → 0 wyników), a repo odrzuciło ją z tego powodu explicite —
     `RetreatTarget.js:70-72`. Tu było to wiążące podwójnie: PRZED naprawą filtra nie było
     żadnego, więc fail-closed byłby regresją, nie naprawą. Użyto `systemIdOf` (D-SS2=W1).
     ⚠ **SKALA ZMIERZONA** (sonda `probe-system-scope-138-142.mjs` §2, realne układy
     z `SystemGenerator`): przy **1** wygenerowanym układzie defekt **NIE ISTNIEJE (0 %)** —
     układy powstają leniwie. Przy 12 układach **90,9 %** snapujących klików bierze obce ciało,
     przy 20 — **94,6 %**. To defekt fazy średniej/późnej, nie startu.
     ⚠ **KSZTAŁT OBJAWU BYŁ WĘŻSZY, NIŻ BRZMI:** klik DOKŁADNIE na własnym ciele wygrywa
     **62/62** (dystans 0 jest nie do pobicia). Bolało klikanie w PUSTĄ PRZESTRZEŃ — i dlatego
     przeżyło tak długo. 14/62 własnych ciał ma jednak obcego rywala w promieniu 0,5 AU.
     Keeper `system_scope_orders_smoke` (T1 wykonaniowo, T2e pin źródłowy na producenta).

139. ⚪ **`cancelOrder` czyta MARKER, nie indeks** (`vessel.movementOrder`, wymóg `status === 'active'`)
     ⇒ mutuje dawno martwy rozkaz mimo pustego `_byVessel`, ustawiając `blockReason`. Facet Findingu
     119; **domyka się razem z VO-3b**. ⚠ Praktycznie użyteczne: `movementOrder.blockReason` jest
     **jedynym śladem**, kto anulował rozkaz.

140. 🟠 **Hook re-indeksu `GameScene.js:2109-2110` nie jest pinowany przez ŻADEN keeper**, a
     `GameScene` **nie importuje się pod node** ⇒ jego regresja byłaby **niewidzialna dla sweepu**,
     a objawem byłby zamrożony statek po wczytaniu u każdego gracza.
     ⚠ **SPROSTOWANIE do potocznej diagnozy „MOS nie ma serialize/restore, więc `_byVessel` jest
     ZAWSZE puste po wczytaniu": to NIEPRAWDA.** MOS istotnie nie ma własnej serializacji — i **nie
     potrzebuje jej**, bo rozkazy są zapisywane **na statkach** (`VesselManager.serialize:1325-1334`,
     pełna głęboka kopia ze `status`), a indeks odbudowuje `_indexExistingOrders` wołane po
     `vesselManager.restore`. **ZMIERZONY round-trip:** rozkaz `active` → zapis → nowy MOS (`size 0`)
     → `restore` (`0`) → **po re-indeksie `size = 1`**. Problem został rozwiązany raz, w M4 P1, i
     komentarz w kodzie nazywa go wprost.
     ⚠ **OTWARTY WĄTEK (niezmierzony):** w sesji live-gate zaobserwowano `mo_3` ze statusem `active`
     przy pustym `_byVessel` — zgodne z niezadziałaniem hooka, ale **NIE dowiedzione**; `GameScene`
     nie da się uruchomić headless. Klasa **R-1 z arca bramki własności**.
     ⇒ kandydat na **pin ŹRÓDŁOWY przy VO-3b** (wywołanie istnieje, stoi PO `restore`, nie jest
     zagnieżdżone w bramce) — wzór: `colony_ownership_load` T8.

141. 🟠 **Rozkaz ruchu na cel w INNYM układzie dla statku bez warpu ginie po cichu.** ZAOBSERWOWANE
     na żywo: `warpFuel.max === 0`, statek zadokowany, rozkaz na cel międzysystemowy ⇒
     `movementOrder` zostaje `null`, statek nie rusza, **zero komunikatu w UI**.
     ⚠ **ROOT CAUSE (audyt 2026-08-23, ZMIERZONE): SILNIK MÓWI — UI POŁYKA.**
     `MovementOrderSystem:545-547` zwraca jawne **`target_other_system`**, a `WarpRouteSystem:49`
     — **`not_warp_capable`**. Stan statku po odmowie jest **nietknięty** (`movementOrder:null`,
     `docked`), więc to nie jest wzorzec 125 (tam odmowa BRYKAŁA statek) — to **czysta cisza**.
     ⚠ **`warpFuel.max === 0` NIE jest sprawdzane na ścieżce ruchu** — ta odpada wcześniej, na bramce
     układu; test warpu żyje wyłącznie w bramce skoku, z innym powodem.
     **Gdzie ginie powód (ZMIERZONE wykonaniem prawdziwych handlerów):**
     · `RightClickMenu:316-343` — powód **zna i tłumaczy poprawnie**, ale kieruje go **WYŁĄCZNIE do
       Dziennika** (`channel:'fleet'`, `severity:'warn'`); zmierzone `toasty: []`. Dla gracza
       patrzącego na mapę = brak reakcji. Komunikat JEST — tylko nie tam, gdzie gracz patrzy.
     · `FleetManagerOverlay:2879-2886` — zwrotka `OrderService` **nie jest przypisana do niczego**.
       ⚠ Ta sama funkcja wyżej (`:2820`, `:2829`) używa gotowego kanału `expedition:launchFailed`
       (→ `UIManager:1100` robi wpis + toast) — gałąź `OrderService` po prostu z niego nie korzysta.
     · `FleetSystem:220` — emit `fleet:orderIssued` stoi pod `if (accepted.length > 0)`, a to
       **jedyny** konsument tłumaczący powody per statek ⇒ **przy pełnym odrzuceniu powód nie dociera
       nigdzie**.
     **Skala (ZMIERZONA):** **30 z 41** powodów odmowy nie ma klucza i18n · **6 z 15** wywołań
     producenckich połyka odmowę całkowicie, 2 pokazują surowy `snake_case`, 2 tłumaczą ale piszą
     tylko do Dziennika ⇒ **żaden powód nie ma zagwarantowanej widoczności**.
     ⚠ **Cała rodzina zdarzeń `vessel:order*` (w tym `orderBlocked`) ma ZERO konsumentów UI — wbrew
     tabeli zdarzeń w `CLAUDE.md`, która deklaruje ich dwóch.** (Rozszerzenie Findingu 127.)
     **i18n: ZERO nowych kluczy** — `vessel.reasonTargetOtherSystem` i `fleet.warpErrConfig` istnieją
     w PL i EN; gotowa powierzchnia to `_toastReturnFailed` + `_warpErrLabel` (`FMO:6616-6665`,
     dorobek Findingu 125 — jako jedyna robi **toast ORAZ** trwały wpis).
     **Chokepoint naprawy:** `MovementOrderSystem.issueOrder` (`:181-246`) — wszystkie 9 gałęzi
     `_issueX` wychodzi tym samym `return`. ⚠ Nie pokryje dwóch klas, które trzeba nazwać z góry:
     odmów PRZED wejściem do MOS (`OrderService`, early-return UI) oraz blokad w locie
     (`vessel:orderBlocked`). ⚠ Konieczny filtr `isEnemyVessel`, żeby nie zalać gracza odmowami AI.
     ⇒ **poza zakresem VESSEL_ORDERS** (to warstwa prawdomówności UI, nie model rozkazów), ale
     **naturalny kandydat na osobny, tani slice** — szkic: ~20 lin. w MOS + ~14 w `UIManager`.

142. 🔴 **`_getValidTargets` oferuje cele, których statek nie dosięgnie — bo klucza się na
     OGLĄDANYM układzie, nie na układzie STATKU.** `FleetManagerOverlay:9032-9039` czyta
     `window.KOSMOS.activeSystemId` i stempluje każdy cel na sztywno `systemId: activeSysId,
     sameSystem: true` (`:9098-9109`). Jawna gałąź cross-system JEST bramkowana warpem (`:9140`),
     ale **pętla główna nie**.
     **ZMIERZONE** (prawdziwa `_getValidTargets`, statek `warpFuel.max = 0` w `sys_home`):
     `activeSystemId='sys_home'` → **43 cele**, wszystkie własne · po przełączeniu widoku na
     `sys_061` → **61 celów, wszystkie `sameSystem:true`, `reachable:true`**, każdy z żywą hit-zoną
     `select_target`. Klik → `{ok:false, reason:'not_warp_capable'}` → i ta zwrotka ginie w `:2883`.
     ⇒ **to jest mechanizm, przez który gracz w ogóle dostał ten klik.** Potwierdza i **mierzy**
     Finding 123 (audyt oznaczał go jako NIE zmierzony — headless generował jeden układ).
     ⚠ Naprawa (`sameSystem` liczone względem `vessel.systemId`) ma **ŚREDNIE** ryzyko: picker
     obsługuje wszystkie misje, więc pin musi wykazać, że przy `activeSystemId === vessel.systemId`
     lista jest **identyczna co do wiersza** (baza zmierzona: 43 cele). **Poza zakresem VESSEL_ORDERS.**
     **ZAMKNIĘTE 2026-08-27** — ten sam slice co 138. `_getValidTargets` klucza się teraz na
     `vessel.systemId`; `activeSystemId` **nie jest w tej funkcji czytane ANI RAZ** (zmienna
     usunięta świadomie, żeby nikt nie przywrócił jej jako wygodnego fallbacku).
     ⚠ **WPIS OPISYWAŁ POŁOWĘ DEFEKTU.** Obok fałszywego POZYTYWU („oferuje cele, których statek
     nie dosięgnie") istniał symetryczny fałszywy NEGATYW: **własne, osiągalne cele statku
     znikały w CAŁOŚCI (0/3)**. Mechanizm: pętla główna brała ciała kamery, a gałąź cross-system
     pomijała `sys.id === activeSysId` z komentarzem „in-system pokryty wyżej" — pokryty NIE BYŁ.
     Dwa błędy znosiły się do zera celów w oglądanym układzie.
     ⚠ **SKUTEK BYŁ CIĘŻSZY NIŻ ODMOWA.** Dla akcji INNYCH niż transport odmowy nie ma na żadnym
     szczeblu: misja startuje, pobiera paliwo (zmierzone 2,80), leci do współrzędnych odmierzonych
     od CUDZEJ gwiazdy (start 1,00 AU → cel 2,15/8,74 AU **wewnątrz sys_home**, gdzie nie ma nic),
     a `_vesselIsAtTarget` **przyjmuje przylot** (fail-open, słuszny pod warunkiem, że taki rekord
     nie powstaje — picker ten warunek łamał).
     ⇒ dlatego doszła **obrona w głąb (D-SS5)**: `VesselManager._missionTargetOutOfSystem` wołany
     z **OBU** dyspozytorów (`dispatchOnMission` I `redispatchFromOrbit` — ten drugi obsługuje
     dostawę PO SKOKU WARP, więc bramka w jednym byłaby nieutwardzonym bliźniakiem). Odmowę
     obsługuje maszyneria VO-2 (osiem ścieżek `_launch*` → `_abortLaunch` ze zwrotem kosztów).
     **Tylko GRACZ** (D-SS5b) — AI zwolnione, bo osiągalność Findingu 153 jest niezmierzona,
     a cichy zator logistyki AI byłby regresją gorszą od zamykanego defektu (`PHASE5_TODO`).
     ⚠ `_abortLaunch` pyta o powód **tym samym predykatem** co bramka, bo dyspozytor zwraca goły
     bool — inaczej gracz dostawałby „Statek niedostępny" na odmowę o przyczynie układowej
     (klasa Findingu 141). Zero nowych kluczy i18n (`vessel.reasonTargetOtherSystem`).
     ⚠ **STRAŻNIK, KTÓREGO WYMAGAŁ §7a, ISTNIAŁ JUŻ WCZEŚNIEJ I BYŁ ŚLEPY:**
     `cross_system_targets_smoke` (8/8) ustawia `activeSystemId === vessel.systemId`, więc nie
     widział defektu — ale przechodzi po naprawie bez zmian, czyli jest dokładnie tym pinem
     „identyczność co do wiersza", o który prosił plan. Nowy keeper dokłada scenę dwuukładową.
     ⚠ **RODZINA LICZYŁA TRZY MIEJSCA, NIE JEDNO** (D-SS4): `MissionSystem._findNearestUnexplored`
     i `getUnexploredCount` miały ten sam defekt, przy czym **poprawny bliźniak
     (`_findNearestUnexploredFrom:2782`) stał dwie funkcje niżej**. Żywe przez `deep_scan`
     i recon `nearest`. Komentarz przy wołającym twierdził, że wybór celu jest „zakotwiczony
     w DOMU" — kod czytał KAMERĘ; pokrywało się to tylko wtedy, gdy gracz patrzył na dom.
     ⚠ **Bliźniak w `ExpeditionSystem.js` NIE ruszony** — zero produkcyjnych importów (grep),
     martwy alias zgodnie z `CLAUDE.md`.
     Nowe findingi z audytu: **166** (`_handleFleetEngage` — lista wrogów wg kamery, świadomie
     poza slice'em, D-SS6) i korekta odnośników 154 (`FMO:4581/4590`, nie `:4550`).

---

⚠ **Korekty liczbowe do audytu** (nie nowe findingi): `order_blocked_resume` ma **9 asercji**, nie 4
(audyt policzył testy) · subskrypcje `foreign_*` stoją na `:120-121/:160-161/:162-163/:164-165`, nie
`:119/:159/:161/:163` (off-by-one) · retirement to **926 lin.**, nie ~455 (§2.1) · keeperów dotkniętych
jest **13**, nie 12 (§3.5).

---

## Findings z live-gate VO-2 (2026-08-23) — drugi silnik misji

⚠ **Żaden nie jest skutkiem VO-2 — wykluczone DWUSTRONNIE.** `2335c4b` zmienił **zero linii**
w `VesselManager`, a bramka stoi w pętli po `MissionSystem._missions`, do której `exploration`
**nigdy nie trafia**. ZMIERZONE: `_checkArrivals` wywołane **460×**, `_vesselIsAtTarget` dla tego
statku **0×**. Kontrola odwrotna: nawet po ręcznym wstawieniu rekordu `exploration` do `_missions`,
w konfiguracji gracza (`dockedAt === targetId`) predykat zwraca **`true`** — identycznie jak
w symulacji stanu sprzed VO-2 (monkey-patch). Jedyny blokowany stan to `dockedAt !== targetId`.

⚠ **To NIE jest Finding 121 w przebraniu.** 121 opisuje statek **UWOLNIONY kosztem panelu**; tutaj
statek **MA panel i jest ZABLOKOWANY**. Przeciwne objawy, przeciwne przyczyny.

144. 🟠 **`exploration/orbiting_body` nie ma ŻADNEGO samodomknięcia — statek jest zajęty na zawsze.**
     To zaprojektowany stan terminalno-postojowy pod panel obcego układu, ale nic go nie kończy:
     `_updatePositions` zostawia `status='on_mission'` i nic tego nie cofa. **ZMIERZONE: 200 lat
     gry po przylocie — nadal `on_mission`, `dockedAt === targetId`, `missionsComplete = 0`.**
     Skutek: `getAvailable` (`VesselManager:297`) i `dispatchOnMission` wymagają `idle`, więc statek
     **wypada z doboru do jakiejkolwiek misji** aż do ręcznego anulowania w UI.
     ⚠ Objaw zgłoszony przez gracza (`v_19` „Dyplomata") to **dokładnie ten mechanizm**.
     ⚠ `bodiesSurveyed = 0` **potwierdza rozdwojenie silników**, a nie brak skanowania: licznik
     mieszka w `vessel.stats` i podbijają go **wyłącznie** `MissionSystem._processReconArrival`
     (`:2613`, `:2653`). `VesselManager._tickForeignRecon` skanuje i **nigdy go nie dotyka**.
     ⚠ Nazwa „Dyplomata" to **rename gracza** — nie ma jej w pulach `VesselNames`, a `envoy`
     **nie może** przerodzić się w `exploration` (bramka `VesselManager:2857-2859`).

145. 🔴 **`OrderService.issueReturn:206` POŁYKA `false` ze `startReturn` i zwraca `{ok:true}`** —
     a odmowa jest **fałszywa**. Przyczyna: `exploration` nie ma `returnYear`, którego
     `startReturn:555` wymaga ⇒ `_predictPosition(colonyId, undefined) = NaN` ⇒ silnik melduje
     **„brak paliwa"** i wystawia status **„⛽ Utknął" statkowi z 27 AU zasięgu**.
     ⚠ **To jest REGRESJA FASADY wobec ścieżki bezpośredniej:** `FleetActions.return_home:409`
     ustawia to pole **poprawnie**, a fasada je **zgubiła**. Ta sama klasa co Finding 141
     („silnik mówi — UI połyka"), ale gorsza: tu **fasada kłamie o sukcesie**.

146. 🔴 **Leg powrotny misji BEZ rekordu w `MissionSystem` nie ma domknięcia — statek zamarza
     `in_transit/returning` na zawsze.** `VesselManager:2369` **jawnie wyklucza** `phase.startsWith
     ('return')` z własnej detekcji przylotu, a jedyny closer powrotu (`MissionSystem:1600-1608`
     → `dockAtColony`) **wymaga rekordu**, którego drugi silnik nie tworzy.
     **ZMIERZONE:** `returnYear = 3.32`, a przy `gameYear = 24.17` statek nadal `on_mission /
     in_transit / phase=returning / dockedAt=null`, zawieszony **0.105 AU od domu**. Po 200 latach
     i **ośmiu kliknięciach „Powrót"** dystans do domu **ROŚNIE** (0.4064 → 0.4197 AU).
     ⚠ **KONTROLA PINU (zmierzona):** identyczna operacja na misji `recon` **Z rekordem** kończy się
     poprawnie (`status=idle`, `mission=null`, `docked`). **Różni je WYŁĄCZNIE obecność rekordu.**
     ⚠ **Ironia do zapamiętania:** jedynym działającym wyjściem bez utraty statku okazuje się
     `moveToPoint` — czyli dokładnie mechanizm, który **Finding 121 opisuje jako SZKODĘ**.

⚠ **ZWIĄZEK Z PLANEM — te trzy wzmacniają uzasadnienie P4 (VO-6/VO-7).** Wszystkie trzy mieszkają
w kodzie, który **P4 i tak retiruje**: gdy `foreign_*` staną się zwykłymi akcjami z rekordem
w `MissionSystem`, **144 i 146 znikają z konstrukcji** (rekord daje i samodomknięcie, i closer
powrotu). **145 należy do slice'u `ORDER_TRUTHFULNESS`** (§7a) — to fasada, nie model misji.
⇒ żaden nie wymaga osobnego slice'u; **dopisać jako kryteria gate'u D (VO-6)**.

---

## Finding z implementacji VO-3 (2026-08-23)

147. 🟠 **Rozkaz ruchu KASUJE misję statku w trakcie skoku warp — MOS nie ma żadnej bramki na
     `warp_transit`.** `_issueMoveToPoint` podmienia `vessel.mission` bezwarunkowo, a `MOS` nie
     odwołuje się do `interstellar_jump` / `phase === 'warp_transit'` **ani razu** (grep = 0).
     Tymczasem `VesselManager._reconcileSystemId` i **cała Slice A** stoją na `mission.toSystemId`.
     ⚠ **PRE-EXISTING, starsze od VO-3** — `_preempt` dostał własny guard (D-VO3b) i misji w skoku
     **nie tyka**, ale gałąź typu robi to niezależnie od preempcji.
     ⚠ **Złapane przez pin, który początkowo mierzył CUDZY defekt:** pierwsza wersja T6 w keeperze
     `preempt_order_smoke` używała `moveToPoint` i padała **nie na moim guardzie**, tylko na tej
     bramce. Pin zawężono do `pursue` (tam gałąź misji nie rusza), a defekt wydzielono tutaj.
     **Naprawa należy do `OrderService`** (jedyny dozwolony orkiestrator multi-system) albo do P4 —
     nie do preempcji. ⇒ **kryterium gate'u D (VO-6)**.

---

## Findings z live-gate VO-3 (2026-08-24) — pula logistyczna

⚠ **Oba PRE-EXISTING, oba zmierzone ON vs OFF jako identyczne** — w odróżnieniu od D-VO3f, którą
ten commit wprowadził i którą w nim naprawiono. Rozdzielenie tych trzech przypadków było całą
treścią rozstrzygnięcia.
⚠ **Sprostowanie atrybucji:** objaw zgłoszono jako `EmpireLogisticsSystem`. **To niemożliwe** —
statek gracza nie może zostać kurierem AI (`EmpireLogisticsSystem:516`: `if (!empId || empId ===
'player') return;`), a `assignedRouteId` na statku gracza **nigdy nie był ustawiony** (nie „wrócił
do null" — nigdy nie istniał; `VesselManager` normalizuje go do `?? null`). Przydział gracza siedzi
w `order.assignments[]` w `TransportOrderSystem`, zgodnie z `CLAUDE.md`.

148. 🟠 **Rozkaz ruchu zostawia zlecenie transportowe przypisane do statku, który już nic nie wiezie
     — bo `_driveVessel` bramkuje się na `docked`, a rozkaz kończy statek w `orbiting`.**
     `TransportOrderSystem:226-228`: `const docked = v.position?.state === 'docked'; … if (!docked
     || !available) return;`. **ZMIERZONE:** statek stoi **przy koloni docelowej**
     (`dockedAt === cel`) z ładunkiem w ładowni i **nie rozładowuje**; po 93 latach gry zlecenie
     otwarte, `inFlight {Fe:50}`, dostarczone **0**, sweep odpalił setki razy bez skutku.
     ⚠ **KONTROLA PINU:** ręczne `dockAtColony` ⇒ sweep **natychmiast** podejmuje robotę, zlecenie
     zamknięte, Fe dostarczone. **Mechanizm działa — brakuje wyłącznie przejścia w `docked`.**
     ⚠ Rozkaz `ORDER_TYPES.dock` taki dok produkuje; zwykłe „Leć tutaj" — nie.
     **PRE-EXISTING** (ON i OFF identyczne co do pola). ⚠ **VO-3 to UWIDACZNIA**, bo wcześniej statek
     i tak nie wracał do puli przez martwy `movementOrder` (Finding 119) — commit zamienił „statek
     trwale zablokowany" na „statek wolny, ale zlecenie go trzyma". **Poza zakresem VO-3.**

149. ⚪ **`removeFromPool` nie zwalnia przydziału** — zlecenie dalej wypisuje statek, którego gracz
     właśnie wyjął z puli. `TransportOrderSystem:83-92` rusza wyłącznie `st.pool`, nie woła
     `_releaseAssignment`. **ZMIERZONE:** `isInPool=false`, a `assignments` dalej 1.
     Bez związku z preempcją. **Poza zakresem VO-3.**

---

# §7a ZAPLANOWANY FOLLOW-UP — slice **ORDER_TRUTHFULNESS** (PO zamknięciu VESSEL_ORDERS)

✅ **Zdecydowane 2026-08-23:** Findingi **141/142** dostają **osobny, mały slice PO** tym arcu —
nie wpis w rejestrze i nie wtrącenie w środek P0-P5.

**Uzasadnienie decyzji (zapisane, żeby nie trzeba było go odtwarzać):** to warstwa **prawdomówności
UI**, nie model rozkazów — **nie blokuje żadnego z P0-P5**. Naprawa jest tania i ma **gotowy wzorzec
w repo** (`_toastReturnFailed` + `_warpErrLabel`, `FMO:6616-6665`, dorobek Findingu 125), więc
**nie ucieknie**. Przerywanie **wiążącej** kolejności `P0 → P2 → P1 → P3 → P5 → P4`, żeby go wcisnąć
teraz, kosztowałoby więcej niż zaczekanie.

⚠ **Dług jest jednak REALNY i zmierzony w praktyce: kosztował DWA zatrzymania live-gate'u VO-1.**
Za pierwszym razem obserwator uznał statek za trwale zamrożony (137), za drugim — rozkaz za cichy
no-op silnika (141). W obu przypadkach **system miał coś do powiedzenia i tego nie powiedział**.

**Zakres (szkic, do podpisania osobno):**
1. **Powierzchnia odmowy** — chokepoint `MovementOrderSystem.issueOrder` (`:181-246`; wszystkie
   9 gałęzi `_issueX` wychodzi tym samym `return`) → nowe `vessel:orderRejected` → JEDNA subskrypcja
   w `UIManager` robiąca **toast ORAZ wpis w Dzienniku** (wzór `_toastReturnFailed`). ~20 lin. + ~14.
2. ~~**Dostępność (Finding 142)**~~ ✅ **ZROBIONE 2026-08-27** poza tym slice'em, razem z Findingiem
   138 (`docs/audit/SYSTEM_SCOPE_138_142_AUDIT.md`). Wymóg „identyczność co do wiersza" spełniony
   dwoma pinami: istniejący `cross_system_targets_smoke` 8/8 bez zmian + `system_scope_orders_smoke`
   T4a. ⚠ Zakres okazał się szerszy, niż zakładał ten punkt — patrz zamknięcie wpisu 142.
3. **Uzupełnienie i18n** — 30 z 41 powodów bez klucza.

⚠ **Trzy rzeczy do nazwania w podpisie tamtego slice'u, wszystkie zmierzone tutaj:**
· chokepoint **nie pokryje** odmów sprzed wejścia do MOS (`OrderService`, early-return UI) ani
  **blokad w locie** (`vessel:orderBlocked`) — to osobne klasy;
· **konieczny filtr `isEnemyVessel`**, inaczej gracz dostanie odmowy AI;
· **ryzyko podwójnego komunikatu** — producenci fan-out (`RightClickMenu`, `UIManager` na
  `fleet:orderIssued`) już raportują per statek, więc potrzebny dedup albo zawór `_silentReject`
  na trzech ścieżkach automatycznych (`AutoRetreatSystem:97/:109`, `FleetSystem:585`).

---

# §8 WARUNKI PODPISU — ✅ **WSZYSTKIE SPEŁNIONE 2026-08-23**

1. ☑ **D-VO1 = W1** — preempcja identyczna dla obu stron + jawna flaga `force`.
2. ☑ **D-VO1b = W1 ROZDZIELONE** — preempcja w VO-3, domknięcie w **osobnym VO-3b** z gate'em tempa.
3. ☑ **D-VO2 = W2** (`P0 → P2 → P1 → P3 → P5 → P4`) · **kill-switch = B**
   (`FEATURES.unifiedVesselOrders`, obejmuje P1 + P3, default ON).
4. ☑ **D-VO3 = W2** + cztery klauzule: migracja w VO-6 · **`abortForeignRecon` ZOSTAJE** ·
   **`interstellar_return` przeżywa** · i18n czyszczone ręcznie.
5. ☑ **D-VO4 = W1** — P5 bez `found_outpost` cross-system; **D9 osobno w VO-6**.
   ☑ **Obie klauzule §3.4.3 podpisane:** wyjątek `{preempt:false}` chroni **także predykat końca gry**
   (obowiązkowy komentarz w kodzie) · **przegląd zbiorów `PlayerViability` = obowiązkowy punkt GATE C**.
6. ☑ **D-VO5** — odwrócenie `moveto_no_return` T2 (`:86`, `:87`) zatwierdzone; **każde odwrócenie MUSI
   mieć komentarz uzasadniający**, jak dotąd (`deploy_seams`, `colony_ownership_seams`, `ai_capture_last_stand`).
7. ☑ **R-6 przyjęte do wiadomości** — para P1 × P3 może dać fałszywy negatyw końca gry, a
   `ai_capture_last_stand` **tego nie złapie**.
8. ☑ **58 bramek** dostaje decyzję **indywidualnie** (tabela w commicie VO-4).
9. ☑ **Save: VO-1…VO-5 bez migracji (v101). Migracja DOPIERO w VO-6.**

**Tryb pracy (podpisany):** fail-first · `run-all.mjs` **0 FAIL** + `check-i18n` **PASS** przy każdym
commicie · **live-gate robi właściciel** (A/B/C/D/E), **headless po stronie CC wszędzie, gdzie się da**.

---

# §9 METODA, PEWNOŚĆ I GRANICE DOWODU

**Podstawa:** audyt z 2026-08-20 (6 sond headless `GameCore`, `scratchpad/probe-orders*.mjs`, poza repo).
**Pomiar uzupełniający 2026-08-23** (ten dokument): **8 agentów** — 6 sond źródłowych
(rozkazy AI · klasyfikacja keeperów · odświeżenie 30 odnośników · sprzężenie z AI_CAPTURE · kolonizacja
i predykat · inwentarz retirementu) + **2 przebiegi adwersarialne**, których zadaniem było **OBALIĆ**
dwa najcięższe twierdzenia. **Oba wróciły z werdyktem `CZĘŚCIOWO BŁĘDNE`** — i to dzięki nim powstały
Finding 130, sprostowanie adresu wyjątku `{preempt:false}` (§3.4.3 pkt 1) i ryzyko pary P1 × P3 (R-6).
**Dwie weryfikacje własne prowadzącego** (`_startForeignColonize` bez `canAfford`/`resourceSystem`/
`spend` — policzone **0**; `_freezeAsStationary` zerujące misję strony B).

**⚠ Czego NIE zmierzono — uczciwie:**
- **Gra nie była uruchamiana.** Wszystko powyżej to odczyt źródła + wcześniejszy headless.
  **Live-gate jest warunkiem każdego commitu**, nie tego dokumentu.
- **Wpływ na TEMPO gry** — o ile „statek zawsze wolny" zmienia rytm rozgrywki. To pytanie do
  **GATE B2/C**, nie do planu.
- **Finding 123** (wyciek celów cross-system) — ustalony **ze źródła**, nie z danych; headless
  `GameCore` generuje **jeden** układ.
- **Findings 102/104/107** — **nie re-mierzone**; pochodzą z `WARP_COLONIZE_ROUTE_AUDIT.md` i są tu
  cytowane wyłącznie jako warunek konieczny P4.
- **`FleetManagerOverlay` importuje się pod node, ale metody rysujące wymagają kontekstu 2D** ⇒ bramki
  panelu obcego ustalono **źródłowo**. `ColonyOverlay`/`GameScene` **nie importują się pod node** ⇒ tam
  obowiązuje **pin źródłowy albo live-gate**.

⚠ **STANDING LESSON, która obowiązuje przy wykonaniu tego planu:** pisanie plików przez CC —
**także dokumentacji** — przeładowuje kartę gracza przez **Live Server** i **resetuje runtime do
ostatniego zapisu**. **CC nie pisze w trakcie gate'u.**

**Zero zmian w kodzie W TYM DOKUMENCIE.** §1-§4 były projektem do podpisania; **podpis zapadł
2026-08-23** (nagłówek + §8) i od tej chwili §4 jest **planem do wykonania**, zaczynając od **VO-0**.

---

## Findings z live-gate F-D (2026-08-25) — sklejenie miedzyukladowe w warstwie WALKI

> **Kontekst.** Live-gate naprawy F-D (`aeef035`) zlapal defekt NIEZALEZNY od F-D i ciezszy:
> `DeepSpaceCombatSystem` laczyl w jedno starcie statki z ROZNYCH ukladow. ZMIERZONE w zywej grze:
> encounter ze stemplem `location.systemId = 'sys_024'` zawieral statek gracza z `sys_024` ORAZ
> statki z `sys_061` i `sys_home` (potwierdzone dwoma zrzutami przy przelaczaniu widoku ukladu).
>
> **Klasa: „globalne id != polozenie"** — ta sama co Finding 138 i W3-4b. Kazdy uklad ma wlasna ramke
> wspolrzednych na swojej gwiezdzie w (0,0), a rejestry (`EntityManager`, `VesselManager._vessels`)
> sa PLASKIE. Statek 0,2 AU od SWOJEJ gwiazdy ma niemal te same surowe `x/y` co statek 0,2 AU od INNEJ.
>
> **✅ ZAMKNIETE w `131cc2e`** (bramka w dyspozytorze DSCS + termin ukladu w gatherze + stempel z pary
> wyzwalajacej, lustrzana trojka w `VesselCombatSystem`, defense-in-depth w `_joinEncounter`
> i `_freezeAsStationary`; NEW `SystemScope.isSameSystemStrict` fail-CLOSED wylacznie dla walki).
> Keeper: `combat_system_scope_smoke.mjs` 25/25.
>
> ⚠ **Naprawa NIE cofa szkod juz zapisanych** (falszywe `position.dockedAt`, zatrute klucze
> `orbitalDominance`, wraki w miedzyukladowych punktach, wyczerpanie wojenne z fikcyjnych bitew).
> Sonda diagnostyczna read-only powstala i zostala zweryfikowana wykonaniem na syntetycznym zapisie,
> ale **wlasciciel swiadomie zrezygnowal** z naprawy stanu (zapis testowy). Przy PRAWDZIWEJ partii
> temat wraca.
>
> ⚠ **Lekcja, ktora wychodzi poza ten slice:** utwardzanie tej klasy bylo robione PUNKTOWO, przy
> okazji konkretnych defektow (`ProximitySystem` dostal guard 2026-07-15, `MovementOrderSystem`
> bramki `target_other_system` w W3-4b) — i wlasnie dlatego zostaly dziury. **Guard postawiony
> u jednego producenta zdarzenia nie jest guardem systemu**: `vessel:combatRangeEnter` ma TRZECH
> producentow, a utwardzony byl JEDEN.

150. 🔴 **`battle:resolved` leci DWA RAZY przy zadeklarowanej wojnie.** `DeepSpaceCombatSystem`
     emituje je z `warId: null` (`:1022`), a nastepnie `WarSystem.recordBattle:314` emituje PONOWNIE,
     tym razem z `warId`. Kazdy subskrybent (`AutoRetreatSystem`, `InvasionSystem`, `GameScene`,
     `ProximitySystem._handleBattleResolved`, UI) dostaje wiec ten sam wynik dwukrotnie, w dwoch
     roznych ksztaltach. ⚠ NIE ZMIERZONO, ktorzy konsumenci sa idempotentni — `AutoRetreatSystem`
     wyglada na odporny (drugi przebieg trafia na statek z juz wydanym rozkazem), ale to ODCZYT,
     nie pomiar. **Osobny finding, osobny pomiar** — swiadomie poza slice'em `131cc2e`.
     ⚠ **POTWIERDZONY W ŻYWEJ GRZE 2026-08-26 (live-gate F-D) — DWUKROTNIE w jednej sesji.**
     Dwie RÓŻNE pary id bitew, za każdym razem **dwie sprzeczne linijki o zwycięzcy TEJ SAMEJ walki**
     w Dzienniku. To zmienia status wpisu na dwa sposoby: (a) z „znany, niezmierzony" na
     **reprodukowalny w żywej rozgrywce**; (b) duplikat okazuje się **WIDOCZNY DLA GRACZA**, a nie
     tylko wewnętrzny — sprzeczny meldunek o zwycięzcy podważa zaufanie do warstwy walki nawet wtedy,
     gdy stan gry jest poprawny. ⚠ **NADAL NIEZMIERZONE: którzy konsumenci są idempotentni** — a to
     jest właściwe pytanie o szkodę, bo dwa emity o dwóch RÓŻNYCH kształtach (`warId: null` vs `warId`)
     mogą rozejść się po konsumentach różnie. Pomiar musi objąć każdego subskrybenta z osobna.
     **ZAMKNIĘTE 2026-08-27** — plan `docs/design/BATTLE_NARRATION_PLAN.md`; naprawa w
     `WarSystem._classifyBattle` (`recordBattle(..., { announce: false })`): księgowanie milczy, gdy
     producent już ogłosił. **Jeden szew pokrywa DSCS i VCS** (lekcja `131cc2e` odwrócona — nie łatamy
     producentów, tylko jedyne wejście re-entrantne). Keeper `battle_announce_once_smoke` 19/19;
     `w3_battle_booking` T4 **odwrócony** (pinował `withWar === 1`, czyli sam defekt).
     KOREKTA ZAKRESU: duplikat dotyczył WYŁĄCZNIE producentów, którzy emitują sami i dopiero potem są
     księgowani (**DSCS/VCS**). `EnemyAttackHandler` woła `recordBattle` WPROST i ogłaszał **raz** —
     wpis sugerował szerszy zasięg, niż miał.
     POMIAR IDEMPOTENCJI (brakująca odpowiedź): odporni — `_classifyBattle`, `ProximitySystem`,
     `VesselCombatSystem`, `ThreeRenderer` (wychodzi na `loc.point`), `InvasionSystem` (wychodzi na
     kształcie uczestnika). NIEODPORNI — **`AutoRetreatSystem`** (drugi rozkaz odwrotu ⇒ **podwójna
     opłata paliwowa, ZMIERZONE ×2,0**: 0,817 spalone przy koszcie kursu 0,409), **Dziennik** (2 wpisy),
     **kolejka kina** (`_battleQueue` bez dedupu ⇒ baner **plus** pauzujący modal „ENGAGEMENT IMMINENT",
     wbrew decyzji Slice 1), **`UIManager`** (2 linie z różnymi `battleId` + podwójny auto-slow), `DebugLog`.
     KOLEJNOŚĆ DUPLIKATU (odkryte przy pomiarze): zagnieżdżony emit domyka się w CAŁOŚCI, zanim
     zewnętrzny `forEach` dojdzie do kolejnego subskrybenta ⇒ **błędna linia trafiała do Dziennika PRZED
     poprawną**. Kolejność nie była przypadkowa.

151. 🟠 **`ProximitySystem:187` ma WLASNA koercje zamiast `systemIdOf`, i ta koercja polyka tranzyt
     warp.** `(v1.systemId ?? 'sys_home') === (v2.systemId ?? 'sys_home')` — a `??` lapie takze `null`,
     ktory w tym repo znaczy SWIADOMIE „statek jest miedzy ukladami" (`VesselManager:842`, inwariant
     pilnowany przez `_resolveSystemId`). Naglowek `SystemScope.js:14-17` ostrzega przed dokladnie tym
     sklejeniem. Skutek: statek w warpie jest liczony jako mieszkaniec `sys_home` — na wspolrzednych
     SPRZED skoku. ⚠ Ta linia bramkuje NIE TYLKO walke, ale i DETEKCJE oraz INTEL (rumor/contact),
     wiec zmiana wymaga wlasnego slice'u z wlasnym gate'em; `131cc2e` swiadomie jej NIE dotknal.

152. 🟠 **POI nie ma pojecia ukladu — i nie da sie tego zalatac guardem.** `POIRuntimeSystem._tickPicket`
     (`:133`) i `_tickRally` (`:186`) licza `gameplayDistance(center, vessel.position)` po pelnej liscie
     statkow, bez terminu ukladu. ⚠ Roznica wobec pozostalych dziur tej klasy: `POIRegistry.js`
     i `POITypes.js` **NIE MAJA pola `systemId` w ogole** (grep: zero trafien), wiec nie ma nawet czym
     filtrowac. Naprawa = DODANIE pola + migracja zapisu, czyli decyzja o zakresie, nie jedna linia.

153. 🟠 **`EmpireLogisticsSystem` dobiera outposty bez terminu ukladu, a kurier nie ma warpu.**
     `:240-242` filtruje `getColoniesByEmpire(...)` po wlascicielu i zlozu, ZERO filtra ukladu
     (`systemId` pojawia sie w okolicy tylko w `:230` jako klucz do `ssm.getSystem`), a trasa wyceniana
     jest `_distAU` (`:659-664`) = surowy hypot. Komentarz `:653` mowi wprost „kurier in-system —
     nigdy warp". ⚠ NIEUSTALONE, czy AI realnie zaklada outposty poza ukladem stolicy — bez tego
     pomiaru nie wiadomo, czy dziura jest osiagalna.

154. 🟠 **`AutoRetreatSystem._findNearestFriendlyPlanet` DALEJ nie ma terminu ukladu — i jest ZYWA.**
     Slice RETREAT_TARGET (`aeef035`) swiadomie jej nie tknal, bo odwrot z bitwy przeszedl na
     `utils/RetreatTarget.js`. Czytaja ja jednak **TRZY** produkcyjne sciezki „Powrot do bazy":
     `FleetManagerOverlay.js:4550`, `FleetGroupPanel.js:445`, `FleetCommandPanel.js:384`. Skutek jest
     ten sam co przy F-D: przycisk moze wskazac kolonie z INNEGO ukladu, po czym rozkaz odpadnie na
     `target_other_system` — z ta roznica, ze te trzy sciezki pokazuja graczowi toast
     `fleet.noFriendlyPlanet` albo milcza. **Follow-up RETREAT_TARGET, wlasny podpis.**

> **Juz zarejestrowane, NIE duplikuje:** **Finding 138** (`VesselManager._findBodyNearPoint` skanuje
> cala galaktyke) i **Finding 142** (`_getValidTargets` klucza sie na OGLADANYM ukladzie, nie na
> `vessel.systemId`) naleza do tej samej klasy.
> ✅ **OBA ZAMKNIETE 2026-08-27** we wspolnym slice (audyt `docs/audit/SYSTEM_SCOPE_138_142_AUDIT.md`).
> ⚠ **151/152/153 SWIADOMIE NIE DOLACZONE** — trzy rozne powody, kazdy zmierzony osobno: **151**
> ma ODWROTNY kierunek fail (bramkuje detekcje i intel, nie ruch) ⇒ jeden podpis nie moze zawierac
> dwoch przeciwnych odpowiedzi na to samo pytanie; **152** to brak POLA `systemId`, nie zly filtr
> ⇒ migracja zapisu; **153** ma NIEZNANA osiagalnosc ⇒ gate zmierzylby cisze. **154** zostaje
> osobno na wyrazna decyzje wlasciciela (swiadomy wybor przy `RETREAT_TARGET_PLAN`).

---

## Finding z GATE B2 (2026-08-26) — narracja bitwy w Dzienniku

155. 🟠 **Dziennik MYLI ZWYCIĘZCĘ, gdy gracz jest AGRESOREM wojny.** `GameScene:2398-2402`
     (ścieżka A, brana **zawsze gdy `warId` jest ustawione**) mapuje **literę wyniku** (`A`/`B`)
     na nazwy wzięte z **rekordu wojny**:
     `aName = war.aggressor === 'player' ? 'Gracz' : …`, `winnerLabel = winner === 'A' ? aName : dName`.
     To zakłada `A = agresor`, a **nic tego nie gwarantuje**: `WarSystem.recordBattle:283-284`
     kopiuje `participantA/B` DOSŁOWNIE, a `EnemyAttackHandler:172-186` **zawsze** wstawia wroga
     jako `A`, a gracza jako `B`. ⇒ gdy graczem jest AGRESOR wojny, nazwy są zamienione:
     **wygrana gracza jest raportowana jako zwycięstwo wroga**.
     ⚠ **ZAOBSERWOWANE NA ŻYWO** (GATE B2): trzy rajdery `emp_001` zestrzelone przez obronę
     stolicy, a Dziennik napisał „Zwycięzca: Liga Spalonej Drogi".
     ⚠ **Adnotacja o odwrocie jest liczona INNĄ drogą** (przez `playerSide`, które EAH podaje
     poprawnie jako `'B'`) i mówi prawdę — dlatego jedno zdanie zawiera dwie wzajemnie sprzeczne
     połowy („Zwycięzca: wróg" + „Wróg wycofał się"). To jest podpis defektu, nie dwie usterki.
     ⚠ **DRUGI, GROŹNIEJSZY WARIANT TEGO SAMEGO:** dla bitew **DSCS/VCS** zaksięgowanych w wojnie
     `playerSide = result.participantB?.type === 'player' ? 'B' : 'A'` **degeneruje się do `'A'`
     bezwarunkowo**, bo OBAJ uczestnicy mają tam `type: 'vessel_group'`
     (`DSCS:1006,1013`, `VCS:333`). Wtedy przekłamuje się także adnotacja o odwrocie.
     ✅ **STAN GRY NIETKNIĘTY — zweryfikowane.** `WarSystem._battleLoserSide:255-265` rozstrzyga
     zwycięzcę po `part.empireId` (WŁASNOŚĆ), nie po kolejności, i zwraca `null`, gdy nie umie
     zmapować. Wyczerpanie wojenne naliczane jest poprawnie. Kłamie **wyłącznie zdanie w Dzienniku**.
     ⚠ **INTERAKCJA Z FINDINGIEM 150** (i to jest jego realny koszt dla gracza): DSCS emituje
     `battle:resolved` z `warId: null` → ścieżka **B** (poprawna, po `empireId`), a `recordBattle`
     emituje PONOWNIE z `warId` → ścieżka **A** (zepsuta). ⇒ **ta sama bitwa, dwa wpisy, dwa różne
     schematy etykietowania, jeden poprawny i jeden błędny** — dokładnie „dwie sprzeczne linijki
     o zwycięzcy", zgłoszone jako potwierdzenie 150.
     **Kształt naprawy jest znany i JUŻ ISTNIEJE W REPO DWUKROTNIE:** wyprowadzać nazwy i stronę
     gracza z `participantA/B.empireId` — tak robi ścieżka B (`GameScene:2410-2414`) oraz
     `_battleLoserSide`. Jedna funkcja, dwa call-site'y, zero nowej matematyki.
     **ZAMKNIĘTE 2026-08-27** — plan `docs/design/BATTLE_NARRATION_PLAN.md`. NEW czysty
     `src/utils/BattleSides.js` (`isPlayerParticipant` / `participantName` / `resolveBattleSides` /
     `battleWinnerName`), wpięty w OBA listenery `battle:resolved` w `GameScene`; `_hasPlayerSide`
     deleguje do kanonu (D5). Keeper `battle_sides_smoke` 35/35 — WYKONANIE dla modułu + pin ŹRÓDŁOWY
     wpięcia (wszystkie sześć pinów zweryfikowane na kodzie SPRZED naprawy: każdy by tam padł).
     REGUŁA BRAKU: gdy gracza nie da się przypisać do strony, `playerSide === null` i **nie zgadujemy**
     — linia powstaje bez atrybucji „Gracz/Wróg" i z neutralną wagą (wzór `_battleLoserSide`).
     PRZY OKAZJI (D3): linia Dziennika była **zahardkodowana po polsku** i `check-i18n` jej nie widział
     (pyta o klucze w `t()`, nie o literały) — gracz EN dostawał polski meldunek o najgłośniejszym
     zdarzeniu w grze. Siedem kluczy PL+EN; prefiks `⚔` zostaje w obu językach jako **językowo
     neutralny uchwyt filtra na gate'cie**. D4: adnotacja o odwrocie bramkowana znaną stroną gracza.
     ZOSTAJE OTWARTE (Finding 158): `BattleIntroModal` ma zahardkodowany polski i nagłówki kolumn
     „AGRESOR/OBROŃCA", podczas gdy strony A/B nie są rolami wojny.

156. 🟠 **Jedna bitwa DSCS-w-wojnie zostawia DWA rekordy w `gameState.battles`, o niepowiązanych id.**
     DSCS pisze swój (`battle_ds_*`, `:1067`), a `recordBattle` nadaje WŁASNE id
     (`battle_<rok>_<warId>_<n>`) i zapisuje drugi rekord tej samej walki; `war.battles[]` zna tylko
     ten drugi, a `vessel.lastBattleId` — ten pierwszy. Oba rozwiązują się przez `getBattleRecord`,
     więc nic dziś nie pada, ale **duplikat idzie do ZAPISU** i z id DSCS nie da się dojść do rekordu
     wojennego. ⚠ Naprawa 150 tego **nie rusza** (dotyczy OGŁOSZEŃ, nie rekordów) — pin stoi
     w `battle_announce_once_smoke` T6, żeby nikt nie uznał tego za załatwione. Naprawa = dotknięcie
     treści zapisu ⇒ osobna decyzja o zakresie.

157. 🟠 **Bitwy obrony orbitalnej nie dostają od `UIManager` ŻADNEJ klasyfikacji wyniku.**
     `UIManager:1356` filtruje `p?.type === 'vessel_group' && p?.empireId === 'player'`, a
     `EnemyAttackHandler` opisuje gracza jako `{ type: 'player', empireId: 'player' }` ⇒ predykat
     odpada na `type`. Skutek: brak linii `log.m4.battleResolved*` i brak auto-slow dla walk, w
     których gracz broni STOLICY. ⚠ W3-7 dostemplował `empireId` właśnie po to, by domknąć tę klasę
     (S25), ale ten konsument pyta **też** o `type` — stempel go nie uratował. Naprawa = **dodanie**
     linii, czyli zmiana zachowania ⇒ własny podpis. Kanon `isPlayerParticipant`
     (`utils/BattleSides.js`) jest gotowy do użycia.
     **AUDYT 2026-08-27** — `docs/audit/BATTLE_RESULT_CLASSIFICATION_AUDIT.md`. Trzy sprostowania do
     tego wpisu: (a) numer linii to **`:1383`**, nie `:1356`; (b) zasięg obejmuje **trzech**
     producentów, nie samą obronę stolicy — `EnemyAttackHandler:181`, `WarSystem.forceBattle:416`
     (żywy, przycisk `WarOverlay:354`) i `_fleetArrived:550` (stare zapisy po W3-8); (c) ⚠ **skutek
     jest INNY, niż mówi tytuł**: klasyfikacja wyniku **JEST** dowożona — pełnoekranowym, PAUZUJĄCYM
     banerem `showBattleOutcome` (`BattleIntroModal:215`, werdykt poprawny po 155) oraz linią
     `log.battleLine` z `GameScene:2380` (z nazwami stron i **poprawną** severity). Brakuje
     **wyłącznie auto-slow** — i to jest cięższa połowa, bo `vessel:engaged` (jedyne inne wejście
     auto-slow przy walce) ma **dokładnie jednego producenta: `DSCS:395`**, więc bitwa o stolicę nie
     zwalnia czasu w ŻADNYM punkcie swojego cyklu życia, a po kliknięciu OK gra wraca do prędkości
     sprzed bitwy — prosto w desant (`InvasionSystem._onVesselGroupVictory:198`).
     **PODPISANY W3, ZAMKNIĘTE 2026-08-27:** auto-slow przez kanon + **gałąź `log.m4.battleResolved*`
     WYCOFANA** (`GameScene` jedynym narratorem). Poszerzenie filtru odrzucone: rozmnażałoby drugiego,
     gorszego narratora (surowe `battleId`, `TYPE_MAP.combat` → płaskie `warn` **nawet dla
     zwycięstwa**) wbrew linii 150/155, a przy potyczce bez wojny dawałoby **trzecią** linię (162).
     Przy okazji skasowany polski literał `'gracz'`/`'wróg'` wstrzykiwany do klucza i18n (`:1390`,
     klasa Findingu 113). Keeper `battle_result_classification_smoke`.

158. 🟠 **`BattleIntroModal` ma zahardkodowany polski i myli role z kolejnością.** `:130,139,226-231`
     wypisują `AGRESOR` / `OBROŃCA` / `ZWYCIĘSTWO` po polsku (gracz EN widzi polskie napisy), a same
     nagłówki są **kategorialnie błędne**: strony A/B bitwy nie są agresorem/obrońcą WOJNY — to
     zwykłe indeksy uczestników. Po naprawie 155 pola niosą już poprawne nazwy stron, więc kłamią
     tylko nagłówki. ⚠ Ta sama klasa co **Finding 113**: `check-i18n` pyta o klucze w `t()`, a nie
     o to, czy każdy widoczny napis przez `t()` przechodzi — literał jest dla niego niewidzialny.
     **Rozszerzone o pomiar 163** (niżej) — baner wyniku to DRUGI blok literałów w tym samym pliku.

161. 🟠 **Baner bitwy ODPAUZOWUJE ręcznie zapauzowaną grę.** `BattleIntroModal.js:41` i `:218`
     zapisują `wasPaused: window.KOSMOS?.timeSystem?.paused ?? false`, a `TimeSystem` ma pole
     **`isPaused`** (`:22`) i pola `paused` **nie ma nigdzie w klasie** (grep) ⇒ `wasPaused` jest
     **zawsze `false`** ⇒ `_restoreTime:201-206` **zawsze** emituje `time:play`. Skutek: bitwa
     rozstrzygnięta przy ręcznej pauzie po kliknięciu OK **wznawia grę, o której gracz nie prosił**.
     ⚠ Osiągalność wąska i **NIEZMIERZONA na żywo**: przy pauzie nie ma tików, więc EAH/DSCS nie
     wystrzelą — realną drogą zostaje `forceBattle` z `WarOverlay:354` (klik, nie tik). Znalezione
     przy audycie 157, poza jego zakresem (dotyczy pauzy, nie klasyfikacji).

162. 🟠 **Potyczka bez wojny daje DWIE linie Dziennika, z czego jedna jest zaszyta po polsku.**
     Gałąź EAH bez wojny (`EnemyAttackHandler:214-219`) pisze **własny** wpis (`⚔ Bitwa w ${systemId}:
     … Zwycięzca: ${…'wróg'/'gracz'/'remis'}`) i **dopiero potem** emituje `battle:resolved` `:228`,
     na którym `GameScene:2380` dokłada `log.battleLine`. ⇒ dublet narracji **niezależny od 150**
     (to dwaj narratorzy, nie podwójna emisja) + gracz EN dostaje polski meldunek. Klasa Findingu
     113/158. ⚠ **To był argument przeciw poszerzeniu filtru w 157** (byłaby trzecia linia); naprawa
     W3 go **nie usuwa** — dublet EAH↔GameScene zostaje. Kształt naprawy: skasować wpis w EAH
     (`GameScene` już go pokrywa) albo przenieść go na `t()`.

163. 🟠 **`showBattleOutcome` — drugi blok zaszytego polskiego w `BattleIntroModal`** (dodatek do 158).
     `:226-231` (`ZWYCIĘSTWO` / `PORAŻKA` / `REMIS`) oraz `:288-292` (`Tur:` / `Straty:` /
     `'Agresor'` / `'Obrońca'` jako fallbacki). ⚠ Wpis jest **osobny od 158**, bo ta ścieżka pokazuje
     się **także wtedy, gdy gracz pominął kino** (`_tryShowNextBattle:3830` — gałąź `skip`) **oraz**
     dla KAŻDEJ bitwy deep-space (`:3796`, `fcCombatFx`) ⇒ to najczęściej oglądane okno walki w grze,
     nie wariant. Naprawa 157/W3 świadomie go nie tyka (osobny podpis: i18n + nazwy nagłówków).

164. 🟠 **Przełącznik auto-slow nie ma producenta — gracz NIE MOŻE go wyłączyć.**
     `TimeSystem:34` nasłuchuje `time:autoSlowToggle`, a **zdarzenia tego nie emituje NIKT w całym
     `src/`** (zmierzone przeglądem plików produkcyjnych, pin `battle_result_classification_smoke`
     T7). `_autoSlowEnabled` startuje jako `true` (`:25`) i **nie jest serializowane**, więc
     w normalnej rozgrywce jest true ZAWSZE. Menu dolnego paska ma „Auto-pauza…", ale to **inny
     system** (`AutoPauseSystem`, który `battle:resolved` w ogóle nie słucha) — pozostały też
     resztki po przełączniku: `time:display` wciąż wozi pole `autoSlow`, `UIManager._timeState.autoSlow`
     domyśla się `true` i jest przekazywane do `BottomBar.hitTest`.
     ⚠ **ZNALEZIONE PRZEZ BŁĄD W MOIM GATE'CIE, nie przez pomiar kodu**: krok 4 live-gate'u 157 kazał
     właścicielowi „wyłączyć auto-slow w menu" i uznać dalsze zwalnianie za porażkę naprawy. Właściciel
     zgłosił 🔴, i miał rację co do OBSERWACJI — ale przyczyną nie był defekt naprawy, tylko **krok
     niewykonalny**: przełącznika nie ma. Lekcja jest dokładnie tą, którą repo już zapisało
     (`validate-gate-oneliners-on-live-engine`), rozszerzoną: **weryfikuj także ISTNIENIE elementu UI,
     który każesz komuś kliknąć — nie tylko składnię jednolinijkowca**. Skutek uboczny: asercja
     „guard wygrywa z wolą gracza" w keeperze pinuje **model**, nie wybór gracza — jest tak
     oznaczona, a osobny pin zapłonie, gdy przełącznik zyska nadawcę.
     **Decyzja o zakresie NIEPODJĘTA** (podłączyć przełącznik vs. wyciąć resztki) — poza podpisem 157.

165. 🟠 **Obrona orbitalna nie ma PRZEBIEGU — rozstrzyga się jednym wywołaniem, bez sygnału na
     starcie.** `EnemyAttackHandler._onVesselArrived` zbiera przybyłych przez okno
     `BATTLE_BATCH_WINDOW_MS = 500` (ms REALNE) i woła `_resolveBatchedBattle` → **jedno**
     `resolveBattle` (abstrakcyjny `BattleSystem`) → `battle:resolved`. Nie ma `vessel:engaged`, nie
     ma rund, nie ma nic na mapie. Dla porównania DSCS: `startEngagement` → **`vessel:engaged`
     (auto-slow NA STARCIE, `TimeSystem:51`)** → `_tickEncounter` co `ROUND_INTERVAL_MS = 110`
     (~2,2 s realne) → `_finalizeBattle`. ⇒ **walka o stolicę jest dla gracza wyłącznie WYNIKIEM PO
     FAKCIE**, a walka w głębokim kosmosie ma widoczny przebieg i czas na reakcję.
     ⚠ Istniejący popup „⚔ WYKRYTO WROGĄ JEDNOSTKĘ" (`GameScene:2646`, `vessel:firstSighting` +
     `_triggerAutoSlow` + pauza) **NIE jest tym samym**: to detekcja obserwatorium, **raz na statek**,
     nie sygnał starcia — drugie uderzenie znanym już okrętem nie da nic.
     ⚠ **To NIE jest porażka naprawy 157** (potwierdzone na gate'cie): 157 dowiózł jedyny sygnał
     czasowy, jaki ta ścieżka w ogóle ma, i z konstrukcji ląduje on na rozstrzygnięciu — bo wcześniej
     nie ma czego obserwować. Zamknięcie = albo sygnał przed bitwą (odpowiednik `vessel:engaged` dla
     EAH), albo przeniesienie obrony orbitalnej na potok DSCS. **Osobny podpis, własny pomiar.**

> ⚠ **Rozstrzygnięte przy okazji, ŻEBY NIE WRACAŁO:** wpisy „N tur" pochodzą **wyłącznie**
> z `BattleSystem.resolveBattle` (`MAX_TURNS = 30`); **`DeepSpaceCombatSystem` NIE zwraca pola
> `turns` w ogóle**, więc odczyty `29 tur` / `10 tur` **nie są** przekroczeniem `MAX_ROUNDS = 20`
> i nie dotyczą warstwy naprawianej w `131cc2e`. Dwa wpisy o różnych liczbach = **dwie realne
> bitwy** (paczka 2 + pojedynczy rajder), nie duplikat.

---

## Findings z audytu Dziennika (2026-08-27) — języki, surowe kody, poprawność

Audyt read-only na zgłoszenie właściciela („*w Dzienniku pojawiają się informacje w dwóch
językach… czasami `sys_home` albo `sys_xxx` zamiast nazwy… wiele kwestii w formie kodu*").
Pełny raport z pomiarami: `docs/audit/EVENT_LOG_AUDIT.md`. Keeper: `event_log_entry_smoke` 34.
Commity: `0aacf8c` (167/168/169) · `1483a25` (D2) · `ffc72fb` (E+F, 170/171/173/175) ·
`8fe43eb` (172/174/176).

**Zmierzone wejściowo:** 119 miejsc pisania do Dziennika · **29 z literałem omijającym `t()`**
(z czego **26 POLSKICH**) · **≥20 z surowym id/slugiem** · słowniki `pl=en`, 0 luk,
0 niezgodnych placeholderów · `check-i18n` **PASS**.

⚠ **DLACZEGO TO NIE BYŁA „PRACA TŁUMACZENIOWA".** Właściciel gra z **angielskim Dziennikiem**
(memory `gate-filters-language-agnostic`), więc 26 polskich literałów pokazywało mu się po
polsku **bez żadnego przełączania języka**. Teza „gram w jednym języku, więc problemy
tłumaczenia mnie nie dotyczą" była fałszywa **dokładnie w jego przypadku** — i to ona
uzasadniała zejście z zakresu, dopóki nie została zmierzona.

⚠ **MARTWY KĄT NARZĘDZIA (ta sama klasa co Finding 113).** `check-i18n` pyta „*czy klucz użyty
w `t()` istnieje w pl i en*", a **nie** „*czy każdy widoczny napis przechodzi przez `t()`*".
Literał w `push({ text: … })` jest dla niego **niewidzialny**, więc bramka świeciła na zielono
przy 29 literałach. ⇒ **poprawione w Findingu 177** (zapadka na baseline).

| # | rzecz | status |
|---|---|---|
| **165** | Tekst wpisu renderowany PRZY EMISJI i persystowany (200 wpisów w save) ⇒ po zmianie języka Dziennik jest dwujęzyczny **z konstrukcji**. Zmierzone wykonaniem: `restore()` nie tłumaczy ponownie. | ⬜ **ZAPARKOWANY** świadomie (decyzja właściciela 2026-08-27) — dotyczy wyłącznie gracza, który PRZEŁĄCZA język; jedyna pozycja z bumpem save'a. Zamknięcie = model `{key, args}` + fallback `text` dla starych zapisów. |
| **166** | `EnemyAttackHandler` ×4 — polskie literały + surowe `sys_xxx`, a gałąź bez wojny **dublowała** linię bitwy (własny wpis + kanoniczny `log.battleLine` z `GameScene`). Jedna potyczka = dwa wpisy, dwa formaty, dwa języki. | ✅ `ffc72fb` — własny wpis usunięty, narrator jeden (spójne z 155). |
| **167** | `GameScene:2388` liczyło nazwę układu jako `sysId ?? '?'`, mimo że kanon `systemDisplayName` jest **zaimportowany w tym samym pliku** (`:15`) i użyty 2500 linii niżej (`:4911`). | ✅ `0aacf8c`. ⚠ Gałąź macierzysta ZOSTAJE na `homePlanet.name` — nazwa PLANETY w miejscu nazwy UKŁADU, ta sama klasa, ale zmiana widoczna w każdej bitwie u siebie ⇒ **osobna decyzja**. |
| **168** | `EventLogSystem.restore` nie zasiewał `_currentYear`, a `time:display` nie leci na pauzie (`TimeSystem:70`) ⇒ wpisy tuż po wczytaniu miały `year = 0` i renderowały się jako `---`. | ✅ `0aacf8c` — seed z ostatniego wpisu (nie z `window.KOSMOS`: moduł ma zostać pinowalny wykonaniem). |
| **169** | `TYPE_MAP` bez `poi_alert`/`poi_rally` ⇒ alarm pikiety lądował w kanale **System**. ⚠ Objaw podstępny: wpis miał poprawny KOLOR (z `LOG_COLORS`) i wyglądał na dobrze skierowany. Ta sama cicha usterka, którą W2-7 naprawiło dla intel/combat/diplomacy — te dwa typy pominięto. Osobno: brak kanału `diplomacy` w `CHANNELS`. | ✅ `0aacf8c` + `1483a25` (D2: kanał + trzy szczeble severity — jeden typ nie umiał odróżnić sojuszu od wypowiedzenia wojny, oba były `warn`). |
| **170** | 29 literałów omijających `t()` w 5 plikach; 2 wpisy **dwujęzyczne w jednej linii** („ostatnia pozycja `[unknown]`", „osiągnął `waypoint` 3/5"); `ship.namePL` na twardo; `toLocaleString('pl-PL')` na twardo; surowe `emp_003` w alarmie pikiety. | ✅ `ffc72fb` + `8fe43eb`. Nazwa imperium **bramkowana poziomem wywiadu** (wzór `NotificationCenter._empireLabel`) — pikieta nie rozdaje tożsamości za darmo. |
| **171** | Polskie `label` uczestników bitwy (EAH/WarSystem/DSCS/VCS) wchodzą przez `participantName` (`BattleSides:46`) do **przetłumaczonej** `log.battleLine`. ⚠ Strona GRACZA jest maskowana przez `playerLabel`, strona WROGA **nie** — i dlatego to umykało: gracz EN czytał „Battle in …: Flota wroga (3 statków) vs Player". | ✅ `ffc72fb`. ⚠ `BattleSides` pozostaje **bezjęzykowy** (etykiety parametrem) — jego testowalność pod node zależy od braku importu i18n. |
| **172** | `EventLogOverlay` rysował „↗" i hit-zonę dla **każdego** wpisu z `entityRef`, a bitwy stemplują go id UKŁADU — a układy **nie są encjami** (jedyny `entities.set` to `EntityManager:25`) ⇒ wiersz wyglądał na klikalny i kończył na `console.warn`. | ✅ `8fe43eb` (`_isNavigable`) + usunięty `console.log` na każde kliknięcie. |
| **173** | `combat:round` pisał wpis na **każdą rundę**; ring buffer ma 500 miejsc ⇒ ~26 starć naziemnych wymiatało CAŁĄ wcześniejszą historię. Bilans i tak niesie `combat:hexResolved`. | ✅ `ffc72fb` — model „start + podsumowanie" zamiast per-runda. |
| **174** | 8 wpisów PL z angielskimi słowami **w samym słowniku** (`vessel`, `vessels`, `waypoint`, `retreat`, `friendly`, `Engage`, `pursue/intercept`), w tym **notatka deweloperska** wystawiona graczowi jako opis jednostki („placeholder — fleet-group w osobnym projekcie"). | ✅ `8fe43eb`. Pin **wykonaniowy** (T5) na czystość językową kluczy Dziennika/POI/doktryn. |
| **175** | Trzy kopie rezolwera nazwy układu o różnej jakości; `ORDER_ACTIVITY_KEYS`/`MISSION_ACTIVITY_KEYS` (kompletne, PL+EN, z `generic`) **prywatne** w `FleetPictureLogic` ⇒ Dziennik wypisywał `moveToPoint`; `resource.*` istniały od Etapu 6.1, a raporty pokazywały `minerals:12`. | ✅ `ffc72fb` — eksport zamiast trzeciej kopii; surowce/towary przez `getName`/`resource.*`; casus belli przez `CASUS_BELLI`. |
| **176** | `EventLogOverlay`/`EventLogDrawer` z własnymi ternary `pl ? … : …` (7 miejsc); jeden napis — „Dziennik niedostępny…" — **bez wariantu EN w ogóle**. | ✅ `8fe43eb`. `getLocale` ZOSTAJE dla etykiet kanałów: `CHANNELS` trzyma `labelPL`/`labelEN` jako DANE. |
| **177** | `check-i18n` odpowiadał wyłącznie na „czy klucz użyty w `t()` istnieje w pl i en", a **nie** na „czy każdy widoczny napis przechodzi przez `t()`" ⇒ bramka świeciła na zielono przy 29 literałach w Dzienniku. Ta sama klasa co Finding 113. | ✅ `8420c98` — skan sinków napisów (2 tiery, T3 świadomie pomijany) + **zapadka na baseline 62 w 11 plikach UI**. Keeper `i18n_hardcoded_gate_smoke` 14. |

### ⚠ Lekcja procesowa z tej rundy — pin, który świecił zielono dokładnie na defekcie

Pierwsza wersja pinu T6 szukała `getLocale() === 'pl' ? '…'`. Stary kod przypisywał najpierw
`const pl = getLocale() === 'pl'` i **dopiero potem** robił `pl ? … : …` ⇒ **pin przechodził
na kodzie sprzed naprawy** (zmierzone na treści z `HEAD`). Przepisany na pomiar **SKUTKU** —
„zero polskich literałów w widoku" — pada teraz na starym kodzie z 6 trafieniami.
To trzeci raz w tym repo, gdy jałowy pin złapała dopiero **kontrola pinu**
(por. `pin-must-name-the-live-path`, `threshold-scale-false-green`).

### Otwarte / świadomie poza zakresem

- **165** (wyżej) — jedyna pozycja z bumpem save'a.
- **167** gałąź macierzysta — nazwa planety w miejscu nazwy układu.
- ✅ **Poprawka `check-i18n` — ZROBIONA** (Finding 177, `8420c98`). ⚠ Zasięg został ZMIERZONY:
  **62 napisy w 11 plikach UI** siedzą teraz w baseline jako dług — w tym **ekran końca gry
  (Finding 113)**, 3 flashe budowy w `ColonyOverlay` i 9 w legacy `PlanetScene` (nieosiągalne).
  Zapadka nie pozwala tego długu POWIĘKSZYĆ; spłata to osobna praca.
- **`fleet.clusterGate` = „🌀 Jump Gate"** — zostawione świadomie (nazwa własna konstrukcji).
- **Niezweryfikowane:** czy `combat:round`/`combat:hexResolved` mogą odpalić dla walki
  AI-vs-AI (handler zakłada udział gracza; `CombatSystem:128` domyśla `u.owner ?? 'player'`).
- ⚠ **Wszystkie cztery commity BEZ live-gate'u** — na wyraźne polecenie właściciela.
  I **naprawy nie cofają wpisów JUŻ ZAPISANYCH**: 200 wpisów siedzi w save jako gotowy tekst,
  więc stare linie zostaną w starej postaci, aż wypadną z ring buffera. Bez tego zastrzeżenia
  gate przeczyta to jako „naprawa nie działa" (por. `reasonless-failure-reads-as-unfixed`).

---

## Findings z A/B ekonomii AI (2026-08-28) — pomiar headless, BEZ naprawy

Pomiar na zgłoszenie właściciela („*chcę świeży test zdrowia ekonomii AI — podejrzewam, że
zmiany mechaniki wzrostu populacji cofnęły naprawy z BALANS Phase 3*"). **Podejrzenie
NIEPOTWIERDZONE** — A/B `214127a` (rekord BALANS Phase 3) vs HEAD `06a3de1`, 8 seedów × 45 gy,
galaktyka przypięta (`HEADLESS_GALAXY_SEED`), przyrząd (`AiTelemetry`/`AiThresholds`/`RuleBot`)
**bit w bit niezmieniony**: imperia bez placówki **8/16 → 1/16**, obsada etatów **83 % → 100 %**,
Ti brakuje **8/16 → 1/16**, werdykt narzędzia `outcome 1` → `outcome 3`. Industrialista wychodzi
**co do roku identycznie** po obu stronach; cała poprawa siedzi w ekspansjoniście.

⚠ **Sprostowanie chronologiczne, które obala samą przesłankę:** Population 2.0 zamknęła się
**2026-07-30** (`6c9cffd`), a BALANS Phase 3 exp #1 mierzył **2026-08-05** (`81489f5`) — baseline
Phase 3 **już zawierał** nową mechanikę wzrostu. Po 5 sierpnia w plikach populacji nie ma żadnej
zmiany mechaniki wzrostu.

⚠ **Czego ten panel NIE mierzy (zmierzone, nie założone):** `GameCore.js` nie montuje Directora,
a bootstrap sam pisze `brak window.KOSMOS.stationSystem — żeton stacji NIE zasiany, produkcja
okrętów wojennych pozostanie zablokowana (R-3)` ⇒ **GATE B2(a) jest headless nieweryfikowalny
z definicji**. Ponadto `runOneGame` przypina `galaxySeed` **bez ścieżki nadpisania z `opts`**, więc
„świeże seedy" zmieniają układ GRACZA, a domy AI zostają `sys_061`/`sys_040` — to nadal
**2 sytuacje × N powtórzeń**, nie N niezależnych losowań.

| # | rzecz | status |
|---|---|---|
| **178** | **Kurierzy AI: wysłano ≫ dostarczono; 4/8 imperiów nie buduje ani jednego.** ZMIERZONE (`probe-ai-economy-health.mjs`, 4 seedy × 45 gy, galaktyka przypięta): wysłano→dostarczono **12→2, 12→2, 8→0** na HEAD; **14→4, 14→4, 11→1** na `214127a` ⇒ obecne po OBU stronach A/B, czyli **stan zastany, NIE regresja**. 4/8 imperiów na HEAD buduje ZERO kurierów. Zatrzask `pendingBuildRoute` zapalony na koniec przebiegu w 1 z 4 seedów **mimo** fixu W1-6 (`45b3135`). Rodzina: **GATE B2(a)** (`VO3B_PLAN.md` §9) + `docs/BALANS_PHASE2_AI.md` §4.2 (kit placówki: `Cu`, `conductor_bundles` — dokładnie to, co kurier miał dowozić) ⇒ kandydat na **warunek wstępny** B2(a). **Poszerzenie (2026-08-28, przy diagnozie paliwa):** brak dostaw to nie jest wyłącznie kwestia licznika — **kanału NIE MA dla całej klasy towarów WYTWARZANYCH**. `EmpireLogisticsSystem._loadByRarity` ładuje wyłącznie klucze `MINED_RESOURCES`, posortowane po rzadkości malejąco, więc żaden commodity (paliwo, komponenty, prefabrykaty) **fizycznie nie wejdzie na pokład kuriera**. Trasa jest przy tym **jednokierunkowa**: outpost → stolica (`_unloadAtCapital`), noga wychodząca leci pusta ⇒ **wtórne kolonie i placówki AI nigdy nie otrzymują komponentów**, niezależnie od tego, ile stolica ich ma. Konsekwencja dla przyszłej pracy: sam pomiar przepływu towaru (pierwszy krok wpisany wyżej) **potwierdzi zero z definicji** — pytaniem nie jest „czy dociera”, tylko „czy kanał dla tej klasy w ogóle istnieje”. | 🟠 **OTWARTY, świadomie NIE priorytet.** ⚠ **GRANICA DOWODU: zmierzony jest LICZNIK `logi.stats.delivered`, NIE przepływ towaru.** Pierwszy krok każdej przyszłej pracy = porównać stany magazynów placówka↔stolica w czasie; jeśli ładunek dociera, a licznik nie tyka, to finding o **liczniku**, nie o logistyce (klasa Findingu 106: dowodem jest SKUTEK, nie odczyt). ⚠ NIE blokuje dziś ekspansji AI (1/16 bez placówki, mediana 3 ciała) — stąd 🟠, nie 🔴. |
| **179** | **Kolonizacja bota referencyjnego pada na VO-2 — przypięte, odłożone świadomie.** ZMIERZONE (mediana ciał gracza w panelu AI): `214127a` = 5 · `e964c6b` = 4 · `ecf8233` (VO-1) = 4 · **`2335c4b` (VO-2) = 1** · `577b829` = 1 · HEAD = 1, w 8/8 seedach. AI nietknięte (4 po obu stronach) — AI nie zakłada kolonii przez misje statków. `7d4f9a7` (138+142) **oczyszczone pomiarem**. | ⚪ **NISKI priorytet, decyzja właściciela 2026-08-28.** ⚠ To **bot referencyjny w headless, NIE ścieżka UI**: właściciel gra regularnie i objawu nie obserwuje, a VO-2 przeszedł live-gate ⇒ czytane jako artefakt sposobu, w jaki bot wydaje misje. **Nie jest to zdiagnozowany bug rozgrywki i nie wolno go tak cytować.** Powód zapisania mimo to: panel BALANS używa gracza jako **punktu odniesienia dla AI**, więc dopóki to stoi, każde porównanie „AI vs gracz" jest przekrzywione. Tani rozstrzygacz, gdyby wracało: czy kolonizacja przez `ActionAdapter` przechodzi tym samym dyspozytorem co UI. |
| **180** | **(d) BRAK PROCESU — paliwo AI: jest surowiec, jest technologia, nie ma ogniwa przetwórczego ani kanału.** Czwarta kategoria, rozłączna z (a) priorytetem, (b) łańcuchem i (c) zdolnością. **Producent:** `fuel` ma `recipe { H: 4 }`, tier 2, `requiresTech: null`, ale ta receptura jest dla fabryki MARTWA — `FactorySystem._scanFuelDemand()` zwraca `[]` **bezwarunkowo, dla wszystkich**, z komentarzem, że paliwo to produkt rafinerii, nie fabryki generycznej. Robią je dwa budynki: `gas_fuel_refinery` (hexy gazowca) i `fuel_refinery` (**`terrainAny: true`**, rafinuje H z magazynu). Oba `requires: 'exploration'` — **AI ma ten tech w `startingTechs` od pierwszej tury** — oba `popCost: 0` (autonomiczne, nie konkurują o siłę roboczą), koszt trywialny (Fe 30 / Cu 8 / Si 5) wobec ~200 000 rudy. **Zdolność jest w pełni otwarta.** **Decyzja budowlana: nie istnieje.** `ColonyAutoExpander.BUILD_PRIORITY` to zamknięta lista dziesięciu pozycji (farm, well, solar_farm, mine, factory, smelter, habitat, shipyard, research_station, observatory); grep `refinery` w `ColonyAutoExpander` + `EmpireStrategySystem` + archetypach + `data/targets` = **0 trafień**. **Dystrybucja: nie istnieje, podwójnie** — patrz poszerzenie Findingu 178. **Dlaczego H rośnie:** `H` ma `rarity: 5`, najwyższą w tabeli, a `_loadByRarity` sortuje malejąco, więc kurierzy zwożą wodór do stolicy **w pierwszej kolejności** i nic go tam nie przetwarza (obserwacja z żywej gry: `emp_001` H = 78 620 przy `fuel` = 0). Zapas nie jest anomalią — jest tym mechanizmem wykonanym poprawnie. | ⬜ **UTAJONY — dziś nie blokuje NICZEGO, i to jest cała trudność tego wpisu.** Statki AI są zwolnione z bramek paliwowych: `canReach` (`VesselManager:588`) i `canJump` (`:818`) omijają `isEnemyVessel`, a `_tickRefueling` nie ma owner-gate'u ⇒ kurierzy AI **próbują** tankować, dostają zero i lecą dalej na clampie. ⚠ **ZALEŻNOŚĆ, KTÓRA DECYDUJE O KAŻDYM PRZYSZŁYM GATE'CIE: dopóki zwolnienie paliwowe AI stoi, pomiar tej naprawy ZMIERZY CISZĘ** — naprawisz proces i nic się nie zmieni, bo nic od paliwa nie zależy. Naprawa ma sens wyłącznie **razem** ze zdjęciem zwolnienia, nie osobno. ⚠ Odwrotnie: dzień, w którym ktoś zdejmie zwolnienie, żeby AI grało tymi samymi regułami, **floty AI staną natychmiast i wszędzie** — w całym imperium nie ma ani jednego ogniwa produkcji paliwa. Ta sama klasa co **W3-23** (bramka portu nieaktywna dla AI tylko przez przypadek katalogu). ⚠ **NIE jest to rodzina GATE B2(a)** — ZMIERZONE: `fuel` nie występuje w kosztach budowy statków, kadłubów ani modułów (grep w `ShipsData`/`HullsData`/`ShipModulesData` = 0), więc nie blokuje `startShipBuild`. ⚠ **Świadomie NIEZMIERZONE** (decyzja właściciela 2026-08-28): co się stanie po zdjęciu zwolnienia paliwowego AI — to osobna, jeszcze niepodjęta decyzja; tu udokumentowany jest mechanizm i zależność, żeby dało się to sprawdzić, gdy decyzja zapadnie. |
| **181** | **(c) ZDOLNOŚĆ — trzy bramki technologiczne poza planem badań AI, i kaskada na `warp_cores`.** Plan techniczny imperium = `startingTechs ∪ researchQueue` JEGO archetypu; `EmpireResearchSystem` grantuje **wyłącznie** pozycje z tej kolejki, innego źródła techów dla AI nie ma. ⚠ **EXPANSIONIST NIE jest czystym klonem INDUSTRIALIST** — nadpisuje własną `researchQueue`, więc diagnoza jest PER ARCHETYP: `quantum_computing` (→ `quantum_processors`) i `military_logistics` (→ `military_supplies`) są poza planem **obu**; `fusion_power` (→ `antimatter_cells`) jest poza planem **industrialisty**, ekspansjonista ma je na poz. 7. **Kaskada:** `warp_cores` = `quantum_cores 2 + antimatter_cells 2 + Ti 8`, więc u industrialisty `warp_cores` są nieosiągalne **mimo posiadania `ion_drives`** — blokuje półprodukt, nie bramka samego towaru. `military_supplies` zasila zaopatrzenie jednostek naziemnych (`BuildingsData:765`) i magazyn statku zaopatrzeniowego (`ShipsData:132`). | ✅ **ZAMKNIĘTY 2026-08-28** — `ccb275b` (gałąź fuzji: `plasma_physics` + `fusion_power` doklejone NA KOŃCU `researchQueue` Industrialisty) + `c8a0419` (korekta listy D4). **GATE 4/4 PASS:** (1) `antimatter_cells` u Industrialisty tracą werdykt `(c) ZDOLNOSC`; (2) `warp_cores` **po raz pierwszy niezerowe** (6 szt.), a tam gdzie zero — z nazwanym powodem; (3) `warp_drive` **nadal 10 gy**, ZMIERZONE (F2 chroniło ekspansję cross-system); (4) panel 16 seedów bez regresji i lepszy niż baseline — bez placówki 1/32, naruszenia **81/192** (baseline 83). Gałąź fuzji ląduje na 13-14 gy. Plan: `AI_FUSION_BRANCH_PLAN.md`. ⚠ **ZAMKNIĘTY W CZĘŚCI — `military_supplies` NIE zostały naprawione** (decyzja F4: `military_logistics` ma prereq `ground_warfare` spoza kolejki, a towar zasila zaopatrzenie naziemne, nie warstwę warp) ⇒ **wydzielone do Findingu 185**, żeby nie zniknęły razem z tym wpisem. ⚠ Zakres tego findingu został wcześniej zawężony pomiarem (184): `quantum_processors` nigdy nie były zablokowane. **✅ LIVE-GATE PASS 2026-08-28** (`AI_ECONOMY_LIVE_GATE_CHECKLIST.md`, gate retroaktywny): KOM-3 `fusion_power=true` u OBU archetypów, potwierdzone **dwukrotnie na dwóch niezależnych, LOSOWYCH galaktykach przeglądarki** — **15,2 gy** i **14 gy**. ⚠ To jest **walidacja krzyżowa osi czasu**: headless (galaktyka PRZYPIĘTA) przewidywał gałąź fuzji na 13-14 gy, a przeglądarka z innym seedem trafiła w to okno dwa razy — czyli prognoza nie była artefaktem przypiętej galaktyki. ⚠ **`warp_cores` NIE zweryfikowane na żywo** (bonus, nie warunek; oba przebiegi za krótkie) — najgłębsze ogniwo łańcucha pozostaje potwierdzone wyłącznie headless. |
| **182** | **(a) PRIORYTET — cel zapasu tier 3+ wynosi 1 sztukę, na piątym z sześciu priorytetów.** `getSafetyStockTarget` = **3** dla tier ≤ 2 i **1** dla tier 3+, plus `demandBonus`, który bootstrap AI ustawia **tylko dla sześciu** towarów (`startingSafetyStocks`: structural_alloys 30, polymer_composites 20, conductor_bundles 20, extraction_systems 15, basic_supplies 10, civilian_goods 10). `DEFAULT_REACTIVE_ORDER = [build, fuel, consumption, trade, **safety**, export_orders]` — zapas jest piąty z sześciu. ⇒ `quantum_cores` i `plasma_cores` mają tech ✅, zero brakujących składników i **cel 1 sztuki**, więc realnie nigdy nie wchodzą do produkcji. | ✅ **ZAMKNIĘTY 2026-08-28** — `d44af5e` (cel zapasu tier 3+ = 50 w `startingSafetyStocks` obu archetypów + bramka zamożności D3 w `ColonyAutoExpander`, AI-only) + `c8a0419` (korekta D4: `metamaterials` wracają, bo `exotic_materials` JEST w kolejce). Dwie **izolowane** zmiany, każda zmierzona osobno wzgl. baseline'u. **Zysk:** `plasma_cores` 0→50, `quantum_cores` 0→17, `quantum_processors` 0→30, sztuk towarów u bogatego 552→627. **Koszt pierwszej zmiany był REALNY, nie szumem** — potwierdzony na 32 imperiach (bez placówki 1/32→3/32, obsada 97%→94%) i **w całości zdjęty przez D3**: 1/32, obsada 99-100%, naruszenia 81/192 (baseline 83). Ubogie imperium chronione zgodnie z projektem. Plan: `AI_SAFETY_STOCK_PLAN.md`. ⚠ **Odstępstwo od literalnych progów podpisu ZAAKCEPTOWANE przez właściciela**: zamożność mierzona rudami POSPOLITYMI (`Fe/Si/Cu/C` ≥ 20k), rzadkie nie bramkowane — pomiar per ruda pokazał, że `Ti/Hv/Li` nigdy nie dobijają 20k, `Xe` rzadko 5k, a `Nt` jest **zerowe**, więc literalne progi zrobiłyby z tej zmiany no-op. **✅ LIVE-GATE PASS 2026-08-28** (kryteria 1+2 archetype-agnostyczne): imperium `BOGATY` ma `bonus=49` i `plasma_cores=50`, imperium `ubogi` ma `bonus=0` i tier 3+ na zerze; KOM-4 potwierdza izolację D1 — kolonie GRACZA nietknięte (`bonus=0`, `plasma_cores=0`). ⚠ **Drugi seed przeglądarki ODWRÓCIŁ role archetypów** (bogaty okazał się ekspansjonista, ubogi industrialista) i to jest **mocniejszy wynik niż powtórka headless**: dowodzi, że bramka idzie za MAJĄTKIEM, nie za tożsamością imperium — czego przypięta galaktyka headless z zasady pokazać nie mogła. ⚠ Pierwotne kryteria 1/2 nazywały archetypy i **były wadliwe** (wpisywały wynik przypiętej galaktyki w warunek zaliczenia); przepisane przed werdyktem, teza bez zmian. ⚠ Live-gate ujawnił też własność knoba D3 nieuchwyconą przez panel: `netto/rok` wszystkich czterech rud zamożności jest **ujemne**, więc bramka otwiera się na OKNIE stockpile'u i zamyka, gdy ten spadnie — kandydat na histerezę, gdyby okno okazało się za wąskie. |
| **183** | **Wyciek drzewa technologii gracza do placówek AI.** `EmpireColonyBootstrap:385-390` zostawia koloni **globalny `techSystem` gracza**, gdy imperium nie ma jeszcze kolonii z własnym drzewem. ZMIERZONE porównaniem TOŻSAMOŚCI obiektów (`colony.buildingSystem.techSystem === window.KOSMOS.techSystem`), 2 seedy × 2 imperia: **każda placówka AI** czyta drzewo GRACZA (`entity_149(out)=GRACZ`, `entity_146(out)=GRACZ`, …), a **każda pełna kolonia** czyta własne `aiTech`. Jednorodnie, bez wyjątku. | 🟡 **OTWARTY, skutek NIEZMIERZONY.** Trop wypłynął przy diagnozie (c) i był powodem sprzecznych werdyktów sondy, zanim poprawiono selektor stolicy. ⚠ Nie wiadomo, **czy placówki w ogóle czytają techy** — są autonomiczne (`popCost: 0`, `autonomous_solar_farm`/`autonomous_mine`) i mogą nigdy nie trafić w bramkę technologiczną; wtedy wyciek jest nieszkodliwy. Ale jeśli trafiają, placówka AI ocenia dostępność budynków i receptur **drzewem gracza** — tym mocniejszym, im dalej gracz zaszedł. **Do rozstrzygnięcia PRZED slice'em (c)**, bo zmienia jego zakres: naprawa bramek technologicznych AI na koloniach nie ruszy placówek. Sonda: `probe-ai-advanced-components.mjs` (kolumna `techSystem`). |
| **184** | **Deklarowana bramka technologiczna towaru ≠ bramka egzekwowana — dla 4 z 12 towarów, u GRACZA tak samo jak u AI.** `FactorySystem.isRecipeAvailable` to **OR trzech gałęzi**: (1) `techSys.isCommodityUnlocked(id)` — efekt `unlockCommodity` z dowolnej zbadanej technologii; (2) brak `requiresTech`; (3) `isResearched(def.requiresTech)`. Gałąź (1) **przebija** deklarację z `CommoditiesData`, bo `TechData` i `CommoditiesData` są autorowane niezależnie. ZMIERZONE skanem CAŁEGO katalogu: 12 towarów ma `requiresTech`, **4 mają rozjazd** — `android_worker` (deklaruje `android_engineering`, otwiera **`robotics`** — a `robotics` jest w `startingTechs` AI, więc gate jest otwarty od pierwszej tury), `antimatter_cells` (deklaruje `fusion_power`, otwiera `antimatter_containment`), `quantum_processors` (deklaruje `quantum_computing`, otwiera `quantum_physics`), `warp_cores` (deklaruje `ion_drives`, otwiera `warp_drive`). Pozostałe 5 bramkowanych przechodzi wyłącznie gałęzią (3). | 🟡 **OTWARTY — pytanie PROJEKTOWE, nie bug.** Nie wiadomo, **która strona jest prawdą**: czy `quantum_physics` MA odblokowywać procesory (wtedy `requiresTech` jest nieaktualne), czy odwrotnie. Rozstrzygnięcie należy do projektanta, nie do pomiaru. ⚠ Skutek jest **symetryczny** — bramka czyta `techSystem` kolonii-właściciela, więc gracz, który zbada `robotics`, dostaje `android_worker` bez `android_engineering` dokładnie tak samo jak AI. ⚠ Konsekwencja dla czytania dokumentacji i planów: **`requiresTech` w `CommoditiesData` nie jest wiarygodnym opisem bramki** — efektywną bramkę trzeba czytać z OBU źródeł naraz. Sonda: skan w `probe-ai-advanced-components.mjs` (kolumna `tech`) + skan katalogu z tego pomiaru. |
| **185** | **`military_supplies` pozostają nieosiągalne dla OBU archetypów AI** — wydzielone z Findingu 181 przy jego zamykaniu, żeby nie zniknęły razem z nim. `requiresTech: 'military_logistics'` (150 rp), a jedyna technologia z `unlockCommodity` na ten towar to ta sama `military_logistics` ⇒ brak obejścia przez gałąź (1) bramki. Nie ma jej ani w `startingTechs`, ani w `researchQueue` żadnego archetypu, a jej prereq **`ground_warfare` też jest spoza kolejki**, więc koszt to nie 150 rp, tylko cała gałąź. Towar zasila **zaopatrzenie jednostek naziemnych** (`BuildingsData:765`, adjacency Barracks/Capital) oraz **magazyn statku zaopatrzeniowego** (`ShipsData:132`, `supplyMagazine: 500`). | 🟠 **OTWARTY, świadomie poza zakresem** (decyzja F4 przy podpisie `AI_FUSION_BRANCH_PLAN`). ⚠ Nie należy do warstwy warp ani do ekonomii komponentów — to **gałąź naziemna**, więc naturalnym miejscem jest slice GROUND (rodzina Findingów 49/50: katalog transportowca AI + desant AI na modelu legacy), nie ekonomia AI. ⚠ Zanim ktoś to wyceni: sprawdzić, czy jednostki naziemne AI w ogóle konsumują `military_supplies`, czy legacy model z Findingu 50 omija ten kanał — inaczej naprawa zasili towar, którego nikt nie czyta. |

**Przyrząd:** NEW `src/testing/headless/probe-ai-economy-health.mjs` (read-only, nic nie zapisuje
poza stdout) — `AiTelemetry` mierzy DECYZJE i nie dotyka ani fabryk poza droidem, ani kurierów.
⚠ Sonda rozdziela **rudy od towarów**; bez tego rozdziału ~200 000 jednostek rudy udaje produkcję
fabryki (pierwsza wersja tak właśnie kłamała). Zmierzony stosunek **~500 sztuk towarów na ~200 000
rudy** i **11 towarów trwale na zerze** to ta sama diagnoza co slice ZASOBY: gospodarka jest
**komponentowa, nie rudowa**.

---

## Findings z audytu W3-32 (2026-08-29) — STANOWA reszta „darmowego skanu układu"

Audyt otwierał serię przeglądu rejestru (`OPEN_FINDINGS_INDEX.md` §E, pozycja 1). **Sam W3-32 okazał
się ZAMKNIĘTY dziewięć dni przed powstaniem indeksu** (`61bdffe`, W3-5b; bramka właściciela stoi
w `MissionEventModal:634`, keeper `w3_foreign_arrival_gate_smoke` 5/5 uruchomiony ponownie —
zielony). Indeks nie kłamał: sam deklaruje, że poza dziesięcioma pozycjami „przepisane z rejestrów
BEZ ponownego pomiaru", a ta była jedną z przepisanych.

⚠ **Ale W3-32 nazwał DWIE szkody, nie jedną.** Poprawka zamknęła pauzę z fałszywą treścią i skan
**widoczny w popupie**. „Darmowy skan układu" miał drugi, niezależny kanał — **stanowy, u
producenta** — i ten żył. Poniżej dwa findingi tej reszty, oba zamknięte w tym samym commicie.

| # | rzecz | status |
|---|---|---|
| **186** | **Mgła wojny nad układami AI przebita OR-em nad flagą, której reset zapomniał — ŻYWE OD PIERWSZEJ TURY.** `StarSystemManager.generateAndRegister` zapalał DWIE flagi: `galaxyStar.explored` (`:105`) i lustro `sysData.explored` (`:114`). `EmpireColonyBootstrap:612-615` gasił **tylko pierwszą** — z komentarzem formułującym regułę projektu wprost („Gracz nie ma free intel na system AI — musi zrobić własny recon"). Pięciu konsumentów czytało `galaxyStar` (poprawnie), a DWAJ czytali obie przez **OR**: `FleetManagerOverlay:6249` (panel detalu STRATCOM) i `:6784` (panel rozkazu warp, gdzie bramka była **świadomie skopiowana** z tego pierwszego — Finding 108/Z4). W OR-ze wygrywało nigdy-nieresetowane lustro. **ZMIERZONE WYKONANIEM** (prawdziwa `_buildSystemScanLayout`, gracz **bez obserwatorium**, `getMaxSystemScanTier() = 0`): `explored=true` → **6 wierszy, tier 3** (`Planety=11 Księżyce=27 Planetoidy=26 … Razem=64`); `explored=false` → 0 wierszy, kontrolka `locked`. Do tego status „Zbadany" na zielono i przycisk **„🔭 Przełącz widok"** → `switchActiveSystem` → widok 3D cudzego układu. **Osiągalne dwoma kliknięciami**: strefa `cluster_star` jest pushowana dla KAŻDEJ gwiazdy, bez bramki `known` (`:6124`), a `_drawStratcomDetail` rysuje się dla dowolnego zaznaczenia (`:6145-6149`). Uzbrojone dla domowego układu **każdego** imperium AI, bo `EmpireGenerator:242` bootstrapuje wszystkie przy generacji galaktyki. **Szło do zapisu** (`serialize:238` / `restore:265`, w dodatku z fail-OPEN `?? true`). ⚠ **Dlaczego przeżyło:** nazwa układu ma TRZECI predykat (`_systemDisplayName:6355`, samo `sys.explored`) i zostawała „???" — panel WYGLĄDAŁ na zamglony, oddając spis i wejście. | ✅ **ZAMKNIĘTY 2026-08-29.** (b) NEW `src/utils/SystemExploration.js` — kanon rodziny nazw (`isSystemExplored` / `isSystemExploredId` / `isSystemExploredData` / `markSystemExplored`), fail-CLOSED, zero importów (wzór `ColonyOwnership.js`); `generateAndRegister` **przestaje oznaczać eksplorację** (generacja układu to fakt techniczny, nie akt poznania); `restore` fail-closed z gałęzią domową; **siedem** konsumentów zmigrowanych (FMO ×4, `Outliner:191`, `CivilianTradeSystem:95`, diagnostyka `GameScene`). (a) bootstrap gasi **obie** flagi jako obrona w głąb. Zapis **v101 bez migracji**, zero nowych kluczy i18n. Keeper `system_exploration_canon_smoke` **21/21**, fail-first **7/14** zmierzony finalnym fixture'em przez `git stash` samego kodu gry. **Live-gate PASS 2026-08-29** — dwa układy AI (Akhernar, Wezen), status „Niezbadany", brak spisu, brak wejścia w widok. |
| **187** | **Ten sam mechanizm na ścieżce PRZYLOTU — dokładnie tam, gdzie mieszkał W3-32.** `VesselManager._tickInterstellar:2709` woła `generateAndRegister` dla **dowolnego** przylatującego statku, więc przylot rajdera AI zapalał `galaxyStar.explored` — czyli przebijał mgłę **także na mapie galaktyki i w Outlinerze**, nie tylko w panelu detalu. Dziś nieosiągalne: AI skacze wyłącznie do układów GRACZA (`DirectorOffensive.reachableTargets:122-136` buduje cele z `getPlayerColonies()`), a te są zbadane z definicji. Uzbraja się w dniu, w którym AI skoczy gdziekolwiek indziej (logistyka cross-system, roamer, ekspansja). | ✅ **ZAMKNIĘTY 2026-08-29** razem ze 186 — bramka właściciela na przylocie (`!isEnemyVessel` → `markSystemExplored`). ⚠ **Przy okazji zamknięty PRZECIWNY defekt, którego nikt nie zgłosił:** oznaczenie stoi **poza** gałęzią leniwej generacji, bo `_tickInterstellar` woła generator tylko `if (!ssMgr.getSystem(...))` — układ imperium AI jest już wygenerowany przy bootstrapie, więc przylot **GRACZA** do cudzego układu **nie odkrywał go wcale**. Ten fałszywy negatyw był dotąd maskowany przez lustro w OR-ze `:6249`, czyli przez sam defekt 186. Pin: T4 + kontrola pinu. |

⚠ **Lekcja, która wychodzi poza te dwa wpisy — LUSTRO STANU JEST DŁUGIEM, NIE WYGODĄ.** Ten sam
fakt („`sysData.explored` zostaje true, więc filtrujemy po `galaxyStar`") był **zapisany w źródle
w dwóch miejscach** — `EmpireColonyBootstrap:612` i `Outliner:185-186` — zanim ktokolwiek nazwał go
defektem. Obejście napisane dwa razy z pamięci to nie jest wiedza projektu; to jest odliczanie do
trzeciego konsumenta, który jej nie będzie miał. **Gdy dwa miejsca obchodzą to samo pole, kanon jest
już spóźniony.**

⚠ **Reguła o indeksie:** `OPEN_FINDINGS_INDEX.md` sam siebie opisuje jako nieźródło prawdy i miał
rację — jego pozycja **nr 1** była zamknięta. Przed planowaniem czegokolwiek z listy przepisanej bez
pomiaru: **najpierw uruchom keeper i przeczytaj `git log -S`**, dopiero potem planuj slice.
