// CombatHUD — live progress active deep-space encounter (M4 P3 polish).
//
// Auto-show gdy DSCS._activeEncounters.size > 0 → renderuje compact panel
// per encounter: sideA HP bar, sideB HP bar, round X / MAX, dystans, log walki,
// vessel details (hull + bronie). Auto-hide gdy brak active encounters.
//
// Pozycja: top-center (pod TopBar + bufor na pasek zasobów). Per-encounter:
// ~140 px (z log + vessels), max 2 encountery jednoczesnie (kolejne ucinane).
//
// Read-only — patrzy na window.KOSMOS.deepSpaceCombatSystem.listActive().
//
// POLISH P2b (D4, Finding 468, CP22, CP23) — karta mieści swój tekst: przycinanie po SZEROKOŚCI tekstu (`measureText`),
// nie po liczbie znaków (dawniej etykieta „Liga Trzech Słońc (2)” → „Liga Trzech Słońc (…” przy 20 znakach), pełny tekst
// w podpowiedzi po najechaniu; log walki — N ostatnich linii, N maleje (do 2), gdy karta nie mieści się między górnym
// paskiem a dolnymi paskami (dawniej dół karty z logiem wchodził pod pasek nawigacji) ani nie zajmuje więcej niż
// `CARD_MAX_H_FRAC` wysokości ekranu (kadr „Obserwuj” i auto-fokus trzymają statki NAD kartą); „Watch” przy KAŻDYM wierszu
// starcia (CP22, Finding 465 — dawniej jeden przycisk zawsze do pierwszego starcia); nazwa układu starcia w wierszu (CP23).

import { BaseOverlay }    from './BaseOverlay.js';
import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { COSMIC }         from '../config/LayoutConfig.js';
import { HULLS }          from '../data/HullsData.js';
import { SHIP_MODULES }   from '../data/ShipModulesData.js';
import EventBus           from '../core/EventBus.js';
import EntityManager      from '../core/EntityManager.js';
import { t, getName }     from '../i18n/i18n.js';
import { systemDisplayName } from './MapLabelLogic.js';

const PANEL_W       = 560;
const HEADER_H      = 24;
const PADDING       = 8;
const HP_BAR_H      = 8;
const LOG_LINES_MAX = 6;
const LOG_LINES_MIN = 2;    // POLISH P2b (D4) — najmniej linii logu, gdy karta nie mieści się nad dolnymi paskami
const LOG_LINE_H    = 12;
const ROW_TITLE_H   = 16;   // POLISH P2b (D4) — wiersz tytułu starcia: układ (CP23) · runda · „Watch” (CP22)
const WATCH_BTN_W   = 84;
const TOOLTIP_MAX_W = 460;
const MAX_VISIBLE_ENCOUNTERS = 2;
// POLISH P2b (D4) — karta najwyżej 45 % wysokości ekranu (jednostki logiczne UI): przy dwóch starciach pełny log dawał
// ~60 % (sonda P2b, scena 2 na 2 + 1 na 1: 438 z 720 j.) — statki obu walk lądowały pod kartą, a pas nad nią (prostokąt
// bezpieczny kadru) miał ~130 px. Ponad limit — mniej linii logu (do 2), potem statki w jednej linii (`_fitLayout`).
const CARD_MAX_H_FRAC = 0.45;

export class CombatHUD extends BaseOverlay {
  constructor() {
    super(null);
    this.visible = true;
    // P3 polish — minimize. Gdy true, główny panel jest schowany; BottomBar
    // pokazuje chip "⚔ Walki [N]" (klik chipa → toggleMinimize). Stan
    // ephemeral (per-sesja), bez save persist — combat zwykle krótki.
    this._minimized = false;
    /** @type {{x:number,y:number,w:number,h:number}|null} */
    this._minimizeBtnBounds = null;
    /** POLISH P2b (D4, CP22) — przyciski „Obserwuj bitwę” przy wierszach: [{x,y,w,h,point,encounterId,systemId}] */
    this._watchBtns = [];
    /** @type {{x:number,y:number,w:number,h:number,point:{x:number,y:number}|null,encounterId:string|null,systemId:string|null}|null} — przycisk „Obserwuj bitwę" PIERWSZEGO wiersza (zgodność wstecz) */
    this._watchBtnBounds = null;
    /** @type {{x:number,y:number,w:number,h:number}|null} — prostokąt panelu (jednostki LOGICZNE UI) z ostatniego rysowania */
    this._panelRect = null;
    /** POLISH P2b (D4, Finding 468) — strefy przyciętego tekstu: [{x,y,w,h,full}] (pełny tekst w podpowiedzi) */
    this._hoverZones = [];
    this._hover = null;          // pełny tekst pod kursorem albo null
    this._mouse = { x: 0, y: 0 };
  }

