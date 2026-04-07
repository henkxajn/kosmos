// DysonOverlay — panel megaprojektu Sfery Dysona (Faza D3)
//
// 2-kolumnowy overlay (Canvas 2D, dziedziczy z BaseOverlay):
//   LEWA  — globalny status Sfery (segmenty X/20, postęp, research bonus, etap wizualny)
//   PRAWA — 4 fazy z listą segmentów + paskami postępu + przyciskami "Dostarcz Max"
//
// Nasłuchuje:
//   'dyson:panelUpdate' { state } → cache state, mark dirty
// Emituje:
//   (przez DysonSystem.deliverMax wywołane z handleClick)

import { BaseOverlay } from './BaseOverlay.js';
import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import { DYSON_SEGMENTS, DYSON_PHASES } from '../data/DysonData.js';
import { t, getLocale } from '../i18n/i18n.js';
import EventBus from '../core/EventBus.js';

const LEFT_W = 340;
const TAB_H  = 32;
const ROW_H  = 22;
const PHASE_HDR_H = 24;
const SEG_H = 32;          // wysokość wiersza segmentu (mieści 3-region: name | bar | button)
const SEG_BTN_W = 80;       // stała szerokość przycisku Deliver Max
const SEG_BTN_H = 20;
const SEG_DETAILS_H = 130;  // sub-panel szczegółów segmentu (enhanced)

// Kolory unique do wizualnego rozróżnienia faz Sfery
const PHASE_COLORS = {
  phase_1: '#88aacc',  // niebieski stalowy — fundament
  phase_2: '#ffcc66',  // złoty — energia
  phase_3: '#cc88ff',  // fiolet — transmisja
  phase_4: '#ff66aa',  // róż — Brama
};

