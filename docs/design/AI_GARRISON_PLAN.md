# AI GARRISON — obrona naziemna kolonii AI

> **Status:** ✅ **G1 ZAMKNIĘTY 2026-10-02 — bramka live właściciela PASS.** Dalej: G1b → G2 → G2b → G3.
> Decyzje **D1–D7** podpisane przez właściciela **2026-10-01** (D7: **2026-10-02**).
> Save **v101, zero migracji** w G1.
> **Commity G1:** `85411d0` (D5a) · `f5e30e5` (D5b + świadome odwrócenie `w3_seams_smoke` T6) · `f868ae8` (D5c).
> Keeper `ground_morale_resolution_smoke` **35/35** · sweep **248/248 OK, 0 FAIL, 31 advisory** ·
> `check-i18n` PASS (pl = en = **3424**).
> **Rejestr macierzysty findingów #309–#325:** ten plik, §6. Korekty cudzych rejestrów (65 · 49 · 50): §7.
> ⚠ Znaczniki źródła: `[code]` — przeczytane w źródle na `f868ae8` · `[measured]` — wykonane i policzone ·
> `[git]` — historia commitów · `[doc]` — przepisane z dokumentu/raportu, bez ponownego pomiaru.

---

## 0. Cel

Kolonie AI dostają obronę naziemną. **AI niczego nie buduje**: rezerwa **materializuje się jako
prawdziwe jednostki w chwili wypowiedzenia wojny**. Całość jest **w pełni deterministyczna** — żadnego
losowania rozmiaru garnizonu.

Dlaczego teraz: dopóki kolonia AI nie ma ani jednej jednostki naziemnej, a desant nie wymaga wojny,
**każda kolonia AI jest do wzięcia jedną jednostką w czasie pokoju** (Finding **317**). A dopóki walka
naziemna się nie rozstrzygała (G1), nie było czego materializować — garnizon uciekałby przy spawnie.

---

## 1. Decyzje podpisane

| # | decyzja | uzasadnienie / ślad |
|---|---|---|
| **D1** | **limit = max(2, floor(POP imperium / 16))** — reguła limitu rekrutacji GRACZA zastosowana do POP imperium. **Bez** mnożnika stanu, **bez** średniej AI, **bez** pokrętła kontrastu. | Reguła gracza: `ColonyManager._getMaxGroundUnits` = `Math.max(2, Math.floor(pop / 16))` (`ColonyManager.js:1344-1349`) `[code]`. Warianty z mnożnikami odrzucone po pomiarze G0: przy N=2 huśtawka o sumie stałej (indeksy dwóch imperiów sumują się dokładnie do 2), przy K=3 nasycone klamry, wydobycie nieczytelne (Finding **321**), zapas = 50–10 000 lat wydobycia `[doc: raport G0]`. |
| **D2** | **Skład z progów poziomu fabryk.** Konkretne liczby zostaną zaproponowane z pomiaru w **G2**. | — |
| **D3** | **Wydobycie i zapas — poza krokiem 1.** | Wydobycie jest dziś nieczytelne przez API stawek (Finding **321**). |
| **D4** | **Lądowanie na obcym ciele wymaga wojny; garnizon materializuje się przy wypowiedzeniu.** Zamyka podbój w czasie pokoju. | Finding **317**. |
| **D5** | **Naprawa morale a/b/c — dostarczona w G1.** | §4: `85411d0` · `f5e30e5` · `f868ae8`. |
| **D6** | **Domyślne:** `garrison_unit` stoi `deployed` od utworzenia · placówka dostaje garnizon **tylko**, gdy ciało ma złoże `Xe` albo `Nt` · przy zmianie właściciela lub zniszczeniu ciała **jednostki poprzedniego właściciela są usuwane** · liczebność garnizonu widać na poziomie wywiadu `'detailed'` · garnizon **nie wchodzi** do `ThreatAssessment`. | Findingi **324** (stan `mobile` przy tworzeniu) i **319** (jednostki osierocone). Identyfikatory surowców: `Xe` (Ksenon), `Nt` (Neutronium), `ResourcesData.js:22-23` `[code]`. |
| **D7** (2026-10-02) | **AI używa modelu jednostek GRACZA (archetypów) wszędzie, także w pulach desantu.** Jedna gałka AI: **morale nadawane przy tworzeniu**, powiązane z progami fabryk z D2. AI wystawia wyłącznie typy proste: `shock_infantry`, `garrison_unit`, `aa_platform`, `rocket_artillery`. **Jednostki legacy zostają w danych** dla starych zapisów i `science_rover`. | Zastępuje Finding **50** (§7). Wymaga wspólnej funkcji tworzenia jednostki AI (Finding **323**). |

