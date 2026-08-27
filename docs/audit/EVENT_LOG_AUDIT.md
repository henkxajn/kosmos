# AUDYT DZIENNIKA ZDARZEŃ (EventLog) — języki, surowe kody, poprawność działania

**Data:** 2026-08-27 · **Zakres:** `EventLogSystem` + wszyscy producenci wpisów + dwa widoki
(`EventLogOverlay`, `EventLogDrawer`) · **Charakter:** read-only, zero zmian w kodzie gry ·
**Save:** v101 (audyt nie proponuje migracji).

**Zgłoszenie właściciela:** *„często pojawiają się tam informacje w dwóch językach… czasami też
pojawiają się dane nt. układów np. `sys_home` albo inne `sys_xxx` zamiast nazwy planety/ciała/układu.
Wiele innych kwestii też jest w formie kodu zamiast nazw."*

**Werdykt jednym zdaniem:** oba objawy są **realne i odtwarzalne**, ale mają **cztery różne
przyczyny źródłowe**, a nie jedną — i żadna z nich nie leży w słownikach tłumaczeń, które są
w zaskakująco dobrym stanie.

---

## 1. Liczby (zmierzone, nie oszacowane)

| Metryka | Wartość | Jak zmierzone |
|---|---|---|
| Miejsc pisania do Dziennika w `src/` (bez `testing/`) | **119** | skan AST-podobny + grep na `push?.(` |
| …z **literałem tekstu omijającym `t()`** | **29** | j.w., po odjęciu 4 dev-loggerów `console.log` |
| …w tym z polskimi znakami (gracz EN zobaczy polski) | **9** | j.w. |
| …z **surowym id/slugiem** wstrzykniętym w tekst | **≥ 20** | j.w. (16 złapanych regexem + 4 ręcznie) |
| Klucze i18n: `pl` vs `en` | **3282 = 3282**, 0 luk w obie strony | `node tools/check-i18n.mjs` |
| Niezgodne placeholdery `{0}`/`{name}` pl↔en | **0** | skan porównawczy |
| Wpisy EN zawierające polskie diakrytyki | **0** | skan |
| Wpisy PL zawierające angielskie słowo | **19 trafień, 8 realnych** | skan + ręczna weryfikacja |
| `node tools/check-i18n.mjs` | **PASS** | uruchomione |

⚠ **Bramka i18n świeci na zielono przy 29 literałach w Dzienniku.** To nie jest awaria bramki —
to jej **zaprojektowany zasięg**: `check-i18n` pyta *„czy klucz użyty w `t()` istnieje w pl i en"*,
a **nie** *„czy każdy widoczny napis przechodzi przez `t()`"*. Literał w `push({ text: '...' })`
jest dla niej niewidzialny. To dokładnie ten sam martwy kąt, który rejestr opisał już przy
**Findingu 113** (ekran końca gry) — tyle że tam dotyczył `fillText`, a tu `push`.

---

## 2. Co jest ZDROWE (żeby nie naprawiać rzeczy sprawnych)

- **Słowniki są w bardzo dobrym stanie.** `pl` i `en` mają identyczny zbiór 3282 kluczy, zero luk
  w obie strony, zero niezgodnych placeholderów, zero polskich diakrytyków po stronie EN.
  ⇒ **Mieszanie języków NIE bierze się z braków w tłumaczeniach.**
- **`NotificationCenter`** (dzwonek → Dziennik) jest wzorcowy: 100 % tekstu przez `t()`, nazwy
  imperiów bramkowane poziomem wywiadu (`_empireLabel`), fallbacki na nazwane etykiety.
- **`ObservatorySystem`** — czysty; log pierwszego kontaktu celowo anonimowy (fog-of-war).
- **Bramki właściciela działają** — `_isPlayerColonyEvent` / `isEnemyVessel` skutecznie odcinają
  stocznie i kurierów AI od Dziennika gracza (`UIManager:767, 854, 1273`).
