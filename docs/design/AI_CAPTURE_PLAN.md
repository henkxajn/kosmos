# AI CAPTURE — podbój, który AI potrafi domknąć · plan doc (**✅ SLICE ZAMKNIĘTY 2026-08-20**)

> # ✅ SLICE ZAMKNIĘTY 2026-08-20 — AC-0…AC-9 wdrożone, GATE 1 + GATE 2 oba PASS
> **Pętla podboju domyka się z własnej inicjatywy AI** — to było jedno zdanie, po które ten slice
> powstał, i jest zmierzone end-to-end, nie przez dźwignię w konsoli.
>
> **GATE 1 PASS** (AI dochodzi i przejmuje kolonię).
> **GATE 2 PASS w całości** (2026-08-20): §1 księga kampanii · §2 widoczność utraty terenu ·
> §3 higiena po utracie kolonii · §4-A rekolonizacja **realnie osiągalna** (zmierzona end-to-end
> trasą warp: `getPlayerColonies()` 0 → 1, statek skonsumowany) · **§4-B ekran końca gry naprawdę
> pada** — „CIVILIZATION DESTROYED", tekst o **podboju**, nie o wymarciu, czas przetrwania 2 lata ·
> §5 regresja odbicia (potwierdzona wcześniej dwukrotnie: W3 GATE 3 §5 oraz GATE P0 §7).
>
> ⚠ **§3 kosztował dodatkowy blok pracy i to był dobry koszt.** Ujawnił, że higiena AC-8 **nie
> przeżywa wczytania zapisu** — awaria odtwarzała się z każdego pliku, bez udziału gracza. Domknięte
> osobnym arciem **BRAMKA WŁASNOŚCI, blok P0** (`COLONY_OWNERSHIP_GUARD_PLAN.md`, GATE P0 §1-§7 PASS).
>
> ⚠ **Co ten slice ŚWIADOMIE zostawia otwarte** (nic z tego nie blokuje zamknięcia):
> **Finding 49** — katalog AI nie ma kadłuba transportowego, więc *produkcyjne* wejście AI w desant
> pozostaje zamknięte (gate wchodził dźwignią `force_invasion`) · **Finding 50** — desant AI biegnie
> na modelu **LEGACY**, nie archetypach · **Finding 111 (P1)** — `canReverseFate` liczy *istnienie*
> kolonizatora, nie jego *zdolność*, więc w jednej z trzech konfiguracji gra **nigdy się nie kończy**.
> ⇒ Kolejność dalszych prac ustalona z właścicielem: **111 → część II bramki własności (D1-D6) →
> reszta rejestru**.
>
> ---
>
> # ✅ PODPISANY 2026-08-19
> **Właściciel podpisał całość 2026-08-19. Implementacja rusza od AC-0 (keeper szwów).**
> D1, D1b, D2 (+ załącznik wariant i), D3 — zatwierdzone 2026-08-19. D4, D5, D6, D7 — potwierdzone
> 2026-08-19 w wariantach domyślnych zapisanych w ich sekcjach. D8 (jednostki startowe do zera) —
> dopisana na życzenie właściciela, **z zakresem rozszerzonym z dwóch miejsc do trzech** po cross-checku
> (`ColonyOverlay._autoSpawnRover`; §D8 Cross-check). **D3=W3 jest wykonalne dopiero po D8 w tym
> rozszerzonym zakresie.**
> Trzeci, adwersarialny pas cross-checku D8 wykonano 2026-08-19 — werdykt **ODRZUCONA** dla zakresu
> z zamówienia (to on wymusił trzecią pozycję D8), **POTWIERDZONA** dla zakresu rozszerzonego (§D8
> Cross-check).
> **Kolejność prac jest wiążąca:** AC-0 → AC-1 → AC-2 → AC-3 (D8) → AC-4 → AC-5 → AC-6 (**GATE 1**) →
> AC-7 → AC-8 → AC-9 (**GATE 2**). Zmiana kolejności wymaga pytania do właściciela.

---

**Arc:** WOJNA I POKÓJ 1.0 · **Workstream:** B · **Slice:** AI_CAPTURE (gate „AI przejmuje kolonię"
z W3 §Findings 51) · **Status:** ✅ **PODPISANY 2026-08-19. Osiem decyzji rozstrzygniętych; implementacja
w toku, kolejność AC-0..AC-9 wiążąca.**
**Parent:** `W3_PLAN.md` §Findings 49-51 (GATE 3 zdany WARUNKOWO) · `WAR_BACKBONE.md` §6 W3+
**Predecessor:** `W3_PLAN.md` (SLICE ZAMKNIĘTY 2026-08-18)
**Basis:** `docs/design/AI_CAPTURE_AUDIT.md` (2026-08-19 — 12 agentów, dwie sondy headless, pięć pasów
adwersarialnych) + druga tura read-only (2026-08-19: pięciu czytelników + trzy pasy adwersarialne pod
konkretne warianty tych decyzji)
**Save:** v101 — **ten plan NIE proponuje bumpu.** Uzasadnienie i warunek graniczny: §Save strategy.
**Zakres kodu w tym dokumencie:** ŻADEN. Plan nie zawiera kodu ani gotowych migracji; każde miejsce, gdzie
decyzja pociągnęłaby zmianę formatu zapisu, jest **jawnie oznaczone** jako taka.

**Konwencja językowa — świadome odstępstwo, PRZYJĘTE przy podpisie.** Podpisana konwencja (`W1_PLAN.md`,
2026-08-14) mówi, że plan-doce łańcucha war-backbone są po **angielsku** (`W1/W2/W3_PLAN.md`), a po polsku
tylko RESUME i checklisty gate'ów. Ten plan jest **po polsku w całości**, bo (a) stoi na polskim audycie
`AI_CAPTURE_AUDIT.md`, (b) plany workstreamów C/D tego samego arca są polskie (`DIRECTOR_SLICE1_PLAN.md`,
`D2_PLAN.md`), (c) decyzje do podpisu czyta właściciel, nie orkiestrator. **Właściciel podpisał dokument
w tej formie 2026-08-19 — plan zostaje polski.** Jeśli slice ma być formalnie W-slice'em (W5?),
przepisanie nagłówków i sekcji analitycznych na angielski jest tanie i należy do osobnej decyzji
redakcyjnej, nie technicznej.

---

## RESUME — czytaj to PIERWSZE (PL)

**Stan na 2026-08-19.** Dokument **PODPISANY**. Kodu jeszcze nie ma — pierwszy commit to **AC-0** (keeper
szwów). Zapis: **v101 bez zmian.**
Wejście: audyt read-only `AI_CAPTURE_AUDIT.md` + druga tura weryfikacji pod warianty decyzji.

**Jedno zdanie, z którego wynika cały ten plan:**

> Mechanizm przejęcia kolonii przez AI **istnieje, jest zamontowany i został zmierzony na żywym silniku**
> (`InvasionSystem._tickCaptureChecks:349-386` → `_captureColony:388` → `ColonyManager.transferColony:654`).
> Nie budujemy funkcji — **odblokowujemy** trzy rzeczy, które trzymają ją zamkniętą: deadlock ruchu
> naziemnego AI, dwie węższe niż zakładano bramki (placówka, rola obrońcy) i księgowość kampanii.

**Rozstrzygnięcia (§Decyzje):**

| decyzja | wynik | status |
|---|---|---|
| **D1** — jednostka desantowa bez celu | **W1 — cel terytorialny** (marsz na `capitalBase`, fallback: najbliższy kafel z budynkiem) | ✅ ZATWIERDZONA |
| **D1b** — gdzie mieszka zmiana | **W1b — rozszerzenie CIAŁA `_tickCombatAI`** (nie osobna metoda) | ✅ ZATWIERDZONA |
| **D2** — placówki | **W2 — lustro warunku budynkowego** (zdobywalne jak u gracza) **+ załącznik (i)**: wybór celu desantu tymczasowo POMIJA placówki, dopóki D1+D2 nie tworzą spójnej ścieżki | ✅ ZATWIERDZONA |
| **D3** — „armia wybita" | **W3 — każda żywa jednostka blokuje** (`:329-331` jednym źródłem prawdy dla obu kierunków) | ✅ ZATWIERDZONA, **wykonalna dopiero po D8** |
| **D8** — jednostki startowe do zera | **usunąć wszystkie darmowe spawny jednostek naziemnych** — ⚠ **TRZY miejsca, nie dwa** | ✅ ZATWIERDZONA (zakres rozszerzony przez cross-check) |
| **D4** — podwójne fale | **W1 — w tym slice** | ✅ POTWIERDZONA (wariant domyślny) |
| **D5** — utrata stolicy | **W1 — świadomie zostawione** + naprawa dwóch defektów towarzyszących | ✅ POTWIERDZONA (wariant domyślny) |
| **D6** — sprzątanie dokumentacji | **W1 — własny commit `docs:` przed kodem** | ✅ POTWIERDZONA (wariant domyślny) |
| **D7** — kolejność wobec GROUND | **W1/W3 — ten slice pierwszy; po D8 oba warianty się zlewają** (patrz D7) | ✅ POTWIERDZONA (wariant domyślny) |
| **D9** — gracz stracił wszystko i nie ma czym odwrócić | **W3 — koniec gry dopiero przy braku ZDOLNOŚCI ODWRÓCENIA** (+ rozstrzygnięcie: magazyn NIE zostaje z graczem) | ✅ PODPISANA, wdrożona w AC-8 |

**⚠ Cztery rzeczy, o których trzeba wiedzieć przy podpisie** (pierwsze trzy zmierzone,
czwarta z lektury źródła — każda zmienia sens wariantów):
1. **Okupacja kafla nie ma dziś ŻADNEGO skutku gospodarczego.** Konsumenci `tile.owner` to wyłącznie
   `InvasionSystem` (bramki przejęcia), `GroundUnitManager` (okupacja) i `ColonyOverlay` (rysowanie
   granic). Zero konsumentów produkcji/handlu/POP. ⇒ wariant „najeźdźca stoi i okupuje" jest dziś
   **wizualną zmianą granicy**, a nie presją na gracza.
2. **Dziś kolonia macierzysta MA dwie darmowe jednostki od pierwszej sekundy partii** — legacy `infantry`
   (60 HP, `GameScene.js:3867`) i `science_rover` (`:3851`), a **trzecia ścieżka dosypuje rovera przy
   KAŻDYM otwarciu mapy**, gdy na planecie nie ma żadnej jednostki (`ColonyOverlay._autoSpawnRover`,
   wołane z `show()` `:443`). Kolonia wtórna i placówka mają **zero jednostek na zawsze**.
   ⚠ **Korekta wcześniejszego zapisu w tym planie:** `CombatSandbox` **nie** startuje z zerem — jego stolica
   idzie przez `autoPlaceBuilding` (bez eventu), więc rover+piechota nie lecą, ale `_autoSpawnRover` widzi
   pustą planetę i **stawia jednego rovera gracza**. ⇒ **D8 zdejmuje to w KAŻDYM scenariuszu naraz**; po D8
   warunek „armia wybita" jest spełniony wszędzie domyślnie, a każda obrona to świadomy wydatek gracza
   (koszary + POP).
3. **Planeta macierzysta nie ma siatki hex do pierwszego otwarcia mapy przez gracza**
   (`ColonyManager.js:345` `grid: null`), a `launchInvasion` bez siatki odmawia
   (`InvasionSystem.js:97-98`, `no_grid`) — mimo że wybór celu desantu **preferuje** macierzystą
   (`:220`). ⇒ ścieżka wejścia zależy od efektu ubocznego UI; gate musi to jawnie ustawić.
4. ⚠ **PIERWSZE TRAFIENIE USUWA JEDNOSTKĘ LEGACY Z GRY — po OBU stronach.** `CombatSystem:303`
   zmniejsza morale przez `(target.morale ?? 0) − 3`, a legacy `createUnit` **nie ustawia** ani `morale`,
   ani `noMorale` (`GroundUnitManager.js:139-168`) ⇒ pierwsze trafienie daje morale **0**, a zamiatacz
   w tym samym tiku (`CombatSystem:232-241`, czyta `morale ?? 100`) robi `groundUnit:disbanded` +
   `removeUnit`. Desant AI jest w całości legacy (`INVASION_UNIT_POOLS`), a startowa piechota gracza też
   (`GameScene.js:3867`). ⇒ **pierwsza wymiana ognia na macierzystej kończy się wzajemną anihilacją**,
   a wtedy `enemyUnits.length === 0` gasi rekord jako `defenders_repelled` (`:365-370`). To `[Z KODU]`,
   nie `[ZMIERZONE]` (headless nie montuje `CombatSystem`) — ale przesądza, co GATE 1 w ogóle może
   zobaczyć, i dlatego pojawia się **D7**.
   ⇒ **Interakcja z D8, korzystna:** po usunięciu jednostek startowych świeża partia **nie ma czym się
   anihilować** — pierwsza wymiana ognia zdarzy się dopiero, gdy gracz sam zbuduje obronę. Domyślnym
   stanem świata staje się dokładnie ten, który GATE 1 chce zmierzyć (kolonia bez obrońców), więc
   **D7=W1 i D7=W3 zlewają się w praktyce w jedno**, a zależność od slice'u GROUND traci pilność.
   Mechanizm z Findings 65 **nie znika** — czeka na pierwszą realną obronę gracza i na desant AI po
   przejściu na archetypy.

---

## Podstawa i pewność (co zmierzone, czego NIE zmierzono)

**Zmierzone wykonaniem** (headless `GameCore`, dwie sondy audytu): przejęcie kolonii przez AI od
ustawionego stanu do `colony:captured previousOwner:"player"` · timer okupacji kafla (0,5417 roku
wyświetlanego; 8 civYears przy próbkowaniu 1 civY) · bezruch najeźdźcy przez 240 i 600 civYears w trzech
układach obrony · przejęcie z żywym garnizonem (hp 100) i żywym `garrison_unit` (hp 30) · pełna pętla
własności AI→gracz→AI bez utraty stanu (pop, budynki, 5 podsystemów podpiętych do `time:tick`) ·
podwójne `colony:captured` przy dwóch falach.

**Zweryfikowane w źródle, nie wykonane:** wszystkie anchory tego planu (dwa niezależne odczyty:
audytor + adwersarz).

**Uczciwe wyznanie pokrycia — czego ten plan NIE wie:**
- **czy desant AI w ogóle wychodzi w normalnej grze.** Obie sondy weszły przez `launchInvasion` wprost.
  Bramka wejścia (`no_drop_capable_hull`) należy do Findings 49 i **nie jest ruszana w tym slice**.
  Konsekwencja: **GATE 1 tego slice'u musi jawnie użyć dźwigni** `WarOverlay` → `force_invasion`
  (`:311` → handler `:363-371`), a nie udawać autonomii.
- **czy walka naziemna rozstrzyga się tak, jak zakładamy** — `GameCore` **nie montuje `CombatSystem`**,
  więc w headless nikt nikogo nie zabija. Każde zdanie tego planu o „AI dobija ostatniego obrońcę" jest
  `[Z KODU]`, nie `[ZMIERZONE]`.
