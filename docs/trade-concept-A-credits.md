# KONCEPCJA A: "KREDYTY + KORPORACJE"
# Waluta jako kręgosłup cywilnej ekonomii

> Dokument roboczy. Data: 2026-03-19.
> Powiązane: trade-concept-B-gradients.md, loyalty-identity-concepts.md

---

## Rdzeń koncepcji

Każda kolonia ma własną walutę — **Kredyty (Kr)**. Są generowane przez handel
i prosperity, i finansują korporacje cywilne które obsługują handel automatycznie.

**Dwa systemy transportu działają równolegle:**
| | Cargo Ship Routes (stary) | Civilian Trade (nowy) |
|--|--------------------------|----------------------|
| Kontrola | Manual (gracz przypisuje statek) | Auto (korporacje) |
| Precyzja | Dokładna ilość, konkretny ładunek | Przybliżona (fulfillment %) |
| Szybkość | Pełna (1 kurs = 100% cargo) | Stopniowa (35–90% rocznie) |
| Paliwo | Tak (power_cells) | Nie (abstrahowane) |
| Zastosowanie | Budowa kolonii, cargo prefabs | Bulk trade, surowce, żywność |

---

## WARSTWA 1 — DYNAMICZNE CENY PER-KOLONIA

Brak globalnej tabeli cen. Każdy towar ma **lokalną cenę** w każdej kolonii,
zależną od lokalnej podaży i popytu.

```
localPrice[good][colony] = BASE_PRICE[good] × scarcityMultiplier

scarcityMultiplier = f(stock / annualConsumption):
  > 10 lat zapasu:   × 0.2   (bardzo tani — ogromna nadwyżka)
  5–10 lat zapasu:   × 0.5   (tani)
  2–5 lat zapasu:    × 1.0   (cena rynkowa)
  0.5–2 lat zapasu:  × 2.0   (drogi — niedobór)
  < 0.5 lat zapasu:  × 5.0   (bardzo drogi — deficyt krytyczny)
```

**Przykłady gameplay:**
- Kolonia wydobywcza z 50-letnim zapasem Fe → Fe = 0.2 Kr/unit (tanie jak barszcz)
- Kolonia przemysłowa z 2-tygodniowym Fe → Fe = 5 Kr/unit (pilnie poszukiwane)
- Macierzysta z ogromną farmą → food = 0.2 Kr
- Kolonia księżycowa bez wody i farmy → food = 5 Kr

**Efekt:** Gracz WIDZI różnice cen → naturalny motywator do handlu. Korporacje cywilne
automatycznie arbitrażują: "kupię tanio Fe na górniczej, sprzedam drogo na przemysłowej."

### Trade Value — baza cen (punkt odniesienia)

| Kategoria | Zasoby | BASE_PRICE |
|-----------|--------|------------|
| Surówki podstawowe | Fe, Si, C | 1 Kr |
| Surowce cenne | Cu, Ti | 2–3 Kr |
| Surowce rzadkie | Li, W | 4–6 Kr |
| Surowce egzotyczne | Pt, Xe | 8–10 Kr |
| Żywność / woda | food, water | 2 Kr |
| Commodities T1 | steel_plates, copper_wiring... | 5 Kr |
| Commodities T2 | power_cells, electronics... | 12 Kr |
| Consumer goods (functioning) | spare_parts, pharma... | 8 Kr |
| Consumer goods (comfort) | synthetics, personal_electronics | 15 Kr |
| Consumer goods (luxury) | gourmet_food, semiconductors... | 30 Kr |

---

## WARSTWA 2 — KREDYTY (per-kolonia)

### Czym są Kredyty

Kredyty (Kr) = miara aktywności ekonomicznej i siły finansowej kolonii.
**NIE** zastępują Prosperity — są przez nią generowane i wzmacniają ją.

```
Prosperity 80 + Pop 6
  → +2.4 Kr/rok (prosperity bonus)
  + aktywny handel (200 Kr/rok obrót)
  → +16 Kr/rok (trade bonus)
  ─────────────────────────────────
  RAZEM: +18.4 Kr/rok
  Po 30 latach: ~552 Kr → Corporate Tier 1
```

### Generowanie Kredytów (per rok)

```
prosperityBonus = max(0, prosperity - 40) × 0.05 × pop
  // Prosperity=40: 0 Kr  |  Prosperity=70: 1.5×pop Kr  |  Prosperity=100: 3×pop Kr

tradeBonus (gdy handel odbywa się):
  → exporter dostaje: unitsTraded × localPriceBUYER × 0.06
  → importer dostaje: unitsTraded × localPriceBUYER × 0.03
  // Eksporter zarabia 2× więcej niż importer — produkuje wartość
  // Cena KUPUJĄCEGO bo tam towar jest naprawdę potrzebny (wyższy mnożnik niedoboru)

buildingBonus = Σ(marketBuildings.creditBonus per rok)
```

**Dlaczego obie kolonie dostają Kr?**
Bo handel to sieć — eksporter zarabia na zbyciu nadwyżki, importer zarabia
na byciu częścią sieci handlowej zamiast izolowanej subsystencji.
"Handlujemy, więc jesteśmy."

