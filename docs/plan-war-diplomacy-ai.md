# Plan implementacji — Wojna, Dyplomacja i AI obcych cywilizacji

**Status**: zatwierdzony, oczekuje na implementację.
**Autor**: wspólnie (gracz + Claude Opus 4.6) — po rozmowie z Sonnetem i rewizji architektury.

---

## 1. Cel

Wprowadzenie do KOSMOSU kompletnego systemu:
- **Obce cywilizacje** (Empire) w sąsiednich układach gwiezdnych (`galaxyData`)
- **Wywiad i pierwszy kontakt** (mgła, misje, stopniowe ujawnianie)
- **Dyplomacja** (relacje, oferty, termometr hostility, reputacja)
- **Wojna w galaktyce** (floty na mapie, zaopatrzenie, bombardowanie)
- **Walka 3D** jako "teatr bitwy" — wynik wyliczony przez silnik, Three.js to wizualizacja
- **Desant lądowy** — integracja z `GroundUnitManager` + `ColonyOverlay` (przejęcie hex map)
- **AI obcych** — hybrydowa: FSM (osobowość) + Utility AI (decyzje militarne) + GOAP (strategia długoterminowa)

## 2. Decyzja architektoniczna — Opcja A + intent methods + DebugLog

### Wybrane podejście

**Reactive store** `GameState.js` jako jedyne źródło prawdy dla NOWYCH domen (empires, intel, diplomacy, wars, battles, invasions).

**NIE**:
- Nie przepisujemy istniejących systemów (ColonyManager, BuildingSystem, ResourceSystem, FactionSystem, LeaderSystem itd.) — zostają nietknięte.
- Nie używamy command pattern (dispatch) — to over-engineering dla solo singleplayer bez replay/multiplayer.

**TAK**:
1. `GameState` — reactive store: `.get(path)`, `.set(path, val)`, `.subscribe(pathPattern, cb)`
2. **Intent methods** na systemach — mutacje TYLKO przez nazwane metody, nie raw `set()` z UI:
   ```js
   // ❌ Źle
   gameState.set('empires.emp_01.hostility', 75);

   // ✅ Dobrze
   empireRegistry.changeHostility('emp_01', +15, 'player_colonized_neighbor');
   ```
3. `DebugLog` — ring buffer subskrybujący EventBus + GameState changes. Eksport do JSON. Zastępuje command pattern dla audit trail AI.
4. **Istniejące systemy** komunikują się ze sobą jak dotąd (EventBus + `window.KOSMOS`). Tylko nowe domeny żyją w GameState.

### Dlaczego odrzuciliśmy alternatywy

- **Opcja B (facade nad window.KOSMOS)** — stan rozproszony, trudniejszy debug, spójna z resztą kodu ale nie daje reaktywności UI za darmo.
- **Opcja C (command pattern + store)** — poprawny ale zbyt ciężki. Unikalna wartość (replay/rollback/multiplayer) nie jest potrzebna. Utility AI nie wymaga speculative dispatch — scoring to czysta funkcja czytająca stan.

---

## 3. Weryfikacja aktualnego kodu (stan na 2026-04-15)

Ważne — **CLAUDE.md i MEMORY.md są częściowo nieaktualne**. Przed implementacją pamiętaj:

### Co JEST (używane)
| Plik | Rola |
|---|---|
| `src/ui/ColonyOverlay.js` | **REALNA mapa planety 2D hex** (tapered). Ma już: sprites jednostek naziemnych, `_landingMode` dla Away Team, event `vessel:awayTeamLanding`. **Tutaj dodajemy UI inwazji.** |
| `src/systems/GroundUnitManager.js` | Jednostki na hex z A*. Obecnie tylko `scan/analyze`. **Tutaj dodajemy combat.** |
| `src/systems/FactionSystem.js` | **WEWNĘTRZNE** frakcje (Seekers/Confederates). NIE dotykamy. |
| `src/systems/LeaderSystem.js` | Przywódca wewnętrzny. NIE dotykamy. |
| `src/systems/StarSystemManager.js` | Rejestr układów gwiezdnych (`sys_home` + leniwa generacja). Tutaj dodajemy `empireId` per system. |
| `src/ui/OverlayManager.js` | Centralny manager overlay'ów. Tutaj rejestrujemy nowe overlays (intel/diplomacy/war). Klawisze: f/p/e/t/c/o/h/v/g/u/d zajęte — nowe: `i`/`y`/`w`? |
| `src/data/ShipsData.js`, `HullsData.js`, `ShipModulesData.js` | System modułowych statków — **rozszerzymy o moduły bojowe** (weapon/shield/armor). |
| `src/data/galaxyData` (w `GalaxyGenerator`) | Sąsiednie układy. **Tutaj spawnujemy imperia.** |

