# Slice 1 — Patch v5: Lazy-cache getter dla `_resourceSnap` (plan zaakceptowany)

**Status:** plan zaakceptowany, do implementacji w następnej sesji.
**Decyzja użytkownika:** Opcja C+ (lazy cache getter), zakres scan'u potwierdza decyzję bez modyfikacji.

---

## 1. Root cause (już potwierdzone diagnozą)

`CivilizationSystem._resourceSnap` nigdy nie jest aktualizowany dla kolonii AI:

- **`CivilizationSystem.js:149`** — handler `resource:changed` (jedyny writer `_resourceSnap`) ma guard `if (window.KOSMOS?.civSystem !== this) return;`
- **`ResourceSystem.js:466` i `:508`** — emit `resource:changed` gated na `isActive = (window.KOSMOS?.resourceSystem === this)`.

Konsekwencja: AI ResourceSystem nie emituje → AI CivSystem `_resourceSnap = {}` na zawsze → `_resourceRatio('food')=0` → spirala śmierci (`_starvationYears++`, `labSat→27.5`, brownout cascade).

---

## 2. Wynik scan'u — gdzie naprawiać

| System | Pattern | Werdykt |
|---|---|---|
| `CivilizationSystem._resourceSnap` | Cache event-driven, blocked by guard. 8 użyć (L728/776/778/842/903/976/989/993/1013/1408/1562), 1 writer (L150), 1 init (L118). | **NAPRAWA v5**. |
| `ProsperitySystem._consumerDemand/Production` | Wyliczane lokalnie w `_yearlyUpdate`. Nie event-driven. | Bez bugu. |
| `ProsperitySystem._lastRegisteredDemand/Prod` | Guard anty-rerejestracji (JSON-key compare). | Bez bugu. |
| `ProsperitySystem._syncConsumption` (L549) | Guard `prosperitySystem !== this` — AI nie rejestruje konsumpcji **consumer goods**. | Drugi bug, ALE survival (food/water/energy) czytany bezpośrednio z `this.resourceSystem.inventory.get()` (L385/394/302). Nie zabija laborer w 60s. **Out-of-scope v5**, notować dla Slice 1 polish. |
| `BuildingSystem._cachedMineLevel` (L1688) | Lokalna optymalizacja w `_tickMining`. | Bez bugu. |
| `FactorySystem` | Brak `_xxxSnap` patternu. Same `factory:*` handlery z guardem. | Bez bugu dla survival/economy basics. |
| `ResourceSystem` | Brak własnych cache pól event-driven. | Bez bugu. |

**Jedyna instancja klasy bugu = `CivilizationSystem._resourceSnap`**.

---

## 3. Risk assessment dla emit kontraktu

**NIE wolno zdejmować guarda z emit** w `ResourceSystem` (L466/508).

Powód: 4 listenery `resource:changed`:
- `UIManager.js:530` `_applyResources` — UI gracza (inventory/energyFlow/brownout). L492 komentarz: *"emituje tylko aktywna"*.
- `ResourcePanel.js:46` — Phaser HUD gracza.
- `PlanetScene.js:362` — legacy, ale podpięte.
- `CivilizationSystem.js:148` — *jedyne miejsce z bugiem*.

3 z 4 listenerów (UI) wymagają guarda emit. Zdjęcie → regresja UI gracza (pokazywałby dane AI).

Dlatego Opcja B (zdjęcie guardów + `colonyId` w payload) gorsza — wymaga refaktoringu 3 UI listenerów. **Opcja C+ omija** problem — naprawia tylko CivSystem, UI nietknięte.

---

## 4. Gotcha: `food` vs `organics` w snapshot()

`ResourceSystem.snapshot()` zwraca pole **`organics`** (legacy proxy w `_syncLegacyProxy`), nie `food`. Inventory ma klucz `food` (HARVESTED_RESOURCES). CivSystem dziś używa fallback `_resourceRatio('food') || _resourceRatio('organics')`.

Test acceptance prompta wymaga `aiCol.civSystem._resourceSnap?.food !== undefined` — czyli getter musi dorzucić `food` jako alias do `organics`.

**Decyzja**: alias w getterze (lokalna naprawa), bez modyfikacji `ResourceSystem.snapshot()` (mniejszy blast radius).

---

## 5. Mechanizm invalidacji (perf wymóg)

