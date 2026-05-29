// EmpireArchetypeExpansionist — archetyp imperium AI typu "Ekspansjonista"
//
// Slice 3.1a: drugi archetyp obcych imperiów. Na TYM etapie to KLON Industrialist
// (zachowanie IDENTYCZNE) — różnice tożsamości (id/nazwy/kolor/opis), nie behawioru.
// Właściwa różnica przychodzi później:
//   - S3.1b: kolonizacja cross-system + limit 1-2 układów (tweaki strategicColonization)
//   - S3.2:  priorytet badania napędu warp (wymaga modelu badania AI — dziś brak)
//
// Deep clone (structuredClone) zamiast spreadu: nested obiekty (personality,
// strategicColonization, startingBuildings…) są NIEZALEŻNE od INDUSTRIALIST, więc
// przyszłe tweaki S3.1b/S3.2 nie zmutują archetypu Industrialist (forward-safe).
//
// Plik powiązany: src/data/EmpireData.js rejestruje EXPANSIONIST w ARCHETYPES
// pod kluczem 'expansionist' (re-export — EmpireRegistry.createEmpire znajdzie
// arch.personality / arch.namePL po stringu archetype id).

import { INDUSTRIALIST } from './EmpireArchetypeIndustrialist.js';

export const EXPANSIONIST = {
  // Deep clone wszystkich pól behawioralnych Industrialist (S3.1a = klon 1:1).
  ...structuredClone(INDUSTRIALIST),

  // Nadpisanie TOŻSAMOŚCI (jedyne różnice w S3.1a).
  id:     'expansionist',
  namePL: 'Ekspansjonista',
  nameEN: 'Expansionist',
  descPL: 'Cywilizacja parta ku gwiazdom. Dąży do rozwoju napędu warp i ' +
          'kolonizacji innych układów słonecznych.',
  descEN: 'Civilization driven toward the stars. Seeks warp drive and ' +
          'colonization of other star systems.',
  color:  '#2E9B8F',  // teal — odróżnialny od Industrialist (#B07020 amber)
};
