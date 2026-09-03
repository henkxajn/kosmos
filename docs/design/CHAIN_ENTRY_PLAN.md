# WEJŚCIE DO ŁAŃCUCHA — bramka zamożności tier 3+ (Finding 246). **POMIAR PODPISANY, WDROŻENIE NIE**

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

### 5.3 ⚠ WETO — cztery liczby kontrolne `d44af5e` (z treści commita, panel 16 ziaren, ~45 gy)

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
