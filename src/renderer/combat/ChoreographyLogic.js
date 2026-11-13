// ChoreographyLogic — CHOREOGRAFIA W KOPERCIE (ARC COMBAT VISUALS, krok CV-3b; F4, D-CV-6, D-CV-7; Findingi 622, 631, 681;
// flaga `cvChoreo`).
//
// ⚠ ZERO IMPORTÓW. Czysta matematyka — wykonuje się pod node, więc keeper sprawdza WYKONANIEM: determinizm (to samo
//   ziarno ⇒ ta sama poza, inne starcie ⇒ inne fazy), niezmiennik pasm D-CV-6 w czasie, kopertę klasy, zamrożenie przy
//   stojącym zegarze i ciągłość ruchu (wzór StageMotionLogic / BattleStageLogic).
//
// Co robi. Scena bitwy (`BattleStageLogic` + `StageMotionLogic`, CV-3a / CV-6b) daje każdemu statkowi KOTWICĘ — pozycję
// rysowaną z prawa sceny, płynącą z rundy na rundę. Choreografia dokłada do kotwicy małe przesunięcie (koperta klasy:
// fregata 1,0 L, niszczyciel 0,7 L, pancernik 0,4 L — D-CV-6), kurs (dziób ku celowi, pancernik burtą) z ograniczoną
// prędkością skrętu i przechyłem, oraz jasność silnika. Postawa z doktryny (D-CV-7): wyłącznie styl ruchu i ustawienie —
// nigdy udawana odległość (Finding 631: doktryny prawie nie istnieją mechanicznie).
//
// NIEZMIENNIK PASM (D-CV-6, §3.1-2). Choreografia nigdy nie przenosi PARY do innego pasma odległości na scenie (krawędzie
// G(zasięg): laser 3,64 L, kinetyk 8,31 L, rakiety 14,0 L) niż pasmo odstępu kotwic — ani pary strzelec → cel, ani żadnej
// innej. Pomiar przed kodem: prowadnica sceny trzyma pary laserowe strzelec → cel tuż pod sufitem pasma (3,494 L wobec
// krawędzi 3,64 L — przedział twardy z marginesem 4 %), więc koperta 1 L dodana bez kontroli przenosiłaby te pary w pasmo
// kinetyka. Dlatego po wzorze ruchu biegnie RZUT (`constrainChoreo`): każda para ma przedział odstępu wokół odstępu kotwic
// (w paśmie kotwic, z marginesem `EDGE_EPS_L`, i nie bliżej niż podłoga kolizji 1,5 L), kilka przejść Gaussa–Seidla
// przesuwa statki wzdłuż osi par, kontrola sprawdza KAŻDĄ parę, a gdy coś zostaje — przesunięcia winnych maleją do zera
// (zero przesunięć = kotwice, które pasmo spełniają z konstrukcji). Ruch jest w większości STYCZNY do celu (łuk wokół celu
// trzyma odstęp do niego dokładnie), więc rzut rzadko ma co robić.
// CIĄGŁOŚĆ. Przedział pary zwęża się do zera, gdy odstęp kotwic dochodzi do krawędzi pasma (współczynnik `CROSS_K`) — w chwili,
// gdy kotwica przechodzi przez krawędź (para zmienia pasmo z rundy na rundę), przedziały po obu stronach spotykają się w jednym
// punkcie, więc rzut nie skacze. Wzór ruchu zależy od czasu choreografii (zegar prezentacji — pauza = pauza, bez nadrabiania)
// i od wygładzonego kierunku zagrożenia (zmiana celu obraca ramę ruchu z ograniczoną prędkością), więc przesunięcie jest ciągłe.
//
// Jednostki: [j.] — jednostki świata 3D (1 AU = 11 j.); [L] — długość fregaty (podaje wołający, 0,016 j.); czasy [ms]
// (zegar prezentacji); kąty [rad] (pokrętła w stopniach — opisane przy kluczu).

/**
 * Pokrętła choreografii — żyją w `cvTuning` (renderer: `KOSMOS.threeRenderer.cvTuning.CHOREO_*`, czytane CO KLATKĘ).
 * Strojenie, bez pinów (F11).
 */
export const CHOREO_TUNING = Object.freeze({
  CHOREO_ENV_FRIGATE:      1.0,   // [L] koperta fregaty (D-CV-6)
  CHOREO_ENV_DESTROYER:    0.7,   // [L] koperta niszczyciela
  CHOREO_ENV_BATTLESHIP:   0.4,   // [L] koperta pancernika
  CHOREO_PERIOD_FRIGATE:   7.5,   // [s] okres przelotu fregaty (prędkość kątowa wzoru = 2π / okres)
  CHOREO_PERIOD_DESTROYER: 12,    // [s] okres łuku niszczyciela
  CHOREO_PERIOD_BATTLESHIP: 20,   // [s] okres dryfu pancernika
  // Skręt i spokój — strojenie właściciela po kontroli CV-3b 2026-11-11 („zwrot trochę wolny”): 180 / 90 / 30 °/s i 2 L/s
  // (było 120 / 60 / 20 °/s i 0,8 L/s). Odniesienia przechyłu i silnika (`CHOREO_CLASS.turnRef`) zostają — ten obraz oglądał.
  CHOREO_TURN_FRIGATE:     180,   // [°/s] największa prędkość skrętu fregaty
  CHOREO_TURN_DESTROYER:   90,    // [°/s] niszczyciela
  CHOREO_TURN_BATTLESHIP:  30,    // [°/s] pancernika (wolny zwrot burtą)
  CHOREO_VERT:             0.6,   // [L] największe przesunięcie w pionie (scena 3D, nie płaska warstwa)
  CHOREO_PLUME_GAIN:       1.0,   // mnożnik jasności silnika w walce
  CHOREO_BANK:             1.0,   // mnożnik przechyłu w skręcie i w przelocie
  CHOREO_CALM_V:           2.0,   // [L/s] prędkość kotwicy, przy której amplituda wzoru spada do połowy (szyk się przestawia —
                                  //   statki nie tańczą); większa — więcej tańca w trakcie podchodzenia do zasięgu
  CHOREO_CALM_AHEAD:       300,   // [ms] spokój wyprzedza przyspieszenie kotwicy: renderer podaje największą prędkość z planu ruchu
                                  //   rundy (odcinek sceny) w tym oknie — przesunięcia gasną, ZANIM szyk ruszy (0 — bez wyprzedzenia)
});

/** Stałe choreografii (nie strojenie — kształt rzutu i wygładzeń). */
export const CHOREO = Object.freeze({
  EDGE_EPS_L:     0.02,   // [L] margines od krawędzi pasma (para nigdy nie dochodzi do krawędzi)
  CROSS_K:        4,      // przedział pary w stronę DALSZEJ krawędzi ≤ CROSS_K × odległość od BLIŻSZEJ — ciągłość przy przejściu kotwicy przez krawędź
  COLLISION_L:    1.5,    // [L] podłoga kolizji każdej pary (D-CV-6); para kotwic bliżej — nie bliżej niż kotwice
  PASSES:         32,     // najwięcej przejść rzutu na klatkę (≤ 190 par przy 10 na 10; koniec wcześniej, gdy nic się nie rusza)
  WARM_DECAY:     0.9,    // ciepły start rzutu: poprawka z poprzedniej klatki × to
  SOR:            1.5,    // nadrelaksacja kroku pary (1 — dokładnie na krawędź przedziału)
  FALLBACK_HALVINGS: 6,   // połowienia przesunięć winnych par, zanim spadną do zera
  FRAME_RATE_DEG: 90,     // [°/s] największy obrót ramy ruchu (zmiana celu nie przestawia wzoru skokiem)
  // Drugi stopień ramy ruchu (pomiar na żywym silniku: sam sufit 90 °/s ruszał obrót od razu z pełną prędkością — przy zmianie
  // celu prędkość przesunięcia skakała o |o| × ω, do 1,65 L/s na granicy rundy). Rama idzie wygładzeniem pierwszego rzędu za
  // kierunkiem obracanym z sufitem ⇒ prędkość obrotu narasta od zera (ruch ciągły z prędkością — C1). Wagi postawy tak samo:
  // dwa stopnie po τ/2.
  FRAME_TAU_MS:   150,    // [ms] drugi stopień ramy ruchu
  POSTURE_TAU_MS: 700,    // [ms] wygładzenie wag postawy (zmiana doktryny / odwrót — bez skoku amplitudy)
  ENGINE_TAU_MS:  300,    // [ms] wygładzenie jasności silnika
  ROLL_TAU_MS:    450,    // [ms] wygładzenie przechyłu
  ROLL_MAX:       0.45,   // [rad] największy przechył (≈ 26°)
  PITCH_MAX:      0.6,    // [rad] największe pochylenie dziobu ku celowi (≈ 34°)
  DISABLED_TAU_MS: 1200,  // [ms] statek zniszczony w trakcie bitwy (hp ≤ 0): przesunięcie gaśnie, silnik gaśnie
  BROADSIDE_SWITCH: 0.6,  // [rad] pancernik zmienia burtę tylko, gdy druga jest bliżej o tyle (histereza)
  // Spokój przy szybkiej kotwicy (pomiar na żywym silniku przed tą regułą: przy wejściu w scenę i przejściu pary między pasmami
  // kotwice jadą 3–7 L/s, a rzut pasm musiał przeciągać przesunięcia do 7 L/s — szarpanie na wierzchu przestawiania szyku).
  // Amplituda wzoru × 1 / (1 + (v / CHOREO_CALM_V)²), v — wygładzona prędkość kotwicy [L/s]: szyk stoi — taniec, szyk się przestawia —
  // statki nie tańczą (przesunięcie ciągłe — wygładzenie CALM_TAU_MS).
  CALM_V_TAU_MS:  150,    // [ms] wygładzenie prędkości kotwicy (próg — pokrętło `CHOREO_CALM_V`)
  CALM_TAU_MS:    300,    // [ms] wygładzenie samego współczynnika spokoju (skok prędkości kotwicy nie skacze przesunięciem)
});

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const ZERO = Object.freeze({ x: 0, y: 0, z: 0 });