**Również podpisane:**
- **brak losowania** rozmiaru garnizonu;
- **połowa limitu do stolicy**, reszta według wartości ciała (⚠ która definicja stolicy — Finding **322**);
- **straty odrastają po 1 na rok** w stolicy;
- **jednostki zostają po wojnie** i liczą się do limitu.

---

## 2. Odpowiedzi na pytania sesji G1 (właściciel, 2026-10-02)

| | pytanie | odpowiedź |
|---|---|---|
| (a) | odwrócenie `w3_seams_smoke` T6 | **przyjęte** — wchodzi w `f5e30e5` |
| (b) | rozpad jednostki defensywnej po 4 trafieniach (morale 0) | **przyjęty dla G1**; follow-up rozważany w **G1b**, **NIEPODPISANY** |
| (c) | Finding 50 (desant AI na modelu legacy) | **zastąpiony przez D7** |
| (d) | UI czyta ten sam default morale co silnik | **tak** |
| (e) | zmiana w wąskiej ścieżce `GroundUnitFactory:257` (legacy gracza z zapełnionym `supply`: mnożnik ×1,0 → ×1,5·supplyFactor) | **przyjęta** |

---

## 3. Plan

| krok | zawartość | findingi | status |
|---|---|---|---|
| **G1** | naprawa morale a/b/c (D5) | 65 ✅ | ✅ **2026-10-02** |
| **G1b** | **ogień naprawdę jednoczesny** zamiast „wróg strzela pierwszy” · **zwolnienie zablokowanych POP** przy `morale_collapse` | **309** · **310** | do zrobienia |
| **G2** | **bramka wojny dla lądowania** · **materializacja garnizonu** przy wypowiedzeniu · **jedna wspólna funkcja „utwórz jednostkę AI z zadanym morale”** | **317** · **318** · **319** · **320** · **322** · **323** · **324** | do zrobienia |
| **G2b** | pule desantu (`INVASION_UNIT_POOLS`) na archetypy **przez tę funkcję** (D7) | **50** (zastąpiony) · **311** (zostaje dla jednostek legacy gracza) | do zrobienia |
| **G3** | odrastanie strat · widoczność (`'detailed'`) | — | do zrobienia |
| później | limit floty · odbicie kolonii · przyczółek | — | — |

⚠ **Kolejność G1b przed G2 jest celowa:** materializacja garnizonu w świecie, w którym AI zawsze
strzela pierwsze (**309**), mierzyłaby balans skrzywiony na korzyść atakującego AI; a każdy rozpad
garnizonu gracza bez zwolnienia POP (**310**) to trwała utrata ludności.

---

## 4. G1 — dostarczone

### 4.1. Trzy defekty, trzy commity

| decyzja | defekt (zmierzony na `ffb7b10`) | naprawa | commit |
|---|---|---|---|
| **D5a** | wyjątek „jednostka defensywna nie ucieka” był **martwy**: `unit.role !== 'defense'`, a instancja niesie lustro legacy `'defensive'` (`mapRoleToLegacy`), legacy garnizon ma `'defensive'` w danych ⇒ okopany garnizon uciekał w rundzie 1 `[measured]` | NEW `isDefensiveUnit(unit)` (`unitArchetypes.js:326`) — rola ARCHETYPU `'defense'` albo legacy `'defensive'`; użyty w `CombatSystem.js:251` | `85411d0` |
| **D5b** | Finding **65**: odczyt `?? 100`, odejmowanie `?? 0` ⇒ legacy vs legacy: **obie** jednostki rozwiązane w rundzie 1 przy HP 52/60 `[measured]` | NEW `DEFAULT_MORALE = 100` (`unitArchetypes.js:34`) w **12** miejscach (silnik + dwa miejsca UI) | `f5e30e5` |
| **D5c** | próg 20 > najniższe `baseMorale` (10) ⇒ sześć z siedmiu archetypów uciekało w rundzie 1, także **bez** trafienia `[measured]` | `export const MORALE_RETREAT_THRESHOLD = 5` (`CombatSystem.js:47`) — ucieczka po ⌈(M − 5)/3⌉ trafieniach | `f868ae8` |

