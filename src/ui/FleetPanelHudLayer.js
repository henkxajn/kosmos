// FleetPanelHudLayer — REFORMA ZAKŁADEK T6 (TABS_REFORM_PLAN.md §5.9): lekki renderer PANELU FLOTY i PANELU GRUPY N ≥ 2
// przy prawym outlinerze W IDIOMIE ETYKIET z T5 (za flagą `FEATURES.fleetPanelHud`; logika — czysty `FleetPanelHudLogic`).
// Rysuje na `#ui-canvas` w miejscu panelu statku T5 (`UIManager._draw` — po karcie walki, przed dokiem; w klatce co najwyżej
// jeden z trzech paneli — mutex `fleetHudSurface`): ciemny półprzezroczysty pasek bez ramki, font motywu, kolory z ról,
// cyfry w kratce — maszyneria tekstu (pomiar, pamięć linii, kratka cyfr) odziedziczona z `ShipPanelHudLayer` co do metody;
// wysokość = treść (klamra do obszaru mapy — podaje `UIManager`); przewija się LISTA członków (kółko nad panelem).
//   • klik: chip > linia członka > linia nazwy > reszta (pochłonięta); chip woła TEN SAM handler co przycisk dzisiejszego
//     panelu (`runFleetPanelAction` → `FleetCommandPanel._onHit` / `FleetGroupPanel._onHit`); linia członka — zaznaczenie
//     statku (panel statku T5), linia nazwy — reguła D-UI-5 (2. klik: kamera); okno DOM na wierzchu — klik pochłonięty;
//   • akordeon „[ Rozkazy ▼ ]” zwija się przy zmianie zaznaczenia statków i floty.
// ⚠ Importuje się pod node (keeper `fleet_panel_hud_smoke` — atrapa ctx): bez three i bez DOM poza strażnikiem okna.
import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { THEME } from '../config/ThemeConfig.js';
import { t } from '../i18n/i18n.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { resolveHudRoles } from './HudPalette.js';
import { truncateText } from './HudLabelLogic.js';
import { CLICK_INTENT, clickObject, vesselTarget, vesselsTarget, fleetTarget, readClickSelection } from './ClickIntentLogic.js';
import { getOrderTargetInfo } from './OrderTargetInfo.js';
import { systemIdOf } from '../utils/SystemScope.js';
import { resolveVesselStatus } from '../utils/VesselStatus.js';
import { ShipPanelHudLayer } from './ShipPanelHudLayer.js';
import { wrapText, wrapName, layoutChipRows } from './ShipPanelHudLogic.js';
import {
  FLEET_PANEL_HUD, buildFleetPanelModel, buildGroupPanelModel, modelZones, toggleOrders, ordersOpen, fleetPanelHitAt,
  runFleetPanelAction, memberClickPlan, tuneFleetPanelHud, resetFleetPanelHud,
} from './FleetPanelHudLogic.js';

export class FleetPanelHudLayer extends ShipPanelHudLayer {
  constructor() {
    super();   // `ui:selectionChanged` → `collapse` (akordeon i przewinięcie)
    // Zmiana floty (także flota → nic → flota) zwija akordeon i zeruje przewinięcie — jak zmiana zaznaczenia statku.
    EventBus.on('ui:fleetSelectionChanged', () => this.collapse());
  }

  /** Strojenie stałych z konsoli (bramka): `KOSMOS.fleetPanelHud.tune({ W: 210 })`; `tune(null)` — wartości domyślne. */
  tune(patch) {
    const r = patch == null ? resetFleetPanelHud() : tuneFleetPanelHud(patch);
    this._lineCache.clear();
    if (typeof window !== 'undefined' && window.KOSMOS?.uiManager) window.KOSMOS.uiManager._dirty = true;
    return r;
  }

