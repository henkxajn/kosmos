// PanelDockLogic — czysta logika układu paska zadań zminimalizowanych paneli (S3.4b C2).
// Node-importowalna (bez canvas / three) → smoke-testowalna. Widok w PanelDock.js.
//
// Belki dokowane w LEWYM-DOLNYM rogu obszaru mapy, tuż NAD dolnym paskiem nawigacji, i
// stackują się PIONOWO W GÓRĘ: i=0 = najniższa (przy nawigacji), kolejne wyżej.

/**
 * Policz prostokąty belek doku.
 * @param {number} count liczba zadokowanych paneli
 * @param {object} geom { H, barW, barH, gap, leftX, bottomReserved, marginBottom?, topLimit? }
 * @returns {Array<{x:number,y:number,w:number,h:number,index:number}>} — od najniższej (i=0)
 */
export function computeDockSlots(count, geom) {
  const {
    H, barW, barH, gap, leftX, bottomReserved,
    marginBottom = 6, topLimit = 0,
  } = geom;
  const baseY = H - bottomReserved - marginBottom - barH;   // lewy-górny róg najniższej belki
  const slots = [];
  for (let i = 0; i < count; i++) {
    const y = baseY - i * (barH + gap);
    if (y < topLimit) break;   // brak miejsca w pionie → overflow guard (nie rysuj poza górę)
    slots.push({ x: leftX, y, w: barW, h: barH, index: i });
  }
  return slots;
}
