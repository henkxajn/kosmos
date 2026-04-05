# KOSMOS — POP Strata + Loyalty & Cultural Identity System
## Plan projektowy (alternatywa do social vectors)

**Data**: 2026-03-23
**Zastępuje**: poprzedni plan z abstract social vectors

---

## Diagnoza problemu z wektorami

W poprzednim planie kolonia miała `socialVectors.politicalOrientation = 20` jakby to była właściwość terenu. To jest odwrócenie logiki. Orientacja polityczna **wyłania się z tego, kim są ludzie i jakie mają interesy materialne**.

Pytanie: *"Dlaczego kolonia jest separatystyczna?"*
Zła odpowiedź: *"Bo jej culturalIdentity > 70"*
Dobra odpowiedź: *"Bo 60% POPów to górnicy których minerały od 20 lat wysyłamy do centrum, mają gorsze zasoby niż inne kolonie, i żyli przez dwie katastrofy bez pomocy z zewnątrz"*

**Wektory muszą być POCHODNĄ, nie WEJŚCIEM.**

---

## Fundament: POP ma TYP

Kluczowa zmiana: każdy POP ma przypisany typ odzwierciedlający **co robi w kolonii**. Nie zmienia to liczby POPów — 5 POPów to nadal 5 POPów, ale teraz: `{laborer: 2, miner: 2, scientist: 1}`.

### Typy POPów i ich budynki źródłowe

| Typ POP | Skąd pochodzi (budynki) | Co go napędza | Główny interes |
|---------|------------------------|---------------|----------------|
| **Laborer** (Robotnik) | farm, well, habitat | food/water ratio, housing | Przeżycie biologiczne |
| **Miner** (Górnik) | mine, smelter | mine productivity, wydobycie nie odpływa do centrum | "Owoce naszej pracy są nasze" |
| **Worker** (Pracownik) | factory, consumer_factory | commodity output, brak brownout | Stabilność zatrudnienia |
| **Scientist** (Naukowiec) | research_station, observatory | research rate, dostęp do wiedzy | Wolność intelektualna |
| **Merchant** (Kupiec) | trade_hub, free_market, trade_beacon | credits per year, otwarte trasy handlowe | Wolny przepływ |
| **Engineer** (Inżynier) | shipyard, nuclear_plant | zaawansowane budynki działają sprawnie | Techniczna doskonałość |
| **Bureaucrat** (Urzędnik) | admin_office, imperial_hall | porządek, governance | Centralny ład |

### Przypisanie POPa do typu

Nowy POP (narodzony przez `civ:popBorn`) dostaje typ na podstawie **najbardziej potrzebnego pracownika w kolonii**:

```javascript
// Przy narodzinach POPa:
// Policz "niedobór" każdego typu: (ile budynków danej kategorii × popCost) - (ile POPów już tam pracuje)
// Nowy POP trafia do kategorii z największym niedoborem
// Remisy: losowo z top-2

// Przykład: kolonia ma 3 kopalnie (każda potrzebuje 0.25 POP) i 1 farmę
// Niedobór miner: 0.75 (3×0.25 - obecni miners)
// Niedobór laborer: 0.25 (1×0.25 - obecni laborers)
// → nowy POP = Miner
```

**Gdy budynek rozbiórka**: POPy bez przypisania stają się Laborers (bezrobotni freelancerzy) — najbardziej elastyczny typ, ale najniższe zadowolenie bez budynków.

---

## Satisfakcja per Typ — skąd powstaje orientacja

Zamiast abstract vectors, każdy typ POP oblicza własną **satisfakcję** z 3-4 czynników fizycznych z gry:

### Satisfakcja Górnika (Miner Satisfaction)

```
Czynniki:
  A) mine_efficiency       = (aktualna produkcja / maks możliwa) × 100
  B) food_security         = min(foodRatio, 1) × 100
  C) extraction_resentment = max(0, exportsToCenter - importsFromCenter)
     → penalty: min(50, extractionRatio × 30)
  D) housing_comfort       = min(housing / population, 1.5) × 50

minerSatisfaction = A×0.30 + B×0.35 - C×0.25 + D×0.10
```

