// StationPanel — STAN przypięcia stacji orbitalnej (S4-2; od REFORMY ZAKŁADEK T4 bez rysunku).
//
// Dawny pływający panel informacyjny stacji (S4-2, S3.4b) zastąpiło przypięcie etykiety stacji na warstwie HUD (T2 —
// `LabelPinLogic`, `HudLabelLayer`): treść, listy (ruch, moduły, magazyn) i przyciski rysuje warstwa etykiet. Ten moduł
// trzyma wyłącznie STAN „stacja przypięta” (`visible` + `_stationId`) — czyta go `ClickIntentLogic.readClickSelection`
// (reguła D-UI-5) i przypięcie — oraz cele dwóch przycisków przypięcia (`_onHit`: „Zarządzaj”, ✕). Nazwa klasy i uchwyt
// `KOSMOS.stationPanel` bez zmian (decyzja właściciela T4, Q3).
//
// Self-managed cykl życia: `station:selected` → przypięcie, `station:destroyed` / `body:deselected` → zdjęcie (bez
// przełączenia układu — 486 — i bez zamiany przypięcia ciało → stacja — T2); przełączenie układu zdejmuje przypięcie
// stacji spoza układu docelowego (`UIManager`, 491).

import EventBus                   from '../core/EventBus.js';
import EntityManager              from '../core/EntityManager.js';
import { resolveStationTabHost }  from '../utils/StationGroup.js';   // C6c-3 — „Zarządzaj” → zakładka Stacja
import { PIN_SWAP_REASON }        from './LabelPinLogic.js';         // REFORMA ZAKŁADEK T2 — zamiana przypięcia ciało → stacja

export class StationPanel {
  constructor() {
    this.visible = false;
    this._stationId = null;

    EventBus.on('station:selected', (e) => {
      this._stationId = e?.stationId ?? null;
      this.show();
      this._markDirty();
    });
    EventBus.on('station:destroyed', (e) => {
      if (e?.stationId === this._stationId) { this.hide(); this._markDirty(); }
    });
    EventBus.on('body:deselected', (p) => {
      // ARKUSZ UI U2-3 (Finding 486): zamknięcie karty ciała przy przełączeniu układu NIE zdejmuje przypięcia stacji —
      // przeżywa przełączenie jak dotąd (drugi klik reguły §7.8 w stację z innego układu przełącza układ, przypięcie zostaje).
      if (p?.reason === 'system_switch') return;
      // REFORMA ZAKŁADEK T2 (D-TR-5 (a)): odznaczenie ciała przy przypięciu TEJ stacji (zamiana przypięcia) — zostaje.
      if (p?.reason === PIN_SWAP_REASON) return;
      if (this.visible) { this.hide(); this._markDirty(); }
    });
  }

  show() { this.visible = true; }
  hide() { this.visible = false; }

  // ── Helpery stanu ─────────────────────────────────────────────────────────
  _station() {
    if (!this._stationId) return null;
    const s = EntityManager.get(this._stationId);
    return (s && s.type === 'station') ? s : null;
  }

  _markDirty() {
    const um = window.KOSMOS?.uiManager;
    if (um) um._dirty = true;
  }

  // ── Cele przycisków przypięcia stacji (`LabelPinLogic.runPinAction`) ──────
  _onHit(zone) {
    if (!zone) return;
    if (zone.type === 'close') { this.hide(); this._markDirty(); return; }
    if (zone.type === 'manage') {
      // C6c-3 — otwórz ColonyOverlay na zakładce STACJA (embed zarządzania). Gospodarz = pełna kolonia gracza z grupy stacji
      // (`resolveStationTabHost`); gdy grupę hostuje tylko outpost → null → otwórz kolonię normalnie (limit outpostu z C6b).
      const st = this._station();
      if (!st) return;
      const host = resolveStationTabHost(st);
      const fallback = window.KOSMOS?.colonyManager?.activePlanetId ?? window.KOSMOS?.homePlanet?.id ?? null;
      window.KOSMOS?.overlayManager?.openPanel?.('colony', host
        ? { colonyId: host.planetId, infoTab: 'stacja' }
        : { colonyId: fallback });
      // B3: przypięcie zdjęte (nie wisi nad overlayem); wraca przez `station:selected` (klik stacji po zamknięciu overlaya).
      this.hide();
      this._markDirty();
    }
  }
}