- **`BattleSides.js`** rozwiązał tożsamość stron poprawnie (Finding 155) i jest bezjęzykowy
  z rozmysłem — problem leży w **danych, które do niego wchodzą** (§4.3), nie w nim.

---

## 3. PRZYCZYNA ŹRÓDŁOWA #1 — dwa języki: tekst jest RENDEROWANY PRZY EMISJI i ZAPISYWANY

To jest **główna, architektoniczna** odpowiedź na pierwsze zgłoszenie właściciela.

`EventLogSystem` przechowuje **gotowy napis**, nie klucz z argumentami:

```
EventLogSystem.js:7    //   - text  (gotowy tekst w aktywnej lokalizacji)
EventLogSystem.js:191  entries: this._entries.slice(-MAX_PERSIST)   // 200 wpisów DO SAVE'A
SaveSystem.js:206      eventLog: window.KOSMOS?.eventLogSystem?.serialize()
GameScene.js:2154      this.eventLogSystem.restore(c4x.eventLog)     // wraca DOSŁOWNIE
```

Przełącznik języka istnieje **tylko na ekranie tytułowym** i przeładowuje stronę:

```
TitleScene.js:286-288   const newLang = getLocale() === 'pl' ? 'en' : 'pl';
                        setLocale(newLang);
                        window.location.reload();
```

⇒ **Scenariusz odtworzenia (deterministyczny):** grasz po polsku → wracasz do menu → przełączasz
na EN → „Kontynuuj" → **200 ostatnich wpisów wraca po polsku**, a wszystko nowe leci po angielsku.
Dziennik jest wtedy dwujęzyczny **z konstrukcji** i żadna poprawka literałów tego nie usunie.

**Zmierzone wykonaniem** (sonda na żywym `EventLogSystem`, T2):
`restore()` nie tłumaczy tekstu ponownie — wpis `"⚔ Bitwa w dom: Gracz vs Obcy."` wraca
znakowo identyczny.

⚠ **To NIE jest problem tylko przełącznika.** Ta sama właściwość znaczy, że **każdy** literał
z §4 zostaje zamrożony w save'ie na zawsze — więc naprawa literałów **nie leczy wpisów już
zapisanych**. Naprawy §3 i §4 są **niezależne i obie potrzebne**.

**Kierunek naprawy (do decyzji właściciela — nie wykonano):** przechowywać `{ key, args[] }`
i tłumaczyć **przy rysowaniu**, z polem `text` jako fallbackiem dla starych zapisów
(`text ?? t(key, ...args)`). Wymaga bumpa save (v102) albo — taniej — pola opcjonalnego bez bumpa,
skoro `restore` już dziś toleruje brak pól.

---

## 4. PRZYCZYNA ŹRÓDŁOWA #2 — 29 literałów omijających `t()`

Pełna lista z lokalizacjami. **Pogrubione = zawiera polskie znaki** (gracz EN widzi polski).

### 4.1 `GameScene.js` — POI, patrol, eskorta, wywiad, walka naziemna (11 miejsc)

| linia | tekst | co jest nie tak |
|---|---|---|
| **2459** | `` `Wykryto obcy statek (${newQuality}): ${label}` `` | polski + **surowy slug** `contact`/`detailed` + fallback `vesselId` |
| **2475** | `` `Utracono kontakt z ${label}: ostatnia pozycja ${pos}` `` | polski + **`[unknown]`** — dwa języki **w jednym wpisie** (`:2473`) |
| **2489** | `` `Utworzono POI ${poi.type} '${poi.name}'` `` | polski + **surowy typ POI** (`picket`, `rally`) |
| **2499** | `` `Usunięto POI '${name ?? poiId}'` `` | polski + fallback na surowe id |
| 2514 | `` `${vLabel} → POI '${pLabel}'` `` | fallbacki na surowe id |
| **2531** | `` `${vLabel} rozpoczyna patrol '${pLabel}' (${wpCount} waypoints)` `` | polski + **`waypoints`** — dwa języki w jednym wpisie |
| **2533** | `` `${vLabel} rozpoczyna patrol manualny` `` | polski |
| **2545** | `` `${vLabel} osiągnął waypoint ${waypointIndex + 1}/${total}` `` | polski + **`waypoint`** — dwa języki w jednym wpisie |
| **2562** | `` `${vLabel} eskortuje ${eLabel}` `` | polski |
| **2576** | `` `${vLabel} przerwał eskortę: ${reasonText}` `` | polski + surowy slug w gałęzi `else` (`:2574`) |
| **5309, 5322, 5325, 5328** | `` `⚔ Bitwa (${q},${r}) runda ${round} · straty: gracz −…` `` | polski, 4 warianty, walka naziemna |

