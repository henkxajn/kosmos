// EmpireGenerator — spawn obcych imperiów na podstawie danych galaktyki
//
// Slice 3.1a: 2 imperia AI — archetyp per-imperium wg AI_ARCHETYPE_SEQUENCE
//   (Industrialist + Expansionist, każde w innym home-systemie).
// Imperium dostaje REALNĄ kolonię (typu Colony) na minimal planet entity
// w wybranym home-systemie. Bez początkowej floty (Slice 4 doda ship production).
//
// Wywoływany JEDEN raz przy starcie nowej gry (po GalaxyGenerator.generate).
// Deterministyczny (Mulberry32 z seeda galaktyki) — ten sam układ → ten sam wynik.

import { NAME_PREFIXES_PL, NAME_PREFIXES_EN, ARCHETYPES, EMPIRE_COLOR_PALETTE } from '../data/EmpireData.js';
import { EmpireColonyBootstrap } from '../systems/EmpireColonyBootstrap.js';

// ── Stałe ─────────────────────────────────────────────────────────────────────
// Slice 3.1a: gracz + 2 AI. Archetyp per-imperium wg sekwencji (deterministyczny
//   po indeksie i): AI#1 = Industrialist, AI#2 = Expansionist (klon w S3.1a).
//   Liczba imperiów AI = długość sekwencji. Eksport dla testów (test-multi-ai-spawn).
export const AI_ARCHETYPE_SEQUENCE = ['industrialist', 'expansionist'];
const AI_EMPIRE_COUNT = AI_ARCHETYPE_SEQUENCE.length;  // 2
const MIN_LY = 5.0;   // min odległość imperium home od sys_home
const MAX_LY = 30.0;  // max odległość (galaktyka ma MAX 22 LY)

// Pula sufiksów nazw (wymieszane z prefiksami → np. "Manufaktura Pustki")
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

// ── Mulberry32 PRNG (determinizm) ─────────────────────────────────────────────
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
   * Generuje obce imperia na galaktyce. Slice 3.1a: 2 imperia AI wg
   * AI_ARCHETYPE_SEQUENCE (Industrialist + Expansionist), każde z realną kolonią.
   *
   * Zapisuje do GameState przez EmpireRegistry. Ustawia galaxyData.systems[i].empireId
   * dla rendering (GalaxyMap).
   *
   * @param {Object} galaxyData — wynik GalaxyGenerator.generate()
   * @param {EmpireRegistry} empireRegistry — instancja do createEmpire/addColony
   * @param {number} [count] — opcjonalna liczba imperiów (default AI_EMPIRE_COUNT=2)
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

    // Slice 3.1a: 2 imperia AI (count arg nadpisuje — testy / forward compat)
    const targetCount = count ?? AI_EMPIRE_COUNT;

    // Tasowanie kandydatów (deterministyczne — Fisher-Yates z PRNG)
    const pool = [...candidates];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    // Wybór home-systemów: pierwsze targetCount z shuffled poolu (różne układy).
    // Graceful: gdy kandydatów < targetCount, slice zwraca mniej → mniej imperiów.
    const homesChosen = pool.slice(0, targetCount);
    if (homesChosen.length < targetCount) {
      console.warn(`[EmpireGenerator] Tylko ${homesChosen.length} kandydatów w zasięgu (chciano ${targetCount}) — spawnuję mniej imperiów AI`);
    }

    // Generacja imperiów
    const createdIds = [];
    const usedNames = new Set();

    // Kolory tożsamości imperiów — bez duplikatów i z wykluczeniem koloru gracza.
    // Czyta AKTUALNY gameState.player.empireColor. ⚠ W B2 (wybór barwy na starcie)
    // kolor gracza MUSI trafić do gameState PRZED tym wywołaniem (EmpireGenerator.
    // generate w przepływie nowej gry) — inaczej AI może dostać kolor gracza.
    // Na etapie B1 to zawsze domyślny '#33ccff' z createDefaultState.
    const playerColor = String(globalThis.KOSMOS?.gameState?.get?.('player.empireColor') ?? '#33ccff').toLowerCase();
    const usedColors  = new Set([playerColor]);

    for (let i = 0; i < homesChosen.length; i++) {
      const homeSys = homesChosen[i];
      // Slice 3.1a: archetyp per-imperium wg sekwencji (po indeksie). Fallback
      //   'industrialist' gdy sekwencja krótsza niż liczba imperiów.
      const archetypeId = AI_ARCHETYPE_SEQUENCE[i] ?? 'industrialist';

      // Nazwa: prefix (archetype) + sufix (pula), unikalna, max 8 prób
      let name = null;
      let nameEN = null;
      for (let attempt = 0; attempt < 8; attempt++) {
        const prefixPool   = NAME_PREFIXES_PL[archetypeId] ?? ['Imperium'];
        const prefixPoolEN = NAME_PREFIXES_EN[archetypeId] ?? ['Empire'];
        const pIdx = Math.floor(rng() * prefixPool.length);
        const sIdx = Math.floor(rng() * NAME_SUFFIXES_PL.length);
        const candName = `${prefixPool[pIdx]} ${NAME_SUFFIXES_PL[sIdx]}`;
        if (usedNames.has(candName)) continue;
        name   = candName;
        nameEN = `${prefixPoolEN[pIdx] ?? prefixPool[pIdx]} ${NAME_SUFFIXES_EN[sIdx] ?? NAME_SUFFIXES_PL[sIdx]}`;
        break;
      }
      if (!name) {
        name   = `Industrialista ${homeSys.name}`;
        nameEN = `Industrialist of ${homeSys.name}`;
      }
      usedNames.add(name);

      const empireId = `emp_${String(i + 1).padStart(3, '0')}`;

      // Kolor: preferuj archetyp; przy kolizji/pokryciu z graczem → pierwszy wolny slot palety.
      const archColor = ARCHETYPES[archetypeId]?.color;
      let color = (archColor && !usedColors.has(archColor.toLowerCase())) ? archColor : null;
      if (!color) color = EMPIRE_COLOR_PALETTE.find(c => !usedColors.has(c.toLowerCase())) ?? archColor ?? '#888888';
      usedColors.add(color.toLowerCase());

      // Utwórz imperium — Slice 1: BEZ abstract scalars (military/tech/resources)
      empireRegistry.createEmpire({
        id:           empireId,
        name,
        namePL:       name,
        nameEN,
        archetype:    archetypeId,
        color,
        homeSystemId: homeSys.id,
        // colonies puste — EmpireColonyBootstrap doda przez addColony
        colonies:     [],
      });

      // Bootstrap realnej kolonii (planet entity + ColonyManager.createColony
      // + startingBuildings via autoPlaceBuilding + POPy + safety stocks).
      // Obiekt archetypu z rejestru ARCHETYPES (rich config wg archetypeId).
      const colonyId = EmpireColonyBootstrap.bootstrapHomeColony(
        empireId,
        ARCHETYPES[archetypeId],
        homeSys.id
      );
      if (!colonyId) {
        console.error(`[EmpireGenerator] Bootstrap kolonii nie powiódł się dla ${empireId}`);
        // empireRegistry.destroyEmpire(empireId, 'bootstrap_failed'); — pozostaw, gracz zobaczy issue w gameState
      }

      // Zaznacz home na galaxyData (szybki lookup dla GalaxyMap)
      homeSys.empireId = empireId;

      createdIds.push(empireId);
    }

    console.log(`[EmpireGenerator] Spawnowano ${createdIds.length} imperium AI (Slice 3.1a):`, createdIds);
    return createdIds;
  }
}
