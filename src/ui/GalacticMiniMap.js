// GalacticMiniMap — strategiczna mapa galaktyczna (klawisz M)
//
// M4 P2 §3 (plan precious-turtle.md). Canvas overlay top-right corner ~260×280.
// Read-only consumer: galaxyData (systemy 2D), EmpireRegistry (imperia + floty),
// DiplomacySystem (hostility → kolor), IntelSystem (intel-gating arrows).
// Dane re-read per frame — bez cache (data trywialna, ETA musi być live).

import { BaseOverlay }              from './BaseOverlay.js';
import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { COSMIC }                   from '../config/LayoutConfig.js';
import EventBus                     from '../core/EventBus.js';
import { t }                        from '../i18n/i18n.js';

// Wymiary
const PANEL_W    = 260;
const PANEL_H    = 280;
const HEADER_H   = 26;
const PADDING    = 10;
const MAP_INSET  = 4;
const STAR_R_HOME    = 4;
const STAR_R_KNOWN   = 3.5;
const STAR_R_UNKNOWN = 2;

// Mapowanie hostility 0-100 → kolor (zgodne z DiplomacyOverlay)
function hostilityColor(h) {
  if (h <= 30) return THEME.success ?? '#44cc66';
  if (h <= 70) return THEME.warning ?? '#ffcc44';
  return THEME.danger ?? '#ff4466';
}

export class GalacticMiniMap extends BaseOverlay {
  constructor() {
    super(null);

    // Sync state.visible ↔ uiPrefs.miniMapVisible (persistuje w save v70+).
    if (window.KOSMOS?.uiPrefs?.miniMapVisible) this.visible = true;

    // Brak cache — minimap reread danych każdej klatki (read-only, ~5 empire +
    // ~30 systemów ≈ trywialna pętla). ETA musi być live, więc cache i tak nie
    // pomógłby bez subskrypcji time:tick.
  }

  // ── BaseOverlay overrides ─────────────────────────────────────
  show() {
    super.show();
    if (window.KOSMOS?.uiPrefs) window.KOSMOS.uiPrefs.miniMapVisible = true;
  }
  hide() {
    super.hide();
    if (window.KOSMOS?.uiPrefs) window.KOSMOS.uiPrefs.miniMapVisible = false;
  }

  // ── Snapshot danych do rendera (computed per frame — bez cache) ──
  _snapshot() {
    const galaxy = window.KOSMOS?.galaxyData;
    const empReg = window.KOSMOS?.empireRegistry;
    const dipl   = window.KOSMOS?.diplomacySystem;
    const intel  = window.KOSMOS?.intelSystem;
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;

    const systems = galaxy?.systems ?? [];
    const homeSys = systems.find(s => s.id === 'sys_home') ?? null;
    const empires = empReg?.listAll?.() ?? [];

    // Filter empires: tylko z intel >= rumor (unknown niewidoczne)
    const knownEmpires = empires.filter(e =>
      intel ? intel.isAtLeast(e.id, 'rumor') : true
    );

    // Mark known systemy: home + każdy z imperium-known
    const knownSystemIds = new Set(['sys_home']);
    for (const e of knownEmpires) {
      if (e.homeSystemId) knownSystemIds.add(e.homeSystemId);
      for (const col of (e.colonies ?? [])) {
        if (col.systemId) knownSystemIds.add(col.systemId);
      }
    }

    // Auto-scale: zasięg = max dystans od (0,0) wśród known systemów
    let maxDist = 1;
    for (const s of systems) {
      if (!knownSystemIds.has(s.id)) continue;
      const d = Math.sqrt((s.x || 0) ** 2 + (s.y || 0) ** 2);
      if (d > maxDist) maxDist = d;
    }
    // Bufor 15% żeby kółka nie przylegały do krawędzi
    maxDist *= 1.15;

    // Floty z intel >= rumor (na imperium)
    const fleets = [];
    for (const e of knownEmpires) {
      const hostility = dipl?.getHostility?.(e.id) ?? 0;
      const color = hostilityColor(hostility);
      for (const f of (e.fleets ?? [])) {
        if (!f.destSystemId || f.destSystemId === f.systemId) continue;
        const from = systems.find(s => s.id === f.systemId);
        const to   = systems.find(s => s.id === f.destSystemId);
        if (!from || !to) continue;
        const etaYears = Math.max(0, (f.etaYear ?? 0) - gameYear);
        fleets.push({
          fleetId: f.id,
          empireId: e.id,
          fromX: from.x ?? 0, fromY: from.y ?? 0,
          toX:   to.x   ?? 0, toY:   to.y   ?? 0,
          etaYears,
          color,
        });
      }
    }

    return {
      systems, homeSys, empires: knownEmpires,
      knownSystemIds, maxDist, fleets,
      dipl, intel,
    };
  }

