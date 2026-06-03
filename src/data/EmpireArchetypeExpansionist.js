// EmpireArchetypeExpansionist — archetyp imperium AI typu "Ekspansjonista"
//
// Slice 3.1a: drugi archetyp obcych imperiów — KLON Industrialist (zachowanie
// identyczne, różnice tożsamości: id/nazwy/kolor/opis).
// Slice 3.1b: pierwsza RÓŻNICA BEHAWIORALNA — Ekspansjonista kolonizuje systemy
//   inne niż macierzysty (limit `maxExtraSystems=2`), Industrialist zostaje
//   jedno-systemowy (`maxExtraSystems=0`). Pozostałe pola doktryny pozostają
//   identyczne (parytet poza tym jednym kluczem).
//   S3.2 (TODO): priorytet badania napędu warp (wymaga modelu badania AI).
//
// Deep clone (structuredClone) zamiast spreadu: nested obiekty (personality,
// strategicColonization, startingBuildings…) są NIEZALEŻNE od INDUSTRIALIST, więc
// nadpisanie maxExtraSystems (i przyszłe tweaki S3.2) nie mutują Industrialist.
//
// Plik powiązany: src/data/EmpireData.js rejestruje EXPANSIONIST w ARCHETYPES
// pod kluczem 'expansionist'.

import { INDUSTRIALIST } from './EmpireArchetypeIndustrialist.js';

// Klon bazowy (niezależny od INDUSTRIALIST) + nadpisanie różnicy behawioralnej S3.1b.
const _base = structuredClone(INDUSTRIALIST);
_base.strategicColonization.maxExtraSystems = 2;  // S3.1b: 2 systemy poza macierzystym (Industrialist=0)

export const EXPANSIONIST = {
  // Deep clone pól behawioralnych Industrialist + maxExtraSystems=2 (już ustawione w _base).
  ..._base,

  // Nadpisanie TOŻSAMOŚCI.
  id:     'expansionist',
  namePL: 'Ekspansjonista',
  nameEN: 'Expansionist',
  descPL: 'Cywilizacja parta ku gwiazdom. Dąży do rozwoju napędu warp i ' +
          'kolonizacji innych układów słonecznych.',
  descEN: 'Civilization driven toward the stars. Seeks warp drive and ' +
          'colonization of other star systems.',
  color:  '#2E9B8F',  // teal — odróżnialny od Industrialist (#B07020 amber)

  // S3.2 S2 — NADPISANIE kolejki badań (inaczej klon odziedziczyłby kolejkę
  // Industrialisty z _base). Ścieżka warpowa: napęd jonowy → fizyka → fuzja → warp.
  //   Miękkie bramki warp_theory (requiresDiscovery + requiresInventory) POMINIĘTE —
  //   grantTechs je ignoruje; AI bada warp samym kosztem research (decyzja S3.2 S2,
  //   bo AI nie ma modelu odkryć/zapasów). Warp = cel cross-system Ekspansjonisty.
  //   Inserty (data_networks/efficient_solar/nuclear_power/plasma_physics) to prereqy
  //   spoza startingTechs. research_station dziedziczony z Industrialist.startingBuildings.
  researchQueue: [
    'ion_drives',            // Napędy Jonowe (req rocketry ✓)
    'data_networks',         // Sieci Danych (prereq quantum_physics; req basic_computing ✓)
    'efficient_solar',       // Wydajne Panele (prereq nuclear_power)
    'nuclear_power',         // Energetyka Jądrowa (prereq quantum_physics + fusion_power)
    'quantum_physics',       // Fizyka Kwantowa (req nuclear_power + data_networks)
    'plasma_physics',        // Fizyka Plazmy (prereq fusion_power)
    'fusion_power',          // Energia Fuzji (req nuclear_power + plasma_physics)
    'warp_theory',           // Teoria Osnowy (req ion_drives + quantum_physics; bramki pominięte)
    'warp_drive',            // Napęd Skokowy (req warp_theory)
    'warp_drive_mk2',        // Zaawansowany Napęd Skokowy (req warp_drive)
  ],
};
