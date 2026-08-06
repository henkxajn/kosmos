# D1 — live gate · skrypt jednej sesji (workflow PLIKOWY)

**Arc:** WOJNA I POKÓJ 1.0, faza D1 · **Commity:** `ae223c7` (C1) → `78c94f1` (C2) → `36af8cf` (C3) →
`48cf431` (C4) → `5cd6f47` (C5) → `70a3a16` (stub) · **Raport:** `docs/design/D1_AUTONOMOUS_REPORT.md`

Jeden przebieg pokrywa wszystkie pięć etapów. Zapisy żyją jako **pliki `.json`** — localStorage trzyma
tylko ustawienia i klucze pomocnicze. Kolejność jest istotna: **§0 czyta liczby „przed" WPROST Z PLIKU,
zanim gra wystartuje** (import nadpisuje slot i uruchamia migrację, więc potem nie ma z czym porównywać).

### ⚠ DWA RÓŻNE MIEJSCA WKLEJANIA — nie pomyl ich

| znacznik | gdzie | jak rozpoznać |
|---|---|---|
| **`>_ TERMINAL`** | PowerShell / Git Bash w katalogu repo | polecenie zaczyna się od **`node`**, `npm`, `grep`, `git` |
| **`>< KONSOLA`** | DevTools przeglądarki (F12 → Console) | polecenie odwołuje się do **`KOSMOS.`** albo `localStorage` |

`node -e "..."` **nigdy** nie działa w konsoli przeglądarki (nie ma tam `require`) —
a `KOSMOS.…` nigdy w terminalu. Każdy blok poniżej jest oznaczony.

> **Zanim wkleisz cokolwiek do konsoli Chrome:** przy pierwszej wklejce DevTools żąda wpisania
> `allow pasting` i zatwierdzenia Enterem. Zrób to raz na początku sesji.
>
> Wszystkie jednolinijkowce używają **prostych apostrofów ASCII** i optional chaining
> (`?.` / `??`), więc są odporne na brakujące pola i bezpieczne do skopiowania jeden do jednego.

**pogrubione** = wartość oczekiwana.

### ⚠ Jednostki czasu — czytaj uważnie w §1.3 i §1.5

Dyplomacja MIESZA dziś dwie jednostki (świadomie zachowane z czasów przed D1):

| stała | jednostka | przelicznik |
|---|---|---|
| `truceUntilYear` (rozejm 10 lat), `PEACE_QUIET_YEARS` (2), `ULTIMATUM_GRACE_YEARS` (3) | **lata WYŚWIETLANE** (`gameTime`) | — |
| `PEACE_DECAY` (−5), `decayPerYear` modyfikatorów opinii | **lata CYWILIZACYJNE** | 1 rok wyświetlany = **12 lat cyw.** (`CIV_TIME_SCALE`) |

Ujednolicenie do lat wyświetlanych + przestrojenie wartości = **decyzja na D2**
(`D2_PLAN_SKELETON` §5a). D1 celowo NIE zmieniał zachowania sprzed D1.

---

## §0 — Wybór pliku i odczyt liczb „przed" (5 min, PRZED uruchomieniem gry)

**Wybór zapisu.** Weź plik `.json` w wersji **niższej niż 100** (sprzed D1) — v92, v95, v99, cokolwiek
w zakresie wspieranym (≥ v4). Migracja wykona **KASKADĘ** przez wszystkie brakujące kroki i skończy na
v100; kopia przedmigracyjna oraz okno potwierdzenia niosą wersję **ŹRÓDŁOWĄ** (np. v92), nie docelową.
⚠ **Wybierz zapis z realnym życiem
dyplomatycznym**: co najmniej jeden aktywny traktat, niezerowe `hostility`, najlepiej trwającą wojnę
albo rozejm. Zapis, w którym wszystkie relacje mają `trust: 50`, `hostility: 0`, `state: 'peace'`
i puste traktaty, **niczego nie udowodni w §1.2** — parytet 50→0 wypada poprawnie nawet gdyby migracja
gubiła dane.

- [ ] Mam plik < v100 z traktatem i niezerowym napieciem (ideal: wojna lub rozejm w toku).
      Ścieżka: ________________________________________________
