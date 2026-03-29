# Raport: Dopasowanie mapy 2D do modelu 3D planety

## Status: NIEROZWIĄZANE — wymaga dalszej pracy

Data: 2026-03-29
Kontekst: Gracz chce, aby mapa 2D hexów wyglądała identycznie jak 3D model planety widoczny w widoku układu słonecznego.

---

## Co próbowaliśmy

### Próba 1: Zmiana kolorów TERRAIN_TYPES
**Pomysł:** Ręcznie dopasować kolory hex biomów do dominujących kolorów w paletach 3D tekstur.

**Zmiany:** Zaktualizowano 10 kolorów w `src/map/HexTile.js` (TERRAIN_TYPES) — bardziej stonowane, bliższe odcieniom z palet generatora tekstur.

**Rezultat:** Kolory hexów stały się ładniejsze, ale rozkład biomów (Voronoi) jest losowy i nie pasuje do wzorców na 3D teksturze. Tam gdzie na 3D jest ocean, na 2D może być las.

**Wniosek:** Zmiana kolorów poprawia estetykę ale nie rozwiązuje problemu — biomy są w INNYCH miejscach niż na 3D.

---

### Próba 2: Próbkowanie diffuse PNG per hex
**Pomysł:** Załadować diffuse PNG planety, dla każdego hexa obliczyć pozycję UV (equirectangular), próbkować piksel, sklasyfikować kolor → biom.

**Zmiany:** `_sampleTextureForBiomes()` ładował `{typ}_{wariant}_diffuse.png`, rysował na canvas, `getImageData()`, klasyfikacja RGB → biom per hex.

**Problemy:**
1. Diffuse PNG NIE zawiera chmur (chmury to osobna warstwa shader w ThreeRenderer), ale gracz WIDZI chmury na 3D i oczekuje ich na 2D
2. Diffuse PNG bez PBR oświetlenia wygląda kompletnie inaczej niż 3D model z MeshStandardMaterial + światło kierunkowe
3. Klasyfikacja kolorów RGB → biom jest BARDZO niestabilna:
   - Ciemny brąz (niska elewacja na rocky) klasyfikowany jako ocean
   - Oliwkowa zieleń (ocean palette mid-tones) nie łapana przez proste thresholdy
   - Białe piksele (polar ice w diffuse) mylone z chmurami
4. Mapa zmieniała się po ~1 sekundzie (async loading) — "flash" efekt

**Wniosek:** Diffuse PNG to ZŁE źródło danych. Kolory są zmodyfikowane przez colorVariation, colorJitter, mineralStreaks, polarIce — nie da się ich wiarygodnie odwrócić do biomów.

---

### Próba 3: Proporcje kolorów z diffuse → wagi Voronoi
**Pomysł:** Zamiast per-hex próbkowania, policz ile % pikseli to ocean/zieleń/brąz w diffuse, użyj tych proporcji jako wag dla Voronoi generatora biomów.

**Zmiany:** Próbkowanie ~2000 pikseli, zliczanie kategorii, regeneracja Voronoi z nowymi wagami.

**Problemy:**
1. Klasyfikacja kolorów nadal niestabilna (te same problemy co próba 2)
2. Ciemne brązy (rocky palette) klasyfikowane jako ocean → za dużo wody
3. Proporcje się nie zgadzały z wizualnym wrażeniem gracza
4. Nadal flash po załadowaniu (async)

**Wniosek:** Lepsze niż per-hex, ale klasyfikacja kolorów to fundament który zawodzi.

---

### Próba 4: Predefiniowane wagi biomów per typ tekstury
**Pomysł:** Stałe proporcje biomów per typ tekstury (ocean=35% woda, rocky=0% woda, desert=40% pustynia itd.) bez ładowania żadnych obrazów.

**Zmiany:** `TEXTURE_BIOME_WEIGHTS` obiekt z wagami per typ + modyfikatory z `hasWater`, `H2O`, `lifeScore`.