### Co JEST DEAD (nie dotykać, nie referować)
| Plik | Stan |
|---|---|
| `src/scenes/PlanetScene.js` | Dead code. Instancjowany w GameScene ale `planetScene.open/show` ma 0 wywołań. Zastąpiony przez ColonyOverlay. |
| `PlanetGlobeScene` | **Plik usunięty** (mimo że CLAUDE.md/MEMORY.md wciąż go wspominają). |
| `src/renderer/PlanetGlobeRenderer.js` | Nadal używany (globus 3D) — ale renderuje **wewnątrz** canvas, nie jako scena. |

### Wzorce komunikacji
- **EventBus** — pub/sub singleton. Jedyna dozwolona komunikacja między systemami.
- **`window.KOSMOS`** — service locator dla istniejących systemów.
- **`GameState`** (nowy) — reactive store wyłącznie dla nowych domen.

---

## 4. Fazy implementacji

### Faza 0 — Fundament (1 dzień)

**Cel**: GameState + DebugLog + EmpireData. Zero zmian gameplay. Save/restore działa.

**Nowe pliki**:
- `src/core/GameState.js`
  ```js
  class GameState {
    constructor() { this._state = { empires: {}, intel: {}, diplomacy: {}, wars: {}, battles: {}, invasions: {} }; this._subs = []; }
    get(path) { /* 'empires.emp_01.hostility' → walk _state */ }
    set(path, val, reason = '') {
      const old = this.get(path);
      // walk + assign
      this._notifySubscribers(path, val, old, reason);
      EventBus.emit('gameState:changed', { path, value: val, oldValue: old, reason });
    }
    subscribe(pathPattern, cb) { /* glob: 'empires.*.hostility' */ }
    snapshot() { return structuredClone(this._state); }
    serialize() { return this._state; }
    restore(data) { this._state = data ?? this._state; }
  }
  export default new GameState();
  ```
- `src/core/DebugLog.js`
  ```js
  class DebugLog {
    constructor(maxEntries = 10000) {
      this._buf = []; this._max = maxEntries;
      EventBus.on('gameState:changed', (e) => this._push('state', e));
      // Hook do ważnych eventów AI: empire:*, war:*, diplomacy:*, intel:*
    }
    _push(kind, data) { this._buf.push({ year: window.KOSMOS?.timeSystem?.gameTime, kind, ...data }); if (this._buf.length > this._max) this._buf.shift(); }
    export() { return JSON.stringify(this._buf, null, 2); }
    query(filter) { return this._buf.filter(filter); }
  }
  ```
- `src/data/EmpireData.js`
  ```js
  export const ARCHETYPES = {
    xenophage: { namePL: 'Xenofag', personality: { aggression: 0.9, expansion: 0.8, secrecy: 0.3, trade: 0.1, science: 0.4 } },
    isolationist: { namePL: 'Izolacjonista', personality: { aggression: 0.2, expansion: 0.2, secrecy: 0.9, trade: 0.1, science: 0.6 } },
    trader: { namePL: 'Handlarz', personality: { aggression: 0.3, expansion: 0.5, secrecy: 0.3, trade: 0.9, science: 0.5 } },
    hegemon: { namePL: 'Hegemon', personality: { aggression: 0.7, expansion: 0.9, secrecy: 0.4, trade: 0.5, science: 0.6 } },
    swarm: { namePL: 'Rój', personality: { aggression: 0.8, expansion: 0.95, secrecy: 0.1, trade: 0.0, science: 0.3 } },
  };
  ```

