// ShipyardOverlay — samodzielny overlay STOCZNIA (klawisz S, nav-slot 🛠; klawisz U prowadzi tutaj — `routeOverlayId`)
//
// C8 — ekstrakcja z zakładki 'shipyard' FleetManagerOverlay do własnego panelu. ARC KONSOLE K1c-A/B: szablon konsoli
// (lista projektów · bohater = hologram statku / plan · inspektor projektanta · pas kolejki i rezerwy) — rysunek w
// `ShipyardConsoleView.js`, logika w `ShipyardConsoleLogic.js`. KZ-Shipyard: konsola jest jedyną ścieżką (flagi
// `consoleShipyard` i `shipHologram` zdjęte; dawna wąska kolumna z wspólnym scrollem usunięta).
//
// Kolonia = GLOBALNA aktywna (window.KOSMOS.colonyManager.activePlanetId) — jak
// dawna zakładka; brak lokalnego pickera. Budowa idzie przez EventBus
// ('fleet:buildRequest' → ColonyManager) + colMgr.surgeShipBuild/cancelPendingShip.
// Edytor projektów to WSPÓŁDZIELONA instancja overlays.unit_design (ta sama co
// klawisz U i zakładka Jednostki w Command) — czytana, nie tworzona.

import { BaseOverlay }    from './BaseOverlay.js';
import { THEME }          from '../config/ThemeConfig.js';
import { SHIPS }          from '../data/ShipsData.js';
import { HULLS }          from '../data/HullsData.js';
import { RESOURCE_ICONS } from '../data/BuildingsData.js';
import { COMMODITIES, COMMODITY_SHORT } from '../data/CommoditiesData.js';
import { getName }        from '../i18n/i18n.js';
import EventBus           from '../core/EventBus.js';
import { applyConsoleHalo, withAdaptiveHalo } from './ConsoleKit.js';
import { drawShipyardConsole, shipyardConsoleScroll, paintHeroContent, heroScrimAlpha } from './ShipyardConsoleView.js';
import { ShipHologramRenderer } from '../renderer/ShipHologramRenderer.js';
import { HOLO_TUNING, HOLO_POSE_DEFAULT, dragPose, isDragMove, isDoubleTap } from '../renderer/ShipHologramLogic.js';
import { ShipyardHoloLayer } from './ShipyardHoloLayer.js';
import { deleteClick, DELETE_CONFIRM_MS } from './ShipyardConsoleLogic.js';

// Typy hitów projektanta konsoli delegowane do współdzielonej instancji edytora (overlays.unit_design) w _onHit.
// KZ-Shipyard: bez 'tpl_row' (konsola przechwytuje go wcześniej jako wczytanie projektu) i 'edit_template' (konsola nie ma
// takiej strefy — wczytanie idzie bezpośrednio przez `_onHit` edytora).
const DESIGN_EDITOR_HIT_TYPES = new Set([
  'select_hull', 'select_slot', 'clear_slot', 'pick_module',
  'save_template', 'clear_design', 'delete_template',
]);

export class ShipyardOverlay extends BaseOverlay {
  constructor() {
    super();
    this._hoverPendingOrder = null;
    // K1c-A — stan konsoli
    this.consoleZones = null;      // strefy z ostatniej klatki (gniazdo paska walki, kółko myszy)
    this._consoleScrollRects = {};
    this._designsScroll = 0;
    this._inspScroll = 0;
    this._stripScroll = {};
    this._holoView = '3q';         // [ 3D ] | [ PLAN ]
    this._holo = null;             // ShipHologramRenderer — leniwie, zwalniany w hide()
    // K1c-B — poza hologramu z myszy (zostaje po zamknięciu i przy podmianie modelu), przeciąganie, dwuklik, warstwa, USUŃ ×2
    this._holoPose = { ...HOLO_POSE_DEFAULT };
    this._holoDrag = null;         // { x0, y0, pose0, moved }
    this._holoTap = null;          // ostatni klik w bohatera { t, x, y } (dwuklik)
    this._holoLayer = null;        // ShipyardHoloLayer — leniwie, usuwany w hide()
    this._heroState = null;        // stan bohatera z ostatniej klatki UI (malowanie warstwy poza klatką UI)
    this._heroSig = '';
    this._delArm = null;           // { id, until } — [ USUŃ ] uzbrojone na DELETE_CONFIRM_MS
    this._createHoloLayer = () => (ShipyardHoloLayer.available() ? new ShipyardHoloLayer() : null);
    this._now = () => performance.now();
  }

