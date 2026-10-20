// LeftOutliner — ARKUSZ UI, U2 (UI_PLAN §4.3): LEWY outliner — układy i ciała nad mapą 3D (D-UI-1 lewy, D-UI-2,
// D-UI-3, D-UI-4, D-UI-10 dla ciał).
//
//   • Geometria i widoczność — wspólny szkielet obu outlinerów (`OutlinerColumn`, ARKUSZ UI U3-2): kolumna 150 px przy
//     lewej krawędzi, od dolnej krawędzi górnej belki do górnej krawędzi pasa dolnego (§7.17; U3 — `MapInsets`
//     `outlinerBottomInset`); tło półprzezroczyste + cień tekstu (`KOSMOS.leftOutliner.bgAlpha` / `.textShadowBlur`);
//     tylko nad mapą (decyzja 4) — ukryty przy otwartym overlayu pełnoekranowym, przy rozwiniętym Doku taktycznym, przy
//     podglądzie globusa i poza trybem cywilizacji.
//   • Treść: drzewo z czystego `SystemTreeLogic.buildSystemTree` (widoczność, kolejność, ciała); stan zwinięcia —
//     sesja (jawny stan użytkownika tylko tam, gdzie różni się od domyślnego; domyślnie rozwinięty tylko bieżący układ).
//   • Klik (D-UI-5, reguła U1 `ClickIntentLogic`): strzałka układu = zwiń / rozwiń; reszta wiersza układu = przejście
//     do układu (`switchActiveSystem`), w bieżący — domyślny widok (`resetToSystemView`); wiersz ciała = 1. klik
//     zaznaczenie + karta (kamera stoi), 2. klik = focus; ciało z innego układu wg §7.8; ciało z kolonią NIE zmienia
//     aktywnej kolonii (§7.10).
//   • D-UI-10 (ciała): zaznaczone ciało (karta) podświetla swój wiersz; zaznaczenie z mapy rozwija układ i przewija
//     do wiersza (§7.12) — nasłuch `body:selected`.
//   • Decyzja 3 (U2-3): KOLONIE + stacje + JEDN. NAZIEMNE z prawego Outlinera — kolonia gracza = glif na wierszu jej
//     ciała (🏛 z POP / ⛺ placówka; ⚑ kolonia AI), stacja gracza = wiersz pod ciałem-matką (reguła klik/focus),
//     🪖N przy ciele = mapa TEGO ciała (`openPanel('colony', { colonyId })` — droga powrotna desantu, naprawa
//     `486982c`), ⏳N przy kolonii = jej kolejka.
//
// Importuje się pod node (keeper `left_outliner_smoke` — prawdziwy `draw` + `hitTest` na atrapie ctx).

import { THEME }           from '../config/ThemeConfig.js';
import EventBus            from '../core/EventBus.js';
import EntityManager       from '../core/EntityManager.js';
import { t }               from '../i18n/i18n.js';
import { systemIdOf }      from '../utils/SystemScope.js';
import { isPlayerColony }  from '../utils/ColonyOwnership.js';
import { isEnemyVessel }   from '../entities/Vessel.js';   // ARKUSZ UI U3-0 — statki gracza dla widoczności układów (489)
import { buildSystemTree, UNRECOGNIZED_GLYPH, PRESENCE_GLYPH } from './SystemTreeLogic.js';
import { clickObject, bodyTarget, stationTarget, readClickSelection } from './ClickIntentLogic.js';
import { OutlinerColumn, outlinerShown, OUTLINER_COLUMN_W, OUTLINER_BG_ALPHA, OUTLINER_TEXT_SHADOW, OUTLINER_PAD } from './OutlinerColumn.js';

export const LEFT_OUTLINER_W = OUTLINER_COLUMN_W;                // 150 px — §7.17 (oba outlinery po 150 px)
export const LEFT_OUTLINER_BG_ALPHA = OUTLINER_BG_ALPHA;         // §7.17 — strojenie na bramce
export const LEFT_OUTLINER_TEXT_SHADOW = OUTLINER_TEXT_SHADOW;   // px rozmycia cienia tekstu — strojenie na bramce

const SYS_H   = 18;   // wiersz układu
const ROW_H   = 16;   // wiersz ciała
const PAD     = OUTLINER_PAD;
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
 * Decyzja 4 (UI_PLAN §5): lewy outliner tylko nad mapą — ta sama reguła co prawy (`OutlinerColumn.outlinerShown`).
 * @returns {boolean}
 */
export function leftOutlinerShown(state = {}) {
  return outlinerShown(state);
}

export class LeftOutliner extends OutlinerColumn {
  constructor() {
    super('left');
    EventBus.on('body:selected', (p) => this._onBodySelected(p?.entity));
  }

