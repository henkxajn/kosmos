// IntelOverlay — panel Wywiadu (klawisz I)
//
// Pełnoekranowy overlay z listą obcych imperiów w mgle wojny.
// Lewa kolumna — lista imperiów (kolor archetypu lub szary dla nieznanych).
// Prawa kolumna — panel szczegółów zaznaczonego imperium (dane gated po intel.level).

import { BaseOverlay, HEADER_H }   from './BaseOverlay.js';
import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { ARCHETYPES }     from '../data/EmpireData.js';
import { t, getName, getDesc } from '../i18n/i18n.js';
// W1-3c — czysty opis układu sił (pasmo + procent); logika poza widokiem, żeby dała się testować.
import { describePowerBalance } from '../utils/ThreatMath.js';
// ARC KONSOLE K0b — Wywiad na zestawie konsoli (FEATURES.consoleIntel); OFF = dzisiejszy rysunek niżej.
import { GAME_CONFIG } from '../config/GameConfig.js';
import { consoleZones, consoleClockRect, isKitScreen, insetRect, CONSOLE_SCREEN_SPECS } from './ConsoleLayoutLogic.js';
import { drawConsoleHeader, drawZoneFrame, drawZoneRule, drawEyebrow, drawKvRow, drawBar, drawTabular, applyConsoleHalo } from './ConsoleKit.js';
import { consoleRoles } from './ConsoleRolesLogic.js';
import { NAV_GROUPS, CIV_TABS, getNavGroup } from './CivPanelDrawer.js';
import { sortIntelEntries, empireRowView, intelDossier, pairFractions, INTEL_LEVELS, INTEL_LEVEL_LABEL_KEY, INTEL_MASK, intelRank,
  systemMapPoints } from './EmpireListLogic.js';
import { HOME_SYSTEM_ID } from '../utils/SystemExploration.js';
import { drawEmpireList, revealEmpire } from './ConsoleEmpireList.js';
import { truncateText } from './HudLabelLogic.js';
import { drawEmpireMiniMap, drawEmpireMapMarker } from './ConsoleEmpireMap.js';   // K2 — wspólna mini-mapa (Wywiad + Dyplomacja)

const LEFT_W = 280;
const TAB_H  = HEADER_H;   // pasmo nagłówka = standard (było 32)

// Klucze i18n dla poziomów wywiadu (locale-aware; wartości w słownikach)
const LEVEL_LABEL_KEY = {
  unknown:  'intel.levelUnknown',
  rumor:    'intel.levelRumor',
  contact:  'intel.levelContact',
  detailed: 'intel.levelDetailed',
};
const LEVEL_COLOR = {
  unknown:  '#666',
  rumor:    '#AA9050',
  contact:  '#60B090',
  detailed: '#50C0E0',
};
const LEVEL_RANK = { unknown: 0, rumor: 1, contact: 2, detailed: 3 };
const MASK = '???';

// Pasma układu sił → klucze i18n (wspólne dla obu ścieżek).
const BAND_KEY = {
  dominant:   'intel.powerBalanceDominant',
  stronger:   'intel.powerBalanceStronger',
  balanced:   'intel.powerBalanceBalanced',
  weaker:     'intel.powerBalanceWeaker',
  outmatched: 'intel.powerBalanceOutmatched',
};
const kitOn = () => isKitScreen('intel', GAME_CONFIG.FEATURES);

