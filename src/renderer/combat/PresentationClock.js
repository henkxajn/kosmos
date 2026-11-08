// PresentationClock — zegar WARSTWY PREZENTACJI walki (ARC COMBAT VISUALS, krok CV-2a, D-CV-10 (a), Finding 616).
//
// ⚠ ZERO IMPORTÓW. Moduł wykonuje się pod node, więc „pauza = pauza” i „bez nadrabiania” sprawdza keeper WYKONANIEM
//   (wzór LogDepthChunks.js / SunAnimationLogic.js), nie lekturą.
//
// Po co osobny zegar. Dzisiejszy silnik FX liczy wiek efektu z bezwzględnego `performance.now()`: efekt gra dalej
// w pauzie i gaśnie niewidziany, gdy pętla renderu stoi (karta w tle, przejęty canvas) — Finding 616. Surowy zegar
// starcia `simClockMs` też się nie nadaje: rośnie skokami po 16 ms co ~58 ms przy oglądanym starciu (rwanie).
// Ten zegar płynie krokiem klatki czasu REALNEGO wyłącznie wtedy, gdy gra biegnie; w pauzie stoi; po wznowieniu rusza
// od miejsca, w którym stanął — zaległości pauzy NIE nadrabia (D-CV-10). `simClockMs` służy najwyżej za odniesienie
// FAZY (`anchor`), nigdy za źródło ruchu.
//
// ⚠ SUFIT KROKU jest obowiązkowy, nie ostrożnościowy (lekcja ANIM_DT_MAX_S z C2): requestAnimationFrame zamiera
//   w karcie w tle, a pętla renderu ma bramki (`_contextLost`, `_renderingEnabled`). Powrót po minucie dałby krok
//   liczony w SEKUNDACH i jednym skokiem przewinąłby każdy efekt. Sufit 100 ms = 6 klatek przy 60 fps.
//
// Jednostki: wszystkie czasy w MILISEKUNDACH (czas realny klatki, czas prezentacji).

/** [ms] sufit jednego kroku zegara (karta w tle / długa klatka — bez skoku). */
export const PRESENTATION_DT_MAX_MS = 100;

export class PresentationClock {
  /**
   * @param {{ maxStepMs?: number }} [opts]
   */
  constructor({ maxStepMs = PRESENTATION_DT_MAX_MS } = {}) {
    this.maxStepMs = maxStepMs > 0 ? maxStepMs : PRESENTATION_DT_MAX_MS;
    this.nowMs = 0;              // [ms] czas prezentacji — płynie tylko, gdy gra biegnie
    this._lastRealMs = null;     // [ms] czas realny poprzedniego `tick` (null = pierwszy tick)
    this.lastStepMs = 0;         // [ms] krok zastosowany w ostatnim `tick` (diagnostyka, fxStats)
    this.paused = false;         // stan z ostatniego `tick`
    this._anchorSimMs = null;    // odniesienie fazy: zegar starcia przy ostatnim `anchor`
    this._anchorPresMs = 0;      //                   i czas prezentacji w tej chwili
  }

  /**
   * Jeden krok zegara — raz na klatkę pętli renderu.
   * Pauza: krok 0, ale stempel czasu realnego idzie dalej — dzięki temu po wznowieniu pierwszy krok to JEDNA klatka,
   * nie cała pauza (bez nadrabiania). Krok ujemny / NaN (zegar cofnięty, ta sama klatka) = 0.
   * @param {number} realNowMs — czas realny tej klatki (`performance.now()`)
   * @param {{ paused?: boolean }} [state]
   * @returns {number} krok zastosowany do czasu prezentacji [ms]
   */
  tick(realNowMs, { paused = false } = {}) {
    let step = 0;
    if (Number.isFinite(realNowMs)) {
      if (this._lastRealMs != null) {
        const raw = realNowMs - this._lastRealMs;
        step = raw > 0 ? Math.min(raw, this.maxStepMs) : 0;
      }
      this._lastRealMs = realNowMs;
    }
    this.paused = !!paused;
    if (this.paused) step = 0;
    this.nowMs += step;
    this.lastStepMs = step;
    return step;
  }

  /**
   * Zapomnij stempel czasu realnego — następny `tick` zaczyna od kroku 0 (np. po wznowieniu przejętego canvasu).
   * Czas prezentacji zostaje.
   */
  resync() { this._lastRealMs = null; }

  /**
   * Odniesienie FAZY: zapamiętaj zegar starcia (`simClockMs`) w bieżącej chwili prezentacji. Ruchu z tego nie liczymy —
   * kolejne kroki (rejestr salw, CV-4) czytają, ile czasu prezentacji minęło od nadejścia rundy.
   * @param {number} simClockMs
   * @returns {{ simMs: number, presMs: number }}
   */
  anchor(simClockMs) {
    this._anchorSimMs = Number.isFinite(simClockMs) ? simClockMs : null;
    this._anchorPresMs = this.nowMs;
    return { simMs: this._anchorSimMs, presMs: this._anchorPresMs };
  }

  /** Czas prezentacji od ostatniego `anchor` [ms] (0 przed pierwszym). */
  sinceAnchorMs() { return this._anchorSimMs == null ? 0 : this.nowMs - this._anchorPresMs; }
}