### Satisfakcja Kupca (Merchant Satisfaction)

```
  A) credits_flow  = clamp(creditsPerYear / 10, 0, 100)
  B) trade_access  = (activeTradeRoutes / 3) × 100
  C) trade_freedom = tradeOverrides.isolation ? 0 : 100
  D) market_quality = (freeMarketLevel × 20 + tradehubLevel × 15)

merchantSatisfaction = A×0.25 + B×0.35 + C×0.25 + D×0.15
```

### Satisfakcja Naukowca (Scientist Satisfaction)

```
  A) research_output  = clamp(researchPerYear / 20, 0, 100)
  B) library_access   = libraryLevel × 20 (cap 100)
  C) empire_connection = hasTradeRouteWithResearch ? 80 : 40
  D) academic_freedom  = culturalIdentity > 40 ? 90 : 60

scientistSatisfaction = A×0.40 + B×0.20 + C×0.20 + D×0.20
```

### Satisfakcja Robotnika (Laborer Satisfaction) — biologiczna

```
  A) food_ratio    = min(foodStock / (population × 3), 1) × 100
  B) water_ratio   = min(waterStock / (population × 1.5), 1) × 100
  C) housing_comfort = min(housing / population, 1.2) × 100
  D) energy_access = energyBalance >= 0 ? 100 : max(0, 100 + energyBalance × 10)

laborerSatisfaction = A×0.40 + B×0.25 + C×0.20 + D×0.15
```

---

## Loyalty jako wypadkowa satisfakcji — nie abstract float

```javascript
// Weighted average satisfakcji, gdzie waga = liczba POPów danego typu
colonyLoyalty = sum(typeCount[t] × typeSatisfaction[t]) / totalPOP

// Plus modyfikatory historyczne (jednorazowe, zanikają w czasie):
// +20 → centrum wysłało statki z pomocą podczas kryzysu
// −15 → centrum zamknęło trasy handlowe
// +10 → gracz zainwestował w kolonie (aid package)
// −20 → katastrofa bez odpowiedzi centrum przez >2 lata
```

**Co to znaczy dla gracza**: jeśli widzisz że loyalty spada, możesz ZDIAGNOZOWAĆ:
- *"Mam 4 Górników i ich satisfakcja to 18/100 — dlaczego? Bo 80% minerałów idzie do centrum."*
- Nie ma tajemniczego "loyalty −2/rok". Jest konkretna przyczyna.

---

## Cultural Identity jako historia dominujących typów

Identity NIE jest prostym floatem. Jest **kompozytem historii kolonii**.

### Rdzeń tożsamości (Identity Core)

Kolonia zbiera `identityEvents[]` — permanentną historię znaczących momentów:

```javascript
identityEvents: [
  { type: 'founding',              year: 2150, content: 'Pierwsi osadnicy przybyli z centrum' },
  { type: 'disaster_survived_alone', year: 2180, content: 'Meteor przeżyty bez pomocy centrum' },
  { type: 'revolution_won',        year: 2210, content: 'Rewolucja Górnicza — Związek Robotniczy Alfa' },
  { type: 'trade_boom',            year: 2240, content: 'Otwarcie hubu handlowego — 3 trasy w 5 lat' },
]
```

### Wagi identity eventów

| Zdarzenie | Waga Identity |
|-----------|--------------|
| `founding` | 0 (base) |
| `disaster_survived_alone` | +12 |
| `revolution_won` | +20 |
| `revolution_crushed` | +8 (trauma buduje tożsamość) |
| `reform_negotiated` | +10 |
| `trade_boom` | −5 (integracja z imperium) |
| `aid_received` | −8 (centrum pomogło = więź) |
| `isolation_decade` | +6 per dekada izolacji |
| `cultural_center_built` | +7 |
| `cultural_trait_acquired` | +5 |

**Identity Score** (0–100) = suma wag wszystkich zdarzeń w historii kolonii.

**Charakter tożsamości** = zdominowany przez typ POPów z najwyższą historyczną wagą:
- Górnicze zdarzenia dominują → kolonia identyfikuje się jako "Robotnicza"
- Handlowe zdarzenia → "Kosmopolityczna"
- Naukowe → "Akademicka"

