// WarOverlay — panel Wojny (klawisz W)
//
// 2-kolumnowy: lewa lista aktywnych wojen, prawa szczegóły wybranej wojny
// (casus belli, paski exhaustion, fronty, ostatnie bitwy, przyciski pokoju).

import { BaseOverlay, HEADER_H } from './BaseOverlay.js';
import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { ARCHETYPES } from '../data/EmpireData.js';
import { CASUS_BELLI } from '../data/CasusBelliData.js';
import { clampScroll, scrollThumb, pruneZones } from './InfoPanelLayoutLogic.js';
import { t, getName, getDesc } from '../i18n/i18n.js';

const LEFT_W = 300;
const TAB_H  = HEADER_H;   // pasmo nagłówka = standard (było 32)
const MASK   = '???';

// ── Stół pokoju (WP-4 C1) ───────────────────────────────────────────────────
const ROW_H       = 15;   // wiersz listy ciał
const MARK_RECAP   = '↩';  // zwrot zdobyczy — legenda pod listami (brak miejsca na pełny opis w wierszu)
const MARK_LOCKED  = '🔒'; // ciało domowe — nie podlega negocjacji

export class WarOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._selectedId = null;
    this._scrollLeft = 0;
    this._scrollRight = 0;

    // Warunki na stole — TRANSIENTNE (nie idą do zapisu): zbiór `bodyId` zaznaczonych ciał.
    this._selected = new Set();
    // Cache projekcji i oceny. `getPeaceTable`/`evaluatePeace` czytają świat, więc NIE MOGĄ
    // lecieć z `draw()` (60×/s). Klucz projekcji = wojna + rok gry; klucz oceny = wojna
    // + podpis zaznaczenia. Rok w kluczu łapie dryf świata (podbój w trakcie otwartego panelu).
    this._table = null;    this._tableKey = null;
    this._eval  = null;    this._evalKey  = null;
    // Wysokość treści prawej kolumny z POPRZEDNIEJ klatki — pozwala sklampować scroll
    // PRZED rysowaniem (patrz `_drawRight`). `null` = jeszcze nie rysowano.
    this._contentHRight = null;
  }

  show() {
    super.show();
    const ws = window.KOSMOS?.warSystem;
    if (!this._selectedId && ws) {
      const active = ws.listActive();
      if (active.length > 0) this._selectedId = active[0].id;
    }
    this._tableKey = null;   // otwarcie panelu = świeży odczyt świata
    this._evalKey  = null;
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
  }

  // ── Lewa: lista wojen ──────────────────────────────────────

  _drawLeft(ctx, x, y, w, h) {
    const pad = 12;

    this._drawOverlayHeader(ctx, x, y, w, t('warOverlay.title'));

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
      ctx.fillText(t('warOverlay.noActiveWars'), x + w / 2, listY + 40);
      ctx.fillText(t('warOverlay.declareHint'), x + w / 2, listY + 58);
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
      const statusLabel = war.active ? t('warOverlay.statusActive') : t('warOverlay.statusEnded');
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
      ctx.fillText(getName(cb), x + pad, ry + 44);

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
      ctx.fillText(t('warOverlay.selectWar'), x + w / 2, y + h / 2);
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
    ctx.fillText(t('warOverlay.warVsTitle', emp?.name ?? MASK), x + pad, y + 22);

    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = war.active ? '#D85A30' : THEME.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(war.active ? t('warOverlay.tagActive') : t('warOverlay.tagEnded'), x + w - pad, y + 22);
    ctx.textAlign = 'left';

    // ── Pasmo treści: PRZEWIJANE (F-a, naprawa w tym samym commicie) ────────
    // ⚠ Do C1 `_scrollRight` był ZAPISYWANY przez `handleScroll` i NIGDY nie czytany tutaj,
    //   więc prawa kolumna nie przewijała się wcale (martwe pole + martwa połowa handlera).
    //   Stół dokłada dwie listy ciał, czyli treść, która z założenia NIE MIEŚCI SIĘ w panelu —
    //   bez przewijania byłaby nieosiągalna poza foldem. To warunek konieczny stołu, nie polish.
    const bodyTop = y + TAB_H;
    const bodyH   = Math.max(0, h - TAB_H);
    const zoneStart = this._hitZones.length;

    // Klamp na WEJŚCIU, z wysokości treści zapamiętanej w poprzedniej klatce. Bez tego szybki
    // obrót kółkiem daje jedną klatkę z treścią wyniesioną poza panel (a `pruneZones` zdejmuje
    // wtedy WSZYSTKIE hit-zony — panel na moment przestaje reagować). Pierwsza klatka nowego
    // panelu historii nie ma; dla niej klamp domyka się na końcu tej metody (snap).
    const scroll = this._contentHRight != null
      ? clampScroll(this._scrollRight, this._contentHRight, bodyH)
      : this._scrollRight;
    this._scrollRight = scroll;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, bodyTop, w, bodyH);
    ctx.clip();

    let iy = bodyTop + 20 - scroll;

    // Casus belli
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText('Casus Belli', x + pad, iy);
    iy += 16;
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(getName(cb), x + pad + 4, iy);
    iy += 14;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(getDesc(cb).slice(0, 80), x + pad + 4, iy);
    iy += 18;

    // Data startu
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('warOverlay.declaredYear', (war.startYear ?? 0).toFixed(1)), x + pad + 4, iy);
    iy += 18;

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, iy); ctx.lineTo(x + w - pad, iy); ctx.stroke();
    iy += 14;

    // Exhaustion — 2 paski
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('warOverlay.exhaustionHeader'), x + pad, iy);
    iy += 18;

    const barH = 18;
    const barW = w - pad * 2;
    const pExh = war.exhaustion?.player ?? 0;
    const eExh = war.exhaustion?.[empireId] ?? 0;

    // Gracz
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(t('warOverlay.player'), x + pad, iy);
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
    ctx.fillText(t('warOverlay.battlesHeader', war.battles?.length ?? 0), x + pad, iy);
    iy += 16;

    const battles = (war.battles ?? []).slice(-5).reverse();
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    if (battles.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('  ' + t('warOverlay.noBattlesYet'), x + pad + 4, iy);
      iy += 16;
    } else {
      for (const battleId of battles) {
        const b = window.KOSMOS?.gameState?.get(`battles.${battleId}`);
        if (!b) continue;
        const winner = b.winner === 'A' ? t('warOverlay.sideAlien') : b.winner === 'B' ? t('warOverlay.player') : t('warOverlay.sideDraw');
        const color = b.winner === 'B' ? '#60B090' : b.winner === 'A' ? '#D85A30' : THEME.textDim;
        ctx.fillStyle = color;
        ctx.fillText(`  [${(b.year ?? 0).toFixed(0)}] ${t('warOverlay.winnerLine', winner)}`, x + pad + 4, iy);
        iy += 13;
        ctx.fillStyle = THEME.textDim;
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillText(`      ${t('warOverlay.battleLosses', b.lossesA, b.lossesB, b.turns)}`, x + pad + 4, iy);
        iy += 14;
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      }
    }

    // ── STÓŁ POKOJU (WP-4 C1) ────────────────────────────────────────────────
    if (war.active) iy = this._drawPeaceTable(ctx, x, iy, w, pad, war, empireId);

    // Akcje
    iy += 10;
    const btnW = Math.floor((w - pad * 3) / 2);
    const btnH = 28;
    if (war.active) {
      // Propose peace — od C1 niesie WARUNKI ze stołu (pusty stół ⇒ `terms === null`).
      this._drawActionButton(ctx, x + pad, iy, btnW, btnH, t('warOverlay.btnProposePeace'), true, 'primary');
      this._addHit(x + pad, iy, btnW, btnH, 'offer_peace', { empireId });

      // Debug: wymuszone starcie (dev tool)
      this._drawActionButton(ctx, x + pad + btnW + pad, iy, btnW, btnH, t('warOverlay.btnForceBattle'), true, 'danger');
      this._addHit(x + pad + btnW + pad, iy, btnW, btnH, 'force_battle', { warId: war.id, empireId });

      // Debug: wymuszone lądowanie (skip space battle)
      iy += btnH + 8;
      const fullBtnW = w - pad * 2;
      this._drawActionButton(ctx, x + pad, iy, fullBtnW, btnH, t('warOverlay.btnForceInvasion'), true, 'danger');
      this._addHit(x + pad, iy, fullBtnW, btnH, 'force_invasion', { warId: war.id, empireId });
      iy += btnH;
    }

    // ── Domknięcie pasma przewijanego ────────────────────────────────────────
    const contentH = (iy + scroll) - bodyTop + 12;
    ctx.restore();

    // Klamp DOPIERO TERAZ: wysokość treści znamy po jej narysowaniu (wzór `drawScrollBox` —
    // dolny klamp w `handleScroll`, górny tutaj). Hit-zony poza pasmem ZDEJMUJEMY, inaczej
    // przewinięty wiersz zostawiłby klikalny cień nad nagłówkiem.
    this._contentHRight = contentH;
    this._scrollRight = clampScroll(scroll, contentH, bodyH);
    pruneZones(this._hitZones, zoneStart, bodyTop, bodyTop + bodyH);

    const thumb = scrollThumb(this._scrollRight, contentH, bodyH, bodyTop);
    if (thumb) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x + w - 5, thumb.y, 3, thumb.h);
    }

    // ⚠ ABSORBER OSTATNI. `BaseOverlay._hitTest` to `.find()` ⇒ PIERWSZY dopasowany wygrywa,
    //   więc tło dodane wcześniej pochłonęłoby kliki wierszy stołu i przycisków (gotcha S4-1).
    this._addHit(x, bodyTop, w, bodyH, 'peace_bg');
  }

  // ── Stół pokoju ─────────────────────────────────────────────────────────────

  /**
   * Dwie listy ciał (ŻĄDAM od nich / OFERUJĘ swoje) + pasek sufitu + ważność warunków.
   * Zwraca nowe `iy` (dół stołu), bo cała prawa kolumna jest jednym strumieniem treści.
   *
   * ⚠ ZERO WYCENY TUTAJ: liczby przychodzą z `DiplomacySystem.getPeaceTable` (P14 — panel nie
   *   importuje silnika). Panel decyduje wyłącznie o UKŁADZIE i o tym, co zaznaczone.
   */
  _drawPeaceTable(ctx, x, iy, w, pad, war, empireId) {
    const table = this._ensureTable(war, empireId);

    iy += 8;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, iy); ctx.lineTo(x + w - pad, iy); ctx.stroke();
    iy += 16;

    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('peaceTable.title'), x + pad, iy);
    iy += 16;

    const colW  = Math.floor((w - pad * 2 - 14) / 2);
    const leftX = x + pad;
    const rightX = x + pad + colW + 14;

    ctx.font = `bold ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('peaceTable.demand'), leftX, iy);
    ctx.fillText(t('peaceTable.offer'), rightX, iy);
    iy += 14;

    const n = Math.max(table.demand.length, table.offer.length);
    if (n === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('peaceTable.empty'), leftX, iy);
      return iy + 16;
    }

    let anyRecap = false, anyLocked = false;
    for (let i = 0; i < n; i++) {
      const ry = iy + i * ROW_H;
      if (this._drawTableRow(ctx, table.demand[i], leftX, ry, colW, empireId, false)) anyRecap = true;
      if (this._drawTableRow(ctx, table.offer[i],  rightX, ry, colW, empireId, true))  anyRecap = true;
      if (table.demand[i]?.capital || table.offer[i]?.capital) anyLocked = true;
    }
    iy += n * ROW_H + 6;

    // Legenda znaczników — pełne brzmienia nie mieszczą się w wierszu listy.
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    if (anyRecap)  { ctx.fillText(`${MARK_RECAP} ${t('peaceTable.recaptured')}`, leftX, iy); iy += 12; }
    if (anyLocked) { ctx.fillText(`${MARK_LOCKED} ${t('peaceTable.capitalLocked')}`, leftX, iy); iy += 12; }

    // Żądanie vs sufit (lewa kolumna) + wartość oferty (prawa).
    const demandSum = table.demand
      .filter(r => r.countsToCeiling && this._selected.has(r.bodyId))
      .reduce((s, r) => s + (r.devValue ?? 0), 0);
    const offerSum = table.offer
      .filter(r => this._selected.has(r.bodyId))
      .reduce((s, r) => s + (r.devValue ?? 0), 0);
    const ceiling = table.ceiling;
    const over = ceiling != null && demandSum > ceiling + 1e-9;

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = over ? '#D85A30' : THEME.textPrimary;
    ctx.fillText(t('peaceTable.ceiling', this._fmtVal(demandSum), this._fmtVal(ceiling)), leftX, iy);
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(t('peaceTable.devValue', this._fmtVal(offerSum)), rightX, iy);
    iy += 14;

    // Ważność warunków (D-WP-15 = wariant b): powód odmowy TAK, rozbicie NIE — rozbicie
    // zostaje nagrodą za realną odmowę (modal `DiplomacyRefusalModal`).
    const ev = this._ensureEval(war, empireId);
    if (ev?.blocked) {
      ctx.fillStyle = '#D85A30';
      ctx.fillText(`✗ ${t(ev.reasonKey ?? 'diploRefusal.unknownReason')}`, leftX, iy);
      iy += 14;
    } else if (over) {
      ctx.fillStyle = '#D85A30';
      ctx.fillText(`✗ ${t('peaceTable.ceilingExceeded')}`, leftX, iy);
      iy += 14;
    }

    // Wyczyść stół + podpowiedź
    if (this._selected.size > 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.accent;
      const label = `✕ ${t('peaceTable.clear')}`;
      ctx.fillText(label, leftX, iy);
      this._addHit(leftX, iy - 11, ctx.measureText(label).width + 6, 15, 'peace_clear');
    } else {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('peaceTable.hint'), leftX, iy);
    }
    return iy + 6;
  }

  /** Jeden wiersz listy. Zwraca `true`, gdy wiersz jest zwrotem zdobyczy (do legendy). */
  _drawTableRow(ctx, row, rx, ry, colW, empireId, isOffer) {
    if (!row) return false;
    const locked = row.capital === true;
    const sel    = this._selected.has(row.bodyId);

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = locked ? THEME.textDim : (sel ? THEME.accent : THEME.textPrimary);
    const box   = locked ? '·' : (sel ? '✓' : ' ');
    const marks = (row.recaptured ? ' ' + MARK_RECAP : '') + (locked ? ' ' + MARK_LOCKED : '');
    const maxName = Math.max(6, Math.floor((colW - 58) / 6));
    const name  = String(row.name ?? row.bodyId).slice(0, maxName);
    ctx.fillText(`[${box}] ${name}${marks}`, rx, ry);

    ctx.textAlign = 'right';
    ctx.fillStyle = row.recaptured ? '#60B090' : THEME.textDim;
    ctx.fillText(this._fmtVal(row.devValue), rx + colW, ry);
    ctx.textAlign = 'left';

    // Hit-zona TYLKO dla wierszy klikalnych — ciało domowe nie jest na stole, więc nie
    // udajemy, że da się je kliknąć (blokadę i tak wystawiłby silnik: `capitalNotNegotiable`).
    if (!locked) {
      this._addHit(rx, ry - 11, colW, ROW_H, 'peace_toggle', { bodyId: row.bodyId, isOffer, empireId });
    }
    return row.recaptured === true;
  }

  _fmtVal(v) {
    if (v == null) return '—';
    const n = Number(v) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  /** Projekcja stołu — cache po (wojna, rok gry). NIGDY nie liczona per klatkę. */
  _ensureTable(war, empireId) {
    const year = Math.floor(window.KOSMOS?.timeSystem?.gameTime ?? 0);
    const key  = `${war?.id}|${year}`;
    if (this._tableKey !== key || !this._table) {
      this._table = window.KOSMOS?.diplomacySystem?.getPeaceTable?.(empireId)
        ?? { demand: [], offer: [], heldValue: null, ceiling: null };
      this._tableKey = key;
      // Zaznaczenie mogło wskazywać ciało, które właśnie zmieniło ręce — zdejmujemy sieroty.
      if (this._selected.size > 0) {
        const live = new Set([...this._table.demand, ...this._table.offer].map(r => r.bodyId));
        for (const id of [...this._selected]) if (!live.has(id)) this._selected.delete(id);
      }
    }
    return this._table;
  }

  /** Ocena aktualnego zestawu warunków — cache po (wojna, podpis zaznaczenia). */
  _ensureEval(war, empireId) {
    const sig = [...this._selected].sort().join(',');
    const key = `${war?.id}|${sig}`;
    if (this._evalKey !== key) {
      const terms = this._buildTerms();
      this._eval = window.KOSMOS?.diplomacySystem?.evaluatePeace?.(empireId, terms) ?? null;
      this._evalKey = key;
    }
    return this._eval;
  }

  /**
   * Warunki z zaznaczenia. PUSTY STÓŁ ⇒ `null`, nie `{ cessions: [] }`.
   *
   * ⚠ To nie jest kosmetyka: `null` jest dosłownie dzisiejszym wywołaniem `offerPeace`
   *   (regresja zero), a `_buildTermsContext` nie wykonuje wtedy ANI JEDNEGO odczytu świata.
   * ⚠ KIERUNEK wypełnia panel — silnik go NIE zgaduje (`territorial_terms`: cesja bez stron
   *   nie liczy się do żadnej strony, więc pomyłka wołającego byłaby cichą zmianą ceny pokoju).
   */
  _buildTerms() {
    if (this._selected.size === 0 || !this._table) return null;
    const empireId = this._empireOfWar();
    if (!empireId) return null;
    const cessions = [];
    for (const r of this._table.demand) {
      if (this._selected.has(r.bodyId)) cessions.push({ bodyId: r.bodyId, fromEmpireId: empireId, toEmpireId: 'player' });
    }
    for (const r of this._table.offer) {
      if (this._selected.has(r.bodyId)) cessions.push({ bodyId: r.bodyId, fromEmpireId: 'player', toEmpireId: empireId });
    }
    return cessions.length > 0 ? { cessions } : null;
  }

  /** Imperium wybranej wojny (druga strona pary — fasady są gracz-centryczne). */
  _empireOfWar() {
    const war = this._selectedId ? window.KOSMOS?.warSystem?.getWar(this._selectedId) : null;
    if (!war) return null;
    return war.aggressor === 'player' ? war.defender : war.aggressor;
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
        // Zmiana wojny czyści stół: warunki dotyczą KONKRETNEJ pary, a nie panelu.
        if (this._selectedId !== zone.data.warId) {
          this._selected.clear();
          this._tableKey = null;
          this._evalKey = null;
          this._scrollRight = 0;
        }
        this._selectedId = zone.data.warId;
        break;
      case 'peace_toggle': {
        const id = zone.data?.bodyId;
        if (!id) break;
        if (this._selected.has(id)) this._selected.delete(id);
        else this._selected.add(id);
        this._evalKey = null;    // zmiana zaznaczenia = ponowna ocena (D-WP-15b)
        break;
      }
      case 'peace_clear':
        this._selected.clear();
        this._evalKey = null;
        break;
      case 'peace_bg':
        // Absorber tła stołu — świadomy no-op: zatrzymuje klik w panelu, żeby nie leciał
        // do mapy 3D pod overlayem (`handleClick` zwraca true na każdym trafieniu).
        break;
      case 'offer_peace':
        // WP-4 C1 — propozycja niesie WARUNKI ze stołu. Pusty stół ⇒ `terms === null`,
        // czyli dosłownie wywołanie sprzed tego slice'u.
        if (dipl) dipl.offerPeace(zone.data.empireId, 'player_war_panel', { terms: this._buildTerms() });
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
