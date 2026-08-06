# D1 — live gate · skrypt jednej sesji (workflow PLIKOWY)

**Arc:** WOJNA I POKÓJ 1.0, faza D1 · **Commity:** `ae223c7` (C1) → `78c94f1` (C2) → `36af8cf` (C3) →
`48cf431` (C4) → `5cd6f47` (C5) → `70a3a16` (stub) · **Raport:** `docs/design/D1_AUTONOMOUS_REPORT.md`

Jeden przebieg pokrywa wszystkie pięć etapów. Zapisy żyją jako **pliki `.json`** — localStorage trzyma
tylko ustawienia i klucze pomocnicze. Kolejność jest istotna: **§0 czyta liczby „przed" WPROST Z PLIKU,
zanim gra wystartuje** (import nadpisuje slot i uruchamia migrację, więc potem nie ma z czym porównywać).

Legenda: `▸` = wpisz w konsolę DevTools (F12) · `$` = terminal · **pogrubione** = wartość oczekiwana.

> **Zanim wkleisz cokolwiek do konsoli Chrome:** przy pierwszej wklejce DevTools żąda wpisania
> `allow pasting` i zatwierdzenia Enterem. Zrób to raz na początku sesji.
>
> Wszystkie jednolinijkowce poniżej używają **prostych apostrofów ASCII** i optional chaining
> (`?.` / `??`), więc są odporne na brakujące pola i bezpieczne do skopiowania jeden do jednego.

---

## §0 — Wybór pliku i odczyt liczb „przed" (5 min, PRZED uruchomieniem gry)

**Wybór zapisu.** Weź plik `.json` w wersji **v99** (sprzed D1). ⚠ **Wybierz zapis z realnym życiem
dyplomatycznym**: co najmniej jeden aktywny traktat, niezerowe `hostility`, najlepiej trwającą wojnę
albo rozejm. Zapis, w którym wszystkie relacje mają `trust: 50`, `hostility: 0`, `state: 'peace'`
i puste traktaty, **niczego nie udowodni w §1.2** — parytet 50→0 wypada poprawnie nawet gdyby migracja
gubiła dane.

- [ ] Mam plik v99 z traktatem i niezerowym napięciem (ideał: wojna lub rozejm w toku).
      Ścieżka: ________________________________________________
- [ ] **Ten plik JEST kopią zapasową.** Import go nie modyfikuje (czyta tylko treść), więc nie trzeba
      nic dodatkowo archiwizować. Nie nadpisuj go do końca gate'u.

**Odczyt liczb „przed" — jednolinijkowiec Node** (najpewniejsza droga; żadnego wklejania do przeglądarki):

```
$ node -e "const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log('wersja:', d.version, '| rok gry:', d.gameTime); const R=d.civ4x?.gameState?.diplomacy?.relations ?? {}; console.log('relacji:', Object.keys(R).length); console.table(Object.entries(R).map(([k,r]) => ({ klucz:k, trust:r?.trust, hostility:r?.hostility, state:r?.state, traktaty:(r?.treaties ?? []).map(t=>t?.id).join(','), pamiec:(r?.lastIncidents ?? []).length })));" "PELNA/SCIEZKA/DO/save.json"
```

- [ ] `wersja:` → **99** (jeśli 100 — ten plik jest już zmigrowany, weź inny)
- [ ] `relacji:` → **≥ 1**, klucze w formacie **`player_emp_001`**
- [ ] **ZAPISZ wydrukowaną tabelę** (zrzut ekranu albo wklej do notatki) — §1.2 porównuje do niej.
- [ ] Sprawdź też rok gry — przyda się w §1.5 (`truceUntilYear` = rok + 10).

*Gdyby PowerShell psuł cytowanie: odpal tę samą komendę w Git Bash.*

**Fallback w przeglądarce** (jeśli wolisz nie używać terminala) — na ekranie tytułowym, ▸ jedną linią:

```
const [fh] = await showOpenFilePicker(); const d = JSON.parse(await (await fh.getFile()).text()); console.log('wersja:', d.version, '| rok gry:', d.gameTime); const R = d.civ4x?.gameState?.diplomacy?.relations ?? {}; console.table(Object.entries(R).map(([k,r]) => ({ klucz:k, trust:r?.trust, hostility:r?.hostility, state:r?.state, traktaty:(r?.treaties ?? []).map(t=>t?.id).join(','), pamiec:(r?.lastIncidents ?? []).length })));
```

To tylko CZYTA plik (nie importuje), więc można je odpalić bezpiecznie przed gate'em.

