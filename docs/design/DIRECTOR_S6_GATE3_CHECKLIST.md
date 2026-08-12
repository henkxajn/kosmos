# GATE 3 (S6) — nacisk militarny L1–L2 · skrypt sesji · **FINAŁ SLICE'U 1**

**Arc:** WOJNA I POKÓJ 1.0 · **Workstream:** C (ReactionDirector) · **Slice:** 1, commit S6
**Plan:** `DIRECTOR_SLICE1_PLAN.md` (§Commit plan → S6, §Tests, §Verification)
**Poprzednie gate'y:** GATE 1 **PASSED** 2026-08-11 · GATE 2 **PASSED** 2026-08-12
**Zapis:** v100, **zero migracji** (`director.posture` ma pusty domyślny kształt)

---

## 🔴 STAŁE REGUŁY SKRYPTÓW — osiem, każda kupiona błędem

1. **ZERO wieloliniowego kodu w cytatach blokowych** (kopiuje się z `> ` → `SyntaxError`).
2. **Stolica WYŁĄCZNIE przez `KOSMOS.directorProduction.capitalOf(empireId)`** — kolonie nie mają `.id`.
3. **Stany i braki ODCZYTYWAĆ Z SILNIKA**, nigdy z pamięci ani z ręcznej listy.
4. **`DebugLog` to PIERŚCIEŃ czyszczony przy przeładowaniu** — po wczytaniu gry nie odpytuj wpisów sprzed reloadu.
5. **NIE URUCHAMIAJ GATE'U RÓWNOLEGLE Z PRACĄ CC** (commit przeładowuje Live Server).
6. **Lewary stanu tylko przez ZWALIDOWANE narzędzia** (`KOSMOS.debug.*`).
7. **Pin/asercja NIE MOŻE być spełnialna przez SĄSIEDNI kod** (okna o stałej szerokości przeciekają).
8. **Etykietowanie dowodu** — patrz ramka niżej. Nie zaokrąglamy „sprawdzone" w górę.

> ⚠ **Walidacja one-linerów — stan faktyczny.** Powierzchnia API każdego polecenia jest
> sprawdzona w źródle. **Helpery `KOSMOS.debug.*` użyte w tym gate'cie NIE były uruchomione
> w przeglądarce** — autor slice'u nie ma sesji live, a reguła 5 zabrania puszczania gate'u
> równolegle z pracą CC. **Pierwsze wywołanie następuje w TYM przebiegu.**
>
> **[✔KEEPER]** = udowodnione WYKONANIEM prawdziwych systemów w `director_pressure_smoke.mjs`.
> **[~ŹRÓDŁO]** = sprawdzone wyłącznie po źródle; wymaga żywej sceny/panelu albo dotyczy helpera debug.

---

## 0. Przygotowanie

```js
[KOSMOS.directorSystem ? 'silnik OK' : 'BRAK silnika', KOSMOS.directorPressure ? 'nacisk OK' : 'BRAK nacisku', KOSMOS.influenceMap ? 'mapa OK' : 'BRAK mapy']
```
☐ **G3.0** — trzy „OK". Brak któregokolwiek to „nikt nie podłączył", nie „reguła nie odpaliła".

```js
KOSMOS.debug.influenceMap()
```
☐ **G3.1** — tabela stref: każde imperium ma układy ROSZCZONE i GRANICZNE. Zapamiętaj **id układu
  granicznego** jednego imperium — będzie potrzebne w §1. **[~ŹRÓDŁO — helper debug]**

---

## 1. Wyzwalacz — uzbrojony statek w POWŁOCE, nie w przestrzeni roszczonej

Wyślij uzbrojony okręt gracza do układu **granicznego** (nie roszczonego!) wybranego imperium.
Najszybciej lewarem z GATE 2:

```js
KOSMOS.debug.teleportVessel('ID_TWOJEJ_FREGATY', 0, 0)
```
⚠ Teleport działa w px sceny **bieżącego układu** — do zmiany układu użyj normalnej nawigacji/warpu.
Alternatywnie po prostu wyślij okręt rozkazem i przewiń czas.

```js
KOSMOS.directorPressure.countArmedPlayerVesselsInBorder('emp_001')
```
☐ **G3.2** — zwraca **≥ 1**, gdy Twój uzbrojony okręt stoi w powłoce granicznej `emp_001`.
  Zwraca **0**, gdy okręt jest w przestrzeni ROSZCZONEJ tego imperium (tam działa osobna
  mechanika) albo gdy okręt nie ma broni. **[✔KEEPER — T1a–T1f]**

---

## 2. Incydent = JEDEN wiersz (punkt nienegocjowalny)

