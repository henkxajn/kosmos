// WarDebug — dźwignie debug wojny w konsoli przeglądarki (ARC KONSOLE K2, Finding 735). Bez cudzysłowów:
//   KOSMOS.debug.war.forceBattle()    — rozstrzygnij bitwę zaznaczonej wojny teraz (dawny przycisk «WYMUŚ STARCIE (debug)»)
//   KOSMOS.debug.war.forceInvasion()  — desant przeciwnika zaznaczonej wojny na planecie domowej, bez bitwy kosmicznej
//                                       (dawny «WYMUŚ DESANT (debug)»)
//   KOSMOS.debug.war.target()         — na której wojnie zadziałają: { warId, empireId, via } albo { reason }
// Wojna = zaznaczona w panelu Wojen (W); bez zaznaczenia — pierwsza aktywna (ta, którą panel zaznacza przy otwarciu).
// Zaznaczona, ale zakończona → odmowa `war_not_active`. Te same funkcje woła stara ścieżka panelu (flaga OFF, do KZ).

import { forceWarBattle, forceWarInvasion, debugWarTarget, warOpponent } from '../ui/WarConsoleLogic.js';

export function warDebugHelpers({ getUIManager }) {
  const target = () => {
    const ov = getUIManager()?.overlayManager?.overlays?.war ?? null;
    return debugWarTarget(ov?._selectedId ?? null, window.KOSMOS?.warSystem);
  };
  const describe = (tg) => (tg.war ? { warId: tg.war.id, empireId: warOpponent(tg.war), via: tg.via } : { reason: tg.reason, warId: tg.warId ?? null });
  return {
    war: {
      target: () => describe(target()),
      forceBattle: () => {
        const tg = target();
        if (!tg.war) return { success: false, ...describe(tg) };
        return { ...describe(tg), ...forceWarBattle(tg.war.id) };
      },
      forceInvasion: () => {
        const tg = target();
        if (!tg.war) return { success: false, ...describe(tg) };
        return { ...describe(tg), ...forceWarInvasion(warOpponent(tg.war)) };
      },
    },
  };
}
