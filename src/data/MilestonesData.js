// MilestonesData — definicje kamieni milowych historii kolonii
//
// Każdy milestone to wydarzenie wpisywane permanentnie do colonyHistory.
// Identity = suma identityValue z historii. Loyalty += loyaltyPerm (permanentny offset).
// Warunki sprawdzane co rok cywilny przez CivilizationSystem._yearlyMilestoneCheck().

// ── Definicje milestones ───────────────────────────────────────────────────

export const MILESTONE_DEFINITIONS = [

  // ── Automatyczne (czas) ────────────────────────────────────────────────

  {
    type:          'founding',
    namePL:        (col) => `Założenie kolonii ${col.name}`,
    nameEN:        (col) => `Founding of ${col.name}`,
    icon:          '🏗',
    loyaltyPerm:   0,
    identityValue: 3,
    unique:        true,
    // Triggerowany ręcznie przy kolonizacji, nie przez _yearlyMilestoneCheck
    condition:     () => false,
  },
  {
    type:          'decade',
    namePL:        (col) => `Pierwsza dekada (rok ${col.year})`,
    nameEN:        (col) => `First decade (year ${col.year})`,
    icon:          '📅',
    loyaltyPerm:   2,
    identityValue: 2,
    unique:        true,
    condition:     (st) => st.colonyAge >= 10,
  },
  {
    type:          'half_century',
    namePL:        (col) => `Pół wieku istnienia`,
    nameEN:        (col) => `Half century of existence`,
    icon:          '🏛',
    loyaltyPerm:   2,
    identityValue: 3,
    unique:        true,
    condition:     (st) => st.colonyAge >= 50,
  },
  {
    type:          'century',
    namePL:        (col) => `Stulecie istnienia`,
    nameEN:        (col) => `Century of existence`,
    icon:          '👑',
    loyaltyPerm:   3,
    identityValue: 5,
    unique:        false,
    cooldown:      100,  // co 100 lat civYears
    condition:     (st) => st.colonyAge >= 100 && st.colonyAge % 100 < 2,
  },

  // ── Prosperity-based ───────────────────────────────────────────────────

  {
    type:          'golden_decade',
    namePL:        (col) => `Złota Dekada ${col.year - 10}–${col.year}`,
    nameEN:        (col) => `Golden Decade ${col.year - 10}–${col.year}`,
    icon:          '✨',
    loyaltyPerm:   8,
    identityValue: 5,
    unique:        false,
    cooldown:      50,
    condition:     (st) => st.consecutiveHighProsperityYears >= 10,
    onTrigger:     (st) => { st.consecutiveHighProsperityYears = 0; },
  },
  {
    type:          'dark_age',
    namePL:        (col) => `Mroczna Epoka ${col.year - 15}–${col.year}`,
    nameEN:        (col) => `Dark Age ${col.year - 15}–${col.year}`,
    icon:          '🌑',
    loyaltyPerm:   -8,
    identityValue: 10,
    unique:        false,
    cooldown:      50,
    condition:     (st) => st.consecutiveLowProsperityYears >= 15,
    onTrigger:     (st) => { st.consecutiveLowProsperityYears = 0; },
    crisis:        true,  // auto-pause przy triggerze
  },

  // ── Kryzysowe ──────────────────────────────────────────────────────────

  {
    type:          'great_famine',
    namePL:        (col) => `Wielki Głód roku ${col.year}`,
    nameEN:        (col) => `Great Famine of year ${col.year}`,
    icon:          '💀',
    loyaltyPerm:   -5,
    identityValue: 8,
    unique:        false,
    cooldown:      20,
    condition:     (st) => st.consecutiveFamineYears >= 3,
    onTrigger:     (st) => { st.consecutiveFamineYears = 0; },
    crisis:        true,
  },
  {
    type:          'disaster_survived',
    namePL:        (col) => `Przetrwanie katastrofy roku ${col.year}`,
    nameEN:        (col) => `Surviving the disaster of year ${col.year}`,
    icon:          '☄',
    loyaltyPerm:   -3,
    identityValue: 12,
    unique:        false,
    cooldown:      10,
    condition:     (st) => st.justSurvivedDisaster,
    onTrigger:     (st) => { st.justSurvivedDisaster = false; },
    crisis:        true,
  },
  {
    type:          'crisis_survived',
    namePL:        (col) => `Przetrwanie kryzysu roku ${col.year}`,
    nameEN:        (col) => `Crisis survived in year ${col.year}`,
    icon:          '💪',
    loyaltyPerm:   2,
    identityValue: 5,
    unique:        false,
    cooldown:      10,
    condition:     (st) => st.justSurvivedCrisis,
    onTrigger:     (st) => { st.justSurvivedCrisis = false; },
  },

  // ── Handlowe ───────────────────────────────────────────────────────────

  {
    type:          'trade_hub',
    namePL:        (col) => `Era Centrum Handlowego`,
    nameEN:        (col) => `Trade Hub Era`,
    icon:          '🚀',
    loyaltyPerm:   12,
    identityValue: 4,
    unique:        true,
    condition:     (st) => st.consecutiveHighTradeYears >= 25 && st.activeTradeRoutes >= 4,
  },
  {
    type:          'isolation_era',
    namePL:        (col) => `Era Izolacji`,
    nameEN:        (col) => `Era of Isolation`,
    icon:          '🏝',
    loyaltyPerm:   -10,
    identityValue: 15,
    unique:        true,
    condition:     (st) => st.yearsWithoutTrade >= 40,
    crisis:        true,
  },

  // ── Populacyjne ────────────────────────────────────────────────────────

  {
    type:          'population_boom',
    namePL:        (col) => `Boom Demograficzny`,
    nameEN:        (col) => `Population Boom`,
    icon:          '👶',
    loyaltyPerm:   3,
    identityValue: 6,
    unique:        false,
    cooldown:      50,
    condition:     (st) => st.popTripled,
    onTrigger:     (st) => {
      st.popTripled = false;
      st.popAtReference = st.currentPop;
      st.popReferenceYear = st.year;
    },
  },
  {
    type:          'tech_center',
    namePL:        (col) => `Ośrodek Naukowy`,
    nameEN:        (col) => `Science Center`,
    icon:          '🔬',
    loyaltyPerm:   5,
    identityValue: 5,
    unique:        true,
    condition:     (st) => st.consecutiveHighResearchYears >= 20,
  },

  // ── Polityczne (z ruchów społecznych) ──────────────────────────────────
  // Te milestones są triggerowane RĘCZNIE przez resolveMovement/triggerMovement,
  // nie przez _yearlyMilestoneCheck. condition = () => false.

  {
    type:          'revolution',
    namePL:        (col) => `${col.movementName || 'Ruch społeczny'} roku ${col.year}`,
    nameEN:        (col) => `${col.movementNameEN || 'Social movement'} of year ${col.year}`,
    icon:          '✊',
    loyaltyPerm:   -5,
    identityValue: 10,
    unique:        false,
    condition:     () => false,  // trigger ręczny
    crisis:        true,
  },
  {
    type:          'reconciliation',
    namePL:        (col) => `Pojednanie roku ${col.year}`,
    nameEN:        (col) => `Reconciliation of year ${col.year}`,
    icon:          '🤝',
    loyaltyPerm:   10,
    identityValue: 3,
    unique:        false,
    condition:     () => false,  // trigger ręczny
  },
  {
    type:          'suppression',
    namePL:        (col) => `Wielkie Stłumienie roku ${col.year}`,
    nameEN:        (col) => `Great Suppression of year ${col.year}`,
    icon:          '⚔',
    loyaltyPerm:   -12,
    identityValue: 15,
    unique:        false,
    condition:     () => false,  // trigger ręczny
    crisis:        true,
  },
  {
    type:          'separatism_crisis',
    namePL:        (col) => `Ruch Wolności roku ${col.year}`,
    nameEN:        (col) => `Freedom Movement of year ${col.year}`,
    icon:          '🏴',
    loyaltyPerm:   -15,
    identityValue: 12,
    unique:        false,
    condition:     () => false,  // trigger ręczny
    crisis:        true,
  },

  // ── Budynkowe ──────────────────────────────────────────────────────────

  {
    type:          'cultural_center_built',
    namePL:        (col) => `Otwarcie Centrum Kulturalnego`,
    nameEN:        (col) => `Cultural Center Opened`,
    icon:          '🎭',
    loyaltyPerm:   2,
    identityValue: 7,
    unique:        true,
    condition:     () => false,  // trigger ręczny (przy budowie cultural_center)
  },
];

