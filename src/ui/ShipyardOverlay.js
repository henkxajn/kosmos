// ShipyardOverlay — samodzielny overlay STOCZNIA (klawisz S, nav-slot 🛠)
//
// C8 — ekstrakcja z zakładki 'shipyard' FleetManagerOverlay do własnego panelu
// (zajmuje slot nav zwolniony po Populacji w C7). Canvas 2D BaseOverlay.
// Layout: wąska wycentrowana kolumna — u góry budowa statków (szablony z Unit
// Design + kolejka + Surge + pending orders), poniżej (po wspólnym pionowym
// scrollu) OSADZONY edytor projektów (UnitDesignOverlay._drawShipDesigner).
//
// Kolonia = GLOBALNA aktywna (window.KOSMOS.colonyManager.activePlanetId) — jak
// dawna zakładka; brak lokalnego pickera. Budowa idzie przez EventBus
// ('fleet:buildRequest' → ColonyManager) + colMgr.surgeShipBuild/cancelPendingShip.
// Edytor projektów to WSPÓŁDZIELONA instancja overlays.unit_design (ta sama co
// klawisz U i zakładka Jednostki w Command) — czytana, nie tworzona.

import { BaseOverlay, HEADER_H } from './BaseOverlay.js';
import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { SHIPS }          from '../data/ShipsData.js';
import { HULLS }          from '../data/HullsData.js';
import { canBuildHullAt } from '../data/ShipBuildRules.js';
import { calcShipStats, calcShipCost } from '../data/ShipModulesData.js';
import { RESOURCE_ICONS } from '../data/BuildingsData.js';
import { COMMODITIES, COMMODITY_SHORT } from '../data/CommoditiesData.js';
import { TECHS }          from '../data/TechData.js';
import { t, getName }     from '../i18n/i18n.js';
import EventBus           from '../core/EventBus.js';
import { pruneZones }     from './InfoPanelLayoutLogic.js';
import { isEnemyVessel }  from '../entities/Vessel.js';

// Typy hitów osadzonego edytora projektów (UnitDesignOverlay._drawShipDesigner) —
// delegowane do instancji edytora w _onHit. Lustro DESIGN_EDITOR_HIT_TYPES z
// FleetManagerOverlay (ta sama lista produkowana przez UDO; zakładka Jednostki
// używa prefiksu 'ground:'—tu nieobecna).
const DESIGN_EDITOR_HIT_TYPES = new Set([
  'select_hull', 'select_slot', 'clear_slot', 'pick_module',
  'save_template', 'clear_design', 'edit_template', 'delete_template', 'tpl_row',
]);

export class ShipyardOverlay extends BaseOverlay {
  constructor() {
    super();
    this._shipyardScrollY  = 0;   // wspólny pionowy scroll (budowa + edytor projektów)
    this._shipyardContentH = 0;   // łączna wysokość treści (do clampu scrolla)
    this._shipyardViewH    = 0;   // widoczna wysokość kolumny
    this._hoverPendingOrder = null;
  }

  // Zarejestrowana instancja unit_design (wspólny stan z klawiszem U). Null gdy
  // brak (headless) → sekcja edytora się nie rysuje.
  _getDesignEditor() {
    return window.KOSMOS?.overlayManager?.overlays?.unit_design ?? null;
  }

