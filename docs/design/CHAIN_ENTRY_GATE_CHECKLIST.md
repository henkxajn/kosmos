# GATE — 246 / E3H: wejście do łańcucha tier 3+. **PROTOKÓŁ SPISANY PRZED PRZEBIEGIEM**

> Plan: `CHAIN_ENTRY_PLAN.md` (§11.3 — kształt, §10 — weto żywe, §12 — ledger).
> Flaga: **`FEATURES.aiTier3ScaledEntry`** (default **ON**; OFF = `d44af5e` co do bitu).
> Fixture: **`src/testing/fixtures/GATE-S4-fresh-gy60.save.json.gz`** (v101, gy 60,12, metryczka obok).
> Save **v101 bez migracji** — zatrzask `_tier3Latch` NIE jest serializowany (D-E3-2).
>
> ⚠ Ten plik powstał **PRZED** gate'em, zgodnie z lekcją `FE_SUPPLY_PLAN` §14.0: protokół, który
> żyje tylko w rozmowie, nie jest artefaktem.

---

## ⚠ KOREKTA OBSERWOWALNEGO — fixture zmienił rolę „kontroli"

Podpis mówił: *obserwowalne = cel WC emp_002 rośnie ponad 1, industrialista jako **nietknięta
kontrola***. **Odczyt fixture'u (sonda, nie przepisanie) tę drugą połowę OBALA:**

| stolica | `Fe` | `frac` | bramka `d44af5e` | cel WC przy OFF | **cel WC przy ON** |
|---|---|---|---|---|---|
| emp_001 `Propus b` (industrialist) | **14 046** | 0,702 | **ZAMKNIĘTA** | **1** | **35** |
| emp_002 `Regulus c` (expansionist) | **5 728** | 0,286 | **ZAMKNIĘTA** | **1** | **15** |

**Obie stolice mają dziś bramkę zamkniętą** — industrialista też, bo zdążył zjeść `Fe` z 20 034 do
14 046 (`FE_SUPPLY_PLAN.md` §14.3). ⇒ **Industrialista NIE JEST na tym fixturze kontrolą
nietkniętą.** Kontrolą jest **sama flaga** (round-trip OFF ↔ ON), a industrialista staje się
**drugim** obserwowalnym: 1 → 35.

⚠ To czyni gate **mocniejszym**, nie słabszym: pod OFF **oba** łańcuchy stoją na celu 1, pod ON
**oba** otwierają się proporcjonalnie — a różnica 35 vs 15 pokazuje, że cel jest proporcjonalny,
nie binarny.

---

## Kroki

**0. Warunki wstępne.** Sweep zielony (**204/204**), `check-i18n` PASS, `KOSMOS.debug` dostępny.
⚠ **CC nie pisze plików w trakcie gate'u** (Live Server → reload → reset runtime do ostatniego zapisu).

**1. Wczytaj fixture.** ☰ → wczytaj z pliku → `GATE-S4-fresh-gy60.save.json.gz` rozpakowany do
`.json` (albo oryginał z Downloads). Potwierdź: rok gry ≈ **60,1**, cywilizacja **„Pikaczu"**.

**2. Odczyt zerowy — flaga OFF.** W konsoli:
```js
KOSMOS.gameConfig?.FEATURES ?? GAME_CONFIG.FEATURES   // podgląd
```
jednolinijkowiec stanu (kopiuj w całości):
```js
(()=>{const reg=KOSMOS.empireRegistry;return reg.listAll().filter(e=>e.archetype).map(e=>{const cap=(reg.getColoniesByEmpire(e.id)||[]).find(c=>c&&!c.isOutpost&&c.resourceSystem);if(!cap)return{e:e.id,brak:1};const g=r=>Math.round(cap.resourceSystem.getAmount(r)||0);const frac=Math.min(1,Math.min(g('Fe'),g('Si'),g('Cu'),g('C'))/20000);return{emp:e.id,arch:e.archetype,frac:+frac.toFixed(3),latch:cap._tier3Latch,celWC:cap.factorySystem.getSafetyStockTarget('warp_cores'),QC:g('quantum_cores'),AC:g('antimatter_cells'),WC:g('warp_cores'),Nt:g('Nt'),Fe:g('Fe')}})})()
```
**PASS kroku:** oba imperia `celWC = 1`, `latch` **undefined**, `QC/AC/WC` bez wzrostu przez ≥ 5 lat gry.

**3. Restore fail-closed (D-E3-2).** Ten sam odczyt **zaraz po wczytaniu**, przed upływem roku:
`latch` musi być **undefined albo false** dla obu — nawet dla emp_001, którego `frac = 0,702`
leży **powyżej** progu otwarcia. Zatrzask ma się otworzyć **dopiero przy pierwszym przebiegu
ekspandera**, nie „z zapisu".
⚠ **Nie mylić z regresją:** otwarcie po pierwszym tiku jest POPRAWNE. Fail-closed dotyczy
**momentu wczytania**, nie następnej sekundy.

