# WEJŚCIE DO ŁAŃCUCHA — bramka zamożności tier 3+ (Finding 246). **E3H WDROŻONY, LIVE-GATE PASS — ARC ZAMKNIĘTY**

> ✅ **2026-09-03:** podpisany kształt **E3H** wdrożony (`d284765`, flaga `aiTier3ScaledEntry`, ON), keeper **25/25** (fail-first 16/24), sweep **204/204**, live-gate **PASS A-E** na fixturze `GATE-S4-fresh-gy60` — wynik i dowody: **`CHAIN_ENTRY_GATE_CHECKLIST.md` §Wynik**. Finding 246 ZAMKNIĘTY; **247 zostaje otwarty z projektu**.

> Slice przekrojowy. Rejestr macierzysty findingów: `VESSEL_ORDERS_PLAN.md` §**246-251**.
> Poprzednicy w rodzinie: `FE_SUPPLY_PLAN.md` (§14 — łuk głodowy) · `NT_LINK_PLAN.md` (§6 — tabela 241).
> Save **v101, bez migracji** (pomiar niczego nie zapisuje).
>
> **Status:** ⚠ **PODPISANY JEST WYŁĄCZNIE POMIAR.** Żaden wariant bramki nie jest podpisany do
> wdrożenia — rozstrzyga tabela. Warianty realizowane jako **monkeypatch w sondzie**, `src/` nietknięty.

---

## 0. Reguła wejścia — WYKONANA

Keepery **PRZED** czytaniem czegokolwiek: sweep **203/203 OK, 0 FAIL, 27 advisory**.

`git log -S` na progowych rudach bramki i na konsumentach modułu warp:

| zapytanie | wynik |
|---|---|
| `WEALTH_THRESHOLD`, `WEALTH_ORES` | **JEDEN commit: `d44af5e`** (2026-08-28) — *„balance(ai): cel zapasu tier 3+ = 50 z bramka zamoznosci (Finding 182, plan podpisany)"*. Nigdzie indziej w historii. |
| `_syncTier3SafetyDemand` | `d44af5e` (źródło) + `d3b8e61`, `c73ab33` (obie z 217 — księga popytu zamówieniowego) |
| `startingSafetyStocks` | `0acd7d9`/`42297cc` (2026-05-23, Slice 1 Faza 1) → `d44af5e` → `d3b8e61` |
| `engine_warp` (szablony + moduły) | `090209a` (2026-03-26 reforma ekonomii, warp mid-game) · `19d3753` (2026-06-02 model dwu-bakowy, save v82) · `4755f19` (2026-08-11 katalog szablonów Directora) · `0e6ea0d` (2026-08-19 rola transportowa, Finding 49) |
| `warpFuelPerLY` | `19d3753` · `448e2b6` · `6b8f22b` · `5009d41` |
| `warp_cores` w `BuildingsData` | `6ffd69f` (2026-03-18) — **od tamtej pory nietknięte** |

---

## 1. ⚠ CO REGUŁA WEJŚCIA ZMIENIŁA W RAMIE ZLECENIA

Rozłączność rud bramki (`Fe/Si/Cu/C`) z wsadem receptur łańcucha (`Si/Nt/Hv/Xe/Ti/Li`; `warp_cores`
dokłada `Ti`) **NIE JEST przeoczeniem**. `d44af5e` argumentuje ją w treści commita, dosłownie:

> *„Zamoznosc mierzymy wiec rudami POSPOLITYMI (Fe/Si/Cu/C, kazda >= 20k), a rud rzadkich NIE
> bramkujemy — to one sa wsadem receptur, wiec warunek »produkuj dopiero, gdy masz duzo tego, co
> receptura zjada« bylby cykliczny."*

