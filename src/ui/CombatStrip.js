// CombatStrip — ARC COMBAT VISUALS, krok CV-6b2 (COMBAT_VISUALS_PLAN.md §3.2-16, §4 CV-6b2): PASEK WALKI w idiomie HUD (flaga
// `cvStrip`) zamiast karty walki `CombatHUD`. Logika — czysty `CombatStripLogic` (bitwy = klastry starć, mgła wojny, układ
// w obszarze mapy, ładunek „Obserwuj”, log); tu — pomiar tekstu, rysunek na `#ui-canvas` i strefy kliku. Spięcie z hostem
// (kolejność rysunku i kliku, kółko, kursor, Esc, blokada kamery) — `UIManager`.
//   • wygląd jak panel statku T5 / panele floty T6: ciemny półprzezroczysty pasek bez ramki (`THEME.bgPrimary` × `BAR_ALPHA`),
//     font motywu, kolory WYŁĄCZNIE z ról (`HudPalette.resolveHudRoles`: `primary` — strona gracza, `alert` — wróg, `dim` —
//     tor pasków i przygaszone), cyfry w stałej kratce (font proporcjonalny — cyfra po cyfrze, liczby nie skaczą);
//   • zwinięty: linia na bitwę (kolumny wyrównane w bloku), „+N” ponad `MAX_LINES`; rozwinięty — jedna bitwa naraz, pod
//     blokiem (krawędź 'top') albo nad nim ('bottom'), przewijany kółkiem, gdy dłuższy niż miejsce; ▲ / Esc zwija;
//   • każdy klik w prostokącie paska jest POCHŁONIĘTY (nie idzie do mapy ani overlayu pod spodem); „Obserwuj” — dzisiejszy
//     ładunek `camera:watchBattle`; najechanie na przycięty tekst albo chip — podpowiedź (w tym samym idiomie).
// ⚠ Moduł importuje się pod node (keeper `cv_strip_smoke` — atrapa ctx): bez three i bez DOM.
import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { THEME } from '../config/ThemeConfig.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { HULLS } from '../data/HullsData.js';
import { SHIP_MODULES } from '../data/ShipModulesData.js';
import { t, getName } from '../i18n/i18n.js';
import { resolveHudRoles } from './HudPalette.js';
import { layoutTabular, truncateText } from './HudLabelLogic.js';
import { systemDisplayName } from './MapLabelLogic.js';
import { clusterRadiusPx } from './BattleClusterLogic.js';
import {
  COMBAT_STRIP, stripBattles, stripLayout, stripDetailHeight, stripLog, stripWatchPayload, stripHitAt,
  tuneCombatStrip, resetCombatStrip,
} from './CombatStripLogic.js';

const MEASURE_CACHE_MAX = 800;

export class CombatStrip {
  constructor() {
    this.rect = null;            // prostokąt paska z ostatniej klatki (px logiczne, z `edge`); `null` — paska nie było
    this._zones = [];            // strefy kliku: { kind: 'watch'|'toggle'|'more'|'detail'|'body', id?, payload?, x, y, w, h }
    this._hints = [];            // strefy podpowiedzi: { x, y, w, h, text }
    this._expanded = null;       // rozwinięta bitwa (jedna naraz): { id, enc: Set<id starcia>, ves: Set<id okrętu> } albo null
    this._scroll = 0;            // przewinięcie rozwinięcia — px
    this._maxScroll = 0;
    this._detail = null;         // prostokąt rozwinięcia z ostatniej klatki
    this._rows = [];             // bitwy z ostatniej klatki (odczyt dla bramki)
    this._rowsById = new Map();  // bitwy widocznych linii z ostatniej klatki — klik ▼ rozwija TĘ bitwę
    this._holes = [];            // prostokąty HUD nad paskiem z ostatniej klatki (`HudLayer.uiPassThroughRects`, G5-C)
    this._pointer = null;        // kursor (px logiczne) — podświetlenie chipów i podpowiedź
    this._measure = new Map();   // `font|tekst` → szerokość
    this._lineCache = new Map(); // `font|odstęp|tekst` → linia (układ z kratką cyfr)
    this._fontStatus = null;
    this.stats = { draws: 0, measures: 0 };
  }

  /** Brak paska w tej klatce — bez prostokąta i stref (klik, kółko, kursor, przeszkody, kadr „Obserwuj”). */
  clear() { this.rect = null; this._zones = []; this._hints = []; this._detail = null; this._rows = []; }

