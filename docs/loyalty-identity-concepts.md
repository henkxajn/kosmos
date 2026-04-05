# KOSMOS — Koncepcje systemu Loyalty & Identity

> Dokument roboczy. Data: 2026-03-19.
> Czysto analityczny — brak kodu. Podstawa do przyszłej implementacji.

---

## Punkt wyjścia: co już istnieje

### ProsperitySystem (per-kolonia)
- 5-warstwowy model satysfakcji (survival → luxury)
- Inercja 15%/rok w kierunku targetProsperity
- Permanentne bonusy z tech + odkryć
- Bonusy z zdarzeń losowych (czasowe)
- `maturityFactor` — bierze pod uwagę wiek kolonii i odległość od homeworld

### CivilizationSystem (per-kolonia)
- Dyskretne POPy (nie per-jednostka)
- Unrest + Famine jako kryzysy binarne (bool flag)
- Epoki cywilizacyjne (Primitive → Interplanetary)

### Luki projektowe (co NIE istnieje)
- Brak "politycznej" warstwy między ekonomią a graczem
- Unrest to tylko premia produkcyjna (×0.7) — brak konsekwencji narracyjnych
- Kolonie są funkcjonalnie identyczne poza środowiskiem planety
- Brak poczucia, że kolonie żyją własnym życiem

---

## Macierz projektowa — serce systemu

```
              NISKA TOŻSAMOŚĆ       │  WYSOKA TOŻSAMOŚĆ
              ──────────────────────────────────────────
WYSOKA        │  Posłuszna Kolonia  │  Dumna Prowincja   │
LOJALNOŚĆ     │  (bezpieczna, nuda) │  (cel do osiągnięcia│
              ──────────────────────────────────────────
NISKA         │  Kolonia w Kryzysie │  Ryzyko Separatyzmu │
LOJALNOŚĆ     │  (problemy ekonom.) │  (kryzys polityczny) │
```

Każdy kwadrant = inny rodzaj problemu i inne odpowiedzi gracza.
System NIE jest liniowy — można mieć ekonomicznie zdrową kolonię w stanie politycznym kryzysu.

**Cel projektowy**: Dumna Prowincja (wysoka Loyalty + wysoka Identity) jako achievement
długoterminowy. Wymaga AKTYWNEGO inwestowania przez dziesiątki lat.

**Dwie ścieżki ekspansji** (klasyczny dylemat imperialny):
- Ekstraktywny kolonializm: szybkie zasoby, długoterminowe ryzyko polityczne
- Inwestycja kulturowa: wolniejszy zwrot, ale stabilne prowincje przez pokolenia

---

## CONCEPT A: "Dwie Osie" — Czysto i Elegancko

### Założenia
Dwa nowe liczby per-kolonia: **Loyalty** (0–100) i **Identity** (0–100). Nic więcej.
Proste jak Prosperity. Minimalna ingerencja w istniejącą architekturę.

---

### Identity — jak rośnie

Identity jest **niemal jednostronna** — raz zbudowana, bardzo trudno ją zredukować
(jak prawdziwa tożsamość kulturowa).

| Źródło | Efekt roczny |
|--------|--------------|
| Czas istnienia (bazowo) | +0.8 / rok |
| Odległość od homeworld | +0.01 × dystans_AU / rok |
| Ekstremalne środowisko (extreme temp/atmo/grav) | +0.3–0.8 / rok |
| Przetrwanie kryzysu (unrest/famine end) | +5 jednorazowo |
| Aktywne trasy handlowe z macierzystą | −0.3 / rok (kontakt kulturowy spowalnia) |
| Wysoka Prosperity | ×1.2 mnożnik wzrostu (dostatni lud ma czas na kulturę) |
| Budynki kulturowe (nowy typ) | +1.5–3.0 / rok (aktywny wybór gracza) |

**Cap**: 100.
**Floor**: `max(current × 0.4, suma_historycznych_milestones)`.
Kulturę można stłumić, ale nie wymazać.

---

### Loyalty — jak się zmienia

Loyalty jest **dynamiczna w obu kierunkach**.

| Czynnik | Modyfikator roczny |
|---------|--------------------|
| Prosperity > 70 | +3 / rok |
| Prosperity 50–70 | +1 / rok |
| Prosperity 25–50 | −1 / rok |
| Prosperity < 25 | −4 / rok |
| Aktywna trasa handlowa z homeworld | +2 / rok per trasa |
| Brak tras handlowych | −1 / rok |
| Odległość > 5 AU | −0.2 × dystans / rok |
| Unrest active | −5 / rok |
| Gubernator przypisany | +3 / rok |
| Brak gubernatora | −0.5 / rok |
| Inwestycja imperialna (zasoby z homeworld) | +2 / rok gdy trasa aktywna |

