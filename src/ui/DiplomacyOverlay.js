// DiplomacyOverlay — panel Dyplomacji (klawisz Y)
//
// 2-kolumnowy: lewa lista imperiów (tylko intel >= contact widoczne z nazwą,
// rumor jako "???" z szarym paskiem), prawa szczegóły zaznaczonej relacji.

import { BaseOverlay } from './BaseOverlay.js';
import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import { ARCHETYPES } from '../data/EmpireData.js';
import EventBus from '../core/EventBus.js';
import { t } from '../i18n/i18n.js';
import { canDoEnvoy, hasWeapons } from '../entities/Vessel.js';

const LEFT_W = 300;
const TAB_H  = 32;

const STATE_LABEL_PL = {
  peace:    'POKÓJ',
  truce:    'ROZEJM',
  war:      'WOJNA',
  alliance: 'SOJUSZ',
};
const STATE_COLOR = {
  peace:    '#60B090',
  truce:    '#B0A050',
  war:      '#D85A30',
  alliance: '#50C0E0',
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
      const visible = dipl.listAll().find(r => intelSys.isAtLeast(r.empireId, 'rumor'));
      if (visible) this._selectedId = visible.empireId;
    }
  }

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];
    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);

    ctx.fillStyle = bgAlpha(0.40);
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = GLASS_BORDER;
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

    ctx.fillStyle = bgAlpha(0.50);
    ctx.fillRect(x, y, w, TAB_H);
    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText('🤝 DYPLOMACJA', x + pad, y + 20);

    const dipl = window.KOSMOS?.diplomacySystem;
    const intelSys = window.KOSMOS?.intelSystem;
    const reg = window.KOSMOS?.empireRegistry;
    if (!dipl || !reg) return;

    // Tylko imperia o intel >= rumor
    const entries = dipl.listAll()
      .filter(r => !intelSys || intelSys.isAtLeast(r.empireId, 'rumor'))
      .sort((a, b) => (b.hostility ?? 0) - (a.hostility ?? 0));

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
      ctx.fillText('Nie znamy jeszcze żadnych', x + w / 2, listY + 40);
      ctx.fillText('obcych cywilizacji.', x + w / 2, listY + 58);
      ctx.fillText('Zbuduj obserwatorium (O)', x + w / 2, listY + 80);
      ctx.fillText('lub wyślij statek rozpoznawczy.', x + w / 2, listY + 96);
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
      const stateLabel = STATE_LABEL_PL[rel.state ?? 'peace'] ?? '?';
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = STATE_COLOR[rel.state ?? 'peace'];
      ctx.textAlign = 'right';
      ctx.fillText(stateLabel, x + w - pad, ry + 16);
      ctx.textAlign = 'left';

      // Pasek hostility
      const barY = ry + 24;
      const barW = w - pad * 2 - 20;
      const barH = 5;
      ctx.fillStyle = 'rgba(60,60,60,0.5)';
      ctx.fillRect(x + pad, barY, barW, barH);
      const hostPct = Math.max(0, Math.min(1, (rel.hostility ?? 0) / 100));
      const hColor = rel.hostility >= 60 ? '#D85A30' : rel.hostility >= 40 ? '#D8A030' : '#60B090';
      ctx.fillStyle = hColor;
      ctx.fillRect(x + pad, barY, Math.round(barW * hostPct), barH);

      // Liczbowy hostility z prawej
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(rel.hostility ?? 0)}`, x + w - pad, barY + 5);
      ctx.textAlign = 'left';

      // Etykieta "Hostility" + FSM (stan AI)
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('wrogość', x + pad, barY + 16);
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
      ctx.fillText('Wybierz imperium z listy', x + w / 2, y + h / 2);
      ctx.textAlign = 'left';
      return;
    }

    const rel = dipl.getRelation(this._selectedId);
    const emp = reg?.get(this._selectedId);
    if (!rel || !emp) return;

    const intelLvl = intelSys?.getLevel(this._selectedId) ?? 'unknown';
    const isContact = LEVEL_RANK[intelLvl] >= LEVEL_RANK.contact;
    const arch = ARCHETYPES[emp.archetype];

    // Nagłówek
    ctx.font = `bold ${THEME.fontSizeMedium + 2}px ${THEME.fontFamily}`;
    ctx.fillStyle = isContact ? (arch?.color ?? THEME.textPrimary) : THEME.textDim;
    ctx.fillText(`⚑ ${isContact ? emp.name : MASK}`, x + pad, y + 22);

    // Badge stanu
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = STATE_COLOR[rel.state ?? 'peace'];
    ctx.textAlign = 'right';
    ctx.fillText(`[${STATE_LABEL_PL[rel.state ?? 'peace']}]`, x + w - pad, y + 22);
    ctx.textAlign = 'left';

    let iy = y + TAB_H + 20;

    // Pasek hostility (duży)
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText('Wrogość (Hostility)', x + pad, iy);
    iy += 14;

    const barW = w - pad * 2;
    const barH = 18;
    ctx.fillStyle = 'rgba(60,60,60,0.4)';
    ctx.fillRect(x + pad, iy, barW, barH);
    const hostPct = Math.max(0, Math.min(1, (rel.hostility ?? 0) / 100));
    const hColor = rel.hostility >= 60 ? '#D85A30' : rel.hostility >= 40 ? '#D8A030' : '#60B090';
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
    ctx.fillText(`${Math.round(rel.hostility ?? 0)} / 100`, x + pad + barW / 2, iy + 13);
    ctx.textAlign = 'left';
    iy += barH + 6;

    // Legenda progów
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('40 ostrzeżenie · 60 ultimatum · 80 wojna', x + pad, iy + 10);
    iy += 20;

    // ── S3.4 — Pasek zaufania (Trust, display −10..+10) ──
    const trust  = dipl.getTrust(this._selectedId);
    const status = dipl.getTrustStatus(this._selectedId);
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('diplo.trustLabel'), x + pad, iy);
    ctx.fillStyle = TRUST_STATUS_COLOR[status] ?? THEME.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(t(`diplo.status.${status}`), x + w - pad, iy);
    ctx.textAlign = 'left';
    iy += 14;
    const tBarW = w - pad * 2;
    const tBarH = 16;
    const midX = x + pad + tBarW / 2;
    ctx.fillStyle = 'rgba(60,60,60,0.4)';
    ctx.fillRect(x + pad, iy, tBarW, tBarH);
    // wypełnienie od środka: w prawo (pozytyw) lub w lewo (negatyw)
    const trustPct = Math.max(0, Math.min(1, trust / 100));
    ctx.fillStyle = TRUST_STATUS_COLOR[status] ?? '#888';
    if (trust >= 50) {
      ctx.fillRect(midX, iy, Math.round(tBarW * (trustPct - 0.5)), tBarH);
    } else {
      const wNeg = Math.round(tBarW * (0.5 - trustPct));
      ctx.fillRect(midX - wNeg, iy, wNeg, tBarH);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(midX, iy); ctx.lineTo(midX, iy + tBarH); ctx.stroke();
    const disp = (trust - 50) / 5;
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.textAlign = 'center';
    ctx.fillText(`${disp > 0 ? '+' : ''}${disp.toFixed(1)}`, midX, iy + 12);
    ctx.textAlign = 'left';
    iy += tBarH + 10;

    // Ultimatum active?
    if (rel.ultimatumStartYear != null) {
      const year = window.KOSMOS?.timeSystem?.gameTime ?? 0;
      const elapsed = year - rel.ultimatumStartYear;
      const remaining = Math.max(0, 3 - elapsed);
      ctx.fillStyle = '#D8A030';
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillText(`⚠ ULTIMATUM — ${remaining.toFixed(1)} lat do wojny`, x + pad, iy + 10);
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
    ctx.fillText('Postawa AI', x + pad, iy);
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
    ctx.fillText('Traktaty', x + pad, iy);
    iy += 16;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const treaties = rel.treaties ?? [];
    if (treaties.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('  (brak umów)', x + pad + 4, iy);
      iy += 14;
    } else {
      for (const tr of treaties) {
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(`  • ${tr.id} (od ${(tr.signedYear ?? 0).toFixed(0)})`, x + pad + 4, iy);
        iy += 14;
      }
    }

    // Separator
    iy += 4;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, iy); ctx.lineTo(x + w - pad, iy); ctx.stroke();
    iy += 14;

    // Ostatnie incydenty
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText('Ostatnie incydenty', x + pad, iy);
    iy += 16;
    const inc = rel.lastIncidents ?? [];
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    if (inc.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('  (brak)', x + pad + 4, iy);
      iy += 14;
    } else {
      for (const ev of inc.slice(-4).reverse()) {
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(`  [${(ev.year ?? 0).toFixed(0)}] ${ev.type}`, x + pad + 4, iy);
        iy += 14;
      }
    }

    // Akcje — 3 wiersze po 2 (BUG5c: czytelne etykiety, 4. przycisk = sojusz)
    iy += 8;
    const btnH = 28;
    const btnW2 = Math.floor((w - pad * 3) / 2);
    const colL = x + pad;
    const colR = x + pad + btnW2 + pad;
    const vMgr = window.KOSMOS?.vesselManager;
    const hasEnvoyVessel = !!vMgr?.getAllVessels?.().find(v => v.status === 'idle' && canDoEnvoy(v));
    const notWar   = rel.state !== 'war';
    const canWar   = notWar && isContact;
    const canPeace = rel.state === 'war' && isContact;
    const canEnvoy = isContact && hasEnvoyVessel;
    const canTrade = isContact && notWar && trust >= 65 && !dipl.hasTreaty(this._selectedId, 'trade_agreement');
    const canPact  = isContact && notWar && trust >= 80 && !dipl.hasTreaty(this._selectedId, 'non_aggression');
    const canAlly  = isContact && notWar && trust >= 80 && !dipl.hasTreaty(this._selectedId, 'alliance');

    // Wiersz 1: wojna / pokój
    this._drawActionButton(ctx, colL, iy, btnW2, btnH, '⚔ WYPOWIEDZ WOJNĘ', canWar, 'danger');
    if (canWar) this._addHit(colL, iy, btnW2, btnH, 'declare_war', { empireId: this._selectedId });
    this._drawActionButton(ctx, colR, iy, btnW2, btnH, '☮ ZAPROPONUJ POKÓJ', canPeace, 'primary');
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
