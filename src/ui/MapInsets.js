// MapInsets — ARKUSZ UI, U2-2 (UI_PLAN §4.3, §7.17): JEDNO źródło wcięć obszaru mapy 3D (px LOGICZNE UI) dla
// pływających paneli i kadru „Obserwuj”. Wzór: `TacticalDock.getReservedHeight` (rezerwa dolna Doku taktycznego),
// rozszerzony na cztery krawędzie.
//
//   left   — lewy outliner (układy i ciała), gdy widoczny nad mapą (decyzja 4: nie przy otwartym overlayu
//            pełnoekranowym ani przy rozwiniętym Doku taktycznym) — `LeftOutliner.getReservedWidth`;
//   right  — prawy outliner (statki gracza, ARKUSZ UI U3-2), gdy widoczny nad mapą — `Outliner.getReservedWidth`
//            (`KOSMOS.rightOutliner`); kotwica zapasowa i clamp panelu statku oraz panelu stacji kończą się przed nim.
//            ⚠ Dwaj konsumenci rezerwują prawe 150 px SAMI, także przy schowanym outlinerze (`BottomContext._bounds`,
//            kadr „Obserwuj” `rightW`) — bez zmian w U3 (kandydaci do U4);
//   top    — dolna krawędź górnej belki (`TOP_BAND_H`, tryb cywilizacji) / górnego paska (`TOP_BAR_H`, Generator);
//   bottom — pasek nawigacji + listwa dziennika (`BOTTOM_RESERVED`, tryb cywilizacji) / dolny pasek (Generator)
//            + rezerwa Doku taktycznego.
//
// ARKUSZ UI U3-2 — PAS DOLNY: `BOTTOM_STRIP_H` (dziś pasek zegara `BottomControlBar`, 20 px nad paskiem nawigacji).
// Oba outlinery kończą się NAD nim (`outlinerBottomInset`); U4 wypełni pas na całą szerokość. Pozostałe wcięcia bez
// zmian (pływające panele i kadr „Obserwuj” liczą dół jak dotąd).
//
// Czysta arytmetyka (`computeMapInsets`, `outlinerBottomInset`) + odczyt z żywego stanu (`getMapInsets(K)`,
// K = `window.KOSMOS`). Bez EventBusa; jedyne importy — stałe układu.

import { COSMIC, BOTTOM_RESERVED } from '../config/LayoutConfig.js';

/** Wysokość pasa dolnego nad paskiem nawigacji (px logiczne) — dziś pasek zegara (`BottomControlBar`). */
export const BOTTOM_STRIP_H = 20;

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
 * ARKUSZ UI U3-2: dolne wcięcie KOLUMN outlinerów — nad pasem dolnym (`BOTTOM_STRIP_H` ponad paskiem nawigacji).
 * Rezerwa Doku taktycznego zawiera już prześwit nad pasem zegara, więc wygrywa większa z dwóch wartości.
 * @param {{bottom:number}} insets — wynik `computeMapInsets` / `getMapInsets`
 * @param {boolean} civMode
 * @returns {number}
 */
export function outlinerBottomInset(insets, civMode) {
  const b = Number.isFinite(insets?.bottom) ? insets.bottom : 0;
  return civMode === true ? Math.max(b, BOTTOM_RESERVED + BOTTOM_STRIP_H) : b;
}

/**
 * Wcięcia z żywego stanu gry.
 * @param {object} [K] — `window.KOSMOS` (przekazany jawnie w keeperach)
 */
export function getMapInsets(K = (typeof window !== 'undefined' ? window.KOSMOS : null)) {
  return computeMapInsets({
    civMode: !!K?.civMode,
    leftW:   K?.leftOutliner?.getReservedWidth?.(K) ?? 0,
    rightW:  K?.rightOutliner?.getReservedWidth?.(K) ?? 0,   // ARKUSZ UI U3-2 — prawy outliner (statki) jako kolumna
    dockH:   K?.tacticalDock?.getReservedHeight?.() ?? 0,
  });
}