⚠ **I ten argument jest POPRAWNY — dla predykatu, który odrzucił.** Bramkowanie na **ilości zapasu**
wsadu receptury jest cykliczne. Ale `_colonyCanSustainRecipe` (`FactorySystem:2040`) pyta o co innego:
*„czy istnieje ŹRÓDŁO"* — `stock > 0` **lub** `_inventoryPerYear > 0`, z rekurencją w podreceptury.
To **NIE JEST** predykat odrzucony w `d44af5e`. Każdy plan wariantu E2 musi to powiedzieć wprost,
inaczej czyta się jako re-litygację podpisanej decyzji.

**Defektem nie jest rozłączność — defektem jest SKUTEK** (Finding 246): archetyp, któremu
`warp_cores` udostępniono ŚWIADOMIE (`EmpireArchetypeExpansionist:47-54` — bo ma `fusion_power`
w kolejce badań), jest tym, którego bramka **nie wpuszcza nigdy**.

---

## 2. DECYZJE WŁAŚCICIELA (2026-09-03)

| id | decyzja | waga |
|---|---|---|
| **D-CE-0** | **Część 2 (konsumpcja) = STATUS QUO.** Łańcuch warp AI jest **rezerwą gotowości**: gromadzi do sufitu i konwertuje **pod naciskiem gracza**. Obie gałęzie „tak" (rywalizacja AI-vs-AI; doktryna patrolowa + zdjęcie odporności paliwowej warpu) → **backlog strategiczny, JEDEN nazwany duży slot obok GROUND**, z inwentarzem konsumentów (§4 tego planu / Finding 247) jako materiałem wyjściowym. | **PODPISANE** |
| **D-CE-1** | ⚠ **D-CE-0 NADAJE 246 ZNACZENIE**: skoro konwersja następuje pod naciskiem, to **wejście do łańcucha = zdolność ODPOWIEDZI na nacisk eskortą warp**. Imperium za zamkniętą bramką nie ma czym odpowiedzieć — i to jest cena bramki, nie „wolniejszy rozwój". | **PODPISANE** |
| **D-CE-2** | Pomiar wariantów **E0/E1/E2-hysteretic/E3/E4**, **obie osie zmienności**, cztery liczby kontrolne `d44af5e` jako **WETO**, flip-count jako metryka E2, falsyfikatory jak w §6, **jeden wariant = jeden proces**, keepery pierwsze. | **PODPISANE** |
| **D-CE-3** | **E3 (skalowane cele) to KIERUNKOWE PRZECHYLENIE właściciela, NIE PODPIS** — „wygląda na kształt, który zachowuje podpisaną intencję i zdejmuje klif". **Rozstrzyga tabela.** | **LEAN, nie podpis** |
| **D-CE-4** | Żadne wdrożenie przed podpisem tabeli. Warianty = monkeypatch w sondzie. | **PODPISANE** |

---

## 3. PRE-CHECK — zmierzony PRZED projektem (bo każdy punkt zabija albo przebudowuje wariant)

### 3.1 Rodzina `any-K-of-4` jest na tym fixturze ZDEGENEROWANA

Stany rud w gy 100 (dwie galaktyki, `bootWithDirector`):

| imperium | Fe | Si | Cu | C | rud ≥ 20 k |
|---|---|---|---|---|---|
| emp_001 A (industrialist) | 31 290 | 47 617 | 29 089 | 40 910 | **4/4** |
| emp_001 B | 26 596 | 59 115 | 38 164 | 29 804 | **4/4** |
| emp_002 A (expansionist) | 5 607 | 76 754 | 4 931 | 74 288 | **2/4** |
| emp_002 B | 16 124 | 80 733 | 3 116 | 79 660 | **2/4** |

⇒ **K=3 to no-op, K=2 to „zawsze otwarte".** Brak wnętrza. E1 ma sens **wyłącznie** na panelu
16-ziarnowym; jeśli i tam nie da wnętrza — wypada z rodziny.

### 3.2 E2 jest OSTRZEM NOŻA i na galaktyce B strzela w ZŁĄ stronę

