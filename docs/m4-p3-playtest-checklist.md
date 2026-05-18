# M4 P3 — Playtest Checklist (Tick-based Deep-Space Combat)

**Save version:** v71
**Tag:** `m4-p3-complete`
**Data:** 2026-05-18
**Cel:** Manualna weryfikacja wszystkich funkcji M4 P3 po implementacji 8 atomic commitów + CombatHUD hotfix + combat throttle hotfix.

## Hotfixy z playtestu (2026-05-18)

- **CombatHUD position** — przesunięty niżej (TOP_BAR_H + 80) by nie nachodził na pasek zasobów
- **Combat throttle** — `CIV_PER_ROUND=0.3` + `MAX_ROUNDS_PER_TICK=1` w `DeepSpaceCombatSystem`. Wcześniej przy 10r/s combat resolvował się w 0.5s real time. Teraz ~30 rund w 5-10s przy normalnym tempie gry.
- **Auto-slow na vessel:engaged** — UIManager auto-slow gdy zaczyna się bitwa (gracz ma czas zobaczyć CombatHUD)
- **API note:** `KOSMOS.vesselManager.getAllVessels()` (NIE `.list()` — ta metoda nie istnieje)

## Wymagania wstępne

- Live Server uruchomiony w VS Code (port 5500 lub inny)
- Otworzyć grę w przeglądarce (Chrome/Firefox/Edge)
- Otworzyć DevTools (F12) — zakładka **Console**
- Wyczyść localStorage przed pierwszym testem: w konsoli `localStorage.clear()` (opcjonalne, sprawdź czy nie zepsuje testu T2)

## Setup standardowy (powtarzany w większości testów)

1. Załaduj grę → ekran tytułowy KOSMOS
2. Klik **Power Test** (przycisk na ekranie tytułu)
3. Czekaj aż scena załaduje (kamera + planeta + jedna kolonia + starting frigate)
4. Weryfikacja: w konsoli `KOSMOS.vesselManager.getAllVessels()` powinno zwrócić ≥1 vessel (player frigate)
5. Weryfikacja flag: `KOSMOS.gameConfig.FEATURES.m4DeepSpaceCombat === true`

---

## T1 — Tech multiplier (weapon_optics)

**Cel:** Weryfikacja że tech zwiększa rangeAU broni (efekt schema `{type:'multiplier', category, value}`).

**Kroki:**
1. Setup standardowy (Power Test)
2. W konsoli sprawdź baseline:
   ```js
   KOSMOS.deepSpaceCombatSystem._resolveWeaponRange({rangeAU:0.05, category:'short'}, 'player')
   ```
   **Oczekiwane:** `0.05`
3. Zbadaj tech `weapon_optics`:
   ```js
   KOSMOS.techSystem._researched.add('weapon_optics')
   ```
   (lub przez UI: klawisz `T` lub `B` → zakładka Technologie → Defense → weapon_optics → Badaj. Wymaga prereq `point_defense`.)
   **UWAGA:** Jeśli `getMultiplier` zwraca 1.0 mimo dodania techa — sprawdź czy tech ma poprawny `effects: [{ type: 'multiplier', category: 'weapon_range_short', value: 1.25 }]` w `TechData.js`. Dla `range_finder_array` kategoria to `weapon_range_all` (nie `weapon_range_short` — to inny tech).
4. Sprawdź mnożnik:
   ```js
   KOSMOS.techSystem.getMultiplier('weapon_range_short')
   ```
   **Oczekiwane:** `1.25`
5. Sprawdź rangeAU po tech:
   ```js
   KOSMOS.deepSpaceCombatSystem._resolveWeaponRange({rangeAU:0.05, category:'short'}, 'player')
   ```
   **Oczekiwane:** `0.0625`

**Acceptance:**
- ✅ Baseline = 0.05
- ✅ Po tech mnożnik = 1.25
- ✅ Efektywny range = 0.0625

**Bonus:** Zbadaj również `range_finder_array` (×1.15 all) → laser powinien mieć `0.05 × 1.25 × 1.15 ≈ 0.0719 AU`.

---

## ⏱ Tempo walki (ważne przed wszystkimi testami combat)