⚠ **D5a zdejmuje wyłącznie odwrót.** Rozpad przy morale 0 (`morale_collapse`) dotyczy jednostki
defensywnej nadal — przy bazowym morale 10 i koszcie 3 za trafienie garnizon **rozpada się po 4
trafieniach** (przyjęte dla G1, §2 (b)).

⚠ **Zmiana zachowania D5b jest ograniczona do trzech miejsc:** odejmowanie trafienia (sedno),
atrycja głodowa jednostki legacy gracza (morale 100 → 0 w 10 civY zamiast 0 w 1. ticku) i mnożnik
obrażeń legacy gracza z zapełnionym `supply` (§2 (e)). Pozostałe miejsca są neutralne (`attackUnit`
martwa — Finding **315**; `GroundUnitManager.js:1446` to martwy zapis nadpisywany 11 linii niżej).
`restore` archetypu (`?? rebuilt.maxMorale`, `GroundUnitManager.js:1457`) — **nietknięty**: to
celowy default per jednostka. `BattleSystem` (`morale ?? 1.0`) to **mnożnik flot** — inna domena.

### 4.2. Keeper `ground_morale_resolution_smoke` (rośnie z commitami)

Prawdziwy `GroundUnitManager` + `CombatSystem` na prawdziwym `HexGrid`, kadencja `gum.tick` z pościgiem
AI, stały stub `Math.random` przywracany w `finally`.

| commit | testy | fail-first na rodzicu | na commicie |
|---|---|---|---|
| `85411d0` (D5a) | T1 (oba modele + kontrola) · T4 (pary morale 100) | **6 PASS / 5 FAIL** | 11/11 |
| `f5e30e5` (D5b) | + T2 (legacy vs legacy, świeża == wczytana) · T7 (tripwire `morale ?? <liczba>`) | **15 / 7** | 22/22 |
| `f868ae8` (D5c) | + T3 (bez ucieczki w r1, bez zamarzania) · T5 (morale ma znaczenie) · T6 (próg z danych) | **25 / 10** | 35/35 |

