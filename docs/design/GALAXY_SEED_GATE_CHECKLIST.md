# GALAXY_SEED — live gate · skrypt jednej sesji

**Arc:** WOJNA I POKÓJ 1.0 · mini-stream **GALAXY_SEED** (między D1 ✅ a implementacją D2)
**Commity:** `e0615bd` (G1 — kod) → `615eb63` (G2 — dokumenty) · **G3 nie biegł** (Decyzja 2: brak bumpu)
**Plan i siedem podpisanych decyzji:** `docs/design/GALAXY_SEED_PLAN.md`

Cztery punkty, jeden przebieg, ~15 min. Sedno: **nowa gra losuje seed galaktyki i utrwala go
w zapisie**. Kontrakt brzmi „deterministyczne PRZY DANYM seedzie", **nie** „identyczne między nowymi
grami" — i **nie** „wszystko się zmienia" (patrz §5).

### ⚠ DWA RÓŻNE MIEJSCA WKLEJANIA — nie pomyl ich

| znacznik | gdzie | jak rozpoznać |
|---|---|---|
| **`>_ TERMINAL`** | PowerShell / Git Bash w katalogu repo | polecenie zaczyna się od **`node`**, `git` |
| **`>< KONSOLA`** | DevTools przeglądarki (F12 → Console) | polecenie odwołuje się do **`KOSMOS.`** |

> **Zanim wkleisz cokolwiek do konsoli Chrome:** przy pierwszej wklejce DevTools żąda wpisania
> `allow pasting` i zatwierdzenia Enterem. Zrób to raz na początku sesji.

**pogrubione** = wartość oczekiwana.

---

## ⚠ Który zapis wziąć do §3 — i którego NIE brać

- ✅ **BIERZ:** dowolny zapis zrobiony **w trybie 4X** (masz kolonię, działa panel kolonii / STRATCOM),
  w wersji **v100 lub starszej**. To jest ścieżka, której broni gate: galaktyka w takim pliku ma
  utrwalony seed i **nie wolno jej się zmienić** przy wczytaniu.
- ❌ **NIE BIERZ:** zapisu **sprzed wejścia w tryb 4X** (czysta symulacja, brak kolonii) ani zapisu
  **sprzed v20**. W obu `civ4x` jest `null`, więc plik nie niesie żadnej galaktyki i przy każdym
  wczytaniu dostaje świeżą. **To jest znane i ZAAKCEPTOWANE zachowanie**, nie defekt — takie zapisy
  nie mają jeszcze galaktyki widocznej dla gracza, więc nie ma czego zepsuć (rozstrzygnięcie
  Decyzji 6, `GALAXY_SEED_PLAN` §Odchylenia). **Poza zakresem tego gate'u — nie zgłaszaj.**

---

## §0 — Jedno polecenie, którego użyjesz wszędzie (`>< KONSOLA`)

Wkleisz je **pięć razy** w trakcie gate'u i będziesz porównywał wyniki. Drukuje seed, **ODCISK**
(skrót całej galaktyki do jednej liczby — łatwiej porównać niż 72 wiersze) oraz tabelę imperiów.

```
const g=KOSMOS.galaxyData; const fp=JSON.stringify((g?.systems ?? []).map(s=>[s.id,s.name,s.x,s.y,s.z,s.spectralType])); let h=0; for(let i=0;i<fp.length;i++) h=((h<<5)-h+fp.charCodeAt(i))|0; console.log('seed:', g?.seed, '| int32:', (g?.seed|0)===g?.seed, '| ODCISK:', h, '| ukladow:', g?.systems?.length); console.table((KOSMOS.empireRegistry?.listAll?.() ?? []).map(e=>({id:e.id, nazwa:e.name, archetyp:e.archetype, kolor:e.color, home:e.homeSystemId, objective:e.objective})));
```

- [ ] Otwórz konsolę (**F12**) i zatwierdź `allow pasting`.
- [ ] Przygotuj notatnik — będziesz zapisywał `seed` i `ODCISK` z każdego kroku.

---

## §1 — Punkt 1 + 4: dwie świeże gry dają RÓŻNE galaktyki (5 min)

- [ ] Menu → **`NOWA GRA`**. Po wejściu do gry wklej polecenie z §0.
      Zanotuj: seed **A** = ____________  ODCISK **A** = ____________
- [ ] W konsoli widać też log z wczytania: **`[GALAXY_SEED] Nowa galaktyka — seed <liczba>`**
      (ta sama liczba co `seed:` wyżej)
