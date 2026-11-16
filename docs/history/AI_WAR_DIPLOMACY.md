# AI, war, diplomacy, colony ownership — arc log (moved from CLAUDE.md)
> Moved verbatim from CLAUDE.md on 2026-11-16 (source lines 1428–1867, 2861–3007, 3634–3832, 5241–5974). Historical record — it may describe code that has since changed or been removed; the authoritative records are the plan docs in docs/design/ named inside each section. Kept in the original language (Polish).

<!-- CLAUDE.md L1428–1867 -->
## W2 — MODEL ROZMIESZCZENIA: budowa to przemysł, rozmieszczenie to ludzie (save **v101**, GATE 1+2+3 PASS — SLICE ZAMKNIĘTY 2026-08-17)

Slice W2 arca WOJNA I POKÓJ 1.0 (workstream B). Plan + rejestr decyzji: `docs/design/W2_PLAN.md`.
Kadłub schodzi ze stoczni **do REZERWY**; dopiero obsadzenie załogą (POP) czyni z niego okręt
w służbie. Commity: `7f606b7` (W2-0 piny szwów) · `7db3043`+`3f35c36` (W2-1 towary wojenne AI) ·
`c4526b6` (W2-2 `serviceState`) · `c9f728e` (W2-3 **bump v100→v101**) · `496067c` (W2-4 załoga) ·
`e84bb72` (W2-5 utrzymanie rezerwy) · `c9062a1` (W2-6 UI) · `adc0fbd` (W2-7 mobilizacja AI).

**Model (jedna oś, jeden predykat).** `vessel.serviceState` ∈ `'active' | 'stored' | 'mobilizing'`
+ `isInService(vessel)` w `Vessel.js` — **JEDYNE** źródło prawdy o służbie (obok `isEnemyVessel`/
`hasWeapons`). `mobilizing` NIE jest służbą. Brak pola = służba (stary zapis, spawn spoza stoczni).
Pola per statek: `mobilizeProgress` (civYears) · `mobilizeTarget` (`'active'|'stored'|null` — stan
`mobilizing` obsługuje OBA kierunki) · `crewLocked` (POP) · `crewStrataLocked` (rozkład po warstwach)
· `crewColonyId` (kolonia-PŁATNIK). Wszystkie przez obie białe listy `VesselManager` serialize/restore.

**Szwy magazynu — DWA i tylko dwa:** `VesselManager._onShipCompleted` (stocznia kolonijna, jedyna
ścieżka AI) i `StationSystem._spawnStationShip` (stocznia orbitalna, jedyna ścieżka okrętów wojennych
GRACZA). ⚠ `EmpireFleetMaterializer` i sonda pierwszego kontaktu tworzą kadłuby `'active'` z pominięciem
obu szwów — **flota zmaterializowana omija model załogi w całości** (filed, W3).

**Zbiór wykluczeń rezerwy** (każdy pinowany osobno): doktryny · `WarSystem._buildPlayerBattleUnit` ·
`EnemyAttackHandler._wreckPlayerVesselsInSystem` · `dispatchOnMission`/`getAvailable` ·
`ProximitySystem` · `TransportOrderSystem` · `_tickRefueling` · `_tickRepair`.

**Załoga (R-B/R-C, decyzje 7-9, 18-19).** `deployVessel`/`withdrawVessel` + `_tickMobilization` w
`VesselManager`; `DEPLOY_DURATION_CIVYEARS = 1.0` (**1.0 civYear = 1 WYŚWIETLANY MIESIĄC**, pinowane
WYKONANIEM przez prawdziwy łańcuch `time:tick`). Płacimy przy ROZKAZIE, oddajemy przy UKOŃCZENIU
wycofania. `CivilizationSystem.commitCrew/releaseCrew/killCrew`:
- ⚠ `removePop(type, count)` iteruje `for (i=0; i<count; i++)`, więc dla 0.4 zabija CAŁEGO człowieka
  (2.5× za dużo). Śmierć załogi jest **akumulatorowa** — nośnikiem ułamka jest `_growthProgress`, więc
  `humans` spada dokładnie o załogę, a inwariant `floor(humans) = Σ strata + bezrobotni` trzyma.
- ⚠ Zwolnienie jest **TYPOWANE** (`crewStrataLocked`). `_lockedPerStrata` dzieli worek z jednostkami
  naziemnymi, a `_distributeUnlock` zdejmuje proporcjonalnie do AKTUALNYCH blokad — nietypowany zwrot
  zjadałby lock garnizonu, którego własne zwolnienie klamruje się do zera (POPy zablokowane NA ZAWSZE).
- ⚠ Płaci **`crewColonyId`**, nie `colonyId`/`homeColonyId` — te są przy śmierci kolonii przepisywane
  na macierzystą GRACZA bez filtru imperium (`_onColonyDestroyed`).
- R-C: `vessel:wrecked` → `killCrew` (przemoc), `destroyVessel` → `releaseCrew` (rozbiórka/zużycie).
  OBA **zerują księgę na wejściu** — to cały mechanizm anty-podwójnego-naliczenia (`MissionSystem` ma
  obie kolejności: załoga-przed-kadłubem `:1631`/`:2417`, kadłub-przed-załogą `:1817`).
- Decyzja 18: `commitCrew` bierze **bezrobotnych, potem EKSMITUJE z najtańszej warstwy** — bez tego
  deploy byłby niewykonalny przy projektowanej równowadze AI `freePops ≈ 0`.

**Utrzymanie (R-A).** `RESERVE_UPKEEP_FACTOR = 0.10`; `getVesselUpkeepCredits` zwraca stawkę
**EFEKTYWNĄ** (5 konsumentów — rabat liczony u każdego z osobna gwarantowałby, że któryś kłamie),
`getVesselBaseUpkeepCredits` = pełna. Sortowanie naliczania: **SŁUŻBA PIERWSZA, potem najtańszy**
(rabat w kluczu odwróciłby ranking i magazyn płaciłby przed obrońcą). ⚠ **Rezerwa NIE zalega**
(decyzja 17); zamiast tego **DEPLOY jest odmawiany, gdy kolonia zalega** — a „zaległość" to
**ZATRZASK po nieopłaconym rozliczeniu, zdejmowany przy najbliższym UDANYM**, przy kadencji raz na
ROK GRY (dosypanie kredytów NIE odblokowuje natychmiast; zmierzone na GATE 2). AI **nie płaci**
utrzymania (decyzja 14, `PHASE5_TODO` przy guardzie `isEnemyVessel`).

**Mobilizacja AI (W2-7).** `DirectorMobilization` + reguła `mobilize_reserve`: trigger
`storedWarshipsAtCapital gte 1`, guardy `empireHasFreeCrew` (pierwszy konsument guardu ze Slice 1)
+ `empireOutgunnedByPlayer` (`getStrength(player) > getStrength(empire)` — **zero autorskich progów**,
parytet zatrzymuje wyścig sam), `roll` 40/30/100 displayedYear, **`delay: 0` OBOWIĄZKOWO**, porcja 2.
⚠ Kurier AI (`hull_small` z ładownią) NIE przechodzi przez tę regułę — budzi go
`EmpireLogisticsSystem._advanceRouteCourier`, w miejscu, gdzie stall był dotąd CAŁKOWICIE cichy.
Intel: `knownReserve` + `knownCrewCapacity` obok `knownMilitary` (bramka `detailed`, odświeżane tą
samą ścieżką co `knownMilitary` — inaczej zamarzłyby). Powiadomienie `NotificationCenter._handleMobilized`
bramkowane na `contact`, nazwa imperium dopiero na `detailed` — **dwa szczeble ujawnienia są zamierzone**.

**⚠ TRZY PUŁAPKI ODKRYTE PRZY OKAZJI (nie zakładaj, że ich nie ma):**
1. `EventLogSystem.TYPE_MAP` NIE miał kluczy `intel`/`combat`/`diplomacy`, choć `CHANNELS` je ma →
   `_log(text, 'combat')` lądował na kanale **system** z poprawnym KOLOREM (18 wywołań M4 P1). Naprawione.
2. `_tickRepair` szuka stoczni po `entry.buildingId === 'shipyard'`, a wpisy `BuildingSystem._active`
   mają `entry.building.id` → **naprawa statków jest martwa u wszystkich**. Pinowane jako luka, NIE
   naprawione (włączenie naprawy floty w całej grze = zmiana balansu, własny commit i pomiar).
3. `_firePending` dereferencuje wpis, który `GameState.set(..., null)` zostawia jako `null` → pierwsza
   reguła z `delay > 0` zabija tik wszystkich kolejnych imperiów. Keeper pinuje `delay: 0` dla CAŁEGO
   katalogu.

Keepery: `deploy_seams` (T1/T2/T4 świadomie odwrócone) · `w2_deploy_model` · `w2_migration_v101` ·
`w2_crew_ledger` 65 · `w2_reserve_upkeep` 27 · `w2_deploy_ui` 23 · `w2_ai_mobilization` 39.
Sweep **136/136 0 FAIL** · `check-i18n` PASS (pl=en=3240).

**GATE 3 (2026-08-17) — pętla AI, live-only, FULL PASS.** Mobilizacja odpaliła SAMA dwa razy (rok
25,35 na `emp_001`, potem `emp_002` w chwili, gdy jego pierwszy kadłub trafił do magazynu), AI
zapłaciło POP za załogę, a potem **parytet uciszył regułę** (`slabszy` → `false`). Rozdział siła /
potencjał / rezerwa widoczny w liczbach i w panelu wywiadu; powiadomienie anonimowe na `contact`
zgodnie ze specyfikacją; kurierzy `dispatched` 4 → 8. Cztery odpowiedzi domknięcia (klauzula źródła,
zagadka przelotu, symetria Rozmieść/Wycofaj, dane do rejestru): `docs/design/W2_GATE3_CHECKLIST.md`
§Domknięcie. **Pięć nowych wpisów rejestru** (`W2_PLAN.md` §Findings filed 11-15), w tym realny
defekt: **pierwszy kontakt jest w KAŻDEJ partii zsynchronizowaną parą sond z tego samego namiaru** —
klucz rzutu bez soli galaktyki (`DirectorRuleMath.js:105`) i `_courseAngle` bez `mixSeed`
(`DirectorFirstContact.js:191-196`) ⇒ oba imperia odpalają na próbie 3 i wchodzą pod 226°/227°
(ZMIERZONE). ⚠ Lekcja wiążąca dalej: **seed strukturalny wymaga rozproszenia w KAŻDYM miejscu, nie
tylko tam, gdzie się o tym nauczyliśmy** — `DirectorRuleMath.js:71-74` ostrzega przed tą klasą wprost.

---

## W3 — OFENSYWNE AI: podbój, który się trzyma i który da się odwrócić (save **v101 bez migracji**, GATE 1+2 PASS, GATE 3 **ZDANY WARUNKOWO** — SLICE ZAMKNIĘTY 2026-08-18)

Slice W3 arca WOJNA I POKÓJ 1.0. Plan + rejestr decyzji (D1-D7) + **51 findings**:
`docs/design/W3_PLAN.md`; checklisty `W3_GATE{1,2,3}_CHECKLIST.md`. ⚠ **D1 SPLIT: pokój terytorialny
ODSZEDŁ do W4** — stół pokojowy przed podbojem wyceniałby transakcję, której towar nie istnieje.
Commity: `ea05d8f` (W3-0 keeper szwów) · `efa8f85` (W3-1 odwracalny przerzut własności) · `d5a9b8d`
(W3-2 DSCS/VCS księgowane) · `1e57d1b` (W3-3 dominacja przeżywa wczytanie) · `4724e46` (W3-4
`ORDER_TYPES.attack`) · `369adfc`+`cb815cd` (W3-4b cross-system) · `a7b84bd`+`9a96382` (W3-4c
dźwignia rajdera) · `07c1087`+`61bdffe`+`807bd85`+`994935e` (W3-5/5b wybór celu + naprawa montażu) ·
`0eae716` (W3-6 desant AI) · `cced9df` (W3-7 widoczność) · `6e14b34`+`2eb9bf5` (W3-6b) ·
**`814fb38` (W3-8 retirement)** · W3-9 (docs).

**Co dowiózł (mechanizm jest MNIEJSZY niż wygląda, warunki wstępne WIĘKSZE — ten sam kształt co W2):**
- **Podbój ZOSTAJE** — `ColonyManager.transferColony` przerobiony na **odwracalny przerzut własności
  w miejscu** (lustro `captureColonyForPlayer`: kolonia zostaje w `_colonies` z pięcioma podsystemami,
  zmienia się `ownerEmpireId` + hexy). Owner ruling **D7: przegrana jest ODWRACALNA, SYMETRYCZNIE**.
- **Bitwy DSCS/VCS wreszcie księgowane** (`WarSystem.recordBattle` = jedyny księgowy) — trzecia,
  cicha ścieżka zamknięta.
- **`ORDER_TYPES.attack`** (`MovementOrderSystem._issueAttack` + `OrderService.issueAttack`) — producent
  misji, którego brakowało CAŁEMU istniejącemu potokowi orbitalnemu (`EnemyAttackHandler` bramkuje na
  `mission.type='attack'`, a jedynym producentem był cheat). Bramka **`isInService`** (D6, reason
  `vessel_in_reserve`) + bramka układu (`target_other_system`).
- **Uderzenia CROSS-SYSTEM przez PRAWDZIWĄ podróż** (W3-4b) — po tym, jak GATE 2 wyd. 1 został
  PRZERWANY na realnym defekcie klasy **„globalne id ≠ położenie"**. NEW `src/utils/SystemScope.js`
  (`systemIdOf`/`isSameSystem`, fail-open) + `WarSystem.hasPlayerPresenceInSystem` (koniec
  obrońcy-widma walczącego rok świetlny dalej).
- **`strike_player_target`** (`src/systems/director/DirectorOffensive.js` + katalog
  `DirectorRuleData`) — **AI wybiera cel SAMO**: zasięg z `InfluenceMap` (powłoka), wartość z
  `TerritoryService.getSystemDevScore`, siła z `ThreatAssessment`, eskadra 2+ przeciw obronie, dobór
  kadłubów po **`warpFuel.max > 0`** (D4 — NIGDY po id szablonu), rzut solony `GALAXY_SEED`,
  **`delay: 0` obowiązkowo**. Drabina odmów jest PRAWDOMÓWNA (`no_target_in_reach` /
  `no_warp_capable_hull` / `insufficient_squadron` / `all_orders_rejected`).
- **Desant AI z bitew `vessel_group`** (`InvasionSystem._onVesselGroupVictory`) — próg wyprowadzony
  z KADŁUBÓW zamiast abstrakcyjnej siły; frakcja naziemna najeźdźcy przestała być ludzka
  (`GroundUnitFactory` mapuje id imperium → frakcja nie-ludzka przez `mixSeed`).
- **Gracz WIDZI atak** (W3-7): `invasion:*` → `NotificationCenter` (dzwonek + Dziennik kanał Walka +
  auto-slow), stempel `empireId: 'player'` naprawiający TRZECH filtrujących konsumentów, **natywny
  `alert()` skasowany**, i18n S26 PL+EN.

**W3-8 — RETIREMENT (`814fb38`).** Wycofana CAŁA warstwa abstrakcyjnej floty: `MilitaryAI`, `EconAI`,
`EmpireFleetMaterializer`, `EmpireRegistry.spawnFleet`/`moveFleet`, gałąź `unifiedAggregator`
(+ flagi `FEATURES.fleetMaterialization`/`unifiedAggregator`), `spawnEnemyFleet`, martwe nasłuchy
`empire:fleetMoved`/`empire:fleetMaterialized`. Powód (korekta C-3): **zero wejść w normalnej grze** —
`MilitaryAI`/`EconAI` scorowały 0 od zawsze (`createEmpire` wycina `resources`, `updateMilitaryPower`
to no-op), więc dług z W2 („wycenić załogę floty zmaterializowanej") **rozpuścił się, nie został
spłacony**. ZOSTAJĄ: czytelniki `empire.fleets` (stary zapis musi się wczytać), `spawnEnemyRaider`,
`spawnEnemyAttack`, `launchInvasion`, `KOSMOS.debug.aiWarships`. `war_seams_smoke` T2 mierzyło CISZĘ
martwej pętli → przeniesione na **pin źródłowy T2b** (pętli NIE MA + kontrola pinu: Director dalej
tika).

**⚠ TRZY WARUNKI GATE 3 — każdy z osobną, przypisaną PRZYSZŁĄ pracą** (`W3_PLAN.md` §Findings 49-51;
numeracja orkiestratora 42-44): **(49)** katalog AI (`SHIP_TEMPLATES`) NIE MA roli transportowej ⇒
`no_drop_capable_hull` to jedyna osiągalna odpowiedź złącza bitwa→desant (`docs/audit/AI_DROP_HULL_AUDIT.md`;
⚠ korekta 2026-10-02: **zamknięty po stronie DANYCH** — `transport_assault` od `0e6ea0d`, nikt go nie zamawia ⇒ reszta = **201**)
· **(50)** desant AI biegnie na modelu **LEGACY** (`GROUND_UNITS`), nie archetypach — inny balans
(60 HP/12 atak vs 15 HP/7), brak morale/zaopatrzenia, sprzeczne domyślne morale ⇒ jednostka rozpada
się po pierwszym trafieniu, chyba że grę przeładowano (`docs/audit/GROUND_UNITS_AUDIT.md`; ⚠ korekta 2026-10-02:
znikały OBIE strony; przyczyna — Finding 65 — zamknięta w AI GARRISON G1, a 50 **zastąpiony przez D7**) ·
**(51)** **desant AI NIGDY nie kończy się przejęciem kolonii** — `_tryPlayerCapture` nie ma lustra po
stronie AI; §4/§5 gate'u zweryfikowane OBEJŚCIEM przez `transferColony`.

**⚠ Trzy lekcje wiążące dalej** (poza tymi z W2): **globalne id ≠ położenie** — encja ma jedno id
w całej galaktyce, ale współrzędne są WEWNĄTRZ układu (gwiazda w (0,0)); porównuj układy, nie id ·
**„skonstruowany ≠ zamontowany"** — reguła żyła i była oceniana, ale brak wiersza w bloku lokatora
`GameScene` czynił ją NIEWIDZIALNĄ dla gate'u (wszyscy konsumenci czytają przez `?.`, więc **nic nie
krzyczy**); keeper musi pinować **SPOSÓB SKŁADANIA SCENY**, nie zachowanie przy gotowej scenie ·
**księgowy musi domknąć własne księgi, ZANIM przemówi** — `recordBattle` emitował `battle:resolved`
przed `_updateOrbitalDominance`, więc bramka desantu czytała świat SPRZED ogłaszanej bitwy.
⚠ I reguła instrumentu: **NOWY POWÓD ODMOWY DOŁĄCZA DO `DebugLog.TRACKED_EVENTS` W TYM SAMYM
COMMICIE** — dwa razy w W3 gate zmierzył CISZĘ tam, gdzie system mówił.

**⚠ STANDING LESSON (proces, nie kod):** pisanie plików przez CC — **także raportu z audytu
read-only** — przeładowuje kartę gracza przez **Live Server** i **resetuje stan runtime do ostatniego
zapisu**. Audyty uruchamiamy, gdy gracz nie ma otwartej karty (albo gracz wie z góry, że karta
się przeładuje); **CC nie pisze w trakcie gate'u** (to ta sama reguła co „gate nigdy równolegle z CC",
teraz z zapisanym mechanizmem: konflikt to file watcher, nie uwaga).

Keepery W3: `w3_dominance_persist` 16 · `w3_attack_dispatch` 35 · `w3_cross_system_attack` 42 ·
`w3_raider_lever` 24 · `w3_target_selection` 30 · `w3_foreign_arrival_gate` 5 · `w3_director_mounting`
17 · `w3_ai_invasion` 23 · `w3_attack_visibility` 42 · `w3_battle_booking` 19 · sondy
`probe-w3-seams`/`probe-w3-targets`. Sweep **148/148 0 FAIL** (stan W3; dziś **165/165** — patrz blok BRAMKA WŁASNOŚCI CZĘŚĆ II) · `check-i18n` PASS.

**NASTĘPNE (osobne, nowe sesje — NIE w tym wątku):** **W4 — pokój terytorialny** (charter
`WAR_BACKBONE.md` §6a + addendum po W3) · nowy gate **„AI przejmuje kolonię"** (Finding 51) ·
**katalog transportowca AI** (Finding 49) · slice **GROUND** (S12 morale → R13 RNG → pule desantu na
archetypy, Finding 50).
⚠ **Stan 2026-10-02:** katalog ma `transport_assault` od `0e6ea0d` (reszta = **201**); slice GROUND
zastąpił arc **AI GARRISON** — S12 (morale) ✅ w G1, pule desantu na archetypy = G2b (D7). Sekcja na końcu pliku.

---

## AI_CAPTURE — podbój, który AI domyka SAMO (save **v101 bez migracji**, GATE 1 + GATE 2 oba PASS — SLICE ZAMKNIĘTY 2026-08-20)

Slice arca WOJNA I POKÓJ, workstream B. Plan + 9 decyzji + rejestr: `docs/design/AI_CAPTURE_PLAN.md`;
audyt wejściowy `AI_CAPTURE_AUDIT.md`; checklisty `AI_CAPTURE_GATE2_CHECKLIST.md`.
Commity: `990255f` (AC-7) · `bb614ed` (AC-8) · `105b873` (AC-9) + wcześniejsze AC-0…AC-6.

