# KOSMOS — AI Testing Harness

Narzędzie do testowania gry KOSMOS przez botów AI grających w trybie headless (bez renderowania i UI). Produkuje raporty JSON + Markdown z crashami, metrykami i flagami bottleneck.

**Zero modyfikacji gry** — wszystko żyje w `src/testing/`. Normalnie uruchomiona gra w przeglądarce działa identycznie jak wcześniej.

---

## 🖥️ Wizualny interfejs (polecane!)

Zamiast CLI — odpal HTML konsolę z myszką:

```bash
node src/testing/ui/server.js
# Otwórz w przeglądarce: http://localhost:4455
```

**Co masz:**
- 🎛️ Zakładka **URUCHOM TEST**: wybierasz bota (radio cards), preset długości (QUICK/NORMAL/DEEP/CUSTOM), seed, izolację — klikasz ▶ URUCHOM TEST → live streaming logów w panelu.
- 📊 Zakładka **RAPORTY**: lista wszystkich runów (sortowane po dacie), klik → pełny raport wizualny: stat boxes, bar charts dystrybucji akcji + flag, unique crashes ze stack traces, tabela gier (klik na grę → modal z metrykami w czasie, błędy, final state).
- 🔄 Zakładka **AKTYWNE RUNY**: co zostało uruchomione w tej sesji.

Podgląd komendy CLI aktualizuje się live — klikasz myszką, widzisz co zostałoby wywołane. UI używa tej samej komendy `run.js` pod maską, więc wyniki są identyczne.

---

## Szybki start

```bash
# Uruchom 100 gier × 300 civYears z RandomBot (szybki smoke test, ~10s)
node src/testing/runner/run.js --mode=quick --bot=random

# Pełny QA run z RuleBot (500 gier × 800 civYears, ~2 min)
node src/testing/runner/run.js --mode=normal --bot=rule

# Deep endgame stability (100 gier × 3000 civYears, ~5 min)
node src/testing/runner/run.js --mode=deep --bot=mcts

# EvoBot z wytrenowanymi wagami
node src/testing/runner/run.js --bot=evo --evo-weights=src/testing/reports/evo_weights.json

# Skrypt regresyjny
node src/testing/runner/run.js --bot=scripted --script=src/testing/scripts/example_rush_shipyard.json

# Tryb izolowany (każda gra w osobnym procesie, wolniejsze ale 100% izolacja)
node src/testing/runner/run.js --games=100 --years=500 --isolated --concurrency=4
```

---

## Architektura

```
src/testing/
├── headless/
│   ├── env.js              ← MUST be imported first. Mocki window/document/localStorage/THREE + seeded Math.random
│   ├── GameCore.js         ← Boot gry headless (scenariusz "Nowa Gra") bez renderowania/UI
│   ├── Ticker.js           ← Ręczna pętla time:tick
│   └── Snapshot.js         ← Migawka state (diff/equals)
├── actions/
│   ├── ActionAdapter.js    ← {type, ...} → EventBus.emit
│   └── ActionCatalog.js    ← Enumeracja legalnych akcji
├── bots/
│   ├── BaseBot.js          ← Abstract class + buildObservation helper
│   ├── RandomBot.js        ← Crash hunter (weighted random)
│   ├── RuleBot.js          ← Priority-based rules, balanced play
│   ├── MCTSBot.js          ← Simplified MCTS (heuristic-weighted sampling)
│   ├── EvoBot.js           ← RuleBot z evolvable weights
│   └── ScriptedBot.js      ← Odtwarza sekwencję z JSON (regression tests)
├── analytics/
│   ├── Metrics.js          ← Time-series storage
│   ├── BottleneckDetector.js  ← Flagi: POP_STAGNATION, TECH_IRRELEVANCE, STALEMATE...
│   └── Reporter.js         ← GameReport + Reporter (JSON + Markdown)
├── runner/
│   ├── run.js              ← Główne CLI (in-process + fork modes)
│   ├── worker.js           ← 1 gra = 1 proces (używany w --isolated)
│   ├── SingleGame.js       ← Jedna pełna gra (bot vs environment)
│   └── Tournament.js       ← EvoBot tournament (selekcja + mutacja)
├── scripts/                ← Hand-designed ScriptedBot scripts (JSON)
│   ├── example_rush_shipyard.json
│   └── example_stress_demolish.json
├── ui/                     ← 🖥️ Wizualna konsola (HTML + Node server, zero npm deps)
│   ├── server.js           ← Lokalny HTTP server (port 4455)
│   ├── index.html
│   ├── style.css
│   └── app.js
└── reports/                ← Output: run-*.json + run-*.md + evo_weights.json
```

