# Finding 188 — MGŁA WOJNY W STRATCOM: rozdzielenie reweali na dwie osie

> **Status:** ✅ **PODPISANE 2026-08-31 (D-188-1..8 w wariancie W1) i WDROŻONE.** Wykonanie: §10 · drabina wywiadu: §11 · przyrządy: §12 · live-gate: §13.
> Rejestr macierzysty: `docs/design/VESSEL_ORDERS_PLAN.md` §Finding 188.
> Sonda pomiarowa: `src/testing/headless/probe-188-reveal.mjs` (uruchamialna; `probe-188-setintel.mjs` weryfikuje przyrząd z §12).
> Save **v101, bez migracji** (warstwa prezentacji + jeden nowy klucz i18n).

---

## 0. Weryfikacja przed audytem (reguła z W3-32)

Finding **OTWARTY i realny** — potwierdzony **wykonaniem**, nie odczytem. Ale weryfikacja
zwróciła wynik **nierówny wobec rejestru** i to jest pierwszy wynik tego audytu:

| rejestr mówi | pomiar |
|---|---|
| „trzy reweale pod jedną flagą `known`" | **sześć** reweali, w **dwóch** funkcjach |
| „nazwa układu (`nameKnown`, `:5542`)" | ⚠ **panel detalu nazwy NIE wydaje** — ma własny, poprawny predykat i pokazuje `???`. `:5542` to **etykieta gwiazdy na mapie**, czyli inna funkcja |
| — | ⚠ **nie policzone:** tożsamość imperium (nazwa + archetyp) **i wrogość** — oba na `rumor`, w panelu **i** jako kolorowy pierścień na mapie |

⚠ To ta sama klasa co wpis [[registry-may-describe-the-trap-not-the-bug]]: **treść findingu
opisywała objaw z jednego miejsca, a mechanizm siedzi w dwóch.** Naprawa wyłącznie tego,
co wpisano, zostawiłaby cztery z sześciu wycieków.

---

## 1. Pomiar — co panel NAPRAWDĘ wydaje na `rumor`

`probe-188-reveal.mjs` uruchamia **prawdziwą** `_drawStratcomDetail` na atrapie `ctx`
(wzór `zero_colony_panels`), dla układu: **niezbadany, nieskanowany, obserwatorium Lv0,
imperium na `rumor`**. Wypis co do wiersza:

```
⭐ ???                        <- nazwa POPRAWNIE ukryta (własny predykat)
Niezbadany                    <- status uczciwy
Imperium: Królestwo Wezen     <- WYCIEK: tożsamość na rumor
Wrogość: 72/100               <- WYCIEK: stan dyplomatyczny na rumor
Populacja: 55                 <- WYCIEK (rejestr)
Życie: wykryte                <- WYCIEK (rejestr)
🔒 Wymaga Obs. Lv2
🚀 Wyślij statek
```

Gracz bez obserwatorium, bez wizyty, po **jednym przelocie cudzej sondy** dostaje nazwę
imperium, jego nastawienie i realną liczbę mieszkańców.

---

## 2. Inwentarz reweali — sześć faktów, dwie funkcje, jedna zlana flaga

| # | fakt | gdzie | dzisiejsza bramka | oś, do której NALEŻY |
|---|---|---|---|---|
| 1 | **nazwa układu** (mapa, etykieta gwiazdy) | `FMO:5544` → `:6120` | `explored ‖ rumor ‖ skan` | miejsce |
| 1′ | **nazwa układu** (panel, nagłówek) | `FMO:6360` `_systemDisplayName` | `explored ‖ skan` — **bez rumor** | miejsce |
| 2 | **tożsamość imperium** (nazwa + kolor archetypu) | `FMO:6308-6311` | `rumor` | właściciel |
| 3 | **wrogość** (liczba w panelu **+** kolor pierścienia na mapie) | `FMO:6312-6314`, `:6107-6110` | `rumor` | właściciel |
| 4 | **populacja** (żywa suma z `ColonyManager`) | `FMO:6261-6264`, `:6326` | `isHome ‖ explored ‖ rumor` | właściciel |
| 5 | **życie** (`lifeScore` planet) | `FMO:6265-6266`, `:6329` | `isHome ‖ explored ‖ rumor` | miejsce |
| 6 | **infrastruktura** (📡 beacon, 🌀 brama) + wielkość/jasność glifu | `FMO:6113-6117`, `:6094` | `isHome ‖ explored ‖ rumor` | miejsce |