### Kluczowy mechanizm — Identity jako AMPLIFIKATOR lojalności

```
loyaltyDelta = baseDelta × (0.5 + identity / 100)
```

- Identity = 0:   zmiana lojalności × 0.5 — kolonia jest obojętna, stabilna
- Identity = 50:  zmiana × 1.0 — normalna
- Identity = 100: zmiana × 1.5 — kolonia namiętna, lojalność zmienia się SZYBKO w obie strony

Konsekwencja: stara kolonia z wysoką Identity wymaga AKTYWNEGO utrzymywania lojalności.
Zaniedbasz ją na 20 lat — szybko się odwróci. Jednocześnie, gdy ją kochasz — jest bardziej
lojalna niż jakakolwiek młoda kolonia.

---

### Efekty systemowe

**Loyalty wpływa na:**
```
transfer zasobów z kolonii = normalnie × (0.5 + loyalty / 200)
  // Loyalty=100: ×1.0 (pełne)
  // Loyalty=0:   ×0.5 (połowa "gubi się" w korupcji/sabotażu)

wzrost POP = bazowy × (1.0 + loyalty × 0.003)
  // Lojalna kolonia rośnie szybciej (optymizm, imigracja z imperium)

dostępność statków do misji imperialnych = loyalty > 50
```

**Identity wpływa na:**
```
wzrost POP = bazowy × (1.0 + identity × 0.004)
  // Silna tożsamość = silna wspólnota = wyższa dzietność

demand na consumer goods = bazowy × (1.0 + identity × 0.002)
  // Kolonia z tożsamością chce żyć DOBRZE, ma wyższe oczekiwania kulturowe

tempo wzrostu Identity = bazowe × prosperityMultiplier
```

---

### Kryzys Separatyzmu

**Warunek wejścia**: `loyalty < 30 AND identity > 65`

Zdarzenie w MissionEventModal (z pauzą):
> *"[NazwaKolonii] — Ruch Niepodległościowy. Kolonię ogarnął ruch separatystyczny.
> Lokalni przywódcy ogłosili Zgromadzenie Tożsamości Kulturowej.
> Masz 25 lat, zanim sprawa wymknie się spod kontroli."*

**Opcje gracza:**

| Opcja | Koszt | Efekt |
|-------|-------|-------|
| Negocjacje | 200 research + 150 luxury goods | Loyalty +25, wzrost Identity wstrzymany 10 lat |
| Integracja ekonomiczna | cargo_ship + trasa handlowa | Loyalty +10/rok przez 5 lat |
| Autonomia | — | Kolonia autonomiczna (patrz niżej) |
| Represje | military_ship (przyszłość) | Loyalty +30 force, Identity +15, Prosperity −30 |
| Ignoruj | — | Po 25 latach kolonia secedes |

**Stan Autonomii** — trzecia forma władania:
- Kolonia pozostaje na mapie i w imperium
- `resourceTransferRate × 0.3` (oddaje 30% normalnego)
- Separatyzm znika, ale Loyalty caps na 55
- Powrót do pełnej kontroli: długotrwałe inwestycje i trasy handlowe przez 50+ lat

---

### Ocena Concept A
| Kryterium | Ocena |
|-----------|-------|
| Złożoność implementacji | Niska — dwa floaty + nowy system jak ProsperitySystem |
| Głębia gameplay | Średnia — dobrze zdefiniowane pętle sprzężenia |
| Czytelność dla gracza | Wysoka — dwa paski są intuicyjne |
| Emergencja | Ograniczona — każda kolonia przebiega podobną ścieżkę |

---

## CONCEPT B: "Kultura i Frakcje" — Stellaris-owy Depth

### Rdzeń
Do Loyalty + Identity dodajemy **rozkład frakcji POP** i **Politykę Gubernatora**.

Zamiast śledzić per-POP, śledzimy PROPORCJE (skompresowana reprezentacja):

```javascript
civSystem.factions = {
  imperialists: 0.6,   // 60% POPów pro-imperium
  autonomists:  0.3,   // 30% POPów chce autonomii
  separatists:  0.1,   // 10% POPów chce niepodległości
}
// Suma zawsze = 1.0
```

---

### Dynamika Frakcji

