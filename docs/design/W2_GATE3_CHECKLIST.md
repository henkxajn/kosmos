# W2 — GATE 3: pętla AI (rezerwa · mobilizacja · wywiad) — checklista live · FINAŁ SLICE'U

**Slice:** W2 (model rozmieszczenia) · **Commit:** `adc0fbd` (W2-7) + `3f8601d` (docs)
**Plan:** `docs/design/W2_PLAN.md` · **Poprzednie gate'y:** GATE 1 ✅ · GATE 2 ✅
**Stan przed gate'em:** sweep **136/136 OK, 0 FAIL** · `check-i18n` PASS (pl=en=3240,
0 rozbieżności) · zapis **v101** (W2-7 nie rusza wersji)

> **DLACZEGO TEN GATE ISTNIEJE — WPIS WIĄŻĄCY Z REJESTRU:**
>
> > `GameCore` nie montuje Directora, więc „okręt wojenny AI powstaje end-to-end" jest
> > **NIEMIERZALNE W HARNESSIE**. Musi to pokryć ŻYWY gate — jawnie.
>
> Wszystko, co da się sprawdzić headless, JEST już sprawdzone (`w2_ai_mobilization` 39/39 +
> `director_*`). Tutaj sprawdzamy DOKŁADNIE to, czego harness nie umie: czy w prawdziwej grze,
> z prawdziwym Directorem i prawdziwą ekonomią AI, kadłub obcych przechodzi całą drogę
> **stocznia → rezerwa → mobilizacja → służba** i czy gracz widzi z tego tyle, ile powinien.

**Zasady stałe (każda kupiona błędem, wszystkie obowiązują):** żadnego wielolinijkowego kodu
w cytatach blokowych · stolica WYŁĄCZNIE przez `KOSMOS.directorProduction.capitalOf(empireId)` ·
niedobory czytać **z silnika**, nigdy z listy w pamięci · `DebugLog` to pierścień **czyszczony
przy reloadzie** · **nigdy** gate równolegle z pracą CC · dźwignie stanu tylko przez zwalidowane
narzędzia · **nigdy nie filtruj wpisów Dziennika po TEKŚCIE WYŚWIETLANYM** — filtruj po rodzaju
zdarzenia (reguła kupiona na GATE 2: angielski Dziennik, polski grep, pusty wynik przy wpisie
widocznym na ekranie).