⚠ **Wiersze 1 i 1′ to LUSTRO** — dwa predykaty jednej rzeczy, które **się nie zgadzają**.
Dokładnie klasa z Findingu 186 (`sysData.explored` vs `galaxyStar.explored`), tylko że tam
lustrem było pole stanu, a tu jest nim **predykat**. Zgodnie z lekcją 186 — *gdy dwa miejsca
odpowiadają na to samo pytanie, kanon jest już spóźniony*.

---

## 3. Przyczyna źródłowa — `known` ZLEWA DWIE NIEZALEŻNE OSIE

```js
// FleetManagerOverlay.js:6248-6257
const empKnown = !!(empId && intel.isAtLeast(empId, 'rumor'));   // oś WŁAŚCICIELA
const explored = isSystemExplored(sys);                          // oś MIEJSCA
const known    = !!sys.isHome || explored || empKnown;           // SUMA dwóch osi
```

Gra ma **dwie niezależne osie wiedzy** i to jest zdrowy projekt:

- **oś MIEJSCA** (`isSystemExplored` / skan STRATCOM) — *byłem tam albo to zmierzyłem*:
  nazwa, liczby ciał, życie, infrastruktura.
- **oś WŁAŚCICIELA** (`intel.<empireId>`: `rumor → contact → detailed`) — *co wiem o TYM,
  KTO tam mieszka*: tożsamość, archetyp, wrogość, siła, rezerwa, zdolność załogowa.

`known` robi z nich **sumę**, więc **każdy fakt jest wydawany przy słabszym z dwóch
warunków**. Skutek jest dwukierunkowy, choć boli tylko jedna strona: jeden przelot obcej
sondy (oś właściciela, najniższy szczebel) otwiera **wszystkie** fakty o miejscu dla
**każdego** układu tego imperium — bez wizyty, bez teleskopu, bez skanu.

⚠ To jest **rodzeństwo W3-4** (`ThreatAssessment` = prawda globalna, nieobjęta wywiadem) —
ta sama klasa „wiedza gracza o AI omija warstwę wywiadu", inny mechanizm.

⚠ I to jest [[dont-collapse-independent-design-axes]] w czystej postaci: **osie niezależne
mają zostać niezależne.** Naprawa nie polega na podniesieniu progu, tylko na **rozplątaniu
sumy**.

---

## 4. Trzy pomiary, które PROJEKT ZMIENIAJĄ, a nie potwierdzają

### 4.1 `rumor` ma trzech producentów — i jeden z nich jest MARTWY (nowy Finding 193)

| producent | plik | żywy? |
|---|---|---|
| przelot sondy pierwszego kontaktu | `DirectorFirstContact.js:267` | ✅ żywy, odpala w **każdej** partii (zmierzone na W2 GATE 3) |
| obserwatorium odkrywa ciało w ich układzie | `IntelSystem.js:213` | ✅ żywy |
| **nasłuch pasywny** (10 ly, 8 lat) | `IntelSystem.js:305-318` | 🔴 **MARTWY** |

```js
// IntelSystem.js:307 — `emp.colonies` to STRING[] (EmpireRegistry:15,93 mówi to wprost)
const inRange = (emp.colonies ?? []).some(col => {
  const gs = galaxy.systems.find(s => s.id === col.systemId);   // col.systemId === undefined
  if (!gs) return false;                                        // => ZAWSZE false
```

**ZMIERZONE wykonaniem** (`node`, na realnym kształcie `['p_1','p_2']`): `col.systemId` =
`undefined` ⇒ `inRange` = `false` **zawsze** ⇒ `_rumorAccum` nigdy nie rośnie ⇒ mechanika
„8 lat w promieniu 10 ly → rumor" **nie odpaliła ani razu w historii projektu**.