- [ ] `int32:` → **true** · `ukladow:` → **72**
- [ ] Odśwież stronę (**F5**) → menu → **`NOWA GRA`** drugi raz → wklej polecenie z §0.
      Zanotuj: seed **B** = ____________  ODCISK **B** = ____________

**Porównaj A z B:**

- [ ] seed A **≠** seed B  ← *sedno całej zmiany*
- [ ] ODCISK A **≠** ODCISK B (inne nazwy/pozycje/typy gwiazd)
- [ ] W tabeli imperiów **`nazwa`** RÓŻNI SIĘ między A i B
- [ ] **`home`** (home-system AI) RÓŻNI SIĘ między A i B
- [ ] **`objective`** RÓŻNI SIĘ między A i B (kolizja 1 na 6 bywa — jeśli trafisz tę samą parę,
      zrób trzecią nową grę; nie zgłaszaj po jednym trafieniu)
- [ ] ⚠ **`kolor` i `archetyp` są IDENTYCZNE w A i B — TAK MA BYĆ, patrz §5.**
      Oczekiwane zawsze: `emp_001` **industrialist / #B07020**, `emp_002` **expansionist / #2E9B8F**

---

## §2 — Punkt 2: zapis → wczytanie → galaktyka IDENTYCZNA (5 min)

Robisz to na grze **B** z §1 (albo dowolnej świeżej — byle w trybie 4X).

- [ ] Menu ☰ → **`ZAPISZ DO PLIKU`** → zapamiętaj ścieżkę: ____________________________
- [ ] `>_ TERMINAL` — sprawdź, że seed FIZYCZNIE jest w pliku:
      ```
      node -e "const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); const g=d.civ4x?.galaxyData; console.log('wersja:', d.version, '| seed w pliku:', g?.seed, '| ukladow:', g?.systems?.length);" "PELNA/SCIEZKA/DO/save.json"
      ```
      → `wersja:` **100** · `seed w pliku:` **= seed B z §1** · `ukladow:` **72**
- [ ] **F5** → menu → **`WCZYTAJ Z PLIKU`** → ten sam plik → wklej polecenie z §0
      → seed **= B** · ODCISK **= ODCISK B**
- [ ] **Powtórz wczytanie jeszcze raz** (F5 → `WCZYTAJ Z PLIKU` → ten sam plik) → wklej §0
      → seed i ODCISK **nadal takie same**  ← *to jest test R2: ten sam plik NIGDY nie daje innej galaktyki*
- [ ] W konsoli przy wczytaniu **NIE MA** logu `[GALAXY_SEED] Nowa galaktyka` (generator nie był wołany)

---

## §3 — Punkt 3: STARY zapis sprzed fixu — galaktyka NIEZMIENIONA (3 min)

Weź plik wg reguły z sekcji „Który zapis wziąć" na górze (**zapis w trybie 4X**, v100 lub starszy).

- [ ] `>_ TERMINAL` — odczyt „przed" WPROST Z PLIKU, zanim gra wystartuje:
      ```
      node -e "const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); const g=d.civ4x?.galaxyData; const fp=JSON.stringify((g?.systems ?? []).map(s=>[s.id,s.name,s.x,s.y,s.z,s.spectralType])); let h=0; for(let i=0;i<fp.length;i++) h=((h<<5)-h+fp.charCodeAt(i))|0; console.log('wersja:', d.version, '| seed:', g?.seed, '| ODCISK:', h, '| ukladow:', g?.systems?.length);" "PELNA/SCIEZKA/DO/stary_save.json"
      ```
      Zanotuj: seed **C** = ____________  ODCISK **C** = ____________
      ℹ Jeśli plik pochodzi sprzed `e0615bd`, seed C będzie **−2102099243** — to była wtedy JEDYNA
      możliwa wartość (stały seed każdej nowej gry). Nowsze pliki mają liczbę losową. Obie są OK.
- [ ] **`WCZYTAJ Z PLIKU`** → ten plik → wklej polecenie z §0
      → seed **= C** · ODCISK **= C**  ← *twardy warunek: galaktyka gracza NIE MOŻE się zmienić*
- [ ] Nazwy gwiazd i home-systemy AI wyglądają jak przed aktualizacją (jeśli pamiętasz tę partię)
- [ ] Brak logu `[GALAXY_SEED] Nowa galaktyka` przy wczytaniu

---

## §4 — Harness (2 min, `>_ TERMINAL` — wszystko poniżej)

