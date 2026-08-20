# AUDYT — ścieżka kolonizacji przy ZERZE kolonii (GATE 2 §4 Scenariusz A)

**Data:** 2026-08-20 · **Zakres:** read-only. **Zero zmian w kodzie.**
**Powód:** GATE 2 §4-A potwierdzony CZĘŚCIOWO. Gracz stracił obie kolonie mając statek kolonizacyjny
(`v_9`, `habitat_pod` ×2, 8 kolonistów) już w przestrzeni — ale wysłany **zwykłym `moveToPoint`**, nie
formalną misją. `player:noReversalPossible` **nie strzeliło** (poprawnie), ale **nie było przycisku
„Colonize"**, a `canLaunchColony('v_9','entity_4')` dało `shipOk:false, padOk:false`.
**Metoda:** odczyt źródeł + **wykonanie headless** (`GameCore`) + kontrprzebieg adwersarialny na każdym
przekroju (8 agentów, 4 przekroje; zero refutacji, ~33 poprawki wchłonięte). Gra NIE była uruchamiana.
**Numeracja findingów:** ciągła po 96 z `COLONY_OWNERSHIP_GUARD_PLAN.md` ⇒ **od 97**.

---

## WERDYKT (na początku)

> **1. NIE. Przycisk „Colonize" NIE zależy — w żaden sposób — od posiadania kolonii.**
> Zmierzone wykonaniem: **zadokowany** statek kolonizacyjny przy **ZERZE** kolonii gracza daje
> `FLEET_ACTIONS.colonize.canExecute === {ok:true}` i `canLaunchColony(cel, statek) === {ok:true}`.
> ⇒ **To NIE jest fail D9 Scenariusza A.** Punkt 3 zamówienia (osobny, świeży fail po stronie
> kolonizacji) **nie zachodzi** — nie ma czego zgłaszać jako zakres.
>
> **2. TAK. `_processColonyArrival` stempluje własność i konsumuje statek** — w przeciwieństwie do
> gołego `createColony`. Zmierzone wykonaniem przy ZERZE kolonii: kolonia powstaje
> (`isPlayerColony: true`, pop 8, siatka hex, `colony_base`+`launch_pad`+`solar_farm`), a statek
> **znika z rejestru** (`getVessel → false`).
>
> ⚠ **3. Dwa z trzech Twoich pomiarów to ARTEFAKTY WYWOŁANIA, nie fakty o grze** — szczegóły w §1.
> Wskazuję to nie po to, żeby prostować, tylko dlatego, że **gdyby zostały w rejestrze jako fakty,
> następny audyt zacząłby od fałszywej przesłanki.**

I jedno znalezisko, którego nikt nie szukał, a które jest **cięższe niż cały badany wątek**:

> 🔴 **KOLONIA WROGA PŁACI ZA UTRZYMANIE FLOTY GRACZA.** Zmierzone: 300 Kr w jednym rozliczeniu,
> 5000 → 3094 Kr przez 80 lat gry, `unpaidYears` stale 0, a własna kolonia gracza **nietknięta**.
> ⚠ **Osiągalne, gdy gracz WCIĄŻ MA kolonie** (statek w drodze do koloni, która zostaje przejęta) —
> to **nie** jest przypadek brzegowy zera kolonii. **⇒ Finding 97.**

---

## 1. DWA ARTEFAKTY WYWOŁANIA (i dlaczego to ważne, a nie złośliwe)

### 1a. `canLaunchColony('v_9','entity_4')` — argumenty odwrotnie

Sygnatura: `canLaunchColony(targetId, vesselId = null)` (`MissionSystem.js:170`).
Wywołanie podstawiło `targetId='v_9'` (nie ma takiego ciała) i `vesselId='entity_4'` (nie ma takiego
statku). Wtedy, co do wiersza:

```
MissionSystem.js:177-179   shipOk = vesselId ? !!(vMgr?.getVessel(vesselId)) : …   → getVessel('entity_4') = undefined → false
MissionSystem.js:477       _colonyShipBypassPad:  if (!vessel) return false;      → false
MissionSystem.js:460       _checkPadForVessel:    if (!vessel) return false;      → false
```

