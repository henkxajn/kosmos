// CivilizationOverlay — panel podsumowania cywilizacji (klawisz V)
//
// Globalne statystyki: populacja, prosperity, produkcja, handel, flota.
// Lewa kolumna: overview (sumy, średnie, kluczowe wskaźniki).
// Prawa kolumna: breakdown per kolonia (tabela z najważniejszymi danymi).

import { BaseOverlay, HEADER_H }   from './BaseOverlay.js';
import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { ALL_RESOURCES } from '../data/ResourcesData.js';
import { SHIPS }         from '../data/ShipsData.js';
import { HULLS }         from '../data/HullsData.js';
import { LEADERS }       from '../data/LeaderData.js';
import { t, getName, getLocale } from '../i18n/i18n.js';

// Faza C5: kolory frakcji (wspólne z FactionSelectScene/branding)
const COLOR_SEEKERS      = '#D85A30';
const COLOR_CONFEDERATES = '#378ADD';

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
    ctx.strokeStyle = THEME.borderActive;
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

    // S3.5a-1 fix — przegląd Cywilizacji = TYLKO kolonie gracza. getAllColonies() zawiera też
    //   kolonie AI (ownerEmpireId != null); sumowanie ich kredytów/pop/podatków fałszowało totale
    //   (kredyty nigdy nie spadały poniżej salda AI, skok przy kolonizacji AI — BUG D/F).
    const colonies = (colMgr?.getAllColonies() ?? []).filter(c => !c.ownerEmpireId);
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
        loyalty: civ?.loyalty ?? 80,
        identityScore: civ?.identity?.score ?? 0,
        milestones: civ?.colonyHistory?.length ?? 0,
        traits: civ?.identity?.traits ?? [],
        isAutonomous: civ?.isAutonomous ?? false,
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

    // ── Faza C5: snapshot lidera i frakcji (raz per frame) ─────────────────
    const leaderSys = window.KOSMOS?.leaderSystem;
    const facSys    = window.KOSMOS?.factionSystem;
    const leaderId  = leaderSys?.activeLeader ?? null;
    const leaderDef = leaderId ? LEADERS[leaderId] : null;
    const leaderInfo = {
      leaderId,
      leaderDef,
      activeFaction: leaderSys?.activeFaction ?? null,
    };
    const factionInfo = facSys ? {
      ref:     facSys,
      locked:  !!facSys.isLocked,
      slider:  facSys.slider  ?? 50,
      tension: facSys.tension ?? 0,
      zone:    facSys.getCurrentZone?.() ?? 'balanced',
    } : null;

    // Podatki — suma przychodu i etykieta efektu
    const colMgrRef = window.KOSMOS?.colonyManager;
    let taxIncome = 0;
    if (colMgrRef) {
      for (const col of fullColonies) {
        taxIncome += colMgrRef.calculateTaxIncome(col);
      }
    }
    const taxEffect = this._getTaxEffectLabel(colMgrRef?.taxRate ?? 0.08);

    // Utrzymanie jednostek naziemnych — suma Kr/civYear dla wszystkich jednostek gracza.
    // Źródło: tabela ColonyManager.GROUND_UNIT_UPKEEP (tick co 1.0 civYear w _tickGroundUnitUpkeep).
    let totalUnitUpkeep = 0;
    let unitUpkeepCount = 0;
    const guMgr = window.KOSMOS?.groundUnitManager;
    const upTable = colMgrRef?.constructor?.GROUND_UNIT_UPKEEP;
    if (guMgr && upTable) {
      for (const u of guMgr._units?.values?.() ?? []) {
        if (u.owner !== 'player' && u.factionId !== 'humanity') continue;
        const up = upTable[u.archetypeId];
        if (!up) continue;
        totalUnitUpkeep += up.credits ?? 0;
        unitUpkeepCount++;
      }
    }

    // S3.5a-1 — utrzymanie floty w Kr (suma roczna). getTotalFleetUpkeep filtruje
    //   wraki + AI; count = statki gracza bez wraków (player overview).
    let totalFleetUpkeep = vMgr?.getTotalFleetUpkeep?.() ?? 0;
    let fleetUpkeepCount = 0;
    for (const v of vessels) {
      if (v.isWreck) continue;
      if (v.ownerEmpireId && v.ownerEmpireId !== 'player') continue;
      fleetUpkeepCount++;
    }

    return {
      colonies, fullColonies, outposts, perColony,
      totalPop, totalMaxPop, avgProsperity,
      totalCredits, totalCreditsPerYear, totalResearch,
      globalResources, taxIncome, taxEffect,
      totalUnitUpkeep, unitUpkeepCount,
      totalFleetUpkeep, fleetUpkeepCount,
      vessels, fleetByType, inFlight, orbiting, docked,
      leaderInfo, factionInfo,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEWA KOLUMNA — globalne podsumowanie
  // ══════════════════════════════════════════════════════════════════════════

  _drawLeft(ctx, x, y, w, h, data) {
    const pad = 14;

    // Nagłówek (standard: BaseOverlay._drawOverlayHeader)
    this._drawOverlayHeader(ctx, x, y, w, t('civOverlay.header'));

    const listY = y + HEADER_H;
    const listH = h - HEADER_H;
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
    ry += ROW_H;

    // Średnia lojalność + tożsamość (Kronika Imperium)
    const fullCols = data.perColony.filter(c => !c.isOutpost);
    if (fullCols.length > 0) {
      const avgLoyalty = fullCols.reduce((s, c) => s + (c.loyalty ?? 80), 0) / fullCols.length;
      const avgIdentity = fullCols.reduce((s, c) => s + (c.identityScore ?? 0), 0) / fullCols.length;
      const atRisk = fullCols.filter(c => (c.loyalty ?? 80) < 30).length;

      const loyColor = avgLoyalty > 70 ? THEME.success : avgLoyalty > 30 ? THEME.warning : THEME.danger;
      this._statRow(ctx, x + pad, ry, w, t('civOverlay.avgLoyalty') || 'Śr. lojalność',
        `${avgLoyalty.toFixed(0)}%`, loyColor);
      ry += ROW_H;
      this._statRow(ctx, x + pad, ry, w, t('civOverlay.avgIdentity') || 'Śr. tożsamość',
        `${avgIdentity.toFixed(0)}`, '#c8a050');
      ry += ROW_H;
      if (atRisk > 0) {
        this._statRow(ctx, x + pad, ry, w, t('civOverlay.atRisk') || '⚠ W ryzyku',
          `${atRisk} ${atRisk === 1 ? 'kolonia' : 'kolonie'}`, THEME.danger);
        ry += ROW_H;
      }
    }
    ry += 4;

    // ── Faza C5: LIDER + FRAKCJE ────────────────────────────────────────
    ry = this._drawLeaderFactionBlock(ctx, x, ry, w, pad, data);

    // ── EKONOMIA ────────────────────────────────────────────────────────
    this._sectionHeader(ctx, x + pad, ry, t('civOverlay.economy'));
    ry += 18;

    this._statRow(ctx, x + pad, ry, w, t('civOverlay.credits'),
      `${data.totalCredits.toFixed(0)} Kr`, THEME.warning);
    ry += ROW_H;
    // S3.5a-1 — Bilans Kr = NETTO: handel + podatki − utrzymanie jednostek − utrzymanie floty.
    //   Wcześniej pokazywał tylko przepływ handlu (col.creditsPerYear), pomijając podatki (idą
    //   wprost do col.credits) ORAZ upkeep → mylące +0.0 mimo realnego deficytu.
    const netPerYear = data.totalCreditsPerYear + data.taxIncome
                     - data.totalUnitUpkeep - data.totalFleetUpkeep;
    const sign = netPerYear >= 0 ? '+' : '';
    this._statRow(ctx, x + pad, ry, w, t('civOverlay.creditsPerYear'),
      `${sign}${netPerYear.toFixed(1)} Kr/${t('tradePanel.perYear')}`,
      netPerYear >= 0 ? THEME.success : THEME.danger);
    ry += ROW_H;
    // Utrzymanie jednostek naziemnych (płacone raz na civYear z kolonii macierzystej)
    if (data.unitUpkeepCount > 0) {
      this._statRow(ctx, x + pad, ry, w,
        `Utrzymanie jednostek (${data.unitUpkeepCount})`,
        `-${data.totalUnitUpkeep} Kr/${t('tradePanel.perYear')}`,
        THEME.danger);
      ry += ROW_H;
    }
    // S3.5a-1 — utrzymanie floty (główny sink Kr; raz na civYear z kolonii macierzystej / homePlanet)
    if (data.fleetUpkeepCount > 0) {
      this._statRow(ctx, x + pad, ry, w,
        `${t('civOverlay.fleetUpkeep')} (${data.fleetUpkeepCount})`,
        `-${data.totalFleetUpkeep} Kr/${t('tradePanel.perYear')}`,
        THEME.danger);
      ry += ROW_H;
    }
    this._statRow(ctx, x + pad, ry, w, t('civOverlay.research'),
      `${data.totalResearch.toFixed(1)}/${t('tradePanel.perYear')}`, THEME.info);
    ry += ROW_H + 2;

    // ── PODATKI ─────────────────────────────────────────────────────────
    this._sectionHeader(ctx, x + pad, ry, t('civOverlay.taxes'));
    ry += 18;

    // Suwak podatkowy (0–25%) z kolorowymi strefami
    const colMgrTax = window.KOSMOS?.colonyManager;
    const taxRate = colMgrTax?.taxRate ?? 0.08;
    const taxPct = taxRate / 0.25; // 0–1
    const BAR_W = w - pad * 2;
    const taxBarY = ry;

    // Tło paska
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x + pad, ry, BAR_W, 8);

    // Wypełnienie kolorowe wg strefy
    const taxColor = taxRate <= 0.05 ? '#00ff88'
      : taxRate <= 0.12 ? THEME.accent
      : taxRate <= 0.20 ? '#ffaa00'
      : '#ff4444';
    ctx.fillStyle = taxColor;
    ctx.fillRect(x + pad, ry, BAR_W * taxPct, 8);

    // Znacznik pozycji
    const markerX = x + pad + BAR_W * taxPct;
    ctx.fillStyle = '#fff';
    ctx.fillRect(markerX - 1, ry - 2, 2, 12);
    ry += 16;

    // Hit zone na pasku — klik zmienia stawkę
    this._addHit(x + pad, taxBarY - 4, BAR_W, 16, 'tax_slider', { barX: x + pad, barW: BAR_W });

    // Wartości
    this._statRow(ctx, x + pad, ry, w, t('civOverlay.taxRate'),
      `${Math.round(taxRate * 100)}%`, taxColor);
    ry += ROW_H;

    // Przychód z podatków (suma per-kolonia)
    const taxIncome = data.taxIncome ?? 0;
    this._statRow(ctx, x + pad, ry, w, t('civOverlay.taxIncome'),
      `+${taxIncome} Kr/${t('tradePanel.perYear')}`, THEME.success);
    ry += ROW_H;

    // Efekt na społeczeństwo
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillText(data.taxEffect, x + pad, ry + 8);
    ry += 16;

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
      const shipDef = SHIPS[shipId] ?? HULLS[shipId];
      const shipName = shipDef ? getName(shipDef, 'ship') : shipId;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`  ${shipName}: ${count}`, x + pad + 4, ry + 10);
      ry += 13;
    }

    ctx.restore();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Faza C5: blok LIDER + FRAKCJE (lewa kolumna, między POPULACJA a EKONOMIA)
  // ══════════════════════════════════════════════════════════════════════════

  // Zwraca nową wartość ry po narysowaniu sekcji.
  _drawLeaderFactionBlock(ctx, x, ry, w, pad, data) {
    const isPL = getLocale() !== 'en';
    const leaderInfo  = data.leaderInfo;
    const factionInfo = data.factionInfo;

    // ── SEKCJA 1 — LIDER (zawsze widoczna w civMode) ─────────────────────
    this._sectionHeader(ctx, x + pad, ry, t('civOverlay.leader'));
    ry += 18;

    if (leaderInfo?.leaderDef) {
      const leader = leaderInfo.leaderDef;
      const name   = isPL ? leader.namePL : (leader.nameEN || leader.namePL);
      const title  = isPL ? leader.titlePL : (leader.titleEN || leader.titlePL);
      const arch   = isPL ? leader.archetype : (leader.archetypeEN || leader.archetype);

      // Imię (główny tekst)
      ctx.font = `bold ${THEME.fontSizeSmall + 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(name, x + pad, ry + 10);
      ry += 14;

      // Tytuł (mniejszy, faded)
      if (title) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(title, x + pad, ry + 9);
        ry += 12;
      }

      // Archetype (mniejszy, accent kolor)
      if (arch) {
        ctx.font = `italic ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.accent;
        ctx.fillText(`◈ ${arch}`, x + pad, ry + 9);
        ry += 12;
      }

      // Frakcja (znana lub nieznana)
      const factionId = leaderInfo.activeFaction;
      let factionLabel, factionColor;
      if (factionId === 'confederates') {
        factionLabel = isPL ? 'Konfederaci Misji' : 'Confederation of the Mission';
        factionColor = COLOR_CONFEDERATES;
      } else if (factionId === 'seekers') {
        factionLabel = isPL ? 'Poszukiwacze Drogi' : 'Seekers of the Way';
        factionColor = COLOR_SEEKERS;
      } else {
        factionLabel = t('civOverlay.factionUnknown');
        factionColor = THEME.textDim;
      }
      this._statRow(ctx, x + pad, ry, w, t('civOverlay.faction'), factionLabel, factionColor);
      ry += ROW_H;
    } else {
      // Brak lidera (nie powinno się zdarzyć w civMode, defensywnie)
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('—', x + pad, ry + 10);
      ry += ROW_H;
    }
    ry += 4;

    // ── SEKCJA 2 — FRAKCJE (tylko gdy odblokowane) ──────────────────────
    if (factionInfo && !factionInfo.locked) {
      this._sectionHeader(ctx, x + pad, ry, t('civOverlay.factionsHeader'));
      ry += 18;

      const slider  = factionInfo.slider;
      const tension = factionInfo.tension;
      const zone    = factionInfo.zone;
      const barW    = w - pad * 2;

      // ── Pasek suwaka 0-100 z 3 strefami ──
      const barX = x + pad;
      const barY = ry;
      const barH = 8;

      // Tło paska podzielone na 3 strefy kolorystyczne
      // Lewa 0-30 = Seekers (#D85A30), środek 31-69 = accent, prawa 70-100 = Confed (#378ADD)
      const seg1W = Math.round(barW * 0.30);    // 0-30
      const seg2W = Math.round(barW * 0.40);    // 30-70
      const seg3W = barW - seg1W - seg2W;       // 70-100
      ctx.fillStyle = COLOR_SEEKERS + '40';     // semi-transparent (40 = 25%)
      ctx.fillRect(barX, barY, seg1W, barH);
      ctx.fillStyle = THEME.accent + '30';
      ctx.fillRect(barX + seg1W, barY, seg2W, barH);
      ctx.fillStyle = COLOR_CONFEDERATES + '40';
      ctx.fillRect(barX + seg1W + seg2W, barY, seg3W, barH);

      // Granice stref (subtelne pionowe linie)
      ctx.strokeStyle = THEME.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(barX + seg1W, barY); ctx.lineTo(barX + seg1W, barY + barH);
      ctx.moveTo(barX + seg1W + seg2W, barY); ctx.lineTo(barX + seg1W + seg2W, barY + barH);
      ctx.stroke();

      // Ramka paska
      ctx.strokeStyle = THEME.border;
      ctx.strokeRect(barX, barY, barW, barH);

      // Znacznik aktualnej pozycji slidera (pionowa kreska + trójkąt nad)
      let markerColor;
      if (slider <= 30)      markerColor = COLOR_SEEKERS;
      else if (slider >= 70) markerColor = COLOR_CONFEDERATES;
      else                   markerColor = THEME.accent;
      const markerX = barX + Math.round(barW * (slider / 100));
      ctx.fillStyle = markerColor;
      ctx.fillRect(markerX - 1, barY - 2, 3, barH + 4);

      ry += barH + 6;

      // Etykieta strefy (centered nad paskiem niższe?, na razie pod paskiem po lewej + wartość po prawej)
      const zoneKey = `civOverlay.zone_${zone}`;
      const zoneLabel = t(zoneKey);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = markerColor;
      ctx.fillText(zoneLabel, x + pad, ry + 9);
      ctx.textAlign = 'right';
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(`${Math.round(slider)}/100`, x + pad + barW, ry + 9);
      ctx.textAlign = 'left';
      ry += 14;

      // ── Sub-pasek napięcia ──
      const tensionLabel = `${t('civOverlay.tension')}: ${Math.round(tension)}%`;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = tension > 50 ? THEME.danger : THEME.textSecondary;
      ctx.fillText(tensionLabel, x + pad, ry + 9);
      ry += 12;

      const tensionColor = tension > 50 ? THEME.danger : THEME.warning;
      this._drawBar(ctx, x + pad, ry, barW, 4, tension / 100, tensionColor, THEME.border);
      ry += 8;

      // ── Modyfikatory aktywnej strefy (top 2-3) ──
      const facSys = factionInfo.ref;
      if (facSys?.getModifier) {
        const STATS = ['research', 'industryProduction', 'prosperity', 'popGrowth', 'explorationSpeed', 'anomalyChance'];
        const modLabels = {
          research:           t('civOverlay.modResearch'),
          industryProduction: t('civOverlay.modIndustry'),
          prosperity:         t('civOverlay.modProsperity'),
          popGrowth:          t('civOverlay.modPopGrowth'),
          explorationSpeed:   t('civOverlay.modExploration'),
          anomalyChance:      t('civOverlay.modAnomaly'),
        };
        const activeMods = [];
        for (const stat of STATS) {
          const mult = facSys.getModifier(stat);
          if (mult === 1.0) continue;
          activeMods.push({ stat, mult });
          if (activeMods.length >= 3) break;
        }
        if (activeMods.length > 0) {
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          for (const m of activeMods) {
            const pct = Math.round((m.mult - 1.0) * 100);
            const sign = pct > 0 ? '+' : '';
            const color = m.mult < 1.0 ? THEME.danger : THEME.success;
            ctx.fillStyle = color;
            ctx.fillText(`  ${modLabels[m.stat]}: ${sign}${pct}%`, x + pad, ry + 9);
            ry += 11;
          }
        }
      }
      ry += 4;
    } else if (factionInfo && factionInfo.locked) {
      // Frakcje jeszcze nie odblokowane — krótka notka zamiast sekcji
      ctx.font = `italic ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('civOverlay.factionLocked'), x + pad, ry + 9);
      ry += 14;
      ry += 4;
    }

    return ry;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRAWA KOLUMNA — breakdown per kolonia
  // ══════════════════════════════════════════════════════════════════════════

  _drawRight(ctx, x, y, w, h, data) {
    const pad = 14;

    // Nagłówek (standard: BaseOverlay._drawOverlayHeader)
    this._drawOverlayHeader(ctx, x, y, w, t('civOverlay.coloniesHeader'));

    const listY = y + HEADER_H;
    const listH = h - HEADER_H;
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

      // Loyalty + Identity mini-paski (pod głównym wierszem)
      if (!col.isOutpost) {
        ry += ROW_H - 2;
        const barStartX = x + pad + cols[0] + 16;
        const barW = 60;

        // Mini pasek loyalty
        const loyRatio = (col.loyalty ?? 80) / 100;
        const loyColor = loyRatio > 0.7 ? THEME.success : loyRatio > 0.3 ? THEME.warning : THEME.danger;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(barStartX, ry, barW, 4);
        ctx.fillStyle = loyColor;
        ctx.fillRect(barStartX, ry, barW * loyRatio, 4);

        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = loyColor;
        ctx.fillText(`L:${Math.round(col.loyalty)}%`, barStartX + barW + 3, ry + 4);

        // Mini pasek identity
        const idBarX = barStartX + barW + 40;
        const idRatio = (col.identityScore ?? 0) / 100;
        const idColor = idRatio > 0.5 ? '#c8a050' : '#a08040';
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(idBarX, ry, barW, 4);
        ctx.fillStyle = idColor;
        ctx.fillRect(idBarX, ry, barW * idRatio, 4);

        ctx.fillStyle = idColor;
        ctx.fillText(`T:${col.identityScore}`, idBarX + barW + 3, ry + 4);

        // Flaga ryzyka
        if (col.loyalty < 30) {
          ctx.fillStyle = THEME.danger;
          ctx.fillText('⚠', idBarX + barW + 30, ry + 4);
        }
        if (col.isAutonomous) {
          ctx.fillStyle = THEME.warning;
          ctx.fillText('🏴', idBarX + barW + 40, ry + 4);
        }

        ry += 6;
      }

      // Klik — przejdź do kolonii
      this._addHit(x + 2, ry - ROW_H - 4, w - 4, ROW_H + 10, 'goto_colony', { planetId: col.planetId });

      ry += 4;
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

    this._lastClickX = x; // zapamiętaj pozycję X dla tax_slider
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
      case 'tax_slider': {
        // Klik na pasku → ustaw stawkę proporcjonalnie do pozycji X
        const colMgr = window.KOSMOS?.colonyManager;
        if (!colMgr) break;
        // Pozycja kliknięcia w pikselach od lewej krawędzi paska
        const hitX = this._lastClickX ?? 0;
        const relX = Math.max(0, Math.min(zone.data.barW, hitX - zone.data.barX));
        const newRate = (relX / zone.data.barW) * 0.25;
        // Snap do 1% kroków
        colMgr.taxRate = Math.round(newRate * 100) / 100;
        break;
      }
    }
  }

  _getTaxEffectLabel(rate) {
    const isPL = getLocale() !== 'en';
    // taxDrain: jak bardzo podatki obcinają konsumpcję
    const drain = rate <= 0.05 ? -(0.05 - rate) * 200    // bonus 0→10%
                : rate <= 0.12 ? 0
                : (rate - 0.12) / 0.13 * 40;             // kara 0→40%
    const drainPct = Math.round(drain);

    if (drainPct < 0) return isPL
      ? `✓ Dotacja konsumpcji +${-drainPct}%`
      : `✓ Consumption subsidy +${-drainPct}%`;
    if (drainPct === 0) return isPL
      ? '● Neutralne'
      : '● Neutral';
    if (rate <= 0.20) return isPL
      ? `⚠ Konsumpcja -${drainPct}%`
      : `⚠ Consumption -${drainPct}%`;
    return isPL
      ? `✗ Konsumpcja -${drainPct}% — ryzyko protestu`
      : `✗ Consumption -${drainPct}% — protest risk`;
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
