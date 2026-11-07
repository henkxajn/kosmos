// Outliner — ARKUSZ UI, U3-2 (UI_PLAN §4.4): PRAWY outliner — statki gracza nad mapą 3D (D-UI-1 prawy, D-UI-6…D-UI-10).
//
//   • Szkielet — `OutlinerColumn` (wspólny z lewym): kolumna 150 px przy prawej krawędzi, od dolnej krawędzi górnej belki
//     do górnej krawędzi pasa dolnego (§7.17), półprzezroczysta jak lewa; tylko nad mapą (decyzja 4 — ukryta przy
//     otwartym overlayu pełnoekranowym i przy rozwiniętym Doku taktycznym); klawisze „.” / „B” (§7.16, `visible`).
//     Koniec trybu szuflady, triggera na prawej krawędzi i przezroczystego pasa pod chip czasu.
//   • Treść: drzewo z czystego `ShipTreeLogic.buildShipTree` — „W drodze” na górze (D-UI-8, §7.3; tylko gdy niepusta),
//     potem UKŁAD w kolejności lewego outlinera (`SystemTreeLogic`) → TYP (D-UI-6, §7.1: wojenne, naukowe, cargo,
//     pozostałe) → floty (węzeł u prowadzącego, członkowie z innych układów z dopiskiem — decyzja 6 (a)) i statki.
//     Znacznik statusu = kolor glifu roli (D-UI-9, §7.2); podpowiedź rozróżnia przyczynę. Zwijanie układów jak w lewym
//     (§7.5: domyślnie rozwinięty bieżący).
//   • Klik (D-UI-5, reguła U1 `ClickIntentLogic`): wiersz statku — 1. klik zaznaczenie + okno statku (kamera stoi;
//     statek w doku — ping na mapie z terminem układu, Finding 477), 2. klik = focus; statek z innego układu wg §7.8;
//     CTRL+klik = przełączenie zbioru. Węzeł floty — menu floty (`setSelectedFleetId`) + mutex flota / statek jak
//     w Dowództwie; 2. klik = focus na prowadzącym (§7.11). Wiersz układu — jak w lewym (strzałka zwija, reszta
//     przełącza układ / domyślny widok).
//   • D-UI-10 (§7.12): zaznaczony statek / flota podświetla swój wiersz; zaznaczenie z mapy albo klawiszem Tab rozwija
//     zwinięty układ i przewija do wiersza (nasłuch `ui:selectionChanged` / `ui:fleetSelectionChanged`).
//   • Decyzja 3 (U3-3): sekcje sprzed U3 zniknęły — KOLONIE, stacje, JEDN. NAZIEMNE i kolejkę (⏳N) ma lewy outliner,
//     EKSPEDYCJE usunięte (status i aktywność statku są w podpowiedzi wiersza), FLOTA zastąpiona drzewem.
//
//   • ARC GALAXY G1 (GALAXY_PLAN.md §4 G1; D-GX-10, D-GX-12): w trybie galaktyki — statki z napędem warp
//     (`GalaxyOutlinerLogic.buildGalaxyShipView`): flota zostaje, gdy ≥ 1 członek ma napęd (reszta przygaszona z powodem),
//     „W drodze” zostaje, kadłub w rezerwie przygaszony z powodem `vessel.reasonVesselInReserve`; kolejność sekcji z własnej
//     reguły (własne układy najpierw, potem odległość), nie z listy lewego. Panele statku i floty dokują do wiersza jak dotąd.
// Importuje się pod node (keeper `right_outliner_smoke` — prawdziwy `draw` / `hitTest` / `updateHover` na atrapie ctx).

