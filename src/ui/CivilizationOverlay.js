// CivilizationOverlay — panel cywilizacji (klawisz V)
//
// Po przeniesieniu budżetu do EconomyOverlay (zakładka BUDŻET) panel skupia się na
// PRZYWÓDZTWIE i IMPERIUM. Układ 3-kolumnowy (lewa szersza pod duży portret):
//   • LEWA   — Przywódca (duży portret 64→~190px + bonusy + frakcja) → Imperium (sumy/średnie)
//   • ŚRODEK — lista kolonii (pasek prosperity) + 4 karty podsumowania na dole
//   • PRAWA  — Historia (scrollowalna kronika kamieni milowych)

import { BaseOverlay, HEADER_H } from './BaseOverlay.js';
import { THEME, bgAlpha }        from '../config/ThemeConfig.js';
import { LEADERS }               from '../data/LeaderData.js';
import { t, getLocale }          from '../i18n/i18n.js';

// Faza C5: kolory frakcji (wspólne z FactionSelectScene/branding)
const COLOR_SEEKERS      = '#D85A30';
const COLOR_CONFEDERATES = '#378ADD';

// Proporcja lewej kolumny (szersza — mieści duży portret). Środek + prawa dzielą resztę po równo.
const LEFT_FRAC = 0.36;
const ROW_H     = 16;

// ── Cache portretów liderów (leniwy, wzorzec ResourceIcons) ──────────────────
// Import-safe w Node (headless): DOM dotykany tylko pod strażą typeof Image.
const _portraitCache = new Map();   // leaderId → HTMLImageElement
function _getPortrait(leaderId, path) {
  if (typeof Image === 'undefined' || !path) return null;   // headless → fallback
  let img = _portraitCache.get(leaderId);
  if (img) return img;
  img = new Image();
  img.src = path;
  _portraitCache.set(leaderId, img);
  return img;
}

// "cover" — wypełnia prostokąt docelowy zachowując proporcje obrazu, przycinając nadmiar
// (odpowiednik CSS object-fit: cover z ekranu wyboru lidera — bez rozciągania).
function _drawImageCover(ctx, img, dx, dy, dw, dh) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (!iw || !ih) return;
  const scale = Math.max(dw / iw, dh / ih);
  const sw = dw / scale, sh = dh / scale;        // źródłowy wycinek
  const sx = (iw - sw) / 2, sy = (ih - sh) / 2;  // wyśrodkowany
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

// ══════════════════════════════════════════════════════════════════════════════
// CivilizationOverlay
// ══════════════════════════════════════════════════════════════════════════════