`_colonyCanSustainRecipe('warp_cores')` w gy 100:

| | bramka zamożności | `canSustain` | dzisiejsze WC |
|---|---|---|---|
| emp_001 A | **otwarta** | true | 23 |
| emp_001 B | **otwarta** | **false** | **10** |
| emp_002 A | zamknięta | **true** | 0 |
| emp_002 B | zamknięta | **true** | 0 |

⚠ Predykaty **nie zgadzają się na OBU imperiach na galaktyce B**. `canSustain` pada dla emp_001-B,
bo zapas `Nt` w stolicy wynosił akurat **dokładnie 0** — ruda dowożona kurierem **nie ma producenta
per-rok**, więc predykat przewraca się na pusty magazyn i wraca przy najbliższym rozładunku.
⇒ **W formie surowej E2 migotałby w kadencji kuriera i mógłby ZGASIĆ jedyny działający dziś łańcuch.**
Do pomiaru wchodzi **wyłącznie forma z histerezą**, a **flip-count jest jego metryką rozstrzygającą**.

### 3.3 E3 ma zmierzoną kotwicę

emp_002 stoi na **~25 %** progu na obu brakujących rudach (Fe, Cu), na obu galaktykach.
Skala liniowa daje mu cel ≈ `1 + 0,25 × 49 ≈ 13` rdzeni zamiast 1 — **wchodzi, powoli, proporcjonalnie
do tego, na co go stać.** To jest wariant najbliższy podpisanej intencji `d44af5e` (ubogi ⇒ mało FP)
przy zdjętym klifie.

---

## 4. WARIANTY — predykaty dosłowne

Wszystkie dotyczą **wyłącznie** `ColonyAutoExpander._syncTier3SafetyDemand` (`:806-823`).
AI-only z konstrukcji (`_managedColonies` filtruje `ownerEmpireId == null`; `:810` re-sprawdza).

| id | predykat | przewidywanie z §3 |
|---|---|---|
| **E0** | dziś: `Fe,Si,Cu,C` **wszystkie** ≥ 20 000 → bonus `target−1`, inaczej 0 | referencja |
| **E1** | **any-K-of-4** ≥ 20 000 (K = 2, 3) | K=3 no-op; K=2 ≈ zawsze otwarte |
| **E2** | `_colonyCanSustainRecipe(cid)` utrzymane przez **N kolejnych civYears** (histereza OBOWIĄZKOWA; N do zmierzenia, start N = 12 civY = 1 rok gry) | otwiera emp_002 zawsze; **ryzyko zgaszenia emp_001-B** |
| **E3** | skalowany: `bonus = round((target − 1) × min(1, wealthFrac))`, `wealthFrac = min_ores(stock / 20 000)` | emp_002 → cel ≈ 13; emp_001 bez zmian (50) |
| **E4** | **KONTROLA, nie kandydat**: cele zawsze włączone, brak bramki | odtwarza ramię odrzucone w `d44af5e` |

⚠ **E4 jest obowiązkowe.** E2 ląduje blisko niego, a panel musi pokazać, czy wraca koszt zmierzony
w 2026-08 (3/32 imperiów bez placówki, obsada 94 %). Bez E4 tabela nie ma dolnej kotwicy.

---

## 5. METRYKI — i co jest czym

### 5.1 Wejście (rzecz zmieniana)
Per archetyp × ziarno: **czy bramka się otwiera**, **w jakim gy**, i **czy zostaje otwarta** —
**licznik przejść otwarta→zamknięta w całym przebiegu**. To jest metryka rozstrzygająca dla E2.

### 5.2 Wyjście łańcucha
`quantum_cores` / `antimatter_cells` / `warp_cores` wyprodukowane; **czas do pierwszego `warp_core`**.

### 5.3 ⚠ WETO — **WYCOFANE 2026-09-03, ZASTĄPIONE PRZEZ §10.** Zachowane jako appendix

