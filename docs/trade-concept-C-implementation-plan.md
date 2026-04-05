# PLAN IMPLEMENTACJI: Cywilna Ekonomia — Koncepcja C

> Status: GOTOWY DO IMPLEMENTACJI
> Data: 2026-03-19
> Dokument koncepcyjny: `docs/trade-concept-C-hybrid.md`

---

## CO IMPLEMENTUJEMY

**Koncepcja C: Prosperity Gradients + Kredyty Strategiczne**

Emergentna gospodarka cywilna w której:
- Towary płyną automatycznie z nadwyżki do niedoboru (gradient prosperity)
- Każda transakcja generuje Kredyty (Kr) — namacalna waluta inwestycji
- Kredyty wydawane strategicznie (Rush Build, TC Boost, Misja Dobrobytu) — BRAK maintenance
- Wszystkie commodities T1–T3 uczestniczą w handlu (nie tylko survival goods)
- Trade Capacity mierzona w jednostkach wartości Kr (nie fizycznych jednostkach)

---

## NOWE PLIKI DO STWORZENIA

### 1. `src/data/TradeValuesData.js`

Bazowe ceny towarów (BASE_PRICE) używane do:
- Obliczania TC cost per transfer (`unitsTransferred × BASE_PRICE[good]`)
- Obliczania Kredytów z transakcji
- Wyświetlania dynamicznych cen w UI

```javascript
// BASE_PRICE per zasób i commodity
export const BASE_PRICE = {
  // Surowce podstawowe
  Fe: 1, Si: 1, C: 1,
  // Surowce cenne
  Cu: 2, Ti: 3,
  // Surowce rzadkie
  Li: 4, W: 6,
  // Surowce egzotyczne
  Pt: 8, Xe: 10,
  // Żywność / woda
  food: 2, water: 2,
  // Commodities T1
  steel_plates: 5, concrete_mix: 5, copper_wiring: 5, /* ... */
  // Commodities T2
  electronics: 12, power_cells: 12, /* ... */
  // Commodities T3
  quantum_processors: 50, exotic_alloy: 45, rare_earth: 40, /* ... */
  // Consumer goods (functioning)
  spare_parts: 8, pharma: 8,
  // Consumer goods (comfort)
  synthetics: 15, personal_electronics: 15,
  // Consumer goods (luxury)
  gourmet_food: 30, semiconductors: 30,
};

// scarcityMultiplier(stock, consumption):
//   >10 lat zapasu: ×0.2 | 5-10 lat: ×0.5 | 2-5 lat: ×1.0 | 0.5-2 lat: ×2.0 | <0.5 lat: ×5.0
```

### 2. `src/systems/CivilianTradeSystem.js`

Rdzeń systemu — tick roczny.

**API:**
```javascript
class CivilianTradeSystem {
  constructor(colonyManager, eventBus) { ... }

  // Wywoływane co rok (civDeltaYears)
  tick(civDeltaYears) {
    this._calcAllConnections();   // gradient per para kolonii
    this._allocateTC();           // TC_pool → połączenia proporcjonalnie
    this._routeGoods();           // auto-routing surplusów/deficytów
    this._generateCredits();      // Kr z transakcji
    this._applyUpkeep();          // trade upkeep na prosperity
  }

  // Per kolonia
  _calcTCPool(colony)             // 200×pop + buildingBonus + prosperityBonus
  _calcGradient(colA, colB)       // |prosA - prosB| / 100
  _routingPriority(goodId)        // T3=4, functioning=3, T2=2, raw=2, T1=1, luxury=0
  _surplusScore(goodId, colony)   // stock / (consumption × 10) — >1.5 = eksportuj
  _deficitScore(goodId, colony)   // 1 / max(0.1, stock / consumption) — >1.0 = importuj
}
```

**Kluczowe formuły:**
```
TC_pool = 200 × pop + floor(prosperity/20)×50 + buildingBonus  // Kr-wartości/rok
koszt transferu = unitsTransferred × BASE_PRICE[good]           // Kr z TC_pool
gradient(A↔B) = |prosperityA - prosperityB| / 100
connectionPriority = gradient × 0.9 + 0.1

exporter_Kr += unitsTraded × localPrice_BUYER × 0.06
importer_Kr += unitsTraded × localPrice_BUYER × 0.03
localPrice = BASE_PRICE[good] × scarcityMultiplier(stock, consumption)
```

**Routing zasady:**
- Transfer zachodzi gdy: `surplusScore > 1.5 AND deficitScore > 1.0 AND TC dostępne AND zasięg OK`
- Max transfer = `min(TC_available_valueUnits / BASE_PRICE[good], surplusA × 0.3)`
- Priorytety: food/water > T3 commodities > functioning goods > T2 > raw > T1 > luxury

**Trade overrides (per kolonia):**
- `'block'` — nigdy nie eksportuj tego towaru
- `'priority'` — zarezerwuj 50% TC na import tego towaru
- `'isolation'` — kolonia nie uczestniczy w sieci

---

## MODYFIKACJE ISTNIEJĄCYCH PLIKÓW