  // ── Rysowanie ──────────────────────────────────────────────────
  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];

    // Pozycja top-right — za Outlinerem (zwykle 170px po prawej)
    const px = Math.max(8, W - PANEL_W - 12 - (COSMIC.OUTLINER_W ?? 0));
    const py = (COSMIC.TOP_BAR_H ?? 32) + 18;

    // Tło + ramka
    ctx.fillStyle = bgAlpha(0.55);
    ctx.fillRect(px, py, PANEL_W, PANEL_H);
    ctx.strokeStyle = THEME.borderActive ?? THEME.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, PANEL_W - 1, PANEL_H - 1);

    // Header
    ctx.fillStyle = THEME.accent;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText(`📡 ${t('minimap.title')}`, px + PADDING, py + 18);
    // Close button [×]
    const xBtnSize = 18;
    const xBtnX = px + PANEL_W - xBtnSize - 6;
    const xBtnY = py + 4;
    ctx.strokeStyle = THEME.border;
    ctx.strokeRect(xBtnX + 0.5, xBtnY + 0.5, xBtnSize, xBtnSize);
    ctx.fillStyle = THEME.textSecondary;
    ctx.textAlign = 'center';
    ctx.fillText('×', xBtnX + xBtnSize / 2, xBtnY + xBtnSize / 2 + 5);
    ctx.textAlign = 'left';
    this._addHit(xBtnX, xBtnY, xBtnSize, xBtnSize, 'close');

    // Header separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath();
    ctx.moveTo(px, py + HEADER_H);
    ctx.lineTo(px + PANEL_W, py + HEADER_H);
    ctx.stroke();

    // Obszar mapy
    const mx = px + MAP_INSET;
    const my = py + HEADER_H + MAP_INSET;
    const mw = PANEL_W - 2 * MAP_INSET;
    const mh = PANEL_H - HEADER_H - 2 * MAP_INSET;

    const snap = this._snapshot();
    if (!snap.homeSys) {
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(t('minimap.empty'), px + PANEL_W / 2, py + PANEL_H / 2);
      ctx.textAlign = 'left';
      return;
    }

    // Helper: world (LY) → screen
    const cx = mx + mw / 2;
    const cy = my + mh / 2;
    const halfMin = Math.min(mw, mh) / 2 - 8;
    const scale = halfMin / Math.max(1, snap.maxDist);
    const toScreen = (wx, wy) => ({
      sx: cx + (wx - (snap.homeSys.x || 0)) * scale,
      sy: cy + (wy - (snap.homeSys.y || 0)) * scale,
    });

    // Subtle grid (krzyż przez home)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.moveTo(cx - halfMin, cy); ctx.lineTo(cx + halfMin, cy);
    ctx.moveTo(cx, cy - halfMin); ctx.lineTo(cx, cy + halfMin);
    ctx.stroke();

    // Strzałki flot (najpierw, żeby kółka systemów rysowały się na wierzchu)
    for (const f of snap.fleets) {
      const p1 = toScreen(f.fromX, f.fromY);
      const p2 = toScreen(f.toX,   f.toY);
      this._drawArrow(ctx, p1.sx, p1.sy, p2.sx, p2.sy, f.color);

      // ETA label przy środku strzałki
      const lx = (p1.sx + p2.sx) / 2;
      const ly = (p1.sy + p2.sy) / 2;
      ctx.fillStyle = f.color;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.textAlign = 'left';
      ctx.fillText(t('minimap.fleetETA', f.etaYears.toFixed(1)), lx + 3, ly - 2);
    }

    // Systemy
    for (const s of snap.systems) {
      const isKnown = snap.knownSystemIds.has(s.id);
      const isHome  = s.id === 'sys_home';
      const { sx, sy } = toScreen(s.x || 0, s.y || 0);
      // Out-of-bounds clip
      if (sx < mx || sx > mx + mw || sy < my || sy > my + mh) continue;

      let color = isHome ? THEME.accent : (isKnown ? null : THEME.textDim);
      let radius = isHome ? STAR_R_HOME : (isKnown ? STAR_R_KNOWN : STAR_R_UNKNOWN);

      // Jeśli system należy do empire i intel >= rumor → kolor hostility
      if (!isHome && isKnown) {
        const emp = snap.empires.find(e =>
          e.homeSystemId === s.id ||
          (e.colonies ?? []).some(c => c.systemId === s.id)
        );
        if (emp) {
          const h = snap.dipl?.getHostility?.(emp.id) ?? 0;
          color = hostilityColor(h);
        } else {
          color = THEME.textSecondary;
        }
      }

      ctx.beginPath();
      ctx.fillStyle = color ?? THEME.textDim;
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Home: pierścień akcent
      if (isHome) {
        ctx.strokeStyle = THEME.accent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Hit zone — klik = zoom kamery (M4 P2 placeholder: no-op dla 1-system)
      this._addHit(sx - radius - 2, sy - radius - 2,
                   radius * 2 + 4, radius * 2 + 4,
                   'system', { systemId: s.id });
    }

    // Legenda — dwie linie u dołu
    const legY = my + mh - 12;
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'left';
    ctx.fillText(`★ ${t('minimap.legendHome')}`, mx + 4, legY);
  }

  _drawArrow(ctx, x1, y1, x2, y2, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    // Grot
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    const ux = dx / len, uy = dy / len;
    const HEAD = 6;
    const px = -uy, py = ux; // wektor prostopadły
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ux * HEAD + px * HEAD * 0.5,
               y2 - uy * HEAD + py * HEAD * 0.5);
    ctx.lineTo(x2 - ux * HEAD - px * HEAD * 0.5,
               y2 - uy * HEAD - py * HEAD * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  _onHit(zone) {
    if (zone.type === 'close') {
      this.hide();
      // Sync OverlayManager.active state
      const om = window.KOSMOS?.overlayManager;
      if (om && om.active === 'minimap') om.active = null;
      return;
    }
    if (zone.type === 'system') {
      // M4 P2 placeholder: w 1-system trybie nic nie robimy. M5 multi-system:
      // GalaxyMapScene.openSystem(zone.data.systemId).
      // Devtools hook: emit dla future fly-to.
      EventBus.emit('minimap:systemClicked', { systemId: zone.data.systemId });
      return;
    }
  }
}
