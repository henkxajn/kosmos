# GALAXY_SEED — losowy seed galaktyki przy „Nowa gra" · plan doc

**Status:** ✅ **G1 zaimplementowany (`e0615bd`) · G2 dokumentacja (ten commit) · G3 NIE biegnie**
(był warunkowy na bump wersji, a Decyzja 2 rozstrzygnęła na BRAK bumpu — zamiast tego jawna nota
wyjątku w `SaveMigration`, którą pokrywa G2). **Live gate: DO WYKONANIA** — 4 punkty niżej.
Nowy keeper: `src/testing/smoke/galaxy_seed_smoke.mjs` (65 asercji).

⚠ **Odchylenia od planu wykryte przy implementacji — patrz §Odchylenia na końcu.**

**Arc:** WOJNA I POKÓJ 1.0 · mini-stream **między D1 (✅) a implementacją D2**
**Podstawa:** audyt zakresowy (4 audytorów + 4 weryfikacje adwersarialne, workflow `w5jemv7ov`)
**Decyzja:** entropia wchodzi RAZ, przy tworzeniu świata; seed **zapisywany w save'ie**; wszystko
poniżej derywuje z ZAPISANEGO seeda. Kontrakt to *„deterministyczne PRZY DANYM seedzie"*, nie
*„identyczne między nowymi grami"*.

---

## Context

Live-gate D1 wykrył, że `objective` jest stały we wszystkich nowych grach. Fix `0b15d95` naprawił
degenerację samego rzutu, ale odsłonił przyczynę leżącą głębiej: `EntityManager.generateId()` to
licznik od 1, gwiazda gracza jest **pierwszą** mintowaną encją, więc `star.id === 'entity_1'`
w każdej nowej grze, a `galaxyData.seed = hashString('entity_1')` = **−2102099243**, zawsze.

---

## Stan faktyczny — z KOREKTAMI moich wcześniejszych twierdzeń

⚠ **Korekta 1 (ważna — sam to źle napisałem w `D1_AUTONOMOUS_REPORT` §9.2 i w master planie).**
Twierdziłem, że fix sprawi, iż **kolory** imperiów zaczną się różnić między partiami. **Nieprawda.**
Kolor pochodzi z ARCHETYPU, nie z seeda: `EmpireGenerator.js:160` bierze `AI_ARCHETYPE_SEQUENCE[i]`,
`:185-187` czyta `ARCHETYPES[archetypeId].color`, a id imperium `:182` jest z indeksu pętli.
**Losowy seed NIE zmieni ani kolorów, ani archetypów, ani id imperiów.** Zmieni: nazwy imperiów,
home-systemy AI, `objective`, oraz nazwy/pozycje/typy spektralne gwiazd w galaktyce.

⚠ **Korekta 2.** Układ macierzysty gracza **już dziś jest w pełni losowy** — `SystemGenerator` na
ścieżce nowej gry nie używa PRNG, tylko gołego `Math.random()` (81 wystąpień). Stała jest wyłącznie
**galaktyka wokół** niego. Gracz więc już teraz widzi inny dom w każdej partii; to maskowało defekt.

⚠ **Korekta 3.** Id układów **nie zmienią się nigdy** — `GalaxyGenerator.js:146` numeruje pozycyjnie
(`sys_000…sys_071`), a `SystemGenerator.js:819/:882` re-derywuje zawartość obcych układów z
`hashString(galaxyStar.id)`. Zawartość przesunie się tylko POŚREDNIO, bo `:829-833` czyta
`spectralType`/`mass`/`luminosity` z wpisu galaktyki. Liczba układów to zawsze **72** (sprawdzone
empirycznie na 500 losowych seedach — obalona teza, że inny seed może dać mniej).

**Fakty pozytywne, które upraszczają fix:**
- `galaxyData` (razem z polem `seed`) **JEST już serializowane w całości** —
  `SaveSystem.js:218` `galaxyData: window.KOSMOS.galaxyData ?? null,` (bez whitelisty pól), a
  `GameScene.js:1612` przypisuje je z powrotem **przez referencję, bez re-derywacji**.
  ⇒ **połowa „STORES it in the save" już istnieje.** Nie potrzeba nowego pola ani migracji.