- [ ] **Ten plik JEST kopią zapasową.** Import go nie modyfikuje (czyta tylko treść), więc nie trzeba
      nic dodatkowo archiwizować. Nie nadpisuj go do końca gate'u.

**Odczyt liczb „przed" — `>_ TERMINAL`** (najpewniejsza droga; NIE wklejaj tego w przeglądarkę):

```
node -e "const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log('wersja:', d.version, '| rok gry:', d.gameTime); const R=d.civ4x?.gameState?.diplomacy?.relations ?? {}; console.log('relacji:', Object.keys(R).length); console.table(Object.entries(R).map(([k,r]) => ({ klucz:k, trust:r?.trust, hostility:r?.hostility, state:r?.state, traktaty:(r?.treaties ?? []).map(t=>t?.id).join(','), pamiec:(r?.lastIncidents ?? []).length })));" "PELNA/SCIEZKA/DO/save.json"
```

- [ ] `wersja:` → **< 100** (jeśli już 100 — ten plik jest zmigrowany, weź inny).
      ZANOTUJ tę liczbę: to wersja źródłowa, która pojawi się w §1.0 w oknie potwierdzenia
      i w nazwie pobranej kopii.
- [ ] `relacji:` → **≥ 1**, klucze w formacie **`player_emp_001`**
- [ ] **ZAPISZ wydrukowaną tabelę** (zrzut ekranu albo wklej do notatki) — §1.2 porównuje do niej.
- [ ] Sprawdz tez rok gry — przyda sie w §1.5 (`truceUntilYear` = rok + 10 lat WYSWIETLANYCH).

*Gdyby PowerShell psuł cytowanie: odpal tę samą komendę w Git Bash.*

**Fallback `>< KONSOLA`** (jeśli wolisz nie używać terminala) — na ekranie tytułowym, jedną linią:

```
const [fh] = await showOpenFilePicker(); const d = JSON.parse(await (await fh.getFile()).text()); console.log('wersja:', d.version, '| rok gry:', d.gameTime); const R = d.civ4x?.gameState?.diplomacy?.relations ?? {}; console.table(Object.entries(R).map(([k,r]) => ({ klucz:k, trust:r?.trust, hostility:r?.hostility, state:r?.state, traktaty:(r?.treaties ?? []).map(t=>t?.id).join(','), pamiec:(r?.lastIncidents ?? []).length })));
```

To tylko CZYTA plik (nie importuje), więc można je odpalić bezpiecznie przed gate'em.

- [ ] Ustaw okno przeglądarki na **1280×720** (§3 sprawdza budżet pionowy panelu przy tej wysokości).

---

## §1 — C2: wymiana modelu na PRAWDZIWYM zapisie sprzed D1 (najwazniejsza czesc)

### 1.0 — import i migracja: jedno kliknięcie, dwie fazy

Faktyczny przepływ w kodzie (`TitleScene._loadFromFile` → `SaveSystem.importSave` →
`_handleChoice('continue')` → `_prepareContinue` → **confirm kopii** → `migrate`):

1. **`WCZYTAJ Z PLIKU`** w menu ekranu tytułowego (EN: `LOAD FROM FILE`) → otwiera się **systemowy
   dialog wyboru pliku**.
2. Po wybraniu pliku `importSave` sprawdza wersje (musi byc w zakresie v4-v100) i **wpisuje surowy blob
   do slotu** — jeszcze BEZ migracji.
3. Natychmiast, automatycznie, gra przechodzi w „kontynuuj". Ponieważ zapis jest w starszej wersji,
   **najpierw pojawia się okno z propozycją kopii przedmigracyjnej**, a dopiero po nim rusza migracja.
   Nie ma osobnego kliknięcia „Kontynuuj" — wszystko dzieje się po zamknięciu dialogu wyboru pliku.

- [ ] Otwórz konsolę (F12) **przed** kliknięciem, żeby złapać logi.
- [ ] Kliknij **`WCZYTAJ Z PLIKU`** → wybierz plik z §0.
- [ ] Pojawia się **okno potwierdzenia**: *„Ten zapis jest w wersji v‹ŹRÓDŁOWA› i zostanie zmigrowany
      do v100. Migracja jest jednokierunkowa — nie da się wrócić do v‹ŹRÓDŁOWA›. Zapisać kopię pliku
      PRZED migracją?"* → kliknij **OK**
