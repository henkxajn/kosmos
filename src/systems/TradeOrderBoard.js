// TradeOrderBoard — Order Board (Rynek): ręczne zlecenia kupna/sprzedaży gracz↔AI (S3.5b)
//
// Gracz wystawia zlecenie KUP/SPRZEDAJ na konkretną kolonię AI (z którą ma traktat handlowy
// i gdy posiada warp = ion_drives). Cena = parytet z handlem cywilnym
// (CivilianTradeSystem.getLocalPrice, strona importera). Płatność ZERO-SUM (gracz↔AI).
// Rozliczenie PO 1 ROKU GRY (deliverYear, zegar timeSystem.gameTime), z ponowną walidacją —
// wojna/brak środków/brak towaru ⇒ anulowanie zlecenia (all-or-nothing).
//
// Stan kolejki: gameState.tradeOrders (serializowany automatycznie — BEZ migracji save).
// Komunikacja:
//   Nasłuchuje: 'time:tick' → _tick() (rozlicza zlecenia, których deliverYear minął)
//   Emituje:    'tradeOrder:placed'    { order }
//               'tradeOrder:delivered' { order }
//               'tradeOrder:cancelled' { orderId, order, reason }
//
// Reason kodów (cancelled): player_cancel | colony_lost | agreement_broken |
//                           insufficient_funds | insufficient_goods

import EventBus from '../core/EventBus.js';
import gameState from '../core/GameState.js';
import { BASE_PRICE, TRADEABLE_GOODS } from '../data/TradeValuesData.js';

const DELAY_YEARS = 1.0; // opóźnienie dostawy (lata gry — absolutny zegar timeSystem.gameTime)

export class TradeOrderBoard {
  constructor(colonyManager) {
    this.colonyManager = colonyManager;
    this._seq = 0;
    this._onTick = () => this._tick();
    EventBus.on('time:tick', this._onTick);
  }

  dispose() {
    EventBus.off('time:tick', this._onTick);
  }

  // ── Dostęp do kolejki (live ref z gameState) ─────────────────────────────
  _orders() {
    let arr = gameState.get('tradeOrders');
    if (!Array.isArray(arr)) { arr = []; gameState.set('tradeOrders', arr, 's3.5b:init'); }
    return arr;
  }

  // ── Wystawienie zlecenia ─────────────────────────────────────────────────
  // spec: { side:'buy'|'sell', goodId, qty, playerColonyId, aiColonyId }
  // Settle-at-delivery → BEZ escrow: walidujemy tylko poprawność + bramkę, cena lock teraz.
  placeOrder(spec) {
    const { side, goodId, qty, playerColonyId, aiColonyId } = spec ?? {};
    if (side !== 'buy' && side !== 'sell') return { ok: false, reason: 'bad_side' };
    if (!goodId || !TRADEABLE_GOODS.includes(goodId)) return { ok: false, reason: 'bad_good' };
    if (!(qty > 0)) return { ok: false, reason: 'bad_qty' };

    const cm = this.colonyManager;
    const playerCol = cm?.getColony?.(playerColonyId);
    if (!playerCol) return { ok: false, reason: 'no_colony' };
    if (playerCol.ownerEmpireId) return { ok: false, reason: 'not_player_colony' };
    if (playerCol.isOutpost)     return { ok: false, reason: 'is_outpost' };

    const aiCol = cm?.getColony?.(aiColonyId);
    if (!aiCol || !aiCol.ownerEmpireId) return { ok: false, reason: 'no_ai_colony' };
    const aiEmpireId = aiCol.ownerEmpireId;

    // Bramka: warp (ion_drives) + traktat handlowy (jak handel cywilny cross-empire).
    if (!(window.KOSMOS?.techSystem?.isResearched?.('ion_drives') ?? false))
      return { ok: false, reason: 'no_warp' };
    if (!(window.KOSMOS?.diplomacySystem?.hasTradeAgreement?.(aiEmpireId) ?? false))
      return { ok: false, reason: 'no_agreement' };

    // Cena = parytet z handlem cywilnym; importer = gracz (buy) / AI (sell).
    const importer = side === 'buy' ? playerCol : aiCol;
    const civ = window.KOSMOS?.civilianTradeSystem;
    const unitPrice = (civ?.getLocalPrice)
      ? civ.getLocalPrice(goodId, importer)
      : (BASE_PRICE[goodId] ?? 1);
    const total = unitPrice * qty;

    const now = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const order = {
      id: `to_${++this._seq}_${Date.now().toString(36)}`,
      side, goodId, qty,
      unitPrice, total,
      playerColonyId, aiColonyId, aiEmpireId,
      placedYear: now,
      deliverYear: now + DELAY_YEARS,
    };
    this._orders().push(order);
    EventBus.emit('tradeOrder:placed', { order });
    return { ok: true, orderId: order.id };
  }

