# GATE 1 (Director S4) — produkcja okrętów wojennych AI · skrypt sesji

**Arc:** WOJNA I POKÓJ 1.0 · **Workstream:** C (ReactionDirector) · **Slice:** 1, commit S4
**Plan:** `DIRECTOR_SLICE1_PLAN.md` (§Verification GATE 1) · **Orzeczenia:** R-1 („economy executes"), **R-3** (stacja = żeton)
**Save:** v100, **zero migracji** · **Stan przed gate'em:** sweep **120/120 0 FAIL**, `check-i18n` PASS

> **Wszystkie one-linery zostały WYKONANE na żywym silniku** (headless boot) przed wpisaniem tutaj —
> dyscyplina [[validate-gate-oneliners-on-live-engine]]: E6 złapał tak pułapkę bramki ciszy i zgłosił
> fałszywy FAIL. Jedyne, czego headless nie potwierdzi, to zachowanie w przeglądarce — i to jest
> dokładnie to, po co jest ten gate.
>
> **Walidacja zwróciła dwie poprawki, obie już naniesione:** magazyn kolonii nie ma ani
> `spendAll`, ani `_resources` (jest `inventory` typu `Map` — §5b), a szablon na NOWEJ partii
> zwraca `no_module`, i to jest stan oczekiwany, nie awaria (ramka w §1). Obie nazwy wyglądały
> naturalnie i obie były fałszywe — dokładnie po to ten krok istnieje.
>
> **Potwierdzone wykonaniem:** zasiew żetonu działa (`hasOrbitalStation` → `true` dla obu imperiów,
> gdy `StationSystem` istnieje przed generacją), `point_defense` jest zbadane na starcie,
> `hull_frigate.crewCost` w runtime = **0.4** (literał 0.1 × 4).

---

## 0. Przygotowanie (1 min)

**NOWA GRA jest wymagana.** Zasiew stacji-żetonu (R-3) dzieje się przy generacji imperiów,
a ta leci **wyłącznie przy nowej grze** (`GameScene.js` — `isNewGame = !savedData?.civ4x?.galaxyData`).
Stary zapis NIE dostanie żetonu i całą produkcję zobaczysz jako `no_orbital_station` — to
poprawne zachowanie, nie usterka.

```
Nowa gra → scenariusz „Cywilizacja" → poczekaj na wygenerowanie galaktyki
F12 → Konsola
```

---

## 1. Raport gotowości — jedno wywołanie zamiast pięciu (30 s)

```js
KOSMOS.debug.aiWarships()
```

**Oczekiwane:** `console.table` z **dwoma** wierszami (`emp_001`, `emp_002`) i w KAŻDYM:

| kolumna | wartość | co znaczy, gdy inna |
|---|---|---|
| `stolica` | id planety (nie „— BRAK") | bootstrap AI nie dowiózł kolonii → problem sprzed tego slice'u |
| `stocznia` | ≥ 1 | archetyp nie postawił stoczni → `startingBuildings` |
| `wolnePOPy` | ≥ 1 | V3z — bramka załogi jest TWARDA, patrz §5 (przypadek zdegenerowany) |
| **`żeton R-3`** | **TAK** | **zasiew nie zadziałał → §6, to jest sedno tego gate'u** |
| **`point_defense`** | **TAK** | ruling 3 nie wszedł → bez tego łańcuch nie dowozi ani jednego okrętu |
| `szablon` | `OK hull_frigate` **albo** `✗ no_module` | patrz ramka niżej — **oba są poprawne**, zależnie od wieku partii |

☐ **G1.1** — dwa wiersze, wszystkie kolumny jak wyżej.

> ### ⚠ ZNALEZISKO Z WALIDACJI — `no_module` NA STARCIE PARTII JEST OCZEKIWANE
>
> Zmierzone na żywym boocie (nie wywnioskowane): **na nowej grze `szablon` pokaże `✗ no_module`
> ze `slotIndex: 0` i `tried: ['engine_warp']`.** Powód jest strukturalny i NIE jest usterką S4:
>
> | moduł katalogu v1 | wymaga | industrialist | expansionist |
> |---|---|---|---|
> | `armor_heavy`, `weapon_missile`, `weapon_laser` | `point_defense` | **START** ✓ | **START** ✓ |
> | `engine_warp` (napęd WSZYSTKICH trzech fregat) | `ion_drives` | kolejka **6/9** | kolejka **1/10** |
> | `warp_tank` (tylko FRG-1/FRG-2) | `warp_drive` | kolejka **9/9** | kolejka **9/10** |
>
> Ruling 3 przyznał `point_defense`, bo bez niego bramka nie miała TRASY (kadłub + każda broń).
> `ion_drives` i `warp_drive` **mają trasę** — siedzą w kolejce badań i AI je zdobędzie w czasie.
> Wychodzi z tego progresja, która ładnie kładzie się na eskalację nacisku:
>
> * przed `ion_drives` → **żadnej fregaty** (`no_module`),
> * po `ion_drives` → **FRG-3** (obrona układu, bez skoku) = **L1**,
> * po `warp_drive` → **FRG-1/FRG-2** (eskorty zdolne do skoku) = **L2 „możemy przyjść do was"**.
>
> **✅ ROZSTRZYGNIĘTE — orzeczenie R-4 (2026-08-11): ZOSTAWIAMY.** `point_defense` był bramką
> BEZ TRASY (klasa R12), dlatego wszedł do `startingTechs`; `ion_drives` i `warp_drive` **mają
> trasę** i dlatego nie dostają tego samego traktowania. Drabinka zapasowa slotu napędu
> **ODRZUCONA** — pomogłaby FRG-3, ale odebrałaby rolę FRG-1/FRG-2 (bez silnika warp bak jest
> bezużyteczny). Pełne brzmienie: `DIRECTOR_SLICE1_PLAN.md` §Rulings R-4.
>
> 🔴 **Świadoma konsekwencja, którą ten gate ma ZOBACZYĆ, a nie zgłosić jako usterkę:**
> w oknie przed `ion_drives` nacisk militarny produkuje **incydent BEZ odpowiedzi zbrojnej**.
> Jest to uczciwe technologicznie i **nie jest ciche** — `director:shipRejected` z powodem
> `no_module` mówi, czego zabrakło. **Do przeglądu przy Gate 3**, gdzie nacisk ocenia się jako
> łańcuch. Szczebel **L0 (odpowiedź czysto dyplomatyczna, „protest")** na to okno jest
> kandydatem **Slice 2** — nie zmianą teraz.
>
> Sprawdź, na którym etapie jest partia, zanim uznasz `no_module` za awarię:
> ```js
> KOSMOS.empireRegistry.listAll().map(e => {
>   const c = KOSMOS.directorProduction.capitalOf(e.id);
>   return { imp: e.id, ion_drives: c?.techSystem?.isResearched('ion_drives'),
>            warp_drive: c?.techSystem?.isResearched('warp_drive') };
> })
> ```

---

## 2. Zamówienie przechodzi całą ścieżkę (2 min)

```js
KOSMOS.debug.aiWarships('emp_001')                      // 2 × frigate_system_defender
```

☐ **G1.2** — zwraca `{ ok: true, started: N, queued: M, hullId: 'hull_frigate' }`, gdzie `N + M === 2`.
  `started` = poszło od razu do stoczni, `queued` = czeka na surowce. **Oba są sukcesem.**

```js
const cap = KOSMOS.empireRegistry.getColoniesByEmpire('emp_001').find(c => !c.isOutpost);
({ kolejka: cap.shipQueues.map(q => q.shipId), czeka: cap.pendingShipOrders.length })
```

☐ **G1.3** — kolejka stoczni AI **urosła** i/lub `pendingShipOrders` > 0. Nic nie zniknęło.

```js
cap.shipQueues.map(q => ({ shipId: q.shipId, moduly: (q.modules || []).join(' + ') }))
```

☐ **G1.4** — każdy wpis niesie **cztery moduły**: `engine_warp + armor_heavy + weapon_missile + weapon_missile`
  (FRG-3). To dowód, że resolver dowiózł ładunek, a nie że stocznia wzięła gołe kadłuby.

---

## 3. Okręt ma właściciela — rdzeń GATE 1 (3 min)

Przewiń czas, aż fregata się zbuduje (`buildTime` 5.0 lat cyw.). Potem:

```js
[...KOSMOS.vesselManager._vessels.values()]
  .filter(v => v.shipId === 'hull_frigate')
  .map(v => ({ id: v.id, owner: v.ownerEmpireId, isEnemy: v.isEnemy, szablon: v.directorOrigin }))
```

☐ **G1.5** — każda fregata ma `owner: 'emp_001'`, `isEnemy: true`, `szablon: 'frigate_system_defender'`.
  **`owner: undefined` = luka V3c wróciła** — to jest ten defekt, dla którego S4 w ogóle powstał.

☐ **G1.6** — **fregaty NIE MA w rejestrze floty gracza** (Konsola Dowodzenia → zakładka Flota).
  Kontrola dodatkowa: utrzymanie floty gracza w Kr **nie skoczyło** (fregata = 300 Kr/rok).

```js
KOSMOS.vesselManager.getTotalFleetUpkeep?.()            // przed i po — bez zmiany
```

---

## 4. Kurier logistyki nie gubi swojego stempla (1 min)

☐ **G1.7** — jeśli w tej samej partii AI zbuduje kuriera (`hull_small`), ma on **swój** stempel
  (`assignedRouteId` albo obecność w `empire.logistics.reserve`), a fregata **swój**. Żaden nie
  przejął cudzego okna.

```js
[...KOSMOS.vesselManager._vessels.values()]
  .filter(v => v.ownerEmpireId === 'emp_001')
  .map(v => ({ id: v.id, hull: v.shipId, trasa: v.assignedRouteId ?? '—', dyrektor: v.directorOrigin ?? '—' }))
```

> ⚠ Kurierów może nie być wcale — S0/V4 zmierzył, że trasy kurierskie wymagają outpostów, których
> AI nie zakłada. **Brak kuriera NIE jest porażką tego punktu**; wtedy G1.7 = „nie dotyczy".

---

## 5. Przypadek ZDEGENEROWANY — kolonia AI bez załogi i bez komodytów (5 min)

To jest punkt, w którym gate ma najwięcej do powiedzenia: **co widzi gracz i co mówi DebugLog**,
gdy zamówienie się NIE udaje. Cisza w którymkolwiek z tych miejsc jest awarią.

### 5a. Brak wolnych POPów (bramka TWARDA — odmowa, nie kolejka)

```js
cap.civSystem._unemployed = 0;                          // wyzeruj pulę bezrobotnych
cap.civSystem.freePops                                  // sprawdź, że jest 0
KOSMOS.debug.aiWarships('emp_001')
```

☐ **G1.8** — zwraca `{ ok: false, reason: 'no_crew', detail: { crewCost: 0.4, hullId: 'hull_frigate' } }`.
  ⚠ `crewCost` **0.4**, nie 0.1 — kadłuby są mnożone ×4 przy imporcie (`HullsData.js:287`).

☐ **G1.9** — **gracz NIE widzi NICZEGO**: żadnego powiadomienia, żadnego wpisu w Dzienniku,
  żadnego toastu. Odmowa dotyczy AI i nie ma prawa trafić w feed gracza. *(To jest dokładnie
  powód, dla którego bramka R-3 NIE poszła przez `ColonyManager:857` — `fleet:buildFailed`
  ma subskrybenta bez filtra właściciela w `UIManager:765`.)*

☐ **G1.10** — **DebugLog MÓWI**:

```js
KOSMOS.debugLog.query(e => e.kind.startsWith('director:')).slice(-5)
```
  Ostatni wpis: `director:shipRejected` z `reason: 'no_crew'` i `empireId: 'emp_001'`.
  **Pusty wynik = awaria gate'u** — to znaczy, że „reguła nie odpaliła" jest nieodróżnialne
  od „reguły nikt nie podłączył" (audyt R12, cały powód istnienia workstreamu C).

### 5b. Brak komodytów (sprzężenie ekonomiczne, NIE ślepe czekanie)

Przywróć POPy, opróżnij magazyn stolicy AI z komodytów fregaty:

```js
cap.civSystem._unemployed = 20;
for (const k of ['structural_alloys', 'reactive_armor', 'electronic_systems']) cap.resourceSystem.inventory.set(k, 0);
cap.resourceSystem.getAmount('structural_alloys')       // → 0 (potwierdzenie)
KOSMOS.debug.aiWarships('emp_001')
```

> ⚠ `inventory` to **`Map`**, a magazyn NIE ma metody `spendAll` ani pola `_resources` — obie nazwy
> wyglądają naturalnie i obie są fałszywe. Wyszło przy walidacji tych one-linerów na żywym silniku,
> zanim trafiły do tego dokumentu. `energy`/`research` mają osobne ścieżki (`getAmount` je rozgałęzia),
> ale komodytów to nie dotyczy.

☐ **G1.11** — `{ ok: true, queued: 2 }` — zlecenie **CZEKA**, nie ginie (R-1: „economy executes").

☐ **G1.12** — **FAZA PIERWSZA jest widoczna**: fabryka stolicy AI dostała popyt na braki.

```js
cap.pendingShipOrders.map(o => ({ ship: o.shipId, wygasa: o.directorExpiryYear, szablon: o.directorTemplateId }))
[...cap.factorySystem._demandBonus.entries()]           // niezerowe wpisy na brakujące komodyty
cap.factorySystem._mode                                 // 'reactive'
```
  `wygasa` = **teraz + 3.0 lat WYŚWIETLANYCH**. Tryb fabryki: `reactive`.

☐ **G1.13** — `KOSMOS.debugLog.query(e => e.kind === 'director:commodityDemand').slice(-1)` — wpis
  z listą braków. **Intel widzi OBIE fazy**: najpierw przezbrajanie, potem kolejkę stoczni.

☐ **G1.14** — **FAZA DRUGA**: przewiń ~3–5 lat cyw. Jeśli fabryka nadrobi braki, zlecenie
  **samo** wchodzi do stoczni (`shipQueues` rośnie, `pendingShipOrders` maleje).

☐ **G1.15** — **TTL jako zawór**: jeśli fabryka NIE nadrobi, po **3 latach wyświetlanych** zlecenie
  **znika** i zostawia `director:orderExpired`. Sprawdź, że `pendingShipOrders` wróciło do 0 i:

```js
KOSMOS.debugLog.query(e => e.kind === 'director:orderExpired').slice(-1)
```
  **Zlecenie NIE MOŻE wisieć w nieskończoność** — to była cała treść fallbacku z Rulingu 2.

---

## 6. Kontrola ŻETONU R-3 — bez stacji nie ma okrętów (3 min)

Sedno nowego wymagania właścicielskiego. Dwa kierunki, oba muszą zadziałać.

### 6a. Żeton JEST → produkcja płynie

```js
KOSMOS.stationSystem.getAllStations().map(s => ({ id: s.id, owner: s.ownerEmpireId, moduly: s.modules.length, sys: s.systemId }))
```

☐ **G1.16** — są **dwie** stacje AI (`emp_001`, `emp_002`), każda z **`moduly: 0`** i `systemId`
  równym układowi macierzystemu tego imperium (NIE `sys_home`).
  ⚠ `moduly: 0` jest **wymagane**: moduł funkcjonalny wypuszcza zmierzone wycieki do gracza
  (laboratorium → badania GRACZA, stocznia → okręt do floty GRACZA).

☐ **G1.17** — stacja gracza (jeśli ją zbudujesz) **nadal dostaje starter set** (habitat + reaktor).
  Ścieżka gracza nie mogła się zmienić.

### 6b. Żeton ZNIKA → produkcja staje

```js
const st = KOSMOS.stationSystem.getAllStations().find(s => s.ownerEmpireId === 'emp_001');
KOSMOS.stationSystem.destroyStation(st.id);
KOSMOS.debug.aiWarships('emp_001')
```

☐ **G1.18** — `{ ok: false, reason: 'no_orbital_station' }`, **nic** nie trafiło do kolejki, i:

```js
KOSMOS.debugLog.query(e => e.kind === 'director:shipRejected').slice(-1)
```
  wpis z `reason: 'no_orbital_station'`. **To jest dowód, że żeton naprawdę bramkuje**, a nie
  jest dekoracją — i zarazem szkic tego, co WAR_BACKBONE zrobi ze zniszczeniem stacji.

☐ **G1.19** — `KOSMOS.debug.aiWarships()` pokazuje teraz dla `emp_001` kolumnę `żeton R-3: — NIE`,
  a dla `emp_002` wciąż `TAK`. **Bramka jest per-imperium, nie globalna.**

---

## 7. Regresje wizualne, których ten slice mógł dotknąć (2 min)

☐ **G1.20** — **BRAK fantomowej ikonki stacji przy gwieździe układu domowego** (prerekwizyt
  `fix-stacje-3d`). Stacje AI stoją w SWOICH układach; przełącz się na układ AI (Outliner →
  nagłówek gwiazdy) i zobacz, że tam stacja **jest**, na swojej orbicie.

☐ **G1.21** — CTRL (etykiety) na mapie domowej **nie wypisuje** nazw stacji AI.

☐ **G1.22** — **Konsola przeglądarki bez błędów i bez ostrzeżeń** z `DirectorProduction`,
  `StationSystem`, `ThreeRenderer`, `EmpireBootstrap`.
  ⚠ Jedyne dopuszczalne ostrzeżenie: `[EmpireBootstrap] … brak window.KOSMOS.stationSystem` —
  ale **w przeglądarce nie ma prawa się pojawić** (dotyczy wyłącznie headless). Jeśli je widzisz,
  żeton nie powstał i G1.16 i tak padnie.

---

## 8. Zapis / wczytanie (2 min)

☐ **G1.23** — zapisz i wczytaj grę. Stacje AI wracają (`getAllStations()` → 2, `moduly: 0`,
  właściciele bez zmian). Wersja zapisu **v100**, migracja **nie** poszła.

☐ **G1.24** — oczekujące zlecenie z TTL przeżywa round-trip: `cap.pendingShipOrders[0].directorExpiryYear`
  ma tę samą wartość co przed zapisem.

---

## Wynik

```
Data:            ____________________
Wykonał:         ____________________
Wynik:           PASS / FAIL
Punkty nieudane: ____________________
Uwagi:           ____________________
```

**Kryterium przejścia:** wszystkie punkty ☐ zaliczone, przy czym **G1.5** (właściciel),
**G1.10** (DebugLog mówi przy odmowie), **G1.15** (TTL nie zostawia zjawy) i **G1.18** (żeton
bramkuje) są **nienegocjowalne** — każdy z nich pilnuje defektu, który ten slice miał usunąć.

**Po PASS:** S5 (łańcuch pierwszego kontaktu, GATE 2). **Po FAIL:** poprawka + ponowny przebieg
całej sekcji, w której punkt padł — nie samego punktu.
