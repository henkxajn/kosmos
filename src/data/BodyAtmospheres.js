// BodyAtmospheres — dane atmosfer, chmur i pokładów per archetyp (ARC COLONY SPHERE, krok CS-6b; plan §3.7).
//
// Czyste dane (bez importów). Konsument: `resolveAirLook` (src/utils/SurfaceAirLogic.js) → SurfaceAirShader.
// Działa WYŁĄCZNIE za FEATURES.sharedSurface; przy fladze OFF nikt tego modułu nie czyta.
//
// Wiersz archetypu:
//   always    — true: powietrze zawsze (archetyp z definicji ma gęstą atmosferę); false: tylko gdy zapisana klasa
//               atmosfery ciała to thin / breathable / dense (ciało bez atmosfery → brak powłoki i chmur).
//   halo      — poświata limbu POZA tarczą: thickness 0…1 (promień powłoki = AIR_HALO_SCALE), strength (alfa), wrap
//               (jak daleko poświata zachodzi za terminator; gęsta atmosfera rozprasza dalej).
//   veil      — zasłona NA tarczy: opacity = hazeOpacity ciała (jeden parametr; CS-7 rozrzedza go w widoku kolonii),
//               center = udział alfy w środku tarczy (reszta rośnie ku limbowi), opaque 1 = pokład / mgła (zasłania
//               także nocą), 0 = rozproszenie dzienne (znika po nocnej stronie), band = siła pasm i wirów w barwie
//               zasłony, bandFreq = liczba pasm [min, max] z ziarna.
//   clouds    — coverage [min, max] z ziarna (0 = brak chmur), alpha, scale [min, max] (wielkość komórek), band
//               [min, max] (0 = rozrzucone cumulusy … 1 = wielkie pasma burzowe), warp [min, max] (wiry), drift
//               [rad/s czasu POGODY — czas realny × weatherRate] (bardzo wolny dryf WZGLĘDEM powierzchni — powłoka
//               współobraca się z ciałem), shade (opcjonalnie; cieniowanie grubych partii 0…1, domyślnie AIR_WEATHER.shade).
//   variants  — warianty barw (sRGB hex): tint = poświata limbu, veil = [A, B, C] (baza, pasmo, wir), cloud = chmury,
//               twilight = pas zmierzchu. `resolveAirLook` miesza wariant A z domieszką B i dodaje rozrzut z ziarna —
//               barwy nie powtarzają się między ciałami (wymóg właściciela).

/** Mnożnik gęstości wg zapisanej klasy atmosfery ciała (te same proporcje co LIVE_ATMO.DENSITY_*). */
export const AIR_DENSITY_BY_CLASS = Object.freeze({ thin: 0.55, breathable: 1.0, dense: 1.3 });

/** Promień powłoki chmur / zasłony jako krotność promienia ciała. */
export const AIR_SHELL_SCALE = 1.016;
/** Promień poświaty limbu: lo + (hi − lo) · thickness. */
export const AIR_HALO_SCALE = Object.freeze({ lo: 1.035, hi: 1.115 });

/** Rozrzut barw z ziarna (odcień [°], nasycenie ±, jasność ±) i maksymalna domieszka wariantu B. */
export const AIR_JITTER = Object.freeze({ hue: 7, sat: 0.14, val: 0.08 });
export const AIR_BLEND_MAX = 0.4;

/**
 * Pogoda (strojenie CS-6b, §3.7.1) — chmury ewoluują, nie tylko dryfują.
 *   cycleSeconds — czas życia jednej fazy układów pogodowych [s czasu pogody]; po tym czasie wzór jest całkiem nowy,
 *   wind         — wiatr pasmowy [rad długości na cykl], zakres z ziarna (znak też z ziarna),
 *   windBands    — liczba pasm wiatru między biegunami, zakres z ziarna (sąsiednie pasma wieją w przeciwne strony),
 *   shade        — cieniowanie grubych partii chmur od strony cienia (0 = płasko … 1),
 *   speedCap     — sufit tempa pogody względem czasu realnego (weatherRate).
 */
