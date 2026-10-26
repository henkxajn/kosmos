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
  pointInRect, labelCandidates, rectOverlapArea,
} from './HudLabelLogic.js';
// REFORMA ZAKŁADEK T1 (flaga `labelHover`) — rozwinięcie informacyjne i etykieta na żądanie; przy OFF nic stąd nie biegnie.
import {
  isLabelHoverOn, LABEL_HOVER, makeHoverMemory, expansionFade, resolveHoverTarget, hoverObjectKey, pickStationAt,
  colonyExpansionLines, bodyExpansionLines, starExpansionLines, foreignColonyExpansionLines, stationExpansionLines,
  foreignStationExpansionLines, vesselExpansionLines, enemyVesselExpansionLines, depositSummary, pinFor, updatePins,
  placeLabelsPinned, makeYieldMemory,
} from './LabelHoverLogic.js';
import { objectScreenDisc } from './BodyCardSideLogic.js';
import { buildShipEntry } from './FleetPictureLogic.js';
import { colonyQueueCount } from './SystemTreeLogic.js';
import { gatherStationTraders } from './StationPanelLogic.js';
import { isPlayerColony } from '../utils/ColonyOwnership.js';
import { readOccupier, readOccupierName } from '../utils/OccupationLedger.js';
import { readGarrisonReadout, formatGarrisonReadout } from '../utils/GarrisonReadout.js';
import { resolveHomeColony } from '../utils/TransferStore.js';
import { resolveSystemReveal } from '../utils/SystemReveal.js';
import { isSystemExplored, HOME_SYSTEM_ID } from '../utils/SystemExploration.js';
import { STATIONS } from '../data/StationData.js';
// REFORMA ZAKŁADEK T2 (flaga `labelPin`) — przypięcie etykiety z akcjami; przy OFF nic stąd nie biegnie.
import {
  isLabelPinActive, LABEL_PIN, pinnedContentKey, bodyPinButtons, stationPinButtons, layoutButtonRows, homeDistanceLine,
  visibleDeposits, depositRows, trafficRows, moduleRows, storageRows, limitRows, toggleOpenList, openListFor, pinHitAt,
  runPinAction, yieldToPinnedLabel, pinLabelPlacement,
} from './LabelPinLogic.js';
import { showBodyDetailModal } from './BodyDetailModal.js';
import { DistanceUtils } from '../utils/DistanceUtils.js';
import { classifyStationDepot } from './StationPanelLogic.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { STATION_MODULES } from '../data/StationModuleData.js';

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
    // REFORMA ZAKŁADEK T1 (`labelHover`): stan najechania (czas realny), przypięcia etykiet rozwiniętych (I8.3), narodziny
    // rozwinięć (fade-in), pamięć treści (TTL) i wyboru obiektu pod kursorem.
    this._hoverMem = makeHoverMemory();
    this._pins = new Map();          // klucz etykiety → { cand, baseH }
    this._yieldMem = makeYieldMemory();   // wybór kandydatów sprzed rozwinięcia — sąsiedzi wracają po jego końcu
    this._expBorn = new Map();       // klucz treści (`body:X` / `station:Y` / `vessel:V`) → chwila rozwinięcia
    this._expCache = new Map();      // klucz treści → { t, loc, tac, lines }
    this._pickCache = null;          // { key, t, v } — `_hoverPick`
    // REFORMA ZAKŁADEK T2 (`labelPin`): strefy przypiętej etykiety z ostatniej klatki (przyciski, linia nazwy, całość), lista
    // otwarta w przypięciu (akordeon) i pamięć treści przypięcia (TTL jak treść rozwinięcia).
    this._pinZones = [];             // { kind: 'btn'|'name'|'body', id?, ck?, key, target?, x, y, w, h }
    this._pinOpen = null;            // { ck, list } — `toggleOpenList`
    this._pinCache = null;           // { key, t, v } — `_t2Content`
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
    // REFORMA ZAKŁADEK T1 — rozwinięcie i etykieta na żądanie (flaga `labelHover`; przy OFF — klucz i stan jak dziś).
    let t1 = null;
    if (isLabelHoverOn(F.features)) {
      t1 = this._t1Prepare(F, { bodies, pictureCtx, sel, sys });
      key += t1.key;
    }
    // REFORMA ZAKŁADEK T2 — przypięcie z akcjami (flaga `labelPin`; przy OFF — klucz i stan jak dziś).
    let t2 = null;
    if (t1 && isLabelPinActive(F.features) && K.civMode) {
      t2 = this._t2Prepare(F, sel);
      key += t2.key;
    } else if (this._pinZones.length || this._pinOpen) { this._pinZones = []; this._pinOpen = null; }
    this._prep = { on: true, bodies, anchors, points, vworld, hover, homeId, t1, t2 };
    return key;
  }

  // ── REFORMA ZAKŁADEK T2 (D-TR-1 (a), D-TR-4 (a), D-TR-5 (a)) — przypięcie etykiety z akcjami ──────────────────────────

  /**
   * Stan T2 klatki: przypięty obiekt = zaznaczenie (`readClickSelection` — ciało albo stacja), przycisk pod kursorem
   * (strefy z ostatniej klatki), lista otwarta, treść przypięcia (pamięć `CONTENT_TTL_MS`), część klucza klatki.
   */
  _t2Prepare(F, sel) {
    const ck = pinnedContentKey(sel);
    if (this._pinOpen && this._pinOpen.ck !== ck) this._pinOpen = null;   // inne przypięcie — lista zwinięta
    if (!ck) { this._pinZones = []; return { key: '|lp:', ck: null, open: null, hoverBtn: null, pin: null }; }
    const ptr = F.pointer ?? null;
    const pz = ptr && !ptr.overUI ? pinHitAt(this._pinZones, ptr.lx, ptr.ly) : null;
    const hoverBtn = pz?.kind === 'btn' && pz.ck === ck ? pz.id : null;
    const open = openListFor(this._pinOpen, ck);
    const pin = this._t2Content(ck, F, open);
    const key = `|lp:${ck}:${open ?? ''}:${hoverBtn ?? ''}:${pin.buttons.map((b) => b.label).join(',')}:${pin.extra.join('/')}:${pin.list.join('/')}`;
    return { key, ck, open, hoverBtn, pin };
  }

  /** Treść przypięcia (pamięć `CONTENT_TTL_MS` czasu realnego; zmiana listy i języka — od nowa): przyciski, linie, lista. */
  _t2Content(ck, F, open) {
    const loc = getLocale();
    const ckey = `${ck}|${open ?? ''}|${loc}`;
    const c = this._pinCache;
    if (c && c.key === ckey && F.now - c.t >= 0 && F.now - c.t < LABEL_HOVER.CONTENT_TTL_MS) return c.v;
    const K = F.K;
    const i = ck.indexOf(':'), kind = ck.slice(0, i), id = ck.slice(i + 1);
    let v;
    if (kind === 'body') {
      // To samo ciało co karta (`_selectedEntity` — obiekt, który dostaje `_doAction`); zapas — rejestr encji.
      const se = K.uiManager?._selectedEntity ?? null;
      const entity = (se && String(se.id) === id) ? se : (K.entityManager?.get?.(id) ?? null);
      const dl = homeDistanceLine(entity, K, { distAU: (e) => DistanceUtils.fromHomePlanetAU(e), fmt: (d) => fmtDec(d, 2, loc), t });
      const lim = open === 'deposits' ? limitRows(depositRows(visibleDeposits(entity, K)), t) : { rows: [], more: 0 };
      v = { kind, id, entity, buttons: bodyPinButtons(entity, K, { t, openList: open }), extra: dl ? [dl.text] : [], list: lim.rows, more: lim.more };
    } else {
      const st = (K.stationSystem?.getAllStations?.() ?? []).find((s) => String(s?.id) === id) ?? K.entityManager?.get?.(id) ?? null;
      const foreign = !!st && (st.ownerEmpireId ?? 'player') !== 'player';
      let traders = [], storage = [], modulesN = 0;
      if (st && !foreign) {
        traders = gatherStationTraders(st.id, { vesselManager: K.vesselManager, missionSystem: K.missionSystem });
        modulesN = (st.modules ?? []).length;
        const mother = resolveHomeColony(st);
        const label = (rid) => { const def = COMMODITIES[rid]; return def ? (loc === 'en' ? (def.nameEN ?? def.namePL ?? rid) : (def.namePL ?? rid)) : rid; };
        const fmt = (n) => (Number.isInteger(n) ? fmtInt(n, loc) : fmtDec(n, 1, loc));
        storage = storageRows({ mother, pool: mother ? (K.systemPoolService?.getPoolSnapshot?.(mother.planetId) ?? null) : null,
          depot: mother ? null : classifyStationDepot([...(st.depot?.inventory ?? [])]), label, fmt });
      }
      const rows = open === 'traffic' ? trafficRows(traders, t)
        : open === 'modules' ? moduleRows(st, { modules: STATION_MODULES, lang: loc })
        : open === 'storage' ? storage : [];
      const lim = limitRows(rows, t);
      v = { kind, id, entity: st, buttons: stationPinButtons({ foreign: foreign || !st, traffic: traders.length, modules: modulesN, storage: storage.length },
        { t, openList: open }), extra: [], list: lim.rows, more: lim.more };
    }
    this._pinCache = { key: ckey, t: F.now, v };
    return v;
  }

  /** Linie przypięcia (pod rozwinięciem T1): dystans od domu (B3), wiersze akcji, lista otwarta z limitem. */
  _t2Lines(T2) {
    const R = HUD_LABELS;
    const size = THEME.fontSizeSmall ?? 9;
    const pin = T2?.pin;
    if (!pin) return [];
    const lines = [];
    for (const s of pin.extra) lines.push(this._line(s, { size, maxW: R.MAX_NAME_PX + 40 }));
    const btnLine = (b) => this._line(`[ ${b.label} ]`, { size });
    for (const row of layoutButtonRows(pin.buttons, (b) => btnLine(b).w)) {
      const btns = row.map((r) => ({ id: r.id, x: r.x, w: r.w, ln: btnLine(pin.buttons.find((b) => b.id === r.id)) }));
      const last = btns[btns.length - 1];
      lines.push({ kind: 'actions', size, w: last ? last.x + last.w : 0, h: size + 3 + 2 * LABEL_PIN.ROW_PAD_Y, btns,
        text: btns.map((b) => b.ln.text).join(' ') });
    }
    const items = pin.list.length - (pin.more > 0 ? 1 : 0);
    pin.list.forEach((s, i) => lines.push(this._line(i < items ? '· ' + s : s, { size, maxW: R.MAX_NAME_PX + 40 })));
    return lines;
  }

  /**
   * Strefy przypiętej etykiety po rozkładzie (px logiczne): przyciski (wiersze akcji — to samo wyrównanie co rysunek),
   * linia nazwy (klik = reguła D-UI-5), cała etykieta (klik pochłonięty).
   */
  _t2Zones(p, T2) {
    const R = HUD_LABELS;
    const right = p.expanded === true && p.side === 'W';
    const out = [];
    let y = p.y + R.PAD_Y;
    p.lines.forEach((ln, i) => {
      if (i > 0) y += R.LINE_GAP;
      if (ln.kind === 'actions') {
        const lx = right ? p.x + p.w - R.PAD_X - ln.w : p.x + R.PAD_X;
        const P = LABEL_PIN.BTN_HIT_PAD_X;
        for (const b of ln.btns) out.push({ kind: 'btn', id: b.id, ck: T2.ck, key: p.key, x: lx + b.x - P, y, w: b.w + 2 * P, h: ln.h });
      }
      if (i === 0) out.push({ kind: 'name', key: p.key, target: p.target, x: p.x, y: p.y, w: p.w, h: y + ln.h - p.y });
      y += ln.h;
    });
    out.push({ kind: 'body', key: p.key, x: p.x, y: p.y, w: p.w, h: p.h });
    return out;
  }

  /** Klik przycisku przypięcia — dzisiejsze cele (`runPinAction`); lista — akordeon w pamięci warstwy. */
  _t2Run(pz, K) {
    const T2 = this._prep?.t2;
    if (!T2?.ck || pz.ck !== T2.ck) return;
    const res = runPinAction(pz.id, { ck: T2.ck, entity: T2.pin?.entity ?? null, K, emit: (n, p) => EventBus.emit(n, p),
      showReport: (e) => showBodyDetailModal(e) });
    if (res && typeof res === 'object' && res.toggle) this._pinOpen = toggleOpenList(this._pinOpen, T2.ck, res.toggle);
    this._pinCache = null;
  }

  // ── REFORMA ZAKŁADEK T1 (D-TR-1 (a), D-TR-2 (a), D-TR-3) — najechanie, treść rozwinięć, etykiety na żądanie ─────────

  /**
   * Wybór obiektu pod kursorem — pola, których nie liczy `F.hover`: czy punkt leży na tarczy ciała (gwiazda — wyłącznie
   * widoczny rdzeń, `_isOnBodyDisc`), statek na tarczy wyłącznie w obrębie rdzenia sprite'a (487) i stacja pod kursorem
   * (sfera modelu w rzucie). Pamięć na `PICK_TTL_MS` przy nieruchomym kursorze, kamerze i najechanym ciele.
   */
  _hoverPick(F) {
    const none = { onDisc: false, vesselCoreId: null, stationId: null };
    const ptr = F.pointer ?? null;
    if (!ptr || ptr.overUI) return none;
    const K = F.K, tr = K.threeRenderer;
    const hb = tr?._hoverPlanetId ?? null;
    const ck = `${ptr.rawX}|${ptr.rawY}|${tr?.getCameraMoveEpoch?.() ?? 0}|${hb ?? ''}`;
    const c = this._pickCache;
    if (c && c.key === ck && F.now - c.t >= 0 && F.now - c.t < LABEL_HOVER.PICK_TTL_MS) return c.v;
    let onDisc = false;
    if (hb != null) onDisc = K.entityManager?.get?.(hb)?.type === 'star' ? tr?._isOnBodyDisc?.(ptr.rawX, ptr.rawY) === true : true;
    let vesselCoreId = null;
    if (onDisc) vesselCoreId = tr?._getVesselAtScreen?.(ptr.rawX, ptr.rawY, LABEL_HOVER.VESSEL_CORE_PICK_PX, true, true) ?? null;
    const st = [];
    for (const id of tr?._stations?.keys?.() ?? []) st.push({ id, disc: objectScreenDisc(K, 'station', id) });
    const v = { onDisc, vesselCoreId, stationId: pickStationAt(st, ptr.lx, ptr.ly) };
    this._pickCache = { key: ck, t: F.now, v };
    return v;
  }

  /** Nazwa ciała dla etykiety na żądanie — oś MIEJSCA kanonu mgły wojny (`SystemReveal.name`) oglądanego układu. */
  _t1NameVisible(F) {
    const K = F.K, sys = F.activeSystemId;
    const rec = (K.galaxyData?.systems ?? []).find((s) => s?.id === sys) ?? (sys === HOME_SYSTEM_ID ? { id: sys, isHome: true } : null);
    const intel = K.intelSystem;
    return resolveSystemReveal(rec, {
      explored: isSystemExplored(rec),
      scanned: !!K.observatorySystem?.getSystemScanResult?.(sys),
      intelAtLeast: (lvl) => intel?.isAtLeast?.(rec?.empireId, lvl) === true,
    }).name === true;
  }

  /**
   * Stan T1 klatki: obiekt pod kursorem → pamięć najechania; klucze treści rozwinięć (najechany + zaznaczone: ciało, stacja,
   * prowadzący statek); etykiety na żądanie (ciała i stacje BEZ etykiety stałej — gwiazda, ciała bez kolonii, kolonie i stacje
   * AI, planetoidy — tylko najechane albo zaznaczone); treść z pamięci (TTL); część klucza klatki.
   */
  _t1Prepare(F, { bodies, pictureCtx, sel, sys }) {
    const K = F.K, tr = K.threeRenderer, em = K.entityManager, cm = K.colonyManager;
    const ptr = F.pointer ?? null;
    let target = null;
    if (ptr && !ptr.overUI) {
      // T2: kursor nad przypiętą etykietą — najechana jest ona (przycisk > etykieta > tarcza pod spodem), bez rozwinięcia
      // obiektu, którego tarczę etykieta przykrywa.
      const pz = isLabelPinActive(F.features) && this._prep?.t2?.ck ? pinHitAt(this._pinZones, ptr.lx, ptr.ly) : null;
      if (pz) target = { kind: 'label', key: pz.key };
      else {
        const z = resolveLabelClick(this._zones, ptr.lx, ptr.ly);
        const pick = this._hoverPick(F);
        const h = F.hover ?? {};
        target = resolveHoverTarget({ labelKey: z?.key ?? null, onDisc: pick.onDisc, vesselId: h.vesselId ?? null,
          vesselCoreId: pick.vesselCoreId, stationId: pick.stationId, bodyId: h.bodyId ?? null });
      }
    }
    const hov = this._hoverMem.update(hoverObjectKey(target), F.now);
    // Etykiety stałe (kolonie i stacje gracza w scenie) i stacje oglądanego układu.
    const permanent = new Map();
    for (const b of bodies) permanent.set(String(b.id), b);
    const stations = new Map();
    for (const st of K.stationSystem?.getAllStations?.() ?? []) if (st && tr?._stations?.has?.(st.id)) stations.set(String(st.id), st);
    const groups = groupByAnchor(bodies);
    const lead = sel.leadId ?? (sel.vesselIds?.[0] ?? null);
    // T2: przypięty członek stosu ma własną etykietę — zwinięta „+N” reszty nazywa głowę RESZTY grupy (lustro `collect`).
    const pinCk = isLabelPinActive(F.features) && K.civMode ? pinnedContentKey(sel) : null;
    // Klucz treści obiektu: grupa „+N” → głowa grupy (kotwica — ciało, które etykieta nazywa); klaster statków → prowadzący
    // (gdy w klastrze), inaczej pierwszy z klucza.
    const contentKeyOf = (objKey) => {
      if (!objKey || !objKey.startsWith('lbl:')) return objKey ?? null;
      const lk = objKey.slice(4), i = lk.indexOf(':'), p = lk.slice(0, i), rest = lk.slice(i + 1);
      if (p === 'g') {
        let m = groups.get(rest) ?? [];
        if (pinCk) m = m.filter((x) => (x.kind === 'colony' ? 'body:' : 'station:') + x.id !== pinCk);
        const head = m.find((x) => x.kind === 'colony' && String(x.id) === rest) ?? m[0];
        return head ? (head.kind === 'colony' ? 'body:' : 'station:') + head.id : null;
      }
      if (p === 'k' || p === 'e') {
        const ids = rest.split(',');
        const id = (p === 'k' && lead != null && ids.includes(String(lead))) ? String(lead) : ids[0];
        return id ? 'vessel:' + id : null;
      }
      return null;
    };
    const hoverContent = contentKeyOf(hov.key);
    const selContent = new Set();
    if (sel.entityId != null) selContent.add('body:' + sel.entityId);
    if (sel.stationId != null) selContent.add('station:' + sel.stationId);
    if (lead != null) selContent.add('vessel:' + lead);
    const contentKeys = new Set(selContent);
    if (hoverContent) contentKeys.add(hoverContent);
    // Narodziny rozwinięć (fade-in na czasie realnym) — nowy klucz rodzi się teraz, zniknięty — zapomniany.
    let fading = false;
    for (const k of [...this._expBorn.keys()]) if (!contentKeys.has(k)) this._expBorn.delete(k);
    for (const k of contentKeys) {
      if (!this._expBorn.has(k)) this._expBorn.set(k, F.now);
      if (expansionFade(F.now, this._expBorn.get(k)) < 1) fading = true;
    }
    const hoverOnly = hoverContent != null && !selContent.has(hoverContent);
    const alphaOf = (ck) => {
      if (!ck || !contentKeys.has(ck)) return 0;
      const a = expansionFade(F.now, this._expBorn.get(ck));
      return (hoverOnly && ck === hoverContent) ? Math.min(a, hov.fadeOut) : a;
    };
    // Etykiety na żądanie — obiekty z rozwinięciem bez etykiety stałej, obecne w scenie.
    const nameOk = this._t1NameVisible(F);
    const demand = [];
    for (const ck of contentKeys) {
      const i = ck.indexOf(':'), kind = ck.slice(0, i), id = ck.slice(i + 1);
      if (permanent.has(id)) continue;
      if (kind === 'body') {
        const entity = em?.get?.(id) ?? null;
        const world = entity ? tr?.getBodyWorldInfo?.(id) : null;
        if (!world) continue;
        const colony = cm?.getColony?.(id) ?? null;
        const foreign = !!colony && !isPlayerColony(colony);
        demand.push({ key: 'h:' + id, ck, kind: 'demand', id, entity, world, foreign, colony: !!colony,
          name: nameOk ? String(entity.name ?? id) : '???', selected: selContent.has(ck),
          target: { type: 'body', id, entity, systemId: sys } });
      } else if (kind === 'station') {
        const st = stations.get(id);
        const world = st ? (tr?.getStationWorldInfo?.(id) ?? tr?.getBodyWorldInfo?.(id)) : null;
        if (!world) continue;
        const foreign = (st.ownerEmpireId ?? 'player') !== 'player';
        demand.push({ key: 'hs:' + id, ck, kind: 'demand', id, entity: st, world, foreign, colony: false,
          name: nameOk ? String(st.name ?? id) : '???', selected: selContent.has(ck),
          target: { type: 'station', id, systemId: sys } });
      }
    }
    // Treść rozwinięć (pamięć `CONTENT_TTL_MS`).
    const ctx = { permanent, stations, pictureCtx };
    const content = new Map();
    for (const ck of contentKeys) content.set(ck, this._t1Content(ck, F, ctx));
    let key = `|lh:${hov.key ?? ''}:${hov.lingering ? 1 : 0}:${nameOk ? 1 : 0}`;
    for (const d of demand) key += `|d${d.key}:${q(d.world.x)},${q(d.world.y)},${q(d.world.z)}:${q(d.world.r ?? 0)}:${d.name}:${d.selected ? 1 : 0}`;
    for (const [ck, lines] of content) key += `|x${ck}:${lines.join('/')}`;
    return { key, hov, hoverContent, selContent, contentKeys, alphaOf, demand, content, contentKeyOf, lead,
      animating: fading || (hoverOnly && hov.animating) };
  }

  /** Treść rozwinięcia obiektu (≤ 4 linie) — pamięć na `CONTENT_TTL_MS` czasu realnego (zmiana języka i trybu Y — od nowa). */
  _t1Content(ck, F, ctx) {
    const loc = getLocale(), tac = F.tactical === true;
    const c = this._expCache.get(ck);
    if (c && c.loc === loc && c.tac === tac && F.now - c.t >= 0 && F.now - c.t < LABEL_HOVER.CONTENT_TTL_MS) return c.lines;
    const i = ck.indexOf(':'), kind = ck.slice(0, i), id = ck.slice(i + 1);
    const lines = kind === 'vessel' ? this._t1Vessel(id, F, ctx)
      : kind === 'station' ? this._t1Station(id, F, ctx)
      : kind === 'body' ? this._t1Body(id, F, ctx) : [];
    if (this._expCache.size > 64) this._expCache.clear();
    this._expCache.set(ck, { t: F.now, loc, tac, lines });
    return lines;
  }

  _t1Body(id, F, ctx) {
    const K = F.K, loc = getLocale();
    const entity = K.entityManager?.get?.(id) ?? null;
    const colony = K.colonyManager?.getColony?.(id) ?? null;
    const occ = readOccupier(id);
    const occupierName = occ ? readOccupierName(occ, t('warOverlay.player')) : null;
    const homeId = K.homePlanet?.id ?? null;
    if (colony && isPlayerColony(colony)) {
      const b = ctx.permanent.get(String(id));
      const body = entity ?? colony.planet ?? null;
      const known = body?.explored === true || String(id) === String(homeId);
      return colonyExpansionLines({ sub: b ? this._subColony(b, F) : null, body, deposits: known ? depositSummary(body?.deposits) : null,
        occupierName, queue: colonyQueueCount(colony) }, t);
    }
    if (colony) {
      const empId = colony.ownerEmpireId, intel = K.intelSystem;
      const pop = colony.civSystem?.population;
      return foreignColonyExpansionLines({
        owner: { empireId: empId, empireName: K.empireRegistry?.get?.(empId)?.name ?? null, intelAtLeast: (lvl) => intel?.isAtLeast?.(empId, lvl) === true },
        populationText: Number.isFinite(pop) ? fmtInt(Math.round(pop), loc) : null,
        garrisonText: formatGarrisonReadout(readGarrisonReadout(K, id)), occupierName, body: entity }, t);
    }
    if (!entity) return [];
    if (entity.type === 'star') {
      const hz = entity.habitableZone;
      return starExpansionLines({ star: entity, tempText: Number.isFinite(entity.temperature) ? fmtInt(entity.temperature, loc) : null,
        hzText: hz && Number.isFinite(hz.min) && Number.isFinite(hz.max) ? [fmtDec(hz.min, 2, loc), fmtDec(hz.max, 2, loc)] : null }, t);
    }
    const explored = entity.explored === true || String(id) === String(homeId);
    const distAU = (Number.isFinite(entity.x) && Number.isFinite(entity.y)) ? Math.hypot(entity.x, entity.y) / AU_TO_PX : null;
    return bodyExpansionLines({ body: entity, explored, deposits: depositSummary(entity.deposits),
      distText: distAU != null ? fmtDec(distAU, 2, loc) : null }, t);
  }

  _t1Station(id, F, ctx) {
    const K = F.K;
    const st = ctx.stations.get(String(id)) ?? null;
    if (!st) return [];
    if ((st.ownerEmpireId ?? 'player') !== 'player') {
      const empId = st.ownerEmpireId, intel = K.intelSystem;
      return foreignStationExpansionLines({ owner: { empireId: empId, empireName: K.empireRegistry?.get?.(empId)?.name ?? null,
        intelAtLeast: (lvl) => intel?.isAtLeast?.(empId, lvl) === true } }, t);
    }
    const b = ctx.permanent.get(String(id));
    const mother = resolveHomeColony(st);
    let storage;
    if (mother) {
      const snap = K.systemPoolService?.getPoolSnapshot?.(mother.planetId);
      const head = String(mother.name ?? mother.planetId);
      storage = (snap?.byBody?.length > 1) ? { kind: 'pool', head, others: snap.byBody.length - 1 } : { kind: 'mother', name: head };
    } else if (st.depotDetached) storage = { kind: 'cut' };
    else storage = { kind: 'own', items: [...(st.depot?.inventory ?? [])].filter(([, v]) => v > 0).length };
    const traders = gatherStationTraders(st.id, { vesselManager: K.vesselManager, missionSystem: K.missionSystem });
    const docked = traders.filter((x) => x.status === 'docked').length;
    const max = STATIONS[st.stationType ?? 'orbital_station']?.maxModules ?? STATIONS.orbital_station.maxModules;
    return stationExpansionLines({ sub: b ? this._subStation(b) : null, storage, traffic: { moving: traders.length - docked, docked },
      modules: { n: (st.modules ?? []).length, max, shipyard: st.hasActiveShipyard === true } }, t);
  }

  _t1Vessel(id, F, ctx) {
    const K = F.K;
    const v = K.vesselManager?.getVessel?.(id);
    if (!v) return [];
    if (isEnemyVessel(v)) {
      const quality = K.intelSystem?.getVesselContact?.(id)?.quality ?? 'unknown';
      return enemyVesselExpansionLines({ quality, roleLabel: t(`fleetPicture.role.${getPrimaryRole(v)}`) }, t);
    }
    const e = buildShipEntry(v, ctx.pictureCtx ?? {});
    const eta = Number.isFinite(e?.eta?.year) ? `${e.eta.confidence === 'moving' ? '~' : '⏱'}${Math.round(e.eta.year)}` : null;
    const pct = (x) => `${Math.round(x * 100)}%`;
    const fuel = [e?.fuelPct != null ? `${t('tacticalDock.fuel')} ${pct(e.fuelPct)}` : null,
      e?.warpFuelPct != null && (v.warpFuel?.max ?? 0) > 0 ? `${t('tacticalDock.warp')} ${pct(e.warpFuelPct)}` : null].filter(Boolean).join(' · ');
    return vesselExpansionLines({ sub: this._subVessel(v, K), activity: e?.activityKey ? t(e.activityKey, ...(e.activityArgs ?? [])) : null,
      etaText: eta, fuelText: fuel || null, skipActivity: F.tactical === true }, t);
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

  /**
   * REFORMA ZAKŁADEK T1 — linie etykiety ciała / stacji: pierwsza linia jak `_bodyLines` (wersaliki kolonii, „+N”, pogrubienie
   * zaznaczonej), pod nią — gdy obiekt ma rozwinięcie — treść z pamięci `_t1Prepare` (zastępuje dzisiejszą drugą linię:
   * pierwsza linia rozwinięcia kolonii i stacji to ta sama treść). `baseH` — wysokość bez rozwinięcia (przypięcie, I8.3).
   */
  _t1BodyLines(b, { selected, ck, collapsedOthers = 0 }, F, T) {
    const R = HUD_LABELS;
    const size = (THEME.fontSizeNormal ?? 11) + R.MAIN_SIZE_DELTA;
    const subSize = THEME.fontSizeSmall ?? 9;
    const loc = getLocale();
    const isColony = b.kind === 'colony';
    const name = isColony ? String(b.name).toLocaleUpperCase(loc) : String(b.name);
    const lines = [this._line(collapsedOthers > 0 ? collapsedText(name, collapsedOthers) : name,
      { size, bold: selected, spacing: isColony ? R.LETTER_SPACING_COLONY : 0, maxW: R.MAX_NAME_PX })];
    const baseH = this._labelBox(lines).h;
    const expanded = !!ck && T.contentKeys.has(ck);
    if (expanded) for (const s of T.content.get(ck) ?? []) lines.push(this._line(s, { size: subSize, maxW: R.MAX_NAME_PX + 40 }));
    return { lines, baseH, expanded, expAlpha: expanded ? T.alphaOf(ck) : 0 };
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
    const cards = this._cardRects(K);
    for (const r of cards) obstacles.push(r);
    // ── Ciała: grupy stosu i LOD ────────────────────────────────────────────────────────────────────────────────────
    const items = [];
    const pushItem = (it) => { items.push(it); };
    const isSelBody = (b) => (b.kind === 'colony' && sel.entityId != null && String(sel.entityId) === String(b.id))
      || (b.kind === 'station' && sel.stationId != null && String(sel.stationId) === String(b.id));
    const isHovBody = (b, key) => P.hover.labelKey === key || (b.kind === 'colony' && P.hover.bodyId != null && String(P.hover.bodyId) === String(b.id));
    // REFORMA ZAKŁADEK T1 (`labelHover`): linie z rozwinięciem (treść z `_t1Prepare`), priorytet najechanej (na wierzchu)
    // i przypięcie etykiety rozwiniętej (I8.3). Przy OFF — `T` puste, ścieżki jak dziś.
    const T = P.t1 ?? null;
    const bodyCk = (b) => (b.kind === 'colony' ? 'body:' : 'station:') + b.id;
    const hovPrio = (ck) => (T && T.hov.key != null && ck === T.hoverContent ? LABEL_HOVER.HOVER_PRIO : null);
    // REFORMA ZAKŁADEK T2 (strojenie 1, zachowanie 5): tarcze, na które rozwinięcie i przypięcie nie wchodzą — tarcza swojego ciała
    // (`it.clear`), a do tego tarcza ciała-gospodarza stacji i tarcza kotwicy stosu (księżyc → planeta).
    const pinKeepOut = (kind, id) => {
      const out = [];
      const add = (bid) => {
        const d = bid != null ? discAt.get(bid) : null;
        if (d && d.r > 0) out.push({ cx: d.x, cy: d.y, r: d.r });
      };
      if (kind === 'station') {
        const st = (K.stationSystem?.getAllStations?.() ?? []).find((s) => String(s?.id) === String(id)) ?? null;
        add(st?.bodyId);
        add(stationGroupAnchorId(st?.bodyId != null ? em?.get?.(st.bodyId) : null));
      } else if (kind === 'body') {
        const a = stationGroupAnchorId(em?.get?.(id) ?? null);
        if (a != null && String(a) !== String(id)) add(a);
      }
      return out;
    };
    // T2 włączone (flaga `labelPin`) — także bez przypiętego obiektu (reguła rozwinięcia najechania niżej). Przy OFF — jak T1.
    const T2on = !!T && isLabelPinActive(F.features) && !!K.civMode;
    // T1 (I8.3): rozwinięta etykieta stoi na kandydacie sprzed rozwinięcia (`pinFor`) i rośnie w dół. T2 (strojenie 1): przy
    // POJAWIENIU się rozwinięcia (bez zapamiętanego przypięcia położenia) ta sama reguła co przypięcie — nadmiar nad tarczą
    // (`pinKeepOut`) w górę dokładnie o tyle, bez miejsca w kadrze — pod tarczę (`pinLabelPlacement`); wynik zapamiętany
    // (`updatePins`) — w kolejnych klatkach etykieta stoi, bez ciągłego przesuwania (I8.3).
    const pinIt = (it, baseH, kind = null, id = null) => {
      if (!it.expanded) return it;
      const fresh = !this._pins.has(it.key);
      const pin = pinFor(it.key, { pins: this._pins, prev: this._prev, baseH });
      if (!pin) return it;
      it.pin = pin;
      if (T2on && fresh) {
        const pl = pinLabelPlacement(it, map, { pin, baseH, keepOut: pinKeepOut(kind, id) });
        if (pl) it.pin = { cand: pl.cand, baseH: pl.baseH };
      }
      return it;
    };
    // REFORMA ZAKŁADEK T2 (`labelPin`): przypięty obiekt (zaznaczenie) ma własną etykietę przy SWOIM obiekcie — członek stosu
    // (zwinięta „+N”, szyna) wychodzi z grupy (przypięta etykieta zawsze rozwinięta, z wierszem akcji; jej położenie nie zależy
    // od innych wierszy szyny), reszta grupy — LOD jak dziś. Przy OFF — `T2` puste, ścieżki jak dziś.
    const T2 = (T && P.t2?.ck) ? P.t2 : null;
    let pinnedMember = null;
    // T2: przypięta etykieta nie stoi pod kartą UI rysowaną nad warstwą HUD (panel statku przy outlinerze): gdy karta zasłania
    // jej przypięte miejsce, przypięcie położenia przepada — rozkład kładzie ją obok karty (raz), od następnej klatki znów stoi.
    const pinUnderCard = (it) => {
      if (!it?.pin || !cards.length) return false;
      const c = labelCandidates({ ...it, h: it.pin.baseH > 0 ? it.pin.baseH : it.h })[Number.isInteger(it.pin.cand) ? it.pin.cand : 0];
      if (!c) return false;
      const bx = Math.max(map.x + R.EDGE, Math.min(map.x + map.w - R.EDGE - it.w, c.x));
      const by = Math.max(map.y + R.EDGE, Math.min(map.y + map.h - R.EDGE - it.h, c.y));
      return cards.some((r) => rectOverlapArea({ x: bx, y: by, w: it.w, h: it.h }, r, 0) > 0);
    };
    // T2 (strojenie 1, zachowanie 5): przypięty pasek rośnie w dół jak przy najechaniu (start — przypięcie położenia z najechania)
    // i nie wchodzi na tarczę swojego ciała, ciała-gospodarza stacji ani kotwicy stosu (księżyc → planeta): przesuwa się w górę
    // dokładnie o nadmiar, bez miejsca w kadrze — pod tarczę (`pinLabelPlacement`). Przypięcie położenia tej klatki = wynik;
    // pamięć `_pins` — start bez przesunięcia przypięcia (nadmiar liczony co klatkę: lista zwinięta — etykieta wraca na miejsce;
    // po zdjęciu przypięcia najechana etykieta stoi wg reguły T1).
    const pinPinned = (it, baseH, kind, id) => {
      pinIt(it, baseH, kind, id);
      const pl = pinLabelPlacement(it, map, { pin: it.pin ?? null, baseH, keepOut: pinKeepOut(kind, id) });
      if (pl) { it.pin = { cand: pl.cand, baseH: pl.baseH }; it.pinShift = pl.shift; this._pins.set(it.key, pl.start); }
      if (pinUnderCard(it)) { delete it.pin; this._pins.delete(it.key); }
      return it;
    };
    const groups = groupByAnchor(P.bodies);
    for (const [anchorId, members0] of groups) {
      let members = members0, extracted = false;
      if (T2) {
        const pm = members0.find((b) => bodyCk(b) === T2.ck);
        if (pm) { pinnedMember = pm; members = members0.filter((b) => b !== pm); extracted = true; }
      }
      const proj1 = members.map((b) => ({ b, d: pushDisc(b.id, b.world) ?? discOf(b.world) })).filter((x) => x.d && pointInRect(x.d.x, x.d.y, map));
      if (!proj1.length) continue;
      const aw = P.anchors.get(anchorId);
      const ad = aw ? (pushDisc(anchorId, aw) ?? discOf(aw)) : null;
      let state = stackLOD(ad ? 2 * ad.r : NaN, proj1.length);
      // T1: członek inny niż kotwica — zaznaczony ALBO najechany (tarcza) — widoczny (co najmniej szyna).
      const selIdx = proj1.findIndex((x) => (T ? T.contentKeys.has(bodyCk(x.b)) : isSelBody(x.b)));
      if (selIdx > 0) state = atLeastLOD(state, 'rail');           // zaznaczony członek inny niż kotwica — widoczny
      if (state === 'single' || state === 'spread') {
        for (const { b, d } of proj1) {
          const key = b.key, selected = isSelBody(b);
          const L = T ? this._t1BodyLines(b, { selected, ck: bodyCk(b) }, F, T) : null;
          const lines = L ? L.lines : this._bodyLines(b, { selected, sub: selected || isHovBody(b, key) }, F);
          const box = this._labelBox(lines);
          const it = { key, kind: b.kind, ax: d.x, ay: d.y, clear: d.r, w: box.w, h: box.h, lines, selected,
            role: 'primary', prio: (L?.expanded ? hovPrio(bodyCk(b)) : null) ?? (selected ? LABEL_PRIO.selected : b.home ? LABEL_PRIO.home : b.kind === 'colony' ? LABEL_PRIO.colony : LABEL_PRIO.station),
            target: b.kind === 'colony' ? { type: 'body', id: b.id, entity: b.body, systemId: sys } : { type: 'station', id: b.id, systemId: sys } };
          if (L) Object.assign(it, { expanded: L.expanded, expFrom: 1, expAlpha: L.expAlpha });
          pushItem(L ? pinIt(it, L.baseH, b.kind === 'station' ? 'station' : 'body', b.id) : it);
        }
        continue;
      }
      const anchorPt = ad && pointInRect(ad.x, ad.y, map) ? ad : proj1[0].d;
      const anchorEntity = em?.get?.(anchorId) ?? proj1[0].b.body;
      if (state === 'collapsed') {
        const head = proj1.find((x) => x.b.kind === 'colony' && x.b.id === anchorId) ?? proj1[0];
        const key = 'g:' + anchorId;
        const selected = isSelBody(head.b);
        // T1: najechana zwinięta „+N” — rozwinięcie GŁOWY grupy (ciało, które etykieta nazywa), bez rozwijania szyny.
        const L = T ? this._t1BodyLines(head.b, { selected, ck: bodyCk(head.b), collapsedOthers: proj1.length - 1 }, F, T) : null;
        const lines = L ? L.lines : this._bodyLines(head.b, { selected, sub: selected || isHovBody(head.b, key) || P.hover.labelKey === key, collapsedOthers: proj1.length - 1 }, F);
        const box = this._labelBox(lines);
        // T2: grupa bez przypiętego członka — kotwica wyszła do własnej etykiety, a głowa reszty nie jest kotwicą: klik zwiniętej
        // etykiety zaznacza obiekt, który etykieta nazywa (nie przypiętą kotwicę). Poza tym — kotwica (jak dziś).
        const target = (extracted && String(head.b.id) !== String(anchorId))
          ? (head.b.kind === 'colony' ? { type: 'body', id: head.b.id, entity: head.b.body, systemId: sys } : { type: 'station', id: head.b.id, systemId: sys })
          : { type: 'body', id: anchorId, entity: anchorEntity, systemId: sys };
        const it = { key, kind: 'group', ax: anchorPt.x, ay: anchorPt.y, clear: anchorPt.r ?? 0, w: box.w, h: box.h, lines, selected,
          role: 'primary', prio: (L?.expanded ? hovPrio(bodyCk(head.b)) : null) ?? (selected ? LABEL_PRIO.selected : LABEL_PRIO.group), members: proj1.map((x) => x.b.key),
          target };
        if (L) Object.assign(it, { expanded: L.expanded, expFrom: 1, expAlpha: L.expAlpha });
        pushItem(L ? pinIt(it, L.baseH) : it);
        continue;
      }
      // Szyna — blok wierszy (każdy wiersz z własną strefą kliku).
      const rows = proj1.map(({ b }) => {
        const rkey = b.key, selected = isSelBody(b);
        const L = T ? this._t1BodyLines(b, { selected, ck: bodyCk(b) }, F, T) : null;
        const lines = L ? L.lines : this._bodyLines(b, { selected, sub: selected || isHovBody(b, rkey) }, F);
        const box = this._labelBox(lines);
        const row = { key: rkey, kind: b.kind, w: box.w, h: box.h, lines, selected,
          target: b.kind === 'colony' ? { type: 'body', id: b.id, entity: b.body, systemId: sys } : { type: 'station', id: b.id, systemId: sys } };
        if (L) Object.assign(row, { expanded: L.expanded, expFrom: 1, expAlpha: L.expAlpha, baseH: L.baseH, ck: bodyCk(b) });
        return row;
      });
      const size = railBlockSize(rows);
      const anySel = rows.some((r) => r.selected);
      const it = { key: 'r:' + anchorId, kind: 'rail', ax: anchorPt.x, ay: anchorPt.y, clear: anchorPt.r ?? 0, w: size.w, h: size.h,
        rows, selected: anySel, role: 'primary', prio: anySel ? LABEL_PRIO.selected : LABEL_PRIO.group };
      if (T) {
        const exp = rows.filter((r) => r.expanded);
        it.expanded = exp.length > 0;
        if (exp.some((r) => r.ck === T.hoverContent && T.hov.key != null)) it.prio = LABEL_HOVER.HOVER_PRIO;
        // Wysokość bloku bez rozwinięć (przypięcie: górna krawędź bloku stoi, wiersze rosną w dół).
        const baseH = rows.reduce((s, r, i) => s + r.baseH + (i > 0 ? R.ROW_GAP : 0), 0);
        pushItem(pinIt(it, baseH));
      } else pushItem(it);
    }
    // ── REFORMA ZAKŁADEK T2 — przypięty członek stosu: własna etykieta przy swoim obiekcie (nazwa, rozwinięcie T1, przypięcie) ──
    if (T2 && pinnedMember) {
      const b = pinnedMember;
      const d = pushDisc(b.id, b.world) ?? discOf(b.world);
      if (d && pointInRect(d.x, d.y, map)) {
        const ck = bodyCk(b);
        const L = this._t1BodyLines(b, { selected: true, ck }, F, T);
        const lines = [...L.lines, ...this._t2Lines(T2)];
        const box = this._labelBox(lines);
        const it = { key: b.key, kind: b.kind, ax: d.x, ay: d.y, clear: d.r, w: box.w, h: box.h, lines, selected: true,
          role: 'primary', prio: hovPrio(ck) ?? LABEL_PRIO.selected,
          target: b.kind === 'colony' ? { type: 'body', id: b.id, entity: b.body, systemId: sys } : { type: 'station', id: b.id, systemId: sys },
          expanded: true, expFrom: 1, expAlpha: L.expAlpha, pinLabel: true, pinHover: T2.hoverBtn };
        pushItem(pinPinned(it, L.baseH, b.kind === 'station' ? 'station' : 'body', b.id));
      }
    }
    // ── REFORMA ZAKŁADEK T1 — etykiety na żądanie (D-TR-1 (a)): ciała i stacje bez etykiety stałej, najechane albo zaznaczone ──
    if (T) {
      const size = (THEME.fontSizeNormal ?? 11) + R.MAIN_SIZE_DELTA;
      const subSize = THEME.fontSizeSmall ?? 9;
      for (const dm of T.demand) {
        const dd = discAt.get(dm.id) ?? discOf(dm.world);   // tarcza z przeszkód tej klatki (gwiazda, planety, księżyce), inaczej rzut
        if (!dd || !pointInRect(dd.x, dd.y, map)) continue;
        const name = dm.colony ? String(dm.name).toLocaleUpperCase(loc) : String(dm.name);
        const lines = [this._line(name, { size, bold: dm.selected, spacing: dm.colony ? R.LETTER_SPACING_COLONY : 0, maxW: R.MAX_NAME_PX })];
        for (const s of T.content.get(dm.ck) ?? []) lines.push(this._line(s, { size: subSize, maxW: R.MAX_NAME_PX + 40 }));
        const baseH = this._labelBox(lines).h;
        // T2: etykieta na żądanie przypiętego obiektu (gwiazda, ciało bez kolonii, kolonia / stacja AI, planetoida) — z przypięciem.
        const pinned = !!T2 && dm.ck === T2.ck;
        if (pinned) lines.push(...this._t2Lines(T2));
        const box = this._labelBox(lines);
        const it = { key: dm.key, kind: 'demand', ax: dd.x, ay: dd.y, clear: dd.r ?? 0, w: box.w, h: box.h, lines, selected: dm.selected,
          role: dm.foreign ? 'foreign' : 'primary', prio: hovPrio(dm.ck) ?? LABEL_PRIO.selected, target: dm.target,
          expanded: true, demand: true, demandAlpha: T.alphaOf(dm.ck) };
        if (pinned) Object.assign(it, { pinLabel: true, pinHover: T2.hoverBtn });
        const dk = dm.ck.startsWith('station:') ? 'station' : 'body';
        pushItem(pinned ? pinPinned(it, baseH, dk, dm.id) : pinIt(it, box.h, dk, dm.id));
      }
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
      const lines = [this._line(text, { size, bold: selected, maxW: R.MAX_NAME_PX })];
      // REFORMA ZAKŁADEK T1: rozwinięcie statku (prowadzący w klastrze, najechany sprite albo etykieta) — treść z pamięci
      // `_t1Prepare` (obcy statek wg wywiadu — 504); przy OFF — druga linia jak dziś.
      let t1 = null;
      if (T) {
        const sids = ids.map(String), hk = T.hov.key;
        const ck = (!isEnemy && lead) ? 'vessel:' + lead.id
          : (hk?.startsWith('vessel:') && sids.includes(hk.slice(7))) ? hk
          : (hk === 'lbl:' + key ? T.hoverContent : null);
        const expanded = !!ck && T.contentKeys.has(ck);
        const baseH = this._labelBox(lines).h;
        if (expanded) for (const s of T.content.get(ck) ?? []) lines.push(this._line(s, { size: subSize, maxW: R.MAX_NAME_PX + 40 }));
        t1 = { expanded, baseH, expAlpha: expanded ? T.alphaOf(ck) : 0, prio: expanded ? hovPrio(ck) : null };
      } else {
        const subFor = lead ?? (hov ?? (P.hover.labelKey === key ? c.items[0] : null));
        if (subFor && (single || lead || subFor === hov)) {
          const isAnon = isEnemy && subFor.name === '?';
          const sub = isAnon ? null : this._subVesselCached(subFor.id, F);
          if (sub) lines.push(this._line(sub, { size: subSize, maxW: R.MAX_NAME_PX + 40 }));
        }
      }
      const box = this._labelBox(lines);
      const ax = single ? c.items[0].x : c.x, ay = single ? c.items[0].y : c.y;
      const bracketClear = single && bracketIds.has(String(c.items[0].id)) ? R.BRACKET_HALF * Math.SQRT2 : 0;
      const it = { key, kind: isEnemy ? 'enemy' : 'vessel', ax, ay, clear: single ? Math.max(2, c.items[0].r, bracketClear) : 3, w: box.w, h: box.h, lines,
        selected, role: isEnemy ? 'foreign' : 'primary', prio: (t1?.prio ?? null) ?? (selected ? LABEL_PRIO.selected : isEnemy ? LABEL_PRIO.enemy : LABEL_PRIO.own),
        target: isEnemy ? { type: 'enemy', id: ids[0], systemId: sys } : vesselsTarget(ids, sys) };
      if (!t1) return it;
      Object.assign(it, { expanded: t1.expanded, expFrom: 1, expAlpha: t1.expAlpha });
      return pinIt(it, t1.baseH);
    };
    // T1: statek najechany (także w trakcie wygasania rozwinięcia) — etykieta widoczna jak przy dzisiejszym najechaniu.
    const t1Hovered = (c) => !!T && typeof T.hov.key === 'string' && T.hov.key.startsWith('vessel:') && c.items.some((p) => 'vessel:' + p.id === T.hov.key);
    for (const c of ownClusters) {
      const single = c.items.length === 1;
      const show = !single || c.label === 'fleet' || c.alertCount > 0 || c.items.some((p) => p.selected || (leadId != null && String(p.id) === String(leadId)))
        || F.tactical || (T ? t1Hovered(c) : (P.hover.vesselId != null && c.items.some((p) => String(p.id) === String(P.hover.vesselId))));
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
    // T1: etykiety rozwinięte stoją na przypiętym kandydacie (I8.3), sąsiedzi je omijają, a po końcu rozwinięcia wracają
    // (`_yieldMem`, kamera nieruszona); przy OFF — rozkład jak dziś.
    const expandedKeys = T ? new Set(items.filter((it) => it.expanded).map((it) => it.key)) : null;
    // T2: przypięta etykieta stoi, etykieta rozwinięta T1, której przypięte miejsce weszłoby na nią, ustępuje (I8.3).
    const placeItems = T2 ? yieldToPinnedLabel(items, { rect: map }) : items;
    if (T) this._yieldMem.step(this._prev, expandedKeys.size > 0, tr?.getCameraMoveEpoch?.() ?? 0);
    const { placed } = T ? placeLabelsPinned(placeItems, { rect: map, obstacles, prev: this._prev }) : placeLabels(items, { rect: map, obstacles, prev: this._prev });
    this._prev.clear();
    for (const p of placed) this._prev.set(p.key, p.cand);
    if (T) {
      // T2: etykieta, która ustąpiła przypiętej, zapomina dawne przypięcie położenia — od następnej klatki stoi na nowym miejscu.
      for (const p of placed) if (p.yieldedToPin) this._pins.delete(p.key);
      updatePins(this._pins, placed, expandedKeys);
    } else {
      if (this._pins.size) this._pins.clear();
      this._yieldMem.reset();
    }
    const fading = updateBorn(this._born, placed.map((p) => p.key), F.now);
    // Strefy kliku — prostokąty tekstu (wiersze szyny osobno), w kolejności rysowania.
    const zones = [];
    // Zaznaczone rysowane ostatnie (na wierzchu); T2 — przypięta etykieta ostatnia z wszystkich (rysunek = klik: jej strefy
    // wygrywają w `handleClick`).
    const drawList = [...placed].sort((a, b) => ((a.pinLabel ? 1 : 0) - (b.pinLabel ? 1 : 0)) || (b.prio - a.prio));
    for (const p of drawList) {
      // T1: etykieta na żądanie — cała gaśnie i rozjaśnia się z rozwinięciem (czas realny).
      p.fade = p.demand ? p.demandAlpha : fadeAlpha(F.now, this._born.get(p.key));
      if (p.kind === 'rail') {
        p.rail = railRows(p);
        for (const r of p.rail.rows) zones.push({ x: r.x, y: r.y, w: r.w, h: r.h, key: r.key, target: r.target, kind: r.kind });
      } else zones.push({ x: p.x, y: p.y, w: p.w, h: p.h, key: p.key, target: p.target, kind: p.kind });
    }
    this._zones = zones;
    // T2 — strefy przypiętej etykiety (przyciski, linia nazwy, całość) z tej klatki; brak przypiętej w kadrze — brak stref.
    const pinPlaced = T2 ? drawList.find((p) => p.pinLabel === true) : null;
    this._pinZones = pinPlaced ? this._t2Zones(pinPlaced, T2) : [];
    this._last = { labels: drawList, arrows, obstacles };
    return { count: drawList.length + arrows.length, animating: fading || T?.animating === true, labels: drawList, arrows };
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
    // T2: przy `labelPin` panel stacji się nie rysuje (jego stan = przypięcie stacji) — prostokąt z dawnej klatki nie jest przeszkodą.
    const spDrawn = !(isLabelPinActive(GAME_CONFIG.FEATURES) && K?.civMode);
    if (sr && spDrawn && sp.visible && !sp._float?.minimized) out.push({ x: sr.px, y: sr.py, w: sr.PW, h: sr.PH });
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

  // `expFrom` / `expAlpha` (REFORMA ZAKŁADEK T1): linie od `expFrom` (rozwinięcie) z dodatkowym kryciem (fade-in / wygasanie);
  // domyślnie — bez zmian (wszystkie linie jak dziś). `hoverBtn` (T2): przycisk przypięcia pod kursorem.
  _drawBox(ctx, box, lines, color, barAlpha, fade, alignRight = false, expFrom = Infinity, expAlpha = 1, hoverBtn = null) {
    const R = HUD_LABELS;
    ctx.globalAlpha = barAlpha * fade;
    ctx.fillStyle = THEME.bgPrimary;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    let y = box.y + R.PAD_Y;
    lines.forEach((ln, i) => {
      if (i > 0) y += R.LINE_GAP;
      const x = alignRight ? box.x + box.w - R.PAD_X - ln.w : box.x + R.PAD_X;
      const a = (i === 0 ? 1 : R.SUB_ALPHA) * fade * (i >= expFrom ? expAlpha : 1);
      if (ln.kind === 'actions') this._drawActions(ctx, ln, x, y, color, fade * (i >= expFrom ? expAlpha : 1), hoverBtn);
      else this._drawLine(ctx, ln, x, y + ln.size, color, a);
      y += ln.h;
    });
  }

  /**
   * REFORMA ZAKŁADEK T2 — wiersz akcji przypięcia: przyciski tekstowe w stylu etykiety („[ Mapa ciała ]”), kolor roli etykiety;
   * przycisk pod kursorem — podświetlenie tła tą samą rolą i pełne krycie tekstu.
   */
  _drawActions(ctx, ln, x, y, color, alpha, hoverBtn) {
    const base = y + LABEL_PIN.ROW_PAD_Y + ln.size;
    for (const b of ln.btns) {
      const hov = b.id === hoverBtn;
      if (hov) {
        ctx.globalAlpha = 0.18 * alpha;
        ctx.fillStyle = color;
        ctx.fillRect(x + b.x - LABEL_PIN.BTN_HIT_PAD_X, y, b.w + 2 * LABEL_PIN.BTN_HIT_PAD_X, ln.h);
      }
      this._drawLine(ctx, b.ln, x + b.x, base, color, (hov ? 1 : 0.9) * alpha);
    }
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
          this._drawBox(ctx, { x: r.x, y: r.y, w: r.w, h: r.h }, r.lines, color, r.selected ? R.BAR_ALPHA_SELECTED : R.BAR_ALPHA, fade, p.side === 'W',
            r.expFrom ?? Infinity, r.expAlpha ?? 1);
        }
        continue;
      }
      const ux = p.side === 'E' ? p.x + p.w : p.x;
      ctx.moveTo(p.attach.x, p.attach.y);
      ctx.lineTo(ux, p.attach.y);
      ctx.stroke();
      // T1 (I8.3): rozwinięta etykieta po stronie W rośnie W LEWO (prawa krawędź przy kotwicy) — tekst do prawej, nazwa stoi.
      this._drawBox(ctx, p, p.lines, color, p.selected ? R.BAR_ALPHA_SELECTED : R.BAR_ALPHA, fade, p.expanded === true && p.side === 'W',
        p.expFrom ?? Infinity, p.expAlpha ?? 1, p.pinHover ?? null);
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
    // REFORMA ZAKŁADEK T2 — przypięta etykieta: przycisk > linia nazwy (reguła D-UI-5 — przypięty obiekt jest zaznaczeniem, więc
    // klik = kamera) > reszta (klik pochłonięty — nie idzie do mapy); tarcza pod przypiętą etykietą nie wygrywa.
    if (this._prep?.on && this._prep.t2?.ck && isLabelPinActive(GAME_CONFIG.FEATURES)) {
      const pz = pinHitAt(this._pinZones, x, y);
      if (pz) {
        if (pz.kind === 'btn') this._t2Run(pz, K);
        else if (pz.kind === 'name' && pz.target) clickObject(pz.target, { K, emit: (n, p) => EventBus.emit(n, p) });
        return true;
      }
    }
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

  /**
   * REFORMA ZAKŁADEK T1 — tożsamość obiektu z rozwinięciem z najechania (`body:X`, `station:Y`, `vessel:V`, `lbl:…`) albo
   * `null` (flaga OFF, brak najechania). Czyta ją scena (współrzędne pustej mapy nie przykrywają rozwinięcia).
   */
  hoverObjectKey() {
    return this._prep?.on && this._prep.t1 ? (this._prep.t1.hov.key ?? null) : null;
  }

  /**
   * REFORMA ZAKŁADEK T1 — punkt (px logiczne) pod etykietą z ostatniej klatki, pod stacją oglądanego układu albo przy
   * aktywnym najechaniu (scena: współrzędne pustej mapy nie przykrywają rozwinięcia — 530). Flaga OFF — `false`.
   */
  coversPoint(lx, ly) {
    if (!this._prep?.on || !this._prep.t1) return false;
    if (this._prep.t1.hov.key != null || resolveLabelClick(this._zones, lx, ly) != null) return true;
    const K = (typeof window !== 'undefined') ? window.KOSMOS : null;
    const st = [];
    for (const id of K?.threeRenderer?._stations?.keys?.() ?? []) st.push({ id, disc: objectScreenDisc(K, 'station', id) });
    return pickStationAt(st, lx, ly) != null;
  }

  /** REFORMA ZAKŁADEK T2 — przycisk przypięcia pod punktem (px logiczne) z ostatniej klatki albo `null` (kursor „rączki”). */
  pinButtonAt(lx, ly) {
    if (!this._prep?.on || !this._prep.t2?.ck) return null;
    const z = pinHitAt(this._pinZones, lx, ly);
    return z?.kind === 'btn' ? z.id : null;
  }

  /** Odczyt dla bramki: etykiety z ostatniej klatki rysunku (px logiczne). */
  debug() {
    const r1 = (v) => (Number.isFinite(v) ? +v.toFixed(1) : v);
    const L = this._last;
    const T = this._prep?.t1 ?? null;
    const T2 = this._prep?.t2 ?? null;
    return {
      id: 'labels', on: this._prep.on,
      labels: (L?.labels ?? []).map((p) => ({
        key: p.key, kind: p.kind, text: p.kind === 'rail' ? p.rows.map((r) => r.lines[0].text) : p.lines.map((l) => l.text),
        x: r1(p.x), y: r1(p.y), w: r1(p.w), h: r1(p.h), side: p.side, below: p.below, cand: p.cand, overlap: p.overlap,
        selected: !!p.selected, fade: r1(p.fade), anchor: { x: r1(p.ax), y: r1(p.ay) },
        ...(T ? { expanded: !!p.expanded || (p.kind === 'rail' && p.rows.some((r) => r.expanded)), pinned: !!p.pinned,
          rows: p.kind === 'rail' ? p.rows.map((r) => r.lines.map((l) => l.text)) : undefined } : {}),
        ...(p.pinLabel ? { pinLabel: true, pinShift: r1(p.pinShift ?? 0) } : {}),
      })),
      arrows: (L?.arrows ?? []).map((a) => ({ edge: a.edge, x: r1(a.x), y: r1(a.y), count: a.count, role: a.role })),
      zones: this._zones.length,
      ...(T ? { hover: { key: T.hov.key, alpha: r1(T.hov.alpha), lingering: T.hov.lingering }, expanded: [...T.contentKeys],
        demand: T.demand.map((d) => d.key) } : {}),
      // REFORMA ZAKŁADEK T2 — przypięcie (odczyt bramki): obiekt, lista otwarta, przycisk pod kursorem, przyciski i strefy.
      ...(T2 ? { pin: { ck: T2.ck, open: T2.open, hover: T2.hoverBtn, buttons: (T2.pin?.buttons ?? []).map((b) => b.id),
        zones: this._pinZones.map((z) => ({ kind: z.kind, id: z.id ?? null, x: r1(z.x), y: r1(z.y), w: r1(z.w), h: r1(z.h) })) } } : {}),
    };
  }
}
