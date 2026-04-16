// ═══════════════════════════════════════════════════════════════
// BaseBot — abstrakcyjna klasa bota
// ─────────────────────────────────────────────────────────────
// Bot dostaje observation (state gry) + actionCatalog, zwraca akcję.
// decideAction() wywoływana co N civYears przez Ticker.
// ═══════════════════════════════════════════════════════════════

export class BaseBot {
  constructor({ name = 'BaseBot', seed = null } = {}) {
    this.name = name;
    this.seed = seed;
  }

  /**
   * Główny interfejs botowy.
   * @param {object} observation — migawka stanu (civYear, resources, pop, techs, colonies, ...)
   * @param {ActionCatalog} catalog — do enumeracji/próbkowania akcji
   * @returns {object|null} akcja lub null (=wait)
   */
  decideAction(observation, catalog) {
    throw new Error('BaseBot.decideAction() musi być zaimplementowana w podklasie');
  }
}

/** Pomocnik: buduj observation z aktualnego stanu KOSMOS */
export function buildObservation({ core, civYear }) {
  const K = window.KOSMOS;
  const active = K?.colonyManager?.getColony?.(K?.colonyManager?._activePlanetId ?? K?.homePlanet?.id);
  const resources = {};
  const inv = active?.resourceSystem?.inventory ?? active?.resourceSystem?._inventory;
  if (inv) {
    for (const [k, v] of inv) {
      if (v > 0.01) resources[k] = Math.round(v * 100) / 100;
    }
  }
  return {
    civYear,
    gameTime: K?.timeSystem?.gameTime ?? 0,
    pop: active?.civSystem?.population ?? 0,
    resources,
    energyBalance: active?.resourceSystem?.energy?.balance ?? 0,
    researched: K?.techSystem?._researched ? Array.from(K.techSystem._researched) : [],
    colonies: K?.colonyManager?.getAllColonies?.()?.length ?? 0,
    vesselCount: K?.vesselManager?.getAllVessels?.()?.length ?? 0,
    credits: active?.credits ?? 0,
    buildings: active?.buildingSystem?._active?.size ?? 0,
    homeAlive: !!K?.homePlanet && K?.civMode === true,
  };
}