import { THEME }          from '../config/ThemeConfig.js';
import EventBus            from '../core/EventBus.js';
import EntityManager       from '../core/EntityManager.js';
import { t }               from '../i18n/i18n.js';
import { resolveBodyName } from '../utils/BodyName.js';
import { resolveVesselStatus } from '../utils/VesselStatus.js';
import { isEnemyVessel }   from '../entities/Vessel.js';
import { buildShipEntry }  from './FleetPictureLogic.js';
import { buildShipTree, MARKER_TONES, TRANSIT } from './ShipTreeLogic.js';
import { buildSystemTree } from './SystemTreeLogic.js';
import { buildGalaxyShipView, galaxyShipSectionOrder, galaxyWorldContext } from './GalaxyOutlinerLogic.js';   // ARC GALAXY G1
import { CLICK_INTENT, clickObject, vesselTarget, fleetTarget, readClickSelection } from './ClickIntentLogic.js';   // ARKUSZ UI U1-3 / U3-2 (D-UI-5)
import { OutlinerColumn, OUTLINER_PAD } from './OutlinerColumn.js';

const SYS_H   = 18;   // wiersz układu / „W drodze”
const GRP_H   = 14;   // podnagłówek typu (D-UI-6)
const ROW_H   = 16;   // wiersz statku / węzła floty
const PAD     = OUTLINER_PAD;
const INDENT  = 10;   // wcięcie członka floty
const ARROW_W = 14;   // strefa strzałki zwijania (od lewej krawędzi wiersza)

/** Nagłówki kubełków typu (§7.1) — literalne `t()`: statyczny skan `check-i18n` widzi każdy klucz. */
const GROUP_LABEL = {
  war:     () => t('rightOutliner.group.war'),
  science: () => t('rightOutliner.group.science'),
  cargo:   () => t('rightOutliner.group.cargo'),
  other:   () => t('rightOutliner.group.other'),
};

export class Outliner extends OutlinerColumn {
  constructor() {
    super('right');
    // Modyfikatory ostatniego kliku (propagowane przez GameScene, wzór ColonyOverlay) — CTRL+klik statku = multi-select.
    // Ustawiane PRZED hitTest.
    this._lastMouseMods = { shift: false, ctrl: false };
    // D-UI-10 (§7.12): zaznaczenie z mapy / Tab / dowolnej powierzchni → rozwinięcie układu wiersza + przewinięcie.
    // ARC GALAXY G3 — tryb galaktyki: CTRL+klik kolejnego statku nie przewija listy do lidera (klik następnego wiersza trafiłby w inny statek).
    EventBus.on('ui:selectionChanged', (p) => {
      if (p?.vesselId == null) return;
      if ((p.vesselIds?.length ?? 1) > 1 && this._K()?.galaxyMode?.isActive === true) return;
      this._reveal(`vessel:${p.vesselId}`);
    });
    EventBus.on('ui:fleetSelectionChanged', (p) => { if (p?.fleetId != null) this._reveal(`fleet:${p.fleetId}`); });
    // ARC GALAXY G1 — przewinięcie listy osobno dla trybu układu i galaktyki.
    this._scrollMemo = { system: 0, galaxy: 0 };
    EventBus.on('galaxy:modeChanged', (p) => {
      const into = p?.active === true ? 'galaxy' : 'system';
      this._scrollMemo[into === 'galaxy' ? 'system' : 'galaxy'] = this._scrollY;
      this._scrollY = this._scrollMemo[into] ?? 0;
      this._markDirty();
    });
  }

  _reveal(key) { this._revealKey = key; this._markDirty(); }

  // Wpięcia świata dla `buildShipEntry` (ten sam kształt co w rendererze, Doku i rejestrze).
  _pictureCtx(K) {
    const vm = K?.vesselManager;
    const dscs = K?.deepSpaceCombatSystem;
    return {
      gameYear:      K?.timeSystem?.gameTime ?? 0,
      fleetSystem:   K?.fleetSystem ?? null,
      combatCheck:   dscs?._findActiveEncounterContaining ? (id) => !!dscs._findActiveEncounterContaining(id) : null,
      isImmobilized: vm?.isImmobilized ? (v) => vm.isImmobilized(v) : null,
    };
  }

