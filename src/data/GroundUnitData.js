// GroundUnitData — definicje jednostek naziemnych (Faza 6)
//
// Jednostki żyją na HexGrid planety. Dwa typy ownera:
//   owner=null / 'player' — gracz (spawn z colony_base, budynków kolonizacyjnych)
//   owner=empireId        — obcy (spawn z InvasionSystem przy lądowaniu floty)
//
// Statystyki:
//   hp       — punkty życia
//   attack   — damage zadawany w 1 ataku
//   defense  — redukcja damage (attack - defense, min 1)
//   range    — zasięg ataku (1 = tylko sąsiedni hex)
//   speedHex — hex/civYear (prędkość ruchu w civYears)
//   sprite   — nazwa pliku w assets/units/ (bez .png)

export const GROUND_UNITS = {
  // ── Graczowe / neutralne ──────────────────────────────────

  science_rover: {
    id:        'science_rover',
    namePL:    'Łazik Badawczy',
    nameEN:    'Science Rover',
    icon:      '🛰',
    hp:        40,
    attack:    1,
    defense:   1,
    range:     1,
    speedHex:  2.0,
    sprite:    'science_rover',
    role:      'civilian',   // niemilitarny — ucieka przed walką
    description: 'Robot badawczy. Słabo zbrojny, ale niezbędny do skanowania anomalii.',
  },

  infantry: {
    id:        'infantry',
    namePL:    'Piechota',
    nameEN:    'Infantry',
    icon:      '🪖',
    hp:        60,
    attack:    12,
    defense:   4,
    range:     1,
    speedHex:  1.5,
    sprite:    'infantry',
    role:      'military',
    description: 'Podstawowa jednostka bojowa. Tania, szybka, uniwersalna.',
  },

  mech: {
    id:        'mech',
    namePL:    'Mech Bojowy',
    nameEN:    'Battle Mech',
    icon:      '🤖',
    hp:        150,
    attack:    25,
    defense:   10,
    range:     1,
    speedHex:  0.8,
    sprite:    'mech',
    role:      'military',
    description: 'Ciężka jednostka bojowa. Duże HP, silny atak, powolny.',
  },

  garrison: {
    id:        'garrison',
    namePL:    'Garnizon',
    nameEN:    'Garrison',
    icon:      '🛡',
    hp:        100,
    attack:    8,
    defense:   15,
    range:     1,
    speedHex:  0,      // stacjonarny
    sprite:    'garrison',
    role:      'defensive',
    description: 'Stacjonarna jednostka obronna. Wysoka obrona, zero mobilności.',
  },
};

/** Pobierz pełne statystyki dla typu (lub domyślne dla nieznanych). */
export function getUnitStats(type) {
  const def = GROUND_UNITS[type];
  if (!def) {
    // Domyślne wartości dla unknown types (backward-compat dla scan/anomaly units)
    return { hp: 40, attack: 5, defense: 2, range: 1, speedHex: 1.5, role: 'civilian' };
  }
  return def;
}

/** Lista dostępna dla gracza (bez obcych — obcy są wybierani przez InvasionSystem). */
export const PLAYER_UNITS = ['science_rover', 'infantry', 'mech', 'garrison'];

/** Pula dla lądowania obcych — wagi zależą od archetypu (Faza 6 uproszczona). */
export const INVASION_UNIT_POOLS = {
  xenophage:    ['infantry', 'infantry', 'mech'],        // szybko-agresywny
  swarm:        ['infantry', 'infantry', 'infantry'],    // ilość zamiast jakości
  hegemon:      ['infantry', 'mech', 'mech'],            // ciężkozbrojny
  trader:       ['infantry', 'garrison'],                // defensywny
  isolationist: ['garrison', 'infantry'],                // preferuje obronę
};
