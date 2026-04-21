// EmpireGenerator — spawn obcych imperiów na podstawie danych galaktyki
//
// Wywoływany JEDEN raz przy starcie nowej gry (po GalaxyGenerator.generate).
// Deterministyczny (Mulberry32 z seeda galaktyki), więc ten sam układ zawsze
// da tych samych obcych.
//
// Wybór gwiazd:
//   - NIE home (sys_home)
//   - W przedziale odległości [MIN_LY, MAX_LY] od home
//   - Gwiazdy dla różnych imperiów rozproszone (min separacja SEP_LY)
//
// Każde imperium dostaje 1–3 kolonie (home + 0–2 outpostów) w pobliżu swego home.

import { ARCHETYPES, ARCHETYPE_IDS, NAME_PREFIXES_PL, NAME_PREFIXES_EN } from '../data/EmpireData.js';
import { INVASION_UNIT_POOLS } from '../data/GroundUnitData.js';

// ── Stałe ─────────────────────────────────────────────────────────────────────
const COUNT_MIN  = 3;     // minimalna liczba imperiów
const COUNT_MAX  = 6;     // maksymalna liczba imperiów (3-6 zgodnie z planem)
const MIN_LY     = 5.0;   // min odległość imperium home od sys_home
const MAX_LY     = 30.0;  // max odległość (żeby było blisko gracza — galaktyka ma MAX 22 LY)
const SEP_LY     = 6.0;   // separacja między home-systemami różnych imperiów
const COLONY_RAD = 10.0;  // max odległość dodatkowych kolonii od home imperium

// Pula sufiksów nazw (wymieszane z prefiksami → np. "Rój Żelaznych Zębów")
const NAME_SUFFIXES_PL = [
  'Żelaznych Zębów', 'Pustki', 'Czerwonego Oka', 'Trzech Słońc', 'Zimnej Gwiazdy',
  'Zgubionego Świtu', 'Srebrnej Nici', 'Tlenu', 'Bezkresnej Nocy', 'Spalonej Drogi',
  'Siódmego Kręgu', 'Długiego Cienia', 'Szeptu', 'Żaru', 'Krwawej Mgławicy',
  'Ciernia', 'Pierwszego Chłodu', 'Milczącego Pulsaru', 'Wiecznej Mrozy', 'Martwego Światła',
];
const NAME_SUFFIXES_EN = [
  'Iron Fangs', 'the Void', 'Red Eye', 'Three Suns', 'Cold Star',
  'Lost Dawn', 'Silver Thread', 'Oxygen', 'Endless Night', 'Burnt Path',
  'Seventh Circle', 'Long Shadow', 'Whisper', 'Ember', 'Bloody Nebula',
  'Thorn', 'First Frost', 'Silent Pulsar', 'Eternal Cold', 'Dead Light',
];

