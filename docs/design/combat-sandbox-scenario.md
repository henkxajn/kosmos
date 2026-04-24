# Combat Sandbox — scenariusz testowy M2

**Status:** aktywny
**Plik:** `src/scenarios/CombatSandbox.js`
**Wejście:** menu główne → „03 COMBAT SANDBOX"
**Scenario id:** `window.KOSMOS.scenario === 'combat_sandbox'`
**Scenario mode:** `window.KOSMOS.scenarioMode === 'combat_sandbox'` (flaga
dla debug helperów sandbox-only)

---

## Cel

Skrócić ~10-minutowy manualny setup playtestu M2 combat do jednego kliknięcia.
Scenariusz dostarcza **deterministyczny startowy stan bojowy**, a nie gotową
rozgrywkę — gracz sam wydaje ordery i obserwuje efekty systemów M1/M2.

---

## Co zawiera

### Gracz
- Kolonia „Bastion" na wewnętrznej rocky w HZ (wybrana przez `generateCivScenario`).
- 6 POPów, wszystkie techy odblokowane (`Object.keys(TECHS)`).
- Startowy layout: stolica + 4× solar_farm (Lv2) + 2× farm (Lv2) + 2× well (Lv2)
  + 1× mine (Lv2) + 1× shipyard (Lv2).
- Zasoby: 999 każdego elementu + commodity, 500 food/water, 20 000 research.
- **Flota na orbicie Bastionu (4 vessele — wyłącznie kadłuby bojowe):**
  - `Obrońca Alfa` — **Krążownik** (hull_cruiser, 8 slotów: 3× engine_ion + 2× armor + 3× weapon_kinetic)
  - `Obrońca Beta` — **Niszczyciel** (hull_destroyer, 6 slotów: 2× engine + 2× armor + 2× weapon)
  - `Obrońca Gamma` — **Fregata** (hull_frigate, 4 sloty: engine + armor + 2× weapon)
  - `Badacz Sigma` — science_vessel (explorer, nie bierze udziału w walce)
- Dominacja orbitalna gracza nad `sys_home`.

### Wróg (`emp_sandbox_enemy`)
- Archetyp: **xenophage** (militarystyczny).
- Kolonia na **najdalszej** planecie tego samego układu (sortowanie po
  `orbital.a` DESC z planet bez istniejącej kolonii).
- 4 POPy, podstawowy layout: stolica + 2× solar_farm + 1× farm + 1× well + 1× mine.
- **Flota na orbicie (3 vessele — wyłącznie kadłuby bojowe):**
  - `Łowca Alfa` — **Krążownik** (hull_cruiser, loadout jak `Obrońca Alfa`)
  - `Łowca Beta` — **Niszczyciel** (hull_destroyer)
  - `Łowca Gamma` — **Fregata** (hull_frigate)
- `ownerEmpireId = 'emp_sandbox_enemy'`, `isEnemy = true`.
- **BRAK `mission.type = 'attack'`** — wrogowie NIE lecą automatycznie na gracza.
  Scenariusz jest **player-initiated**.

### Stan globalny
- `DiplomacySystem`: WAR z `emp_sandbox_enemy` (reason: `sandbox_scenario`).
- `timeSystem.gameTime = 5` (unika pierwszych niestabilnych ticków).
- Gra na pauzie (gracz sam odpauzuje).
- `window.KOSMOS.scenarioMode = 'combat_sandbox'`.
- `window.KOSMOS._sandboxDefaults = { playerHomeId, enemyHomeId, playerFleet[], enemyFleet[] }`
  — snapshot dla `sandboxResetPositions`.

### Feature flagi automatycznie ON
Scenariusz iteruje po liście flag M1+M2 z guardem `flag in GAME_CONFIG.FEATURES`:
- **M1 (save v65, zarejestrowane):** `movementOrders`, `fleetMaterialization`
- **M2a (save v66, planowane):** `proximitySystem`, `vesselCombat`, `unifiedAggregator`
- **M2b (save v67, planowane):** `intelContactState`, `predictionCone`, `poiSystem`

M2a/M2b flagi włączą się automatycznie gdy zostaną dodane do `GAME_CONFIG.FEATURES`
— bez zmian w scenariuszu. Instancjonowanie systemów: scenariusz próbuje wywołać
`scene._ensureProximitySystem?.()` itd. (no-op gdy metoda jeszcze nie istnieje).

---

## Jak odpalić

1. Live Server → `index.html`
2. W menu głównym kliknij **„03 COMBAT SANDBOX"** (lub „04" gdy istnieje save).
3. Po fade-out loading screen scenariusz ładuje się automatycznie.
4. Gra wstaje na pauzie — kamera skupiona na Bastionie, `colony` overlay otwarty.

---

## Test scenarios

