// Konfiguracja gry i stałe fizyczne projektu KOSMOS

export const GAME_CONFIG = {
  // Wymiary ekranu (piksele)
  WIDTH: 1280,
  HEIGHT: 720,

  // Skala: ile pikseli = 1 AU (jednostka astronomiczna = ~150 mln km)
  AU_TO_PX: 110,

  // Czas gry — mnożniki: ile lat gry na sekundę realną
  // 1/365.25 (1 dzień/s) | 1/12 (1 miesiąc/s) | 1 (1 rok/s) | 10 (10 lat/s) | 10000 (10 000 lat/s)
  TIME_MULTIPLIERS: [0, 1 / 365.25, 1 / 12, 1, 10, 10000],

  // Etykiety przycisków UI (indeks 1:1 z TIME_MULTIPLIERS)
  TIME_MULTIPLIER_LABELS: ['PAUZA', '1d/s', '1m/s', '1r/s', '10r/s', '10kr/s'],

  // Generacja układu planetarnego — liczba planet ustalana przez _rollPlanetCount() w SystemGenerator
  MIN_ORBIT_AU: 0.3,   // minimalna orbita od gwiazdy (AU)
  MAX_ORBIT_AU: 25.0,  // maksymalna orbita (AU) — zwiększone dla układów 9–11 planet

  // Dysk protoplanetarny
  DISK_MIN_PLANETESIMALS: 40,
  DISK_MAX_PLANETESIMALS: 60,
  DISK_MIN_AU: 0.1,
  DISK_MAX_AU: 12.0,

  // Tło
  BACKGROUND_COLOR: 0x0a0a1a,
  STAR_COUNT_BACKGROUND: 250,
};

// Typy gwiazd z parametrami fizycznymi
// masa: masy słoneczne | luminosity: jasności słoneczne | temperature: Kelwiny
export const STAR_TYPES = {
  M: {
    name: 'Czerwony karzeł',
    mass: 0.3,
    luminosity: 0.04,
    temperature: 3500,
    color: 0xff6b47,
    glowColor: 0xff3311,
    habitableZone: { min: 0.1, max: 0.4 },
    weight: 3,
  },
  K: {
    name: 'Pomarańczowy karzeł',
    mass: 0.7,
    luminosity: 0.4,
    temperature: 4500,
    color: 0xffaa55,
    glowColor: 0xff8822,
    habitableZone: { min: 0.5, max: 0.9 },
    weight: 2,
  },
  G: {
    name: 'Żółty karzeł (jak Słońce)',
    mass: 1.0,
    luminosity: 1.0,
    temperature: 5800,
    color: 0xfffacd,
    glowColor: 0xffee66,
    habitableZone: { min: 0.95, max: 1.4 },
    weight: 2,
  },
  F: {
    name: 'Żółto-biały karzeł',
    mass: 1.4,
    luminosity: 3.0,
    temperature: 7000,
    color: 0xffffff,
    glowColor: 0xddddff,
    habitableZone: { min: 1.5, max: 2.2 },
    weight: 1,
  },
};

// Konfiguracja typów planet — albedo, kolory, cechy wizualne
// albedo: współczynnik odbicia światła [0=czarne ciało, 1=pełne odbicie]
export const PLANET_TYPE_CONFIG = {
  hot_rocky: {
    albedo:        0.05,
    glowColor:     0xff5500,
    // lawa, rdzawa skała, ciemny bazalt, rozżarzona magma, soot
    colorVariants: [0xc84820, 0xd05028, 0xb83818, 0xe05830,
                    0xa83010, 0xd84018, 0x885040, 0xe87848, 0x786050],
    hasRings:      false,
    glowIntensity: 0.15,
  },
  rocky: {
    albedo:        0.15,
    glowColor:     null,
    colorVariants: null,         // kolor zależy od temperatury (getRockyColor)
    hasRings:      false,
    glowIntensity: 0,
  },
  gas: {
    albedo:        0.35,
    glowColor:     null,
    // beż/złoto (Jowisz), pomarańcz (Saturn), niebiesko-szary (Uran), różowawy, brązowy, kremowy
    colorVariants: [0xd4b080, 0xb89060, 0xe8c090, 0xa08850, 0xc8a870,
                    0xb8c8d8, 0xc8a8a0, 0xd0b0c0, 0x9ab8c0, 0xa8c0b0,
                    0xe0c8a8, 0xc0a878, 0xd8b898],
    hasRings:      false,
    glowIntensity: 0,
  },
  ice: {
    albedo:        0.50,
    glowColor:     null,
    // lodowo-niebieskie, szaro-białe, niebieskawa biel, zieleń Neptuna
    colorVariants: [0x80b8d8, 0xa0d0e8, 0x88c0d8, 0x90c8e0,
                    0xc0d8e8, 0xd0e8f0, 0x90b0c8, 0xa8d8e0,
                    0x78a8c0, 0x60a8c8],
    hasRings:      true,
    glowIntensity: 0,
  },
};
