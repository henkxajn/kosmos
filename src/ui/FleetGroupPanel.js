// FleetGroupPanel — lekki pływający panel zarządzania zaznaczoną grupą statków (Slice 8b).
//
// Non-exclusive (wzór StationPanel/CombatHUD): trzymany BEZPOŚREDNIO przez UIManager,
// rysowany PO overlayManager (gdy żaden pełnoekranowy overlay nie jest otwarty), klik
// obsługiwany PRZED overlayManager. Pokazuje AKTUALNE, transientne zaznaczenie mapy
// (CTRL+klik / SHIFT box-select) — NIEZALEŻNE od trwałych flot (FleetSystem/vessel.fleetId).
//
// Zawiera: podsumowanie grupy (liczba, paliwo, utrzymanie, uzbrojenie, unieruchomione) +
// roster (po jednym wierszu na statek z mini-paskiem paliwa) + akcje per-statek (focus /
// rename / usuń z zaznaczenia) + szybkie rozkazy grupowe BEZ celu (Powrót / Tankuj / Stop /
// Odwrót). Rozkazy celowane (Move/Pursue/Engage) zostają na PPM mapy (już dispatchują do
// całego zbioru). Self-managed cykl życia: ui:selectionChanged → show/hide; vessel:wrecked →
// usuń zniszczony statek z zaznaczenia (UIManager sam nie czyści zbioru).

import { BaseOverlay }     from './BaseOverlay.js';
import { THEME, bgAlpha }  from '../config/ThemeConfig.js';
import { COSMIC }          from '../config/LayoutConfig.js';
import EventBus            from '../core/EventBus.js';
import { t, getName }      from '../i18n/i18n.js';
import { showRenameModal } from './ModalInput.js';
import { showFleetAssignModal } from './FleetAssignModal.js';
import { isEnemyVessel }   from '../entities/Vessel.js';
import { SHIPS }           from '../data/ShipsData.js';
import { HULLS }           from '../data/HullsData.js';
import { resolveBodyName, resolveBodyPos, getDockTargets } from '../utils/BodyName.js';
import { showBodyPickerModal } from './BodyPickerModal.js';
import { summarizeFleetGroup, buildRosterRows, countActionable } from './FleetGroupPanelLogic.js';
import { getOrderTargetInfo } from './OrderTargetInfo.js';

// Wymiary
const PW           = 340;  // szerokość karty
const PAD          = 8;
const HEADER_H     = 26;   // tytuł + minimize
const SUMMARY_H    = 18;   // wiersz agregatów
const ROW_H        = 30;   // wiersz statku (2 linie tekstu)
const ROW_H_TARGET = 44;   // wiersz statku z 3. linią celu (engage/pursue/intercept)
const PAGE_H       = 16;   // pasek stronicowania
const ACTION_H     = 50;   // 2 rzędy przycisków grupowych
const ROWS_VISIBLE = 6;    // maks. wierszy widocznych naraz
const ICON         = 16;   // ikona akcji per-statek
const BAR_W        = 46;   // mini-pasek paliwa
const BAR_H        = 6;

const STATUS_KEY = {
  docked:     'fleetGroup.statusDocked',
  in_transit: 'fleetGroup.statusTransit',
  orbiting:   'fleetGroup.statusOrbiting',
};

export class FleetGroupPanel extends BaseOverlay {
  constructor() {
    super(null);
    /** @type {string[]} — id-ki z ui:selectionChanged (NIGDY nie cache'ujemy encji). */
    this._ids = [];
    this._minimized = false;
    this._page = 0;

    // Self-managed cykl życia — źródło prawdy = ui:selectionChanged (lead + zbiór).
    EventBus.on('ui:selectionChanged', (e) => {
      this._ids = Array.isArray(e?.vesselIds) ? [...e.vesselIds] : [];
      this._page = 0;
      if (this._ids.length) this.show();
      else { this.hide(); this._minimized = false; }
      this._markDirty();
    });
    // Statek zniszczony w trakcie zaznaczenia — UIManager NIE czyści zbioru, więc
    // czyścimy kanoniczny Set (re-emit selectionChanged zaktualizuje _ids + ramki).
    EventBus.on('vessel:wrecked', (e) => {
      const id = e?.vesselId;
      if (id && this._ids.includes(id)) {
        window.KOSMOS?.uiManager?.removeFromSelection?.(id);
      }
    });
  }