**Jedno zdanie:** W3 dowiózł uderzenie (AI wychodzi z domu, wygrywa orbitę, zrzuca wojsko), ale
**zdobycz nie zmieniała właściciela z własnej inicjatywy AI**. Ten slice domknął ostatni krok pętli.

**Co odblokowało pętlę** (mechanizm istniał — brakowało intencji, bramek i księgowości):
- **AC-4** — jednostka desantowa dostała **cel terytorialny** (marsz na `capitalBase`, fallback:
  najbliższy kafel z budynkiem). ⚠ To rozwiązało **deadlock**: dotąd `_tickCombatAI` celował wyłącznie
  w ŻYWĄ jednostkę gracza i przy `if (!best) continue` stawał, więc warunki „armia wybita" i „stolica
  zdobyta" były **wzajemnie wykluczające się**.
- **AC-5** — symetryczny predykat obrońcy: blokuje **każda żywa** jednostka (był filtr `role==='military'`).
- **AC-6** — ciało **bez stolicy** (placówka) stało się zdobywalne (retire bramki `if (!capital) continue`).
- **AC-7** — **jedna kampania na ciało** (koniec podwójnych fal, jedno `colony:captured`).
- **AC-8** — higiena po utracie + `game:over` `reason:'conquered'` (D5 + **D9=W3**, karencja 12 civY).
- **AC-9** — gracz **widzi**, że traci teren (`tile:ownerChanged` → dzwonek + Dziennik/Walka).
- **AC-3 (D8)** — **partia zaczyna się PUSTA**: zero jednostek startowych po obu stronach. To warunek,
  przy którym symetryczny predykat AC-5 jest uczciwy — nikt nie dostaje wojska za darmo.