  /**
   * POLISH P2a (CP13) — prostokąt panelu walki z ostatniego rysowania (jednostki LOGICZNE UI; px ekranu = × `uiScale`)
   * albo `null`, gdy panel się nie rysuje (brak starć / zminimalizowany). Kadr „Obserwuj” (`ThreeRenderer`) trzyma
   * statki NAD panelem.
   */
  getPanelRect() {
    return this._panelRect ? { ...this._panelRect } : null;
  }

  toggle() { /* no-op */ }
  show()   { /* no-op */ }
  hide()   { /* no-op */ }

  toggleMinimize() {
    this._minimized = !this._minimized;
  }

  isMinimized() {
    return this._minimized;
  }

  /** Czy HUD ma cokolwiek do pokazania (DSCS ma active encounters). */
  hasActiveEncounters() {
    const dscs = window.KOSMOS?.deepSpaceCombatSystem;
    return !!(dscs?.listActive?.()?.length);
  }

  draw(ctx, W, H) {
    const dscs = window.KOSMOS?.deepSpaceCombatSystem;
    if (!dscs?.listActive) return;
    const encounters = dscs.listActive();
    if (encounters.length === 0) {
      this._minimizeBtnBounds = null;
      this._watchBtns = [];
      this._watchBtnBounds = null;
      this._panelRect = null;
      this._hoverZones = [];
      this._hover = null;
      // Auto-reset minimize gdy nie ma już active encounters (następna bitwa
      // startuje w expanded mode — bez tego user widziałby chip dla nic).
      if (this._minimized) this._minimized = false;
      return;
    }
    if (this._minimized) {
      // Chip rysuje BottomBar; tu nic.
      this._minimizeBtnBounds = null;
      this._watchBtns = [];
      this._watchBtnBounds = null;
      this._panelRect = null;
      this._hoverZones = [];
      this._hover = null;
      return;
    }

    this._hitZones = [];
    this._hoverZones = [];
    this._watchBtns = [];

    const visible = encounters.slice(0, MAX_VISIBLE_ENCOUNTERS);
    const overflow = encounters.length - visible.length;

    // Bottom-center: nad BottomBar (-8 padding). User feedback 2026-05-20 —
    // top-center zachodziło z FleetManagerOverlay prawy panel. Bottom-center
    // zostawia tactical map area czytelną.
    // UI v3 — w civMode rezerwa dolna = pasek nawigacji + listwa dziennika; poza = dolny pasek.
    const bottomRes = (window.KOSMOS?.civMode
      ? (COSMIC.BOTTOM_NAV_H + COSMIC.BOTTOM_LOG_TRIG_H)
      : (COSMIC.BOTTOM_BAR_H ?? 32))
      + (window.KOSMOS?.tacticalDock?.getReservedHeight?.() ?? 0);   // Faza 4 — podnieś NAD Dok taktyczny
    const topY = (COSMIC.TOP_BAR_H ?? 32) + 8;
    const bottomY = H - bottomRes - (COSMIC.RESOURCE_BAR_H ?? 0) - 8;   // nad paskiem nawigacji + dziennikiem
    // POLISH P2b (D4, Finding 468) — układ karty mieszczący się między górnym a dolnymi paskami: mniej linii logu, potem
    // statki w jednej linii (bez osobnej linii broni); dawniej dół karty z logiem wchodził pod pasek nawigacji.
    const layout = this._fitLayout(visible, overflow, Math.min(bottomY - topY, Math.floor(H * CARD_MAX_H_FRAC)));
    const totalH = layout.totalH;
    const px = Math.floor(W / 2 - PANEL_W / 2);
    const py = Math.max(topY, bottomY - totalH);

    this._panelRect = { x: px, y: py, w: PANEL_W, h: totalH };

    // Tło + ramka
    ctx.fillStyle = bgAlpha(0.78);
    ctx.fillRect(px, py, PANEL_W, totalH);
    ctx.strokeStyle = THEME.danger ?? '#ff4466';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, PANEL_W - 1, totalH - 1);