  // Kolejność układów = kolejność LEWEGO outlinera (D-UI-6: „układ” jak w lewym) — to samo drzewo `buildSystemTree`
  // z tym samym kontekstem (`LeftOutliner.treeContext`), bez kopii reguł.
  _systemOrder(K, input) {
    const lo = K?.leftOutliner;
    if (!lo?.treeContext) return [];
    const ctx = lo.treeContext(K, { colonies: input.treeColonies ?? input.colonies, groundUnits: input.groundUnits });
    return buildSystemTree({ ...ctx, expanded: () => false }).systems.map((s) => ({ systemId: s.systemId, name: s.name }));
  }

  _tree(K, input, active) {
    let vessels = input.vessels ?? (K?.vesselManager?.getAllVessels?.() ?? []).filter((v) => !isEnemyVessel(v));
    const pc = this._pictureCtx(K);
    let order = input.systems ?? null;
    // ARC GALAXY G1 (D-GX-12) — tryb galaktyki: statki z napędem warp (+ floty mieszane, tranzyt), przygaszenia z powodem;
    // kolejność sekcji z reguły galaktyki (D-GX-10), nie z listy lewego.
    let dim = null;
    if (K?.galaxyMode?.isActive === true) {
      const view = buildGalaxyShipView({ vessels, fleets: K?.fleetSystem?.listFleets?.() ?? [] });
      vessels = view.vessels;
      dim = view.dim;
      if (!order) {
        const world = galaxyWorldContext(K, { colonies: input.treeColonies ?? input.colonies, groundUnits: input.groundUnits });
        // ARC GALAXY G3 — ta sama reguła nazwy co wiersz lewego: układ bez nazwy to „???”, cel skoku ma sekcję bez statku na miejscu.
        order = galaxyShipSectionOrder({ systems: world.systems, presence: world.presence,
          systemName: (id) => EntityManager.getStarOfSystem(id)?.name ?? null, reveal: world.reveal });
      }
    }
    if (!order) order = this._systemOrder(K, input);
    const build = () => buildShipTree({
      vessels,
      entryOf:        (v) => buildShipEntry(v, pc),
      fleets:         K?.fleetSystem?.listFleets?.() ?? [],
      systems:        order,
      systemName:     (id) => EntityManager.getStarOfSystem(id)?.name ?? null,
      activeSystemId: active,
      expanded:       (sys) => this.isExpanded(sys, active),
    });
    let tree = build();
    // §7.12 — wiersz do odsłonięcia w zwiniętym układzie: rozwiń układ (przewinięcie robi szablon `OutlinerColumn`).
    const key = this._revealKey ?? '';
    const sec = key.startsWith('vessel:') ? tree.index.get(key.slice(7))?.section
      : key.startsWith('fleet:') ? tree.fleetIndex.get(key.slice(6)) : null;
    if (sec && sec !== TRANSIT && !this.isExpanded(sec, active)) { this._setExpanded(sec, true, active); tree = build(); }
    if (dim) Outliner._markDim(tree, dim);
    return tree;
  }

  // ARC GALAXY G1 — przygaszenie wierszy statków trybu galaktyki (klucz powodu w `row.dimReason`).
  static _markDim(tree, dim) {
    const mark = (r) => {
      if (r.kind === 'fleet') { for (const m of r.members ?? []) mark(m); return; }
      const k = dim.get(String(r.id));
      if (k) r.dimReason = k;
    };
    for (const r of tree.transit?.rows ?? []) mark(r);
    for (const s of tree.systems ?? []) for (const g of s.groups ?? []) for (const r of g.rows ?? []) mark(r);
  }

