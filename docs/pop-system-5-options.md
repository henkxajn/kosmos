# KOSMOS — 5 Propozycji Przeprojektowania Systemu POPów

**Data**: 2026-03-23
**Kontekst**: Przeprojektowanie pod nowy system Loyalty, Cultural Identity i Traits
**Powiązany plik**: `docs/pop-strata-loyalty-identity-plan.md`

---

## Obecny system — problemy

- `_growthProgress` akumuluje 0→1.0, potem `population += 1` — nagły skok
- Budynki kosztują 0.25–0.5 POP, ale POPy są integerami → "czekam na 4 kopalnie żeby wchłonęły 1 POP"
- Typy POPów (nowy plan) muszą być przypisywane po fakcie, nie są natywne
- Rewolucja oparta na "N Górnikach" traci sens gdy górnicy to ułamki integera
- Brak organicznego powiązania wzrostu z tym co się buduje

---

## Option 1: Fractional POP 0.1 (ewolucyjna)
**Filozofia: "minimalna zmiana, maksymalny zysk"**

1 POP = 100,000 ludzi. Wzrost +0.1/cykl. Budynki kosztują 0.1–0.5.

```javascript
// Zmiana w BuildingsData:
mine:        popCost: 0.10   // 10,000 pracowników
farm:        popCost: 0.10
solar_farm:  popCost: 0.10
factory:     popCost: 0.25   // 25,000 pracowników
habitat:     popCost: 0.10
shipyard:    popCost: 0.50   // 50,000 inżynierów

// Wzrost w CivilizationSystem:
// if (_growthProgress >= 0.1) { population += 0.1; _growthProgress -= 0.1; }

// UI:
// "Populacja: 7.3 POP (730 tys. mieszkańców)"
```

**Dla nowego systemu Loyalty/Identity:**
Typy POPów działają na floatach. "2.7 Górników" = 270,000 górników — sensowna frakcja robocza.
Rewolucja: `"Związek Górniczy Alpha-3 (2.7 POP, 34% populacji) — satisfakcja 22"` — ma sens.

| Ocena | |
|--|--|
| ✅ Złożoność | Minimalna zmiana kodu, działa z całą resztą |
| ✅ Granulacja | Budynki zapełniają się płynnie |
| ✅ Czytelność | 1 POP = 100k to zrozumiała abstrakcja |
| ❌ Dramatyzm | Traci event "Nowy POP narodzony!" — teraz +0.1 cicho |
| ❌ UI | "7.3 POP" wygląda niezręcznie |
| ❌ Edge cases | Float comparison w save/restore wymaga ostrożności |

**Kiedy wybrać**: gdy chcemy szybką implementację (80% korzyści za 20% wysiłku).

---

## Option 2: Dwuwarstwowy — Ludność + Siła Robocza
**Filozofia: "populacja jest narracją, siła robocza jest mechaniką"**

Dwie oddzielne liczby: `population` (ciągła, rośnie procentowo) i `workforce` (integer jednostek roboczych).

```javascript
population:      450_000,   // prawdziwa liczba ludzi (rośnie %)
workforce:       4,         // floor(population / WORKERS_PER_POP) = floor(450k / 100k) = 4
idle:            1,         // workforce - employed = napięcie polityczne
WORKERS_PER_POP: 100_000    // 100k = 1 jednostka robocza

// Wzrost:
// population += population × growthRate × conditionMult × deltaYears
// workforce = Math.floor(population / WORKERS_PER_POP)  // automatyczny
// deltaWorkforce = workforce - previousWorkforce → civ:popBorn / civ:popDied

// UI:
// "Populacja: 450 tys. (4 jednostki robocze, 1 bezrobotna)"
// "Roczny przyrost: +8,200 ludzi"
```

**Dla nowego systemu:**
`idle workforce units` = bezrobotne jednostki → generują political pressure per typ.
1 bezrobotna jednostka Górnicza = silny impuls do ruchu robotniczego.
Naturalna imigracja: "przyciągam siłę roboczą z Alpha-3" (transfer workforce między koloniami).