    // Header
    ctx.fillStyle = THEME.danger ?? '#ff4466';
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center';
    const headerLabel = encounters.length === 1
      ? `⚔ ${t('combat.hudHeaderSingle')}`
      : `⚔ ${t('combat.hudHeaderMulti', encounters.length)}`;
    ctx.fillText(headerLabel, px + PANEL_W / 2, py + 16);
    ctx.textAlign = 'left';

    // Minimize button (—) — top-right header. Klik → toggleMinimize → BottomBar
    // pokazuje chip restoreujący panel.
    const minBtnW = 22;
    const minBtnH = HEADER_H - 4;
    const minBtnX = px + PANEL_W - minBtnW - 4;
    const minBtnY = py + 2;
    ctx.fillStyle = bgAlpha(0.4);
    ctx.fillRect(minBtnX, minBtnY, minBtnW, minBtnH);
    ctx.strokeStyle = THEME.border ?? '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(minBtnX + 0.5, minBtnY + 0.5, minBtnW - 1, minBtnH - 1);
    ctx.fillStyle = THEME.textSecondary ?? '#bbb';
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('—', minBtnX + minBtnW / 2, minBtnY + minBtnH / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    this._minimizeBtnBounds = { x: minBtnX, y: minBtnY, w: minBtnW, h: minBtnH };

    ctx.strokeStyle = THEME.border ?? '#444';
    ctx.beginPath();
    ctx.moveTo(px, py + HEADER_H);
    ctx.lineTo(px + PANEL_W, py + HEADER_H);
    ctx.stroke();

    let cy = py + HEADER_H;
    for (const enc of visible) {
      const h = this._rowH(enc, layout);
      this._drawEncounterRow(ctx, enc, px, cy, h, layout);
      cy += h;
    }
    // „Obserwuj bitwę” pierwszego wiersza — zgodność wstecz (sondy, keeper P2a-1 T5).
    this._watchBtnBounds = this._watchBtns[0] ?? null;

    if (overflow > 0) {
      ctx.fillStyle = THEME.textDim ?? '#888';
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(t('combat.hudMore', overflow), px + PANEL_W / 2, cy + 12);
      ctx.textAlign = 'left';
    }

    this._drawTooltip(ctx, W, H);
  }

  // POLISH P2b (D4) — wysokość wiersza starcia przy danym układzie karty (linie logu, statki w jednej / dwóch liniach).
  _rowH(enc, { logN = LOG_LINES_MAX, compact = false } = {}) {
    const per = compact ? 1 : 2;   // statek: „nazwa · kadłub” + „broń” albo wszystko w jednej linii
    const vesselsRows = Math.max(this._countVessels(enc, 'A') * per, this._countVessels(enc, 'B') * per, 1);
    // tytuł (16) + etykiety (14) + paski (14) + liczby HP (14) + żywi (14) + statki + nagłówek logu (14) + log + odstęp
    return ROW_TITLE_H + 14 + 14 + 14 + 14 + vesselsRows * 12 + 14 + logN * LOG_LINE_H + 10;
  }

  // POLISH P2b (D4, Finding 468) — pierwszy układ karty, który mieści się w dostępnej wysokości (między paskami, najwyżej
  // `CARD_MAX_H_FRAC` ekranu): pełny log (6 linii),
  // potem mniej linii (do 2), potem statki w jednej linii z pełnym logiem i znów mniej linii; nic nie mieści się —
  // najmniejszy układ (karta przypięta pod górnym paskiem, jak dotąd).
  _fitLayout(visible, overflow, availH) {
    const total = (layout) => HEADER_H + PADDING + visible.reduce((s, e) => s + this._rowH(e, layout), 0) + (overflow > 0 ? 18 : 0);
    for (const compact of [false, true]) {
      for (let logN = LOG_LINES_MAX; logN >= LOG_LINES_MIN; logN--) {
        const layout = { logN, compact };
        const h = total(layout);
        if (h <= availH) return { ...layout, totalH: h };
      }
    }
    const last = { logN: LOG_LINES_MIN, compact: true };
    return { ...last, totalH: total(last) };
  }

