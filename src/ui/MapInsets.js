// MapInsets — ARKUSZ UI, U2-2 (UI_PLAN §4.3, §7.17): JEDNO źródło wcięć obszaru mapy 3D (px LOGICZNE UI) dla
// pływających paneli i kadru „Obserwuj”. Wzór: `TacticalDock.getReservedHeight` (rezerwa dolna Doku taktycznego),
// rozszerzony na cztery krawędzie.
//
//   left   — lewy outliner (układy i ciała), gdy widoczny nad mapą (decyzja 4: nie przy otwartym overlayu
//            pełnoekranowym ani przy rozwiniętym Doku taktycznym) — `LeftOutliner.getReservedWidth`;
//   right  — 0: prawy outliner jest w U2 wysuwaną szufladą NAD mapą (bez rezerwy). Kolumna i jej wcięcie — U3-2
//            (§4.4; m.in. kotwica zapasowa panelu statku). ⚠ Dwaj konsumenci rezerwują dziś prawe 150 px SAMI
//            (`BottomContext._bounds`, kadr „Obserwuj” `rightW`) — zostaje bez zmian do U3;
//   top    — dolna krawędź górnej belki (`TOP_BAND_H`, tryb cywilizacji) / górnego paska (`TOP_BAR_H`, Generator);
//   bottom — pasek nawigacji + listwa dziennika (`BOTTOM_RESERVED`, tryb cywilizacji) / dolny pasek (Generator)
//            + rezerwa Doku taktycznego.
//
// Czysta arytmetyka (`computeMapInsets`) + odczyt z żywego stanu (`getMapInsets(K)`, K = `window.KOSMOS`). Bez
// EventBusa; jedyne importy — stałe układu.

import { COSMIC, BOTTOM_RESERVED } from '../config/LayoutConfig.js';

/**
 * Wcięcia obszaru mapy z wymiarów składowych.
 * @param {{civMode?:boolean, leftW?:number, rightW?:number, dockH?:number}} p
 * @returns {{left:number, right:number, top:number, bottom:number}}
 */
export function computeMapInsets({ civMode = false, leftW = 0, rightW = 0, dockH = 0 } = {}) {
  const civ = civMode === true;
  const pos = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
  return {
    left:   civ ? pos(leftW) : 0,
    right:  civ ? pos(rightW) : 0,
    top:    civ ? COSMIC.TOP_BAND_H : COSMIC.TOP_BAR_H,
    bottom: (civ ? BOTTOM_RESERVED : COSMIC.BOTTOM_BAR_H) + pos(dockH),
  };
}

/**
 * Wcięcia z żywego stanu gry.
 * @param {object} [K] — `window.KOSMOS` (przekazany jawnie w keeperach)
 */
export function getMapInsets(K = (typeof window !== 'undefined' ? window.KOSMOS : null)) {
  return computeMapInsets({
    civMode: !!K?.civMode,
    leftW:   K?.leftOutliner?.getReservedWidth?.(K) ?? 0,
    rightW:  0,   // U3-2 — prawy outliner jako kolumna (dziś szuflada nad mapą)
    dockH:   K?.tacticalDock?.getReservedHeight?.() ?? 0,
  });
}