- **czy otwarcie mapy w trakcie inwazji wyciera postęp okupacji** — mechanizm regeneracji siatki jest
  realny (`ColonyOverlay._getGrid` → `ColonyGridResolveLogic.shouldReuseColonyGrid`), okno wąskie, ale
  **nierozstrzygnięte na żywo**.
- **balans.** Ani jedna liczba w tym planie nie jest wynikiem rozgrywki. 6 wyświetlanych miesięcy to
  wartość ZASTANA, nie dobrana.

---

## Kontekst — czym ten slice NIE jest

Nie jest nową mechaniką podboju. Nie jest lustrem `_tryPlayerCapture` (skopiowanie tej metody dałoby
**drugi egzekutor obok żywego** i podpięłoby go do **martwego eventu** `groundUnit:buildingCaptured`,
którego producent nie ma wywołań). Nie jest też rozszerzeniem AI o nową doktrynę.

Jest **usunięciem trzech blokad z gotowej pętli**, **dopisaniem księgowości** (żeby kampania desantowa
miała początek, koniec i widoczność) oraz — od D8 — **wyzerowaniem jednostek startowych**, żeby obrona była
świadomym wydatkiem gracza, a nie prezentem od silnika. Wszystko, co robi zdobywca po przejęciu, już działa i jest zmierzone:
kolonia zostaje żywym obiektem u AI, produkuje, a `ColonyAutoExpander` ją rozbudowuje (4 → 7 budynków
w ~5 civYears).

---

## Stan szwów (skrót audytu, z werdyktami)

| # | szew | stan | szczegół nośny |
|---|---|---|---|
| A1 | egzekutor przejęcia AI | **żywy, zmierzony** | `_tickCaptureChecks:349-386` → `_captureColony:388` → `transferColony:654`; jedyny produkcyjny wywołujący `transferColony` |
| A2 | warunek „stolica u agresora" | **żywy** | `:379-382`, czyta `tile.owner` kafla `capitalBase` |
| A3 | warunek „armia wybita" | **żywy, WĘŻSZY niż nazwa** | `:358-362` filtruje `u.role === 'military'`; `defense/support/drone/civilian` nie blokują |
| A4 | timer 6 wyświetlanych miesięcy (per KAFEL) | **żywy, zmierzony** | `OCCUPY_DURATION = 6/12` × `gameTime` (`GroundUnitManager.js:565`, `:600-601`, `:967`); zerowany w chwili flipu (`:602-604`) |
| A5 | **ruch jednostki desantowej AI** | ⛔ **DEADLOCK** | `_tickCombatAI:997-1007` — cel = najbliższa ŻYWA jednostka gracza; `if (!best) continue`; zero heurystyki terytorialnej |
| A6 | ciało bez stolicy (placówka) | ⛔ **niezdobywalne** | `:380` `if (!capital) continue`; lustro gracza ma gałąź zapasową `:338-342` |
| A7 | trwałość kampanii | ⚠ **gaśnie z ostatnim najeźdźcą** | `defenders_repelled:365-370` wykonuje się PRZED testem stolicy `:379-382` |
| A8 | księgowość fal | ⚠ **jeden rekord na FALĘ** | `invId` z ułamkowego `gameTime` (`:130`); dwa aktywne rekordy ⇒ podwójne `colony:captured`, w tym fałszywe AI→AI |
| A9 | widoczność okupacji | ⛔ **zero** | `tile:ownerChanged` (`GroundUnitManager.js:619`) ma **0 subskrybentów**; `invasion:repelled` tylko `DebugLog`; `getInvasionForPlanet` 0 konsumentów |
| A10 | skutek gospodarczy okupacji | **żaden** | brak konsumentów `tile.owner` poza bramkami, okupacją i rysowaniem granic |
| A11 | pokrycie keeperem | ⛔ **zero plików** | `grep -rln "_tickCaptureChecks\|_captureColony\|defenders_repelled" src/testing/` → pusto |
| A12 | odwracalność (D7 z W3) | **żywa, zmierzona** | skan `_tickPlayerConquestChecks:304-311` sam oddaje kolonię graczowi po wybiciu AI i odbiciu stolicy |
| A13 | jednostki startowe gracza | ⚠ **TRZEJ producenci darmowych jednostek** | `GameScene.js:3851` (rover na stolicy) · `:3867` (piechota obok) · `ColonyOverlay._autoSpawnRover` (`show():443` — rover **przy każdym otwarciu mapy**, gdy planeta pusta). Wszystkie trzy usuwa **D8** |

---

## Decyzje (osiem)

Sześć decyzji zamówionych + D7 (wynikła z weryfikacji wariantów) + D8 (dopisana na życzenie właściciela).
Tabele wariantów **zostają w dokumencie po podpisie** — są zapisem tego, co odrzucono i dlaczego; bez nich
przy pierwszej regresji ktoś „naprawi" decyzję, nie defekt.

Znaczniki: **✅ PODPISANA** (właściciel wskazał wariant, 2026-08-19) · **✅ POTWIERDZONA (wariant
domyślny)** (plan zaproponował wariant, właściciel go potwierdził 2026-08-19 — uzasadnienia i odrzucone
alternatywy zostają w sekcjach).

---

### D1 — Co robi jednostka desantowa AI, gdy nie ma żywego celu do zaatakowania? — ✅ **PODPISANA: W1**

> **W1 — cel terytorialny.** Brak żywego celu ⇒ marsz na kafel `capitalBase`, fallback: najbliższy kafel
> z `buildingId`; po dojściu „hold" (stanie = timer okupacji).
> *Odrzucone:* **W2** (stoi i okupuje) — dziś nie doprowadza do przejęcia pełnej kolonii, a okupacja nie ma
> skutku gospodarczego, więc desant byłby dekoracją; jej „bezpieczeństwo" opiera się na trzech warunkowych
> hamulcach, z których dwa zdejmuje slice GROUND. **W3** (desant celuje w stolicę) — najtańszy technicznie,
> ale odbiera graczowi fazę obrony w polu: podbój stawałby się kwestią jednej wygranej orbity.
> **Wybrano CZAS, nie zaskoczenie:** gracz widzi marsz i ma okno na kontratak.

**Pytanie.** Dziś: nic, na zawsze (`GroundUnitManager.js:1007`). Warunek przejęcia wymaga, żeby gracz
**nie miał** wojska — a wojsko gracza jest **jedynym** magnesem ruchu AI. Te dwa warunki wykluczają się
wzajemnie: to jest cały Finding 51.

| | **W1 — cel terytorialny** | **W2 — stoi i okupuje kafel zrzutu** | **W3 — desant celuje w stolicę** |
|---|---|---|---|
| istota | brak celu ⇒ marsz na kafel `capitalBase`, fallback: najbliższy kafel z `buildingId`; po dojściu „hold" | zero ruchu; cel to sama okupacja kafla, na którym wylądowano | zniesienie wykluczenia stolicy ze strefy zrzutu (`InvasionSystem.js:418`) — desant ląduje NA stolicy (lub przy niej) i tam stoi |
| domyka pełną kolonię? | **TAK** (jedyny wariant, który to robi bez zmiany warunku przejęcia) | **NIE** — bramka czyta wyłącznie kafel `capitalBase`, a strefa zrzutu go wyklucza | **TAK** — natychmiast, timer 6 miesięcy jest jedyną karencją |
| domyka placówkę? | tak, jeśli D2 da warunek budynkowy | tylko **przypadkiem** — strefa zrzutu preferuje kafle **brzegowe** (`:421-424`), nie budynkowe | tak, jeśli D2 da warunek budynkowy (placówka nie ma stolicy do celowania) |
| gdzie zmiana | ciało pętli movera (D1b) | `_findLandingHexes` (opcjonalna preferencja) — albo nigdzie | `_findLandingHexes:418`, jedna bramka |
| koszt techniczny | **średni** — heurystyka celu w jedynym moverze jednostek naziemnych | **zerowy** | **najmniejszy** — usunięcie jednej linii bramki |
| ryzyko | AI po udanym przejęciu ZOSTAJE na koloni (rekord `active:false`, jednostek nikt nie usuwa) ⇒ naiwny predykat wysłałby je na WŁASNĄ stolicę; predykat musi porównywać `unit.owner` z `colony.ownerEmpireId`, **nie** opierać się na rekordzie inwazji | „nic się nie dzieje" **nie jest gwarantowane na przyszłość** — trzy warunkowe hamulce, patrz ⚠ niżej | narracyjnie „spadochroniarze na ratusz"; odbiera graczowi fazę obrony w polu; zero pathfindingu do przetestowania |
| co gracz widzi | armia idzie na ratusz — czytelny front, po drodze flipują puste kafle (`_captureHexOnEntry`) | nic (okupacja nie ma skutku gospodarczego, A10) | desant od razu na stolicy, licznik 6 miesięcy |
| balans | podbój = **kwestia czasu**; obrona gracza ma sens tylko, jeśli D3 poszerzy „armię" | brak presji; desant jako dekoracja | podbój = **kwestia jednego wygranego lądowania** |

