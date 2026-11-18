// CivilizationOverlay — panel cywilizacji (klawisz V)
//
// ARC KONSOLE K5 / KZ — ekran konsoli (szablon 4-strefowy, `CivilizationConsoleView.js`): lista Imperium / Frakcje / Historia,
// bohater (portret lidera + emblemat + instrumenty), inspektor, pas kroniki. Overlay trzyma stan wyboru i zbiera dane
// (`_gatherData`, tylko kolonie GRACZA); dawny układ 3-kolumnowy usunięty w KZ (ścieżka konsoli jedyna).

import { BaseOverlay }           from './BaseOverlay.js';
import { LEADERS }               from '../data/LeaderData.js';
import { applyConsoleHalo, withAdaptiveHalo }      from './ConsoleKit.js';
import { drawCivilizationConsole } from './CivilizationConsoleView.js';
import { applyCivChip }          from './CivilizationConsoleLogic.js';

// ══════════════════════════════════════════════════════════════════════════════
// CivilizationOverlay
// ══════════════════════════════════════════════════════════════════════════════

export class CivilizationOverlay extends BaseOverlay {
  constructor() {
    super(null);
    // K5 — konsola: strefy ostatniej klatki, wybór pozycji listy ('empire' | 'leader' | 'col:<id>' | 'fac:<id>' | 'hist:<typ>'),
    // przewinięcia listy / inspektora, przesunięcie osi kroniki (w grupach)
    this.consoleZones = null;
    this._kitSel = 'empire';
    this._kitScrollList = 0;
    this._kitScrollInsp = 0;
    this._kitStripOff = 0;
  }

