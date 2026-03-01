// PlanetMapGenerator — generuje heksagonalną mapę planety
//
// Wejście:  obiekt Planet (planetType, surface, lifeScore, composition, atmosphere, id)
// Wyjście:  HexGrid wypełniony biomami i zasobami strategicznymi
//
// Algorytm:
//   1. Oblicz rozmiar siatki na podstawie typu planety
//   2. Wyznacz wagi biomów (zależne od temperatury, wody, życia, składu)
//   3. Rozlokuj "ziarna" Voronoi — każde ziarno to obszar danego biomu
//   4. Każde pole dostaje biom najbliższego ziarna (odległość hex)
//   5. Przejście wygładzające — eliminuje izolowane pojedyncze pola
//   6. Nałóż czapy lodowe / strefy wulkaniczne
//   7. Umieść zasoby strategiczne na wybranych polach
//
// Deterministyczność: wszystkie operacje losowe używają seeded PRNG
//   seed = hash z planet.id → ta sama planeta → ta sama mapa zawsze

import { HexGrid }  from './HexGrid.js';
import { HexTile }  from './HexTile.js';

// ── Rozmiary siatek per typ planety ───────────────────────────────────────────
const GRID_SIZES = {
  rocky:     { width: 12, height: 10 },  // planeta skalista habitable
  hot_rocky: { width:  8, height:  6 },  // gorąca, wulkaniczna
  ice:       { width:  8, height:  6 },  // lodowa
  gas:       { width:  8, height:  6 },  // gazowy — platformy atmosferyczne
};