export const AIR_WEATHER = Object.freeze({ cycleSeconds: 70, wind: [0.6, 1.2], windBands: [1.6, 3.4], shade: 0.8, speedCap: 2.5 });

const WHITE = '#f2f5fa';

export const BODY_AIR = Object.freeze({
  // ── Błękitna mgiełka podnosząca ciemne oceany; chmury od rozrzuconych cumulusów po wielkie pasma burzowe ──
  terran: {
    always: false,
    halo: { thickness: 0.5, strength: 0.62, wrap: 0.22 },
    veil: { opacity: 0.34, center: 0.26, opaque: 0, band: 0, bandFreq: [3, 5] },
    clouds: { coverage: [0.26, 0.6], alpha: 0.94, scale: [1.5, 3.4], band: [0.0, 0.7], warp: [0.2, 0.7], drift: 0.012 },
    variants: [
      { id: 'azure',  tint: '#5a9bff', veil: ['#5f9df5', '#5f9df5', '#86b6f7'], cloud: WHITE,     twilight: '#ff8648' },
      { id: 'cyan',   tint: '#58b4f0', veil: ['#5fb0ea', '#5fb0ea', '#8cc8ee'], cloud: '#f4f6f6', twilight: '#ff9a52' },
      { id: 'indigo', tint: '#6f8cf8', veil: ['#7090f0', '#7090f0', '#93aaf2'], cloud: '#f1f2fa', twilight: '#ff7a55' },
    ],
  },
  ocean: {
    always: false,
    halo: { thickness: 0.55, strength: 0.66, wrap: 0.24 },
    veil: { opacity: 0.38, center: 0.28, opaque: 0, band: 0, bandFreq: [3, 5] },
    clouds: { coverage: [0.42, 0.72], alpha: 0.94, scale: [1.3, 2.8], band: [0.2, 0.8], warp: [0.3, 0.8], drift: 0.014 },
    variants: [
      { id: 'azure', tint: '#4f96ff', veil: ['#5598f2', '#5598f2', '#7fb2f5'], cloud: WHITE,     twilight: '#ff8648' },
      { id: 'teal',  tint: '#4fb6e6', veil: ['#56b2e0', '#56b2e0', '#86cae6'], cloud: '#f2f6f5', twilight: '#ff9a52' },
      { id: 'deep',  tint: '#5f86f5', veil: ['#6288ee', '#6288ee', '#8aa6f0'], cloud: '#f0f2f9', twilight: '#ff7a55' },
    ],
  },
  // ── Wilgotna, mleczna, zielonkawo-błękitna; gęste chmury ──
  jungle: {
    always: false,
    halo: { thickness: 0.62, strength: 0.66, wrap: 0.28 },
    veil: { opacity: 0.46, center: 0.36, opaque: 0, band: 0, bandFreq: [3, 5] },
    clouds: { coverage: [0.46, 0.76], alpha: 0.92, scale: [1.6, 3.0], band: [0.2, 0.8], warp: [0.3, 0.8], drift: 0.011 },
    variants: [
      { id: 'humid', tint: '#7fc8c0', veil: ['#8cc9c0', '#8cc9c0', '#b2dcd2'], cloud: '#eef4ee', twilight: '#ffa25a' },
      { id: 'mist',  tint: '#8cc4dc', veil: ['#98c8da', '#98c8da', '#bcdde6'], cloud: '#f0f4f2', twilight: '#ff9658' },
      { id: 'green', tint: '#8fd0a0', veil: ['#9ad0a6', '#9ad0a6', '#bfe2c2'], cloud: '#eef3e8', twilight: '#ffac60' },
    ],
  },
  // ── Mars: cienka różowawa mgiełka pyłu, prawie bez chmur ──
  desert: {
    always: false,
    halo: { thickness: 0.22, strength: 0.4, wrap: 0.12 },
    veil: { opacity: 0.2, center: 0.18, opaque: 0, band: 0, bandFreq: [3, 5] },
    clouds: { coverage: [0.03, 0.14], alpha: 0.5, scale: [2.4, 4.2], band: [0.0, 0.4], warp: [0.3, 0.9], drift: 0.008 },
    variants: [
      { id: 'pink',   tint: '#e6a48c', veil: ['#dfa58e', '#dfa58e', '#ebbfa8'], cloud: '#f0dccc', twilight: '#7fa6e0' },
      { id: 'butter', tint: '#e2b68a', veil: ['#dcb48c', '#dcb48c', '#e9cba6'], cloud: '#f1e2c8', twilight: '#86a8dc' },
      { id: 'rose',   tint: '#e09a98', veil: ['#da9c98', '#da9c98', '#e8b8b2'], cloud: '#f0d8d2', twilight: '#7c9ee0' },
    ],
  },
  // ── Lodowy świat z atmosferą: blada mgiełka, cienkie cirrusy ──
  ice: {
    always: false,
    halo: { thickness: 0.3, strength: 0.42, wrap: 0.14 },
    veil: { opacity: 0.2, center: 0.2, opaque: 0, band: 0, bandFreq: [3, 5] },
    clouds: { coverage: [0.08, 0.3], alpha: 0.6, scale: [1.8, 3.6], band: [0.3, 0.9], warp: [0.2, 0.8], drift: 0.009 },
    variants: [
      { id: 'pale',  tint: '#bcdcff', veil: ['#bcd8f6', '#bcd8f6', '#d6e8fa'], cloud: '#f4f8fc', twilight: '#ffb088' },
      { id: 'steel', tint: '#a8c8ec', veil: ['#aac6e6', '#aac6e6', '#c8dcf0'], cloud: '#f0f4f8', twilight: '#ffa890' },
      { id: 'mint',  tint: '#b4e4ea', veil: ['#b4dee4', '#b4dee4', '#d0ecee'], cloud: '#f2f8f8', twilight: '#ffb890' },
    ],
  },
  // ── Wulkaniczny: dymna brunatno-pomarańczowa mgiełka, ciemne pióropusze popiołu ──
  volcanic: {
    always: false,
    halo: { thickness: 0.34, strength: 0.44, wrap: 0.16 },
    veil: { opacity: 0.3, center: 0.3, opaque: 0, band: 0, bandFreq: [3, 5] },
    clouds: { coverage: [0.1, 0.34], alpha: 0.72, scale: [1.6, 3.2], band: [0.0, 0.5], warp: [0.7, 1.4], drift: 0.01 },
    variants: [
      { id: 'smoke', tint: '#d08a5a', veil: ['#b8805c', '#b8805c', '#caa080'], cloud: '#8a7a70', twilight: '#ff7038' },
      { id: 'ash',   tint: '#c09070', veil: ['#a88a74', '#a88a74', '#c0a694'], cloud: '#7e7874', twilight: '#ff7a40' },
      { id: 'ember', tint: '#dc8050', veil: ['#c27a54', '#c27a54', '#d49a78'], cloud: '#907468', twilight: '#ff6430' },
    ],
  },
  // ── Wenus: nieprzezroczysty pokład chmur z subtelnymi pasmami i wirami; powierzchnia ukryta na mapie układu ──
  hothouse: {
    always: true,
    halo: { thickness: 0.8, strength: 0.56, wrap: 0.36 },
    veil: { opacity: 1.0, center: 1.0, opaque: 1, band: 0.85, bandFreq: [3.5, 7] },
    clouds: { coverage: [0, 0], alpha: 0, scale: [1.2, 2.4], band: [0.5, 1.0], warp: [0.5, 1.3], drift: 0.02 },
    variants: [
      { id: 'cream',   tint: '#f0deb0', veil: ['#e9dcb8', '#d6c494', '#f4ecd4'], cloud: '#f4ecd4', twilight: '#ffb060' },
      { id: 'sulphur', tint: '#ecd070', veil: ['#e2c868', '#c8a848', '#f0e09a'], cloud: '#f0e09a', twilight: '#ffa850' },
      { id: 'tan',     tint: '#dcb888', veil: ['#d2b088', '#b89468', '#e6d0b0'], cloud: '#e6d0b0', twilight: '#ff9c58' },
    ],
  },
  // ── Tytan (planeta): gęsta pomarańczowa mgła (hazeOpacity 0.90 — wartość właściciela, strojenie CS-6b) ──
  cryo_haze: {
    always: true,
    halo: { thickness: 1.0, strength: 0.6, wrap: 0.42 },
    veil: { opacity: 0.90, center: 1.0, opaque: 1, band: 0.4, bandFreq: [2, 4] },
    clouds: { coverage: [0, 0], alpha: 0, scale: [1.0, 2.0], band: [0.4, 0.9], warp: [0.3, 0.9], drift: 0.012 },
    variants: [
      { id: 'orange', tint: '#e89a48', veil: ['#dc9244', '#c47c34', '#eaac62'], cloud: '#eaac62', twilight: '#8a90e0' },
      { id: 'amber',  tint: '#e89c3e', veil: ['#dc963a', '#c27e2c', '#ecb05a'], cloud: '#ecb05a', twilight: '#8c96de' },
      { id: 'rust',   tint: '#de8448', veil: ['#d07c44', '#b66834', '#e09a64'], cloud: '#e09a64', twilight: '#8888e2' },
    ],
  },
  // ── Tytan (księżyc): cieńsza mgła, bledszy żółtawy / brzoskwiniowy ton (inny niż cryo_haze); powierzchnia prześwituje ──
  hazy_moon: {
    always: true,
    halo: { thickness: 0.7, strength: 0.5, wrap: 0.32 },
    veil: { opacity: 0.86, center: 0.92, opaque: 1, band: 0.3, bandFreq: [2, 4] },
    clouds: { coverage: [0, 0], alpha: 0, scale: [1.0, 2.0], band: [0.4, 0.9], warp: [0.3, 0.9], drift: 0.012 },
    variants: [
      { id: 'peach',  tint: '#ecc088', veil: ['#e2b884', '#cca06c', '#eed0a2'], cloud: '#eed0a2', twilight: '#9098dc' },
      { id: 'ochre',  tint: '#e4c470', veil: ['#dabc6e', '#c2a458', '#e8d290'], cloud: '#e8d290', twilight: '#8c9cda' },
      { id: 'salmon', tint: '#eab090', veil: ['#e0a88c', '#c89074', '#ecc4aa'], cloud: '#ecc4aa', twilight: '#9494de' },
    ],
  },
  // ── Związana pływowo z cienką atmosferą: blada mgiełka, pojedyncze chmury ──
  tidally_locked: {
    always: false,
    halo: { thickness: 0.3, strength: 0.42, wrap: 0.16 },
    veil: { opacity: 0.2, center: 0.2, opaque: 0, band: 0, bandFreq: [3, 5] },
    clouds: { coverage: [0.06, 0.24], alpha: 0.7, scale: [1.6, 3.2], band: [0.0, 0.5], warp: [0.6, 1.3], drift: 0.008 },
    variants: [
      { id: 'lilac', tint: '#b8a8ec', veil: ['#b6aae4', '#b6aae4', '#cec6ee'], cloud: '#eeeef6', twilight: '#ff9460' },
      { id: 'grey',  tint: '#a8b4d0', veil: ['#aab4cc', '#aab4cc', '#c6cede'], cloud: '#eef0f4', twilight: '#ff9c68' },
      { id: 'sand',  tint: '#d4b89c', veil: ['#ceb49c', '#ceb49c', '#e0ccb8'], cloud: '#f2ece4', twilight: '#8ca4dc' },
    ],
  },
});
