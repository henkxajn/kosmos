// FleetCommandPanel — pływający panel zarządzania WYBRANĄ flotą („grupą bojową") na mapie 3D (Slice 8b).
//
// UWAGA nazewnictwo: w grze FLOTY statków = FleetSystem („Floty"); „Grupa Bojowa"/BattleGroupPanel
// to ODDZIELNY system jednostek naziemnych. Ten panel dotyczy FLOT (vessel), stąd nazwa FleetCommand.
//
// Non-exclusive (wzór FleetGroupPanel/StationPanel): trzymany przez UIManager, rysowany PO
// overlayManager (gdy żaden pełnoekranowy overlay nie jest otwarty), klik PRZED overlayManager.
// Pokazuje flotę wskazaną przez `UIManager.getSelectedFleetId()` (ustawianą m.in. przyciskiem
// „→ Flota" w FleetGroupPanel albo selekcją floty w Dowództwie). ◀▶ cyklują po flotach gracza.
//
// Zawiera: nagłówek (◀ nazwa·N ▶ + rename + minimize + close), doktrynę (klik = cykl), roster
// członków (focus / usuń z floty) oraz PEŁNE rozkazy floty: Rusz (picker punktu) / Atak (picker
// najbliższego wroga) / Powrót (nearest friendly + auto-dock) / Stop (cancelFleetOrder) / Rozwiąż.
// Anchor lewy-dolny; FleetGroupPanel przesuwa się NAD ten panel (stacking).

import { BaseOverlay }     from './BaseOverlay.js';
import { THEME, bgAlpha }  from '../config/ThemeConfig.js';
import { COSMIC }          from '../config/LayoutConfig.js';
import { GAME_CONFIG }     from '../config/GameConfig.js';
import EventBus            from '../core/EventBus.js';
import { t, getName }      from '../i18n/i18n.js';
import { showRenameModal } from './ModalInput.js';
import { isEnemyVessel }   from '../entities/Vessel.js';
import { SHIPS }           from '../data/ShipsData.js';
import { HULLS }           from '../data/HullsData.js';
import { resolveBodyName } from '../utils/BodyName.js';
import { ALL_DOCTRINES, doctrineNameKey } from '../data/FleetDoctrines.js';
import { summarizeFleetGroup, buildRosterRows } from './FleetGroupPanelLogic.js';
import { nextFleetId, nextDoctrine, nearestEnemyToPoint } from './FleetCommandPanelLogic.js';
import { openDockPicker } from './VesselGroupActions.js';
// D-255a (Finding 154) — JEDNO źródło doboru celu POWROTU: własna kolonia W UKŁADZIE STATKU.
import { nearestOwnColonyBodyInSystem } from '../utils/RetreatTarget.js';
import { getOrderTargetInfo } from './OrderTargetInfo.js';

const PW           = 340;
const PAD          = 8;
const HEADER_H     = 26;
const DOCTRINE_H   = 18;
const ROW_H        = 26;
const ROW_H_TARGET = 40;   // wiersz członka z 3. linią celu (engage/pursue/intercept)
const PAGE_H       = 16;
const ACTION_H     = 50;   // 2 rzędy przycisków rozkazów floty
const ROWS_VISIBLE = 6;
const ICON         = 16;
const BAR_W        = 44;
const BAR_H        = 6;

const STATUS_KEY = {
  docked:     'fleetGroup.statusDocked',
  in_transit: 'fleetGroup.statusTransit',
  orbiting:   'fleetGroup.statusOrbiting',
};

export class FleetCommandPanel extends BaseOverlay {
  constructor() {
    super(null);
    this._fleetId = null;
    this._minimized = false;
    this._page = 0;
    /** @type {{x:number,y:number,w:number,h:number}|null} — ostatni rysowany prostokąt (stacking). */
    this._drawnRect = null;

    EventBus.on('ui:fleetSelectionChanged', (e) => {
      this._fleetId = e?.fleetId ?? null;
      this._page = 0;
      if (this._fleetId) this.show();
      else { this.hide(); this._minimized = false; this._drawnRect = null; }
      this._markDirty();
    });
    EventBus.on('fleet:disbanded', (e) => {
      if (e?.fleetId && e.fleetId === this._fleetId) {
        window.KOSMOS?.uiManager?.setSelectedFleetId?.(null);  // → fleetSelectionChanged(null) → hide
      }
    });
    for (const ev of ['fleet:memberAdded', 'fleet:memberRemoved', 'fleet:renamed', 'fleet:doctrineChanged', 'fleet:orderIssued', 'fleet:orderCancelled']) {
      EventBus.on(ev, () => { if (this.visible) this._markDirty(); });
    }
  }