**Modyfikacje**:
- `src/scenes/GameScene.js` (~linia 200, gdzie tworzone są systemy):
  ```js
  import gameState from '../core/GameState.js';
  import debugLog  from '../core/DebugLog.js';
  // W start():
  window.KOSMOS.gameState = gameState;
  window.KOSMOS.debugLog  = debugLog;
  ```
- `src/systems/SaveSystem.js` w `_serializeCiv4x()`:
  ```js
  gameState: window.KOSMOS.gameState?.serialize() ?? null,
  ```
  W `restore` path (GameScene lub tam gdzie restauruje się civ4x):
  ```js
  if (c4x.gameState) window.KOSMOS.gameState.restore(c4x.gameState);
  ```
- `src/systems/SaveMigration.js` — bump `CURRENT_VERSION` (aktualnie 51) o 1, dodaj `_migrateV{N}toV{N+1}(data)` z pustymi strukturami GameState.

**Acceptance**:
```js
// W konsoli:
window.KOSMOS.gameState.set('empires.test', { name: 'Test' }, 'debug');
window.KOSMOS.gameState.get('empires.test'); // { name: 'Test' }
window.KOSMOS.gameState.subscribe('empires.*', (e) => console.log(e));
// Zapisz grę → reload → stan zachowany
window.KOSMOS.debugLog.export(); // JSON ring buffer
```

---

### Faza 1 — EmpireRegistry + spawn obcych (2 dni)

**Cel**: 2–6 obcych imperiów widocznych w `GalaxyMapScene` przy starcie nowej gry. Brak interakcji jeszcze.

**Nowe pliki**:
- `src/systems/EmpireRegistry.js`
  - Stan: `gameState.empires[empireId] = { id, name, archetype, personality, homeSystemId, colonies: [{systemId, planetId}], tech: { level, focus }, military: { power }, resources: abstract }`
  - Intent methods: `createEmpire(params)`, `addColony(empireId, systemId, planetId)`, `updateMilitaryPower(empireId, delta, reason)`, `changeTechLevel(empireId, delta, reason)`
  - Subscribes `time:tick` — abstract growth per-imperium (power, tech) wg `personality.expansion/science`
- `src/generators/EmpireGenerator.js`
  - `generate(galaxyData, count = 3 + rand(4))` — dobiera gwiazdy z galaxyData (nie sys_home, w odległości 5-30 AU światła), przypisuje archetyp, spawnuje 1-3 koloni per imperium
  - Call: w `GameScene.start()` przy nowej grze, po `GalaxyGenerator.generate()`

**Modyfikacje**:
- `src/scenes/GalaxyMapScene.js` — rysuj ikonę imperium przy gwieździe (kolor wg archetypu, ??? jeśli `intel.discovered[empireId]` === 'unknown'). Z fazą 2 stanie się mgłą.
- `StarSystemManager._systems[sysId].empireId` — oznaczenie że system należy do imperium.

**EventBus**:
- emit: `empire:created {empireId, archetype, homeSystemId}`, `empire:colonyAdded {empireId, systemId, planetId}`, `empire:techAdvanced`, `empire:destroyed`

**Acceptance**: Nowa gra → GalaxyMap pokazuje 3-5 cudzych gwiazd pokolorowanych. Save/reload zachowuje listę.

---

### Faza 2 — IntelSystem + IntelOverlay (3 dni)

**Cel**: gracz nie widzi obcych jako wszystkie-znane. Stopniowe ujawnianie.

**Nowe pliki**:
- `src/systems/IntelSystem.js`
  - Stan: `gameState.intel[empireId] = { level: 'unknown'|'rumor'|'contact'|'detailed', knownTech: [], knownMilitary: null|number, knownColonies: [] }`
  - Intent methods: `advanceIntel(empireId, toLevel, reason)`, `addKnownTech`, `reportIncident`
  - Subscribes:
    - `vessel:arrived` — jeśli ląduje w systemie oznaczonym empireId → `advanceIntel(..., 'contact')`
    - `observatory:discovered` w systemie empireId → rumor
    - `groundUnit:scanComplete` → szczegóły
  - Ticker: pasywny "nasłuch" obserwatorium → postęp `unknown → rumor` w sąsiednich systemach
