// HudGalaxyRailLayer — ARC GALAXY, krok G2-2 (docs/design/GALAXY_PLAN.md §4 G2; rama F5 — „ship blips sit on a rail beside the
// star like label stacks; they must never steal the star's click”): podwarstwa SZYNY STATKÓW i BLIPÓW skoku warp na płycie.
//   • SZYNA: własne statki z napędem warp (zbiór Stratcomu — `GalaxyChromeLogic.galaxyShipRail`) stojące w układzie — wiersze
//     obok gwiazdy, na prawo od kwadratu wyboru gwiazdy (`railLayout`, niezmiennik Findingu 110: wiersz nigdy nie leży na
//     kwadracie wyboru), kafelkowane w dół; ponad `RAIL_MAX_ROWS` — „+N” bez strefy kliku; gwiazda poza kadrem — bez wierszy
//     i bez stref; klik wiersza = klik wiersza prawego outlinera (reguła D-UI-5: 1. zaznaczenie + panel statku, 2. — kamera);
//   • ZNACZNIKI STATKÓW (G2 / T5, idiom SM-1 mapy układu — `GalaxyShipMarkerLogic` + `HudShipMarkerLogic`): pusty romb przy
//     gwieździe z własnymi statkami (bez strefy kliku — gwiazda zachowuje klik), pusty daszek 1 px w kierunku podróży dla
//     statku w skoku warp (punkt tranzytu, z — interpolacja między układami), klik daszka = jak wiersz; FLOTA (≥ 2 członków
//     na jednym przeskoku) = jeden znacznik + „×N”; rola z relacji (własny / obcy / wróg); G5-C (Finding 605) — flota ZAPARKOWANA
//     przy gwieździe: romb + „⛬ ×N” (glif węzła floty prawego outlinera, zaznaczona flota pogrubiona), luźne statki — „+N” jak dotąd;
//   • OBCY w skoku warp w zasięgu obserwatorium od domu (kanon Stratcomu, D-GX-22): wywiad o statku `contact` / `detailed` —
//     znacznik w roli z relacji (linię skoku rysuje `HudGalaxyRouteLayer`), inaczej duch „?” (bez linii i bez nazwy);
//   • gwiazda pod kursorem wygrywa z wierszem szyny (strefa HUD — weto `galaxyStarAt`), przeszkody dla nazw płyty
//     (`labelObstacles`); krycie × rozjaśnienie chromu trybu galaktyki;
//   • ARC GALAXY G3 — GĘSTOŚĆ: domyślnie znacznik bez nazw, „+N” od dwóch statków bez wiersza (samotny statek — sam
//     znacznik, `RAIL_PLUS_MIN`); wiersze z nazwami ma gwiazda najechana
//     (`hoverObjectKey`), zaznaczona i ta, nad której wierszem stoi kursor (bez tego wiersz znikałby po zejściu kursora z gwiazdy), a także
//     statek zaznaczony; chip [O] „Okręty” (klawisz 9) włącza nazwy wszędzie (`railVisibleShips`);
//   • ARC GALAXY G3 — CTRL+klik wiersza przełącza statek w zbiorze zaznaczonych (`Outliner._onHit`) i wygrywa z gwiazdą sąsiada pod
//     kursorem: przy CTRL zamiarem jest statek;
//   • G5-C (Finding 608) — szyna USTĘPUJE rozwinięciu gwiazdy (najechanie, przypięcie; zgłasza je warstwa nazw — `yieldToExpansions`):
//     wiersze po lewej stronie, a gdy obie strony są zajęte — pod rozwinięciem (`railPlacement`); nigdy pod nim. Szyna SĄSIEDNIEJ gwiazdy,
//     którą cudze rozwinięcie przykrywa, chowa się (rozwinięcie wygrywa — decyzja właściciela po bramce G5-C).
// ⚠ Moduł importuje się pod node (keeper — atrapa świata): bez three i bez DOM.
import { THEME } from '../config/ThemeConfig.js';
import { getLocale } from '../i18n/i18n.js';
import { HUD_LABELS, pointInRect, resolveLabelClick } from './HudLabelLogic.js';
import { GALAXY_K, GALAXY_FADE_MS, GALAXY_PICK_HALF_PX, plateWorldOf } from './GalaxyModeLogic.js';
import { GALAXY_CHROME, galaxyShipRail, galaxyEnemyBlips, railPlacement, railVisibleShips, galaxyChromeAlpha } from './GalaxyChromeLogic.js';
import { readHudLayers } from './HudLayerChipsLogic.js';
import { FLEET_NODE_GLYPH } from './ShipTreeLogic.js';
import { observatoryRangeLY } from '../utils/ObservatoryRange.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { areAtWar } from '../utils/WarGate.js';
import {
  shipMarkerSpec, makeRelationResolver, buildFleetIndex, groupTransitByFleet, fleetTag, tagAnchor,
  markerHitRect, markerObstacle, foreignDrawKind, anySelected, unitDir, groupParkedByFleet,
} from './GalaxyShipMarkerLogic.js';

