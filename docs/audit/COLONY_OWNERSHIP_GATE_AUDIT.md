# AUDYT — bramka własności kolonii: gracz buduje na koloni wroga

**Data:** 2026-08-19 · **Zakres:** read-only. **Zero zmian w kodzie produkcyjnym.**
**Powód:** GATE 2 §3 (AI_CAPTURE, AC-8 `bb614ed`) — **FAIL zgłoszony na żywo przez właściciela.**
Po utracie jedynej kolonii (`entity_7` → `emp_001`) `K4` dał PASS
(`{aktywna: null, magazyn: 'ODPIĘTY', kolonieGracza: 0}`), po czym właściciel **przez normalne UI**
kliknął kafel na mapie `entity_7`, postawił kopalnię i farmę — **i budynki naprawdę powstały**.
Zmierzone po fakcie: `activePlanetId === 'entity_7'` (wróciło z `null`), `KOSMOS.resourceSystem`
żywy, `_producers` z kluczami `building_4,1 / building_7,2 / building_8,2 / building_6,3`.
**Metoda:** odczyt źródeł + archeologia git (`log -S`, `log -L`, `show`) + 6 niezależnych sond
z przebiegiem kontrolnym (refutacja). Gra NIE była uruchamiana.
**Numeracja findingów:** ciągła po `AI_CAPTURE_PLAN.md` §Findings 68 ⇒ **od 69**.

---

## WERDYKT (na początku)

> **Bramki własności nie ma NIGDZIE na tej ścieżce — ani przy wejściu, ani przy rozkazie.**
> `switchActiveColony` sprawdza wyłącznie, czy kolonia **ISTNIEJE**; `BuildingSystem` sprawdza
> wyłącznie, czy jest **AKTYWNA**. Ani jedno, ani drugie nigdy nie pytało *„czyja"*.
> **Dziura jest PRE-EXISTING i ma ~4 miesiące** — nie stworzył jej AC-8 ani żaden commit
> AI_CAPTURE. **AC-8 naprawił AUTOMATYCZNĄ wersję tej samej wady i nie tknął RĘCZNEJ.**

I dwie rzeczy, których zgłoszenie nie zawierało, a które ważą więcej niż sam objaw:

> ⚠ **1. Gracz nie „ukradł sobie gospodarki" — gracz KARMIŁ gospodarkę wroga.** Kopalnia
> zapłacona została z magazynu `emp_001` i **produkuje do magazynu `emp_001`**
> (`BuildingSystem._activateBuilding:755` woła `this.resourceSystem.registerProducer(...)` na
> WŁASNEJ instancji kolonii). Jedyne, co zrobił `switchActiveColony`, to **przecelował HUD**
> (`ColonyManager.js:270`) na cudzy magazyn. To nie jest exploit ekonomiczny w tym miejscu —
> to **darmowa praca dla najeźdźcy**, wyglądająca jak własna gospodarka.

> 🔴 **2. Zapis `.json` właściciela zawiera tę awarię i ODTWORZY ją SAM, bez żadnego kliknięcia.**
> Higiena AC-8 **nie przeżywa wczytania**. Szczegóły i dowód: **§6**. To dotyczy wznowienia
> GATE 2 §3/§4/§5 — przeczytaj §6, ZANIM wczytasz tamten plik.

### Odpowiedzi na cztery pytania właściciela

| # | pytanie | odpowiedź |
|---|---|---|
| **1** | czy ścieżka kliknięcia ustawia `activePlanetId` bezwarunkowo? | **TAK — i jest ich CZTERY**, nie jedna. Wszystkie bramkują na `hasColony`/`getColony` (goły `Map.get`), potem wołają `switchActiveColony`. **Żadna nie zna `ownerEmpireId`.** §1 |
| **2** | czy `ResourceSystem` podpina się bez filtra przy każdym wejściu? | **TAK, i to jest OGÓLNY WZORZEC**: podpięcie bezwarunkowe, odpięcie tylko **jednorazową reakcją na zdarzenie**. `_detachActiveColony` ma **dokładnie jednego wołającego** i **nic** nie pilnuje inwariantu potem. §2 |
| **3** | czy funkcja kolejkująca budowę sprawdza właściciela? | **NIE — i nie ma czym.** `_build` waży 11 bramek, żadna nie dotyczy własności; `grep -nE "ownerEmpireId\|isPlayerColony\|isTestEnemy\|player"` po całym 2465-liniowym pliku daje **EXIT=1, zero trafień**. Instancja `BuildingSystem` **nie ma pola właściciela**. §3 |
| **4** | nowa czy istniejąca? | **ISTNIEJĄCA I ZAWSZE OSIĄGALNA.** Guard `!== this` stoi w **pierwszym commicie repo** (`9951d5e`, 2026-03-01) i **nigdy** nie był bramką własności. Kolonie AI mieszkają w tej samej mapie od `0acd7d9` (2026-05-23). **Naprawa musi być w zakresie CAŁEJ GRY, nie tego slice'u.** §4 |

---

