// CivilianTradeSystem — automatyczny handel cywilny między koloniami
//
// Towary płyną z nadwyżki do niedoboru (gradient prosperity).
// Transfer ograniczony przez Trade Capacity (TC) kolonii.
// Generuje Kredyty (Kr) — walutę inwestycji strategicznych.
//
// Komunikacja:
//   Nasłuchuje: 'time:tick'              → _update(civDeltaYears)
//               'trade:spendCredits'     → spendCredits(colonyId, amount, purpose)
//               'trade:setOverride'      → setOverride(colonyId, goodId, mode)
//   Emituje:    'trade:connectionsUpdated' { connections[] }
//               'trade:creditsChanged'    { colonyId, credits, delta }
//               'trade:transferExecuted'  { from, to, goodId, qty, creditsDelta }

import EventBus from '../core/EventBus.js';
import { BASE_PRICE, scarcityMultiplier, routingPriority, TRADEABLE_GOODS } from '../data/TradeValuesData.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { DistanceUtils } from '../utils/DistanceUtils.js';

export class CivilianTradeSystem {
  constructor(colonyManager) {
    this.colonyManager = colonyManager;

    // Akumulator czasu (civ delta years)
    this._accumYears = 0;
    this._TICK_INTERVAL = 0.5; // co 0.5 civYear

    // Cache połączeń (przeliczany co tick)
    this._connections = [];

    // Statystyki per tick (do UI)
    this._lastTransfers = [];

    // Przepływy towarów per rok (persystentne między tickami, do panelu Handel)
    // Klucz: "fromId|toId", wartość: { goodId → qtyPerYear }
    this._flowsPerYear = new Map();

    // Akumulator transferów do logowania (agreguj 2 ticki = 1 rok, potem loguj)
    this._logAccum = new Map(); // "fromId|toId" → { fromId, toId, items: {goodId→qty} }
    this._logAccumTicks = 0;

    // Referencje do handlerów (potrzebne do off())
    this._onTick = ({ civDeltaYears }) => this._update(civDeltaYears);
    this._onSpend = ({ colonyId, amount, purpose }) => this.spendCredits(colonyId, amount, purpose);
    this._onOverride = ({ colonyId, goodId, mode }) => this.setOverride(colonyId, goodId, mode);

    this._setupListeners();
  }

  // ── Nasłuch zdarzeń ─────────────────────────────────────────────────────

  _setupListeners() {
    EventBus.on('time:tick', this._onTick);
    EventBus.on('trade:spendCredits', this._onSpend);
    EventBus.on('trade:setOverride', this._onOverride);
  }

  // ── Główna pętla ────────────────────────────────────────────────────────

  _update(civDeltaYears) {
    if (!window.KOSMOS?.civMode) return;

    this._accumYears += civDeltaYears;
    if (this._accumYears < this._TICK_INTERVAL) return;

    // Może być kilka ticków zaległych
    while (this._accumYears >= this._TICK_INTERVAL) {
      this._accumYears -= this._TICK_INTERVAL;
      this._halfYearlyTick();
    }
  }

  _halfYearlyTick() {
    const colonies = this.colonyManager.getAllColonies();
    if (!colonies || colonies.length < 2) return;

    // Filtruj kolonie zdolne do handlu (nie izolowane, mają port kosmiczny)
    const tradingColonies = colonies.filter(c => {
      if (c.tradeOverrides?.isolation) return false;
      return this._hasSpaceport(c);
    });
    if (tradingColonies.length < 2) return;

    // 1. Oblicz połączenia
    this._connections = this._calcAllConnections(tradingColonies);

    // 2. Alokuj TC per kolonia
    for (const col of tradingColonies) {
      col._tcPool = this._allocateTC(col);
      col._tcUsed = 0;
    }

    // 3. Route towary wg priorytetów
    this._lastTransfers = [];
    this._routeGoods(tradingColonies);

    // 3b. Oblicz persystentne przepływy per rok (do UI)
    this._calcFlowsPerYear();

    // 3c. Loguj transfery cywilne do TradeLog (zagregowane per para kolonii)
    this._logCivilianTransfers();

    // 4. Aktualizuj dane handlowe na koloniach
    this._updateColonyData(tradingColonies);

    // 5. Emit
    EventBus.emit('trade:connectionsUpdated', {
      connections: this._connections.map(c => ({
        fromId: c.from.planetId,
        toId: c.to.planetId,
        distance: c.distance,
        gradient: c.gradient,
      })),
    });
  }