- `src/ui/IntelOverlay.js` (rozszerza `BaseOverlay`)
  - Lista znanych imperiów
  - Panel per imperium: archetyp (ujawniony dopiero przy `contact`), znana technologia, siła wojskowa (przy `detailed`), ostatnie incydenty
  - Mgła: dane poniżej aktualnego level'u → "???"
  - Rejestracja: `overlayManager.register('intel', new IntelOverlay())` + klawisz `i` w OverlayManager._keyMap

**Modyfikacje**:
- `src/scenes/GalaxyMapScene.js` — ikona imperium wg `intel.level` (sylwetka dla rumor, nazwa dla contact, szczegóły dla detailed)
- `src/ui/OverlayManager.js` — dodaj `'i': 'intel'` w `_keyMap`

**EventBus**:
- emit: `intel:levelChanged {empireId, oldLevel, newLevel}`, `intel:reportGenerated`, `intel:contactEstablished {empireId, via}`

**Acceptance**: Start gry → wszyscy obcy "???". Wyślij recon do sąsiedniego systemu → imperium przechodzi na rumor. Wyślij science vessel → contact.

---

### Faza 3 — DiplomacySystem + AI FSM (5 dni)

**Cel**: termometr hostility, relacje peace/war/truce, AI FSM per imperium.

**Nowe pliki**:
- `src/systems/DiplomacySystem.js`
  - Stan:
    ```js
    gameState.diplomacy.relations[`${a}_${b}`] = {
      state: 'peace'|'truce'|'war'|'alliance',
      hostility: 0-100,
      trust: 0-100,
      treaties: [...],
      lastIncidents: [{year, type, delta}]
    }
    ```
  - Intent methods: `changeHostility(a, b, delta, reason)`, `signTreaty`, `proposeTreaty`, `breakTreaty`, `declareWar`, `offerPeace`
  - Reguły: hostility +10 gdy gracz skanuje system imperium, +30 gdy kolonizuje w ich strefie, -5/rok gdy pokój i brak incydentów
- `src/systems/AlienCivSystem.js` — **FSM per imperium**:
  ```js
  states: IDLE → EXPANDING → REARMING → AGGRESSIVE → WAR → RETREAT → NEGOTIATING
  ```
  Transitions sterowane:
  - `hostility` z DiplomacySystem
  - `personality.aggression` z archetypu (jako mnożnik progu)
  - `military.power` ratio vs gracz
  - Tick co 1 civYear (akumulator `civDeltaYears`)
  - Przykład: IDLE → AGGRESSIVE jeśli `hostility > 50 * (1/personality.aggression)` AND `military.power > 0.8 * player.power`
- `src/ui/DiplomacyOverlay.js` — lista relacji, pasek hostility, oferty umów, klawisz `y`

**Modyfikacje**:
- `src/ui/OverlayManager.js` — dodaj `'y': 'diplomacy'`
- Progi hostility z progresją akcji gracza → eskalacja:
  ```
  0-20: spokój
  20-40: obserwacja
  40-60: ostrzeżenie (emit diplomacy:warning)
  60-80: ultimatum (emit diplomacy:ultimatum — gracz 3 lata na decyzję)
  80+: declareWar automatyczny
  ```

**EventBus**:
- emit: `diplomacy:relationChanged {a, b, hostility, state}`, `diplomacy:treatyOffered`, `diplomacy:ultimatum`, `ai:fsmTransition {empireId, from, to, reason}`

**Acceptance**: Koloniziujesz planetę w systemie imperium → hostility +30 → ostrzeżenie → jeśli kontynuujesz, wojna.

---

### Faza 4 — WarSystem + moduły bojowe + BattleSystem (7 dni)

**Cel**: deklaracja wojny, floty na mapie galaktyki, abstrakcyjna walka (wynik).

