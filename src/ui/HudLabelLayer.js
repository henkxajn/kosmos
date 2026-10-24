// HudLabelLayer — ARKUSZ HUD H2 (D-HUD-5, D-HUD-6, D-HUD-12, D-HUD-16; HUD_PLAN.md §4.3): podwarstwa ETYKIET warstwy HUD 2D
// (`HudLayer`). Logika — czysty `HudLabelLogic`; tu: odczyt świata (`F.K` = `window.KOSMOS`), rzut wspólnym projektorem,
// pomiar tekstu, rysunek Canvas 2D w px logicznych i strefy kliku.
//   • za flagą `FEATURES.hudLabels` (brak klucza = OFF; przy OFF podwarstwa pusta, a plakietki `MapLabelLayer` — jak dziś);
//   • encje jak dziś: kolonie i stacje GRACZA, floty i statki gracza, wrogowie wg mgły wojny (`gatherVesselLabels` — te same
//     bramki wywiadu: `unknown` pomijany, `rumor` anonimowy „?”); statek bez widocznego sprite'a — bez etykiety (485);
//   • tekst na półprzezroczystym ciemnym pasku bez ramki (`THEME.bgPrimary`, 0,72 zaznaczony / 0,55 reszta), podkreślenie =
//     początek nitki do obiektu; kolonie WERSALIKAMI z odstępem liter, statki małymi literami, zaznaczony jedyny pogrubiony;
//     druga linia z danymi tylko dla zaznaczonego i najechanego (hover MAPY — picker statku tylko widocznych, 485; tarcza ciała
//     pod kursorem — raycast renderera; własny hover etykiety); cyfry w stałej kratce (D-HUD-6);
//   • stos planeta + księżyce + stacje (`stationGroupOf`) — LOD po średnicy tarczy kotwicy: „NOWA ZIEMIA +2” / szyna /
//     każdy przy swoim obiekcie;
//   • anti-overlap wszystkich etykiet + kadr obszaru mapy (`MapInsets`, 514); przeszkody: tarcze ciał, odczyt zasięgu radaru
//     (525), glify skoku warp, strzałki krawędzi, karty obiektów i ramki zaznaczenia statków (`fcBrackets` — rysowane NAD
//     warstwą HUD); strzałki krawędzi dla statków poza kadrem — zawsze, bez wczesnego wyjścia (497);
//   • fade-in 150 ms czasu realnego (działa w pauzie); poprzedni wybór miejsca wygrywa — bez skoków przy ruchu kamery;
//   • klik (D-UI-5, `clickObject`) — wołany z `UIManager.handleClick` PO karcie ciała (515); punkt na tarczy ciała wygrywa
//     (487, 503); zwinięta etykieta zaznacza kotwicę; kolory WYŁĄCZNIE z ról motywu (`F.roles`).
// ⚠ Moduł importuje się pod node (keeper `hud_labels_smoke` — atrapa ctx): bez three i bez DOM.
import EventBus from '../core/EventBus.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { THEME } from '../config/ThemeConfig.js';
import { t, getLocale } from '../i18n/i18n.js';
import { getPrimaryRole, isEnemyVessel } from '../entities/Vessel.js';
import { stationGroupAnchorId } from '../utils/StationGroup.js';
import { systemIdOf } from '../utils/SystemScope.js';
import { vesselDetectionRangeAU } from '../utils/DetectionRange.js';
import { fmtDec, fmtInt } from './NumberFormatLogic.js';
import { gatherVesselLabels, stationStatusBadges, BADGE_ICON, edgeIndicators } from './MapLabelLogic.js';
import { clusterScreenPoints } from './FleetPictureLogic.js';
import { clickObject, vesselsTarget } from './ClickIntentLogic.js';
import { colonyRadarRangeAU, readoutCenter } from './HudRadarLogic.js';
import {
  HUD_LABELS, LABEL_PRIO, isHudLabelsOn, stackLOD, atLeastLOD, collapsedText, groupByAnchor, placeLabels,
  threadGeometry, railRows, railBlockSize, resolveLabelClick, layoutTabular, truncateText, updateBorn, fadeAlpha,
  pointInRect,
} from './HudLabelLogic.js';

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;
const q = (v) => Math.round(v * 1000);          // klucz klatki — położenie z dokładnością 0,001 j.
const MEASURE_CACHE_MAX = 600;
const SUB_TTL_MS = 250;          // [ms czasu realnego] druga linia statku — zasięgi zmienia tylko technologia

export class HudLabelLayer {
  constructor(hud = null) {
    this._hud = hud;
    this._prep = { on: false };
    this._prev = new Map();          // klucz etykiety → indeks kandydata (bez skoków)
    this._born = new Map();          // klucz etykiety → chwila pojawienia się (fade-in, czas realny)
    this._prevOwn = new Map();       // histereza klastrów statków własnych (`clusterScreenPoints`)
    this._prevEnemy = new Map();     // … i wrogich (stron nie sklejamy)
    this._zones = [];                // strefy kliku z ostatniej narysowanej klatki: { x, y, w, h, key, target, kind }
    this._last = null;               // ostatnio zebrane (odczyt bramki)
    this._measure = new Map();       // pomiar tekstu: `font|tekst` → szerokość
    this._lineCache = new Map();     // gotowe linie (układ z kratką cyfr): `font|odstęp|ucięcie|tekst` → linia
    this._subCache = new Map();      // druga linia statku: id → { t (czas realny), text } (zasięgi zmienia tylko technologia)
    this._ptsCache = null;           // stan statków do etykiet (`gatherVesselLabels`): { key, t, points } — `SUB_TTL_MS`
    this._fontStatus = null;         // `document.fonts.status` — zmiana czyści pamięć pomiaru (font doładowany po pomiarze)
  }