Po hotfix combat throttle:
- **Pauza (klawisz spacja):** combat zatrzymany (civDy=0)
- **1d/s (klawisz 1):** combat bardzo wolny — 1 runda ~co 6 sekund real time
- **1m/s (klawisz 3):** combat wolny — 1 runda ~co 0.6s, 30 rund ~18s. **Zalecane do obserwacji**
- **1r/s (klawisz 4):** combat normalny — 30 rund ~3-5s real time
- **10r/s (klawisz 5):** combat szybki — 30 rund ~1-2s
- **Auto-slow:** gdy zaczyna się bitwa, czas auto-spowalnia (`triggerAutoSlowIfTime`). Po finalize battle gracz może wznowić.

Jeśli walka nadal jest za szybka — przed `spawnEnemyAttack` zwolnij czas do 1d/s lub 1m/s.

## T2 — Save/Load mid-combat (krytyczne, `deepSpaceEngagements` persist)

**Cel:** Encounter trwa po reload (active encounter zserializowany + odtworzony).

**Kroki:**
1. Setup standardowy
2. Spawn enemy:
   ```js
   KOSMOS.debug.spawnEnemyAttack({etaYears:5})
   ```
3. Czekaj aż vessele zbliżą się (~5 lat gry, można przyspieszyć klawisz 4 lub 5)
4. Po wejściu w combat range — sprawdź w konsoli:
   ```js
   KOSMOS.deepSpaceCombatSystem.listActive()
   ```
   **Oczekiwane:** tablica z 1 encounter, `currentRound >= 1`
5. Zapamiętaj: `currentRound`, sumę HP sideA i sideB, oraz encounter ID
6. **W trakcie walki** (np. runda 3-5) → naciśnij `F5` (lub menu → Zapisz)
   - W przeglądarce: kliknij ikonę reload lub Ctrl+R
7. Po reload → BootScene pyta "Wczytać poprzedni save?" → **Tak**
8. Po załadowaniu sceny → sprawdź:
   ```js
   KOSMOS.deepSpaceCombatSystem.listActive()
   ```
   **Oczekiwane:** ten sam encounter ID, currentRound bliski temu sprzed reload (±1), vesselStates HP zachowane

**Acceptance:**
- ✅ Encounter istnieje po reload
- ✅ HP/currentRound/distance restored (±1 round tolerance)
- ✅ Walka kontynuuje bez crashu (nie restart od zera)
- ✅ CombatHUD pokazuje encounter po reload

**Edge case:** Sprawdź save **bez** aktywnego combat — `deepSpaceEngagements` powinno być `{}` w save data (klucz `kosmos_save_v1` w localStorage).

---

## T3 — Wraki deep-space + battle report (klawisz K)

**Cel:** Po bitwie z wrakiem, klawisz K otwiera FleetManagerOverlay z focusem na wraku + battle report.

**Kroki:**
1. Setup standardowy
2. `KOSMOS.debug.spawnEnemyAttack({etaYears:5})`
3. Czekaj na pełną walkę aż do końca (battle:resolved, jakiś vessel staje się wrakiem)
   - Może wymagać ~10-20 rund (kilka civYears gry)
4. Po `battle:resolved` (powiadomienie w EventLogu) → naciśnij `K`
5. Otwiera się FleetManagerOverlay
6. **Oczekiwane:**
   - Sekcja "Wraki" widoczna
   - Auto-scroll do pierwszego wraka deep-space
   - Wrak ma pozycję (nie dockedAt) — `wreckLocation: {x, y}`
   - Klik na wraka → expanded row z battle report
7. Sprawdź expand:
   - Winner: A lub B
   - Retreated: null / 'A' / 'B'
   - Rounds: liczba
   - Losses: ilu padło per side
8. Klik na wraka → kamera 3D fly-to (sprawdź w viewport czy kamera ustawia się na wraku)

**Acceptance:**
- ✅ Wrak na liście w sekcji "Wraki"
- ✅ Battle report w expanded row (winner/retreated/rounds)
- ✅ Kamera fly-to działa na deep-space wraka
- ✅ `vessel.lastBattleId` i `lastBattleYear` stampowane

---

## T4 — CombatHUD live overlay

**Cel:** Mały panel pokazujący postęp walki (HP, round, distance) auto-show podczas combat.

