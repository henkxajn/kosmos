# W2 — GATE 3: pętla AI (rezerwa · mobilizacja · wywiad) — checklista live · FINAŁ SLICE'U

**Status: ✅ ZDANY 2026-08-17 — wszystkie osiem sekcji, SLICE W2 ZAMKNIĘTY.** Ramka wyniku, dowody
z żywej gry i cztery odpowiedzi domknięcia: §Wynik + §Domknięcie na końcu pliku.

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

- [x] Przyjąłem do wiadomości: R-2 przemierzone, 17,7 %, warunek spełniony **warunkowo** —
      do przemierzenia ponownie, gdy ekspansja AI ruszy.

⚠ **DOPISEK Z TEGO PRZEBIEGU (2026-08-17) — przesłanka „AI stoi w miejscu" jest ZALEŻNA OD SEEDA.**
W tej partii `emp_002` założyło **pierwsze outposty w civYear ~460-465** — czyli WEWNĄTRZ okna, które
pomiar §8 nazwał pustym („zero wywołań `bootstrapColony`/`bootstrapOutpost`"). Diagnoza „liczba jest
stabilna z NIEWŁAŚCIWEGO powodu" **zostaje w mocy**, ale jej druga noga (martwa ekspansja) jest
własnością przebiegu, nie silnika: 17,7 % to próbka per seed × per imperium, nie stała. Sama liczba
i zobowiązanie do ponownego pomiaru — bez zmian. Zapisane jako `W2_PLAN.md` §Findings filed 11.

---

## Wynik

| pozycja | wynik |
|---|---|
| 1. Kadłub AI kończy w REZERWIE | ✅ |
| 2. Doktryny nie wcielają rezerwy | ✅ |
| 3. **Mobilizacja: rezerwa → `mobilizing` → służba, POPy stolicy spadają** | ✅ |
| 4. Wywiad rozdziela siłę od potencjału (panel + liczby) | ✅ |
| 5. Powiadomienie za bramką kontaktu; `rumor` nie widzi nic | ✅ |
| 6. Kurierzy AI znowu jeżdżą | ✅ |
| 7. Brak regresji po stronie gracza, konsola czysta | ✅ |
| 8. Ponowny pomiar R-2 przyjęty | ✅ |

**GATE 3:** ✅ **ZDANY — SLICE W2 ZAMKNIĘTY** (2026-08-17, Filip) — wszystkie osiem sekcji.

**Dowody z żywej gry:** kadłub AI schodzi ze stoczni **do rezerwy** (dowód pośredni, ale
rozstrzygający: wpis mobilizacyjny + `rez 864` w `ThreatAssessment` + linia rezerwy w panelu
wywiadu — magazyn musiał istnieć, żeby było co obsadzać) · **mobilizacja odpaliła SAMA, dwa razy**:
rok **25,35** na `emp_001`, potem `emp_002` w momencie, w którym jego pierwszy kadłub trafił do
magazynu — tak szybko, że odczyty `rezerwa` między stanami pokazywały 0 · **parytet następnie
UCISZYŁ regułę**: `slabszy` przeskoczyło na `false`, gdy okręty zostały obsadzone — hamulec wyścigu
zbrojeń z decyzji 22 działa i widać go w danych · **AI ZAPŁACIŁO POP** za obsadzenie (wolna załoga
18,4 po dosypaniu 20) · rozdział **siła / potencjał / rezerwa** na żywo w liczbach ORAZ w panelu
wywiadu („≈1009 combat units · +864 in reserve (uncrewed) · free crew: 18.4 POP · Balance of power:
they are stronger (+55 %)") · §5 domknięte **świeżym** zdarzeniem: dzwonek pokazał „⚓ Unknown empire
is crewing warships · Reserve entering service: 2" przy rozpoznaniu `contact` BEZ `detailed` — czyli
wariant anonimowy dokładnie zgodnie ze specyfikacją · kurierzy `dispatched` **4 → 8** (`emp_002` na 0,
bo nie ma outpostów — osobny, znany dług) · pętla gracza z GATE 2 bez regresji, bitwy na kanale
**Walka**, konsola czysta.

**Otwarte, świadomie przekazane dalej:** flota zmaterializowana omija model załogi (W3) ·
utrzymanie floty AI nienaliczane (decyzja 14) · opóźnienie zatrzasku zaległości (§Findings filed 9) ·
martwa naprawa statków (`_tickRepair`, pinowana jako luka).

---

## Domknięcie po GATE 3 — cztery odpowiedzi (żadna nie otwiera gate'u ponownie)

### 1. Skąd wiemy, jeśli ich nie znamy — klauzula źródła ZGŁOSZONA, nie wdrożona

Filip zapytał wprost: skoro wpis mówi „**Nieznane** imperium obsadza okręty", to **skąd o tym wiemy?**
Odpowiedź modelowa jest dobra i warta pokazania w grze: `contact` znaczy „już ich kiedyś
obserwowaliśmy", więc ruch przy stoczniach jest rozpoznaniem WZORCA, nie odczytem tożsamości. Jedna
klauzula („ruch przy stoczniach") czyni to czytelnym.

**Nie wdrożone, bo nie jest to zmiana trywialna — i przyczyna jest ZMIERZONA, nie przypuszczana.**
Podtytuł ma DOKŁADNIE JEDNĄ powierzchnię renderującą: wiersz dzwonka. `NotificationDropdown.js:76`
ustawia panel na sztywne **320 px**, a `:216-217` dają OBU liniom (tytuł i podtytuł)
`white-space:nowrap; overflow:hidden; text-overflow:ellipsis`. Po odjęciu paddingów (`:208`
`6px 12px 6px 28px`) i przycisku ✕ (`:220`) zostaje **~250 px**, przy czym `· yr NN` jest doklejone
do linii PODTYTUŁU (`:204`, `:217`), więc zjada z tego budżetu kolejne ~8 znaków. Obecny angielski
podtytuł zużywa ~35 znaków z ~52 dostępnych; klauzula „movement observed near shipyards" to +32 znaki,
czyli **dwukrotne przepełnienie** — wynikiem byłoby „…" i **zniknięcie roku**. Gdy lista przekroczy
`max-height: 320px` (`:178`), pasek przewijania zabiera z tej samej szerokości jeszcze ~8-17 px.

**Trzy fakty, które kształtują poprawkę** (wszystkie sprawdzone w kodzie):
1. **Nie ma osobnego klucza wariantu anonimowego.** Rozgałęzienie anonim/nazwa siedzi w WARTOŚCI
   `empName` (`NotificationCenter.js:288-289`) wstrzykiwanej w ten sam `notif.mobilizationTitle` /
   `notif.mobilizationSubtitle`. Ograniczenie klauzuli do anonimu wymaga **gałęzi w kodzie** plus
   jednego NOWEGO klucza w obu słownikach — nie jest to edycja wartości i18n.
2. **Podtytuł nigdy nie dociera do Dziennika** — kopia do EventLogu bierze `logText ?? title`
   (`NotificationCenter.js:119-124`), a `logText` to TYTUŁ. Klauzula w podtytule byłaby widoczna
   wyłącznie w przyciętym wierszu dzwonka.
3. **Klik w ten wiersz nie otwiera NICZEGO.** `_openNotificationDetail` (`MissionEventModal.js:396-409`)
   rozgałęzia się po `notif.source` i kończy `default: return;` — `'directorMobilization'` nie ma
   przypadku. Mobilizacja jest jedyną notyfikacją bez detalu, a **właśnie tam** dłuższa proza wywiadu
   należy. To jest zapisane jako §Findings filed 13 i jest to właściwa poprawka, nie łatanie stringa.

⚠ Tytułów NIE wolno ruszać bez ostrożności: `w2_ai_mobilization_smoke` (`:236-237`, `:242`) asercjuje
na **zinterpolowanym TYTULE** („na `contact` nazwa imperium jest ZATRZYMANA" / „dopiero pełne
rozpoznanie ujawnia nazwę"), więc usunięcie `{0}` z któregokolwiek tytułu wywala T6.
⚠ `NotificationCenter.serialize` (`:144`) utrwala **już przetłumaczony** podtytuł w zapisie, więc
jakakolwiek zmiana treści dotyczy tylko NOWYCH wpisów — weryfikacja w przeglądarce musi patrzeć na
ŚWIEŻO odpaloną mobilizację, nie na wpis wczytany z zapisu.

Do wyboru, gdy ktoś to podejmie: **(A)** przepisać podtytuł zwięźle zamiast dopisywać
(`Ruch przy stoczniach · rezerwa: {0}` / `Movement near shipyards · reserve: {0}` — ~197-211 px z ~250,
czysta edycja i18n, ale klauzula pojawia się też przy `detailed`); **(B)** wierne życzeniu — gałąź
`t(named ? 'notif.mobilizationSubtitle' : 'notif.mobilizationSubtitleAnon', count)` w
`NotificationCenter.js:295` (`named` już istnieje w zasięgu) + nowy klucz w `pl.js`/`en.js`
(3240 → 3241 w obu, parytet i `check-i18n` bez zmian). **(C)** — właściwa: dopisać
`'directorMobilization'` do `_openNotificationDetail` i tam umieścić prozę.
Każda z nich wymaga **jednego spojrzenia w przeglądarce na wiersz dzwonka po ANGIELSKU** — a tego nie
robi się przy zamykaniu gate'u.

### 2. Zagadka: dwa statki AI PRZELECIAŁY przez układ gracza w okolicy roku 25 — WYJAŚNIONE

**To nie jest zachowanie W2 i nie jest to usterka.** To reguła `first_contact` z **Director Slice 1**
(strumień C) — mechanizm trzeci, którego rozumowanie Filipa („doktryny celują we WŁASNE układy,
kurierzy latają punkt-punkt") słusznie nie obejmowało, bo dotyczyło strumienia B.

`scienceFlyby` (`DirectorFirstContact.js:96-169`) tworzy **JEDNĄ** nieuzbrojoną sondę na obwodzie
układu gracza (`FLYBY_RADIUS_PX = 2600` = **23,6 AU** przy `AU_TO_PX = 110`) i prowadzi ją prostym
kursem **przez** pozycję planety macierzystej na drugą stronę, gdzie despawnuje z powodem
`exited_system` (`:200-250`) — czyli dosłownie przelot, nie przylot. Reguła ma
`cooldown: { once: true }` (`DirectorRuleData.js:79-89`), a normalna galaktyka ma **dokładnie dwa**
imperia (`EmpireGenerator.js:19-20`, `emp_001`/`emp_002`) ⇒ **maksymalnie dwie sondy w całej partii.
Dwa statki to pełna, zamknięta liczba, nie próbka.**

Wszystkie pozostałe drogi, którymi kadłub AI mógłby znaleźć się w `sys_home`, są albo debugowe, albo
martwe w normalnej grze: materializator floty jest nieosiągalny, bo `empire.fleets` nigdy nie ma
wpisów (`ThreatAssessment.js:10-13`, pinowane `war_seams_smoke` T5), a jego dwaj producenci to martwa
gałąź `MilitaryAI.build_fleet` (`MilitaryAI.js:121-124` — czyta `empire.resources.production`, którego
`createEmpire` już nie zapisuje) i cheat testowy · doktryny są wewnątrzukładowe i zakotwiczone na
WŁASNEJ stolicy (`DirectorDoctrine.js:136-171`, `:275-300`) · kurierzy jeżdżą do WŁASNYCH outpostów
(`EmpireLogisticsSystem.js:240-247`), a budzik z W2-7 (`:360-386`) zmienia tylko STAN statku, nie cel ·
mobilizacja jest czysto stanowa (`VesselManager.js:889-926`, `:963-981` — zero zapisu pozycji) ·
kolonizacja AI jawnie pomija układ gracza (`EmpireStrategySystem.js:367-370` `if (s.isHome) continue;`) ·
emisariusz AI nie ma statku (`AlienCivSystem.js:148-166`).

**Zapytania potwierdzające** (rodzaj, nie tekst — Filip gra po angielsku). ⚠ Sprawdzone
STRUKTURALNIE (nazwy istnieją: `DebugLog.js:48-54`, `GameScene.js:634-650`), **nie wykonane na żywym
silniku** — ten sam wyjątek, który §L tej checklisty zgłosił dla dzwonka:

`KOSMOS.debug.directorRules()` → wiersze `first_contact|emp_001` i `first_contact|emp_002` z `odpalila: TAK`, `proby: 3`

`KOSMOS.debugLog.query({ kind: 'director:flybyStarted' })` → dwa wpisy (`director:flybyEnded` z `reason:'exited_system'` ~6 lat później)

⚠ Kind `director:flyby` **nie istnieje** (są `flybyStarted`/`flybyRejected`/`flybyEnded`/
`firstContactBeat`/`firstContactKill`), a `director:ruleFired` **nie jest śledzony** — stan reguł
czyta się przez `gameState.get('director.rules')`.

**Dwie korekty do samego mechanizmu, wyłapane przy okazji:** (a) sonda startuje **~2 lata
wyświetlane** po osiągnięciu obserwatorium Lv5, nie 3 — `DirectorSystem.js:213` ma
`if (last != null && …)`, więc PIERWSZA próba nie jest ograniczana i próby padają na Y0, ~Y0+1,
~Y0+2; rok 25 znaczy więc Lv5 około roku **23**; (b) kurs zapamiętuje pozycję domu **z chwili
startu** (`:118-120` → `:125-128`, zamrożone w `gameState.director.flybys`), a planeta krąży dalej
przez te 6 lat — sonda przelatuje tam, gdzie dom BYŁ, nie gdzie jest.

**A przy okazji wyszedł realny defekt, którego nikt nie szukał — patrz §Findings filed 12:
„pierwszy kontakt" jest w KAŻDEJ partii zsynchronizowaną parą sond lecących z tego samego namiaru.**

### 3. Rezerwa z przyciskiem ROZMIEŚĆ w Rejestrze — ZAMIERZONA symetria W2-6

Tak, zamierzona i **pinowana**. `_drawServiceStateAction` (`FleetManagerOverlay.js:8440-8479`) to
**jeden przycisk na jednej osi służby**: `toReserve = state === 'active'` wybiera `📦 Wycofaj`
(`withdraw_vessel`) dla okrętu w służbie i `⚓ Rozmieść` (`deploy_vessel`) dla kadłuba w rezerwie, a w
stanie `mobilizing` rysuje pasek postępu i **nie rejestruje żadnej strefy klikalnej**. Wołany
`:8499`, czyli PRZED early returnem `getAvailableActions` (`:8501-8506`) — dokładnie tą pułapką z
audytu §S19, która zjadałaby przycisk zawsze, bo lista akcji bezczynnego kadłuba jest pusta.
Keeper `w2_deploy_ui_smoke` (`:167-192`) pinuje oba kierunki **i kontrolę pinu** („NIE dostaje przy
tym Rozmieść — jeden przycisk, nie dwa").

⇒ Rozmieszczenie żyje **w dwóch miejscach, świadomie o różnym zasięgu**: Stocznia jest lokalna dla
stoczni (`ShipyardOverlay.js:455` pomija kadłuby nieprzypisane do czynnej kolonii), Rejestr jest
ogólnoimperialny (brak filtra kolonii). **Każda przyszła zmiana bramkowania rozmieszczenia musi
wejść w OBA miejsca, inaczej się rozjadą.**

Jedna prawdziwa rozbieżność, zgłoszona jako §Findings filed 14: **odmowa z powodu zaległości ma dwie
różne konwencje**. Stocznia wyszarza przycisk i **nie rejestruje** strefy (`:521-534`, komentarz:
„wyszarzony przycisk nie może cicho nic nie robić"), Rejestr rejestruje ją zawsze i odmawia wpisem do
Dziennika (`:8473` + `:2175-2187`, komentarz: „przycisk, który po kliknięciu milczy, jest gorszy od
przycisku wyszarzonego"). Oba komentarze powstały w tym samym commicie i **argumentują przeciwnie**.
To polish UX, nie defekt W2 — ale jedna konwencja powinna wygrać.

### 4. Dane do rejestru — dwa wpisy, żaden nie jest usterką W2

**(a) Zmienność ekspansji AI.** Lista braków `emp_002` zawierała **SUROWE RUDY** (Fe 125, Hv 30, Cu),
czego lista `emp_001` nie miała — jego gospodarka jest po prostu PŁYTSZA — a pierwsze outposty
postawiło w civYear **~460-465**. Zestaw z historią: outposty w civY 85/140/155/160/185 (Director
GATE 3), zero outpostów w oknie 400 civY × 3 seedy (sonda W1), pełne kolonie 303-353 (było ~456).
Wniosek, który z tego wychodzi: **zegar ekspansji jest własnością konkretnego imperium i seeda, nie
progiem silnika**. Zapisane jako §Findings filed 11 + dopisek w §8 wyżej.

**(b) `population_milestone.mp4` 404.** Znany, **już zgłoszony dwukrotnie**
(`KOSMOS_backlog_niezrealizowane.md:200` — „zauważone w przebiegu 3 GATE 1 (2026-08-11)";
`assets/event-videos/midjourney_prompts.md:230` — wiersz 1 backlogu generowania, z priorytetem
oznaczonym „zgloszone z gry jako 404"). To **kosmetyczny hałas w konsoli, nie awaria**: łańcuch
fallbacku (`GameScene.js:3028-3034`) próbuje `<id>.mp4` → `<videoCategory>.mp4` → `default.mp4`, a
`colony.mp4` istnieje, więc popup gra. **Nie należy do wiersza 7** („konsola bez czerwonych błędów"),
który jest zawężony do `TypeError … reading 'action'`. Zadanie = wygenerować plik (równoległe zadanie
Filipa wg `midjourney_prompts.md`), nie kod.

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
