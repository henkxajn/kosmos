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

import { BaseOverlay }    from './BaseOverlay.js';
import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { COSMIC }         from '../config/LayoutConfig.js';
import { HULLS }          from '../data/HullsData.js';
import { SHIP_MODULES }   from '../data/ShipModulesData.js';
import EventBus           from '../core/EventBus.js';
import { t, getName }     from '../i18n/i18n.js';

const PANEL_W       = 560;
const HEADER_H      = 24;
const PADDING       = 8;
const HP_BAR_H      = 8;
const LOG_LINES_MAX = 6;
const LOG_LINE_H    = 12;
const MAX_VISIBLE_ENCOUNTERS = 2;

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
    /** @type {{x:number,y:number,w:number,h:number,point:{x:number,y:number}|null}|null} — przycisk „Obserwuj bitwę" */
    this._watchBtnBounds = null;
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
      this._watchBtnBounds = null;
      // Auto-reset minimize gdy nie ma już active encounters (następna bitwa
      // startuje w expanded mode — bez tego user widziałby chip dla nic).
      if (this._minimized) this._minimized = false;
      return;
    }
    if (this._minimized) {
      // Chip rysuje BottomBar; tu nic.
      this._minimizeBtnBounds = null;
      this._watchBtnBounds = null;
      return;
    }

    this._hitZones = [];

    const visible = encounters.slice(0, MAX_VISIBLE_ENCOUNTERS);
    const overflow = encounters.length - visible.length;

    // Wysokość per encounter dynamicznie (label + HP + alive + vessels list + log).
    const rowH = (enc) => {
      // Multi-line per vessel: 2 wiersze (name+hull, weapons indent).
      const vesselsA = this._countVessels(enc, 'A') * 2;
      const vesselsB = this._countVessels(enc, 'B') * 2;
      const vesselsRows = Math.max(vesselsA, vesselsB, 1);
      // label(14) + bars(12) + barLabels(12) + alive(14) + vessels(vesselsRows*12) + log header(14) + log lines + padding
      return 14 + 14 + 14 + 14 + vesselsRows * 12 + 14 + LOG_LINES_MAX * LOG_LINE_H + 8;
    };

    let totalH = HEADER_H + PADDING;
    for (const enc of visible) totalH += rowH(enc);
    if (overflow > 0) totalH += 18;

    // Bottom-center: nad BottomBar (-8 padding). User feedback 2026-05-20 —
    // top-center zachodziło z FleetManagerOverlay prawy panel. Bottom-center
    // zostawia tactical map area czytelną.
    // UI v3 — w civMode rezerwa dolna = pasek nawigacji + listwa dziennika; poza = dolny pasek.
    const bottomRes = (window.KOSMOS?.civMode
      ? (COSMIC.BOTTOM_NAV_H + COSMIC.BOTTOM_LOG_TRIG_H)
      : (COSMIC.BOTTOM_BAR_H ?? 32))
      + (window.KOSMOS?.tacticalDock?.getReservedHeight?.() ?? 0);   // Faza 4 — podnieś NAD Dok taktyczny
    const px = Math.floor(W / 2 - PANEL_W / 2);
    const py = Math.max((COSMIC.TOP_BAR_H ?? 32) + 8, H - bottomRes - (COSMIC.RESOURCE_BAR_H ?? 0) - totalH - 8);   // nad paskiem nawigacji + dziennikiem

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

    // „Obserwuj bitwę" (👁) — top-left header. Klik → camera:watchBattle na PIERWSZĄ
    // widoczną bitwę (close-up kamery na midpoint). Punkt = enc.location.point (gameplay px).
    const watchPoint = visible[0]?.location?.point ?? null;
    if (watchPoint && Number.isFinite(watchPoint.x) && Number.isFinite(watchPoint.y)) {
      const wBtnW = 104;
      const wBtnH = HEADER_H - 4;
      const wBtnX = px + 4;
      const wBtnY = py + 2;
      ctx.fillStyle = bgAlpha(0.4);
      ctx.fillRect(wBtnX, wBtnY, wBtnW, wBtnH);
      ctx.strokeStyle = THEME.accent ?? '#ffaa44';
      ctx.lineWidth = 1;
      ctx.strokeRect(wBtnX + 0.5, wBtnY + 0.5, wBtnW - 1, wBtnH - 1);
      ctx.fillStyle = THEME.accent ?? '#ffaa44';
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`👁 ${t('combat.watchBattle')}`, wBtnX + wBtnW / 2, wBtnY + wBtnH / 2 + 1);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      this._watchBtnBounds = { x: wBtnX, y: wBtnY, w: wBtnW, h: wBtnH, point: { x: watchPoint.x, y: watchPoint.y } };
    } else {
      this._watchBtnBounds = null;
    }

    ctx.strokeStyle = THEME.border ?? '#444';
    ctx.beginPath();
    ctx.moveTo(px, py + HEADER_H);
    ctx.lineTo(px + PANEL_W, py + HEADER_H);
    ctx.stroke();

    let cy = py + HEADER_H;
    for (const enc of visible) {
      const h = rowH(enc);
      this._drawEncounterRow(ctx, enc, px, cy, h);
      cy += h;
    }

    if (overflow > 0) {
      ctx.fillStyle = THEME.textDim ?? '#888';
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(t('combat.hudMore', overflow), px + PANEL_W / 2, cy + 12);
      ctx.textAlign = 'left';
    }
  }

  _drawEncounterRow(ctx, enc, px, py, totalRowH) {
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

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';

    // Linia 1: labelA + round + distance + labelB
    const round = enc.currentRound ?? 0;
    const distStr = distAU > 0 ? `${distAU.toFixed(3)} AU` : '—';

    ctx.fillStyle = THEME.success ?? '#44cc66';
    ctx.fillText(this._truncate(enc.sideA.label, 20), px + PADDING, py + 14);

    ctx.fillStyle = THEME.textDim ?? '#888';
    ctx.textAlign = 'center';
    ctx.fillText(`${t('combat.hudRound', round)} · ${distStr}`, px + PANEL_W / 2, py + 14);

    ctx.fillStyle = THEME.danger ?? '#ff4466';
    ctx.textAlign = 'right';
    ctx.fillText(this._truncate(enc.sideB.label, 20), px + PANEL_W - PADDING, py + 14);

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

    // Linia 3: alive counters
    ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary ?? '#bbb';
    ctx.fillText(t('combat.hudAlive', aliveA, totalA), px + PADDING, py + 50);
    ctx.textAlign = 'right';
    ctx.fillText(t('combat.hudAlive', aliveB, totalB), px + PANEL_W - PADDING, py + 50);
    ctx.textAlign = 'left';

    // Linia 4+: vessel details per side (hull + bronie)
    const vesselsY = py + 64;
    const vesselsA = this._getVesselDetails(enc, 'A');
    const vesselsB = this._getVesselDetails(enc, 'B');
    const halfW = (PANEL_W - PADDING * 3) / 2;

    ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
    for (let i = 0; i < vesselsA.length; i++) {
      ctx.fillStyle = vesselsA[i].alive ? (THEME.success ?? '#44cc66') : (THEME.textDim ?? '#666');
      ctx.fillText(this._truncate(vesselsA[i].text, 44), px + PADDING, vesselsY + i * 12);
    }
    for (let i = 0; i < vesselsB.length; i++) {
      ctx.fillStyle = vesselsB[i].alive ? (THEME.danger ?? '#ff4466') : (THEME.textDim ?? '#666');
      ctx.textAlign = 'right';
      ctx.fillText(this._truncate(vesselsB[i].text, 44), px + PANEL_W - PADDING, vesselsY + i * 12);
    }
    ctx.textAlign = 'left';

    // Linia log: header + ostatnie LOG_LINES_MAX zdarzeń
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

    // Zbierz ostatnie LOG_LINES_MAX events z timeline (newest first).
    const recentEvents = this._collectRecentEvents(enc, LOG_LINES_MAX);
    for (let i = 0; i < recentEvents.length; i++) {
      const ev = recentEvents[i];
      const color = ev.fromSide === 'A'
        ? (THEME.success ?? '#44cc66')
        : (THEME.danger ?? '#ff4466');
      ctx.fillStyle = color;
      const ly = logY + 22 + i * LOG_LINE_H;
      ctx.fillText(this._truncate(ev.text, 88), px + PADDING, ly);
    }
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
   */
  _getVesselDetails(enc, sideKey) {
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
        events.push({
          text: `R${round.round}: ${this._truncate(attName, 12)} → ${wn} → ${this._truncate(tgtName, 12)} (${dmgInfo})`,
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

  _truncate(s, max) {
    if (typeof s !== 'string') return '?';
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '…';
  }

  /**
   * Click router — wywoływany przez UIManager.handleClick PRZED inną UI (HUD
   * rysowany na wierzchu overlay'ów). Zwraca true gdy klik został zjedzony.
   */
  handleClick(mx, my) {
    if (this._minimized) return false;
    // „Obserwuj bitwę" — close-up kamery na bitwę.
    const w = this._watchBtnBounds;
    if (w && mx >= w.x && mx <= w.x + w.w && my >= w.y && my <= w.y + w.h) {
      if (w.point) EventBus.emit('camera:watchBattle', { x: w.point.x, y: w.point.y });
      return true;
    }
    const b = this._minimizeBtnBounds;
    if (b && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      this.toggleMinimize();
      return true;
    }
    return false;
  }
}