### Wydawanie Kredytów — BUDYNKI I UTRZYMANIE

Kluczowa rola Kredytów: **gospodarka musi płacić za swój własny rozwój**.

**Koszt budowy (jednorazowy, przy starcie budowy):**
```
building.creditCost = buildingTier × 20 Kr
// Tier 1: 20 Kr  |  Tier 2: 40 Kr  |  Tier 3: 80 Kr
// Płacone OPRÓCZ surowców i commodities
```

**Utrzymanie roczne (automatyczne):**
```
building.creditMaintenance = buildingTier × 5 Kr/rok
// Tier 1: 5 Kr/rok  |  Tier 2: 10 Kr/rok  |  Tier 3: 20 Kr/rok
```

**Jeśli braknie Kredytów na maintenance:**
- Budynek przechodzi w tryb "low-ops" → -50% produkcji
- Gracz musi albo generować więcej Kr albo rozebrać budynki
- Tworzy napięcie: nie możesz budować szybciej niż twoja gospodarka udźwignie

**Inne wydatki gracza (manualne):**
| Akcja | Koszt | Efekt |
|-------|-------|-------|
| Zakup awaryjny | `localPrice × 2` Kr/unit | Natychmiastowy import (z niezbadanych zapasów imperium) |
| Rush Build | `buildTime × 8` Kr | Skraca budowę o 50% |
| Inwestycja Kulturalna *(Loyalty)* | 50–200 Kr | +Loyalty dla kolonii |
| Gubernator *(Loyalty)* | 30 Kr/rok | +Loyalty +3/rok |

---

## WARSTWA 3 — KORPORACJE CYWILNE (flow-based tier)

**Tier korporacji = obrót handlowy**, nie nagromadzony kapitał.
Jeśli handel spada → Tier spada automatycznie. Nie ma "nigdy nie spada" pułapki.

```
annualTradeVolume = Σ(unitsTraded × localPriceBUYER) za ostatni rok
corporateTier = f(annualTradeVolume):
  0–500 Kr/rok:     Tier 0 — brak korporacji, tylko handlarze bazarowi
  500–2000 Kr/rok:  Tier 1 — małe firmy spedycyjne
  2000–6000 Kr/rok: Tier 2 — regionalne korporacje handlowe
  6000+ Kr/rok:     Tier 3 — wielkie imperium korporacyjne
```

**Naturalny sufit:** Nie możesz sprzedać więcej niż produkujesz.
Produkcja 100 Fe/rok → max obrót Fe = 100 Kr/rok. Korporacje osiągają plateau.

**Efekty per Tier:**
| Tier | Max połączeń | Fulfillment | Zasięg | Maint/rok |
|------|-------------|-------------|--------|-----------|
| 0 | 0 | — | — | 0 Kr |
| 1 | 3 | 35% | 5 AU | 20 Kr |
| 2 | 8 | 65% | 20 AU | 60 Kr |
| 3 | nieogr. | 90% | nieogr. | 150 Kr |

**Fulfillment** = jaki % zleconego buy/sell order jest realizowany rocznie.
Asymetryczne połączenie: `fulfillment = f(min(tierA, tierB))` — ogranicza słabszy partner.

**Maintenance korporacji** pobierana z puli Kredytów kolonii.
Jeśli Kredyty < maintenance → korporacje bankrutują → Tier spada.

**Wizualizacja 3D** (kosmetyczna):
- Małe statki cywilne (inny sprite niż military) na trasach między koloniami
- Liczba statków wizualnych = `corporateTier × 2`
- Animowane wzdłuż linii połączeń, nie zarządzane przez VesselManager

---

## WARSTWA 4 — BUY/SELL ORDERS + MATCHING

### Dane per-kolonia

```javascript
colony.buyOrders  = { Fe: 50, food: 0, electronics: 10 }   // jednostki/rok do kupna
colony.sellOrders = { food: 100, water: 80 }                 // jednostki/rok do sprzedaży
```

### Auto-detect (runs co rok, sugestie dla gracza)

```
Dla każdego zasobu/towaru w kolonii:
  surplus  = stock > consumption × 30  // >30-letni zapas = nadwyżka
  shortage = stock < consumption × 5   // <5-letni zapas = niedobór

  IF surplus AND brak sellOrder  → sugeruj sellOrder = 50% nadwyżki/rok
  IF shortage AND brak buyOrder  → sugeruj buyOrder = pokrycie niedoboru
```

Gracz widzi sugestie jako "●" w panelu handlowym. Jednym kliknięciem zatwierdza.
Może też ustawić ręcznie dowolną wartość.

### Matching Algorithm (runs co rok w CivilianTradeSystem)

