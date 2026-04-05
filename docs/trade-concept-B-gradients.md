# KONCEPCJA B: "PROSPERITY GRADIENTS"
# Bez waluty — gospodarka jako fizyka przepływu

> Dokument roboczy. Data: 2026-03-19.
> Powiązane: trade-concept-A-credits.md, loyalty-identity-concepts.md

---

## Rdzeń koncepcji

Zamiast walut i korporacji z tierami — **towary płyną jak woda: zawsze od nadwyżki do niedoboru**.
Nie ma cen, nie ma Kredytów. Jest tylko **Prosperity Gradient** (różnica dobrostanu między
koloniami) i **Trade Capacity** (pojemność przepływu).

**Kluczowy insight:** Gradient NIE decyduje co płynie — decyduje o priorytecie i pojemności.
Co płynie — decyduje analiza surplus/deficit per towar (osobny algorytm).

**Inspiracja:** hydraulika, naczynia połączone, Stellaris trade routes, samoregulujące rynki.

---

## WARSTWA 1 — PROSPERITY GRADIENT (silnik handlu)

Każda para kolonii w zasięgu ma gradient — siłę i priorytet połączenia:

```
gradient(A ↔ B) = |prosperityA - prosperityB| / 100
// Im większa różnica dobrobytu → tym intensywniejszy handel

connectionPriority = gradient × 0.9 + 0.1
// +0.1 = bazowe 10% — kolonie handlują nawet przy równej prosperity
// (bo wzajemne nadwyżki zawsze istnieją)
```

**Dwukierunkowy przykład (A ↔ B):**
- Kolonia A (Prosperity 85): produkuje food, water, consumer goods → nadwyżki
- Kolonia B (Prosperity 40): produkuje Fe, Ti, Pt → nadwyżki
- Gradient A↔B = 0.45 → połączenie wysokiego priorytetu
- **Co płynie A→B**: food, water, consumer goods (A ma nadwyżkę, B ma deficyt)
- **Co płynie B→A**: Fe, Ti, Pt (B ma nadwyżkę, A ma deficyt)
- **Oba przepływy jednocześnie** — określone przez surplus/deficit, nie gradient
- **Gradient decyduje**: ile Trade Capacity oba kolonie przeznaczają na to połączenie
- **Efekt prosperity**: B zyskuje więcej (survival layer krytyczny) niż A traci
- **Gradient maleje** w czasie → A=75, B=65 → stabilna równowaga

---

## WARSTWA 2 — TRADE CAPACITY (pojemność sieci)

Każda kolonia ma **Trade Capacity (TC)** — ile jednostek towarów może wysłać/przyjąć rocznie.
TC to POOL dzielony między wszystkie aktywne połączenia.

```
TC = baseTC + buildingBonus + prosperityBonus

baseTC = 10 × pop
  // 10 jednostek/rok per POP — lokalni handlarze, karawany, drobny handel

prosperityBonus = floor(prosperity / 20) × 5
  // Prosperity 40:  +10 TC   (prymitywna sieć)
  // Prosperity 60:  +15 TC   (rozwijający się handel)
  // Prosperity 80:  +20 TC   (dojrzały rynek)
  // Prosperity 100: +25 TC   (rozkwit)

buildingBonus = Σ(tradeBuildings.tcBonus)
```

**Podział TC między połączenia:**
```
TC podzielone proporcjonalnie do priorityScore per połączenie

Przykład: TC=60, 3 połączenia z priority 0.45, 0.20, 0.05:
  → Suma priority = 0.70
  → Połączenie 1: 60 × (0.45/0.70) = 39 j./rok
  → Połączenie 2: 60 × (0.20/0.70) = 17 j./rok
  → Połączenie 3: 60 × (0.05/0.70) = 4 j./rok
```

Kolonia z wieloma połączeniami "rozkłada" swoją pojemność między nie.
Budynki handlowe ZWIĘKSZAJĄ TC, umożliwiając obsługę więcej kolonii naraz.

---

## WARSTWA 3 — CO PRZEPŁYWA (auto-routing)

System automatycznie wybiera **co wysłać** w każdą stronę, per towar:

```
Dla każdego towaru X, kolonia A → kolonia B:
  surplusScore(X, A) = stock(X,A) / (consumption(X,A) × 10)
  // >1.5 = wyraźna nadwyżka (gotowy do eksportu)

  deficitScore(X, B) = 1 / max(0.1, stock(X,B) / (consumption(X,B) × 5))
  // >1.0 = wyraźny deficyt (aktywnie potrzebuje)

Przepływ X z A → B zachodzi gdy:
  surplusScore(X,A) > 1.5  AND  deficitScore(X,B) > 1.0
  AND dostępne TC na to połączenie
  AND zasięg OK

Ilość transferu = min(TC_dostępne, surplus_A × 0.3)
  // max 30% nadwyżki rocznie — handel nie "opróżnia" kolonii
```