  _drawEncounterRow(ctx, enc, px, py, totalRowH, layout = { logN: LOG_LINES_MAX, compact: false }) {
    const hpA      = this._sumHP(enc, 'A');
    const hpStartA = this._sumHpStart(enc, 'A');
    const hpB      = this._sumHP(enc, 'B');
    const hpStartB = this._sumHpStart(enc, 'B');
    const pctA = hpStartA > 0 ? Math.max(0, hpA / hpStartA) : 0;
    const pctB = hpStartB > 0 ? Math.max(0, hpB / hpStartB) : 0;

    const distAU = this._lastDistanceAU(enc);
    const aliveA = this._countAlive(enc, 'A');
    const aliveB = this._countAlive(enc, 'B');
    const totalA = this._countVessels(enc, 'A');
    const totalB = this._countVessels(enc, 'B');
    const halfW = (PANEL_W - PADDING * 3) / 2;

    // Linia 0 — tytuł starcia: układ (CP23) · runda + dystans · „Watch” (CP22)
    const round = enc.currentRound ?? 0;
    const distStr = distAU > 0 ? `${distAU.toFixed(3)} AU` : '—';
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const roundText = `${t('combat.hudRound', round)} · ${distStr}`;
    ctx.fillStyle = THEME.textDim ?? '#888';
    ctx.textAlign = 'center';
    ctx.fillText(roundText, px + PANEL_W / 2, py + 12);
    const centerHalf = ctx.measureText(roundText).width / 2;
    ctx.fillStyle = THEME.accent ?? '#ffaa44';
    this._drawFitted(ctx, `◎ ${this._systemName(enc)}`, px + PADDING, py + 12,
      PANEL_W / 2 - PADDING - centerHalf - 8, 'left');
    this._drawWatchButton(ctx, enc, px + PANEL_W - PADDING - WATCH_BTN_W, py + 2, WATCH_BTN_W, ROW_TITLE_H - 3);

    // Linia 1: etykiety stron — dopasowane do połowy szerokości (pełny tekst w podpowiedzi)
    const y1 = py + ROW_TITLE_H;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.success ?? '#44cc66';
    this._drawFitted(ctx, enc.sideA.label, px + PADDING, y1 + 12, halfW, 'left');
    ctx.fillStyle = THEME.danger ?? '#ff4466';
    this._drawFitted(ctx, enc.sideB.label, px + PANEL_W - PADDING, y1 + 12, halfW, 'right');
    ctx.textAlign = 'left';

    // Linia 2: HP barki side-by-side
    const barW = halfW;
    const barY = y1 + 20;
    this._drawHpBar(ctx, px + PADDING, barY, barW, pctA,
                    `${hpA.toFixed(0)} / ${hpStartA.toFixed(0)} HP`,
                    THEME.success ?? '#44cc66');
    this._drawHpBar(ctx, px + PADDING * 2 + barW, barY, barW, pctB,
                    `${hpB.toFixed(0)} / ${hpStartB.toFixed(0)} HP`,
                    THEME.danger ?? '#ff4466');

    // Linia 3: alive counters
    ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary ?? '#bbb';
    ctx.fillText(t('combat.hudAlive', aliveA, totalA), px + PADDING, y1 + 48);
    ctx.textAlign = 'right';
    ctx.fillText(t('combat.hudAlive', aliveB, totalB), px + PANEL_W - PADDING, y1 + 48);
    ctx.textAlign = 'left';

    // Linia 4+: vessel details per side (hull + bronie) — każda linia dopasowana do połowy szerokości
    const vesselsY = y1 + 62;
    const vesselsA = this._getVesselDetails(enc, 'A', layout.compact);
    const vesselsB = this._getVesselDetails(enc, 'B', layout.compact);

    ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
    for (let i = 0; i < vesselsA.length; i++) {
      ctx.fillStyle = vesselsA[i].alive ? (THEME.success ?? '#44cc66') : (THEME.textDim ?? '#666');
      this._drawFitted(ctx, vesselsA[i].text, px + PADDING, vesselsY + i * 12, halfW, 'left');
    }
    for (let i = 0; i < vesselsB.length; i++) {
      ctx.fillStyle = vesselsB[i].alive ? (THEME.danger ?? '#ff4466') : (THEME.textDim ?? '#666');
      this._drawFitted(ctx, vesselsB[i].text, px + PANEL_W - PADDING, vesselsY + i * 12, halfW, 'right');
    }
    ctx.textAlign = 'left';

    // Linia log: header + ostatnie N zdarzeń (N z układu karty) — każda linia dopasowana do szerokości karty
    const vesselsRows = Math.max(vesselsA.length, vesselsB.length, 1);
    const logY = vesselsY + vesselsRows * 12 + 4;

    ctx.strokeStyle = THEME.border ?? '#333';
    ctx.beginPath();
    ctx.moveTo(px + PADDING, logY);
    ctx.lineTo(px + PANEL_W - PADDING, logY);
    ctx.stroke();

    ctx.fillStyle = THEME.textDim ?? '#888';
    ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
    ctx.fillText(`-- ${t('combat.hudBattleLog')} --`, px + PADDING, logY + 10);

    // Zbierz ostatnie N events z timeline (newest first).
    const recentEvents = this._collectRecentEvents(enc, layout.logN);
    for (let i = 0; i < recentEvents.length; i++) {
      const ev = recentEvents[i];
      const color = ev.fromSide === 'A'
        ? (THEME.success ?? '#44cc66')
        : (THEME.danger ?? '#ff4466');
      ctx.fillStyle = color;
      const ly = logY + 22 + i * LOG_LINE_H;
      this._drawFitted(ctx, ev.text, px + PADDING, ly, PANEL_W - PADDING * 2, 'left');
    }
  }

