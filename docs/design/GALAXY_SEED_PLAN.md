# GALAXY_SEED — losowy seed galaktyki przy „Nowa gra" · plan doc (DRAFT do recenzji)

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

## Decyzje otwarte — wymagają Twojego podpisu

1. **Źródło entropii: `Math.random` czy `crypto.getRandomValues`?** To rozstrzyga R1. `Math.random`
   zachowuje sterowalność headless (jest patchowany w `env.js`); `crypto` **nie ma w repo żadnego
   precedensu** (grep: 0 trafień) i ucieka `reseed`. **Rekomendacja: `Math.random`** — sterowalność
   harnessu jest tu warta więcej niż jakość losowości, a to i tak tylko seed świata.
2. **Bump `CURRENT_VERSION` 100 → 101, czy udokumentowany wyjątek?** Format się nie zmienia (pole
   istnieje i round-trippuje), zmienia się źródło wartości. **Rekomendacja: BEZ bumpu**, z jawną notą
   w `SaveMigration` — bump kosztuje przejście przez `TitleScene` confirm, backup przedmigracyjny
   i dwa keepery, nie dając nic w zamian.
3. **Czy `GameCore.boot()` dostaje parametr seeda i jaki ma być default?** Reprodukowalność chce
   stałej, parytet z prawdziwą nową grą chce losowej. **Rekomendacja: parametr z domyślną wartością
   STAŁĄ w harnessie** (reprodukowalność wygrywa; parytet i tak jest niepełny, bo bot ≠ gracz).
4. **Czy seed ma być widoczny/wpisywalny dla gracza?** (pole „seed świata" przy nowej grze).
   **Rekomendacja: poza zakresem tego mini-streamu** — najpierw niech działa, potem ewentualnie UI.
5. **Pin G3: przepisać etykietę na „seed zapisów legacy" czy usunąć jako redundantny?**
   **Rekomendacja: przepisać** — to nadal żywy seed każdego istniejącego zapisu.
6. **Czy dwie ścieżki „istniejący save, ale `isNewGame`" (§Save R2) liczą się jako nowa gra?**
   **Rekomendacja: tak, ale z zapisem wyniku** — czyli dostają świeżą galaktykę RAZ, a potem jest
   ona stabilna. Alternatywa (wieczna stałość dla nich) wymagałaby dodatkowej gałęzi.
7. **Czy w ślad idą pozostałe stałe z licznika?** Po tym fixie gracz nadal dostanie **identyczną
   teksturę gwiazdy** (`ThreeRenderer.js:1245`), identyczne mapy hex (`PlanetMapGenerator.js:92`)
   i identyczne złoża (`DepositSystem.js:54-57`) w każdej nowej grze — bo one derywują z `entity_N`,
   nie z seeda galaktyki. **Rekomendacja: świadomie POZA zakresem**, ale odnotować jako osobny
   backlog — to decyzja o oczekiwaniach gracza, nie fakt techniczny.