| Ocena | |
|--|--|
| ✅ Narracja | "450,000 ludzi" czuje się realnie |
| ✅ Rewolucje | `idle` units = mechaniczny fundament bezrobocia |
| ✅ Wzrost | Procentowy = organiczny, nie gamey |
| ✅ Imigracja | Przenoszenie workforce między koloniami jest naturalne |
| ❌ UI | Dwie liczby do śledzenia i pokazywania |
| ❌ Złożoność | Skomplikowany save/restore dwóch powiązanych wartości |

**Kiedy wybrać**: gdy chcemy naturalną imigrację i realistyczny wzrost bez dużego refaktoru.

---

## Option 3: Czyste Straty — brak ogólnej "populacji"
**Filozofia: "kto jesteś, to jak rośniesz" (najbliżej Victoria 3)**

Nie ma ogólnego `population`. Są tylko straty — każda rośnie niezależnie.

```javascript
strata: {
  laborer:   { count: 3, growthProgress: 0.4, satisfaction: 72 },
  miner:     { count: 5, growthProgress: 0.1, satisfaction: 22 },
  scientist: { count: 1, growthProgress: 0.7, satisfaction: 61 },
  merchant:  { count: 1, growthProgress: 0.0, satisfaction: 45 },
  engineer:  { count: 0, growthProgress: 0.0, satisfaction: 50 },
  bureaucrat:{ count: 0, growthProgress: 0.0, satisfaction: 50 },
}
// totalPop = sum(strata.count) = 10
```

**Reguły wzrostu per strata:**
- Strata górnicza rośnie gdy: `mineCount > 0 AND foodRatio > 0.5 AND housing > totalPop AND minerSatisfaction > 40`
- Strata górnicza kurczy się gdy: `mineCount === 0` (emigracja zawodowa) OR `satisfaction < 15` przez 5+ lat
- Strata naukowa rośnie tylko gdy: `researchBuildings > 0 AND researchOutput > 10/year`
- Strata kupiecka rośnie gdy: `activeTradeRoutes > 0 AND creditsPerYear > 5`

**Budynki nie kosztują POPów.** Zamiast tego mają `laborType`:
- `mine: { laborType: 'miner', laborPerBuilding: 1 }`
- Produkcja = `baseRate × min(1, strataCount / totalDemand)` (efektywność obsady)
- Nadmiar straty → surplus workers → satisfaction +bonus, OR overflow do laborers

```
UI: "Populacja: 10 POP
      ⛏ Górnicy     5 (50%)  ████░░  satisfakcja 22  ↘ emigracja
      🌾 Robotnicy  3 (30%)  ██████  satisfakcja 72  ↑ rośnie
      🔬 Naukowcy   1 (10%)  ████░   satisfakcja 61  → stabilna
      💰 Kupcy      1 (10%)  ████    satisfakcja 45  → stabilna"
```

**Dla Identity:** Strata IS jej typem — nie potrzeba przypisania. Strata górnicza z 20 latami niskiej satisfakcji → Identity górnicza rośnie organicznie. Rewolucja: strata osiągnęła masę krytyczną + satisfakcja krytycznie niska.

| Ocena | |
|--|--|
| ✅ Typy natywne | Nie przypisywane — wynikają z budynków i historii |
| ✅ Rewolucja | Designowo wbudowana: strata o niskiej satisfakcji = ruch |
| ✅ Narracja | "Klasa kupiecka szybko rośnie" = organiczna historia |
| ✅ Samoregulacja | Strata kurczy się bez pracy (emigracja) |
| ✅ Identity | Powiązanie z dominującą stratą jest bezpośrednie |
| ❌ Refactor | Największy: BuildingSystem, housing, konsumpcja |
| ❌ Kontrola | Gracz nie "przypisuje POP do roli" ręcznie |
| ❌ Edge cases | Co gdy wszystkie straty rosną jednocześnie? Limit housing |

**Kiedy wybrać**: gdy mamy czas na duży refaktor i chcemy najgłębszy system.

---

## Option 4: Pula Siły Roboczej — ciągły float
**Filozofia: "płynność zamiast dramatyzmu"**