**Zmierzone wykonaniem, oba porządki, przy zerze kolonii:**

| wywołanie | wynik |
|---|---|
| `canLaunchColony(cel, statek)` — **poprawnie** | `ok:true`, `padOk:true`, `shipOk:true` |
| `canLaunchColony(statek, cel)` — jak w sesji | `padOk:false, shipOk:false, exploredOk:false, typeOk:false` |

⚠ `shipOk` to **czysty test istnienia** statku (`!!getVessel`), niezależny od dokowania i od kolonii —
więc `shipOk:false` da się wytłumaczyć **wyłącznie** nierozwiązującym się id. To domyka sprawę.

⚠ **I rozwiązuje sprzeczność w rejestrze:** `PlayerViability.js:13-15` zapisuje jako fakt zmierzony, że
„*przy ZERZE kolonii `canLaunchColony` przechodzi*". Ten wpis jest **PRAWDZIWY**; sprzeczny odczyt
z sesji pochodził z odwróconych argumentów. **Nie ruszać tego komentarza.**

⚠ Przy zerze kolonii `padOk` wychodzi `true` **dwiema niezależnymi drogami**, więc nie jest to
przypadek: kadłub medium/large omija wyrzutnię z definicji (`:479`), a statek **już w przestrzeni**
przechodzi wcześniej (`:461-462` `if (vessel.position?.state !== 'docked') return true`).

### 1b. `createColony('entity_4','v_9')` — to nie jest ścieżka kolonizacji

Sygnatura: `createColony(planetId, startResources, startPop, gameYear, ownerEmpireId = null)`
(`ColonyManager.js:514`). **Nie przyjmuje statku w ogóle.** Podane `'v_9'` weszło jako
`startResources` ⇒ zmierzony inwentarz nowej koloni: **`{}`**.
Stąd oba „nowe problemy" — obie rzeczy, których zabrakło, **mieszkają gdzie indziej**:

| obserwacja z sesji | co jest naprawdę |
|---|---|
| `ownerEmpireId: null` — „nie ostemplowane na gracza" | **KANON, nie dziura.** `ColonyManager.js:511` komentarz mówi wprost `null=gracz`; `isPlayerColony` (`:236-238`) czyta `!c.ownerEmpireId \|\| c.ownerEmpireId === 'player'`. Jedyne miejsce tworzące kolonię GRACZA (`:2624`) świadomie podaje **cztery** argumenty. Jawne stemplowanie `'player'` byłoby **zmianą kanonu**, nie naprawą |
| statek nie skonsumowany | Konsumpcja mieszka w `MissionSystem._processColonyArrival` (`:1828` nowa kolonia, `:1805` upgrade placówki) → `VesselManager.destroyVessel` (`:1042`). Prymityw jej **nie ma i nie miał mieć** |

---

## 2. DLACZEGO NIE BYŁO PRZYCISKU — przyczyna jest strukturalna i NIE dotyczy kolonii

Są **dwie** afordancje kolonizacji i `moveToPoint` **nie spełnia żadnej**:

| afordancja | bramka | czemu odpadła |
|---|---|---|
| **„Kolonizuj obcy"** (`FleetManagerOverlay.js:7472-7497`) | cały panel renderuje się **tylko** gdy `mission?.type === 'exploration' && mission.phase === 'orbiting_body'` (`:7405`) | `moveToPoint` na koniec ustawia **`vessel.mission = null`** (`MovementOrderSystem.js:1859`) ⇒ panel nie powstaje. ⚠ `grep "orbiting_body" MovementOrderSystem.js` → **zero trafień**: ta ścieżka **nigdy** nie może spełnić tej bramki |
| **akcja `colonize`** (`FleetActions.js:186-209`) | **pierwsza** bramka: `if (vessel.position.state !== 'docked')` (`:189`) | statek po `moveToPoint` jest `orbiting`/`idle` ⇒ odmowa `„Statek musi być w hangarze"` |

