# KONCEPCJA C: "PROSPERITY GRADIENTS + KREDYTY STRATEGICZNE"
# Hybryda: Naturalne przepływy + Namacalna waluta inwestycji

> Dokument roboczy. Data: 2026-03-19.
> Powiązane: trade-concept-A-credits.md, trade-concept-B-gradients.md

---

## Rdzeń koncepcji

**Koncepcja C łączy najsilniejsze elementy A i B, eliminując ich słabości.**

Handel odbywa się **naturalnie i automatycznie** — towary płyną z nadwyżki do niedoboru
przez system gradientów prosperity (jak w B). Jednocześnie każda udana transakcja
**nagradza** grację namacalną walutą — **Kredytami** — które można wydać na
strategiczne wybory (jak w A).

**Kluczowa różnica od A**: Kredyty to NAGRODA za handel, nie OBOWIĄZEK.
Nie płacisz nimi maintenance budynków. Nie musisz ich mieć żeby gra działała.
Mając je — możesz robić rzeczy których inaczej nie możesz.

**Kluczowa różnica od B**: Masz MIERZALNY indicator sukcesu ekonomicznego.
Nie tylko "dobra przepływają" — ale "zarobiłem 450 Kredytów w tym roku." Widoczny postęp.

```
TRANSPORT: Gradienty prosperity → towary płyną automatycznie (jak B)
CENY:      Dynamiczne per-kolonia → TYLKO do obliczania Kredytów i informacji (jak A, ale uproszczone)
KREDYTY:   Nagroda za handel → wydawane strategicznie, nie operacyjnie (nowe)
PĘTLA:     Prosperity → TC → Handel → Kredyty → Inwestycja → Produkcja → Handel
```

---

## CZĘŚĆ 1 — TRANSPORT: GRADIENT PROSPERITY

### 1.1 Gradient jako motor (identyczny z Koncepcją B)

```
gradient(A ↔ B) = |prosperityA - prosperityB| / 100
connectionPriority = gradient × 0.9 + 0.1
// +0.1 = handel bazowy nawet przy równej prosperity (wzajemne nadwyżki zawsze istnieją)
```

Gradient decyduje o **priorytecie połączenia i alokacji Trade Capacity**.
NIE decyduje co płynie — to określa analiza surplus/deficit.

### 1.2 Trade Capacity (pojemność sieci)

**TC mierzone w jednostkach wartości Kr — nie w fizycznych jednostkach towaru.**

```
TC_pool = baseTC + buildingBonus + prosperityBonus   // w Kr-wartości/rok

baseTC = 200 × pop
  // 200 Kr wartości rocznie per POP
  // Przykłady co to oznacza przy pop=1:
  //   Fe (BASE=1 Kr):                 200 units/rok   (bulk, tani surowiec)
  //   food (BASE=2 Kr):               100 units/rok
  //   electronics (BASE=12 Kr):        17 units/rok
  //   quantum_processors (BASE≈50 Kr):  4 units/rok   (rzadki, kosztowny)

Koszt transferu = unitsTransferred × BASE_PRICE[good]
  // Fe: 50 units = 50 Kr z puli TC
  // food: 50 units = 100 Kr z puli TC
  // electronics: 10 units = 120 Kr z puli TC

prosperityBonus = floor(prosperity / 20) × 50  // w Kr-wartości
  // Prosperity 40: +100 Kr/TC  |  Prosperity 80: +200 Kr/TC  |  Prosperity 100: +250 Kr/TC

buildingBonus = Σ(tradeBuildings.tcBonus)  // w Kr-wartości
```

**Efekt ekonomiczny:** Drogi towar "zużywa" więcej TC per jednostkę — naturalny limit
dla rzadkich commodities (T3 mogą handlować mało, ale przynoszą dużo Kredytów).
Tanie bulk surowce (Fe, Si) mogą przepływać setkami jednostek i wypełnić TC szybko.

TC to POOL dzielony między połączenia proporcjonalnie do ich priorytetu.

### 1.3 Co przepływa (auto-routing)

```
Dla towaru X, z kolonii A do kolonii B:
  surplusScore(X, A) = stock(X,A) / (consumption(X,A) × 10)    // >1.5 = eksportuj
  deficitScore(X, B) = 1 / max(0.1, stock(X,B) / consumption(X,B) × 5)  // >1.0 = importuj

Przepływ zachodzi gdy oba spełnione + TC dostępne + zasięg OK
Transfer max = min(TC_dostępne, surplusA × 0.3)
  // Max 30% nadwyżki rocznie — handel nie opróżnia kolonii
```