  // ── Rysowanie (szablon — `OutlinerColumn.draw`) ───────────────────────────────────────────────────────────────
  _model(K, input) {
    const active = this._active(K);
    const tree = this._tree(K, input, active);
    const items = [];
    const pushRows = (rows) => {
      for (const r of rows) {
        if (r.kind === 'fleet') {
          items.push({ kind: 'fleet', key: `fleet:${r.id}`, row: r, h: ROW_H });
          for (const m of r.members) items.push({ kind: 'ship', key: `vessel:${m.id}`, row: m, h: ROW_H });
        } else {
          items.push({ kind: 'ship', key: `vessel:${r.id}`, row: r, h: ROW_H });
        }
      }
    };
    if (tree.transit) {
      items.push({ kind: 'transit', key: 'transit', node: tree.transit, h: SYS_H });
      pushRows(tree.transit.rows);
    }
    for (const s of tree.systems) {
      items.push({ kind: 'system', key: `system:${s.systemId}`, node: s, h: SYS_H });
      if (!s.expanded) continue;
      for (const grp of s.groups) {
        items.push({ kind: 'group', key: `group:${s.systemId}:${grp.id}`, groupId: grp.id, h: GRP_H });
        pushRows(grp.rows);
      }
    }
    if (!tree.total) items.push({ kind: 'empty', key: 'empty', h: ROW_H });
    const sel = readClickSelection(K);
    return {
      title:   t('rightOutliner.ships', tree.total),
      keyHint: '[ . ]',   // §7.16 — klawisz prawego outlinera
      items,
      result:  tree,
      active,
      sel,
      selSet:  new Set((sel.vesselIds ?? []).map(String)),
      nameOf:  (id) => tree.systems.find((s) => s.systemId === id)?.name ?? EntityManager.getStarOfSystem(id)?.name ?? id,
    };
  }

  _drawItem(ctx, g, iy, it, model) {
    if (it.kind === 'system') this._drawSystemRow(ctx, g, iy, it.node, model.active);
    else if (it.kind === 'transit') this._drawTransitRow(ctx, g, iy, it.node);
    else if (it.kind === 'group') this._drawGroupRow(ctx, g, iy, it.groupId);
    else if (it.kind === 'fleet') this._drawFleetRow(ctx, g, iy, it.row, model);
    else if (it.kind === 'ship') this._drawShipRow(ctx, g, iy, it.row, model);
    else if (it.kind === 'empty') {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'left';
      ctx.fillText(t('outliner.noShips'), g.x + PAD, iy + 12);
    }
  }

  _markerColor(marker) { return THEME[MARKER_TONES[marker]] ?? THEME.textSecondary; }

  // Licznik po prawej (statki pod nagłówkiem / w węźle).
  _count(ctx, g, iy, n, baseY) {
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'right';
    const s = `${n}`;
    ctx.fillText(s, g.x + g.w - PAD, iy + baseY);
    ctx.textAlign = 'left';
    return ctx.measureText(s).width + 4;
  }

  _drawSystemRow(ctx, g, iy, s, active) {
    const key = `system:${s.systemId}`;
    const isActive = s.systemId === active;
    if (isActive) {
      ctx.fillStyle = THEME.accentDim ?? 'rgba(0,255,180,0.07)';
      ctx.fillRect(g.x, iy, g.w, SYS_H);
      ctx.fillStyle = THEME.accent;
      ctx.fillRect(g.x + g.w - 2, iy + 2, 2, SYS_H - 4);
    } else if (this._hoverKey === key) {
      ctx.fillStyle = THEME.accentDim ?? 'rgba(0,255,180,0.07)';
      ctx.fillRect(g.x, iy, g.w, SYS_H);
    }
    this._shadow(ctx, true);
    // ARC GALAXY G3 — licznik sekcji z dopiskiem statków w drodze do układu („→1”); nagłówek miejsca nieznanego przygaszony.
    const cw = this._count(ctx, g, iy, s.inbound > 0 ? `${s.count} →${s.inbound}` : s.count, 13);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(s.expanded ? '▾' : '▸', g.x + PAD, iy + 13);
    const tx = g.x + PAD + ARROW_W - 2;
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = s.dim ? THEME.textDim : isActive ? THEME.accent : THEME.textPrimary;
    ctx.fillText(this._fit(ctx, s.name, g.x + g.w - PAD - cw - tx), tx, iy + 13);
    this._shadow(ctx, false);
    this._clickTargets.push({ type: 'system', systemId: s.systemId, x: g.x, y: iy, w: g.w, h: SYS_H, arrowX: g.x + PAD + ARROW_W });
  }

