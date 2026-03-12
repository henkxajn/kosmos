// EventBusBridge — przechwytuje zdarzenia gry i przekazuje do MetricsCollector
// Podpina się na EventBus po inicjalizacji HeadlessRuntime

export class EventBusBridge {
  /**
   * @param {EventBus} eventBus — singleton EventBus gry
   * @param {MetricsCollector} collector — instancja MetricsCollector
   */
  constructor(eventBus, collector) {
    this.eventBus = eventBus;
    this.collector = collector;
    this._handlers = [];
  }

  /** Podepnij wszystkie listenery */
  attach() {
    const eb = this.eventBus;
    const c = this.collector;

    // ── Zasoby ──
    this._on(eb, 'resource:changed', ({ resources, inventory }) => {
      c.onResourceChanged(resources, inventory);
    });
    this._on(eb, 'resource:shortage', ({ resource, deficit }) => {
      c.onShortage(resource, deficit);
    });

    // ── Populacja ──
    this._on(eb, 'civ:popBorn', ({ population }) => {
      c.onPopBorn(population);
    });
    this._on(eb, 'civ:popDied', ({ cause, population }) => {
      c.onPopDied(cause, population);
    });
    this._on(eb, 'civ:epochChanged', ({ epoch }) => {
      c.onEpochChanged(epoch);
    });

    // ── Morale / kryzysy ──
    this._on(eb, 'civ:unrest', () => {
      c.onCrisis('unrest');
    });
    this._on(eb, 'civ:unrestLifted', () => {
      c.onCrisisLifted('unrest');
    });
    this._on(eb, 'civ:famine', () => {
      c.onCrisis('famine');
    });

    // ── Technologie ──
    this._on(eb, 'tech:researched', ({ tech, restored }) => {
      if (restored) return; // nie licz odtworzonych z save
      c.onTechResearched(tech?.id ?? tech);
    });

    // ── Budynki ──
    this._on(eb, 'planet:buildResult', ({ success, tile, buildingId, reason }) => {
      c.onBuildResult(success, buildingId, reason);
    });
    this._on(eb, 'planet:constructionComplete', ({ tileKey, buildingId }) => {
      c.onConstructionComplete(buildingId);
    });
    this._on(eb, 'planet:upgradeResult', ({ success, tile, level }) => {
      if (success) c.onUpgrade(tile?.buildingId, level);
    });
    this._on(eb, 'planet:demolishResult', ({ success, tile, downgrade }) => {
      c.onDemolish(success, downgrade);
    });

    // ── Flota ──
    this._on(eb, 'fleet:shipCompleted', ({ shipId }) => {
      c.onShipCompleted(shipId);
    });

    // ── Ekspedycje ──
    this._on(eb, 'expedition:reconComplete', ({ scope, discovered }) => {
      c.onReconComplete(scope, discovered);
    });
    this._on(eb, 'expedition:disaster', ({ expedition }) => {
      c.onExpeditionDisaster(expedition);
    });
    this._on(eb, 'expedition:colonyFounded', ({ expedition, planetId }) => {
      c.onColonyFounded(planetId);
    });
    this._on(eb, 'expedition:missionReport', ({ expedition, gained, multiplier }) => {
      c.onMissionReport(expedition, gained, multiplier);
    });

    // ── Kolonie ──
    this._on(eb, 'outpost:founded', ({ colony }) => {
      c.onOutpostFounded(colony);
    });

    // ── Czas ──
    this._on(eb, 'time:tick', ({ gameTime }) => {
      c.onTick(gameTime);
    });
  }

  /** Helper — rejestruj handler (do cleanup) */
  _on(eb, event, handler) {
    eb.on(event, handler);
    this._handlers.push({ event, handler });
  }

  /** Odepnij wszystkie listenery */
  detach() {
    for (const { event, handler } of this._handlers) {
      this.eventBus.off(event, handler);
    }
    this._handlers = [];
  }
}
