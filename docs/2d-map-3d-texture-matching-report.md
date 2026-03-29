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