  // ── Pomiar tekstu (ctx warstwy; atrapa bez `measureText` — przybliżenie z rozmiaru fontu) ──────────────────────────
  _width(font, size, s) {
    const k = font + '|' + s;
    const hit = this._measure.get(k);
    if (hit != null) return hit;
    const ctx = this._hud?.ctx ?? null;
    let w = null;
    if (ctx?.measureText) {
      ctx.font = font;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      w = ctx.measureText(s)?.width;
    }
    if (!Number.isFinite(w)) w = s.length * size * 0.6;
    if (this._measure.size > MEASURE_CACHE_MAX) this._measure.clear();
    this._measure.set(k, w);
    return w;
  }

  _cell(font, size) {
    let m = 0;
    for (let d = 0; d <= 9; d++) m = Math.max(m, this._width(font, size, String(d)));
    return m;
  }

  /** Czy cyfry fontu mają równą szerokość (różnica < 0,01 px). */
  _uniformDigits(font, size) {
    let lo = Infinity, hi = 0;
    for (let d = 0; d <= 9; d++) { const w = this._width(font, size, String(d)); lo = Math.min(lo, w); hi = Math.max(hi, w); }
    return hi - lo < 0.01;
  }

  /** Linia tekstu: font, odstęp liter, układ z kratką cyfr (ucięty do `MAX_NAME_PX`, gdy `maxW`). Wynik zapamiętany po
   *  (font, odstęp, ucięcie, tekst) — treść etykiet nie zależy od kamery, a przy obrocie każda klatka jest przerysowaniem
   *  (pomiar i układ kosztowały ~40 % `collect`). Obiekt linii tylko do odczytu. */
  _line(text, { size, bold = false, spacing = 0, maxW = null }) {
    const font = `${bold ? 'bold ' : ''}${size}px ${THEME.fontFamily}`;
    const key = `${font}|${spacing}|${maxW ?? ''}|${text}`;
    const hit = this._lineCache.get(key);
    if (hit) return hit;
    const cell = this._cell(font, size);
    const measure = (s) => this._width(font, size, s);
    const width = (s) => layoutTabular(s, { measure, cell, spacing }).w;
    const s = maxW ? truncateText(text, maxW, width) : String(text ?? '');
    const lay = layoutTabular(s, { measure, cell, spacing });
    // Font z cyframi równej szerokości (np. Share Tech Mono): kratka = szerokość cyfry — linia jednym `fillText` (ten sam
    // układ, mniej wywołań); font proporcjonalny (np. Rajdhani) — cyfra po cyfrze w kratce (D-HUD-6).
    const segs = this._uniformDigits(font, size) ? [{ s, x: 0, w: lay.w, digit: false }] : lay.segs;
    const ln = { text: s, font, size, spacing, cell, w: lay.w, segs, h: size + 3 };
    if (this._lineCache.size > MEASURE_CACHE_MAX) this._lineCache.clear();
    this._lineCache.set(key, ln);
    return ln;
  }

  // ── Najechanie (D-HUD-5: hover MAPY — `F.hover` warstwy, picker statku tylko widocznych; + własny hover etykiety;
  //    hover outlinera nie) ─────────────────────────────────────────────────────────────────────────────────────────
  _hoverState(F) {
    const ptr = F.pointer ?? null;
    if (!ptr || ptr.overUI) return { bodyId: null, vesselId: null, labelKey: null };
    const z = resolveLabelClick(this._zones, ptr.lx, ptr.ly);
    const h = F.hover ?? {};
    return { bodyId: h.bodyId ?? null, vesselId: h.vesselId ?? null, labelKey: z?.key ?? null };
  }