**Wszystkie towary T1–T3 uczestniczą w auto-routingu.**
Handel obejmuje pełen katalog: surowce, commodities T1 (przemysłowe), T2 (zaawansowane),
T3 (egzotyczne) oraz consumer goods (functioning/comfort/luxury).

**Priorytety routingu** (w jakiej kolejności system przydziela TC):
1. **Survival**: food, water — priorytet krytyczny (głód = kryzys)
2. **Commodities T3** (quantum_processors, exotic_alloy, rare_earth): priorytet wysoki
   — rzadkie, drogie, duży zysk Kr gdy przepływają; niedobór = hamulec dla produkcji high-end
3. **Functioning consumer goods** (spare_parts, pharma): priorytet wysoki
4. **Commodities T2** (electronics, power_cells): priorytet średni
5. **Raw resources** (Fe, Si, Cu, Ti, minerały): priorytet średni
6. **Commodities T1** (steel_plates, concrete_mix): priorytet niski (produkowane lokalnie łatwo)
7. **Comfort/Luxury consumer goods** (synthetics, gourmet_food): priorytet najniższy

**Logika T3 jako wysoki priorytet:**
T3 jest drogi w produkcji i rzadki — gdy kolonia A ma nadwyżkę quantum_processors,
a kolonia B desperacko ich potrzebuje do zaawansowanych budynków, system traktuje
to poważnie (jak niedobór jedzenia dla przemysłu high-end). A każda transakcja T3
generuje duże Kredyty (50× więcej TC zużyte, ale też 50× więcej Kr z transakcji).

**Interwencje gracza (minimal micro):**
- Zablokuj eksport towaru X z kolonii A
- Ustaw towar Y jako "import priority" (50% TC zarezerwowane)
- "Trade isolation" — kolonia nie uczestniczy w sieci (kwarantanna, kryzys)

### 1.4 Trade Network Upkeep (koszt sieci)

```
tradeNetworkUpkeep = Σ(activeConnections × 2 × distanceFactor) per rok
  // distanceFactor: <5 AU = 1.0, 5-15 AU = 1.5, >15 AU = 2.0

→ odejmowany od targetProsperity co rok
```

To zapewnia napięcie: "Czy warto utrzymywać drogie połączenie z odległą kolonią?"

---

## CZĘŚĆ 2 — KREDYTY STRATEGICZNE (nagroda, nie obowiązek)

### 2.1 Filozofia Kredytów w Koncepcji C

> "Handel przynosi bogactwo. Bogactwo umożliwia ambicje."

Kredyty NIE są walutą operacyjną. Nie muszą istnieć żeby kolonia działała.
Są NAGRODĄ za efektywny handel — i otwierają możliwości których normalnie nie ma.

Analogia: Zwykłe budowanie = praca rękami. Kredyty = posiadanie kapitału.
Z kapitałem: skracasz czas, kupujesz rzadkie rzeczy, inwestujesz politycznie.

### 2.2 Dynamiczne ceny (dla obliczeń Kredytów)

```
localPrice[good][colony] = BASE_PRICE[good] × scarcityMultiplier

scarcityMultiplier:
  >10 lat zapasu:   × 0.2
  5–10 lat zapasu:  × 0.5
  2–5 lat zapasu:   × 1.0
  0.5–2 lat zapasu: × 2.0
  <0.5 lat zapasu:  × 5.0
```

**WAŻNE**: Ceny w Koncepcji C są INFORMACJĄ i KALKULATOREM.
- Gracz WIDZI że food kosztuje 5 Kr na księżycowej kolonii vs 0.2 Kr na macierzystej
- To motywuje do handlu (gradient robi to już automatycznie, ale ceny TO UZASADNIAJĄ)
- Handel ODBYWA SIĘ niezależnie od cen (gradient/TC go napędza)
- Ceny określają TYLKO ile Kredytów transakcja generuje

**Trade Value — tabela bazowa:**
| Kategoria | BASE_PRICE |
|-----------|------------|
| Fe, Si, C | 1 Kr |
| Cu, Ti | 2–3 Kr |
| Li, W | 4–6 Kr |
| Pt, Xe | 8–10 Kr |
| food, water | 2 Kr |
| Commodities T1 | 5 Kr |
| Commodities T2 | 12 Kr |
| Consumer goods (functioning) | 8 Kr |
| Consumer goods (comfort) | 15 Kr |
| Consumer goods (luxury) | 30 Kr |