## 1. WEJŚCIE — cztery ścieżki, zero filtrów właściciela

Wspólny zlew (**jedno miejsce, przez które przechodzą wszystkie**):

```
ColonyManager.js:262   switchActiveColony(planetId) {
              :263       const colony = this.getColony(planetId);
              :264       if (!colony) return false;        ← JEDYNY warunek: ISTNIEJE
              :265       this._activePlanetId = planetId;
              :270-274   window.KOSMOS.{resourceSystem,civSystem,buildingSystem,
                                        factorySystem,prosperitySystem} = colony.*
              :275-276   expeditionSystem.resourceSystem = …; techSystem.resourceSystem = …
```

Bramka `getColony`/`hasColony` (`:199-206`) to goły odczyt z `Map`. Po W3-1 (`efa8f85`)
`transferColony` **zostawia przejętą kolonię w `_colonies`** (przerzut własności w miejscu), więc
`entity_7` odpowiada `true` na oba predykaty **po utracie**.

| # | ścieżka | bramka | plik:linia | uwaga |
|---|---|---|---|---|
| **A** | **przełączenie układu** (STRATCOM / Outliner / mapa / top bar) | `getAllColonies()` filtrowane **tylko po `systemId`**, bierze `cols[0]` | `GameScene.js:3287-3295` | ⚠ **Najgroźniejsza i najbardziej prawdopodobna.** Nie wymaga karty ciała ani zamykania overlayów — **jedno kliknięcie układu**. Po utracie `entity_7` była prawdopodobnie JEDYNĄ kolonią w `sys_home`, więc `cols[0]` = kolonia wroga. Komentarz przy `getAllColonies` (`ColonyManager.js:224-225`) **ostrzega wprost**: „*zawiera też kolonie imperiów AI — dla widoków GRACZA używaj `getPlayerColonies()`*". |
| **B** | **karta ciała → „► Mapa ciała"** | `hasColony(entity.id)` | `BottomContext.js:423-425` | Przycisk jest **widoczny** na koloni wroga, bo ten sam ślepy predykat rysuje etykietę (`:120`). |
| **C** | **dwuklik ciała na mapie 3D** | `hasColony(entity.id)` | `GameScene.js:5366-5367` | Bramki `:5343-5347` wymagają **braku otwartego overlaya** — czyli dokładnie stanu po utracie. |
| **D** | **klik wpisu w Dzienniku** | `getColony(entityRef)` | `EventLogOverlay.js:348, :368` | Komentarz `:366` mówi „*Kolonia gracza →*", **kod testuje tylko `if (colony)`**. Stare wpisy o `entity_7` zostają w ring bufferze po zmianie właściciela. |

**Listy są BEZPIECZNE — bo są filtrowane u ŹRÓDŁA, nie przy kliknięciu.** Outliner
(`UIManager.js:1920-1921`), TopResourceDrawer (`:92-93`), CivilizationOverlay (`:114`) i pasek
zakładek ColonyOverlay (`:1187`, `getPlayerColonies()`) nie pokażą koloni wroga jako wiersza.
`_switchColony` (`ColonyOverlay.js:1244-1248`) **sam też jest ślepy na właściciela**, ale jego
jedyny producent to hit `colonyTab` (`:1229`) karmiony listą gracza — czyli jest bezpieczny
**przez przypadek konstrukcji**, nie przez własną bramkę.

**⚠ `planet:openMap` i `planet:openGlobe` to MARTWY KOD.** Repo-wide grep zwraca wyłącznie dwa
`EventBus.on` (`GameScene.js:2257`, `:2261`) i **zero emitentów**. Ich brak filtra jest nieszkodliwy.
`planet:colonize` (`:2252`) też nie ma filtra, ale obaj emitenci są bramkowani na `!civMode`.

**Dlaczego asymetria w `GameScene.js:2253-2280` wygląda tak, jak wygląda:** filtr
`isPlayerColony` dostały **wyłącznie** dwa handlery karmione ZDARZENIEM AI (`colony:founded`
`:2270-2272`, `outpost:founded` `:2276-2277`) — dopisane w `8f9d9c1` (2026-06-22) z komentarzem
„*to przeciek szczegółów przeciwnika*". **Ścieżek klikanych nikt nigdy nie potraktował jak
powierzchni ataku.** To jedyny commit w historii, który świadomie audytował tę klasę przecieku.

**Której ścieżki użył właściciel — NIE DA SIĘ ustalić ze źródła.** Wszystkie cztery dają
identyczny stan końcowy. Jedyny dyskryminator w runtime: **D** loguje
`console.log('[EventLog] klik wpisu →', …)` (`EventLogOverlay.js:350`); A/B/C nie logują nic.

---

## 2. PODPIĘCIE — bezwarunkowe; odpięcie — jednorazowe

**(a)** Z **19 produkcyjnych wołań** `switchActiveColony` **cztery nie mają filtru własności
nigdzie w łańcuchu** (te z §1); reszta jest filtrowana wyżej przez `getPlayerColonies()`/
`isPlayerColony`, albo to ścieżki bootstrapu/scenariuszy.

