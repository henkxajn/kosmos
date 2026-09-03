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
     nigdy warp". 

     ✅ **POTWIERDZONY NA ŻYWO 2026-09-01 (gate 215, gy 30) — I MECHANIZM BYŁ OPISANY BŁĘDNIE.**
     Brakujący pomiar osiągalności dostarczył gate: **emp_002 ma outposty w `sys_034` i `sys_043`**
     (poza `sys_057` stolicy), a kurierzy **v_9 / v_10** logują przy każdym przylocie
     `[VesselManager] przylot do ciała spoza układu statku — NIE dokuję (W3-4b)` z celem
     `entity_455`. ⇒ dziura jest OSIĄGALNA i występuje w normalnej rozgrywce.

     ⚠ **Przewidywany mechanizm („kurier nie ma warpu, więc nie doleci") jest NIEPRAWDZIWY —
     a rzeczywisty jest gorszy.** Kurier ZOSTAJE wysłany: `VesselManager._missionTargetOutOfSystem`
     (`:3543-3548`, obrona w głąb D-SS5) ma jawne zwolnienie **`if (isEnemyVessel(vessel)) return false;
     // PHASE5_TODO — AI: Finding 153`** — bramka, która miałaby to zatrzymać, wskazuje więc na TEN
     finding i przepuszcza. Kurier leci subluminalnie po dystansie liczonym w DWÓCH różnych ramkach
     współrzędnych, dolatuje, po czym guard W3-4b (`VesselManager:2462-2473`) ustawia
     `dockedAt = null`. Wtedy w `_advanceRouteCourier`:
       - gałąź IDLE wymaga `status === 'idle'` → fałsz (`on_mission`)
       - gałąź LOADING wymaga `position.dockedAt === route.outpostId` → **fałsz (null)**
       - gałąź RETURNING wymaga `phase === 'returning'` → fałsz (`orbiting_body`)
     ⇒ **przelatuje przez wszystkie trzy i jest no-opem NA ZAWSZE**, zajmując przy tym swój etat
     w `route.courierIds` — więc `couriersPerRoute` raportuje się jako obsadzone i zastępca nigdy nie
     powstaje. To jest DOKŁADNIE ta klasa cichej awarii, którą W2-7 opisał i zamknął jedną gałąź wyżej
     (`EmpireLogisticsSystem:382-408`).

     ⚠ **Nie nadano nowego numeru** — to ten sam korzeń (dobór trasy bez terminu układu), tylko ze
     zmierzoną osiągalnością i poprawionym skutkiem. Naprawa wymaga DECYZJI o zakresie:
     (a) termin układu w doborze outpostów (trasy tylko in-system) albo (b) kurierzy AI zdolni do skoku
     (zmiana katalogu + paliwo warp). Nie jest to jedna linia.
     ⚠ Gate 215 pokazał też, że **153 NIE bramkuje §G.2**: stolica emp_002 ma w gy 30 `Nt 157`
     i komplet surowców łańcucha warp bez udziału kurierów cross-system.

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

---

## Finding z live-gate 186/187 (2026-08-29) — obserwacja właściciela, BEZ naprawy

Wypłynęło przy weryfikacji kanonu eksploracji i **nie należy do tamtej poprawki** — to inny
mechanizm w tym samym panelu. Zapisane jako otwarte, bez decyzji o zakresie.

| # | rzecz | status |
|---|---|---|
| **188** | **Panel detalu STRATCOM ujawnia na `rumor` to, czego drabina wywiadu nie daje na żadnym poziomie.** `_drawStratcomDetail` liczy `known = isHome || explored || isAtLeast(empireId, 'rumor')` i pod tą JEDNĄ flagą wydaje **trzy różne fakty**: prawdziwą nazwę układu (`nameKnown`, `:5542`), **żywą populację** sumowaną wprost z `ColonyManager` (`civSystem.population` — bez pośrednictwa rekordu wywiadu) oraz obecność życia z `lifeScore`. Tymczasem `IntelSystem:125-155` daje na `rumor` **zero pól**, na `contact` archetyp + **które** układy są czyje (`knownColonies`), a liczby (siła, rezerwa, zdolność załogowa) dopiero na `detailed`. ⚠ Zaobserwowane przez właściciela przy live-gate 186/187: status „Niezbadany" obok `population: 55` dla dwóch układów AI (Akhernar, Wezen). ⚠ **Identyczna wartość dla dwóch imperiów to DETERMINIZM MODELU POPULACJI, nie wyciek cudzych liczb** — ZMIERZONE w żywej grze: `emp_001` (sys_036) i `emp_002` (sys_059) mają realnie po 55 POP, a `uklad_snapshot == uklad_live` dla **wszystkich ośmiu** kolonii, bez wyjątku. Każda stolica AI startuje z `{ laborer: 4, worker: 4 }` = 8 POP (`EmpireColonyBootstrap:325`) przy archetypowo identycznych budynkach ⇒ identyczne housing ⇒ ta sama krzywa logistyczna. **Panel pokazuje więc liczby PRAWDZIWE — defektem jest to, że pokazuje je w ogóle.** ⚠ Przy okazji ZMIERZONA I ODRZUCONA druga hipoteza: panel kluczuje kolonie po ŻYWYM `EntityManager.get(planetId).systemId`, a pozostałych 26 konsumentów po snapshocie `col.systemId` — te dwa źródła **nie rozjeżdżają się** w żadnej z ośmiu kolonii, więc to NIE jest druga połowa tego findingu (gdyby kiedyś się rozjechały, byłaby to klasa lustra z 186). | ✅ **ZAMKNIĘTY 2026-08-31** (`docs/design/STRATCOM_REVEAL_PLAN.md`, decyzje D-188-1..8 = W1). ⚠ **REJESTR POLICZYŁ TRZY REWEALE, A BYŁO ICH SZEŚĆ** — i jeden z policzonych był fałszywy: nazwa w PANELU była już bramkowana poprawnie (`_systemDisplayName` pokazywał `???`), a wyciekała na MAPIE (`_stratcomVisibleSystems:5544`), czyli w innej funkcji. Nie policzono za to **tożsamości imperium** (nazwa + kolor archetypu) i **wrogości** — obu na `rumor`, w panelu I jako kolorowy pierścień gwiazdy. ZMIERZONE sondą na prawdziwej ścieżce rysującej: `Imperium: Królestwo Wezen` / `Wrogość: 72/100` / `Populacja: 55` przy statusie „Niezbadany". ⚠ **Przyczyną nie był za niski próg, tylko SUMA DWÓCH NIEZALEŻNYCH OSI**: `known` OR-owało oś MIEJSCA (`isSystemExplored`/skan) z osią WŁAŚCICIELA (drabina intelu), więc każdy z sześciu faktów wychodził przy SŁABSZYM z dwóch warunków. Naprawa = kanon `src/utils/SystemReveal.js` (rekord sześciu boolów, fail-CLOSED, zero importów) + rozprowadzenie po czterech powierzchniach (panel, etykieta 2D, jasność gwiazdy 3D, pierścień). ⚠ `IntelSystem` **nietknięty** — bo wizyta w cudzym układzie JUŻ podnosi intel do `contact` (`IntelSystem:204`), więc osie były połączone poprawnie; zepsuta była wyłącznie prezentacja. ⚠ Predykat `isEmpKnown` **usunięty, nie osierocony** (stracił konsumenta, a to nim wyciekała tożsamość). Keeper `stratcom_reveal_smoke` **71/71**, fail-first **46/25**. |
| **193** | 🔴 **`IntelSystem._tickPassiveListening` jest MARTWY od napisania — trzecia gałąź klasy Findingu 87.** `:307` iteruje `emp.colonies` i czyta `col.systemId`, a `emp.colonies` to **`string[]`** identyfikatorów (`EmpireRegistry:15,93` mówi to wprost, a `advanceIntel:130-137` robi to POPRAWNIE — bierze `colonyId` i dopiero z `ColonyManager` wyciąga `systemId`). `col.systemId` na stringu to `undefined` ⇒ `galaxy.systems.find(s => s.id === undefined)` ⇒ `undefined` ⇒ `return false` ⇒ `inRange` **zawsze false** ⇒ `_rumorAccum` nigdy nie rośnie. **ZMIERZONE wykonaniem** na realnym kształcie `['p_1','p_2']`. Skutek: zaprojektowana mechanika „8 lat w promieniu 10 ly → `rumor`" (`PASSIVE_RUMOR_LY=10`, `PASSIVE_RUMOR_YEARS=8`) **nie odpaliła ani razu w historii projektu**, więc `rumor` ma dziś realnie DWÓCH producentów: przelot sondy pierwszego kontaktu i odkrycie ciała przez obserwatorium. | 🔴 **OTWARTY.** Wypłynął przy audycie 188, **świadomie nienaprawiany tam**. ⚠ **KOLEJNOŚĆ BYŁA WIĄŻĄCA**: ożywienie nasłuchu PRZED bramką 188 zamieniłoby wyciek punktowy w **powszechny i automatyczny** (każde imperium w 10 ly, po 8 latach, bez żadnej akcji gracza). Po zamknięciu 188 ożywienie jest bezpieczne, ale to **zmiana tempa gry wywiadu z własnym pomiarem, nie higiena** — ta sama argumentacja co przy Findingu 189. |
| **194** | 🔴 **`KOSMOS.debug.dumpIntel()` nie raportuje ANI JEDNEGO imperium — instrument mierzył ciszę.** Sekcja „INTEL EMPIRE CONTACTS" wołała **dwa nieistniejące akcesory**: `reg.getAll?.()` (jest `listAll`) ⇒ `?? []` ⇒ pętla bez żadnego obrotu, oraz `intel.getEmpireContact?.()` (jest `getLevel`) ⇒ `?? '?'`. Nagłówek drukował się nad pustką, **nieodróżnialną od „nie znam żadnego imperium"**. ZMIERZONE wykonaniem. | ✅ **ZAMKNIĘTY 2026-08-31** — naprawione przy przygotowaniu live-gate'u 188 (oba akcesory + komentarz). ⚠ Znaleziony, bo gate 188 wymagał odczytu poziomu wywiadu; bez tego właściciel zobaczyłby pustą listę i nie wiedział, czy to stan gry, czy zepsuty przyrząd. **Czwarty przypadek klasy 87/193 w tym repo.** Przy okazji dodany `KOSMOS.debug.setIntel(empireId, level)` — patrz `STRATCOM_REVEAL_PLAN.md` §12. |

---

## Findingi z naprawy 86/87 (2026-08-29) — 189/191 otwarte, 190 zamknięte w tym samym commicie

Wypłynęło przy zamykaniu Findingu 86 i **nie jest jego częścią** — inny mechanizm, w innym pliku,
z własną decyzją do podjęcia. Zapisane jako otwarte.

| # | rzecz | status |
|---|---|---|
| **189** | **Każda kolonia ocenia swój niepokój prosperity KOGOŚ INNEGO.** `CivilizationSystem._updateUnrest:1104` czyta `window.KOSMOS?.prosperitySystem?.prosperity ?? 50` — czyli prosperity **AKTYWNEJ** koloni gracza — mimo że każda kolonia, włącznie z AI, ma WŁASNĄ instancję `ProsperitySystem` (`ColonyManager:497`/`:574`/`:656`; potwierdzone też przez Fazę 3 BUG 2, gdzie `switchActiveColony` przecelowuje ten wskaźnik). ⇒ kolonie AI wchodzą w niepokój wtedy, gdy kryzys ma **gracz**, a wtórne kolonie gracza nigdy nie sądzą po swoim. ⚠ Sprzężenie z 86 było ostrzejsze niż każdy z tych defektów osobno: wygaśnięcie 10-letniego licznika CUDZEJ koloni kasowało karę —30 % na koloni gracza. Po naprawie 86 to sprzężenie jest przecięte (zdarzenia nie przechodzą już między koloniami), ale **sam błędny odczyt zostaje**. ⚠ Progi: `UNREST_PROSPERITY_THRESHOLD = 15`, `UNREST_YEARS_NEEDED = 5`, `UNREST_DURATION = 10`. | 🟠 **OTWARTY, bez decyzji o zakresie.** Naprawa wygląda na jedną linię (`this.prosperitySystem` zamiast globalnego), ale **`CivilizationSystem` nie trzyma dziś referencji do swojego `ProsperitySystem`** — zależność idzie w drugą stronę (`new ProsperitySystem(res, civSys, …)`), więc trzeba rozstrzygnąć, czy wiązać wstecznie, czy rozwiązywać przez `ColonyManager`. ⚠ To jest **zmiana BALANSU**, nie tylko poprawność: dziś niepokój jest zjawiskiem globalnym (wszystkie kolonie naraz), po naprawie stanie się lokalny — liczba i rozkład kryzysów w partii się zmieni, więc należy mu się własny pomiar, a nie doklejenie do slice'u higienicznego. |
| **190** | **PĘTLA PAUZY: ten sam alert kolizyjny emitowany przy KAŻDYM przeliczeniu.** `CollisionForecast._finalizeSimulation` wyliczało `existingId` (żeby nie zdublować rekordu), po czym emitowało `observatory:collisionAlert` **bezwarunkowo** — komentarz mówił wprost „nowy lub ZAKTUALIZOWANY". Jedyny konsument (`GameScene:2638`) na każdym emicie z `isPlayerColony` robi `timeSystem.pause()`, a przeliczenie wraca co `RECALC_BY_LEVEL` = 10/8/5/3/2/1 civYears wg poziomu obserwatorium — przy Lv6 **co jeden wyświetlany miesiąc**, bez końca. ⚠ **Defekt PRE-EXISTING, ale ujawniony przez naprawę 87**: dopóki zbiór zawierał wyłącznie `homePlanet.id`, powtarzalna pauza wymagała kolizji z samą stolicą; po 87 wystarczy dowolna kolonia gracza. **ZGŁOSZONE PRZEZ WŁAŚCICIELA W LIVE-GATE 86/87** („gra pauzuje się bardzo często"). | ✅ **ZAMKNIĘTY 2026-08-29** — w tym samym commicie co 87, bo inaczej 87 **dowoziłby regresję rozgrywki razem z funkcją** (układ z W3-5b). Zamknięcie ma TRZY części i wymagało DWÓCH live-gate'ów. ⚠ **PIERWSZA PRÓBA (`if (existingId) continue;`) BYŁA NIEWYSTARCZAJĄCA, a moja diagnoza BŁĘDNA.** Live-gate #2 zgłosił, że pauzy trwają, a jedno zagrożenie „pojawia się i znika naprzemiennie”. Postawiona wtedy hipoteza „loteria próbkowania” (okno detekcji 7× węższe niż krok `SIM_STEP`) została **OBALONA POMIAREM**: powtarzalność wykrycia jest PŁASKA — **100 % w 40 przeliczeniach** dla par o horyzoncie 23, 155, 434, 452, 465, 585 i 601 lat, bo `updateMeanAnomaly` to **analityczna propagacja Keplera**, bez błędu narastającego z liczbą kroków. Wskaźnik 7× liczył prędkość ORBITALNĄ, a znaczenie ma WZGLĘDNA prędkość pary na kursie kolizyjnym. ⚠ **PRAWDZIWA PRZYCZYNA: zakres czyszczenia.** `oldAlertIds = new Set(this._alerts.keys())` brało **wszystkie** alerty, a skan jest kluczowany na `activeSystemId` (**Finding 191**) ⇒ każde spojrzenie na inny układ kasowało alerty poprzedniego, a powrót tworzył je od nowa z **nowym id**, więc dedup nie miał czego rozpoznać. ZMIERZONE: trzy skany pod rząd w jednym układzie = **0 skasowanych, 0 powtórnych emisji**; jedno przełączenie tam i z powrotem = **+15 skasowanych i +15 alarmów**. **(a)** dedup `if (existingId) continue;` — zostaje, jest poprawny; **(b)** czyszczenie zawężone do przeskanowanego układu (`alert.systemId`, backfill przy `restore` dla starych zapisów, **v101 bez migracji**); **(c)** ZMIANA PROJEKTU (decyzja właściciela): **twarda pauza usunięta**, meldunek idzie `NotificationCenter` (dzwonek + Dziennik, bez pauzy) — tam, gdzie od dawna są SIOSTRZANE zdarzenia obserwatorium (`observatory:discovered`, `observatory:vesselScanComplete`) — a jedyną reakcją czasową jest **auto-slow dla zagrożeń bliższych niż `COLLISION_AUTOSLOW_YEARS = 50`**. ⚠ **Próg NIE jest nową magiczną liczbą i NIE opiera się na wiarygodności detekcji** (ta jest płaska): to `HORIZON_BY_LEVEL[1]`, zasięg najprostszego obserwatorium; druga, niezależna derywacja daje tę samą liczbę (przy 50 latach `MARGIN_PERCENT` schodzi do ±5 lat). Budżet przerwań ZMIERZONY: **~7 %** zagrożeń (rozkład w 2 układach: 0-25 lat 7 %, 50-100 7 %, 100-200 20 %, 200-350 20 %, 350+ **47 %**). Keepery T7/T8/T9, fail-first: T7 **1 → 2** emisje, T8 **3 SEDNO** padają (powrót do układu: 3 → 5 emisji). ✅ **RE-GATE 2026-08-29 PASS** (właściciel, na żywo): krok 1 — to samo zagrożenie melduje się RAZ, bez pauzy; krok 2 — **przełączenie widoku na inny układ i powrót nie tworzy nowego alarmu** (to jest dokładnie ten krok, który wcześniej generował lawinę). ⚠ **GRANICA DOWODU:** krok 3 (auto-slow poniżej 50 lat) **nie został sprowokowany w przeglądarce** — trudno wywołać zagrożenie <50 lat na żądanie. Pinuje go wyłącznie keeper T9, i to **derywacją** (`COLLISION_AUTOSLOW_YEARS === HORIZON_BY_LEVEL[1]`) plus wykonaniem ścieżki dzwonka. **Nie nazywać tej gałęzi w pełni zweryfikowaną** — świadomie przyjęta luka, decyzja właściciela. |
| **191** | **Prognoza kolizji jest kluczowana na KAMERZE, a włącza ją obserwatorium z DOWOLNEGO układu.** `CollisionForecast._startSimulation:94` skanuje `window.KOSMOS?.activeSystemId`, a bramka w `_tick:73` pyta `ObservatorySystem.getMaxObservatoryLevel()`, które (`:117-131`) iteruje **wszystkie kolonie gracza bez terminu układu** i bierze maksimum. ⇒ obserwatorium zbudowane w układzie A daje prognozę kolizji w układzie B — wystarczy tam **patrzeć**. Horyzont i częstotliwość też idą z tego globalnego maksimum. ⚠ Hipotezę postawił właściciel w live-gate 86/87 („obserwatorium działa, jakby wykrywało zagrożenia we wszystkich systemach"); pomiar **potwierdził rodzinę, ale skorygował kształt**: to nie jest zbieranie z całej galaktyki, tylko **klucz na kamerze + globalne włączenie**. | 🟠 **OTWARTY, bez decyzji o zakresie.** Rodzina „brak granicy systemu" (F-D, 138/142, starcie jednoukładowe), ale kierunek naprawy jest tu **PROJEKTOWY, nie techniczny**: czy obserwatorium widzi swój układ (wtedy prognoza znika, gdy patrzysz gdzie indziej — i trzeba rozstrzygnąć, co z alertami dla układów, w których gracz ma kolonię, ale nie patrzy), czy zasięg jest funkcją poziomu i odległości (wzór `STRATCOM_LY_BY_LEVEL`). ⚠ **SPROSTOWANIE 2026-08-29 (wpis pierwotnie mówił „NIE łączyć z 190” — to było błędne): 191 jest WARUNKIEM KONIECZNYM 190**, ta sama relacja co `130 + Z2`. Dopóki skan jest kluczowany na kamerze, a mapa alertów jest wspólna dla gry, tożsamość alertu ginie przy każdej zmianie widoku — i to właśnie utrzymywało pętlę pauz. 190 domknięto zawężeniem CZYSZCZENIA do przeskanowanego układu (bug fix), co **nie przesądza** pytania z 191: czy obserwatorium ma w ogóle widzieć obce układy. To pytanie zostaje otwarte i projektowe. ✅ **POTWIERDZONY NA ŻYWO 2026-08-29** (właściciel, przy re-gate 190): **jedno** obserwatorium, a alerty przychodzą z **dwóch układów** — dokładnie tak, jak opisuje ten wpis. ⚠ To podnosi status z **pomiaru w źródle** na **obserwację w rozgrywce**: defekt jest widoczny dla gracza bez żadnych narzędzi deweloperskich, więc przy priorytetyzacji nie jest to już „teoretyczna niespójność”. |
| **192** | **Prognoza kolizji propaguje STAŁE elementy orbitalne, a świat gry ma perturbacje.** `CollisionForecast` robi snapshot `{a, e, T, M, omega}` i propaguje analitycznie (`KeplerMath.updateMeanAnomaly`) aż do horyzontu **700 lat** (Lv6) — model **zamrożonych** elementów. Tymczasem w scenariuszu „Cywilizacja” perturbacje **działają** (pominięte są wyłącznie w `power_test` — sprostowanie Etapu 28 w `CLAUDE.md`), więc rzeczywiste elementy dryfują, a prognoza tego nie widzi. Zadeklarowany margines to sztywne `MARGIN_PERCENT = 10` **niezależnie od horyzontu**, więc alert na 600 lat obiecuje ±60 lat, choć nie ma podstaw, by twierdzić cokolwiek o tak odległym stanie układu. ⚠ **Zmierzony rozkład pokazuje, że to nie jest przypadek brzegowy: 47 % zagrożeń leży 350+ lat w przyszłość**, a 2/3 powyżej 200 lat. ⚠ Wpis powstał **zamiast** wcześniejszej hipotezy „niepowtarzalność detekcji” — ta została **obalona pomiarem** (100 % powtarzalności w 40 przeliczeniach, patrz 190). Temat jest odwrotny: detekcja jest stabilna, ale **model może nie opisywać świata** tak daleko. | 🟠 **OTWARTY, wymaga własnego pomiaru.** Pierwszy krok to porównanie: propaguj elementy analitycznie i RÓWNOLEGLE puść świat przez `PhysicsSystem`/`GravitySystem` na 100/300/600 lat, po czym zmierz rozjazd. Dopiero to powie, czy horyzont 700 lat ma sens, czy `HORIZON_BY_LEVEL` należy przyciąć, czy margines powinien rosnąć nieliniowo z czasem. ⚠ **NIE dotykać `MARGIN_PERCENT` bez tego pomiaru** — dziś jest to liczba deklaratywna, a nie wyprowadzona. ⚠ Niezależne od 190/191: dotyczy TREŚCI prognozy, nie jej cyklu życia ani zasięgu. |

---

## Findingi z audytu Z2 „AI wraca po ataku" (2026-08-31) — 195 otwarty, 196-198 obserwacje

Rejestr macierzysty slice'u: `docs/design/AI_RECALL_PLAN.md`. Wpisy powstały przy audycie, który
zamknął **GATE B2 / Z2** (wiersz zdjęty z `OPEN_FINDINGS_INDEX.md`).

| # | rzecz | status |
|---|---|---|
| **195** | 🔴 **`VesselManager._onColonyDestroyed` przepisuje `vessel.colonyId` BEZ TERMINU WŁAŚCICIELA — także statkom AI.** Pętla `:1136` iteruje **wszystkie** statki w rejestrze, a port zastępczy pochodzi z `_resolvePlayerHomePort(planetId)`, czyli z KOLONII GRACZA (utwardzone w AC-8 właśnie po to, żeby statek gracza nie trafił w ręce wroga). Statek AI, który leci do ciała ginącego w międzyczasie (`mission.targetId === planetId`, `in_transit`/`orbiting`), dostaje `colonyId = dom GRACZA` **i wymuszony powrót tam** (`startReturn({ force: true })`, `:1150`) — z pominięciem bramki paliwa. Druga gałąź (`:1157`, `phase === 'returning'`) robi to samo. ⚠ Rodzina **Findingu 97** (`_resolvePayHomeId` bez terminu własności) i dokładnie ten sam kształt: helper zna JEDNĄ własność i stosuje ją do wszystkich. | 🟠 **OTWARTY.** Osiągalność **NIEZMIERZONA** — wymaga śmierci ciała w trakcie lotu rajdera (kolizja, `entity:removed`, desant), ale ścieżka w źródle jest **bezwarunkowa**. ⚠ Ten slice go NIE naprawia, tylko **omija**: `OrderService.issueRecall` świadomie NIE czyta `vessel.colonyId`, bo domem AI jest `directorProduction.capitalOf` (kanon Directora) — patrz `AI_RECALL_PLAN.md` §5.1. Naprawa = termin właściciela w pętli (`isEnemyVessel` ⇒ pomiń albo szukaj portu WŁASNEGO imperium), z decyzją, co robić ze statkiem AI, którego imperium nie ma już żadnej koloni. |
| **196** | 🟠 **`no_idle_hull` (VO-3b, D-VO1b-5) jest w ścieżce REGUŁY praktycznie nieosiągalny.** `strike_player_target` ma guard `empireHasStrikeForce` = `strikeReadyVessels().length > 0`, a `DirectorSystem._evaluate` sprawdza guardy PRZED rzutem i przed akcją. Gdy pula jest pusta, reguła **milczy** — `launchStrike` w ogóle nie biegnie, więc `director:strikeRefused` nie leci. Powód żyje wyłącznie w wywołaniu WPROST (`KOSMOS.debug.forceStrike`) i w `strikeReport`. | ⚪ **NIE JEST DEFEKTEM — jest ostrzeżeniem metodycznym.** Guard istnieje po to, żeby odmowa nie **paliła cooldownu** (`_evaluate` stempluje `lastFiredYear` PRZED uruchomieniem akcji, `DirectorSystem:238`), więc jego zdjęcie byłoby zmianą balansu. ⚠ Konsekwencja wiążąca dla KAŻDEGO przyszłego gate'u: **„dlaczego ofensywa AI stoi" NIE DA SIĘ odczytać z `director:strikeRefused`** — trzeba `KOSMOS.debug.strikeReport` (werdykt) i `directorRules` (czy `attempts` rośnie). Inaczej gate mierzy ciszę. |
| **197** | 🟠 **`war:peaceSigned` (`WarSystem.js:447`) ma ZERO konsumentów poza `DebugLog`.** Żaden system nie reaguje na zawarcie pokoju: floty nie wracają, rozkazy nie są anulowane, okręty nie zmieniają postawy. Do Z2 objawiało się to najdotkliwiej jako **trwała okupacja orbity gracza przeżywająca pokój** (rajder dalej blokował pulę hubu i dalej wchodził w starcia — `DSCS.handleCombatRangeEnter` nie ma bramki wojny). | 🟠 **OTWARTY, ale ZŁAGODZONY.** Z2 zamyka JEDYNY dzisiejszy skutek — i to **nie przez pokój**, tylko przy okazji: reguła `recall_strike_force` świadomie NIE MA guardu wojny (D-Z2-8), więc zamiata także w pokoju. Pytanie „jak flota AI ma reagować na pokój" zostaje otwarte i należy do **W4** (stół pokojowy). |
| **199** | 🔴 **AI wybiera cel PATRZĄC NA CIAŁO, a bije się z CAŁYM UKŁADEM — i dlatego systematycznie atakuje to, czego nie zdoła zdobyć.** `DirectorOffensive.isDefended:` budynki obronne czyta **z koloni CELU** (`target.colony.buildingSystem._active`), a okręty gracza — z całego **układu** (`v.systemId !== target.systemId → continue`) i tylko uzbrojone (`hasWeapons`). Tymczasem obrońcę buduje `WarSystem._buildPlayerBattleUnit(systemId)`, które sumuje `defense_tower`/`defense_grid` ze **WSZYSTKICH** kolonii gracza w układzie (`_playerColoniesInSystem:584`) i **WSZYSTKIE** statki gracza w układzie, **bez filtra uzbrojenia** (`_playerVesselsInSystem:575`). ⇒ kolonia bez własnej obrony jest dla AI „bezbronna", a w bitwie broni jej siatka obronna **stolicy**. ⚠ To nie jest przypadek: `pickTarget` sortuje `wartość desc, potem SŁABIEJ BRONIONY`, więc przy równej wartości AI **preferuje** ciało, które tylko wygląda na nieosłonięte. ⚠ To jest ta sama klasa porażki, którą W3-5 §Findings 34 miał zamknąć („AI oddało graczowi dwa darmowe zwycięstwa i 7,2 własnego wyczerpania") — mechanizm inny, skutek ten sam. | ✅ **ZAMKNIĘTY 2026-08-31** — slice **DEFENSE_SCOPE**, commity `792a034` / `b2e94ef` / `6e48460`, **live-gate §7 PASS** (`DEFENSE_SCOPE_PLAN.md` §10a). Naprawa rozpadła się na DWIE niezależne osie, i to jest główny wynik audytu: **kompetencja** (eskadra gradowana do siły, którą bitwa naprawdę wystawi, **bez clampa** — `needed > MAX_STRIKE_SIZE` ⇒ własny powód `target_beyond_reach`) oraz **zakres** (wariant **V4**: budynki obronne bronią SWOJEGO ciała, okręty dalej całego układu). ⚠ Pomiar OBALIŁ ramę zlecenia: ani zwężenie bitwy, ani poszerzenie celowania nie usuwały porażki — V1 oddawał kolonie wtórne (AI 10-0, wyczerpanie gracza 90/100 lat), V2 przy puli 1 dawał pełny paraliż (0 uderzeń, 19,8 odmów) i **nie powstrzymywał samobójstwa**, tylko przekierowywał je na stolicę. ⚠ V4 ROZPUŚCIŁ dwie podpisane decyzje (D-199-3, D-199-4) i dwa findingi (**203**, **206**). ⚠ Zamknięcie ODSŁONIŁO **Finding 210** (drabina ocenia tylko głowę rankingu) — lustro tego samego defektu, niewidoczne, dopóki wszystkie ciała gradowały się identycznie. Keeper `defense_scope_smoke` **50/50**. Plan: `DEFENSE_SCOPE_PLAN.md` |
| **200** | 🟠 **Bezbronny statek gracza jest w bitwie ORBITALNEJ pełnoprawnym kombatantem — i dostaje broń w prezencie.** `BattleSystem.playerVesselsToBattleUnit:262` kończy się `weapons: weapons.length > 0 ? weapons : [{ damage: 2, tracking: 0.7 }]` — frachtowiec bez modułu uzbrojenia wnosi więc nie tylko HP kadłuba, ale i **stałą broń dmg 2**. Do tego `WarSystem._playerVesselsInSystem:575` nie ma filtra `hasWeapons`, więc do jednostki obrońcy wchodzi **każdy** statek gracza w układzie. ⚠ **Ścieżki walki są w tej sprawie NIEZGODNE:** `DeepSpaceCombatSystem.startEngagement` dostał w `36d9551` bramkę „anyArmed" i **odmawia** starcia, gdy żadna strona nie ma broni; ścieżka orbitalna (`EnemyAttackHandler` → `_buildPlayerBattleUnit`) tej bramki nie ma i **uzbraja** bezbronnego. | ✅ **ZAMKNIĘTY 2026-08-31** — commit 1/3 slice’u **DEFENSE_SCOPE** (`docs/design/DEFENSE_SCOPE_PLAN.md`, D-199-6 = **6a + 6b**; `792a034`). Keeper `defense_scope_smoke` **19/19**, fail-first **10/9**. ⚠ **ZAKRES NAPRAWY OKAZAŁ SIĘ SZERSZY, NIŻ OPISYWAł TEN WPIS — i to jest jego najważniejsza treść.** Sprawdzenie właściciela przed implementacją („czy `resolveBattle` kończy się czysto przy `weapons: []`?") wykryło **DRUGI fallback**: `BattleSystem.normalizeFleet` podstawia `{damage:5}` za każdą pustą listę, więc zdjęcie samego fallbacku `dmg 2` to **BUFF 2→5**, a nie rozbrojenie. ZMIERZONE (obrażenia zadane przez bezbronnego handlowca, 6 ziaren): pancerz 0: **34→85** · 2: **20→71** · 5: **17→51** · 10: 17→17 (próg `max(1, dmg - armor*0.4)` zrównuje oba fallbacki). ⇒ naprawa = **oba naraz**. `normalizeFleet` rozróżnia teraz DEKLARACJĘ od BRAKU DANYCH: `weapons: []` = bezbronny (honorujemy), brak pola = dane niepełne (zostaje domyślny laser). ⚠ **Skutek po stronie AI jest SYMETRYCZNY i zamierzony** — `EnemyAttackHandler:144` agreguje wrogów tym samym helperem. ⚠ **KOREKTA DO PRZESŁANKI „NIE robić bez 199"**: powodem nie jest „zerowy skutek", tylko to, że **jednowarstwowa naprawa działa w złą stronę**; po zdjęciu OBU fallbacków zmiana jest samodzielna i wyszła jako commit 1, **przed** 199. ⚠ `hasWeapons` w `_playerVesselsInSystem` świadomie **NIE** wszedł (usuwa HP bezbronnych kadłubów = zmiana balansu, nie higiena) — i wbrew mojej pierwotnej ostrożności **nie** złamałby `deploy_seams` T5 ani `w2_deploy_model` T3a (oba używają kadłubów UZBROJONYCH). Pierwotny opis defektu — poniżej, bez zmian. ⚠ Domknięcie: Zmierzone przy 199 (handlowiec: `{hp:30, weapons:[{damage:2}]}`). Sam w sobie mało dotkliwy — 2 dmg to szum przy kadłubach 120-350 — ale **razem z 199 tworzy „obronę znikąd"**: gracz bez ani jednego okrętu wojennego i bez obrony NA TYM CIELE i tak wystawia uzbrojoną jednostkę. ⚠ Naprawa jest tania (`hasWeapons` w `_playerVesselsInSystem` albo zdjęcie fallbacku), ale **NIE robić jej bez 199** — samo odebranie handlowcowi dmg 2 nie zmieni wyniku zmierzonej bitwy (zabiło ją dmg 20 ze stolicy), więc byłaby to naprawa objawu z zerowym skutkiem i fałszywym poczuciem domknięcia. ⚠ Fallback `damage: 2` ma też DRUGIEGO konsumenta — `enemyUnit` w `EnemyAttackHandler` — więc zdjęcie go rozbraja także bezbronne statki AI. |
| **209** | ⚪ **Dwa komentarze źródłowe opisywały flotę, której nie dało się zbudować.** `WarSystem:597` i `EnemyAttackHandler:120` nazywały obrońcę-widmo *„sto punktów wytrzymałości i ZERO broni"* (`{hp:100, weapons:[]}`), a `BattleSystem.normalizeFleet` podstawiał mu **laser dmg 5** za każdą pustą listę — widmo strzelało. ZMIERZONE: 129 obrażeń na 6 ziaren. Klasa **„predykat opisany w komentarzu ≠ predykat egzekwowany"** (arc BRAMKA WŁASNOŚCI, reguła 3). | ✅ **ZAMKNIĘTY 2026-08-31** — ten sam commit co **200** (commit 1/3 slice’u DEFENSE_SCOPE; `792a034`). Po naprawie widmo zadaje **0**. Pin: `defense_scope_smoke` **T7** — dwuwarstwowy (kształt jednostki **oraz** to, co widzi `resolveBattle`), bo warstwa pierwsza przechodziła **już przed naprawą** i sama nigdy by drugiego fallbacku nie zobaczyła. |
| **210** | 🔴 **Drabina odmów ocenia WYŁĄCZNIE GŁOWĘ rankingu wartości — więc AI nie zaatakuje nawet tego, co MOŻE wziąć.** `DirectorOffensive.launchStrike` woła `pickTarget`, bierze **jeden** cel (najwyższa `targetValue`, przy remisie najniższy `needed`) i na nim kończy: jeśli ten jeden wypadnie `target_beyond_reach`, akcja odmawia **bez fall-through** do pierwszego celu OSIĄGALNEGO. ⚠ Sortowanie po gradowanym `needed` z D-199-5 rozstrzyga **tylko remisy wartości**, a `targetValue` = `getSystemDevScore` jest **per UKŁAD** (Finding 202), więc **wartość cross-system DOMINUJE nad kosztem zdobycia**. ⇒ imperium jest trwale bierne, ilekroć jego najbogatszy osiągalny układ jest twierdzą — mimo koloni do wzięcia gdzie indziej. ⚠ **Lustro Findingu 199**: tam AI atakowało to, czego nie zdoła zdobyć; tu **nie atakuje tego, co zdobyć może**. | ✅ **ZAMKNIĘTY 2026-08-31** — slice **TARGET_FALLTHROUGH**, commit **`1e633d4`**, **live-gate §8 PASS** (`TARGET_FALLTHROUGH_PLAN.md` §8a). **Odczyt rozstrzygający:** ta sama komenda, która przed naprawą zwracała `{launched: 0, target_beyond_reach, needed: 9}`, zwróciła `{launched: 1, targetBodyId: entity_283, needed: 1, skippedHead: {entity_11, sys_home, needed: 9, defenderHp: 690}}`. **D-210-1 = wariant A** (fall-through w ISTNIEJĄCYM porządku wartości) — rozstrzygnięte POMIAREM: re-sort po koszcie dawał AI bijące **zawsze** w najsłabsze ciało (Alioth przy puli 1, 2 i 3), czyli tę samą przewidywalność, którą D-199-1 wyrzuciło z booleana; A **eskaluje cel wraz z siłą**. ⚠ Żaden wariant nie wskrzesił pompy wyczerpania z **34** (kadłuby AI 0, przegrane 0). ⚠ **Zakres defektu okazał się WĘŻSZY**: commit 2 DEFENSE_SCOPE mityguje 210 wewnątrz układu, więc 210 bije **wyłącznie cross-system** — dlatego fixture keepera jest DWUUKŁADOWY. ⚠ **Trzy stany terminalne drabiny** (poprawka właściciela), z (c) które **NIE MILCZY**: liczby z GŁOWY, klasyfikacja z CAŁEJ LISTY. Zmierzone na gate'cie: `insufficient_squadron, needed: 9, attemptedTargets: 6` — powód **przejściowy**, bo jeden cel mieścił się w sufcie. ⚠ **PĘTLA ROZGRYWKI ZAOBSERWOWANA END-TO-END**: AI wzięło zdobywalną kolonię ×2 → gracz ufortyfikował → kolejny rajder przegrał i zginął w odwrocie → tabela gradowała to ciało na `needed 2`, więc AI **odmówi zamiast powtórzyć błąd**. **199 + 210 działają razem.** Keeper `defense_scope_smoke` **69/69** (T19-T23). ⚠ **Domyka się BEZ 202, ale czyni 202 wiążącym** (D-210-6 → następna dystorsja). |
| **212** | ⚪ **Fallback wideo w `ScheduledEventPopup._loadVideo:378` nie CACHUJE porażki — przy nieosiągalnym serwerze każde zaplanowane zdarzenie ponawia pełny łańcuch `fetch(HEAD)`.** Zgłoszone z live-gate'u 210 jako `alert.mp4` → `default.mp4`, oba `ERR_CONNECTION_REFUSED`, powtarzalnie. | ⚪ **ZWERYFIKOWANE — HIPOTEZA „brak plików” OBALONA.** `assets/event-videos/` zawiera **21 plików**, w tym `alert.mp4` **i** `default.mp4` ⇒ to **NIE** jest brak zasobu. `ERR_CONNECTION_REFUSED` powstaje na warstwie sieci (Live Server nieosiągalny / zrestartowany w trakcie sesji), więc **trigger jest ŚRODOWISKOWY**, a sam łańcuch działa zgodnie z projektem: `.catch(() => tryNext())` degraduje poprawnie, aż do `video.style.display = 'none'`. ⚠ Realna (i jedyna) obserwacja: **brak negatywnego cache'u** — przy trwale nieosiągalnym serwerze koszt to 2 nieudane `fetch` na każde zdarzenie, a błąd sieciowy wypisuje **przeglądarka**, więc `catch` go nie wycisza. Naprawa = zapamiętać nieudany host/src na sesję. ⚠ **Nie mylić z rodziną 155/157/162** — to nie jest defekt narracji ani stanu gry. ⚠ **ANEKS 2026-09-01 (obserwacja właściciela, dwie sesje):** obok awarii środowiskowej istnieją **REALNE 404** na dwóch konkretnych plikach — **`xenobiology_find.mp4`** i **`population_milestone.mp4`** — czyli INNYCH niż trzy zweryfikowane wyżej. ⚠ **ANEKS 2 (live-gate 217, 2026-09-01): kolejne dwa** — **`volunteer_expedition.mp4`** i **`veteran_engineer_retires.mp4`**. ⇒ realnych 404 jest już **cztery**, na czterech różnych plikach, więc „niekompletny katalog" przestaje być hipotezą i staje się obserwacją powtarzalną: pytaniem audytu jest, **czym jest lista, z której planista zdarzeń dobiera nazwy** i dlaczego rozjeżdża się z zawartością `assets/event-videos/`. ⇒ katalog `assets/event-videos/` jest **niepełny względem tego, co planista zdarzeń potrafi wywołać**, a to jest przyczyna ROZŁĄCZNA z `ERR_CONNECTION_REFUSED`. ⚠ Zapisane **na obserwacji właściciela** — nie zweryfikowane przeze mnie (karta zamknięta). Naprawa składa się więc z DWÓCH części: negatywny cache (środowisko) **i** audyt kompletności katalogu wobec listy zdarzeń (zasoby).  ⚠ **ANEKS 2026-09-01 (obserwacja wlasciciela):** `scout_report.mp4` to **piaty** realny 404 obok `volunteer_expedition.mp4` i `veteran_engineer_retires.mp4` — czyli luka katalogu jest **systematyczna, nie pojedyncza**. To wzmacnia druga polowe naprawy (audyt kompletnosci katalogu wobec listy zdarzen), nie pierwsza (negatywny cache). |
| **213** | ⚪ **`TEMPLATE_ROLES` zna rolę `'courier'`, ale ŻADEN szablon jej nie ma.** Kurierzy powstają przez `startShipBuild(capital, 'hull_small', modules)` wprost (`EmpireLogisticsSystem:284`), z pominięciem katalogu szablonów. Martwa wartość enuma. | ⚪ **OTWARTY, kosmetyka** — ale istotna, bo rozróżnienie kurier↔okręt wojenny w gate'cie 208 się o nią opiera: dopóki roli nie ma, jedynym pewnym znacznikiem jest `directorOrigin` + `hasWeapons`. |
| **214** | 🟠 **Sygnał popytu na RUDĘ wpada w kanał, który nie może go zaspokoić.** `DirectorProduction._feedCommodityDemand:303` przepuszcza `Fe` — guard `!isKnownCommodity(id) && !getSafetyStockTarget(id)` **nie odcina**, bo `getSafetyStockTarget('Fe')` = **1** — i woła `factorySystem.setDemandBonus('Fe', …)`. Ale **`FactorySystem` nie produkuje rud**: żelazo daje kopalnia i kurier. Sprzężenie ekonomiczne, które miało „wepchnąć brakujące komodyty w priorytety produkcji”, dla surowca **wygląda na działające i nie robi nic**. | 🟠 **OTWARTY.** ZMIERZONE wykonaniem (`isKnownCommodity('Fe')` = `undefined`, `getSafetyStockTarget('Fe')` = 1). Rodzina **180** („brak procesu”), ale tu proces nie istnieje **z definicji**. ⚠ Skutek uboczny dla planowania: nie ma ŻADNEGO kanału popytu na rudy, więc wariant „ładuj proporcjonalnie do popytu” nie ma z czego czytać poza `pendingShipOrders[].cost`. |
| **215** | 🔴 **PRÓG `freePops` JEST DLA AI NIEOSIĄGALNY Z KONSTRUKCJI — a Population 2.0 Faza 2 usunęła dokładnie takie bramki i TE DWIE przeoczyła.** `freePops = population − (employedPops − syntheticJobs) − lockedPops`, przy czym `_employedPops` liczy **ETATY zarejestrowane przez budynki, NIE pracowników** (`GameScene:537-542` opisuje to wprost). `ColonyAutoExpander` stawia u AI **więcej etatów niż jest POPów**, więc `freePops` klamruje się do **0 na stałe** — dosypanie ludności nic nie daje, bo ekspander natychmiast dostawia etaty. `CivilizationSystem:384` mówi to samo od strony projektu: *„przy projektowanej równowadze AI `freePops ≈ 0`, więc NIE bramkujemy na `freePops`”* — i FIX A z Fazy 2 zdjął gate'y POP z budowy budynków. **Sweep nie objął ścieżki AI.** Żywe pozostały DWIE bramki: `EmpireLogisticsSystem._enoughFreePops` (próg **0,05**) ⇒ **kurier NIGDY nie jest zamawiany**, oraz `EmpireStrategySystem:432` `freePops < cfg.minFreePops` (próg **8**) ⇒ **pełna kolonia AI nie powstaje NIGDY**. Ścieżka PLACÓWKI nie jest bramkowana `freePops` — i dlatego placówki istnieją, a kolonie i kurierzy nie. | ✅ **ZAMKNIĘTY 2026-09-01 — GATE PASS** (§G.1 PASS · §G.2 **PASS-PENDING na NAZWANEJ blokadzie zewnętrznej** = Finding **217** · §G.3 OK · §G.4 PASS kill-switch bez przeładowania). Obie połówki 215 **działają na żywo**: kolonie 1→4 (emp_002) i kurierzy realnie wożą (**Nt 0 → 157** w stolicy). Żadna z pozostałych blokad §G.2 nie leży w 215. Poprzednio: — slice 215, C1 `ade36d8` (predykaty: kolonia ZASTĄPIONA `laborer >= popTransferSize + 4`, kurier USUNIĘTY) + C2 `2b27e4f` (`popTransferSize` 8→4). Flaga `FEATURES.aiPopGates`. Keeper `ai_pop_gates_smoke` 22/22. SKUTEK ZMIERZONY: `shipBuildRequested` 0→6, `_loadByRarity` 0→14, dostarczono 0→8, kolonie 3→4. Plan+gate: `AI_POP_GATES_PLAN.md`. ZMIERZONE (diagnoza) (boot skalibrowany `civilization_boosted` + `aiEmpires` + przypięta galaktyka, 35 gy, 2 imperia): `freePops` = **5,00 w gy 0 → 0,00 od gy ~6 i już zawsze**; `logistics:shipBuildRequested` = **0**; `stats.built/dispatched/delivered` = **0/0/0**; trasy **istnieją** (2 i 1) z `courierIds = []`; imperium ma **ZERO statków** w gy 35. **Kontrola:** przebieg BEZ moich zamówień wojennych daje identyczny wynik ⇒ to nie jest artefakt pomiaru, a `_shipyardSlotFree` (czyta `shipQueues`, nie `pendingShipOrders`) był `true` przez cały czas. **PEŁNY ŁAŃCUCH SKUTKU:** brak kuriera ⇒ brak **Nt** w stolicy ⇒ `quantum_cores` i `antimatter_cells` **oba** stoją na „Nt 0/4” ⇒ `warp_cores` 0/2 ⇒ fregata (`engine_warp`) nie ma za co powstać ⇒ **13 wygaśnięć zleceń, ZERO okrętów w 35 gy** = **Finding 208**. ⚠ `isRecipeAvailable` = **true** i tryb `reactive` dla całego łańcucha — `FactorySystem` działa poprawnie, po prostu nie ma z czego. ⇒ **208 i 178 mają JEDNĄ przyczynę i nie są to ani komodyty, ani kolejność ładowania.** Plan: `COURIER_LOAD_ORDER_PLAN.md` |
| **216** | 🟠 **Kolonie AI są NIEMAL STATYCZNE — zakładają się i nie rosną.** ZMIERZONE (krzywa `popTransferSize`, 3 seedy × 100 gy, rezerwa 4): **mediana populacji koloni w gy 100 równa się populacji ZAŁOŻYCIELSKIEJ** (transfer 2 → mediana 2, transfer 4 → mediana 4), a liczba kolonii, które **urosły** ponad `startPop + 1`, wynosi **0,0-0,7 na 100 gy** i jest **płaska we wszystkich czterech rozmiarach transferu**. ⇒ AI zakłada kolonie, które istnieją i nie robią nic. | 🟠 **OTWARTY — ale MECHANIZM POTWIERDZONY PO STRONIE WODY (gate 215, gy 30, na żywo).** ZMIERZONE (`resourceSystem.getPerYear`): **wszystkie trzy** kolonie założone przez emp_002 mają `water 0` przy stawce netto **dokładnie −1,5/civY** — czyli `4 POP × POP_CONSUMPTION.water (0,375)` **co do cyfry**, co znaczy **ZEROWĄ produkcję wody**. Przyczyna w źródle: `_executeFullColony` woła `bootstrapColony` **bez `startBuildings`**, więc każda kolonia AI rodzi się z domyślnym zestawem `[colony_base, solar_farm, solar_farm, mine]` (`EmpireColonyBootstrap.js:327-329`) — **bez farmy i bez studni**. Startowe 200 wody ÷ 1,5 = **133 civY = 11,1 lat wyświetlanych** i kolonia siada. Żywność kolonie zdobywają PÓŹNIEJ (auto-ekspander stawia farmy: 186 −0,10 · 187 +0,65 · 188 +0,02), **studni nie stawia nigdy** — ta sama okolica co pre-existing FAIL `colony-auto-expander` „well/waterless". ⚠ **Ta sama arytmetyka trafia w STOLICĘ, tylko z drugiej strony:** 2 farmy × 10 i 2 studnie × 6 dają próg opłacalności **dokładnie 32 POP dla OBU zasobów** — a 32 to co do jednostki startowy housing (colony_base 16 + habitat 12 + launch_pad 4). ⇒ stolica AI jest z projektu zbilansowana na własny cap, a po jego przekroczeniu ma **strukturalnie zerową nadwyżkę** i bezterminowo nie przechodzi `_canAffordFullColony` (wymaga 200 food I 200 water NARAZ). ⚠ **KOREKTA POMIARU (wiążąca dla przyszłych odczytów):** stawki −20,8 food / −13,5 water w stolicy **NIE dowodzą drenu recepturowego**. `getPerYear` czyta wyłącznie `_inventoryPerYear`, budowane przez `_recalcPerYear` z **zarejestrowanych producentów**; pobór składników przez `FactorySystem._consumeIngredients` to bezpośredni zapis do inventory i **jest dla tej metody niewidoczny**. Zmierzone stawki są spójne z samą konsumpcją POP przy **~65-68 mieszkańcach** (40,8/0,625 ≈ 65 · 25,5/0,375 ≈ 68) — czyli z populacją dwukrotnie ponad progiem 32. Dren recepturowy jest REALNY (**Finding 220**), ale **dodatkowy i wciąż niezmierzony**. ⚠ Pierwotna hipoteza „ta sama równowaga etatów" pozostaje **niesprawdzona po stronie ŻYWNOŚCI i samego wzrostu**. Poprzednio: ⚠ **HIPOTEZA DO AUDYTU, NIE DIAGNOZA** (lekcja tego arca — trzy kolejne ramy 178/208 obalone pomiarem): może to być **ta sama równowaga etatów/`freePops`, tylko oglądana OD ŚRODKA młodej koloni** — `ColonyAutoExpander` rejestruje etaty, a wzrost może być bramkowany na czymś, czego AI nigdy nie buduje (housing? satysfakcja? survival needs?). **Nie sprawdzone.** Audyt ma zacząć od pytania „**co się nie wykonuje**”, nie „czego brakuje”. ⚠ **NIE bramkowało D-215-1c**: `grew` jest płaskie we wszystkich wariantach, więc nie mogło zmienić rankingu; `4` wygrywa z `8` na każdej mierzonej osi. ⚠ Konsekwencja dla gate'u §G.1: **pierwsza pełna kolonia AI będzie istnieć i niewiele robić** — obserwablem jest ZAŁOŻENIE, wzrost należy do 216. `AI_POP_GATES_PLAN.md` §2.2 |
| **217** | 🔴 **FABRYKA AI NIGDY NIE ALOKUJE ŁAŃCUCHA WARP — bo `_demandBonus` ma DWÓCH pisarzy, a ten absolutny zeruje to, co dopisał Director.** Zmierzone na żywo (GATE-215-gy30, `entity_185`): tryb `reactive`, produkcja ON, **FP 25 (użyte 0, wolne 25)**, komplet surowców łańcucha w magazynie (Si 18580 · Nt 214 · Hv 6002 · Xe 4831 · Ti 8174 · Li 589), `isRecipeAvailable` i `_colonyCanSustainRecipe` **true** dla wszystkich trzech ogniw, `director:commodityDemand` z `warp_cores` **11×** — i **ANI JEDNEJ alokacji** na `warp_cores`/`quantum_cores`/`antimatter_cells`. **REPRODUKCJA sondą (poza repo, `probe-factory-warp2.mjs`), bit w bit:** przy `getDemandBonus('warp_cores') === 0` → `_scanDemand()` zwraca **wyłącznie** `safety:structural_alloys=30`, alokacje = `structural_alloys(fp 2)`, po `_autoConsolidate` **fp 0, used 0, free 25** — dokładnie obraz z gry; przy bonusie 2 → `quantum_cores(fp 13) · antimatter_cells(fp 12)` i 25 FP rusza do pracy. ⇒ **alokator jest sprawny; martwy jest SYGNAŁ POPYTU.** **Mechanizm:** po wygaśnięciu zlecenia (TTL 3 lata) jedynym źródłem popytu na `warp_cores` zostaje `safety`, którego cel to `getSafetyStockTarget` = `base(tier 5 → 1) + _demandBonus`. Bonus pisze **`ColonyAutoExpander._syncTier3SafetyDemand:653`** wartością **ABSOLUTNĄ**: `fs.setDemandBonus(cid, rich ? target - 1 : 0)`, gdzie `rich = ['Fe','Si','Cu','C'].every(o => getAmount(o) >= 20000)`. Stolica emp_002 w gy 30 ma Si 18580 i Cu 13489 (a po drenie Fe — 20), więc **`rich` jest fałszem** i `warp_cores: 50` z `startingSafetyStocks` ląduje jako **0**. Director dopisuje bonus **przyrostowo** (`_feedCommodityDemand:313`, `cur + gap`) przy KAŻDYM zamówieniu — i przy najbliższym tiku auto-ekspandera jest **kasowany**. Cel = 1, zapas = 1, **deficyt 0, alokacji nie ma nigdy**. | 🔴 **OTWARTY — to jest NAZWANA blokada §G.2 gate'u 215** i ostatnie ogniwo między AI a jego własną flotą. ⚠ **KOREKTA PO AUDYCIE (2026-09-01, reguła wejścia `git log -S`): bramka `rich` jest ZAMKNIĘTA Z PROJEKTU, nie przez zaniedbanie.** Powstała w `d44af5e` **w tym samym commicie co cele tier-3+**, bo sama zmiana celów **kosztowała ekspansję** — zmierzone na panelu **16 seedów**: imperia bez żadnej placówki 1/32 → 3/32, obsada etatów 97% → 94%, nieobsadzone etaty 4 → 6,5; bramka przywróciła wszystkie trzy do baseline'u, zachowując zysk. Komunikat mówi wprost: *„ubogie imperium chronione zgodnie z projektem"*. ⇒ **defekt jest KOMPOZYCYJNY**: w `d44af5e` `warp_cores` i `antimatter_cells` były **świadomie WYKLUCZONE** z listy (Finding 181), a **F3 (gałąź fuzji) dopisał je** — słusznie — **nie mierząc ponownie kompozycji**, więc odziedziczyły bramkę napisaną dla innego zbioru towarów, a przede wszystkim bramkę, która **ZERUJE** zamiast „nie podnosić". Wymaga to CZTERECH rud ≥ 20 000 jednocześnie, więc bonus tier-3+ był zerowany przez całą partię, a nie dopiero po drenie Fe (**220**). ⇒ **Finding 182 wrócił inną drogą**: cele zapasu dla tier 3+ istnieją w danych i są w runtime kasowane. ⚠ **PODPISANE 2026-09-01 — wariant (c), separacja kanałów** (`AI_ORDER_DEMAND_PLAN.md`, D-217-1 = V-SPLIT). Trzy warianty wycenione na fixture'cie `GATE-215-gy30`: **V-RICH** budzi **siedem** towarów tier-3+ naraz i rozcieńcza łańcuch warp **25 FP → 6** (obserwabl 2,7× wolniej) — czyli cofa podpisany balans i przy okazji jest najwolniejszym odblokowaniem; **V-FLOOR** daje dziś ten sam wynik co V-SPLIT, ale `_demandBonus` **nie ma proweniencji**, więc `max(...)` czyni z niego **zapadkę jednokierunkową**, która w długiej partii **zbiega do zachowania V-RICH**; **V-SPLIT** daje łańcuchowi **25/25 FP**, nie budzi ani jednego innego towaru i **jako jedyny nie wymaga powtórzenia panelu `d44af5e`**, bo nie rusza pola, które tamten panel mierzył. Kształt: **księga per zlecenie** (D-217-2), flaga `FEATURES.aiOrderDemandChannel`, v101 bez migracji. ⚠ **WDROŻENIE ODSŁONIŁO DRUGĄ, NIEZALEŻNĄ BLOKADĘ na tej samej ścieżce — Finding 221** (alokator łańcucha odejmuje zapas drugi raz). **217 bije PO wygaśnięciu TTL, 221 W TRAKCIE** — i to 221 tłumaczy, dlaczego pięć zleceń wygasło mimo zgłaszanego popytu. Naprawiane w tym samym slice'ie, osobnym commitem 3/3. ⚠ **LIVE-GATE 2026-09-01 (`GATE-215-gy30`, gy 30→42): PASS na swoim ogniwie** — `warp_cores` **1 → 4** (trzy wyprodukowane), a `warp_cores` **znika z list braków** `director:commodityDemand` od gy 32,1. ⚠ **Obserwabl §G.2 (`kadlubyZeSkokiem`) nadal 0**: 12 zleceń wygasło na TTL, **wszystkie na `Fe`** (stolica: Fe 4, `getPerYear('Fe')` −70,2/civY, alokacja `structural_alloys` z celem **1239**, stall `Fe 0-10/40`). ⇒ blokada przesunęła się O JEDNO OGNIWO W GÓRĘ, do podaży Fe — patrz **178** / **220** / pytanie o cel 1239. ⚠ Live flip kill-switcha był w tym stanie **JAŁOWY** (księga pusta: gapy rud odfiltrowane per 214, `warp_cores` pokryte zapasem) — kontrakt flagi pokrywa wyłącznie keeper T6b-d. |
| **218** | 🟠 **`_feedCommodityDemand` jest ŚLEPY NA PÓŁPRODUKTY ŁAŃCUCHA — więc kanał popytu wygląda czysto dokładnie wtedy, gdy łańcuch stoi trzy poziomy niżej.** `DirectorProduction:303-323` iteruje **wyłącznie** `order.cost` zamówienia okrętowego i nigdy nie schodzi rekurencyjnie w recepturę. Zmierzone: przy `warp_cores` brakującym o 1 sztukę `director:commodityDemand` raportuje **`warp_cores gap 1` i nic więcej**, choć realną robotą są 1× `quantum_cores` (`Si 6, Nt 4, Hv 4, Xe 3, Ti 2, Li 2`) + 1× `antimatter_cells` (`Nt 4, Xe 4, Hv 3, Li 2`) + 1× `warp_cores`. | 🟠 **OTWARTY, diagnostyczny.** Nie jest to defekt stanu gry — `FactorySystem._resolveChainNeeds` sam rozwiązuje łańcuch, **gdy dostanie popyt** (patrz **217**). Jest to defekt **PRZYRZĄDU**: gate 215 czytał „warp_cores gap 1 ONLY" jako dowód, że wszystko poza jedną sztuką jest gotowe. ⚠ Reguła na przyszłość: **`director:commodityDemand` opisuje BRAKI ZAMÓWIENIA, nie stan łańcucha** — stan łańcucha czyta się z `FactorySystem.getAllocations()[].stallReason` i `_getMissingIngredients`. |
| **219** | 🟠 **`queueWarships` gubi sztuki po CICHU — a druga cisza domyka pierwszą.** `DirectorProduction:384-389`: w pętli `for (i = 0; i < wanted; i++)` odmowa na sztuce, która **nie jest pierwsza**, robi `break` **bez `director:shipRejected`** (`reject` biegnie tylko przy `queued + started === 0`). Drugą warstwą jest `ColonyManager.startShipBuild`, które przy odmowie emituje `fleet:buildFailed` — a tego zdarzenia **NIE MA w `DebugLog.TRACKED_EVENTS`**. ⇒ częściowo zrealizowane zamówienie jest niewidoczne w OBU kanałach audytu. ZMIERZONE (gate 215): oba odpalenia szczebla L2 (gy 25,93 przez eskalację L1 i gy 27,10 przez własny trigger) dały **2 zlecenia zamiast 3** przy `director:shipRejected` **pustym**. | 🟠 **OTWARTY.** ⚠ Oczekiwanie **2+1 jest ze źródła POPRAWNE**: `pressureResponse:114-122` przy `level ≥ 2` robi DWA wywołania `queueWarships` — obrońcy `count: 2` i roamer `count: 1`. ⚠ **Najbardziej spójna rekonstrukcja** (nie zweryfikowana wykonaniem — wymaga żywego obiektu): obrońca #1 był **stać** ⇒ `started`, zajął jedyny slot stoczni (`shipyardLevel` = 1 z `startingBuildings`); obrońca #2 trafił na `shipQueues.length >= shipyardLevel` ⇒ `fleet.shipyardFull` ⇒ **cichy `break`**; roamer poszedł do `pending` z TTL. To wyjaśnia też, dlaczego `commodityDemand` niósł **wyłącznie** `warp_cores` — bo tylko zlecenie roamera trafiło do `pending`, a `_feedCommodityDemand` czyta wyłącznie zlecenia oczekujące. Naprawa: emitować `director:shipRejected` również dla sztuk po pierwszej (z licznikiem `filled/wanted`) **i** dopisać `fleet:buildFailed` do `TRACKED_EVENTS`. |
| **220** | 🟠 **Dren Fe w stolicy AI: `structural_alloys` przy skalowaniu ×5 scenariusza `civilization_boosted`.** ZMIERZONE: Fe **4359 (gy 26) → 20 (gy 30)**. Receptura bazowa to `{Fe: 8, C: 4}`, ale `FactorySystem._getScaledRecipe:1790-1806` mnoży **tier 1 ×5 wyłącznie w `civilization_boosted`** ⇒ realny koszt **`Fe 40`** za sztukę — zgodnie z odczytem stall-u `missing_ingredient: Fe 20/40`, który jest zarazem **dowodem, że żywa partia biegnie w `civilization_boosted`**. Przy `baseTime 0,20`, 25 FP i `scenarioMult 1,5` jedna sztuka powstaje w ~0,005 civY, czyli **rzędu 1000 Fe/civY**; 4300 Fe znika w ok. 4 civY (≈ 0,36 roku wyświetlanego). ⚠ Arytmetyka „28 × 40" nie domyka bilansu, bo **`targetQty` jest przeliczane od nowa przy KAŻDYM przebiegu planisty** (`_reactiveAllocate` co 0,1 civY: `_allocations.clear()` → `targetQty: agg.deficit`, `produced` przenoszone) — to nie jest jedno zlecenie na 28 sztuk. | 🟠 **OTWARTY, balans + higiena.** ⚠ **Sprzęgnięty z 217**: ten dren zbił Fe poniżej progu `rich` w sposób oczywisty, choć predykat i tak był fałszywy przez Si/Cu. ⚠ Ta sama ×5 dotyczy `basic_supplies` (**water 5**/szt.) i `civilian_goods` (**food 5**/szt.) — oba tier 1, oba ścigane przez reactive z `startingSafetyStocks` (po 10) — więc **dren wody i żywności przez fabrykę jest tej samej klasy** i, jak pokazuje korekta w **216**, **nie widać go w `getPerYear`**. Do zmierzenia osobno (licznik `factory:consumed` albo delta inventory per tik). |
| **221** | 🔴 **Alokator łańcucha odejmuje zapas DRUGI RAZ — więc przy gapie wielkości zamówienia ogniwo nie powstaje NIGDY.** `_resolveChainNeeds` → `_addChainFor` liczy `deficit = qty × ingQty − stock` i **taką wartość** wkłada do `chainMap` (`FactorySystem.js:1131-1140`). Obie pętle alokacyjne odejmują zapas ponownie: `_reactiveAllocate` przez `if (stock >= ch.qty) continue` + `targetQty: ch.qty − stock`, a `_priorityAllocate` przez `stillNeeded = ch.qty − stock`. ZMIERZONE: `warp_cores` cost 2, zapas 1 ⇒ deficyt 1 ⇒ `_addChainFor` zwraca `quantum_cores qty 1` (poprawnie — brakuje jednego), po czym pętla liczy `stock(1) >= ch.qty(1)` i **pomija ogniwo**; rodzic zostaje zaalokowany, ale bez składników, więc `_autoConsolidate` zeruje wszystko: **used 0/25**. Drugi, cichszy skutek: nawet gdy ogniwo przechodzi, `targetQty` jest zaniżony **dokładnie o `stock`** (przy celu 20: **36 zamiast 37**). | ✅ **ZAMKNIĘTY 2026-09-01** — commit 3/3 slice'u 217 (`AI_ORDER_DEMAND_PLAN.md` §10). ⚠ **PRZEBIEG KONTROLNY ODDZIELAJĄCY 221 OD 217** (to jest najważniejsza treść tego wpisu): **żywe** zlecenie w `pendingShipOrders`, księga PUSTA, `_demandBonus` PUSTY ⇒ `_scanDemand` = `build:warp_cores=2 \| safety:warp_cores=1`, `warp_cores` **zaalokowany**, `used 0` — czyli w oknie TTL popyt **BYŁ** przez cały czas, a łańcuch i tak nie powstawał. ⇒ na tej ścieżce były **DWIE niezależne blokady**: **217** bije PO wygaśnięciu TTL (ekspander kasuje popyt Directora), **221** bije W TRAKCIE TTL. 221 tłumaczy to, czego 217 wytłumaczyć nie mógł: dlaczego pięć zleceń wygasło, choć każde zgłaszało popyt przez trzy lata. ⚠ **Dlaczego przeżył tak długo:** przy celach min-zapasu rzędu 50 deficyt jest duży (`1 >= 97` fałsz), więc defekt **nie bije** — maskowały go dokładnie te cele, które 217 zastępuje ograniczonym pullem. **Zaleta nowego projektu odsłoniła starą wadę.** ⚠ **BEZ FLAGI** (precedens `normalizeFleet`, Finding 200): to poprawka poprawności we WSPÓŁDZIELONYM kodzie. Strona GRACZA ZMIERZONA przed decyzją (`probe-221-player.mjs`, kolonia bez `ownerEmpireId`): **(a)** min-zapas ustawiony 1 ponad stan przy półproduktach na poziomie deficytu **nie produkował NIC** → teraz produkuje; **(b)** cel przy dużym deficycie 36 → **37**; **(c)** ścieżka z zerowym zapasem półproduktów **bez zmian**; **(d)** łańcuch płytki **bez zmian**. Żaden przypadek nie produkuje WIĘCEJ, niż realnie brakuje — obie zmiany idą w tę samą stronę i są korektami. Pin: `ai_order_demand_smoke` **T8a-d**. |
| **222** | ⚪ **31 z 61 tekstur budynków nie ładuje się przy starcie (`assets/buildings/*.png`).** Obserwacja właściciela z live-gate'u 217 — połowa katalogu tekstur budynków kończy 404, a mapa planety degraduje do zastępników. | ⚪ **OTWARTY, NIEZBADANY.** ⚠ Zapisane **na obserwacji właściciela**, nie zweryfikowane (karta zamknięta). ⚠ **Nie mylić z rodziną 212** — tam chodzi o wideo zdarzeń i o BRAK CACHE'U PORAŻKI; tu o kompletność katalogu grafik budynków, czyli o zasoby, których lista jest generowana z `BUILDINGS`. Pierwsze pytanie audytu: czy to brak PLIKÓW (katalog niepełny wobec `BuildingsData`), czy zła ŚCIEŻKA (np. `TerrainTextures`/`buildingTexture` składa nazwę inaczej niż plik) — bo obie dają identyczny 404, a naprawa jest zupełnie inna. |
| **223** | 🔴 **Handel wewnętrzny imperium AI jest bramkowany MGŁĄ WOJNY GRACZA — imperium nie handluje samo ze sobą, dopóki gracz nie zajrzy do jego układu.** `CivilianTradeSystem:85-101` odsiewa z `tradingColonies` **każdą** kolonię z `ownerEmpireId`, gdy gracz nie zwiedził jej układu (`isSystemExploredId`) i imperium nie ma traktatu handlowego. Bramka powstała pod „mechanizm handlu z AI" (Slice 1 patch v3 Fix 2 — komentarz mówi wprost o otwieraniu handlu recon-em) i **przy okazji odcina pary AI↔AI TEGO SAMEGO imperium**. ZMIERZONE (3 kolonie emp_002, stolica Fe 4, dwie córki po Fe 3000): układ niezwiedzony + brak traktatu ⇒ kolonii handlowych **3 → 0**, czyli `_halfYearlyTick` wychodzi natychmiast na `tradingColonies.length < 2`; przy `explored` lub traktacie ⇒ **3 → 3**. ⚠ `Fe` **JEST** w `TRADEABLE_GOODS` (35 pozycji: wszystkie 9 rud + food/water), więc kanał istnieje i **umiałby** wozić rudę z córek do głodującej stolicy. | 🔴 **OTWARTY — kandydat na R2 w slice'ie podaży Fe** (`FE_SUPPLY_PLAN.md` §3). ⚠ To jest ta sama klasa co „termin własności" z arca BRAMKA WŁASNOŚCI, tylko po stronie AI: bramka **fog-of-war** ma dotyczyć par **gracz↔AI**, a nie par **AI↔AI wewnątrz jednego imperium**. Naprawa prawdopodobnie **jednolinijkowa**. ⚠ **Sprzężony z 224**: samo 223 otworzy kanał, ale `_deficitScore` stolicy i tak będzie zaniżony, dopóki `_getConsumption` nie widzi poboru receptur — dlatego przebieg R2 to **223 + 224**, nie samo 223. ⚠ Pomiar na atrapie kolonii (bramka jest czysto strukturalna); pierwszy fixture dawał 0 połączeń z **innego** powodu (`dist = Infinity` przy braku encji w `EntityManager`) — artefakt stubu, poprawiony przed pomiarem. |
| **224** | 🟠 **`CivilianTradeSystem._getConsumption` nie widzi poboru surowców przez FABRYKĘ — więc deficyt stolicy jest systematycznie zaniżony.** `:609-620` sumuje **ujemne stawki zarejestrowanych producentów** (`resourceSystem._producers`) — ten sam rejestr, z którego `_recalcPerYear` buduje `_inventoryPerYear`. `FactorySystem._consumeIngredients` pisze do inventory **bezpośrednio**, więc dominujący konsument (przy `structural_alloys` rzędu **1000 Fe/civY** przy 25 FP i skalowaniu ×5) jest dla `_deficitScore` **niewidzialny**. | 🟠 **OTWARTY — druga połowa R2** (`FE_SUPPLY_PLAN.md` §3). ⚠ **Ta sama ślepota, co korekta wpisana do 216** (`getPerYear` nie widzi poboru receptur) — ale konsekwencja jest tu inna i cięższa: 216 dotyczyło **odczytu diagnostycznego**, 224 dotyczy **decyzji routingu**. ⇒ nawet po naprawie **223** handel wyśle za mało i za późno. ⚠ Kandydaty naprawy do wyceny: licznik poboru w `FactorySystem` (zdarzenie `factory:consumed` już istnieje jako agregat per tik) albo drugi człon w `_getConsumption` czytany z fabryki. **Nie zmierzone na żywej stolicy** — wyprowadzone ze źródła i potwierdzone `deficitScore = 0` na atrapie bez zarejestrowanego konsumenta. |
| **225** | 🔴 **`ColonyAutoExpander` nie skaluje KARMICIELI — cele `farm`/`habitat`/`mine` są STAŁE we wszystkich checkpointach.** `targets/industrialist.js` (Expansionist to klon behawioralny i **dzieli te same targety**, `ColonyAutoExpander:48-56`): **farm 2 → 2 → 2 → 2**, **habitat 1 → 1 → 1 → 1**, **mine 2 → 2 → 2 → 2**, `well` 2 → 2 → 3 → 3, a rośnie tylko `factory` 3 → 4. ⇒ ekspander skaluje **konsumentów**, nie karmicieli. `food/rok` spada wraz ze wzrostem populacji, aż wchodzi głód. ZMIERZONE (`DirectorHarness`, stolica AI): `food/rok` **+17,6 (gy0) → −8,9 (gy5, GŁÓD) → −5,1 (gy10)**, populacja **24 (gy0) → 19 (gy5) → 12 (gy10) → 3 (gy15)**. ⚠ **Liczby przeliczone na przyrządzie z izolacją bootu (Finding 228);** trajektoria **reprodukuje się** — poprawione były wyłącznie etykiety lat (wcześniej `+3,5` przy gy5 i `−8,9` przy gy10). Rdzeń findingu — **statyczne cele karmicieli** — jest potwierdzony ŹRÓDŁOWO (`targets/industrialist.js`) i nie zależy od żadnego pomiaru. | 🟡 **CZESCIOWO NAPRAWIONY — `FEATURES.aiScaleBasicInfra` (R4). STRAZNIK, NIE LEKARSTWO.** `_feederTarget` skaluje `farm`/`well` populacja zamiast checkpointem. ⚠ **PIERWSZA WERSJA BYLA BEZCZYNNA:** liczyla cel wobec NOMINALNEJ wydajnosci farmy (10 food/rok) ignorujac `empPenalty` ⇒ przy pop 19 dawala `_feederTarget = 2`, czyli **dokladnie cel statyczny**. Poprawione: cel wobec REALNEGO wyjscia (`perBuilding × max(0,25, staffing)`) i **przyciety do poziomu obsadzalnego** — podpisany warunek wlasciciela, ze bramka 226 musi objac **takze karmicieli** (farma niesie `popCost` jak elektrownia). ⚠ **I to przyciecie sprawia, ze R4 milczy w kryzysie, ktory mial leczyc**: przy `laborer = 0` liczba obsadzalnych farm = stan biezacy. 🔴 **LICZBY Z `8226dcc` SA FALSZYWE** (patrz **228**) — czysty pomiar w `FE_SUPPLY_PLAN.md` §10.5. |
| **226** | 🔴 **PĘTLA ŚMIERCI: moduł survival dokłada elektrownie przy ujemnym bilansie, a każda dokłada ETAT, którego nie ma kto obsadzić.** `ColonyAutoExpander:253-258` buduje `solar_farm` przy KAŻDYM `balance < energy_balance_min` (komentarz: *„najwyższy priorytet, brownout psuje wszystko"*). `solar_farm` ma `popCost 0.25` ⇒ `jobs 1`, a produkcja jest mnożona przez `empPenalty = laborer / getSlotDemand('laborer')` (`BuildingSystem._applyTechMultipliers`, gałąź `val > 0`). Gdy obsada spada, nowa elektrownia **produkuje ZERO i podnosi mianownik** — bilans dalej ujemny, więc powstaje kolejna. ZMIERZONE: **solar 11 → 28 → 30 przy `laborer = 0` i `avail = 0,00` przez cały czas** — elektrownie nie dały ANI JEDNEJ jednostki energii. ⚠ **Liczba „30 elektrowni" pochodziła z przebiegu R4-bez-bramki na skażonym przyrządzie (Finding 228) i NIE zostala odtworzona** — po scaleniu obu zmian pod jedną flagą ten wariant nie istnieje osobno; czysty R0 daje **12**. Sam fakt „elektrownie bez rąk = zero energii" jest potwierdzony ŹRÓDŁOWO (`empPenalty` mnoży gałąź `val > 0` w `BuildingSystem._applyTechMultipliers`), więc TEZA stoi, a jej ILUSTRACJA LICZBOWA nie. ⚠ Stąd `production: 0` z live-readu R0 (`{"production":0,"consumption":123.15,...}`) — nie brak mocy, tylko brak RĄK. | 🟡 **ZABRAMKOWANY (`aiScaleBasicInfra`), mechanizm POTWIERDZONY ZRODLOWO, ZYSK NIEZMIERZALNY W TYM FIXTURZE.** Bramka dziala: popyt na robotnikow **36 → 24** w gy10 (inwentarz stolicy rozni sie DOKLADNIE jednym wpisem: `solar_farm` 12 vs 6, reszta identyczna). 🔴 **ALE `empPenalty = laborer / demand`, a `laborer = 0` w OBU kolumnach** ⇒ `0/36` i `0/24` to to samo zero. Bramka pomaga **wylacznie przy `laborer > 0`**; tu robotnicy schodza do zera w gy9, a bramka wchodzi w gy7 — **dwa lata za pozno**. 🔴 **TEZA WYCOFANA:** „mniej elektrowni = wiecej energii (avail 0,00 → 0,99)" **NIE REPRODUKUJE SIE** — na czystym przyrzadzie R4 ma w gy7-8 `avail` **nizsze** (0,64 vs 0,68; 0,00 vs 0,28), potem obie kolumny siedza na 0,00. Falszywy byl zmierzony **ZYSK**, nie **MECHANIZM** (`ColonyAutoExpander:253-258` + `solar_farm.popCost 0.25` — zrodlo bez zmian). Kontrola d44af5e: placowki **1 vs 1**, nie 5 vs 1. Zrodlo falszu: **228**, nosnik: **`8226dcc`**. |
| **227** | 🔴 **Zalozone kolonie AI NIGDY nie dostaja portu, wiec sa trwale wykluczone z handlu cywilnego — takze z WLASNYM imperium.** `CivilianTradeSystem:88` odsiewa z `tradingColonies` kazda kolonie bez `_hasSpaceport` (`:750-757` — wymagany budynek z `isSpaceport`). Kolonia zalozona przez AI startuje z `[colony_base, solar_farm, solar_farm, mine]`, a `launch_pad` **jest w `targets` archetypu, ale NIE MA GO w `ColonyAutoExpander.BUILD_PRIORITY`** ⇒ ekspander nigdy po niego nie siega. ZMIERZONE: **1 z 5 kolonii AI kwalifikuje sie do handlu** (sama stolica, ktora dostaje `launch_pad` z bootstrapu), a `_calcAllConnections` wymaga **≥2** ⇒ tick handlu nie ma z czym pracowac. ⚠ To jest **trzeci, niezalezny** powod ciszy handlowej AI obok **223** (mgla wojny) i **224** (slepy `_getConsumption`) — i jedyny, ktorego tamte dwie naprawy NIE zdejmuja. ⚠ Konsekwencja dla `FE_SUPPLY_PLAN` §10.7c: glodujaca stolica **nie ma jak zaimportowac zywnosci**, nawet gdy rodzenstwo ma nadwyzke. | ⚪ **OTWARTY** — naprawa wyglada na jedna linie w `BUILD_PRIORITY`, ale zmienia **kolejnosc budowy w kazdej koloni AI** ⇒ wlasny pomiar i wlasny podpis. ⚠ **Powiązane: 243** — PLACÓWKI są wykluczone z tej samej warstwy handlu O SZCZEBEL WCZEŚNIEJ (brak portu **i** brak jakiegokolwiek zarządcy po bootstrapie — `ColonyAutoExpander` odsiewa `isOutpost`), więc naprawa 227 **nie odblokuje ładunku z placówek**; to dwa różne mechanizmy z dwiema różnymi naprawami. |
| **228** | 🔴 **`DirectorHarness.bootWithDirector` przeciekal miedzy bootami w jednym procesie — kazda tabela porownawcza z tego przyrzadu byla podejrzana.** `GameCore.boot` czysci `EntityManager` i `EventBus`, ale **nie reseeduje PRNG** i **nie resetuje `gameState`** (singleton niosacy m.in. `director.rules` z cooldownami). Drugi boot dostawal **inna galaktyke** i **cudze cooldowny regul**. ZMIERZONE SKUTKI: tabela R0-vs-R4 puszczona tak dala R4 `pop 36 · avail 0,99 · Fe 19 826`; te same warianty w **osobnych procesach** daly `pop 6 · Fe 22`. **Falszywy wynik zostal ZACOMMITOWANY w `8226dcc`** (i wczesniej `b712ee1`) i przez chwile stal w `FE_SUPPLY_PLAN.md` §10.5 oraz w rejestrze **225**/**226**. ⚠ **Wykryl to wlasciciel z zywej gry** (zglosil, ze R0/R4/R2 sa nierozroznialne) — **dane live przebily moja tabele**. | ✅ **NAPRAWIONY 2026-09-01** — `reseed(String(seed))` + `gameState.restore(null)` przed `new GameCore()`. Pin **T7** (`director_harness_smoke`): dwa boothy w jednym procesie musza dac IDENTYCZNY swiat, z kontrola niejalowosci (pierwszy boot dal ZYWY swiat) + **T7b** pin zrodlowy na oba przecieki. |
| **229** | 🔴 **Greedy fill 5C.2 nie ma dla AI ŻADNEJ zasady porządkującej — farmy stolicy stoją na końcu kolejki po WSPÓŁRZĘDNYCH HEX, więc kolonia głoduje przy elektrowniach na 100 %.** `BuildingSystem._buildGreedyStaffCache:2190` napełnia budynki warstwy JEDEN PO DRUGIM do 100 % w porządku `designation === 'priority'` → **sort stringa `activeKey`**. `farm.popType = 'laborer'` — ta sama warstwa co `solar_farm`, `well`, `habitat` — więc żywność i energia konkurują WEWNĄTRZ jednej warstwy, a rozstrzyga je numer hexa. ZMIERZONE (`DirectorHarness`, stolica `Thuban b`): kolejka `0,3 0,4 2,5 2,6 3,5 4,4` (6 elektrowni) → `5,3 5,4` (2 studnie) → `6,3 7,2` (**obie farmy na końcu**), **8 etatów przed pierwszą farmą**; od gy3 obie farmy mają obsadę **0 %** przy sześciu elektrowniach na 100 %, produkcja żywności 32,6 → 3,2 → 2,4, zapas 250 → 0, pop 24 → 12 (gy10) → 6 (gy30), `avail` 0,00 od gy8 ⇒ kopalnie nie wydobywają, fabryka nie akumuluje, **Fe = 0 na zawsze**. ⚠ **Mechanizm naprawczy ISTNIEJE i jest dla AI strukturalnie nieosiągalny**: jedynym produkcyjnym pisarzem `designation` jest `ColonyOverlay:4979`, czyli KLIK MYSZY GRACZA. ⚠ **O przeżyciu stolicy decyduje GENERATOR MAPY**: etaty przed pierwszą farmą zmierzone na czterech ziarnach jako **8 / 6 / 4 / 1**, a `food/rok` @gy4 odpowiednio −9,5 / +1,6 / −10,6 / **+48,5**. | ✅ **ZAMKNIĘTY — S1 (`FE_SUPPLY_PLAN.md` §12b), podpisany 2026-09-02.** Kolonie AI liczą obsadę UNIFORM (5C.1), gracz zostaje na greedy + priorytet co do bitu; bramka `systemBelongsToPlayer` (kanon, **fail-open**), flaga `FEATURES.aiUniformStaffing` (ON; OFF = przed S1 co do bitu). Pomiar bramki AI-only OSOBNO (warunek właściciela — CF_UNIFORM był przebiegiem z flagą globalną i **nie był dowodem na bramkę**): @gy30 pop **6 → 28**, obsada farm **0 % → 23 %**, `avail` **0,00 → 1,00**, poziom kopalni **1 → 3,2**, statki **6 → 12**. Keeper `ai_uniform_staffing_smoke` **21/21**, fail-first **16/5**. ⚠ **S2 (statyczna kolejność „karmiciele najpierw") ODRZUCONE POMIAREM** — żywność ratuje (zapas 4448 @gy20), ale `avail` spada do 0,00 od gy3: statyczny porządek tylko PRZENOSI ofiarę. Korzeń (popyt 2-4× ponad pulę) = **233 / S4**. ⚠ **POTWIERDZONE NA ŻYWO — GATE-S4-fresh, 2026-09-03 (`FE_SUPPLY_PLAN` §14.2):** obsada farm stolicy **45 % → 80 % → 100 %**, **ANI RAZU 0 % przy `laborer > 0`** przez 60 gy — czyli dokładnie na metryce, która miała rozstrzygać (pin na OBSADZIE, nie na liczbie robotników). Stolica `Propus b` pop **24 → 170**, `Regulus c` → 158; stara krzywa głodu przewidywała na gy 15 pop → 3, **zmierzono 53**. Kontrakt flagi sprawdzony NA ŻYWO w OBIE strony: `_greedyApplies()` OFF → `true` w obu stolicach, ON → `false`. |
| **230** | 🔴 **Ulepszenie farmy nie kupuje ANI JEDNEJ jednostki żywności, a przy jednym robotniku mniej zeruje jej produkcję — auto-ekspander sam wykonuje cios kończący.** `getSlotDemand:310-320` liczy `entry.jobs × entry.level`, więc L1→L3 potraja WYMAGANIE PRACY tego samego budynku. Pod greedy (229) skraca się to do `base × share`: ZMIERZONE — farma L1 przy pełnej obsadzie **10,29 food/civY**, ta sama farma L3 przy tej samej puli **10,29** (potrojenie nominału 10 → 30 daje ZERO zysku), a przy puli mniejszej o JEDNEGO robotnika **0,00** i producent zostaje wyrejestrowany, podczas gdy wszystkie sześć elektrowni stoi na 100 %. W żywym przebiegu: farma `7,2` ulepszona w gy2 traci **całe 14,70 food/civY w tej samej chwili** (prod 32,6 → 17,9 = dokładnie jedna farma), farma `6,3` tak samo w gy3. Liczba farm nie zmienia się ani razu (stoi na 2) — **cały wzrost popytu 10 → 24 pochodzi z ULEPSZEŃ, nie z budowy**. ⚠ Arytmetyka „neutralne, nie ujemne" wyszła **dopiero z keepera** — pierwsza wersja pinu zakładała spadek do zera od samego ulepszenia i PADŁA. | ✅ **ZAMKNIĘTY OBJAWOWO przez S1** (pod uniform ta sama farma L3 zachowuje stawkę > 0 — pin T5e). ⚠ **PRZYCZYNA ZOSTAJE OTWARTA i należy do S4/233**: ścieżka ULEPSZEŃ **nie ma dziś żadnej bramki pracy** — strażnik z **226** ogranicza LICZBĘ elektrowni, nie ich POZIOM, a `jobs × level` mnoży wymaganie pod jego radarem. Pinowane: `ai_uniform_staffing_smoke` T5a-T5e. ⚠ **POTWIERDZONE NA ŻYWO (§14.2):** przez 60 gy ani jedna farma nie spadła do 0 % przy `laborer > 0` **mimo ulepszeń** — domknięcie objawowe trzyma się poza harnessem. ✅ **PRZYCZYNA ZAMKNIĘTA przez S4a** (`aiLaborBudget`, `bee26cf`): budżet pracy liczy `jobs × level`, więc **widzi ULEPSZENIE tak samo jak budowę** — 80,2 % blokad przypada właśnie na ścieżkę ulepszeń (§13.3). Bramka, której „dziś nie ma żadnej", od S4a istnieje. |
| **231** | 🟠 **`_feederTarget` (R4 / Finding 225) NIGDY nie odpala — nie „milczy w kryzysie", tylko jest no-opem od gy0.** ZMIERZONE (`ColonyAutoExpander._feederTarget`, stolica AI, co gy): **2 przy KAŻDYM gy 0→10**, identycznie ze statycznym celem z checkpointu. Powód: `wolneRece = max(0, laborer − getSlotDemand('laborer'))` wynosi **0 od gy1 na zawsze** (popyt przerasta pulę), więc cap `obsadzalne = _countBuilding + floor(wolneRece / jobsPer)` zwraca STAN BIEŻĄCY; w gy0 sam `potrzeba` wychodzi 2, więc cap nawet nie musi wiązać. ⚠ **Więcej farm i tak by nie pomogło** — dwie istniejące stały na obsadzie 0 % (**229**), więc trzecia byłaby trzecim budynkiem bez ludzi. | 🟠 **OTWARTY jako DŁUG, nie jako defekt do naprawy teraz.** ⚠ **KOREKTA WOBEC `FE_SUPPLY_PLAN.md` §10.5**, gdzie zapisano „połowa karmicielska jest nadal BEZCZYNNA **w kryzysie**" — pomiar mówi: bezczynna **ZAWSZE**. ⚠ **KLASA SAMOBÓJCZEJ BRAMKI, i to po stronie WŁAŚCICIELA**: cap obsadzalności był **podpisanym warunkiem właściciela** (rozszerzenie 225: „karmiciel niesie `popCost` jak elektrownia, więc cel capujemy do poziomu obsadzalnego") — przesłanka poprawna (bez capu odbudowalibyśmy 226 drzwiami żywnościowymi), skutek **odwrotny do zamierzonego**: cap przypiął cel dokładnie do poziomu, który nic nie produkuje. **Ta sama lekcja co tabela z dwóch bootów (228): decyzja może być poprawnie uzasadniona i mimo to produkować cichy no-op — i w obu wypadkach wykrył to dopiero POMIAR, nie przegląd.** Rozstrzygnięcie razem z **233 / S4** (budżet pracy), nie osobno. |
| **232** | 🟠 **Kolonizacja drenuje stolicę PONIŻEJ jej własnej zdolności obsadzenia tego, co już zbudowała.** `EmpireStrategySystem._executeFullColony:788-796` zabiera z matki `_fullColonyResourceTransfer` (**200 food + 200 water**, ZMIERZONE: 400 food przez dwie kolonizacje) oraz `removePop('laborer', popTransferSize)` — **4 laborerów, z warstwy, która obsługuje farmy**. Bramka (D-215-1c) brzmi `laborer >= popTransferSize + MOTHER_RESERVE(4)` = 8 i jest mierzona **względem niczego funkcjonalnego**: stolica potrzebuje 10-24 laborerów, żeby obsadzić własne budynki. ZMIERZONE: laborer 12 → 8 (gy1) → odrost do 9 → 5 (gy3); 200 food to ~13 civY całej konsumpcji stolicy. | 🟠 **ZAPARKOWANY przy rezerwie 4 — decyzja właściciela 2026-09-02.** **AKCELERANT, NIE DEFEKT WIĄŻĄCY**: przebieg kontrolny **CF_NOCOLONY** (pełna blokada `_executeFullColony`) **i tak kończy się śmiercią** stolicy (pop 8 @gy20, `avail` 0,00) — bez kolonizacji szczyt populacji jest wyższy (29), ale `food/rok` schodzi do −14,3 już w gy4. ⇒ zmiana rezerwy opóźniłaby krach, nie zapobiegłaby mu. Wraca dopiero, jeśli po S1 + S4 stolica nadal nie unosi ekspansji. |
| **233** | 🟠 **Popyt na pracę w koloniach AI jest strukturalnie 2-4× większy od puli — `ColonyAutoExpander` nie ma BUDŻETU PRACY.** ZMIERZONE: `getSlotDemand('laborer')` **10 → 24** w gy0-5 przy **ZERO nowych budynków** (farm 2, solar 6, well 2 przez cały przebieg) — cały przyrost pochodzi z ULEPSZEŃ (**230**); z `aiScaleBasicInfra` OFF popyt dobija do **36**. Pula laborera szczytuje na **12** i schodzi do 0. Bramka z **226** capuje LICZBĘ elektrowni (36 → 24), ale 24 to nadal 2× szczyt puli. | ✅ **ZAMKNIĘTY — S4a; domknięcie i pomiar live na KOŃCU tej komórki. Zapis sprzed domknięcia: „OTWARTY — to jest S4, NASTĘPNY AUDYT PO LIVE-GATE S1"** (`FE_SUPPLY_PLAN.md` §12c; kolejność ustalona z właścicielem 2026-09-02). Zakres: budżet pracy w ekspanderze **plus bramka na ŚCIEŻCE ULEPSZEŃ, której dziś NIE MA ŻADNEJ**. ⚠ **Ryzyko powtórki nazwane z góry**: 225 było już próbą tej klasy i wyszedł z tego no-op od gy0 (**231**) — S4 zaczyna od POMIARU, nie od formuły. ⚠ Nie mierzone, czy GRACZ jest w stanie wpędzić się w tę samą pułapkę (ma UI priorytetu, więc ma czym wyjść). ✅ **ZAMKNIĘTY — S4a (`FE_SUPPLY_PLAN` §13), wdrożone `bee26cf`, POTWIERDZONE NA ŻYWO 2026-09-03 (§14.2).** Kształt: budżet pracy w ekspanderze, odczyt **`workers`** (nie `population` — wybrane TABELĄ na dwóch ziarnach), margines `LABOR_BUDGET_MARGIN = 2`, obejmuje **budowę I ulepszenie**, flaga `FEATURES.aiLaborBudget` (OFF = przed S4 co do bitu). Harness: pierwszy kadłub gy 38/37 → **21/21**, Fe 2 408 → **43 168**, obsada farm 21 % → 82 %. Żywo: laborer **9/11 → 16/20 → 33/33**, `zablokowane` `[farm, well, solar_farm, factory]` → **`[]` od gy 40**, licznik blokad **płaski 1 637** przez gy 50-60 ⇒ **budżet SAM SIĘ ZWALNIA** (mechanizm: `habitat.jobs === 0` jest poza regułą — §13.5 — więc mieszkania 32 → 188 podnoszą populację, pulę pracowników i sufit). ⚠ Ryzyko powtórki no-opa klasy **231** **nie zmaterializowało się** — zmierzone SKUTKIEM (pop 170, Fe 14 tys., kopalnia L12, pierwszy `warp_core`), nie formułą. ⚠ Wariant GRACZA tej pułapki **nadal NIE MIERZONY** — S4 jest AI-only z konstrukcji (`_managedColonies`). |
| **INSTR-2** | ⚪ **DWIE „PRODUKCJE" I NIE SĄ TĄ SAMĄ LICZBĄ — cytuj KSIĘGĘ.** ZMIERZONE na stolicy AI w gy0: suma zarejestrowanych producentów `res._producers[*].food` = **32,6** (i dokładnie tyle pokazuje `_inventoryPerYear.food`, czyli tyle silnik NAPRAWDĘ stosuje), a przeliczenie na żywo `bs._applyTechMultipliers({food: base}, b, key)` po tych samych budynkach = **24,1**. Rozjazd **26 %**, bo stawki odświeżają się wyłącznie w `_reapplyAllRates`, a przeliczenie na żywo czyta STAN BIEŻĄCY. ⚠ Pierwsza tabela tego audytu podała 24,1 i musiała zostać poprawiona. | ⚪ **NOTA PRZYRZĄDOWA, nie defekt.** Reguła: **w pomiarach produkcji cytuj `_producers` / `_inventoryPerYear`** (to, co silnik stosuje), a przeliczenie `_applyTechMultipliers` traktuj jako podgląd „ile BYŁOBY po najbliższym `_reapplyAllRates`". ⚠ Ta sama RODZINA co korekta w **216** i **224** (`getPerYear` nie widzi poboru receptur): w tym repo istnieją **trzy** różne odpowiedzi na pytanie „ile tego jest na rok" i każdy pomiar musi nazwać, którą czyta. |
| **234** | 🔴 **Ekspander AI nie miał ŻADNEGO budżetu pracy: jedyny hamulec był BUDOWLANY i został USUNIĘTY, a ścieżka ULEPSZEŃ nie miała go NIGDY.** Zweryfikowane hashem: `ColonyAutoExpander` powstał `e846f5a` (2026-05-25), cała logika budowy/ulepszania pochodzi z 2026-05-25…30, a od Population 2.0 Faza 2 (`d95d9b8`, 2026-07-27) plik tknęły cztery commity. `d95d9b8` **skasował** warunek `freePops <= 0 && pendingBuilds >= 1`, z uzasadnieniem *„budowa NIE wymaga wolnych POP … alokacja dośle ludzi"* — przesłanką, którą **229 obaliło** (alokacja dosyła ludzi do tego, co sortuje się pierwsze po hexie). `git log -S '_upgrade'` zwraca same commity z 2026-05 ⇒ **ulepszenia nie były bramkowane nigdy**, mimo że `getSlotDemand` liczy `jobs × level`. ZMIERZONE: popyt laborera **10 → 24 przy ZERO nowych budynków** (36 z `aiScaleBasicInfra` OFF), przy puli robotników szczytującej na 12. | ✅ **ZAMKNIĘTY — S4a (`FE_SUPPLY_PLAN.md` §13), D-S4-1 podpisane 2026-09-02.** `_overLaborBudget`: nie buduj i nie ulepszaj, jeśli wynikowe job-units warstwy przekroczą pracowników TEJ warstwy + `LABOR_BUDGET_MARGIN` (=2). Flaga `FEATURES.aiLaborBudget` (ON; OFF = przed S4 co do bitu). Odczyt `workers` wybrany TABELĄ, nie instynktem: pierwszy kadłub **gy21/gy21** na obu ziarnach wobec gy38/gy37 bez budżetu i gy22/gy29 dla odczytu populacyjnego; Fe 2 408 → **43 168**, obsada farm 21 % → **82 %**. ⚠ Margines +2 vs +10 % to **wariancja, nie ranking** — podpisany jest ODCZYT. Blokady rozkładają się bud./ulep. jak **879 / 3 569** (80,2 %) — pompa potwierdzona liczbą. Keeper `ai_labor_budget_smoke` **21/21**, fail-first 4 FAIL + crash na T7. |
| **235** | 🟠 **Popyt na pracę w koloniach AI jest MONOTONICZNIE NIEMALEJĄCY — ekspander nie ma ŻADNEGO mechanizmu zdejmowania popytu.** Pin źródłowy (komentarze zdjęte, z kontrolą pinu): w `ColonyAutoExpander` **zero** wywołań `_demolish`, **zero** `setBuildingDesignation`, **zero** ścieżki downgrade. `designation: 'paused'` — jedyny mechanizm, który zwalnia etaty — ma dokładnie jednego produkcyjnego pisarza: `ColonyOverlay:4979`, czyli **klik myszy GRACZA**. To **bliźniak Findingu 229**: mechanizm istnieje, jest poprawny i jest dla AI strukturalnie nieosiągalny. Jedyne, co realnie obniża popyt AI, jest PRZYPADKOWE (zniszczenie budynku przez `ImpactDamageSystem`/`RandomEventSystem`). | 🟠 **OTWARTY ŚWIADOMIE — „file, don't design" (S4c, decyzja właściciela 2026-09-02).** ⚠ Konsekwencja, którą trzeba znać przed każdą kolejną regułą: **S4 potrafi tylko ZAPOBIEGAĆ, nigdy LECZYĆ.** Kolonia raz ponad budżetem zostaje ponad nim, dopóki populacja nie dogoni — sama nic nie odda. ZMIERZONE: S4a **bez** S1 nie ratuje niczego (pop 4, obsada farm 0 %, `avail` 0,00, zero kadłubów w 60 gy), mimo że utrzymał popyt na 11 — bo przy `laborer = 0` rozdział i tak daje farmom zero. **Lekarstwem jest S1; S4 jest ekonomią.** Projektowanie zdejmowania popytu dla AI = osobny slice z własnym pomiarem, nie dodatek. Pin: `colony_auto_expander_smoke` G1-G3. |
| **236** | 🟠 **ASYMETRIA HOUSING ↔ KARMICIELE: moduł survival skaluje MIESZKANIA z populacją od maja, a KARMICIELI nie skalował nigdy.** `ColonyAutoExpander._runSurvival:243-252` (commit `463f0e3`, 2026-05-25) buduje `habitat`, gdy `housing < pop × housing_buffer_ratio` (**1.1**, DANA w `src/data/targets/industrialist.js:211`) ⇒ sufit mieszkaniowy **podąża za populacją z 10 % buforem**. Liczba farm jest tymczasem STATYCZNA w checkpointach archetypu (`farm: { count: 2 }` na każdym checkpoincie) i taka została przez wszystkie 60 gy każdego wariantu. ⚠ **To obala premisę Findingu 216** („stolica AI jest z projektu zbilansowana na własny cap 32, po jego przekroczeniu ma strukturalnie zerową nadwyżkę"): **32 to tylko housing STARTOWY**, każdy habitat dokłada 12, a ZMIERZONE `humans/housing` to **0,78-0,85** — ekspander trzyma kolonię trwale PONIŻEJ jej własnego sufitu. Mechanizm z 216 (housing bramkuje wzrost: `humans × (1 − humans/capacity)`, `blockReason 'at_capacity'`) jest poprawny — błędna była LICZBA. | 🟠 **OTWARTY jako obserwacja projektowa, nie defekt do naprawy teraz.** Odpowiada na pytanie z kontroli Sargas („dlaczego sufit 32 nie wiąże przy pop 103"): **bo sufit się przesuwa**. ⚠ Wyjaśnia też, dlaczego R4/225 była próbą właściwej klasy, która wyszła no-opem (**231**): survival miał dynamiczne mieszkania od maja i nigdy nie dostał dynamicznych karmicieli, a wrzesień dołożył cel, który nie odpalił ani razu. ⚠ Po S4a temat jest **mniej pilny, nie zamknięty**: przy `workers+2` dwie farmy wystarczają, bo są obsadzone w 82 % zamiast w 21 %. Pin: `colony_auto_expander_smoke` H1-H3. ⚠ **ZAOBSERWOWANE NA ŻYWO (§14.2, 2026-09-03):** mieszkania stolicy **32 → 188** przy pop 24 → 170 — dynamiczny sufit housing działa poza harnessem. ⚠ **I okazało się, że to ON jest ZAWOREM S4a**: `habitat.jobs === 0`, więc budżet pracy mieszkań NIE WIDZI, a rosnące mieszkania podnoszą populację → pulę pracowników → sufit `workers + 2`; **asymetria, którą ten finding opisuje jako brak, jest warunkiem samo-zwolnienia budżetu**. Karmiciele nadal nie są skalowani populacją, więc finding zostaje otwarty jako obserwacja projektowa — ale przy obsadzie farm 82-100 % **nie jest pilny**. |
| **237** | ⚪ **TRIPWIRE — budżet `workers + 2` jest sufitem SAMOSPEŁNIAJĄCYM.** Pracownicy warstwy pojawiają się tylko tam, gdzie istnieją etaty, więc `workers + 2` domyka się w punkcie stałym: ZMIERZONE — warstwa laborer stoi na **9/11 job-units od gy5 do gy60**, podczas gdy populacja rośnie 24 → 47. Kolonia rośnie, ale w INNE warstwy (worker 12/12, miner 11/13, scientist 9/9, engineer 6/6, bezrobotni **0**, satysfakcja 90). ⚠ Próba naprawy przez „rośnij, gdy warstwa w pełni obsadzona" zamroziła sufit **NIŻEJ** (10), bo pełna obsada pojedynczej warstwy jest rzadka przy alokatorze rozdzielającym ludzi na siedem warstw. | ⚪ **ŚWIADOMIE PRZYJĘTE przy tej skali (D-S4-2, 2026-09-02) — BEZ członu wzrostu.** Podstawa z pomiaru, nie z gustu: 11 job-units żywi i zasila stolicę 47-pop, a kontrola Sargas pokazuje **2 obsadzone farmy żywiące 103 pop**. Kolejny wymyślony człon to pułapka strażnik-zamiast-lekarstwa (klasa **231**). **WRÓCIĆ, GDY:** stolice AI zbliżą się do **~100 pop**, ALBO otworzy się gałąź cywilna techu (**238**) — arkologia (housing 32) i `synthesized_food_plant` zmieniłyby arytmetykę, na której stoi to przyjęcie. Do tego czasu sufit jest cechą, nie długiem. ⚠ **PRÓG TRIPWIRE ZOSTAŁ PRZEKROCZONY, A ZJAWISKO NIE WYSTĄPIŁO (§14.2, 2026-09-03).** Warunek powrotu brzmiał „gdy stolice AI zbliżą się do **~100 pop**" — żywy przebieg dał **170 / 158 pop**, czyli **1,7× ponad próg**, a sufit **nie zamarzł**: popyt urósł **11 → 33** razem z populacją, blokady zeszły do **`[]` od gy 40**, licznik płaski. ⇒ **przesłanka o suficie SAMOSPEŁNIAJĄCYM obalona przy tej skali**; mechanizmem zwolnienia jest housing poza budżetem (**236**), a nie żaden człon wzrostu — **D-S4-2 potwierdzone skutkiem**. ⚠ **Tripwire z przekroczonym progiem jest MARTWYM PRZYRZĄDEM** (milczy, bo warunek już spełniony) — zostaje wyłącznie druga klauzula: **238** (gałąź cywilna techu; arkologia housing 32 + `synthesized_food_plant` zmieniają arytmetykę tego przyjęcia). Ewentualny nowy próg liczbowy = decyzja właściciela, nie domysł. |
| **238** | 🟠 **CAŁA gałąź cywilna techu jest dla AI NIEWIDZIALNA — nie tylko arkologie.** ZMIERZONE na obu archetypach: `researchQueue` Industrialisty (14 pozycji) i Expansionisty (15) zawierają **ZERO** technologii z gałęzi `biology` i `civil`. Nieosiągalne na zawsze: **`hydroponics`**, **`bio_recycling`**, **`food_synthesis`** (biology) oraz **`arcology`**, **`megastructures`** (civil). Za nimi stoją: `synthesized_food_plant` (food 6, wymaga `food_synthesis`), **`arcology_building` (housing 32 + food 5, wymaga `arcology`)** i **`orbital_habitat` (housing 80, wymaga `megastructures`). AI jest trwale ograniczone do zestawu tier-0: `colony_base` (16), `habitat` (12), `farm` (10 food), `well`. ⚠ **Bez ścieżki obejścia**: `EmpireResearchSystem._tickEmpire` idzie ściśle `queue[state.queueIndex]` i przechodzi w idle po wyczerpaniu — **żadnego fallbacku poza kolejką** (zweryfikowane w źródle). | 🟠 **OTWARTY — FOLLOW-UP PO S4 (decyzja właściciela 2026-09-02), NIE blokuje.** Ta sama klasa co hydroponika z §10.7: **preferencja budynku nie ma czego preferować, dopóki technologia nie jest w kolejce** — dlatego kolejność jest wymuszona: najpierw KOLEJKA BADAŃ AI, potem cokolwiek, co z niej korzysta. ⚠ **NIE wiąże do ~100 pop** (kontrola Sargas: 2 obsadzone farmy żywią 103 pop, a housing i tak podąża za populacją — **236**); wiąże POWYŻEJ tej skali i jest drugim wyzwalaczem tripwire'a **237**. ⚠ Zakres do wyceny osobno: dopisanie techów cywilnych do kolejek jest zmianą TEMPA rozwoju AI (koszt badań konkuruje z warp/mining), więc ma własny pomiar, nie jest higieną. |
| **239** | 🔴 **Kurier AI dostaje trasę do placówki w INNYM układzie i zamarza NA ZAWSZE — a jego etat trasy blokuje budowę następcy.** Trzy fakty składowe, każdy prawdziwy osobno: (1) `EmpireLogisticsSystem._runDispatcher:239-241` dobiera placówki po WŁAŚCICIELU i ZŁOŻU, **bez terminu układu** (linia z **153**); (2) `dispatchOnMission` przepuszcza cel międzyukładowy, bo **AI jest ZWOLNIONE** z `_missionTargetOutOfSystem` (D-SS5b — świadomy dług, tu przedstawia rachunek); (3) `VesselManager._updatePositions:2461-2472` (guard W3-4b) słusznie NIE dokuje do obcego ciała: `dockedAt=null`, `phase='orbiting_body'`. Po tym w `_advanceRouteCourier` **żadna z trzech gałęzi nie może już nigdy dopasować** (IDLE chce `docked`, LOADING chce `dockedAt===outpostId`, RETURNING chce `phase==='returning'`), a watchdoga nie ma. ZMIERZONE A/B na JEDNYM boocie (`probe-nt-route-ab.mjs`; dwie trasy identyczne poza układem placówki): trasa w układzie stolicy — `delivered 18`, stolica Nt **0 → 234** (= 18 × 13, co do sztuki), placówka drenuje 5000 → 4766; trasa międzyukładowa — kurierzy `dockedAt=null` **niezmienieni przez 15 gy**, placówka **5000/5000 bez ruchu**, guard krzyknął 2× (`vesselSystemId:sys_061 targetSystemId:sys_001 missionType:'logistics'`). Martwa trasa zjada `couriersPerRoute` = 2 kadłuby, a `built` **stoi** (4 przez cały przebieg), bo trasa raportuje się jako obsadzona. | 🔴 **OTWARTY — F1 PODPISANE** (`NT_LINK_PLAN.md`, C1). ⚠ Na żywo (`GATE-S4-fresh-gy60`, paste właściciela): trzy trasy cross (`entity_403`/`401`/`490` — sys_063 ×2, sys_023), **6 z 10 kadłubów** w dokładnie tej pozie. |
| **240** | 🟠 **Guard W3-4b zapobiega FAŁSZYWEMU dokowaniu, ale NIC nie odzyskuje statku — i nie dotyczy to wyłącznie `logistics`.** Statek, który przyleciał do ciała spoza swojego układu, zostaje `orbiting` + `dockedAt=null` + `phase='orbiting_body'` i **żaden mechanizm w `src/` nie zdejmuje go z tej pozy** (grep czysty; jedyny kandydat-lekarstwo, `EmpireLogisticsSystem._sendCourierHome:675`, jest wołany WYŁĄCZNIE ze sprzątania po zniszczonej koloni). Dla GRACZA klasa jest zamknięta o szczebel wyżej — `_missionTargetOutOfSystem` odmawia PRZED startem (D-SS5, **138**/**142**) — więc gracz do tej pozy nie dochodzi; zwolnienie D-SS5b zostawia ją otwartą dla AI. ⚠ **Odzysk MUSI kluczować się na ZEGARZE MISJI** (`now >= returnYear lub arrivalYear` przy braku postępu), nie na samej pozie: `in_transit`/`orbiting` + `dockedAt=null` to TAKŻE normalny stan statku W LOCIE — zmierzone, patrz **244**. | 🟠 **OTWARTY — F2 PODPISANE** (`NT_LINK_PLAN.md`, C2). Dziś obserwowana jest JEDNA poza (239); reguła na zegarze pokrywa obie, jeśli druga kiedykolwiek się pojawi. |
| **241** | 🟠 **Dwie PODPISANE decyzje wykluczają się nawzajem: ekspansja jest CROSS-SYSTEM, logistyka jest IN-SYSTEM.** `EmpireStrategySystem:230-243` — wyjście poza układ macierzysty to **nagroda za `warp_drive`** (S3.2 S3, Wariant A). `EmpireLogisticsSystem:52-58` — kurier jest in-system, a **silniki warp są WYKLUCZONE Z PROJEKTU** (S3.2 S1), z dobrym powodem: silnik warp wymaga `warp_cores`, te wymagają Nt, po które kurier miał lecieć — **zamknięte koło**. Szwu nikt nie spiął ⇒ **AI zakłada kopalnie tam, dokąd jego własna logistyka nie sięga**. ZMIERZONE na żywo: pięć placówek emp_001 trzyma **≈ 37,7 tys. Nt**, stolica **0**; `quantum_cores {Si 6, Nt 4, Hv 4, Xe 3, Ti 2, Li 2}` + `antimatter_cells {Nt 4, Xe 4, Hv 3, Li 2}` + `warp_cores {QC 2, AC 2, Ti 8}` ⇒ **16 Nt na jeden `warp_core`**. ⚠ Drugi, NIEZALEŻNY powód, dla którego zdobycz nie ma jak wrócić: **243**. | 🟠 **OTWARTY — to DECYZJA ZDOLNOŚCIOWA, nie poprawka.** F3 (kurier warp) / F4 (nie zakładaj, czego nie obsłużysz) / F5 (przepływ abstrakcyjny) **NIEPODPISANE 2026-09-03**; traktowanie jak S1/S4a — **najpierw TABELA POMIAROWA, potem podpis**. Projekt pomiaru (zaprojektowany, NIE uruchomiony): `NT_LINK_PLAN.md` §6. |
| **242** | ⚪ **Dwie NIEZGODNE sygnatury pod jedną nazwą `receive`.** `ResourceSystem.receive(gains)` przyjmuje **OBIEKT** `{res: qty}` (`:177`), a fasada `StationDepot.receive(resId, qty)` — **dwa argumenty**. Wywołanie w złej konwencji nie rzuca i nie ostrzega: `Object.entries('Nt')` iteruje ZNAKI, więc zapis po cichu nie następuje, a odczyt zwraca 0. Złapane **ODCZYTEM ZWROTNYM w sondzie** (zasiew 5000 Nt → `getAmount` = 0) i kosztowało jeden CAŁKOWICIE JAŁOWY przebieg pomiarowy, w którym gałąź kontrolna mierzyła pustą placówkę i wyglądała na wynik. | ⚪ **OTWARTY — kosmetyczny dla gry, realny dla PRZYRZĄDÓW.** Wniosek procesowy waży tu więcej niż poprawka: **każdy zasiew fixture'u czyta się z powrotem produkcyjnym akcesorem** (rodzina `probe-overrides-need-readback`). |
| **243** | 🟠 **Placówki AI są STRUKTURALNIE wykluczone z warstwy handlu — więc warstwa 1 NIE MOŻE zastąpić kuriera nigdy.** `CivilianTradeSystem:88` wymaga `_hasSpaceport(colony)` (`:750` — aktywny budynek z `isSpaceport`), a placówka dostaje przy bootstrapie **dokładnie jeden** budynek autonomiczny (`bootstrapAutonomousOutpost`) i **portu nie dostanie już nigdy**, bo `ColonyAutoExpander._managedColonies()` **odsiewa `isOutpost`** — po założeniu placówką nie zarządza nikt. ZMIERZONE na żywo: `port:false` na **wszystkich pięciu** placówkach emp_001 (i na obu placówkach fixture'u A/B). ⚠ **To NIE jest 227**: tam brak `launch_pad` w `BUILD_PRIORITY` blokuje założone KOLONIE; tu wykluczenie następuje o szczebel wcześniej i dotyczy KLASY ENCJI, nie listy priorytetów ⇒ **inny mechanizm, inna naprawa**. Konsekwencja dla osi Nt: R2 (`aiInternalTrade`, default ON) był AKTYWNY przez cały gate i **nie miał jak** ruszyć ani jednej sztuki Nt z placówki. | 🟠 **OTWARTY.** Powiązane: **241** (ta sama zdobycz, drugi powód nieosiągalności) · **227** (bliźniacza cisza handlowa, ale na KOLONIACH — naprawa 227 nie odblokuje ładunku z placówek). |
| **244** | 🟠 **`cargoUsed` jest DENORMALIZOWANYM agregatem bez rekoncyliacji — po wielu kursach zostaje resztka float przy PUSTEJ mapie `cargo`.** `Vessel.js:636/796` utrzymują `cargoUsed` przyrostowo (`+ actual*weight` / `− actual*weight`; `Math.max(0, …)` tnie tylko ujemne), a `vessel.cargo` jest czyszczone (`delete` przy ≤ 0) ⇒ oba pola się rozjeżdżają. ZMIERZONE (`probe-244-cargo-epsilon.mjs`): cykl SYMETRYCZNY daje **dokładnie 0** dla wszystkich rud (`a+x−x===a`) — pierwsza hipoteza obalona; resztkę produkuje dopiero ASYMETRIA WIELOKURSOWA (kształt `_loadByRarity`: przebieg popytu i przebieg rzadkości ładują TEN SAM surowiec, a `_deliverAndDock` rozładowuje go JEDNYM wywołaniem): 8 kursów → **7,105e-15**, a pełny przebieg 60 gy → **1,4210854715202004e-14, czyli wartość z ŻYWEJ GRY co do bitu**. Resztka przewraca **dokładnie dwie** bramki, obie kształtu `cargoUsed > 0`: `EmpireLogisticsSystem:441` (kurier rusza w drogę powrotną z PUSTĄ ładownią, gdy `_loadByRarity` nic nie wziął, a placówka ma jeszcze cokolwiek ⇒ **jałowy kurs**) i `TransportOrderSystem:246` (zlecenie GRACZA uznaje statek za załadowany). | 🟠 **OTWARTY — poprawka w slice'ie F1+F2 jako OSOBNY commit** (`NT_LINK_PLAN.md`, C3). ⚠ **POŁOWA PIERWOTNEJ HIPOTEZY OBALONA POMIAREM: resztka NIE ZAMRAŻA kuriera.** `in_transit` + `dockedAt=null` + resztka to **normalny stan statku W LOCIE** — ta sama poza i **ta sama wartość** wystąpiły na koronnie ZDROWEJ trasie (`delivered 52`, stolica Nt 676 @ gy 60, `spozniony:false`, `zostalo:+1,64`). Cztery kadłuby „home" z żywego paste'u są więc kandydatami na „w locie", nie na „zamrożone"; rozstrzyga odczyt ZEGARA MISJI (L5), bo okno 3 gy przy kadencji ~9 gy/kurs ma wartość oczekiwaną ~1,3 dyspozycji i **zero obserwacji nie jest dowodem**. |
| **211** | ⚪ **„Player retreated” o bitwie, w której gracz nie wystawił ANI JEDNEGO statku — adnotacja odwrotu doklejana do strony, która nie ma czym się wycofać.** `GameScene:2521-2524` wybiera `battle.retreatPlayer` / `retreatEnemy` **wyłącznie** po `result.retreated === sides.playerSide`, nigdy nie pytając, **czym ta strona była**. `BattleSystem.resolveBattle` ustawia `retreated` z progu HP (`<= 20%` i słabiej niż przeciwnik) **agnostycznie wobec tego, czy jednostka to flota, czy PLANETA**, więc obrona budynkowa albo symboliczna 30 HP „wycofuje się”. Odwrót jest czasownikiem floty — siatka obronna nie ma dokąd odejść. | ⚪ **OTWARTY, KOSMETYKA — ale w najgłośniejszym miejscu gry.** ZMIERZONE na live-gate DEFENSE_SCOPE §7.6. **Zero skutków stanowych**: `AutoRetreatSystem._handleBattleResolved:62` wychodzi na `side.type !== 'vessel_group'`, a strona gracza z EAH to `{type:'player'}` ⇒ żaden rozkaz odwrotu nie powstaje. ⚠ **PRE-EXISTING, ale commit 3 ZWIĘKSZYŁ CZĘSTOTLIWOŚĆ**: po zejściu obrony budynkowej do ciała obrońcą częściej jest jednostka budynkowa/symboliczna, czyli dokładnie ta, która nie powinna „się wycofywać”. Rodzina 155/157/162 (prawdomówność narracji bitwy). Naprawa: pytać o KSZTAŁT strony (czy w ogóle są `vesselIds`), nie tylko o jej indeks. `DEFENSE_SCOPE_PLAN.md` §10a |
| **198** | ⚪ **`DSCS._findActiveEncounterContaining` jest de facto publiczny.** Siedmiu konsumentów, z czego **sześciu poza własnym plikiem** (`MovementOrderSystem` ×4, `ProximitySystem`, `FleetSystem`, `ThreeRenderer`), a po Z2 ósmy (`DirectorOffensive`, `DirectorRecall`). Prefiks `_` kłamie o jego roli. | ⚪ **KOSMETYKA, filed.** ⚠ Świadomie NIE zmieniamy nazwy w tym slice'ie: to byłoby dotknięcie ośmiu plików w commicie o czym innym. Nazwać przy najbliższym otwarciu `DeepSpaceCombatSystem`. Odnotowane, bo pytanie „czy trzeba zbudować predykat »statek jest w starciu«" pojawiło się już DWA razy (F130 §8 i Z2) i za każdym razem odpowiedź brzmiała: **on istnieje, tylko nie wygląda na publiczny**. |
