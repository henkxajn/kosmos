// LeftOutliner — ARKUSZ UI, U2 (UI_PLAN §4.3): LEWY outliner — układy i ciała nad mapą 3D (D-UI-1 lewy, D-UI-2,
// D-UI-3, D-UI-4, D-UI-10 dla ciał).
//
//   • Geometria (§7.17): kolumna 150 px przy lewej krawędzi, od dolnej krawędzi górnej belki do górnej krawędzi paska
//     nawigacji (wcięcia `MapInsets` — także rezerwa zwiniętego Doku taktycznego); tło półprzezroczyste
//     (`bgAlpha(0.6)`) + cień tekstu — do strojenia na bramce (`KOSMOS.leftOutliner.bgAlpha` / `.textShadowBlur`).
//   • Widoczność (decyzja 4): tylko nad mapą — ukryty przy otwartym overlayu pełnoekranowym i przy rozwiniętym Doku
//     taktycznym; poza trybem cywilizacji i przy podglądzie globusa — nic.
//   • Treść: drzewo z czystego `SystemTreeLogic.buildSystemTree` (widoczność, kolejność, ciała); stan zwinięcia —
//     sesja (`_expanded`: jawny stan użytkownika tylko tam, gdzie różni się od domyślnego; domyślnie rozwinięty tylko
//     bieżący układ).
//   • Klik (D-UI-5, reguła U1 `ClickIntentLogic`): strzałka układu = zwiń / rozwiń; reszta wiersza układu = przejście
//     do układu (`switchActiveSystem`), w bieżący — domyślny widok (`resetToSystemView`); wiersz ciała = 1. klik
//     zaznaczenie + karta (kamera stoi), 2. klik = focus; ciało z innego układu wg §7.8; ciało z kolonią NIE zmienia
//     aktywnej kolonii (§7.10).
//   • D-UI-10 (ciała): zaznaczone ciało (karta) podświetla swój wiersz; zaznaczenie z mapy rozwija układ i przewija
//     do wiersza (§7.12) — nasłuch `body:selected`.
//   • Decyzja 3 (U2-3): KOLONIE + stacje + JEDN. NAZIEMNE z prawego Outlinera — kolonia gracza = glif na wierszu jej
//     ciała (🏛 z POP / ⛺ placówka; ⚑ kolonia AI), stacja gracza = wiersz pod ciałem-matką (reguła klik/focus),
//     🪖N przy ciele = mapa TEGO ciała (`openPanel('colony', { colonyId })` — droga powrotna desantu, naprawa
//     `486982c`), ⏳N przy kolonii = jej kolejka. Prawy Outliner traci te sekcje dopiero w U3 (w U2 oba równolegle).
//
// Szkielet (sekcja, clip, przewijanie, prostokąty trafień) — wzór `Outliner.js` (prawy), bez trybu szuflady.
// Importuje się pod node (keeper `left_outliner_smoke` — prawdziwy `draw` + `hitTest` na atrapie ctx).

import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { COSMIC }          from '../config/LayoutConfig.js';
import EventBus            from '../core/EventBus.js';
import EntityManager       from '../core/EntityManager.js';
import { t }               from '../i18n/i18n.js';
import { systemIdOf }      from '../utils/SystemScope.js';
import { isPlayerColony }  from '../utils/ColonyOwnership.js';
import { isEnemyVessel }   from '../entities/Vessel.js';   // ARKUSZ UI U3-0 — statki gracza dla widoczności układów (489)
import { buildSystemTree, isSystemExpanded, UNRECOGNIZED_GLYPH, PRESENCE_GLYPH } from './SystemTreeLogic.js';
import { getMapInsets }    from './MapInsets.js';
import { clickObject, bodyTarget, stationTarget, readClickSelection } from './ClickIntentLogic.js';

export const LEFT_OUTLINER_W = COSMIC.OUTLINER_W;   // 150 px — §7.17 (oba outlinery po 150 px)
export const LEFT_OUTLINER_BG_ALPHA = 0.6;           // §7.17 — strojenie na bramce
export const LEFT_OUTLINER_TEXT_SHADOW = 3;          // px rozmycia cienia tekstu — strojenie na bramce

const HDR_H   = 18;   // nagłówek sekcji
const SYS_H   = 18;   // wiersz układu
const ROW_H   = 16;   // wiersz ciała
const PAD     = 5;
const INDENT  = 10;   // wcięcie na poziom (księżyc, stacja)
const ARROW_W = 14;   // strefa strzałki zwijania (od lewej krawędzi wiersza)

