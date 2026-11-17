// IntelOverlay — panel Wywiadu (klawisz I)
//
// ARC KONSOLE K0b / KZ — ekran konsoli (szablon 4-strefowy, `_drawConsole` niżej): lista obcych imperiów w mgle wojny
// (wspólna z Dyplomacją), bohater = dossier + układ sił, inspektor = znane systemy, wojsko, incydenty. Dawny układ
// 2-kolumnowy usunięty w KZ (ścieżka konsoli jedyna).

import { BaseOverlay }   from './BaseOverlay.js';
import { THEME } from '../config/ThemeConfig.js';
import { ARCHETYPES }     from '../data/EmpireData.js';
import { t, getName, getDesc } from '../i18n/i18n.js';
// W1-3c — czysty opis układu sił (pasmo + procent); logika poza widokiem, żeby dała się testować.
import { describePowerBalance } from '../utils/ThreatMath.js';
import { consoleZones, consoleClockRect, insetRect, CONSOLE_SCREEN_SPECS } from './ConsoleLayoutLogic.js';
import { drawConsoleHeader, drawZoneFrame, drawZoneRule, drawEyebrow, drawKvRow, drawBar, drawTabular, applyConsoleHalo } from './ConsoleKit.js';
import { consoleRoles } from './ConsoleRolesLogic.js';
import { NAV_GROUPS, CIV_TABS, getNavGroup } from './CivPanelDrawer.js';
import { sortIntelEntries, empireRowView, intelDossier, pairFractions, INTEL_LEVELS, INTEL_LEVEL_LABEL_KEY, INTEL_MASK, intelRank,
  systemMapPoints } from './EmpireListLogic.js';
import { HOME_SYSTEM_ID } from '../utils/SystemExploration.js';
import { drawEmpireList, revealEmpire } from './ConsoleEmpireList.js';
import { truncateText } from './HudLabelLogic.js';
import { drawEmpireMiniMap, drawEmpireMapMarker } from './ConsoleEmpireMap.js';   // K2 — wspólna mini-mapa (Wywiad + Dyplomacja)

const LEVEL_RANK = { unknown: 0, rumor: 1, contact: 2, detailed: 3 };

// Pasma układu sił → klucze i18n.
const BAND_KEY = {
  dominant:   'intel.powerBalanceDominant',
  stronger:   'intel.powerBalanceStronger',
  balanced:   'intel.powerBalanceBalanced',
  weaker:     'intel.powerBalanceWeaker',
  outmatched: 'intel.powerBalanceOutmatched',
};

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
    // K0b (A) — poświata za całym rysunkiem konsoli; zdjęta przez restore (pasek walki i reszta UI bez niej)
    ctx.save();
    applyConsoleHalo(ctx);
    try { this._drawConsole(ctx, W, H); } finally { ctx.restore(); }
  }

  // ══ ARC KONSOLE K0b — Wywiad na zestawie konsoli (na stałe od KZ) ═══════════════════════════════════════════════════════
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

  // K0b — kółko na konsoli: geometria wyłącznie ze stref ostatniej klatki (bez window.inner*); klamra przewijania w drawList.
  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    const f = this.consoleZones?.frame, r = this._consoleListRect;
    if (!f || x < f.x || x > f.x + f.w || y < f.y || y > f.y + f.h) return false;
    if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) this._scrollLeft = Math.max(0, this._scrollLeft + delta * 0.5);
    return true;
  }
}