**Problemy:**
1. `resolveTextureType()` może zwracać INNY typ niż to co ThreeRenderer użył (temperatura zmienia się w trakcie gry)
2. Proporcje są generyczne — nie oddają konkretnej tekstury (wariant 01 vs 02 vs 03)
3. Nadal Voronoi = losowy rozkład, nie pasuje do wzorców na 3D

**Wniosek:** Proste i szybkie, ale zbyt generyczne. Nie daje 1:1.

---

### Próba 5: Heightmap PNG → próg wody + diffuse → kolory lądu
**Pomysł:** Heightmap PNG to czyste dane (bez chmur, oświetlenia). Użyj heightmap do określenia woda/ląd, diffuse do kolorów lądu.

**Zmiany:** Ładowanie `_height.png` + `_diffuse.png`. Percentylowy próg wody z heightmap. Diffuse kolor do rozróżnienia las/pustynia/góry.

**Problemy:**
1. ContrastCurve (S-krzywa h^2.2/(h^2.2+(1-h)^2.2)) modyfikuje heightmap → próg wody w raw heightmap != próg w palecie
2. Próba odwrócenia contrastCurve dała złe progi (za dużo lub za mało wody)
3. Percentylowy próg: lepszy (gwarantuje N% ocean hexów), ale diffuse klasyfikacja lądu nadal zawodna
4. Async loading → flash

**Wniosek:** Heightmap to LEPSZE źródło niż diffuse, ale sama heightmap nie wystarczy — potrzeba znajomości palety i contrastCurve żeby poprawnie interpretować wartości.

---

### Próba 6: Bezpośrednie kolory z diffuse PNG
**Pomysł:** Zamiast klasyfikować kolory → biomy, użyj kolorów z diffuse BEZPOŚREDNIO jako kolory hexów. `tile._displayColor = RGB z PNG`.

**Zmiany:** Każdy hex dostawał `_displayColor` z diffuse PNG, rendering używał tego zamiast TERRAIN_TYPES.color.

**Problemy:**
1. `resolveTextureType()` w ColonyOverlay zwracał INNY typ niż ThreeRenderer (ten sam planet, inna temperatura w momencie wywołania) → ładowana była ZUPEŁNIE INNA tekstura (np. "rocky" zamiast "ocean")
2. Diffuse bez PBR oświetlenia = szary/brązowy, nie wygląda jak oświetlony 3D model
3. Async loading → flash (rozwiązane przez "Ładowanie..." tekst, ale UX słaby)
4. Terrain TYPE nadal potrzebny dla gameplay (canBuild, yieldBonus) — wymaga osobnej klasyfikacji

**Wniosek:** Najbliżej 1:1 co do kolorów, ALE problem z resolveTextureType daje KOMPLETNIE złą teksturę. To był killer bug.

---

### Próba 7 (finalna): Powrót do PlanetMapGenerator
**Pomysł:** Porzuć próby samplingowania. Użyj PlanetMapGenerator z Voronoi + wagi z danych planety.

**Zmiany:** Usunięto cały system samplingowania. Biomy z PlanetMapGenerator (temperatura, woda, życie, skład chemiczny → wagi).

**Rezultat:** Mapa wygląda czytelnie i spójnie. Proporcje biomów zależą od planety. NIE jest 1:1 z 3D ale jest grywalna i ładna.

**Wniosek:** Praktyczne rozwiązanie. Nie idealne ale stabilne.

---

## Analiza głównych przeszkód

### 1. Dwa niezależne systemy wizualne
- **3D model:** Pre-generowane PNG (diffuse/normal/roughness) + PBR material (MeshStandardMaterial) + directional light + ambient light + cloud shader + atmosphere glow
- **2D mapa:** Flat hex kolory z TERRAIN_TYPES, Canvas 2D, brak oświetlenia

Te systemy NIGDY nie zostały zaprojektowane żeby się zgadzać. Są kompletnie niezależne.

