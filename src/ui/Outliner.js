// Outliner — prawy panel stały (180px): kolonie, ekspedycje, flota
//
// Inspirowany Stellaris Outlinerem. Zawsze widoczny w trybie civMode.
// Sekcje zwijalne: KOLONIE, EKSPEDYCJE, FLOTA.
// Klik na kolonię → otwórz globus; klik na ekspedycję → focus kamera.

import { THEME, bgAlpha, drawGlassPanel, hexToRgb } from '../config/ThemeConfig.js';
import { COSMIC }         from '../config/LayoutConfig.js';
import { SHIPS }          from '../data/ShipsData.js';
import { HULLS }          from '../data/HullsData.js';
import { BUILDINGS }      from '../data/BuildingsData.js';
import { ALL_RESOURCES }  from '../data/ResourcesData.js';
import { COMMODITIES }    from '../data/CommoditiesData.js';
import EventBus            from '../core/EventBus.js';
import EntityManager       from '../core/EntityManager.js';
import { t, getName }     from '../i18n/i18n.js';
import { resolveBodyName } from '../utils/BodyName.js';

const OUTLINER_W = COSMIC.OUTLINER_W;   // 150px (Slice 5 — węższy)
const TOP_BAR_H  = COSMIC.TOP_BAR_H;   // 50px
const BOTTOM_BAR_H = COSMIC.BOTTOM_BAR_H; // 26px
const RESOURCE_BAR_H = COSMIC.RESOURCE_BAR_H; // 28px — pasek surowców pod Outlinerem
const BOTTOM_NAV_H = COSMIC.BOTTOM_NAV_H; // 44px — UI v3 stały dolny pasek nawigacji (civMode)
const BOTTOM_LOG_TRIG_H = COSMIC.BOTTOM_LOG_TRIG_H; // 6px — listwa schowanego dziennika
// Panel kończy się NAD stałym paskiem nawigacji + listwą dziennika (paski pełnej szerokości
// wchodzą pod kolumnę Outlinera), więc rezerwujemy u dołu sumę.
const BOTTOM_RESERVED = BOTTOM_NAV_H + BOTTOM_LOG_TRIG_H + RESOURCE_BAR_H;

const SECTION_HDR_H = 18; // wysokość nagłówka sekcji (kompaktowo)
const ITEM_H = 18;        // wysokość elementu listy (kompaktowo)
const PAD = 5;
// Górny obszar drawera (wysokość chipa czasu w prawym rogu) — tło PRZEZROCZYSTE i klik
// przepuszczany, żeby chip pozostał widoczny i klikalny "przez" drawer. Treść startuje niżej.
const CHIP_CLEAR_H = 30;