- [ ] Przeglądarka pobiera plik o nazwie w formacie
      **`kosmos_<Nazwa_Cywilizacji>_r<rok>_v‹ŹRÓDŁOWA›_przed_migracja.json`**
      (bez nazwy cywilizacji, np. w scenariuszu generatora: `kosmos_r<rok>_v‹ŹRÓDŁOWA›_przed_migracja.json`)
- [ ] `>_ TERMINAL` — sprawdź pobrany plik:
      `node -e "const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log('wersja:', d.version, '| relacji:', Object.keys(d.civ4x?.gameState?.diplomacy?.relations ?? {}).length);" "SCIEZKA/DO/POBRANEGO/pliku.json"`
      → **wersja ŹRÓDŁOWA** (ta z §0, nie 100) i **ta sama liczba relacji** co w §0
- [ ] W konsoli, w tej kolejności:
      → **`[SaveMigration] Backup save v‹ŹRÓDŁOWA› → kosmos_save_backup_v‹ŹRÓDŁOWA›`**
        *(może się NIE pojawić przy ciasnej quocie — patrz §1.7, to nie jest błąd)*
      → **KASKADA** kolejnych kroków: `[SaveMigration] Migracja v92 → v93...`,
        `… v93 → v94...`, … aż do **`… v99 → v100...`**
        (przy zapisie v99 kaskada ma dokładnie jeden krok)
      → *(warunkowo, tylko gdy któraś relacja miała trust dokładnie 0 lub 100)*
        **`[SaveMigration v100] N relacji miało trust na krańcu…`** — to informacja, nie błąd
      → **`[SaveMigration] Save zmigrowany v‹ŹRÓDŁOWA› → v100`**
      *(może też pojawić się `[SaveMigration] Usunięto N backup(ów) migracji` — sprzątanie starych kopii)*
- [ ] Gra wchodzi w rozgrywkę, **konsola bez czerwonych błędów** (ostrzeżenia z innych systemów OK).
- [ ] ⚠ Gdyby wyskoczył `alert` z komunikatem o migracji → **STOP, zgłoś treść**. To ścieżka błędu,
      która czyści slot; plik `.json` jest nietknięty, więc nic nie przepadło.

### 1.1 — klucze i kształt danych

- [ ] `Object.keys(KOSMOS.gameState.get('diplomacy.relations'))`
      → **wyłącznie klucze z `__`**, np. `['emp_001__player','emp_002__player']`; **zero `player_*`**
- [ ] `KOSMOS.gameState.get('diplomacy.reputation')`
      → wpis **`player`** ORAZ wpis na każde imperium, każdy **`{aggression: 0, decayPerYear: 1}`**
- [ ] `Object.keys(Object.values(KOSMOS.gameState.get('diplomacy.relations'))[0])`
      → są: `a`,`b`,`opinionModifiers`,`tension`,`status`,`truceUntilYear`,`bordersOpen`,`treaties`,`memory`,`ultimatumStartYear`
      → **NIE MA**: `trust`, `hostility`, `state`, `lastIncidents`, `lastChangeYear`, `warStartYear`

### 1.2 — PARYTET względem tabeli z §0 (dla KAŻDEGO imperium z tabeli)

- [ ] `KOSMOS.debug.dumpRelation('emp_001')`
      → `opinia` = **`trust − 50`** z §0 · `trustEqD2` = **dokładnie `trust`** z §0 ·
        `napiecie` = **`hostility`** z §0 · `status` = **`state`** z §0 ·
        `traktaty` = **ta sama lista** co w §0
- [ ] Powtórz dla pozostałych imperiów z tabeli → **te same zależności**
- [ ] Liczba wierszy w drugiej tabeli (`pamięć`) = kolumna **`pamiec`** z §0 (cap 20)
- [ ] Panel dyplomacji (klawisz **D**): traktaty, pasek napięcia i stan **zgodne z tabelą z §0**

### 1.3 — drabina eskalacji 40/60/80 (bez zmian względem stanu przed D1)