Po załadowaniu wykonuj z konsoli przeglądarki (F12):

### Bazowa weryfikacja
```js
KOSMOS.debug.sandboxInfo();
// Expected: 1 player empire + 'emp_sandbox_enemy', 7 vesseli, flagi M1 ON.

KOSMOS.diplomacySystem.getRelation('emp_sandbox_enemy')?.state;  // 'war'
GAME_CONFIG.FEATURES.movementOrders;                             // true
GAME_CONFIG.FEATURES.fleetMaterialization;                       // true
```

### Test 1: pursue → proximity → combat (po M2a)
```js
const info = KOSMOS.debug.sandboxInfo();
const playerWarship = info.vessels.find(v => v.name === 'Obrońca Alfa').id;
const enemyWarship  = info.vessels.find(v => v.name === 'Łowca Alfa').id;

KOSMOS.debug.issueOrder(playerWarship, { type: 'pursue', targetEntityId: enemyWarship });
// Gracz ściga. Po M2a merge: ProximitySystem wykryje zbliżenie < 0.15 AU,
// VesselCombatSystem odpali deep-space battle, AutoRetreatSystem wyśle
// przegranego do najbliższej friendly planety.
```

### Test 2: moveToPoint do punktu w pół drogi
```js
KOSMOS.debug.issueOrder(playerWarship, {
  type: 'moveToPoint',
  targetPoint: { x: 0, y: 0 }  // lot do gwiazdy — route walker doda waypoint tangencjalny
});
```

### Test 3: materialized fleet (M1 Fleet Materialization)
Wróg spawnuje flotę abstrakcyjną (strength), leci na gracza; gdy ETA < 2 civYears
→ EmpireFleetMaterializer robi strength → vessels. Użyj `spawnEnemyFleet`:
```js
KOSMOS.debug.spawnEnemyFleet({ strength: 500, etaYears: 1.5 });
// Flota materializuje się po osiągnięciu thresholdu.
```

### Test 4: endurance drain
```js
// Pursue drain ×3 (vs baseline 1×) — M1 feature flag ma to pokryte w M2a.
// Sprawdź przed/po ticku:
KOSMOS.vesselManager.getVessel(playerWarship).endurance;
```

### Test 5: save/load
```js
KOSMOS.saveSystem.save();   // save ver 65 (lub aktualna)
location.reload();
// → Continue → sandbox state zachowany (vessele, wróg, wojna, scenarioMode).
// Flagi FEATURES mogą wrócić do defaultu — wywołaj ręcznie enable... jeśli potrzeba.
```

---

## Debug helpers (tylko w Combat Sandbox)

Wszystkie żyją pod `KOSMOS.debug.*` i sprawdzają `scenarioMode === 'combat_sandbox'`:

| Helper | Opis |
|---|---|
| `KOSMOS.debug.sandboxInfo()` | Dump: empires, vessele (id/name/owner/state/position), aktywne feature flagi, `_sandboxDefaults`. |
| `KOSMOS.debug.sandboxResetPositions()` | Wszystkie vessele → orbit home (gracz: Bastion, wróg: enemy home). Anuluje aktywne ordery, czyści mission. |
| `KOSMOS.debug.sandboxSpawnMoreEnemies(count=1)` | Spawnuje N dodatkowych wrogich hull_small na orbicie enemy home. |

Ogólne (działają też poza sandboxem): `spawnEnemyFleet`, `spawnEnemyAttack`,
`issueOrder`, `cancelOrder`, `listOrders`, `materializeFleet`, `giveAll`, itd.

---

## Granice scope

- **NIE** testuje poprawności combat math (to smoke testy M2a per-commit).
- **NIE** dodaje nowych hulli/tech/budynków — reuse tylko istniejącej infry.
- **NIE** modyfikuje save migration — scenariusz produkuje state w aktualnej wersji
  (v65 baseline, v66 po M2a, v67 po M2b).
- **NIE** jest savowo-anomalny — save/load działa normalnie, scenariusz przestaje
  być „tryb" po reload, ale wszystkie obiekty (vessele, empires, colonies) są
  standardowe i przeżywają restore.

---

## Architektura

```
TitleScene → _handleChoice('combat_sandbox')
  → window.KOSMOS.scenario = 'combat_sandbox'
  → window._startMainGame()
    → GameScene.start()
      → _generateFreshSystem() → generateCivScenario()   # reuse istniejącego
      → auto-colonization IIFE (linia ~1505):
          if (isCombatSandbox) {
            leaderSystem.setLeaderNoFaction('yara_osei', 0);
            loadCombatSandbox(this, civPlanet);
            return;
          }
```

Scenariusz **nie modyfikuje** SystemGenerator, SaveMigration ani istniejących
ścieżek — jedynie dodaje nowy branch obok `isPowerTest` / `isBoosted`.