### `src/systems/ColonyManager.js`

Nowe pola per-kolonia (w `_createColonyData()` lub ekwiwalencie):
```javascript
colony.credits = 0;                      // Kr akumulowane
colony.creditsPerYear = 0;               // roczny bilans (do UI)
colony.tradeCapacity = 0;                // obliczane przez CivilianTradeSystem
colony.activeTradeConnections = [];      // [{ colonyId, goodsIn: [{goodId, qty}], goodsOut: [...], volumeKr }]
colony.tradeOverrides = {};              // { goodId: 'block'|'priority'|'isolation' }
```

### `src/systems/ProsperitySystem.js`

W metodzie `_yearlyUpdate()` lub `_calcTargetProsperity()`, dodać do `prosperityFloor`:
```javascript
// Bonus za aktywną sieć handlową
const tradeNetworkBonus = Math.min(15, colony.activeTradeConnections.length × 3);

// Koszt utrzymania sieci (distanceFactor: <5AU=1.0, 5-15AU=1.5, >15AU=2.0)
const tradeNetworkUpkeep = colony.activeTradeConnections.reduce((sum, conn) => {
  const dist = DistanceUtils.orbitalAU(colony, getColony(conn.colonyId));
  const df = dist < 5 ? 1.0 : dist < 15 ? 1.5 : 2.0;
  return sum + 2 × df;
}, 0);

prosperityFloor = 50 + techBonus + discoveryBonus + tradeNetworkBonus - tradeNetworkUpkeep;
```

### `src/data/BuildingsData.js`

4 nowe budynki kategorii `'market'`:

```javascript
{
  id: 'trade_hub',
  namePL: 'Węzeł Handlowy', nameEN: 'Trade Hub',
  tier: 1,
  category: 'market',
  tcBonus: 200,            // +200 Kr/yr do TC_pool (multiplicative ×2 na bazowe)
  tradeRangeBonus: 5,      // +5 AU zasięgu
  unlockAllGoods: true,    // odblokuj wszystkie typy towarów w routingu
  cost: { Fe: 40, C: 20, Cu: 5 },
  buildTime: 1.0,
},
{
  id: 'free_market',
  namePL: 'Wolny Rynek', nameEN: 'Free Market',
  tier: 1,
  category: 'market',
  routingEfficiencyBonus: 0.30,   // +30% — mądrzejszy routing (wyższy próg transfer)
  tradeUpkeepMultiplier: 0.80,    // trade upkeep ×0.8 (−20%)
  unlockConsumerGoods: true,
  cost: { Fe: 30, C: 15, concrete_mix: 2 },
  buildTime: 0.75,
},
{
  id: 'trade_beacon',
  namePL: 'Latarnia Handlowa', nameEN: 'Trade Beacon',
  tier: 2,
  category: 'market',
  tradeRangeMultiplier: 1.5,     // zasięg ×1.5
  showEmpireData: true,          // UI: widoczność cen i surplusów wszystkich kolonii
  cost: { Ti: 10, electronics: 3, copper_wiring: 4 },
  requires: 'interplanetary_logistics',
  buildTime: 2.0,
},
{
  id: 'commodity_nexus',
  namePL: 'Centrum Komodalne', nameEN: 'Commodity Nexus',
  tier: 3,
  category: 'market',
  empireWideMatching: true,       // eliminuje limit zasięgu (empire-wide routing)
  creditBonusLongDistance: 0.30,  // +30% Kr z transakcji >15 AU
  cost: { quantum_processors: 2, exotic_alloy: 1 },
  requires: 'advanced_trade',     // nowy tech do dodania
  buildTime: 4.0,
},
```

### `src/systems/SaveMigration.js`

Bump `CURRENT_VERSION` (np. v21 → v22), dodaj migrację:
```javascript
_migrateV21toV22(data) {
  if (data.c4x?.colonies) {
    data.c4x.colonies.forEach(c => {
      c.credits ??= 0;
      c.creditsPerYear ??= 0;
      c.tradeCapacity ??= 0;
      c.activeTradeConnections ??= [];
      c.tradeOverrides ??= {};
    });
  }
  return data;
}
```

### `src/scenes/PlanetGlobeScene.js`

Nowa zakładka "Handel" (6. zakładka lub jako sekcja w istniejącym panelu):

```
EKONOMIA KOLONII — [nazwa]
━━━━━━━━━━━━━━━━━━━━━━━━━━
Kredyty: 247 Kr  (+18/rok)
Trade Capacity: 1300 Kr/rok  [████████░░] 65%

AKTYWNE POŁĄCZENIA:
↔ Macierzysta   [4.2 AU]  food→ 30j | ←Fe 45j    +12 Kr/rok
↔ Księżyc Ymir  [1.1 AU]  water→15j | ←C 20j     +5 Kr/rok

CENY LOKALNE:
🔴 Drogo: food ×4.5  water ×3.2  Cu ×2.1
🟢 Tanio: Fe ×0.2   Ti ×0.3   C ×0.4

BLOKADY: [+ Dodaj]  [food: BLOK ✕]

WYDAJ KREDYTY:
[🏗 Rush Build: 80 Kr → budowa −50%]
[📦 Zakup Awaryjny: 90 Kr → 20j food]
[📡 TC Boost: 100 Kr → +50% TC/10 lat]
```