**Zmierzone wykonaniem — prawdziwy lot, nie wnioskowanie z komentarza:** `hull_medium` z dwoma
habitatami i 8 kolonistami, rozkaz `moveToPoint` na `entity_4`, tik do przylotu ⇒
`position = {state:'orbiting', dockedAt:'entity_4'}`, `status='idle'`, `mission=null`;
`getAvailableActions` zwraca **`['return_home','redirect','transport']`** — bez `colonize`.
**Kontrola:** ten sam kadłub **zadokowany** ⇒ `['orbit','colonize','load_colonists','transport','transport_passenger']`.

🔑 **DOWÓD, ŻE KOLONIE NIE SĄ TU TERMINEM:** ten sam orbitujący statek przy **JEDNEJ** koloni gracza
daje **identyczny** wynik (brak `colonize`). Zmienną jest stan statku, nie liczba kolonii.

⚠ **Severity: UX/odkrywalność, NIE bloker odwrócenia losu.** Gracz może skolonizować — statek musi
wrócić do doku. Ale w scenariuszu D9 to jest dokładnie ten moment, w którym gracz nie wie, co zrobić,
bo gra nie mówi mu, **czego brakuje** (przycisk się nie pojawia, zamiast pojawić się zablokowany
z powodem — jak robi to `foreign_colonize`, `:7490`). **⇒ Finding 99.**

---

## 3. PRAWDZIWA ŚCIEŻKA — zmierzona end-to-end przy ZERZE kolonii

⚠ **Trasa z zamówienia jest MARTWA:** `MissionSystem.createMission('colonize', …)` (`:145`) ma **ZERO**
wołających produkcyjnych (`grep "createMission(" src/ | grep -v MissionSystem.js` → tylko
`FleetActions.js:82/108/311`, wszystkie `survey`/`deep_scan`). **Żywa trasa:**

```
FleetActions ACTIONS.colonize.execute (:211-215)
  → EventBus 'expedition:sendRequest' {type:'colony'}
  → MissionSystem.js:89  →  :493 _launch  →  :597 _launchColony
  → lot → 'expedition:arrived' → _processColonyArrival (:1824)
      :1828  vMgr.destroyVessel(exp.vesselId)          ← KONSUMPCJA STATKU
      emit 'expedition:colonyFounded'
  → ColonyManager._onColonyFounded (:2622) → createColony(planetId, res, pop, year)  ← 4 argumenty ⇒ owner null = GRACZ
```

**Wynik wykonania przy `getPlayerColonies().length === 0`, `activePlanetId === null`,
`window.KOSMOS.resourceSystem` odpięty:** brak wyjątku · kolonia `isPlayerColony: true`, pop 8 ·
siatka hex wygenerowana · budynki `colony_base`, `launch_pad`, `solar_farm` · **statek usunięty
z rejestru** · zdarzenia w kolejności `vessel:docked → colony:founded → colony:listChanged →
expedition:colonyFounded → mission:arrived → expedition:arrived`.

**Kontrast z gołym prymitywem** (ta sama scena): kolonia owner `null`/`isPlayerColony true`/pop 8,
**ale** `grid:false`, `buildingSystem._grid:false`, **0 budynków**, statek **żyje** z 8 kolonistami
i `colonyId` na starej koloni; emitowane tylko `colony:founded` + `colony:listChanged`.

⇒ **`_processColonyArrival` robi wszystko, o co pytałeś. Prymityw nie robi i nie miał robić.**

---

## 4. 🔴 FINDING 97 — kolonia WROGA płaci za utrzymanie floty gracza

**To wyszło przy okazji i jest cięższe niż badany wątek.**

```
VesselManager.js:2062-2067   _resolvePayHomeId(vessel, colMgr) {
                               const col = colMgr.getColony(vessel.homeColonyId);
                               if (col && !col.isOutpost) return vessel.homeColonyId;   ← filtr TYLKO na placówkę
                               const hp = window.KOSMOS?.homePlanet;                    ← nigdy nieprzecelowywany
                               return hp ? hp.id : null; }
```