  // D-UI-10 (§7.12): zaznaczenie ciała (z mapy albo dowolnej powierzchni) rozwija jego układ, gdy zwinięty, i przewija
  // listę do wiersza. W bieżącym układzie — powrót do reguły domyślnej (bez jawnego „rozwinięty”), więc po przejściu
  // do innego układu wraca zwinięcie domyślne.
  _onBodySelected(entity) {
    if (!entity?.id) return;
    const sys = systemIdOf(entity);
    if (sys && !this.isExpanded(sys)) this._setExpanded(sys, true);
    this._revealKey = `body:${entity.id}`;
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

  // ── Rysowanie (szablon — `OutlinerColumn.draw`) ───────────────────────────────────────────────────────────────
  /**
   * @param {CanvasRenderingContext2D} ctx — transformata logiczna UI
   * @param {{colonies?:Array, groundUnits?:Array, K?:object}} input
   * @returns {object|null} drzewo z tej klatki (null — outliner ukryty)
   */
  draw(ctx, W, H, input = {}) {
    return super.draw(ctx, W, H, input);
  }

  _model(K, input) {
    const active = this._active(K);
    const tree = buildSystemTree(this.treeContext(K, input, active));
    const items = [];
    for (const s of tree.systems) {
      items.push({ kind: 'system', key: `system:${s.systemId}`, node: s, h: SYS_H });
      for (const r of (s.bodies ?? [])) {
        const kind = r.kind === 'station' ? 'station' : 'body';
        items.push({ kind, key: `${kind}:${r.id}`, row: r, h: ROW_H });
      }
    }
    return {
      title:   t('leftOutliner.systems', tree.systems.length),
      keyHint: '[ , ]',   // U2-4 — klawisz zwijania przy nagłówku
      items,
      result:  tree,
      active,
      sel:     readClickSelection(K),
    };
  }

  _drawItem(ctx, g, iy, it, model) {
    if (it.kind === 'system') this._drawSystemRow(ctx, g, iy, it.node, model.active);
    else if (it.kind === 'station') this._drawStationRow(ctx, g, iy, it.row, model.sel);
    else this._drawBodyRow(ctx, g, iy, it.row, model.sel);
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

  // ── Wejście (trafienie — szablon `OutlinerColumn.hitTest`) ───────────────────────────────────────────────────────
  _onHit(z, x, y, K) {
    const env = this._env(K);
    if (z.type === 'system') {
      if (x < z.arrowX) { this.toggleExpanded(z.systemId, this._active(K)); this._markDirty(); return; }
      // D-UI-5: klik w układ = przejście do niego (kadr `frameSystem`); klik w bieżący = domyślny widok (§7.9).
      const ss = K?.starSystemManager;
      if (ss && ss.activeSystemId !== z.systemId) ss.switchActiveSystem(z.systemId);
      else K?.threeRenderer?.resetToSystemView?.();
      return;
    }
    if (z.type === 'ground') {
      // Decyzja 3: 🪖N = mapa TEGO ciała — droga powrotna desantu (naprawa `486982c`): `openPanel('colony', { colonyId })`.
      // Własna kolonia — także aktywna kolonia (HUD idzie za graczem); cudze ciało — aktywna kolonia nietknięta (bramka D1).
      const colMgr = K?.colonyManager;
      const col = colMgr?.getColony?.(z.bodyId);
      if (col && isPlayerColony(col)) colMgr.switchActiveColony?.(z.bodyId);
      K?.overlayManager?.openPanel?.('colony', { colonyId: z.bodyId });
      return;
    }
    if (z.type === 'body' || z.type === 'queue') {
      const body = EntityManager.get(z.bodyId);
      if (body) clickObject(bodyTarget(body), env);
      return;
    }
    if (z.type === 'station') {
      // Reguła U1: 1. klik = panel stacji (kamera stoi), 2. klik = najazd kamery; stacja z innego układu wg §7.8.
      clickObject(stationTarget(z.stationId, EntityManager.get(z.stationId) ?? null, z.systemId), env);
    }
  }

  _hoverKeyOf(z) {
    const id = z.type === 'system' ? z.systemId : z.type === 'station' ? z.stationId : z.bodyId;
    return `${z.type}:${id}`;
  }

  _hoverTip(z, x, y) {
    if (z.type === 'ground') return { text: t('leftOutliner.groundUnits', z.count), x, y };
    if (z.type === 'queue') return { text: t('leftOutliner.queue', z.count), x, y };
    if (z.type === 'body' && z.recognized === false) return { text: t('leftOutliner.unrecognized', z.name), x, y };
    return null;
  }
}
