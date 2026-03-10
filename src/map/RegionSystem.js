// RegionSystem — podział planety na naturalne regiony (Voronoi na sferze)
//
// Zastępuje HexGrid API 1:1 — BuildingSystem, ColonyManager, PlanetScene
// działają bez zmian. Wewnątrz: regiony z (lat, lon) zamiast siatki hex.
//
// Region ≈ HexTile: te same pola (buildingId, explored, type, key, q, r…)
// ale q = indeks regionu, r = 0 (fikcyjne cube coords).
//
// Generowanie: RegionGenerator.generate(planet, homeWorld)
// Serializacja: version 2 (odróżnia od HexGrid version 1)

import { TERRAIN_TYPES } from './HexTile.js';
import { getEffectivePlanetType } from '../utils/EntityUtils.js';

// ── Seeded PRNG (Mulberry32) ───────────────────────────────────────────────────
function makePRNG(seed) {
  let s = seed >>> 0;
  return function rand() {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash stringa do 32-bit (FNV-like)
function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return h;
}

// Wybór ważony — tablica [{ type, weight }], zwraca type
function weightedPick(rand, entries) {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let roll = rand() * total;
  for (const e of entries) {
    roll -= e.weight;
    if (roll <= 0) return e.type;
  }
  return entries[entries.length - 1].type;
}

// Fisher-Yates shuffle (seeded)
function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Region — odpowiednik HexTile ───────────────────────────────────────────────
class Region {
  constructor(index, lat, lon, type = 'plains') {
    // Identyfikator
    this.id = `r_${index}`;

    // Współrzędne sferyczne (rad)
    this.centerLat = lat;     // -π/2 do π/2
    this.centerLon = lon;     // 0 do 2π

    // Przybliżona powierzchnia (0..1, suma ≈ 1)
    this.area = 0;

    // Kompatybilność z HexTile — fikcyjne cube coords
    this.q = index;
    this.r = 0;

    // Typ terenu (klucz z TERRAIN_TYPES)
    this.type = type;

    // Pola identyczne z HexTile
    this.buildingId        = null;
    this.buildingLevel     = 1;
    this.capitalBase       = false;
    this.explored          = true;
    this.damaged           = false;
    this.strategicResource = null;
    this.anomaly           = null;
    this.underConstruction = null;

    // Sąsiedzi (ids regionów)
    this.neighbors = [];
  }

  // Kompatybilność z HexTile.key
  get key() { return `${this.q},${this.r}`; }

  // Skrótowy dostęp do definicji terenu
  get terrainDef() {
    return TERRAIN_TYPES[this.type] ?? TERRAIN_TYPES.wasteland;
  }

  // Czy można tu postawić budynek danej kategorii?
  canBuild(category) {
    if (!this.terrainDef.buildable) return false;
    if (this.buildingId !== null) return false;
    if (this.underConstruction !== null) return false;
    if (this.damaged) return false;
    return this.terrainDef.allowedCategories.includes(category);
  }

  // Czy pole jest zajęte?
  get isOccupied() { return this.buildingId !== null || this.underConstruction !== null; }

  // Serializacja
  serialize() {
    return {
      q:                 this.q,
      r:                 this.r,
      centerLat:         this.centerLat,
      centerLon:         this.centerLon,
      area:              this.area,
      type:              this.type,
      buildingId:        this.buildingId,
      buildingLevel:     this.buildingLevel,
      explored:          this.explored,
      strategicResource: this.strategicResource,
      damaged:           this.damaged,
      capitalBase:       this.capitalBase,
      anomaly:           this.anomaly,
      underConstruction: this.underConstruction,
      neighbors:         this.neighbors,
    };
  }

  static restore(data, index) {
    const region = new Region(
      index,
      data.centerLat ?? 0,
      data.centerLon ?? 0,
      data.type ?? 'plains'
    );
    region.area              = data.area              ?? 0;
    region.buildingId        = data.buildingId        ?? null;
    region.buildingLevel     = data.buildingLevel     ?? 1;
    region.explored          = data.explored          ?? true;
    region.strategicResource = data.strategicResource ?? null;
    region.damaged           = data.damaged           ?? false;
    region.capitalBase       = data.capitalBase       ?? false;
    region.anomaly           = data.anomaly           ?? null;
    region.underConstruction = data.underConstruction ?? null;
    region.neighbors         = data.neighbors         ?? [];
    return region;
  }
}

// ── RegionSystem — API kompatybilne z HexGrid ──────────────────────────────────
export class RegionSystem {

  constructor(regionCount = 14) {
    this._regions = [];       // Array<Region>
    this._byKey   = new Map(); // "q,0" → Region
    this._regionCount = regionCount;
  }

  // ── Dostęp ─────────────────────────────────────────────────────────────────
  // Kompatybilny z HexGrid.get(q, r) — q = indeks regionu, r ignorowane
  // Lub get('r_N') — po id regionu
  get(qOrId, r = 0) {
    if (typeof qOrId === 'string') {
      // Szukaj po id ('r_5') lub po key ('5,0')
      if (qOrId.startsWith('r_')) {
        const idx = parseInt(qOrId.slice(2), 10);
        return this._regions[idx] ?? null;
      }
      return this._byKey.get(qOrId) ?? null;
    }
    return this._regions[qOrId] ?? null;
  }

  // Znajdź region dla punktu na sferze (lat, lon w radianach)
  // Stub — pełna implementacja w sesji 3
  getByLatLon(lat, lon) {
    if (this._regions.length === 0) return null;
    // Brute-force: znajdź najbliższy region (great-circle distance)
    let best = null;
    let bestDist = Infinity;
    for (const reg of this._regions) {
      const d = RegionSystem._greatCircleDist(lat, lon, reg.centerLat, reg.centerLon);
      if (d < bestDist) {
        bestDist = d;
        best = reg;
      }
    }
    return best;
  }

  // Odległość kątowa na sferze (haversine)
  static _greatCircleDist(lat1, lon1, lat2, lon2) {
    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * Math.asin(Math.sqrt(a));
  }

  // ── Iteracja ───────────────────────────────────────────────────────────────
  forEach(callback) {
    for (let i = 0; i < this._regions.length; i++) {
      callback(this._regions[i], i, 0);
    }
  }

  toArray() {
    return [...this._regions];
  }

  filter(predicate) {
    return this._regions.filter(predicate);
  }

  // ── Właściwości (kompatybilność z HexGrid) ─────────────────────────────────
  get width()  { return this._regions.length; }
  get height() { return 1; }

  // ── Sąsiedzi ───────────────────────────────────────────────────────────────
  getNeighbors(qOrId, r = 0) {
    const region = this.get(qOrId, r);
    if (!region) return [];
    return region.neighbors
      .map(id => this.get(id))
      .filter(Boolean);
  }

  // ── Kompatybilność z HexGrid.hexToPixel (statyczna) ───────────────────────
  // Mapuje region na pozycję pikselową (equirectangular projection)
  // Potrzebne przez PlanetTerrainTexture i inne komponenty używające hexToPixel
  static hexToPixel(q, r, size) {
    // Delegujemy do HexGrid-compatible formuły — nie używane bezpośrednio,
    // ale PlanetTerrainTexture wywołuje HexGrid.hexToPixel
    // RegionSystem nie jest tu wywoływany — kompatybilność zapewniona inaczej
    const x = size * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
    const y = size * (3 / 2 * r);
    return { x, y };
  }

  // ── Kompatybilność z HexGrid.gridPixelSize ────────────────────────────────
  gridPixelSize(size) {
    const w = size * Math.sqrt(3) * (this.width + 0.5);
    const h = size * 1.5 * this.height + size * 0.5;
    return { w, h };
  }

  // ── Kompatybilność z HexGrid.distance (statyczna) ─────────────────────────
  static distance(q1, r1, q2, r2) {
    return Math.max(
      Math.abs(q1 - q2),
      Math.abs(r1 - r2),
      Math.abs((-q1 - r1) - (-q2 - r2))
    );
  }

  // ── Kompatybilność z HexGrid.getLatitudeModifier ──────────────────────────
  // Dla regionów: modyfikator na podstawie latitude (bieguny = trudniejsze)
  static getLatitudeModifier(r, gridHeight) {
    // r = 0 w RegionSystem (wszystkie regiony mają r=0)
    // Zwracamy neutralny modyfikator — efekty polarne obsługiwane przez typ terenu
    return { production: 1.0, buildCost: 1.0, label: null };
  }

  // ── Serializacja ───────────────────────────────────────────────────────────
  serialize() {
    return {
      version: 2,
      regionCount: this._regions.length,
      regions: this._regions.map(r => r.serialize()),
    };
  }

  static restore(data) {
    // Stary format HexGrid (version 1 / brak version)
    if (data.width && data.tiles) {
      return null; // ColonyManager wygeneruje nową mapę
    }

    // Format RegionSystem (version 2)
    if (data.version === 2) {
      const rs = new RegionSystem(data.regionCount ?? data.regions.length);
      for (let i = 0; i < data.regions.length; i++) {
        const region = Region.restore(data.regions[i], i);
        rs._regions.push(region);
        rs._byKey.set(region.key, region);
      }
      return rs;
    }

    return null;
  }

  // ── Wewnętrzne: dodaj region ───────────────────────────────────────────────
  _addRegion(region) {
    this._regions.push(region);
    this._byKey.set(region.key, region);
  }
}

// ── RegionGenerator — generuje regiony dla planety ─────────────────────────────
export class RegionGenerator {

  // Analogia do PlanetMapGenerator.generate()
  static generate(planet, homeWorld = false) {
    const seed = hashString(planet.id ?? 'planet_0');
    const rand = makePRNG(seed);

    // 1. Liczba regionów zależna od typu planety
    const countMap = { rocky: 55, hot_rocky: 30, ice: 30, gas: 12, moon: 20, planetoid: 12 };
    const sizeKey = planet.type === 'moon' ? 'moon'
                  : planet.type === 'planetoid' ? 'planetoid'
                  : getEffectivePlanetType(planet);
    const count = countMap[sizeKey] ?? 14;

    // 2. Generuj punkty Fibonacci sphere (równomierne rozmieszczenie)
    const centers = RegionGenerator._fibonacciSphere(count, rand);

    // 3. Oblicz wagi biomów
    const weights = RegionGenerator._calcWeights(planet);

    // 4. Stwórz RegionSystem i wypełnij regionami
    const rs = new RegionSystem(count);
    const equalArea = 1 / count;

    for (let i = 0; i < count; i++) {
      const biome = weightedPick(rand, weights);
      const region = new Region(i, centers[i].lat, centers[i].lon, biome);
      region.area = equalArea;
      rs._addRegion(region);
    }

    // 5. Wyznacz sąsiedztwo (N najbliższych)
    const neighborCount = count <= 8 ? 4 : 5;
    RegionGenerator._assignNeighbors(rs, neighborCount);

    // 6. Efekty polarne i specjalne
    RegionGenerator._applyPolarEffects(rs, planet, rand);

    // 7. Zasoby strategiczne
    RegionGenerator._placeStrategicResources(rs, planet, rand);

    // 8. Fog of war
    if (!homeWorld) {
      rs.forEach(region => { region.explored = false; });
    }

    return rs;
  }

  // ── Fibonacci sphere — równomiernie rozmieszczone N punktów ────────────────
  // Zwraca Array<{lat, lon}> w radianach
  static _fibonacciSphere(n, rand) {
    const PHI = (1 + Math.sqrt(5)) / 2; // złoty stosunek
    const offset = rand() * Math.PI * 2; // losowy obrót początkowy
    const points = [];

    for (let i = 0; i < n; i++) {
      // lat = arcsin(2i/(n-1) - 1), przeskalowane do -π/2..π/2
      const lat = Math.asin(n > 1 ? (2 * i / (n - 1) - 1) : 0);
      // lon = 2π * i / φ + offset
      const lon = ((2 * Math.PI * i / PHI) + offset) % (2 * Math.PI);
      points.push({ lat, lon });
    }
    return points;
  }

  // ── Sąsiedztwo: N najbliższych regionów ────────────────────────────────────
  static _assignNeighbors(rs, n) {
    const regions = rs.toArray();

    for (const reg of regions) {
      // Oblicz odległość do wszystkich innych regionów
      const dists = regions
        .filter(other => other.id !== reg.id)
        .map(other => ({
          id: other.id,
          dist: RegionSystem._greatCircleDist(
            reg.centerLat, reg.centerLon,
            other.centerLat, other.centerLon
          ),
        }))
        .sort((a, b) => a.dist - b.dist);

      // N najbliższych = sąsiedzi
      reg.neighbors = dists.slice(0, n).map(d => d.id);
    }

    // Symetryzacja: jeśli A jest sąsiadem B, to B też powinien być sąsiadem A
    for (const reg of regions) {
      for (const neighborId of reg.neighbors) {
        const neighbor = rs.get(neighborId);
        if (neighbor && !neighbor.neighbors.includes(reg.id)) {
          neighbor.neighbors.push(reg.id);
        }
      }
    }
  }

  // ── Efekty polarne i specjalne ─────────────────────────────────────────────
  static _applyPolarEffects(rs, planet, rand) {
    const temp = planet.surface?.temperature ?? 20;
    const type = planet.planetType ?? 'rocky';

    // Czapy lodowe: regiony blisko biegunów → ice_sheet jeśli zimno
    if (temp < 5 && type !== 'hot_rocky' && type !== 'gas') {
      const polarThreshold = Math.PI / 2 * 0.75; // |lat| > 67.5° ≈ biegun
      rs.forEach(region => {
        if (Math.abs(region.centerLat) > polarThreshold) {
          region.type = 'ice_sheet';
        }
      });
    }

    // hot_rocky: gwarantuj min. 2 wulkany
    if (type === 'hot_rocky') {
      let volcanoCount = rs.filter(r => r.type === 'volcano').length;
      if (volcanoCount < 2) {
        const candidates = rs.filter(r => r.type === 'desert' || r.type === 'wasteland');
        const shuffled = shuffle(candidates, rand);
        for (let i = 0; i < Math.min(2 - volcanoCount, shuffled.length); i++) {
          shuffled[i].type = 'volcano';
        }
      }
    }

    // Las przy pustyni → równina (naturalna granica)
    rs.forEach(region => {
      if (region.type !== 'forest') return;
      const neighbors = rs.getNeighbors(region.q);
      const hasDesertNeighbor = neighbors.some(
        n => n.type === 'desert' || n.type === 'volcano'
      );
      if (hasDesertNeighbor && rand() < 0.6) region.type = 'plains';
    });
  }

  // ── Zasoby strategiczne ────────────────────────────────────────────────────
  static _placeStrategicResources(rs, planet, rand) {
    const comp = planet.composition ?? {};

    const placements = [
      { element: 'U',   threshold: 0.5,  resource: 'U',   terrains: ['mountains', 'crater'],  count: 2 },
      { element: 'Au',  threshold: 0.1,  resource: 'Au',  terrains: ['crater', 'mountains'],  count: 1 },
      { element: 'Pt',  threshold: 0.05, resource: 'Pt',  terrains: ['crater'],               count: 1 },
      { element: 'H2O', threshold: 15,   resource: 'H2O', terrains: ['ice_sheet', 'tundra'],  count: 3 },
      { element: 'He',  threshold: 5,    resource: 'He',  terrains: ['desert', 'wasteland'],  count: 2 },
    ];

    for (const p of placements) {
      if ((comp[p.element] ?? 0) < p.threshold) continue;

      const candidates = rs.filter(r =>
        p.terrains.includes(r.type) && r.strategicResource === null
      );
      if (candidates.length === 0) continue;

      const n = Math.min(p.count, candidates.length);
      const shuffled = shuffle(candidates, rand);
      for (let i = 0; i < n; i++) {
        shuffled[i].strategicResource = p.resource;
      }
    }
  }

  // ── Wagi biomów — identyczna logika co PlanetMapGenerator ──────────────────
  static _calcWeights(planet) {
    const temp     = planet.surface?.temperature ?? 20;
    const hasWater = planet.surface?.hasWater    ?? false;
    const life     = planet.lifeScore            ?? 0;
    const comp     = planet.composition          ?? {};
    const atmo     = planet.atmosphere           ?? 'none';
    const type     = getEffectivePlanetType(planet);

    const base = RegionGenerator._baseWeights(type);

    // Modyfikatory temperatury
    if (temp > 80) {
      base.desert  = (base.desert  ?? 0) + 20;
      base.volcano = (base.volcano ?? 0) + 10;
      base.forest  = 0;
      base.ocean   = 0;
    } else if (temp > 40) {
      base.desert  = (base.desert  ?? 0) + 10;
      base.forest  = (base.forest  ?? 0) - 5;
    } else if (temp < -30) {
      base.tundra    = (base.tundra    ?? 0) + 20;
      base.ice_sheet = (base.ice_sheet ?? 0) + 15;
      base.plains    = Math.max(0, (base.plains ?? 0) - 15);
      base.forest    = 0;
      base.ocean     = 0;
    } else if (temp < 0) {
      base.tundra = (base.tundra ?? 0) + 10;
      base.plains = Math.max(0, (base.plains ?? 0) - 5);
    }

    // Modyfikatory wody
    if (hasWater && atmo !== 'none') {
      base.ocean = (base.ocean ?? 0) + 10;
    } else {
      base.ocean = 0;
    }

    // Modyfikatory życia
    if (life > 80) {
      base.forest    = (base.forest    ?? 0) + 15;
      base.plains    = (base.plains    ?? 0) + 10;
      base.ocean     = (base.ocean     ?? 0) + 5;
      base.wasteland = Math.max(0, (base.wasteland ?? 0) - 10);
    } else if (life > 40) {
      base.forest = (base.forest ?? 0) + 8;
      base.plains = (base.plains ?? 0) + 5;
    } else if (life === 0) {
      base.forest = 0;
    }

    // Modyfikatory składu chemicznego
    const h2o = comp.H2O ?? 0;
    const fe  = comp.Fe  ?? 0;
    if (h2o > 20) {
      base.ocean     = (base.ocean     ?? 0) + 8;
      base.ice_sheet = (base.ice_sheet ?? 0) + 5;
    }
    if (fe > 25) {
      base.mountains = (base.mountains ?? 0) + 8;
      base.crater    = (base.crater    ?? 0) + 3;
    }

    // Normalizacja
    for (const key of Object.keys(base)) {
      base[key] = Math.max(0, base[key]);
    }

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
}