**4. Flip ON + przebieg.** Ustaw flagę na ON, puść **≥ 15 lat gry**.

**5. Obserwowalne — GŁÓWNE.** Ten sam jednolinijkowiec:
* **emp_002** (`Regulus c`): `celWC` **1 → 15**, `latch: true`, a następnie **pierwsza produkcja**
  `QC > 0` **i** `AC > 0` **i** `WC > 0` w stolicy, która trzyma **34 398 `Nt`** w placówkach
  i miała `QC/AC/WC = 0/0/0`.
* **emp_001** (`Propus b`): `celWC` **1 → 35** (proporcjonalnie do `frac = 0,702`), `WC` rośnie
  ponad 1.

**6. Kontrola — round-trip flagi.** OFF → odczyt → ON → odczyt. Przy OFF `celWC` wraca do **1**
dla obu (bramka `d44af5e` zamknięta przy `Fe < 20 000`). ⚠ `_tier3Latch` **zostaje** ustawiony na
obiekcie kolonii przy OFF (ścieżka OFF go nie czyta i nie czyści) — to **nie jest** wyciek: OFF
nie podejmuje na jego podstawie żadnej decyzji. Zweryfikowane headless: przy OFF `latch=undefined`
przez cały przebieg, bo ścieżka OFF nigdy go nie zapisuje.

**7. Gracz nietknięty.** Otwórz kolonię gracza, sprawdź w EconomyOverlay, że cele zapasu tier 3+
są **takie same** przed i po flipie. (Pin headless: keeper T5; tu potwierdzamy na żywym UI.)

**8. Higiena.** Brak błędów w konsoli; brak zalewu `setDemandBonus` w logach; FPS bez zmian.

---

## Kryteria PASS

| # | kryterium | dlaczego to, a nie coś innego |
|---|---|---|
| **A** | emp_002 `celWC` 1 → **15** i **pierwsze** `QC>0 ∧ AC>0 ∧ WC>0` | to jest cały Finding **246**: archetyp z warpem w kolejce badań **wchodzi do własnego łańcucha** |
| **B** | emp_001 `celWC` 1 → **35**, `WC` rośnie | cel jest **proporcjonalny**, nie binarny — 35 ≠ 15 ≠ 50 |
| **C** | przy OFF oba wracają do `celWC = 1` | rollback `d44af5e` **co do bitu** (keeper T4 + pomiar headless) |
| **D** | po wczytaniu `latch` **nie jest** otwarty mimo `frac > 0,20` | D-E3-2 na żywym silniku |
| **E** | kolonia gracza bez zmian po obu stronach flagi | AI-only nie tylko z konstrukcji, ale i obserwacyjnie |

