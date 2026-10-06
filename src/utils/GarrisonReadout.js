// GarrisonReadout — AI GARRISON (G3-3): co gracz wie o garnizonie OBCEJ kolonii (podpis G3, domyślne potwierdzone przez
// właściciela 2026-10-04; D6: „liczebność garnizonu widać na poziomie wywiadu 'detailed'”).
//
// Jedna funkcja odpowiada na pytanie, jedna zamienia odpowiedź na tekst; obie czytają karta ciała (`BottomContext`) i okno
// zrzutu desantu (`DropTroopsModal`), więc te powierzchnie nie mogą się rozjechać:
//   • ciało bez kolonii albo kolonia gracza                → `null` (brak wiersza);
//   • gracz nie widzi jednostek właściciela na tym ciele   → `unknown` (fail-closed: bez `IntelSystem` — nieznany,
//     o ile gracz nie ma na ciele własnych jednostek);
//   • widzi, bo ma na ciele własne jednostki, bez `detailed` → `units`: żywe jednostki właściciela na tym ciele;
//   • `detailed`, imperium zmobilizowane                   → `units`: żywe jednostki właściciela na tym ciele;
//   • `detailed`, przed pierwszą mobilizacją               → `reserve`: liczba planera dla tego ciała, oznaczona jako rezerwa.
// ⚠ Finding 379 (odpowiedź (h) właściciela 2026-10-05): „czy gracz widzi” to TA SAMA reguła co na mapie kolonii —
//   `GroundVisibility.foreignGroundUnitsVisible` (`detailed` ALBO własne jednostki gracza na ciele); próg wywiadu
//   `GARRISON_READOUT_INTEL` mieszka tam (jedno źródło), tu jest re-eksportowany.
// ⚠ To odczyt, nie nowa mechanika wywiadu: próg `detailed` czytają już `NotificationCenter` i `SystemReveal`.
// ⚠ Usługi gry dostaje argumentem (`K`, w grze `window.KOSMOS`) — działa na prawdziwym świecie w keeperze.

import { t } from '../i18n/i18n.js';
import { planEmpireGarrison, readEmpireGarrisonSnapshot } from './GarrisonPlanner.js';
import { foreignGroundUnitsVisible, GARRISON_READOUT_INTEL } from './GroundVisibility.js';

/** Poziom wywiadu o imperium, od którego gracz zna liczebność jego garnizonu (D6) — źródło: `GroundVisibility`. */
export { GARRISON_READOUT_INTEL };

/**
 * Odczyt garnizonu ciała dla gracza.
 * @param {object} K — usługi gry (w grze `window.KOSMOS`)
 * @param {string} planetId
 * @returns {null | {planetId:string, empireId:string, kind:'unknown'|'units'|'reserve', count:number|null}}
 */
export function readGarrisonReadout(K, planetId) {
  const colony = K?.colonyManager?.getColony?.(planetId) ?? null;
  const owner = colony?.ownerEmpireId ?? null;
  if (!colony || !owner || owner === 'player') return null;
  const base = { planetId, empireId: owner };
  if (!foreignGroundUnitsVisible(K, planetId, owner)) return { ...base, kind: 'unknown', count: null };
  const detailed = K?.intelSystem?.isAtLeast?.(owner, GARRISON_READOUT_INTEL) === true;
  // Bez `detailed` gracz widzi wyłącznie to, co stoi na ciele (własne jednostki na nim) — rezerwa planu to wiedza wywiadu.
  if (!detailed || K?.empireRegistry?.isGarrisonMobilized?.(owner) === true) {
    const count = (K?.groundUnitManager?.getUnitsOnPlanet?.(planetId) ?? [])
      .filter(u => u?.owner === owner && (u.hp ?? 0) > 0).length;
    return { ...base, kind: 'units', count };
  }
  const plan = planEmpireGarrison(readEmpireGarrisonSnapshot(K, owner));
  const count = plan.perBody.find(b => b.planetId === planetId)?.count ?? 0;
  return { ...base, kind: 'reserve', count };
}

/**
 * Tekst odczytu (PL/EN) — wspólny dla karty ciała i okna zrzutu.
 * @param {ReturnType<typeof readGarrisonReadout>} readout
 * @returns {string|null}
 */
export function formatGarrisonReadout(readout) {
  if (!readout) return null;
  if (readout.kind === 'units') return t('garrison.readout.units', readout.count);
  if (readout.kind === 'reserve') return t('garrison.readout.reserve', readout.count);
  return t('garrison.readout.unknown');
}
