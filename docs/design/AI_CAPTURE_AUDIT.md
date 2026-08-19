# AUDYT — mechanika `_tryPlayerCapture` i lustro dla kierunku AI

**Data:** 2026-08-19 · **HEAD:** `0e6ea0d` · **Save:** v101 · **Zakres:** read-only. Zero zmian w kodzie,
zero migracji, zero nowych plików w `src/`.
**Powód:** Finding 51 (`docs/design/W3_PLAN.md:945-953`) — GATE 3 zdany WARUNKOWO, bo „desant AI nigdy
nie kończy się przejęciem kolonii". Właściciel chce zbudować lustro reguły: **stolica + wybita armia
obrońcy + timer ~6 miesięcy (ten sam co `OCCUPY_DURATION`)** — i pyta, czy da się to po prostu skopiować
z istniejącej ścieżki gracza.
**Metoda:** odczyt źródeł + **WYKONANIE** (headless `GameCore`, dwie sondy: ścieżka przejęcia oraz skutki
`transferColony`) + **weryfikacja adwersarialna** pięciu tez nośnych (każda sprawdzana z założeniem, że
jest fałszywa). Sondy pisały wyłącznie do katalogu tymczasowego — **w repo nie powstał żaden plik poza
tym dokumentem**.
**Charakter:** materiał wejściowy pod `AI_CAPTURE_PLAN.md`. Bez implementacji, bez rekomendacji
balansowych.

**Legenda znaczników:**
`[V]` — przeczytane w źródle i potwierdzone dwukrotnie (audytor + adwersarz) ·
`[ZMIERZONE]` — wynik wykonania sondy, z surowym fragmentem outputu ·
`[Z KODU]` — wniosek z lektury, nie z wykonania ·
`[NIEPEWNE]` — jedno źródło, brak potwierdzenia pomiarem; **nie opierać na tym decyzji**.

---

## WERDYKT (jednym zdaniem, na początku)

> **Nie ma czego kopiować: lustro po stronie AI ISTNIEJE, jest zamontowane, jest jedynym produkcyjnym
> wywołującym `transferColony` i już koduje regułę właściciela — `InvasionSystem._tickCaptureChecks:349-386`
> → `_captureColony:388` → `ColonyManager.transferColony:654`, zmierzone na żywym silniku aż do
> `colony:captured previousOwner:"player"`. Brakuje trzech innych rzeczy: (1) **intencji terytorialnej
> naziemnego AI** — jedyny mover jednostek celuje w JEDNOSTKI gracza i zamiera, gdy nie ma kogo gonić
> (`GroundUnitManager.js:997-1007`), co tworzy **deadlock z warunkiem „armia wybita"**; (2) **trwałości
> kampanii** — rekord inwazji gaśnie razem z ostatnim najeźdźcą, a gałąź `defenders_repelled:365-370`
> wykonuje się PRZED testem stolicy `:379-382`; (3) **rozstrzygnięcia dwóch semantyk, które właściciel
> uważa za gotowe** — „cała armia wybita" znaczy dziś „zero jednostek o roli `military`" (garnizony,
> działa AA, medycy i zwiad gracza NIE blokują przejęcia — zmierzone), a „timer 6 miesięcy" jest liczony
> poprawnie, ale mierzy trzymanie HEKSA i jest PRZESŁANKĄ warunku „stolica", nie karencją po spełnieniu
> obu warunków.**