Pełny keeper na niezałatanym `ffb7b10`: **13 PASS / 22 FAIL** `[measured]`.
`w3_seams_smoke` T6 przypinał defekt („pin przekazany slice'owi GROUND, decyzja D5”) — odwrócony
świadomie w `f5e30e5`: na drzewie bez D5b **34 / 4** (pada na asercjach, nie na linkowaniu ESM),
na `f5e30e5` **38/38** `[measured]`.
Sweep na drzewie każdego commitu: **248/248, 0 FAIL** (C1 w sesji G1; C2 i C3 w sesji zamykającej) `[measured]`.

### 4.3. Pomiar rozstrzygalności (sesja G1)

200 prób na parę, natywne `Math.random`, okno 60 civY, kadencja `gum.tick` z pościgiem AI, bez
`SupplyCoverageSystem`. „Rozstrz.” = pierwsza decyzja: śmierć, rozpad albo ucieczka JEDNEJ strony
(wspólna ucieczka się nie liczy). Wszystkie liczby `[measured]`.

| # | para (AI atakuje → gracz broni) | PO: rozstrz. / mediana / p90 rund | PO: wynik | PRZED (`ffb7b10`) |
|---|---|---|---|---|
| 1a | szturm → garnizon okopany, +0 | 100% / 4 / 4 | rozpad garnizonu 100%; AI 100% | wspólna ucieczka 100%; pat 100% |
| 1b | to samo, pełne drzewo morale obu stron | 100% / 3 / 3 | śmierć 100%; gracz 79% | bez zmian (gracz 77%) |
| 1c | drzewo tylko u obrońcy | 100% / 3 / 3 | śmierć 100%; gracz 100% | ucieczka AI w r1; pat 83% |
| 1d | garnizon `mobile`, +0 | 100% / 4 / 4 | rozpad 91%; AI 100% | wspólna ucieczka 100% |
| 2 | szturm → szturm | 100% / 4 / 4 | śmierć; AI 93% | wspólna ucieczka 100%; pat 65% |
| 3 | artyleria → AA | 100% / 1 / 2 | śmierć; AI 100% | 70% rozstrz.; 31% wspólnej ucieczki |
| 4 | legacy → legacy | 100% / 8 / 8 | śmierć; AI 90% | obie rozpadnięte w r1 |
| 5 | legacy → garnizon okopany | 100% / 4 / 4 | rozpad garnizonu; AI 100% | AI rozpad w r1; gracz 100% |
| 6 | legacy mech → szturm | 100% / 1 / 1 | śmierć; AI 100% | bez zmian |
| 7 | legacy → szturm | 100% / 2 / 2 | AI 100% | AI rozpad w r1; gracz 100% |
| 8 | legacy → garnizon okopany + pełne drzewo | 100% / 8 / 8 | AI 100% | AI rozpad w r1; gracz 100% |
| 9 | legacy → AA | 100% / 2 / 2 | AI 100% | AI rozpad w r1; gracz 100% |

Po naprawie: **0 ucieczek po ≤ 1 trafieniu** i **0 wspólnych ucieczek** we wszystkich wierszach
(przed: 200–1179 ucieczek po ≤ 1 trafieniu). Powtórzony przebieg mieści się w ±5 pp
(szturm vs szturm AI 94%, legacy vs legacy AI 84%).

⚠ **Dwie obserwacje, które idą dalej:**
1. **Fale legacy AI wygrywają 84–100% z każdym archetypem gracza przy +0**, także z okopanym
   garnizonem z pełnym drzewem morale (wiersz 8) — to surowe statystyki legacy (60 HP / atak 12),
   po raz pierwszy faktycznie walczące. Dlatego **D7**.
2. **Asymetria pierwszej salwy** widać w parach symetrycznych (2, 4) — Finding **309**, G1b.

Z `SupplyCoverageSystem` (sonda): wiersz 1a bez zmian (rozpad r4, AI 100%); legacy vs legacy na polu
— AI 100% w rundzie 6, bo legacy piechota gracza dostaje `supply = 0` i zadaje zero obrażeń (Finding **311**).

---

## 5. Bramka live G1 — 2026-10-02, właściciel: **PASS**

Zapis na **gy 60**, ciało `entity_2`, jednostki postawione przez `debug.spawnMyUnit` (bez bonusu
technologii), najeźdźca `emp_001`. Wszystkie liczby `[measured: bramka właściciela]`.

- **D5a — PASS.** `garrison_unit` okopany na (10,8), morale 10, kontra jeden `shock_infantry` AI.
  Garnizon **ani razu nie zszedł z heksu**; po dwóch wymianach hp 27 / morale 4 (atakujący hp 11 /
  morale 9); potem garnizonu nie było, a stolica została zdobyta. **Rozpad zgodnie z przewidywaniem.**
- **D5c — PASS.** `shock_infantry` kontra `shock_infantry` na (10,8). Bez odstąpienia. Obie 15/15 →
  hp 10 morale 12 → hp 1 morale 6; potem jednostki gracza nie było, a jednostka AI przeżyła z hp 1.
  **Potwierdzenie na żywo defektu „wróg strzela pierwszy”** (Finding **309**).
- **D5b — PASS.** Fala legacy: 3 × piechota. Przed kontaktem `morale` = `undefined`; pierwsza
  zaangażowana jednostka: hp 57 / morale 97; `shock_infantry` gracza 15 → 4, potem zginęła;
  **fala nie zniknęła**.
- **Niesprawdzone w przeglądarce:** wyświetlanie morale na karcie jednostki; zapis/wczytanie w trakcie
  walki (pominięte decyzją). Błędów w konsoli nie zgłoszono.

---

## 6. Rejestr findingów arca (#309–#325, zebrane 2026-10-02)

⚠ **Zasada wpisu:** każde `plik:linia` sprawdzone grepem na `f868ae8`. Numeracja globalna: najwyższy
istniejący numer to **#308** (`VESSEL_ORDERS_PLAN.md` §308; #309 był tam planowany i świadomie
**nieprzydzielony**), więc ten arc zaczyna od **#309**. Znaczniki: 🔴 żywy i dotkliwy · 🟠 realny,
ograniczony · ⚪ obserwacja/higiena.
⚠ Źródło: **309–316** z sesji G1 · **317–325** z audytu G0 (mechanizmy przemierzone w źródle teraz;
liczby z G0 oznaczone `[doc: raport G0]`).