⚠ To **trzecia** martwa gałąź tej samej klasy co **Finding 87** (`colMgr.colonies`) —
a poprawny wzór stoi **dwa miejsca dalej w tym samym pliku** (`advanceIntel:130-137` czyta
`colonyId` i dopiero z `ColonyManager` bierze `systemId`) **i jest opisany komentarzem**
w `EmpireRegistry:244`. Znowu: *kod obchodzący własną konwencję w jednym miejscu*.

**⚠ KOLEJNOŚĆ JEST WIĄŻĄCA:** ożywienie nasłuchu **przed** tą naprawą zamieniłoby wyciek
punktowy w **powszechny i automatyczny** (każde imperium w 10 ly, po 8 latach, bez żadnej
akcji gracza). Dlatego 193 → **filed, NIE naprawiany tutaj** (to zmiana tempa gry wywiadu
z własnym pomiarem, nie higiena — ta sama argumentacja co przy Findingu 189).

### 4.2 Wizyta w cudzym układzie JUŻ podnosi intel do `contact` — ścieżki są połączone poprawnie

```js
// IntelSystem.js:204 — _onVesselArrived
this.advanceIntel(empireId, 'contact', `vessel_arrived:${…}`);
```

⇒ **Oś miejsca zasila oś właściciela właściwym kanałem.** Nie muszę dopisywać `explored`
do predykatu tożsamości ani ruszać drabiny: lot rozpoznawczy do ich układu **sam** daje
`contact`, więc po naprawie gracz, który tam poleciał, zobaczy nazwę imperium — tak jak dziś.

**To ustala zakres:** naprawa jest **czysto prezentacyjna**. `IntelSystem` NIE jest ruszany.

### 4.3 „Żywy odczyt na właściwym szczeblu" to już PODPISANE stanowisko tego repo

`knownMilitary` **odświeża się co tik** dla imperiów na `detailed` (`_refreshKnownMilitary`),
a uzasadnienie stoi w komentarzu (`IntelSystem.js:236-238`):

> „Bramka intelu zostaje NIETKNIĘTA: odświeżamy WYŁĄCZNIE imperia już na `detailed`.
> **To nie jest wyciek mgły wojny, tylko aktualizacja tego, co gracz i tak ma prawo widzieć.**"

⇒ Pytanie „żywy odczyt czy snapshot w rekordzie wywiadu?" **jest już rozstrzygnięte** przez
poprzedni slice: defektem jest **szczebel**, nie **żywość**. Populację czytamy dalej żywo
z `ColonyManager` — tylko na właściwym szczeblu. **Zero zmian formatu zapisu.**

---

## 5. DECYZJE DO PODPISU

Sygnatura docelowa (W1 = rekomendacja):

| # | pytanie | W1 (rekomendacja) | W2 (wariant) |
|---|---|---|---|
| **D-188-1** | **nazwa układu** | `explored ‖ skan ‖ rumor-na-właścicielu` — **zgodnie z decyzją właściciela**; obie funkcje przez **jeden** predykat (koniec lustra 1/1′) | tylko `explored ‖ skan` (nazwa nie schodzi na rumor; sprzeczne z podpisem) |
| **D-188-2** | **binarny fakt własności** | na `rumor`: `Właściciel: obce imperium` — **jeden nowy klucz i18n** | — |
| **D-188-3** | **tożsamość** (nazwa + archetyp) | `contact` — zgodne z drabiną (`advanceIntel` wydaje archetyp na contact) **i z dwoma precedensami w tym samym pliku** | `detailed` |
| **D-188-4** | **wrogość** (panel **i** pierścień na mapie) | `contact` — relacji nie ma z kimś niezidentyfikowanym; pierścień na `rumor` → **neutralny** (bez odczytu nastawienia) | `detailed` |
| **D-188-5** | **populacja** | **`detailed`** — populacja to *liczba o imperium*, a **wszystkie** takie liczby (`knownMilitary`, `knownReserve`, `knownCrewCapacity`) siedzą na `detailed`. Odczyt **żywy** (§4.3) | `explored ‖ detailed` (lot rozpoznawczy też ujawnia) |
| **D-188-6** | **życie** | `explored` — to fakt o **planetach**, nie o imperium; oś właściciela wypada całkowicie | `explored ‖ skan tier 3` (wymaga rozszerzenia skanu = zmiana treści) |
| **D-188-7** | **infrastruktura + jasność glifu** | oś miejsca (`explored ‖ skan`) — jedzie razem z resztą faktów o miejscu | zostaje jak jest |
| **D-188-8** | **kanon** | NEW `src/utils/SystemReveal.js`: **jedna** funkcja `resolveSystemReveal(sys, deps)` zwracająca rekord sześciu boolów; **fail-CLOSED** | predykaty inline w overlayu (odtwarza lustro 1/1′) |