**One-linery: co dokładnie zostało sprawdzone.** L1-L7 **WYKONANE** na żywym silniku (boot
scenariusza „Cywilizacja" + prawdziwe systemy) i zwróciły sensowne wartości — te wartości są
wpisane niżej jako punkty odniesienia. **JEDEN wyjątek, podany wprost:** zapytanie o dzwonek
(§5) sprawdzone **strukturalnie**, nie wykonaniem — `notificationCenter` nie jest montowany
w harnessie headless, więc zweryfikowana jest nazwa w lokatorze (`GameScene.js:422`) i kształt
API, a nie żywy wynik. Traktuj to jako jedyne miejsce, gdzie zapytanie może wymagać poprawki
przy pierwszym uruchomieniu.

---

## 0. Przygotowanie

- [ ] **CC nie pracuje.**
- [ ] Kopia zapisu na dysk (menu ☰ → „Zapisz do pliku").
- [ ] Odśwież grę (Live Server), otwórz konsolę (F12).
- [ ] ⚠ Ten gate potrzebuje **rozwiniętej partii** — imperium AI musi mieć stocznię, stację
      orbitalną (żeton R-3) i techy okrętowe. Na świeżej grze nie ma czego obserwować.
      Jeśli zapis jest młody, przewiń czas albo użyj `KOSMOS.debug.aiWarships(...)`.

---

## 1. Kadłub AI kończy w REZERWIE (a nie od razu w służbie)

**L1 — rezerwa okrętów bojowych per imperium (przez kanoniczne `capitalOf`):**

`KOSMOS.empireRegistry.listAll().map(e => ({ id: e.id, rezerwa: KOSMOS.directorMobilization.countStoredWarshipsAtCapital(e.id) }))`

- [ ] Po tym, jak AI ukończy okręt (obserwuj Dziennik/DebugLog), liczba **rośnie** — kadłub
      ląduje w magazynie, nie w służbie.

**L2 — stan służby CAŁEJ floty, rozbity na gracza i AI:**

`KOSMOS.vesselManager.getAllVessels().filter(v => !v.isWreck).reduce((a,v)=>{const k=(v.serviceState??'active')+(v.ownerEmpireId?'/AI':'/gracz');a[k]=(a[k]||0)+1;return a;},{})`

- [ ] Widać kubełek `stored/AI`. (Zmierzone na sondzie: świeżo postawiony kadłub AI daje
      `{"stored/AI":1}`.)

⚠ **Kadłuby AI `active` z zerową załogą to NIE błąd.** Flota ZMATERIALIZOWANA
(`EmpireFleetMaterializer`) i sonda pierwszego kontaktu tworzą okręty z pominięciem obu szwów
stoczni — rodzą się `active` i nigdy nie płacą POP. To znany, zapisany dług (W2_PLAN §Findings
filed 10, adres: W3). Rozstrzygające zapytanie, jeśli chcesz je rozdzielić:

`(()=>{const mat=new Set();for(const e of (KOSMOS.empireRegistry?.listAll?.()??[]))for(const f of (e.fleets??[]))for(const id of (f.materializedVesselIds??[]))mat.add(id);return KOSMOS.vesselManager.getAllVessels().filter(v=>v.ownerEmpireId&&!v.isWreck).map(v=>({id:v.id,stan:v.serviceState??'active',zaloga:v.crewLocked??0,zrodlo:mat.has(v.id)?'MATERIALIZACJA':'zapis/stocznia'}))})()`

---

## 2. Doktryny NIE wcielają rezerwy (C-2)

- [ ] Mimo kadłubów w magazynie AI **nie wystawia** ich na patrol ani do garnizonu.

**L3 — pula doktryn (musi liczyć TYLKO okręty w służbie):**

`KOSMOS.empireRegistry.listAll().map(e => ({ id: e.id, doSluzby: KOSMOS.directorDoctrine.countIdleArmedAtCapital(e.id), rezerwa: KOSMOS.directorMobilization.countStoredWarshipsAtCapital(e.id) }))`

- [ ] `doSluzby` **nie zawiera** kadłubów z `rezerwa`. To była realna usterka: ta sama funkcja
      jest sondą wyzwalacza reguły, więc rezerwa jednocześnie **wyzwalałaby** garnizon
      i **była do niego wcielana**.

---

## 3. MOBILIZACJA — sedno tego gate'u

Reguła `mobilize_reserve` odpala, gdy: jest kogo obsadzić **I** stolica ma wolne POPy **I**
gracz ma w SŁUŻBIE więcej siły niż imperium. Rzut raz na rok wyświetlany, cooldown 3 lata,
porcja 2 okręty.

**L4 — czy warunki w ogóle zachodzą (zanim uznasz, że reguła jest zepsuta):**

`KOSMOS.empireRegistry.listAll().map(e => ({ id: e.id, rezerwa: KOSMOS.directorMobilization.countStoredWarshipsAtCapital(e.id), slabszy: KOSMOS.directorMobilization.isOutgunnedByPlayer(e.id), wolnePOP: KOSMOS.directorProduction.capitalOf(e.id)?.civSystem?.freePops ?? -1 }))`

- [ ] ⚠ **`slabszy: false` u WSZYSTKICH przy Twojej flocie w garażu to zachowanie ZAMIERZONE.**
      Guard porównuje SIŁY (okręty obsadzone) — gracz bez okrętów w służbie nie prowokuje
      nikogo. Zmierzone na czystym boocie: `sila` gracza 0 ⇒ `outgunned: false` u obu imperiów.
      **Żeby zobaczyć mobilizację, musisz mieć rozmieszczone okręty wojenne.**
- [ ] Rozmieść kilka własnych okrętów (GATE 2 dał Ci na to przycisk) i **odczekaj kilka lat
      wyświetlanych**.

**L5 — ślad decyzji w audycie (to jest właściwy sposób sprawdzania, nie tekst Dziennika):**

`KOSMOS.debugLog.query({ kind: 'director:mobilized' })`

- [ ] Pojawiają się wpisy z `empireId` i `count`. **Odmowy** czytaj przez:

`KOSMOS.debugLog.query({ kind: 'director:mobilizeRejected' })`

- [ ] Kadłub w rezerwie przechodzi w **`mobilizing`**, a po **jednym wyświetlanym miesiącu**
      w **`active`** (powtórz L2 — kubełek `stored/AI` maleje, `active/AI` rośnie).
- [ ] **POPy stolicy AI spadły** o załogę obsadzonych okrętów (L4, kolumna `wolnePOP`).

---

## 4. WYWIAD — siła vs potencjał

**L6 — rozdział na żywo, dla obu stron:**

`(()=>{const t=KOSMOS.threatAssessment,r=KOSMOS.empireRegistry.listAll().map(e=>({id:e.id,sila:t.getStrength(e.id),pot:t.getPotentialStrength(e.id),rez:t.getReserveStrength(e.id)}));r.push({id:'player',sila:t.getStrength('player'),pot:t.getPotentialStrength('player'),rez:t.getReserveStrength('player')});return r})()`

- [ ] Imperium z magazynem ma **`sila` < `pot`**, a `rez` = różnica. (Zmierzone na sondzie:
      jedna fregata AI w rezerwie ⇒ `sila 0 / pot 248 / rez 248`.)
- [ ] Po mobilizacji `sila` **rośnie**, `rez` maleje — suma `pot` bez zmian.

**Panel wywiadu (klawisz `I`), imperium o rozpoznaniu `detailed`:**

- [ ] Pod paskiem siły widać **„+ N w rezerwie (bez załóg)"** i **„wolna załoga: X POP"**.
- [ ] Imperium o rozpoznaniu **niższym niż `detailed`** tych linii **nie ma** (nie pokazuje też
      fałszywego zera — pole jest puste, bo „nie wiem" ≠ „wiem, że zero").

---

## 5. POWIADOMIENIE — mgła wojny działa w obie strony

- [ ] Dla imperium o rozpoznaniu **co najmniej `contact`**: po mobilizacji dzwonek 🔔 dostaje wpis
      w grupie **„Mobilizacje obcych"**, a Dziennik ma go na kanale **Wywiad** (🔭).
- [ ] ⚠ Przy rozpoznaniu **tylko `rumor`** — **ŻADNEGO wpisu**. To nie jest filtr hałasu, tylko
      mgła wojny: bez tego gracz czytałby mobilizację obcych bez jakiegokolwiek rozpoznania.
- [ ] Przy `contact` (ale nie `detailed`) wpis mówi **„Nieznane imperium"** — wiadomo ŻE, nie KTO.
      Nazwa dochodzi dopiero na `detailed`. **To rozbieżność ZAMIERZONA:** mobilizację da się
      zaobserwować, stan magazynu wymaga rozpoznania.

⚠ **Filtruj po RODZAJU, nie po tekście** (reguła z GATE 2 — grasz po angielsku):

`KOSMOS.notificationCenter.getActive().filter(n => n.type === 'mobilization')`

---

## 6. KURIERY AI znowu jeżdżą

Stall logistyki był najcichszą awarią całego slice'u: kurier w rezerwie zostawał na etacie trasy,
trasa raportowała się jako obsadzona, a przez zero ton ładunku nie przechodziło ANI JEDNO zdarzenie.

- [ ] Logistyka AI się rusza — kurierzy latają między stolicą a outpostem.

**L7 — licznik wysyłek (jedyny sygnał, jaki ten system w ogóle daje):**

`KOSMOS.empireRegistry.listAll().map(e => ({ id: e.id, wyslane: e.logistics?.stats?.dispatched ?? '—' }))`

- [ ] `wyslane` **rośnie** w czasie. Jeśli stoi na 0, sprawdź `director:mobilizeRejected`
      w DebugLogu — kurier mógł nie dostać załogi.
      (⚠ `—` zamiast liczby znaczy tylko tyle, że logistyka tego imperium jeszcze się nie
      zainicjalizowała — `empire.logistics` powstaje przy pierwszym tiku. To nie jest odczyt zera.)

⚠ Jeśli AI nie ma outpostów, kurierzy nie mają dokąd jeździć i to **nie jest** usterka W2 —
to znany, oddzielny dług ekspansji AI (patrz §8).

---

## 7. Nic się nie zepsuło po stronie gracza

- [ ] Pętla z GATE 2 działa dalej: budowa → rezerwa → rozmieść → wycofaj.
- [ ] Dziennik: bitwy/odwroty są teraz na kanale **Walka** (⚔), a nie w Systemie — to poprawka
      z W2-7 (`TYPE_MAP` nie miał kanałów `intel`/`combat`, więc 18 wpisów M4 P1 lądowało
      w Systemie z poprawnym kolorem).
- [ ] **Konsola bez czerwonych błędów** przez cały przebieg. ⚠ Szczególnie: żadnego
      `TypeError ... reading 'action'` — to byłaby uśpiona pułapka `_firePending`.

---

## 8. Ponowny pomiar R-2 — ✅ ZROBIONY, do przyjęcia do wiadomości

Obowiązek z rejestru: przemierzyć pokrycie strefy granicznej 5 LY, bo przesłanki się przesunęły
(pełne kolonie AI ok. civYear 303-353 zamiast ~456; 0 outpostów w oknie sondy).

**Wykonane** (`node src/testing/headless/probe-border-zone-coverage.mjs`, 4 seedy × 72 układy):

| pomiar | wynik |
|---|---|
| pokrycie dziś (5 LY, odczyt A, 3D, średnia 4 seedów) | **17,7 %** — bez zmian, warunek R-2 **SPEŁNIONY** |
| projekcja przy 3 układach/imperium | 31,9 % |
| projekcja przy 6 układach/imperium | 46,2 % ← blisko połowy |
| projekcja przy 8 układach/imperium | 58,7 % ← **≥ połowa galaktyki** |

⚠ **Liczba jest stabilna z NIEWŁAŚCIWEGO powodu i trzeba to wiedzieć:** „mid-game" jest CO DO BITU
równy startowi, bo w żadnym z 4 seedów AI nie zajęło ani jednego nowego układu przez 400 lat
cywilizacyjnych. Dwa niezależne powody, oba zmierzone: (a) **nasycenie promienia** — startowa fora
AI (24 POPy, 18 budynków) sadza promień roszczony na `R_MAX = 4 LY` od pierwszej sekundy; (b)
**martwa ekspansja AI** — zero wywołań `bootstrapColony`/`bootstrapOutpost`, AI zamawia droidy
„pod outpost" i na tym staje. Czyli: **5 LY jest bezpieczne dopóki AI stoi w miejscu.** Odblokowanie
ekspansji AI (WAR_BACKBONE/BALANS) **wymaga ponownego pomiaru** — projekcja przebija połowę przy
8 układach na imperium.

- [ ] Przyjąłem do wiadomości: R-2 przemierzone, 17,7 %, warunek spełniony **warunkowo** —
      do przemierzenia ponownie, gdy ekspansja AI ruszy.

---

## Wynik

| pozycja | wynik |
|---|---|
| 1. Kadłub AI kończy w REZERWIE | ⬜ |
| 2. Doktryny nie wcielają rezerwy | ⬜ |
| 3. **Mobilizacja: rezerwa → `mobilizing` → służba, POPy stolicy spadają** | ⬜ |
| 4. Wywiad rozdziela siłę od potencjału (panel + liczby) | ⬜ |
| 5. Powiadomienie za bramką kontaktu; `rumor` nie widzi nic | ⬜ |
| 6. Kurierzy AI znowu jeżdżą | ⬜ |
| 7. Brak regresji po stronie gracza, konsola czysta | ⬜ |
| 8. Ponowny pomiar R-2 przyjęty | ⬜ |

**GATE 3:** ⬜ ZDANY / ⬜ NIEZDANY — uwagi:

**Po ZDANIU: SLICE W2 ZAMKNIĘTY.** Otwarte, świadomie przekazane dalej: flota zmaterializowana
omija model załogi (W3) · utrzymanie floty AI nienaliczane (decyzja 14) · opóźnienie zatrzasku
zaległości (§Findings filed 9) · martwa naprawa statków (`_tickRepair`, pinowana jako luka).

---

## Gdyby coś poszło nie tak

- **AI nie mobilizuje mimo kadłubów w rezerwie** → L4. Kolejność podejrzeń: `slabszy: false`
  (nie masz okrętów w SŁUŻBIE — to zachowanie zamierzone, nie usterka) → `wolnePOP` bliskie zera
  (guard `empireHasFreeCrew`) → dopiero potem `director:mobilizeRejected` w DebugLogu.
- **Reguła odpala, ale nic się nie dzieje** → `KOSMOS.debugLog.query({ kind: 'director:mobilizeRejected' })`.
  Powód `deploy_refused` z kodem w `detail` mówi, co odmówiło.
- **Brak wpisu w dzwonku mimo mobilizacji** → sprawdź jakość rozpoznania tego imperium
  (`KOSMOS.intelSystem.getLevel('emp_xxx')`). Poniżej `contact` wpisu MA nie być.
- **Panel wywiadu nie pokazuje rezerwy** → te dwie linie wymagają `detailed`, nie `contact`.
- **Czerwony `TypeError ... reading 'action'`** → zatrzymaj się i zgłoś: to znaczy, że jakaś
  reguła Directora dostała `delay > 0`, a keeper miał to wykluczyć.