  // POLISH P2b (D4, CP22, Finding 465) — „Obserwuj bitwę” w wierszu starcia: kamera na TO starcie (id + układ + punkt).
  _drawWatchButton(ctx, enc, x, y, w, h) {
    const point = enc?.location?.point ?? null;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    ctx.fillStyle = bgAlpha(0.4);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = THEME.accent ?? '#ffaa44';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = THEME.accent ?? '#ffaa44';
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this._fitText(ctx, `👁 ${t('combat.watchBattle')}`, w - 6).text, x + w / 2, y + h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    this._watchBtns.push({ x, y, w, h, point: { x: point.x, y: point.y },
      encounterId: enc?.id ?? null, systemId: enc?.location?.systemId ?? null });
  }

  // POLISH P2b (D4, CP23) — nazwa układu starcia (kanon `systemDisplayName`: rejestr → nazwa gwiazdy → id).
  _systemName(enc) {
    const sysId = enc?.location?.systemId;
    if (!sysId) return '—';
    return systemDisplayName(sysId, {
      systems:  window.KOSMOS?.starSystemManager?.getAllSystems?.() ?? [],
      starName: (sid) => EntityManager.getByTypeInSystem?.('star', sid)?.[0]?.name ?? null,
    });
  }

  // POLISH P2b (D4, Finding 468) — tekst przycięty po SZEROKOŚCI (bieżąca czcionka) z wielokropkiem.
  _fitText(ctx, s, maxW) {
    const str = typeof s === 'string' ? s : '?';
    if (!(maxW > 0)) return { text: '', cut: str.length > 0 };
    if (ctx.measureText(str).width <= maxW) return { text: str, cut: false };
    let lo = 0, hi = str.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(str.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1;
    }
    return { text: str.slice(0, lo).trimEnd() + '…', cut: true };
  }

