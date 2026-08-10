// DiplomacyOverlay — panel Dyplomacji (klawisz Y)
//
// 2-kolumnowy: lewa lista imperiów (tylko intel >= contact widoczne z nazwą,
// rumor jako "???" z szarym paskiem), prawa szczegóły zaznaczonej relacji.

import { BaseOverlay, HEADER_H } from './BaseOverlay.js';
import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { ARCHETYPES } from '../data/EmpireData.js';
import EventBus from '../core/EventBus.js';
import { t } from '../i18n/i18n.js';
import { canDoEnvoy, hasWeapons } from '../entities/Vessel.js';

const LEFT_W = 300;
const TAB_H  = HEADER_H;   // pasmo nagłówka = standard (było 32)

// S3.4 — klucze i18n stanu relacji (peace/truce/war/alliance)
// D1: status relacji to WYŁĄCZNIE peace | truce | war. Gałąź 'alliance' została
// usunięta — żadna ścieżka kodu nigdy jej nie zapisywała (sojusz to TRAKTAT,
// widoczny w sekcji traktatów i w pasmie statusu 'ally').
const STATE_KEY = {
  peace: 'diplo.state.peace',
  truce: 'diplo.state.truce',
  war:   'diplo.state.war',
};
const STATE_COLOR = {
  peace: '#60B090',
  truce: '#B0A050',
  war:   '#D85A30',
};
const FSM_COLOR = {
  IDLE:        '#777',
  EXPANDING:   '#60A0E0',
  REARMING:    '#B08050',
  AGGRESSIVE:  '#D88050',
  WAR:         '#D03030',
  RETREAT:     '#A05050',
  NEGOTIATING: '#50B0A0',
};
const MASK = '???';
const LEVEL_RANK = { unknown: 0, rumor: 1, contact: 2, detailed: 3 };
// S3.4 — kolory statusu trust (hostile/neutral/friendly/ally)
const TRUST_STATUS_COLOR = {
  hostile:  '#D85A30',
  neutral:  '#B0A050',
  friendly: '#60B090',
  ally:     '#50C0E0',
};

// ── D1 — budżet pionowy prawej kolumny ──────────────────────────────────────
// Prawa kolumna NIE MA scrolla (handleScroll obsługuje tylko listę imperiów po lewej),
// a treść potrafi urosnąć: rozbicie opinii + ultimatum + traktaty + pamięć. Limity
// poniżej trzymają panel w ~550 px dostępnych przy 1280×720; pasmo akcji jest dodatkowo
// PRZYPIĘTE do dołu, więc nawet przepełnienie nie wypchnie przycisków za panel.
const MAX_BREAKDOWN_ROWS = 5;    // dalsze pozycje zwijane w wiersz „+ N więcej"
const MEMORY_ROWS        = 3;    // pierścień ma 20 wpisów, panel pokazuje 3 najnowsze
const BREAKDOWN_ROW_H    = 13;
// Szerokość kolumny „(zanika za N l. gry)" od prawej krawędzi. D2/E6: 58 → 82, bo
// etykieta zaczęła PODAWAĆ JEDNOSTKĘ („l. gry"). Sama liczba była poprawna od D1 —
// kłamała jednostka: to były lata CYWILIZACYJNE, a gracz czyta zegar wyświetlany.
const FADE_COL_W         = 82;

// Kolor liczby opinii: −100 czerwony → 0 amber → +100 zielony (lerp po kanałach RGB).
const OPINION_NEG = [0xD8, 0x5A, 0x30];
const OPINION_MID = [0xB0, 0xA0, 0x50];
const OPINION_POS = [0x60, 0xB0, 0x90];
function opinionColor(op) {
  const v = Math.max(-100, Math.min(100, Number(op) || 0));
  const [from, to, tt] = v < 0
    ? [OPINION_NEG, OPINION_MID, 1 + v / 100]   // −100 → 0
    : [OPINION_MID, OPINION_POS, v / 100];      //    0 → +100
  const ch = (i) => Math.round(from[i] + (to[i] - from[i]) * tt);
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
}