```
Każdy rok:
  drift_imperialists  += loyalty × 0.002 − identity × 0.001
  drift_autonomists   += 0 (baseline — zawsze obecni)
  drift_separatists   += identity × 0.003 − loyalty × 0.002

  → normalizuj do 1.0
```

Frakcje przenoszą MOMENTUM — separatyści nie znikają od razu po poprawie warunków.
Nawet przy wysokiej Loyalty, jeśli separatists > 0.2, są wciąż niebezpieczni.

---

### Efekty Frakcji

```
produkcja = normalna × (imperialists × 1.0 + autonomists × 0.85 + separatists × 0.6)
// Separatyści sabotują; autonomiści są mniej efektywni

transfer zasobów = normalna × imperialists
// Tylko imperialiści ochotniczo płacą podatki

separatism_risk = separatists > 0.4 AND identity > 60
```

---

### Polityka Gubernatora

Gracz wybiera STYL RZĄDZENIA per-kolonia (aktywna decyzja, jak policy w Stellaris):

| Polityka | Loyalty | Identity | Prosperity | Produkcja |
|----------|---------|----------|------------|-----------|
| **Integracjonista** | +3 / rok | ×0.7 | −5 | — |
| **Deweloper** | neutral | ×1.2 | +10 | +5% |
| **Autonomista** | drift stabilny | ×1.3 | neutral | +10% |
| **Eksploatator** | −2 / rok | neutral | −10 | +25% |

**Eksploatator** = klasyczna kolonialna pułapka: szybkie zyski, rosnąca Identity i spadająca
Loyalty → nieuchronny Separatyzm po 50–80 latach.

---

### Cechy Kulturowe (Cultural Traits)

Kolonie zdobywają CECHY co ~50 lat gdy warunki spełnione. Permanentne.

| Cecha | Warunek | Efekt |
|-------|---------|-------|
| **Pionierzy** | Izolacja >30 lat, distance >5 AU | +25% wzrost POP, Identity +1/rok |
| **Handlarze** | >3 aktywne trasy przez 30 lat | +20% trade efficiency |
| **Górnicy** | >60% budynków mine przez 30 lat | +20% minerals |
| **Naukowcy** | Research output >200/rok przez 20 lat | +15% research |
| **Ocalali** | Przetrwanie Separatyzmu lub Głodu | +15% produkcja, Loyalty −10 permanentnie |
| **Lojaliści** | Loyalty > 80 przez 40 lat | Identity growth ×0.5, Loyalty min 60 |
| **Zbuntowani** | Separatyzm zakończony Autonomią | −10 Loyalty cap, +20% wszystkich zasobów |

Każda kolonia po 200 latach ma 2–4 cechy. Widoczne w UI jako "osobowość" kolonii.

---

### Ocena Concept B
| Kryterium | Ocena |
|-----------|-------|
| Złożoność implementacji | Średnia — frakcje to floaty, cechy to tablica + lookup |
| Głębia gameplay | Wysoka — frakcje tworzą nowe napięcia, polityka = aktywne decyzje |
| Czytelność dla gracza | Średnia — trzy wskaźniki + frakcje mogą przytłoczyć |
| Emergencja | Wysoka — każda kolonia idzie inną ścieżką |

---

## CONCEPT C: "Duch Historii" — Narracyjny Charakter

### Rdzeń
Tożsamość nie jest liczbą — jest HISTORIĄ. Każda kolonia akumuluje **Milestones**
(do 10–12 rekordów):

```javascript
colony.history = [
  { year: 145, event: 'founding',       name: 'Założenie Kolonii',       loyalty: +0,  identity: +3  },
  { year: 167, event: 'great_famine',   name: 'Wielki Głód roku 167',    loyalty: -5,  identity: +8  },
  { year: 203, event: 'golden_decade',  name: 'Złota Dekada 203-213',    loyalty: +8,  identity: +5  },
  { year: 251, event: 'trade_hub',      name: 'Era Centrum Handlowego',  loyalty: +12, identity: +4  },
  { year: 320, event: 'separatism',     name: 'Ruch Wolności roku 320',  loyalty: -15, identity: +12 },
]
```

**Identity = suma wszystkich identity z historii** (caps na 100).
**Loyalty = dynamiczny (jak Concept A) + modyfikatory historyczne jako permanentne bonusy**.

---

### Wizja UI — "Żywa Historia"

Panel kolonii pokazuje TIMELINE historii zamiast abstrakcyjnych liczb:

```
[KOLONIA NOVA KRAKÓW — Rok 425]
────────────────────────────────────────────────────────
TOŻSAMOŚĆ:  ████████████████░░░░ 81 / 100
LOJALNOŚĆ:  ████████░░░░░░░░░░░░ 42 / 100  ⚠

HISTORIA KOLONII:
  ● Rok 145  Założenie Kolonii                         +3 Tożsamość
  ● Rok 167  Wielki Głód roku 167              ⚡      +8 Tożsamość, −5 Lojalność trwale
  ● Rok 203  Złota Dekada 203-213              ✨      +5 Tożsamość, +8 Lojalność trwale
  ● Rok 251  Era Centrum Handlowego            🚀     +4 Tożsamość, +12 Lojalność trwale
  ● Rok 320  Ruch Wolności roku 320            ⚠      +12 Tożsamość, −15 Lojalność trwale
────────────────────────────────────────────────────────
```

Gracz CZUJE historię kolonii zamiast patrzeć na abstract bar.

---

### Typy Milestones

Generowane automatycznie gdy warunki spełnione:

| Typ | Warunek wyzwalający | Efekt na Loyalty | Efekt na Identity |
|-----|--------------------|--------------------|-------------------|
| `founding` | Kolonizacja | — | +3 |
| `great_famine` | Głód > 3 lata | −5 perm | +8 |
| `golden_decade` | Prosperity > 80 przez 10 lat | +8 perm | +5 |
| `trade_hub` | >4 trasy handlowe przez 25 lat | +12 perm | +4 |
| `isolation_era` | Brak tras przez 50 lat | −10 perm | +15 |
| `separatism` | Pierwsza Separatist Crisis | −15 perm | +12 |
| `reconciliation` | Separatyzm zakończony pozytywnie | +20 perm | +3 |
| `century` | 100 lat istnienia | — | +5 (prestige) |
| `population_boom` | POP × 3 w 50 lat | — | +6 |
| `tech_center` | Research > 500/rok przez 20 lat | +5 perm | +5 |
| `disaster_survivor` | Przetrwanie RandomEvent catastrophe | — | +10 |

---

### Kluczowa właściwość: Historia jest NIEODWRACALNA

Gracz **nie może usunąć wpisów historii**. Wielki Głód roku 167 będzie tam na zawsze.
To nadaje wagę decyzjom gracza — zaniedbanie kolonii zostaje wpisane w jej DNA.

W trybie Autonomii: kolonia zachowuje pełną historię. Jeśli kiedyś wróci do imperium —
wraca z pełną historią, która determinuje jej Loyalty i Identity na start.

---

### Ocena Concept C
| Kryterium | Ocena |
|-----------|-------|
| Złożoność implementacji | Umiarkowana — tablica w save; UI wymaga nowego panelu |
| Głębia gameplay | Bardzo wysoka — każda kolonia jest naprawdę unikalna |
| Czytelność dla gracza | Bardzo wysoka — historia jest intuicyjna i angażująca emocjonalnie |
| Emergencja | Maksymalna — żadne dwie kolonie nie mają tej samej historii |

---

## Integracja z systemem POP

Bez per-POP trackingu, Loyalty i Identity wpływają na populację przez PROPORCJE:

**Loyalty → efektywność ekonomiczna:**
```
productionRate × (0.5 + loyalty / 200)
// Loyalty=100: ×1.0 pełna
// Loyalty=0:   ×0.5 sabotaż/bierny opór
```

**Identity → wzrost populacji:**
```
growthMultiplier × (1.0 + identity × 0.004)
// Identity=100: +40% wzrostu — silna wspólnota, wysoka dzietność, przyciąga imigrantów "tej kultury"
```

**Identity → wymagania konsumpcyjne:**
```
consumerDemand × (1.0 + identity × 0.002)
// Identity=100: +20% demand — kolonia chce żyć DOBRZE jako kulturalne stwierdzenie
```

**Loyalty → emigracja (przyszłość):**
Low-loyalty POPs mogą "migrować do innych kolonii" — zmniejszają populację
kolonii zdradzające, przenoszą się do lojalnych (naturalna redystrybucja POPów).

---

## Integracja z istniejącymi systemami

### ProsperitySystem
- Prosperity > 70 → Loyalty +3/rok (zadowoleni nie buntują się)
- Prosperity < 25 → Loyalty −4/rok (głód i bieda rodzą bunt)
- Wysoka Prosperity → Identity growth ×1.2 (dostatni lud buduje kulturę)