  // Narysuj tekst dopasowany do `maxW`; przycięty — strefa podpowiedzi z pełnym tekstem.
  _drawFitted(ctx, s, x, y, maxW, align = 'left') {
    const { text, cut } = this._fitText(ctx, s, maxW);
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    if (cut) {
      const w = ctx.measureText(text).width;
      const fpx = Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font ?? '')?.[1]) || 10;
      const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      this._hoverZones.push({ x: x0, y: y - fpx, w, h: fpx + 4, full: String(s) });
    }
    return cut;
  }

  _drawTooltip(ctx, W, H) {
    if (!this._hover) return;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const text = this._fitText(ctx, this._hover, TOOLTIP_MAX_W).text;
    const w = Math.ceil(ctx.measureText(text).width) + 12;
    const h = THEME.fontSizeSmall + 10;
    const x = Math.max(4, Math.min(W - w - 4, this._mouse.x + 12));
    const y = Math.max(4, Math.min(H - h - 4, this._mouse.y - h - 6));
    ctx.fillStyle = bgAlpha(0.95);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = THEME.border ?? '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = THEME.textPrimary ?? '#ddd';
    ctx.textAlign = 'left';
    ctx.fillText(text, x + 6, y + h - 6);
  }

  _drawHpBar(ctx, x, y, w, pct, label, fgColor) {
    ctx.fillStyle = 'rgba(40, 40, 40, 0.6)';
    ctx.fillRect(x, y, w, HP_BAR_H);
    const fillW = Math.max(0, Math.min(w, w * pct));
    ctx.fillStyle = fgColor;
    ctx.fillRect(x, y, fillW, HP_BAR_H);
    ctx.strokeStyle = THEME.border ?? '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, HP_BAR_H - 1);
    ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim ?? '#888';
    ctx.fillText(label, x, y + HP_BAR_H + 10);
  }

  // -- Helpers ----------------------------------------------------------

  _sumHP(enc, sideKey) {
    const side = sideKey === 'A' ? enc.sideA : enc.sideB;
    let sum = 0;
    for (const vid of [...side.vesselIds, ...side.joinedVesselIds]) {
      const state = enc.vesselStates.get(vid);
      if (state) sum += Math.max(0, state.hp);
    }
    return sum;
  }

  _sumHpStart(enc, sideKey) {
    const side = sideKey === 'A' ? enc.sideA : enc.sideB;
    let sum = 0;
    for (const vid of [...side.vesselIds, ...side.joinedVesselIds]) {
      const state = enc.vesselStates.get(vid);
      if (state) sum += state.hpStart;
    }
    return sum;
  }

  _countAlive(enc, sideKey) {
    const side = sideKey === 'A' ? enc.sideA : enc.sideB;
    let n = 0;
    for (const vid of [...side.vesselIds, ...side.joinedVesselIds]) {
      const state = enc.vesselStates.get(vid);
      if (state && state.hp > 0) n++;
    }
    return n;
  }

  _countVessels(enc, sideKey) {
    const side = sideKey === 'A' ? enc.sideA : enc.sideB;
    return side.vesselIds.length + side.joinedVesselIds.length;
  }

  /**
   * Lista wierszy per vessel — dwie linie: (1) "Nazwa · hull", (2) "  bronie".
   * Druga linia wcięta dla czytelności. Każdy vessel → 2 wpisy w wyjściu.
   * POLISH P2b (D4) — `compact`: jedna linia „Nazwa · hull · bronie” (karta nie mieści się nad dolnymi paskami).
   */
  _getVesselDetails(enc, sideKey, compact = false) {
    const side = sideKey === 'A' ? enc.sideA : enc.sideB;
    const vm = window.KOSMOS?.vesselManager;
    const out = [];
    for (const vid of [...side.vesselIds, ...side.joinedVesselIds]) {
      const state = enc.vesselStates.get(vid);
      const vessel = vm?._vessels?.get?.(vid);
      const name = vessel?.name ?? vessel?.shipId ?? vid;
      const hullId = vessel?.hullId ?? vessel?.shipId ?? '';
      const hull = HULLS?.[hullId];
      const hullName = hull ? getName(hull, 'ship') : hullId.replace(/^hull_/, '');
      const weapons = (state?.weapons ?? []).map(w => {
        const mod = SHIP_MODULES?.[w.moduleId];
        const wn = mod ? getName(mod) : w.moduleId.replace(/^weapon_/, '');
        return wn;
      });
      const wstr = weapons.length > 0 ? weapons.join(', ') : t('combat.hudNoWeapons');
      const alive = (state?.hp ?? 0) > 0;
      if (compact) { out.push({ text: `${name} · ${hullName} · ${wstr}`, alive, indent: false }); continue; }
      out.push({ text: `${name} · ${hullName}`, alive, indent: false });
      out.push({ text: `  ${wstr}`,              alive, indent: true  });
    }
    return out;
  }

  /** Ostatnie N events z timeline (newest first, sformatowane do tekstu). */
  _collectRecentEvents(enc, n) {
    const vm = window.KOSMOS?.vesselManager;
    const sideAIds = new Set([...enc.sideA.vesselIds, ...enc.sideA.joinedVesselIds]);
    const events = [];
    // Iteruj timeline w odwrotnej kolejności
    for (let i = enc.timeline.length - 1; i >= 0 && events.length < n; i--) {
      const round = enc.timeline[i];
      if (!round?.events) continue;
      for (let j = round.events.length - 1; j >= 0 && events.length < n; j--) {
        const ev = round.events[j];
        const fromSide = sideAIds.has(ev.attacker) ? 'A' : 'B';
        const att = vm?._vessels?.get?.(ev.attacker);
        const tgt = vm?._vessels?.get?.(ev.target);
        const attName = att?.name ?? ev.attacker;
        const tgtName = tgt?.name ?? ev.target;
        const mod = SHIP_MODULES?.[ev.weapon];
        const wn = mod ? getName(mod) : ev.weapon.replace(/^weapon_/, '');
        let dmgInfo;
        if (!ev.hit) dmgInfo = t('combat.hudMiss');
        else if ((ev.blockedByShield ?? 0) > 0 && (ev.damage ?? 0) === 0) dmgInfo = `${t('combat.hudShield')} ${ev.blockedByShield.toFixed(0)}`;
        else if ((ev.blockedByShield ?? 0) > 0) dmgInfo = `${ev.damage.toFixed(0)} dmg (+${ev.blockedByShield.toFixed(0)} ${t('combat.hudShield')})`;
        else dmgInfo = `${(ev.damage ?? 0).toFixed(0)} dmg`;
        // POLISH P2b (D4, Finding 468) — pełne nazwy; linia dopasowana do szerokości karty przy rysowaniu
        // (`_drawFitted`, pełny tekst w podpowiedzi) — dawniej nazwy ucinane po 12 znakach, a linia po 88.
        events.push({
          text: `R${round.round}: ${attName} → ${wn} → ${tgtName} (${dmgInfo})`,
          fromSide,
        });
      }
    }
    return events;
  }

  _lastDistanceAU(enc) {
    if (!enc.timeline?.length) return 0;
    for (let i = enc.timeline.length - 1; i >= 0; i--) {
      const d = enc.timeline[i]?.distanceAU;
      if (d && d > 0) return d;
    }
    return 0;
  }

  /**
   * POLISH P2b (D4, Finding 468) — najechanie na przycięty tekst karty: pełny tekst w podpowiedzi. Wołane przez
   * `UIManager.handleMouseMove` (współrzędne LOGICZNE UI). Zwraca true, gdy podpowiedź się zmieniła.
   */
  handleMouseMove(mx, my) {
    const prev = this._hover;
    this._mouse = { x: mx, y: my };
    const z = this._minimized ? null
      : this._hoverZones.find((h) => mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h);
    this._hover = z ? z.full : null;
    return this._hover !== prev;
  }

  /**
   * Click router — wywoływany przez UIManager.handleClick PRZED inną UI (HUD
   * rysowany na wierzchu overlay'ów). Zwraca true gdy klik został zjedzony.
   */
  handleClick(mx, my) {
    if (this._minimized) return false;
    // „Obserwuj bitwę" — close-up kamery na bitwę TEGO wiersza (POLISH P2b, CP22).
    for (const w of this._watchBtns) {
      if (mx >= w.x && mx <= w.x + w.w && my >= w.y && my <= w.y + w.h) {
        if (w.point) EventBus.emit('camera:watchBattle', { encounterId: w.encounterId ?? null, systemId: w.systemId ?? null, x: w.point.x, y: w.point.y });
        return true;
      }
    }
    const b = this._minimizeBtnBounds;
    if (b && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      this.toggleMinimize();
      return true;
    }
    return false;
  }
}