### 4.2 `UIManager.js` — stocznia, floty, statki, autozapis (13 miejsc)

| linia | tekst | co jest nie tak |
|---|---|---|
| **755** | `` `⚠ Zmiana celu: ${reason}` `` | polski + slug |
| **769** | `` `⚓ Stocznia: budowa ${ship?.namePL ?? shipId}` `` | polski + **`namePL` na twardo** — EN dostaje polską nazwę statku; fallback = surowe `shipId` |
| **774** | `` `✅ Statek gotowy: … ${ship?.namePL ?? shipId}` `` | j.w. |
| **778** | `` `⚠ Stocznia: ${reason}` `` | polski (sam `reason` jest już przetłumaczony u emitenta — OK) |
| **782** | `` `⚠ Disband: ${reason}${suffix}` `` | polski + **surowy slug** (`ColonyManager:2205` emituje slug, nie tekst) |
| **791** | `` `🗑 Statek rozformowany: ${ship?.namePL ?? shipId}` `` | polski + `namePL` |
| **796** | `` `⏳ Stocznia: ${ship?.namePL ?? shipId} — oczekuje na surowce` `` | polski + `namePL` |
| **801** | `` `⚑ Utworzono flotę „${fleet?.name ?? '?'}"` `` | polski |
| **807** | `` `⚑ Rozwiązano flotę (${reason === 'empty' ? 'pusta' : reason ?? 'manual'})` `` | polski + slug + **`manual`** po angielsku |
| 819 | `` `⚑ ${fname} → ${type}: ${aN}/${total}…` `` | **surowy typ rozkazu** (`moveToPoint`) + fallback `fleetId` |
| **835** | `` `⚑ ${fname}: ${type} zakończone` `` | polski + surowy typ rozkazu |
| **839** | `` `⚑ ${fname}: rozkaz anulowany (${reason})` `` | polski + slug |
| 859 | `` `${icon} ${vessel.name} → … (${mIcon} ${mission?.type})` `` | **surowy typ misji** |
| **863** | `` `↩ ${vessel.name} powrócił` `` | polski |
| **870** | `` `💾 Zapisano (${y} lat${mb})` `` | polski + **`toLocaleString('pl-PL')` na twardo** (`:868`) |

### 4.3 `EnemyAttackHandler.js` — bitwa orbitalna (4 miejsca) 🔴 **najcięższe**

```
:215   `⚔ Bitwa w ${systemId}: ${enemyUnit.label} vs Gracz. Zwycięzca: … 'wróg' : 'gracz' : 'remis'`
:249   `💥 ${count} wrogich statków zestrzelonych nad ${systemId}.`
:250   `💥 Wrogi statek "${firstVessel.name ?? '?'}" zestrzelony nad ${systemId}.`
:260   `💥 Bitwa nad ${systemId} — remis. Obie floty zniszczone (${allEnemies.length} wroga).`
```

To jest **dosłownie `sys_xxx` ze zgłoszenia**, po polsku, w najgłośniejszym miejscu gry.