### 2. Chmury i atmosfera
Gracz widzi białe chmury i niebieską atmosferę na 3D — ale:
- Chmury to **osobna warstwa** (proceduralny shader, animowany, z-offset 1.02×radius)
- Atmosfera to **glow sprite** (niebieski halo wokół planety)
- Diffuse PNG NIE zawiera chmur ani atmosfery
- Gracz myśli że niebieskie to ocean, a to atmosfera!

### 3. resolveTextureType() — rozbieżność
ThreeRenderer ładuje teksturę RAZ przy starcie (temperatura z inicjalizacji). ColonyOverlay wywołuje resolveTextureType() przy otwarciu mapy (temperatura AKTUALNA, może być inna). Efekt: 3D pokazuje "ocean" teksturę (błękitna woda, zielona ziemia), 2D ładuje "rocky" teksturę (same brązy).

**Fix (niezaimplementowany):** ThreeRenderer powinien cachować `texType` per planet i udostępniać go innym systemom.

### 4. contrastCurve — nieliniowe mapowanie
Generator używa S-krzywej `h^k / (h^k + (1-h)^k)` z k=2.2 do mapowania heightmap → palette index. To nieliniowe przekształcenie sprawia że:
- Raw heightmap 0.5 → palette 0.5 (punkt symetrii)
- Raw heightmap 0.3 → palette 0.14 (ciemne strefy BARDZO skompresowane)
- Raw heightmap 0.7 → palette 0.86 (jasne strefy BARDZO rozciągnięte)

Odwrócenie tej krzywej wymaga rozwiązania równania `t^2.2 / (t^2.2 + (1-t)^2.2) = x`, co nie ma analitycznego rozwiązania.

### 5. Post-processing w generatorze
Po palette lookup, generator aplikuje:
- `colorVariation()` — ±12 RGB per kanał (szum low-freq)
- `colorJitter()` — HSV shifts ±15°/±10%/±8% per Worley cell
- `mineralStreaks()` — jasne smugi na krawędziach Worley
- `polarIce()` — białe bieguny z noisy granicy
- Unsharp mask + gamma 1.1 (w postprocess.js)

Te efekty są NIEREWERSOWALNY — nie da się z finalnego koloru odzyskać oryginalnej wartości heightmap.

---

## Rekomendowane podejście na przyszłość

### Opcja A: Biome map jako dodatkowy output generatora (REKOMENDOWANA)
1. Zmodyfikować `generate-planets.js` żeby oprócz diffuse/normal/height/roughness generował **biome map PNG** (każdy piksel = kolor biome)
2. Biome map: ocean=niebieski, las=zielony, góry=brązowy, lód=biały — czyste kolory bez jitter/variation
3. W ColonyOverlay: załaduj biome map, próbkuj per hex → `tile.type`
4. Regeneruj tekstury: `node generate-planets.js --biome-map`

**Zalety:** Gwarantowane 1:1 (ta sama heightmap → te same biomy). Brak klasyfikacji kolorów. Szybkie (1 obraz do załadowania).
**Wady:** Wymaga modyfikacji CLI generatora + regeneracji 180 tekstur.

### Opcja B: ThreeRenderer udostępnia texType + thumbnail
1. ThreeRenderer cachuje `texType` per planet ID
2. ColonyOverlay czyta texType z ThreeRenderer (nie re-computuje)
3. ThreeRenderer generuje thumbnail (render-to-texture z kamery patrzej na planetę) → przekazuje jako texturę do ColonyOverlay
4. ColonyOverlay próbkuje thumbnail zamiast raw diffuse

**Zalety:** Thumbnail = to co gracz widzi (z oświetleniem, bez chmur jeśli je wyłączymy)
**Wady:** Złożona implementacja, thumbnail to projekcja 2D jednej strony kuli (nie cała powierzchnia)