**(b) Samo PATRZENIE nie podpina.** `ColonyOverlay.show()` tylko **CZYTA**
`colMgr.activePlanetId` do `_selectedColonyId` (`:421-422`); `switchActiveColony` występuje w tym
pliku **raz**, w `_switchColony` (`:1248`). Przepięcie **wjeżdża wraz z kliknięciem, które
OTWORZYŁO panel** — a nie przy rysowaniu.

**(c) `_detachActiveColony` (`:343`) ma DOKŁADNIE JEDNEGO wołającego:** `:794`, wewnątrz
`transferColony`. To **reakcja na zdarzenie, nie egzekwowany inwariant**.

**(d) Nic tego nie pilnuje później.** Jedyny kod per-tick, który w ogóle patrzy na kolonie gracza —
`_tickPlayerViability` (`:299`) — **tylko je LICZY** (`getPlayerColonies().length > 0`, `:304`)
i **nigdy nie sprawdza ani nie naprawia** `_activePlanetId` czy `window.KOSMOS.resourceSystem`.
Grep po `activePlanetId` + tokenach własności: **EXIT=1, zero trafień**.

**(e)** Fallback AC-8 naprawia stan **w tamtej chwili** — nie zapala zatrzasku, a
`switchActiveColony` żadnej flagi nie czyta. **Każde późniejsze niefiltrowane wołanie podpina
z powrotem.** Ten swap jest zresztą w kodzie opisany jako zachowanie oczekiwane
(`EmpireColonyMaintenance.js:14-15`).

> ⚠ **Wyświetlanie i podpięcie to DWA RÓŻNE kanały — i to ma konsekwencje dla zakresu naprawy.**
> `show()` ma gałąź `if (opts.colonyId)` (`:419`) z komentarzem „*np. drop mode na obcej planecie*",
> a `_openAsColonyPanel` (`:835`) mówi w JSDoc wprost: „*dla konkretnej planety (**własnej LUB
> obcej**)*". Jest to **zaprojektowana** ścieżka (desant `:339`, ostrzał orbitalny `:269`, away team
> `:232`). Patrz §5 klasa **C**.

---

## 3. ROZKAZ BUDOWY — nie sprawdza właściciela i nie ma czym

**(a)** `_build` (`BuildingSystem.js:796-1013`) waży **jedenaście** bramek: nieznany budynek ·
kafel zajęty · teren/klimat · wymagany tech · budynek-prerekwizyt · bramka frakcyjna · reguły
placówki · mutex farma/syntetyk · stać/nie stać (`:956`) · czas budowy · flaga stolicy.
**Żadna nie pyta, kto wydaje rozkaz ani do kogo należy kolonia.**

**(b) Dowód nieobecności:** `grep -nE "ownerEmpireId|isPlayerColony|isTestEnemy|player"
src/systems/BuildingSystem.js` → **EXIT=1, zero linii**. Sweep case-insensitive po
`owner|player|empire|enemy|permission|authoriz` trafia w **trzy komentarze prozą** (`:1540`,
`:1570`, `:1586`) o bootstrapie AI — i nic więcej.

**(c) Instancja nie ma pola właściciela.** Tożsamość `BuildingSystem` to `_planetId` (`:84`),
`_isOutpost` (`:87`), `_requiresSpaceportFirst` (`:90`), `_isRegionMode` (`:93`) plus wskaźniki na
`resourceSystem`/`civSystem`/`techSystem` swojej koloni (`:51-53`). **Pola własności nie ma.**

**(d) Czym NAPRAWDĘ jest guard `window.KOSMOS?.buildingSystem !== this`.**
To **deduplikator fan-outu, nie autoryzacja.** KAŻDA kolonia — gracza i AI — ma własny
`BuildingSystem` zapisany na tę samą globalną szynę, więc guard wybiera **dokładnie jednego
respondenta**: tego, na którego ostatnio wskazał `switchActiveColony`. Odpowiada na pytanie
**„KTÓRA kolonia"**, nigdy **„czy TEN aktor MOŻE"**. 7 wystąpień w pliku (`:100/105/110/121/125/
131/138`), **35 w całym repo**.

**(e) Rodzeństwo tak samo:** `planet:demolishRequest` (`:105`), `planet:upgradeRequest` (`:110`) —
identyczny kształt, zero własności. ⚠ **Ścieżka `deployFromCargo` z `CLAUDE.md` NIE ISTNIEJE**
w drzewie (`grep -rn "deployFromCargo\|deploysBuilding" src/` → pusto) — wpis w dokumentacji jest
nieaktualny (⇒ **Finding 76**).

**(f) KTO NA TYM ZARABIA — i to jest sedno.**
`_activateBuilding` rejestruje producenta **bezpośrednio na własnej instancji**:

```
BuildingSystem.js:755   this.resourceSystem.registerProducer(`building_${tileKey}`, effectiveRates)
```