  /** Część klucza klatki: flaga, kolonie i stacje gracza w scenie (położenie, treść), statki z etykietami, zaznaczenie,
   *  najechanie, tryb Y, język. */
  prepare(F) {
    const on = isHudLabelsOn(F.features);
    if (!on) { this._prep = { on: false }; this._zones = []; return 'l:0'; }
    // Font doładowany po pierwszym pomiarze (ekran ładowania) — pomiary i linie liczone od nowa, klatka przerysowana (klucz).
    const fontStatus = (typeof document !== 'undefined' && document.fonts?.status) || 'loaded';
    if (fontStatus !== this._fontStatus) { this._fontStatus = fontStatus; this._measure.clear(); this._lineCache.clear(); }
    const K = F.K, tr = K.threeRenderer, cm = K.colonyManager, ss = K.stationSystem, vm = K.vesselManager, em = K.entityManager;
    const sel = F.sel, sys = F.activeSystemId;
    const homeId = K.homePlanet?.id ?? null;
    const hover = this._hoverState(F);
    const bodies = [];
    for (const col of cm?.getPlayerColonies?.() ?? []) {
      const pid = col.planetId ?? col.planet?.id;
      if (!pid) continue;
      const w = tr?.getBodyWorldInfo?.(pid);
      if (!w) continue;                                        // nie w scenie (inny układ)
      const body = em?.get?.(pid) ?? col.planet ?? null;
      bodies.push({ key: 'c:' + pid, kind: 'colony', id: pid, body, anchorId: stationGroupAnchorId(body) ?? pid, world: w,
        name: body?.name ?? col.planet?.name ?? col.name ?? String(pid), home: pid === homeId, outpost: col.isOutpost === true,
        pop: col.isOutpost === true ? null : Math.round(col.civSystem?.population ?? 0),
        free: col.isOutpost === true ? null : Math.floor(col.civSystem?.freePops ?? 0), colony: col });
    }
    for (const st of ss?.getAllStations?.() ?? []) {
      if ((st.ownerEmpireId ?? 'player') !== 'player') continue;
      const w = tr?.getBodyWorldInfo?.(st.id);
      if (!w) continue;
      const body = em?.get?.(st.bodyId) ?? null;
      bodies.push({ key: 's:' + st.id, kind: 'station', id: st.id, body, anchorId: stationGroupAnchorId(body) ?? String(st.id),
        world: { x: w.x, y: w.y, z: w.z, r: 0 }, name: st.name ?? String(st.id), pop: st.pop ?? 0, cap: st.popCapacity ?? 0,
        badges: stationStatusBadges(st) });
    }
    // Kotwice grup (≥ 2 etykiety) — tarcza planety do LOD.
    const counts = new Map();
    for (const b of bodies) counts.set(b.anchorId, (counts.get(b.anchorId) ?? 0) + 1);
    const anchors = new Map();
    for (const [a, n] of counts) if (n >= 2) { const w = tr?.getBodyWorldInfo?.(a); if (w) anchors.set(a, w); }
    // Statki (D-HUD-5: jak dziś) — punkty w świecie (x, z), wysokość osobno; rzut w `collect`.
    const dscs = K.deepSpaceCombatSystem;
    const pictureCtx = {
      gameYear: K.timeSystem?.gameTime ?? 0,
      fleetSystem: K.fleetSystem ?? null,
      combatCheck: dscs?._findActiveEncounterContaining ? (id) => !!dscs._findActiveEncounterContaining(id) : null,
      isImmobilized: vm?.isImmobilized ? (v) => vm.isImmobilized(v) : null,
    };
    const vworld = new Map();
    const intel = K.intelSystem;
    // Tylko statki oglądanego układu (koszt: `buildShipEntry` dla każdego statku) — ten sam filtr robi `gatherVesselLabels`.
    const local = (vm?.getAllVessels?.() ?? []).filter((v) => v && systemIdOf(v) === sys);
    // Statek bez widocznego sprite'a (mgła wojny, czysty widok) — bez etykiety (485); położenie sprite'a co klatkę.
    const visibleWorld = (id) => {
      const e = tr?._vessels?.get?.(id);
      if (!e?.sprite || e.sprite.visible === false) return null;
      return tr.getVesselWorldInfo?.(id) ?? tr.getVesselWorldPosition?.(id) ?? null;
    };
    const points = [];
    if (K.uiPrefs?.fleetMapLabelsVisible !== false) {
      // Stan statków do etykiet (nazwa, flota, alerty, aktywność, mgła wojny) — `buildShipEntry` dla każdego statku jest drogi,
      // a treść zmienia się rzadko: pamięć na `SUB_TTL_MS` czasu realnego przy tym samym zbiorze statków, zaznaczeniu, języku
      // i trybie Y; widoczność i położenie — co klatkę.
      const ckey = `${sys}|${F.tactical ? 1 : 0}|${getLocale()}|${(sel.vesselIds ?? []).join(',')}|${local.map((v) => v.id).join(',')}`;
      const c = this._ptsCache;
      let all;
      if (c && c.key === ckey && F.now - c.t >= 0 && F.now - c.t < SUB_TTL_MS) all = c.points;
      else {
        all = gatherVesselLabels(local, {
          getScreenPos: (id) => (tr?._vessels?.get?.(id)?.sprite ? { x: 0, y: 0 } : null),   // położenie liczone co klatkę niżej
          pictureCtx,
          enemyQuality: (id) => intel?.getVesselContact?.(id)?.quality ?? 'unknown',
          activeSystemId: sys,
          selectedIds: new Set(sel.vesselIds ?? []),
        });
        this._ptsCache = { key: ckey, t: F.now, points: all };
      }
      for (const p of all) { const w = visibleWorld(p.id); if (w) { vworld.set(p.id, w); points.push(p); } }
    }
    let key = `l:1:${fontStatus}:${F.tactical ? 1 : 0}:${getLocale()}:${sel.stationId ?? ''}:${hover.bodyId ?? ''}:${hover.vesselId ?? ''}:${hover.labelKey ?? ''}`;
    for (const b of bodies) key += `|${b.key}:${q(b.world.x)},${q(b.world.y)},${q(b.world.z)}:${b.name}:${b.pop ?? ''}:${b.free ?? ''}:${b.cap ?? ''}:${(b.badges ?? []).join('')}`;
    for (const [a, w] of anchors) key += `|a${a}:${q(w.r ?? 0)}`;
    for (const r of this._cardRects(K)) key += `|k${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}`;
    for (const p of points) { const w = vworld.get(p.id); key += `|v${p.id}:${w ? `${q(w.x)},${q(w.y)},${q(w.z)}` : ''}:${p.name}:${p.fleetId ?? ''}:${p.alertCount}:${p.activityKey ?? ''}:${p.etaYear != null ? Math.round(p.etaYear) : ''}`; }
    this._prep = { on: true, bodies, anchors, points, vworld, hover, homeId };
    return key;
  }

  // Treść drugiej linii (dane) — kolonia: „pop POP · N wolne · ✦ stolica · wykr. X AU” (zasięg wykrycia — ta sama reguła co
  // okrąg radaru H1, `colonyRadarRangeAU`; ∞ — obserwatorium bez granicy; placówka — sam zasięg, gdy jest);
  // stacja: „pop/pojemność POP” + plakietki statusu; statek: „typ · wykr. X AU · lock Y AU”; wróg (≥ contact): typ.
  _subColony(b, F) {
    const loc = getLocale();
    const parts = [];
    if (!b.outpost && b.pop != null) {
      parts.push(t('hudLabel.pop', fmtInt(b.pop, loc)), t('hudLabel.free', fmtInt(b.free ?? 0, loc)));
      if (b.home) parts.push(t('hudLabel.capital'));
    }
    const r = colonyRadarRangeAU(b.colony, F.K.observatorySystem);
    if (r === Infinity) parts.push(t('hudLabel.detect', '∞'));
    else if (r > 0) parts.push(t('hudLabel.detect', `${fmtDec(r, 1, loc)} AU`));
    return parts.length ? parts.join(' · ') : null;
  }