### Opcja C: Shared heightmap → biome classification rules
1. Załaduj heightmap PNG (jest czysty, bez chmur/oświetlenia)
2. Użyj STAŁYCH progów per typ tekstury (nie contrastCurve — własne progi):
   - ocean: h < 0.48 = ocean, h < 0.55 = coast/plains, h < 0.70 = forest, h > 0.70 = mountains
   - rocky: h < 0.30 = crater, h < 0.50 = wasteland, h < 0.70 = mountains, h > 0.70 = peaks
3. Progi kalibrowane empirycznie (nie z contrastCurve)
4. **WAŻNE:** Użyj tego samego texType co ThreeRenderer (cache, nie re-compute)

**Zalety:** Prostsze niż biome map generator. Heightmap jest czysty.
**Wady:** Progi wymagają kalibracji per typ. Nie uwzględnia colorVariation/jitter.

### Opcja D: Hybryda — Voronoi z wagami z heightmap statistics
1. Załaduj heightmap PNG
2. Policz statystyki: ile % pikseli < 0.3, 0.3-0.5, 0.5-0.7, > 0.7
3. Mapuj przedziały na biomy, użyj jako wagi Voronoi
4. Voronoi daje naturalne klastry (nie pikselowy szum)

**Zalety:** Łączy dokładność heightmap z estetyką Voronoi
**Wady:** Pozycje biomów nadal losowe (nie 1:1 z 3D)

---

## Krytyczny bug do naprawienia w przyszłości

### resolveTextureType() rozbieżność
ThreeRenderer i ColonyOverlay mogą dostawać różne typy tekstur dla tej samej planety. Fix:

```javascript
// W ThreeRenderer._addPlanetMesh():
const texType = resolveTextureType(planet);
planet._cachedTexType = texType;  // cache!
planet._cachedTexVariant = variant;

// W ColonyOverlay._sampleTextureForBiomes():
const texType = planet._cachedTexType ?? resolveTextureType(planet);
const variant = planet._cachedTexVariant ?? ...;
```

To gwarantuje że oba systemy używają TEJ SAMEJ tekstury.

---

## Pliki związane z tematem

| Plik | Rola |
|------|------|
| `generate-planets.js` | CLI generator tekstur (pipeline heightmap→color→PBR) |
| `lib/colors.js` | gammaLerp, contrastCurve, colorVariation, polarIce |
| `lib/terrain.js` | 10-fazowy pipeline heightmap (fBm→plates→ridges→craters→erosion) |
| `lib/maps.js` | Generacja normal/height/roughness map |
| `src/renderer/PlanetTextureUtils.js` | resolveTextureType(), loadPlanetTextures(), cache |
| `src/renderer/ThreeRenderer.js` | MeshStandardMaterial + cloud shader + atmosphere |
| `src/map/PlanetMapGenerator.js` | Voronoi biome generator (wagi z danych planety) |
| `src/map/HexTile.js` | TERRAIN_TYPES (kolory, allowedCategories, yieldBonus) |
| `src/ui/ColonyOverlay.js` | 2D hex map renderer |
| `assets/planet-textures/` | 180 PNG (15 typów × 3 warianty × 4 mapy) |

---

## Obecny stan (2026-03-29)
- Mapa 2D używa PlanetMapGenerator z Voronoi + wagi z danych planety
- Kolory z TERRAIN_TYPES (poprawione, stonowane)
- NIE jest 1:1 z 3D modelem
- Stabilne, brak flashu, grywalne
- Sampling tekstur USUNIĘTY (martwy kod w `_sampleTextureForBiomes_REMOVED`)

---
---

# CZĘŚĆ 2: Kompletna dokumentacja pipeline'u grafik planet, księżyców i planetoidów

## Przegląd architektury

```
CLI Generator (Node.js)          →  PNG files  →  Browser (Three.js WebGL)
generate-planets.js + lib/          assets/        ThreeRenderer.js
                                planet-textures/   PlanetTextureUtils.js
```

