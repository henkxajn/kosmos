// CasusBelliData — powody wojen (casus belli)
//
// Każda wojna ma jeden casus belli. Wpływa na:
//   exhaustionRate — jak szybko wojna wyczerpuje uczestników (mnożnik)
//   peaceCost      — minimalna cena pokoju (wymagany poziom exhaustion lub kapitulacja)
//   moralePenalty  — kara morale dla agresora (opinia społeczna)
//
// Używane przez:
//   WarSystem.declareWar({ casusBelli })
//   WarOverlay — wyświetlanie nazwy/opisu wojny

export const CASUS_BELLI = {
  border_incident: {
    id:           'border_incident',
    namePL:       'Incydent Graniczny',
    nameEN:       'Border Incident',
    descPL:       'Starcie w strefie spornej. Wojna lokalna, niska eskalacja.',
    descEN:       'Skirmish in disputed zone. Local war, low escalation.',
    exhaustionRate: 1.0,
    peaceCost:      30,   // obie strony muszą mieć exhaustion >= 30
    moralePenalty:  -2,
  },
  tech_theft: {
    id:           'tech_theft',
    namePL:       'Kradzież Technologii',
    nameEN:       'Technology Theft',
    descPL:       'Wojna odwetowa za kradzież badań. Celem: odzyskanie wiedzy.',
    descEN:       'Retaliatory war for stolen research. Goal: recover knowledge.',
    exhaustionRate: 0.8,
    peaceCost:      40,
    moralePenalty:  0,
  },
  ideology: {
    id:           'ideology',
    namePL:       'Konflikt Ideologiczny',
    nameEN:       'Ideological Conflict',
    descPL:       'Wojna światopoglądów. Długa, krwawa, trudna do zakończenia.',
    descEN:       'Clash of worldviews. Long, bloody, hard to end.',
    exhaustionRate: 0.6,
    peaceCost:      70,
    moralePenalty:  -5,
  },
  extermination: {
    id:           'extermination',
    namePL:       'Eksterminacja',
    nameEN:       'Extermination',
    descPL:       'Całkowita zagłada przeciwnika. Tylko archetyp Xenofag/Rój.',
    descEN:       'Total annihilation of the enemy. Xenophage/Swarm only.',
    exhaustionRate: 0.4,   // walczą aż do końca
    peaceCost:      100,   // praktycznie brak pokoju
    moralePenalty:  -10,
  },
  territorial_claim: {
    id:           'territorial_claim',
    namePL:       'Roszczenie Terytorialne',
    nameEN:       'Territorial Claim',
    descPL:       'Żądanie przejęcia konkretnego systemu lub planety.',
    descEN:       'Demand to seize a specific system or planet.',
    exhaustionRate: 1.2,   // krótkie wojny o cel
    peaceCost:      50,
    moralePenalty:  -3,
  },
};

export const CASUS_BELLI_IDS = Object.keys(CASUS_BELLI);

/** Dobierz casus belli odpowiadający aktywnym incydentom relacji. */
export function inferCasusBelli(relation, empireArchetype) {
  const incidents = relation?.lastIncidents ?? [];
  // Priorytet: eksterminacja dla xenofag/swarm
  if (empireArchetype === 'xenophage' || empireArchetype === 'swarm') return 'extermination';
  // Dużo territorial_violation → roszczenie
  const territorial = incidents.filter(i => i.type === 'territorial_violation').length;
  if (territorial >= 2) return 'territorial_claim';
  // Dużo surveillance_scan → tech_theft
  const surveillance = incidents.filter(i => i.type === 'surveillance_scan').length;
  if (surveillance >= 2) return 'tech_theft';
  // Domyślnie incydent graniczny
  return 'border_incident';
}
