# Modele 3D statków — przewodnik właściciela

Jak zrobić nowy model statku i wstawić go do gry — bez Blendera i bez terminala.
(ARC COMBAT VISUALS: CV-1a — rama i hardpointy, CV-1b — normalizator, CV-1c — Model Workshop.)

## Krok po kroku

1. **Midjourney** — obraz statku zgodny ze standardem niżej (jedna dysza, jasny kadłub, cyjan tylko na światłach).
2. **Meshy** — model 3D z obrazu; pobierz jako **GLB** (2K PBR, ok. 10–15 tys. trójkątów).
3. **Nazwij plik nazwą slotu**, np. `warp_frigate.glb` (lista slotów niżej). Inna nazwa też zadziała — program
   zapyta, do którego slotu wstawić model, i poprosi o potwierdzenie („t").
4. **Zamknij grę w przeglądarce** (zapis plików przeładowuje kartę otwartą przez Live Server).
5. **Przeciągnij plik GLB na `tools/ship-models/normalize-ship.bat`** (w Eksploratorze Windows). Okno samo:
   skopiuje plik do `assets/models/ships/incoming/`, przygotuje model dla gry, pokaże raport i poczeka na klawisz.
6. **Przeczytaj raport** (zostaje też w `assets/models/ships/incoming/<slot>.report.txt`): ✔ spełnia standard,
   ⚠ odstępstwo (model działa, ale następny warto poprawić), ℹ informacja, ☐ tego program nie zmierzy — sprawdź oczami.
7. **Obejrzyj w grze** — otwórz grę, konsola (F12), polecenia bez cudzysłowów:
   `KOSMOS.debug.cvParade()` (24 statki w locie, każdy slot) albo `KOSMOS.debug.cvBattle({warp: 1})` /
   `KOSMOS.debug.cvBattle()` (bitwa okrętów). Po teście **F5 bez zapisu** (statki testowe nie mogą trafić do zapisu).
8. **Model Workshop** — kliknij na modelu dziób, dyszę, wieżyczki i światła (sekcja niżej).

Z terminala to samo: `npm run ship -- warp_frigate` albo `node tools/ship-models/normalize-ship.mjs warp_frigate`
(opcje: `--dry` — tylko raport; `--podglad` — kandydat do obejrzenia w grze bez podmiany slotu,
`await KOSMOS.debug.cvIncoming(1)`; `--help`).

## Model Workshop — klikanie dziobu, dyszy, wieżyczek i świateł (CV-1c)

**Adres** (gra i Workshop idą przez Live Server w VS Code — „Go Live", port 5500):
**http://127.0.0.1:5500/tools/model-workshop/index.html**
(port widać na pasku stanu VS Code: „Port : 5500"; jeśli jest inny, podmień liczbę w adresie).

Kolejność (pomoc jest też na stronie):

1. **Wybierz model** z listy u góry — Twoje okręty są pierwsze.
2. **1 Dziób** — kliknij czubek dziobu. Kierunek bierzemy z osi najdłuższej modelu (dziób albo rufa — wg strony kliku);
   żółta strzałka nad statkiem pokazuje dziób. Klik przy środku statku (np. wieża) jest odrzucany z komunikatem, a „góra"
   statku zostaje taka jak w pliku — statek nie przewróci się na bok.
3. **2 Dysza** — kliknij wylot silnika; smuga pojawia się od razu (jak w grze). Przy włączonym „wyśrodkuj w otworze"
   (domyślnie) klik w otwór (pierścień, dzwon silnika) ustawia dyszę w ŚRODKU wylotu i dobiera promień — nawet gdy klik
   trafił w ściankę wewnątrz. Kierunek „za rufę" pasuje prawie zawsze; suwak „promień dyszy" — grubość smugi.
4. **3 Wieżyczki** — klikaj działa. **LUSTRO** (włączone, klawisz `M`) stawia bliźniaka po drugiej burcie (W1 + W2…).
5. **4 Światła** — wybierz kolor (cyjan / czerwony / zielony / biały) i rozmiar, klikaj okna i światła pozycyjne. LUSTRO jak
   wyżej (bliźniak po drugiej BURCIE); opcja „lustro zamienia czerwony ↔ zielony" — dla świateł pozycyjnych. Przycisk
   **„Odległość jak w bitwie"** pokazuje statek tak mały jak w bitwie (ok. 48 px). Punkt nigdy nie jest mniejszy niż 2 px
   na ekranie; światła gasną dopiero, gdy cały statek ma mniej niż ok. 10 px (daleki widok). Punkt na grzbiecie albo pod
   kadłubem widać tylko z tej strony — światła widoczne z każdej strony stawiaj na burtach.
6. **Maska** (suwaki) — tylko modele z cyjanem na teksturze (pierścień warp); pod suwakami: ile procent tekstury świeci.
7. **Zapisz do gry** — okno pokaże nazwę slotu i ścieżkę pliku; za pierwszym razem wskaż folder
   `assets/models/ships/hardpoints` (Chrome zapyta o zgodę na zapis). Strona i gra przeładują się same (Live Server),
   Twoje zmiany zostają (pamięć karty). **„Pobierz plik"** — zapas: plik `<slot>.json` do ręcznego przeniesienia do
   `assets/models/ships/hardpoints/`.

Pomyłka: `Ctrl+Z` cofa, `Ctrl+Y` ponawia. Tryb **5 Wybierz** — kliknij punkt, przeciągnij go po kadłubie albo usuń `Del`;
w tym trybie kolor i rozmiar zmieniają zaznaczone światło. Mysz: lewy przycisk — obrót (krótki klik = postaw punkt),
kółko — zoom, prawy — przesuwanie. Podgląd jest liczony **kodem gry** (te same materiały, maska, punkty świetlne i smuga);
przełączniki: „jak wróg", gwiazda F / G / K / M, „obróć jak w grze".

Sprawdzenie w grze: `KOSMOS.debug.cvBattle()` albo `KOSMOS.debug.cvParade()` w konsoli gry, potem **F5 bez zapisu**.
Ponowna normalizacja tego samego modelu (`.bat`) **zachowuje** kliknięte punkty — Workshop nie zmienia pola `source`.

## Standard nowego modelu (rama właściciela F10)

- **jedna dysza silnika na rufie**; kadłub **nie czarny** (jasne płyty czytają się pod każdą gwiazdą);
- **jeden kolor-klucz = jasny cyjan** wyłącznie na oknach / światłach / pierścieniu warp, nigdzie indziej — gra liczy
  z niego prawdziwą emisję (Meshy nie daje map emisji). Maska ma twarde progi: przy domyślnych (barwa 182° ± 12°,
  nasycenie > 0,45, jasność > 0,55) nic od barwy 194° w górę nie świeci — niebiesko-szare płyty zostają ciemne;
- widoczne wieżyczki na okrętach wojennych; **bez napisów i logo**;
- ok. 10–15 tys. trójkątów (więcej — raport ostrzega; liczbę ustawia się w Meshy), tekstury 2K PBR, plik GLB;
- **kierunek dziobu w pliku dowolny** — normalizator sam układa model dziobem w −X.

## Co robi normalizator (`tools/ship-models/normalize-ship.mjs`)

- środek modelu w (0, 0, 0), najdłuższy wymiar 1,0, najdłuższa oś wzdłuż X, **dziób w −X** — zgadnięty z gęstości
  wierzchołków w ostatnich 8 % długości (rufa z dyszami jest gęstsza; 33 / 33 trafień na obecnych modelach);
- scala identyczne wierzchołki i duplikaty, usuwa nieużywane dane;
- tekstury: **kolor bazowy zostaje bajt w bajt** (żadnej ponownej kompresji — cienki cyjan by się rozlał), mapa
  normalnych → WebP bez widocznej straty (near-lossless), metal / szorstkość → WebP; wybrane na arkuszu kontaktowym
  (zbliżenie w grze: PSNR 49–52 dB wobec oryginału — różnicy nie widać);
- zapisuje `<slot>.glb` (2K — gra) i `<slot>@1k.glb` (1K — dla słabszych komputerów, presety Medium / Low, CV-2b);
- **stary model slotu trafia do `assets/models/ships/_archive/`** (poza git) — razem ze starym plikiem hardpointów;
- tworzy albo **scala** `hardpoints/<slot>.json`: punkty kliknięte wcześniej (dziób, dysza, wieżyczki, światła,
  strojenie maski) **przeżywają** ponowną normalizację tego samego modelu; punkty STAREGO modelu slotu nie trafiają na
  nowy kadłub. Ponowne uruchomienie dla tego samego pliku daje te same bajty (można bezpiecznie powtarzać).

**Jak cofnąć podmianę:** skopiuj z `_archive/` pliki `<slot>__<data>.glb` i `<slot>__<data>.json` z powrotem jako
`<slot>.glb` i `hardpoints/<slot>.json` (albo poproś Claude — historia git też trzyma każdą wersję).

## Hardpointy (`assets/models/ships/hardpoints/`)

Plik `<slot>.json` (`schema: kosmos-ship-hardpoints`, wersja 1 — `src/data/ShipHardpointsSchema.js`), współrzędne
w znormalizowanej przestrzeni modelu (środek bbox w 0, najdłuższy wymiar 1,0 — tak samo normalizuje gra). Pola:
`frame` (dziób, góra), `nozzles` (dysza: punkt, kierunek smugi, promień), `weapons` (wieżyczki W1…Wn), `lights`
(punkty świetlne — rysowane zawsze, gdy lista nie jest pusta, razem z maską), `keyColour` (maska koloru-klucza:
`mode` `mask` / `none`, barwa, tolerancja, progi, miękkość, wzmocnienie), `damagePoints`, `source` (plik, sha256,
normalizator, plik wejściowy z `incoming/`). Brak pliku albo plik niepoprawny ⇒ wartości zapasowe (dziób −X) — statek
nigdy nie czeka na plik i nie leci rufą. `hardpoints/incoming/` + `index.json` — kandydaci do podglądu
(`--podglad`, `cvIncoming`); podmiana slotu zdejmuje wpis.

## Stan modeli (CV-1b, 2026-11-11)

- **Sześć okrętów wojennych to modele właściciela** (fregata, niszczyciel, pancernik — bez warp i z warp).
- Pozostałe 18 slotów i `default` to stare modele (tylko tekstury skompresowane: 74,8 → 44,8 MB, bez widocznej różnicy).
- **Identyczne pliki — czekają na własne modele:** `default` = `cargo3d` · `nonwarp_large_cargo` = `nonwarp_medium_cargo` ·
  `warp_large_science` = dawna fregata warp. `cargo3d.glb` i `research1.glb` nie są używane przez grę.

## Podział: bez warp / warp

| Oś | Prefiks pliku | Kiedy używany |
|----|---------------|---------------|
| **A — bez warp** | `nonwarp_` | statek bez Komory Warp (brak baku `warp_cores`) |
| **B — warp**     | `warp_`    | statek z Komorą Warp (`warpFuel.max > 0`) |

## Lista slotów (24 + `default`)

| Typ statku | bez warp | warp |
|---|---|---|
| mały naukowy | `nonwarp_small_science` | `warp_small_science` |
| mały towarowy | `nonwarp_small_cargo` | `warp_small_cargo` |
| mały kolonizacyjny | `nonwarp_small_colony` | `warp_small_colony` |
| średni naukowy | `nonwarp_medium_science` | `warp_medium_science` |
| średni towarowy | `nonwarp_medium_cargo` | `warp_medium_cargo` |
| średni kolonizacyjny | `nonwarp_medium_colony` | `warp_medium_colony` |
| duży naukowy | `nonwarp_large_science` | `warp_large_science` |
| duży towarowy | `nonwarp_large_cargo` | `warp_large_cargo` |
| duży kolonizacyjny | `nonwarp_large_colony` | `warp_large_colony` |
| fregata | `nonwarp_frigate` | `warp_frigate` |
| niszczyciel | `nonwarp_destroyer` | `warp_destroyer` |
| pancernik (krążownik) | `nonwarp_battleship` | `warp_battleship` |

Brak pliku slotu ⇒ gra użyje `default.glb` (a gdyby i jego nie było — prostego sprite'a 2D).

## Jak gra mapuje statki na pliki

- **Kadłuby bojowe** (`hull_frigate`, `hull_destroyer`, `hull_cruiser`) → `frigate` / `destroyer` / `battleship`.
- **Kadłuby ogólne** (`hull_small` / `hull_medium` / `hull_large`) i statki legacy → rozmiar + rola (priorytet
  **colony > science > cargo**): colony — moduł `habitat_pod` / `cryo_pod`, science — `science_lab` / `deep_scanner` /
  `quantum_scanner`, inaczej cargo.
- **Warp** — zamontowana Komora Warp (bak `warp_cores`).

## Strojenie rozmiaru

Rozmiary per klasa: `src/renderer/VesselModelResolver.js` (`VESSEL_TARGET_SIZE`), mnożnik wszystkich statków:
`VESSEL_SIZE_SCALE`. Model jest normalizowany do tych wartości — wystarczy zmienić jedną liczbę, bez ruszania plików.
