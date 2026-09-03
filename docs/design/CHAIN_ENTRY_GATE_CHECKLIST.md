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