  // ── Układ ────────────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * Model + układ panelu floty (`surface === 'fleetHud'`) albo grupy (`'groupHud'`) — co klatkę rysunku. `null` — brak
   * panelu (flota zniknęła, zaznaczenie bez żywych statków gracza).
   * @param {{ ctx:object, K:object, um:object, fcp?:object, fgp?:object, surface:string, maxH:number }} p
   * @returns {{ w:number, h:number }|null}
   */
  prepare({ ctx, K, um, fcp = null, fgp = null, surface, maxH }) {
    this.stats.prepares++;
    const fontStatus = (typeof document !== 'undefined' && document.fonts?.status) || 'loaded';
    if (fontStatus !== this._fontStatus) { this._fontStatus = fontStatus; this._measure.clear(); this._lineCache.clear(); }
    const env = { K, orderTargetInfo: (v) => getOrderTargetInfo(v), systemName: (id) => EntityManager.getStarOfSystem?.(id)?.name ?? null };
    let model = null;
    if (surface === 'fleetHud') {
      const fid = um?.getSelectedFleetId?.() ?? null;
      const fleet = fid != null ? (K?.fleetSystem?.getFleet?.(fid) ?? null) : null;
      model = buildFleetPanelModel(fleet, { ...env, minimized: fcp?._minimized === true, picker: um?.getPickerState?.() ?? null });
    } else if (surface === 'groupHud') {
      const vm = K?.vesselManager;
      // Lustro `FleetGroupPanel._liveVessels`: żywe statki gracza z zaznaczenia, w jego kolejności.
      const vessels = (um?.getSelectedVesselIds?.() ?? []).map((id) => vm?.getVessel?.(id)).filter((v) => v && !v.isWreck && !isEnemyVessel(v));
      model = buildGroupPanelModel(vessels, { ...env, leadId: um?.getSelectedVesselId?.() ?? null, minimized: fgp?._minimized === true });
    }
    if (!model) { this._prep = null; return null; }
    const S = FLEET_PANEL_HUD;
    const W = model.wide ? S.W_CONFIG : S.W;
    const inner = W - 2 * S.PAD_X;
    const sz = THEME.fontSizeSmall ?? 9;
    const nameSize = (THEME.fontSizeNormal ?? 11) - 1;
    const tw = (s, o = { size: sz }) => this._textWidth(ctx, s, o);
    const blocks = [];
    const text = (s, { role = 'primary', alpha = S.SUB_ALPHA, list = false, indent = 0, indent0 = 0 } = {}) => {
      for (const [i, part] of wrapText(s, inner - Math.max(indent, indent0), (q) => tw(q)).entries()) {
        blocks.push({ k: 'text', ln: this._line(ctx, part, { size: sz }), role, alpha, list, indent: i > 0 ? Math.max(indent, indent0) : indent0, h: sz + 3 });
      }
    };
    const gap = (h = S.SECTION_GAP, list = false) => blocks.push({ k: 'gap', h, list });
    const chipW = (label) => tw(`[ ${label} ]`);
    const chipRows = (items, { list = false } = {}) => {
      if (!items.length) return;
      const avail = inner - tw('[  ]');
      const fitted = items.map((c) => {
        const lbl = chipW(c.label) > inner ? truncateText(c.label, avail, (q) => tw(q)) : c.label;
        return { ...c, lbl, ln: this._line(ctx, `[ ${lbl} ]`, { size: sz }) };
      });
      const rowH = sz + 3 + 2 * S.CHIP_PAD_Y;
      const rows = layoutChipRows(fitted.map((c) => ({ id: c.id, label: c.lbl })), (b) => chipW(b.label), inner, S.CHIP_GAP)
        .map((row) => row.map((r) => ({ ...fitted.find((c) => c.id === r.id), x: r.x, w: r.w })));
      rows.forEach((row, i) => {
        if (i > 0) blocks.push({ k: 'gap', h: S.CHIP_ROW_GAP, list });
        blocks.push({ k: 'chips', row, list, h: rowH });
      });
    };
    const glyph = (c) => ({ ...c, ln: this._line(ctx, c.label, { size: sz }) });
    const m = model;
    // Linia sterowania: chipy-glify „◀ ▶” (lewa) i „— ✕” / „+” (prawa).
    if (m.top.left.length || m.top.right.length) {
      blocks.push({ k: 'top', left: m.top.left.map(glyph), right: m.top.right.map(glyph), h: sz + 3 + 2 * S.CHIP_PAD_Y });
    }
    // Nazwa (glif ⛬, małe litery, pogrubiona, ≤ 2 linie) + ✎ (flota).
    const pen = m.name.rename ? this._line(ctx, '✎', { size: nameSize }) : null;
    const nw = wrapName(`${m.name.glyph} ${m.name.text}`, inner - (pen ? pen.w + S.RENAME_GAP : 0),
      (q) => tw(q, { size: nameSize, bold: true }), S.NAME_MAX_LINES);
    blocks.push({ k: 'name', lines: nw.lines.map((s) => this._line(ctx, s, { size: nameSize, bold: true })), clipped: nw.clipped,
      pen, zone: m.name.rename, h: nw.lines.length * (nameSize + 3) + (nw.lines.length - 1) * S.LINE_GAP });
    if (!m.minimized) {
      if (m.sub) text(m.sub);
      for (const ln of m.info) text(ln.text, { role: ln.role ?? 'primary', alpha: ln.role === 'alert' ? 1 : S.SUB_ALPHA });
      if (m.doctrine) blocks.push({ k: 'link', ln: this._line(ctx, truncateText(m.doctrine.label, inner, (q) => tw(q)), { size: sz }),
        zone: m.doctrine.zone, id: 'doctrine', h: sz + 3 });
      // Lista członków (przewijana): glif roli w kolorze znacznika + nazwa (lider — pogrubiony), dopisek układu, chipy-glify.
      if (m.members.length) {
        gap();
        const mh = sz + 3 + 2 * S.MEMBER_PAD_Y;
        for (const r of m.members) {
          const g = this._line(ctx, r.glyph, { size: sz });
          const chips = r.chips.map(glyph);
          const chipsW = chips.reduce((s, c) => s + c.ln.w, 0) + S.GLYPH_GAP * chips.length;
          const note = r.note ? this._line(ctx, truncateText(r.note, 56, (q) => tw(q)), { size: sz }) : null;
          const nameMax = Math.max(12, inner - g.w - 4 - chipsW - (note ? note.w + 4 : 0));
          const name = this._line(ctx, truncateText(r.text, nameMax, (q) => tw(q, { size: sz, bold: r.lead })), { size: sz, bold: r.lead });
          blocks.push({ k: 'member', id: r.id, glyph: g, name, note, chips, role: r.role, alpha: r.alpha, lead: r.lead, list: true, h: mh });
          if (r.target) text(r.target.text, { role: 'alert', alpha: 1, list: true, indent0: g.w + 4 });
        }
      }
      // Konfigurator celu floty (picker Rusz / Atak tej floty uzbrojony).
      if (m.config) {
        gap();
        blocks.push({ k: 'eyebrow', ln: this._line(ctx, m.config.header, { size: sz, spacing: S.EYEBROW_SPACING }), h: sz + 3 });
        text(m.config.hint, { alpha: S.SUB_ALPHA * 0.85 });
        gap(3);
        chipRows(m.config.chips);
      }
      // Akcje główne.
      if (m.chips.length) { gap(); chipRows(m.chips); }
      // Rozkazy floty / grupy (akordeon jak T5).
      if (m.orders) {
        const open = ordersOpen(this._open, m.key) && m.orders.items.length > 0;
        gap();
        chipRows([{ id: 'orders', local: 'orders', label: `${t('shipPanelHud.orders')} ${open ? '▲' : '▼'}`, enabled: m.orders.items.length > 0, zone: null }]);
        if (open) { gap(2); chipRows(m.orders.items); }
      }
    }
    // Wysokości i lista członków (kolejne bloki `list`) — okno ≤ `MEMBERS_MAX` linii, przy braku miejsca mniejsze.
    let total = 2 * S.PAD_Y;
    for (const b of blocks) total += b.h;
    const li = blocks.findIndex((b) => b.list), lj = blocks.length - 1 - [...blocks].reverse().findIndex((b) => b.list);
    let list = null;
    if (li >= 0) {
      let before = S.PAD_Y; for (let i = 0; i < li; i++) before += blocks[i].h;
      let contentH = 0; for (let i = li; i <= lj; i++) contentH += blocks[i].h;
      const capH = Math.max(S.LIST_MIN_H, S.MEMBERS_MAX * (sz + 3 + 2 * S.MEMBER_PAD_Y));
      let viewH = Math.min(contentH, capH);
      const over = Math.max(0, total - contentH + viewH - maxH);
      if (over > 0) viewH = Math.max(Math.min(contentH, S.LIST_MIN_H), viewH - over);
      list = { from: li, to: lj, top: before, contentH, viewH };
      total = total - contentH + viewH;
    }
    // Klucz listy: panel (flota / zbiór) i zwinięcie — zmiana zeruje przewinięcie.
    const sk = `${m.key}|${m.minimized ? 'm' : ''}`;
    if (sk !== this._scrollKey) { this._scrollKey = sk; this._scroll = 0; }
    this._maxScroll = list ? Math.max(0, list.contentH - list.viewH) : 0;
    this._scroll = Math.max(0, Math.min(this._maxScroll, this._scroll));
    const h = Math.round(Math.min(Math.max(total, 24), Math.max(24, maxH)));
    this._prep = { w: W, h, model: m, blocks, list, inner };
    return { w: W, h };
  }

