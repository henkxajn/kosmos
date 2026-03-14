// ThemeConfig — centralna definicja motywu kolorystycznego gry
//
// Mutowalny obiekt THEME z ~30 tokenami kolorów + 5 fontów.
// Canvas 2D czyta THEME co klatkę — zmiana wartości = natychmiastowy efekt.
// Persystencja: localStorage klucz 'kosmos_theme_v1'.

// ── Domyślny motyw (ciemny sci-fi) ──────────────────────────────

export const THEME = {
  // Powierzchnie
  bgPrimary:    '#020405',   // główne tło (canvas, sidebary)
  bgSecondary:  '#050b08',   // panele, nagłówki sekcji
  bgTertiary:   '#091210',   // nagłówki kolumn overlayów
  // Obramowania
  border:       'rgba(0,255,180,0.07)',   // linie separatorów
  borderLight:  'rgba(0,255,180,0.18)',   // hover krawędź
  borderActive: 'rgba(0,255,180,0.40)',   // aktywna zakładka / zaznaczony element
  // Tekst
  textPrimary:  '#aac8c0',   // główny tekst (wartości, nazwy)
  textSecondary:'rgba(160,200,190,0.65)', // drugorzędny tekst
  textLabel:    'rgba(160,200,190,0.45)', // etykiety, ikony nieaktywne
  textDim:      'rgba(160,200,190,0.45)', // etykiety, ikony nieaktywne
  textHeader:   '#00ffb4',   // nagłówki sekcji (accent)
  // Akcenty
  accent:       '#00ffb4',   // aktywne elementy, podświetlenia
  accentDim:    'rgba(0,255,180,0.07)',   // tło hover
  accentMed:    'rgba(0,255,180,0.13)',   // tło aktywne (zaznaczony wiersz)
  // Statusy
  success:      '#00ee88',   // wartości pozytywne, POP, wzrost
  successDim:   '#00cc66',   // pozytywne (przyciemnione)
  danger:       '#ff3344',   // wartości ujemne, alerty, głód
  dangerDim:    '#cc2233',   // błędy (przyciemnione)
  warning:      '#ffcc44',   // pasek stabilności, niski zasób
  yellow:       '#ffcc44',   // info/zdarzenia
  info:         '#00ccff',   // informacje neutralne
  purple:       '#aa88ff',   // badania / technologia
  mint:         '#00ee88',   // pozytywne alt
  // Mapa kosmiczna
  orbitLine:    'rgba(0,255,180,0.055)',  // orbity planet (nieaktywne)
  orbitColony:  'rgba(0,255,180,0.16)',   // orbita z kolonią
  starfield:    '#b0f0e0',   // kolor gwiazd w tle
  vignetteEnd:  'rgba(2,4,5,0.88)',       // ciemna winietka na krawędziach
  // Fonty
  fontFamily:   "'Space Mono', monospace",
  fontSizeTiny:   8,
  fontSizeSmall:  9,
  fontSizeNormal: 11,
  fontSizeMedium: 13,
  fontSizeLarge:  16,
  fontSizeTitle:  16,
  // Efekty CRT (terminal)
  crtEnabled:     false,      // master toggle — włącza scanlines/vignette/sweep
  crtScanlines:   true,       // paski skanowania
  crtVignette:    true,       // ciemne krawędzie
  crtSweep:       true,       // animowana linia przesuwająca się w dół
  crtSweepColor:  '#ffaa40',  // kolor linii sweep
  crtGlow:        0,          // intensywność poświaty tekstu (0 = wyłączone)
};

// ── Zamrożona kopia domyślnych wartości ──────────────────────────

export const DEFAULT_THEME = Object.freeze({ ...THEME });

// ── Presety motywów ─────────────────────────────────────────────