> ⚠ **Ta sekcja jest ZAPISEM HISTORYCZNYM, nie żywym kryterium.** Panel został uruchomiony i
> **nie odtworzył kolumny „z bramką"** — trzy z czterech liczb siedzą na suficie/podłodze i **nie
> różnicują wariantów**. Powód i pomiar: **§13 (appendix)**. Żywym wetem jest **§10 — konkurencja o FP**.

#### 5.3-hist (oryginalne brzmienie)

| metryka | baseline | cele BEZ bramki | z bramką (shipped) |
|---|---|---|---|
| imperia bez żadnej placówki | 1/32 | **3/32** | 1/32 |
| obsada etatów (ludzie+droidy / etaty) | 97 % | **94 %** | 99 % |
| nieobsadzone etaty AI (mediana) | 4 | **6,5** | 1,5 |
| naruszenia progów | 83/192 | 84/192 | 82/192 |

**Wariant, który przesuwa KTÓRĄKOLWIEK z tych czterech w stronę kolumny „bez bramki", PADA —
niezależnie od wyjścia łańcucha.** Spalanie FP mierzymy **przez nie**, tak jak `d44af5e`: surowy
licznik „FP wydane na tier 3+" jest miłym dodatkiem, nie kryterium — kryterium jest **szkoda**
(nieobsadzone etaty, zdławiona ekspansja), nie wydatek.

⚠ **Zysk też trzeba utrzymać** (druga połowa `d44af5e`): `plasma_cores` 0→50, `quantum_cores` 0→17,
`quantum_processors` 0→30, sztuk towarów u bogatego 552→627.

### 5.4 Strona gracza
Żaden wariant nie dotyka kolonii gracza **z konstrukcji**. ⚠ Mimo to: pin na guardzie
(`ownerEmpireId`) **plus** odczyt `getSafetyStockTarget` dla domu gracza przed/po. Gracz w harnessie
jest pasywny, więc obserwacyjne „bez zmian" jest **słabym** dowodem i tak ma być zapisane.

---

## 6. PROTOKÓŁ — obie osie, bo mierzą co innego

| oś | instrument | co zmienia | po co |
|---|---|---|---|
| **Panel parytetu `d44af5e`** | `balans-driver.runOneGame` (jak `balans-ai-telemetry.mjs`), **16 strumieni PRNG**, `aiEmpires: true`, **45 gy**, galaktyka **PRZYPIĘTA** (`runOneGame:59` wymusza `HEADLESS_GALAXY_SEED`) | strumień PRNG | **cztery liczby weta** — porównywalność z decyzją, którą rewidujemy |
| **Panel łańcucha** | `bootWithDirector`, **2 galaktyki × 100 gy** | **galaktykę** (inna oś!) | wyjście łańcucha — na 45 gy **WC jeszcze nie istnieje** (start ~gy 50) |

⚠ **To są RÓŻNE osie zmienności i tabela musi je rozdzielić.** 16 „ziaren" `d44af5e` to 16 strumieni
PRNG na **jednej** galaktyce; moje dwie galaktyki to zmienność **silniejsza**. Wniosek z jednej osi
nie przenosi się na drugą bez powiedzenia tego wprost.

**Reszta protokołu:** jeden wariant = **jeden proces** (Finding 228) · keepery zielone **przed**
czytaniem · sonda w scratchpadzie, `src/` nietknięty · odczyt zwrotny każdego override'u
produkcyjnym akcesorem (`getSafetyStockTarget`), zanim policzymy cokolwiek
([[probe-overrides-need-readback]]).

---

## 7. FALSYFIKATORY — nazwane PRZED przebiegiem

* **E1/E2/E3 padają**, jeśli którakolwiek z czterech liczb `d44af5e` cofa się ku kolumnie „bez bramki".
* **E2 pada**, jeśli w formie z histerezą licznik przejść otwarta→zamknięta jest **> 0**, albo jeśli
  emp_001-B traci swój łańcuch.