**Ani jednego terminu własności** — a `CivilianTradeSystem.spendCredits` (`:876`) też go nie ma.
Po W3-1 przejęta kolonia **zostaje w `_colonies`**, więc `getColony` ją znajduje i **płaci**.
Do tego `VesselManager._onColonyDestroyed` (subskrybent `colony:captured`, `:115`):
**wychodzi wcześnie**, gdy gracz nie ma już kolonii (`:1117-1118`), a gdy biegnie — gałęzie 1 i 2
(`:1129`, `:1144`) rekoncyliują **tylko `colonyId`**, nigdy `homeColonyId`; rusza go dopiero gałąź 3 (`:1163`).

**Zmierzone:** 300 Kr w **jednym** rozliczeniu (5000 → 4700, dokładnie jedno utrzymanie, tożsamość
płatnika potwierdzona) · 5000 → 3094 Kr przez 80 lat gry · `unpaidYears` stale **0** · własna kolonia
gracza **nietknięta** na 5000 Kr.
⚠ Długi przebieg **nie jest** czystym 300 × 80 — kolonia AI w tym czasie także zarabia i wydaje;
czysto zmierzone jest **pojedyncze rozliczenie i płatnik**, a długi przebieg pokazuje wyłącznie,
że wyciek **trwa i nie wygasa**.

⚠ **OSIĄGALNE PRZY ŻYWYCH KOLONIACH GRACZA** — wystarczy statek w drodze do koloni, która zostaje
przejęta. To nie jest przypadek brzegowy „zero kolonii".
⚠ **Do zmierzenia na żywo jednym wierszem** (nie było w tej sesji, bo raportowano tylko `colonyId`):
`KOSMOS.vesselManager.getVessel('v_9').homeColonyId` oraz
`KOSMOS.vesselManager._resolvePayHomeId(v, KOSMOS.colonyManager)`.

---

## 5. Warunkowa zależność od kolonii, która TYM RAZEM nie ugryzła

`FleetManagerOverlay._openColonistThenTarget` (`:2612-2617`) — w ścieżce KLIKNIĘCIA:

```
const colony = this._getVesselColony(vessel);
if (!colony) { EventBus.emit('expedition:launchFailed', { reason: t('expedition.sourceColonyMissing') }); return; }
```

`_getVesselColony` rozwiązuje `vessel.colonyId` **bez filtra własności** ⇒ po W3-1 stara, **już wroga**
kolonia jest rozwiązywalna (zmierzone: `entity_2 owner=emp_001`) i bramka przechodzi.
⚠ **Ugryzłaby**, gdyby kolonia została **USUNIĘTA** z rejestru (`removeColony` — kolizja, wyrzucenie),
a nie przerzucona. Wtedy przy zerze kolonii modal kolonistów **nie otworzy się w ogóle**.
⇒ **Finding 98.** Ta sama klasa co D1/D5, tylko po stronie kolonizacji.

---

## 6. CO TO ZNACZY DLA GATE 2 §4 SCENARIUSZ A

| pytanie | odpowiedź |
|---|---|
| Czy §4-A padło? | **NIE.** Mechanizm D9 zadziałał: `player:noReversalPossible` nie strzeliło, statek w locie poprawnie liczy się jako zdolność odwrócenia |
| Czy UI blokuje kolonizację przy zerze kolonii? | **NIE** — zmierzone wykonaniem, przy 0 i przy 1 koloni wynik identyczny |
| Czy zostało coś nieprzetestowane? | **TAK — domknięcie 0 → 1 przez PRAWDZIWĄ ścieżkę.** Headless mówi, że działa; **na żywo nie zostało pokazane**, bo statek poleciał `moveToPoint` |

**Do domknięcia §4-A na żywo wystarczy jedna zmiana w scenariuszu:** wyślij kolonizatora **formalną
misją** (akcja `colonize` z zadokowanego statku), a nie rozkazem ruchu — wtedy przylot sam założy
kolonię i zobaczysz `getPlayerColonies()` 0 → 1.
⚠ **Nie licz na przycisk przy statku, który już orbituje po `moveToPoint`** — z §2 wynika, że go tam
nie będzie **przy żadnej liczbie kolonii**, i to jest zachowanie dzisiejsze, nie regresja.

---

## Findings filed (ciągła numeracja po 96)

