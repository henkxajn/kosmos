// ExplosionLogic — śmierć okrętu, stany uszkodzeń i płonący wrak (ARC COMBAT VISUALS, krok CV-5; plan §2.5, §2.10;
// Findingi 615, 618, 619, 620, 627, 641, 702; flaga `cvDamage`).
//
// ⚠ ZERO IMPORTÓW. Czysta logika: wykonuje się pod node (keeper `cv_damage_logic_smoke` — wykonaniem, nie lekturą). Rysunek
//   (pule silnika FX, światła puli, materiały wraku) robi renderer według planów z tego modułu.
//
// Co tu mieszka:
//   · PLAN EKSPLOZJI (`explosionPlan`) — lista „wpisów” (błysk, smuga anamorficzna, płaty kuli ognia, fala uderzeniowa, odłamki,
//     żar, dym, światło, sygnał) z czasami względem chwili zniszczenia, rozmiarami w jednostkach świata liczonymi z DŁUGOŚCI
//     RYSOWANEJ kadłuba (bez podłóg — Finding 619) i kierunkami z ziarna (mulberry32 — nigdy `Math` losujący, reguła CV-0b).
//     Klasa decyduje o choreografii śmierci: fregata — jeden ostry wybuch; niszczyciel — wybuch wtórny i główny; pancernik — 2–3
//     wybuchy wtórne wzdłuż kadłuba (punkty uszkodzeń), potem największa kula ognia i długi ogon dymu. Budżety z presetu jakości
//     (odłamki, żar, dym, cząstki — tabela §2.10) zmieniają LICZBY, nigdy chwilę ani obecność eksplozji (Low — bez świateł,
//     odłamków, dymu i żaru, wybuch zostaje);
//   · STANY USZKODZEŃ (`damageStateOf`) z HP POKAZYWANEGO (rejestr salw CV-4a): ≤ 75 % dym, ≤ 50 % ogień, ≤ 25 % krztuszący się
//     silnik — uporządkowane z konstrukcji (dym ⊂ ogień ⊂ krztuszenie) i monotoniczne w HP;
//   · WRAK: żar szwów stygnący na zegarze prezentacji (`wreckHeatAt` — 10–20 s do przypalonego kadłuba z kilkoma migającymi
//     iskrami), 1–2 małe pożary w punktach uszkodzeń, które gasną, powolny obrót i dryf W KOPERCIE klasy (`wreckDrift` —
//     deterministyczny z ziarna statku, ograniczony, od zera w chwili zniszczenia), zbieżność do pozycji logicznej, gdy scena
//     znika (Finding 627 — mechanika nietknięta).
// Czas: wszystkie chwile w MILISEKUNDACH zegara efektów uszkodzeń (`cvTuning.FX_TIME_SCALE` × krok zegara prezentacji —
// zwolnione tempo wyłącznie prezentacji; pauza = pauza).

/**
 * Pokrętła — na żywo (`KOSMOS.threeRenderer.cvTuning.EXP_* / WRECK_* / DMG_* / FX_TIME_SCALE`, alias w `LIVE_CV_FX`); czytane przy
 * każdym planie i co klatkę. Rozmiary w DŁUGOŚCIACH KADŁUBA (Ls — długość rysowana statku, `vesselTargetSize`), czasy w ms zegara
 * efektów. Bez pinów na wartościach (F11) — keepery sprawdzają własności (proporcjonalność, kolejność, ograniczenia), nie liczby.
 */