* **E3 pada**, jeśli skalowany cel daje ten sam wzorzec „wchodzi i staje" co E4 — czyli jeśli
  **wejście częściowe jest gorsze niż brak wejścia**.
* **WSZYSTKIE padają razem**, jeśli wyjście łańcucha się nie zmienia: sufit z Findingu 247 ogranicza
  z góry to, co wejście może kupić.
* ⚠ **Falsyfikator instrumentu:** jeśli panel 16-ziarnowy nie odtwarza kolumny „z bramką" dla E0
  (1/32 · 99 % · 1,5 · 82/192) **w granicach szumu**, tabela mierzy inny świat niż `d44af5e`
  i nie wolno jej użyć do rewizji tamtej decyzji. **Ten przebieg jest pierwszy.**

---

## 8. GRANICE DOWODU (zapisane z góry)

* Pomiar **nie widzi okrętów wojennych**: `runOneGame` nie montuje Directora, a w `bootWithDirector`
  gracz jest pasywny ⇒ `armedPlayerVesselsInBorderZone` = 0 ⇒ zero zamówień. Po **D-CE-0** to jest
  akceptowane: mierzymy **gotowość** (zapas), nie konwersję.
* n = 2 galaktyki + 16 strumieni na jednej. To nie jest panel 16 galaktyk.
* Warianty to **modele naprawy** (monkeypatch), nie naprawa.
* ⚠ `_colonyCanSustainRecipe` ma w E2 **inne zastosowanie** niż w produkcji (tam: przycinanie
  alokacji, `FactorySystem:955/959/1300/1408/1521`). Wariant NIE zmienia tamtych call-site'ów.

---

## 9. NASTĘPNE (po tabeli, nie wcześniej)

Podpis wariantu → keeper fail-first → wdrożenie za flagą → live-gate. Nic z tego nie jest dziś
podpisane. Slot backlogowy z **D-CE-0** (rywalizacja AI-vs-AI + doktryna patrolowa) jest **osobny**
i nie wchodzi do tego slice'u.

---

## 10. WETO ŻYWE — KONKURENCJA O FP (zastępuje §5.3)

**Kanał szkody, którego `d44af5e` naprawdę się bało**, mierzony wprost: punkty fabryczne przydzielone
towarom **tier 3+** wobec punktów przydzielonych źródłom **build | consumption**, per kolonia AI,
uśrednione po wywołaniu alokatora. Instrument: opakowanie `FactorySystem._reactiveAllocate`, atrybucja
FP z `_allocations[].points` × `_reactiveDemand[].source`.

### 10.1 Kryterium szkody — **ustalone PRZED odczytem wariantów**, pasmo szumu z rozrzutu E0

Panel A (16 strumień, 45 gy, 50 442 wywołań alokatora, n=15 delt między seedami):

| wielkość E0 | średnia | sd | min | max | **pasmo** |
|---|---|---|---|---|---|
| **FP build\|consumption** | 0,12 | 0,01 | 0,10 | 0,14 | **[0,10 ; 0,14]** |
| **zdarzenia wyparcia / 1000 wywołań** | 0,06 | 0,13 | 0 | 0,32 | **[0 ; 0,32]** |
| FP tier 3+ | 0,55 | 0,14 | 0,31 | 0,72 | — |
| FP wolne (nieprzydzielone) | 3,68 | 0,26 | 3,18 | 4,02 | — |
| budżet wyczerpany | 6,2 % | 0,62 | 5,13 | 7,32 | — |

* **PADA**, jeśli FP na `build|consumption` spadnie **poniżej 0,10**.
* **PADA**, jeśli zdarzenia wyparcia przekroczą **0,32 / 1000 wywołań**.
  (*wyparcie* = w tym samym wywołaniu pozycja `build|consumption` dostała **0 FP**, a pozycja tier 3+ dostała **> 0**.)

