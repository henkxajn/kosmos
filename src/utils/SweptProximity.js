// KOSMOS — CS-PHYS-c (Finding 776, plan COLONY_SPHERE §3.9.3): przemiatane progi zbliżenia (czysta matematyka).
//
// Progi zbliżenia (wykrycie, sensor-lock, wejście w walkę) były próbkowane raz na tik w pozycjach KOŃCOWYCH. Przy 1 r/s
// dwa szybkie statki lecące na siebie w ściśniętym układzie (k = 0.2: średnica wejścia w walkę 0.06 AU) przesuwają się
// w jednym tiku dalej niż ta średnica i mijają się bez walki. Test przemiatany: najmniejsza odległość dwóch punktów
// poruszających się JEDNOSTAJNIE po odcinkach a0→a1 i b0→b1 w tym samym czasie t ∈ [0, 1] (ruch względny r(t) = r0 + t·Δr).
// Gdy test punktowy w końcu odcinka już łapie, przemiatanie daje odległość ≤ niej — nigdy nie zmienia wyniku „jest w progu”.

/**
 * Najmniejsze zbliżenie dwóch ruchów jednostajnych w tym samym przedziale czasu.
 * @param {{x:number,y:number}} a0 @param {{x:number,y:number}} a1 — statek A: początek i koniec kroku
 * @param {{x:number,y:number}} b0 @param {{x:number,y:number}} b1 — statek B: początek i koniec kroku
 * @returns {{ dist: number, t: number, a: {x:number,y:number}, b: {x:number,y:number} }} — odległość (te same jednostki co
 *   wejście), chwila t ∈ [0, 1] i pozycje obu statków w tej chwili
 */
export function closestApproach(a0, a1, b0, b1) {
  const rx = a0.x - b0.x, ry = a0.y - b0.y;                          // ruch względny na początku
  const vx = (a1.x - a0.x) - (b1.x - b0.x), vy = (a1.y - a0.y) - (b1.y - b0.y);
  const vv = vx * vx + vy * vy;
  let t = vv > 0 ? -(rx * vx + ry * vy) / vv : 0;
  if (!(t > 0)) t = 0; else if (t > 1) t = 1;
  const a = { x: a0.x + (a1.x - a0.x) * t, y: a0.y + (a1.y - a0.y) * t };
  const b = { x: b0.x + (b1.x - b0.x) * t, y: b0.y + (b1.y - b0.y) * t };
  return { dist: Math.hypot(a.x - b.x, a.y - b.y), t, a, b };
}

// Granica skoku między próbkami (dłuższy = teleport, tylko test punktowy) — uzasadnienie przy ProximitySystem
// (poprawka po kontroli właściciela: stały limit 1 AU odrzucał zwykły lot przy długim tiku). Wspólne dla ProximitySystem
// i MovementOrderSystem (systemy nie importują się nawzajem).
export const SWEEP_SPEED_MARGIN  = 1.5;    // bezwymiarowe — zapas nad prędkością (kolejność słuchaczy tiku, zaokrąglenia)
export const SWEEP_STEP_FLOOR_AU = 0.05;   // AU — stały zapas skoku (drobne dociągnięcia, np. przylot misji do ciała)

/**
 * Największy możliwy przelot własnym napędem w czasie dtYears [AU]: speedAU [AU/rok] × mnożnik prędkości (tech, ≥ 1)
 * × SWEEP_SPEED_MARGIN × dt [lata fizyki] + SWEEP_STEP_FLOOR_AU.
 */
export function maxFlightStepAU(speedAU, speedMult, dtYears) {
  return Math.max(0, speedAU ?? 1.0) * Math.max(1, speedMult ?? 1) * SWEEP_SPEED_MARGIN * Math.max(0, dtYears ?? 0)
    + SWEEP_STEP_FLOOR_AU;
}

/** Najmniejsza odległość punktu q od odcinka p0→p1 (te same jednostki co wejście). */
export function segmentPointDistance(p0, p1, q) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const ll = dx * dx + dy * dy;
  let t = ll > 0 ? ((q.x - p0.x) * dx + (q.y - p0.y) * dy) / ll : 0;
  if (!(t > 0)) t = 0; else if (t > 1) t = 1;
  return Math.hypot(p0.x + dx * t - q.x, p0.y + dy * t - q.y);
}
