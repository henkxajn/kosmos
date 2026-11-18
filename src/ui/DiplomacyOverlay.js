// DiplomacyOverlay — panel Dyplomacji (klawisz Y)
//
// ARC KONSOLE K2 / KZ — ekran konsoli (szablon 4-strefowy, `DiplomacyConsoleView.js`): wspólna lista imperiów (jak Wywiad),
// bohater = opinia i napięcie + status + mini-mapa, inspektor = rozbicie opinii, traktaty, pamięć, czipy akcji; pas = ultimatum /
// komunikat. Overlay trzyma stan wyboru i obsługuje akcje; dawny układ 2-kolumnowy usunięty w KZ (ścieżka konsoli jedyna).

import { BaseOverlay } from './BaseOverlay.js';
import EventBus from '../core/EventBus.js';
import { t } from '../i18n/i18n.js';
import { canDoEnvoy, hasWeapons } from '../entities/Vessel.js';
import { applyConsoleHalo, withAdaptiveHalo } from './ConsoleKit.js';
import { drawDiplomacyConsole } from './DiplomacyConsoleView.js';

// DS-1 / C3 — JEDNO miejsce, w którym id traktatu spotyka się ze swoją nazwą.
// Do C3 slot renderował SUROWY SLUG („• non_aggression (od 100)”), bo nazwy z katalogu
// (`namePL`/`nameEN`) nie miały ANI JEDNEGO czytelnika, a kluczy `treaty.*` nie było
// w słownikach w ogóle (klasa 271/113).
// ⚠ Katalogowe `namePL`/`nameEN` ZOSTAJą MARTWE — świadomie, poza zakresem DS-1
//   (rejestr ⚪). Nazwa widoczna dla gracza idzie przez `t()`, jak reszta UI.
const TREATY_NAME_KEY = {
  non_aggression:  'treaty.nonAggression',
  trade_agreement: 'treaty.tradeAgreement',
  alliance:        'treaty.alliance',
};

export class DiplomacyOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._selectedId = null;
    this._scrollLeft = 0;
    this.consoleZones = null;      // K2 — strefy konsoli z ostatniego draw() (wejście i gniazdo paska walki czytają je stąd)
    this._consoleListRect = null;
    this._consoleTooltip = null;
    this._revealPending = false;
    this._flash = null;   // S3.4 — transient komunikat akcji dyplomatycznej

    // S3.4 — flash przy odpowiedzi AI na propozycję traktatu.
    EventBus.on('diplomacy:treatyAccepted', ({ empireId }) => {
      if (empireId === this._selectedId) this._setFlash(t('diplo.treatyAccepted'), '#60B090');
    });
    EventBus.on('diplomacy:treatyRejected', ({ empireId, reason }) => {
      if (empireId === this._selectedId && reason !== 'already_signed') {
        this._setFlash(t('diplo.treatyRejected'), '#D85A30');
      }
    });
  }

  _setFlash(text, color) {
    this._flash = { text, color, until: Date.now() + 3500 };
  }

  show() {
    super.show();
    // Auto-select pierwszego widocznego
    const dipl = window.KOSMOS?.diplomacySystem;
    const intelSys = window.KOSMOS?.intelSystem;
    if (!this._selectedId && dipl && intelSys) {
      const visible = dipl.listPlayerRelations().find(r => intelSys.isAtLeast(r.empireId, 'rumor'));
      if (visible) this._selectedId = visible.empireId;
    }
    this._revealPending = true;    // K2 — konsola odsłania zaznaczony wiersz przy otwarciu
  }
  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];
    // K2 — poświata za całym rysunkiem konsoli; zdjęta przez restore (pasek walki i reszta UI bez niej)
    ctx.save();
    applyConsoleHalo(ctx);
    try { withAdaptiveHalo(ctx, W, H, () => drawDiplomacyConsole(this, ctx, W, H, { treatyNameKey: TREATY_NAME_KEY })); } finally { ctx.restore(); }
  }

  _onHit(zone) {
    const dipl = window.KOSMOS?.diplomacySystem;
    switch (zone.type) {
      case 'close':
        this.hide();
        break;
      case 'select':
        this._selectedId = zone.data.empireId;
        break;
      case 'declare_war':
        if (dipl) dipl.declareWar(zone.data.empireId, 'player_action');
        break;
      case 'offer_peace':
        if (dipl) dipl.offerPeace(zone.data.empireId, 'player_action');
        break;
      case 'send_envoy': {
        const ms = window.KOSMOS?.missionSystem;
        const vMgr = window.KOSMOS?.vesselManager;
        const vessel = vMgr?.getAllVessels?.().find(v => v.status === 'idle' && canDoEnvoy(v));
        if (vessel && hasWeapons(vessel)) this._setFlash(t('diplo.envoyArmedWarn'), '#D8A030');
        ms?._launchEnvoy?.(zone.data.empireId, vessel?.id ?? null);
        break;
      }
      case 'propose_trade':
        if (dipl) dipl.proposeTreaty(zone.data.empireId, 'trade_agreement');
        break;
      case 'toggle_auto_trade': {
        const civTrade = window.KOSMOS?.civilianTradeSystem;
        if (civTrade?.isCrossEmpireTradeEnabled) {
          civTrade.setCrossEmpireTrade(zone.data.empireId, !civTrade.isCrossEmpireTradeEnabled(zone.data.empireId));
        }
        break;
      }
      case 'propose_pact':
        if (dipl) dipl.proposeTreaty(zone.data.empireId, 'non_aggression');
        break;
      case 'renew_pact':
        // D-DS-4(b) — odnowienie idzie fasadą `renewTreaty`, NIE `proposeTreaty`: ta druga jest
        // przy stojącym pakcie blokowana przez `not_already_signed` (tryb renew nie wycieka poza
        // fasadę — pin `wp_nap_renew` T4b). Odmowę tłumaczy modal, jak przy każdej propozycji.
        if (dipl) dipl.renewTreaty(zone.data.empireId, 'non_aggression');
        break;
      case 'propose_alliance':
        if (dipl) dipl.proposeTreaty(zone.data.empireId, 'alliance');
        break;
      case 'tab':   // K2 — czip podzakładki w nagłówku konsoli (jak klik w pas subnav: przełącz overlay grupy)
        if (zone.data.id && zone.data.id !== 'diplomacy') window.KOSMOS?.overlayManager?.openPanel?.(zone.data.id);
        break;
      case 'action_blocked':   // K2 — wyłączony czip akcji: strefa tylko dla podpowiedzi z powodem (bez skutku, jak dziś szary przycisk)
        break;
    }
  }
  // K2 — kółko na konsoli: geometria wyłącznie ze stref ostatniej klatki (bez window.inner*); klamra przewijania w drawList.
  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    const f = this.consoleZones?.frame, r = this._consoleListRect;
    if (!f || x < f.x || x > f.x + f.w || y < f.y || y > f.y + f.h) return false;
    if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) this._scrollLeft = Math.max(0, this._scrollLeft + delta * 0.5);
    return true;
  }
}
