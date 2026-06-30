# Modele 3D statków — instrukcja wgrywania plików

## Gdzie wgrać pliki

Wszystkie modele wrzucasz do tego folderu:

```
assets/models/ships/
```

Format: **glTF 2.0 binarny `.glb`** (bez Draco / KTX2 — tak jak istniejące
`cargo3d.glb`, `research1.glb`, `Ring_Station.glb`). Skala modelu **nie ma
znaczenia** — gra automatycznie normalizuje rozmiar do klasy statku (przez
bounding box). Dziób modelu powinien być skierowany wzdłuż osi **+X**
(jak w obecnych modelach) — wtedy obrót statku w kierunku celu jest poprawny.

## Podział: A = bez warp, B = warp

Każdy statek ma dwa warianty modelu zależnie od napędu:

| Oś | Prefiks pliku | Kiedy używany |
|----|---------------|---------------|
| **A — bez warp** | `nonwarp_` | statek bez Komory Warp (brak baku `warp_cores`) |
| **B — warp**     | `warp_`    | statek z Komorą Warp (`warpFuel.max > 0`) |

## Lista plików (24 + 1 default)

### A — bez warp (`nonwarp_`)

| #  | Typ statku        | Nazwa pliku                     |
|----|-------------------|---------------------------------|
| 1  | small hull science  | `nonwarp_small_science.glb`   |
| 2  | small hull cargo    | `nonwarp_small_cargo.glb`     |
| 3  | small hull colony   | `nonwarp_small_colony.glb`    |
| 4  | medium hull science | `nonwarp_medium_science.glb`  |
| 5  | medium hull cargo   | `nonwarp_medium_cargo.glb`    |
| 6  | medium hull colony  | `nonwarp_medium_colony.glb`   |
| 7  | large hull science  | `nonwarp_large_science.glb`   |
| 8  | large hull cargo    | `nonwarp_large_cargo.glb`     |
| 9  | large hull colony   | `nonwarp_large_colony.glb`    |
| 10 | frigate (fregata)   | `nonwarp_frigate.glb`         |
| 11 | destroyer (niszczyciel) | `nonwarp_destroyer.glb`   |
| 12 | battleship (krążownik / kadłub bojowy duży) | `nonwarp_battleship.glb` |

### B — warp (`warp_`)

| #  | Typ statku        | Nazwa pliku                  |
|----|-------------------|------------------------------|
| 1  | small hull science  | `warp_small_science.glb`   |
| 2  | small hull cargo    | `warp_small_cargo.glb`     |
| 3  | small hull colony   | `warp_small_colony.glb`    |
| 4  | medium hull science | `warp_medium_science.glb`  |
| 5  | medium hull cargo   | `warp_medium_cargo.glb`    |
| 6  | medium hull colony  | `warp_medium_colony.glb`   |
| 7  | large hull science  | `warp_large_science.glb`   |
| 8  | large hull cargo    | `warp_large_cargo.glb`     |
| 9  | large hull colony   | `warp_large_colony.glb`    |
| 10 | frigate             | `warp_frigate.glb`         |
| 11 | destroyer           | `warp_destroyer.glb`       |
| 12 | battleship          | `warp_battleship.glb`      |

### Plik domyślny (fallback)

```
default.glb
```

**Jeśli brakuje któregokolwiek z 24 plików powyżej — gra automatycznie użyje
`default.glb` dla danego statku** (a w ostateczności, gdyby i `default.glb`
nie było, prosty sprite 2D). Możesz podmienić `default.glb` na własny model
„awaryjny". Obecnie `default.glb` to kopia `cargo3d.glb`, więc gra działa od
razu, nawet zanim wgrasz pozostałe pliki.

## Jak gra mapuje statki na pliki

- **Kadłuby bojowe** (`hull_frigate`, `hull_destroyer`, `hull_cruiser`) →
  odpowiednio `frigate` / `destroyer` / `battleship` (niezależnie od modułów).
- **Kadłuby ogólne** (`hull_small`/`hull_medium`/`hull_large`) oraz statki
  legacy (`science_vessel`, `cargo_ship`, `colony_ship`, `space_supply_ship`) →
  rozmiar (small/medium/large) + rola (priorytet **colony > science > cargo**):
  **colony** jeśli ma moduł kolonizacyjny (`habitat_pod` / `cryo_pod`),
  **science** jeśli ma moduł naukowy (`science_lab` / `deep_scanner` /
  `quantum_scanner`), w przeciwnym razie **cargo**.
- **Warp** rozpoznawany po zamontowanej Komorze Warp (bak `warp_cores`).

## Strojenie rozmiaru (jeśli model za duży/mały)

Docelowe rozmiary per klasa są w `src/renderer/VesselModelResolver.js`
(`VESSEL_TARGET_SIZE`). Globalny mnożnik wszystkich statków: `VESSEL_SIZE_SCALE`.
Modele są normalizowane do tych wartości — wystarczy zmienić jedną liczbę,
bez przeskalowywania plików .glb.