`this.resourceSystem` sparowano z kolonią przy jej tworzeniu (`ColonyManager.js:472`). Koszt
schodzi z **tego samego** magazynu (`:956` sprawdzenie, `:978` odjęcie), housing idzie do
**tego samego** `civSystem` (`:760-762`). ⇒ **Gracz wydał minerały `emp_001`, żeby postawić
kopalnię `emp_001`, która produkuje do magazynu `emp_001`.** Wyglądało na własne, bo
`window.KOSMOS.resourceSystem` (`:270`) celuje HUD-em w cudzy magazyn.

⚠ **I to trwa po odejściu:** `_tickConstruction` kończy budowę przez `_activateBuilding`
(`:1424`) w gołej gałęzi `else` (`:1422-1425`), napędzany per-kolonia `time:tick` (`:164`) —
**całkowicie poza guardem `window.KOSMOS`**. Zakolejkowany budynek **dokończy się dla wroga**,
nawet gdy gracz dawno przełączył widok.

---

## 4. WIEK DZIURY — pre-existing, ~4 miesiące, poza tym slice'em

**(a)** Guard `window.KOSMOS?.buildingSystem !== this` stoi **verbatim w pierwszym commicie
repo** `9951d5e` (2026-03-01), pod komentarzem „*Guard: tylko aktywna kolonia przetwarza żądania
budowy/rozbiórki*". **Urodził się jako bramka TOŻSAMOŚCI i nigdy nie był bramką własności:**
`git log -S "isPlayerColony" --all -- src/systems/BuildingSystem.js` → **0 commitów**; to samo dla
`ownerEmpireId`. Nie ma czego „przywracać".

**(b)** `switchActiveColony` od pierwszego pojawienia (`4e6931a`, 2026-03-04) ma wyłącznie
`if (!colony) return false;`. `git log -L 259,282:src/systems/ColonyManager.js` wskazuje sześć
commitów (`9951d5e`, `4e6931a`, `ee669ab`, `857d920`, `6b7dc3b`, `bb614ed`); **w żadnym ciało
funkcji nie zawiera testu własności.** `bb614ed` (AC-8) trafia w ten zakres **wyłącznie dlatego,
że WSTAWIŁ nowe metody ZA funkcją** — nie dlatego, że ją edytował.

**(c) Co AC-8 (`bb614ed`) zrobił w `ColonyManager`** (siedem hunków): import `PlayerViability` ·
wołanie `_tickPlayerViability` w ticku · dwie **nowe** metody · dwie rektyfikacje komentarzy ·
**filtr właściciela w fallbacku wewnątrz `transferColony`** · nowa stała statyczna.
**Nie tknął** `switchActiveColony`, `planet:buildRequest`, `ColonyOverlay` ani ścieżki klikanej
w `GameScene` — tych plików commit **w ogóle nie modyfikuje**.

⚠ **Jedyna zmiana AC-8 na ścieżce wejścia działa na KORZYŚĆ gracza.** Przed `bb614ed` fallback brał
**dowolny** wpis z `_colonies`, więc po utracie gracz był podpinany do koloni agresora
**automatycznie, bez jednego kliknięcia** (zmierzone w opisie commitu: `entity_94` / `emp_001`).
**AC-8 zamknął wersję AUTOMATYCZNĄ. Wersji RĘCZNEJ nie dotknął — i nigdy nie deklarował, że dotyka.**

**(d) Osiągalność — kiedy naprawdę.**
Kolonie AI powstają **tą samą** `ColonyManager.createColony` i lądują w **tej samej** mapie
`_colonies`, każda z żywym `resourceSystem`/`buildingSystem`/`civSystem`
(`EmpireColonyBootstrap.js:158`, `:370`); własność to **tylko pole** `ownerEmpireId` (`:489`).

| kiedy | co udostępniło cudzą kolonię |
|---|---|
| `db04e00` (2026-04-20) / `e311345` (2026-04-24) | `SpawnTestEnemy` (konsola) i `CombatSandbox` (przycisk na ekranie tytułowym) stawiają pełne kolonie `isTestEnemy` **w układzie gracza** — dwuklik od ręki |
| `0acd7d9` (2026-05-23) | `EmpireColonyBootstrap` wpięty w `EmpireGenerator` ⇒ **normalna gra**: zbadany układ AI, `cluster_switch`, dwuklik stolicy |
| `347a64d` (2026-04-16) → `bb614ed` | niefiltrowany fallback `transferColony` — utrata jedynej koloni **automatycznie** podpinała gracza do AI |
| **W3-1 `efa8f85` (2026-08-17)** | `transferColony` przestał robić `_colonies.delete` ⇒ **utracona kolonia gracza sama staje się klikalną kolonią obcą, pod jego własnymi współrzędnymi** |

> **AI_CAPTURE nie stworzył dziury — uczynił ją ŁATWĄ I NIEUCHRONNĄ.** Wcześniej trzeba było
> polecieć do cudzego układu; teraz cudza kolonia jest tam, gdzie gracz zawsze klikał.
> **Warunkiem koniecznym była W3-1, nie AC-8.**

---