`_yearlyUpdate` woła `_resourceRatio` 30-40× per civYear:
- L728: foodRatio (1×)
- L976: per strata = 8× (food/organics)
- L989: per strata = 16× (food + water)

Bez cache: ~30 × 15 ops snapshot = ~450 ops/yearly tick (sub-ms, OK).
Z lazy cache: 1 snapshot per yearly. Marginalnie lepiej, ale prompt prosi.

**Strategia invalidacji** — dual mechanism:
1. **W `_update` przed pętlą yearly**: `this._snapCache = null;` na początku każdej iteracji.
2. **Handler `resource:changed` (gracza)**: zmienić body z `this._resourceSnap = resources;` na `this._snapCache = null;`. Guard zachować (AI ten event nie odbiera i tak — emit guarded; gracza handler precyzyjnie refreshuje cache między yearly ticks np. po `spend`/`receive`).

`ResourceSystem` **nie zna** `colonyId` (sprawdzone w konstruktorze) — propozycja z prompta o dodaniu `colonyId` do payloadu byłaby invazyjna. Bezpośredni `this.resourceSystem.snapshot()` z CivSystem omija problem (CivSystem ma referencję `civSys.resourceSystem` od `ColonyManager.js:360`).

---

## 6. Konkretne zmiany — 1 plik, ~20 linii

### `src/systems/CivilizationSystem.js`

**Zmiana 1 — konstruktor (L118)**:
```js
// BYŁO:
this._resourceSnap = {};

// MA BYĆ:
this._snapCache = null;
```

**Zmiana 2 — dodaj getter** (lokalizacja: po `_setupListeners` lub po block listenerów konstruktora, przed `addHousing` ok. L193):
```js
/**
 * Lazy snapshot surowców tej kolonii.
 * Cache invalidowany w `_update` przed każdą yearly iteracją + przez
 * handler resource:changed dla aktywnej kolonii gracza.
 *
 * Patch v5 (Slice 1): zastępuje pole `_resourceSnap` które było aktualizowane
 * przez `resource:changed` event handler — guard `isActive` blokował emit
 * dla kolonii AI, więc snapshot zostawał pusty i `_resourceRatio` zwracał 0
 * mimo że inventory rosło poprawnie (root cause spirali śmierci AI).
 */
get _resourceSnap() {
  if (!this._snapCache) {
    const snap = this.resourceSystem?.snapshot?.() ?? {};
    // Alias: snapshot() zwraca legacy 'organics' (z _syncLegacyProxy); kod
    // używa fallback _resourceRatio('food') || _resourceRatio('organics').
    // Dorzucamy 'food' jako alias żeby _resourceSnap.food !== undefined.
    if (snap.organics && !snap.food) {
      snap.food = snap.organics;
    }
    this._snapCache = snap;
  }
  return this._snapCache;
}
```

**Zmiana 3 — handler `resource:changed` (L148-151)** — zmień body na invalidate:
```js
// BYŁO:
EventBus.on('resource:changed', ({ resources }) => {
  if (window.KOSMOS?.civSystem !== this) return;
  this._resourceSnap = resources;
});

// MA BYĆ:
EventBus.on('resource:changed', () => {
  if (window.KOSMOS?.civSystem !== this) return;
  this._snapCache = null;  // invalidate — getter odczyta świeży snapshot
});
```

**Zmiana 4 — pętla yearly w `_update` (L719)** — invalidate cache:
```js
// BYŁO:
for (let y = 0; y < years; y++) this._yearlyUpdate();

// MA BYĆ:
for (let y = 0; y < years; y++) {
  this._snapCache = null;  // świeży snapshot per yearly iteration
  this._yearlyUpdate();
}
```

### Pliki **nie ruszane**

- `src/systems/ResourceSystem.js` — guardy emit (L466/508) zostają (chronią UI gracza).
- `src/systems/EmpireColonyMaintenance.js` — zostaje, dalej potrzebny dla `_reapplyAllRates` (separate bug w BuildingSystem `civ:popBorn` guard L119-126). Decyzja o usunięciu — po teście, po Fazie 2 (ColonyAutoPlanner).
- `src/systems/ProsperitySystem.js` — bug consumer goods consumption out-of-scope dla v5.
- Inne systemy — bez zmian.

---

## 7. Risk assessment (lista kontrolna)