// ── Mulberry32 (skopiowane z GalaxyGenerator — determinizm) ────────────────────
function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dist3D(a, b) {
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export class EmpireGenerator {
  /**
   * Generuje obce imperia na galaktyce. Zapisuje do GameState przez EmpireRegistry.
   * Ustawia też galaxyData.systems[i].empireId dla rendering (GalaxyMap).
   *
   * @param {Object} galaxyData — wynik GalaxyGenerator.generate()
   * @param {EmpireRegistry} empireRegistry — instancja do createEmpire/addColony
   * @param {number} [count] — opcjonalna liczba imperiów (inaczej losowana 3-6)
   * @returns {Array} lista id utworzonych imperiów
   */
  static generate(galaxyData, empireRegistry, count = null) {
    if (!galaxyData?.systems?.length) {
      console.warn('[EmpireGenerator] Brak galaxyData.systems — pomijam');
      return [];
    }
    if (!empireRegistry) {
      console.error('[EmpireGenerator] Wymagana instancja EmpireRegistry');
      return [];
    }

    const seed = (galaxyData.seed ?? 0) ^ 0xEE01;
    const rng = mulberry32(seed);

    const home = galaxyData.systems.find(s => s.isHome) ?? { x: 0, y: 0, z: 0 };
    const candidates = galaxyData.systems
      .filter(s => !s.isHome)
      .filter(s => {
        const d = s.distanceLY ?? dist3D(s, home);
        return d >= MIN_LY && d <= MAX_LY;
      });

    if (candidates.length === 0) {
      console.warn('[EmpireGenerator] Brak kandydatów w zasięgu — pomijam spawn');
      return [];
    }

    // Liczba imperiów
    const targetCount = count ?? (COUNT_MIN + Math.floor(rng() * (COUNT_MAX - COUNT_MIN + 1)));

    // Tasowanie kandydatów
    const pool = [...candidates];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    // Wybór home-systemów z separacją
    const homesChosen = [];
    for (const sys of pool) {
      if (homesChosen.length >= targetCount) break;
      const tooClose = homesChosen.some(h => dist3D(h, sys) < SEP_LY);
      if (tooClose) continue;
      homesChosen.push(sys);
    }

    // Jeśli za mało udało się z separacją → uzupełnij bez niej
    if (homesChosen.length < COUNT_MIN) {
      for (const sys of pool) {
        if (homesChosen.length >= COUNT_MIN) break;
        if (!homesChosen.includes(sys)) homesChosen.push(sys);
      }
    }

    // Generacja imperiów
    const createdIds = [];
    const usedNames = new Set();

    for (let i = 0; i < homesChosen.length; i++) {
      const homeSys = homesChosen[i];
      const archetypeId = ARCHETYPE_IDS[Math.floor(rng() * ARCHETYPE_IDS.length)];

      // Nazwa: prefix + sufiks (próbuj do 8× znaleźć unikalną)
      let name = null;
      let nameEN = null;
      for (let attempt = 0; attempt < 8; attempt++) {
        const prefixPool = NAME_PREFIXES_PL[archetypeId] ?? ['Imperium'];
        const prefixPoolEN = NAME_PREFIXES_EN[archetypeId] ?? ['Empire'];
        const pIdx = Math.floor(rng() * prefixPool.length);
        const sIdx = Math.floor(rng() * NAME_SUFFIXES_PL.length);
        const candName = `${prefixPool[pIdx]} ${NAME_SUFFIXES_PL[sIdx]}`;
        if (usedNames.has(candName)) continue;
        name = candName;
        nameEN = `${prefixPoolEN[pIdx] ?? prefixPool[pIdx]} ${NAME_SUFFIXES_EN[sIdx] ?? NAME_SUFFIXES_PL[sIdx]}`;
        break;
      }
      if (!name) {
        name = `Imperium ${homeSys.name}`;
        nameEN = `Empire of ${homeSys.name}`;
      }
      usedNames.add(name);

      const empireId = `emp_${String(i + 1).padStart(3, '0')}`;

      // Utwórz imperium (intent method)
      const emp = empireRegistry.createEmpire({
        id:           empireId,
        name,
        namePL:       name,
        nameEN,
        archetype:    archetypeId,
        homeSystemId: homeSys.id,
        colonies:     [{ systemId: homeSys.id, planetId: null }],
        // abstract starting resources wg personality
        military:     { power: 80 + Math.floor(rng() * 120) },   // 80-200
        tech:         { level: 1, focus: null },                 // focus przypisze createEmpire
        resources:    { production: 40 + Math.floor(rng() * 60) }, // 40-100
      });

      // Faza 4: początkowa flota obronna w home-systemie
      // Siła skalowana od personality.aggression + archetype
      const arch = ARCHETYPES[archetypeId];
      const aggroMult = 0.7 + (arch?.personality?.aggression ?? 0.5) * 0.6; // 0.7 - 1.3
      // Faza desantu: flagi transport wojsk — prawdopodobieństwo per archetyp.
      // xenophage/hegemon są agresywne → wysoka szansa; trader niska.
      // Domyślnie 0.4 jeśli brak konfiguracji. Pojemność 3-8 jednostek.
      const transportChance = arch?.personality?.landInvasion ?? (0.3 + (arch?.personality?.aggression ?? 0.5) * 0.4);
      const hasTroopTransport = rng() < transportChance;
      const troopCapacity = hasTroopTransport ? 3 + Math.floor(rng() * 6) : 0; // 3-8
      // Załaduj konkretne archetypy z puli wg archetypu imperium (parity z graczem — realne unity, nie random spawn)
      const embarkedTroops = [];
      if (hasTroopTransport && troopCapacity > 0) {
        const pool = INVASION_UNIT_POOLS[archetypeId] ?? ['infantry', 'infantry'];
        for (let k = 0; k < troopCapacity; k++) {
          embarkedTroops.push(pool[Math.floor(rng() * pool.length)]);
        }
      }
      empireRegistry.spawnFleet(empireId, {
        strength: Math.round((emp.military?.power ?? 100) * 0.5 * aggroMult),
        systemId: homeSys.id,
        hasTroopTransport,
        troopCapacity,
        embarkedTroops,
      });

      // Dodatkowe kolonie (0-2) — z pobliskich systemów
      const extraColCount =
        arch.personality.expansion > 0.7 ? 2 :
        arch.personality.expansion > 0.4 ? 1 : 0;

      if (extraColCount > 0) {
        const near = galaxyData.systems
          .filter(s => !s.isHome && s.id !== homeSys.id)
          .filter(s => !s.empireId)   // wolne
          .filter(s => dist3D(s, homeSys) <= COLONY_RAD)
          .sort((a, b) => dist3D(a, homeSys) - dist3D(b, homeSys));

        for (let k = 0; k < Math.min(extraColCount, near.length); k++) {
          empireRegistry.addColony(empireId, near[k].id, null);
          near[k].empireId = empireId;  // od razu zaznacz, żeby inni nie wzięli
        }
      }

      // Zaznacz home na galaxyData (szybki lookup dla GalaxyMap)
      homeSys.empireId = empireId;

      createdIds.push(empireId);
    }

    console.log(`[EmpireGenerator] Spawnowano ${createdIds.length} imperiów:`, createdIds);
    return createdIds;
  }
}