// Slice C — prawy wysuwany drawer (gdy aktywny overlay pełnoekranowy zasłania dok)
const OUTLINER_TRIGGER_W  = 6;    // pasek-trigger na prawej krawędzi
const OUTLINER_ANIM_SPEED = 0.16; // przyrost slide/klatkę (wzór NavDrawer)
const OUTLINER_HIDE_DELAY = 300;  // ms — opóźnienie chowania po opuszczeniu hovera

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
      colonies:     true,  // domyślnie rozwinięta
      expeditions:  true,
      fleet:        true,
      queue:        true,
      groundUnits:  true,
    };
    // Hit-rects do kliknięć
    this._clickTargets = [];
    // Hover tooltip kolonii
    this._hoveredColonyId = null;
    this._hoveredVesselId = null;
    this._hoveredGroundUnitId = null;
    this._colonyTooltip   = null;
    this._tooltipX        = 0;
    this._tooltipY        = 0;

    // Slice C — tryb prawego wysuwanego drawera (ustawiany co klatkę przez UIManager
    // = !!overlayManager.active). Gdy false → dok jak dotąd (zawsze widoczny).
    this._drawerMode     = false;
    this._prevDrawerMode = false;
    this._slideProgress  = 1;     // 1=wysunięty/dokowany, 0=schowany za prawą krawędzią
    this._hovered        = false;
    this._hideAt         = 0;     // ms timestamp planowanego schowania (0=brak)
    this._slideOffX      = 0;     // bieżące przesunięcie X panelu (px) — dla hit/hover
    // Modyfikatory ostatniego kliku (propagowane przez GameScene, wzór ColonyOverlay) —
    // CTRL+klik statku = multi-select. Ustawiane PRZED hitTest.
    this._lastMouseMods  = { shift: false, ctrl: false };
  }

  // ── Rysowanie ───────────────────────────────────────────
  draw(ctx, W, H, state) {
    const { colonies, expeditions, fleet, shipQueues } = state;

    const y = 0;                   // pełna wysokość od górnej krawędzi (jak NavDrawer po lewej)
    const h = H - BOTTOM_RESERVED;  // do nad dolnym paskiem

    // ── Slice C — tryb drawer: slide z prawej krawędzi gdy aktywny overlay ──
    if (this._drawerMode !== this._prevDrawerMode) {
      this._prevDrawerMode = this._drawerMode;
      this._slideProgress  = this._drawerMode ? 0 : 1;  // wejście w drawer → schowany
      this._hovered = false; this._hideAt = 0;
    }
    if (this._drawerMode) {
      if (this._hideAt > 0 && Date.now() >= this._hideAt) { this._hideAt = 0; this._hovered = false; }
      const tgt = this._hovered ? 1 : 0;
      if (tgt > this._slideProgress)      this._slideProgress = Math.min(1, this._slideProgress + OUTLINER_ANIM_SPEED);
      else if (tgt < this._slideProgress) this._slideProgress = Math.max(0, this._slideProgress - OUTLINER_ANIM_SPEED);
    } else {
      this._slideProgress = 1;
    }
    const offX = this._drawerMode ? Math.round(OUTLINER_W * (1 - this._slideProgress)) : 0;
    this._slideOffX = offX;

    // Trigger 6px na prawej krawędzi (zawsze widoczny w trybie drawer)
    if (this._drawerMode) {
      const a = hexToRgb(THEME.accent);
      const trigActive = this._hovered || this._slideProgress > 0.001;
      ctx.fillStyle = `rgba(${a.r},${a.g},${a.b},${trigActive ? 0.85 : 0.4})`;
      ctx.fillRect(W - OUTLINER_TRIGGER_W, 0, OUTLINER_TRIGGER_W, H);   // PEŁNA wysokość (0..H) — bez przerw przy rogach
      if (this._slideProgress <= 0.001) { this._clickTargets = []; return; }  // schowany — koniec
    }

    const x = W - OUTLINER_W + offX;   // dokowany (offX=0) lub wysunięty z prawej

    // Tło: PEŁNE krycie — prawy drawer zasłania treść pod sobą (ColonyOverlay itp.).
    // GÓRNY obszar (y < CHIP_CLEAR_H) PRZEZROCZYSTY — chip czasu widoczny i klikalny przez drawer.
    ctx.fillStyle = bgAlpha(1);
    ctx.fillRect(x, CHIP_CLEAR_H, OUTLINER_W, h - CHIP_CLEAR_H);
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 0.5, CHIP_CLEAR_H); ctx.lineTo(x + 0.5, y + h); ctx.stroke();

    this._clickTargets = [];
    let cy = CHIP_CLEAR_H + 4;   // treść startuje pod przezroczystym obszarem chipa

    // ── KOLONIE ──────────────────────────────────────────
    cy = this._drawSection(ctx, x, cy, 'colonies', t('outliner.colonies', colonies.length), (startY) => {
      // Grupuj kolonie wg systemu gwiezdnego
      const bySystem = new Map();
      for (const col of colonies) {
        const sysId = col.systemId ?? 'sys_home';
        if (!bySystem.has(sysId)) bySystem.set(sysId, []);
        bySystem.get(sysId).push(col);
      }
      // Dodaj odwiedzone układy bez kolonii (z StarSystemManager)
      const ssMgr = window.KOSMOS?.starSystemManager;
      if (ssMgr) {
        for (const sys of ssMgr.getAllSystems()) {
          if (!bySystem.has(sys.systemId)) bySystem.set(sys.systemId, []);
        }
      }
      // Dodaj układy w których przebywają statki (fallback gdy SSM nie ma wpisu)
      const vMgr = window.KOSMOS?.vesselManager;
      if (vMgr) {
        for (const v of vMgr.getAllVessels()) {
          const vsId = v.systemId;
          if (vsId && !bySystem.has(vsId)) bySystem.set(vsId, []);
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
          const indent = 8; // wcięcie pod nagłówkiem gwiazdy

          // Ikona mapy (🗺) po prawej — klik otwiera globus
          const mapIconX = x + OUTLINER_W - PAD - 12;
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = this._hoveredColonyId === col.planetId ? C.bright : C.mint;
          ctx.fillText('🗺', mapIconX, iy + 14);

          // Nazwa kolonii (Slice 5 — kompakt: tylko nazwa; POP/prosperity w tooltipie hover)
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillStyle = C.bright;
          ctx.fillText(`${icon} ${_truncate(col.name, 16)}`, x + PAD + indent, iy + 14);

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
        const icon = exp.type === 'colony' ? '🚢'
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

      // Statki pogrupowane po stanie (W locie / Na orbicie / W hangarze). Klik wiersza = zaznacz
      // (→ FleetGroupPanel) + kamera; CTRL+klik = multi-toggle. Zaznaczone podświetlone; lokacja
      // (ciało) po prawej. Wraki pominięte. Umożliwia zaznaczenie ZADOKOWANYCH (brak sprite'a 3D).
      const vMgr = window.KOSMOS?.vesselManager;
      const selSet = new Set(window.KOSMOS?.uiManager?.getSelectedVesselIds?.() ?? []);
      const FLEET_GROUPS = [
        { state: 'in_transit', label: t('outliner.fleetInTransit') },
        { state: 'orbiting',   label: t('outliner.fleetOrbiting') },
        { state: 'docked',     label: t('outliner.fleetDocked') },
      ];
      if (fleet) {
        const byState = { in_transit: [], orbiting: [], docked: [] };
        for (const vid of fleet) {
          const vessel = vMgr?.getVessel(vid);
          if (!vessel || vessel.isWreck) continue;
          const st = vessel.position?.state ?? 'docked';
          (byState[st] ?? byState.docked).push(vessel);
        }
        for (const g of FLEET_GROUPS) {
          const ships = byState[g.state];
          if (!ships || ships.length === 0) continue;
          // Sub-nagłówek grupy stanu
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = C.label;
          ctx.fillText(`${g.label} (${ships.length})`, x + PAD, startY + dy + 12);
          dy += SECTION_HDR_H - 2;
          for (const vessel of ships) {
            const vid = vessel.id;
            const iy = startY + dy;
            const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
            const icon = ship?.icon ?? '🚀';
            const isSel = selSet.has(vid);
            const isHov = vid === this._hoveredVesselId;
            if (isSel)      { ctx.fillStyle = THEME.accentMed; ctx.fillRect(x, iy, OUTLINER_W, ITEM_H); }
            else if (isHov) { ctx.fillStyle = THEME.accentDim; ctx.fillRect(x, iy, OUTLINER_W, ITEM_H); }
            // Lokacja po prawej (ciało / cel / powrót)
            let loc = '';
            if (g.state === 'docked' || g.state === 'orbiting') loc = resolveBodyName(vessel.position?.dockedAt);
            else if (vessel.mission?.phase === 'returning')      loc = t('outliner.fleetReturn');
            else                                                 loc = resolveBodyName(vessel.mission?.targetId);
            // Nazwa po lewej (krótsza gdy jest lokacja)
            ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
            ctx.fillStyle = (isSel || isHov) ? C.bright : C.text;
            const vName = _truncate(vessel.name ?? (ship ? getName(ship, 'ship') : vessel.shipId), loc ? 11 : 17);
            ctx.fillText(`${icon} ${vName}`, x + PAD, iy + 14);
            if (loc) {
              ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
              ctx.fillStyle = C.dim;
              ctx.textAlign = 'right';
              ctx.fillText(_truncate(loc, 10), x + OUTLINER_W - PAD, iy + 14);
              ctx.textAlign = 'left';
            }
            this._clickTargets.push({ type: 'vessel', vesselId: vid, x, y: iy, w: OUTLINER_W, h: ITEM_H });
            dy += ITEM_H;
          }
        }
      }

      // Queues (budowa w toku — wiele slotów)
      for (const q of queues) {
        const iy = startY + dy;
        const shipDef = SHIPS[q.shipId] ?? HULLS[q.shipId];
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

    // ── KOLEJKA ─────────────────────────────────────────────
    const queueItems = this._buildQueueItems(state) ?? [];
    if (queueItems.length > 0) {
      cy = this._drawSection(ctx, x, cy, 'queue', t('outliner.queue', queueItems.length), (startY) => {
        let dy = 0;
        const maxShow = 8;
        const shown = queueItems.slice(0, maxShow);
        for (const item of shown) {
          const iy = startY + dy;

          // Ikona typu + nazwa
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = item.blocked ? C.orange : C.text;
          ctx.fillText(`${item.icon} ${_truncate(item.name, 12)}`, x + PAD, iy + 12);

          // Przycisk anulowania (✕) po prawej — tylko dla elementów z cancelData
          const cancelBtnW = 14;
          const cancelBtnX = x + OUTLINER_W - cancelBtnW;
          // Prawa krawędź dla labelek/pasków (z miejscem na ✕ jeśli jest)
          const rightEdge = item.cancelData ? (cancelBtnX - 2) : (x + OUTLINER_W - PAD);

          // Prawa strona: pasek progresu lub status oczekiwania
          if (item.progress != null && item.total != null && item.total > 0) {
            // Pasek progresu
            const frac = Math.min(1, item.progress / item.total);
            const barW = 36;
            const barX = rightEdge - barW;
            const barY = iy + 3;
            const barH = 4;
            ctx.fillStyle = THEME.bgTertiary;
            ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = item.blocked ? C.orange : THEME.borderActive;
            ctx.fillRect(barX, barY, Math.round(barW * frac), barH);
            ctx.strokeStyle = THEME.border;
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barW, barH);
            // Procent pod paskiem
            ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
            ctx.fillStyle = C.dim;
            ctx.textAlign = 'right';
            ctx.fillText(`${Math.floor(frac * 100)}%`, rightEdge, iy + 14);
            ctx.textAlign = 'left';
          } else if (item.qtyLabel) {
            // Kolejka fabryki — ilość
            ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
            ctx.fillStyle = C.dim;
            ctx.textAlign = 'right';
            ctx.fillText(item.qtyLabel, rightEdge, iy + 12);
            ctx.textAlign = 'left';
          } else {
            // Oczekuje na zasoby
            ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
            ctx.fillStyle = C.orange;
            ctx.textAlign = 'right';
            ctx.fillText('⌛', rightEdge, iy + 12);
            ctx.textAlign = 'left';
          }
          if (item.cancelData) {
            ctx.font = `bold ${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
            ctx.fillStyle = THEME.danger ?? '#ff3344';
            ctx.textAlign = 'center';
            ctx.fillText('✕', cancelBtnX + cancelBtnW / 2, iy + 13);
            ctx.textAlign = 'left';
            // Oddzielny click target dla ✕
            this._clickTargets.push({
              type: 'queueCancel', cancelData: item.cancelData,
              x: cancelBtnX, y: iy, w: cancelBtnW, h: ITEM_H,
            });
          }

          // Dodatkowy wiersz z brakującymi zasobami (outpost pending)
          let extraH = 0;
          if (item.missingTooltip) {
            extraH = 12;
            ctx.font = `${THEME.fontSizeSmall - 3}px ${THEME.fontFamily}`;
            ctx.fillStyle = C.orange;
            ctx.fillText(`  ${_truncate(item.missingTooltip, 28)}`, x + PAD, iy + ITEM_H + 2);
          }

          this._clickTargets.push({
            type: 'queueItem', queueType: item.queueType,
            x, y: iy, w: OUTLINER_W - (item.cancelData ? cancelBtnW : 0), h: ITEM_H + extraH,
          });
          dy += ITEM_H + extraH;
        }
        // Overflow
        if (queueItems.length > maxShow) {
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = C.dim;
          ctx.fillText(`  (+${queueItems.length - maxShow} ${t('outliner.queueMore')})`, x + PAD, startY + dy + 12);
          dy += 16;
        }
        return Math.max(ITEM_H, dy);
      });
    }

    // ── JEDNOSTKI NAZIEMNE ─────────────────────────────────
    const groundUnits = state.groundUnits ?? [];
    cy = this._drawSection(ctx, x, cy, 'groundUnits', t('outliner.groundUnits', groundUnits.length), (startY) => {
      if (groundUnits.length === 0) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = C.dim;
        ctx.fillText(t('outliner.noGroundUnits'), x + PAD, startY + 14);
        return ITEM_H;
      }

      let dy = 0;
      for (const unit of groundUnits) {
        const iy = startY + dy;
        const icon = unit.type === 'science_rover' ? '🤖' : '🔧';
        const statusIco = unit.status === 'moving' ? '→'
                        : unit.status === 'scanning' ? '🔍'
                        : unit.status === 'working' ? '⚙' : '';

        // Hover highlight
        const isHov = unit.id === this._hoveredGroundUnitId;
        if (isHov) {
          ctx.fillStyle = THEME.accentDim;
          ctx.fillRect(x, iy, OUTLINER_W, ITEM_H);
        }

        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = isHov ? C.bright : C.text;
        const label = _truncate(t(`groundUnit.${unit.type}`) ?? unit.type, 10);
        ctx.fillText(`${icon} ${statusIco}${label}`, x + PAD, iy + 14);

        // Nazwa planety po prawej
        ctx.fillStyle = C.label;
        ctx.textAlign = 'right';
        ctx.fillText(_truncate(unit.planetName ?? '', 6), x + OUTLINER_W - PAD, iy + 14);
        ctx.textAlign = 'left';

        this._clickTargets.push({
          type: 'groundUnit', unitId: unit.id, planetId: unit.planetId,
          x, y: iy, w: OUTLINER_W, h: ITEM_H,
        });
        dy += ITEM_H;
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

    // Mały, muted, WERSALIKI + subtelny letter-spacing (zgodnie z resztą UI).
    const arrow = open ? '▼' : '►';
    ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.dim;
    ctx.textAlign = 'left';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
    ctx.fillText(`${arrow} ${String(title).toUpperCase()}`, x + PAD, cy + SECTION_HDR_H / 2 + 3);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

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
    // Slice C — drawer trigger (prawa krawędź) ma priorytet; otwiera na klik.
    if (this._drawerMode) {
      if (x >= W - OUTLINER_TRIGGER_W - 2 && y >= 0 && y <= H) {   // trigger: pełna wysokość
        this._hovered = true; this._hideAt = 0;
        return true;
      }
      if (this._slideProgress <= 0.001) return false;   // schowany — nic do trafienia
    }
    const ox = W - OUTLINER_W + (this._slideOffX ?? 0);
    // y < CHIP_CLEAR_H → przepuść klik (chip czasu pod przezroczystą górą drawera).
    if (x < ox || y < CHIP_CLEAR_H || y > H - BOTTOM_RESERVED) return false;

    for (const t of this._clickTargets) {
      if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) {
        if (t.type === 'vessel') {
          // Klik = zaznacz (→ FleetGroupPanel, komenda z mapy/PPM) + kamera; CTRL+klik = multi-toggle.
          // Działa też dla ZADOKOWANYCH (brak sprite'a 3D) — jedyna droga ich zaznaczenia.
          const um = window.KOSMOS?.uiManager;
          if (this._lastMouseMods?.ctrl && um?.toggleSelection) {
            um.toggleSelection(t.vesselId);
          } else {
            um?.setSelectedVesselId?.(t.vesselId);
            EventBus.emit('vessel:focus', { vesselId: t.vesselId });   // kamera (docked → ciało hangaru)
          }
          return true;
        }
        if (t.type === 'section') {
          // Slice 5 — wszystkie sekcje (w tym Fleet) zwijają się jednolicie.
          // Dawny skrót „klik nagłówka Fleet → otwórz FleetManager" usunięty:
          // FleetManager jest teraz dostępny z górnego paska nawigacji (🚀, klawisz F).
          this._sections[t.sectionId] = !this._sections[t.sectionId];
          return true;
        }
        if (t.type === 'system') {
          // Klik na nagłówek gwiazdy → przełącz widok na ten układ
          const ssMgr = window.KOSMOS?.starSystemManager;
          if (ssMgr && ssMgr.activeSystemId !== t.systemId) {
            ssMgr.switchActiveSystem(t.systemId);
          }
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
            // Przełącz układ jeśli kolonia w innym systemie
            const colSysId = colony.systemId ?? 'sys_home';
            const curSysId = window.KOSMOS?.starSystemManager?.activeSystemId;
            if (curSysId && colSysId !== curSysId) {
              window.KOSMOS.starSystemManager.switchActiveSystem(colSysId);
            }
            if (colMgr) colMgr.switchActiveColony(t.planetId);
            EventBus.emit('colony:switched', { planetId: t.planetId });
            EventBus.emit('camera:focusTarget', { targetId: t.planetId });
          }
          return true;
        }
        if (t.type === 'expedition') {
          if (t.targetId) {
            EventBus.emit('camera:focusTarget', { targetId: t.targetId });
          }
          return true;
        }
        if (t.type === 'queueCancel') {
          this._cancelQueueItem(t.cancelData);
          return true;
        }
        if (t.type === 'queueItem') {
          const om = window.KOSMOS?.overlayManager;
          if (t.queueType === 'building') {
            if (om) om.openPanel('colony');
          } else if (t.queueType === 'ship') {
            if (om) om.openPanel('fleet');
          } else if (t.queueType === 'factory') {
            if (om) om.openPanel('economy');
          } else if (t.queueType === 'outpost') {
            if (om) om.openPanel('fleet');
          }
          return true;
        }
        if (t.type === 'groundUnit') {
          // Przełącz na kolonię jednostki i otwórz ColonyOverlay z zaznaczeniem jednostki
          const colMgr = window.KOSMOS?.colonyManager;
          if (colMgr) colMgr.switchActiveColony(t.planetId);
          const om = window.KOSMOS?.overlayManager;
          if (om) om.openPanel('colony');
          // Zaznacz jednostkę w ColonyOverlay
          EventBus.emit('groundUnit:select', { unitId: t.unitId });
          return true;
        }
      }
    }

    return true; // pochłoń klik w Outlinerze
  }

  // ── Anulowanie elementu kolejki ────────────────────────────
  _cancelQueueItem(cancelData) {
    try {
      const colMgr = window.KOSMOS?.colonyManager;
      const activePid = colMgr?.activePlanetId;
      const activeCol = activePid ? colMgr.getColony(activePid) : null;

      switch (cancelData.type) {
        case 'construction': {
          // Anulowanie aktywnej budowy via tileKey
          const bSys = activeCol?.buildingSystem ?? window.KOSMOS?.buildingSystem;
          if (bSys && cancelData.tileKey) {
            bSys.cancelConstruction(cancelData.tileKey);
          }
          break;
        }
        case 'pendingBuild': {
          const bSys = activeCol?.buildingSystem ?? window.KOSMOS?.buildingSystem;
          if (bSys && cancelData.tileKey) {
            bSys.cancelPending(cancelData.tileKey);
          }
          break;
        }
        case 'pendingShip': {
          if (colMgr && activePid && cancelData.orderId) {
            colMgr.cancelPendingShip(activePid, cancelData.orderId);
          }
          break;
        }
        case 'pendingOutpost': {
          if (colMgr && activePid && cancelData.orderId) {
            colMgr.cancelPendingOutpostOrder(activePid, cancelData.orderId);
          }
          break;
        }
        case 'factoryQueue': {
          const fSys = activeCol?.factorySystem ?? window.KOSMOS?.factorySystem;
          if (fSys && cancelData.index != null) {
            fSys.dequeue(cancelData.index);
          }
          break;
        }
      }
    } catch (e) {
      console.warn('[Outliner] cancel error:', e);
    }
  }

  // ── Hover tooltip kolonii ──────────────────────────────────
  updateHover(mx, my, W, H) {
    this._tooltipX = mx;
    this._tooltipY = my;
    // Slice C — drawer hover (trigger + panel) steruje wysuwaniem / auto-chowaniem.
    if (this._drawerMode) {
      const offX = this._slideOffX ?? 0;
      const overTrigger = mx >= W - OUTLINER_TRIGGER_W - 2 && my >= 0 && my <= H;   // trigger: pełna wysokość
      const overPanel   = this._slideProgress > 0.01 && mx >= (W - OUTLINER_W + offX) && my >= CHIP_CLEAR_H && my <= H - BOTTOM_RESERVED;
      if (overTrigger || overPanel) { this._hovered = true; this._hideAt = 0; }
      else if (this._hovered && this._hideAt === 0) { this._hideAt = Date.now() + OUTLINER_HIDE_DELAY; }
    }
    const ox = W - OUTLINER_W + (this._slideOffX ?? 0);
    if (mx < ox || my < CHIP_CLEAR_H || my > H - BOTTOM_RESERVED) {
      this._hoveredColonyId = null;
      this._hoveredGroundUnitId = null;
      this._colonyTooltip = null;
      return;
    }
    let foundVessel = null;
    let foundGroundUnit = null;
    for (const t of this._clickTargets) {
      if (mx >= t.x && mx <= t.x + t.w && my >= t.y && my <= t.y + t.h) {
        if (t.type === 'colony') {
          if (this._hoveredColonyId !== t.planetId) {
            this._hoveredColonyId = t.planetId;
            this._colonyTooltip = this._buildColonyTooltip(t.colony);
          }
          this._hoveredVesselId = null;
          this._hoveredGroundUnitId = null;
          return;
        }
        if (t.type === 'vessel') {
          foundVessel = t.vesselId;
        }
        if (t.type === 'groundUnit') {
          foundGroundUnit = t.unitId;
        }
      }
    }
    this._hoveredVesselId = foundVessel;
    this._hoveredGroundUnitId = foundGroundUnit;
    this._hoveredColonyId = null;
    this._colonyTooltip = null;
  }

  // Zbierz wszystkie elementy kolejki z aktywnej kolonii
  _buildQueueItems(state) {
    const items = [];
    try {
      const { constructionQueue, pendingBuilds, pendingShipOrders, pendingOutpostOrders, factoryQueue } = state;

      // 1. Budowa budynków — aktywna (z paskiem progresu)
      if (constructionQueue) {
        for (const entry of constructionQueue) {
          const bDef = BUILDINGS[entry.buildingId];
          const bName = bDef ? getName(bDef, 'building') : entry.buildingId;
          const name = entry.isUpgrade ? `${bName} →Lv${entry.targetLevel}` : bName;
          items.push({
            queueType: 'building',
            icon: bDef?.icon ?? '🏗',
            name,
            progress: entry.progress,
            total: entry.buildTime,
            blocked: false,
            cancelData: { type: 'construction', tileKey: entry.tileKey },
          });
        }
      }

      // 2. Budynki oczekujące na zasoby
      if (pendingBuilds) {
        for (const order of pendingBuilds) {
          const bDef = BUILDINGS[order.buildingId];
          const bName = bDef ? getName(bDef, 'building') : order.buildingId;
          const name = order.isUpgrade ? `${bName} →Lv${order.targetLevel}` : bName;
          items.push({
            queueType: 'building',
            icon: bDef?.icon ?? '🏗',
            name,
            progress: null, total: null,
            blocked: true,
            cancelData: { type: 'pendingBuild', tileKey: order.tileKey },
          });
        }
      }

      // 3. Budowa statków — oczekujące na zasoby
      if (pendingShipOrders) {
        for (const order of pendingShipOrders) {
          const sDef = SHIPS[order.shipId] ?? HULLS[order.shipId];
          items.push({
            queueType: 'ship',
            icon: sDef?.icon ?? '🚀',
            name: sDef ? getName(sDef, 'ship') : order.shipId,
            progress: null, total: null,
            blocked: true,
            cancelData: { type: 'pendingShip', orderId: order.id },
          });
        }
      }

      // 4. Oczekujące outposty — z informacją o brakujących zasobach
      if (pendingOutpostOrders) {
        for (const order of pendingOutpostOrders) {
          const target = EntityManager.get(order.targetId);
          const bDef = BUILDINGS[order.buildingId];
          const bName = bDef ? getName(bDef, 'building') : order.buildingId;
          const tName = order.targetName ?? target?.name ?? '?';

          // Oblicz procent gotowości (ile zasobów już mamy z potrzebnych)
          let totalNeeded = 0, totalHave = 0;
          const missing = [];
          const inv = state.inventory ?? {};
          if (order.cost) {
            for (const [resId, need] of Object.entries(order.cost)) {
              if (need <= 0) continue;
              const have = inv[resId] ?? 0;
              totalNeeded += need;
              totalHave += Math.min(have, need);
              if (have < need) {
                const cDef = COMMODITIES[resId] ?? ALL_RESOURCES[resId];
                const shortName = cDef ? getName(cDef, 'commodity') : resId;
                missing.push(`${shortName}: ${Math.floor(have)}/${need}`);
              }
            }
          }
          const pct = totalNeeded > 0 ? Math.floor((totalHave / totalNeeded) * 100) : 0;

          items.push({
            queueType: 'outpost',
            icon: '🏕',
            name: bName,
            subtitle: `→ ${tName}`,
            progress: pct, total: 100,
            blocked: true,
            missingTooltip: missing.length > 0 ? missing.join(', ') : null,
            cancelData: { type: 'pendingOutpost', orderId: order.id },
          });
        }
      }

      // 5. Aktywna produkcja fabryki (alokacje)
      const factoryAllocations = state.factoryAllocations;
      if (factoryAllocations) {
        for (const a of factoryAllocations) {
          const cDef = COMMODITIES[a.commodityId];
          const pct = a.pctComplete != null ? Math.floor(a.pctComplete) : 0;
          const produced = a.produced ?? 0;
          const target = a.targetQty;
          const label = target ? `${produced}/${target}` : `${produced}`;
          items.push({
            queueType: 'factory',
            icon: cDef?.icon ?? '🏭',
            name: cDef ? getName(cDef, 'commodity') : a.commodityId,
            progress: a.pctComplete != null ? a.pctComplete : null,
            total: 100,
            blocked: a.paused ?? false,
            qtyLabel: label,
          });
        }
      }

      // 6. Kolejka fabryki (oczekujące)
      if (factoryQueue) {
        for (let qi = 0; qi < factoryQueue.length; qi++) {
          const q = factoryQueue[qi];
          const cDef = COMMODITIES[q.commodityId];
          items.push({
            queueType: 'factory',
            icon: cDef?.icon ?? '🏭',
            name: cDef ? getName(cDef, 'commodity') : q.commodityId,
            progress: null, total: null,
            blocked: false,
            qtyLabel: `⏳×${q.qty}`,
            cancelData: { type: 'factoryQueue', index: qi },
          });
        }
      }
    } catch (e) {
      console.warn('[Outliner] _buildQueueItems error:', e);
    }

    return items;
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
      const dPop = cSys.displayPopulation ?? 0;
      const dPopStr = dPop >= 1_000_000 ? `${(dPop/1_000_000).toFixed(1)}M` : dPop >= 1_000 ? `${(dPop/1_000).toFixed(0)}k` : `${dPop}`;
      const housing = cSys.effectiveHousing ?? 0;
      const prosp = Math.round(colony.prosperitySystem?.prosperity ?? 50);
      lines.push({ text: `👤 ${dPopStr} (${pop}/${housing === Infinity ? '∞' : housing} POP)  ⭐${prosp}`, color: C.text });
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
    ctx.fillStyle = bgAlpha(0.82);
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

  // Sprawdza czy punkt nad Outlinerem (uwzględnia tryb drawer + slide)
  isOver(x, y, W, H) {
    if (this._drawerMode) {
      if (x >= W - OUTLINER_TRIGGER_W - 2 && y >= 0 && y <= H) return true;   // trigger: pełna wysokość
      if (this._slideProgress <= 0.001) return false;
    }
    return x >= W - OUTLINER_W + (this._slideOffX ?? 0) && y >= CHIP_CLEAR_H && y <= H - BOTTOM_RESERVED;
  }

  // Szerokość (px logiczne) jaką drawer AKTUALNIE zasłania od prawej krawędzi
  // (0 gdy schowany, OUTLINER_W gdy w pełni wysunięty). Używane przez ColonyOverlay,
  // by globus 3D (osobny canvas nad ui-canvas) nie wchodził pod drawer.
  getCoveredWidth() {
    if (!this._drawerMode) return OUTLINER_W;   // dok (poza civMode — pełna szerokość)
    return Math.round(OUTLINER_W * this._slideProgress);
  }

  // Slice C — czy drawer animuje (slide/hide-timer) → UIManager podtrzymuje redraw
  isAnimating() {
    return this._drawerMode &&
      ((this._slideProgress > 0 && this._slideProgress < 1) || this._hideAt > 0);
  }
}