⚠ **I do tego DUBLET.** Gałąź `else` (wojny nie udało się zadeklarować) najpierw pisze własny
wpis (`:214`), a zaraz potem emituje `battle:resolved` (`:228`), które łapie **kanoniczny,
przetłumaczony** producent w `GameScene:2434` (`log.battleLine`). ⇒ jedna potyczka = **dwa wpisy,
w dwóch formatach, w różnych językach**. (Dublet po stronie `WarSystem` został zamknięty
Findingiem 150 przez `announce:false`; **ta ścieżka nie jest nim objęta**, bo emituje wprost.)

### 4.4 `RightClickMenu.js:251` — hardcoded **ANGIELSKI**

```js
text: `Fleet order rejected: ${reason}`
```

Jedyny wpis po angielsku w polskiej grze — lustro pozostałych. Plus surowy slug.

### 4.5 `MovementOrderCancellation.js:39`

```js
t('fleet.cancelOrderEntry', vessel.name ?? '?', orderType)   // orderType = surowy slug
: `cancelled ${vesselId}`                                     // fallback: angielski + surowe id
```

---

## 5. PRZYCZYNA ŹRÓDŁOWA #3 — surowe kody, mimo że REZOLWERY ISTNIEJĄ W REPO

To jest najbardziej frustrująca klasa: **narzędzia są, nikt ich nie woła w miejscu pisania do logu.**

### 5.1 Układy — `sys_home` / `sys_024`

Kanon istnieje i jest **zaimportowany w tym samym pliku**:

```
MapLabelLogic.js:219   systemDisplayName(systemId, sources)   // rejestr → nazwa GWIAZDY → id
                       // komentarz :213 mówi wprost: „nigdy surowe id"
GameScene.js:15        import { systemDisplayName } from '../ui/MapLabelLogic.js';
GameScene.js:4911      ← używa go poprawnie (napis intro)
```

A kanoniczna linia bitwy — **nie**:

```
GameScene.js:2388      const sysName = sysId === homeSys ? homeName : (sysId ?? '?');
                                                                      ^^^^^^^^^^^^^^
```

⇒ każda bitwa poza układem macierzystym wypisuje `sys_024`. Dla układu macierzystego wypisuje
`homePlanet.name` — czyli **nazwę PLANETY w miejscu nazwy UKŁADU** (drobniejsza, ale ta sama klasa).

⚠ **Trzy niezależne kopie rezolwera nazwy układu, o różnej jakości:**
`MapLabelLogic.systemDisplayName` (3 szczeble, kanon) · `WarpRouteSystem._systemName:204`
(2 szczeble, kończy na surowym id) · `FleetManagerOverlay._sysName:1180`. Dodatkowo
`FleetManagerOverlay:8963` robi własny `?? targetSysId`.

### 5.2 Typy rozkazów — pełny słownik istnieje i jest **prywatny**

```
FleetPictureLogic.js:108-119   ORDER_ACTIVITY_KEYS = { moveToPoint: 'fleetPicture.order.moveToPoint', … }
                               + ORDER_ACTIVITY_FALLBACK_KEY = 'fleetPicture.order.generic'
i18n pl/en: 10 par kluczy      'Ruch' / 'Move', 'Pościg' / 'Pursuit', 'Odwrót' / 'Retreat', …
```

Kompletna macierz 9 typów + fallback — **nieeksportowana**, więc `UIManager:819/835`
i `MovementOrderCancellation:39` wypisują `moveToPoint` surowo.

### 5.3 Surowce i towary — obok siebie poprawnie i niepoprawnie, w tym samym pliku

```
MissionSystem.js:1871   `${k}:${v}`   → „⛏ Nowa Ziemia: minerals:12, titanium:3"   ← surowe id
UIManager.js:1277       `${id}:${qty}` → „📦 Żmija → Nowy Dom: electronic_systems:40" ← surowe id
UIManager.js:1286       getName({ id: order.goodId, … }, 'commodity')                 ← POPRAWNIE
```

Klucze `resource.minerals` = „Minerały" itd. **istnieją** (`pl.js:414-418`).
Bliźniak: `ExpeditionSystem.js:1389` (ten sam kod w martwym aliasie).