/**
 * Profile klas (kształt ruchu — ułamki koperty; okres, koperta i skręt z pokręteł).
 * lat — amplituda boczna (styczna do celu); vert — pionowa; vh — harmoniczna pionu (2 — ósemka, 1 — elipsa);
 * radIn — zbliżenie w przelocie (postawa „angażuj”); radOut — odejście (postawa „kite”); crab — wyprzedzenie dziobu w stronę
 * ruchu bocznego [°]; broadside — burtą do celu; idle / speedGain — silnik: jałowy i zależny od prędkości choreografii.
 */
export const CHOREO_CLASS = Object.freeze({
  frigate:    Object.freeze({ lat: 0.72, vert: 0.45, vh: 2, radIn: 0.30, radOut: 0.60, crab: 16, broadside: false, idle: 0.30, speedGain: 0.70, turnRef: 120 }),
  destroyer:  Object.freeze({ lat: 0.78, vert: 0.35, vh: 1, radIn: 0.18, radOut: 0.55, crab: 8,  broadside: false, idle: 0.25, speedGain: 0.55, turnRef: 60 }),
  battleship: Object.freeze({ lat: 0.55, vert: 0.25, vh: 1, radIn: 0.08, radOut: 0.40, crab: 0,  broadside: true,  idle: 0.14, speedGain: 0.35, turnRef: 20 }),
});

/**
 * Postawy (D-CV-7 — ustawienie i styl ruchu, nie odległość): amp — amplituda wzoru; lat — udział ruchu bocznego; radIn /
 * radOut — zbliżenie w przelocie / odejście ku zewnętrznej krawędzi koperty; plume — mnożnik silnika.
 */
export const CHOREO_POSTURE = Object.freeze({
  engage:   Object.freeze({ amp: 1.00, lat: 1.0, radIn: 1, radOut: 0, plume: 1.00 }),
  kite:     Object.freeze({ amp: 0.85, lat: 0.8, radIn: 0, radOut: 1, plume: 0.75 }),
  hold:     Object.freeze({ amp: 0.22, lat: 0.0, radIn: 0, radOut: 0, plume: 0.40 }),
  retreat:  Object.freeze({ amp: 0.45, lat: 0.3, radIn: 0, radOut: 1, plume: 1.00 }),
  disabled: Object.freeze({ amp: 0.00, lat: 0.0, radIn: 0, radOut: 0, plume: 0.00 }),
});

const tune = (T, k) => { const v = T?.[k]; return Number.isFinite(v) ? v : CHOREO_TUNING[k]; };
const CLS_KEY = Object.freeze({ frigate: 'FRIGATE', destroyer: 'DESTROYER', battleship: 'BATTLESHIP' });

/** Koperta klasy [j.] (pokrętło × długość fregaty). */
export function choreoEnvelope(cls, L, T = CHOREO_TUNING) {
  return Math.max(0, tune(T, `CHOREO_ENV_${CLS_KEY[cls] ?? 'DESTROYER'}`)) * L;
}

/** Klasa choreografii z klasy modelu (`vesselSizeClass`): kadłuby bojowe wprost, generyczne wg rozmiaru. */
export function choreoClassOf(sizeClass) {
  if (sizeClass === 'frigate' || sizeClass === 'destroyer' || sizeClass === 'battleship') return sizeClass;
  if (typeof sizeClass === 'string') {
    if (sizeClass.startsWith('small')) return 'frigate';
    if (sizeClass.startsWith('large')) return 'battleship';
  }
  return 'destroyer';
}

/**
 * Postawa z doktryny i stanu (D-CV-7). Kolejność: zniszczony (hp ≤ 0) → odwrót (znacznik `_retreatFromCombat` /
 * `retreatFromBattleId`) → `hold_position` → `kite` (doktryna albo `preferMaxRange` rozkazu „Zaangażuj”) → „angażuj”
 * (`engage_in_range`, `retreat_at_50` przed progiem, AI bez floty).
 */
export function postureOf({ alive = true, retreating = false, doctrine = null, preferMaxRange = false } = {}) {
  if (!alive) return 'disabled';
  if (retreating) return 'retreat';
  if (doctrine === 'hold_position') return 'hold';
  if (doctrine === 'kite' || preferMaxRange === true) return 'kite';
  return 'engage';
}

