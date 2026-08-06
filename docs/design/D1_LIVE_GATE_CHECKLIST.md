# D1 — live gate · skrypt jednej sesji

**Arc:** WOJNA I POKÓJ 1.0, faza D1 · **Commity:** `ae223c7` (C1) → `78c94f1` (C2) → `36af8cf` (C3) →
`48cf431` (C4) → `5cd6f47` (C5) · **Raport:** `docs/design/D1_AUTONOMOUS_REPORT.md`

Jeden przebieg pokrywa wszystkie pięć etapów. Kolejność jest istotna: **§1 musi iść na PRAWDZIWYM
zapisie sprzed D1 (v99)**, a §3 na nowej grze. Każdy krok ma wartość OCZEKIWANĄ w linii — odhaczasz
albo notujesz rozjazd.

Legenda: `▸` = wpisz w konsolę DevTools (F12) · **pogrubione** = oczekiwany wynik.

---

## §0 — Przygotowanie (5 min, PRZED wczytaniem czegokolwiek)

Zapis w localStorage jest jeszcze w wersji v99. Migracja NADPISZE slot przy pierwszym wczytaniu,
więc najpierw odczytujemy z niego liczby „przed", żeby mieć z czym porównywać.

- [ ] Otwórz grę (Live Server), **zostań na ekranie tytułowym** — nie klikaj „Kontynuuj".
- [ ] ▸ `const S = JSON.parse(localStorage.getItem('kosmos_save_v1')); S.version`
      → **99** (jeśli 100 — save został już zmigrowany; użyj kopii `kosmos_save_backup_v99` albo pliku .json)
- [ ] ▸ `copy(localStorage.getItem('kosmos_save_v1'))` — kopia zapasowa do schowka, wklej do pliku obok.
- [ ] ▸ `console.table(Object.entries(S.civ4x.gameState.diplomacy.relations).map(([k,r]) => ({klucz:k, trust:r.trust, hostility:r.hostility, state:r.state, traktaty:(r.treaties??[]).map(t=>t.id).join(','), incydenty:(r.lastIncidents??[]).length})))`
      → **klucze w formacie `player_emp_001`.** ZAPISZ tę tabelę — §1 porównuje do niej.
- [ ] Ustaw okno przeglądarki na **1280×720** (§3 sprawdza budżet pionowy panelu przy tej wysokości).

---

## §1 — C2: wymiana modelu na PRAWDZIWYM zapisie v99 (najważniejsza część)

- [ ] Kliknij **„Kontynuuj"**. W konsoli powinien pojawić się log migracji
      → **`[SaveMigration] Migracja v99 → v100...`** i **`Save zmigrowany v99 → v100`**
- [ ] Jeśli któraś relacja miała trust dokładnie 0 lub 100 → dodatkowo
      **`[SaveMigration v100] N relacji miało trust na krańcu…`** (to informacja, nie błąd)
- [ ] **Konsola bez błędów** (czerwonych). Ostrzeżenia z innych systemów są OK.

**1.1 — klucze i kształt danych**

- [ ] ▸ `Object.keys(KOSMOS.gameState.get('diplomacy.relations'))`
      → **wyłącznie klucze z `__`**, np. `['emp_001__player','emp_002__player']`; **zero `player_*`**
- [ ] ▸ `KOSMOS.gameState.get('diplomacy.reputation')`
      → **wpis `player` ORAZ wpis na każde imperium**, każdy `{aggression: 0, decayPerYear: 1}`
- [ ] ▸ `KOSMOS.gameState.get('diplomacy.relations')['emp_001__player']`
      → są pola `a`,`b`,`opinionModifiers`,`tension`,`status`,`truceUntilYear`,`bordersOpen`,`treaties`,`memory`,`ultimatumStartYear`
      → **NIE MA** `trust`, `hostility`, `state`, `lastIncidents`, `lastChangeYear`, `warStartYear`

**1.2 — PARYTET względem tabeli z §0** (dla każdego imperium z tabeli)