  // ── Rysowanie ─────────────────────────────────────────────────────────────
  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];
    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);

    // Tło + ramka
    ctx.fillStyle = bgAlpha(0.40);
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, ow, oh);

    // Nagłówek (⚓ STOCZNIA) — sekcja budowy NIE dubluje tego tytułu.
    this._drawOverlayHeader(ctx, ox, oy, ow, t('fleet.shipyardAnchor'));

    // Zamknij ✕
    const closeX = ox + ow - 24, closeY = oy + 4;
    ctx.font = `bold 14px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'left';
    ctx.fillText('✕', closeX, closeY + 14);
    this._addHit(closeX - 4, closeY, 22, 22, 'close');

    // Kolumna treści — wycentrowana, ≤560 px (jak dawna zakładka).
    const colMgr = window.KOSMOS?.colonyManager;
    const activePid = colMgr?.activePlanetId;
    const cTop = oy + HEADER_H;
    const cH   = oh - HEADER_H;
    const syW  = Math.min(ow, 560);
    const syX  = ox + Math.floor((ow - syW) / 2);
    this._drawShipyardBody(ctx, syX, cTop, syW, cH, colMgr, activePid);

    // Tło-absorber klików NA KOŃCU (first-match: konkretne strefy wygrywają).
    this._addHit(ox, oy, ow, oh, 'bg');
  }

  // Host: clip + wspólny scroll + sekcja budowy + osadzony edytor projektów.
  _drawShipyardBody(ctx, x, y, w, h, colMgr, activePid) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    const BIG = 100000;                  // duża „wysokość" → sekcje renderują pełną treść (clip+scroll obcina)
    const top = y - this._shipyardScrollY;
    // ⚠ W2-6 — DŁUG GHOST-CLICK. Strefy klik rejestrują się na współrzędnych PRZESUNIĘTYCH
    //    scrollem, a ten panel nigdy ich nie przycinał: przycisk wypchnięty poza widoczne
    //    pasmo zostawał klikalny „w powietrzu" (audyt W2 §S18). ColonyOverlay i
    //    StationManagementView robią to od dawna przez `pruneZones`. Wprowadzamy nowe
    //    przyciski (Rozmieść) — więc dług spłacamy TERAZ, a nie dokładamy do niego.
    //    `hitsBefore` to indeks graniczny: strefy zarejestrowane PRZED clipem (nagłówek, ✕)
    //    są w stałych współrzędnych i NIE podlegają przycinaniu.
    const hitsBefore = this._hitZones.length;

    // 1) Sekcja budowy — zwraca dolną krawędź
    let cy = this._drawShipyard(ctx, x, top, w, BIG, colMgr, activePid);

    // 1b) Sekcja REZERWY (W2-6) — kadłuby czekające na załogę
    cy = this._drawReserve(ctx, x, cy + 10, w, colMgr, activePid);

    // 2) Separator + osadzony edytor projektów
    cy += 12;
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 8, cy); ctx.lineTo(x + w - 8, cy); ctx.stroke();
    cy += 8;

    const editor = this._getDesignEditor();
    let bottom = cy;
    if (editor) {
      editor._scrollLeft = 0;            // wspólny scroll obsługuje _shipyardScrollY
      const savedHits = editor._hitZones;
      editor._hitZones = this._hitZones; // hity edytora do wspólnej tablicy
      bottom = editor._drawShipDesigner(ctx, x, cy, w, BIG) ?? cy;
      editor._hitZones = savedHits;
    }

    ctx.restore();

    // 2b) Przytnij strefy klik do widocznego pasma (patrz komentarz przy `hitsBefore`).
    //     Robione PO `restore`, na tym samym prostokącie, którym clipowaliśmy rysowanie —
    //     inaczej „widoczne" i „klikalne" mogłyby się rozjechać.
    pruneZones(this._hitZones, hitsBefore, y, y + h);

    // 3) Clamp wspólnego scrolla wg łącznej wysokości treści
    const contentH = bottom - top;
    this._shipyardContentH = contentH;
    this._shipyardViewH = h;
    const maxScroll = Math.max(0, contentH - h);
    if (this._shipyardScrollY > maxScroll) this._shipyardScrollY = maxScroll;
    if (this._shipyardScrollY < 0) this._shipyardScrollY = 0;

    // 4) Tooltip pending order — PO odcięciu clipa (z-order najwyższy)
    if (this._hoverPendingOrder) {
      const activeCol = colMgr?.getColony(activePid);
      const inv = activeCol?.resourceSystem?.inventorySnapshot() ?? {};
      this._drawPendingOrderTooltip(ctx, x, y, w, h, this._hoverPendingOrder, inv);
    }
  }

  // ── Sekcja budowy statków (zwraca dolną krawędź cy) ────────────────────────
  _drawShipyard(ctx, x, y, w, h, colMgr, activePid) {
    const PAD = 10;
    const LH = 16;
    let cy = y + 12;

    const tSys = window.KOSMOS?.techSystem;
    const activeCol = colMgr?.getColony(activePid);

    // Warunki wstępne — sekcja oddaje dolną krawędź nawet bez stoczni/techu.
    const hasExploration = tSys?.isResearched('exploration') ?? false;
    if (!hasExploration) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(t('fleet.shipyardRequiresTech'), x + PAD, cy + 8);
      cy += LH + 8;
      return cy;
    }

    // Poziom stoczni = suma poziomów budynków 'shipyard'
    let shipyardLevel = 0;
    if (activeCol?.buildingSystem) {
      for (const [, e] of activeCol.buildingSystem._active) {
        if (e.building?.id === 'shipyard') shipyardLevel += e.level ?? 1;
      }
    }

    if (shipyardLevel === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(t('fleet.shipyardNoBuild'), x + PAD, cy + 8);
      cy += LH + 8;
      return cy;
    }

    // Status — sloty + bonus prędkości
    const queues = colMgr?.getShipQueues(activePid) ?? [];
    const usedSlots = queues.length || 1;
    const speedBonus = Math.max(1, Math.floor(shipyardLevel / usedSlots));
    const bonusStr = speedBonus > 1 ? ` ×${speedBonus}⚡` : '';
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.success;
    ctx.fillText(t('fleet.shipyardSlotsShort', `${queues.length}/${shipyardLevel}`) + bonusStr, x + PAD, cy + 8);
    cy += LH;

    // Aktywne budowy — paski progresu + Surge
    if (queues.length > 0) {
      for (let qi = 0; qi < queues.length; qi++) {
        const q = queues[qi];
        if (cy > y + h - 30) break;
        const shipDef = SHIPS[q.shipId] ?? HULLS[q.shipId];
        const frac = q.buildTime > 0 ? Math.min(1, q.progress / q.buildTime) : 0;

        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textPrimary;
        ctx.fillText(`${shipDef?.icon ?? '🚀'} ${shipDef ? getName(shipDef, 'ship') : q.shipId}`, x + PAD, cy + 8);

        const barX = x + PAD;
        const barY = cy + 13;
        const barW = w - PAD * 2 - 50;
        const barH = 6;
        ctx.fillStyle = THEME.bgTertiary;
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = THEME.accent;
        ctx.fillRect(barX, barY, Math.round(barW * frac), barH);
        ctx.strokeStyle = THEME.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        ctx.fillStyle = THEME.textSecondary;
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(frac * 100)}%`, x + w - PAD, cy + 8);
        ctx.textAlign = 'left';

        cy += LH + 8;

        // Surge ⚡
        const maxSurge = shipDef?.maxSurge ?? 1;
        const surgeCount = q.surgeCount ?? 0;
        const surgeMaxed = surgeCount >= maxSurge;
        const freePop = activeCol?.civSystem?.freePops ?? 0;
        const kr = activeCol?.credits ?? 0;
        const canSurge = !surgeMaxed && freePop >= 0.5 && kr >= 500;

        const surgeLabel = surgeMaxed
          ? t('fleet.surgeMax')
          : `⚡ Surge [${surgeCount}/${maxSurge}] — 0.5 POP + 500 Kr`;
        const surgeBtnW = w - PAD * 2;
        const surgeBtnH = 18;

        ctx.fillStyle = canSurge ? 'rgba(255,180,40,0.15)' : 'rgba(40,40,50,0.3)';
        ctx.fillRect(x + PAD, cy, surgeBtnW, surgeBtnH);
        ctx.strokeStyle = canSurge ? THEME.warning : THEME.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + PAD, cy, surgeBtnW, surgeBtnH);

        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = canSurge ? THEME.warning : THEME.textDim;
        ctx.textAlign = 'center';
        ctx.fillText(surgeLabel, x + PAD + surgeBtnW / 2, cy + 13);
        ctx.textAlign = 'left';

        if (canSurge) {
          this._hitZones.push({
            x: x + PAD, y: cy, w: surgeBtnW, h: surgeBtnH,
            type: 'surge_ship', data: { planetId: activePid, queueIndex: qi },
          });
        }

        cy += surgeBtnH + 4;
      }
    }

    // Separator
    cy += 4;
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
    cy += 10;

    const canBuildAny = queues.length < shipyardLevel;
    const inv = activeCol?.resourceSystem?.inventorySnapshot() ?? {};

    // Lista szablonów z Unit Design
    const templates = window.KOSMOS?.unitDesigns ?? [];

    if (templates.length === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('unitDesign.noDesigns'), x + PAD, cy + 8);
      cy += LH + 8;
    } else {
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textHeader;
      ctx.fillText(t('unitDesign.savedTemplates'), x + PAD, cy + 8);
      cy += LH + 4;

      for (const tpl of templates) {
        if (cy > y + h - 80) break;
        const hull = HULLS[tpl.hullId];
        if (!hull) continue;

        const hasTech = !hull.requires || (tSys?.isResearched(hull.requires) ?? false);
        const canBuildFacility = canBuildHullAt(tpl.hullId, 'ground');   // S3.4d — kolonia = stocznia naziemna (tylko small)

        const mods = (tpl.modules ?? []).filter(Boolean);
        const stats = calcShipStats(hull, mods);
        const { cost: rawC, commodityCost: comC } = calcShipCost(hull, mods);
        const allCosts = { ...rawC, ...comC };
        const allAfford = Object.entries(allCosts).every(([k, need]) => (inv[k] ?? 0) >= need);
        // ⚠ W2-4: `hasCrew` USUNIĘTE ze WSZYSTKICH trzech miejsc (klikalność, kolejkowanie,
        //   łańcuch powodów). Budowa nie kosztuje POP — koszt płaci ROZMIESZCZENIE. Zostawienie
        //   tego członu wyszarzałoby przycisk według reguły, której silnik już nie egzekwuje.
        const canBuildNow = hasTech && canBuildFacility && canBuildAny && allAfford;
        const canQueue = hasTech && canBuildFacility && !allAfford;
        const canClick = canBuildNow || canQueue;

        // Powód blokady — priorytet: tech kadłuba → stocznia orbitalna → slot.
        let blockReason = null;
        let blockColor = THEME.warning;
        if (!hasTech) {
          const techName = TECHS[hull.requires] ? getName(TECHS[hull.requires], 'tech') : hull.requires;
          blockReason = `🔒 ${t('fleet.requiresTech', techName)}`;
          blockColor = THEME.textDim;
        } else if (!canBuildFacility) {
          blockReason = `🛰 ${t('fleet.requiresOrbitalShipyard')}`;
          blockColor = THEME.textDim;
        } else if (!canClick) {
          blockReason = `⏳ ${t('fleet.shipyardFull', queues.length, shipyardLevel)}`;
        }

        const btnH = blockReason ? 54 : 42;
        const bx = x + PAD, bw = w - PAD * 2;

        ctx.fillStyle = canClick ? 'rgba(20,40,60,0.8)' : 'rgba(20,20,30,0.5)';
        ctx.fillRect(bx, cy, bw, btnH);
        ctx.strokeStyle = canBuildNow ? THEME.borderActive : canQueue ? THEME.warning : THEME.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, cy, bw, btnH);

        ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = canClick ? THEME.accent : THEME.textDim;
        ctx.fillText(`${hull.icon} ${tpl.name}`, bx + 6, cy + 14);

        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(`⚡${stats.speed.toFixed(1)} AU/y  📦${stats.cargo}t  🎯${Math.round(stats.range)} AU  ⚖${stats.totalMass}t`, bx + 6, cy + 28);

        if (blockReason) {
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = blockColor;
          ctx.fillText(blockReason, bx + 6, cy + 44);
        }

        const buildLabel = canBuildNow ? '🚀' : canQueue ? '⏳' : (!hasTech ? '🔒' : !canBuildFacility ? '🛰' : '—');
        const buildBtnW = 28;
        const buildBtnX = bx + bw - buildBtnW - 4;
        ctx.fillStyle = canBuildNow ? THEME.accent : canQueue ? THEME.warning : THEME.textDim;
        ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.fillText(buildLabel, buildBtnX + buildBtnW / 2, cy + 22);
        ctx.textAlign = 'left';

        if (canClick) {
          this._hitZones.push({ x: bx, y: cy, w: bw, h: btnH,
            type: 'build_template', data: { templateId: tpl.id, hullId: tpl.hullId, modules: mods, enabled: true } });
        }

        cy += btnH + 4;
      }
    }

    // Oczekujące zamówienia (pending ship orders)
    const pendingOrders = activeCol?.pendingShipOrders ?? [];
    if (pendingOrders.length > 0) {
      cy += 4;
      ctx.strokeStyle = THEME.border;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
      cy += 10;

      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(`⏳ ${t('fleet.pendingOrders')} (${pendingOrders.length})`, x + PAD, cy + 8);
      cy += LH + 2;

      for (const order of pendingOrders) {
        if (cy > y + h - 30) break;
        const shipDef = SHIPS[order.shipId] ?? HULLS[order.shipId];
        const rowH = 34;

        const missingItems = [];
        for (const [k, need] of Object.entries(order.cost)) {
          const have = inv[k] ?? 0;
          if (have < need) {
            const icon = RESOURCE_ICONS[k] ?? COMMODITIES[k]?.icon ?? '';
            const shortName = COMMODITY_SHORT[k] ?? k;
            missingItems.push({ icon, name: shortName, have: Math.floor(have), need });
          }
        }

        ctx.fillStyle = 'rgba(60,40,5,0.5)';
        ctx.fillRect(x + PAD, cy, w - PAD * 2, rowH);
        ctx.strokeStyle = 'rgba(255,180,0,0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + PAD, cy, w - PAD * 2, rowH);

        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.warning;
        ctx.fillText(`${shipDef?.icon ?? '🚀'} ${shipDef ? getName(shipDef, 'ship') : order.shipId}`, x + PAD + 4, cy + 12);

        if (missingItems.length > 0) {
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          const parts = missingItems.slice(0, 4).map(m => `${m.icon}${m.have}/${m.need}`);
          ctx.fillStyle = '#ff8844';
          ctx.fillText(parts.join('  '), x + PAD + 4, cy + 26);
        }

        const cancelX = x + w - PAD - 22;
        ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = '#ff6666';
        ctx.fillText('×', cancelX + 6, cy + 15);
        this._hitZones.push({
          x: cancelX, y: cy, w: 22, h: rowH,
          type: 'cancel_pending_ship', data: { planetId: activePid, orderId: order.id },
        });

        // Hit zone tooltipu (cały wiersz)
        this._hitZones.push({
          x: x + PAD, y: cy, w: w - PAD * 2 - 24, h: rowH,
          type: 'pending_ship_hover', data: { order },
        });

        cy += rowH + 2;
      }
    }

    return cy;
  }

  // ── W2-6 — REZERWA: kadłuby gotowe przemysłowo, czekające na załogę ────────
  //
  // Sedno modelu rozmieszczenia widziane oczami gracza: stocznia oddaje KADŁUB, nie okręt.
  // Sekcja pokazuje, co stoi w magazynie, ile to kosztuje (stawka ulgowa R-A) i pozwala
  // obsadzić załogą. Kadłub w trakcie przejścia dostaje pasek z jednostką W ETYKIECIE —
  // „miesiąc" jest tu informacją, a nie ozdobnikiem (R-B).
  //
  // ⚠ Zakres listy: kadłuby zadokowane w AKTYWNEJ kolonii albo przy jej stacji. Rezerwa
  //   z drugiego końca układu nie należy do tej stoczni — inaczej gracz klikałby „Rozmieść"
  //   na okręcie, którego załogę wystawi zupełnie inna kolonia.
  _drawReserve(ctx, x, y, w, colMgr, activePid) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr?.getAllVessels) return y;

    const PAD = 10, LH = 16;
    const rows = [];
    for (const v of vMgr.getAllVessels()) {
      if (v.isWreck || isEnemyVessel(v)) continue;
      if ((v.serviceState ?? 'active') === 'active') continue;
      // Kadłuby „tej stoczni": zadokowane w aktywnej kolonii lub przypisane do niej domem.
      const dock = v.position?.dockedAt ?? null;
      if (dock !== activePid && v.homeColonyId !== activePid && v.colonyId !== activePid) continue;
      rows.push(v);
    }

    let cy = y;
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.textAlign = 'left';
    ctx.fillText(`📦 ${t('fleet.reserveHeader')}`, x + PAD, cy + 12);

    if (rows.length === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.reserveEmpty'), x + PAD, cy + 30);
      return cy + 38;
    }

    // Podsumowanie rachunku — „tania, ale liczona" ma być widoczne bez otwierania ekonomii.
    let bill = 0;
    for (const v of rows) bill += vMgr.getVesselUpkeepCredits?.(v) ?? 0;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(t('fleet.reserveBill', rows.length, Math.round(bill)), x + w - PAD, cy + 12);
    ctx.textAlign = 'left';
    cy += LH + 8;

    const arrears = vMgr.colonyInArrears?.(activePid) ?? false;

    for (const v of rows) {
      const rowH = 40;
      const def = SHIPS[v.shipId] ?? HULLS[v.shipId];
      const mobilizing = (v.serviceState ?? 'active') === 'mobilizing';

      ctx.fillStyle = 'rgba(20,32,44,0.55)';
      ctx.fillRect(x + PAD, cy, w - PAD * 2, rowH);
      ctx.strokeStyle = THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + PAD, cy, w - PAD * 2, rowH);

      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(`${def?.icon ?? '🚀'} ${v.name ?? v.shipId}`, x + PAD + 6, cy + 14);

      const crew = def?.crewCost ?? 0;
      const up   = Math.round(vMgr.getVesselUpkeepCredits?.(v) ?? 0);
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.reserveRowInfo', crew.toFixed(1), up), x + PAD + 6, cy + 30);

      const btnW = 96, btnH = 24;
      const bx = x + w - PAD - btnW - 6;
      const by = cy + (rowH - btnH) / 2;

      if (mobilizing) {
        // Pasek postępu + JEDNOSTKA W ETYKIECIE (R-B: „jeden wyświetlany miesiąc").
        const prog = Math.max(0, Math.min(1, (v.mobilizeProgress ?? 0) / 1.0));
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(bx, by + 4, btnW, 8);
        ctx.fillStyle = THEME.accent;
        ctx.fillRect(bx, by + 4, btnW * prog, 8);
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        const label = v.mobilizeTarget === 'stored' ? t('fleet.withdrawing') : t('fleet.mobilizing');
        ctx.fillText(label, bx, by + 24);
      } else {
        const can = !arrears;
        ctx.fillStyle = can ? 'rgba(40,90,60,0.8)' : 'rgba(40,40,50,0.6)';
        ctx.fillRect(bx, by, btnW, btnH);
        ctx.strokeStyle = can ? THEME.success : THEME.border;
        ctx.strokeRect(bx + 0.5, by + 0.5, btnW - 1, btnH - 1);
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = can ? THEME.textPrimary : THEME.textDim;
        ctx.textAlign = 'center';
        ctx.fillText(`⚓ ${t('fleet.deployAction')}`, bx + btnW / 2, by + 16);
        ctx.textAlign = 'left';
        // Hit-zone TYLKO gdy klikalna — wyszarzony przycisk nie może cicho nic nie robić.
        if (can) {
          this._hitZones.push({ x: bx, y: by, w: btnW, h: btnH, type: 'deploy_vessel', data: { vesselId: v.id } });
        }
      }
      cy += rowH + 3;
    }

    if (arrears) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      ctx.fillText(`⚠ ${t('fleet.deployBlockedArrears')}`, x + PAD, cy + 12);
      cy += LH + 4;
    }
    return cy;
  }

  // ── Tooltip oczekującego zamówienia (brakujące zasoby) ─────────────────────
  _drawPendingOrderTooltip(ctx, panelX, panelY, panelW, panelH, order, inv) {
    const ship = SHIPS[order.shipId] ?? HULLS[order.shipId];
    if (!ship) return;

    const PAD = 8;
    const LH = 14;

    const lines = [];
    for (const [k, need] of Object.entries(order.cost)) {
      const have = Math.floor(inv[k] ?? 0);
      const ok = have >= need;
      const icon = RESOURCE_ICONS[k] ?? COMMODITIES[k]?.icon ?? '';
      const name = COMMODITY_SHORT[k] ?? k;
      lines.push({ text: `${icon} ${name}: ${have}/${need}`, ok });
    }
    // ⚠ W2-4: odczyt „👤 freePops/crewCost" USUNIĘTY — zlecenie nie czeka już na POPy, tylko
    //   na surowce. (Ten wiersz i tak czytał GLOBALNY `KOSMOS.civSystem`, nie aktywną kolonię
    //   jak reszta pliku — Findings filed 4.) Załoga pokazuje się przy rozmieszczeniu (W2-6).

    const tipW = 200;
    const tipH = 22 + lines.length * LH + 8;

    let tipX = panelX - tipW - 6;
    if (tipX < 4) tipX = panelX + 4;
    const zone = this._hitZones.find(z => z.type === 'pending_ship_hover' && z.data.order?.id === order.id);
    let tipY = zone ? zone.y : panelY + 100;
    if (tipY + tipH > panelY + panelH) tipY = panelY + panelH - tipH - 4;

    ctx.fillStyle = 'rgba(6,12,20,0.96)';
    ctx.fillRect(tipX, tipY, tipW, tipH);
    ctx.strokeStyle = THEME.warning;
    ctx.lineWidth = 1;
    ctx.strokeRect(tipX, tipY, tipW, tipH);

    let ty = tipY + 6;
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.warning;
    ctx.fillText(`⏳ ${ship.icon} ${getName(ship, 'ship')}`, tipX + PAD, ty + 10);
    ty += 18;

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    for (const line of lines) {
      ctx.fillStyle = line.ok ? THEME.success : THEME.danger;
      ctx.fillText(line.text, tipX + PAD, ty + 8);
      ty += LH;
    }
  }

  // ── Interakcja ─────────────────────────────────────────────────────────────
  _onHit(zone) {
    // Delegacja hitów osadzonego edytora projektów do wspólnej instancji.
    if (DESIGN_EDITOR_HIT_TYPES.has(zone.type)) {
      this._getDesignEditor()?._onHit(zone);
      return;
    }
    const colMgr = window.KOSMOS?.colonyManager;
    switch (zone.type) {
      case 'close':
        this.hide();
        break;
      case 'build_template':
        if (zone.data.enabled) {
          EventBus.emit('fleet:buildRequest', { shipId: zone.data.hullId, modules: zone.data.modules });
        }
        break;
      case 'surge_ship':
        if (colMgr) colMgr.surgeShipBuild(zone.data.planetId, zone.data.queueIndex);
        break;
      case 'cancel_pending_ship':
        if (colMgr) colMgr.cancelPendingShip(zone.data.planetId, zone.data.orderId);
        break;
      // W2-6 — rozmieszczenie kadłuba z rezerwy. Odmowa NIE jest cicha: kod powodu
      // idzie do Dziennika przez `vessel:deployRejected` (UIManager), bo jedyną gorszą
      // rzeczą od zablokowanego przycisku jest przycisk, który po kliknięciu milczy.
      case 'deploy_vessel': {
        const vMgr = window.KOSMOS?.vesselManager;
        const res = vMgr?.deployVessel?.(zone.data.vesselId);
        if (res && res.ok !== true) {
          EventBus.emit('vessel:deployRejected', {
            vesselId: zone.data.vesselId,
            vessel: vMgr?.getVessel?.(zone.data.vesselId) ?? null,
            reason: res.reason ?? 'unknown',
          });
        }
        break;
      }
      // 'pending_ship_hover' / 'bg' — brak akcji
    }
  }

  handleMouseMove(x, y) {
    super.handleMouseMove(x, y);   // ustawia this._hoverZone
    if (!this.visible) return;
    // Hover pending order (tooltip brakujących zasobów)
    this._hoverPendingOrder = null;
    for (const z of this._hitZones) {
      if (x < z.x || x > z.x + z.w || y < z.y || y > z.y + z.h) continue;
      if (z.type === 'pending_ship_hover') { this._hoverPendingOrder = z.data.order; break; }
    }
    // Forward hovera do osadzonego edytora (podświetlenia wierszy / tooltipy panelu).
    const ed = this._getDesignEditor();
    if (ed) { ed._hoverZone = this._hoverZone; ed._mouseX = x; ed._mouseY = y; }
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    const maxScroll = Math.max(0, this._shipyardContentH - this._shipyardViewH);
    this._shipyardScrollY = Math.max(0, Math.min(maxScroll, this._shipyardScrollY + delta * 0.5));
    return true;
  }

  hide() {
    super.hide();
    this._hoverPendingOrder = null;
  }
}