  // K1c-A — hologram bohatera (D-K-7 a). K1c-B: kadr bohatera (`fit: 'hero'`); wczytany model / kotwice → malowanie samej
  // warstwy (bez przerysowania UI), bez warstwy — przerysowanie UI jak w K1c-A. KZ-Shipyard: bez flagi `shipHologram`.
  _ensureHologram() {
    this._holo ??= new ShipHologramRenderer({
      fit: 'hero',
      onChange: () => {
        if (this._holoLayer) { this._holoLayer.requestPaint(); return; }
        const u = window.KOSMOS?.uiManager; if (u) u._dirty = true;
      },
    });
    return this._holo;
  }

  /** K1c-A — czy UIManager ma rysować kolejną klatkę. K1c-B: z warstwą przenikanie animuje sama warstwa (UI stoi). */
  isAnimating() {
    return this.visible && !!this._holo && !this._holoLayer && this._holo.isAnimating();
  }

  // ── K1c-B: warstwa hologramu (CONSOLES_PLAN.md §10.1) ─────────────────────────────────────────────────────────────

  /**
   * Wołane z rysunku bohatera w klatce UI: ustawia warstwę na prostokącie, czyści go w `#ui-canvas` i maluje warstwę, gdy stan się
   * zmienił. Zwraca prostokąt po wyrównaniu albo null (brak warstwy → rysunek w `#ui-canvas` jak w K1c-A).
   */
  _syncHeroLayer(ctx, rect, state) {
    if (!this._holoLayer) {
      this._holoLayer = this._createHoloLayer?.() ?? null;
      if (!this._holoLayer) return null;
      this._holoLayer.onFrame = () => this._paintHeroLayer();
    }
    const L = this._holoLayer;
    const buf = (typeof ctx.getTransform === 'function' ? Math.abs(ctx.getTransform().a) : 1) || 1;
    const css = window.KOSMOS?.uiScale || buf;
    const r = L.place(rect, css, buf);
    if (!r) return null;
    ctx.clearRect(r.x, r.y, r.w, r.h);              // UI zostawia prostokąt przezroczysty — warstwa pod spodem
    this._heroState = { ...state, scrim: heroScrimAlpha() };
    L.markUsed();
    const holo = this._holo;
    const sig = JSON.stringify([r, holo?.modelKey, holo?.mode, state.view, state.stacks, this._holoPose, this._heroState.scrim,
      HOLO_TUNING, THEME.bgPrimary, state.roles?.primary, state.roles?.dim, window.KOSMOS?.lang ?? 'pl']);
    if (sig !== this._heroSig) { this._heroSig = sig; this._paintHeroLayer(); }
    return r;
  }

  /** Maluje warstwę bieżącym stanem (klatka UI, przeciąganie, przenikanie, wczytany model). */
  _paintHeroLayer() {
    const L = this._holoLayer, holo = this._holo, st = this._heroState;
    if (!L || !holo || !st || !this.visible) return;
    holo.setPose(this._holoPose);
    L.paint((c, rect) => { this.lastAnchors = paintHeroContent(c, rect, holo, st, { scrim: st.scrim }); });
    if (holo.isAnimating()) L.requestPaint();       // przenikanie modelu — kolejna klatka samej warstwy
  }

  /** UIManager — początek / koniec klatki UI (warstwa ukryta, gdy bohater się nie narysował). */
  beginUiFrame() { this._holoLayer?.beginFrame(); }
  endUiFrame() { this._holoLayer?.endFrame(); }

  /** Czy trwa przeciąganie hologramu (UIManager kieruje wtedy ruch myszy tylko tutaj, bez przerysowania UI). */
  isHoloDragging() { return !!this._holoDrag && this.visible; }

