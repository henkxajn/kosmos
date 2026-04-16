// WarOverlay — panel Wojny (klawisz W)
//
// 2-kolumnowy: lewa lista aktywnych wojen, prawa szczegóły wybranej wojny
// (casus belli, paski exhaustion, fronty, ostatnie bitwy, przyciski pokoju).

import { BaseOverlay } from './BaseOverlay.js';
import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import { ARCHETYPES } from '../data/EmpireData.js';
import { CASUS_BELLI } from '../data/CasusBelliData.js';

const LEFT_W = 300;
const TAB_H  = 32;
const MASK   = '???';

export class WarOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._selectedId = null;
    this._scrollLeft = 0;
    this._scrollRight = 0;
  }

  show() {
    super.show();
    const ws = window.KOSMOS?.warSystem;
    if (!this._selectedId && ws) {
      const active = ws.listActive();
      if (active.length > 0) this._selectedId = active[0].id;
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
  }

  // ── Lewa: lista wojen ──────────────────────────────────────

  _drawLeft(ctx, x, y, w, h) {
    const pad = 12;

    ctx.fillStyle = bgAlpha(0.50);
    ctx.fillRect(x, y, w, TAB_H);
    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText('⚔ WOJNY', x + pad, y + 20);

    const ws = window.KOSMOS?.warSystem;
    const reg = window.KOSMOS?.empireRegistry;
    if (!ws) return;

    const active = ws.listAll().sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (b.startYear ?? 0) - (a.startYear ?? 0);
    });

    const listY = y + TAB_H;
    const listH = h - TAB_H;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listY, w, listH);
    ctx.clip();

    if (active.length === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText('Nie prowadzisz aktywnych wojen.', x + w / 2, listY + 40);
      ctx.fillText('Wypowiedz wojnę z panelu Dyplomacji (Y).', x + w / 2, listY + 58);
      ctx.textAlign = 'left';
      ctx.restore();
      return;
    }

    let ry = listY + 6 - this._scrollLeft;

    for (const war of active) {
      const rowH = 60;
      if (ry + rowH < listY) { ry += rowH; continue; }
      if (ry > listY + listH) break;

      const isSel = this._selectedId === war.id;
      const empireId = war.aggressor === 'player' ? war.defender : war.aggressor;
      const emp = reg?.get(empireId);
      const arch = emp ? ARCHETYPES[emp.archetype] : null;
      const cb = CASUS_BELLI[war.casusBelli] ?? CASUS_BELLI.border_incident;

      if (isSel) {
        ctx.fillStyle = 'rgba(255,90,48,0.10)';
        ctx.fillRect(x + 4, ry, w - 8, rowH - 2);
        ctx.strokeStyle = '#D85A30';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 4.5, ry + 0.5, w - 9, rowH - 3);
      }

      // Status
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const statusLabel = war.active ? '⚔ AKTYWNA' : '☮ ZAKOŃCZONA';
      const statusColor = war.active ? '#D85A30' : THEME.textDim;
      ctx.fillStyle = statusColor;
      ctx.fillText(statusLabel, x + pad, ry + 14);

      // Przeciwnik
      ctx.font = `bold ${THEME.fontSizeSmall + 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = arch?.color ?? THEME.textPrimary;
      const oppName = emp?.name ?? MASK;
      ctx.fillText(`vs ${oppName}`.slice(0, 26), x + pad, ry + 30);

      // Casus belli
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(cb.namePL, x + pad, ry + 44);

      // Exhaustion bars mini (player | empireId)
      const pExh = war.exhaustion?.player ?? 0;
      const eExh = war.exhaustion?.[empireId] ?? 0;
      const barW = (w - pad * 2 - 10) / 2;
      const barH = 4;
      const barY = ry + 50;
      ctx.fillStyle = 'rgba(60,60,60,0.5)';
      ctx.fillRect(x + pad, barY, barW, barH);
      ctx.fillStyle = '#60B090';
      ctx.fillRect(x + pad, barY, Math.round(barW * pExh / 100), barH);
      ctx.fillStyle = 'rgba(60,60,60,0.5)';
      ctx.fillRect(x + pad + barW + 10, barY, barW, barH);
      ctx.fillStyle = '#D85A30';
      ctx.fillRect(x + pad + barW + 10, barY, Math.round(barW * eExh / 100), barH);

      this._addHit(x + 4, ry, w - 8, rowH - 2, 'select', { warId: war.id });
      ry += rowH;
    }

    ctx.restore();
  }

  // ── Prawa: szczegóły ───────────────────────────────────────

  _drawRight(ctx, x, y, w, h) {
    const pad = 18;

    ctx.fillStyle = bgAlpha(0.45);
    ctx.fillRect(x, y, w, TAB_H);

    const ws = window.KOSMOS?.warSystem;
    const reg = window.KOSMOS?.empireRegistry;
    const war = this._selectedId ? ws?.getWar(this._selectedId) : null;

    if (!war) {
      ctx.font = `${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText('Wybierz wojnę z listy', x + w / 2, y + h / 2);
      ctx.textAlign = 'left';
      return;
    }

    const empireId = war.aggressor === 'player' ? war.defender : war.aggressor;
    const emp = reg?.get(empireId);
    const arch = emp ? ARCHETYPES[emp.archetype] : null;
    const cb = CASUS_BELLI[war.casusBelli] ?? CASUS_BELLI.border_incident;

    // Nagłówek
    ctx.font = `bold ${THEME.fontSizeMedium + 2}px ${THEME.fontFamily}`;
    ctx.fillStyle = arch?.color ?? THEME.textPrimary;
    ctx.fillText(`⚔ WOJNA vs ${emp?.name ?? MASK}`, x + pad, y + 22);

    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = war.active ? '#D85A30' : THEME.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(war.active ? '[AKTYWNA]' : '[ZAKOŃCZONA]', x + w - pad, y + 22);
    ctx.textAlign = 'left';

    let iy = y + TAB_H + 20;

    // Casus belli
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText('Casus Belli', x + pad, iy);
    iy += 16;
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(cb.namePL, x + pad + 4, iy);
    iy += 14;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(cb.descPL.slice(0, 80), x + pad + 4, iy);
    iy += 18;

    // Data startu
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(`Wypowiedziana: rok ${(war.startYear ?? 0).toFixed(1)}`, x + pad + 4, iy);
    iy += 18;

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, iy); ctx.lineTo(x + w - pad, iy); ctx.stroke();
    iy += 14;

    // Exhaustion — 2 paski
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText('Wyczerpanie wojenne', x + pad, iy);
    iy += 18;

    const barH = 18;
    const barW = w - pad * 2;
    const pExh = war.exhaustion?.player ?? 0;
    const eExh = war.exhaustion?.[empireId] ?? 0;

    // Gracz
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText('Gracz', x + pad, iy);
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(pExh)}/100`, x + w - pad, iy);
    ctx.textAlign = 'left';
    iy += 4;
    ctx.fillStyle = 'rgba(60,60,60,0.4)';
    ctx.fillRect(x + pad, iy, barW, barH);
    ctx.fillStyle = pExh >= 70 ? '#D85A30' : pExh >= 40 ? '#D8A030' : '#60B090';
    ctx.fillRect(x + pad, iy, Math.round(barW * pExh / 100), barH);
    iy += barH + 10;

    // Obcy
    ctx.fillStyle = arch?.color ?? THEME.textPrimary;
    ctx.fillText(emp?.name ?? MASK, x + pad, iy);
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(eExh)}/100`, x + w - pad, iy);
    ctx.textAlign = 'left';
    iy += 4;
    ctx.fillStyle = 'rgba(60,60,60,0.4)';
    ctx.fillRect(x + pad, iy, barW, barH);
    ctx.fillStyle = eExh >= 70 ? '#D85A30' : eExh >= 40 ? '#D8A030' : '#60B090';
    ctx.fillRect(x + pad, iy, Math.round(barW * eExh / 100), barH);
    iy += barH + 14;

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, iy); ctx.lineTo(x + w - pad, iy); ctx.stroke();
    iy += 14;

    // Ostatnie bitwy
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(`Bitwy (${war.battles?.length ?? 0})`, x + pad, iy);
    iy += 16;

    const battles = (war.battles ?? []).slice(-5).reverse();
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    if (battles.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('  (brak starć — flota obca jeszcze nie dotarła)', x + pad + 4, iy);
      iy += 16;
    } else {
      for (const battleId of battles) {
        const b = window.KOSMOS?.gameState?.get(`battles.${battleId}`);
        if (!b) continue;
        const winner = b.winner === 'A' ? 'Obcy' : b.winner === 'B' ? 'Gracz' : 'Remis';
        const color = b.winner === 'B' ? '#60B090' : b.winner === 'A' ? '#D85A30' : THEME.textDim;
        ctx.fillStyle = color;
        ctx.fillText(`  [${(b.year ?? 0).toFixed(0)}] Zwycięzca: ${winner}`, x + pad + 4, iy);
        iy += 13;
        ctx.fillStyle = THEME.textDim;
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillText(`      Straty: obcy ${b.lossesA}, gracz ${b.lossesB} (tur: ${b.turns})`, x + pad + 4, iy);
        iy += 14;
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      }
    }

    // Akcje
    iy += 10;
    const btnW = Math.floor((w - pad * 3) / 2);
    const btnH = 28;
    if (war.active) {
      // Propose peace
      this._drawActionButton(ctx, x + pad, iy, btnW, btnH, '☮ ZAPROPONUJ POKÓJ', true, 'primary');
      this._addHit(x + pad, iy, btnW, btnH, 'offer_peace', { empireId });

      // Debug: wymuszone starcie (dev tool)
      this._drawActionButton(ctx, x + pad + btnW + pad, iy, btnW, btnH, '⚡ WYMUŚ STARCIE (debug)', true, 'danger');
      this._addHit(x + pad + btnW + pad, iy, btnW, btnH, 'force_battle', { warId: war.id, empireId });

      // Debug: wymuszone lądowanie (skip space battle)
      iy += btnH + 8;
      const fullBtnW = w - pad * 2;
      this._drawActionButton(ctx, x + pad, iy, fullBtnW, btnH, '🪖 WYMUŚ DESANT (debug — pomija bitwę kosmiczną)', true, 'danger');
      this._addHit(x + pad, iy, fullBtnW, btnH, 'force_invasion', { warId: war.id, empireId });
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

  // ── Obsługa ─────────────────────────────────────────────────

  _onHit(zone) {
    const dipl = window.KOSMOS?.diplomacySystem;
    const ws = window.KOSMOS?.warSystem;
    const reg = window.KOSMOS?.empireRegistry;

    switch (zone.type) {
      case 'close':
        this.hide();
        break;
      case 'select':
        this._selectedId = zone.data.warId;
        break;
      case 'offer_peace':
        if (dipl) dipl.offerPeace(zone.data.empireId, 'player_war_panel');
        break;
      case 'force_battle': {
        // Debug: rozstrzygnij bitwę natychmiast (niezależnie od tick/pauzy)
        if (!ws) break;
        const res = ws.forceBattle(zone.data.warId);
        if (!res.success) {
          console.warn('[WarOverlay] Force battle failed:', res.reason);
        } else {
          console.log('[WarOverlay] Bitwa rozstrzygnięta:',
            `zwycięzca=${res.result.winner}, straty obcy=${res.result.lossesA}, straty gracz=${res.result.lossesB}`);
        }
        break;
      }
      case 'force_invasion': {
        // Debug: od razu desantuj wrogie jednostki na planecie gracza (pomija bitwę kosmiczną)
        const invSys = window.KOSMOS?.invasionSystem;
        const homePlanet = window.KOSMOS?.homePlanet;
        if (!invSys || !homePlanet) {
          console.warn('[WarOverlay] Force invasion: brak invasionSystem lub homePlanet');
          break;
        }
        const result = invSys.launchInvasion(zone.data.empireId, homePlanet.id, 3);
        if (!result.success) {
          console.warn('[WarOverlay] Force invasion failed:', result.reason);
        } else {
          console.log('[WarOverlay] Desant wykonany:', result.landed.length, 'jednostek');
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
    if (x < ox + LEFT_W) this._scrollLeft = Math.max(0, this._scrollLeft + delta * 0.5);
    else this._scrollRight = Math.max(0, this._scrollRight + delta * 0.5);
    return true;
  }
}