/**
 * ARKUSZ UI U2-4 (§7.16): klawisz outlinera z naciśnięcia — „,” lewy, „.” prawy, „B” oba. `e.code` (niezależnie od
 * układu klawiatury PL / EN); z dowolnym modyfikatorem — nic (Ctrl i Shift to tryby przytrzymania mapy).
 * @returns {'left'|'right'|'both'|null}
 */
export function outlinerKeyAction(e) {
  if (!e || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return null;
  return e.code === 'Comma' ? 'left' : e.code === 'Period' ? 'right' : e.code === 'KeyB' ? 'both' : null;
}

/**
 * Nowy stan widoczności outlinerów (sesja) po klawiszu. „B”: którykolwiek widoczny → oba schowane; oba schowane → oba
 * pokazane (jednym klawiszem czysta mapa i powrót).
 * @param {'left'|'right'|'both'} action
 * @param {{left:boolean, right:boolean}} state
 * @returns {{left:boolean, right:boolean}|null}
 */
export function applyOutlinerToggle(action, { left = true, right = true } = {}) {
  if (action === 'left') return { left: !left, right: !!right };
  if (action === 'right') return { left: !!left, right: !right };
  if (action === 'both') { const any = !!left || !!right; return { left: !any, right: !any }; }
  return null;
}

/**
 * Decyzja 4 (UI_PLAN §5): lewy outliner tylko nad mapą.
 * @returns {boolean}
 */
export function leftOutlinerShown({ civMode = false, globeOpen = false, userVisible = true, overlayOpen = false, dockExpanded = false } = {}) {
  return civMode === true && !globeOpen && userVisible !== false && !overlayOpen && !dockExpanded;
}

export class LeftOutliner {
  constructor() {
    this.visible        = true;                        // stan użytkownika (sesja)
    this.bgAlpha        = LEFT_OUTLINER_BG_ALPHA;
    this.textShadowBlur = LEFT_OUTLINER_TEXT_SHADOW;
    this._expanded      = new Map();                   // systemId → bool (jawny stan zwinięcia; sesja, nie zapis)
    this._scrollY       = 0;
    this._maxScroll     = 0;
    this._clickTargets  = [];
    this._hoverKey      = null;                        // `typ:id` najechanego wiersza
    this._revealId      = null;                        // ciało do przewinięcia w widok (zaznaczenie z mapy)
    this._rect          = null;                        // ostatnio narysowany panel {x,y,w,h}
    this._tip           = null;                        // podpowiedź najechania { text, x, y }
    EventBus.on('body:selected', (p) => this._onBodySelected(p?.entity));
  }

  _K() { return typeof window !== 'undefined' ? window.KOSMOS : null; }
  _markDirty() { const um = this._K()?.uiManager; if (um) um._dirty = true; }
  _active(K) { return K?.activeSystemId ?? K?.starSystemManager?.activeSystemId ?? 'sys_home'; }

  // ── Widoczność i rezerwa (decyzja 4, `MapInsets`) ──────────────────────────────────────────────────────────────
  isShown(K = this._K()) {
    return leftOutlinerShown({
      civMode:      !!K?.civMode,
      globeOpen:    !!K?.planetGlobeOpen,
      userVisible:  this.visible !== false,
      overlayOpen:  !!K?.uiManager?.overlayManager?.isAnyOpen?.(),
      dockExpanded: !!K?.tacticalDock?.isExpanded?.(),
    });
  }

  /** Szerokość zajmowana nad mapą — wcięcie `left` w `MapInsets` (0 gdy ukryty). */
  getReservedWidth(K = this._K()) { return this.isShown(K) ? LEFT_OUTLINER_W : 0; }

  _geom(W, H, K) {
    const ins = getMapInsets(K);
    return { x: 0, y: ins.top, w: LEFT_OUTLINER_W, h: Math.max(0, H - ins.bottom - ins.top) };
  }

  // ── Zwijanie (D-UI-4, §7.5) ──────────────────────────────────────────────────────────────────────────────────
  isExpanded(systemId, activeSystemId = this._active(this._K())) {
    return isSystemExpanded(systemId, activeSystemId, this._expanded);
  }

  toggleExpanded(systemId, activeSystemId = this._active(this._K())) {
    this._setExpanded(systemId, !this.isExpanded(systemId, activeSystemId), activeSystemId);
  }

  // Jawny stan zwinięcia trzymany tylko wtedy, gdy różni się od domyślnego (rozwinięty = bieżący układ): ▸ i ▾ na innym
  // układzie nie zostawiają śladu (po przejściu do niego jest rozwinięty), zwinięcie bieżącego układu zostaje.
  _setExpanded(systemId, value, activeSystemId = this._active(this._K())) {
    if (value === (systemId === activeSystemId)) this._expanded.delete(systemId);
    else this._expanded.set(systemId, value);
  }

  // D-UI-10 (§7.12): zaznaczenie ciała (z mapy albo dowolnej powierzchni) rozwija jego układ, gdy zwinięty, i przewija
  // listę do wiersza. W bieżącym układzie — powrót do reguły domyślnej (bez jawnego „rozwinięty”), więc po przejściu
  // do innego układu wraca zwinięcie domyślne.
  _onBodySelected(entity) {
    if (!entity?.id) return;
    const sys = systemIdOf(entity);
    if (sys && !this.isExpanded(sys)) this._setExpanded(sys, true);
    this._revealId = entity.id;
    this._markDirty();
  }

  /** Kontekst drzewa z żywych rejestrów (`input.colonies` / `input.groundUnits` podaje UIManager). */
  treeContext(K, input = {}, active = this._active(K)) {
    return {
      systems:        K?.starSystemManager?.getAllSystems?.() ?? [],
      activeSystemId: active,
      colonies:       input.colonies ?? K?.colonyManager?.getAllColonies?.() ?? [],
      stations:       K?.stationSystem?.getAllStations?.() ?? [],
      groundUnits:    input.groundUnits ?? [],
      // ARKUSZ UI U3-0 (Finding 489): statki GRACZA odsłaniają swój układ — wróg odfiltrowany TUTAJ (kontrakt
      // `buildSystemTree`: logika nie zna `isEnemyVessel`).
      vessels:        input.vessels ?? (K?.vesselManager?.getAllVessels?.() ?? []).filter((v) => !isEnemyVessel(v)),
      bodiesOf:       (type, sys) => EntityManager.getByTypeInSystem(type, sys),
      starName:       (sys) => EntityManager.getStarOfSystem(sys)?.name ?? null,
      systemOfBody:   (id) => EntityManager.get(id)?.systemId ?? null,
      expanded:       (sys) => this.isExpanded(sys, active),
    };
  }

  // ── Rysowanie ─────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * @param {CanvasRenderingContext2D} ctx — transformata logiczna UI
   * @param {{colonies?:Array, groundUnits?:Array, K?:object}} input
   * @returns {object|null} drzewo z tej klatki (null — outliner ukryty)
   */
  draw(ctx, W, H, input = {}) {
    const K = input.K ?? this._K();
    this._clickTargets = [];
    if (!this.isShown(K)) { this._rect = null; return null; }
    const g = this._geom(W, H, K);
    this._rect = g;
    const active = this._active(K);
    const tree = buildSystemTree(this.treeContext(K, input, active));
    const sel = readClickSelection(K);

    ctx.save();
    // Tło (półprzezroczyste — mapa prześwituje) + krawędź od strony mapy.
    ctx.fillStyle = bgAlpha(this.bgAlpha);
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x + g.w - 0.5, g.y); ctx.lineTo(g.x + g.w - 0.5, g.y + g.h); ctx.stroke();

    // Nagłówek (stały — poza przewijaniem).
    ctx.fillStyle = THEME.accentDim ?? 'rgba(0,255,180,0.07)';
    ctx.fillRect(g.x, g.y, g.w, HDR_H);
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(g.x, g.y + HDR_H + 0.5); ctx.lineTo(g.x + g.w, g.y + HDR_H + 0.5); ctx.stroke();
    ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
    ctx.fillText(String(t('leftOutliner.systems', tree.systems.length)).toUpperCase(), g.x + PAD, g.y + HDR_H / 2 + 3);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    // U2-4 — klawisz zwijania przy nagłówku (pełna podpowiedź po najechaniu — `leftOutliner.keyHint`).
    ctx.textAlign = 'right';
    ctx.fillText('[ , ]', g.x + g.w - PAD, g.y + HDR_H / 2 + 3);
    ctx.textAlign = 'left';
    this._clickTargets.push({ type: 'header', x: g.x, y: g.y, w: g.w, h: HDR_H });

    // Układ treści (współrzędne treści, przed przewinięciem).
    const items = [];
    let cy = 0;
    for (const s of tree.systems) {
      items.push({ kind: 'system', node: s, y: cy, h: SYS_H });
      cy += SYS_H;
      for (const r of (s.bodies ?? [])) {
        items.push({ kind: r.kind === 'station' ? 'station' : 'body', row: r, y: cy, h: ROW_H });
        cy += ROW_H;
      }
    }
    const contentTop = g.y + HDR_H + 2;
    const viewH = Math.max(0, g.y + g.h - contentTop);
    this._maxScroll = Math.max(0, cy - viewH);
    // §7.12 — przewinięcie do zaznaczonego ciała (raz, po zaznaczeniu).
    if (this._revealId) {
      const it = items.find((i) => i.kind === 'body' && i.row.id === this._revealId);
      if (it) {
        if (it.y < this._scrollY) this._scrollY = it.y - 2;
        else if (it.y + it.h > this._scrollY + viewH) this._scrollY = it.y + it.h - viewH + 2;
      }
      this._revealId = null;
    }
    this._scrollY = Math.max(0, Math.min(this._maxScroll, this._scrollY));

    ctx.save();
    ctx.beginPath(); ctx.rect(g.x, contentTop, g.w, viewH); ctx.clip();
    for (const it of items) {
      const iy = contentTop + it.y - this._scrollY;
      if (iy + it.h < contentTop || iy > contentTop + viewH) continue;   // poza widokiem — bez rysowania i bez trafień
      if (it.kind === 'system') this._drawSystemRow(ctx, g, iy, it.node, active);
      else if (it.kind === 'station') this._drawStationRow(ctx, g, iy, it.row, sel);
      else this._drawBodyRow(ctx, g, iy, it.row, sel);
    }
    ctx.restore();

    // Pasek przewijania.
    if (this._maxScroll > 0 && viewH > 0) {
      const thumbH = Math.max(20, viewH * (viewH / (cy || 1)));
      const thumbY = contentTop + (viewH - thumbH) * (this._scrollY / this._maxScroll);
      ctx.fillStyle = THEME.accentMed ?? 'rgba(0,255,180,0.35)';
      ctx.fillRect(g.x + g.w - 3, thumbY, 2, thumbH);
    }
    ctx.restore();
    return tree;
  }

  _shadow(ctx, on) {
    if (on) { ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = this.textShadowBlur; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 1; }
    else { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
  }

  _fit(ctx, text, maxW) {
    text = String(text ?? '');
    if (maxW <= 0) return '';
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  _drawSystemRow(ctx, g, iy, s, active) {
    const key = `system:${s.systemId}`;
    const isActive = s.systemId === active;
    if (isActive) {
      ctx.fillStyle = THEME.accentDim ?? 'rgba(0,255,180,0.07)';
      ctx.fillRect(g.x, iy, g.w, SYS_H);
      ctx.fillStyle = THEME.accent;
      ctx.fillRect(g.x, iy + 2, 2, SYS_H - 4);
    } else if (this._hoverKey === key) {
      ctx.fillStyle = THEME.accentDim ?? 'rgba(0,255,180,0.07)';
      ctx.fillRect(g.x, iy, g.w, SYS_H);
    }
    const expanded = Array.isArray(s.bodies);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';
    this._shadow(ctx, true);
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(expanded ? '▾' : '▸', g.x + PAD, iy + 13);
    let tx = g.x + PAD + ARROW_W - 2;
    if (s.glyph) {
      ctx.fillStyle = s.presence === 'foreign' ? (THEME.warning ?? THEME.textSecondary) : THEME.textPrimary;
      ctx.fillText(s.glyph, tx, iy + 13);
      tx += ctx.measureText(s.glyph).width + 3;
    }
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = isActive ? THEME.accent : THEME.textPrimary;
    ctx.fillText(this._fit(ctx, s.name, g.x + g.w - PAD - tx), tx, iy + 13);
    this._shadow(ctx, false);
    this._clickTargets.push({ type: 'system', systemId: s.systemId, x: g.x, y: iy, w: g.w, h: SYS_H, arrowX: g.x + PAD + ARROW_W });
  }

  _drawBodyRow(ctx, g, iy, r, sel) {
    const key = `body:${r.id}`;
    const isSel = sel?.entityId != null && sel.entityId === r.id;
    if (isSel)                        { ctx.fillStyle = THEME.accentMed ?? 'rgba(0,255,180,0.13)'; ctx.fillRect(g.x, iy, g.w, ROW_H); }
    else if (this._hoverKey === key)  { ctx.fillStyle = THEME.accentDim ?? 'rgba(0,255,180,0.07)'; ctx.fillRect(g.x, iy, g.w, ROW_H); }
    let tx = g.x + PAD + ARROW_W - 2 + r.depth * INDENT;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';
    this._shadow(ctx, true);
    // Znaczniki po prawej (decyzja 3): 🪖N — klik = mapa TEGO ciała; ⏳N — kolejka kolonii (klik jak w wiersz ciała).
    // Strefy znaczników przed strefą wiersza — `_targetAt` bierze pierwszą trafioną.
    let right = g.x + g.w - PAD - 2;   // 2 px na pasek przewijania
    const marks = [];
    if (r.groundUnits > 0) marks.push({ type: 'ground', count: r.groundUnits, text: `🪖${r.groundUnits}`, color: THEME.textPrimary });
    if (r.queue > 0)       marks.push({ type: 'queue',  count: r.queue,       text: `⏳${r.queue}`,       color: THEME.warning ?? THEME.textSecondary });
    for (const m of marks) {
      const mw = ctx.measureText(m.text).width;
      right -= mw;
      ctx.fillStyle = m.color;
      ctx.fillText(m.text, right, iy + 12);
      this._clickTargets.push({ type: m.type, bodyId: r.id, systemId: r.systemId, count: m.count, x: right - 2, y: iy, w: mw + 4, h: ROW_H });
      right -= 4;
    }
    // Glif przed nazwą: ○ nierozpoznane / 🏛 kolonia gracza z POP / ⛺ placówka gracza / ⚑ kolonia AI.
    const glyph = !r.recognized ? UNRECOGNIZED_GLYPH
      : r.colony === 'colony' ? PRESENCE_GLYPH.colony
      : r.colony === 'outpost' ? PRESENCE_GLYPH.outpost
      : r.foreign ? PRESENCE_GLYPH.foreign : '';
    if (glyph) {
      ctx.fillStyle = !r.recognized ? THEME.textDim : (r.colony ? THEME.textPrimary : (THEME.warning ?? THEME.textSecondary));
      ctx.fillText(glyph, tx, iy + 12);
      tx += ctx.measureText(glyph).width + 3;
    }
    ctx.fillStyle = (isSel || r.colony) ? THEME.textPrimary : (r.recognized ? THEME.textSecondary : THEME.textDim);
    ctx.fillText(this._fit(ctx, r.name, right - tx), tx, iy + 12);
    this._shadow(ctx, false);
    this._clickTargets.push({ type: 'body', bodyId: r.id, systemId: r.systemId, recognized: r.recognized, name: r.name, x: g.x, y: iy, w: g.w, h: ROW_H });
  }

  // Stacja gracza pod ciałem-matką (decyzja 3) — reguła klik/focus jak wiersz stacji dzisiejszego Outlinera.
  _drawStationRow(ctx, g, iy, r, sel) {
    const key = `station:${r.id}`;
    const isSel = sel?.stationId != null && sel.stationId === r.id;
    if (isSel)                        { ctx.fillStyle = THEME.accentMed ?? 'rgba(0,255,180,0.13)'; ctx.fillRect(g.x, iy, g.w, ROW_H); }
    else if (this._hoverKey === key)  { ctx.fillStyle = THEME.accentDim ?? 'rgba(0,255,180,0.07)'; ctx.fillRect(g.x, iy, g.w, ROW_H); }
    const tx = g.x + PAD + ARROW_W - 2 + r.depth * INDENT;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';
    this._shadow(ctx, true);
    ctx.fillStyle = isSel ? THEME.textPrimary : THEME.textSecondary;
    ctx.fillText(this._fit(ctx, `🛰 ${r.name}`, g.x + g.w - PAD - 2 - tx), tx, iy + 12);
    this._shadow(ctx, false);
    this._clickTargets.push({ type: 'station', stationId: r.id, systemId: r.systemId, x: g.x, y: iy, w: g.w, h: ROW_H });
  }

  /** Podpowiedź najechania (○, 🪖N, ⏳N) — rysowana na wierzchu, z tooltipami innych powierzchni. */
  drawTooltip(ctx, W, H, K = this._K()) {
    const tip = this._tip;
    if (!tip?.text || !this.isShown(K)) return;
    ctx.save();
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const tw = ctx.measureText(tip.text).width + 12, th = 18;
    let tx = tip.x + 12, ty = tip.y + 14;
    if (tx + tw > W - 4) tx = W - tw - 4;
    if (ty + th > H - 4) ty = tip.y - th - 6;
    ctx.fillStyle = bgAlpha(0.92);
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = THEME.borderActive ?? THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
    ctx.fillStyle = THEME.textPrimary;
    ctx.textAlign = 'left';
    ctx.fillText(tip.text, tx + 6, ty + 12);
    ctx.restore();
  }

  // ── Wejście ───────────────────────────────────────────────────────────────────────────────────────────────────
  /** Czy punkt (px logiczne) jest nad panelem — blokada kamery (`UIManager.isOverUI`). */
  isOver(x, y, W, H, K = this._K()) {
    if (!this.isShown(K)) return false;
    const g = this._geom(W, H, K);
    return x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h;
  }

  _targetAt(x, y) {
    return this._clickTargets.find((z) => z.type !== 'header' && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) ?? null;
  }

  /** Klik (px logiczne). `true` = pochłonięty (każdy klik w panel). */
  hitTest(x, y, W, H, K = this._K()) {
    if (!this.isOver(x, y, W, H, K)) return false;
    const z = this._targetAt(x, y);
    if (!z) return true;
    const env = { K, emit: (n, p) => EventBus.emit(n, p) };
    if (z.type === 'system') {
      if (x < z.arrowX) { this.toggleExpanded(z.systemId, this._active(K)); this._markDirty(); return true; }
      // D-UI-5: klik w układ = przejście do niego (kadr `frameSystem`); klik w bieżący = domyślny widok (§7.9).
      const ss = K?.starSystemManager;
      if (ss && ss.activeSystemId !== z.systemId) ss.switchActiveSystem(z.systemId);
      else K?.threeRenderer?.resetToSystemView?.();
      return true;
    }
    if (z.type === 'ground') {
      // Decyzja 3: 🪖N = mapa TEGO ciała — droga powrotna desantu (naprawa `486982c`): `openPanel('colony', { colonyId })`.
      // Własna kolonia — także aktywna kolonia (HUD idzie za graczem); cudze ciało — aktywna kolonia nietknięta (bramka D1).
      const colMgr = K?.colonyManager;
      const col = colMgr?.getColony?.(z.bodyId);
      if (col && isPlayerColony(col)) colMgr.switchActiveColony?.(z.bodyId);
      K?.overlayManager?.openPanel?.('colony', { colonyId: z.bodyId });
      return true;
    }
    if (z.type === 'body' || z.type === 'queue') {
      const body = EntityManager.get(z.bodyId);
      if (body) clickObject(bodyTarget(body), env);
      return true;
    }
    if (z.type === 'station') {
      // Reguła U1: 1. klik = panel stacji (kamera stoi), 2. klik = najazd kamery; stacja z innego układu wg §7.8.
      clickObject(stationTarget(z.stationId, EntityManager.get(z.stationId) ?? null, z.systemId), env);
      return true;
    }
    return true;
  }

  handleWheel(x, y, delta, W, H, K = this._K()) {
    if (!this.isOver(x, y, W, H, K)) return false;
    if (this._maxScroll <= 0) return false;   // nic do przewijania — kamera i tak zablokowana przez `isOverUI`
    this._scrollY = Math.max(0, Math.min(this._maxScroll, this._scrollY + delta));
    return true;
  }

  updateHover(x, y, W, H, K = this._K()) {
    const prev = this._hoverKey, prevTip = this._tip?.text ?? null;
    this._tip = null;
    if (!this.isOver(x, y, W, H, K)) this._hoverKey = null;
    else {
      const z = this._targetAt(x, y);
      const id = !z ? null : z.type === 'system' ? z.systemId : z.type === 'station' ? z.stationId : z.bodyId;
      this._hoverKey = z ? `${z.type}:${id}` : null;
      const hd = this._clickTargets.find((h) => h.type === 'header' && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
      if (hd) this._tip = { text: t('leftOutliner.keyHint'), x, y };
      else if (z?.type === 'ground') this._tip = { text: t('leftOutliner.groundUnits', z.count), x, y };
      else if (z?.type === 'queue') this._tip = { text: t('leftOutliner.queue', z.count), x, y };
      else if (z?.type === 'body' && z.recognized === false) this._tip = { text: t('leftOutliner.unrecognized', z.name), x, y };
    }
    if (prev !== this._hoverKey || prevTip !== (this._tip?.text ?? null)) this._markDirty();
  }
}