### 🟠 309 — salwa wroga rozstrzygana PRZED salwą gracza; zabici gracza nie odpowiadają (→ G1b)

`_runBattleRound` opisuje wymianę jako jednoczesną (`CombatSystem.js:211` „Simultaneous fire
exchange”), ale woła `_resolveFire(wróg → gracz)` (`:212`) **przed** `_resolveFire(gracz → wróg)`
(`:217`), a `_resolveFire` pomija atakującego z `hp <= 0` (`:279`) ⇒ jednostka gracza zabita
w pierwszej salwie nie oddaje strzału; spadek jej org/morale z pierwszej salwy obniża też mnożnik jej
własnej salwy (`GroundUnitFactory.computeDamageMult`) `[code]`. Pomiar G1: w parach symetrycznych AI
wygrywa 93–94% (szturm vs szturm) i 84–90% (legacy vs legacy) `[measured]`. **Potwierdzone na żywo**
na bramce G1 (§5, D5c) `[measured: bramka]`.

### 🟠 310 — `morale_collapse` nie zwalnia zablokowanych POP-ów (→ G1b)

Rozpad (`CombatSystem.js:246-250`) emituje `groundUnit:disbanded` i woła `removeUnit` — **nie** emituje
`groundUnit:destroyed`, więc reintegracja POP (`ColonyManager.js:1613`) nie rusza, i **nie** woła
`unlockPops`, jak rozwiązanie z braku utrzymania (`ColonyManager.js:1566-1568`) `[code]`. POP
zablokowane przy rekrutacji (`lockPops(popCost, 'laborer')`, `ColonyManager.js:1444`) zostają
zablokowane na zawsze `[code]`; skutku nie mierzono wykonaniem.
⚠ Po G1 rozpad jest typowym sposobem utraty jednostki defensywnej (D5a: nie ucieka, rozpada się po
4 trafieniach przy bazowym morale) ⇒ wyciek częstszy niż przed G1.

### 🟠 311 — `SupplyCoverageSystem` zapisuje jednostce legacy gracza `supply = 0` przez `?? 0`

Faza 4 (`SupplyCoverageSystem.js:162`) liczy `Math.max(0, (u.supply ?? 0) - spent)` i **zapisuje**
wynik jednostce, która pola `supply` nie miała; Faza 5 (`:173`) traktuje brak pola jak głód.
`computeDamageMult` zwraca dla jednostki bez pola 1,0 (`GroundUnitFactory.js:250`), a dla `supply <= 0`
— zero (`:252`) ⇒ legacy jednostka gracza poza zasięgiem uzupełniania przestaje zadawać obrażenia
i traci HP 5%/civY `[code]`. Sonda G1: `supply = 0` w 1. ticku; legacy vs legacy z zaopatrzeniem — AI
100% w rundzie 6 `[measured]`. Ta sama klasa co Finding 65 (default dla brakującego pola), inne pole.
Osiągalność w grze (łazik `VesselManager.js:1360`, stare zapisy) — niezmierzona. Dotyczy wyłącznie
jednostek GRACZA (system pomija jednostki AI).

### ⚪ 312 — `groundUnit:disbanded` nie ma ani jednego subskrybenta; Dziennik milczy