- Obaj konsumenci seeda **czytają wartość zapisaną**: `EmpireGenerator.js:107`
  (`(galaxyData.seed ?? 0) ^ 0xEE01`) i `:154` (`makeObjectiveRng(galaxyData.seed)`).
  Tolerancja na brak seeda już jest.

---

## Promień rażenia

**Zmieniają się dokładnie trzy miejsca:**

| Plik:linia | Dziś | Po |
|---|---|---|
| `src/scenes/GameScene.js:1611-1613` | `?? GalaxyGenerator.generate(star.id, …)` — re-derywuje z licznika | mint seeda pod `isNewGame`, przekazanie go jawnie |
| `src/testing/headless/GameCore.js:224` | to samo, drugi punkt wejścia | jawny parametr seeda w `boot()` |
| `src/generators/GalaxyGenerator.js:74-76` | `generate(starId)` → `hashString(starId)` | przyjmuje jawny seed (kształt kontraktu = decyzja §Open 1) |

**NIE ruszamy** (czytają zapisane albo dostają jawny seed): `EmpireGenerator.js:107/:154` ·
`SaveSystem.js:218` · `SystemGenerator.js:819/:882` (świadoma re-derywacja z id, inwariant kolejności)
· `GalaxyGenerator.js:146` (id pozycyjne = kontrakt) · `EmpireRegistry.syncToGalaxyData` ·
wszystkie fixture'y testowe z jawnym `seed:` oraz te bez seeda (tolerowane przez `?? 0`).

---

## Save / migracja