### 2.3 Generowanie Kredytów

**Kredyty generowane TYLKO z udanych transakcji handlowych** — nie z prosperity, nie z pop.

```
Per transakcja (każdy udany transfer towarów):
  exporter_credits += unitsTraded × localPrice_BUYER × 0.06
  importer_credits += unitsTraded × localPrice_BUYER × 0.03
```

**Dlaczego localPrice_BUYER (kupującego)?**
Bo tam towar jest naprawdę potrzebny. Przy scarcityMultiplier=5 (krytyczny deficyt),
transakcja ma 5× wyższą wartość ekonomiczną dla kupującego — i tyle właśnie generuje Credits.

**Dlaczego eksporter dostaje więcej (2×)?**
Produkuje wartość i ponosi koszty produkcji. Importer korzysta z cudzej pracy.

**Efekt dynamicznych cen na Kredyty:**
- Kolonia wydobywcza sprzedaje Fe (tanie u siebie) → generuje mało Kr
- Ale: kolonia przemysłowa KUPUJE Fe drogo (deficyt) → Eksporter górniczy dostaje dużo Kr
- System nagradza: produkcję wartościowych towarów PLUS dostarczanie tam gdzie są potrzebne

**Nie ma prosperity-based generacji.** Kolonia bez handlu nie dostaje Kr nigdy.
Motywuje do budowania połączeń — bo tylko handel przynosi bogactwo.

### 2.4 Wydawanie Kredytów (wydatki strategiczne)

Kredyty NIE są używane do:
- ❌ Utrzymania budynków (Koncepcja A to miała, C tego nie ma)
- ❌ Rutin operacyjnych (energia, surowce, food — to ResourceSystem)
- ❌ Automatycznych kosztów (nic nie jest automatycznie pobierane z Kr poza opcjami gracza)

Kredyty SĄ używane do:
| Akcja | Koszt | Efekt | Typ |
|-------|-------|-------|-----|
| **Zakup Awaryjny** | `localPrice × 2` Kr/unit | Natychmiastowy import poza siecią (bypass gradient/TC) | Kryzysowy |
| **Rush Build** | `buildTime × 8` Kr | Skraca budowę o 50% | Ekspansja |
| **TC Boost** | 100 Kr | +50% Trade Capacity tej kolonii przez 10 lat | Handlowy |
| **Research Boost** | 150 Kr | +25% prędkości badań przez 5 lat | Naukowy |
| **Inwestycja Kulturalna** *(Loyalty)* | 50–200 Kr | +Loyalty dla kolonii | Polityczny |
| **Gubernator** *(Loyalty)* | 30 Kr/rok | +Loyalty +3/rok | Polityczny |
| **Misja Dobrobytu** *(lepsza wersja B)* | 80 Kr + -5 Prosperity | B: targetProsperity +15 na 8 lat | Imperialny |

**Misja Dobrobytu w Koncepcji C** (lepsza od wersji B):
W B była czysto prosperity-to-prosperity. W C płacisz zarówno Kredytami jak i prosperity —
bardziej realistyczne (kosztuje pieniądze I wysiłek organizacyjny).

### 2.5 Gromadzenie Kredytów — brak cap

Kredyty akumulują się bez limitu (jak research w obecnym systemie).
Kolonia może mieć 0 Kr albo 10,000 Kr.
Wysokie Kr = kolonia jest "bogatą prowincją imperialną" — ma kapitał na wielkie projekty.

---

## CZĘŚĆ 3 — NOWE BUDYNKI HANDLOWE

Budynki w Koncepcji C pełnią DWIE role: zwiększają TC (jak B) + generują bonus Kredytów (jak A).

| Budynek | namePL | nameEN | TC Bonus | Kr Bonus | Efekt specjalny |
|---------|--------|--------|----------|----------|-----------------|
| trade_hub 🔄 | Węzeł Handlowy | Trade Hub | ×2 | +15% per transakcja | Zasięg +5 AU, odblokuj wszystkie typy towarów |
| free_market 🏪 | Wolny Rynek | Free Market | +30% routing eff. | +10% | Trade upkeep −20%, odblokuj consumer goods |
| trade_beacon 📡 | Latarnia Handlowa | Trade Beacon | Zasięg ×1.5 | — | Widoczność surplusów i cen wszystkich kolonii |
| commodity_nexus 💎 | Centrum Komodalne | Commodity Nexus | — | +30% long-distance | Empire-wide matching (eliminuje ograniczenia zasięgu dla tej kolonii) |