  cancelOrder(orderId) {
    const arr = this._orders();
    const idx = arr.findIndex(o => o.id === orderId);
    if (idx < 0) return false;
    const [order] = arr.splice(idx, 1);
    EventBus.emit('tradeOrder:cancelled', { orderId, order, reason: 'player_cancel' });
    return true;
  }

  getOrders(filter = {}) {
    const arr = this._orders();
    if (filter.playerColonyId) return arr.filter(o => o.playerColonyId === filter.playerColonyId);
    return arr.slice();
  }

  // ── Tick: rozlicz zlecenia, których deliverYear minął ────────────────────
  _tick() {
    if (!window.KOSMOS?.civMode) return;
    const now = window.KOSMOS?.timeSystem?.gameTime;
    if (now == null) return;

    const arr = this._orders();
    // Iteruj malejąco — bezpieczne usuwanie podczas iteracji (FIFO efektywnie zachowane).
    for (let i = arr.length - 1; i >= 0; i--) {
      const order = arr[i];
      if (now < order.deliverYear) continue;
      const result = this._settle(order); // { delivered:true } albo { reason }
      arr.splice(i, 1);
      if (result.delivered) EventBus.emit('tradeOrder:delivered', { order });
      else EventBus.emit('tradeOrder:cancelled', { orderId: order.id, order, reason: result.reason });
    }
  }

  // Rozliczenie all-or-nothing. Zwraca {delivered:true} albo {reason}.
  _settle(order) {
    const cm = this.colonyManager;
    const playerCol = cm?.getColony?.(order.playerColonyId);
    const aiCol     = cm?.getColony?.(order.aiColonyId);
    if (!playerCol || !aiCol) return { reason: 'colony_lost' };

    // Wojna mogła zerwać traktat (S3.4) — anuluj zlecenie w locie.
    if (!(window.KOSMOS?.diplomacySystem?.hasTradeAgreement?.(order.aiEmpireId) ?? false))
      return { reason: 'agreement_broken' };

    const g = order.goodId;
    const pRes = playerCol.resourceSystem;
    const aRes = aiCol.resourceSystem;
    if (!pRes || !aRes) return { reason: 'colony_lost' };

    if (order.side === 'buy') {
      // Gracz płaci Kr, dostaje towar od AI.
      if ((playerCol.credits ?? 0) < order.total) return { reason: 'insufficient_funds' };
      if ((aRes.inventory?.get(g) ?? 0) < order.qty) return { reason: 'insufficient_goods' };
      playerCol.credits = (playerCol.credits ?? 0) - order.total;
      aiCol.credits     = (aiCol.credits ?? 0) + order.total;
      aRes.spend({ [g]: order.qty });
      pRes.receive({ [g]: order.qty });
    } else {
      // Gracz sprzedaje towar AI, dostaje Kr.
      if ((pRes.inventory?.get(g) ?? 0) < order.qty) return { reason: 'insufficient_goods' };
      if ((aiCol.credits ?? 0) < order.total) return { reason: 'insufficient_funds' };
      pRes.spend({ [g]: order.qty });
      aRes.receive({ [g]: order.qty });
      playerCol.credits = (playerCol.credits ?? 0) + order.total;
      aiCol.credits     = (aiCol.credits ?? 0) - order.total;
    }

    // Sync UI kredytów gracza (TopBar/panele) — mirror trade:creditsChanged.
    EventBus.emit('trade:creditsChanged', {
      colonyId: order.playerColonyId,
      credits: playerCol.credits,
      delta: order.side === 'buy' ? -order.total : order.total,
      purpose: 'order_board',
    });

    // S3.5b — zasil TradeLog (log aktywności + wykresy w zakładce Handel).
    // BUY = import do gracza, SELL = eksport od gracza. orderBoard:true → UIManager
    // pomija duplikat 📦 (wpis „🤝" z tradeOrder:delivered wystarcza w EventLogu).
    const now = window.KOSMOS?.timeSystem?.gameTime ?? order.deliverYear;
    const items = { [g]: order.qty };
    if (order.side === 'buy') {
      EventBus.emit('trade:imported', {
        colonyId: order.playerColonyId, year: now, items,
        vesselName: '🛒', sourceName: aiCol.name ?? order.aiColonyId, orderBoard: true,
      });
    } else {
      EventBus.emit('trade:exported', {
        colonyId: order.playerColonyId, year: now, items,
        vesselName: '🛒', targetName: aiCol.name ?? order.aiColonyId, orderBoard: true,
      });
    }
    return { delivered: true };
  }

  // Save/restore: kolejka żyje w gameState (serializacja automatyczna, bez migracji).
  // Brak własnej serialize() — gameState.serialize() obejmuje tradeOrders.
}