**GATE 2 PASS w całości (2026-08-20):** §1 księga · §2 widoczność · §3 higiena · **§4-A rekolonizacja
realnie osiągalna** (zmierzone end-to-end trasą warp: `getPlayerColonies()` 0 → 1, statek skonsumowany) ·
**§4-B ekran końca gry pada** („CIVILIZATION DESTROYED", tekst o **podboju**, nie o wymarciu) ·
§5 regresja odbicia (potwierdzona wcześniej dwukrotnie: W3 GATE 3 §5 + GATE P0 §7).

⚠ **§3 kosztował osobny blok pracy i to był dobry koszt** — ujawnił, że higiena AC-8 **nie przeżywa
wczytania zapisu**. Domknięte arciem **BRAMKA WŁASNOŚCI, blok P0** (sekcja niżej).

⚠ **ŚWIADOMIE OTWARTE (nie blokuje zamknięcia):** **Finding 49** — katalog AI **nie ma kadłuba
transportowego** (⚠ korekta 2026-10-02: ma — `transport_assault` od `0e6ea0d`; **nikt go nie zamawia**,
reszta = **201**), więc *produkcyjne* wejście AI w desant pozostaje zamknięte (gate wchodził dźwignią
`WarOverlay force_invasion`) · **Finding 50** — desant AI biegnie na modelu **LEGACY**, nie archetypach ·
✅ **Finding 111 (P1)** — `canReverseFate` liczył *istnienie* kolonizatora, nie *zdolność*;
**ZAMKNIĘTY 2026-08-20** (sekcja niżej).

⚠ **Trzy drobne findingi z domknięcia GATE 2** (żaden nie blokował): **112** ekran „CIVILIZATION
DESTROYED" (`UIManager._drawGameOver:2412-2475`) **nie ma pojęcia zawijania** — wszystkie pięć napisów
to gołe `fillText` w ramce o zaszytych `DW=420, DH=180`; nowy tekst o podboju ma **100 zn. wobec 49**
najdłuższego dotychczasowego, stąd przepełnienie (⚠ helper `_wrapText:2800` istnieje **w tej samej
klasie**, nigdy niepodłączony; ⚠ `DH=180` zostawia ~20 px zapasu, więc zawinięcie zderzy się z linią
niżej) · **113** (wpis **samodzielny**, nie dodatek do 112) ten sam ekran ma **zahardkodowany polski**
(`Czas przetrwania…` `:2460`, `NOWA GRA` `:2472`) — gracz EN widzi polskie napisy w jednym
z najbardziej pamiętanych miejsc gry. ⚠ **MARTWY KĄT NARZĘDZIA:** `check-i18n` pyta „*czy klucz
użyty w `t()` istnieje w PL i EN*", a **nie** „*czy każdy widoczny napis przechodzi przez `t()`*" —
literał w `fillText` jest dla niego **niewidzialny**, więc bramka przechodzi mimo polskiego UI.
⇒ kandydat na poprawkę **samego narzędzia** (wykrywanie literałów w `fillText`/`strokeText` poza
`t()`), nie tylko tego ekranu; ⚠ zasięg w reszcie UI **niezmierzony** · **114** `debugLog.query` pusty przy
działającym ekranie: mechanizm **sprawny** (kształt zapytania OK, oba zdarzenia w `TRACKED_EVENTS`,
`clear()` nie leży na tej ścieżce) ⇒ przyczyna **środowiskowa**.
⚠ **REGUŁA Z 114: `debugLog` NIE przeżywa restartu sceny** (`GameScene:1914`) — odczyty gate'u zbierać
w tej samej partii i karcie; **nie opierać kryterium PASS na odczycie, który może być pusty z powodu
cyklu życia sceny**.

**Kolejność dalszych prac (ustalona z właścicielem 2026-08-20):** **1.** ~~Finding 111~~ ✅ **ZROBIONE** →
**2.** część II `COLONY_OWNERSHIP_GUARD_PLAN` (D1-D6) → **3.** reszta rejestru (97, bug mapy 108-110,
przepełnienie tekstu na ekranie końca gry).

---

## BRAMKA WŁASNOŚCI KOLONII — blok P0: wczytanie nie oddaje gracza koloni wroga (save **v101 bez migracji**, GATE P0 §1-§7 PASS — BLOK ZAMKNIĘTY 2026-08-20)

> ⚠ **CZĘŚĆ II (D1-D6 + Finding 97) JEST ZAMKNIĘTA — sekcja niżej.** Ten blok opisuje wyłącznie P0.

Slice **przekrojowy, NIE należący do AI_CAPTURE**. Plan + 10 decyzji + rejestr:
`docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md`; audyt read-only: `docs/audit/COLONY_OWNERSHIP_GATE_AUDIT.md`;
checklista: `COLONY_OWNERSHIP_GATE_P0_CHECKLIST.md`. Commity: `e86c091` (OG-0 keeper szwów) ·
`0085a37` (OG-2 naprawa) · `a03be51` (docs) · `c4ab33b` (checklista) · `6796617` (fix po §6).

**Jedno zdanie:** gra ma bramkę **„KTÓRA kolonia"** i nie ma bramki **„CZYJA"** — `switchActiveColony`
sprawdza ISTNIENIE (`ColonyManager.js:262-264`), a guard `window.KOSMOS?.buildingSystem !== this`
(`BuildingSystem.js:99-102`, 35 wystąpień w repo) sprawdza AKTYWNOŚĆ. **Żadne nie pyta o właściciela.**
⚠ Dziura jest **PRE-EXISTING** (guard stoi w pierwszym commicie repo, `9951d5e`, 2026-03-01); warunkiem
koniecznym osiągalności była **W3-1** (`efa8f85` — przejęta kolonia ZOSTAJE w `_colonies`), **nie AC-8**.
⚠ **Gracz nie „kradł sobie gospodarki" — KARMIŁ gospodarkę wroga**: `_activateBuilding:755` rejestruje
producenta na WŁASNEJ instancji koloni, więc kopalnia była płacona z magazynu wroga i produkowała do
magazynu wroga; `switchActiveColony` przecelował tylko HUD.

**Blok P0 (podpisany 2026-08-19, wdrożony i zweryfikowany 2026-08-20) — zamknięcie ścieżki WCZYTANIA:**
- **P0-A=W1** — `ColonyManager.restore` **nie wiąże już niczego** (było: uzbrojenie `_activePlanetId`
  z samej flagi `isHomePlanet` + wiązanie **DWÓCH z pięciu** wskaźników, ślepo na własność, wbrew
  inwariantowi `switchActiveColony` „NIGDY stale-inna-kolonia"). Zapisany `activePlanetId` to teraz
  PODPOWIEDŹ (`_pendingActivePlanetId`). NEW **`resolveActiveColonyAfterRestore()`** — drabina:
  zapisana-jeśli-gracza → dom-jeśli-gracza → dowolna kolonia GRACZA → `_detachActiveColony`.
  Wołane z bloku odroczonego `GameScene`, **wyjętego spod `if (homePlanetId)`**.
  ⚠ **KOLEJNOŚĆ JEST KONTRAKTEM:** blok biegnie **PO** `relinkColoniesAfterRestore` (`GameScene:2046`,
  synchronicznie) i jako **JEDYNE** miejsce w łańcuchu ładowania widzi `ownerEmpireId`.
- **P0-B=W1** — własność zostaje **WYPROWADZANA** z `empires[].colonies` (`EmpireColonyBootstrap.js:543`
  mówi to wprost). **Bez zmiany formatu zapisu.**
- **P0-C=W2** — `transferColony` **czyści** `colony.isHomePlanet` **PO** snapshocie `wasHomePlanet`
  (inaczej „Stolica utracona" cicho degraduje do „Kolonia utracona"); `captureColonyForPlayer`
  **przywraca** flagę przy odbiciu WŁASNEJ stolicy. Dwa **podpisane** skutki uboczne: ex-dom przestaje
  być niezniszczalny; wpada w gałąź heal-up przy restore (już dziś ślepą na własność dla kolonii AI).
- **P0-D=W1** — `removeColony:667` miał **NIEUTWARDZONEGO BLIŹNIAKA** fallbacku AC-8 i był **ŻYWY**:
  test PRZYNALEŻNOŚCI (`_colonies.has`) zamiast własności ⇒ po przejęciu stolicy zniszczenie
  **dowolnej innej** aktywnej koloni gracza (kolizja, wyrzucenie, `entity:removed`) przepinało wszystkie
  pięć wskaźników na kolonię WROGA. Drabina wyciągnięta do `_pickFallbackActiveColony(excludeId)` —
  jedno źródło dla **trzech** ścieżek (utrata / zniszczenie / wczytanie).

**⚠ GATE P0 §6 PADŁ i to była wartość gate'u.** Kryterium „**nic nie rzuca wyjątkiem**" (nie „panel jest
pusty") złapało crash **co klatkę**: `GroundUnitPanel._drawActions` → `ColonyManager._canRecruitMoreUnits`
(`colony.planetId` przy `colony === null`), a za nim **drugi, ukryty**: `_getMaxGroundUnits`
(`colony.civSystem`, wołany z `GroundUnitPanel:623`). Naprawione w `6796617`. **Żaden nie był defektem
P0** — to ta sama KLASA w pliku, którego P0 nie dotykał.
⚠ **LEKCJA WIĄŻĄCA DALEJ:** `mgr?._method?.(nullColony)` — **opcjonalne łańcuchowanie chroni ODBIORNIK,
nigdy ARGUMENT**. Guard należy do **helpera**, bo to helper jest kontraktem; poprawka wyłącznie
u wołającego zostawia minę następnemu.
⚠ **`GroundUnitPanel` i `FleetManagerOverlay` IMPORTUJĄ SIĘ pod node** (inaczej niż `GameScene`/
`ColonyOverlay`), a `getColony` jest **wstrzykiwane do konstruktora** ⇒ tę klasę paneli da się pinować
**WYKONANIEM** (prawdziwa pętla `draw()` na atrapie ctx z `getColony: () => null`).

**Keepery:** `colony_ownership_seams` 11 (⚠ trzy szwy świadomie odwrócone; **S4 ŻYJE** — `switchActiveColony`
przyjmuje kolonię AI, to **D1**) · `colony_ownership_load` 33 (⚠ **T8 pinuje ŹRÓDŁOWO SPOSÓB SKŁADANIA
SCENY**: wywołanie istnieje, stoi **PO relinku**, nie jest zagnieżdżone w bramce — pin kolejnościowy
**dowiedziony MUTACJĄ źródła**, bo bez niego przeniesienie wywołania przed relink odtwarzało defekt
w całości przy **zielonych** keeperach) · `zero_colony_panels` 11 (wykonaniowy).
Sweep **159/159 0 FAIL** · `check-i18n` PASS.

**⬜ NIEPODPISANE i NADAL ŻYWE (D1-D6, osobny podpis):** **D1** ścieżka klikana (4 wejścia:
`GameScene:3287-3295` `system:switched` bierze `cols[0]` z `getAllColonies()` filtrowanego tylko po
`systemId` · `BottomContext:423` · `GameScene:5366` · `EventLogOverlay:348`) · **D5** przynależność kafla
(⚠ `_build` **zero** odwołań do `this._grid` w `:796-1015`; stan „mój portfel, cudzy kafel" jest żywy
**już dziś** przez zaprojektowany podgląd obcej planety — `show({colonyId})` nie woła
`switchActiveColony`, a pasek budowy bramkuje tylko `!isPreview`) · **D2/D3/D4/D6**.
⚠ **Klasa A to nie „34 miejsca"**: **9** żywych bramek intencji gracza · **8** systemowych (termin
własności byłby tam **błędem kategorii**) · **17** martwych (zdarzenie bez emitenta).

**Findings 69-114** (rejestr w planie). ⚠ **NAJCIĘŻSZE jest 111 (P1, niżej); 97 jest drugie i też ZMIERZONE:**
🔴 **kolonia WROGA płaci za utrzymanie floty gracza** — `VesselManager._resolvePayHomeId:2062-2067`
filtruje **tylko** `!col.isOutpost`, bez terminu własności, z fallbackiem na nigdy nieprzecelowywany
`homePlanet`; po W3-1 zdobycz zostaje w `_colonies`, więc płaci. Zmierzone: 300 Kr/rozliczenie,
5000→3094 przez 80 lat, `unpaidYears` = 0. ⚠ **Osiągalne przy ŻYWYCH koloniach gracza** (statek
w drodze do koloni, która zostaje przejęta) — nie chowa się w scenariuszu D9. **Ta sama rodzina co
D1-D6; zakres NIEROZSTRZYGNIĘTY** — do decyzji przy podpisywaniu części II planu.
**98-105** (audyty kolonizacji) — bez decyzji o zakresie; m.in. `createMission('colonize')` ma **ZERO**
wołających produkcyjnych (100), a trasa „obca" blokuje POPy załogi **na zawsze** (102) i osierocą
jednostki z `troop_bay` (107) — ✅ **102 i 107 zamknięte 2026-10-30** (`fa69ae8`, sekcja „ZUŻYCIE STATKU POZA
WALKĄ” na końcu pliku). Raporty: `docs/audit/COLONIZE_PATH_ZERO_COLONY_AUDIT.md` ·
`docs/audit/WARP_COLONIZE_ROUTE_AUDIT.md`.
🔴 **106 — TRASA ZADOKOWANA JEST PRZY ZERZE KOLONII ŚLEPYM ZAUŁKIEM.** Bramka przechodzi
(`canLaunchColony` `ok:true`, `canExecute` `{ok:true}`, przycisk **aktywny**), a klik umiera cicho
w `MissionSystem._launchColony:648`, bo `_detachActiveColony` wyzerował `missionSystem.resourceSystem`.
Zmierzone: misji przed/po **0/0**. ⚠ **Unieważnia werdykt 1** poprzedniego audytu (sprostowanie wpisane
w jego nagłówku). ⚠ **LEKCJA WIĄŻĄCA: przy pytaniu „czy X działa" BRAMKA NIE JEST ODPOWIEDZIĄ** —
dowodem jest SKUTEK (`getPlayerColonies()` 0 → 1, statek znika z rejestru).
🔴 **111 (P1, NAJCIĘŻSZE) — `canReverseFate` liczy statki, ktore NIE MAJA JAK NIC ZROBIC ⇒ gra,
ktora NIGDY sie nie konczy.** `PlayerViability.js:57` sprawdza istnienie kadluba z habitatem i **zero**
stanu (dok/orbita/misja), a `_tickPlayerViability` (`ColonyManager.js:314`) zeruje licznik karencji przy
kazdym tiku, dopoki `state.ok`. Zmierzone trzy konfiguracje: **w locie/po warpie** 0 → 1 ✅ ·
**zadokowany przy traconej koloni** — `transferColony:838-843` go niszczy, predykat poprawny ✅ ·
**zadokowany gdzie indziej / dryfujacy po `moveToPoint`** — liczony jako ratunek, a nie moze nic ⇒
🔴 **LIMBO bez konca gry**. ⚠ Trzecia konfiguracja to ta, na ktora wlasciciel trafil w normalnej grze.
⚠ D9 stoi na przeslance, ktora opisuje BRAMKE, nie skutek (Finding 106) — to powrot D9 na stol,
nie poprawka. Kandydat na osobny **P1**.
🔴 **108-110 — BUG MAPY STRATCOM, blokuje sterowanie grą** (poza tematem tego arca): **108** zaznaczony
statek warp ukrywa `cluster_switch`, jedyne wejście do widoku układu, a `warp_order_cancel` **nie czyści**
`_selectedWarpShipId` ⇒ pułapka · **109** klik iteruje strefy od końca, hover od początku ⇒ przy
nakładających się gwiazdach **hover pokazuje bliższy układ, klik wybiera dalszy** (15/15 zmierzonych) ·
**110** ikona statku w martwym pasie nad gwiazdą, klik cicho połykany.
⚠ `FleetManagerOverlay` **NIE dziedziczy po `BaseOverlay`** — `_hitTest` z `.find()` tu nie obowiązuje.
✅ **Obejście:** `switchActiveSystem` wołają chipy `MapLabelLayer:541`, Outliner i górny pasek zasobów.
**95/96** to **obserwacje z gate'u, NIEZBADANE**:
**95** statek ze stoczni orbitalnej na koloni WTÓRNEJ po utracie stolicy wychodzi jako **obcy/nieznany
kontakt** i nie trafia na listę rozmieszczenia (⚠ kontekst: `createAndRegister:186-211` **nigdy** nie
stempluje własności, więc stempel wroga musi pochodzić skądinąd) · **96** czy utrata głównej koloni
osierocą stację orbitalną **drugiej** koloni (⚠ `transferColony`, w odróżnieniu od `removeColony`,
**nie emituje** `colony:destroyed`, na którym stoi mechanizm osierocenia z S3.4c). ⇒ **osobny audyt.**

---

## BRAMKA WŁASNOŚCI KOLONII — CZĘŚĆ II: D1-D6 + Finding 97 (save **v101 bez migracji**, GATE OG-1/OG-1b/OG-3 live PASS, GATE 2 headless — ARC ZAMKNIĘTY 2026-08-22)

Domknięcie arca rozpoczętego blokiem P0. **Podpis części II: 2026-08-22** — D1=W2+W1 · D2=W3+W1 ·
D3=W1 · D4=W3+flash · D5=W1 · D6=W2, plus **Finding 97 w zakresie** jako osobny commit.
Plan + rejestr: `docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md`. Commity: `4c928ca` (podpis) ·
`f63ef74` (OG-1 / D5) · `01a1b2d` (OG-1b) · `89c78e7` (OG-3 / D1+D2) · `6973639` (OG-4 / D4) ·
`6423b59` (GATE 2 headless) · `f89c1d2` (OG-5 / D6) · `80adbf2` (OG-3b / Finding 97) · OG-6 (docs).

**Jedno zdanie:** gra miała bramkę **„KTÓRA kolonia"** i nie miała bramki **„CZYJA"**; P0 zamknął
ścieżkę wczytania, część II zamyka **wszystkie cztery pozostałe powierzchnie** — wiązanie, szynę
zdarzeń, panel i rozliczenie okresowe.

⚠ **SKUTEK BYŁ ODWROTNY, NIŻ BRZMI.** Nie „gracz kradnie sobie gospodarkę", tylko
**gracz KARMIŁ gospodarkę wroga**: `_activateBuilding` rejestruje producenta na WŁASNEJ instancji
koloni, więc kopalnia postawiona na związanej koloni wroga była płacona z magazynu WROGA
i produkowała do magazynu WROGA — a `switchActiveColony` przecelowywał tylko HUD.

**Cztery powierzchnie, cztery różne bramki** (i to jest sedno — żadna nie zastępuje pozostałych):

| powierzchnia | bramka | gdzie |
|---|---|---|
| **przynależność kafla** (D5/OG-1) | `_isOwnTile` — `grid.get(q,r) === tile`, **tożsamość, nie współrzędne** | `BuildingSystem._build/_upgrade/_demolish` |
| **kontrola kafla** (OG-1b) | `_isTileControlledByOther` — `tile.owner` z okupacji; **tylko rozbiórka** | `BuildingSystem._demolish` |
| **wiązanie koloni** (D1/OG-3) | odmowa w `switchActiveColony` + **dziewiątka bramek intencji** (D2) | `ColonyManager`, `BuildingSystem`/`FactorySystem`/`CivilizationSystem` |
| **panel** (D4/OG-4) | allowlista + inwariant na górze `_onHit` + wygaszeni producenci | `ColonyOverlay`, NEW `ColonyOrderGuard.js` |
| **rozliczenie okresowe** (Finding 97/OG-3b) | termin własności w `_resolvePayHomeId` **i w jego fallbacku** | `VesselManager` |

**Kanon (D6/OG-5):** NEW `src/utils/ColonyOwnership.js` — **rodzina nazw**, nie jeden przeciążony
predykat: `isPlayerColony(colony)` · `isPlayerColonyId(planetId)` (fail-closed) ·
`isLivePlayerColony` (+`resourceSystem`) · `isManageablePlayerColony` (+`!isPreview && !isOutpost`).
`ColonyManager.isPlayerColony` **deleguje** (~40 konsumentów nietkniętych). Osiem nazwanych kopii
zmigrowanych. **Zero migracji save (v101), zero nowych kluczy i18n poza trzema powodami odmowy.**

---

### ⚠ Reguły, które wychodzą poza ten arc

1. **`node --check` NIE jest testem.** W OG-4 producent trafił w `_drawWorkforceTab` (**legacy V1**),
   podczas gdy żywa jest `_drawWorkforceTableV2` — `ordersOk` było w V2 **używane bez deklaracji**
   i żywa tabela rzuciłaby `ReferenceError` przy pierwszym rysowaniu. Składnia była poprawna.
   ⇒ **W `ColonyOverlay` żyją pary „V1 legacy + V2 żywa"; pin producenta MUSI nazwać ŻYWĄ.**
2. **Pin, który celuje w martwą ścieżkę, świeci na zielono dokładnie tam, gdzie jest defekt.**
   Ta sama runda złapała to tylko dzięki **kontroli pinu**. Każdy pin źródłowy bez kontroli jest
   zgadywaniem.
3. **Predykat opisany w komentarzu ≠ predykat egzekwowany.** `isPlayerColony` przez cztery commity
   miało w dokumentacji ostrzeżenie „bierze OBIEKT, nie id", a kod **przepuszczał string**
   (`'p_ai'.ownerEmpireId === undefined` ⇒ „kolonia gracza" dla DOWOLNEGO id).
4. **Allowlista jest bezpieczniejsza od bloklisty, ale ma cenę: pominięty ODCZYT też zostaje
   zablokowany.** `wfInfo` (tooltip satysfakcji) wypadł z pierwszej wersji i znalazła go dopiero
   ekstrakcja **wszechświata etykiet** (`_addHit` + `case`, 68 pozycji).
5. **Jałowa kontrola pinu to fałszywa zieleń.** Trzy złapane w tym arcu: listener rejestrowany przed
   `GameCore.boot()` (który woła `EventBus.clear()`), `setCredits` przez nieistniejące `addCredits`,
   porównanie `0 Kr` z `0 Kr` bez własnego statku.
6. **Nie podnoś stuba w `node_modules/`, żeby zazielenić test.** `ColonyOverlay` nie importuje się
   pod node (`PlanetTextureUtils:16` → `new THREE.TextureLoader()`); stub jest **gitignorowany**,
   więc łatka dawałaby zieleń wyłącznie na jednej maszynie. Granicę dowodu nazywa się wprost.
7. **Furtki tylko wtedy, gdy pomiar ich wymaga.** Plan przewidywał dwie (`GameCore`,
   `CombatSandbox`) — pomiar pokazał, że **oba wiążą planetę macierzystą gracza**, więc przechodzą
   samym terminem. Zero furtek; sweep 165/165 to potwierdza.

---

### ⚠ Otwarte po tym arcu (żadne nie blokuje)

- 🟠 **Brak płatnika = flota DARMOWA** (pin F6 w `fleet_upkeep_payer_smoke`): `_resolvePayHomeId`
  zwraca `null`, a `_tickVesselMaintenance` robi `if (!homeId) continue`. Osiągalne, gdy gracz
  stracił dom, a `window.KOSMOS.homePlanet` nadal go nazywa. Zamknięcie = **trzeci szczebel
  drabiny** („dowolna żywa kolonia gracza"), poza podpisem OG-3b.
- **Obserwacja UX z GATE OG-3 §3:** klik na kolonię AI na mapie 3D + „mapa ciała" **przekierowuje
  na WŁASNĄ kolonię** zamiast stanu neutralnego. Nie wyciek (`activePlanetId` się nie zmienia) —
  myląca prezentacja. To wejście woła `switchActiveColony` + `openPanel`, a nie zaprojektowany
  podgląd `show({colonyId})`.
- **Zahardkodowany polski w `ColonyOverlay:171-173`** — trzy flashe sukcesu budowy
  (`'⏳ W kolejce…'`, `'🔨 Budowa rozpoczęta'`, `'✓ Zbudowano'`). Ta sama klasa co **Finding 113**;
  `check-i18n` ich nie widzi (pyta o klucze w `t()`, nie o napisy w `fillText`/flashu).
- **Backlog (decyzja właściciela: NIE w tym arcu):** lazy-init loadera w `PlanetTextureUtils`
  odblokowałby import `ColonyOverlay` pod node i **wykonaniowe** testowanie całej warstwy UI.
- **D1-D6 nie objęły wejść NAWIGACYJNYCH** — 4 miejsca wołające `switchActiveColony` bezpośrednio
  (`GameScene:3302`, `BottomContext:424`, `CivilizationOverlay:730`, `EventLogOverlay:368`) są dziś
  bezpieczne **przez odmowę**, ale żadne nie oferuje stanu neutralnego.

**Keepery arca:** `colony_tile_membership` 48 · `colony_ownership_guard` 30 · `colony_order_guard` 61
· `colony_ownership_canon` 40 · `fleet_upkeep_payer` 19 · `colony_ownership_seams` 11 (**S4 odwrócony
— wszystkie cztery szwy zamknięte**) · `colony_ownership_load` 33 · `zero_colony_panels` 11.
Sweep **165/165 0 FAIL** · `check-i18n` PASS.

---

<!-- CLAUDE.md L2861–3007 -->
## Finding 130 — misja rajdera AI przeżywa starcie (save **v101 bez migracji**, live-gate PASS)

Plan + decyzje **D-130-1..4 (W1)** + zmierzona anatomia Z2: `docs/design/AI_COMBAT_MISSION_PLAN.md`.

**Jedno zdanie:** `DSCS.startEngagement` zerował `mission` strony AI **bezwarunkowo, bez migawki
i bez wznowienia**, podczas gdy gracz miał pełny mechanizm od `046976d`.

⚠ **TO NIE BYŁ BRAK MECHANIZMU, TYLKO ASYMETRIA** — i pokazała to dopiero **reguła wejścia**
(`git log -S` + uruchomienie keepera PRZED audytem). Naprawa = uogólnienie istniejącej,
przetestowanej ścieżki gracza na obie strony, nie projektowanie od zera.

**Dwie szkody, nie jedna:** (1) `EnemyAttackHandler:42` bramkuje na `mission.type === 'attack'`,
więc przechwycenie w głębokiej przestrzeni **po cichu kasowało całe uderzenie AI**; (2)
`DirectorOffensive.strikeReadyVessels:82` ma `if (v.mission) continue` — zerowanie misji
**wpisywało rajdera z powrotem do puli uderzeniowej** w tej samej chwili (to jest silnik Z2).

**Zmiany:** `_pausePlayerSideForCombat` → `_pauseSideForCombat(vessels, pin, {isPlayer})` ·
`_resolvePlayerMissionsPostBattle` → `_resolveMissionsPostBattle` (obie strony, każda bramkowana
własną flagą) · `_joinEncounter` też przez wspólną ścieżkę (bez tego nieutwardzony bliźniak) ·
NEW flaga `m4EnemyCombatMissionPause` (ON, niezależna od gracza).

⚠ **Zamrażanie zostaje ASYMETRYCZNE i to jest zamierzone:** strona AI zamrażana ZAWSZE (także przy
fladze OFF — zachowanie sprzed naprawy; kill-switch nie ma prawa go zmienić), strona gracza tylko
przy fladze ON. ⚠ Gałąź odwrotu **tylko dla gracza** (D-130-3): dla AI odwrót wydaje
`AutoRetreatSystem`, więc druga gałąź dałaby **dwa odwroty na jedną bitwę**.

⚠ **KEEPER A1 T6 PINOWAŁ DEFEKT** — asercja „no-op dla AI↔AI" utrwalała ograniczenie „migawkę
dostaje tylko gracz", czyli sam Finding 130. **Odwrócona świadomie**; inwariant „bez właściwej
flagi nic się nie dzieje" przeniesiony na kontrolę pinu. `player_combat_mission_pause` 19 → **21/21**.
⚠ Dwa odwołania, które po zmianie nazwy by KŁAMAŁY (komentarz `AutoRetreatSystem:70` + wywołania
w keeperze A1) — naprawione w tym samym commicie. Aliasu świadomie nie zostawiono.

**🟠 Z2 ZOSTAJE OTWARTY — 130 go ZŁAGODZIŁO, NIE ZAMKNĘŁO.** Zmierzona anatomia (4 składniki):
parkowanie ma **DWÓCH producentów** (`DSCS:1219` + **`EnemyAttackHandler:241-245`**, ten drugi
jawnie dokuje rajdera przy planecie GRACZA), brak filtra puli, `bypassFuelCheck`, oraz **brak
jakiejkolwiek logiki powrotu AI** (`homeSystemId` tylko w kolonizacji/logistyce). ⚠ Rejestr mówił,
że 130 jest warunkiem koniecznym Z2, bo „rajder nie ma czym wrócić" — **mechanizm jest inny**:
misja ataku to `moveToPoint` przemianowany, czyli **bilet w jedną stronę**, więc nie ma czego
przywracać. Transport gotowy (`dispatchInterstellar`); brakuje **intencji**. Keeper **T4 pinuje tę
granicę wprost**, żeby zielony przebieg nie został wzięty za zamknięcie Z2.

**Testy:** NEW `ai_combat_mission_pause_smoke` **19/19**, fail-first **13/6** (kontrole pinu zielone
po obu stronach). Sweep **191/191 0 FAIL** · `check-i18n` PASS. Live-gate PASS: `v_21` wznowił
`attack` i doleciał do celu; `v_22` wycofał się przez `AutoRetreatSystem` **bez konfliktu** — to
potwierdza D-130-3 na żywym silniku. ⚠ **Granica dowodu: kill-switch NIE testowany w przeglądarce**
— pinuje go wyłącznie keeper T5.

⚠ **Obserwacja do rejestru przy Z2:** w trakcie TRWAJĄCEJ bitwy rajder jest w `strikeReadyVessels`
— **nie istnieje publiczny predykat „statek jest w starciu"** (grep czysty). Pre-existing, przez tę
naprawę **zwężone**, nie poszerzone. Osiągalność niezmierzona.
⚠ **SPROSTOWANIE (Z2, 2026-08-31): predykat ISTNIEJE.** `DSCS._findActiveEncounterContaining` ma
sześciu konsumentów poza własnym plikiem (MOS ×4, ProximitySystem, FleetSystem, ThreeRenderer).
Tamten grep pytał o dwie nazwy, których nie ma (`_vesselToEncounter`, `isInCombat`), a nie
o mechanizm. Z2 dołożył siódmego i ósmego (Finding 198).

## Z2 — „AI wraca po ataku": rajder przestaje być STAŁĄ BAZĄ WYSUNIĘTĄ (save **v101 bez migracji**, live-gate PENDING)

Plan + 10 podpisanych decyzji (D-Z2-1…D-Z2-10, wszystkie W1) + pomiary PRZED kodem:
`docs/design/AI_RECALL_PLAN.md`. Rejestr macierzysty findingów: `VESSEL_ORDERS_PLAN.md`
§Findingi z audytu Z2. Zamyka **GATE B2 / Z2** z `VO3B_PLAN.md` §9.

**Jedno zdanie:** okręt AI po uderzeniu zostawał na orbicie planety GRACZA z `mission=null`,
`movementOrder=null` (VO-3b) i `pendingOrder=null` — czyli spełniał WSZYSTKIE warunki
`DirectorOffensive.strikeReadyVessels` i bił stamtąd co cooldown z dystansu **0 AU**.

**⚠ POMIAR ZMIENIŁ PROJEKT, NIE POTWIERDZIŁ GO — i to jest sedno tego slice'u.** Zlecenie zakładało
„strojenie tempa" (jak długo zostać, jaki koszt paliwowy). **Ani jedno, ani drugie nie jest dźwignią:**

| | bitwy / 100 lat wyśw. | ostrzeżenie | orbita gracza |
|---|---|---|---|
| **przed** (parkuje) | 19,8 = 1 na 5,1 roku | **0,0 roku** (1. uderzenie 5,1; każde następne **0**) | **zajęta 100 % czasu** |
| **po** (powrót na orbitę stolicy) | 10,0 = 1 na 10,0 roku | **5,1 roku** | wolna |

- **Tempo jest już zaciśnięte gdzie indziej:** `strike_player_target.cooldown = 5.0` + rzut nasycony
  do 100 % ⇒ **powrót krótszy niż cooldown jest w kadencji NIEWIDOCZNY** (postój 3 lata = te same
  19,8 uderzeń). Knob tempa **zostaje w danych** i to on koryguje ewentualne przestrzelenie.
- **Paliwo nie jest kosztem AI w ŻADNYM punkcie** (bak warp startuje PUSTY, `dispatchInterstellar`
  omija `canJump` dla `isEnemyVessel`, `consumeWarpFuel` klampuje do zera, każdy rozkaz AI leci
  z `bypassFuelCheck`) ⇒ „presja paliwowa" nie wystroiłaby tempa, tylko **wyłączyła ofensywę AI**.
- Realna szkoda to **brak dolotu** i **trwała okupacja**: zaparkowany rajder zrywał pulę hubu
  orbitalnego (`SystemPoolService._hostileWarshipInOrbit`), doliczał się do KAŻDEJ kolejnej bitwy
  (`EnemyAttackHandler:93-98` — rosnący stos bojowy bez budowania czegokolwiek) i **przeżywał
  POKÓJ** (`war:peaceSigned` ma zero konsumentów, a `DSCS` nie ma bramki wojny).

**⚠ NAIWNA NAPRAWA JEST GORSZA OD DEFEKTU (zmierzone).** Sam skok do domu zostawia rajdera na
obrzeżach (`_tickInterstellar:2729-2736`: 30 AU, `dockedAt=null`) z **niewyczyszczoną** misją
`interstellar_jump` ⇒ wypada z **KAŻDEJ** puli AI na zawsze. Dlatego powrót jest **composite'em**
z drugim odcinkiem i stanem końcowym. Pinuje to keeper T5.

**Kształt:**
- **Mechanizm** — `OrderService.issueRecall` + `_issueRecallLeg` + gałąź `recall` w `_maybeDeliver`
  (czwarty rodzaj composite'u obok `transport`/`passenger`/`attack`). Skok warp → `moveToPoint` na
  CIAŁO stolicy → `orbiting` + `dockedAt = stolica`, czyli stan, który rozumieją wszystkie pule.
  ⚠ **NIE `issueReturn`**: tamten czyta `vessel.colonyId`, a `_onColonyDestroyed:1136` przepisuje to
  pole **bez terminu właściciela** na kolonię GRACZA (**Finding 195**) — rajder dostałby rozkaz
  powrotu do domu gracza. Domem jest `directorProduction.capitalOf` (kanon Directora).
  ⚠ **`startReturn` to mina, nie skrót**: liczy cel przez `_predictPosition(vessel.colonyId)` bez
  terminu układu ⇒ interpolowałby rajdera do współrzędnych stolicy AI **wewnątrz układu gracza**.
- **Decyzja** — NEW `src/systems/director/DirectorRecall.js` (wzór `DirectorMobilization`): sonda
  **ZAMIATACZ** `strandedWarshipsAwayFromHome` + akcja `recallVessels`. ⚠ Zamiatacz, nie hook, bo
  producentów stanu „okręt AI stoi poza domem" jest **SIEDEM** (EAH, remis DSCS, odwrót na ciało
  niczyje, odwrót na ciało GRACZA, anulowany rozkaz, stary zapis, debug) — hook u każdego to
  `131cc2e` po raz kolejny. Reguła `recall_strike_force`: **bez rzutu**, `cooldown 1.0` roku
  wyświetlanego (granularność zegara decyzji, nie wymyślony próg), **bez guardu wojny** (D-Z2-8 —
  dzięki temu sprząta też po pokoju), `delay: 0`, `count: 3` (lustro `MAX_STRIKE_SIZE`).
- **Filtr puli** — `strikeReadyVessels` wymaga układu macierzystego **i** braku aktywnego starcia.
  ⚠ To **nie jest ostrożność**: bez filtra reguła uderzenia i reguła powrotu ścigałyby się o ten sam
  kadłub, a zwycięzcę rozstrzygałaby **KOLEJNOŚĆ KLUCZY w `DIRECTOR_RULES`** (`tickEmpire` iteruje
  `Object.values`). Keeper T10 pinuje rozłączność obu zbiorów.
- **Drabina odmów rozszerzona o trzeci szczebel** `no_hull_at_home` (kadłuby są WOLNE, ale żaden nie
  jest w domu). `strikeReport` przepisany, żeby werdykt odtwarzał REALNĄ drabinę — inaczej zacząłby
  kłamać dokładnie w stanie, który ten slice wprowadza.

**Predykat „statek w starciu" REUŻYTY, nie zbudowany** (D-Z2-5) — `DSCS._findActiveEncounterContaining`.

**Kill-switch `FEATURES.aiStrikeRecall`** (default ON) — ⚠ bramkuje **zamiatacz I filtr puli** pod
JEDNĄ flagą, bo OFF ma znaczyć „zachowanie sprzed slice'u bit w bit"; dwie flagi dałyby trzy różne
stany „wyłączone".

**⚠ `EnemyAttackHandler` NIETKNIĘTY** (D-Z2-6, pin granicy T8): dalej dokuje rajdera przy planecie
gracza. Zamiatacz **skraca** to okno do ≤ 1 roku wyświetlanego, nie kasuje zapisu.

**⚠ Świadome odwrócenie pinu w `ai_combat_mission_pause` (F130) T2:** kontrola pinu brzmiała „z
wyzerowaną misją rajder BYŁ w puli" — i mierzyła to **w trakcie walki**, czyli stan, który Z2 celowo
zamknął. INTENCJA oryginału zachowana (mierzona PO domknięciu starcia); powód w nagłówku keepera.
⚠ Przy okazji wyszło, że bez `enc.isActive = false` asercja „rajder ze wznowioną misją nie wraca do
puli" przechodziłaby po Z2 **z niewłaściwego powodu** — fałszywa zieleń.

**⚠ Cztery keepery Directora wymagały `registerRecallBehaviors`** — `DirectorSystem` waliduje
wszystkie nazwy katalogu w konstruktorze i RZUCA na nieznanej (R12). To nie niedogodność, tylko
dowód, że bramka działa. `w3_director_mounting` T2 dostał nową nazwę także na liście „boot woła".

**Testy:** NEW `ai_strike_recall_smoke` **62/62**, fail-first **12/44**. ⚠ Pierwszy przebieg fail-first
dał 13/43 i był **nieuczciwy**: siedem asercji wykluczających przechodziło JAŁOWO (pusta lista ==
pusta lista) — każda wymaga teraz OBECNOŚCI świadka. Sweep **192/192 OK, 0 FAIL** · `check-i18n` PASS
· **zero nowych kluczy i18n** (`director:recalled`/`recallRefused` to kanał AUDYTU — dodane do
`DebugLog.TRACKED_EVENTS` w tym samym commicie, reguła W3).

**Kontrola montażu** (sonda poza repo, prawdziwy `DirectorSystem.tickEmpire`): reguła odpaliła sama,
`director:recalled {count:1}`, rajder → `interstellar_jump` + `pendingOrder=recall`, po skoku
`move_to_point → stolica`, **ETA 4,68 roku** — zgodne z Pomiarem 2 (4,5-4,9).

**Otwarte po tym slice'ie:** **195** (🔴 `_onColonyDestroyed` bez terminu właściciela — ten slice go
OMIJA, nie naprawia; ✅ zamknięty 2026-10-15 w AI STRIKES BACK S4-7) · **196** (`no_idle_hull` nieosiągalny w ścieżce reguły ⇒ gate NIE może czytać
„pusta pula" ze zdarzeń) · **197** (`war:peaceSigned` bez konsumentów — złagodzony, reszta do W4) ·
**198** (`_findActiveEncounterContaining` de facto publiczny).

<!-- CLAUDE.md L3634–3832 -->
## ŁAŃCUCH EKONOMICZNY AI — **KOMPLETNY I POTWIERDZONY NA ŻYWO OD KOŃCA DO KOŃCA** (2026-09-03, save v101 bez migracji)

> Zamknięcie wielosesyjnego łuku. Wejście do łańcucha (Finding **246**) było jego ostatnim brakującym
> ogniwem. Gate: `docs/design/CHAIN_ENTRY_GATE_CHECKLIST.md` §Wynik · plan: `CHAIN_ENTRY_PLAN.md`.

**Pełna ścieżka, każde ogniwo domknięte SKUTKIEM na żywym silniku:**

| ogniwo | slice | dowód |
|---|---|---|
| **żywność** — stolica przestaje umrzeć w gy 4-10 | **S1** `aiUniformStaffing` (229) | obsada farm 45 → 100 %, pop 24 → 170 |
| **budżet pracy** — popyt przestaje uciekać puli | **S4a** `aiLaborBudget` (233/234) | blokady `[farm, well, solar, factory]` → `[]` od gy 40 |
| **Fe z obsadzonych kopalń** | S1 + S4a | Fe 14-48 tys., kopalnia L12, saldo ujemne (realna konsumpcja) |
| **rdzenie** — receptura i alokacja | **217 / 221** | `quantum_cores` i `antimatter_cells` alokują się i produkują |
| **`Nt` uczciwymi trasami** | **NT_LINK** C1/C2/C3 (239/240/244) | trasy 5 → 2 na imperium, 12 odzysków, dostawa 13 `Nt`/kurs |
| **WEJŚCIE DO ŁAŃCUCHA** | **E3H** (246, `aiTier3ScaledEntry`) | ekspansjonista `celWC` 1 → 12, `QC/AC/WC` **0 → 3/1/7** |
| **ukończone okręty pod naciskiem** | Director (S3/S6) | **7 uzbrojonych okrętów emp_001 z WŁASNEJ ekonomii** — pierwszy raz w projekcie |

**Finding 246 — ZAMKNIĘTY** (`d284765`; keeper `ai_tier3_scaled_entry_smoke` **25/25**, fail-first 16/24;
sweep **204/204**; live-gate **PASS A-E**). Kształt: zatrzask z pasmem `WEALTH_OPEN 0.20` /
`WEALTH_CLOSE 0.12` + cel **proporcjonalny** `max(1, round((target−1)×frac))`, w
`ColonyAutoExpander._syncTier3SafetyDemand`, AI-only. `_tier3Latch` **nie serializowany** — po
wczytaniu `undefined` ⇒ fail-closed z samej inicjalizacji (D-E3-2, **bez migracji**).

⚠ **Trzy rzeczy z tego łuku, które wychodzą poza niego:**
1. **Kontrola, która nie może paść, nie jest kontrolą.** Panel czterech liczb `d44af5e` uruchomiony
   i **nie odtworzył** własnej kolumny (0/32 · 100 % · 0 wobec 1/32 · 99 % · 1,5) — bo S1/S4a/215
   naprawiły pod nim świat. Zastąpiony **konkurencją o FP** (`CHAIN_ENTRY_PLAN` §10), która realnie
   różnicuje (×30). Stary panel został jako **appendix z pomiarem, dlaczego umarł** (§13) — nie skasowany.
2. **Churn celu JEST kanałem szkody, nie kosmetyką.** Sam cel skalowany: 3376 przejść przez zero
   i **1,78** wyparcia FP `build|consumption` na 1000 wywołań alokatora. Z pasmem: 880 i **0,08** —
   pasmo E0 to [0 ; 0,32]. ⚠ **Podłoga `max(2, scaled)` była MIERZONA I PRZEGRAŁA (2,63/1k)** —
   trzyma popyt tier 3+ na stałe włączony, więc konkuruje w KAŻDYM związanym wywołaniu.
3. **Rollback na stanie ZDEGRADOWANYM jest niediagnostyczny.** Na gy 75 OFF i ON czytały identycznie,
   bo ścieżka OFF nigdy nie czyta ani nie czyści zatrzasku, a `getSafetyStockTarget` zwraca ostatni
   zapisany bonus. Dowodem rozdziału są **baza gy 60 (1/1 → 36/12)**, **keeper T4** (kontrola pinu:
   ten sam stan daje 0 przy OFF i 34 przy ON) i **tabela headless 100 gy** (`latch undefined` przez
   cały przebieg OFF). Zapisane w §Wynik, żeby nikt nie wziął tego za regresję.

**Finding 247 — OTWARTY Z PROJEKTU.** Sufit `startingSafetyStocks.warp_cores = 50` jest **sensem**
„rezerwy gotowości" (D-CE-0): AI gromadzi i konwertuje **pod naciskiem gracza**. ⚠ `kadlubyZeSkokiem`
jest nadal **0 i to jest POPRAWNE** — jedyna eskorta z `warp_tank` stoi w kolejce (brak drugiego
`warp_core`), a dwa ukończone okręty to wzorzec **251** (`engine_warp` bez baku, `warpFuel.max = 0`).
**Jeden cykl fabryki od przewrócenia licznika** — fakt projektu danych, nie defekt.

**Kanoniczny fixture NA DYSKU (pierwszy w projekcie):** `src/testing/fixtures/GATE-S4-fresh-gy60.save.json.gz`
(215 KB, metryczka obok: v101, `savedAt` 2026-09-03 09:48:57, HEAD `977112a`, kod gry `bee26cf`).
⚠ **Powstał PRZED naprawami NT_LINK**, więc niesie 5 tras i **6 kadłubów w pozie 239 na imperium** —
jest kanoniczną kontrolą „zamrożonych kadłubów". Konwencja + sonda read-only: `src/testing/fixtures/README.md`,
`probe-fixture-inspect.mjs`. ⚠ **Replay headless NIE działa i jest zaparkowany** (`GameCore.boot` nie ma
ścieżki restore; łańcuch mieszka w `GameScene`, który nie importuje się pod node).

**KOLEJKA (potwierdzona 2026-09-03):** **154** (`_findNearestFriendlyPlanet` bez terminu układu, żywa
przez trzy przyciski „Powrót do bazy") → **151 / 152 / 153** osobno → duże sloty. Nowi nazwani kandydaci
na duży slot: **POPYT NA WARP** (rywalizacja AI-vs-AI + doktryna patrolowa, `KOSMOS_backlog_niezrealizowane.md`
§5, materiał wyjściowy = inwentarz konsumentów w **247**) oraz **238** (cała gałąź cywilna techu jest dla
AI niewidzialna). Otwarte z tego łuku: **248** (canSustain jako predykat wejścia), **249** (F5: trzy
prerekwizyty + system-ślepy `orbitalAU`), **250** (pakowanie F3), **251**, **252** (martwy panel WARN).

---

## STAN SESJI 2026-09-03 — Fe-supply: **S1 + S4a POTWIERDZONE NA ŻYWO, łuk głodowy ZAMKNIĘTY, oś przechodzi na DOSTAWĘ Nt** (save v101, bez migracji)

Plan + pełne tabele: `docs/design/FE_SUPPLY_PLAN.md` §12a (krach żywnościowy) · §12b (S1) · §13 (S4a) ·
**§14 (GATE-S4-fresh — żywy przebieg gy 0→60)**. Rejestr: `VESSEL_ORDERS_PLAN.md` (223-238).
Commity: `a345d09` (S1) · `2043a48` (keeper ekspandera → sweep) · `bee26cf` (S4a) · `7c30f5a` (docs §13).

**Dwa slice'y, jedna przyczyna.** Stolica AI umierała z **GŁODU** w gy 4-10 — nie z braku energii
i nie z braku rudy. Obie naprawy są AI-only, każda za własną flagą, obie potwierdzone **SKUTKIEM**:
- **S1 / Finding 229** (`aiUniformStaffing`, ON) — kolonie AI liczą obsadę **UNIFORM**; gracz zostaje
  na greedy + priorytet CO DO BITU. Greedy napełnia budynki **po WSPÓŁRZĘDNYCH HEX**, a jedynym
  pisarzem `designation:'priority'` jest **mysz gracza** ⇒ farmy stolicy AI stały na końcu kolejki
  z obsadą **0 % przy elektrowniach na 100 %**. **O przeżyciu stolicy decydował generator mapy**
  (1..8 etatów przed pierwszą farmą na czterech ziarnach).
- **S4a / Findingi 233 + 234** (`aiLaborBudget`, ON) — ekspander dostał **BUDŻET PRACY**
  (`getSlotDemand + jobs > workers + LABOR_BUDGET_MARGIN(2)`). Hamulec budowlany usunięto w `d95d9b8`,
  a **ścieżka ULEPSZEŃ nie miała go NIGDY** — przy `jobs × level` samo ulepszenie mnoży wymaganie
  pracy (**80,2 % blokad to ulepszenia**). Popyt rósł **10 → 24 przy ZERO nowych budynków**.

**GATE-S4-fresh** (właściciel, świeża kampania, **gy 0→60**, pokój, komplet flag ON) — **PASS**:

| hipoteza | wynik |
|---|---|
| **H1** kadencja kolonizacji (215) | pełne kolonie **3 → 5** / **3 → 6**, placówki **5/5** ⇒ kontrola `d44af5e` czysta |
| **H2** stolica żyje i rośnie | pop **24 → 170** (`Propus b`) / **158** (`Regulus c`); farmy **45 → 80 → 100 %**, **ani razu 0 % przy `laborer > 0`**; żywność 8,4-12,3 tys.; mieszkania **32 → 188** |
| **H3** `kadlubyZeSkokiem` | **0 — NIE-WYNIK, PRZEWIDZIANY**; produktem jest SERIA: Fe 20 034 → **14 046**, `warp_cores` 0 → **1**, AC 2 → 3, kopalnia **L12**, **`Nt` = 0 i `H` = 0** |
| **H4** uczciwość flag | `aiUniformStaffing` OFF → `_greedyApplies()` **true** w obu stolicach, ON → **false** — sprawdzone w OBIE strony |

**⚠ BUDŻET PRACY SAM SIĘ ZWALNIA — tego harness nie pokazał.** `zablokowane`
`[farm, well, solar_farm, factory]` → **`[]` od gy 40**, licznik blokad **płaski 1 637** przez
gy 50-60, laborer **9/11 → 33/33**. Mechanizmem jest to, co §13.5 zapisało jako ZASTRZEŻENIE:
`habitat.jobs === 0`, więc budżet **nie widzi mieszkań** → mieszkania rosną → rośnie populacja →
rośnie pula → **podnosi się sufit `workers + 2`**. **Caveat okazał się ZAWOREM.**
⇒ obawa **Findingu 237** (sufit samospełniający) **rozpuściła się**, a jego **próg ~100 pop został
przekroczony 1,7× bez wystąpienia zjawiska** — **tripwire z przekroczonym progiem jest MARTWYM
PRZYRZĄDEM**; zostaje wyłącznie klauzula **238** (gałąź cywilna techu).

**⚠ Jedyna metryka gorsza od harnessu — `avail`**, i to dokładnie ta, którą §13.6 kazał obserwować:
w fazie zagęszczenia **0,38-0,62** (emp_002 do 0,38), czyli **PONIŻEJ pasma 0,61-0,91**, z powrotem
do **1,00 od gy 40**. Przejściowy koszt gęstości — nie blokada, ale i nie „mieściło się w paśmie".

**Czego gate NIE dowiódł — nazwane:** (1) **`kadlubyZeSkokiem ≥ 1`** — kryterium §12(d) **nadal
niespełnione**, świadomie (H3 był przewidzianym nie-wynikiem); (2) kontraktu **OFF** flagi
`aiLaborBudget` na żywym silniku — odczyt był **JAŁOWY** (przy ON lista blokad już pusta od gy 40),
więc pokrywają go **wyłącznie piny headless**; (3) ⚠ **korekta ramy: `courierLoadOrder`
i `aiInternalTrade` są w `GameConfig` default ON** (`!== false`, shipowane w `8226dcc`) ⇒ w tym
przebiegu **BYŁY AKTYWNE**, a `Nt = 0` w stolicy zmierzono **przy R1 i R2 WŁĄCZONYCH**.

**⚠ LEKCJA — protokół gate'u, który żyje tylko w rozmowie, NIE JEST artefaktem.** Hipotez H1-H4
**nie ma w żadnym pliku** (`grep` czysty), więc §14 **odtwarza je z raportu właściciela**. Ta sama
klasa co „podpisane ≠ zbudowane" (§9) i „skażony przyrząd produkuje pewne siebie tabele" (§9a).
W `docs/design/` stoi dwanaście `*_GATE*_CHECKLIST.md` — **następny gate zaczyna się od dopisania
trzynastego, PRZED przebiegiem.**

**NOWY KANONICZNY FIXTURE: `GATE-S4-fresh-gy60`** — dwie żywe, bogate stolice AI (pop **170/158**,
Fe 14 tys.+, pełne warstwy), stała presja produkcyjna (3 uzbrojone fregaty gracza zadokowane w domu — `entity_2` /
`sys_home`; ⚠ korekta 2026-10-08: w zapisie z `systemId` `sys_060`, chimera doku, Finding 407),
pokój, żywa postawa. **Zastępuje martwe zapisy `GATE-Fe-*`** — tamte nie mają żyjącej stolicy, więc
każdy pomiar łańcucha warp na nich mierzył ciszę.

**⚠ NASTĘPNE OGNIWO — DOSTAWA `Nt`, nie podaż Fe.** Pięć placówek emp_001 trzyma **≈ 37,7 tys. Nt**
(8 732 / 6 030 / 8 449 / 7 084 / 7 470; `sys_059` ×2, `sys_063` ×2, `sys_023`) przy Fe 25-28 tys.
każda — a **stolica ma `Nt` = 0**. Praca (**229**/**233**), popyt (**217**) i alokacja (**221**) są
zamknięte, ruda jest (14 tys.) ⇒ wiążącym ogniwem jest **TRANSPORT**. Audyt ogniwa Nt (kandydaci
findingów + kształty naprawy, **bez implementacji przed podpisem**): odpowiedź z 2026-09-03.

**Obserwacja bez numeru:** `U` (bezrobotni) **67 / 20** w gy 60 — w stolicach powstała nadwyżkowa
pula pracy. Kandydat na dźwignię **TEMPA KOLONIZACJI** (kolonizacja płaci POP-ami, **232**), a nie na
kolejnego strażnika. **Zmierzyć, zanim ktokolwiek nazwie to funkcją.**

Sweep **200/200 0 FAIL** · `check-i18n` PASS · save **v101 bez migracji**.

---

## STAN SESJI 2026-08-31 — trzy arce AI: DEFENSE_SCOPE · TARGET_FALLTHROUGH · 215 (save v101, bez migracji)

Jeden dzień, jedna rodzina: **AI atakuje to, czego nie weźmie → nie atakuje tego, co weźmie →
w ogóle nie ma czym**. Każdy arc obalił ramę poprzedniego POMIAREM, nie rozumowaniem.

**✅ DEFENSE_SCOPE — Findingi 199 + 200 + 209, live-gate §7 PASS** (`792a034` C1 · `b2e94ef` C2 ·
`6e48460` C3 · `9a58bfb` close-out). Obrona planetarna broni **swojego CIAŁA** (wariant **V4**:
budynki per-kolonia, okręty per-układ), eskadra AI **gradowana do siły, którą bitwa naprawdę
wystawi**, **bez clampa** (`needed > MAX_STRIKE_SIZE` ⇒ własny powód `target_beyond_reach`).
Bezbronny kadłub wnosi HP, ale **zero broni** (fallbacki były **DWA**: `playerVesselsToBattleUnit`
**i** `normalizeFleet` — zdjęcie jednego było BUFFEM 2→5). Kill-switch `FEATURES.defenseScope`.
Rozpuściło D-199-3/D-199-4 oraz findingi **203** i **206**. Keeper `defense_scope_smoke` **69/69**.

**✅ TARGET_FALLTHROUGH — Finding 210, live-gate §8 PASS** (`1e633d4` · `e864ea8` close-out).
Drabina odmów oceniała **wyłącznie głowę rankingu wartości**; teraz `pickAttainableTarget(empireId,
ready)` schodzi **w istniejącym porządku wartości** do pierwszego celu osiągalnego. **TRZY stany
terminalne** — start bez pominięcia / start z `skippedHead` / **pełna odmowa, która NIE MILCZY**
(liczby GŁOWY + `attemptedTargets`, lekcja Findingu 196). Ta sama flaga `defenseScope`.
⚠ Na gate'cie zaobserwowano **pełną pętlę rozgrywki**: AI bierze zdobywalną kolonię ×2 → gracz
fortyfikuje → kolejny rajder ginie → tabela gradowała cel na `needed 2` ⇒ **AI odmówi zamiast
powtórzyć błąd**. 199 i 210 działają razem.

**🟡 215 — bramki `freePops` na ścieżce AI, WDROŻONE, LIVE-GATE JUTRO** (`ade36d8` C1 · `2b27e4f` C2).
`_employedPops` liczy **ETATY**, nie pracowników, a `ColonyAutoExpander` stawia ich u AI więcej niż
jest POPów ⇒ **`freePops` = 0 na stałe**. Population 2.0 Faza 2 (FIX A, `d95d9b8`) zdjęła takie
bramki z budowy budynków, ale **sweep nie objął ścieżki AI**. Dwie martwe bramki, **dwa różne
lekarstwa**: kolonia = **ZASTĄPIENIE** (bramka KOSZTU źle zmierzona — `removePop('laborer', …)` płaci
naprawdę) → `laborer >= popTransferSize + MOTHER_RESERVE (4)`; kurier = **USUNIĘCIE** (prawdziwy
strażnik `deployVessel`→`commitCrew` płaci przy `freePops = 0`, a jego ścieżka porażki jest czysta).
`popTransferSize` **8 → 4** (AI only). Flaga **`FEATURES.aiPopGates`** (jedna na obie połowy).
Skutek zmierzony: `shipBuildRequested` 0→6, `_loadByRarity` 0→14, **dostarczono 0→8**, kolonie 3→4.
Keeper `ai_pop_gates_smoke` **22/22**. Plan + gate: `docs/design/AI_POP_GATES_PLAN.md` (§G.0 = oficjalne odczyty).

**⚠ TRZY RAMY OBALONE PO KOLEI** (178/208): „głód komodytów" → „głód żelaza" (**artefakt
niedoprecyzowanego fixture'u** — `GameCore.boot` bez `DRIVER_DEFAULTS` daje AI **bez placówek**)
→ „`warp_cores`" → **próg POP**. Dokument `COURIER_LOAD_ORDER_PLAN.md` **przycięty do części
zweryfikowanych**, z §1 przeetykietowanym „**wyprowadzone ze źródła, NIGDY nie zaobserwowane
w działaniu**". **178-jako-kolejność-ładowania wraca do gry dopiero, gdy kurierzy realnie latają
w żywym zapisie.**

**Nowe findingi:** 211 (adnotacja odwrotu doklejana do PLANETY) · 212 (fallback wideo bez cache'u
porażki — ⚠ hipoteza „brak plików" **OBALONA**, `assets/event-videos/` ma 21 plików) · 213
(`TEMPLATE_ROLES` zna rolę `courier`, żaden szablon jej nie ma) · 214 (popyt na RUDĘ karmi
`FactorySystem`, który rud nie produkuje) · **215** (zamknięty) · **216** (kolonie AI zakładają się
i **nie rosną** — ⚠ *hipoteza, nie diagnoza*).

**KOLEJKA PO GATE'CIE 215:** **154** → **151 / 152 / 153** osobno → wielkie sloty (**GROUND**,
**kolonizacja 98-107** — ⚠ **216 sąsiaduje**, nie wciągać; **ORDER_TRUTHFULNESS**).
**202** zostaje **nazwaną następną dystorsją** (wartość per-UKŁAD rankuje cele per-CIAŁO).

### ⚠ DWIE LEKCJE METODY Z TEGO DNIA (obie kupione pomiarem)

1. **PYTAJ, CO SIĘ NIE WYKONUJE, NIE CZEGO BRAKUJE.** Trzy kolejne błędne ramy powstały z odczytów
   POŚREDNICH („czego brakuje w magazynie"). Przełom dał **licznik wywołań** (`_loadByRarity`
   `wywolan = 0`) i **przebieg kontrolny** bez własnych zamówień. **Brakujący zasób mówi, GDZIE
   jesteś; nieuruchomiona funkcja mówi, DLACZEGO.**
2. **OVERRIDE W SONDZIE I TABELA POMIAROWA WYMAGAJĄ KONTROLI TAK SAMO JAK PIN KEEPERA.** Sweep
   `popTransferSize` przeszedł na **fikcyjnym override** (`emp.strategyConfig`/`ess._defaults` nie
   istnieją; `_config` czyta `ARCHETYPES[...].strategicColonization`) i dał tabelę **odwróconą
   arytmetycznie**. Złapała to dopiero niemożliwa arytmetyka. ⇒ **odczyt zwrotny PRZED liczeniem**
   (`AI_POP_GATES_PLAN.md` §4) i **metryka, która nie może przejść jałowo**: „przeżywalność" kolonii
   wyszła 100 % tylko dlatego, że **solo headless nic koloni nie zabija** — headline'em musi być
   „**stała się czymkolwiek**", nie „przeżyła".

---

<!-- CLAUDE.md L5241–5974 -->
## DESANT DA SIĘ ODNALEŹĆ — wojska gracza na CUDZYM ciele wracają do zasięgu gracza (save **v101 bez migracji**, live-gate PENDING)

Zgłoszenie właściciela: *„ekran planety, na którą desantuję, znika po zrzuceniu wszystkich jednostek
i nie mogę potem wrócić do tego widoku, żeby poruszać wojskami"*. Objaw jeden, przyczyny **TRZY** —
każda wystarczająca sama, każda w innej warstwie.

⚠ **MECHANIKA DOWODZENIA NIE BYŁA ZEPSUTA — brakowało WYŁĄCZNIE drogi powrotnej.** Panel obcej
planety jest ZAPROJEKTOWANY (`ColonyOverlay._openAsColonyPanel`: „dla konkretnej planety (własnej
LUB obcej)"), `ColonyOrderGuard.ALWAYS_ALLOWED_HITS` ma świadomie wpuszczoną całą rodzinę
**„WARSTWA DOWODZENIA DESANTEM"** (`unit*`, `army*`, `stack*`, `drawer*` — zakresowane po
`unit.owner`, NIE po koloni), a rozkaz ruchu (`GameScene:5427-5450`) bramkuje **po właścicielu
JEDNOSTKI**, nie po właścicielu kolonii. Dlatego naprawa jest mała, a keeper pilnuje **DRZWI**,
nie mechaniki. To jest zarazem „prostsza metoda" z pytania: nie trzeba niczego budować, trzeba
przestać zamykać drzwi.

**Trzy przyczyny, wszystkie ZMIERZONE na żywym silniku:**
1. **`ColonyOverlay._finishDropMode`** — po opróżnieniu kolejki `setTimeout(openPanel('fleet'), 1500)`.
   Zamysł („gracz kontynuuje zarządzanie flotą") kłócił się z faktem, że to JEDYNA chwila, gdy mapa
   obcej planety jest otwarta.
2. **`UIManager` (kolektor Outlinera)** — lista jednostek iterowała `allColonies`, czyli
   `getAllColonies()` przefiltrowane do **kolonii GRACZA**, więc oddział na planecie AI nie trafiał
   na listę NIGDY. Zmierzone: dwie żywe jednostki gracza, lista widzi **jedną**. ⚠ Pojawiał się
   dopiero po ZDOBYCIU kolonii — czyli w chwili, gdy przestawał być potrzebny.
3. **`Outliner` klik + `BottomContext._doAction`** — oba wołały `switchActiveColony(planetId)` +
   `openPanel('colony')` **BEZ `colonyId`**. Zmierzone: `hasColony(koloniaAI)` = **`true`**,
   `switchActiveColony(koloniaAI)` = **`false`** (bramka własności D1), a gołe `openPanel` spada
   w `show()` na `activePlanetId` ⇒ otwierała się **WŁASNA kolonia**. To domyka udokumentowaną
   **„Obserwację UX z GATE OG-3 §3"** (`COLONY_OWNERSHIP_GUARD_PLAN.md` §128) po stronie
   `BottomContext`.

**Kształt (3 decyzje właściciela, podpisane przed kodem):**
- **Zostajemy na planecie** — auto-powrót usunięty razem z polem `_dropReturnOverlay`. Wyjście: ✕
  albo Esc (drugi Esc — pierwszy anuluje sam tryb zrzutu).
- **NEW `src/ui/OutlinerGroundLogic.js`** (czysty, importuje tylko kanon własności) —
  `collectPlayerGroundUnits` (jednostki gracza z **KAŻDEGO** ciała) + `groupGroundUnitsByBody`.
  Powód wydzielenia: `UIManager` **nie importuje się pod node**, więc jedyny defekt, jaki miał, był
  pinowalny wyłącznie źródłowo; tu jest pinowalny **WYKONANIEM**.
- **Sekcja JEDN. NAZIEMNE grupowana po CIELE** (wzór sekcji FLOTA, która grupuje po stanie):
  sub-nagłówek = ciało + licznik, **klikalny** → mapa tego ciała; nazwa jednostki dostaje pełne
  150 px zamiast dzielić je z 6-znakowym skrótem planety.
- **Druga droga** — `BottomContext` („mapa ciała" po kliku planety na mapie 3D): **biletem do
  powierzchni obcego ciała są WŁASNE BUTY na nim**, nie sam fakt istnienia kolonii.

⚠ **FILTR `in_cargo` JEST OBOWIĄZKOWY, nie ostrożnościowy.** Stary kolektor dostawał go ZA DARMO od
`GroundUnitManager.getUnitsOnPlanet:236`; przejście na `getAllUnits()` go zdejmuje, a jednostka
w ładowni **ZACHOWUJE `planetId`** planety załadunku ⇒ bez niego desant lecący w kosmosie
renderowałby się jako stojący na powierzchni.

⚠ **Polityka nazw jest decyzją o mgle wojny:** własna kolonia → **nazwa KOLONII** (zachowanie sprzed
zmiany), obce ciało → **nazwa CIAŁA**, nigdy nazwa cudzej kolonii. Moje buty na powierzchni nie są
biletem do nazwy nadanej przez wroga.

⚠ **Kolejność grup jest decyzją, nie przypadkiem:** ciała BEZ mojej kolonii **PIERWSZE** (siły
ekspedycyjne / desant nie mają żadnego innego wejścia), potem własne kolonie; w obu grupach
alfabetycznie, żeby lista nie skakała między klatkami.

**Etykiety (przy okazji, zmierzone):** `Outliner` robił `t('groundUnit.' + unit.type)`, a w słowniku
był **jeden** klucz (`groundUnit.science_rover`) — `t()` przy braku klucza zwraca **sam klucz**, więc
KAŻDA jednostka archetypowa renderowała się jako **`groundUni…`** (truncate do 10 znaków). Lista,
która właśnie staje się głównym wejściem do wojsk, była nieczytelna. Doszło **12 par kluczy PL+EN**
(7 archetypów + 3 legacy `infantry`/`mech`/`garrison` — brzmienia wprost z `GROUND_UNITS.namePL/nameEN`
— oraz `drop.finished`/`drop.cancelled`, dotąd twarde polskie literały flashy).
`ARCHETYPE_ICONS` **PRZENIESIONE** z `GroundUnitPanel.js` do `data/unitArchetypes.js`: ikona jest
cechą archetypu, a panel ciągnie THREE (`GlbSnapshotRenderer`), więc import z niego wywróciłby
node'owy import Outlinera — duplikat mapy byłby nieutwardzonym bliźniakiem.

### ⚠ Trzy lekcje z pisania keepera (wychodzą poza ten slice)

1. **Statyczny import symbolu, który POWSTAJE w tym slice, wywraca CAŁĄ suitę przy fail-first**
   (`SyntaxError: does not provide an export named …`) i żaden pin nie ma koloru. Lekarstwo:
   **namespace import** (`import * as ArchData`) albo dynamiczny `import()` w `try/catch` — to
   ta sama lekcja co „pin musi DEGRADOWAĆ, nie PRZERYWAĆ", tylko na poziomie **symbolu**.
2. **Fixture, który nie rozróżnia dwóch polityk, świeci zielono dokładnie tam, gdzie jest defekt.**
   Pin „obce ciało → nazwa CIAŁA, nie nazwa cudzej koloni" przechodził JAŁOWO, bo bootstrap nazywa
   kolonię AI **tak samo jak ciało** (`Thuban b` == `Thuban b`). Fixture musi rozjechać obie nazwy.
3. **Pin wykluczający na pustym zbiorze to fałszywa zieleń.** Pierwszy pomiar fail-first dał
   **18/36**; po dołożeniu ŚWIADKA do każdego pinu wykluczającego (`ids.has(drop.id) && !ids.has(X)`)
   i zamianie „nie otwiera" na mierzalny SKUTEK (`planet:previewMap` emitowany raz) — **12/43**.
   Sześć zielonych było jałowych.

**Świadomie przyjęte konsekwencje:** obca kolonia **bez** moich wojsk, ale `analyzed`, otwiera teraz
read-only podgląd terenu zamiast przeskakiwać na moją kolonię (dla nie-`analyzed` — jak dotąd nic) ·
ikona Sci. Rovera `🤖 → 🛰` (tak deklarują dane `GROUND_UNITS`, dotąd **bez ani jednego konsumenta**).

**Poza zakresem (do rejestru, NIE naprawiane):** `ColonyOverlay:3339` nazywa jednostki
`arch.descriptionPL.split('.')[0]` i sięga po `arch.icon`, którego archetypy **nie mają** ⇒ zawsze
🪖 i zawsze po polsku (klasa 113). Szersze niż etykieta w Outlinerze — własny slice.

**Pliki:** NEW `src/ui/OutlinerGroundLogic.js`; `UIManager` (kolektor + 2 importy), `Outliner`
(grupowanie, klik, hover `_hoveredGroundBodyId`), `BottomContext` (druga droga), `ColonyOverlay`
(`_finishDropMode`), `data/unitArchetypes.js` (+`ARCHETYPE_ICONS`), `GroundUnitPanel` (import zamiast
kopii), i18n pl/en. Keeper NEW `src/testing/smoke/ground_troops_reachable_smoke.mjs` **55/55**
(T1-T6; `Outliner` i `BottomContext` **importują się pod node**, więc obie połowy pinowane
**WYKONANIEM** — prawdziwy `draw` na atrapie ctx i prawdziwy `hitTest`; `_finishDropMode` pinem
źródłowym, bo `ColonyOverlay` nie importuje się pod node). Fail-first w prawdziwym
`git worktree --detach HEAD`: **12 PASS / 43 FAIL**, wszystkie 12 zielonych to autentyczne kontrole
pinu. Sweep **234/234 0 FAIL** · `check-i18n` PASS (pl=en=3364) · bez flagi (rollback = `git revert`).

---

## WOJNA I POKÓJ — W4-simple: pokój terytorialny (save **v101 bez migracji**, ARC ZAMKNIĘTY 2026-09-29)

Slice D1 horyzontu W3 został rozszczepiony: **pokój terytorialny odszedł do W4**, bo stół pokojowy
przed podbojem wyceniałby towar, którego nie ma. Po AI_CAPTURE towar istnieje. Plan + decyzje
D-WP-1..17 + pozostały plan: `docs/design/WOJNA_I_POKOJ_MASTER_PLAN.md` §„W4-simple — delivered".
Rejestr findingów: `docs/design/VESSEL_ORDERS_PLAN.md` §283+.
Commity: `d08ded2` (WP-0 keeper szwów) · `af7591b` (WP-1 `war.captures[]`) · `34ad9b0` (WP-2 term +
sufit) · `0afb02c` (WP-3 wykonanie cesji) · `7c84a55`+`3920aa9` (WP-4a stół + odznaka) ·
`016dd46`+`de68900`+`6d957a1` (WP-4b zero kary / depesza AI / meldunek) · `e617869`+`c858639` (WP-5).

**Jedno zdanie:** wyczerpanie przestało znaczyć „gracz dostaje wszystko" — pokój oddaje **konkretne
ciała**, AI **samo** prosi o zakończenie wojny, a **auto-pokoju nie ma już po żadnej ze stron**.

### Szwy — sześć, i każdy odpowiada na inne pytanie

| szew | gdzie | za co odpowiada |
|---|---|---|
| **księga zdobyczy** | `war.captures[]`, `WarSystem.getCaptures:169` | JEDYNE źródło „co zmieniło ręce w TEJ wojnie" — czyta je sufit, zniżka za odzysk i odznaka. Append-only, **bez deduplikacji**: rozstrzyga OSTATNI wpis, nigdy `some()` |
| **kanał `terms`** | `proposal.terms.cessions` → `AcceptanceEngine._buildTermsContext:529` | Liczony **wyłącznie** gdy propozycja niesie cesje; `offer_peace` bez nich nie wykonuje ANI JEDNEGO dodatkowego odczytu świata |
| **pre-warunki** | `PRECONDITION_CHECKS.capital_never_ceded` / `territorial_ceiling` | Blokada, nie waga. ⚠ Okno dla wagi jest **PUSTE** (zmierzone w WP-2): przy tle 48,50 żadna waga nie wetuje niezawodnie, nie zabijając zwykłej cesji |
| **`CessionPlan`** | `DiplomacySystem._cessionWorld` + `planCessions` | Re-walidacja **fail-closed**; ciało bez stempla ABORTUJE deal |
| **depesza AI** | `WarSystem._maybeAiPeaceOffer:306` | DWA warunki: próg `casusBelli.peaceCost` to tania bramka wstępna, **rozstrzyga `evaluatePeace`** |
| **cooldowny** | `verbCooldowns` na rekordzie pary | Po D-WP-4 to **zapis cooldownu, nie kara punktowa** (waga `recent_refusal` dla pokoju = 0) |

### Keepery arca

`wp_peace_seams` · `wp_captures_ledger` · `wp_territorial_terms` · `wp_cession_execution` **55** ·
`wp_peace_table` **50** · `wp_occupied_badge` **32** · `wp_peace_cooldown` **67** ·
`wp_ai_peace_offer` **92** · NEW `wp_test_infra` **34**. Piątka bootująca razem **296 zielonych**.
Sweep **241/241 OK, 0 FAIL, 31 advisory** · `check-i18n` PASS (pl=en=**3402**).

### ⚠ Pułapki — siedem, każda kupiona pomiarem

1. **BIAŁA LISTA `_acceptance()` UGRYZŁA DWA RAZY.** `AcceptanceEngine._kosmos()` zwraca `this._deps`,
   czyli **białą listę**, nie przezroczyste proxy na `window.KOSMOS`. Klucz pominięty **nie rzuca** —
   `buildContext` widzi `undefined` i wstrzykuje wartość zdegradowaną, więc mechanika umiera **po cichu
   przy zielonych testach czystego silnika**. W1-3: brak `threatAssessment` ⇒ `relative_power` martwy.
   WP-2: brak `colonyManager` + `directorProduction` ⇒ wycena i sufit martwe. Od C1 pilnują tego **dwa**
   piny (`wp_test_infra` T4 refleksja / T5 parsowanie) — bo odpowiadają na różne pytania: refleksja łapie
   odczyt tym samym mechanizmem co defekt, ale tylko na wykonanej gałęzi; parsowanie widzi każdy
   `K.<klucz>` niezależnie od gałęzi, ale nie dowodzi, że kod biegnie.
2. **HEADLESS NIE WIDZIAŁ TEGO, CO GRA.** `GameCore.boot()` nie montował czterech globali
   (`entityManager`, `territoryService`, `directorProduction`, `eventBus`). Bez `directorProduction`
   **stolica AI przestawała istnieć** dla silnika: zmierzone na imperium z jedną kolonią — goły boot
   `heldValue 44 / capital false / sufit 22`, gra `0 / true / 0`. **Pięć** keeperów `wp_*` obchodziło to
   ręcznie (⚠ **trzy z pięciu kopii były nienośne** — rytuał, nie potrzeba). Kanon w C1.
3. **`changeExhaustion` WYZWALA DEPESZĘ** — na obu ścieżkach (`WarSystem:271` sufit, `:280` po zapisie).
   Scenę stawia się `gameState.set(...)`, odpala **jednym** `changeExhaustion(+δ)`.
4. **`listActive()[0]` NIE JEST „TĄ WOJNĄ"** — `:126` zwraca kolejność wstawienia. Uchwyt to
   `getWarWith(empireId)`.
5. **„WOJNA BEZ WOJNY".** `createWar:179` kluczuje id jako `war_<a>_<b>_<rok>` i przy trafieniu
   **zwraca istniejący rekord** (`:180`) — także **nieaktywny**. Wypowiedzenie wojny tej samej parze
   w tym samym roku, w którym poprzednia się zakończyła, nie tworzy nowej wojny, a `getWarBetween:155`
   filtruje po `active` ⇒ **`getWarWith` zwraca `null` przy „trwającej" wojnie**. Obejście na gate'cie:
   rok+1 albo wskrzeszenie rekordu.
6. **`node --check` W POTOKU Z `head` ZWRACA EXIT `head`, NIE `node`.** Kontrolą jest **uruchomienie**
   keepera. Zmierzone w C0: plik przeszedł `--check`, a literał JS był rozcięty prawdziwym przełamem linii.
7. **HEREDOC W TYM HARNESSIE ZWIJA `\\` → `\`** (zmierzone) i przy większym pliku rozjeżdża parsowanie
   („unexpected EOF"). ⇒ złożone pliki pisać `Write`em; skrypty łatające trzymać na **jednym** poziomie
   escapingu (backslash przez `chr(92)`).

### Gate pełnej pętli — PASS (2026-09-29, KOPIA realnego zapisu)

„Liga Trzech Słońc", `emp_001`, `border_incident` (`peaceCost 30`), **zero błędów w konsoli**.
Wojna z panelu → desant AI na stolicę gracza → księga `{entity_2 player→emp_001 via invasion}` → 🏴 na
karcie ciała → **staging 29/29 = 0 depesz, `changeExhaustion +2` = 1 depesza** (exh 31) → depesza status
quo z trzema wyborami → ⇄ kontrpropozycja → stół (Pik1 „zdobyte na tobie — taniej" **poza** żądaniem,
stolica 🔒, żądanie ≈11/30) → **odmowa przy 29/31** (opinion −18,8 · war_status −0,6 · territorial −5,4 ·
**`recent_refusal` 0,0 — D-WP-4 na żywo, kara NIE ISTNIEJE**) + „ponowna propozycja za 1 l.", ☮ szary →
po roku staging 60/60 → pusty stół = **pokój status quo** + NAP + rozejm 10, Pik1 zostaje Ligi
(**D-WP-13 na żywo, regresja zero**) → druga wojna (rok 64) → **cesja wykonana**: toast „Kolonia
otrzymana na mocy pokoju", wpis `via: 'cession'`, właściciel = gracz, NAP + rozejm 10.

⚠ **Dwie obserwacje z przebiegu:** 🟠 **298** — pokój status quo **pierze zdobycze** (`recaptured` liczy
tylko księgę BIEŻĄCEJ wojny, `AcceptanceEngine:604`; stolica `dev 100` vs sufit **79,5** w wojnie #2),
decyzja właściciela **odłożona**. ✅ **`isHomePlanet` przeżywa pełną pętlę — brak findingu**: zmierzone
headless `true → false → true`, bo cesja AI→gracz idzie przez `captureColonyForPlayer`
(`DiplomacySystem:721`), a `ColonyManager:1013` przywraca flagę **bramkowany tożsamością** z
`window.KOSMOS.homePlanet.id` (kontrola: przejęcie CUDZEJ kolonii zostawia `false`, dom nadal jeden).

### ⚠ Świadomie POZA 1.0

`threaten` · pełna okupacja · reparacje w kredytach · **D5** (pary AI↔AI).
**Pozostały plan:** DS-1 (NAP `expiresYear` + ticker + beat; ⚠ **korekta pomiarowa**: rozejm bramkuje
**0 z 4** dróg do wojny, wymuszony NAP **3 z 4**, przycisk gracza otwarty **z projektu** — a napięcie
stoi zamrożone na `TRUCE_TENSION_CAP = 30`, bo `_tickTensionDecay:1004` pomija pary spoza `'peace'`;
obie sprawy to **decyzje właściciela**) · DS-2 (odnowienie traktatu + 4. rząd) · DS-3 (`gift`) ·
WP-R (reparacje jako **debuff produkcji wojennej**: `reparationsUntilYear` + guard na istniejącej akcji
`pressureResponse`, `DirectorRuleData:109/:137`).
---

## DS-1 — pakt ma koniec, rozejm ma zęby (save **v101 bez migracji**, live-gate PASS — SLICE ZAMKNIĘTY 2026-09-29)

Domknięcie dwóch pytań, które arc W4-simple zostawił za findingiem **291**, i oba były **decyzjami
właściciela, nie higieną**: czy rozejm kogokolwiek zobowiązuje i czy napięcie w nim w ogóle stygnie.
Plan + decyzje **D-DS-1/2/3** + protokół gate'ów czasowych:
`docs/design/WOJNA_I_POKOJ_MASTER_PLAN.md` §„DS-1 — delivered". Rejestr: `VESSEL_ORDERS_PLAN.md`
§291 (ZAMKNIĘTY) + #299-#302. Commity: `9cb1e4e` (C0 kształt rekordu) · `602500c` (C1 termin + ticker
+ beat) · `71e0d24` (C2 bramka rozejmu + podłoga napięcia) · `3b5039c` (C3 panel mówi prawdę).
Bez flagi — rollback = `git revert`.

**Jedno zdanie:** pakt o nieagresji przestał być WIECZNY, a rozejm przestał być etykietą — i obie te
zmiany dało się zrobić bez dotykania ani jednego konsumenta `hasTreaty`.

### Szwy — cztery, i każdy odpowiada na inne pytanie

| szew | gdzie | za co odpowiada |
|---|---|---|
| **kształt rekordu** | `RelationsModel.addTreaty:259-268` | JEDEN pisarz, przez którego przechodzą OBAJ producenci (`proposeTreaty` i wymuszony NAP z pokoju). Od C0 obaj podają `{ id }`, więc `expiresYear` dokłada się do JEDNEGO kształtu, nie do dwóch |
| **termin** | `RelationsModel.treatyExpiryYear:53` | JEDNA odpowiedź na „kiedy ten traktat się kończy"; `null` = nie kończy się. Wołają ją **ticker I panel** — druga kopia rachunku rozjechałaby to, co panel POKAZUJE, z tym, co ticker ROBI (klasa `removeColony:667`) |
| **bramka wojny** | `DiplomacySystem.declareWar:348` (rozejm, KAŻDY powód) + `:358` (NAP, poza `player_action`) | Bramka siedzi w SILNIKU; `DiplomacyOverlay:558` `canWar` jest jej **LUSTREM**, nie drugą decyzją — bo panel zapisuje własną zasadę: „szare zostaje WYŁĄCZNIE to, co strukturalnie niemożliwe" |
| **podłoga napięcia** | `DiplomacySystem._tickTensionDecay:1075-1085` | Rozejm stygnie, ale do `TRUCE_TENSION_FLOOR = 15`, nie do zera. `Math.min(krok, cur − floor)` jest NOŚNE — bez niego ostatni krok przebija podłogę |

### Keepery slice'u

`wp_peace_seams` **43** · `wp_nap_expiry` **28** · `wp_truce_gate` **40** · `wp_treaty_slot` **29** —
**140 zielonych**. Fail-first, każdy w prawdziwym `git worktree --detach` na poprzednim commicie,
FINALNYMI pinami: C0 **38/2** · C1 `wp_nap_expiry` **9/19** + `wp_peace_seams` **37/6** (dowód
nie-jałowości re-aimów) · C2 `wp_truce_gate` **22/18** + `wp_nap_expiry` **27/1** · C3
`wp_treaty_slot` **12/17** + `wp_peace_seams` **42/1**. Sweep **241 → 244/244, 0 FAIL, 31 advisory** ·
`check-i18n` PASS, pl = en **3402 → 3409** (**7 nowych kluczy**: 1 w C1, 1 w C2, 5 w C3).

### ⚠ Pułapki — siedem, każda kupiona pomiarem

1. **WYGAŚNIĘCIE = USUNIĘCIE REKORDU, NIE ZMIANA PREDYKATU — i to jest cała oszczędność slice'u.**
   `hasTreaty` pyta **wyłącznie o `id`**, więc KAŻDY konsument
   (osiem bezpośrednich wywołań predykatu w `src/` — sześć na fasadzie systemu, dwa na modelu — plus
   siedem przez `hasTradeAgreement`, w tym bramka wojny `declareWar:358` i bramka ultimatum
   `:1095`) jest poprawny **BEZ JEDNEJ LINII ZMIANY**. Gdyby wygasanie było predykatem („ma traktat,
   ale przeterminowany"), każdy pominięty konsument byłby **cichą dziurą w bramce wojny**.
2. **Stempel terminu jest WARUNKOWY, i to nie jest ostrożność.** Bezwarunkowy `entry.expiresYear`
   w `addTreaty` zrobiłby z umowy handlowej i sojuszu **traktaty terminowe** — czyli zmianę balansu,
   której nikt nie podpisywał. Pilnuje tego pin `wp_nap_expiry` T1f; `TREATY_WITH_TERM`
   (`RelationsModel:41`) jest literałem, bo model nie zna katalogu i nie ma po co go poznawać.
3. **`t()` NIE FORMATUJE LICZB (zmierzone).** Licznik lat na ⚔ musi być całkowity **w miejscu
   wywołania**, inaczej surowy float wylewa się graczowi na przycisk jako „9.9166666 L.".
   ⚠ Ta sama liczba ma dziś w panelu **dwa zaokrąglenia** (finding **302**), a przycisk pokoju w panelu
   Wojny wylewa surowy float „☮ POKÓJ — ZA 0.8333 L.” (finding **303**) — mimo że to on był WZOREM dla ⚔.
4. **Pin na liczbie eksportów WSPÓLNEGO pliku ma mieć JEDNEGO właściciela.** Przeniesienie
   `TRUCE_TENSION_CAP` z `DiplomacySystem` do pliku balansu (żeby para pokręteł rozejmu miała jeden
   dom) ujawniło, że licznik eksportów `OpinionModifierData` był pinowany w **TRZECH** keeperach
   z trzech różnych slice'ów — jedna przeniesiona stała paliła trzy suity naraz. Właścicielem jest
   od C3 `wp_treaty_slot` T5e; pozostałe dwa pinują to, co należy do ICH slice'u.
5. **Bramka rozejmu blokuje KAŻDY powód, ale zmienia coś tylko dla JEDNEGO stanu.** Trzy drogi AI
   (`hostility_threshold`, `ultimatum_expired`, `enemy_attack_arrived`) i tak odbijały się o NAP, bo
   `TRUCE_YEARS = NAP_YEARS = 10`. Realna zmiana dotyczy stanu **„NAP zerwany albo wygasły, rozejm
   wciąż trwa"** — osiągalnego przez `breakTreaty` i przez stary zapis. ⚠ **Zero omijającego `reason`**:
   uczciwa droga dla gate'u to ZAKOŃCZYĆ ROZEJM (`relations.setStatus(pair, 'peace')`), nie trzeci
   magiczny string obok `player_action` i `player_war_panel` (rejestr **294**).
6. **Pomiar decayu wymaga ODWOŁANIA FLOT — inaczej mierzy się ciszę.** Statek gracza zdolny do nauki,
   zostawiony **na orbicie** w układzie AI, odpala `_tickTrespassing` → `addMemory`, a
   `_tickTensionDecay:1080` pomija każdą parę, której ostatni wpis pamięci jest młodszy niż
   `PEACE_QUIET_YEARS = 2.0`; zegar trespassu zbroi się co `TRESPASS_YEARS = 1.0`. ⚠ **1,0 < 2,0, więc
   tłumienie jest TRWAŁE, nie opóźnione** — decay **nigdy nie rusza**, a gate czyta działającą podłogę jako
   defekt. Ten sam pomiar jest pytaniem o BALANS (finding **305**): jeden zaparkowany zwiadowca kasuje
   w całości odwilż, którą wprowadził C2, i gracz nie dostaje o tym żadnego sygnału.
7. **Re-aim keepera na NOWY eksport importuje go NAMESPACE'OWO, z `?? null`.** Statyczny import symbolu,
   który dopiero powstaje w tym commicie, wywala **cały plik** keepera na linkowaniu ESM — czyli
   w przebiegu fail-first **żaden pin nie dostaje koloru**, także zielone kontrole. Złapał to worktree
   w C1 (re-aim `wp_peace_seams` na `treatyExpiryYear`). Lekcja „pin musi DEGRADOWAĆ, nie PRZERYWAĆ”,
   tylko na poziomie MODUŁU.

### Live gate — PASS (zapis testowy, „Konsorcjum")

Pokój przy 100/100 → slot „Pakt o nieagresji (od 120, do roku 130)", chip ROZEJM 10 lat, ⚔ szary
z licznikiem; `declareWar('player_action')` = `false` + wpis w Dzienniku; wygaśnięcie w **130.26**
z **JEDNYM** beatem (drugi tick milczy), slot pusty, status POKÓJ, ⚔ znowu aktywny; napięcie
**136.9 → 15 i stoi** (`border_pressure` nie zbija poniżej podłogi); stary rekord **bez** `expiresYear`
→ slot „do roku 140", wygaśnięcie w **140.26**, znowu jeden beat. Konsola czysta.

### ⚠ Świadomie POZA DS-1

**DS-2** (odnowienie paktu + przycisk; `diplomacy:treatyExpired` jest już emitowane z pełnym ładunkiem
i **czeka** — jedyny konsument to dziś beat Dziennika, `UIManager:1732`) · **DS-3** (`gift` — term
`offer` jest w silniku KOMPLETNY, `AcceptanceEngine:143` + `OFFER_HALF_KR = 500` + wagi 10-25 per
archetyp + `trader` ×1,5, a `counterHintFor` już liczy, ile kredytów domknęłoby lukę; **nikt go nie
karmi**, bo żadne UI nie wkłada `offer` do propozycji) · **WP-R** (reparacje jako debuff produkcji
wojennej) · **298** (pokój status quo pierze zdobycze — decyzja właściciela odłożona).

---

## DS-2 / DS-3 — pakt da się ODNOWIĆ, a dar potrafi otworzyć rozmowę (save **v101 bez migracji**, live-gate PASS — ZAMKNIĘTE 2026-09-30)

Domknięcie dwóch pozycji, które DS-1 zostawił na liście „poza zakresem". Plan + decyzje **D-DS-4…D-DS-9**
+ pomiary: `docs/design/WOJNA_I_POKOJ_MASTER_PLAN.md` §„DS-2 / DS-3 — delivered".
Commity: `02de4a5` (DS-2/C1 — okno, model, fasada) · `8821f93` (DS-2/C2 — slot) · `acc7547` (DS-3/C1 — dar).
Bez flagi (rollback = `git revert`). **#306 ZAMKNIĘTY**; #301 i #298 otwarte, #307 nowy.

**Jedno zdanie:** DS-1 dał paktowi koniec i żadnego sposobu, żeby go przedłużyć, a term `offer` liczył
poprawnie od E1 **dla nikogo** — te dwa braki zamykają się razem, bo dar jest tym, co ratuje odnowienie
odrzucone przez AI.

### Szwy — pięć, każdy odpowiada na inne pytanie

| szew | gdzie | za co odpowiada |
|---|---|---|
| **odnowienie** | `RelationsModel.renewTreaty:290` | JEDYNE miejsce, które przedłuża termin. Bramka `TREATY_WITH_TERM` siedzi **w ciele metody** (kontrakt należy do modelu), nowy termin liczy `treatyExpiryYear` — ten sam helper co ticker i panel; w ciele **nie ma** drugiego `+ NAP_YEARS`, więc kontrola `wp_treaty_slot` T2f („formuła w warstwie dokładnie raz") zostaje prawdziwa. `map`, nie `push` ⇒ duplikat rekordu niemożliwy |
| **tryb renew** | `renewable: true` (katalog) **∧** `ctx.renew === true` (propozycja), sprawdzane w `not_already_signed` | KONIUNKCJA, nie flaga. Sama flaga przepuściłaby ponowne podpisanie sojuszu. ⚠ Pre-warunek ZOSTAJE na liście czasownika — wyjątek żyje w CHECKU, dlatego `acceptance_engine` :90 jest cały, a próg i dziewięć wag mają jedno źródło |
| **dostępność** | `canRenewTreaty` | LUSTRO bramki w `renewTreaty`, nie druga kopia progów. Panel (C2) wyszarza przycisk **tą samą funkcją**, którą silnik odmawia; `opts.offer` uchyla tylko term odmowy, **okno i istnienie paktu obowiązują dalej** |
| **dar** | term `recent_refusal` w `AcceptanceEngine` | Wyjątek mieszka w **CHECKU TERMU**, nie w nowym czasowniku ani w bramce UI: `ctx.offer.credits > 0` ⇒ term zwraca 0. Zasięg zakresowany przez to, **kto karmi `offer`** — dziś wyłącznie modal odmowy traktatu |
| **pieniądze** | `DiplomacySystem._payGift` | JEDEN księgowy dla dwóch fasad. Wołany **wyłącznie po `decision === true`** i **przed** mutacją traktatu — tylko ta kolejność daje symetrię all-or-nothing (TRIPWIRE `wp_gift_offer` T13e) |

**Kanał popupów naprawiony (weszło poza zakres, bez tego przycisk nie mógłby działać):** `_hasCustomClick`
istniało w `MissionEventModal` **od zawsze i nie miało pisarza**, więc każdy przycisk w tym kanale był
wyłącznie zamykający — `DiplomacyRefusalModal` zapisał to wprost w nagłówku („gdyby kiedyś potrzebował,
trzeba najpierw naprawić kanał"). Kanał czyta teraz `onClick` z konfiguracji przycisku, a
`buildScheduledEventPopup` — `disabled`. Naprawa **ogólna**, z zachowaniem kolejkowania i pauzy;
alternatywa (przepisanie modala na builder wprost, wzór `PeaceOfferModal`) odebrałaby kolejkę TRZEM
ścieżkom odmowy, z których dwie nie są mierzone. `wp_ai_peace_offer` T7c zostaje zielony, bo pętla zostaje.

### ⚠ Pomiar, który zmienił kształt — dar po odmowie był bezsilny przy KAŻDEJ kwocie

Pakt, próg 10. **Przed** stemplem: score 0, hint 500 Kr, 500 Kr → 10 = TAK. **Po** stemplu
`recent_refusal`: 0 Kr → −25 · 500 → −15 · 2000 → −6,25 · 10 000 → −5 · **MILION → −5**. Przyczyna jest
strukturalna: kara waży **25**, a `offer` **nasyca się na +20**, więc 25 punktów nie da się pokryć
**żadną** kwotą — w obu ścieżkach (odnowienie i zwykła propozycja; `offer_peace` ma 25/25, też
niemożliwe). A modal odmowy otwiera się **PO** stemplu. Dlatego **dar uchyla świeżą odmowę, na jedną
ocenę** (D-DS-9). ⚠ **Nasycenie +20 jest GRANICĄ PROJEKTU:** `opinion` waży 40, więc imperium, które nas
naprawdę nienawidzi, **nie jest do kupienia** — dar przesuwa decyzję na styku, nie łamie jej. Odmowa
osłodzonej propozycji stempluje **normalnie** ⇒ jedna PŁATNA próba, nie darmowy łańcuch.

### ⚠ Trzy rzeczy z tego slice'u, które wychodzą poza niego

1. **ŚWIADEK W KAŻDYM PINIE, KTÓRY MOŻE BYĆ PRAWDZIWY BEZ MIERZONEJ FUNKCJI.** Kosztowało to trzy
   rundy poprawek keeperów, wszystkie zmierzone fail-firstem: **13/41 → 5/49** (C1: „signedYear
   nietknięty" i „brak duplikatu" były prawdą, bo nic się nie działo; najgorszy pin porównywał stan PO
   round-tripie ze stanem PRZED zapisem, `610 === 610`) · **68/20 → 63/25** (C2: trzy piny nosiły
   etykietę „KONTROLA PINU", a na bazie padały, czyli były pinami naprawy; pięć zieleni było jałowych,
   bo bez C2 etykieta brzmi „Pakt o nieagresji") · **25/38 → 19/44** (DS-3: na drzewie bez naprawy dar
   jest **w ogóle niewidziany**, więc „nie kupuje okna", „nie domyka luki", „nic nie schodzi" i „pokój
   nie ma retry" przechodziły z niczego). ⇒ **kontrola musi być zielona po OBU stronach; pin, który na
   bazie pada, NIE JEST kontrolą i nie wolno go tak etykietować.**
2. **Wiersz rozbicia niesie `term`, a NIE `id`/`termId`, i rozbicie ZAWIERA wiersze zerowe** — filtruje
   je dopiero widok (`buildRefusalContent`). Pin na OBECNOŚCI wiersza jest więc dwuznaczny: mierzy
   WARTOŚĆ (`valOf`), nie obecność.
3. **Popup rysuje się RAZ NA PROCES.** `MissionEventModal._active` jest prywatne, a `dismiss`
   nieosiągalne z zewnątrz (atrapa DOM ma `click()` jako no-op), więc drugi `queueMissionEvent` trafia
   do kolejki i nic nie rysuje. Dwa scenariusze popupu = dwa **procesy potomne**
   (`execFileSync(process.execPath, ['--input-type=module', '-e', …])` — bez powłoki, więc bez cytowania).

⚠ **Czwarta, proceduralna:** `TRACKED_EVENTS` **nie jest eksportowane** z `DebugLog.js` — jednolinijkowiec
gate'u czytający ten symbol jest niewykonalny; audyt czyta się przez `KOSMOS.debugLog.query({kind})`.
Złapała to **walidacja linii gate'u na żywym silniku**, i to po tym, jak mój własny wrapper zamaskował
błąd, nie awaitując wyniku. **Wrapper walidacji też wymaga kontroli.**

### ⚠ Świadomie POZA DS-2/DS-3

**WP-R** (reparacje jako debuff — tam dar przestaje być jednorazowy i dziedziczy regułę kolejności
D-DS-8) · **298** (pokój status quo pierze zdobycze) · **301** (`diplomacy:warRefused` i
`diplomacy:treatyExpired` nadal poza `TRACKED_EVENTS`; DS-2/C1 zamknął tylko połowę sąsiednią —
zmierzone: `query({kind:'diplomacy:warRefused'})` zwraca **0**) · **307** (beaty traktatowe mają wpis
w Dzienniku, ale **bez toastu** — polerka UI, z tego gate'u) · **D-DS-5** (depesza AI o odnowieniu).

---

## WP-R — REPARACJE: blokada zbrojeń AI, nie rachunek (save **v101 bez migracji**, live-gate PASS — ZAMKNIĘTE 2026-09-30)

Druga połowa podpisu **D-WP-1(c)**: reparacje jako **blokada produkcji wojennej**, nie kredyty
(„AI płaci" odrzucone jako fikcja — AI nie ma powtarzalnego dochodu ani jednej bramki
kredytowej w zachowaniu). Plan + decyzje **D-WPR-1…6** + tabela decyzyjna:
`docs/design/WOJNA_I_POKOJ_MASTER_PLAN.md` §„WP-R — delivered".
Commity: `61e3abc` (C1 silnik) · `87d692d` (C2 stół + chip + beaty). Bez flagi (rollback = revert).
**Rozdział Wojna i Pokój ma po tym slice'ie JEDNĄ otwartą pozycję: #298.**

**Jedno zdanie:** blokada zamyka **dwie** drogi AI do nowej siły bojowej, bo zamknięcie tylko
produkcji znaczyłoby „nie wolno wam budować, ale wolno uzbroić wszystko, co macie" — i to
dokładnie w chwili, w której druga reguła i tak by odpaliła.

### Szwy — pięć, każdy odpowiada na inne pytanie

| szew | gdzie | za co odpowiada |
|---|---|---|
| **termin** | `REPARATIONS_YEARS` w `OpinionModifierData` | JEDEN ZEGAR z `NAP_YEARS`/`TRUCE_YEARS` — pokój niesie wszystkie trzy naraz, więc trzy terminy kazałyby pilnować trzech liczników dla jednego traktatu |
| **stan** | `reparationsUntilYear` na REKORDZIE PARY | wzorzec `expiresYear` z DS-1: `_write` zapisuje cały rekord ⇒ pole jedzie za darmo, `?? null` dla starych zapisów, **v101 bez migracji**. Ticker **CZYŚCI** pole, nie zostawia przeszłego roku (lustro stanu = dług, arc 186/187) |
| **ocena** | term `reparations` w `AcceptanceEngine` | czyta **WYŁĄCZNIE** `ctx.terms.reparations` + `ctx.war` ⇒ **biała lista `_kosmos()` NIETKNIĘTA**. To ta pułapka, która ugryzła W1-3 i WP-2: klucz pominięty w tamtej liście nie rzuca, tylko **cicho degraduje term do zera** |
| **bramka ×2** | `queueWarships` (drabina `reject`) + `empireNotUnderReparations` (reguła **i** akcja `mobilizeVessels`) | produkcja i mobilizacja. ⚠ NIE w `deployVessel` — tamtędy chodzi GRACZ. Jedno źródło odpowiedzi: `isUnderReparations` (dwie kopie „czy minął rok X" rozjechałyby się po cichu) |
| **chip** | `reparationsUntilYear` w PROJEKCJI `listPlayerRelations` | ⚠ ZMIERZONE: **żaden** z obu overlayów nie dotyka `relations` (0 wystąpień) — kształt rekordu pary zostaje prywatny (audyt R9/R12), więc panel czyta projekcję, lustrem `truceYearsLeft` |

**Poprawka `_buildTermsContext` — jedyny realny defekt z fazy A:** wczesny `return null` na braku
cesji czynił pokój „status quo + blokada zbrojeń" **niewidzialnym dla silnika** (ZMIERZONE:
`terms: { reparations: { years: 10 } }` → `ctx.terms === null`), a to najprawdopodobniejszy ruch
gracza. Teraz `null` dopiero gdy brak cesji **I** brak reparacji; `territorial_terms` przy
`cessions: []` zwraca 0, oba pre-warunki terytorialne wychodzą wczesnym `true`.

**Waga 25 wyprowadzona, nie wybrana:** tło `offer_peace` 10,00 / 21,00 / 48,50 przy exh 30/50/100
(wyczerpanie **symetryczne** — `war_status` bierze `min` obu stron; pierwsza sonda miała złą oś),
przewrót `u = (w−10)/(55+0,5w)` ⇒ **exh ≈ 52**, wyraźnie ponad `peaceCost` 30, a przy exh 100
zostaje **+32** zapasu, bo rozbite AI nie może blokować **końca wojny**. Skala: dojrzała kolonia
(devValue 34) = −3,89 pkt, więc 25 ≈ sześć kolonii.

### ⚠ Cztery reguły warsztatu z tego slice'u

1. **SKRYPT ŁATAJĄCY = PLIK, i zawsze `open(p,'wb')`.** Doraźny `io.open(p,'w',encoding=...)`
   zamienił **cały** keeper LF→CRLF (402 linie), po czym kolejne skrypty przestały trafiać
   w kotwice — a diagnoza była myląca, bo `io.open(...,encoding=...)` przy CZYTANIU robi
   universal-newlines i pokazywał LF. Do tego **dwa razy** backticki w inline-pythonie zostały
   wykonane przez powłokę jako podstawienia komend i wyżarły fragmenty komentarzy.
2. **NOWY SYMBOL WOŁANY WPROST ZABIJA CAŁY PRZEBIEG — trzy razy w jednym slice'ie.**
   `getReparationsUntilYear` (T6d), guard (T8), `_onHit(undefined)` (T10). Za każdym razem
   fail-first pokazywał crash zamiast kolorów, także dla ZIELONYCH kontroli. Wzorzec jest zawsze
   ten sam; lekarstwem `call()` / `askGuard()` / `hit()` — **pin musi DEGRADOWAĆ, nie PRZERYWAĆ**.
3. **PRZYRZĄD GATE'U NIE MOŻE PISAĆ ZEGARA NA PODSTAWIE FALLBACKU.** Linia §7 miała
   `?? 0` przy odczycie roku końca; gdy reparacje wygasły NATURALNIE, pole było już `null`, więc
   fallback ustawił `gameTime` na **0,2**. Nic nie zepsuł w grze, ale przyrząd, który przy braku
   danych PISZE stan świata, potrafi zmyślić scenę gate'u.

4. **GREP UCIĘTY PRZEZ `head` NIE JEST POMIAREM.** `grep … | head -5` kazał mi napisać
   w raporcie i w wiadomości commita, że `directorMobilization` nie jest wystawiony — odpowiedź
   stała na szóstej pozycji. To ta sama rodzina co pin celujący w martwą ścieżkę: **zwraca wynik,
   więc czyta się jak odpowiedź**. Przy pytaniu „czy X istnieje" licznik jest częścią pomiaru.

⚠ **Piąta, znana i zapłacona po raz drugi:** wrapper walidacji jednolinijkowców też wymaga
kontroli — mój harness nie wpiął `KOSMOS.debugLog` (gra robi to w `GameScene:2044`) i cztery
poprawne linie gate'u zgłosiły rzut.

### ⚠ Granice dowodu — jedna realna, druga byla MOIM błędem

- **Przełącznik żyje w gałęzi „są ciała"**: `_drawPeaceTable` ma wczesny `return` przy PUSTYM
  stole. Zmierzone: pusty stół wymaga, by **żadna strona nie miała kolonii** (`getPeaceTable`
  bierze wszystkie ciała obu stron, stolicę i dom tylko **oznacza** 🔒) ⇒ w realnej wojnie
  nieosiągalny. W fixturze bez kolonii byłby **cichym fałszywym negatywem** (kontrola T10b).
- ⚠ **DRUGA „granica" BYŁA PO PROSTU NIEPRAWDĄ — sprostowanie.** Napisałem, że połowa mobilizacyjna
  jest niedostępna z konsoli, bo `window.KOSMOS` nie wystawia `directorMobilization`.
  **Zmierzone po gate'cie: wystawia.** `GameScene` wystawia WSZYSTKIE SIEDEM systemów Directora
  (:460-464 + `directorOffensive` :471, `directorRecall` :476, `directorSystem` :477); mój
  wcześniejszy grep miał `| head -5`, a odpowiedź stała na szóstej pozycji. Dwie konsekwencje,
  obie zapisane zamiast po cichu naprawione: linia §6 gate'u czytała WEJŚCIE guardu, choć mogła
  wołać `KOSMOS.directorMobilization.mobilizeVessels(…)`, a **wiadomość commita `87d692d`
  niesie ten błąd**. Sam mechanizm gate potwierdził i tak, bo reguła odpaliła sama
  (`director:mobilizeRejected` ×1 przy `director:mobilized` 0).

### ⚠ Świadomie POZA WP-R

⚪ **308** gałka lat zamiast przełącznika binarnego (silnik gotowy: raw ∝ lata) · **307** toasty dla
CAŁEJ rodziny traktatowej naraz · **298** pokój status quo pierze zdobycze (**jedyna otwarta pozycja
rozdziału**, decyzja właściciela). ⚠ Dla ekspozycji Directora findingu NIE MA — patrz sprostowanie
wyżej: błąd był mój, nie kodu.

---

## AI GARRISON — G1 + G1b: walka naziemna się rozstrzyga, a utrata jednostki nie gubi ludzi (save **v101 bez migracji**, live-gate PASS — G1 i G1b ZAMKNIĘTE 2026-10-02 · G2-2 ZAMKNIĘTY 2026-10-03 · G2-3a ZROBIONY 2026-10-03 · G2-3b ZAMKNIĘTY 2026-10-03 · G2-4 ZAMKNIĘTY 2026-10-04 · follow-upy G2-4 ZAMKNIĘTE 2026-10-04 — G2 ZAMKNIĘTE · G3 ZAMKNIĘTY 2026-10-05 · G1c ZAMKNIĘTY 2026-10-06 · G2b ZAMKNIĘTY 2026-10-06 — ARC ZAMKNIĘTY)

Plan, decyzje **D1–D18** (+ **D13a**) i rejestr findingów **#309–#390**: `docs/design/AI_GARRISON_PLAN.md`.
Commity G1: `85411d0` (D5a) · `f5e30e5` (D5b + świadome odwrócenie `w3_seams_smoke` T6) · `f868ae8` (D5c).
Commity G1b: `c0a3d5c` (S1, #309) · `a42ec93` (S2, #310) · `03688f0` (S3, #312) · `c7c5a74` (S4, #326).

**Jedno zdanie:** świeże jednostki uciekały przy spawnie (próg 20 > `baseMorale` 10–20), wyjątek
„jednostka defensywna nie ucieka” był martwy (`'defense'` wobec lustra `'defensive'`), a jednostki
legacy znikały od pierwszego trafienia (Finding **65**: `?? 0` przy odejmowaniu vs `?? 100` przy
odczycie) — więc walka naziemna się nie rozstrzygała.

- **D5a** `isDefensiveUnit` (`unitArchetypes.js`) — oba modele; **rozpad przy morale 0 zostaje**.
- **D5b** `DEFAULT_MORALE = 100` (`unitArchetypes.js`) w 12 miejscach (silnik + dwa miejsca UI); tripwire T7.
- **D5c** `export const MORALE_RETREAT_THRESHOLD = 5` (`CombatSystem.js`) — ucieczka po ⌈(M − 5)/3⌉ trafieniach.

⚠ Garnizon przy bazowym morale (10) nie ucieka, ale **po 4 trafieniach rozpada się** — przyjęte dla G1;
czy jednostka defensywna ma się w ogóle rozpadać od morale — **niepodpisane, do G2**.
⚠ Fale legacy AI wygrywają 84–100% z archetypami gracza przy +0 ⇒ **D7**: AI na modelu archetypów
wszędzie, także w pulach desantu (G2b). ✅ **317**: lądowanie i podbój w czasie POKOJU — zamknięty w G2-2 (niżej).

**G1b — jedno zdanie:** strona AI strzelała w rundzie pierwsza, rozpad morale nie zwalniał zablokowanych
POP, rozwiązanie jednostki było nieme, a reintegracja po śmierci szła do kolonii ciała, na którym jednostka
zginęła.
- **S1 (#309)** — ogień naprawdę jednoczesny: migawka stanu z początku rundy dla OBU stron
  (`CombatSystem._runBattleRound`), strzelec czytany z migawki; kolejność RNG bez zmian. Szturm vs szturm
  97/4/0 → 14/13/74 % (AI / gracz / wspólne zabicie) — wspólne zabicia **przyjęte**.
- **S2 (#310)** — NEW `ColonyManager.releaseGroundUnitPops(unit, cause)`: pełny koszt POP do kolonii
  MACIERZYSTEJ z terminem właściciela, wołane w gałęzi rozpadu PRZED emisją i `removeUnit` (synchronicznie —
  zmierzone przez prawdziwy `time:tick`), dokładnie raz (`_popsReleased`). Brak kolonii właściciela ⇒ NEW
  `groundUnit:popsLost` + wpis.
- **S3 (#312)** — `NotificationCenter` subskrybuje `groundUnit:disbanded` i `groundUnit:popsLost`: wpis
  **tylko w Dzienniku** (bez dzwonka), tylko jednostki gracza; NEW klucze `event.groundUnit.disbandedMorale`
  i `event.groundUnit.popsLost` PL+EN. Subskrybent NIE zwalnia POP.
- **S4 (#326)** — reintegracja po śmierci do kolonii MACIERZYSTEJ (`_ownedHomeColony`), z ponownym
  sprawdzeniem właściciela przy wypłacie po zwłoce. Tabela reintegracji bez zmian.

⚠ **REGUŁA WŁAŚCICIELA dla POP jednostek naziemnych:** zwolnienie i zwrot idą WYŁĄCZNIE do kolonii
macierzystej należącej do właściciela jednostki (`_colonyBelongsTo`) — nigdy do ciała, na którym jednostka
stoi. ⚠ Ścieżka UTRZYMANIA używa jej od G1c/P4 (**329** ✅).
⚠ **Odczyt z bramki, który wyglądał na asynchroniczne zwolnienie, był ścieżką ŚMIERCI:** garnizon z morale
podniesionym technologiami ginie od obrażeń, nie od rozpadu ⇒ `garrison_unit` `{rate 1.0, delay 1.0}` =
pełne 1,2 dokładnie miesiąc później. Rekoncyliacja: plan §5c.1.
⚠ **Otwarte z G1b (#327–#335; stan 2026-10-02 — 327, 328, 329, 330 i 333 ✅ w G1c 2026-10-06):** 🟠 **333** nieoddana część POP po śmierci (`rate < 1`) zostaje zablokowana
NA ZAWSZE i liczy się do populacji · 🟠 **330** ręczne rozwiązanie idzie przez tabelę śmierci · 🟠 **328**
kolejka reintegracji poza zapisem · 🟠 **329** utrzymanie bez terminu właściciela · 🟠 **335** pętla odwrotu
AI (rodzina 313) · ⚪ **327** mina (latentny) · ⚪ **331** AI-vs-AI · ⚪ **334** literały karty jednostki.
**332** ✅ — tabela zdarzeń `groundUnit:*` wyżej poprawiona do stanu z grepa.

Keepery: `ground_morale_resolution_smoke` **35/35** · `ground_round_fairness_smoke` **12/12** ·
`ground_unit_loss_smoke` **29/29**. Sweep **250/250 OK, 0 FAIL, 31 advisory** · `check-i18n` PASS
(pl = en = 3426).

**G2 — stan 2026-10-02:** ✅ **G2-0** (`4d6ac63`, `g2_seams_smoke` 26/26 — piny szwów, które kolejne kroki zmienią
świadomie) · ✅ **G2-1** (`82c9196`, NEW `GroundUnitManager.createAIUnit({ archetypeId, empireId, planetId, q, r,
morale, deployed = true })` → `{ ok, unit | reason }`; `owner` I `factionId` = imperium, rozkładany archetyp
`deployed` od utworzenia, morale przycięte do [0, 100], `popCost` 0; `g2_create_ai_unit_smoke` 26/26).
⚠ **Jednostkę AI tworzy się WYŁĄCZNIE przez `createAIUnit`.** `createUnit` z samym `{ owner }` daje
`factionId 'humanity'` i przy 0 Kr jednostka przechodzi w `offline` i znika (pin P2), a forma 5-argumentowa oddaje
ją graczowi (pin P1d).
Decyzje **D8–D18** (podpis 2026-10-02, `AI_GARRISON_PLAN.md` §1; faza A G2 — §5e): D8 rozpad jednostek
defensywnych przy morale 0 ZOSTAJE · D9 drabina sumy poziomów fabryk (jedna tabela danych; zrewidowana 2026-10-03) · D10 garnizon
rozstawiony, nie w stosie · D11/D12 podział między ciałami, stolica = `capitalOf` · D13 bramka wojny (status
relacji `'war'`, zaczep `diplomacy:warDeclared`) · D14 wycofanie po pokoju (6 mies.) · D15 mobilizacja raz na
imperium · D16 zniszczenie ciała usuwa WSZYSTKIE jednostki · D17 stolice na oceanie · D18 kalibracja na fixture.
Nowe findingi **336–342**: ✅ **336** stolica AI na oceanie (nie do przejęcia z ziemi; zamknięty w G2-K1) · ✅ **337** łazik przejmuje
kolonię AI w pokoju · ✅ **338** „Wyładuj” bez bramek · ✅ **339** przejęcia ślepe na wojnę (trzy zamknięte w G2-2) · ⚪ **340** pule desantu ·
⚪ **341** uprząż vs fixture · ✅ **342** `homeColonyId: null` po zapisie (zamknięty 2026-10-15, AI STRIKES BACK S4-11).
✅ **G2-K1** (`8ea5af3` + `44967a3`, D17): stolica AI staje WYŁĄCZNIE na kaflu, na którym da się stanąć
(`EmpireColonyBootstrap._placeBuildingSmart`); w starych zapisach stolica nie do stania nie decyduje o przejęciu —
reguła placówki (`InvasionSystem.holdsDecisiveGround`); bliźniak AI — marsz terytorialny (`_findTerritorialGoal`)
omija taką stolicę. ⚠ **Jedno źródło „da się stanąć”:** tabela kosztu ruchu mieszka w DANYCH —
`GroundUnitData.GROUND_MOVE_COST` + `isStandableTile`; `GroundUnitManager` ją czyta (`MOVE_COST = GROUND_MOVE_COST`),
bez własnej kopii. Keeper `g2_ocean_capital_smoke` **28/28**; sweep **253/253**. Nowe findingi **343–347**:
🟠 **343** zwykłe budynki AI na oceanie (martwy test `tile.buildable`, 46/476 — osobny slice) · 🟠 **344** desant AI
na krawędzi bez drogi do stolicy · ⚪ **345** uśpiony nadpis typów kafli z `_biome.png` · ⚪ **346** stolice AI na
(−1,2), także na lodzie · 🟠 **347** `HexGrid.getNeighbors` asymetryczne (plik krytyczny).
✅ **G2-2 — bramka wojny** (`6391b23` keepery · `48c94dd` D13 · `dbfbbd6` D13a; live-gate właściciela PASS 2026-10-03,
plan §5i–§5k). NEW `src/utils/WarGate.js` — **jedno źródło** odpowiedzi „czy strona może wylądować na tym ciele albo je
przejąć”: `warGateRefusal(actor, planetId)` → `null | 'not_at_war'`. Źródło prawdy = **status relacji `'war'`**, nie
rekord wojny; rozejm i NAP blokują; ciało niczyje i własne **nie pytają dyplomacji**; obce ciało **fail-closed**. Sprawdzane
**w chwili lądowania** na każdej ścieżce (`unloadGroundUnit`, `dropTroop`, `deployAwayTeam`, `launchInvasion`) i w **obu
predykatach przejęcia** (gracza i AI); UI wyszarza z powodem `fleet.reason.notAtWar`. **D13a:** jedyną drogą wojsk na ciało
innego imperium są **kapsuły** — „Wyładuj” z ładowni nigdy, także w wojnie (`cargoUnloadRefusal`, powód własny
`fleet.reason.unloadForeignBody`).
⚠ **Bramka D13a siedzi w ŚCIEŻCE ŁADOWNI (`CargoLoadModal`), nie w `unloadGroundUnit`** — tę metodę wołają też kapsuły.
⚠ **Keeper testujący przejęcie lub desant MUSI wypowiedzieć wojnę w setupie** (`declareWar(e.id, 'keeper_setup')`; siedem
keeperów dostało to w `6391b23`); pokój pinują `g2_war_gate_smoke` i `g2_seams_smoke` P5 (odwrócony świadomie).
⚠ **`CargoLoadModal` wykonuje się pod node** na atrapie DOM z `headless/env.js` (nie importuje THREE) — klik prawdziwego
„Wyładuj” jest pinowalny WYKONANIEM (`g2_war_gate_smoke` W11).
Keeper `g2_war_gate_smoke` **70/70** (fail-first D13a 58/12) · `g2_seams_smoke` **31/31**; sweep **254/254**, `check-i18n`
3428. Nowe findingi **348–357**: 🟠 **348** okupacja i walka trwają w pokoju (→ G2-4/D14) · 🟠 **349** „Wyładuj” bez terenu,
nad ciałem bez kolonii celem dom · 🟠 **353** zabranie wojsk z cudzego ciała zgłasza sukces, a jednostki zostają —
**blokuje D14** · 🟠 **354** płatnik utrzymania = kolonia CIAŁA: kolonia AI płaci za jednostkę gracza (rodzina 329) ·
⚪ **350** / **351** surowe slugi i ciche odmowy (polerka UI) · ⚪ **352** `force_invasion` tylko w konsoli · ⚪ **355**
opóźnienie mapy w trybie zrzutu (345 wykluczony) · ⚪ **356** „undefined” w oknie ładowni · ⚪ **357** „Player Empire”
w dymku ciała wroga. Przepięcie pinu W9d poza pre-approval D13a — **zostaje** (odpowiedź (a) z 2026-10-03, plan §5m).
✅ **G2-3a — planer garnizonu** (`053fcc0`, plan §5l–§5m): NEW `src/data/GarrisonData.js` (JEDYNE miejsce liczb D1/D9/D10/D11)
+ NEW `src/utils/GarrisonPlanner.js` — czyste funkcje: limit `max(2, floor(POP imperium / 16))` × mnożnik szczebla (floor PO
klamrze), szczebel, skład **na ciało**, podział (stolica `ceil(limit/2)`, reszta po jednej, pełne kolonie przed placówkami
z `Xe`/`Nt`), heksy w spirali wokół kotwicy (jeden na heks; brak miejsca = `missing`, NIGDY stos). Planer niczego nie
tworzy; odczyt `KOSMOS.debug.garrisonPlan()`. **D9 po rewizji 2026-10-03** (suma fabryk zatrzymuje się na 20 — fixture
20/20 przy gy 60, uprząż najwyżej 24 przy gy 100): <6 → morale 30 · 6–13 → 50 · 14–19 → 100 + co trzecia jednostka ciała
`rocket_artillery` · 20+ → jw. × 1,25. Plan fixture'u GATE-S4: limit 13, stolica 7 (2× artyleria), po jednej na sześciu
ciałach. ⚠ **Kotwica:** stolica tylko wtedy, gdy da się na niej stanąć; inaczej — i dla placówki — pierwszy kafel z budynkiem,
na którym da się stanąć (odpowiedź (d)). Keeper `g2_planner_smoke` **77/77**; sweep **255/255**.
✅ **G2-3b — mobilizacja** (`6fc2c8d` C-S1 · `24beea4` C-S2 · `2437725` C-S3; live-gate właściciela PASS 2026-10-03, plan
§5n–§5p). NEW `src/systems/GarrisonSystem.js` (`window.KOSMOS.garrisonSystem`) wykonuje plan G2-3a **wyłącznie** przez
`createAIUnit`: zaczep `diplomacy:warDeclared`, **raz na imperium** (flaga `empires.<id>.garrison` — `EmpireRegistry`
`isGarrisonMobilized` / `markGarrisonMobilized`; v101 bez migracji), zapis wczytany już w wojnie mobilizuje się na
**pierwszym ticku** (`reconcile`); imperium bez pełnej kolonii — nic i bez flagi; brak wolnego heksu — rezerwa, nigdy stos.
C-S2: przy zmianie właściciela ciała znikają jednostki POPRZEDNIEGO właściciela-AI, przy zniszczeniu — wszystkich imperiów
AI (D6/D16, **319**); **jednostki gracza zostają** (→ **358**, G2-4). C-S3: NEW `src/utils/TileOwnership.js` —
`stampUnownedTiles`: kafle kolonii AI niosą id imperium od bootstrapu i od pierwszego ticku w starych zapisach (**318**).
Odczyt: `KOSMOS.garrisonSystem.listUnits('emp_…')`; audyt `garrison:mobilized` / `mobilizeSkipped` / `unitsRemoved`
w `DebugLog.TRACKED_EVENTS`.
⚠ **Keeper przejęcia, który potrzebuje NIEBRONIONEJ kolonii AI w wojnie, wyłącza mobilizację w setupie**
(`garrisonSystem.enabled = false`; pole instancji tylko dla keeperów — odpowiedź (a), §5p; w grze zawsze `true`).
⚠ **Stempel kafli ma skutek dla okupacji:** obrońca AI na własnym kaflu nie resetuje już licznika gracza — licznik biegnie
mimo żywego obrońcy (**359**, → G2-4 R2).
Keeper `g2_mobilisation_smoke` **56/56** · `g2_seams_smoke` **31/31** (P6a/P6c i P3a/P3b odwrócone świadomie, P6b nie);
sweep **256/256**. Nowe findingi **358–362**: 🟠 **358** los jednostki gracza na ciele zniszczonym albo oddanym AI · 🟠 **359**
licznik okupacji przy żywym wrogu · ⚪ **360** imperium bez pełnej kolonii mobilizuje się dopiero przy następnej wojnie
albo wczytaniu (→ G3: uzgadnianie co rok) · ⚪ **361** martwe `rocket_artillery.terrainModifiers` · ⚪ **362** kopia
przedimportowa nie mieści się przy dużym zapisie (fixture GATE-S4 2,09 mln znaków; limit ok. 5,24 mln na wszystkie klucze);
**345**/**355** rozszerzone o widoczny `GET 404` na `_biome.png`. **Zakres G2-4 (R1–R7) podpisany 2026-10-03** — plan §5p.
✅ **G2-4 — po pokoju** (`edd6fd1` C1a · `cd1fc46` C1b · `1a41c62` C2 · `8c82cf7` C3 · `39c9227` C4 · `1fefcdc` komentarz P6b;
bramka live właściciela 2026-10-04: **silnik PASS, trzy wady widoku**; plan §5q–§5s). **R1/R2** — NEW
`WarGate.groundOwnersHostile` jedynym źródłem „czy te strony walczą na ziemi”: gracz↔imperium tylko przy statusie `'war'`
(ogień, przechwycenie, pościg, marsz, okupacja); na heksie z żywym wrogiem licznik okupacji STOI dla obu stron (**348**,
**359**). **R3–R5** — NEW `src/systems/WithdrawalSystem.js` (`window.KOSMOS.withdrawalSystem`): przy `diplomacy:peaceSigned`
jednostki gracza na ciałach drugiej strony (także ciało oddane w cesji) dostają flagę `withdrawal` z terminem 6 mies.
(`WITHDRAWAL_YEARS = 0.5`), ostrzeżenie miesiąc wcześniej, w terminie usunięcie jak polegli (`groundUnit:destroyed`,
`withdrawal_deadline`); jednostki imperium z ciał gracza znikają od razu (**R4**); flaga gaśnie przy załadunku, przejęciu
ciała i powrocie wojny; flaga w zapisie (v101 bez migracji). **R6** — ładownia wygrywa z utrzymaniem (`prevStatus`), żołd
jednostki gracza nigdy nie obciąża kolonii innego właściciela (`_groundUnitPayerId`; **353**, **354**). **R7** — jednostka
gracza na zniszczonym ciele znika z pełnym zwrotem POP, także ciało bez kolonii (`entity:removed`; **358**). Odczyt:
`KOSMOS.withdrawalSystem.listFlagged()`; audyt `withdrawal:ordered/aiRemoved/warning/expired/cleared`.
⚠ **Keepery ze sceną walki lub okupacji na ziemi muszą wypowiedzieć wojnę w setupie** — od R1 w pokoju nie ma ognia ani
okupacji (C1a: cztery keepery, asercje bez zmian; odwrócone świadomie `g2_mobilisation_smoke` M9c i M8 — zgoda
właściciela, §5s (1)).
⚠ **`withdrawal:expired` leci raz na CIAŁO**, nie na jednostkę — na bramce `expired: 2` oznaczało usunięcie B na Thuban d
i ośmiu jednostek na Thuban e.
Keeper `g2_after_peace_smoke` **73/73** · `g2_mobilisation_smoke` **56/56** · `g2_seams_smoke` **31/31**; sweep
**257/257**, `check-i18n` 3440. Nowe findingi **363–367**: 🟠 **363** pokój nie cofa okupacji kafli (nowa wojna daje
przejęcie kolonii AI bez wojsk) · 🟠 **364** ostrzał z orbity bez bramki wojny · ⚪ **365** łazik usunięty w terminie albo
z ciałem zostawia `awayTeamUnitId` · ⚪ **366** stare zapisy: jednostki gracza w pokoju na cudzym ciele bez flagi · ⚪ **367**
R4 i R7 bez wpisu w Dzienniku. Wady widoku z bramki: brak meldunku o utracie wojsk w terminie (F5), „Unknown empire” we
wpisach wycofania (F6), „duch” jednostki na mapie kolonii (F7).
✅ **Follow-upy G2-4 (F1–F7)** (`39e2df6` F1 · `4c60e5b` F2 · `86a6d2a` F3 · `8785b41` F6 · `30bc68c` F4 · `f8f9cdb` F5 ·
`f90bc14` F7; bramka live właściciela 2026-10-04 **PASS**; plan §5t–§5u). **F1** (**363**) — pokój cofa okupację kafli na
koloniach OBU stron (`TileOwnership.revertPeaceOccupation` — jedno źródło „co pokój cofa”). **F2** (**364**) — ostrzał
z orbity na ciało innego imperium tylko w wojnie (akcja, żądanie, wystrzał, strażnik silnika; powód
`fleet.reason.strikeNotAtWar`). **F3** (**366**) — stary zapis: flaga wycofania przy WCZYTANIU (`armLoadReconcile` z bloku
wczytania `GameScene`, uzgodnienie na pierwszym ticku; sesja bez wczytania — nic). **F4** (**367**) — wpisy w Dzienniku dla
R4 (☮) i R7. **F5** — utrata wojsk w terminie: Dziennik I dzwonek, raz na ciało. **F6** — NEW `src/utils/EmpireName.js`
(`empireLogName`: nazwa STRONY TRAKTATU). **F7** — NEW `src/ui/ColonySelectionLogic.js` (zaznaczenie bez „duchów”);
`moveUnit` odmawia jednostce `'in_cargo'`.
✅ **Poprawki po bramce follow-upów** (odpowiedzi właściciela 2026-10-04, bez osobnej bramki; plan §5v): (b) `cafd6e8`
PL „☮ Pokój z imperium {0}” (**371**) · (f) `2c9511f` wpis F3 przy wczytaniu bez „Peace with” (**376**) · (d) `5fefe33`
stare zapisy: jednostki AI bez wojny na ciałach gracza znikają przy wczytaniu (**368**) · (e) `8427b0a` stare zapisy: kafle
zajęte przez stronę bez wojny wracają przy wczytaniu (**369**, reguła F1) · (g) `96c636f` łazik usunięty dowolną drogą
zdejmuje `awayTeamUnitId` (**365**). ✅ **(a) w wersji OGRANICZONEJ** `dcc4c6f` (**370**, decyzja właściciela 2026-10-04,
plan §5w): ostrzeżenie „został miesiąc” gaśnie samo PRZED terminem, gdy straciło przedmiot (żadna oflagowana jednostka nie
stoi już na ciele — załadowane, flaga zdjęta, usunięte inną drogą — albo wróciła wojna); **w terminie NIE gaśnie** — obok
staje meldunek o utracie i plakietka rośnie; od terminu gasi je gracz albo powrót wojny — **`8cd8d7c`** (odpowiedź (a)
właściciela 2026-10-05: wojna gasi ostrzeżenie ZAWSZE, także po terminie; meldunek o utracie zostaje; plan §5z). Pełną
wersję odrzucono (meldunek zastępował ostrzeżenie, plakietka 2 → 2). Jeden próg terminu dla usunięcia jednostek i dzwonka: `withdrawalDeadlineReached`
(`WithdrawalSystem`). ✅ **378** `5c49b36`: `GroundUnitManager.restore` na końcu zeruje `vessel.awayTeamUnitId` wskazujący
jednostkę spoza rejestru.
⚠ **Uzgodnienie przy wczytaniu (`WithdrawalSystem.reconcileAfterLoad`) robi trzy rzeczy, w tej kolejności:** kafle (e) →
jednostki AI (d) → flagi jednostek gracza (F3). „Nie w wojnie” dla (d)/(e) = `groundOwnersHostile` — pary AI↔AI nietknięte.
⚠ **Odnośnik łazika:** `removeUnit` (→ `_pruneFromVessels`) czyści `vessel.awayTeamUnitId` — id łazika czytać PRZED
`removeUnit`. Przy wczytaniu sprzątanie martwych odnośników siedzi na końcu `GroundUnitManager.restore` — wymaga, by blok
wczytania `GameScene` odtwarzał statki PRZED jednostkami (pin Z378).
Keepery `g2_peace_followups_smoke` **67/67** · `g2_peace_closing_smoke` **64/64** (**65/65** po `8cd8d7c`); sweep
**259/259**, `check-i18n` 3448.
Findingi **368–378** (plan §6): ✅ **368** · **369** · **371** · **376** (poprawki) · ✅ **370** ((a) ograniczona) · ✅ **378** ·
⚪ **372** trzy reguły nazwy imperium · **374** martwy `FleetTabPanel` · **375** polskie literały (`ColonyOverlay`,
`CargoLoadModal`; od G3 także `DropTroopsModal`) · **377** polska gramatyka „z {0}” w trzech innych wpisach — etap polerki
UI · **373** akcje silnika bez bramki `in_cargo` — później. (d) — „jeden wpis na ciało” = jeden na ciało i imperium —
**zostaje** (odpowiedź właściciela 2026-10-04).
**G2 ZAMKNIĘTE.**
✅ **G3 — odrastanie i widoczność garnizonu** (`47b1b96` G3-1/G3-2 · `b3fe807` G3-3 · `92d1b8e` G3-4; bramka live właściciela
2026-10-05 **PASS** na istniejącym zapisie przy gy 60; plan §5x–§5z). **G3-1** — `GarrisonSystem.regrowEmpire` + kontrola
roczna `_yearlyCheck` (`time:tick`): po pierwszej mobilizacji imperium odzyskuje **1 jednostkę na rok gry**
(`GARRISON_REGROWTH_PER_YEAR`), w wojnie i w pokoju, do limitu liczonego w chwili tworzenia (szczebel, morale i archetyp
z tej chwili); ciało z największym niedoborem planu (remis — stolica), bez wolnego heksu — następne ciało, bez miejsca
nigdzie — nic w tym roku; wyłącznie `createAIUnit`. Dokładnie raz na rok przez zapis, pauzę i prędkość — `regrowthYear`
w rekordzie flagi (`EmpireRegistry.setGarrisonRegrowthYear`); zapis sprzed G3 — bez nadrabiania lat (v101 bez migracji).
**G3-2** (**360** ✅) — ta sama kontrola na granicy roku mobilizuje imperium w wojnie bez mobilizacji (`reason:
'reconcile_yearly'`). **G3-3** — NEW `src/utils/GarrisonReadout.js` (jedno źródło odczytu i tekstu): wiersz „Garnizon”
na karcie ciała (`BottomContext`) i „Garnizon celu” w oknie zrzutu (`DropTroopsModal`) — liczba przy wywiadzie `detailed`,
rezerwa planu przed pierwszą mobilizacją, poniżej `detailed` — „nieznany”. **G3-4** — jeden wpis w Dzienniku (kanał Wywiad,
bez dzwonka) przy mobilizacji imperium, z którym gracz ma kontakt; nazwa i liczba dopiero przy `detailed`; odrastanie wpisu
nie daje.
⚠ **Rok gry odrastania = 1,0 na zegarze `gameTime` (= 12 civY);** granica roku = wzrost `floor(gameTime)` z tolerancją 1e-9.
Na bramce pomocnik `__year()` przesuwał zegar o więcej niż rok na wywołanie — reguła „jedna jednostka na granicę roku, nic
ponad limit” się utrzymała.
⚠ **Bramka G3 nie ćwiczy G3-2** — mobilizację w jej krokach robi `diplomacy:warDeclared` (G2-3b); G3-2 stoi wyłącznie na
keeperze R7. Karta ciała sprawdzona na imperium testowym (`spawnTestEnemy`) — stolic realnych imperiów gracz nie mógł kliknąć.
Keeper `g3_regrowth_smoke` **64/64** · `g2_peace_closing_smoke` **65/65**; sweep **260/260**, `check-i18n` 3455. Odpowiedzi
właściciela (a)–(h) 2026-10-05 — plan §5z: (b)–(d), (f), (g) potwierdzają kod; (e) wiersz garnizonu w nagłówku
`ColonyOverlay` — etap polerki UI; **(a)** → `8cd8d7c`; **(h) = Finding 379** — wroga jednostka naziemna na mapie ciała jest
rysowana, zaznaczalna i wypisywana tylko, gdy ciało jest kolonią gracza, gracz ma na nim własne jednostki albo ma wywiad
`detailed` o jej właścicielu; karta ciała tą samą regułą — follow-up z osobną bramką w przeglądarce.
**G3 ZAMKNIĘTE.**
✅ **Follow-up (h) i G1c — utrata POP jednostek gracza i widoczność wrogich jednostek** (`ad0a615` 379 · `b1eac7a` P1 ·
`0fbbd59` P2 · `4a4f909` P3 · `732507d` P4 · `4d625a9` P5 · `790f3b7` P6; follow-upy `b926d81` 380 · `1c90ea4` 381; bramka
live właściciela 2026-10-06 **PASS**; plan §5za–§5zc). **(h) / 379** — NEW `src/utils/GroundVisibility.js` (jedno źródło
reguły): cudza jednostka naziemna jest rysowana, zaznaczalna i wypisywana na mapie ciała tylko, gdy ciało jest kolonią
gracza, gracz ma na nim własne żywe jednostki (nie w ładowni) albo ma wywiad `detailed` o jej właścicielu; własne zawsze,
ukryte cudze nigdy; karta ciała i okno zrzutu (`GarrisonReadout`) tą samą regułą. **P1 (333)** — część POP poległej
jednostki, której tabela śmierci nie oddaje, ginie OD RAZU w kolonii macierzystej z terminem właściciela
(`killCrew(…, 'ground_unit_lost')`), zwrot po zwłoce jak dotąd; archetyp spoza tabeli — ginie całość (Q3); bez osobnej linii
w Dzienniku (Q4). **P2 (330)** — NEW `ColonyManager.disbandGroundUnit`: ręczne rozwiązanie oddaje pełny koszt POP od razu;
karta jednostki woła tę metodę i nie emituje śmierci. **P3 (328)** — kolejka opóźnionych zwrotów w zapisie kolonii
(`pendingPopReturns`, termin jako pozostały czas; zapis sprzed G1c — pusta kolejka). **P4 (329)** — rozwiązanie z braku
utrzymania przez `releaseGroundUnitPops` (termin właściciela). **P5 (327)** — mina niesie pełny ładunek śmierci; rozliczenie
dokładnie raz (`_popsReleased`). **P6 (zmiana R7)** — jednostka gracza na zniszczonym ciele — jak polegli, nie pełny zwrot.
**380 (Q2)** / **381 (Q5)** — NEW `ColonyManager._severGroundBondsOnOwnerChange`, wołany w `transferColony`
i `captureColonyForPlayer` zaraz po zapisie nowego właściciela, przed emisją zdarzenia: blokady POP jednostek poprzedniego
właściciela z domem w tej kolonii i zwroty w jej kolejce zwalniane W MIEJSCU (ludzie zostają z kolonią), jednostki walczą
dalej z `popCost` 0 i bez domu; kolejka rekrutacji tej kolonii anulowana (blokady wracają, surowce i Kr przepadają).
⚠ **Reguła właściciela dla POP jednostek naziemnych obejmuje teraz WSZYSTKIE drogi wyjścia** (śmierć, ręczne rozwiązanie,
brak utrzymania, rozpad morale, mina, zniszczone ciało, termin wycofania) i zmianę właściciela kolonii — żadna blokada nie
zostaje na zawsze, żadna kolonia innego właściciela nic nie dostaje.
⚠ **Keeper testujący przejęcie kolonii z jednostką gracza:** od 380 przejęcie zrywa więź POP — meldunek `popsLost` przy
późniejszej śmierci już nie leci; regułę właściciela dla zapisów sprzed 380 pinuje `g1c_pop_loss` L7e (stempel właściciela
jak przy wczytaniu).
Keepery `g1c_pop_loss_smoke` **86/86** · `g3_ground_visibility_smoke` **49/49** · `ground_unit_loss_smoke` **29/29**; sweep
**262/262**, `check-i18n` 3455. Nowe findingi **382** (karta ciała liczy ukryte drony — uśpiony) i **383** (panel kafla obcej
kolonii bez reguły widoczności — decyzja właściciela).
**G1c ZAMKNIĘTE.**
✅ **G2b — desant AI na modelu jednostek gracza (D7, D9)** (`980043f` S1 · `f027e7c` S2 · `23a87e5` S3; bramka live
właściciela 2026-10-06 **PASS**; plan §5zd–§5zf). **S1** — `InvasionSystem.launchInvasion` tworzy każdą jednostkę desantu
przez `createAIUnit`: skład i morale ze szczebla drabiny D9 imperium w chwili desantu (`garrisonTier`
+ `GarrisonPlanner.invasionComposition`: `shock_infantry`, na szczeblach od 14 i od 20 poziomów fabryk co trzecia jednostka
fali `rocket_artillery`; morale 30 / 50 / 100 / 100), `owner` i `factionId` = imperium, `popCost` 0, bez domu,
`deployed: false`. **S2 (323)** — jawna lista (`embarkedTroops`) tą samą drogą (`invasionTroops`): wpis spoza typów prostych
AI (`GarrisonData.AI_FIELDED_ARCHETYPES`) dostaje typ ze składu szczebla na tej pozycji. **S3 (340)** — `INVASION_UNIT_POOLS`
usunięte (klucze puli nie należały do żadnego imperium z generatora — desant był zawsze legacy `infantry`); katalog legacy
`GROUND_UNITS` zostaje (stare zapisy, łazik).
⚠ **Jednostkę naziemną AI tworzy się WYŁĄCZNIE przez `createAIUnit` — także desant;** jedyny omijacz po stronie AI to
debugowy `SpawnTestEnemy` (**386**). Jednostki legacy AI zostają tylko w starych zapisach (bez migracji) i są w walce
praktycznie nie do zabicia (**387**).
⚠ **Pin `startup_units_zero_smoke` T2 przecelowany za zgodą właściciela (Q-T2)** — z `gum.createUnit(type, planetId, hex.q,
hex.r` na `gum.createAIUnit(`; T5 przewrócony (pula nie istnieje).
Pomiar (uprząż, 50 prób na komórkę): bez obrońców przejęcie 100 % na każdym szczeblu; przy 4 obrońcach z morale +90 desant
2 jednostek nie przejmuje (0 %), 4 — 0–32 %, 6 — 18–100 % (legacy 96–100 %). Odpowiedzi właściciela 2026-10-06: najwyższy
szczebel = oba szczeble z artylerią; wpis listy spoza typów prostych — typ ze składu szczebla; `deployed: false` tylko dla
`garrison_unit` z listy; **bez osobnego kroku balansu — wielkość desantu ustali następny arc**; **383** — panel kafla obcej
kolonii tą samą regułą co jednostki (379), etap polerki UI.
Keeper NEW `g2b_invasion_smoke` **22/22** · `startup_units_zero_smoke` **19/19** · `g2_ocean_capital_smoke` **28/28** (setup:
dwa `Math.random()` zastępują losowania dawnej puli — **388**); sweep **263/263**, `check-i18n` 3455. Nowe findingi
**384–390** (plan §6): 🟠 **384** desant z ładowni AI duplikuje ładunek (uśpiony — uzbraja się z desantem z ładowni, Findingi
49/201) · ⚪ **385** bramki mobilności AI czytają tabelę legacy · **386** · **387** · **388** · **389** ułamkowy `troopCount`
⌈n⌉ → ⌊n⌋ · **390** nieaktualne teksty o puli w dwóch keeperach.
**G2b ZAMKNIĘTE. ARC AI GARRISON ZAMKNIĘTY** (G1, G1b, G2, G3, G1c, G2b). Poza arciem: limit floty, odbicie kolonii,
przyczółek — następny arc (zakres właściciela 2026-10-06).

---

## AI STRIKES BACK — flota, strażnik, desant i kampania AI (save **v101 bez migracji**, ROZDZIAŁ ZAMKNIĘTY 2026-10-15, w kodzie 2026-10-16 — S0–S4 zacommitowane, bramki S0–S4D PASS)

Po AI GARRISON imperium AI broniło swoich ciał na ziemi, a w przestrzeni nie miało zębów — rozdział dał mu flotę z PULI
tworzonej przy mobilizacji, z limitem z siły imperium i odrastaniem (S1), strażników NA ORBICIE stolicy i drugiego
strzeżonego ciała (S2), eskadrę z transportowcem i prawdziwym ładunkiem, lot grupy razem, desant na cel eskadry
i odbijanie utraconych kolonii (S3), a na końcu kampanię układ po układzie, wojnę z własnej inicjatywy i koniec wojny
przy wyczerpanej kampanii — depeszę status quo bez oceny AI (S4); po drodze trzy defekty bramkujące (S0: 391–394),
poprawki ruchu, wraków i starć przed S3 (S2b: 415–419, 424, 425) i garnizon gracza na zdobytym ciele (S4: 442–445).
Nowe systemy: `FleetPoolSystem`, `StrikeSquadronSystem`, `DirectorRetake`, `DirectorCampaign`, `DirectorOpportunityWar`;
jedna tabela strojenia `src/data/StrikesBackData.js` (18 kluczy; konsola `KOSMOS.debug.sbTuning()` / `sbSet` /
`sbReset`, wartości w zapisie). Commity kodu: 51 (ostatni `35defd1`); decyzje SB1–SB96; keepery `sb*`: 46; sweep
263 → 309/309, `check-i18n` 3455 → 3458.

Stan: sesja 4 — bitwa pomijana na ciele już własnym napastnika (447 / SB93), pierścień cudzej kolonii bez zwolnienia
z zaopatrzenia (448 / SB94), każda eskorta w drodze w warunku depeszy (SB96, rozszerzenie SB89 (ii)) — zacommitowana
2026-10-16 (`cf39977` · `458146e` · `35defd1`) po bramce S4D (PASS) i zgodzie na przecelowanie R-S4d-1; 447 i 448
zamknięte. Otwartych findingów arca 22; pierwszy
wolny numer **449**. ⚠ Reguły wiążące dalej (pełna lista — plan §8.7): kadłub AI z puli WYŁĄCZNIE przez
`VesselManager.createAIVessel`, eskadra WYŁĄCZNIE przez `StrikeSquadronSystem.launchSquadron`, jednostka AI WYŁĄCZNIE
przez `createAIUnit`; keeper, który wypowiada wojnę, a nie pinuje puli, wyłącza ją w setupie (`fleetPoolSystem.enabled =
false`); lot do ciała ma jedno źródło przylotu (`VesselManager._interceptBody`); koszt w Kr kolonii jednym pobraniem
(`ColonyManager._spendColonyCredits`); pomiary walki i ruchu w trybie klatek. Świadomie poza rozdziałem: AI↔AI, liczba
imperiów AI, prawdziwa produkcja okrętów AI, 447 (b) — po Alfie. **Następny arc: polerka UI i grafiki** — pierwszy krok:
model czasu starcia w przestrzeni (**438** / **436**, SB68 kierunek (c)), potem 441 i literały i18n (404, 409, 412).

Podsumowanie rozdziału (co weszło slice po slice z zakresami commitów, tabela strojenia, indeks decyzji, findingi,
reguły wiążące dalej, następny arc): `docs/design/AI_STRIKES_BACK_PLAN.md` §8; historia sesji — §5a – §5u; rejestr
findingów #391 – #448 — §6; audyt fazy A — `docs/design/AI_STRIKES_BACK_AUDIT.md`; foldery przekazania
`kosmos-handover/ai-strikes-back*/`.

---