Całkowite porzucenie dyskretnych POPów. `workforce` to jeden float.

```javascript
workforce:   7.3,   // jednostki pracy (rośnie %)
laborDemand: 6.2,   // suma laborCost wszystkich budynków
laborRatio:  1.18,  // workforce / laborDemand

// Wzrost logistyczny:
// workforce += workforce × growthRate × (1 - workforce/carryingCapacity) × conditionMult × dt

// Skutki laborRatio:
// > 1.3:  nadmiar → loyalty -5/year (frustracja), merchant satisfaction +10
// 1.0-1.3: optymalny
// 0.7-1.0: niedobór → production = laborRatio × baseProduction
// < 0.7:  kryzys → severe penalty + random event trigger
// < 0.4:  kolaps produkcji

// UI: "Siła robocza: 7.3 (zapotrzebowanie: 6.2, nadwyżka: 1.1)"
```

**Dla nowego systemu:**
Typy = `typeDistribution` (procenty z puli, automatycznie obliczane z budynków).
Rewolucja gdy: typ ma niską satisfakcję AND reprezentuje > 25% workforce przez 3+ lata.

| Ocena | |
|--|--|
| ✅ Prostota | 1 float, prosta matematyka |
| ✅ Płynność | Brak nagłych skoków, brak "czekam na POP" |
| ✅ laborRatio | Elegancki mechanics shortage/surplus |
| ❌ Dramatyzm | "Straciłeś 0.3 workforce" vs "POP umarł z głodu" — brak wagi narracyjnej |
| ❌ Eventos | Trudno opowiedzieć historię przez floaty |
| ❌ Ryzyko | Gra może czuć się jak spreadsheet zamiast narracji |

**Kiedy wybrać**: gdy priorytetem jest balans ekonomiczny, nie narracja.

---

## Option 5: Pokoleniowy — Kohorty Demograficzne
**Filozofia: "historia robi się przez pokolenia"**

Trzy grupy wiekowe z różnymi rolami politycznymi i ekonomicznymi.

```javascript
cohorts: {
  youth: 2,    // 0-20 lat — nie pracują, ROSNĄ, potencjał rewolucyjny
  adult: 5,    // 20-60 lat — pracownicy (tu są typy straty)
  elder: 1,    // 60+ lat — emeryci, żywa pamięć
}
// totalPop = 8

adultTypes: {
  laborer: 2, miner: 2, scientist: 1  // sum = 5 adults
}

// Cykl życia (w latach cywilnych):
// Youth (co ~15 lat) → Adult (przypisany do typu wg zapotrzebowania)
// Adult (po ~40 latach) → Elder
// Elder (po ~15 latach) → umiera naturalnie
// Śmierć: Elder pierwszeństwo podczas głodu/katastrof
```

**Mechanika rewolucyjna pokoleniowej:**
```javascript
youthSatisfaction = 0.6 × hope + 0.4 × opportunity

// hope      = prosperityTrend > 0 ? 80 : 30 (czy kolonia się rozwija?)
// opportunity = freeJobs / adultCount (czy będą miejsca pracy dla dorosłych?)

// Gdy youthSatisfaction < 25 przez 5+ lat:
// → "Pokolenie Gniewu" (trait na danej kohortcie Youth)
// → Po 15 latach (Youth → Adult): te adults mają revolutionary_generation = true
// → Rewolucja wybucha gdy revolutionary_generation adults > 30% dorosłych
```

**Dla Identity:**
Elders = żywa pamięć kolonii. `elderCount > 1` → Identity stabilization (tradycja, ciągłość).
Katastrofa która zabija elderów = utrata Identity (trauma kulturowa, zapomnienie).
`"Starszyzna kolonii przekazuje historię Rewolucji Górniczej młodemu pokoleniu"` → Identity event.

**Przykład fali demograficznej:**
```
Rok 2150: Baby boom (dobre warunki) → +4 Youth
Rok 2165: ci Youth → Adults, szukają pracy
Rok 2165: jeśli brakuje budynków → 40% bezrobocie dorosłych → Rewolucja Pokoleniowa
Rok 2180: następna kohorta Youth (mała, bo kryzys) → 15 lat spokoju
Rok 2195: mała kohorta → niedobór siły roboczej → Wiek Złoty?
```