97. 🔴 **Kolonia WROGA płaci za utrzymanie floty gracza.** `VesselManager._resolvePayHomeId:2062-2067`
    filtruje **tylko** `!col.isOutpost`, bez terminu własności, z fallbackiem na nigdy
    nieprzecelowywany `window.KOSMOS.homePlanet`; `CivilianTradeSystem.spendCredits:876` też nie ma
    filtra. Po W3-1 przejęta kolonia zostaje w `_colonies` ⇒ płaci. `_onColonyDestroyed` wychodzi
    wcześnie przy zerze kolonii gracza (`:1117-1118`), a jego gałęzie 1/2 (`:1129`, `:1144`)
    rekoncyliują tylko `colonyId`, nigdy `homeColonyId`. **Zmierzone: 300 Kr/rozliczenie, 5000→3094
    przez 80 lat, `unpaidYears` = 0.** ⚠ **Osiągalne przy żywych koloniach gracza.**
98. **`_openColonistThenTarget:2612-2617` wymaga rozwiązywalnej koloni statku, bez filtra własności.**
    Nie ugryzło, bo W3-1 zostawia przejętą kolonię w rejestrze; ugryzie, gdy kolonia zostanie
    USUNIĘTA (kolizja/wyrzucenie) ⇒ modal kolonistów nie otworzy się przy zerze kolonii.
99. **Afordancja kolonizacji ZNIKA zamiast pokazać się zablokowana.** Statek po `moveToPoint`
    (`mission=null`, `state='orbiting'`) nie spełnia ani bramki `orbiting_body` (`FMO:7405`), ani
    `docked` (`FleetActions:189`), więc gracz **nie widzi powodu**. Wzór poprawny leży w tym samym
    pliku: `foreign_colonize` rysuje się wyszarzony z etykietą `requiresExplored` (`FMO:7490`).
    ⚠ W scenariuszu D9 to jest dokładnie ta chwila, w której gracz nie wie, czego brakuje.
100. **`MissionSystem.createMission('colonize', …)` (`:145`) ma ZERO wołających produkcyjnych** —
    żywa trasa to `expedition:sendRequest {type:'colony'}` → `:493 _launch` → `:597 _launchColony`.
    Dokumentacja i rozmowy nazywają martwą trasę; następny audyt zacznie od złego pliku.
101. **`MovementOrderSystem.js:1857` komentarz mówi „orbiting bez `dockedAt`" — NIEPRAWDA.**
    Zmierzone: po `moveToPoint` `dockedAt` **JEST** ostemplowane id ciała (snap-to-body).
    Komentarz jest nieaktualny wobec późniejszego zachowania; nie wpływa na bramkę kolonizacji
    (czyta `position.state`), ale wprowadza w błąd.

---

## Metoda, pewność, i czego NIE zmierzono

**Zmierzone WYKONANIEM** (headless `GameCore`, kontrprzebieg adwersarialny na każdym przekroju):
oba porządki argumentów `canLaunchColony` · pełny lot `moveToPoint` do przylotu i `getAvailableActions`
po nim · `_processColonyArrival` end-to-end przy zerze kolonii · kontrast z gołym `createColony` ·
pojedyncze rozliczenie utrzymania i tożsamość płatnika.

**Zmierzone ODCZYTEM** (nie wykonaniem): bramki renderowania w `FleetManagerOverlay` — plik
**nie importuje się** pod node w konfiguracji tego audytu, więc afordancje UI ustalono źródłowo,
a wykonaniem potwierdzono ich odpowiedniki w `FLEET_ACTIONS`.

**Świadomie NIE zmierzone:**
- **Gra nie była uruchamiana.** Domknięcie 0 → 1 przez prawdziwą ścieżkę **na żywo** zostaje do gate'u.
- `homeColonyId` żywego `v_9` — raportowano tylko `colonyId`. Finding 97 odtworzono **warunkiem**,
  nie odczytem z tamtej sesji (jednowierszowy odczyt podany w §4).
- Długi przebieg drenażu (5000→3094/80 lat) **nie jest** czystym pomiarem stawki — kolonia AI w tym
  czasie też zarabia i wydaje.

**Zero zmian w kodzie. Naprawa nie jest tu proponowana** — Findings 97-101 czekają na decyzję
o zakresie, tak jak 95/96.