Pipeline ma 3 fazy:
1. **Generacja offline** (Node.js CLI) → pliki PNG na dysku
2. **Ładowanie w przeglądarce** → cache tekstur Three.js
3. **Renderowanie 3D** → MeshStandardMaterial + chmury + atmosfera

---

## Faza 1: Generacja tekstur (Node.js CLI)

### Wywołanie
```bash
node generate-planets.js --type ocean --count 3 --resolution 1024 --quality high --output ./assets/planet-textures
```

### Argumenty CLI
| Argument | Opis | Domyślne |
|----------|------|----------|
| `--type <typ>` | Typ planety (lub 'all') | wymagany |
| `--count <n>` | Ile wariantów wygenerować | 1 |
| `--resolution <px>` | Szerokość tekstury | 2048 |
| `--quality <q>` | low/medium/high/ultra | high |
| `--seed <n>` | Bazowy seed PRNG | losowy |
| `--output <dir>` | Katalog wyjściowy | ./planet-textures |
| `--clouds` | Generuj warstwę chmur RGBA | false |
| `--emission` | Generuj mapę emisji (lawa) | false |
| `--all-maps` | Generuj wszystkie dodatkowe mapy | false |

### 15 typów planet (PLANET_TYPES)

Każdy typ ma: **palette** (tablica [R,G,B] 12-18 kolorów) + **features** (parametry terenu).

#### Planety skaliste (9 typów):

| Typ | Paleta | Kratery | Grzbiety | Tektonika | Lawa | Bieguny |
|-----|--------|---------|----------|-----------|------|---------|
| **rocky** | brąz→beż | 60 | tak (0.35) | tak (0.4) | nie | lód |
| **mercury** | szary | 120 | nie | nie | nie | nie |
| **volcanic** | czarny→pomarańcz | 25 | tak (0.5) | tak (0.85) | TAK | nie |
| **desert** | piaskowy | 20 | tak (0.45) | tak (0.6) | nie | mróz |
| **iron** | fioletowo-ciemny | 45 | tak (0.25) | tak (0.3) | nie | lód |
| **ice** | jasnobłękitny | 30 | tak (0.2) | tak (0.7) | nie | TAK |
| **ocean** | granat→zieleń→beż | 0 | tak (0.3) | nie | nie | lód+chmury |
| **toxic** | żółto-zielony | 35 | tak (0.35) | nie | nie | chmury |
| **lava-ocean** | ciemnoczerwony→pomarańcz | 15 | tak (0.6) | tak (0.9) | TAK | nie |

#### Gazowe olbrzymy (3 typy):
| Typ | Styl | Pasma | Burze |
|-----|------|-------|-------|
| **gas_warm** | Jowisz (brązy/złoto) | 12 | 10% szans |
| **gas_cold** | Neptun (błękity) | 18 | 5% szans |
| **gas_giant** | Saturn (beże) | 24 | 15% szans |

#### Planetoidy (3 typy):
| Typ | Wygląd | Kratery | Metaliczność |
|-----|--------|---------|-------------|
| **planetoid_metallic** | jasny, lśniący | 80 | 0.25 |
| **planetoid_carbonaceous** | bardzo ciemny | 60 | 0.05 |
| **planetoid_silicate** | szary | 70 | 0.05 |

### Pipeline heightmap (10 faz) — `lib/terrain.js`

```
1. Base fBm          → szum simplex 3D, 6-12 oktaw
2. Continental plates → niskofreq. fBm (1.2× skala), 9% wagi
3. Ridge mountains   → ridgedFbm3d, maska Worley, blend 0.15-0.60
4. Tectonic cracks   → turbulence3d + Worley krawędzie, siła 0.15-0.85
5. Domain warping    → domainWarp3d, amplituda 0.8, 15% wagi
6. Crater impacts    → 4 klasy (giant/large/medium/tiny), fizyczny profil
7. Micro detail      → drobny fBm, 2.5% wagi
8. Hydraulic erosion  → symulacja kropelek (10-50% pikseli, 50-100 kroków)
9. Thermal erosion   → kąt talus (0.015-0.025), 40-200 iteracji
10. Normalizacja     → liniowe skalowanie do [0, 1]
```