Emitenci: `ColonyManager.js:1570` (brak utrzymania) i `CombatSystem.js:246` (`morale_collapse`);
subskrypcji `EventBus.on('groundUnit:disbanded', …)` w `src/` — **zero** `[code]`. Klucze
`event.groundUnit.disbanded` (pl/en) istnieją i nie mają czytelnika `[code]`. Rozpad jednostki nie
zostawia śladu w Dzienniku. Tabela zdarzeń w `CLAUDE.md` twierdziła „UIManager, EventLog” — poprawiona.

### ⚪ 313 — `_tryRetreat`: zostawia `_path`, zawsze ucieka w +q, wchodzi na obcy kafel (rozszerza 56)

`CombatSystem.js:403-436`: teleport `unit.q/r = best` (`:425-426`) bez zmiany `status` i bez czyszczenia
`_path` — jednostka uciekająca w trakcie ruchu (`moving` walczy od `08f0def` `[git]`) zachowuje starą
ścieżkę `[code]`, skutku nie zmierzono. Kolejność kierunków jest stała (`HEX_DIRS`, `:407-410`, pierwszy
+q) ⇒ ucieczka zawsze na wschód, gdy wolne `[code]` (sonda G1: (4,4) → (5,4) → (6,4) …) `[measured]`.
Cel ucieczki nie sprawdza właściciela kafla — pusty obcy kafel przechodzi natychmiast przez
`_tickOccupation` (`GroundUnitManager.js:597-599`) `[code]`. Rozszerza AI_CAPTURE 56 („drugi mover”).

### ⚪ 314 — martwe człony `_scoreTarget`: `'scout'` i `'ranged'`

`CombatSystem.js:361` (`defender.role === 'scout'`) i `:364` (`=== 'ranged'`) porównują rolę instancji
z rolą ARCHETYPU, a instancja nosi lustro legacy: `scout → 'drone'`, `ranged → 'military'`
(`unitArchetypes.js:308`, `:311`) ⇒ oba człony nigdy nie odpalają `[code]`. Ta sama klasa co martwy
wyjątek z D5a (zamknięty w `85411d0`). Świadomie poza G1.

### ⚪ 315 — `GroundUnitManager.attackUnit` jest martwa

`GroundUnitManager.js:683` — zero wołających w `src/` `[code]`; komentarze `GroundUnitFactory.js:10`
i `:139` dalej opisują ją jako żywą ścieżkę walki `[code]`. W G1 dostała `DEFAULT_MORALE` wyłącznie
dla spójności (zmiana neutralna).

### ⚪ 316 — `ColonyOverlay.js:2706` pokazuje `NaN` morale

`` `🔥 Mor ${Math.round(unit.morale)}/${unit.maxMorale}` `` bez defaultu — dla jednostki z polem `supply`,
ale bez `morale` (legacy gracza po uzupełnieniu przy stolicy) daje `NaN/undefined` `[code]`. Ścieżka
wąska, w przeglądarce niesprawdzona. W G1 świadomie nietknięte (miejsce bez `??` — poza regułą D5b).

### 🔴 317 — lądowanie i podbój w czasie POKOJU (→ G2 / D4)

- Desant gracza bramkuje wyłącznie dominacja orbitalna (`ColonyOverlay.js:325`, `FleetActions.js:554`,
  `:589`), a `WarSystem.playerHasOrbitalDominance` (`WarSystem.js:982-990`) przy braku kontrolera zwraca
  `!_hasHostileFleetInSystem` ⇒ układ bez floty wroga oznacza dominację `[code]`.
- `InvasionSystem.launchInvasion` (`InvasionSystem.js:89` i dalej) nie ma żadnego warunku wojny `[code]`.
- `_tryPlayerCapture` (`InvasionSystem.js:350-363`) wymaga braku żywego obrońcy i przewagi terenowej —
  bez warunku wojny; okupacja kafla z budynkiem trwa 6 civY (`GroundUnitManager.js:573`) `[code]`.
  AI nie buduje jednostek naziemnych, więc kolonia AI nie ma obrońcy.
- Niebroniona kolonia AI pada po 6 civY stania jednej jednostki `[doc: raport G0]`.