  _subStation(b) {
    const badges = (b.badges ?? []).map((x) => BADGE_ICON[x] ?? '').join('');
    return t('hudLabel.stationPop', fmtInt(b.pop, getLocale()), fmtInt(b.cap, getLocale())) + (badges ? '  ' + badges : '');
  }

  _subVesselCached(id, F) {
    const loc = getLocale();
    const c = this._subCache.get(id);
    if (c && c.loc === loc && F.now - c.t >= 0 && F.now - c.t < SUB_TTL_MS) return c.text;
    const text = this._subVessel(F.K.vesselManager?.getVessel?.(id), F.K);
    if (this._subCache.size > 200) this._subCache.clear();
    this._subCache.set(id, { t: F.now, loc, text });
    return text;
  }

  _subVessel(v, K) {
    if (!v) return null;
    const loc = getLocale();
    const role = t(`fleetPicture.role.${getPrimaryRole(v)}`);
    if (isEnemyVessel(v)) return role;
    const det = vesselDetectionRangeAU(v, { vesselManager: K.vesselManager, techSystem: K.techSystem });
    // Sensor-lock: ta sama funkcja co detekcja par (`ProximitySystem._getSensorLockAU`); bez systemu — wzór stały × tech.
    const lock = K.proximitySystem?._getSensorLockAU?.(v)
      ?? (GAME_CONFIG.SENSOR_LOCK_AU ?? 0.3) * (K.techSystem?.getMultiplier?.('sensor_range') ?? 1);
    const au = (x) => `${fmtDec(x, 1, loc)} AU`;
    const parts = [role];
    if (det > 0 && Number.isFinite(det)) parts.push(t('hudLabel.detect', au(det)));
    if (lock > 0 && Number.isFinite(lock)) parts.push(t('hudLabel.lock', au(lock)));
    return parts.join(' · ');
  }

  // Etykieta (jedna albo blok szyny): linie, wymiary.
  _labelBox(lines) {
    const R = HUD_LABELS;
    let w = 0, h = R.PAD_Y * 2;
    lines.forEach((ln, i) => { w = Math.max(w, ln.w); h += ln.h + (i > 0 ? R.LINE_GAP : 0); });
    return { w: w + R.PAD_X * 2, h };
  }

  _bodyLines(b, { selected, sub, collapsedOthers = 0 }, F) {
    const R = HUD_LABELS;
    const size = (THEME.fontSizeNormal ?? 11) + R.MAIN_SIZE_DELTA;
    const subSize = THEME.fontSizeSmall ?? 9;
    const loc = getLocale();
    const isColony = b.kind === 'colony';
    const name = isColony ? String(b.name).toLocaleUpperCase(loc) : String(b.name);
    const main = this._line(collapsedOthers > 0 ? collapsedText(name, collapsedOthers) : name,
      { size, bold: selected, spacing: isColony ? R.LETTER_SPACING_COLONY : 0, maxW: R.MAX_NAME_PX });
    const lines = [main];
    if (sub) {
      const text = b.kind === 'colony' ? this._subColony(b, F) : this._subStation(b);
      if (text) lines.push(this._line(text, { size: subSize, maxW: R.MAX_NAME_PX + 40 }));
    }
    return lines;
  }