## 5. ZASIĘG — budowa jest najMNIEJSZĄ z co najmniej trzynastu dziur

Trzy **różne** kształty bramek, żaden bez terminu własności:

**Klasa A — guard tożsamości `window.KOSMOS?.X !== this`.**
7 × `BuildingSystem` · 7 × `CivilizationSystem` · **16 × `FactorySystem`** · 3 × `ResourceSystem` ·
1 × `ProsperitySystem`.

**Klasa B — `switchActiveColony` przecelowuje TAKŻE `expeditionSystem.resourceSystem` i
`techSystem.resourceSystem`** (`ColonyManager.js:275-276`) ⇒ **koszt startu każdej misji i
inwentarzowe prerekwizyty każdego techu idą przez magazyn wroga.**

**Klasa C — ⚠ SZERSZA niż zgłoszony błąd: ~10 case'ów `ColonyOverlay._onHit` woła
`colony?.buildingSystem` / `colony?.civSystem` BEZPOŚREDNIO na OGLĄDANEJ koloni**
(`_getColony()` = `_selectedColonyId`), **omijając guard `window.KOSMOS` w całości**:
`focusMinus`/`focusPlus` (`:4791-4796`, `civ.setStrataFocus`) · `droidInstall`/`droidRemove`
(`:4811-4820`) · `installSynthetic` (`:4966`) · `autonomizeBuilding` (`:4993`) ·
`removeSynthetic` (`:5021`) · `setDesignation` · anulowanie pending (`:5033`).
**To działa NAWET BEZ `switchActiveColony`** — wystarczy, że overlay OGLĄDA cudzą kolonię, czyli
w trakcie **zaprojektowanego** desantu/ostrzału (§2). ⇒ **naprawa samego
`switchActiveColony` NIE zamknęłaby klasy C.**

### Najcięższe konsekwencje (zweryfikowane w źródle)

🔴 **Konwersja aktywów — statek.** `fleet:buildRequest` route'uje na
`this._activePlanetId` (`ColonyManager.js:122`); koszt schodzi z magazynu wroga; a
`VesselManager.createAndRegister` (`:186-211`) **nigdy nie stempluje** `owner`/`ownerEmpireId`/
`isEnemy` ⇒ `isEnemyVessel` (`Vessel.js:437-443`) zwraca **false**. **Statek zapłacony przez wroga
wychodzi jako statek GRACZA.** To jedyne miejsce w całym zasięgu, gdzie transfer idzie
**do** gracza — i dlatego jest najcięższe.

🔴 **Bramka kadłubowa S3.4d ODWRACA SIĘ.** `ColonyManager.js:1013`:

```
if (ColonyManager.isPlayerColony(colony) && !canBuildHullAt(ship.id, 'ground')) { … odmowa … }
```

Predykat pyta o **kolonię-CEL**, nie o wydającego rozkaz. Wskazanie koloni obcej czyni go **false**
⇒ **bramka jest pomijana** ⇒ gracz buduje **krążownik w stoczni NAZIEMNEJ** — dokładnie to, czego
ten slice zabrania. **Zwolnienie AI z gatingu stało się furtką dla gracza.**

🟠 Stacja orbitalna zakolejkowana z magazynu wroga zostaje ostemplowana `ownerEmpireId: 'player'`.
🟠 `startGroundUnitBuild` czyta `freePops` cudzej koloni (`:1281`) i jej kredyty (`:1290`)
— ⇒ już zgłoszone jako **Finding 60**.

### Predykat ISTNIEJE i jest używany poprawnie dwa pliki dalej

`ColonyManager.isPlayerColony` (`:232`) ma **6 realnych wywołań** (`GameScene.js:2272`, `:2277`;
`ColonyManager.js:239`, `:789`, `:1013`; `JournalScope.js:39`). `TransportOrderSystem.createOrder`
odrzuca z `not_player_colony`; `TechSystem` przeszedł na `getPlayerColonies()` **z komentarzem
nazywającym dokładnie tę klasę błędu**. ⇒ **To nie jest brak słownictwa — to brak zastosowania.**

⚠ **Predykat jest rozmnożony:** 1 kanon + **4 nazwane kopie** (`RightClickMenuOptions`,
`TerritoryService`, `TransportOrderSystem`, `EconomyHistoryLog`) + 1 delegat (`JournalScope`) +
~134 inline'owych porównań `ownerEmpireId` w **co najmniej 4 wzajemnie NIERÓWNOWAŻNYCH kształtach**
(m.in. słabszy `!c.ownerEmpireId` w samym `ColonyManager` i wariant świadomy `isTestEnemy` używany
tylko przez `ColonyOverlay`). ⇒ **Finding 74.**

### Dziura odwrotna — SPRAWDZONA, NIE MA JEJ

`ColonyAutoExpander._managedColonies` odrzuca kolonie bez właściciela
(`if (!c || c.ownerEmpireId == null) return false;` `:173`), `EmpireColonyMaintenance` filtruje
`c?.ownerEmpireId != null` (`:55-56`). **AI nie może mutować koloni gracza tą drogą.**

