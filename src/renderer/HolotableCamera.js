// HolotableCamera — czysta matematyka kamery „stołu holograficznego" Stratcomu.
//
// Wydzielone ze StratcomGalaxyRenderer, by dało się testować headless: ZERO importu
// (bez three, bez DOM). Renderer deleguje tu liczenie pozycji kamery; overlay liczy
// tu pan (przesuwanie widoku po dysku) oraz końce słupków (risers).
//
// Układ świata (Three): dysk galaktyki leży na płaszczyźnie XZ, oś Y = wysokość
// (galaktyczne z). Kamera orbituje sferycznie wokół `target`:
//   yaw   = azymut (obrót wokół osi Y),
//   pitch = kąt od zenitu (0 = znad dysku „z góry", π/2 = w płaszczyźnie dysku).
// Holotable = STAŁY skos (DEFAULT_OBLIQUE_PITCH) + pan (przesuwanie target po dysku).

// Zakres pitcha — identyczny jak w dotychczasowym setCameraOrbit (clamp 0.12 .. π-0.12).
export const PITCH_MIN = 0.12;
export const PITCH_MAX = Math.PI - 0.12;

// Stały skos „stołu": lekko pochylony widok (≈53° od zenitu). Wartość = dotychczasowy
// domyślny _galaxyPitch (0.92), więc wygląd startowy się nie zmienia — precyzyjna
// kalibracja kąta należy do H2 (live-gate, [[ui-visual-calibration-stop-if-wrong]]).
export const DEFAULT_OBLIQUE_PITCH = 0.92;

// Clamp pitcha do bezpiecznego zakresu (nie pozwala patrzeć dokładnie w zenit/nadir).
export function clampPitch(pitch) {
  return Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch));
}

// Pozycja kamery na sferze orbity wokół `target` (offset + target). Pitch clampowany
// wewnętrznie → wynik zawsze poprawny. Wierne lustro dotychczasowego setCameraOrbit.
export function orbitPosition(yaw, pitch, dist, target = null) {
  const tx = target?.x ?? 0, ty = target?.y ?? 0, tz = target?.z ?? 0;
  const ph = clampPitch(pitch);
  return {
    x: tx + dist * Math.sin(ph) * Math.cos(yaw),
    y: ty + dist * Math.cos(ph),
    z: tz + dist * Math.sin(ph) * Math.sin(yaw),
  };
}

// Przeciągnięcie ekranu (dxPx, dyPx) → delta targetu na dysku (world XZ) {dx, dz}.
// Skala „world na piksel" na płaszczyźnie targetu = 2·dist·tan(fov/2) / wysokość viewportu
// (im dalej kamera / im węższy viewport, tym więcej świata na piksel). Baza kierunków
// z azymutu kamery (yaw): right = „w prawo na ekranie", fwd = „w górę" (od kamery w głąb),
// oba rzutowane na dysk. „Przeciągnij zawartość": target przesuwa się PRZECIWNIE do kursora;
// znaki invertX/invertY zostają do kalibracji uczucia w H2 (handedness kamery).
export function panScreenToWorld(dxPx, dyPx, opts = {}) {
  const { dist = 40, fov = 50, yaw = 0, viewportHpx = 600, invertX = false, invertY = false } = opts;
  const fovRad = (fov * Math.PI) / 180;
  const worldPerPx = (2 * dist * Math.tan(fovRad / 2)) / Math.max(1, viewportHpx);
  const rightX = -Math.sin(yaw), rightZ = Math.cos(yaw);
  const fwdX   = -Math.cos(yaw), fwdZ   = -Math.sin(yaw);
  const sx = (invertX ? 1 : -1) * dxPx * worldPerPx;
  const sy = (invertY ? 1 : -1) * dyPx * worldPerPx;
  return { dx: rightX * sx + fwdX * sy, dz: rightZ * sx + fwdZ * sy };
}

// Końce słupka (risera) w przestrzeni Three dla gwiazdy o współrzędnych galaktycznych
// (gx, gy, gz). Mapowanie galaktyka→Three: X=gx, Y=gz (wysokość), Z=gy. Słupek biegnie
// od dysku (Y=0) do gwiazdy (Y=gz) — pokazuje pionowe „z" bez brył.
export function riserEndpoints(gx, gy, gz) {
  return {
    base: { x: gx, y: 0,  z: gy },
    top:  { x: gx, y: gz, z: gy },
  };
}