**Nowe pliki**:
- `src/systems/WarSystem.js`
  - Stan: `gameState.wars[warId] = { participants: [a, b], casusBelli, goals, fronts: [{systemId, controller}], exhaustion: {a, b}, startYear }`
  - Intent methods: `declareWar`, `offerPeace`, `movefleetToSystem`, `bombardColony`, `resolveBattle`
- `src/data/CasusBelliData.js` — border incident / religious / tech theft / ideology / extermination (różne warunki zakończenia)
- `src/systems/BattleSystem.js`
  - `resolveBattle(fleetA, fleetB, context)` — abstrakcyjna symulacja 10-30 abstrakcyjnych tur, zwraca `{ winner, lossesA, lossesB, retreated }`
  - Wzór: `power = Σ modules.weapon × hullHP × morale × techMultiplier` per flota, ucierpienia wg różnicy
- `src/data/ShipModulesData.js` — **ROZSZERZENIE**: dodaj moduły `weapon_laser`, `weapon_kinetic`, `weapon_missile`, `shield_basic`, `armor_reactive`, z polami `damage`, `range`, `tracking`, `shieldHP`, `armorHP`
- `src/data/HullsData.js` — **ROZSZERZENIE**: dodaj `hp`, `evasion`, nowe kadłuby bojowe (destroyer, cruiser, command)
- `src/ui/WarOverlay.js` — lista aktywnych wojen, fronty, przyciski propose peace

**Modyfikacje**:
- `src/scenes/GalaxyMapScene.js` — ikony flot (pozycje + ruch), linie frontowe (granice imperiów rysowane auto), bombardowanie jako animacja
- `src/systems/VesselManager.js` — dodaj `vessel.combat = { hp, armorHP, shieldHP }` (tylko dla kadłubów z modułami bojowymi)
- `src/ui/OverlayManager.js` — dodaj `'w': 'war'`

**EventBus**:
- emit: `war:declared {warId, aggressor, defender, casusBelli}`, `war:fleetMoved {fleetId, systemId}`, `battle:starting {fleets}`, `battle:resolved {result}`, `war:peaceSigned`

**Acceptance**: Deklarujesz wojnę → obce floty ruszają → spotykasz je → BattleSystem zwraca wynik → UI pokazuje straty.

---

### Faza 5 — BattleView3D (5-7 dni)

**Cel**: wizualizacja starcia. Wynik **już wyliczony** przez BattleSystem — ta scena to animacja, nie source-of-truth.

**Nowe pliki**:
- `src/scenes/BattleView3D.js` — dedykowana scena Three.js
  - `start(battleResult, fleetA, fleetB)` — podpina się do `#three-canvas` w trybie overlay (pauzuje renderer głównego układu)
  - Ładuje modele GLB: `cargo3d.glb`, `research1.glb` (istniejące) + nowe (gdy będą) — fallback na proceduralne sprite'y
  - Cinematic camera: dolly + track
  - Pociski (particle trails), eksplozje, trafienia — timing wyprowadzony z `battleResult.timeline[]`
  - Po animacji → `onFinish` → powrót do GameScene
- `src/ui/BattleIntroModal.js` — popup "ENGAGEMENT IMMINENT" z przyciskami: `Watch` / `Skip` / `Auto`

**Modyfikacje**:
- `src/renderer/ThreeRenderer.js` — metoda `suspend()` / `resume()` do pauzy głównego renderera podczas battle view
- BattleSystem generuje `battleResult.timeline` (lista wydarzeń z timestampami: "5s: destroyer fires on cruiser")

**EventBus**:
- listen: `battle:starting` → otwórz BattleIntroModal → wybór gracza → albo skip (wynik natychmiastowy) albo BattleView3D

**Acceptance**: Spotkanie flot w wojnie → popup → `Watch` → scena 3D z pociskami → wynik pokazany → powrót.

---

### Faza 6 — InvasionSystem + ColonyOverlay combat (5 dni)

**Cel**: desant na wrogą planetę, walka na hex, przejęcie kolonii.

