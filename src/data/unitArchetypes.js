// unitArchetypes.js — archetypy jednostek naziemnych (Ground Unit System)
//
// Archetyp definiuje rolę taktyczną, bazowe staty i wzajemne counters.
// Frakcje (humanity/UNE/Syndykat) dostarczają nazwę, sprite, kolor i ewentualne statsModifier.
//
// Pola:
//   baseStats.{hp,ac,dmg,rng,mov} — HP, Armor Class, Damage, Range (hex), Movement (hex/tura)
//   ability                        — klucz z GROUND_ABILITIES (null = brak)
//   counters                       — archetypy które ta jednostka bije (+30% dmg)
//   counteredBy                    — archetypy które biją tę jednostkę (info dla UI/AI)
//   terrainModifiers               — override kosztów terenu (Infinity = nieprzejezdne)
//   tags                           — tagi do filtrowania/AI
//   specialRules                   — opis reguł specjalnych (informacyjne dla UI)

export const UNIT_ARCHETYPES = {
  // ── Szturm: szybka piechota, zajmuje budynki, bonus w mieście ──
  shock_infantry: {
    id:          'shock_infantry',
    role:        'assault',
    category:    'attack',
    baseStats:   { hp: 15, ac: 3, dmg: 7, rng: 1, mov: 2 },
    ability:     'capture_building',
    counters:    ['garrison_unit'],
    counteredBy: ['rocket_artillery', 'aa_platform'],
    terrainModifiers: { city: 0.5 }, // szybsza w urban terrain
    tags:        ['infantry', 'captures', 'melee_range'],
    specialRules: [
      'Can capture buildings',
      'Urban combat bonus: +1 AC in city hex',
    ],
    descriptionPL: 'Lekka piechota szturmowa. Szybko zajmuje budynki, dobra w walce miejskiej.',
    descriptionEN: 'Light shock infantry. Quickly captures buildings, effective in urban combat.',
  },

  // ── Artyleria rakietowa: długi zasięg, mało HP, nie może strzelać w zwarciu ──
  rocket_artillery: {
    id:          'rocket_artillery',
    role:        'ranged',
    category:    'attack',
    baseStats:   { hp: 10, ac: 2, dmg: 14, rng: 4, mov: 1 },
    ability:     'orbital_support',
    counters:    ['garrison_unit'],
    counteredBy: ['shock_infantry', 'recon_drone'],
    terrainModifiers: { forest: 2, mountains: Infinity },
    tags:        ['vehicle', 'bombardment', 'long_range'],
    specialRules: [
      'Cannot fire if enemy within range 1',
      'Needs 1 turn to set up after moving',
    ],
    descriptionPL: 'Artyleria rakietowa dalekiego zasięgu. Druzgocąca siła ognia, ale krucha w zwarciu.',
    descriptionEN: 'Long-range rocket artillery. Devastating firepower, fragile at close range.',
  },

  // ── Garnizon: stacjonarna obrona, aura AC dla sąsiadów ──
  garrison_unit: {
    id:          'garrison_unit',
    role:        'defense',
    category:    'defense',
    baseStats:   { hp: 30, ac: 8, dmg: 5, rng: 2, mov: 0 },
    ability:     null,
    counters:    [],
    counteredBy: ['shock_infantry', 'rocket_artillery'],
    terrainModifiers: {},
    tags:        ['fortification', 'immobile', 'aura'],
    specialRules: [
      'Cannot move after deployment',
      'Grants +2 AC to adjacent friendly units',
    ],
    descriptionPL: 'Stacjonarny garnizon. Wysokie HP i pancerz, wzmacnia sąsiadów aurą obronną.',
    descriptionEN: 'Fortified garrison. High HP and armor, buffs adjacent allies with defensive aura.',
  },

  // ── Obrona przeciw-drono-powietrzna: przechwytuje drony, słaba przeciw piechocie ──
  aa_platform: {
    id:          'aa_platform',
    role:        'defense',
    category:    'defense',
    baseStats:   { hp: 12, ac: 3, dmg: 8, rng: 2, mov: 2 },
    ability:     null,
    counters:    ['recon_drone'],
    counteredBy: ['shock_infantry', 'rocket_artillery'],
    terrainModifiers: {},
    tags:        ['vehicle', 'anti_air', 'intercept'],
    specialRules: [
      'Intercepts drones entering range before they act',
      'DMG vs ground units halved',
      'DMG vs drones doubled',
    ],
    descriptionPL: 'Platforma przeciwlotnicza. Niszczy drony, słaba przeciw piechocie i pojazdom.',
    descriptionEN: 'Anti-air platform. Shreds drones, weak against infantry and vehicles.',
  },

  // ── Medyk: leczy sąsiadów, nie atakuje, priorytet celowania AI ──
  medic_unit: {
    id:          'medic_unit',
    role:        'support',
    category:    'support',
    baseStats:   { hp: 10, ac: 2, dmg: 0, rng: 0, mov: 2 },
    ability:     'heal_nearby',
    counters:    [],
    counteredBy: ['shock_infantry', 'recon_drone'],
    terrainModifiers: {},
    tags:        ['vehicle', 'support', 'no_attack', 'high_priority_target'],
    specialRules: [
      'Cannot attack',
      'AI prioritizes eliminating this unit',
    ],
    descriptionPL: 'Pojazd medyczny wsparcia. Leczy sąsiadów +3 HP/turę. Nie atakuje.',
    descriptionEN: 'Medical support crawler. Heals adjacent allies +3 HP/turn. Cannot attack.',
  },

  // ── Dron zwiadowczy: latający, niewidoczny, bateria na 5 tur ──
  recon_drone: {
    id:          'recon_drone',
    role:        'scout',
    category:    'drone',
    baseStats:   { hp: 4, ac: 1, dmg: 0, rng: 3, mov: 5 },
    ability:     'stealth',
    counters:    [],
    counteredBy: ['aa_platform'],
    terrainModifiers: {}, // ignoruje koszty terenu (obsługa w managerze)
    tags:        ['drone', 'flying', 'stealth', 'no_attack'],
    specialRules: [
      'Ignores terrain movement costs',
      'Invisible until revealed',
      'Lifespan: 5 turns before battery depletes',
      'Cannot attack',
    ],
    descriptionPL: 'Latający dron zwiadowczy. Niewidoczny, ujawnia mgłę wojny. Bateria na 5 tur.',
    descriptionEN: 'Flying recon drone. Invisible, reveals fog of war. Battery lasts 5 turns.',
  },
};

/**
 * Mapowanie role (assault/ranged/defense/support/scout) → legacy role (military/defensive/support/drone).
 * Legacy role używane przez GroundUnitManager._tickCombatAI filter i stare handlery.
 */
export function mapRoleToLegacy(role) {
  if (role === 'assault' || role === 'ranged') return 'military';
  if (role === 'defense') return 'defensive';
  if (role === 'support') return 'support';
  if (role === 'scout' || role === 'drone') return 'drone';
  return 'civilian';
}