// ── Mapa typów do szybkiego lookup ─────────────────────────────────────────

export const MILESTONE_BY_TYPE = {};
for (const def of MILESTONE_DEFINITIONS) {
  MILESTONE_BY_TYPE[def.type] = def;
}

// ── Cultural traits — aktywowane na podstawie historii ──────────────────────
// Warunki sprawdzane co 10 lat civYears przez _checkTraitsFromHistory()

export const CULTURAL_TRAITS = {
  frontier_pride: {
    id:           'frontier_pride',
    namePL:       'Duma Pogranicza',
    nameEN:       'Frontier Pride',
    icon:         '⭐',
    effectPL:     '+15% produkcja na wrogim terenie, +tożsamość',
    effectEN:     '+15% hostile terrain production, +identity',
    productionBonus: { hostile: 0.15 },
    condition:    (history) => {
      const types = history.map(h => h.type);
      return types.includes('isolation_era') && types.includes('disaster_survived');
    },
  },
  martyrs_colony: {
    id:           'martyrs_colony',
    namePL:       'Kolonia Męczenników',
    nameEN:       'Martyrs\' Colony',
    icon:         '⚔',
    effectPL:     '+10% produkcja, -10 lojalność permanentnie',
    effectEN:     '+10% production, -10 loyalty permanently',
    productionBonus: { all: 0.10 },
    loyaltyPenalty: -10,
    condition:    (history) => {
      return history.filter(h => h.type === 'suppression').length >= 2;
    },
  },
  reform_heritage: {
    id:           'reform_heritage',
    namePL:       'Dziedzictwo Reform',
    nameEN:       'Reform Heritage',
    icon:         '📜',
    effectPL:     '+8% produkcja, stabilna lojalność',
    effectEN:     '+8% production, stable loyalty',
    productionBonus: { all: 0.08 },
    condition:    (history) => {
      return history.filter(h => h.type === 'reconciliation').length >= 2;
    },
  },
  academic_republic: {
    id:           'academic_republic',
    namePL:       'Republika Akademicka',
    nameEN:       'Academic Republic',
    icon:         '🔬',
    effectPL:     '+25% badania',
    effectEN:     '+25% research',
    productionBonus: { research: 0.25 },
    condition:    (history, identityScore) => {
      const types = history.map(h => h.type);
      return types.includes('tech_center') && identityScore > 35;
    },
  },
  free_trade_charter: {
    id:           'free_trade_charter',
    namePL:       'Karta Wolnego Handlu',
    nameEN:       'Free Trade Charter',
    icon:         '💰',
    effectPL:     '+20% kredyty handlowe',
    effectEN:     '+20% trade credits',
    creditBonus:  0.20,
    condition:    (history) => {
      const types = history.map(h => h.type);
      return types.includes('trade_hub') && types.includes('golden_decade');
    },
  },
};
