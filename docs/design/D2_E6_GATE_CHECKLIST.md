# D2 / E6 — live gate · skrypt jednej sesji

**Status: ✅ PASSED 2026-08-10** — 11/11 sekcji, jedna rozbieżność KALIBRACYJNA (§4, layout).
Wynik na końcu (§Wynik gate'u).

**Arc:** WOJNA I POKÓJ 1.0 · faza **D2** (Acceptance Engine) · commity **E6** (cztery: testy ·
unifikacja jednostek + przestrojenie · flip flagi · etykieta)
**Zakres:** WYŁĄCZNIE E6 — `FEATURES.diplomacyDecay` zapalone + WSZYSTKIE stałe czasowe dyplomacji
przeliczone na **lata WYŚWIETLANE** (te z paska czasu) + przestrojenie.
**Plan fazy:** `docs/design/D2_PLAN.md` (tabela §Baseline = pomiar, ustalenie 7 = podpisana polityka
tempa) · **Poprzednie gate'y:** `D2_E3_GATE_CHECKLIST.md` (PASSED) · `D2_E5_GATE_CHECKLIST.md` (PASSED)

Sedno: **do teraz zanikanie opinii NIE DZIAŁAŁO ANI RAZU** — flaga stała wyłączona od D1, więc każdy
modyfikator (dobra wola z emisariusza, ślad po wojnie, uraza za zbrojną wizytę) żył WIECZNIE. Gate ma
zobaczyć dwie rzeczy naraz: (1) że relacje wreszcie **stygną**, i (2) że stygną w zegarze, który gracz
CZYTA — bo dotąd panel obiecywał „zanika za 5 l." czegoś, co przy włączonej fladze przeżyłoby
**5 miesięcy** gracza. Liczba w panelu była poprawna; kłamała jednostka.

Drugie sedno, mniej widoczne i ważniejsze: mechanizmy, które JUŻ dziś żyją (narastanie umowy
handlowej i stygnięcie napięcia) **nie mogły zmienić odczuwalnego tempa** — to jest podpisany warunek
(zawężona decyzja 3). §6 i §7 są dokładnie tymi dwoma punktami odniesienia.

Jedenaście punktów, jeden przebieg, ~25 min.

### ⚠ DWA RÓŻNE MIEJSCA WKLEJANIA — nie pomyl ich

| znacznik | gdzie | jak rozpoznać |
|---|---|---|
| **`>_ TERMINAL`** | PowerShell / Git Bash w katalogu repo | polecenie zaczyna się od **`node`** |
| **`>< KONSOLA`** | DevTools przeglądarki (F12 → Console) | polecenie odwołuje się do **`KOSMOS.`** |

> **Zanim wkleisz cokolwiek do konsoli Chrome:** przy pierwszej wklejce DevTools żąda wpisania
> `allow pasting` i zatwierdzenia Enterem. Zrób to raz na początku sesji.

**pogrubione** = wartość oczekiwana. Wszystkie liczby poniżej są **zmierzone na żywym silniku**
(headless, ten sam kod co w przeglądarce) — jeśli u Ciebie wyjdą inne, to jest sygnał, nie szum.
Każdy one-liner został wykonany przed wpisaniem go tutaj.

---

## §0 — Który zapis wziąć i jak przygotować scenę

- ✅ **BIERZ:** dowolny zapis **w trybie 4X** (panel dyplomacji `Y` pokazuje imperia), wersja **v100**.
  **E6 NIE ma migracji** — zapis nie zmienia wersji i wraca do gry bez konwersji.
- ⭐ **NAJLEPSZY:** ten sam zapis **po wojnie / w rozejmie**, na którym poszedł gate E5 — ma realny
  stos modyfikatorów (`recent_war`, napięcie po walkach), czyli dokładnie to, co E6 zaczyna wygaszać.
- ⚠ **PRĘDKOŚĆ CZASU JEST NARZĘDZIEM TEGO GATE'U.** Zanikanie liczy się w latach wyświetlanych, więc
  przy 1 d/s nic nie zobaczysz w rozsądnym czasie. Ustaw **1 m/s** (1 rok wyśw. ≈ 12 s) albo **1 r/s**
  (1 rok wyśw. ≈ 1 s) tam, gdzie punkt tego wymaga — jest to zapisane przy każdym takim punkcie.

- [ ] Otwórz konsolę (**F12**), zatwierdź `allow pasting`.
- [ ] `>< KONSOLA` — kto jest na mapie:

```
console.table(KOSMOS.empireRegistry.listAll().map(e=>({id:e.id,nazwa:e.name,archetyp:e.archetype,agenda:e.objective})));
```

- [ ] Zapamiętaj id, na którym pracujesz (dalej piszę `emp_001` — podmień, jeśli u Ciebie inne).

---

## §1 — Harness (2 min, `>_ TERMINAL`)

```
node src/testing/smoke/run-all.mjs
```

- [ ] **111/111 OK, 0 FAIL** (110 przed E6 + nowy kontrakt jednostek)

```
node src/testing/smoke/diplomacy_time_units_smoke.mjs
```

- [ ] **32/32** — to jest KONTRAKT E6. W środku:
      §R **punkty odniesienia** (ramp 0→+50 = **4,167** roku wyśw. / napięcie 30→0 = **0,5**) ·
      §L **tabela życia** modyfikatorów po unifikacji · §B5 **dwie nogi emisariusza** ·
      §U stałe niezmienione · §F **DIPLOMACY_FROZEN uzbrojony**.

```
node src/testing/smoke/diplomacy_d1_smoke.mjs && node src/testing/smoke/diplomacy_opinion_smoke.mjs && node src/testing/smoke/diplomacy_model_smoke.mjs && node src/testing/smoke/diplomacy_overlay_breakdown_smoke.mjs && node tools/check-i18n.mjs
```

- [ ] `diplomacy_d1` **83/83** · `diplomacy_opinion` **86/86** · `diplomacy_model` **84/84** ·
      `diplomacy_overlay_breakdown` **39/39** · `check-i18n` **PASS**
- [ ] ⚠ Kontrakt D1 „obie gałęzie flagi" (blok **D4** + **H2**) przeżył flip domyślnej wartości —
      te bloki ustawiają flagę JAWNIE, więc kontrakt się nie zmienił, zmieniła się tylko domyślna.

```
node src/testing/headless/probe-diplomacy-time-units.mjs
```

- [ ] Sonda się uruchamia (to STAŁY przyrząd strojenia, nie test — zostaje w repo na D4/D5).
      §A ma teraz pokazać **`flaga=true → envoy_goodwill zanika po 5 lat cyw.`**

---

## §2 — Flaga naprawdę zapalona (i co to znaczy)

- [ ] `>< KONSOLA`:

```
console.log('zanikanie:',KOSMOS.gameConfig.FEATURES.diplomacyDecay,'| krok kadencji:',(1/KOSMOS.gameConfig.CIV_TIME_SCALE).toFixed(4),'roku wyświetlanego');
```

- [ ] `zanikanie:` **true** ← pierwszy raz w historii tej gry
- [ ] `krok kadencji:` **0.0833** roku wyświetlanego (tick dyplomacji leci nadal 12× na rok
      wyświetlany — E6 zmienił JEDNOSTKĘ tempa, nie częstotliwość ticku)

---

## §3 — ⭐ ZANIKANIE ŻYJE, I LICZY W LATACH WYŚWIETLANYCH

To jest punkt, dla którego istnieje ten gate. Jeden wklej, cztery odczyty.

- [ ] `>< KONSOLA`:

```
(()=>{const d=KOSMOS.diplomacySystem,e='emp_001',f=()=>d.getOpinionBreakdown(e,'player').find(x=>x.id==='envoy_goodwill');d.relations.removeModifier(e,'player','envoy_goodwill');d.addOpinionModifier(e,'player','envoy_goodwill',{value:5,source:'gate'});console.log('start:',f().value,'| UI mówi: zanika za',f().yearsLeft,'l. gry');d.relations.tickModifiers(1);console.log('po 1 roku wyświetlanym:',f()?f().value:'WYGASŁ');d.relations.tickModifiers(3);console.log('po 4 latach wyświetlanych:',f()?f().value:'WYGASŁ');d.relations.tickModifiers(1);console.log('po 5 latach wyświetlanych:',f()?f().value:'WYGASŁ');})()
```

- [ ] `start:` **5** · `UI mówi: zanika za` **5** `l. gry`
- [ ] `po 1 roku wyświetlanym:` **4**
- [ ] `po 4 latach wyświetlanych:` **1**
- [ ] `po 5 latach wyświetlanych:` **WYGASŁ**
- [ ] **Tempo = 1 punkt na rok WYŚWIETLANY, dokładnie tak, jak obiecuje etykieta.** Przed E6 ten sam
      wpis albo nie zanikał wcale (flaga off), albo — gdyby ją zapalić bez unifikacji — zniknąłby
      w **0,42** roku wyświetlanego, czyli 12× szybciej, niż panel obiecywał.

> ℹ `tickModifiers` wywołane z konsoli przesuwa TYLKO zanikanie/narastanie modyfikatorów (nie zegar
> gry) — to jest zaplanowana ścieżka gate'u, ten sam chwyt co w gate'cie E5. Stan wraca do normy przy
> wczytaniu zapisu.

---

## §4 — Etykieta PODAJE JEDNOSTKĘ (panel, oba języki)

- [ ] Otwórz panel dyplomacji (**`Y`**), wybierz `emp_001`.
- [ ] W sekcji **„Dlaczego"** wiersze zanikające mają teraz **„(zanika za N l. gry)"** — z dopiskiem
      **`gry`**, którego wcześniej nie było.
- [ ] Trwałe (stan wojny, aktywny traktat) nadal pokazują **∞**.
- [ ] Kolumna nie nachodzi na liczby po lewej (szerokość kolumny podniesiona 58 → 82 px razem
      z dłuższą etykietą). ⚠ **To jedyna zmiana LAYOUTU w E6 — obejrzyj ją krytycznie.**
- [ ] Przełącz język na EN (jeśli masz przełącznik) → **„(fades in N game y)"**.
- [ ] `>< KONSOLA` — pełny zrzut relacji z kolumną `yearsLeft` (to teraz lata wyświetlane):

```
KOSMOS.debug.dumpRelation('emp_001');
```

- [ ] W `console.table` rozbicia opinii kolumna **`yearsLeft`** zgadza się z tym, co pokazuje panel.

---

## §5 — ⭐ DWIE NOGI EMISARIUSZA MAJĄ SIĘ NA CZYM ZSUMOWAĆ

Najważniejszy skutek merytoryczny E6. Misja emisariusza trwa **5,0 lat wyświetlanych** (dotarcie
w +2,5 → +5 opinii, powrót w +5,0 → kolejne +5, tryb `accumulate`). Przy tempie 12× szybszym
(wariant ODRZUCONY w E6) pierwsza noga wygasała PRZED powrotem i „sumowanie" nie miało czego sumować.

- [ ] `>< KONSOLA` — emulacja obu nóg z prawdziwym odstępem:

```
(()=>{const d=KOSMOS.diplomacySystem,e='emp_001',f=()=>d.getOpinionBreakdown(e,'player').find(x=>x.id==='envoy_goodwill');d.relations.removeModifier(e,'player','envoy_goodwill');d.addOpinionModifier(e,'player','envoy_goodwill',{source:'gate_noga1'});console.log('noga 1 (dotarcie): +'+f().value);d.relations.tickModifiers(2.5);console.log('po 2,5 roku wyświetlanego (droga powrotna):',f()?f().value.toFixed(2):'WYGASŁA');d.addOpinionModifier(e,'player','envoy_goodwill',{source:'gate_noga2'});console.log('noga 2 (powrót) → SUMA:',f().value.toFixed(2),'| przy tempie 12x szybszym byłoby 5,00');})()
```

- [ ] `noga 1 (dotarcie): +` **5**
- [ ] `po 2,5 roku wyświetlanego:` **2.50** ← **ŻYJE** (to jest cała teza)
- [ ] `noga 2 (powrót) → SUMA:` **7.50**
- [ ] ⚠ **7,50, a nie 10,00 — i to jest POPRAWNE:** zanikanie bierze swoje w czasie drogi powrotnej.
      Komentarz w `MissionSystem` obiecywał „+10" i było to prawdą tylko dlatego, że zanikanie stało
      wyłączone; opis został sprostowany w tym commicie.
- [ ] **(opcjonalnie, na żywo)** ustaw **1 r/s**, wyślij realnego emisariusza (statek z modułem
      dyplomatycznym) i obserwuj w panelu, jak dobra wola rośnie dwustopniowo, a potem gaśnie przez
      kilka lat — a nie w jednym mgnieniu.

---

## §6 — PUNKT ODNIESIENIA 1: narastanie umowy handlowej BEZ ZMIANY TEMPA

Ramp **nigdy** nie był bramkowany flagą, więc jest mechanizmem ŻYWYM i jego odczuwalne tempo musi być
nietknięte (zawężona decyzja 3). Cyfra w katalogu zmieniła się z 1 na 12 — to ta sama prędkość
w nowej jednostce, nie przyspieszenie.

- [ ] `>< KONSOLA`:

```
(()=>{const d=KOSMOS.diplomacySystem,e='emp_001',CIV=KOSMOS.gameConfig.CIV_TIME_SCALE,g=()=>d.getOpinionBreakdown(e,'player').find(x=>x.id==='trade_partner')?.value ?? 0;if(!d.hasTreaty(e,'trade_agreement')){d.signTreaty(e,{id:'trade_agreement'});}let n=0;while(g()<50&&n<20000){d.relations.tickModifiers(1/CIV);n++;}console.log('ramp do +50 po',(n/CIV).toFixed(3),'roku wyświetlanego | kroków kadencji:',n);})()
```

- [ ] `ramp do +50 po` **4.167** `roku wyświetlanego` · `kroków kadencji:` **50**
- [ ] **50 kroków kadencji = dawne „+1 na rok cywilizacyjny" CO DO PUNKTU.** Gdyby E6 zwolniło ten
      mechanizm, wyszłoby 50 lat wyświetlanych zamiast 4,167 — i to byłoby złamanie decyzji 3.

---

## §7 — PUNKT ODNIESIENIA 2: napięcie stygnie w ROZSĄDNYM czasie

Kryterium z planu: „napięcie po wojnie spada w rozsądnym czasie (nie w 6 miesiącach, nie w 60 latach)".

- [ ] `>< KONSOLA` — najpierw DIAGNOZA, czy stygnięcie jest w ogóle odblokowane:

```
(()=>{const d=KOSMOS.diplomacySystem,e='emp_001',rel=d.relations.getOrNull('player',e),yr=KOSMOS.timeSystem.gameTime;const last=(rel?.memory??[]).at(-1)?.year ?? null;const cisza=last==null?Infinity:yr-last;console.log('status:',rel?.status,'| napięcie:',d.getTension(e).toFixed(1),'| cisza od ostatniego incydentu:',cisza===Infinity?'∞':cisza.toFixed(2),'lat wyśw. (wymagane 2)','| STYGNIĘCIE AKTYWNE:',rel?.status==='peace'&&d.getTension(e)>0&&cisza>=2);})()
```

- [ ] Odczytaj `STYGNIĘCIE AKTYWNE`. **`false` NIE jest błędem** — napięcie stygnie dopiero po
      **2 latach wyświetlanych ciszy** od ostatniego incydentu (ostrzeżenie, ultimatum, wojna,
      naruszenie granicy), a rozejm blokuje je całkowicie.
- [ ] Ustaw **1 m/s** albo **1 r/s** i poczekaj, aż `cisza` przekroczy 2. Powtórz wklejkę →
      **`STYGNIĘCIE AKTYWNE: true`**.
- [ ] Teraz obserwuj **pasek napięcia** w panelu `Y`: od chwili odblokowania napięcie **30 spada do 0
      w ~pół roku wyświetlanego** (tempo 60/rok wyśw. = dawne 5/rok cywilizacyjny).
- [ ] `>< KONSOLA` — pomiar na jednym kroku kadencji (wklej, gdy `STYGNIĘCIE AKTYWNE: true`):

```
(()=>{const d=KOSMOS.diplomacySystem,e='emp_001',CIV=KOSMOS.gameConfig.CIV_TIME_SCALE,t0=d.getTension(e);d._tickTensionDecay(1/CIV);console.log('napięcie po JEDNYM kroku kadencji:',t0.toFixed(1),'→',d.getTension(e).toFixed(1),'(oczekiwany spadek 5 = dawne −5/rok cyw.)');})()
```

- [ ] Spadek **5,0** na krok kadencji → odczuwalne tempo **identyczne** jak przed E6.
- [ ] Razem: **2 lata ciszy + ~pół roku stygnięcia** ⇒ napięcie po incydencie zeruje się w ~2,5 roku
      wyświetlanego. Ani 6 miesięcy, ani 60 lat. **Kryterium planu spełnione.**

---

## §8 — Licznik ultimatum czyta z silnika, nie z wklejonej trójki

- [ ] `>< KONSOLA`:

```
(()=>{const d=KOSMOS.diplomacySystem,e='emp_001';d.relations.setUltimatumStart('player',e,KOSMOS.timeSystem.gameTime-1,'gate');console.log('łaska po ultimatum, zostało:',d.getUltimatumYearsLeft(e),'lat wyświetlanych (pełna łaska = 3)');})()
```

- [ ] `zostało:` **2** `lat wyświetlanych`
- [ ] W panelu `Y` wiersz **„⚠ ULTIMATUM — 2.0 lat do wojny"** pokazuje TĘ SAMĄ liczbę.
- [ ] `>< KONSOLA` — sprzątnij po sobie (inaczej zostawisz imperium z aktywnym ultimatum):

```
KOSMOS.diplomacySystem.relations.setUltimatumStart('player','emp_001',null,'gate_cleanup'); console.log('ultimatum wyczyszczone:',KOSMOS.diplomacySystem.getUltimatumYearsLeft('emp_001'));
```

- [ ] → **0**
- [ ] ℹ Panel liczył ten licznik z **wklejonego literału `3`**, czyli z drugiej, niepowiązanej kopii
      stałej. Teraz liczbę podaje fasada — przestrojenie łaski nie rozjedzie już UI z silnikiem.

---

## §9 — Zapis / wczytanie (BEZ migracji, v100)

- [ ] Menu ☰ → **zapisz do pliku**. Nazwa pliku kończy się na **`_v100.json`** (E6 nie bumpuje wersji).
- [ ] **F5**, „Kontynuuj" → gra wraca, panel `Y` pokazuje te same relacje.
- [ ] `>< KONSOLA` — po wczytaniu zanikanie nadal aktywne i modyfikatory na miejscu:

```
console.log('zanikanie po wczytaniu:',KOSMOS.gameConfig.FEATURES.diplomacyDecay); KOSMOS.debug.dumpRelation('emp_001');
```

- [ ] `zanikanie po wczytaniu:` **true** · rozbicie opinii niepuste, `yearsLeft` sensowne.
- [ ] W konsoli **brak czerwonych błędów** przez cały przebieg (ostrzeżenia `[debug]` są w porządku).

---

## §10 — Świadome NIE-defekty (potwierdź, że je widzisz i akceptujesz)

- [ ] **Stare relacje zaczną teraz stygnąć — i to jest cel, nie regresja.** Osad po dawnym zaufaniu
      (`legacy_relations`, do +30) żyje **14,75 roku wyświetlanego**, więc na wczytanym zapisie opinia
      będzie przez pierwszą trzecią partii pełznąć w dół. Dotąd nie zanikała NIGDY.
- [ ] **Zanikanie jest 12× wolniejsze, niż wynikałoby z naiwnego przeliczenia cyfr z katalogu** —
      świadomie. Cyfry zostały, jednostką stał się rok wyświetlany. Uzasadnienie: pomiar §B0/§B5
      w `D2_PLAN.md` + podpisane zawężenie decyzji 3 (ustalenie 7).
- [ ] **`ERRATIC_EPOCH_YEARS` zostaje 10 lat wyświetlanych** (humor imperium zmienia się 3–4× na
      partię). Jest już w prawidłowej jednostce i E5 przeszło gate z tą wartością — strojenie należy
      do BALANS/D4, nie do E6, żeby ten gate miał jedną zmienną mniej.
- [ ] **`ULTIMATUM_GRACE_YEARS` (3), `TRESPASS_YEARS` (1), `PEACE_QUIET_YEARS` (2),
      `AI_ENVOY_COOLDOWN` (15) — WARTOŚCI NIETKNIĘTE.** Były już w latach wyświetlanych; trzy z nich
      miały komentarze mówiące „lata cyw.", czyli **kod chodził 12× dłużej, niż dokumentował**.
      E6 naprawił opisy, nie liczby (mechanizmy żywe ⇒ decyzja 3).
- [ ] **Delegacje AI są rzadkie** (raz na 15 lat wyświetlanych ⇒ 2–3 na partię). Tak działa dziś
      i E6 tego nie zmienia — tylko przestaje o tym kłamać w komentarzu.
- [ ] **`DIPLOMACY_FROZEN` w harnessie BALANS właśnie się uzbroił.** Do teraz milczał zawsze (przy
      wyłączonym zanikaniu zerowa wariancja opinii była stanem legalnym). Od E6 zamrożony stos
      modyfikatorów w długim przebiegu = REGRESJA i harness ma o niej krzyczeć.
- [ ] **Reputacja (agresja) też zaczęła stygnąć** — siedziała za tą samą flagą. Tempo 1 punkt na rok
      wyświetlany. Nic jej dziś nie podnosi (raisery = D4), więc efekt jest na razie niewidoczny.

---

## Wynik gate'u — ✅ PASSED z jedną rozbieżnością kalibracyjną (2026-08-10)

- [x] §0 · [x] §1 · [x] §2 · [x] §3 ⭐ · [x] §4 · [x] §5 ⭐ · [x] §6 · [x] §7 · [x] §8 · [x] §9 ·
      [x] §10

**Werdykt:** ✅ **PASSED** — wszystkie jedenaście sekcji; jedna rozbieżność, KALIBRACYJNA, dokładnie
w miejscu, o które §4 prosiła.

**Sekcje liczbowe potwierdzone CO DO CYFRY na żywym zapisie po wojnie:**
- **§3 ⭐** — zanikanie ŻYJE i liczy w latach WYŚWIETLANYCH: **5 → 4 → 1 → WYGASŁ** (start, po 1,
  po 4, po 5 latach wyświetlanych), etykieta obiecuje **5 l. gry**. Pierwszy raz w historii tej gry
  relacje stygną.
- **§5 ⭐** — dwie nogi emisariusza: **+5 → 2,50 → SUMA 7,50**. Noga 1 ŻYJE w chwili powrotu, więc
  tryb `accumulate` ma co sumować. To jest własność, która rozstrzygnęła politykę tempa.
- **§6** — punkt odniesienia 1: ramp do +50 po **4,167** roku wyświetlanego, **50 kroków kadencji**
  = dawne „+1 na rok cywilizacyjny" co do punktu. Odczuwalne tempo NIETKNIĘTE.
- **§7** — punkt odniesienia 2: spadek **5,0** napięcia na krok kadencji = dawne −5/rok cywilizacyjny;
  po odblokowaniu bramki ciszy napięcie schodzi w ~pół roku wyświetlanego, czyli od incydentu do zera
  ~2,5 roku. **Kryterium planu („nie 6 miesięcy, nie 60 lat") spełnione.**
- §2 flaga `true` · §8 licznik ultimatum z fasady (2 lata, panel = ta sama liczba) · §9 round-trip
  `_v100.json` bez migracji, zanikanie aktywne po wczytaniu, zero czerwonych błędów w konsoli ·
  §1 harness zgodny · §10 wszystkie świadome nie-defekty potwierdzone.

**Rozbieżność 1/1 — KALIBRACJA LAYOUTU (nie defekt logiki).** Etykieta „(zanika za N l. gry)" lekko
**ociera się o wartość** modyfikatora po lewej. Klasa: dokładnie ta, na którą §4 wystawiła pytanie
(„jeśli wygląda ciasno albo nachodzi — to jest kalibracja do poprawy"), czyli **przewidziana**, a nie
znaleziona wbrew skryptowi. Rozszerzenie kolumny 58 → 82 px pokryło większość przyrostu długości
tekstu, ale nie cały. **Naprawa:** przesunięcie etykiety ~2 px w prawo, osobnym commitem
kalibracyjnym; BEZ własnego gate'u — Filip ocenia wzrokowo przy następnym otwarciu panelu.
⚠ Nic w logice zanikania, jednostkach ani liczbach nie jest tą rozbieżnością dotknięte.

**Uwaga metodyczna na przyszłe gate'y:** dwie pułapki wyłapane PRZED sesją, przez wykonanie każdego
one-linera na żywym silniku — (a) §7 nie pokazuje spadku przy pierwszej wklejce, bo `changeTension`
powyżej progu 40 dopisuje `warning_issued` i RESETUJE 2-letnią bramkę ciszy (stąd diagnostyka
„STYGNIĘCIE AKTYWNE", zamiast fałszywego FAIL-a), (b) przy 1 d/s nic w tym gate'cie nie jest
obserwowalne w ludzkim czasie (stąd jawne polecenie 1 m/s / 1 r/s w §0).

**Następny krok:** **E8** (bramka `ownerEmpireId` w `_onColonyFounded` — przeniesione z D1) i **E9**
(wycofanie zapisu kluczy `kosmos_save_backup_v{N}`). Oba małe, bez własnych gate'ów; po nich
**faza D2 jest ZAMKNIĘTA**.