- [ ] `node src/testing/smoke/run-all.mjs` → **`104/104 OK, 0 FAIL`**
- [ ] `node src/testing/smoke/galaxy_seed_smoke.mjs` → **`65 PASS / 0 FAIL`**
- [ ] `node src/testing/smoke/empire_objective_smoke.mjs` → **`26 PASS / 0 FAIL`**
      (w wyniku wiersz **`seed zapisów legacy -2102099243`** — etykieta po Decyzji 5)
- [ ] `node tools/check-i18n.mjs` → **`WYNIK: PASS`**

---

## §5 — Świadome NIE-defekty (potwierdź, że je widzisz i akceptujesz)

To NIE są błędy. Gate polega na tym, żeby je zobaczyć i **nie zgłosić**.

- [ ] ⚠ **Kolory i archetypy imperiów są IDENTYCZNE w każdej nowej grze.** Kolor bierze się
      z ARCHETYPU, a archetyp z indeksu pętli — **żadne nie pochodzi z seeda**, więc losowy seed nie
      mógł ich zmienić (Korekta 1 w `GALAXY_SEED_PLAN`). Zawsze: `emp_001` industrialist `#B07020`,
      `emp_002` expansionist `#2E9B8F`.
- [ ] **Id są pozycyjne i stałe:** `emp_001`/`emp_002` oraz `sys_home`, `sys_001` … `sys_071`.
      Zmienia się ZAWARTOŚĆ pozycji (nazwa, pozycja, typ gwiazdy), nie zbiór identyfikatorów.
- [ ] **Zawsze dokładnie 72 układy** — liczba nie zależy od seeda.
- [ ] **Układ macierzysty gracza był losowy już wcześniej** (`SystemGenerator` używa gołego
      `Math.random`). Stała była wyłącznie galaktyka WOKÓŁ niego — dlatego nikt tego nie zauważył.
- [ ] **Zapisy sprzed 4X / sprzed v20 dostają świeżą galaktykę przy każdym wczytaniu** — zaakceptowane,
      poza zakresem gate'u (patrz sekcja „Który zapis wziąć" na górze).
- [ ] **Baseline'y BALANS się NIE ruszyły** — harness nigdy nie losuje, pinuje stałą
      `HEADLESS_GALAXY_SEED` (= dawny seed), więc AI dalej startuje w `sys_061` / `sys_040`.

---

## Wynik gate'u

- [ ] **§1 PASS** — dwie nowe gry ⇒ różne seed / ODCISK / nazwy / home-systemy / objective
- [ ] **§2 PASS** — ten sam plik ⇒ ta sama galaktyka, dwa wczytania z rzędu
- [ ] **§3 PASS** — stary zapis ⇒ galaktyka niezmieniona
- [ ] **§4 PASS** — harness zielony
- [ ] **§5** — przejrzane i zaakceptowane

**Gdy wszystko PASS:** GALAXY_SEED zamknięty, **D2 (Acceptance Engine) odblokowany** —
kolejna świeża sesja bootstrapuje D2 E1 z dokumentów w repo.

**Gdy coś FAIL:** zanotuj punkt, seed i ODCISK z obu porównywanych kroków oraz treść konsoli.
Świeża sesja naprawcza; `GALAXY_SEED_PLAN` §Ryzyka R1-R6 mapuje objaw na prawdopodobną przyczynę.

---

## ✅ WYNIK — przebieg 2026-08-07: **PASS (4/4)**

| punkt | wynik | dowód |
|---|---|---|
| §1 — dwie świeże gry ⇒ różne galaktyki | **PASS** | seed **A = −1652911923**, seed **B = 131797258**; różne ODCISK-i, różne nazwy imperiów, różne home-systemy AI, różne `objective` |
| §2 — zapis → wczytanie ⇒ galaktyka identyczna | **PASS** | ten sam plik wczytany ponownie ⇒ seed i ODCISK bit-w-bit identyczne |
| §3 — stary zapis ⇒ galaktyka niezmieniona | **PASS** | zapis legacy zachował seed **−2102099243** |
| §4 — harness zielony | **PASS** | sweep + `galaxy_seed_smoke` + `empire_objective_smoke` + `check-i18n` |
| §5 — świadome NIE-defekty | **przejrzane i zaakceptowane** | kolory i archetypy identyczne w A i B — zgodnie z projektem (Korekta 1) |

**Skutek:** mini-stream **GALAXY_SEED ZAMKNIĘTY**; pozycja w sekwencji arca przechodzi na **D2**.
