# Automatyzacja Fabryk — Koncepcja

## Problem

Gracz musi ręcznie:
1. Alokować FP do każdego towaru osobno (klikanie +/-)
2. Ustawiać targety (+5/+10/+50) dla każdego towaru
3. Pilnować łańcuchów produkcji (T3 wymaga T2 które wymaga T1 — gracz musi sam alokować każdy tier)
4. Reagować na braki surowców (fabryka stoi, gracz nie wie dlaczego)
5. Powtarzać to samo dla każdej kolonii

Przy 21 towarach w 5 tierach i wielu koloniach — to za dużo mikro-zarządzania.

---

## Rozwiązanie: 3 Tryby Produkcji + Auto-łańcuch

Fabryka ma **tryb pracy** (per kolonia). Gracz wybiera tryb — system robi resztę.

### Tryb 1: MANUALNY 🔧 (obecny system — bez zmian)
Gracz sam alokuje FP, ustawia targety, zarządza kolejką.
Dla graczy którzy chcą pełną kontrolę. Działanie identyczne jak teraz.

### Tryb 2: PRIORYTETOWY 📋 (główna automatyzacja)
Gracz ustawia **listę celów zapasowych** — system sam alokuje FP.
Auto-łańcuch: jeśli T3 wymaga T2 składnika, system sam go produkuje.

### Tryb 3: REAKTYWNY 🤖 (pełna automatyzacja)
System sam wykrywa co jest potrzebne i produkuje. Zero kliknięć.

---

## Tryb PRIORYTETOWY — szczegóły

### Jak to wygląda

```
TRYB: [🔧 Manual] [📋 Priorytet ←aktywny] [🤖 Reaktywny]     FP: 5/5

 # │ Towar                │ Zapas │ Cel │ FP  │ Status
───┼──────────────────────┼───────┼─────┼─────┼──────────────
 1 │ ⚡ power_cells        │  3   │ 10  │  2  │ ▶ produkuje
 2 │ 🔩 structural_alloys │  8   │  8  │  0  │ ✓ cel osiągnięty
 3 │ 💡 electronic_systems│  1   │  5  │  2  │ ▶ produkuje
 4 │ 🏗 pressure_modules  │  0   │  3  │  1  │ ▶ produkuje
───┴──────────────────────┴───────┴─────┴─────┴──────────────
 [+ Dodaj towar]  [Szablony ▼]  [Wyczyść listę]

 ⛓ Auto-łańcuch:
   structural_alloys ×2 → dla pressure_modules (T2 składnik)
```

### Co gracz robi

1. Klika **[+ Dodaj towar]** → wybiera z listy (pogrupowane tier 1→5)
2. Ustawia **Cel zapasu** (suwak lub input: 1–50)
3. Drag & drop zmienia **kolejność priorytetów** (uchwyt ≡ po lewej)
4. Albo klika **[Szablony ▼]** → jednym klikiem ustawia gotowy zestaw

To wszystko. System sam:
- Alokuje FP (wyższy priorytet = dostaje FP pierwszy)
- Wznawia produkcję gdy zapas spadnie poniżej celu (bo coś zużyto)
- Wstrzymuje gdy cel osiągnięty (FP idą niżej na liście)

### Algorytm alokacji FP

```
Co tick:
1. Oblicz deficyt każdego wpisu: max(0, cel - zapas)
2. Posortuj wg pozycji na liście (priorytet)
3. Przydzielaj FP od góry:
   - Wpis z deficytem > 0 → dostaje min. 1 FP
   - Jeśli zostaje wolne FP → dodaj kolejne FP do wpisów z największym deficytem
   - Deficyt = 0 → 0 FP, przeskocz
4. Gdy zapas spada poniżej celu → wznów automatycznie
```

### Auto-łańcuch składników (kluczowa cecha)

Problem: gracz chce `propulsion_systems` (T3), ale receptura wymaga `structural_alloys` (T1) + `power_cells` (T2) jako składniki. Ręcznie musi alokować FP na 3 towary.

Rozwiązanie — system sam produkuje brakujące składniki:

```
Gracz dodaje: propulsion_systems, cel: 5
  Receptura: Fe:10, Ti:8 + 3×structural_alloys + 2×power_cells

System sprawdza zapas:
  structural_alloys: 1 (potrzeba 15 = 5×3) → BRAK 14
  power_cells: 3 (potrzeba 10 = 5×2) → BRAK 7

Auto-akcja:
  → Tymczasowo alokuje FP na structural_alloys (14 szt.)
  → Tymczasowo alokuje FP na power_cells (7 szt.)
  → Gracz widzi: "⛓ Auto: structural_alloys 0/14, power_cells 0/7"
  → Gdy składniki gotowe → FP wracają na propulsion_systems
```

