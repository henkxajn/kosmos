// CivConsoleDebug — pomocniki bramki konsol Cywilizacji i Sfery Dysona (ARC KONSOLE K5). Bez cudzysłowów:
//   KOSMOS.debug.civConsole.state()          — stan Sfery (aktywna, fazy, segmenty X/20, bonus badań), etap gwiazdy 3D i czy są pierścienie
//                                              (Finding 743: po wczytaniu zapisu z postępem etap 3D = 0, pierścieni brak), frakcje, wybór konsoli
//   KOSMOS.debug.civConsole.stageDyson()     — otwiera fazę I tym samym zdarzeniem silnika, które emituje TechSystem po Inżynierii Sfery
//                                              Dysona (`dyson:engineeringUnlocked`); technologia NIE jest przyznana
//   KOSMOS.debug.civConsole.stageStock(1)    — dokłada na planetę domową surowce fazy I (Fe 20000, Si 10000, Cu 5000, Ti 2000);
//                                              stageStock(0) — zeruje w magazynie domu Si, Cu i Ti (blokada «brak surowców» dla segmentu 6)
//   KOSMOS.debug.civConsole.unlockFactions() — FactionSystem.unlock() (jak odkrycie losu Ziemi)
// Tylko pomocniki gracza-testera: mechanika bez zmian, nic nie zapisuje.

const PHASE1_STOCK = Object.freeze({ Fe: 20000, Si: 10000, Cu: 5000, Ti: 2000 });
const DRAIN_IDS = Object.freeze(['Si', 'Cu', 'Ti']);

function homeResources() {
  const K = window.KOSMOS;
  const hp = K?.homePlanet;
  return (hp ? K?.colonyManager?.getColony?.(hp.id)?.resourceSystem : null) ?? K?.resourceSystem ?? null;
}

export function civConsoleDebugHelpers({ getRenderer, getUIManager }) {
  const state = () => {
    const K = window.KOSMOS;
    const s = K?.dysonSystem?.getState?.() ?? null;
    const r = getRenderer?.();
    const om = getUIManager?.()?.overlayManager;
    return {
      dyson: s ? { active: s.active, phases: s.unlockedPhases, built: s.completedCount, researchBonus: s.researchBonus, stage: s.stage } : null,
      star3d: { stage: r?._dysonStage ?? null, rings: !!r?._dysonRingsGroup },
      factions: { locked: K?.factionSystem?.isLocked ?? null, slider: K?.factionSystem?.slider ?? null, zone: K?.factionSystem?.getCurrentZone?.() ?? null },
      console: { civSel: om?.overlays?.civilization?._kitSel ?? null, dysonSeg: om?.overlays?.dyson?._selectedSeg ?? null },
    };
  };
  return {
    civConsole: {
      state,
      stageDyson: () => { window.KOSMOS?.eventBus?.emit?.('dyson:engineeringUnlocked'); return state().dyson; },
      stageStock: (on = 1) => {
        const rs = homeResources();
        if (!rs) return { ok: false, reason: 'no_home_stock' };
        if (on) { rs.receive?.({ ...PHASE1_STOCK }); return { ok: true, added: { ...PHASE1_STOCK } }; }
        const take = {};
        for (const id of DRAIN_IDS) { const a = rs.getAmount?.(id) ?? 0; if (a > 0) take[id] = a; }
        if (Object.keys(take).length) rs.spend?.(take);
        return { ok: true, drained: take };
      },
      unlockFactions: () => { window.KOSMOS?.factionSystem?.unlock?.(); return state().factions; },
    },
  };
}