**Towary mają priorytety:**
1. **Survival** (food, water, energy) — priorytet najwyższy
2. **Functioning goods** (spare_parts, pharma) — priorytet wysoki
3. **Raw resources** (Fe, Si, minerals) — priorytet średni
4. **Comfort/Luxury goods** — priorytet niski

**Gracz może interweniować (overrides):**
- "Zablokuj eksport X" — kolonia A nigdy nie wysyła towaru X (np. food w trakcie głodu)
- "Import priority X" — kolonia B rezerwuje 50% TC na import towaru X
- "Trade isolation" — kolonia nie uczestniczy w cywilnej sieci (np. kwarantanna)

Ekonomia "sama się organizuje" — gracz tylko koryguje patologie, nie zarządza każdą trasą.

---

## WARSTWA 4 — PROSPERITY AS ECONOMIC COST

Skoro nie ma Kredytów — jakie są koszty prowadzenia sieci handlowej?

**Koszt utrzymania sieci:**
```
tradeNetworkUpkeep = Σ(activeConnections × 2 × distanceFactor) per rok
  // distanceFactor = 1.0 dla <5 AU, 1.5 dla 5-15 AU, 2.0 dla >15 AU

→ odejmowany od targetProsperity co rok
  // Prowadzenie sieci "kosztuje" prosperitę — odzwierciedla
  // wysiłek logistyczny i organizacyjny rozległego imperium
```

**Intuicja:** Małe imperium (2-3 kolonie blisko) → tani handel, netto zysk prosperity.
Rozległe imperium (8 kolonii daleko) → drogi handel, może być prosperity-negative
bez budynków handlowych.

**Misje Dobrobytu (opcjonalny mechanizm):**
Gracz może aktywnie "przekazać prosperity" z bogatej do biednej kolonii:
```
"Wyślij Misję Dobrobytu": kolonia A → kolonia B
  → A: targetProsperity −10 na 5 lat
  → B: targetProsperity +20 na 10 lat
  → Tworzy stałe silne połączenie handlowe (kontrakt, nadpriorytety)
  → Koszt: wysoki, zysk: szybkie podniesienie nowej kolonii
```

To nie jest waluta numeryczna — to "darowanie własnego komfortu drugiemu".
Strategiczna decyzja: kiedy warto osłabić centrum by wzmocnić peryferie?

---

## WARSTWA 5 — BUDYNKI HANDLOWE (Koncepcja B)

Bez Kredytów, budynki rozszerzają TC i modyfikują sieć:

| Budynek | namePL | Tier | Efekt | Unikalność |
|---------|--------|------|-------|-----------|
| trade_hub 🔄 | Węzeł Handlowy | 1 | +TC×2, zasięg +5 AU, odblokuj dowolne towary w przepływie | Infrastruktura — must-have dla każdej kolonii handlowej |
| free_market 🏪 | Wolny Rynek | 1 | Auto-routing mądrzejszy (+20% efektywność match), upkeep sieci −20% | Ekonomiczny — optymalizuje istniejącą sieć |
| trade_beacon 📡 | Latarnia Handlowa | 2 | Zasięg TC ×1.5, widoczność surplusów wszystkich kolonii | Technologiczny — informacja jako przewaga |
| prosperity_nexus ✨ | Centrum Dobrobytu | 2 | Misje Dobrobytu kosztują −50% prosperity, gradient +0.1 flat | Dyplomatyczny — narzędzie zarządzania imperium |

---

## FEEDBACK LOOP (Gradients)

```
┌─────────────────────────────────────────────────────────────────┐
│  WYRÓWNYWANIE PROSPERITY W IMPERIUM                              │
│                                                                  │
│  Kolonia A (prosperity 85) ↔ Kolonia B (prosperity 40)          │
│  → Duży gradient → intensywny handel                            │
│  → B dostaje food + consumer goods → B's prosperity rośnie      │
│  → Gradient maleje (wyrównanie)                                  │
│  → Nowa równowaga: A=75, B=65                                   │
│  → Obie lepiej niż były — handel to gra o sumie dodatniej        │
└─────────────────────────────────────────────────────────────────┘

KOSZT CENTRUM (napięcie gameplay):
  A traci prosperity do upkeep sieci
  Im więcej kolonii w sieci → wyższy upkeep → centrum może "zmęczyć się"
  Gracz musi budować TRADE HUBS żeby obniżyć upkeep i utrzymać centrum silne

SPIRALA KRYZYSU (nowa kolonia):
  B nowa (prosperity=20) → gradient niby duży, ale...
  TC_B = 10 × 2 POPy = 20 → bardzo mała pojemność
  → Przepływ z A ograniczony przez TC_B
  → Kolonia "nie może wchłonąć" wystarczająco dużo importu
  → Gracz musi ręcznie wysłać cargo_ship (stary system) + zbudować trade_hub
  → Potem gradient działa efektywnie
```

