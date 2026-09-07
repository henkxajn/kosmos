// SunAnimationLogic — czysta arytmetyka warstwy „Sun 2.0" (V2 / slice S1).
//
// ⚠ ZERO importów, w tym three (precedens: HolotableCamera.js, StationRenderLogic.js).
//   To JEDYNY moduł tego slice'u, który importuje się pod node, więc JEDYNY, który da się
//   przypiąć WYKONANIEM. Reguła arca (VISUALS_PLAN §Ustalenia proceduralne): ThreeRenderer
//   nie importuje się pod node, a GLSL nie jest wykonywalny w sweepie — więc wszystko, co
//   da się policzyć POZA shaderem, ma stać tutaj i mieć keeper.
//
// ⚠ Lekcja V-266 (1079cd9, sprzed trzech commitów): nie zostawiamy tu funkcji bez
//   konsumenta. Czas życia protuberancji świadomie NIE wchodzi w S1 — dojdzie w S4 razem
//   ze swoim wołającym. Każda funkcja tutaj MA konsumenta w kodzie produkcyjnym:
//   sunDiscPx i sunDetailLevel czyta _tickSunMaterials, integratePhase czyta _tickClouds
//   (obrót gwiazdy), a granFadeEdges — KOSMOS.debug.sunInfo(). Ta ostatnia jest jedynym
//   ŚWIADOMYM wyprzedzeniem: konsumenta w shaderze dostanie dopiero w S2, ale jej
//   arytmetyka jest najbardziej ryzykowna w całym slice'ie i jako jedyna daje się
//   udowodnić wykonaniem, więc ląduje z keeperem o commit wcześniej.

const DEG2RAD = Math.PI / 180;

// ── Średnica tarczy gwiazdy na ekranie [CSS px] ──────────────────────────────
// LUSTRO wzoru z _tickGasMaterials — celowo TEN SAM, żeby gwiazda i gazowiec miały
// jedną drabinę i jeden model myślowy.
// ⚠ To jest PRZYBLIŻENIE MAŁEGO KĄTA. Dokładna sylwetka kuli ma średnicę
//   2·f·r/√(d²−r²), czyli więcej: +1,7 % przy d=20 i +7,9 % przy d≈10. Przybliżenie
//   jest odziedziczone ŚWIADOMIE (parytet z drabiną gazowca), nie przeoczone.
// ⚠ Wynik jest w CSS px, a bufor renderuje się z setPixelRatio = min(dpr·1,5, 2), więc
//   REALNA liczba fragmentów jest 2,25–4× większa. Progi drabiny też są w CSS px.
export function sunDiscPx({ radiusWorld, distance, viewportHeightPx, fovDeg }) {
  const halfH   = viewportHeightPx / 2;
  const tanHalf = Math.tan((fovDeg * DEG2RAD) / 2);
  return 2 * radiusWorld * halfH / Math.max(distance * tanHalf, 1e-4);
}

// ── Drabina oktaw ────────────────────────────────────────────────────────────
// ⚠ D-V2v: stopniujemy LICZBĘ OKTAW (pasmo częstotliwości — przeskok jest niewidoczny,
//   bo dokładana oktawa i tak jest poniżej rozdzielczości przy tym rozmiarze tarczy),
//   a NIE amplitudę (przeskok amplitudy widać jako „pop"). Amplituda gaśnie płynnie po
//   px już w shaderze, nie tutaj. Dlatego drabina NIE potrzebuje histerezy (U5).
export function sunDetailLevel(px, { pxFull, pxMed, cap }) {
  const lvl = px >= pxFull ? 2 : (px >= pxMed ? 1 : 0);
  return Math.min(lvl, cap);
}

// ── Solver brzegów wygaszania granulacji (D-V2e) ─────────────────────────────
// PROBLEM: próg bloomu (UnrealBloomPass, threshold 1.0) jest bramką niemal BINARNĄ —
// LuminosityHighPassShader ma smoothWidth 0.01 i przepuszcza CAŁY teksel, nie nadwyżkę.
// Piksel 0.999 nie wnosi nic, 1.001 wnosi całość. Animowana granulacja przechodząca
// przez tę granicę sprawia więc, że MASKA bloomu wrze — a zmniejszenie amplitudy tego
// NIE naprawia (to nie jest problem wielkości, tylko przechodzenia przez próg).
//
// LEKARSTWO: poniżej `lo` granulacja jest PŁASKA (gran == neutral), więc kontur L=1
// przestaje zależeć od szumu i staje się czystą funkcją NdotV — czyli nieruchomym
// okręgiem, dokładnie jak dziś.
//
// ⚠ Brzegi liczy CPU per gwiazda, a nie stała: przy stałym progu (0.32 w jednej
//   z propozycji panelu) M z realnym neutralem 0.693 ma przecięcie przy 0.3966 —
//   czyli WEWNĄTRZ animowanego pasa, i limb wrze mimo „zabezpieczenia".
// ⚠ To samo liczenie daje ZA DARMO odporność na Dyson: przy etapie 4 uColor staje się
//   fioletowe przez alias V-248, lumaA spada ~4× i przecięcie samo wędruje w głąb
//   tarczy (M 0.397 → 0.529, G 0.031 → 0.746). Żadnej gałęzi per-etap nie ma i nie
//   trzeba — to jest cała odpowiedź na D-V2n.
const FADE_MARGIN = 1.30;          // zapas nad policzonym przecięciem
const FADE_EPS    = 0.06;          // zapas addytywny (przecięcia blisko zera)
export const FADE_LO_CAP = 0.85;   // sufit — nigdy nie gasimy CAŁEJ tarczy (importuje keeper)