Kierunek: D4 — lądowanie na obcym ciele wymaga wojny, garnizon materializuje się przy wypowiedzeniu (G2).

### 🟠 318 — kafle kolonii AI mają `owner` = `null`

`EmpireColonyBootstrap` generuje siatkę (`:171-174` stolica, `:378-381` kolejne kolonie) bez stempla
`tile.owner` (domyślnie `null`, `HexTile.js:255`) `[code]`. Stempel `colony.ownerEmpireId` daje dopiero
otwarcie mapy w `ColonyOverlay` (`:584-588`) — efekt uboczny UI — albo zmiana właściciela
(`ColonyManager.js:923`, `GroundUnitManager.js:626`) `[code]`. Rodzina AI_CAPTURE 58 (kafle placówki)
i 54 (garnizon na efekcie ubocznym UI). Istotne dla G2: okupacja i warunek przejęcia czytają `tile.owner`.

### 🟠 319 — jednostki naziemne osierocone przy zniszczeniu ciała i nietknięte przy zmianie właściciela (→ D6)

`removeColony` (`ColonyManager.js:731` i dalej), `transferColony` (`:842` i dalej) i
`captureColonyForPlayer` (`:982` i dalej) — **zero** odwołań do jednostek naziemnych w zakresie
`:731-1060`; handler `colony:destroyed` w `GameScene.js:3400` i dalej — też żadnego `[code]`. Jednostki
poprzedniego właściciela zostają na ciele (po zniszczeniu — przy nieistniejącej koloni) `[code]`.
Rozszerza AI_CAPTURE 59 (najeźdźcy zostają po przejęciu). D6: przy zmianie właściciela lub zniszczeniu
ciała jednostki poprzedniego właściciela są usuwane.

### ⚪ 320 — `diplomacy:warDeclared` nie niesie `declaredBy`, a `UIManager` go czyta

Jedyny emiter `DiplomacySystem.js:398` wysyła `{ empireId, reason }`; `UIManager.js:1624-1626`
destrukturyzuje `declaredBy` (zawsze `undefined`, ratowane przez `empireId ?? declaredBy`) `[code]`.
Dziś nieszkodliwe; istotne dla G2, gdzie materializacja zależy od wypowiedzenia — kto wypowiedział,
niesie dziś tylko `reason`.

### 🟠 321 — wydobycie kopalń jest nieczytelne przez API stawek

`BuildingSystem._tickMineExtraction` (`:2494`) dodaje urobek wprost przez `resourceSystem.receive(gains)`
(`:2598`), z pominięciem rejestru producentów, z którego liczą się `getPerYear` i `getGrossPerYear`
(`ResourceSystem.js:255`, `:273`; `_recalcPerYear:428-452`) ⇒ dla surowców wydobywanych
`getGrossPerYear` nie widzi wydobycia, a `getPerYear` widzi tylko zużycie — znak odwrotny do realnej
zmiany zapasu `[code]`. Realną zmianę liczy osobny `_deltaTracker.observedPerYear` (`ResourceSystem.js:107`)
`[code]`. Wartości (0 / znak odwrotny) `[doc: raport G0]`. Jeden z powodów odrzucenia wariantu
„limit z wydobycia” (D1, D3). Wpływ na UI niezmierzony.

### ⚪ 322 — trzy definicje stolicy AI

`DirectorProduction.capitalOf` (`DirectorProduction.js:132-139`), bliźniaczy
`EmpireLogisticsSystem._pickCapital` (`EmpireLogisticsSystem.js:851-857`, ta sama logika skopiowana)
i statyczne `empire.homeSystemId` (`EmpireRegistry.js:91`, ustawiane przy generacji
`EmpireGenerator.js:234`, czytane z fallbackiem w `EmpireStrategySystem.js:211`, `:330`, `:382`, `:567`
i `EmpireLogisticsSystem.js:250`) `[code]`. `DirectorRecall.js:43` zapisuje wprost: „nigdy
`empire.homeSystemId` — pole istnieje, ale nie jest kanonem” `[code]`. Po utracie stolicy pojęcia mogą
się rozjechać. Istotne dla G2 („połowa limitu do stolicy”) — wybrać JEDNO źródło.