/** Ziarno choreografii statku (D-CV-6 / F4 — deterministyczne z id starcia i id statku): FNV-1a + mieszanie murmur3. */
export function choreoSeed(encounterId, vesselId) {
  const s = `${encounterId ?? ''}|${vesselId ?? ''}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

/** [0, 1) deterministycznie z ziarna i indeksu (bez `Math.random` — reguła §2.12-1). */
export function seedUnit(seed, k) {
  let h = (seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Cel do zwrotu dziobem: (1) cel strzału z ostatniej rundy, (2) pamiętany cel, (3) cel rozkazu „Zaangażuj”, (4) najbliższy
 * żywy przeciwnik (kotwice; remis — mniejsze id); żywy = hp > 0 w starciu. Brak żywych — środek wszystkich przeciwników
 * (także zniszczonych — rysowanych do końca starcia), id `null`. Brak przeciwników — `null`.
 * @param {{ anchor:{x,y,z}, prevTargetId?:string|null, eventTargetId?:string|null, engageTargetId?:string|null,
 *           enemies:Array<{id:string, alive:boolean, x:number, y:number, z:number}> }} o
 * @returns {{ id:string|null, point:{x,y,z} }|null}
 */
export function pickFacingTarget({ anchor, prevTargetId = null, eventTargetId = null, engageTargetId = null, enemies = [] }) {
  if (!enemies.length) return null;
  const byId = new Map();
  for (const e of enemies) byId.set(e.id, e);
  for (const id of [eventTargetId, prevTargetId, engageTargetId]) {
    const e = id != null ? byId.get(id) : null;
    if (e?.alive) return { id: e.id, point: { x: e.x, y: e.y, z: e.z } };
  }
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - anchor.x, e.y - anchor.y, e.z - anchor.z);
    if (d < bestD - 1e-12 || (Math.abs(d - bestD) <= 1e-12 && String(e.id) < String(best.id))) { bestD = d; best = e; }
  }
  if (best) return { id: best.id, point: { x: best.x, y: best.y, z: best.z } };
  let cx = 0, cy = 0, cz = 0;
  for (const e of enemies) { cx += e.x; cy += e.y; cz += e.z; }
  return { id: null, point: { x: cx / enemies.length, y: cy / enemies.length, z: cz / enemies.length } };
}

/**
 * Stan choreografii jednego statku (fazy z ziarna; reszta wypełnia się w krokach).
 * @param {number} seed — `choreoSeed(idStarcia, idStatku)`
 * @param {'frigate'|'destroyer'|'battleship'} cls
 */
export function createChoreo(seed, cls) {
  const c = CHOREO_CLASS[cls] ? cls : 'destroyer';
  return {
    seed: seed >>> 0, cls: c,
    t: 0,                                   // [ms] czas choreografii (zegar prezentacji od wejścia statku)
    ph1: seedUnit(seed, 1) * TAU,           // faza ruchu bocznego
    ph2: seedUnit(seed, 2) * TAU,           // faza pionu
    ph3: seedUnit(seed, 3) * TAU,           // faza oddechu odejścia (kite)
    sense: seedUnit(seed, 4) < 0.5 ? -1 : 1,  // kierunek pierwszego przelotu
    perK: 0.9 + 0.2 * seedUnit(seed, 5),    // rozrzut okresu ±10 % (statki tej samej klasy nie tańczą unisono)
    u: null,                                // wygładzony kierunek zagrożenia (rama ruchu; drugi stopień)
    u1: null,                               // kierunek pośredni (obrót z sufitem FRAME_RATE_DEG; pierwszy stopień)
    gap: null,                              // [j.] wygładzony odstęp do punktu zagrożenia
    w: { amp: 0, lat: 0, radIn: 0, radOut: 0, plume: 0 },   // wygładzone wagi postawy (start 0 — wejście bez skoku)
    w1: { amp: 0, lat: 0, radIn: 0, radOut: 0, plume: 0 },  // wagi pośrednie (pierwszy stopień; wagi ciągłe z prędkością)
    latAcc: { x: 0, y: 0, z: 0 },           // [j./ms²] przyspieszenie boczne wzoru (przechył)
    latVel: { x: 0, y: 0, z: 0 },           // [j./ms] prędkość boczna wzoru (wyprzedzenie dziobu)
    latVPeak: 0, latAPeak: 0,               // szczyty prędkości / przyspieszenia bocznego wzoru (odniesienia)
    speed: 0,                               // [j./ms] prędkość przesunięcia (silnik)
    off: { x: 0, y: 0, z: 0 },              // ostatnie przesunięcie po kopercie (przed rzutem)
    vA: 0,                                  // [L/s] wygładzona prędkość kotwicy (spokój przy przestawianiu szyku)
    calm: 1,                                // wygładzony współczynnik spokoju (1 — szyk stoi)
    yaw: null, pitch: 0, roll: 0, yawRate: 0, pitchRate: 0,   // kurs [rad], prędkości [rad/ms]
    side: 0,                                // pancernik: burta (−1 lewa / +1 prawa do celu; 0 — jeszcze niewybrana)
    engine: 0,                              // wygładzona jasność silnika (0..1)
    targetId: null,                         // pamiętany cel zwrotu
  };
}

const W_KEYS = Object.freeze(['amp', 'lat', 'radIn', 'radOut', 'plume']);

// ── wektory ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const len = (v) => Math.hypot(v.x, v.y, v.z);
function norm(v, fb = null) {
  const l = len(v);
  if (!(l > 1e-12)) return fb ? { x: fb.x, y: fb.y, z: fb.z } : { x: 0, y: 0, z: 1 };
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

/** Obrót wektora jednostkowego `a` ku `b` o co najwyżej `maxAng` [rad] (po łuku wielkiego koła). */
export function rotateToward(a, b, maxAng) {
  const c = Math.max(-1, Math.min(1, dot(a, b)));
  const ang = Math.acos(c);
  if (!(ang > 1e-9) || ang <= maxAng) return { x: b.x, y: b.y, z: b.z };
  // oś obrotu prostopadła; przy przeciwnych wektorach — dowolna pozioma
  let ax = cross(a, b);
  if (!(len(ax) > 1e-9)) ax = Math.abs(a.y) < 0.9 ? cross(a, { x: 0, y: 1, z: 0 }) : cross(a, { x: 1, y: 0, z: 0 });
  ax = norm(ax);
  const s = Math.sin(maxAng), k = Math.cos(maxAng);
  const t = cross(ax, a);
  return norm({ x: a.x * k + t.x * s, y: a.y * k + t.y * s, z: a.z * k + t.z * s });
}

/** Rama ruchu: u (ku zagrożeniu), s (bok, poziomy), v (≈ góra). */
function frameOf(u) {
  let s = { x: u.z, y: 0, z: -u.x };   // Y × u
  if (!(len(s) > 1e-6)) s = { x: 1, y: 0, z: 0 };
  s = norm(s);
  const v = cross(u, s);
  return { u, s, v };
}

/**
 * KROK RUCHU (przed rzutem pasm): przesunięcie statku względem kotwicy [j.] na tę klatkę.
 * Wzór: przelot boczny (sinus, okres klasy) + pion (fregata ósemka, reszta elipsa) po ŁUKU wokół punktu zagrożenia w odstępie
 * `gap` (odstęp do celu trzymany dokładnie przez ruch własny) + składowa promieniowa postawy (zbliżenie w przelocie / odejście
 * ku krawędzi koperty); koperta klasy i sufit pionu na końcu. Pauza (dtMs = 0) — czas stoi, wynik ten sam.
 * @param {object} st — `createChoreo`
 * @param {{ dtMs:number, posture:string, threat:{dir:{x,y,z}, gap:number}|null, L:number, anchorSpeedL?:number }} inp —
 *   threat.dir jednostkowy od kotwicy ku punktowi zagrożenia, threat.gap — odstęp kotwic [j.]; anchorSpeedL — prędkość kotwicy
 *   [L/s] (spokój przy przestawianiu szyku — pokrętło `CHOREO_CALM_V`)
 * @param {object} [T] — pokrętła (`cvTuning`)
 * @returns {{x:number, y:number, z:number}} przesunięcie [j.]
 */
// Wspólny krok obu choreografii (CV-3b i CV-3c): czas, spokój, wagi postawy CV-3b, rama ruchu (kierunek zagrożenia), odstęp do celu.
// Wydzielony z `stepChoreoOffset` w CV-3c BEZ zmiany kolejności działań — wynik CV-3b co do bitu (keeper `cv_choreo_logic_smoke`).
function choreoCommon(st, dt, posture, threat, L, anchorSpeedL, T) {
  st.t += dt;
  if (dt > 0) {
    if (Number.isFinite(anchorSpeedL)) st.vA += (Math.max(0, anchorSpeedL) - st.vA) * (1 - Math.exp(-dt / CHOREO.CALM_V_TAU_MS));
    const vC = Math.max(1e-3, tune(T, 'CHOREO_CALM_V'));
    st.calm += (1 / (1 + (st.vA / vC) ** 2) - st.calm) * (1 - Math.exp(-dt / CHOREO.CALM_TAU_MS));
  }
  const P = CHOREO_POSTURE[posture] ?? CHOREO_POSTURE.engage;
  const tauW = posture === 'disabled' ? CHOREO.DISABLED_TAU_MS : CHOREO.POSTURE_TAU_MS;
  const a = dt > 0 ? 1 - Math.exp(-dt / (tauW / 2)) : 0;   // dwa stopnie po τ/2 — zmiana postawy bez skoku prędkości
  const W = st.w;
  const W1 = st.w1 ?? (st.w1 = { ...W });
  for (const k of W_KEYS) { W1[k] += (P[k] - W1[k]) * a; W[k] += (W1[k] - W[k]) * a; }
  if (threat?.dir && Number.isFinite(threat.dir.x)) {
    const d = norm(threat.dir);
    if (!st.u || !st.u1) { st.u1 = d; st.u = d; }
    else if (dt > 0) {
      st.u1 = rotateToward(st.u1, d, CHOREO.FRAME_RATE_DEG * DEG * dt / 1000);
      const ang = Math.acos(Math.max(-1, Math.min(1, dot(st.u, st.u1))));
      st.u = rotateToward(st.u, st.u1, ang * (1 - Math.exp(-dt / CHOREO.FRAME_TAU_MS)));
    }
    const g = Number.isFinite(threat.gap) ? threat.gap : 4 * L;
    st.gap = st.gap == null ? g : st.gap + (g - st.gap) * (dt > 0 ? 1 - Math.exp(-dt / CHOREO.POSTURE_TAU_MS) : 0);
  }
}

export function stepChoreoOffset(st, { dtMs = 0, posture = 'engage', threat = null, L = 0.016, anchorSpeedL = 0 } = {}, T = CHOREO_TUNING) {
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  choreoCommon(st, dt, posture, threat, L, anchorSpeedL, T);
  const calm = st.calm;
  const prof = CHOREO_CLASS[st.cls];
  const W = st.w;
  if (!st.u) { st.off = { x: 0, y: 0, z: 0 }; st.latAcc = { x: 0, y: 0, z: 0 }; st.latVel = { x: 0, y: 0, z: 0 }; return st.off; }
  const { u, s, v } = frameOf(st.u);
  const E = choreoEnvelope(st.cls, L, T);
  const per = Math.max(0.5, tune(T, `CHOREO_PERIOD_${CLS_KEY[st.cls]}`)) * st.perK * 1000;   // [ms]
  const om = TAU / per;                                                                         // [rad/ms]
  const th = om * st.t + st.ph1;
  const amp = W.amp * calm;
  const latAmp = E * prof.lat * W.lat * amp * st.sense;
  const lat = latAmp * Math.sin(th);
  const vert = E * prof.vert * amp * Math.sin(prof.vh * th + st.ph2);
  const pass = (1 + Math.cos(2 * th)) / 2;   // 1 przy przejściu przez środek przelotu (największa prędkość boczna)
  const rad = E * amp * (prof.radIn * W.radIn * pass - prof.radOut * W.radOut * (0.8 + 0.2 * Math.sin(om * 0.37 * st.t + st.ph3)));
  // Łuk wokół punktu zagrożenia: punkt na sferze o promieniu g wokół (kotwica + g·u) — odstęp do celu bez zmiany.
  const g = Math.max(1.5 * L, st.gap ?? 4 * L);
  const n = norm({ x: u.x - (lat / g) * s.x - (vert / g) * v.x, y: u.y - (lat / g) * s.y - (vert / g) * v.y, z: u.z - (lat / g) * s.z - (vert / g) * v.z }, u);
  let o = { x: g * (u.x - n.x) + rad * u.x, y: g * (u.y - n.y) + rad * u.y, z: g * (u.z - n.z) + rad * u.z };
  const l = len(o);
  if (l > E && l > 0) o = { x: o.x * E / l, y: o.y * E / l, z: o.z * E / l };
  const vMax = Math.max(0, tune(T, 'CHOREO_VERT')) * L;
  if (o.y > vMax) o.y = vMax; else if (o.y < -vMax) o.y = -vMax;
  // prędkość i przyspieszenie boczne wzoru (wyprzedzenie dziobu, przechył) — analitycznie, bez szumu różnic klatek
  const vl = latAmp * om * Math.cos(th), al = -latAmp * om * om * Math.sin(th);
  st.latVel = { x: s.x * vl, y: s.y * vl, z: s.z * vl };
  st.latAcc = { x: s.x * al, y: s.y * al, z: s.z * al };
  st.latVPeak = Math.abs(latAmp * om);        // szczyt prędkości bocznej wzoru (odniesienie wyprzedzenia dziobu)
  st.latAPeak = Math.abs(latAmp * om * om);   // szczyt przyspieszenia bocznego (odniesienie przechyłu)
  if (dt > 0) st.speed = Math.hypot(o.x - st.off.x, o.y - st.off.y, o.z - st.off.z) / dt;
  st.off = o;
  return o;
}

// ── RZUT PASM (D-CV-6, §3.1-2) ─────────────────────────────────────────────────────────────────────────────────────────

function bandOf(d, app) {
  for (let i = 0; i < app.length; i++) if (d <= app[i]) return i;
  return app.length;
}

/**
 * Przedział odstępu pary wokół odstępu kotwic `g` (pasmo kotwic, margines, ciągłość przy krawędzi, podłoga kolizji).
 * @param {number} g — odstęp kotwic [j.]
 * @param {number[]} app — krawędzie pasm NA SCENIE [j.], rosnąco
 * @returns {{ lo:number, hi:number, band:number }}
 */
export function pairInterval(g, app, L, { epsL = CHOREO.EDGE_EPS_L, crossK = CHOREO.CROSS_K, floorL = CHOREO.COLLISION_L } = {}) {
  const b = bandOf(g, app);
  const lo = b === 0 ? -Infinity : app[b - 1];
  const hi = b >= app.length ? Infinity : app[b];
  const eps = epsL * L;
  const rUp = hi - g, rDn = g - lo;   // odległości do krawędzi (∞ — brak krawędzi)
  const up = Math.max(0, Math.min(rUp - eps, crossK * (rDn - eps)));
  const floor = Math.min(floorL * L, g);
  const dn = Math.max(0, Math.min(rDn - eps, crossK * (rUp - eps), g - floor));
  return { lo: g - dn, hi: g + up, band: b };
}

/**
 * Rzut przesunięć choreografii na niezmiennik pasm — MUTUJE `offsets`. Każda para (i, j) klastra: odstęp rysowany
 * |kotwica_j + o_j − kotwica_i − o_i| w przedziale `pairInterval` odstępu kotwic; statek zostaje w swojej kopercie, w suficie
 * pionu i poza kulą skorupy (bitwa przy ciele). Przejścia Gaussa–Seidla (kolejność par = kolejność id — deterministycznie),
 * potem kontrola KAŻDEJ pary prawdziwymi krawędziami (pasmo = pasmo kotwic, nie bliżej niż podłoga); para, która nadal
 * wypada — przesunięcia obu statków połowione, a w końcu zerowane (zero = kotwica — pasmo kotwic z konstrukcji).
 * @param {{ ids:string[], anchors:Map<string,{x,y,z}>, offsets:Map<string,{x,y,z}>, app:number[], L:number,
 *           weights?:Map<string,number>, envelopes?:Map<string,number>, vertMax?:number,
 *           shell?:{x:number,y:number,z:number,r:number}|null, passes?:number, floorScale?:number }} o — floorScale: mnożnik podłogi kolizji
 *           (ARC CV-3c: statki nie rosną z rozsunięciem sceny — podłoga 1,5 L PRAWDZIWYCH = 1 / rozsunięcie w jednostkach sceny `L`)
 * @returns {{ pairs:number, clamped:number, passes:number, halved:number, zeroed:number, residual:number }}
 */
export function constrainChoreo({ ids, anchors, offsets, app, L, weights = null, envelopes = null, vertMax = Infinity, shell = null, passes = CHOREO.PASSES, warm = null, warmDecay = CHOREO.WARM_DECAY, floorScale = 1 }) {
  const floorL = CHOREO.COLLISION_L * (Number.isFinite(floorScale) && floorScale > 0 ? floorScale : 1);
  const list = [...ids].filter((id) => anchors.has(id)).sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
  const n = list.length;
  const out = { pairs: 0, clamped: 0, passes: 0, halved: 0, zeroed: 0, residual: 0 };
  if (n === 0) return out;
  const A = list.map((id) => anchors.get(id));
  const R = list.map((id) => { const o = offsets.get(id) ?? ZERO; return { x: o.x, y: o.y, z: o.z }; });   // wzór (przed rzutem)
  // Ciepły start: poprawka rzutu z poprzedniej klatki (gasnąca × warmDecay) — rzut dopracowuje tylko zmianę z klatki na klatkę
  // (pomiar: 6 przejść bez ciepłego startu — rezerwa na 16 % klatek, 64 — wciąż na gęstej kupce); gaśnięcie zdejmuje poprawki,
  // których para już nie potrzebuje (rzut tylko dokłada, nigdy nie cofa).
  const P = list.map((id, i) => {
    const c = warm?.get?.(id);
    const k = c && Number.isFinite(c.x) ? warmDecay : 0;
    return { x: A[i].x + R[i].x + (k ? c.x * k : 0), y: A[i].y + R[i].y + (k ? c.y * k : 0), z: A[i].z + R[i].z + (k ? c.z * k : 0) };
  });
  const wt = list.map((id) => { const w = weights?.get?.(id); return Number.isFinite(w) && w >= 0 ? w : 1; });   // 0 — statek nieruchomy w rzucie (koperta 0)
  const env = list.map((id) => { const e = envelopes?.get?.(id); return Number.isFinite(e) && e >= 0 ? e : Infinity; });
  const pairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const g = Math.hypot(A[j].x - A[i].x, A[j].y - A[i].y, A[j].z - A[i].z);
      const iv = pairInterval(g, app, L, { floorL });   // ARC CV-3c — podłoga kolizji w L PRAWDZIWYCH (`floorL` = 1,5 / rozsunięcie)
      pairs.push({ i, j, g, lo: iv.lo, hi: iv.hi, band: iv.band, floor: Math.min(floorL * L, g) });
    }
  }
  out.pairs = pairs.length;
  const clampShip = (i) => {
    let dx = P[i].x - A[i].x, dy = P[i].y - A[i].y, dz = P[i].z - A[i].z;
    if (dy > vertMax) dy = vertMax; else if (dy < -vertMax) dy = -vertMax;
    const l = Math.hypot(dx, dy, dz);
    if (l > env[i] && l > 0) { const k = env[i] / l; dx *= k; dy *= k; dz *= k; }
    P[i].x = A[i].x + dx; P[i].y = A[i].y + dy; P[i].z = A[i].z + dz;
    if (shell && shell.r > 0) {
      const sx = P[i].x - shell.x, sy = P[i].y - shell.y, sz = P[i].z - shell.z, d = Math.hypot(sx, sy, sz);
      if (d < shell.r && d > 1e-12) { const k = shell.r / d; P[i].x = shell.x + sx * k; P[i].y = shell.y + sy * k; P[i].z = shell.z + sz * k; }
    }
  };
  for (let i = 0; i < n; i++) clampShip(i);
  const tol = 1e-4 * L;   // naruszenie mniejsze nie liczy się jako ruch (koniec przejść wcześniej; kontrola końcowa ma margines EDGE_EPS_L)
  for (let k = 0; k < passes; k++) {
    let moved = 0;
    for (const q of pairs) {
      const a = P[q.i], b = P[q.j];
      let vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z;
      let d = Math.hypot(vx, vy, vz);
      if (d >= q.lo - tol && d <= q.hi + tol) continue;
      if (d < 1e-12) { vx = A[q.j].x - A[q.i].x; vy = A[q.j].y - A[q.i].y; vz = A[q.j].z - A[q.i].z; d = Math.hypot(vx, vy, vz) || 1; if (!(d > 1e-12)) { vx = 1; vy = 0; vz = 0; d = 1; } }
      // nadrelaksacja: cel trochę wewnątrz przedziału (o (ω − 1) × naruszenie, nie dalej niż połowa przedziału) — sąsiedzi
      // nie wypychają pary z powrotem w następnym przejściu (zbieżność gęstej kupki)
      const mid = (Math.max(q.lo, 0) + (Number.isFinite(q.hi) ? q.hi : q.lo + 4 * L)) / 2;
      const want = d < q.lo ? Math.min(mid, q.lo + (q.lo - d) * (CHOREO.SOR - 1)) : Math.max(mid, q.hi - (d - q.hi) * (CHOREO.SOR - 1));
      const delta = (d - want) / d;
      const ws = wt[q.i] + wt[q.j];
      const fi = ws > 0 ? wt[q.i] / ws : 0.5, fj = 1 - fi;
      a.x += vx * delta * fi; a.y += vy * delta * fi; a.z += vz * delta * fi;
      b.x -= vx * delta * fj; b.y -= vy * delta * fj; b.z -= vz * delta * fj;
      moved++;
    }
    if (k === 0) out.clamped = moved;
    for (let i = 0; i < n; i++) clampShip(i);
    out.passes++;
    if (moved === 0) break;
  }
  // Kontrola KAŻDEJ pary prawdziwymi krawędziami; winni — połowienie, w końcu zero (gwarancja: zero = kotwice).
  const bad = () => {
    const s = new Set();
    for (const q of pairs) {
      const a = P[q.i], b = P[q.j];
      const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      // pasmo — prawdziwe krawędzie (przedziały rzutu mają margines EDGE_EPS_L); podłoga — z tolerancją przejść (tol)
      if (bandOf(d, app) !== q.band || d < q.floor - 2 * tol) { s.add(q.i); s.add(q.j); }
    }
    return s;
  };
  let culprits = bad();
  for (let h = 0; culprits.size && h < CHOREO.FALLBACK_HALVINGS; h++) {
    for (const i of culprits) { P[i].x = A[i].x + (P[i].x - A[i].x) * 0.5; P[i].y = A[i].y + (P[i].y - A[i].y) * 0.5; P[i].z = A[i].z + (P[i].z - A[i].z) * 0.5; }
    out.halved += culprits.size;
    culprits = bad();
  }
  for (let guard = 0; culprits.size && guard <= n; guard++) {
    for (const i of culprits) { P[i].x = A[i].x; P[i].y = A[i].y; P[i].z = A[i].z; }
    out.zeroed += culprits.size;
    culprits = bad();
  }
  out.residual = culprits.size;
  for (let i = 0; i < n; i++) {
    const o = { x: P[i].x - A[i].x, y: P[i].y - A[i].y, z: P[i].z - A[i].z };
    offsets.set(list[i], o);
    if (warm) warm.set(list[i], { x: o.x - R[i].x, y: o.y - R[i].y, z: o.z - R[i].z });
  }
  if (warm) for (const id of [...warm.keys()]) if (!anchors.has(id)) warm.delete(id);
  return out;
}

// ── KURS (dziób ku celowi, pancernik burtą; skręt ograniczony, przechył) ─────────────────────────────────────────────

/** Kwaternion [x, y, z, w] z kursu (obrót Y), pochylenia (dziób w górę > 0) i przechyłu (obrót wokół dziobu): Ry · Rx(−p) · Rz. */
export function quatFromYawPitchRoll(yaw, pitch, roll) {
  const hy = yaw / 2, hp = -pitch / 2, hr = roll / 2;
  const qy = [0, Math.sin(hy), 0, Math.cos(hy)];
  const qx = [Math.sin(hp), 0, 0, Math.cos(hp)];
  const qz = [0, 0, Math.sin(hr), Math.cos(hr)];
  return quatMul(quatMul(qy, qx), qz);
}

/** Iloczyn kwaternionów a · b ([x, y, z, w]). */
export function quatMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/** Dziób (lokalne +Z ramy kanonicznej) w świecie z kursu i pochylenia. */
export function bowOf(yaw, pitch) {
  return { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
}

/**
 * KROK KURSU: obrót ku kierunkowi pożądanemu sprężyną krytycznie tłumioną z sufitem prędkości skrętu klasy; przechył
 * w skręcie i w przelocie bocznym (w stronę skrętu — rama kanoniczna: lewa burta +X, skręt w lewo = przechył w lewo,
 * rotation.z < 0, jak `ShipHardpoints.bankRoll`). Pauza (dtMs = 0) — nic się nie zmienia.
 * Kierunek pożądany: angażuj / kite / trzymaj — dziób ku celowi (fregata i niszczyciel z wyprzedzeniem w stronę przelotu),
 * pancernik — burtą (cel na ±90°, burta wybrana raz, z histerezą); odwrót — dziobem OD zagrożenia; zniszczony — bez zmian.
 * @param {object} st — `createChoreo`
 * @param {{ dtMs:number, posture:string, aim:{x,y,z}|null, initYaw?:number, initPitch?:number }} inp — aim jednostkowy od
 *   pozycji rysowanej statku ku pozycji rysowanej celu; initYaw / initPitch — kurs sprite'a przy pierwszym kroku
 * @returns {{ q:number[], yaw:number, pitch:number, roll:number }}
 */
export function stepChoreoFacing(st, { dtMs = 0, posture = 'engage', aim = null, initYaw = 0, initPitch = 0 } = {}, T = CHOREO_TUNING) {
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  if (st.yaw == null) { st.yaw = Number.isFinite(initYaw) ? initYaw : 0; st.pitch = Number.isFinite(initPitch) ? initPitch : 0; }
  const prof = CHOREO_CLASS[st.cls];
  const turn = Math.max(1, tune(T, `CHOREO_TURN_${CLS_KEY[st.cls]}`)) * DEG / 1000;   // [rad/ms]
  let yawDes = st.yaw, pitchDes = st.pitch, steer = false;
  if (posture !== 'disabled' && aim && Number.isFinite(aim.x) && len(aim) > 1e-9) {
    const a = norm(aim);
    const aimYaw = Math.atan2(a.x, a.z);
    const aimPitch = Math.max(-CHOREO.PITCH_MAX, Math.min(CHOREO.PITCH_MAX, Math.asin(Math.max(-1, Math.min(1, a.y)))));
    steer = true;
    if (posture === 'retreat') {
      yawDes = wrapPi(aimYaw + Math.PI); pitchDes = -aimPitch * 0.5;
    } else if (prof.broadside) {
      // burta do celu: kurs = kurs ku celowi ± 90°; burta wybrana raz (bliższa obecnemu kursowi), zmiana tylko z histerezą
      const yA = wrapPi(aimYaw + Math.PI / 2), yB = wrapPi(aimYaw - Math.PI / 2);
      const dA = Math.abs(wrapPi(yA - st.yaw)), dB = Math.abs(wrapPi(yB - st.yaw));
      if (st.side === 0) st.side = dA <= dB ? 1 : -1;
      else if (st.side === 1 && dB + CHOREO.BROADSIDE_SWITCH < dA) st.side = -1;
      else if (st.side === -1 && dA + CHOREO.BROADSIDE_SWITCH < dB) st.side = 1;
      yawDes = st.side === 1 ? yA : yB; pitchDes = 0;
    } else {
      // wyprzedzenie dziobu w stronę przelotu (∝ prędkość boczna wzoru względem największej)
      let crab = 0;
      if (prof.crab > 0 && st.latVPeak > 1e-15) {
        const left = { x: Math.cos(aimYaw), y: 0, z: -Math.sin(aimYaw) };   // lewa burta przy kursie ku celowi (Y × dziób)
        crab = prof.crab * DEG * Math.max(-1, Math.min(1, dot(st.latVel, left) / st.latVPeak));
      }
      yawDes = wrapPi(aimYaw + crab * (posture === 'hold' ? 0 : 1)); pitchDes = aimPitch;
    }
  }
  if (dt > 0 && steer) {
    const wn = 2.5 * turn;   // [rad/ms] częstość sprężyny z sufitu skrętu (zwrot o 90° — prędkość dochodzi do sufitu, bez przeregulowania)
    const kp = wn * wn, kd = 2 * wn;
    const eY = wrapPi(yawDes - st.yaw);
    st.yawRate += (kp * eY - kd * st.yawRate) * dt;
    if (st.yawRate > turn) st.yawRate = turn; else if (st.yawRate < -turn) st.yawRate = -turn;
    st.yaw = wrapPi(st.yaw + st.yawRate * dt);
    const eP = pitchDes - st.pitch;
    st.pitchRate += (kp * eP - kd * st.pitchRate) * dt;
    const pTurn = turn * 0.5;
    if (st.pitchRate > pTurn) st.pitchRate = pTurn; else if (st.pitchRate < -pTurn) st.pitchRate = -pTurn;
    st.pitch = Math.max(-CHOREO.PITCH_MAX, Math.min(CHOREO.PITCH_MAX, st.pitch + st.pitchRate * dt));
  } else if (dt > 0) {
    st.yawRate *= Math.exp(-dt / 300); st.pitchRate *= Math.exp(-dt / 300);
  }
  if (dt > 0) {
    // przechył: skręt (prędkość kursu względem odniesienia klasy) + przyspieszenie boczne wzoru ku lewej burcie
    const left = { x: Math.cos(st.yaw), y: 0, z: -Math.sin(st.yaw) };
    const accLeft = posture === 'disabled' || !(st.latAPeak > 1e-18) ? 0 : dot(st.latAcc, left) / st.latAPeak;
    const yawN = st.yawRate / (prof.turnRef * DEG / 1000);
    const bank = Math.max(0, tune(T, 'CHOREO_BANK'));
    const rollDes = posture === 'disabled' ? 0 : -CHOREO.ROLL_MAX * Math.max(-1, Math.min(1, bank * (0.9 * yawN + 0.55 * accLeft)));
    st.roll += (rollDes - st.roll) * (1 - Math.exp(-dt / CHOREO.ROLL_TAU_MS));
  }
  return { q: quatFromYawPitchRoll(st.yaw, st.pitch, st.roll), yaw: st.yaw, pitch: st.pitch, roll: st.roll };
}

/**
 * KROK SILNIKA: jasność smugi w walce (0..1, × `CHOREO_PLUME_GAIN`). Jałowy bieg klasy × postawa + prędkość pokazywana (większa
 * z dwóch: taniec — prędkość przesunięcia, przestawianie szyku — wygładzona prędkość kotwicy; względem szczytowej prędkości wzoru)
 * + skręt; odwrót — pełny ciąg; zniszczony — zgaszony. Wygładzone; pauza — bez zmian.
 */
export function stepChoreoEngine(st, { dtMs = 0, posture = 'engage', L = 0.016 } = {}, T = CHOREO_TUNING) {
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  const prof = CHOREO_CLASS[st.cls];
  if (dt > 0) {
    const E = choreoEnvelope(st.cls, L, T);
    const per = Math.max(0.5, tune(T, `CHOREO_PERIOD_${CLS_KEY[st.cls]}`)) * st.perK * 1000;
    const vRef = Math.max(1e-12, E * prof.lat * TAU / per);
    const turnN = Math.min(1, Math.abs(st.yawRate) / (prof.turnRef * DEG / 1000));
    let target;
    if (posture === 'disabled') target = 0;
    else if (posture === 'retreat') target = 1;
    else {
      const v = Math.max(st.speed, (st.vA || 0) * L / 1000);   // [j./ms] — kotwica w [L/s] → [j./ms]
      target = Math.min(1, (prof.idle + prof.speedGain * Math.min(1, v / vRef) + 0.25 * turnN) * (st.w.plume || 0));
    }
    st.engine += (target - st.engine) * (1 - Math.exp(-dt / CHOREO.ENGINE_TAU_MS));
  }
  return Math.max(0, st.engine * Math.max(0, tune(T, 'CHOREO_PLUME_GAIN')));
}

// ═══ ARC CV-3c — CHOREOGRAFIA 2.0: LOT WZDŁUŻ KURSU (decyzja właściciela 44 (3); flaga `cvChoreo2`) ════════════════════════
// Zgłoszenie właściciela (kontrola CV-5 + CV-4b, 2026-11-12): „statki ruszają się raz w lewo raz w prawo, w górę i w dół jak suwak,
// tańczą — ale nie krążą wokół siebie”. W CV-3b dziób celuje w przeciwnika, a ruch w kopercie jest boczny (sinus) — statek jedzie
// bokiem. Tu statek LECI: prędkość ≈ kierunek dziobu (nigdy bokiem), skręca z sufitem prędkości skrętu klasy i przechyla się
// w zakręcie, a do celu strzelają wieżyczki (CV-4a — wylot z wieżyczki o najlepszym namiarze), więc dziób nie musi patrzeć na cel.
// KSZTAŁT (pomiar pasm, nie wybór): para strzelec → cel stoi na scenie tuż pod sufitem pasma (laser ~3,5 / 3,64 L), więc pętla
// nie może iść NA ZEWNĄTRZ (pasmo dalej) i tylko trochę do środka (reguła ciągłości `CROSS_K` — `pairInterval`). Pętla leży więc
// w płaszczyźnie (bok s) × (w = cos β · ku celowi + sin β · w górę): bok i pion przez mapę na SFERZE wokół celu (odstęp do celu bez
// zmian — jak łuk CV-3b), część ku celowi tylko DO ŚRODKA i nie głębiej niż pozwala przedział pary; gdy miejsca brak, płaszczyzna
// staje dęba (β → `CHOREO2_TILT_MAX`) — pętla w pionie nie zmienia odstępu do celu. Klasy: fregata — ósemka (szybkie przeloty
// ukośne przez środek, szerokie pętle na końcach), niszczyciel — koło (krążenie w zasięgu broni), pancernik — powolne płaskie koło
// burtą do celu (ruch styczny ⇒ burta ku celowi), duży promień skrętu. Prędkość kątowa pętli ≤ sufit skrętu klasy (największa
// prędkość obrotu stycznej ≈ (a / b) · ω), więc kurs nadąża za ruchem. Rzut pasm (`constrainChoreo`) i koperta — bez zmian.
// Deterministyczne (ziarno starcia + statku), zegar prezentacji (pauza = pauza), ciągłe w prędkości (faza całkowana, parametry
// pętli wygładzane), spokój przy przestawianiu szyku (`calm` ze wspólnego kroku), postawy D-CV-7 (tylko ustawienie i tempo).

/** Pokrętła CV-3c — w `cvTuning` (renderer: `KOSMOS.threeRenderer.cvTuning.CHOREO2_*`, czytane CO KLATKĘ). Strojenie, bez pinów. */
export const CHOREO2_TUNING = Object.freeze({
  CHOREO2_PERIOD_FRIGATE:    9,     // [s] okres ósemki fregaty (przeloty przez środek, pętle na końcach)
  CHOREO2_PERIOD_DESTROYER:  13,    // [s] okres koła niszczyciela
  CHOREO2_PERIOD_BATTLESHIP: 24,    // [s] okres burtowego koła pancernika
  CHOREO2_DEPTH:             1.0,   // mnożnik głębokości pętli ku celowi (część pozioma — zakręty z przechyłem); 0 — pętle w pionie
  CHOREO2_TILT_MAX:          60,    // [°] największe pochylenie płaszczyzny pętli od poziomu (brak miejsca ku celowi — pętla dęba)
  CHOREO2_VEL_TAU:           120,   // [ms] wygładzenie prędkości ruchu rysowanego, za którą idzie dziób (× `CHOREO2_CLASS.velTauK`; renderer)
  CHOREO2_DRIFT_V0:          0.35,  // [L/s sceny] pancernik (kurs za pętlą): prędkość kotwicy, od której przestawianie szyku kieruje też dziobem
  CHOREO2_DRIFT_V1:          1.0,   // [L/s sceny] od tej prędkości kotwica kieruje dziobem pancernika w pełni (podchodzenie, odwrót)
  CHOREO2_ALIGN_FRAC:        0.06,  // kurs idzie za ruchem, gdy prędkość > to × szczytowa prędkość pętli klasy (pancernik pełznie
                                   //   ~0,12 L/s — próg bezwzględny trzymałby go w miejscu); poniżej dziób zostaje („trzymaj” — ku celowi)
});

/** Stałe CV-3c (kształt, nie strojenie). */
export const CHOREO2 = Object.freeze({
  ROOM_SHARE:   0.42,   // część przedziału pary ku środkowi dla JEDNEGO statku (obaj mogą wejść do środka naraz)
  ENV_FIT:      0.92,   // pętla mieści się w tej części koperty z konstrukcji (straż koperty i rzut nie łamią kursu)
  // Ciasnota (pomiar na prawdziwym kleju, szyk stagera 10 na 10: pętle pełnej wielkości zderzały się z podłogą kolizji sąsiadów — rzut
  // poprawiał przesunięcia w 98 % klatek, do 1,07 L, a raz połowił je skokiem 0,86 L). Półoś pętli ≤ CROWD_SHARE × wolne miejsce
  // (odstęp kotwic do najbliższego statku − podłoga kolizji), nie mniej niż CROWD_MIN × wielkość klasy.
  CROWD_SHARE:  0.42,
  CROWD_MIN:    0.15,
  TURN_SAFE:    0.8,    // prędkość kątowa pętli ≤ to × sufit skrętu / (a / b · kształt) — kurs nadąża za styczną
  SHAPE_K:      Object.freeze({ eight: 1.2, ellipse: 1.0 }),   // największy obrót stycznej / (a / b · ω) — ósemka trochę ostrzej
  PARAM_TAU_MS: 1200,   // [ms] wygładzenie pochylenia płaszczyzny, głębokości i prędkości kątowej pętli (ciągłość w prędkości)
  PITCH_MAX:    1.15,   // [rad] największe pochylenie dziobu w locie (≈ 66°; pętla przechylona o ≤ 60°)
  YAWRATE_TAU_MS: 150,  // [ms] wygładzenie prędkości kursu do przechyłu
  SAMPLE_MS:    1,      // [ms] krok różnicy skończonej prędkości wzoru (postać zamknięta — bez szumu klatek)
});

/** Profile klas CV-3c: kształt, półosie (× koperta), pochylenie płaszczyzny [°] z rozrzutem z ziarna, sufit pochylenia (× pokrętło),
 *  wygładzenie ruchu, za którym idzie dziób (× `CHOREO2_VEL_TAU`), silnik. */
export const CHOREO2_CLASS = Object.freeze({
  frigate:    Object.freeze({ shape: 'eight',   a: 0.85, b: 0.42, tilt: 24, tiltSpread: 16, tiltMaxK: 1.0,  velTauK: 1, headLoop: false, idle: 0.30, speedGain: 0.75, turnRef: 120 }),
  destroyer:  Object.freeze({ shape: 'ellipse', a: 0.85, b: 0.50, tilt: 12, tiltSpread: 10, tiltMaxK: 0.85, velTauK: 2, headLoop: false, idle: 0.25, speedGain: 0.60, turnRef: 60 }),
  // pancernik nie staje dęba (kontrola wyglądu: pionowe koło pancernika wygląda sztucznie) — przy braku miejsca pętla się spłaszcza
  battleship: Object.freeze({ shape: 'ellipse', a: 0.85, b: 0.60, tilt: 4,  tiltSpread: 4,  tiltMaxK: 0.35, velTauK: 5, headLoop: true, idle: 0.16, speedGain: 0.40, turnRef: 20 }),
});

/** Postawy CV-3c (D-CV-7 — tylko ustawienie i tempo): amp — wielkość pętli; depth — część ku celowi; rate — tempo; plume — silnik. */
export const CHOREO2_POSTURE = Object.freeze({
  engage:   Object.freeze({ amp: 1.00, depth: 1.00, rate: 1.00, plume: 1.00 }),
  kite:     Object.freeze({ amp: 0.85, depth: 0.35, rate: 0.85, plume: 0.80 }),
  hold:     Object.freeze({ amp: 0.30, depth: 0.25, rate: 0.55, plume: 0.45 }),
  retreat:  Object.freeze({ amp: 0.30, depth: 0.00, rate: 0.70, plume: 1.00 }),
  disabled: Object.freeze({ amp: 0.00, depth: 0.00, rate: 0.00, plume: 0.00 }),
});
const W2_KEYS = Object.freeze(['amp', 'depth', 'rate', 'plume']);
const tune2 = (T, k) => { const v = T?.[k]; return Number.isFinite(v) ? v : CHOREO2_TUNING[k]; };

/** Pętla w płaszczyźnie: [bok, w] ∈ [−1, 1]² w fazie φ (ósemka Gerono albo koło). */
export function loopShape(shape, phi) {
  return shape === 'eight' ? [Math.sin(phi), Math.sin(2 * phi)] : [Math.cos(phi), Math.sin(phi)];
}

// Przesunięcie z parametrów pętli (rama u, s, v; odstęp g; półosie aW, bW; pochylenie β; głębokość).
function loopOffset(fr, g, aW, bW, beta, depth, fs, fw) {
  const { u, s, v } = fr;
  const lat = aW * fs;
  const w = bW * fw;
  const vert = w * Math.sin(beta);
  const rad = (bW + w) * Math.cos(beta) * depth;   // ku celowi: [0, 2 bW cos β · depth] — nigdy na zewnątrz (pasmo dalej)
  const n = norm({ x: u.x - (lat / g) * s.x - (vert / g) * v.x, y: u.y - (lat / g) * s.y - (vert / g) * v.y, z: u.z - (lat / g) * s.z - (vert / g) * v.z }, u);
  return { x: g * (u.x - n.x) + rad * u.x, y: g * (u.y - n.y) + rad * u.y, z: g * (u.z - n.z) + rad * u.z };
}

/**
 * KROK RUCHU CV-3c (przed rzutem pasm): przesunięcie statku względem kotwicy [j.] i prędkość wzoru [j./ms] (`st.f2.vel`).
 * Faza pętli całkowana z prędkością kątową ≤ sufit skrętu klasy; płaszczyzna (β) i półoś ku celowi z przedziału pary strzelec →
 * cel (`pairInterval` odstępu kotwic na krawędziach pasm `app`), wygładzone. Pauza (dtMs = 0) — wynik bez zmian.
 * @param {object} st — `createChoreo` (pola CV-3c w `st.f2`, tworzone przy pierwszym kroku)
 * @param {{ dtMs:number, posture:string, threat:{dir:{x,y,z}, gap:number}|null, L:number, anchorSpeedL?:number,
 *           app?:number[], skipCommon?:boolean, nearestGap?:number, floorScale?:number }} inp — app: krawędzie pasm NA SCENIE [j.];
 *           skipCommon — wspólny krok już wykonany w tej klatce (`stepChoreoOffset` przy przenikaniu trybów); nearestGap [j.] — odstęp kotwic
 *           do najbliższego innego statku (wolne miejsce = to − podłoga kolizji: gęsty szyk — mniejsza pętla, rzut ma mniej pracy);
 *           floorScale — mnożnik podłogi kolizji (jak `constrainChoreo`)
 * @returns {{x:number, y:number, z:number}}
 */
export function stepChoreo2Offset(st, { dtMs = 0, posture = 'engage', threat = null, L = 0.016, anchorSpeedL = 0, app = null, skipCommon = false, nearestGap = Infinity, floorScale = 1 } = {}, T = CHOREO_TUNING) {
  const floorL = CHOREO.COLLISION_L * (Number.isFinite(floorScale) && floorScale > 0 ? floorScale : 1);
  const room = Number.isFinite(nearestGap) ? nearestGap - floorL * L : Infinity;   // [j.] wolne miejsce do najbliższego statku
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  if (!skipCommon) choreoCommon(st, dt, posture, threat, L, anchorSpeedL, T);
  const prof = CHOREO2_CLASS[st.cls] ?? CHOREO2_CLASS.destroyer;
  const f2 = st.f2 ?? (st.f2 = {
    phi: seedUnit(st.seed, 21) * TAU,                                     // faza pętli
    sense: seedUnit(st.seed, 22) < 0.5 ? -1 : 1,                          // kierunek obiegu
    tilt0: (prof.tilt + prof.tiltSpread * (2 * seedUnit(st.seed, 23) - 1)) * DEG,   // pochylenie płaszczyzny z ziarna
    beta: null, aW: null, bW: null, om: null,
    w: { amp: 0, depth: 0, rate: 0, plume: 0 }, w1: { amp: 0, depth: 0, rate: 0, plume: 0 },
    off: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, speed: 0, vRef: 0,
  });
  st.velTauK = prof.velTauK ?? 1;   // renderer — wygładzenie ruchu rysowanego dla kursu
  st.headLoop = !!prof.headLoop;    // renderer — kurs za pętlą (pancernik), nie za ruchem rysowanym
  // wagi postawy CV-3c — dwa stopnie po τ/2 (jak CV-3b: zmiana postawy bez skoku prędkości)
  const P = CHOREO2_POSTURE[posture] ?? CHOREO2_POSTURE.engage;
  const tauW = posture === 'disabled' ? CHOREO.DISABLED_TAU_MS : CHOREO.POSTURE_TAU_MS;
  const aW8 = dt > 0 ? 1 - Math.exp(-dt / (tauW / 2)) : 0;
  for (const k of W2_KEYS) { f2.w1[k] += (P[k] - f2.w1[k]) * aW8; f2.w[k] += (f2.w1[k] - f2.w[k]) * aW8; }
  if (!st.u) { f2.off = { x: 0, y: 0, z: 0 }; f2.vel = { x: 0, y: 0, z: 0 }; f2.speed = 0; return f2.off; }
  const fr = frameOf(st.u);
  const E = choreoEnvelope(st.cls, L, T);
  const g = Math.max(1.5 * L, st.gap ?? 4 * L);
  const amp = f2.w.amp * st.calm;
  // Półosie i płaszczyzna: bok aW, w bW; część ku celowi 2·bW·cos β ≤ udział przedziału pary (do środka), pion bW·sin β ≤ sufit pionu.
  let aW = prof.a * E;
  let bW = prof.b * E;
  let beta = Math.max(0, f2.tilt0);
  const tiltMax = Math.max(0, Math.min(85, tune2(T, 'CHOREO2_TILT_MAX') * (prof.tiltMaxK ?? 1))) * DEG;
  const depthK = Math.max(0, tune2(T, 'CHOREO2_DEPTH'));
  // Ciasnota (gęsty szyk): pętla ≤ CROWD_SHARE × wolne miejsce statku — dwaj sąsiedzi lecący ku sobie mieszczą się bez rzutu.
  if (Number.isFinite(room)) {
    const k = Math.max(CHOREO2.CROWD_MIN, Math.min(1, CHOREO2.CROWD_SHARE * Math.max(0, room) / Math.max(1e-12, aW)));
    aW *= k; bW *= k;
  }
  if (Array.isArray(app) && app.length && Number.isFinite(st.gap)) {
    const iv = pairInterval(st.gap, app, L, { floorL });
    const budget = Math.max(0, (st.gap - iv.lo) * CHOREO2.ROOM_SHARE);
    const deep = 2 * bW * depthK;   // głębokość przy β = 0
    if (deep > 1e-12 && deep * Math.cos(beta) > budget) {
      const c = Math.max(Math.cos(tiltMax), Math.min(1, budget / deep));
      beta = Math.max(beta, Math.acos(c));
      if (deep * Math.cos(beta) > budget) bW = budget / Math.max(1e-9, 2 * depthK * Math.cos(beta));
    }
  }
  const vMax = Math.max(0, tune(T, 'CHOREO_VERT')) * L;
  if (bW * Math.sin(beta) > vMax) bW = vMax / Math.max(1e-9, Math.sin(beta));
  bW = Math.max(0.05 * E * CHOREO2.CROWD_MIN, Math.min(prof.b * E, bW));
  // Dopasowanie do koperty: największe |przesunięcie| pętli (16 faz, mapa na sferze) ≤ ENV_FIT × E — inaczej straż koperty (tu i w rzucie
  // `constrainChoreo`) ścinałaby pętlę, a statek jechałby bokiem (pomiar: niszczyciel na płaskim kole 1,0 E, odchyłka kursu p95 20°).
  let aFit = aW;
  {
    const frT = frameOf(st.u);
    const gT = Math.max(1.5 * L, st.gap ?? 4 * L);
    let mx = 0;
    for (let i = 0; i < 16; i++) {
      const [fs0, fw] = loopShape(prof.shape, i * TAU / 16);
      const q = loopOffset(frT, gT, aW, bW, beta, depthK, fs0, fw);
      mx = Math.max(mx, len(q));
    }
    const k = mx > CHOREO2.ENV_FIT * E ? CHOREO2.ENV_FIT * E / mx : 1;
    aFit = aW * k; bW *= k;
  }
  // Prędkość kątowa pętli: okres klasy × tempo postawy, ograniczona sufitem skrętu (największy obrót stycznej ≈ kształt · a / b · ω).
  const per = Math.max(0.5, tune2(T, `CHOREO2_PERIOD_${CLS_KEY[st.cls] ?? 'DESTROYER'}`)) * st.perK * 1000;   // [ms]
  const turn = Math.max(1, tune(T, `CHOREO_TURN_${CLS_KEY[st.cls] ?? 'DESTROYER'}`)) * DEG / 1000;           // [rad/ms]
  const shapeK = CHOREO2.SHAPE_K[prof.shape] ?? 1;
  const omCap = CHOREO2.TURN_SAFE * turn / Math.max(1e-9, shapeK * aFit / bW);
  const omWant = Math.min(TAU / per, omCap);
  // wygładzenie parametrów (ciągłość w prędkości przy zmianie przedziału pary, zmianie celu, rozsunięcia)
  const kP = dt > 0 ? 1 - Math.exp(-dt / CHOREO2.PARAM_TAU_MS) : 0;
  if (f2.beta == null) { f2.beta = beta; f2.aW = aFit; f2.bW = bW; f2.om = omWant; }
  else { f2.beta += (beta - f2.beta) * kP; f2.aW += (aFit - f2.aW) * kP; f2.bW += (bW - f2.bW) * kP; f2.om += (omWant - f2.om) * kP; }
  const om = f2.om * Math.max(0, f2.w.rate);
  f2.phi = (f2.phi + om * dt) % TAU;
  const depth = depthK * f2.w.depth;
  const at = (phi) => {
    const [fs0, fw] = loopShape(prof.shape, phi);
    return loopOffset(fr, g, f2.aW * amp, f2.bW * amp, f2.beta, depth, fs0 * f2.sense, fw);
  };
  let o = at(f2.phi);
  const o2 = at(f2.phi + om * CHOREO2.SAMPLE_MS);
  // prędkość wzoru (postać zamknięta, rama tej klatki) — kurs idzie za prędkością kotwicy + tej prędkości (renderer)
  f2.vel = { x: (o2.x - o.x) / CHOREO2.SAMPLE_MS, y: (o2.y - o.y) / CHOREO2.SAMPLE_MS, z: (o2.z - o.z) / CHOREO2.SAMPLE_MS };
  f2.vRef = f2.aW * f2.om;   // szczytowa prędkość pętli przy pełnej amplitudzie [j./ms] (silnik, próg kursu)
  // koperta i sufit pionu — straż (półosie mieszczą się z konstrukcji)
  const l = len(o);
  if (l > E && l > 0) o = { x: o.x * E / l, y: o.y * E / l, z: o.z * E / l };
  if (o.y > vMax) o.y = vMax; else if (o.y < -vMax) o.y = -vMax;
  if (dt > 0) f2.speed = Math.hypot(o.x - f2.off.x, o.y - f2.off.y, o.z - f2.off.z) / dt;
  f2.off = o;
  return o;
}

/**
 * KROK KURSU CV-3c: dziób idzie za prędkością (kotwica + wzór — podaje renderer), obrót ≤ sufit skrętu klasy na klatkę
 * (ogranicznik prędkości kątowej — bez przeregulowania; przy skręcie poniżej sufitu dziób trzyma kierunek ruchu dokładnie),
 * przechył w zakręcie z prędkości kursu. Poniżej `CHOREO2_ALIGN_FRAC` × szczyt pętli klasy dziób zostaje (postawa „trzymaj” — powoli
 * ku celowi); odwrót —
 * dziobem OD zagrożenia; zniszczony — bez zmian. Pochylenie ≤ `CHOREO2.PITCH_MAX`. Pauza — nic się nie zmienia.
 * @param {object} st — `createChoreo` (kurs wspólny z CV-3b: yaw, pitch, roll — przełączenie trybu to zwykły skręt)
 * @param {{ dtMs:number, posture:string, vel:{x,y,z}|null, aim:{x,y,z}|null, L:number, initYaw?:number, initPitch?:number }} inp —
 *   vel [j./ms] — prędkość rysowana zamierzona (kotwica + wzór); aim — od statku ku celowi
 * @returns {{ q:number[], yaw:number, pitch:number, roll:number }}
 */
export function stepChoreo2Facing(st, { dtMs = 0, posture = 'engage', vel = null, aim = null, L = 0.016, initYaw = 0, initPitch = 0 } = {}, T = CHOREO_TUNING) {
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  if (st.yaw == null) { st.yaw = Number.isFinite(initYaw) ? initYaw : 0; st.pitch = Number.isFinite(initPitch) ? initPitch : 0; }
  const prof = CHOREO2_CLASS[st.cls] ?? CHOREO2_CLASS.destroyer;
  const turn = Math.max(1, tune(T, `CHOREO_TURN_${CLS_KEY[st.cls] ?? 'DESTROYER'}`)) * DEG / 1000;   // [rad/ms]
  let desired = null;
  const sp = vel && Number.isFinite(vel.x) ? len(vel) : 0;
  const vRef = st.f2?.vRef > 0 ? st.f2.vRef : choreoEnvelope(st.cls, L, T) * prof.a * TAU / 12000;   // [j./ms] szczyt pętli klasy
  const alignV = Math.max(1e-9, Math.max(0, tune2(T, 'CHOREO2_ALIGN_FRAC')) * vRef);
  const aimOk = aim && Number.isFinite(aim.x) && len(aim) > 1e-12;
  if (posture === 'disabled') desired = null;
  else if (posture === 'retreat' && aimOk) { const a = norm(aim); desired = { x: -a.x, y: -a.y * 0.5, z: -a.z }; }
  else if (sp > alignV) desired = { x: vel.x, y: vel.y, z: vel.z };
  else if (posture === 'hold' && aimOk) desired = norm(aim);
  if (desired) {
    desired = norm(desired);
    const sMax = Math.sin(CHOREO2.PITCH_MAX);
    if (Math.abs(desired.y) > sMax) {
      const h = Math.hypot(desired.x, desired.z);
      const k = h > 1e-9 ? Math.cos(CHOREO2.PITCH_MAX) / h : 0;
      desired = h > 1e-9 ? { x: desired.x * k, y: Math.sign(desired.y) * sMax, z: desired.z * k } : null;
    }
  }
  if (dt > 0) {
    let yawRate = 0;
    if (desired) {
      const bow = bowOf(st.yaw, st.pitch);
      const nb = rotateToward(bow, desired, turn * dt);
      const ny = Math.atan2(nb.x, nb.z);
      const np = Math.max(-CHOREO2.PITCH_MAX, Math.min(CHOREO2.PITCH_MAX, Math.asin(Math.max(-1, Math.min(1, nb.y)))));
      yawRate = wrapPi(ny - st.yaw) / dt;
      st.pitchRate = (np - st.pitch) / dt;
      st.yaw = ny; st.pitch = np;
    } else {
      st.pitchRate *= Math.exp(-dt / 300);
    }
    st.yawRate += (yawRate - st.yawRate) * (1 - Math.exp(-dt / CHOREO2.YAWRATE_TAU_MS));
    const bank = Math.max(0, tune(T, 'CHOREO_BANK'));
    const yawN = st.yawRate / (prof.turnRef * DEG / 1000);
    const rollDes = posture === 'disabled' ? 0 : -CHOREO.ROLL_MAX * Math.max(-1, Math.min(1, bank * yawN));
    st.roll += (rollDes - st.roll) * (1 - Math.exp(-dt / CHOREO.ROLL_TAU_MS));
  }
  return { q: quatFromYawPitchRoll(st.yaw, st.pitch, st.roll), yaw: st.yaw, pitch: st.pitch, roll: st.roll };
}

/**
 * KROK SILNIKA CV-3c: jasność wylotu dysz (0..1, × `CHOREO_PLUME_GAIN`) z prędkości pokazywanej (większa z: prędkość rysowana
 * zamierzona `speed` [j./ms], prędkość kotwicy) względem szczytu pętli klasy + skręt; odwrót — pełny ciąg; zniszczony — zgaszony.
 */
export function stepChoreo2Engine(st, { dtMs = 0, posture = 'engage', L = 0.016, speed = 0 } = {}, T = CHOREO_TUNING) {
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  const prof = CHOREO2_CLASS[st.cls] ?? CHOREO2_CLASS.destroyer;
  if (dt > 0) {
    const vRef = Math.max(1e-12, st.f2?.vRef || choreoEnvelope(st.cls, L, T) * prof.a * TAU / 12000);
    const turnN = Math.min(1, Math.abs(st.yawRate) / (prof.turnRef * DEG / 1000));
    let target;
    if (posture === 'disabled') target = 0;
    else if (posture === 'retreat') target = 1;
    else {
      const v = Math.max(Number.isFinite(speed) ? speed : 0, (st.vA || 0) * L / 1000);
      target = Math.min(1, (prof.idle + prof.speedGain * Math.min(1, v / vRef) + 0.25 * turnN) * (st.f2?.w?.plume ?? 0));
    }
    st.engine += (target - st.engine) * (1 - Math.exp(-dt / CHOREO.ENGINE_TAU_MS));
  }
  return Math.max(0, st.engine * Math.max(0, tune(T, 'CHOREO_PLUME_GAIN')));
}