| Ryzyko | Ocena | Mitigacja |
|---|---|---|
| Gracz traci precision (snapshot per yearly zamiast per dzień) | Niskie. `_resourceRatio` używane głównie w `_yearlyUpdate` (też yearly). | Handler `resource:changed` nadal invaliduje cache między yearly. |
| Inny system pisze do `_resourceSnap.X = ...` | Sprawdzone gerypem — brak. | — |
| `this.resourceSystem` może być `null` (restore window) | Defensive. | Getter ma `?.` chain + fallback `?? {}`. |
| Snapshot perf | ~15 ops × 1 per yearly z cache. Pomijalne. | — |
| Test acceptance fail na `snapFood undefined` | Adresowane. | Alias `food = organics` w getter. |
| `_resourceSnap` w serialize/restore | Sprawdzone (L635-650 serialize, L688 restore) — pole NIE serializowane. | Brak działań — `_snapCache` regeneruje się przy pierwszym dostępie. |
| `EmpireColonyMaintenance` redundantny | Otwarte. | Maintenance forsuje `_reapplyAllRates` w BuildingSystem (separate bug `civ:popBorn` guard). Zostawiamy do Fazy 2. |

---

## 8. Test acceptance (z prompt patcha v5)

### Setup
```js
const aiCol = window.KOSMOS.colonyManager.getAllColonies().find(c => c.ownerEmpireId !== null);
window.KOSMOS._tracker = [];
const intId = setInterval(() => {
  const lab = aiCol.civSystem.strata.laborer;
  window.KOSMOS._tracker.push({
    realTime: Date.now(),
    laborer: lab.count,
    labSat: lab.satisfaction?.toFixed(1),
    starveYrs: aiCol.civSystem._starvationYears,
    snapFood: aiCol.civSystem._resourceSnap?.food,  // ← MUSI != undefined
    energyBal: aiCol.resourceSystem.energy.balance?.toFixed(1),
    brownout: aiCol.resourceSystem.energy.brownout,
  });
}, 250);
window.KOSMOS._intId = intId;

// Speed 5x, czekaj 60s
clearInterval(window.KOSMOS._intId);
console.table(window.KOSMOS._tracker);
```

### Hard wymagania (AI)
- `laborer` rośnie lub stabilny ≥3 przez całe 60s (NIE spada do 0)
- `labSat` stabilny ≥50 (NIE spada do 27.5)
- `starveYrs` pozostaje 0 (NIE rośnie powyżej 0)
- `snapFood` jest **liczbą / obiektem** (NIE undefined) — weryfikuje że getter działa
- `energyBal` dodatni (NIE -32)
- `brownout` false

### Sanity check (gracz nie zepsuty)
```js
const playerCol = window.KOSMOS.colonyManager.getAllColonies().find(c => !c.ownerEmpireId);
console.log('Player laborer:', playerCol.civSystem.strata.laborer);
console.log('Player snap food:', playerCol.civSystem._resourceSnap?.food);
console.log('Player prosperity:', playerCol.prosperitySystem.prosperity);
```

Hard wymagania: gracz nadal prosperuje (laborer rośnie, sat ~100, prosperity ~50+).

---

## 9. Co NIE robić (z prompt patcha v5)

- NIE modyfikuj `EmpireColonyBootstrap.js` (działa poprawnie)
- NIE modyfikuj `EmpireColonyMaintenance.js` (zostaje do decyzji po teście)
- NIE modyfikuj archetypu Industrialist
- NIE pisz testów unitowych
- NIE commituj (user commituje po teście)

---

## 10. Implementacja w następnej sesji — checklist

1. Otwórz `src/systems/CivilizationSystem.js`.
2. **L118**: `this._resourceSnap = {};` → `this._snapCache = null;`
3. Po block listenerów konstruktora (ok. L193, przed `addHousing`): dodaj getter `_resourceSnap` (kod w sekcji 6 Zmiana 2).
4. **L148-151**: handler `resource:changed` — zmień body na `this._snapCache = null;` (kod w sekcji 6 Zmiana 3).
5. **L719**: w pętli yearly dodaj `this._snapCache = null;` przed `_yearlyUpdate()` (kod w sekcji 6 Zmiana 4).
6. Uruchom test acceptance (sekcja 8).
7. Raportuj wynik, czekaj na decyzję o:
   - usunięciu `EmpireColonyMaintenance.js` (jeśli test pokazuje że niepotrzebny)
   - kontynuacji do Fazy 2 (`EmpireStrategicAI` + `EmpireStockpilePolicy` + `ColonyAutoPlanner`)