⚠ **Moc tej kontroli jest OGRANICZONA i to jest zapisane z góry:** budżet FP jest wyczerpany tylko
w **6,2 %** wywołań, a **3,68 z 4,79 FP zostaje nieprzydzielone**. Wyparcie jest więc zjawiskiem
**rzadkim z konstrukcji** — kontrola wykrywa różnice rzędu ×20, ale nie rozstrzygnie różnic subtelnych.
⚠ Dodatkowo `_reactiveSourceOrder` stawia `safety` (źródło celów tier 3+) **za** `build`/`fuel`/`consumption`/
`trade`, więc wyparcie może zajść wyłącznie w wywołaniach z związanym budżetem.

### 10.2 Tabela (oś A — 16 strumieni, 45 gy)

| wariant | FP build\|cons | werdykt I | wyparć / 1k | werdykt II | FP tier 3+ | ekspansjonista WC |
|---|---|---|---|---|---|---|
| **E0** | 0,12 | pasmo | 0,06 | pasmo | 0,55 | **0** |
| **E3** | 0,11 | PASS | **1,78** | **FAIL** (5,6×) | 1,01 | 8 |
| **E4** | 0,11 | PASS | **1,89** | **FAIL** | 1,02 | 7 |
| **E3F** (podłoga) | 0,11 | PASS | **2,63** | **FAIL — najgorszy** | 0,97 | 8 |
| **E3H** (pasmo histerezy) | **0,12** | **PASS** | **0,08** | **PASS** | 0,94 | **7** |

⚠ **Oś B (2 galaktyki × 100 gy) NIE POTWIERDZA przewagi E3H na wyparciu**: E3 i E3H dają **identyczne**
liczby (11 / 0), E4 — 14 / 2, E0 — 0 / 0. Oś B ma ~10× mniej wywołań alokatora i n=2, więc **nie ma mocy**,
by różnicę rozstrzygnąć — ale **nie wolno twierdzić, że ją potwierdza**. Przewaga E3H jest ustalona
**wyłącznie na osi A**.

---

## 11. CHURN — amplituda, cena knobów, i **E3-final**

### 11.1 Zmierzona trajektoria celu (oś A, per para kolonia|towar)

| wariant | par | przejść przez zero | reakcji alokatora | amplituda min–max | średnia | próbek z zerem |
|---|---|---|---|---|---|---|
| **E0** | 75 | 129 (1,7/parę) | 18 (14 %) | 49–49 | 49 | 0,70 |
| **E3** | 568 | **3376 (5,9/parę)** | 153 (5 %) | **1–49** | 17,4 | 0,07 |
| **E3F** podłoga | 568 | 896 (1,6/parę) | 16 (2 %) | **2–49** | 16,9 | **0,00** |
| **E3H** pasmo | 456 | 880 (**1,9/parę**) | 38 (4 %) | **6–49** | 26,4 | 0,33 |
| **E4** | 568 | **0** | 0 | 49–49 | 49 | 0,00 |

**Źródło churnu E3 nazwane:** `Math.round((target − 1) × frac)` dla **małych `target`** (tier 3+ ma
pozycje o celu 3–10) zaokrągla się do **0 albo 1** przy ułamkowej zamożności ⇒ migotanie o amplitudzie 1.
Alokator **widzi tylko 2–14 %** przejść — reszta jest dla niego niewidoczna.

### 11.2 Wycena dwóch knobów — **podłoga PRZEGRYWA**

* **Podłoga `max(2, scaled)` (E3F)** — churn spada (3376 → 896) i znikają próbki zerowe (0,00),
  ale **wyparcie rośnie do 2,63/1k — GORZEJ niż samo E3 (1,78)**. Powód jest mechaniczny: podłoga trzyma
  popyt tier 3+ **na stałe włączony**, więc konkuruje w **każdym** wywołaniu ze związanym budżetem.
  Podłoga zamienia churn na **stałą konkurencję** i jest bliższa E4 niż intencji E3.