**Koszty budynków (bez creditCost — brak maintenance):**
| Budynek | Tier | Cost surowce | Cost commodities | Tech wymag. |
|---------|------|-------------|-----------------|-------------|
| trade_hub | 1 | Fe:40, C:20, Cu:5 | — | brak |
| free_market | 1 | Fe:30, C:15 | concrete_mix:2 | brak |
| trade_beacon | 2 | electronics:3, Ti:10 | copper_wiring:4 | interplanetary_logistics |
| commodity_nexus | 3 | quantum_processors:2 | exotic_alloy:1 | (nowy tech: advanced_trade) |

---

## CZĘŚĆ 4 — PĘTLA SPRZĘŻENIA ZWROTNEGO

```
┌─────────────────────────────────────────────────────────────────────┐
│  PĘTLA WZROSTU (Koncepcja C)                                         │
│                                                                      │
│  Wysoka Prosperity                                                   │
│    → Wyższe TC bazowe (prosperity × 0.25 bonus)                     │
│    → Więcej towarów przepływa (silniejszy gradient do nowych kolonii)│
│    → Więcej Kredytów generowanych z transakcji                      │
│    → Kredyty → Rush Build → szybsza ekspansja produkcji             │
│    → Więcej produkcji → więcej nadwyżek → więcej handlu             │
│    → Więcej handlu → lepsze warstwy prosperity (comfort/luxury)     │
│    → Wyższa Prosperity → wyższe TC → ...                            │
└───────────────────────────── PĘTLA ────────────────────────────────┘

BRAMKI (kiedy pętla jest zablokowana):
  Mała kolonia (pop=2): TC=20 → tylko 2 połączenia → mało transakcji → mało Kr
  Gracz musi: budować POP (mieszkania) LUB budować trade_hub (TC×2)

NAPIĘCIE (sustainability):
  Każde połączenie kosztuje prosperity (upkeep)
  Dalekie połączenia kosztują 2× więcej
  Gracz musi decydować: "czy ta trasa jest profitable?"
  → Tak: zarabia dużo Kr bo duże ceny u kupującego
  → Nie: prosperity drenaż bez wartości → rozważ trade_hub na tej kolonii

SPIRALA KRYZYSU:
  Kolonia bez handlu: TC nieistotne, Kredyty=0
  Niska prosperity → niski TC → mało handlu → mało Kr → brak Rush Build → wolna ekspansja
  Wyjście: cargo_ship ręczny (stary system) + zbuduj trade_hub → bootstrap gradient
```

---

## CZĘŚĆ 5 — INTEGRACJA Z ISTNIEJĄCYMI SYSTEMAMI

### ResourceSystem
Kredyty jako nowy "zasób" w ResourceSystem:
```javascript
// PER-KOLONIA, w ColonyManager:
colony.credits = 0;         // aktualna pula
colony.creditsPerYear = 0;  // przychód roczny (do UI)

// Nie jest tracked w ResourceSystem.inventory
// Ma własny prosty akumulator w CivilianTradeSystem
```
Kredyty NIE są w inventory (nie mają tradeValue, nie da się ich wysłać jako cargo).

### ProsperitySystem
Nowe wejścia do targetProsperity:
```javascript
// Bonus za aktywną sieć (już w Koncepcji B):
tradeNetworkBonus = min(15, activeConnections × 3)
  // +3 prosperity per aktywne połączenie, max +15

// Koszt sieci (już w Koncepcji B):
tradeNetworkUpkeep = activeConnections × 2 × distanceFactor
  // odejmowany od targetProsperity

// NET dla prosperity: +15 (bliskie, liczne połączenia) do -10 (daleka izolowana sieć)
prosperityFloor = 50 + techBonus + discoveryBonus + tradeNetworkBonus - tradeNetworkUpkeep
```

Prosperity NIE generuje Kredytów bezpośrednio (kluczowa różnica od Koncepcji A).

### TradeRouteManager (istniejący)
Zachowany bez zmian. Komplementarny:
- TradeRouteManager = precyzja (gracz kontroluje konkretny ładunek)
- CivilianTradeSystem = bulk (automatyczny gradient)
- Gracz używa ręcznych tras do: kolonizacji, prefabów, szybkich dostaw
- Gracz polega na cywilnym handlu do: surowców, żywności, consumer goods