⚠ **Wybierz imperium ZNANE** (intel ≥ rumor, widoczne na liście w panelu) i **nie w stanie wojny**.
Sprawdź, którym imperium możesz operować: `>< KONSOLA`
`KOSMOS.diplomacySystem.listVisiblePlayerRelations().map(r => [r.empireId, r.status, r.tension])`
— panel pokazuje TYLKO te (fog-of-war). Konsola działa na każdym id, ale wtedy nie zobaczysz efektu w UI.

⚠ Jeśli wybrane imperium ma **pakt o nieagresji**, próg 80 **NIE** wywoła wojny — to poprawne
(`declareWar` odrzuca powody inne niż `player_action`, gdy pakt aktywny; tak samo było przed D1).
Wtedy albo weź inne imperium, albo najpierw `d.breakTreaty(E,'non_aggression')`.

`>< KONSOLA`, po kolei. Pierwszy krok zeruje napięcie, żeby progi trafiały deterministycznie.

- [ ] `const d = KOSMOS.diplomacySystem, E = 'emp_001'; d.changeTension(E, -100, 'gate'); d.getTension(E)`
      → **0**
- [ ] `d.changeTension(E, 40, 'gate'); d.getTension(E)`
      → **40**
      *(NIE oczekuj wpisu w Dzienniku — `diplomacy:warning` nie ma ani jednego subskrybenta,
      dokładnie tak jak przed D1. Liczby SĄ testem. Subskrybent dojdzie w D2+.)*
- [ ] `d.changeTension(E, 20, 'gate'); d.getTension(E)`
      → **60**, panel pokazuje **`⚠ ULTIMATUM — 3.0 lat do wojny`** (lata WYŚWIETLANE)
- [ ] `d.changeTension(E, 20, 'gate'); d.getStatus(E)`
      → **`'war'`** — napięcie 80 wywołało AUTOMATYCZNĄ wojnę + auto-slow do 1 dzień/s
      (chyba że pakt — patrz uwaga wyżej)

### 1.4 — kumulacja modyfikatorów (parytet ze starym trustem)

⚠ Użyj **drugiego ZNANEGO** imperium w pokoju (sprawdź listą z §1.3 — imperium o intelu poniżej
`rumor` NIE pojawi się w panelu, choć konsola będzie działać; w zapisie Filipa `emp_002` był nieznany).
Poniżej `E2` oznacza to imperium.