### 5.4 Imperia — surowe `emp_xxx`

`BattleSides.participantName:46` ma drabinę `rejestr → p.label → **p.empireId** → unknownLabel`.
Trzeci szczebel wpuszcza `emp_003` do **przetłumaczonej** linii `log.battleLine`.
Osobno `UIManager:1316` wstrzykuje `empireId ?? '?'` wprost w tekst alertu pikiety.

### 5.5 ⚠ Polskie etykiety wstrzykiwane do PRZETŁUMACZONEJ linii bitwy

`participantName` bierze `p.label`, a `label` jest budowany po polsku na twardo:

```
EnemyAttackHandler.js:146   `${empire?.name ?? 'Flota wroga'} (${allEnemies.length} statków)`
EnemyAttackHandler.js:147   `${empire?.name ?? 'Wróg'} — ${firstVessel.name}`
EnemyAttackHandler.js:151   label: 'Gracz'
DeepSpaceCombatSystem.js:1477-1478   label: 'Gracz' / label: 'Wróg'
VesselCombatSystem.js:337   label: `Gracz (${sideA.length})`
WarSystem.js:647, 655, 667  'Flota + Obrona orbitalna' / 'Obrona orbitalna' / 'Symboliczna obrona'
```

⇒ gracz EN dostaje: `Battle in sys_024: Liga Spalonej Drogi (3 statków) vs Player. Winner: …`
**Dwa języki w jednym, „poprawnie przetłumaczonym" wpisie.** Etykieta gracza jest nadpisywana
przez `playerLabel`, więc widać wyłącznie stronę wroga — i dlatego to umykało.

### 5.6 Angielszczyzna wewnątrz samego słownika PL (8 realnych, 3 trafiają do Dziennika)

```
pl.js:3343  'eventLog.poi.picketAlert'   'Pikieta "{0}" wykryła wrogi vessel "{1}" (Imperium {2})'
pl.js:3344  'eventLog.poi.rallyComplete' 'Punkt zborny "{0}" zebrany — {1} vessels gotowe'
pl.js:3409  'log.fleetRetreatNoTarget'   '⚠ {0}: retreat zablokowany — brak friendly planety'   ← klucz MARTWY (0 producentów)
pl.js:…     'tooltip.poi.rally.progress' '{0}/{1} vessels'
pl.js:…     'poi.create.waypoint'        'Utwórz Waypoint tutaj'
pl.js:…     'fleet.doctrine.kite.desc'   'Engage utrzymuje maksymalny zasięg…'
pl.js:…     'fleet.doctrine.hold_position.desc'  'Blokuje pursue/intercept/engage…'
pl.js:…     'unit.space_supply_ship.desc' 'Zaopatrzenie flotowe (placeholder — fleet-group w osobnym projekcie).'
```

Realny wpis, jaki widzi gracz PL:
`Pikieta "Brama" wykryła wrogi vessel "Żmija" (Imperium emp_003)` — **angielskie słowo
+ surowe id, w jednej linii, prosto ze słownika**.