export class CivilizationOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._scrollLeft    = 0;   // scroll lewej kolumny (Przywódca + Imperium)
    this._scrollMid     = 0;   // scroll listy kolonii (środek)
    this._scrollHistory = 0;   // scroll kroniki (prawa)
  }

  // Geometria 3 kolumn (lewa szersza, środek+prawa równo).
  _getColumns(W, H) {
    const b = this._getOverlayBounds(W, H);
    const leftW  = Math.round(b.ow * LEFT_FRAC);
    const restW  = b.ow - leftW;
    const midW   = Math.round(restW / 2);
    const rightW = restW - midW;
    return { ...b, leftW, midW, rightW, x1: b.ox + leftW, x2: b.ox + leftW + midW };
  }

  // ── Główna metoda rysowania ──────────────────────────────────────────────

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];

    const C = this._getColumns(W, H);
    const { ox, oy, ow, oh, leftW, midW, rightW, x1, x2 } = C;

    // Tło
    ctx.fillStyle = bgAlpha(0.38);
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, ow, oh);

    // Separatory kolumn
    ctx.beginPath();
    ctx.moveTo(x1, oy); ctx.lineTo(x1, oy + oh);
    ctx.moveTo(x2, oy); ctx.lineTo(x2, oy + oh);
    ctx.stroke();

    // Przycisk zamknięcia [X]
    const closeX = ox + ow - 24;
    const closeY = oy + 4;
    ctx.font = `bold 14px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('✕', closeX, closeY + 14);
    this._addHit(closeX - 4, closeY, 22, 22, 'close');

    const data = this._gatherData();

    this._drawLeftCol(ctx, ox, oy, leftW, oh, data);
    this._drawMidCol(ctx,  x1, oy, midW, oh, data);
    this._drawRightCol(ctx, x2, oy, rightW, oh, data);
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
    let totalCreditsPerYear = 0, taxIncome = 0;
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
    const totalFleetUpkeep = vMgr?.getTotalFleetUpkeep?.() ?? 0;
    const netCreditsPerYear = totalCreditsPerYear + taxIncome - totalUnitUpkeep - totalFleetUpkeep;

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

  // ══════════════════════════════════════════════════════════════════════════
  // LEWA KOLUMNA — Przywódca (duży portret) → Frakcje → Imperium
  // ══════════════════════════════════════════════════════════════════════════

  _drawLeftCol(ctx, x, y, w, h, data) {
    const pad = 14;
    this._drawOverlayHeader(ctx, x, y, w, t('civOverlay.header'));

    const contentY = y + HEADER_H;
    const contentH = h - HEADER_H;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, contentY, w, contentH);
    ctx.clip();

    let ry = contentY + 8 - this._scrollLeft;
    ry = this._drawLeaderBlock(ctx, x, ry, w, pad, data);
    ry = this._drawFactionBlock(ctx, x, ry, w, pad, data);
    this._drawEmpireBlock(ctx, x, ry, w, pad, data);

    ctx.restore();
  }

  // ── Przywódca (DUŻY portret + imię + tytuł + cytat + bonusy) ───────────────
  _drawLeaderBlock(ctx, x, ry, w, pad, data) {
    const isPL   = getLocale() !== 'en';
    const leader = data.leaderInfo?.leaderDef;

    this._sectionHeader(ctx, x + pad, ry, t('civOverlay.leader'));
    ry += 22;

    if (!leader) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('—', x + pad, ry + 10);
      return ry + ROW_H + 4;
    }

    const name  = isPL ? leader.namePL : (leader.nameEN || leader.namePL);
    const title = isPL ? leader.titlePL : (leader.titleEN || leader.titlePL);
    const arch  = isPL ? leader.archetype : (leader.archetypeEN || leader.archetype);
    const quote = isPL ? leader.quote : (leader.quoteEN || leader.quote);

    const factionId = data.leaderInfo.activeFaction;
    const facColor = factionId === 'confederates' ? COLOR_CONFEDERATES
      : factionId === 'seekers' ? COLOR_SEEKERS
      : THEME.accent;

    // Portret w proporcji 4:5 (jak ekran wyboru lidera) — cover-crop, BEZ zniekształceń.
    const PW = Math.min(w - pad * 2, 180);
    const PH = Math.round(PW * 1.25);             // 4:5 (160×200 / 180×225)
    const px = x + pad, py = ry;
    const img = _getPortrait(data.leaderInfo.leaderId, leader.portrait);
    if (img && img.complete && img.naturalWidth > 0) {
      _drawImageCover(ctx, img, px, py, PW, PH);
    } else {
      ctx.fillStyle = THEME.accent + '22';
      ctx.fillRect(px, py, PW, PH);
      const initials = name.split(/\s+/).map(s => s[0] ?? '').slice(0, 2).join('').toUpperCase();
      ctx.font = `bold ${Math.round(PW * 0.34)}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.accent;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials, px + PW / 2, py + PH / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    // Ramka w kolorze theme (zmienia się z motywem)
    ctx.strokeStyle = THEME.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, PW - 2, PH - 2);
    ctx.lineWidth = 1;

    // Tekst obok portretu (imię + tytuł + archetyp) — kolumna po prawej stronie portretu
    const tx = px + PW + 12;
    const tw = w - pad - (PW + 12) - pad;
    let ty = py + 4;
    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    for (const ln of this._wrapText(ctx, name, tw).slice(0, 3)) { ctx.fillText(ln, tx, ty + 11); ty += 15; }
    if (title) {
      ctx.font = `9px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      for (const ln of this._wrapText(ctx, title, tw).slice(0, 3)) { ctx.fillText(ln, tx, ty + 9); ty += 11; }
    }
    if (arch) {
      ctx.font = `italic 9px ${THEME.fontFamily}`;
      ctx.fillStyle = facColor;
      for (const ln of this._wrapText(ctx, `◈ ${arch}`, tw).slice(0, 2)) { ctx.fillText(ln, tx, ty + 9); ty += 11; }
    }

    ry = Math.max(py + PH, ty) + 10;

    // Cytat (italic, pełna szerokość)
    if (quote) {
      ctx.font = `italic ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      for (const ln of this._wrapText(ctx, `„${quote}”`, w - pad * 2)) {
        ctx.fillText(ln, x + pad, ry + 9); ry += 12;
      }
      ry += 4;
    }

    // Bonusy (descPL/descEN zawierają już wartości)
    const bonuses = leader.bonuses ?? [];
    if (bonuses.length > 0) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('civOverlay.leaderBonuses'), x + pad, ry + 9);
      ry += 13;
      for (const b of bonuses) {
        const desc = isPL ? b.descPL : (b.descEN || b.descPL);
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.success;
        for (const ln of this._wrapText(ctx, `• ${desc}`, w - pad * 2 - 4)) {
          ctx.fillText(ln, x + pad + 4, ry + 9); ry += 12;
        }
      }
    }
    for (const m of (leader.maluses ?? [])) {
      const desc = isPL ? m.descPL : (m.descEN || m.descPL);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      for (const ln of this._wrapText(ctx, `• ${desc}`, w - pad * 2 - 4)) {
        ctx.fillText(ln, x + pad + 4, ry + 9); ry += 12;
      }
    }

    // Linia frakcji
    let factionLabel;
    if (factionId === 'confederates') factionLabel = isPL ? 'Konfederaci Misji' : 'Confederation of the Mission';
    else if (factionId === 'seekers') factionLabel = isPL ? 'Poszukiwacze Drogi' : 'Seekers of the Way';
    else factionLabel = t('civOverlay.factionUnknown');
    ry += 2;
    this._statRow(ctx, x + pad, ry, w, t('civOverlay.faction'), factionLabel, facColor);
    ry += ROW_H + 6;

    return ry;
  }

  // ── Frakcje (suwak/napięcie/modyfikatory — tylko gdy odblokowane) ──────────
  _drawFactionBlock(ctx, x, ry, w, pad, data) {
    const factionInfo = data.factionInfo;
    if (!factionInfo) return ry;

    if (factionInfo.locked) {
      ctx.font = `italic ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      for (const ln of this._wrapText(ctx, t('civOverlay.factionLocked'), w - pad * 2)) {
        ctx.fillText(ln, x + pad, ry + 9); ry += 12;
      }
      return ry + 8;
    }

    this._sectionHeader(ctx, x + pad, ry, t('civOverlay.factionsHeader'));
    ry += 22;

    const slider  = factionInfo.slider;
    const tension = factionInfo.tension;
    const zone    = factionInfo.zone;
    const barW    = w - pad * 2;
    const barX    = x + pad;
    const barY    = ry;
    const barH    = 8;

    const seg1W = Math.round(barW * 0.30);
    const seg2W = Math.round(barW * 0.40);
    const seg3W = barW - seg1W - seg2W;
    ctx.fillStyle = COLOR_SEEKERS + '40';
    ctx.fillRect(barX, barY, seg1W, barH);
    ctx.fillStyle = THEME.accent + '30';
    ctx.fillRect(barX + seg1W, barY, seg2W, barH);
    ctx.fillStyle = COLOR_CONFEDERATES + '40';
    ctx.fillRect(barX + seg1W + seg2W, barY, seg3W, barH);

    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(barX + seg1W, barY); ctx.lineTo(barX + seg1W, barY + barH);
    ctx.moveTo(barX + seg1W + seg2W, barY); ctx.lineTo(barX + seg1W + seg2W, barY + barH);
    ctx.stroke();
    ctx.strokeRect(barX, barY, barW, barH);

    let markerColor;
    if (slider <= 30)      markerColor = COLOR_SEEKERS;
    else if (slider >= 70) markerColor = COLOR_CONFEDERATES;
    else                   markerColor = THEME.accent;
    const markerX = barX + Math.round(barW * (slider / 100));
    ctx.fillStyle = markerColor;
    ctx.fillRect(markerX - 1, barY - 2, 3, barH + 4);
    ry += barH + 6;

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = markerColor;
    ctx.fillText(t(`civOverlay.zone_${zone}`), x + pad, ry + 9);
    ctx.textAlign = 'right';
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(`${Math.round(slider)}/100`, x + pad + barW, ry + 9);
    ctx.textAlign = 'left';
    ry += 14;

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = tension > 50 ? THEME.danger : THEME.textSecondary;
    ctx.fillText(`${t('civOverlay.tension')}: ${Math.round(tension)}%`, x + pad, ry + 9);
    ry += 12;
    this._drawBar(ctx, x + pad, ry, barW, 4, tension / 100,
      tension > 50 ? THEME.danger : THEME.warning, THEME.border);
    ry += 8;

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
          ctx.fillStyle = m.mult < 1.0 ? THEME.danger : THEME.success;
          ctx.fillText(`  ${modLabels[m.stat]}: ${sign}${pct}%`, x + pad, ry + 9);
          ry += 11;
        }
      }
    }
    ry += 6;
    return ry;
  }

  // ── Imperium (sumy / średnie / wiek / handel) ──────────────────────────────
  _drawEmpireBlock(ctx, x, ry, w, pad, data) {
    this._sectionHeader(ctx, x + pad, ry, t('civOverlay.empire'));
    ry += 22;

    this._statRow(ctx, x + pad, ry, w, t('civOverlay.colonies'),
      `${data.fullColonies.length} (+${data.outposts.length} ${t('civOverlay.outposts')})`);
    ry += ROW_H;
    this._statRow(ctx, x + pad, ry, w, t('civOverlay.totalShips'), `${data.vessels.length}`);
    ry += ROW_H;
    this._statRow(ctx, x + pad, ry, w, t('civOverlay.totalPop'),
      `${data.totalPop.toFixed(1)} / ${data.totalMaxPop.toFixed(0)}`);
    ry += ROW_H;
    this._statRow(ctx, x + pad, ry, w, t('civOverlay.avgProsperity'),
      `${data.avgProsperity.toFixed(1)}`, this._prosperityColor(data.avgProsperity));
    ry += ROW_H;
    const loyColor = data.avgLoyalty > 70 ? THEME.success : data.avgLoyalty > 30 ? THEME.warning : THEME.danger;
    this._statRow(ctx, x + pad, ry, w, t('civOverlay.avgLoyalty'), `${data.avgLoyalty.toFixed(0)}%`, loyColor);
    ry += ROW_H;
    this._statRow(ctx, x + pad, ry, w, t('civOverlay.civAge'),
      `${data.civAge} ${t('civOverlay.yearsShort')}`);
    ry += ROW_H;
    this._statRow(ctx, x + pad, ry, w, t('civOverlay.trade'),
      `${data.tradeConnections} ${t('civOverlay.connections')}`, THEME.info);
    ry += ROW_H + 6;

    return ry;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ŚRODKOWA KOLUMNA — lista kolonii (pasek prosperity) + 4 karty podsumowania
  // ══════════════════════════════════════════════════════════════════════════

  _drawMidCol(ctx, x, y, w, h, data) {
    const pad = 14;
    this._drawOverlayHeader(ctx, x, y, w, t('civOverlay.coloniesHeader'));

    const CARDS_H = 104;
    const BOTTOM_PAD = 28;                        // odstęp nad dolnym paskiem nawigacji — podnosi karty
    const listY = y + HEADER_H;
    const listH = h - HEADER_H - CARDS_H - BOTTOM_PAD;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listY, w, listH);
    ctx.clip();

    let ry = listY + 6 - this._scrollMid;

    // Offsety kolumn dopasowane do węższej kolumny środkowej
    const C = { name: 0, pop: 118, prosp: 172, cr: 214, fleet: 274, bld: 322 };
    ctx.font = `bold ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('civOverlay.colName'),       x + pad + C.name,  ry + 10);
    ctx.fillText(t('civOverlay.colPop'),         x + pad + C.pop,   ry + 10);
    ctx.fillText(t('civOverlay.colProsperity'),  x + pad + C.prosp, ry + 10);
    ctx.fillText(t('civOverlay.colCredits'),     x + pad + C.cr,    ry + 10);
    ctx.fillText(t('civOverlay.colFleet'),       x + pad + C.fleet, ry + 10);
    ctx.fillText(t('civOverlay.colBuildings'),   x + pad + C.bld,   ry + 10);
    ry += 16;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, ry); ctx.lineTo(x + w - pad, ry); ctx.stroke();
    ry += 4;

    const sorted = [...data.perColony].sort((a, b) => {
      if (a.isOutpost !== b.isOutpost) return a.isOutpost ? 1 : -1;
      return b.pop - a.pop;
    });

    for (const col of sorted) {
      const isActive = col.planetId === window.KOSMOS?.colonyManager?.activePlanetId;
      const rowTop = ry - 2;
      const rowH = col.isOutpost ? ROW_H : ROW_H + 8;

      if (isActive) {
        ctx.fillStyle = 'rgba(0,255,180,0.06)';
        ctx.fillRect(x + 2, rowTop, w - 4, rowH + 2);
      }

      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const nameColor = col.isOutpost ? THEME.textDim : (isActive ? THEME.accent : THEME.textPrimary);
      ctx.fillStyle = nameColor;
      const prefix = col.isOutpost ? '○ ' : '● ';
      ctx.fillText((prefix + col.name).slice(0, 15), x + pad + C.name, ry + 10);

      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(col.isOutpost ? '–' : `${col.pop.toFixed(1)}/${col.maxPop}`, x + pad + C.pop, ry + 10);

      if (!col.isOutpost) {
        ctx.fillStyle = this._prosperityColor(col.prosperity);
        ctx.fillText(`${col.prosperity.toFixed(0)}`, x + pad + C.prosp, ry + 10);
      } else {
        ctx.fillStyle = THEME.textDim;
        ctx.fillText('–', x + pad + C.prosp, ry + 10);
      }

      ctx.fillStyle = THEME.warning;
      ctx.fillText(`${col.credits.toFixed(0)}`, x + pad + C.cr, ry + 10);
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`${col.fleetCount}`, x + pad + C.fleet, ry + 10);
      ctx.fillText(`${col.buildings}`, x + pad + C.bld, ry + 10);

      if (!col.isOutpost) {
        this._drawBar(ctx, x + pad + C.name, ry + 14, 100, 4, col.prosperity / 100,
          this._prosperityColor(col.prosperity), 'rgba(255,255,255,0.08)');
      }

      this._addHit(x + 2, rowTop, w - 4, rowH + 2, 'goto_colony', { planetId: col.planetId });
      ry += rowH + 2;
    }

    ctx.restore();

    this._drawSummaryCards(ctx, x, y + h - CARDS_H - BOTTOM_PAD, w, CARDS_H, pad, data);
  }

  // 4 karty podsumowania w siatce 2×2 (przypięte na dole środkowej kolumny)
  _drawSummaryCards(ctx, x, y, w, h, pad, data) {
    const net = data.netCreditsPerYear;
    const cards = [
      { label: t('civOverlay.cardTotalPop'),      value: data.totalPop.toFixed(1),       color: THEME.accent },
      { label: t('civOverlay.cardAvgProsperity'), value: data.avgProsperity.toFixed(0),  color: this._prosperityColor(data.avgProsperity) },
      { label: t('civOverlay.cardKrIncome'),      value: `${net >= 0 ? '+' : ''}${net.toFixed(0)}`, color: net >= 0 ? THEME.success : THEME.danger },
      { label: t('civOverlay.cardTrade'),         value: `${data.tradeConnections}`,     color: THEME.info },
    ];

    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + pad, y); ctx.lineTo(x + w - pad, y); ctx.stroke();

    const gap = 6;
    const cw = (w - pad * 2 - gap) / 2;
    const ch = (h - 10 - gap) / 2;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const cxi = x + pad + (i % 2) * (cw + gap);
      const cyi = y + 8 + Math.floor(i / 2) * (ch + gap);
      ctx.fillStyle = bgAlpha(0.50);
      ctx.fillRect(cxi, cyi, cw, ch);
      ctx.strokeStyle = THEME.border;
      ctx.strokeRect(cxi + 0.5, cyi + 0.5, cw - 1, ch - 1);

      ctx.font = `bold ${THEME.fontSizeLarge + 4}px ${THEME.fontFamily}`;
      ctx.fillStyle = c.color;
      ctx.textAlign = 'center';
      ctx.fillText(c.value, cxi + cw / 2, cyi + ch / 2 + 3);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(c.label, cxi + cw / 2, cyi + ch - 8);
      ctx.textAlign = 'left';
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRAWA KOLUMNA — Historia (kronika kamieni milowych, scrollowalna)
  // ══════════════════════════════════════════════════════════════════════════

  _drawRightCol(ctx, x, y, w, h, data) {
    const pad = 14;
    this._drawOverlayHeader(ctx, x, y, w, t('civOverlay.history'));

    const listY = y + HEADER_H;
    const listH = h - HEADER_H;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listY, w, listH);
    ctx.clip();

    let hy = listY + 8 - this._scrollHistory;

    if (data.history.length === 0) {
      ctx.font = `italic ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('civOverlay.historyEmpty'), x + pad, hy + 10);
      ctx.restore();
      return;
    }

    const isPL = getLocale() !== 'en';
    for (const hEntry of data.history) {
      const name = isPL ? (hEntry.namePL ?? hEntry.nameEN) : (hEntry.nameEN ?? hEntry.namePL);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`${hEntry.year ?? '?'}`, x + pad, hy + 10);
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`${hEntry.icon ?? '•'} ${name ?? ''}`, x + pad + 40, hy + 10);
      hy += 17;
    }

    ctx.restore();
  }

  // ── Helpery rysowania ────────────────────────────────────────────────────

  _sectionHeader(ctx, sx, sy, label) {
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(label, sx, sy + 11);
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

  // Zawija tekst do szerokości maxW; zwraca tablicę linii.
  _wrapText(ctx, text, maxW) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
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
        break;
      }
    }
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    const W = Math.round(window.innerWidth / (Math.min(window.innerWidth / 1280, window.innerHeight / 720)));
    const H = Math.round(window.innerHeight / (Math.min(window.innerWidth / 1280, window.innerHeight / 720)));
    const { ox, oy, ow, oh, x1, x2 } = this._getColumns(W, H);
    if (x < ox || x > ox + ow || y < oy || y > oy + oh) return false;

    if (x < x1)        this._scrollLeft    = Math.max(0, this._scrollLeft    + delta * 0.5);
    else if (x < x2)   this._scrollMid     = Math.max(0, this._scrollMid     + delta * 0.5);
    else               this._scrollHistory = Math.max(0, this._scrollHistory + delta * 0.5);
    return true;
  }
}