---

## REWOLUCJE — centralny mechanizm dramatyczny

Rewolucje nie są "złymi wydarzeniami do zduszenia" — to **kryzysy które tworzą tożsamość i zmieniają kolonie trwale**.

### Fazy Rewolucji

#### Faza 1: Niezadowolenie (Discontent)
**Trigger**: którykolwiek typ POP ma satisfakcję < 30 przez ≥ 3 lata

```
EventLog: ⚠ "Górnicy Kolonii [Alpha-3] są niezadowoleni (satisfakcja 22/100).
           Przyczyna: Eksploatacja — 85% minerałów odpływa do centrum od 15 lat."
```
UI: mała ikona 🔥 na kolonii w empire view. Tooltip z diagnostyką.

#### Faza 2: Ruch Społeczny (Movement)
**Trigger**: satisfakcja < 20 przez kolejne 3 lata, lub satisfakcja < 10 przez 1 rok

MissionEventModal (pauza gry):

```
╔══════════════════════════════════════════════════════════╗
║  RUCH SPOŁECZNY — KOLONIA ALPHA-3                       ║
║                                                          ║
║  Związek Robotniczy Alfa-3 (3 POPy Górnicze)            ║
║  ogłosił STRAJK GENERALNY.                              ║
║                                                          ║
║  Ich żądania:                                           ║
║  ⛏ "Zatrzymać 50% wydobycia mineralnego lokalnie"       ║
║  🍎 "Zapewnić żywność: deficyt trwa 12 lat"             ║
║  🏠 "Zbudować 2 Habitaty w ciągu 10 lat"               ║
║                                                          ║
║  Produkcja górnicza: WSTRZYMANA (dopóki brak decyzji)  ║
║                                                          ║
║  Siła ruchu: ████░░  3/5 POPów popiera strajk          ║
║                                                          ║
║  [NEGOCJUJ]         [ZIGNORUJ]         [STŁUM SIŁĄ]    ║
╚══════════════════════════════════════════════════════════╝
```

| Opcja | Koszt | Efekt natychmiastowy | Efekt długoterminowy |
|-------|-------|---------------------|---------------------|
| **Negocjuj** | Kredyty, czas, zasoby | Strajk kończy | Cultural Trait + loyalty +15, identity +10 |
| **Zignoruj** | Brak | Produkcja −50% przez 5 lat | Ruch rośnie → Faza 3 |
| **Stłum** | Wymaga defense lv2+ | Produkcja wraca | Loyalty −20, identity +15, risk Faza 3 |

#### Faza 3: Rewolucja (Revolution)
**Trigger**: Zignorowanie Fazy 2 przez 5 lat, LUB Stłumienie + satisfakcja nadal < 15

```
╔══════════════════════════════════════════════════════════╗
║  ⚡ REWOLUCJA NA ALPHA-3!                               ║
║                                                          ║
║  Związek Robotniczy przejął kopalnie i stację energetyczną║
║                                                          ║
║  Siła rewolucjonistów: 3 POPy Górnicze + 1 Laborer     ║
║  Twoje siły obronne: 2× defense_tower (lv2)             ║
║  Szansa stłumienia militarnego: ~38%                    ║
║                                                          ║
║  [WYŚLIJ WOJSKO]       szansa 38%, −30 loyalty trwałe  ║
║  [UZNAJ ICH RZĄD]      → Protektorat (+12 lat do secesji)║
║  [NEGOCJUJ FEDERACJĘ]  −podatki 30%, +loyalty +25      ║
║  [POZWÓL ODEJŚĆ]       kolonia niezależna, możliwy     ║
║                         powrót jako sojusznik           ║
╚══════════════════════════════════════════════════════════╝
```

#### Faza 4: Aftermath — Cultural Traits