- [ ] Ustaw okno przeglądarki na **1280×720** (§3 sprawdza budżet pionowy panelu przy tej wysokości).

---

## §1 — C2: wymiana modelu na PRAWDZIWYM zapisie v99 (najważniejsza część)

### 1.0 — import i migracja: jedno kliknięcie, dwie fazy

Faktyczny przepływ w kodzie (`TitleScene._loadFromFile` → `SaveSystem.importSave` →
`_handleChoice('continue')` → `_prepareContinue` → `migrate`):

1. **`WCZYTAJ Z PLIKU`** w menu ekranu tytułowego (EN: `LOAD FROM FILE`) → otwiera się **systemowy
   dialog wyboru pliku**.
2. Po wybraniu pliku `importSave` sprawdza wersję (v99 mieści się w zakresie) i **wpisuje surowy blob
   do slotu** — jeszcze BEZ migracji.
3. Natychmiast, automatycznie, gra przechodzi w „kontynuuj" i **wtedy uruchamia się migracja**.
   Nie ma osobnego kliknięcia „Kontynuuj" — wszystko dzieje się po zamknięciu dialogu.

- [ ] Otwórz konsolę (F12) **przed** kliknięciem, żeby złapać logi.
- [ ] Kliknij **`WCZYTAJ Z PLIKU`** → wybierz plik z §0.
- [ ] W konsoli, w tej kolejności:
      → **`[SaveMigration] Backup save v99 → kosmos_save_backup_v99`**
      → **`[SaveMigration] Migracja v99 → v100...`**
      → *(warunkowo, tylko gdy któraś relacja miała trust dokładnie 0 lub 100)*
        **`[SaveMigration v100] N relacji miało trust na krańcu…`** — to informacja, nie błąd
      → **`[SaveMigration] Save zmigrowany v99 → v100`**
      *(może też pojawić się `[SaveMigration] Usunięto N backup(ów) migracji` — sprzątanie starych kopii)*
- [ ] Gra wchodzi w rozgrywkę, **konsola bez czerwonych błędów** (ostrzeżenia z innych systemów OK).
- [ ] ⚠ Gdyby wyskoczył `alert` z komunikatem o migracji → **STOP, zgłoś treść**. To ścieżka błędu,
      która czyści slot; plik `.json` jest nietknięty, więc nic nie przepadło.

### 1.1 — klucze i kształt danych

- [ ] ▸ `Object.keys(KOSMOS.gameState.get('diplomacy.relations'))`
      → **wyłącznie klucze z `__`**, np. `['emp_001__player','emp_002__player']`; **zero `player_*`**
- [ ] ▸ `KOSMOS.gameState.get('diplomacy.reputation')`
      → wpis **`player`** ORAZ wpis na każde imperium, każdy **`{aggression: 0, decayPerYear: 1}`**
- [ ] ▸ `Object.keys(Object.values(KOSMOS.gameState.get('diplomacy.relations'))[0])`
      → są: `a`,`b`,`opinionModifiers`,`tension`,`status`,`truceUntilYear`,`bordersOpen`,`treaties`,`memory`,`ultimatumStartYear`
      → **NIE MA**: `trust`, `hostility`, `state`, `lastIncidents`, `lastChangeYear`, `warStartYear`

### 1.2 — PARYTET względem tabeli z §0 (dla KAŻDEGO imperium z tabeli)

- [ ] ▸ `KOSMOS.debug.dumpRelation('emp_001')`
      → `opinia` = **`trust − 50`** z §0 · `trustEqD2` = **dokładnie `trust`** z §0 ·
        `napiecie` = **`hostility`** z §0 · `status` = **`state`** z §0 ·
        `traktaty` = **ta sama lista** co w §0
- [ ] Powtórz dla pozostałych imperiów z tabeli → **te same zależności**
- [ ] Liczba wierszy w drugiej tabeli (`pamięć`) = kolumna **`pamiec`** z §0 (cap 20)
- [ ] Panel dyplomacji (klawisz **D**): traktaty, pasek napięcia i stan **zgodne z tabelą z §0**

### 1.3 — drabina eskalacji 40/60/80 (bez zmian względem stanu przed D1)

Wybierz imperium **nie w stanie wojny**. Poniższe zeruje napięcie, więc progi trafiają deterministycznie.

- [ ] ▸ `const d = KOSMOS.diplomacySystem, E = 'emp_001'; d.changeTension(E, -100, 'gate'); d.getTension(E)`
      → **0**
- [ ] ▸ `d.changeTension(E, 40, 'gate'); d.getTension(E)`
      → **40**, w Dzienniku wpis ostrzeżenia