**Kroki:**
1. Setup standardowy
2. **Przed combat:** CombatHUD NIE jest widoczny (brak active encounters)
3. `KOSMOS.debug.spawnEnemyAttack({etaYears:5})`
4. Czekaj aż vessele wejdą w combat range
5. **Oczekiwane (po wejściu w combat):**
   - Panel pod TopBar (top-center), szerokość ~380px
   - Header "⚔ BITWA W DEEP-SPACE" (czerwony)
   - Lewa strona (sideA) — zielona, label "player" lub nazwa imperium
   - Prawa strona (sideB) — czerwona, label imperium wroga
   - Środek: "runda X · 0.XXX AU"
   - 2 HP bary (zielony lewy, czerwony prawy) z labelem `XXX / XXX HP`
   - Liczniki "żywych: X/Y" pod barami
6. **W trakcie walki:** HP bary maleją, currentRound rośnie, distance live
7. Po `battle:resolved` → panel znika (auto-hide)

**Acceptance:**
- ✅ Panel ukryty gdy brak active encounters
- ✅ Panel widoczny w trakcie combat
- ✅ HP bary updateują się każdy tick
- ✅ Distance i round live
- ✅ Panel znika po finalize battle

**Edge case (multi-encounter):** Jeśli spawn 2x enemy → 2 encountery → panel rozrasta się, header pokazuje "(2)".

---

## Balans wrogów (jeśli za słabi)

Default `spawnEnemyAttack({strength:500})` daje `hull_medium` (80 HP, 0 armor) z 2× `weapon_kinetic`. Player frigate ma 120 HP + 2 armor → przewaga gracza.

Aby wymusić silniejszego wroga:
```js
// Wróg z większym kadłubem + lepszą bronią:
KOSMOS.debug.spawnEnemyAttack({strength: 1000})   // hull_large, 180 HP, 4 weapons
// Lub edytuj SpawnTestEnemy.js → strength branch < 800 (medium) → dodaj weapon_missile/laser
```

Lub spawn z konkretnymi modułami przez `spawnEnemyCiv` (wymaga `transport:true`).

## T5 — Missile bomber vs frigate (long range vs medium range)

**Cel:** Asymetryczna walka — bomber z weapon_missile (0.30 AU) ma przewagę zasięgu nad frigate z weapon_kinetic (0.15 AU).

**Kroki:**
1. Setup standardowy
2. Sprawdź broń startowego frigate (powinno być weapon_kinetic, range 0.15):
   ```js
   KOSMOS.vesselManager.getAllVessels()[0].modules
   ```
3. Spawn missile bomber:
   ```js
   KOSMOS.debug.spawnEnemyAttack({etaYears:5, shipType:'bomber_missile'})
   ```
   (sprawdź `KOSMOS.debug.spawnEnemyAttack` jakie shipType są dostępne)
4. PPM na enemy bomber → "Zaangażuj" (engage order)
5. Obserwuj:
   - Frigate kituje toward bomber (musi się zbliżyć — kinetic optimal 0.142)
   - Bomber strzela rakietami z ~0.30 AU (frigate jeszcze poza zasięgiem kinetic)
   - Frigate dostaje damage zanim sam zacznie strzelać
   - Dopiero gdy frigate < 0.15 AU → kinetic w grze
6. CombatHUD: obserwuj że HP frigate spada szybciej w pierwszych rundach (bomber sam strzela)

**Acceptance:**
- ✅ Bomber zaczyna strzelać z dalej niż frigate
- ✅ Frigate musi się zbliżyć aby odpowiedzieć
- ✅ Asymetryczny damage w pierwszych rundach (frigate niedopalany)
- ✅ Po zbliżeniu — wymiana ognia

**Note:** Jeśli `spawnEnemyAttack` nie ma opcji shipType, użyj domyślnego enemy (sprawdź w `_getEnemyShip` w debug helpers).

---

## T6 — Reinforcement (Opcja B — `_joinEncounter`)

**Cel:** Drugi player vessel dolatujący do aktywnego encounter dołącza jako reinforcement (joinedVesselIds[], joinedAtRound > 0).

**Kroki:**
1. Setup standardowy (1 player frigate)
2. Spawn drugiego player vessel:
   ```js
   KOSMOS.debug.spawnMyVessel('hull_frigate', {position:{x:0.3, y:0.0}})
   ```