Heightmap: `Float32Array[W × H]`, wartości 0.0 (dno) – 1.0 (szczyt).

### Pipeline kolorów — `lib/colors.js`

Dla każdego piksela (u,v) na teksturze:

```
1. h = heightmap[pixel]                              // surowa wysokość 0-1
2. hc = contrastCurve(h, 2.2)                        // S-krzywa: t^k/(t^k+(1-t)^k)
3. color = gammaLerp(palette, hc)                     // interpolacja gamma-correct
4. color = colorVariation(color, fbm_noise, ±12)      // regionalna zmiana odcienia
5. color = colorJitter(color, worley_cellId, 0.6)     // per-biom HSV shift ±15°/±10%/±8%
6. color = mineralStreaks(color, worley_f1_f2, 0.08)   // żyły kruszców na krawędziach Worley
7. color = polarIce(color, latitude, noise)            // białe czapy, smoothstep 70-92% lat
8. color = lavaFlow(color, tectonic_edge, height)      // lawa w niskich strefach (volcanic)
9. post: unsharp mask + gamma 1.1                      // wyostrzenie + korekcja jasności
```

**Kluczowe funkcje:**
- `gammaLerp(palette, t)` — linearyzacja RGB→gamma, interpolacja, re-gamma. Fizycznie poprawne mieszanie kolorów.
- `contrastCurve(t, k)` — S-krzywa `t^k / (t^k + (1-t)^k)`. k=2.2: ciemne→ciemniejsze, jasne→jaśniejsze.
- `colorJitter(rgb, cellId)` — Hash cellId → shift HSV. Tworzy naturalne zróżnicowanie regionalne.
- `polarIce(rgb, lat, noise)` — Bieguny: smoothstep blend do białego [225,235,245].

### Generacja dodatkowych map — `lib/maps.js`

| Mapa | Metoda | Format | Zastosowanie |
|------|--------|--------|-------------|
| **Normal** | Sobel na heightmap | RGB | Szczegóły powierzchni w 3D |
| **Height** | Bezpośredni rescale heightmap | Grayscale | Parallax/displacement |
| **Roughness** | 0.55 + h×0.40 + crater mods | Grayscale | Mikropowierzchnia PBR |
| **AO** | SSAO (12 kierunków, 8px radius) | Grayscale | Cieniowanie szczelin |
| **Specular** | 0.3 + heightmap + Worley kruszce | Grayscale | Metaliczność PBR |
| **Emission** | Lawa w niskch strefach + Worley crack | RGB | Świecenie wulkanów |
| **Clouds** | fBm + domain warp, threshold 0.45 | RGBA | Warstwa chmur |
| **Night lights** | Worley proximity w niskich strefach | Grayscale | Miasta nocą |

### Kratery — `lib/craters.js`

4 klasy wielkości: giant (5%), large (15%), medium (30%), tiny (50%).

Profil kratera:
- **Centralny peak** — stożkowy, 8% głębokości
- **Dno** — paraboliczne wgłębienie
- **Krawędź (rim)** — sinusoidalny wał, 8% rimHeight
- **Ejecta** — promieniste smugi, cos^4 wzór, 2.5% rimHeight
- **Degradacja** — starsze kratery: sharpness 0.6 (40% rozmycie)

### Erozja — `lib/erosion.js`

**Hydrauliczna** (kropelkowa): Losowe krople spływają po terenie. Pojemność nośna ∝ nachylenie × prędkość × woda. Nadwyżka sedymentu — deponuj. Niedobór — eroduj. 2% parowania/krok.

**Termiczna** (talus): Jeśli nachylenie > kąt talus → materiał zsuwa się w dół. 40-200 iteracji wygładza klify.