  /** Prostokąt paska z ostatniej klatki (px logiczne) z krawędzią (`edge`: 'top' | 'bottom') albo `null`. */
  getPanelRect() { return this.rect ? { ...this.rect } : null; }

  /** Kursor nad paskiem (blokada kamery i najechania mapy — `UIManager.isOverUI`). */
  isOver(x, y) {
    const r = this.rect;
    if (!r || x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) return false;
    // G5-C (parytet z kartą) — prostokąt HUD nad paskiem (otwarty picker skoku) jest z paska wycięty: tam klik należy do HUD.
    return !this._holes.some((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
  }

  /** Rozwinięta bitwa (id klastra) albo null. */
  get expandedId() { return this._expanded?.id ?? null; }

  /** Klucz rozwinięcia bitwy: id klastra, jego starcia i okręty — rozwinięcie idzie za bitwą, gdy zmienia się id klastra. */
  _expandKey(row) {
    return { id: row.id, enc: new Set(row.encounterIds), ves: new Set([...row.own.ships, ...row.enemy.ships].map((q) => q.id)) };
  }

  /**
   * Bitwa rozwinięta w tej klatce: to samo id klastra, inaczej ta, która dzieli z rozwiniętą starcie (najmniejsze starcie
   * klastra się skończyło, reszta trwa), inaczej okręt (dobicie ocalałych — nowe starcie tych samych okrętów); brak — null.
   */
  _followExpanded(rows) {
    const k = this._expanded;
    if (!k) return null;
    return rows.find((r) => r.id === k.id)
      ?? rows.find((r) => r.encounterIds.some((e) => k.enc.has(e)))
      ?? rows.find((r) => [...r.own.ships, ...r.enemy.ships].some((q) => k.ves.has(q.id)))
      ?? null;
  }

  /** Zwiń rozwinięcie (▲ / Esc). Zwraca true, gdy było co zwinąć. */
  collapse() {
    if (this._expanded == null) return false;
    this._expanded = null; this._scroll = 0;
    return true;
  }

  /** Strojenie stałych z konsoli (bramka): `KOSMOS.combatStrip.tune({ EDGE: 'bottom' })`; `tune(null)` — wartości domyślne. */
  tune(patch) {
    const r = patch == null ? resetCombatStrip() : tuneCombatStrip(patch);
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
    const lay = layoutTabular(String(text ?? ''), { measure: (s) => this._width(ctx, font, size, s), cell, spacing });
    // Cyfry równej szerokości — linia jednym `fillText`; font proporcjonalny — cyfra po cyfrze w kratce (jak panel statku T5).
    const segs = (hi - lo < 0.01) ? [{ s: String(text ?? ''), x: 0, w: lay.w, digit: false }] : lay.segs;
    const ln = { text: String(text ?? ''), font, size, spacing, cell, w: lay.w, segs };
    if (this._lineCache.size > MEASURE_CACHE_MAX) this._lineCache.clear();
    this._lineCache.set(key, ln);
    return ln;
  }

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

  _fit(ctx, text, maxW, opts) {
    const s = String(text ?? '');
    if (this._line(ctx, s, opts).w <= maxW) return { s, cut: false };
    const cutS = truncateText(s, Math.max(0, maxW), (q) => this._line(ctx, q, opts).w);
    return { s: cutS, cut: true };
  }

  // ── Świat → bitwy ────────────────────────────────────────────────────────────────────────────────────────────────
  _systemName(sysId, K) {
    if (!sysId) return '—';
    return systemDisplayName(sysId, {
      systems:  K?.starSystemManager?.getAllSystems?.() ?? [],
      starName: (sid) => EntityManager.getByTypeInSystem?.('star', sid)?.[0]?.name ?? null,
    });
  }

  _battles(K) {
    // ARC CV-8a — także starcia wirtualne powtórek bitew orbitalnych (wiersz bitwy przy planecie, póki trwa powtórka)
    const orb = K?.threeRenderer?.cvOrbital?.encounters?.() ?? [];
    const dscsList = K?.deepSpaceCombatSystem?.listActive?.() ?? [];
    const encs = orb.length ? dscsList.concat(orb) : dscsList;
    // ARC CV-8b (§3.1-6, D-CV-27 (a)) — wiersz WYNIKU bitwy orbitalnej po końcu powtórki (stan końcowy, słowo wyniku zamiast „R n”)
    const ended = K?.threeRenderer?.cvOrbital?.endedEncounters?.() ?? [];
    if (!encs.length && !ended.length) return [];
    const env = this._stripEnv(K);
    const rows = encs.length ? stripBattles(encs, env) : [];
    for (const x of ended) {
      const r = stripBattles([{ ...x.venc, isActive: true }], env)[0];
      if (r) rows.push({ ...r, result: x.outcome });
    }
    return rows;
  }

  _stripEnv(K) {
    const vm = K.vesselManager;
    const vessel = (id) => vm?.getVessel?.(id) ?? vm?._vessels?.get?.(id) ?? null;
    return {
      getPos: (id) => vessel(id)?.position ?? null,
      radius: clusterRadiusPx(GAME_CONFIG.AU_TO_PX),
      activeSystemId: K.activeSystemId ?? null,
      quality: (id) => K.intelSystem?.getVesselContact?.(id)?.quality ?? 'unknown',
      labelFor: (owner) => (owner === 'player' ? t('battle.player')
        : (K.empireRegistry?.get?.(owner)?.name ?? t('battle.unknownForce'))),
      nameOf: (id) => { const v = vessel(id); return v?.name ?? v?.shipId ?? id; },
      // ARC CV-4a (Finding 614) — HP / osłona pokazywane z rejestru salw renderera (spadają w chwili trafienia)
      presented: K.threeRenderer?.cvPresentedState
        ? (id, st) => K.threeRenderer.cvPresentedState(id, st) : null,
      classOf: (id) => {
        const v = vessel(id); const hullId = v?.hullId ?? v?.shipId ?? '';
        const hull = HULLS?.[hullId];
        return hull ? getName(hull, 'ship') : (hullId ? String(hullId).replace(/^hull_/, '') : null);
      },
    };
  }

  // ── Rysunek ──────────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * Pasek bitew z tej klatki. Brak aktywnych starć — nic (bez prostokąta i stref).
   * @param {object} ctx
   * @param {number} W @param {number} H — wymiary logiczne UI
   * @param {{ K?:object, insets:{left:number,right:number,top:number,bottom:number}, pointer?:{x:number,y:number}|null,
   *           banner?:{x:number,y:number,w:number,h:number}|null, roles?:object }} o
   */
  draw(ctx, W, H, { K = (typeof window !== 'undefined' ? window.KOSMOS : null), insets, pointer = null, banner = null, roles = null } = {}) {
    const fontStatus = (typeof document !== 'undefined' && document.fonts?.status) || 'loaded';
    if (fontStatus !== this._fontStatus) { this._fontStatus = fontStatus; this._measure.clear(); this._lineCache.clear(); }
    this._holes = K?.hudLayer?.uiPassThroughRects?.() ?? [];
    const rows = this._battles(K);
    if (!rows.length) { this.clear(); this._rowsById = new Map(); if (this._expanded != null) this.collapse(); return; }
    this.stats.draws++;
    const S = COMBAT_STRIP;
    const R = roles ?? resolveHudRoles(THEME);
    const sz = THEME.fontSizeSmall ?? 9;
    const txt = { size: sz };
    const visible = rows.slice(0, Math.max(1, Math.floor(S.MAX_LINES) || 1));
    const overflow = rows.length - visible.length;
    // Rozwinięcie idzie za bitwą (zmiana id klastra, dobicie ocalałych); bitwa poza widocznymi liniami albo skończona — zwija się.
    const followed = this._followExpanded(visible);
    if (this._expanded && !followed) this.collapse();
    else if (followed) this._expanded = this._expandKey(followed);
    this._rowsById = new Map(visible.map((r) => [r.id, r]));
    this._pointer = pointer;

    // Kolumny linii — szerokości wspólne dla bloku (liczby wyrównane między bitwami).
    const lineOf = (r) => {
      const pct = (s) => (s.total > 0 ? `${Math.round(s.pct * 100)}%` : '');
      const counts = (s) => (s.hidden > 0 ? '?' : `${s.alive}/${s.total}`);
      // ARC CV-8a — wiersz bitwy orbitalnej: miejsce = ciało (nazwa planety), nie sam układ
      const orbBody = r.encounters?.[0]?.orbital ? (EntityManager.get?.(r.encounters[0].location?.planetId)?.name ?? null) : null;
      return {
        loc: orbBody ?? this._systemName(r.systemId, K),
        own: { counts: counts(r.own), pct: r.own.hidden > 0 ? '' : pct(r.own), role: r.own.role, hidden: r.own.hidden > 0, frac: r.own.pct },
        foe: { counts: counts(r.enemy), pct: r.enemy.hidden > 0 ? '' : pct(r.enemy), role: r.enemy.role, hidden: r.enemy.hidden > 0, frac: r.enemy.pct },
        // M1 — bez limitu rund: „R n”; ARC CV-8b — wiersz wyniku po powtórce: słowo wyniku (Zwycięstwo / Porażka / Remis / Pat)
        round: r.result ? t(`combatStrip.result.${r.result}`) : t('combatStrip.round', r.round),
        result: r.result ?? null,
      };
    };
    const lines = visible.map((r) => ({ row: r, ...lineOf(r) }));
    const wOf = (s) => this._line(ctx, s, txt).w;
    const glyphW = wOf('⚔ ');
    const locNat = Math.max(...lines.map((l) => wOf(l.loc)));
    const cntW = Math.max(wOf('10/10'), ...lines.flatMap((l) => [wOf(l.own.counts), wOf(l.foe.counts)]));
    const pctW = wOf('100%');
    const roundW = Math.max(...lines.map((l) => wOf(l.round)));
    const watchLabel = `[ ${t('combat.watchBattle')} ]`;
    const watchW = wOf(watchLabel);
    // ARC CV-7 — chip kamery reżysera na liniach bitew w oglądanym układzie: „[ Reżyser ]” (wyłączony albo gotowy),
    // „[ ● Reżyser ]” (prowadzi tę bitwę), „[ Reżyser (wstrzymany) ]” (gracz przejął kamerę). Bez flagi — bez chipa (szerokość jak dziś).
    const dirOn = !!K?.threeRenderer?.cvDirector;
    const dirLabels = dirOn ? { off: `[ ${t('combatStrip.director')} ]`, on: `[ ● ${t('combatStrip.director')} ]`,
      paused: `[ ${t('combatStrip.directorPaused')} ]` } : null;
    const dirW = dirOn ? Math.max(wOf(dirLabels.off), wOf(dirLabels.on), wOf(dirLabels.paused)) + S.CHIP_GAP : 0;
    const togW = Math.max(wOf('[ ▼ ]'), wOf('[ ▲ ]'));   // glify jak „[ Rozkazy ▼ ]” panelu statku T5
    const sideW = cntW + 4 + S.BAR_W + 4 + pctW;
    const fixedW = 2 * S.PAD_X + glyphW + S.FIELD_GAP + sideW + S.FIELD_GAP + sideW + S.FIELD_GAP + roundW + S.FIELD_GAP + watchW + S.CHIP_GAP + togW + dirW;
    const locW0 = Math.min(locNat, S.LOC_MAX_W);

    // Rozwinięcie (bitwa widoczna w bloku): treść i wysokość.
    const exp = followed ?? null;
    const log = exp ? stripLog(exp, {
      nameOf: (id) => [...exp.own.ships, ...exp.enemy.ships].find((s) => s.id === id)?.name ?? id,
      weaponOf: (m) => { const mod = SHIP_MODULES?.[m]; return mod ? getName(mod) : String(m ?? '').replace(/^weapon_/, ''); },
      roundLabel: (n) => t('combatStrip.logRound', n), miss: t('combatStrip.miss'), shield: t('combatStrip.shield'),
      // ARC CV-4a — linia zdarzenia dopiero po jego trafieniu w prezentacji (rejestr salw renderera)
      shown: K?.threeRenderer?.cvEventShown
        ? (encId, round, j) => K.threeRenderer.cvEventShown(encId, round, j) : null,
    }) : [];
    const detailH = exp ? stripDetailHeight({ ownN: exp.own.ships.length, enemyN: exp.enemy.ships.length, logN: log.length }) : 0;
    const L = stripLayout({ W, H, insets, lines: visible.length, overflow: overflow > 0, naturalW: fixedW + locW0, detailH, banner });
    const w = L.block.w;
    const locW = Math.max(0, Math.min(locW0, w - fixedW));

    const zones = [], hints = [];
    const px = pointer?.x, py = pointer?.y;
    ctx.save();
    if (this._holes.length) {   // G5-C — otwarty picker HUD widać przez pasek (`#hud-canvas` leży pod `#ui-canvas`)
      ctx.beginPath(); ctx.rect(0, 0, W, H);
      for (const h of this._holes) ctx.rect(h.x, h.y, h.w, h.h);
      ctx.clip('evenodd');
    }
    const over = (z) => Number.isFinite(px) && Number.isFinite(py) && px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h;
    ctx.save();
    // Blok linii — ciemny pasek bez ramki.
    ctx.globalAlpha = S.BAR_ALPHA;
    ctx.fillStyle = THEME.bgPrimary ?? '#000';
    ctx.fillRect(L.block.x, L.block.y, L.block.w, L.block.h);
    const base = (ly) => ly + Math.round((S.LINE_H + sz) / 2) - 1;
    const bar = (bx, by, frac, role, hidden) => {
      ctx.globalAlpha = S.BAR_TRACK_ALPHA; ctx.fillStyle = R.dim; ctx.fillRect(bx, by, S.BAR_W, S.BAR_H);
      if (hidden) return;
      ctx.globalAlpha = 1; ctx.fillStyle = R[role] ?? R.primary;
      ctx.fillRect(bx, by, Math.round(S.BAR_W * Math.max(0, Math.min(1, frac ?? 0))), S.BAR_H);
    };
    const chip = (label, cx, cy, ch, zone, hint) => {
      const ln = this._line(ctx, label, txt);
      const z = { ...zone, x: cx - S.CHIP_HIT_PAD_X, y: cy, w: ln.w + 2 * S.CHIP_HIT_PAD_X, h: ch };
      const hot = over(z);
      if (hot) { ctx.globalAlpha = S.CHIP_HOVER_FILL; ctx.fillStyle = R.primary; ctx.fillRect(z.x, z.y, z.w, z.h); }
      this._drawLine(ctx, ln, cx, base(cy), R.primary, hot ? 1 : S.CHIP_ALPHA);
      zones.push(z);
      if (hint) hints.push({ x: z.x, y: z.y, w: z.w, h: z.h, text: hint });
    };
    lines.forEach((l, i) => {
      const lr = L.lines[i];
      const by = base(lr.y);
      let cx = lr.x + S.PAD_X;
      this._drawLine(ctx, this._line(ctx, '⚔', txt), cx, by, R.alert, 1);
      cx += glyphW;
      const lf = this._fit(ctx, l.loc, locW, txt);
      this._drawLine(ctx, this._line(ctx, lf.s, txt), cx, by, R.primary, S.SUB_ALPHA);
      if (lf.cut) hints.push({ x: cx, y: lr.y, w: locW, h: lr.h, text: l.loc });
      cx += locW + S.FIELD_GAP;
      for (const sd of [l.own, l.foe]) {
        const cl = this._line(ctx, sd.counts, txt);
        this._drawLine(ctx, cl, cx + cntW - cl.w, by, R[sd.role] ?? R.primary, 1);
        cx += cntW + 4;
        bar(cx, lr.y + Math.round((S.LINE_H - S.BAR_H) / 2), sd.frac, sd.role, sd.hidden);
        cx += S.BAR_W + 4;
        if (sd.pct) this._drawLine(ctx, this._line(ctx, sd.pct, txt), cx, by, R[sd.role] ?? R.primary, S.SUB_ALPHA);
        cx += pctW + S.FIELD_GAP;
      }
      // ARC CV-8b — słowo wyniku w roli: porażka `alert`, zwycięstwo `primary` pełne, remis / pat jak „R n”
      const resRole = l.result === 'defeat' ? R.alert : R.primary;
      this._drawLine(ctx, this._line(ctx, l.round, txt), cx, by, resRole, l.result === 'victory' || l.result === 'defeat' ? 1 : S.DIM_ALPHA);
      // Chipy przy prawej krawędzi bloku.
      const tx = lr.x + lr.w - S.PAD_X - togW;
      const wx = tx - S.CHIP_GAP - watchW;
      const payload = stripWatchPayload(l.row);
      const chY = lr.y, chH = lr.h;
      if (payload) chip(watchLabel, wx, chY, chH, { kind: 'watch', id: l.row.id, payload }, t('combatStrip.watchHint'));
      if (dirOn && l.row.inView) {
        const c = K.threeRenderer.cvDirector.chipFor(l.row.id);
        const st = c.state === 'paused' && c.mine ? 'paused' : c.state !== 'off' && c.mine ? 'on' : 'off';
        const lbl = dirLabels[st];
        const hint = t(st === 'paused' ? 'combatStrip.directorPausedHint' : st === 'on' ? 'combatStrip.directorOnHint' : 'combatStrip.directorHint');
        chip(lbl, wx - S.CHIP_GAP - wOf(lbl), chY, chH, { kind: 'director', id: l.row.id }, hint);
      }
      const open = this._expanded?.id === l.row.id;
      chip(open ? '[ ▲ ]' : '[ ▼ ]', tx, chY, chH, { kind: 'toggle', id: l.row.id }, t(open ? 'combatStrip.collapse' : 'combatStrip.expand'));
    });
    if (L.more) {
      const ml = this._line(ctx, t('combatStrip.more', overflow), txt);
      this._drawLine(ctx, ml, L.more.x + S.PAD_X, L.more.y + L.more.h - 3, R.primary, S.DIM_ALPHA);
      zones.push({ kind: 'more', x: L.more.x, y: L.more.y, w: L.more.w, h: L.more.h });
    }
    // Rozwinięcie.
    this._detail = null;
    if (exp && L.detail) this._drawDetail(ctx, exp, log, L.detail, { R, sz, txt, zones, hints });
    ctx.restore();
    ctx.globalAlpha = 1;
    // Reszta prostokąta — klik pochłonięty (ostatnia strefa, najniższy priorytet).
    zones.push({ kind: 'body', x: L.block.x, y: L.block.y, w: L.block.w, h: L.block.h });
    this._zones = zones;
    this._hints = hints;
    this._rows = rows;
    this.rect = L.rect ? { ...L.rect } : null;
    this._drawTooltip(ctx, W, H, R);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  _drawDetail(ctx, row, log, D, { R, sz, txt, zones, hints }) {
    const S = COMBAT_STRIP;
    const h0 = hints.length;
    this._maxScroll = D.maxScroll;
    this._scroll = Math.max(0, Math.min(this._maxScroll, this._scroll));
    this._detail = { ...D };
    ctx.globalAlpha = S.BAR_ALPHA;
    ctx.fillStyle = THEME.bgPrimary ?? '#000';
    ctx.fillRect(D.x, D.y, D.w, D.h);
    ctx.save();
    ctx.beginPath(); ctx.rect(D.x, D.y, D.w, D.h); ctx.clip();
    const top = D.y, bot = D.y + D.h;
    const inView = (y0, h) => y0 + h >= top && y0 <= bot;
    const colW = Math.max(0, (D.w - 2 * S.PAD_X - S.COL_GAP) / 2);
    const xs = [D.x + S.PAD_X, D.x + S.PAD_X + colW + S.COL_GAP];
    const rh = S.DETAIL_ROW_H;
    const base = (y) => y + Math.round((rh + sz) / 2) - 1;
    let y = D.y + S.PAD_Y - this._scroll;
    // Nagłówki stron.
    const sides = [row.own, row.enemy];
    sides.forEach((sd, k) => {
      const hb = { size: sz, bold: true };
      const f = this._fit(ctx, sd.label, colW, hb);
      if (inView(y, rh)) this._drawLine(ctx, this._line(ctx, f.s, hb), xs[k], base(y), R[sd.role] ?? R.primary, 1);
      if (f.cut && inView(y, rh)) hints.push({ x: xs[k], y, w: colW, h: rh, text: sd.label });
    });
    y += rh;
    // Okręty: nazwa · klasa, pasek HP (+ tarcza) przy prawej krawędzi kolumny; zniszczony — przygaszony, „✕”.
    const n = Math.max(1, row.own.ships.length, row.enemy.ships.length);
    for (let i = 0; i < n; i++) {
      if (inView(y, rh)) {
        sides.forEach((sd, k) => {
          const s = sd.ships[i];
          if (!s) return;
          const role = R[sd.role] ?? R.primary;
          const label = !s.visible ? '?' : `${s.alive ? '' : '✕ '}${s.name}${s.cls ? ` · ${s.cls}` : ''}`;
          const tw = Math.max(0, colW - S.MICRO_BAR_W - 6);
          const f = this._fit(ctx, label, tw, txt);
          this._drawLine(ctx, this._line(ctx, f.s, txt), xs[k], base(y), s.alive ? role : R.dim, s.alive ? S.SUB_ALPHA : S.DEAD_ALPHA);
          if (f.cut) hints.push({ x: xs[k], y, w: tw, h: rh, text: label });
          if (!s.visible) return;
          const bx = xs[k] + colW - S.MICRO_BAR_W, byHp = y + Math.round(rh / 2) - S.MICRO_BAR_H;
          ctx.globalAlpha = S.BAR_TRACK_ALPHA; ctx.fillStyle = R.dim; ctx.fillRect(bx, byHp, S.MICRO_BAR_W, S.MICRO_BAR_H);
          const hpF = s.hpStart > 0 ? Math.max(0, Math.min(1, s.hp / s.hpStart)) : 0;
          ctx.globalAlpha = s.alive ? 1 : S.DEAD_ALPHA; ctx.fillStyle = s.alive ? role : R.dim;
          ctx.fillRect(bx, byHp, Math.round(S.MICRO_BAR_W * hpF), S.MICRO_BAR_H);
          if (s.shieldStart > 0) {
            const byS = byHp + S.MICRO_BAR_H + 1;
            const shF = Math.max(0, Math.min(1, s.shield / s.shieldStart));
            ctx.globalAlpha = S.BAR_TRACK_ALPHA; ctx.fillStyle = R.dim; ctx.fillRect(bx, byS, S.MICRO_BAR_W, 1);
            ctx.globalAlpha = s.alive ? S.SUB_ALPHA : S.DEAD_ALPHA; ctx.fillStyle = R.foreign ?? role;
            ctx.fillRect(bx, byS, Math.round(S.MICRO_BAR_W * shF), 1);
          }
        });
      }
      y += rh;
    }
    y += S.SECTION_GAP;
    // Log rund (najnowsze najpierw), kolor strony strzelca.
    const eb = { size: sz, spacing: S.EYEBROW_SPACING };
    if (inView(y, rh)) this._drawLine(ctx, this._line(ctx, t('combatStrip.log'), eb), xs[0], base(y), R.primary, S.EYEBROW_ALPHA);
    y += rh;
    const innerW = D.w - 2 * S.PAD_X;
    for (const ln of log) {
      if (inView(y, rh)) {
        const f = this._fit(ctx, ln.text, innerW, txt);
        const role = ln.side === 'own' ? (R[row.own.role] ?? R.primary) : (R[row.enemy.role] ?? R.alert);
        this._drawLine(ctx, this._line(ctx, f.s, txt), xs[0], base(y), role, S.SUB_ALPHA);
        if (f.cut) hints.push({ x: xs[0], y, w: innerW, h: rh, text: ln.text });
      }
      y += rh;
    }
    ctx.restore();
    if (this._maxScroll > 0) {
      const th = Math.max(10, D.h * (D.h / D.contentH));
      const ty = D.y + (D.h - th) * (this._scroll / this._maxScroll);
      ctx.globalAlpha = S.BAR_TRACK_ALPHA; ctx.fillStyle = R.dim; ctx.fillRect(D.x + D.w - S.SCROLLBAR_W - 1, D.y, S.SCROLLBAR_W, D.h);
      ctx.globalAlpha = 0.8; ctx.fillStyle = R.primary; ctx.fillRect(D.x + D.w - S.SCROLLBAR_W - 1, ty, S.SCROLLBAR_W, th);
    }
    // Podpowiedzi rozwinięcia przycięte do jego okna (wiersz częściowo przewinięty nie łapie kursora nad blokiem linii).
    for (let i = hints.length - 1; i >= h0; i--) {
      const h = hints[i];
      const y0 = Math.max(h.y, D.y), y1 = Math.min(h.y + h.h, D.y + D.h);
      if (y1 <= y0) hints.splice(i, 1); else { h.y = y0; h.h = y1 - y0; }
    }
    zones.push({ kind: 'detail', id: row.id, x: D.x, y: D.y, w: D.w, h: D.h });
  }

  _drawTooltip(ctx, W, H, R) {
    const p = this._pointer;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const h = this._hints.find((z) => p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h);
    if (!h?.text) return;
    const S = COMBAT_STRIP;
    const sz = THEME.fontSizeSmall ?? 9;
    const f = this._fit(ctx, h.text, S.TOOLTIP_MAX_W, { size: sz });
    const ln = this._line(ctx, f.s, { size: sz });
    const tw = Math.ceil(ln.w) + 2 * S.PAD_X, th = sz + 2 * S.PAD_Y + 4;
    const below = (this.rect?.edge ?? 'top') === 'top';
    const tx = Math.max(4, Math.min(W - tw - 4, p.x + 10));
    const ty = below ? Math.min(H - th - 4, p.y + 14) : Math.max(4, p.y - th - 8);
    ctx.save();
    ctx.globalAlpha = 0.92; ctx.fillStyle = THEME.bgPrimary ?? '#000'; ctx.fillRect(tx, ty, tw, th);
    this._drawLine(ctx, ln, tx + S.PAD_X, ty + S.PAD_Y + sz, R.primary, 1);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ── Wejście ──────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Aktywny chip pod punktem (kursor „rączki”) — 'watch' | 'toggle' albo null. */
  chipAt(x, y) {
    if (!this.isOver(x, y)) return null;
    const z = stripHitAt(this._zones, x, y);
    return z?.kind === 'watch' || z?.kind === 'toggle' || z?.kind === 'director' ? z.kind : null;
  }

  /** Kursor (px logiczne) — podświetlenie chipów i podpowiedź w następnej klatce. */
  handleMouseMove(x, y) { this._pointer = { x, y }; return this.isOver(x, y); }

  /**
   * Klik w pasek (px logiczne). Każdy klik w prostokącie jest POCHŁONIĘTY (`true`): „Obserwuj” — `camera:watchBattle`
   * z dzisiejszym ładunkiem; ▼ / ▲ — rozwinięcie tej bitwy (jedna naraz); reszta — nic.
   */
  handleClick(x, y, { emit = (n, p) => EventBus.emit(n, p) } = {}) {
    if (!this.isOver(x, y)) return false;
    const z = stripHitAt(this._zones, x, y);
    if (z?.kind === 'watch' && z.payload) { emit('camera:watchBattle', { ...z.payload }); return true; }
    if (z?.kind === 'director') {   // ARC CV-7 — chip reżysera: włącz (tę bitwę) / wyłącz / wznów po przejęciu
      const dir = (typeof window !== 'undefined') ? window.KOSMOS?.threeRenderer?.cvDirector : null;
      dir?.chipClick?.(z.id);
      if (typeof window !== 'undefined' && window.KOSMOS?.uiManager) window.KOSMOS.uiManager._dirty = true;
      return true;
    }
    if (z?.kind === 'toggle') {
      const row = this._rowsById.get(z.id);
      if (this._expanded?.id === z.id || !row) this.collapse();
      else { this._expanded = this._expandKey(row); this._scroll = 0; }
      if (typeof window !== 'undefined' && window.KOSMOS?.uiManager) window.KOSMOS.uiManager._dirty = true;
      return true;
    }
    return true;
  }

  /** Kółko nad paskiem: przewija rozwinięcie (gdy jest co), nad paskiem zawsze pochłonięte (nie zoomuje mapy). */
  handleWheel(x, y, delta) {
    if (!this.isOver(x, y)) return false;
    const D = this._detail;
    if (D && this._maxScroll > 0 && x >= D.x && x <= D.x + D.w && y >= D.y && y <= D.y + D.h) {
      this._scroll = Math.max(0, Math.min(this._maxScroll, this._scroll + delta * COMBAT_STRIP.SCROLL_STEP));
    }
    return true;
  }

  /** Odczyt dla bramki i keepera: prostokąt, bitwy (liczby stron), rozwinięcie, strefy. */
  debug() {
    const r1 = (v) => (Number.isFinite(v) ? +v.toFixed(1) : v);
    return {
      rect: this.rect ? { x: r1(this.rect.x), y: r1(this.rect.y), w: r1(this.rect.w), h: r1(this.rect.h), edge: this.rect.edge } : null,
      battles: this._rows.map((r) => ({ id: r.id, encounters: r.encounterIds.length, inView: r.inView, round: r.round,
        own: `${r.own.alive}/${r.own.total}`, enemy: r.enemy.hidden > 0 ? '?' : `${r.enemy.alive}/${r.enemy.total}`,
        ownHp: `${Math.round(r.own.hp)}/${Math.round(r.own.hpStart)}`, enemyHp: `${Math.round(r.enemy.hp)}/${Math.round(r.enemy.hpStart)}` })),
      expanded: this.expandedId, scroll: r1(this._scroll), maxScroll: r1(this._maxScroll),
      zones: this._zones.map((z) => ({ kind: z.kind, id: z.id ?? null, x: r1(z.x), y: r1(z.y), w: r1(z.w), h: r1(z.h) })),
    };
  }
}