---

## 6. 🔴 ZAPIS — higiena AC-8 NIE PRZEŻYWA WCZYTANIA (dotyczy pliku właściciela)

**To jest najpoważniejsze ustalenie tego audytu i nie było częścią zgłoszenia.**
Nie chodzi o to, że zepsuty stan się utrwala — **chodzi o to, że wczytanie ODTWARZA awarię
od zera, bez jednego kliknięcia**, na zapisie zrobionym w stanie POPRAWNYM (`activePlanetId: null`).

Łańcuch, **odczytany linia po linii w źródle**:

1. **`transferColony` NIGDY nie czyści `colony.isHomePlanet`** — tylko go **czyta**
   (`ColonyManager.js:799` `const wasHomePlanet = !!colony.isHomePlanet;`). Grep po
   `isHomePlanet\s*=` w całym `src/` daje **trzy zapisy** i **żaden nie jest ścieżką przejęcia**
   (`EmpireColonyBootstrap.js:167`, `:375` ustawiają **false** koloniom AI; `GameScene.js:2617`
   to komentarz). ⇒ **przejęta stolica dalej nosi `isHomePlanet: true`.**
2. **Serializuje się** (`ColonyManager.js:2303`), a `activePlanetId` zapisuje się jako **`null`**
   (`:2336`) — AC-8 zadziałał, zapis jest „czysty".
3. **`restore` uzbraja z powrotem, ZANIM dojdzie do `activePlanetId`:**
   ```
   ColonyManager.js:2451   if (colData.isHomePlanet) {
                 :2452       this._activePlanetId = colData.planetId;   ← kolonia WROGA
   ```
4. **`null` nie cofa tego wpisu** — bramka niżej jest warunkowa i po prostu się nie wykonuje:
   ```
   :2481   if (data.activePlanetId && this._colonies.has(data.activePlanetId)) {
   ```
   `data.activePlanetId === null` ⇒ warunek fałszywy ⇒ **`_activePlanetId` zostaje z `:2452`.**
   ⚠ Bramka jest zresztą **testem PRZYNALEŻNOŚCI, nie własności** — nie pomogłaby i tak.
5. **`GameScene` domyka sprawę bezwarunkowo:**
   `homePlanetId = c4x.homePlanetId ?? c4x.colonies?.find(c => c.isHomePlanet)?.planetId` (`:2055`),
   gdzie `c4x.homePlanetId` to `window.KOSMOS.homePlanet?.id` (`SaveSystem.js:180`) — a
   **`homePlanet` nie jest przecelowywany przy przejęciu** (trzej pisarze: `GameScene.js:382`,
   `:2061`, `:3753`). Potem `getColony(homePlanetId)` **znajduje ją** (W3-1 zostawia w `_colonies`)
   i przepina **wszystkie pięć wskaźników** `window.KOSMOS` **plus** pola sceny (`:2066-2076`).
6. ⚠ **`ownerEmpireId` NIE JEST W OGÓLE SERIALIZOWANY** przez `ColonyManager` (nieobecny w bloku
   `:2299-2333` i w literale przy restore `:2417-2447`). Stempluje go dopiero
   `relinkColoniesAfterRestore` (`EmpireColonyBootstrap.js:552`, pętla `:571-572`), wołane
   z `GameScene.js:2046` — **PO** `colonyManager.restore` (`:2041`). ⇒ **W chwili, gdy `:2451`
   wybiera aktywną kolonię, KAŻDA kolonia w pliku wygląda na niczyją.** Nawet bramka własności
   dopisana w tym miejscu **nie miałaby czego przeczytać.**

> 🔴 **Praktycznie:** wczytanie zapisu właściciela postawi go **z powrotem** na `entity_7`
> (`emp_001`) z żywym magazynem wroga — **bez klikania**, zanim zdąży wykonać jakikolwiek punkt
> §3. **Wznowienie GATE 2 §3/§4/§5 na tamtym pliku zmierzy stan po tej regresji, nie po AC-8.**
> ⇒ **Findings 69 + 70.**