### Struktura plików wyjściowych

```
assets/planet-textures/
├── ocean_01_diffuse.png      (1024×512, sRGB)
├── ocean_01_normal.png       (1024×512, Linear)
├── ocean_01_height.png       (1024×512, Grayscale)
├── ocean_01_roughness.png    (1024×512, Linear)
├── ocean_02_diffuse.png
├── ...
├── rocky_01_diffuse.png
├── ...
└── planetoid_silicate_03_roughness.png
```

**Łącznie: 180 PNG** (15 typów × 3 warianty × 4 mapy bazowe).

---

## Faza 2: Ładowanie w przeglądarce — `PlanetTextureUtils.js`

### resolveTextureType(planet) → string

Drzewo decyzyjne:

```
planetoid → "planetoid_{metallic|carbonaceous|silicate}"
moon:
  icy      → "ice"
  temp>200 → "volcanic"
  temp>60  → "rocky"
  else     → "iron"
gas:
  temp>-73 → "gas_warm"
  temp<-193→ "gas_cold"
  else     → "gas_giant"
hot_rocky:
  mass<0.5 → "mercury"
  else     → "volcanic"
ice        → "ice"
rocky:
  temp>200 → "lava-ocean"
  temp>110 → "toxic"
  temp>60  → "desert"
  temp>10  → "ocean"        ← STREFA ZAMIESZKIWALNA
  temp>-20 → "rocky"
  else     → "iron"
```

### Wybór wariantu (deterministyczny)
```javascript
const seed = hashCode(planet.id);     // hash z ID planety
const variant = (seed % 3) + 1;       // 1, 2 lub 3
```
Ta sama planeta → zawsze ten sam wariant. Przetrwa save/load.

### Cache tekstur
```javascript
_textureCache: Map<string, THREE.Texture>
// Klucz: "ocean_01_diffuse", "rocky_02_normal" itd.
// Współdzielone: wiele planet tego samego typu używa tych samych tekstur GPU
```

---

## Faza 3: Renderowanie 3D — `ThreeRenderer.js`

### Planeta (rocky/ice/hot_rocky)

```
SphereGeometry(radius, 48, 48)
  + MeshStandardMaterial:
      map: diffuse PNG (sRGB)
      normalMap: normal PNG (Linear)
      roughnessMap: roughness PNG (Linear)
      metalness: 0.05
  + Cloud mesh (r × 1.02):
      Proceduralny shader, animowany (uTime)
      Biały, semi-transparentny, depthWrite: false
  + Atmosphere glow (r × 1.15):
      Rayleigh scatter shader
      Limb darkening + terminator orange
  + Pierścienie (opcjonalne, gas 60% / ice 40%):
      RingGeometry z canvas-generowaną teksturą
```

### Promień planety (skala logarytmiczna)
```
gas (>50 M⊕):     0.35 – 0.60   (Jowisz/Saturn)
gas (<50 M⊕):     0.20 – 0.35   (Neptun/Uran)
ice:               0.14 – 0.24
rocky:             0.06 – 0.14
hot_rocky:         0.04 – 0.10
gwiazda:           1.6
```

### Księżyc
```
SphereGeometry(radius, 24, 16)      // mniejsza rozdzielczość
  radius: 0.015 – 0.04              // DUŻO mniejszy od planet
  + MeshStandardMaterial (ta sama tekstura co planety)
  + Orbit ring: elliptyczny Line, dziecko grupy planety-rodzica
  Pozycja: synchronizowana co frame z moon.x/y
```

### Planetoid
```
SphereGeometry(radius, 16, 12)      // najniższa rozdzielczość
  radius: 0.08 – 0.12
  metalness: 0.25 (metallic) / 0.05 (inne)
  + Orbit ring: heliocentryczny, ukryty domyślnie
  15-40 sztuk per układ, orbity 3.5-8 AU
```