  // ── Połączenia ──────────────────────────────────────────────────────────

  _calcAllConnections(colonies) {
    const connections = [];

    for (let i = 0; i < colonies.length; i++) {
      for (let j = i + 1; j < colonies.length; j++) {
        const a = colonies[i];
        const b = colonies[j];

        const dist = this._getDistance(a, b);
        const range = Math.max(this._getTradeRange(a), this._getTradeRange(b));

        // Sprawdź czy commodity_nexus daje nieograniczony zasięg
        const hasNexus = this._hasBuilding(a, 'commodity_nexus') ||
                         this._hasBuilding(b, 'commodity_nexus');

        if (!hasNexus && dist > range) continue;

        const prosA = a.prosperitySystem?.prosperity ?? 50;
        const prosB = b.prosperitySystem?.prosperity ?? 50;
        const gradient = Math.abs(prosA - prosB) / 100;

        connections.push({
          from: a,
          to: b,
          distance: dist,
          gradient,
          priority: gradient * 0.9 + 0.1,
          hasNexus,
        });
      }
    }

    // Sortuj wg priority malejąco
    connections.sort((a, b) => b.priority - a.priority);
    return connections;
  }

  // ── Trade Capacity ──────────────────────────────────────────────────────

  _allocateTC(colony) {
    const pop = colony.civSystem?.population ?? 0;
    const prosperity = colony.prosperitySystem?.prosperity ?? 50;

    // Bazowe TC z populacji + prosperity
    let tc = 200 * pop + Math.floor(prosperity / 20) * 50;

    // Bonus z budynków trade_hub
    tc += this._getBuildingBonus(colony, 'tcBonus');

    return tc;
  }

  // ── Routing towarów ─────────────────────────────────────────────────────

  _routeGoods(colonies) {
    // Zbierz wszystkie pary (goodId, exporter, importer) z priorytetem
    const transfers = [];

    for (const conn of this._connections) {
      for (const goodId of TRADEABLE_GOODS) {
        // Sprawdź blokady
        if (conn.from.tradeOverrides?.[goodId] === 'block') continue;
        if (conn.to.tradeOverrides?.[goodId] === 'block') continue;

        const surpA = this._surplusScore(goodId, conn.from);
        const surpB = this._surplusScore(goodId, conn.to);
        const defA = this._deficitScore(goodId, conn.from);
        const defB = this._deficitScore(goodId, conn.to);

        // A→B: A ma nadwyżkę, B ma deficyt
        if (surpA > 1.5 && defB > 1.0) {
          transfers.push({
            goodId, from: conn.from, to: conn.to, conn,
            score: surpA * defB * routingPriority(goodId) * conn.priority,
            surplus: surpA, deficit: defB,
          });
        }

        // B→A: B ma nadwyżkę, A ma deficyt
        if (surpB > 1.5 && defA > 1.0) {
          transfers.push({
            goodId, from: conn.to, to: conn.from, conn,
            score: surpB * defA * routingPriority(goodId) * conn.priority,
            surplus: surpB, deficit: defA,
          });
        }
      }
    }

    // Sortuj wg score malejąco
    transfers.sort((a, b) => b.score - a.score);

    // Wykonaj transfery ograniczone przez TC
    for (const tr of transfers) {
      const fromCol = tr.from;
      const toCol = tr.to;
      const goodId = tr.goodId;

      // Ile TC dostępne po obu stronach?
      const price = BASE_PRICE[goodId] ?? 1;
      const fromTcAvail = fromCol._tcPool - fromCol._tcUsed;
      const toTcAvail = toCol._tcPool - toCol._tcUsed;
      const tcAvail = Math.min(fromTcAvail, toTcAvail);
      if (tcAvail <= 0) continue;

      // Max transfer z TC
      const maxFromTC = tcAvail / price;

      // Max transfer z zapasu eksportera (30% nadwyżki × 0.5 bo half-year)
      const stock = this._getStock(goodId, fromCol);
      const consumption = this._getConsumption(goodId, fromCol);
      const surplus = Math.max(0, stock - consumption * 2); // zachowaj 2-letni zapas
      const maxFromSurplus = surplus * 0.3 * this._TICK_INTERVAL;

      // Efektywność routingu
      const efficiency = 1.0 + this._getBuildingBonus(fromCol, 'routingEfficiencyBonus')
                             + this._getBuildingBonus(toCol, 'routingEfficiencyBonus');

      const qty = Math.min(maxFromTC, maxFromSurplus) * Math.min(2.0, efficiency);
      if (qty < 0.01) continue;

      // Wykonaj transfer
      this._executeTransfer(goodId, qty, fromCol, toCol, tr.conn);
    }
  }

