// Outliner — prawy panel stały (180px): kolonie, ekspedycje, flota
//
// Inspirowany Stellaris Outlinerem. Zawsze widoczny w trybie civMode.
// Sekcje zwijalne: KOLONIE, EKSPEDYCJE, FLOTA.
// Klik na kolonię → otwórz globus; klik na ekspedycję → focus kamera.

import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { COSMIC }         from '../config/LayoutConfig.js';
import { SHIPS }          from '../data/ShipsData.js';
import EventBus            from '../core/EventBus.js';

const OUTLINER_W = COSMIC.OUTLINER_W;   // 180px
const TOP_BAR_H  = COSMIC.TOP_BAR_H;   // 50px
const BOTTOM_BAR_H = COSMIC.BOTTOM_BAR_H; // 30px

const SECTION_HDR_H = 22; // wysokość nagłówka sekcji
const ITEM_H = 20;        // wysokość elementu listy (emoji potrzebują więcej)
const PAD = 6;

const C = {
  get bg()     { return THEME.bgPrimary; },
  get border() { return THEME.border; },
  get title()  { return THEME.accent; },
  get label()  { return THEME.textLabel; },
  get text()   { return THEME.textSecondary; },
  get bright() { return THEME.textPrimary; },
  get green()  { return THEME.success; },
  get red()    { return THEME.danger; },
  get orange() { return THEME.warning; },
  get mint()   { return THEME.mint; },
  get dim()    { return THEME.textDim; },
};

function _truncate(str, maxLen) {
  if (!str) return '';
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + '…';
}

function _shortYear(y) {
  if (y >= 1e9)  return (y / 1e9).toFixed(1) + 'G';
  if (y >= 1e6)  return (y / 1e6).toFixed(1) + 'M';
  if (y >= 1000) return (y / 1000).toFixed(0) + 'k';
  return String(Math.floor(y));
}

export class Outliner {
  constructor() {
    // Sekcje zwijane/rozwijane
    this._sections = {
      colonies:    true,  // domyślnie rozwinięta
      expeditions: true,
      fleet:       true,
    };
    // Hit-rects do kliknięć
    this._clickTargets = [];
  }

  // ── Rysowanie ───────────────────────────────────────────
  draw(ctx, W, H, state) {
    const { colonies, expeditions, fleet, shipQueues } = state;

    const x = W - OUTLINER_W;
    const y = TOP_BAR_H;
    const h = H - TOP_BAR_H - BOTTOM_BAR_H;

    // Tło
    ctx.fillStyle = bgAlpha(0.88);
    ctx.fillRect(x, y, OUTLINER_W, h);
    // Lewa krawędź
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.stroke();

    this._clickTargets = [];
    let cy = y + 4;

    // ── KOLONIE ──────────────────────────────────────────
    cy = this._drawSection(ctx, x, cy, 'colonies', `KOLONIE [${colonies.length}]`, (startY) => {
      if (colonies.length === 0) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = C.dim;
        ctx.fillText('Brak kolonii', x + PAD, startY + 14);
        return ITEM_H;
      }
      let dy = 0;
      for (const col of colonies.slice(0, 8)) {
        const iy = startY + dy;
        const icon = col.isHomePlanet ? '🏛' : '🏙';
        const pop = col.civSystem?.population ?? 0;
        const mor = Math.round(col.civSystem?.morale ?? 50);

        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = C.bright;
        ctx.fillText(`${icon} ${_truncate(col.name, 10)}`, x + PAD, iy + 14);

        ctx.fillStyle = mor < 30 ? C.red : mor < 60 ? C.orange : C.text;
        ctx.textAlign = 'right';
        ctx.fillText(`${pop}👤${mor}%`, x + OUTLINER_W - PAD, iy + 14);
        ctx.textAlign = 'left';

        this._clickTargets.push({
          type: 'colony', planetId: col.planetId,
          x: x, y: iy, w: OUTLINER_W, h: ITEM_H,
        });
        dy += ITEM_H;
      }
      return dy;
    });