*(Uwaga metodologiczna: §6 zweryfikowałem osobiście, linia po linii, poza sondami — właśnie
dlatego, że rozstrzyga o tym, czy wznowienie gate'u ma sens.)*

---

## 7. DLACZEGO KEEPER TEGO NIE ZŁAPAŁ — i to NIE jest wina headlessa

`ai_capture_last_stand_smoke.mjs` pinuje **dokładnie tę chwilę** i **zatrzymuje się na niej**:
`cm.activePlanetId == null` (`:81`), `window.KOSMOS.resourceSystem === null` (`:87`) — zaraz po
`transferColony`. **Nigdy potem nie woła `switchActiveColony` i nigdy nie przechodzi przez
serialize/restore.**

- Żaden keeper w repo nie pinuje własności na `switchActiveColony`:
  `grep -rn switchActiveColony src/testing/smoke/*.mjs` → tylko `transport_orders_smoke.mjs:84`
  i `transport_ui_render_smoke.mjs:62`, oba niewinne.
- Żaden nie ćwiczy `ColonyManager.restore` **po przejęciu**;
  `w3_conquest_persists_smoke.mjs` reklamuje „*ścieżkę wczytania zapisu*" (`:11`, `:88-101`),
  ale odtwarza wyłącznie stempel `galaxyData`.

⚠ **Obie luki są czystym `ColonyManager`** — osiągalnym z harnessu `GameCore`, który keeper już
bootuje. **„Headless nie importuje `GameScene`/`ColonyOverlay`" tłumaczy tylko ścieżki klikane
(§1), a NIE tłumaczy §6 ani pinu własności na `switchActiveColony`.** ⇒ **Finding 71.**

Osobno: pasek budowy w `ColonyOverlay` jest bramkowany na `isPreview`, **nie na własności** —
`if (!colony?.isPreview) this._drawBuildingsBar(…)` (`:919`), razem z hit-zonami. Ten sam plik
pisze predykat własności inline **cztery razy** (modal poboru `:1054-1055`, picker stacji
`:1062-1063`, pasek zakładek `:1141`, zakładka Stacja `:1443`) i **suprymuje tylko chrom**,
nigdy akcje. Dlatego kafle dały się kliknąć.

---

## 8. CO TO ZNACZY DLA ZAKRESU (materiał do decyzji — **bez propozycji naprawy**)

Fakty rozstrzygające o zakresie, zebrane w jednym miejscu:

1. **To nie jest regresja AC-8.** AC-8 nie dotknął żadnego z czterech wejść ani rozkazu budowy;
   jego jedyna zmiana na tej ścieżce **usunęła gorszy, automatyczny wariant** tej samej wady.
2. **Warunkiem koniecznym była W3-1** (kolonia zostaje w `_colonies`), nie AI_CAPTURE.
   Sama dziura jest starsza od obu — od pierwszego commitu repo.
3. **Powierzchnia jest wspólna dla całej gry**, nie dla slice'u: `switchActiveColony`,
   `BuildingSystem`/`FactorySystem`/`CivilizationSystem`/`ResourceSystem`/`ProsperitySystem`,
   `ColonyOverlay._onHit`, `GameScene`, `BottomContext`, `EventLogOverlay`.
4. **Trzy klasy wymagają trzech różnych rozstrzygnięć** (A: guard tożsamości; B: przecelowanie
   `expedition`/`tech`; C: bezpośrednie wywołania na oglądanej koloni). **Naprawa jednego wejścia
   nie zamyka pozostałych — a klasa C nie przechodzi nawet przez `switchActiveColony`.**
5. **§6 jest niezależny od §1-§5** i wymaga własnego rozstrzygnięcia (m.in. „czy przejęcie ma
   czyścić `isHomePlanet`" oraz kolejność `restore` ↔ `relinkColoniesAfterRestore`).
   **To jedyna pozycja, która blokuje wznowienie GATE 2.**
6. **`isPlayerColony` istnieje, jest kanonem i bywa używany poprawnie** — brakuje zastosowania,
   nie narzędzia. Ale **jest rozmnożony w 4 nierównoważnych kształtach**, więc „dopisać predykat"
   nie jest operacją neutralną.

**Pytanie do właściciela pozostaje otwarte:** poprawka w ramach AC-8 (i wtedy: co dokładnie mieści
się w „higienie po utracie kolonii"?) — czy osobny, głębszy temat „bramka własności rozkazów
gracza" obejmujący §5 i §6. **Audyt tego nie przesądza.**

---

## Findings do rejestru (numeracja ciągła po 68)

69. 🔴 **Higiena AC-8 nie przeżywa wczytania — `isHomePlanet` nie jest czyszczony przy przejęciu.**
    `transferColony` tylko czyta flagę (`ColonyManager.js:799`); `restore:2451-2452` uzbraja
    `_activePlanetId` na koloni wroga, a `null` z zapisu nie cofa tego, bo bramka `:2481` jest
    warunkowa. `GameScene.js:2055-2076` domyka przepięcie wszystkich wskaźników. **Wczytanie
    odtwarza awarię bez kliknięcia.** ⇒ blokuje wznowienie GATE 2.
70. 🔴 **`ownerEmpireId` nie jest serializowany przez `ColonyManager`** (brak w `:2299-2333`
    i `:2417-2447`); stempluje go dopiero `relinkColoniesAfterRestore`
    (`EmpireColonyBootstrap.js:552`) z `GameScene.js:2046`, **po** `restore` (`:2041`) ⇒ w chwili
    wyboru aktywnej koloni **własność w pliku jeszcze nie istnieje**.
71. **Keeper `ai_capture_last_stand_smoke` mierzy migawkę, nie inwariant** — pinuje stan tuż po
    `transferColony` (`:81`, `:87`) i nie woła potem `switchActiveColony` ani serialize/restore.
    Żaden keeper w repo nie pinuje własności na `switchActiveColony`. **Obie luki są czystym
    `ColonyManager`, osiągalnym z `GameCore` — headless nie jest tu wymówką.**
72. 🔴 **Bramka kadłubowa S3.4d odwraca się na cudzej koloni** (`ColonyManager.js:1013`):
    `isPlayerColony(colony)` pyta o cel, nie o wydającego ⇒ na koloni obcej bramka jest pomijana
    ⇒ krążownik w stoczni naziemnej. **Zwolnienie AI z gatingu jest furtką dla gracza.**
73. 🔴 **Statek zbudowany na koloni wroga wychodzi jako statek GRACZA** —
    `VesselManager.createAndRegister` (`:186-211`) nie stempluje własności ⇒ `isEnemyVessel`
    (`Vessel.js:437-443`) = false, przy koszcie pobranym z magazynu wroga. **Jedyny kierunek
    transferu KU graczowi w całym zasięgu.**
74. **Predykat własności rozmnożony i niespójny** — 1 kanon (`ColonyManager.isPlayerColony:232`),
    4 nazwane kopie, 1 delegat, ~134 inline'owych porównań w ≥4 nierównoważnych kształtach
    (słabszy `!c.ownerEmpireId` w samym `ColonyManager`; wariant świadomy `isTestEnemy` tylko
    w `ColonyOverlay`).
75. **`GameScene.js:3287-3295` (`system:switched`) wybiera `cols[0]` z `getAllColonies()`
    filtrowanego tylko po `systemId`** — wbrew ostrzeżeniu przy samej metodzie
    (`ColonyManager.js:224-225`). Najtańsze wejście: **jedno kliknięcie układu**, bez karty ciała
    i bez zamykania overlayów.
76. **`BuildingSystem.deployFromCargo()` z `CLAUDE.md` NIE ISTNIEJE** —
    `grep -rn "deployFromCargo\|deploysBuilding" src/` → pusto; w pliku jedyne trafienie „deploy"
    to komentarz `:86`. Wpis w dokumentacji jest nieaktualny (⇒ Załącznik A przy najbliższym
    sprzątaniu).
77. **`EventLogOverlay.js:366` twierdzi w komentarzu „Kolonia gracza →", a kod testuje `if (colony)`**
    (`:348`) — deklaracja własności istnieje wyłącznie w dokumentacji.
78. **`_tickConstruction` kończy budowę poza guardem tożsamości** (`BuildingSystem.js:1422-1425`,
    napęd `:164`) ⇒ budynek zakolejkowany na cudzej koloni **dokończy się dla niej** po
    przełączeniu widoku.
79. **`ColonyOverlay` bramkuje pasek budowy na `isPreview`, nie na własności** (`:919`), a predykat
    własności stosuje w tym samym pliku 4× wyłącznie do chromu (`:1054`, `:1062`, `:1141`, `:1443`).
80. **Klasa C: ~10 case'ów `_onHit` mutuje OGLĄDANĄ kolonię bezpośrednio** (`:4791`, `:4811`,
    `:4966`, `:4993`, `:5021`, `:5033` …), **omijając guard `window.KOSMOS`** — działa w
    zaprojektowanym trybie oglądania obcej planety (desant `:339`, ostrzał `:269`, away team `:232`).

---

## Metoda, pewność, i czego NIE zmierzono

**Zmierzone w źródle** (odczyt + kontrprzebieg refutacyjny na każdym ustaleniu; zero refutacji,
~42 poprawki numerów linii wchłonięte do tego tekstu): wszystkie bramki i ich brak, pełny łańcuch
zapis→wczytanie (§6 dodatkowo zweryfikowany przeze mnie osobno), historia git, treść keeperów.

**Ustalone rozumowaniem, NIE dowodem:**
- **Której z czterech ścieżek §1 użył właściciel** — wszystkie dają identyczny stan końcowy.
  Ranking (**A** > **B** ≈ **C** > **D**) to argument behawioralny. Jedyny rozstrzygający ślad:
  linia `[EventLog] klik wpisu →` (`EventLogOverlay.js:350`) w konsoli tamtej sesji ⇒ jeśli jest,
  to **D**; jeśli nie ma — pozostają A/B/C.

**Świadomie NIE zmierzone:**
- Gra **nie była uruchamiana** (audyt read-only; ⚠ i tak nie wolno — zapis pliku przez CC
  przeładowuje kartę przez Live Server).
- **Nie audytowano wszystkich ~40 handlerów** `_onHit` w `ColonyOverlay` — klasa C jest
  **dolnym oszacowaniem**.
- Nie prześledzono, **które konkretnie wpisy Dziennika** mogą nieść `entityRef` koloni AI
  (wiele subskrypcji `UIManager` jest zawężonych przez `_isPlayerColonyEvent`, więc realna
  ekspozycja ścieżki **D** bywa węższa niż samo wywołanie).
- `src/testing/` przejrzano **tylko** pod kątem keeperów pinujących tę własność (§7).

**Zero zmian w kodzie produkcyjnym. Naprawa nie jest w tym dokumencie proponowana — czeka na
decyzję właściciela o zakresie (§8).**
