// BodyPalettes — palety powierzchni ciał dla wspólnego shadera (ARC COLONY SPHERE, krok CS-6a; plan §3.6).
//
// DANE, zero logiki. Czyta je `src/utils/SurfacePaletteLogic.js` (wybór wariantu + rozrzut z `surfaceSeed` + odcień klasy
// gwiazdy) i `src/renderer/SurfaceShader.js` (znaczenie slotów = funkcje wyglądu w GLSL).
//
// Wymóg właściciela (2026-11-18): barwy NIE MOGĄ się powtarzać — żadne dwa ciała tego samego archetypu nie wyglądają
// tak samo. Dlatego każdy archetyp ma kilka WARIANTÓW palety (np. pustynia rdza → ochra → szarobrąz), a logika miesza
// dwa warianty z wagą z ziarna i dokłada ciągły rozrzut odcienia / nasycenia / albedo.
//
// Kolory: sRGB `#rrggbb`. Kolejność slotów zależy od WYGLĄDU (`look`) — tabela `SURFACE_LOOK_SLOTS` niżej.

/** Identyfikatory funkcji wyglądu w shaderze (uniform `uLook`). Kolejność = gałęzie GLSL — nie przestawiać. */
export const SURFACE_LOOKS = Object.freeze({
  TERRAN: 0, DESERT: 1, ICE: 2, VOLCANIC: 3, HOTHOUSE: 4, CRYO: 5, CRATERED: 6, TIDAL: 7, IO: 8, EUROPA: 9,
});

/** Liczba slotów palety w shaderze (`uniform vec3 uPal[8]`). */
export const SURFACE_PALETTE_SLOTS = 8;

/** Znaczenie slotów per wygląd (dokumentacja + keeper: każdy wariant ma dokładnie tyle barw). */
export const SURFACE_LOOK_SLOTS = Object.freeze({
  TERRAN:   ['deepSea', 'shallowSea', 'dryLowland', 'grass', 'forest', 'rock', 'snow', 'tundraOrSwamp'],
  DESERT:   ['dune', 'darkRock', 'mesa', 'saltFlat', 'polarFrost'],
  ICE:      ['icePlain', 'smoothPlain', 'oldIce', 'exposedRock', 'ridge', 'rift', 'cryoDeposit'],
  VOLCANIC: ['scorchedRock', 'ash', 'basaltRidge', 'lava', 'calderaFloor', 'lavaHot'],
  HOTHOUSE: ['acidFlats', 'dustBasin', 'highlands', 'sulphurVolcano', 'toneShift'],
  CRYO:     ['hazePlain', 'methaneLake', 'cryoHighlands', 'dunes', 'waterIce'],
  CRATERED: ['base', 'feature', 'craterFloor', 'craterRim', 'elevationFeature', 'polarIce'],
  TIDAL:    ['substellarRock', 'dayScorched', 'terminatorBand', 'terminatorSea', 'nightIce'],
  IO:       ['sulphurPlain', 'sulphurAlt', 'silicateMountains', 'patera', 'lavaLake', 'so2Frost'],
  EUROPA:   ['icePlain', 'ridgedPlain', 'chaosTerrain', 'lineae'],
});

/** Sloty EMISYJNE (lawa) — nie dostają odcienia gwiazdy ani rozrzutu albedo. */
export const SURFACE_EMISSIVE_SLOTS = Object.freeze({ VOLCANIC: [3, 5], IO: [4] });

/**
 * Odcień klasy gwiazdy na ALBEDO (mnożnik RGB + wzmocnienie). Światło gwiazdy barwi scenę osobno (ThreeRenderer,
 * `SurfaceShader.surfaceSunColor`) — to jest drugi, subtelny składnik: M ciepłe i ciemniejsze, F chłodne i jaśniejsze.
 */
export const STAR_CLASS_TINT = Object.freeze({
  M: Object.freeze({ mul: [1.05, 0.97, 0.90], gain: 0.94 }),
  K: Object.freeze({ mul: [1.03, 0.99, 0.95], gain: 0.98 }),
  G: Object.freeze({ mul: [1.00, 1.00, 1.00], gain: 1.00 }),
  F: Object.freeze({ mul: [0.97, 1.00, 1.05], gain: 1.04 }),
});
export const STAR_CLASS_TINT_DEFAULT = STAR_CLASS_TINT.G;