**Nowe pliki**:
- `src/systems/InvasionSystem.js`
  - Inwazja: transport + `ground_troop_bay` (nowy moduł) → lądowanie = spawn wrogich jednostek na hex map
  - Stan: `gameState.invasions[invId] = { planetId, aggressor, defender, landedTroops, battlesOnHex }`
  - Intent methods: `launchInvasion`, `landTroops`, `attackHex`, `captureCapital`
- `src/data/GroundUnitData.js` — nowy plik definicji: `infantry`, `mech`, `garrison` z `hp`, `attack`, `defense`, `range`

**Modyfikacje**:
- `src/systems/GroundUnitManager.js` — **ROZSZERZENIE**:
  - Dodaj pola `hp`, `attack`, `defense`, `owner` (empireId lub 'player')
  - Typ `unit.mission = 'attack_hex'` — atak sąsiadujący hex
  - Tick walki: dwie jednostki różnych owner na sąsiednich hex → damage exchange
  - Gdy `unit.hp <= 0` → `removeUnit` + event
- `src/systems/BuildingSystem.js` — **ROZSZERZENIE**:
  - `tile.buildingHP` (default = maxHP z BuildingsData) — budynek niszczalny
  - Niektóre budynki (`defense_tower`, `defense_grid`) strzelają do wrogich jednostek w promieniu
  - Przy `buildingHP <= 0` → destroy (event `planet:buildingDestroyed`)
- `src/ui/ColonyOverlay.js` — **ROZSZERZENIE**:
  - Warstwa wrogich jednostek (kolor czerwony, ikona wroga)
  - Linie ostrzału (animacja) między atakującą a atakowaną hex
  - Panel informacyjny wybranej jednostki wroga (przy level intel=detailed)
  - Przycisk `Attack` gdy wybrana jednostka gracza sąsiaduje z wrogą
- `src/ui/OverlayManager.js` — capture overlay przy przejęciu stolicy: animacja + transfer kolonii
- `src/systems/ColonyManager.js` — metoda `transferColony(planetId, newOwner)` (event `colony:captured`)

**EventBus**:
- emit: `invasion:launched`, `invasion:troopsLanded`, `groundUnit:attacked {attacker, defender, damage}`, `groundUnit:destroyed`, `planet:buildingDestroyed`, `colony:captured {planetId, from, to}`

**Acceptance**: Wysyłasz transport z wojskami → ląduje na wrogiej planecie → ColonyOverlay pokazuje jednostki → walka na hex → przejęcie stolicy → kolonia twoja.

---

### Faza 7 — MilitaryAI + EconAI (GOAP + Utility AI, ongoing)

**Cel**: AI imperiów aktywnie gra — rozbudowują, atakują, zawierają sojusze.

**Nowe pliki**:
- `src/systems/ai/UtilityAI.js` — generyczne scoring:
  ```js
  evaluate(empireId, actions) {
    return actions.map(a => ({ action: a, score: scoreFn(a, state) })).sort();
  }
  ```
  Akcje: `attackPlayer`, `reinforceSystem`, `buildFleet`, `negotiate`, `research`, `colonize`
- `src/systems/ai/MilitaryAI.js` — UtilityAI z scoring functions dla militarnych decyzji per imperium
- `src/systems/ai/EconAI.js` — **GOAP 2-poziomowy**:
  - Level 1: roczny wybór celu strategicznego (expand / defend / research / diplomacy) wg `personality`
  - Level 2: rozkłada cel na konkretne akcje (buduj stocznię, buduj flotę, kolonizuj system X)

**Integracja**: `AlienCivSystem.tick()` woła `MilitaryAI.decide(empireId)` + `EconAI.planStrategy(empireId)` raz na civYear per imperium.

**Debugowanie**: `DebugLog.query({ kind: 'ai', empireId: 'emp_03' })` → zobacz decyzje AI za ostatnie 50 lat gry.

---

## 5. Konwencje i zasady

### 5.1 Mutacje — intent methods, nie raw set()