// ── Seeded PRNG (Mulberry32) ───────────────────────────────────────────────────
// Deterministyczny generator liczb pseudolosowych z ziarnem 32-bitowym
function makePRNG(seed) {
  let s = seed >>> 0;
  return function rand() {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash stringa do liczby 32-bitowej (dla seeda z planet.id)
function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return h;
}

// Fisher-Yates shuffle (seeded) — równomierne tasowanie
function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Wybór ważony — tablica [{ type, weight }], zwraca type
function weightedPick(rand, entries) {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let roll    = rand() * total;
  for (const e of entries) {
    roll -= e.weight;
    if (roll <= 0) return e.type;
  }
  return entries[entries.length - 1].type;
}

// ── Główna klasa generatora ───────────────────────────────────────────────────
export class PlanetMapGenerator {

  // Generuj siatkę dla podanej planety
  // homeWorld: czy to planeta domowa gracza (explored = true wszędzie)
  static generate(planet, homeWorld = false) {
    const rand = makePRNG(hashString(planet.id ?? 'planet_0'));

    // 1. Rozmiar siatki
    const size  = GRID_SIZES[planet.planetType] ?? GRID_SIZES.rocky;
    const grid  = new HexGrid(size.width, size.height);

    // 2. Wyznacz wagi biomów
    const weights = PlanetMapGenerator._calcWeights(planet);

    // 3. Rozlokuj ziarna Voronoi i przypisz biomy
    PlanetMapGenerator._voronoiFill(grid, weights, rand);

    // 4. Wygładzanie — eliminuj izolowane pola
    PlanetMapGenerator._smooth(grid, 2);

    // 5. Nałóż efekty biegunowe i specjalne
    PlanetMapGenerator._applyPolarEffects(grid, planet, rand);

    // 6. Zasoby strategiczne z compositon planety
    PlanetMapGenerator._placeStrategicResources(grid, planet, rand);

    // 7. Fog of war (odkryte tylko na planecie domowej)
    if (!homeWorld) {
      grid.forEach(tile => { tile.explored = false; });
    }

    return grid;
  }

  // ── Krok 2: Wagi biomów ────────────────────────────────────────────────────

  static _calcWeights(planet) {
    const temp      = planet.surface?.temperature ?? 20;   // °C
    const hasWater  = planet.surface?.hasWater    ?? false;
    const life      = planet.lifeScore            ?? 0;
    const comp      = planet.composition          ?? {};
    const atmo      = planet.atmosphere           ?? 'none';
    const type      = planet.planetType           ?? 'rocky';

    // Wagi startowe per typ planety
    const base = PlanetMapGenerator._baseWeights(type);

    // ── Modyfikatory temperatury ──────────────────────────────────────────
    if (temp > 80) {
      // Bardzo gorąca — więcej pustyni i wulkanów
      base.desert   = (base.desert   ?? 0) + 20;
      base.volcano  = (base.volcano  ?? 0) + 10;
      base.forest   = 0;
      base.ocean    = 0;
    } else if (temp > 40) {
      // Ciepła — więcej pustyni
      base.desert   = (base.desert   ?? 0) + 10;
      base.forest   = (base.forest   ?? 0) - 5;
    } else if (temp < -30) {
      // Bardzo zimna — więcej tundry i lodu
      base.tundra     = (base.tundra     ?? 0) + 20;
      base.ice_sheet  = (base.ice_sheet  ?? 0) + 15;
      base.plains     = Math.max(0, (base.plains ?? 0) - 15);
      base.forest     = 0;
      base.ocean      = 0;
    } else if (temp < 0) {
      // Zimna — więcej tundry
      base.tundra     = (base.tundra ?? 0) + 10;
      base.plains     = Math.max(0, (base.plains ?? 0) - 5);
    }

    // ── Modyfikatory wody ─────────────────────────────────────────────────
    if (hasWater && atmo !== 'none') {
      base.ocean = (base.ocean ?? 0) + 10;
    } else {
      base.ocean = 0;  // bez wody — brak oceanów
    }

    // ── Modyfikatory życia ────────────────────────────────────────────────
    if (life > 80) {
      // Bujna biosfera
      base.forest  = (base.forest  ?? 0) + 15;
      base.plains  = (base.plains  ?? 0) + 10;
      base.ocean   = (base.ocean   ?? 0) + 5;
      base.wasteland = Math.max(0, (base.wasteland ?? 0) - 10);
    } else if (life > 40) {
      base.forest  = (base.forest  ?? 0) + 8;
      base.plains  = (base.plains  ?? 0) + 5;
    } else if (life === 0) {
      base.forest   = 0;
    }

    // ── Modyfikatory składu chemicznego ───────────────────────────────────
    const h2o = comp.H2O ?? 0;
    const fe  = comp.Fe  ?? 0;

    if (h2o > 20) {
      base.ocean     = (base.ocean     ?? 0) + 8;
      base.ice_sheet = (base.ice_sheet ?? 0) + 5;
    }
    if (fe > 25) {
      // Dużo żelaza → więcej gór i kraterów
      base.mountains = (base.mountains ?? 0) + 8;
      base.crater    = (base.crater    ?? 0) + 3;
    }

    // Wyzeruj ujemne wagi, normalizuj do liczb >= 0
    for (const key of Object.keys(base)) {
      base[key] = Math.max(0, base[key]);
    }

    // Skonwertuj do tablicy [{type, weight}] eliminując zerowe
    return Object.entries(base)
      .filter(([, w]) => w > 0)
      .map(([type, weight]) => ({ type, weight }));
  }

  // Bazowe wagi per typ planety
  static _baseWeights(planetType) {
    switch (planetType) {
      case 'hot_rocky':
        return { volcano: 25, desert: 40, mountains: 20, wasteland: 10, crater: 5 };

      case 'ice':
        return { ice_sheet: 50, tundra: 25, mountains: 15, crater: 5, wasteland: 5 };

      case 'gas':
        // Gazowiec — "pola" to platformy atmosferyczne; wysoka energia, brak minerałów
        return { desert: 40, wasteland: 35, mountains: 15, crater: 10 };

      case 'rocky':
      default:
        return {
          plains:    25,
          mountains: 18,
          forest:    18,
          desert:    10,
          ocean:     12,
          tundra:     8,
          crater:     5,
          wasteland:  4,
        };
    }
  }

  // ── Krok 3: Wypełnienie Voronoi ────────────────────────────────────────────

  static _voronoiFill(grid, weights, rand) {
    const allTiles = grid.toArray();
    const total    = allTiles.length;

    // Liczba ziaren: ~1 na 4 pola (dobre klasterowanie)
    const seedCount = Math.max(6, Math.floor(total / 4));

    // Wygeneruj pozycje ziaren (Fisher-Yates — równomierne rozmieszczenie)
    const shuffled = shuffle(allTiles, rand);
    const seeds    = shuffled.slice(0, seedCount).map(tile => ({
      q:    tile.q,
      r:    tile.r,
      type: weightedPick(rand, weights),
    }));

    // Każde pole → biom najbliższego ziarna
    for (const tile of allTiles) {
      let minDist = Infinity;
      let chosen  = seeds[0].type;
      for (const seed of seeds) {
        const d = HexGrid.distance(tile.q, tile.r, seed.q, seed.r);
        if (d < minDist) {
          minDist = d;
          chosen  = seed.type;
        }
      }
      tile.type = chosen;
    }
  }

  // ── Krok 4: Wygładzanie ────────────────────────────────────────────────────
  // Każde pole adaptuje typ przeważający wśród sąsiadów (jeśli >= minVotes)

  static _smooth(grid, passes = 2) {
    for (let pass = 0; pass < passes; pass++) {
      // Zbierz zmiany osobno (nie mutuj podczas iteracji)
      const changes = [];
      grid.forEach(tile => {
        const neighbors = grid.getNeighbors(tile.q, tile.r);
        if (neighbors.length < 2) return;

        // Zlicz częstość każdego typu wśród sąsiadów
        const freq = {};
        for (const n of neighbors) {
          freq[n.type] = (freq[n.type] ?? 0) + 1;
        }
        // Znajdź dominujący typ
        let maxCount = 0;
        let dominant = tile.type;
        for (const [t, cnt] of Object.entries(freq)) {
          if (cnt > maxCount) { maxCount = cnt; dominant = t; }
        }
        // Adoptuj jeśli >= 4 z 6 sąsiadów ma ten typ
        if (maxCount >= 4 && dominant !== tile.type) {
          changes.push({ tile, type: dominant });
        }
      });
      for (const { tile, type } of changes) { tile.type = type; }
    }
  }

  // ── Krok 5: Efekty biegunowe i specjalne ──────────────────────────────────

  static _applyPolarEffects(grid, planet, rand) {
    const temp = planet.surface?.temperature ?? 20;
    const type = planet.planetType           ?? 'rocky';

    // Czapy lodowe: górny i dolny wiersz → ice_sheet jeśli zimno
    if (temp < 5) {
      const rows = [0, grid.height - 1];
      grid.forEach((tile, col, row) => {
        if (rows.includes(row) && type !== 'hot_rocky' && type !== 'gas') {
          tile.type = 'ice_sheet';
        }
      });
    }

    // Aktywność wulkaniczna: hot_rocky → gwarantuj przynajmniej 2 wulkany
    if (type === 'hot_rocky') {
      let volcanoCount = grid.filter(t => t.type === 'volcano').length;
      if (volcanoCount < 2) {
        const candidates = grid.filter(t => t.type === 'desert' || t.type === 'wasteland');
        for (let i = 0; i < Math.min(2 - volcanoCount, candidates.length); i++) {
          const idx = Math.floor(rand() * (candidates.length - i));
          candidates[idx].type = 'volcano';
          candidates.splice(idx, 1);
        }
      }
    }

    // Las przylegający do pustyni → zastąp pustkowiem (naturalna granica)
    grid.forEach(tile => {
      if (tile.type !== 'forest') return;
      const hasDesertNeighbor = grid.getNeighbors(tile.q, tile.r)
        .some(n => n.type === 'desert' || n.type === 'volcano');
      if (hasDesertNeighbor && rand() < 0.6) tile.type = 'plains';
    });
  }

  // ── Krok 6: Zasoby strategiczne ────────────────────────────────────────────
  // Na podstawie składu chemicznego planety umieszcza unikalne złoża

  static _placeStrategicResources(grid, planet, rand) {
    const comp = planet.composition ?? {};

    // Tabela: warunek (próg składu) → typ złoża → preferowany teren → liczba pól
    const placements = [
      { element: 'U',  threshold: 0.5, resource: 'U',  terrains: ['mountains', 'crater'],   count: 2 },
      { element: 'Au', threshold: 0.1, resource: 'Au', terrains: ['crater', 'mountains'],   count: 1 },
      { element: 'Pt', threshold: 0.05,resource: 'Pt', terrains: ['crater'],                count: 1 },
      { element: 'H2O',threshold: 15,  resource: 'H2O',terrains: ['ice_sheet', 'tundra'],   count: 3 },
      { element: 'He', threshold: 5,   resource: 'He', terrains: ['desert', 'wasteland'],   count: 2 },
    ];

    for (const p of placements) {
      if ((comp[p.element] ?? 0) < p.threshold) continue;

      // Zbierz kandydujące pola odpowiedniego terenu bez istniejącego zasobu
      const candidates = grid.filter(t =>
        p.terrains.includes(t.type) && t.strategicResource === null
      );
      if (candidates.length === 0) continue;

      // Umieść zasób na losowych kandydatach
      const n = Math.min(p.count, candidates.length);
      const shuffled = shuffle(candidates, rand);
      for (let i = 0; i < n; i++) {
        shuffled[i].strategicResource = p.resource;
      }
    }
  }
}