### ColonyManager
Nowe pola per-kolonia:
```javascript
colony.credits = 0;                    // aktualna pula Kr
colony.creditsPerYear = 0;             // roczny bilans (do UI)
colony.tradeCapacity = 0;              // obliczane z pop + buildings + prosperity
colony.activeTradeConnections = [];    // lista { colonyId, goodsIn, goodsOut, volume }
colony.tradeOverrides = {};            // { goodId: 'block'|'priority'|'import_only' }
```

### SaveMigration
Nowe pola z sensownymi defaults przy migracji:
```javascript
colony.credits = 0;
colony.tradeCapacity = 0;
colony.activeTradeConnections = [];
colony.tradeOverrides = {};
```
Bump CURRENT_VERSION + migracja dodająca powyższe.

---

## CZĘŚĆ 6 — UI (panel handlowy)

### Zakładka "Handel" w PlanetGlobeScene (nowa)

```
┌───────────────────────────────────────────────────────────────┐
│  💰 EKONOMIA KOLONII — Nova Kraków                            │
│                                                               │
│  Kredyty: 247 Kr    (+18/rok)    Trade Capacity: 1300 Kr/rok  │
│                                                               │
│  AKTYWNE POŁĄCZENIA:                                          │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ ↔ Macierzysta   [4.2 AU]   food→ 30j  ←Fe 45j   +12Kr │  │
│  │ ↔ Księżyc Ymir  [1.1 AU]   water→ 15j ←C 20j    +5Kr  │  │
│  │ ✕ Kolonia Delta [18 AU]    [za daleko — brak TC]        │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  CENY LOKALNE (top 5 drogi/tanie):                            │
│  🔴 Drogo (deficyt):  food ×4.5  water ×3.2  Cu ×2.1         │
│  🟢 Tanio (nadwyżka): Fe ×0.2   Ti ×0.3    C ×0.4            │
│                                                               │
│  BLOKADY EKSPORTU:  [+Dodaj blokadę]                          │
│  [food: ZABLOKOWANY — głód]  [x usuń]                         │
│                                                               │
│  WYDAJ KREDYTY:                                               │
│  [🏗 Rush Build: 80 Kr → -50% czasu budowy]                  │
│  [📦 Zakup Awaryjny: 90 Kr → 20j food]                       │
│  [📡 TC Boost: 100 Kr → +50% TC przez 10 lat]                │
└───────────────────────────────────────────────────────────────┘
```

### Wskaźnik w CivPanel (UIManager)
Mały indicator w istniejącym CivPanel:
```
💰 247 Kr  (+18/rok)   [2 połączenia aktywne]
```
Tylko przy aktywnej kolonii (nie w stałym HUD — za dużo kolonii).

---

## CZĘŚĆ 7 — RELACJA Z LOYALTY/IDENTITY (przyszłość)

Koncepcja C jest NAJLEPSZYM fundamentem pod Loyalty/Identity ze wszystkich trzech:

```
Aktywne połączenia → +2 Loyalty/rok per połączenie (jak w A i B)
Kredyty → waluta dyplomatyczna:
  - Negocjacje separatyzmu: 200 Kr + zasoby
  - Gubernator: 30 Kr/rok maintenance
  - Inwestycja kulturalna: 80 Kr → +Identity bonus na 10 lat
  - Misja Dobrobytu: 80 Kr → +Loyalty dla słabszej kolonii

Brak połączeń (trade isolation) → Identity rośnie szybciej (izolacja)
Duże Kredyty → dowód na silne więzi ekonomiczne → Loyalty naturalnie wyższa
```

Kluczowy PLUS Koncepcji C dla Loyalty: Kredyty są "walutą polityczną" —
co jest o wiele bardziej realistyczne niż wydawanie prosperity (Koncepcja B)
albo utrzymywanie korporacji z Loyalty (Koncepcja A).

---

## PODSUMOWANIE — dlaczego C to najlepsza hybryda

### Eliminuje słabości A i B:
| Problem | A | B | C |
|---------|---|---|---|
| Maintenance pressure kredytów | ❌ Tak (stresujące) | — | ✓ Brak |
| Brak namacalnej waluty | — | ❌ Tak | ✓ Kr jako nagroda |
| Zbyt dużo mikro | ❌ (ordery + ceny) | — | ✓ Auto + overrides |
| Brak agencji gracza | — | ❌ Mała | ✓ Wydatki strategiczne |
| Kompleksowość | ❌ Wysoka | — | ✓ Średnia |