⚠ Ostatni wiersz to **notatka deweloperska** („placeholder — fleet-group w osobnym projekcie")
wystawiona graczowi jako opis jednostki.

---

## 6. PRZYCZYNA ŹRÓDŁOWA #4 — niekompletne `TYPE_MAP` / `CHANNELS`

**Zmierzone wykonaniem** (sonda, T3):

| `_log(text, type)` | oczekiwane | **faktyczne** |
|---|---|---|
| `'poi_alert'` (pikieta wykryła wroga!) | intel / warn | **system / info** |
| `'poi_rally'` | fleet / info | **system / info** |
| `'combat'` | combat / warn | combat / warn ✓ (kontrola pinu) |
| `'diplomacy'` (wojna, traktat, pokój) | dyplomacja | **system / warn** |

`LOG_COLORS` (`UIManager:149-154`) definiuje `poi_alert` i `poi_rally`, ale `TYPE_MAP`
(`EventLogSystem:22-59`) **ich nie ma** → `TYPE_MAP.info` → kanał **System**.

⚠ To jest **dokładnie ta sama cicha usterka**, którą komentarz w `EventLogSystem.js:45-51` opisuje
jako naprawioną w W2-7 dla `intel`/`combat`/`diplomacy` — **dwa typy zostały wtedy pominięte**.
Objaw jest podstępny: wpis ma poprawny KOLOR (z `LOG_COLORS`), więc wygląda na dobrze
skierowany, a wypada z filtra swojego kanału.

⚠ **`CHANNELS` nie ma kanału dyplomacji w ogóle** — ~15 wpisów (wypowiedzenia wojny, emisariusze,
traktaty, pokój) ląduje w **System**, obok komunikatów o autozapisie, **każdy z severity `warn`**
(przyjęty traktat sojuszniczy jest oznaczony jak ostrzeżenie).

---

## 7. Defekty funkcjonalne (poza językiem)

### 7.1 🔴 Rok wpisu = `0` po wczytaniu zapisu — **zmierzone wykonaniem**

`EventLogSystem._currentYear` aktualizuje **wyłącznie** `time:display` (`:85-87`), a `TimeSystem`
nie emituje go na pauzie (`TimeSystem.js:70` — early return). `restore()` (`:196-206`)
**nie zasiewa `_currentYear`**.

⇒ każdy wpis powstały po wczytaniu, a przed pierwszą odpauzowaną klatką, dostaje `year = 0`,
a `EventLogOverlay:240` renderuje `year > 0 ? _shortYear(year) : '---'` ⇒ **`---` zamiast roku**.
Sonda T1: `restore({year: 250}) → push() → year === 0`. Kontrola pinu T1b: po `time:display`
rok jest poprawny (250) — czyli mechanizm działa, brakuje tylko zasiania przy restore.

**Naprawa:** jedna linia w `restore()` — `_currentYear` z ostatniego wpisu albo z `timeSystem.gameTime`.

### 7.2 🟠 Wpisy o bitwach wyglądają na klikalne i są martwe

`EventLogOverlay:264-274` rysuje strzałkę `↗` i rejestruje hit-zonę dla **każdego** wpisu
z `entityRef`. Bitwy stawiają `entityRef: sysId` (`GameScene:2440`, `EnemyAttackHandler:218/253/263`).
`_navigateToEntity:345` robi `EntityManager.get(entityRef)` — a **układy nie są encjami**
(zweryfikowane: jedyny `entities.set` w `EntityManager.js:25`, `StarSystemManager` nic tam nie
dodaje) ⇒ `null`, `getColony('sys_024')` ⇒ `null` ⇒ `console.warn` i **nic się nie dzieje**.

Dodatkowo `_navigateToEntity:350` zostawia `console.log` na każdym kliknięciu (szum produkcyjny).

### 7.3 🟠 Ring buffer wypłukiwany przez logowanie walki per runda

`combat:round` (`GameScene:5301`) pisze wpis **na każdą rundę**. `MAX_RUNTIME = 500`,
`MAX_PERSIST = 200`. Sonda T5: **520 wpisów wystarczy, by wymieść całą wcześniejszą historię** —
to ok. 26 starć po 20 rund. Reszta Dziennika (kolonizacja, dyplomacja, gospodarka) znika.

⚠ Rejestr zna tę klasę: dokładnie ten argument („wypłukanie ring buffera") uzasadnił agregację
alarmu zapisu (`SAVE_ALERT_COOLDOWN_YEARS`) oraz `queueMicrotask` przy utrzymaniu floty
(`UIManager:1079-1083`). Log rund walki tej ochrony **nie dostał**.

### 7.4 🟠 Cicha koercja `severity`

`push()` (`:101`) koercuje nieznaną severity do `'info'` **bez ostrzeżenia**. Sonda T4 potwierdza:
`severity: 'warning'` → `'info'`. Repo ma już bliznę po tej pułapce — komentarz `UIManager:875-877`
opisuje, jak „Save NIE zapisany" wyglądał identycznie jak „Zapisano". **Mechanizm nadal jest niemy**
i czeka na następną literówkę.

### 7.5 🟡 Widoki mają własne hardkody PL/EN zamiast `t()`

`EventLogOverlay`: `'📜 DZIENNIK' : '📜 LOG'` (`:119`), `'HISTORIA ZDARZEŃ' : 'EVENT HISTORY'`
(`:199`), `'wpisów' : 'entries'` (`:203`), `'↻ Pokaż wszystkie kanały'` (`:181`),
`'Wszystkie kanały aktywne'` (`:187`), `'Brak wpisów po aktywnych filtrach'` (`:298`).
`EventLogDrawer:129` — to samo.
🔴 `EventLogOverlay:105` — `'Dziennik niedostępny — EventLogSystem niezarejestrowany'`
**nie ma wariantu EN w ogóle**.

Nazwy kanałów też idą poza `t()` — `CHANNELS` trzyma `labelPL`/`labelEN` własną ścieżką
(`EventLogSystem:63-71`).

### 7.6 🟡 Drobne

- `_wrapText` (`EventLogOverlay:28`) mimo nazwy **nie zawija — obcina** wielokropkiem.
  Długie wpisy o bitwach tracą ogon (straty, tury, adnotację o odwrocie).
- `handleScroll` (`:305`) nie ma górnego klampa w handlerze (klamp jest w `draw`) — samo się
  koryguje, ale kółko „biegnie w pustkę" po końcu listy.
- `_hiddenChannels` nie persystuje — świadome (udokumentowane `:204`), zostawiam.
- **Niezweryfikowane:** czy `combat:round`/`combat:hexResolved` mogą odpalić dla walki
  AI-vs-AI (handler zakłada udział gracza: `winnerId === 'player'`, teksty „gracz"/„wróg";
  `CombatSystem:128` domyśla `u.owner ?? 'player'`). Wymaga osobnego pomiaru.

---

## 8. Rekomendowana kolejność napraw

Uszeregowane wg **stosunku widoczności do ryzyka**, nie wg trudności.

| # | Zakres | Efekt dla gracza | Ryzyko |
|---|---|---|---|
| **1** | `EnemyAttackHandler` ×4 → `t()` + `systemDisplayName` + usunąć dublet (`:214` wypada, `battle:resolved` zostaje) | znikają `sys_xxx` i polskie linie z najgłośniejszego miejsca gry | niskie, 1 plik |
| **2** | `GameScene:2388` → `systemDisplayName` (już zaimportowany) | kanoniczna linia bitwy przestaje kłamać o układzie | **jedna linia** |
| **3** | `TYPE_MAP` += `poi_alert`, `poi_rally`; kanał `diplomacy` w `CHANNELS` | pikiety i dyplomacja trafiają do swoich filtrów | niskie |
| **4** | `EventLogSystem.restore` zasiewa `_currentYear` | znikają wiersze `---` po wczytaniu | **jedna linia** |
| **5** | 6 kluczy PL z §5.6 + eksport `ORDER_ACTIVITY_KEYS` + `resource.*`/`getName` w §5.3 | znikają `vessel`, `moveToPoint`, `minerals:12` | niskie |
| **6** | 29 literałów → `t()` (§4), partiami per plik | pełna dwujęzyczność Dziennika | średnie, mechaniczne |
| **7** | Agregacja `combat:round` (wzór `queueMicrotask` z `UIManager:1084`) | historia przestaje ginąć po bitwach | średnie |
| **8** | `{ key, args }` zamiast `text` w modelu wpisu (§3) | koniec dwujęzyczności **z konstrukcji** | **wysokie** — dotyka save'a i 119 miejsc; osobny slice, osobny podpis |

⚠ **Pozycje 1-7 nie leczą wpisów JUŻ ZAPISANYCH** — te zostaną w starym języku, dopóki nie wypadną
z ring buffera albo dopóki nie powstanie 8. Warto to powiedzieć wprost przed live-gate'em, żeby
„stare wpisy nadal po polsku" nie zostało odczytane jako „naprawa nie działa"
(repo ma na to własną lekcję: *reasonless-failure-reads-as-unfixed*).

⚠ **Bramka `check-i18n` nie złapie regresji w tej klasie.** Jeśli naprawiamy §4, warto w tym samym
commicie rozszerzyć narzędzie o wykrywanie literałów w `push({text:…})` / `fillText` poza `t()` —
inaczej 30. literał wejdzie przy zielonej bramce. To ten sam wniosek, co przy **Findingu 113**.

---

## 9. Proponowane numery do rejestru

Najwyższy zajęty numer w repo to **164**. Nowe findingi z tego audytu:

| nr | rzecz | prio |
|---|---|---|
| 165 | Tekst wpisu renderowany przy emisji i persystowany ⇒ Dziennik dwujęzyczny po zmianie języka | 🔴 |
| 166 | `EnemyAttackHandler` ×4 — polskie literały + surowe `sys_xxx` + **dublet** linii bitwy | 🔴 |
| 167 | `GameScene:2388` — kanoniczna linia bitwy omija `systemDisplayName` (zaimportowany 2373 linie wyżej) | 🔴 |
| 168 | `EventLogSystem.restore` nie zasiewa `_currentYear` ⇒ rok `---` po wczytaniu | 🔴 |
| 169 | `TYPE_MAP` bez `poi_alert`/`poi_rally`; brak kanału `diplomacy` w `CHANNELS` | 🟠 |
| 170 | 29 literałów omijających `t()` (§4) | 🟠 |
| 171 | Polskie `label` uczestników bitwy wstrzykiwane do przetłumaczonej `log.battleLine` (§5.5) | 🟠 |
| 172 | Wpisy o bitwach klikalne, ale `entityRef = sysId` nie jest encją ⇒ martwy klik | 🟠 |
| 173 | `combat:round` per runda wypłukuje ring buffer (520 wpisów = cała historia) | 🟠 |
| 174 | 8 wpisów PL z angielskimi słowami w słowniku, w tym notatka deweloperska | 🟡 |
| 175 | Trzy kopie rezolwera nazwy układu o różnej jakości; `ORDER_ACTIVITY_KEYS` nieeksportowane | 🟡 |
| 176 | Widoki Dziennika z własnymi hardkodami PL/EN; `EventLogOverlay:105` bez EN | 🟡 |

---

## 10. Granice dowodu

- **Zmierzone wykonaniem** (sonda na żywym `EventLogSystem`, 11 asercji, 10 PASS + 1 celowo
  demonstrujący defekt): rok po restore, zamrożenie języka, `TYPE_MAP` dla 4 typów, koercja
  severity, pojemność ring buffera. Każdy pin ma kontrolę pinu.
- **Zmierzone skanem statycznym:** 119 miejsc pisania, 29 literałów, ≥20 surowych id,
  parytet i 3282=3282 kluczy, 0 niezgodnych placeholderów.
- **Ustalone lekturą źródła** (nie wykonaniem): dublet linii bitwy w gałęzi bez wojny,
  martwy klik na `entityRef = sysId`, kolejność `restore` w `GameScene`.
- **NIE sprawdzone:** zachowanie na żywo w przeglądarce (`live-gate`); czy walka naziemna
  AI-vs-AI może zasilać Dziennik gracza; ile z 29 literałów realnie pada w typowej partii
  (część ścieżek — POI, patrol, eskorta — może być rzadka lub uśpiona).
- **Zero zmian w kodzie gry.** Ten dokument i dwa skrypty skanujące są jedynymi artefaktami;
  skrypty leżą poza repo (scratchpad sesji).