  _markDirty() {
    const um = window.KOSMOS?.uiManager;
    if (um) um._dirty = true;
  }

  /** Żywe statki gracza z bieżącego zaznaczenia (samonaprawa: bez wraków/wrogów/nieistniejących). */
  _liveVessels() {
    const vm = window.KOSMOS?.vesselManager;
    if (!vm) return [];
    const out = [];
    for (const id of this._ids) {
      const v = vm.getVessel(id);
      if (v && !v.isWreck && !isEnemyVessel(v)) out.push(v);
    }
    return out;
  }

  _hullName(shipId) {
    const def = SHIPS[shipId] ?? HULLS[shipId];
    return def ? getName(def, 'ship') : (shipId ?? '?');
  }

  _truncate(ctx, text, maxW) {
    text = String(text ?? '');
    if (maxW <= 0) return '';
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  // ── Rysowanie ──────────────────────────────────────────────────────────────
  draw(ctx, W, H) {
    if (!this.visible) return;
    const vessels = this._liveVessels();
    if (vessels.length === 0) { this.hide(); this._markDirty(); return; }

    this._hitZones = [];
    const C = THEME;

    // Rezerwa dolna (wzór CombatHUD): w civMode = pasek nawigacji + listwa dziennika.
    const bottomRes = window.KOSMOS?.civMode
      ? (COSMIC.BOTTOM_NAV_H + COSMIC.BOTTOM_LOG_TRIG_H)
      : (COSMIC.BOTTOM_BAR_H ?? 32);
    const px = (COSMIC.CIV_SIDEBAR_W ?? 0) + 8;

    // ── Tryb zwinięty — chip „⛬ Zazn. N" ──
    if (this._minimized) {
      const chipH = 22;
      const chipText = `⛬ ${t('fleetGroup.title')} · ${vessels.length}`;
      ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
      const chipW = Math.min(220, ctx.measureText(chipText).width + 22);
      const cy = H - bottomRes - chipH - 8;
      ctx.fillStyle = bgAlpha(0.92);
      ctx.fillRect(px, cy, chipW, chipH);
      ctx.strokeStyle = C.borderActive ?? C.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, cy + 0.5, chipW - 1, chipH - 1);
      ctx.fillStyle = C.accent;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(chipText, px + 8, cy + chipH / 2 + 1);
      ctx.textBaseline = 'alphabetic';
      this._addHit(px, cy, chipW, chipH, 'restore');
      return;
    }

    const summary = summarizeFleetGroup(vessels, { vesselManager: window.KOSMOS?.vesselManager });
    const rows = buildRosterRows(vessels, { vesselManager: window.KOSMOS?.vesselManager });
    const act  = countActionable(vessels, { vesselManager: window.KOSMOS?.vesselManager });

    const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_VISIBLE));
    if (this._page > totalPages - 1) this._page = totalPages - 1;
    if (this._page < 0) this._page = 0;
    const showPaging = rows.length > ROWS_VISIBLE;
    const paged = rows.slice(this._page * ROWS_VISIBLE, this._page * ROWS_VISIBLE + ROWS_VISIBLE);

    // Info o celu (ikona/nazwa-z-mgłą-wojny/żywy dystans) — per wiersz; null = brak rozkazu
    // celującego we wroga. Liczone PRZED totalH (wpływa na zmienną wysokość wiersza).
    const vById = new Map(vessels.map((v) => [v.id, v]));
    for (const row of paged) row._tinfo = getOrderTargetInfo(vById.get(row.id));
    const rosterH = paged.reduce((s, r) => s + (r._tinfo ? ROW_H_TARGET : ROW_H), 0);

    const totalH = HEADER_H + SUMMARY_H + 4 + rosterH
                 + (showPaging ? PAGE_H : 0) + 6 + ACTION_H + 6;

    let py = H - bottomRes - (COSMIC.RESOURCE_BAR_H ?? 0) - totalH - 8;
    // Stacking — gdy FleetCommandPanel (flota) widoczny w lewym-dolnym, ustaw się NAD nim.
    const fcp = window.KOSMOS?.fleetCommandPanel;
    if (fcp?.visible && fcp?._drawnRect) py = Math.min(py, fcp._drawnRect.y - 8 - totalH);
    py = Math.max(COSMIC.TOP_BAND_H + 8, py);

    const leadId = window.KOSMOS?.uiManager?.getSelectedVesselId?.();

    // Tło + ramka
    ctx.fillStyle = bgAlpha(0.92);
    ctx.fillRect(px, py, PW, totalH);
    ctx.strokeStyle = C.borderActive ?? C.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, PW - 1, totalH - 1);

    // ── Header: tytuł · N + [—] ──
    ctx.fillStyle = C.accent;
    ctx.font = `${C.fontSizeSmall + 1}px ${C.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${t('fleetGroup.title')} · ${summary.count}`, px + PAD, py + 17);

    const minX = px + PW - ICON - 4;
    const minY = py + (HEADER_H - ICON) / 2;
    this._drawIconBtn(ctx, '—', minX, minY, ICON, 'minimize', '_min');

    // „→ Flota" — przypisz zaznaczenie do floty (battlegroup). Tylko gdy FleetSystem aktywny.
    if (window.KOSMOS?.fleetSystem) {
      const fbW = 64, fbH = HEADER_H - 8;
      const fbX = minX - 6 - fbW;
      const fbY = py + (HEADER_H - fbH) / 2;
      const fbLabel = t('fleetGroup.assignFleet');
      this._drawButton(ctx, fbLabel, fbX, fbY, fbW, fbH, 'secondary');
      this._addHit(fbX, fbY, fbW, fbH, 'assignFleet', { label: fbLabel });
    }

    // Separator pod headerem
    ctx.strokeStyle = C.border;
    ctx.beginPath(); ctx.moveTo(px, py + HEADER_H); ctx.lineTo(px + PW, py + HEADER_H); ctx.stroke();

    // ── Summary line: Paliwo · Utrzymanie · Uzbr. · ⚠ ──
    const segs = [
      { text: `${t('fleetGroup.fuel')} ${Math.round(summary.fuelPct * 100)}%`, color: C.textSecondary },
      { text: `${t('fleetGroup.upkeep')} ${t('fleetGroup.upkeepPerYear', Math.round(summary.totalUpkeep))}`, color: C.textSecondary },
      { text: t('fleetGroup.weapons', summary.weaponsCount, summary.totalCount), color: C.textDim },
    ];
    if (summary.immobilizedCount > 0) {
      segs.push({ text: `⚠${summary.immobilizedCount}`, color: C.danger });
    }
    ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
    let sx = px + PAD;
    const sy = py + HEADER_H + 13;
    const maxX = px + PW - PAD;
    for (let i = 0; i < segs.length; i++) {
      if (i > 0) {
        ctx.fillStyle = C.textDim;
        ctx.fillText(' · ', sx, sy);
        sx += ctx.measureText(' · ').width;
      }
      const seg = segs[i];
      if (sx + ctx.measureText(seg.text).width > maxX) break;
      ctx.fillStyle = seg.color;
      ctx.fillText(seg.text, sx, sy);
      sx += ctx.measureText(seg.text).width;
    }

    // ── Roster rows ──
    let cy = py + HEADER_H + SUMMARY_H + 4;
    for (const row of paged) {
      this._drawRow(ctx, row, px, cy, leadId);
      cy += row._tinfo ? ROW_H_TARGET : ROW_H;
    }

    // ── Stronicowanie ──
    if (showPaging) {
      const clusterW = ICON + 6 + 40 + 6 + ICON;
      const startX = px + PW - PAD - clusterW;
      const pgY = cy + (PAGE_H - ICON) / 2;
      this._drawIconBtn(ctx, '▲', startX, pgY, ICON, 'pageUp', '_pg');
      ctx.fillStyle = C.textSecondary;
      ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${this._page + 1}/${totalPages}`, startX + ICON + 6 + 20, pgY + ICON / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      this._drawIconBtn(ctx, '▼', startX + ICON + 6 + 40 + 6, pgY, ICON, 'pageDown', '_pg');
      cy += PAGE_H;
    }

    // Separator nad akcjami
    cy += 3;
    ctx.strokeStyle = C.border;
    ctx.beginPath(); ctx.moveTo(px + PAD, cy); ctx.lineTo(px + PW - PAD, cy); ctx.stroke();
    cy += 3;

    // ── Rozkazy grupowe (2 rzędy × 3) ──
    const actionRows = [
      [
        { type: 'grpReturn', label: t('fleetGroup.actionReturn'), enabled: act.canReturn > 0 },
        { type: 'grpDock',   label: t('fleetGroup.actionDock'),   enabled: act.canDock   > 0 },
        { type: 'grpUndock', label: t('fleetGroup.actionUndock'), enabled: act.canUndock > 0 },
      ],
      [
        { type: 'grpRefuel',  label: t('fleetGroup.actionRefuel'),  enabled: act.canRefuel  > 0 },
        { type: 'grpStop',    label: t('fleetGroup.actionStop'),    enabled: act.canStop    > 0 },
        { type: 'grpRetreat', label: t('fleetGroup.actionRetreat'), enabled: act.canRetreat > 0 },
      ],
    ];
    const gap = 6, rowGap = 4;
    const rBtnH = (ACTION_H - rowGap) / 2;
    for (let r = 0; r < actionRows.length; r++) {
      const row = actionRows[r];
      const rBtnW = (PW - PAD * 2 - gap * (row.length - 1)) / row.length;
      const rY = cy + r * (rBtnH + rowGap);
      for (let i = 0; i < row.length; i++) {
        const bx = px + PAD + i * (rBtnW + gap);
        const b = row[i];
        this._drawButton(ctx, b.label, bx, rY, rBtnW, rBtnH, b.enabled ? 'secondary' : 'disabled');
        if (b.enabled) this._addHit(bx, rY, rBtnW, rBtnH, b.type, { label: b.label });
      }
    }

    // Tło jako hit-zone NA KOŃCU — _hitTest=Array.find, konkretne zony (dodane wyżej) mają
    // priorytet; tło tylko konsumuje kliki w panel (nie przelatują do 3D/overlay). S4-1 gotcha.
    this._addHit(px, py, PW, totalH, 'bg');
  }

  _drawRow(ctx, row, px, rowY, leadId) {
    const C = THEME;
    const isLead = row.id === leadId;

    // Ikony po prawej (focus / rename / remove), wyśrodkowane w pionie.
    const iconY   = rowY + (ROW_H - ICON) / 2;
    const removeX = px + PW - PAD - ICON;
    const renameX = removeX - ICON - 3;
    const focusX  = renameX - ICON - 3;
    this._drawIconBtn(ctx, '🎯', focusX,  iconY, ICON, 'focus',  row.id);
    this._drawIconBtn(ctx, '✏', renameX, iconY, ICON, 'rename', row.id);
    this._drawIconBtn(ctx, '✕', removeX, iconY, ICON, 'remove', row.id);

    // Mini-pasek paliwa.
    const barX = focusX - 10 - BAR_W;
    const barY = rowY + (ROW_H - BAR_H) / 2;
    const fuelColor = row.fuelPct > 0.3 ? (C.success ?? '#00ee88') : (C.warning ?? '#ffcc44');
    this._drawBar(ctx, barX, barY, BAR_W, BAR_H, row.fuelPct, fuelColor, C.border);

    // Strefa tekstu.
    const textMaxW = barX - 8 - (px + PAD);

    // Linia 1: nazwa (+⚠ gdy unieruchomiony).
    let nameX = px + PAD;
    if (row.immobilized) {
      ctx.fillStyle = C.danger;
      ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
      ctx.textAlign = 'left';
      ctx.fillText('⚠', nameX, rowY + 13);
      nameX += ctx.measureText('⚠ ').width;
    }
    ctx.fillStyle = isLead ? C.accent : C.textPrimary;
    ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText(this._truncate(ctx, row.name, textMaxW - (nameX - (px + PAD))), nameX, rowY + 13);

    // Linia 2: kadłub · status[ ciało] · rozkaz (dim, mniejsza czcionka).
    const statusLbl = t(STATUS_KEY[row.statusKey] ?? 'fleetGroup.statusDocked');
    let sub = `${this._hullName(row.hullId)} · ${statusLbl}`;
    if ((row.statusKey === 'orbiting' || row.statusKey === 'docked') && row.dockedAt) {
      const bn = resolveBodyName(row.dockedAt);
      if (bn) sub += ` ${bn}`;            // np. „Na orbicie Kepler-442b" / „Dok Stolica"
    }
    if (row.orderKey) sub += ` · ${row.orderKey}`;
    ctx.fillStyle = C.textDim;
    ctx.font = `${C.fontSizeSmall - 1}px ${C.fontFamily}`;
    ctx.fillText(this._truncate(ctx, sub, textMaxW), px + PAD, rowY + 25);

    // Linia 3 (warunkowa): cel rozkazu engage/pursue/intercept + dystans. Pełna szerokość
    // wnętrza (ikony/pasek są w górnej strefie ROW_H, nie kolidują z linią przy +37).
    if (row._tinfo) {
      const ti = row._tinfo;
      const distTxt = Number.isFinite(ti.distAU) ? ti.distAU.toFixed(1) : '?';
      const line = `${ti.icon} ${t('fleetGroup.targetLine', ti.name, distTxt)}`;
      ctx.fillStyle = ti.orderType === 'engage' ? (C.danger ?? '#ff4466') : (C.warning ?? '#ffcc44');
      ctx.font = `${C.fontSizeSmall - 1}px ${C.fontFamily}`;
      ctx.fillText(this._truncate(ctx, line, PW - PAD * 2), px + PAD, rowY + 37);
    }
  }

  _drawIconBtn(ctx, glyph, x, y, size, type, id) {
    const hover = this._hoverZone?.type === type && this._hoverZone?.data?.id === id;
    ctx.strokeStyle = hover ? THEME.accent : THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size, size);
    ctx.fillStyle = hover ? THEME.accent : THEME.textSecondary;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, x + size / 2, y + size / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    this._addHit(x, y, size, size, type, { id });
  }

  // ── Interakcja ──────────────────────────────────────────────────────────────
  _onHit(zone) {
    if (!zone) return;
    const vm  = window.KOSMOS?.vesselManager;
    const mos = window.KOSMOS?.movementOrderSystem;
    const um  = window.KOSMOS?.uiManager;

    switch (zone.type) {
      case 'minimize': this._minimized = true;  this._markDirty(); return;
      case 'restore':  this._minimized = false; this._markDirty(); return;
      case 'pageUp':   this._page = Math.max(0, this._page - 1); this._markDirty(); return;
      case 'pageDown': this._page = this._page + 1; this._markDirty(); return; // clamp w draw
      case 'focus':
        if (zone.data?.id) EventBus.emit('vessel:focus', { vesselId: zone.data.id });
        return;
      case 'remove':
        if (zone.data?.id) { um?.removeFromSelection?.(zone.data.id); this._markDirty(); }
        return;
      case 'rename': {
        const id = zone.data?.id;
        const v = id ? vm?.getVessel?.(id) : null;
        if (!v) return;
        showRenameModal(v.name ?? '').then((n) => {
          const nm = n?.trim();
          if (nm) EventBus.emit('vessel:rename', { vesselId: id, name: nm });
          this._markDirty();
        });
        return;
      }
      case 'assignFleet': {
        // Przypisz całe zaznaczenie do floty (battlegroup) — popup: istniejąca / nowa.
        // Reuse FleetSystem (createFleet/addMember) + wspólny FleetAssignModal. Po przypisaniu
        // flota jest dostępna w Dowództwie (zakładka Floty); selekcja mapy zostaje bez zmian.
        const fSys = window.KOSMOS?.fleetSystem;
        if (!fSys) return;
        const ids = this._liveVessels().map((v) => v.id);
        if (ids.length === 0) return;
        const fleets = fSys.listFleets?.() ?? [];
        showFleetAssignModal(fleets).then(async (choice) => {
          if (!choice) return;
          let targetFleetId = choice.fleetId;
          if (choice.action === 'new') {
            const name = await showRenameModal(t('fleet.newFleetDefaultName'));
            if (!name?.trim()) return;
            targetFleetId = fSys.createFleet(name.trim())?.id;
          }
          if (!targetFleetId) return;
          let accepted = 0;
          for (const vid of ids) {
            if (fSys.addMember(targetFleetId, vid)?.ok) accepted++;
          }
          const fleet = fSys.getFleet?.(targetFleetId);
          window.KOSMOS?.uiManager?.setSelectedFleetId?.(targetFleetId);
          EventBus.emit('ui:toast', {
            text: t('fleetGroup.assignedToFleet', accepted, fleet?.name ?? ''),
            color: THEME.accent, durationMs: 2500,
          });
          this._markDirty();
        });
        return;
      }
      case 'grpReturn': {
        // Recall do bazy ZAWSZE (każdy statek w przestrzeni) — kanoniczna ścieżka jak
        // FleetManagerOverlay._handleFleetReturnBase: nearest friendly planet + moveToPoint
        // (targetBodyId śledzi orbitujące ciało) + marker `_pendingReturnDock` → FleetSystem
        // listener `_maybeAutoDockOnReturn` (globalny, bez wymogu floty) dokuje przy dotarciu.
        const ar = window.KOSMOS?.autoRetreatSystem;
        for (const v of this._liveVessels()) {
          if (v.position?.state === 'docked' || vm?.isImmobilized?.(v)) continue;  // już w bazie / nie rusza się
          const planet = ar?._findNearestFriendlyPlanet?.(v)?.planet;
          if (planet && mos) {
            const tx = planet.x ?? planet.position?.x ?? 0;
            const ty = planet.y ?? planet.position?.y ?? 0;
            // STATYCZNY targetPoint (NIE targetBodyId!) — order MUSI się zakończyć, by
            // `vessel:orderCompleted` odpalił `FleetSystem._maybeAutoDockOnReturn`, który
            // snapuje do ŻYWEJ pozycji planety + dokuje (sprite usuwany). targetBodyId
            // = tracking/orbita (order nie kończy się) → brak docka → sprite zostaje
            // w starym miejscu (bug live-gate runda 2). Wzór: _handleFleetReturnBase.
            v._pendingReturnDock = planet.id;
            mos.issueOrder(v.id, { type: 'moveToPoint', targetPoint: { x: tx, y: ty } });
          } else {
            vm?.startReturn?.(v.id);  // fallback (brak AutoRetreatSystem/planety) — wraca przez misję
          }
        }
        this._markDirty(); return;
      }
      case 'grpRefuel':
        for (const v of this._liveVessels()) {
          if (v.position?.state === 'docked') vm?.manualRefuel?.(v.id);
        }
        this._markDirty(); return;
      case 'grpStop':
        for (const v of this._liveVessels()) mos?.cancelOrder?.(v.id, 'player');
        this._markDirty(); return;
      case 'grpRetreat':
        for (const v of this._liveVessels()) mos?.issueOrder?.(v.id, { type: 'retreat' });
        this._markDirty(); return;
      case 'grpUndock':
        // Undock — zadokowany statek startuje i ORBITUJE ciało, na którym był (instant).
        for (const v of this._liveVessels()) {
          if (v.position?.state === 'docked') vm?.undockToOrbit?.(v.id);
        }
        this._markDirty(); return;
      case 'grpDock': {
        // Dock — picker celów: kolonie z PORTEM + orbitalne stacje gracza (Filip).
        const bodies = getDockTargets();
        const ids = this._liveVessels().map((v) => v.id);
        if (ids.length === 0) return;
        showBodyPickerModal(bodies, 'bodyPicker.dockTitle').then((choice) => {
          if (!choice?.bodyId) return;
          const pos = resolveBodyPos(choice.bodyId);
          if (!pos) return;
          const name = resolveBodyName(choice.bodyId);
          let okN = 0, firstFail = null;
          for (const id of ids) {
            const r = mos?.issueOrder?.(id, { type: 'dock', targetBodyId: choice.bodyId, targetName: name, targetPoint: pos });
            if (r?.ok) okN++; else if (!firstFail) firstFail = r?.reason;
          }
          if (okN === 0 && firstFail) {
            EventBus.emit('ui:toast', { text: t('fleetGroup.dockFailed', firstFail), color: '#ff4466', durationMs: 3500 });
          }
          this._markDirty();
        });
        return;
      }
      // 'bg' → swallow (klik w panel nie przelatuje niżej).
    }
  }
}
