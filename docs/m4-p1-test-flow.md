# M4 P1 — Real-flow test plan

Krok-po-kroku scenariusze do manualnego testu po wdrożeniu **M4 P1 — Activation + Notifications + Drift fix**.

**Smoke tests offline:** 45/45 PASS — `tmp_m4_p1_smoke.mjs` (33) + `tmp_m4_p1_5_smoke.mjs` (12)
**Co zostało:** ten dokument — weryfikacja w żywej grze (Live Server)

---

## Changelog

**Rev 6 (post-playtest #5 — simulateBattleRetreat helper):**
- **NOWY `KOSMOS.debug.simulateBattleRetreat(opts?)`** — jeden call zamiast 5 manualnych komend. Przesuwa vessel deep-space (5 AU od home), ustawia fuel=0.05, emituje battle:resolved retreat. **Naprawia TEST 5.1 fail z Rev 5:** vessel dokowany do home planet → moveToPoint do tej samej pozycji = dist 0 → fuelNeeded 0 → fuel OK → low_fuel_drift path nie odpala. Helper przesuwa vessel poza orbitę przed emit.

**Rev 5 (post-playtest #4 — auto-return dock + notification dedup + TEST 5 fix):**
- **Bug fix TEST 3.4:** auto-return drift teraz dokuje vessel jako inline rescue teleport (pursue planety nie działało bo orbital speed planety > vessel speed). Vessel zużywa paliwo proporcjonalnie do dystansu i pojawia się dokowany do planety. Lore: "automated emergency docking sequence". Fizyka travel — backlog M5.
- **TEST 4.1 dedup:** usunięto duplikat log entry `vessel:firstSighting` w UIManager. ObservatorySystem już samodzielnie pushuje "🔭 Wykryto wrogą jednostkę" + emit firstSighting dla popup w GameScene. Trzy alerty (Observatory + Pierwsze wykrycie + proximityEnter) zredukowane do dwóch (Observatory + proximity gdy <0.5 AU od własnego vessela).
- **TEST 5.1 instructions:** fuel = 0.05 (nie 0.5 — wcześniej wystarczało na retreat), plus `!v.isWreck` filter w `find` żeby nie wziąć poprzedniego wraka.
- **TODO future:** popup modal dla `diplomacy:warDeclared` zamiast tylko log entry.

**Rev 4 (post-playtest #3 — debugability + starting frigate + civilian warnings):**
- **NOWY: `KOSMOS.debug.spawnMyVessel('hull_frigate', opts?)`** — instant build militarnego statku z auto-unlock `point_defense`. Domyślny loadout: engine_chemical + weapon_kinetic + shield_basic + reinforced_hull.
- **Starting frigate w Power Test** — `_spawnPowerTestFleet` dorzuca `hull_frigate` obok science+cargo + auto-unlock `point_defense` tech.
- **Friendly defaults `spawnEnemyAttack`** — `etaYears` 0.5→2.0, `spawnDistanceAU` 15→30. Gracz ma czas zareagować + widzi wroga lecącego z większej odległości.
- **Toast `vessel:firstSighting`** — ObservatorySystem już emitował, UIManager dodaje wpis do EventLog `intel` channel + auto-slow.
- **RightClickMenu warning dla bezbronnych** — pursue/intercept na enemy z selected vessel bez weapon module → `⚠` prefix + tooltip "Brak broni — statek zostanie zniszczony". Opcja **nadal enabled** (player może wysłać kamikaze recon).

**Rev 3 (post-playtest #2 — combat cooldown):**
- Fix A: usunięto team-up cooldown smearing. Cooldown ustawia się **tylko dla pary która faktycznie strzelała**. Pursue na innego wroga z grupy działa natychmiast.
- Fix B: `vessel:combatRangeExit` (dist ≥ 0.20 AU) **kasuje cooldown** dla pary. Po prawdziwym disengage fresh engagement możliwy bez czekania.
- Fix C: `ENGAGEMENT_COOLDOWN_YEARS` skrócone z 2 → 1 civYear. Cooldown działa jako anti-flicker last-resort, nie blokuje normalnej rozgrywki.

**Rev 2 (post-playtest #1):**
- Bug #1 fix: auto-return drift używa teraz `pursue` na planet entity (nie `moveToPoint`). Vessel po dotarciu DOKUJE się do planety (`state=orbiting`, `dockedAt=planet.id`). Poprzedni stan: vessel zatrzymywał się w pustce, planeta odlatywała.
- `window.KOSMOS.eventBus` exposed dla debug konsoli.
- Uproszczone komendy konsoli (one-liner zamiast multiline z await).
- Naprawa EmpireRegistry API: `listAll()` zamiast `list()`.
- Dodano instrukcję: pauzuj czas (klawisz **1**) PRZED sprawdzaniem `driftIdle` markera — przy szybkim czasie auto-return wykonuje się zanim zdążysz sprawdzić.

---

## Wymagania wstępne

- VS Code z Live Server (lub inny static HTTP)
- Czysta sesja przeglądarki (najlepiej **Chrome → DevTools → Application → Local Storage → Clear**)
- Otwórz konsolę: **F12 → Console**

---

## TEST 0 — Sanity: gra się ładuje i nic nie crashuje

1. **F5** odśwież stronę
2. Title screen → **"Nowa gra"** → wybierz scenariusz **"Cywilizacja"**
3. Czekaj na załadowanie do widoku układu słonecznego (powinieneś zobaczyć słońce + planety + 3D)
4. Otwórz konsolę i wpisz:
   ```js
   window.KOSMOS.scenario
   ```
   **Oczekiwane:** `'civilization'`

5. Brak czerwonych errorów w konsoli (warnings OK)

**Jeśli FAIL** — zatrzymaj się tutaj. Coś jest fundamentalnie zepsute. Sprawdź log błędu.

---

## TEST 1 — Aktywacja flag M1/M2a (główny cel P1)

W konsoli wpisz po kolei:

```js
// Wszystkie powinny zwrócić obiekt (nie null)
window.KOSMOS.movementOrderSystem
window.KOSMOS.proximitySystem
window.KOSMOS.vesselCombatSystem
window.KOSMOS.autoRetreatSystem
window.KOSMOS.empireFleetMaterializer
```

**Oczekiwane:** wszystkie 5 zwracają obiekty typu `MovementOrderSystem`, `ProximitySystem` itp.

Następnie:
```js
GAME_CONFIG?.FEATURES ?? window.KOSMOS_GAME_CONFIG?.FEATURES
// Jeśli powyższe nie działa, zaimportuj manualnie:
const cfg = await import('./src/config/GameConfig.js')
cfg.GAME_CONFIG.FEATURES
```

**Oczekiwane:**
- `movementOrders: true`
- `proximitySystem: true`
- `vesselCombat: true`
- `unifiedAggregator: true`
- `fleetMaterialization: true`
- `enduranceDrainActive: false` ← celowo OFF, P4 unfreeze
- `m4DriftFix: true`
- `m4Notifications: true`
- `m4FuelAwareRetreat: true`

**Jeśli FAIL** — flaga nie została poprawnie ustawiona. Sprawdź czy odświeżyłeś stronę po edycji GameConfig.js.

---

## TEST 2 — PPM Movement Orders bez devtools

Cel: zweryfikować że PPM "Lecisz tutaj" + "Pursue" działają od razu (bez `KOSMOS.debug.enableMovementOrders()`).

### 2.1 — Setup zasobów + statek
W konsoli:
```js
KOSMOS.debug.giveAll(5000)
KOSMOS.debug.unlockTech('rocketry', 'shipyard_construction', 'interplanetary_logistics')
```

### 2.2 — Zbuduj statek
1. Klawisz **C** → otwórz mapę kolonii
2. Wybuduj **Stocznia (Shipyard)** na wolnym hexie (klik hex → Budowle → Stocznia)
3. Klawisz **F** → otwórz FleetManagerOverlay
4. Buduj **Science Vessel** (lub jakikolwiek dostępny)
5. Czekaj aż statek się ukończy (paskiem build progress) i pojawi się w hangarze

### 2.3 — PPM movement (KLUCZOWY TEST)
1. **Klik lewy** na statek w 3D scenie (lub w FleetManagerOverlay) → vessel selected
2. **Klik prawy** na pustą przestrzeń w 3D scenie → powinno pojawić się menu z opcjami:
   - "Lecisz tutaj" (moveToPoint)
   - "Utwórz POI"
3. Kliknij **"Lecisz tutaj"** → statek powinien zacząć lecieć w 3D
4. W EventLog (klawisz **L** lub przycisk dolny) zobaczysz wpis np. `MoveTo (...)`

**Jeśli FAIL** — w konsoli będzie warning `MovementOrderSystem niedostępny — użyj enableMovementOrders()`. To znaczy flag flip nie zadziałał.

### 2.4b — Spawn militarnego vessela dla testów (M4 P1.5)

⚠️ **NOWE w Rev 4.** Wcześniej user testował tylko z `science_vessel` — brak broni → bitwa kończy się porażką. Teraz:

W konsoli:
```js
// Spawn frigate w hangarze homePlanet z combat-ready loadoutem
KOSMOS.debug.spawnMyVessel('hull_frigate')
```

**Oczekiwane:**
- Console log: `[debug] ✓ tech point_defense auto-unlocked` (jeśli pierwsza)
- Console log: `[debug] ✓ hull_frigate (<nazwa>) spawned — id=v_N, modules=engine_chemical,weapon_kinetic,shield_basic,reinforced_hull`
- W FleetManagerOverlay (klawisz **F**) — nowy statek w hangarze z indicacją "hull_frigate" lub odpowiednią nazwą (np. "Skrzydło", "Tarcza")

Alternatywne hulle:
```js
KOSMOS.debug.spawnMyVessel('hull_destroyer')  // 6 slots: 2 engines + 2 weapons + shield + armor
KOSMOS.debug.spawnMyVessel('hull_cruiser')    // 8 slots: 3 engines + 1 missile + 2 kinetic + shield + armor
```

Custom modules:
```js
KOSMOS.debug.spawnMyVessel('hull_frigate', { modules: ['engine_chemical', 'weapon_missile', 'shield_basic', 'sensor_array'] })
```

### 2.4 — Pursue na wrogi vessel
1. **Pre-warunek:** masz frigate z 2.4b (lub innego militarnego) wybranego LPM
2. Spawn wrogiej floty (POST-FIX rev 4 — friendly defaults):
   ```js
   KOSMOS.debug.spawnEnemyAttack()
   // = etaYears: 2.0, spawnDistanceAU: 30 (poprzednio 0.5, 15)
   ```
3. **WAŻNE:** wrogi vessel spawnuje 30 AU od gwiazdy → **niewidoczny** dopóki nie zbliży się do detection range (1 AU bez obserwatorium, ~3 AU z poziomem 1)
4. Czekaj 1-2 game years (klawisz **4** = 1r/s, **5** = 10r/s) — gracz dostanie auto-slow toast `Pierwsze wykrycie...` gdy wróg wpadnie w sensor range
5. Wrogi statek pojawia się w FleetManagerOverlay tactical map (czerwona kropka, ID/nazwa)
6. PPM na wrogi statek → menu z **"Ścigaj"** (Pursue) + **"Przechwyć"** (Intercept) — bez `⚠` (frigate ma weapon_kinetic)
7. Wybierz **Pursue** → frigate ściga wroga

**Oczekiwane:** brak warnings w konsoli, w EventLog wpis `Pursue: <vessel_name>`.

### 2.5 — Civilian combat warning (M4 P1.5 NOWE)

Cel: sprawdzić że pursue/intercept na bezbronnym vesselu pokazuje ostrzeżenie.

1. Wybierz science_vessel (LPM) — w FleetOverlay znajdź go i kliknij
2. PPM na wrogi statek (musi być widoczny → patrz 2.4)
3. **Oczekiwane:** w menu opcje **Ścigaj** i **Przechwyć** widoczne z **`⚠`** prefixem + żółtym kolorem
4. Hover na opcji → tooltip "Brak broni — statek zostanie zniszczony"
5. Opcja jest **klikalna** (player może świadomie wysłać kamikaze recon)
6. Po kliknięciu — pursue startuje, walka się rozpocznie, science_vessel auto-retreatuje przy HP ≤20%

**Jeśli FAIL** — sprawdź w konsoli:
```js
window.KOSMOS.vesselManager.getAllVessels().find(v => v.shipId === 'science_vessel')
// Sprawdź czy ma modules: [] lub science modules
```

---

## TEST 3 — Drift recovery po pursue (M4 P1 unique)

Cel: weryfikacja że po dogonieniu wrogiego statku **NIE** dryfujesz w pustce, tylko dostajesz log + 5y timer.

### 3.1 — Setup pursue
Kontynuuj z TEST 2.4. Twój vessel ściga wrogi statek.

### 3.2 — Przyspiesz czas
1. Klawisz **5** lub **6** (1r/s lub 10r/s) — przyspieszenie
2. Czekaj aż twój vessel dotrze do wrogiego (zwykle 1-3 game years)
3. **WAŻNE:** gdy wrogi vessel zostanie zniszczony (battle:resolved) i twój vessel "dogonił" cel, w EventLog powinno pojawić się:
   - `Statek "X" ukończył pościg — auto-powrót za 5 lat lub wydaj nowy rozkaz` (kolor fleet/info)

### 3.3 — Sprawdź marker w konsoli (KLUCZOWE: PAUZA NAJPIERW)

⚠️ **WAŻNE:** marker `driftIdle` zostanie wyczyszczony jak tylko auto-return się uruchomi (5 game-years po complete pursue). Przy szybkim czasie (10r/s) to może być sekundy. **Naciśnij `1` aby zapauzować ZARAZ po zobaczeniu wpisu "ukończył pościg" w EventLog**, potem sprawdź marker:

```js
// Najprostsza metoda — bez .find()
const vessels = window.KOSMOS.vesselManager.getAllVessels()
// Wypisz wszystkie statki gracza
vessels.filter(v => !v.ownerEmpireId).map(v => ({ id: v.id, name: v.name, driftIdle: v.driftIdle, isWreck: v.isWreck }))
```

**Oczekiwane:** jeden ze statków ma `driftIdle: { sinceYear: <X>, autoReturnYear: <X+5> }`.

Alternatywnie sprawdź Set:
```js
window.KOSMOS.movementOrderSystem._driftingVessels.size  // > 0 jeśli marker działa
[...window.KOSMOS.movementOrderSystem._driftingVessels]  // lista vessel IDs w drift
```

**Jeśli `driftIdle: null` ale wpis był w EventLog** — auto-return się już wykonał, marker został wyczyszczony. **Powtórz krok 3.2 z pauzą natychmiast po wpisie**.

### 3.4 — Auto-return po timeout

⚠️ **POST-FIX P1:** auto-return używa `pursue` na celestial planet entity (nie moveToPoint), żeby vessel **dokował się** do planety po dotarciu (`state=orbiting` + `dockedAt=planet.id`). Stary bug: vessel zatrzymywał się w pustce a planeta odlatywała.

1. Sprawdź aktualny rok: `window.KOSMOS.timeSystem.gameTime`
2. Notuj `autoReturnYear` z poprzedniego kroku (po pauzie)
3. Wznów czas — **6** (10r/s) → szybkie przewinięcie 5+ lat
4. Po przekroczeniu `autoReturnYear` w EventLog powinno pojawić się:
   - `Statek "X" dryfował zbyt długo — auto-powrót do "<nazwa kolonii>"` (kolor fleet)
5. Vessel powinien zacząć lecieć do najbliższej kolonii (widoczne na mapie 3D)
6. **Po dotarciu**: vessel orbituje planetę i porusza się razem z nią (NIE zatrzymuje się w pustce). Sprawdź:
   ```js
   const v = window.KOSMOS.vesselManager.getAllVessels().filter(x => !x.ownerEmpireId)[0]
   v.position.state      // 'orbiting'
   v.position.dockedAt   // <planet_id> — NIE null
   ```

### 3.5 — Player override

Sytuacja: vessel ma `driftIdle`, gracz wydaje nowy rozkaz przed timerem.

1. Powtórz kroki 3.1-3.3 żeby vessel miał `driftIdle` (pauza!).
2. Klik LPM na statek żeby go zaznaczyć
3. Klik PPM na pustą przestrzeń → "Lecisz tutaj"
4. Sprawdź:
   ```js
   const v = window.KOSMOS.vesselManager.getAllVessels().filter(x => !x.ownerEmpireId)[0]
   v.driftIdle  // null — wyczyszczone przez player order
   window.KOSMOS.movementOrderSystem._driftingVessels.size  // 0
   ```

**Oczekiwane:** marker zniknął, statek leci do nowego celu.

---

## TEST 4 — UI Notifications (M4 P1 unique)

Cel: weryfikacja że eventy z M1/M2a generują toasty/log entries.

### 4.1 — Empire fleet movement

⚠️ **WAŻNE:** najpierw zwolnij czas do **1m/s lub 1d/s** (klawisz **3** lub **2**) — przy szybkim czasie auto-slow + wpisy lecą za szybko żeby je zaobserwować.

Spawn wrogiego imperium i wymuś ruch:
```js
KOSMOS.debug.spawnEnemyAttack()
```

**Oczekiwane w EventLog (czytaj od najnowszego u góry):**
- Wpis `Wykryto ruch obcej floty (Imperium X, ETA Y lat)` — kolor cyan (intel channel)
- Po krótkim czasie: `OBCA FLOTA materializuje się przy domu! Imperium X, N statków` — kolor czerwony (combat)
- Czas powinien automatycznie zwolnić do **1d/s** (auto-slow). Sprawdź dolny pasek czasu — powinien świecić `1d/s`. Po auto-slow gracz może ręcznie przyspieszyć.

**Jak zweryfikować że auto-slow zadziałał (jeśli nie zauważyłeś)**: w konsoli sprawdź:
```js
window.KOSMOS.timeSystem.multiplierIndex  // 1 oznacza 1d/s
window.KOSMOS.timeSystem._prevIndex       // poprzedni index przed auto-slow (np. 4 dla 1r/s)
```

### 4.2 — Proximity contact
Po materializacji wrogiej floty, twoje vessele powinny w pewnym momencie znaleźć się <0.5 AU od wrogów.

**Oczekiwane w EventLog:** wpis `Kontakt sensoryczny: wrogi statek "X" (0.XX AU)` (kolor cyan/intel).

**Anti-spam check:** ponowny proximity dla tej samej pary w ciągu **10 game-years** NIE powinien spamować logu. Tylko 1 wpis per para.

### 4.3 — Battle resolved
Po wejściu w combat range (≤0.15 AU) trigger VesselCombatSystem.

**Oczekiwane:**
- Auto-slow do 1d/s
- W EventLog jedna z: `Zwycięstwo w bitwie`, `Porażka w bitwie`, `Bitwa zakończona remisem`, lub `Bitwa — strona "X" wycofała się` (kolor czerwony/combat)
- Jeśli BattleView3D się otworzy, to bonus

### 4.4 — War declaration

⚠️ **WAŻNE:** EmpireRegistry API to `listAll()` i `get(id)`, NIE `.list()`.

Wymuś deklarację wojny:
```js
// 1. Sprawdź jakie imperia istnieją
window.KOSMOS.empireRegistry.listAll()
// Zwróci tablicę obiektów empire — skopiuj pole `id` jednego z nich, np. 'empire_1'

// 2. Wymuś hostility ≥ 80 (próg WAR_THRESHOLD) — auto-war powinno się uruchomić
window.KOSMOS.diplomacySystem.changeHostility('empire_1', 100, 'manual_test')

// Sprawdź czy relacja zmieniła się na 'war'
window.KOSMOS.diplomacySystem.getRelation('empire_1')
```

**Oczekiwane:**
- Auto-slow do 1d/s
- W EventLog wpis `WOJNA: Imperium X wypowiedziało wojnę` (kolor pomarańczowy/diplomacy)

**Alternatywnie** (jeśli powyższe nie działa) — pokój zaproponowany przez UI też wywołuje diplomacy events. To co user obserwował ("statek wroga atakował aż został zabity") jest poprawne — wojna już się działa, vessele empire walczą dalej.

---

## TEST 5 — AutoRetreat low fuel (M4 P1 unique)

Cel: weryfikacja że statek z mało paliwa wycofuje się jako "dryfujący" zamiast cichego fail.

### 5.1 — Setup statku w deep-space z minimalnym paliwem (UPROSZCZONE Rev 6)

⚠️ **PRE-WARUNEK:** masz min. 1 żywy player vessel (z TEST 2.2 lub spawnMyVessel z 2.4b). Najlepiej zapauzuj czas (klawisz **1**).

**Najprostsza ścieżka — jeden helper:**

```js
KOSMOS.debug.simulateBattleRetreat()
```

To w jednym callu:
1. Bierze pierwszego żywego player vessela
2. Przesuwa go 5 AU od homePlanet (deep-space) — żeby retreat moveToPoint miał >0.26 AU dystansu (consumption × dist > fuel.current)
3. Ustawia fuel.current = 0.05
4. Emituje `battle:resolved` z retreat='A'
5. Loguje vesselId + battleId w konsoli

**Oczekiwane:**
- Console log: `[debug] ✓ simulateBattleRetreat: vessel=v_N (<nazwa>), battleId=manual_test_retreat_<timestamp>, deepSpace=true, lowFuel=true`
- W EventLog wpis `Statek "X" dryfuje na resztkach paliwa do "<nazwa planety>"` (kolor czerwony/combat)
- Marker `lowFuelDrift` ustawiony.

### 5.2 — Sprawdzenie markera

Po `simulateBattleRetreat()` console log podpowiada komendę. Skopiuj ją lub wykonaj:

```js
// Zastąp <vesselId> identyfikatorem z poprzedniego logu, np. v_5
window.KOSMOS.vesselManager.getVessel('v_5').lowFuelDrift
```

**Oczekiwane:** `{ sinceYear: <X>, destPlanetId: '<planet_id>', originBattleId: 'manual_test_retreat_<timestamp>' }`

Wznów czas (klawisz **3** lub **4**) — vessel powinien lecieć do friendly planety mimo niskiego paliwa.

**Dlaczego stara metoda nie działała:** vessel zaczyna dokowany do home planet (`position.x = planet.x`). Retreat moveToPoint do tej samej position → dist=0, fuelNeeded=0, fuel.current=0.05 > 0 → OK normal path, lowFuelDrift NIE odpala. `simulateBattleRetreat` przesuwa vessel deep-space PRZED emit, dystans > 0.26 AU wymusza insufficient_fuel → retry z bypass → marker set.

**Custom warianty:**
```js
KOSMOS.debug.simulateBattleRetreat({ lowFuel: false })  // bez low fuel — normalny retreat path
KOSMOS.debug.simulateBattleRetreat({ deepSpace: false })  // bez przesuwania — recreate buga
KOSMOS.debug.simulateBattleRetreat({ vesselId: 'v_3' })   // konkretny vessel
```

**Jeśli FAIL** — sprawdź:
```js
typeof window.KOSMOS.eventBus           // 'object'
window.KOSMOS.autoRetreatSystem         // obiekt, nie null
window.KOSMOS.colonyManager.getAllColonies().length  // > 0
window.KOSMOS.debug.simulateBattleRetreat  // funkcja, nie undefined
```

---

## TEST 6 — Save migration v68 → v69 (backward compat)

Cel: weryfikacja że stare save'y działają.

### 6.1 — Save current (v69)
1. Klawisz **S** lub menu save
2. W konsoli sprawdź:
   ```js
   JSON.parse(localStorage.getItem('kosmos_save_v1')).version
   // Oczekiwane: 69
   ```

### 6.2 — Symulacja starego save'a (v68)
W konsoli wykonaj jeden blok (Chrome F12 → Console → wklej cały blok i Enter):
```js
const save = JSON.parse(localStorage.getItem('kosmos_save_v1'));
save.version = 68;
if (save.civ4x?.vesselManager?.vessels) { for (const v of save.civ4x.vesselManager.vessels) { delete v.driftIdle; delete v.lowFuelDrift; } }
localStorage.setItem('kosmos_save_v1', JSON.stringify(save));
console.log('Save downgraded to v68. Refresh now (F5).');
```
2. **F5** odśwież
3. Kliknij **Kontynuuj** w title screen

**Oczekiwane:**
- W konsoli logi:
  ```
  [SaveMigration] Backup save v68 → kosmos_save_backup_v68
  [SaveMigration] Migracja v68 → v69...
  [SaveMigration] Save zmigrowany v68 → v69
  ```
- Gra ładuje się normalnie
- Po załadowaniu sprawdź:
  ```js
  window.KOSMOS.vesselManager.getAllVessels()[0].driftIdle
  // Oczekiwane: null (lazy default)
  ```

---

## TEST 7 — Drift recovery działa też po reload save (regresja)

Cel: weryfikacja że marker `driftIdle` przeżywa serializację.

### 7.1 — Setup vessel z drift
Powtórz TEST 3.1-3.3 żeby ustawić `v.driftIdle`.

### 7.2 — Save → reload
1. Klawisz **S** (lub menu save)
2. **F5** → kontynuuj
3. Sprawdź:
   ```js
   const v = window.KOSMOS.vesselManager.getAllVessels().find(x => x.driftIdle != null)
   v.driftIdle
   // Oczekiwane: { sinceYear, autoReturnYear } — preserved
   window.KOSMOS.movementOrderSystem._driftingVessels.has(v.id)
   // Oczekiwane: true (rebuilt by _indexExistingOrders)
   ```

---

## Wynik testu

Zapisz tutaj wyniki:

```
TEST 0 — Sanity              [ ] PASS  [ ] FAIL
TEST 1 — Activation flags    [ ] PASS  [ ] FAIL
TEST 2 — PPM movement orders [ ] PASS  [ ] FAIL
  2.1 setup                  [ ] PASS  [ ] FAIL
  2.2 build ship             [ ] PASS  [ ] FAIL
  2.3 PPM moveToPoint        [ ] PASS  [ ] FAIL
  2.4b spawnMyVessel (P1.5)  [ ] PASS  [ ] FAIL
  2.4 pursue enemy           [ ] PASS  [ ] FAIL
  2.5 civilian warning (P1.5)[ ] PASS  [ ] FAIL
TEST 3 — Drift recovery      [ ] PASS  [ ] FAIL
  3.2 drift log after pursue [ ] PASS  [ ] FAIL
  3.3 driftIdle marker       [ ] PASS  [ ] FAIL
  3.4 auto-return at +5y     [ ] PASS  [ ] FAIL
  3.5 player override clear  [ ] PASS  [ ] FAIL
TEST 4 — UI Notifications    [ ] PASS  [ ] FAIL
  4.1 fleet movement         [ ] PASS  [ ] FAIL
  4.2 proximity contact      [ ] PASS  [ ] FAIL
  4.3 battle resolved        [ ] PASS  [ ] FAIL
  4.4 war declaration        [ ] PASS  [ ] FAIL
TEST 5 — Low fuel retreat    [ ] PASS  [ ] FAIL
TEST 6 — Save migration      [ ] PASS  [ ] FAIL
TEST 7 — Drift after reload  [ ] PASS  [ ] FAIL
```

**Jeśli wszystkie testy PASS** → P1 zamknięte, gotowe do commit'u i przejścia do **M4 P2 — Sensor radar + Galactic minimap + Vessel cycling**.

**Jeśli FAIL** → notuj który test, co się stało, jakie błędy w konsoli. Zgłoś w nowej sesji żebym mógł naprawić.

---

## Devtools cheatsheet (P1 relevant)

```js
// Debug ekonomia
KOSMOS.debug.giveAll(5000)
KOSMOS.debug.unlockTech('rocketry', 'shipyard_construction', 'interplanetary_logistics')

// Spawn wrogów
KOSMOS.debug.spawnTestEnemy()       // wrog imperium + kolonia na najbliższym wolnym ciele
KOSMOS.debug.spawnEnemyFleet()      // wroga flota (BRUTALNE — materializuje natychmiast 80 px od home)
KOSMOS.debug.spawnEnemyAttack()     // wrogi atak (M4 P1.5: friendly defaults — etaYears=2.0, spawnDistanceAU=30)
KOSMOS.debug.spawnEnemyAttack({ etaYears: 0.5, spawnDistanceAU: 10 })  // agresywne (stare defaults)

// Spawn własnych militarnych (M4 P1.5 — NOWY)
KOSMOS.debug.spawnMyVessel()                  // default hull_frigate combat-ready
KOSMOS.debug.spawnMyVessel('hull_destroyer')  // średni militarny
KOSMOS.debug.spawnMyVessel('hull_cruiser')    // ciężki militarny

// Symulacja battle retreat (TEST 5 — Rev 6 NOWY)
KOSMOS.debug.simulateBattleRetreat()  // deep-space + low fuel + emit retreat
KOSMOS.debug.simulateBattleRetreat({ lowFuel: false })  // normalny retreat path

// Movement Orders (legacy — P1 sprawia że NIEpotrzebne, ale działają nadal)
KOSMOS.debug.enableMovementOrders() // już on by default w M4 P1
KOSMOS.debug.issueOrder(vesselId, { type: 'pursue', targetEntityId: '...' })
KOSMOS.debug.listOrders()

// Drift state inspect
KOSMOS.movementOrderSystem._driftingVessels
KOSMOS.vesselManager.getAllVessels().filter(v => v.driftIdle)

// Force time
KOSMOS.timeSystem.setMultiplier(6)  // 10kr/s — super szybko
KOSMOS.timeSystem.setMultiplier(1)  // 1d/s — slow
```

---

**Adres tego pliku:** `E:\programy\claude_kody\kosmos\docs\m4-p1-test-flow.md`
