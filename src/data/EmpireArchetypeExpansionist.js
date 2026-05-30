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
};