### Gazowy olbrzym (proceduralny)
```
GasGiantShader.bakeGasGiantTextures(planet, renderer)
  → RTT (render-to-texture) 1024×512
  → 3 tekstury: diffuse, normal, roughness
  → MeshStandardMaterial z baked textures
  Pasma: bandFreq (12-24), turbulence (Worley+fBm), burze
```

### Oświetlenie sceny
```
DirectionalLight: pozycja = gwiazda, follow per frame
AmbientLight: 0x1a3330, intensity 0.5
Renderer: outputColorSpace = SRGBColorSpace, toneMapping = None
```

### Co widzi gracz vs co jest w plikach

| Element wizualny | Źródło | W diffuse PNG? |
|-----------------|--------|---------------|
| Kolor powierzchni | diffuse.png + PBR lighting | TAK (surowy) |
| Cienie/oświetlenie | DirectionalLight + normal map | NIE |
| Chmury (białe) | Proceduralny shader, osobna sfera | NIE |
| Atmosfera (niebieska obwódka) | Rayleigh scatter shader | NIE |
| Pierścienie | Canvas-generowana tekstura | NIE |
| Lśnienia/refleksy | roughnessMap + metalness | NIE |

**WAŻNE:** Gracz widzi kombinację WIELU warstw. Diffuse PNG to tylko jedna z nich. Dlatego próbkowanie samego diffuse NIE oddaje tego co widzi gracz na 3D modelu.

---

## Diagram pełnego pipeline'u

```
┌─────────────────────────────────────────────────────────┐
│ GENERACJA OFFLINE (Node.js)                             │
│                                                         │
│ generate-planets.js                                     │
│   ├─ lib/noise.js     → SimplexNoise3D, Worley, fBm    │
│   ├─ lib/terrain.js   → 10-fazowy heightmap             │
│   ├─ lib/craters.js   → fizyczne kratery (4 klasy)     │
│   ├─ lib/erosion.js   → hydrauliczna + termiczna       │
│   ├─ lib/colors.js    → palette lookup + modyfikatory   │
│   ├─ lib/maps.js      → normal, roughness, AO, etc.    │
│   └─ lib/postprocess.js → unsharp + gamma              │
│                                                         │
│   OUTPUT: assets/planet-textures/*.png                  │
│           180 plików (15 typów × 3 warianty × 4 mapy)  │
└──────────────────────┬──────────────────────────────────┘
                       │ pliki PNG na dysku
                       ▼
┌─────────────────────────────────────────────────────────┐
│ ŁADOWANIE (Przeglądarka)                                │
│                                                         │
│ PlanetTextureUtils.js                                   │
│   ├─ resolveTextureType(planet) → "ocean"/"rocky"/...  │
│   ├─ hashCode(planet.id) % 3 + 1 → wariant 1/2/3      │
│   ├─ TextureLoader.load(url) → THREE.Texture           │
│   └─ _textureCache (współdzielony, lazy-loaded)         │
└──────────────────────┬──────────────────────────────────┘
                       │ THREE.Texture w GPU
                       ▼
┌─────────────────────────────────────────────────────────┐
│ RENDEROWANIE 3D (Three.js WebGL, 60 FPS)                │
│                                                         │
│ ThreeRenderer.js                                        │
│   ├─ Planety: MeshStandardMaterial (PBR)               │
│   │   + Cloud mesh (shader)                             │
│   │   + Atmosphere glow (shader)                        │
│   │   + Rings (canvas texture)                          │
│   ├─ Księżyce: MeshStandardMaterial (mniejsze, 24×16)  │
│   ├─ Planetoidy: MeshStandardMaterial (16×12)          │
│   ├─ Gas giganty: RTT baked shader                     │
│   └─ Oświetlenie: DirectionalLight z pozycji gwiazdy   │
│                                                         │
│   OUTPUT: #three-canvas (WebGL)                         │
└─────────────────────────────────────────────────────────┘
```
