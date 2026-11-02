// GalaxyFlightLogic — ARC GALAXY, krok G2-1 (docs/design/GALAXY_PLAN.md §4 G2; D-GX-14; rama F2): CZYSTA oś czasu LOTU
// między widokiem układu a płytą galaktyki. Orkiestracja (sterownik kamery, warstwy sceny, przełączenie układu, połknięte
// wejście) — `GalaxyModeController`; scena (warstwy kamery, gaśnięcie obiektów układu, płyta, niebo) — `ThreeRenderer`.
//   • SILNIK = sterownik czasowy wzoru lotu intro (`GameScene._runIntroCinematic`): co klatkę poza (θ, φ, dystans, cel)
//     z osi czasu, lerpy kontrolera zneutralizowane (`applyFlightPose` pisze pola docelowe = bieżące), łagodzenie po czasie
//     realnym — tempo nie zależy od kl./s; Esc → STAN KOŃCOWY (`flightEndState`); `frameSystem` wewnątrz `switchSystem`
//     przykryty, bo sterownik nakłada pozę w każdej klatce po przełączeniu.
//   • WYLOT (~1,4 s, `FLIGHT_OUT_MS`): HUD układu gaśnie (0–0,2 s, `HUD_FADE_MS`) → przejście logiczne w tryb galaktyki →
//     odjazd wzdłuż bieżącego kierunku patrzenia daleko za kadr układu (dystans w skali log.) → linie orbit i sprite'y gasną
//     (`systemFade`), siatki chowa wołający, gdy mają poniżej 0,5 px (`subPixelHidden`) → tarcza gwiazdy maleje do punktu, który
//     JEST punktem domu płyty (oba w początku świata) → przechył do skosu 0,92 / azymutu 0,6 w ostatniej tercji → płyta się
//     rozjaśnia, a 71 prawdziwych gwiazd nieba gaśnie W TYM SAMYM oknie (`plateFade` + `realFade` = 1 — jeden zbiór, nigdy
//     podwójnie) → nazwy galaktyki na końcu (`chromeAlpha`).
//   • WLOT (~1,2 s, `FLIGHT_IN_MS`): krótki lot nad płytą do gwiazdy celu (dystans podejścia `FLIGHT_APPROACH_LY`) → płyta
//     gaśnie do zera → w chwili `switchAt` (płyta i prawdziwe gwiazdy nieba na zerze) przejście logiczne w tryb układu,
//     a dla INNEGO układu — przesunięcie początku świata + `switchSystem` (poza bez zmian względem gwiazdy — niewidoczne;
//     niebo jedzie z kamerą) → zjazd do kadru układu (albo migawki 1:1 przy powrocie) → HUD układu wraca na końcu.
//   • Łagodzenie (`FLIGHT_EASE`): 0 — liniowe, 1 — smoothstep, 2 — smootherstep (domyślnie; zero prędkości i przyspieszenia
//     na końcach — jak lot intro).
// Czysty: bez three, bez DOM, bez `window` — czas (ms), pozy i pokrętła podaje wołający.

export const GALAXY_FLIGHT = Object.freeze({
  HUD_FADE_MS: 200,          // wylot: HUD układu gaśnie; wlot: HUD układu wraca w ostatnich tylu ms
  CHROME_OUT_MS: 150,        // wlot: nazwy / szyna / ping galaktyki gasną na starcie
  CHROME_IN_MS: 250,         // wylot: nazwy galaktyki rozjaśniają się (= `GALAXY_FADE_MS` twardego cięcia)
  // Ułamki czasu wylotu
  OUT_SYS_FADE: Object.freeze([0.15, 0.55]),   // linie orbit, sprite'y, punkty układu: 1 → 0
  OUT_PLATE: Object.freeze([0.55, 0.85]),      // płyta 0 → 1, prawdziwe gwiazdy nieba 1 → 0
  OUT_TILT_FROM: 2 / 3,                        // przechył do skosu galaktyki — ostatnia tercja
  OUT_LABELS_AT: 0.9,                          // nazwy galaktyki od tego ułamka (rozjaśnienie `CHROME_IN_MS`)
  // Ułamki czasu wlotu
  IN_SWITCH: 0.45,                             // przejście logiczne / przełączenie układu (płyta już na zerze)
  IN_PLATE_FROM: 0.12,                         // płyta 1 → 0 od tego ułamka do `IN_SWITCH`
  IN_SYS_TO: 0.85,                             // układ (i prawdziwe gwiazdy nowego nieba) 0 → 1 od `IN_SWITCH` do tego ułamka
  SUBPX: 0.5,                                  // [px] siatka mniejsza w rzucie — schowana w trakcie lotu
});

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const lerp = (a, b, e) => a + (b - a) * e;