/** Domyślny ciągły rozrzut z ziarna: odcień [°], nasycenie i jasność [ułamek], oś ciepło↔chłodno [ułamek RGB]. */
export const PALETTE_JITTER_DEFAULT = Object.freeze({ hue: 9, sat: 0.16, val: 0.11, warm: 0.035 });
/** Rozrzut PER SLOT (niezależny dla każdej barwy palety) — mały, żeby paleta została spójna. */
export const PALETTE_SLOT_JITTER = Object.freeze({ hue: 3, val: 0.045 });
/** Maksymalna waga domieszki drugiego wariantu (0 = czysty wariant A). */
export const PALETTE_BLEND_MAX = 0.42;

const v = (id, colors, star = null) => Object.freeze({ id, colors: Object.freeze(colors), star: star ? Object.freeze(star) : null });

// Parametry shadera per archetyp:
//   look      — funkcja wyglądu (SURFACE_LOOKS)
//   mode      — pod-tryb wyglądu (TERRAN: 0 terran, 1 ocean, 2 jungle; CRYO: 0 cryo_haze, 1 hazy_moon)
//   capT      — próg czapy polarnej w kanale t (−1 = brak); = 0.06 + 0.2 · field.polarCapBias klasyfikatora SurfaceField
//   mThr      — CRATERED: próg kanału m dla slotu `feature` (2 = brak)
//   eThr/eMode— CRATERED: próg kanału e dla `elevationFeature` (eMode −1: poniżej, +1: powyżej, 0: brak)
//   relief    — siła normalnych z wysokości · specular — połysk wody / lodu · emissive — żar lawy
//   wrap      — miękkość terminatora (atmosfera rozprasza światło za terminator); 0.02 = ciało bez atmosfery
//   jitter    — nadpisanie PALETTE_JITTER_DEFAULT (szare ciała: mały odcień, większa oś ciepło↔chłodno)
const GREY_JITTER = Object.freeze({ hue: 5, sat: 0.22, val: 0.14, warm: 0.07 });