3. `KOSMOS.debug.spawnEnemyAttack({etaYears:5})`
4. Pierwszy player vessel wchodzi w combat → encounter aktywny (sprawdź `listActive()`)
5. Drugi player vessel: PPM → "Zaangażuj" na enemy
6. Drugi vessel dolatuje do combat range
7. Sprawdź:
   ```js
   const enc = KOSMOS.deepSpaceCombatSystem.listActive()[0];
   enc.sideA.vesselIds          // [vessel1Id]
   enc.sideA.joinedVesselIds    // [vessel2Id]
   enc.vesselStates.get(vessel2Id).joinedAtRound  // > 0
   ```
8. CombatHUD: total HP sideA wzrosło o HP drugiego vessela
9. Retreat threshold (0.2 × aggregate hpStart) — proporcjonalnie wyższy

**Acceptance:**
- ✅ Drugi vessel w `joinedVesselIds` (nie w `vesselIds`)
- ✅ `joinedAtRound > 0` (nie zero — initial vessele mają 0)
- ✅ CombatHUD pokazuje wyższy total HP sideA
- ✅ Walka kontynuuje, oba vessele strzelają

---

## T7 — combatRangeExit → draw

**Cel:** Gdy oba vessele uciekają poza COMBAT_DISENGAGE_AU (0.50 AU) → encounter finalize jako draw, żywi pozostają, brak wraków.

**Kroki:**
1. Setup standardowy
2. `KOSMOS.debug.spawnEnemyAttack({etaYears:5})`
3. Wejście w combat
4. **Anuluj engage** (jeśli był aktywny) — PPM na własny vessel → "Anuluj rozkaz"
5. Wydaj `moveToPoint` w przeciwnym kierunku od enemy (PPM na pustą przestrzeń daleko)
6. Enemy AI w P3 jest stationary — sam nie ucieka, więc dystans rośnie tylko gdy player ucieka
7. **Alternatywa testowa:** użyj `KOSMOS.debug` do teleport player vessel daleko:
   ```js
   const v = KOSMOS.vesselManager.getAllVessels()[0];
   v.position.x = 10; v.position.y = 10;
   ```
8. Tick — ProximitySystem emit `combatRangeExit` → DSCS finalize as draw

**Oczekiwane:**
- `battle:resolved` z `winner: null` lub `retreated: null && winner: null`
- Brak wraków
- Żywi vessele pozostają na pozycji
- CombatHUD znika

**Acceptance:**
- ✅ Encounter finalize bez wraków (gdy oba żywe i daleko)
- ✅ EventLog: "Bitwa zakończona remisem" (lub podobny)
- ✅ Vessele pozostają w grze

**Note:** Teleport to debug shortcut — w real-flow combatRangeExit zachodzi naturalnie gdy player ucieka i enemy nie ma rozkazu pursue.

---

## T8 — PPM engage — warning "Brak broni"

**Cel:** Vessel bez weapon module — PPM na enemy pokazuje opcję Engage z ⚠ warning.

**Kroki:**
1. Setup standardowy
2. Spawn vessel BEZ broni:
   ```js
   KOSMOS.debug.spawnMyVessel('hull_frigate', {modules:[]})
   ```
   lub vessel z samym `hull_frigate` bez weapon module
3. Select tego vessela (LPM lub Tab)
4. `KOSMOS.debug.spawnEnemyAttack({etaYears:5})`
5. PPM na enemy vessel (gdy widoczny na mapie 3D lub minimap)
6. **Oczekiwane:** menu PPM zawiera opcję "Zaangażuj" z ⚠ "Brak broni" (warning ikona/tekst)

**Acceptance:**
- ✅ Opcja Engage widoczna (nie ukryta)
- ✅ Warning ⚠ "Brak broni" obok labela
- ✅ Klik nadal możliwy (nie disabled — gracz może świadomie wydać rozkaz suicydalny)

---

## T9 — Tab cycling (M4 P2 regression)

**Cel:** Sprawdzić że Tab/Shift+Tab nadal działa po M4 P3.

**Kroki:**
1. Setup standardowy + spawn 2 dodatkowe player vessele
2. Naciśnij `Tab` → cycle selected vessel forward
3. Naciśnij `Shift+Tab` → cycle backward
4. **Oczekiwane:**
   - Wraparound (po ostatnim → pierwszy)
   - Wraki pomijane
   - Enemy vessele pomijane