  _executeTransfer(goodId, qty, fromCol, toCol, conn) {
    const resSysFrom = fromCol.resourceSystem;
    const resSysTo = toCol.resourceSystem;
    if (!resSysFrom || !resSysTo) return;

    // Pobierz ze stock eksportera
    const available = resSysFrom.inventory?.get(goodId) ?? 0;
    const actualQty = Math.min(qty, available);
    if (actualQty < 0.01) return;

    resSysFrom.spend({ [goodId]: actualQty });
    resSysTo.receive({ [goodId]: actualQty });

    // Koszt TC
    const price = BASE_PRICE[goodId] ?? 1;
    const tcCost = actualQty * price;
    fromCol._tcUsed += tcCost;
    toCol._tcUsed += tcCost;

    // Generuj Kredyty
    const localPrice = price * scarcityMultiplier(
      resSysTo.inventory?.get(goodId) ?? 0,
      this._getConsumption(goodId, toCol)
    );

    // Eksporter: 6% wartości, Importer: 3%
    const exportCredits = actualQty * localPrice * 0.06;
    const importCredits = actualQty * localPrice * 0.03;

    // Bonus za dalekie trasy (commodity_nexus)
    let distBonus = 1.0;
    if (conn.distance > 10 && conn.hasNexus) {
      distBonus += 0.30; // +30% Kr za dalekie trasy
    }

    fromCol.credits = (fromCol.credits ?? 0) + exportCredits * distBonus;
    toCol.credits = (toCol.credits ?? 0) + importCredits * distBonus;

    this._lastTransfers.push({
      goodId, qty: actualQty,
      fromId: fromCol.planetId, toId: toCol.planetId,
      exportKr: exportCredits * distBonus,
      importKr: importCredits * distBonus,
    });
  }

  // ── Metryki per-towar per-kolonia ───────────────────────────────────────

  _surplusScore(goodId, colony) {
    const stock = this._getStock(goodId, colony);
    const consumption = this._getConsumption(goodId, colony);
    if (consumption <= 0) return stock > 0 ? 10 : 0;
    return stock / (consumption * 10); // >1.5 = eksportuj
  }

  _deficitScore(goodId, colony) {
    const stock = this._getStock(goodId, colony);
    const consumption = this._getConsumption(goodId, colony);
    const pendingDemand = this._getPendingDemand(goodId, colony);
    // Rozłóż jednorazowy demand na 5 lat → wirtualna konsumpcja
    const effectiveConsumption = consumption + (pendingDemand / 5);
    if (effectiveConsumption <= 0) return 0; // nie potrzebuje
    const ratio = stock / effectiveConsumption;
    return 1 / Math.max(0.1, ratio); // >1.0 = importuj
  }

  // Demand z pending orders (budynki + statki) dla danej kolonii
  _getPendingDemand(goodId, colony) {
    let total = 0;
    // Budynki — z BuildingSystem.getPendingDemand()
    const buildDemand = colony.buildingSystem?.getPendingDemand?.() ?? {};
    total += buildDemand[goodId] ?? 0;
    // Statki — z colony.pendingShipOrders
    for (const order of (colony.pendingShipOrders ?? [])) {
      total += order.cost[goodId] ?? 0;
    }
    return total;
  }

  _getStock(goodId, colony) {
    return colony.resourceSystem?.inventory?.get(goodId) ?? 0;
  }

  _getConsumption(goodId, colony) {
    // Roczna konsumpcja (z producentów — ujemne stawki)
    const producers = colony.resourceSystem?._producers;
    if (!producers) return 0;
    let consumption = 0;
    for (const rates of producers.values()) {
      if (rates[goodId] && rates[goodId] < 0) {
        consumption += Math.abs(rates[goodId]);
      }
    }
    return consumption;
  }

  // ── Budynki handlowe — bonusy ───────────────────────────────────────────

  _getBuildingBonus(colony, bonusKey) {
    const bSys = colony.buildingSystem;
    if (!bSys?._active) return 0;

    let total = 0;
    for (const entry of bSys._active.values()) {
      const bDef = BUILDINGS[entry.building.id];
      if (!bDef) continue;
      const val = bDef[bonusKey];
      if (val != null && typeof val === 'number') {
        total += val * (entry.level ?? 1);
      }
    }
    return total;
  }