export const PRESET_THEMES = {
  default: { ...DEFAULT_THEME },

  cyberpunk: {
    bgPrimary:    '#0a0014',
    bgSecondary:  '#140028',
    bgTertiary:   '#1a0030',
    border:       '#3a1060',
    borderLight:  '#5a2080',
    borderActive: '#8040b0',
    textPrimary:  '#eeccff',
    textSecondary:'#8866aa',
    textLabel:    '#4a2870',
    textDim:      '#5a3880',
    textHeader:   '#6040a0',
    accent:       '#ff00ff',
    success:      '#00ff88',
    successDim:   '#00cc66',
    danger:       '#ff2244',
    dangerDim:    '#cc1133',
    warning:      '#ff8800',
    yellow:       '#ffcc00',
    info:         '#8844ff',
    purple:       '#ff44ff',
    mint:         '#00ffaa',
    fontFamily:   'monospace',
    fontSizeSmall:  9,
    fontSizeNormal: 10,
    fontSizeMedium: 12,
    fontSizeLarge:  13,
    fontSizeTitle:  15,
  },

  arctic: {
    bgPrimary:    '#040e18',
    bgSecondary:  '#081828',
    bgTertiary:   '#0c2030',
    border:       '#1a4060',
    borderLight:  '#2a6080',
    borderActive: '#4080a0',
    textPrimary:  '#d8f0ff',
    textSecondary:'#6898bb',
    textLabel:    '#2a5070',
    textDim:      '#3a6888',
    textHeader:   '#3080a0',
    accent:       '#88ddff',
    success:      '#44ddaa',
    successDim:   '#33bb88',
    danger:       '#ff5566',
    dangerDim:    '#cc3344',
    warning:      '#ffbb66',
    yellow:       '#ffdd88',
    info:         '#44aaff',
    purple:       '#aa88ff',
    mint:         '#44ffcc',
    fontFamily:   'monospace',
    fontSizeSmall:  9,
    fontSizeNormal: 10,
    fontSizeMedium: 12,
    fontSizeLarge:  13,
    fontSizeTitle:  15,
  },

  amber: {
    bgPrimary:    '#0e0a04',
    bgSecondary:  '#1a1208',
    bgTertiary:   '#201810',
    border:       '#3a2810',
    borderLight:  '#5a4020',
    borderActive: '#806030',
    textPrimary:  '#ffe8c8',
    textSecondary:'#aa8866',
    textLabel:    '#604830',
    textDim:      '#705838',
    textHeader:   '#806040',
    accent:       '#ffcc44',
    success:      '#88cc44',
    successDim:   '#66aa33',
    danger:       '#ff4422',
    dangerDim:    '#cc3311',
    warning:      '#ff8844',
    yellow:       '#ffdd44',
    info:         '#cc8844',
    purple:       '#cc8866',
    mint:         '#aacc44',
    fontFamily:   'monospace',
    fontSizeSmall:  9,
    fontSizeNormal: 10,
    fontSizeMedium: 12,
    fontSizeLarge:  13,
    fontSizeTitle:  15,
  },

  // ── Nowe presety ───────────────────────────────────────────────

  emerald: {
    bgPrimary:    '#040e08',
    bgSecondary:  '#081a10',
    bgTertiary:   '#0c2418',
    border:       '#1a4030',
    borderLight:  '#2a6048',
    borderActive: '#40906a',
    textPrimary:  '#c8ffe8',
    textSecondary:'#68aa88',
    textLabel:    '#2a5040',
    textDim:      '#3a6858',
    textHeader:   '#308060',
    accent:       '#44ffaa',
    success:      '#44ff88',
    successDim:   '#33cc66',
    danger:       '#ff5544',
    dangerDim:    '#cc3322',
    warning:      '#ffcc44',
    yellow:       '#ffdd66',
    info:         '#44ccaa',
    purple:       '#88ccaa',
    mint:         '#66ffcc',
    fontFamily:   'monospace',
    fontSizeSmall:  9,
    fontSizeNormal: 10,
    fontSizeMedium: 12,
    fontSizeLarge:  13,
    fontSizeTitle:  15,
  },

  crimson: {
    bgPrimary:    '#0e0406',
    bgSecondary:  '#1a080c',
    bgTertiary:   '#240c12',
    border:       '#401a24',
    borderLight:  '#602a38',
    borderActive: '#904050',
    textPrimary:  '#ffc8d0',
    textSecondary:'#aa6878',
    textLabel:    '#502a38',
    textDim:      '#683848',
    textHeader:   '#803050',
    accent:       '#ff4466',
    success:      '#88ff44',
    successDim:   '#66cc33',
    danger:       '#ff2244',
    dangerDim:    '#cc1133',
    warning:      '#ffaa44',
    yellow:       '#ffcc66',
    info:         '#ff6688',
    purple:       '#ff88aa',
    mint:         '#44ffaa',
    fontFamily:   'monospace',
    fontSizeSmall:  9,
    fontSizeNormal: 10,
    fontSizeMedium: 12,
    fontSizeLarge:  13,
    fontSizeTitle:  15,
  },

  midnight: {
    bgPrimary:    '#020208',
    bgSecondary:  '#060614',
    bgTertiary:   '#0a0a1c',
    border:       '#1a1a40',
    borderLight:  '#2a2a60',
    borderActive: '#4040a0',
    textPrimary:  '#c8c8ff',
    textSecondary:'#6868aa',
    textLabel:    '#2a2a60',
    textDim:      '#383878',
    textHeader:   '#4040a0',
    accent:       '#8888ff',
    success:      '#44ff88',
    successDim:   '#33cc66',
    danger:       '#ff4444',
    dangerDim:    '#cc2222',
    warning:      '#ffaa66',
    yellow:       '#ffcc88',
    info:         '#6666ff',
    purple:       '#aa88ff',
    mint:         '#44ffcc',
    fontFamily:   'monospace',
    fontSizeSmall:  9,
    fontSizeNormal: 10,
    fontSizeMedium: 12,
    fontSizeLarge:  13,
    fontSizeTitle:  15,
  },

  kosmos: {
    bgPrimary:    '#080604',   // ciemne ciepłe tło (dopasowane do TitleScene #030208)
    bgSecondary:  '#100c08',   // tło modali
    bgTertiary:   '#181210',   // tło przycisków
    border:       '#2a2015',   // ciepły brąz (z TitleScene rgba(200,175,140,0.08))
    borderLight:  '#483820',   // jaśniejsza ramka
    borderActive: '#6a5030',   // aktywna (z TitleScene rgba(255,220,160,0.2))
    textPrimary:  '#ffe8cc',   // ciepły krem (z TitleScene rgba(255,245,230))
    textSecondary:'#c8af8c',   // ciepły tan (z TitleScene rgba(200,175,140))
    textLabel:    '#4a3828',   // labele
    textDim:      '#5a4830',   // przygaszony (z TitleScene footer rgba(180,160,130))
    textHeader:   '#6a5438',   // nagłówki sekcji
    accent:       '#ffc878',   // złoty blask (z TitleScene sun glow rgba(255,200,120))
    success:      '#88cc44',   // ciepły zielony
    successDim:   '#66aa33',   // ciepły zielony (dim)
    danger:       '#ff4422',   // czerwony
    dangerDim:    '#cc3311',   // czerwony (dim)
    warning:      '#ff9944',   // ciepły pomarańcz
    yellow:       '#ffcc44',   // złoty (z TitleScene divider rgba(220,180,130))
    info:         '#ddaa44',   // ciepłe info
    purple:       '#ccaa77',   // ciepły muted
    mint:         '#aacc55',   // ciepły zielony alt
    fontFamily:   'monospace',
    fontSizeSmall:  9,
    fontSizeNormal: 10,
    fontSizeMedium: 12,
    fontSizeLarge:  13,
    fontSizeTitle:  15,
  },

  solar: {
    bgPrimary:    '#0a0804',
    bgSecondary:  '#141008',
    bgTertiary:   '#1c180c',
    border:       '#3a3010',
    borderLight:  '#5a4820',
    borderActive: '#8a7030',
    textPrimary:  '#fff0d0',
    textSecondary:'#aa9060',
    textLabel:    '#604828',
    textDim:      '#706038',
    textHeader:   '#907040',
    accent:       '#ffaa22',
    success:      '#aacc44',
    successDim:   '#88aa33',
    danger:       '#ff4422',
    dangerDim:    '#cc3311',
    warning:      '#ff8844',
    yellow:       '#ffcc22',
    info:         '#ddaa44',
    purple:       '#ccaa66',
    mint:         '#aadd44',
    fontFamily:   'monospace',
    fontSizeSmall:  9,
    fontSizeNormal: 10,
    fontSizeMedium: 12,
    fontSizeLarge:  13,
    fontSizeTitle:  15,
  },

  // ── Presety terminalowe (CRT) ───────────────────────────────

  terminal_amber: {
    bgPrimary:    '#0c0900',
    bgSecondary:  '#151006',
    bgTertiary:   '#1e180a',
    border:       '#5a3a18',
    borderLight:  '#7a5228',
    borderActive: '#cc8030',
    textPrimary:  '#ffe4a8',
    textSecondary:'#cc9955',
    textLabel:    '#996e38',
    textDim:      '#885e30',
    textHeader:   '#ffaa40',
    accent:       '#ffbb55',
    accentDim:    'rgba(255,170,64,0.12)',
    accentMed:    'rgba(255,170,64,0.22)',
    success:      '#66cc22',
    successDim:   '#44aa00',
    danger:       '#ff4422',
    dangerDim:    '#cc2200',
    warning:      '#ee7722',
    yellow:       '#ffbb44',
    info:         '#dd8833',
    purple:       '#ddaa55',
    mint:         '#99dd44',
    fontFamily:   "'VT323', monospace",
    fontSizeTiny:   10,
    fontSizeSmall:  12,
    fontSizeNormal: 14,
    fontSizeMedium: 16,
    fontSizeLarge:  20,
    fontSizeTitle:  20,
    crtEnabled:     true,
    crtSweepColor:  '#ffaa40',
    crtGlow:        8,
  },

  terminal_red: {
    bgPrimary:    '#0c0300',
    bgSecondary:  '#150800',
    bgTertiary:   '#1e0c02',
    border:       '#5a2218',
    borderLight:  '#7a3528',
    borderActive: '#cc4422',
    textPrimary:  '#ffbbaa',
    textSecondary:'#dd7755',
    textLabel:    '#aa5538',
    textDim:      '#994830',
    textHeader:   '#ff5533',
    accent:       '#ff5533',
    accentDim:    'rgba(255,68,0,0.12)',
    accentMed:    'rgba(255,68,0,0.22)',
    success:      '#66cc22',
    successDim:   '#44aa00',
    danger:       '#ff4400',
    dangerDim:    '#cc3300',
    warning:      '#ff7733',
    yellow:       '#ff9944',
    info:         '#ee6633',
    purple:       '#dd6644',
    mint:         '#ff7755',
    fontFamily:   "'VT323', monospace",
    fontSizeTiny:   10,
    fontSizeSmall:  12,
    fontSizeNormal: 14,
    fontSizeMedium: 16,
    fontSizeLarge:  20,
    fontSizeTitle:  20,
    crtEnabled:     true,
    crtSweepColor:  '#ff4400',
    crtGlow:        8,
  },

  terminal_green: {
    bgPrimary:    '#030a00',
    bgSecondary:  '#081404',
    bgTertiary:   '#0e1e08',
    border:       '#2a5518',
    borderLight:  '#3a7528',
    borderActive: '#55bb33',
    textPrimary:  '#ddffaa',
    textSecondary:'#88cc55',
    textLabel:    '#5a9933',
    textDim:      '#4a8828',
    textHeader:   '#77ee33',
    accent:       '#88ff44',
    accentDim:    'rgba(136,255,68,0.12)',
    accentMed:    'rgba(136,255,68,0.22)',
    success:      '#88ff44',
    successDim:   '#66dd33',
    danger:       '#ff4422',
    dangerDim:    '#cc3300',
    warning:      '#bbdd22',
    yellow:       '#99ff44',
    info:         '#55dd22',
    purple:       '#77bb55',
    mint:         '#88ff44',
    fontFamily:   "'VT323', monospace",
    fontSizeTiny:   10,
    fontSizeSmall:  12,
    fontSizeNormal: 14,
    fontSizeMedium: 16,
    fontSizeLarge:  20,
    fontSizeTitle:  20,
    crtEnabled:     true,
    crtSweepColor:  '#88ff44',
    crtGlow:        8,
  },

  terminal_gold: {
    bgPrimary:    '#0c0a00',
    bgSecondary:  '#151204',
    bgTertiary:   '#1e1a08',
    border:       '#5a4818',
    borderLight:  '#7a6828',
    borderActive: '#ccaa22',
    textPrimary:  '#fff8cc',
    textSecondary:'#ccaa44',
    textLabel:    '#aa8830',
    textDim:      '#997728',
    textHeader:   '#ffcc22',
    accent:       '#ffe060',
    accentDim:    'rgba(255,224,96,0.12)',
    accentMed:    'rgba(255,224,96,0.22)',
    success:      '#88ff44',
    successDim:   '#66dd33',
    danger:       '#ff4422',
    dangerDim:    '#cc3300',
    warning:      '#ffcc00',
    yellow:       '#ffe060',
    info:         '#ddaa22',
    purple:       '#ddbb55',
    mint:         '#bbdd44',
    fontFamily:   "'VT323', monospace",
    fontSizeTiny:   10,
    fontSizeSmall:  12,
    fontSizeNormal: 14,
    fontSizeMedium: 16,
    fontSizeLarge:  20,
    fontSizeTitle:  20,
    crtEnabled:     true,
    crtSweepColor:  '#ffd700',
    crtGlow:        8,
  },
  // ── Ambient — eleganckie, filmowe, bez CRT ─────────────────────

  ambient_1: {  // Amber Noir — ciepłe złoto, kinowy noir
    bgPrimary:    '#060504',
    bgSecondary:  '#0e0b07',
    bgTertiary:   '#14100c',
    border:       'rgba(196,152,48,0.10)',
    borderLight:  'rgba(196,152,48,0.22)',
    borderActive: 'rgba(196,152,48,0.45)',
    textPrimary:  '#ffe8c0',
    textSecondary:'rgba(255,232,192,0.55)',
    textLabel:    'rgba(196,152,48,0.40)',
    textDim:      'rgba(196,152,48,0.32)',
    textHeader:   '#c49830',
    accent:       '#c49830',
    accentDim:    'rgba(196,152,48,0.08)',
    accentMed:    'rgba(196,152,48,0.15)',
    success:      '#88bb44',
    successDim:   '#66993d',
    danger:       '#cc4433',
    dangerDim:    '#aa3322',
    warning:      '#dd8833',
    yellow:       '#ddaa44',
    info:         '#c49830',
    purple:       '#b8945a',
    mint:         '#99aa44',
    orbitLine:    'rgba(196,152,48,0.06)',
    orbitColony:  'rgba(196,152,48,0.20)',
    starfield:    '#ffe8c0',
    vignetteEnd:  'rgba(6,5,4,0.90)',
    fontFamily:   "'Share Tech Mono', monospace",
    crtEnabled:   false,
    crtGlow:      0,
  },

  ambient_2: {  // Cold Blue — chłodna stal, kosmiczny błękit
    bgPrimary:    '#040608',
    bgSecondary:  '#070c14',
    bgTertiary:   '#0c1420',
    border:       'rgba(64,144,192,0.10)',
    borderLight:  'rgba(64,144,192,0.22)',
    borderActive: 'rgba(64,144,192,0.45)',
    textPrimary:  '#d8f0ff',
    textSecondary:'rgba(216,240,255,0.55)',
    textLabel:    'rgba(64,144,192,0.40)',
    textDim:      'rgba(64,144,192,0.32)',
    textHeader:   '#4090c0',
    accent:       '#4090c0',
    accentDim:    'rgba(64,144,192,0.08)',
    accentMed:    'rgba(64,144,192,0.15)',
    success:      '#44bb88',
    successDim:   '#339966',
    danger:       '#cc4455',
    dangerDim:    '#aa3344',
    warning:      '#ddaa55',
    yellow:       '#ddcc66',
    info:         '#4090c0',
    purple:       '#8888cc',
    mint:         '#44bbaa',
    orbitLine:    'rgba(64,144,192,0.06)',
    orbitColony:  'rgba(64,144,192,0.20)',
    starfield:    '#d8f0ff',
    vignetteEnd:  'rgba(4,6,8,0.90)',
    fontFamily:   "'Share Tech Mono', monospace",
    crtEnabled:   false,
    crtGlow:      0,
  },

  ambient_3: {  // Galactic Violet — głęboki fiolet, mgławica
    bgPrimary:    '#060408',
    bgSecondary:  '#0c0812',
    bgTertiary:   '#14101c',
    border:       'rgba(160,96,192,0.10)',
    borderLight:  'rgba(160,96,192,0.22)',
    borderActive: 'rgba(160,96,192,0.45)',
    textPrimary:  '#f0d0ff',
    textSecondary:'rgba(240,208,255,0.55)',
    textLabel:    'rgba(160,96,192,0.40)',
    textDim:      'rgba(160,96,192,0.32)',
    textHeader:   '#a060c0',
    accent:       '#a060c0',
    accentDim:    'rgba(160,96,192,0.08)',
    accentMed:    'rgba(160,96,192,0.15)',
    success:      '#66bb77',
    successDim:   '#449955',
    danger:       '#cc4455',
    dangerDim:    '#aa2244',
    warning:      '#cc9955',
    yellow:       '#ccaa66',
    info:         '#7766cc',
    purple:       '#bb88dd',
    mint:         '#66bbaa',
    orbitLine:    'rgba(160,96,192,0.06)',
    orbitColony:  'rgba(160,96,192,0.20)',
    starfield:    '#f0d0ff',
    vignetteEnd:  'rgba(6,4,8,0.90)',
    fontFamily:   "'Share Tech Mono', monospace",
    crtEnabled:   false,
    crtGlow:      0,
  },

  ambient_4: {  // Biopunk Green — organiczny, cichy zieleń
    bgPrimary:    '#040604',
    bgSecondary:  '#070e07',
    bgTertiary:   '#0c140c',
    border:       'rgba(80,160,96,0.10)',
    borderLight:  'rgba(80,160,96,0.22)',
    borderActive: 'rgba(80,160,96,0.45)',
    textPrimary:  '#d0ffe0',
    textSecondary:'rgba(208,255,224,0.55)',
    textLabel:    'rgba(80,160,96,0.40)',
    textDim:      'rgba(80,160,96,0.32)',
    textHeader:   '#50a060',
    accent:       '#50a060',
    accentDim:    'rgba(80,160,96,0.08)',
    accentMed:    'rgba(80,160,96,0.15)',
    success:      '#44cc66',
    successDim:   '#33aa55',
    danger:       '#cc5544',
    dangerDim:    '#aa3322',
    warning:      '#ccaa44',
    yellow:       '#ccbb55',
    info:         '#44aa88',
    purple:       '#77aa88',
    mint:         '#55cc99',
    orbitLine:    'rgba(80,160,96,0.06)',
    orbitColony:  'rgba(80,160,96,0.20)',
    starfield:    '#d0ffe0',
    vignetteEnd:  'rgba(4,6,4,0.90)',
    fontFamily:   "'Share Tech Mono', monospace",
    crtEnabled:   false,
    crtGlow:      0,
  },

  // ── Presety ekranu startowego (4 warianty kolorystyczne) ──────

  ss_amber_noir: {
    bgPrimary:    '#060504',
    bgSecondary:  '#100c08',
    bgTertiary:   '#181210',
    border:       'rgba(196,152,48,0.09)',
    borderLight:  'rgba(196,152,48,0.19)',
    borderActive: '#c49830',
    textPrimary:  '#ffe8c0',
    textSecondary:'rgba(196,152,48,0.67)',
    textLabel:    'rgba(196,152,48,0.38)',
    textDim:      'rgba(196,152,48,0.31)',
    textHeader:   '#c49830',
    accent:       '#c49830',
    accentDim:    'rgba(196,152,48,0.07)',
    accentMed:    'rgba(196,152,48,0.13)',
    success:      '#88cc44',
    successDim:   '#66aa33',
    danger:       '#ff4422',
    dangerDim:    '#cc3311',
    warning:      '#ff9944',
    yellow:       '#ffcc44',
    info:         '#ddaa44',
    purple:       '#ccaa77',
    mint:         '#aacc55',
    orbitLine:    'rgba(196,152,48,0.06)',
    orbitColony:  'rgba(196,152,48,0.19)',
    starfield:    '#ffe8c0',
    vignetteEnd:  'rgba(6,5,4,0.88)',
    fontFamily:   "'Share Tech Mono', monospace",
    crtEnabled:   true,
    crtSweepColor:'#c49830',
    crtGlow:      4,
  },

  ss_cold_blue: {
    bgPrimary:    '#040608',
    bgSecondary:  '#081020',
    bgTertiary:   '#0c1828',
    border:       'rgba(64,144,192,0.09)',
    borderLight:  'rgba(64,144,192,0.19)',
    borderActive: '#4090c0',
    textPrimary:  '#d8f0ff',
    textSecondary:'rgba(64,144,192,0.67)',
    textLabel:    'rgba(64,144,192,0.38)',
    textDim:      'rgba(64,144,192,0.31)',
    textHeader:   '#4090c0',
    accent:       '#4090c0',
    accentDim:    'rgba(64,144,192,0.07)',
    accentMed:    'rgba(64,144,192,0.13)',
    success:      '#44ddaa',
    successDim:   '#33bb88',
    danger:       '#ff5566',
    dangerDim:    '#cc3344',
    warning:      '#ffbb66',
    yellow:       '#ffdd88',
    info:         '#44aaff',
    purple:       '#aa88ff',
    mint:         '#44ffcc',
    orbitLine:    'rgba(64,144,192,0.06)',
    orbitColony:  'rgba(64,144,192,0.19)',
    starfield:    '#d8f0ff',
    vignetteEnd:  'rgba(4,6,8,0.88)',
    fontFamily:   "'Share Tech Mono', monospace",
    crtEnabled:   true,
    crtSweepColor:'#4090c0',
    crtGlow:      4,
  },

  ss_galactic_violet: {
    bgPrimary:    '#060408',
    bgSecondary:  '#100820',
    bgTertiary:   '#180c28',
    border:       'rgba(160,96,192,0.09)',
    borderLight:  'rgba(160,96,192,0.19)',
    borderActive: '#a060c0',
    textPrimary:  '#f0d0ff',
    textSecondary:'rgba(160,96,192,0.67)',
    textLabel:    'rgba(160,96,192,0.38)',
    textDim:      'rgba(160,96,192,0.31)',
    textHeader:   '#a060c0',
    accent:       '#a060c0',
    accentDim:    'rgba(160,96,192,0.07)',
    accentMed:    'rgba(160,96,192,0.13)',
    success:      '#66dd88',
    successDim:   '#44bb66',
    danger:       '#ff4466',
    dangerDim:    '#cc2244',
    warning:      '#ffaa66',
    yellow:       '#ffcc88',
    info:         '#8866ff',
    purple:       '#cc88ff',
    mint:         '#66ddaa',
    orbitLine:    'rgba(160,96,192,0.06)',
    orbitColony:  'rgba(160,96,192,0.19)',
    starfield:    '#f0d0ff',
    vignetteEnd:  'rgba(6,4,8,0.88)',
    fontFamily:   "'Share Tech Mono', monospace",
    crtEnabled:   true,
    crtSweepColor:'#a060c0',
    crtGlow:      4,
  },

  ss_biopunk_green: {
    bgPrimary:    '#040604',
    bgSecondary:  '#081008',
    bgTertiary:   '#0c180c',
    border:       'rgba(80,160,96,0.09)',
    borderLight:  'rgba(80,160,96,0.19)',
    borderActive: '#50a060',
    textPrimary:  '#d0ffe0',
    textSecondary:'rgba(80,160,96,0.67)',
    textLabel:    'rgba(80,160,96,0.38)',
    textDim:      'rgba(80,160,96,0.31)',
    textHeader:   '#50a060',
    accent:       '#50a060',
    accentDim:    'rgba(80,160,96,0.07)',
    accentMed:    'rgba(80,160,96,0.13)',
    success:      '#44ff88',
    successDim:   '#33cc66',
    danger:       '#ff5544',
    dangerDim:    '#cc3322',
    warning:      '#ffcc44',
    yellow:       '#ffdd66',
    info:         '#44ccaa',
    purple:       '#88ccaa',
    mint:         '#66ffcc',
    orbitLine:    'rgba(80,160,96,0.06)',
    orbitColony:  'rgba(80,160,96,0.19)',
    starfield:    '#d0ffe0',
    vignetteEnd:  'rgba(4,6,4,0.88)',
    fontFamily:   "'Share Tech Mono', monospace",
    crtEnabled:   true,
    crtSweepColor:'#50a060',
    crtGlow:      4,
  },
};

