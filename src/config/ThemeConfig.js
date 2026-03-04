// ThemeConfig — centralna definicja motywu kolorystycznego gry
//
// Mutowalny obiekt THEME z ~30 tokenami kolorów + 5 fontów.
// Canvas 2D czyta THEME co klatkę — zmiana wartości = natychmiastowy efekt.
// Persystencja: localStorage klucz 'kosmos_theme_v1'.

// ── Domyślny motyw (ciemny sci-fi) ──────────────────────────────

export const THEME = {
  // Powierzchnie
  bgPrimary:    '#060d18',   // główne tło paneli
  bgSecondary:  '#0a1628',   // tło modali/inputów
  bgTertiary:   '#0d1520',   // tło przycisków
  // Obramowania
  border:       '#1a3050',   // główna ramka
  borderLight:  '#2a4060',   // jaśniejsza ramka (labele)
  borderActive: '#3a6090',   // aktywna/focused
  // Tekst
  textPrimary:  '#c8e8ff',   // jasny tekst
  textSecondary:'#6888aa',   // zwykły tekst
  textLabel:    '#2a4060',   // labele, disabled
  textDim:      '#3a5a7a',   // przygaszony tekst
  textHeader:   '#2a6080',   // nagłówki sekcji
  // Akcenty
  accent:       '#88ffcc',   // tytuły, wyróżnienia
  // Statusy
  success:      '#44ff88',   // pozytywne
  successDim:   '#44cc66',   // pozytywne (przyciemnione)
  danger:       '#ff4444',   // błędy/krytyczne
  dangerDim:    '#cc4422',   // błędy (przyciemnione)
  warning:      '#ffaa44',   // ostrzeżenia
  yellow:       '#ffcc44',   // info/zdarzenia
  info:         '#4488ff',   // info akcent
  purple:       '#cc88ff',   // specjalne
  mint:         '#44ffaa',   // pozytywne alt
  // Fonty
  fontFamily:   'monospace',
  fontSizeSmall:  9,
  fontSizeNormal: 10,
  fontSizeMedium: 12,
  fontSizeLarge:  13,
  fontSizeTitle:  15,
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
};

// ── Pomocnicze: hex → RGB ───────────────────────────────────────

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
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

// ── Aplikowanie motywu ──────────────────────────────────────────

export function applyTheme(partial) {
  for (const key of Object.keys(partial)) {
    if (key in THEME) {
      THEME[key] = partial[key];
    }
  }
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