* **Pasmo histerezy na `wealthFrac` (E3H)** — churn 3376 → 880 (**1,9/parę ≈ E0 = 1,7**), minimalna
  amplituda niezerowa **1 → 6–8** (koniec migotania jednostkowego), a wyparcie **wraca do pasma E0**
  (0,08 wobec 0,06). Na osi B: przejść **3× mniej** (56/48 wobec 152/160), amplituda min **7–8** wobec 1,
  a **wyjście łańcucha bez zmian** (ekspansjonista WC 19/15 wobec E3 19/16).

⇒ **Zwycięzca: PASMO HISTEREZY.** Wchodzi do predykatu.

### 11.3 **E3-final — jeden kompletny kształt** (do podpisu; NIEWDROŻONE)

Zmiana wyłącznie w `ColonyAutoExpander._syncTier3SafetyDemand` (AI-only z konstrukcji).
Zatrzask **per kolonia**, cel **proporcjonalny**, podłoga **1** dopiero po otwarciu:

```
WEALTH_OPEN  = 0.20      // zatrzask OTWIERA sie, gdy min(stock(ore)/20000) >= 0.20
WEALTH_CLOSE = 0.12      // zatrzask ZAMYKA sie dopiero ponizej 0.12  (pasmo 8 pp)

frac = clamp(min over [Fe,Si,Cu,C] of stock/20000, 0, 1)
open = colony._tier3Latch                                  // stan per kolonia
if (!open  && frac >= WEALTH_OPEN)  open = true
if ( open  && frac <  WEALTH_CLOSE) open = false
colony._tier3Latch = open

for (cid, target) of archetype.startingSafetyStocks where COMMODITIES[cid].tier >= 3:
    bonus = open ? Math.max(1, Math.round((target - 1) * frac)) : 0
    factorySystem.setDemandBonus(cid, bonus)
```

⚠ **AKTUALIZACJA PO LIVE-GATE (2026-09-03): ramię ZAMYKAJĄCE zostało zaobserwowane na żywo** — dren `Fe` (Finding **220**) zabrał ekspansjoniście `frac` z 0,286 do 0, zatrzask przewrócił się **true → false** poniżej `WEALTH_CLOSE` w gy 66, cel wrócił do 1. Luka „histereza pasma nieprzetestowana na żywo" jest więc domknięta **CZĘŚCIOWO**: przejście było **w dół i jednorazowe**, a zachowanie „wraca w górę i NIE otwiera się aż do 0,20" pokrywa nadal **wyłącznie keeper T2**.

⚠ **Progi 0,20 / 0,12 są PROWIZORYCZNE i ich pochodzenie jest tu zapisane wprost:** wyprowadziłem je
z **pre-checku** (§3.3 — ekspansjonista operuje przy `frac ≈ 0,25 na obu galaktykach`), a **nie** z
trajektorii churnu. Pasmo leży więc **poniżej** punktu pracy ekspansjonisty: zatrzask otwiera się
u niego wcześnie i zostaje otwarty, a **własna histereza pasma nie została przetestowana na
imperium operującym W pasmie**. To jest nazwana luka, nie przeoczenie.
⚠ `_tier3Latch` jest stanem RUNTIME — jeśli ma przeżyć wczytanie zapisu, wymaga pola w serializacji
kolonii (a wtedy: migracja). Alternatywa: odbudować zatrzask z `frac` przy restore (fail-closed).
**Nierozstrzygnięte — do podpisu.**

---

## 12. LEDGER FALSYFIKATORÓW — stan po rundzie 2026-09-03