  _hasBuilding(colony, buildingId) {
    const bSys = colony.buildingSystem;
    if (!bSys?._active) return false;
    for (const entry of bSys._active.values()) {
      if (entry.building.id === buildingId) return true;
    }
    return false;
  }

  _hasSpaceport(colony) {
    const bSys = colony.buildingSystem;
    if (!bSys?._active) return false;
    for (const entry of bSys._active.values()) {
      const bDef = BUILDINGS[entry.building.id];
      if (bDef?.isSpaceport) return true;
    }
    return false;
  }

  // ── Zasięg handlu ───────────────────────────────────────────────────────

  _getTradeRange(colony) {
    let range = 10; // bazowy zasięg: 10 AU

    // Bonus z trade_hub
    range += this._getBuildingBonus(colony, 'tradeRangeBonus');

    // Mnożnik z trade_beacon
    if (this._hasBuilding(colony, 'trade_beacon')) {
      const bDef = BUILDINGS.trade_beacon;
      range *= bDef.tradeRangeMult ?? 1.0;
    }

    return range;
  }

  // ── Odległość ───────────────────────────────────────────────────────────

  _getDistance(colA, colB) {
    const entityA = colA.planet;
    const entityB = colB.planet;
    if (!entityA || !entityB) return Infinity;
    return DistanceUtils.orbitalAU(entityA, entityB);
  }

  // ── Persystentne przepływy per rok ──────────────────────────────────────

  _calcFlowsPerYear() {
    this._flowsPerYear.clear();
    for (const tr of this._lastTransfers) {
      const key = `${tr.fromId}|${tr.toId}`;
      if (!this._flowsPerYear.has(key)) this._flowsPerYear.set(key, {});
      const goods = this._flowsPerYear.get(key);
      goods[tr.goodId] = (goods[tr.goodId] ?? 0) + tr.qty / this._TICK_INTERVAL;
    }
  }

  /**
   * Akumuluj transfery cywilne i co pełny rok (2 ticki) wyemituj do TradeLog.
   */
  _logCivilianTransfers() {
    // Akumuluj bieżący tick
    for (const tr of this._lastTransfers) {
      const key = `${tr.fromId}|${tr.toId}`;
      if (!this._logAccum.has(key)) {
        this._logAccum.set(key, { fromId: tr.fromId, toId: tr.toId, items: {} });
      }
      const entry = this._logAccum.get(key);
      entry.items[tr.goodId] = (entry.items[tr.goodId] ?? 0) + tr.qty;
    }
    this._logAccumTicks++;

    // Emituj co 2 ticki (1 pełny civYear)
    if (this._logAccumTicks < 2) return;
    this._logAccumTicks = 0;

    if (this._logAccum.size === 0) return;
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;

    for (const { fromId, toId, items } of this._logAccum.values()) {
      // Pomiń znikome transfery
      const totalQty = Object.values(items).reduce((s, v) => s + v, 0);
      if (totalQty < 0.1) continue;

      const fromCol = this.colonyManager.getColony(fromId);
      const toCol = this.colonyManager.getColony(toId);
      const fromName = fromCol?.name ?? '???';
      const toName = toCol?.name ?? '???';

      EventBus.emit('trade:exported', {
        colonyId: fromId,
        year: gameYear,
        items: { ...items },
        vesselName: '🏪 civ',
        targetName: toName,
      });

      EventBus.emit('trade:imported', {
        colonyId: toId,
        year: gameYear,
        items: { ...items },
        vesselName: '🏪 civ',
        sourceName: fromName,
      });
    }

    this._logAccum.clear();
  }

  // ── Aktualizacja danych na koloniach ────────────────────────────────────