- [ ] ▸ `KOSMOS.debug.dumpRelation('emp_001')`
      → `opinia` = **`trust − 50`** z §0 · `trustEqD2` = **dokładnie `trust`** z §0 ·
        `napiecie` = **`hostility`** z §0 · `status` = **`state`** z §0 ·
        `traktaty` = **ta sama lista** co w §0
- [ ] Powtórz dla `emp_002` → **te same zależności**
- [ ] Panel dyplomacji (klawisz **D**): traktaty, pasek napięcia, stan i lista pamięci
      → **zgodne z tabelą z §0**; liczba wpisów pamięci = liczba `incydenty` z §0

**1.3 — drabina eskalacji 40/60/80 (bez zmian względem D1)**

Na relacji, która nie jest w stanie wojny (jeśli trzeba, wybierz drugie imperium):

- [ ] ▸ `KOSMOS.diplomacySystem.changeTension('emp_001', 40, 'gate')`
      → **napięcie 40**, w Dzienniku wpis ostrzeżenia
- [ ] ▸ `KOSMOS.diplomacySystem.changeTension('emp_001', 20, 'gate')`
      → **napięcie 60**, panel pokazuje **`⚠ ULTIMATUM — 3.0 lat do wojny`**
- [ ] ▸ `KOSMOS.diplomacySystem.changeTension('emp_001', 20, 'gate')`
      → **napięcie 80 i AUTOMATYCZNA WOJNA**, `status: 'war'`, auto-slow do 1 dzień/s

**1.4 — kumulacja modyfikatorów (parytet ze starym trustem)**

Na relacji w pokoju (użyj `emp_002`):