  // D-UI-8 — sekcja „W drodze” (tranzyt warp): nagłówek bez zwijania.
  _drawTransitRow(ctx, g, iy, node) {
    ctx.fillStyle = THEME.accentDim ?? 'rgba(0,255,180,0.07)';
    ctx.fillRect(g.x, iy, g.w, SYS_H);
    this._shadow(ctx, true);
    const cw = this._count(ctx, g, iy, node.count, 13);
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.textAlign = 'left';
    const tx = g.x + PAD;
    ctx.fillText(this._fit(ctx, t('rightOutliner.inTransit'), g.x + g.w - PAD - cw - tx), tx, iy + 13);
    this._shadow(ctx, false);
    this._clickTargets.push({ type: 'transit', x: g.x, y: iy, w: g.w, h: SYS_H });
  }

  // D-UI-6 — podnagłówek typu (WOJENNE / NAUKOWE / CARGO / POZOSTAŁE).
  _drawGroupRow(ctx, g, iy, groupId) {
    ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'left';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
    ctx.fillText(String(GROUP_LABEL[groupId]?.() ?? groupId).toUpperCase(), g.x + PAD + ARROW_W - 2, iy + 10);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    this._clickTargets.push({ type: 'group', groupId, x: g.x, y: iy, w: g.w, h: GRP_H });
  }

  _rowBg(ctx, g, iy, key, isSel) {
    if (isSel)                       { ctx.fillStyle = THEME.accentMed ?? 'rgba(0,255,180,0.13)'; ctx.fillRect(g.x, iy, g.w, ROW_H); }
    else if (this._hoverKey === key) { ctx.fillStyle = THEME.accentDim ?? 'rgba(0,255,180,0.07)'; ctx.fillRect(g.x, iy, g.w, ROW_H); }
  }

  // Decyzja 6 (a) — węzeł floty u prowadzącego; glif ⛬ w kolorze najpilniejszego znacznika członków.
  _drawFleetRow(ctx, g, iy, f, model) {
    const key = `fleet:${f.id}`;
    const isSel = model.sel?.fleetId != null && model.sel.fleetId === f.id;
    this._rowBg(ctx, g, iy, key, isSel);
    this._shadow(ctx, true);
    const cw = this._count(ctx, g, iy, f.count, 12);
    let tx = g.x + PAD + ARROW_W - 2;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = this._markerColor(f.marker);
    ctx.fillText('⛬', tx, iy + 12);
    tx += ctx.measureText('⛬').width + 3;
    ctx.fillStyle = isSel || this._hoverKey === key ? THEME.textPrimary : THEME.textSecondary;
    ctx.fillText(this._fit(ctx, f.name, g.x + g.w - PAD - cw - tx), tx, iy + 12);
    this._shadow(ctx, false);
    this._clickTargets.push({ type: 'fleet', fleetId: f.id, leadId: f.leadId, row: f, x: g.x, y: iy, w: g.w, h: ROW_H });
  }