// ⚠ DWA ZASTRZEŻENIA DLA S2, spisane póki kontrakt jest tani:
//   1. `lo === hi` (band 0 albo gałąź degeneracyjna) to w JS poprawna liczba, ale
//      w GLSL smoothstep(edge0, edge0, x) DZIELI PRZEZ ZERO i jest niezdefiniowane.
//      Shader musi albo dostać hi > lo z epsilonem, albo sam bramkować hi <= lo.
//   2. Model traktuje próg jako test PER FRAGMENT, a UnrealBloomPass thresholduje
//      dopiero PO zejściu do połowy rozdzielczości (bilinearnie ~ średnia 2×2), więc
//      realny kontur leży odrobinę GŁĘBIEJ w tarczy niż `cross`. Kalibrować pomiarem
//      na klatce, nie samą arytmetyką.
export function granFadeEdges({ lumaA, whiteCoef, whitePower, granNeutral, band }) {
  const p = whitePower * 1.7;
  // Luminancja Rec.709 tarczy przy granulacji trzymanej na neutralu.
  const L = (N) => lumaA * (0.35 + 0.65 * Math.pow(N, 0.65)) * granNeutral
                 + whiteCoef * Math.pow(N, p);

  // Degeneracje: jeśli tarcza NIE przecina progu, nie ma czego gasić.
  //   L(1) <= 1 → cała tarcza pod progiem (nic nie bloomuje).
  //   L(0) >= 1 → cała tarcza nad progiem (bloomuje w całości, kontur nie istnieje).
  if (L(1) <= 1 || L(0) >= 1) return { cross: null, lo: 0, hi: 0 };

  // L rośnie monotonicznie z NdotV, więc przecięcie jest dokładnie jedno.
  let lo = 0, hi = 1;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    if (L(m) < 1) lo = m; else hi = m;
  }
  const cross = lo;
  const fadeLo = Math.min(FADE_LO_CAP, cross * FADE_MARGIN + FADE_EPS);
  const fadeHi = Math.min(1, fadeLo + band);
  // ⚠ INWERSJA GWARANCJI: gdy przecięcie wypadnie powyżej sufitu, `lo` ląduje PONIŻEJ
  //   niego i płaska strefa kończy się PRZED konturem — czyli granulacja znów przechodzi
  //   przez próg i limb wrze, dokładnie to, czemu ta funkcja ma zapobiegać. Dziś stan
  //   nieosiągalny, ale blisko: etap 4 Dysona klasy F daje cross 0.8231 przy sufcie 0.85.
  //   Sygnał jest ZWRACANY, a nie połykany — S2 ma go czytać, nie odkrywać na gate'cie.
  return { cross, lo: fadeLo, hi: fadeHi, inverted: fadeLo <= cross };
}

// ── Akumulacja fazy (D-V2u) ──────────────────────────────────────────────────
// ⚠ Faza AKUMULUJE SIĘ, nigdy nie liczy się jako ω·t. Różnica jest widoczna dokładnie
//   wtedy, gdy gate kręci pokrętłem: przy akumulacji zmiana ω to zmiana PRĘDKOŚCI,
//   przy ω·t to natychmiastowy SKOK o Δω·t. To jest V-270 — w ścieżce gazowca
//   (uGasTime rośnie monotonicznie, a shader liczy gasOmega·uGasTime) zmiana OMEGA_DEG
//   z 6 na 12 po dziesięciu minutach przekręca pasy o ~10 pełnych obrotów w jednej
//   klatce. Arc V1 stroił to pokrętło dwa razy.
// ⚠ Obrót gwiazdy nie potrzebuje osobnego stanu — jego akumulatorem JEST rotation.y
//   mesha. Ta funkcja istnieje jako przypięty KONTRAKT, nie jako magazyn.
export function integratePhase(phase, ratePerSec, dt) {
  return phase + ratePerSec * dt;
}