export const BODY_PALETTES = Object.freeze({
  terran: {
    look: 'TERRAN', mode: 0, capT: 0.16, relief: 0.30, specular: 1.0, emissive: 0, wrap: 0.10,
    variants: [
      v('earth',    ['#0a1d3a', '#1c4a66', '#a8956a', '#5d7440', '#2e4a2b', '#6e665b', '#eef1f4', '#7d7e66'], { G: 2, F: 1.5 }),
      v('teal',     ['#0b2531', '#1f5158', '#b09a6c', '#6b7a42', '#33503a', '#72695d', '#eef2f1', '#84866e']),
      v('olive',    ['#0e2238', '#234c60', '#ad9870', '#7a7a3e', '#4c5229', '#776a56', '#ebe8df', '#8a836a'], { K: 2 }),
      v('crimson',  ['#0f1b38', '#24466a', '#b0966f', '#806a4a', '#5c3a32', '#6b6361', '#f0edee', '#847870'], { M: 3, K: 0.25, G: 0.3, F: 0.3 }),
      v('viridian', ['#0a1e33', '#1b4a5c', '#a09c76', '#4a7a62', '#254f48', '#687071', '#edf2f4', '#768882'], { F: 2.5 }),
      v('amber',    ['#0d203c', '#22506a', '#b8a06a', '#8a8a40', '#5a6028', '#766957', '#f1ede3', '#8e856a'], { M: 2, K: 1 }),
      v('jade_sea', ['#0c2a2e', '#255a54', '#a89566', '#627a40', '#2c4a30', '#6f695d', '#edf1ed', '#80846a']),
    ],
  },
  ocean: {
    look: 'TERRAN', mode: 1, capT: 0.14, relief: 0.28, specular: 1.15, emissive: 0, wrap: 0.11,
    variants: [
      v('navy',     ['#081a3a', '#1a4468', '#b4a47a', '#5e7a44', '#2f5234', '#6f685f', '#eef2f5', '#80826a']),
      v('teal',     ['#082630', '#1a5560', '#baa880', '#6a8048', '#2e5640', '#746d62', '#eff3f1', '#888a72']),
      v('jade',     ['#0a2a2a', '#245c50', '#b0a074', '#687e40', '#30502e', '#6f6a5e', '#edf1eb', '#80846a']),
      v('steel',    ['#142233', '#35546a', '#aca088', '#6a7a56', '#3a523c', '#6c6c70', '#ebeef1', '#84867c']),
      v('cobalt',   ['#0a1648', '#22408a', '#b8ac8c', '#587c54', '#285842', '#6e6968', '#f0f0f4', '#80846f'], { F: 2 }),
    ],
  },
  jungle: {
    look: 'TERRAN', mode: 2, capT: -1, relief: 0.28, specular: 0.9, emissive: 0, wrap: 0.11,
    variants: [
      v('emerald',  ['#0a2630', '#1f5560', '#9a8c50', '#4a7a36', '#1f4f26', '#6a6658', '#e8eee8', '#3a5a3a']),
      v('olive',    ['#102a28', '#2e5c50', '#a89858', '#74803a', '#465422', '#74684e', '#e8e8dc', '#4c5630']),
      v('teal',     ['#08243a', '#1c5870', '#9c9460', '#34805f', '#17524a', '#646c68', '#e6f0ee', '#2c5650'], { F: 2 }),
      v('maroon',   ['#111a38', '#2c4870', '#b09468', '#80583e', '#5e2a30', '#6c6064', '#eee8ea', '#54303a'], { M: 3, K: 1.5, G: 0.5, F: 0.4 }),
      v('dark',     ['#08201e', '#1a4a42', '#8c8048', '#356a2e', '#143a1e', '#5c5a4c', '#e4eae2', '#2c4226']),
      v('lime',     ['#0c2a38', '#256068', '#b4a460', '#73963e', '#3a6a2a', '#72705c', '#eef2e6', '#4e6a34']),
    ],
  },
  desert: {
    look: 'DESERT', mode: 0, capT: 0.10, relief: 0.42, specular: 0.15, emissive: 0, wrap: 0.05,
    variants: [
      v('rust',      ['#b5653a', '#5e3424', '#8f4a2c', '#dcc4a4', '#ece6e0']),
      v('ochre',     ['#c79a4e', '#7a5a30', '#a8743a', '#e8dcb8', '#f0ece2']),
      v('greybrown', ['#9a8672', '#564a40', '#7a6654', '#d6ccc0', '#e8e8e6']),
      v('crimson',   ['#a2452f', '#4a221c', '#7c3324', '#d8b8a0', '#eee4e0']),
      v('pale_sand', ['#d8bc8a', '#8a6e4c', '#b89060', '#f0e6cc', '#f4f0e8']),
      v('umber',     ['#8c6258', '#45302e', '#6e4a44', '#cdbcb4', '#e6e2e2']),
    ],
  },
  ice: {
    look: 'ICE', mode: 0, capT: -1, relief: 0.40, specular: 0.45, emissive: 0, wrap: 0.04,
    variants: [
      v('white',     ['#e4ecf2', '#f2f6f9', '#b8c8d6', '#6a625c', '#c8dcea', '#4f7fa8', '#ffffff']),
      v('pale_blue', ['#cfe2f2', '#e2f0fa', '#9cb8d4', '#5c6068', '#a8cce8', '#2f6aa6', '#f0f8ff']),
      v('beige',     ['#e0d8c8', '#efe8da', '#b4a690', '#6c5c4c', '#d0c4ac', '#7a6a58', '#f6f0e4']),
      v('mint',      ['#d8ece6', '#eaf6f2', '#a4c6bc', '#5a6660', '#b4dcd0', '#3f8478', '#f4fffa']),
      v('rosy',      ['#ecdcd4', '#f6ece6', '#c8a898', '#6e5046', '#dcc0b4', '#8a5444', '#fff6f0']),
      v('slate',     ['#c4ccd6', '#dce2ea', '#8e9aac', '#4e525c', '#a8b4c6', '#3c4f72', '#eef2f8']),
    ],
  },
  volcanic: {
    look: 'VOLCANIC', mode: 0, capT: -1, relief: 0.46, specular: 0.1, emissive: 1.0, wrap: 0.06,
    variants: [
      v('basalt',   ['#2e2826', '#4a4442', '#1e1c1e', '#e04a10', '#3a2a24', '#ffc060']),
      v('rusty',    ['#3e2a22', '#5c4438', '#2a1c18', '#d83c0c', '#4a2c20', '#ffb050']),
      v('sulphur',  ['#38342a', '#6a6248', '#24221c', '#f06a14', '#4a4028', '#ffd070']),
      v('obsidian', ['#22242a', '#3c4048', '#16181e', '#e8380c', '#2a2630', '#ffa848']),
      v('cinder',   ['#4a3a34', '#6c5a50', '#30262a', '#e85a18', '#523830', '#ffc878']),
    ],
  },
  hothouse: {
    look: 'HOTHOUSE', mode: 0, capT: -1, relief: 0.36, specular: 0.1, emissive: 0, wrap: 0.14,
    variants: [
      v('venus',     ['#b88a4c', '#8a6238', '#d0a868', '#e4cc5a', '#a07840']),
      v('ochre_red', ['#a8683c', '#7a4428', '#c48a54', '#dcb850', '#94583a']),
      v('pale',      ['#c8ac7c', '#9c8258', '#dcc69a', '#ece09a', '#b49868']),
      v('acid',      ['#9a8e4e', '#6e6638', '#b8aa6a', '#d8d458', '#88803c']),
      v('brown',     ['#8e6a50', '#644838', '#aa8868', '#d4b464', '#7c5c48']),
    ],
  },
  cryo_haze: {
    look: 'CRYO', mode: 0, capT: -1, relief: 0.34, specular: 0.5, emissive: 0, wrap: 0.14,
    variants: [
      v('titan',  ['#b07a3c', '#33282a', '#c89858', '#5a3c22', '#d8c8a8']),
      v('amber',  ['#c08e44', '#3a2c26', '#d8ae68', '#6e4a24', '#e4d4ac']),
      v('tan',    ['#9c8468', '#2e2e38', '#b8a488', '#54443a', '#d4ccc0']),
      v('tholin', ['#a8603a', '#34242a', '#c0805a', '#4e2a1e', '#d8b8a4']),
      v('olive',  ['#9a8a48', '#2c302a', '#b8a868', '#4c4424', '#d6d0a8']),
    ],
  },
  hazy_moon: {
    look: 'CRYO', mode: 1, capT: -1, relief: 0.38, specular: 0.5, emissive: 0, wrap: 0.10,
    variants: [
      v('titan',  ['#a8743c', '#30262a', '#c09458', '#56381e', '#d4c4a6']),
      v('honey',  ['#c49a50', '#382c24', '#dcb870', '#6c4c26', '#e8dab4']),
      v('grey',   ['#8e8274', '#2c2c34', '#aea294', '#4c4238', '#d0cac0']),
      v('red',    ['#9c5638', '#322228', '#b87858', '#48261c', '#d4b4a2']),
      v('khaki',  ['#8c8450', '#2a2e28', '#aca470', '#44402a', '#d0ccac']),
    ],
  },
  scorched: {
    look: 'CRATERED', mode: 0, capT: -1, mThr: 0.60, eThr: 0.36, eMode: -1, relief: 0.60, specular: 0.05, emissive: 0, wrap: 0.02,
    jitter: GREY_JITTER,
    variants: [
      v('mercury',  ['#8a7c70', '#a4988c', '#5c524a', '#b8ada0', '#4a4440', '#e8eef2']),
      v('charcoal', ['#5e5a58', '#7a7674', '#3c3a3a', '#94908c', '#2c2c30', '#e8eef2']),
      v('baked',    ['#8c5c48', '#a87864', '#5a382c', '#c09480', '#40282a', '#e8eef2']),
      v('tan',      ['#a08e70', '#b8a88c', '#6c5e48', '#cebfa4', '#54483c', '#e8eef2']),
      v('bronze',   ['#6c5a44', '#8a765c', '#44382a', '#a8947a', '#30281e', '#e8eef2']),
    ],
  },
  barren: {
    look: 'CRATERED', mode: 0, capT: 0.10, mThr: 2, eThr: 0, eMode: 0, relief: 0.60, specular: 0.05, emissive: 0, wrap: 0.02,
    jitter: GREY_JITTER,
    variants: [
      v('grey',   ['#8c8a86', '#8c8a86', '#5e5c5a', '#b4b2ae', '#8c8a86', '#e8eef2']),
      v('warm',   ['#96897a', '#96897a', '#645a50', '#baae9e', '#96897a', '#f0ece6']),
      v('cool',   ['#7c848c', '#7c848c', '#50565e', '#a8b0b8', '#7c848c', '#e6f0f8']),
      v('brown',  ['#80705e', '#80705e', '#54483c', '#a89884', '#80705e', '#eeeae4']),
      v('basalt', ['#5a5858', '#5a5858', '#3a3838', '#84807e', '#5a5858', '#e4e8ec']),
      v('pale',   ['#b0aaa0', '#b0aaa0', '#7c766e', '#d0cac0', '#b0aaa0', '#f4f6f8']),
    ],
  },
  tidally_locked: {
    look: 'TIDAL', mode: 0, capT: -1, relief: 0.36, specular: 0.8, emissive: 0, wrap: 0.08,
    variants: [
      v('ember',  ['#5a3a2a', '#9a6a44', '#6c7a4c', '#1c4a6a', '#dfe8f0']),
      v('ochre',  ['#6e5430', '#b8904e', '#7c8450', '#20586a', '#e6ecf0']),
      v('ashen',  ['#4a4644', '#8a8078', '#707a6a', '#2a4c60', '#d4dce8']),
      v('violet', ['#5c3028', '#a25c3c', '#6a4c6a', '#1a3a66', '#e8e4f0'], { M: 2.5 }),
      v('pale',   ['#7a6850', '#c4a878', '#8c9468', '#2c6474', '#f0f4f6']),
    ],
  },
  // ── Księżyce ──
  rocky_cratered: {
    look: 'CRATERED', mode: 0, capT: 0.10, mThr: 0.50, eThr: 0, eMode: 0, relief: 0.70, specular: 0.05, emissive: 0, wrap: 0.02,
    jitter: GREY_JITTER,
    variants: [
      v('luna',   ['#b0aea8', '#4e4e52', '#76746e', '#d0cec8', '#b0aea8', '#eef2f6']),
      v('warm',   ['#b4a590', '#5a4c40', '#7c6e5e', '#d2c4b0', '#b4a590', '#f2efe8']),
      v('cool',   ['#a2aab4', '#444a56', '#6a727c', '#c4ccd6', '#a2aab4', '#eaf2fa']),
      v('rusty',  ['#a8846c', '#54382c', '#72564a', '#c8a48c', '#a8846c', '#f0e8e2']),
      v('carbon', ['#6e6a66', '#34322f', '#4a4744', '#8e8a84', '#6e6a66', '#e6e8ea']),
      v('ochre',  ['#bca672', '#665432', '#84724c', '#d8c694', '#bca672', '#f4f0e2']),
    ],
  },
  volcanic_moon: {
    look: 'IO', mode: 0, capT: -1, relief: 0.40, specular: 0.1, emissive: 1.0, wrap: 0.03,
    variants: [
      v('io',     ['#d8c04a', '#c8902c', '#6a5a48', '#3a2a1e', '#ff5a14', '#f0ecd0']),
      v('orange', ['#d49a34', '#b86a24', '#5e4c3e', '#34221a', '#ff4810', '#f0e4c4']),
      v('lemon',  ['#e4d88a', '#cbb458', '#7a7058', '#403424', '#ff6a1c', '#f8f6e0']),
      v('green',  ['#c0c050', '#98902c', '#5c5a44', '#2e2c1c', '#ff5c14', '#eef0d4']),
      v('ochre',  ['#c87c34', '#a04c20', '#5a443a', '#301c16', '#ff400c', '#ecd8c0']),
    ],
  },
  icy_cracked: {
    look: 'EUROPA', mode: 0, capT: -1, relief: 0.34, specular: 0.5, emissive: 0, wrap: 0.02,
    variants: [
      v('europa',    ['#dcd8cc', '#c8c0b0', '#a89078', '#8a4a2c']),
      v('blue',      ['#d4e0ec', '#b8cce0', '#8ca4bc', '#54708c']),
      v('rust',      ['#eeeeea', '#dcd8d0', '#b89c88', '#a04428']),
      v('tan',       ['#dccfb0', '#c8b894', '#a48c64', '#6e4a2a']),
      v('teal',      ['#ccd8d6', '#b0c4c0', '#84a09c', '#3c6a6a']),
      v('enceladus', ['#f0f2f4', '#dfe6ec', '#b6c8d6', '#3e86b4']),
    ],
  },
  icy_cratered: {
    look: 'CRATERED', mode: 0, capT: -1, mThr: 0.68, eThr: 0, eMode: 0, relief: 0.66, specular: 0.2, emissive: 0, wrap: 0.02,
    jitter: GREY_JITTER,
    variants: [
      v('callisto', ['#8a8478', '#4a4038', '#5e5a52', '#e0e4e8', '#8a8478', '#f0f4f8']),
      v('bright',   ['#c4ccd4', '#5c5a5c', '#8a929a', '#f2f6fa', '#c4ccd4', '#ffffff']),
      v('tan',      ['#b4a890', '#5a4a3a', '#7c725e', '#ece4d4', '#b4a890', '#f6f2ea']),
      v('blue',     ['#98a8b8', '#48505c', '#68788a', '#dceaf6', '#98a8b8', '#f0f8ff']),
      v('dark',     ['#6e645a', '#3a3028', '#4c443c', '#cfc8be', '#6e645a', '#eeeae6']),
    ],
  },
  // ── Planetoidy: warianty per typ (`planetoidPaletteOf`: metallic / carbonaceous / silicate / icy) ──
  planetoid: {
    look: 'CRATERED', mode: 0, capT: -1, mThr: 0.50, eThr: 0.62, eMode: 1, relief: 0.90, specular: 0.05, emissive: 0, wrap: 0.02,
    jitter: GREY_JITTER,
    variantsByPalette: {
      metallic: [
        v('iron',   ['#8a8478', '#d4c090', '#565048', '#b0a898', '#6e6a60', '#e8eef2']),
        v('nickel', ['#7c7c84', '#c8ccd8', '#4c4c54', '#a4a4ae', '#62626a', '#e8eef2']),
        v('copper', ['#8c7460', '#dca860', '#58483c', '#b29a84', '#705c4c', '#e8eef2']),
        v('dull',   ['#6a6660', '#b8a070', '#423f3a', '#908a82', '#54514c', '#e8eef2']),
      ],
      carbonaceous: [
        v('coal',   ['#625c56', '#96866e', '#403c38', '#88827a', '#4e4a46', '#e8eef2']),
        v('blue',   ['#54545c', '#84849a', '#36363c', '#787882', '#44444a', '#e8eef2']),
        v('umber',  ['#6e5c4e', '#a88662', '#463a32', '#948070', '#584a40', '#e8eef2']),
        v('olive',  ['#5c5850', '#948a6c', '#3a3832', '#827c72', '#4a4640', '#e8eef2']),
      ],
      silicate: [
        v('stone',  ['#9a8e7c', '#c8b490', '#60584d', '#c0b4a0', '#7a7062', '#e8eef2']),
        v('clay',   ['#a08068', '#d0a880', '#645040', '#c6a68c', '#806652', '#e8eef2']),
        v('green',  ['#8e9088', '#c0c4b8', '#585a54', '#b4b6ae', '#70726c', '#e8eef2']),
        v('sand',   ['#b09a70', '#dcc898', '#6e6046', '#d4c096', '#8c7a58', '#e8eef2']),
      ],
    },
  },
  planetoid_icy: {
    look: 'CRATERED', mode: 0, capT: -1, mThr: 0.62, eThr: 0, eMode: 0, relief: 0.85, specular: 0.25, emissive: 0, wrap: 0.02,
    jitter: GREY_JITTER,
    variants: [
      v('frost',  ['#c8d0d8', '#8a8680', '#84909a', '#eef4fa', '#c8d0d8', '#ffffff']),
      v('cream',  ['#d8d4c8', '#94866e', '#948e82', '#f4f0e6', '#d8d4c8', '#ffffff']),
      v('blue',   ['#b8cce0', '#74808c', '#7488a0', '#e4f0fc', '#b8cce0', '#ffffff']),
      v('rose',   ['#e0dcdc', '#a08c88', '#989292', '#f8f4f4', '#e0dcdc', '#ffffff']),
    ],
  },
});