export class DysonOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._state = null;
    this._scrollRight  = 0;
    this._selectedSeg  = null;  // Segment id wybrany w UI

    // Nasłuch eventów DysonSystem
    EventBus.on('dyson:panelUpdate', (state) => {
      this._state = state;
    });
  }

  // ── Główna metoda rysowania ──────────────────────────────────────────────

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];

    // Pobierz świeży snapshot jeśli stan brak (np. po otwarciu przed pierwszym update)
    if (!this._state) {
      this._state = window.KOSMOS?.dysonSystem?.getState?.() ?? null;
    }

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

    // Rysuj kolumny
    this._drawLeft(ctx, ox, oy, LEFT_W, oh);
    this._drawRight(ctx, ox + LEFT_W, oy, rightW, oh);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEWA KOLUMNA — globalny status Sfery
  // ══════════════════════════════════════════════════════════════════════════

  _drawLeft(ctx, x, y, w, h) {
    const pad = 14;
    const isPL = getLocale() !== 'en';

    // Nagłówek
    ctx.fillStyle = bgAlpha(0.50);
    ctx.fillRect(x, y, w, TAB_H);
    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(t('dyson.header'), x + pad, y + 21);

    let ry = y + TAB_H + 16;

    // Stan: nieaktywny
    if (!this._state || !this._state.active) {
      ctx.font = `italic ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      this._wrapText(ctx, t('dyson.notUnlocked'), x + pad, ry, w - pad * 2, 16);
      return;
    }

    const completed = this._state.completedCount ?? 0;
    const total     = 20;
    const pct       = completed / total;

    // ── Sekcja: SEGMENTY ──
    this._sectionHeader(ctx, x + pad, ry, t('dyson.segmentsHeader'));
    ry += 18;
    this._statRow(ctx, x + pad, ry, w, t('dyson.completed'), `${completed} / ${total}`, THEME.accent);
    ry += ROW_H;
    // Pasek głównego postępu
    this._drawBar(ctx, x + pad, ry, w - pad * 2, 8, pct, THEME.accent, THEME.border);
    ry += 14;

    // ── Sekcja: BONUSY ──
    this._sectionHeader(ctx, x + pad, ry, t('dyson.bonusesHeader'));
    ry += 18;
    const bonus = this._state.researchBonus ?? 0;
    this._statRow(ctx, x + pad, ry, w, t('dyson.researchBonus'),
      bonus > 0 ? `+${bonus} ${t('dyson.perYear')}` : '—',
      bonus > 0 ? THEME.success : THEME.textDim);
    ry += ROW_H + 4;

    // ── Sekcja: ETAP WIZUALNY ──
    this._sectionHeader(ctx, x + pad, ry, t('dyson.stageHeader'));
    ry += 18;
    const stage = this._state.stage ?? 0;
    this._statRow(ctx, x + pad, ry, w, t('dyson.stage'), `${stage} / 4`);
    ry += ROW_H;
    // Opis etapu (wielo-linijkowy)
    ctx.font = `italic ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    const stageDesc = t(`dyson.stage${stage}`) || '';
    ry = this._wrapText(ctx, stageDesc, x + pad, ry + 6, w - pad * 2, 14);
    ry += 12;

    // ── Sekcja: ODBLOKOWANE FAZY ──
    this._sectionHeader(ctx, x + pad, ry, t('dyson.phasesHeader'));
    ry += 18;
    const unlocked = new Set(this._state.unlockedPhases ?? []);
    for (const phase of DYSON_PHASES) {
      const isUnlocked = unlocked.has(phase.id);
      const phaseName = isPL ? phase.namePL : phase.nameEN;
      const icon = isUnlocked ? '◆' : '◇';
      const color = isUnlocked ? PHASE_COLORS[phase.id] : THEME.textDim;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = color;
      ctx.fillText(`${icon} ${phaseName}`, x + pad, ry + 10);
      ry += 14;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRAWA KOLUMNA — fazy + segmenty
  // ══════════════════════════════════════════════════════════════════════════

  _drawRight(ctx, x, y, w, h) {
    const pad = 14;
    const isPL = getLocale() !== 'en';

    // Nagłówek
    ctx.fillStyle = bgAlpha(0.50);
    ctx.fillRect(x, y, w, TAB_H);
    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('dyson.constructionHeader'), x + pad, y + 21);

    if (!this._state || !this._state.active) {
      ctx.font = `italic ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('dyson.notUnlocked'), x + pad, y + TAB_H + 30);
      return;
    }

    const listY = y + TAB_H;
    const listH = h - TAB_H;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listY, w, listH);
    ctx.clip();

    let ry = listY + 8 - this._scrollRight;
    const unlocked = new Set(this._state.unlockedPhases ?? []);

    for (const phase of DYSON_PHASES) {
      const isUnlocked = unlocked.has(phase.id);
      const phaseName  = isPL ? phase.namePL : phase.nameEN;
      const phaseColor = isUnlocked ? PHASE_COLORS[phase.id] : THEME.textDim;

      // Nagłówek fazy
      ctx.font = `bold ${THEME.fontSizeSmall + 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = phaseColor;
      const icon = isUnlocked ? '◆' : '🔒';
      ctx.fillText(`${icon} ${phaseName}`, x + pad, ry + 14);

      // Status text po prawej
      ctx.textAlign = 'right';
      ctx.fillStyle = THEME.textDim;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      const completedInPhase = phase.segments.filter(sId => this._state.segments[sId]?.completed).length;
      ctx.fillText(`${completedInPhase}/${phase.segments.length}`, x + w - pad, ry + 14);
      ctx.textAlign = 'left';
      ry += PHASE_HDR_H;

      if (!isUnlocked) {
        // Faza zablokowana — pokaż wymagania
        ctx.font = `italic ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        const reqLabel = phase.requiresTech
          ? `  ${t('dyson.requiresTech')}: ${phase.requiresTech}`
          : '';
        ctx.fillText(reqLabel, x + pad, ry + 10);
        ry += 18;
        continue;
      }

      // Lista segmentów — układ 3-region: NAME (lewa) | BAR (środek, flex) | BUTTON (prawa, fixed)
      for (const segId of phase.segments) {
        const seg    = this._state.segments[segId];
        const segDef = DYSON_SEGMENTS[segId];
        if (!seg || !segDef) continue;

        const isSelected  = this._selectedSeg === segId;
        const isCompleted = !!seg.completed;
        const segName     = isPL ? segDef.namePL : segDef.nameEN;

        // ── Geometria 3-region row ──
        // [name+id] [    bar (pct text overlay right)    ] [button]
        const NAME_W   = 170;                                   // lewa kolumna stała szerokość
        const GAP      = 10;                                    // odstęp między regionami
        const buttonX  = x + w - pad - SEG_BTN_W;                // prawy region (fixed)
        const buttonY  = ry + Math.floor((SEG_H - SEG_BTN_H) / 2);
        const nameX    = x + pad;
        const barX     = nameX + NAME_W + GAP;
        const barEndX  = buttonX - GAP;                          // pasek kończy się GAP przed buttonem
        const barW     = Math.max(40, barEndX - barX);           // safety: min 40px
        const barY     = ry + Math.floor(SEG_H / 2) - 2;         // pasek wycentrowany
        const barH     = 4;

        // Tło wybranego segmentu (pełny wiersz)
        if (isSelected) {
          ctx.fillStyle = 'rgba(0,255,180,0.08)';
          ctx.fillRect(x + pad - 2, ry, w - pad * 2 + 4, SEG_H);
        }

        // ── REGION 1: nazwa + id (lewa) ──
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = isCompleted ? THEME.success : THEME.textPrimary;
        const checkmark = isCompleted ? '✓ ' : '';
        // Skróć tekst jeśli za długi
        const fullName = `${checkmark}${segId}. ${segName}`;
        const truncatedName = this._truncateText(ctx, fullName, NAME_W);
        ctx.fillText(truncatedName, nameX, ry + Math.floor(SEG_H / 2) + 4);

        // ── REGION 2: pasek postępu (środek, flex) ──
        this._drawBar(ctx, barX, barY, barW, barH,
          seg.progress ?? 0,
          isCompleted ? THEME.success : phaseColor,
          THEME.border);

        // Procent — naniesione na pasek (centered nad)
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = isCompleted ? THEME.success : THEME.textSecondary;
        ctx.textAlign = 'center';
        ctx.fillText(
          `${Math.round((seg.progress ?? 0) * 100)}%`,
          barX + barW / 2,
          barY - 2
        );
        ctx.textAlign = 'left';

        // ── REGION 3: przycisk Deliver Max (prawa, fixed) ──
        if (!isCompleted) {
          this._drawButton(ctx, t('dyson.deliverMax'), buttonX, buttonY, SEG_BTN_W, SEG_BTN_H, 'primary');
          this._addHit(buttonX, buttonY, SEG_BTN_W, SEG_BTN_H, 'deliverMax', { segmentId: segId });
        }

        // Klikalny obszar segmentu (zaznaczenie) — od lewej do PRZED buttonem
        // Nie nakładaj na button, żeby klik na button nie selectował też
        this._addHit(x + pad, ry, buttonX - x - pad - 4, SEG_H, 'selectSegment', { segmentId: segId });

        ry += SEG_H;
      }

      ry += 6; // odstęp między fazami
    }

    ctx.restore();

    // Panel szczegółów wybranego segmentu (sub-panel u dołu)
    if (this._selectedSeg) {
      this._drawSegmentDetails(ctx, x, y + h - SEG_DETAILS_H, w, SEG_DETAILS_H);
    }
  }

  // Sub-panel z surowcami wybranego segmentu — enhanced (Faza D3 fix)
  _drawSegmentDetails(ctx, x, y, w, h) {
    const pad = 14;
    const isPL = getLocale() !== 'en';
    const segId  = this._selectedSeg;
    const seg    = this._state?.segments?.[segId];
    const segDef = DYSON_SEGMENTS[segId];
    if (!seg || !segDef) return;

    // Tło sub-panelu — bardziej widoczne (był 0.65, teraz 0.75)
    ctx.fillStyle = bgAlpha(0.75);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // ── HEADER: id + name (lewa) | 2 buttony (prawa) ──
    const segName = isPL ? segDef.namePL : segDef.nameEN;
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(`${segId}. ${segName}`, x + pad, y + 18);

    // Buttony w headerze (gdy segment niekompletny)
    if (!seg.completed) {
      const btnH    = 22;
      const btnGap  = 6;
      const maxBtnW = 90;
      const tenBtnW = 80;
      const totalBtnW = maxBtnW + btnGap + tenBtnW;
      const btn1X   = x + w - pad - totalBtnW;
      const btn2X   = btn1X + maxBtnW + btnGap;
      const btnY    = y + 8;

      this._drawButton(ctx, t('dyson.deliverMax'), btn1X, btnY, maxBtnW, btnH, 'primary');
      this._addHit(btn1X, btnY, maxBtnW, btnH, 'deliverMax', { segmentId: segId });

      this._drawButton(ctx, t('dyson.deliverPct'), btn2X, btnY, tenBtnW, btnH, 'secondary');
      this._addHit(btn2X, btnY, tenBtnW, btnH, 'deliverPercent', { segmentId: segId, percent: 0.10 });
    } else {
      // Segment ukończony — pokaż status
      ctx.textAlign = 'right';
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.success;
      ctx.fillText(`✓ ${t('dyson.segmentComplete')}`, x + w - pad, y + 22);
      ctx.textAlign = 'left';
    }

    // ── BODY: lista surowców z indywidualnymi paskami postępu ──
    // 2-kolumnowy grid, każdy zasób w osobnej "linii"
    const bodyY  = y + 38;
    const colW   = (w - pad * 2 - 16) / 2;       // 2 kolumny
    const lineH  = 16;
    const resources = Object.entries(segDef.cost);

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    let i = 0;
    for (const [res, needed] of resources) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx  = x + pad + col * (colW + 16);
      const cy  = bodyY + row * (lineH * 2 + 4);

      const delivered = seg.delivered?.[res] ?? 0;
      const isDone    = delivered >= needed;
      const ratio     = needed > 0 ? Math.min(1, delivered / needed) : 0;

      // Linia 1: nazwa surowca + wartości
      ctx.fillStyle = isDone ? THEME.success : THEME.textSecondary;
      ctx.fillText(res, cx, cy + 10);
      ctx.textAlign = 'right';
      ctx.fillStyle = isDone ? THEME.success : THEME.textPrimary;
      ctx.fillText(`${Math.round(delivered)}/${needed}`, cx + colW, cy + 10);
      ctx.textAlign = 'left';

      // Linia 2: mini pasek postępu per surowiec
      this._drawBar(ctx, cx, cy + 14, colW, 3, ratio,
        isDone ? THEME.success : THEME.accent,
        THEME.border);
      i++;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Helpery rysowania (wzorzec z CivilizationOverlay)
  // ══════════════════════════════════════════════════════════════════════════

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

  // Skróć tekst (z trzykropkiem) jeśli przekracza maxW pikseli przy aktualnym fontcie
  _truncateText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    const ellipsis = '…';
    let truncated = text;
    while (truncated.length > 1 && ctx.measureText(truncated + ellipsis).width > maxW) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + ellipsis;
  }

  _wrapText(ctx, text, x, y, maxW, lineH) {
    if (!text) return y;
    const words = text.split(' ');
    let line = '';
    let cy = y;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, cy + 10);
        cy += lineH;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) {
      ctx.fillText(line, x, cy + 10);
      cy += lineH;
    }
    return cy;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Obsługa kliknięć
  // ══════════════════════════════════════════════════════════════════════════

  handleClick(x, y) {
    if (!this.visible) return false;
    const W = Math.round(window.innerWidth  / Math.min(window.innerWidth / 1280, window.innerHeight / 720));
    const H = Math.round(window.innerHeight / Math.min(window.innerWidth / 1280, window.innerHeight / 720));
    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);
    if (x < ox || x > ox + ow || y < oy || y > oy + oh) return false;

    const hit = this._hitTest(x, y);
    if (hit) {
      this._onHit(hit);
      return true;
    }
    return true;  // pochłoń klik wewnątrz overlay'a
  }

  _onHit(zone) {
    switch (zone.type) {
      case 'close':
        this.hide();
        break;
      case 'selectSegment':
        this._selectedSeg = zone.data.segmentId;
        break;
      case 'deliverMax': {
        // Klik na segment row = również wybierz segment (UX: feedback w sub-panelu)
        this._selectedSeg = zone.data.segmentId;
        const result = window.KOSMOS?.dysonSystem?.deliverMax?.(zone.data.segmentId);
        if (result && !result.ok) {
          console.warn('[DysonOverlay] deliverMax failed:', result.reason);
        }
        break;
      }
      case 'deliverPercent': {
        this._selectedSeg = zone.data.segmentId;
        const result = window.KOSMOS?.dysonSystem?.deliverPercent?.(
          zone.data.segmentId,
          zone.data.percent ?? 0.10
        );
        if (result && !result.ok) {
          console.warn('[DysonOverlay] deliverPercent failed:', result.reason);
        }
        break;
      }
    }
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    const W = Math.round(window.innerWidth  / Math.min(window.innerWidth / 1280, window.innerHeight / 720));
    const H = Math.round(window.innerHeight / Math.min(window.innerWidth / 1280, window.innerHeight / 720));
    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);
    if (x < ox || x > ox + ow || y < oy || y > oy + oh) return false;
    if (x >= ox + LEFT_W) {
      this._scrollRight = Math.max(0, this._scrollRight + delta * 0.5);
    }
    return true;
  }
}