```
Dla każdej pary (kolonia A z buyOrder X, kolonia B z sellOrder X):
  1. Sprawdź dystans ≤ max_range(min(tierA, tierB))
  2. Sprawdź stock_B > order × 2 (kolonia B ma co sprzedać)
  3. Oblicz transfer = min(buyOrder_A, sellOrder_B, stock_B × 0.5, fulfillmentQty)
  4. Wykonaj: B.resource -= transfer; A.resource += transfer
  5. Generuj Kr: B (exporter) += transfer × localPriceA × 0.06
                 A (importer) += transfer × localPriceA × 0.03
  6. Emituj 'civilianTrade:completed' { from, to, goods, credits }
```

---

## NOWE BUDYNKI KATEGORII 'MARKET'

| Budynek | namePL | Tier | Efekt | Koszt |
|---------|--------|------|-------|-------|
| local_market 🏪 | Rynek Lokalny | 1 | +60% Kr generacja, odblokuj consumer goods w orderach, Corp Tier cap 1→2 | Fe:40, C:20, Cu:5 + 30 Kr |
| trade_house 🏦 | Dom Handlowy | 2 | Corp annualVolume progi ×0.7, zasięg ×1.5, +20 Kr/rok flat | steel_plates:6, electronics:3 + 80 Kr |
| commodity_exchange 💱 | Giełda Komodalna | 3 | Empire-wide matching bez ograniczenia zasięgu (korporacje mają dalekodystansowe statki), fulfillment +15% | quantum_processors:2, exotic_alloy:1 + 200 Kr |

**Commodity Exchange** (zamiast "Price Exchange") — nie pokazuje cen, ale AKTYWNIE
matchuje ordery empire-wide, łamiąc ograniczenie zasięgu. Silna mechanika, nie
tylko informacyjna.

---

## FEEDBACK LOOP

```
Wysoka Prosperity + Pop
  → Więcej Kr generowanych (prosperityBonus)
  → Wyższy obrót korporacji → Tier rośnie
  → Lepszy fulfillment → więcej towarów importowanych
  → Wyższe warstwy Prosperity (comfort/luxury)
  → Wyższa Prosperity → jeszcze więcej Kr → ...

PUŁAPKA EKSPANSJI:
  Budynki wymagają creditMaintenance co rok
  Zbyt szybka rozbudowa → brak Kr → low-ops → produkcja spada
  Mniej produkcji → mniej handlu → mniej Kr → więcej low-ops
  Gracz MUSI balansować ekspansję z siłą gospodarczą
```

```
Prosperita bonus (handlowa):
  tradeBonus = min(20, activeConnections × 3)
  prosperityFloor = 50 + techBonus + discoveryBonus + tradeBonus
  // Aktywny handel PODNOSI dolny próg prosperity — stabilizuje kolonie
```

---

## RELACJA Z PRZYSZŁYM LOYALTY/IDENTITY

```
Aktywne połączenia cywilne → +2 Loyalty/rok per połączenie
Corp Tier 2+ → stabilność ekonomiczna → stabilizuje Loyalty
Brak handlu (Tier 0) → izolacja → Identity rośnie szybciej
Kredyty → waluta dyplomatyczna: negocjacje separatyzmu, gubernator
```

---

## PLIKI DO IMPLEMENTACJI

### Nowe pliki
| Plik | Zawartość |
|------|-----------|
| `src/systems/CivilianTradeSystem.js` | Matching orders, transfer, credits gen, tier logic |
| `src/data/TradeValuesData.js` | BASE_PRICE per resource/commodity |

### Modyfikacje
| Plik | Zmiana |
|------|--------|
| `src/data/CommoditiesData.js` | Dodaj `tradeValue` i `creditMaintenance` |
| `src/data/BuildingsData.js` | Nowe budynki market + `creditCost` + `creditMaintenance` per building |
| `src/systems/ColonyManager.js` | Dodaj `buyOrders`, `sellOrders`, `credits`, `corporateTier` |
| `src/systems/ProsperitySystem.js` | Dodaj `tradeBonus` do prosperity floor |
| `src/scenes/PlanetGlobeScene.js` | UI tab "Handel": ordery, Kr, Corp Tier, sugestie |
| `src/scenes/UIManager.js` | Kr indicator w CivPanel dla aktywnej kolonii |
| `src/renderer/ThreeRenderer.js` | Kosmetyczne statki cywilne (sprites na trasach) |
| `src/systems/SaveMigration.js` | Bump version, defaults: credits=0, corporateTier=0, orders={} |

---

## OCENA KONCEPCJI A

| Kryterium | Ocena | Uzasadnienie |
|-----------|-------|--------------|
| Głębia ekonomiczna | ★★★★★ | Dynamiczne ceny, boom/bust korporacji, maintenance pressure |
| Czytelność gracza | ★★★☆☆ | Dużo do śledzenia (Kr, ceny, Tiery, maintenance) |
| Emergencja | ★★★★☆ | Bankructwa korporacji, pętle sprzężenia |
| Złożoność implementacji | ★★★★☆ | Modularne, ale wiele nowych systemów |
| Poczucie "żywej ekonomii" | ★★★★★ | Dynamiczne ceny + korporacje które upadają |
| Analogia do | Victoria 3, Anno, Offworld Trading |