### Uzasadnienia, które warto przeczytać przed podpisem

**D-188-3/4 — precedens jest już w tym samym pliku.** `_drawStratcomOwnerGlyph:5728` i wiersz
terytorium `:6272` **oba** pytają o `contact`, zanim nazwą imperium. Dwie linie wyżej ta sama
funkcja nazywa je na `rumor`. Nie wymyślam progu — **usuwam niespójność wewnątrz jednej funkcji**.

**D-188-5 — czy `detailed` jest OSIĄGALNE?** Tak, **zmierzone**: jedyny producent to
`_onGroundSurvey` (`groundUnit:surveyComplete` / `anomalyFound`), a łańcuch jest **żywy**:
`ColonyOverlay:5077` → `GroundUnitManager.startSurvey:344` → `tick:394` → `_tickScan:1185`
→ `_completeSurvey:1213` → emit. ⚠ Sprawdzone **celowo**, bo rekomendowanie szczebla
nieosiągalnego dałoby pole na zawsze puste — dokładnie ta pułapka, którą projekt nazywa
„gate mierzy ciszę". (Druga ścieżka, `PlanetScene:894`, jest **martwa** — legacy.)
**Cena W1:** żeby policzyć obcych, trzeba postawić buty na ziemi w ich układzie. Lot
rozpoznawczy nie jest jednak bezwartościowy — daje `contact` (§4.2), czyli tożsamość.

