# W2 — GATE 2: pętla gracza (rezerwa · rozmieszczenie · załoga) — checklista live

**Slice:** W2 (model rozmieszczenia) · **Commity:** `496067c` (W2-4 załoga przy deploy) ·
`e84bb72` (W2-5 utrzymanie rezerwy) · `c9062a1` (W2-6 UI)
**Plan:** `docs/design/W2_PLAN.md` · **Poprzedni gate:** `W2_GATE1_CHECKLIST.md` ✅ ZDANY
**Stan przed gate'em:** sweep **135/135 OK, 0 FAIL** · `check-i18n` **PASS** (pl=en=3235,
0 rozbieżności) · zapis **v101 bez migracji** (żaden z tych trzech commitów nie rusza wersji)

> **CO TU SPRAWDZAMY.** Czy „budowa to przemysł, rozmieszczenie to ludzie" jest PRAWDĄ
> W GRZE, a nie tylko w testach. Trzy rzeczy: kadłub schodzi ze stoczni BEZ załogi i nic
> nie robi · obsadzenie go kosztuje POP i trwa miesiąc · strata okrętu zabija załogę.
>
> ⚠ **TO NIE JEST GATE O AI.** Patrz §0b — bezczynność floty AI jest na tym etapie
> ZAPLANOWANA, nie regresyjna.

**Zasady stałe (każda kupiona błędem, wszystkie obowiązują):** żadnego wielolinijkowego kodu
w cytatach blokowych · stolica WYŁĄCZNIE przez `KOSMOS.directorProduction.capitalOf(empireId)` ·
niedobory czytać **z silnika**, nigdy z listy w pamięci · `DebugLog` to pierścień **czyszczony
przy reloadzie** · **nigdy** gate równolegle z pracą CC · dźwignie stanu tylko przez zwalidowane
narzędzia. Wszystkie one-linery poniżej **WYKONANE** na żywym silniku przed wpisaniem tutaj.

---

## 0. Przygotowanie

