// ShipPanelHudLayer — REFORMA ZAKŁADEK T5 (TABS_REFORM_PLAN.md §5.8): lekki renderer panelu statku przy prawym outlinerze
// W IDIOMIE PRZYPIĘĆ HUD (flaga kroku `shipPanelHud` — na stałe ON od T4; logika — czysty `ShipPanelHudLogic`). Rysuje na `#ui-canvas`
// w miejscu panelu T3 (`UIManager._draw` — po karcie walki, przed dokiem): kolejność rysunku i kliku, łącznik z wierszem,
// blokada kamery, przeszkody kart i etykiet — jak panel T3; zmienia się wyłącznie WYGLĄD i układ treści.
//   • ciemny półprzezroczysty pasek bez ramki (`THEME.bgPrimary` × `BAR_ALPHA` — jak przypięta etykieta HUD), font motywu,
//     kolory WYŁĄCZNIE z ról (`HudPalette.resolveHudRoles`: `primary` — treść, `dim` — nieaktywne, `alert` — walka, blokada,
//     powody), cyfry w stałej kratce (D-HUD-6 — font proporcjonalny, np. Rajdhani w Neon Cyber, cyfra po cyfrze);
//   • wysokość = treść (klamra do obszaru mapy z `MapInsets` — podaje `UIManager`); brak miejsca — przewija się LISTA
//     (rozkazy misji albo cele konfiguratora), nie panel; kółko nad panelem zawsze pochłonięte (jak panel T3);
//   • klik: chip > linia nazwy (reguła D-UI-5 — `clickObject`: 2. klik, kamera) > reszta panelu (pochłonięta); chip woła
//     TE SAME handlery co przycisk panelu T3 (`runShipPanelAction` → `FleetManagerOverlay._handleHit` / footer); okno DOM
//     na wierzchu — klik pochłonięty bez akcji (lustro dawnego `handleVesselPanelClick`, usuniętego w T4);
//   • akordeon „[ Rozkazy ▼ ]” — zwija się przy zmianie zaznaczenia (`ui:selectionChanged`).
// ⚠ Moduł importuje się pod node (keeper `ship_panel_hud_smoke` — atrapa ctx): bez three i bez DOM poza strażnikiem okna.
import EventBus from '../core/EventBus.js';
import { THEME } from '../config/ThemeConfig.js';
import { t } from '../i18n/i18n.js';
import { resolveHudRoles } from './HudPalette.js';
import { layoutTabular, truncateText } from './HudLabelLogic.js';
import { clickObject, vesselTarget } from './ClickIntentLogic.js';
import { getOrderTargetInfo } from './OrderTargetInfo.js';
import {
  SHIP_PANEL_HUD, buildShipPanelModel, modelZones, wrapText, wrapName, layoutChipRows, toggleOrders, ordersOpen,
  shipPanelHitAt, runShipPanelAction, tuneShipPanelHud, resetShipPanelHud,
} from './ShipPanelHudLogic.js';

const MEASURE_CACHE_MAX = 800;

export class ShipPanelHudLayer {
  constructor() {
    this.rect = null;            // prostokąt panelu z ostatniej klatki (px logiczne); `null` — panelu nie było
    this._zones = [];            // strefy z ostatniej klatki: { kind: 'chip'|'name'|'body', id, zone?, local?, x, y, w, h }
    this._open = null;           // akordeon rozkazów: { ck, list } (`toggleOrders`)
    this._scroll = 0;            // przewinięcie listy (rozkazy / cele) — px
    this._scrollKey = null;      // klucz listy (statek | lista | krok konfiguratora) — zmiana zeruje przewinięcie
    this._maxScroll = 0;
    this._prep = null;           // układ z `prepare` (tej klatki)
    this._measure = new Map();   // `font|tekst` → szerokość
    this._lineCache = new Map(); // `font|odstęp|tekst` → linia (układ z kratką cyfr)
    this._fontStatus = null;
    this.stats = { prepares: 0, draws: 0, measures: 0 };
    // Zmiana zaznaczenia (także A → nic → A) zwija listę rozkazów i zeruje przewinięcie (decyzja T5: akordeon jak w T2).
    EventBus.on('ui:selectionChanged', () => this.collapse());
  }