| Zakończenie | Identity Event | Cultural Trait | Efekty trwałe |
|-------------|---------------|---------------|---------------|
| Stłumiono militarnie | "Krwawe Stłumienie Górnicze" | **Martyrs' Colony** | +10% produkcja, loyalty −25 trwale, separatyzm ×2 |
| Uznano rząd | "Rewolucja Robotnicza" | **Workers' Republic** | +15% mining, wymaga prosperity ≥ 40 |
| Negocjacja federacji | "Pakt Reformatorów" | **Reform Heritage** | +8% all production, loyalty stable, identity +10 |
| Pozwolono odejść | "Wolne Miasto [nazwa]" | Kolonia = NPC entity | Handel jako niezależny partner |
| Negocjacja w Fazie 2 | "Wielki Strajk [rok]" | **Labor Compact** | +5% mining, coroczny satisfakcja check |

---

## Różne typy rewolucji

### Rewolucja Kupiecka (Merchants niezadowoleni)
```
"Gildia Kupców ogłasza Bojkot Handlowy"
Żądania: Otwarcie tras handlowych / Zniesienie ceł / Budowa commodity_nexus
Efekt sukcesu: "Free Trade Charter" — trwały bonus do kredytów
Efekt porażki: Merchants emigrują (tracisz ekspertów handlowych)
```

### Rewolucja Naukowa (Scientists niezadowoleni)
```
"Instytut Naukowy Ogłasza Autonomię Akademicką"
Żądania: Zwiększ budżet badań / Zezwól na niezależne ekspedycje / Buduj biblioteki
Efekt sukcesu: "Academic Republic" — +30% research
Efekt stłumienia: Naukowcy emigrują → tracisz research na dekady
```

### Bunt Robotniczy (Laborers + głód)
```
"Głodowe Zamieszki" — najszybciej eskaluje (biologiczne przyczyny)
Nie ma czasu na negocjacje: 1 rok od wystąpienia
Żądania: Jedzenie TERAZ. Budujesz farmy lub wysyłasz żywność z innej kolonii.
Efekt porażki: POPy umierają, loyalty −40, identity +20
```

### Ruch Separatystyczny (wysoka Identity + niska Loyalty)
```
Najpoważniejszy — cross-type coalition
Wymaga: identityScore > 55 I loyaltyScore < 35 I ≥ 1 identityEvent z rewolucji
Nie da się stłumić bez poważnych konsekwencji jeśli siła ruchu > 60%
```

### Kontrewolucja Lojalistyczna (rzadka)
```
Trigger: znaczna mniejszość bardzo lojalnych POPów (np. Bureaucrats) wśród separatystów
"Milicja Imperialna ogłasza mobilizację przeciw separatystom"
Kolonia wchodzi w wewnętrzny konflikt — gracz może "wesprzeć" jedną ze stron
```

---

## Spójny model emergencji

```
MATERIALNE WARUNKI (zasoby, budynki, trasy handlowe)
        │
        ▼
SATISFAKCJA per TYP POPu (Miner/Merchant/Scientist/...)
        │                          │
        │                          ▼
        │              RUCH SPOŁECZNY (gdy satisfakcja < próg przez N lat)
        │                          │
        ▼                          ▼
LOYALTY = weighted avg       REWOLUCJA (gdy ruch ignorowany)
  satisfakcji typów                │
                                   ▼
                         IDENTITY EVENT (trwały wpis historyczny)
                                   │
                                   ▼
                         IDENTITY SCORE = suma wag eventów
                                   │
                                   ▼
                         CULTURAL TRAIT (gdy identity > próg + dominant type)
                                   │
                                   ├──→ Modyfikuje satisfakcję typów (sprzężenie)
                                   ├──→ Modyfikuje podatność na przyszłe ruchy
                                   └──→ Daje permanentny efekt ekonomiczny
```

### Stany sprzężenia Identity ↔ Loyalty

| Identity | Loyalty | Stan kolonii |
|----------|---------|-------------|
| Wysoka | Wysoka | **Proud Autonomy** — najlepsza kolonia |
| Wysoka | Niska | **Separatyzm** — rewolucja nieuchronna |
| Niska | Wysoka | **Lojalna zależność** — stabilna, ale bez ducha |
| Niska | Niska | **Zaniedbana** — apatia, brak produktywności |

---

## Skala POPów — bez arbitralnego limitu

POP typy są **licznikami, nie instancjami**:

```javascript
popComposition: {
  laborer:    8,
  miner:     12,
  worker:     5,
  scientist:  3,
  merchant:   2,
  engineer:   2,
  bureaucrat: 1,
  // total: 33 (= this.population)
}
```