Zasady:
- Łańcuch rekurencyjny (max 3 poziomy: T5→T4→T3→T2)
- Auto-łańcuch używa max 50% dostępnych FP (reszta na główne cele)
- Gracz widzi sekcję "⛓ Auto-łańcuch" z postępem
- Auto-łańcuch NIE modyfikuje listy priorytetów — to tymczasowa produkcja
- Jeśli składnik jest na liście priorytetów z własnym celem — nie duplikuj, dodaj do potrzeb

### Szablony priorytetów

Predefiniowane zestawy (1 klik = gotowa lista):

| Szablon | Skład | Kiedy użyć |
|---------|-------|------------|
| **⛽ Paliwo & Logistyka** | power_cells:20, structural_alloys:15, conductor_bundles:10 | Przygotowanie floty |
| **🏗 Rozbudowa** | structural_alloys:20, pressure_modules:10, electronic_systems:10, extraction_systems:5 | Budowa infrastruktury |
| **👥 Konsumpcja** | basic_supplies:15, civilian_goods:10, neurostimulants:5 | Wzrost populacji |
| **🔬 Naukowo-Techniczny** | electronic_systems:15, semiconductor_arrays:8, polymer_composites:5 | Research push |
| **🚀 Endgame** | quantum_cores:5, antimatter_cells:3, warp_cores:1 | Późna gra |

Gracz może:
- Wybrać szablon jako punkt startowy, potem zmodyfikować
- Zapisać własny szablon (przycisk 💾, max 3 custom, nazwa custom)
- Szablon to tylko lista startowa — po załadowaniu gracz edytuje normalnie

---

## Tryb REAKTYWNY — szczegóły

### Pełna automatyzacja — system sam decyduje

Zero konfiguracji. System skanuje 5 źródeł zapotrzebowania i alokuje FP:

```
TRYB: [🔧 Manual] [📋 Priorytet] [🤖 Reaktywny ←aktywny]     FP: 5/5

 Źródło          │ Towar              │ FP │ Potrzeba    │ Status
─────────────────┼────────────────────┼────┼─────────────┼─────────
 🏗 Budowa       │ structural_alloys  │  2 │ 4 (hangar)  │ ▶ 2/4
 🏗 Budowa       │ pressure_modules   │  1 │ 2 (reaktor) │ ▶ 0/2
 ⛽ Paliwo       │ power_cells        │  1 │ 8 (flota)   │ ▶ 3/8
 👥 Konsumpcja   │ basic_supplies     │  1 │ 12 (5 lat)  │ ▶ 7/12
─────────────────┴────────────────────┴────┴─────────────┴─────────
 Bezczynne: 0 FP  │  ⚠ brak Ti → pressure_modules wstrzymane

 [Dostosuj priorytety źródeł ▼]
```

### 5 źródeł zapotrzebowania (priorytet malejący)

```
1. BUDOWA (najwyższy)
   Skąd: BuildingSystem._constructionQueue (pending builds)
         + BuildingSystem tiles z pending commodities
         + ColonyManager.shipQueues (statki w budowie)
   Co:   Produkuj dokładnie tyle ile potrzeba na następny budynek/statek w kolejce

2. PALIWO
   Skąd: VesselManager — statki w hangarze z < 50% paliwa
   Co:   Utrzymuj zapas power_cells = Σ(fuelCapacity - fuel) dla statków w hangarze

3. KONSUMPCJA
   Skąd: CivilizationSystem — populacja × stawki konsumpcji
   Co:   basic_supplies / civilian_goods na 5 lat konsumpcji

4. HANDEL
   Skąd: CivilianTradeSystem — eksportowane towary
   Co:   Produkuj nadwyżkę towarów które generują Kredyty (Kr)
         Tylko jeśli pozostają wolne FP po wyższych priorytetach

5. ZAPAS MINIMUM (najniższy)
   Co:   T1-T2 commodities: utrzymuj min 3 sztuki
         T3+: utrzymuj min 1 sztukę
         Tylko jeśli pozostają wolne FP
```

### Inteligencja reaktywna

- **Priorytetyzacja czasowa**: budynek potrzebujący commodities za 0.5 roku > paliwo którego wystarczy na 3 lata
- **Unikanie marnotrawstwa**: nie produkuje gdy stock > 30 i brak zapotrzebowania
- **Ostrzeżenia**: `⚠ brak Ti → pressure_modules wstrzymane`
- **Wskazówki**: `💡 Zbuduj kopalnię Ti lub importuj przez handel`