| Ocena | |
|--|--|
| ✅ Fale | Kryzysy pokoleniowe są naturalne, nie random events |
| ✅ Youth | "Proch rewolucyjny" — historycznie i narracyjnie rezonuje |
| ✅ Elders | Żywa pamięć = piękne powiązanie z Cultural Identity |
| ✅ Momentum | Rewolucja buduje się przez 15 lat — nie jest nagłym eventem |
| ❌ Złożoność | 3 kohorty × N kolonii w state |
| ❌ Opóźnienie | 15-letnie delayed effects mogą frustrować gracza |
| ❌ Scope | Może być over-engineered na obecnym etapie |

**Kiedy wybrać**: gdy narracja i dramatyzm historyczny są priorytetem.

---

## Tabela porównawcza

| Kryterium | Fract. 0.1 | 2-Layer | Pure Strata | Workforce Pool | Kohorty |
|--|:--:|:--:|:--:|:--:|:--:|
| Złożoność implementacji | 🟢 Niska | 🟡 Średnia | 🔴 Wysoka | 🟡 Średnia | 🔴 Wysoka |
| Dramatyzm narracyjny | 🟡 Niski | 🟡 Średni | 🟢 Wysoki | 🔴 Niski | 🟢 Wysoki |
| Integracja z typami POPów | 🟡 Dobra | 🟡 Dobra | 🟢 Natywna | 🟡 OK | 🟡 Dobra |
| Fundament pod rewolucje | 🟡 OK | 🟡 Dobry | 🟢 Doskonały | 🟡 OK | 🟢 Doskonały |
| Spójność z Identity | 🟡 OK | 🟡 Dobra | 🟢 Doskonała | 🟡 OK | 🟡 Dobra |
| Wzrost "czuje się" | 🟡 Skokowo | 🟢 Organicznie | 🟢 Samoregulacja | 🟢 Płynnie | 🟢 Falami |
| Refactor kodu | 🟢 Mały | 🟡 Średni | 🔴 Duży | 🟡 Średni | 🔴 Duży |

---

## Rekomendacja: Hybryd Option 3 + element Option 5

**Pure Strata** jako rdzeń (typy natywne, rewolucja wbudowana, Identity organiczna) + **Youth pre-strata** z Option 5 jako jedyny element kohortowy.

```javascript
strata: {
  youth:      { count: 2, growthProgress: 0.3 },  // nieprzypisani → co 10 lat → typ
  laborer:    { count: 3, growthProgress: 0.4, satisfaction: 72 },
  miner:      { count: 5, growthProgress: 0.1, satisfaction: 22 },
  scientist:  { count: 1, growthProgress: 0.7, satisfaction: 61 },
  merchant:   { count: 1, growthProgress: 0.0, satisfaction: 45 },
}
```

Youth co 10 lat cywilnych → zamienia się w typ o największym zapotrzebowaniu.
To dodaje generational delay do rewolucji bez pełnej kohortowej złożoności.

**Alternatywnie**: jeśli czas jest czynnikiem — Option 1 daje 80% korzyści za 20% wysiłku i jest kompatybilny ze wszystkim co już istnieje.

---

## Notatki implementacyjne (dla każdej opcji)

### SaveMigration przy wyborze Option 3 (Pure Strata)
```
v25 → v26: dodaj strata object; policz z istniejących buildings
  defaultStrata = {
    laborer: ceil(population × 0.3),
    miner: budynki mining > 0 ? ceil(population × 0.2) : 0,
    scientist: budynki research > 0 ? 1 : 0,
    youth: floor(population × 0.2),
    // reszta = laborer
  }
```

### EventBus przy Option 3
```
'civ:strataGrew { type, count, colony }'
'civ:strataShrank { type, count, reason, colony }'  // emigracja / głód
'civ:strataDominanceChanged { dominant, colony }'   // gdy zmienia się dominująca strata
```