  /** Geometria etykiet (px logiczne), rozkład, strefy kliku; `animating` — trwa fade-in. */
  collect(F, proj) {
    const P = this._prep;
    if (!P.on || !proj) { this._zones = []; this._last = null; return { count: 0, animating: false, labels: [], arrows: [] }; }
    const R = HUD_LABELS;
    const K = F.K, tr = K.threeRenderer, vm = K.vesselManager, em = K.entityManager;
    const sel = F.sel, map = F.mapRect, sys = F.activeSystemId, loc = getLocale();
    const wpa = proj.worldPerAU;
    const leadId = sel.leadId ?? (sel.vesselIds?.[0] ?? null);
    const discOf = (w) => {
      const p = proj.point(w.x, w.y, w.z);
      if (!p) return null;
      return { x: p.x, y: p.y, r: w.r > 0 ? w.r * proj.pxPerWorld(p.depth) : 0 };
    };
    // ── Przeszkody: tarcze (gwiazda, planety, księżyce), odczyt radaru (525), glify warp (route), strzałki krawędzi ──
    const obstacles = [];
    const discAt = new Map();
    const pushDisc = (id, w) => {
      if (!w || discAt.has(id)) return discAt.get(id) ?? null;
      const d = discOf(w);
      discAt.set(id, d);
      if (d && d.r >= R.DISC_OBSTACLE_MIN_PX) obstacles.push({ cx: d.x, cy: d.y, r: d.r, id });
      return d;
    };
    // Tarcze wszystkich planet i księżyców — z macierzy świata z OSTATNIEGO renderu (bez `updateWorldMatrix`, którą
    // `getBodyWorldInfo` woła dwa razy na ciało; obrót kamery nie rusza ciał w świecie, ruch orbitalny w klatce ~0).
    // Brak macierzy albo sfery geometrii — zapas: `getBodyWorldInfo`.
    const fastWorld = (obj, mesh) => {
      const m = obj?.matrixWorld?.elements, s = mesh?.matrixWorld?.elements, bs = mesh?.geometry?.boundingSphere;
      if (!m || !s || !bs) return null;
      const sc = Math.max(Math.hypot(s[0], s[1], s[2]), Math.hypot(s[4], s[5], s[6]), Math.hypot(s[8], s[9], s[10]));
      return { x: m[12], y: m[13], z: m[14], r: bs.radius * sc };
    };
    const star = em?.getByType?.('star')?.[0] ?? null;
    if (star) pushDisc(star.id, fastWorld(tr?._starGroup, tr?._starCore) ?? tr?.getBodyWorldInfo?.(star.id));
    for (const [id, e] of tr?._planets ?? []) pushDisc(id, fastWorld(e?.group, e?.mesh) ?? tr.getBodyWorldInfo(id));
    for (const [id, e] of tr?._moons ?? []) pushDisc(id, fastWorld(e?.mesh, e?.mesh) ?? tr.getBodyWorldInfo(id));
    for (const s of this._hud?._sublayers ?? []) {
      if (!s || s === this) continue;
      if (typeof s.labelObstacles === 'function') { for (const o of s.labelObstacles(F) ?? []) obstacles.push(o); continue; }
      // Radar (H1, bez zmian w jego kodzie): odczyt zasięgu z ostatniej klatki — ten sam font i środek co przy rysunku (525).
      if (!Array.isArray(s._last)) continue;
      for (const it of s._last) {
        if (!it?.readout?.text) continue;
        const rs = THEME.fontSizeSmall ?? 9;
        const rw = this._width(`${rs}px ${THEME.fontFamily}`, rs, it.readout.text);
        const rc = readoutCenter(it.readout, rw, rs);
        obstacles.push({ x: rc.x - rw / 2 - 2, y: rc.y - rs / 2 - 2, w: rw + 4, h: rs + 4 });
      }
    }
    // Karty obiektów (UI nad warstwą HUD — karta ciała, panel statku, panel stacji): etykiety ich unikają, żeby karta
    // zaznaczonego obiektu nie zakrywała jego etykiety (sama warstwa leży POD kartami — 515).
    for (const r of this._cardRects(K)) obstacles.push(r);
    // ── Ciała: grupy stosu i LOD ────────────────────────────────────────────────────────────────────────────────────
    const items = [];
    const pushItem = (it) => { items.push(it); };
    const isSelBody = (b) => (b.kind === 'colony' && sel.entityId != null && String(sel.entityId) === String(b.id))
      || (b.kind === 'station' && sel.stationId != null && String(sel.stationId) === String(b.id));
    const isHovBody = (b, key) => P.hover.labelKey === key || (b.kind === 'colony' && P.hover.bodyId != null && String(P.hover.bodyId) === String(b.id));
    const groups = groupByAnchor(P.bodies);
    for (const [anchorId, members] of groups) {
      const proj1 = members.map((b) => ({ b, d: pushDisc(b.id, b.world) ?? discOf(b.world) })).filter((x) => x.d && pointInRect(x.d.x, x.d.y, map));
      if (!proj1.length) continue;
      const aw = P.anchors.get(anchorId);
      const ad = aw ? (pushDisc(anchorId, aw) ?? discOf(aw)) : null;
      let state = stackLOD(ad ? 2 * ad.r : NaN, proj1.length);
      const selIdx = proj1.findIndex((x) => isSelBody(x.b));
      if (selIdx > 0) state = atLeastLOD(state, 'rail');           // zaznaczony członek inny niż kotwica — widoczny
      if (state === 'single' || state === 'spread') {
        for (const { b, d } of proj1) {
          const key = b.key, selected = isSelBody(b);
          const lines = this._bodyLines(b, { selected, sub: selected || isHovBody(b, key) }, F);
          const box = this._labelBox(lines);
          pushItem({ key, kind: b.kind, ax: d.x, ay: d.y, clear: d.r, w: box.w, h: box.h, lines, selected,
            role: 'primary', prio: selected ? LABEL_PRIO.selected : b.home ? LABEL_PRIO.home : b.kind === 'colony' ? LABEL_PRIO.colony : LABEL_PRIO.station,
            target: b.kind === 'colony' ? { type: 'body', id: b.id, entity: b.body, systemId: sys } : { type: 'station', id: b.id, systemId: sys } });
        }
        continue;
      }
      const anchorPt = ad && pointInRect(ad.x, ad.y, map) ? ad : proj1[0].d;
      const anchorEntity = em?.get?.(anchorId) ?? proj1[0].b.body;
      if (state === 'collapsed') {
        const head = proj1.find((x) => x.b.kind === 'colony' && x.b.id === anchorId) ?? proj1[0];
        const key = 'g:' + anchorId;
        const selected = isSelBody(head.b);
        const lines = this._bodyLines(head.b, { selected, sub: selected || isHovBody(head.b, key) || P.hover.labelKey === key, collapsedOthers: proj1.length - 1 }, F);
        const box = this._labelBox(lines);
        pushItem({ key, kind: 'group', ax: anchorPt.x, ay: anchorPt.y, clear: anchorPt.r ?? 0, w: box.w, h: box.h, lines, selected,
          role: 'primary', prio: selected ? LABEL_PRIO.selected : LABEL_PRIO.group, members: proj1.map((x) => x.b.key),
          target: { type: 'body', id: anchorId, entity: anchorEntity, systemId: sys } });
        continue;
      }
      // Szyna — blok wierszy (każdy wiersz z własną strefą kliku).
      const rows = proj1.map(({ b }) => {
        const rkey = b.key, selected = isSelBody(b);
        const lines = this._bodyLines(b, { selected, sub: selected || isHovBody(b, rkey) }, F);
        const box = this._labelBox(lines);
        return { key: rkey, kind: b.kind, w: box.w, h: box.h, lines, selected,
          target: b.kind === 'colony' ? { type: 'body', id: b.id, entity: b.body, systemId: sys } : { type: 'station', id: b.id, systemId: sys } };
      });
      const size = railBlockSize(rows);
      const anySel = rows.some((r) => r.selected);
      pushItem({ key: 'r:' + anchorId, kind: 'rail', ax: anchorPt.x, ay: anchorPt.y, clear: anchorPt.r ?? 0, w: size.w, h: size.h,
        rows, selected: anySel, role: 'primary', prio: anySel ? LABEL_PRIO.selected : LABEL_PRIO.group });
    }
    // ── Statki: w kadrze → klastry (jak dziś), poza kadrem → strzałki krawędzi (497 — zawsze) ──────────────────────────
    const onScreen = [], offScreen = [];
    for (const p of P.points) {
      const w = P.vworld.get(p.id);
      const sp = w ? proj.point(w.x, w.y, w.z) : null;
      if (!sp) continue;
      const pt = { ...p, x: sp.x, y: sp.y, r: (w.r > 0) ? w.r * proj.pxPerWorld(sp.depth) : 0 };
      if (pointInRect(pt.x, pt.y, map)) onScreen.push(pt); else offScreen.push(pt);
    }
    // Ramki zaznaczenia (`UIManager._drawBracketForVessel`, flaga `fcBrackets`) leżą NAD warstwą HUD — etykiety ich unikają,
    // a nitka zaznaczonego statku zaczyna się przy ramce (etykieta nie wchodzi pod narożniki ani pod paski zasobów).
    const bracketIds = new Set();
    if (F.features?.fcBrackets) {
      const selSet = new Set((sel.vesselIds ?? []).map(String));
      if (leadId != null) selSet.add(String(leadId));
      for (const p of onScreen) {
        if (p.kind !== 'own' || !selSet.has(String(p.id))) continue;
        bracketIds.add(String(p.id));
        const B = R.BRACKET_HALF + 2, isLead = leadId != null && String(p.id) === String(leadId);
        obstacles.push({ x: p.x - B, y: p.y - B, w: 2 * B, h: 2 * B + (isLead ? R.BRACKET_BARS : 0) });
      }
    }
    const ownClusters = clusterScreenPoints(onScreen.filter((p) => p.kind === 'own'), { prev: this._prevOwn });
    const enemyClusters = clusterScreenPoints(onScreen.filter((p) => p.kind === 'enemy'), { prev: this._prevEnemy });
    const subSize = THEME.fontSizeSmall ?? 9;
    const size = (THEME.fontSizeNormal ?? 11) + R.MAIN_SIZE_DELTA;
    const low = (s) => String(s ?? '').toLocaleLowerCase(loc);
    const vesselItem = (c, isEnemy) => {
      const single = c.items.length === 1;
      const lead = leadId != null ? c.items.find((p) => String(p.id) === String(leadId)) : null;
      const hov = c.items.find((p) => (P.hover.vesselId != null && String(p.id) === String(P.hover.vesselId))) ?? null;
      const ids = c.items.map((p) => p.id);
      const key = (isEnemy ? 'e:' : 'k:') + [...ids].map(String).sort().join(',');
      let text;
      if (isEnemy) {
        if (single) { const p = c.items[0]; text = `⚠ ${p.glyph ? p.glyph + ' ' : ''}${low(p.name)}`; }
        else text = `⚠ ×${c.items.length}`;
      } else if (single || lead) {
        const p = lead ?? c.items[0];
        text = `${p.glyph ? p.glyph + ' ' : ''}${low(p.name)}`;
        if (!single) text += ` +${c.items.length - 1}`;
        if (F.tactical && single && p.activityKey) {
          text += ` · ${low(t(p.activityKey))}`;
          if (Number.isFinite(p.etaYear)) text += ` · ${p.etaMoving ? '~' : '⏱'}${Math.round(p.etaYear)}`;
        }
      } else if (c.label === 'fleet') {
        text = `⚑ ${low(K.fleetSystem?.getFleet?.(c.fleetId)?.name ?? '')} ×${c.items.length}`;
      } else text = `◆ ×${c.items.length}`;
      const selected = !!lead;
      const subFor = lead ?? (hov ?? (P.hover.labelKey === key ? c.items[0] : null));
      const lines = [this._line(text, { size, bold: selected, maxW: R.MAX_NAME_PX })];
      if (subFor && (single || lead || subFor === hov)) {
        const isAnon = isEnemy && subFor.name === '?';
        const sub = isAnon ? null : this._subVesselCached(subFor.id, F);
        if (sub) lines.push(this._line(sub, { size: subSize, maxW: R.MAX_NAME_PX + 40 }));
      }
      const box = this._labelBox(lines);
      const ax = single ? c.items[0].x : c.x, ay = single ? c.items[0].y : c.y;
      const bracketClear = single && bracketIds.has(String(c.items[0].id)) ? R.BRACKET_HALF * Math.SQRT2 : 0;
      return { key, kind: isEnemy ? 'enemy' : 'vessel', ax, ay, clear: single ? Math.max(2, c.items[0].r, bracketClear) : 3, w: box.w, h: box.h, lines,
        selected, role: isEnemy ? 'foreign' : 'primary', prio: selected ? LABEL_PRIO.selected : isEnemy ? LABEL_PRIO.enemy : LABEL_PRIO.own,
        target: isEnemy ? { type: 'enemy', id: ids[0], systemId: sys } : vesselsTarget(ids, sys) };
    };
    for (const c of ownClusters) {
      const single = c.items.length === 1;
      const show = !single || c.label === 'fleet' || c.alertCount > 0 || c.items.some((p) => p.selected || (leadId != null && String(p.id) === String(leadId)))
        || F.tactical || (P.hover.vesselId != null && c.items.some((p) => String(p.id) === String(P.hover.vesselId)));
      if (show) pushItem(vesselItem(c, false));
    }
    for (const c of enemyClusters) pushItem(vesselItem(c, true));
    // Strzałki krawędzi — statki poza kadrem (zawsze, także bez żadnej etykiety w kadrze — 497); strony osobno (własne —
    // `primary`, wrogie — `foreign`), wróg w tym samym sektorze co własne — przesunięty wzdłuż krawędzi.
    const arrows = this._edgeArrows(offScreen, F, map);
    for (const a of arrows) {
      const s = R.ARROW_BOX;
      obstacles.push({ x: a.x - s / 2, y: a.y - s / 2, w: s, h: s });
    }
    // ── Rozkład (anti-overlap + kadr) ───────────────────────────────────────────────────────────────────────────────
    this._lastPlaceInput = { items, obstacles, rect: map };   // odczyt bramki / keepera (`debugPlacement`)
    const { placed } = placeLabels(items, { rect: map, obstacles, prev: this._prev });
    this._prev.clear();
    for (const p of placed) this._prev.set(p.key, p.cand);
    const fading = updateBorn(this._born, placed.map((p) => p.key), F.now);
    // Strefy kliku — prostokąty tekstu (wiersze szyny osobno), w kolejności rysowania.
    const zones = [];
    const drawList = [...placed].sort((a, b) => (b.prio - a.prio));    // zaznaczone rysowane ostatnie (na wierzchu)
    for (const p of drawList) {
      p.fade = fadeAlpha(F.now, this._born.get(p.key));
      if (p.kind === 'rail') {
        p.rail = railRows(p);
        for (const r of p.rail.rows) zones.push({ x: r.x, y: r.y, w: r.w, h: r.h, key: r.key, target: r.target, kind: r.kind });
      } else zones.push({ x: p.x, y: p.y, w: p.w, h: p.h, key: p.key, target: p.target, kind: p.kind });
    }
    this._zones = zones;
    this._last = { labels: drawList, arrows, obstacles };
    return { count: drawList.length + arrows.length, animating: fading, labels: drawList, arrows };
  }

