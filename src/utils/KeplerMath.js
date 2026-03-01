// Matematyka orbitalna oparta na prawach Keplera
// Jednostki: AU (odległość), lata słoneczne (czas), masy słoneczne (masa)
//
// Keplera prawa:
// I.  Orbity są elipsami, gwiazda stoi w jednym ognisku
// II. Planeta zamiata równe pola w równych czasach (zachowanie momentu pędu)
// III. T² ∝ a³/M — okres kwadratowy proporcjonalny do sześcianu półosi

export const KeplerMath = {

  // Rozwiąż równanie Keplera: M = E - e·sin(E)
  // M = anomalia średnia (rad) — "gdzie byłaby planeta na kole"
  // e = mimośród orbity [0 = okrąg, 1 = parabola)
  // Zwraca: E = anomalia mimośrodowa (rad)
  // Metoda: iteracja Newtona-Raphsona (szybka zbieżność)
  solveKepler(M, e) {
    // Normalizuj M do zakresu [0, 2π]
    M = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    let E = M; // przybliżenie startowe
    const MAX_ITER = 50;
    const TOLERANCE = 1e-8;

    for (let i = 0; i < MAX_ITER; i++) {
      const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
      E += dE;
      if (Math.abs(dE) < TOLERANCE) break;
    }

    return E;
  },

  // Oblicz prawdziwą anomalię θ z anomalii mimośrodowej E
  // Prawdziwa anomalia: rzeczywisty kąt planety widziany z ogniska
  eccentricToTrueAnomaly(E, e) {
    // Wzór: tan(θ/2) = √((1+e)/(1-e)) · tan(E/2)
    const tanHalf = Math.sqrt((1 + e) / Math.max(1 - e, 0.0001)) * Math.tan(E / 2);
    return 2 * Math.atan(tanHalf);
  },

  // Oblicz promień wektorowy (odległość od ogniska/gwiazdy) w AU
  // a = półoś wielka (AU), e = mimośród, theta = prawdziwa anomalia (rad)
  // Równanie elipsy w biegunowych: r = a(1-e²)/(1+e·cos(θ))
  orbitalRadius(a, e, theta) {
    return (a * (1 - e * e)) / (1 + e * Math.cos(theta));
  },

  // Oblicz pozycję X, Y planety względem gwiazdy (w AU)
  // Gwiazda stoi w ognisku elipsy
  getPosition(a, e, theta) {
    const r = this.orbitalRadius(a, e, theta);
    return {
      x: r * Math.cos(theta),
      y: r * Math.sin(theta),
    };
  },

  // Oblicz okres orbitalny w latach słonecznych
  // III prawo Keplera: T = √(a³/M_gwiazdy)
  // a = półoś wielka (AU), starMass = masa gwiazdy (masy słoneczne)
  orbitalPeriod(a, starMass) {
    return Math.sqrt((a * a * a) / Math.max(starMass, 0.001));
  },

  // Aktualizuj anomalię średnią po upływie czasu dt (lata gry)
  // T = okres orbitalny (lata) — określa prędkość kątową
  updateMeanAnomaly(M, dt, T) {
    return M + (2 * Math.PI * dt) / T;
  },

  // Prędkość planety w bieżącym punkcie orbity (AU/rok, układ światowy 2D)
  // a = półoś wielka (AU), e = mimośród, theta = prawdziwa anomalia (rad)
  // omega = inclinationOffset (rad), starMass = masa gwiazdy (masy słoneczne)
  // Wzór: prędkości w układzie lokalnym orbity, obórcone o omega do układu światowego
  getPlanetVelocity(a, e, theta, omega, starMass) {
    const GM = 4 * Math.PI * Math.PI * starMass;   // AU³/rok²
    const p  = a * (1 - e * e);                     // semi-latus rectum (AU)
    const h  = Math.sqrt(Math.max(GM * p, 0));       // moment pędu właściwy (AU²/rok)

    // Prędkości w lokalnym układzie orbity (peryhelium wzdłuż osi X)
    const vx_loc = -h / p * Math.sin(theta);
    const vy_loc =  h / p * (e + Math.cos(theta));

    // Obrót o kąt omega (inclinationOffset) → układ światowy
    const cos_o = Math.cos(omega), sin_o = Math.sin(omega);
    return {
      x: vx_loc * cos_o - vy_loc * sin_o,
      y: vx_loc * sin_o + vy_loc * cos_o,
    };
  },

  // Przelicz wektor stanu (pozycja + prędkość) → elementy orbitalne
  // x, y — pozycja względem gwiazdy (AU), vx, vy — prędkość (AU/rok)
  // Zwraca { a, e, omega, T, M } lub null jeśli orbita hiperboliczna/paraboliczna
  stateToOrbit(x, y, vx, vy, starMass) {
    const GM = 4 * Math.PI * Math.PI * starMass;
    const r  = Math.sqrt(x * x + y * y);
    const v2 = vx * vx + vy * vy;

    // Półoś wielka (vis-viva: 1/a = 2/r − v²/GM)
    const inv_a = 2 / r - v2 / GM;
    if (inv_a <= 0) return null;   // orbita hiperboliczna — planeta ucieka
    const a = 1 / inv_a;

    // Moment pędu (przekrój 2D) — dodatni = ruch CCW
    const h = x * vy - y * vx;

    // Wektor ekscentryczności (Laplace–Runge–Lenz)
    const ex = vy * h / GM - x / r;
    const ey = -vx * h / GM - y / r;
    const e  = Math.min(Math.sqrt(ex * ex + ey * ey), 0.97);

    // Kąt peryhelium = inclinationOffset
    const omega = Math.atan2(ey, ex);

    // Okres orbitalny (III prawo Keplera)
    const T = Math.sqrt(a * a * a / starMass);

    // Prawdziwa anomalia w nowej orbicie
    let theta = Math.atan2(y, x) - omega;
    theta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    // Anomalia mimośrodowa i średnia
    const eC = Math.min(e, 0.9999);
    let E = 2 * Math.atan(Math.sqrt((1 - eC) / (1 + eC)) * Math.tan(theta / 2));
    if (E < 0) E += 2 * Math.PI;
    const M = E - e * Math.sin(E);

    return { a: Math.max(a, 0.05), e, omega, T, M };
  },
};