Przy 200 POPach to nadal tani obiekt O(7 typów). Wyższa populacja = bogatsze relacje:
- 4 Merchantów = szmer. 20 Merchantów = potężna Gildia
- Siła rewolucji skaluje się z licznikiem niezadowolonych POPów

### Nowa skala epok

| Epoka | Próg POPów | Nowe mechaniki |
|-------|-----------|----------------|
| Pierwotna | 0 | Baza |
| Industrialna | 10 | Factories, pierwszy ruch robotniczy możliwy |
| Kosmiczna | 30 | Rewolucje cross-type, separatyzm możliwy |
| Międzyplanetarna | 80 | Federacje, pełny system polityczny |
| Galaktyczna | 200 | (przyszłość) Cywilizacja Type II |

---

## Integracja z istniejącymi systemami

### → ProsperitySystem
- Prosperity = `averageTypeSatisfaction × 0.7 + materialWellbeing × 0.3`
- Różne typy POPów reagują na różne aspekty prosperity
- Ten sam prosperity=60 w kolonii Kupców bez tras handlowych = niska satisfakcja Kupców

### → RandomEventSystem
Każde zdarzenie losowe ma typ POPu który na nie reaguje:
- `meteor_shower` → Miner satisfaction −20, Laborer −10
- `mining_accident` → Miner −20 (nowy event)
- `trade_fair` → Merchant +15 (nowy event)
- `academic_conference` → Scientist +20 (nowy event)
- Zdarzenie `colonial_revolt` = wynik rewolucji, nie random event

### → ColonyManager / Migracja
Migracja reaguje na typ POPu:
- Niezadowoleni Kupcy emigrują szybciej (mają środki i kontakty)
- Laborers emigrują najwolniej (przywiązani do miejsca)
- Naukowcy tworzą Ruch zamiast emigrować (mają wpływ intelektualny)

Nowy mechanizm: **type-specific immigration**
- Kolonia z wieloma Trade Hubs przyciąga Kupców
- Kolonia z wieloma Research Stations przyciąga Naukowców

### → TradeRouteManager / CivilianTradeSystem
- Trasa aktywna do zamożnej kolonii → Merchant satisfaction +20
- Trasa zamknięta przez gracza → Merchant satisfaction −25
- Import luxury goods → Laborer satisfaction +5

### → BuildingSystem
- Zburzenie kopalni gdy 5 Miners → `type reassign to laborer` → satisfakcja spada
- Budowa Trade Hub → nowy POP przy narodzinach = Merchant
- Budowa Library → Scientist satisfaction +15 (bez nowych Naukowców)

### → VesselManager / ExpeditionSystem
- Ekspedycja naukowa → Scientist satisfaction +10
- Ekspedycja górnicza → Miner satisfaction +5
- Ekspedycja trade/recon → Merchant satisfaction +8

---

## Nowe budynki dopasowane do typów

```javascript
admin_office: {
  namePL: 'Biuro Administracyjne', nameEN: 'Admin Office',
  category: 'governance',
  icon: '🏢',
  popCost: 0.25,
  popType: 'bureaucrat',        // budynek "tworzy" Bureaucrats przy narodzinach
  effects: {
    loyaltyStabilization: +0.1, // loyalty zmienia się wolniej
    governanceBonus: +15,
    revolutionResistance: +10,  // próg wymagany do rewolucji wyższy
  }
},

trade_union_hall: {
  namePL: 'Dom Związkowy', nameEN: 'Trade Union Hall',
  category: 'culture',
  icon: '✊',
  // Kontrowersyjny: gracz może go wybudować jako "zawór bezpieczeństwa"
  // lub pojawia się jako konsekwencja negocjacji rewolucji
  popType: 'laborer',
  effects: {
    laborerSatisfaction: +20,
    movementThreshold: +10,          // potrzebują więcej niezadowolenia żeby wystąpić
    revolutionDamageReduction: -0.3, // ruch jest mniej gwałtowny
    allProduction: -0.05,            // minus: pracownicy mają prawa → mniej wydajni chwilowo
  }
},
```

---