### Dostosowanie priorytetów źródeł

Gracz może zmienić kolejność 5 źródeł (drag & drop w rozwijanym panelu):

```
[Dostosuj priorytety źródeł ▼]
  1. 🏗 Budowa         (domyślnie najwyższy)
  2. ⛽ Paliwo
  3. 👥 Konsumpcja
  4. 📦 Handel
  5. 🛡 Zapas minimum
```

Np. gracz przygotowujący flotę może podnieść ⛽ Paliwo nad 🏗 Budowa.

---

## Przełączanie trybów

```
Przy przełączeniu:
- Manual → Priorytet: istniejące alokacje konwertowane na listę
  (towar z target → cel zapasu, towar bez target → cel = zapas + 10)
- Priorytet → Reaktywny: lista priorytetów zachowana (wraca przy powrocie)
- Reaktywny → Manual: aktualne alokacje zamrożone, gracz przejmuje
- Kolejka (_queue) zachowana przy każdym przełączeniu
```

---

## Auto-łańcuch — głębsze spojrzenie

To najważniejsza cecha automatyzacji. Przykład pełnego łańcucha dla T5:

```
Gracz chce: warp_cores (T5)
  Receptura: 2×quantum_cores + 2×antimatter_cells + Ti:8

  quantum_cores (T4): Si:6, Nt:4, Hv:4, Xe:3, Ti:2, Li:2
  antimatter_cells (T4): (swoją recepturę)

System rozwiązuje:
  Poziom 1: warp_cores wymaga 2×quantum_cores + 2×antimatter_cells
  Poziom 2: quantum_cores wymaga surowców (nie commodity) → OK, koniec łańcucha
  Poziom 2: antimatter_cells wymaga surowców → OK, koniec łańcucha

Auto-produkcja:
  1. quantum_cores ×2      (2 FP)  ← auto
  2. antimatter_cells ×2   (1 FP)  ← auto
  3. warp_cores ×1         (2 FP)  ← cel gracza

Gracz widzi:
  ⛓ Łańcuch produkcji dla warp_cores:
    quantum_cores      0/2  ▶▶
    antimatter_cells   0/2  ▶
    → gotowe do warp_cores za ~16 lat
```

Dla T3 (typowy mid-game):
```
Gracz chce: propulsion_systems (T3)
  Receptura: Fe:10, Ti:8 + 3×structural_alloys + 2×power_cells

  structural_alloys (T1): Fe:8, C:4 → surowce, koniec
  power_cells (T2): Li:6, Cu:4, Si:2 → surowce, koniec

Auto-produkcja:
  1. structural_alloys ×3  (1 FP)  ← auto
  2. power_cells ×2        (1 FP)  ← auto
  3. propulsion_systems ×1 (1 FP)  ← cel gracza
```

---

## Implementacja — zmiany w kodzie

### FactorySystem — nowe pola (per kolonia, serialize/restore)

```js
_mode: 'manual'                          // 'manual' | 'priority' | 'reactive'
_priorityList: []                        // [{ commodityId, stockTarget, order }]
_autoChainQueue: []                      // [{ commodityId, qty, forCommodityId, produced }]
_customTemplates: []                     // [{ name, items: [{commodityId, stockTarget}] }]
_reactiveSourceOrder: [                  // kolejność źródeł (reaktywny)
  'build', 'fuel', 'consumption', 'trade', 'safety_stock'
]
```

### FactorySystem — nowe metody

```js
// Zarządzanie trybem
setMode(mode)                            // przełącz tryb, konwertuj alokacje
getMode()                                // zwróć aktualny tryb

// Tryb priorytetowy
addPriority(commodityId, stockTarget)    // dodaj na koniec listy
removePriority(commodityId)              // usuń z listy
reorderPriority(fromIdx, toIdx)          // zmień kolejność (drag & drop)
setPriorityTarget(commodityId, target)   // zmień cel zapasu
applyTemplate(templateId)               // załaduj szablon (predefiniowany lub custom)
saveCustomTemplate(name)                 // zapisz aktualną listę jako szablon
deleteCustomTemplate(index)              // usuń custom szablon

// Auto-łańcuch (wewnętrzne)
_resolveChain(commodityId, qty)          // rekurencyjnie znajdź brakujące składniki
_updateAutoChain()                       // aktualizuj tymczasową kolejkę łańcucha
_getChainFPLimit()                       // max 50% FP na auto-łańcuch

// Tryb reaktywny (wewnętrzne)
_scanDemand()                            // skanuj 5 źródeł zapotrzebowania
_reactiveAllocate()                      // alokuj FP wg zapotrzebowania
_getBuildDemand()                        // commodities potrzebne do budowy
_getFuelDemand()                         // power_cells potrzebne do tankowania
_getConsumptionDemand()                  // consumer goods na 5 lat
_getTradeDemand()                        // towary generujące Kredyty
_getSafetyStockDemand()                  // minimalne zapasy

// Alokacja (wspólne)
_autoAllocate()                          // tryb priorytetowy — główny alokator
```