  _markDirty() {
    const um = window.KOSMOS?.uiManager;
    if (um) um._dirty = true;
  }

  _fs()    { return window.KOSMOS?.fleetSystem ?? null; }
  _fleet() { return this._fleetId ? (this._fs()?.getFleet?.(this._fleetId) ?? null) : null; }

  _members(fleet) {
    const vm = window.KOSMOS?.vesselManager;
    if (!vm || !fleet?.memberIds) return [];
    const out = [];
    for (const id of fleet.memberIds) {
      const v = vm.getVessel(id);
      if (v && !v.isWreck) out.push(v);
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
    if (!this.visible) { this._drawnRect = null; return; }
    const fs = this._fs();
    const fleet = this._fleet();
    if (!fs || !fleet) { this.hide(); this._drawnRect = null; this._markDirty(); return; }

    this._hitZones = [];
    const C = THEME;
    const members = this._members(fleet);

    const bottomRes = (window.KOSMOS?.civMode
      ? (COSMIC.BOTTOM_NAV_H + COSMIC.BOTTOM_LOG_TRIG_H)
      : (COSMIC.BOTTOM_BAR_H ?? 32))
      + (window.KOSMOS?.tacticalDock?.getReservedHeight?.() ?? 0);   // Faza 4 — podnieś NAD Dok taktyczny
    const px = (COSMIC.CIV_SIDEBAR_W ?? 0) + 8;

    // ── Tryb zwinięty — chip ──
    if (this._minimized) {
      const chipH = 22;
      const chipText = `⛬ ${fleet.name ?? '—'} · ${members.length}`;
      ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
      const chipW = Math.min(240, ctx.measureText(chipText).width + 22);
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
      this._drawnRect = { x: px, y: cy, w: chipW, h: chipH };
      return;
    }

    const rows = buildRosterRows(members, { vesselManager: window.KOSMOS?.vesselManager });

    const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_VISIBLE));
    if (this._page > totalPages - 1) this._page = totalPages - 1;
    if (this._page < 0) this._page = 0;
    const showPaging = rows.length > ROWS_VISIBLE;
    const paged = rows.slice(this._page * ROWS_VISIBLE, this._page * ROWS_VISIBLE + ROWS_VISIBLE);

    // Info o celu (ikona/nazwa-z-mgłą-wojny/żywy dystans) — per wiersz; null = brak rozkazu
    // celującego we wroga. Liczone PRZED totalH (zmienna wysokość wiersza).
    const vById = new Map(members.map((v) => [v.id, v]));
    for (const row of paged) row._tinfo = getOrderTargetInfo(vById.get(row.id));
    const rosterH = paged.reduce((s, r) => s + (r._tinfo ? ROW_H_TARGET : ROW_H), 0);

    const totalH = HEADER_H + DOCTRINE_H + 4 + rosterH
                 + (showPaging ? PAGE_H : 0) + 6 + ACTION_H + 6;

    let py = H - bottomRes - (COSMIC.RESOURCE_BAR_H ?? 0) - totalH - 8;
    py = Math.max(COSMIC.TOP_BAND_H + 8, py);

    const leadId = window.KOSMOS?.uiManager?.getSelectedVesselId?.();