## Zmiany w kodzie

### Zostaje bez zmian
- Liczba POPów (integer) w CivilizationSystem
- Mechanizm wzrostu (`_growthProgress`)
- Mechanizm głodu/śmierci
- Epoki civilizacyjne
- Wszystkie istniejące budynki i ich rates

### Dodaje się

```
CivilizationSystem:
  + popComposition: { laborer, miner, worker, scientist, merchant, engineer, bureaucrat }
  + popSatisfaction: { [type]: 0-100 }
  + identity: { score: 0-100, events: [], dominantType: string }
  + loyalty: number (0-100, computed from satisfaction)
  + activeMovements: []

ColonyManager:
  + per-colony: identityEvents[], loyaltyHistory[], tradeBalance

Nowe EventBus zdarzenia:
  'civ:movementStarted { colony, type, demands }'
  'civ:revolutionBegan { colony, type, strength }'
  'civ:revolutionResolved { colony, outcome, trait }'
  'civ:identityEventAdded { colony, event }'
  'civ:popTypeSatisfactionChanged { type, satisfaction }'
```

### SaveMigration
v25 → v26, defaults:
- `loyalty = 80`
- `identity = { score: 0, events: [], dominantType: 'laborer' }`
- `popComposition` obliczany z istniejących buildings przy migracji

---

## Porównanie: stary plan vs. nowy

| Aspekt | Stary plan (Wektory) | Nowy plan (POP Strata + Revolution) |
|--------|---------------------|--------------------------------------|
| Orientacja polityczna | Etykieta przypisana | Wyłania się z typów POPów i historii |
| Loyalty | Abstract float z penalty | Weighted average satisfakcji typów |
| Identity | Akumulator z bonusami | Suma identityEvents (konkretna historia) |
| Dramatyzm | Eventy tekstowe | Rewolucje: wybory, konsekwencje, traits |
| Diagnoza gracza | "Loyalty −2/rok ???" | "Miner satisfaction 18: bo eksploatacja" |
| Replayability | Kolonie różnią się liczbowo | Kolonie mają INNE OSOBOWOŚCI (historia) |
| Fundament polityczny | Wymyślone stronnictwa | Stronnictwa = agregaty typów z realnymi interesami |

---

## Przykład emergencji — Kolonia Alpha-3 (rok 2280)

```
Skład: 12 Górników (60% populacji) + 5 Laborers + 2 Scientists + 1 Merchant

Historia identityEvents:
  2240: disaster_survived_alone (+12) — wybuch wulkanu bez pomocy centrum
  2260: revolution_crushed (+8)      — Krwawe Stłumienie Górnicze

Aktualne:
  Miner satisfaction: 22/100 — bo 90% Fe wysyłane do centrum
  Laborer satisfaction: 61/100 — jedzenie OK, housing ciasno
  Loyalty: weighted avg = 12×22 + 5×61 + 2×55 + 1×70 / 20 = ~33/100
  Identity: 20 (suma eventów)

Stan: identityScore=20 < 55 — brak pełnego separatyzmu YET
      loyalty=33 — niebezpiecznie niska
      Aktywny ruch: "Związek Robotniczy Alfa-3" (Faza 2)

Diagnoza: Ta kolonia ma historię, traumę i rosnącą tożsamość.
          Wiesz DLACZEGO tu jesteś. I co musisz zrobić.
```

---

## Powiązanie z przyszłym systemem Politics & Government

Ten system jest **fundamentem** pod:
- **Separatyzm**: High Identity + Low Loyalty → ruch separatystyczny
- **Government type**: dominantType POPów w kolonii sugeruje system rządów
  - Bureaucrats dominant → Authoritarian (lojalny, mało innowacyjny)
  - Scientists dominant → Technocracy (badania premium, słaby handel)
  - Merchants dominant → Oligarchy (handel premium, niestabilny politycznie)
  - Laborers dominant → People's Republic (produkcja stabilna, oporni na rozkazy centrum)
- **Federal systems**: kolonie z Reform Heritage tworzą naturalnych kandydatów do federacji
- **Elections/Referenda**: gdy polityczny system dojrzeje, wynik głosowania = funkcja composition × satisfaction
