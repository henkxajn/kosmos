// DysonStageLogic — etap Sfery Dysona widoczny w scenie 3D (Finding 743). Czysta, testowalna pod node.
//
// Etap gwiazdy (0–4, `getDysonVisualStage`) wynika WYŁĄCZNIE z liczby ukończonych segmentów (zapisywanej w save), więc po wczytaniu
// zapisu i po każdej przebudowie układu (`ThreeRenderer.switchSystem` zeruje pierścienie) da się go odtworzyć bez nowego stanu.
// Sfera otacza gwiazdę układu macierzystego gracza: w innym układzie widok ma etap 0 (bez pierścieni, światło gwiazdy bez zmian).

import { getDysonVisualStage } from '../data/DysonData.js';
import { HOME_SYSTEM_ID } from '../utils/SystemExploration.js';

/**
 * Etap Sfery dla renderowanego układu.
 * @param {number} completedCount — ukończone segmenty (DysonSystem.completedCount)
 * @param {string|null} viewSystemId — id renderowanego układu (null = układ macierzysty, jak przed nadaniem id)
 * @param {string|null} homeSystemId — id układu macierzystego gracza (null = HOME_SYSTEM_ID)
 * @returns {number} 0–4
 */
export function dysonViewStage(completedCount, viewSystemId, homeSystemId) {
  const n = Math.max(0, Math.floor(Number(completedCount) || 0));
  if (n === 0) return 0;
  const view = String(viewSystemId ?? HOME_SYSTEM_ID);
  const home = String(homeSystemId ?? HOME_SYSTEM_ID);
  return view === home ? getDysonVisualStage(n) : 0;
}