  /** Zwiń akordeon i wyzeruj przewinięcie listy. */
  collapse() { this._open = null; this._scroll = 0; this._scrollKey = null; }

  /** Brak panelu w tej klatce — bez prostokąta i stref (klik, kółko, kursor, blokada kamery, przeszkody). */
  clear() { this.rect = null; this._zones = []; this._prep = null; }

  /** Strojenie stałych z konsoli (bramka): `KOSMOS.shipPanelHud.tune({ W: 210 })`; `tune(null)` — wartości domyślne. */
  tune(patch) {
    const r = patch == null ? resetShipPanelHud() : tuneShipPanelHud(patch);
    this._lineCache.clear();
    if (typeof window !== 'undefined' && window.KOSMOS?.uiManager) window.KOSMOS.uiManager._dirty = true;
    return r;
  }

  // ── Tekst (pomiar ctx; atrapa bez `measureText` — przybliżenie z rozmiaru fontu) ─────────────────────────────────────
  _width(ctx, font, size, s) {
    const k = font + '|' + s;
    const hit = this._measure.get(k);
    if (hit != null) return hit;
    let w = null;
    if (ctx?.measureText) {
      ctx.font = font;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      w = ctx.measureText(s)?.width;
      this.stats.measures++;
    }
    if (!Number.isFinite(w)) w = String(s).length * size * 0.6;
    if (this._measure.size > MEASURE_CACHE_MAX) this._measure.clear();
    this._measure.set(k, w);
    return w;
  }

  _line(ctx, text, { size, bold = false, spacing = 0 }) {
    const font = `${bold ? 'bold ' : ''}${size}px ${THEME.fontFamily}`;
    const key = `${font}|${spacing}|${text}`;
    const hit = this._lineCache.get(key);
    if (hit) return hit;
    let cell = 0, lo = Infinity, hi = 0;
    for (let d = 0; d <= 9; d++) { const w = this._width(ctx, font, size, String(d)); cell = Math.max(cell, w); lo = Math.min(lo, w); hi = Math.max(hi, w); }
    const measure = (s) => this._width(ctx, font, size, s);
    const lay = layoutTabular(String(text ?? ''), { measure, cell, spacing });
    // Cyfry równej szerokości (Share Tech Mono) — linia jednym `fillText`; font proporcjonalny — cyfra po cyfrze w kratce.
    const segs = (hi - lo < 0.01) ? [{ s: String(text ?? ''), x: 0, w: lay.w, digit: false }] : lay.segs;
    const ln = { text: String(text ?? ''), font, size, spacing, cell, w: lay.w, segs, h: size + 3 };
    if (this._lineCache.size > MEASURE_CACHE_MAX) this._lineCache.clear();
    this._lineCache.set(key, ln);
    return ln;
  }

  _textWidth(ctx, text, opts) { return this._line(ctx, text, opts).w; }

