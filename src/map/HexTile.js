// HexTile — model danych pojedynczego pola heksagonalnego na mapie planety
//
// Układ współrzędnych: cube coordinates (q, r, s) gdzie q+r+s = 0
//   s jest obliczane jako -q-r, więc przechowujemy tylko q i r
//
// Typ terenu (type) determinuje:
//   - dostępne kategorie budynków (allowedCategories)
//   - bonus produkcyjny dla budynków (yieldBonus)
//   - kolor i ikona w widoku mapy
//
// Budynek (buildingId) — jeden budynek per pole, null jeśli puste
// Zasoby bazowe (baseYield) — pasywna produkcja bez budynku (mała)
// Zasoby strategiczne (strategic) — unikalne złoże widoczne po zbadaniu

// ── Typy terenu ───────────────────────────────────────────────────────────────
// yieldBonus: mnożnik produkcji budynków stojących na tym terenie (1.0 = bez bonusu)
// allowedCategories: które kategorie budynków mogą tu stanąć
//   'mining' | 'energy' | 'food' | 'population' | 'research' | 'military' | 'space'
// baseYield: pasywna produkcja bez budynku (per rok gry)
export const TERRAIN_TYPES = {
  plains: {
    namePL:            'Równina',
    color:             0x7ab648,   // zielony
    colorDark:         0x5a8a30,
    icon:              '🟢',
    buildable:         true,
    allowedCategories: ['mining', 'energy', 'food', 'population', 'research', 'military', 'space'],
    yieldBonus:        { food: 1.4, default: 1.0 },  // bonus do żywności
    baseYield:         { organics: 0.5 },
    description:       'Płaski teren, idealny pod zabudowę i uprawy',
  },

  mountains: {
    namePL:            'Góry',
    color:             0x9e8e7e,
    colorDark:         0x7e6e5e,
    icon:              '⛰',
    buildable:         true,
    allowedCategories: ['mining', 'energy', 'military'],  // brak rolnictwa
    yieldBonus:        { mining: 1.6, default: 0.8 },     // trudniejsza budowa, ale więcej rud
    baseYield:         { minerals: 0.8 },
    description:       'Bogate złoża minerałów, trudna budowa',
  },

  ocean: {
    namePL:            'Ocean',
    color:             0x3a78c9,
    colorDark:         0x1a58a9,
    icon:              '🌊',
    buildable:         false,        // tylko ze specjalną technologią (etap późniejszy)
    allowedCategories: [],
    yieldBonus:        { default: 1.0 },
    baseYield:         { water: 1.0, organics: 0.3 },
    description:       'Nie do zabudowania bez odpowiedniej technologii',
  },

  forest: {
    namePL:            'Las',
    color:             0x2d6e2d,
    colorDark:         0x1d4e1d,
    icon:              '🌲',
    buildable:         true,         // wymaga karczowania (koszt minerałów)
    allowedCategories: ['food', 'population', 'research'],
    yieldBonus:        { food: 1.3, default: 0.9 },
    baseYield:         { organics: 1.2 },
    clearCost:         { minerals: 30 },   // koszt karczowania przed budową
    description:       'Bogata organika, wymaga karczowania przed budową',
  },

  desert: {
    namePL:            'Pustynia',
    color:             0xe8c870,
    colorDark:         0xc8a850,
    icon:              '🏜',
    buildable:         true,
    allowedCategories: ['mining', 'energy', 'military', 'space'],
    yieldBonus:        { energy: 1.5, default: 0.9 },  // doskonałe słońce
    baseYield:         { minerals: 0.3 },
    description:       'Idealne nasłonecznienie, bonus dla elektrowni słonecznych',
  },

  tundra: {
    namePL:            'Tundra',
    color:             0xa8c8d8,
    colorDark:         0x88a8b8,
    icon:              '🧊',
    buildable:         true,
    allowedCategories: ['mining', 'energy', 'food', 'military'],
    yieldBonus:        { mining: 1.2, default: 0.8 },
    baseYield:         { minerals: 0.4, water: 0.3 },
    description:       'Zimny teren z płytkimi złożami i lodem',
  },

  volcano: {
    namePL:            'Wulkan',
    color:             0xc84820,
    colorDark:         0xa82800,
    icon:              '🌋',
    buildable:         true,
    allowedCategories: ['energy', 'mining'],
    yieldBonus:        { energy: 2.0, mining: 1.3, default: 0.7 },  // geotermia!
    baseYield:         { energy: 1.5, minerals: 0.5 },
    description:       'Aktywność geotermiczna — ogromny bonus dla elektrowni',
  },

  crater: {
    namePL:            'Krater',
    color:             0x7a6a5a,
    colorDark:         0x5a4a3a,
    icon:              '☄',
    buildable:         true,
    allowedCategories: ['mining', 'research', 'military'],
    yieldBonus:        { mining: 1.8, default: 0.9 },  // skondensowane pierwiastki z impaktu
    baseYield:         { minerals: 1.5 },
    strategic:         true,         // może zawierać unikalne pierwiastki (Au, Pt)
    description:       'Ślad po impakcie — skoncentrowane rzadkie pierwiastki',
  },

  ice_sheet: {
    namePL:            'Czapa lodowa',
    color:             0xd8eef8,
    colorDark:         0xb8ced8,
    icon:              '❄',
    buildable:         true,
    allowedCategories: ['mining', 'energy', 'food'],
    yieldBonus:        { default: 0.8 },
    baseYield:         { water: 2.5 },
    description:       'Ogromne rezerwy lodu wodnego',
  },

  wasteland: {
    namePL:            'Pustkowia',
    color:             0x8a7a6a,
    colorDark:         0x6a5a4a,
    icon:              '🌑',
    buildable:         true,
    allowedCategories: ['mining', 'energy', 'military'],
    yieldBonus:        { default: 0.7 },
    baseYield:         {},
    description:       'Zdegradowany teren, niska wydajność',
  },
};

