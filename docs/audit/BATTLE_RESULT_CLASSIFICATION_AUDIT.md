# AUDYT — klasyfikacja wyniku bitwy w `UIManager` (Finding 157)

> **Data:** 2026-08-27 · **Zakres:** read-only, pomiar w źródle. **Kod nie był pisany podczas audytu.**
> **Rejestr macierzysty:** `docs/design/VESSEL_ORDERS_PLAN.md` §Findings 157 (+ nowe 161-163).
> **Podpis właściciela:** **W3** — auto-slow przez kanon `BattleSides`, gałąź `log.m4.battleResolved*`
> **wycofana**; `GameScene` zostaje JEDYNYM narratorem bitwy.

---

## 1. Jedno zdanie

`UIManager` rozpoznaje gracza w bitwie po **koniunkcji** `type === 'vessel_group' && empireId === 'player'`,
a obrona orbitalna opisuje gracza jako `{ type: 'player' }` — więc walka o stolicę **nie dostaje od tego
konsumenta ani linii Dziennika, ani auto-slow**; z tych dwóch brakuje realnie tylko **auto-slow**, bo
klasyfikację wyniku dowozi już `GameScene` i baner.

---

## 2. Mechanizm

`src/scenes/UIManager.js:1383`:

```js
const isPlayerSide = (p) => p?.type === 'vessel_group' && p?.empireId === 'player';
```

Trzy kształty uczestnika w repo (zmierzone):

| producent | `participantA` | `participantB` | filtr `:1383` |
|---|---|---|---|
| **DSCS** `:1005-1020` | `vessel_group` + `empireId` z `_resolveOwner` (dla gracza **literał `'player'`**, `:1513`) | `vessel_group` | ✅ przechodzi |
| **EnemyAttackHandler** `:172-186` | `vessel_group` + `empireId` **AI** | `{type:'player', empireId:'player', systemId}` `:181` | ❌ **odpada na `type`** |
| **WarSystem** `forceBattle:416` / `_fleetArrived:550` | `{type:'empire'}` | `{type:'player', empireId:'player'}` | ❌ **odpada na `type`** |

⚠ **Przyczyna jest starsza, niż sugeruje rejestr.** `git log -S` na tej linii wskazuje **`b2be101`,
2026-05-14 (M4 P1)** — filtr powstał, gdy jedynym producentem bitew „z graczem" była rodzina
vessel-combat. **W3-7 dostemplował `empireId` na EAH**, żeby domknąć klasę S25 u trzech konsumentów,
ale ten pyta **też** o `type` — stempel go nie uratował. To niezrewidowane założenie z maja, nie regresja W3.

⚠ **Zasięg szerszy niż tytuł findingu:** dotyczy **trzech** producentów, nie samej obrony stolicy.
`forceBattle` jest żywy (przycisk `WarOverlay:354`), `_fleetArrived` obsługuje stare zapisy po W3-8.

---

## 3. Realny skutek — rozdzielony na dwie połowy

### 3.1 Czego gracz NIE traci (obrona orbitalna ma dziś pełną narrację)

- **Baner/kino** — `GameScene:2325` → kolejka → `showBattleIntro` (`BattleIntroModal.js:37`) **pauzuje grę**;
  po niej `showBattleOutcome` `:215` wyświetla pełnoekranowe **ZWYCIĘSTWO/PORAŻKA/REMIS** i **czeka na OK**
  (`:318-330` — brak auto-dismiss). Werdykt jest **poprawny po naprawie 155**: `playerSide` pochodzi
  z uczestników (`resolveBattleSides`).
- **Dziennik** — `GameScene:2380` → `log.battleLine` z nazwami stron, zwycięzcą i **poprawną severity**
  (`:2419-2423`: `info` przy wygranej, `alert` przy przegranej, `warn` gdy strony gracza nie da się ustalić).

### 3.2 Czego gracz traci — cięższa połowa: **auto-slow**

Pełny inwentarz wywołań `_triggerAutoSlow*` w repo (6 miejsc):
`TimeSystem` — kolizja `:39`, życie `:42/:44/:46`, faza dysku `:48`, **`vessel:engaged` `:51`**;
`UIManager` — `fleet:retreatTriggered` `:846`, `vessel:engaged` `:1370`, **`battle:resolved` `:1388`**,
`war:declared` `:1462`; `GameScene` — `colony:captured` `:2311`.

**`vessel:engaged` ma dokładnie JEDNEGO producenta — `DeepSpaceCombatSystem:395`.** EAH nie emituje go nigdy.

⇒ **Bitwa o stolicę gracza nie zwalnia czasu w ŻADNYM punkcie swojego cyklu życia.**

Dlaczego pauzujący baner tego nie zastępuje: `setMultiplier` (`TimeSystem:129-138`) **nie dotyka `isPaused`** —
pauza i mnożnik są ortogonalne. `_restoreTime` (`BattleIntroModal:201-206`) emituje `time:play`, więc po
kliknięciu OK gra wraca **do prędkości sprzed bitwy**:

> 100 lat/s → uderzenie AI → baner PORAŻKA → OK → **znowu 100 lat/s** →
> `InvasionSystem._onVesselGroupVictory:198` (żywe wejście desantu AI) → desant → utrata kolonii.

Auto-slow na `colony:captured` istnieje — czyli gra zwalnia dopiero, **gdy kolonia już upadła**, a nie przy
bitwie, która o tym rozstrzygnęła.

### 3.3 Druga połowa — linia `log.m4.battleResolved*`, wartość wątpliwa

To **drugi** wpis o tej samej bitwie (DSCS dostaje dziś oba: `GameScene` + `UIManager`), z **surowym
`battleId`** w tekście widocznym dla gracza (`log.m4.battleResolvedVictory` = „Zwycięstwo w bitwie {0}…")
i z **płaską wagą**: `_log(...,'combat')` → `TYPE_MAP.combat` (`EventLogSystem:53`) daje `severity: 'warn'`
**niezależnie od wyniku** — zwycięstwo ląduje z wagą ostrzeżenia. Linia z `GameScene` jest pod każdym
względem lepsza (nazwy stron, poprawna severity, i18n, bez surowego id).

---

## 4. Czy kanon `BattleSides` jest bezpieczny

**Tak.** `isPlayerParticipant` pyta o `empireId === 'player' || type === 'player'`. Przegląd **wszystkich**
producentów `type: 'player'` w `src/` daje trzy miejsca (EAH `:181`, WarSystem `:416`, `:550`) i **wszystkie
trzy to naprawdę gracz**. Zero fałszywych trafień — poszerzenie nie wpuszcza imperium.

⚠ Jedno zastrzeżenie proceduralne: podmiana musi wziąć **całą regułę**, nie sam predykat. Dziś `:1387` robi
`playerSide = playerA ? 'A' : 'B'`, więc przy kształcie „gracz po obu stronach" cicho wybiera `'A'`.
`resolveBattleSides` zwraca w tym wypadku `playerSide === null` i **REGUŁA BRAKU** wymaga, by wołający to
uniósł (wzór `GameScene:2419`). Inaczej przenosimy kanon i gubimy jego rdzeń.

---

## 5. Zastrzeżenia Z-klasy

**Z1 — „naprawa przez dodanie linii" idzie POD PRĄD slice'u 150/155.** Tamten ustalił *jedna bitwa = jedno
ogłoszenie*. Dziś jedna emisja DSCS daje **dwie linie** w Dzienniku — to dwaj narratorzy, nie duplikat emisji.
Poszerzenie filtru rozciągnęłoby tę dwoistość na EAH.

**Z2 — potyczka bez wojny dostałaby TRZECIĄ linię.** Gałąź EAH bez wojny (`:214-219`) pisze **własny** wpis do
Dziennika, a potem emituje `battle:resolved` `:228` → `GameScene` dokłada `log.battleLine`. To już dziś **dwie**
linie; po poszerzeniu byłyby **trzy**.

**Z3 — severity.** `combat → warn` na sztywno (§3.3). Naprawa „dodaj linię" wnosi wpis mylnie ważony; naprawa
„dodaj linię porządnie" = `evtLog.push` z własną severity, czyli już nie jedna linia.

**Z4 — w kodzie, który 157 dotyka, siedzi zahardkodowany polski.** `UIManager:1390`:
`const retreatedSide = result.retreated === playerSide ? 'gracz' : 'wróg'` — literał PL wstrzykiwany do klucza
i18n. Gracz EN widzi `Battle X — side "gracz" retreated`. Klasa **Findingu 113**; `check-i18n` tego nie widzi
(pyta o klucze w `t()`, nie o literały). Rozszerzenie tej gałęzi na EAH **propagowałoby defekt na nową ścieżkę**.
⚠ W3 **kasuje ten literał razem z gałęzią** — to jedyny sposób naprawy, który nie wymaga nowych kluczy.

**Z5 — auto-slow jest bezpieczne w każdej kolejności.** `_triggerAutoSlow` (`TimeSystem:160-166`) ustawia tylko
`multiplierIndex`; `setMultiplier` **nie dotyka `isPaused`** ⇒ brak ryzyka odpauzowania gry pod otwartym modalem.
Guard `multiplierIndex <= 1` czyni je idempotentnym (DSCS dostaje je dziś dwukrotnie — z `TimeSystem` i
`UIManager` — bez szkody).

**Z6 — granica dowodu.** `UIManager` **nie importuje się pod node**: po podstawieniu `localStorage` przewraca się
na `THREE.TextureLoader is not a constructor` — ta sama ściana co `ColonyOverlay`. Stub w `node_modules/`
**świadomie nie eksportuje `TextureLoader`** i **nie wolno go podnosić** (byłaby to zieleń wyłącznie na jednej
maszynie). ⇒ keeper = **pin ŹRÓDŁOWY** na `UIManagerze` (wzór `battle_sides_smoke` T6, z kontrolą pinu na kodzie
sprzed naprawy) + **pin WYKONANIOWY** na `isPlayerParticipant` z tabelą trzech kształtów. Zachowanie na żywo —
tylko live-gate.

---

## 6. Warianty i podpis

| | co robi | koszt |
|---|---|---|
| **W1** | poszerza filtr kanonem → auto-slow **i** linia dla trzech producentów | wchodzi w Z1/Z2/Z3/Z4; potyczka = 3 linie |
| **W2** | auto-slow przez kanon; gałąź logowania zostaje za starym, wąskim filtrem | zero regresji, ale zostawia asymetrię i cały ładunek Z3/Z4 |
| **W3** ✅ **PODPISANY** | auto-slow przez kanon; **gałąź `log.m4.battleResolved*` WYCOFANA** — `GameScene` jedynym narratorem | usuwa linię widoczną dziś przy bitwach DSCS (zmiana zachowania, **zaakceptowana przez właściciela**); 4 klucze i18n tracą jedynych konsumentów |

**Uzasadnienie W3:** finding mówi „brak klasyfikacji", ale pomiar mówi, że klasyfikacja **jest** — w banerze
i w `log.battleLine`. Brakuje **auto-slow**. W3 dowozi brakujące i likwiduje gorszego z dwóch narratorów
zamiast go rozmnażać — czyli trzyma linię 150/155.

⚠ **Zakres usunięcia:** `log.m4.battleResolvedVictory/Defeat/Draw/Retreat` mają **dokładnie czterech
konsumentów**, wszystkich w `UIManager:1391-1397` (grep). Po wycofaniu gałęzi klucze zostają w słownikach
jako osierocone — `check-i18n` pyta o kierunek „klucz użyty w `t()` istnieje w PL i EN", więc nieużywany klucz
bramki nie łamie. Decyzja o ich skasowaniu = osobna higiena, poza tym slice'em.

---

## 7. Znaleziska poboczne (wpisane do rejestru jako 161-163)

- 🟠 **161 — baner bitwy ODPAUZOWUJE ręcznie zapauzowaną grę.** `BattleIntroModal.js:41` i `:218` czytają
  `timeSystem.paused`, a `TimeSystem` ma **`isPaused`** (`:22`) i pola `paused` nie ma nigdzie ⇒ `wasPaused`
  zawsze `false` ⇒ `_restoreTime:203` **zawsze** emituje `time:play`. Osiągalność wąska (bitwa musi rozstrzygnąć
  się przy pauzie — realnie `forceBattle` z `WarOverlay`), **niezmierzona na żywo**.
- 🟠 **162 — EAH bez wojny pisze WŁASNĄ, zahardkodowaną po polsku linię Dziennika** (`:214-219`) obok
  `log.battleLine` z `GameScene` ⇒ potyczka bez wojny = **dwie** linie, jedna po polsku dla gracza EN.
  Klasa Findingu 113/158.
- 🟠 **163 (dodatek do 158) — `showBattleOutcome` też ma zaszyty polski.** `BattleIntroModal:226-231`
  (`ZWYCIĘSTWO`/`PORAŻKA`/`REMIS`) oraz `:288-292` (`Tur:` / `Straty:`) — w najczęściej oglądanym oknie walki.
  158 wskazywał `:130,139,226-231`; ten wpis dokłada pomiar drugiego bloku i nazywa ścieżkę banera osobno,
  bo baner pokazuje się **także wtedy, gdy gracz pominął kino**.

---

## 8. Live-gate 2026-08-27 — wynik

**Kroki 1, 2, 5 — PASS.** Auto-slow po bitwie orbitalnej działa (przy 1 rok/s po zamknięciu banera
prędkość wraca na **1 dzień/s**, nie na tę sprzed bitwy). Dziennik ma **dokładnie jedną** linię:
`⚔ Battle in Mstow: Rój Testowy vs Player. Winner: Player. Losses: 68/168, 20 turns. Enemy retreated.`
Konsola czysta.

**Krok 3 — potwierdzone jako OSOBNY finding (165), nie porażka naprawy.** Obrona orbitalna dostaje
sygnał czasowy dopiero na rozstrzygnięciu, bo **wcześniej nie ma czego obserwować**: EAH rozstrzyga
walkę JEDNYM wywołaniem `resolveBattle`, bez rund i bez `vessel:engaged`. 157 dowiózł jedyny sygnał,
jaki ta ścieżka w ogóle ma.

**Krok 4 — 🔴 zgłoszony przez właściciela jako porażka; przyczyną był BŁĄD W KROKU GATE'U, nie kod.**
Kazałem wyłączyć auto-slow w menu — **takiego przełącznika nie ma**: `time:autoSlowToggle` ma handler
i **zero producentów**, `_autoSlowEnabled` nie jest serializowane, a menu oferuje „Auto-pauza…", czyli
inny system (`AutoPauseSystem`, bez `battle:resolved`). Zapisane jako **Finding 164**.
⚠ Konsekwencja dla keepera: asercja o guardzie pinuje **model**, nie wolę gracza — jest tak oznaczona,
a dołożony pin **zapłonie**, gdy przełącznik zyska nadawcę.
⚠ Lekcja rozszerza `validate-gate-oneliners-on-live-engine`: **weryfikuj też ISTNIENIE elementu UI,
który każesz komuś kliknąć**, nie tylko składnię jednolinijkowca.