### `src/scenes/UIManager.js`

Mały wskaźnik w istniejącym CivPanel:
```
💰 247 Kr  (+18/rok)   [2 połączenia]
```
Widoczny tylko dla aktywnej kolonii (nie globalny HUD).

### `src/renderer/ThreeRenderer.js`

Kosmetyczne elementy (opcjonalne, implementować ostatnie):
- Linie połączeń między koloniami handlującymi (kolor = intensywność gradientu)
- Małe statki cywilne poruszające się po liniach (inna tekstura niż wojskowe)
- Liczba statków wizualnych = min(3, activeConnections.length)

---

## INTEGRACJA Z ISTNIEJĄCYMI SYSTEMAMI

### EventBus — nowe zdarzenia

```javascript
// CivilianTradeSystem → UI
'trade:transactionCompleted'  { fromColonyId, toColonyId, goodId, qty, creditsEarned }
'trade:connectionsUpdated'    { colonyId, connections }
'trade:creditsChanged'        { colonyId, credits, delta }

// UI → CivilianTradeSystem
'trade:setOverride'    { colonyId, goodId, override }  // 'block'|'priority'|null
'trade:spendCredits'   { colonyId, action, params }     // 'rush_build'|'tc_boost'|'emergency_buy'|...
```

### Wzorzec subskrypcji (jak inne systemy)
```javascript
// W GameScene.js — po inicjalizacji CivilianTradeSystem:
EventBus.on('trade:spendCredits', ({ colonyId, action, params }) => {
  civilianTradeSystem.spendCredits(colonyId, action, params);
});
```

### TradeRouteManager (istniejący) — bez zmian
Oba systemy działają równolegle:
- TradeRouteManager = precyzyjna logistyka (gracz kontroluje konkretny ładunek)
- CivilianTradeSystem = bulk automatyczny (gradient/TC)

---

## KOLEJNOŚĆ IMPLEMENTACJI (rekomendowana)

1. **`TradeValuesData.js`** — czyste dane, bez zależności, łatwy start
2. **`CivilianTradeSystem.js`** — rdzeń, wymaga ColonyManager i EventBus
3. **Modyfikacja `ColonyManager.js`** — nowe pola, serialize/restore
4. **Modyfikacja `ProsperitySystem.js`** — odczytuje `activeTradeConnections` z kolonii
5. **`BuildingsData.js`** — 4 nowe budynki (trade_hub, free_market, trade_beacon, commodity_nexus)
6. **`SaveMigration.js`** — bump version + defaults
7. **UI: PlanetGlobeScene** — zakładka Handel
8. **UI: UIManager** — wskaźnik Kr w CivPanel
9. **`ThreeRenderer`** — kosmetyczne linie + statki (opcjonalne)

---

## WERYFIKACJA (test end-to-end)

1. Stwórz 2 kolonie: A (prosperity 80, dużo food) ↔ B (prosperity 35, dużo Fe)
2. Odczekaj 1 rok w grze → food powinno płynąć A→B, Fe B→A
3. Sprawdź `colony.creditsPerYear > 0` dla obu kolonii
4. Odczekaj 20 lat → prosperity B powinno rosnąć (~55–65), gradient słabnąć
5. Sprawdź trade upkeep w ProsperitySystem (targetProsperity A powinno być nieco niższe)
6. Przetestuj T3: zrób nadwyżkę `quantum_processors` w A → sprawdź duży Kr zysk w B
7. Test TC: przy pop=6, TC_pool = 1200 Kr/rok; 50 units Fe = 50 Kr z TC → zostaje 1150
8. Test Rush Build: wydaj 80 Kr → sprawdź `buildTime × 0.5` dla budowanego budynku
9. Test TC Boost: wydaj 100 Kr → TC_pool +50% przez 10 lat
10. Save → Load → sprawdź: credits, connections, overrides zachowane poprawnie

---

## UWAGI IMPLEMENTACYJNE

- **Tick frequency**: CivilianTradeSystem tick = raz na rok (civDeltaYears >= 1)
- **Zasięg bazowy**: 10 AU (bez budynków); trade_hub +5 AU; trade_beacon ×1.5
- **Max transfer rocznie**: 30% nadwyżki kolonii (handel nie opróżnia magazynów)
- **Colony pair matching**: O(n²) dla n kolonii — przy n<=20 akceptowalne, przy n>50 rozważyć cache
- **Kredyty nie są zasobem**: NIE dodawać do ResourceSystem.inventory; osobny akumulator w ColonyManager
- **Brak creditMaintenance**: budynki handlowe NIE pobierają Kredytów za utrzymanie (decyzja projektowa)
- **Consumer goods routing**: odblokowane przez `free_market` lub `trade_hub` z `unlockAllGoods`

---

*Koncepcja zatwierdzona przez gracza 2026-03-19. Implementacja w oddzielnej sesji.*