### TradeRouteManager
- Aktywna trasa z homeworld → Loyalty +2/rok (więzy ekonomiczne = więzy polityczne)
- Trasy = "arterie imperialne" — ich brak naturalnie odcina kolonię kulturowo

### ExpeditionSystem / VesselManager
- Recon i misje z lojalnych kolonii (loyalty > 50) działają normalnie
- Misje z nielojalnych kolonii (loyalty < 30): 20% szansa na "odmowę" lub opóźnienie
- Statki z kolonii autonomicznej: niedostępne do misji imperialnych

### RandomEventSystem
- Nowe zdarzenia mogą modyfikować Loyalty/Identity bezpośrednio
- Zdarzenie "Ruch Nacjonalistyczny": Identity +10, Loyalty −15 przez 5 lat
- Zdarzenie "Ambasador z Homeworld": Loyalty +20 jednorazowo
- Zdarzenie "Festival Kulturalny": Identity +5, Prosperity +10 przez 2 lata

### SaveMigration
- Nowe pola per-kolonia: `loyalty`, `identity`
- Opcjonalnie (Concept B): `factions`, `governorPolicy`, `traits[]`
- Opcjonalnie (Concept C): `history[]`
- Wymagają bump CURRENT_VERSION + migracja z defaults: loyalty=80, identity=5

---

## Skala czasowa — ważna uwaga

Przy `CIV_TIME_SCALE = 12`: 100 lat in-game = ~8 minut realnego czasu.
Identity rosnące przez 50 lat to kilka minut sesji.

**Konsekwencja projektowa**: Identity powinna być widoczna JUŻ po 20–30 latach kolonii
(szybko zakładana gra). Wzrost bazowy 0.8/rok → 24 punkty Identity po 30 latach.
To daje odczuwalną wartość w krótkim czasie, ale 80+ nadal wymaga 100+ lat.

Tempo kryzysu Separatyzmu (25 lat na odpowiedź) = ~2 minuty realne.
To dość dużo by decyzja była przemyślana, nie za dużo by była nudna.

---

## Rekomendacja — Warstwowe wdrożenie

### Faza 1 (rdzeń — Etap 38 lub 39):
**Concept A** jako baza + podstawowe milestones z Concept C

- Loyalty + Identity jako dwa floaty per-kolonia
- Identity rośnie organicznie (czas + środowisko + kryzysy)
- Loyalty dynamiczna (prosperity + trade routes + odległość)
- Mechanizm Separatism Crisis z 5 opcjami gracza
- 3 kluczowe milestones automatyczne (founding, major_crisis, golden_age)
- Integracja z POP: Loyalty → mnożnik produkcji; Identity → mnożnik wzrostu
- UI: dwa paski w panelu kolonii + milestone log (uproszczony)

### Faza 2 (Etap późniejszy):
**Cultural Traits** z Concept B + Gubernator

- 5–7 cech zdobywanych przez czas
- Polityka Gubernatora (4 tryby per-kolonia)
- Ewentualnie: frakcje jako trzy floaty (imperialists/autonomists/separatists)

### Faza 3 (opcjonalnie):
**Historia narracyjna** z Concept C

- Pełny timeline per-kolonia
- Historia w UI panelu kolonii
- Permanentne modyfikatory z milestones wpływające na Loyalty/Identity floor

---

## Otwarte pytania projektowe

1. **Czy Identity KIEDYKOLWIEK spada poniżej historycznego minimum?**
   Rekomendacja: floor = suma identity z history (kulturę można stłumić, nie wymazać).

2. **Jak traktować Autonomię?**
   Opcje: (a) stan permanentny, (b) przejściowy etap przed secession, (c) pełna trzecia forma władania.
   Autonomia jako osobna ścieżka z unikalnymi mechanikami (jak wasalstwo) jest najbogatsza.

3. **Czy Loyalty dotyczy imperium czy centrum (homeworld)?**
   Jeśli homeworld pogrąży się w kryzysie — czy to automatycznie obniża Loyalty kolonii?
   Ciekawy mechanizm ale wymaga globalnego "prestiżu imperialnego".

4. **Interakcja Tech globalny ↔ Identity?**
   Techs z gałęzi governance/culture mogą modyfikować Identity dynamics całego imperium.
   Przykład: tech "Interplanetary Cultural Exchange" → Identity growth ×0.7 dla wszystkich kolonii.

5. **Skala wartości: czy 0–100 jest dobra?**
   Alternatywa: 0–10 (czytelniejsze), ale 0–100 spójne z Prosperity. Pozostać przy 0–100.