  // Wiersz statku: glif roli w kolorze znacznika (D-UI-9) + nazwa; członek floty z innego układu / w drodze — dopisek.
  _drawShipRow(ctx, g, iy, r, model) {
    const key = `vessel:${r.id}`;
    const isSel = model.selSet.has(String(r.id));
    this._rowBg(ctx, g, iy, key, isSel);
    this._shadow(ctx, true);
    let right = g.x + g.w - PAD;
    if (r.note) {
      const note = r.note.kind === 'transit' ? t('rightOutliner.inTransit') : (r.note.name ?? r.note.systemId);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'right';
      const fitted = this._fit(ctx, note, 56);
      ctx.fillText(fitted, right, iy + 12);
      right -= ctx.measureText(fitted).width + 4;
      ctx.textAlign = 'left';
    }
    let tx = g.x + PAD + ARROW_W - 2 + (r.depth ?? 0) * INDENT;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';
    const glyph = r.glyph ?? '○';
    ctx.fillStyle = r.dimReason ? THEME.textDim : this._markerColor(r.marker);   // ARC GALAXY G1 — przygaszony (bez napędu / rezerwa)
    ctx.fillText(glyph, tx, iy + 12);
    tx += ctx.measureText(glyph).width + 3;
    ctx.fillStyle = r.dimReason ? THEME.textDim : (isSel || this._hoverKey === key ? THEME.textPrimary : THEME.textSecondary);
    ctx.fillText(this._fit(ctx, r.name, right - tx), tx, iy + 12);
    this._shadow(ctx, false);
    this._clickTargets.push({ type: 'vessel', vesselId: r.id, row: r, x: g.x, y: iy, w: g.w, h: ROW_H });
  }

  // ── Wejście (trafienie — szablon `OutlinerColumn.hitTest`) ───────────────────────────────────────────────────────
  _onHit(z, x, y, K) {
    const env = this._env(K);
    const um = K?.uiManager;
    if (z.type === 'vessel') {
      // D-UI-5: 1. klik = zaznaczenie + okno statku (kamera stoi); 2. klik w zaznaczony statek = kamera (zadokowany →
      // ciało hangaru); statek z INNEGO układu: 1. klik bez przełączania, 2. klik = przełączenie układu + kamera (§7.8).
      // CTRL+klik = przełączenie zbioru (bez zmian). Działa też dla ZADOKOWANYCH (brak sprite'a 3D).
      if (this._lastMouseMods?.ctrl && um?.toggleSelection) { um.toggleSelection(z.vesselId); return; }
      const v = K?.vesselManager?.getVessel?.(z.vesselId) ?? null;
      const intent = clickObject(vesselTarget(z.vesselId, v), env);
      if (intent === CLICK_INTENT.SELECT) {
        um?.setSelectedFleetId?.(null);   // §7.11 — mutex flota / statek (jak klik statku w Dowództwie)
        // D-UI-10 (§7.12): wiersz → mapa — statek w doku nie ma sprite'a (ramek), więc ping; `pingVessel` z terminem
        // układu (Finding 477) odmawia statkowi spoza oglądanego układu.
        if (v && resolveVesselStatus(v).token === 'docked') K?.threeRenderer?.pingVessel?.(z.vesselId);
      }
      return;
    }
    if (z.type === 'fleet') {
      // D-UI-7 / §7.11: 1. klik = menu floty (`setSelectedFleetId`) + mutex (zaznaczenie statków zdjęte); 2. klik =
      // focus na prowadzącym (pierwszy żywy członek; prowadzący w innym układzie — przełączenie układu, §7.8).
      const lead = K?.vesselManager?.getVessel?.(z.leadId) ?? null;
      clickObject(fleetTarget(z.fleetId, lead), env);
      return;
    }
    if (z.type === 'system') {
      if (x < z.arrowX) { this.toggleExpanded(z.systemId, this._active(K)); this._markDirty(); return; }
      // ARC GALAXY G3 — tryb galaktyki: reguła wiersza lewego (1. klik — gwiazda na płycie + rozwinięcie sekcji; 2. klik — wejście przez
      // bramkę G1 `enterSystem`); dawne przełączenie układu z pominięciem bramki wyrzucało z trybu i otwierało układ bez miejsca.
      const gm = K?.galaxyMode;
      if (gm?.isActive === true) {
        if (String(gm.selectedSystemId ?? '') === String(z.systemId)) gm.enterSystem?.(z.systemId);
        else { gm.select?.(z.systemId); this._setExpanded(z.systemId, true, this._active(K)); }
        this._markDirty();
        return;
      }
      // D-UI-5: klik w układ = przejście do niego (kadr `frameSystem`); klik w bieżący = domyślny widok (§7.9).
      const ss = K?.starSystemManager;
      if (ss && ss.activeSystemId !== z.systemId) ss.switchActiveSystem(z.systemId);
      else K?.threeRenderer?.resetToSystemView?.();
      return;
    }
  }

