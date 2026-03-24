// CivilizationOverlay — panel podsumowania cywilizacji (klawisz V)
//
// Globalne statystyki: populacja, prosperity, produkcja, handel, flota.
// Lewa kolumna: overview (sumy, średnie, kluczowe wskaźniki).
// Prawa kolumna: breakdown per kolonia (tabela z najważniejszymi danymi).

import { BaseOverlay }   from './BaseOverlay.js';
import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import { ALL_RESOURCES } from '../data/ResourcesData.js';
import { SHIPS }         from '../data/ShipsData.js';
import { t, getName }    from '../i18n/i18n.js';

const LEFT_W = 340;
const TAB_H  = 32;
const ROW_H  = 16;

// ══════════════════════════════════════════════════════════════════════════════
// CivilizationOverlay
// ══════════════════════════════════════════════════════════════════════════════

export class CivilizationOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._scrollLeft  = 0;
    this._scrollRight = 0;
  }

  // ── Główna metoda rysowania ──────────────────────────────────────────────

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];

    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);
    const rightW = ow - LEFT_W;

    // Tło
    ctx.fillStyle = bgAlpha(0.38);
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = GLASS_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, ow, oh);

    // Separator kolumn
    ctx.beginPath();
    ctx.moveTo(ox + LEFT_W, oy); ctx.lineTo(ox + LEFT_W, oy + oh);
    ctx.stroke();

    // Przycisk zamknięcia [X]
    const closeX = ox + ow - 24;
    const closeY = oy + 4;
    ctx.font = `bold 14px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('\u2715', closeX, closeY + 14);
    this._addHit(closeX - 4, closeY, 22, 22, 'close');

    // Zbierz dane
    const data = this._gatherData();

    // Rysuj kolumny
    this._drawLeft(ctx, ox, oy, LEFT_W, oh, data);
    this._drawRight(ctx, ox + LEFT_W, oy, rightW, oh, data);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Zbieranie danych z systemów
  // ══════════════════════════════════════════════════════════════════════════

  _gatherData() {
    const colMgr  = window.KOSMOS?.colonyManager;
    const vMgr    = window.KOSMOS?.vesselManager;
    const civTrade = window.KOSMOS?.civilianTradeSystem;

    const colonies = colMgr?.getAllColonies() ?? [];
    const fullColonies = colonies.filter(c => !c.isOutpost);
    const outposts = colonies.filter(c => c.isOutpost);

    // Globalne sumy
    let totalPop = 0, totalMaxPop = 0;
    let avgProsperity = 0, prosperityCount = 0;
    let totalCredits = 0, totalCreditsPerYear = 0;
    let totalResearch = 0;
    const globalResources = {};  // id → { stock, rate }
    const perColony = [];

    for (const col of colonies) {
      const civ = col.civSystem;
      const res = col.resourceSystem;
      const prosp = col.prosperitySystem;
      const pop = civ?.population ?? 0;
      const maxPop = civ?.maxPopulation ?? 0;
      const prosperity = prosp?.prosperity ?? 0;
      const epoch = prosp?.epoch ?? 'early';
      const credits = col.credits ?? 0;
      const creditsPerYear = col.creditsPerYear ?? 0;

      totalPop += pop;
      totalMaxPop += maxPop;
      totalCredits += credits;
      totalCreditsPerYear += creditsPerYear;

      if (!col.isOutpost && prosp) {
        avgProsperity += prosperity;
        prosperityCount++;
      }

      // Sumy surowców
      if (res?.inventory) {
        for (const [id, stock] of res.inventory) {
          if (!globalResources[id]) globalResources[id] = { stock: 0, rate: 0 };
          globalResources[id].stock += stock;
        }
        // Netto rates z deltaTracker
        const dt = res._deltaTracker;
        if (dt?.observedPerYear) {
          for (const [id, rate] of dt.observedPerYear) {
            if (!globalResources[id]) globalResources[id] = { stock: 0, rate: 0 };
            globalResources[id].rate += rate;
          }
        }
      }

      // Research rate
      if (res?._deltaTracker?.observedPerYear) {
        totalResearch += res._deltaTracker.observedPerYear.get('research') ?? 0;
      }

      // Per-kolonia dane
      const fleetCount = col.fleet?.length ?? 0;
      perColony.push({
        name: col.name ?? col.planetId,
        planetId: col.planetId,
        isOutpost: col.isOutpost ?? false,
        pop, maxPop, prosperity, epoch, credits,
        fleetCount,
        buildings: col.buildingSystem?._active?.size ?? 0,
      });
    }

    if (prosperityCount > 0) avgProsperity /= prosperityCount;

    // Flota globalna
    const vessels = vMgr?.getAllVessels?.() ?? [];
    const fleetByType = {};
    let inFlight = 0, orbiting = 0, docked = 0;
    for (const v of vessels) {
      fleetByType[v.shipId] = (fleetByType[v.shipId] ?? 0) + 1;
      if (v.status === 'in_transit') inFlight++;
      else if (v.status === 'orbiting') orbiting++;
      else docked++;
    }

    return {
      colonies, fullColonies, outposts, perColony,
      totalPop, totalMaxPop, avgProsperity,
      totalCredits, totalCreditsPerYear, totalResearch,
      globalResources,
      vessels, fleetByType, inFlight, orbiting, docked,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEWA KOLUMNA — globalne podsumowanie
  // ══════════════════════════════════════════════════════════════════════════

  _drawLeft(ctx, x, y, w, h, data) {
    const pad = 14;

    // Nagłówek
    ctx.fillStyle = bgAlpha(0.50);
    ctx.fillRect(x, y, w, TAB_H);
    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(t('civOverlay.header'), x + pad, y + 21);

    const listY = y + TAB_H;
    const listH = h - TAB_H;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listY, w, listH);
    ctx.clip();

    let ry = listY + 6 - this._scrollLeft;

    // ── IMPERIUM ────────────────────────────────────────────────────────
    this._sectionHeader(ctx, x + pad, ry, t('civOverlay.empire'));
    ry += 18;

    const colCount = data.fullColonies.length;
    const outCount = data.outposts.length;
    this._statRow(ctx, x + pad, ry, w, t('civOverlay.colonies'), `${colCount} (+${outCount} ${t('civOverlay.outposts')})`);
    ry += ROW_H;
    this._statRow(ctx, x + pad, ry, w, t('civOverlay.totalShips'), `${data.vessels.length}`);
    ry += ROW_H + 4;

    // ── POPULACJA ───────────────────────────────────────────────────────
    this._sectionHeader(ctx, x + pad, ry, t('civOverlay.population'));
    ry += 18;

    this._statRow(ctx, x + pad, ry, w, t('civOverlay.totalPop'), `${data.totalPop.toFixed(1)} / ${data.totalMaxPop.toFixed(0)}`);
    ry += ROW_H;
    // Pasek populacji
    const popPct = data.totalMaxPop > 0 ? data.totalPop / data.totalMaxPop : 0;
    this._drawBar(ctx, x + pad, ry, w - pad * 2, 6, popPct, THEME.accent, THEME.border);
    ry += 12;

    this._statRow(ctx, x + pad, ry, w, t('civOverlay.avgProsperity'),
      `${data.avgProsperity.toFixed(1)} / 100`, this._prosperityColor(data.avgProsperity));
    ry += ROW_H + 4;

    // ── EKONOMIA ────────────────────────────────────────────────────────
    this._sectionHeader(ctx, x + pad, ry, t('civOverlay.economy'));
    ry += 18;

    this._statRow(ctx, x + pad, ry, w, t('civOverlay.credits'),
      `${data.totalCredits.toFixed(0)} Kr`, THEME.warning);
    ry += ROW_H;
    const sign = data.totalCreditsPerYear >= 0 ? '+' : '';
    this._statRow(ctx, x + pad, ry, w, t('civOverlay.creditsPerYear'),
      `${sign}${data.totalCreditsPerYear.toFixed(1)} Kr/${t('tradePanel.perYear')}`,
      data.totalCreditsPerYear >= 0 ? THEME.success : THEME.danger);
    ry += ROW_H;
    this._statRow(ctx, x + pad, ry, w, t('civOverlay.research'),
      `${data.totalResearch.toFixed(1)}/${t('tradePanel.perYear')}`, THEME.info);
    ry += ROW_H + 2;

    // Top surowce (deficytowe i nadmiarowe)
    const sortedRes = Object.entries(data.globalResources)
      .filter(([id]) => ALL_RESOURCES[id])
      .sort((a, b) => a[1].rate - b[1].rate);

    const deficits = sortedRes.filter(([, v]) => v.rate < -0.5).slice(0, 4);
    const surpluses = sortedRes.filter(([, v]) => v.rate > 0.5).reverse().slice(0, 4);

    if (deficits.length > 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      ctx.fillText(t('civOverlay.deficits'), x + pad, ry + 10);
      ry += 14;
      for (const [id, v] of deficits) {
        const rd = ALL_RESOURCES[id];
        const nm = rd ? getName(rd, 'resource') : id;
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(`  ${nm}: ${v.rate.toFixed(1)}/${t('tradePanel.perYear')} (${Math.round(v.stock)})`, x + pad + 4, ry + 10);
        ry += 13;
      }
    }
    if (surpluses.length > 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.success;
      ctx.fillText(t('civOverlay.surpluses'), x + pad, ry + 10);
      ry += 14;
      for (const [id, v] of surpluses) {
        const rd = ALL_RESOURCES[id];
        const nm = rd ? getName(rd, 'resource') : id;
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(`  ${nm}: +${v.rate.toFixed(1)}/${t('tradePanel.perYear')} (${Math.round(v.stock)})`, x + pad + 4, ry + 10);
        ry += 13;
      }
    }
    ry += 4;

    // ── FLOTA ───────────────────────────────────────────────────────────
    this._sectionHeader(ctx, x + pad, ry, t('civOverlay.fleet'));
    ry += 18;

    this._statRow(ctx, x + pad, ry, w, t('civOverlay.docked'), `${data.docked}`);
    ry += ROW_H;
    this._statRow(ctx, x + pad, ry, w, t('civOverlay.inFlight'), `${data.inFlight}`, THEME.warning);
    ry += ROW_H;
    this._statRow(ctx, x + pad, ry, w, t('civOverlay.orbiting'), `${data.orbiting}`, THEME.info);
    ry += ROW_H + 2;

    // Breakdown per typ statku
    for (const [shipId, count] of Object.entries(data.fleetByType)) {
      const shipDef = SHIPS[shipId];
      const shipName = shipDef ? getName(shipDef, 'ship') : shipId;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`  ${shipName}: ${count}`, x + pad + 4, ry + 10);
      ry += 13;
    }

    ctx.restore();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRAWA KOLUMNA — breakdown per kolonia
  // ══════════════════════════════════════════════════════════════════════════

  _drawRight(ctx, x, y, w, h, data) {
    const pad = 14;

    // Nagłówek
    ctx.fillStyle = bgAlpha(0.50);
    ctx.fillRect(x, y, w, TAB_H);
    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('civOverlay.coloniesHeader'), x + pad, y + 21);

    const listY = y + TAB_H;
    const listH = h - TAB_H;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listY, w, listH);
    ctx.clip();

    let ry = listY + 6 - this._scrollRight;

    // Nagłówki tabeli
    const cols = [0, 110, 180, 230, 280, 330];
    ctx.font = `bold ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('civOverlay.colName'),       x + pad + cols[0], ry + 10);
    ctx.fillText(t('civOverlay.colPop'),         x + pad + cols[1], ry + 10);
    ctx.fillText(t('civOverlay.colProsperity'),  x + pad + cols[2], ry + 10);
    ctx.fillText(t('civOverlay.colCredits'),     x + pad + cols[3], ry + 10);
    ctx.fillText(t('civOverlay.colFleet'),       x + pad + cols[4], ry + 10);
    ctx.fillText(t('civOverlay.colBuildings'),   x + pad + cols[5], ry + 10);
    ry += 16;

    // Separator nagłówka
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, ry); ctx.lineTo(x + w - pad, ry); ctx.stroke();
    ry += 4;

    // Wiersze kolonii — pełne kolonie najpierw, potem outposty
    const sorted = [...data.perColony].sort((a, b) => {
      if (a.isOutpost !== b.isOutpost) return a.isOutpost ? 1 : -1;
      return b.pop - a.pop;
    });

    for (const col of sorted) {
      const isActive = col.planetId === window.KOSMOS?.colonyManager?.activePlanetId;

      // Podświetlenie aktywnej kolonii
      if (isActive) {
        ctx.fillStyle = 'rgba(0,255,180,0.06)';
        ctx.fillRect(x + 2, ry - 2, w - 4, ROW_H + 2);
      }

      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;

      // Nazwa
      const nameColor = col.isOutpost ? THEME.textDim : (isActive ? THEME.accent : THEME.textPrimary);
      ctx.fillStyle = nameColor;
      const prefix = col.isOutpost ? '\u25CB ' : '\u25CF ';  // ring vs filled circle
      ctx.fillText((prefix + col.name).slice(0, 16), x + pad + cols[0], ry + 10);

      // Populacja
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(col.isOutpost ? '-' : `${col.pop.toFixed(1)}/${col.maxPop}`, x + pad + cols[1], ry + 10);

      // Prosperity
      if (!col.isOutpost) {
        ctx.fillStyle = this._prosperityColor(col.prosperity);
        ctx.fillText(`${col.prosperity.toFixed(0)}`, x + pad + cols[2], ry + 10);
      } else {
        ctx.fillStyle = THEME.textDim;
        ctx.fillText('-', x + pad + cols[2], ry + 10);
      }

      // Kredyty
      ctx.fillStyle = THEME.warning;
      ctx.fillText(`${(col.credits ?? 0).toFixed(0)}`, x + pad + cols[3], ry + 10);

      // Flota
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`${col.fleetCount}`, x + pad + cols[4], ry + 10);

      // Budynki
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`${col.buildings}`, x + pad + cols[5], ry + 10);

      // Klik — przejdź do kolonii
      this._addHit(x + 2, ry - 2, w - 4, ROW_H + 2, 'goto_colony', { planetId: col.planetId });

      ry += ROW_H + 2;
    }

    ctx.restore();
  }

  // ── Helpery rysowania ────────────────────────────────────────────────────

  _sectionHeader(ctx, sx, sy, label) {
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(label, sx, sy + 11);
    // Linia pod nagłówkiem sekcji
    ctx.strokeStyle = THEME.border;
    ctx.beginPath();
    ctx.moveTo(sx, sy + 14);
    ctx.lineTo(sx + 200, sy + 14);
    ctx.stroke();
  }

  _statRow(ctx, sx, sy, w, label, value, valueColor) {
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(label, sx, sy + 10);
    ctx.fillStyle = valueColor ?? THEME.textPrimary;
    ctx.textAlign = 'right';
    ctx.fillText(value, sx + w - 32, sy + 10);
    ctx.textAlign = 'left';
  }

  _prosperityColor(val) {
    if (val >= 70) return THEME.success;
    if (val >= 40) return THEME.warning;
    return THEME.danger;
  }

  // ── Obsługa kliknięć ───────────────────────────────────────────────────

  handleClick(x, y) {
    if (!this.visible) return false;
    const { ox, oy, ow, oh } = this._getOverlayBounds(
      Math.round(window.innerWidth / (Math.min(window.innerWidth / 1280, window.innerHeight / 720))),
      Math.round(window.innerHeight / (Math.min(window.innerWidth / 1280, window.innerHeight / 720)))
    );
    if (x < ox || x > ox + ow || y < oy || y > oy + oh) return false;

    const hit = this._hitTest(x, y);
    if (hit) {
      this._onHit(hit);
      return true;
    }
    return true;
  }

  _onHit(zone) {
    switch (zone.type) {
      case 'close':
        this.hide();
        break;
      case 'goto_colony': {
        const colMgr = window.KOSMOS?.colonyManager;
        if (colMgr) {
          colMgr.switchActiveColony(zone.data.planetId);
        }
        break;
      }
    }
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    const { ox, oy, ow, oh } = this._getOverlayBounds(
      Math.round(window.innerWidth / (Math.min(window.innerWidth / 1280, window.innerHeight / 720))),
      Math.round(window.innerHeight / (Math.min(window.innerWidth / 1280, window.innerHeight / 720)))
    );
    if (x < ox || x > ox + ow || y < oy || y > oy + oh) return false;

    if (x < ox + LEFT_W) {
      this._scrollLeft = Math.max(0, this._scrollLeft + delta * 0.5);
    } else {
      this._scrollRight = Math.max(0, this._scrollRight + delta * 0.5);
    }
    return true;
  }
}
