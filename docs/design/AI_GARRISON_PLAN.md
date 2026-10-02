# AI GARRISON — obrona naziemna kolonii AI

> **Status:** ✅ **G1 i G1b ZAMKNIĘTE 2026-10-02 — obie bramki live właściciela PASS.** ✅ **G2-0 i G2-1 ZROBIONE
> 2026-10-02** (§5f). Dalej: **G2-K1** (stolice na oceanie) → **G2-2** → **G2-3** → **G2-4** → **G2b** → **G3** → **G1c** (§3).
> Decyzje **D1–D7** podpisane przez właściciela **2026-10-01** (D7: **2026-10-02**); zakres G1b (S1–S4) — **2026-10-02**;
> kierunek dla **333** i **330** — **2026-10-02** (§5d (a), niezaimplementowany); **D8–D18** — **2026-10-02** (§1; faza A G2 — §5e).
> Save **v101, zero migracji** w G1, w G1b i w G2-0/G2-1.
> **Commity G1:** `85411d0` (D5a) · `f5e30e5` (D5b + świadome odwrócenie `w3_seams_smoke` T6) · `f868ae8` (D5c).
> **Commity G1b:** `c0a3d5c` (S1, #309) · `a42ec93` (S2, #310) · `03688f0` (S3, #312) · `c7c5a74` (S4, #326) — §5a.
> **Commity G2:** `4d6ac63` (G2-0, piny szwów) · `82c9196` (G2-1, `createAIUnit`) — §5f.
> Keepery `ground_morale_resolution_smoke` **35/35** · `ground_round_fairness_smoke` **12/12** ·
> `ground_unit_loss_smoke` **29/29** · `g2_seams_smoke` **26/26** · `g2_create_ai_unit_smoke` **26/26** ·
> sweep **252/252 OK, 0 FAIL, 31 advisory** · `check-i18n` PASS (pl = en = **3426**).
> **Rejestr macierzysty findingów #309–#342:** ten plik, §6. Korekty cudzych rejestrów (65 · 49 · 50): §7.
> ⚠ Znaczniki źródła: `[code]` — przeczytane w źródle (#309–#325 na `f868ae8`; #326–#335 oraz §5a–§5c na
> `c7c5a74`; #336–#342 oraz §5e–§5f na `82c9196`) · `[measured]` — wykonane i policzone · `[git]` — historia
> commitów · `[doc]` — przepisane z dokumentu/raportu, bez ponownego pomiaru · `[doc: raport G2-A]` — z raportu
> fazy A G2 (2026-10-02, na `2a97bfe`), którego nie ma w repo.

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
| **D2** | **Skład z progów poziomu fabryk.** Liczby: **D9** (2026-10-02). | — |
| **D3** | **Wydobycie i zapas — poza krokiem 1.** | Wydobycie jest dziś nieczytelne przez API stawek (Finding **321**). |
| **D4** | **Lądowanie na obcym ciele wymaga wojny; garnizon materializuje się przy wypowiedzeniu.** Zamyka podbój w czasie pokoju. | Finding **317**. |
| **D5** | **Naprawa morale a/b/c — dostarczona w G1.** | §4: `85411d0` · `f5e30e5` · `f868ae8`. |
| **D6** | **Domyślne:** `garrison_unit` stoi `deployed` od utworzenia · placówka dostaje garnizon **tylko**, gdy ciało ma złoże `Xe` albo `Nt` · przy zmianie właściciela lub zniszczeniu ciała **jednostki poprzedniego właściciela są usuwane** · liczebność garnizonu widać na poziomie wywiadu `'detailed'` · garnizon **nie wchodzi** do `ThreatAssessment`. | Findingi **324** (stan `mobile` przy tworzeniu) i **319** (jednostki osierocone). Identyfikatory surowców: `Xe` (Ksenon), `Nt` (Neutronium), `ResourcesData.js:22-23` `[code]`. |
| **D7** (2026-10-02) | **AI używa modelu jednostek GRACZA (archetypów) wszędzie, także w pulach desantu.** Jedna gałka AI: **morale nadawane przy tworzeniu**, powiązane z progami fabryk z D2. AI wystawia wyłącznie typy proste: `shock_infantry`, `garrison_unit`, `aa_platform`, `rocket_artillery`. **Jednostki legacy zostają w danych** dla starych zapisów i `science_rover`. | Zastępuje Finding **50** (§7). Wymaga wspólnej funkcji tworzenia jednostki AI (Finding **323**). |
| **D8** (2026-10-02) | **Pytanie (f) zamknięte: jednostka defensywna nadal rozpada się przy morale 0** — reguła (i), bez zmiany kodu. | Z regułą „walka do końca” (ii) garnizon 10 jednostek przy morale 10 przechodził ze **100 %** przejęć na **0–6 %** `[doc: raport G2-A]`, a morale przestawało być gałką z D7. Powtórzone na `82c9196` (50 prób, 4 i 6 szturmowców): reguła (i) **100 %** i **100 %**, reguła (ii) **0 %** i **0 %** `[measured]` (§5e). |
| **D9** (2026-10-02) | **Drabina zamiast „liczb do zaproponowania” z D2** — tabela pod decyzjami. Wejście: **suma poziomów fabryk imperium w chwili tworzenia jednostki**. `aa_platform` **nie wchodzi** do garnizonów (w walce naziemnej obojętna). **Wszystko powyżej 20 jest tymczasowe** (brak pomiaru po gy 60); **morale 30 jest niezmierzone** i musi zostać zmierzone w G2-3. Wszystkie liczby żyją w **jednej tabeli danych**. | Suma poziomów fabryk przy gy 60: uprząż 5–20, fixture 20 i 20 `[measured]`. Na `82c9196`: z `aa_platform` 100 %/11 mies. wobec 100 %/15 bez niej (garnizon 4, morale 50, 6 szturmowców) oraz 100 %/18 wobec 100 %/16 (garnizon 10, morale 10, 4 szturmowców); z `rocket_artillery` **28 %** i **0 %** w tych samych komórkach `[measured]`. |
| **D10** (2026-10-02) | **Wewnątrz ciała garnizon jest ROZSTAWIONY wokół kafla stolicy, jedna jednostka na heks** — nie w stosie. | Na `82c9196` (garnizon 4, morale 50, 6 szturmowców, 50 prób): rozstawienie **100 %** przejęć, mediana 15 mies.; stos na kaflu stolicy **0 %**, napastnik traci **6 z 6**, obrońca średnio **0,1** `[measured]`. Rozstawienie = spirala `_findGroundUnitSpawn` (`ColonyManager.js:1799`) `[code]`. |
| **D11** (2026-10-02) | **Między ciałami:** stolica dostaje `ceil(limit / 2)`; reszta **po jednej jednostce na ciało**, malejąco wg `colonyDevScore`, **pełne kolonie przed placówkami**, remisy wg kolejności w `empire.colonies`; **nadwyżka wraca do stolicy**; bez kandydatów **wszystko idzie do stolicy**. Filtr `Xe`/`Nt` z D6 zostaje, choć dziś niczego nie wyklucza. | Zamyka niejednoznaczności rozmieszczenia z fazy A (nieparzysty limit, remisy, więcej ciał niż jednostek, więcej jednostek niż ciał, brak kandydatów) `[doc: raport G2-A]`. `colonyDevScore` = populacja + liczba aktywnych budynków (`src/utils/ColonyDevScore.js:28-30`) `[code]`. Placówki AI z `Xe` **i** `Nt`: fixture 10/10, uprząż 14/14 przy gy 60 `[measured]`. |
| **D12** (2026-10-02) | **Stolica imperium AI = `DirectorProduction.capitalOf`** — pierwsza pełna kolonia z `resourceSystem` w kolejności `empire.colonies`. | `DirectorProduction.js:132-139` `[code]`; zamyka wybór z Findingu **322**. |
| **D13** (2026-10-02) | **Bramka wojny.** Każde lądowanie jednostki naziemnej GRACZA na ciele należącym do innego imperium — kapsuły desantowe, „Wyładuj” z ładowni, away team — wymaga **wojny z właścicielem ciała**, sprawdzanej **w chwili lądowania**. Ciała niczyje i własne są zwolnione; **rozejm i pakt o nieagresji blokują**. `launchInvasion` dostaje to samo sprawdzenie. **Oba predykaty przejęcia wymagają wojny.** Źródło prawdy: **status relacji `'war'`**; zaczep mobilizacji: **`diplomacy:warDeclared`**. **Ładowanie wojsk na statki jest zawsze dozwolone.** | Findingi **317**, **337**, **338**, **339**. Status relacji: `DiplomacySystem.getStatus` (`:204`); na nim bramkuje sam `declareWar` (`:355`) `[code]`. Rekord wojny może się z nim rozjechać: `createWar` przy tym samym id zwraca istniejący rekord, także nieaktywny, bez emisji (`WarSystem.js:178-180`) `[code]`. |
| **D14** (2026-10-02) | **Wycofanie po pokoju (projekt właściciela).** Przy podpisaniu pokoju jednostki gracza na ciałach drugiej strony dostają **flagę wycofania z terminem 6 wyświetlanych miesięcy**. Do terminu **nie ma ognia ani okupacji kafli** między byłymi wrogami na tym ciele. Jednostki, które zostaną po terminie, są **usuwane i traktowane jak polegli** (POP wg tabeli śmierci). **Wpis w Dzienniku przy pokoju i ostrzeżenie miesiąc przed terminem.** Jednostki AI na ciałach gracza są **usuwane od razu** przy podpisaniu pokoju. | Dziś przy pokoju jednostki zostają: słuchacze `diplomacy:peaceSigned` (`UIManager.js:1669`, `AlienCivSystem.js:71`, `WarSystem.js:92`) ich nie ruszają, a `CombatSystem._findContestedHexes` grupuje jednostki wyłącznie po właścicielu, bez wojny (`CombatSystem.js:152-171`) `[code]`. |
| **D15** (2026-10-02) | **Mobilizacja raz na imperium**, przy jego **pierwszej wojnie** (flaga wewnątrz `empires.<id>`); potem tylko odrastanie strat (G3). **Zapis wczytany już w stanie wojny mobilizuje się na pierwszym ticku.** | Przy wczytaniu nie leci żadne zdarzenie wojny — emitują je wyłącznie `declareWar` i `createWar` `[code]`. `empires` jest zadeklarowanym kluczem `GameState` (`GameState.js:22`), a `restore` przywraca klucze najwyższego poziomu w całości (`:146-157`) ⇒ pole wewnątrz przeżywa zapis bez migracji `[code]`. |
| **D16** (2026-10-02) | **Zniszczenie ciała usuwa WSZYSTKIE jednostki naziemne na nim** (rozszerza D6). | D6 mówiło tylko o jednostkach poprzedniego właściciela; przy zniszczeniu osierocone zostają także jednostki trzeciej strony. Dziś `removeColony` nie rusza żadnej (Finding **319**; pin `g2_seams_smoke` P6c) `[measured]`. |
| **D17** (2026-10-02) | **Stolice na oceanie:** poprawić generowanie; w istniejących zapisach kolonia, której kafla stolicy nie da się zająć, jest przejmowana **regułą placówki** (dowolny własny kafel z budynkiem). | Finding **336**. |
| **D18** (2026-10-02) | **Kalibracja na żywej grze (fixture), nie na uprzęży.** | Finding **341**. |

**D9 — drabina** (wejście: suma poziomów fabryk imperium w chwili tworzenia jednostki; wszystkie liczby w jednej tabeli danych):

| suma poziomów fabryk | morale przy tworzeniu | skład | limit jednostek (D1) |
|---|---|---|---|
| poniżej 10 | 30 | tylko `garrison_unit` | × 1 |
| 10–24 | 50 | tylko `garrison_unit` ¹ | × 1 |
| 25–34 | 100 | co trzecia jednostka `rocket_artillery` | × 1 |
| 35–44 | 100 | jw. | × 1,25 |
| 45 i więcej | 100 | jw. | × 1,5 |

¹ Podpis wymienia dla tego progu tylko morale; skład czytam jako ciągłość progu niższego — do potwierdzenia.
⚠ Wszystko powyżej 20 jest tymczasowe (brak pomiaru po gy 60); morale 30 niezmierzone — do zmierzenia w G2-3;
`aa_platform` poza garnizonami.

**Również podpisane:**
- **brak losowania** rozmiaru garnizonu;
- **połowa limitu do stolicy**, reszta według wartości ciała (⚠ która definicja stolicy — Finding **322**) —
  doprecyzowane w **D11** i **D12** (2026-10-02);
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
| **G1b** | **ogień naprawdę jednoczesny** zamiast „wróg strzela pierwszy” · **zwolnienie zablokowanych POP** przy `morale_collapse` · wpis w Dzienniku przy rozwiązaniu · reintegracja do kolonii macierzystej | **309** · **310** · **312** · **326** ✅ | ✅ **2026-10-02** (§5a) |
| **G2-0** | piny dzisiejszych szwów, które kolejne kroki zmienią świadomie (`g2_seams_smoke`) | **317** · **318** · **319** · **323** · **324** · **336** | ✅ **2026-10-02** (`4d6ac63`, §5f) |
| **G2-1** | **jedna wspólna funkcja „utwórz jednostkę AI z zadanym morale”** — `GroundUnitManager.createAIUnit` | **323** · **324** | ✅ **2026-10-02** (`82c9196`, §5f) |
| **G2-K1** | **stolice na oceanie (D17):** generowanie stawia stolicę AI na kaflu, na którym da się stanąć · stare zapisy — reguła placówki w predykacie przejęcia | **336** | w sesji 2026-10-02 |
| **G2-2** | **bramka wojny (D13):** lądowanie gracza (kapsuły, „Wyładuj”, away team), `launchInvasion`, oba predykaty przejęcia | **317** · **337** · **338** · **339** | do zrobienia — **bramka w przeglądarce** |
| **G2-3** | **mobilizacja (D15)** z rozmieszczeniem (**D10**, **D11**, **D12**), drabiną (**D9**) i stanem; usuwanie jednostek (**D6**, **D16**); stempel kafli (**318**) | **318** · **319** · **320** · **322** · **324** | do zrobienia — **bramka w przeglądarce** |
| **G2-4** | **wycofanie po pokoju (D14)** | — | do zrobienia — **bramka w przeglądarce** |
| **G2b** | pule desantu (`INVASION_UNIT_POOLS`) na archetypy **przez `createAIUnit`** (D7) | **50** (zastąpiony) · **311** (zostaje dla jednostek legacy gracza) · **340** | do zrobienia |
| **G3** | odrastanie strat · widoczność (`'detailed'`) | — | do zrobienia |
| **G1c** | **rodzina „utrata POP”:** nieoddana część POP zmarłej jednostki **naprawdę ginie** — usuwana z populacji razem ze swoją blokadą (333) · ręczne rozwiązanie **zwraca pełny koszt**, jak utrzymanie i rozpad (330) · kolejka reintegracji poza zapisem (328) · utrzymanie bez terminu właściciela (329) | **333** · **330** · **328** · **329** | **po G3** (kolejność z 2026-10-02, przy podpisie D8–D18; wcześniej „po G2”, §5d (b)); kierunek 333 i 330 podpisany 2026-10-02, niezaimplementowany |
| później | limit floty · odbicie kolonii · przyczółek | — | — |

⚠ **Kolejność G1b przed G2 jest celowa:** materializacja garnizonu w świecie, w którym AI zawsze
strzela pierwsze (**309**), mierzyłaby balans skrzywiony na korzyść atakującego AI; a każdy rozpad
garnizonu gracza bez zwolnienia POP (**310**) to trwała utrata ludności. **Dotrzymana:** G1b zamknięty
2026-10-02, przed G2.

⚠ **Przydział findingów z sesji G1b (#327–#335, §6) — §5d:** **333** · **330** · **328** · **329** → **G1c**;
**334** → etap polerki UI (arc literałów); **332** ✅. **Bez przypisanego kroku:** **327** · **331** · **335**.

⚠ **Przydział findingów G2 (#336–#342, §6):** **336** → **G2-K1** · **337** · **338** · **339** → **G2-2** · **340** → **G2b** ·
**341** → bez kroku (instrument; **D18**) · **342** → bez kroku (`homeColonyId: null` zostaje decyzją właściciela).

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
- ⚠ **Domknięte na bramce G1b (§5c.2):** karta jednostki pokazuje morale ARCHETYPU liczbą („Mor 100/100”;
  gałąź `hasSupplyV3`, `ColonyOverlay.js:2695`, `:2706`) `[measured: bramka G1b]` `[code]`. Ścieżka legacy
  z `NaN` (Finding **316**) — nadal niesprawdzona.

---

## 5a. G1b — dostarczone

### 5a.1. Cztery defekty, cztery commity

| krok | defekt (zmierzony na `82c7722` / drzewie poprzedniego kroku) | naprawa | commit |
|---|---|---|---|
| **S1** (#309) | salwa wroga szła PRZED salwą gracza, a `_resolveFire` pomijał atakującego z `hp ≤ 0` ⇒ jednostka gracza zabita w pierwszej salwie nie odpowiadała, a trafiona strzelała z mnożnikiem liczonym PO trafieniu; szturm vs szturm przy bazowym morale: gracz ginie w r4, AI zostaje z hp 2 `[measured]` | migawka `{ ...u }` każdej jednostki rundy (obie strony + wsparcie) PRZED pierwszym strzałem (`CombatSystem.js:219-222`); `_resolveFire(..., roundStart)` czyta z niej `hp`/`status` i liczy obrażenia ze strzelca z migawki (`:300`); kolejność losowań RNG bez zmian | `c0a3d5c` |
| **S2** (#310) | `morale_collapse` emitował `groundUnit:disbanded` i usuwał jednostkę, nie zwalniając POP zablokowanych przy rekrutacji ⇒ po rozpadzie garnizonu (popCost 1,2) blokada na kolonii macierzystej stała na zawsze `[measured: keeper T-D na drzewie S1]` | NEW `ColonyManager.releaseGroundUnitPops(unit, cause)` (`:1699`) — pełny koszt `unlockPops(popCost, 'laborer')` na kolonii macierzystej Z TERMINEM WŁAŚCICIELA (`_ownedHomeColony` `:1680`, `_colonyBelongsTo` `:1668`); wołane w gałęzi, która jednostkę usuwa (`CombatSystem.js:262`), PRZED emisją i `removeUnit`; znacznik `_popsReleased` ⇒ dokładnie raz; brak kolonii właściciela ⇒ NEW `groundUnit:popsLost` + wpis w Dzienniku | `a42ec93` |
| **S3** (#312) | `groundUnit:disbanded` nie miał subskrybenta, a klucz `event.groundUnit.disbanded` czytelnika — rozwiązanie jednostki było nieme `[code]` | `NotificationCenter._handleGroundUnitDisbanded` (`:514`, subskrypcja `:67`) — wpis TYLKO w Dzienniku (kanał `combat`, `warn`), tylko dla jednostek gracza; powód z mapy `DISBAND_JOURNAL_KEYS` (`:20`), powód spoza mapy ⇒ brak wpisu; NEW klucz `event.groundUnit.disbandedMorale` PL+EN; ładunek obu emitentów + `owner`/`type`/`customName`; subskrybent NIE zwalnia POP | `03688f0` |
| **S4** (#326) | reintegracja po ŚMIERCI kolejkowała zwrot na kolonii CIAŁA, na którym jednostka zginęła ⇒ śmierć jednostki gracza na ciele AI zdejmowała blokady KOLONII AI (5 → 4,7), a dom gracza nie odzyskiwał nic `[measured: keeper T-F1 na drzewie S3]` | cel = `_ownedHomeColony(unit)` (`ColonyManager.js:1642`), jednostka z rejestru (`:1639`; każdy z sześciu żywych emitentów emituje PRZED `removeUnit`); wpis kolejki niesie właściciela, a wypłata sprawdza go jeszcze raz (`:1605`) ⇒ kolonia przejęta w czasie zwłoki — wypłata przepada z meldunkiem; tabela reintegracji bez zmian | `c7c5a74` |

⚠ **Zakres poszerzony podpisem 2026-10-02:** plan (§3) miał w G1b tylko 309 i 310; S3 (#312) i S4 (#326 —
numer nadany przy podpisie) weszły z podpisem właściciela.
⚠ **S1 zostawia jedną asymetrię świadomie — i jest ona symetryczna:** kolejny strzelec TEJ SAMEJ strony widzi
trafienia swoich poprzedników i nie strzela w trupa; po obu stronach tak samo.
⚠ **S4 nie zmienia tabeli reintegracji** — dla `rate < 1` dalej oddaje część. Los nieoddanej reszty:
Finding **333** (rekoncyliacja A0, §5c.1).

### 5a.2. Keepery

| keeper | commit | testy | fail-first na rodzicu | na commicie |
|---|---|---|---|---|
| NEW `ground_round_fairness_smoke` | `c0a3d5c` (S1) | T-A (szturm vs szturm: identyczne hp/morale po każdej rundzie, obie giną w r4) · T-B (zamiana stron nie zmienia wyniku) · T-C1/C2/C3 (zabita i trafiona jednostka zadaje obrażenia jak nietrafiona; lustro AI) | **8 PASS / 4 FAIL** (`82c7722`) | 12/12 |
| `ground_morale_resolution_smoke` | `c0a3d5c` (S1) | T4 `shock_vs_shock`: `{r2, ginie gracz, hp 7}` → `{r2, giną obie}` — ⚠ **zmiana podpisana z góry** (pinowała defekt); nagłówek pliku, który mówił, że AI strzela pierwsze, poprawiony | — | 35/35 |
| NEW `ground_unit_loss_smoke` | `a42ec93` (S2) | T-D (−1,2 dokładnie raz; inne kolonie bez zmian) · T-D2 (dom przejęty ⇒ nic nigdzie + `popsLost` + wpis; strażnik reguły właściciela + dowód jego czułości) · T-E (utrzymanie zwalnia raz; kontrola: subskrybent bez filtra zwolniłby drugi raz) | **10 / 4** (drzewo S1) | 14/14 |
|  | `03688f0` (S3) | + T-G1..G4 (wpis rozpadu · wpis utrzymania · syntetyczne `disbanded` bez zwolnienia · kontrola: rozpad jednostki AI poza Dziennikiem gracza) | **17 / 3** (drzewo S2) | 20/20 |
|  | `c7c5a74` (S4) | + T-F1..F3 (śmierć na ciele AI ⇒ kolejka domu · dom przejęty przed śmiercią · dom przejęty w czasie zwłoki) + kontrola (śmierć na własnym ciele) | **22 / 7** (drzewo S3) | 29/29 |

Harness: prawdziwy `GameCore` + `CombatSystem` / `EventLogSystem` / `NotificationCenter` konstruowane PO boocie;
rekrutacja prawdziwą ścieżką `startGroundUnitBuild`; stub wyłącznie bramek koszar; dodatkowa blokada 5 POP,
żeby podwójne zwolnienie nie schowało się w klampie do zera.
Sweep na drzewie każdego commitu: **249 / 250 / 250 / 250, 0 FAIL, 31 advisory** (te same co w bazie);
`check-i18n` pl = en **3424 / 3425 / 3426 / 3426** `[measured]`. Przed commitami łańcuch łatek sprawdzony na
indeksie tymczasowym: indeks + p2 + p3 + p4 == drzewo robocze; po commitach drzewo `HEAD` == drzewo T4,
sweep **250/250** i lista advisory identyczna z bazą `[measured]`.

### 5a.3. Pomiar rozstrzygalności przed / po (sesja G1b)

200 prób na parę, natywne `Math.random`, okno 60 civY, kadencja `gum.tick` z pościgiem AI, bez
`SupplyCoverageSystem`. Kolumny wyniku: wygrywa AI / wygrywa gracz / wspólne zabicie (pierwsza decyzja).
PRZED = `82c7722`, PO = drzewo S1–S4 (= `c7c5a74`). Wszystkie liczby `[measured]`; sumy 101 % to zaokrąglenie.

| para (AI atakuje → gracz broni) | PRZED | PO | rozstrz. / mediana / p90 rund (przed = po) |
|---|---|---|---|
| szturm → szturm, +0 | 97 / 4 / 0 | 14 / 13 / 74 | 100% / 4 / 4 |
| legacy piechota → legacy piechota, +0 | 87 / 13 / 0 | 12 / 11 / 77 | 100% / 8 / 8 |
| szturm → garnizon okopany, +0 | 100 / 0 / 0 | 100 / 0 / 0 (rozpad garnizonu w r4) | 100% / 4 / 4 |
| szturm → garnizon okopany, drzewo morale u obu | 24 / 76 / 0 | 0 / 81 / 20 | 100% / 3 / 3 |
| artyleria → AA, +0 | 100 / 0 / 0 | 68 / 0 / 33 | 100% / 1 / 2 |

Żadna para symetryczna nie daje jednej stronie powyżej 60 % ⇒ warunek STOP sesji G1b nie zaszedł.
⚠ **Wspólne zabicie 74–77 % w pojedynkach symetrycznych** to skutek jednoczesnego ognia, nie defekt —
**przyjęte** (§5b (d)).
⚠ Wiersz 3 bez zmian: garnizon przy bazowym morale rozpada się w r4 niezależnie od kolejności salw — pytanie
(f) w §5b.

---

## 5b. Odpowiedzi na pytania sesji G1b (właściciel, 2026-10-02)

| | pytanie | odpowiedź |
|---|---|---|
| (a) | wpisy o rozwiązaniu jednostki: dzwonek czy Dziennik | **tylko Dziennik**, bez dzwonka (tak wdrożone w `03688f0`) |
| (b) | rozwiązanie jednostek AI nie trafia do Dziennika gracza | **przyjęte** |
| (c) | ponowne sprawdzenie właściciela przy odroczonej wypłacie reintegracji | **w zakresie S4 — tak** (`c7c5a74`, `ColonyManager.js:1605`) |
| (d) | 74–77 % wspólnych zabić w pojedynkach symetrycznych | **przyjęte** |
| (e) | sześciu kandydatów z sesji G1b | **dostają numery** — §6: **327–332** |
| (f) | czy jednostka defensywna w ogóle ma się rozpadać od morale | **NADAL NIEPODPISANE** — do rozstrzygnięcia w **G2** |

---

## 5c. Bramka live G1b — 2026-10-02, właściciel: **PASS**

Zapis na **gy 60**, gracz **w stanie WOJNY** z `emp_001`; dom `entity_5`, kolonia AI `entity_54`, koszary
poziom 3. Liczby `[measured: bramka właściciela]`, chyba że oznaczono inaczej.

- **S1 — PASS.** `shock_infantry` vs `shock_infantry` na (8,8): 15/15 → hp 10 morale 12 obie → hp 6 morale 9
  obie → hp 1 vs hp 2, morale 6 obie → **obie zniszczone w tej samej rundzie**.
- **S2 — PASS na stanie końcowym.**
  - **Przebieg 1:** zrekrutowany `garrison_unit` (popCost 1,2, dom `entity_5`, morale podniesione technologiami
    gracza) zaatakowany przez `shock_infantry` utworzony z hp 400 i morale 100. Przy 4. odczycie miesięcznym
    garnizonu nie było, a blokada domu stała (16.1715556802778); przy następnym spadła o pełne 1,2 (odczyt
    15.5715556802778 po dodatkowej rekrutacji +0,6). **Wyjaśnienie — §5c.1:** garnizon zginął od OBRAŻEŃ
    (ścieżka śmierci: `garrison_unit` `{rate 1.0, delay 1.0}` ⇒ pełne 1,2 miesiąc później), nie od rozpadu.
  - **Przebieg 2:** zrekrutowany garnizon `gu_58` (popCost 1,2), morale wymuszone na 10, wróg hp 400 morale 30:
    walka trwała ponad rok, wróg wielokrotnie schodził na sąsiedni heks i wracał (Finding **335**), garnizon
    w końcu się rozpadł; blokada 16.1715556802778 → 14.971555680277802 (−1,2), kolejka zwrotów pusta, wpis
    w Dzienniku obecny (właściciel podał tekst po angielsku: „unit disbanded, morale collapse”).
    **Natychmiastowości zwolnienia nie obserwowano** — dowodzi jej sonda (§5c.1 (a)).
- **S3 — PASS liczbowo.** `gu_57` (popCost 0,6) usunięty ścieżką utrzymania: blokada 15.571555680277802 →
  14.971555680277802, raz. **Wpisu w Dzienniku dla utrzymania właściciel nie potwierdził** (pokrycie: keeper
  T-G2 `[measured]`; render klucza w PL i EN — §5c.2 `[measured]`).
- **S4 — PASS.** `gu_61` (popCost 0,6) zabity na `entity_54`: miesiąc później kolejka domu [0,3], kolejka AI [],
  blokada 16.1715556802778; później blokada 15.871555680277801 (−0,3). Kolejka domu trzymała wtedy trzy wpisy
  innych jednostek, które zginęły poza testem (`gu_27` 0,2, `gu_28` 0,2, `gu_52` 0,8 `rocket_artillery`,
  właściciel gracz) — **uznane na kolonii macierzystej**.
- **Niepotwierdzone:** konsola bez błędów; dzwonek bez zmian.

Arytmetyka odczytów (`node`) `[measured]`: 16.1715556802778 − 1,2 + 0,6 = **15.571555680277802** ·
16.1715556802778 − 1,2 = **14.971555680277802** · 15.571555680277802 − 0,6 = **14.971555680277802** ·
16.1715556802778 − 0,3 = **15.871555680277801** — każdy odczyt bramki zgodny co do bitu z pełnym kosztem
(S2, S3) albo z udziałem z tabeli (S4).

### 5c.1. Rekoncyliacja przebiegu 1 (Część A0 sesji zamykającej)

Pytanie: czy „garnizon zniknął, blokada stoi, miesiąc później −1,2” nie znaczy, że zwolnienie S2 jest
asynchroniczne. Odpowiedź: **nie — odczyt to kształt ścieżki śmierci**. Bez STOP-u; commity wykonane.

**(a) Zwolnienie S2 jest synchroniczne z usunięciem — także w okablowaniu gry.** Łańcuch: `GameScene.js:3678`
`timeSystem.update` → `TimeSystem.js:76` `emit('time:tick')` → `GroundUnitManager.js:47-48` `_onTick` →
`tick` (`:403`) → `_tickCombatAI` (`:995`) → `CombatSystem.tick` (`:63`) → `_runAllBattles` (`:112`) →
`_runBattleRound` → `releaseGroundUnitPops` (`:262`) → emisja (`:263`) → `removeUnit` (`:269`); referencje
`window.KOSMOS.colonyManager` / `groundUnitManager` / `combatSystem` ustawia `GameScene.js:407`, `:425`, `:426`
`[code]`. Sonda headless przez prawdziwy `TimeSystem.update`: w JEDNYM stosie wywołań kolejność
`release (blokada Δ 0 → −1,2) → emit disbanded → removeUnit`; stos zaczyna się w `EventBus.emit` →
`GroundUnitManager._onTick` `[measured]`.

**(b) W przebiegu 1 garnizon zginął od OBRAŻEŃ.** Morale startowe = `min(100, baseMorale + bonus techów)`
(`ColonyManager.js:1451`); siedem technologii morale: `military_logistics` 10, `field_discipline` 15,
`combat_doctrine` 10, `elite_training` 15, `fleet_logistics` 5, `strategic_doctrine` 15, `veteran_corps` 20
`[measured]`. Śmierć od obrażeń idzie osobną gałęzią: `groundUnit:destroyed` (`CombatSystem.js:239-244`,
`cause: 'combat'`, `popCost`) → handler `ColonyManager.js:1625` → `garrison_unit` `{rate 1.0, delay 1.0}`
(`:1301`) ⇒ **pełny koszt 1,2** w kolejce kolonii macierzystej, wypłata po **1,0 civY = 1 wyświetlany
miesiąc** (`CIV_TIME_SCALE = 12`, `GameConfig.js:21`; zegar `_pendingPopClock` z `time:tick`, `:151`, `:1593`)
`[code]`. Odtworzenie przebiegu 1 przez prawdziwy `time:tick` `[measured]`:

| techy morale | morale startowe | zniknął w mies. | ścieżka | blokada przy zniknięciu | kolejka domu | miesiąc później |
|---|---|---|---|---|---|---|
| brak | 10 | 4 | `disbanded` (rozpad) | **−1,2 w tej samej rundzie** | [] | −1,2 |
| `field_discipline` (+15) | 25 | 6 | `destroyed` (obrażenia) | bez zmian | [1,2] | **−1,2** |
| + `combat_doctrine` (+25) | 35 | 6 | `destroyed` | bez zmian | [1,2] | **−1,2** |
| wszystkie 7 (+90) | 100 | 7 | `destroyed` | bez zmian | [1,2] | **−1,2** |

Rozpad dałby −1,2 przy tym samym odczycie (wiersz 1) — odczyt właściciela ma kształt wierszy 2–4.
⚠ **Granica dowodu:** numer odczytu, przy którym garnizon zniknął (4. u właściciela vs 6.–7. w sondzie), się
NIE zgadza — sonda nie odtwarza stanu zapisu właściciela (zestaw techów, chwila rozstawienia, położenie
odczytów względem granicy rundy). Wniosek stoi na KSZTAŁCIE, nie na numerze odczytu. Kolejki domu przy
4. odczycie właściciel nie zanotował.

**(c) Reszta udziału przy śmierci jednostki z `rate < 1` zostaje zablokowana NA ZAWSZE i dalej liczy się do
populacji — defekt, zarejestrowany jako Finding 333, nienaprawiony.** `shock_infantry` (popCost 0,6,
`{rate 0.5, delay 2.0}`, `ColonyManager.js:1300`) zabity na ciele domowym `[measured]`: blokada po rekrutacji
+0,6 → w chwili śmierci +0,6, kolejka [0,3] → po 3 mies. **+0,3** → po 27 mies. **+0,3**; populacja w ticku
śmierci 8 → 8; wywołania `removePop` / `_removeUnlockedPop` / `killCrew`: **0**;
`serialize().lockedPerStrata.laborer` niesie +0,3. Mechanizm `[code]`: `lockPops` tylko dopisuje do
`_lockedPerStrata` (`CivilizationSystem.js:279-286`), `population` = `_strataCount + _unemployed` (`:652-654`)
blokad nie widzi, `freePops` je odejmuje (`:777-780`), zapis je niesie (`:908`, `:961-962`).

### 5c.2. Obserwacje z bramki, sprawdzone w kodzie na `c7c5a74`

- **Desant bez oporu w czasie WOJNY** (`gu_60` transportem na `entity_58` „Thuban f”): żaden obrońca naziemny.
  To **ilustracja luki, którą zamyka ten arc** (kolonia AI nie ma garnizonu — §0), **NIE potwierdzenie
  Findingu 317**, bo zapis był w stanie wojny; 317 stoi dalej na kodzie i raporcie G0. Bez nowego numeru.
- **Karta jednostki pokazuje morale archetypu liczbą** („Mor 100/100”): gałąź `hasSupplyV3`
  (`ColonyOverlay.js:2695`) → `` `🔥 Mor ${Math.round(unit.morale)}/${unit.maxMorale}` `` (`:2706`) `[code]` ⇒
  domyka pozycję G1 „karta jednostki niesprawdzona” dla archetypów (§5). Bez nowego numeru.
- **Mieszane języki na jednym ekranie** — Finding **334**. Panel planety idzie przez `t()`
  (`colonyInfo.tabWorkforce` → „Workforce”, `en.js:840`; `colonyInfo.physics` → „CHARACTERISTICS”, `en.js:903`,
  użyte w `ColonyOverlay.js:1456`) ⇒ **przy tym ekranie język gry był EN** (wniosek z kodu; ustawienia
  właściciel nie potwierdził — §5d (f)). Napisy karty to literały: „⏸ Bezczynna” (`:2661`), „🔍 Skanuj obszar”
  (`:2858`), „✕ Odznacz” (`:2880`), `` `Zaznaczono ${n} jednostek` `` (`:5449`); tytuł „SHOCK_INFANTRY” to
  fallback `unit.type.toUpperCase()` (`:2641`), bo mapa `typeLabel` (`:2636-2640`) zna tylko typy legacy
  `[code]`.
  **Nowe klucze Dziennika renderują się po polsku przy języku PL** — wykonanie prawdziwych handlerów
  `NotificationCenter` na prawdziwym `EventLogSystem` `[measured]`: PL „Jednostka Garnizon rozwiązana
  (załamanie morale)” · „Jednostka Szturmowcy rozwiązana (brak utrzymania)” · „Utracono 0.3 POP jednostki
  Szturmowcy (brak kolonii macierzystej)”; EN „Unit Garrison disbanded (morale collapse)” · „Unit Shock Inf.
  disbanded (no upkeep)” · „Lost 0.3 POP of unit Shock Inf. (no home colony)”. Angielski tekst u właściciela
  = język EN. ⚠ Tekst wpisu utrwala się w języku z chwili emisji (klasa **165b**).
- **Rozbita jednostka AI schodzi na sąsiedni heks i wraca, wielokrotnie — rok pata** — Finding **335**
  (rodzina **313**).

---

## 5d. Odpowiedzi na pytania sesji zamykającej G1b (właściciel, 2026-10-02)

| | pytanie | odpowiedź |
|---|---|---|
| (a) | los nieoddanej części POP (**333**) i ręczne rozwiązanie (**330**) | **333:** nieoddana część POP zmarłej jednostki **naprawdę ginie** — usuwana z populacji **razem ze swoją blokadą**. **330:** ręczne rozwiązanie **zwraca pełny koszt**, jak utrzymanie i rozpad morale. **Kierunek podpisany; niezaimplementowany.** |
| (b) | krok dla rodziny „utrata POP” | **NOWY krok G1c** = **333** · **330** · **328** · **329**, zaplanowany **po G2** (wiersz w §3). Kierunek naprawy 328 i 329 nie był przedmiotem tej odpowiedzi. |
| (d) | otwarcie i zamknięcie **332** w tym samym commicie dokumentacji | **przyjęte** |
| (e) | **334** | **zostaje do etapu polerki UI** (arc literałów, klasa **113**) |
| (f) | język gry na bramce G1b | **angielski — wniosek CC z kodu** (§5c.2); **właściciel go nie podał** |

Litera **(c)** nie wystąpiła w przekazanych odpowiedziach — bez wpisu.

---

## 5e. G2 — faza A: audyt i pomiar (2026-10-02, na `2a97bfe`)

Sesja tylko do odczytu przed pierwszym krokiem G2. ⚠ **Raportu tej sesji nie ma w repo.** Liczby, których nie
powtórzyłem, mają znacznik `[doc: raport G2-A]`; liczby powtórzone na `82c9196` mają `[measured]`.

**Uprząż.**
- Rozmieszczenie (B1): `bootWithDirector`, dwa imperia AI (`AI_ARCHETYPE_SEQUENCE`, `EmpireGenerator.js:19`
  `[code]`), pasywny gracz, ziarna `HEADLESS_GALAXY_SEED` i 987654321, odczyty przy gy 0/20/40/60.
- Walka (B2): prawdziwe `GroundUnitManager` + `CombatSystem` + predykaty `InvasionSystem`, natywny `Math.random`,
  50 prób na komórkę, okno 60 civY, siatka prawdziwej stolicy AI (równina). Gracz ląduje obok stolicy, idzie stosem
  na stolicę, a po jej zajęciu dobija obrońców po kolei.

**Kto dostaje ile (B1).** POP imperium przy gy 60: uprząż 60–81 (limit z D1: 3–5), fixture GATE-S4 178–185
(limit 11); suma poziomów fabryk przy gy 60: uprząż 5–20, fixture 20 i 20 `[measured]`. Rozjazd uprzęży
i żywej gry — Finding **341** ⇒ **D18**.

**Macierz walki (B2): reguła (i), sam garnizon, rozstawienie, tech +0** — % przejęć / mediana w miesiącach
`[doc: raport G2-A]`:

| garnizon · morale | 2 szturmowców | 4 | 6 | 12 |
|---|---|---|---|---|
| 2 · 10 | 100 / 9 | 100 / 8 | 100 / 8 | |
| 2 · 50 | 0 | 100 / 12 | 100 / 10 | |
| 2 · 100 | 0 | 100 / 13 | 100 / 11 | |
| 4 · 10 | 100 / 12 | 100 / 9 | 100 / 9 | |
| 4 · 50 | 0 | 20 / 23 | 100 / 15 | |
| 4 · 100 | 0 | 0 | 100 / 18 | |
| 10 · 10 | 0 | 100 / 17 | 100 / 16 | |
| 10 · 50 | 0 | 0 | 0 | 100 / 25 |
| 10 · 100 | 0 | 0 | 0 | 100 / 26 |

Pełne drzewo technologii gracza (morale +90, org +90, zapas +60) mniej więcej połowi potrzebną liczbę
napastników — np. garnizon 10 przy morale 50 bierze 4 szturmowców w 98 % prób `[doc: raport G2-A]`.

**Powtórzone na `82c9196`** (50 prób na komórkę) `[measured]`:
- garnizon 10, morale 10 — reguła (i): 100 % przy 4 i 6 szturmowcach; reguła (ii): **0 %** przy 4 i 6 (→ **D8**);
- garnizon 4, morale 50, 6 szturmowców — rozstawienie 100 % (15 mies.), **stos 0 %** — napastnik traci 6 z 6 (→ **D10**);
- ta sama komórka z `aa_platform`: 100 % (11 mies.); z `rocket_artillery`: **28 %**;
- garnizon 10, morale 10, 4 szturmowców — z `aa_platform`: 100 % (18 mies.); z `rocket_artillery`: **0 %** (→ **D9**).

Finding **335** w ataku prawie się nie pojawia: najwyżej 0,06 ucieczki AI na próbę, zero pętli
`[doc: raport G2-A]`.

**Znaleziska fazy A** (rejestr §6): **336** stolice AI na oceanie · **337** łazik zdobywa kolonię AI w pokoju ·
**338** „Wyładuj” bez kapsuł, dominacji i wojny · **339** przejęcia nie pytają o wojnę · **340** pule desantu bez
kluczy żywych archetypów · **341** uprząż kontra fixture · rozszerzenie **323** o zmierzony skutek.

**Co z niej wynikło:** decyzje **D8–D18** (§1) i podział G2 na kroki (§3).

---

## 5f. G2-0 i G2-1 — dostarczone (2026-10-02)

| krok | commit | zawartość | keeper |
|---|---|---|---|
| **G2-0** | `4d6ac63` | piny dzisiejszych szwów, które kolejne kroki zmienią świadomie: **P1** `createUnit` (domyślne `'humanity'` / `'player'` / `'mobile'`; forma 5-argumentowa daje jednostkę gracza) · **P2** `{ owner }` na kolonii z 0 Kr → `offline` w 1. civY, znika w 5. · **P3** kafle AI z `owner: null` · **P4** gdzie staje pierwsza jednostka (stolica lądowa / oceaniczna / placówka) · **P5** przejęcia i `launchInvasion` w pokoju · **P6** przejęcie, transfer i usunięcie kolonii zostawiają jednostki | NEW `g2_seams_smoke` **26/26**; czułość: preload spoza repo odwraca po kolei każdy szew — pada dokładnie jego pin (przy P1 także P2, który stoi na domyślnym `factionId`) `[measured]` |
| **G2-1** | `82c9196` | `GroundUnitManager.createAIUnit({ archetypeId, empireId, planetId, q, r, morale, deployed = true })` → `{ ok: true, unit }` albo `{ ok: false, reason }` | NEW `g2_create_ai_unit_smoke` **26/26**; fail-first na HEAD-owym `GroundUnitManager`: **4 PASS / 22 FAIL** (zielone tylko świadek i trzy kontrole) `[measured]` |

**Kontrakt `createAIUnit`** (`GroundUnitManager.js:200`) `[code]`:
- `owner` **i** `factionId` = imperium — poza utrzymaniem i limitem rekrutacji gracza;
- rozkładany archetyp stoi `'deployed'` od utworzenia (te same staty co po `deploy()`); `deployed: false` → `'mobile'`;
- `morale` = `maxMorale` = podana wartość przycięta do [0, 100]; archetyp bez morale dostaje 0;
- `org` i `supply` bazowe i pełne; `popCost` 0;
- `homeColonyId` = kolonia imperium na tym ciele (pełna albo placówka), inaczej `null`;
- odmowa bez tworzenia czegokolwiek: `unknown_archetype` (także legacy), `unknown_empire` (spoza `empireRegistry`,
  także `'player'`), `invalid_morale`;
- zawsze forma z obiektem `opts`, nigdy 5-argumentowa; zero wołających w tym kroku.

**T8:** `garrison_unit` utworzony z morale 10 / 50 / 100 rozpada się pod ogniem dokładnie przy trafieniu
**4 / 17 / 34**, czyli tak, jak przewiduje reguła G1 `[measured]`.

**Odpowiedzi właściciela (2026-10-02):** odmowa `invalid_morale` i przycięcie do [0, 100] zostają; kształt zwrotu
zostaje; `homeColonyId` zostaje `null` tam, gdzie imperium nie ma kolonii na ciele; listę typów z D7 egzekwują
wołający przez dane składu, nie funkcja.

Sweep po G2-1: **252/252 OK, 0 FAIL, 31 advisory** (lista advisory bez zmian); `check-i18n` PASS 3426 `[measured]`.

---

## 6. Rejestr findingów arca (#309–#342, zebrane 2026-10-02)

⚠ **Zasada wpisu:** każde `plik:linia` sprawdzone grepem — #309–#325 na `f868ae8`, #326–#335 na `c7c5a74`,
#336–#342 na `82c9196` (stare wpisy zachowują numery linii sprzed G1b). Numeracja globalna: najwyższy istniejący numer to **#308**
(`VESSEL_ORDERS_PLAN.md` §308; #309 był tam planowany i świadomie **nieprzydzielony**), więc ten arc zaczyna
od **#309**; przed nadaniem #327+ sprawdzono, że w żadnym rejestrze nie ma numeru wyższego niż #325, a #326
istniał tylko w komunikacie `c7c5a74`; przed nadaniem #336+ sprawdzono grepem wszystkie rejestry — najwyższy
był #335. Znaczniki: 🔴 żywy i dotkliwy · 🟠 realny, ograniczony ·
⚪ obserwacja/higiena · ✅ zamknięty.
⚠ Źródło: **309–316** z sesji G1 · **317–325** z audytu G0 (mechanizmy przemierzone w źródle teraz;
liczby z G0 oznaczone `[doc: raport G0]`) · **326** nadany przy podpisie zakresu G1b · **327–332** kandydaci
sesji G1b (§5b (e)) · **333** z rekoncyliacji A0 (§5c.1 (c)) · **334–335** z obserwacji bramki G1b (§5c.2) ·
**336–341** z fazy A G2 (§5e; liczby powtórzone na `82c9196` mają `[measured]`) · **342** z sesji G2-1 (§5f).

### ✅ 309 — salwa wroga rozstrzygana PRZED salwą gracza; zabici gracza nie odpowiadają — ZAMKNIĘTY 2026-10-02 (`c0a3d5c`, G1b/S1)

`_runBattleRound` opisuje wymianę jako jednoczesną (`CombatSystem.js:211` „Simultaneous fire
exchange”), ale woła `_resolveFire(wróg → gracz)` (`:212`) **przed** `_resolveFire(gracz → wróg)`
(`:217`), a `_resolveFire` pomija atakującego z `hp <= 0` (`:279`) ⇒ jednostka gracza zabita
w pierwszej salwie nie oddaje strzału; spadek jej org/morale z pierwszej salwy obniża też mnożnik jej
własnej salwy (`GroundUnitFactory.computeDamageMult`) `[code]`. Pomiar G1: w parach symetrycznych AI
wygrywa 93–94% (szturm vs szturm) i 84–90% (legacy vs legacy) `[measured]`. **Potwierdzone na żywo**
na bramce G1 (§5, D5c) `[measured: bramka]`.
**Zamknięcie:** migawka stanu z początku rundy dla obu stron (`CombatSystem.js:219-222` na `c7c5a74`),
strzelec czytany z migawki (`:300`); kolejność RNG bez zmian. Szturm vs szturm 97/4/0 → 14/13/74 %
(AI / gracz / wspólne zabicie) `[measured]`; bramka G1b S1: obie jednostki giną w tej samej rundzie
`[measured: bramka]`. Keeper `ground_round_fairness_smoke` 12/12 (fail-first 8/4). §5a.

### ✅ 310 — `morale_collapse` nie zwalnia zablokowanych POP-ów — ZAMKNIĘTY 2026-10-02 (`a42ec93`, G1b/S2)

Rozpad (`CombatSystem.js:246-250`) emituje `groundUnit:disbanded` i woła `removeUnit` — **nie** emituje
`groundUnit:destroyed`, więc reintegracja POP (`ColonyManager.js:1613`) nie rusza, i **nie** woła
`unlockPops`, jak rozwiązanie z braku utrzymania (`ColonyManager.js:1566-1568`) `[code]`. POP
zablokowane przy rekrutacji (`lockPops(popCost, 'laborer')`, `ColonyManager.js:1444`) zostają
zablokowane na zawsze `[code]`; skutku nie mierzono wykonaniem.
⚠ Po G1 rozpad jest typowym sposobem utraty jednostki defensywnej (D5a: nie ucieka, rozpada się po
4 trafieniach przy bazowym morale) ⇒ wyciek częstszy niż przed G1.
**Zamknięcie:** `releaseGroundUnitPops` (`ColonyManager.js:1699` na `c7c5a74`) wołane w gałęzi rozpadu
(`CombatSystem.js:262`) PRZED emisją i usunięciem — pełny koszt na kolonii macierzystej z terminem
właściciela, dokładnie raz; brak kolonii właściciela ⇒ `groundUnit:popsLost` + wpis. Skutek zmierzony
wykonaniem dopiero w G1b: przed naprawą blokada garnizonu stała (keeper T-D na drzewie S1) `[measured]`;
synchroniczność w okablowaniu gry — §5c.1 (a) `[measured]`. Bramka: −1,2 dokładnie raz `[measured: bramka]`.
⚠ Ścieżka utrzymania (`ColonyManager.js:1566-1568`) nadal bez terminu właściciela — Finding **329**.

### 🟠 311 — `SupplyCoverageSystem` zapisuje jednostce legacy gracza `supply = 0` przez `?? 0`

Faza 4 (`SupplyCoverageSystem.js:162`) liczy `Math.max(0, (u.supply ?? 0) - spent)` i **zapisuje**
wynik jednostce, która pola `supply` nie miała; Faza 5 (`:173`) traktuje brak pola jak głód.
`computeDamageMult` zwraca dla jednostki bez pola 1,0 (`GroundUnitFactory.js:250`), a dla `supply <= 0`
— zero (`:252`) ⇒ legacy jednostka gracza poza zasięgiem uzupełniania przestaje zadawać obrażenia
i traci HP 5%/civY `[code]`. Sonda G1: `supply = 0` w 1. ticku; legacy vs legacy z zaopatrzeniem — AI
100% w rundzie 6 `[measured]`. Ta sama klasa co Finding 65 (default dla brakującego pola), inne pole.
Osiągalność w grze (łazik `VesselManager.js:1360`, stare zapisy) — niezmierzona. Dotyczy wyłącznie
jednostek GRACZA (system pomija jednostki AI).

### ✅ 312 — `groundUnit:disbanded` nie ma ani jednego subskrybenta; Dziennik milczy — ZAMKNIĘTY 2026-10-02 (`03688f0`, G1b/S3)

Emitenci: `ColonyManager.js:1570` (brak utrzymania) i `CombatSystem.js:246` (`morale_collapse`);
subskrypcji `EventBus.on('groundUnit:disbanded', …)` w `src/` — **zero** `[code]`. Klucze
`event.groundUnit.disbanded` (pl/en) istnieją i nie mają czytelnika `[code]`. Rozpad jednostki nie
zostawia śladu w Dzienniku. Tabela zdarzeń w `CLAUDE.md` twierdziła „UIManager, EventLog” — poprawiona.
**Zamknięcie:** subskrypcja `NotificationCenter.js:67` → `_handleGroundUnitDisbanded` (`:514`): wpis tylko
w Dzienniku, tylko jednostki gracza, powód z `DISBAND_JOURNAL_KEYS` (`:20`); NEW klucz
`event.groundUnit.disbandedMorale` PL+EN; subskrybent nie zwalnia POP (keeper T-G3). Render PL/EN zmierzony
(§5c.2). Bramka G1b: wpis rozpadu obecny; wpis utrzymania niepotwierdzony przez właściciela.

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
**Konsekwencja zmierzona (faza A G2; pin `g2_seams_smoke` P2, `4d6ac63`):** jednostka utworzona z samym
`{ owner: <imperium> }` na kolonii z 0 Kr przechodzi w `offline` w 1. civY, przestaje być obrońcą
(`hasLivingDefender` = false) i znika w 5. civY; z `factionId` imperium zostaje aktywna `[measured]`. Forma
5-argumentowa daje `owner: 'player'` (pin P1d) `[measured]`. Przy 1000 Kr kolonia AI traci na taką jednostkę
12,14 Kr/civY wobec 2,14 Kr/civY z `factionId` imperium — stawka 5 pobrana dwa razy; to istniejący wpis backlogu
`KOSMOS_backlog_niezrealizowane.md` §„🔴 Podwójne pobranie Kr za jednostki naziemne”, bez nowego numeru
`[measured]`. **Dla nowych wywołań zamyka to `createAIUnit` (G2-1, `82c9196`)**; `InvasionSystem.js:130` dalej
tworzy jednostki z samym `{ owner }` (→ G2b).

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

### ✅ 326 — reintegracja POP po śmierci trafia do kolonii CIAŁA śmierci, nie do kolonii macierzystej — ZAMKNIĘTY 2026-10-02 (`c7c5a74`, G1b/S4)

Numer nadany przy podpisie zakresu G1b (2026-10-02). Handler `groundUnit:destroyed` kolejkował zwrot na
`getColony(planetId)` — kolonii ciała, na którym jednostka zginęła `[code: 82c7722]`. Śmierć jednostki gracza
na ciele AI zdejmowała blokady KOLONII AI (5 → 4,7), a dom gracza nie odzyskiwał nic (keeper T-F1 na drzewie
S3) `[measured]`.
**Zamknięcie:** cel = `_ownedHomeColony(unit)` (`ColonyManager.js:1642`), jednostka z rejestru (`:1639`); wpis
kolejki niesie właściciela, wypłata sprawdza go ponownie (`:1605`) ⇒ kolonia przejęta w czasie zwłoki —
wypłata przepada z meldunkiem `groundUnit:popsLost`. Tabela reintegracji bez zmian. Bramka G1b: kolejka domu
[0,3], kolejka AI [] `[measured: bramka]`.

### ⚪ 327 — śmierć na minie gubi POP-y (latentny: jedyny producent min jest martwy)

Emisja `groundUnit:destroyed` przy minie (`GroundUnitManager.js:965-967`) niesie `{ unitId, planetId, owner,
killedBy }` — bez `popCost` i `archetypeId` — więc handler reintegracji odpada na bramce
(`ColonyManager.js:1627`) ⇒ POP zablokowane przy rekrutacji zostają zablokowane na zawsze, bez meldunku
`[code]`. **Latentny:** jedynym producentem min jest `lay_minefield.execute` (`groundAbilities.js:94-100`),
a `.execute` żadnej zdolności naziemnej nie ma wołających w `src/` (wszystkie `.execute(` to akcje floty
i `UtilityAI`); `GameState.minefields` startuje pusty (`GameState.js:41`) `[code]`. Uzbraja się z chwilą
ożywienia zdolności naziemnych.

### 🟠 328 — kolejka reintegracji `_pendingPopReturns` nie trafia do zapisu

Kolejka żyje na obiekcie kolonii (`ColonyManager.js:1650-1651`), a `serialize` buduje białą listę pól kolonii
bez niej (`:2526-2550`; `_pendingPopReturns` i `_pendingPopClock` poza `:1586-1651` nie występują) `[code]`.
Blokady POP są w zapisie (`CivilizationSystem.js:908`, `:961-962`) ⇒ zapis i wczytanie w oknie zwłoki
(1,0–2,0 civY = 1–2 wyświetlane miesiące) kasuje należny zwrot, a blokada zostaje na zawsze — ta sama szkoda
co **333**, inną drogą `[code]`; skutku nie mierzono wykonaniem. Komentarz `ColonyManager.js:1586-1590`
stwierdza „runtime-only”, ale tego nie uzasadnia.
**→ G1c** (§5d (b)).

### 🟠 329 — utrzymanie jednostek naziemnych: płatnik i zwrot POP bez terminu właściciela (siostra 97)

`_tickGroundUnitUpkeep`: płatnik Kr = `getColony(u.homeColonyId ?? u.planetId)` (`ColonyManager.js:1529`,
`:1539`) — bez sprawdzenia, czyja jest ta kolonia; przy rozwiązaniu zwrot POP idzie na
`home ?? getColony(u.planetId)` (`:1567`) — także bez terminu właściciela `[code]`. Po przejęciu kolonii
macierzystej (`transferColony` zostawia ją w `_colonies` z właścicielem AI) utrzymanie jednostek gracza płaci
kolonia WROGA, a rozwiązanie z braku Kr oddaje jej POP-y; bez domu POP-y trafiają do kolonii ciała, na którym
jednostka stoi `[code]`. To ta sama reguła, którą S2/S4 zamknęły dla rozpadu i śmierci (`_ownedHomeColony`,
`:1680`) — ścieżka utrzymania jej nie używa. Siostra Findingu **97** (flota, zamknięty w OG-3b). Skutku nie
mierzono wykonaniem.
**→ G1c** (§5d (b)).

### 🟠 330 — ręczne rozwiązanie jednostki idzie przez tabelę ŚMIERCI; przycisk to polski literał

`UnitCardPanel.js:203` — przycisk `'💔 Rozwiąż'` (literał, klasa **113**) emituje `groundUnit:destroyed`
z `cause: 'disband_manual'` i `popCost` (`:214-219`) ⇒ handler reintegracji (`ColonyManager.js:1625`) traktuje
świadome rozwiązanie jak śmierć w walce: `shock_infantry` (0,6 × rate 0,5) odzyskuje 0,3 po 2,0 civY, a reszta
zostaje zablokowana na zawsze (**333**) `[code]`. Dwie pozostałe drogi rozwiązania — utrzymanie (`:1566-1568`)
i rozpad (`CombatSystem.js:262`) — oddają pełny koszt od razu. Na tej samej karcie literałami są też
`window.prompt('Nowa nazwa jednostki:', …)` (`UnitCardPanel.js:194`) i nagłówki sekcji (`:101`, `:115`,
`:130`, `:152`, `:170`, `:176`) `[code]`.
**→ G1c.** Kierunek podpisany 2026-10-02 (§5d (a)): ręczne rozwiązanie zwraca **pełny koszt**, jak utrzymanie
i rozpad; niezaimplementowany. Literały karty — poza G1c (klasa **113**).

### ⚪ 331 — walka naziemna AI-vs-AI: zero ognia, a gracz dostaje wpis „bitwy” i raport

`_runBattleRound` łączy wszystkich nie-graczy w jedną stronę (`CombatSystem.js:188-194`) — przy heksie z dwoma
imperiami AI i bez gracza `playerSide` jest pusty, a `_resolveFire` wraca bez strzału przy pustej stronie
(`:295`) ⇒ nikt nie strzela, heks zostaje sporny bez końca `[code]`. Mimo to `combat:round` leci (`:286`),
a `GameScene.js:5473-5485` loguje graczowi „bitwę naziemną” w rundzie 1, bez sprawdzenia udziału gracza; gdy
jednostki się rozejdą, `combat:hexResolved` daje wpis wygranej / przegranej / remisu i globalny modal raportu
(`:5487-5510`) `[code]`. Zastępuje wiersz „niezweryfikowane” z indeksu (`OPEN_FINDINGS_INDEX.md` A9):
mechanizm potwierdzony w kodzie; **osiągalność niezmierzona** (wojny lądowe AI↔AI = **D5**, poza 1.0).

### ✅ 332 — tabela zdarzeń w `CLAUDE.md` wymienia konsumentów, których nie ma — ZAMKNIĘTY w commicie dokumentacji G1b

Wiersze `groundUnit:*` przypisywały `ColonyOverlay`, `UIManager`/`EventLog`, `GameState`, `FogSystem`
i `BattleSystem` zdarzeniom, których **nikt nie subskrybuje** (`minefieldLaid`, `mineTrigger`, `fogRevealed`,
`healed`, `expired`, `stealthRevealed`, `stealthHidden`, `supplyChanged`, `orgChanged`, `moraleChanged`,
`starved`, `resumed`), a `orbitalStrike` konsumuje `GroundUnitManager.js:51`, nie `BattleSystem` `[code]`.
Mapa zbudowana szerokim grepem: 37 zdarzeń, 98 trafień; poza `EventBus.on` z dosłowną nazwą subskrybuje
pośrednio wyłącznie `DebugLog` (`TRACKED_EVENTS`, `:63-64`); `FogSystem` nie istnieje `[measured]`. Wiersze
poprawione do stanu z grepa w tym samym commicie dokumentacji; dopisane `groundUnit:destroyed`
i `groundUnit:popsLost`. Otwarcie i zamknięcie w jednym commicie dokumentacji — **przyjęte** (§5d (d)).

### 🟠 333 — nieoddana część POP po śmierci jednostki zostaje zablokowana NA ZAWSZE i liczy się do populacji (rekoncyliacja A0)

Tabela reintegracji (`ColonyManager.js:1299-1307`) oddaje `popCost × rate` po zwłoce; dla `rate < 1`
(`shock_infantry`, `rocket_artillery`, `aa_platform` — 0,5; `medic_unit`, `ground_supply_unit` — 0,75) reszta
**nie jest ani zwalniana, ani usuwana** z populacji `[code]`. `lockPops` tylko dopisuje do `_lockedPerStrata`
(`CivilizationSystem.js:279-286`), `population` = `_strataCount + _unemployed` (`:652-654`) blokad nie widzi,
`freePops` je odejmuje (`:777-780`), zapis je niesie (`:908`, `:961-962`); blokada z założenia oznacza ludzi,
którzy „liczą się do populacji, jedzą, mieszkają” (`:343-344`) ⇒ fantom: ludzie, którzy według tabeli
zginęli, zostają w populacji i nigdy nie wracają do pracy `[code]`. Zmierzone (sonda A0, prawdziwy
`time:tick`): `shock_infantry` 0,6 — po 3 i po 27 miesiącach blokada **+0,3**, populacja w ticku śmierci
8 → 8, wywołań `removePop` / `_removeUnlockedPop` / `killCrew` **0**, `serialize()` niesie +0,3 `[measured]`.
Wzorzec poprawnej śmierci w repo: `killCrew` (`CivilizationSystem.js:461`, W2) usuwa ludzi akumulatorowo
i zdejmuje blokadę typowaną. Kumuluje się przy każdej śmierci; tą samą drogą idzie ręczne rozwiązanie (**330**).
**Nienaprawiony. → G1c.** Kierunek podpisany 2026-10-02 (§5d (a)): nieoddana część **naprawdę ginie** —
usuwana z populacji razem ze swoją blokadą; niezaimplementowany.

### ⚪ 334 — karta jednostki w `ColonyOverlay`: polskie literały i surowe id w tytule (klasa 113)

Tytuł: mapa `typeLabel` zna tylko typy legacy (`ColonyOverlay.js:2636-2640`, same polskie literały), a dla
archetypów spada do `unit.type.toUpperCase()` (`:2641`) ⇒ „SHOCK_INFANTRY”. Statusy (`:2660-2667`:
„⏸ Bezczynna”, „🚀 W ruchu”, …), przyciski „🔍 Skanuj obszar” (`:2858`) i „✕ Odznacz” (`:2880`) oraz flash
`` `Zaznaczono ${n} jednostek` `` (`:5449`; przy n = 1 także błąd fleksji) — literały poza `t()` `[code]`.
Na tym samym ekranie panel planety idzie przez `t()` (`en.js:840`, `:903`) ⇒ przy języku EN ekran miesza
języki — tak zaobserwowano na bramce G1b `[measured: bramka]`. `check-i18n` jest na to ślepy (pyta o klucze
w `t()`, nie o literały w `fillText`).
**→ etap polerki UI** (arc literałów; §5d (e)).

### 🟠 335 — rozbita jednostka AI schodzi na sąsiedni heks i wraca — w kółko (rodzina 313)

`_tryRetreat` przenosi jednostkę na pierwszy wolny sąsiedni heks i dodaje +10 morale (`CombatSystem.js:425-457`,
`:449`) — bez stanu „rozbita” i bez czasu odpoczynku `[code]`. W następnym takcie pościg AI
(`GroundUnitManager.js:997` i dalej) widzi jednostkę poza bitwą (`isUnitInCombat` → `false`) i prowadzi ją do
najbliższej jednostki gracza — z powrotem na ten sam heks; po kolejnych trafieniach morale znów ≤ 5 i cykl się
powtarza `[code]`. Bramka G1b, przebieg 2 S2: walka ponad rok, wróg wielokrotnie schodził i wracał, garnizon
w końcu się rozpadł `[measured: bramka]`. Udział regeneracji morale jednostek gracza w zaopatrzeniu
(`SupplyCoverageSystem.js:232-234`; `GameCore` tego systemu nie montuje) w długości pata — **niezmierzony**.
Rozszerza **313** (ten sam `_tryRetreat`). Istotne dla G2: materializowany garnizon będzie walczył
z jednostkami, które tak wracają.

### 🔴 336 — stolica kolonii AI może stać na kaflu oceanu — takiej kolonii nie da się przejąć z ziemi (→ G2-K1 / D17)

`EmpireColonyBootstrap._placeBuildingSmart` odrzuca kafle warunkiem `tile.buildable === false`
(`EmpireColonyBootstrap.js:723`), ale kafel siatki takiego pola nie ma: `buildable` żyje wyłącznie w danych terenu
(`TERRAIN_TYPES.ocean.buildable: false`, `HexTile.js:57`), a w `HexTile.js` nie ma ani jednego zapisu
`this.buildable` `[code]`. `colony_base` ma `terrainOnly: null` i `terrainAny: true` (`BuildingsData.js:44-45`),
więc punktacja kafli remisuje i wygrywa pierwszy przeskanowany kafel `[code]` — wszystkie stolice AI stoją na (-1,2)
`[measured]`. Na oceanie nie da się stanąć (`MOVE_COST.ocean = Infinity`, `GroundUnitManager.js:30`; zrzut
odmawia na oceanie, `ColonyOverlay.js:4643`) ⇒ `_tickOccupation` nigdy nie ruszy kafla stolicy, a
`holdsDecisiveGround` (`InvasionSystem.js:404`) żąda właśnie tego kafla ⇒ **kolonii nie da się przejąć**
`[code]`. Zmierzone na `82c9196`: 14 ziaren, 28 stolic AI, **6 na oceanie**, wszystkie na (-1,2); w fixture
GATE-S4 stolica emp_002 „Regulus c” (pop 158) stoi na oceanie `[measured]`. Pin `g2_seams_smoke` P4b.
Kierunek: **D17**.

### 🔴 337 — łazik badawczy (away team) przejmuje kolonię AI w czasie POKOJU (rozszerza 317; → G2-2)

`send_away_team` wymaga tylko orbity, statusu `idle` i modułu (`FleetActions.js:493-516`); lądowanie wybiera
kafel bez oceanu i bez budynku (`ColonyOverlay.js:4591-4607`), a `deployAwayTeam` tworzy `science_rover`
z właścicielem gracza (`VesselManager.js:1353-1360`) — bez dominacji, bez kapsuł i bez wojny `[code]`.
`_tickOccupation` nie filtruje roli, a `_tryPlayerCapture` nie pyta o wojnę `[code]`. Zmierzone na `82c9196`
(prawdziwe ticki, relacja `peace`): łazik przesunięty na kafel stolicy przejmuje kolonię AI w **8. civY**.
Kontrole: łazik obok stolicy — nic przez 14 civY; z żywym garnizonem — kafel stolicy przechodzi na gracza,
kolonia nie `[measured]`. Kierunek: **D13**.

### 🟠 338 — „Wyładuj” z ładowni ląduje wojsko bez kapsuł, dominacji i wojny (→ G2-2)

Dla statku na orbicie `_getVesselColony` zwraca kolonię ciała **dowolnego właściciela**
(`FleetManagerOverlay.js:3059`). Okno ładowni otwiera akcja `load_troops` (`:2786`) i przycisk 📦 (`:7739`),
a „Wyładuj” woła `unloadGroundUnit(vessel, unit, planetId, unit.q ?? 0, unit.r ?? 0)` (`CargoLoadModal.js:388`) —
bez sprawdzenia kapsuł, dominacji i wojny; jednostka staje na współrzędnych heksu, z którego ją załadowano
`[code]`. Niemierzone (DOM). Kierunek: **D13**.

### 🟠 339 — predykaty przejęcia nie pytają o wojnę, a żaden keeper przejęcia nie ustawia wojny (→ G2-2)

`launchInvasion` (`InvasionSystem.js:89`), `_tryPlayerCapture` (`:350`) i `_tickCaptureChecks` (`:427`) nie mają
terminu wojny `[code]`; pin `g2_seams_smoke` P5: przejęcie przez gracza, desant AI i przejęcie przez AI w stanie
**pokoju** `[measured]`. Sześć keeperów przejęcia i desantu (`ai_capture_army`, `ai_capture_outpost`,
`ai_capture_seams`, `ai_capture_ledger`, `invasion_player_capture`, `startup_units_zero`) ma **zero** wywołań
`declareWar` / `createWar` `[code: grep]` ⇒ warunek wojny z D13 przestawi je wszystkie. Kierunek: **D13**.

### ⚪ 340 — `INVASION_UNIT_POOLS` nie ma kluczy archetypów żywych imperiów (→ G2b)

Klucze puli to `xenophage`, `swarm`, `hegemon`, `trader`, `isolationist` (`GroundUnitData.js:97-103`), a grają
`industrialist` i `expansionist` (`EmpireGenerator.js:19`) `[code]` ⇒ `launchInvasion` bez jednostek w ładowni
zawsze spada na `['infantry', 'infantry']` (`InvasionSystem.js:112`) `[code]`. Kierunek: **D7**.

### ⚪ 341 — uprząż headless daje imperiom AI 2,2–3,1× mniej POP niż żywy fixture

Przy gy 60 uprząż (`bootWithDirector`, ziarna `HEADLESS_GALAXY_SEED` i 987654321) daje POP 65 / 71 i 60 / 81 (limit
z D1: 4 / 4 i 3 / 5), a fixture `GATE-S4-fresh-gy60` (gy 60,12) — POP 185 / 178 (limit 11 / 11) `[measured]`.
Ziarnistość ticka wykluczona: tick 0,25 civY daje 67 / 71 `[doc: raport G2-A]`. Przyczyna nieznana; fixture
powstał na kodzie `bee26cf` (metryczka fixture'u) `[doc]`. Kierunek: **D18** (kalibracja na fixture).

### ⚪ 342 — `homeColonyId: null` jednostki AI wraca z zapisu jako id ciała

`createAIUnit` zostawia `homeColonyId: null` na ciele bez kolonii imperium (decyzja właściciela 2026-10-02),
a `serialize` zapisuje `homeColonyId ?? planetId` (`GroundUnitManager.js:1459`; `restore` tak samo, `:1522`)
`[code]`. Zmierzone: jednostka AI utworzona na kolonii gracza — `null` w pamięci, `entity_5` (kolonia gracza)
w zapisie `[measured]`. Dziś nieszkodliwe: `_ownedHomeColony` sprawdza właściciela kolonii, a `popCost` jednostki
AI = 0 (`ColonyManager.js:1680`, `:1701`) `[code]`. Bez przypisanego kroku.

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