export const EXP_TUNING = {
  FX_TIME_SCALE:        1,      // zwolnione tempo efektów uszkodzeń i wybuchów (1 = normalnie; 0,25 = 4 × wolniej); pauza i tak zatrzymuje
  // ── wybuch ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  EXP_FLASH_K:          1.5,    // [Ls] średnica błysku (rdzeń HDR ponad progiem bloomu)
  EXP_FLASH_MS:         80,     // czas błysku
  EXP_FLASH_CORE:       2.6,    // wzmocnienie HDR błysku (i smugi anamorficznej)
  EXP_STREAK_K:         2.4,    // [Ls] długość smugi anamorficznej (poziomej na ekranie)
  EXP_STREAK_ASPECT:    24,     // proporcja smugi (długość / grubość)
  EXP_STREAK_MS:        90,
  EXP_FIREBALL_K:       0.62,   // [Ls] promień największego płata kuli ognia u szczytu
  EXP_FIREBALL_MS:      560,    // życie płata (fregata; niszczyciel × 1,15, pancernik × 1,35)
  EXP_FIREBALL_CORE:    1.5,    // wzmocnienie HDR rdzenia płata (wyżej — biel po tone mappingu zamiast pomarańczu)
  EXP_LOBE_SPREAD:      0.36,   // [Ls] rozrzut środków płatów (asymetrycznie, z ziarna)
  EXP_RING_K:           1.3,    // [Ls] promień fali uderzeniowej u końca (płaszczyzna statku)
  EXP_RING_MS:          380,
  EXP_RING_CORE:        0.6,
  EXP_DEBRIS_SPEED:     2.4,    // [Ls / s] prędkość odłamków
  EXP_DEBRIS_MS:        2200,   // życie odłamka (× 0,7–1,3)
  EXP_DEBRIS_SIZE:      0.03,   // [Ls] rozmiar odłamka (promień bryłki przed rozciągnięciem); decyzja 42 (c) — 0,045 → 0,03 (kontrola łączna CV-5 + CV-4b)
  EXP_DEBRIS_HOT:       1.4,    // żar krawędzi odłamka na starcie (HDR), stygnie w pierwszych ~20 % życia
  EXP_EMBERS:           26,     // iskier żaru na wybuch główny przy budżecie High (Medium / Low — preset bez żaru)
  EXP_EMBER_SPEED:      3.2,    // [Ls / s]
  EXP_EMBER_MS:         1500,   // życie iskry (× 0,6–1,3)
  EXP_SMOKE_PUFFS:      6,      // kłębów dymu na wybuch główny (pancernik × 1,7)
  EXP_SMOKE_MS:         3000,   // życie kłębu (pancernik × 1,5 — długi ogon)
  EXP_SMOKE_K:          0.95,   // [Ls] rozmiar kłębu
  EXP_LIGHT_K:          0.035,  // jasność szczytowa światła puli (fregata; niszczyciel × 1,3, pancernik × 1,7; three r171: spadek 1 / max(d², 0,01))
  EXP_LIGHT_COLOR:      0xffb070, // barwa światła wybuchu
  EXP_LIGHT_RANGE_K:    12,     // [Ls] zasięg światła (oświetla sąsiadów)
  EXP_LIGHT_ATTACK_MS:  100,    // szczyt po tylu ms
  EXP_LIGHT_FADE_MS:    500,    // zgaszone po ATTACK + FADE (≈ 600 ms)
  EXP_SECONDARY_K:      0.45,   // wybuch wtórny × rozmiar głównego
  EXP_SEQ_DESTROYER_MS: 340,    // niszczyciel: wybuch główny tyle po wtórnym (chwila zniszczenia = wtórny)
  EXP_SEQ_BATTLESHIP_MS: 860,   // pancernik: wybuch główny tyle po pierwszym wtórnym
  // ── wrak ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  WRECK_COOL_S:         15,     // [s] szwy stygną do żaru resztkowego (10–20 s)
  WRECK_HEAT_FLOOR:     0.035,  // żar resztkowy (migające iskry)
  WRECK_BURN_GAIN:      2.2,    // wzmocnienie HDR szwów przy pełnym żarze (próg bloomu 1,0)
  WRECK_EMBER_GAIN:     1.1,    // wzmocnienie migających iskier zimnego kadłuba
  WRECK_SEAM_FREQ:      9.0,    // gęstość szwów (przestrzeń modelu — długość statku = 1)
  WRECK_FIRES:          2,      // pożarów na wraku (1–2; pancernik — wszystkie, fregata — jeden)
  WRECK_FIRE_S:         9,      // [s] pożar gaśnie po tylu sekundach (× 0,7–1,3)
  WRECK_DRIFT_ENV:      0.8,    // dryf wraku najwyżej × koperta klasy (D-CV-6: fregata 1 L, niszczyciel 0,7 L, pancernik 0,4 L)
  WRECK_DRIFT_PERIOD_S: 24,     // [s] okres dryfu
  WRECK_DRIFT_RAMP_S:   2.5,    // [s] dryf narasta od zera (bez skoku w chwili zniszczenia)
  WRECK_TUMBLE_DEG_S:   5,      // [°/s] obrót wraku (× 0,6–1,4)
  WRECK_CONVERGE_MS:    1200,   // zbieżność wraku do pozycji logicznej (koniec bitwy — Finding 627)
  // ── stany uszkodzeń (z HP pokazywanego) ──────────────────────────────────────────────────────────────────────────────
  DMG_SMOKE_AT:         0.75,   // ≤ 75 % HP — cienki dym
  DMG_FIRE_AT:          0.5,    // ≤ 50 % — ogień
  DMG_SPUTTER_AT:       0.25,   // ≤ 25 % — krztuszący się silnik (smuga przerywa, iskry)
  DMG_SMOKE_EVERY_MS:   170,    // co ile kłąb dymu z punktu uszkodzenia
  DMG_SMOKE_MS:         1900,
  DMG_SMOKE_K:          0.42,   // [Ls]
  DMG_FIRE_EVERY_MS:    110,    // co ile płomień
  DMG_FIRE_MS:          420,
  DMG_FIRE_K:           0.17,   // [Ls]
  DMG_FLAME_CORE:       0.9,    // wzmocnienie HDR rdzenia płomieni (stany uszkodzeń, pożary wraku) i iskier żaru
  DMG_SPARK_EVERY_MS:   300,    // krztuszenie: co ile seria iskier z dyszy
  DMG_SPUTTER_DROP:     0.12,   // jasność smugi w chwili zakrztuszenia
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const tune = (T, k) => (T && Number.isFinite(T[k]) ? T[k] : EXP_TUNING[k]);

/** Ziarno 32-bitowe z części (FNV-1a + wymieszanie) — deterministyczne, bez losowania. */
export function explosionSeed(...parts) {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= 0x7c; h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32 — generator z ziarna → liczby z [0, 1). */
export function expRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [0, 1) z ziarna i indeksu (bez stanu). */
export function seedUnit(seed, k) {
  let h = (seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Klasa wybuchu z klasy modelu (`vesselSizeClass`): kadłuby bojowe wprost, generyczne wg rozmiaru (jak choreografia). */
export function explosionClassOf(sizeClass) {
  if (sizeClass === 'frigate' || sizeClass === 'destroyer' || sizeClass === 'battleship') return sizeClass;
  const s = typeof sizeClass === 'string' ? sizeClass : '';
  if (s.startsWith('small')) return 'frigate';
  if (s.startsWith('large')) return 'battleship';
  return 'destroyer';
}

/** Rozmiar sygnału walki z klasy wybuchu (tabela `CombatCueData` — small / medium / large). */
export function explosionCueSize(cls) {
  return cls === 'frigate' ? 'small' : cls === 'battleship' ? 'large' : 'medium';
}

const CLASS = Object.freeze({
  frigate:    Object.freeze({ fire: 1.0,  life: 1.0,  lobes: 3, debris: 0.5,  smoke: 1.0, smokeLife: 1.0, ring: 1.0,  light: 1.0 }),
  destroyer:  Object.freeze({ fire: 1.12, life: 1.15, lobes: 4, debris: 0.75, smoke: 1.2, smokeLife: 1.2, ring: 1.12, light: 1.3 }),
  battleship: Object.freeze({ fire: 1.3,  life: 1.35, lobes: 6, debris: 1.0,  smoke: 1.7, smokeLife: 1.5, ring: 1.3,  light: 1.7 }),
});

/** Liczba wybuchów wtórnych: fregata 0, niszczyciel 1, pancernik 2–3 (z ziarna). */
export function secondaryCount(cls, seed) {
  if (cls === 'frigate') return 0;
  if (cls === 'destroyer') return 1;
  return seedUnit(seed >>> 0, 7) < 0.5 ? 2 : 3;
}

/**
 * Budżety efektów z ustawień presetu (`resolveGfxSettings` — odłamki, dym, żar, dym uszkodzeń, cząstki); brak ustawień
 * (flaga `cvPresets` OFF) — High.
 * @returns {{ debris:number, smoke:boolean, embers:boolean, dmgSmoke:boolean, dmgFire:boolean, particleScale:number }}
 */
export function explosionBudget(eff) {
  const e = eff ?? { debris: 24, smoke: true, embers: true, damageSmoke: 'on', particles: 16000 };
  const ds = e.damageSmoke ?? 'off';
  return {
    debris: Math.max(0, Math.floor(e.debris ?? 0)), smoke: e.smoke === true, embers: e.embers === true,
    dmgSmoke: ds === 'on', dmgFire: ds === 'on' || ds === 'fire', particleScale: clamp((e.particles ?? 16000) / 16000, 0, 1),
  };
}

/** Kierunek jednostkowy z dwóch liczb [0, 1) (równomiernie na sferze). */
function unitDir(u, v, out) {
  const z = 2 * u - 1, a = 2 * Math.PI * v, r = Math.sqrt(Math.max(0, 1 - z * z));
  out[0] = r * Math.cos(a); out[1] = z; out[2] = r * Math.sin(a);
  return out;
}

/** Jeden wybuch (główny albo wtórny) → wpisy w `out` (czasy od chwili zniszczenia). */
function blastSpawns(out, { at, Ls, seed, main, cls, budget, T, anchor }) {
  const C = CLASS[cls] ?? CLASS.destroyer;
  const rnd = expRng(seed);
  const k = main ? 1 : tune(T, 'EXP_SECONDARY_K');
  const s = Ls * k;                         // [WU] skala tego wybuchu
  const d = [0, 0, 0];
  out.push({ kind: 'flash', at, life: tune(T, 'EXP_FLASH_MS') * (main ? 1 : 0.8), size: tune(T, 'EXP_FLASH_K') * s, anchor, seed: seed ^ 1 });
  if (main) out.push({ kind: 'streak', at, life: tune(T, 'EXP_STREAK_MS'), size: tune(T, 'EXP_STREAK_K') * s, aspect: tune(T, 'EXP_STREAK_ASPECT'), anchor, seed: seed ^ 2 });
  const lobes = main ? C.lobes : 2;
  const spread = tune(T, 'EXP_LOBE_SPREAD') * s;
  const life0 = tune(T, 'EXP_FIREBALL_MS') * C.life * (main ? 1 : 0.7);
  // asymetria: środek ciężkości płatów przesunięty w stronę z ziarna
  unitDir(rnd(), rnd(), d);
  const bias = [d[0] * 0.5, d[1] * 0.5, d[2] * 0.5];
  for (let i = 0; i < lobes; i++) {
    unitDir(rnd(), rnd(), d);
    const r = i === 0 ? 0.15 * rnd() : (0.35 + 0.65 * rnd());
    const size = tune(T, 'EXP_FIREBALL_K') * s * C.fire * (i === 0 ? 1 : 0.5 + 0.4 * rnd());
    const lobeAt = at + (i === 0 ? 0 : 10 + 55 * rnd());
    const ox = (d[0] * r + bias[0]) * spread, oy = (d[1] * r + bias[1]) * spread * 0.8, oz = (d[2] * r + bias[2]) * spread;
    const v = 0.35 * s / 1000;               // [WU/ms] powolne rozchodzenie się płata
    out.push({ kind: 'lobe', at: lobeAt, life: life0 * (0.75 + 0.5 * rnd()), size, ox, oy, oz, vx: d[0] * v, vy: d[1] * v, vz: d[2] * v,
      anchor, seed: (seed + 101 * (i + 1)) >>> 0 });
  }
  if (main) out.push({ kind: 'ring', at: at + 15, life: tune(T, 'EXP_RING_MS'), size: tune(T, 'EXP_RING_K') * s * C.ring, anchor, seed: seed ^ 3 });
  if (budget.embers) {
    const n = Math.round(tune(T, 'EXP_EMBERS') * (main ? 1 : 0.3) * C.fire * budget.particleScale);
    const sp = tune(T, 'EXP_EMBER_SPEED') * s / 1000;
    for (let i = 0; i < n; i++) {
      unitDir(rnd(), rnd(), d);
      const v = sp * (0.35 + 0.8 * rnd());
      out.push({ kind: 'ember', at: at + 20 * rnd(), life: tune(T, 'EXP_EMBER_MS') * (0.6 + 0.7 * rnd()), size: 0.05 * s * (0.6 + 0.8 * rnd()),
        ox: d[0] * 0.2 * s, oy: d[1] * 0.2 * s, oz: d[2] * 0.2 * s, vx: d[0] * v, vy: d[1] * v, vz: d[2] * v, anchor, seed: (seed + 7 * i) >>> 0 });
    }
  }
  if (budget.smoke) {
    const n = main ? Math.max(1, Math.round(tune(T, 'EXP_SMOKE_PUFFS') * C.smoke)) : 1;
    const life = tune(T, 'EXP_SMOKE_MS') * C.smokeLife * (main ? 1 : 0.6);
    for (let i = 0; i < n; i++) {
      unitDir(rnd(), rnd(), d);
      const r = 0.25 + 0.5 * rnd();
      const v = 0.18 * s / 1000 * (0.5 + rnd());
      out.push({ kind: 'smoke', at: at + 90 + 160 * rnd(), life: life * (0.8 + 0.4 * rnd()), size: tune(T, 'EXP_SMOKE_K') * s * (0.75 + 0.5 * rnd()),
        ox: d[0] * r * spread, oy: d[1] * r * spread * 0.7, oz: d[2] * r * spread, vx: d[0] * v, vy: d[1] * v, vz: d[2] * v, lit: 1, anchor,
        seed: (seed + 31 * (i + 1)) >>> 0 });
    }
  }
  if (main && budget.debris > 0) {
    const n = Math.max(0, Math.min(budget.debris, Math.round(budget.debris * C.debris)));
    const sp = tune(T, 'EXP_DEBRIS_SPEED') * s / 1000;
    for (let i = 0; i < n; i++) {
      unitDir(rnd(), rnd(), d);
      const v = sp * (0.4 + 0.6 * rnd());
      const ax = [0, 0, 0];
      unitDir(rnd(), rnd(), ax);
      out.push({ kind: 'debris', at: at + 10 * rnd(), life: tune(T, 'EXP_DEBRIS_MS') * (0.7 + 0.6 * rnd()), size: tune(T, 'EXP_DEBRIS_SIZE') * s * (0.6 + 0.8 * rnd()),
        ox: d[0] * 0.15 * s, oy: d[1] * 0.15 * s, oz: d[2] * 0.15 * s, vx: d[0] * v, vy: d[1] * v, vz: d[2] * v,
        axis: ax, spin: (1.5 + 4 * rnd()) * (rnd() < 0.5 ? -1 : 1) / 1000, stretch: [0.6 + 0.9 * rnd(), 0.5 + 0.6 * rnd(), 0.8 + 1.2 * rnd()],
        shade: 0.75 + 0.5 * rnd(), anchor, seed: (seed + 13 * i) >>> 0 });
    }
  }
  if (main) {
    out.push({ kind: 'light', at, peak: tune(T, 'EXP_LIGHT_K') * C.light, range: tune(T, 'EXP_LIGHT_RANGE_K') * Ls,
      attack: tune(T, 'EXP_LIGHT_ATTACK_MS'), fade: tune(T, 'EXP_LIGHT_FADE_MS'), anchor });
  }
  out.push({ kind: 'cue', at, size: main ? explosionCueSize(cls) : 'small', anchor });
}

/**
 * Plan śmierci okrętu: wybuchy wtórne (punkty uszkodzeń kadłuba — `anchor` = indeks punktu 0–2) i główny (`anchor` = 'centre').
 * Czasy względem chwili zniszczenia (trafienie zabijające rejestru salw), rozmiary z `lengthWU` (długość rysowana kadłuba, bez
 * podłogi). Deterministyczny: ten sam (klasa, długość, ziarno, budżet) ⇒ ten sam plan.
 * @param {{ cls:string, lengthWU:number, seed:number, budget?:object, tuning?:object }} p
 * @returns {{ cls:string, lengthWU:number, mainAt:number, endMs:number, secondaries:Array<{at:number, point:number}>, spawns:object[] }}
 */
export function explosionPlan({ cls = 'destroyer', lengthWU, seed = 0, budget = null, tuning = null } = {}) {
  const T = tuning ?? EXP_TUNING;
  const c = CLASS[cls] ? cls : 'destroyer';
  const Ls = Number.isFinite(lengthWU) && lengthWU > 0 ? lengthWU : 0;
  const B = budget ?? explosionBudget(null);
  const n2 = secondaryCount(c, seed);
  const secondaries = [];
  let mainAt = 0;
  if (c === 'destroyer') {
    secondaries.push({ at: 0, point: (seed >>> 3) % 3 });
    mainAt = tune(T, 'EXP_SEQ_DESTROYER_MS');
  } else if (c === 'battleship') {
    const span = tune(T, 'EXP_SEQ_BATTLESHIP_MS');
    for (let i = 0; i < n2; i++) {
      const at = i === 0 ? 0 : span * 0.82 * (i / n2) + span * 0.08 * seedUnit(seed, 20 + i);
      secondaries.push({ at, point: i % 3 });
    }
    mainAt = span;
  }
  const spawns = [];
  secondaries.forEach((s2, i) => blastSpawns(spawns, { at: s2.at, Ls, seed: (seed + 977 * (i + 1)) >>> 0, main: false, cls: c, budget: B, T, anchor: s2.point }));
  blastSpawns(spawns, { at: mainAt, Ls, seed, main: true, cls: c, budget: B, T, anchor: 'centre' });
  spawns.sort((a, b) => a.at - b.at);   // renderer wypuszcza wpisy po kolei w ich chwili (sortowanie stabilne)
  let endMs = 0;
  for (const s of spawns) endMs = Math.max(endMs, s.at + (s.life ?? (s.attack ?? 0) + (s.fade ?? 0)));
  return { cls: c, lengthWU: Ls, mainAt, endMs, secondaries, spawns };
}

/**
 * Stan uszkodzeń z ułamka HP POKAZYWANEGO (0–1). Poziomy: 0 brak · 1 dym · 2 ogień (+ dym) · 3 krztuszący się silnik (+ ogień,
 * + dym) — dym ⊂ ogień ⊂ krztuszenie z konstrukcji; poziom nie maleje, gdy HP maleje.
 * @returns {{ level:0|1|2|3, smoke:boolean, fire:boolean, sputter:boolean }}
 */
export function damageStateOf(frac, tuning = null) {
  const T = tuning ?? EXP_TUNING;
  const f = Number.isFinite(frac) ? frac : 1;
  const level = f <= tune(T, 'DMG_SPUTTER_AT') ? 3 : f <= tune(T, 'DMG_FIRE_AT') ? 2 : f <= tune(T, 'DMG_SMOKE_AT') ? 1 : 0;
  return { level, smoke: level >= 1, fire: level >= 2, sputter: level >= 3 };
}

/**
 * Żar wraku po `tMs` od zniszczenia: 1 w chwili zniszczenia, nierosnący, do żaru resztkowego `WRECK_HEAT_FLOOR` po `WRECK_COOL_S`.
 * Pauza = pauza (wejście na zegarze efektów).
 */
export function wreckHeatAt(tMs, tuning = null) {
  const T = tuning ?? EXP_TUNING;
  const floor = clamp(tune(T, 'WRECK_HEAT_FLOOR'), 0, 1);
  const cool = Math.max(1, tune(T, 'WRECK_COOL_S') * 1000);
  const t = clamp((Number.isFinite(tMs) ? tMs : cool) / cool, 0, 1);
  const e3 = Math.exp(-3);
  const fall = (Math.exp(-3 * t) - e3) / (1 - e3);   // szybko na początku, dokładnie 0 przy WRECK_COOL_S
  return floor + (1 - floor) * fall;
}

/** Barwa żaru (liniowe rgb, bez wzmocnienia): gorący — żółtopomarańczowy, stygnący — ciemna czerwień. */
export function wreckBurnColor(heat, out = [0, 0, 0]) {
  const h = clamp(heat, 0, 1);
  // 0 → (0,45 0,05 0,01) · 0,5 → (0,95 0,25 0,04) · 1 → (1,0 0,58 0,20)
  if (h < 0.5) { const u = h / 0.5; out[0] = 0.45 + 0.5 * u; out[1] = 0.05 + 0.2 * u; out[2] = 0.01 + 0.03 * u; }
  else { const u = (h - 0.5) / 0.5; out[0] = 0.95 + 0.05 * u; out[1] = 0.25 + 0.33 * u; out[2] = 0.04 + 0.16 * u; }
  return out;
}

/** Okno pożaru `i` na wraku [ms od zniszczenia]: start i koniec (gaśnie). Liczba pożarów: fregata 1, reszta `WRECK_FIRES`. */
export function wreckFireWindow(i, cls, seed, tuning = null) {
  const T = tuning ?? EXP_TUNING;
  const n = cls === 'frigate' ? Math.min(1, tune(T, 'WRECK_FIRES')) : Math.max(0, Math.floor(tune(T, 'WRECK_FIRES')));
  if (i >= n) return null;
  const start = 150 + 450 * seedUnit(seed, 40 + i);
  const end = start + tune(T, 'WRECK_FIRE_S') * 1000 * (0.7 + 0.6 * seedUnit(seed, 50 + i));
  return { start, end };
}

/**
 * Dryf i obrót wraku na scenie: przesunięcie w kopercie klasy (najwyżej `WRECK_DRIFT_ENV` × koperta), od zera w chwili zniszczenia
 * (narasta przez `WRECK_DRIFT_RAMP_S`), deterministyczne z ziarna statku; obrót wokół osi z ziarna, `WRECK_TUMBLE_DEG_S` × 0,6–1,4.
 * @param {{ seed:number, tMs:number, envWU:number, tuning?:object }} p
 * @returns {{ x:number, y:number, z:number, ax:number, ay:number, az:number, angle:number }}
 */
export function wreckDrift({ seed = 0, tMs = 0, envWU = 0, tuning = null } = {}) {
  const T = tuning ?? EXP_TUNING;
  const t = Math.max(0, Number.isFinite(tMs) ? tMs : 0) / 1000;
  const A = Math.max(0, envWU) * clamp(tune(T, 'WRECK_DRIFT_ENV'), 0, 1);
  const w = 2 * Math.PI / Math.max(1, tune(T, 'WRECK_DRIFT_PERIOD_S'));
  const ramp = 1 - Math.exp(-t / Math.max(0.05, tune(T, 'WRECK_DRIFT_RAMP_S')));
  const ph = (k) => 2 * Math.PI * seedUnit(seed, k);
  // każda oś: 0,6·sin + 0,4·sin(1,7·) — |składowa| ≤ 1; wektor przeskalowany przez 1 / √3 ⇒ |d| ≤ A
  const comp = (k) => 0.6 * (Math.sin(w * t + ph(k)) - Math.sin(ph(k))) / 2 + 0.4 * (Math.sin(1.7 * w * t + ph(k + 3)) - Math.sin(ph(k + 3))) / 2;
  const s = A * ramp / Math.sqrt(3);
  const x = comp(1) * s, y = comp(2) * s * 0.6, z = comp(3) * s;
  const ax0 = seedUnit(seed, 10) * 2 - 1, ay0 = seedUnit(seed, 11) * 2 - 1, az0 = seedUnit(seed, 12) * 2 - 1;
  const al = Math.hypot(ax0, ay0, az0) || 1;
  const rate = tune(T, 'WRECK_TUMBLE_DEG_S') * (0.6 + 0.8 * seedUnit(seed, 13)) * Math.PI / 180;
  return { x, y, z, ax: ax0 / al, ay: ay0 / al, az: az0 / al, angle: rate * t };
}

/** Zbieżność wraku do pozycji logicznej: punkt między `from` i `to` po `tMs` z `durMs` (wygładzone), `done` po końcu. */
export function wreckConverge(from, to, tMs, durMs) {
  const u = clamp((Number.isFinite(tMs) ? tMs : 0) / Math.max(1, durMs), 0, 1);
  const e = u * u * (3 - 2 * u);
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: from.z + (to.z - from.z) * e, done: u >= 1 };
}

/**
 * Bramka krztuszenia silnika [0, 1] w chwili `tMs` (zegar efektów): przeważnie 1, krótkie zakrztuszenia (szczeliny 140 ms, w ok. 35 %
 * z nich jasność spada do `DMG_SPUTTER_DROP`) — deterministycznie z ziarna statku.
 */
export function sputterGate(tMs, seed, tuning = null) {
  const T = tuning ?? EXP_TUNING;
  const slot = Math.floor(Math.max(0, tMs) / 140);
  return seedUnit((seed ^ 0x5bd1e995) >>> 0, slot) < 0.35 ? tune(T, 'DMG_SPUTTER_DROP') : 1;
}

/**
 * Chwile siatki emitera w przedziale (t0, t1]: emisje co `every` ms z fazą z ziarna. Zwraca pierwszą chwilę i liczbę (bez tablic —
 * renderer iteruje: `first + i × every`).
 */
export function emitterTicks(t0, t1, every, phase = 0) {
  const e = Math.max(1, every);
  if (!(t1 > t0)) return { first: 0, count: 0 };
  const k0 = Math.floor((t0 - phase) / e) + 1;
  const k1 = Math.floor((t1 - phase) / e);
  const count = Math.max(0, k1 - k0 + 1);
  return { first: phase + k0 * e, count };
}

/**
 * Trzy punkty uszkodzeń na kadłubie (przód, środek, tył) z wierzchołków siatki w ZNORMALIZOWANEJ przestrzeni modelu (płaska tablica
 * x, y, z — długość statku = 1), osi dziobu i góry z pliku hardpointów. Wierzchołek najbliżej celu wzdłuż dziobu (+0,24 / 0 / −0,26),
 * z przewagą grzbietu i burty z ziarna (lewa / prawa na zmianę). Deterministyczne. Brak wierzchołków — punkty na osi.
 * @param {Float32Array|number[]} verts
 * @param {{ bow?: number[], up?: number[] }} frame
 * @param {number} seed
 * @returns {number[][]} [[x, y, z] × 3]
 */
export function damagePointsFromVertices(verts, frame, seed = 0) {
  const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const bow = nrm(frame?.bow ?? [-1, 0, 0]);
  let up = frame?.up ?? [0, 1, 0];
  const dd = up[0] * bow[0] + up[1] * bow[1] + up[2] * bow[2];
  up = nrm([up[0] - dd * bow[0], up[1] - dd * bow[1], up[2] - dd * bow[2]]);
  const side = [up[1] * bow[2] - up[2] * bow[1], up[2] * bow[0] - up[0] * bow[2], up[0] * bow[1] - up[1] * bow[0]];
  const targets = [0.24, 0.0, -0.26];
  const sideSign = seedUnit(seed, 1) < 0.5 ? 1 : -1;
  const out = targets.map((tb) => [bow[0] * tb, bow[1] * tb, bow[2] * tb]);
  const best = [-Infinity, -Infinity, -Infinity];
  const n = verts ? Math.floor(verts.length / 3) : 0;
  for (let i = 0; i < n; i++) {
    const x = verts[3 * i], y = verts[3 * i + 1], z = verts[3 * i + 2];
    const pb = x * bow[0] + y * bow[1] + z * bow[2];
    const pu = x * up[0] + y * up[1] + z * up[2];
    const ps = x * side[0] + y * side[1] + z * side[2];
    for (let k = 0; k < 3; k++) {
      const da = Math.abs(pb - targets[k]);
      if (da > 0.08) continue;
      const sg = k === 1 ? -sideSign : sideSign;
      const score = 0.55 * pu + 0.45 * sg * ps - 2.0 * da;
      if (score > best[k]) { best[k] = score; out[k] = [x, y, z]; }
    }
  }
  return out.map((p) => p.map((v) => Math.round(v * 1e4) / 1e4));
}
