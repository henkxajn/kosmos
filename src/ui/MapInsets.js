// MapInsets — ARKUSZ UI, U2-2 (UI_PLAN §4.3, §7.17): JEDNO źródło wcięć obszaru mapy 3D (px LOGICZNE UI) dla
// pływających paneli i kadru „Obserwuj”. Wzór: `TacticalDock.getReservedHeight` (rezerwa dolna Doku taktycznego),
// rozszerzony na cztery krawędzie.
//
//   left   — lewy outliner (układy i ciała), gdy widoczny nad mapą (decyzja 4: nie przy otwartym overlayu
//            pełnoekranowym ani przy rozwiniętym Doku taktycznym) — `LeftOutliner.getReservedWidth`;
//   right  — prawy outliner (statki gracza, ARKUSZ UI U3-2), gdy widoczny nad mapą — `Outliner.getReservedWidth`
//            (`KOSMOS.rightOutliner`; 0, gdy schowany); kotwica zapasowa i clamp panelu statku, panel stacji, karta ciała
//            i kadr „Obserwuj” kończą się przed nim (karta i kadr od ARKUSZ UI U4-2, Finding 496 — dawniej 150 px na sztywno);
//   top    — dolna krawędź górnej belki (`TOP_BAND_H`, tryb cywilizacji) / górnego paska (`TOP_BAR_H`, Generator);
//   bottom — tryb cywilizacji: pasek nawigacji + listwa dziennika (`BOTTOM_RESERVED`) + PAS DOLNY albo rezerwa Doku
//            taktycznego (większa z dwóch — rezerwa Doku zawiera już prześwit nad pasem; ARKUSZ UI U4-2); Generator: dolny
//            pasek + rezerwa Doku.
//
// PAS DOLNY: `BOTTOM_STRIP_H` (ARKUSZ UI U3-2) — 20 px nad paskiem nawigacji; jedno źródło wysokości dla paska zegara,
// kolumn outlinerów, Doku taktycznego (prześwit nad pasem) i Dowództwa (treść ustępuje pasowi). Od U4-2 obszar mapy w
// trybie cywilizacji kończy się nad nim dla WSZYSTKICH konsumentów (pływające panele, karta ciała, kadr „Obserwuj”,
// strzałki krawędzi mapy), nie tylko dla kolumn. Od U4-3 pas biegnie od prawej krawędzi lewego outlinera (`left`) do
// prawej krawędzi ekranu, a LEWA kolumna schodzi do paska nawigacji (`leftColumnBottomInset`, decyzja (a)); prawa
// kończy się nad pasem (`outlinerBottomInset`).
//
// Czysta arytmetyka (`computeMapInsets`, `outlinerBottomInset`, `leftColumnBottomInset`) + odczyt z żywego stanu
// (`getMapInsets(K)`, K = `window.KOSMOS`). Bez EventBusa; jedyne importy — stałe układu.

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
    // ARKUSZ UI U4-2: w trybie cywilizacji dół zawsze NAD pasem dolnym; rezerwa Doku taktycznego (pas + prześwit = pas
    // dolny) wygrywa, gdy większa — liczba przy Doku bez zmian, bez Doku +20 px.
    bottom: civ ? BOTTOM_RESERVED + Math.max(BOTTOM_STRIP_H, pos(dockH)) : COSMIC.BOTTOM_BAR_H + pos(dockH),
  };
}

/**
 * ARKUSZ UI U3-2: dolne wcięcie KOLUMN outlinerów — nad pasem dolnym (`BOTTOM_STRIP_H` ponad paskiem nawigacji).
 * Rezerwa Doku taktycznego zawiera już prześwit nad pasem zegara, więc wygrywa większa z dwóch wartości. Od U4-2
 * `computeMapInsets` liczy dół tak samo dla całego obszaru mapy — dla wcięć z `getMapInsets` wynik = `insets.bottom`.
 * @param {{bottom:number}} insets — wynik `computeMapInsets` / `getMapInsets`
 * @param {boolean} civMode
 * @returns {number}
 */
export function outlinerBottomInset(insets, civMode) {
  const b = Number.isFinite(insets?.bottom) ? insets.bottom : 0;
  return civMode === true ? Math.max(b, BOTTOM_RESERVED + BOTTOM_STRIP_H) : b;
}

/**
 * ARKUSZ UI U4-3 (UI_PLAN §4.5, decyzja (a)): dolne wcięcie LEWEJ kolumny — do górnej krawędzi paska nawigacji (jak po
 * U2; pas dolny zaczyna się przy prawej krawędzi kolumny), nad Dokiem taktycznym, gdy widoczny (rezerwa Doku zawiera
 * prześwit nad pasem). Prawa kolumna kończy się nad pasem — `outlinerBottomInset`.
 * @param {{civMode?:boolean, dockH?:number}} p — `dockH` = rezerwa Doku taktycznego (`getReservedHeight`, 0 — ukryty)
 * @returns {number}
 */
export function leftColumnBottomInset({ civMode = false, dockH = 0 } = {}) {
  const d = Number.isFinite(dockH) && dockH > 0 ? dockH : 0;
  return (civMode === true ? BOTTOM_RESERVED : COSMIC.BOTTOM_BAR_H) + d;
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
