// Centralna paleta kolorów dla projektu KOSMOS
// Styl: pixel art, pastelowy, klimat sci-fi
// Zawsze używaj tych kolorów — nie definiuj kolorów w innych plikach

export const ColorPalette = {

  // Kolory tła
  background: {
    deep:   '#0a0a1a',  // główne tło kosmosu (prawie czarne z odcieniem niebieskiego)
    nebula: '#0f0f2a',  // lekka mgławica (troszkę jaśniejszy)
  },

  // Interfejs użytkownika
  ui: {
    text:        '#c8e8ff',  // główny tekst (zimny błękit)
    textDim:     '#6888aa',  // tekst pomocniczy, etykiety
    accent:      '#88ffcc',  // akcent (cyjanowo-miętowy)
    warning:     '#ffcc88',  // ostrzeżenie (złoto)
    danger:      '#ff8888',  // niebezpieczeństwo (koralowy)
    panel:       '#111828',  // tło paneli UI
    panelBorder: '#2a4060',  // obramowanie paneli
  },

  // Kolory orbit (jako liczby hex dla Phaser Graphics)
  orbit: {
    default:   0x2a3a5a,  // standardowa orbita — subtelny granat
    habitable: 0x1a3a1a,  // strefa Goldilocksa — ciemna zieleń
    selected:  0x4488cc,  // zaznaczona orbita — niebieski
    unstable:  0x662222,  // niestabilna orbita — ciemna czerwień
    life:      0x226622,  // planeta z życiem — intensywna zieleń
  },

  // Kolory gwiazd wg typu spektralnego
  stars: {
    M: { main: 0xff6b47, glow: 0xff3311 },  // czerwony karzeł
    K: { main: 0xffaa55, glow: 0xff8822 },  // pomarańczowy karzeł
    G: { main: 0xfffacd, glow: 0xffee66 },  // żółty karzeł (jak Słońce)
    F: { main: 0xffffff, glow: 0xddddff },  // żółto-biały
  },

  // Kolory planet — pastelowa paleta sci-fi
  // Każda planety losuje z tej tablicy wg swojego indeksu
  planets: [
    { main: 0xa8d8ea, dark: 0x7ab0c8 },  // lodowy błękit
    { main: 0xb8e0a8, dark: 0x88c078 },  // pastelowa zieleń
    { main: 0xf0c8a0, dark: 0xd0a070 },  // pustynny pomarańcz
    { main: 0xd4a8d4, dark: 0xb080b0 },  // lawendowy fiolet
    { main: 0xa0c8d4, dark: 0x70a0b0 },  // pastelowy turkus
    { main: 0xe8d4a8, dark: 0xc8b080 },  // kremowy piasek
    { main: 0xc8a8e8, dark: 0xa080c8 },  // jasny fiolet
    { main: 0xe8a8b8, dark: 0xc88090 },  // pastelowy różowy
  ],

  // Konwersja #rrggbb string → liczba hex (dla Phaser)
  toInt(hexString) {
    return parseInt(hexString.replace('#', ''), 16);
  },

  // Pobierz kolor planety po indeksie (cyklicznie)
  getPlanetColor(index) {
    return this.planets[index % this.planets.length];
  },
};