// Rysunek (px logiczne). Strojenie okiem — bez pinów keepera.
// Znaczniki statków (T5) mają geometrię i grubość z SM-1 (`HudShipMarkerLogic` przez `GalaxyShipMarkerLogic`) — tu zostaje
// tylko duch „?” obcej plotki i rząd szyny.
export const HUD_GALAXY_RAIL = Object.freeze({
  ROW_PAD_X: 3,
  GHOST_R: 3.5,        // duch „?” — promień
  PLUS_ALPHA: 0.8,     // „+N” (G3: główny nośnik liczby statków — rola `primary`; `dim` jest na płycie nieczytelna)
});

const q = (v) => Math.round(v * 10);

export class HudGalaxyRailLayer {
  constructor(hud = null) {
    this._hud = hud;
    this.mode = 'galaxy';
    this._prep = { on: false };
    this._zones = [];          // [{ x, y, w, h, vesselId }]
    this._obstacles = [];
    this._last = { rows: [], plus: [], transit: [], enemies: [], parked: [] };
    this._measure = new Map();
  }

  _width(font, size, s) {
    const k = font + '|' + s;
    const hit = this._measure.get(k);
    if (hit != null) return hit;
    const ctx = this._hud?.ctx ?? null;
    let w = null;
    if (ctx?.measureText) { ctx.font = font; if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'; w = ctx.measureText(s)?.width; }
    if (!Number.isFinite(w)) w = s.length * size * 0.6;
    if (this._measure.size > 400) this._measure.clear();
    this._measure.set(k, w);
    return w;
  }

  // Finding 605: napisy flot zaparkowanych przy rombie — od kotwicy „×N” (`tagAnchor`) w prawo, jeden za drugim (font jak „×N” tranzytu).
  _parkedTags(fleets, rect) {
    const size = THEME.fontSizeTiny ?? 8;
    const out = [];
    let { x, y } = tagAnchor(rect);
    for (const f of fleets) {
      const font = `${f.selected ? 'bold ' : ''}${size}px ${THEME.fontFamily}`;
      const text = `${FLEET_NODE_GLYPH} ${fleetTag(f.count)}`;
      const w = this._width(font, size, text);
      out.push({ text, fleetId: f.fleetId, selected: f.selected, font, x, y, w, h: size + 2 });
      x += w + 4;
    }
    return out;
  }

  prepare(F) {
    const K = F.K, gm = K?.galaxyMode, tr = K?.threeRenderer;
    if (gm?.isActive !== true || typeof tr?.getGalaxyStarsWorld !== 'function' || typeof tr?.getGalaxyAnchorLy !== 'function') {
      this._prep = { on: false };
      return 'gs:0';
    }
    const systems = K.galaxyData?.systems ?? [];
    const vessels = K.vesselManager?.getAllVessels?.() ?? [];
    const rail = galaxyShipRail({ vessels, systems });
    const home = systems.find((s) => s?.isHome === true) ?? { x: 0, y: 0 };
    const rangeLY = observatoryRangeLY(K.observatorySystem?.getMaxObservatoryLevel?.() ?? 0);
    const enemies = galaxyEnemyBlips({ vessels, systems, home, rangeLY,
      qualityOf: (id) => K.intelSystem?.getVesselContact?.(id)?.quality ?? 'unknown' });
    const sel = F.sel ?? {};
    const selIds = new Set((sel.vesselIds ?? []).map(String));
    if (sel.leadId != null) selIds.add(String(sel.leadId));
    const anchor = tr.getGalaxyAnchorLy();
    const loc = getLocale();
    // Znaczniki (T5): relacja z dyplomacji, flota z `FleetSystem` (jedno źródło agregacji z podwarstwą tras).
    const relationOf = makeRelationResolver({
      isEnemy: isEnemyVessel,
      atWar: (id) => areAtWar('player', id),
      hostileBand: (id) => K.diplomacySystem?.getOpinionBand?.(id) === 'hostile',
    });
    const fleetIdx = buildFleetIndex(K.fleetSystem?.listFleets?.() ?? [], vessels);
    const groups = groupTransitByFleet(rail.transit, (id) => fleetIdx.get(String(id)) ?? null, selIds);
    // Gęstość (G3): chip [O] — nazwy wszędzie; inaczej gwiazda najechana, zaznaczona i ta z wierszem pod kursorem.
    const openAll = readHudLayers(K.uiPrefs).ships === true;
    const hoverKey = this._hud?.hoverObjectKey?.() ?? null;
    const ptr = F.pointer;
    const openStars = new Set();
    if (typeof hoverKey === 'string' && hoverKey.startsWith('galaxy:')) openStars.add(hoverKey.slice(7));
    if (gm.selectedSystemId != null) openStars.add(String(gm.selectedSystemId));
    const rowZone = ptr && !ptr.overUI ? this._zoneAt(ptr.lx, ptr.ly) : null;
    if (rowZone?.systemId != null) openStars.add(String(rowZone.systemId));
    // Finding 605: flota zaparkowana przy gwieździe — członkostwo i zaznaczona flota wchodzą do klucza (napis „⛬ ×N” przy rombie).
    const fleetOf = (id) => fleetIdx.get(String(id)) ?? null;
    const selFleetId = sel.fleetId ?? null;
    let key = `gs:2:${q(anchor.x)},${q(anchor.y)},${q(anchor.z)}:${loc}:F${selFleetId ?? ''}`;
    for (const [sid, list] of rail.bySystem) key += `|${sid}${openAll || openStars.has(sid) ? 'o' : ''}:${list.map((v) => `${v.id}${selIds.has(String(v.id)) ? '*' : ''}@${fleetOf(v.id) ?? ''}`).join(',')}`;
    for (const g of groups) key += `|t${g.key}x${g.count}:${q(g.gx)},${q(g.gy)}${g.selected ? '*' : ''}`;
    for (const b of enemies) key += `|e${b.v.id}:${b.mode}:${relationOf(b.v)}:${q(b.gx)},${q(b.gy)}`;
    this._prep = { on: true, rail, enemies, groups, relationOf, selIds, anchor, loc, openAll, openStars, fleetOf, selFleetId,
      rowSid: rowZone?.systemId != null ? String(rowZone.systemId) : null };
    return key;
  }

  collect(F, proj) {
    const P = this._prep;
    if (!P.on || !proj) {
      this._zones = []; this._obstacles = []; this._last = { rows: [], plus: [], transit: [], enemies: [], parked: [] };
      this._part = null; this._rails = []; this._expansions = []; this._expSig = '';
      return { count: 0, animating: false };
    }
    const K = F.K, tr = K.threeRenderer, map = F.mapRect, R = HUD_LABELS, G = HUD_GALAXY_RAIL;
    const stars = new Map(tr.getGalaxyStarsWorld().map((s) => [String(s.id), s]));
    const size = THEME.fontSizeSmall ?? 9;
    const font = `${size}px ${THEME.fontFamily}`;
    const rowH = size + 3 + 2;
    const rows = [], plus = [], transit = [], enemies = [], parked = [], zones = [], obstacles = [], rails = [];
    for (const [sid, list] of P.rail.bySystem) {
      const st = stars.get(sid);
      const p = st ? proj.point(st.x, st.y, st.z) : null;
      if (!p || !pointInRect(p.x, p.y, map)) continue;   // gwiazda poza kadrem — bez wierszy i bez stref (cull)
      // Statki przy gwieździe (T5): jeden pusty romb nad kwadratem wyboru gwiazdy; bez strefy kliku — gwiazda zachowuje klik.
      // Finding 605: członkowie floty — napis „⛬ ×N” przy rombie (zaznaczona flota pogrubia romb i swój napis); luźne — „+N” jak dotąd.
      const pf = groupParkedByFleet(list, P.fleetOf, P.selFleetId);
      const pSel = anySelected(list, P.selIds) || pf.fleets.some((f) => f.selected);
      const pspec = shipMarkerSpec({ motion: 'parked', relation: 'own', selected: pSel, cx: p.x, cy: p.y });
      const tags = this._parkedTags(pf.fleets, pspec.geo.rect);
      parked.push({ x: p.x, y: p.y, spec: pspec, count: list.length, tags, selected: pSel });
      obstacles.push(markerObstacle(pspec.geo.rect));
      for (const tg of tags) obstacles.push({ x: tg.x, y: tg.y - tg.h / 2, w: tg.w, h: tg.h });
      const visible = railVisibleShips(list, { open: P.openAll || P.openStars.has(sid), selIds: P.selIds });
      const texts = visible.map((v) => String(v.name ?? v.id).toLocaleLowerCase(P.loc));
      const dims = texts.map((s) => ({ w: this._width(font, size, s) + 2 * G.ROW_PAD_X, h: rowH }));
      const hiddenLoose = pf.loose.filter((v) => !visible.includes(v)).length;
      const plusText = `+${hiddenLoose + Math.max(0, visible.length - GALAXY_CHROME.RAIL_MAX_ROWS)}`;
      rails.push({ sid, ax: p.x, ay: p.y, dims, visible, texts, font, size, rowH, plusText, hiddenLoose,
        plusW: this._width(font, size, plusText) + 2 * G.ROW_PAD_X });
    }
    // Wiersze i „+N” (Finding 608): ustępują rozwinięciom gwiazd z ostatniego zgłoszenia warstwy nazw (`yieldToExpansions`).
    this._rails = rails;
    const railOut = this._layRails(P.rowSid);
    rows.push(...railOut.rows); plus.push(...railOut.plus); zones.push(...railOut.zones);
    const worldOf = (gx, gy, gz) => plateWorldOf({ x: gx, y: gy, z: gz }, P.anchor, GALAXY_K);
    // Kierunek podróży = ekranowy wektor ku układowi celu skoku (brak układu → w prawo, jak dotąd).
    const dirToStar = (p, toId) => {
      const to = stars.get(String(toId)), tp = to ? proj.point(to.x, to.y, to.z) : null;
      return tp ? unitDir({ x: tp.x - p.x, y: tp.y - p.y }) : { x: 1, y: 0 };
    };
    // Własne statki w skoku (T5): znacznik SM-1; flota (≥ 2 na jednym przeskoku) = JEDEN znacznik + „×N”. Rola `primary`
    // (szyna zna wyłącznie własne statki z napędem warp).
    for (const g of P.groups) {
      const w = worldOf(g.gx, g.gy, g.gz);
      const p = proj.point(w.x, w.y, w.z);
      if (!p || !pointInRect(p.x, p.y, map)) continue;
      const spec = shipMarkerSpec({ motion: 'transit', relation: 'own', selected: g.selected, cx: p.x, cy: p.y, dir: dirToStar(p, g.toId) });
      transit.push({ x: p.x, y: p.y, spec, count: g.count, fleet: g.fleet, vesselId: g.leadId, selected: g.selected,
        tag: g.fleet ? { text: fleetTag(g.count), ...tagAnchor(spec.geo.rect) } : null });
      const hz = markerHitRect(spec.geo.rect);
      zones.push({ ...hz, vesselId: g.leadId });
      obstacles.push(markerObstacle(spec.geo.rect));
    }
    // Obcy w skoku (kanon mgły `foreignDrawKind`): kontakt = znacznik w roli z relacji, plotka = duch „?”.
    for (const b of P.enemies) {
      const kind = foreignDrawKind(b.mode);
      if (!kind) continue;
      const w = worldOf(b.gx, b.gy, b.gz);
      const p = proj.point(w.x, w.y, w.z);
      if (!p || !pointInRect(p.x, p.y, map)) continue;
      if (kind === 'marker') {
        const spec = shipMarkerSpec({ motion: 'transit', relation: P.relationOf(b.v), cx: p.x, cy: p.y, dir: dirToStar(p, b.toId) });
        enemies.push({ x: p.x, y: p.y, mode: b.mode, spec });
        obstacles.push(markerObstacle(spec.geo.rect));
      } else {
        enemies.push({ x: p.x, y: p.y, mode: b.mode, spec: null });
        obstacles.push({ cx: p.x, cy: p.y, r: G.GHOST_R + 1 });
      }
    }
    this._fixedZones = zones.slice(railOut.zones.length);
    this._fixedObstacles = obstacles;
    this._zones = zones;
    this._obstacles = [...obstacles, ...railOut.obstacles];
    const alpha = galaxyChromeAlpha({ flightAlpha: tr?._galaxyChromeAlpha, now: F.now, fadeT0: tr?._galaxyFadeT0, fadeMs: GALAXY_FADE_MS });
    this._last = { rows, plus, transit, enemies, parked };
    this._part = { count: rows.length + plus.length + transit.length + enemies.length + parked.length, animating: alpha < 1,
      rows, plus, transit, enemies, parked, alpha };
    return this._part;
  }

  // Finding 608: wiersze i „+N” każdej gwiazdy wg `railPlacement`. Gwiazda, nad której wierszem stoi kursor, trzyma przeszkody z poprzedniego
  // ułożenia — wiersz nie ucieka spod kursora, gdy rozwinięcie gaśnie po zejściu z gwiazdy.
  _layRails(rowSid) {
    const rows = [], plus = [], zones = [], obstacles = [], used = new Map();
    // Najpierw gwiazdy z własnym rozwinięciem (ich wiersze stają tuż pod nim); wiersze zepchnięte pod rozwinięcie są przeszkodą dla kolejnych.
    const own = new Set((this._expansions ?? []).map((e) => e.id).filter((id) => id != null).map(String));
    const order = [...(this._rails ?? [])].sort((a, b) => (own.has(b.sid) ? 1 : 0) - (own.has(a.sid) ? 1 : 0));
    const below = [];
    for (const st of order) {
      const blockers = (rowSid === st.sid && this._used?.has(st.sid)) ? this._used.get(st.sid) : [...(this._expansions ?? []), ...below];
      used.set(st.sid, blockers);
      // Szyna gwiazdy bez własnego rozwinięcia, przykryta cudzym rozwinięciem (albo wierszami zepchniętymi pod nie), chowa się — rozwinięcie wygrywa.
      const lay = railPlacement({ ax: st.ax, ay: st.ay, rows: st.dims, pickHalf: GALAXY_PICK_HALF_PX, plusW: st.plusW,
        hidden: st.hiddenLoose, rowH: st.rowH, plusMin: GALAXY_CHROME.RAIL_PLUS_MIN, blockers,
        hide: !blockers.some((b) => b?.id != null && String(b.id) === st.sid) });   // własne rozwinięcie wśród przeszkód (także trzymanych pod kursorem)
      if (lay.side === 'below') below.push(...lay.rows, ...(lay.plus ? [lay.plus] : []));
      lay.rows.forEach((r) => {
        const v = st.visible[r.index];
        rows.push({ ...r, side: lay.side, vesselId: v.id, text: st.texts[r.index], selected: this._prep.selIds?.has(String(v.id)) === true,
          font: st.font, size: st.size, sx: st.ax, sy: st.ay });
        zones.push({ x: r.x, y: r.y, w: r.w, h: r.h, vesselId: v.id, systemId: st.sid });
        obstacles.push({ x: r.x, y: r.y, w: r.w, h: r.h });
      });
      if (lay.plus) {
        plus.push({ ...lay.plus, side: lay.side, text: st.plusText, font: st.font, size: st.size });   // „+N” — bez strefy kliku
        obstacles.push({ x: lay.plus.x, y: lay.plus.y, w: lay.plus.w, h: lay.plus.h });
      }
    }
    this._used = used;
    return { rows, plus, zones, obstacles };
  }

  /**
   * Finding 608 — warstwa nazw zgłasza rozwinięcia gwiazd z TEJ klatki (po swoim ułożeniu): szyna układa się na nowo przed rysunkiem,
   * a przy zmianie budzi następną klatkę, żeby nazwy płyty ominęły już przesunięte wiersze.
   * @param {Array<{x,y,w,h}>} rects
   * @returns {boolean} czy ułożenie się zmieniło
   */
  yieldToExpansions(rects) {
    const list = (rects ?? []).filter(Boolean).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, id: r.id ?? null }));
    const sig = list.map((r) => `${r.id ?? ''}:${q(r.x)},${q(r.y)},${q(r.w)},${q(r.h)}`).join('|');
    if (sig === this._expSig) return false;
    this._expSig = sig;
    this._expansions = list;
    if (!this._part || !this._prep.on) return false;
    const before = this._part.rows.map((r) => `${q(r.x)},${q(r.y)}`).join('|') + '#' + this._part.plus.map((r) => `${q(r.x)},${q(r.y)}`).join('|');
    const out = this._layRails(this._prep.rowSid);
    this._part.rows = out.rows; this._part.plus = out.plus;
    this._last.rows = out.rows; this._last.plus = out.plus;
    this._zones = [...out.zones, ...(this._fixedZones ?? [])];
    this._obstacles = [...(this._fixedObstacles ?? []), ...out.obstacles];
    const after = out.rows.map((r) => `${q(r.x)},${q(r.y)}`).join('|') + '#' + out.plus.map((r) => `${q(r.x)},${q(r.y)}`).join('|');
    if (after !== before) this._hud?.wake?.();
    return after !== before;
  }

  draw(ctx, F, c) {
    const roles = F.roles, R = HUD_LABELS, G = HUD_GALAXY_RAIL;
    const a = c.alpha ?? 1;
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // Szyna: kreska od krawędzi kwadratu wyboru gwiazdy do pierwszego wiersza, pasek i tekst wiersza (idiom etykiet).
    for (const r of c.rows ?? []) {
      ctx.globalAlpha = (r.selected ? R.BAR_ALPHA_SELECTED : R.BAR_ALPHA) * a;
      ctx.fillStyle = THEME.bgPrimary;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      // Kreska od kwadratu wyboru do pierwszego wiersza — po stronie szyny; pod rozwinięciem bez kreski (Finding 608).
      if (r.index === 0 && r.side !== 'below') {
        const left = r.side === 'left';
        ctx.strokeStyle = roles.primary;
        ctx.globalAlpha = R.THREAD_ALPHA * a;
        ctx.lineWidth = R.THREAD_WIDTH;
        ctx.beginPath(); ctx.moveTo(r.sx + (left ? -1 : 1) * GALAXY_PICK_HALF_PX * 0.55, r.sy); ctx.lineTo(left ? r.x + r.w : r.x, r.sy); ctx.stroke();
      }
      ctx.font = r.selected ? `bold ${r.font}` : r.font;
      ctx.fillStyle = roles.primary;
      ctx.globalAlpha = (r.selected ? 1 : 0.9) * a;
      ctx.fillText(r.text, r.x + G.ROW_PAD_X, r.y + r.h - 3);
    }
    for (const pl of c.plus ?? []) {
      ctx.globalAlpha = R.BAR_ALPHA * a;
      ctx.fillStyle = THEME.bgPrimary;
      ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
      ctx.font = pl.font;
      // G3: „+N” niesie liczbę statków, więc musi być czytelny.
      ctx.fillStyle = roles.primary;
      ctx.globalAlpha = G.PLUS_ALPHA * a;
      ctx.fillText(pl.text, pl.x + G.ROW_PAD_X, pl.y + pl.h - 3);
    }
    // Statki przy gwieździe — pusty romb (SM-1); w tranzycie warp — pusty daszek w kierunku podróży; flota — jeden
    // znacznik + „×N” (zaznaczony członek pogrubia cały znacznik).
    for (const p of c.parked ?? []) {
      this._strokeMarker(ctx, p.spec, roles, a);
      // Finding 605: flota zaparkowana — „⛬ ×N”; zaznaczona flota — napis pogrubiony i pełny.
      for (const tg of p.tags ?? []) {
        ctx.font = tg.font;
        ctx.fillStyle = roles[p.spec.role];
        ctx.globalAlpha = tg.selected ? a : Math.min(1, p.spec.alpha * a + 0.15);
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(tg.text, tg.x, tg.y);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
    }
    for (const t of c.transit ?? []) {
      this._strokeMarker(ctx, t.spec, roles, a);
      if (t.tag) {
        ctx.font = `${THEME.fontSizeTiny ?? 8}px ${THEME.fontFamily}`;
        ctx.fillStyle = roles[t.spec.role];
        ctx.globalAlpha = Math.min(1, t.spec.alpha * a + 0.15);
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(t.tag.text, t.tag.x, t.tag.y);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
    }
    // Obcy w skoku warp: kontakt — znacznik w roli z relacji (obcy `foreign` / wróg `alert`); plotka — duch „?”.
    for (const e of c.enemies ?? []) {
      ctx.globalAlpha = a;
      if (e.spec) {
        this._strokeMarker(ctx, e.spec, roles, a);
      } else {
        ctx.strokeStyle = roles.foreign;
        ctx.globalAlpha = 0.5 * a;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(e.x, e.y, G.GHOST_R, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = roles.foreign;
        ctx.globalAlpha = 0.75 * a;
        ctx.font = `bold ${THEME.fontSizeTiny ?? 8}px ${THEME.fontFamily}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', e.x, e.y + 0.5);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Znacznik SM-1: kreska 1 px (zaznaczony — grubsza) po łamanej z geometrii; kolor z roli, krycie z `markerAlpha`. */
  _strokeMarker(ctx, spec, roles, a) {
    const pts = spec.geo.pts;
    ctx.setLineDash([]);
    ctx.lineJoin = 'miter';
    ctx.lineWidth = spec.width;
    ctx.strokeStyle = roles[spec.role];
    ctx.globalAlpha = spec.alpha * a;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    if (spec.geo.closed) ctx.closePath();
    ctx.stroke();
  }

  /** Przeszkody nazw płyty: wiersze szyny, „+N”, znaczniki statków (tranzyt, romby), blipy obcych (ostatnia klatka). */
  labelObstacles() { return this._obstacles; }

  _zoneAt(x, y) { return resolveLabelClick(this._zones, x, y); }

  /**
   * Klik wiersza szyny / daszka tranzytu = klik wiersza prawego outlinera (CTRL — przełączenie w zbiorze, `Outliner._onHit`); gwiazda pod
   * kursorem wygrywa (Finding 110), chyba że przy CTRL (G3): tam zamiarem jest statek, a wiersz leży na kwadracie SĄSIADA, nie swojej gwiazdy.
   */
  handleClick(x, y, rawX, rawY) {
    const z = this._zoneAt(x, y);
    if (!z) return false;
    const K = (typeof window !== 'undefined') ? window.KOSMOS : null;
    const ro = K?.rightOutliner ?? K?.uiManager?._outliner ?? null;
    const ctrl = ro?._lastMouseMods?.ctrl === true;
    if (!ctrl && K?.threeRenderer?.galaxyStarAt?.(rawX, rawY) != null) return false;
    if (ro?._onHit) ro._onHit({ type: 'vessel', vesselId: z.vesselId }, x, y, K);
    else K?.uiManager?.setSelectedVesselId?.(z.vesselId);
    return true;
  }

  coversPoint(lx, ly) { return !!this._zoneAt(lx, ly); }
  coversUiPoint(lx, ly) { return !!this._zoneAt(lx, ly); }

  debug() {
    const r1 = (v) => (Number.isFinite(v) ? +v.toFixed(1) : v);
    const L = this._last;
    return { id: 'galaxyRail', on: this._prep.on,
      rows: L.rows.map((r) => ({ vesselId: r.vesselId, text: r.text, x: r1(r.x), y: r1(r.y), w: r1(r.w), h: r1(r.h), sx: r1(r.sx), sy: r1(r.sy), side: r.side })),
      plus: L.plus.map((p) => ({ text: p.text, x: r1(p.x), y: r1(p.y) })), transit: L.transit.length,
      markers: [...(L.parked ?? []).map((p) => ({ kind: p.spec.kind, role: p.spec.role, n: p.count,
        tag: (p.tags ?? []).map((tg) => tg.text).join(' ') || null, sel: p.selected === true,
        tagSel: (p.tags ?? []).filter((tg) => tg.selected).map((tg) => tg.text) })),
        ...L.transit.map((t) => ({ kind: t.spec.kind, role: t.spec.role, n: t.count, tag: t.tag?.text ?? null, sel: t.selected }))],
      enemies: L.enemies.map((e) => e.mode), zones: this._zones.length };
  }
}