---

## KLUCZ: GRADIENT DWUKIERUNKOWY

Najważniejszy mechanizm do zrozumienia — odpowiedź na pytanie "co gdy A i B
wymieniają się nawzajem surowcami i towarami?":

```
A (Prosperity 85) exportuje:  food, water, consumer goods → B
B (Prosperity 40) exportuje:  Fe, Ti, Pt, C              → A

Gradient A↔B = 0.45 → wysokie TC dedykowane

Efekty na prosperity:
  B survival layer (food/water): radykalnie poprawia → +15 prosperity target
  B functioning layer (spare_parts): poprawia z Fe → +5 prosperity target
  A minerals (Fe) layer: nieznaczny (A nie jest deficytowa w wydobyciu)
  A infrastructure: B płaci Fe → A buduje → A infrastructure lepsza → +3 prosperity

Net prosperity effect:
  B zyska: +20 prosperity target
  A zyska: +3 prosperity target, ale traci: -4 upkeep (odległa kolonia)
  Net A: -1 (akceptowalny koszt bycia centrum imperium)

Po 30 latach:
  B: 40 → 65 prosperity (radykalna poprawa)
  A: 85 → 84 prosperity (minimalny koszt)
  Gradient: 0.45 → 0.19 (osłabł — wyrównanie postępuje)
```

---

## PORÓWNANIE Z KONCEPCJĄ A

| Kryterium | Koncepcja A (Kredyty) | Koncepcja B (Gradienty) |
|-----------|----------------------|------------------------|
| Waluta | Kredyty (Kr) per-kolonia | Brak — prosperity jako siłą napędową |
| Ceny | Dynamiczne per-kolonia | Nie istnieją — gradient zastępuje ceny |
| Kontrola gracza | Wysoka (buy/sell orders) | Średnia (blokady i priorytety) |
| Emergencja | Boom/bust korporacji | Wyrównywanie prosperity w sieci |
| Napięcie | Kr maintenance vs. ekspansja | Trade upkeep vs. prosperity centrum |
| Analogia | Victoria 3, Anno | Naczynia połączone, Stellaris trade |
| Kompleksowość | Wyższa | Niższa |

---

## RELACJA Z PRZYSZŁYM LOYALTY/IDENTITY

```
Aktywne połączenia → +2 Loyalty/rok per połączenie (jak w Koncepcji A)
Gradient malejący (prosperities równe) → +Loyalty (oba bogate = obie lojalne)
Brak połączeń (trade isolation) → Identity rośnie szybciej (izolacja kulturowa)
Misja Dobrobytu → +Loyalty +15 jednorazowo (akt imperialnej hojności)
```

---

## PLIKI DO IMPLEMENTACJI

### Nowe pliki
| Plik | Zawartość |
|------|-----------|
| `src/systems/CivilianTradeSystem.js` | Gradient calc, TC allocation, auto-routing, upkeep |

### Modyfikacje
| Plik | Zmiana |
|------|--------|
| `src/data/BuildingsData.js` | Nowe budynki: trade_hub, free_market, trade_beacon, prosperity_nexus |
| `src/systems/ColonyManager.js` | Dodaj `tradeCapacity`, `tradeOverrides`, `activeConnections` |
| `src/systems/ProsperitySystem.js` | Dodaj `tradeUpkeep` do targetProsperity |
| `src/scenes/PlanetGlobeScene.js` | UI tab "Sieć Handlowa": aktywne połączenia, overrides, TC bar |
| `src/scenes/UIManager.js` | Wskaźnik sieci handlowej w CivPanel |
| `src/renderer/ThreeRenderer.js` | Wizualne linie gradientu + kosmetyczne statki |
| `src/systems/SaveMigration.js` | Bump version, defaults: tradeCapacity=0, activeConnections=[], overrides={} |

---

## OCENA KONCEPCJI B

| Kryterium | Ocena | Uzasadnienie |
|-----------|-------|--------------|
| Głębia ekonomiczna | ★★★☆☆ | Prostsza, ale emergentna przez gradient |
| Czytelność gracza | ★★★★★ | Intuicyjne "bogactwo płynie do biedy" |
| Emergencja | ★★★★★ | Sieć wyrównuje się jak naczynia połączone |
| Złożoność implementacji | ★★★☆☆ | Prostsze, brak systemu walutowego |
| Poczucie "żywej ekonomii" | ★★★★☆ | Organiczne, ale mniej "namacalne" |
| Kontrola gracza | ★★☆☆☆ | Mniej precyzyjna — tylko blokady, nie ordery |
| Analogia do | Stellaris trade, naczynia połączone, macroeconomics |
