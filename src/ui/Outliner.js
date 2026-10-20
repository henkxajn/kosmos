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
//   • ⚠ DO U3-3 pod drzewem statków zostają sekcje sprzed U3 — KOLONIE, EKSPEDYCJE, KOLEJKA, JEDN. NAZIEMNE (decyzja 3:
//     znikają w U3-3; kolonie, stacje, wojska i kolejkę ma już lewy outliner). Sekcja FLOTA — zastąpiona drzewem.
//
// Importuje się pod node (keeper `right_outliner_smoke` — prawdziwy `draw` / `hitTest` / `updateHover` na atrapie ctx).

import { THEME }          from '../config/ThemeConfig.js';
import { COSMIC }         from '../config/LayoutConfig.js';
import { SHIPS }          from '../data/ShipsData.js';
import { HULLS }          from '../data/HullsData.js';
import { BUILDINGS }      from '../data/BuildingsData.js';
import { ALL_RESOURCES }  from '../data/ResourcesData.js';
import { COMMODITIES }    from '../data/CommoditiesData.js';
import EventBus            from '../core/EventBus.js';
import EntityManager       from '../core/EntityManager.js';
import { t, getName }     from '../i18n/i18n.js';
import { resolveBodyName } from '../utils/BodyName.js';
import { isSystemExploredData } from '../utils/SystemExploration.js';
import { resolveVesselStatus } from '../utils/VesselStatus.js';
import { isPlayerColony }  from '../utils/ColonyOwnership.js';
import { isEnemyVessel }   from '../entities/Vessel.js';
import { ARCHETYPE_ICONS } from '../data/unitArchetypes.js';
import { GROUND_UNITS }    from '../data/GroundUnitData.js';
import { groupGroundUnitsByBody } from './OutlinerGroundLogic.js';
import { buildShipEntry }  from './FleetPictureLogic.js';
import { buildShipTree, MARKER_TONES, TRANSIT } from './ShipTreeLogic.js';
import { buildSystemTree } from './SystemTreeLogic.js';
import { CLICK_INTENT, clickObject, vesselTarget, fleetTarget, bodyTarget, stationTarget, readClickSelection } from './ClickIntentLogic.js';   // ARKUSZ UI U1-3 / U3-2 (D-UI-5)
import { OutlinerColumn, OUTLINER_COLUMN_W, OUTLINER_PAD } from './OutlinerColumn.js';

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
    // ── DO U3-3: sekcje sprzed U3 (decyzja 3) ──
    this._sections = { colonies: true, expeditions: true, queue: true, groundUnits: true };
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
    this._onLegacyHit(z, x, y, K);   // DO U3-3
  }

  _hoverKeyOf(z) {
    const id = z.type === 'system' ? z.systemId : z.type === 'vessel' ? z.vesselId : z.type === 'fleet' ? z.fleetId
      : z.type === 'colony' ? z.planetId : z.type === 'station' ? z.stationId : z.type === 'groundUnit' ? z.unitId
      : z.type === 'groundBody' ? z.planetId : (z.id ?? '');
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
    if (z.type === 'colony' && z.colony) return { lines: this._buildColonyTooltip(z.colony), x, y };   // DO U3-3
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

  // ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // DO U3-3 — sekcje sprzed U3 pod drzewem statków (decyzja 3: KOLONIE, EKSPEDYCJE, KOLEJKA, JEDN. NAZIEMNE).
  // Rysowane w tej samej kolumnie i w tym samym clipie (szablon `OutlinerColumn` — `_drawExtra`).
  // ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  _drawExtra(ctx, g, y0, state) {
    const x = g.x;
    const colonies = state?.colonies ?? [];
    const expeditions = state?.expeditions ?? [];
    let cy = y0;

    // ── KOLONIE ──────────────────────────────────────────
    cy = this._drawSection(ctx, x, cy, 'colonies', t('outliner.colonies', colonies.length), (startY) => {
      const bySystem = new Map();
      for (const col of colonies) {
        const sysId = col.systemId ?? 'sys_home';
        if (!bySystem.has(sysId)) bySystem.set(sysId, []);
        bySystem.get(sysId).push(col);
      }
      const stationsBySystem = new Map();
      const stSys = window.KOSMOS?.stationSystem;
      if (stSys) {
        for (const st of stSys.getAllStations()) {
          if (st.ownerEmpireId && st.ownerEmpireId !== 'player') continue;
          const sysId = st.systemId ?? 'sys_home';
          if (!stationsBySystem.has(sysId)) stationsBySystem.set(sysId, []);
          stationsBySystem.get(sysId).push(st);
        }
      }
      const ssMgr = window.KOSMOS?.starSystemManager;
      if (ssMgr) {
        for (const sys of ssMgr.getAllSystems()) {
          if (!isSystemExploredData(sys)) continue;
          if (!bySystem.has(sys.systemId)) bySystem.set(sys.systemId, []);
        }
      }
      for (const sysId of stationsBySystem.keys()) if (!bySystem.has(sysId)) bySystem.set(sysId, []);
      let dy = 0;
      for (const [sysId, sysCols] of bySystem) {
        const starName = EntityManager.getStarOfSystem(sysId)?.name ?? sysId;
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textLabel;
        ctx.fillText(`⭐ ${_truncate(starName, 13)}`, x + PAD, startY + dy + 13);
        dy += 16;
        const sysStations = stationsBySystem.get(sysId) ?? [];
        if (sysCols.length === 0 && sysStations.length === 0) {
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textDim;
          ctx.fillText(t('outliner.noColoniesHere'), x + PAD + 8, startY + dy + 12);
          dy += 16;
        }
        const drawStationRow = (st, stIndent) => {
          const iy = startY + dy;
          const isHov = this._hoverKey === `station:${st.id}`;
          if (isHov) { ctx.fillStyle = THEME.accentDim; ctx.fillRect(x, iy, OUTLINER_W, ITEM_H); }
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillStyle = isHov ? THEME.textPrimary : THEME.textSecondary;
          ctx.fillText(`🛰 ${_truncate(st.name, 14)}`, x + PAD + stIndent, iy + 14);
          this._clickTargets.push({ type: 'station', stationId: st.id, systemId: sysId, x, y: iy, w: OUTLINER_W, h: ITEM_H });
          dy += ITEM_H;
        };
        const stConsumed = new Set();
        for (const col of sysCols) {
          const iy = startY + dy;
          const icon = col.isHomePlanet ? '🏛' : '🏙';
          const mapIconX = x + OUTLINER_W - PAD - 12;
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = this._hoverKey === `colony:${col.planetId}` ? THEME.textPrimary : THEME.mint;
          ctx.fillText('🗺', mapIconX, iy + 14);
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textPrimary;
          ctx.fillText(`${icon} ${_truncate(col.name, 16)}`, x + PAD + 8, iy + 14);
          this._clickTargets.push({ type: 'colony', planetId: col.planetId, colony: col, x, y: iy, w: OUTLINER_W, h: ITEM_H, mapIconX });
          dy += ITEM_H;
          for (const st of sysStations) {
            if (stConsumed.has(st.id)) continue;
            if (st.ownerColonyId === col.planetId || st.bodyId === col.planetId) { stConsumed.add(st.id); drawStationRow(st, 16); }
          }
        }
        for (const st of sysStations) if (!stConsumed.has(st.id)) drawStationRow(st, 8);
      }
      return Math.max(ITEM_H, dy);
    });

    // ── EKSPEDYCJE ───────────────────────────────────────
    cy = this._drawSection(ctx, x, cy, 'expeditions', t('outliner.expeditions', expeditions.length), (startY) => {
      if (expeditions.length === 0) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(t('outliner.noMissions'), x + PAD, startY + 14);
        return ITEM_H;
      }
      let dy = 0;
      for (const exp of expeditions.slice(0, 6)) {
        const iy = startY + dy;
        const icon = exp.type === 'colony' ? '🚢' : exp.type === 'transport' ? '📦' : exp.type === 'recon' ? '🔭' : '⛏';
        const arrow = exp.status === 'returning' ? '↩' : exp.status === 'orbiting' ? '⊙' : '→';
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = exp.status === 'returning' ? THEME.mint : exp.status === 'orbiting' ? THEME.warning : THEME.textPrimary;
        ctx.fillText(`${icon}${arrow}${_truncate(exp.targetName ?? '?', 8)}`, x + PAD, iy + 14);
        const eta = exp.status === 'returning' ? `↩${_shortYear(exp.returnYear ?? 0)}`
          : exp.status === 'orbiting' ? t('outliner.orbiting') : `${_shortYear(exp.arrivalYear ?? 0)}`;
        ctx.fillStyle = THEME.textLabel;
        ctx.textAlign = 'right';
        ctx.fillText(eta, x + OUTLINER_W - PAD, iy + 14);
        ctx.textAlign = 'left';
        this._clickTargets.push({ type: 'expedition', targetId: exp.targetId, x, y: iy, w: OUTLINER_W, h: ITEM_H });
        dy += ITEM_H;
      }
      return dy;
    });

    // ── KOLEJKA ─────────────────────────────────────────────
    const queueItems = this._buildQueueItems(state ?? {}) ?? [];
    if (queueItems.length > 0) {
      cy = this._drawSection(ctx, x, cy, 'queue', t('outliner.queue', queueItems.length), (startY) => {
        let dy = 0;
        const maxShow = 8;
        for (const item of queueItems.slice(0, maxShow)) {
          const iy = startY + dy;
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = item.blocked ? THEME.warning : THEME.textSecondary;
          ctx.fillText(`${item.icon} ${_truncate(item.name, 12)}`, x + PAD, iy + 12);
          const cancelBtnW = 14;
          const cancelBtnX = x + OUTLINER_W - cancelBtnW;
          const rightEdge = item.cancelData ? (cancelBtnX - 2) : (x + OUTLINER_W - PAD);
          if (item.progress != null && item.total != null && item.total > 0) {
            const frac = Math.min(1, item.progress / item.total);
            const barW = 36, barX = rightEdge - barW, barY = iy + 3, barH = 4;
            ctx.fillStyle = THEME.bgTertiary;
            ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = item.blocked ? THEME.warning : THEME.borderActive;
            ctx.fillRect(barX, barY, Math.round(barW * frac), barH);
            ctx.strokeStyle = THEME.border;
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barW, barH);
            ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
            ctx.fillStyle = THEME.textDim;
            ctx.textAlign = 'right';
            ctx.fillText(`${Math.floor(frac * 100)}%`, rightEdge, iy + 14);
            ctx.textAlign = 'left';
          } else if (item.qtyLabel) {
            ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
            ctx.fillStyle = THEME.textDim;
            ctx.textAlign = 'right';
            ctx.fillText(item.qtyLabel, rightEdge, iy + 12);
            ctx.textAlign = 'left';
          } else {
            ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
            ctx.fillStyle = THEME.warning;
            ctx.textAlign = 'right';
            ctx.fillText('⌛', rightEdge, iy + 12);
            ctx.textAlign = 'left';
          }
          if (item.cancelData) {
            ctx.font = `bold ${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
            ctx.fillStyle = THEME.danger ?? '#ff3344';
            ctx.textAlign = 'center';
            ctx.fillText('✕', cancelBtnX + cancelBtnW / 2, iy + 13);
            ctx.textAlign = 'left';
            this._clickTargets.push({ type: 'queueCancel', cancelData: item.cancelData, x: cancelBtnX, y: iy, w: cancelBtnW, h: ITEM_H });
          }
          let extraH = 0;
          if (item.missingTooltip) {
            extraH = 12;
            ctx.font = `${THEME.fontSizeSmall - 3}px ${THEME.fontFamily}`;
            ctx.fillStyle = THEME.warning;
            ctx.fillText(`  ${_truncate(item.missingTooltip, 28)}`, x + PAD, iy + ITEM_H + 2);
          }
          this._clickTargets.push({ type: 'queueItem', queueType: item.queueType, x, y: iy, w: OUTLINER_W - (item.cancelData ? cancelBtnW : 0), h: ITEM_H + extraH });
          dy += ITEM_H + extraH;
        }
        if (queueItems.length > maxShow) {
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textDim;
          ctx.fillText(`  (+${queueItems.length - maxShow} ${t('outliner.queueMore')})`, x + PAD, startY + dy + 12);
          dy += 16;
        }
        return Math.max(ITEM_H, dy);
      });
    }

    // ── JEDNOSTKI NAZIEMNE ─────────────────────────────────
    const groundUnits = state?.groundUnits ?? [];
    cy = this._drawSection(ctx, x, cy, 'groundUnits', t('outliner.groundUnits', groundUnits.length), (startY) => {
      if (groundUnits.length === 0) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(t('outliner.noGroundUnits'), x + PAD, startY + 14);
        return ITEM_H;
      }
      let dy = 0;
      const colMgrOut = window.KOSMOS?.colonyManager;
      const groups = groupGroundUnitsByBody(groundUnits, {
        isOwnBody: (pid) => { const c = colMgrOut?.getColony?.(pid); return !!c && isPlayerColony(c); },
      });
      for (const grp of groups) {
        const hy = startY + dy;
        const isHovBody = this._hoverKey === `groundBody:${grp.planetId}`;
        if (isHovBody) { ctx.fillStyle = THEME.accentDim; ctx.fillRect(x, hy, OUTLINER_W, SECTION_HDR_H - 2); }
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = isHovBody ? THEME.textPrimary : THEME.textLabel;
        ctx.fillText(`${_truncate(grp.planetName, 17)} (${grp.units.length})`, x + PAD, hy + 12);
        this._clickTargets.push({ type: 'groundBody', planetId: grp.planetId, x, y: hy, w: OUTLINER_W, h: SECTION_HDR_H - 2 });
        dy += SECTION_HDR_H - 2;
        for (const unit of grp.units) {
          const iy = startY + dy;
          const icon = ARCHETYPE_ICONS[unit.type] ?? GROUND_UNITS[unit.type]?.icon ?? '🪖';
          const statusIco = unit.status === 'moving' ? '→' : unit.status === 'scanning' ? '🔍' : unit.status === 'working' ? '⚙' : '';
          const isHov = this._hoverKey === `groundUnit:${unit.id}`;
          if (isHov) { ctx.fillStyle = THEME.accentDim; ctx.fillRect(x, iy, OUTLINER_W, ITEM_H); }
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillStyle = isHov ? THEME.textPrimary : THEME.textSecondary;
          ctx.fillText(`${icon} ${statusIco}${_truncate(t(`groundUnit.${unit.type}`), 15)}`, x + PAD, iy + 14);
          this._clickTargets.push({ type: 'groundUnit', unitId: unit.id, planetId: unit.planetId, x, y: iy, w: OUTLINER_W, h: ITEM_H });
          dy += ITEM_H;
        }
      }
      return Math.max(ITEM_H, dy);
    });
    return cy - y0;
  }

  // Sekcja z nagłówkiem (zwijalna) — DO U3-3.
  _drawSection(ctx, x, startY, sectionId, title, drawContent) {
    let cy = startY;
    const open = this._sections[sectionId];
    ctx.fillStyle = THEME.accentDim ?? 'rgba(0,255,180,0.07)';
    ctx.fillRect(x, cy, OUTLINER_W, SECTION_HDR_H);
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, cy + SECTION_HDR_H); ctx.lineTo(x + OUTLINER_W, cy + SECTION_HDR_H); ctx.stroke();
    ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'left';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
    ctx.fillText(`${open ? '▼' : '►'} ${String(title).toUpperCase()}`, x + PAD, cy + SECTION_HDR_H / 2 + 3);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    this._clickTargets.push({ type: 'section', sectionId, x, y: cy, w: OUTLINER_W, h: SECTION_HDR_H });
    cy += SECTION_HDR_H;
    if (open) cy += drawContent.call(this, cy) + 4;
    return cy;
  }

  // Trafienia sekcji sprzed U3 — DO U3-3.
  _onLegacyHit(z, x, y, K) {
    if (z.type === 'section') { this._sections[z.sectionId] = !this._sections[z.sectionId]; this._markDirty(); return; }
    if (z.type === 'colony') {
      const colMgr = K?.colonyManager;
      const colony = colMgr?.getColony(z.planetId);
      if (!colony?.planet) return;
      if (z.mapIconX && x >= z.mapIconX) {
        // Ikona 🗺 → otwórz kolonię (aktywna kolonia się zmienia — jak dotąd).
        if (colMgr) colMgr.switchActiveColony(z.planetId);
        K?.overlayManager?.openPanel('colony');
      } else {
        // ARKUSZ UI U1-3 (D-UI-5): nazwa = ciało kolonii przez regułę; wiersz NIE zmienia aktywnej kolonii (§7.10).
        const body = EntityManager.get(z.planetId) ?? colony.planet;
        clickObject({ ...bodyTarget(body), systemId: colony.systemId ?? 'sys_home' }, this._env(K));
      }
      return;
    }
    if (z.type === 'station') {
      clickObject(stationTarget(z.stationId, null, z.systemId ?? 'sys_home'), this._env(K));
      return;
    }
    if (z.type === 'expedition') { if (z.targetId) EventBus.emit('camera:focusTarget', { targetId: z.targetId }); return; }
    if (z.type === 'queueCancel') { this._cancelQueueItem(z.cancelData); return; }
    if (z.type === 'queueItem') {
      const om = K?.overlayManager;
      if (z.queueType === 'building') om?.openPanel('colony');
      else if (z.queueType === 'ship' || z.queueType === 'outpost') om?.openPanel('fleet');
      else if (z.queueType === 'factory') om?.openPanel('economy');
      return;
    }
    if (z.type === 'groundUnit' || z.type === 'groundBody') {
      // Mapa TEGO ciała (`openPanel('colony', { colonyId })` — droga powrotna desantu); własna kolonia — także HUD.
      const colMgr = K?.colonyManager;
      const col = colMgr?.getColony?.(z.planetId);
      if (col && isPlayerColony(col)) colMgr.switchActiveColony(z.planetId);
      K?.overlayManager?.openPanel('colony', { colonyId: z.planetId });
      if (z.unitId) EventBus.emit('groundUnit:select', { unitId: z.unitId });
    }
  }

  // Anulowanie elementu kolejki — DO U3-3.
  _cancelQueueItem(cancelData) {
    try {
      const colMgr = window.KOSMOS?.colonyManager;
      const activePid = colMgr?.activePlanetId;
      const activeCol = activePid ? colMgr.getColony(activePid) : null;
      switch (cancelData.type) {
        case 'construction': {
          const bSys = activeCol?.buildingSystem ?? window.KOSMOS?.buildingSystem;
          if (bSys && cancelData.tileKey) bSys.cancelConstruction(cancelData.tileKey);
          break;
        }
        case 'pendingBuild': {
          const bSys = activeCol?.buildingSystem ?? window.KOSMOS?.buildingSystem;
          if (bSys && cancelData.tileKey) bSys.cancelPending(cancelData.tileKey);
          break;
        }
        case 'pendingShip':
          if (colMgr && activePid && cancelData.orderId) colMgr.cancelPendingShip(activePid, cancelData.orderId);
          break;
        case 'pendingOutpost':
          if (colMgr && activePid && cancelData.orderId) colMgr.cancelPendingOutpostOrder(activePid, cancelData.orderId);
          break;
        case 'factoryQueue': {
          const fSys = activeCol?.factorySystem ?? window.KOSMOS?.factorySystem;
          if (fSys && cancelData.index != null) fSys.dequeue(cancelData.index);
          break;
        }
      }
    } catch (e) {
      console.warn('[Outliner] cancel error:', e);
    }
  }

  // Elementy kolejki aktywnej kolonii — DO U3-3.
  _buildQueueItems(state) {
    const items = [];
    try {
      const { constructionQueue, pendingBuilds, pendingShipOrders, pendingOutpostOrders, factoryQueue } = state;
      if (constructionQueue) {
        for (const entry of constructionQueue) {
          const bDef = BUILDINGS[entry.buildingId];
          const bName = bDef ? getName(bDef, 'building') : entry.buildingId;
          items.push({ queueType: 'building', icon: bDef?.icon ?? '🏗', name: entry.isUpgrade ? `${bName} →Lv${entry.targetLevel}` : bName,
            progress: entry.progress, total: entry.buildTime, blocked: false, cancelData: { type: 'construction', tileKey: entry.tileKey } });
        }
      }
      if (pendingBuilds) {
        for (const order of pendingBuilds) {
          const bDef = BUILDINGS[order.buildingId];
          const bName = bDef ? getName(bDef, 'building') : order.buildingId;
          items.push({ queueType: 'building', icon: bDef?.icon ?? '🏗', name: order.isUpgrade ? `${bName} →Lv${order.targetLevel}` : bName,
            progress: null, total: null, blocked: true, cancelData: { type: 'pendingBuild', tileKey: order.tileKey } });
        }
      }
      if (pendingShipOrders) {
        for (const order of pendingShipOrders) {
          const sDef = SHIPS[order.shipId] ?? HULLS[order.shipId];
          items.push({ queueType: 'ship', icon: sDef?.icon ?? '🚀', name: sDef ? getName(sDef, 'ship') : order.shipId,
            progress: null, total: null, blocked: true, cancelData: { type: 'pendingShip', orderId: order.id } });
        }
      }
      if (pendingOutpostOrders) {
        for (const order of pendingOutpostOrders) {
          const bDef = BUILDINGS[order.buildingId];
          const bName = bDef ? getName(bDef, 'building') : order.buildingId;
          let totalNeeded = 0, totalHave = 0;
          const missing = [];
          const inv = state.inventory ?? {};
          for (const [resId, need] of Object.entries(order.cost ?? {})) {
            if (need <= 0) continue;
            const have = inv[resId] ?? 0;
            totalNeeded += need;
            totalHave += Math.min(have, need);
            if (have < need) {
              const cDef = COMMODITIES[resId] ?? ALL_RESOURCES[resId];
              missing.push(`${cDef ? getName(cDef, 'commodity') : resId}: ${Math.floor(have)}/${need}`);
            }
          }
          items.push({ queueType: 'outpost', icon: '🏕', name: bName, progress: totalNeeded > 0 ? Math.floor((totalHave / totalNeeded) * 100) : 0,
            total: 100, blocked: true, missingTooltip: missing.length > 0 ? missing.join(', ') : null,
            cancelData: { type: 'pendingOutpost', orderId: order.id } });
        }
      }
      for (const a of (state.factoryAllocations ?? [])) {
        const cDef = COMMODITIES[a.commodityId];
        const produced = a.produced ?? 0;
        items.push({ queueType: 'factory', icon: cDef?.icon ?? '🏭', name: cDef ? getName(cDef, 'commodity') : a.commodityId,
          progress: a.pctComplete != null ? a.pctComplete : null, total: 100, blocked: a.paused ?? false,
          qtyLabel: a.targetQty ? `${produced}/${a.targetQty}` : `${produced}` });
      }
      if (factoryQueue) {
        for (let qi = 0; qi < factoryQueue.length; qi++) {
          const q = factoryQueue[qi];
          const cDef = COMMODITIES[q.commodityId];
          items.push({ queueType: 'factory', icon: cDef?.icon ?? '🏭', name: cDef ? getName(cDef, 'commodity') : q.commodityId,
            progress: null, total: null, blocked: false, qtyLabel: `⏳×${q.qty}`, cancelData: { type: 'factoryQueue', index: qi } });
        }
      }
    } catch (e) {
      console.warn('[Outliner] _buildQueueItems error:', e);
    }
    return items;
  }

  // Podpowiedź kolonii (POP, prosperity, zasoby, budynki) — DO U3-3 (wtedy przechodzi do lewego, obserwacja D).
  _buildColonyTooltip(colony) {
    if (!colony) return null;
    const lines = [];
    lines.push({ text: `${colony.isHomePlanet ? '🏛' : '🏙'} ${colony.name}`, header: true });
    const planet = colony.planet;
    if (planet) {
      const tempC = planet.temperatureC != null ? Math.round(planet.temperatureC) : (planet.temperatureK ? Math.round(planet.temperatureK - 273) : null);
      lines.push({ text: `${planet.planetType ?? planet.type} ${tempC !== null ? `${tempC > 0 ? '+' : ''}${tempC}°C` : ''}`, color: THEME.textDim });
    }
    const cSys = colony.civSystem;
    if (cSys) {
      const pop = cSys.population ?? 0;
      const dPop = cSys.displayPopulation ?? 0;
      const dPopStr = dPop >= 1_000_000 ? `${(dPop / 1_000_000).toFixed(1)}M` : dPop >= 1_000 ? `${(dPop / 1_000).toFixed(0)}k` : `${dPop}`;
      const housing = cSys.effectiveHousing ?? 0;
      const prosp = Math.round(colony.prosperitySystem?.prosperity ?? 50);
      lines.push({ text: `👤 ${dPopStr} (${pop}/${housing === Infinity ? '∞' : housing} POP)  ⭐${prosp}`, color: THEME.textSecondary });
      const epoch = colony.prosperitySystem?._getCurrentEpoch?.()?.key ?? 'early';
      lines.push({ text: t('outliner.epoch', t(`epoch.${epoch}`)), color: THEME.textSecondary });
    }
    const rSys = colony.resourceSystem;
    if (rSys?.inventory) {
      const segments = [];
      for (const [k, v] of rSys.inventory.entries()) {
        if (v <= 0) continue;
        const resDef = ALL_RESOURCES[k];
        segments.push({ label: `${resDef?.icon ?? COMMODITIES[k]?.icon ?? ''}${k}:${Math.floor(v)}`, color: resDef?.color ?? THEME.yellow });
      }
      for (let i = 0; i < segments.length; i += 4) lines.push({ segments: segments.slice(i, i + 4) });
    }
    const bSys = colony.buildingSystem;
    if (bSys && bSys._active.size > 0) {
      const bList = [];
      bSys._active.forEach((entry) => {
        const lvl = entry.level ?? 1;
        bList.push(`${entry.building.icon ?? '🏗'}${getName(entry.building, 'building')}${lvl > 1 ? ` Lv${lvl}` : ''}`);
      });
      for (let i = 0; i < bList.length; i += 3) lines.push({ text: bList.slice(i, i + 3).join(', '), color: THEME.textDim });
    }
    return lines;
  }

  // Szerokość zasłonięta przez kolumnę od prawej krawędzi (globus kolonii) — DO U3-3: kolumna jest ukryta przy
  // otwartym overlayu (decyzja 4), więc pod kolonią zwraca 0.
  getCoveredWidth() {
    return this.isShown() ? OUTLINER_COLUMN_W : 0;
  }
}

// ── DO U3-3: stałe i pomocniki sekcji sprzed U3 ─────────────────────────────────────────────────────────────────────
const OUTLINER_W    = COSMIC.OUTLINER_W;
const SECTION_HDR_H = 18;
const ITEM_H        = 18;

function _truncate(str, maxLen) {
  if (!str) return '';
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + '…';
}

function _shortYear(y) {
  if (y >= 1e9)  return (y / 1e9).toFixed(1) + 'G';
  if (y >= 1e6)  return (y / 1e6).toFixed(1) + 'M';
  if (y >= 1000) return (y / 1000).toFixed(0) + 'k';
  return String(Math.floor(y));
}