  _hoverKeyOf(z) {
    const id = z.type === 'system' ? z.systemId : z.type === 'vessel' ? z.vesselId : z.type === 'fleet' ? z.fleetId : (z.id ?? '');
    return `${z.type}:${id}`;
  }

  _hoverTip(z, x, y, K) {
    // ARC GALAXY G3 — nagłówek sekcji w trybie galaktyki: układ bez wejścia (2. klik nic nie zrobi) — powód, jak wiersz lewego.
    if (z.type === 'system' && K?.galaxyMode?.isActive === true && K.galaxyMode.canEnter?.(z.systemId) === false) {
      return { text: t('leftOutliner.cannotEnter'), x, y };
    }
    if (z.type === 'vessel' && z.row) return { lines: this._shipTipLines(z.row, K), x, y };
    if (z.type === 'fleet' && z.row) {
      return { lines: [
        { text: `⛬ ${z.row.name}`, header: true },
        { text: t('fleet.shipsCount', z.row.count), color: THEME.textSecondary },
      ], x, y };
    }
    return null;
  }

  // D-UI-9 — podpowiedź statku: rola, przyczyna znacznika (klucze `fleetPicture.*` — „bez paliwa” rozróżnia dryf od
  // utrzymania), aktywność, położenie, pozostałe alerty.
  _shipTipLines(r, K) {
    const e = r.entry ?? {};
    const mc = this._markerColor(r.marker);
    const lines = [{ text: `${r.glyph ?? ''} ${r.name}`.trim(), header: true }];
    if (r.dimReason) lines.push({ text: t(r.dimReason), color: THEME.warning ?? THEME.textSecondary });   // ARC GALAXY G1 — powód przygaszenia
    if (r.role) lines.push({ text: t(`fleetPicture.role.${r.role}`), color: THEME.textDim });
    const alerts = e.alerts ?? [];
    if (r.marker === 'combat') lines.push({ text: t('fleetPicture.alert.combat'), color: mc });
    if (r.marker === 'noFuel') {
      for (const a of alerts) if (a.kind === 'stranded' || a.kind === 'immobilized') lines.push({ text: t(`fleetPicture.alert.${a.kind}`), color: mc });
    }
    if (e.activityKey) {
      lines.push({ text: t(e.activityKey, ...(e.activityArgs ?? [])), color: (r.marker === 'combat' || r.marker === 'noFuel') ? THEME.textSecondary : mc });
    }
    const where = [];
    if (r.systemId == null) where.push(t('rightOutliner.inTransit'));
    else {
      // ARC GALAXY G3 — tryb galaktyki: nazwy z sekcji drzewa (reguła mgły); układ bez nazwy nie zdradza ani gwiazdy, ani ciała.
      const section = K?.galaxyMode?.isActive === true ? this._layout?.result?.systems?.find?.((s) => s.systemId === r.systemId) : null;
      if (e.dockedAt && section?.dim !== true) where.push(resolveBodyName(e.dockedAt));
      // Układ — gdy inny niż oglądany albo gdy wiersz ma dopisek (członek floty spoza układu prowadzącego, decyzja 6 (a)).
      if (r.systemId !== this._active(K) || r.note) where.push(section?.name ?? EntityManager.getStarOfSystem(r.systemId)?.name ?? r.systemId);
    }
    if (where.length) lines.push({ text: where.join(' · '), color: THEME.textDim });
    for (const a of alerts) {
      if (a.kind === 'stranded' || a.kind === 'immobilized' || a.kind === 'combat') continue;
      lines.push({ text: t(`fleetPicture.alert.${a.kind}`), color: THEME.warning ?? THEME.textSecondary });
    }
    return lines;
  }
}