---

## Boty

| Bot | Cel | Jak działa |
|-----|-----|------------|
| **RandomBot** | Crash hunt (fuzz) | Losowe akcje ważone kategoriami (30% build, 25% tech, ...). 5% "chaos" |
| **RuleBot** | Czytelna kompetencja | Priority rules: R1 food → R2 water → R3 energy → ... R14 factory. Używa personality vectors |
| **MCTSBot** | Inne strategie niż RuleBot | Samples K=30 akcji, ocenia heurystyczną funkcją + UCB1 exploration term |
| **EvoBot** | Najlepsza AI (trenowana) | RuleBot z 12 evolvable weights. Tournament ewoluuje wagi |
| **ScriptedBot** | Regression + stress | Odtwarza sekwencję akcji z JSON. Fallback: idle / random / rule |

### Trenowanie EvoBot

```bash
# Uruchamia Tournament z małym pokoleniem (demo)
node src/testing/headless/test-evo-bot.js
# Zapisuje src/testing/reports/evo_weights.json
```

---

## Flagi CLI (runner/run.js)

| Flaga | Opis | Default |
|-------|------|---------|
| `--mode=quick\|normal\|deep` | Preset długości | `normal` |
| `--games=N` | Liczba gier (override) | 500 |
| `--years=N` | Liczba civYears (override) | 800 |
| `--bot=random\|rule\|mcts\|evo\|scripted` | Typ bota | `random` |
| `--script=path` | Dla `--bot=scripted` | — |
| `--evo-weights=path` | Dla `--bot=evo`, załaduj JSON | — |
| `--seed=prefix` | Seed PRNG (seed_1, seed_2, ...) | `kosmos-<ts>` |
| `--isolated` | Fork per gra (bezpieczniejsze) | off |
| `--concurrency=N` | Parallel workers w `--isolated` | 1 |
| `--quiet` | Mniej logów | off |
| `--out=path` | Folder raportów | `src/testing/reports` |

---

## Detektory bottleneck

Wywalane przez `BottleneckDetector.js` co 1 civYear:

| Flaga | Kryterium |
|-------|-----------|
| `POP_STAGNATION` | POP nie zmieniła się przez 50 civYears |
| `RESOURCE_STALL` | Inventory Fe stały >100 civYears |
| `TECH_IRRELEVANCE` | Brak nowej technologii przez 100 civYears |
| `FLEET_UNUSED` | Rocketry zbadane, 0 statków przez 100+ civYears |
| `DIPLOMACY_DEAD` | Max hostility = 0 przez >200 civYears |
| `RUNAWAY_LEADER` | 1 imperium > 2× suma innych |
| `EVENT_CASCADE` | >4 random events jednocześnie aktywne |
| `STALEMATE` | Żadne key metrics nie zmieniły się przez 250 civYears |
| `COLONY_LOCK` | Ekspedycje wiszą >50 civYears w transit |

---

## Format raportu

**run-YYYYMMDD.json** — pełen wynik:
```json
{
  "runName": "kosmos-qa-normal-rule",
  "aggregate": {
    "games": 500, "crashed": 3, "crashRate": "0.6%",
    "avgYears": 798, "avgMs": 180, "totalErrors": 5,
    "actionTotals": { "build": 42000, "research": 8000, ... },
    "flagHistogram": { "POP_STAGNATION": 342, ... },
    "uniqueCrashes": [{"message": "...", "count": 2, "lastAction": {...}}]
  },
  "games": [ { "id": "game_1", "outcome": "finished", "errors": [...], ... } ]
}
```

