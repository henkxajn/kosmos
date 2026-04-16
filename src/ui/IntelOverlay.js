// IntelOverlay — panel Wywiadu (klawisz I)
//
// Pełnoekranowy overlay z listą obcych imperiów w mgle wojny.
// Lewa kolumna — lista imperiów (kolor archetypu lub szary dla nieznanych).
// Prawa kolumna — panel szczegółów zaznaczonego imperium (dane gated po intel.level).

import { BaseOverlay }   from './BaseOverlay.js';
import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import { ARCHETYPES }     from '../data/EmpireData.js';
import EventBus           from '../core/EventBus.js';

const LEFT_W = 280;
const TAB_H  = 32;

const LEVEL_LABEL_PL = {
  unknown:  'NIEZNANE',
  rumor:    'POGŁOSKI',
  contact:  'KONTAKT',
  detailed: 'SZCZEGÓŁY',
};
const LEVEL_COLOR = {
  unknown:  '#666',
  rumor:    '#AA9050',
  contact:  '#60B090',
  detailed: '#50C0E0',
};
const LEVEL_RANK = { unknown: 0, rumor: 1, contact: 2, detailed: 3 };
const MASK = '???';

export class IntelOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._selectedId = null;
    this._scrollLeft = 0;

    // Live refresh — każda zmiana intel odświeża overlay
    EventBus.on('intel:levelChanged', () => {});   // force re-render w kolejnym tick
    EventBus.on('empire:created', () => {});
  }

  show() {
    super.show();
    // Jeśli nie wybrano — zaznacz pierwsze "znane" (rumor+)
    const intel = window.KOSMOS?.gameState?.get('intel') ?? {};
    const known = Object.entries(intel).find(([, v]) => LEVEL_RANK[v?.level ?? 'unknown'] >= 1);
    if (!this._selectedId && known) this._selectedId = known[0];
  }

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];

    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);

    // Tło
    ctx.fillStyle = bgAlpha(0.40);
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = GLASS_BORDER;
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

    ctx.fillStyle = bgAlpha(0.50);
    ctx.fillRect(x, y, w, TAB_H);
    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText('◐ WYWIAD', x + pad, y + 20);

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
      ctx.fillText('Brak danych wywiadowczych', x + w / 2, listY + 40);
      ctx.fillText('Wyślij statki lub zbuduj', x + w / 2, listY + 58);
      ctx.fillText('Obserwatorium (klawisz O)', x + w / 2, listY + 74);
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
      ctx.fillText(LEVEL_LABEL_PL[level], x + pad + 14, ry + 30);

      // Archetyp (po prawej — tylko przy contact+)
      if (levelRank >= LEVEL_RANK.contact && arch) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textSecondary;
        ctx.textAlign = 'right';
        ctx.fillText(arch.namePL, x + w - pad, ry + 30);
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
      ctx.fillText('Wybierz imperium z listy', x + w / 2, y + h / 2);
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
    ctx.fillText(`[${LEVEL_LABEL_PL[level]}]`, x + w - pad, y + 22);
    ctx.textAlign = 'left';

    let iy = y + TAB_H + 20;

    // Blok 1: archetyp / opis (contact+)
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    if (rank >= LEVEL_RANK.contact && arch) {
      ctx.fillStyle = arch.color;
      ctx.fillText(`Archetyp: ${arch.namePL}`, x + pad, iy);
      iy += 18;
      ctx.fillStyle = THEME.textDim;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      this._wrapText(ctx, arch.descPL, x + pad, iy, w - pad * 2, 14);
      iy += 18 + 14;
    } else {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`Archetyp: ${MASK}`, x + pad, iy);
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
    ctx.fillText('Znane systemy', x + pad, iy);
    iy += 16;

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const known = intel.knownColonies ?? [];
    if (known.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('(brak)', x + pad + 8, iy);
      iy += 16;
    } else {
      const galaxy = window.KOSMOS?.galaxyData;
      for (const sysId of known) {
        const gs = galaxy?.systems?.find(s => s.id === sysId);
        const name = gs?.name ?? sysId;
        const isHome = emp.homeSystemId === sysId;
        ctx.fillStyle = isHome ? THEME.accent : THEME.textSecondary;
        ctx.fillText(`  • ${name}${isHome ? ' (stolica)' : ''}`, x + pad + 4, iy);
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
    ctx.fillText('Siła wojskowa', x + pad, iy);
    iy += 16;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    if (rank >= LEVEL_RANK.detailed && intel.knownMilitary != null) {
      const bars = Math.min(10, Math.floor(intel.knownMilitary / 50));
      ctx.fillStyle = THEME.warning;
      ctx.fillText(`  ≈ ${intel.knownMilitary} jednostek bojowych`, x + pad + 4, iy);
      iy += 14;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`  ${'█'.repeat(bars)}${'░'.repeat(10 - bars)}`, x + pad + 4, iy);
      iy += 14;
    } else {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`  ${MASK}`, x + pad + 4, iy);
      iy += 14;
      ctx.fillStyle = THEME.textDim;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillText('  (wymaga skanu naziemnego)', x + pad + 4, iy);
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
    ctx.fillText('Ostatnie incydenty', x + pad, iy);
    iy += 16;

    const inc = intel.lastIncidents ?? [];
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    if (rank < LEVEL_RANK.contact) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`  ${MASK}`, x + pad + 4, iy);
    } else if (inc.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('  (brak)', x + pad + 4, iy);
    } else {
      const shown = inc.slice(-5).reverse();
      for (const ev of shown) {
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(`  [${(ev.year ?? 0).toFixed(0)}] ${ev.type}`, x + pad + 4, iy);
        iy += 14;
      }
    }
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
    }
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
    }
    return true;
  }
}