  _inHero(x, y) {
    const r = this.heroHoloRect;
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /** Ruch myszy podczas przeciągania (px log.): poza → malowanie warstwy (albo, bez warstwy, przerysowanie UI). */
  handleHoloDrag(x, y) {
    const d = this._holoDrag;
    if (!d) return;
    const dx = x - d.x0, dy = y - d.y0;
    if (!d.moved && !isDragMove(dx, dy)) return;
    d.moved = true;
    this._holoPose = dragPose(d.pose0, dx, dy);
    this._holo?.setPose(this._holoPose);
    if (this._holoLayer?.shown) this._holoLayer.requestPaint();
    else { const u = window.KOSMOS?.uiManager; if (u) u._dirty = true; }
  }

  /** Dwuklik w bohatera — poza domyślna (statyczne 3/4). */
  resetHoloPose() {
    this._holoPose = { ...HOLO_POSE_DEFAULT };
    this._holo?.setPose(this._holoPose);
    if (this._holoLayer?.shown) this._holoLayer.requestPaint();
    else { const u = window.KOSMOS?.uiManager; if (u) u._dirty = true; }
  }

  handleMouseDown(x, y, button = 0) {
    super.handleMouseDown(x, y, button);
    if (!this.visible || button !== 0) return;
    if (this._holoView === '3q' && this._holo && this._inHero(x, y)) this._holoDrag = { x0: x, y0: y, pose0: { ...this._holoPose }, moved: false };
  }

  handleMouseUp(x, y, button = 0) {
    super.handleMouseUp(x, y, button);
    const d = this._holoDrag;
    this._holoDrag = null;
    if (!d || d.moved || !this.visible) { if (d?.moved) this._holoTap = null; return; }
    const tap = { t: this._now(), x, y };
    if (isDoubleTap(this._holoTap, tap)) { this._holoTap = null; this.resetHoloPose(); }
    else this._holoTap = tap;
  }

  // Zarejestrowana instancja unit_design (wspólny stan z klawiszem U). Null gdy
  // brak (headless) → sekcja edytora się nie rysuje.
  _getDesignEditor() {
    return window.KOSMOS?.overlayManager?.overlays?.unit_design ?? null;
  }

  // ── Rysowanie ─────────────────────────────────────────────────────────────
  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];
    // K1c-A — konsola (poświata K0b za całym rysunkiem; zdjęta przez restore). KZ-Shipyard: jedyna ścieżka.
    ctx.save();
    applyConsoleHalo(ctx);
    try { withAdaptiveHalo(ctx, W, H, () => drawShipyardConsole(this, ctx, W, H)); } finally { ctx.restore(); }
  }

  // ── Tooltip oczekującego zamówienia (brakujące zasoby) ─────────────────────
  _drawPendingOrderTooltip(ctx, panelX, panelY, panelW, panelH, order, inv) {
    const ship = SHIPS[order.shipId] ?? HULLS[order.shipId];
    if (!ship) return;

    const PAD = 8;
    const LH = 14;

    const lines = [];
    for (const [k, need] of Object.entries(order.cost)) {
      const have = Math.floor(inv[k] ?? 0);
      const ok = have >= need;
      const icon = RESOURCE_ICONS[k] ?? COMMODITIES[k]?.icon ?? '';
      const name = COMMODITY_SHORT[k] ?? k;
      lines.push({ text: `${icon} ${name}: ${have}/${need}`, ok });
    }
    // ⚠ W2-4: odczyt „👤 freePops/crewCost" USUNIĘTY — zlecenie nie czeka już na POPy, tylko
    //   na surowce. (Ten wiersz i tak czytał GLOBALNY `KOSMOS.civSystem`, nie aktywną kolonię
    //   jak reszta pliku — Findings filed 4.) Załoga pokazuje się przy rozmieszczeniu (W2-6).

    const tipW = 200;
    const tipH = 22 + lines.length * LH + 8;

    let tipX = panelX - tipW - 6;
    if (tipX < 4) tipX = panelX + 4;
    const zone = this._hitZones.find(z => z.type === 'pending_ship_hover' && z.data.order?.id === order.id);
    let tipY = zone ? zone.y : panelY + 100;
    if (tipY + tipH > panelY + panelH) tipY = panelY + panelH - tipH - 4;

    ctx.fillStyle = 'rgba(6,12,20,0.96)';
    ctx.fillRect(tipX, tipY, tipW, tipH);
    ctx.strokeStyle = THEME.warning;
    ctx.lineWidth = 1;
    ctx.strokeRect(tipX, tipY, tipW, tipH);

    let ty = tipY + 6;
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.warning;
    ctx.fillText(`⏳ ${ship.icon} ${getName(ship, 'ship')}`, tipX + PAD, ty + 10);
    ty += 18;

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    for (const line of lines) {
      ctx.fillStyle = line.ok ? THEME.success : THEME.danger;
      ctx.fillText(line.text, tipX + PAD, ty + 8);
      ty += LH;
    }
  }

  // ── Interakcja ─────────────────────────────────────────────────────────────
  _onHit(zone) {
    // K1c-A — konsola: wybór wiersza projektu = wczytaj do projektanta (ten sam `_loadTemplate` co [ EDYTUJ ]); czipy widoku.
    if (zone.type === 'tpl_row') {
      this._getDesignEditor()?._onHit({ type: 'edit_template', data: { index: zone.data.index } });
      return;
    }
    if (zone.type === 'holo_view') { this._holoView = zone.data.mode === 'plan' ? 'plan' : '3q'; return; }
    // K1c-B — czip [ BUDUJ ] wyłączony: sama podpowiedź z powodem (bez akcji)
    if (zone.type === 'tpl_build_blocked') return;
    // K1c-B — [ USUŃ ] wymaga drugiego kliku: pierwszy pokazuje [ POTWIERDŹ ] na DELETE_CONFIRM_MS, drugi w tym czasie kasuje
    if (zone.type === 'delete_template') {
      const id = window.KOSMOS?.unitDesigns?.[zone.data.index]?.id ?? null;
      const res = deleteClick(this._delArm, { id, now: this._now() });
      this._delArm = res.arm;
      if (res.arm) {
        // po wygaśnięciu — jedna klatka UI, żeby czip wrócił do [ USUŃ ]
        setTimeout(() => { const u = window.KOSMOS?.uiManager; if (u) u._dirty = true; }, DELETE_CONFIRM_MS + 20);
      }
      if (!res.delete) return;
    }
    // Delegacja hitów projektanta do wspólnej instancji edytora.
    if (DESIGN_EDITOR_HIT_TYPES.has(zone.type)) {
      this._getDesignEditor()?._onHit(zone);
      return;
    }
    const colMgr = window.KOSMOS?.colonyManager;
    switch (zone.type) {
      case 'close':
        this.hide();
        break;
      case 'build_template':
        if (zone.data.enabled) {
          EventBus.emit('fleet:buildRequest', { shipId: zone.data.hullId, modules: zone.data.modules });
        }
        break;
      case 'surge_ship':
        if (colMgr) colMgr.surgeShipBuild(zone.data.planetId, zone.data.queueIndex);
        break;
      case 'cancel_pending_ship':
        if (colMgr) colMgr.cancelPendingShip(zone.data.planetId, zone.data.orderId);
        break;
      // W2-6 — rozmieszczenie kadłuba z rezerwy. Odmowa NIE jest cicha: kod powodu
      // idzie do Dziennika przez `vessel:deployRejected` (UIManager), bo jedyną gorszą
      // rzeczą od zablokowanego przycisku jest przycisk, który po kliknięciu milczy.
      case 'deploy_vessel': {
        const vMgr = window.KOSMOS?.vesselManager;
        const res = vMgr?.deployVessel?.(zone.data.vesselId);
        if (res && res.ok !== true) {
          EventBus.emit('vessel:deployRejected', {
            vesselId: zone.data.vesselId,
            vessel: vMgr?.getVessel?.(zone.data.vesselId) ?? null,
            reason: res.reason ?? 'unknown',
          });
        }
        break;
      }
      // 'pending_ship_hover' / 'bg' — brak akcji
    }
  }

  handleMouseMove(x, y) {
    super.handleMouseMove(x, y);   // ustawia this._hoverZone
    if (!this.visible) return;
    // Hover pending order (tooltip brakujących zasobów)
    this._hoverPendingOrder = null;
    for (const z of this._hitZones) {
      if (x < z.x || x > z.x + z.w || y < z.y || y > z.y + z.h) continue;
      if (z.type === 'pending_ship_hover') { this._hoverPendingOrder = z.data.order; break; }
    }
    // Forward hovera do osadzonego edytora (podświetlenia wierszy / tooltipy panelu).
    const ed = this._getDesignEditor();
    if (ed) { ed._hoverZone = this._hoverZone; ed._mouseX = x; ed._mouseY = y; }
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    return shipyardConsoleScroll(this, delta, x, y);
  }

  hide() {
    super.hide();
    this._hoverPendingOrder = null;
    // K1c-A — zwolnij kontekst WebGL hologramu (ukryty gospodarz nie rysuje → bez pracy; zamknięcie → bez kontekstu)
    if (this._holo) { this._holo.release(); this._holo = null; }
    // K1c-B — warstwa hologramu zdjęta z DOM; poza zostaje (model «tam, gdzie gracz go zostawił»)
    if (this._holoLayer) { this._holoLayer.destroy(); this._holoLayer = null; }
    this._heroSig = ''; this._heroState = null; this._holoDrag = null; this._delArm = null;
  }
}
