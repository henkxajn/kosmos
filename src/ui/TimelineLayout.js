// TimelineLayout — CZYSTA geometria osi czasu rejestru K3 (Obraz Operacyjny, Faza 3).
// Node-importowalna, zero canvas. Paski WYŁĄCZNIE z FleetPictureLogic.buildTimelineRows
// (ta sama para danych zasila duchy ETA trybu Y — koncepcja §3.3). Oś jest READ-ONLY.

// Zakres widoku osi (lata gry) + prostokąt w px logicznych.
export const TIMELINE_MIN_SPAN_YEARS = 1;     // maks. zoom-in
export const TIMELINE_MAX_SPAN_YEARS = 100;   // maks. zoom-out
export const TIMELINE_DEFAULT_SPAN   = 8;     // startowy zakres: teraz → +8 lat

/** Domyślny viewport osi: [teraz − 5% zakresu, teraz + zakres]. */
export function defaultViewport(nowYear, x0, x1, span = TIMELINE_DEFAULT_SPAN) {
  const lead = span * 0.05;
  return { startYear: nowYear - lead, endYear: nowYear - lead + span, x0, x1 };
}

export function yearToX(year, vp) {
  const t = (year - vp.startYear) / (vp.endYear - vp.startYear);
  return vp.x0 + t * (vp.x1 - vp.x0);
}

export function xToYear(x, vp) {
  const t = (x - vp.x0) / (vp.x1 - vp.x0);
  return vp.startYear + t * (vp.endYear - vp.startYear);
}

/**
 * Zoom zakresu wokół roku-piwota (scroll na osi). factor>1 = oddal, <1 = przybliż.
 * Zwraca NOWY viewport (clamp do MIN/MAX span).
 */
export function zoomViewport(vp, factor, pivotYear) {
  const span = (vp.endYear - vp.startYear) * factor;
  const clamped = Math.max(TIMELINE_MIN_SPAN_YEARS, Math.min(TIMELINE_MAX_SPAN_YEARS, span));
  const t = (pivotYear - vp.startYear) / (vp.endYear - vp.startYear);
  const startYear = pivotYear - t * clamped;
  return { ...vp, startYear, endYear: startYear + clamped };
}

/**
 * Layout pasków: wiersze buildTimelineRows → lane'y (wiersz per statek, kolejność
 * wejściowa = kolejność tabeli — spójność tabela↔oś) + paski przycięte do zakresu.
 * Pasek całkowicie poza zakresem znika; częściowo w zakresie → clamp + flaga clipped.
 * @param {Array} timelineRows — z buildTimelineRows (entryId/confidence/bars)
 * @param {object} vp — viewport
 * @returns {Array<{entryId, lane, confidence, bars:[{x0,x1,kind,labelKey,clipped}]}>}
 */
export function layoutTimelineRows(timelineRows, vp) {
  const out = [];
  let lane = 0;
  for (const row of timelineRows ?? []) {
    const bars = [];
    for (const b of row.bars ?? []) {
      if (!Number.isFinite(b.t0) || !Number.isFinite(b.t1)) continue;
      if (b.t1 <= vp.startYear || b.t0 >= vp.endYear) continue;   // poza zakresem
      const t0 = Math.max(b.t0, vp.startYear);
      const t1 = Math.min(b.t1, vp.endYear);
      bars.push({
        x0: yearToX(t0, vp),
        x1: yearToX(t1, vp),
        kind: b.kind,
        labelKey: b.labelKey,
        clipped: t0 !== b.t0 || t1 !== b.t1,
      });
    }
    out.push({ entryId: row.entryId, lane, confidence: row.confidence, bars });
    lane++;
  }
  return out;
}

/** X linii „teraz" (null gdy poza zakresem widoku). */
export function nowLineX(nowYear, vp) {
  if (nowYear < vp.startYear || nowYear > vp.endYear) return null;
  return yearToX(nowYear, vp);
}

/** Podziałka osi: „ładny" krok lat dla ~targetTicks etykiet. */
export function timelineTicks(vp, targetTicks = 8) {
  const span = vp.endYear - vp.startYear;
  const raw = span / targetTicks;
  const steps = [0.25, 0.5, 1, 2, 5, 10, 20, 25, 50];
  const step = steps.find(s => s >= raw) ?? steps[steps.length - 1];
  const first = Math.ceil(vp.startYear / step) * step;
  const out = [];
  for (let y = first; y <= vp.endYear + 1e-9; y += step) {
    out.push({ year: y, x: yearToX(y, vp) });
  }
  return out;
}