### EventBus — nowe zdarzenia

```
factory:modeChanged { colonyId, mode }
factory:priorityChanged { colonyId, list }
factory:chainStarted { commodityId, forCommodityId, qty }
factory:chainCompleted { commodityId, forCommodityId }
factory:demandDetected { source, commodityId, qty }      // reaktywny
factory:warning { colonyId, text }                        // ostrzeżenie (brak surowca)
factory:suggestion { colonyId, textPL, textEN }           // wskazówka
```

### EconomyOverlay — zmiany UI

1. **Pasek trybów**: 3 przyciski na górze sekcji fabryki
2. **Panel priorytetowy**: lista z drag-handle (≡), cel, FP, status, sekcja ⛓ łańcuch
3. **Panel reaktywny**: tabela źródeł (read-only), ostrzeżenia, wskazówki
4. **Panel manualny**: bez zmian (obecny UI)
5. **Modal szablonów**: lista predefiniowanych + custom, podgląd zawartości

### SaveMigration

Nowe pola per kolonia w `c4x.colonies[].factory`:
```js
{
  mode: 'manual',
  priorityList: [],
  autoChainQueue: [],
  customTemplates: [],
  reactiveSourceOrder: ['build','fuel','consumption','trade','safety_stock']
}
```

---

## Gameplay — kiedy gracz używa którego trybu

| Faza gry | Fabryki | Zalecany tryb | Dlaczego |
|----------|---------|---------------|----------|
| Wczesna (1-2 FP) | 1 fabryka | Manual | Mało towarów, łatwo ogarnąć |
| Wczesna-średnia | 2-3 FP | Priorytet + szablon "Rozbudowa" | 1 klik → gotowa lista |
| Średnia (multi-kolonia) | 3-5 FP × 2-3 kolonie | Priorytet na głównej, Reaktywny na reszcie | Główna = kontrola, reszta = autopilot |
| Późna (endgame) | 8+ FP | Priorytet z auto-łańcuchem | Cel: warp_cores, system sam produkuje T1→T4 |

### Redukcja kliknięć — konkretne scenariusze

**Scenariusz: "Chcę zbudować 3 statki naukowe"**

Teraz (manual):
1. Sprawdź recepturę science_vessel w stoczni
2. Oblicz ile potrzebujesz structural_alloys, power_cells, electronic_systems
3. Alokuj FP na structural_alloys, ustaw target +15 → 3 kliknięcia
4. Alokuj FP na power_cells, ustaw target +6 → 3 kliknięcia
5. Alokuj FP na electronic_systems, ustaw target +6 → 3 kliknięcia
6. Czekaj, potem ręcznie przealokuj FP na inne → 3+ kliknięć
**= ~12+ kliknięć, ciągłe sprawdzanie**

Z trybem priorytetowym + auto-łańcuch:
1. Dodaj na listę: power_cells cel:10, electronic_systems cel:8, structural_alloys cel:20
**= 3 kliknięcia, system robi resztę**

Z trybem reaktywnym:
1. Dodaj statki do kolejki stoczni → system SAM produkuje co trzeba
**= 0 dodatkowych kliknięć na fabrykę**

---

## Dlaczego to dobra koncepcja

1. **Stopniowa automatyzacja** — gracz sam wybiera ile kontroli oddaje (Manual → Priorytet → Reaktywny)
2. **Zero utraty kontroli** — tryb manualny bez zmian, zawsze dostępny
3. **Auto-łańcuch** — największa oszczędność kliknięć (T5 wymaga ~8 towarów w łańcuchu, system sam to rozwiązuje)
4. **Reaktywny = "ustaw i zapomnij"** — idealny dla kolonii pobocznych
5. **Szablony** — szybki start bez pamiętania 21 receptur
6. **Wskazówki** — system uczy gracza (brak Ti? zbuduj kopalnię!)
7. **Kompatybilność** — rozszerza FactorySystem, nie przepisuje go
8. **Emergentne napięcie** — gracz nie decyduje ILE wyprodukować, ale CO jest ważniejsze (priorytet vs. brak surowców = ciekawe dylematy)