// ── Klasa HexTile ─────────────────────────────────────────────────────────────
export class HexTile {
  constructor(q, r, type = 'plains') {
    // Współrzędne cube (s = -q-r, nie przechowujemy osobno)
    this.q = q;
    this.r = r;

    // Typ terenu — klucz do TERRAIN_TYPES
    this.type = type;

    // ID budynku stojącego na tym polu (null = puste)
    // Format: string, np. 'mine_1', 'solar_farm_3'
    this.buildingId = null;

    // Czy pole zostało zbadane przez gracza (fog of war na innych ciałach)
    this.explored = true;    // na planecie domowej zawsze true

    // Unikalne złoże strategiczne (null lub klucz pierwiastka z ElementsData)
    // Widoczne dopiero po zbadaniu terenu (technologia — etap 8)
    this.strategicResource = null;

    // Znacznik zniszczenia (np. po impakcie asteroidy — etap 12)
    this.damaged = false;

    // Stolica cywilizacji stoi na tym hexie (wirtualny budynek — nie blokuje budowy)
    this.capitalBase = false;

    // Anomalia na hexie (null | 'scientific' | 'resource' | 'danger')
    // Widoczna jako marker na globusie — gracz może zbadać
    this.anomaly = null;
  }

  // Skrótowy dostęp do definicji terenu
  get terrainDef() {
    return TERRAIN_TYPES[this.type] ?? TERRAIN_TYPES.wasteland;
  }

  // Czy można tu postawić budynek danej kategorii?
  canBuild(category) {
    if (!this.terrainDef.buildable) return false;
    if (this.buildingId !== null) return false;   // zajęte
    if (this.damaged) return false;
    return this.terrainDef.allowedCategories.includes(category);
  }

  // Czy pole jest zajęte przez budynek?
  get isOccupied() { return this.buildingId !== null; }

  // Unikalny string-klucz do Map (używany w HexGrid)
  get key() { return `${this.q},${this.r}`; }

  // Serializacja
  serialize() {
    return {
      q:                 this.q,
      r:                 this.r,
      type:              this.type,
      buildingId:        this.buildingId,
      explored:          this.explored,
      strategicResource: this.strategicResource,
      damaged:           this.damaged,
      capitalBase:       this.capitalBase,
      anomaly:           this.anomaly,
    };
  }

  static restore(data) {
    const tile = new HexTile(data.q, data.r, data.type);
    tile.buildingId        = data.buildingId        ?? null;
    tile.explored          = data.explored          ?? true;
    tile.strategicResource = data.strategicResource ?? null;
    tile.damaged           = data.damaged           ?? false;
    tile.capitalBase       = data.capitalBase       ?? false;
    tile.anomaly           = data.anomaly           ?? null;
    return tile;
  }
}