**⚠ Trzy warunkowe hamulce wariantu W2** (dlaczego „stoi i nic się nie stanie" nie jest gwarancją):
1. **kolonia ze stolicą w kolejce pending nie ma ŻADNEGO kafla wykluczonego** — flaga `capitalBase` to
   stan siatki wyprowadzany z `BuildingSystem._active`; kafel bez budynku jest dla okupacji „pusty" ⇒
   flip **natychmiastowy**, a gdy stolica potem stanie na tych współrzędnych, AI już jest właścicielem
   kafla ⇒ przejęcie przy **zerowym ruchu**. Dziś chroni nas wyłącznie GEOMETRIA (pool brzegowy vs
   stolica „najbliżej środka"), nie bramka.
2. **`CombatSystem._tryRetreat:392-423` jest drugim, nienazwanym moverem** — teleportuje jednostkę o jeden
   kafel, sprawdzając tylko ocean i obecność wroga (bez budynku, właściciela i stolicy). Martwy dla
   desantu AI **tylko** dlatego, że legacy jednostki nie mają pola `morale`, a `CombatSystem:235` czyta
   `morale ?? 100`. **Przejście desantu AI na archetypy (Finding 50) uruchamia go.**
3. jednostki najeźdźcy pozostają na koloni po przejęciu (patrz „ryzyko" W1) — populacja ruchoma rośnie
   z każdą kampanią.

**Co ta decyzja przesądza dalej.** W1 czyni D2 wariant „warunek budynkowy" **realnym** (jednostka może
dojść do budynku); W2 czyni go **pozornym** (odpaliłby losowo). W3 czyni D3 znacznie ważniejszym — bez
poszerzenia „armii" gracz traci stolicę, mając na planecie żywe garnizony.

**Kryterium do rozstrzygnięcia (pytanie projektowe, nie techniczne):** *czy podbój naziemny ma być dla
gracza kwestią CZASU (widzi marsz, ma okno na kontratak — W1), kwestią JEDNEJ PRZEGRANEJ ORBITY (W3), czy
desant ma pozostać presją symboliczną, a utrata kolonii przyjść inną drogą (W2)?*

---

### D1b — Gdzie mieszka zmiana z D1: w `_tickCombatAI` czy w osobnej gałęzi? — ✅ **PODPISANA: W1b**

> **W1b — rozszerzenie CIAŁA pętli** `_tickCombatAI:997-1013`. Bramka `:991` wyklucza jednostki gracza,
> więc zmiana ich nie dotyka; jedna reguła w jednym miejscu.
> *Odrzucone:* **W2b** (osobna, siostrzana metoda) — druga iteracja po `_units` i drugi zestaw bramek do
> utrzymania; przy pierwszej zmianie reguły rozjechałyby się dwa miejsca.
> ⛔ **Nadal ZAKAZANE (nie jest wariantem, jest pułapką):** guard / early-return **na początku funkcji** —
> `:986-987` to jedyne produkcyjne wejście do `CombatSystem.tick`, więc wyłączyłoby walkę naziemną całej
> gry, w tym gracza, i nic by nie krzyknęło. Ta linia wchodzi do keepera AC-0 jako pin.

Rozstrzygnięcie techniczne, **zmierzone**, dołączone do D1, bo bez niego wariant W1 nie ma adresu.

| | **W1b — rozszerzyć CIAŁO pętli** | **W2b — nowa, siostrzana metoda** |
|---|---|---|
| istota | dopisać gałąź „brak celu ⇒ cel terytorialny" w `_tickCombatAI:997-1013` | nowa `_tickInvasionIntent(dt)` wołana z `tick()` obok `_tickCombatAI` |
| wpływ na jednostki GRACZA | **ŻADEN** — pętla wyklucza je na wejściu: `:991` `if (!atk.owner \|\| atk.owner === 'player') continue`, a stempel `owner` jest ustawiany jawnie u wszystkich producentów i przy restore (`:112`, `:147`, `:1334`, `:1384`) | żaden (własny filtr) |
| zasięg uboczny | jednostki naziemne WSZYSTKICH imperiów: desant + 3 marines `SpawnTestEnemy.js:148` (na własnej koloni, bez rekordu inwazji) + najeźdźcy pozostali po przejęciu | ten sam zbiór, ale filtr pisany od zera |
| koszt | jedna gałąź w istniejącej pętli | druga iteracja po `_units` + drugi zestaw bramek do utrzymania |
| ryzyko | pętla mutuje tylko maszerującą jednostkę, ale skutki marszu piszą stan GRACZA: `_captureHexOnEntry:625-635` → `_changeTileOwner:615-619` (własność kafla) i `_checkMineTrigger:935-964` (konsumpcja pola minowego) — to jest **cecha, nie defekt**, ale gate musi to zobaczyć | rozjazd dwóch pętli przy przyszłych zmianach (dwa miejsca, jedna reguła) |

**⛔ WARIANT ZAKAZANY, do zapisania w planie jako pułapka:** guard / early-return **na początku funkcji**
`_tickCombatAI`. Pierwsze dwie instrukcje (`:986-987`) to jedyne w całym drzewie produkcyjnym wejście do
`CombatSystem.tick` (grep `cs.tick|combatSystem.tick` bez `src/testing` → **jedno trafienie**), a
`CombatSystem` rozstrzyga walkę **wszystkich** jednostek, w tym gracza. Guard na starcie funkcji
**po cichu wyłączyłby graczowi całą walkę naziemną** i nic by nie krzyknęło.
---

### D2 — Placówki: niezdobywalne z projektu, czy luka? — ✅ **PODPISANA: W2 + załącznik (i)**

> **W2 — lustro warunku budynkowego:** `:380` `if (!capital) continue` ustępuje warunkowi „agresor ma ≥1
> kafel z `buildingId`", czyli **dokładnie temu, co ma dziś gracz** (`:338-342`). Placówka staje się
> zdobywalna na tych samych zasadach w obie strony.
> **Załącznik (i) — pomostowo:** dopóki D1 (ruch) i D2 (warunek) nie są wdrożone **jako jedna spójna
> ścieżka**, wybór celu desantu **POMIJA placówki**, żeby nie tworzyć zawieszonych rekordów inwazji.
> ⚠ Filtr musi usiąść **lokalnie w `InvasionSystem._onVesselGroupVictory:217-220`**, NIE w
> `ColonyManager.getPlayerColonies` — ta jest wspólnym helperem dla ~40 konsumentów UI/ekonomii
> (`ColonyManager.js:236-238`).
> *Odrzucone:* **W1** (zamierzona niezdobywalność) — łamie symetrię świadomie i zostawia wyciek rekordów.
> **W3** (pada natychmiast) — placówki to darmowy łup: gracz nie ma ich CZYM bronić (brak koszar, brak POP).
> **W4** (do zniszczenia, nie zdobycia) — wymaga mechaniki niszczenia kolonii, której w grze nie ma; osobny
> slice.
> **Kolejność wdrożenia i moment zdjęcia filtra:** §Zakres i kolejność prac (AC-2 zakłada, AC-5 zdejmuje).

**Pytanie.** `InvasionSystem.js:380` `if (!capital) continue` — ciało bez kafla `capitalBase` nie może
zmienić rąk na rzecz AI **nigdy**. Lustro gracza ma gałąź zapasową (`:338-342`: „≥1 kafel gracza
z budynkiem"). Czy asymetria jest zamierzona?

**Fakty, które trzeba mieć przed odpowiedzią** (wszystkie zweryfikowane):
- **Brak stolicy na placówce jest UTRWALONY w trzech miejscach, celowo:** `createOutpost` jej nie stawia,
  picker budynków ją wyklucza, a heal-up przy wczytaniu zapisu jawnie pomija placówki
  (`ColonyManager.js:2347` `if (!colony.isHomePlanet && !isOutpost)`). Komentarz projektowy mówi wprost:
  „placówki celowo nie mają stolicy/POPów" (`VesselManager.js:3211`). ⇒ **stan „bez stolicy" jest decyzją
  projektową, nie przypadkiem** — ale nikt nie zdecydował, co to znaczy dla podboju.
- **Placówka nie może mieć obrońców rodzimych:** brak koszar (`BuildingSystem.js:876-884`), brak POP,
  `credits: 0`. Obrońca może tam być tylko **przywieziony**. ⇒ warunek „armia wybita" jest na placówce
  spełniony trywialnie, każdym wariantem D3.
- **Placówka gracza ma siatkę ZAWSZE** (`ColonyManager.js:479`), więc desant się na niej **udaje**.
- **Kafle placówki nigdy nie dostają stempla `owner`** — `createOutpost` nie jest w zbiorze zapisów
  `tile.owner`; stempel istnieje tylko w gałęzi REGENERACJI siatki (`ColonyOverlay.js:603`).
- **„Placówki są do zniszczenia, nie do zdobycia" NIE MA dziś żadnej realizacji w kodzie.** Jedyne wejście
  usuwania kolonii (`removeColony`) ma czterech wywołujących: trzy ścieżki fizyki ciała (kolizja,
  wyrzucenie z układu) i debug. Ostrzał orbitalny tyka wyłącznie jednostek. Zero „abandon", zero „raze".
  ⇒ ta teza jest **hipotezą projektową, nie opisem stanu**.
- **Gracz MOŻE dziś zdobyć placówkę AI** — łańcuch pełny i zweryfikowany: placówka AI ma dwa budynki
  (`autonomous_solar_farm` + `autonomous_mine`), kafle `owner=null`, zero obrońców, a skan
  `_tickPlayerConquestChecks` chodzi po **wszystkich** koloniach AI **bez wymogu rekordu inwazji**.
  ⇒ asymetria jest realna i działa **jednostronnie na korzyść gracza**.

| | **W1 — zamierzone (placówka niezdobywalna)** | **W2 — lustro warunku budynkowego** | **W3 — pada natychmiast po wybiciu obrony** | **W4 — do zniszczenia, nie zdobycia** |
|---|---|---|---|---|
| istota | `:380` zostaje; placówka jako cel jest z definicji wyłączona | `:380` → lustro `:338-342`: „agresor ma ≥1 kafel z `buildingId`" | brak stolicy ⇒ warunek stolicy pomijany; decyduje tylko „armia wybita" | nowa mechanika: najeźdźca **niszczy** placówkę (usunięcie kolonii), nie przejmuje |
| symetria z graczem | ⛔ **łamie ją świadomie** (gracz bierze placówki AI, AI nie bierze placówek gracza) | ✅ pełna | ⚠ ostrzejsza niż u gracza (gracz musi posiadać kafel, AI nie musiałoby nic) | ⚠ inna mechanika po każdej stronie |
| realne bez D1? | n/d | **NIE** — bez D1=W1/W3 warunek jest pozorny (jednostki nie chodzą do budynków, a strefa zrzutu preferuje brzeg) | tak — spełnia się sam | tak |
| balans | placówki = bezpieczne przyczółki gracza na zawsze | placówka pada po ~6 wyśw. miesiącach okupacji jednego budynku | placówka pada **natychmiast** po desancie (obrony nie ma i nie da się jej zbudować) — darmowy łup | placówka jest kosztem, nie zdobyczą; AI nie zyskuje bazy |
| koszt | zero kodu (+ załącznik niżej) | jedna gałąź warunku (+ ew. preferencja kafla budynkowego w strefie zrzutu) | jedna gałąź warunku | **nowa mechanika** (usuwanie kolonii przez najeźdźcę) — realnie osobny slice |

**⚠ ZAŁĄCZNIK WYMUSZONY — „wieczna inwazja" na placówce gracza (defekt, nie wybór).**
Niezależnie od wariantu **trzeba coś z tym zrobić w tym slice**, bo to wyciek stanu do każdego zapisu:
wybór celu desantu **nie filtruje placówek** (`InvasionSystem.js:217-220` bierze `getPlayerColonies()`,
a ta nie odsiewa `isOutpost`). Skutek dziś: desant na placówkę **przechodzi** (siatka jest), rekord
`active: true` powstaje — i wtedy `enemyUnits.length > 0` blokuje wygaszenie (`:365-370`), `:380` blokuje
przejęcie, a `:1007` blokuje ruch. **Rekord zostaje aktywny NA ZAWSZE i trafia do każdego zapisu**, a
kolejne wygrane orbity dokładają następne rekordy i jednostki na to samo ciało (`launchInvasion` nie
sprawdza `getInvasionForPlanet`). Trzy tanie wyjścia, do wskazania razem z wariantem: (i) wybór celu
pomija placówki (spójne z W1), (ii) rekord wygasa, gdy cel jest strukturalnie niezdobywalny (jawny
`endReason`), (iii) placówka staje się zdobywalna (W2/W3) i problem znika sam.

**Co ta decyzja przesądza dalej.** W1 wymaga (i) lub (ii) z załącznika. W2 wiąże się z D1 (bez ruchu jest
pozorna). W3 czyni placówki najtańszym celem AI w całej grze — to zmiana profilu zagrożenia dla gracza,
który stawia placówki na księżycach i planetoidach. W4 wychodzi z zakresu tego slice'u.

**Kryterium:** *czy placówka ma być przyczółkiem, który można stracić, czy instalacją, o którą się nie
walczy? A jeśli można ją stracić — czy gracz ma mieć CZYM jej bronić (dziś nie ma: brak koszar, brak POP)?*

---

### D3 — „Armia wybita": które role blokują przejęcie? — ✅ **PODPISANA: W3 (po D8)**

> **W3 — pełna symetria:** blokuje **każda żywa jednostka gracza**, bez filtra roli. Predykat gracza
> `InvasionSystem.js:329-331` staje się **jedynym źródłem prawdy dla obu kierunków** — jedna reguła zamiast
> dwóch, lustro darmowe.
> *Odrzucone:* **W1** (tylko `military`) — nie odpowiada zdaniu „wybić całą armię", a garnizon zostaje
> dekoracją. **W2** (`military` + `defensive`) — lepsze, ale nadal dwa różne predykaty po dwóch stronach,
> a różnica jest widoczna tylko tam, gdzie gracz sam zbudował koszary.
> ⚠ **WARUNEK WYKONALNOŚCI: W3 wchodzi PO D8** — bez D8 darmowy `science_rover` na kafelku stolicy
> blokowałby podbój w nieskończoność. Cross-check tej zależności: **D8 §Cross-check** (wynik: bezpieczne,
> ale dopiero po usunięciu TRZECIEGO spawnu, którego nie było w zamówieniu, i z jednym residuum dla
> starych zapisów).
> ⚠ **Konsekwencja do świadomego przyjęcia (nie defekt):** przy pełnej symetrii **jeden tani cywil na
> własnym kaflu czyni kolonię niezdobywalną**. Najtańsza wersja to nie rekrutacja, tylko **grupa badawcza**
> (`VesselManager.deployAwayTeam:1258` — rover bez koszar i bez POP, hex stolicy jest legalnym celem
> zrzutu). To jest dźwignia „nie oddam kolonii" za jedno kliknięcie. Jeśli ma być droższa, rozstrzygnięcie
> należy do D3 (np. „grupa badawcza nie liczy się jako obrońca"), nie do D8.
> ⚠ **Mina, której D8 NIE usuwa:** jednostka **`offline`** (nieopłacona) jest liczona jako obecna
> (`getUnitsOnPlanet` filtruje tylko `in_cargo`), a `CombatSystem` wyklucza ją z walki ⇒ **niezabijalny
> blokator**. Przy W3 dotyczy to każdej klasy jednostki, nie tylko bojowej. Do rozstrzygnięcia w AC-6
> (najtańsze: `offline` nie liczy się jako obrońca — jednostka bez żołdu nie trzyma terenu).

**Pytanie.** Dziś blokuje wyłącznie `u.role === 'military'` (`InvasionSystem.js:358-362`). Zmierzone:
kolonia pada z żywym legacy `garrison` (hp 100) i z żywym `garrison_unit` (hp 30). Właściciel chce
„zniszczenia CAŁEJ armii wroga".

**Mapa ról (jedna funkcja, jeden konsument — `mapRoleToLegacy`, `unitArchetypes.js:284-290`):**

| jednostka | model | rola instancji | blokuje dziś |
|---|---|---|---|
| `shock_infantry` (`assault`) | archetyp | `military` | ✅ |
| `rocket_artillery` (`ranged`) | archetyp | `military` | ✅ |
| `infantry`, `mech` | legacy | `military` | ✅ |
| `garrison_unit`, `aa_platform` (`defense`) | archetyp | `defensive` | ❌ |
| `garrison` | legacy | `defensive` | ❌ |
| `medic_unit` (`support`) | archetyp | `support` | ❌ |
| `recon_drone` (`scout`) | archetyp | `drone` | ❌ |
| `ground_supply_unit` (`logistics`) | archetyp | `civilian` | ❌ |
| `science_rover` | legacy | `civilian` | ❌ |

| | **W1 — status quo (`military`)** | **W2 — bojowe (`military` + `defensive`)** | **W3 — pełna symetria z graczem (każda żywa jednostka)** |
|---|---|---|---|
| istota | tylko wojska liniowe trzymają teren | garnizony i działa AA też trzymają | jedna reguła dla obu kierunków: żyje cokolwiek ⇒ nie ma przejęcia (tak działa dziś strona gracza, `:329-331`) |
| tempo podboju | najszybsze | średnie | najwolniejsze |
| „wybić całą armię" | ❌ nie odpowiada intuicji | ✅ blisko intuicji | ✅ dosłownie |
| co gracz zyskuje | nic (garnizon jest dekoracją obronną) | **realną opcję obrony**: `garrison_unit` wymaga tylko `barracks_lv1`, **bez bramki tech** | to samo + medyk/dron/łazik jako „ludzka tarcza" |
| konsekwencja uboczna | garnizon **przeżywa** pod nowym właścicielem (nic go nie dotyka), ale nie odbije nic sam — gracz musi go ręcznie zaprowadzić na stolicę | to samo, ale przejęcie wymaga realnej bitwy naziemnej | ⚠ **jedna jednostka `civilian` blokuje podbój w nieskończoność** — a silnik sam stawia `science_rover` NA KAFLU STOLICY (`GameScene.js:3851`) |
| ⚠ mina wspólna dla wszystkich wariantów | jednostka **`offline`** (nieopłacona) jest liczona jako obecna (`getUnitsOnPlanet` filtruje tylko `in_cargo`), a `CombatSystem` wyklucza ją z walki ⇒ **niezabijalny blokator**. Im szerszy wariant, tym większa dziura. | | |

**⚠ Kontekst, bez którego wybór jest w ciemno:** kolonia MACIERZYSTA ma od t=0 jedną jednostkę `military`
(legacy `infantry`, `GameScene.js:3867`), która nigdy nie płaci utrzymania i nie może zostać rozwiązana za
brak Kr. Kolonia wtórna i placówka mają **zero** jednostek na zawsze (stolicę stawia tam
`autoPlaceBuilding`, które **nie emituje** `planet:buildResult`, a spawn i tak celuje w `homePlanet`).
W `CombatSandbox` gracz ma zero jednostek od startu. ⇒ **W1 i W2 różnią się tylko tam, gdzie gracz sam
zbudował koszary; W3 zmienia wszystko, bo łazik ze startu wystarcza.**

**Co ta decyzja przesądza dalej.** W3 sprawia, że D1=W3 (desant na stolicę) staje się nieszkodliwy — bo
łazik na stolicy blokuje przejęcie do czasu jego zabicia. W1 sprawia, że D1=W3 jest natychmiastową utratą
stolicy. Dodatkowo: jeśli reguła ma być **jedna dla obu kierunków** (W3), predykat gracza `:329-331` staje
się źródłem prawdy i lustro jest darmowe.

**Kryterium:** *czy garnizon ma być realną obroną (wtedy min. W2), i czy chcemy jednej reguły dla obu
kierunków (wtedy W3, ze świadomością „nietykalnego łazika")?*

---

### D4 — Podwójne fale desantu = podwójne `colony:captured`: w tym slice czy osobno? — ✅ **POTWIERDZONA: W1** (wariant domyślny)

> **Plan przyjmuje W1 (w tym slice).** Powód: ten slice ZWIĘKSZA częstość zdarzenia — gdy AI zacznie
> domykać podboje, fal będzie więcej — a guard idempotencji ma gotowe lustro w bliźniaku
> (`captureColonyForPlayer:772`). Jedno słowo właściciela przenosi to do osobnego commitu (W2); wtedy
> GATE 2 zapisuje podwójne ogłoszenie jako znany szum, nie jako rozbieżność.

**Zmierzone:** dwie fale na to samo ciało tworzą **dwa aktywne rekordy** (`invId` zawiera ułamkowy
`gameTime`), oba przechodzą warunek przejęcia, `transferColony` wykonuje się **dwa razy** i ogłasza także
przerzut **AI→AI** na koloni, którą agresor już ma (`previousOwner = [player, emp_001]`). Gracz tego nie
widzi **tylko** dzięki bramce u odbiorcy (`GameScene.js:2295` `previousOwner === 'player'`), nie u źródła.
Powiązane: reuse istniejącego rekordu **nie przywraca** `active`, więc druga fala w tym samym tiku po
zgaśnięciu rekordu daje desant, którego nikt nigdy nie rozliczy.

| | **W1 — w tym slice** | **W2 — osobny mały commit, przed lub obok** |
|---|---|---|
| za | ten slice **zwiększa** częstość zdarzenia (gdy AI zacznie domykać podboje, fal będzie więcej); guard idempotencji w `transferColony` jest jednym warunkiem, lustro istnieje w bliźniaku (`captureColonyForPlayer:772`) | izoluje ryzyko: dotyka `ColonyManager`, którego ten slice inaczej nie rusza; łatwiejsze przypisanie regresji |
| przeciw | rozszerza slice na drugi plik (`ColonyManager`) | dwa gate'y zamiast jednego; jeśli poleci później, GATE tego slice'u może zobaczyć podwójne ogłoszenie i zostanie zapisany jako „rozbieżność" |

**Rekomendacja formalna: NIE blokuje planu w żadnym wariancie** — to defekt istniejący od W3, niezależny
od D1-D3. Wymaga tylko rozstrzygnięcia, czy gate tego slice'u ma go zobaczyć jako znany szum, czy nie.

---

### D5 — Utrata stolicy nie kończy gry: w zakresie czy świadomie zostawione? — ✅ **POTWIERDZONA: W1** (wariant domyślny)

> **Plan przyjmuje W1 (świadomie zostawione)** — jako dosłowną kontynuację D7 z W3 („LOSING IS
> RECOVERABLE"): gracz odbudowuje się z pozostałych kolonii albo odbija stolicę, a mechanizm odbicia jest
> zmierzony i działa.
> ⚠ **Niezależnie od wariantu wchodzą dwie naprawy** (to defekty, nie wybór): `_activePlanetId`
> przeskakujący na kolonię AGRESORA (`ColonyManager.js:689` — fallback bez filtru właściciela) oraz
> re-homing floty na `KOSMOS.homePlanet.id`, którego `transferColony` nie rusza.

**Zmierzone:** po utracie kolonii macierzystej `getPlayerColonies()` = **0**, `game:over` **nie leci**
(`checkHomeDestroyed` reaguje na kolizję / `entity:removed` / `life:extinct` / `planet:ejected` / pop=0 —
**nie na zmianę właściciela**), a gra tyka dalej 120 civYears bez awarii. Komentarz
`ColonyManager.js:650` obiecuje game over, którego **nie ma**.

| | **W1 — świadomie zostawione** | **W2 — utrata macierzystej kończy grę** | **W3 — „stolica się przenosi"** |
|---|---|---|---|
| istota | przegrana jest odwracalna (D7 z W3): gracz odbudowuje się z pozostałych kolonii albo odbija stolicę | dopisanie ścieżki `game:over` na `wasHomePlanet` | mechanika przeniesienia stolicy na inną kolonię gracza |
| spójność z arciem | ✅ **dosłownie D7** („LOSING IS RECOVERABLE") | ⚠ sprzeczne z D7 dla ostatniej kolonii — ale zgodne z intuicją „koniec imperium" | ✅ zgodne, ale to nowa mechanika |
| co trzeba mimo wszystko naprawić | **`_activePlanetId` po utracie wskazuje kolonię AGRESORA** (fallback `ColonyManager.js:689` bez filtru właściciela; imperia bootstrapują się PRZED graczem, więc trafia w pierwszą kolonię AI) — to **defekt niezależny od decyzji** | to samo | to samo |
| ⚠ drugi skutek do rozstrzygnięcia | statki gracza: `_onColonyDestroyed` re-homuje flotę na `KOSMOS.homePlanet.id`, którego `transferColony` **nie rusza** ⇒ zmierzone: dwa statki zostały w `fleet[]` kolonii wroga, jeden dostał **przymusowy powrót na planetę zajętą przez wroga** | | |

**Rekomendacja formalna: „co trzeba mimo wszystko naprawić" należy do tego slice'u niezależnie od
wariantu** — gracz, który stracił stolicę, nie może zostać przepięty na panel kolonii wroga.

---

### D6 — Sprzątanie dokumentacji: własny commit czy w ostatnim? — ✅ **POTWIERDZONA: W1** (wariant domyślny)

> **Plan przyjmuje W1 (własny commit `docs:` PRZED kodem).** Powód: dziewięć miejsc w repo opisuje dziś
> stan odwrotny do tego, na którym ten plan stoi (m.in. S7/Z9 mówią o `dispose ×5`, którego nie ma) —
> implementujący trafiłby na sprzeczność w pierwszej godzinie. Commit jest bezpieczny: zero kodu poza
> dwoma komentarzami.

Dziewięć pozycji (pełna lista z cytatami i proponowaną treścią: **§Załącznik A**). Rozmiar: ~20 linii
w pięciu plikach (`W3_PLAN.md` ×3, `CLAUDE.md` ×5 linii + akapit, `ColonyManager.js` ×2 komentarze,
`InvasionSystem.js` nagłówek, `GroundUnitManager.js` + `HexTile.js` komentarze timera).

| | **W1 — własny commit `docs:` PRZED kodem** | **W2 — w ostatnim commicie slice'u** | **W3 — nie w tym slice** |
|---|---|---|---|
| za | plan stoi na tezach, które w repo są dziś opisane odwrotnie; czytelnik implementacji nie trafia na sprzeczność; commit jest bezpieczny (zero kodu) | jedna operacja na dokumentach po ustaleniu faktów; nie trzeba wracać | slice zostaje minimalny |
| przeciw | dwa commity dokumentacyjne (ten plan + sprzątanie) | ⚠ ryzyko, że w trakcie ktoś zaufa staremu opisowi (S7/Z9 mówią o `dispose ×5`, którego nie ma — to zaproszenie do „naprawy", która nic nie naprawia) | ⚠ te same zdania będą mylić następny audyt; jeden z nich (`ColonyManager.js:650`) już raz wyprodukował fałszywe założenie o game over |

**⚠ Uwaga niezależna od wariantu:** dwie pozycje to komentarze **w kodzie** (`ColonyManager.js:604`,
`:650`), więc trafiają do commitu z kodem albo do własnego `chore:`. Reszta to czyste `docs:`.

---

### D7 — Kolejność wobec slice'u GROUND — ✅ **POTWIERDZONA: W1 ≡ W3 po D8** (wariant domyślny)

> **Plan przyjmuje: ten slice PIERWSZY.** D8 zmienia arytmetykę tej decyzji: po usunięciu jednostek
> startowych **domyślnym stanem świeżej partii jest kolonia bez obrońców**, czyli dokładnie ten, w którym
> GATE 1 mierzy domknięcie pętli (marsz → okupacja → przejęcie) bez udziału walki. Wariant W3 („gate na
> koloni bez obrońców") przestaje być kompromisem — staje się stanem naturalnym, więc W1 i W3 **zlewają
> się w jedno**.
> *Odrzucone:* **W2** (GROUND pierwszy) — slice GROUND to zmiana balansu walki naziemnej z własnymi
> gate'ami; odsuwałby W4 bez potrzeby, skoro pętla da się dowieść bez niego.
> ⚠ Findings 65 **zostaje otwarte** i czeka na pierwszą realną obronę gracza.

**Dlaczego to tu jest.** Sprawdzając warianty D1, natrafiliśmy na mechanizm, którego audyt nie miał
(headless nie montuje `CombatSystem`, więc nie mógł go zmierzyć), a który **przesądza, co GATE 1 zobaczy**:

> `CombatSystem:303` zmniejsza morale przez `(target.morale ?? 0) − MORALE_COST_WHEN_HIT(3)`, a legacy
> `createUnit` **nie ustawia** `morale` ani `noMorale` (`GroundUnitManager.js:139-168`). Pierwsze trafienie
> daje więc morale **0**, a zamiatacz w tym samym tiku (`:232-241`, czyta `morale ?? 100`) usuwa jednostkę
> z gry (`groundUnit:disbanded` + `removeUnit`). **Cały desant AI jest legacy** (`INVASION_UNIT_POOLS`),
> **startowa piechota gracza też** (`GameScene.js:3867`).
> ⇒ Pierwsza wymiana ognia na macierzystej to **wzajemna anihilacja**; potem `enemyUnits.length === 0`
> gasi rekord jako `defenders_repelled`. Naprawa D1 sama z siebie **nie da obserwowalnego przejęcia** na
> koloni, która ma choć jednego obrońcę.
> ⚠ Przy okazji: wyjątek „garnizon się nie wycofuje" (`CombatSystem:242` `unit.role !== 'defense'`) jest
> **martwy** — instancje noszą rolę LEGACY (`defensive`), nie archetypową (`defense`), więc warunek jest
> zawsze prawdziwy.

| | **W1 — ten slice PRZED slice'em GROUND** | **W2 — GROUND PIERWSZY, potem ten slice** | **W3 — ten slice, ale GATE 1 na koloni BEZ obrońców** |
|---|---|---|---|
| istota | odblokowujemy pętlę, świadomie przyjmując, że pełny łańcuch „przyjdź → wygraj walkę → przejmij" domknie się dopiero po GROUND | najpierw morale/archetypy desantu (Finding 50 + S12 + R13), potem odblokowanie | odblokowanie teraz; gate mierzy przejęcie tam, gdzie nikt nie strzela (kolonia wtórna albo macierzysta po ręcznym usunięciu piechoty) |
| co GATE 1 pokaże | **prawdopodobnie „inwazja odparta"** — nie z powodu tego slice'u, a z powodu anihilacji legacy | pełny łańcuch od razu | ✅ **czysty dowód domknięcia pętli** (marsz → okupacja → przejęcie), bez udziału walki |
| ryzyko | gate zapisany jako „warunkowy" po raz drugi w tym arcu | ⚠ slice GROUND to zmiana **balansu** walki naziemnej — dłuższy, z własnymi gate'ami; W4 czeka | ⚠ nie dowodzi, że AI **wygra** walkę — tylko że po wygraniu przejmie |
| koszt | zero | duży (osobny slice przed) | zero |

**Co ta decyzja przesądza dalej.** W3 jest kompatybilne z każdym wariantem D1-D3 i pozwala domknąć ten
slice w tydzień; W2 daje jeden pełny łańcuch, ale odsuwa W4; W1 to świadome przyjęcie drugiego warunkowego
gate'u.

**Kryterium:** *czy chcemy dowodu, że PĘTLA się domyka (W3), czy dowodu, że AI WYGRYWA (W2)?* To dwie różne
rzeczy i tylko jedna z nich należy do tego slice'u.
---

### D8 — Jednostki startowe do zera — ✅ **PODPISANA (zakres ROZSZERZONY przez cross-check)**

**Intencja właściciela, dosłownie:** *„gra powinna zaczynać się bez żadnych jednostek, gracz i AI budują
wszystko od zera"*.

**Zakres w TYM slice — TRZY miejsca, nie dwa.** Zamówienie wskazywało dwa; cross-check (niżej) wykrył
trzecie, które samo odtwarzałoby usuniętą jednostkę:

| # | co | anchor | dlaczego to jest w zakresie |
|---|---|---|---|
| 1 | spawn `science_rover` na kaflu **stolicy** | `GameScene.js:3851` (w `_initRoverSpawnListener`) | zamówienie |
| 2 | spawn legacy `infantry` na kaflu sąsiednim | `GameScene.js:3867` (ten sam listener) | zamówienie |
| 3 | ⚠ **`ColonyOverlay._autoSpawnRover`** — `science_rover` **na kaflu stolicy**, przy **każdym** otwarciu panelu kolonii bez jawnego `colonyId` | wywołanie `show():443`, metoda `:446-467` | **znalezione w cross-checku**; bez tego D8 nie realizuje intencji |

**⚠ Dlaczego nikt tego nie widział — i dlaczego po D8 to WYJDZIE na wierzch.** W `show()` kolejność jest
taka: `:437` `_getGrid` stawia stolicę (→ `planet:buildRequest` → `planet:buildResult`), co budzi listener
z `GameScene` i daje rover+piechotę; dopiero potem `:443` woła `_autoSpawnRover`, który widzi już
**units > 0** i milczy. Dziś jest więc **zamaskowany cudzym spawnem**. Po usunięciu pozycji 1 i 2 bramka
`:452` przepuszcza i to on staje się jedynym producentem startowym ⇒ **nowa gra ruszyłaby z JEDNYM roverem
zamiast z zerem**, czyli wprost wbrew literze D8.

**⚠ Dlaczego pozycja 3 jest krytyczna, a nie kosmetyczna.** Jej jedyne bramki to „planeta macierzysta"
(`:449`) i **„na planecie nie ma ŻADNEJ jednostki"** (`:452`, `getUnitsOnPlanet(...).length > 0` → return).
To czyni z niej **samonaprawiający się blokator**: w chwili, gdy planeta zostaje pusta — czyli dokładnie
w końcówce inwazji, po wybiciu obrony — pierwsze otwarcie mapy przez gracza **stawia świeżego rovera na
stolicy**. Przy **D3=W3** (każda żywa jednostka blokuje) taki rover zamraża podbój na zawsze, a gracz nigdy
świadomie go nie zbudował. Usunięcie pozycji 1 i 2 bez pozycji 3 dałoby więc **wrażenie** wykonania D8 przy
zachowanej minie.

**Sposób wykonania — dwa doprecyzowania, oba kupione weryfikacją:**
- `_autoSpawnRover` znika **w całości** (wywołanie `:443` + metoda `:446-467`), nie za flagą: konwencja
  „reversible-via-flag" dotyczy warstw UI, a to jest reguła świata gry;
- **usuwamy CAŁY `_initRoverSpawnListener`** (`GameScene.js:3830-3876`) razem z rejestracją (`:2240`)
  i nieaktualnymi komentarzami, nie tylko dwie linie `createUnit`. Powód: **rejestracja nie jest bramkowana
  `savedData`**, więc listener wisi uzbrojony także po wczytaniu zapisu i czeka na jedynego żywego producenta
  `planet:buildResult{colony_base}` — fallback stolicy w `ColonyOverlay.js:633`. Pusta skorupa zostawiłaby
  uzbrojony mechanizm bez ładunku, gotowy do przypadkowego ponownego podłączenia.

#### D8 §Cross-check — czy po D8 coś jeszcze stawia jednostkę graczowi bez jego decyzji

**Metoda:** zamknięcie zbioru producentów, nie grep po nazwach. Wszystkie jednostki powstają w
`GroundUnitManager` w dwóch gałęziach `createUnit` (`:130` archetyp, `:168` legacy) oraz przy restore
(`:1376`, `:1380`); `GroundUnitFactory.create` ma dokładnie dwóch wywołujących, **oba w `GroundUnitManager`**
(`:107`, `:1331`); poza tym **nikt nie pisze do `_units`**. Zbiór wywołujących `createUnit` jest zatem
kompletny i wynosi siedem pozycji:

| producent | anchor | wyzwalacz | po D8 mina? |
|---|---|---|---|
| rover startowy | `GameScene.js:3851` | listener `planet:buildResult`/`colony_base` | **usuwany (D8 poz. 1)** |
| piechota startowa | `GameScene.js:3867` | ten sam listener | **usuwany (D8 poz. 2)** |
| rover „na otwarcie mapy" | `ColonyOverlay.js:466` | `show()` panelu kolonii | **usuwany (D8 poz. 3)** |
| rekrutacja | `ColonyManager.js:1412` | gracz: koszary + POP + kolejka | nie — **świadomy wydatek** |
| desant gracza | `Vessel.unloadGroundUnit` → UI ładowni | gracz: załadunek + zrzut | nie |
| grupa badawcza | `VesselManager.deployAwayTeam:1258` | gracz **wybiera kafel lądowania** (komentarz `:1250`) | nie — decyzja gracza |
| desant AI | `InvasionSystem.js:124` | wygrana orbita + `launchInvasion` | nie — to jest przeciwnik |
| dźwignie debug | `GameScene.js:1205` (`KOSMOS.debug.spawnMyUnit`), `SpawnTestEnemy.js:148` | jawne wywołanie z konsoli | nie |

Dodatkowo sprawdzone i **czyste**: `RandomEventSystem` (zero trafień), `AnomalyEffectSystem`,
`groundAbilities`, `ArmySystem`, drzewo POI, technologie (`unlockShip`/`unlockBuilding`, brak „unlockUnit"),
`CargoLoadModal`/`DropTroopsModal` (przenoszą istniejące) — **żadne nie tworzy jednostki**.
`SaveMigration` **nie zasiewa** jednostek (zero `createUnit`, zero literałów jednostki).
`GameCore` (headless) nie rejestruje listenera i nie ma UI ⇒ zero jednostek startowych.

**Pokrycie scenariuszy — D8 zdejmuje wszystkie naraz** (dziś każdy startuje z darmowym wojskiem):

| scenariusz | jak powstaje stolica | co dostaje gracz DZIŚ | po D8 |
|---|---|---|---|
| „Nowa gra" (`civilization_boosted`) | fallback UI → `planet:buildRequest` → `_build` ⇒ **event leci** | rover **na stolicy** + piechota obok | 0 |
| `power_test` | j.w. | rover + piechota | 0 |
| `civilization` (plain — dziś nieosiągalny z menu) | j.w. | rover + piechota | 0 |
| `combat_sandbox` | `autoPlaceBuilding` ⇒ **event NIE leci** | **1 rover** z `_autoSpawnRover` | 0 |
| wczytany zapis | stolica już jest | nic nowego… **ale** listener jest rejestrowany bezwarunkowo i czeka; przy koloni bez stolicy w `_active` dosypie rover+piechotę **na macierzystą** | 0 |

**Dwie noty implementacyjne do lustra predykatu (AC-5), obie zweryfikowane:** `owner` domyśla się na
`'player'` we **wszystkich** ścieżkach tworzenia i w restore (`GroundUnitManager.js:112`, `:147`, `:1384`),
więc lustro może bezpiecznie testować `u.owner === 'player'` — ale **nie wolno** traktować `owner == null`
jako sygnału. `getUnitsOnPlanet` pomija `status === 'in_cargo'` (`:236`), więc jednostka gracza w ładowni
statku na orbicie **nie** blokuje przejęcia — zgodne z intencją („na powierzchni nikogo nie ma").

**WYNIK CROSS-CHECKU — dwuczęściowy, i druga część jest warunkiem:**

1. ✅ **NOWA GRA po D8: mina z D3=W3 znika.** Po usunięciu trzech pozycji żaden mechanizm nie stawia
   jednostki na koloni gracza bez jego decyzji. Każda jednostka na mapie jest odtąd skutkiem rekrutacji,
   zrzutu albo grupy badawczej — czyli czegoś, co gracz zrobił i widzi.
2. ⚠ **ZAPIS W TOKU: mina ZOSTAJE, D3=W3 na starym zapisie nadal ma blokera.** `GroundUnitManager.restore`
   (`:1326-1390`) odtwarza jednostki z zapisu, a **ten plan nie proponuje migracji**. Gracz, który ma
   partię sprzed D8, wczyta ją z roverem na stolicy i startową piechotą — i te jednostki będą blokować
   podbój, dopóki ich nie rozwiąże. **To nie jest mina „bez wiedzy gracza"** (jednostki są widoczne,
   własne i rozwiązywalne ręcznie: `UnitCardPanel` → disband), więc plan **nie** proponuje ich kasowania.
   ⚠ **Gdyby właściciel chciał wyczyścić stare zapisy — to JEST migracja** (nowa wersja + wpis w
   `SaveMigration`), czyli osobna decyzja poza tym planem; zapisane tu jawnie, żeby nikt nie dopisał
   jej „przy okazji".

**Pas adwersarialny (osobny agent, teza „po D8 nie ma już miny"): WERDYKT — ODRZUCONA dla zakresu
z zamówienia, POTWIERDZONA dla zakresu rozszerzonego.** Adwersarz wskazał dokładnie te same trzy ścieżki
(`_autoSpawnRover` jako spawn startowy · `_autoSpawnRover` jako odnawialny respawn · restore starych
zapisów) i nie znalazł czwartej. Zbiór producentów zamknięty niezależnie przez trzy odczyty.

**Świadomie POZA zakresem D8 (do rejestru, zadanie slice'u GROUND):**
- **typ `infantry` NIE jest kasowany z katalogu** — `INVASION_UNIT_POOLS` używa go dla `xenophage`,
  `swarm`, `hegemon`, `trader`, `isolationist`, więc AI musi mieć czym desantować aż do GROUND;
- **pełne skasowanie `infantry` + redesign `INVASION_UNIT_POOLS` na identyfikatory archetypów** —
  ⚠ **nie jest to podmiana 1:1**, tylko realny dobór miksu jednostek per archetyp imperium (kto zrzuca
  szturm, kto artylerię, kto garnizon) ⇒ GROUND, obok S12 (morale) i R13 (RNG). Findings 67-68.

---

### D9 — Gracz stracił WSZYSTKO i nie ma czym tego odwrócić: co wtedy? — ✅ **PODPISANA: W3** (2026-08-19)

> **✅ PODPISANE 2026-08-19: W3** — koniec gry dopiero przy braku ZDOLNOŚCI odwrócenia, z czterema
> doprecyzowaniami z tej sekcji.
> **Rozstrzygnięcie towarzyszące (właściciel):** **magazyn NIE zostaje z graczem** po utracie
> ostatniej kolonii. *„Dziś gracz nielegalnie korzysta z magazynu kolonii, która już nie jest jego —
> to dziura, nie projekt."* Konsekwencja przyjęta świadomie: **rekolonizacja zawęża się do statku
> JUŻ W LOCIE, z zasobami już załadowanymi**; nowej misji z zera wysłać się nie da. To nadal
> prawdziwa ścieżka odwrócenia (zmierzona, działająca), tylko węższa niż dzisiejsza przypadkowa.
> **Wdrożone w AC-8** (`bb614ed`) jako jedna zmiana z D5 — patrz §Zakres, wiersz AC-8.
> ⚠ **Pułapka zamknięta przy okazji:** `MissionSystem` bramkował koszt startu wzorem
> `if (this.resourceSystem) {…}`, więc samo ODPIĘCIE magazynu czyniłoby misje **darmowymi** —
> odwrotność tego rozstrzygnięcia. Obie bramki zaostrzone do „brak magazynu ⇒ ODMOWA".

**Pytanie właściciela (2026-08-19, po GATE 1).** D5 rozstrzygnęło, że utrata stolicy NIE kończy gry,
bo „przegrana jest odwracalna" (D7 z W3: *LOSING IS RECOVERABLE*). Ale to założenie milcząco
zakłada, że **odwrócenie jest WYKONALNE**. Scenariusz dotąd nieprzetestowany: gracz traci JEDYNĄ
kolonię **i** nie ma żadnych środków, żeby ją odbić ani założyć nową. Czy to ma wyzwalać istniejące
`game:over`, czy coś innego?

**⚠ Wymóg właściciela do KAŻDEGO wariantu, który liczy „zdolność do odbicia":** test musi sprawdzać
**DWIE rzeczy naraz**, a nie jedną —
1. **statek zdolny do desantu** (`canDropTroops` = moduł `drop_pods` + `troop_bay_*`), gdziekolwiek
   we flocie gracza, **ORAZ**
2. **jednostki naziemne gracza gdziekolwiek w grze** — na pokładzie tego statku LUB czekające do
   załadowania (w porcie, w kolejce) — cokolwiek, co faktycznie da się przewieźć.

> Sam punkt 1 bez punktu 2 to **pusty transportowiec: potencjał bez zdolności**. Warunek końca gry
> ma się spełnić, gdy **BRAKUJE KTÓREGOKOLWIEK Z DWÓCH**, nie dopiero gdy brakuje obu naraz —
> bo bez każdego z osobna odbicie i tak jest niewykonalne.

#### Co ZMIERZONO na potrzeby tej decyzji (2026-08-19, headless na kodzie po AC-7)

| # | fakt | znacznik |
|---|---|---|
| 1 | **Rekolonizacja BEZ ŻADNEJ kolonii DZIAŁA.** `canLaunchColony` zwraca `ok:true` przy zerze kolonii gracza (wszystkie sub-flagi true), a `_processColonyArrival` zakłada kolonię, choć kolonii-matki nie ma (odwołania do niej są przez `?.`). Zmierzone: `getPlayerColonies()` **0 → 1**. ⇒ **Odwrócenie losu ma TRZECIĄ ścieżkę** obok desantu: statek `canColonize` (moduł `habitat_pod`/`cryo_pod`) w locie albo zdatny do startu. | `[ZMIERZONE]` |
| 2 | …ale bramka wyrzutni przechodzi **tylko dzięki bypassowi dla kadłuba `medium`/`large`** (`_colonyShipBypassPad` czyta `hull.size`). Kolonizator na MAŁYM kadłubie wymaga spaceportu — czyli kolonii albo stacji. | `[ZMIERZONE]` + `[V]` |
| 3 | **Koszt startu misji kolonizacyjnej (`COLONY_LAUNCH_COST` = Fe 150 / C 50 / Ti 20 / food 100 / water 50) płacony jest z magazynu AKTYWNEJ kolonii — a ta po utracie jest kolonią WROGA.** Zmierzone: po `transferColony` `activePlanetId = entity_94`, `ownerEmpireId = emp_001`, a `MissionSystem.resourceSystem` zostaje na nią przepięty. ⇒ dziś gracza „stać" na rekolonizację **z magazynu przeciwnika**. | `[ZMIERZONE]` |
| 4 | ⚠ **Sprzężenie z AC-8:** naprawa fallbacku aktywnej kolonii (filtr właściciela) **ZAMKNIE tę ścieżkę finansowania**. Po AC-8 gracz z zerem kolonii nie będzie miał magazynu, z którego opłaci start — czyli ścieżka 1 zadziała tylko dla statku **JUŻ W LOCIE**. To jest dokładnie ten sam pusty `else`, który AC-8 tworzy i który D9 ma wypełnić. | `[Z KODU]` |
| 5 | Kolejka rekrutacji jako źródło „wojska czekającego do załadowania" jest przy zerze kolonii **pusta z konstrukcji** — kolejki żyją na koloniach. Zostają: jednostki w ładowni (`status:'in_cargo'`) i jednostki stojące na powierzchni. | `[V]` |

#### Warianty

| | **W1 — status quo** | **W2 — zero kolonii = koniec gry** | **W3 — koniec gry dopiero przy braku ZDOLNOŚCI ODWRÓCENIA** (kierunek właściciela) | **W4 — brak końca gry, ale jawny STAN WYGNANIA** |
|---|---|---|---|---|
| istota | nic się nie zmienia; gra tyka dalej, gracz bez kolonii siedzi w interfejsie bez treści | `game:over` w chwili, gdy `getPlayerColonies().length === 0` | `game:over` dopiero gdy zero kolonii **I** żadna ścieżka odwrócenia nie jest wykonalna: **(a) desant** — statek `canDropTroops` **I** jakakolwiek jednostka naziemna gracza (brak KTÓREGOKOLWIEK ⇒ ścieżka martwa); **(b) rekolonizacja** — statek `canColonize` zdatny do startu albo już w locie | gra się nie kończy, ale stan jest NAZWANY: ekran/panel „nie masz nic i nie masz czym odzyskać", z jawnym warunkiem powrotu; `game:over` zostaje wyłącznie dla fizycznej śmierci ciała |
| spójność z D7 („LOSING IS RECOVERABLE") | ✅ dosłowna — ale doprowadzona do absurdu (gra bez możliwości działania) | ⛔ łamie ją wprost | ✅ **precyzuje ją**: przegrana jest odwracalna dopóki JEST czym odwracać | ✅ zachowuje, przenosi ciężar na komunikat |
| co gracz widzi | pusty interfejs, brak sygnału | natychmiastowy ekran końca | ekran końca dopiero, gdy naprawdę nie ma ruchu | jasny komunikat + dalsza gra (obserwacja) |
| koszt | zero | mały (jedna bramka) | **średni** — predykat z dwóch/trzech ścieżek + decyzja o kadencji (niżej) | średni (UI + i18n PL/EN) |
| ryzyko | „gra, w której nie da się nic zrobić" czyta się jak zawieszenie, nie jak decyzja projektowa | zabija statek kolonizacyjny w locie, który ZMIERZALNIE potrafi odbudować imperium (fakt 1) | ⚠ **snapshot vs trwałość** — patrz niżej | brak końca gry może nie dać domknięcia narracyjnego |

#### ⚠ Cztery rzeczy, które W3 musi rozstrzygnąć, żeby nie był pułapką

1. **Kadencja, nie migawka.** Test „nie ma czym odwrócić" wykonany W CHWILI utraty zabiłby gracza,
   któremu statek kolonizacyjny dolatuje za trzy lata. Predykat musi być **trwały**: sprawdzany
   cyklicznie i wymagający utrzymania stanu przez N lat, a nie jednorazowy.
2. **Istnienie vs osiągalność.** Po utracie jedynej kolonii jednostki naziemne gracza stoją na
   ciele należącym **już do wroga**. „Da się przewieźć" jest w praktyce nierozstrzygalne (zależy od
   walki, orbity, paliwa). Proponuję liczyć **ISTNIENIE**, nie osiągalność — inaczej predykat
   będzie zgadywał.
3. **Statek w locie liczy się tak samo jak zadokowany** — inaczej wariant przeczy faktowi 1.
4. **Interakcja z AC-8 (fakt 4).** Jeśli AC-8 zamknie finansowanie startu, ścieżka „rekolonizacja"
   zawęża się do statku JUŻ W LOCIE. Wtedy albo D9 przyjmuje to świadomie, albo AC-8 musi zostawić
   graczowi bez kolonii jakiś magazyn (np. ładownię statku) — **to jest ta sama decyzja, nie dwie**.

#### Co ta decyzja przesądza dalej

**W1/W4** nie dotykają reguł końca gry — AC-8 wypełnia swój pusty `else` samym brakiem przełączenia
(+ komunikat w W4). **W2/W3** dokładają ścieżkę `game:over` do `GameScene.checkHomeDestroyed`, która
dziś reaguje **wyłącznie** na fizyczne zniszczenie ciała i pop=0, nigdy na zmianę właściciela — więc
to jest **nowa gałąź**, nie parametr istniejącej. W3 dodatkowo wymaga predykatu, który sam w sobie
jest kandydatem na wspólną funkcję obok `hasLivingDefender` / `holdsDecisiveGround`.

**Kryterium (pytanie projektowe, nie techniczne):** *czy „przegrana jest odwracalna" ma być
obietnicą BEZWARUNKOWĄ (W1/W4 — gra nigdy się nie kończy z powodu polityki), czy obietnicą
WARUNKOWĄ (W3 — trwa dopóki gracz ma czym odwracać), a jeśli warunkową, to czy gracz ma dostać
ekran końca (W3), czy nazwane wygnanie z otwartą furtką (W4)?*

---

## Zakres i kolejność prac (commit plan — WARUNKOWY na decyzjach)

Kolejność jest **wiążąca** i wynika z trzech zależności, każdej podpisanej: **keeper przed każdą zmianą
zachowania** · **D8 przed D3** (inaczej darmowy rover blokuje podbój) · **filtr placówek (D2 załącznik i)
zakładany wcześnie i zdejmowany dopiero wtedy, gdy D1+D2 tworzą spójną ścieżkę** — czyli w tym samym
commicie, w którym placówka staje się realnie zdobywalna.

| # | commit | treść | wynika z | gate |
|---|---|---|---|---|
| **AC-0** | `test(ai): keeper szwów przejęcia kolonii przez AI` | pinuje STAN DZISIEJSZY **wykonaniem**: (a) najeźdźca bez celu nie rusza się przez N tików; (b) `if (!capital) continue` — placówka nie pada; (c) `garrison_unit` nie blokuje przejęcia; (d) timer okupacji liczony w latach WYŚWIETLANYCH; (e) przejęcie domyka rekord `endReason:'colony_captured'`; (f) **trzy miejsca spawnu jednostek startowych istnieją** (pin, który AC-3 celowo przewróci). Każdy pin z **kontrolą pinu** | — | — |
| **AC-1** | `docs: sprzątanie opisów po W3-1 i C-6` | §Załącznik A, pozycje `docs`-only (dwa komentarze w kodzie idą z AC-8) | D6 | — |
| **AC-2** | `fix(ai): desant nie celuje w placówki (pomost)` | **jedna** bramka `isOutpost` **lokalnie** w `InvasionSystem._onVesselGroupVictory:217-220` (⚠ NIE w `getPlayerColonies` — wspólny helper ~40 konsumentów). Zamyka wyciek „wiecznej inwazji" **natychmiast**, zanim cokolwiek innego ruszy | D2 zał. (i) | — |
| **AC-3** | `feat(game): brak jednostek startowych (gracz i AI budują od zera)` | **D8, trzy miejsca**: `GameScene.js:3851`, `:3867` (+ ewentualnie cały `_initRoverSpawnListener`) oraz `ColonyOverlay._autoSpawnRover` (`show():443` + `:446-467`). Keeper AC-0(f) **ma tu paść i zostaje przepisany świadomie** | **D8** | — |
| **AC-4** | `feat(ai): intencja terytorialna jednostek desantowych` | **D1 + D1b**: gałąź celu w CIELE `_tickCombatAI:997-1013` · predykat „obce ciało" po `unit.owner` vs `colony.ownerEmpireId` (**nie** po rekordzie inwazji — R-1) · nowe powody odmowy do `DebugLog.TRACKED_EVENTS` **w tym samym commicie** | **D1, D1b** | — |
| **AC-5** | `feat(ai): symetryczny warunek „armia wybita"` | **D3=W3**: `:358-362` przechodzi na predykat z `:329-331` (jedno źródło prawdy dla obu kierunków) + rozstrzygnięcie `offline`. **MUSI być po AC-3** | **D3** (po D8) | — |
| **AC-6** | `feat(ai): ciało bez stolicy jako cel podboju` | **D2=W2**: `:380` ustępuje lustru warunku budynkowego `:338-342` **ORAZ ZDJĘCIE pomostu z AC-2** — od tego commitu placówka jest normalnym celem. To jest moment, w którym D1+D2 są „spójną ścieżką" | **D2** | **GATE 1** |
| **AC-7** | `fix(ai): jedna kampania na ciało (koniec podwójnych fal)` | **D4**: guard idempotencji w `transferColony` (lustro `:772`) + `getInvasionForPlanet` przed nowym rekordem + reaktywacja zgaszonego rekordu | D4 | GATE 2 |
| **AC-8** ✅ `bb614ed` | `feat(game): higiena po utracie kolonii + koniec gry przy braku odwrotu` | **D5 + D9=W3 jako JEDNA zmiana** (właściciel: „to jedna decyzja, nie dwie"): filtr właściciela w fallbacku aktywnej kolonii · `_detachActiveColony` (magazyn NIE zostaje) · **zaostrzone bramki kosztu w `MissionSystem`** (bez tego odpięcie magazynu czyniłoby misje darmowymi) · re-homing floty wyłącznie do kolonii GRACZA · NEW `utils/PlayerViability.js` + `_tickPlayerViability` (karencja 12 civY) · `game:over` `conquered` + i18n · dwa komentarze z §Załącznika A | D5, **D9** | GATE 2 |
| **AC-9** | `feat(ui): gracz widzi, że traci kafle` | konsument `tile:ownerChanged` (dziś 0 subskrybentów) → Dziennik/dzwonek; konsument `invasion:repelled`; ⚠ i18n PL+EN dla każdego nowego tekstu | — | GATE 2 |

**Per-commit gates (bez wyjątków):** `node src/testing/smoke/run-all.mjs` **0 FAIL** ·
`node tools/check-i18n.mjs` **PASS** · zapis **v101 bez migracji** · commit atomowy, staging po jawnych
ścieżkach, `git status --short` + `--cached --stat` pokazane właścicielowi **przed** commitem.

**AC-0 jest niepodzielne i pierwsze.** Ta połowa silnika ma dziś **zero** plików keepera (A11), więc
każdy commit AC-2..AC-7 bez niego zmienia zachowanie, którego nikt nie zmierzył.

**⚠ Dwa okna niespójności, oba świadome i oba zamykane w tym samym slice:**
1. **AC-2 → AC-6**: placówki są w tym okresie **wyłączone jako cel** desantu. To jest cofnięcie o krok
   względem stanu dzisiejszego (dziś desant na placówkę „przechodzi", tylko nigdy się nie kończy) — i o to
   chodzi: lepiej nie zaczynać kampanii, której nie da się rozstrzygnąć, niż zostawiać rekordy w zapisie.
   **AC-6 zdejmuje pomost w tym samym commicie, w którym daje warunek zwycięstwa.**
2. **AC-3 → AC-5**: między usunięciem jednostek startowych a wejściem symetrycznego predykatu obowiązuje
   stary, wąski warunek (`military`). Efekt jest łagodny: kolonia bez jednostek i tak spełnia oba warianty.

**⚠ Zależność od D7 — po D8 przestaje wiązać.** Gdyby właściciel jednak wybrał **D7=W2** (GROUND pierwszy),
cała tabela przesuwa się za tamten slice bez zmian w treści.

---

## Save strategy

**Ten plan nie proponuje bumpu. Zapis zostaje v101.** Uzasadnienie: żaden wariant żadnej decyzji nie
wymaga nowego pola trwałego —
- warunki D1/D2/D3 czytają stan, który już persystuje: `tile.owner`, `tile.capitalBase`,
  `tile.occupyEmpireId`, `tile.occupyStart` (`HexTile.js:293`, `:301-303`, restore `:314`, `:323-324`)
  oraz rekord inwazji (`gameState.invasions`, zadeklarowany w `createDefaultState`, `GameState.js:32`);
- D4/D5/D6 są bezstanowe.

**Warunek graniczny — jawnie, żeby nikt nie wprowadził migracji przypadkiem:**
1. jeśli któraś decyzja zażąda **licznika czasu na poziomie kolonii** („AI trzyma stolicę od…"), nośnikiem
   ma być **rekord inwazji** — to worek dowolnych pól w już zadeklarowanej domenie, więc nadal **bez
   bumpu**; wolne i martwe pole `inv.playerEmptySince` (`InvasionSystem.js:141`, zero odczytów) nadaje się
   dosłownie;
2. **nowe pole na `HexTile` to inna klasa zmiany** — kafle są serializowane per-kolonia w tysiącach
   instancji; jeśli ktoś to zaproponuje, wymaga osobnej decyzji i **jawnego wpisu w protokole migracji**,
   nawet gdy `?? default` technicznie wystarcza;
3. ⚠ **`ownerEmpireId` kolonii NIE jest serializowany** — własność wraca z `empires[].colonies` przez
   relink po wczytaniu. Każda decyzja, która zmienia własność, musi zostawić stan spójny **z punktu
   widzenia relinku**, nie tylko runtime'u.
4. ⚠ **D8 też nie wymaga bumpu — i celowo NIE czyści starych zapisów.** Usuwamy *producentów* jednostek
   startowych; `GroundUnitManager.restore:1326-1390` odtwarza to, co w zapisie już jest, więc partia
   w toku zachowa rovera i piechotę. Są to jednostki gracza: widoczne, własne, rozwiązywalne ręcznie
   (`UnitCardPanel` → disband). **Wyczyszczenie ich ze starych zapisów byłoby MIGRACJĄ** (bump + wpis
   w `SaveMigration`) i jest **poza tym planem** — zapisane jawnie, żeby nie dopisał jej nikt „przy okazji".
   ⚠ **Gdyby właściciel jednak chciał czyścić — kształt filtra jest już zweryfikowany** (i to nadal
   **BYŁABY MIGRACJA**, z bumpem): `owner === 'player' && !archetypeId && type ∈ {science_rover, infantry}`
   — rekrutacja produkuje wyłącznie archetypy, więc jednostek gracza nie tknie. **Jeden fałszywy trafiony:**
   rover grupy badawczej (`VesselManager.deployAwayTeam:1258`) ma identyczny kształt, więc filtr musiałby
   go pomijać po `vessel.awayTeamUnitId` — inaczej zerwie powiązanie statek↔grupa.

---

## Testy / keepery

Dziś: **zero pokrycia** (A11). Keepery idą do `src/testing/smoke/` (bez prefiksu `tmp_`), a każdy pin
musi być **dowiedziony wykonaniem** (fail-first) i mieć **kontrolę pinu** — inaczej keeper, który po cichu
nie robi nic, przechodzi sweep i niczego nie chroni.

| keeper | commit | co pinuje |
|---|---|---|
| `ai_capture_seams_smoke` | AC-0 | sześć szwów stanu dzisiejszego (a-f z tabeli commitów) + kontrole pinów |
| `ai_capture_intent_smoke` | AC-4 | jednostka bez celu ma cel terytorialny; **najeźdźca na WŁASNEJ koloni się nie rusza** (regresja R-1); jednostki gracza nietknięte; ⛔ `CombatSystem.tick` nadal wołany (pin przeciw guardowi na starcie funkcji — D1b) |
| `ai_capture_outpost_smoke` | AC-2 + AC-6 | AC-2: desant **nie startuje** na placówkę (brak nowych rekordów); AC-6: placówka **pada** wg lustra warunku budynkowego, a pomost jest zdjęty (regresja na obu commitach) |
| `ai_capture_army_smoke` | AC-5 | predykat symetryczny: **każda** żywa jednostka blokuje (rover, medyk, dron), zero = przejęcie; `offline` — zachowanie jawnie zapisane, nie przypadkowe |
| `ai_capture_ledger_smoke` | AC-7 | jedna kampania na ciało; **jedno** `colony:captured` przy dwóch falach |
| `startup_units_zero_smoke` | AC-3 | ⚠ **ODWRÓCENIE pinu z AC-0(f):** świeży boot → **zero** jednostek naziemnych na koloni gracza; **otwarcie panelu kolonii nie tworzy jednostki** (pin dokładnie na `_autoSpawnRover`); rekrutacja nadal działa (kontrola pinu — inaczej keeper przechodziłby przy zepsutej rekrutacji) |

**⚠ CZTERY z sześciu pinów `ai_capture_seams_smoke` mają PAŚĆ i zostać świadomie odwrócone**
(sprostowanie wpisane przy AC-0 — pierwotnie stało tu „jeden, pin (f)"; to było nieprawdziwe, bo pozostałe
trzy odwrócenia wynikają wprost z treści AC-4/AC-5/AC-6, więc nie są niespodzianką, tylko planem):

| pin | co pinuje dziś | odwraca | dlaczego to nie jest regresja |
|---|---|---|---|
| (a) | najeźdźca bez celu STOI | **AC-4** | intencja terytorialna — właśnie po to ten commit istnieje |
| (b) | placówka NIE pada | **AC-6** | lustro warunku budynkowego czyni ją zdobywalną |
| (c) | `garrison_unit` nie blokuje | **AC-5** | symetryczny predykat: blokuje KAŻDA żywa jednostka |
| (f) | trzej producenci spawnu istnieją | **AC-3** | D8 usuwa wszystkich trzech |

**Bez edycji mają przetrwać cały slice WYŁĄCZNIE (d) timer okupacji i (e) księga kampanii.** Kto odwraca
pin, **przepisuje tę tabelę i nagłówek keepera** — nie kasuje testu i nie „naprawia" kodu z powrotem.
Dowód, że keeper naprawdę pilnuje tych szwów, jest wykonaniowy: trzy mutacje źródła (timer w civYears ⇒
4 czerwone asercje; filtr roli → predykat symetryczny ⇒ czerwone dokładnie (c), przy zielonej kontroli
pinu) sprawdzone i wycofane przy AC-0.

**⚠ Ograniczenia harnessu, które trzeba obejść JAWNIE w keeperach** (inaczej mierzą ciszę) — **było trzy,
jest CZTERY** (czwarte odkryte przy pisaniu AC-0):
1. **`GameCore` nie montuje `CombatSystem`** — walka naziemna się nie rozstrzyga. Keeper mierzący „AI dobija
   ostatniego obrońcę" musi go zamontować ręcznie.
2. **Headless nie stempluje `tile.owner`** (kafle zostają `null`), a wtedy jednostka gracza jest „obcym
   okupantem" na własnym kaflu i timer okupacji zeruje się w każdym tiku. Keeper okupacji musi stemplować
   kafle jawnie — inaczej mierzy artefakt harnessu.
3. **`GameCore` nie montuje `stationSystem`** — nieistotne dla tych keeperów, ale zaśmieca log ostrzeżeniem;
   nie interpretować go jako defektu.
4. ⚠ **`src/scenes/GameScene.js` i `src/ui/ColonyOverlay.js` NIE IMPORTUJĄ SIĘ pod node** (zmierzone przy
   AC-0): GameScene ciągnie `three/addons/postprocessing/EffectComposer.js` — ścieżkę spoza `exports`
   pakietu `three`; ColonyOverlay wywraca się na `THREE.TextureLoader is not a constructor`. **Skutek dla
   D8: żadnego z trzech producentów jednostek startowych NIE DA SIĘ w tym harnessie uruchomić**, więc pin
   (f) w AC-0 i jego odwrócenie w AC-3 (`startup_units_zero_smoke`) muszą być **pinami ŹRÓDŁOWYMI**
   (komentarze zdejmowane przed szukaniem + kontrola pinu — wzór `war_seams_smoke` T2b), a nie
   wykonaniowymi. Kto zaplanuje „wykonaniowy dowód zera jednostek na świeżej grze", ten albo pisze shim
   THREE, albo mierzy to w przeglądarce w GATE 1.

**Regresja, która musi przejść bez edycji:** `w3_ai_invasion` · `w3_attack_visibility` ·
`w3_battle_booking` · `invasion_player_capture` · `s34c_z9_transfer_dispose` (**20/20** — pinuje brak
dispose w `transferColony`; gdyby zaczął padać, znaczy to, że ktoś przywrócił kasowanie) · pełny sweep.

---

## Weryfikacja (live gates)

**GATE 1 (po AC-2..AC-4) — „AI dochodzi i przejmuje".** Cel: zobaczyć NA ŻYWO pełny łańcuch od desantu do
zmiany właściciela, w normalnej grze, na koloni gracza. ⚠ Wejście przez **dźwignię** `WarOverlay` →
`force_invasion` (`:311` → `:363-371`) — i to jest zapisane jawnie, bo produkcyjne wejście desantu należy
do Findings 49 (brak transportowca w katalogu AI) i **nie jest częścią tego slice'u**.
Warunki wstępne, bez których gate nic nie zmierzy: (a) **mapa kolonii musi być choć raz otwarta**, inaczej
`launchInvasion` zwróci `no_grid`; (b) **nie w `CombatSandbox`** — jego stolica powstaje przez
`autoPlaceBuilding` (bez `planet:buildResult`), więc scenariusz różni się od normalnej gry dokładnie w tym
łańcuchu, który gate ma mierzyć; łatwo zmierzyć artefakt zamiast gry.

**Gate ma trzy odczyty, w tej kolejności — po D8 wszystkie są tanie do ustawienia:**
1. **PĘTLA SIĘ DOMYKA (kolonia bez obrońców — po D8 stan domyślny):** desant → marsz najeźdźcy na stolicę
   → flip kafla po ~6 wyświetlanych miesiącach → `colony:captured` z `previousOwner:'player'`. To jest
   właściwy dowód tego slice'u.
2. **KONTROLA POZYTYWNA D3=W3:** zrekrutuj **jedną** jednostkę (dowolną — także `garrison_unit` albo
   medyka) i powtórz: przejęcie **nie następuje**, dopóki ta jednostka żyje. Bez tego odczytu gate nie
   odróżnia „symetryczny predykat działa" od „nie ma czego blokować".
3. **ODWRACALNOŚĆ (regresja D7 z W3):** odbij kolonię i sprawdź, że wraca kompletna.

⚠ Przy celu **z obroną** liczyć się z tym, że pierwsza wymiana ognia usunie z gry **obie** jednostki legacy
(⚠ pkt 4 w RESUME). Jeśli gate zobaczy `invasion:repelled` zamiast `colony:captured`, **to nie jest porażka
tego slice'u**, tylko potwierdzenie Findings 50/65 — zapisać jako obserwację, nie jako FAIL.

**GATE 2 (po AC-5..AC-7) — „księga i widoczność".** Jedno `colony:captured` na kampanię · gracz dostaje
sygnał, że traci kafle (dziennik/dzwonek) · po utracie stolicy panel gracza **nie** przeskakuje na kolonię
wroga · odbicie kolonii dalej działa (regresja D7 z W3).

**Stałe reguły skryptu gate'u — każda kupiona błędem, wszystkie nadal wiążące:**
1. **one-linery gate'u wykonać na żywym silniku PRZED wpisaniem ich do checklisty** (W3/E6: fałszywy FAIL
   z literówki w skrypcie);
2. **nie filtrować po TEKŚCIE Dziennika** — gracz gra po angielsku; filtrować po rodzaju zdarzenia;
3. **CC nie pisze plików w trakcie gate'u** — zapis w repo przeładowuje kartę przez Live Server i cofa grę
   do ostatniego zapisu;
4. **nowy powód odmowy dołącza do `DebugLog.TRACKED_EVENTS` w TYM SAMYM commicie** — inaczej gate zmierzy
   ciszę tam, gdzie system mówi (W3: dwa razy);
5. **keeper pinuje SPOSÓB SKŁADANIA SCENY**, nie tylko zachowanie przy gotowej scenie (W3-5b: reguła żyła
   i była oceniana, ale brak wiersza w bloku lokatora czynił ją niewidzialną, a wszyscy konsumenci czytają
   przez `?.`, więc nic nie krzyczało).

---

## Poza zakresem (świadomie)

**Odroczone do D5 „AI↔AI live" (po W4 / D3-D4):** desant i przejęcie **AI przeciw AI**.
`_onVesselGroupVictory` **zostaje** ograniczone do `participantB.type === 'player'`
(`InvasionSystem.js:180`). ⚠ Ustalenie z audytu, które to potwierdza od strony kodu: taki kształt
`participantB` emituje **wyłącznie `EnemyAttackHandler:180-186`**; `DeepSpaceCombatSystem:944-957`
i `VesselCombatSystem:307-320` stawiają `'vessel_group'` po obu stronach ⇒ desant AI jest dziś osiągalny
**tylko** ze ścieżki ataku na kolonię, nigdy z bitwy w głębokim kosmosie. Zmiana tego = przeprojektowanie
abstrakcyjnego `BattleSystem` dla AI↔AI, czyli tamten slice.

**Odroczone do `DirectorProduction` (doktryna, backlog):** żeby AI **samo** zbudowało i wysłało
transportowiec desantowy. Dziś katalog `SHIP_TEMPLATES` nie ma roli transportowej (Finding 49) ⇒
`no_drop_capable_hull` jest jedyną osiągalną odpowiedzią złącza bitwa→desant. Ten slice tego nie rusza
i **dlatego GATE 1 jawnie używa dźwigni**.

**Odroczone do backlogu floty:** warp grup mieszanych (eskorta + transport) — zależy od mechaniki po
stronie gracza, której jeszcze nie ma.

**Odroczone do slice'u GROUND (Finding 50 + S12 + R13):** przejście desantu AI z modelu LEGACY
(`INVASION_UNIT_POOLS` → `GROUND_UNITS`) na archetypy. ⚠ **Ten slice musi wiedzieć, że tamten go dotknie
DWUKROTNIE, i dlatego istnieje D7:**
1. **dziś** legacy jednostka ginie po PIERWSZYM trafieniu (`morale ?? 0` przy odejmowaniu vs `morale ?? 100`
   przy odczycie — Findings 65) ⇒ desant AI i startowa piechota gracza znoszą się wzajemnie, zanim
   ktokolwiek dojdzie do stolicy;
2. **po GROUND** archetypy mają `morale`, więc `CombatSystem._tryRetreat:392-423` **staje się drugim
   moverem** (teleport o kafel bez sprawdzania budynku, właściciela i stolicy) i część założeń D1
   — zwłaszcza odrzucony wariant „stoi i okupuje" — przestaje obowiązywać.

**Odroczone do slice'u GROUND — dwa zadania przekazane WPROST z D8** (właściciel, 2026-08-19):
- **typ legacy `infantry` NIE jest kasowany w tym slice.** `INVASION_UNIT_POOLS` używa go dla pięciu
  archetypów imperiów (`xenophage`, `swarm`, `hegemon`, `trader`, `isolationist`), więc do czasu GROUND
  **AI musi mieć czym desantować**. D8 zdejmuje darmowe jednostki GRACZA i wspólny spawn startowy, a nie
  katalog jednostek AI;
- **pełne skasowanie `infantry` z katalogu + redesign `INVASION_UNIT_POOLS` na identyfikatory archetypów.**
  ⚠ **To NIE jest podmiana 1:1** — to projekt doboru **miksu** jednostek per archetyp imperium (kto zrzuca
  szturm, kto artylerię, kto garnizon, w jakich proporcjach), a więc decyzja balansowa razem z S12 (morale)
  i R13 (RNG). Findings 67-68.

---

## Ryzyka i pułapki (rankowane)

**R-1 (wysokie) — najeźdźcy zostają na koloni po przejęciu.** Rekord dostaje `active:false`, a jednostek
**nikt nie usuwa** (brak utrzymania dla nich). Naiwny predykat „brak celu ⇒ idź na stolicę" wyśle je na
**własną** stolicę. Predykat musi porównywać `unit.owner` z `colony.ownerEmpireId`.

**R-2 (wysokie) — guard na starcie `_tickCombatAI` wyłącza walkę naziemną CAŁEJ gry.** `:986-987` to
jedyne produkcyjne wejście do `CombatSystem.tick`. Zmiana wolno dotykać **ciała pętli** (`:990-1016`).

**R-3 (wysokie) — „napraw komentarz timera" = 12× szybsze przejęcia.** Sześć deklaracji jednostki
`OCCUPY_DURATION`, trzy różne wartości, żadna zgodna z kodem (§Załącznik A poz. 9). Egzekwowana jest
wartość liczona przez `gameTime`. Pinować **wykonaniem**, nie odczytem stałej.

**R-4 (średnie) — regeneracja siatki kasuje księgę okupacji.** `ColonyOverlay._getGrid` zastępuje
`colony.grid` świeżym, gdy siatka nie pochodzi z zapisu (`shouldReuseColonyGrid`), a `_syncTileBuildings`
odbudowuje tylko budynki — **nie `owner`/`occupy*`**. Okno jest wąskie (cache w overlayu + `_gridFromSave`
zamykają typowe ścieżki), ale **nierozstrzygnięte na żywo**. Gate, który „zajrzy na mapę", może zniszczyć
mierzony stan.

**R-5 (średnie) — `_gridFromSave` nigdy nie jest czyszczone** ⇒ siatka raz wczytana z zapisu **nigdy** nie
przejdzie stemplowania `owner`. Placówki i kolonie AI nie są stemplowane nigdy.

**R-6 (średnie) — kolonia ze stolicą w kolejce pending nie ma kafla wykluczonego ze strefy zrzutu** ⇒
desant może wylądować na przyszłych współrzędnych stolicy i przewrócić kafel natychmiast (pusty kafel =
flip bez timera). Dziś chroni nas geometria, nie bramka.

**R-7 (niskie, ale mina na przyszłość) — `startGroundUnitBuild` nie ma guardu właściciela**, a
`_spawnGroundUnit` woła fabrykę **bez** `owner` ⇒ jednostka zbudowana na koloni AI wyszłaby ze stemplem
`owner='player'`: wypadłaby z pętli AI i byłaby liczona jako **obrońca gracza**. Dziś nieosiągalne (AI nie
buduje wojska), ale cała bramka `:991` opiera się na stemplu, którego domyślną wartością jest „gracz".

**R-8 (niskie) — jednostka `offline` jako niezabijalny blokator** (D3, mina wspólna).

**R-10 (niskie, świadome) — stary zapis + D3=W3 = bloker do czasu rozwiązania jednostek.** D8 usuwa
producentów, nie jednostki już zapisane; partia w toku wczyta rovera i piechotę, a te przy symetrycznym
predykacie blokują podbój, dopóki gracz ich nie rozwiąże (`UnitCardPanel` → disband). Czyszczenie starych
zapisów = migracja = poza tym planem (§Save strategy pkt 4).

**R-9 (wysokie dla GATE 1, poza zakresem naprawy) — legacy jednostka ginie po pierwszym trafieniu.**
`CombatSystem:303` odejmuje morale przez `?? 0`, a `:235` czyta przez `?? 100`; legacy `createUnit` nie
ustawia ani `morale`, ani `noMorale` ⇒ jedno trafienie = `groundUnit:disbanded` + `removeUnit`, po OBU
stronach. Nie naprawiamy tego tutaj (należy do GROUND / Findings 50 i 65), ale **przesądza scenariusz
gate'u** ⇒ **D7**.

---

## Findings filed (nowe, nie naprawiane w tym slice; numeracja ciągła po W3 §Findings 51)

52. **`_tickCombatAI:986-987` to jedyne produkcyjne wejście do `CombatSystem.tick`** — guard na starcie
    funkcji wyłączyłby walkę naziemną wszystkim, w tym graczowi, i nic by nie krzyknęło. ⇒ R-2.
53. **„Wieczna inwazja" na placówce gracza** — wybór celu nie filtruje `isOutpost` (`:217-220`), desant
    przechodzi, a rekord `active:true` nie może wygasnąć (`:365-370` blokuje repel, `:380` przejęcie,
    `:1007` ruch) i trafia do **każdego** zapisu; brak guardu przed duplikatami rekordów. ⇒ załącznik D2.
54. **Startowy garnizon gracza wisi na efekcie ubocznym UI** — legacy `infantry` (`GameScene.js:3867`)
    spawnowana przez jednorazowy listener `planet:buildResult`/`colony_base`, którego wyzwalaczem jest
    fallback stolicy w `ColonyOverlay`. **Zero pokrycia testowego.** Kolonie wtórne i placówki: 0 jednostek
    na zawsze (stolicę stawia `autoPlaceBuilding`, które nie emituje eventu; spawn i tak celuje
    w `homePlanet`). `CombatSandbox`: gracz 0 jednostek od t=0.
55. **Kolonia macierzysta nie ma siatki do pierwszego otwarcia mapy** (`ColonyManager.js:345`) ⇒
    `launchInvasion` na preferowany cel zwraca `no_grid` (`:97-98`). Wejście do desantu zależy od działania
    gracza w UI.
56. **`CombatSystem._tryRetreat:392-423` jest drugim moverem** — teleport o kafel bez sprawdzania budynku,
    właściciela i stolicy; martwy tylko dlatego, że legacy jednostki nie mają `morale` (`:235`
    `morale ?? 100`). Slice GROUND go uruchomi.
57. **Dysjunkcja `t.capitalBase` w `_tryPlayerCapture:340` jest dowodliwie martwa** — gałąź `else` biegnie
    wyłącznie, gdy żaden kafel nie ma `capitalBase`.
58. **Kafle placówki nigdy nie dostają stempla `owner`** (`createOutpost` nie jest w zbiorze zapisów
    `tile.owner`) ⇒ na placówce **żadna strona nie jest „u siebie"** i timer okupacji zeruje się przy
    dwóch stronach na kaflu. ⇒ R-5.
59. **Najeźdźcy pozostają na koloni po udanym przejęciu** — rekord `active:false`, brak usuwania, brak
    utrzymania. ⇒ R-1.
60. **`startGroundUnitBuild` bez guardu właściciela + `_spawnGroundUnit` bez `owner`** ⇒ latentny stempel
    `owner='player'` na jednostce AI. ⇒ R-7.
61. **`autoPlaceBuilding` nie ma guardu `_isOutpost`** — picker może postawić na placówce budynek
    z `crewNeeded`, którego `_build` by nie przepuścił (pre-existing, niezwiązane z podbojem).
62. **Kolizje `PhysicsSystem` nie są bramkowane scenariuszem** (`:64-68`) — `CLAUDE.md` twierdzi, że
    w scenariuszu „Cywilizacja" kolizje są wyłączone. Rozjazd opisu z zachowaniem; dotyczy m.in. jedynej
    realnej ścieżki śmierci placówki (ciała małe: księżyce, planetoidy).
63. **`empire:colonyRemoved` brakuje w `DebugLog.TRACKED_EVENTS`** (asymetria wobec `empire:colonyAdded`,
    `EmpireRegistry.js:127` vs `:144`) ⇒ utrata kolonii przez imperium jest w audycie AI niewidoczna.
64. **`HexTile.js:321` twierdzi, że `tile.owner` „inicjalizuje `InvasionSystem`"** — `InvasionSystem` ten
    kafel wyłącznie CZYTA (`:337`, `:340`, `:382`), nigdy nie pisze.
65. ⚠ **Morale legacy: `?? 0` przy odejmowaniu vs `?? 100` przy odczycie** — `CombatSystem:303`
    (`(target.morale ?? 0) − MORALE_COST_WHEN_HIT`, stała `:39` = 3) wobec `:235` (`unit.morale ?? 100`),
    przy legacy `createUnit`, które nie ustawia ani `morale`, ani `noMorale`
    (`GroundUnitManager.js:139-168`) ⇒ **pierwsze trafienie usuwa jednostkę z gry** (`:236` →
    `groundUnit:disbanded` + `removeUnit`). Dotyczy desantu AI (cały legacy) **i** startowej piechoty
    gracza. To mechanizm, którego W3 §Findings 50 opisywał skutek („rozpada się po pierwszym trafieniu")
    bez wskazania przyczyny — tu jest przyczyna, w dwóch liniach.
    ⚠ **Przy okazji, ta sama klasa:** wyjątek „garnizon się nie wycofuje" (`CombatSystem:242`
    `unit.role !== 'defense'`) jest **martwy** — instancje noszą rolę LEGACY (`defensive`), nie
    archetypową (`defense`), bo `GroundUnitFactory:148` zapisuje `mapRoleToLegacy(arch.role)`. Warunek jest
    zawsze prawdziwy, więc garnizony podlegają routowi jak każda inna jednostka.
66. ⚠ **`ColonyOverlay._autoSpawnRover` — samonaprawiający się darmowy cywil na stolicy.** Wołane
    z `show():443` przy **każdym** otwarciu panelu kolonii bez jawnego `colonyId`; bramki: planeta
    macierzysta (`:449`) + **„na planecie nie ma ŻADNEJ jednostki"** (`:452`). Znalezione w cross-checku
    D8 i **wciągnięte do zakresu D8 jako pozycja 3** — bez tego usunięcie dwóch spawnów w `GameScene` dałoby
    pozór wykonania: przy D3=W3 świeży rover pojawiałby się dokładnie wtedy, gdy planeta zostaje pusta,
    czyli w końcówce inwazji, i zamrażał podbój na zawsze.
67. **Typ legacy `infantry` zostaje w katalogu do slice'u GROUND** — `INVASION_UNIT_POOLS` używa go dla
    `xenophage`, `swarm`, `hegemon`, `trader`, `isolationist`; skasowanie go teraz odebrałoby AI zdolność
    desantu. (Zadanie przekazane wprost przy D8.)
68. **Redesign `INVASION_UNIT_POOLS` na archetypy — decyzja BALANSOWA, nie podmiana identyfikatorów.**
    Wymaga zaprojektowania miksu jednostek per archetyp imperium; miejsce: slice GROUND, obok S12 i R13.
    (Zadanie przekazane wprost przy D8.)

---

## Załącznik A — sprzątanie dokumentacji (dziewięć pozycji + cztery potwierdzone dodatki)

Format: **anchor** → *co dziś stoi* → **proponowana nowa treść**. Wszystkie anchory odczytane w źródle
2026-08-19.

**1. `docs/design/W3_PLAN.md:945-953` — Finding 51.**
*Dziś:* „`InvasionSystem` has `_tryPlayerCapture` … with **no** mirror for the AI direction, so the last
step of the conquest loop … is missing".
**Proponowane:** „**Desant AI nie kończy się przejęciem kolonii, bo najeźdźca nigdy nie dochodzi do
stolicy — nie dlatego, że brakuje lustra.** Lustro istnieje i działa (`_tickCaptureChecks:349-386` →
`_captureColony:388` → `transferColony:654`, zmierzone). Jedyny mover jednostek naziemnych
(`GroundUnitManager._tickCombatAI:997-1013`) celuje w najbliższą ŻYWĄ jednostkę gracza i przy jej braku nie
rusza się wcale ⇒ warunek »armia wybita« i warunek »stolica zdobyta« wykluczają się wzajemnie.
Obserwacja z gate'u (»`gu_42` **stał** na Nekkar d«) była opisem tego deadlocku. Pełna analiza:
`AI_CAPTURE_AUDIT.md`; plan odblokowania: `AI_CAPTURE_PLAN.md`."

**2. `docs/design/W3_PLAN.md:320` — wiersz S9.**
*Dziś (ostatnia klauzula):* „No colony-level state, and none possible for a body the player LOST."
**Proponowane:** „No colony-level *occupation* state; the closest carrier is the invasion record
(`gameState.invasions`, keyed by `planetId`, declared in `createDefaultState` and serialized). **Since W3-1
a body the player LOST keeps its full colony state in place** (`transferColony` rewrites ownership without
dispose), so colony-level state on such a body is possible today." Reszta wiersza (pola per-hex,
`tile:ownerChanged` bez subskrybentów) **zostaje — jest prawdziwa**.

**3. `docs/design/W3_PLAN.md:318` — wiersz S7** (+ echo `:361`, `:151-153`, `:272-286`).
*Dziś:* „**asymmetric by construction** … `transferColony` deletes (dispose ×5 + `_colonies.delete`)".
**Proponowane:** „**symmetric since W3-1** — both executors rewrite ownership **in place**;
`transferColony` (`ColonyManager.js:654-759`) contains no `dispose()` and no `_colonies.delete` (removal is
a third method, `removeColony:596-622`, not used by conquest). Keeper pins the inversion:
`s34c_z9_transfer_dispose_smoke` (20/20)." ⚠ W `:151-153` i `:272-286` (C-5) usunąć trzeci składnik listy
(„five `dispose()`") i przepisać zdanie „The AI cannot profit from winning" — dziś AI profituje
(zmierzone: `ColonyAutoExpander` rozbudowuje zdobycz 4 → 7 budynków).

**4. `CLAUDE.md:396`, `:397`, `:399` — trzy wiersze tabeli zdarzeń.**
*Dziś:* `groundUnit:capturingBuilding … | GroundUnitManager | ColonyOverlay`;
`groundUnit:buildingCaptured … | GroundUnitManager | InvasionSystem (podbój gracza)`;
`groundUnit:captureInterrupted … | ColonyOverlay`.
**Proponowane:** dopisać do każdego z trzech **„⛔ MARTWY — producent bez wywołań"** i poprawić kolumnę
odbiorcy `:396`/`:399` (`ColonyOverlay` **nie** subskrybuje żadnego z nich — jedyne `groundUnit:*` tam to
`intercepted` i `select`). Wyjaśnienie do dopisania raz: „`capture()` wołane wyłącznie z
`GROUND_ABILITIES.capture_building.execute` (`groundAbilities.js:28`), a `.execute` żadnej zdolności
naziemnej nie jest w `src/` wywoływane ⇒ realna okupacja emituje **`tile:ownerChanged`**
(`GroundUnitManager.js:619`, **0 subskrybentów**)."
Powiązany akapit narracyjny `CLAUDE.md:1778` + `:1784` („**Trigger `InvasionSystem`** dwutorowo") — słowo
**„dwutorowo" jest fałszywe**: żywa jest tylko jedna tora (skan `_tickPlayerConquestChecks`). Rozmiar:
3 wiersze tabeli + 1 linia + 1 klauzula.

**5. `CLAUDE.md:601-604` — S3.4c Z9.**
*Dziś:* „`transferColony` … woła te same 5× `dispose()` przed `_colonies.delete` — czysty dispose (AI nie
adoptuje subsystemów). Smoke `s34c_z9_transfer_dispose` 16/16".
**Proponowane:** „**Z9 (stan po W3-1):** `transferColony` **nie** disposuje i **nie** kasuje — przerzut
własności w miejscu; przesłanka »AI nie adoptuje subsystemów« została odwrócona (`ColonyManager.js:636-644`:
kolonia zostaje w `_colonies`, subsystemy żyją i tykają — zmierzone). Dispose ×5 pozostał **wyłącznie**
w `removeColony`. Orphan-guard `FactorySystem._update` zostaje jako defense-in-depth. Keeper przepisany
i pinuje odwróconą własność: `s34c_z9_transfer_dispose` **20/20**." Zdanie o Z4/Z5 wyżej (`:597-600`)
**nietykalne — prawdziwe**.

**6. `src/systems/ColonyManager.js:604-605` — komentarz przy `removeColony`.**
*Dziś:* „Bliźniaczy dispose w transferColony (przejęcie kolonii przez AI) — ten sam wzorzec."
**Proponowane:** „⚠ Od W3-1 `removeColony` jest **jedynym** miejscem z dispose ×5 — `transferColony`
celowo NIE disposuje (przerzut własności w miejscu, `:636-644`)."

**7. `src/systems/ColonyManager.js:650` — komentarz w bloku `transferColony`.**
*Dziś:* „`colony:captured` dla UI/narracji; HomePlanet → game over w GameScene".
**Proponowane:** „`colony:captured` dla UI/narracji. ⚠ **Utrata macierzystej NIE kończy gry** —
`checkHomeDestroyed` (`GameScene.js:3305`) reaguje tylko na fizyczne zniszczenie ciała i pop=0, nie na
zmianę właściciela; `wasHomePlanet` w payloadzie ma dziś **wyłącznie** konsumentów narracyjnych
(toast + auto-slow)." (⇒ patrz **D5**: jeśli właściciel wybierze W2, ten komentarz stanie się prawdą
i zmieni się na opis nowej ścieżki.)

**8. `src/systems/InvasionSystem.js:13-18` — nagłówek klasy, blok „Capture:".**
*Dziś:* „są 0 player ground units (militarne **lub civilne**)" + „trwa już **3+ civYears**".
**Proponowane:** „Capture (stan faktyczny): raz na 1 civYear, dla każdego AKTYWNEGO rekordu inwazji
(`listActive()`), jeśli **kafel `capitalBase` należy do agresora** (`:379-382`) **i** na planecie nie ma
żywej jednostki gracza o roli `military` (`:358-362` — `defensive`/`support`/`drone`/`civilian` **nie**
blokują) ⇒ `transferColony`. **Brak jakiejkolwiek karencji czasowej** — `CAPTURE_GRACE_YEARS` (`:26`)
i `playerEmptySince` (`:141`) są MARTWE (zero odczytów). Gałąź `defenders_repelled` (`:365-370`) wygasza
rekord, gdy zginie ostatni najeźdźca, **przed** testem stolicy."

**9. Jednostka timera okupacji — sześć deklaracji, trzy wartości.**
*Dziś:* `GroundUnitManager.js:405` „2-mo timer" · `:559` „2 miesiące (2/12 civYears)" · `:565`
„6 miesięcy = 0.5 civYear" · `:593` „progres 2/12 civYears" · `:624` „timerem 0.5 civYear" ·
`HexTile.js:257` „occupyStart = civYear gdy zaczęło się liczyć".
**Proponowane (jedno brzmienie, powtórzone spójnie):** „**6 wyświetlanych miesięcy** = `OCCUPY_DURATION
= 6/12` **roku WYŚWIETLANEGO** (`elapsed = timeSystem.gameTime − tile.occupyStart`) = 6 civYears przy
`CIV_TIME_SCALE = 12`. ⚠ NIE »0.5 civYear« — to byłoby 12× krócej." W `HexTile.js:257`: „`occupyStart` =
`gameTime` (rok WYŚWIETLANY), nie civYear". ⚠ Przy okazji `W3_PLAN.md:298-300` mówi o **trzech**
sprzecznych deklaracjach — jest ich **sześć**, a dwa anchory w tym akapicie się przesunęły.

**Potwierdzone dodatki (poza dziewiątką, ta sama klasa):**
- **`docs/audit/COMBAT_DIPLO_AUDIT.md:200-216`** — klaster pięciu przesuniętych anchorów (m.in.
  `_tryPlayerCapture:223` → dziś `:318`) plus jedna nieprawda merytoryczna. Dopisać nagłówek
  „częściowo nieaktualne — patrz `AI_CAPTURE_AUDIT.md`".
- **`CLAUDE.md` tabela zdarzeń — brakują CZTERY wiersze:** `tile:ownerChanged` (producent
  `GroundUnitManager.js:619`, **0 konsumentów** — biała plama dokładnie w miejscu, którego dotyczy ten
  plan), `station:orphaned` (`StationSystem.js:223`, 0 konsumentów), `empire:colonyAdded`
  (`EmpireRegistry.js:127` → `TerritoryService`, `DebugLog`), `empire:colonyRemoved` (`:144` →
  `TerritoryService`; ⚠ brak w `DebugLog.TRACKED_EVENTS`).
- **`CLAUDE.md:1792`** — status „Faza 7 MilitaryAI + EconAI — ongoing": ta warstwa została **wycofana**
  w W3-8 (`814fb38`).
- **`CLAUDE.md`** (sekcja scenariuszy) — „scenariusz Cywilizacja: wyłączone perturbacje/kolizje":
  `PhysicsSystem.js:64-68` nie ma bramki scenariusza (⇒ Finding 62).

---

## Gdzie to stawia arc

W3 dowiózł uderzenie: AI wychodzi z domu, wygrywa orbitę, zrzuca wojsko i gracz to widzi. Czego nie
dowiózł — i co ten slice ma domknąć — to **ostatni krok pętli**: żeby zdobycz zmieniła właściciela **z
własnej inicjatywy AI**, a nie przez dźwignię w konsoli. Audyt pokazał, że ten krok jest w silniku **prawie
cały**: brakuje mu intencji (jednostka nie wie, po co wylądowała), jednej bramki (ciało bez stolicy)
i księgowości (kampania bez początku i końca).

D8 dokłada do tego jedno zdanie o świecie, nie o mechanizmie: **partia zaczyna się pusta**. Po obu
stronach frontu każda jednostka naziemna jest odtąd czyimś wydatkiem — gracza (koszary, POP) albo AI
(desant z wygranej orbity) — a nie darmowym wyposażeniem startowym. To jest warunek, przy którym
symetryczny predykat „armia wybita" w ogóle ma sens: skoro nikt nie dostaje wojska za darmo, „ktokolwiek
żywy broni tego ciała" jest uczciwą regułą dla obu kierunków.

Dla W4 (pokój terytorialny) ma to konsekwencję wprost: **towar, którym W4 ma handlować, zaczyna istnieć
dopiero po tym slice'ie**. Dopóki AI nie potrafi zabrać kolonii samo, „zwrot terytorium" przy stole
pokojowym wycenia rzecz, której nikt nie stracił. Dlatego ten slice jest **przed** W4, a nie po nim —
i dlatego jego GATE 1 wolno postawić na dźwigni: wystarczy dowieść, że **pętla domyka się sama**, gdy
wojsko już wyląduje. Kto je tam wysyła (Finding 49) i czym walczy (Finding 50) to dwa osobne, nazwane
slice'y.