- **Migracja mechanicznie NIEPOTRZEBNA** — `galaxyData` round-trippuje od zawsze. Jedyne wystąpienie
  w łańcuchu to no-op `SaveMigration.js:775-778`, którego **komentarz staje się fałszywy** po fixie
  („Brak galaxyData w starym save = generator odtworzy ze starego seed gwiazdy") — do poprawienia.
- **Bump `CURRENT_VERSION` 100 → 101: pytanie otwarte** (§Open 2). Protokół w CLAUDE.md nakazuje bump
  przy zmianie formatu; tu format się nie zmienia, zmienia się tylko ŹRÓDŁO wartości.
- **Istniejące save'y są bezpieczne domyślnie** — `??` w `:1613` odpala się wyłącznie przy braku
  `civ4x.galaxyData`, a `EmpireGenerator` biegnie tylko pod `if (isNewGame)`.

⚠ **Największa pułapka (R2).** Są **dwie ścieżki, na których `isNewGame === true` mimo ISTNIEJĄCEGO
save'a**: zapis spoza trybu 4X (`SaveSystem.js:158` zwraca `null` dla `civ4x`) oraz zapis sprzed v20
(`SaveMigration.js:784-788` zeruje `civ4x`). Dziś oba re-derywują z **odtworzonego** `star.id`, więc
ten sam plik daje tę samą galaktykę. Mint bez zapisu złamałby to: **ten sam plik, inna galaktyka przy
każdym wczytaniu.** ⇒ **mint wyłącznie pod `isNewGame`, wynik ZAWSZE z powrotem do `galaxyData`,
nigdy nie derywować przy odczycie.**

---

## Testy

- **Bezpieczne bez zmian:** złote piny G1 w `empire_objective_smoke.mjs:75-93` (jawne seedy
  12345/777/999999) — to jest wręcz **artefakt dowodzący, że kontrakt „deterministyczne przy danym
  seedzie" przeżył fix**. Nie ruszać. Tak samo G2, blok wariancji G3 (120 seedów), `seed: 4242`
  w `test-multi-ai-spawn`/`test-autoexpander-archetype`, wszystkie fixture'y z jawnym seedem.
- **Pin `hashString('entity_1')` (`empire_objective_smoke.mjs:142-151`) — NIE padnie** (asercja jest
  samowystarczalna arytmetycznie), ale **jej etykieta staje się kłamstwem** („realny (stały) seed nowej
  gry"). ⚠ Niuans: −2102099243 **pozostaje żywym seedem każdego ISTNIEJĄCEGO zapisu**, więc to nie
  jest przypadkowa liczba. **Rekomendacja: zachować asercję, przepisać etykietę na „seed zapisów
  legacy".**
- **Nowe:** `galaxy_seed_smoke` — mint tylko pod `isNewGame`; seed trafia do `galaxyData` i przeżywa
  round-trip; dwa różne seedy ⇒ różne nazwy gwiazd i różne home-systemy AI; ten sam seed ⇒ identyczna
  galaktyka; seed mieści się w int32; `sys_NNN` niezmienne; zawsze 72 układy.
- **Dokumenty do poprawienia w TYM SAMYM commicie** (inaczej wprowadzają w błąd):
  `D1_LIVE_GATE_CHECKLIST.md:268-272` („⚠ NIE oczekuj różnic MIĘDZY nowymi grami") i `:369-372`
  („nie zgłaszaj jako defekt") · `D1_AUTONOMOUS_REPORT.md` §9.2 (w tym moja błędna teza o kolorach) ·
  `SaveMigration.js:775-776` · `BALANS_PHASE2_AI.md:155/164/317-322` (zastrzeżenie „te same dwa
  home-systemy w każdym przebiegu" **odwraca się**) · `BALANS_PHASE3_EXP1_AI_POPS.md:99/147`.

---

## Commit plan

**G1 — jawny seed w kontrakcie generatora + mint w obu punktach wejścia + smoke.**
`GalaxyGenerator`, `GameScene`, `GameCore`, nowy `galaxy_seed_smoke`.
**G2 — aktualizacja dokumentów** (lista wyżej) + etykieta pinu G3.
**G3 (warunkowy) — bump `CURRENT_VERSION`**, jeśli §Open 2 tak rozstrzygnie.

## Live gate

1. Dwie świeże gry → **różne nazwy imperiów, różne home-systemy AI, różne `objective`**.
   ⚠ Kolory i archetypy **mają zostać te same** — to nie jest defekt (Korekta 1).
2. Zapis gry → wczytanie tego samego pliku → **identyczna galaktyka** (nazwy gwiazd, pozycje,
   home-systemy). Powtórne wczytanie → nadal identyczna.
3. Stary zapis sprzed fixu → galaktyka **niezmieniona**.
4. `KOSMOS.galaxyData.seed` widoczny w konsoli, mieści się w int32, jest inny w każdej nowej grze.

---

## Ryzyka (rankowane)

| # | Ryzyko | Mitygacja |
|---|---|---|
| **R1** | **Utrata reprodukowalności headless.** `env.js:34-36` patchuje TYLKO `Math.random`; `crypto`/`Date.now` mu uciekają. `GameCore.boot` ma `aiEmpires = !solo` ⇒ **domyślnie true**, więc seed konsumuje KAŻDY non-solo boot (BALANS, turniej botów). | Rozstrzyga §Open 1. Bezpieczny wariant: mint przez `Math.random` (objęty `KOSMOS_SEED`/`reseed`) **albo** jawny parametr seeda w `boot()` nadpisywany przez harness. |
| **R2** | Ten sam plik save daje inną galaktykę przy każdym wczytaniu (dwie ścieżki „istniejący save, ale `isNewGame`"). | Mint tylko pod `isNewGame`; wynik zawsze do `galaxyData`; zero derywacji przy odczycie. |
| **R3** | Przesunięcie baseline'ów BALANS — dziś 8 seedów dzieli JEDNĄ galaktykę i dwa home-systemy (`sys_040`/`sys_061`); zastrzeżenia w `BALANS_PHASE2_AI` się odwracają, a Ti-deadlock przestaje reprodukować się „sam z siebie". | Przypiąć stały seed galaktyki w panelach BALANS **jawnym argumentem** (nie przez przypadek) i odnotować w `BALANS_STATE.md`. |
| **R4** | Obcięcie do 32 bitów. `GalaxyGenerator.js:46` `seed \| 0`, `EmpireGenerator.js:107` `^ 0xEE01`. `Date.now()` po cichu zgubi górne bity. Dzisiejszy seed bywa **ujemny**. | Mintować jawnie 32-bitową liczbę; nie zakładać nieujemności. |
| **R5** | Nieaktualna dokumentacja myli testera (checklista wprost mówi „nie oczekuj różnic"). | G2 w tym samym PR-ze. |
| **R6** | Rozjazd oczekiwań: „nowa galaktyka" znaczy mniej, niż brzmi (Korekty 1-3). | Zapisane wprost w gate'cie punkt 1. |

---

## Wpływ na D2 — sprawdzone, BRAK kolizji

Pytanie z briefu: czy przechowywanie seeda dotyka schematu save'a blisko `verbCooldowns` z D2?
**Nie.** Seed mieszka w `civ4x.galaxyData` (poza `gameState`), a `verbCooldowns` miałby mieszkać
w `gameState.diplomacy.relations[para]`. Rozłączne poddrzewa, zero wspólnych ścieżek.

Jedyne sprzężenie jest **numeracyjne**: jeśli §Open 2 rozstrzygnie na bump (v100 → v101), to
ewentualny bump D2 staje się v102. Do odnotowania w `D2_PLAN`, nie zmienia żadnego założenia.

Efekt uboczny **korzystny dla D2**: po fixie rzut `traits: ['erratic']` (K-3 w `D2_PLAN`) wreszcie
różnicuje partie — dziś byłby stały tak samo jak `objective`.

---

## Decisions taken — wszystkie siedem PODPISANE

1. **Źródło entropii: `Math.random`.** Sterowalność harnessu wygrywa z jakością losowości — to i tak
   tylko seed świata, a `env.js:34-36` patchuje `Math.random`, więc `KOSMOS_SEED`/`reseed` dalej
   rządzą. `crypto.getRandomValues` odpada: **zero precedensu w repo** i ucieka `reseed`.
   ⇒ zamyka **R1** po stronie produkcyjnej.
2. **BEZ bumpu `CURRENT_VERSION`** (zostaje 100). Format się nie zmienia — pole `seed` istnieje
   i round-trippuje od zawsze; zmienia się wyłącznie ŹRÓDŁO jego wartości. **Wymóg:** jawna nota
   wyjątku w `SaveMigration` obok no-opa `:775-778`, którego komentarz i tak trzeba poprawić.
3. **`GameCore.boot(seed)` z parametrem, default STAŁY w harnessie.** Dodatkowo **panele BALANS
   pinują seed galaktyki JAWNYM argumentem** — to jedno pociągnięcie zamyka **R1 i R3 razem**:
   headless zostaje reprodukowalny, a baseline'y AI przestają zależeć od przypadku.
   **Wymóg:** odnotować pin w `docs/BALANS_STATE.md`.
4. **Widoczny/wpisywalny seed dla gracza — POZA zakresem**, na backlog. Najpierw niech działa.
5. **Pin G3 (`empire_objective_smoke.mjs:142-151`): przepisać etykietę na „seed zapisów legacy",
   asercję ZACHOWAĆ.** −2102099243 pozostaje żywym seedem każdego istniejącego zapisu, więc to nie
   jest przypadkowa liczba spośród 120.
6. **Dwie ścieżki „istniejący save, ale `isNewGame`" (zapis spoza trybu 4X, zapis sprzed v20):
   mint RAZ, wynik utrwalony, potem stabilnie.** Czyli taki plik dostaje świeżą galaktykę przy
   pierwszym wczytaniu po fixie i od tego momentu jest już powtarzalny. To jest bezpośrednia
   mitygacja **R2** — bez utrwalenia ten sam plik dawałby inną galaktykę za każdym razem.
7. **Pozostałe stałe z licznika — POZA zakresem**, zapisane jako backlog „różnorodność świata"
   (master plan, sekcja Deferred). ⚠ Z trzech pozycji **złoża mają realny wpływ na rozgrywkę**:
   `DepositSystem.js:54-57` derywuje z `entity.id`, więc **każda nowa gra startuje z identyczną
   ekonomią**. Tekstura gwiazdy (`ThreeRenderer.js:1245`) i mapy hex (`PlanetMapGenerator.js:92`) to
   kosmetyka. Kandydat do sparowania z przyszłą reformą mapy 2D.

**Nota do E6 w D2** (zapisana, decyzja zapada tam): rozjazd ~12× między liczbą w UI („zanika za 5 l.")
a czasem odczuwalnym (0,42 roku wyświetlanego) wchodzi na stół razem z tabelą bazową — wybór między
podroczną precyzją w UI a świadomym zwolnieniem decayu podejmujemy w E6, na liczbach.

---

## Odchylenia od planu — wykryte przy implementacji G1

Zapisane, bo plan twierdził inaczej i następny czytelnik miałby prawo mu zaufać.

**1. „Zmieniają się dokładnie trzy miejsca" — było ich sześć.** Tabela §Promień rażenia pominęła
`src/testing/headless/test-cross-system-integration.mjs:46`, które woła generator z `'sys_home'`
(przepięte na `1956783889` = `hashString('sys_home')`, czyli ten sam seed → asercje bez zmian), oraz
gitignorowany scratch `tmp_obs_stratcom_scan_smoke.mjs` w rootcie (poprawiony w drzewie roboczym, ale
**nieśledzony przez gita** — świeży klon dalej ma tam stare wywołanie i ta suita by rzuciła).
Dodatkowo Decyzja 3 („panele BALANS pinują seed JAWNYM argumentem") wymagała pinu w **trzech**
wejściach, nie w jednym: `SingleGame.js` (boty), `balans-driver.mjs` i `balans-gate2-report.mjs`
(dwa realne panele BALANS bootują `GameCore` bezpośrednio, z pominięciem `SingleGame`).

**2. Decyzja 6 jest w praktyce WĘŻSZA, niż brzmi.** Zapisano: „mint RAZ, wynik utrwalony, potem
stabilnie". Utrwalenie zależy jednak od `civMode`, bo `galaxyData` mieszka WEWNĄTRZ bloku `civ4x`,
a `SaveSystem._serializeCiv4x()` zwraca `null` przy `civMode === false` (`SaveSystem.js:158`).
Skutek dla dwóch wymienionych ścieżek (zapis sprzed v20; zapis spoza trybu 4X): **dopóki gracz nie
wejdzie w tryb 4X, taki plik mintuje świeżą galaktykę przy KAŻDYM wczytaniu** — wcześniej dostawał
zawsze tę samą, bo derywowaną ze stałego `star.id`. Od wejścia w 4X pierwszy zapis utrwala seed
i plik jest już powtarzalny.
Łagodzące: galaktyka i imperia (`gameState`) siedzą w tym samym bloku `civ4x`, więc regenerują się
**razem** — nie ma stanu „stare imperia, nowa mapa"; a poza trybem 4X galaktyka nie jest dla gracza
widoczna (STRATCOM/dyplomacja to UI 4X). Normalna nowa gra scenariusza `civilization` kolonizuje
automatycznie w `start()`, więc `civMode` jest `true` przed pierwszym autozapisem — **ścieżka główna
jest w pełni domknięta.**
Domknięcie reszty = przeniesienie `galaxyData` poza bramkę `civMode`, czyli **zmiana formatu zapisu**,
czyli ponowne otwarcie Decyzji 2 (brak bumpu). Świadomie **poza zakresem G1/G2** — do rozstrzygnięcia
przez gracza. Ograniczenie jest udokumentowane w komentarzu `GameScene` i **spinowane asercją**
w `galaxy_seed_smoke` (T9), więc nie jest cichym założeniem: gdy pin padnie, znaczy to, że
ograniczenie zniknęło i trzeba zaktualizować ten akapit.