export class DiplomacyOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._selectedId = null;
    this._scrollLeft = 0;
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
  }

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];
    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);

    ctx.fillStyle = bgAlpha(0.40);
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, ow, oh);

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
    // BUG7 — tło-absorber klików NA KOŃCU (first-match: konkretne strefy wygrywają,
    // tło łapie resztę → klik w panelu nie przebija do sceny).
    this._addHit(ox, oy, ow, oh, 'bg');
  }

  // ── Lewa: lista relacji ────────────────────────────────────

  _drawLeft(ctx, x, y, w, h) {
    const pad = 12;

    this._drawOverlayHeader(ctx, x, y, w, t('diplo.header'));

    const dipl = window.KOSMOS?.diplomacySystem;
    const intelSys = window.KOSMOS?.intelSystem;
    const reg = window.KOSMOS?.empireRegistry;
    if (!dipl || !reg) return;

    // Tylko imperia o intel >= rumor
    const entries = dipl.listPlayerRelations()
      .filter(r => !intelSys || intelSys.isAtLeast(r.empireId, 'rumor'))
      .sort((a, b) => (b.tension ?? 0) - (a.tension ?? 0));

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
      ctx.fillText(t('diplo.empty1'), x + w / 2, listY + 40);
      ctx.fillText(t('diplo.empty2'), x + w / 2, listY + 58);
      ctx.fillText(t('diplo.empty3'), x + w / 2, listY + 80);
      ctx.fillText(t('diplo.empty4'), x + w / 2, listY + 96);
      ctx.textAlign = 'left';
      ctx.restore();
      return;
    }

    for (const rel of entries) {
      const rowH = 54;
      if (ry + rowH < listY) { ry += rowH; continue; }
      if (ry > listY + listH) break;

      const emp = reg.get(rel.empireId);
      const intelLvl = intelSys?.getLevel(rel.empireId) ?? 'unknown';
      const intelRank = LEVEL_RANK[intelLvl];
      const isContact = intelRank >= LEVEL_RANK.contact;
      const arch = emp ? ARCHETYPES[emp.archetype] : null;
      const isSel = this._selectedId === rel.empireId;

      // Tło rzędu
      if (isSel) {
        ctx.fillStyle = 'rgba(255,200,60,0.08)';
        ctx.fillRect(x + 4, ry, w - 8, rowH - 2);
        ctx.strokeStyle = THEME.accent;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 4.5, ry + 0.5, w - 9, rowH - 3);
      }

      // Kropka koloru archetypu / szara dla rumor
      const dotColor = isContact && arch ? arch.color : '#888';
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(x + pad + 4, ry + 14, 5, 0, Math.PI * 2);
      ctx.fill();

      // Nazwa
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const name = isContact ? (emp?.name ?? MASK) : MASK;
      ctx.fillStyle = isContact ? THEME.textPrimary : THEME.textDim;
      ctx.fillText(name, x + pad + 14, ry + 16);

      // Stan (peace/war/etc)
      const skey = STATE_KEY[rel.status ?? 'peace'];
      const stateLabel = skey ? t(skey) : '?';
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = STATE_COLOR[rel.status ?? 'peace'];
      ctx.textAlign = 'right';
      ctx.fillText(stateLabel, x + w - pad, ry + 16);
      ctx.textAlign = 'left';

      // Pasek hostility
      const barY = ry + 24;
      const barW = w - pad * 2 - 20;
      const barH = 5;
      ctx.fillStyle = 'rgba(60,60,60,0.5)';
      ctx.fillRect(x + pad, barY, barW, barH);
      const hostPct = Math.max(0, Math.min(1, (rel.tension ?? 0) / 100));
      const hColor = rel.tension >= 60 ? '#D85A30' : rel.tension >= 40 ? '#D8A030' : '#60B090';
      ctx.fillStyle = hColor;
      ctx.fillRect(x + pad, barY, Math.round(barW * hostPct), barH);

      // Liczbowy hostility z prawej
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(rel.tension ?? 0)}`, x + w - pad, barY + 5);
      ctx.textAlign = 'left';

      // Etykieta "Hostility" + FSM (stan AI)
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('diplo.tension'), x + pad, barY + 16);
      const fsmState = emp?.fsm?.state ?? 'IDLE';
      if (isContact) {
        ctx.fillStyle = FSM_COLOR[fsmState] ?? THEME.textDim;
        ctx.textAlign = 'right';
        ctx.fillText(fsmState, x + w - pad, barY + 16);
        ctx.textAlign = 'left';
      }

      this._addHit(x + 4, ry, w - 8, rowH - 2, 'select', { empireId: rel.empireId });
      ry += rowH;
    }
    ctx.restore();
  }

  // ── Prawa: szczegóły ───────────────────────────────────────

  _drawRight(ctx, x, y, w, h) {
    const pad = 18;

    ctx.fillStyle = bgAlpha(0.45);
    ctx.fillRect(x, y, w, TAB_H);

    const dipl = window.KOSMOS?.diplomacySystem;
    const reg = window.KOSMOS?.empireRegistry;
    const intelSys = window.KOSMOS?.intelSystem;
    if (!this._selectedId || !dipl) {
      ctx.font = `${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(t('diplo.selectEmpire'), x + w / 2, y + h / 2);
      ctx.textAlign = 'left';
      return;
    }

    const rel = dipl.listPlayerRelations().find(r => r.empireId === this._selectedId);
    const emp = reg?.get(this._selectedId);
    if (!rel || !emp) return;

    const intelLvl = intelSys?.getLevel(this._selectedId) ?? 'unknown';
    const isContact = LEVEL_RANK[intelLvl] >= LEVEL_RANK.contact;
    const arch = ARCHETYPES[emp.archetype];

    // Nagłówek
    ctx.font = `bold ${THEME.fontSizeMedium + 2}px ${THEME.fontFamily}`;
    ctx.fillStyle = isContact ? (arch?.color ?? THEME.textPrimary) : THEME.textDim;
    ctx.fillText(`⚑ ${isContact ? emp.name : MASK}`, x + pad, y + 22);

    // Chip statusu — rozejm pokazuje ILE LAT jeszcze trwa (dawniej nie było czego pokazać:
    // rozejm był stanem terminalnym bez licznika).
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = STATE_COLOR[rel.status ?? 'peace'];
    ctx.textAlign = 'right';
    const truceLeft = rel.truceYearsLeft ?? 0;
    const statusChip = (rel.status === 'truce' && truceLeft > 0)
      ? t('diplo.truceYearsLeft', truceLeft.toFixed(0))
      : t(STATE_KEY[rel.status ?? 'peace']);
    ctx.fillText(`[${statusChip}]`, x + w - pad, y + 22);
    ctx.textAlign = 'left';

    // Pasmo akcji PRZYPIĘTE do dołu panelu + clip treści nad nim. Prawa kolumna NIE MA
    // scrolla (handleScroll obsługuje tylko listę po lewej), a treść potrafi urosnąć
    // (ultimatum + 3 traktaty + pełne rozbiechnie) — bez przypięcia przyciski akcji
    // wypadały poza panel przy 720p i stawały się nieklikalne.
    const btnH = 28;
    const ACTIONS_H = 3 * (btnH + 6) + 8;
    const contentBottom = y + h - ACTIONS_H - 4;

    let iy = y + TAB_H + 20;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y + TAB_H, w, contentBottom - (y + TAB_H));
    ctx.clip();

    // ── Opinia: co ONI myślą o NAS (kierunek, który bramkuje akceptacje) ──
    const opinion = dipl.getOpinionOfPlayer(this._selectedId);
    const band    = dipl.getOpinionBand(this._selectedId);
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('diplo.opinionLabel'), x + pad, iy);
    ctx.font = `bold ${THEME.fontSizeMedium + 6}px ${THEME.fontFamily}`;
    ctx.fillStyle = isContact ? opinionColor(opinion) : THEME.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(isContact ? `${opinion > 0 ? '+' : ''}${Math.round(opinion)}` : MASK, x + w - pad, iy + 6);
    ctx.textAlign = 'left';
    iy += 17;
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = isContact ? (TRUST_STATUS_COLOR[band] ?? THEME.textDim) : THEME.textDim;
    ctx.fillText(isContact ? t(`diplo.status.${band}`) : MASK, x + pad, iy);
    iy += 15;

    // ── Rozbicie opinii — TOP N po |wartości|, ogon zwinięty w jeden wiersz ──
    ctx.font = `bold ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('diplo.opinionBreakdown'), x + pad, iy);
    iy += 14;
    const breakdown = isContact ? dipl.getOpinionBreakdown(this._selectedId, 'player') : [];
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    if (breakdown.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('diplo.none'), x + pad + 4, iy);
      iy += BREAKDOWN_ROW_H;
    } else {
      for (const e of breakdown.slice(0, MAX_BREAKDOWN_ROWS)) {
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(e.label, x + pad + 4, iy);
        ctx.textAlign = 'right';
        ctx.fillStyle = e.value >= 0 ? '#60B090' : '#D85A30';
        ctx.fillText(`${e.value > 0 ? '+' : ''}${Math.round(e.value)}`, x + w - pad - FADE_COL_W, iy);
        ctx.fillStyle = THEME.textDim;
        // Trwałe (stan wojny, aktywny traktat) żyją tak długo jak ich źródło → ∞.
        ctx.fillText(e.yearsLeft === Infinity ? '∞' : t('diplo.fadesIn', Math.max(1, e.yearsLeft).toFixed(0)),
          x + w - pad, iy);
        ctx.textAlign = 'left';
        iy += BREAKDOWN_ROW_H;
      }
      const rest = breakdown.length - MAX_BREAKDOWN_ROWS;
      if (rest > 0) {
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(t('diplo.breakdownMore', String(rest)), x + pad + 4, iy);
        iy += BREAKDOWN_ROW_H;
      }
    }

    // Separator
    iy += 6;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, iy); ctx.lineTo(x + w - pad, iy); ctx.stroke();
    iy += 14;

    // Pasek napięcia (dawna „wrogość") — drabina 40/60/80 na kreskach paska
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('diplo.tensionFull'), x + pad, iy);
    iy += 14;

    const barW = w - pad * 2;
    const barH = 18;
    ctx.fillStyle = 'rgba(60,60,60,0.4)';
    ctx.fillRect(x + pad, iy, barW, barH);
    const hostPct = Math.max(0, Math.min(1, (rel.tension ?? 0) / 100));
    const hColor = rel.tension >= 60 ? '#D85A30' : rel.tension >= 40 ? '#D8A030' : '#60B090';
    ctx.fillStyle = hColor;
    ctx.fillRect(x + pad, iy, Math.round(barW * hostPct), barH);
    // Progi (kreski)
    for (const pct of [40, 60, 80]) {
      const px = x + pad + Math.round(barW * pct / 100);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, iy); ctx.lineTo(px, iy + barH); ctx.stroke();
    }
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(rel.tension ?? 0)} / 100`, x + pad + barW / 2, iy + 13);
    ctx.textAlign = 'left';
    iy += barH + 10;

    // Ultimatum active?
    if (rel.ultimatumStartYear != null) {
      // D2/E6: licznik z fasady (`getUltimatumYearsLeft`), nie z wklejonego literału `3`.
      // Panel trzymał DRUGĄ, niepowiązaną kopię ULTIMATUM_GRACE_YEARS — przestrojenie
      // łaski rozjeżdżało UI z silnikiem bez żadnego sygnału.
      const remaining = dipl.getUltimatumYearsLeft?.(this._selectedId) ?? 0;
      ctx.fillStyle = '#D8A030';
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillText(t('diplo.ultimatumWarn', remaining.toFixed(1)), x + pad, iy + 10);
      iy += 18;
    }

    // Separator
    iy += 6;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, iy); ctx.lineTo(x + w - pad, iy); ctx.stroke();
    iy += 14;

    // Stan AI (FSM) — contact+
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('diplo.aiStance'), x + pad, iy);
    iy += 16;
    const fsmState = emp.fsm?.state ?? 'IDLE';
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    if (isContact) {
      ctx.fillStyle = FSM_COLOR[fsmState] ?? THEME.textDim;
      ctx.fillText(`  ${fsmState}`, x + pad + 4, iy);
    } else {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`  ${MASK}`, x + pad + 4, iy);
    }
    iy += 20;

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, iy); ctx.lineTo(x + w - pad, iy); ctx.stroke();
    iy += 14;

    // Traktaty
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('diplo.treaties'), x + pad, iy);
    iy += 16;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const treaties = rel.treaties ?? [];
    if (treaties.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('diplo.noTreaties'), x + pad + 4, iy);
      iy += 14;
    } else {
      for (const tr of treaties) {
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(t('diplo.treatyItem', tr.id, (tr.signedYear ?? 0).toFixed(0)), x + pad + 4, iy);
        iy += 14;
      }
    }

    // Separator
    iy += 4;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, iy); ctx.lineTo(x + w - pad, iy); ctx.stroke();
    iy += 14;

    // Pamięć relacji (dowody: casus belli, historia dla gracza). Pierścień ma 20 wpisów,
    // panel pokazuje MEMORY_ROWS najnowszych — budżet pionowy prawej kolumny.
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('diplo.memory'), x + pad, iy);
    iy += 16;
    const inc = rel.memory ?? [];
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    if (inc.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('diplo.none'), x + pad + 4, iy);
      iy += 14;
    } else {
      for (const ev of inc.slice(-MEMORY_ROWS).reverse()) {
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(`  [${(ev.year ?? 0).toFixed(0)}] ${ev.type}`, x + pad + 4, iy);
        iy += 14;
      }
    }

    ctx.restore();   // koniec clipu treści — akcje rysujemy POZA nim

    // Akcje — 3 wiersze po 2, PRZYPIĘTE do dołu panelu (patrz ACTIONS_H wyżej)
    iy = y + h - ACTIONS_H + 8;
    const btnW2 = Math.floor((w - pad * 3) / 2);
    const colL = x + pad;
    const colR = x + pad + btnW2 + pad;
    const vMgr = window.KOSMOS?.vesselManager;
    const hasEnvoyVessel = !!vMgr?.getAllVessels?.().find(v => v.status === 'idle' && canDoEnvoy(v));
    const notWar   = rel.status !== 'war';
    const canWar   = notWar && isContact;
    const canPeace = rel.status === 'war' && isContact;
    const canEnvoy = isContact && hasEnvoyVessel;
    // ── D2/E2 — dostępność przycisku pyta SILNIK, nie własną kopię progów ──
    // Dotąd panel trzymał drugi komplet liczb (65/80/80) obok systemowych 60/75/80 —
    // dwie kopie tej samej gałki, już rozjechane: przycisk umowy handlowej bywał
    // wyszarzony przy opinii, którą `proposeTreaty` przyjmował. To był defekt UI
    // (przycisk MYLNIE opisywał stan), nie reguła gry — dlatego prawdą jest 60/75/80
    // z systemu, a panel przestaje mieć własne zdanie.
    //
    // ── D2/E4 — FLIP ODROCZONY W E2: przycisk mówi „da się ZŁOŻYĆ", nie „na pewno przejdzie" ──
    // E2 świadomie zostawił dawny UX (aktywny dopiero, gdy propozycja PRZESZŁABY), bo bez
    // modala odmowy klik kończyłby się ciszą. Modal jest (E4b), więc znika ocena z bramki:
    // klik, który TŁUMACZY (rozbicie: czego zabrakło, o ile, na jak długo obciąża odmowa),
    // uczy gracza dyplomacji — wyszarzony przycisk milczy i wygląda na zepsuty.
    //
    // Szare zostaje WYŁĄCZNIE to, co strukturalnie niemożliwe, nigdy „powiedzieliby nie":
    //   isContact  — nieznanego imperium nie ma do czego zagadnąć (panel i tak maskuje dane),
    //   notWar     — lustro bramki pokoju (`canPeace` wymaga wojny); w czasie wojny trzy
    //                przyciski traktatów tłumaczyłyby to samo („Trwa wojna"), a stan wojny
    //                panel pokazuje jako fakt pierwszej kategorii,
    //   hasTreaty  — traktat już obowiązuje, klik byłby MARTWY (modal pomija `already_signed`).
    //
    // Efekt uboczny, zamierzony: podłoga osobowości (`personality_floor`) staje się PIERWSZY
    // RAZ osiągalna klikiem — xenofag odmawia sojuszu przez naturę i wreszcie to mówi.
    const canPropose = (treatyId) =>
      isContact && notWar && !dipl.hasTreaty(this._selectedId, treatyId);
    const canTrade = canPropose('trade_agreement');
    const canPact  = canPropose('non_aggression');
    const canAlly  = canPropose('alliance');

    // Wiersz 1: wojna / pokój
    this._drawActionButton(ctx, colL, iy, btnW2, btnH, t('diplo.btn.declareWar'), canWar, 'danger');
    if (canWar) this._addHit(colL, iy, btnW2, btnH, 'declare_war', { empireId: this._selectedId });
    this._drawActionButton(ctx, colR, iy, btnW2, btnH, t('diplo.btn.offerPeace'), canPeace, 'primary');
    if (canPeace) this._addHit(colR, iy, btnW2, btnH, 'offer_peace', { empireId: this._selectedId });
    iy += btnH + 6;

    // Wiersz 2: emisariusz / umowa handlowa
    this._drawActionButton(ctx, colL, iy, btnW2, btnH, t('diplo.btn.envoy'), canEnvoy, 'primary');
    if (canEnvoy) this._addHit(colL, iy, btnW2, btnH, 'send_envoy', { empireId: this._selectedId });
    // S3.5b: gdy traktat handlowy AKTYWNY → slot pokazuje toggle auto-handlu cywilnego
    // (przycisk „zaproponuj umowę" byłby i tak martwy). Inaczej: standardowa propozycja.
    if (dipl.hasTreaty(this._selectedId, 'trade_agreement')) {
      const civTrade = window.KOSMOS?.civilianTradeSystem;
      const autoOn = civTrade?.isCrossEmpireTradeEnabled?.(this._selectedId) ?? true;
      const autoLbl = `${t('market.autoTrade')}: ${autoOn ? t('market.on') : t('market.off')}`;
      this._drawActionButton(ctx, colR, iy, btnW2, btnH, autoLbl, true, autoOn ? 'primary' : 'danger');
      this._addHit(colR, iy, btnW2, btnH, 'toggle_auto_trade', { empireId: this._selectedId });
    } else {
      this._drawActionButton(ctx, colR, iy, btnW2, btnH, t('diplo.btn.trade'), canTrade, 'primary');
      if (canTrade) this._addHit(colR, iy, btnW2, btnH, 'propose_trade', { empireId: this._selectedId });
    }
    iy += btnH + 6;

    // Wiersz 3: pakt o nieagresji / sojusz
    this._drawActionButton(ctx, colL, iy, btnW2, btnH, t('diplo.btn.pact'), canPact, 'primary');
    if (canPact) this._addHit(colL, iy, btnW2, btnH, 'propose_pact', { empireId: this._selectedId });
    this._drawActionButton(ctx, colR, iy, btnW2, btnH, t('diplo.btn.alliance'), canAlly, 'primary');
    if (canAlly) this._addHit(colR, iy, btnW2, btnH, 'propose_alliance', { empireId: this._selectedId });

    // S3.4 — flash akcji (banner na dole panelu)
    if (this._flash && Date.now() < this._flash.until) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x + pad, y + h - 30, w - pad * 2, 22);
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = this._flash.color;
      ctx.textAlign = 'center';
      ctx.fillText(this._flash.text, x + w / 2, y + h - 15);
      ctx.textAlign = 'left';
    }
  }

  _drawActionButton(ctx, x, y, w, h, label, enabled, style) {
    const bg = enabled
      ? (style === 'danger' ? 'rgba(216,90,48,0.15)' : 'rgba(0,255,180,0.10)')
      : 'rgba(60,60,60,0.2)';
    const border = enabled
      ? (style === 'danger' ? '#D85A30' : THEME.accent)
      : THEME.border;
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = enabled ? THEME.textPrimary : THEME.textDim;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + 4);
    ctx.textAlign = 'left';
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
      case 'propose_alliance':
        if (dipl) dipl.proposeTreaty(zone.data.empireId, 'alliance');
        break;
    }
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    const { ox, oy, ow, oh } = this._getOverlayBounds(
      Math.round(window.innerWidth / (Math.min(window.innerWidth / 1280, window.innerHeight / 720))),
      Math.round(window.innerHeight / (Math.min(window.innerWidth / 1280, window.innerHeight / 720)))
    );
    if (x < ox || x > ox + ow || y < oy || y > oy + oh) return false;
    if (x < ox + LEFT_W) this._scrollLeft = Math.max(0, this._scrollLeft + delta * 0.5);
    return true;
  }
}