  _cardRects(K) {
    const out = [];
    const um = K?.uiManager;
    const bc = um?._bottomContext?._cardRect;
    if (bc && um?._selectedEntity) out.push({ x: bc.x, y: bc.y, w: bc.w, h: bc.h });
    const vp = um?._fleetOverlay?._vesselPanelRect;
    if (vp && um?._mapSurface?.() === 'vessel') out.push({ x: vp.x, y: vp.y, w: vp.w, h: vp.h });
    const sp = K?.stationPanel;
    const sr = sp?._lastRect;
    if (sr && sp.visible && !sp._float?.minimized) out.push({ x: sr.px, y: sr.py, w: sr.PW, h: sr.PH });
    return out;
  }

  _edgeArrows(offScreen, F, map) {
    const ER = { x0: map.x, y0: map.y, x1: map.x + map.w, y1: map.y + map.h };
    const toPt = (p) => ({ x: p.x, y: p.y, tone: p.tone, alertCount: p.alertCount });
    // Role (strojenie 1, 2026-10-24): własne — `primary` (także z alertem: alert niesie etykieta i dzwonek, nie strzałka),
    // obce — `foreign`; kolor wyłącznie z ról motywu.
    const own = edgeIndicators(offScreen.filter((p) => p.kind !== 'enemy').map(toPt), F.W, F.H, { rect: ER })
      .map((a) => ({ ...a, role: 'primary' }));
    const foe = edgeIndicators(offScreen.filter((p) => p.kind === 'enemy').map(toPt), F.W, F.H, { rect: ER })
      .map((a) => ({ ...a, role: 'foreign' }));
    for (const a of foe) {
      if (!own.some((o) => o.edge === a.edge && Math.hypot(o.x - a.x, o.y - a.y) < HUD_LABELS.ARROW_BOX)) continue;
      const along = (a.edge === 'left' || a.edge === 'right') ? 'y' : 'x';
      const lo = along === 'y' ? ER.y0 + 26 : ER.x0 + 26, hi = along === 'y' ? ER.y1 - 26 : ER.x1 - 26;
      a[along] = a[along] + HUD_LABELS.ARROW_BOX <= hi ? a[along] + HUD_LABELS.ARROW_BOX : Math.max(lo, a[along] - HUD_LABELS.ARROW_BOX);
    }
    return [...own, ...foe];
  }

