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
    EventBus.on('ui:selectionChanged', (p) => { if (p?.vesselId != null) this._reveal(`vessel:${p.vesselId}`); });
    EventBus.on('ui:fleetSelectionChanged', (p) => { if (p?.fleetId != null) this._reveal(`fleet:${p.fleetId}`); });
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
    const vessels = input.vessels ?? (K?.vesselManager?.getAllVessels?.() ?? []).filter((v) => !isEnemyVessel(v));
    const pc = this._pictureCtx(K);
    const order = input.systems ?? this._systemOrder(K, input);
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
    return tree;
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
    const cw = this._count(ctx, g, iy, s.count, 13);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(s.expanded ? '▾' : '▸', g.x + PAD, iy + 13);
    const tx = g.x + PAD + ARROW_W - 2;
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = isActive ? THEME.accent : THEME.textPrimary;
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
    ctx.fillStyle = this._markerColor(r.marker);
    ctx.fillText(glyph, tx, iy + 12);
    tx += ctx.measureText(glyph).width + 3;
    ctx.fillStyle = isSel || this._hoverKey === key ? THEME.textPrimary : THEME.textSecondary;
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
      if (e.dockedAt) where.push(resolveBodyName(e.dockedAt));
      // Układ — gdy inny niż oglądany albo gdy wiersz ma dopisek (członek floty spoza układu prowadzącego, decyzja 6 (a)).
      if (r.systemId !== this._active(K) || r.note) where.push(EntityManager.getStarOfSystem(r.systemId)?.name ?? r.systemId);
    }
    if (where.length) lines.push({ text: where.join(' · '), color: THEME.textDim });
    for (const a of alerts) {
      if (a.kind === 'stranded' || a.kind === 'immobilized' || a.kind === 'combat') continue;
      lines.push({ text: t(`fleetPicture.alert.${a.kind}`), color: THEME.warning ?? THEME.textSecondary });
    }
    return lines;
  }
}