- [ ] ▸ `KOSMOS.debug.simulateVesselArrival('emp_002','weapons')` — **trzy razy pod rząd**
      → log `opinia X → Y` schodzi **−5 za każdym razem, razem −15** (nie „−5 i sufit")
- [ ] ▸ `KOSMOS.diplomacySystem.addOpinionModifier('emp_002','player','envoy_goodwill',{source:'gate'})` — **dwa razy**
      → **razem +10** (emisariusz: dotarcie + powrót)
- [ ] ▸ `KOSMOS.debug.dumpRelation('emp_002')` → w tabeli rozbicia **`Obecność wojskowa −15`**
      i **`Nasi emisariusze +10`** jako POJEDYNCZE wiersze (nie po jednym na zdarzenie)

**1.5 — wojna → rozejm → pokój (naprawa audytu R7, jedyna widoczna zmiana zachowania)**

- [ ] ▸ `KOSMOS.diplomacySystem.declareWar('emp_002','player_action')`
      → **wszystkie traktaty zerwane**, `status: 'war'`, w rozbiciu **`Stan wojny −40` z oznaczeniem ∞**
- [ ] ▸ `KOSMOS.diplomacySystem.offerPeace('emp_002','player_action')`
      → `status: 'truce'`, chip w panelu **`[ROZEJM — 10 lat]`**,
        `Stan wojny` **znika**, pojawia się **`Świeża pamięć wojny −15`**
- [ ] Skrót zamiast czekania 10 lat gry — ▸
      `KOSMOS.diplomacySystem.relations.setStatus('player','emp_002','truce',{truceUntilYear: KOSMOS.timeSystem.gameTime + 0.01},'gate')`
      potem odpauzuj na chwilę (musi przejść jeden tick roku cywilizacyjnego)
      → `status` przeskakuje na **`peace`**, chip pokazuje **`[POKÓJ]`**
- [ ] Zostaw grę na kilka lat cywilizacyjnych → **napięcie ZACZYNA SPADAĆ** (−5/rok cyw.)
      To jest sedno naprawy: przed D1 rozejm był terminalny i decay zamierał na zawsze.

**1.6 — bramki traktatów na starych progach**

- [ ] ▸ `KOSMOS.diplomacySystem.addOpinionModifier('emp_001','player','legacy_relations',{value:15,source:'gate'})`
      (najpierw zawrzyj pokój, jeśli `emp_001` jest w stanie wojny z 1.3)
      → `trustEqD2` = **65** → w panelu przycisk **„🤝 Umowa handlowa" AKTYWNY** (dawny próg 65)
- [ ] Ustaw `value:14` → `trustEqD2` = **64** → przycisk **wyszarzony**. Próg nie drgnął.
- [ ] Wypowiedz wojnę i spróbuj zaproponować traktat programowo ▸
      `KOSMOS.diplomacySystem.proposeTreaty('emp_001','trade_agreement')`
      → **`false`**, event odrzucenia z powodem **`at_war`**

**1.7 — narzędzia debug żyją**

- [ ] ▸ `KOSMOS.debug.triggerAIEnvoy('emp_002')` → **+3 opinii** (`Ich delegacja`)
- [ ] ▸ `KOSMOS.debug.dumpRelation('emp_002')` → wypisuje info + **dwie tabele** (rozbicie, pamięć)
- [ ] ▸ `localStorage.getItem('kosmos_save_backup_v99') !== null` → **true** (kopia przedmigracyjna istnieje)

---

## §2 — C3: oś `objective` + `traits` (2 min)

Determinizm generatora został **zweryfikowany headless** (5 ustalonych seedów, nazwy/kolory/home
identyczne co do znaku, wartości sprzed zmiany wpisane jako piny w `empire_objective_smoke` G1),
więc porównanie zrzutów ekranu nie jest wymagane. Zostaje potwierdzenie, że pola żyją w grze.

- [ ] ▸ `console.table(KOSMOS.empireRegistry.listAll().map(e => ({id:e.id, archetyp:e.archetype, objective:e.objective, traits:JSON.stringify(e.traits)})))`
      → każde imperium ma **objective z listy** (militarist / technologist / expansionist / diplomat /
        merchant / ecologist) i **`traits: []`**
- [ ] Na zapisie ze §1 (zmigrowanym) objective pochodzi z tabeli-fallbacku:
      `industrialist → merchant`, `expansionist → expansionist`
- [ ] **Nowa gra** (nie wczytana): ▸ ta sama komenda
      → objective **NIE MUSI** odpowiadać archetypowi (to rzut niezależny — np. `industrialist`
        może mieć `diplomat`). Jeśli w kilku nowych grach industrialist ZAWSZE ma `merchant`,
        rzut nie działa → zgłoś.
- [ ] Nazwy i kolory imperiów wyglądają normalnie (paleta bez duplikatów, każde imperium inny kolor).

---

## §3 — C4: panel opinii (5 min, okno 1280×720)

Panel dyplomacji: klawisz **D**. Wybierz imperium z listy po lewej.

- [ ] **Liczba opinii** u góry z prawej, ze znakiem: **`+30`** / **`−15`**
- [ ] **Kolor liczby** zmienia się z wartością: mocno dodatnia **zielona**, około zera **bursztynowa**,
      mocno ujemna **czerwona** (przełącz między imperiami o różnej opinii)
- [ ] Pod liczbą **pasmo statusu**: Wrogi / Neutralny / Przyjazny / Sojusznik
- [ ] Nagłówek **„Dlaczego"** i pod nim wiersze rozbicia: `etykieta   ±wartość   (zanika za N l.)`
- [ ] Wiersze **posortowane malejąco po sile** (największy modyfikator na górze)
- [ ] Modyfikator trwały (`Stan wojny` albo `Partner handlowy`) ma **`∞`** zamiast liczby lat
- [ ] Przy >5 przyczynach ostatni wiersz to **`+ N więcej…`** (limit budżetu pionowego)
- [ ] Chip statusu przy nazwie: **`[POKÓJ]`** / **`[WOJNA]`** / **`[ROZEJM — N lat]`** z licznikiem
- [ ] Pasek **„Napięcie (bliskość wojny)"** z **kreskami na 40/60/80** i wartością `N / 100`
- [ ] Sekcja **„Pamięć relacji"** — **najwyżej 3 najnowsze** wpisy
- [ ] **NIE MA** starego paska zaufania (−10..+10) ani wiersza legendy „40 ostrzeżenie · 60 ultimatum · 80 wojna"
- [ ] **Wszystkie 6 przycisków akcji widoczne i klikalne**, nie wychodzą poza panel
      (to był realny problem — prawa kolumna nie ma scrolla, pasmo akcji jest przypięte do dołu)
- [ ] Kliknij każdy aktywny przycisk raz → **żadnego błędu w konsoli**

**Wersja angielska:**

- [ ] ▸ `localStorage.setItem('kosmos_lang','en'); location.reload()`
- [ ] Wczytaj grę, otwórz panel (**D**) → **„Their opinion of us"**, **„Why"**,
      **„Tension (proximity to war)"**, **„Relationship memory"**, etykiety modyfikatorów po angielsku
      (`Our envoys`, `Military presence`, `State of war`, `Trade partner`…)
- [ ] **`[TRUCE — N y]`** na chipie rozejmu, **`(fades in N y)`** przy zanikających
- [ ] ▸ `localStorage.setItem('kosmos_lang','pl'); location.reload()` — powrót do polskiego

---

## §4 — C5: harness (2 min, terminal)

- [ ] `node src/testing/smoke/run-all.mjs` → **`103/103 OK, 0 FAIL`**
- [ ] `node tools/check-i18n.mjs` → **`WYNIK: PASS`**, różnice pl↔en **0 w obie strony**
- [ ] `node src/testing/smoke/balans_ai_telemetry_smoke.mjs` → **0 FAIL**
- [ ] `node src/testing/smoke/diplomacy_d1_smoke.mjs` → **`83 PASS / 0 FAIL`** (zawiera przebieg 300 lat cyw.)
- [ ] Bramka grep — **oba polecenia muszą nic nie zwrócić**:
      `grep -rn "\.getHostility(\|\.changeHostility(\|\.changeTrust(\|\.getTrust(\|\.getTrustStatus(\|\.getRelation(\|\.addIncident(" src/ tmp_*.mjs`
- [ ] (opcjonalnie) Raport bot-testów → tabela **OBCE IMPERIA** ma teraz kolumny
      **Objective / Napięcie / Opinia / Status** i żadna z nich nie jest pusta

---

## §5 — Świadome odstępstwa od parytetu (potwierdź, że są AKCEPTOWALNE)

To NIE są błędy — to zaprojektowane zmiany. Gate polega na tym, żeby je zobaczyć i zaakceptować.

- [ ] **Rozejm nie jest już terminalny** (§1.5): po 10 latach wraca pokój i napięcie znowu spada.
      Skutek uboczny: imperia AI po wojnie wychodzą z `NEGOTIATING`, a pierścienie na Stratcomie stygną.
- [ ] **Relacje po wojnie się odbudowują** (§1.5): dawniej wojna zerowała zaufanie NA ZAWSZE,
      teraz zostaje `Świeża pamięć wojny −15`, a wcześniejsza dobra wola wraca.
- [ ] **Relacje, które dotknęły starego krańca 0/100**, mogą mieć teraz inną wartość niż przed D1
      (stary model odrzucał nadwyżkę na każdym kroku, nowy ją zachowuje). Migracja zalogowała ich liczbę.
- [ ] **Zanikanie modyfikatorów jest WYŁĄCZONE** (`FEATURES.diplomacyDecay = false`): bonusy i kary
      nie blakną, dokładnie jak stary `trust`. Zapalenie flagi to zadanie D2 z własnym gate'em.

---

## Wynik

- [ ] **§1–§5 przeszły** → D1 domknięty, można ruszać D2 (Acceptance Engine).
- [ ] Rozjazdy do zgłoszenia: _______________________________________________

**Rollback**, gdyby coś było nie tak: `git revert 5cd6f47 48cf431 36af8cf 78c94f1 ae223c7`
(w tej kolejności), a zapis odzyskać z `kosmos_save_backup_v99` w localStorage albo z pliku .json
zrobionego w §0.