  _updateColonyData(colonies) {
    // Wyzeruj creditsPerYear — oblicz z transferów tego tiku
    for (const col of colonies) {
      // Zsumuj Kr wygenerowane w tym tiku
      let krThisTick = 0;
      for (const tr of this._lastTransfers) {
        if (tr.fromId === col.planetId) krThisTick += tr.exportKr;
        if (tr.toId === col.planetId) krThisTick += tr.importKr;
      }
      // Przelicz na /rok (tick = 0.5 civYear)
      col.creditsPerYear = krThisTick / this._TICK_INTERVAL;

      // TC
      col.tradeCapacity = col._tcPool ?? 0;

      // Aktywne połączenia
      col.activeTradeConnections = this._connections
        .filter(c => c.from.planetId === col.planetId || c.to.planetId === col.planetId)
        .map(c => ({
          partnerId: c.from.planetId === col.planetId ? c.to.planetId : c.from.planetId,
          partnerName: c.from.planetId === col.planetId ? c.to.name : c.from.name,
          distance: c.distance,
          gradient: c.gradient,
        }));

      // Emit zmiana kredytów
      if (krThisTick > 0) {
        EventBus.emit('trade:creditsChanged', {
          colonyId: col.planetId,
          credits: col.credits ?? 0,
          delta: krThisTick,
        });
      }

      // Cleanup temp fields
      delete col._tcPool;
      delete col._tcUsed;
    }
  }

  // ── API publiczne ───────────────────────────────────────────────────────

  /**
   * Wydaj Kredyty z konta kolonii
   * @returns {boolean} true jeśli stać
   */
  spendCredits(colonyId, amount, purpose) {
    const colony = this.colonyManager.getColony(colonyId);
    if (!colony) return false;
    if ((colony.credits ?? 0) < amount) return false;

    colony.credits -= amount;
    EventBus.emit('trade:creditsChanged', {
      colonyId,
      credits: colony.credits,
      delta: -amount,
      purpose,
    });
    return true;
  }

  /**
   * Ustaw override handlu na kolonii
   * @param {string} mode - 'block' | 'priority' | null (usuń)
   */
  setOverride(colonyId, goodId, mode) {
    const colony = this.colonyManager.getColony(colonyId);
    if (!colony) return;

    if (!colony.tradeOverrides) colony.tradeOverrides = {};

    if (mode === null || mode === undefined) {
      delete colony.tradeOverrides[goodId];
    } else {
      colony.tradeOverrides[goodId] = mode;
    }
  }

  /**
   * Ustaw izolację handlową kolonii
   */
  setIsolation(colonyId, isolated) {
    const colony = this.colonyManager.getColony(colonyId);
    if (!colony) return;
    if (!colony.tradeOverrides) colony.tradeOverrides = {};

    if (isolated) {
      colony.tradeOverrides.isolation = true;
    } else {
      delete colony.tradeOverrides.isolation;
    }
  }

  // ── Gettery do UI ───────────────────────────────────────────────────────

  getCredits(colonyId) {
    const colony = this.colonyManager.getColony(colonyId);
    return colony?.credits ?? 0;
  }

  getCreditsPerYear(colonyId) {
    const colony = this.colonyManager.getColony(colonyId);
    return colony?.creditsPerYear ?? 0;
  }

  getTradeCapacity(colonyId) {
    const colony = this.colonyManager.getColony(colonyId);
    return colony?.tradeCapacity ?? 0;
  }

  getConnections(colonyId) {
    const colony = this.colonyManager.getColony(colonyId);
    return colony?.activeTradeConnections ?? [];
  }

  getOverrides(colonyId) {
    const colony = this.colonyManager.getColony(colonyId);
    return colony?.tradeOverrides ?? {};
  }

  getLastTransfers() {
    return [...this._lastTransfers];
  }

  /**
   * Przepływy towarów per rok dla danej kolonii.
   * Zwraca [{ partnerId, partnerName, goodId, qtyPerYear, direction }]
   */
  getFlowsForColony(colonyId) {
    const result = [];
    for (const [key, goods] of this._flowsPerYear) {
      const [fromId, toId] = key.split('|');
      if (fromId !== colonyId && toId !== colonyId) continue;
      const isExport = fromId === colonyId;
      const partnerId = isExport ? toId : fromId;
      const partnerCol = this.colonyManager.getColony(partnerId);
      const partnerName = partnerCol?.name ?? '???';
      for (const [goodId, qtyPerYear] of Object.entries(goods)) {
        if (qtyPerYear < 0.01) continue;
        result.push({ partnerId, partnerName, goodId, qtyPerYear, direction: isExport ? 'export' : 'import' });
      }
    }
    return result;
  }

  getAllConnections() {
    return [...this._connections];
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  destroy() {
    EventBus.off('time:tick', this._onTick);
    EventBus.off('trade:spendCredits', this._onSpend);
    EventBus.off('trade:setOverride', this._onOverride);
  }
}