Przewiń czas, aż reguła odpali (rzut 40 % +30 pkt/rok wyświetlany, mnożony przez agresję).

```js
KOSMOS.debug.directorRules('emp_001')
```
☐ **G3.3** — wiersz `military_pressure_l1` ma `odpalila: TAK`. **[~ŹRÓDŁO — helper debug]**

☐ **G3.4** 🔴 **NIENEGOCJOWALNE — panel dyplomacji pokazuje JEDEN wiersz nacisku, nie dwa.**
  Otwórz panel dyplomacji (`Y`) → rozbicie opinii `emp_001`. Ma tam być **„Okręty wojenne przy
  naszej granicy"** i **NIE MA** obok niego drugiego wpisu o tym samym czynie
  („Obecność militarna" / `military_presence`).
  ⚠ To jest hazard §Audit H: `military_presence` nalicza się SAM przy wejściu do przestrzeni
  roszczonej. Rozłączność jest GEOGRAFICZNA (powłoka vs przestrzeń roszczona), więc dwa wiersze
  naraz oznaczają, że rozłączność przeciekła. **[✔KEEPER — T2a/T2c; panel = ~ŹRÓDŁO]**

```js
KOSMOS.debugLog.query(e => e.kind === 'director:pressureIncident').slice(-1)
```
☐ **G3.5** — wpis z `level`, `vessels`, `queuedOrders`, `refused`. **[✔KEEPER — T5b/T5c]**

---

## 3. Odpowiedź zbrojna — ścieżka z GATE 1

```js
(cap => ({ kolejka: cap.shipQueues?.map(q => q?.shipId ?? null), oczekujace: cap.pendingShipOrders?.map(o => o.shipId) }))(KOSMOS.directorProduction.capitalOf('emp_001'))
```
☐ **G3.6** — w stoczni stolicy AI stoją **fregaty obrony układu** (`hull_frigate`) — dwie na L1.
  Jeśli brakuje surowców, siedzą w `oczekujace` i **to jest poprawne** (R-1 „economy executes").

```js
KOSMOS.debug.aiWarships()
```
☐ **G3.7** — tabela stanu imperiów (stolica, stocznia, wolne POPy, żeton R-3, `point_defense`).
  Służy do diagnozy, gdy G3.6 jest puste. **[~ŹRÓDŁO — helper debug]**

---

## 4. Eskalacja L1 → L2

Zostaw okręt w powłoce i przewiń kolejne lata (cooldown L1 = **5 lat wyświetlanych**, okno
eskalacji = **10 lat**).

☐ **G3.8** — druga reakcja w oknie ma `level: 2` w `director:pressureIncident`, a w stoczni
  dochodzi **JEDEN okręt zdolny do skoku** (`frigate_laser_escort` albo `frigate_missile_escort`,
  zależnie od agresji imperium). **[✔KEEPER — T6d/T6e + T4b/T4c/T4d]**

☐ **G3.9** — **po wygaśnięciu okna** (>10 lat od ostatniego odpalenia) kolejna reakcja wraca do
  `level: 1`. Eskalacja jest cechą POWTÓRKI W OKNIE, nie stanem trwałym. **[✔KEEPER — T6f]**

```js
KOSMOS.gameState.get('director.posture')
```
☐ **G3.9b** — postawa obronna imperium: `{ level, sinceYear, vessels }`. `level` ma odpowiadać
  szczeblowi ostatniej reakcji, a `sinceYear` być rokiem WYŚWIETLANYM. **[✔KEEPER — T7g]**

---

## 5. Drabina wojny NIE RUSZA (punkt nienegocjowalny)

```js
KOSMOS.diplomacySystem.getTension('emp_001')
```
☐ **G3.10** 🔴 **NIENEGOCJOWALNE — napięcie NIE ROŚNIE od samego nacisku.** Zanotuj wartość
  przed §1 i porównaj po kilku cyklach nacisku: ma być **bez zmian** (poza normalnym dryfem
  dyplomatycznym z innych źródeł). Nacisk L1–L2 ma **grozić, nie wypowiadać** (decyzja 7);
  drabina 40/60/80 należy do L3 w Slice 2.
  **[✔KEEPER — T3a: 50 powtórzeń, napięcie nietknięte; T3b: kod nacisku nie zna napięcia]**

☐ **G3.11** — status pozostaje `peace` (`KOSMOS.diplomacySystem.getStatus('emp_001')`), żadnego
  ultimatum ani automatycznej wojny z samego nacisku.

---

## 6. Przypadek zdegenerowany — brak techu / brak załogi (R-4)

To jest **świadoma konsekwencja podpisana w R-4**: w oknie przed `ion_drives` imperium nie ma
czym odpowiedzieć. Wymuś to na imperium bez techu (albo zabierz załogę):

```js
KOSMOS.debug.grantFreePops('emp_001', 0)
```

☐ **G3.12** — incydent dyplomatyczny **ZACHODZI** (wiersz w rozbiciu opinii jest), okrętów
  **NIE MA**, a `KOSMOS.debugLog.query(e => e.kind === 'director:shipRejected').slice(-1)` mówi
  **DLACZEGO** (`no_crew` / `no_module` / `no_orbital_station`).
  ⚠ „Nacisk bez odpowiedzi zbrojnej" jest poprawny. **Cicha cisza nie jest** — brak wpisu
  o powodzie to porażka gate'u (audyt R12). **[✔KEEPER — T5a/T5b/T5c]**

---

## 7. Regresje, które muszą przeżyć finał

☐ **G3.13** — **izolacja Dziennika trzyma**: budowa okrętów AI wywołana naciskiem **NIE** pojawia
  się w Dzienniku gracza (ani „Stocznia: budowa", ani „Statek gotowy"), tak samo głód/niepokoje
  kolonii AI. Skrypt spot-checku z 2026-08-12 nadal obowiązuje.

☐ **G3.14** — **pierwszy kontakt (S5) nadal działa**: `KOSMOS.debug.firstContact('emp_002')` daje
  sondę, jeden beat, despawn na wyjściu. Nacisk go nie zepsuł.

☐ **G3.15** — **round-trip zapisu**: zapisz, przeładuj (F5), wczytaj. Postawa obronna i stany
  reguł przeżywają; nacisk nie odpala się od nowa „bo stan zniknął".

☐ **G3.16** — konsola **bez błędów** przez cały przebieg.

---

## Wynik

| pole | wartość |
|---|---|
| Data / przebieg | **2026-08-12, przebieg 1** |
| Wynik | ✅ **FULL PASS** (re-check 2026-08-12) — warunek zdjęty, gate zamknięty bezwarunkowo. **Slice 1 COMPLETE.** |
| Punkty nienegocjowalne (**G3.4** jeden wiersz · **G3.10** napięcie nietknięte · **G3.12** cisza zbrojna z podanym powodem) | |
| Rozbieżności | |

> **Trzy nienegocjowalne.** G3.4 — dwa wiersze znaczą, że rozłączność geograficzna przeciekła
> i gracz płaci dwa razy za jeden czyn. G3.10 — nacisk ruszający napięcie prowadzi wprost do
> automatycznej wojny i wywraca decyzję 7 (L1–L2 grożą, nie wypowiadają). G3.12 — „brak reakcji
> zbrojnej" jest dopuszczalny, ale MUSI podać powód; cicha cisza to dokładnie ten tryb awarii,
> przez który martwe `EconAI`/`MilitaryAI` przetrwały niezauważone.
>
---

## ✅ WYNIK PRZEBIEGU 1 (2026-08-12) — CONDITIONAL PASS

**Zielone na żywo, na OBU imperiach:**
- **G3.4** — JEDEN wiersz („Okręty wojenne przy naszej granicy") z akumulacją po `border_pressure`
  [22]/[28] w pamięci. Decyzja 7 widoczna na ekranie.
- **G3.10** — napięcie **0/0** po wielu cyklach nacisku na OBU imperiach.
- **G3.12** — zadziałało **dwa razy NATURALNIE**: `no_orbital_station` ×2 na `emp_001` (relikt
  stacji z GATE 2 — poprawne zachowanie żetonu R-3) i `no_crew` ×2 na `emp_002`.
- **Ścieżka sukcesu** — po `grantFreePops`: **3× `hull_frigate`** w kolejce `emp_002`, czyli
  dokładnie ładunek L2 (2 obrońców + 1 eskorta). Produkcja odpowiada na SZCZEBEL postawy.
- **Wyzwalacz i strefy** — `countArmedPlayerVesselsInBorder` = 0 w przestrzeni roszczonej
  (Alnilam) i 1–2 w powłokach; `sys_031` liczy się poprawnie dla powłok OBU imperiów.
- Izolacja Dziennika trzymała przez cały przebieg; konsola czysta.

**Hipoteza intelu OBALONA POMIAREM:** nieznajomość imperium NIE bramkuje reguły (ich intel widzi
okręt gracza — kierunek poprawny), a incydent narasta w rozbiciu opinii imperium, którego gracz
jeszcze nie spotkał. To jest „świat żyje za kulisami", zgodnie z projektem.

**DEFEKT (warunek) — SEMANTYKA ESKALACJI. NAPRAWIONY.** Pierwszy incydent `emp_002` niósł
`level: 2`, a `emp_001` osiągnął L2 przy jednym odpaleniu w licznikach.
🔴 **Obie hipotezy robocze okazały się błędne, przyczyna była trzecia.** Klucz stanu JEST
per (reguła, imperium) (`${ruleId}|${empireId}`), a `isWithinEscalationWindow` poprawnie zwraca
`false` dla `lastFiredYear == null`. Prawdziwa przyczyna: **L1 i L2 to dwie NIEZALEŻNE reguły
z NIEZALEŻNYMI rzutami**, a `DirectorSystem` ocenia obie w każdym ticku — nic nie wymagało, żeby
L1 padł pierwszy. Przy ciężkim nacisku (≥3 okręty) L2 był uprawniony od pierwszego tiku i wygrywał
własny rzut przed L1. Odtworzone headless: seedy `emp_D` i `emp_G` otwierały na L2, a obie reguły
potrafiły paść w TYM SAMYM roku (stąd szybka akumulacja modyfikatora).
**Naprawa:** guard `pressureEscalationReady` na L2 — L1 musi paść wobec TEGO imperium
i to w POPRZEDNIM roku wyświetlanym. Inwariant: **pierwszy incydent imperium = ZAWSZE L1**;
przy okazji znika podwójne odpalenie w jednym roku. Ścieżka `escalatesTo` nietknięta (guardy
sprawdzane są dla reguły OCENIANEJ, nie dla celu eskalacji). Keeper T8a–T8g + T9a/T9b, fail-first
udowodniony wykonaniem (zdjęcie guardu wskazuje `emp_D` po nazwie).

**Do ponownego sprawdzenia przez Filipa (2 minuty):** §RE-CHECK niżej.

---

## 🔁 RE-CHECK po naprawie (2 min)

```js
KOSMOS.debug.directorRules()
```
☐ **R1** — wyczyść stan (nowa partia albo świeże imperium) i doprowadź do PIERWSZEGO incydentu.
  W `director:pressureIncident` ma być **`level: 1`**, nigdy 2.

```js
KOSMOS.debugLog.query(e => e.kind === 'director:pressureIncident').map(e => ({ emp: e.data.empireId, lvl: e.data.level }))
```
☐ **R2** — pełna historia incydentów: **każde imperium otwiera na `lvl: 1`**, a `lvl: 2` pojawia
  się dopiero jako KOLEJNY wpis tego samego imperium.

☐ **R3** — dwa imperia naciskane naprzemiennie **eskalują niezależnie**: odpalenie u jednego nie
  otwiera L2 u drugiego.

```js
KOSMOS.gameState.get('director.posture')
```
☐ **R4** — zapisz grę, **F5**, wczytaj, i powtórz to zapytanie: postawa (`level`, `sinceYear`)
  **przeżywa round-trip**. Punkt nieprzećwiczony w przebiegu 1.

---

---

## ✅ RE-CHECK PO NAPRAWIE (2026-08-12) — FULL PASS, warunek zdjęty

- **R1/R2** — pierwszy w historii incydent `emp_002` ma **`level: 1`**. To dokładnie ten objaw,
  który przed naprawą wychodził jako `level: 2`.
- **R3 (izolacja) — WIDOCZNA NA ŻYWO:** postawa obronna powstała **wyłącznie** dla imperium,
  które odpaliło. `emp_001` rzucił, chybił i **nie ma wpisu** — czyli stan reguły naprawdę żyje
  per (reguła, imperium), a nie globalnie.
- **R4 (round-trip) — ZWERYFIKOWANY NA ŻYWO:** `posture` i `odpalenieRok` dla OBU imperiów
  **bit-identyczne** po `save → F5 → load`. Punkt nieprzećwiczony w przebiegu 1.
- Kolejne naturalne `refused-with-reason` (`no_crew`) — R-4 działa dalej.
- Konsola czysta.

⚠ **GRANICA DOWODU — drabina L1→L2 przyjęta NA POKRYCIU KEEPERA, nie na obserwacji live.**
Przebieg zakończył się, zanim upłynął cooldown 5 lat wyświetlanych, więc eskalacji nie
zaobserwowano w grze. Pokrywają ją **T6d/T6e** (eskalacja w oknie, wykonanie) i **T8a–T8g**
(pierwszy incydent zawsze L1, izolacja na ośmiu seedach). Traktować jako *keeper-verified*,
nie *live-verified* — gdyby przyszła zmiana ruszyła cooldowny albo okno, to jest pierwszy punkt
do obejrzenia na żywo.

---

> **To ostatni gate Slice'u 1.** PASS zamyka arc: szkielet reguł (S1) → mapa wpływów (S2) →
> katalog szablonów (S3) → produkcja okrętów AI (S4) → pierwszy kontakt (S5) → nacisk L1–L2 (S6).
