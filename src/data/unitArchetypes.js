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
//
// ── Opcja C v3: Supply/Org/Morale ────────────────────────────────────────────
//   baseOrg            — startowa organizacja (0..100)
//   baseMorale         — startowe morale (0..100) lub 0 dla dronów z noMorale
//   baseSupplyCap      — pojemność magazynu supply jednostki
//   supplyConsumption  — bazowa konsumpcja supply/civYear (mnożona przez matrycę §4 planu)
//   noMorale           — flag dla dronów/maszyn (morale pomijane w formułach, dmg mult dzieli tylko przez org/100)
//   isSupplier         — flag dla Supply Unit (SupplyCoverageSystem traktuje jako źródło supply)
//   supplyTransferRate — tempo transferu supply do sąsiadów (tylko gdy isSupplier)

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
    // Opcja C v3
    baseOrg:           10,
    baseMorale:        15,  // elita — wyższe morale startowe
    baseSupplyCap:     100,
    supplyConsumption: 3,
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
    // Opcja C v3
    baseOrg:           10,
    baseMorale:        10,
    baseSupplyCap:     100,
    supplyConsumption: 5,  // ciężki sprzęt pali dużo
  },

  // ── Garnizon: tryb Mobile (wóz kołowy) ↔ Deployed (okopany z aurą AC) ──
  //   • baseStats = staty trybu deployed (czyt. przez GroundUnitFactory — domyślnie)
  //   • mobileStats = staty trybu mobile (używane gdy deployState='mobile'|'deploying')
  //   • deployTime/packTime w civYears; w trakcie przejścia jednostka jest podatna
  //     (niski AC, zero dmg, zero mov — patrz _deployTransitStats w GroundUnitManager)
  garrison_unit: {
    id:          'garrison_unit',
    role:        'defense',
    category:    'defense',
    baseStats:   { hp: 30, ac: 8, dmg: 5, rng: 2, mov: 0 },      // tryb DEPLOYED (pierwotne)
    mobileStats: { hp: 30, ac: 3, dmg: 0, rng: 0, mov: 2 },      // tryb MOBILE (wóz kołowy)
    supportsDeploy: true,
    deployTime:  2.0,   // civYears rozłożenia (mobile → deployed)
    packTime:    1.0,   // civYears zwijania (deployed → mobile)
    packOrgCost: 15,    // minimalny org i koszt pack_up
    ability:     null,
    counters:    [],
    counteredBy: ['shock_infantry', 'rocket_artillery'],
    terrainModifiers: {},
    tags:        ['fortification', 'immobile', 'aura', 'deployable'],
    specialRules: [
      'Deployed: immobile, +2 AC aura for adjacent allies',
      'Mobile: wheeled transport, cannot attack, mov 2',
      'Deploy: 2 civY (vulnerable in transit)',
      'Pack up: 1 civY, costs 15 org',
    ],
    descriptionPL: 'Garnizon mobilny. Rozkłada się w stacjonarny okop (aura obronna) lub zwija w wóz kołowy do przejazdu.',
    descriptionEN: 'Mobile garrison. Deploys as fortified emplacement (defensive aura) or packs into wheeled transport.',
    // Opcja C v3
    baseOrg:           15,  // okopany — lepsza organizacja
    baseMorale:        10,
    baseSupplyCap:     100,
    supplyConsumption: 2,   // deployed; w mobile podwaja się do 4 (_applyDeployStateStats)
    mobileSupplyConsumption: 4,
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
    // Opcja C v3
    baseOrg:           10,
    baseMorale:        10,
    baseSupplyCap:     100,
    supplyConsumption: 3,
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
    // Opcja C v3
    baseOrg:           10,
    baseMorale:        15,
    baseSupplyCap:     100,
    supplyConsumption: 2,
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
    // Opcja C v3
    baseOrg:           20,  // zautomatyzowany, wysoka org startowa
    baseMorale:        0,
    noMorale:          true, // pomija morale w formułach (dmg mult korzysta tylko z org)
    baseSupplyCap:     50,
    supplyConsumption: 2,
  },

  // ── Jednostka Zaopatrzeniowa (Opcja C v3): mobilny magazyn, karmi sąsiadów w 1 hex ──
  ground_supply_unit: {
    id:          'ground_supply_unit',
    role:        'logistics',
    category:    'support',
    baseStats:   { hp: 40, ac: 3, dmg: 2, rng: 1, mov: 2 },
    ability:     null,
    counters:    [],
    counteredBy: ['shock_infantry', 'rocket_artillery', 'recon_drone'],
    terrainModifiers: {},
    tags:        ['vehicle', 'logistics', 'supplier', 'high_priority_target'],
    specialRules: [
      'Tankuje automatycznie gdy adjacent do Capital/Barracks',
      'Transferuje supply do sąsiadów (1 hex) po 10/civY każdemu',
      'Nie wlicza się do cap populacji (GROUND_UNIT_CAP_EXEMPT)',
    ],
    descriptionPL: 'Mobilne zaopatrzenie. Tankuje w Capital/Koszarach, karmi sąsiednie jednostki w promieniu 1 hex.',
    descriptionEN: 'Mobile supply. Refills at Capital/Barracks, feeds adjacent allies within 1 hex.',
    // Opcja C v3
    baseOrg:           20,
    baseMorale:        20,
    baseSupplyCap:     200,
    supplyConsumption: 1,
    isSupplier:        true,
    supplyTransferRate: 10,
  },
};

// ── Wymagania gating (Opcja C v3) ────────────────────────────────────────────
// Barracks Lv + tech required to BUILD each archetype.
// Używane przez ColonyManager.startGroundUnitBuild() + GroundUnitPanel UI lock overlay.

export const ARCHETYPE_REQUIREMENTS = {
  shock_infantry:     { barracksLv: 1, tech: null },
  garrison_unit:      { barracksLv: 1, tech: null },
  rocket_artillery:   { barracksLv: 2, tech: 'ground_warfare' },
  aa_platform:        { barracksLv: 2, tech: 'ground_warfare' },
  medic_unit:         { barracksLv: 2, tech: 'ground_warfare' },
  recon_drone:        { barracksLv: 3, tech: 'drone_warfare' },
  ground_supply_unit: { barracksLv: 2, tech: 'military_logistics' },
};

// Archetypy które NIE liczą się do cap populacji (autonomiczne / logistyczne).
export const GROUND_UNIT_CAP_EXEMPT = new Set(['recon_drone', 'ground_supply_unit']);

export function getArchetypeRequirements(archetypeId) {
  return ARCHETYPE_REQUIREMENTS[archetypeId] ?? { barracksLv: 1, tech: null };
}

/**
 * Sprawdź czy archetyp jest odblokowany w danej kolonii (tech + barracks lv).
 * @param {string} archetypeId
 * @param {number} barracksLv — max poziom barracks w kolonii
 * @param {object} techSystem — window.KOSMOS.techSystem (musi mieć isResearched)
 * @returns {{ unlocked: boolean, reason?: 'tech'|'barracks', missing?: string, requiredLv?: number }}
 */
export function checkArchetypeUnlocked(archetypeId, barracksLv, techSystem) {
  const req = getArchetypeRequirements(archetypeId);
  if (req.tech && !techSystem?.isResearched?.(req.tech)) {
    return { unlocked: false, reason: 'tech', missing: req.tech };
  }
  if (barracksLv < req.barracksLv) {
    return { unlocked: false, reason: 'barracks', requiredLv: req.barracksLv, currentLv: barracksLv };
  }
  return { unlocked: true };
}

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