**Acceptance:**
- ✅ Tab cycle przez player vessele
- ✅ Shift+Tab cofa
- ✅ Wraparound działa

---

## T10 — Sensor overlay (M4 P2 regression)

**Cel:** Klawisz toggle sensor overlay (Radar w BottomBar menu).

**Kroki:**
1. Setup standardowy
2. BottomBar → menu (≡ ikona) → "Radar" → on/off
3. **Oczekiwane (ON):**
   - Cyan ring 0.3 AU wokół player vessel
   - Yellow ring wokół kolonii (range zależny od ObservatorySystem level)
4. **Oczekiwane (OFF):** ringi znikają

**Acceptance:**
- ✅ Cyan ring wokół player vessel
- ✅ Yellow ring wokół kolonii
- ✅ Toggle działa

---

## T11 — Galactic minimap (M4 P2 regression)

**Cel:** Klawisz `M` otwiera mini-mapę galaktyki.

**Kroki:**
1. Setup standardowy
2. Naciśnij `M`
3. **Oczekiwane:** overlay top-right z systemami + imperiami + strzałkami flot

**Acceptance:**
- ✅ Minimap pojawia się/znika z `M`
- ✅ Systemy widoczne
- ✅ Imperia z odpowiednim kolorem (hostility-based)

---

## T12 — Enemy ghosts (M4 P2 regression)

**Cel:** Enemy vessele renderują się z opacity zależną od intel quality (unknown/rumor/contact/detailed).

**Kroki:**
1. Setup standardowy
2. `KOSMOS.debug.spawnEnemyAttack({etaYears:20})` — enemy daleko (poza sensor range)
3. **Oczekiwane:** enemy vessel niewidoczny lub bardzo przezroczysty (opacity 0.3 z fade)
4. Wraz z dolataniem — quality upgrade do contact (opacity 0.5) → detailed (1.0)

**Acceptance:**
- ✅ Daleki enemy = przezroczysty/niewidoczny
- ✅ Bliski enemy = w pełni widoczny
- ✅ Transition stopniowy

---

## T13 — Smoke tests automatyczne

**Cel:** Wszystkie testy offline PASS.

**Kroki:**
1. Otwórz terminal w katalogu projektu
2. Uruchom:
   ```bash
   node tmp_m4_p3_smoke.mjs
   ```
   **Oczekiwane:** `51/51 PASS` (lub aktualny target)
3. Regression M4 P2:
   ```bash
   node tmp_m4_p2_smoke.mjs
   ```
   **Oczekiwane:** `30/30 PASS`
4. Regression M4 P1:
   ```bash
   node tmp_m4_p1_smoke.mjs
   ```
   **Oczekiwane:** `33/33 PASS`

**Acceptance:**
- ✅ Wszystkie 3 zestawy GREEN
- ✅ Brak nowych failures

---

## Najszybsza ścieżka E2E (~15 min)

Jeśli mało czasu — wykonaj w tej kolejności:

1. **T1** — Tech multiplier (~2 min, konsola)
2. **T4** — CombatHUD widoczność (~3 min, podstawowa walka)
3. **T2** — Save/Load mid-combat (~5 min, krytyczne)
4. **T3** — Wraki + battle report (~5 min, post-combat flow)

To pokrywa: dane (tech), runtime (combat HUD), persistence (save), post-flow (wraki). T5-T8 zostaw na ad-hoc gdy natkniesz się w naturalnej rozgrywce.

---

## Reporting bugs

Jeśli któryś test FAIL — zapisz:
1. Numer testu (T1-T13)
2. Krok który zawiódł
3. Oczekiwany vs faktyczny rezultat
4. Console errors (jeśli są)
5. Screenshot (opcjonalnie)
6. Save data (export z localStorage `kosmos_save_v1`)

Format raportu:
```
TEST: T2 — Save/Load mid-combat
KROK: 8 (po reload)
OCZEKIWANE: encounter restored z currentRound=5
FAKTYCZNE: KOSMOS.deepSpaceCombatSystem._activeEncounters jest puste (Map size 0)
CONSOLE ERROR: brak
```
