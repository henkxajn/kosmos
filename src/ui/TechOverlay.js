// TechOverlay — panel Technologii (klawisz T)
//
// Trójdzielny overlay: lista gałęzi (L), drzewo technologii (C), szczegóły + kolejka (R).
// Dane czytane LIVE z TechSystem / ResearchSystem / ColonyManager.

import { BaseOverlay }  from './BaseOverlay.js';
import { THEME }        from '../config/ThemeConfig.js';
import { TECHS, TECH_BRANCHES } from '../data/TechData.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { SHIPS }     from '../data/ShipsData.js';

const LEFT_W   = 200;
const RIGHT_W  = 280;
const BRANCH_H = 58;
const HDR_H    = 44;
const NODE_W   = 148;
const NODE_H   = 72;
const NODE_GAP = 16;
const TIER_LABEL_H = 24;

const BRANCH_ORDER = ['mining', 'energy', 'biology', 'civil', 'space'];

const TIER_DESC = {
  1: 'Podstawowe',
  2: 'Zaawansowane',
  3: 'Endgame',
};

// ══════════════════════════════════════════════════════════════════════════════
// TechOverlay
// ══════════════════════════════════════════════════════════════════════════════

export class TechOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._selectedBranch = 'mining';
    this._selectedTechId = null;
    this._scrollCenter = 0;
    this._scrollRight = 0;
  }

  // ── Główna metoda rysowania ──────────────────────────────────────────────

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];

    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);
    const centerW = ow - LEFT_W - RIGHT_W;

    // Tło
    ctx.fillStyle = 'rgba(2,4,5,0.97)';
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, ow, oh);

    // Separatory kolumn
    ctx.beginPath();
    ctx.moveTo(ox + LEFT_W, oy); ctx.lineTo(ox + LEFT_W, oy + oh);
    ctx.moveTo(ox + ow - RIGHT_W, oy); ctx.lineTo(ox + ow - RIGHT_W, oy + oh);
    ctx.stroke();

    this._drawLeft(ctx, ox, oy, oh);
    this._drawCenter(ctx, ox + LEFT_W, oy, centerW, oh);
    this._drawRight(ctx, ox + ow - RIGHT_W, oy, RIGHT_W, oh);
  }

  // ── LEWA KOLUMNA — lista gałęzi ─────────────────────────────────────────

  _drawLeft(ctx, x, y, oh) {
    const rSys = this._getResearchSystem();

    // Nagłówek
    this._drawText(ctx, 'TECHNOLOGIA', x + 12, y + 18, THEME.accent, THEME.fontSizeMedium);
    const totalRate = rSys?.getTotalRate() ?? 0;
    this._drawText(ctx, `🔬 +${totalRate.toFixed(1)} pkt/rok`, x + 12, y + 34,
      THEME.textSecondary, THEME.fontSizeSmall);
    this._drawSeparator(ctx, x, y + HDR_H, x + LEFT_W, y + HDR_H);

    // 5 wierszy gałęzi
    let by = y + HDR_H + 4;
    for (const brId of BRANCH_ORDER) {
      const br = TECH_BRANCHES[brId];
      const isSelected = this._selectedBranch === brId;
      const isHover = this._hoverZone?.type === 'branch' && this._hoverZone?.data?.branchId === brId;

      // Tło
      if (isSelected) {
        ctx.fillStyle = 'rgba(136,255,204,0.05)';
        ctx.fillRect(x, by, LEFT_W, BRANCH_H);
        // border-left
        ctx.fillStyle = THEME.accent;
        ctx.fillRect(x, by, 2, BRANCH_H);
      } else if (isHover) {
        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        ctx.fillRect(x, by, LEFT_W, BRANCH_H);
      }

      // Ikona + nazwa
      this._drawText(ctx, `${br.icon} ${br.namePL}`, x + 12, by + 18, br.color, THEME.fontSizeNormal);

      // Statystyki: X/Y odkryte
      const { done, total } = this._branchStats(brId);
      const pct = total > 0 ? done / total : 0;

      // Pasek postępu
      this._drawBar(ctx, x + 12, by + 28, LEFT_W - 24, 4, pct, br.color, THEME.border);

      // Tekst
      this._drawText(ctx, `${done}/${total} odkryte`, x + 12, by + 46,
        THEME.textSecondary, THEME.fontSizeSmall - 1);
      this._drawText(ctx, `${Math.round(pct * 100)}%`, x + LEFT_W - 12, by + 46,
        THEME.textDim, THEME.fontSizeSmall - 1, 'right');

      this._addHit(x, by, LEFT_W, BRANCH_H, 'branch', { branchId: brId });
      by += BRANCH_H;
    }
  }

  // ── ŚRODKOWA KOLUMNA — drzewo technologii ────────────────────────────────

  _drawCenter(ctx, x, y, w, oh) {
    const rSys = this._getResearchSystem();
    const tSys = this._getTechSystem();
    const br = TECH_BRANCHES[this._selectedBranch];
    if (!br) return;

    // Nagłówek
    this._drawText(ctx, `${br.icon} ${br.namePL.toUpperCase()} — DRZEWO TECHNOLOGII`,
      x + 12, y + 20, THEME.textPrimary, THEME.fontSizeNormal);
    const rate = rSys?.getTotalRate() ?? 0;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const rateLabel = 'Badania: ';
    const rateVal = `+${rate.toFixed(1)} pkt/rok`;
    const rateLabelW = ctx.measureText(rateLabel).width;
    this._drawText(ctx, rateLabel, x + w - 12 - ctx.measureText(rateLabel + rateVal).width, y + 20,
      THEME.textSecondary, THEME.fontSizeSmall);
    this._drawText(ctx, rateVal, x + w - 12 - ctx.measureText(rateVal).width, y + 20,
      THEME.purple, THEME.fontSizeSmall);

    this._drawSeparator(ctx, x, y + 32, x + w, y + 32);

    // Clip — obszar drzewa
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y + 32, w, oh - 32);
    ctx.clip();

    // Filtruj tech po gałęzi
    const branchTechs = Object.values(TECHS).filter(t => t.branch === this._selectedBranch);
    const tiers = { 1: [], 2: [], 3: [] };
    for (const t of branchTechs) {
      if (tiers[t.tier]) tiers[t.tier].push(t);
    }

    // Rysuj 3 kolumny tierów
    const tierW = Math.floor((w - 40) / 3);
    const startY = y + 40 + this._scrollCenter;

    for (let tier = 1; tier <= 3; tier++) {
      const tx = x + 12 + (tier - 1) * (tierW + 8);
      let ty = startY;

      // Label tieru
      this._drawText(ctx, `◈ TIER ${tier} — ${TIER_DESC[tier]}`,
        tx, ty + 10, THEME.textDim, THEME.fontSizeSmall - 1);
      ty += TIER_LABEL_H;

      // Węzły
      for (const tech of tiers[tier]) {
        this._drawTechNode(ctx, tech, tx, ty, Math.min(NODE_W, tierW - 8), tSys, rSys);
        ty += NODE_H + NODE_GAP;
      }
    }

    // Łączniki (requires z tej samej gałęzi)
    this._drawConnectors(ctx, branchTechs, x, startY, tierW, tiers, tSys);

    ctx.restore();
  }

  _drawTechNode(ctx, tech, x, y, w, tSys, rSys) {
    const state = this._getTechState(tech, tSys, rSys);
    const h = NODE_H;

    // Tło + border wg stanu
    const styles = {
      done:      { border: 'rgba(68,255,136,0.3)', bg: 'rgba(68,255,136,0.04)', text: THEME.success },
      active:    { border: THEME.purple,            bg: 'rgba(204,136,255,0.06)', text: THEME.purple },
      available: { border: THEME.borderLight,       bg: THEME.bgSecondary,        text: THEME.textPrimary },
      queued:    { border: THEME.borderLight,       bg: THEME.bgSecondary,        text: THEME.textPrimary },
      locked:    { border: THEME.border,            bg: THEME.bgPrimary,          text: THEME.textDim },
    };
    const s = styles[state] ?? styles.locked;

    // Opacity dla locked
    if (state === 'locked') ctx.globalAlpha = 0.5;

    ctx.fillStyle = s.bg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = s.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // Prefix + nazwa
    const prefix = { done: '✓ ', active: '⟳ ', queued: '', available: '', locked: '' }[state];
    const prefixColor = { done: THEME.success, active: THEME.purple }[state] ?? s.text;
    const name = tech.namePL.length > 18 ? tech.namePL.slice(0, 17) + '…' : tech.namePL;

    if (prefix) {
      this._drawText(ctx, prefix, x + 6, y + 14, prefixColor, THEME.fontSizeNormal);
      const pw = ctx.measureText(prefix).width;
      this._drawText(ctx, name, x + 6 + pw, y + 14, s.text, THEME.fontSizeNormal);
    } else {
      this._drawText(ctx, name, x + 6, y + 14, s.text, THEME.fontSizeNormal);
    }

    // Opis (max 2 linie × ~25 znaków)
    const descFont = (THEME.fontSizeSmall - 1);
    ctx.font = `${descFont}px ${THEME.fontFamily}`;
    const desc = tech.description ?? '';
    const lines = this._wrapText(desc, 25);
    for (let i = 0; i < Math.min(2, lines.length); i++) {
      this._drawText(ctx, lines[i], x + 6, y + 28 + i * 11, THEME.textSecondary, descFont);
    }

    // Koszt / ETA
    const costStr = `${tech.cost.research} pkt`;
    if (state === 'active') {
      const pct = rSys ? rSys.getProgress() : 0;
      const eta = rSys?.getETA(this._getYear()) ?? null;
      const etaStr = eta !== null && eta !== Infinity ? `~${Math.ceil(eta - this._getYear())} lat` : '';
      this._drawText(ctx, `${Math.floor(rSys.researchProgress)}/${tech.cost.research}`, x + 6, y + 58,
        THEME.textDim, THEME.fontSizeSmall);
      if (etaStr) {
        this._drawText(ctx, etaStr, x + w - 6, y + 58, THEME.textSecondary, THEME.fontSizeSmall, 'right');
      }
      // Pasek postępu na dole
      this._drawBar(ctx, x + 1, y + h - 4, w - 2, 3, pct, THEME.purple, THEME.border);
    } else if (state === 'done') {
      this._drawText(ctx, '✓ Odkryte', x + 6, y + 58, THEME.success, THEME.fontSizeSmall);
    } else {
      this._drawText(ctx, costStr, x + 6, y + 58, THEME.textDim, THEME.fontSizeSmall);
      if (state === 'available') {
        const rate = rSys?.getTotalRate() ?? 0;
        if (rate > 0) {
          const etaYears = Math.ceil(tech.cost.research / rate);
          this._drawText(ctx, `~${etaYears} lat`, x + w - 6, y + 58,
            THEME.textSecondary, THEME.fontSizeSmall, 'right');
        }
      }
    }

    // Numer kolejki (queued)
    if (state === 'queued') {
      const idx = rSys?.researchQueue?.indexOf(tech.id) ?? -1;
      if (idx >= 0) {
        this._drawText(ctx, `#${idx + 1}`, x + w - 8, y + 14,
          THEME.accent, THEME.fontSizeSmall, 'right');
      }
    }

    if (state === 'locked') ctx.globalAlpha = 1;

    // Hit zone (nie dla locked)
    if (state !== 'locked') {
      this._addHit(x, y, w, h, 'techNode', { techId: tech.id, state });
    }
  }

  _drawConnectors(ctx, branchTechs, areaX, startY, tierW, tiers, tSys) {
    // Pozycje węzłów
    const positions = {};
    for (let tier = 1; tier <= 3; tier++) {
      let ty = startY + TIER_LABEL_H;
      for (const tech of (tiers[tier] ?? [])) {
        const tx = areaX + 12 + (tier - 1) * (tierW + 8);
        positions[tech.id] = { x: tx, y: ty, w: Math.min(NODE_W, tierW - 8) };
        ty += NODE_H + NODE_GAP;
      }
    }

    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (const tech of branchTechs) {
      const to = positions[tech.id];
      if (!to) continue;
      for (const reqId of tech.requires) {
        const from = positions[reqId];
        if (!from) continue; // requires z innej gałęzi — pomijamy
        const bothDone = tSys?.isResearched(tech.id) && tSys?.isResearched(reqId);
        ctx.strokeStyle = bothDone ? 'rgba(68,255,136,0.3)' : THEME.borderLight;
        ctx.beginPath();
        ctx.moveTo(from.x + from.w, from.y + NODE_H / 2);
        ctx.lineTo(to.x, to.y + NODE_H / 2);
        ctx.stroke();
      }
    }
  }

  // ── PRAWA KOLUMNA — szczegóły + kolejka ──────────────────────────────────

  _drawRight(ctx, x, y, w, oh) {
    const rSys = this._getResearchSystem();
    const tSys = this._getTechSystem();
    let cy = y;

    // Szczegóły wybranej tech
    if (this._selectedTechId) {
      cy = this._drawTechDetails(ctx, x, y, w, tSys, rSys);
    } else {
      // Brak wybranej — wskazówka
      this._drawRect(ctx, x, y, w, HDR_H, THEME.bgSecondary);
      this._drawText(ctx, 'Wybierz technologię', x + 12, y + 16,
        THEME.textDim, THEME.fontSizeMedium);
      this._drawText(ctx, 'Kliknij węzeł w drzewie', x + 12, y + 30,
        THEME.textDim, THEME.fontSizeSmall);
      cy = y + HDR_H;
    }

    // Separator
    this._drawSeparator(ctx, x, cy, x + w, cy);
    cy += 4;

    // Kolejka badań
    this._drawQueue(ctx, x, cy, w, y + oh - cy, rSys, tSys);
  }

  _drawTechDetails(ctx, x, y, w, tSys, rSys) {
    const tech = TECHS[this._selectedTechId];
    if (!tech) return y + HDR_H;
    const state = this._getTechState(tech, tSys, rSys);
    const br = TECH_BRANCHES[tech.branch];

    // Nagłówek
    this._drawRect(ctx, x, y, w, HDR_H, THEME.bgSecondary);
    this._drawText(ctx, tech.namePL, x + 12, y + 16, THEME.textPrimary, THEME.fontSizeMedium);
    this._drawText(ctx, `${br?.icon ?? ''} ${br?.namePL ?? ''} — Tier ${tech.tier}`,
      x + 12, y + 30, br?.color ?? THEME.textDim, THEME.fontSizeSmall);

    let cy = y + HDR_H + 4;

    // Opis
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const descLines = this._wrapText(tech.description ?? '', 38);
    for (let i = 0; i < Math.min(3, descLines.length); i++) {
      this._drawText(ctx, descLines[i], x + 12, cy + 12 + i * 13,
        THEME.textSecondary, THEME.fontSizeSmall);
    }
    cy += Math.min(3, descLines.length) * 13 + 16;

    // Efekty
    if (tech.effects.length > 0) {
      this._drawText(ctx, 'EFEKTY PO ODKRYCIU', x + 12, cy + 8, THEME.textDim, 8);
      cy += 16;
      for (const fx of tech.effects) {
        const { text, color } = this._formatEffect(fx);
        this._drawText(ctx, text, x + 16, cy + 10, color, THEME.fontSizeSmall);
        cy += 18;
      }
      cy += 4;
    }

    // Wymagania
    if (tech.requires.length > 0) {
      this._drawText(ctx, 'WYMAGANIA', x + 12, cy + 8, THEME.textDim, 8);
      cy += 16;
      for (const reqId of tech.requires) {
        const reqTech = TECHS[reqId];
        const done = tSys?.isResearched(reqId);
        const icon = done ? '✓' : '✗';
        const col = done ? THEME.success : THEME.danger;
        this._drawText(ctx, `${icon} ${reqTech?.namePL ?? reqId}`, x + 16, cy + 10, col, THEME.fontSizeSmall);
        cy += 18;
      }
      cy += 4;
    }

    // Postęp + przyciski
    cy += 4;
    if (state === 'done') {
      this._drawText(ctx, '✓ ODKRYTE', x + 12, cy + 12, THEME.success, THEME.fontSizeSmall);
      cy += 24;
    } else if (state === 'active') {
      const pct = rSys?.getProgress() ?? 0;
      const prog = Math.floor(rSys?.researchProgress ?? 0);
      this._drawText(ctx, `${prog} / ${tech.cost.research} pkt`, x + 12, cy + 10,
        THEME.textPrimary, THEME.fontSizeSmall);
      cy += 16;
      this._drawBar(ctx, x + 12, cy, w - 24, 8, pct, THEME.purple, THEME.border);
      cy += 14;
      this._drawText(ctx, 'W BADANIU', x + 12, cy + 10, THEME.purple, THEME.fontSizeSmall);
      cy += 20;
      // Przycisk anuluj
      this._drawButton(ctx, '✕ ANULUJ', x + 12, cy, w - 24, 22, 'danger');
      this._addHit(x + 12, cy, w - 24, 22, 'cancelResearch', { techId: tech.id, label: '✕ ANULUJ' });
      cy += 28;
    } else if (state === 'available') {
      this._drawButton(ctx, '▶ BADAJ', x + 12, cy, (w - 32) / 2, 24, 'primary');
      this._addHit(x + 12, cy, (w - 32) / 2, 24, 'startResearch', { techId: tech.id, label: '▶ BADAJ' });
      this._drawButton(ctx, '+ DO KOLEJKI', x + 16 + (w - 32) / 2, cy, (w - 32) / 2, 24, 'secondary');
      this._addHit(x + 16 + (w - 32) / 2, cy, (w - 32) / 2, 24, 'queueResearch', { techId: tech.id, label: '+ DO KOLEJKI' });
      cy += 30;
    } else if (state === 'queued') {
      this._drawButton(ctx, 'USUŃ Z KOLEJKI', x + 12, cy, w - 24, 24, 'danger');
      this._addHit(x + 12, cy, w - 24, 24, 'dequeueResearch', { techId: tech.id, label: 'USUŃ Z KOLEJKI' });
      cy += 30;
    } else { // locked
      this._drawText(ctx, '🔒 WYMAGANIA NIESPEŁNIONE', x + 12, cy + 12, THEME.textDim, THEME.fontSizeSmall);
      cy += 24;
    }

    return cy;
  }

  _drawQueue(ctx, x, y, w, maxH, rSys, tSys) {
    this._drawText(ctx, 'KOLEJKA BADAŃ', x + 12, y + 12, THEME.textDim, THEME.fontSizeSmall);

    let cy = y + 20;
    const queue = rSys?.researchQueue ?? [];
    const current = rSys?.currentResearch;
    const year = this._getYear();

    // Aktualnie badana (na szczycie)
    if (current) {
      const tech = TECHS[current];
      if (tech) {
        const pct = rSys?.getProgress() ?? 0;
        const eta = rSys?.getETA(year);
        const etaStr = eta != null && eta !== Infinity ? `rok ${Math.ceil(eta)}` : '∞';

        ctx.fillStyle = 'rgba(204,136,255,0.06)';
        ctx.fillRect(x + 4, cy, w - 8, 28);
        ctx.strokeStyle = THEME.purple;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 4.5, cy + 0.5, w - 9, 27);

        this._drawText(ctx, '⟳', x + 10, cy + 16, THEME.purple, THEME.fontSizeSmall);
        this._drawText(ctx, tech.namePL, x + 24, cy + 12, THEME.textPrimary, THEME.fontSizeSmall);
        this._drawText(ctx, etaStr, x + w - 10, cy + 12, THEME.textSecondary, THEME.fontSizeSmall - 1, 'right');

        // Mini pasek postępu
        this._drawBar(ctx, x + 24, cy + 20, w - 60, 3, pct, THEME.purple, THEME.border);

        cy += 32;
      }
    }

    // Reszta kolejki
    let accCost = 0;
    if (current) {
      const ct = TECHS[current];
      if (ct) accCost = Math.max(0, ct.cost.research - (rSys?.researchProgress ?? 0));
    }
    const rate = rSys?.getTotalRate() ?? 0;

    for (let i = 0; i < queue.length; i++) {
      if (cy + 28 > y + maxH) break;
      const techId = queue[i];
      const tech = TECHS[techId];
      if (!tech) continue;

      accCost += tech.cost.research;
      const etaYears = rate > 0 ? Math.ceil(accCost / rate) : '∞';
      const etaStr = rate > 0 ? `~${etaYears} lat` : '∞';

      const isHover = this._hoverZone?.type === 'queueItem' && this._hoverZone?.data?.techId === techId;
      if (isHover) {
        ctx.fillStyle = 'rgba(255,255,255,0.02)';
        ctx.fillRect(x + 4, cy, w - 8, 28);
      }

      this._drawText(ctx, `${i + 1}.`, x + 10, cy + 16, THEME.purple, THEME.fontSizeSmall);
      this._drawText(ctx, tech.namePL, x + 26, cy + 12, THEME.textPrimary, THEME.fontSizeSmall);
      this._drawText(ctx, etaStr, x + w - 32, cy + 12, THEME.textSecondary, THEME.fontSizeSmall - 1, 'right');

      // Przycisk ✕
      this._drawText(ctx, '✕', x + w - 14, cy + 14, THEME.danger, THEME.fontSizeSmall, 'right');
      this._addHit(x + w - 24, cy, 20, 28, 'removeFromQueue', { techId, label: '✕' });

      // Kliknięcie na nazwę — podgląd
      this._addHit(x + 4, cy, w - 32, 28, 'queueItem', { techId });

      cy += 28;
    }

    // Komunikat jeśli pusta
    if (!current && queue.length === 0) {
      this._drawText(ctx, 'Brak badań w kolejce', x + 12, cy + 14,
        THEME.textDim, THEME.fontSizeSmall);
    }
  }

  // ── Obsługa kliknięć ────────────────────────────────────────────────────

  _onHit(zone) {
    const rSys = this._getResearchSystem();
    switch (zone.type) {
      case 'branch':
        this._selectedBranch = zone.data.branchId;
        break;
      case 'techNode':
        this._selectedTechId = zone.data.techId;
        break;
      case 'startResearch':
        rSys?.queueTech(zone.data.techId);
        break;
      case 'queueResearch':
        rSys?.queueTech(zone.data.techId);
        break;
      case 'dequeueResearch':
      case 'cancelResearch':
      case 'removeFromQueue':
        rSys?.dequeueTech(zone.data.techId);
        break;
      case 'queueItem':
        this._selectedTechId = zone.data.techId;
        break;
    }
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    const { ox, oy, ow, oh } = this._getOverlayBounds(
      window.innerWidth / this._getScale(),
      window.innerHeight / this._getScale()
    );
    // Scroll środkowej kolumny
    if (x >= ox + LEFT_W && x < ox + ow - RIGHT_W) {
      this._scrollCenter = Math.min(0, this._scrollCenter - delta * 0.3);
      return true;
    }
    // Scroll prawej kolumny
    if (x >= ox + ow - RIGHT_W) {
      this._scrollRight = Math.min(0, this._scrollRight - delta * 0.3);
      return true;
    }
    return true; // konsumuj scroll
  }

  // ── Helpery ──────────────────────────────────────────────────────────────

  _getTechSystem() { return window.KOSMOS?.techSystem ?? null; }
  _getResearchSystem() { return window.KOSMOS?.researchSystem ?? null; }
  _getYear() { return window.KOSMOS?.timeSystem?.gameTime ?? 0; }

  _getScale() {
    const pw = window.innerWidth;
    const ph = window.innerHeight;
    return Math.min(pw / 1280, ph / 720);
  }

  _getTechState(tech, tSys, rSys) {
    if (tSys?.isResearched(tech.id)) return 'done';
    if (rSys?.currentResearch === tech.id) return 'active';
    if (rSys?.researchQueue?.includes(tech.id)) return 'queued';
    if (this._canResearch(tech, tSys)) return 'available';
    return 'locked';
  }

  _canResearch(tech, tSys) {
    if (!tSys) return false;
    if (tSys.isResearched(tech.id)) return false;
    return tech.requires.every(req => tSys.isResearched(req));
  }

  _branchStats(branchId) {
    const tSys = this._getTechSystem();
    const techs = Object.values(TECHS).filter(t => t.branch === branchId);
    const done = techs.filter(t => tSys?.isResearched(t.id)).length;
    return { done, total: techs.length };
  }

  _formatEffect(fx) {
    switch (fx.type) {
      case 'modifier':
        return { text: `+${Math.round((fx.multiplier - 1) * 100)}% ${fx.resource}`, color: THEME.success };
      case 'unlockBuilding': {
        const b = BUILDINGS[fx.buildingId];
        return { text: `[odblokuj] ${b?.namePL ?? fx.buildingId}`, color: THEME.accent };
      }
      case 'unlockShip': {
        const s = SHIPS[fx.shipId];
        return { text: `[odblokuj statek] ${s?.namePL ?? fx.shipId}`, color: THEME.info };
      }
      case 'moraleBonus':
        return { text: `prosperity +${fx.amount}`, color: THEME.purple };
      case 'popGrowthBonus':
        return { text: `wzrost pop ×${fx.multiplier}`, color: '#88dd88' };
      case 'consumptionMultiplier':
        return { text: `${Math.round((1 - fx.multiplier) * 100)}% mniej ${fx.resource}`, color: THEME.info };
      case 'buildingLevelCap':
        return { text: `max poziom budynków: ${fx.maxLevel}`, color: THEME.accent };
      case 'unlockFeature':
        return { text: `[odblokuj] ${fx.feature}`, color: THEME.accent };
      default:
        return { text: JSON.stringify(fx), color: THEME.textDim };
    }
  }

  _wrapText(text, maxChars) {
    if (text.length <= maxChars) return [text];
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > maxChars) {
        if (line) lines.push(line);
        line = w;
      } else {
        line = line ? line + ' ' + w : w;
      }
    }
    if (line) lines.push(line);
    return lines;
  }
}
