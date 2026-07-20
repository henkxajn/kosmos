# KOSMOS — Podręcznik Gracza

> Wersja manualu: Etap 23 (aktualne mechaniki: symulacja + 4X + POP + ekspedycje + stocznia/flota + kolonizacja + ekspansja)

---

## Spis treści

1. [Czym jest KOSMOS?](#1-czym-jest-kosmos)
2. [Ekran startowy](#2-ekran-startowy)
3. [Widok kosmiczny — sterowanie](#3-widok-kosmiczny--sterowanie)
4. [Czas gry](#4-czas-gry)
5. [Gwiazda i planety](#5-gwiazda-i-planety)
6. [Akcje gracza — wpływ na układ](#6-akcje-gracza--wpływ-na-układ)
7. [Życie i ewolucja](#7-życie-i-ewolucja)
8. [Przejście do trybu cywilizacyjnego](#8-przejście-do-trybu-cywilizacyjnego)
9. [Widok planety — mapa hex](#9-widok-planety--mapa-hex)
10. [Surowce](#10-surowce)
11. [Budynki](#11-budynki)
12. [Drzewo technologii](#12-drzewo-technologii)
13. [Cywilizacja — populacja i morale](#13-cywilizacja--populacja-i-morale)
14. [Ekspedycje kosmiczne](#14-ekspedycje-kosmiczne)
15. [Kolonizacja innych ciał](#15-kolonizacja-innych-ciał)
16. [Zdarzenia losowe](#16-zdarzenia-losowe)
17. [Ekspansja międzyplanetarna](#17-ekspansja-międzyplanetarna)
18. [Zapis i wczytywanie gry](#18-zapis-i-wczytywanie-gry)

---

## 1. Czym jest KOSMOS?

KOSMOS to gra dwuwarstwowa:

**Warstwa 1 — Symulator układu planetarnego**
Zarządzasz młodym układem słonecznym. Obserwujesz formowanie się planet, kolizje, ewolucję orbit. Twoim celem jest doprowadzenie warunków na jednej z planet do stanu, w którym może powstać życie — a potem cywilizacja.

**Warstwa 2 — Strategia 4X**
Gdy na planecie pojawi się cywilizacja, możesz ją przejąć. Budujesz instalacje, zarządzasz surowcami i populacją, rozwijasz technologie. To tu gra staje się strategią zasobową.

Obie warstwy działają jednocześnie — gdy zarządzasz kolonią, gwiazda nadal świeci, a orbity nadal się zmieniają.

---

## 2. Ekran startowy

Po uruchomieniu gry widzisz ekran powitalny z opcjami:

| Przycisk | Co robi |
|----------|---------|
| **[ NOWY UKŁAD ]** | Generuje losowy układ planetarny. Gwiazda, liczba planet i ich orbity są losowe przy każdej grze. |
| **[ EDEN — TEST ]** | Uruchamia scenariusz testowy: jedna idealna planeta w strefie zamieszkiwalnej, zoptymalizowana chemia. Życie pojawia się w ciągu kilku sekund przy max prędkości. |
| **[ TAK — KONTYNUUJ ]** | Wczytuje zapisaną grę (widoczne gdy istnieje zapis). |
| **[ NOWA GRA ]** | Kasuje zapis i startuje od nowa. |

---

## 3. Widok kosmiczny — sterowanie

### Kamera
| Akcja | Jak |
|-------|-----|
| Przybliż / oddal | Kółko myszy |
| Przesuń widok | Prawy przycisk myszy + przeciągnij |
| Kliknij planetę | LPM — zaznacz i otwórz panel info |

### Panel informacji (prawy bok ekranu)
Kliknij dowolne ciało niebieskie, aby zobaczyć jego dane. Panel ma **3 zakładki**:

- **ORBITA** — półoś wielka (AU), mimośród, okres obiegu, stabilność
- **FIZYKA** — masa, temperatura, albedo, atmosfera
- **SKŁAD** — wykres 7 najliczniejszych pierwiastków

### Dziennik zdarzeń (lewy dół)
Automatycznie notuje kolizje, zmiany orbit, pojawienie się i ewolucję życia, zmiany faz dysku. Najnowsze wpisy na górze, starsze bledną.

---

## 4. Czas gry

Czas gry możesz kontrolować swobodnie. Przyciski na dole ekranu:

| Przycisk | Prędkość | Kiedy używać |
|----------|----------|--------------|
| **PAUZA** | zatrzymany | Planowanie, czytanie danych |
| **1d/s** | 1 dzień gry / sekundę | Zarządzanie kolonią, budowanie |
| **3d/s** | 3 dni gry / sekundę | Drobne zadania, lekkie przyspieszenie |
| **1t/s** | 1 tydzień / sekundę | Obserwowanie krótkich procesów |
| **1m/s** | 1 miesiąc / sekundę | Obserwowanie wzrostu populacji |
| **1r/s** | 1 rok / sekundę | Śledzenie zmian orbitalnych, najszybsze tempo |

### Auto-slow (przycisk AUT)
Gdy coś ważnego się dzieje, gra automatycznie zwalnia do **1d/s** i informuje cię w dzienniku. Wyzwalacze:
- kolizja dwóch planet
- pojawienie się / ewolucja / wymieranie życia
- zmiana fazy dysku protoplanetarnego
- krytyczny niedobór surowców

Przycisk **[AUT]** (górny prawy róg) — wyłącza/włącza auto-slow. Czerwony = wyłączony.

---

## 5. Gwiazda i planety

### Typy gwiazd
| Typ | Nazwa | Masa | Strefa HZ |
|-----|-------|------|-----------|
| M | Czerwony karzeł | 0.3 M☉ | 0.1–0.4 AU |
| K | Pomarańczowy karzeł | 0.7 M☉ | 0.5–0.9 AU |
| G | Żółty karzeł (Słońce) | 1.0 M☉ | 0.95–1.4 AU |
| F | Żółto-biały karzeł | 1.4 M☉ | 1.5–2.2 AU |

**Strefa zamieszkiwalna** (HZ, Habitable Zone) to obszar zaznaczony na mapie zielonym pasem — tam temperatura pozwala na istnienie płynnej wody.

### Typy planet
| Typ | Wygląd | Charakterystyka |
|-----|--------|----------------|
| Gorąca skalista | Czerwono-brązowa z plamkami lawy | Blisko gwiazdy, za gorąca na życie |
| Skalista | Zależna od temperatury | Potencjalnie zamieszkiwalna |
| Gazowa | Żółto-brązowe pasy | Brak powierzchni, nie można kolonizować |
| Lodowa | Niebiesko-biała z pierścieniami | Zimna, duże rezerwy lodu |

### Fazy dysku protoplanetarnego
Na początku układu istnieje dysk planetezymali. Przechodzi przez 3 fazy:

| Faza | Czas | Co się dzieje |
|------|------|---------------|
| **DYSK** | < 1 mln lat | Aktywna akrecja — planety rosną wchłaniając planetezymale |
| **CLEARING** | 1–5 mln lat | Sprzątanie — niestabilne ciała są wyrzucane z układu |
| **DOJRZAŁY** | > 5 mln lat | Stabilny układ, orbity ustalone |

---

## 6. Akcje gracza — wpływ na układ

W prawym dolnym rogu ekranu znajduje się panel akcji z **paskiem energii** (0–100).

Energia regeneruje się automatycznie (6 punktów / sekundę realną).

### Dostępne akcje
Najpierw **kliknij planetę**, potem użyj przycisku lub klawisza:

| Akcja | Klawisz | Koszt | Efekt |
|-------|---------|-------|-------|
| **Stabilizuj orbitę** | Q | 25 | Zmniejsza mimośród o 0.06, poprawia stabilność o +15% |
| **Pchnij ku HZ** | W | 35 | Przesuwa orbitę ku środkowi strefy zamieszkiwalnej (maks. 0.25 AU) |
| **Bombarduj kometami** | E | 20 | Przenosi H₂O, C, N, P z komet na planetę (poprawia szanse na życie) |

**Wskazówka:** Bombardowanie kometami zwiększa zawartość wody i związków organicznych — kluczowe dla powstania życia.

---

## 7. Życie i ewolucja

Życie pojawia się samoistnie gdy spełnione są warunki. Planeta z życiem ma **zielony glow** wokół siebie i zieloną orbitę.

### Warunki powstania życia
- Temperatura w zakresie −20°C do +60°C
- Stabilność orbitalna > 0.3
- Planeta skalista (nie gazowa, nie lodowa)
- Atmosfera (choć cienka)
- Bonus: H₂O > 5% + C > 2% + P > 0.1% składu chemicznego

### Etapy ewolucji (lifeScore 0–100)
| lifeScore | Etap | Ikona |
|-----------|------|-------|
| 0 | Jałowa | 🪨 |
| 1–20 | Chemia prebiotyczna | 🧪 |
| 21–50 | Mikroorganizmy | 🦠 |
| 51–80 | Złożone życie | 🌿 |
| 81–100 | Cywilizacja | 🏙 |

Przejście do kolejnego etapu jest **prawdopodobistyczne** — im lepsze warunki, tym szybciej. Kolizja z inną planetą niszczy życie natychmiast.

---

## 8. Przejście do trybu cywilizacyjnego

Gdy planeta osiągnie etap **Cywilizacja** (lifeScore > 80), w panelu informacji po prawej stronie pojawia się przycisk:

**▶ Przejmij cywilizację**

Po kliknięciu:
- Czas automatycznie zwalnia do **1d/s**
- Otwiera się **mapa powierzchni planety** (widok hex)
- Zaczyna działać system surowców, budynków i zarządzania

Kolejne wizyty na mapie: kliknij planetę → przycisk **▶ Mapa planety**.

---

## 9. Widok planety — mapa hex

Powierzchnia planety podzielona jest na heksagonalne pola. Każde pole ma typ terenu determinujący co można na nim zbudować.

### Typy terenu
| Teren | Ikona | Kolor | Specjalność |
|-------|-------|-------|-------------|
| Równina | 🟢 | Zielony | Wszystko, bonus +40% żywność |
| Góry | ⛰ | Szary | Tylko wydobycie/energia, bonus +60% minerały |
| Ocean | 🌊 | Niebieski | Nie do zabudowania |
| Las | 🌲 | Ciemnozielony | Żywność i nauka, bonus +30% organika |
| Pustynia | 🏜 | Złoty | Energia i wojsko, bonus +50% energia |
| Tundra | 🧊 | Blady błękit | Wydobycie, energia, żywność |
| Wulkan | 🌋 | Czerwony | Tylko energia/wydobycie, bonus ×2.0 energia (geotermia!) |
| Krater | ☄ | Brązowy | Wydobycie i badania, bonus +80% minerały, rzadkie złoża |
| Czapa lodowa | ❄ | Biały | Ogromne rezerwy wody (+2.5/r bazowo) |
| Pustkowia | 🌑 | Ciemny | Niska wydajność, tylko podstawowe budynki |

### Zasoby strategiczne
Na niektórych polach (zazwyczaj kraterach) można znaleźć **unikalne złoża** oznaczone kolorową kropką:
- 🟡 Au — złoto
- 🔵 Pt — platyna
- 🟢 U — uranin
- 💧 H₂O — koncentrat lodu wodnego
- 💗 He — hel-3

### Interakcja z polami
- **Najedź kursorem** na pole → opis terenu i produkcji w dolnym pasku
- **Kliknij pole** → otwiera prawy panel: teren + lista dostępnych budynków
- **Kliknij ponownie** to samo pole → zamknij panel
- **Zoom:** kółko myszy
- **Pan:** prawy przycisk myszy + przeciągnij
- **[ESC]** lub **← Wróć** → powrót do widoku kosmicznego

---

## 10. Surowce

W górze ekranu (pod belką tytułu) widać **pasek surowców**. Każdy zasób pokazuje:
`ikona  ilość / pojemność  ±delta/rok`

### 5 surowców
| Ikona | Zasób | Do czego służy | Naturalne źródła |
|-------|-------|---------------|-----------------|
| ⛏ | **Minerały** | Koszt budowy prawie wszystkiego | Kopalniane pola, krater |
| ⚡ | **Energia** | Konsumowana przez budynki | Elektrownie, wulkany |
| 🌿 | **Organika** | Pożywienie dla populacji | Farmy, lasy, równiny |
| 💧 | **Woda** | Konsumowana przez populację | Studnie, czapy lodowe, oceany |
| 🔬 | **Nauka** | Waluta drzewa technologii | Stacje badawcze |

### Kolory paska
| Kolor | Znaczenie |
|-------|----------|
| Szaro-niebieski | Normalny poziom |
| 🟠 Pomarańczowy | Poniżej 25% pojemności — uwaga |
| 🔴 Czerwony | Poniżej 10% pojemności — krytyczny |
| Zielona delta | Nadwyżka produkcji |
| Czerwona delta | Deficyt — surowiec się kończy |

**Niedobór** (zasób = 0): Pojemność magazynu = 200–500 startowo. Magazyn rozszerza budynek Magazyn (+200 każdego).

---

## 11. Budynki

Budynki stawiasz klikając wolne pole i wybierając z listy po prawej. Każde pole może mieć **1 budynek**. Wybudowany budynek pojawia się na hexie jako ikona emoji.

**Każdy budynek wymaga POPów (siły roboczej)** — kolumna 👤 pokazuje ile jednostek populacji jest potrzebne do obsługi budynku. Jeśli nie masz wolnych POPów, nie możesz budować.

### Lista budynków

**Wydobycie**
| Budynek | Ikona | Teren | Koszt | 👤 | Produkcja/rok |
|---------|-------|-------|-------|-----|--------------|
| Kopalnia | ⛏ | Wydobywczy | 60⛏ | 0.25 | +10⛏ −1⚡ |
| Huta ¹ | 🏭 | Wydobywczy | 120⛏ 40⚡ | 0.25 | +25⛏ −8⚡ |

**Energia**
| Budynek | Ikona | Teren | Koszt | 👤 | Produkcja/rok |
|---------|-------|-------|-------|-----|--------------|
| Elektrownia Słoneczna | ☀ | Energetyczny | 40⛏ | 0.25 | +8⚡ |
| Elektrownia Geotermalna | ♨ | Tylko wulkan | 100⛏ | 0.25 | +25⚡ |
| Elektrownia Jądrowa ² | ☢ | Energetyczny | 200⛏ 50⚡ | 0.50 | +60⚡ −2⛏ |

**Żywność i woda**
| Budynek | Ikona | Teren | Koszt | 👤 | Produkcja/rok |
|---------|-------|-------|-------|-----|--------------|
| Farma | 🌾 | Rolniczy | 30⛏ 20💧 | 0.25 | +10🌿 −1💧 |
| Studnia | 💧 | Rolniczy | 25⛏ | 0.25 | +6💧 |

**Populacja i logistyka**
| Budynek | Ikona | Teren | Koszt | 👤 | Produkcja/rok |
|---------|-------|-------|-------|-----|--------------|
| Habitat | 🏠 | Populacja | 80⛏ 20⚡ | 0.25 | −3⚡, +3 miejsca mieszkalne |
| Magazyn | 🏗 | Wszędzie | 50⛏ | 0.25 | +200 pojemności każdego |

**Nauka**
| Budynek | Ikona | Teren | Koszt | 👤 | Produkcja/rok |
|---------|-------|-------|-------|-----|--------------|
| Stacja Badawcza | 🔬 | Badawczy | 70⛏ 30⚡ | 0.25 | +5🔬 −4⚡ |

**Kosmos**
| Budynek | Ikona | Teren | Koszt | 👤 | Produkcja/rok |
|---------|-------|-------|-------|-----|--------------|
| Wyrzutnia Rakietowa ³ | 🚀 | Wszędzie | 300⛏ 150⚡ | 0.50 | −10⚡ |
| Stocznia ⁴ | ⚓ | Wszędzie | 200⛏ 100⚡ | 0.50 | −5⚡ |

¹ Wymaga technologii **Głębokie Wiercenia**
² Wymaga technologii **Energetyka Jądrowa**
³ Wymaga technologii **Rakietnictwo**
⁴ Wymaga technologii **Eksploracja** — buduje statki kosmiczne (patrz sekcja 14)

### Koszty POP
- Standardowe budynki wymagają **0.25 POP** — z 2 POPami startu możesz postawić 8 budynków
- Złożone instalacje (Elektrownia Jądrowa, Wyrzutnia) wymagają **0.50 POP**
- POPy zatrudnione w budynkach są **zablokowane** — nie można ich użyć do innych celów
- **Rozbiórka** budynku natychmiast zwalnia przypisane POPy

### Bonusy terenu
Budynki stawiane na odpowiednim terenie otrzymują mnożnik produkcji:
- Kopalnia na **Górach** → ×1.6 minerałów
- Kopalnia na **Kraterze** → ×1.8 minerałów
- Elektrownia na **Pustyni** → ×1.5 energii
- Elektrownia na **Wulkanie** → ×2.0 energii ← najlepsze źródło energii!
- Farma na **Równinie** → ×1.4 organiki

### Rozbiórka
Kliknij pole z budynkiem → **[ Rozbiórka — zwrot 50% ]** → odzyskujesz połowę kosztów budowy.

---

## 12. Drzewo technologii

Panel technologii otwierasz przyciskiem **[ NAUKA 🔬 ]** w górnym lewym rogu mapy planety.

Technologie kupujesz za **punkty nauki** (🔬) produkowane przez Stacje Badawcze.

### 5 gałęzi technologicznych

**⛏ Wydobycie**
| Technologia | Koszt | Efekt |
|-------------|-------|-------|
| Zaawansowane Wydobycie | 80🔬 | +30% produkcji minerałów ze wszystkich kopalni |
| Głębokie Wiercenia | 200🔬 | +50% minerałów + odblokowanie Huty |

**⚡ Energia**
| Technologia | Koszt | Efekt |
|-------------|-------|-------|
| Wydajne Panele Słoneczne | 80🔬 | +30% produkcji energii ze wszystkich elektrowni |
| Energetyka Jądrowa | 220🔬 | +60% energii + odblokowanie Elektrowni Jądrowej |

**🌿 Biologia**
| Technologia | Koszt | Efekt |
|-------------|-------|-------|
| Hydroponika | 80🔬 | +40% organiki, −20% zużycia wody przez populację |
| Inżynieria Genetyczna | 200🔬 | +70% organiki, +30% wzrost populacji |

**🏗 Budownictwo**
| Technologia | Koszt | Efekt |
|-------------|-------|-------|
| Planowanie Urbanistyczne | 80🔬 | +5 morale/rok |
| Arkologie | 180🔬 | +8 morale/rok, −15% zużycia organiki przez populację |

**🚀 Kosmos**
| Technologia | Koszt | Efekt |
|-------------|-------|-------|
| Kartografia Orbitalna | 100🔬 | +40% produkcji badań naukowych |
| Górnictwo Kosmiczne | 250🔬 | ×2.0 produkcji minerałów (wymaga: Kartografia + Wydobycie) |
| Rakietnictwo | 300🔬 | Odblokowanie Wyrzutni Rakietowej (wymaga: Kartografia) |
| Eksploracja | 200🔬 | Odblokowanie Stoczni + Statku Naukowego (wymaga: Rakietnictwo) |
| Kolonizacja | 300🔬 | Odblokowanie Statku Kolonijnego (wymaga: Eksploracja) |
| Logistyka Międzyplanetarna | 250🔬 | Automatyczne drogi handlowe (wymaga: Kolonizacja) |

### Zasady
- Technologie w **T2** wymagają zbadania T1 z tej samej gałęzi (lub innej — patrz opis)
- **Górnictwo Kosmiczne** wymaga obu: Kartografii Orbitalnej I Zaawansowanego Wydobycia
- **Rakietnictwo** wymaga Kartografii Orbitalnej — bez niej nie wiesz gdzie lecieć
- Po zbadaniu technologii mnożniki działają **natychmiast** na wszystkie istniejące budynki
- Zablokowane budynki widać w panelu budowania z ikoną 🔒

---

## 13. Cywilizacja — populacja (system POP) i morale

### Widget cywilizacji
W lewym panelu (góra) zawsze widoczne:
```
👤 POP: 2 / 4          ← populacja / miejsca mieszkalne
██████░░░░ 45%          ← pasek postępu wzrostu następnego POPa
Zatrudnieni: 1.50 / 2  ← POPy w budynkach / total
Wolni: 0.50             ← POPy dostępne do budowy/ekspedycji
Morale: 65%             ← kolor zależny od wartości
Epoka: Pierwotna
```

### System POP — dyskretna populacja
Populacja to **POPy** — dyskretne jednostki. Gra startuje z **2 POPami** i **4 miejscami mieszkalnymi**.

Każdy POP konsumuje surowce co rok:
| Surowiec | Konsumpcja per POP/rok |
|----------|----------------------|
| 🌿 Organika | 3.0 |
| 💧 Woda | 1.5 |
| ⚡ Energia | 1.0 |
| ⛏ Minerały | 0.5 |

**Przykład:** 2 POPy konsumują rocznie: −6🌿  −3💧  −2⚡  −1⛏

### Wzrost populacji
Nowy POP rodzi się gdy **pasek wzrostu** osiągnie 100%. Tempo zależy od:

- **Morale** — wyższe = szybciej (bazowo ~20 lat na nowego POPa)
- **Żywność** (organics/capacity):
  | Poziom | Modifier |
  |--------|----------|
  | > 60% | ×1.5 — nadwyżka |
  | 30–60% | ×1.0 — wystarczy |
  | 10–30% | ×0.4 — racjonowanie |
  | < 10% | ×0.0 — głód = ZERO wzrostu |
- **Mieszkania:**
  | Warunek | Modifier |
  |---------|----------|
  | pop < 70% housing | ×1.3 — dużo miejsca |
  | pop < housing | ×1.0 — wystarczy |
  | pop >= housing | ×0.0 — brak miejsca = ZERO wzrostu |

**Minimalne tempo:** 5 lat na POPa przy idealnych warunkach (cap).

### Śmierć POPa
Gdy organika jest bliska zeru (< 2% pojemności) przez **5 lat z rzędu**, ginie 1 POP. Minimum 1 POP (cywilizacja nie wygasa całkowicie).

### Zatrudnienie i kara
- **Zatrudnieni POPy** = suma popCost wszystkich aktywnych budynków
- **Zablokowane POPy** = załogi ekspedycji (0.5 POP per misja)
- **Wolne POPy** = populacja − zatrudnieni − zablokowani

Gdy wolnych POPów = 0, **nie możesz budować ani wysyłać ekspedycji**.

**Kara za niedobór POPów:** Gdy POP zginie, ale budynki nadal stoją, produkcja WSZYSTKICH budynków spada proporcjonalnie. Rozwiązanie: rozbierz nadmiarowe budynki.

### Morale (0–100)
Morale to wypadkowa **6 składników** — każdy wpływa na jakość życia:

| Składnik | Max | Co go podnosi |
|----------|-----|--------------|
| Mieszkania | 20 | Pop < 70% pojemności Habitatów |
| Żywność | 20 | Organika > 50% magazynu |
| Woda | 15 | Woda > 40% magazynu |
| Energia | 15 | Energia > 20% magazynu |
| Zatrudnienie | 15 | Niski odsetek bezrobotnych POPów |
| Bezpieczeństwo | 15 | Stabilność orbitalna planety > 80% |

Morale zmienia się **powoli** (inercja 12%/rok) — nie skacze z dnia na dzień.
Zbadane technologie mogą dodawać stały bonus do morale każdego roku.

### Epoki cywilizacyjne
| Epoka | Wymagana populacja (POPy) |
|-------|--------------------------|
| Pierwotna | start (0 POPów) |
| Industrialna | 10 POPów |
| Kosmiczna | 30 POPów |
| Międzyplanetarna | 80 POPów |

### Kryzysy

**⚠ Niepokoje społeczne**
Warunek: morale < 30 przez 5 kolejnych lat gry.
Efekt:
- Wszyscy budynki produkują **−30% mniej** przez 10 lat
- EventLog i auto-slow alarmują
- Po 10 latach kara odpada (kryzys ustępuje)

Zapobieganie: pilnuj morale > 40. Priorytet — Habitat (mieszkania) i dostawy żywności/wody.

**💀 Głód**
Warunek: organika bliska 0 przez 5 lat z rzędu.
Efekt: utrata POPa, EventLog ostrzeżenie.

Zapobieganie: Farmy > Studnie > Magazyny. Zawsze miej nadwyżkę organiki przed rozbudową populacji.

---

## 14. Ekspedycje kosmiczne

Gdy twoja cywilizacja zbadała **Rakietnictwo** i zbudowała **Wyrzutnię Rakietową**, możesz wysyłać misje do innych ciał niebieskich w układzie.

### Panel ekspedycji

Panel **EKSPEDYCJE** wyświetla się po lewej stronie widoku kosmicznego (pod Dziennikiem Zdarzeń). Kliknij nagłówek, aby rozwinąć lub zwinąć listę aktywnych misji.

### Wymagania do wysłania misji

| Warunek | Jak zdobyć |
|---------|-----------|
| Technologia **Rakietnictwo** (300🔬) | Zbadaj przez panel NAUKA w widoku planety |
| Budynek **Wyrzutnia Rakietowa** | Postaw na dowolnym terenie po zbadaniu Rakietnictwa |
| Surowce startowe | 150⛏ + 200⚡ + 50🌿 za każdą misję |
| Załoga | **0.5 POP** wolnych (zablokowane na czas misji, wracają po zakończeniu) |

### Typy ekspedycji

| Typ | Ikona | Główny zarobek | Wymagania |
|-----|-------|---------------|-----------|
| **Wydobycie** | ⛏ | Minerały z asteroidy/planety | Wyrzutnia |
| **Naukowa** | 🔬 | Punkty nauki + oznaczenie celu jako „zbadany" | Wyrzutnia + 🛸 Statek Naukowy w hangarze |
| **Kolonizacyjna** | 🚢 | Założenie nowej kolonii na zbadanym celu | 🚢 Statek Kolonijny w hangarze + cel zbadany |
| **Transport** | 📦 | Dostawa zasobów do innej kolonii | Wyrzutnia + ≥2 kolonie |

### Dostępne cele

Każde ciało niebieskie w układzie może być celem. Sortowane wg odległości:

| Typ celu | Ikona | Co przynosi |
|----------|-------|------------|
| Asteroida 🪨 | | Minerały (wg zawartości żelaza) |
| Kometa 🧊 | | Woda (100–300), organika, nauka |
| Planetoida 🪨 | | Minerały |
| Inna planeta 🌍 | | Minerały + woda + ewent. organika |

### Czas podróży

```
Czas podróży = odległość_AU × 2 lata (minimum 2 lata)
Przykład: cel w odległości 2.5 AU → podróż w jedną stronę = 5 lat gry
```

Zasoby dostarczane są **przy przybyciu** (nie przy powrocie). Ekspedycja wraca automatycznie.

### Zdarzenia losowe

Przy każdym przybyciu los losuje wynik misji:

| Wynik | Szansa | Efekt |
|-------|--------|-------|
| ⭐ Sukces z bonusem | 10% | Zarobek ×1.5 |
| ✓ Normalny sukces | 75% | Zarobek ×1.0 |
| △ Częściowy sukces | 10% | Zarobek ×0.5 |
| 💥 Katastrofa | 5% | Brak zarobku (załoga odblokowana) |

### Jak wysłać ekspedycję

1. Rozwiń panel **EKSPEDYCJE** klikając nagłówek
2. Kliknij **[ + Wyślij nową ekspedycję ]**
3. W oknie modalu:
   - Wybierz typ misji (⛏ Wydobycie lub 🔬 Naukowa)
   - Kliknij wybrany cel z listy
   - Sprawdź koszt i szacowany zarobek
4. Kliknij **[ WYŚLIJ EKSPEDYCJĘ ]**

Ekspedycja pojawia się na liście ze statusem i datą przybycia.

### Stany ekspedycji w panelu

| Status | Kolor | Znaczenie |
|--------|-------|-----------|
| `→ [nazwa]` | Niebieski | W drodze do celu |
| `↩ [nazwa]` | Zielony | Powraca (zasoby już dostarczone) |

---

## 15. Kolonizacja innych ciał

Gdy twoja cywilizacja dojrzeje, możesz ekspandować poza planetę macierzystą — zakładać kolonie na skalistych planetach, księżycach i planetoidach w całym układzie.

### Łańcuch postępu: od zera do kolonii

Kolonizacja wymaga pełnego łańcucha technologii, budynków i statków. Oto kroki:

```
1. Zbadaj Kartografię Orbitalną (100🔬)
2. Zbadaj Rakietnictwo (300🔬) → zbuduj Wyrzutnię Rakietową 🚀
3. Zbadaj Eksplorację (200🔬) → zbuduj Stocznię ⚓
4. W Stoczni zbuduj Statek Naukowy 🛸 (zakładka 🚀 → sekcja FLOTA)
5. Wyślij ekspedycję naukową na cel → cel staje się „zbadany"
6. Zbadaj Kolonizację (300🔬)
7. W Stoczni zbuduj Statek Kolonijny 🚢
8. Wyślij ekspedycję kolonizacyjną na zbadany cel
9. Statek Kolonijny zużyty z hangaru — nowa kolonia powstaje!
```

### Nowe technologie

| Technologia | Gałąź | Koszt | Wymaga | Efekt |
|-------------|-------|-------|--------|-------|
| **Eksploracja** | 🚀 Kosmos T3 | 200🔬 | Rakietnictwo | Odblokowanie Stoczni + Statku Naukowego |
| **Kolonizacja** | 🚀 Kosmos T3 | 300🔬 | Eksploracja | Odblokowanie Statku Kolonijnego |
| **Logistyka Międzyplanetarna** | 🏗 Budownictwo T3 | 250🔬 | Kolonizacja | Automatyczne drogi handlowe |

### Stocznia i Flota

Statki kosmiczne **nie są budynkami** — buduje się je w **Stoczni** (budynek hex), a po wybudowaniu trafiają do **hangaru floty** kolonii.

| Statek | Ikona | Koszt | Czas budowy | Wymagana tech | Uwagi |
|--------|-------|-------|-------------|---------------|-------|
| **Statek Naukowy** | 🛸 | 250⛏ 150⚡ | 8 lat | Eksploracja | Wymagany do ekspedycji naukowych |
| **Statek Kolonijny** | 🚢 | 400⛏ 200⚡ 100🌿 | 12 lat | Kolonizacja | **Zużywany** przy wysłaniu ekspedycji! |

**Jak budować statki:**
1. Otwórz zakładkę 🚀 Ekspedycje w panelu bocznym (widok kosmiczny)
2. Sekcja **FLOTA** (pod statusem gotowości)
3. Status stoczni: ✅ = gotowa, ❌ = brak budynku na mapie
4. Kliknij **[Buduj 🛸]** lub **[Buduj 🚢]** — zasoby pobrane natychmiast
5. Pasek postępu pokazuje stan budowy (lata gry)
6. Gotowy statek trafia do **hangaru** — widoczny pod paskiem
7. Stocznia może budować **1 statek naraz**

### Ekspedycja naukowa (scientific)

Ekspedycja naukowa to **zwiad** — wysyłasz ją na dowolne ciało niebieskie, aby je zbadać.

**Wymagania:**
- Wyrzutnia Rakietowa na planecie
- Statek Naukowy 🛸 **w hangarze floty** (zbudowany w Stoczni)
- 0.5 wolnego POPa (załoga)
- 150⛏ + 200⚡ + 50🌿 (koszt startu)

**Efekt:** Po dotarciu cel otrzymuje flagę **„zbadany"** (explored). Bez tego nie można tam wysłać ekspedycji kolonizacyjnej.

### Ekspedycja kolonizacyjna (colony)

Ekspedycja kolonizacyjna **zakłada nową kolonię** na zbadanym celu.

**Wymagania:**
- Wyrzutnia Rakietowa na planecie
- Statek Kolonijny 🚢 **w hangarze floty** (zbudowany w Stoczni)
- Cel musi być **zbadany** (wysłano wcześniej ekspedycję naukową)
- 2 wolne POPy (załoga — zostają na nowej kolonii!)
- 500⛏ + 300⚡ + 200🌿 + 100💧 (koszt startu)

**Czas podróży:** `odległość_AU × 2 lata` (minimum 3 lata)

**Efekt:** Po dotarciu:
- **Statek Kolonijny zużyty z hangaru** (nie wraca!)
- POPy „przeniesione" — odblokowane na źródle, dodane na celu
- Nowa kolonia startuje z 2 POP + zasoby startowe (200⛏, 150⚡, 150🌿, 100💧, 50🔬)
- Automatycznie budowana jest Stolica (🏛) na nowej kolonii

**Losowy wynik przy dotarciu:**

| Wynik | Szansa | Efekt |
|-------|--------|-------|
| 💥 Katastrofa | 5% | Kolonia NIE powstaje, POPy giną |
| ⚠ Trudny start | 15% | Kolonia powstaje, ale −50% zasobów startowych |
| ✓ Normalny | 70% | Kolonia powstaje z pełnymi zasobami |
| ⭐ Świetne warunki | 10% | Kolonia powstaje + bonus zasobów (+50%) |

### Przełączanie między koloniami

- W panelu bocznym (zakładka 🚀 Ekspedycje) widzisz **listę kolonii** po prawej
- Kliknij nazwę kolonii → otwiera się jej mapa (globus 3D)
- **Dwuklik na planetę** z kolonią w widoku kosmicznym → też otwiera globus
- Każda kolonia ma **własne surowce, populację i budynki** — nie współdzielą zasobów automatycznie
- **Technologie są wspólne** — zbadane tech obowiązują we wszystkich koloniach
- Przycisk **[← Wróć]** lub **ESC** zamyka mapę kolonii i wraca do widoku kosmicznego

### Rozmiary map kolonii

Mapa hex nowej kolonii zależy od typu ciała niebieskiego:

| Typ ciała | Rozmiar siatki | Uwagi |
|-----------|---------------|-------|
| Planeta skalista | 12×10 | Pełna planeta |
| Planeta lodowa | 10×8 | Mniejsza użyteczna powierzchnia |
| Duży księżyc | 8×6 | Mały satelita |
| Mały księżyc | 6×5 | Mikro-satelita |
| Planetoid | 6×4 | Najmniejsze ciało |

---

## 16. Zdarzenia losowe (tymczasowo wyłączone)

> **Uwaga:** System zdarzeń losowych jest obecnie **wstrzymany** w celu dopracowania. Zdarzenia nie pojawiają się w grze. Poniższy opis dotyczy przyszłej wersji.

W trakcie gry losowo zdarzają się wydarzenia wpływające na twoje kolonie — katastrofy, odkrycia, zmiany społeczne i fenomeny kosmiczne.

### Jak działają zdarzenia

- Zdarzenia losowane są **co 8–25 lat gry** (losowy cooldown)
- Dotyczą **losowej kolonii** (nie zawsze tej, którą aktualnie przeglądasz)
- Powiadomienie pojawia się w prawym górnym rogu ekranu z opisem i efektami
- Efekty nakładane są natychmiast lub trwają przez określoną liczbę lat
- Dziennik zdarzeń (lewy dół) notuje każde zdarzenie

### Kategorie zdarzeń

#### ☄ Katastrofy naturalne (zagrożenia)

| Zdarzenie | Ikona | Efekt | Czas |
|-----------|-------|-------|------|
| **Deszcz meteorów** | ☄ | −20% produkcji, −8 morale, szansa na zniszczenie budynku | 3 lata |
| **Rozbłysk słoneczny** | ☀ | −30% energii, −5 morale | 3 lata |
| **Trzęsienie gruntu** | 🌋 | Szansa na zniszczenie budynku, −10 morale | natychmiastowe |
| **Epidemia** | 🦠 | −1 POP, −15 morale, −30% organiki (gdy pop ≥ 5) | 5 lat |
| **Erupcja wulkanu** | 🌋 | 2 nowe wulkany na mapie, +50⛏ (wyrzut minerałów) | natychmiastowe |

#### 💎 Odkrycia i szanse

| Zdarzenie | Ikona | Efekt | Czas |
|-----------|-------|-------|------|
| **Odkrycie złóż** | 💎 | +200⛏ jednorazowo | natychmiastowe |
| **Anomalia naukowa** | ✦ | +100🔬, anomalia na mapie → po 5 latach: +200🔬 | łańcuch zdarzeń |
| **Źródło geotermalne** | ♨ | +50⚡, nowe pole wulkaniczne na mapie | natychmiastowe |
| **Sprzyjający wiatr słoneczny** | 💨 | +25% produkcji energii | 10 lat |

#### 👶 Zdarzenia społeczne

| Zdarzenie | Ikona | Warunek | Efekt | Czas |
|-----------|-------|---------|-------|------|
| **Wyż demograficzny** | 👶 | morale ≥ 70 | +1 POP, +5 morale | 5 lat |
| **Bunt kolonistów** | ✊ | morale < 30 | −50% produkcji, −10 morale | 3 lata |
| **Innowacja** | 💡 | zawsze | +80🔬, +5 morale | natychmiastowe |

#### 🌑 Zdarzenia kosmiczne

| Zdarzenie | Ikona | Efekt | Czas |
|-----------|-------|-------|------|
| **Przelot komety** | ☄ | +50💧, +20🔬, +3 morale | natychmiastowe |
| **Zaćmienie** | 🌑 | −50% energii, +5 morale (spektakl!) | 1 rok |

### Anomalie na mapie

Niektóre zdarzenia tworzą **anomalię** na losowym hexie mapy planety. Anomalie widoczne są na globusie jako specjalny znacznik. Zdarzenie łańcuchowe (np. Anomalia naukowa) automatycznie rozwiązuje się po kilku latach, dając dodatkowe nagrody.

### Wskazówki

- **Utrzymuj morale > 40** — zapobiega buntom i odblokowuje wyże demograficzne
- **Buduj zapas surowców** — katastrofy mogą obciąć produkcję na kilka lat
- **Wulkany to szansa** — erupcja tworzy nowe pola wulkaniczne pod elektrownie geotermalne
- Zdarzenia są losowe — nie da się ich kontrolować, ale da się przygotować

---

## 17. Ekspansja międzyplanetarna

Gdy masz co najmniej **2 kolonie**, otwierają się mechaniki zarządzania imperium — transfery zasobów, drogi handlowe i migracja populacji.

### Ręczny transfer zasobów

Przycisk **[ TRANSPORT ]** w zakładce Ekspedycje (🚀) otwiera okno transferu.

**Jak wysłać transport:**
1. Otwórz zakładkę 🚀 w panelu bocznym (widok kosmiczny)
2. Kliknij **[ TRANSPORT ]** (dostępny gdy masz ≥ 2 kolonie)
3. Wybierz kolonię docelową z listy
4. Ustaw ilości surowców do wysłania (slidery)
5. Kliknij **[ WYŚLIJ ]**

**Parametry transportu:**
- Koszt załogi: **0.5 POP** (zablokowany na czas podróży, wraca po zakończeniu)
- Czas podróży: `odległość_AU × 2 lata` (minimum 2 lata)
- Zasoby pobierane natychmiast z kolonii źródłowej
- Zasoby dostarczane do kolonii docelowej **po dotarciu**

### Automatyczne drogi handlowe

Po zbadaniu technologii **Logistyka Międzyplanetarna** (250🔬, wymaga: Kolonizacja) system automatycznie tworzy drogi handlowe między wszystkimi koloniami.

**Jak działają:**
- **Co 10 lat gry** system sprawdza każdą trasę handlową
- Jeśli kolonia A ma **nadwyżkę** surowca (> 60% pojemności) a kolonia B ma **niedobór** (< 30% pojemności), następuje automatyczny transfer
- Transfer: do 50 jednostek lub 10% zapasów nadwyżki (mniejsza wartość)
- Kierunek jest **dynamiczny** — surowce płyną tam, gdzie są potrzebne
- Nowe drogi handlowe tworzone automatycznie gdy zakładasz kolejne kolonie

### Migracja populacji

POPy mogą migrować między koloniami automatycznie na podstawie morale.

**Reguły automatycznej migracji:**
- System sprawdza co **20 lat gry**
- Jeśli kolonia A ma morale > 70 (przyciąga) i kolonia B ma morale < 40 (odpycha):
  - **10% szans** na migrację 1 POPa z B do A
  - Warunek: A musi mieć wolne mieszkania, B musi mieć > 2 POPy
  - Migracja jest natychmiastowa (uproszczenie)
- Dziennik zdarzeń notuje każdą migrację

**Wskazówka:** Utrzymuj morale na podobnym poziomie we wszystkich koloniach, żeby zapobiec odpływowi populacji z mniej rozwiniętych osad.

### Przegląd imperium

W zakładce 🚀 (Ekspedycje) widzisz przegląd wszystkich kolonii:
- Nazwa i typ ciała (planeta/księżyc/planetoid)
- Populacja i morale
- Aktywne drogi handlowe
- Kliknij kolonię → otwiera jej mapę

### Specjalizacja kolonii (emergentna)

Gra nie wymusza specjalizacji — wynika ona naturalnie z zasobów:
- **Kolonia wydobywcza**: planetoid z kraterami → kopalnie → eksport minerałów
- **Kolonia naukowa**: planeta z anomaliami → stacje badawcze → eksport nauki
- **Kolonia rolnicza**: planeta z lasami/równinami → farmy → eksport organiki
- **Kolonia energetyczna**: planeta z wulkanami → geotermalne → eksport energii

Drogi handlowe i transporty tworzą naturalną sieć zaopatrzenia imperium.

---

## 18. Zapis i wczytywanie gry

### Automatyczny zapis (autosave)
Gra zapisuje się automatycznie co **10 000 lat gry** w pamięci przeglądarki (localStorage).

### Ręczny zapis
Przycisk **[💾]** w prawym górnym rogu widoku kosmicznego.
Po zapisaniu pojawia się powiadomienie: *"💾 Zapisano (X lat)"*

### Nowa gra
Przycisk **[🗑]** → dialog potwierdzenia → kasuje zapis i przeładowuje stronę.

### Dźwięk
Przycisk **[🔊/🔇]** → włącz/wyłącz efekty dźwiękowe (Web Audio API, bez plików audio).

### Ważne
- Zapis jest **per przeglądarka** — nie przenosi się między urządzeniami
- Wyczyść cache przeglądarki = utrata zapisu
- Zapis obejmuje: układ planetarny, czas gry, wszystkie kolonie (surowce, budynki, populacja per kolonia), technologie, ekspedycje, drogi handlowe, zbadane ciała, zdarzenia losowe
- Stare zapisy (wersja 4) są automatycznie migrowane do nowego formatu (wersja 5) przy wczytaniu

---

*Manual aktualizowany wraz z rozwojem gry.*

---

## Obraz Operacyjny floty (M1 + tryb Y + rejestr K3)

**Plakietki flotowe (mapa 3D):** nad flotami/klastrami statków wiszą plakietki (`⚑ Nazwa ×N` / `◆ ×N`);
kolor = stan (szary bezczynny · cyan ruch · zielony misja · bursztyn alert · czerwony walka), kropka = alert.
Klik plakietki zaznacza cały zbiór. Statki poza kadrem → strzałki przy krawędziach. Prawa krawędź: chipy
układów z Twoimi statkami (`◉` = tu jesteś; klik innego = przełączenie układu; `🌀 ×N` = tranzyt → REJESTR).
Wyłącznik: menu ☰ → „Plakietki floty".

**Tryb taktyczny — klawisz `Y`:** kamera płynnie przechodzi w rzut z góry („stół sztabowy"), statki stają
się glifami o stałym rozmiarze (□ transport · △ bojowy · ◇ nauka · ○ zwiad · ⬠ kolonizacyjny; wróg
niezidentyfikowany = `?`), włączają się sensor ringi i stożki przechwycenia, orbity robią się wyraźne,
a na orbitach pojawiają się wskaźniki ruchu: chevron kierunku + znaczniki przyszłych pozycji (`+1`, `+2`…)
oraz — dla zaznaczonego statku — pozycja planety-celu w roku przylotu (`⏱rok`). Własne statki w locie mają
„duchy ETA" w punkcie celu (`⏱rok`; `~rok` pulsuje = cel ruchomy). Ponowne `Y` lub otwarcie dowolnego
panelu przywraca wszystko do stanu sprzed trybu. Rozkazy (PPM) działają identycznie jak poza trybem.

**Rejestr floty (Dowództwo → TAKTYKA SYSTEMU → [REJESTR]):** sortowalna tabela całej floty
(Nazwa·Rola·Flota·Układ·Stan·Zadanie·ETA·⛽·⚠) z chipami filtrów (układy + 🌀 tranzyt, role) i szukajką;
klik wiersza = selekcja, 🎯 = skok na mapę (w innym układzie najpierw przełącza układ), checkboxy = pasek
„Przypisz (N)". Pod tabelą zwijana OŚ CZASU: paski misji (kolory jak trasy na mapie), linia „teraz",
zoom scrollem, klik paska = selekcja. Oś jest tylko do odczytu — rozkazy wydajesz na mapie.

**Dok taktyczny (tylko w trybie `Y`):** na dole ekranu pojawia się półprzezroczysty pas dowodzenia —
„co się dzieje TERAZ, tutaj" (bieżący układ + statki w tranzycie międzygwiezdnym). Po lewej dwie zakładki:
- **[LISTA]** — kompaktowe wiersze (glif w kolorze stanu, nazwa, aktywność, ETA, pasek paliwa, kropka
  alertu); alerty na górze, potem najbliższe ETA. **Klik** wiersza = zaznaczenie + krótki „ping" na
  pozycji statku (kamera nieruszona); **dwuklik** = dolot kamery; **najechanie** rozjaśnia trasę statku
  i pulsuje jego „ducha ETA". Klik statku na mapie przewija dok do jego wiersza.
- **[OŚ]** — te same statki jako kompaktowa oś czasu (paski misji + linia „teraz"); najechanie na pasek
  pokazuje, gdzie będzie planeta-cel w danym roku (marker `~rok`).

Po prawej stronie pasa — **mini-panel** wybranego statku: glif+nazwa, rola, aktywność, ETA, paski paliwa
(+warp), alerty. Dwie akcje: **✕ Anuluj rozkaz** (widoczna, gdy statek ma aktywny/zablokowany rozkaz ruchu
— anuluje TYLKO rozkaz, misje/pętle zostają w Dowództwie) i **🎯 Rejestr** (otwiera Dowództwo → REJESTR z
tym statkiem). Przy zaznaczeniu wielu statków lub floty mini-panel pokazuje tylko podsumowanie — akcje
zbiorcze masz w panelu grupy / dowodzenia flotą. Pas zwijasz strzałką **▾** do samego paska zakładek
(stan zapamiętywany). Kółko myszy nad pasem przewija listę (poza pasem = zoom kamery).

## Strefy wpływów (mapa galaktyczna)

Na mapie galaktycznej (**Dowództwo → STRATCOM**, klawisze `G`/`M`) każde imperium — Twoje i obce —
pokazane jest jako **strefa wpływów**: posiadane układy emitują pole, którego pola bliskich kolonii
zlewają się w organiczny kształt z subtelnym **tintem** w barwie imperium i **przerywaną izolinią** na
granicy. Dwa odległe skupiska = dwa „bąble" w tej samej barwie; gdy skolonizujesz układ pomiędzy, bąble
**zrastają się na oczach** (krótki rozbłysk granicy).

- **Barwa = tożsamość.** Kolor mówi KTO (stały kolor imperium). Barwę swojego imperium wybierasz na
  ekranie startowym (paleta 8 kolorów, domyślnie cyjan). Obce imperia mają własne, rozróżnialne kolory.
  Wrogość to tylko modyfikator — granica imperium, z którym jesteś w **wojnie**, pulsuje.
- **Rozmiar pola = rozwój.** Im więcej populacji i budynków w układzie, tym większe pole wpływu.
- **Mgła wojny.** Twoje terytorium widzisz zawsze. Obce: od kontaktu (`intel ≥ contact`) w pełnym
  kolorze; przy plotce (`rumor`) tylko szary zarys bez wypełnienia; nieznane — nic.
- **Romb właściciela** przy gwieździe oznacza układ pod kontrolą (Twój zawsze; obcy przy kontakcie).
- **Granica sporna** (pola dwóch imperiów stykają się) jest jaśniejsza / podwójna — zapowiedź napięcia
  granicznego.
- Panel układu pokazuje wiersz **„Terytorium: <imperium>"**; legenda radaru — próbki strefy, granicy
  i rombu.

Warstwa jest zawsze włączona (bez przełącznika). Działa w widoku 2D (mały podgląd) i 3D (duży panel).
