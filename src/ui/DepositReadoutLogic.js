// ── Czysta logika odczytu złoża do UI (bez THREE — headless-testowalna) ──
// Wydzielone z ColonyOverlay._drawDepositRow (ColonyOverlay importuje THREE).
// Źródło prawdy dla „pozostało/początkowe + ETA wyczerpania".
//
// Guardy (C2):
//  1. Anomalia bez totalAmount (DiscoverySystem: {remaining:9999} bez totalAmount) →
//     fallback initial = remaining. NIGDY nie zwracamy NaN.
//  2. Tempo wydobycia jest per rok CYWILIZACYJNY (mining tick = civDeltaYears);
//     dzielimy ETA przez CIV_TIME_SCALE (12) → lata GRY (1 civYear = 1 miesiąc gry).
//  3. Brak aktywnego wydobycia (rate ≤ 0 / NaN, albo złoże wyczerpane) → etaYears=null
//     (UI rysuje „—", nie ETA).
//  4. ETA jest liniowym przybliżeniem (tempo maleje z remaining) — UI prefiksuje „~".

// Zwięzły format liczby: 500→"500", 1234→"1.2k", 96000→"96k", 1.5e6→"1.5M".
export function fmtCompact(n) {
  n = Math.round(Number(n) || 0);
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n < 1000) return sign + n;
  if (n < 1e6) {
    const k = n / 1000;
    return sign + (k < 10 ? k.toFixed(1).replace(/\.0$/, '') : String(Math.round(k))) + 'k';
  }
  const m = n / 1e6;
  return sign + (m < 10 ? m.toFixed(1).replace(/\.0$/, '') : String(Math.round(m))) + 'M';
}

/**
 * @param {object} summary  — element z DepositSystem.getDepositsSummary ({remaining, totalAmount, depleted})
 * @param {number} mineRatePerCivYear — ResourceSystem.getResourceBreakdown(id).producers.mine?.total (per rok CYW.)
 * @param {object} [opts] — { civTimeScale=12, warnYears=20 }
 * @returns {{remaining:number, initial:number, ratioStr:string, etaYears:(number|null), warn:boolean, depleted:boolean}}
 */
export function computeDepositReadout(summary, mineRatePerCivYear, opts = {}) {
  const civScale = opts.civTimeScale ?? 12;
  const warnYears = opts.warnYears ?? 20;

  const remaining = Math.max(0, Math.round(Number(summary?.remaining) || 0));
  // guard 1: brak totalAmount (anomalia) → fallback do remaining; initial nigdy < remaining, nigdy NaN
  const initRaw = summary?.totalAmount;
  const initial = Math.max(remaining, Math.round(Number(initRaw != null ? initRaw : remaining) || 0));
  const depleted = !!summary?.depleted || remaining <= 0;
  const ratioStr = fmtCompact(remaining) + '/' + fmtCompact(initial);

  let etaYears = null;
  let warn = false;
  const rate = Number(mineRatePerCivYear);
  // guard 3: brak wydobycia / wyczerpane → brak ETA
  if (!depleted && isFinite(rate) && rate > 0) {
    const etaCivYears = remaining / rate;
    const y = etaCivYears / civScale;   // guard 2: rok cyw. → rok gry
    if (isFinite(y) && y > 0) {
      etaYears = y;
      warn = y < warnYears;
    }
  }

  return { remaining, initial, ratioStr, etaYears, warn, depleted };
}