  // ── Rysunek ─────────────────────────────────────────────────────────────────────────────────────────────────────────
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

  _drawBox(ctx, box, lines, color, barAlpha, fade, alignRight = false) {
    const R = HUD_LABELS;
    ctx.globalAlpha = barAlpha * fade;
    ctx.fillStyle = THEME.bgPrimary;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    let y = box.y + R.PAD_Y;
    lines.forEach((ln, i) => {
      if (i > 0) y += R.LINE_GAP;
      const x = alignRight ? box.x + box.w - R.PAD_X - ln.w : box.x + R.PAD_X;
      this._drawLine(ctx, ln, x, y + ln.size, color, (i === 0 ? 1 : R.SUB_ALPHA) * fade);
      y += ln.h;
    });
  }

  draw(ctx, F, c) {
    const R = HUD_LABELS;
    const roles = F.roles;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.setLineDash([]);
    for (const p of c.labels) {
      const color = roles[p.role] ?? roles.primary;
      const fade = p.fade ?? 1;
      const th = threadGeometry(p);
      // Nitka do obiektu — przechodzi w podkreślenie pod tekstem.
      ctx.strokeStyle = color;
      ctx.lineWidth = R.THREAD_WIDTH;
      ctx.globalAlpha = R.THREAD_ALPHA * fade;
      ctx.beginPath();
      ctx.moveTo(th.x0, th.y0);
      ctx.lineTo(th.x1, th.y1);
      if (p.kind === 'rail') {
        // Szyna: pionowa linia od narożnika do najwyższego wiersza, kropki i podkreślenia wierszy.
        const rr = p.rail ?? railRows(p);
        const top = rr.rows.length ? rr.rows[0].lineY : p.y;
        ctx.moveTo(rr.railX, p.y + p.h);
        ctx.lineTo(rr.railX, top);
        for (const r of rr.rows) {
          ctx.moveTo(rr.railX, r.lineY);
          ctx.lineTo(p.side === 'E' ? r.x + r.w : r.x, r.lineY);
        }
        ctx.stroke();
        ctx.fillStyle = color;
        for (const r of rr.rows) { ctx.beginPath(); ctx.arc(rr.railX, r.lineY, R.RAIL_DOT_R, 0, Math.PI * 2); ctx.fill(); }
        for (const r of rr.rows) {
          this._drawBox(ctx, { x: r.x, y: r.y, w: r.w, h: r.h }, r.lines, color, r.selected ? R.BAR_ALPHA_SELECTED : R.BAR_ALPHA, fade, p.side === 'W');
        }
        continue;
      }
      const ux = p.side === 'E' ? p.x + p.w : p.x;
      ctx.moveTo(p.attach.x, p.attach.y);
      ctx.lineTo(ux, p.attach.y);
      ctx.stroke();
      this._drawBox(ctx, p, p.lines, color, p.selected ? R.BAR_ALPHA_SELECTED : R.BAR_ALPHA, fade);
    }
    // Strzałki krawędzi — trójkąt ku krawędzi + liczba.
    const DIRS = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
    for (const a of c.arrows) {
      const color = roles[a.role] ?? roles.primary;
      const [dx, dy] = DIRS[a.edge];
      const s = 6;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(a.x + dx * s, a.y + dy * s);
      ctx.lineTo(a.x - dx * s + dy * s, a.y - dy * s + dx * s);
      ctx.lineTo(a.x - dx * s - dy * s, a.y - dy * s - dx * s);
      ctx.closePath();
      ctx.fill();
      if (a.count > 1) {
        ctx.font = `bold ${THEME.fontSizeSmall ?? 9}px ${THEME.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(a.count), a.x - dx * (s + 9), a.y - dy * (s + 9) + 1);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Klik etykiety (px logiczne; surowe px CSS — test tarczy renderera). Reguła D-UI-5 (`clickObject`). Punkt na tarczy
   * ciała wygrywa (487, 503) — klik przechodzi do raycastu 3D.
   * @returns {boolean}
   */
  handleClick(x, y, rawX, rawY) {
    const K = (typeof window !== 'undefined') ? window.KOSMOS : null;
    const tr = K?.threeRenderer;
    const z = resolveLabelClick(this._zones, x, y, () => tr?._isOnBodyDisc?.(rawX, rawY) === true);
    if (!z?.target) return false;
    clickObject(z.target, { K, emit: (n, p) => EventBus.emit(n, p) });
    return true;
  }

  /** Wejście rozkładu z ostatniej klatki (prostokąty etykiet, kotwice, przeszkody, kadr) — do zapisu sceny w keeperze. */
  debugPlacement() {
    const r2 = (v) => (Number.isFinite(v) ? +v.toFixed(2) : v);
    const I = this._lastPlaceInput;
    if (!I) return null;
    return {
      rect: { x: r2(I.rect.x), y: r2(I.rect.y), w: r2(I.rect.w), h: r2(I.rect.h) },
      items: I.items.map((it) => ({ key: it.key, kind: it.kind, prio: it.prio, ax: r2(it.ax), ay: r2(it.ay), clear: r2(it.clear), w: r2(it.w), h: r2(it.h) })),
      obstacles: I.obstacles.map((o) => (o.r != null ? { cx: r2(o.cx), cy: r2(o.cy), r: r2(o.r) } : { x: r2(o.x), y: r2(o.y), w: r2(o.w), h: r2(o.h) })),
    };
  }

  /** Odczyt dla bramki: etykiety z ostatniej klatki rysunku (px logiczne). */
  debug() {
    const r1 = (v) => (Number.isFinite(v) ? +v.toFixed(1) : v);
    const L = this._last;
    return {
      id: 'labels', on: this._prep.on,
      labels: (L?.labels ?? []).map((p) => ({
        key: p.key, kind: p.kind, text: p.kind === 'rail' ? p.rows.map((r) => r.lines[0].text) : p.lines.map((l) => l.text),
        x: r1(p.x), y: r1(p.y), w: r1(p.w), h: r1(p.h), side: p.side, below: p.below, cand: p.cand, overlap: p.overlap,
        selected: !!p.selected, fade: r1(p.fade), anchor: { x: r1(p.ax), y: r1(p.ay) },
      })),
      arrows: (L?.arrows ?? []).map((a) => ({ edge: a.edge, x: r1(a.x), y: r1(a.y), count: a.count, role: a.role })),
      zones: this._zones.length,
    };
  }
}
