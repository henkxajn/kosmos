// ShipsData — definicje statków kosmicznych
//
// Statki budowane są w Stoczni (shipyard) i trafiają do hangaru (fleet) kolonii.
// Wymagane do ekspedycji naukowych i kolonizacyjnych.
//
// Pola:
//   id:          unikalny klucz statku
//   namePL:      polska nazwa wyświetlana w UI
//   icon:        emoji ikona
//   cost:        { minerals, energy, ... } — koszt budowy w stoczni
//   buildTime:   czas budowy w latach gry
//   requires:    id technologii wymaganej do odblokowania
//   description: opis PL

export const SHIPS = {
  science_vessel: {
    id:          'science_vessel',
    namePL:      'Statek Naukowy',
    icon:        '🛸',
    cost:        { minerals: 250, energy: 150 },
    buildTime:   8,       // lat gry
    range:       20,      // AU — maksymalny zasięg misji
    requires:    'exploration',
    description: 'Orbitalny statek badawczy. Wymagany do ekspedycji naukowych.',
  },

  colony_ship: {
    id:          'colony_ship',
    namePL:      'Statek Kolonijny',
    icon:        '🚢',
    cost:        { minerals: 400, energy: 200, organics: 100 },
    buildTime:   12,      // lat gry
    range:       12,      // AU — krótszy zasięg, wymusza ekspansję krok po kroku
    requires:    'colonization',
    description: 'Transportuje kolonistów na nowe ciało. Zużywany przy wysłaniu.',
  },
};