**D-188-8 — dlaczego kanon, a nie trzy `if`-y.** Bo lustro 1/1′ **już powstało** bez kanonu.
Rekord zamiast rodziny predykatów, bo pytań jest sześć i mają różne argumenty — jeden rekord
znosi ryzyko, że któryś konsument zapyta o co innego, niż sądzi. **Kierunek fail:** przy mgle
wojny cena fałszywego **pozytywu** to trwały wyciek ⇒ **fail-CLOSED** (odwrotnie niż
`SystemScope.isSameSystem`, gdzie fail-open jest słuszny — wpisać w komentarz modułu, żeby
nikt nie „ujednolicił").

---

## 6. Kształt naprawy

### 6.1 NEW `src/utils/SystemReveal.js` (czysty, fail-CLOSED)

```js
resolveSystemReveal(sys, { explored, scanned, intelRank }) → {
  name, ownerExists, ownerIdentity, hostility, population, life, place
}
```

`intelRank` wstrzykiwany (0=unknown…3=detailed) ⇒ moduł testowalny bez `window.KOSMOS`;
overlay składa `deps` w jednym miejscu. Brak `sys` / brak akcesorów ⇒ **wszystko `false`**.

### 6.2 Wpięcie — dokładnie dwa miejsca odczytu

| miejsce | zmiana |
|---|---|
| `_stratcomVisibleSystems:5537-5545` | `known`/`nameKnown` → pola rekordu (`place`, `name`) |
| `_drawStratcomDetail:6248-6329` | `known`/`empKnown` → rekord; trójstan właściciela; pop/życie na osobnych polach |
| `:6107-6110` (pierścień) | `empKnown` → `hostility` (kolor) ‖ `ownerExists` (neutralny) |
| `:6113` (infra/glif) | `known` → `place` |

### 6.3 ⚠ Pułapka layoutu, którą łatwo przeoczyć

`:6280` liczy wysokość panelu: `panelH += empKnown ? 28 : 14`. Trójstan właściciela ma
**trzy** wysokości (nieznany 14 / obce imperium 14 / nazwa+wrogość 28). Bez korekty panel
utnie wiersz albo zostawi dziurę — i to **nie krzyknie**, bo rysowanie na canvasie nie
zgłasza przepełnienia.

### 6.4 i18n — **jeden** nowy klucz

`fleet.stratcomEmpireForeign` = „Właściciel: obce imperium" / „Owner: foreign empire".
Reszta reużywa `stratcomEmpire` / `stratcomEmpireUnknown` / `stratcomPopUnknown` /
`stratcomLifeUnknown` (wszystkie **już istnieją** w PL i EN).

---

## 7. Keeper — **wykonaniowy**, nie źródłowy

⚠ `FleetManagerOverlay` **importuje się pod node** (potwierdzone sondą) ⇒ tę warstwę UI
pinujemy **prawdziwą ścieżką rysującą** na atrapie `ctx` zbierającej `fillText`.
NEW `src/testing/smoke/stratcom_reveal_smoke.mjs`:

- **T1** *macierz reweali* — 4 szczeble intelu × {zbadany, niezbadany}; dla każdej komórki
  zbiór wierszy panelu porównany z tabelą z §5. ⚠ każda asercja wymaga **niepustego** zbioru
  wierszy (sonda dowodzi, że panel realnie rysuje) — inaczej pin przeszedłby **jałowo**,
  czyli świeciłby zielono dokładnie tam, gdzie jest defekt.
- **T2** *rdzeń 188* — `rumor` + niezbadany: **brak** nazwy imperium, wrogości, populacji,
  życia; **jest** „obce imperium" i nazwa układu (D-188-1/2).
- **T3** *kontrola pinu* — `contact` przywraca tożsamość, `detailed` przywraca populację,
  `explored` przywraca życie. Bez tego T2 przechodziłby też na panelu, który nie pokazuje **nic**.
- **T4** *anty-lustro (tripwire)* — nazwa na mapie i nazwa w panelu pochodzą z **tej samej**
  funkcji; rozjazd = FAIL z instrukcją. Pin klasy 186, postawiony **zapobiegawczo**.
- **T5** *pin limitu* — `IntelSystem` NIE ruszony: `advanceIntel` dalej wydaje archetyp na
  `contact`, liczby na `detailed`.
- **T6** *layout* — trzy wysokości wiersza właściciela (§6.3).

**Fail-first mierzony finalnymi pinami** przez `git stash` samego kodu gry (wzór
`stratcom_ship_icon_smoke`), z kontrolą pinu **po obu stronach**.

Sweep: dziś **190** keeperów. Regresja obowiązkowa: `system_exploration_canon` (dzieli
predykat `explored`), `stratcom_star_pick`, `stratcom_warp_trap`, `overlay_tab_entry`.

---

## 8. Świadomie POZA zakresem — i dlaczego

| temat | powód |
|---|---|
| 🔴 **Finding 193** — martwy `passive_listening` | **do wpisania w rejestr**, nie do naprawy tutaj: ożywienie zmienia **tempo gry wywiadu** i musi iść PO tej bramce (§4.1) |
| **snapshot populacji** w rekordzie wywiadu (`knownPopulation`) | §4.3 rozstrzyga, że żywy odczyt na właściwym szczeblu jest stanowiskiem repo; snapshot = nowe pole + ścieżka odświeżania, własny podpis |
| **skan tier 3 ujawnia życie** (D-188-6 W2) | rozszerzenie **treści** skanu, nie bramki |
| „Właściciel: **brak**" dla zbadanego pustego układu | dziś mówi „nieznany" (dwuznaczne: *nie wiem* vs *nikt*); poprawa uczciwa, ale to osobny wątek — komplikuje się przy układach kolonizowanych przez gracza |
| **W3-4** (`ThreatAssessment` poza wywiadem) | rodzeństwo, inny mechanizm, własny slice |
| `_findEmpireOfSystem` daje `detailed` za survey **dowolnej** planety w ich układzie | zaobserwowane, nieoceniane — wymaga decyzji projektowej o ziarnistości |

---

## 9. Ryzyka

1. **Zwężenie mgły to zmiana odczuwalna w rozgrywce**, nie tylko higiena — gracz przyzwyczajony
   do darmowego odczytu zobaczy „?" tam, gdzie były liczby. To jest **cel**, ale wymaga
   live-gate'u na żywej partii, nie tylko keepera.
2. **Wysokość panelu** (§6.3) — cicha klasa błędu.
3. **Osiągalność `detailed`** przy D-188-5 W1 jest realna, ale **droga**; jeśli w live-gate
   okaże się, że populacja jest w praktyce nigdy niewidoczna, właściwą korektą jest W2
   (`explored ‖ detailed`), nie powrót do `rumor`.


---

## 10. WYKONANIE (2026-08-31)

**Fail-first: 46 pass / 25 fail** — zmierzone FINALNYMI pinami na nietkniętym kodzie gry.
Wszystkie kontrole pinu zielone **po obu stronach** (T5 ×4, „detailed przywraca populację",
komplet 16 stanów w T4, nie-jałowość w T1/T2/T6). **Po naprawie: 71/71.**

**Panel na `rumor` + niezbadany — przed i po** (ta sama sonda, prawdziwa ścieżka rysująca):

```
PRZED                            PO
⭐ ???                           ⭐ Wezen                      <- D-188-1
Niezbadany                       Niezbadany
Imperium: Królestwo Wezen        Właściciel: obce imperium    <- D-188-2/3
Wrogość: 72/100                  (brak)                       <- D-188-4
Populacja: 55                    Populacja: ?                 <- D-188-5
Życie: wykryte                   Życie: ?                     <- D-188-6
```

**Pliki:** NEW `src/utils/SystemReveal.js` · NEW `src/testing/smoke/stratcom_reveal_smoke.mjs`
· `FleetManagerOverlay.js` (`_systemReveal` + cztery powierzchnie + trójstan wiersza właściciela
+ wysokość panelu) · `SystemExploration.js` (komentarz wskazywał `FMO:5541` jako **celowe**
miejsce składania kanałów — po tej zmianie kłamałby) · `i18n/pl.js`+`en.js` (**jeden** klucz).

⚠ **`isEmpKnown` USUNIĘTY, nie osierocony.** Stracił ostatniego konsumenta wraz z flagą `known`,
a zostawiony byłby miną: to dokładnie ten predykat, którym wyciekała tożsamość — następna osoba
sięgnęłaby po gotowy „czy znam to imperium" i odtworzyła defekt.

Sweep **190/190 0 FAIL** · `check-i18n` PASS · zero migracji (v101).
Regresje jawnie: `system_exploration_canon` 21 · `stratcom_star_pick` 10 · `stratcom_warp_trap` 14
· `overlay_tab_entry` 28 · `warp_stratcom` 43 · `stratcom_ship_icon` 32.

### ⚠ Czego keeper NIE dowodzi (granica dowodu)

Keeper pinuje **panel detalu** wykonaniem i **równość predykatu nazwy** panel↔mapa. **NIE**
przechodzi pętli rysującej gwiazdy (`_drawStratcomGalaxy` wymaga projekcji, 3D i pełnego
`vis`), więc **pierścień wrogości, jasność gwiazdy i ikony infrastruktury są pinowane wyłącznie
pośrednio** — przez to, że czytają pola tego samego rekordu. Te trzy sprawdza dopiero live-gate
(§11 kroki 2 i 5). Nie nazywać ich zweryfikowanymi przed nim.

---

## 11. DRABINA WYWIADU — komplet producentów (zmierzone, nie z pamięci)

⚠ **Dwie różne domeny, mylone przy czytaniu kodu.** Panel STRATCOM czyta intel **IMPERIUM**
(`gameState.intel.<empireId>.level`). Osobno istnieje intel **STATKU**
(`intel.vessels.<vesselId>.quality`, też `rumor/contact/detailed`) — proximity, sensor-lock i
zwiad obserwatorium ruszają **wyłącznie tę drugą** i **NIE podnoszą poziomu imperium**.

| poziom | co go podnosi | kod | stan |
|---|---|---|---|
| `rumor` | **przelot sondy pierwszego kontaktu** (beat Directora) | `DirectorFirstContact.js:267` | ✅ odpala w każdej partii |
| `rumor` | **obserwatorium wykrywa DOWOLNY statek** obcego imperium w zasięgu radaru | `ObservatorySystem.js:648` | ✅ najczęstszy w praktyce |
| `rumor` | obserwatorium **odkrywa CIAŁO** w ich układzie (`observatory:discovered`) | `IntelSystem.js:213` | ✅ |
| `rumor` | nasłuch pasywny (10 ly, 8 lat) | `IntelSystem.js:318` | 🔴 **MARTWY** — Finding 193 |
| `contact` | **przylot statku** (`vessel:arrived`), gdy misja rozwiązuje się na układ imperium | `IntelSystem.js:205` | ✅ |
| `detailed` | **survey/anomalia jednostki naziemnej** na planecie w ich układzie | `IntelSystem.js:222` | ✅ (wymaga desantu) |

⚠ **`_onVesselArrived` NIE FILTRUJE WŁAŚCICIELA STATKU.** Chroni go wyłącznie to, że
`_resolveSystemIdFromMission` zwraca `null` przy `mission == null`, a większość emitów dla AI
(`FleetSystem:666/687/699`, `VesselManager:684`) idzie właśnie z `mission: null`. Statek AI
**z misją**, przylatujący do układu imperium, dałby graczowi `contact` za darmo. **Osiągalność
NIEZMIERZONA** — zapisane jako obserwacja, nie jako finding.

**Praktyczny wniosek dla gate'u:** `rumor` przychodzi sam i wcześnie; `contact` wymaga
**Twojego** statku w ich układzie. Stan „rumor bez contact" jest więc stanem **domyślnym** po
pierwszym kontakcie — wystarczy tam nie lecieć.

---

## 12. PRZYRZĄDY (dodane przy przygotowaniu gate'u)

```js
KOSMOS.debug.dumpIntel()                        // poziom wywiadu dla KAŻDEGO imperium
KOSMOS.debug.setIntel('emp_001', 'rumor')       // unknown | rumor | contact | detailed
```

🔴 **`dumpIntel` był ZEPSUTY (Finding 194)** — wołał `reg.getAll` (jest `listAll`) i
`intel.getEmpireContact` (jest `getLevel`), więc pętla imperiów **nie wykonywała ani jednego
obrotu**: nagłówek nad pustką, nieodróżnialny od „nie znam nikogo". Naprawione.

**`setIntel` — czemu istnieje i czemu jest bezpieczny.** `advanceIntel` jest **jednokierunkowe**
(`newRank <= oldRank → return false`, ZMIERZONE), więc bez tego helpera nie da się wrócić z
`contact` do `rumor` po przypadkowym przylocie. Mechanizm: **kasuje rekord do `unknown` surowym
zapisem, po czym podnosi go PRAWDZIWĄ ścieżką produkcyjną** — stan po `setIntel` jest bit w bit
tym, co gra wyprodukowałaby sama (`knownColonies` na `contact`, `knownMilitary` na `detailed`;
zejście czyści pola z wyższych szczebli). Helper produkujący stan nieosiągalny w grze czyniłby
gate bezwartościowym. Zweryfikowane wykonaniem: `probe-188-setintel.mjs`.

⚠ **Zero wpływu na kod produkcyjny** — obie rzeczy żyją wyłącznie w bloku `KOSMOS.debug`
w `GameScene`, obok `firstContact`, `energyChain`, `spawnStation` i kilkudziesięciu innych.

---

## 13. LIVE-GATE — ✅ **PASS 2026-08-31** (właściciel, na żywo)

**Wynik:** kroki 1-7 PASS. ⚠ **Najmocniejszy dowód to rozdzielenie 5a/5b**, bo pokazuje, że osie
odsłaniają się NIEZALEŻNIE, a nie że „coś się odblokowało":
- **5a** (`explored = true`, sama oś MIEJSCA) → życie i pełny spis ciał odsłonięte, przycisk
  „Przełącz widok" aktywny, a **populacja i tożsamość imperium NADAL ukryte**.
- **5b** (`setIntel('contact')`, sama oś WŁAŚCICIELA) → nazwa imperium i wrogość odsłonięte
  („Fundacja Zgubionego Świtu", 0/100), a **populacja NADAL `?`** (bo to `detailed`).

⇒ Potwierdzone na żywo także to, czego keeper NIE dowodził (§10 „granica dowodu"): pierścień,
jasność gwiazdy i ikony infrastruktury na mapie. Krok 6 bez regresji, konsola czysta.

⚠ **CC nie pisze plików w trakcie gate'u** (Live Server przeładowałby kartę i zresetował stan
do ostatniego zapisu). Wszystkie pliki są już zapisane.

**Przygotowanie partii — nie trzeba zaczynać od nowa.** W dowolnej partii z wygenerowanymi
imperiami:

```js
KOSMOS.debug.dumpIntel()                     // 1. zobacz, co masz
KOSMOS.debug.setIntel('emp_001', 'rumor')    // 2. ustaw dokładnie rumor
```

Potem STRATCOM → klik gwiazdy tego imperium. Jeśli w trakcie gate'u przypadkiem podniesiesz
poziom (np. przylotem statku), `setIntel` cofa — `advanceIntel` sam tego nie potrafi.

⚠ **Kroku 4 NIE skracaj przez `setIntel('contact')`** — on ustawia tylko oś WŁAŚCICIELA, a krok 4
sprawdza, że **obie osie wracają niezależnie**. Skrót dla osi MIEJSCA (zamiast czekać na przylot):

```js
KOSMOS.galaxyData.systems.find(s => s.id === 'sys_036').explored = true;
```
(to dokładnie to samo pole, które zapisuje `markSystemExplored`).

| # | krok | oczekiwane |
|---|---|---|
| 1 | STRATCOM → klik gwiazdy imperium na `rumor` | nazwa układu **widoczna**; wiersz `Właściciel: obce imperium`; **brak** nazwy imperium i wrogości; `Populacja: ?`, `Życie: ?` |
| 2 | ta sama gwiazda na mapie | pierścień **neutralny** (szary), nie zielony/żółty/czerwony; gwiazda **przygaszona**; **brak** ikon 📡/🌀 i rombu właściciela |
| 3 | panel nie jest przycięty ani dziurawy | wiersze mieszczą się w ramce (trójstan wysokości, §6.3) |
| 4 | poleć statkiem do tego układu, poczekaj na przylot | po przylocie: nazwa imperium **wraca**, wrogość **wraca** (przylot daje `contact`), `Życie` **wraca** (przylot daje `explored`), `Populacja` **nadal `?`** |
| 5 | mapa po przylocie | pierścień **koloru wrogości**, romb właściciela, gwiazda pełnej jasności |
| 6 | **klik własnej gwiazdy macierzystej** (lub własnej kolonii w innym układzie) | `Populacja` pokazuje liczbę (gałąź `!hasOwner`) |
| 7 | konsola | brak błędów |

⚠ **Krok 6 jest najważniejszy z regresyjnych.** Bez gałęzi `!hasOwner` w `SystemReveal.population`
gracz przestałby widzieć populację **własnej** kolonii poza domem — to jedyne miejsce, gdzie
zwężenie mgły mogło uderzyć w gracza zamiast w AI.

⚠ Krok 4 wymaga **cierpliwości**: `contact` przychodzi z `vessel:arrived`, nie z wydania rozkazu.
