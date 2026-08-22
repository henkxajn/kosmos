# BRAMKA WŁASNOŚCI KOLONII — plan doc (✅ **BLOK P0 ZAMKNIĘTY · D1-D6 PODPISANE 2026-08-22**)

> # ✅ BLOK P0 ZAMKNIĘTY — GATE P0 ZDANY W CAŁOŚCI (2026-08-20)
> **P0-A=W1 · P0-B=W1 · P0-C=W2 (+„dom wraca przy odbiciu"=W2) · P0-D=W1** — podpisane 2026-08-19,
> wdrożone i **zweryfikowane na żywo 2026-08-20**.
> **GATE P0 §1-§7 PASS**, w tym §7 (odbicie stolicy przywraca `isHomePlanet: true`).
> Commity: **OG-0** `e86c091` (keeper szwów) · **OG-2** `0085a37` (naprawa) · `a03be51` (docs) ·
> `c4ab33b` (checklista) · **`6796617`** (fix po §6 — niżej).
> Stare zapisy **naprawiają się same przy wczytaniu**; **zapis v101, bez migracji**.
>
> ⚠ **§6 PADŁ ZA PIERWSZYM PODEJŚCIEM I TO BYŁA WARTOŚĆ GATE'U.** Kryterium „nic nie rzuca wyjątkiem"
> (a nie „panel jest pusty") złapało crash **co klatkę** w `GroundUnitPanel._drawActions` →
> `ColonyManager._canRecruitMoreUnits` (`colony.planetId` przy `colony === null`), a za nim **drugi,
> ukryty**: `_getMaxGroundUnits` (`colony.civSystem`, `GroundUnitPanel:623`). Oba naprawione w `6796617`;
> keeper `zero_colony_panels_smoke` (11/11) jest **wykonaniowy** — przepędza prawdziwą pętlę `draw()`
> z `getColony: () => null`. **Ani jeden, ani drugi nie był defektem P0** — to była ta sama KLASA
> (kod zakładający żywą kolonię) w pliku, którego P0 nie dotykał.
> ⚠ **Lekcja wiążąca dalej:** `mgr?._method?.(nullColony)` — **opcjonalne łańcuchowanie chroni
> ODBIORNIK, nigdy ARGUMENT**. Guard należy do helpera, bo to helper jest kontraktem.
>
> **D1-D6 (klasy A/B/C, przynależność kafla, predykat) — ✅ PODPISANE 2026-08-22** w całości zgodnie
> z rekomendacjami sekcji: **D1=W2+W1 · D2=W3+W1 · D3=W1 · D4=W3+flash · D5=W1 · D6=W2**, plus
> **Finding 97 w zakresie** jako osobny commit **OG-3b**. Trzy sprostowania z dnia podpisu i kolejność
> commitów: §Podpis części II.
> **Zero kodu w tym dokumencie.** Cytaty ze źródła są dowodem, nie propozycją implementacji.

---

**Arc:** WOJNA I POKÓJ 1.0 · **Workstream:** przekrojowy (nie należy do AI_CAPTURE) ·
**Slice:** COLONY_OWNERSHIP_GUARD
**Status:** ✅ **Blok P0 (P0-A..P0-D) PODPISANY 2026-08-19 i WDROŻONY 2026-08-20** (`e86c091`, `0085a37`).
✅ **D1-D6 PODPISANE 2026-08-22** (+ Finding 97 w zakresie) — implementacja rusza od **OG-1**.
**Parent:** `AI_CAPTURE_PLAN.md` §Findings (slice-rodzic **nie jest** właścicielem tej wady) ·
`W3_PLAN.md` (W3-1 `efa8f85` jest warunkiem koniecznym osiągalności)
**Basis:** `docs/audit/COLONY_OWNERSHIP_GATE_AUDIT.md` (2026-08-19 — 13 agentów, sześć sond
z przebiegiem adwersarialnym, §6 zweryfikowany ręcznie) + druga tura pomiarowa pod warianty tych
decyzji (2026-08-19 — 13 agentów, sześć tematów, krytyk planu) + cztery weryfikacje własne
prowadzącego.
**Save:** v101 · **CURRENT_VERSION = 101**, `MIN_SUPPORTED_VERSION = 4` (`SaveMigration.js:28-29`).
**Ten plan NIE przesądza bumpu — to treść decyzji P0-B i P0-D.**
**Zakres kodu w tym dokumencie:** ŻADEN.

**Konwencja językowa:** polski, jak `AI_CAPTURE_PLAN.md` / `D2_PLAN.md` / `DIRECTOR_SLICE1_PLAN.md` —
dokument czyta właściciel, nie orkiestrator, a stoi na polskim audycie.

---

## RESUME — czytaj to PIERWSZE

**Jedno zdanie, z którego wynika cały ten plan:**

> W tej grze istnieje bramka **„która kolonia"** i **nie istnieje** bramka **„czyja"**. Nie budujemy
> nowej mechaniki — **dopisujemy termin własności tam, gdzie od zawsze go nie było**, i najpierw
> zamykamy ścieżkę wczytania, która sama, bez udziału gracza, przywraca zły stan.

**Rozstrzygnięcie zakresu (podjęte przez właściciela 2026-08-19):** to **osobny plan**, nie doklejka do
AC-8. Uzasadnienie w audycie §4/§8 — wada jest starsza od AI_CAPTURE (guard stoi w pierwszym commicie
repo), a warunkiem koniecznym osiągalności była **W3-1**, nie AC-8.

### Decyzje

| # | decyzja | status |
|---|---|---|
| **P0-A** | Kto jest **jedynym autorytatywnym pisarzem** pięciu wskaźników `window.KOSMOS` przy wczytaniu — i co robi, gdy gracz nie ma domu? | ✅ **PODPISANA: W1** · WDROŻONA |
| **P0-B** | Własność kolonii: **serializowana** czy dalej **wyprowadzana** z `empires[].colonies`? | ✅ **PODPISANA: W1** (wyprowadzana) |
| **P0-C** | `isHomePlanet` przy przejęciu: czyścić? A przy odbiciu — przywracać? | ✅ **PODPISANA: W2 + W2** · WDROŻONA |
| **P0-D** | **Bliźniak w `removeColony`** (`:667-672`, nieutwardzony, ŻYWY dziś) — w P0 czy osobno? | ✅ **PODPISANA: W1** (w P0) · WDROŻONA |
| **D1** | Czy **wiązanie** cudzej kolonii jest zabronione, czy tylko **działanie** na niej? | ✅ **PODPISANA: W2 (inwariant) + W1 (UX)** |
| **D2** | Klasa A — gdzie mieszka termin własności i **których guardów NIE wolno tknąć**? | ✅ **PODPISANA: W3 + W1 (obrona w głąb)** |
| **D3** | Klasa B — `MissionSystem.resourceSystem` i `TechSystem.resourceSystem` | ✅ **PODPISANA: W1** (bez własnego commitu — skutek OG-3) |
| **D4** | Klasa C — chokepoint w `ColonyOverlay` + **czy bramka odmawia, czy chowa** | ✅ **PODPISANA: W3 + „flash z powodem"** |
| **D5** | **Przynależność kafla** w `_build`/`_demolish` — ⚠ **kolejność wobec D1** | ✅ **PODPISANA: W1** — pierwsza w kolejce (**OG-1**) |
| **D6** | Predykat: **jedno źródło prawdy vs ujednolicenie stopniowe** (Finding 74) | ✅ **PODPISANA: W2** |
| **+97** | Utrzymanie floty płacone z koloni WROGA — w zakresie części II czy osobno? | ✅ **PODPISANA: w zakresie, własny commit OG-3b** |

⚠ **Dwie zależności kolejnościowe są twarde i wynikają z pomiaru, nie z gustu:**
1. **D5 musi wejść PRZED albo RAZEM z D1** (⚠ **SPROSTOWANE 2026-08-20 — pierwotnie stało tu
   „przed P0", i to było o jedną decyzję za nisko**). Stan „mój portfel, cudzy kafel" powstaje wtedy,
   gdy wskaźniki są GRACZA, a widok jest CUDZY. P0 tego nie otwiera: naprawia ścieżkę WCZYTANIA, po
   której gracz nie ogląda koloni wroga. Otwiera to dopiero **D1** (odmowa wiązania przy zachowanym
   widoku). ⚠ **A poza tym ten stan JUŻ DZIŚ JEST ŻYWY**: zaprojektowany podgląd obcej planety idzie
   przez `show({colonyId})`, który **nie woła** `switchActiveColony`, a pasek budowy jest bramkowany
   wyłącznie `!isPreview` (`ColonyOverlay.js:919`) — więc w trakcie desantu/ostrzału gracz buduje na
   cudzym kaflu ze swojego magazynu. `_build` nigdy nie sprawdza przynależności kafla (zmierzone:
   w całym ciele `:796-1015` **zero** odwołań do `this._grid`). D5 jest więc pilne **z własnych
   powodów**, nie jako warunek P0.
2. **P0-B rozstrzyga, czy P0-A ma z czego czytać własność** — ale **NIE tak, jak zakładał audyt**:
   patrz „Sprostowanie" niżej.

### ✅ Podpis części II — 2026-08-22

**Podpisane w całości zgodnie z rekomendacjami sekcji** (właściciel, 2026-08-22):
**D1=W2+W1 · D2=W3+W1 · D3=W1 · D4=W3+flash · D5=W1 · D6=W2 · Finding 97 = w zakresie, osobny commit.**

**Kolejność commitów (wiążąca):** **OG-1** (D5) → **OG-3** (D1+D2) → **OG-3b** (Finding 97) →
**OG-4** (D4) + **GATE 2** → **OG-5** (D6) → **OG-6** (docs).
⚠ **D3 nie dostaje własnego commitu** — przy D1=W2 wskaźnik nie ma jak trafić na obcą kolonię, więc W1
jest **skutkiem OG-3**; do rejestru i do pinu w keeperze, nie do implementacji.
⚠ **Zero migracji — zapis zostaje v101**: żadna z sześciu decyzji nie dotyka formatu zapisu.

**Trzy sprostowania wpisane w dniu podpisu** (pomiar w źródle, nie nowy audyt — rozwinięcia przy
odpowiednich decyzjach):
1. **D3: „pięć miękkich spendów" to dziś CZTERY.** `_launchFoundOutpost` utwardzone przez **D-111**
   (Finding 111, `a180619`). Zostają: transport cargo (`:840`/`:844`) i dwa rekonesanse (`:1245`,
   `:1386`). Piąty adres z audytu (`:1697`) to `receive(gained)` — **nagroda, nie wydatek** ⇒ brak
   exploita. **Werdykt D3 bez zmian.**
2. **D1: lista furtek spadła z czterech do DWÓCH** — `GameCore:310` i `CombatSandbox:228`. Własne
   fallbacki `ColonyManagera` po P0 wołają `switchActiveColony` **wyłącznie przez
   `_pickFallbackActiveColony`, które samo filtruje `ColonyManager.isPlayerColony`**.
3. **Finding 97: zakres ROZSTRZYGNIĘTY — wchodzi**, ale jako **własny commit OG-3b**, nie jako
   rozszerzenie D2/D3/D4.

**Co P0 i Finding 111 zmieniły w warunkach wstępnych** (poza trójką wyżej **żadna decyzja nie zmieniła
wariantu** — to jest wynik sprawdzenia, nie założenie):
- **D1 ma już gotowe „dokąd po odmowie"** — `_pickFallbackActiveColony` (`:349-354`) +
  `_detachActiveColony` (`:408`, lustro `switchActiveColony` co do pola), oba pinowane keeperem
  `colony_ownership_load` (33). Odmowa nie musi wymyślać stanu terminalnego.
- **D4 ma dowód, że UI znosi `colony === null`** — keeper `zero_colony_panels` (11, **wykonaniowy**)
  + fix `6796617`. Do tego lekcja z GATE P0 §6: **guard należy do helpera, nie do wołającego** — co
  wzmacnia wariant „producent + inwariant" przeciwko wariantowi „tylko `_onHit`".
- **D6: kanon się umocnił** — P0 dołożył trzy nowe wywołania `ColonyManager.isPlayerColony`.
- **D2 i D5 bez zmian** — oba szwy nadal ŻYWE (`switchActiveColony` bez terminu własności `:266-283`;
  `_build` nadal nie odwołuje się do `this._grid`).

---

### ⚠ Sprostowanie do audytu §6 (zmierzone po jego napisaniu — zmienia dostępne warianty)

Audyt napisał, że w chwili wyboru aktywnej kolonii „każda kolonia w pliku wygląda na niczyją". **To jest
prawdą dla `ColonyManager.restore`, ale NIE dla ostatniego pisarza wskaźników.** Kolejność w
`GameScene` jest następująca i **kod mówi to wprost**:

```
GameScene.js:2041   this.colonyManager.restore(c4x, this.buildingSystem);     ← własności JESZCZE NIE MA
            :2045   // … Synchroniczne — przed setTimeout swapem.
            :2046   EmpireColonyBootstrap.relinkColoniesAfterRestore(...)     ← STEMPLUJE ownerEmpireId
            :2055   const homePlanetId = c4x.homePlanetId ?? …find(isHomePlanet)…
            :2056   if (homePlanetId) {
            :2057     setTimeout(() => { …przepięcie 5 wskaźników… })         ← własność JUŻ JEST
```

⇒ **Blok odroczony (`:2057-2093`) jest jedynym miejscem w całym łańcuchu wczytania, które może
przeczytać własność poprawnie — i jest zarazem OSTATNIM pisarzem pięciu wskaźników.** To otwiera wariant
P0 **bez zmiany formatu zapisu**, którego audyt nie widział. Reszta audytu §6 stoi.

---

## Podstawa i pewność

**Zmierzone w źródle** (odczyt + kontrprzebieg adwersarialny; zero refutacji w obu turach):
wszystkie bramki i ich brak · pełny łańcuch zapis→wczytanie · historia git · treść keeperów ·
census guardów, predykatów i handlerów.

**Zweryfikowane osobiście przez prowadzącego** (nie sondą — bo przesądzają o wariantach):
1. `removeColony:667-672` — **nieutwardzony bliźniak** AC-8 (P0-D).
2. Kolejność `restore → relink → setTimeout` (Sprostowanie wyżej).
3. `_build` **nie odwołuje się do `this._grid`** w całym ciele (D5).
4. `destroyEmpire:230-238` **nie odpina kolonii** ⇒ sierota własności (P0-B).

**NIE zmierzone (i to jest jawne):** gra nie była uruchamiana. Wszystko, co dotyczy `GameScene.js`
i `ColonyOverlay.js`, jest pinem **źródłowym** albo **live-gate'em** — oba pliki **nie importują się
pod node** (`GameScene` ciągnie ścieżkę spoza `exports` pakietu `three`; `ColonyOverlay` wywraca się na
`THREE.TextureLoader`). ⚠ Reszta modułów gry importuje się **wyłącznie po wcześniejszym załadowaniu
`src/testing/headless/env.js`** — bez tego goły import pada na `localStorage is not defined`, co przy
pobieżnym sprawdzeniu każe błędnie uznać `ColonyManager` i `BuildingSystem` za niepinowalne.

---

## Czym ten slice NIE jest

- **Nie jest naprawą AC-8.** AC-8 nie dotknął żadnej ścieżki wejścia ani rozkazu; jego jedyna zmiana
  na tej trasie usunęła **gorszy, automatyczny** wariant tej samej wady.
- **Nie jest zmianą modelu własności.** `ColonyManager.isPlayerColony` (`:232`) zostaje kanonem;
  ~40 konsumentów `getPlayerColonies` pozostaje nietkniętych.
- **Nie odbiera graczowi podglądu cudzej kolonii.** `_openAsColonyPanel` (`ColonyOverlay.js:835`) jest
  **zaprojektowaną** ścieżką („*dla konkretnej planety (własnej LUB obcej)*") dla desantu, ostrzału
  orbitalnego i grupy badawczej. Celem jest **działanie**, nie **patrzenie**.
- **Nie jest sprzątaniem AI.** Zmierzone: **żaden** system AI/bootstrapu/logistyki nie emituje
  bramkowanego zdarzenia — `ColonyAutoExpander` woła `bSys._build`/`_upgrade` **bezpośrednio**
  (`:507`/`:557`, zero `EventBus.emit` w pliku), `EmpireColonyBootstrap` woła `autoPlaceBuilding`
  (`:505`), `EmpireColonyMaintenance` woła `_reapplyAllRates` wprost (`:60-73`). **Termin własności
  w guardach nie może więc zepsuć AI — ale nie wolno też uznać tych bezpośrednich tras za „zbędne".**

---

## Stan szwów — korekty liczbowe wobec audytu

Audyt mówił „34 miejsca klasy A" i „~10 handlerów klasy C". Druga tura pomiarowa **rozbiła te liczby
na kategorie, które zachowują się różnie** — i to jest materiał do D2/D4:

| | audyt | pomiar | co z tego wynika |
|---|---|---|---|
| **Klasa A** | 34 guardy `!== this` | **9 ŻYWYCH bramek intencji gracza** (`BuildingSystem:100/105/110` · `FactorySystem:182/187/198/244/250` · `CivilizationSystem:236`) · **8 ŻYWYCH bramek systemowych** (`BuildingSystem:121/125/131/138` · `CivilizationSystem:196` · `ResourceSystem:122/132` · `ProsperitySystem:551`) · **17 MARTWYCH** (zdarzenie bez emitenta) | termin własności należy **wyłącznie** do pierwszej dziewiątki; w drugiej ósemce byłby **błędem kategorii** (raportują fakty o związanej koloni); siedemnastu **nie ma po co dotykać** |
| **Klasa A — zasięg realny** | „16× FactorySystem" | **19 z 21** mutacji fabryk gracza **omija szynę** — idą bezpośrednio z `EconomyOverlay` na `col.factorySystem` | bramka na szynie pokrywa fabryki **w dwóch przypadkach na dwadzieścia jeden** |
| **Klasa C** | „~10 handlerów" | **14 osiągalnych etykiet**: **6** z zakładki Załoga (`canWorkforce:1284` — **zero terminu własności**, a każda kolonia AI ma `civSystem`) + **8** z pływającego panelu budowy (`:934` bramkuje tylko `!isPreview`) | dziura jest **producencka** (rysowane hit-zony), nie tylko konsumencka |
| **Klasa C — już zamknięte** | — | **12 etykiet stacji** jest już bramkowanych własnością (`:1443` + `activeTab==='stacja'` `:1345`) | wzór do naśladowania istnieje **w tym samym pliku** |
| **P0** | trzy rzeczy | **cztery** — dochodzi bliźniak `removeColony:667-672` | patrz P0-D |

---

# CZĘŚĆ I — BLOK P0 (do podpisu osobno i pierwszy)

**Dlaczego osobno:** to jedyna część, w której **zwłoka ma koszt**. Każde wczytanie zapisu z przejętą
stolicą odtwarza awarię bez udziału gracza. Dopóki P0 nie wejdzie, **żaden gate na tym zapisie nie mierzy
produktu**, tylko regresję (audyt §6).

---

### P0-A — Kto jest jedynym autorytatywnym pisarzem pięciu wskaźników przy wczytaniu? ✅ **PODPISANA: W1**

> **To jest prawdziwa decyzja tego bloku**, a nie „dopisz bramkę". Dwa zmierzone ograniczenia **wykluczają
> się nawzajem**:
> - **(i)** żadna bramka własności nie może stać w `ColonyManager.restore` — w tym momencie własności
>   **jeszcze nie ma** (stempluje ją relink, osiem linii dalej);
> - **(ii)** pięć wskaźników **musi ruszać się razem** — to jest inwariant, dla którego istnieje
>   `switchActiveColony` (`:266-268`: „*NIGDY stale-inna-kolonia*"), spisany po Fazie 3 BUG 2.
>
> A `ColonyManager.restore:2451-2454` **jest** miejscem wiązania **wewnątrz** restore — i wiąże
> **dwa z pięciu**, ślepo na własność:
> ```
> :2451   if (colData.isHomePlanet) {
> :2452     this._activePlanetId = colData.planetId;
> :2453     window.KOSMOS.factorySystem = factSys;
> :2454     window.KOSMOS.prosperitySystem = prospSys;
> ```
> Nie da się go ubramkować (i) i nie da się go zostawić (ii). **Wyjście jest jedno: ktoś inny musi być
> ostatnim i jedynym pisarzem.**

**Zmierzone:** blok odroczony `GameScene.js:2057-2093` jest **dziś ostatnim pisarzem** wszystkich pięciu
wskaźników (plus `expeditionSystem.resourceSystem`, `techSystem.resourceSystem` i czterech pól sceny),
biegnie **po** relinku, więc **czyta własność poprawnie**. ⚠ Ale cały ten blok stoi pod
`if (homePlanetId)` (`:2056`) — **gdy gracz nie ma domu, nie wykonuje się w ogóle.**

| | **W1 — blok odroczony jedynym pisarzem** | **W2 — nowy jawny krok po relinku** | **W3 — bramka w `switchActiveColony` i nic więcej** |
|---|---|---|---|
| istota | `restore:2452-2454` przestaje wiązać cokolwiek; blok `:2057` dostaje drabinę własności i staje się jedynym wyborem | osobny, synchroniczny „wybierz aktywną kolonię" po `:2046`; blok odroczony przestaje wybierać | jedno `if (!isPlayerColony) return false` w `switchActiveColony` |
| czyta własność poprawnie? | ✅ tak (po relinku) | ✅ tak | ✅ w runtime, ale **nieistotne** |
| zamyka ścieżkę wczytania? | ✅ tak — jedyny pisarz | ✅ o ile blok odroczony też przestanie pisać (inaczej nadpisze) | ⛔ **NIE — ścieżka wczytania w ogóle nie idzie przez `switchActiveColony`** (`restore:2452` i `GameScene:2066-2085` przypisują wprost) |
| przypadek „gracz bez domu" | ⚠ **wymaga wyjęcia wyboru spod `if (homePlanetId)`** — ⚠ **SPROSTOWANIE 2026-08-20:** uzasadnienie „gracz bez kolonii nie ma `homePlanetId` w zapisie" było **FAŁSZYWE**. `SaveSystem.js:180` zapisuje `window.KOSMOS.homePlanet?.id`, a tej referencji **nic nie czyści przy utracie** (trzej pisarze: `GameScene:382/2067/3754`) ⇒ stara bramka **BYŁA** wchodzona. Wyjęcie jest **UTWARDZENIEM** (wybór przestaje zależeć od referencji, której nikt nie utrzymuje), nie naprawą; defekt siedział w uzbrajaniu z `isHomePlanet` i w `if (homeCol)` | ✅ naturalnie poza tym `if` | n/d |
| inwariant „pięć razem" | ✅ z konstrukcji | ✅ z konstrukcji | ⛔ nie dotyczy dwóch pisarzy w restore |
| koszt | 2 miejsca (`ColonyManager`, `GameScene`) | 3 miejsca (dwa jak W1 + nowy krok) | 1 miejsce |
| ⚠ pułapka | `GameScene.js` **nie importuje się pod node** ⇒ dowód = pin źródłowy + live-gate | jw. | **złudzenie zamknięcia** — keeper na `ColonyManager` przechodzi, a wada żyje |

**Rekomendacja formalna: W1**, pod warunkiem jawnego wyjęcia wyboru aktywnej kolonii spod
`if (homePlanetId)` — inaczej wariant nie obsługuje dokładnie tego stanu, dla którego powstał AC-8.
**W3 jest niewystarczające samodzielnie w każdym scenariuszu** i wolno go dołożyć wyłącznie jako
utwardzenie ścieżki ŻYWEJ (co i tak robi D1).

**Drabina zapasowa — treść, nie tylko miejsce** (do rozstrzygnięcia w ramach tego samego podpisu):
(a) dom, jeśli należy do gracza → dowolna kolonia gracza → `_detachActiveColony`;
(b) dowolna kolonia gracza (bez preferencji domu) → `_detachActiveColony`;
(c) natychmiastowe `_detachActiveColony`, gracz wybiera sam.
⚠ Wariant (a) jest **dosłownie tą drabiną, którą AC-8 wpisał do `transferColony:786-795`** — reużycie
kształtu daje spójność między ścieżką zdarzeniową a wczytaniem.
⚠ Jeśli drabina ma wołać `_detachActiveColony` przy wczytaniu, to **dopisuje mu drugiego wołającego**
(dziś ma dokładnie jednego, `:794`) i zamienia akcję zdarzeniową w normalizator stanu; emituje przy tym
`resource:requestSnapshot` i `colony:listChanged` (`:352-353`) w trakcie ładowania. **To jest do jawnego
podpisu**, nie do przemycenia — i **wymaga re-weryfikacji keepera `ai_capture_last_stand` T1**.

---

### P0-B — Własność serializowana czy dalej wyprowadzana? ✅ **PODPISANA: W1** (zostaje wyprowadzana)

> ⚠ **To nie jest naprawa buga — to ODWRÓCENIE zapisanej decyzji projektowej.** Kod mówi wprost, że
> własność jest wyprowadzana:
> ```
> EmpireColonyBootstrap.js:543   - ustawia colony.ownerEmpireId (derived z emp.colonies — bez osobnego pola w save),
> ```
> `AI_CAPTURE_PLAN.md` §Save strategy pkt 3 podnosi to do reguły: „*Każda decyzja, która zmienia
> własność, musi zostawić stan spójny z punktu widzenia relinku, nie tylko runtime'u.*"

**Zmierzone — model „wyprowadzany" DZIAŁA dla wszystkich ścieżek produkcyjnych:** każdy, kto stempluje
`ownerEmpireId`, woła też `addColony` — `transferColony` (`:830-831`), `EmpireColonyBootstrap` (`:158`,
`:370`), `SpawnTestEnemy` (`:99`), `CombatSandbox` (`:384`). Relink odtwarza własność z
`empires[].colonies`, które **są** w zapisie.

⚠ **Ale ma jedną zmierzoną dziurę — i to ja ją znalazłem, nie sonda:**
`EmpireRegistry.destroyEmpire` (`:230-238`) usuwa imperium z `gameState.empires` i **nie odpina jego
kolonii**. Kolonia ostemplowana na skasowane imperium po wczytaniu **nie dostaje stempla od relinku**
(nie ma po czym iterować) ⇒ `ownerEmpireId === undefined` ⇒ **kanon czyta ją jako kolonię GRACZA.**
Dziś osiągalne przez ścieżki debug/sandbox (`SpawnTestEnemy:77`, `CombatSandbox:370`); ścieżka
`removeColony`→`destroyEmpire` (`EmpireRegistry:158`) jest bezpieczna, bo kolonia jest już odpięta,
a W3-1 chroni pokonane imperium w stanie wojny (`:153-157`).

| | **W1 — zostaje wyprowadzana** | **W2 — serializowana, relink jako uzgadniacz** | **W3 — serializowana + relink asertuje zgodność** |
|---|---|---|---|
| istota | nic nie zmieniamy w formacie; P0-A czyta własność po relinku | `ownerEmpireId` w `serialize`/`restore` z `?? null` | jw. + relink krzyczy przy rozjeździe |
| zgodność z zapisaną decyzją | ✅ utrzymuje | ⛔ **odwraca ją jawnie** (wymaga wpisu w `CLAUDE.md`) | ⛔ jw. |
| dwa źródła prawdy | ✅ nie | ⚠ **tak** — repo ma na tym bliznę (S3.3b: `assignedRouteId` jako martwy dual-source) | ⚠ tak, ale z detektorem |
| naprawia sierotę po `destroyEmpire` | ⛔ **nie** | ✅ tak | ✅ tak + wykrywa |
| bump zapisu | ✅ brak | ⚠ do rozstrzygnięcia (P0-D) — pole addytywne z `?? null` precedensowo bumpu nie wymaga (`GALAXY_SEED`) | ⚠ jw. |
| odblokowuje bramkę wewnątrz `restore` | ⛔ nie (i **nie musi** — P0-A=W1 tego nie potrzebuje) | ✅ tak | ✅ tak |

**Rekomendacja formalna: W1** — pod warunkiem, że P0-A wchodzi w wariancie W1 lub W2 (wtedy własność
jest czytana po relinku i serializacja nie jest do niczego potrzebna), **plus osobne rozstrzygnięcie
sieroty `destroyEmpire`**: albo `destroyEmpire` odpina kolonie, albo sierota jest **jawnie** filowana
jako znany limit ścieżek debugowych. ⚠ **Wybór W2/W3 jest legalny, ale wtedy trzeba przepisać
`EmpireColonyBootstrap.js:543` i `AI_CAPTURE_PLAN.md` §Save strategy pkt 3** — inaczej repo mówi dwie
rzeczy naraz.

---

### P0-C — `isHomePlanet` przy przejęciu i przy odbiciu ✅ **PODPISANA: W2 (+„dom wraca przy odbiciu"=W2)**

> ✅ **POTWIERDZENIE (2026-08-20, właściciel) — NIE jest to nowy finding.**
> Skutek uboczny „**ex-stolica przestaje być niezniszczalna po utracie**" (wiersz *skutek uboczny:
> `removeColony:646`* w tabeli niżej) wybrzmiał ponownie przy audycie trasy warp i został **wprost
> potwierdzony jako świadoma, podpisana decyzja, nie regresja**.
> Mechanizm: `removeColony` wraca wcześnie na `if (colony.isHomePlanet) return;` (`:711`); P0-C zdejmuje
> tę flagę przy przejęciu, więc ochrona **przestaje obowiązywać dokładnie w chwili, gdy ciało przestaje
> być nasze**. Pinowane wykonaniem przez `colony_ownership_load_smoke` **T9b** (ex-dom usuwalny)
> z kontrolą **T9b KONTROLA PINU** (żywa stolica gracza **nadal** chroniona).
> ⚠ Nie zakładać dla tego osobnej pozycji rejestru — to jest ta sama, już rozstrzygnięta decyzja.

**Zmierzone:** `transferColony` **tylko czyta** flagę (`:799`), nigdy nie zapisuje. Czytelników
decyzyjnych jest **cztery**: `removeColony:646` (dom jest niezniszczalny), `restore:2451` (uzbraja
`_activePlanetId`), `restore:2459` (heal-up), `InvasionSystem:252/313` (preferencja celu AI).

⚠ **Sama flaga NIE zamyka ścieżki wczytania — i to jest najbardziej prawdopodobny błąd implementacji.**
`GameScene.js:2055` czyta `c4x.homePlanetId ?? …find(isHomePlanet)…`, a `c4x.homePlanetId` pochodzi
z `window.KOSMOS.homePlanet` (`SaveSystem.js:180`), którego **nikt nie przecelowuje przy utracie**
(trzej pisarze: `GameScene:382`, `:2061`, `:3753`). Operator `??` sprawia, że **ramię z flagą nie jest
w ogóle konsultowane**, dopóki pierwsze jest niepuste. **Kto wyczyści flagę i uzna P0 za zamknięte —
naprawi połowę, której keeper i tak nie widzi** (`GameScene` nie importuje się pod node).

| | **W1 — nie ruszamy flagi** | **W2 — czyścimy przy przejęciu** | **W3 — czyścimy + wspólny helper zmiany właściciela** |
|---|---|---|---|
| istota | P0-A załatwia wybór; flaga zostaje historycznym faktem | `transferColony` czyści **po** snapshot'cie `:799` | jeden `_applyOwnershipChange` wołany przez `transferColony` **i** `captureColonyForPlayer` |
| ⚠ obowiązkowe niezależnie | — | **czyścić PO `:799`**, inaczej „Stolica utracona" cicho degraduje do „Kolonia utracona" (`GameScene:2305`, `NotificationCenter:364/368`) | jw. |
| usuwa ślepe wiązanie w `restore` | ⛔ nie | ✅ tak — `:2451-2454` przestaje trafiać (**korzyść, której audyt nie doliczył**) | ✅ tak |
| skutek uboczny: `removeColony:646` | — | ⚠ **ex-dom staje się zniszczalny** ⇒ `dispose ×5` + `colony:destroyed` **współodpalają** z `game:over` (które i tak leci, bo klucz to `homePlanet.id`, `GameScene:3313`) | jw. |
| skutek uboczny: heal-up `:2459` | — | ⚠ wyludniony ex-dom dostaje `setPopulation(8)`, zrujnowany — darmową stolicę, **dla właściciela-AI** ⚠ ale gałąź jest **już dziś** ślepa na własność dla KAŻDEJ kolonii AI ⇒ „odłóż to" jest obroną, którą trzeba **zapisać** | jw. |
| symetria z odbiciem | ⛔ brak pytania | ⚠ `captureColonyForPlayer` (`:871-930`) **nie dotyka flagi** ⇒ odbita stolica zostaje trwale zdegradowana | ✅ symetria z konstrukcji |
| koszt | 0 | 1 linia + 2 zapisane skutki | 1 helper + dotknięcie ścieżki odbicia w tym samym commicie |

**Rekomendacja formalna: W2**, z jawnym zapisaniem obu skutków ubocznych, **plus osobne rozstrzygnięcie
„czy dom wraca przy odbiciu"** (W1: nigdy — stolica to fakt historyczny · W2: wraca, gdy
`planetId === window.KOSMOS.homePlanet?.id` · W3: `ColonyManager` pamięta `_originalHomePlanetId`).
⚠ **Test „czy moja" musi iść przez `ColonyManager.isPlayerColony`, nie przez `=== 'player'`** —
`captureColonyForPlayer:893` zapisuje `null`, więc porównanie z literałem jest na tej ścieżce **fałszywe**.

---

### P0-D — Bliźniak w `removeColony` ✅ **PODPISANA: W1** (w P0; nowy — nie było go w audycie)

> **Zmierzone, ŻYWE dziś, ta sama klasa co cały P0.** AC-8 utwardził **wyłącznie** `transferColony`.
> Bliźniaczy fallback w `removeColony` został:
> ```
> ColonyManager.js:667   if (this._activePlanetId === planetId) {
>              :668       const homePlanetId = window.KOSMOS?.homePlanet?.id;
>              :669       if (homePlanetId && this._colonies.has(homePlanetId)) {
>              :670         this.switchActiveColony(homePlanetId);
> ```
> **Test przynależności, nie własności.** Po przejęciu stolicy `homePlanet.id` **wciąż ją nazywa**,
> a W3-1 **zostawia ją w `_colonies`** ⇒ zniszczenie **dowolnej innej** aktywnej kolonii gracza
> przepina wszystkie pięć wskaźników na kolonię **wroga**. Wejścia są fizyczne i nieodfiltrowane:
> `body:collision` (`:176`), `planet:ejected` (`:181`), `entity:removed` (`:189`) — a kolizje
> w scenariuszu „Cywilizacja" **biegną** (sprostowanie z `CLAUDE.md`, Finding 62).

⚠ **Interakcja z P0-C=W2 (i to jest realna mina):** wewnątrz `removeColony` przełączenie (`:667-672`)
biegnie **przed** `dispose ×5` (`:684-688`) i przed `_colonies.delete` (`:690`). Jeśli ex-dom kiedykolwiek
znów będzie aktywny (co produkuje wariant „dom wraca przy odbiciu"), jego zniszczenie zostawia
`window.KOSMOS` na **pięciu zdisposowanych podsystemach** z `_activePlanetId` na skasowanym kluczu —
stan, przed którym istnieje `_detachActiveColony`, a którego `removeColony` **nigdy nie woła**.

| | **W1 — w P0, lustro AC-8** | **W2 — osobny commit po P0** | **W3 — poza planem (finding)** |
|---|---|---|---|
| istota | `removeColony` dostaje tę samą drabinę własności co `transferColony:786-795` + `_detachActiveColony` w gałęzi terminalnej | to samo, ale po zamknięciu P0 | tylko wpis do rejestru |
| za | zamyka **wszystkie** znane pisarze `_activePlanetId` jednocześnie; spójność z AC-8 jest oczywista dla czytelnika | mniejszy commit P0 | zero kosztu teraz |
| przeciw | rozszerza P0 o piąty plik? **nie** — to ten sam plik (`ColonyManager.js`) | ⚠ zostawia ŻYWĄ ścieżkę odtworzenia awarii między commitami | ⛔ **zostawia P0 nieszczelne** — gracz odtworzy stan jedną kolizją |
| ⚠ dodatkowo | naturalne miejsce na `_detachActiveColony` przed `dispose ×5` | jw., ale później | — |

**Rekomendacja formalna: W1.** To jedna linia tej samej klasy, w tym samym pliku, co utwardzenie AC-8;
zostawienie jej poza P0 czyni P0 **nieszczelnym z definicji**.

⚠ **Przy okazji, do tego samego podpisu:** `set activePlanetId(id)` (`:256-258`) zapisuje `_activePlanetId`
**bez żadnego sprawdzenia** — dziś **zero** wołających produkcyjnych, ale wariant sformułowany jako
„bramka wewnątrz `switchActiveColony`" **z konstrukcji** zostawia te drzwi otwarte.

---

### P0 — stare zapisy, kolejność, i co MUSI zostać zapisane

**Stare zapisy.** Gracz ma na dysku plik z tą awarią. Do rozstrzygnięcia razem z blokiem:
(a) **bez migracji** — P0-A wybiera ownership-aware przy wczytaniu, więc stary plik **naprawia się sam**
(to najsilniejszy argument za P0-A=W1); (b) **migracja** czyszcząca `isHomePlanet` każdej koloni,
której `planetId` występuje w `empires[].colonies` (własność jest odzyskiwalna z rejestru, mimo że
`ColonyManager` jej nie serializuje) ⇒ **bump v101→v102**.

⚠ **Ograniczenie na przyszłość, do wpisania niezależnie od wariantu:** gdy `isHomePlanet` staje się
polem **kasowalnym**, **żadna przyszła migracja nie może się już na nim kluczować**. Dziś dwie to robią
i przyznają realne korzyści: `SaveMigration:536-537` (`inv.semiconductors = 2`) oraz `:666-667`
(`col.requiresSpaceportFirst = false`).

---

# CZĘŚĆ II — BRAMKA WŁASNOŚCI (klasy A/B/C + predykat)

### D1 — Czy zabronione jest WIĄZANIE cudzej kolonii, czy tylko DZIAŁANIE na niej? ✅ **PODPISANA: W2 + W1**

To decyzja nadrzędna: przesądza kształt D2, D3 i D4.

**Zmierzone, co się dzieje przy samym związaniu (bez żadnego kliknięcia):** `ProsperitySystem:150`
rejestruje konsumpcję w związanej koloni, a `CivilizationSystem._updateUnrest:1102` czyta prosperity
**przez locator** i nie trzyma referencji per-kolonia ⇒ **niepokój każdej koloni liczy się z tego, co
akurat związane**. Wiązanie **nie jest** więc pasywne.

| | **W1 — wiązanie wolno, działanie nie** | **W2 — wiązanie cudzej koloni zabronione** | **W3 — wiązanie wolno, ale nowa granica mutacji** |
|---|---|---|---|
| istota | `switchActiveColony` przepuszcza; bramki siedzą na akcjach (D2/D4) | odmowa w `switchActiveColony` + drabina | osobna warstwa „czy wolno mutować tę kolonię" nad wszystkimi mutatorami |
| podgląd desantu/ostrzału | ✅ nietknięty | ⚠ nietknięty **tylko dlatego**, że idzie przez `show({colonyId})`, a nie przez `switchActiveColony` — ale to trzeba **udowodnić keeperem**, nie założyć | ✅ nietknięty |
| ambientne mutacje (prosperity/unrest) | ⛔ **zostają** | ✅ znikają | ⛔ zostają |
| liczba miejsc | 9 + 14 | 1 (+ audyt ~20 wołających) | nowa warstwa = największy diff |
| ⚠ pułapka | ambient jest **niewidoczny** i nikt go nie zgłosi | `switchActiveColony` wołają też `GameCore:310`, `CombatSandbox:228` oraz **własne fallbacki ColonyManagera** (`:671`, `:793`) ⇒ potrzebna furtka albo ślepy bliźniak metody | wymyśla pojęcie, którego repo nie ma |

**Rekomendacja formalna: W2 jako inwariant + W1 jako UX** — odmowa w `switchActiveColony` jest
**jedynym** wariantem gaszącym mutacje ambientne, a podgląd i tak żyje własną ścieżką (`show`).
⚠ Furtka dla `GameCore`/`CombatSandbox`/fallbacków musi być **jawna i nazwana**, nie „przypadkiem
przechodzi".

✅ **PODPISANA 2026-08-22: W2 (inwariant) + W1 (UX).** **WDROŻONA w OG-3** — keeper
`colony_ownership_guard_smoke` 30/30, sweep 162/162.

⚠ **SPROSTOWANIE #2 (OG-3) — FURTEK JEST ZERO, NIE DWIE. Zmierzone, nie założone.** Oba miejsca,
dla których plan przewidywał jawną furtkę, **wiążą planetę MACIERZYSTĄ GRACZA** i przechodzą samym
terminem własności:
- `GameCore.js:310` — komentarz na call-site mówi to wprost: *„Aktywna kolonia = home planet"*;
- `CombatSandbox.js:228` — *„14) Aktywuj kolonię gracza w UI"*, a `civPlanet` jest w sygnaturze
  udokumentowana jako *„planeta macierzysta gracza"* (`:142`). Kolonia wroga tego scenariusza
  (`:392-393`) **nigdy** nie jest wiązana.

⇒ `switchActiveColony` **nie dostał żadnego parametru obejścia**. Dowód empiryczny: pełny sweep
**162/162 0 FAIL** — a każdy keeper w repo startuje przez `GameCore.boot()`. Dowód źródłowy:
keeper G4 (`stripComments` + brak tokenów `allowForeign|bypass|unchecked|force`, z kontrolą pinu na
obecność `isPlayerColony`).
⚠ **I tak jest LEPIEJ, niż planowano:** każda niepotrzebna furtka to mina dla następnego — dokładnie
ta klasa, która dała `removeColony:667` (nieutwardzony bliźniak, żywy przez cały arc).

⚠ **Odmowa jest CICHA.** Komunikat dla gracza należy do **D4/OG-4** (prawdomówność UI), nie do D1.

⚠ **SPROSTOWANIE 2026-08-22 — furtki są DWIE, nie cztery.** Wiersz „⚠ pułapka" w tabeli wyżej wymienia
także **własne fallbacki ColonyManagera** (`:671`, `:793` wg audytu). Po P0 to nieaktualne: oba miejsca
(dziś `:744` i `:864`) wołają `switchActiveColony(next)`, gdzie `next` pochodzi z
`_pickFallbackActiveColony` (`:349-354`), **który sam filtruje `ColonyManager.isPlayerColony`** ⇒
z definicji nie poda koloni AI. **Jawnych, nazwanych furtek wymagają wyłącznie `GameCore:310`
i `CombatSandbox:228`.**
⚠ **Pozostali wołający furtki NIE dostają — i to jest cała treść D1:** `GameScene` (11 miejsc),
`BottomContext:424`, `CivilizationOverlay:730`, `ColonyOverlay:1248`, `EventLogOverlay:368` to
**ścieżki intencji gracza**; wiązanie własnej koloni przechodzi samym terminem własności, wiązanie
cudzej ma zostać **odmówione**.
⚠ Scenariuszowe `GameScene:3444/3476/3501` wiążą **własną** planetę cywilizacji ⇒ przechodzą bez
furtki. **Do PINU w keeperze OG-3, nie do założenia** — to jest dokładnie ta klasa, w której „przecież
przechodzi" bywało nieprawdą.

---

### D2 — Klasa A: gdzie mieszka termin własności? ✅ **PODPISANA: W3 + W1 (obrona w głąb)**

⚠ **Twarde ograniczenie, złamanie którego zapala ~20 keeperów:** termin musi **zawodzić OTWARCIE**, gdy
właściciela nie da się rozwiązać z instancji. Około dwudziestu keeperów przypisuje **goły** system do
`window.KOSMOS`, bez koloni i bez `ownerEmpireId` (`pop3_economy:217`, `pop2_5c1:62`, `pop2_5c2:51`,
`pop4_droids:111`, `energy_brownout_gate:188/191/194`, `factory_production_toggle:47`,
`crewlock_unemployed_invariant:48`, …).

⚠ **Drugie ograniczenie:** payload nie identyfikuje ani koloni, ani aktora. `planet:buildRequest` to
`{ tile, buildingId }`, `planet:upgradeRequest`/`demolishRequest` to `{ tile }`, a **w całym `src/` nie
ma zdarzenia z polem `issuer`/`actor`/`requestedBy`**. Bramka payloadowa = **wymyślenie pola** = decyzja,
nie implementacja.

| | **W1 — dziewięć żywych bramek intencji** | **W2 — chokepoint u emitenta (`ColonyOverlay`)** | **W3 — tylko `switchActiveColony` (D1=W2) i nic w guardach** |
|---|---|---|---|
| pokrycie szyny | ✅ 9/9 | ✅ te same zdarzenia, jedno miejsce | ✅ pośrednio (nie ma jak związać) |
| pokrycie wywołań bezpośrednich | ⛔ 0 (patrz D4/„poza zakresem") | ⛔ 0 | ⛔ 0 |
| ryzyko kategorii | ✅ żadne, jeśli **nie tknąć** ósemki systemowej i siedemnastki martwej | ✅ żadne | ✅ żadne |
| martwe guardy | zostają | zostają | zostają |
| ⚠ | rozwiązanie właściciela z instancji: `BuildingSystem` ma `this._planetId`, ale `ResourceSystem`/`FactorySystem`/`ProsperitySystem` **wymagają weryfikacji** | jeden plik, ale `ColonyOverlay` nie importuje się pod node ⇒ pin źródłowy | najtańsze, ale **całkowicie** zależne od D1=W2 |

**Rekomendacja formalna: W3 + W1 jako obrona w głąb** — jeśli D1=W2, dziewiątka jest ubezpieczeniem
przed przyszłym wołającym, nie pierwszą linią.
**Wyraźnie POZA D2** (do zapisania, żeby nikt nie „poprawił przy okazji"): ósemka bramek systemowych ·
siedemnastka martwych ⇒ ewentualny osobny `chore` prune, precedens C8 `7201670`.

⚠ **Do rozstrzygnięcia przy tej samej decyzji:** czy ten slice naprawia, czy **file'uje** przeciek
`civ:unrest` między koloniami — `CivilizationSystem:1121` **wysyła** `planetId`, a `BuildingSystem:121`
go **ignoruje**, więc niepokój koloni AI nakłada −30% produkcji na związaną kolonię gracza. Milczenie
czyta się jako aprobatę.

✅ **PODPISANA 2026-08-22: W3 (tylko `switchActiveColony`) + W1 (dziewiątka bramek) jako obrona
w głąb.** **NIE dotykamy** ósemki bramek systemowych ani siedemnastki martwych.
**WDROŻONA w OG-3** — termin w `src/utils/ColonyOwnership.js` (`systemBelongsToPlayer`), wpięty
w 3 bramki `BuildingSystem` + 5 `FactorySystem` + 1 `CivilizationSystem`.

⚠ **SPROSTOWANIE (OG-3) — „dziewiątka żywych" ma dziś TYLKO SZEŚĆ producentów produkcyjnych.**
Zmierzone po emitentach, nie po numerach linii z audytu (te zdążyły się przesunąć):

| bramka | producenci PRODUKCYJNI | producenci TESTOWI |
|---|---|---|
| `planet:buildRequest` · `demolishRequest` · `upgradeRequest` | 4 · 3 · 1 | — |
| `factory:setExportEnabled` · `setExportTier` | 1 · 1 (`EconomyOverlay:2649/2652`) | — |
| `civ:resolveMovement` | 1 | — |
| `factory:enqueue` · `dequeue` · `setMode` | **0** | 1 · 1 · 2 (`ActionAdapter`, boty) |

**Zabramkowano wszystkie dziewięć** — zgodnie z podpisem — ale trzy ostatnie są dziś osiągalne
**wyłącznie z harnessu**. To NIE zmienia decyzji; zmienia opis rzeczywistości i chroni przed
wnioskiem „skoro nikt tego nie emituje, można usunąć". ⚠ Powód, dla którego szyna fabryk jest
niemal martwa, jest już w audycie: **19 z 21 mutacji fabryk gracza idzie bezpośrednio
z `EconomyOverlay` na `col.factorySystem`**, z pominięciem szyny.

⚠ **PUŁAPKA, KTÓRA KOSZTOWAŁABY CICHĄ DZIURĘ:** termin własności **NIE MOŻE** korzystać
z `FactorySystem._getOwnerColony()` (`:1411`). Ta metoda ma fast-path
`if (window.KOSMOS.factorySystem === this) return colony(activePlanetId)` — odpowiada więc na
pytanie *„która kolonia jest AKTYWNA"*, a nie *„która mnie POSIADA"*. Wewnątrz bramki intencji te
dwa pytania rozjeżdżają się dokładnie w scenariuszu, który bramka ma łapać. Dlatego
`findOwningColony(system, key)` szuka po **tożsamości referencji**.

⚠ **Kanon powstał TU, nie w OG-5.** `src/utils/ColonyOwnership.js` (zero importów ⇒ zero cykli;
`ColonyManager` konstruuje `BuildingSystem`, więc import w drugą stronę byłby cyklem).
`ColonyManager.isPlayerColony` **deleguje** — dwóch definicji nie ma ani przez chwilę. **OG-5
kontynuuje stąd**: wejście po `id`, rodzina nazw, migracja sześciu nazwanych kopii.

✅ **Przeciek `civ:unrest` — ROZSTRZYGNIĘTY PRZY PODPISIE: FILE, nie naprawa.** I to wynika z samego
podpisu, nie z osobnej decyzji: `BuildingSystem:121` należy do **ósemki bramek systemowych**, których
D2=W1 jawnie zabrania tykać. **Finding 86 zostaje otwartą pozycją rejestru.**
⚠ **I trzeba być uczciwym co do zasięgu: D1=W2 tego NIE zasłania.** Emitentem jest `civSystem`
**koloni AI** — tyka własnym rytmem, niezależnie od tego, co gracz ogląda — a odbiorcą `buildingSystem`
**akurat związany**, czyli normalnie gracza. Przeciek jest więc żywy **niezależnie od wiązania**
i przeżyje całą część II. Nie wolno go przy okazji uznać za „załatwiony przez D1".

---

### D3 — Klasa B: `MissionSystem.resourceSystem` i `TechSystem.resourceSystem` ✅ **PODPISANA: W1**

🔴 **Ostrzeżenie z pomiaru — to jest dokładnie pułapka, w którą AC-8 już raz wpadł.**
Wyzerowanie `MissionSystem.resourceSystem` **NIE jest bezpieczną wersją bramki**: pięć miejsc wydatku
jest „miękkich" (`:744-745`, `:828-832`, `:1233-1238`, `:1374-1379`, `:1685-1686`) i przy `null`
**przepuszcza za darmo** zamiast odmówić — czyli deploy placówki, transport cargo i oba rekonesanse
stają się **DARMOWE**, podczas gdy ekspedycja i kolonizacja (utwardzone w AC-8, `:548`, `:648`) odmawiają.

⚠ Symetrycznie po stronie techu: `TechSystem.js:473` ma `if (resSys)`, więc `null` **POMIJA** wymóg
inwentarza zamiast go oblać — na tej osi zerowanie jest **słabsze** niż przecelowanie.

| | **W1 — nie przecelowujemy na obcą** | **W2 — zerujemy** | **W3 — `MissionSystem` rozwiązuje płatnika per-wywołanie** |
|---|---|---|---|
| istota | wskaźnik zostaje na **ostatniej koloni gracza** | `null` + semantyka odmowy AC-8 | płatnik z koloni macierzystej statku; globalny wskaźnik przestaje być powierzchnią |
| bezpieczne bez dalszej pracy? | ✅ tak | ⛔ **NIE** — wymaga utwardzenia 5 miejsc **przed** | ⚠ refaktor 8 miejsc |
| efekt uboczny | portfel cicho nie zgadza się z widoczną kolonią | misje niemożliwe, dopóki związana jest obca | zmienia „kto płaci" **także** w legalnej grze wielokolonijnej |
| tech | analogicznie | ⚠ **słabsze** niż W1 | — |

**Rekomendacja formalna: W1** — najtańszy wariant, który nie tworzy exploita.

✅ **PODPISANA 2026-08-22: W1** — wskaźnik zostaje na ostatniej koloni gracza; **`TechSystem` POZA
slice'em, zapisany jako uśpiony.** **PINOWANA w OG-3 bez własnego commitu** (keeper G5: po odmowie
`MissionSystem.resourceSystem` i `TechSystem.resourceSystem` nadal wskazują magazyn koloni GRACZA,
nie AI i nie `null`).

⚠ **SPROSTOWANIE 2026-08-22 — miękkich spendów jest CZTERY, nie pięć.** `_launchFoundOutpost`
(`:744-745` wg audytu) zostało utwardzone przez **D-111** (Finding 111, `a180619`) i dziś czyta
`if (!this.resourceSystem || !canAfford) return odmowa` (`MissionSystem.js:754`). Zostają: **transport
cargo** (`:840`/`:844`), **rekonesans** (`:1245`) i **drugi rekonesans** (`:1386`). Piąty adres
(`:1697`) to `receive(gained)` — **nagroda, nie wydatek**: przy `null` znika przychód, nie powstaje
darmowy start. **Werdykt bez zmian: W2 nadal tworzyłoby exploit na trzech ścieżkach.**
⚠ **D3 nie dostaje własnego commitu.** Przy D1=W2 wskaźnik nie ma jak trafić na obcą kolonię, więc W1
jest **skutkiem OG-3** — do zapisania w rejestrze i **do pinu w keeperze OG-3**, nie do implementacji.
⚠ **`TechSystem` można zostawić poza slice'em** i zapisać jako uśpiony: jedyni czytelnicy siedzą
w `_research()`, którego zdarzenie **nie ma emitenta produkcyjnego**, a żywa ścieżka badań
(`ResearchSystem:70`) już puluje `getPlayerColonies()`. **Ale** każda instancja `TechSystem` subskrybuje
bez guardu tożsamości (`:31`) ⇒ ożywienie zdarzenia **pomnoży wadę przez liczbę imperiów**.

---

### D4 — Klasa C: chokepoint w `ColonyOverlay` + czy bramka ODMAWIA, czy CHOWA ✅ **PODPISANA: W3 + flash**

⚠ **Ograniczenie projektowe, którego nie wolno złamać:** bramka **nie może** stać na górze
`handleClick`, w `_getColony()` ani w `_screenToTile` — wszystkie trzy są wspólne dla
**zaprojektowanych** trybów obcych (lądowanie `:4580`, ostrzał `:4600`, zrzut `:4628` czytają obcą
kolonię przez `_getColony()` na `:4575` i wchodzą **dopiero po** `_onHit`). **Góra `_onHit` to jedyne
miejsce, które kosztuje zero zaprojektowanych przepływów.**
⚠ Bramka na `_onHit` **musi** zwolnić `close` (`:4780`) — inaczej gracz, który zrzucił desant, nie zamknie
panelu — oraz **12 etykiet jednostkowo-armijnych** (`unitSurvey:5041` … `armySplit:5160`), które są
warstwą dowodzenia desantem i są już zakresowane po `unit.owner`, nie po koloni.

| | **W1 — góra `_onHit` + allowlist** | **W2 — u producenta (dwie bramki rysowania)** | **W3 — oba** |
|---|---|---|---|
| pokrywa 14 etykiet | ✅ w jednym miejscu | ✅ te same 14 (`canWorkforce:1284` + panel budowy `:934`) | ✅ |
| psuje zaprojektowane tryby | ✅ nie (przy allowliście) | ✅ nie | ✅ nie |
| UI przestaje kłamać | ⛔ nie — dalej rysuje cudze suwaki i ceny (`_canAfford:4451`) | ✅ **tak, gratis** | ✅ |
| zgodność z tym, co już jest w pliku | — | ✅ **dokładnie wzór zakładki Stacja `:1443` i modalu poboru `:1054`** | ✅ |
| trwałość | ✅ inwariant przeżyje zapominalskiego producenta | ⚠ **nie** — `draft_open:1949` jest żywym dowodem tej klasy porażki | ✅ |
| koszt | allowlist = druga lista do utrzymania obok `switch` | 2 linie | 2 linie + inwariant |

**Rekomendacja formalna: W3** — producent dla prawdomówności UI, `_onHit` jako inwariant.

**Osobne pytanie tego samego podpisu — CO GRACZ CZUJE.** Repo ma precedens na wszystkie trzy:
**schowaj całkiem** (zakładka Stacja `:1444`) · **pokaż zablokowane + flash** (`draft_open` bez koszar,
`:4913-4914`) · **cicho zignoruj** (łańcuchy `?.`).
⚠ To przesądza, czy **zakładka Załoga na koloni wroga staje się czytelnym wywiadem** (co w trakcie
inwazji jest raczej pożądane) **czy znika**. To decyzja projektowa, nie mechaniczna.
⚠ Jeśli pada wybór „flash z powodem", to **tekst musi iść przez i18n** — `_showFlash(e.reason)` renderuje
**surowo**, a jego sąsiedzi są zahardkodowani po polsku (ta sama klasa defektu, którą W3-7/S26 z tego
pliku usuwały). Przed dodaniem nowego klucza trzeba uzasadnić, czemu nie wystarczy istniejący
`transportOrder.reason_not_player_colony` (PL+EN, już emitowany jako token `not_player_colony`).

✅ **PODPISANA 2026-08-22: W3** (dwie bramki producenckie **+** inwariant na górze `_onHit`
z allowlistą) **oraz „POKAŻ ZABLOKOWANE + FLASH Z POWODEM"**, nie „schowaj całkiem".
**Powód projektowy:** zakładka Załoga na koloni wroga w trakcie inwazji jest **czytelnym wywiadem** —
schowanie odbierałoby graczowi informację, której nie da się zdobyć inaczej.
⚠ **Konsekwencja obowiązkowa (nie opcja):** tekst **musi** iść przez i18n, a przed dodaniem nowego
klucza obowiązuje uzasadnienie wobec `transportOrder.reason_not_player_colony`.
⚠ **Allowlist MUSI zwolnić** `close:4780` **i 12 etykiet jednostkowo-armijnych** (`unitSurvey:5041` …
`armySplit:5160`) — inaczej gracz, który zrzucił desant, nie zamknie panelu i straci warstwę
dowodzenia desantem.

---

### D5 — Przynależność kafla w `_build`/`_demolish` ✅ **PODPISANA: W1** · ⚠ **KOLEJNOŚĆ**

**Zmierzone:** `_build(tile, buildingId)` (`:796-1015`) **nie odwołuje się do `this._grid` ani razu**
(dwa trafienia w tym zakresie to `this._gridHeight`, nie przynależność). Klimat rozwiązuje z
`_resolveOwnPlanet` (`:1866`) — planety **AKTYWNEJ** koloni. ⇒ system przyjmuje **dowolny** obiekt kafla.

🔴 **Dlatego to jest decyzja o KOLEJNOŚCI, nie tylko o treści.** Dziś rozkaz budowy trafia do
`BuildingSystem` **wroga** (bramka tożsamości) — źle, ale spójnie: cudzy kafel, cudzy portfel, cudzy
klimat. **Napraw samo wiązanie, a ten sam rozkaz trafi do `BuildingSystem` GRACZA** — i wtedy jest:
**cudzy kafel, MÓJ portfel, MÓJ klimat.** To jest **gorsze niż dziś**.
⚠ Ta sama luka dotyczy klawisza **Delete** (`ColonyOverlay.js:5591` → `planet:demolishRequest`), który
**nie potrzebuje żadnej hit-zony** — więc bramka wyłącznie producencka (D4=W2) go **nie zasłania**.

| | **W1 — `_build`/`_demolish`/`_upgrade` walidują przynależność kafla** | **W2 — polegamy na D4** | **W3 — poza planem** |
|---|---|---|---|
| zamyka okno „mój portfel, cudzy kafel" | ✅ u źródła, niezależnie od UI | ⚠ tylko dla ścieżek z hit-zoną — **Delete zostaje** | ⛔ nie |
| może wejść PRZED P0 | ✅ **tak — i o to chodzi** | ⚠ tylko część | — |
| koszt | 1 warunek w 3 metodach jednego systemu | 0 | 0 |
| ⚠ | wymaga, by `BuildingSystem` znał swoją siatkę w każdej ścieżce (`_grid` bywa ustawiane z zewnątrz — `ColonyOverlay`, `EmpireColonyBootstrap:505`, `SpawnTestEnemy:116`) ⇒ **musi zawodzić OTWARCIE przy `_grid == null`** | — | — |

**Rekomendacja formalna: W1.** ⚠ **SPROSTOWANIE 2026-08-20** — pierwotnie stało tu „jako PIERWSZY
commit kodu w całym planie, przed P0". Pomiar po podpisie pokazał, że ta zależność wiąże **D1**, nie P0
(§RESUME, zależność 1): P0 naprawia ścieżkę wczytania i nie tworzy stanu „mój portfel, cudzy kafel",
a ten stan **jest żywy już dziś** przez zaprojektowany podgląd obcej planety. D5 zostaje pilne — ale
jako naprawa istniejącej dziury, a nie warunek wstępny P0. **P0 wszedł przed D5 i było to bezpieczne.**

✅ **PODPISANA 2026-08-22: W1** — `_build`/`_upgrade`/`_demolish` walidują przynależność kafla,
**PRZED albo RAZEM z D1**, i **muszą zawodzić OTWARCIE przy `_grid == null`**. To **OG-1**, pierwszy
commit kodu w części II. **WDROŻONE `f63ef74`** (keeper `colony_tile_membership_smoke` 31/31).

---

#### ✅ OG-1b — KONTROLA kafla obok PRZYNALEŻNOŚCI (rozszerzenie D5, podpisane 2026-08-22)

**Skąd się wzięło:** live-gate OG-1 punkt (c). Gracz nacisnął **Delete** na budynkach koloni, na
której trwał desant — `entity_3` spadło z 15 do 13 budynków **zanim** kolonia formalnie przeszła
w ręce wroga.

⚠ **To NIE była regresja `f63ef74` — i to zostało wykluczone WYKONANIEM, nie lekturą.** Sonda
przeszła dokładną trasę klawisza (`ColonyOverlay:5595` → `planet:demolishRequest` → handler
`BuildingSystem:104-107` → `_demolish`):

| | kafel okupowany, kolonia wciąż moja | kontrola: kafel z INNEJ siatki |
|---|---|---|
| `isPlayerColony(kolonia)` | **true** (`ownerEmpireId = null`) | — |
| `grid.get(q,r) === tile` | **true** | false |
| `_isOwnTile(tile)` | **true → przepuszcza** | **false → odmawia** |
| `_active` | 5 → **4** (budynek zniszczony) | 1 → 1 (nietknięte) |
| `demolishResult` | `{success:true}` | `{success:false, reason:"Pole nie należy do tej kolonii"}` |

Bramka D5 odpowiedziała **poprawnie**: kolonia formalnie należała do gracza, a kafel fizycznie leżał
w jego siatce. Brakowało **drugiej osi** — `tile.owner`, przerzucanego przez okupację
(`GroundUnitManager._changeTileOwner:626`), który miał **zero** odwołań we wszystkich trzech
metodach (`_build` 0, `_upgrade` 0, `_demolish` 0).

**Trzy fakty, które przesądziły decyzję (wszystkie ZMIERZONE):**
1. 🔴 **Rozbiórka na kaflu wroga nie tylko odmawia zdobyczy — ona PŁACI.** `mine` na kaflu
   `owner='emp_001'` zwrócił **+10 Fe / +5 C / +1 structural_alloys**. Nieodwracalność zniszczenia
   razem z rabatem 50% czyniły „spaloną ziemię" na cudzym terytorium **dochodową**.
2. ⚠ **`tile.isOccupied` NIE JEST terminem okupacji** — to getter „stoi budynek / trwa budowa /
   czeka w kolejce" (`HexTile:279`). Kto po niego sięgnie, zabramkuje coś zupełnie innego.
3. ⚠ **Na świeżo wygenerowanej siatce WSZYSTKIE 300 kafli ma `owner === null`** — stempel
   `'player'` stawia wyłącznie `ColonyOverlay._ensureGrid` w gałęzi generowania. Bramka
   `owner !== 'player'` wyłączyłaby rozbiórkę na każdej koloni, której mapy gracz nigdy nie otworzył
   (AI, headless, świeżo wczytane).

**PODPISANE (właściciel, 2026-08-22):** blokujemy **wyłącznie `_demolish`**, gdy `tile.owner`
wskazuje **INNEGO, NIEPUSTEGO** właściciela. Uzasadnienie właściciela: *„nieodwracalność zniszczenia
+ zmierzony rabat 50% razem tworzą niezamierzoną, dochodową taktykę «spalonej ziemi» na cudzym
terytorium — to nie powinno być tanie ani zyskowne"*.
- **Budowa i ulepszenie ZOSTAJĄ dozwolone** na kaflu obcego (live-gate (b) PASS: są odwracalne
  i nie odbierają zdobyczy). Pinowane jako **decyzja**, nie przeoczenie (keeper T15).
- **Faza odliczania ZOSTAJE dozwolona**: `occupyEmpireId` ustawione, ale `owner` wciąż mój = kafel
  jeszcze MÓJ, więc rozbiórka jest obroną własnego majątku. Termin stoi na `owner`, **nie** na
  `occupyEmpireId` (keeper T13).
- **Fail-open przy `owner == null`** oraz przy nierozwiązywalnym właścicielu kolonii (keeper T14).
- **Osobny powód i18n** `ui.tileEnemyControlled` — diagnostyka odtwarza REALNĄ ścieżkę decyzji,
  nie uśrednia dwóch osi w jeden komunikat (keeper T16).

⚠ **`_resolveOwnTileOwner` jest LUSTREM `ColonyOverlay._ensureGrid` (`defaultOwner`)** — to jedyne
miejsce w grze stawiające ten stempel. Rozjazd tych dwóch = bramka odmawiająca na własnym kaflu.

⚠ **Po (b) zostaje świadoma luka:** po **faktycznym** przejęciu koloni klik budowy nie robi nic
**i nie mówi dlaczego** — żądanie nie powstaje, bo pasek budowy jest bramkowany `!isPreview`
(`ColonyOverlay:919`). Właściciel uznał to za akceptowalne (gracz wie, że stracił kolonię).
Komunikat należałby do **D4/OG-4**, nie tutaj.

⚠ **OBSERWACJA Z RE-TESTU (c), NIEZBADANA, przyjęta przez właściciela:** odmowa OG-1b była
**cicha**, choć handler `ColonyOverlay:179` routuje `e.reason` do flasha
(`else if (!e.success && e.reason) this._showFlash(e.reason)`), a odmowa ten `reason` niesie
(pinowane keeperem T16). Rozjazd **nie został zdiagnozowany** — właściciel jawnie nie wymaga
komunikatu, więc nie ruszamy. Gdyby kiedyś wróciło jako pytanie „czy klucz `ui.tileEnemyControlled`
jest martwy": **nie jest**, jedzie w zdarzeniu; nieustalone jest, czemu nie widać go na ekranie.

---

### D6 — Predykat: jedno źródło prawdy vs ujednolicenie stopniowe (Finding 74) ✅ **PODPISANA: W2**

**Census (zmierzony):** 1 kanon (`ColonyManager.isPlayerColony:232`) + **4 nazwane kopie**
(`RightClickMenuOptions:136`, `TerritoryService:16`, `TransportOrderSystem:553`, `EconomyHistoryLog:33`)
+ 1 delegat (`JournalScope:35`) + **~65 miejsc odczytu o podmiocie „kolonia"** w ~34 plikach
(kanoniczne 16 · słabe `!c.ownerEmpireId` ~36 · porównania z `null` 4 · konkretne imperium 3 · coalesce 6).
**Zero w plikach oznaczonych w `CLAUDE.md` jako krytyczne.**

⚠ **Cztery ograniczenia, które przesądzają kształt bardziej niż liczba miejsc:**
1. **Kanon nie może mieszkać w systemie.** Dwie kopie powstały, cytując tę regułę **w źródle**
   (`TerritoryService:14-15`, `TransportOrderSystem:552`). Miejsce = `src/data/` albo `src/utils/`.
2. **Potrzebne są DWA wejścia** — obiektowe i po `id`: trzy implementacje biorą `id` i robią własny
   lookup (`RightClickMenuOptions`, `EconomyHistoryLog`, `JournalScope`), trzy biorą obiekt.
3. **Nie wolno spłaszczyć doczepek.** `TransferStore:37` dokleja żywotność (`&& !!c.resourceSystem`),
   `ColonyOverlay:1443` rodzaj (`!isPreview && !isOutpost`), `StationGroup:83` jedno i drugie. To są
   **trzy różne pytania**, przypadkiem odpowiadane jednym wyrażeniem.
4. ⚠ **`isTestEnemy` NIE JEST dyskryminatorem** — nie jest serializowane, więc po każdym wczytaniu jest
   `undefined`, podczas gdy `ownerEmpireId` **jest** odtwarzane relinkiem. ~13 miejsc świadomych
   `isTestEnemy` (8 w `ColonyOverlay`) to **kandydaci do audytu**, nie wzór.

⚠ **I fakt, który każe być uczciwym:** kanon i kształt słaby różnią się **wyłącznie** jawnym stemplem
`ownerEmpireId === 'player'` na koloni — a **żadna ścieżka produkcyjna go nie zapisuje**. **Ta decyzja
kupuje odporność na przyszłość, nie naprawia żywego buga** — i tak trzeba ją uzasadnić.

| | **W1 — kanon + kasujemy wszystkie ~65** | **W2 — kanon + 6 nazwanych kopii teraz, reszta pinowana** | **W3 — kanon dla nowego kodu + keeper blokujący nowe inline'y** |
|---|---|---|---|
| istota | pełny sweep | ujednolicamy to, co ma nazwę; ~36 słabych zostaje z pinem źródłowym | minimalne; migracja oportunistyczna |
| ryzyko | ⚠ dotyka `FleetManagerOverlay` (9274 lin.), `GameScene` (5875), `ColonyOverlay` (5700) — **dwa z nich nie importują się pod node** | ✅ niskie | ✅ najniższe |
| trwałość | ✅ najwyższa | ⚠ dwa światy współistnieją | ⚠ jw. |
| ⚠ precedens repo | **zmierzony**: `isEnemyVessel` ma **28 importerów i 12 przeżywających duplikatów** ⇒ podejście addytywne **oznacza duplikację na stałe** | jw. | jw. |

**Rekomendacja formalna: W2** — z rodziną nazw zamiast jednego przeciążonego predykatu
(`isPlayerColony` / `isLivePlayerColony` / `isManageablePlayerColony`), żeby doczepki z ograniczenia 3
**rozdzielić**, a nie uśrednić. Precedens kształtu: `canBuildHullAt` (S3.4d), `resolveHomeColony` (S3.4c),
`isInService` (W2).
⚠ **Stacje zostają poza tą decyzją**: mają **odwrotną** trwałość i domyślną (stemplowane `'player'`
i serializowane — `StationSystem:123`, `Station.js:26`), więc jeden predykat na oba rodzaje encji to
**druga decyzja**, nie darmowy dodatek.

✅ **PODPISANA 2026-08-22: W2** — kanon w `src/utils/`, **dwa wejścia** (obiekt + `id`), **rodzina nazw**
`isPlayerColony` / `isLivePlayerColony` / `isManageablePlayerColony` (doczepki z ograniczenia 3
**rozdzielone**, nie uśrednione), 6 nazwanych kopii ujednoliconych, ~36 słabych kształtów **pinowanych
źródłowo**. **Stacje poza zakresem.**

---

## Zakres i kolejność prac (commit plan — ✅ PODPISANY 2026-08-22)

⚠ **Kolejność jest wiążąca i wynika z dwóch zmierzonych zależności**, nie z wygody:
**D5 przed D1** (⚠ sprostowane — pierwotnie stało „przed P0"; inaczej naprawa wiązania czyni grę gorszą:
cudzy kafel + MÓJ portfel) · **keeper przed każdą zmianą zachowania**.

| # | commit | treść | wynika z | gate |
|---|---|---|---|---|
| **OG-0** ✅ `e86c091` | `test: keeper szwow wlasnosci kolonii` | pinuje STAN DZISIEJSZY **wykonaniem** (17/17): **S1** `transferColony` nie czyści `isHomePlanet`; **S2** `removeColony` przepina na ex-dom wroga (test przynależności); **S3** round-trip przez **produkcyjny** `SaveSystem._serializeCiv4x` uzbraja `_activePlanetId` na koloni wroga; **S4** `switchActiveColony` przyjmuje kolonię AI. Każdy pin z **kontrolą pinu**. ⚠ Pin „budowa na obcym kaflu przechodzi" **NIE wszedł** — należy do **D5**, niepodpisanego | — | — |
| **OG-1** ✅ `f63ef74` | `fix(game): budowa i rozbiórka tylko na własnym kaflu` | **D5=W1**, fail-open przy `_grid == null`. Keeper 31/31, sweep 161/161 | **D5** | **GATE OG-1** (a/b/d PASS, c → OG-1b) |
| **OG-1b** | `fix(game): rozbiórka nie na kaflu przejętym przez obcego` | **D5 rozszerzone** — `_demolish` odmawia, gdy `tile.owner` wskazuje innego, niepustego właściciela; budowa/ulepszenie bez zmian; fail-open przy `owner == null`; osobny powód `ui.tileEnemyControlled` | **D5/OG-1b** | re-test punktu (c) |
| **OG-2** ✅ `0085a37` | `fix(save): wczytanie nie oddaje gracza koloni wroga` | **P0-A + P0-C + P0-D** jako JEDNA zmiana (wszystkie w `ColonyManager.js` + `GameScene.js`); drabina własności; `_detachActiveColony` w gałęzi terminalnej | **P0-A,C,D** | **GATE P0** |
| **OG-3** ✅ | `fix(game): rozkaz gracza tylko na koloni gracza` | **D1=W2 + D2=W3+W1** — odmowa w `switchActiveColony` (⚠ **ZERO furtek** — zmierzone) + NEW `src/utils/ColonyOwnership.js` + dziewiątka bramek jako obrona w głąb + pin **D3=W1**. Szew **S4 ODWRÓCONY** w `colony_ownership_seams`. Keeper 30/30, sweep 162/162 | D1, D2, D3 | **GATE OG-3** |
| **OG-3b** | `fix(fleet): utrzymanie floty płaci tylko kolonia gracza` | **Finding 97** — `_resolvePayHomeId` dostaje termin własności obok filtru `!isOutpost`, a fallback `window.KOSMOS.homePlanet` **przechodzi ten sam test** (po przejęciu nazywa zdobycz wroga). ⚠ Dowodem jest **pomiar kredytów w czasie**, nie kliknięcie | 97 | — |
| **OG-4** | `fix(ui): panel kolonii nie wydaje rozkazów na cudzej koloni` | **D4** — dwie bramki producenckie + inwariant `_onHit` + allowlist + i18n | D4 | GATE 2 |
| **OG-5** | `refactor: jedno źródło prawdy o własności kolonii` | **D6=W2** — `src/utils/`, dwa wejścia, rodzina nazw, 6 kopii | D6 | — |
| **OG-6** | `docs: rejestr + sprostowania` | Findings 81-93, sprostowanie `CLAUDE.md` (sweep 148→157), ewentualne sprostowanie `EmpireColonyBootstrap:543` gdy P0-B=W2/W3 | — | — |

**Per-commit gates (bez wyjątków, konwencja projektu):** `node src/testing/smoke/run-all.mjs` **0 FAIL** ·
`node tools/check-i18n.mjs` **PASS** · commit atomowy, staging **po jawnych ścieżkach**,
`git status --short` + `--cached --stat` pokazane właścicielowi **przed** commitem.

⚠ **Okno niespójności — jedno, świadome; po faktycznej zamianie OG-1↔OG-2 jest ODWRÓCONE względem
pierwotnego zapisu.** OG-2 wszedł pierwszy (P0), więc ścieżka **wczytania** jest już czysta, a stan
„mój portfel, cudzy kafel" **jest żywy dziś** przez zaprojektowany podgląd obcej planety. Po **OG-1**
gracz nadal będzie mógł związać się z kolonią wroga (widzi jej HUD), ale **nie postawi już na niej ani
nie rozbierze niczego**; samo wiązanie zamyka dopiero **OG-3**. Każdy moment przerwania tej sekwencji
jest krokiem **do przodu** względem stanu dzisiejszego.

---

## Save strategy

**Plan domyślnie NIE proponuje bumpu — zapis zostaje v101.** Warunkowo:
- **P0-A=W1/W2 + P0-B=W1** ⇒ **bez bumpu**; stare zapisy **naprawiają się przy wczytaniu**, bo wybór
  aktywnej koloni jest ownership-aware. To najsilniejszy argument za tą kombinacją.
- **P0-B=W2/W3** (serializacja `ownerEmpireId`) ⇒ pole addytywne z `?? null`; precedens `GALAXY_SEED`
  mówi „bez bumpu", ale **wymaga jawnego wpisu w protokole migracji** i przepisania
  `EmpireColonyBootstrap.js:543` oraz `AI_CAPTURE_PLAN.md` §Save strategy pkt 3.
- **czyszczenie `isHomePlanet` w starych zapisach** ⇒ **to jest migracja** ⇒ **bump v102** + wpis
  w `MIGRATIONS` obok `_migrateV100toV101` (`SaveMigration.js:172-173`).

⚠ **Wpis na przyszłość, niezależny od wariantu:** gdy `isHomePlanet` staje się kasowalne, **żadna
przyszła migracja nie może się na nim kluczować** (dziś robią to `:536-537` i `:666-667`, przyznając
realne korzyści).

---

## Testy / keepery

**Baza: 157 keeperów** (`ls src/testing/smoke/*.mjs` — ⚠ `CLAUDE.md` mówi 148, wpis jest nieaktualny;
GATE 2 AI_CAPTURE jest otwarty, więc baza może się jeszcze ruszyć).

| keeper | commit | co pinuje |
|---|---|---|
| `colony_ownership_seams_smoke` | OG-0 | cztery szwy dzisiejsze (a-d) + kontrole pinów; **trzy z nich MAJĄ paść** i zostać świadomie odwrócone w OG-1/OG-2/OG-3 |
| `colony_tile_membership_smoke` | OG-1 + OG-1b | **T1-T11 (przynależność):** budowa/ulepszenie/rozbiórka na kaflu spoza siatki **odrzucona**; kontrole pinu na własnym kaflu; **tożsamość, nie `q`/`r`** (kafel-widmo o tych samych współrzędnych odrzucony); fail-open przy `_grid == null` i przy siatce bez `get`; regresja AI (`forEach` == `get`); powód przez i18n. **T12-T16 (kontrola):** rozbiórka na kaflu obcego odrzucona **i bez zwrotu 50%**; faza `occupyEmpireId` przy własnym `owner` przechodzi; `owner == null` przechodzi; **budowa/ulepszenie na kaflu obcego NADAL przechodzą (pin decyzji)**; osobny powód i18n |
| `colony_ownership_load_smoke` | OG-2 | round-trip przez **produkcyjny** `SaveSystem._serializeCiv4x`: przejęta stolica → zapis → wczytanie ⇒ `_activePlanetId` **nie** wskazuje koloni wroga; wariant „gracz bez domu" ⇒ **detach**, nie stan sprzed; `removeColony` po przejęciu **nie** przepina na ex-dom |
| `colony_ownership_guard_smoke` | OG-3 | **30 asercji, G1-G12.** Odmowa na koloni AI (zwrotka + żaden z pięciu wskaźników nie drga) · kontrole pinu (własna kolonia, nieistniejąca kolonia) · **G4 ZERO FURTEK**: empirycznie (`GameCore.boot()` wiąże bez obejścia) **i** źródłowo (`stripComments` + brak `allowForeign\|bypass\|unchecked\|force`, z kontrolą pinu na `isPlayerColony`) · **G5 pin D3=W1** · **G6-G8** dziewiątka bramek: odmowa na systemie AI, przejście na graczu, **fail-open dla gołego systemu bez koloni** · **G9 regresja AI** (`_build` bezpośrednio, z pominięciem szyny) · **G10/G11** to samo dla `FactorySystem` i `CivilizationSystem` · **G12 pin „NIE DOTYKAMY"**: bramka SYSTEMOWA (`civ:unrest`) dalej działa na koloni AI |
| `colony_ownership_seams_smoke` | OG-3 (aktualizacja) | **S4 ODWRÓCONY** — ostatni z czterech szwów; nagłówkowa tabela kontraktu przepisana, test **nie skasowany** |
| `fleet_upkeep_payer_smoke` | OG-3b | płatnikiem utrzymania **nigdy** kolonia z `ownerEmpireId`; fallback `homePlanet` wskazujący **zdobycz wroga** nie płaci; kontrola pinu: własna kolonia gracza płaci jak dotąd |
| `colony_overlay_ownership_pin` | OG-4 | ⚠ **pin ŹRÓDŁOWY** (`ColonyOverlay` nie importuje się pod node): dwie bramki producenckie obecne, `_onHit` ma inwariant, allowlist zawiera `close` + 12 etykiet jednostkowych |

**⚠ Dyscypliny obowiązkowe, każda z pomiaru:**
1. **`env.js` PIERWSZY** — bez `src/testing/headless/env.js` goły import **dowolnego** modułu pada na
   `localStorage is not defined`; bez tego `ColonyManager`/`BuildingSystem` wyglądają na niepinowalne.
2. **`GameScene` = pin źródłowy albo live-gate, ZAWSZE** — blokadą jest mapa `exports` zwendorowanego
   stuba `three` (`0.0.0-headless-stub`, wystawia tylko `.` i `GLTFLoader`); **żaden shim po stronie testu
   tego nie obejdzie**.
3. **Pin źródłowy = `stripComments` + kontrola pinu** (wzór `war_seams_smoke` T2b) — inaczej pin łapie
   własny komentarz albo przechodzi, bo ktoś przemianował kotwicę.
4. **P0 keeper napędza PRODUKCYJNĄ ścieżkę zapisu**, nie ręcznie przepisany payload — nagłówek
   istniejącego keepera round-tripu odnotowuje, że kopia przechodziłaby dalej po usunięciu pól z `SaveSystem`.
5. **`ColonyManager.isPlayerColony` jest STATYCZNE i bierze OBIEKT** — wołanie na instancji rzuca
   `TypeError`, a podanie `planetId` **po cichu zwraca złą odpowiedź**.
6. **Drugi wołający `_detachActiveColony` ⇒ re-weryfikacja `ai_capture_last_stand` T1.**

**Regresja bez edycji:** `ai_capture_last_stand` · `ai_capture_ledger` · `invasion_player_capture` ·
`s34c_z9_transfer_dispose` · `w3_conquest_persists` · pełny sweep.

---

## Weryfikacja (live gates)

**GATE P0 (po OG-2) — „wczytanie nie oddaje gracza wrogowi".** ⚠ **Na ŚWIEŻEJ partii**, nie na zapisie
z sesji 2026-08-19 (audyt §6: skażony tą regresją).
1. Utrata jedynej koloni ⇒ `K4` jak w AI_CAPTURE GATE 2 §3 (`{aktywna: null, magazyn: 'ODPIĘTY'}`).
2. **Zapis do pliku → wczytanie → ponowny `K4`.** Kryterium: **ten sam wynik**, bez kliknięcia.
3. Zniszczenie innej koloni gracza (kolizja) ⇒ `_activePlanetId` **nie** ląduje na ex-domu wroga (P0-D).
4. Przeklikanie UI z konsolą: **nic nie rzuca wyjątkiem** przy `resourceSystem === null`.

**GATE OG-1 (po OG-1) — „rozkaz nie działa na cudzym kaflu" — PRZEPROWADZONY 2026-08-22.**
**(a) PASS** własna kolonia bez zmian · **(b) PASS z doprecyzowaniem** — budowa podczas desantu na
**własnej** (jeszcze nieprzejętej) koloni działa i **tak ma być**; po faktycznym przejęciu klik jest
nieskuteczny (bez komunikatu — świadomie, patrz §D5/OG-1b) · **(c) FAIL → OG-1b** Delete niszczył
budynki na kaflach zajętych przez wroga; zmierzone `entity_3` 15 → 13. Przyczyna rozstrzygnięta
**wykonaniem**: nie regresja OG-1, tylko nieobjęta oś (kontrola kafla) ⇒ osobna decyzja i commit
OG-1b · **(d) PASS** AI rozbudowuje kolonie, w tym **przejętą od gracza** (`entity_3` 19 → 22
budynków) — bramka nie zatrzymała `ColonyAutoExpander`.
⬜ **Do domknięcia: re-test punktu (c)** po OG-1b — Delete na kaflu zajętym przez wroga ma odmówić
komunikatem „Pole pod kontrolą wroga", a na kaflu jeszcze nieprzerzuconym (trwa odliczanie) **ma
dalej działać**.

**GATE OG-3 (po OG-3) — „gracz nie wiąże się z kolonią wroga".** ⬜ DO PRZEPROWADZENIA.
1. **Klik na kolonię AI** (Outliner / górny pasek zasobów / lista w `CivilizationOverlay` /
   `BottomContext` / wpis w Dzienniku) ⇒ HUD **NIE** przecelowuje się na jej magazyn; panele
   dalej opisują kolonię GRACZA. ⚠ Odmowa jest **cicha** (komunikat = D4/OG-4).
2. **Podgląd obcej planety w trakcie desantu dalej działa** — `show({colonyId})` nie idzie przez
   `switchActiveColony`; lądowanie, ostrzał orbitalny i grupa badawcza bez zmian.
3. **Skok warp do układu, w którym gracz nie ma koloni** (`GameScene:3302` bierze `cols[0]`
   filtrowane tylko po `systemId`) ⇒ wskaźniki **zostają** przy poprzedniej koloni gracza, nie
   lądują na koloni AI tego układu.
4. **Własne przełączanie między koloniami gracza działa jak dotąd** (kontrola pinu).
5. **AI się rozbudowuje** — kolonie AI dalej stawiają budynki (szyna ich nie dotyczy; `_build`
   wołane bezpośrednio).

**GATE 2 (po OG-4) — „rozkaz nie przechodzi".** Klik kafla na koloni wroga: **budowa odmawia**, komunikat
jest **przetłumaczony**, zaprojektowany desant/ostrzał **dalej działa**, panel **da się zamknąć**.

⚠ **CC nie pisze plików w trakcie gate'u** (Live Server przeładowuje kartę i cofa grę do ostatniego
zapisu). Filtry one-linerów **po rodzaju zdarzenia, nigdy po tekście Dziennika** (gra bywa po angielsku).
One-linery **wykonać na żywym silniku przed wpisaniem do checklisty**.

---

## Poza zakresem (świadomie)

- **Wywołania bezpośrednie**: ~19 mutacji fabryk z `EconomyOverlay` + ~6 budynkowych z `ColonyOverlay`
  (`setBuildingDesignation:4945`, `installSynthetic:4971`, `removeSynthetic:5023`,
  `installSyntheticForStrata:4813`, `removeSyntheticForStrata:4819`, `_pendingQueue.delete:5256`) +
  `Outliner:794`. ⚠ **Tam płynie większość intencji gracza** — plan bramkujący wyłącznie szynę jest
  **mierzalnie niepełny**. Kandydat na własny slice; **jeśli właściciel chce to tutaj, D2/D4 rosną istotnie.**
- **Ósemka bramek systemowych i siedemnastka martwych** ⇒ osobny `chore` prune (precedens C8 `7201670`).
- **`window.KOSMOS.homePlanet` jako drugie pojęcie „domu"** — nigdy nieprzecelowywane przy utracie;
  cztery ścieżki `game:over` kluczują się **encją**, nie flagą (`entity:removed`, `body:collision`,
  `life:extinct`, `planet:ejected` → `checkHomeDestroyed`). Zmiana znaczenia referencji czytanej
  w ~380 miejscach = własna decyzja.
- **Dwa martwe handlery** `planet:openMap` / `planet:openGlobe` (zero emitentów) — bramkować czy
  **wycofać**: osobna decyzja o kasowaniu, nie przemycać w bramce.
- **Stacje pod wspólnym predykatem** (D6, odwrotna trwałość i domyślna).
- **Naprawa floty**: `_tickRepair` szuka stoczni po `entry.buildingId` zamiast `entry.building.id`
  (dług z W2 §Pułapka 2) — bez związku, nie ruszać przy okazji.

---

## Ryzyka i pułapki (rankowane)

**R-1 (wysokie) — „wyczyść flagę i po sprawie".** Najbardziej prawdopodobny sposób zrobienia P0 źle
**w przekonaniu, że działa**. `GameScene.js:2055` czyta `c4x.homePlanetId ?? …find(isHomePlanet)…`,
a pierwsze ramię pochodzi z **nigdy nieczyszczonego** `window.KOSMOS.homePlanet` ⇒ ramię z flagą **nie
jest konsultowane**. Keeper na samym `ColonyManager` **przejdzie**, bo `GameScene` nie importuje się pod
node. **Dowód P0 musi objąć blok odroczony — pinem źródłowym i live-gate'em.**

**R-2 (wysokie) — naprawa wiązania bez D5 czyni grę GORSZĄ.** Dziś cudzy kafel obciąża cudzy portfel;
po naprawie samego wiązania obciążałby **portfel gracza** (`_build` nie zna przynależności kafla).
**Dlatego OG-1 jest przed OG-2.**

**R-3 (wysokie) — zerowanie magazynu tworzy darmowe misje.** Pięć miękkich miejsc wydatku w
`MissionSystem` przepuszcza przy `null`. **Ta sama pułapka, którą AC-8 musiał zamykać osobno.**

**R-4 (średnie) — bramka zamknięta domyślnie zapala ~20 keeperów.** Gołe instancje w fixture'ach nie
mają koloni ani właściciela. **Termin własności musi zawodzić OTWARCIE.**

**R-5 (średnie) — bramka producencka bez inwariantu gnije.** `draft_open:1949` jest żywym dowodem:
producent zapomniał terminu i dziura wróciła. Dlatego D4=W3, nie D4=W2.

**R-6 (średnie) — `isTestEnemy` nie przeżywa wczytania.** Nie jest serializowane ⇒ `undefined` po każdym
loadzie. Każdy wariant opierający się na nim jest **poprawny tylko do pierwszego zapisu**.

**R-7 (średnie) — `dispose ×5` po przełączeniu.** W `removeColony` przełączenie (`:667-672`) biegnie
**przed** `dispose ×5` (`:684-688`) i `_colonies.delete` (`:690`). Wariant „dom wraca przy odbiciu"
(P0-C) czyni ten stan osiągalnym: pięć zdisposowanych podsystemów pod `window.KOSMOS`.

**R-8 (niskie, mina) — `set activePlanetId(id)` (`:256-258`)** omija wszystko. Zero wołających dziś;
wariant sformułowany jako „bramka w `switchActiveColony`" zostawia te drzwi **z konstrukcji**.

**R-9 (niskie) — sierota własności po `destroyEmpire`.** Kolonia skasowanego imperium wraca z wczytania
jako **kolonia gracza**. Dziś tylko ścieżki debug/sandbox.

---

## Findings filed (numeracja ciągła po 80 z `COLONY_OWNERSHIP_GATE_AUDIT.md`)

81. 🔴 **`removeColony:667-672` — nieutwardzony bliźniak AC-8, ŻYWY.** Test przynależności zamiast
    własności; po przejęciu stolicy zniszczenie innej koloni gracza przepina wszystko na ex-dom wroga.
    Wejścia fizyczne i nieodfiltrowane (`:176`, `:181`, `:189`). ⇒ **P0-D**.
82. 🔴 **`BuildingSystem._build` nie waliduje przynależności kafla** — w całym ciele `:796-1015` **zero**
    odwołań do `this._grid`; klimat z `_resolveOwnPlanet:1866` (planeta AKTYWNEJ koloni). ⇒ **D5**,
    i to jest powód, dla którego D5 musi wejść przed P0.
83. **`EmpireRegistry.destroyEmpire:230-238` nie odpina kolonii** ⇒ kolonia skasowanego imperium wraca
    z wczytania jako **kolonia gracza** (relink nie ma po czym iterować). Dziś debug/sandbox.
84. **17 z 34 guardów tożsamości bramkuje zdarzenia BEZ EMITENTÓW** (`civ:addHousing/removeHousing/
    employmentChanged/lockPops/unlockPops`, 11 operacji `factory:*`, `resource:removeProducer`).
85. **Pokrycie fabryk przez szynę jest pozorne** — 19 z 21 mutacji gracza idzie bezpośrednio
    z `EconomyOverlay` na `col.factorySystem`.
86. **Przeciek `civ:unrest` między koloniami** — `CivilizationSystem:1121` wysyła `planetId`,
    `BuildingSystem:121` go ignoruje ⇒ niepokój koloni AI daje −30% produkcji koloni związanej.
87. **`CollisionForecast:242-254` buduje `playerPlanetIds` ze WSZYSTKICH kolonii** i emituje pole
    nazwane `isHomePlanet` ⇒ prognoza kolizji koloni AI **pauzuje grę gracza** komunikatem o utracie
    stolicy (`GameScene:2618-2621`).
88. **Dwie migracje kluczują się na `isHomePlanet` i przyznają realne korzyści** (`SaveMigration:536-537`
    `inv.semiconductors = 2`; `:666-667` `requiresSpaceportFirst = false`) ⇒ ograniczenie na przyszłość,
    gdy flaga stanie się kasowalna.
89. **Cztery, nie dwie, ścieżki `game:over` kluczują się ENCJĄ** (`entity:removed`, `body:collision`,
    `life:extinct`, `planet:ejected` → `checkHomeDestroyed`), więc żadna zmiana `colony.isHomePlanet`
    ich nie dotyka.
90. **`isTestEnemy` nie jest serializowane** ⇒ `undefined` po każdym wczytaniu, podczas gdy
    `ownerEmpireId` jest odtwarzane relinkiem. ~13 miejsc świadomych `isTestEnemy` (8 w `ColonyOverlay`)
    to kandydaci do audytu.
91. **Zakładka Załoga nie ma terminu własności** (`canWorkforce:1284`), a każda kolonia AI ma `civSystem`
    ⇒ 6 mutujących etykiet; pływający panel budowy (`:934`) bramkuje tylko `!isPreview` ⇒ 8 kolejnych.
    **Zakładka Stacja (`:1443`) jest wzorem poprawnym w tym samym pliku.**
92. **Klawisz Delete (`ColonyOverlay:5591`) emituje `planet:demolishRequest` BEZ hit-zony** ⇒ bramka
    wyłącznie producencka go nie zasłania.
93. **`CLAUDE.md` podaje sweep 148/148; realnie keeperów jest 157** (`ls src/testing/smoke/*.mjs`).
94. **`_openAsColonyPanel` (`:835`) dokumentuje podgląd obcej planety jako projekt** („*własnej LUB
    obcej*") — każda bramka klasy C musi to uszanować; trzy tryby zaprojektowane: `:232` grupa badawcza,
    `:269` ostrzał orbitalny, `:339` desant.

---

## Findings z GATE P0 (zaobserwowane na żywo 2026-08-20, NIE zbadane)

95. 🔴 ⚠ **OBSERWACJA Z GATE'U, NIEZBADANA — statek ze stoczni orbitalnej na koloni WTÓRNEJ, po utracie
    stolicy, wychodzi jako obcy.** Zgłoszone przez właściciela 2026-08-20 przy okazji GATE P0; **NIE
    zbadane konsolowo** — właściciel musiał przejść na inny zapis, zanim zebrał dane.
    **Zaobserwowane:** po utracie głównej/stolicowej koloni budowa statku przez **stację orbitalną**
    przy **drugiej** (nie-stolicowej) koloni produkuje statek, który **(a)** nie pojawia się na liście
    do rozmieszczenia i **(b)** jest traktowany jako **wrogi/nieznany kontakt**, nie jako statek gracza.
    **Podejrzenie (do potwierdzenia, NIE ustalone):** zły stempel `owner`/`ownerEmpireId`/`isEnemy`
    w `VesselManager.createAndRegister` albo w ścieżce stoczni stacyjnej, gdy w chwili budowy nie ma
    żywej koloni macierzystej — czyli **prawdopodobnie ta sama klasa co ten plan**: kod zakładający
    istnienie `homePlanet` bez fallbacku.
    ⚠ **Kontekst, który czyni to prawdopodobnym, a nie tylko możliwym:** `createAndRegister`
    (`VesselManager.js:186-211`) **nigdy nie stempluje** `owner`/`ownerEmpireId`/`isEnemy`
    (zmierzone przy Finding 73), więc „statek gracza" jest u niego stanem DOMYŚLNYM — a to znaczy,
    że stempel wroga musiałby pochodzić **skądinąd**, i właśnie to trzeba znaleźć.
    ⇒ **Osobny audyt** (wzór `AI_DROP_HULL_AUDIT` / `COLONY_OWNERSHIP_GATE_AUDIT`), gdy właściciel
    przygotuje scenę z odczytem `owner`/`ownerEmpireId`/`isEnemy` świeżo zbudowanego statku.
96. ⚠ **NIEPOTWIERDZONE, do tego samego audytu: czy utrata głównej koloni osierocą/usuwa stację
    orbitalną przypisaną do koloni DRUGIEJ.** Zgłoszone razem z Findingiem 95, bez danych.
    ⚠ Kontekst z S3.4c, który każe to sprawdzić poważnie: stacje mają `ownerColonyId` i mechanizm
    osierocenia (`StationSystem._onColonyDestroyed` ustawia `depotDetached` na `colony:destroyed`),
    a `transferColony` — w odróżnieniu od `removeColony` — **nie emituje** `colony:destroyed`.
    Pytanie brzmi więc: co dzieje się ze stacją, gdy jej kolonia-matka zmienia WŁAŚCICIELA, a nie ginie.

---

## Findings z audytu ścieżki kolonizacji (ZMIERZONE WYKONANIEM 2026-08-20)

> Źródło: `docs/audit/COLONIZE_PATH_ZERO_COLONY_AUDIT.md` (8 agentów, 4 przekroje, kontrprzebieg
> adwersarialny; zero refutacji). ⚠ W odróżnieniu od 95/96 **te są zmierzone, nie zaobserwowane.**

97. 🔴 **KOLONIA WROGA PŁACI ZA UTRZYMANIE FLOTY GRACZA — kolejne miejsce BEZ terminu własności,
    ta sama rodzina co D1-D6.** ⚠ **ZMIERZONE WYKONANIEM**, nie zaobserwowane: 300 Kr w jednym
    rozliczeniu (5000 → 4700, tożsamość płatnika potwierdzona), 5000 → 3094 Kr przez 80 lat gry,
    `unpaidYears` stale **0**, własna kolonia gracza **nietknięta**.
    Pełny raport: `docs/audit/COLONIZE_PATH_ZERO_COLONY_AUDIT.md` §4.
    ```
    VesselManager.js:2062-2067   _resolvePayHomeId(vessel, colMgr) {
                                   const col = colMgr.getColony(vessel.homeColonyId);
                                   if (col && !col.isOutpost) return vessel.homeColonyId;  ← filtr TYLKO na placówkę
                                   const hp = window.KOSMOS?.homePlanet;                   ← nigdy nieprzecelowywany
                                   return hp ? hp.id : null; }
    ```
    Ani jednego terminu własności; `CivilianTradeSystem.spendCredits:876` też go nie ma. Po **W3-1**
    przejęta kolonia **zostaje w `_colonies`**, więc `getColony` ją znajduje i **płaci**. Dodatkowo
    `VesselManager._onColonyDestroyed` (subskrybent `colony:captured`, `:115`) **wychodzi wcześnie**,
    gdy gracz nie ma już kolonii (`:1117-1118`), a gdy biegnie — gałęzie 1 i 2 (`:1129`, `:1144`)
    rekoncyliują **tylko `colonyId`**, nigdy `homeColonyId`; rusza go dopiero gałąź 3 (`:1163`).
    ⚠ **OSIĄGALNE PRZY ŻYWYCH KOLONIACH GRACZA** — wystarczy statek w drodze do koloni, która zostaje
    przejęta. To **nie** jest przypadek brzegowy „zero kolonii", więc nie chowa się w scenariuszu D9.
    ✅ **ZAKRES ROZSTRZYGNIĘTY (podpis 2026-08-22): WCHODZI do części II jako WŁASNY commit `OG-3b`**
    (po OG-3), **nie** jako rozszerzenie D2/D3/D4.
    **Dlaczego wchodzi:** to jedyny **zmierzony, żywy drenaż** z tej rodziny, osiągalny przy ŻYWYCH
    koloniach gracza — podczas gdy reszta części II kupuje głównie odporność na przyszłość (D6 mówi to
    o sobie wprost). Kształt naprawy jest **reuse, nie nową matematyką**: dokładnie ten sam wzór
    („test przynależności zamiast własności + fallback na nigdy nieprzecelowywany `homePlanet`"),
    który P0 naprawił już dwa razy (`removeColony:667` i wybór aktywnej koloni po wczytaniu).
    **Dlaczego OSOBNY commit:** leży na **czwartej powierzchni**, poza A/B/C tego planu — na
    **rozliczeniu okresowym** (`VesselManager._resolvePayHomeId` + `CivilianTradeSystem.spendCredits`).
    Inny plik, inny keeper i **inny rodzaj dowodu: pomiar kredytów w czasie, nie kliknięcie**;
    wciśnięty w OG-3/OG-4 rozmyłby ich zakres i gate.
    ⚠ **Finding 95 zostaje POZA** — dzieli z 97 korzeń („`homePlanet` nigdy nieprzecelowywany"), ale
    jest **niezmierzony** ⇒ własny audyt, jak zapisano wyżej.
    ⚠ Do odczytania jednym wierszem przy najbliższym gate'cie (w tej sesji raportowano tylko
    `colonyId`): `KOSMOS.vesselManager.getVessel('<id>').homeColonyId` oraz
    `KOSMOS.vesselManager._resolvePayHomeId(v, KOSMOS.colonyManager)`.

98-105. **Pozostają w audytach — BEZ decyzji o zakresie** (właściciel, 2026-08-20).
    `COLONIZE_PATH_ZERO_COLONY_AUDIT.md`: **98** `_openColonistThenTarget:2612-2617` wymaga
    rozwiązywalnej koloni statku bez filtra własności (nie ugryzło, bo W3-1 zostawia zdobycz
    w rejestrze; ugryzie, gdy kolonia zostanie USUNIĘTA) · **99** afordancja kolonizacji **znika**
    zamiast pokazać się zablokowana z powodem · **100** `MissionSystem.createMission('colonize', …)`
    ma **ZERO** wołających produkcyjnych · **101** komentarz `MovementOrderSystem.js:1857` „orbiting
    bez `dockedAt`" jest **nieprawdziwy**.
    `WARP_COLONIZE_ROUTE_AUDIT.md`: **102** trasa „obca" blokuje POPy załogi **na zawsze** (surowy
    `_vessels.delete` zamiast `destroyVessel`) · **103** `_redirectInterstellarVessel` omija
    bramkowanie startu (brak portu, brak odrzucenia przy braku paliwa) · **104** dwie równoległe
    implementacje kolonizacji · **105** drugie potwierdzenie nieprawdziwego komentarza z 101.

106. 🟠 **UI nie mówi, że start kolonizacji jest przy zerze kolonii ZABRONIONY — przycisk zostaje
     aktywny.** ⚠ **SKORYGOWANE 2026-08-20 (drugi pomiar, wykonaniowy) — pierwotnie zapisane jako
     „ŚLEPY ZAUŁEK / akcja pada cicho", i to było ZA OSTRE.**
     **Co jest prawdą:** `canLaunchColony` → `ok:true`, `FLEET_ACTIONS.colonize.canExecute` → `{ok:true}`,
     przycisk **aktywny**, a klik kończy się odmową w `MissionSystem._launchColony` (`:648`), bo
     `_detachActiveColony` wyzerował `missionSystem.resourceSystem`. Zmierzone: **misji przed/po = 0/0**.
     ⚠ **Czego NIE wolno z tego wyciągać — i co wyciągnąłem błędnie:** ta odmowa **NIE jest defektem.**
     Komentarz `MissionSystem.js:643-647` mówi to wprost: *„nowej misji kolonizacyjnej nie da się wysłać
     z zera; zostaje statek JUŻ W LOCIE, z zasobami JUŻ załadowanymi"* — czyli to **podpisane
     rozstrzygnięcie AC-8/D9** („magazyn NIE zostaje z graczem"), działające dokładnie jak zamierzono.
     ⚠ Odmowa **nie jest też w pełni cicha**: leci `expedition:launchFailed` i **jedna czerwona linia
     w Dzienniku** („Start anulowany: Brak surowców startowych", kanał flota, severity `warn`).
     **Realny defekt jest węższy:** przycisk **pozostaje włączony** po odmowie (zamiast być wyszarzony
     z powodem), a toast jest bramkowany na `cause === 'fuel'`, więc tu nie leci.
     ⚠ **Zmierzone przy okazji:** martwy jest **START** przy zerze kolonii, **nie PRZYLOT** — misja
     kolonizacyjna wystartowana PRZED utratą domyka się PO niej poprawnie (0 → 1, statek skonsumowany).
     ⚠ **LEKCJA WIĄŻĄCA (zostaje w mocy):** przy pytaniu „czy X działa" **bramka nie jest odpowiedzią** —
     dowodem jest SKUTEK. Ten wpis jest też przykładem drugiego kroku tej lekcji: **zmierzony skutek
     trzeba jeszcze skonfrontować z ZAMIAREM** zapisanym w kodzie, zanim nazwie się go defektem.
     ⇒ Sprostowanie wpisane też w nagłówku `COLONIZE_PATH_ZERO_COLONY_AUDIT.md`.
107. 🟠 **Bliźniak Findingu 102: trasa „obca" OSIEROCA JEDNOSTKI W ŁADOWNI DESANTOWEJ.**
     `_startForeignColonize` usuwa statek surowym `this._vessels.delete` (`VesselManager.js:3246`)
     zamiast `destroyVessel` (`:1042`) — a `destroyVessel` rozlicza nie tylko załogę
     (`_settleCrewOnLoss`, Finding 102), ale też zawartość `troop_bay`. Jednostki naziemne wiezione
     na pokładzie zostają bez nosiciela. **Niezgłoszone przed 2026-08-20.**
     ⚠ Wspólna przyczyna z 102 i 104: **dwie równoległe implementacje kolonizacji**, z których jedna
     omija cały rytuał sprzątania drugiej.
---

## Findings — BUG MAPY STRATCOM (poza tematem tego arca, zapisane tu, bo to żywy rejestr)

> 🔴 **Zgłoszone przez właściciela jako BLOKUJĄCE normalne sterowanie grą** (2026-08-20), zmierzone
> wykonaniem. ⚠ **Nie należy do bramki własności** — to osobny, przekrojowy problem UI. Trafia tutaj
> wyłącznie dlatego, że to jest aktualnie prowadzony rejestr; przy zakładaniu własnego planu dla mapy
> należy je przenieść.
>
> ⚠ **Diagnoza właściciela („ikona statku przechwytuje klik") jest NIETRAFIONA, a objaw prawdziwy:**
> ikona statku na mapie galaktyki **nie ma żadnej strefy klikalnej**. Działają **trzy niezależne
> przyczyny naraz** (108/109/110) — i to dlatego żadne obejście nie pomagało.
>
> ✅ **OBEJŚCIE, KTÓRE DZIAŁA — nie przez mapę STRATCOM:** `switchActiveSystem` wołają bezpośrednio
> chipy układów na głównej mapie 3D (`MapLabelLayer.js:541`), **trzy ścieżki w Outlinerze** oraz górny
> pasek zasobów. Każda z nich wprowadzi gracza do układu niezależnie od stanu STRATCOM.

108. 🔴 **Mapa STRATCOM — MECHANIZM 1: zaznaczony statek warp UKRYWA jedyny przycisk wejścia do układu.**
     `FleetManagerOverlay.js:6097-6102` — gdy `_selectedWarpShipId` jest ustawione, rysowany jest panel
     rozkazu warp **zamiast** panelu systemu, a `cluster_switch` (`:6294-6300`) — **jedyne w grze
     wejście do widoku układu** — istnieje wyłącznie w tym drugim. Zmierzone zrzuty stref potwierdzają
     zniknięcie `cluster_switch`.
     ⚠ **To PUŁAPKA, nie przełącznik:** `warp_order_cancel` (`:2291-2293`) czyści `_selectedClusterSystem`,
     ale **nigdy** `_selectedWarpShipId` ⇒ ponowny klik gwiazdy znów uzbraja panel warp, w nieskończoność.
     Wyjścia: ponowny klik w TEN SAM wiersz statku (toggle, `:2274`) albo wyjście i powrót do zakładki
     (`:605-610`). **Blokuje normalne sterowanie grą.**
109. 🔴 **Mapa STRATCOM — MECHANIZM 2: klik i hover używają PRZECIWNYCH reguł rozstrzygania.**
     Klik iteruje strefy **od końca** (`:1382`, wygrywa ostatnia pushowana), hover **od początku**
     (`:1722`). 72 strefy `cluster_star` (22×22 px), **17 nakładających się par** przy domyślnym
     zoomie, a `_stratcomVisibleSystems` sortuje od najbliższych (`:5503`) ⇒ deterministycznie
     **hover podświetla bliższy układ, a klik wybiera dalszy — 15/15 zmierzonych przypadków**.
     ⚠ Kolejność push tego **nie rozstrzygnie** (obie strefy tego samego typu) — potrzebny tie-break,
     którego overlay nie ma, plus uzgodnienie reguły hover z regułą klika.
     ⚠ `FleetManagerOverlay` **NIE dziedziczy po `BaseOverlay`** (`:352`), więc `_hitTest` z `.find()`
     (FIRST-match) **nigdy się tu nie stosuje** — overlay nosi dwie sprzeczne reguły.
110. 🟠 **Mapa STRATCOM — MECHANIZM 3: ikona statku w martwym pasie, klik połykany bez śladu.**
     Ikona rysowana `STRATCOM_FAN_DY = -13` px nad gwiazdą (`:212`), o połowie wysokości ~4.5, czyli
     `sy−17.5…sy−9.5`; strefa `cluster_star` sięga `sy−11…sy+11` (`hitR = max(r+5, 11)`, a `r` ≤ 7 wg
     `:6051`) ⇒ **górna połowa ikony leży poza jakąkolwiek strefą**. Sama ikona **nie rejestruje strefy**
     (`_drawStratcomOwnBlip:6440-6459` tylko rysuje). Klik tam trafiony jest **cicho połykany** przez
     terminalne `return true` (`:1415`), bo fallback pustego obszaru (`:1394`) jest bramkowany na
     zakładkę `tactical`. ⚠ Obie stałe są w pikselach ekranu ⇒ **zoom nigdy nie pomaga**.
     ⚠ **Obejście, które DZIAŁA** (nie przez STRATCOM): `switchActiveSystem` wołają bezpośrednio chipy
     układów na mapie 3D (`MapLabelLayer.js:541`), trzy ścieżki Outlinera i górny pasek zasobów.

---

## Findings z domknięcia AI_CAPTURE GATE 2 (2026-08-20)

112. 🟠 **Ekran „CIVILIZATION DESTROYED" NIE MA POJĘCIA ZAWIJANIA TEKSTU — tekst wychodzi poza ramkę.**
     Zgłoszone przez właściciela ze zrzutu ekranu przy GATE 2 §4-B. Komponent:
     **`UIManager._drawGameOver()`** (`src/scenes/UIManager.js:2412-2475`) — pojedyncza funkcja
     rysująca, **nie** `EndgameScene` i **nie** overlay.
     ⚠ **ZAKRES: to nie jest „ten jeden string" — to CAŁE OKNO.** Wszystkie **pięć** napisów idzie
     gołym, centrowanym `ctx.fillText` do ramki o **zaszytych** wymiarach `const DW = 420, DH = 180`
     (`:2425`): nagłówek (`:2438`), **powód (`:2452` — ten przepełniony)**, `civDead` (`:2453`), czas
     przetrwania (`:2460`), etykieta przycisku (`:2472`). **Zero `measureText`, zero `clip`, zero
     skracania.**
     ⚠ **Dlaczego ugryzło DOPIERO TERAZ:** nowy `dialog.civDestroyedConquered` (AC-8) ma **100 znaków
     EN / 101 PL** — ponad **dwukrotnie** więcej niż najdłuższy dotychczasowy powód (49 zn., kolizja).
     Każdy wcześniejszy powód **mieści się** w 420 px; ten potrzebuje ~720 px. **Okno nigdy nie
     dostało tak długiego napisu.**
     ⚠ Ramka **nie reaguje na rozdzielczość** — `W`/`H` są normalizowane do 1280×720 przez `UI_SCALE`,
     więc proporcja przepełnienia (~1,7×) jest **identyczna na każdej rozdzielczości**, a przy presetach
     motywu z większym `fontSizeNormal` rośnie do ~2,1×.
     ⚠ Tekst jest **centrowany**, więc przepełnienie jest **symetryczne** — właściciel zobaczył prawą
     krawędź, ale lewa jest przekroczona tak samo.
     ✅ **Helper JUŻ ISTNIEJE w tej samej klasie:** `UIManager._wrapText(text, maxChars)` (`:2800`,
     używany do tooltipów przez `TOOLTIP_WRAP`), a warianty szerokościowe są w pięciu innych plikach UI
     (m.in. `FleetManagerOverlay._wrapTextWidth`). ⇒ zawijanie jest w tym kodzie **problemem
     rozwiązanym, tylko nigdy niepodłączonym do tego ekranu**.
     ⚠ **Dodatkowa ciasnota, którą trzeba znać przy wycenie:** `DH = 180` przy offsetach `+64` / `+84`
     zostawia **~20 px** zapasu w pionie — zawinięty powód **zderzy się** z linią `civDead`.
     ⚠ **NIEZWERYFIKOWANE ADWERSARIALNIE** (weryfikator padł na limicie); wszystkie cytowane linie
     sprawdziłem osobiście, ale **szerokości są LICZONE, nie mierzone** — node nie ma metryk czcionki.
113. 🟠 **ZAHARDKODOWANY POLSKI NA EKRANIE KOŃCA GRY — gracz EN widzi polskie napisy.**
     ⚠ **Wpis SAMODZIELNY, nie dodatek do 112** (rozstrzygnięcie właściciela 2026-08-20). Wspólny
     jest tylko plik; **przyczyna jest inna** (brak tłumaczenia, nie brak zawijania), **skutek jest
     inny** (obcojęzyczny napis, nie przepełniona ramka) i **naprawa jest niezależna** — jedno da się
     zrobić bez drugiego.
     `UIManager.js:2460` — `` ctx.fillText(`Czas przetrwania: ${years} lat`, …) `` (plus
     `toLocaleString('pl-PL')` w `:2457`) oraz `:2472` — `ctx.fillText('NOWA GRA', …)`.
     **Żadnego `t()`, żadnego klucza i18n.** Ekran końca gry to jedno z **najbardziej pamiętanych**
     miejsc w grze, więc obcy język uderza tam mocniej niż w panelu bocznym.
     ⚠ **MARTWY KĄT SAMEGO NARZĘDZIA — to jest szersze niż ten ekran.** `tools/check-i18n.mjs` pyta
     „*czy każdy klucz użyty w `t()` istnieje w PL i EN*", a **nie** „*czy każdy widoczny napis
     przechodzi przez `t()`*". Tekst wpisany prosto w `fillText` jest dla niego **niewidzialny** —
     bramka przechodzi (`PASS`, `pl=en`) mimo dosłownie polskiego UI.
     ⇒ **Kandydat na poprawkę NARZĘDZIA, nie tylko tego jednego miejsca:** wykrywanie literałów
     tekstowych w wywołaniach rysujących (`fillText`/`strokeText`) poza `t()`. To zamieniłoby klasę
     błędu z „znajdowanej przypadkiem przy audycie" na „łapaną przez bramkę".
     ⚠ **Zasięg NIEZMIERZONY:** sprawdzony był wyłącznie ten ekran (przy okazji 112). **Nie wiadomo,
     ile innych miejsc w UI ma ten sam kształt** — policzenie ich to część ewentualnej poprawki
     narzędzia, nie osobne zlecenie.
114. **`debugLog.query` zwrócił puste tablice mimo działającego ekranu końca gry — MECHANIZM JEST
     SPRAWNY, przyczyna jest ŚRODOWISKOWA.** (Niski priorytet, zgodnie ze zgłoszeniem.)
     Sprawdzone i **wykluczone** jako przyczyny: kształt zapytania jest poprawny — `_push` zapisuje
     `{t, year, kind, data}` (`DebugLog.js:108`), a `query({kind})` porównuje `e.kind !== kind`
     (`:126`) · oba zdarzenia **SĄ** w `TRACKED_EVENTS` (`:58-59`) · `clear()` **nie leży** na ścieżce
     końca gry — jedyne wywołania to `GameScene.js:1914` (start sceny) oraz harness/smoke
     (`UIManager:905` tylko ustawia `_gameOverData`, `:2485` czyści je przy „NOWA GRA").
     ⇒ Najprawdopodobniejsza przyczyna: **bufor został wyczyszczony przez (re)start sceny** albo
     zdarzenia poleciały **zanim** bieżąca instancja `debugLog` się podpięła.
     ⚠ **REGUŁA DLA PRZYSZŁYCH LIVE-GATE'ÓW** (to jest realna wartość tego findingu): **`debugLog`
     NIE przeżywa restartu sceny** — odczyty `K` zbieraj w **tej samej karcie i tej samej partii**,
     w której gate biegł, a po „NOWA GRA" licznik startuje od zera. Nie opierać kryterium PASS na
     odczycie, który może być pusty z powodu cyklu życia sceny.
     ⚠ **NIEDOKOŃCZONE:** agent mierzący padł na limicie wydatków; powyższe zrobiłem sam odczytem.
     **Rozstrzygnięcie wymaga sesji właściciela** — jednowierszowy dyskryminator na przyszłość:
     `KOSMOS.debugLog.query({}).length` (czy bufor w ogóle coś ma) tuż obok zapytania o `game:over`.

---

## Findings — 🔴 P1: PREDYKAT KOŃCA GRY (najcięższa pozycja rejestru)

> ⚠ **Waga wyższa niż wszystkiego powyżej — i to jest ocena właściciela, nie moja.** Skutkiem nie jest
> brzydki UI ani utracone kredyty, tylko **gra, która nigdy się nie kończy, mimo że gracz faktycznie
> przegrał i nie ma żadnej drogi powrotu**. To defekt w predykacie decydującym **czy partia trwa**.
> ⚠ Kandydat na **osobny P1**, nie na doklejkę do D1-D6 (decyzja o zakresie: przy podpisie części II).

111. ✅ **ZAMKNIĘTY 2026-08-20** (`a180619` + `8537e78`, live-gate §1-§4 PASS; plan:
     `docs/design/PLAYER_VIABILITY_PREDICATE_PLAN.md`). Predykat pyta dziś o TYP MISJI, a bliźniacza
     bramka `_launchFoundOutpost` została utwardzona (D-111 = W1). Treść zgłoszenia zostaje niżej
     jako zapis tego, co było mierzone.
     🔴 **`canReverseFate` liczy statki, które NIE MAJĄ JAK NIC ZROBIĆ ⇒ trwałe zawieszenie bez końca gry.**
     `PlayerViability.js:57` — `hasColonyCapableShip(vessels)` to
     `vessels.some(v => isPlayersVessel(v) && canColonize(v))`: **czyste istnienie + moduł habitatu,
     ZERO sprawdzenia stanu** (dok / orbita / misja / paliwo). A `_tickPlayerViability`
     (`ColonyManager.js:314`) **zeruje `_viabilityLostFor` przy każdym tiku**, dopóki `state.ok`.
     ⇒ dopóki gdziekolwiek istnieje kadłub z habitatem, **`game:over` nie padnie NIGDY**.
     **Zmierzone — trzy konfiguracje, trzy różne wyniki:**
     | kolonizator w chwili utraty | zachowanie | werdykt |
     |---|---|---|
     | **w locie / po warpie** | 0 → 1, statek skonsumowany (pełny łańcuch przez prawdziwe UI) | ✅ **działa** |
     | **zadokowany przy traconej koloni** | `transferColony:838-843` **niszczy** go (`state==='docked'`) ⇒ predykat poprawnie mówi „nie ma czym" | ✅ **słusznie** |
     | **zadokowany gdzie indziej / dryfujący po `moveToPoint`** | liczony jako ratunek, a **nie może nic**: start zabroniony (`_launchColony:648`, podpisane D9), brak akcji `colonize` (`state !== 'docked'`), brak panelu obcego (`mission === null`) | 🔴 **LIMBO** |
     ⚠ **Trzecia konfiguracja to dokładnie ta, na którą właściciel trafił grając normalnie** (`v_9`
     wysłany `moveToPoint`) — nie jest to przypadek brzegowy wymyślony przez audyt.
     ⚠ **Fundament D9 ma tu mierzalne pęknięcie.** Reguła „**ISTNIENIE, NIE OSIĄGALNOŚĆ**"
     (`PlayerViability.js:18-21`) była świadomie podpisana, ale oparto ją na przesłance zapisanej
     w tym samym pliku (`:13-15`): *„przy ZERZE kolonii `canLaunchColony` przechodzi, a przylot zakłada
     kolonię"*. Ta przesłanka jest **PÓŁPRAWDĄ** — bramka przechodzi, **start nie** (Finding 106).
     Decyzja D9 stoi więc na fakcie, który opisuje predykat, a nie skutek.
     ⇒ **Do rozstrzygnięcia jest nie „czy naprawić", tylko CO JEST PRAWDĄ:** czy „los odwracalny"
     ma znaczyć *istnieje kadłub*, czy *istnieje kadłub, który MOŻE założyć kolonię*. To jest powrót
     D9 na stół, a nie poprawka.
     ➡ **PLAN NAPRAWY (2026-08-20, NIEPODPISANY):** `docs/design/PLAYER_VIABILITY_PREDICATE_PLAN.md`
     — predykat po TYPIE MISJI (trzy żywe trasy zmierzone wykonaniem) + ⚠ **sprzężona decyzja D-111**:
     `MissionSystem._launchFoundOutpost:744` to **nieutwardzony bliźniak** bramki D9 (miękkie
     `if (this.resourceSystem)`), przez który przy ZERZE kolonii placówka zakłada się **za darmo**
     (zmierzone: kolonie gracza 0 → 1). Samego predykatu **nie wolno zawęzić bez tej decyzji**.

---

## Gdzie to stawia arc

Ten slice **nie należy** do AI_CAPTURE i **nie blokuje** jego domknięcia — poza jednym punktem:
**GATE 2 §4/§5 wznawiamy na ŚWIEŻEJ partii** (audyt §6), bo stary zapis jest skażony regresją, którą
P0 właśnie naprawiło. Zrealizowana kolejność: OG-0 → OG-2 → **GATE P0 (§1-§7 PASS)** → `6796617`
(fix po §6) → **wznowienie AI_CAPTURE GATE 2 §4/§5** → dopiero potem D1-D6.

**Stan na 2026-08-22:** blok P0 **ZAMKNIĘTY**; **D1-D6 PODPISANE** (+ Finding 97 w zakresie) —
implementacja rusza od **OG-1**. Kolejność: **OG-1 → OG-3 → OG-3b → OG-4 (+GATE 2) → OG-5 → OG-6**.
⚠ **Dwa szwy są nadal ŻYWE i pinowane jako żywe**: `switchActiveColony` przyjmuje kolonię AI
(keeper `colony_ownership_seams` S4 → **D1/OG-3**) oraz `_build` nie sprawdza przynależności kafla
(**D5/OG-1**, i ten drugi jest osiągalny **już dziś** przez zaprojektowany podgląd obcej planety).
Oba mają zostać **świadomie odwrócone** w swoich commitach, **z powodem wpisanym w nagłówku keepera**
(wzór `deploy_seams`, `ai_capture_last_stand`, `s34c_z9_transfer_dispose`).
