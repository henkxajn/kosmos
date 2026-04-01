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
//   'mining' | 'energy' | 'food' | 'population' | 'research' | 'military' | 'space' | 'market' | 'synthetic' | 'governance'
// baseYield: pasywna produkcja bez budynku (per rok gry)
export const TERRAIN_TYPES = {
  plains: {
    namePL:            'Równina',
    color:             0x6e9b55,   // stonowany zielony (bliski 3D teksturze ocean)
    colorDark:         0x4e7b38,
    icon:              '🟢',
    buildable:         true,
    allowedCategories: ['mining', 'energy', 'food', 'population', 'research', 'military', 'space', 'market', 'synthetic', 'governance'],
    yieldBonus:        { food: 1.4, default: 1.0 },  // bonus do żywności
    baseYield:         { organics: 0.5 },
    description:       'Płaski teren, idealny pod zabudowę i uprawy',
  },

  mountains: {
    namePL:            'Góry',
    color:             0x8a7e6e,   // ciemniejszy brąz (góry/kamień w 3D)
    colorDark:         0x6a5e4e,
    icon:              '⛰',
    buildable:         true,
    allowedCategories: ['mining', 'energy', 'military', 'synthetic', 'governance'],  // brak rolnictwa
    yieldBonus:        { mining: 1.6, default: 0.8 },     // trudniejsza budowa, ale więcej rud
    baseYield:         { minerals: 0.8 },
    description:       'Bogate złoża minerałów, trudna budowa',
  },

  ocean: {
    namePL:            'Ocean',
    color:             0x1e3c8c,   // głęboki niebieski (bliski 3D ocean palette [20,45,110])
    colorDark:         0x142870,
    icon:              '🌊',
    buildable:         false,        // tylko ze specjalną technologią (etap późniejszy)
    allowedCategories: [],
    yieldBonus:        { default: 1.0 },
    baseYield:         { water: 1.0, organics: 0.3 },
    description:       'Nie do zabudowania bez odpowiedniej technologii',
  },

  forest: {
    namePL:            'Las',
    color:             0x3c7838,   // ciemna zieleń (bliski [60,120,100] z 3D ocean)
    colorDark:         0x285828,
    icon:              '🌲',
    buildable:         true,         // wymaga karczowania (koszt minerałów)
    allowedCategories: ['food', 'population', 'research', 'governance'],
    yieldBonus:        { food: 1.3, default: 0.9 },
    baseYield:         { organics: 1.2 },
    clearCost:         { minerals: 30 },   // koszt karczowania przed budową
    description:       'Bogata organika, wymaga karczowania przed budową',
  },

  desert: {
    namePL:            'Pustynia',
    color:             0xc8b478,   // stonowany piasek (bliski [200,195,150] z 3D)
    colorDark:         0xa89458,
    icon:              '🏜',
    buildable:         true,
    allowedCategories: ['mining', 'energy', 'military', 'space', 'market', 'synthetic'],
    yieldBonus:        { energy: 1.5, default: 0.9 },  // doskonałe słońce
    baseYield:         { minerals: 0.3 },
    description:       'Idealne nasłonecznienie, bonus dla elektrowni słonecznych',
  },

  tundra: {
    namePL:            'Tundra',
    color:             0x8eaab8,   // chłodny szaro-błękitny
    colorDark:         0x6e8a98,
    icon:              '🧊',
    buildable:         true,
    allowedCategories: ['mining', 'energy', 'food', 'military', 'market', 'governance'],
    yieldBonus:        { mining: 1.2, default: 0.8 },
    baseYield:         { minerals: 0.4, water: 0.3 },
    description:       'Zimny teren z płytkimi złożami i lodem',
  },

  volcano: {
    namePL:            'Wulkan',
    color:             0x8e3818,   // ciemny rdzawo-czerwony (bliski volcanic palette)
    colorDark:         0x6e2008,
    icon:              '🌋',
    buildable:         true,
    allowedCategories: ['energy', 'mining', 'market'],
    yieldBonus:        { energy: 2.0, mining: 1.3, default: 0.7 },  // geotermia!
    baseYield:         { energy: 1.5, minerals: 0.5 },
    description:       'Aktywność geotermiczna — ogromny bonus dla elektrowni',
  },

  crater: {
    namePL:            'Krater',
    color:             0x685848,   // ciemny brąz-szary (jak iron palette mid)
    colorDark:         0x483828,
    icon:              '☄',
    buildable:         true,
    allowedCategories: ['mining', 'research', 'military', 'synthetic'],
    yieldBonus:        { mining: 1.8, default: 0.9 },  // skondensowane pierwiastki z impaktu
    baseYield:         { minerals: 1.5 },
    strategic:         true,         // może zawierać unikalne pierwiastki (Au, Pt)
    description:       'Ślad po impakcie — skoncentrowane rzadkie pierwiastki',
  },

  ice_sheet: {
    namePL:            'Czapa lodowa',
    color:             0xc8dce8,   // jasny szaro-błękitny (bliski ice palette [200,210,225])
    colorDark:         0xa8bcc8,
    icon:              '❄',
    buildable:         true,
    allowedCategories: ['mining', 'energy', 'food'],
    yieldBonus:        { default: 0.8 },
    baseYield:         { water: 2.5 },
    description:       'Ogromne rezerwy lodu wodnego',
  },

  wasteland: {
    namePL:            'Pustkowia',
    color:             0x787060,   // szaro-brązowy (bliski rocky palette mid)
    colorDark:         0x585040,
    icon:              '🌑',
    buildable:         true,
    allowedCategories: ['mining', 'energy', 'military', 'synthetic'],
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
    // Format: string, np. 'mine', 'solar_farm'
    this.buildingId = null;

    // Poziom budynku (1–10, domyślnie 1)
    this.buildingLevel = 1;

    // Czy pole zostało zbadane przez gracza (fog of war na innych ciałach)
    this.explored = true;    // na planecie domowej zawsze true

    // Unikalne złoże strategiczne (null lub klucz pierwiastka z ElementsData)
    // Widoczne dopiero po zbadaniu terenu (technologia — etap 8)
    this.strategicResource = null;

    // Znacznik zniszczenia (np. po impakcie asteroidy — etap 12)
    this.damaged = false;

    // Stolica cywilizacji stoi na tym hexie (wirtualny budynek — nie blokuje budowy)
    this.capitalBase = false;

    // Anomalia na hexie (null | anomalyId string, np. 'neutronium_vein')
    // Dwuetapowe odkrywanie: survey wykrywa (detected), analyze ujawnia (revealed)
    this.anomaly = null;
    this.anomalyDetected = false;  // survey wykrył obecność
    this.anomalyRevealed = false;  // analyze ujawnił typ i efekty

    // Budowa w toku (null | { buildingId, progress, buildTime, isUpgrade? })
    this.underConstruction = null;

    // Oczekujące zamówienie (null | buildingId string) — czeka na surowce
    this.pendingBuild = null;

    // Syntetyczna jednostka zainstalowana w budynku (null | { commodityId, tier })
    // tier: 1=automation_droid (×1.4), 2=android_worker (×1.7), 3=ai_collective_node (×2.5)
    this.syntheticSlot = null;
  }

  // Skrótowy dostęp do definicji terenu
  get terrainDef() {
    return TERRAIN_TYPES[this.type] ?? TERRAIN_TYPES.wasteland;
  }

  // Czy można tu postawić budynek danej kategorii?
  canBuild(category) {
    if (!this.terrainDef.buildable) return false;
    if (this.buildingId !== null) return false;           // zajęte przez budynek
    if (this.underConstruction !== null) return false;    // zajęte przez budowę w toku
    if (this.pendingBuild !== null) return false;         // zajęte przez oczekujące zamówienie
    if (this.damaged) return false;
    return this.terrainDef.allowedCategories.includes(category);
  }

  // Czy pole jest zajęte przez budynek lub budowę w toku?
  get isOccupied() { return this.buildingId !== null || this.underConstruction !== null || this.pendingBuild !== null; }

  // Unikalny string-klucz do Map (używany w HexGrid)
  get key() { return `${this.q},${this.r}`; }

  // Serializacja
  serialize() {
    return {
      q:                 this.q,
      r:                 this.r,
      type:              this.type,
      buildingId:        this.buildingId,
      buildingLevel:     this.buildingLevel,
      explored:          this.explored,
      strategicResource: this.strategicResource,
      damaged:           this.damaged,
      capitalBase:       this.capitalBase,
      anomaly:           this.anomaly,
      anomalyDetected:   this.anomalyDetected,
      anomalyRevealed:   this.anomalyRevealed,
      underConstruction: this.underConstruction,
      syntheticSlot:     this.syntheticSlot,
    };
  }

  static restore(data) {
    const tile = new HexTile(data.q, data.r, data.type);
    tile.buildingId        = data.buildingId        ?? null;
    tile.buildingLevel     = data.buildingLevel     ?? 1;
    tile.explored          = data.explored          ?? true;
    tile.strategicResource = data.strategicResource ?? null;
    tile.damaged           = data.damaged           ?? false;
    tile.capitalBase       = data.capitalBase       ?? false;
    tile.anomaly           = data.anomaly           ?? null;
    tile.anomalyDetected   = data.anomalyDetected   ?? false;
    tile.anomalyRevealed   = data.anomalyRevealed   ?? false;
    tile.underConstruction = data.underConstruction ?? null;
    tile.syntheticSlot     = data.syntheticSlot     ?? null;
    return tile;
  }
}