- [ ] `>< KONSOLA` `KOSMOS.debug.simulateVesselArrival(E2,'weapons')` — **trzy razy pod rząd**
      → log `opinia X → Y` schodzi **−5 za każdym razem, razem −15** (nie „−5 i sufit")
- [ ] `KOSMOS.diplomacySystem.addOpinionModifier(E2,'player','envoy_goodwill',{source:'gate'})` — **dwa razy**
      → **razem +10** (odpowiednik dotarcia + powrotu emisariusza)
- [ ] `KOSMOS.debug.dumpRelation(E2)` → w tabeli rozbicia **`Obecność wojskowa −15`**
      i **`Nasi emisariusze +10`** jako **POJEDYNCZE wiersze** (nie po jednym na zdarzenie)

### 1.5 — wojna → rozejm → pokój (naprawa audytu R7 — jedyna widoczna zmiana zachowania)

- [ ] `KOSMOS.diplomacySystem.declareWar(E2,'player_action')`
      → **wszystkie traktaty zerwane**, `status: 'war'`, w rozbiciu **`Stan wojny −40` z `∞`**
- [ ] `KOSMOS.diplomacySystem.offerPeace(E2,'player_action'); KOSMOS.diplomacySystem.getTruceYearsLeft(E2)`
      → **10**; chip w panelu **`[ROZEJM — 10 lat]`**; `Stan wojny` **znika**,
        pojawia się **`Świeża pamięć wojny −15`**
- [ ] ⚠ Zwróć uwagę: drugie wywołanie `offerPeace` w stanie ROZEJMU zwróci **`false`** — to
      poprawna bramka sprzed D1 (`offerPeace` wymaga `status === 'war'`), nie defekt.
- [ ] **Skrót** zamiast czekania 10 lat wyświetlanych — jedną linią:
      `KOSMOS.diplomacySystem.relations.setStatus('player',E2,'truce',{truceUntilYear: KOSMOS.timeSystem.gameTime + 0.01},'gate')`
      następnie odpauzuj na moment (musi przejść jeden tick roku cywilizacyjnego)
      → `KOSMOS.diplomacySystem.getStatus(E2)` = **`'peace'`**, chip **`[POKÓJ]`**

**Wznowienie decayu napięcia — z jawną arytmetyką jednostek** (to sedno naprawy R7: przed D1
rozejm był terminalny i decay zamierał na zawsze).

- [ ] ⚠ **WARUNEK WSTĘPNY: napięcie musi być > 0**, inaczej nie ma czego zmniejszać i test nic
      nie pokaże. Ustaw jawnie: `KOSMOS.diplomacySystem.changeTension(E2, 30 - KOSMOS.diplomacySystem.getTension(E2), 'gate')`
      → `getTension(E2)` = **30**
- [ ] Zapamiętaj rok: `KOSMOS.timeSystem.gameTime` = ______ (lata WYŚWIETLANE)
- [ ] Puść czas (najlepiej maksymalna prędkość) i obserwuj `KOSMOS.diplomacySystem.getTension(E2)`
      → **maleje do 0**

      Oczekiwany przebieg (dwie różne jednostki, patrz tabela na górze):
      - decay jest ZABLOKOWANY przez **`PEACE_QUIET_YEARS = 2` lata WYŚWIETLANE** od ostatniego
        wpisu pamięci (a `offerPeace` właśnie taki wpis dodał) — więc najpierw ~2 lata ciszy;
      - potem spadek **−5 na rok CYWILIZACYJNY**, czyli 30 → 0 w **6 latach cyw. = ~0,5 roku
        wyświetlanego**;
      - razem od ostatniego incydentu: **~2,5 roku wyświetlanego** (pomiar z gate'u: 3,48 —
        mieści się, bo każdy kolejny wpis pamięci zeruje licznik 2 lat od nowa).
      - Jeśli napięcie stoi dłużej niż ~3 lata wyświetlane, sprawdź `KOSMOS.debug.dumpRelation(E2)`
        → czy w pamięci nie doszedł nowy wpis (to on blokuje, nie decay).

### 1.6 — bramki traktatów na starych progach

- [ ] Wybierz imperium **w pokoju** i ustaw opinię tak, by mostek pokazał dokładnie 65 — ▸
      `const d=KOSMOS.diplomacySystem, E='emp_001'; d.addOpinionModifier(E,'player','legacy_relations',{value:15,source:'gate'}); d.getTrustEquivalent(E)`
      → jeśli **nie 65** (relacja ma inne modyfikatory), skoryguj `value` i powtórz aż `getTrustEquivalent` = **65**
- [ ] Panel: przycisk **„🤝 Umowa handlowa" AKTYWNY** (dawny próg 65)
- [ ] Zmniejsz `value` o 1 → `getTrustEquivalent` = **64** → przycisk **wyszarzony**. Próg nie drgnął.
- [ ] `d.declareWar(E,'player_action'); d.proposeTreaty(E,'trade_agreement')`
      → **`false`** (propozycja w stanie wojny odrzucona z powodem `at_war`)

### 1.7 — narzędzia i ścieżki odzysku

- [ ] `KOSMOS.debug.triggerAIEnvoy(E2)` → **+3 opinii** (`Ich delegacja`)
- [ ] `KOSMOS.debug.dumpRelation(E2)` → wypisuje obiekt info + **dwie tabele** (rozbicie, pamięć)
- [ ] `localStorage.getItem('kosmos_save_backup_v' + ‹ŹRÓDŁOWA›)`
      → **może być `null` i to NIE JEST defekt** (potwierdzone w gate'cie D1: po migracji v92 klucza
        nie było). Ten backup jest z założenia LUKSUSEM: `migrate()` zapisuje go w `try/catch`, a
        autozapis pod ciśnieniem quoty **kasuje go PIERWSZY** (kod wprost mówi, że żywy zapis ma
        pierwszeństwo przed KAŻDĄ kopią). Oba przypadki logują `console.warn`, łatwy do przeoczenia
        wśród logów migracji:
        `[SaveMigration] Nie udało się zapisać backupu:` albo
        `[SaveSystem] Brak miejsca — zwolniono N backup(ów) migracji, ponawiam zapis`.
      → Jeśli klucza nie ma, sprawdź ciśnienie: `KOSMOS.debug.storageReport()`.
      → **Gwarantowaną** ścieżką odzysku jest PLIK (§0 albo kopia z §1.0), nie ten klucz.
        Nazwa klucza używa wersji ŹRÓDŁOWEJ (`kosmos_save_backup_v92` dla zapisu v92) — to
        potwierdzone, żadnej rozbieżności nazewnictwa nie ma.
- [ ] `localStorage.getItem('kosmos_save_backup_preimport') !== null` → zwykle **true**, ale
      ⚠ **to NIE jest kopia Twojego pliku**. `importSave` zapisuje tam **poprzednią treść slotu**, czyli
      to, co zostało z wcześniejszej sesji (może być już zmigrowane do v100). Nie traktować jako
      backupu przedmigracyjnego.

---

## §2 — C3: oś `objective` + `traits` (2 min)

Determinizm generatora został **zweryfikowany headless** (5 ustalonych seedów, nazwy/kolory/home
identyczne co do znaku; wartości sprzed zmiany wpisane jako piny w `empire_objective_smoke` G1),
więc porównywanie zrzutów ekranu nie jest wymagane. Zostaje potwierdzenie, że pola żyją w grze.

- [ ] jedną linią:
      `console.table(KOSMOS.empireRegistry.listAll().map(e => ({ id:e?.id, archetyp:e?.archetype, objective:e?.objective, traits:JSON.stringify(e?.traits ?? null) })))`
      → każde imperium ma **objective z listy** (militarist / technologist / expansionist / diplomat /
        merchant / ecologist) i **`traits: []`**
- [ ] Na zapisie ze §1 (zmigrowanym) objective pochodzi z tabeli-fallbacku:
      **`industrialist → merchant`**, **`expansionist → expansionist`**
- [ ] **Nowa gra** (menu → `[ NOWA GRA ]`): ta sama komenda
      → objective **NIE MUSI** odpowiadać archetypowi (to rzut niezależny — `industrialist` może mieć
        np. `diplomat`). Jeśli industrialist ZAWSZE ma `merchant`, rzut nie działa → zgłoś.
- [ ] **Dwa imperia w JEDNEJ nowej grze mają RÓŻNE objective** (kolizja 1 na 6 jest normalna,
      więc przy trafieniu tej samej wartości powtórz na kolejnej nowej grze).
      To jest kryterium mini-gate'u po fixie `0b15d95`.
- [ ] ⚠ **Różnice MIĘDZY nowymi grami — zależy od wersji.** Do commita `e0615bd` (mini-stream
      **GALAXY_SEED**, po D1) seed galaktyki był STAŁY, więc objective, nazwy i home-systemy imperiów
      były IDENTYCZNE w każdej nowej grze — i tego wtedy NIE należało zgłaszać.
      **Od `e0615bd` jest odwrotnie: każda nowa gra mintuje losowy seed**, więc RÓŻNIĆ SIĘ mają
      `objective`, nazwy imperiów, home-systemy AI oraz nazwy/pozycje/typy spektralne gwiazd.
      ⚠ **Kolory i archetypy imperiów zostają IDENTYCZNE także po fixie** (kolor bierze się
      z archetypu, archetyp z indeksu pętli — żadne nie pochodzi z seeda), tak samo id `emp_001`/
      `emp_002` i `sys_NNN`. **To NIE jest defekt** — patrz Korekta 1 w `GALAXY_SEED_PLAN.md`.
      Galaktyka zapisana w ISTNIEJĄCYM zapisie nie zmienia się przy wczytaniu (tak ma być).
- [ ] Nazwy i kolory imperiów wyglądają normalnie (paleta bez duplikatów, każde imperium inny kolor).

---

## §3 — C4: panel opinii (5 min, okno 1280×720)

Panel dyplomacji: klawisz **D**. ⚠ Lista po lewej pokazuje **tylko imperia ZNANE** (intel ≥ rumor) —
imperium nieznane nie da się w panelu wybrać, choć konsola na nim działa. Jeśli lista jest krótsza,
niż się spodziewasz, to fog-of-war, nie błąd panelu.

- [ ] **Liczba opinii** u góry z prawej, ze znakiem: **`+30`** / **`−15`**
- [ ] **Kolor liczby** zmienia się z wartością: mocno dodatnia **zielona**, około zera **bursztynowa**,
      mocno ujemna **czerwona** (przełącz między imperiami o różnej opinii)
- [ ] Pod liczbą **pasmo statusu**: Wrogi / Neutralny / Przyjazny / Sojusznik
- [ ] Nagłówek **„Dlaczego"**, pod nim wiersze: `etykieta   ±wartość   (zanika za N l.)`
- [ ] Wiersze **posortowane malejąco po sile** (największy modyfikator na górze)
- [ ] Modyfikator trwały (`Stan wojny` / `Partner handlowy`) ma **`∞`** zamiast liczby lat
- [ ] Przy >5 przyczynach ostatni wiersz to **`+ N więcej…`** (limit budżetu pionowego)
- [ ] Chip przy nazwie: **`[POKÓJ]`** / **`[WOJNA]`** / **`[ROZEJM — N lat]`** z licznikiem
- [ ] Pasek **„Napięcie (bliskość wojny)"** z **kreskami na 40/60/80** i wartością `N / 100`
- [ ] Sekcja **„Pamięć relacji"** — **najwyżej 3 najnowsze** wpisy
- [ ] **NIE MA** starego paska zaufania (−10..+10) ani legendy „40 ostrzeżenie · 60 ultimatum · 80 wojna"
- [ ] **Wszystkie 6 przycisków akcji widoczne i klikalne**, nie wychodzą poza panel
      (realny problem — prawa kolumna nie ma scrolla, pasmo akcji jest przypięte do dołu)
- [ ] Kliknij każdy aktywny przycisk raz → **żadnego błędu w konsoli**

**Wersja angielska:**

- [ ] `localStorage.setItem('kosmos_lang','en'); location.reload()`
- [ ] Wczytaj zapis (**`LOAD FROM FILE`** → ten sam plik) i otwórz panel (**D**)
      → **„Their opinion of us"**, **„Why"**, **„Tension (proximity to war)"**, **„Relationship memory"**,
        etykiety modyfikatorów po angielsku (`Our envoys`, `Military presence`, `State of war`, `Trade partner`…)
- [ ] **`[TRUCE — N y]`** na chipie rozejmu, **`(fades in N y)`** przy zanikających
- [ ] `localStorage.setItem('kosmos_lang','pl'); location.reload()` — powrót do polskiego

---

## §4 — C5: harness (2 min, `>_ TERMINAL` — wszystko poniżej)

- [ ] `$ node src/testing/smoke/run-all.mjs` → **`103/103 OK, 0 FAIL`**
- [ ] `$ node tools/check-i18n.mjs` → **`WYNIK: PASS`**, różnice pl↔en **0 w obie strony**
- [ ] `$ node src/testing/smoke/balans_ai_telemetry_smoke.mjs` → **0 FAIL**
- [ ] `$ node src/testing/smoke/diplomacy_d1_smoke.mjs` → **`83 PASS / 0 FAIL`** (zawiera przebieg 300 lat cyw.)
- [ ] Bramka grep — **musi nic nie zwrócić**. Git Bash:
      ```
      grep -rn "\.getHostility(\|\.changeHostility(\|\.changeTrust(\|\.getTrust(\|\.getTrustStatus(\|\.getRelation(\|\.addIncident(" src/ tmp_*.mjs
      ```
      PowerShell (`-Path` nie przyjmuje tu tablicy ścieżek — stąd dwa przebiegi przez `Get-ChildItem`):
      ```
      $p='\.getHostility\(|\.changeHostility\(|\.changeTrust\(|\.getTrust\(|\.getTrustStatus\(|\.getRelation\(|\.addIncident\('
      Get-ChildItem -Path src -Recurse -Include *.js,*.mjs | Select-String -Pattern $p
      Get-ChildItem -Path . -Filter tmp_*.mjs | Select-String -Pattern $p
      ```
      → **zero wierszy wyjścia** z obu poleceń
- [ ] (opcjonalnie) Raport bot-testów → tabela **OBCE IMPERIA** ma kolumny
      **Objective / Napięcie / Opinia / Status** i żadna nie jest pusta

---

## §5 — Świadome odstępstwa od parytetu (potwierdź, że są AKCEPTOWALNE)

To NIE są błędy — to zaprojektowane zmiany. Gate polega na tym, żeby je zobaczyć i zaakceptować.

- [ ] **Rozejm nie jest już terminalny** (§1.5): po 10 latach wraca pokój i napięcie znowu spada.
      Skutek uboczny: imperia AI po wojnie wychodzą z `NEGOTIATING`, pierścienie na Stratcomie stygną.
- [ ] **Relacje po wojnie się odbudowują** (§1.5): dawniej wojna zerowała zaufanie NA ZAWSZE,
      teraz zostaje `Świeża pamięć wojny −15`, a wcześniejsza dobra wola wraca.
- [ ] **Relacje, które dotknęły starego krańca 0/100**, mogą mieć teraz inną wartość niż przed D1
      (stary model odrzucał nadwyżkę na każdym kroku, nowy ją zachowuje). Migracja zalogowała ich liczbę.
- [ ] **Zanikanie modyfikatorów jest WYŁĄCZONE** (`FEATURES.diplomacyDecay = false`) — bonusy i kary
      nie blakną, dokładnie jak stary `trust`. Zapalenie flagi to zadanie D2 z własnym gate'em.

---

## Wynik

- [ ] **§1–§5 przeszły** → D1 domknięty, można ruszać D2 (Acceptance Engine).
- [ ] Rozjazdy do zgłoszenia: _______________________________________________

### Rollback

1. **Podstawowa ścieżka: plik `.json` ze §0** — albo pobrana w §1.0 **kopia przedmigracyjna**
   (`…_v99_przed_migracja.json`, ten sam stan). Import ich nie zmienił, więc wystarczy `git revert`
   kodu i ponowny `WCZYTAJ Z PLIKU`.
   `git revert <hash kopii przedmigracyjnej> 70a3a16 5cd6f47 48cf431 36af8cf 78c94f1 ae223c7`
   (w tej kolejności)
2. **Wtórna, NIEGWARANTOWANA: `kosmos_save_backup_v‹ŹRÓDŁOWA›`** w localStorage — blob taki, jaki
   wszedł do migracji, ale pod ciśnieniem quoty jest kasowany PIERWSZY (§1.7). Jeśli istnieje:
   `>< KONSOLA` `copy(localStorage.getItem('kosmos_save_backup_v92'))` i wklej do pliku `.json`.
3. ⚠ **`kosmos_save_backup_preimport` to NIE kopia Twojego pliku** — zawiera poprzednią treść slotu
   z wcześniejszej sesji (może być już v100). Nie używać jako backupu przedmigracyjnego.

---

## Znane, POZA zakresem D1 (nie zgłaszaj jako defekty gate'u)

- **Stały seed galaktyki — ✅ NAPRAWIONE PO D1** (`e0615bd`, mini-stream GALAXY_SEED).
  Było: `EntityManager.generateId()` to licznik od 1 → gwiazda gracza ma to samo id w każdej nowej grze
  → `galaxyData.seed = hashString(star.id)` stały → nazwy, home-systemy i `objective` imperiów
  IDENTYCZNE w każdej nowej grze. Jest: nowa gra mintuje losowy seed i utrwala go w zapisie.
  ⚠ **Kolory i archetypy imperiów NIE pochodziły z seeda i po fixie zostają identyczne — nadal nie
  zgłaszaj tego jako defektu** (Korekta 1). Opis i dowody: `D1_AUTONOMOUS_REPORT` §9.2 +
  `GALAXY_SEED_PLAN.md`.
- **404 `assets/event-videos/cultural_festival.mp4`** — brakujący plik zasobu, sprzed D1.
  `ScheduledEventPopup.tryNext` obsługuje brak wideo, więc gra działa; do wpisania na backlog.
- **`emp_002` w starych zapisach** niesie stan AI sprzed napraw z Phase 0a — dziwne zachowania tego
  konkretnego imperium w zmigrowanym zapisie nie są regresją D1.
- **Mieszane jednostki czasu** (tabela na górze) — ujednolicenie do lat wyświetlanych + przestrojenie
  wartości to zakres D2, nie D1.