⚠ **KONTROLA ANTY-WYCISZENIOWA:** kryterium A **nie może** być zaliczone samym wzrostem `celWC`.
Cel to intencja; **produktem jest `QC/AC/WC > 0`**. Bez tego zmierzylibyśmy, że „ekspander napisał
liczbę", a nie że „fabryka coś zrobiła" — dokładnie ta klasa błędu, którą złapał pomiar
`_executeTransfer` w Findingu **249** (1133 `Nt` „przeniesione", realnie 0,0).

---

## Co ten gate ŚWIADOMIE ZOSTAWIA

* **Korroboracja osi B** dla przewagi E3H na wyparciu FP — **odrzucona przez właściciela (D-E3-4)**;
  ten gate jest jej zamiennikiem.
* **Własna histereza pasma na żywym imperium operującym WEWNĄTRZ [0,12 ; 0,20]** — na tym fixturze
  nikt tam nie operuje (0,286 i 0,702). Pokrywa **wyłącznie** keeper T2 (fixture skonstruowany, D-E3-3).
* **Finding 247 zostaje otwarty z projektu** — sufit 50 jest sensem „rezerwy gotowości" (D-CE-0).
  Gate **nie** mierzy zużycia rdzeni; mierzy **wejście**.

---

# WYNIK — **PASS**, live, fixture `GATE-S4-fresh-gy60`, gy 60 → 75 (2026-09-03)

| # | kryterium | wynik |
|---|---|---|
| **A** | emp_002 `celWC` 1 → **12**, zatrzask otwarty ~**gy 62**, `QC/AC/WC` **0 → 3 / 1 / 7** z własnego `Nt` 156 | ✅ **PASS** — archetyp z warpem w kolejce badań **wszedł do własnego łańcucha**. Kontrola anty-wyciszeniowa spełniona: produktem jest `QC>0 ∧ AC>0 ∧ WC>0`, nie sam wzrost celu |
| **B** | emp_001 `celWC` śledzi `frac`: **36 → 32 → 26 → 21 → 19 → 14** | ✅ **PASS** — cel jest **proporcjonalny**, nie binarny (36 ≠ 15 ≠ 50) |
| **C** | rollback OFF = `d44af5e` co do bitu | ✅ **PASS — ale dowodem jest BAZA + keeper, NIE round-trip z gy 75** (patrz niżej) |
| **D** | po wczytaniu zatrzask nie otwarty mimo `frac = 0,702` | ✅ **PASS** — `latch undefined` po load, fail-closed na żywym silniku |
| **E** | kolonia gracza bez zmian po obu stronach flagi | ✅ **PASS** — cele tier 3+ gracza = 1, identycznie OFF i ON |
| — | higiena konsoli | ✅ czysto (wyłącznie 212 × 404 na brakujące pliki wideo — znany backlog) |

## ⚠ C — DOWÓD JEST Z BAZY I KEEPERA, NIE Z ROUND-TRIPU NA gy 75

**Na gy 75 oba stany flagi czytają `celWC` 14/1 IDENTYCZNIE. To NIE jest porażka rollbacku i nie
wolno tego tak odczytać później.** Mechanizm jest znany i zamierzony:

1. **emp_001** — zatrzask był już `true`. **Ścieżka OFF nigdy go nie czyta ani nie czyści**, a
   `getSafetyStockTarget` zwraca **ostatnio zapisany** bonus. Odczyt przy OFF pokazuje więc
   pozostałość po ON, nie decyzję ścieżki OFF.
2. **emp_002** — `frac` spadł do **0**, więc **obie** ścieżki mają bramkę zamkniętą (all-4 daje 0,
   pasmo poniżej `WEALTH_CLOSE` też). Stan zdegradowany nie różnicuje niczego.

**Rozdział OFF ↔ ON jest udokumentowany trzema niezależnymi dowodami:**

* **baza gy 60** (przed flipem): oba imperia `celWC` **1 / 1** przy `frac` 0,702 i 0,286 — czyli
  bramka `d44af5e` zamknięta dla obu; po ON: **36 / 12**;
* **keeper T4** (`ai_tier3_scaled_entry_smoke`): na TYM SAMYM stanie OFF daje 0, ON daje 34 —
  kontrola pinu, nie sama asercja „OFF = dziś";
* **tabela headless 100 gy** (produkcyjna ścieżka, nie atrapa): przy OFF `latch` jest **undefined
  przez cały przebieg** — ścieżka OFF nigdy nie zapisuje zatrzasku — a wynik to `celWC` 50/1 i
  `WC` 23/0, identycznie jak przed wdrożeniem.

⇒ **Kryterium C zaliczone. Round-trip na stanie zdegradowanym jest niediagnostyczny z konstrukcji**
i został tu zapisany właśnie po to, żeby nikt nie wziął go za regresję.

## Dwa wyniki NIEPLANOWANE (zaobserwowane przy okazji, obie do rejestru)

**(1) RAMIĘ ZAMYKAJĄCE ODPALIŁO NA ŻYWO — częściowo domyka lukę „histereza nieprzetestowana".**
Dren `Fe` z Findingu **220** zabrał emp_002 `frac` z **0,286 → 0** w ciągu 15 gy; zatrzask przewrócił
się **true → false** poniżej `WEALTH_CLOSE` w **gy 66**, `celWC` wrócił do **1**. ⇒ ochrona ubogiego
imperium z `d44af5e` **działa w nowym kształcie tak, jak ją podpisano**.
⚠ Luka domknięta **CZĘŚCIOWO**: zaobserwowano **ramię zamykające**, nie pełną histerezę — imperium
przeszło przez pasmo **w dół i tylko raz**. Zachowanie „wraca w górę i NIE otwiera się aż do 0,20"
pokrywa nadal **wyłącznie keeper T2** (fixture skonstruowany, D-E3-3).

**(2) ŁAŃCUCH UDOWODNIONY OD KOŃCA DO KOŃCA — pierwsze okręty wojenne AI z własnej produkcji.**
emp_001: `director:shipCompleted` **3**, `shipQueued` **11**, `pressureIncident` **6**;
**SIEDEM uzbrojonych okrętów w rezerwie**, zbudowanych z własnej ekonomii — **pierwszy raz w projekcie**.
⚠ `kadlubyZeSkokiem` jest **nadal 0 i to jest POPRAWNE**: jedyna eskorta zdolna do skoku
(`frigate_laser_escort`, ma `warp_tank`) stoi **w kolejce, nie ukończona** (TTL 76,7 — brakuje jej
**drugiego** `warp_core`), a dwa **ukończone** okręty to obrońcy układu — wzorzec **martwego balastu**
z Findingu **251** (`engine_warp` bez `warp_tank`, `warpFuel.max = 0`), więc **słusznie się nie liczą**.
**Jeden cykl fabryki od przewrócenia licznika.** To jest fakt **projektu danych**, nie defekt.

## Stan po gate'cie

* **Finding 246 — ZAMKNIĘTY.** Wejście do łańcucha działa i jest proporcjonalne.
* **Finding 247 — OTWARTY Z PROJEKTU** (D-CE-0): sufit 50 jest sensem „rezerwy gotowości".
* Flaga `aiTier3ScaledEntry` **zostaje ON**; OFF pozostaje ścieżką rollbacku (dowód: baza + T4 + tabela).