    // Tło + ramka
    ctx.fillStyle = bgAlpha(0.92);
    ctx.fillRect(px, py, PW, totalH);
    ctx.strokeStyle = C.borderActive ?? C.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, PW - 1, totalH - 1);

    // ── Header: ◀ nazwa·N ▶  ✏ — ✕ ──
    const closeX  = px + PW - ICON - 4;
    const minBtnX = closeX - ICON - 3;
    const renameX = minBtnX - ICON - 3;
    const nextX   = renameX - ICON - 3;
    const prevX   = px + PAD;
    const hY = py + (HEADER_H - ICON) / 2;
    this._drawIconBtn(ctx, '◀', prevX,   hY, ICON, 'prevFleet',   '_pf');
    this._drawIconBtn(ctx, '▶', nextX,   hY, ICON, 'nextFleet',   '_nf');
    this._drawIconBtn(ctx, '✏', renameX, hY, ICON, 'renameFleet', '_rn');
    this._drawIconBtn(ctx, '—', minBtnX, hY, ICON, 'minimize',    '_min');
    this._drawIconBtn(ctx, '✕', closeX,  hY, ICON, 'closeFleet',  '_cl');
    ctx.fillStyle = C.accent;
    ctx.font = `${C.fontSizeSmall + 1}px ${C.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const nameX = prevX + ICON + 6;
    ctx.fillText(this._truncate(ctx, `${fleet.name ?? '—'} · ${members.length}`, nextX - 6 - nameX), nameX, py + 17);

    // Separator
    ctx.strokeStyle = C.border;
    ctx.beginPath(); ctx.moveTo(px, py + HEADER_H); ctx.lineTo(px + PW, py + HEADER_H); ctx.stroke();

    // ── Doktryna (klik = cykl) ──
    const docLabel = `${t('fleetCmd.doctrine')}: ${t(doctrineNameKey(fleet.doctrine))} ▾`;
    const docHover = this._hoverZone?.type === 'doctrine';
    ctx.fillStyle = docHover ? C.accent : C.textSecondary;
    ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
    ctx.fillText(this._truncate(ctx, docLabel, PW - PAD * 2), px + PAD, py + HEADER_H + 13);
    this._addHit(px + PAD, py + HEADER_H + 2, PW - PAD * 2, DOCTRINE_H - 2, 'doctrine');

    // ── Roster członków ──
    let cy = py + HEADER_H + DOCTRINE_H + 4;
    for (const row of paged) {
      this._drawMemberRow(ctx, row, px, cy, leadId);
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

    // ── Rozkazy floty (2 rzędy: 4 + 3) ──
    const hasOrder = !!fleet.activeOrder;
    const inSpace = members.some((v) => v.position?.state !== 'docked');
    const hasDocked = members.some((v) => v.position?.state === 'docked');
    const actionRows = [
      [
        { type: 'bgMove',   label: t('fleetCmd.move'),   enabled: members.length > 0 },
        { type: 'bgEngage', label: t('fleetCmd.engage'), enabled: members.length > 0 },
        { type: 'bgDock',   label: t('fleetCmd.dock'),   enabled: members.length > 0 },
        { type: 'bgUndock', label: t('fleetCmd.undock'), enabled: hasDocked },
      ],
      [
        { type: 'bgReturn',  label: t('fleetCmd.return'),  enabled: inSpace },
        { type: 'bgStop',    label: t('fleetCmd.stop'),    enabled: hasOrder },
        { type: 'bgDisband', label: t('fleetCmd.disband'), enabled: true, style: 'danger' },
      ],
    ];
    const gap = 5, rowGap = 4;
    const rBtnH = (ACTION_H - rowGap) / 2;
    for (let r = 0; r < actionRows.length; r++) {
      const row = actionRows[r];
      const rBtnW = (PW - PAD * 2 - gap * (row.length - 1)) / row.length;
      const rY = cy + r * (rBtnH + rowGap);
      for (let i = 0; i < row.length; i++) {
        const bx = px + PAD + i * (rBtnW + gap);
        const b = row[i];
        const style = !b.enabled ? 'disabled' : (b.style ?? 'secondary');
        this._drawButton(ctx, b.label, bx, rY, rBtnW, rBtnH, style);
        if (b.enabled) this._addHit(bx, rY, rBtnW, rBtnH, b.type, { label: b.label });
      }
    }

    this._addHit(px, py, PW, totalH, 'bg');   // tło NA KOŃCU (S4-1 gotcha)
    this._drawnRect = { x: px, y: py, w: PW, h: totalH };
  }

  _drawMemberRow(ctx, row, px, rowY, leadId) {
    const C = THEME;
    const isLead = row.id === leadId;

    const iconY   = rowY + (ROW_H - ICON) / 2;
    const removeX = px + PW - PAD - ICON;
    const focusX  = removeX - ICON - 3;
    this._drawIconBtn(ctx, '🎯', focusX,  iconY, ICON, 'memberFocus',  row.id);
    this._drawIconBtn(ctx, '✕', removeX, iconY, ICON, 'memberRemove', row.id);

    const barX = focusX - 10 - BAR_W;
    const barY = rowY + (ROW_H - BAR_H) / 2;
    const fuelColor = row.fuelPct > 0.3 ? (C.success ?? '#00ee88') : (C.warning ?? '#ffcc44');
    this._drawBar(ctx, barX, barY, BAR_W, BAR_H, row.fuelPct, fuelColor, C.border);

    const textMaxW = barX - 8 - (px + PAD);
    ctx.fillStyle = isLead ? C.accent : C.textPrimary;
    ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText(this._truncate(ctx, row.name, textMaxW), px + PAD, rowY + 11);

    const statusLbl = t(STATUS_KEY[row.statusKey] ?? 'fleetGroup.statusDocked');
    let sub = `${this._hullName(row.hullId)} · ${statusLbl}`;
    if ((row.statusKey === 'orbiting' || row.statusKey === 'docked') && row.dockedAt) {
      const bn = resolveBodyName(row.dockedAt);
      if (bn) sub += ` ${bn}`;            // np. „Na orbicie Kepler-442b"
    }
    if (row.orderKey) sub += ` · ${row.orderKey}`;
    ctx.fillStyle = C.textDim;
    ctx.font = `${C.fontSizeSmall - 1}px ${C.fontFamily}`;
    ctx.fillText(this._truncate(ctx, sub, textMaxW), px + PAD, rowY + 22);

    // Linia 3 (warunkowa): cel rozkazu engage/pursue/intercept + żywy dystans.
    if (row._tinfo) {
      const ti = row._tinfo;
      const distTxt = Number.isFinite(ti.distAU) ? ti.distAU.toFixed(1) : '?';
      const line = `${ti.icon} ${t('fleetGroup.targetLine', ti.name, distTxt)}`;
      ctx.fillStyle = ti.orderType === 'engage' ? (C.danger ?? '#ff4466') : (C.warning ?? '#ffcc44');
      ctx.font = `${C.fontSizeSmall - 1}px ${C.fontFamily}`;
      ctx.fillText(this._truncate(ctx, line, PW - PAD * 2), px + PAD, rowY + 33);
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

  // ── Akcje pomocnicze ─────────────────────────────────────────────────────
  _announce(res) {
    if (!res) return;
    const acc = res.accepted?.length ?? 0;
    const tot = acc + (res.rejected?.length ?? 0);
    EventBus.emit('ui:toast', {
      text: res.ok ? t('fleet.orderResult', acc, tot) : t('fleet.orderResultFailed', acc, tot),
      color: res.ok ? (THEME.accent) : '#ff4466',
      durationMs: 2500,
    });
  }

  _armMovePicker(fleetId) {
    const um = window.KOSMOS?.uiManager;
    if (!um?.setPickerMode) return;
    if (um.isPickerActive?.()) um.cancelPickerMode?.();
    um.setPickerMode('targetPoint', (point) => {
      if (!point) return;
      const res = this._fs()?.issueFleetOrder?.(fleetId, { type: 'moveToPoint', targetPoint: { x: point.x, y: point.y } });
      this._announce(res);
      this._markDirty();
    }, { intent: 'fleetcmd_move', fleetId });
  }

  _armEngagePicker(fleetId) {
    const um = window.KOSMOS?.uiManager;
    if (!um?.setPickerMode) return;
    if (um.isPickerActive?.()) um.cancelPickerMode?.();
    um.setPickerMode('targetPoint', (point) => {
      if (!point) return;
      const vm = window.KOSMOS?.vesselManager;
      const thresh = (GAME_CONFIG.AU_TO_PX ?? 110) * 1.5;   // ~1.5 AU tolerancji kliknięcia
      const targetId = nearestEnemyToPoint(vm?.getAllVessels?.() ?? [], point, thresh, isEnemyVessel);
      if (!targetId) {
        EventBus.emit('ui:toast', { text: t('fleetCmd.noEnemyHere'), color: '#ffaa22', durationMs: 2500 });
        return;
      }
      const res = this._fs()?.issueFleetOrder?.(fleetId, { type: 'engage', targetEntityId: targetId });
      this._announce(res);
      this._markDirty();
    }, { intent: 'fleetcmd_engage', fleetId });
  }

  // ⚠ D-255a (Finding 154) — cel POWROTU dobiera `nearestOwnColonyBodyInSystem`, nie
  //   `AutoRetreatSystem._findNearestFriendlyPlanet`. Tamta nie miała TERMINU UKŁADU i przy
  //   gwiazdach stojących w (0,0) wygrywała dystansem kolonia z OBCEGO układu (zmierzone:
  //   „2.00 AU" do `sys_home` dla statku w `sys_020`). Ta powierzchnia miała ten defekt
  //   znak-w-znak jak `FleetManagerOverlay._handleFleetReturnBase` — i to był jej PIERWSZY pomiar.
  _fleetReturn(fleetId) {
    const fs = this._fs();
    const vm = window.KOSMOS?.vesselManager;
    const fleet = fs?.getFleet?.(fleetId);
    if (!fleet || !vm) return;
    const firstMember = fleet.memberIds.map((id) => vm.getVessel(id)).find((v) => v && !v.isWreck);
    const planet = firstMember
      ? nearestOwnColonyBodyInSystem(firstMember, window.KOSMOS?.colonyManager)?.planet
      : null;
    if (!planet) {
      EventBus.emit('ui:toast', { text: t('fleet.noFriendlyPlanet'), color: '#ff4466', durationMs: 3000 });
      return;
    }
    const tx = planet.x ?? planet.position?.x ?? 0;
    const ty = planet.y ?? planet.position?.y ?? 0;
    const res = fs.issueFleetOrder(fleetId, { type: 'moveToPoint', targetPoint: { x: tx, y: ty } });
    // ⚠ D-255b (Finding 263) — marker PO rozkazie i tylko dla PRZYJĘTYCH (bliźniak
    //   `FleetManagerOverlay._handleFleetReturnBase`; powód opisany tam).
    for (const id of (res?.accepted ?? [])) {
      const m = vm.getVessel(id);
      if (m) m._pendingReturnDock = planet.id;   // auto-dock przy dotarciu (FleetSystem listener)
    }
    this._announce(res);
    this._markDirty();
  }

  // ── Interakcja ──────────────────────────────────────────────────────────────
  _onHit(zone) {
    if (!zone) return;
    const fs = this._fs();
    const um = window.KOSMOS?.uiManager;
    const fleetId = this._fleetId;
    if (!fleetId && zone.type !== 'restore') return;

    switch (zone.type) {
      case 'minimize': this._minimized = true;  this._markDirty(); return;
      case 'restore':  this._minimized = false; this._markDirty(); return;
      case 'pageUp':   this._page = Math.max(0, this._page - 1); this._markDirty(); return;
      case 'pageDown': this._page = this._page + 1; this._markDirty(); return;
      case 'prevFleet': {
        const id = nextFleetId(fs?.listFleets?.() ?? [], fleetId, -1);
        if (id) um?.setSelectedFleetId?.(id);
        return;
      }
      case 'nextFleet': {
        const id = nextFleetId(fs?.listFleets?.() ?? [], fleetId, +1);
        if (id) um?.setSelectedFleetId?.(id);
        return;
      }
      case 'closeFleet': um?.setSelectedFleetId?.(null); return;
      case 'renameFleet': {
        const fleet = this._fleet();
        if (!fleet) return;
        showRenameModal(fleet.name ?? '').then((n) => {
          const nm = n?.trim();
          if (nm) fs?.setName?.(fleetId, nm);
          this._markDirty();
        });
        return;
      }
      case 'doctrine': {
        const fleet = this._fleet();
        if (!fleet) return;
        const next = nextDoctrine(fleet.doctrine, +1, ALL_DOCTRINES);
        fs?.setDoctrine?.(fleetId, next);
        EventBus.emit('ui:toast', { text: t(doctrineNameKey(next)), color: THEME.accent, durationMs: 1800 });
        this._markDirty();
        return;
      }
      case 'memberFocus':
        if (zone.data?.id) EventBus.emit('vessel:focus', { vesselId: zone.data.id });
        return;
      case 'memberRemove':
        if (zone.data?.id) { fs?.removeMember?.(zone.data.id, 'manual'); this._markDirty(); }
        return;
      case 'bgMove':    this._armMovePicker(fleetId);   return;
      case 'bgEngage':  this._armEngagePicker(fleetId); return;
      case 'bgReturn':  this._fleetReturn(fleetId);     return;
      case 'bgStop':    fs?.cancelFleetOrder?.(fleetId, 'manual'); this._markDirty(); return;
      case 'bgDisband': fs?.disbandFleet?.(fleetId, 'manual'); return;
      case 'bgUndock': {
        // Undock — zadokowani członkowie startują i ORBITUJĄ swoje ciało (instant).
        const vm = window.KOSMOS?.vesselManager;
        const fleet = this._fleet();
        for (const id of (fleet?.memberIds ?? [])) {
          const v = vm?.getVessel?.(id);
          if (v?.position?.state === 'docked') vm.undockToOrbit(id);
        }
        this._markDirty();
        return;
      }
      case 'bgDock': {
        // Dock — picker kolonii gracza → rozkaz dock per członek (issueFleetOrder nie zna 'dock').
        // ⚠ Slice 258: JEDNO źródło (`VesselGroupActions.openDockPicker`) — ta pętla była niemal
        //   znak-w-znak kopią `FleetGroupPanel.grpDock`. Czysty przerzut, bez zmiany zachowania;
        //   `sameSystemOnly` CELOWO POMINIĘTE (=false) — patrz Finding 256.
        const fleet = this._fleet();
        if (!fleet) return;
        openDockPicker([...(fleet.memberIds ?? [])], { onDone: () => this._markDirty() });
        return;
      }
      // 'bg' → swallow
    }
  }
}