**run-YYYYMMDD.md** — human-readable summary (to samo co `toSummary()`).

---

## Format ScriptedBot JSON

```json
{
  "name": "rush_shipyard",
  "description": "Test sekwencji: research → build → ship",
  "fallback": "rule",
  "actions": [
    { "atCivYear": 1, "action": { "type": "research", "techId": "metallurgy" } },
    { "atCivYear": 10, "action": { "type": "build", "buildingId": "launch_pad" } },
    { "atCivYear": 15, "action": { "type": "build", "buildingId": "shipyard", "tileQ": 5, "tileR": 3 } },
    { "atCivYear": 40, "action": { "type": "buildShip", "shipId": "science_vessel" } }
  ]
}
```

`action.type` ∈ `build, upgrade, demolish, research, expedition, buildShip, factoryEnqueue, wait`
Jeśli `tileQ`/`tileR` brak dla build/upgrade — automatycznie wybiera pierwszy legalny tile.

---

## Wydajność

| Konfiguracja | Czas na grę | Throughput |
|---|---|---|
| In-process, RandomBot, 200y | ~60 ms | ~16 gier/s |
| In-process, RuleBot, 300y | ~160 ms | ~6 gier/s |
| Isolated (3 workers), 200y | ~130 ms | ~7 gier/s |

**Preset timings (oczekiwane):**
- `--mode=quick` (100g × 300y × rule): ~16s
- `--mode=normal` (500g × 800y × rule): ~2-3 min
- `--mode=deep` (100g × 3000y × mcts): ~5-10 min

---

## Podstawowe cele testowania

1. **Find crashes** — RandomBot/MCTSBot wykryje exceptions i sekwencje wywołujące game:over
2. **Find balance issues** — EvoBot + scoreboard między botami pokazuje degenerate strategies
3. **Find mechanic interactions** — bottleneck detectors (POP_STAGNATION, RESOURCE_STALL, STALEMATE) ujawniają dead paths
4. **Long-game stability** — `--mode=deep` × 3000 civYears sprawdzi overflow / unbounded values
5. **Regression tests** — ScriptedBot odtwarza konkretne buggy sequences (JSON w `src/testing/scripts/`)

---

## Dodawanie nowego bota

1. Utwórz `src/testing/bots/MyBot.js`:
```js
import { BaseBot } from './BaseBot.js';
export class MyBot extends BaseBot {
  constructor(opts) { super({ name: 'MyBot' }); }
  decideAction(observation, catalog) {
    // ... twoja logika
    return { type: 'build', buildingId: 'mine', tile: ... };
  }
}
```

2. Zarejestruj w `runner/run.js:createLocalBot()` i `runner/worker.js:createBot()`.

3. Uruchom: `node src/testing/runner/run.js --bot=mybot`

---

## Dodawanie nowego detektora bottleneck

W `analytics/BottleneckDetector.js` dodaj do `createStandardDetectors()`:
```js
{
  name: 'MY_FLAG',
  check(core, civYear, report) {
    // Zwróć 'MY_FLAG' gdy wykryto problem, inaczej null
  },
}
```

---

## Zero-modyfikacji guarantee

Żaden plik w `src/core/`, `src/systems/`, `src/ui/`, `src/scenes/`, `src/renderer/`, `src/data/`, `src/generators/`, `src/entities/`, `src/utils/` **nie został zmodyfikowany**. Wszystkie runtime overrides są w `headless/env.js` (mocki globalThis). Gra w przeglądarce ignoruje ten folder.

Jedyny dodatek poza `src/testing/`: `src/package.json` (3 linijki) — informuje Node.js że pliki pod `src/` są ESM. Browser ignoruje ten plik.