- [ ] ▸ `d.changeTension(E, 20, 'gate'); d.getTension(E)`
      → **60**, panel pokazuje **`⚠ ULTIMATUM — 3.0 lat do wojny`**
- [ ] ▸ `d.changeTension(E, 20, 'gate'); d.getStatus(E)`
      → **`'war'`** — napięcie 80 wywołało AUTOMATYCZNĄ wojnę + auto-slow do 1 dzień/s

### 1.4 — kumulacja modyfikatorów (parytet ze starym trustem)

Na relacji **w pokoju** (użyj innego imperium, np. `emp_002`):

- [ ] ▸ `KOSMOS.debug.simulateVesselArrival('emp_002','weapons')` — **trzy razy pod rząd**
      → log `opinia X → Y` schodzi **−5 za każdym razem, razem −15** (nie „−5 i sufit")
- [ ] ▸ `KOSMOS.diplomacySystem.addOpinionModifier('emp_002','player','envoy_goodwill',{source:'gate'})` — **dwa razy**
      → **razem +10** (odpowiednik dotarcia + powrotu emisariusza)
- [ ] ▸ `KOSMOS.debug.dumpRelation('emp_002')` → w tabeli rozbicia **`Obecność wojskowa −15`**
      i **`Nasi emisariusze +10`** jako **POJEDYNCZE wiersze** (nie po jednym na zdarzenie)

### 1.5 — wojna → rozejm → pokój (naprawa audytu R7 — jedyna widoczna zmiana zachowania)

- [ ] ▸ `KOSMOS.diplomacySystem.declareWar('emp_002','player_action')`
      → **wszystkie traktaty zerwane**, `status: 'war'`, w rozbiciu **`Stan wojny −40` z `∞`**
- [ ] ▸ `KOSMOS.diplomacySystem.offerPeace('emp_002','player_action'); KOSMOS.diplomacySystem.getTruceYearsLeft('emp_002')`
      → **10**; chip w panelu **`[ROZEJM — 10 lat]`**; `Stan wojny` **znika**,
        pojawia się **`Świeża pamięć wojny −15`**
- [ ] Skrót zamiast czekania 10 lat gry — ▸ jedną linią:
      `KOSMOS.diplomacySystem.relations.setStatus('player','emp_002','truce',{truceUntilYear: KOSMOS.timeSystem.gameTime + 0.01},'gate')`
      następnie odpauzuj na moment (musi przejść jeden tick roku cywilizacyjnego)
      → ▸ `KOSMOS.diplomacySystem.getStatus('emp_002')` = **`'peace'`**, chip **`[POKÓJ]`**
- [ ] Zostaw grę na kilka lat cywilizacyjnych → ▸ `KOSMOS.diplomacySystem.getTension('emp_002')`
      **MALEJE** (−5/rok cyw.). To sedno naprawy: przed D1 rozejm był terminalny i decay zamierał na zawsze.

### 1.6 — bramki traktatów na starych progach

- [ ] Wybierz imperium **w pokoju** i ustaw opinię tak, by mostek pokazał dokładnie 65 — ▸
      `const d=KOSMOS.diplomacySystem, E='emp_001'; d.addOpinionModifier(E,'player','legacy_relations',{value:15,source:'gate'}); d.getTrustEquivalent(E)`
      → jeśli **nie 65** (relacja ma inne modyfikatory), skoryguj `value` i powtórz aż `getTrustEquivalent` = **65**
- [ ] Panel: przycisk **„🤝 Umowa handlowa" AKTYWNY** (dawny próg 65)
- [ ] Zmniejsz `value` o 1 → `getTrustEquivalent` = **64** → przycisk **wyszarzony**. Próg nie drgnął.
- [ ] ▸ `d.declareWar(E,'player_action'); d.proposeTreaty(E,'trade_agreement')`
      → **`false`** (propozycja w stanie wojny odrzucona z powodem `at_war`)

### 1.7 — narzędzia i ścieżki odzysku

- [ ] ▸ `KOSMOS.debug.triggerAIEnvoy('emp_002')` → **+3 opinii** (`Ich delegacja`)
- [ ] ▸ `KOSMOS.debug.dumpRelation('emp_002')` → wypisuje obiekt info + **dwie tabele** (rozbicie, pamięć)
- [ ] ▸ `localStorage.getItem('kosmos_save_backup_v99') !== null`
      → **true**. To **blob v99 dokładnie taki, jaki został zaimportowany**, zapisany przez `migrate()`
        bezpośrednio przed łańcuchem migracji. Wtórna ścieżka odzysku (best-effort — przy bardzo dużym
        zapisie może się nie zmieścić i wtedy w konsoli jest o tym ostrzeżenie).
- [ ] ▸ `localStorage.getItem('kosmos_save_backup_preimport') !== null` → zwykle **true**, ale
      ⚠ **to NIE jest kopia Twojego pliku**. `importSave` zapisuje tam **poprzednią treść slotu**, czyli
      to, co zostało z wcześniejszej sesji (może być już zmigrowane do v100). Nie traktować jako
      backupu przedmigracyjnego.

---

## §2 — C3: oś `objective` + `traits` (2 min)

Determinizm generatora został **zweryfikowany headless** (5 ustalonych seedów, nazwy/kolory/home
identyczne co do znaku; wartości sprzed zmiany wpisane jako piny w `empire_objective_smoke` G1),
więc porównywanie zrzutów ekranu nie jest wymagane. Zostaje potwierdzenie, że pola żyją w grze.

- [ ] ▸ jedną linią:
      `console.table(KOSMOS.empireRegistry.listAll().map(e => ({ id:e?.id, archetyp:e?.archetype, objective:e?.objective, traits:JSON.stringify(e?.traits ?? null) })))`
      → każde imperium ma **objective z listy** (militarist / technologist / expansionist / diplomat /
        merchant / ecologist) i **`traits: []`**
- [ ] Na zapisie ze §1 (zmigrowanym) objective pochodzi z tabeli-fallbacku:
      **`industrialist → merchant`**, **`expansionist → expansionist`**
- [ ] **Nowa gra** (menu → `[ NOWA GRA ]`): ▸ ta sama komenda
      → objective **NIE MUSI** odpowiadać archetypowi (to rzut niezależny — `industrialist` może mieć
        np. `diplomat`). Jeśli w kilku nowych grach industrialist ZAWSZE ma `merchant`, rzut nie działa → zgłoś.
- [ ] Nazwy i kolory imperiów wyglądają normalnie (paleta bez duplikatów, każde imperium inny kolor).

---

## §3 — C4: panel opinii (5 min, okno 1280×720)

Panel dyplomacji: klawisz **D**. Wybierz imperium z listy po lewej.

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

- [ ] ▸ `localStorage.setItem('kosmos_lang','en'); location.reload()`
- [ ] Wczytaj zapis (**`LOAD FROM FILE`** → ten sam plik) i otwórz panel (**D**)
      → **„Their opinion of us"**, **„Why"**, **„Tension (proximity to war)"**, **„Relationship memory"**,
        etykiety modyfikatorów po angielsku (`Our envoys`, `Military presence`, `State of war`, `Trade partner`…)
- [ ] **`[TRUCE — N y]`** na chipie rozejmu, **`(fades in N y)`** przy zanikających
- [ ] ▸ `localStorage.setItem('kosmos_lang','pl'); location.reload()` — powrót do polskiego

---

## §4 — C5: harness (2 min, terminal)

- [ ] `$ node src/testing/smoke/run-all.mjs` → **`103/103 OK, 0 FAIL`**
- [ ] `$ node tools/check-i18n.mjs` → **`WYNIK: PASS`**, różnice pl↔en **0 w obie strony**
- [ ] `$ node src/testing/smoke/balans_ai_telemetry_smoke.mjs` → **0 FAIL**
- [ ] `$ node src/testing/smoke/diplomacy_d1_smoke.mjs` → **`83 PASS / 0 FAIL`** (zawiera przebieg 300 lat cyw.)
- [ ] Bramka grep — **musi nic nie zwrócić**:
      `$ grep -rn "\.getHostility(\|\.changeHostility(\|\.changeTrust(\|\.getTrust(\|\.getTrustStatus(\|\.getRelation(\|\.addIncident(" src/ tmp_*.mjs`
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

1. **Podstawowa ścieżka: plik `.json` ze §0.** Import go nie zmienił — wystarczy `git revert` kodu
   i ponowny `WCZYTAJ Z PLIKU`.
   `git revert 70a3a16 5cd6f47 48cf431 36af8cf 78c94f1 ae223c7` (w tej kolejności)
2. **Wtórna: `kosmos_save_backup_v99`** w localStorage — blob v99 taki, jaki wszedł do migracji.
   ▸ `copy(localStorage.getItem('kosmos_save_backup_v99'))` i wklej do pliku `.json`.
3. ⚠ **`kosmos_save_backup_preimport` to NIE kopia Twojego pliku** — zawiera poprzednią treść slotu
   z wcześniejszej sesji (może być już v100). Nie używać jako backupu przedmigracyjnego.
