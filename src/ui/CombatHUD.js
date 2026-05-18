// CombatHUD — live progress active deep-space encounter (M4 P3 polish).
//
// Auto-show gdy DSCS._activeEncounters.size > 0 → renderuje compact panel
// per encounter: sideA HP bar, sideB HP bar, round X / MAX, dystans.
// Auto-hide gdy brak active encounters.
//
// Pozycja: top-center (pod TopBar). Czytelny w czasie chase + combat.
// Per-encounter wiersz: ~64 px, max 3 encountery jednoczesnie (kolejne ucinane).
//
// Read-only — patrzy na window.KOSMOS.deepSpaceCombatSystem.listActive().

import { BaseOverlay }    from './BaseOverlay.js';
import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { COSMIC }         from '../config/LayoutConfig.js';

const PANEL_W       = 380;
const ROW_H         = 64;
const HEADER_H      = 24;
const PADDING       = 8;
const HP_BAR_H      = 8;
const HP_BAR_GAP    = 4;
const MAX_VISIBLE_ENCOUNTERS = 3;

export class CombatHUD extends BaseOverlay {
  constructor() {
    super(null);
    // Zawsze "visible" w sensie BaseOverlay — draw() filtruje by active encounters.
    this.visible = true;
  }

  // Override — overlay zawsze ON, nie potrzeba toggle/show/hide.
  toggle() { /* no-op */ }
  show()   { /* no-op */ }
  hide()   { /* no-op */ }

  draw(ctx, W, _H) {
    const dscs = window.KOSMOS?.deepSpaceCombatSystem;
    if (!dscs?.listActive) return;
    const encounters = dscs.listActive();
    if (encounters.length === 0) return;

    this._hitZones = [];

    // Limit do MAX_VISIBLE_ENCOUNTERS — kolejne skondensowane do label "+N more".
    const visible = encounters.slice(0, MAX_VISIBLE_ENCOUNTERS);
    const overflow = encounters.length - visible.length;

    const totalH = HEADER_H + visible.length * ROW_H + (overflow > 0 ? 18 : 0) + PADDING;
    const px = Math.floor(W / 2 - PANEL_W / 2);
    const py = (COSMIC.TOP_BAR_H ?? 32) + 18;

    // Tło + ramka
    ctx.fillStyle = bgAlpha(0.65);
    ctx.fillRect(px, py, PANEL_W, totalH);
    ctx.strokeStyle = THEME.danger ?? '#ff4466';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, PANEL_W - 1, totalH - 1);

    // Header
    ctx.fillStyle = THEME.danger ?? '#ff4466';
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center';
    const headerLabel = encounters.length === 1
      ? '⚔ BITWA W DEEP-SPACE'
      : `⚔ BITWY W DEEP-SPACE (${encounters.length})`;
    ctx.fillText(headerLabel, px + PANEL_W / 2, py + 16);
    ctx.textAlign = 'left';

    // Header separator
    ctx.strokeStyle = THEME.border ?? '#444';
    ctx.beginPath();
    ctx.moveTo(px, py + HEADER_H);
    ctx.lineTo(px + PANEL_W, py + HEADER_H);
    ctx.stroke();

    let cy = py + HEADER_H;
    for (const enc of visible) {
      this._drawEncounterRow(ctx, enc, px, cy);
      cy += ROW_H;
    }

    if (overflow > 0) {
      ctx.fillStyle = THEME.textDim ?? '#888';
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(`+ ${overflow} kolejnych...`, px + PANEL_W / 2, cy + 12);
      ctx.textAlign = 'left';
    }
  }

  _drawEncounterRow(ctx, enc, px, py) {
    const hpA      = this._sumHP(enc, 'A');
    const hpStartA = this._sumHpStart(enc, 'A');
    const hpB      = this._sumHP(enc, 'B');
    const hpStartB = this._sumHpStart(enc, 'B');
    const pctA = hpStartA > 0 ? Math.max(0, hpA / hpStartA) : 0;
    const pctB = hpStartB > 0 ? Math.max(0, hpB / hpStartB) : 0;

    const distAU = this._lastDistanceAU(enc);
    const aliveA = this._countAlive(enc, 'A');
    const aliveB = this._countAlive(enc, 'B');
    const totalA = enc.sideA.vesselIds.length + enc.sideA.joinedVesselIds.length;
    const totalB = enc.sideB.vesselIds.length + enc.sideB.joinedVesselIds.length;

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';

    // Linia 1: labelA + round + distance + labelB
    const round = enc.currentRound ?? 0;
    const distStr = distAU > 0 ? `${distAU.toFixed(3)} AU` : '—';

    ctx.fillStyle = THEME.success ?? '#44cc66';
    ctx.fillText(this._truncate(enc.sideA.label, 16), px + PADDING, py + 14);

    ctx.fillStyle = THEME.textDim ?? '#888';
    ctx.textAlign = 'center';
    ctx.fillText(`runda ${round} · ${distStr}`, px + PANEL_W / 2, py + 14);

    ctx.fillStyle = THEME.danger ?? '#ff4466';
    ctx.textAlign = 'right';
    ctx.fillText(this._truncate(enc.sideB.label, 16), px + PANEL_W - PADDING, py + 14);

    ctx.textAlign = 'left';

    // Linia 2: HP barki side-by-side
    const barW = (PANEL_W - PADDING * 3) / 2;
    const barY = py + 22;
    this._drawHpBar(ctx, px + PADDING, barY, barW, pctA,
                    `${hpA.toFixed(0)} / ${hpStartA.toFixed(0)} HP`,
                    THEME.success ?? '#44cc66');
    this._drawHpBar(ctx, px + PADDING * 2 + barW, barY, barW, pctB,
                    `${hpB.toFixed(0)} / ${hpStartB.toFixed(0)} HP`,
                    THEME.danger ?? '#ff4466');

    // Linia 3: alive counters (~vessel slots)
    ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary ?? '#bbb';
    ctx.fillText(`żywych: ${aliveA}/${totalA}`, px + PADDING, py + 50);
    ctx.textAlign = 'right';
    ctx.fillText(`żywych: ${aliveB}/${totalB}`, px + PANEL_W - PADDING, py + 50);
    ctx.textAlign = 'left';
  }

  _drawHpBar(ctx, x, y, w, pct, label, fgColor) {
    // Tło
    ctx.fillStyle = 'rgba(40, 40, 40, 0.6)';
    ctx.fillRect(x, y, w, HP_BAR_H);
    // Wypełnienie
    const fillW = Math.max(0, Math.min(w, w * pct));
    ctx.fillStyle = fgColor;
    ctx.fillRect(x, y, fillW, HP_BAR_H);
    // Ramka
    ctx.strokeStyle = THEME.border ?? '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, HP_BAR_H - 1);
    // Label pod barą
    ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim ?? '#888';
    ctx.fillText(label, x, y + HP_BAR_H + 10);
  }

  // ── Helpers ───────────────────────────────────────────────────

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

  _lastDistanceAU(enc) {
    if (!enc.timeline?.length) return 0;
    // Ostatni round entry z non-zero distanceAU
    for (let i = enc.timeline.length - 1; i >= 0; i--) {
      const d = enc.timeline[i]?.distanceAU;
      if (d && d > 0) return d;
    }
    return 0;
  }

  _truncate(s, max) {
    if (typeof s !== 'string') return '?';
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '…';
  }
}