// ── Pomocnicze: hex → RGB ───────────────────────────────────────

export function hexToRgb(color) {
  if (!color) return { r: 0, g: 0, b: 0 };
  // Obsługa rgba(r,g,b,a) i rgb(r,g,b)
  const rgbaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbaMatch) {
    return { r: +rgbaMatch[1], g: +rgbaMatch[2], b: +rgbaMatch[3] };
  }
  // Obsługa hex (#rrggbb)
  const h = color.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

// ── bgAlpha — tło panelu z dowolną przezroczystością ────────────

export function bgAlpha(alpha) {
  const { r, g, b } = hexToRgb(THEME.bgPrimary);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── CRT overlay callback (ustawiana przez CrtOverlay.init()) ────

let _crtUpdateFn = null;
export function setCrtUpdateCallback(fn) { _crtUpdateFn = fn; }

// ── Aplikowanie motywu ──────────────────────────────────────────

export function applyTheme(partial) {
  for (const key of Object.keys(partial)) {
    if (key in THEME) {
      THEME[key] = partial[key];
    }
  }
  // Synchronizuj CRT overlay z aktualnym stanem THEME
  if (_crtUpdateFn) _crtUpdateFn();
}

// Pełne zastosowanie presetu — reset do domyślnych, potem nadpisanie.
// Gwarantuje, że tokeny nieobecne w presecie wracają do defaults
// (np. CRT tokeny znikają przy przejściu terminal → klasyczny).
export function applyPreset(preset) {
  for (const key of Object.keys(DEFAULT_THEME)) {
    THEME[key] = DEFAULT_THEME[key];
  }
  for (const key of Object.keys(preset)) {
    if (key in THEME) {
      THEME[key] = preset[key];
    }
  }
  if (_crtUpdateFn) _crtUpdateFn();
}

// ── Persystencja localStorage ───────────────────────────────────

const STORAGE_KEY = 'kosmos_theme_v1';

export function saveTheme() {
  try {
    const data = {};
    for (const key of Object.keys(DEFAULT_THEME)) {
      if (THEME[key] !== DEFAULT_THEME[key]) {
        data[key] = THEME[key];
      }
    }
    // Zapisuj tylko różnice od domyślnych
    if (Object.keys(data).length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    // localStorage niedostępne — cicho ignoruj
  }
}

export function loadTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      applyTheme(data);
    }
  } catch (e) {
    // Uszkodzone dane — użyj domyślnych
  }
}

export function resetTheme() {
  applyTheme(DEFAULT_THEME);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // cicho ignoruj
  }
}