### 🟠 323 — `createUnit`: forma 5-argumentowa gubi `owner`, a `factionId 'humanity'` przypisuje jednostkę do utrzymania i limitu GRACZA

Forma 5-argumentowa (`GroundUnitManager.js:93-100`) zastępuje `opts` przez `{ factionId }`, więc
`owner` spada do `'player'` (`:112`) `[code]` — mechanizm AI_CAPTURE 60. Forma z obiektem `opts` daje
`factionId` domyślnie `'humanity'` (`:106`) `[code]`. Utrzymanie (`ColonyManager.js:1515`) i limit
rekrutacji (`:1372`) liczą jednostki po `owner === 'player' || factionId === 'humanity'`, a płatnikiem
jest `u.homeColonyId ?? u.planetId` (`:1528`) `[code]` ⇒ archetyp AI wystawiony przez `launchInvasion`
(`InvasionSystem.js:130`, `{ owner: empireId }` bez `factionId`) jest obciążany na koloni, na której
stoi — także koloni GRACZA — a bez kredytów przechodzi w `offline` `[code]`; skutku nie mierzono
wykonaniem.
⚠ **Wiążące dla G2/G2b:** wspólna funkcja „utwórz jednostkę AI z zadanym morale” musi ustawiać
`owner` i `factionId` imperium.

### ⚪ 324 — świeży `garrison_unit` jest `mobile`, a odtworzenie bez pola daje `deployed`

`createUnit` ustawia `deployState = opts.deployState ?? 'mobile'` (`GroundUnitManager.js:121`), a
`restore` dla zapisu bez pola przyjmuje `'deployed'` (`:1473`) `[code]`; zapis z polem przechodzi
poprawnie (`serialize`, `:1408`). Garnizon `mobile` ma `dmg 0` (`mobileStats`, `unitArchetypes.js:99`)
— pomiar G1, wiersz 1d: AI wygrywa 100% `[measured]`. D6: garnizon AI stoi `deployed` od utworzenia.

### ⚪ 325 — żaden archetyp AI nie bada technologii morale

`startingTechs` / `researchQueue` obu archetypów (`EmpireArchetypeExpansionist.js:64` i dalej,
`EmpireArchetypeIndustrialist.js:156`, `:190` i dalej) nie zawierają żadnej z 7 technologii
`statBonus militaryMorale` ani ich wymagania `ground_warfare` (0 trafień) `[code]`. Bonusy i tak działają
wyłącznie przy rekrutacji przez `ColonyManager.startGroundUnitBuild` (`ColonyManager.js:1447-1451`),
który czyta `TechSystem` przekazany do `ColonyManager` — w `GameScene.js:269` i `GameCore.js:177` drzewo
GRACZA `[code]`. Rodzina 185 (`military_logistics` poza planami AI). **Zastąpione przez D7**: jedyna gałka
AI to morale nadawane przy tworzeniu.

---

## 7. Korekty cudzych rejestrów (wpisane w rejestrach macierzystych)

- **65 — ✅ ZAMKNIĘTY 2026-10-02** w `AI_CAPTURE_PLAN.md` §65: `f5e30e5` (D5b, wspólny `DEFAULT_MORALE`);
  dopisek o martwym wyjątku garnizonu zamknięty w `85411d0` (D5a).
- **49 — zamknięty po stronie DANYCH** w `W3_PLAN.md` §49: `transport_assault` istnieje od `0e6ea0d`
  (2026-08-19, `ShipTemplateData.js:218`) `[git]` `[code]`; **nikt go nie zamawia** — jedyny `template:`
  w katalogu reguł to `science_probe` (`DirectorRuleData.js:85`), `DirectorPressure` zamawia fregaty
  (`:117`, `:121`) `[code]`. Reszta żyje jako **201**.
- **50 — zaniżony i zastąpiony przez D7** w `W3_PLAN.md` §50: jednostki legacy znikały w rundzie 1 **po
  OBU stronach**, nie tylko po stronie AI (G1: legacy vs legacy — obie rozwiązane przy HP 52/60)
  `[measured]`.