  // ── Główna metoda rysowania ──────────────────────────────────────────────

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];
    // K5 — poświata za całym rysunkiem konsoli; zdjęta przez restore
    ctx.save();
    applyConsoleHalo(ctx);
    try { withAdaptiveHalo(ctx, W, H, () => drawCivilizationConsole(this, ctx, W, H)); } finally { ctx.restore(); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Zbieranie danych z systemów (tylko kolonie GRACZA — getPlayerColonies)
  // ══════════════════════════════════════════════════════════════════════════

  _gatherData() {
    const colMgr   = window.KOSMOS?.colonyManager;
    const vMgr     = window.KOSMOS?.vesselManager;
    const civTrade = window.KOSMOS?.civilianTradeSystem;

    const colonies     = colMgr?.getPlayerColonies() ?? [];
    const fullColonies = colonies.filter(c => !c.isOutpost);
    const outposts     = colonies.filter(c => c.isOutpost);

    let totalPop = 0, totalMaxPop = 0;
    let avgProsperity = 0, prosperityCount = 0;
    let avgLoyalty = 0, loyaltyCount = 0;
    let totalCreditsPerYear = 0, taxIncome = 0, totalLaborCost = 0;   // Faza 3: płace = wydatek
    const perColony = [];
    const history = [];

    for (const col of colonies) {
      const civ   = col.civSystem;
      const prosp = col.prosperitySystem;
      const pop = civ?.population ?? 0;
      const maxPop = civ?.maxPopulation ?? 0;
      const prosperity = prosp?.prosperity ?? 0;
      const loyalty = civ?.loyalty ?? 80;

      totalPop += pop;
      totalMaxPop += maxPop;
      totalCreditsPerYear += col.creditsPerYear ?? 0;

      if (!col.isOutpost) {
        if (prosp) { avgProsperity += prosperity; prosperityCount++; }
        avgLoyalty += loyalty; loyaltyCount++;
        taxIncome += colMgr?.calculateTaxIncome(col) ?? 0;
        totalLaborCost += civ?.getTotalLaborCost?.() ?? 0;   // Faza 3 §3.7: płace kolonii
      }

      perColony.push({
        name: col.name ?? col.planetId,
        planetId: col.planetId,
        isOutpost: col.isOutpost ?? false,
        pop, maxPop, prosperity,
        credits: col.credits ?? 0,
        fleetCount: col.fleet?.length ?? 0,
        buildings: col.buildingSystem?._active?.size ?? 0,
        loyalty,
      });

      // Historia — agreguj wpisy kroniki ze wszystkich kolonii gracza
      if (Array.isArray(civ?.colonyHistory)) {
        for (const hEntry of civ.colonyHistory) {
          history.push({ ...hEntry, colName: col.name ?? col.planetId });
        }
      }
    }

    if (prosperityCount > 0) avgProsperity /= prosperityCount;
    if (loyaltyCount > 0)    avgLoyalty    /= loyaltyCount;

    // Kronika — najnowsze na górze
    history.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

    // Flota (tylko liczba — do "statki" + karty)
    const vessels = vMgr?.getAllVessels?.() ?? [];

    // Utrzymanie (do NETTO Kr/rok — bez wyświetlania szczegółów; szczegóły są w Economy/BUDŻET)
    let totalUnitUpkeep = 0;
    const guMgr = window.KOSMOS?.groundUnitManager;
    const upTable = colMgr?.constructor?.GROUND_UNIT_UPKEEP;
    if (guMgr && upTable) {
      for (const u of guMgr._units?.values?.() ?? []) {
        if (u.owner !== 'player' && u.factionId !== 'humanity') continue;
        totalUnitUpkeep += upTable[u.archetypeId]?.credits ?? 0;
      }
    }
    // W2-5: stawka jest już EFEKTYWNA (kadłub w rezerwie płaci 10 %), więc NETTO poniżej
    // nie wymaga tu żadnego rozgałęzienia. Rozbicie służba/rezerwa pokazuje BUDŻET
    // w EconomyOverlay — zgodnie z komentarzem wyżej ten panel trzyma same sumy.
    const totalFleetUpkeep = vMgr?.getTotalFleetUpkeep?.() ?? 0;
    // Faza 3 §3.7: NETTO = handel + podatki − utrzymanie jednostek − utrzymanie floty − PŁACE
    const netCreditsPerYear = totalCreditsPerYear + taxIncome - totalUnitUpkeep - totalFleetUpkeep - totalLaborCost;

    // Handel — liczba aktywnych połączeń sieci handlu cywilnego
    const tradeConnections = civTrade?.getAllConnections?.()?.length ?? 0;

    // Wiek cywilizacji — od najstarszej kolonii gracza (col.founded = rok gry założenia)
    const now = Math.floor(window.KOSMOS?.timeSystem?.gameTime ?? 0);
    let foundedMin = now;
    for (const col of colonies) {
      if (typeof col.founded === 'number') foundedMin = Math.min(foundedMin, col.founded);
    }
    const civAge = Math.max(0, now - foundedMin);

    // Lider + frakcja (snapshot raz per frame)
    const leaderSys = window.KOSMOS?.leaderSystem;
    const facSys    = window.KOSMOS?.factionSystem;
    const leaderId  = leaderSys?.activeLeader ?? null;
    const leaderInfo = {
      leaderId,
      leaderDef: leaderId ? LEADERS[leaderId] : null,
      activeFaction: leaderSys?.activeFaction ?? null,
    };
    const factionInfo = facSys ? {
      ref:     facSys,
      locked:  !!facSys.isLocked,
      slider:  facSys.slider  ?? 50,
      tension: facSys.tension ?? 0,
      zone:    facSys.getCurrentZone?.() ?? 'balanced',
    } : null;

    return {
      colonies, fullColonies, outposts, perColony, history,
      totalPop, totalMaxPop, avgProsperity, avgLoyalty,
      vessels, netCreditsPerYear, tradeConnections, civAge,
      leaderInfo, factionInfo,
    };
  }

  // ── Obsługa kliknięć ───────────────────────────────────────────────────

  // K5 — klik na konsoli: ramka ze stref ostatniej klatki; klik wewnątrz zawsze pochłonięty
  handleClick(x, y) {
    if (!this.visible) return false;
    const f = this.consoleZones?.frame;
    if (!f || x < f.x || x > f.x + f.w || y < f.y || y > f.y + f.h) return false;
    const hit = this._hitTest(x, y);
    if (hit) this._onHit(hit);
    return true;
  }

  _onHit(zone) {
    switch (zone.type) {
      case 'close':
        this.hide();
        break;
      case 'goto_colony': {
        const colMgr = window.KOSMOS?.colonyManager;
        if (colMgr) colMgr.switchActiveColony(zone.data.planetId);
        this._kitSel = `col:${zone.data.planetId}`; this._kitScrollInsp = 0;   // K5 — inspektor kolonii
        break;
      }
      case 'tab':        // K5 — czip grupy w nagłówku konsoli (jak klik w pas subnav)
        applyCivChip(zone.data?.id, window.KOSMOS?.overlayManager);
        break;
      case 'civ_item':   // K5 — pozycja listy / osi kroniki → inspektor
        if (zone.data?.id) { this._kitSel = zone.data.id; this._kitScrollInsp = 0; }
        break;
    }
  }

  // K5 — kółko na konsoli: geometria wyłącznie ze stref ostatniej klatki (bez window.inner*)
  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    const f = this.consoleZones?.frame;
    if (!f || x < f.x || x > f.x + f.w || y < f.y || y > f.y + f.h) return false;
    const inR = (r) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (inR(this._consoleListRect)) this._kitScrollList = Math.max(0, (this._kitScrollList ?? 0) + delta * 0.5);
    else if (inR(this._consoleInspRect)) this._kitScrollInsp = Math.max(0, (this._kitScrollInsp ?? 0) + delta * 0.5);
    else if (inR(this._consoleStripRect)) this._kitStripOff = Math.max(0, (this._kitStripOff ?? 0) + (delta > 0 ? 1 : -1));
    return true;
  }
}