/** Łagodzenie: 0 — liniowe, 1 — smoothstep, 2 — smootherstep (domyślnie). */
export function flightEase(x, kind = 2) {
  const t = clamp01(x);
  if (kind === 0) return t;
  if (kind === 1) return t * t * (3 - 2 * t);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Część okna [a; b] (ułamki czasu) w chwili `u` (0–1), z łagodzeniem. */
function windowEase(u, a, b, kind) {
  if (!(b > a)) return u >= b ? 1 : 0;
  return flightEase((u - a) / (b - a), kind);
}

/** Najkrótsza różnica kątów b − a (rad, w (−π; π]). */
export function shortestAngle(a, b) {
  let d = num(b) - num(a);
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Interpolacja dystansu w skali logarytmicznej (stałe tempo „odjazdu” niezależnie od skali). */
export function logLerp(a, b, e) {
  const A = Math.max(1e-6, num(a, 1)), B = Math.max(1e-6, num(b, 1));
  return A * Math.pow(B / A, e);
}

const poseOf = (p = {}) => ({
  theta: num(p.theta), phi: num(p.phi, 1.1), dist: Math.max(1e-3, num(p.dist, 85)),
  target: { x: num(p.target?.x), y: num(p.target?.y), z: num(p.target?.z) },
});

/** Czy lot jest włączony: pokrętło `FLIGHT` > 0 i system nie prosi o ograniczenie ruchu (`prefers-reduced-motion`). */
export function flightEnabled({ knob = 1, reducedMotion = false } = {}) {
  return Number(knob) > 0 && reducedMotion !== true;
}

/**
 * Plan WYLOTU.
 * @param {{ from:object, to:object, durationMs?:number, ease?:number, hudFadeMs?:number }} o — `from`: bieżąca poza kamery
 *   systemu; `to`: preset galaktyki (`galaxyPresetView`)
 */
export function buildFlyOutPlan({ from, to, durationMs = 1400, ease = 2, hudFadeMs = GALAXY_FLIGHT.HUD_FADE_MS } = {}) {
  const T = Math.max(1, num(durationMs, 1400));
  return {
    kind: 'out', T, ease: num(ease, 2), from: poseOf(from), to: poseOf(to),
    switchAt: Math.min(T, Math.max(0, num(hudFadeMs, GALAXY_FLIGHT.HUD_FADE_MS))),
    labelsAt: GALAXY_FLIGHT.OUT_LABELS_AT * T,
  };
}

/**
 * Plan WLOTU.
 * @param {{ from:object, star:{x,y,z}, approachDist:number, to:object, rebase?:boolean, mode?:'back'|'enter',
 *   systemId?:string|null, durationMs?:number, ease?:number }} o — `from`: bieżąca poza galaktyki; `star`: gwiazda celu
 *   w świecie (bieżąca kotwica płyty); `to`: poza końcowa w ramce PO przesunięciu początku (migawka albo kadr układu —
 *   kadr nowego układu wołający uzupełnia w chwili przełączenia: `plan.to.dist`)
 */
export function buildFlyInPlan({ from, star = { x: 0, y: 0, z: 0 }, approachDist = 1200, to, rebase = false, mode = 'enter',
  systemId = null, durationMs = 1200, ease = 2 } = {}) {
  const T = Math.max(1, num(durationMs, 1200));
  return {
    kind: 'in', mode, systemId: systemId == null ? null : String(systemId), rebase: rebase === true, T, ease: num(ease, 2),
    from: poseOf(from), star: { x: num(star.x), y: num(star.y), z: num(star.z) },
    approachDist: Math.max(1e-3, num(approachDist, 1200)), to: poseOf(to),
    switchAt: GALAXY_FLIGHT.IN_SWITCH * T,
  };
}

/**
 * Próbka lotu w chwili `tMs` (od startu; poza [0; T] — klamra).
 * @returns {{ t:number, u:number, done:boolean, pose:object, hudAlpha:number, systemFade:number, plateFade:number,
 *   realFade:number, chromeAlpha:number, afterSwitch:boolean }} — `hudAlpha`: krycie HUD trybu UKŁADU; `chromeAlpha`: krycie
 *   podwarstw trybu GALAKTYKI (nazwy, szyna, ping, trasy)
 */
export function sampleFlight(plan, tMs) {
  const T = plan?.T > 0 ? plan.T : 1;
  const t = Math.max(0, Math.min(T, num(tMs)));
  const u = t / T;
  const k = plan?.ease ?? 2;
  const G = GALAXY_FLIGHT;
  if (plan?.kind === 'out') {
    const A = plan.from, B = plan.to;
    const e = flightEase(u, k);                                  // odjazd i przesunięcie celu — cały lot
    const eTilt = windowEase(u, G.OUT_TILT_FROM, 1, k);          // przechył — ostatnia tercja
    const pose = {
      theta: A.theta + shortestAngle(A.theta, B.theta) * eTilt,
      phi: lerp(A.phi, B.phi, eTilt),
      dist: logLerp(A.dist, B.dist, e),
      target: { x: lerp(A.target.x, B.target.x, e), y: lerp(A.target.y, B.target.y, e), z: lerp(A.target.z, B.target.z, e) },
    };
    const plate = windowEase(u, G.OUT_PLATE[0], G.OUT_PLATE[1], k);
    return {
      t, u, done: t >= T, pose,
      hudAlpha: plan.switchAt > 0 ? 1 - clamp01(t / plan.switchAt) : 0,
      systemFade: 1 - windowEase(u, G.OUT_SYS_FADE[0], G.OUT_SYS_FADE[1], k),
      plateFade: plate, realFade: 1 - plate,
      chromeAlpha: clamp01((t - plan.labelsAt) / G.CHROME_IN_MS),
      afterSwitch: t >= plan.switchAt,
    };
  }
  // Wlot: faza A (nad płytą do gwiazdy celu), faza C (zjazd po przełączeniu).
  const S = plan.switchAt, A = plan.from, B = plan.to, st = plan.star;
  const afterSwitch = t >= S;
  let pose;
  if (!afterSwitch) {
    const e = flightEase(S > 0 ? t / S : 1, k);
    pose = {
      theta: A.theta, phi: A.phi,
      dist: logLerp(A.dist, plan.approachDist, e),
      target: { x: lerp(A.target.x, st.x, e), y: lerp(A.target.y, st.y, e), z: lerp(A.target.z, st.z, e) },
    };
  } else {
    const e = flightEase(T > S ? (t - S) / (T - S) : 1, k);
    // Po przełączeniu gwiazda celu stoi w początku świata (przesunięcie) — albo już tam stała (powrót, aktywny układ).
    const s0 = plan.rebase ? { x: 0, y: 0, z: 0 } : st;
    pose = {
      theta: A.theta + shortestAngle(A.theta, B.theta) * e,
      phi: lerp(A.phi, B.phi, e),
      dist: logLerp(plan.approachDist, B.dist, e),
      target: { x: lerp(s0.x, B.target.x, e), y: lerp(s0.y, B.target.y, e), z: lerp(s0.z, B.target.z, e) },
    };
  }
  const sysIn = afterSwitch ? windowEase(u, G.IN_SWITCH, G.IN_SYS_TO, k) : 0;
  return {
    t, u, done: t >= T, pose,
    hudAlpha: clamp01((t - (T - G.HUD_FADE_MS)) / G.HUD_FADE_MS),
    systemFade: sysIn,
    plateFade: 1 - windowEase(u, G.IN_PLATE_FROM, G.IN_SWITCH, k),
    realFade: sysIn,
    chromeAlpha: 1 - clamp01(t / G.CHROME_OUT_MS),
    afterSwitch,
  };
}

/** Stan KOŃCOWY lotu (Esc w trakcie, koniec osi czasu) — poza docelowa co do bitu. */
export function flightEndState(plan) {
  const s = sampleFlight(plan, plan?.T ?? 1);
  return { ...s, pose: poseOf(plan?.to) };
}

/**
 * Siatka schowana w trakcie lotu: promień tarczy w rzucie < `SUBPX` px (albo za kamerą).
 * @param {number} radiusWorld — promień sfery ograniczającej [j.]
 * @param {number} depth — głębia środka w przestrzeni widoku [j.]
 * @param {number} focalPx — px na 1 j. świata × głębia (`P[5] · H / 2`)
 */
export function subPixelHidden(radiusWorld, depth, focalPx, minPx = GALAXY_FLIGHT.SUBPX) {
  if (!(depth > 0)) return true;
  return (num(radiusWorld) * num(focalPx)) / depth < minPx;
}

/**
 * Poza dla kontrolera kamery (wzór `applyPose` lotu intro): pola bieżące = docelowe, lerpy kontrolera — no-op.
 * @param {object} cam — `ThreeCameraController` (pola `_theta`, `_phi`, `_dist`, `_targetDist`, `_target`, `_goalTarget`)
 */
export function applyFlightPose(cam, pose) {
  if (!cam || !pose) return;
  cam._goalTheta = null; cam._goalPhi = null;
  cam._theta = pose.theta; cam._phi = pose.phi;
  cam._dist = pose.dist; cam._targetDist = pose.dist;
  cam._target?.set?.(pose.target.x, pose.target.y, pose.target.z);
  cam._goalTarget?.set?.(pose.target.x, pose.target.y, pose.target.z);
}
