// Outliner — prawy panel stały (180px): kolonie, ekspedycje, flota
//
// Inspirowany Stellaris Outlinerem. Zawsze widoczny w trybie civMode.
// Sekcje zwijalne: KOLONIE, EKSPEDYCJE, FLOTA.
// Klik na kolonię → otwórz globus; klik na ekspedycję → focus kamera.

import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { COSMIC }         from '../config/LayoutConfig.js';
import { SHIPS }          from '../data/ShipsData.js';
import { ALL_RESOURCES }  from '../data/ResourcesData.js';
import { COMMODITIES }    from '../data/CommoditiesData.js';
import EventBus            from '../core/EventBus.js';
import EntityManager       from '../core/EntityManager.js';
import { t, getName }     from '../i18n/i18n.js';

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
    // Hover tooltip kolonii
    this._hoveredColonyId = null;
    this._hoveredVesselId = null;
    this._colonyTooltip   = null;
    this._tooltipX        = 0;
    this._tooltipY        = 0;
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
    cy = this._drawSection(ctx, x, cy, 'colonies', t('outliner.colonies', colonies.length), (startY) => {
      // Grupuj kolonie wg systemu gwiezdnego
      const bySystem = new Map();
      for (const col of colonies) {
        const sysId = col.systemId ?? 'sys_home';
        if (!bySystem.has(sysId)) bySystem.set(sysId, []);
        bySystem.get(sysId).push(col);
      }
      // Dodaj odwiedzone układy bez kolonii
      const ssMgr = window.KOSMOS?.starSystemManager;
      if (ssMgr) {
        for (const sys of ssMgr.getAllSystems()) {
          if (!bySystem.has(sys.systemId)) bySystem.set(sys.systemId, []);
        }
      }
      const activeSystemId = ssMgr?.activeSystemId ?? 'sys_home';
      let dy = 0;
      for (const [sysId, sysCols] of bySystem) {
        // Nagłówek gwiazdy — klikalny (przełącza układ)
        const star = EntityManager.getStarOfSystem(sysId);
        const starName = star?.name ?? sysId;
        const isActive = sysId === activeSystemId;
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = isActive ? C.title : C.label;
        const prefix = isActive ? '⭐▸' : '⭐';
        ctx.fillText(`${prefix} ${_truncate(starName, 13)}`, x + PAD, startY + dy + 13);
        this._clickTargets.push({
          type: 'system', systemId: sysId,
          x: x, y: startY + dy, w: OUTLINER_W, h: 16,
        });
        dy += 16;

        if (sysCols.length === 0) {
          // Odwiedzony układ bez kolonii — info
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = C.dim;
          ctx.fillText(t('outliner.noColoniesHere'), x + PAD + 8, startY + dy + 12);
          dy += 16;
        }

        for (const col of sysCols) {
          const iy = startY + dy;
          const icon = col.isHomePlanet ? '🏛' : '🏙';
          const pop = col.civSystem?.population ?? 0;
          const prosp = Math.round(col.prosperitySystem?.prosperity ?? 50);
          const indent = 8; // wcięcie pod nagłówkiem gwiazdy

          // Ikona mapy (🗺) po prawej — klik otwiera globus
          const mapIconX = x + OUTLINER_W - PAD - 12;
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = this._hoveredColonyId === col.planetId ? C.bright : C.mint;
          ctx.fillText('🗺', mapIconX, iy + 14);

          // Nazwa kolonii
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillStyle = C.bright;
          ctx.fillText(`${icon} ${_truncate(col.name, 8)}`, x + PAD + indent, iy + 14);

          // POP + prosperity (przesunięte w lewo — miejsce na ikonę mapy)
          ctx.fillStyle = prosp < 30 ? C.red : prosp < 60 ? C.orange : C.text;
          ctx.textAlign = 'right';
          ctx.fillText(`${pop}👤⭐${prosp}`, mapIconX - 4, iy + 14);
          ctx.textAlign = 'left';

          this._clickTargets.push({
            type: 'colony', planetId: col.planetId, colony: col,
            x: x, y: iy, w: OUTLINER_W, h: ITEM_H,
            mapIconX,
          });
          dy += ITEM_H;
        }
      }
      return Math.max(ITEM_H, dy);
    });

    // ── EKSPEDYCJE ───────────────────────────────────────
    cy = this._drawSection(ctx, x, cy, 'expeditions', t('outliner.expeditions', expeditions.length), (startY) => {
      if (expeditions.length === 0) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = C.dim;
        ctx.fillText(t('outliner.noMissions'), x + PAD, startY + 14);
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
          : exp.status === 'orbiting' ? C.orange : THEME.textPrimary;

        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = color;
        ctx.fillText(`${icon}${arrow}${_truncate(exp.targetName ?? '?', 8)}`, x + PAD, iy + 14);

        const eta = exp.status === 'returning'
          ? `↩${_shortYear(exp.returnYear ?? 0)}`
          : exp.status === 'orbiting'
            ? t('outliner.orbiting')
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
    cy = this._drawSection(ctx, x, cy, 'fleet', t('outliner.fleet', totalShips), (startY) => {
      const queues = shipQueues ?? [];
      if (totalShips === 0 && queues.length === 0) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = C.dim;
        ctx.fillText(t('outliner.noShips'), x + PAD, startY + 14);
        return ITEM_H;
      }

      let dy = 0;

      // Lista indywidualnych statków (klikalne → centruj kamerę)
      const vMgr = window.KOSMOS?.vesselManager;
      if (fleet) {
        for (const vid of fleet) {
          const vessel = vMgr?.getVessel(vid);
          if (!vessel) continue;
          const iy = startY + dy;
          const ship = SHIPS[vessel.shipId];
          const icon = ship?.icon ?? '🚀';
          const vName = _truncate(vessel.name ?? (ship ? getName(ship, 'ship') : vessel.shipId), 14);
          // Status — ikona stanu
          const stIco = vessel.position.state === 'in_transit' ? '→'
                      : vessel.position.state === 'orbiting'   ? '⊙' : '';
          // Hover highlight
          const isHov = vid === this._hoveredVesselId;
          if (isHov) {
            ctx.fillStyle = 'rgba(0,255,180,0.08)';
            ctx.fillRect(x, iy, OUTLINER_W, ITEM_H);
          }
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillStyle = isHov ? C.bright : C.text;
          ctx.fillText(`${icon} ${stIco}${vName}`, x + PAD, iy + 14);
          this._clickTargets.push({
            type: 'vessel', vesselId: vid,
            x, y: iy, w: OUTLINER_W, h: ITEM_H,
          });
          dy += ITEM_H;
        }
      }

      // Queues (budowa w toku — wiele slotów)
      for (const q of queues) {
        const iy = startY + dy;
        const shipDef = SHIPS[q.shipId];
        const frac = q.buildTime > 0 ? q.progress / q.buildTime : 0;
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textPrimary;
        ctx.fillText(t('vessel.status.building', shipDef?.icon ?? '🚀'), x + PAD, iy + 14);

        // Mini pasek
        const barX = x + PAD;
        const barY = iy + 16;
        const barW = OUTLINER_W - PAD * 2;
        const barH = 4;
        ctx.fillStyle = THEME.bgTertiary;
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = THEME.borderActive;
        ctx.fillRect(barX, barY, Math.round(barW * frac), barH);
        ctx.strokeStyle = THEME.border;
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
    ctx.fillStyle = THEME.accentDim ?? 'rgba(0,255,180,0.07)';
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
        if (t.type === 'vessel') {
          // Centruj kamerę 3D na statku — obsłuż PRZED sekcją
          EventBus.emit('vessel:focus', { vesselId: t.vesselId });
          return true;
        }
        if (t.type === 'section') {
          if (t.sectionId === 'fleet') {
            const om = window.KOSMOS?.overlayManager;
            if (om) om.openPanel('fleet');
            else EventBus.emit('civpanel:openTab', { tabId: 'fleet' });
            return true;
          }
          this._sections[t.sectionId] = !this._sections[t.sectionId];
          return true;
        }
        if (t.type === 'colony') {
          const colMgr = window.KOSMOS?.colonyManager;
          const colony = colMgr?.getColony(t.planetId);
          if (!colony?.planet) return true;
          // Klik na ikonę 🗺 → otwórz ColonyOverlay (globus)
          if (t.mapIconX && x >= t.mapIconX) {
            if (colMgr) colMgr.switchActiveColony(t.planetId);
            window.KOSMOS?.overlayManager?.openPanel('colony');
          } else {
            // Klik na nazwę kolonii → focus kamery na planecie (nie otwieramy globusa)
            if (colMgr) colMgr.switchActiveColony(t.planetId);
            EventBus.emit('colony:switched', { planetId: t.planetId });
            EventBus.emit('camera:focusTarget', { targetId: t.planetId });
          }
          return true;
        }
        if (t.type === 'system') {
          const ssMgr = window.KOSMOS?.starSystemManager;
          if (ssMgr) ssMgr.switchActiveSystem(t.systemId);
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

  // ── Hover tooltip kolonii ──────────────────────────────────
  updateHover(mx, my, W, H) {
    this._tooltipX = mx;
    this._tooltipY = my;
    const ox = W - OUTLINER_W;
    if (mx < ox || my < TOP_BAR_H || my > H - BOTTOM_BAR_H) {
      this._hoveredColonyId = null;
      this._colonyTooltip = null;
      return;
    }
    let foundVessel = null;
    for (const t of this._clickTargets) {
      if (mx >= t.x && mx <= t.x + t.w && my >= t.y && my <= t.y + t.h) {
        if (t.type === 'colony') {
          if (this._hoveredColonyId !== t.planetId) {
            this._hoveredColonyId = t.planetId;
            this._colonyTooltip = this._buildColonyTooltip(t.colony);
          }
          this._hoveredVesselId = null;
          return;
        }
        if (t.type === 'vessel') {
          foundVessel = t.vesselId;
        }
      }
    }
    this._hoveredVesselId = foundVessel;
    this._hoveredColonyId = null;
    this._colonyTooltip = null;
  }

  _buildColonyTooltip(colony) {
    if (!colony) return null;
    const lines = [];
    const icon = colony.isHomePlanet ? '🏛' : '🏙';
    lines.push({ text: `${icon} ${colony.name}`, header: true });

    // Typ planety + temperatura
    const planet = colony.planet;
    if (planet) {
      const tempC = planet.temperatureC != null ? Math.round(planet.temperatureC) : (planet.temperatureK ? Math.round(planet.temperatureK - 273) : null);
      const tempStr = tempC !== null ? `${tempC > 0 ? '+' : ''}${tempC}°C` : '';
      lines.push({ text: `${planet.planetType ?? planet.type} ${tempStr}`, color: C.dim });
    }

    // Populacja + prosperity
    const cSys = colony.civSystem;
    if (cSys) {
      const pop = cSys.population ?? 0;
      const housing = cSys.housing ?? 0;
      const prosp = Math.round(colony.prosperitySystem?.prosperity ?? 50);
      lines.push({ text: t('outliner.popInfo', pop, housing, prosp), color: C.text });
      const epoch = colony.prosperitySystem?._getCurrentEpoch?.()?.key ?? 'early';
      lines.push({ text: t('outliner.epoch', t(`epoch.${epoch}`)), color: C.text });
    }

    // Zasoby (z inventory) — kolorowane ikony, łamane po 4/wiersz
    const rSys = colony.resourceSystem;
    if (rSys?.inventory) {
      const segments = []; // { text, color }[]
      for (const [k, v] of rSys.inventory.entries()) {
        if (v <= 0) continue;
        const resDef = ALL_RESOURCES[k];
        const comDef = COMMODITIES[k];
        const icon   = resDef?.icon ?? comDef?.icon ?? '';
        const color  = resDef?.color ?? THEME.yellow;
        segments.push({ label: `${icon}${k}:${Math.floor(v)}`, color });
      }
      // Łącz po 4 segmenty w wiersze — każdy wiersz ma mixed colors
      for (let i = 0; i < segments.length; i += 4) {
        const chunk = segments.slice(i, i + 4);
        lines.push({ segments: chunk });
      }
    }

    // Budynki (lista) — łamane na wiersze po max 3 elementy
    const bSys = colony.buildingSystem;
    if (bSys && bSys._active.size > 0) {
      const bList = [];
      bSys._active.forEach((entry) => {
        const lvl = entry.level ?? 1;
        const lvlStr = lvl > 1 ? ` Lv${lvl}` : '';
        bList.push(`${entry.building.icon ?? '🏗'}${getName(entry.building, 'building')}${lvlStr}`);
      });
      for (let i = 0; i < bList.length; i += 3) {
        lines.push({ text: bList.slice(i, i + 3).join(', '), color: C.dim });
      }
    }

    return lines;
  }

  drawTooltip(ctx) {
    if (!this._colonyTooltip || this._colonyTooltip.length === 0) return;
    const lines = this._colonyTooltip;
    const lineH = 13;
    const padX = 8;
    const padY = 6;
    const smallFont  = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    const headerFont = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;

    // Dynamiczna szerokość — zmierz najdłuższą linię
    let maxTextW = 0;
    for (const line of lines) {
      if (line.segments) {
        // Wiersz wielokolorowy — zmierz łączną szerokość segmentów
        ctx.font = smallFont;
        let segW = 0;
        for (const seg of line.segments) segW += ctx.measureText(seg.label).width + 6;
        maxTextW = Math.max(maxTextW, segW);
      } else {
        ctx.font = line.header ? headerFont : smallFont;
        maxTextW = Math.max(maxTextW, ctx.measureText(line.text).width);
      }
    }
    const ttW = Math.min(480, maxTextW + padX * 2 + 8);
    const ttH = padY * 2 + lines.length * lineH + 2;

    // Pozycja — na lewo od Outlinera
    const logH = ctx.canvas.height / (ctx.getTransform().d || 1);
    let ttX = this._tooltipX - ttW - 8;
    let ttY = this._tooltipY - 10;
    if (ttX < 4) ttX = 4;
    if (ttY + ttH > logH - 4) ttY = logH - ttH - 4;
    if (ttY < 4) ttY = 4;

    // Tło
    ctx.fillStyle = bgAlpha(0.95);
    ctx.fillRect(ttX, ttY, ttW, ttH);
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.strokeRect(ttX, ttY, ttW, ttH);

    // Linie
    let ly = ttY + padY;
    for (const line of lines) {
      if (line.segments) {
        // Wiersz wielokolorowy — rysuj segment po segmencie
        ctx.font = smallFont;
        let sx = ttX + padX;
        for (const seg of line.segments) {
          ctx.fillStyle = seg.color;
          ctx.fillText(seg.label, sx, ly + 10);
          sx += ctx.measureText(seg.label).width + 6;
        }
      } else if (line.header) {
        ctx.font = headerFont;
        ctx.fillStyle = C.bright;
        ctx.fillText(line.text, ttX + padX, ly + 10);
      } else {
        ctx.font = smallFont;
        ctx.fillStyle = line.color ?? C.text;
        ctx.fillText(line.text, ttX + padX, ly + 10);
      }
      ctx.textAlign = 'left';
      ly += lineH;
    }
  }

  // Sprawdza czy punkt nad Outlinerem
  isOver(x, y, W, H) {
    return x >= W - OUTLINER_W && y >= TOP_BAR_H && y <= H - BOTTOM_BAR_H;
  }
}