  _drawLine(ctx, ln, x, y, color, alpha) {
    ctx.font = ln.font;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.textBaseline = 'alphabetic';
    for (const s of ln.segs) {
      if (s.digit) {
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        ctx.textAlign = 'center';
        ctx.fillText(s.s, x + s.x + ln.cell / 2, y);
      } else {
        if ('letterSpacing' in ctx) ctx.letterSpacing = `${ln.spacing}px`;
        ctx.textAlign = 'left';
        ctx.fillText(s.s, x + s.x, y);
      }
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.textAlign = 'left';
  }

  // ── Układ ────────────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * Model + układ panelu zaznaczonego statku (wywoływane co klatkę rysunku). `null` — brak panelu (statek nie istnieje,
   * wrak, wróg). Zwraca szerokość i wysokość (klamra do `maxH`; brak miejsca — przewijana lista).
   * @param {{ ctx:object, K:object, fmo:object, vesselId:string, maxH:number, features?:object }} p
   * @returns {{ w:number, h:number }|null}
   */
  prepare({ ctx, K, fmo, vesselId, maxH, features = null }) {
    this.stats.prepares++;
    const fontStatus = (typeof document !== 'undefined' && document.fonts?.status) || 'loaded';
    if (fontStatus !== this._fontStatus) { this._fontStatus = fontStatus; this._measure.clear(); this._lineCache.clear(); }
    const v = vesselId != null ? (K?.vesselManager?.getVessel?.(vesselId) ?? null) : null;
    const env = { K, fmo, features: features ?? K?.gameConfig?.FEATURES ?? {}, orderTargetInfo: (x) => getOrderTargetInfo(x) };
    let model = buildShipPanelModel(v, env);
    // Konfigurator z celem, który zniknął — dzisiejsza reguła panelu T3 (`_drawMissionConfirm`): konfigurator zdjęty; panel
    // w tej klatce już bez konfiguratora (model od nowa).
    if (model?.config?.missingTarget && fmo) { fmo._missionConfig = null; model = buildShipPanelModel(v, env); }
    if (!model) { this._prep = null; return null; }
    const S = SHIP_PANEL_HUD;
    const W = model.wide ? S.W_CONFIG : S.W;
    const inner = W - 2 * S.PAD_X;
    const sz = THEME.fontSizeSmall ?? 9;
    const nameSize = (THEME.fontSizeNormal ?? 11) - 1;
    const blocks = [];
    const text = (s, { role = 'primary', alpha = S.SUB_ALPHA, list = false, indent = 0 } = {}) => {
      for (const [i, part] of wrapText(s, inner - indent, (q) => this._textWidth(ctx, q, { size: sz })).entries()) {
        blocks.push({ k: 'text', ln: this._line(ctx, part, { size: sz }), role, alpha, list, indent: i > 0 ? indent : 0, h: sz + 3 });
      }
    };
    const gap = (h = S.SECTION_GAP, list = false) => blocks.push({ k: 'gap', h, list });
    const bar = (pct, list = false) => blocks.push({ k: 'bar', pct, list, h: S.BAR_H + 2 });
    const chipW = (label) => this._textWidth(ctx, `[ ${label} ]`, { size: sz });
    const chipRows = (items, { list = false } = {}) => {
      if (!items.length) return;
      const avail = inner - this._textWidth(ctx, '[  ]', { size: sz });
      const fitted = items.map((c) => {
        const lbl = chipW(c.label) > inner ? truncateText(c.label, avail, (q) => this._textWidth(ctx, q, { size: sz })) : c.label;
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
    const m = model;
    // Nagłówek
    blocks.push({ k: 'link', ln: this._line(ctx, m.back.label, { size: sz }), zone: m.back.zone, id: 'back_to_shipyard', h: sz + 3 });
    const penW = this._textWidth(ctx, '✎', { size: nameSize });
    const nameTxt = m.name.glyph ? `${m.name.glyph} ${m.name.text}` : m.name.text;
    const nw = wrapName(nameTxt, inner - penW - S.RENAME_GAP, (q) => this._textWidth(ctx, q, { size: nameSize, bold: true }));
    blocks.push({ k: 'name', lines: nw.lines.map((s) => this._line(ctx, s, { size: nameSize, bold: true })), clipped: nw.clipped,
      pen: this._line(ctx, '✎', { size: nameSize }), zone: m.name.rename, h: nw.lines.length * (nameSize + 3) + (nw.lines.length - 1) * S.LINE_GAP });
    if (m.sub) text(m.sub);
    blocks.push({ k: 'status', dot: this._line(ctx, '●', { size: sz }), role: m.status.dotRole,
      lines: wrapText(m.status.text, inner - this._textWidth(ctx, '● ', { size: sz }), (q) => this._textWidth(ctx, q, { size: sz })).map((s) => this._line(ctx, s, { size: sz })),
      get h() { return this.lines.length * (sz + 3); } });
    for (const ln of m.info) { text(ln.text, { role: ln.role ?? 'primary', alpha: ln.role === 'alert' ? 1 : S.SUB_ALPHA }); if (ln.bar != null) bar(ln.bar); }
    // Moduły
    gap();
    blocks.push({ k: 'eyebrow', ln: this._line(ctx, m.modules.header, { size: sz, spacing: S.EYEBROW_SPACING }), h: sz + 3 });
    if (m.modules.empty) text(m.modules.empty, { alpha: S.SUB_ALPHA * 0.8 });
    for (const it of m.modules.items) text(it.text, { role: it.unknown ? 'alert' : 'primary', indent: this._textWidth(ctx, '▪ ', { size: sz }) });
    // Ładunek
    if (m.cargo) {
      gap();
      if (m.cargo.zone) chipRows([{ id: 'cargo_load', label: m.cargo.text, enabled: true, zone: m.cargo.zone }]);
      else text(m.cargo.text);
      bar(m.cargo.pct);
    }
    // Konfigurator misji
    if (m.config?.step === 'select') {
      gap();
      blocks.push({ k: 'eyebrow', ln: this._line(ctx, m.config.header, { size: sz, spacing: S.EYEBROW_SPACING }), h: sz + 3 });
      for (const h of m.config.hints) text(h, { alpha: S.SUB_ALPHA * 0.85 });
      gap(2);
      for (const r of m.config.rows) {
        if (r.kind === 'group') { text(r.text, { list: true }); continue; }
        blocks.push({ k: 'target', id: r.id, zone: r.zone, enabled: r.enabled, list: true, h: sz + 3 + 4,
          ln: this._line(ctx, truncateText(r.text, inner * 0.55, (q) => this._textWidth(ctx, q, { size: sz })), { size: sz }),
          right: this._line(ctx, r.right, { size: sz }) });
      }
      gap(3);
      chipRows(m.config.chips);
    } else if (m.config?.step === 'confirm') {
      gap();
      blocks.push({ k: 'eyebrow', ln: this._line(ctx, m.config.header, { size: sz, spacing: S.EYEBROW_SPACING }), h: sz + 3 });
      text(m.config.target, { alpha: 1 });
      chipRows(m.config.chips);
      for (const ln of m.config.lines.filter((l) => !l.tail)) text(ln.text);
      gap(3);
      chipRows(m.config.tail);
      for (const ln of m.config.lines.filter((l) => l.tail)) text(ln.text, { alpha: S.SUB_ALPHA * 0.85 });
    }
    // Akcje główne
    if (m.chips.length) { gap(); chipRows(m.chips); }
    // Rozkazy misji (akordeon)
    if (m.orders) {
      const open = ordersOpen(this._open, m.vesselId) && m.orders.items.length > 0;
      gap();
      chipRows([{ id: 'orders', local: 'orders', label: `${t('shipPanelHud.orders')} ${open ? '▲' : '▼'}`, enabled: m.orders.items.length > 0, zone: null }]);
      if (open) {
        gap(2, true);
        chipRows(m.orders.items, { list: true });
        if (m.orders.reasons.length) gap(2, true);
        for (const r of m.orders.reasons) text(`⚠ ${r}`, { role: 'alert', alpha: 1, list: true });
      }
    }
    // Wysokości i lista przewijana (kolejne bloki `list`).
    let total = 2 * S.PAD_Y;
    for (const b of blocks) total += b.h;
    const li = blocks.findIndex((b) => b.list), lj = blocks.length - 1 - [...blocks].reverse().findIndex((b) => b.list);
    let list = null;
    if (li >= 0) {
      let before = S.PAD_Y; for (let i = 0; i < li; i++) before += blocks[i].h;
      let contentH = 0; for (let i = li; i <= lj; i++) contentH += blocks[i].h;
      const over = Math.max(0, total - maxH);
      const viewH = over > 0 ? Math.max(Math.min(contentH, S.LIST_MIN_H), contentH - over) : contentH;
      list = { from: li, to: lj, top: before, contentH, viewH };
      total = total - contentH + viewH;
    }
    // Klucz listy: statek + lista otwarta / krok konfiguratora — zmiana zeruje przewinięcie.
    const sk = `${m.vesselId}|${m.config?.step ?? ''}|${fmo?._missionConfig?.actionId ?? ''}|${ordersOpen(this._open, m.vesselId) ? 'o' : ''}`;
    if (sk !== this._scrollKey) { this._scrollKey = sk; this._scroll = 0; }
    this._maxScroll = list ? Math.max(0, list.contentH - list.viewH) : 0;
    this._scroll = Math.max(0, Math.min(this._maxScroll, this._scroll));
    const h = Math.round(Math.min(Math.max(total, 24), Math.max(24, maxH)));
    this._prep = { w: W, h, model, blocks, list, inner };
    return { w: W, h };
  }

  // ── Rysunek ──────────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * Rysunek w prostokącie `rect` (z `UIManager._shipPanelAtOutliner` — geometria T3); strefy kliku tej klatki.
   * @param {object} ctx
   * @param {{x:number, y:number, w:number, h:number}} rect
   * @param {{ pointer?:{x:number,y:number}|null, roles?:object }} [o]
   */
  draw(ctx, rect, { pointer = null, roles = null } = {}) {
    const P = this._prep;
    if (!P || !rect) { this.clear(); return; }
    this.stats.draws++;
    const S = SHIP_PANEL_HUD;
    const R = roles ?? resolveHudRoles(THEME);
    const sz = THEME.fontSizeSmall ?? 9;
    const x0 = rect.x, y0 = rect.y, w = rect.w, h = rect.h;
    const zones = [];
    const px = pointer?.x, py = pointer?.y;
    const over = (z) => Number.isFinite(px) && Number.isFinite(py) && px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h;
    ctx.save();
    // Pasek — ciemny, półprzezroczysty, bez ramki (jak przypięta etykieta HUD).
    ctx.globalAlpha = S.BAR_ALPHA;
    ctx.fillStyle = THEME.bgPrimary;
    ctx.fillRect(x0, y0, w, h);
    ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
    const L = P.list;
    let y = y0 + S.PAD_Y;
    const xl = x0 + S.PAD_X;
    const chipZone = (c, cx, cy, ch) => ({ kind: 'chip', id: c.id, zone: c.zone ?? null, local: c.local ?? null, enabled: c.enabled !== false,
      x: cx - S.CHIP_HIT_PAD_X, y: cy, w: c.w + 2 * S.CHIP_HIT_PAD_X, h: ch });
    const drawChipRow = (b, by, inList, clipTop, clipBot) => {
      for (const c of b.row) {
        const z = chipZone(c, xl + c.x, by, b.h);
        const visible = !inList || (z.y >= clipTop - 0.5 && z.y + z.h <= clipBot + 0.5);
        const hot = c.enabled && visible && over(z);
        if (hot) { ctx.globalAlpha = S.CHIP_HOVER_FILL; ctx.fillStyle = R.primary; ctx.fillRect(z.x, z.y, z.w, z.h); }
        this._drawLine(ctx, c.ln, xl + c.x, by + S.CHIP_PAD_Y + c.ln.size, c.enabled ? R.primary : R.dim, c.enabled ? (hot ? 1 : S.CHIP_ALPHA) : S.CHIP_ALPHA);
        if (visible && (c.enabled || c.local)) zones.push(z);
      }
    };
    const drawBlock = (b, by, inList, clipTop, clipBot) => {
      switch (b.k) {
        case 'gap': break;
        case 'text':
          this._drawLine(ctx, b.ln, xl + (b.indent ?? 0), by + b.ln.size, R[b.role] ?? R.primary, b.alpha);
          break;
        case 'link': {
          const z = { kind: 'chip', id: b.id, zone: b.zone, enabled: true, x: xl - S.CHIP_HIT_PAD_X, y: by, w: b.ln.w + 2 * S.CHIP_HIT_PAD_X, h: b.h };
          const hot = over(z);
          if (hot) { ctx.globalAlpha = S.CHIP_HOVER_FILL; ctx.fillStyle = R.primary; ctx.fillRect(z.x, z.y, z.w, z.h); }
          this._drawLine(ctx, b.ln, xl, by + b.ln.size, R.primary, hot ? 1 : S.SUB_ALPHA);
          zones.push(z);
          break;
        }
        case 'name': {
          let ly = by, maxW = 0;
          b.lines.forEach((ln, i) => { if (i > 0) ly += S.LINE_GAP; this._drawLine(ctx, ln, xl, ly + ln.size, R.primary, 1); maxW = Math.max(maxW, ln.w); ly += ln.h; });
          const last = b.lines[b.lines.length - 1];
          const lastY = by + b.h - last.h;
          zones.push({ kind: 'name', id: 'name', x: xl, y: by, w: maxW, h: b.h });
          const pz = { kind: 'chip', id: 'rename', zone: b.zone, enabled: true, x: xl + last.w + S.RENAME_GAP - S.CHIP_HIT_PAD_X, y: lastY, w: b.pen.w + 2 * S.CHIP_HIT_PAD_X, h: last.h };
          const hot = over(pz);
          if (hot) { ctx.globalAlpha = S.CHIP_HOVER_FILL; ctx.fillStyle = R.primary; ctx.fillRect(pz.x, pz.y, pz.w, pz.h); }
          this._drawLine(ctx, b.pen, xl + last.w + S.RENAME_GAP, lastY + last.size, R.primary, hot ? 1 : S.CHIP_ALPHA);
          zones.push(pz);
          break;
        }
        case 'status': {
          this._drawLine(ctx, b.dot, xl, by + b.dot.size, R[b.role] ?? R.primary, 1);
          const dx = b.dot.w + 4;
          b.lines.forEach((ln, i) => this._drawLine(ctx, ln, xl + dx, by + i * (sz + 3) + ln.size, R.primary, S.SUB_ALPHA));
          break;
        }
        case 'eyebrow':
          this._drawLine(ctx, b.ln, xl, by + b.ln.size, R.primary, S.EYEBROW_ALPHA);
          break;
        case 'bar': {
          const bw = P.inner;
          ctx.globalAlpha = S.BAR_TRACK_ALPHA; ctx.fillStyle = R.dim; ctx.fillRect(xl, by + 1, bw, S.BAR_H);
          ctx.globalAlpha = 1; ctx.fillStyle = R.primary; ctx.fillRect(xl, by + 1, Math.round(bw * Math.max(0, Math.min(1, b.pct ?? 0))), S.BAR_H);
          break;
        }
        case 'chips':
          drawChipRow(b, by, inList, clipTop, clipBot);
          break;
        case 'target': {
          const z = { kind: 'chip', id: b.id, zone: b.zone, enabled: b.enabled, x: x0 + 1, y: by, w: w - 2, h: b.h };
          const visible = !inList || (z.y >= clipTop - 0.5 && z.y + z.h <= clipBot + 0.5);
          const hot = b.enabled && visible && over(z);
          if (hot) { ctx.globalAlpha = S.CHIP_HOVER_FILL; ctx.fillStyle = R.primary; ctx.fillRect(z.x, z.y, z.w, z.h); }
          const col = b.enabled ? R.primary : R.dim;
          this._drawLine(ctx, b.ln, xl, by + 2 + b.ln.size, col, b.enabled ? (hot ? 1 : S.CHIP_ALPHA) : S.CHIP_ALPHA);
          this._drawLine(ctx, b.right, x0 + w - S.PAD_X - b.right.w, by + 2 + b.right.size, col, b.enabled ? S.SUB_ALPHA : S.CHIP_ALPHA);
          if (visible && b.enabled) zones.push(z);
          break;
        }
        default: break;
      }
    };
    for (let i = 0; i < P.blocks.length; i++) {
      const b = P.blocks[i];
      if (L && i === L.from) {
        // Lista przewijana: okno `viewH`, przycięcie rysunku i stref do okna.
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
    // Reszta panelu — klik pochłonięty (nie idzie do mapy): ostatnia strefa, najniższy priorytet (`shipPanelHitAt`).
    zones.push({ kind: 'body', id: 'body', x: x0, y: y0, w, h });
    this._zones = zones;
    this.rect = { x: x0, y: y0, w, h };
  }

  // ── Wejście ──────────────────────────────────────────────────────────────────────────────────────────────────────
  _inside(x, y) { const r = this.rect; return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

  /** Chip pod punktem (kursor „rączki”) — tylko aktywny; `null` — brak. */
  chipAt(x, y) {
    if (!this._inside(x, y)) return null;
    const z = shipPanelHitAt(this._zones, x, y);
    return z?.kind === 'chip' && z.enabled !== false ? z.id : null;
  }

  /**
   * Klik w panel (px logiczne). Każdy klik w prostokącie jest POCHŁONIĘTY (`true`) — jak panel T3 (③): chip → dzisiejszy
   * handler; „[ Rozkazy ▼ ]” → akordeon; linia nazwy → reguła D-UI-5; reszta — nic.
   * @param {{ K?:object, fmo?:object, emit?:Function }} env
   * @returns {boolean}
   */
  handleClick(x, y, { K = null, fmo = null, emit = null } = {}) {
    if (!this._inside(x, y)) return false;
    // Okno DOM na wierzchu (zmiana nazwy, ładunek, potwierdzenie) — klik pochłonięty bez akcji (lustro dawnego `handleVesselPanelClick`).
    if (typeof document !== 'undefined' && document.querySelector?.('.mission-modal-overlay, .kosmos-modal-overlay')) return true;
    const z = shipPanelHitAt(this._zones, x, y);
    if (!z) return true;
    const vid = this._prep?.model?.vesselId ?? null;
    if (z.kind === 'chip') {
      if (z.local === 'orders') { if (z.enabled !== false && vid != null) this._open = toggleOrders(this._open, vid); return true; }
      if (z.zone && z.enabled !== false) runShipPanelAction(z.zone, { fmo, x, y });
      return true;
    }
    if (z.kind === 'name' && vid != null) {
      const v = K?.vesselManager?.getVessel?.(vid) ?? null;
      if (v) clickObject(vesselTarget(vid, v), { K, emit: emit ?? ((n, p) => EventBus.emit(n, p)) });
    }
    return true;
  }

  /** Kółko nad panelem: przewija listę (gdy jest co), zawsze pochłonięte (nie zoomuje mapy pod panelem). */
  handleWheel(x, y, delta) {
    if (!this._inside(x, y)) return false;
    if (this._maxScroll > 0) this._scroll = Math.max(0, Math.min(this._maxScroll, this._scroll + delta * SHIP_PANEL_HUD.SCROLL_STEP));
    return true;
  }

  /** Odczyt dla bramki i keepera: prostokąt, strefy (typ, id, aktywny), lista, akordeon. */
  debug() {
    const r1 = (v) => (Number.isFinite(v) ? +v.toFixed(1) : v);
    const P = this._prep;
    return {
      rect: this.rect ? { x: r1(this.rect.x), y: r1(this.rect.y), w: r1(this.rect.w), h: r1(this.rect.h) } : null,
      vesselId: P?.model?.vesselId ?? null, wide: !!P?.model?.wide, step: P?.model?.config?.step ?? null,
      ordersOpen: P?.model ? ordersOpen(this._open, P.model.vesselId) : false,
      scroll: r1(this._scroll), maxScroll: r1(this._maxScroll),
      zones: this._zones.map((z) => ({ kind: z.kind, id: z.id, type: z.zone?.type ?? null, enabled: z.enabled !== false,
        x: r1(z.x), y: r1(z.y), w: r1(z.w), h: r1(z.h) })),
      chips: (P?.model?.chips ?? []).map((c) => ({ id: c.id, label: c.label, enabled: c.enabled })),
      orders: (P?.model?.orders?.items ?? []).map((c) => ({ id: c.id, label: c.label, enabled: c.enabled })),
      modelZones: P?.model ? modelZones(P.model).map((z) => z.type) : [],
    };
  }
}
