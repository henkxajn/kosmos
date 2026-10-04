# AI GARRISON — obrona naziemna kolonii AI

> **Status:** ✅ **G1 i G1b ZAMKNIĘTE 2026-10-02 — obie bramki live właściciela PASS.** ✅ **G2-0, G2-1 i G2-K1 ZROBIONE
> 2026-10-02** (§5f, §5g). ✅ **G2-2 (bramka wojny, D13 + D13a) ZAMKNIĘTY 2026-10-03 — bramka live właściciela PASS**
> (§5i–§5k). ✅ **G2-3a (planer garnizonu, czyste funkcje) ZROBIONY 2026-10-03** (`053fcc0`, §5l) — z drabiną **D9 po
> rewizji** (§1). ✅ **G2-3b (mobilizacja, usuwanie jednostek AI, stempel kafli) ZAMKNIĘTY 2026-10-03 — bramka live
> właściciela PASS** (§5n–§5p). ✅ **G2-4 (po pokoju, R1–R7) ZAMKNIĘTY 2026-10-04 — bramka live właściciela: silnik PASS,
> trzy wady widoku** (§5q–§5s). Dalej: **follow-upy G2-4** (F1–F4 podpisane 2026-10-03, F5–F7 z bramki; §5s) → **G2b** →
> **G3** → **G1c** (§3).
> Decyzje **D1–D7** podpisane przez właściciela **2026-10-01** (D7: **2026-10-02**); zakres G1b (S1–S4) — **2026-10-02**;
> kierunek dla **333** i **330** — **2026-10-02** (§5d (a), niezaimplementowany); **D8–D18** — **2026-10-02** (§1; faza A G2 — §5e);
> odpowiedzi właściciela z sesji G2-K1 — **2026-10-02** (§5h); **D13a** i odpowiedzi z sesji G2-2 — **2026-10-03** (§1, §5k);
> **rewizja D9** i odpowiedzi (a)–(g) z sesji G2-3a — **2026-10-03** (§1, §5m); odpowiedzi z sesji G2-3b i **zakres G2-4
> (R1–R7)** — **2026-10-03** (§5p); odpowiedzi po G2-4 (notatka przekazania) — **2026-10-03**, wpisane **2026-10-04**,
> i zakres wad z bramki G2-4 — **2026-10-04** (§5s).
> Save **v101, zero migracji** w G1, w G1b, w G2-0/G2-1, w G2-K1, w G2-2, w G2-3a, w G2-3b i w G2-4.
> **Commity G1:** `85411d0` (D5a) · `f5e30e5` (D5b + świadome odwrócenie `w3_seams_smoke` T6) · `f868ae8` (D5c).
> **Commity G1b:** `c0a3d5c` (S1, #309) · `a42ec93` (S2, #310) · `03688f0` (S3, #312) · `c7c5a74` (S4, #326) — §5a.
> **Commity G2:** `4d6ac63` (G2-0, piny szwów) · `82c9196` (G2-1, `createAIUnit`) — §5f · `8ea5af3` + `44967a3`
> (G2-K1, stolice na oceanie + bliźniak AI) — §5g · `6391b23` (G2-2, keepery: wojna w setupie) + `48c94dd`
> (G2-2, bramka wojny D13) + `dbfbbd6` (D13a, „Wyładuj” nigdy na cudzym ciele) — §5i · `053fcc0` (G2-3a, planer
> garnizonu) — §5l · `6fc2c8d` (G2-3b C-S1, mobilizacja) + `24beea4` (C-S2, usuwanie jednostek AI) + `2437725`
> (C-S3, stempel kafli) — §5n · `edd6fd1` (G2-4 C1a, keepery: wojna w setupie) + `cd1fc46` (C1b, R1/R2) + `1a41c62`
> (C2, wycofanie po pokoju R3–R5) + `8c82cf7` (C3, R6) + `39c9227` (C4, R7) + `1fefcdc` (komentarz P6b) — §5q.
> Keepery `ground_morale_resolution_smoke` **35/35** · `ground_round_fairness_smoke` **12/12** ·
> `ground_unit_loss_smoke` **29/29** · `g2_seams_smoke` **31/31** · `g2_create_ai_unit_smoke` **26/26** ·
> `g2_ocean_capital_smoke` **28/28** · `g2_war_gate_smoke` **70/70** · `g2_planner_smoke` **77/77** ·
> `g2_mobilisation_smoke` **56/56** · `g2_after_peace_smoke` **73/73** · sweep **257/257 OK, 0 FAIL, 31 advisory** ·
> `check-i18n` PASS (pl = en = **3440**).
> **Rejestr macierzysty findingów #309–#367:** ten plik, §6. Korekty cudzych rejestrów (65 · 49 · 50): §7.
> ⚠ Znaczniki źródła: `[code]` — przeczytane w źródle (#309–#325 na `f868ae8`; #326–#335 oraz §5a–§5c na
> `c7c5a74`; #336–#342 oraz §5e–§5f na `82c9196`; #343–#347 oraz §5g–§5h na `44967a3`; #348–#357 oraz §5i–§5k na
> `dbfbbd6`; §5l–§5m na `053fcc0`; #358–#362 oraz §5n–§5p na `2437725`; #363–#367 oraz §5q–§5s na `1fefcdc`) ·
> `[measured]` — wykonane
> i policzone · `[git]` — historia
> commitów · `[doc]` — przepisane z dokumentu/raportu, bez ponownego pomiaru · `[doc: raport G2-A]` — z raportu
> fazy A G2 (2026-10-02, na `2a97bfe`), którego nie ma w repo · `[doc: bramka G2-2]` — z relacji właściciela
> z bramki live 2026-10-03, bez ponownego pomiaru · `[doc: raport G2-3b]` — z raportu sesji G2-3b (2026-10-03),
> którego nie ma w repo · `[doc: bramka G2-3b]` — z relacji właściciela z bramki live G2-3b (2026-10-03), bez
> ponownego pomiaru · `[doc: notatka G2-4]` — z notatki przekazania G2-4 (2026-10-03, `kosmos-handover/g2-4`, poza
> repo) · `[doc: bramka G2-4]` — z relacji właściciela z bramki live G2-4 (2026-10-04), bez ponownego pomiaru.

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
| **D9** (2026-10-02; **rewizja 2026-10-03**) | **Drabina zamiast „liczb do zaproponowania” z D2** — tabela pod decyzjami. Wejście: **suma poziomów fabryk imperium w chwili tworzenia jednostki**. `aa_platform` **nie wchodzi** do garnizonów (w walce naziemnej obojętna). Wszystkie liczby żyją w **jednej tabeli danych** (`src/data/GarrisonData.js`, od `053fcc0`). **Rewizja 2026-10-03** (odpowiedź właściciela (g), §5m): progi 10 / 25 / 35 / 45 zastąpione przez **6 / 14 / 20**, bo suma fabryk zatrzymuje się na 20 — stare szczeble 25 / 35 / 45 nie były w praktyce osiągane. Morale 30 zmierzone w G2-3a (M1, §5l). | Pomiar **M2** (§5l): suma poziomów fabryk przy gy 60 — fixture GATE-S4 **20 i 20**, uprząż **5, 6, 16, 20**; uprząż do gy 100 najwyżej **24** (płaskowyż 20) `[measured]`. Na `82c9196`: z `aa_platform` 100 %/11 mies. wobec 100 %/15 bez niej (garnizon 4, morale 50, 6 szturmowców) oraz 100 %/18 wobec 100 %/16 (garnizon 10, morale 10, 4 szturmowców); z `rocket_artillery` **28 %** i **0 %** w tych samych komórkach `[measured]`. |
| **D10** (2026-10-02) | **Wewnątrz ciała garnizon jest ROZSTAWIONY wokół kafla stolicy, jedna jednostka na heks** — nie w stosie. | Na `82c9196` (garnizon 4, morale 50, 6 szturmowców, 50 prób): rozstawienie **100 %** przejęć, mediana 15 mies.; stos na kaflu stolicy **0 %**, napastnik traci **6 z 6**, obrońca średnio **0,1** `[measured]`. Rozstawienie = spirala `_findGroundUnitSpawn` (`ColonyManager.js:1799`) `[code]`. |
| **D11** (2026-10-02) | **Między ciałami:** stolica dostaje `ceil(limit / 2)`; reszta **po jednej jednostce na ciało**, malejąco wg `colonyDevScore`, **pełne kolonie przed placówkami**, remisy wg kolejności w `empire.colonies`; **nadwyżka wraca do stolicy**; bez kandydatów **wszystko idzie do stolicy**. Filtr `Xe`/`Nt` z D6 zostaje, choć dziś niczego nie wyklucza. | Zamyka niejednoznaczności rozmieszczenia z fazy A (nieparzysty limit, remisy, więcej ciał niż jednostek, więcej jednostek niż ciał, brak kandydatów) `[doc: raport G2-A]`. `colonyDevScore` = populacja + liczba aktywnych budynków (`src/utils/ColonyDevScore.js:28-30`) `[code]`. Placówki AI z `Xe` **i** `Nt`: fixture 10/10, uprząż 14/14 przy gy 60 `[measured]`. |
| **D12** (2026-10-02) | **Stolica imperium AI = `DirectorProduction.capitalOf`** — pierwsza pełna kolonia z `resourceSystem` w kolejności `empire.colonies`. | `DirectorProduction.js:132-139` `[code]`; zamyka wybór z Findingu **322**. |
| **D13** (2026-10-02) | **Bramka wojny.** Każde lądowanie jednostki naziemnej GRACZA na ciele należącym do innego imperium — kapsuły desantowe, „Wyładuj” z ładowni, away team — wymaga **wojny z właścicielem ciała**, sprawdzanej **w chwili lądowania**. Ciała niczyje i własne są zwolnione; **rozejm i pakt o nieagresji blokują**. `launchInvasion` dostaje to samo sprawdzenie. **Oba predykaty przejęcia wymagają wojny.** Źródło prawdy: **status relacji `'war'`**; zaczep mobilizacji: **`diplomacy:warDeclared`**. **Ładowanie wojsk na statki jest zawsze dozwolone.** | Findingi **317**, **337**, **338**, **339**. Status relacji: `DiplomacySystem.getStatus` (`:204`); na nim bramkuje sam `declareWar` (`:355`) `[code]`. Rekord wojny może się z nim rozjechać: `createWar` przy tym samym id zwraca istniejący rekord, także nieaktywny, bez emisji (`WarSystem.js:178-180`) `[code]`. Wdrożone w G2-2 (`48c94dd`, §5i); dla „Wyładuj” zaostrzone przez **D13a**. |
| **D13a** (2026-10-03) | **Jedyną drogą wojsk naziemnych na ciało innego imperium są kapsuły desantowe.** „Wyładuj” z ładowni **nigdy** nie ląduje na cudzym ciele — ani w wojnie, ani w pokoju. „Wyładuj” na własnych ciałach — bez zmian. Away team zachowuje swoją ścieżkę (dozwoloną w wojnie). Gracz widzi „Wyładuj” wyszarzony z **powodem własnym** (nowy klucz PL i EN), innym niż powód wojny. | Kapsuły (`dropTroop`) wołają `unloadGroundUnit` wewnętrznie (`Vessel.js:781` na `dbfbbd6`), więc odmowa należy do **ścieżki ładowni**, nie do tej metody: `cargoUnloadRefusal` (`WarGate.js:88`) wołane w `CargoLoadModal` przy wyszarzeniu (`:388`) i w chwili kliknięcia (`:401`) `[code]`. Klucz `fleet.reason.unloadForeignBody`. Wdrożone w `dbfbbd6` (§5i). |
| **D14** (2026-10-02) | **Wycofanie po pokoju (projekt właściciela).** Przy podpisaniu pokoju jednostki gracza na ciałach drugiej strony dostają **flagę wycofania z terminem 6 wyświetlanych miesięcy**. Do terminu **nie ma ognia ani okupacji kafli** między byłymi wrogami na tym ciele. Jednostki, które zostaną po terminie, są **usuwane i traktowane jak polegli** (POP wg tabeli śmierci). **Wpis w Dzienniku przy pokoju i ostrzeżenie miesiąc przed terminem.** Jednostki AI na ciałach gracza są **usuwane od razu** przy podpisaniu pokoju. **Zakres wykonawczy G2-4 (R1–R7) podpisany 2026-10-03 — §5p.** | Dziś przy pokoju jednostki zostają: słuchacze `diplomacy:peaceSigned` (`UIManager.js:1669`, `AlienCivSystem.js:71`, `WarSystem.js:92`) ich nie ruszają, a `CombatSystem._findContestedHexes` grupuje jednostki wyłącznie po właścicielu, bez wojny (`CombatSystem.js:152-171`) `[code]`. |
| **D15** (2026-10-02) | **Mobilizacja raz na imperium**, przy jego **pierwszej wojnie** (flaga wewnątrz `empires.<id>`); potem tylko odrastanie strat (G3). **Zapis wczytany już w stanie wojny mobilizuje się na pierwszym ticku.** | Przy wczytaniu nie leci żadne zdarzenie wojny — emitują je wyłącznie `declareWar` i `createWar` `[code]`. `empires` jest zadeklarowanym kluczem `GameState` (`GameState.js:22`), a `restore` przywraca klucze najwyższego poziomu w całości (`:146-157`) ⇒ pole wewnątrz przeżywa zapis bez migracji `[code]`. |
| **D16** (2026-10-02) | **Zniszczenie ciała usuwa WSZYSTKIE jednostki naziemne na nim** (rozszerza D6). | D6 mówiło tylko o jednostkach poprzedniego właściciela; przy zniszczeniu osierocone zostają także jednostki trzeciej strony. Dziś `removeColony` nie rusza żadnej (Finding **319**; pin `g2_seams_smoke` P6c) `[measured]`. |
| **D17** (2026-10-02) | **Stolice na oceanie:** poprawić generowanie; w istniejących zapisach kolonia, której kafla stolicy nie da się zająć, jest przejmowana **regułą placówki** (dowolny własny kafel z budynkiem). | Finding **336**. |
| **D18** (2026-10-02) | **Kalibracja na żywej grze (fixture), nie na uprzęży.** | Finding **341**. |

**D9 — drabina po rewizji 2026-10-03** (wejście: suma poziomów fabryk imperium w chwili tworzenia jednostki; wszystkie
liczby w jednej tabeli danych `src/data/GarrisonData.js`):

| suma poziomów fabryk | morale przy tworzeniu | skład | limit jednostek (D1) |
|---|---|---|---|
| poniżej 6 | 30 | tylko `garrison_unit` | × 1 |
| 6–13 | 50 | tylko `garrison_unit` ¹ | × 1 |
| 14–19 | 100 | co trzecia jednostka **ciała** `rocket_artillery` ² | × 1 |
| 20 i więcej | 100 | jw. | × 1,25 ³ |

¹ Wiersz morale 50 = wyłącznie `garrison_unit` — potwierdzenie właściciela dla tego wiersza z 2026-10-02 (§5h (c));
rewizja wymienia dla progu 6–13 tylko morale.
² Liczone **na ciało** (odpowiedź (b), §5m): ciało z jedną jednostką nie dostaje samotnej artylerii.
³ **floor PO klamrze minimum 2** (odpowiedź (c), §5m). Przy ×1,25 kolejność „klamra, potem mnożnik” i odwrotna dają ten
sam wynik dla każdego POP (0 rozjazdów dla POP 0–100 000; przy ×1,5 byłyby 32) `[measured]`.
⚠ **Przed rewizją** (2026-10-02): poniżej 10 → 30 · 10–24 → 50 · 25–34 → 100 + artyleria · 35–44 → × 1,25 ·
45+ → × 1,5. `aa_platform` poza garnizonami — bez zmian.

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
| **G2-K1** | **stolice na oceanie (D17):** generowanie stawia stolicę AI na kaflu, na którym da się stanąć · stare zapisy — reguła placówki w predykacie przejęcia · bliźniak AI: marsz terytorialny omija stolicę, na której nie da się stanąć | **336** ✅ | ✅ **2026-10-02** (`8ea5af3` + `44967a3`, §5g) |
| **G2-2** | **bramka wojny (D13):** lądowanie gracza (kapsuły, „Wyładuj”, away team), `launchInvasion`, oba predykaty przejęcia · **D13a:** „Wyładuj” nigdy na cudzym ciele | **317** · **337** · **338** · **339** ✅ | ✅ **2026-10-03** (`6391b23` + `48c94dd` + `dbfbbd6`, §5i–§5k) |
| **G2-3a** | **planer garnizonu** — czyste funkcje nad jedną tabelą danych: limit (**D1** × **D9**), szczebel, skład, podział (**D11**), stolica (**D12**), heksy (**D10**); odczyt `KOSMOS.debug.garrisonPlan()`; niczego nie tworzy | **322** (stolica = `capitalOf`) | ✅ **2026-10-03** (`053fcc0`, §5l) |
| **G2-3b** | **mobilizacja (D15)** wg planera; usuwanie jednostek AI (**D6**, **D16**); stempel kafli (**318**) | **318** ✅ · **319** ✅ (jednostki AI; jednostki gracza → **358**) · **324** ✅ (zakres D6) · **320** (zostaje, niepotrzebny) | ✅ **2026-10-03** (`6fc2c8d` + `24beea4` + `2437725`, §5n–§5p) |
| **G2-4** | **wycofanie po pokoju (D14)** — zakres **R1–R7** podpisany 2026-10-03 (§5p): bez wojny brak ognia i okupacji · licznik okupacji stoi przy żywym wrogu · flaga wycofania 6 mies. · jednostki AI z ciał gracza usuwane przy pokoju · meldunki · zabranie wojsk z cudzego ciała i płatnik utrzymania · jednostka gracza na zniszczonym ciele | **348** ✅ · **353** ✅ · **354** ✅ (płatnik jednostki gracza) · **358** ✅ · **359** ✅ | ✅ **2026-10-04** (`edd6fd1` … `39c9227`, §5q–§5r) |
| **G2-4 po bramce** | **F1** pokój cofa okupację kafli (obie strony) · **F2** ostrzał z orbity na obce ciało tylko w wojnie · **F3** stare zapisy: flaga przy wczytaniu · **F4** wpisy w Dzienniku dla R4 i R7 · **F5** meldunek o utracie wojsk w terminie (Dziennik i dzwonek) · **F6** nazwa imperium we wpisach wycofania · **F7** „duch” jednostki na mapie kolonii | **363** · **364** · **366** · **367** (F5–F7 — wady z bramki, §5r) | do zrobienia — zakres §5s; **bramka w przeglądarce** |
| **G2b** | pule desantu (`INVASION_UNIT_POOLS`) na archetypy **przez `createAIUnit`** (D7) | **50** (zastąpiony) · **311** (zostaje dla jednostek legacy gracza) · **340** | do zrobienia |
| **G3** | odrastanie strat · widoczność (`'detailed'`) · **uzgadnianie mobilizacji co rok** (odpowiedź (d), §5p) | **360** | do zrobienia |
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

⚠ **Przydział findingów z sesji G2-K1 (#343–#347, §6):** **343** → osobny, późniejszy slice (zmienia rozmieszczenie
budynków AI; §5h (b)) · **344** → zarejestrowany, bez kroku (§5h (d)) · **345** → bez kroku (uśpiony) · **346** →
obserwacja, bez kroku · **347** → bez kroku (plik krytyczny `HexGrid.js` — naprawa wymaga planu). **344** i **347**
są istotne dla **G2-3b** (rozstawienie garnizonu wokół stolicy) i **G2b** (desant AI).

⚠ **Przydział findingów z sesji G2-2 (#348–#357, §6):** **350** · **351** → etap polerki UI (odpowiedzi (e) i (f),
§5k) · **348** → **G2-4** (D14: brak ognia i okupacji w oknie wycofania) · **353** → audyt **G2-4** — **blokuje D14**
(wycofanie po pokoju wymaga zabrania wojsk z cudzego ciała) · **354** → rodzina **329** (krok **G1c**) · **349** ·
**352** · **355** · **356** · **357** → bez przypisanego kroku.
⚠ **Korekta 2026-10-03 (zakres G2-4, §5p):** **354** wchodzi do **G2-4** w zakresie płatnika utrzymania jednostki gracza
(R6); reszta rodziny **329** zostaje w **G1c**.

⚠ **Przydział findingów z sesji G2-3b (#358–#362, §6):** **358** → **G2-4** (R3 i R7; odpowiedź (b), §5p) · **359** →
**G2-4** (R2; odpowiedź (c)) · **360** → **G3** (uzgadnianie co rok; odpowiedź (d)) · **361** · **362** → bez
przypisanego kroku. Rozszerzone bez nowego numeru: **345** i **355** (widoczny `GET 404` z bramki G2-3b).

⚠ **Przydział findingów z sesji G2-4 (#363–#367, §6):** **363** → F1 · **364** → F2 · **366** → F3 · **367** → F4
(decyzje właściciela, §5s) · **365** → bez decyzji. Wady widoku z bramki G2-4 (§5r) → F5, F6, F7 (§5s).

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

**Kontrakt `createAIUnit`** (`GroundUnitManager.js:200` na `82c9196`; od G2-K1 `:191`) `[code]`:
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

## 5g. G2-K1 — dostarczone (2026-10-02)

| commit | zawartość | keeper |
|---|---|---|
| `8ea5af3` | **C-S1 generowanie:** stolica AI (`building.isCapital`) pomija kafle, na których nie da się stanąć (`EmpireColonyBootstrap.js:732`) — obie ścieżki: kolonia macierzysta i ekspansja (`bootstrapColony`). **C-S2 stare zapisy:** `InvasionSystem.holdsDecisiveGround` — stolica nie do stania nie decyduje, działa reguła placówki (`:417`); stolicy nie przenosimy, bez migracji. **Jedno źródło „da się stanąć”:** tabela kosztu ruchu przeniesiona z `GroundUnitManager` do danych bez zmiany wartości — `GROUND_MOVE_COST` (`GroundUnitData.js:110`) + `isStandableTile` (`:131`); ruch czyta ją przez `MOVE_COST = GROUND_MOVE_COST` (`GroundUnitManager.js:22`) | NEW `g2_ocean_capital_smoke` 23/23; fail-first w czystym worktree 16 PASS / 7 FAIL (T0a–d, T1 — 6 stolic na oceanie, T2, T5c) `[doc: komunikat 8ea5af3]`; `g2_seams_smoke` P4b przebudowany (zgoda właściciela) na skonstruowanej stolicy na oceanie — 27/27 przed naprawą, 28/28 po `[doc: komunikat 8ea5af3]` |
| `44967a3` | **Bliźniak AI** (§5h (a)): `GroundUnitManager._findTerritorialGoal` (`:1147`) — stolica jest celem marszu tylko wtedy, gdy da się na niej stanąć; inaczej najbliższy kafel z budynkiem, jak dla placówki (lustro `holdsDecisiveGround`) | `g2_ocean_capital_smoke` + T6 → **28/28**; fail-first w czystym worktree na `8ea5af3`: **26 PASS / 2 FAIL** (T6a — brak celu marszu, T6b — przejęcia nigdy) `[measured]` |

**T6** (prawdziwe `launchInvasion`, marsz, okupacja i `_tickCaptureChecks`; wojna wypowiedziana jawnie): kolonia gracza
ze stolicą na oceanie (kolonia macierzysta emp_002 przejęta przez gracza), desant emp_001 — przed bliźniakiem cel
marszu = stolica, `no_path`, przejęcia **nigdy** (24 civY); po naprawie cel = kafel z budynkiem (1,2), przejęcie
w **9. civY**. Kontrola, stolica lądowa: marsz na stolicę i przejęcie w **11. civY** przed i po zmianie `[measured]`.

Sweep po G2-K1: **253/253 OK, 0 FAIL, 31 advisory** (lista advisory bez zmian); `check-i18n` PASS 3426 `[measured]`.

**Zostaje po G2-K1** (§6): martwy test `tile.buildable` dla zwykłych budynków AI (**343**); jedna z dwóch jednostek
desantu w T6 ląduje na krawędzi bez drogi do jakiegokolwiek celu (**344**); stolice AI na jednej współrzędnej (**346**).

---

## 5h. Odpowiedzi właściciela z sesji G2-K1 (2026-10-02)

| | pytanie | odpowiedź |
|---|---|---|
| (a) | bliźniak AI: `_findTerritorialGoal` maszeruje na stolicę, na której nie da się stanąć — AI nigdy nie przejmuje takiej kolonii | **część G2-K1** — osobny commit `44967a3` (§5g) |
| (b) | martwy test `tile.buildable` dla zwykłych budynków AI (46 z 476 na oceanie) | **osobny, późniejszy slice** — zmienia rozmieszczenie budynków AI (Finding **343**) |
| (c) | skład progu 10–24 drabiny D9 | **tylko `garrison_unit`** (przypis ¹ pod D9, §1) |
| (d) | desant AI, który kończy się na krawędzi bez drogi do stolicy | **zarejestrować** (Finding **344**) |

---

## 5i. G2-2 — dostarczone (2026-10-03)

| commit | zawartość | keeper |
|---|---|---|
| `6391b23` | **test** — siedem keeperów MECHANIKI przejęcia i desantu wypowiada wojnę w setupie (`declareWar(e.id, 'keeper_setup')`): `ai_capture_army` · `ai_capture_ledger` · `ai_capture_outpost` (+ nieaktualny nagłówek i etykieta T3 „`launchInvasion` niebramkowane” — tylko tekst) · `ai_capture_seams` · `g2_ocean_capital` (wojna PO świadkach — T2 pinuje pokój stanu wejściowego) · `invasion_player_capture` (prawdziwy `RelationsModel` ze statusem `'war'`; keeper bez `GameCore`) · `w3_ai_invasion` (te same trzy linie w `boot()`) | zielony SAM: worktree na `37c94ea` + diff = sweep **253/253, 0 FAIL**; `check-i18n` PASS `[measured]` |
| `48c94dd` | **fix — bramka wojny (D13):** NEW `src/utils/WarGate.js` — `warGateRefusal` / `areAtWar` / `bodyOwnerOf` / `NOT_AT_WAR`. Chwila lądowania: `Vessel.unloadGroundUnit` (`Vessel.js:741`) i powód w `dropTroop` (`:778`), `VesselManager.deployAwayTeam` (`VesselManager.js:1362`, zwrotka `{ok, reason, unitId}`), `InvasionSystem.launchInvasion` (`InvasionSystem.js:102`, odmowa melduje `invasion:blocked`). Przejęcie: `_tryPlayerCapture` (`:375`) i `_tickCaptureChecks` (`:490` — kampania nie gaśnie, tylko nie przejmuje). Dostępność akcji: `send_away_team` (`FleetActions.js:510`) i `drop_troops` (`:550`, PRZED dominacją). UI: `ColonyOverlay` — wejście w tryb zrzutu (`:320`), klik zrzutu kończy tryb Z POWODEM (`:4681`; dotąd nadpisywało go „zakończono”), klik away team (`:4609`); `CargoLoadModal` — wyszarzenie z powodem. i18n `fleet.reason.notAtWar` PL+EN | NEW `g2_war_gate_smoke` (W0–W10); `g2_seams_smoke` P5 **odwrócony świadomie** (do G2-2 pinował przejęcia i desant w pokoju; każde zdanie z kontrolą w wojnie) — 31/31; sweep **254/254**, `check-i18n` 3427 `[measured]` |
| `dbfbbd6` | **fix — D13a:** NEW `cargoUnloadRefusal` + `FOREIGN_BODY_UNLOAD` (`WarGate.js:77`, `:88`) — „Wyładuj” na ciele innego imperium odmawia zawsze, niezależnie od wojny; `CargoLoadModal` — wyszarzenie z powodem WŁASNYM (`:388`) i ponowna ocena w chwili kliknięcia (`:401`); `unloadGroundUnit` NIETKNIĘTY (wołają go kapsuły, `Vessel.js:781`) — tylko notka w komentarzu. i18n `fleet.reason.unloadForeignBody` PL+EN | `g2_war_gate_smoke`: W2b **odwrócony świadomie** (pre-approval właściciela), W9d **przepięty** (⚠ poza pre-approval — pytanie otwarte, §5k), NEW W11 (prawdziwe `showCargoLoadModal` na atrapie DOM z `env.js`) i W12 (i18n); fail-first **58 PASS / 12 FAIL** → **70/70**; sweep **254/254**, `check-i18n` 3428 `[measured]` |

**Kontrakt bramki** (`src/utils/WarGate.js` na `dbfbbd6`) `[code]`:
- `warGateRefusal(actor, planetId)` → `null` | `'not_at_war'`. Ciało niczyje (bez kolonii) i własne — zwolnione i **nie
  pytają dyplomacji**; obce — wolno wyłącznie przy statusie relacji `'war'` (rozejm i pakt o nieagresji blokują).
  Brak systemu dyplomacji albo rekordu relacji ⇒ „nie ma wojny” (fail-closed dla obcego ciała). Jedna funkcja dla
  obu stron: gracz pyta `'player'`, AI — id imperium; status pary jest symetryczny.
- `cargoUnloadRefusal(actor, planetId)` → `null` | `'foreign_body_unload'` (D13a). Ciało innego imperium — zawsze;
  własne i niczyje — wolno. Osobna reguła ŚCIEŻKI ŁADOWNI: nie wchodzi do `warGateRefusal`, bo `unloadGroundUnit`
  (który pyta bramkę wojny) wołają też kapsuły.

**W11 — prawdziwe okno ładowni pod node** `[measured]`: `CargoLoadModal` nie importuje THREE, więc wykonuje się na
atrapie DOM z `headless/env.js`. Przed D13a w wojnie nad kolonią AI „Wyładuj” był aktywny, w oknie nie było linii ⚠,
a klik wysadzał jednostkę na `entity_79`; po D13a — przycisk wyszarzony, powód D13a (nie powód wojny), klik zwykły
i wymuszony nie wysadzają jednostki; to samo w pokoju i rozejmie. Kontrole zielone po obu stronach: kapsuły w wojnie
lądują (W11e), „Wyładuj” na własnym ciele ląduje (W11f), sama METODA `unloadGroundUnit` w wojnie ląduje (W11g — treść
dawnego W2b, z prawdziwą etykietą).

---

## 5j. Bramka live G2-2 — 2026-10-03, właściciel: **PASS**

Gra po angielsku; wróg testowy `emp_test_enemy` na HD-4177 b-I (`entity_12`); statek `v_30` z ładownią wojsk,
kapsułami desantowymi i away team `[doc: bramka G2-2]`.

| scena | co zrobiono | wynik |
|---|---|---|
| **pokój** | desant i away team wyszarzone; na ciele 0 jednostek gracza | **PASS** |
| **chwila lądowania** | tryb zrzutu otwarty w WOJNIE, status przestawiony na pokój, klik kafla: komunikat, że potrzebna jest wojna; jednostka została w ładowni | **PASS** |
| **wojna** | kapsuły wysadziły dwie jednostki; away team wylądował | **PASS** |
| **rozejm** | wszystko wyszarzone poza ładowaniem wojsk i zbieraniem away team; w oknie ładowni czerwona linia „Landing requires war with the owner of this body” i „Wyładuj” wyszarzony | **PASS** |
| **przejęcie** | łazik badawczy trzymał kafel stolicy niebronionej kolonii przez cały rozejm; przy `gameTime` 65,70 kolonia nadal należała do `emp_test_enemy` | **PASS dla 337 i 339** |
| **strona AI** | `launchInvasion` w pokoju zwrócił `{ success:false, reason:'not_at_war' }`; w wojnie wylądowały 2 | **PASS** |
| **konsola** | bez błędów | — |

⚠ **Niepotwierdzone w przeglądarce:** przejęcie po przywróceniu wojny (kontrola „w wojnie przejmuje” stoi na keeperach:
`g2_war_gate_smoke` W5, `g2_seams_smoke` P5a/P5c) — dopóki właściciel nie powie inaczej. **Wariant NAP nieuruchamiany**
(pokrycie: `g2_war_gate_smoke` W0h, W3).
⚠ **Bramka poprzedza D13a:** czerwona linia w oknie ładowni w rozejmie była jeszcze powodem WOJNY. Od `dbfbbd6` okno
ładowni nad cudzym ciałem pokazuje powód D13a (`fleet.reason.unloadForeignBody`) w KAŻDYM stanie relacji — tego
wariantu przeglądarka nie widziała (pokrycie: `g2_war_gate_smoke` W2b, W11).
**Obserwacje z bramki → rejestr §6:** **353** (zabranie wojsk z cudzego ciała) · **354** (rozwiązanie „no upkeep”) ·
**355** (opóźnienie mapy w trybie zrzutu) · **356** („undefined” w oknie ładowni) · **357** („Player Empire” na ciele
wroga).

---

## 5k. Odpowiedzi właściciela z sesji G2-2 (2026-10-03)

| | pytanie | odpowiedź |
|---|---|---|
| (a) | `w3_ai_invasion_smoke` padał po bramce wojny (jedyny FAIL sweepu) | te same trzy linie wojny w `boot()` co pozostałe keepery przejęć — `6391b23` |
| (b) | jeden czy dwa commity G2-2 | **dwa, każdy zielony** — `6391b23` (keepery) + `48c94dd` (bramka) |
| (c) | nieaktualny nagłówek i etykieta T3 w `ai_capture_outpost_smoke` | poprawione, **tylko tekst** — `6391b23` |
| (d) | `WarGate` fail-closed przy braku systemu dyplomacji | **potwierdzone** |
| (e) | ciche odmowy away team | zarejestrowane na **etap polerki UI**, bez naprawy teraz — **351** |
| (f) | surowe slugi pozostałych odmów zrzutu | zarejestrowane na **etap polerki UI**, bez naprawy teraz — **350** |
| D13a | poprawka 2026-10-03 | jedyną drogą wojsk na cudze ciało są kapsuły; „Wyładuj” nigdy na cudzym ciele — `dbfbbd6` (§1). **Pre-approval:** asercja W2 „„Wyładuj” działa w wojnie” zastąpiona |
| ~~otwarte~~ | `g2_war_gate_smoke` **W9d** (pin źródłowy `CargoLoadModal`) wymagał w oknie ładowni bramki wojny i powodu wojny — D13a każe pokazać przy „Wyładuj” powód WŁASNY, więc pin został **przepięty** na bramkę ładowni i jej powód (fail-first: pada na kodzie sprzed D13a). Przepięcie **wyszło poza pre-approval** (obejmował tylko W2) | ✅ **rozstrzygnięte 2026-10-03: przepięcie W9d ZOSTAJE** (odpowiedź (a), §5m) |

---

## 5l. G2-3a — dostarczone (2026-10-03)

| commit | zawartość | keeper |
|---|---|---|
| `053fcc0` | NEW `src/data/GarrisonData.js` — **jedyne miejsce liczb**: D1 (16 POP na jednostkę, minimum 2), drabina **D9 po rewizji**, archetypy (D7), połowa limitu do stolicy (D11), złoża `Xe`/`Nt` (D6), promień spirali 5 (D10). NEW `src/utils/GarrisonPlanner.js` — czyste funkcje `garrisonBaseLimit` · `garrisonTier` · `garrisonLimit` · `garrisonComposition` · `garrisonAllocation` · `garrisonAnchor` · `garrisonHexes` · `planEmpireGarrison` oraz czytnik żywego świata `readEmpireGarrisonSnapshot` (termin właściciela na liście `empire.colonies` — rodzina 283; stolica = `capitalOf`, D12) · `readGarrisonBodyContext` · `planAllEmpires` · `printGarrisonPlans`. Planer **niczego nie tworzy**, nie emituje i nie sięga po `window` (usługi dostaje argumentem). `GameScene`: `KOSMOS.debug.garrisonPlan()` — tylko odczyt | NEW `g2_planner_smoke` **77/77** (P0–P8) |

- **Fail-first zmienionych pinów** (nowy keeper na planerze sprzed rewizji D9 i odpowiedzi (d), worktree poza repo):
  **59 PASS / 18 FAIL** — padają dokładnie piny zmienione: P0b, P1b, P1c, P2 (pięć granic), P3 (szczeble 14 i 20),
  P5c, P6 (przydział ×2, skład ×2, złote heksy ×2, kotwica emp_002). Kontrole — tripwire liczb P0e z kontrolą,
  zapas zdegenerowany P5c, stolica lądowa P5c i P6 — zielone po obu stronach `[measured]`.
- **Bateria 13 mutantów** (worktree): **12 zabitych**. Ocalały — „mnożnik przed klamrą minimum” — jest **równoważny**
  przy jedynym mnożniku drabiny ×1,25: 0 rozjazdów dla POP 0–100 000 (przy ×1,5 byłyby 32), więc kolejność klamry nie
  jest obserwowalna; widoczny jest kierunek zaokrąglenia (floor(13,75) = 13, floor(2,5) = 2) i ten pinują P1b/P1c `[measured]`.
- Sweep **255/255 OK, 0 FAIL, 31 advisory**; `check-i18n` PASS 3428 `[measured]`.

**Plan fixture'u GATE-S4 (gy 60) po rewizji D9** — wyprowadzony ręcznie z D1/D9/D11 i danych zapisu (keeper P6),
zgodny z wyjściem planera; heksy stolic sprawdzone osobną sondą bez kodu planera `[measured]`:

| | emp_001 — stolica `entity_115` „Propus b” | emp_002 — stolica `entity_232` „Regulus c” |
|---|---|---|
| POP · suma fabryk | 185 · 20 | 178 · 20 |
| szczebel · morale | „20 i więcej” · **100** (było: 10–24 · 50) | jw. |
| limit | **13** = floor(11 × 1,25) (było 11) | **13** (było 11) |
| stolica | **7** = 5× `garrison_unit` + 2× `rocket_artillery` (G G A G G A G) (było 6× G) | jw. |
| pozostałe ciała, po 1× `garrison_unit` | 117, 118, 119, 116, 208, **200** (nowe) | 231, 234, 236, 233, 235, **313** (nowe) |
| pominięte | 403, 401, 490 | 312, 571, 566, 657 |
| heksy stolicy | (−1,2) (−1,3) (0,2) (0,1) (−2,4) (−1,4) **(0,3)** | kotwica **(3,2)** habitat, 4 heksy od stolicy na oceanie (−1,2) — odpowiedź (d): (3,2) (2,3) (3,3) (4,2) (4,1) (3,1) (1,4) (było: wokół stolicy na oceanie) |

Każde ciało dostaje tyle heksów, ile jednostek (`missing` 0). Razem na imperium **13 jednostek = 11× `garrison_unit` +
2× `rocket_artillery`**. ⚠ Trzy pierwsze kafle z budynkiem w siatce `entity_232` (launch_pad, shipyard, research_station)
stoją na oceanie (Finding **343**), dlatego kotwicą jest dopiero habitat (3,2).

**M1 — morale 30** (szczebel „poniżej 6”), 100 prób na komórkę `[measured]`. Sonda poza repo: prawdziwe
`GroundUnitManager` + `CombatSystem` + predykaty `InvasionSystem.holdsDecisiveGround` / `hasLivingDefender`, siatka
prawdziwej stolicy AI (`bootWithDirector`, ziarno domyślne: `entity_79`, stolica (6,2) na równinie), okno 60 civY, krok
0,25 civY; garnizon przez `createAIUnit` (`deployed`, morale 30) na heksach planera (D10); gracz ląduje na pierwszym wolnym
heksie spirali obok stolicy, idzie stosem na stolicę, potem dobija obrońców po kolei; PRNG z `headless/env.js`; bez
zaopatrzenia i utrzymania (jak faza A). Technologia +90 = morale i organizacja +90, zapas +60 (pełne drzewo gracza).
% przejęć / mediana w miesiącach:

| garnizon · technologia gracza | 2 szturmowców | 4 | 6 |
|---|---|---|---|
| 2 · +0 | 75 / 17 | 100 / 12 | 100 / 10 |
| 4 · +0 | 0 | 100 / 18 | 100 / 14 |
| 10 · +0 | 0 | 0 | 100 / 33 |
| 2 · +90 | 100 / 10 | 100 / 8 | 100 / 8 |
| 4 · +90 | 94 / 15 | 100 / 10 | 100 / 10 |
| 10 · +90 | 0 | 100 / 26 | 100 / 22 |

Kalibracja tej samej sondy na macierzy fazy A (§5e; morale 10 / 50 / 100, technologia +0, 100 prób; faza A miała 50 prób
`[doc: raport G2-A]`): z 27 komórek **26 w tych samych skrajnościach** (0 % albo 100 %), jedna pośrednia (garnizon 4,
morale 50, 4 szturmowców): 27 % wobec 20 %; mediany późniejsze o 0–6 miesięcy `[measured]`. Odczyt: morale 30 leży między
wierszami 10 i 50 — garnizon 2 przeciw 2 szturmowcom: 100 % (morale 10) → **75 %** (30) → 0 % (50); garnizon 10 przeciw 4:
100 % → **0 %** → 0 %.

**M2 — suma poziomów fabryk imperiów AI w uprzęży** (`bootWithDirector`, dwa imperia AI, pasywny gracz; czytnik planera;
sumy powtórzone 2026-10-03 bit w bit z przebiegiem z sesji G2-3a) `[measured]`:

| ziarno · imperium | gy 0 | 20 | 40 | 60 | 80 | 100 |
|---|---|---|---|---|---|---|
| `HEADLESS_GALAXY_SEED` · emp_001 | 1 | 3 | 3 | 6 | 14 | 20 |
| `HEADLESS_GALAXY_SEED` · emp_002 | 1 | 6 | 7 | 16 | 20 | 20 |
| 987654321 · emp_001 | 1 | 5 | 5 | 5 | 14 | **24** |
| 987654321 · emp_002 | 1 | 6 | 10 | 20 | 20 | 20 |

Szczeble po rewizji przy gy 60: 1 i 2 (ziarno domyślne), 0 i 3 (987654321); fixture — 3 i 3.

---

## 5m. Odpowiedzi właściciela z sesji G2-3a (2026-10-03)

| | pytanie | odpowiedź |
|---|---|---|
| (a) | przepięcie pinu `g2_war_gate_smoke` W9d poza pre-approval D13a | **zostaje** (§5k) |
| (b) | „co trzecia jednostka `rocket_artillery`” — na ciało czy na imperium | **na ciało** |
| (c) | zaokrąglenie limitu przy mnożniku drabiny | **floor PO klamrze minimum 2** |
| (d) | kolonia, której kafla stolicy nie da się zająć (stary zapis, D17) — gdzie kotwica garnizonu | **na kaflu z budynkiem, regułą placówki — nie na stolicy**; wdrożone w `053fcc0` (`garrisonAnchor`) |
| (e) | „ma złoże `Xe`/`Nt`” | **`remaining > 0`** |
| (f) | jednostki, dla których nie ma wolnego heksu, na którym da się stanąć | **nie powstają i zostają w rezerwie; bez stosu** — planer liczy `missing`, tworzenie (G2-3b) to respektuje |
| (g) | drabina D9 — szczeble 25 / 35 / 45 nieosiągane (M2) | **rekalibracja**: progi 6 / 14 / 20 (§1) |

---

## 5n. G2-3b — dostarczone (2026-10-03)

| commit | zawartość | keeper |
|---|---|---|
| `6fc2c8d` | **C-S1 — mobilizacja (D15).** NEW `src/systems/GarrisonSystem.js` — wykonuje plan G2-3a **wyłącznie** przez `createAIUnit`; zaczep `diplomacy:warDeclared` (`:51-53`); raz na imperium — flaga `empires.<id>.garrison` przez `EmpireRegistry.isGarrisonMobilized` (`:45`) i intencję `markGarrisonMobilized` (`:189`); zapis wczytany już w wojnie mobilizuje się na pierwszym ticku (`_firstTick` → `reconcile`, `:209-232`); imperium bez pełnej kolonii nie dostaje nic i flagi nie ma (`:128-133`); jednostka bez wolnego heksu nie powstaje i liczy się do rezerwy (`:145`). Konstrukcja i lokator: `GameScene.js:331`, `:463`; `GameCore.js:207`, `:250`. `DebugLog.TRACKED_EVENTS`: `garrison:mobilized`, `garrison:mobilizeSkipped`. Cztery keepery przejęć wyłączają mobilizację w setupie (`enabled = false`; asercje bez zmian): `ai_capture_army`, `g2_ocean_capital`, `g2_seams` (P5a), `g2_war_gate` (W5) | NEW `g2_mobilisation_smoke` M0–M6, M10 **40/40**; fail-first na `a50f5dd` **12 PASS / 28 FAIL** (zielone = świadkowie i kontrole) `[doc: raport G2-3b]` |
| `24beea4` | **C-S2 — usuwanie jednostek AI (D6/D16, Finding 319).** `removeOnOwnerChange` (`:178`) na `colony:capturedByPlayer` i `colony:captured` — jednostki POPRZEDNIEGO właściciela-AI na tym ciele; `removeOnBodyDestroyed` (`:188`) na `colony:destroyed` — jednostki WSZYSTKICH imperiów AI; jednostki gracza zostają (→ **358**). `DebugLog.TRACKED_EVENTS`: `garrison:unitsRemoved` | + M7/M8 **50/50**; fail-first na stanie C-S1 **44/6**; `g2_seams_smoke` P6a i P6c odwrócone świadomie (zgoda właściciela), P6b bez zmian — **31/31** (fail-first 29/2) `[doc: raport G2-3b]` |
| `2437725` | **C-S3 — stempel kafli (Finding 318).** NEW `src/utils/TileOwnership.js` — `stampUnownedTiles` (tylko kafle bez właściciela; kafel zajęty okupacją zostaje). `EmpireColonyBootstrap.js:179` (dom), `:389` (ekspansja), `:507` (placówka); `GarrisonSystem.reconcile` stempluje kolonie AI na pierwszym ticku, PRZED mobilizacją (`:223`, `:238-245`) | + M9 **56/56**; fail-first na stanie C-S2 **52/4** (M9d = kontrola); `g2_seams_smoke` P3a i P3b odwrócone świadomie — **31/31** (fail-first 29/2) `[doc: raport G2-3b]` |

**Weryfikacja przy commitowaniu (sesja zamykająca, 2026-10-03)** `[measured]`: indeks i drzewo zgodne co do bloba z łatkami
z sesji G2-3b; każdy stan (C-S1, C-S2, C-S3) zbudowany z łatek jako osobny worktree — sweep **256/256 OK, 0 FAIL,
31 advisory**, lista advisory identyczna w trzech stanach, `check-i18n` PASS 3428; po commitach drzewo główne — to samo.
Żaden commit nie przewraca całego pliku (numstat).

**Kontrakt `GarrisonSystem`** (`2437725`) `[code]`:
- `mobilizeEmpire(empireId, reason)` → `{ ok: true, empireId, unitIds, reserve, plan }` albo `{ ok: false, reason }`:
  `disabled` · `unknown_empire` (także `'player'`) · `no_ground_unit_manager` · `already_mobilized` i `no_capital` (obie
  emitują `garrison:mobilizeSkipped`; `no_capital` NIE ustawia flagi).
- Rekord flagi: `{ mobilized, year, reason, tier, morale, limit, created, reserve, refused }`; `garrison:mobilized` niesie
  go razem z `perBody`.
- `reconcile(trigger)` biegnie raz — `_firstTick` odpina się po pierwszym wywołaniu; najpierw stempel kafli AI, potem
  mobilizacja każdego imperium w wojnie bez flagi.
- Odczyt w konsoli: `KOSMOS.garrisonSystem.listUnits('emp_…')`.
- `enabled` — pole instancji wyłącznie dla setupu keeperów (odpowiedź (a), §5p); w grze zawsze `true`.

**Skutek stempla dla okupacji** `[doc: raport G2-3b]`: obrońca AI na kaflu stolicy przestał resetować licznik okupacji
gracza — przed stemplem kafel stolicy nie przechodził przez 12 civY, po stemplu przechodzi w 7. civY; gracz sam na stolicy:
7. civY w obu wariantach. W walce (100 prób): odsetki przejęć i straty bez zmian, mediana czasu przejęcia krótsza o 1–4
miesiące (np. 2 vs 2: 17 → 13). ⚠ Licznik biegnie, choć obrońca żyje na tym samym kaflu — to **359** (→ G2-4).

**Desant kapsułami — pomiar w uprzęży** `[doc: raport G2-3b]` (100 prób, % przejęć / mediana w miesiącach): młode AI
(2× G, morale 30): 1 szturmowiec 0 %; 2 — 77 % / 13; 4 — 100 % / 10. Dojrzała stolica jak w GATE-S4 (G G A G G A G,
morale 100), bez technologii: 4–8 szturmowców 0 %; 12 — 100 % / 14 (średnio ok. 2,5 straty). Z pełną technologią (+90):
4 — 21 %; 6 i więcej — 100 % / 11. Kolonia nie przechodzi, dopóki na ciele żyje choć jeden obrońca (M6).

---

## 5o. Bramka live G2-3b — 2026-10-03, właściciel: **PASS**

Zapis przy `gameTime` ok. 119,6 `[doc: bramka G2-3b]`.

| scena | co zrobiono | wynik |
|---|---|---|
| **wczytanie w wojnie** | zapis w wojnie z emp_001 | emp_001: **20** jednostek, flaga `{ mobilized: true, reason: 'reconcile_at_war', tier: 1, morale: 50, limit: 20, created: 20, reserve: 0, refused: 0 }`; `entity_54` — 10, dziesięć innych ciał po 1; kafle bez właściciela: **0** na wszystkich 20 koloniach AI; `emp_test_enemy` (zostawiony w zapisie) też zmobilizowany uzgodnieniem, szczebel 0 | **PASS** |
| **pokój** | emp_002 w pokoju | 0 jednostek | **PASS** |
| **nowa wojna** | panel dyplomacji odmówił z braku wywiadu, więc z konsoli `declareWar('emp_002', 'player_action')` | **9** jednostek od razu, `reason: 'war_declared'`, szczebel 1, morale 50, limit 9 | **PASS** |
| **walka** | Thuban c (`entity_55`): obrońca `gu_63` (`garrison_unit`, `deployed` na kaflu stolicy (−1,2), morale 50) przeciw czterem `shock_infantry` z `debug.spawnMyUnit` z `homeColonyId` = kolonia macierzysta | obrońca hp/morale 30/50 → 25/41 → 18/29 → 13/17 → 9/5 → znika; napastnik bez strat (`gu_85` 15 → 7 hp); właściciel emp_001, dopóki obrońca żył, potem gracz | **PASS** |
| **zapis i wczytanie** | przed zapisem 19 i 9 jednostek | po wczytaniu Thuban c należy do gracza i stoją na nim tylko czterej szturmowcy gracza; jednostek nadal 19 i 9 (potwierdzone przez właściciela) | **PASS** |
| **konsola** | — | `GET 404` na `assets/planet-textures/rocky_03_biome.png` z `ColonyOverlay._loadBiomeMap:5687` przy otwarciu mapy kolonii (→ **345**, **355**) · `[SaveSystem] kopia przedimportowa się nie zmieściła — import wykonany bez niej` (`SaveSystem.js:464`) (→ **362**) | — |

⚠ **Domyka niepotwierdzone z §5j:** przejęcie w WOJNIE po śmierci ostatniego obrońcy widziane w przeglądarce (Thuban c).
⚠ **Odmowa panelu dyplomacji z braku wywiadu jest zaprojektowana:** `canWar = notWar && isContact && !inTruce`
(`DiplomacyOverlay.js:541`) `[code]` — przycisk wojny wymaga wywiadu na poziomie `contact`.
⚠ **Szturmowcy z `debug.spawnMyUnit` dostali `homeColonyId` ręcznie** — bez tego płaciłaby za nich kolonia AI (**354**).

---

## 5p. Odpowiedzi właściciela z sesji G2-3b (2026-10-03)

| | pytanie | odpowiedź |
|---|---|---|
| (a) | wyłącznik `enabled` (tylko setup keeperów) jako pole instancji, bez flagi `FEATURES` | **może zostać polem instancji** |
| (b) | **358** — los jednostki GRACZA na ciele zniszczonym albo oddanym AI | jednostka na ciele **zniszczonym** jest **usuwana**, a jej POP — do czasu **G1c** — wraca do domu **w całości**; jednostka na ciele **oddanym AI** podlega **fladze wycofania D14** |
| (c) | **359** — licznik okupacji na heksie, na którym stoi żywy wróg | **licznik stoi** na heksie z żywą jednostką wroga, **dla obu stron** — w **G2-4** |
| (d) | **360** — imperium bez pełnej kolonii w chwili wybuchu wojny | **uzgadnianie co rok** zamiast wyłącznie na pierwszym ticku — w **G3** |

**Zakres G2-4 podpisany 2026-10-03 (R1–R7):**
- **R1** — bez wojny nie ma ognia ani okupacji: jednostki naziemne dwóch właścicieli walczą tylko, gdy ci są w wojnie (status
  relacji `'war'`); jednostka zajmuje obcy kafel tylko w wojnie z jego właścicielem (**348**).
- **R2** — licznik okupacji stoi na heksie, na którym stoi żywa jednostka wroga, dla obu stron (**359**).
- **R3** — wycofanie: przy podpisaniu pokoju (po wykonaniu cesji z traktatu) każda jednostka gracza na ciele drugiej strony
  dostaje flagę wycofania z terminem 6 wyświetlanych miesięcy (6 civY). Flaga znika przy załadunku na statek, gdy ciało
  staje się gracza albo gdy wojna z tym właścicielem wraca. Po terminie jednostka jest usuwana i traktowana jak polegli
  (POP ścieżką reintegracji po śmierci). Ta sama flaga obejmuje jednostki gracza na ciele oddanym AI (**358**).
- **R4** — jednostki AI na ciałach gracza znikają od razu przy podpisaniu pokoju.
- **R5** — meldunki: wpis w Dzienniku przy pokoju (ile jednostek, które ciało, termin) i ostrzeżenie miesiąc przed terminem,
  także w dzwonku; karta jednostki pokazuje flagę i termin. PL i EN.
- **R6** — zabranie wojsk z cudzego ciała ma działać (**353**); płatnik utrzymania jednostki gracza nigdy nie jest kolonią
  innego właściciela — kolonia macierzysta jednostki, jeśli jest gracza, inaczej kolonia macierzysta gracza (**354**).
- **R7** — jednostka gracza na zniszczonym ciele jest usuwana, a jej POP wraca do domu w całości (**358**, do G1c).
Poza zakresem G2-4: odrastanie i widoczność (G3), pule desantu (G2b), rodzina „utrata POP” (G1c), teren przy „Wyładuj”
(**349**), walka naziemna AI-vs-AI.

---

## 5q. G2-4 — dostarczone (łatki 2026-10-03, commity 2026-10-04)

| commit | zawartość | keeper |
|---|---|---|
| `edd6fd1` | **C1a — wojna w setupie czterech keeperów**, których sceny walki naziemnej toczyły się w pokoju i po R1 nie miałyby czego mierzyć: `ai_capture_intent` (boot), `g2_create_ai_unit` (T8), `ground_unit_loss` (boot), `w3_seams` (T6) — `declareWar(…, 'keeper_setup')` i wyłączona mobilizacja; **asercje bez zmian** (zgoda właściciela, §5s (1)) | na kodzie sprzed R1 21/0 · 26/0 · 29/0 · 38/0; wersje sprzed C1a na kodzie z R1 15/6 · 23/3 · 12/17 · 36/2 `[doc: notatka G2-4]` |
| `cd1fc46` | **C1b — R1 (#348) i R2 (#359).** NEW `WarGate.groundOwnersHostile(a, b)` (`WarGate.js:81`) — jedno źródło „czy te dwie strony walczą na ziemi”: gracz↔imperium tylko przy statusie relacji `'war'` (rozejm i NAP — nie), imperium↔imperium zawsze (poza zakresem, **331**), bez modułu dyplomacji — wrogowie. `CombatSystem` (`:36`, `:208`, `:459`) i `GroundUnitManager` (okupacja `:657`, `:718`; marsz terytorialny `:1004`; pościg `:1089`) liczą wyłącznie pary wrogie. R2: na heksie z żywym wrogiem licznik okupacji **stoi** dla obu stron i rusza od miejsca, w którym stanął (`_hexHasLivingEnemy`, `:327`; `:666`, `:721`). `g2_mobilisation_smoke` M9c **odwrócony świadomie** (pinował defekt 359) | NEW `g2_after_peace_smoke` A0–A3 **25/25**, fail-first **9/16**; M9c fail-first 55/1 `[doc: notatka G2-4]` |
| `1a41c62` | **C2 — wycofanie po pokoju (R3–R5, D14; 358 w części cesji).** NEW `src/systems/WithdrawalSystem.js` (`window.KOSMOS.withdrawalSystem`; `GameScene.js:335`, `:469`; `GameCore.js:211`, `:255`): `diplomacy:peaceSigned` → flaga `withdrawal = { empireId, orderedYear, deadline, warned }` na jednostkach gracza na ciałach drugiej strony (`onPeaceSigned`, `:68`), termin `WITHDRAWAL_YEARS = 0.5` (`:27`), ostrzeżenie miesiąc wcześniej (`:29`), w terminie usunięcie jak polegli (`groundUnit:destroyed`, przyczyna `withdrawal_deadline`); **R4** — jednostki imperium z ciał gracza znikają od razu; flaga gaśnie przy załadunku, przejęciu ciała, utracie kolonii i powrocie wojny (`_clearReason`, `:100`). Flaga w zapisie (`GroundUnitManager.js:1504`, `:1575`, `:1593`; v101 bez migracji). `InvasionSystem.closeCampaignsAtPeace` (`:81`). Meldunki: `NotificationCenter` (`:531`, `:538`, `:557`), grupa dzwonka (`NotificationDropdown.js:27`), karta jednostki (`UnitCardPanel.js:101-109`), linia panelu na mapie (`ColonyOverlay.js:2678`), `TimeSystem.formatTime` (`:98`). `DebugLog`: pięć zdarzeń `withdrawal:*` (`:124-128`). i18n +12 | + A4, A6, A7, A9, A10 **54/54**; fail-first **32/22** `[doc: notatka G2-4]` |
| `8c82cf7` | **C3 — R6 (#353, #354).** `_tickGroundUnitUpkeep` nie nadpisuje już `'in_cargo'` — brak żołdu w ładowni jedzie w `prevStatus` (`ColonyManager.js:1559-1570`); NEW `_groundUnitPayerId` (`:1606`, użycie `:1529`) — żołd jednostki gracza płaci jej kolonia macierzysta, jeśli należy do gracza, inaczej kolonia macierzysta gracza; nigdy kolonia innego właściciela | + A5 **62/62**; fail-first **56/6** `[doc: notatka G2-4]` |
| `39c9227` | **C4 — R7 (358 w części zniszczenia).** `GarrisonSystem.removeOnBodyDestroyed` (`:198`) usuwa też jednostki GRACZA stojące na ciele (nie w ładowni) i oddaje ich pełny koszt POP do domu (`releaseGroundUnitPops`, `:207`); ciało BEZ kolonii — przez `entity:removed` z bramką `hasColony` (`:69`). `g2_mobilisation_smoke` M8 **odwrócony świadomie** | + A8, A8d–A8g **73/73**; fail-first **66/7**; M8 fail-first 55/1 `[doc: notatka G2-4]` |
| `1fefcdc` | komentarz nagłówka `g2_seams_smoke` przy P6b: decyzja o losie jednostki gracza zapadła w G2-4 (R3 przy pokoju, R7 przy zniszczeniu); asercja P6b bez zmian | `g2_seams_smoke` 31/31 `[measured]` |

**Weryfikacja przy commitowaniu (2026-10-04)** `[measured]`: notatka przekazania i łatki zgodne z `SHA256SUMS` (19/19);
kotwica HEAD `5c3debe`, indeks = drzewo C1a, drzewo robocze = C4 (23/23 ścieżki); każdy commit dał dokładnie drzewo
z notatki (`6c20cd8` · `40aa831` · `02c9e24` · `7bb0e4a` · `c47456f`); każdy stan zbudowany jako osobny worktree na
świeżym checkoucie LF — sweep C1a **256/256**, C1b–C4 **257/257**, 0 FAIL, 31 advisory; `check-i18n` PASS 3428 (C1a, C1b)
/ 3440 (C2–C4); drzewo główne po commitach — to samo. Żaden commit nie przewraca całego pliku (numstat).

---

## 5r. Bramka live G2-4 — 2026-10-04, właściciel: silnik **PASS**, trzy wady widoku

Właściciel, język gry **angielski**, zapis w wojnie z emp_001 (garnizon zmobilizowany), `gameTime` ok. 120,5
`[doc: bramka G2-4]`.

| scena | co zrobiono | wynik |
|---|---|---|
| **wojna** | garnizon `gu_64` na Thuban d (`entity_56`), heks (−1,2); dwie `shock_infantry` A `gu_88` i B `gu_89` postawione na tym heksie | `contested: true`; po ok. czterech tygodniach A 15/15 → 11/12, garnizon 30/50 → 24/44 — **PASS** |
| **pokój** | wymuszone `offerPeace` | `true`; status `truce`; `contested: false`; dziesięć flag, wszystkie z terminem 121,016: A i B na `entity_56` oraz osiem jednostek prawdziwej armii właściciela (`gu_44`–`gu_49`, `gu_51`, `gu_52`) na `entity_57` „Thuban e”, ciele emp_001. Dziennik: „⚑ Peace with Unknown empire: 2 ground unit(s) on Thuban d must withdraw by 07/01/121”, to samo dla 8 jednostek na Thuban e, oraz „☮ Peace with Konsorcjum Siódmego Kręgu — 10-year truce” — **PASS** |
| **karta** | karta jednostki | pokazuje termin wycofania — **PASS** |
| **załadunek** | A załadowana ścieżką zapasową z konsoli (`{ ok: true }`) | po miesiącu i po trzech: `in_cargo`, flaga `null`, nie na ciele, statek „Odkrywca”, `unpaidYears` 0 — **PASS** (**353**, **354**) |
| **bez ognia w pokoju** | T0 + 1 miesiąc | B 15/15, garnizon 24/44 — bez zmian — **PASS** |
| **ostrzeżenie** | T0 + 5 miesięcy | dzwonek i wpis w Dzienniku — **PASS** |
| **termin** | T0 + 6 miesięcy | B zniknęła z Thuban d, ale właściciel **nie zobaczył żadnego meldunku** i nie mógł stwierdzić, czy jednostka zginęła. Audyt: `withdrawal:ordered` 2, `aiRemoved` 0, `warning` 2, `expired` 2, `cleared` 1 — **silnik PASS, dla gracza FAIL** (→ F5) |
| **Thuban c** | `entity_55`, cztery jednostki gracza | bez flag — **PASS** |
| **także widziane** | po załadunku z konsoli | A dalej narysowana na otwartej mapie kolonii Thuban d, choć silnik raportował ją na pokładzie (→ F7) |
| **konsola** | — | błędów nie zgłoszono |

⚠ **Dwa wpisy tej samej chwili, dwie nazwy imperium:** „Peace with Unknown empire” (wycofanie) obok „☮ Peace with
Konsorcjum Siódmego Kręgu” (pokój) → F6.
⚠ **`expired: 2` to dwa CIAŁA, nie dwie jednostki:** `withdrawal:expired` leci raz na ciało (`WithdrawalSystem.js:141-153`)
`[code]`, a `cleared: 1` to wyłącznie załadowana A ⇒ w terminie usunięte zostały B na Thuban d **i osiem jednostek
prawdziwej armii właściciela na Thuban e** (relacja nie mówi, by zostały załadowane przed terminem) — wniosek z kodu
i liczników, nie obserwacja.
⚠ **Granica dowodu tej bramki:** załadunek szedł ścieżką konsolową (`loadGroundUnit`), nie oknem ładowni; **R2**
(licznik okupacji przy żywym wrogu), **R4** (`aiRemoved: 0` — na ciałach gracza nie było jednostek AI), **R7**, zapis
i wczytanie z flagą w trakcie okna (A9) oraz wysokie prędkości czasu — **niećwiczone na żywo**, pokrycie wyłącznie
headless (`g2_after_peace_smoke`).

---

## 5s. Odpowiedzi właściciela po G2-4 (2026-10-03, wpisane 2026-10-04) i zakres poprawek

| | pytanie | odpowiedź | miejsce |
|---|---|---|---|
| (1) | zmiany keeperów poza listą: wojna w setupie czterech keeperów, odwrócone M9c i M8 | **przyjęte** | ten plik (§5q) i `CLAUDE.md`; bez kodu, bez bramki |
| (2) | **363** — pokój nie cofa okupacji kafli | przy pokoju kafle zajęte w wojnie **wracają do właściciela kolonii**, na koloniach **obu stron**, a liczniki okupacji są zerowane — **F1** | hak `WithdrawalSystem.onPeaceSigned` (`:68`) + helper obok `stampUnownedTiles` (`TileOwnership.js`); krótka bramka: kolory kafli po pokoju |
| (3) | **364** — ostrzał z orbity bez bramki wojny | ostrzał z orbity na ciało innego imperium **wymaga wojny** z jego właścicielem; w pokoju odmowa z powodem — **F2** | dostępność akcji (`FleetActions.js`, powód `fleet.reason.notAtWar`), żądanie ostrzału (`ColonyOverlay.js`, wzór `:320`), strażnik silnika `GroundUnitManager._onOrbitalStrike` (`:51`) przez `warGateRefusal`; bramka: pokój — odmowa, wojna — działa |
| (4) | **366** — stare zapisy bez flagi | jednostki gracza stojące w pokoju na ciele innego imperium dostają flagę **przy wczytaniu**; termin = chwila wczytania + 0,5 roku; bez dublowania istniejących flag — **F3** | uzgodnienie w `WithdrawalSystem` (wzór `GarrisonSystem._firstTick`); lekka bramka: wczytanie starego zapisu |
| (5) | **367** — ciche R4 i R7 | **wpisy w Dzienniku** dla R4 (Dyplomacja) i R7 (Walka) — **F4** | `NotificationCenter`: `withdrawal:aiRemoved` i `garrison:unitsRemoved` (gracz, `cause: 'body_destroyed'`); nowe klucze PL+EN; lekka bramka |

**Wady widoku z bramki (2026-10-04, §5r) — zakres poprawek:**
- **F5** — gdy termin usuwa jednostki, gracz ma się o tym dowiedzieć: **jeden wpis w Dzienniku i jeden w dzwonku na ciało**,
  z nazwą ciała i liczbą utraconych jednostek; najpierw ustalić, dlaczego właściciel nic nie zobaczył (wpis nie powstał /
  powstał w kanale lub filtrze, którego nie widać / zjadł go throttling lub deduplikacja).
- **F6** — wpisy wycofania mówią „Unknown empire”, a wpis pokoju tej samej chwili nazywa imperium: **to samo źródło nazwy
  i ta sama reguła wywiadu w obu**; sprawdzić gramatykę polskiego tekstu po „z”.
- **F7** — „duch” na mapie: czy załadunek **normalnym oknem ładowni** przy otwartej mapie tego ciała zostawia jednostkę
  narysowaną, i czy jednostki usunięte w terminie lub przez R4 znikają z otwartej mapy; naprawić to, co psują ścieżki
  normalne; jeśli ducha zostawia tylko ścieżka konsolowa — zgłosić i niczego nie zmieniać.

**Obserwacje bez numeru** (notatka przekazania §8): „Pokój z Nieznane imperium” (mianownik po „z”) → **F6**; ostrzeżenie
w dzwonku nie gaśnie po terminie — zostaje obserwacją (dotyka F5); daty `formatTime` przesunięte o 1–2 dni (przybliżony
miesiąc 30,44 dnia, `TimeSystem.js:98-123`) — zostaje. **365** — bez decyzji.

---

## 6. Rejestr findingów arca (#309–#367, zebrane 2026-10-02–04)

⚠ **Zasada wpisu:** każde `plik:linia` sprawdzone grepem — #309–#325 na `f868ae8`, #326–#335 na `c7c5a74`,
#336–#342 na `82c9196`, #343–#347 na `44967a3`, #348–#357 na `dbfbbd6`, #358–#362 i zamknięcia G2-3b na `2437725` (stare wpisy zachowują numery linii sprzed G1b). Numeracja globalna: najwyższy istniejący numer to **#308**
(`VESSEL_ORDERS_PLAN.md` §308; #309 był tam planowany i świadomie **nieprzydzielony**), więc ten arc zaczyna
od **#309**; przed nadaniem #327+ sprawdzono, że w żadnym rejestrze nie ma numeru wyższego niż #325, a #326
istniał tylko w komunikacie `c7c5a74`; przed nadaniem #336+ sprawdzono grepem wszystkie rejestry — najwyższy
był #335; przed nadaniem #343+ — najwyższy był #342; przed nadaniem #348+ — najwyższy był #347 (grep rejestrów,
`CLAUDE.md` i historii commitów, 2026-10-03); #358–#361 nadane w raporcie sesji G2-3b, gdy najwyższy był #357, a przed
wpisaniem ich i nadaniem #362 grep rejestrów, `CLAUDE.md` i historii commitów znów dał #357 (2026-10-03); #363–#367
nadane w notatce przekazania G2-4 (2026-10-03), gdy najwyższy wpisany był #362, a przed ich wpisaniem grep rejestrów,
`CLAUDE.md`, pamięci i historii commitów znów dał #362 (2026-10-04). Znaczniki: 🔴 żywy i dotkliwy · 🟠 realny, ograniczony ·
⚪ obserwacja/higiena · ✅ zamknięty.
⚠ Źródło: **309–316** z sesji G1 · **317–325** z audytu G0 (mechanizmy przemierzone w źródle teraz;
liczby z G0 oznaczone `[doc: raport G0]`) · **326** nadany przy podpisie zakresu G1b · **327–332** kandydaci
sesji G1b (§5b (e)) · **333** z rekoncyliacji A0 (§5c.1 (c)) · **334–335** z obserwacji bramki G1b (§5c.2) ·
**336–341** z fazy A G2 (§5e; liczby powtórzone na `82c9196` mają `[measured]`) · **342** z sesji G2-1 (§5f) ·
**343–347** z sesji G2-K1 (§5g; wszystkie liczby powtórzone na `44967a3`; **347** znaleziony przy weryfikacji **344**) ·
**348–352** — „znalezione, nienaprawione” sesji G2-2 · **353–357** — obserwacje z bramki live G2-2 (§5j); wszystkie
miejsca sprawdzone grepem na `dbfbbd6`, sondy headless 353/354 poza repo · **358–361** — „znalezione, nienaprawione”
sesji G2-3b (raport 2026-10-03; numery nadane w raporcie, wpisane po bramce) · **362** — obserwacja z bramki live G2-3b
(§5o); miejsca sprawdzone grepem na `2437725`, pomiar rozmiaru zapisu w sesji zamykającej G2-3b · **363–367** —
„znalezione, nienaprawione” sesji G2-4 (notatka przekazania 2026-10-03; numery nadane w notatce, wpisane po bramce);
miejsca sprawdzone grepem na `1fefcdc`, liczby z sond headless sesji G2-4 oznaczone `[doc: notatka G2-4]`.

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

### ✅ 317 — lądowanie i podbój w czasie POKOJU — ZAMKNIĘTY 2026-10-03 (`48c94dd` + `dbfbbd6`, G2-2)

- Desant gracza bramkuje wyłącznie dominacja orbitalna (`ColonyOverlay.js:325`, `FleetActions.js:554`,
  `:589`), a `WarSystem.playerHasOrbitalDominance` (`WarSystem.js:982-990`) przy braku kontrolera zwraca
  `!_hasHostileFleetInSystem` ⇒ układ bez floty wroga oznacza dominację `[code]`.
- `InvasionSystem.launchInvasion` (`InvasionSystem.js:89` i dalej) nie ma żadnego warunku wojny `[code]`.
- `_tryPlayerCapture` (`InvasionSystem.js:350-363`) wymaga braku żywego obrońcy i przewagi terenowej —
  bez warunku wojny; okupacja kafla z budynkiem trwa 6 civY (`GroundUnitManager.js:573`) `[code]`.
  AI nie buduje jednostek naziemnych, więc kolonia AI nie ma obrońcy.
- Niebroniona kolonia AI pada po 6 civY stania jednej jednostki `[doc: raport G0]`.

Kierunek: D4 — lądowanie na obcym ciele wymaga wojny, garnizon materializuje się przy wypowiedzeniu (G2).
**Zamknięcie** (na `dbfbbd6`): bramka wojny **D13** w chwili lądowania na każdej ścieżce gracza — kapsuły
(`Vessel.js:741`/`:778`; dostępność akcji `FleetActions.js:550` PRZED dominacją), away team (`VesselManager.js:1362`),
„Wyładuj” (od **D13a** nigdy na cudzym ciele, `CargoLoadModal.js:388`/`:401`) — oraz w `launchInvasion`
(`InvasionSystem.js:102`) i w obu predykatach przejęcia (`:375`, `:490`) `[code]`. Źródło prawdy: status relacji
`'war'` (`WarGate.js:68`); rozejm i NAP blokują. Keeper `g2_war_gate_smoke` W1/W3/W5/W6 (+ kontrole w wojnie),
pin `g2_seams_smoke` P5 odwrócony świadomie `[measured]`; bramka live PASS (§5j). **Garnizon przy wypowiedzeniu
(druga połowa D4) — G2-3.** Zostaje: okupacja i walka trwają w pokoju (**348** → G2-4).

### ✅ 318 — kafle kolonii AI mają `owner` = `null` — ZAMKNIĘTY 2026-10-03 (`2437725`, G2-3b/C-S3)

`EmpireColonyBootstrap` generuje siatkę (`:171-174` stolica, `:378-381` kolejne kolonie) bez stempla
`tile.owner` (domyślnie `null`, `HexTile.js:255`) `[code]`. Stempel `colony.ownerEmpireId` daje dopiero
otwarcie mapy w `ColonyOverlay` (`:584-588`) — efekt uboczny UI — albo zmiana właściciela
(`ColonyManager.js:923`, `GroundUnitManager.js:626`) `[code]`. Rodzina AI_CAPTURE 58 (kafle placówki)
i 54 (garnizon na efekcie ubocznym UI). Istotne dla G2: okupacja i warunek przejęcia czytają `tile.owner`.
**Zamknięcie:** `TileOwnership.stampUnownedTiles` (tylko kafle bez właściciela) przy domu, ekspansji i placówce AI
(`EmpireColonyBootstrap.js:179`, `:389`, `:507` na `2437725`) i na pierwszym ticku w starych zapisach
(`GarrisonSystem.reconcile` → `stampAiColonyTiles`, `:223`, `:238-245`) `[code]`. Keeper `g2_mobilisation_smoke` M9
(fail-first 52/4), pin `g2_seams_smoke` P3 odwrócony świadomie `[doc: raport G2-3b]`; bramka: **0** kafli bez właściciela
na 20 koloniach AI `[doc: bramka G2-3b]`. Skutek uboczny: obrońca AI na własnym kaflu nie resetuje już licznika
okupacji gracza — a licznik biegnie mimo żywego obrońcy (**359**). §5n.

### ✅ 319 — jednostki naziemne osierocone przy zniszczeniu ciała i nietknięte przy zmianie właściciela (→ D6) — ZAMKNIĘTY 2026-10-03 dla jednostek imperiów AI (`24beea4`, G2-3b/C-S2); jednostki gracza → **358**

`removeColony` (`ColonyManager.js:731` i dalej), `transferColony` (`:842` i dalej) i
`captureColonyForPlayer` (`:982` i dalej) — **zero** odwołań do jednostek naziemnych w zakresie
`:731-1060`; handler `colony:destroyed` w `GameScene.js:3400` i dalej — też żadnego `[code]`. Jednostki
poprzedniego właściciela zostają na ciele (po zniszczeniu — przy nieistniejącej koloni) `[code]`.
Rozszerza AI_CAPTURE 59 (najeźdźcy zostają po przejęciu). D6: przy zmianie właściciela lub zniszczeniu
ciała jednostki poprzedniego właściciela są usuwane.
**Zamknięcie (jednostki AI):** `GarrisonSystem.removeOnOwnerChange` (`:178` na `2437725`) na `colony:capturedByPlayer`
i `colony:captured` usuwa jednostki poprzedniego właściciela-AI na ciele; `removeOnBodyDestroyed` (`:188`) na
`colony:destroyed` — jednostki wszystkich imperiów AI `[code]`. Keeper `g2_mobilisation_smoke` M7/M8, piny `g2_seams_smoke`
P6a/P6c odwrócone, P6b (jednostka gracza) bez zmian `[doc: raport G2-3b]`; bramka: po przejęciu Thuban c stoją na nim
wyłącznie jednostki gracza, także po wczytaniu `[doc: bramka G2-3b]`. Los jednostek GRACZA (D16 mówi „wszystkie”) —
decyzja właściciela 2026-10-03 (§5p (b)) → **358**, krok G2-4. §5n.

### ⚪ 320 — `diplomacy:warDeclared` nie niesie `declaredBy`, a `UIManager` go czyta

Jedyny emiter `DiplomacySystem.js:398` wysyła `{ empireId, reason }`; `UIManager.js:1624-1626`
destrukturyzuje `declaredBy` (zawsze `undefined`, ratowane przez `empireId ?? declaredBy`) `[code]`.
Dziś nieszkodliwe; istotne dla G2, gdzie materializacja zależy od wypowiedzenia — kto wypowiedział,
niesie dziś tylko `reason`.
**G2-3b go nie potrzebował:** zaczep mobilizacji czyta wyłącznie `empireId` (`GarrisonSystem.js:51` na `2437725`), a wojna
jest zawsze parą gracz–imperium `[code]`. Zostaje otwarty jako higiena odczytu w `UIManager`.

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

### ✅ 324 — świeży `garrison_unit` jest `mobile`, a odtworzenie bez pola daje `deployed` — ZAMKNIĘTY w zakresie D6 2026-10-03 (`6fc2c8d`, G2-3b)

`createUnit` ustawia `deployState = opts.deployState ?? 'mobile'` (`GroundUnitManager.js:121`), a
`restore` dla zapisu bez pola przyjmuje `'deployed'` (`:1473`) `[code]`; zapis z polem przechodzi
poprawnie (`serialize`, `:1408`). Garnizon `mobile` ma `dmg 0` (`mobileStats`, `unitArchetypes.js:99`)
— pomiar G1, wiersz 1d: AI wygrywa 100% `[measured]`. D6: garnizon AI stoi `deployed` od utworzenia.
**Zamknięcie (D6):** garnizon AI powstaje przez `createAIUnit({ …, deployed: true })` (`GarrisonSystem.js:146-149` na
`2437725`), więc stoi `deployed` od utworzenia `[code]`; bramka: `gu_63` `deployed` na kaflu stolicy `[doc: bramka G2-3b]`.
Asymetria `createUnit` (`'mobile'`) ↔ `restore` bez pola (`'deployed'`) zostaje dla jednostek GRACZA — gracz rozkłada je
ręcznie, a zapisy niosą pole (`serialize`, `GroundUnitManager.js:1457`) `[code]`.

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

### ✅ 336 — stolica kolonii AI może stać na kaflu oceanu — takiej kolonii nie da się przejąć z ziemi — ZAMKNIĘTY 2026-10-02 (`8ea5af3` + `44967a3`, G2-K1)

`EmpireColonyBootstrap._placeBuildingSmart` odrzuca kafle warunkiem `tile.buildable === false`
(`EmpireColonyBootstrap.js:723`), ale kafel siatki takiego pola nie ma: `buildable` żyje wyłącznie w danych terenu
(`TERRAIN_TYPES.ocean.buildable: false`, `HexTile.js:57`), a w `HexTile.js` nie ma ani jednego zapisu
`this.buildable` `[code]`. `colony_base` ma `terrainOnly: null` i `terrainAny: true` (`BuildingsData.js:44-45`),
więc punktacja kafli remisuje i wygrywa pierwszy przeskanowany kafel `[code]` — wszystkie stolice AI stoją na (-1,2)
`[measured]`. Na oceanie nie da się stanąć (`MOVE_COST.ocean = Infinity`, `GroundUnitManager.js:30` na `82c9196` — od
G2-K1 tabela mieszka w danych: `GROUND_MOVE_COST.ocean`, `GroundUnitData.js:120`; zrzut
odmawia na oceanie, `ColonyOverlay.js:4643`) ⇒ `_tickOccupation` nigdy nie ruszy kafla stolicy, a
`holdsDecisiveGround` (`InvasionSystem.js:404`) żąda właśnie tego kafla ⇒ **kolonii nie da się przejąć**
`[code]`. Zmierzone na `82c9196`: 14 ziaren, 28 stolic AI, **6 na oceanie**, wszystkie na (-1,2); w fixture
GATE-S4 stolica emp_002 „Regulus c” (pop 158) stoi na oceanie `[measured]`. Pin `g2_seams_smoke` P4b.
Kierunek: **D17**.
**Zamknięcie** (na `44967a3`): generowanie — stolica pomija kafle, na których nie da się stanąć
(`EmpireColonyBootstrap.js:732`; obie ścieżki bootstrapu); stare zapisy — `holdsDecisiveGround` stosuje do stolicy nie
do stania regułę placówki (`InvasionSystem.js:417`); bliźniak AI — `_findTerritorialGoal` (`GroundUnitManager.js:1147`)
nie maszeruje na taką stolicę. Jedno źródło „da się stanąć”: `GROUND_MOVE_COST` (`GroundUnitData.js:110`) +
`isStandableTile` (`:131`), czytane przez ruch, bootstrap i oba predykaty `[code]`. Na 14 ziarnach 28/28 stolic AI na
kaflu, na którym da się stanąć (keeper T1); zapis ze stolicą na oceanie wczytuje się bez zmian i przechodzi regułą
placówki (T5) `[measured]`. Fixture GATE-S4 powstał przed naprawą — „Regulus c” ma dalej stolicę na oceanie i od
G2-K1 jest zdobywalna regułą placówki. Zostają: **343** (martwy test dla zwykłych budynków) i **346** (jedna
współrzędna stolic). §5g.

### ✅ 337 — łazik badawczy (away team) przejmuje kolonię AI w czasie POKOJU (rozszerza 317) — ZAMKNIĘTY 2026-10-03 (`48c94dd`, G2-2)

`send_away_team` wymaga tylko orbity, statusu `idle` i modułu (`FleetActions.js:493-516`); lądowanie wybiera
kafel bez oceanu i bez budynku (`ColonyOverlay.js:4591-4607`), a `deployAwayTeam` tworzy `science_rover`
z właścicielem gracza (`VesselManager.js:1353-1360`) — bez dominacji, bez kapsuł i bez wojny `[code]`.
`_tickOccupation` nie filtruje roli, a `_tryPlayerCapture` nie pyta o wojnę `[code]`. Zmierzone na `82c9196`
(prawdziwe ticki, relacja `peace`): łazik przesunięty na kafel stolicy przejmuje kolonię AI w **8. civY**.
Kontrole: łazik obok stolicy — nic przez 14 civY; z żywym garnizonem — kafel stolicy przechodzi na gracza,
kolonia nie `[measured]`. Kierunek: **D13**.
**Zamknięcie** (na `dbfbbd6`): `send_away_team` odmawia na ciele innego imperium bez wojny (`FleetActions.js:510`),
`deployAwayTeam` sprawdza wojnę w chwili lądowania i zwraca powód (`VesselManager.js:1362`), a `_tryPlayerCapture`
wymaga wojny (`InvasionSystem.js:375`) `[code]`. Keeper `g2_war_gate_smoke` W1d/W1e (odmowa w pokoju) i W5
(łazik na stolicy AI w pokoju nie przejmuje przez 14 civY; w wojnie przejmuje) `[measured]`. Bramka live: łazik
trzymał kafel stolicy niebronionej kolonii przez cały rozejm, kolonia została przy `emp_test_enemy`
`[doc: bramka G2-2]`. Zostaje: sam kafel przechodzi na łazik w rozejmie (**348**).

### ✅ 338 — „Wyładuj” z ładowni ląduje wojsko bez kapsuł, dominacji i wojny — ZAMKNIĘTY 2026-10-03 (`48c94dd` + `dbfbbd6`, G2-2 + D13a)

Dla statku na orbicie `_getVesselColony` zwraca kolonię ciała **dowolnego właściciela**
(`FleetManagerOverlay.js:3059`). Okno ładowni otwiera akcja `load_troops` (`:2786`) i przycisk 📦 (`:7739`),
a „Wyładuj” woła `unloadGroundUnit(vessel, unit, planetId, unit.q ?? 0, unit.r ?? 0)` (`CargoLoadModal.js:388`) —
bez sprawdzenia kapsuł, dominacji i wojny; jednostka staje na współrzędnych heksu, z którego ją załadowano
`[code]`. Niemierzone (DOM). Kierunek: **D13**.
**Zamknięcie:** `48c94dd` — bramka wojny w `unloadGroundUnit` (`Vessel.js:741`) i wyszarzenie w oknie ładowni;
`dbfbbd6` — **D13a**: „Wyładuj” na ciele innego imperium odmawia ZAWSZE, także w wojnie (`cargoUnloadRefusal`,
`WarGate.js:88`; `CargoLoadModal.js:388` wyszarzenie z powodem własnym, `:401` ocena w chwili kliknięcia), więc
jedyną drogą wojsk na cudze ciało są kapsuły — z dominacją i wojną `[code]`. Zmierzone na prawdziwym oknie ładowni
pod node (W11): przed D13a w wojnie klik wysadzał jednostkę na kolonii AI, po — jednostka zostaje w ładowni
`[measured]`. Zostaje (własne i niczyje ciała): brak sprawdzenia terenu i cel = kolonia macierzysta nad ciałem bez
kolonii (**349**).

### ✅ 339 — predykaty przejęcia nie pytają o wojnę, a żaden keeper przejęcia nie ustawia wojny — ZAMKNIĘTY 2026-10-03 (`6391b23` + `48c94dd`, G2-2)

`launchInvasion` (`InvasionSystem.js:89`), `_tryPlayerCapture` (`:350`) i `_tickCaptureChecks` (`:427`) nie mają
terminu wojny `[code]`; pin `g2_seams_smoke` P5: przejęcie przez gracza, desant AI i przejęcie przez AI w stanie
**pokoju** `[measured]`. Sześć keeperów przejęcia i desantu (`ai_capture_army`, `ai_capture_outpost`,
`ai_capture_seams`, `ai_capture_ledger`, `invasion_player_capture`, `startup_units_zero`) ma **zero** wywołań
`declareWar` / `createWar` `[code: grep]` ⇒ warunek wojny z D13 przestawi je wszystkie. Kierunek: **D13**.
**Zamknięcie:** termin wojny w `launchInvasion` (`InvasionSystem.js:102`), `_tryPlayerCapture` (`:375`)
i `_tickCaptureChecks` (`:490`) — `48c94dd` `[code]`. Keepery mechaniki przejęcia dostały wojnę w setupie
(`6391b23`): pięć z listy wyżej **oraz** `g2_ocean_capital` i `w3_ai_invasion` (padał jako jedyny w sweepie po
bramce); ⚠ `startup_units_zero` wojny **nie potrzebował** — zielony bez zmian `[measured]`. Pin P5 odwrócony
świadomie z kontrolą w wojnie przy każdym zdaniu `[measured]`.

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

### 🟠 343 — zwykłe budynki AI stają na kaflach oceanu: martwy test `tile.buildable` w bootstrapie (→ osobny slice)

`EmpireColonyBootstrap._placeBuildingSmart` odrzuca kafle warunkiem `tile.buildable === false`
(`EmpireColonyBootstrap.js:731`), a kafel siatki nie ma pola `buildable` — żyje ono wyłącznie w `TERRAIN_TYPES`
(`HexTile.js:57`); w `src/` poza testami czyta `tile.buildable` tylko ta linia, reszta pyta `TERRAIN_TYPES[…]?.buildable`
`[code: grep]`. Od G2-K1 bramkuje to tylko stolicę (`:732`); zwykłe budynki AI dalej mogą stanąć na oceanie. Zmierzone
na `44967a3`, 14 ziaren, kolonie macierzyste AI: **46 z 476** budynków na oceanie — `research_station` 26, `shipyard`
11, `launch_pad` 9 `[measured]`; w fixture GATE-S4 „Regulus c” 4 z 49 `[measured]`. Skutki `[code]`: na kafel oceanu
nie da się wejść, więc takiego budynku nie da się okupować — placówka, której wszystkie budynki stoją na oceanie, jest
niezdobywalna regułą placówki dla obu stron; cel marszu terytorialnego AI (`_findTerritorialGoal`, najbliższy kafel
z budynkiem) nie filtruje terenu, więc może wskazać kafel, do którego nie ma drogi (`no_path`). Drugiego skutku nie
mierzono. Kierunek: **osobny, późniejszy slice**, bo zmienia rozmieszczenie budynków AI (§5h (b)).

### 🟠 344 — desant AI ląduje na krawędzi bez drogi do celu: `_findLandingHexes` nie sprawdza osiągalności (→ rejestr, §5h (d))

`InvasionSystem._findLandingHexes` (`InvasionSystem.js:500`) bierze kafle brzegowe (mniej niż 6 sąsiadów — rzędy
polarne), bez oceanu, bez stolicy i bez cudzej jednostki, i je tasuje; nie pyta, czy z kafla da się dojść do stolicy
`[code]`. Jednostka bez drogi zgłasza `groundUnit:territorialBlocked { reason: 'no_path' }` (`GroundUnitManager.js:1106`)
i stoi `[code]`. Zmierzone na `44967a3`, 14 ziaren: na koloniach macierzystych AI jako celach (kształt kolonii AI
odbitej przez gracza) **33 z 486** kafli strefy lądowania nie ma drogi do stolicy, w **4 z 28** kolonii; 31 z 33 to
`ice_sheet` w rzędzie polarnym. Na koloniach macierzystych gracza **0 z 249** `[measured]`. Dwa mechanizmy
(domyślne ziarno) `[measured]`: (a) **czapa polarna odcięta oceanem** — `entity_79`: ląd w dwóch składowych (9 i 117
kafli), 7 z 14 kafli strefy w składowej bez stolicy; (b) **asymetria sąsiedztwa** (**347**) — `entity_188`: z 10 kafli
rzędu 15 ani BFS po `getNeighbors`, ani A* bez limitu iteracji nie dochodzą do stolicy (`_aStar` ma limit 2000,
`GroundUnitManager.js:1308`, ale nie on decyduje — przy 25–28 iteracjach kolejka się wyczerpuje). Skutek: w sesji
G2-K1 desant emp_002 na odbitą kolonię `entity_79` — obie jednostki `no_path`, przejęcia nigdy, także przy stolicy
lądowej `[measured]`. Bez przypisanego kroku; istotne dla **G2-3** i **G2b**.

### ⚪ 345 — uśpiony nadpis typów kafli z mapy biomów: `ColonyOverlay._applyBiomeMap` rozjechałby siatkę silnika, gdyby powstały pliki `_biome.png`

`ColonyOverlay._loadBiomeMap` (`ColonyOverlay.js:5647`) ładuje `assets/planet-textures/<typ>_<wariant>_biome.png`,
a `_applyBiomeMap` (`:5675`) nadpisuje `tile.type` KAŻDEGO kafla siatki (`:5727`) — także stolicy i kafli z budynkami
— asynchronicznie, przy otwarciu mapy `[code]`. Dla kolonii obcej i kolonii z zapisu jest to TA SAMA instancja siatki,
której używa silnik (`shouldReuseColonyGrid`, `:561`; `_loadBiomeMap` na niej, `:571`) ⇒ teren — a z nim „da się
stanąć”, ruch, okupacja i warunek przejęcia z D17 — zmieniałby się od samego otwarcia mapy, różnie dla kolonii
oglądanych i nieoglądanych `[code]`. **Uśpione:** w `assets/planet-textures/` jest 0 plików `_biome.png` na 216
`[measured]`, więc `onerror` zostawia biomy `PlanetMapGenerator`; generator pisze je wyłącznie z flagą `--biome-map`
albo `--all-maps` (`generate-planets.js:87`, `:540`, `:1181`) `[code]`. Uzbraja się z chwilą wygenerowania tekstur z tą
flagą. Mechanizm od `43c01ba` `[git]`. Bez przypisanego kroku.
**Rozszerzenie 2026-10-03 — widoczny ślad (bramka G2-3b, §5o):** każde otwarcie mapy kolonii wysyła żądanie, które konsola
przeglądarki pokazuje jako `GET 404` — `assets/planet-textures/rocky_03_biome.png` z `ColonyOverlay._loadBiomeMap:5687`
(`img.src = url`) `[doc: bramka G2-3b]` `[code]`; w `assets/planet-textures/` nadal **0** plików `_biome.png` `[measured]`.
Mechanizm pozostaje uśpiony (`onerror` pusty, `:5684-5686`) — szkodą jest szum w konsoli i zbędne żądanie przy każdym
otwarciu mapy. Jeśli pliki mają nigdy nie powstać, żądanie można w ogóle pominąć; bez naprawy teraz, bez przypisanego kroku.

### ⚪ 346 — stolice AI stoją na jednej współrzędnej (−1,2), także na lodzie (obserwacja)

Punktacja kafli dla stolicy remisuje (kara polarna dla rzędów 0–1 i dwóch ostatnich, `EmpireColonyBootstrap.js:741-743`;
`score > bestS` ściśle), więc wygrywa pierwszy przeskanowany kafel rzędu 2 `[code]`. G2-K1 dołożył tylko warunek, że na
kaflu da się stanąć. Zmierzone na `44967a3`, 14 ziaren, kolonie macierzyste AI: **22 z 28** stolic na (−1,2), reszta
na (6,2), (1,2), (0,2), (2,2) — zawsze rząd 2; teren: równiny 10, góry 9, tundra 5, pustynia 3, pustkowie 1, lód 0
`[measured]`. W fixture GATE-S4 (gy 60, `bee26cf`, także kolonie ekspansji AI na ciałach lodowych): **11 z 11** stolic
AI na (−1,2), **5 z 11 na `ice_sheet`**, 1 na oceanie („Regulus c”, sprzed G2-K1) `[measured]`. Na lodzie da się stanąć
(`GROUND_MOVE_COST.ice_sheet = 3`), więc to nie jest defekt przejęcia — obserwacja o jakości rozmieszczenia. Bez
przypisanego kroku; rodzina **322**.

### 🟠 347 — `HexGrid.getNeighbors` nie jest symetryczne: na siatce o rzędach różnej szerokości A→B bywa sąsiedztwem, a B→A nie

Zmierzone na `44967a3` (domyślne ziarno): siatka 164 kafli (`entity_79`) — **64 z 956** par sąsiedztwa bez pary
zwrotnej; siatki 300 kafli (`entity_188` i kolonia macierzysta gracza `entity_5`) — **82 z 1760** `[measured]`.
Asymetria siedzi przy zawijaniu poziomym liczonym per rząd (`getRowWidth`, `HexGrid.js:123-145`) — przykłady:
(−1,2)→(6,1) i (−1,2)→(15,3) bez par zwrotnych `[measured]`. Skutek zmierzony: drugi mechanizm **344** (z rzędu 15
`entity_188` nie da się dojść do stolicy). Każda logika naziemna oparta na sąsiedztwie — A*, ucieczka, rozstawienie
garnizonu po pierścieniach (**D10**) — dziedziczy kierunkowość `[code]`; poza desantem skutków nie mierzono.
⚠ `src/map/HexGrid.js` jest na liście plików krytycznych (`CLAUDE.md`) — naprawa wymaga planu. Bez przypisanego
kroku; istotne dla **G2-3**.

### ✅ 348 — okupacja kafli i walka naziemna trwają w POKOJU; G2-2 bramkuje tylko lądowanie i przejęcie kolonii — ZAMKNIĘTY 2026-10-04 (`cd1fc46`, G2-4/C1b)

`GroundUnitManager._tickOccupation` (`GroundUnitManager.js:616-666`) zmienia `tile.owner` — pusty kafel od razu, kafel
z budynkiem po 6 wyświetlanych miesiącach — bez terminu wojny, a `CombatSystem._findContestedHexes`
(`CombatSystem.js:152-171`) grupuje jednostki wyłącznie po właścicielu `[code]`. Po G2-2 jednostka, która JUŻ stoi na
cudzym ciele, w pokoju, rozejmie i przy NAP dalej okupuje kafle (`tile:ownerChanged` → meldunek AC-9 przy kolonii
gracza) i walczy; zamknięte jest tylko przejęcie KOLONII (`InvasionSystem.js:375`, `:490`). Bramka live: łazik trzymał
kafel stolicy przez cały rozejm `[doc: bramka G2-2]`. Znalezione w sesji G2-2, nienaprawione. Kierunek: **D14** (G2-4) —
okno wycofania bez ognia i okupacji, po terminie usunięcie.
**Zamknięcie** (na `1fefcdc`): **R1** — `WarGate.groundOwnersHostile` (`WarGate.js:81`) jako jedno źródło wrogości
w `CombatSystem` (`:36`, `:208`, `:459`) i w `GroundUnitManager` (okupacja `:657`, `:718`; marsz `:1004`; pościg `:1089`)
`[code]`; gracz↔imperium walczą i zajmują kafle wyłącznie przy statusie `'war'`. Keeper `g2_after_peace_smoke` A1/A2
`[doc: notatka G2-4]`; bramka: w pokoju B 15/15 i garnizon 24/44 bez zmian po miesiącu `[doc: bramka G2-4]`. Zostaje:
pokój nie cofa okupacji już dokonanej (**363**).

### 🟠 349 — „Wyładuj” bez sprawdzenia terenu; nad ciałem BEZ kolonii celem jest kolonia macierzysta (reszta 338 dla ciał własnych i niczyich)

- „Wyładuj” podaje współrzędne zapamiętane przy załadunku (`unit.q ?? 0, unit.r ?? 0`, `CargoLoadModal.js:405`),
  a `unloadGroundUnit` przypisuje je bez `isStandableTile` i bez sprawdzenia, czy kafel istnieje w siatce celu
  (`Vessel.js:743-745`) `[code]` ⇒ na innym ciele jednostka może stanąć na oceanie albo poza siatką.
- Statek na orbicie ciała bez kolonii: `_getVesselColony` spada na kolonię macierzystą (`FleetManagerOverlay.js:3074-3075`),
  więc okno ładowni dostaje kolonię DOMU — „Wyładuj” stawia jednostkę na ciele domu, a lista „Załaduj” pokazuje garnizon
  domu, gdziekolwiek statek jest (także w innym układzie) `[code]`. D13a tego nie dotyka (dom jest własny).
Niemierzone (DOM). Znalezione w sesji G2-2, nienaprawione. Bez przypisanego kroku.

### ⚪ 350 — pozostałe odmowy zrzutu pokazują surowy slug

`ColonyOverlay.js:4683`: `t('drop.failed', res?.reason ?? 'unknown')` dla każdej odmowy `dropTroop` innej niż
`not_at_war` — `invalid_args` / `no_drop_pods` / `not_loaded` (`Vessel.js:773-775`) ⇒ gracz widzi „Drop failed:
not_loaded” `[code]`. Klasa **271**/**113**; `check-i18n` jest na to ślepy (klucz istnieje). Odpowiedź właściciela
(f): etap polerki UI.

### ⚪ 351 — ciche odmowy away team

`ColonyOverlay.js:4608-4609` pokazuje powód wyłącznie dla `not_at_war`; pozostałe odmowy `deployAwayTeam` —
`no_vessel` / `no_gum` / `create_failed` (`VesselManager.js:1357`, `:1366`, `:1378`) — kończą tryb lądowania bez słowa
`[code]`. W tym samym bloku literał `'🤖 Away Team wylądował'` (`:4611`, klasa **113**). Odpowiedź właściciela (e):
etap polerki UI.

### ⚪ 352 — odmowa dźwigni `force_invasion` widoczna tylko w konsoli

`WarOverlay → force_invasion` (`WarOverlay.js:719-733`) przy odmowie `launchInvasion` pisze wyłącznie `console.warn`
(`:729`) — gracz nie widzi ani powodu, ani tego, że desant się nie odbył `[code]`. Od G2-2 typowym powodem jest
`not_at_war`: rekord wojny może być aktywny przy statusie relacji innym niż `'war'` („wojna bez wojny”, **287**).
Dźwignia debugowa, ale stoi na niej GATE 1 AI_CAPTURE. Znalezione w sesji G2-2, nienaprawione. Bez przypisanego kroku.

### ✅ 353 — zabranie wojsk z cudzego ciała: UI zgłasza sukces, jednostki zostają na ziemi — ZAMKNIĘTY 2026-10-04 (`8c82cf7`, G2-4/C3)

Bramka live: dwa `shock_infantry` gracza na `entity_12` — po załadunku UI zgłosiło sukces, a jednostki zostały na ziemi
`[doc: bramka G2-2]`. `loadGroundUnit` (`Vessel.js:692-718`) zmienia wyłącznie `status` (→ `'in_cargo'`),
`transportStatus` i listę ładowni; `getUnitsOnPlanet` ukrywa jednostkę po `status === 'in_cargo'`
(`GroundUnitManager.js:277-283`) `[code]`.
**Kandydat mechanizmu — zmierzony headless, NIEPOTWIERDZONY na scenie bramki:** `_tickGroundUnitUpkeep` przy
nieopłaconym utrzymaniu nadpisuje `u.status = 'offline'` każdej jednostce gracza, także w ładowni
(`ColonyManager.js:1561`), a przy wznowieniu — `'idle'` (`:1557`) ⇒ jednostka wraca „na ziemię” (widoczna
w `getUnitsOnPlanet`), choć nadal jest na liście ładowni. Sonda poza repo (jednostka gracza na kolonii AI z 0 Kr,
załadowana): civY 1 — `offline`, widoczna na ciele i na liście ładowni; civY 5 — rozwiązana `[measured]`. Ten sam
płatnik co **354**. Pełne prześledzenie → audyt **G2-4**: wycofanie po pokoju (**D14**) wymaga zabrania wojsk z cudzego
ciała.
**Zamknięcie** (na `1fefcdc`): mechanizm potwierdzony w audycie G2-4 — utrzymanie nadpisywało `in_cargo`. **R6**: w ładowni
brak żołdu jedzie w `prevStatus`, a wznowienie też tam (`ColonyManager.js:1559-1570`) `[code]`; płatnik — **354**. Keeper
`g2_after_peace_smoke` A5 `[doc: notatka G2-4]`; bramka: po miesiącu i po trzech `in_cargo`, flaga `null`, nie na ciele,
`unpaidYears` 0 `[doc: bramka G2-4]`. ⚠ Załadunek na bramce szedł konsolą (`loadGroundUnit`), nie oknem ładowni.

### ✅ 354 — jednostki postawione `debug.spawnMyUnit` rozwiązane „no upkeep” po ok. pół roku (rodzina 329) — ZAMKNIĘTY 2026-10-04 dla jednostek gracza (`8c82cf7`, G2-4/C3); reszta rodziny 329 → G1c

Bramka live: te same dwa `shock_infantry` rozwiązane po ok. sześciu miesiącach, w Dzienniku dwa razy „Unit Shock Inf.
disbanded (no upkeep)” `[doc: bramka G2-2]` — przy okazji potwierdzenie w przeglądarce wpisu Dziennika o rozwiązaniu
z G1b (S3, **312**). Mechanizm `[code]`: `debug.spawnMyUnit` (`GameScene.js:1327-1335`) tworzy jednostkę ścieżką fabryki,
która nie ustawia `homeColonyId` (zero wystąpień w `GroundUnitFactory.js`), a płatnik utrzymania to
`u.homeColonyId ?? u.planetId` (`ColonyManager.js:1529`) ⇒ jednostce stojącej na ciele AI płaci kolonia AI.
Zmierzone headless `[measured]`: kolonia AI z kredytami **płaci** utrzymanie jednostki gracza (1000 → 952 Kr w 12 civY);
przy 0 Kr — `offline` w 1. civY, rozwiązanie w 5. (`UPKEEP_GRACE_CIVYEARS = 5`, `ColonyManager.js:1309`; 5 civY =
5 wyświetlanych miesięcy — zgodne z „ok. sześciu”). Rodzina **329** (płatnik bez terminu właściciela, krok **G1c**);
wejście z debugowego spawnu, ale ten sam fallback dotyczy każdej jednostki bez `homeColonyId`.
**Zamknięcie** (na `1fefcdc`): **R6** — NEW `_groundUnitPayerId` (`ColonyManager.js:1606`, użycie `:1529`): żołd jednostki
GRACZA płaci jej kolonia macierzysta, jeśli należy do gracza, inaczej kolonia macierzysta gracza — nigdy kolonia innego
właściciela `[code]`. Keeper A5 `[doc: notatka G2-4]`; bramka: `unpaidYears` 0 po trzech miesiącach `[doc: bramka G2-4]`.
Jednostki imperiów i zwrot POP przy rozwiązaniu — bez zmian (**329**, G1c).

### ⚪ 355 — mapa kolonii cudzego ciała otwiera się z dużym opóźnieniem przy wejściu w tryb zrzutu (obserwacja)

Bramka live `[doc: bramka G2-2]`. Hipoteza „przyczyną jest nieudane ładowanie `_biome.png` (**345**)” — **wykluczona
w kodzie**: `_loadBiomeMap` (`ColonyOverlay.js:5663-5687`) jest asynchroniczne (`Image` z `onload`/`onerror`),
`onerror` jest pusty, a żadna ścieżka rysowania na nie nie czeka — wołające (`:553`, `:575`, `:595`) zwracają siatkę od
razu `[code]`. Przyczyna niezmierzona; kandydaci do pomiaru, bez dowodu: tworzenie globusa panelu informacji (kontekst
WebGL niszczony przy każdym zamknięciu panelu, rodzina **V-252**), generowanie siatki ciała bez siatki w cache. Bez
przypisanego kroku.
**Rozszerzenie 2026-10-03 (bramka G2-3b, §5o):** żądanie `_biome.png` kończy się widocznym `GET 404`
(`ColonyOverlay._loadBiomeMap:5687`) — asynchronicznie, więc zgodnie z wykluczeniem hipotezy **345** nic na nie nie czeka;
przyczyna opóźnienia dalej niezmierzona `[doc: bramka G2-3b]`.

### ⚪ 356 — okno ładowni pokazuje „undefined” jako nazwę łazika badawczego

`CargoLoadModal.js:328`: `const name = arc?.descriptionPL?.split('.')[0] ?? unit.archetypeId` — jednostka legacy
(`science_rover` ze ścieżki legacy `createUnit`, bez `archetypeId`) nie ma wpisu w `UNIT_ARCHETYPES`, więc wiersz brzmi
„undefined (x/y HP)” `[code]`; bramka live `[doc: bramka G2-2]`. Bliźniak w `ColonyOverlay.js:3339` ma dodatkowy
fallback `?? u.type`, okno ładowni go nie ma. Archetypy dostają pierwsze zdanie `descriptionPL` — po polsku także
w grze EN (klasa **113**). Bez przypisanego kroku.

### ⚪ 357 — dymek ciała na mapie 3D pisze „Player Empire” przy KAŻDEJ kolonii, także wroga, i pokazuje jej populację

`TooltipContent._planetContent` (`TooltipContent.js:147-155`): gdy ciało ma kolonię, właściciel to zawsze
`t('tooltip.empire.player')`; komentarz `:148` „colony zawsze player (gracz zarządza własnymi koloniami)” był prawdą
sprzed W3-1 — od W3-1 kolonie AI żyją w `ColonyManager`; kod od `670d027` (M3 P1.5) `[code]` `[git]`. Bramka live:
ciało wroga testowego z etykietą „player empire” `[doc: bramka G2-2]`. Ten sam blok pokazuje populację kolonii (`:151-154`)
bez mgły wojny — kanon `SystemReveal` (**188**) odsłania tożsamość właściciela od `contact`, populację od `detailed`.
Naprawa nie jest jednolinijkowa (mgła wojny). Bez przypisanego kroku.

### ✅ 358 — los jednostki GRACZA na ciele zniszczonym albo oddanym AI — ZAMKNIĘTY 2026-10-04 (`1a41c62` + `39c9227`, G2-4/C2 + C4)

`GarrisonSystem` usuwa wyłącznie jednostki imperiów AI: `removeOnOwnerChange` odrzuca `previousOwner === 'player'`
(`GarrisonSystem.js:179`), a `removeOnBodyDestroyed` filtruje `u.owner !== 'player'` (`:190`) `[code]`. Zmierzone w sesji
G2-3b `[doc: raport G2-3b]`: **ciało zniszczone** — jednostka zostaje w rejestrze na nieistniejącym ciele, dom płaci jej
utrzymanie (4 Kr w 10 civY), 4 POP zablokowane na zawsze; **cesja gracz→AI** — jednostki zostają na ciele AI, w rozejmie
odbijają 2 kafle (rodzina **348**), a utrzymanie płaci kolonia, która jest już AI (60,13 Kr w 10 civY; rodzina **354**).
Decyzja właściciela 2026-10-03 (§5p (b)): zniszczenie → jednostka usuwana, POP do domu w całości (do G1c); cesja → flaga
wycofania D14. Kroki **R7** i **R3** w G2-4.
**Zamknięcie** (na `1fefcdc`): **R3** — flaga wycofania przy pokoju, także na ciele oddanym w cesji (cesja wykonuje się
przed `diplomacy:peaceSigned`; `WithdrawalSystem.js:68`); **R7** — `GarrisonSystem.removeOnBodyDestroyed` (`:198`) usuwa
jednostki gracza na zniszczonym ciele z pełnym zwrotem POP (`:207`), ciało bez kolonii przez `entity:removed` (`:69`)
`[code]`. Keepery A7 (cesja), A8, A8d–A8g (zniszczenie) `[doc: notatka G2-4]`; bramka: flagi na Thuban d i e, usunięcie
w terminie — silnik PASS `[doc: bramka G2-4]`; R7 niećwiczone na żywo. Zostaje: łazik zwiadu (**365**), stare zapisy
(**366**), cisza R4 i R7 (**367**).

### ✅ 359 — licznik okupacji biegnie na heksie, na którym stoi żywy wróg — ZAMKNIĘTY 2026-10-04 (`cd1fc46`, G2-4/C1b)

`_tickOccupation` (`GroundUnitManager.js:616-665`) liczy postęp okupacji kafla z budynkiem, nie sprawdzając, czy na tym
heksie żyje jednostka innej strony; obrońca stojący na własnym kaflu jest pomijany (`tileOwner === owner`, `:632`), więc
licznikowi nie przeszkadza `[code]`. Kolonie gracza zachowywały się tak zawsze; stempel C-S3 (**318**) wyrównał do tego
kolonie AI — przed stemplem kafel stolicy AI z obrońcą nie przechodził przez 12 civY, po stemplu przechodzi w 7. civY,
tak samo jak bez obrońcy `[doc: raport G2-3b]`. Decyzja właściciela 2026-10-03 (§5p (c)): licznik ma stać, dla obu stron —
**R2** w G2-4.
**Zamknięcie** (na `1fefcdc`): **R2** — `_hexHasLivingEnemy` (`GroundUnitManager.js:327`); licznik stoi na heksie z żywym
wrogiem (`:666`), pusty kafel nie przechodzi (`:721`) `[code]`. Keeper `g2_after_peace_smoke` A3; `g2_mobilisation_smoke`
M9c odwrócony świadomie `[doc: notatka G2-4]`. Bramka: niećwiczone osobno na żywo.

### ⚪ 360 — imperium bez pełnej kolonii w chwili wybuchu wojny mobilizuje się dopiero przy następnej wojnie albo wczytaniu (→ G3)

`mobilizeEmpire` bez stolicy emituje `garrison:mobilizeSkipped` z `no_capital` i nie ustawia flagi
(`GarrisonSystem.js:128-133`), a uzgodnienie biegnie raz, na pierwszym ticku (`_firstTick`, `:209-214`) `[code]`. Tak samo
status `'war'` ustawiony w trakcie sesji bez zdarzenia (konsola) — złapie go dopiero następne wczytanie
`[doc: raport G2-3b]`. Propozycja z raportu: uzgadnianie także na `colony:captured`. Decyzja właściciela 2026-10-03
(§5p (d)): **uzgadnianie co rok** zamiast wyłącznie na pierwszym ticku — krok **G3**.

### ⚪ 361 — martwe pole `rocket_artillery.terrainModifiers`

`terrainModifiers: { forest: 2, mountains: Infinity }` (`unitArchetypes.js:72`) nie ma czytelników — `grep` w `src/` zwraca
wyłącznie deklaracje w pliku danych (`:11`, `:46`, `:72`, `:107`, `:136`, `:163`, `:189`, `:218`) `[code]`. Planer garnizonu
stawia więc artylerię także na górach — w fixture GATE-S4 emp_001 heks (0,2) `[doc: raport G2-3b]`. Bez przypisanego kroku.

### ⚪ 362 — kopia przedimportowa nie mieści się przy dużym zapisie, a gracz o tym nie wie (obserwacja z bramki G2-3b)

Bramka (§5o): `[SaveSystem] kopia przedimportowa się nie zmieściła — import wykonany bez niej` (`SaveSystem.js:464`)
`[doc: bramka G2-3b]`. **To zachowanie zaprojektowane** (`W2_GATE1_CHECKLIST.md` §„Cykl życia”): import zapisuje slot
najpierw (`:449-456`), a kopię poprzedniej treści slotu — po fakcie, best-effort (`:462-465`) `[code]`.
**Pomiar (sesja zamykająca G2-3b)** `[measured]` — prawdziwy `SaveSystem.save()`, `json.length` w znakach:

| źródło | gy | znaki | UTF-16 |
|---|---|---|---|
| uprząż (`bootWithDirector`, ziarno domyślne) | 0 · 20 · 40 · 60 · 100 | 0,50 · 0,91 · 0,91 · 0,97 · 0,97 mln | 0,99 · 1,82 · 1,83 · 1,94 · 1,94 MiB |
| fixture GATE-S4 (22 kolonie) | 60,12 | **2,09 mln** | **3,99 MiB** |

**Limit** `[doc: CLAUDE.md §„Strategia zapisu”, komentarz SaveSystem.js:133-134]`: 10 MiB na origin liczone w UTF-16,
czyli ok. **5,24 mln znaków na WSZYSTKIE klucze razem**; Chromium sprawdza quotę tylko wtedy, gdy element rośnie. Kopia
przedimportowa to DRUGA pełna kopia obok slotu ⇒ nie mieści się, gdy slot + poprzedni zapis + reszta kluczy > ok. 5,24 mln
znaków, czyli dla dwóch podobnych zapisów **od ok. 2,6 mln znaków każdy**. Fixture przy gy 60 stoi na 80 % tego progu;
zapis z bramki (gy ok. 119,6; 20 kolonii samego emp_001; garnizony 20 + 9 jednostek) przekroczył go — rozmiaru tego zapisu
nie mierzyłem (odczyt w przeglądarce: `KOSMOS.debug.storageReport()`).
**Gdy nie mieści się zwykły zapis** (`save()`, `:106-130`) `[code]`: usunięcie backupów migracji → ponowienie → usunięcie
kopii przedimportowej → ponowienie; dalej brak miejsca — `game:saveFailed` z `reason: 'quota'` → toast (nie częściej niż raz
na 25 lat gry, `UIManager.js:83`, `:1846-1857`) i wpis w Dzienniku; slot zachowuje POPRZEDNI zapis (`setItem` jest atomowy).
Ostrzeżenie `game:saveLargeWarning` od 3,5 mln znaków (`:136-138`).
⚠ **Luka:** między ok. 2,6 a 3,5 mln znaków kopia przedimportowa już się nie mieści, a ostrzeżenie o dużym zapisie jeszcze
milczy — jedynym śladem jest `console.warn`. Gwarantowaną ścieżką ratunkową jest plik `.json` (menu ☰). Bez przypisanego
kroku.

### 🟠 363 — pokój nie cofa okupacji kafli, a nowa wojna daje przejęcie kolonii AI bez jednej jednostki (→ F1)

Pokój nie rusza `tile.owner` ani liczników okupacji (`occupyEmpireId`/`occupyStart`) — `WithdrawalSystem.onPeaceSigned`
(`WithdrawalSystem.js:68`) flaguje jednostki i zdejmuje jednostki AI, kafli nie dotyka; **R1** zakazuje ich odbicia w pokoju
(`GroundUnitManager.js:657`) `[code]`. `_tryPlayerCapture` (`InvasionSystem.js:386-405`) wymaga wojny, braku żywego obrońcy
i `holdsDecisiveGround` (`:451`) — **nie wymaga żywej jednostki zdobywcy** `[code]`. Zmierzone na stanie skonstruowanym: kafel
stolicy AI = gracz, zero jednostek na ciele, wypowiedzenie wojny → przejęcie w 1. civY bez wojsk `[doc: notatka G2-4]`.
Kafel stolicy przechodzi na gracza wyłącznie okupacją w wojnie (6 civY stania na kaflu z budynkiem). Osiągalność stanu
wyjściowego w grze niezmierzona. Decyzja właściciela (§5s (2)): **F1**.

### 🟠 364 — ostrzał z orbity bez bramki wojny (→ F2)

Dostępność akcji `orbital_strike` (`FleetActions.js:575-598`) sprawdza orbitę, baterię, amunicję, cooldown i dominację
orbitalną; żądanie ostrzału w `ColonyOverlay` (`:253-273`) — amunicję i dominację; strażnik silnika `_onOrbitalStrike`
(`GroundUnitManager.js:51`) — nic `[code]`. `WarSystem.playerHasOrbitalDominance` (`WarSystem.js:982-990`) zwraca `true`
w pokoju (brak kontrolera, brak floty wroga) `[code]` ⇒ ostrzał ciała AI przechodzi w pokoju; silnik zniszczył jednostkę
garnizonu w pokoju `[doc: notatka G2-4]`. Bliźniak bramki desantu D13 (`ColonyOverlay.js:320`), którego tu zabrakło.
Decyzja właściciela (§5s (3)): **F2**.

### ⚪ 365 — łazik zwiadu usunięty w terminie (R3) albo razem z ciałem (R7) zostawia `vessel.awayTeamUnitId`

Usunięcie jednostki przez `WithdrawalSystem` (termin) albo `GarrisonSystem.removeOnBodyDestroyed` (R7) nie czyści
`vessel.awayTeamUnitId`, które ustawia `VesselManager.deployAwayTeam` (`VesselManager.js:1370`), a zeruje wyłącznie
„Zbierz” (`:1391`) `[code]`. Zmierzone: łazika nie ma, pole wskazuje `gu_1` `[doc: notatka G2-4]`. „Zbierz” zostaje
aktywne, a „Powrót” blokuje „najpierw zbierz” (`FleetActions.js:331`) `[code]`. Obejście: kliknąć „Zbierz”. Bez decyzji.

### ⚪ 366 — jednostki gracza stojące już w pokoju na ciele innego imperium (zapisy sprzed G2-4) nigdy nie dostają flagi (→ F3)

Flagę wycofania stawia wyłącznie `diplomacy:peaceSigned` (`WithdrawalSystem.js:43`) `[code]`; zapis sprzed G2-4 z jednostkami
gracza na ciele AI w pokoju (rozejm, NAP) wczytuje się bez flagi, a R1 trzyma je tam bez walki i bez terminu, na zawsze.
Decyzja właściciela (§5s (4)): **F3**.

### ⚪ 367 — usunięcia R4 (jednostki AI przy pokoju) i R7 (jednostka gracza razem z ciałem) są ciche — tylko audyt (→ F4)

`withdrawal:aiRemoved` (`WithdrawalSystem.js:89`) i `garrison:unitsRemoved` (`GarrisonSystem.js` — `_removeUnits`) trafiają
wyłącznie do `DebugLog`; `NotificationCenter` subskrybuje z rodziny wycofania tylko `ordered`, `warning` i `expired`
(`NotificationCenter.js:70-72`) `[code]`. Gracz nie dowiaduje się, że wojska AI zeszły z jego kolonii ani że jego oddział
zginął razem z ciałem. Decyzja właściciela (§5s (5)): **F4**.

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