    // ── EKSPEDYCJE ───────────────────────────────────────
    cy = this._drawSection(ctx, x, cy, 'expeditions', `EKSPEDYCJE [${expeditions.length}]`, (startY) => {
      if (expeditions.length === 0) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = C.dim;
        ctx.fillText('Brak misji', x + PAD, startY + 14);
        return ITEM_H;
      }
      let dy = 0;
      for (const exp of expeditions.slice(0, 6)) {
        const iy = startY + dy;
        const icon = exp.type === 'scientific' ? '🔬'
          : exp.type === 'colony' ? '🚢'
          : exp.type === 'transport' ? '📦'
          : exp.type === 'recon' ? '🔭'
          : '⛏';
        const arrow = exp.status === 'returning' ? '↩' : exp.status === 'orbiting' ? '⊙' : '→';
        const color = exp.status === 'returning' ? C.mint
          : exp.status === 'orbiting' ? C.orange : '#88ccff';

        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = color;
        ctx.fillText(`${icon}${arrow}${_truncate(exp.targetName ?? '?', 8)}`, x + PAD, iy + 14);

        const eta = exp.status === 'returning'
          ? `↩${_shortYear(exp.returnYear ?? 0)}`
          : exp.status === 'orbiting'
            ? '⊙ orbita'
            : `${_shortYear(exp.arrivalYear ?? 0)}`;
        ctx.fillStyle = C.label;
        ctx.textAlign = 'right';
        ctx.fillText(eta, x + OUTLINER_W - PAD, iy + 14);
        ctx.textAlign = 'left';

        this._clickTargets.push({
          type: 'expedition', targetId: exp.targetId,
          x: x, y: iy, w: OUTLINER_W, h: ITEM_H,
        });
        dy += ITEM_H;
      }
      return dy;
    });

    // ── FLOTA ────────────────────────────────────────────
    const totalShips = fleet ? fleet.length : 0;
    cy = this._drawSection(ctx, x, cy, 'fleet', `FLOTA [${totalShips}]`, (startY) => {
      const queues = shipQueues ?? [];
      if (totalShips === 0 && queues.length === 0) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = C.dim;
        ctx.fillText('Brak statków', x + PAD, startY + 14);
        return ITEM_H;
      }

      let dy = 0;

      // Pogrupuj statki wg typu
      const counts = {};
      if (fleet) {
        for (const sid of fleet) {
          counts[sid] = (counts[sid] || 0) + 1;
        }
      }
      for (const [sid, count] of Object.entries(counts)) {
        const iy = startY + dy;
        const ship = SHIPS[sid];
        const icon = ship?.icon ?? '🚀';
        const name = ship?.namePL ?? sid;
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = C.text;
        ctx.fillText(`${icon} ${_truncate(name, 10)} ×${count}`, x + PAD, iy + 14);
        dy += ITEM_H;
      }

      // Queues (budowa w toku — wiele slotów)
      for (const q of queues) {
        const iy = startY + dy;
        const shipDef = SHIPS[q.shipId];
        const frac = q.buildTime > 0 ? q.progress / q.buildTime : 0;
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = '#88ccff';
        ctx.fillText(`⚓ ${shipDef?.icon ?? '🚀'} budowa`, x + PAD, iy + 14);

        // Mini pasek
        const barX = x + PAD;
        const barY = iy + 16;
        const barW = OUTLINER_W - PAD * 2;
        const barH = 4;
        ctx.fillStyle = THEME.bgTertiary;
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#4488cc';
        ctx.fillRect(barX, barY, Math.round(barW * frac), barH);
        ctx.strokeStyle = '#1a3050';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);
        dy += ITEM_H + 6;
      }

      return Math.max(ITEM_H, dy);
    });
  }

  // Rysuj sekcję z nagłówkiem (zwijalna)
  // drawContent(contentStartY) → zwraca wysokość treści
  _drawSection(ctx, x, startY, sectionId, title, drawContent) {
    let cy = startY;
    const open = this._sections[sectionId];

    // Nagłówek sekcji
    ctx.fillStyle = 'rgba(10,18,30,0.6)';
    ctx.fillRect(x, cy, OUTLINER_W, SECTION_HDR_H);
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, cy + SECTION_HDR_H); ctx.lineTo(x + OUTLINER_W, cy + SECTION_HDR_H); ctx.stroke();

    const arrow = open ? '▼' : '►';
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label;
    ctx.textAlign = 'left';
    ctx.fillText(`${arrow} ${title}`, x + PAD, cy + 15);

    this._clickTargets.push({
      type: 'section', sectionId,
      x, y: cy, w: OUTLINER_W, h: SECTION_HDR_H,
    });

    cy += SECTION_HDR_H;

    // Treść (jeśli rozwinięta) — przekaż pozycję startową ZA nagłówkiem
    if (open) {
      const contentH = drawContent.call(this, cy);
      cy += contentH + 4;
    }

    return cy;
  }

  // ── Hit testing ──────────────────────────────────────────
  hitTest(x, y, W, H) {
    const ox = W - OUTLINER_W;
    if (x < ox || y < TOP_BAR_H || y > H - BOTTOM_BAR_H) return false;

    for (const t of this._clickTargets) {
      if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) {
        if (t.type === 'section') {
          this._sections[t.sectionId] = !this._sections[t.sectionId];
          return true;
        }
        if (t.type === 'colony') {
          const colMgr = window.KOSMOS?.colonyManager;
          const colony = colMgr?.getColony(t.planetId);
          if (colony?.planet) {
            EventBus.emit('planet:openGlobe', { planet: colony.planet });
          }
          return true;
        }
        if (t.type === 'expedition') {
          if (t.targetId) {
            EventBus.emit('camera:focusTarget', { targetId: t.targetId });
          }
          return true;
        }
      }
    }

    return true; // pochłoń klik w Outlinerze
  }

  // Sprawdza czy punkt nad Outlinerem
  isOver(x, y, W, H) {
    return x >= W - OUTLINER_W && y >= TOP_BAR_H && y <= H - BOTTOM_BAR_H;
  }
}
