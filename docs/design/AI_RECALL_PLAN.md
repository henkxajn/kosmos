# Z2 — „AI wraca po ataku": rajder przestaje być STAŁĄ BAZĄ WYSUNIĘTĄ

> **Status:** ✅ **PODPISANE 2026-08-31 (D-Z2-1…D-Z2-10, wszystkie zgodnie z rekomendacją) i WDROŻONE.**
> Wykonanie: §11. Live-gate: **PENDING** (skrypt w §7).
> Rejestry macierzyste: `VO3B_PLAN.md` §6/§9 (GATE B2 · Z2) · `AI_COMBAT_MISSION_PLAN.md` §3 (anatomia)
> · `OPEN_FINDINGS_INDEX.md` §D1 ①. Save **v101, zero migracji** (stan runtime).
> Sondy pomiarowe: scratchpad, **poza repo** (`probe-z2-{a,b,c,d,e,f}.mjs`).

---

## 0. Reguła wejścia — co uruchomiłem PRZED audytem i co to zmieniło

`ai_combat_mission_pause_smoke` **19/19 zielony** · sweep **191/191, 0 FAIL** · `git log -S "recall"`,
`-S "returnHome"`, `grep homeSystemId`.

Wynik: **wpis rejestru jest prawdziwy, ale jego RAMA jest błędna.** Trzy sprostowania na wejściu:

1. **`empire.homeSystemId` ISTNIEJE** (`GameState.js:22`), wbrew `AI_COMBAT_MISSION_PLAN` §2(b)
   („pojawia się wyłącznie w kolonizacji i logistyce"). Tamto zdanie mówiło o `src/systems/`, nie
   o modelu danych. **Ale i tak nie jest kanonem** — kanonem „gdzie jest dom imperium" jest
   `directorProduction.capitalOf(empireId)`, używany już przez **cztery** moduły Directora.
2. **Predykat „statek jest w starciu" NIE MUSI powstać — on istnieje** (§4). Grep z F130 §8 pytał
   o dwie nazwy, których nie ma (`_vesselToEncounter`, `isInCombat`), a nie o mechanizm.
3. **Producentów parkowania jest SIEDEM, nie dwa** (§1.2). To przesądza kształt naprawy (§5).

---

## 1. Inwentarz — cztery składniki z anatomii, zweryfikowane w źródle

| składnik | miejsce | stan |
|---|---|---|
| parkowanie po starciu deep-space | `DeepSpaceCombatSystem._freezeAsStationary:1222` | ✅ potwierdzony |
| parkowanie po wygranej orbitalnej | `EnemyAttackHandler:240-246` (`dockedAt = planetId` GRACZA) | ✅ potwierdzony |
| brak filtra puli | `DirectorOffensive.strikeReadyVessels:71-95` | ✅ potwierdzony |
| brak kosztu paliwowego | `OrderService.issueAttack:167` (`bypassFuelCheck`) | ✅ potwierdzony — i **głębszy, niż zapisano** (§1.3) |
| **brak logiki powrotu** | — | ✅ potwierdzony |

### 1.1 Czego anatomia NIE mówiła, a co zmienia zakres

- 🔴 **`EnemyAttackHandler:93-98` ZBIERA ZAPARKOWANE RAJDERY DO KAŻDEJ NASTĘPNEJ BITWY.** Pętla nie
  patrzy na `arrivedVesselIds` — bierze **wszystkich** wrogów `orbiting` z `dockedAt === planetId`.
  Zaparkowany rajder nie jest więc bezczynny: **rośnie stos bojowy**, bo każde kolejne uderzenie
  bije razem z poprzednimi ocalałymi. AI nie musi nic budować, żeby uderzać mocniej.
- 🔴 **Zaparkowany rajder TRWALE ZRYWA PULĘ HUBU ORBITALNEGO gracza.**
  `SystemPoolService._hostileWarshipInOrbit:346-359`: uzbrojony wrogi statek z `dockedAt === body.id`
  ⇒ `isBlockaded` = true ⇒ kolonia-księżyc odcięta („⚠ Łącze zerwane"). To jest **realna, ciągła
  szkoda gospodarcza**, niezależna od bitew, i gracz nie ma jak jej zdjąć poza zabiciem rajdera.
- 🔴 **`war:peaceSigned` (`WarSystem.js:447`) ma ZERO konsumentów poza `DebugLog`.**
  ⇒ **okupacja przeżywa POKÓJ.** Rajder stoi na orbicie gracza po podpisaniu pokoju, dalej blokuje
  pulę i dalej jest kombatantem: `DSCS._inCombatState` przyjmuje `orbiting` (`:1535-1540`), a
  `handleCombatRangeEnter` **nie ma bramki wojny** — każdy okręt gracza, który się zbliży, wchodzi
  w starcie.
- 🟠 **`AutoRetreatSystem` jest CZWARTYM producentem parkowania.** `RetreatTarget` ma tier
  `NEUTRAL` i `FOREIGN` (`:53`, `:101`), więc rajder wycofany w układzie gracza ląduje na ciele
  NICZYIM albo **należącym do gracza** — czyli znowu na jego podwórku.

### 1.2 Pełna lista producentów stanu „uzbrojony okręt AI stoi poza domem"

1. `EnemyAttackHandler:240-246` — zwycięstwo orbitalne (dokuje przy planecie GRACZA).
2. `DSCS._freezeAsStationary` — zamrożenie na czas starcia; po F130 misja wraca, ale gdy misja
   już się DOMKNĘŁA (przylot), rajder zostaje z `mission=null`.
3. `DSCS` remis / rozejście się stron — rajder w deep space, `dockedAt=null`.
4. `AutoRetreatSystem` → `RetreatTarget` tier NEUTRAL/FOREIGN.
5. `MOS._blockAndCancel` / anulowanie rozkazu w locie.
6. Wczytanie starego zapisu z już zaparkowanymi rajderami.
7. Dźwignie debugowe (`spawnEnemyRaider`, `spawnEnemyAttack`).

⚠ **To jest cała treść decyzji D-Z2-1.** Hook u każdego producenta jest dokładnie tą pułapką, którą
repo nazwało po `131cc2e`: **„policz PRODUCENTÓW zdarzenia, zanim uznasz klasę za utwardzoną"**.

### 1.3 Paliwo — pomiar OBALA założenie, że to jest dźwignia

| fakt | źródło |
|---|---|
| bak warp okrętu AI startuje **PUSTY** (`warpFuelCurrent` domyślnie 0) | `Vessel.js:126` |
| `dispatchInterstellar` **omija `canJump` dla `isEnemyVessel`** | `VesselManager.js:819` |
| `consumeWarpFuel` **klampuje do zera** (AI leci „na oparach") | `Vessel.js:402-408` |
| `startReturn` **omija bramkę paliwa dla AI** | `VesselManager.js:589` |
| każdy rozkaz AI idzie z `bypassFuelCheck` | `OrderService:167,257` · `DirectorDoctrine:152,179` |
| rezerwa nie tankuje, a AI dokuje wyłącznie kurierem | `VesselManager._tickRefueling:1940` · `EmpireLogisticsSystem:461` |

⇒ **Paliwo nie jest dziś kosztem AI w ŻADNYM punkcie.** „Dokręcenie presji paliwowej na powrót"
nie wystroiłoby tempa — **wyłączyłoby ofensywę AI w całości** (bak pusty ⇒ zero skoków).
Decyzja D-Z2-7.

---

## 2. POMIARY WYKONANE PRZED KODEM

Wszystkie na **produkcyjnej** matematyce (`DirectorRuleMath.rollFires`, katalog `DIRECTOR_RULES`,
`calcShipStats`, prawdziwe szablony AI), sondy poza repo.

### Pomiar 1 — przynależność do pul (sonda A)

| stan rajdera | `strikeReadyVessels` | doktryna @stolica | rezerwa @stolica |
|---|---|---|---|
| **DZIŚ:** `orbiting` @ planeta GRACZA, `mission=null` | **[v_raider]** ✅ w puli | 0 | 0 |
| kontrola pinu: ten sam z żywą misją | [] | 0 | 0 |
| cel: `orbiting` @ WŁASNA stolica | [v_raider] | **1** | 0 |
| 🔴 **naiwna naprawa:** sam skok do domu (30 AU, `mission=interstellar_jump` zostaje) | **[]** | **0** | **0** |

🔴 **To jest najważniejsza liczba tego audytu.** „Po prostu każmy mu skoczyć do domu" **UNIERUCHAMIA
RAJDERA NA STAŁE**: `_tickInterstellar:2729-2736` stawia go na obrzeżach (30 AU, `dockedAt=null`,
`status='on_mission'`) i **zostawia misję `interstellar_jump`**, której nikt nie czyści. Wypada
z KAŻDEJ puli — gorzej niż dziś. **Powrót MUSI mieć drugi odcinek i stan końcowy.**

### Pomiar 2 — koszt czasowy przelotu (sonda C, prawdziwe szablony AI)

| | `frigate_laser_escort` | `frigate_missile_escort` |
|---|---|---|
| `speedAU` | 6,61 AU/rok | 6,16 AU/rok |
| `warpSpeedLY` | **18,0 LY/rok** | 18,0 LY/rok |
| skok 5 LY (powłoka `BORDER_LY`) | **0,28 roku** | 0,28 roku |
| **odcinek 30 AU** (obrzeża ↔ ciało) | **4,5 roku** | **4,9 roku** |
| paliwo na 30 AU | 0,2 / bak 20 | 0,2 / bak 20 |

⚠ **Skok jest czasowo darmowy; koszt to odcinek WEWNĄTRZUKŁADOWY.** ~10× dysproporcja. Zmiana
odległości międzygwiezdnej (5 → 9 LY, górna granica roszczenie+powłoka) przesuwa wynik o 0,2 roku —
**model jest na to niewrażliwy**.

### Pomiar 3 — TEMPO: bitwy, ostrzeżenie, okupacja (sondy E/F, 4 seedy × 100 lat wyświetlanych)

Symulacja pętli `DirectorSystem._evaluate` co do kolejności (cooldown → trigger → guard → rzut
raz na rok wyświetlany), z czasem lotu z Pomiaru 2.

| wariant | bitwy / 100 lat | ostrzeżenie przed uderzeniem | orbita gracza |
|---|---|---|---|
| **A. DZIŚ** — rajder parkuje | **19,8** (1 na 5,1 roku) | **0,0 roku** (pierwsze uderzenie 5,1; **każde następne 0**) | **zajęta 100 % czasu** |
| **B. W1** — powrót na ORBITĘ STOLICY | **10,0** (1 na 10,0 roku) | 5,1 roku | wolna |
| **C. W2** — powrót na OBRZEŻA własnego układu | 18,5 (1 na 5,4 roku) | 5,1 roku | wolna |

Przebieg `emp_001` (agresja 0,5) — rok BITWY:

```
DZIŚ  [ 1.0,  6.1, 11.1, 16.1, 21.2, 26.2, 31.3 …]
W1    [ 6.1, 16.2, 26.4, 36.6, 46.7, 56.9, 67.1 …]
W2    [ 6.1, 11.5, 16.9, 22.3, 27.7, 33.2, 38.6 …]
```

### Pomiar 4 — rajder W TRAKCIE bitwy JEST w puli uderzeniowej (sonda D)

```
przed starciem:    pula=[]        encounter=brak      mission=attack
W TRAKCIE bitwy:   pula=[v_ai]    encounter=AKTYWNY   mission=null  _suspended=attack
```

Obserwacja z F130 §8 **potwierdzona wykonaniem**: Director może teoretycznie wysłać na nowe
uderzenie okręt, który właśnie się bije. Skutek byłby gorszy niż „dziwny": nowy rozkaz ruchu
wyprowadziłby go z bąbla starcia, a `DSCS._handleCombatRangeExit` policzyłby stronę AI jako
**uciekającą** — czyli darmowe zwycięstwo dla gracza.

---

## 3. ⚠ CO POMIAR ZMIENIŁ W PROJEKCIE (a nie potwierdził)

**Zlecenie zakłada, że Z2 to slice o STROJENIU TEMPA** („jak długo rajder ma zostać zanim wróci,
jaki koszt paliwowy, jakie ryzyko przechwycenia"). **Pomiar tego nie potwierdza.**

1. **Tempa nie da się tu wystroić, bo już jest zaciśnięte gdzie indziej.** Wiążącym ograniczeniem
   jest `strike_player_target.cooldown = 5.0 lat` (`DirectorRuleData.js:254`), a rzut nasyca się
   do 100 % po kilku próbach. Powrót **krótszy niż cooldown jest w kadencji NIEWIDOCZNY** (sonda B:
   T = 3 lata ⇒ dokładnie te same 19,8 uderzeń).
2. **Dźwignia paliwowa nie istnieje** (§1.3) — jej „dokręcenie" nie jest strojeniem, tylko
   wyłączeniem ofensywy AI.
3. **Realną szkodą Z2 nie jest częstotliwość — jest BRAK OSTRZEŻENIA i TRWAŁA OKUPACJA.**
   Dziś drugie i każde kolejne uderzenie ląduje w **tej samej chwili**, w której zapada decyzja
   (rajder stoi 0 AU od celu), a między uderzeniami trzyma orbitę gracza: blokuje pulę hubu,
   rośnie w stos bojowy i pozostaje wrogim kombatantem **także po pokoju**.
4. **Knob tempa i tak zostaje w DANYCH.** Gdyby po naprawie AI wydało się zbyt rzadkie, poprawką
   jest **jedna liczba w katalogu** (`cooldown.years`), a nie mechanizm powrotu. To przesądza
   D-Z2-2 na korzyść W1: **skutek balansowy jest odwracalny jedną linią danych, a stan-sierota
   z W2 jest strukturalny.**

⇒ **Uczciwy tytuł slice'u:** nie „AI atakuje rzadziej", tylko **„uderzenie AI znowu ma DOLOT,
a orbita gracza przestaje być cudzą bazą"**.

---

## 4. Odpowiedź na pytanie o predykat „statek jest w starciu"

**NIE trzeba go budować. Istnieje i jest de facto kontraktem cross-system.**

`DeepSpaceCombatSystem._findActiveEncounterContaining(vesselId)` (`:1381`) — **sześciu konsumentów
poza własnym plikiem**:

| konsument | po co |
|---|---|
| `MovementOrderSystem._inActiveEncounter:625` | VO-3b D-VO1b-3 — odroczenie zwolnienia rozkazu |
| `MovementOrderSystem:476` | `_issueRetreat` — powód `not_in_combat` |
| `MovementOrderSystem:1213` | force-engage |
| `MovementOrderSystem:1971` | sweep `_pendingRelease` |
| `ProximitySystem:268` | rekoncyliacja par |
| `FleetSystem._tickCivYears:555` | pochodne `_inCombat` doktryny `retreat_at_50` |
| `ThreeRenderer:5974` | `combatCheck` |

Osiągalny przez `window.KOSMOS.deepSpaceCombatSystem` (zweryfikowane wykonaniem, sonda D).
⇒ **Ten slice go REUŻYWA wzorem `MOS._inActiveEncounter` — zero nowej maszynerii.** Jedyne, czego
brakuje, to **konsument w puli** (D-Z2-4). Prefiks `_` jest nazewnictwem, nie granicą: repo
przekracza ją od `23270dd` w siedmiu miejscach; nowa publiczna nazwa byłaby ósmą.

---

## 5. Kształt naprawy

### 5.1 MECHANIZM — powrót jako composite w JEDYNYM dozwolonym orkiestratorze

Powrót jest z natury **wielo-układowy**, a repo ma na to jedną regułę: `OrderService` jest jedynym
orkiestratorem multi-system. Dokładamy **czwarty rodzaj composite'u** obok
`transport` / `passenger` / `attack`:

```
OrderService.issueRecall(vesselId, { homeSystemId, capitalBodyId })
   └─ issueWarp  →  pendingOrder { kind: 'recall', targetSystemId, targetId: capitalBodyId }
   └─ _maybeDeliver, gałąź `recall`:  MOS.issueOrder(moveToPoint, targetBodyId = stolica,
                                                     bypassFuelCheck: true)
   └─ przylot → MOS._onVesselArrived → mission=null, status='idle', movementOrder zwolniony
      STAN KOŃCOWY: `orbiting` + `dockedAt = stolica`  ⇒  z powrotem we WSZYSTKICH pulach
```

Cztery powody, dla których to jest reużycie, a nie nowa matematyka:

- gałąź `attack` w `_maybeDeliver:247-267` jest **dosłownym wzorem** (skok → dopiero potem rozkaz
  wewnątrzukładowy, bo dopiero wtedy bramka układu w MOS przepuszcza);
- odcinek domowy to **dokładnie `DirectorDoctrine._holdAtHome:145-155`** (`moveToPoint` na ciało
  stolicy + `bypassFuelCheck`) — z jego pułapką `targetPoint` już rozwiązaną;
- `_resumePendingOrders()` daje **odporność na zapis/wczytanie za darmo**;
- stan końcowy jest **zmierzony jako pełnoprawny** (sonda A, wiersz „cel").

⚠ **NIE reużywamy `OrderService.issueReturn`** i to nie jest kwestia gustu:

1. czyta `vessel.colonyId`, a **`VesselManager._onColonyDestroyed:1136-1153` przepisuje `colonyId`
   BEZ FILTRA WŁAŚCICIELA na kolonię GRACZA** (`_resolvePlayerHomePort`, AC-8) ⇒ rajder mógłby
   dostać rozkaz powrotu **do domu gracza** (Finding Z2-1, §9);
2. jawnie zeruje `pendingOrder` (`:197`) — czyli z założenia **nie łańcuchuje**, a to jest właśnie
   brick z Pomiaru 1.

Domem jest **`directorProduction.capitalOf(empireId)`** — kanon używany już przez produkcję,
doktryny, mobilizację i ofensywę. Nie `vessel.colonyId`, nie `empire.homeSystemId`.

⚠ **`startReturn` jest tu MINĄ, nie skrótem:** liczy cel przez `_predictPosition(vessel.colonyId)`
(`VesselManager:567` → `:3425`), które **nie ma terminu układu** ⇒ interpolowałoby rajdera do
współrzędnych stolicy AI **wewnątrz układu gracza**. Klasa „globalne id ≠ położenie".

### 5.2 DECYZJA — reguła Directora z sondą-ZAMIATACZEM

Nowy moduł `src/systems/director/DirectorRecall.js`, **wzór `DirectorMobilization` co do joty**
(sonda + akcja + rejestrator nazw; akcja nigdy nie rzuca; odmowa jest zdarzeniem, nie ciszą):

```
sonda   strandedWarshipsAwayFromHome(empireId)  → ile uzbrojonych okrętów imperium jest POZA
                                                   swoim układem macierzystym i BEZCZYNNYCH
akcja   recallVessels(ctx, { count })           → do `count` z nich przez OrderService.issueRecall
```

Predykat „bezczynny i do odzyskania" — każdy warunek ma powód:

| warunek | dlaczego |
|---|---|
| `isEnemyVessel` + `ownerEmpireId === empireId` + `!isWreck` | jak wszędzie w Directorze |
| `hasWeapons` | kurier ma własną ścieżkę (`EmpireLogisticsSystem`) — ta sama granica co mobilizacja |
| `isInService` | rezerwa nie lata |
| `systemId !== homeSystemId` | to jest definicja „poza domem" |
| `!mission` · `!movementOrder` · `!pendingOrder` | ma zajęcie — także **trwający odwrót** `AutoRetreatSystem` |
| `!dscs._findActiveEncounterContaining(v.id)` | **§4** — nie wyciągamy nikogo z bitwy |
| id nieobecne w `enemyAttackHandler._pendingBattles` | ryzyko R1 (§9) — okno batchowania 500 ms |

⚠ **Zamiatacz, nie hook — i to jest cała odpowiedź na §1.2.** Siedmiu producentów, jeden konsument.

### 5.3 FILTR PULI — nie „na wszelki wypadek", tylko warunek determinizmu

`strikeReadyVessels` dostaje dwa warunki: `systemId === homeSystemId` **oraz** `!inActiveEncounter`.

⚠ **Bez filtra wynik zależałby od KOLEJNOŚCI KLUCZY W OBIEKCIE `DIRECTOR_RULES`.**
`DirectorSystem.tickEmpire:160` iteruje `Object.values(this._catalog)`, więc reguła uderzenia
i reguła powrotu ścigałyby się o ten sam kadłub, a zwycięzcę rozstrzygałaby pozycja wpisu
w pliku danych. Filtr czyni wynik **niezależnym od kolejności**: kadłub poza domem po prostu nie
jest materiałem na uderzenie.

⚠ **`_warpCapableHulls` (bliźniak diagnostyczny, `:105-120`) filtra NIE dostaje** — i to jest
zgodne z jego własnym komentarzem: „tamta jest PULĄ, a ta jest DIAGNOZĄ". Zamiast tego
`launchStrike` dostaje **trzeci, prawdomówny powód** obok `no_idle_hull` / `no_warp_capable_hull`:

```
no_hull_at_home   — kadłuby są, są wolne, ale ŻADEN nie jest w układzie macierzystym
```

Zero nowych kluczy i18n: `director:strikeRefused` jest kanałem AUDYTU (zero konsumentów UI) i jest
już w `DebugLog.TRACKED_EVENTS` **jako nazwa zdarzenia**, więc reguła W3 („nowy powód odmowy dołącza
do `TRACKED_EVENTS` w tym samym commicie") jest spełniona z urzędu.

### 5.4 Czego NIE ruszamy

- `EnemyAttackHandler:240-246` — parkowanie zostaje; zamiatacz skraca je do ≤ 1 roku wyświetlanego.
  Zmiana stanu końcowego EAH dotknęłaby jego własnego batchowania i ścieżki wraków. **Pin granicy**
  w keeperze (wzór F130 T4).
- `_tickInterstellar` `edgeAU = 30` — wspólne z graczem.
- `AutoRetreatSystem` / `RetreatTarget` — drabina schronień zostaje; zamiatacz ściąga rajdera
  z ciała neutralnego/gracza **po** domknięciu odwrotu.
- Predykaty pozostałych pul (`_idleArmedAtCapital`, `storedWarshipsAtCapital`) — D-VO1b-6.

---

## 6. DECYZJE DO PODPISU

| # | pytanie | **W1 (rekomendacja)** | W2 | dlaczego tak |
|---|---|---|---|---|
| **D-Z2-1** | gdzie mieszka decyzja o powrocie | **Reguła Directora + sonda-ZAMIATACZ** (`DirectorRecall.js`, wzór `DirectorMobilization`) | hook u każdego producenta parkowania | §1.2 — producentów jest **siedem**; hook w każdym to `131cc2e` po raz kolejny |
| **D-Z2-2** | **dokąd wraca** — *jedyna decyzja BALANSOWA* | **Na ORBITĘ STOLICY** (skok + odcinek 30 AU w domu). Skutek: **1 uderzenie na 10 lat zamiast na 5,1** | Na obrzeża własnego układu (1 na 5,4 roku) | W2 tworzy **stan-sierotę, którego nie rozumie żaden inny podsystem AI** (wszystko jest capital-centryczne: produkcja, doktryny, mobilizacja). Skutek balansowy W1 jest odwracalny **jedną liczbą w danych** (`cooldown.years`), sierota z W2 jest strukturalna |
| **D-Z2-3** | rzut czy determinizm | **BEZ rzutu**, `cooldown: { years: 1.0 }` | rzut jak `mobilize_reserve` (czasem AI „przyciska oblężenie") | rzut znaczy „okupacja utrzymuje się z jakimś prawdopodobieństwem" — czyli Z2 nie jest zamknięty, tylko przerywany. 1,0 roku to **granularność zegara decyzji Directora**, nie wymyślony próg. ⚠ reguła bez `roll` **MUSI** mieć `cooldown` (decyzja 11 katalogu) |
| **D-Z2-4** | filtr `strikeReadyVessels` | **TAK** — `systemId === homeSystemId` + `!inActiveEncounter` | bez filtra, ufamy zamiataczowi | §5.3 — bez filtra wynik zależy od **kolejności kluczy w pliku danych** |
| **D-Z2-5** | predykat „w starciu" | **Reużyć `dscs._findActiveEncounterContaining`** wzorem `MOS._inActiveEncounter` | nowa publiczna nazwa `isVesselInCombat` | §4 — istnieje, ma **sześciu** konsumentów cross-system; nowa nazwa byłaby drugim słownikiem |
| **D-Z2-6** | `EnemyAttackHandler` | **NIE ruszamy** + pin granicy w keeperze | zmienić stan końcowy po zwycięstwie | promień rażenia: batchowanie + wraki. Zamiatacz redukuje parkowanie do ≤ 1 roku |
| **D-Z2-7** | presja paliwowa na powrót | **POZA ZAKRESEM**, z pomiarem (§1.3) | wprowadzić koszt warp dla AI | bak AI startuje **pusty**, a wszystkie bramki AI omijają paliwo ⇒ „presja" = wyłączenie ofensywy AI, nie strojenie |
| **D-Z2-8** | czy reguła ma guard wojny | **NIE** — zamiata także w POKOJU | `empireAtWarWithPlayer` | `war:peaceSigned` ma zero konsumentów ⇒ dziś okupacja przeżywa pokój. Brak guardu zamyka to **za darmo** |
| **D-Z2-9** | postój (dwell) przed powrotem | **BRAK w v1** | K lat postoju jako presja | ZERO AUTORSKICH PROGÓW (decyzja 22 W2). Postój ≤ cooldown jest w kadencji niewidoczny (sonda B), a widoczny **wyłącznie** jako czas blokady puli — czyli jako sama szkoda |
| **D-Z2-10** | rajder bez stolicy (`capitalOf` = null) | **Zostaje gdzie jest + prawdomówna odmowa `no_capital`**; filtr puli czyni go trwale nieofensywnym | odesłać do dowolnej koloni imperium / zamienić w wrak | imperium bez stolicy jest umierające; „bezdomny, ale WOLNY" to zasada już zapisana w `_onColonyDestroyed:1128-1130`. ⚠ Konsekwencja **zadeklarowana**: utrata stolicy rozbraja ofensywę AI |

**Kill-switch:** `FEATURES.aiStrikeRecall` (default **ON**). ⚠ OFF przywraca zachowanie sprzed slice'u
**bit w bit** — czyli bramkuje **także filtr puli** z D-Z2-4, nie tylko zamiatacz. Inaczej „wyłączone"
znaczyłoby trzy różne rzeczy (lekcja `m4EnemyCombatMissionPause`).

**Save:** v101, **zero migracji** (`pendingOrder` już serializowany; reszta to stan reguł Directora,
który ma własny kształt w `director.rules`). **i18n: zero nowych kluczy** (§5.3).

---

## 7. Keeper i GATE

### `ai_strike_recall_smoke.mjs` — WYKONANIOWY

Moduły `Director*`, `DeepSpaceCombatSystem` i `OrderService` importują się headless (dowiedzione
sondami A–F). **Fail-first mierzony finalnymi pinami na nietkniętym kodzie**; każdy pin z kontrolą pinu.

| # | pin | kontrola pinu |
|---|---|---|
| **T1** | rajder zaparkowany przy planecie GRACZA **NIE** jest w `strikeReadyVessels` | ten sam rajder przy WŁASNEJ stolicy — **jest** |
| **T2** | zamiatacz liczy rajdera we wszystkich **siedmiu** kształtach z §1.2 (jeden fixture, siedem wierszy) | rajder w domu — nie liczony (inaczej zamiatacz zawracałby swoich) |
| **T3** | akcja **nie** rusza statku w AKTYWNYM starciu | po domknięciu starcia — rusza |
| **T4** | akcja **nie** rusza statku z `movementOrder` (trwający odwrót) ani z `mission` | bez rozkazu — rusza |
| **T5** | 🔴 **pin obalający naiwną naprawę**: sam skok zostawia rajdera POZA wszystkimi pulami; pełny composite (`kind:'recall'` → `moveToPoint` na stolicę) kończy się `orbiting`+`dockedAt=stolica` ⇒ **w puli uderzeniowej I doktrynalnej** | stan po samym skoku = `[]` (Pomiar 1, wiersz 4) |
| **T6** | brak stolicy ⇒ `no_capital`, statek **nietknięty** | ze stolicą ⇒ rozkaz wydany |
| **T7** | kill-switch OFF ⇒ zachowanie sprzed slice'u **bit w bit** (rajder w puli, zamiatacz milczy) | ON ⇒ obie zmiany działają |
| **T8** | **PIN GRANICY (D-Z2-6):** `EnemyAttackHandler` nadal ustawia `dockedAt` planety gracza i nadal zbiera zaparkowanych do batcha — świadomy limit, nie przeoczenie | — |
| **T9** | katalog: `delay: 0` (wzór `w2_ai_mobilization` T4) **i** reguła bez `roll` ma `cooldown` (decyzja 11) | — |
| **T10** | **pin uzasadnienia D-Z2-4:** wynik identyczny przy **odwróconej** kolejności wpisów katalogu | bez filtra puli — wynik się ZMIENIA (to jest dowód, że filtr nie jest ozdobą) |

Regresja obowiązkowa: `ai_combat_mission_pause` 19 · `player_combat_mission_pause` 21 ·
`vo3b_order_clear` 30 · `w3_attack_dispatch` 37 · `w3_target_selection` 30 · `w3_cross_system_attack` 42 ·
`vessel_orders_seams` 46 · `retreat_target` 44 · `combat_system_scope` 25 · sweep **191/191**.

### GATE (LIVE) — mierzy TEMPO i OSTRZEŻENIE, nie poprawność

| # | krok | oczekiwane |
|---|---|---|
| 1 | `KOSMOS.debug.strikeReport(empireId)` — przed | werdykt + `okretyGotowe` |
| 2 | `KOSMOS.debug.forceStrike(empireId)`, obserwuj mapę | **rajder LECI** — widoczny dolot ~5 lat, nie natychmiastowa bitwa |
| 3 | po bitwie: `KOSMOS.vesselManager.getAllVessels().filter(v=>v.ownerEmpireId).map(v=>[v.name,v.systemId,v.position.dockedAt,v.mission?.type])` | rajder **wraca**: `interstellar_jump` → `move_to_point` → na końcu `dockedAt` = stolica AI |
| 4 | `KOSMOS.debug.directorRules(empireId)` | wiersz `recall_strike_force` z `odpalenieRok` |
| 5 | kolonia gracza z `logistics_hub` + księżyc | plakietka **`⚠ PULA` znika** po odejściu rajdera (nagłówek ColonyOverlay: „Łącze zerwane" → „Połączona z hubem") |
| 6 | `GAME_CONFIG.FEATURES.aiStrikeRecall = false`, powtórz 2-3 | rajder parkuje jak dotąd (kill-switch) |
| 7 | konsola | brak błędów |

⚠ **GRANICA DOWODU — gate NIE MOŻE czytać „pusta pula" ze zdarzeń.** Guard `empireHasStrikeForce`
stoi **przed** akcją i **przed** rzutem (`DirectorSystem._evaluate`), więc gdy wszystkie kadłuby są
w drodze, reguła **milczy** — bez `director:strikeRefused`. Ciszę czytamy przez `strikeReport`
(werdykt) i `directorRules` (czy `attempts` w ogóle rośnie). ⚠ Ta sama obserwacja obnaża, że
`no_idle_hull` z VO-3b jest w ścieżce REGUŁY prawie martwy — żyje w `forceStrike`/`strikeReport`.

⚠ **`KOSMOS.debugLog` nie jest instrumentem floty** (Finding 125) — śladu powrotu tam nie będzie.

---

## 8. Świadomie poza zakresem (filed)

- 🟠 **Presja paliwowa AI** (D-Z2-7) — wymaga najpierw ekonomii paliwa AI (tankowanie w stolicy,
  `warp_cores` w magazynie); dziś zerowa. Rodzina `PHASE5_TODO`.
- 🟠 **`war:peaceSigned` bez konsumentów** — ten slice zamyka jego JEDYNY dzisiejszy skutek
  (okupację) *przy okazji*, nie przez sam pokój. Reakcja floty na pokój = osobny temat (W4).
- 🟠 **`EnemyAttackHandler` jako stos bojowy** (§1.1) — po naprawie rzadki, bo okno parkowania ≤ 1 rok.
  Redesign batchowania to własny slice.
- 🟠 **Postój/oblężenie jako mechanika** (D-Z2-9) — dopiero gdy live-gate pokaże, że AI jest
  bezzębne; wtedy z pomiarem, nie z wymyślonym progiem.
- ⚪ **`_tickInterstellar` `edgeAU = 30`** — wspólne z graczem; zmiana dotknęłaby każdego skoku w grze.

---

## 9. Ryzyka i nowe findingi

| # | ryzyko | mitygacja |
|---|---|---|
| **R1** | **Wyścig z oknem batchowania EAH (500 ms realnych):** zamiatacz odsyła rajdera, który przed chwilą przyleciał i czeka na własną bitwę ⇒ ucieka z niej (`_resolveBatchedBattle` zbiera po `state==='orbiting'`, więc `in_transit` wypada) | predykat §5.2 pomija statki obecne w `enemyAttackHandler._pendingBattles` (dostępny przez `window.KOSMOS.enemyAttackHandler`) |
| **R2** | **Uderzenia dwa razy rzadsze** (Pomiar 3, W1) — świadoma konsekwencja D-Z2-2 | knob jest w DANYCH: `strike_player_target.cooldown.years`. **Nie wolno** korygować tego mechanizmem powrotu |
| **R3** | Utrata stolicy rozbraja ofensywę imperium (D-Z2-10) | zadeklarowane; `no_capital` w kanale audytu |
| **R4** | `AutoRetreatSystem` sadza rajdera na ciele GRACZA (tier FOREIGN) — pula hubu zerwana do czasu zamiecenia (≤ 1 rok) | akceptowane; alternatywa (termin własności w drabinie odwrotu) należy do **Findingu 154** |
| **R5** | Reguła oceniana dla każdego imperium co tik — koszt = skan rejestru statków | ten sam koszt co `strikeReadyVessels` / `storedWarshipsAtCapital`, które już tak działają |

### Nowe findingi z tego audytu (do rejestru macierzystego `VESSEL_ORDERS_PLAN.md`)

- 🔴 **Z2-1 — `VesselManager._onColonyDestroyed:1136-1153` przepisuje `vessel.colonyId` BEZ TERMINU
  WŁAŚCICIELA.** Pętla iteruje **wszystkie** statki, a port zastępczy pochodzi z
  `_resolvePlayerHomePort` (kolonia GRACZA, AC-8). Statek AI lecący do koloni, która ginie
  w międzyczasie, dostaje `colonyId` = dom gracza **i wymuszony powrót tam**
  (`startReturn({force:true})`). Rodzina Findingu 97 (`_resolvePayHomeId` bez terminu własności).
  Osiągalność: wymaga śmierci ciała podczas lotu rajdera — **nie zmierzona**, ale ścieżka w źródle
  jest bezwarunkowa.
- 🟠 **Z2-2 — `no_idle_hull` (VO-3b D-VO1b-5) jest w ścieżce REGUŁY prawie nieosiągalny**, bo
  guard `empireHasStrikeForce` odcina przed akcją. Żyje wyłącznie przez `forceStrike`/`strikeReport`.
  Nie defekt — ale **każdy gate czytający „dlaczego ofensywa stoi" ze zdarzeń mierzy ciszę**.
- 🟠 **Z2-3 — `war:peaceSigned` ma ZERO konsumentów** poza `DebugLog` ⇒ żaden system nie reaguje na
  pokój. Dziś objawia się jako trwała okupacja orbity; po tym slice'ie zostaje jako pytanie otwarte.
- ⚪ **Z2-4 — `_findActiveEncounterContaining` jest de facto publiczny** (7 konsumentów, w tym
  renderer). Prefiks `_` kłamie o jego roli. Kosmetyka; nazwać przy najbliższym dotknięciu DSCS.

---

## 10. Podział na commity (po podpisie)

1. **Z2-0** — keeper szwów: T1/T8/T10 jako **piny DEFEKTU** (fail-first ma świecić na zielono
   *przed* naprawą, potem zostają odwrócone z powodem w nagłówku — wzór `deploy_seams`).
2. **Z2-1** — mechanizm: `OrderService.issueRecall` + gałąź `recall` w `_maybeDeliver`. Bez decyzji.
3. **Z2-2** — decyzja: `DirectorRecall.js` + wpis katalogowy + rejestracja nazw + flaga.
4. **Z2-3** — filtr puli + powód `no_hull_at_home` (D-Z2-4) — **osobno**, bo to jedyna zmiana
   dotykająca istniejącej reguły ofensywnej.
5. **Z2-4** — docs (ten plik + `VESSEL_ORDERS_PLAN.md` §Findings Z2-1…Z2-4 + zdjęcie wiersza
   `GATE B2 (Z2)` z `OPEN_FINDINGS_INDEX.md`).

---

## 11. WYKONANIE (2026-08-31)

### Fail-first — **12 pass / 44 fail**

Mierzone **finalnymi pinami na nietkniętym kodzie**. Po naprawie: **62/62**.

⚠ **Pierwszy przebieg fail-first był NIEUCZCIWY i to on wymusił poprawkę keepera, nie kodu gry.**
Dał 13/43, ale **sześć asercji T4 i jedna T3 przechodziły JAŁOWO**: „pomijamy statek X" jest
trywialnie prawdziwe, gdy zamiatacz jeszcze nie istnieje i zwraca pustą listę. Złapała to dopiero
kontrola pinu na końcu bloku. Poprawka: każda asercja wykluczająca wymaga OBECNOŚCI świadka
(`v_clean` w T4, `v_watch` w T3), a T10 wymaga niepustych obu zbiorów. Do tego pierwszy przebieg
**wywracał się** na `null.phase` przy T5(c) — fail-first ma dojść do końca i policzyć uczciwie,
więc dalsze odcinki są bramkowane na powodzeniu pierwszego.

### Zmiany

| commit | co |
|---|---|
| **Z2-1** | `OrderService.issueRecall` + `_issueRecallLeg` + gałąź `recall` w `_maybeDeliver`. Czwarty rodzaj composite'u obok `transport`/`passenger`/`attack`. |
| **Z2-2** | NEW `DirectorRecall.js` (sonda-zamiatacz + akcja) · wpis katalogowy `recall_strike_force` · flaga `FEATURES.aiStrikeRecall` · wpięcie w `GameScene` (konstrukcja + rejestracja + **lokator**) · `DebugLog.TRACKED_EVENTS` +2 nazwy. |
| **Z2-3** | Filtr puli w `DirectorOffensive.strikeReadyVessels` (układ macierzysty + aktywne starcie, oba pod flagą) · trzeci szczebel drabiny odmów `no_hull_at_home` · `strikeReport` przepisany, żeby werdykt odtwarzał REALNĄ drabinę. |

### ⚠ Odmowa, która KŁAMAŁABY, gdyby jej nie tknąć

`KOSMOS.debug.strikeReport` miał werdykt `ready.length === 0 → 'brak okrętu zdolnego do skoku'`.
Po dołożeniu terminu układu ten sam stan ma **trzy** różne przyczyny, więc stary tekst zacząłby
kłamać dokładnie w sytuacji, którą ten slice wprowadza (okręty wracają do domu). Werdykt odtwarza
teraz priorytet z `launchStrike`: `no_warp_capable_hull` → `no_idle_hull` → `no_hull_at_home`.
Raport dostał też `ukladMacierzysty`, `kadlubyZeSkokiem` i `wracajaDoDomu`.

### ⚠ Świadome odwrócenie pinu w `ai_combat_mission_pause_smoke` (F130)

Kontrola pinu T2 brzmiała *„z wyzerowaną misją rajder BYŁ w puli"* — i mierzyła to **W TRAKCIE
WALKI**. Z2 celowo ten stan zamknął (D-Z2-4, sonda D planu: Director mógł wysłać na uderzenie
okręt, który właśnie się bije, a nowy rozkaz ruchu wyprowadziłby go z bąbla starcia i
`DSCS._handleCombatRangeExit` policzyłby stronę AI jako **uciekającą**). **INTENCJA oryginału
została** — „to misja, a nie przypadek, trzyma rajdera poza pulą" — tylko mierzy się ją teraz PO
domknięciu starcia. Powód wpisany w nagłówku tamtego keepera.
⚠ Przy okazji wyszło, że bez `enc.isActive = false` asercja *„rajder ze wznowioną misją NIE wraca
do puli"* przechodziłaby po Z2 **z niewłaściwego powodu** (filtr starcia zamiast misji) — czyli
byłaby fałszywą zielenią. To jest ta sama klasa, co jałowe przejścia z fail-first.

### ⚠ Cztery keepery Directora wymagały rejestracji nowej reguły

`DirectorSystem` waliduje **wszystkie** nazwy katalogu w konstruktorze i RZUCA na nieznanej
(audyt R12). `director_first_contact`, `director_pressure`, `director_skeleton`
i `w3_director_mounting` konstruują silnik z własnym kompletem rejestratorów — bez
`registerRecallBehaviors` przestały wstawać. **To nie jest niedogodność, tylko dowód, że bramka
działa.** W `w3_director_mounting` T2 nowa nazwa dołączyła też do listy „boot importuje/woła",
czyli do pinu strukturalnego montażu.

### Kontrola montażu (sonda `probe-z2-mount.mjs`, poza repo)

Prawdziwy `DirectorSystem.tickEmpire` na rajderze zaparkowanym przy planecie gracza:

```
PRZED:  pula uderzeniowa = []          zamiatacz = [v_raider]
        rajder: systemId=sys_home dockedAt=p_player mission=null
tick →  director:recalled {"empireId":"emp_001","count":1,"homeSystemId":"sys_ai"}
PO:     reguly ktore odpalily: [recall_strike_force]
        rajder: state=in_transit mission=interstellar_jump pendingOrder=recall → sys_ai / p_ai_cap
po skoku: mission=move_to_point → p_ai_cap   ETA 44.68 (start 40) = 4,68 roku
```

⚠ **ETA odcinka domowego = 4,68 roku** — zgodne z Pomiarem 2 (4,5-4,9). Model tempa z §2 opisuje
więc kod, a nie tylko arkusz.

### Testy

`ai_strike_recall_smoke` **62/62** (fail-first 12/44) · `ai_combat_mission_pause` **19/19**
(T2 odwrócone) · `w3_director_mounting` 18 · `director_skeleton` 91 · `director_first_contact` 50
· `director_pressure` 48 · `vo3b_order_clear` (T7 nietknięty — filtr DODAJE warunki, nie usuwa
`if (v.movementOrder) continue`). Sweep **192/192 OK, 0 FAIL** · `check-i18n` **PASS** ·
save **v101, zero migracji** · **zero nowych kluczy i18n**.

### Findingi zapisane w rejestrze macierzystym

`VESSEL_ORDERS_PLAN.md` §Findingi z audytu Z2 — **195** (`_onColonyDestroyed` bez terminu
właściciela — 🔴 otwarty, ten slice go OMIJA, nie naprawia) · **196** (`no_idle_hull` nieosiągalny
w ścieżce reguły — ostrzeżenie metodyczne dla gate'ów) · **197** (`war:peaceSigned` bez
konsumentów — złagodzony) · **198** (`_findActiveEncounterContaining` de facto publiczny).