### Zachowuje siły A i B:
| Zaleta | A | B | C |
|--------|---|---|---|
| Naturalne przepływy towarów | — | ✓ | ✓ |
| Dynamiczne ceny | ✓ | — | ✓ (informacyjnie) |
| Namacalna waluta | ✓ | — | ✓ (strategicznie) |
| Emergencja | ✓ | ✓ | ✓ |
| Dobra integracja z Loyalty | ✓ | ✓ | ✓✓ (najlepsza) |

### Ocena Koncepcji C:
| Kryterium | Ocena | Uzasadnienie |
|-----------|-------|--------------|
| Głębia ekonomiczna | ★★★★☆ | Naturalne przepływy + dynamiczne ceny + waluta |
| Czytelność gracza | ★★★★☆ | Gradient intuicyjny, Kr proste, mało obowiązkowych decyzji |
| Emergencja | ★★★★★ | Wyrównywanie prosperity + akumulacja Kr = dwa ortogonalne cele |
| Złożoność implementacji | ★★★☆☆ | Mniej niż A, więcej niż B — ale modularnie |
| Poczucie "żywej ekonomii" | ★★★★★ | Statki przepływają + bogactwo rośnie = widoczny sukces |
| Kontrola gracza | ★★★★☆ | Auto-routing + blokady + wydatki Kr = właściwy balans |

---

## PLIKI DO IMPLEMENTACJI (Koncepcja C)

### Nowe pliki
| Plik | Zawartość |
|------|-----------|
| `src/systems/CivilianTradeSystem.js` | Gradient calc, TC allocation, auto-routing, upkeep, credits gen |
| `src/data/TradeValuesData.js` | BASE_PRICE per resource/commodity |

### Modyfikacje
| Plik | Zmiana |
|------|--------|
| `src/data/BuildingsData.js` | Nowe budynki: trade_hub, free_market, trade_beacon, commodity_nexus (z tcBonus, creditBonus) |
| `src/data/CommoditiesData.js` | Dodaj `tradeValue` per commodity (używane przez TradeValuesData) |
| `src/systems/ColonyManager.js` | Dodaj `credits`, `creditsPerYear`, `tradeCapacity`, `activeTradeConnections`, `tradeOverrides` |
| `src/systems/ProsperitySystem.js` | Dodaj `tradeNetworkBonus` i `tradeNetworkUpkeep` do targetProsperity |
| `src/scenes/PlanetGlobeScene.js` | Nowa zakładka "Handel" (zakładka 6 lub wbudowana w istniejący panel) |
| `src/scenes/UIManager.js` | Mały wskaźnik Kr w CivPanel aktywnej kolonii |
| `src/renderer/ThreeRenderer.js` | Kosmetyczne linie połączeń + małe statki cywilne |
| `src/systems/SaveMigration.js` | Bump version, defaults: credits=0, tradeCapacity=0, connections=[], overrides={} |

### Kolejność implementacji
1. `TradeValuesData.js` — czyste dane, bez zależności
2. `CivilianTradeSystem.js` — rdzeń systemu (gradient + TC + routing + credits)
3. Modyfikacja `ColonyManager` — nowe pola, serialize/restore
4. Modyfikacja `ProsperitySystem` — tradeNetworkBonus + upkeep
5. Nowe budynki w `BuildingsData.js`
6. `SaveMigration.js` — bump + defaults
7. UI — zakładka Handel w PlanetGlobeScene
8. UIManager — wskaźnik Kr
9. ThreeRenderer — kosmetyczne statki (opcjonalne, na końcu)

### Weryfikacja
1. Stwórz 2 kolonie: A (prosperity 80, nadwyżka food) ↔ B (prosperity 35, nadwyżka Fe)
2. Sprawdź: czy food flows A→B automatycznie? czy Fe flows B→A?
3. Sprawdź: czy Kredyty generują się na obu koloniach?
4. Sprawdź: czy prosperity B rośnie po 20 latach?
5. Sprawdź: czy gradient maleje w czasie (wyrównywanie)?
6. Sprawdź: czy trade upkeep odejmuje od targetProsperity kolonii A?
7. Test Rush Build: wydaj Kr → sprawdź czy budowa krótka
8. Test Zakup Awaryjny: usuń food z B ręcznie → emergency buy → food przywrócony
9. Save/Load: sprawdź czy credits, connections, overrides zachowane