export class IntelOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._selectedId = null;
    this._scrollLeft = 0;
    this.consoleZones = null;      // K0b — strefy konsoli z ostatniego draw() (wejście i gniazdo paska walki czytają je stąd)
    this._consoleListRect = null;
    this._revealPending = false;
  }

  show() {
    super.show();
    // Jeśli nie wybrano — zaznacz pierwsze "znane" (rumor+)
    const intel = window.KOSMOS?.gameState?.get('intel') ?? {};
    const known = Object.entries(intel).find(([, v]) => LEVEL_RANK[v?.level ?? 'unknown'] >= 1);
    if (!this._selectedId && known) this._selectedId = known[0];
    this._revealPending = true;    // K0b — konsola odsłania zaznaczony wiersz przy otwarciu
  }

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];
    if (kitOn()) {
      // K0b (A) — poświata za całym rysunkiem konsoli; zdjęta przez restore (pasek walki i reszta UI bez niej)
      ctx.save();
      applyConsoleHalo(ctx);
      try { this._drawConsole(ctx, W, H); } finally { ctx.restore(); }
      return;
    }
    this.consoleZones = null;

    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);

    // Tło
    ctx.fillStyle = bgAlpha(0.40);
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, ow, oh);

    // Separator
    ctx.beginPath();
    ctx.moveTo(ox + LEFT_W, oy);
    ctx.lineTo(ox + LEFT_W, oy + oh);
    ctx.stroke();

    // Zamknij
    const closeX = ox + ow - 24;
    const closeY = oy + 4;
    ctx.font = `bold 14px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('✕', closeX, closeY + 14);
    this._addHit(closeX - 4, closeY, 22, 22, 'close');

    this._drawLeft(ctx, ox, oy, LEFT_W, oh);
    this._drawRight(ctx, ox + LEFT_W, oy, ow - LEFT_W, oh);
  }

  // ── Lewa kolumna: lista imperiów ────────────────────────────

  _drawLeft(ctx, x, y, w, h) {
    const pad = 12;

    this._drawOverlayHeader(ctx, x, y, w, `◐ ${t('intel.title')}`);

    const intel    = window.KOSMOS?.gameState?.get('intel') ?? {};
    const registry = window.KOSMOS?.empireRegistry;
    const entries  = Object.entries(intel);

    const listY = y + TAB_H;
    const listH = h - TAB_H;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listY, w, listH);
    ctx.clip();

    let ry = listY + 6 - this._scrollLeft;

    if (entries.length === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(t('intel.noData'), x + w / 2, listY + 40);
      ctx.fillText(t('intel.sendShipsOrBuild'), x + w / 2, listY + 58);
      ctx.fillText(t('intel.observatoryHint'), x + w / 2, listY + 74);
      ctx.textAlign = 'left';
      ctx.restore();
      return;
    }

    // Sort: detailed → contact → rumor → unknown, wewnątrz po ID
    const sorted = [...entries].sort((a, b) => {
      const ra = LEVEL_RANK[a[1]?.level ?? 'unknown'];
      const rb = LEVEL_RANK[b[1]?.level ?? 'unknown'];
      if (rb !== ra) return rb - ra;
      return a[0].localeCompare(b[0]);
    });

    for (const [empireId, rec] of sorted) {
      const level = rec?.level ?? 'unknown';
      const levelRank = LEVEL_RANK[level];
      const emp = registry?.get(empireId);
      const arch = emp ? ARCHETYPES[emp.archetype] : null;
      const isSel = this._selectedId === empireId;

      const rowH = 38;
      if (ry + rowH < listY) { ry += rowH; continue; } // cull scroll
      if (ry > listY + listH) break;

      // Tło rzędu (selekcja)
      if (isSel) {
        ctx.fillStyle = 'rgba(255,200,60,0.08)';
        ctx.fillRect(x + 4, ry, w - 8, rowH - 2);
        ctx.strokeStyle = THEME.accent;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 4.5, ry + 0.5, w - 9, rowH - 3);
      }

      // Kropka koloru archetypu (lub szara dla unknown/rumor)
      const dotColor = levelRank >= LEVEL_RANK.contact && arch ? arch.color : LEVEL_COLOR[level];
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(x + pad + 4, ry + 14, 5, 0, Math.PI * 2);
      ctx.fill();

      // Nazwa imperium (mgła)
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const name = levelRank >= LEVEL_RANK.contact ? (emp?.name ?? MASK) : MASK;
      ctx.fillStyle = levelRank >= LEVEL_RANK.contact ? THEME.textPrimary : THEME.textDim;
      ctx.fillText(name, x + pad + 14, ry + 16);

      // Poziom intel (label)
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = LEVEL_COLOR[level];
      ctx.fillText(t(LEVEL_LABEL_KEY[level]), x + pad + 14, ry + 30);

      // Archetyp (po prawej — tylko przy contact+)
      if (levelRank >= LEVEL_RANK.contact && arch) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textSecondary;
        ctx.textAlign = 'right';
        ctx.fillText(getName(arch), x + w - pad, ry + 30);
        ctx.textAlign = 'left';
      }

      this._addHit(x + 4, ry, w - 8, rowH - 2, 'select_empire', { empireId });
      ry += rowH;
    }

    ctx.restore();
  }

  // ── Prawa kolumna: szczegóły imperium ───────────────────────

  _drawRight(ctx, x, y, w, h) {
    const pad = 18;

    ctx.fillStyle = bgAlpha(0.45);
    ctx.fillRect(x, y, w, TAB_H);

    const intel    = window.KOSMOS?.gameState?.get(`intel.${this._selectedId}`);
    const registry = window.KOSMOS?.empireRegistry;
    const emp      = registry?.get(this._selectedId);

    if (!this._selectedId || !intel || !emp) {
      ctx.font = `${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(t('intel.selectEmpire'), x + w / 2, y + h / 2);
      ctx.textAlign = 'left';
      return;
    }

    const level = intel.level ?? 'unknown';
    const rank  = LEVEL_RANK[level];
    const arch  = ARCHETYPES[emp.archetype];

    // Nagłówek
    ctx.font = `bold ${THEME.fontSizeMedium + 2}px ${THEME.fontFamily}`;
    ctx.fillStyle = rank >= LEVEL_RANK.contact ? (arch?.color ?? THEME.textPrimary) : THEME.textDim;
    const headerName = rank >= LEVEL_RANK.contact ? emp.name : MASK;
    ctx.fillText(`⚑ ${headerName}`, x + pad, y + 22);

    // Poziom intel (badge)
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = LEVEL_COLOR[level];
    ctx.textAlign = 'right';
    ctx.fillText(`[${t(LEVEL_LABEL_KEY[level])}]`, x + w - pad, y + 22);
    ctx.textAlign = 'left';

    let iy = y + TAB_H + 20;

    // Blok 1: archetyp / opis (contact+)
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    if (rank >= LEVEL_RANK.contact && arch) {
      ctx.fillStyle = arch.color;
      ctx.fillText(`${t('intel.archetype')}: ${getName(arch)}`, x + pad, iy);
      iy += 18;
      ctx.fillStyle = THEME.textDim;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      this._wrapText(ctx, getDesc(arch), x + pad, iy, w - pad * 2, 14);
      iy += 18 + 14;
    } else {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`${t('intel.archetype')}: ${MASK}`, x + pad, iy);
      iy += 18;
    }

    // Separator
    iy += 6;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, iy); ctx.lineTo(x + w - pad, iy); ctx.stroke();
    iy += 14;

    // Blok 2: znane kolonie (systemy)
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('intel.knownSystems'), x + pad, iy);
    iy += 16;

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const known = intel.knownColonies ?? [];
    if (known.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('intel.none'), x + pad + 8, iy);
      iy += 16;
    } else {
      const galaxy = window.KOSMOS?.galaxyData;
      for (const sysId of known) {
        const gs = galaxy?.systems?.find(s => s.id === sysId);
        const name = gs?.name ?? sysId;
        const isHome = emp.homeSystemId === sysId;
        ctx.fillStyle = isHome ? THEME.accent : THEME.textSecondary;
        ctx.fillText(`  • ${name}${isHome ? ` (${t('intel.capital')})` : ''}`, x + pad + 4, iy);
        iy += 14;
      }
    }

    // Separator
    iy += 6;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, iy); ctx.lineTo(x + w - pad, iy); ctx.stroke();
    iy += 14;

    // Blok 3: siła wojskowa (detailed+)
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('intel.militaryStrength'), x + pad, iy);
    iy += 16;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    if (rank >= LEVEL_RANK.detailed && intel.knownMilitary != null) {
      const bars = Math.min(10, Math.floor(intel.knownMilitary / 50));
      ctx.fillStyle = THEME.warning;
      ctx.fillText(`  ≈ ${t('intel.combatUnits', intel.knownMilitary)}`, x + pad + 4, iy);
      iy += 14;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`  ${'█'.repeat(bars)}${'░'.repeat(10 - bars)}`, x + pad + 4, iy);
      iy += 14;

      // W2-7 — POTENCJAŁ obok SIŁY. Linia wyżej mówi, ile imperium ma OBSADZONYCH okrętów;
      // ta mówi, ile trzyma w magazynie i ilu ludzi ma jeszcze do oddania. Bez niej gracz
      // czytałby spadek `knownMilitary` po W2-2 jako rozbrojenie przeciwnika, a nie jako
      // flotę czekającą na rozkaz — czyli dokładnie odwrotnie niż jest.
      if (intel.knownReserve != null && intel.knownReserve > 0) {
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(`  ${t('intel.reserveHulls', intel.knownReserve)}`, x + pad + 4, iy);
        iy += 14;
      }
      // AI STRIKES BACK S1 (SB19, Finding 398) — FLOTA / LIMIT zamiast „wolnej załogi” (freePops stolicy, który od S0-2
      //   nie bramkuje mobilizacji AI): ile uzbrojonych kadłubów imperium ma (każdy stan służby) i jaki ma limit floty.
      if (intel.knownArmedHulls != null && intel.knownFleetLimit != null) {
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(`  ${t('intel.fleetVsLimit', intel.knownArmedHulls, intel.knownFleetLimit)}`, x + pad + 4, iy);
        iy += 14;
      }

      // W1-3c — CIĄGŁY odczyt układu sił. Odpowiada na pytanie, które gracz zadaje PRZED
      // decyzją dyplomatyczną („czy w ogóle mam z czym prosić"), a nie po odmowie. Kanał
      // rozbicia akceptacji (E4) jest z natury REAKTYWNY i pokazuje się wyłącznie przy
      // odmowie — przy zgodzie gracz nie dowiaduje się niczego. Ta linia to naprawia,
      // BEZ dotykania modala: ta sama bramka intelu (`detailed`), te same dane.
      const mine = window.KOSMOS?.threatAssessment?.getPlayerStrength?.() ?? 0;
      const bal  = describePowerBalance(mine, intel.knownMilitary);
      // Kolor niesie OCENĘ, nie samą liczbę: zielony gdy przewaga po naszej stronie.
      ctx.fillStyle = bal.leader === 'mine' ? THEME.success
                    : bal.band === 'balanced' ? THEME.textDim
                    : THEME.danger;
      ctx.fillText(`  ${t('intel.powerBalance')}: ${t(BAND_KEY[bal.band], bal.pct)}`, x + pad + 4, iy);
      iy += 14;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`  ${t('intel.powerBalanceYours', Math.round(mine))}`, x + pad + 4, iy);
      iy += 14;
    } else {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`  ${MASK}`, x + pad + 4, iy);
      iy += 14;
      ctx.fillStyle = THEME.textDim;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillText(`  ${t('intel.needsGroundScan')}`, x + pad + 4, iy);
      iy += 14;
    }

    // Separator
    iy += 6;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, iy); ctx.lineTo(x + w - pad, iy); ctx.stroke();
    iy += 14;

    // Blok 4: ostatnie incydenty (contact+)
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('intel.recentIncidents'), x + pad, iy);
    iy += 16;

    const inc = intel.lastIncidents ?? [];
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    if (rank < LEVEL_RANK.contact) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`  ${MASK}`, x + pad + 4, iy);
    } else if (inc.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`  ${t('intel.none')}`, x + pad + 4, iy);
    } else {
      const shown = inc.slice(-5).reverse();
      for (const ev of shown) {
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(`  [${(ev.year ?? 0).toFixed(0)}] ${ev.type}`, x + pad + 4, iy);
        iy += 14;
      }
    }
  }

  // ══ ARC KONSOLE K0b — Wywiad na zestawie konsoli (FEATURES.consoleIntel) ═══════════════════════════════════════════════
  // Szablon 4-strefowy (D-K-1): nagłówek (tytuł + czipy grupy + [ x ]) · lista imperiów (wspólna z Dyplomacją od K2) ·
  // bohater = dossier + układ sił (ty kontra oni) · inspektor = znane systemy, wojsko, incydenty. Bez wypełnionych paneli —
  // tekst na żywej, przyciemnionej scenie (D-K-5 poprawione); nawiasy narożne tylko na bohaterze i zaznaczonym wierszu.
  // MGŁA WOJNY: wszystko, co obce, idzie przez `EmpireListLogic.intelDossier` / `empireRowView` (te same bramki co dziś);
  // wartości własne gracza (siła, liczba układów) to nie wywiad. Geometria — wyłącznie `consoleZones` (bez window.inner*).

  _drawConsole(ctx, W, H) {
    const roles = consoleRoles(THEME);   // K0b (C) — rola dim podniesiona tylko na konsoli
    const K = window.KOSMOS;
    const spec = { ...(CONSOLE_SCREEN_SPECS.intel ?? {}), stripH: 0, clock: consoleClockRect(W, H, NAV_GROUPS.length) };
    const z = consoleZones(this._getOverlayBounds(W, H), spec);
    this.consoleZones = z;
    const hz = this._hoverZone;
    const hoverHdr = hz?.type === 'tab' ? hz.data?.id : hz?.type === 'close' ? 'close' : null;
    const hoverRow = hz?.type === 'select_empire' ? hz.data?.empireId : null;

    // (1) Nagłówek: tytuł + czipy podzakładek grupy (klik = przełącz overlay jak w pasie subnav) + [ x ]
    const grp = getNavGroup('intel');
    const chips = (grp?.members ?? ['intel']).map((id) => {
      const tab = CIV_TABS.find((tb) => tb.id === id);
      return { id, label: tab ? t(tab.labelKey) : id, active: id === 'intel' };
    });
    for (const h of drawConsoleHeader(ctx, z, roles, { title: t('intel.title'), chips, hoverId: hoverHdr })) {
      if (h.type === 'close') this._addHit(h.x, h.y, h.w, h.h, 'close');
      else this._addHit(h.x, h.y, h.w, h.h, 'tab', { id: h.id });
    }

    // (2) Lista imperiów
    const intel = K?.gameState?.get('intel') ?? {};
    const registry = K?.empireRegistry;
    const lz = z.list;
    const lh = drawZoneRule(ctx, lz, t('intel.console.empires'), roles);
    const listRect = { x: lz.x, y: lz.y + lh + 4, w: lz.w, h: Math.max(0, lz.h - lh - 4) };
    this._consoleListRect = listRect;
    const entries = sortIntelEntries(intel);
    if (entries.length === 0) {
      ctx.save();
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = roles.dim; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      const cx = listRect.x + listRect.w / 2;
      ctx.fillText(t('intel.noData'), cx, listRect.y + 34);
      ctx.fillText(t('intel.sendShipsOrBuild'), cx, listRect.y + 52);
      ctx.fillText(t('intel.observatoryHint'), cx, listRect.y + 68);
      ctx.restore();
    } else {
      const views = entries.map(([id, rec]) => {
        const emp = registry?.get(id);
        return empireRowView({ empireId: id, level: rec?.level ?? 'unknown', emp,
          arch: emp ? ARCHETYPES[emp.archetype] : null, archName: getName });
      });
      if (this._revealPending) {
        this._scrollLeft = revealEmpire(views, this._selectedId, this._scrollLeft, listRect.h);
        this._revealPending = false;
      }
      const res = drawEmpireList(ctx, listRect, views, roles, { selectedId: this._selectedId, hoverId: hoverRow,
        scroll: this._scrollLeft, levelLabel: (v) => t(v.levelKey) });
      this._scrollLeft = res.scroll;
      for (const r of res.zones) this._addHit(r.x, r.y, r.w, r.h, 'select_empire', { empireId: r.id });
    }

    // (3) Bohater + (4) inspektor
    drawZoneFrame(ctx, z.hero, roles);
    const rec = this._selectedId ? intel[this._selectedId] : null;
    const emp = this._selectedId ? registry?.get(this._selectedId) : null;
    if (!rec || !emp) {
      drawZoneRule(ctx, z.inspector, '', roles);
      ctx.save();
      ctx.font = `${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
      ctx.fillStyle = roles.dim; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t('intel.selectEmpire'), z.hero.x + z.hero.w / 2, z.hero.y + z.hero.h / 2);
      ctx.restore();
      return;
    }
    const playerCols = K?.colonyManager?.getPlayerColonies?.() ?? [];
    const mineIds = new Set(playerCols.map((c) => c.systemId ?? 'sys_home'));
    const galaxySys = (id) => K?.galaxyData?.systems?.find((s) => s.id === id) ?? null;
    const d = intelDossier({
      rec, emp, arch: ARCHETYPES[emp.archetype] ?? null, archName: getName, archDesc: getDesc,
      systemName: (id) => galaxySys(id)?.name ?? id,
      mine: { strength: K?.threatAssessment?.getPlayerStrength?.() ?? 0, systems: mineIds.size },
    });
    // Mini-mapa (dolna część bohatera): wyłącznie znane układy z dossier + układy gracza (`systemMapPoints`)
    const homeId = K?.galaxyData?.systems?.find((s) => s?.isHome === true)?.id ?? HOME_SYSTEM_ID;
    const mapPts = systemMapPoints({ known: d.systems, mineIds, posOf: galaxySys, homeId });
    this._drawConsoleHero(ctx, insetRect(z.hero, 18), d, roles, mapPts);
    this._drawConsoleInspector(ctx, z.inspector, d, roles);
  }

  // Bohater: dossier (nazwa, archetyp, poziom wywiadu) + układ sił — pary „ty | oni” z dużymi liczbami i paskiem od środka.
  _drawConsoleHero(ctx, r, d, roles, mapPts = []) {
    const F = (sz, b = false) => `${b ? 'bold ' : ''}${sz}px ${THEME.fontFamily}`;
    const big = THEME.fontSizeInstrument ?? 2 * THEME.fontSizeLarge;
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x - 8, r.y - 8, r.w + 16, r.h + 16); ctx.clip();
    ctx.textBaseline = 'alphabetic';
    let y = r.y;
    y += drawEyebrow(ctx, r.x, y, r.w, t('intel.console.dossier'), roles) + 6;
    // nazwa imperium (mgła: „???” w roli dim); kropka barwy archetypu od kontaktu
    let nx = r.x;
    if (d.archColor) {
      ctx.fillStyle = d.archColor;
      ctx.beginPath(); ctx.arc(r.x + 6, y + big * 0.62, 6, 0, Math.PI * 2); ctx.fill();
      nx += 22;
    }
    ctx.font = F(big, true);
    ctx.fillStyle = d.contact ? roles.primary : roles.dim;
    ctx.fillText(truncateText(d.name, r.x + r.w - nx, (s) => ctx.measureText(s).width), nx, y + big);
    y += big + 14;
    // archetyp + opis (od kontaktu)
    ctx.font = F(THEME.fontSizeNormal);
    ctx.fillStyle = d.archName ? roles.primary : roles.dim;
    ctx.fillText(`${t('intel.archetype').toUpperCase()}   ${d.archName ?? INTEL_MASK}`, r.x, y + THEME.fontSizeNormal);
    y += THEME.fontSizeNormal + 8;
    if (d.archDesc) {
      ctx.font = F(THEME.fontSizeSmall);
      ctx.fillStyle = roles.dim;
      y = this._wrapText(ctx, d.archDesc, r.x, y + THEME.fontSizeSmall, r.w, 14) - THEME.fontSizeSmall + 4;
    }
    // poziom wywiadu — cztery stopnie (osiągnięte: pełny pasek primary; bieżący pogrubiony)
    y += 14;
    y += drawEyebrow(ctx, r.x, y, r.w, t('intel.console.level'), roles) + 4;
    const gap = 8, segW = Math.floor((r.w - 3 * gap) / 4);
    INTEL_LEVELS.forEach((lv, i) => {
      const sx = r.x + i * (segW + gap);
      drawBar(ctx, sx, y, segW, intelRank(lv) <= d.rank ? 1 : 0, roles, { tone: 'primary' });
      ctx.font = F(THEME.fontSizeSmall, lv === d.level);
      ctx.fillStyle = lv === d.level ? roles.primary : roles.dim;
      ctx.fillText(t(INTEL_LEVEL_LABEL_KEY[lv]), sx, y + 16);
    });
    y += 34;
    // układ sił
    y += drawEyebrow(ctx, r.x, y, r.w, t('intel.console.balance'), roles) + 4;
    ctx.font = F(THEME.fontSizeSmall);
    ctx.fillStyle = roles.dim;
    ctx.textAlign = 'left';  ctx.fillText(t('intel.console.you').toUpperCase(), r.x, y + 10);
    ctx.textAlign = 'right'; ctx.fillText(t('intel.console.them').toUpperCase(), r.x + r.w, y + 10);
    ctx.textAlign = 'left';
    y += 14;
    y = this._drawConsolePair(ctx, r, y, t('intel.console.strength'), Math.round(d.mine.strength), d.military ? d.military.units : null, roles);
    y = this._drawConsolePair(ctx, r, y, t('intel.console.systems'), d.mine.systems, d.systems.length, roles);
    // werdykt (tylko `detailed`, jak dziś); niżej — „wymaga skanu naziemnego”
    ctx.font = F(THEME.fontSizeNormal);
    if (d.military) {
      const bal = describePowerBalance(d.mine.strength, d.military.units);
      ctx.fillStyle = bal.leader === 'mine' ? roles.primary : bal.band === 'balanced' ? roles.dim : roles.alert;
      ctx.fillText(`${t('intel.powerBalance')}: ${t(BAND_KEY[bal.band], bal.pct)}`, r.x, y + 12);
    } else {
      ctx.fillStyle = roles.dim;
      ctx.fillText(t('intel.needsGroundScan'), r.x, y + 12);
    }
    y += 34;
    // mini-mapa znanych układów (decyzja właściciela b) — reszta wysokości bohatera
    const mapRect = { x: r.x, y, w: r.w, h: r.y + r.h - y };
    if (mapRect.h >= 120) this._drawConsoleMap(ctx, mapRect, mapPts, roles);
    ctx.restore();
  }

  // Mini-mapa — od K2 we wspólnym module `ConsoleEmpireMap` (Dyplomacja rysuje tę samą); znacznik idzie przez metodę
  // instancji, więc podgląd keeperów (`_drawMapMarker`) działa jak dotąd.
  _drawConsoleMap(ctx, r, pts, roles) {
    drawEmpireMiniMap(ctx, r, pts, roles, { drawMarker: (c, m, ro) => this._drawMapMarker(c, m, ro) });
  }

  _drawMapMarker(ctx, m, roles) {
    drawEmpireMapMarker(ctx, m, roles);
  }

  // Para „ty | oni”: etykieta na środku, duże liczby po bokach (oni zamaskowani → „???”), pasek od środka (ty w lewo, oni w prawo).
  _drawConsolePair(ctx, r, y, label, mine, theirs, roles) {
    const big = THEME.fontSizeInstrument ?? 2 * THEME.fontSizeLarge;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = roles.dim;
    ctx.textAlign = 'center';
    ctx.fillText(String(label).toUpperCase(), r.x + r.w / 2, y + big * 0.6);
    ctx.textAlign = 'left';
    ctx.font = `${big}px ${THEME.fontFamily}`;
    ctx.fillStyle = roles.primary;
    drawTabular(ctx, String(mine), r.x, y + big, 'left');
    ctx.fillStyle = theirs == null ? roles.dim : roles.foreign;
    drawTabular(ctx, theirs == null ? INTEL_MASK : String(theirs), r.x + r.w, y + big, 'right');
    const by = y + big + 8, cx = r.x + r.w / 2, half = Math.floor(r.w / 2) - 4;
    const f = pairFractions(mine, theirs);
    drawBar(ctx, r.x, by, half, 0, roles);
    drawBar(ctx, cx + 4, by, half, 0, roles);
    ctx.fillStyle = roles.primary;
    const mw = Math.round(half * f.mineFrac);
    ctx.fillRect(cx - 4 - mw, by, mw, 2);
    if (f.theirsFrac != null) { ctx.fillStyle = roles.foreign; ctx.fillRect(cx + 4, by, Math.round(half * f.theirsFrac), 2); }
    return by + 2 + 16;
  }

  // Inspektor: znane systemy (każdy poziom — jak dziś), wojsko (`detailed`), incydenty (od kontaktu).
  _drawConsoleInspector(ctx, z, d, roles) {
    const x = z.x, w = z.w;
    const dimLine = (text, yy) => {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = roles.dim; ctx.textBaseline = 'middle';
      ctx.fillText(text, x, yy + 8);
      return 16;
    };
    ctx.save();
    ctx.beginPath(); ctx.rect(z.x, z.y, z.w, z.h); ctx.clip();
    let y = z.y + drawZoneRule(ctx, z, t('intel.console.file'), roles) + 6;
    // znane systemy
    y += drawEyebrow(ctx, x, y, w, t('intel.knownSystems'), roles) + 2;
    if (!d.systems.length) y += dimLine(t('intel.none'), y);
    else for (const s of d.systems) y += drawKvRow(ctx, x, y, w, s.name, s.capital ? t('intel.capital').toUpperCase() : '', roles);
    y += 12;
    // wojsko
    y += drawEyebrow(ctx, x, y, w, t('intel.militaryStrength'), roles) + 2;
    // (siła bojowa jest w bohaterze — tu tylko szczegóły floty, których bohater nie pokazuje)
    if (d.military) {
      y += drawKvRow(ctx, x, y, w, t('intel.console.armedLimit'),
        d.military.armed != null ? `${d.military.armed} / ${d.military.limit}` : INTEL_MASK, roles, { tone: d.military.armed != null ? 'foreign' : 'dim' });
      if (d.military.reserve != null) y += drawKvRow(ctx, x, y, w, t('intel.console.reserve'), `+${d.military.reserve}`, roles, { tone: 'foreign' });
    } else {
      y += drawKvRow(ctx, x, y, w, t('intel.console.armedLimit'), INTEL_MASK, roles, { tone: 'dim' });
    }
    y += 12;
    // ostatnie incydenty
    y += drawEyebrow(ctx, x, y, w, t('intel.recentIncidents'), roles) + 2;
    if (d.incidents == null) y += dimLine(INTEL_MASK, y);
    else if (!d.incidents.length) y += dimLine(t('intel.none'), y);
    else for (const ev of d.incidents) y += drawKvRow(ctx, x, y, w, String(ev.type ?? ''), ev.year.toFixed(0), roles);
    ctx.restore();
  }

  // ── Helper: word wrap ───────────────────────────────────────

  _wrapText(ctx, text, x, y, maxW, lineH) {
    if (!text) return y;
    const words = String(text).split(/\s+/);
    let line = '';
    let cy = y;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, cy);
        cy += lineH;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) { ctx.fillText(line, x, cy); cy += lineH; }
    return cy;
  }

  // ── Obsługa kliknięć ────────────────────────────────────────

  _onHit(zone) {
    switch (zone.type) {
      case 'close':
        this.hide();
        break;
      case 'select_empire':
        this._selectedId = zone.data.empireId;
        break;
      case 'tab':   // K0b — czip podzakładki w nagłówku konsoli (jak klik w pas subnav: przełącz overlay grupy)
        if (zone.data.id && zone.data.id !== 'intel') window.KOSMOS?.overlayManager?.openPanel?.(zone.data.id);
        break;
    }
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    if (kitOn()) {
      // K0b — geometria wyłącznie ze stref ostatniej klatki (bez window.inner*); klamra przewijania w drawList.
      const f = this.consoleZones?.frame, r = this._consoleListRect;
      if (!f || x < f.x || x > f.x + f.w || y < f.y || y > f.y + f.h) return false;
      if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) this._scrollLeft = Math.max(0, this._scrollLeft + delta * 0.5);
      return true;
    }
    const { ox, oy, ow, oh } = this._getOverlayBounds(
      Math.round(window.innerWidth / (Math.min(window.innerWidth / 1280, window.innerHeight / 720))),
      Math.round(window.innerHeight / (Math.min(window.innerWidth / 1280, window.innerHeight / 720)))
    );
    if (x < ox || x > ox + ow || y < oy || y > oy + oh) return false;
    if (x < ox + LEFT_W) {
      this._scrollLeft = Math.max(0, this._scrollLeft + delta * 0.5);
    }
    return true;
  }
}