Drugie zdanie, bo determinuje kształt przyszłego gate'u: **ta połowa silnika ma ZERO pokrycia keeperem** —
`grep -rln "_tickCaptureChecks\|_captureColony\|defenders_repelled\|colony_captured" src/testing/` zwraca
pustkę `[V]`. To wyjaśnia, jak Finding 51 mógł powstać: nie było czego zmierzyć poza obserwacją na żywo,
a obserwacja („kolonia nie zmieniła rąk") jest **prawdziwa dla skutku i fałszywa dla przyczyny**.

### Korekta Finding 51 — proponowane brzmienie do `W3_PLAN.md`

> **Desant AI nie kończy się przejęciem kolonii, bo najeźdźca nigdy nie dochodzi do stolicy — nie
> dlatego, że brakuje lustra `_tryPlayerCapture`.** Lustro istnieje (`_tickCaptureChecks` →
> `_captureColony` → `transferColony`), jest zamontowane i przejmuje kolonię w pierwszym tiku, w którym
> stolica należy do agresora, a gracz nie ma jednostek o roli `military`. Jedyny mechanizm ruchu jednostek
> naziemnych AI (`GroundUnitManager._tickCombatAI:997-1013`) celuje w najbliższą ŻYWĄ jednostkę gracza
> i przy jej braku nie rusza się wcale ⇒ warunek „armia wybita" i warunek „stolica zdobyta" wykluczają
> się wzajemnie. Obserwacja z gate'u („`gu_42` **stał** na Nekkar d") była opisem tego deadlocku.

### Numeracja linii — ostrzeżenie

`InvasionSystem.js` ma **442 linie** `[V]`. Adres „`:223-250`" krążący w dokumentach (i w treści zadania)
jest nieaktualny: `_tryPlayerCapture` to **`:318-345`**; `docs/audit/COMBAT_DIPLO_AUDIT.md:211` podaje ten
sam stary adres. Wszystkie anchory w TYM dokumencie odczytano w źródle na `0e6ea0d`.

---

## 1. Q1 — pełna logika `_tryPlayerCapture` (i co stoi po drugiej stronie)

### 1.1 Predykat jest AGREGOWANY na poziomie kolonii, nie per-hex

`_tryPlayerCapture(planetId)` `[V]` `:318-345` czyta **jedną** kolonię i podejmuje **jedną** decyzję:

| krok | linia `[V]` | treść |
|---|---|---|
| lokatory | `:319-321` | `colonyManager` + `groundUnitManager` z `window.KOSMOS`; brak → `false` |
| istnienie kolonii | `:323-324` | `getColony(planetId)`; brak → `false` |
| **idempotencja** | `:326` | `!colony.ownerEmpireId \|\| === 'player'` → `false` (nic do przejęcia) |
| **„armia wybita"** | `:329-331` | `getUnitsOnPlanet(planetId).some(u => u.owner && u.owner !== 'player' && (u.hp ?? 0) > 0)` → żywy obcy ⇒ `false` |
| stolica | `:333-337` | `tiles.find(t => t?.capitalBase)`; gdy istnieje: `capital.owner !== 'player'` ⇒ `false` |
| gałąź outpostu | `:338-342` | brak stolicy ⇒ wystarczy `tiles.some(t => t.owner === 'player' && (t.buildingId \|\| t.capitalBase))` |
| egzekucja | `:344` | `colMgr.captureColonyForPlayer?.(planetId, 'ground_invasion') === true` |

**„Skąd wie, że stolica jest zdobyta":** wyłącznie z pola `tile.owner` na kaflu, który ma
`capitalBase === true`. To jedyne źródło. Kafel jest stanem **trwałym** (`HexTile.js:302-303` serialize /
`:323-324` restore `[V]`), a pisze go tylko `GroundUnitManager._changeTileOwner:615-620` `[V]` (okupacja)
oraz oba egzekutory przejęcia (hurtowy przepis wszystkich kafli).

**Czy sprawdza całkowite zniszczenie obrony:** tak — i **szerzej niż strona AI**. Predykat gracza
(`:329-331`) blokuje przejęcie na **KAŻDEJ** żywej jednostce obcego, bez filtra roli: łazik, medyk, dron.
Nie odróżnia „wybitej" od „wycofanej" — liczy to, co JEST na planecie: `getUnitsOnPlanet:233-239` filtruje
**wyłącznie** `status === 'in_cargo'` `[V]`, więc jednostka `offline` liczy się jako obrońca, choć
`CombatSystem` wyklucza ją z walki.

**Timera nie ma.** W całym `_tryPlayerCapture` nie ma odwołania do czasu — ani `_year()`, ani `startYear`,
ani `occupyStart` `[V]`. Cały czas mieszka o piętro niżej, w okupacji kafla (§2).

### 1.2 Dwie ścieżki wywołania — jedna jest MARTWA U ŹRÓDŁA

| ścieżka | linia | stan |
|---|---|---|
| event `groundUnit:buildingCaptured` → `_tryPlayerCapture` | `:57-59` `[V]` | **NIGDY SIĘ NIE ODPALA** |
| skan okresowy `_tickPlayerConquestChecks` (wszystkie kolonie z `ownerEmpireId`) | `:304-311` `[V]`, kadencja `:45-52` | jedyna żywa ścieżka |

Dowód martwości: producentem `groundUnit:buildingCaptured` jest `GroundUnitManager._tickCaptures:782` →
`:810`, karmiony wyłącznie przez `GroundUnitManager.capture()`; jedyne wywołanie `capture()` w całym `src/`
to `groundAbilities.js:28` (`GROUND_ABILITIES.capture_building.execute`), a **`execute` tej zdolności nie
jest w `src/` wołane z żadnego miejsca** `[V]` (grep `.effect(` → wyłącznie komentarz
`groundAbilities.js:5`). [ZMIERZONE, sonda 1 §4e]: przez 600 civYears pełnej autonomii
`buildingCaptured = 0`, `capturingBuilding = 0`, przy `tileOwnerChanged = 26`.

⚠ **Konsekwencja dla dokumentacji:** wiersze tabeli zdarzeń w `CLAUDE.md` mówiące, że
`groundUnit:capturingBuilding` / `groundUnit:buildingCaptured` płyną do `ColonyOverlay` / `InvasionSystem`,
**nie odpowiadają kodowi**. Kierunek gracza trzyma dziś wyłącznie skan okresowy. **Nie reużywać tego
eventu jako wyzwalacza dla kierunku AI** (pułapka T3).

Kadencja obu skanów `[V]` `:45-52`: akumulator `civDeltaYears`, próg `1.0` ⇒ **raz na 1 civYear = raz na
jeden WYŚWIETLANY MIESIĄC**.

### 1.3 Strona AI istnieje i nie jest lustrem — jest wariantem

| element | GRACZ `_tryPlayerCapture:318-345` | AI `_tickCaptureChecks:349-386` |
|---|---|---|
| wyzwalacz | bezstanowy skan **wszystkich** kolonii AI `:304-311` | **tylko** żywy rekord `listActive():355` |
| bramka idempotencji | `:326` | **brak** (nie sprawdza, czy agresor już jest właścicielem) |
| „armia wybita" | `:329-331` — **każda** żywa jednostka obcego | `:358-362` — tylko `u.role === 'military'` |
| wymaga własnych jednostek | nie | **tak** — `:365-370` gasi rekord jako `defenders_repelled`, gdy `enemyUnits.length === 0`, **PRZED** testem stolicy |
| stolica | `:335-337` (`owner !== 'player'` ⇒ odmowa) | `:379-382` (`capital.owner === inv.aggressor`) |
| brak stolicy (outpost) | **gałąź zapasowa** `:338-342` | `:380` `if (!capital) continue` ⇒ **placówka gracza niezdobywalna** |
| timer | brak | brak |
| egzekutor | `captureColonyForPlayer:768` | `_captureColony:388` → `transferColony:654` |
| diagnostyka odmowy | **żadna** (ani log, ani event, ani `DebugLog`) | tylko `invasion:repelled:368`, bez konsumenta UI |

**[ZMIERZONE, sonda 1 §3] — lustro AI jest sprawne i domknięte:**

```
[3a] obrońca gracza (role=military) żyje → ownerEmpireId=null  colony:captured=0  inv.active=1
     ⇒ bramka playerMilitary DZIAŁA
[3b] obrońca usunięty, capital.owner="emp_001", 2 civY:
     colony.ownerEmpireId = "emp_001"
     colony:captured = 1  {previousOwner:"player", population:9, wasHomePlanet:true}
     rekord: active=false  endReason="colony_captured"
     kolonia nadal w rejestrze = true   getColoniesByEmpire(emp_001).length = 2
```

### 1.4 Martwe pola tej ścieżki (grep całego `src/`)

| pole | linia | stan |
|---|---|---|
| `CAPTURE_GRACE_YEARS = 3.0` | `InvasionSystem.js:26` | **MARTWE** — jedyne wystąpienie w repo; nagłówek `:14-18` obiecuje „trwa już 3+ civYears", kodu nie ma ⇒ **zero grace, przejęcie w pierwszym spełniającym tiku** |
| `inv.playerEmptySince` | `:141` (init `null`) + komentarz `:6` | **MARTWE** — zero odczytów. **Wolny, serializowany slot** (patrz W-C) |
| parametr `years` w `_tickCaptureChecks(years)` | `:349` | nieużywany w ciele |
| parametr `dt` w `_tickOccupation(dt)` | `GroundUnitManager.js:564` | nieużywany (timer absolutny) |
| `tile:ownerChanged` | `GroundUnitManager.js:619` | **ZERO subskrybentów** `[V]` — gracz nie dostaje sygnału, że wróg zajmuje mu kafle, w tym stolicę |
| `getInvasionForPlanet` | `InvasionSystem.js:70-72` | **ZERO konsumentów** — rekord inwazji jest dla UI niewidoczny w całości |

---

## 2. Przepływ zmierzony: walka na heksach → flip kafla → przejęcie kolonii

### 2.1 Gdzie leży licznik czasu i jak (nie) agreguje się do „kolonia przejęta"

Licznik jest **per-hex** i mieszka na kaflu: `tile.occupyEmpireId` + `tile.occupyStart`
(`HexTile.js:257-259`) `[V]`. Pętla `GroundUnitManager._tickOccupation:564-613` `[V]`:

1. pomija jednostki `moving` / `in_cargo` / `hp<=0` — `:571-573`;
2. pomija kafel, którego właściciel **równa się** właścicielowi jednostki — `:580`;
3. kafel **pusty** ⇒ **flip natychmiastowy** — `:589-591` (oraz `_captureHexOnEntry:625-635` przy wejściu w ruchu);
4. kafel z `buildingId` **lub** `capitalBase` ⇒ stempel `occupyEmpireId`/`occupyStart`, potem
   `elapsed = this._year() - tile.occupyStart >= OCCUPY_DURATION` ⇒ flip **i wyczyszczenie stempla** — `:594-604`;
5. `_cleanupStaleOccupations:637-652` zeruje stempel każdego kafla, na którym w tej iteracji nie było
   okupanta tej samej frakcji; indeks trzyma **jednego** okupanta na kafel (`:585`, last-writer-wins).

**Agregacji na poziomie kolonii NIE MA.** Flip kafla emituje `tile:ownerChanged` (zero subskrybentów),
a „kolonia przejęta" to niezależny odczyt **jednego** kafla ze `capitalBase` przy najbliższym tiku skanu.
Nie ma reguły „wszystkie kafle przez X czasu" — jest **jeden kafel: stolica**.

### 2.2 Jednostka czasu — poprawna, choć etykieta kłamie

`OCCUPY_DURATION = 6 / 12` `[V]` `GroundUnitManager.js:565` porównywana z `this._year()` (`:600-601`),
a `_year()` to `timeSystem.gameTime` (`:967`) ⇒ **lata WYŚWIETLANE**.

- **realna wartość: 0,5 roku wyświetlanego = 6 wyświetlanych miesięcy = 6 civYears** — dokładnie to,
  o co prosi właściciel;
- komentarz w tej samej linii („6 miesięcy = 0.5 civYear") jest **błędną etykietą**: 0,5 civYear to pół
  wyświetlanego miesiąca (~15 dni);
- [ZMIERZONE] sonda 1 §4a: flip kafla z budynkiem po **0,5417 roku wyśw.**; sonda 2 §6: **8 civYears
  (0,6667 r. wyśw.)** przy próbkowaniu co 1 civYear. Różnica = offset stempla (`occupyStart` stawiany
  dopiero na pierwszym tiku po wejściu) + granulacja tiku. **Nominalnie 6 miesięcy, obserwowalnie 7-8.**

### 2.3 PRZEPŁYW ZMIERZONY — od „najeźdźca stoi na kaflu" do „kolonia zmienia właściciela"

| # | krok | anchor | stan |
|---|---|---|---|
| 1 | desant tworzy jednostki + rekord inwazji | `InvasionSystem.launchInvasion:80-150` | żywy; **kafel stolicy WYKLUCZONY ze strefy zrzutu** `:418` `[V]` |
| 2 | jednostki AI idą… ku najbliższej JEDNOSTCE gracza | `GroundUnitManager._tickCombatAI:997-1013` | żywy, ale **bez celu strukturalnego** |
| 3 | walka na kaflach (stack combat) | `CombatSystem.tick`, wołany z `GroundUnitManager:986` | żywy w grze; **NIEobecny w headless** (T10) |
| 4 | okupacja kafla → flip po 6 wyśw. miesiącach | `_tickOccupation:594-604` | żywy, zmierzony |
| 5 | `tile:ownerChanged` | `:619` | emitowany **w pustkę** (0 subskrybentów) |
| 6 | skan `_tickCaptureChecks`: `capital.owner === aggressor` **i** `playerMilitary = 0` | `:379-383` | żywy, zmierzony |
| 7 | `_captureColony` → `transferColony` | `:388-406` / `ColonyManager.js:654` | żywy, zmierzony |
| 8 | `empire:colonyAdded` + `colony:captured` + `station:orphaned` + `colony:listChanged` | `ColonyManager.js:727-757`, `StationSystem.js:223` | żywe (pełna lista §3.3) |

**Przerwane ogniwo: krok 2.** [ZMIERZONE, sonda 2 §5a — 240 civYears (20 lat wyświetlanych) na scenę]:

```
A. Kolonia BEZ obrońców          pozycje AI po 240 civY = NIEZMIENIONE   flip=BRAK   captured=NIE
B. Obrońca na NAJDALSZYM kaflu   wszyscy najeźdźcy poszli po obrońcę     flip=BRAK   captured=NIE
C. Obrońca NA STOLICY            najeźdźcy dotarli na kafel stolicy      flip=BRAK*  captured=NIE
```

\* w scenie C flipu nie było z drugiej, niezależnej przyczyny — §2.4.

[ZMIERZONE, sonda 1 §4e — 600 civYears (50 lat wyświetlanych), pełna autonomia]: AI wygrywa wojnę
naziemną (ocalały `gu_2`, hp 60), `capital.owner = "player"`, `colony.ownerEmpireId = null`, inwazja
wciąż `active`. **Najeźdźca stoi na kaflu desantu do końca partii.**

Warunki dodatkowe movera, wszystkie `[V]`: `role === 'military'` (`:1010`) ⇒ **AI-garnizony nie ruszą się
nigdy**; HP > 30 %; `speedHex > 0`; `if (!best) continue` (`:1007`), gdy nie ma jednostki gracza.
**Zero heurystyki „idź na stolicę / na kafel z budynkiem / na kafel wroga."**

⇒ **Deadlock:** warunek „armia wybita" wymaga, żeby gracz nie miał wojska; jedynym magnesem ruchu AI jest
wojsko gracza. Domyślny stan kolonii to brak piechoty (nikt nie rekrutuje garnizonu z własnej woli), więc
warunek „armia wybita" jest spełniony od pierwszej sekundy, a „stolica" jest **nieosiągalna**. Jedyna
trasa do stolicy prowadzi przez to, że **ostatni zabity obrońca stał właśnie na kaflu stolicy**.

### 2.4 ⚠ Druga, niezależna blokada: kafel bez stempla `'player'` zeruje timer w każdym tiku

[ZMIERZONE, sonda 2 §5b — ten sam kafel stolicy w trzech wariantach]:

```
A. tylko jednostka AI, kafel owner=null                tik 7 elapsed=0.5000 → tik 8 FLIP
B. AI + jednostka GRACZA, kafel owner=null             tik 1..10 elapsed=0.0000 W KAŻDYM TIKU → BRAK flipu
C. AI + jednostka GRACZA, kafel JAWNIE owner="player"  tik 7 elapsed=0.5000 → tik 8 FLIP
```

Przyczyna `[V]`: `HexTile` startuje z `owner = null` (`:257-259`), a `_tickOccupation:580` pomija tylko
kafel, którego właściciel **równa się** właścicielowi jednostki. Na kaflu `owner=null` **jednostka gracza
też jest „obcym okupantem"**, nadpisuje wpis AI w indeksie (`:585`, last-writer-wins), a
`_cleanupStaleOccupations` zeruje stempel AI w każdej klatce. Wariant C izoluje przyczynę: blokadą nie
jest obecność dwóch stron, lecz **brak stempla `'player'`**.

**Czy to gryzie w ŻYWEJ GRZE — rozstrzygnięcie:** kafle kolonii gracza SĄ stemplowane, tylko robią to dwa
inne miejsca niż zakładanie kolonii:

- `ColonyManager._onColonyFounded:2403-2405` `[V]` — nowa kolonia z ekspedycji:
  `if (tile.owner == null) tile.owner = 'player'`;
- `ColonyOverlay._getGrid:598-604` `[V]` — przy **generowaniu** siatki:
  `defaultOwner = colony.ownerEmpireId ?? (isTestEnemy ? 'enemy' : 'player')`.

Kolonia macierzysta dostaje siatkę dopiero przy pierwszym otwarciu mapy (`registerHomePlanet:345` ustawia
`grid: null` `[V]`), a `launchInvasion` bez siatki odmawia (`:97-98`, `reason:'no_grid'`) ⇒ **w normalnej
grze desant jest możliwy tylko na koloni, której kafle mają już stempel**. Headless (`GameCore.js:292`)
tego stempla nie stawia — **blokada z wariantu B jest w dużej mierze artefaktem harnessu**.
⚠ Dwa wyjątki, oba `[Z KODU]`: **outpost** (`MissionSystem.js:2342` generuje siatkę **bez** stempla) oraz
scenariusze startowe/debugowe (`GameScene.js:3427/3461/3485` generują siatkę bez stempla — stempel dokłada
dopiero `_getGrid`). Placówka jest i tak niezdobywalna z innego powodu (`:380`).

⇒ **Wiążące dla projektu: „AI nigdy nie dojdzie do stolicy" NIE jest gwarancją strukturalną.** Projekt
musi być poprawny także wtedy, gdy AI dojdzie tam **przypadkiem**, goniąc jednostkę, którą silnik sam
stawia na stolicy: `ColonyManager._findGroundUnitSpawn:1483-1493` spiraluje **od stolicy od promienia 0**,
a `HexGrid.spiral(q,r,0)` zwraca **sam kafel środkowy** (`HexGrid.js:174-177`) `[V]`; fallback `:1493` to
również kafel stolicy. Pętla celu AI **nie ma filtra roli CELU** (`:997-1006`) ⇒ **cywilny łazik stojący
na stolicy jest legalnym magnesem.**
---

## 3. Q2 — `captureColonyForPlayer` vs `transferColony`, krok po kroku

### 3.1 ⚠ Najpierw korekta wejściowa: S7 („jeden zachowuje dane, drugi kasuje") jest NIEAKTUALNE

To był stan **przed W3-1**. Dziś `transferColony` jest **odwracalnym przerzutem własności w miejscu** i nie
niszczy niczego: `[V]` w `:654-760` **nie ma ani jednego `dispose()`, ani `_colonies.delete`**, a komentarz
`:642-648` mówi wprost, że dispose ×5 usunięto ŚWIADOMIE (przesłanka Z4/Z5 „AI nie adoptuje subsystemów"
przestała obowiązywać, bo teraz adoptuje).

Kasowanie robi **trzecia** metoda, `removeColony:596-622` `[V]`: dispose ×5 (`:606-610`) →
`_colonies.delete` (`:612`) → `colony:destroyed` (`:614-622`). Ona jest z tego zestawienia **wykluczona**
(zabija odwracalność D7).

⚠ Do poprawienia w repo (dokumentacja, nie kod): komentarz `ColonyManager.js:604` („Bliźniaczy dispose
w transferColony"), nagłówek `InvasionSystem.js:18` oraz sekcja S3.4c Z9 w `CLAUDE.md` opisują
`transferColony` jako ścieżkę z dispose. **Wygrywa kod: dispose tam nie ma.**

### 3.2 Tabela krok po kroku

| krok | `transferColony(planetId, empireId, reason)` `:654` | `captureColonyForPlayer(planetId, reason)` `:768` | symetryczne? |
|---|---|---|---|
| guard „brak kolonii" | `:655-656` → `false` | `:769-770` → `false` | ✅ |
| guard idempotencji | **BRAK** | `:772` (`!ownerEmpireId \|\| === 'player'` → `false`) | ❌ |
| guard `isHomePlanet` | **BRAK** (tylko czyta do payloadu `:696`) | n/d | ❌ (`removeColony:569` taki guard ma) |
| kolonia zostaje w `_colonies` | **TAK** | **TAK** | ✅ |
| `dispose()` ×5 podsystemów | **NIE** | **NIE** | ✅ |
| statki zadokowane w hangarze | **NISZCZONE** `:666-674` | nie rusza | ❌ (asymetria zamierzona — koszt utraty) |
| drogi handlowe | **usuwane** `:677-679` | nie rusza | ❌ |
| aktywna kolonia gracza | przełączana `:682-692`, **fallback bez filtru właściciela** `:689` | nie rusza (robi to `GameScene:2307-2310` na evencie) | ❌ |
| POP / mieszkańcy | **nietknięci** — ten sam `civSystem`, ta sama liczba | nietknięci | ✅ |
| budynki | **nietknięte** — żyją w `colony.buildingSystem._active` (pole `colony.buildings` **nie istnieje**; serializacja `:2198`) | nietknięte | ✅ |
| kolejki (budowa/statki/stacje) | nietknięte (`shipQueues`, `constructionQueue`, `pendingQueue` zostają na obiekcie) | nietknięte | ✅ |
| `ownerEmpireId` | `= empireId` `:704` | `= null` + `isTestEnemy = false` `:790-791` | ✅ (lustro) |
| nazwa | nie rusza | regex zdejmujący `[WRÓG]` `:793-795` | ❌ (jednostronne, zamierzone) |
| kafle siatki | **WSZYSTKIE** → `empireId` `:707-711` | **WSZYSTKIE** → `'player'` `:797-802` | ✅ |
| drzewo tech | imperium, ustalane **PRZED** `addColony` `:701` (inaczej zdobycz uczyłaby AI drzewa gracza — uzasadnienie `:698-700`), potem `colony.techSystem` + `buildingSystem.techSystem` `:715-719` | `colony.techSystem = null` (⇒ globalne gracza) + `buildingSystem.techSystem = this.techSystem` `:809-810` | ✅ |
| `_reapplyAllRates()` | `:721` | `:813` | ✅ |
| EmpireRegistry | `addColony` `:727-729` | `removeColony` `:779` | ✅ |
| `galaxyData.systems[].empireId` | stempluje **bezwarunkowo** `:735-738` | czyści **warunkowo** (`gs.empireId === previousOwner`) `:786` | ~ |
| zdarzenie główne | `colony:captured` `:745-751` (`previousOwner` PRAWDZIWY, `population`, `wasHomePlanet`, `destroyedVesselIds`) | `colony:capturedByPlayer` `:815-821` (`previousOwner`, `isOutpost`) | ❌ inne nazwy ⇒ inne zbiory słuchaczy |
| `colony:listChanged` | `:757` | `:823` | ✅ |
| zwrotka | `true` / `false` (tylko brak kolonii) | `true` / `false` | ✅ |
| jednostki naziemne | **nie dotyka** (grep: zero odwołań do `groundUnitManager`) | nie dotyka | ✅ — i to jest **materiał na odbicie** |

### 3.3 Zdarzenia — pełna lista, w kolejności [ZMIERZONE, sonda 2 §2]

Pomiar przez patch na `EventBus.emit` (nie `on` — `emit` wychodzi wcześniej przy zerze słuchaczy, więc
subskrypcja przegapiłaby zdarzenia bez odbiorcy).

```
transferColony (gracz → AI), 4 zdarzenia:
 1. empire:colonyAdded   empireId="emp_001" colonyId="entity_3"
 2. colony:captured      previousOwner="player" newOwner="emp_001" population=8
                         wasHomePlanet=true destroyedVesselIds=[1]
 3. station:orphaned     stationId="station_…" formerColonyId="entity_3"
 4. colony:listChanged

captureColonyForPlayer (AI → gracz), 3 zdarzenia:
 1. empire:colonyRemoved     empireId="emp_001" colonyId="entity_3"
 2. colony:capturedByPlayer  previousOwner="emp_001" isOutpost=false reason="ground_invasion"
 3. colony:listChanged
   (+ empire:destroyed {reason:"no_colonies_left"} między 1 i 2, gdy to była JEDYNA kolonia
    imperium i NIE trwa wojna — EmpireRegistry.js:150-160, guard wojny zachowuje kontrahenta dla W4)

removeColony (kontrola): colony:destroyed → colony:listChanged, a po nim
   tickAttached = res/civ/bld/fact/prosp = 5× false   ⇐ dispose ×5, kontrast kompletny
```

**`colony:destroyed` NIE leci przy przerzucie** — i to jest w większości pokryte, wbrew starszym notatkom
mówiącym o „~7 osieroconych konsumentach". Mój własny grep `[V]`:

| subskrybent `colony:destroyed` | ma lustro na `colony:captured`? |
|---|---|
| `GameScene.js:3230` | ✅ `:2293` |
| `MissionSystem.js:120` | ✅ `:126` |
| `StationSystem.js:26` | ✅ `:30` (→ `station:orphaned`) |
| `TransportOrderSystem.js:51` | ✅ `:53` |
| `VesselManager.js:110` | ✅ `:115` |
| `SystemPoolService.js:53` | ✅ pośrednio przez `colony:listChanged:52` |
| **`EmpireLogisticsSystem.js:97`** | ❌ **BRAK** |
| **`UIManager.js:1156`** | ❌ **BRAK** (`_coloniesDirty` — odświeżenie listy) |

⇒ **Realnie niepokryte są DWA**, nie siedem. Oba tanie do dopięcia (W-F).

⚠ Symetria pęka w drugą stronę: `StationSystem` **nie słucha** `colony:capturedByPlayer`
(`:24-33` — tylko `colony:destroyed`, `colony:captured`, `colony:founded`, `outpost:founded`) ⇒
[ZMIERZONE, sonda 2 §3] po przejęciu kolonii AI przez gracza **jej stacje zostały `owner=emp_001,
detached=false` — wrogie stacje orbitują kolonię gracza, nieosierocone.**

### 3.4 Co zostaje po przerzucie — PRZED/PO [ZMIERZONE, sonda 2 §1]

Scena: `GameCore.boot({scenario:'civilization'})`, kolonia gracza `entity_3` („Capital"), agresor
`emp_001`; kolumna PRZED zdjęta **po 3 civYears tykania**, żeby dowieść, że kolonia była ŻYWA.

| pole | PRZED | PO `transferColony` |
|---|---|---|
| `_colonies.has(planetId)` | true | **true** (ta sama instancja obiektu) |
| `ownerEmpireId` | `null` (⇒ gracz) | `emp_001` |
| `getPlayerColonies()` zawiera | true | **false** |
| `getColoniesByEmpire('emp_001')` | false | **true** (żywy obiekt, nie samo id) |
| pop / humans | 8 / 8.254 | 8 / 8.254 |
| bezrobotni / satysfakcja / prosperity | 5 / 50 / 44 | 5 / 50 / 44 |
| `buildingSystem._active.size` | 4 | 4 |
| food / water / Fe / research / Kr | 122.49 / 109.52 / 200 / 2.94 / 503 | identycznie |
| 5 podsystemów istnieje | 5× true | **5× true** |
| **subskrypcja `time:tick`** | 5× true | **5× true** |
| `colony.techSystem` | `null` (globalne gracza) | drzewo IMPERIUM |
| `capitalBase.owner` / histogram kafli | `null` / `{emp_001:1, undefined:299}` | `emp_001` / `{emp_001:300}` |
| `colony.fleet` | `["v_1"]` | `[]` (zadokowany zniszczony) |
| jednostki naziemne | `gu_1/player`, `gu_2/emp_001` | **bez zmian, oba** |
| stacja gracza | `ownerColonyId=entity_3 detached=false` | `owner=player` (!) `detached=true` |
| `_activePlanetId` | `entity_3` | **`entity_94` — kolonia `emp_001`** |

**Tykanie po przerzucie** [ZMIERZONE]: `Δfood=+20.485` / `Δresearch=+1.176` w 3 civYears (przed: `+22.485`
/ `−97.060` — minus to drenaż kolejki badań gracza). W scenie B po ~5 civYears pod AI `buildingsActive`
wzrosło **4 → 7**, `Fe` 200 → 46.6: **`ColonyAutoExpander` rozbudowuje zdobycz.** Zdobycz jest dla AI
produktywna, nie jest wydmuszką.

**Odwracalność (D7) — ZMIERZONA [sonda 2 §4]:**
- B1 kontrola negatywna: stolica `player`, ale żyje 1 jednostka AI ⇒ po 2 civYears **0 zdarzeń** —
  `_tryPlayerCapture:329-331` odmawia poprawnie;
- B2 jednostki AI usunięte ⇒ **skan `_tickPlayerConquestChecks` sam oddał kolonię**: `ownerEmpireId`
  `emp_001` → `null`, pop **8 → 9** (rosła pod AI), `buildingsActive` 7 → 7 (gracz dziedziczy budynki AI),
  histogram kafli `{player:300}`, 5 podsystemów dalej podpiętych, po powrocie `Δfood=+64.710` w 3 civYears.
  Pełna pętla **AI → gracz → AI** przeszła bez utraty stanu.
- Jedyne, czego powrót NIE naprawia: `_activePlanetId` (dalej `entity_94`).

### 3.5 WERDYKT Q2 — który wzorzec jest bezpieczniejszym fundamentem

**`transferColony` — i nie z estetyki, a z bilansu ryzyka:**

1. **Zero nowego egzekutora.** Jest **już** jedynym produkcyjnym wywołującym w tym kierunku
   (`InvasionSystem.js:395` `[V]`, grep potwierdza brak innych) i jest zamontowany (blok lokatora
   `GameScene`), więc lekcja W3 „skonstruowany ≠ zamontowany" tu nie ma zastosowania.
2. **Ma 7 luster zdarzeniowych; `colony:capturedByPlayer` ma ich 1** (`GameScene:2307`). Oparcie kierunku
   utraty na wzorcu `captureColonyForPlayer` oznaczałoby utratę sprzątania w `MissionSystem`,
   `VesselManager`, `StationSystem`, `TransportOrderSystem`, `NotificationCenter`, `TerritoryService`.
3. **`captureColonyForPlayer` jest kierunkowo ZAMKNIĘTY**: `'player'` / `null` na sztywno (`:790-802`),
   `removeColony(previousOwner)` (`:779`), regex `[WRÓG]` (`:793-795`). Użycie go „w drugą stronę" to
   napisanie **trzeciej** metody, nie adaptacja.
4. **Jest przetestowany na żywym silniku**: GATE 1 §7 (przerzut AI→AI `emp_001` → `emp_sandbox_enemy`),
   GATE 3 §4/§5 (obejście, które właśnie dlatego zadziałało), plus dwie sondy tego audytu.
5. `removeColony` wykluczone definicyjnie (dispose ×5 + delete).

**Czego `transferColony` NIE robi, a bliźniak lub `removeColony` robi** (lista do W-E, wszystko `[V]`):
brak guardu idempotencji · brak guardu `isHomePlanet` · brak `EmpireRegistry.removeColony(prevOwner)`
(nieszkodliwe dla gracz→AI, tnie przerzuty AI→AI i odbicia) · fallback aktywnej kolonii **bez filtru
właściciela** `:689` · `isHomePlanet` nieczyszczone · brak walidacji istnienia imperium-odbiorcy
(`addColony:115-117` cicho zwraca `false`, a przerzut i tak wraca `true` — [ZMIERZONE, sonda 2 §7]:
kolonia należąca do imperium, którego nie ma w `gameState.empires`; niedostępne w normalnej grze, ale
otwarte dla kodu W4).

---

## 4. Q3 — stan okupacji dla kolonii, którą gracz STRACIŁ (problem S9)

Cytat, który rozstrzygamy — `docs/design/W3_PLAN.md` (tabela szwów, S9): *„no colony-level state, and none
possible for a body the player LOST"*.

### 4.1 Werdykt: **BRAKUJĄCA GAŁĄŹ, nie przeszkoda fundamentalna** — z jednym zastrzeżeniem

Model danych unosi oba kierunki, bo cały substrat jest **owner-agnostyczny**:

| zależność | działa dla ciała nie-gracza? | dowód |
|---|---|---|
| `GroundUnitManager._getGrid(planetId)` | ✅ | `colMgr.getColony()` bez filtru właściciela `[V]` |
| `_stalePlanetCache()` | ✅ | iteruje `getAllColonies()` `:655-665` `[V]`, a przerzucona kolonia **zostaje** w `_colonies` |
| `_tickOccupation` | ✅ symetryczne | `:580` porównuje RÓŻNICĘ właścicieli, nie konkretną wartość; okupant `'player'` na kaflu imperium działa identycznie |
| jednostki naziemne po zmianie rąk | ✅ | `GroundUnitManager` / `ArmySystem` / `CombatSystem` **nie subskrybują żadnego `colony:*`** `[V]`; [ZMIERZONE] `gu_1/player` i `gu_2/emp_001` identyczne przed i po |
| stan poziomu kolonii | ✅ **istnieje** | `gameState.invasions[invId]` = `{id, planetId, aggressor, defender:'player', startYear, landedTroops[], active, playerEmptySince}` `:133-142` `[V]` |
| trwałość tego stanu | ✅ | `invasions` w `createDefaultState` (`GameState.js:32`) → `serialize()` zwraca cały `_state` → `SaveSystem.js:221` `[V]` |
| trwałość własności kafli i timera | ✅ | `HexTile.js:302-303` / `:323-324` `[V]` — `owner`, `occupyEmpireId` **i** `occupyStart` przeżywają zapis |
| odbicie przez gracza | ✅ | `_tryPlayerCapture` **celuje właśnie w kolonie z `ownerEmpireId`** — [ZMIERZONE, sonda 2 §4] oddał kolonię |

⇒ Zdanie z S9 należy przeformułować: **stan poziomu kolonii istnieje, ale tylko dla kierunku AI (rekord
inwazji) i tylko dopóki żyje najeźdźca.** Dla kierunku gracza stanu nie ma wcale — bo tam go nie trzeba
(bezstanowy skan `:304-311`).

### 4.2 Co jednak realnie brakuje / psuje się (lista braków z oceną)

| # | brak | anchor | ocena |
|---|---|---|---|
| 1 | **rekord inwazji gaśnie z ostatnim najeźdźcą** — `defenders_repelled` (`:365-370`) wykonuje się PRZED testem stolicy (`:379-382`) ⇒ kampania, w której AI zdobyło stolicę i straciło ostatnią jednostkę, nie domknie się nigdy | `InvasionSystem.js:365-382` | **strukturalne dla kampanii**, ale to zmiana kolejności/warunku, nie modelu |
| 2 | **placówka gracza niezdobywalna** — `if (!capital) continue` bez gałęzi zapasowej | `:380` | trywialne (bliźniak `:338-342` w tym samym pliku) |
| 3 | **brak licznika „od kiedy agresor trzyma stolicę"** — `occupyStart` jest zerowany w chwili flipu (`:602-604`), więc po spełnieniu warunku „stolica" nie zostaje ŻADEN ślad czasu | `GroundUnitManager.js:602-604` | średnie — nośnik gotowy i wolny (`playerEmptySince`) |
| 4 | **`_activePlanetId` po utracie wskazuje kolonię AGRESORA** — fallback `:689` bez filtru; kolejność wstawiania w prawdziwym boocie to `emp_001 → emp_002 → player` (imperia bootstrapują się PRZED graczem) ⇒ `KOSMOS.{resourceSystem,civSystem,buildingSystem}` wskazują na kolonię wroga, `getPlayerColonies()` puste | `ColonyManager.js:689`, `:260-276` | **średnie — dotyka gracza natychmiast** |
| 5 | **utrata macierzystej nie ma zakończenia** — [ZMIERZONE, sonda 1 §6] `getPlayerColonies()=0`, `game:over` **NIE**, gra tyka dalej 120 civY bez awarii; `checkHomeDestroyed` reaguje na `entity:removed`/kolizję/`life:extinct`/`planet:ejected`/pop=0, **nie na zmianę właściciela**; komentarz `ColonyManager.js:650` obiecuje game over, którego nie ma | `GameScene.js:2293-2305`, `:3305-3320` | **decyzja projektowa, nie bug** |
| 6 | **statki gracza po utracie macierzystej** — `_onColonyDestroyed` re-homuje na `KOSMOS.homePlanet.id`, a `transferColony` `homePlanet` nie rusza ⇒ [ZMIERZONE, sonda 2 §3] dwa żywe statki zostały w `fleet[]` kolonii wroga, jeden dostał `startReturn({force:true})` **na planetę zajętą przez wroga** | `VesselManager.js:1093/1105/1112/1138` | średnie (ta sama klasa co ostrzeżenie z W2) |
| 7 | **`isHomePlanet` po utracie kłamie i jest serializowane** | `ColonyManager.js:696`, `:754`, serializacja `:2191` | `[NIEPEWNE]` co do skutku po restore — patrz §7 pkt 4 |
| 8 | **zero widoczności okupacji** — `tile:ownerChanged` 0 subskrybentów, `invasion:repelled` tylko `DebugLog.js:45`, `getInvasionForPlanet` 0 konsumentów | `GroundUnitManager.js:619`, `InvasionSystem.js:70`, `:368` | tanie, ale bez tego gate zmierzy CISZĘ |
| 9 | ⚠ **bez `colony.grid` cała mechanika jest wyłączona** — `registerHomePlanet:345` daje `grid: null`, a `launchInvasion` odmawia `no_grid` (`:97-98`), `_tickOccupation:575` robi `continue`, `_tickCaptureChecks:378` też ⇒ wejście do kierunku AI jest warunkowane **efektem ubocznym otwarcia mapy przez gracza** | `ColonyManager.js:345`, `InvasionSystem.js:97` | **strukturalne dla gate'u** (jak testować) |
---

## 5. Q4 — wykonalność trzech wymagań właściciela, bez zmiany w kodzie

### (a) NAJEŹDŹCA TRZYMA STOLICĘ — **JEST, dosłownie**

| co potrzebne | gdzie już jest | stan |
|---|---|---|
| flaga stolicy | `tile.capitalBase` — serialize `HexTile.js:293`, restore `:314`; stawiana przez budynek `isCapital` (`colony_base`) | ✅ trwała |
| „jedna stolica na kolonię" | oba predykaty biorą `tiles.find(t => t?.capitalBase)` — **pierwszą** | ✅ w praktyce jedna; kod nie wymusza unikalności |
| czy `tile.owner` przyjmuje `empireId` | `_changeTileOwner:615-620` przyjmuje dowolny string; przerzuty piszą `empireId` hurtowo `:707-711` | ✅ |
| gotowy odczyt „kto trzyma stolicę" | **brak helpera** — każdy predykat liczy sam (`InvasionSystem.js:335`, `:381`) | ⚠ duplikacja, nie brak |
| warunek po stronie AI | `:379-382` `capital.owner === inv.aggressor` | ✅ **istnieje i strzela** |
| kafel stolicy w strefie zrzutu | `_findLandingHexes:418` `if (tile.capitalBase) continue` `[V]` | ⚠ desant **nigdy** nie ląduje na stolicy ⇒ dojście jest obowiązkowe |

**Nic nie trzeba dodawać do SPRAWDZANIA. Trzeba dodać OSIĄGALNOŚĆ** (§2.3) i gałąź placówki (`:380`).

### (b) CAŁA BRONIĄCA ARMIA WYBITA — **JEST, ale znaczy coś innego**

Predykat AI `:358-362` `[V]`: `u.owner === 'player' || !u.owner`, `u.role === 'military'`, `hp > 0`.
Mapowanie ról `[V]` `unitArchetypes.js:284-290` (`mapRoleToLegacy`): `assault|ranged → 'military'`,
**`defense → 'defensive'`**, `support → 'support'`, `scout|drone → 'drone'`, reszta `'civilian'`.

| jednostka | model | `role` | blokuje przejęcie? |
|---|---|---|---|
| `shock_infantry` | archetyp `:31-32` | `assault` → `military` | ✅ tak |
| `rocket_artillery` | archetyp `:57-58` | `ranged` → `military` | ✅ tak |
| `garrison_unit` | archetyp `:87-88` | `defense` → `defensive` | ❌ **NIE** |
| `aa_platform` | archetyp `:121-122` | `defense` → `defensive` | ❌ **NIE** |
| `medic_unit` | archetyp `:148-149` | `support` | ❌ NIE |
| `recon_drone` | archetyp `:174-175` | `scout` → `drone` | ❌ NIE |
| `ground_supply_unit` | archetyp `:203-204` | `logistics` → `civilian` | ❌ NIE |
| `infantry` / `mech` | legacy `GroundUnitData.js:45` / `:61` | `military` | ✅ tak |
| `garrison` | legacy `:77` | `defensive` | ❌ **NIE** |
| `science_rover` | legacy `:29` | `civilian` | ❌ NIE |

**[ZMIERZONE, sonda 1 §3-bis]** — z ŻYWYM obrońcą na planecie:

```
legacy infantry    (military)  hp=60  → captured=0   ownerEmpireId=null
legacy garrison    (defensive) hp=100 → captured=1   ownerEmpireId="emp_001"
archetyp shock_infantry (military) hp=15 → captured=0  ownerEmpireId=null
archetyp garrison_unit (defensive) hp=30 → captured=1  ownerEmpireId="emp_001"
brak obrońcy (kontrola)                  → captured=1  ownerEmpireId="emp_001"
```

⇒ **Kolonia broniona wyłącznie garnizonami / działami AA / medykami / zwiadem PADA, choć obrońcy żyją.**
To nie jest „armia wybita" — to „nie ma wojsk liniowych". **Wymaga decyzji właściciela**, nie naprawy:
pełna symetria z graczem (`:329-331` — blokuje KAŻDA żywa jednostka) czy świadome „tylko wojska liniowe
trzymają teren".

Dwa dodatkowe niuanse `[V]`:
- `getUnitsOnPlanet:233-239` filtruje **tylko** `in_cargo` ⇒ jednostka **`offline`** (nieopłacona) liczy się
  jako obrońca, a `CombatSystem` wyklucza ją z walki ⇒ **nietykalny blokator** (po stronie gracza
  predykat bez filtra roli, więc blokuje tam jeszcze łatwiej);
- „wybita" vs „wycofana" jest **nierozróżnialne** — oba predykaty patrzą tylko na to, co obecnie stoi
  na planecie.

### (c) TIMER ~6 MIESIĘCY — **liczba JEST, semantyka NIE**

| licznik | plik:linia | zegar | wartość realna | przeżywa zapis? |
|---|---|---|---|---|
| `OCCUPY_DURATION = 6/12` (trzymanie KAFLA) | `GroundUnitManager.js:565` + `:600-601` + `:967` | **gameTime = lata WYŚWIETLANE** | **0,5 r. wyśw. = 6 wyśw. miesięcy = 6 civYears**; zmierzone 0,5417 / 8 civY | ✅ przez `tile.occupyStart` (`HexTile.js:303`) |
| kadencja `_tickCaptureChecks` / `_tickPlayerConquestChecks` | `InvasionSystem.js:45-52` | **civYears** | raz na 1 civYear = raz na wyśw. miesiąc | n/d |
| `_tickCombatAI` | `GroundUnitManager.js:399-404` | civYears | raz na 1 civYear | n/d |
| `inv.startYear` | `InvasionSystem.js:139` (`_year()` `:441`) | **gameTime** | znacznik startu fali | ✅ (`gameState.invasions`) |
| `inv.playerEmptySince` | `:141` | — | **MARTWE, wolne, serializowane** | ✅ |
| `CAPTURE_GRACE_YEARS = 3.0` | `:26` | — | **MARTWA** | n/d |
| `tile.occupyStart` po flipie | `GroundUnitManager.js:602-604` | — | **zerowany** ⇒ po zdobyciu stolicy zero śladu czasu | — |

⇒ **Jeśli (c) ma znaczyć „6 miesięcy trzymania KAFLA stolicy" — jest gotowe, zmierzone i nie wymaga
niczego.** Jeśli ma znaczyć **„6 miesięcy trzymania KOLONII po spełnieniu (a)+(b)"** (karencja, w której
gracz może odbić) — potrzebny **nowy licznik**; nośnik jest gotowy i wolny (`playerEmptySince`), a rekord
inwazji to worek dowolnych pól ⇒ **bez migracji, save zostaje v101**. Wybór zegara musi być JAWNY: rekord
i okupacja liczą `gameTime`, a kadencja tików `civYears`.

### 5.1 Tabela zbiorcza

| wymaganie | dane istnieją? | co musi być nowe |
|---|---|---|
| (a) stolica u agresora | ✅ **dosłownie** (`:379-382`) | nic w sprawdzaniu; **osiągalność** (ruch AI) + gałąź placówki |
| (b) armia wybita | ✅ istnieje, **węższe** (`:358-362`) | **decyzja projektowa** o zbiorze ról (+ świadomość `offline`) |
| (c) timer 6 wyśw. miesięcy | ✅ per-KAFEL (`OCCUPY_DURATION`) | **tylko jeśli** ma być karencją per-KOLONIA — jedno pole na rekordzie |

---

## 6. Q5 — WERDYKT i najmniejsza ścieżka

### 6.1 Odpowiedź na pytanie „czy da się skopiować"

**Pytanie jest źle postawione: kopiować nie ma co.** Reguła właściciela siedzi w silniku w stosunku
**1 dosłownie / 1 węższa / 1 pod cudzym adresem**, egzekutor działa i jest zmierzony na żywym silniku,
a jedyny brakujący duży element leży **poza** `InvasionSystem` — w naziemnym AI. Skopiowanie
`_tryPlayerCapture` w drugą stronę dałoby **drugi egzekutor obok już działającego** i podpięło go do
**martwego eventu** (T3).

### 6.2 Rekomendowany egzekutor: `ColonyManager.transferColony:654`

Uzasadnienie w §3.5 (5 punktów ryzyka). Skrótowo: zero nowego kodu, 7 luster zdarzeniowych, zmierzony
w obie strony, przetestowany w GATE 1/3; `captureColonyForPlayer` jest kierunkowo zamknięty, a
`removeColony` zabija odwracalność D7.

### 6.3 Kroki — „to trzeba dodać / rozstrzygnąć"

**W-A — intencja terytorialna naziemnego AI. JEDYNY duży kawałek.**
- **co:** gdy `best === null` (brak jednostki gracza), cel = kafel `capitalBase`, alternatywnie najbliższy
  kafel z `buildingId`; po dojściu „hold" (stanie = timer okupacji).
- **gdzie:** `GroundUnitManager._tickCombatAI:997-1013`.
- **ryzyko: WYSOKIE.** To **jedyny** mover jednostek naziemnych, **wspólny dla wszystkich właścicieli**
  (drugi pisarz pozycji to klik gracza `GameScene.js:5330`). Bramki `:1010` (`role === 'military'`,
  `hp/hpMax > 0.3`) zamrażają pule desantowe archetypów `trader`/`isolationist`, które zrzucają `garrison`
  (`GroundUnitData.js:100-101`) ⇒ **te desanty nadal stałyby w miejscu**. `_findLandingHexes:418` wyklucza
  stolicę ze strefy zrzutu, więc dojście jest obowiązkowe zawsze.
- **precedens:** dla celowania **terytorialnego brak**; `moveUnit`, przechwyt w kontakcie i
  `_tickOccupation` są dowiedzione pomiarem (sonda 1 §4b/§4d).

**W-B — rozstrzygnąć semantykę (b).**
- **co:** `role === 'military'` → predykat „jednostka bojowa" (obejmujący `defensive`) albo pełna symetria
  z graczem (bez filtra roli). Plus decyzja o `offline`.
- **gdzie:** `InvasionSystem.js:360` — **jedna linia**; wzór szerszego predykatu gotowy w `:329-331`.
- **ryzyko:** średnie i **projektowe, nie techniczne** (czy medyk/dron/łazik ma trzymać planetę).
- **precedens:** `_tryPlayerCapture:329-331`.

**W-C — przeżycie kampanii + nośnik (c).**
- **co:** rekord nie może gasnąć, gdy stolica już należy do agresora (kolejność `:365-370` vs `:379-382`);
  jeśli (c) ma być karencją per-kolonia — zapis „od kiedy" w wolnym `playerEmptySince` (**bez migracji**).
- **gdzie:** `InvasionSystem.js:365-382`, `:141`.
- **ryzyko:** średnie — samo usunięcie gałęzi `defenders_repelled` czyni inwazje nieśmiertelnymi (T6).
- **precedens:** bezstanowy skan gracza `:304-311` jako alternatywa dla trwałego rekordu.

**W-D — gałąź placówki po stronie AI.**
- `if (!capital) continue` → lustro `:338-342`. Ryzyko niskie, precedens w tym samym pliku.

**W-E — higiena po utracie (decyzje, nie tylko kod).**
- filtr właściciela w fallbacku aktywnej kolonii (`:689`) · guard idempotencji + `isHomePlanet`
  w `transferColony` · rozstrzygnięcie **„utrata stolicy = koniec gry czy nie"** (dziś komentarz `:650`
  obiecuje game over, którego NIE MA) · re-homing statków (`VesselManager.js:1093-1138`).
- **ryzyko:** średnie — zamknięcie fallbacku odbiera graczowi jedyną ścieżkę do panelu utraconej kolonii.
- **precedens:** `removeColony:569` (guard home), `captureColonyForPlayer:772` (idempotencja).

**W-F — widoczność i dwa brakujące lustra.**
- subskrybent `tile:ownerChanged` (0 subs) + konsument UI dla `invasion:repelled` /
  `getInvasionForPlanet` (0 konsumentów) · `colony:captured` dla `EmpireLogisticsSystem.js:97`
  i `UIManager.js:1156` · **każdy nowy powód odmowy dołącza do `DebugLog.TRACKED_EVENTS` w TYM SAMYM
  commicie** (reguła W3 — dziś te dwie metody mają ~10 ścieżek odmowy i zero diagnostyki).
- ryzyko niskie; precedens: 7 luster dodanych w W3-1, `invasion:*` → dzwonek w W3-7.

**W-G — keeper (dziś ZERO plików).**
- ⚠ `GameCore` **nie montuje `CombatSystem`** ani `stationSystem` ([ZMIERZONE, sonda 2 §8]) ⇒ keeper
  mierzący „AI dobija ostatniego obrońcę" musi zamontować `CombatSystem` ręcznie, inaczej **mierzy CISZĘ**.
- ⚠ Headless **nie stempluje `tile.owner`** (§2.4) ⇒ keeper okupacji musi stemplować kafle jawnie, inaczej
  mierzy artefakt harnessu, a nie grę.

### 6.4 POZA zakresem tej pracy (osobne, już zarejestrowane slice'y)

- **Finding 49** — brak szablonu transportowca w katalogu AI ⇒ `no_drop_capable_hull` jako jedyna
  osiągalna odpowiedź złącza bitwa→desant (`docs/audit/AI_DROP_HULL_AUDIT.md`).
- **Finding 50** — desant AI na modelu LEGACY (`INVASION_UNIT_POOLS` → `GROUND_UNITS`), inny balans, brak
  morale/zaopatrzenia (`docs/audit/GROUND_UNITS_AUDIT.md`). [ZMIERZONE, sonda 1 §2]: wylądowane jednostki
  mają `type='infantry'`, bez `archetypeId`/`morale`/`org`/`supply` — Finding 50 potwierdzony pomiarem.
- ⚠ **Bramka wejścia — nowe ustalenie `[V]`:** `_onVesselGroupVictory:180` wymaga
  `participantB.type === 'player'`, a taki kształt emituje **wyłącznie `EnemyAttackHandler:180-186`**;
  `DeepSpaceCombatSystem:944-957` i `VesselCombatSystem:307-320` stawiają `'vessel_group'` po OBU stronach.
  ⇒ **Desant AI jest dziś osiągalny tylko ze ścieżki EAH (atak na kolonię gracza), nigdy z bitwy
  w głębokim kosmosie.** Dźwignia do gate'u bez cheatu w konsoli: przycisk debug `force_invasion`
  (`WarOverlay.js:311` → handler `:363-371`, woła `launchInvasion(empireId, homePlanet.id, 3)`).

---

## 7. Czego nadal nie wiemy (i co by to rozstrzygnęło)

1. **Czy w żywej grze desant AI wychodzi w ogóle.** Obie sondy weszły przez `launchInvasion` wprost.
   ⇒ *Rozstrzygnie:* przebieg N lat z licznikiem `invasion:blocked` po `reason` + payload każdego
   producenta `battle:resolved`.
2. **Czy otwarcie mapy w trakcie inwazji wyciera postęp okupacji.** Mechanizm regeneracji jest realny
   (`ColonyOverlay._getGrid:592-604` zastępuje `colony.grid` świeżym; `_syncTileBuildings` odbudowuje tylko
   `buildingId/capitalBase/underConstruction`, **nie `owner`/`occupy*`**), ale okno jest **wąskie**: `:569`
   zwraca `_gridCache[pid]` (regeneracja tylko przy PIERWSZYM otwarciu w sesji), a po wczytaniu zapisu
   `_gridFromSave` wymusza reuse (`ColonyGridResolveLogic.js:19-21`). Cache jest kasowany tylko na ścieżce
   auto-place stolicy (`:637`). ⇒ *Rozstrzygnie:* live — desant → odczyt `occupyStart` → otwarcie mapy →
   odczyt ponownie.
3. **Zachowanie po zapisie/wczytaniu przejętej kolonii MACIERZYSTEJ** — czy `isHomePlanet:true` razem
   z relinkiem własności przestawia globalne wskaźniki gracza na kolonię wroga. `[NIEPEWNE]`
   ⇒ *Rozstrzygnie:* round-trip `save → migrate → restore` po `transferColony` na home, z odczytem
   `window.KOSMOS.{homePlanet,resourceSystem,civSystem}`.
4. **Czy legacy desant rozpada się po pierwszym trafieniu** (Finding 50, morale `0` na trafieniu vs `100`
   po wczytaniu). Nie zmierzone — `CombatSystem` nieobecny w harnessie. ⇒ *Rozstrzygnie:* jedna runda
   `CombatSystem` na `infantry` z ręcznie zamontowanym systemem.
5. **Wielosesyjna okupacja end-to-end** (żywy najeźdźca → F5 → kontynuacja liczenia). Dane przeżywają
   `[V]`, ale przebiegu nikt nie wykonał.
6. **Dwa różne agresory na jednej planecie**: `enemyUnits:357` liczy KAŻDĄ jednostkę nie-gracza, a
   `capital.owner` musi równać się `inv.aggressor` **konkretnego** rekordu ⇒ trzecia strona może blokować
   gaśnięcie cudzego rekordu. Nie zmierzone.
7. **Cząstkowy swap tech** — czy `civSystem.techSystem` i `prosperitySystem.techSystem` zostają na drzewie
   gracza po przerzucie. `[NIEPEWNE]` ⇒ *Rozstrzygnie:* grep tych dwóch referencji + odczyt po transferze.
8. **Balans:** czy 6 wyświetlanych miesięcy to właściwe tempo i czy „AI stoi na stolicy pół roku" jest dla
   gracza czytelne **bez** UI okupacji. Niemierzalne bez żywej partii.

---

## 8. Pułapki dla implementatora

**T1 — „naprawię komentarz przy `OCCUPY_DURATION`" = 12× szybsze przejęcia.** `[V]` `:565` mówi
„6 miesięcy = 0.5 civYear"; druga połowa zdania jest fałszywa o ×12, bo porównanie idzie przez `gameTime`
(`:600-601`, `:967`). Błędnych deklaracji tej samej stałej jest **pięć, w dwóch plikach**:
`GroundUnitManager.js:405` („2-mo timer"), `:559` i `:593` („2/12 civYears"), `:624` („timerem
0.5 civYear"), `HexTile.js:257` („occupyStart = civYear"). Prawdę mówią tylko `:565` + `:600-601` oraz
odczyt UI `ColonyOverlay.js:3761-3762` (liczy przez `gameTime`). **Żaden keeper tego nie pinuje.**
Pinować **WYKONANIEM** (przez prawdziwy `time:tick`), nie odczytem stałej.

**T2 — „AI nigdy nie dojdzie do stolicy, więc mogę na tym oprzeć projekt".** Fałsz w żywej grze (§2.4).
Blokada zmierzona w sondach to `tile.owner === null` w headless, którego live game nie ma. Projekt musi być
poprawny także wtedy, gdy AI dojdzie na stolicę **przypadkiem**, goniąc łazika, którego silnik sam tam
stawia: `GameScene.js:3839-3851` `[V]` odczytuje klucz `capital_<q>,<r>` z `BuildingSystem._active`
i stawia `science_rover` **dokładnie na kaflu stolicy** (piechotę na sąsiednim), a
`ColonyManager._findGroundUnitSpawn:1483-1493` `[V]` spiraluje od stolicy od promienia 0, gdzie
`HexGrid.spiral(q,r,0)` zwraca sam kafel środkowy (`HexGrid.js:174-177` `[V]`).

**T3 — „skopiuję `_tryPlayerCapture` w drugą stronę".** Dostaniesz drugi egzekutor obok żywego
(`_captureColony`) i **martwy wyzwalacz**: `groundUnit:buildingCaptured` nie ma producenta.

**T4 — „przywrócę `CAPTURE_GRACE_YEARS = 3.0` jako timer".** Stała martwa, a jej deklarowana jednostka
(„civYears" w nagłówku `:14-18`) nie zgadza się z `startYear`, który jest w latach WYŚWIETLANYCH (`:441`).
Podłączona bez konwersji dałaby **3 lata wyświetlane = 36 civYears**, nie „3 miesiące".

**T5 — „usunę gałąź `defenders_repelled`, żeby przejęcie w końcu strzeliło".** Rekord nigdy się nie
domknie, a `listActive()` będzie rósł bez końca: `invId` zawiera **ułamkowy** `gameTime` (`:130`) ⇒ nowy
wpis na każdą falę, bez prune (kontrast: `battles` mają cap `MAX_BATTLES` w `GameState.js:131`).

**T6 — dwie fale = dwa aktywne rekordy = PODWÓJNE `colony:captured`.** [ZMIERZONE, sonda 1 §5]:
```
id#1=inv_emp_001_entity_2_1   id#2=inv_emp_001_entity_2_1_0833333333333333
listActive().length = 2   colony:captured emitów = 2   previousOwner = [player, emp_001]
```
Drugi rekord ogłasza przerzut **AI→AI** na koloni, którą agresor już ma (`_tickCaptureChecks` nie sprawdza
właściciela kolonii). Gracz tego nie widzi **tylko** dzięki bramce u odbiorcy (`GameScene.js:2295`
`previousOwner === 'player'`), nie u źródła.

**T7 — reuse istniejącego rekordu NIE przywraca `active`.** [ZMIERZONE, sonda 1 §5 pkt 5]: gdy `invId`
się powtórzy po zgaśnięciu rekordu, `launchInvasion:132-143` dopisuje tylko `landedTroops` ⇒ **desant,
którego nikt nigdy nie rozliczy** (jednostki stoją, `listActive()` ich nie widzi).

**T8 — `colony:captured` → `VesselManager` re-homuje statki na `KOSMOS.homePlanet.id`.** Przy utracie
kolonii MACIERZYSTEJ cel ratunkowy jest tożsamy z utraconą kolonią: [ZMIERZONE, sonda 2 §3] dwa żywe
statki gracza zostały w `fleet[]` kolonii wroga, a jeden dostał **przymusowy powrót na planetę zajętą
przez wroga**.

**T9 — „garnizon obroni stolicę".** Nie obroni (§5(b)): `role === 'military'` przepuszcza `garrison_unit`,
`aa_platform`, `medic_unit`, `recon_drone`, `ground_supply_unit` i legacy `garrison`. Odwrotnie: jednostka
`offline` **blokuje** przejęcie i jest niezabijalna.

**T10 — „przetestuję to w headless".** `GameCore` **nie montuje `CombatSystem`** (walka naziemna się nie
rozstrzyga) ani `stationSystem`, i **nie stempluje `tile.owner`**. Headless mierzy CISZĘ tam, gdzie żywa
gra mówi — i odwrotnie, potrafi pokazać blokadę, której w grze nie ma (§2.4).

**T11 — „to audyt read-only, mogę go pisać w trakcie gate'u".** Nie: każdy zapis pliku w repo przeładowuje
kartę gracza przez Live Server i cofa grę do ostatniego zapisu. Ten dokument powstał przy zamkniętej
karcie, a sondy pisały wyłącznie poza repo.

---

## 9. Załącznik — co poprawić w dokumentacji repo (znalezione przy okazji, zero zmian w kodzie)

| # | miejsce | co jest nie tak |
|---|---|---|
| 1 | `docs/design/W3_PLAN.md:945-953` (Finding 51) | diagnoza „brak lustra" — poprawne brzmienie w §WERDYKT tego dokumentu |
| 2 | `docs/design/W3_PLAN.md` tabela szwów, S9 | „no colony-level state possible" — stan istnieje (`gameState.invasions`), patrz §4.1 |
| 3 | `CLAUDE.md`, tabela zdarzeń | `groundUnit:capturingBuilding` / `groundUnit:buildingCaptured` → `ColonyOverlay`/`InvasionSystem` opisane jako żywe; **producent martwy** (§1.2) |
| 4 | `CLAUDE.md`, sekcja S3.4c Z9 + `ColonyManager.js:604` + `InvasionSystem.js:18` | opisują `transferColony` jako ścieżkę z `dispose()` ×5 — usunięty w W3-1 (§3.1) |
| 5 | `ColonyManager.js:650` (komentarz) | „HomePlanet → game over w GameScene" — **nie ma takiej ścieżki** (§4.2 pkt 5) |
| 6 | `InvasionSystem.js:14-18` (nagłówek) | obiecuje „0 player ground units (militarne LUB civilne)" oraz „trwa już 3+ civYears" — runtime: tylko `military`, zero grace |
| 7 | `GroundUnitManager.js:405`, `:559`, `:593`, `:624`, `HexTile.js:257` | pięć błędnych deklaracji jednostki `OCCUPY_DURATION`, rozjeżdżających się o ×12 wobec egzekwowanego `gameTime` (T1) |
| 8 | `docs/audit/COMBAT_DIPLO_AUDIT.md:211` | adres `_tryPlayerCapture:223` nieaktualny (dziś `:318`) |
| 9 | brak wpisu w tabeli zdarzeń `CLAUDE.md` | `station:orphaned` (`StationSystem.js:223`), `empire:colonyAdded` / `empire:colonyRemoved` |

---

### Metryki audytu

12 agentów (6 czytelników źródeł, 2 sondy wykonawcze, 5 adwersarzy tez nośnych, 1 synteza) + weryfikacja
własna audytora na `0e6ea0d`. Pięć tez nośnych: 1 potwierdzona, 3 częściowe (skorygowane w tekście),
1 odrzucona („AI strukturalnie nie dojdzie do stolicy" — §2.4). Wszystkie liczby oznaczone
`[ZMIERZONE]` pochodzą z wykonania w `GameCore` (seed harnessu `-2102099243`).