```js
// ❌ NIE w UI/innym systemie:
gameState.set('empires.emp_01.hostility', 75);

// ✅ W systemie-właścicielu domeny:
class EmpireRegistry {
  changeHostility(empireId, delta, reason) {
    const emp = gameState.get(`empires.${empireId}`);
    if (!emp) return;
    const newVal = Math.max(0, Math.min(100, emp.hostility + delta));
    gameState.set(`empires.${empireId}.hostility`, newVal, reason);
    EventBus.emit('empire:hostilityChanged', { empireId, delta, reason });
  }
}

// UI wywołuje:
window.KOSMOS.empireRegistry.changeHostility('emp_01', +15, 'player_colonized_neighbor');
```

### 5.2 Każdy nowy system
- Klasa z serialize/restore (albo całkowicie w GameState — wtedy GameState.serialize wystarcza)
- Subskrypcja EventBus (nie import innych systemów)
- Jeśli ticker — akumulator `civDeltaYears` (mechaniki 4X), nie `deltaYears` (fizyka)
- Dwujęzyczność (PL+EN) we wszystkich UI stringach

### 5.3 SaveMigration
- Każda faza bumpuje CURRENT_VERSION
- W migracji: dodaj puste struktury GameState z defaults
- Backup w localStorage (standard z SaveMigration.js)

### 5.4 Nowe overlays — rejestracja w OverlayManager
Klawisze zajęte: f/p/e/t/c/o/h/v/g/u/d
Wolne do użycia: `i` (intel), `y` (diplomacy — z "dYplomacja"), `w` (war), `b` (battles archive?)

### 5.5 NIE dotykamy
- `FactionSystem` — wewnętrzne frakcje (Seekers/Confederates), nie obce imperia
- `LeaderSystem` — wewnętrzny lider
- `ColonyManager`, `BuildingSystem`, `ResourceSystem`, `CivilizationSystem` — per-kolonia gospodarka
- `PlanetScene.js` — dead code (zostaw w spokoju, ewentualnie usuń w osobnym etapie porządków)

---

## 6. Aktualizacje CLAUDE.md (TODO przed startem Fazy 0)

- Linie ~17, 28: `PlanetScene` → `ColonyOverlay` (jako realna mapa planety). Zaznacz że PlanetScene to legacy.
- Tabela EventBus (linie 190-239): zamień `PlanetScene` → `ColonyOverlay` w kolumnach Emitent/Odbiorcy.
- Dodaj sekcję o `GameState` i zasadzie intent methods (po sekcji "Architektura").
- W Memory (`MEMORY.md`): usuń lub oznacz jako stale wpisy o PlanetGlobeScene w sekcji "Globus 3D planety".

---

## 7. Kolejność wykonania (rekomendowana)

1. **Faza 0** — fundament (1 dzień)
2. **Faza 1** — spawn imperiów + GalaxyMap icons (2 dni)
3. **Faza 2** — IntelSystem + IntelOverlay (3 dni)
4. **Faza 3** — DiplomacySystem + AI FSM (5 dni)
5. **Faza 4** — WarSystem + moduły bojowe + BattleSystem (7 dni)
6. **Faza 5** — BattleView3D (5-7 dni)
7. **Faza 6** — InvasionSystem + ColonyOverlay combat (5 dni)
8. **Faza 7** — AI advanced (ongoing, równolegle do balance)

Po każdej fazie: sanity check + commit + save/reload test.

---

## 8. Checklist przed rozpoczęciem nowej sesji

- [ ] Przeczytaj ten plik (`docs/plan-war-diplomacy-ai.md`)
- [ ] Sprawdź że CLAUDE.md jest zaktualizowany (PlanetScene → ColonyOverlay)
- [ ] Przeczytaj aktualne `MEMORY.md`
- [ ] Sprawdź `src/ui/ColonyOverlay.js` (to będzie extending point dla invasion)
- [ ] Sprawdź `src/systems/GroundUnitManager.js` (to będzie extending point dla combat)
- [ ] Potwierdź aktualne `SaveMigration.CURRENT_VERSION` (było 51 na dzień 2026-04-15) — Faza 0 bumpnie o 1
- [ ] Start od Fazy 0: Write `src/core/GameState.js`, `src/core/DebugLog.js`, `src/data/EmpireData.js`

---

*Dokument zatwierdzony. Gotowy do startu implementacji w nowej sesji.*