- [ ] **CC nie pracuje.** Żadnego równoległego zapisu do repo.
- [ ] Zrób kopię zapisu na dysk (menu ☰ → „Zapisz do pliku"). Ten gate rusza populację
      i kredyty — chcesz móc wrócić.
- [ ] Odśwież grę (Live Server), otwórz konsolę (F12).

---

## 0b. ⚠ CZEGO NIE UZNAWAĆ ZA BŁĄD NA TYM GATE'CIE

**Flota AI stoi bezczynnie i to jest ZAPLANOWANE.** Po W2-2 każdy kadłub schodzący ze
stoczni — także kurier AI — ląduje w rezerwie, a DECYZJA mobilizacyjna AI jest zawartością
**W2-7** (jeszcze nie napisaną). `deployVessel` jest gotowe i nie patrzy na właściciela;
brakuje wyłącznie reguły Directora, która je zawoła. Objawy do zignorowania **na tym gate'cie**:

- okręty AI nie patrolują i nie atakują,
- logistyka AI (kurierzy) stoi,
- siła militarna AI czytana przez wywiad jest niska albo zerowa.

Wszystko to wchodzi do weryfikacji na **GATE 3** i **wyłącznie na żywej grze** (wpis wiążący
z rejestru: „okręt wojenny AI powstaje end-to-end" jest niemierzalny headless, bo `GameCore`
nie montuje Directora).

---

## 1. Kadłub schodzi ze stoczni DO REZERWY

- [ ] Zbuduj okręt wojenny w stoczni **orbitalnej** (stacja). Po ukończeniu **NIE** pojawia
      się jako gotowy okręt — ląduje w sekcji **REZERWA** w panelu **Stocznia** (klawisz `S`).
- [ ] W sekcji widać: nazwę, **koszt załogi w POP**, **utrzymanie w Kr/rok z dopiskiem
      „(10% stawki)"** i przycisk **⚓ Rozmieść**.
- [ ] Nagłówek sekcji pokazuje zbiorczy rachunek rezerwy (`N kadł. · X Kr/rok`).

**L1 — rozkład stanów służby w całej flocie:**

`KOSMOS.vesselManager.getAllVessels().reduce((a,v)=>{const k=v.serviceState??'active';a[k]=(a[k]||0)+1;return a;},{})`

- [ ] Świeżo zbudowany kadłub widnieje jako **`stored`**.

> **Skrót, jeśli nie chcesz czekać na stocznię:** `KOSMOS.debug.spawnMyVessel('hull_frigate', { serviceState: 'stored' })`
> (zweryfikowane: `createAndRegister` przepuszcza `serviceState`, domyślnie daje `active`).

---

## 2. Rezerwa NIC NIE ROBI (i to jest cała jej cena)

- [ ] Kadłub z rezerwy **nie pojawia się** na liście statków dostępnych do misji.
- [ ] **Nie broni układu.** Jeśli masz pod ręką atak (albo `KOSMOS.debug.spawnEnemyAttack`),
      sprawdź, że rezerwa nie wchodzi do bitwy i **nie zostaje wrakiem** przy upadku układu.
- [ ] **Nie tankuje.** Zostaw kadłub w rezerwie na kilka lat i sprawdź, że paliwo nie rośnie
      (rezerwa nie pobiera drugiego, nieopisanego utrzymania obok stawki 10%).

**L2 — rozbicie rachunku floty na służbę i rezerwę:**

`KOSMOS.vesselManager.getFleetUpkeepBreakdown()`

- [ ] `reserveCount` zgadza się z liczbą kadłubów w magazynie, a `reserve` to **10%** tego,
      co te kadłuby kosztowałyby w służbie.
- [ ] **Panel Gospodarka → BUDŻET** pokazuje wiersz **„w tym rezerwa (N)"** pod utrzymaniem floty.

**L3 — siła vs potencjał (rozdział z W2-2):**

`(()=>{const t=KOSMOS.threatAssessment;return{sila:t.getStrength('player'),potencjal:t.getPotentialStrength('player'),rezerwa:t.getReserveStrength('player')}})()`

- [ ] Kadłub w rezerwie **podnosi `potencjal`, nie podnosi `sila`**. (Zmierzone na czystym
      boocie z jedną fregatą w magazynie: `sila 0`, `potencjal 156`, `rezerwa 156`.)

---

## 3. Rozmieszczenie kosztuje POP i trwa MIESIĄC

- [ ] Kliknij **⚓ Rozmieść**. Kadłub przechodzi w stan przejściowy — w miejscu przycisku
      pojawia się **pasek postępu z etykietą „Mobilizacja — 1 miesiąc"**.
- [ ] Dziennik notuje rozpoczęcie z **liczbą POP** w treści.
- [ ] **Wolne POPy kolonii spadły** o załogę okrętu (zakładka Załoga / panel populacji).

**L4 — księga załogi TEGO kadłuba (podaj własne ID statku):**

`(()=>{const v=KOSMOS.vesselManager.getVessel('WKLEJ_ID');return{stan:v.serviceState,postep:v.mobilizeProgress,cel:v.mobilizeTarget,zaloga:v.crewLocked,warstwy:v.crewStrataLocked,placi:v.crewColonyId}})()`

- [ ] `zaloga` = koszt załogi kadłuba, `warstwy` pokazuje z jakiej warstwy pracowników wzięto
      ludzi (np. `{laborer: 0.4}`), `placi` = kolonia, która ich oddała.

- [ ] **Odczekaj jeden wyświetlany miesiąc gry.** Kadłub przechodzi w **służbę**, Dziennik to
      notuje, a od tej chwili zachowuje się jak normalny okręt (misje, obrona, patrole).
- [ ] Utrzymanie tego okrętu skoczyło z 10% na **pełną stawkę** (detal statku w Rejestrze `K`).

**Pełny przegląd modelu, jeśli coś nie gra:** `KOSMOS.debug.reserveInfo()` — dwie tabele:
stan służby i księga załóg per statek + blokady/wolne POPy per kolonia.

---

## 4. Wycofanie oddaje DOKŁADNIE to, co wzięło

- [ ] W Rejestrze (`K`) wybierz okręt w służbie → **📦 Wycofaj do rezerwy**.
- [ ] Pasek „Wycofanie — 1 miesiąc". ⚠ **POP jeszcze NIE wraca** — wraca dopiero po
      zakończeniu (to decyzja projektowa, nie błąd).
- [ ] Po miesiącu: kadłub jest w rezerwie, **wolne POPy wróciły dokładnie w tej liczbie**,
      którą zabrało rozmieszczenie, a Dziennik to notuje.

---

## 5. Strata okrętu ZABIJA załogę (R-C)

- [ ] Strać **rozmieszczony** okręt w walce.
- [ ] Dziennik ma wpis „**Załoga … zginęła razem z okrętem (X POP)**" z nazwą okrętu.
- [ ] Blokada POP po tym okręcie **zniknęła** (wolne POPy nie są już nią obciążone).

**L5 — ubytek ludzi (zrób odczyt PRZED i PO stracie):**

`(()=>{const c=KOSMOS.colonyManager.getColony(KOSMOS.homePlanet.id).civSystem;return{ludzie:+c.humans.toFixed(3),populacja:c.population,wolne:+c.freePops.toFixed(3),zablokowane:+c._lockedPops.toFixed(3)}})()`

- [ ] `ludzie` spadło **dokładnie o załogę** (np. 0.4 — nie o całego człowieka).
      To jest sedno poprawki: surowa ścieżka zabijała 1 POP za załogę 0.4 (2,5× za dużo).
- [ ] ⚠ Przy małych załogach `populacja` (liczba całkowita) może spaść dopiero po kilku
      stratach — to **poprawne**. Miarą jest `ludzie`, nie licznik całkowitych.

---

## 6. Zaległości blokują rozmieszczenie (a nie oddają sparaliżowany okręt)

- [ ] Doprowadź kolonię do braku kredytów na utrzymanie floty (np. `KOSMOS.debug` do zbicia
      kredytów albo po prostu duża flota + czas).

**L6 — czy kolonia zalega:**

`KOSMOS.vesselManager.colonyInArrears(KOSMOS.colonyManager.activePlanetId)`

- [ ] Gdy `true`: w sekcji REZERWA przycisk **Rozmieść jest wyszarzony i NIEKLIKALNY**,
      a pod listą stoi czytelny powód („Kolonia zalega z utrzymaniem floty…").
- [ ] Kadłub w rezerwie **NIE zbiera zaległości** — sprawdź `unpaidYears` na kadłubie
      w magazynie (ma zostać 0, mimo że kolonia nie płaci).
- [ ] Po spłaceniu długu przycisk wraca.

---

## 7. Nic się nie zepsuło poza tym, co miało

- [ ] Panel **Stocznia** (`S`): budowa statków działa jak dotąd, przycisk budowy **NIE jest
      już blokowany brakiem POPów** (budowa to przemysł), kolejka i Surge bez zmian.
- [ ] **Przewiń** sekcję Stoczni w dół i kliknij w miejsce, gdzie *przed* przewinięciem był
      przycisk Rozmieść — **nic się nie dzieje** (to była realna usterka „ghost-click"
      w tym panelu; ten commit ją zamyka).
- [ ] Rozbiórka statku (Rozbierz) działa; rozbiórka kadłuba, który **nigdy nie był
      rozmieszczony**, **nie dodaje** POPów z powietrza.
- [ ] Kolonie, populacja, kredyty, surowce — bez skoków niezwiązanych z powyższym.
- [ ] Nawigacja ma nadal **7 slotów** (Rezerwa mieszka w Stoczni, nie w nowym kaflu).
- [ ] **Konsola bez czerwonych błędów** przez cały przebieg.

---

## Wynik

| pozycja | wynik |
|---|---|
| 1. Kadłub ze stoczni ląduje w REZERWIE | ⬜ |
| 2. Rezerwa nie walczy, nie lata, nie tankuje; 10% w BUDŻECIE; potencjał ≠ siła | ⬜ |
| 3. Rozmieszczenie: POP + jeden miesiąc + wejście do służby | ⬜ |
| 4. Wycofanie oddaje dokładnie tyle, ile wzięło (po miesiącu) | ⬜ |
| 5. Strata okrętu zabija załogę ułamkowo, Dziennik notuje | ⬜ |
| 6. Zaległości blokują rozmieszczenie; rezerwa nie zalega | ⬜ |
| 7. Brak regresji + ghost-click zamknięty + konsola czysta | ✅ |

**GATE 2:** ✅ **ZDANY** (2026-08-16, Filip) — wszystkie siedem sekcji.

Dowody z żywej gry: rozmieszczenie pobrało **dokładnie 0.4** (wolne 10 → 9.6, blokada 0 → 0.4,
typowane `{laborer: 0.4}`, płatnik `entity_3`) przy **nietkniętej** populacji na pauzie ·
wycofanie oddało dokładnie ten sam ułamek · **R-C udowodnione end-to-end**: wpis w Dzienniku
„Crew of 'Furia' died with the ship (0.4 POP)", a blokada zeszła przez ŚMIERĆ, nie przez zwrot
(ułamkowa śmierć przez `_growthProgress` działa) · utrzymanie rezerwy 10 % widoczne w BUDŻECIE
z poprawnym rozbiciem `{deployed: 650, reserve: 30}` · rozdział siła/potencjał na żywo
(669 / 981 / 312) · bramka zaległości blokuje rozmieszczenie z czytelnym powodem, a rezerwa
nie zbiera `unpaidYears` · ghost-click zamknięty · konsola czysta.

---

## Domknięcie po GATE 2 — trzy odpowiedzi (żadna nie otwiera gate'u ponownie)

### 1. Czym NAPRAWDĘ jest „zaległość" (zmierzone, nie wywnioskowane)

Filip zauważył, że dosypanie 10 000 Kr z konsoli **nie odblokowuje** uziemionej floty, i postawił
hipotezę „liczone z PRZEPŁYWU budżetu, nie ze stanu konta". Pomiar na żywym silniku mówi, że
mechanizm jest **trzecią rzeczą** — ani przepływem, ani saldem:

> **Zaległość to ZATRZASK po nieopłaconym rozliczeniu, zdejmowany przy najbliższym UDANYM.**
> Rozliczenie utrzymania floty biegnie **raz na ROK GRY**.

Przebieg pomiaru (stawka krążownika 1000 Kr/rok gry): rok bez opłaty → `unpaidYears = 1`,
`arrears = true` · **dosypanie 10 000 Kr → `arrears` DALEJ `true`**, deploy dalej odmawia ·
po najbliższym naliczeniu (kredyty 10 000 → 8 900) → `unpaidYears = 0`, `arrears = false`,
deploy przechodzi · pół roku gry nie odpala naliczenia w ogóle (akumulator).

**Definicja jest ZAMIERZONA** i wpisana do planu (decyzja 17): kolonia, której budżet nie
UTRZYMA floty, nie ma prawa obsadzać kolejnych okrętów. **Opóźnienie do roku gry między
zapłatą a odblokowaniem — nie było przemyślane** i zostało ZGŁOSZONE (§Findings filed 9),
nie naprawione drive-by: to predykat odmowy, który ten gate właśnie zatwierdził.

Naprawiony został natomiast **tekst**, bo poprzedni („najpierw spłać dług") kazał graczowi
szukać nieistniejącego guzika „zapłać":
`Budżet nie utrzymał floty — blokada zniknie po najbliższym udanym rozliczeniu (rocznym)`.

### 2. Pięć kadłubów AI `active` / 0 załogi — czego DA SIĘ dowieść, a czego nie

**Statki nie mają znacznika czasu utworzenia** (`grep` po `createdYear|createdAt|spawnYear`
w `Vessel.js` — zero trafień), więc pytanie „czy wszystkie pięć powstało przed W2-2" jest
**nierozstrzygalne z samego zapisu**. Da się natomiast dowieść przez **wyczerpanie zapisujących**:

- ŻADEN z nich nie zszedł ze stoczni po `c4526b6`. Oba szwy stoczni stemplują `'stored'`
  (`VesselManager.js:1667`, `StationSystem.js:524`), a `'active'` pisze wyłącznie: domyślna
  wartość w `createVessel` (`Vessel.js:298`), `restore` (`:1558`), migracja v101 i domknięcie
  mobilizacji — to ostatnie ustawia `crewLocked > 0`, więc odpada. Kadłub `active` z zerową
  załogą **nie może** pochodzić ze stoczni po bumpie. ✅
- ⚠ **NIE wolno stąd wnosić, że wszystkie pięć jest sprzed W2-2.**
  `EmpireFleetMaterializer.js:105` woła `createVessel` **BEZ** `serviceState` → jego kadłuby
  rodzą się `'active'` z `crewLocked: 0` i ta ścieżka **działa dziś**. Tak samo sonda
  pierwszego kontaktu (`DirectorFirstContact.js:132`) i spawnery debug/sandbox.
  Flota zmaterializowana **omija model załogi w całości**: nie kosztuje AI ani jednego POP
  i jej strata nikogo nie zabija (§Findings filed 10 — pytanie na **W3**, bo to główne
  źródło floty AI i jego wycena jest decyzją balansową).

**Rozstrzygające zapytanie na żywym zapisie Filipa** (materializacja zostawia ślad na flocie
imperium, więc da się je rozdzielić):

`(()=>{const mat=new Set();for(const e of (KOSMOS.empireRegistry?.listAll?.()??[]))for(const f of (e.fleets??[]))for(const id of (f.materializedVesselIds??[]))mat.add(id);return KOSMOS.vesselManager.getAllVessels().filter(v=>v.ownerEmpireId&&!v.isWreck).map(v=>({id:v.id,hull:v.shipId,stan:v.serviceState??'active',zaloga:v.crewLocked??0,zrodlo:mat.has(v.id)?'MATERIALIZACJA (po W2-2 możliwe)':'zapis/stocznia'}))})()`

### 3. Filtry Dziennika muszą być NIEZALEŻNE OD JĘZYKA

Filip gra z **angielskim** Dziennikiem; grep po polskim słowie kluczowym zwrócił pustkę, mimo że
wpis był na ekranie. Reguła dopisana do **stałych zasad gate'ów** (`W2_PLAN.md` §Verification)
i obowiązuje wszystkie przyszłe checklisty:

> **Nigdy nie filtruj wpisów Dziennika po TEKŚCIE WYŚWIETLANYM.** Filtruj po rodzaju zdarzenia,
> kanale albo `type` wpisu. Dopasowanie obu lokalizacji naraz jest awaryjne, nie domyślne.

---

## Gdyby coś poszło nie tak

- **Kadłub ze stoczni od razu jest w służbie** → sprawdź L1. Jeśli `active`, to szew stoczni
  nie nadał magazynu — zgłoś z ID statku i informacją, KTÓRA stocznia go zbudowała.
- **Rozmieszczenie odmawia bez widocznego powodu** → powód leci do Dziennika i toasta.
  Jeśli w Dzienniku widnieje surowy kod (`no_crew_pops` zamiast zdania), to brakujące
  tłumaczenie — zgłoś sam kod.
- **Mobilizacja nigdy się nie kończy** → sprawdź `mobilizeProgress` przez L4. Rośnie, ale nie
  dochodzi do 1.0 → zły zegar (miałby być cywilizacyjny). Nie rośnie wcale → tick nie biegnie.
- **POP nie wrócił po wycofaniu** → sprawdź `placi` (L4) sprzed wycofania: POP wraca do
  kolonii, która go DAŁA. Jeśli ta kolonia już nie istnieje, załoga zginęła razem z nią
  i to jest zachowanie zamierzone.
- **Flota AI stoi** → patrz §0b. To nie jest usterka tego gate'u.