| falsyfikator (§7) | status | dowód |
|---|---|---|
| **falsyfikator instrumentu** — E0 nie odtwarza kolumny „z bramką" | 🔴 **ODPALIŁ** | 0/32 · 100 % · 0 · 96/192 wobec 1/32 · 99 % · 1,5 · 82/192. Panel §5.3 **wycofany** do appendixu §13; weto zastąpione (§10) |
| **E1/E2/E3 padają, jeśli cofną którąś z czterech liczb** | ⚪ **JAŁOWY** | żadna z czterech nie różnicuje wariantów — kontrola, która nie może paść, nie jest kontrolą |
| **E2 pada przy flip-count > 0 albo utracie łańcucha industrialisty** | 🔴 **ODPALIŁ (dwukrotnie)** | 88/68 przejść na boot mimo roku histerezy; industrialista WC 23→17 (gal. A) i 10→8 (gal. B), `targetWC` czyta **1** |
| **E3 pada, jeśli wejście częściowe jest gorsze niż brak wejścia** | ✅ **NIE ODPALIŁ** | ekspansjonista 0 → 8 (oś A) / 0 → 19,16 (oś B); industrialista **nie ucierpiał** |
| **NOWY (§10) — wyparcie build\|cons ponad pasmo E0** | 🔴 **ODPALIŁ dla E3, E3F, E4** | 1,78 · 2,63 · 1,89 wobec pasma [0 ; 0,32] |
| **NOWY (§10) — FP build\|cons poniżej 0,10** | ✅ **NIE ODPALIŁ dla żadnego** | 0,11–0,12 we wszystkich wariantach |
| **NOWY (§11) — E3H** | ✅ **CZYSTY na osi A** | wyparcie 0,08 (pasmo E0), churn 1,9/parę (≈ E0 1,7), łańcuch bez straty |

⚠ **Czego runda NIE rozstrzygnęła:** przewagi E3H na wyparciu **na osi B** (identyczne 11/0 z E3, n=2,
brak mocy) · zachowania pasma dla imperium operującego **wewnątrz** pasma · trwałości `_tier3Latch`
przez zapis.

---

## 13. APPENDIX — dlaczego stary panel umarł (zapis historyczny)

**Nie umarł naraz i nie cały.** Rozdzielenie, z liczbami:

1. **„naruszenia progów" były niemal jałowe JUŻ w `d44af5e`** — 83/192 wobec 82/192 to delta **1
   na 192** (0,5 %). Ta liczba nigdy nie niosła sygnału.
2. **Trzy pozostałe niosły sygnał w 2026-08 i stracły go później** (imperia bez placówki 1/32 vs 3/32;
   obsada 99 % vs 94 %; nieobsadzone 1,5 vs 6,5). Dziś: **0/32 · 100 % · 0** dla **każdego** wariantu,
   łącznie z E4 (bramka całkiem zdjęta). Odczyt spójny z liczbami (nie izolowany pomiar przyczynowy):
   **S1 `aiUniformStaffing`, S4a `aiLaborBudget` i 215** weszły PO `d44af5e` i celują dokładnie w obsadę
   i ekspansję — FE_SUPPLY §14 zmierzył obsadę farm 45 % → 100 % i samozwalniający się budżet pracy.
   FP wydane na tier 3+ nie przekłada się już na nieobsadzone etaty, bo pierwszy limituje **budżet pracy**.
3. **Sprawdzone, czy nie wystarczy trudniejszy świat:** panel `--class=POOR` (16 ziaren) zdejmuje metryki
   z sufitu (obsada 95 %, nieobsadzone 3,0), ale **dalej nie różnicuje**: E0 95 %/3,0 · E3 95 %/3,0 ·
   E4 95 %/**3,5**. Różnica ≤ 0,5 etatu przy n=16.
4. **Sam panel WARN jest skalibrowany do świata sprzed roku** (`d5d38bb`, 2026-08-05, **nigdy nie tknięty**)
   — szczegóły i konsekwencje: **Finding 252**.