  // ── Rysunek ──────────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * Rysunek w prostokącie `rect` (z `UIManager._fleetPanelAtOutliner` — geometria T3); strefy kliku tej klatki.
   * @param {{ pointer?:{x:number,y:number}|null, roles?:object }} [o]
   */
  draw(ctx, rect, { pointer = null, roles = null } = {}) {
    const P = this._prep;
    if (!P || !rect) { this.clear(); return; }
    this.stats.draws++;
    const S = FLEET_PANEL_HUD;
    const R = roles ?? resolveHudRoles(THEME);
    const x0 = rect.x, y0 = rect.y, w = rect.w, h = rect.h;
    const zones = [];
    const px = pointer?.x, py = pointer?.y;
    const over = (z) => Number.isFinite(px) && Number.isFinite(py) && px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h;
    const hoverFill = (z, a = S.CHIP_HOVER_FILL) => { ctx.globalAlpha = a; ctx.fillStyle = R.primary; ctx.fillRect(z.x, z.y, z.w, z.h); };
    ctx.save();
    ctx.globalAlpha = S.BAR_ALPHA;
    ctx.fillStyle = THEME.bgPrimary;
    ctx.fillRect(x0, y0, w, h);
    ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
    const L = P.list;
    let y = y0 + S.PAD_Y;
    const xl = x0 + S.PAD_X;
    const inView = (z, inList, clipTop, clipBot) => !inList || (z.y >= clipTop - 0.5 && z.y + z.h <= clipBot + 0.5);
    // Chip-glif (linia sterowania, koniec linii członka): bez nawiasów, strefa z zapasem; nieaktywny — rola `dim`.
    const drawGlyphChip = (c, cx, by, bh, inList, clipTop, clipBot) => {
      const z = { kind: 'chip', id: c.id, zone: c.zone ?? null, local: c.local ?? null, enabled: c.enabled !== false,
        x: cx - S.CHIP_HIT_PAD_X, y: by, w: c.ln.w + 2 * S.CHIP_HIT_PAD_X, h: bh };
      const visible = inView(z, inList, clipTop, clipBot);
      const hot = z.enabled && visible && over(z);
      if (hot) hoverFill(z);
      this._drawLine(ctx, c.ln, cx, by + (bh - (c.ln.size + 3)) / 2 + c.ln.size, z.enabled ? R.primary : R.dim, z.enabled ? (hot ? 1 : S.CHIP_ALPHA) : S.CHIP_ALPHA);
      if (visible && z.enabled) zones.push(z);
      return hot;
    };
    const drawBlock = (b, by, inList, clipTop, clipBot) => {
      switch (b.k) {
        case 'gap': break;
        case 'text':
          this._drawLine(ctx, b.ln, xl + (b.indent ?? 0), by + b.ln.size, R[b.role] ?? R.primary, b.alpha);
          break;
        case 'top': {
          let x = xl;
          for (const c of b.left) { drawGlyphChip(c, x, by, b.h, inList, clipTop, clipBot); x += c.ln.w + S.GLYPH_GAP; }
          let xr = x0 + w - S.PAD_X;
          for (let i = b.right.length - 1; i >= 0; i--) {
            const c = b.right[i];
            xr -= c.ln.w;
            drawGlyphChip(c, xr, by, b.h, inList, clipTop, clipBot);
            xr -= S.GLYPH_GAP;
          }
          break;
        }
        case 'name': {
          let ly = by, maxW = 0;
          b.lines.forEach((ln, i) => { if (i > 0) ly += S.LINE_GAP; this._drawLine(ctx, ln, xl, ly + ln.size, R.primary, 1); maxW = Math.max(maxW, ln.w); ly += ln.h; });
          zones.push({ kind: 'name', id: 'name', x: xl, y: by, w: maxW, h: b.h });
          if (b.pen && b.zone) {
            const last = b.lines[b.lines.length - 1];
            const lastY = by + b.h - last.h;
            const pz = { kind: 'chip', id: 'renameFleet', zone: b.zone, enabled: true, x: xl + last.w + S.RENAME_GAP - S.CHIP_HIT_PAD_X, y: lastY, w: b.pen.w + 2 * S.CHIP_HIT_PAD_X, h: last.h };
            const hot = over(pz);
            if (hot) hoverFill(pz);
            this._drawLine(ctx, b.pen, xl + last.w + S.RENAME_GAP, lastY + last.size, R.primary, hot ? 1 : S.CHIP_ALPHA);
            zones.push(pz);
          }
          break;
        }
        case 'link': {
          const z = { kind: 'chip', id: b.id, zone: b.zone, enabled: true, x: xl - S.CHIP_HIT_PAD_X, y: by, w: b.ln.w + 2 * S.CHIP_HIT_PAD_X, h: b.h };
          const hot = over(z);
          if (hot) hoverFill(z);
          this._drawLine(ctx, b.ln, xl, by + b.ln.size, R.primary, hot ? 1 : S.SUB_ALPHA);
          zones.push(z);
          break;
        }
        case 'eyebrow':
          this._drawLine(ctx, b.ln, xl, by + b.ln.size, R.primary, S.EYEBROW_ALPHA);
          break;
        case 'member': {
          const mz = { kind: 'member', id: b.id, x: x0 + 1, y: by, w: w - 2, h: b.h };
          const visible = inView(mz, inList, clipTop, clipBot);
          // Chipy-glify od prawej; linia (bez chipów) — zaznaczenie statku.
          let xr = x0 + w - S.PAD_X;
          const chipX = [];
          for (let i = b.chips.length - 1; i >= 0; i--) { xr -= b.chips[i].ln.w; chipX[i] = xr; xr -= S.GLYPH_GAP; }
          const overChip = b.chips.some((c, i) => over({ x: chipX[i] - S.CHIP_HIT_PAD_X, y: by, w: c.ln.w + 2 * S.CHIP_HIT_PAD_X, h: b.h }));
          if (visible && !overChip && over(mz)) hoverFill(mz, S.CHIP_HOVER_FILL * 0.6);
          const ty = by + S.MEMBER_PAD_Y + b.name.size;
          this._drawLine(ctx, b.glyph, xl, ty, R[b.role] ?? R.primary, b.alpha);
          this._drawLine(ctx, b.name, xl + b.glyph.w + 4, ty, R.primary, b.lead ? 1 : S.SUB_ALPHA + 0.1);
          if (b.note) this._drawLine(ctx, b.note, xr + S.GLYPH_GAP - b.note.w - 4, ty, R.dim, S.SUB_ALPHA);
          if (visible) zones.push(mz);
          b.chips.forEach((c, i) => drawGlyphChip(c, chipX[i], by, b.h, inList, clipTop, clipBot));
          break;
        }
        case 'chips':
          for (const c of b.row) {
            const z = { kind: 'chip', id: c.id, zone: c.zone ?? null, local: c.local ?? null, enabled: c.enabled !== false,
              x: xl + c.x - S.CHIP_HIT_PAD_X, y: by, w: c.w + 2 * S.CHIP_HIT_PAD_X, h: b.h };
            const visible = inView(z, inList, clipTop, clipBot);
            const hot = z.enabled && visible && over(z);
            if (hot) hoverFill(z);
            const col = z.enabled ? (R[c.role] ?? R.primary) : R.dim;
            this._drawLine(ctx, c.ln, xl + c.x, by + S.CHIP_PAD_Y + c.ln.size, col, z.enabled ? (hot ? 1 : S.CHIP_ALPHA) : S.CHIP_ALPHA);
            if (visible && (z.enabled || z.local)) zones.push(z);
          }
          break;
        default: break;
      }
    };
    for (let i = 0; i < P.blocks.length; i++) {
      const b = P.blocks[i];
      if (L && i === L.from) {
        const top = y, bot = y + L.viewH;
        ctx.save(); ctx.beginPath(); ctx.rect(x0, top, w, L.viewH); ctx.clip();
        let ly = top - this._scroll;
        for (let j = L.from; j <= L.to; j++) {
          const bj = P.blocks[j];
          if (ly + bj.h >= top && ly <= bot) drawBlock(bj, ly, true, top, bot);
          ly += bj.h;
        }
        ctx.restore();
        if (this._maxScroll > 0) {
          const th = Math.max(10, L.viewH * (L.viewH / L.contentH));
          const ty = top + (L.viewH - th) * (this._scroll / this._maxScroll);
          ctx.globalAlpha = S.BAR_TRACK_ALPHA; ctx.fillStyle = R.dim; ctx.fillRect(x0 + w - S.SCROLLBAR_W - 1, top, S.SCROLLBAR_W, L.viewH);
          ctx.globalAlpha = 0.8; ctx.fillStyle = R.primary; ctx.fillRect(x0 + w - S.SCROLLBAR_W - 1, ty, S.SCROLLBAR_W, th);
        }
        y += L.viewH;
        i = L.to;
        continue;
      }
      drawBlock(b, y, false, y0, y0 + h);
      y += b.h;
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    zones.push({ kind: 'body', id: 'body', x: x0, y: y0, w, h });
    this._zones = zones;
    this.rect = { x: x0, y: y0, w, h };
  }

  // ── Wejście ──────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Aktywny chip albo linia członka pod punktem (kursor „rączki”); `null` — brak. */
  chipAt(x, y) {
    if (!this._inside(x, y)) return null;
    const z = fleetPanelHitAt(this._zones, x, y);
    if (z?.kind === 'chip' && z.enabled !== false) return z.id;
    return z?.kind === 'member' ? `member:${z.id}` : null;
  }

  /**
   * Klik w panel (px logiczne) — każdy klik w prostokącie POCHŁONIĘTY (`true`): chip → dzisiejszy handler (`_onHit` panelu
   * floty / grupy), „[ Rozkazy ▼ ]” → akordeon, „[ ANULUJ ]” → zdjęcie pickera celu floty; linia członka → zaznaczenie statku;
   * linia nazwy → reguła D-UI-5; reszta — nic.
   * @param {{ K?:object, um?:object, fcp?:object, fgp?:object, emit?:Function }} env
   */
  handleClick(x, y, { K = null, um = null, fcp = null, fgp = null, emit = null } = {}) {
    if (!this._inside(x, y)) return false;
    if (typeof document !== 'undefined' && document.querySelector?.('.mission-modal-overlay, .kosmos-modal-overlay')) return true;
    const z = fleetPanelHitAt(this._zones, x, y);
    const m = this._prep?.model ?? null;
    if (!z || !m) return true;
    const em = emit ?? ((n, p) => EventBus.emit(n, p));
    if (z.kind === 'chip') {
      if (z.local === 'orders') { if (z.enabled !== false) this._open = toggleOrders(this._open, m.key); return true; }
      if (z.local === 'cancelPicker') { um?.cancelPickerMode?.(); return true; }
      if (z.zone && z.enabled !== false) runFleetPanelAction(z.zone, { panel: m.kind === 'fleet' ? fcp : fgp });
      return true;
    }
    if (z.kind === 'member') { this._memberClick(z.id, m, { K, um, emit: em }); return true; }
    if (z.kind === 'name') this._nameClick(m, { K, emit: em });
    return true;
  }

  /**
   * Klik w linię członka: zaznaczenie statku → panel statku T5; panel floty / grupy znika (JEDEN panel naraz). Plan —
   * `memberClickPlan`; wykonanie jak wiersz statku w prawym outlinerze (D-UI-5 `select`, mutex floty, ping zadokowanego).
   * @returns {'clearFleet'|string|null}
   */
  _memberClick(id, m, { K, um, emit }) {
    const v = K?.vesselManager?.getVessel?.(id) ?? null;
    if (!v) return null;
    const plan = memberClickPlan(readClickSelection(K), id);
    if (m.kind === 'fleet') um?.setSelectedFleetId?.(null);
    if (plan === 'clearFleet') return 'clearFleet';
    const intent = clickObject(vesselTarget(id, v), { K, emit });
    if (intent === CLICK_INTENT.SELECT) {
      um?.setSelectedFleetId?.(null);   // §7.11 — mutex flota / statek (jak wiersz statku w outlinerze)
      if (resolveVesselStatus(v).token === 'docked') K?.threeRenderer?.pingVessel?.(id);
    }
    return intent;
  }

  /** Linia nazwy — reguła D-UI-5: flota → cel floty (2. klik: kamera na prowadzącym); grupa → klaster (kamera na liderze). */
  _nameClick(m, { K, emit }) {
    const vm = K?.vesselManager;
    if (m.kind === 'fleet') {
      const lead = m.leadId != null ? (vm?.getVessel?.(m.leadId) ?? null) : null;
      return clickObject(fleetTarget(m.fleetId, lead), { K, emit });
    }
    const lead = vm?.getVessel?.(m.leadId) ?? null;
    const ids = [m.leadId, ...m.ids.filter((i) => i !== m.leadId)];
    return clickObject(vesselsTarget(ids, lead ? systemIdOf(lead) : null), { K, emit });
  }

  /** Kółko nad panelem: przewija listę członków (gdy jest co), zawsze pochłonięte (nie zoomuje mapy pod panelem). */
  handleWheel(x, y, delta) {
    if (!this._inside(x, y)) return false;
    if (this._maxScroll > 0) this._scroll = Math.max(0, Math.min(this._maxScroll, this._scroll + delta * FLEET_PANEL_HUD.SCROLL_STEP));
    return true;
  }

  /** Odczyt dla bramki i keepera: prostokąt, rodzaj panelu, strefy, chipy, rozkazy, członkowie, akordeon, lista. */
  debug() {
    const r1 = (v) => (Number.isFinite(v) ? +v.toFixed(1) : v);
    const P = this._prep;
    const m = P?.model ?? null;
    return {
      rect: this.rect ? { x: r1(this.rect.x), y: r1(this.rect.y), w: r1(this.rect.w), h: r1(this.rect.h) } : null,
      kind: m?.kind ?? null, key: m?.key ?? null, minimized: !!m?.minimized, wide: !!m?.wide, config: m?.config?.intent ?? null,
      ordersOpen: m ? ordersOpen(this._open, m.key) : false,
      scroll: r1(this._scroll), maxScroll: r1(this._maxScroll),
      members: (m?.members ?? []).map((r) => ({ id: r.id, marker: r.marker, lead: r.lead, note: r.note, target: r.target?.text ?? null })),
      zones: this._zones.map((z) => ({ kind: z.kind, id: z.id, type: z.zone?.type ?? null, enabled: z.enabled !== false,
        x: r1(z.x), y: r1(z.y), w: r1(z.w), h: r1(z.h) })),
      chips: (m?.chips ?? []).map((c) => ({ id: c.id, label: c.label, enabled: c.enabled })),
      orders: (m?.orders?.items ?? []).map((c) => ({ id: c.id, label: c.label, enabled: c.enabled })),
      modelZones: m ? modelZones(m).map((z) => z.type) : [],
    };
  }
}
