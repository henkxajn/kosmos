// HudGalaxyLabelLayer — ARC GALAXY, krok G1 (docs/design/GALAXY_PLAN.md §4 G1, HUD S0): podwarstwa NAZW płyty galaktyki
// warstwy HUD 2D (`HudLayer`, lista podwarstw trybu galaktyki — w trybie układu nie biegnie wcale).
//   • nazwa WERSALIKAMI pod każdą gwiazdą z ujawnioną nazwą (`reveal.name` — kanon `SystemReveal`, składany
//     w `SystemRevealWorld`) albo z własną obecnością gracza (ta sama reguła co lista lewego outlinera trybu galaktyki —
//     `GalaxyOutlinerLogic`); „???” nigdy — gwiazda bez nazwy zostaje goła;
//   • role motywu (H0): własny (dom albo układ z obecnością gracza) `primary`, zbadany `textPrimary`, niezbadany `dim`
//     (reguła etykiet nieba — `HudSkyLabelLogic`);
//   • istniejący anti-overlap warstwy etykiet (`placeLabels`) z kandydatem „pod gwiazdą, wyśrodkowana” na pierwszym miejscu
//     (`GalaxyModeLogic.galaxyLabelCandidates`); gwiazdy płyty są przeszkodami (etykieta nie przykrywa sąsiada); zaznaczona
//     i dom kładzione najpierw (priorytet);
//   • nawiasy ⌜⌟ wokół gwiazdy zaznaczonej (rola `primary`); klik w nazwę = klik w gwiazdę (strefa HUD przed wyborem płyty);
//   • twarde cięcie: cała podwarstwa rozjaśnia się w `GALAXY_FADE_MS` od wejścia w tryb (ten sam zegar co płyta).
// Bez rozwinięcia najechania i bez przypięcia (G2).
// ARC GALAXY, krok G2-2 (flaga `galaxyLook`; D-GX-13, D-GX-16, D-GX-17 (c); rama F5 — idiom etykiet mapy układu: najechanie
// rozwija, klik przypina z akcjami): przy fladze ON warstwa dokłada —
//   • ROZWINIĘCIE najechania (≤ 4 linie pod nazwą WERSALIKAMI: właściciel wg `SystemRevealWorld`, odległość ly · klasa ·
//     kolonie, stan zbadania, skan) — pamięć najechania `makeHoverMemory` (150 ms wejścia, 200 ms wygasania), etykieta
//     rozwinięta trzyma swojego kandydata (`pinFor` / `updatePins` — pasek rośnie w dół, sąsiedzi ustępują);
//   • PRZYPIĘCIE gwiazdy zaznaczonej (zaznaczenie = przypięcie, jak w trybie układu) — to samo rozwinięcie + wiersz akcji
//     (`GalaxyChromeLogic.galaxyPinButtons`: [ Wejdź ] (gdy da się wejść), [ Wyślij ▼ ] (wyłączony do G3), [ Skanuj ] /
//     [ Skanuj dokładniej ] / [ Anuluj skan ] — `ObservatorySystem.startSystemScan` / `cancelSystemScan`; chip wyłączony
//     z powodem w linii pod wierszem akcji przy najechaniu); linia skanu w toku widoczna w rozwinięciu przypiętej gwiazdy
//     także bez najechania; [ Beacon ] / [ Gate ] pominięte (D-GX-17 (c));
//   • GĘSTOŚĆ (D-GX-16): nigdy nie chowane — dom, własne, zaznaczona, najechana, cel nurkowania, skanowana; pozostałe chowane
//     przy nakładaniu (`placeLabels` z `hideOnOverlap`), odsłaniane najechaniem; chip [E] wyłączony — tylko nigdy nie chowane;
//   • NAWIASY ⌜⌟: zaznaczona (jak G1), cel nurkowania od dwóch ostatnich ząbków nad podłogą (`diveBracketsVisible`),
//     skanowana — z oddechem krycia na zegarze symulacji (`breathAlpha`, B-1);
//   • KLIK: przycisk przypięcia > linia nazwy przypiętej > reszta przypiętej (pochłonięty) > nazwa — z wetem gwiazdy pod
//     kursorem (gwiazda innej nazwy wygrywa — nazwa nie kradnie kliku sąsiada, Finding 110); krycie × chrom lotu.
// Flaga OFF — ścieżka G1 co do bitu (metody `_g1*`).
// ⚠ Moduł importuje się pod node (keeper `galaxy_pick_smoke` — atrapa świata): bez three i bez DOM.
import EventBus from '../core/EventBus.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { THEME } from '../config/ThemeConfig.js';
import { t, getLocale } from '../i18n/i18n.js';
import { themeToken } from './HudPalette.js';
import { HUD_LABELS, placeLabels, threadGeometry, updateBorn, fadeAlpha, pointInRect, resolveLabelClick } from './HudLabelLogic.js';
import { HUD_ATTENTION, bracketCorners, breathAlpha } from './HudAttentionLogic.js';
import { skyLabelRelation, skyLabelRole, skyLabelColor } from './HudSkyLabelLogic.js';
import { galaxyLabelCandidates, galaxyLabelPrio, galaxyLabelText, GALAXY_FADE_MS, LIVE_GALAXY } from './GalaxyModeLogic.js';
import { galaxyWorldContext, buildGalaxySystemList } from './GalaxyOutlinerLogic.js';
import { isSystemExplored, HOME_SYSTEM_ID } from '../utils/SystemExploration.js';
import { fmtDec } from './NumberFormatLogic.js';
import { makeHoverMemory, pinFor, updatePins, placeLabelsPinned } from './LabelHoverLogic.js';
import { LABEL_PIN, layoutButtonRows, pinHitAt } from './LabelPinLogic.js';
import {
  UNNAMED_SYSTEM, galaxyOwnerText, galaxyInfoText, galaxyScanLine, galaxyBodiesLine, galaxyExpansionLines, galaxyScanChip, galaxyPinButtons,
  runGalaxyPinAction, galaxyLabelEssential, galaxyChromeAlpha, galaxyPointerTarget,
} from './GalaxyChromeLogic.js';
import { diveBracketsVisible } from './GalaxyGestureLogic.js';
import { observatoryRangeLY, inObservatoryRange } from '../utils/ObservatoryRange.js';

// Rysunek i układ (px logiczne). Strojenie okiem — stałe rysunku bez pinów keepera.
export const HUD_GALAXY_LABELS = Object.freeze({
  STAR_CLEAR_PX: 5,        // prześwit wokół gwiazdy (kandydat „pod” zaczyna się niżej)
  GAP_BELOW_PX: 3,         // odstęp nazwy pod gwiazdą
  STAR_OBSTACLE_PX: 4,     // promień gwiazdy jako przeszkoda etykiet
  BRACKET_HALF: 9,         // połowa boku nawiasów zaznaczonej gwiazdy
  LETTER_SPACING: 1,       // wersaliki — odstęp liter (px)
  WORLD_TTL_MS: 250,       // pamięć kontekstu świata (obecność gracza) — `prepare` biegnie co klatkę
  // G2-2
  SUB_MAX_PX: 230,         // linia rozwinięcia — ucinana dłuższa (szerokość wiersza akcji `LABEL_PIN.ROW_MAX_W`)
  NON_ESSENTIAL_PRIO: 5000, // priorytet rozkładu nazw chowanych przy nakładaniu (po nigdy nie chowanych)
});

/** Flaga kroku G2 (czytana co klatkę). */
const galaxyLookOn = () => !!GAME_CONFIG.FEATURES?.galaxyView && !!GAME_CONFIG.FEATURES?.galaxyLook;
const nowMs = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());

const MEASURE_CACHE_MAX = 600;

export class HudGalaxyLabelLayer {
  constructor(hud = null) {
    this._hud = hud;
    this.mode = 'galaxy';                 // `HudLayer`: lista podwarstw trybu galaktyki
    this._prep = { on: false, items: [], sel: null };
    this._last = { labels: [], bracket: null };
    this._candPrev = new Map();
    this._born = new Map();
    this._measure = new Map();
    this._sysRef = null;
    this._byId = new Map();
    this._world = null;
    this._worldT = -Infinity;
    this._look = false;               // G2 — gałąź klatki (ustala `prepare`; `collect` / `draw` / klik idą tą samą)
    this._g2 = { p: null, pins: new Map(), born: new Map(), candPrev: new Map(), hover: makeHoverMemory(), zones: [],
      pinZones: [], rows: null, rowsT: -Infinity, rowsK: null, last: { labels: [], brackets: [] } };
  }

  _width(font, size, s, spacing) {
    const k = font + '|' + spacing + '|' + s;
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
    w += spacing * Math.max(0, s.length - 1);
    if (this._measure.size > MEASURE_CACHE_MAX) this._measure.clear();
    this._measure.set(k, w);
    return w;
  }

  _systems(K) {
    const systems = K?.galaxyData?.systems ?? [];
    if (this._sysRef !== systems) {
      this._sysRef = systems;
      this._byId = new Map(systems.map((s) => [String(s?.id), s]));
    }
    return this._byId;
  }

  // Kontekst świata (obecność gracza, kanon mgły) — co najwyżej raz na WORLD_TTL_MS czasu realnego.
  _worldCtx(K, now) {
    if (!this._world || !(now - this._worldT < HUD_GALAXY_LABELS.WORLD_TTL_MS) || this._world.__K !== K) {
      this._world = galaxyWorldContext(K, { groundUnits: K?.uiManager?._outlinerState?.groundUnits ?? [] });
      this._world.__K = K;
      this._worldT = now;
    }
    return this._world;
  }

  // ── Dyspozytor G1 / G2 (flaga `galaxyLook`) ──────────────────────────────────────────────────────────────────────
  prepare(F) {
    this._look = galaxyLookOn();
    return this._look ? this._g2Prepare(F) : this._g1Prepare(F);
  }
  collect(F, proj) { return this._look ? this._g2Collect(F, proj) : this._g1Collect(F, proj); }
  draw(ctx, F, c) { return this._look ? this._g2Draw(ctx, F, c) : this._g1Draw(ctx, F, c); }
  handleClick(x, y, rawX, rawY) { return this._look ? this._g2HandleClick(x, y, rawX, rawY) : this._g1HandleClick(x, y); }
  coversPoint(lx, ly) { return this._look ? this._g2Covers(lx, ly) : !!this._zoneAt(lx, ly); }
  coversUiPoint(lx, ly) { return this._look ? this._g2Covers(lx, ly) : !!this._zoneAt(lx, ly); }
  /** G2 — przycisk przypięcia pod punktem (kursor „rączki”); G1 — brak. */
  pinButtonAt(lx, ly) {
    if (!this._look) return null;
    const z = pinHitAt(this._g2.pinZones, lx, ly);
    return z?.kind === 'btn' ? z.id : null;
  }
  /** G2 — gwiazda z rozwinięciem z najechania (`galaxy:<id>`) albo `null`. */
  hoverObjectKey() { return this._look && this._g2.p?.hovId != null ? 'galaxy:' + this._g2.p.hovId : null; }

  /** Tryb galaktyki aktywny i gwiazdy płyty z treścią etykiet — część klucza klatki. */
  _g1Prepare(F) {
    const K = F.K, gm = K?.galaxyMode, tr = K?.threeRenderer;
    if (gm?.isActive !== true || typeof tr?.getGalaxyStarsWorld !== 'function') {
      this._prep = { on: false, items: [], sel: null };
      return 'gal:0';
    }
    const stars = tr.getGalaxyStarsWorld();
    const byId = this._systems(K);
    const world = this._worldCtx(K, F.now);
    const sel = gm.selectedSystemId ?? null;
    const loc = getLocale();
    const items = [];
    for (const st of stars) {
      const id = String(st.id);
      const sys = byId.get(id) ?? null;
      const home = id === HOME_SYSTEM_ID || sys?.isHome === true;
      const own = home || world.presence.get(id)?.own === true;
      let named = own;
      if (!named) { try { named = world.reveal(sys).name === true; } catch { named = false; } }
      const relation = skyLabelRelation({ own, explored: isSystemExplored(sys) });
      items.push({ id, w: st, sys, home, selected: id === sel, relation, role: skyLabelRole(relation),
        text: named ? galaxyLabelText(sys?.name ?? id, loc) : null, distLy: Number(sys?.distanceLY) || 0 });
    }
    let key = `gal:1:${sel ?? ''}:${loc}:${Math.round(F.now - (tr._galaxyFadeT0 ?? 0)) < GALAXY_FADE_MS ? 'f' : 's'}`;
    for (const it of items) key += `|${it.id}:${it.role}:${it.text ? 1 : 0}`;
    this._prep = { on: true, items, sel };
    return key;
  }

  /** Geometria (px logiczne): rzut gwiazd, rozkład nazw, nawiasy zaznaczonej. */
  _g1Collect(F, proj) {
    const P = this._prep;
    if (!P.on || !proj) {
      this._born.clear();
      this._last = { labels: [], bracket: null };
      return { count: 0, animating: false, labels: [], bracket: null };
    }
    const K = F.K, tr = K?.threeRenderer, map = F.mapRect, G = HUD_GALAXY_LABELS, R = HUD_LABELS;
    const pts = [];
    for (const it of P.items) {
      const p = proj.point(it.w.x, it.w.y, it.w.z);
      if (p) pts.push({ ...it, x: p.x, y: p.y });
    }
    const obstacles = pts.map((p) => ({ cx: p.x, cy: p.y, r: G.STAR_OBSTACLE_PX, id: p.id }));
    const size = (THEME.fontSizeNormal ?? 11) + R.MAIN_SIZE_DELTA;
    const font = `${size}px ${THEME.fontFamily}`;
    const items = [];
    for (const p of pts) {
      if (!p.text || !pointInRect(p.x, p.y, map)) continue;
      const w = this._width(font, size, p.text, G.LETTER_SPACING) + 2 * R.PAD_X;
      const h = size + 3 + 2 * R.PAD_Y;
      items.push({ key: 'g:' + p.id, id: p.id, ax: p.x, ay: p.y, clear: G.STAR_CLEAR_PX, gapBelow: G.GAP_BELOW_PX, w, h,
        prio: galaxyLabelPrio({ selected: p.selected, home: p.home, relation: p.relation, distLy: p.distLy }),
        ownObstacle: obstacles.find((o) => o.id === p.id) ?? null, text: p.text, role: p.role, size, font });
    }
    const { placed } = placeLabels(items, { rect: map, obstacles, prev: this._candPrev, candidatesOf: galaxyLabelCandidates });
    this._candPrev = new Map(placed.map((p) => [p.key, p.cand]));
    const fading = updateBorn(this._born, placed.map((p) => p.key), F.now);
    const modeK = Math.min(1, Math.max(0, (F.now - (tr?._galaxyFadeT0 ?? -Infinity)) / GALAXY_FADE_MS));
    const labels = placed.map((p) => ({ ...p, fade: fadeAlpha(F.now, this._born.get(p.key)) * modeK }));
    let bracket = null;
    const selP = P.sel != null ? pts.find((p) => p.id === String(P.sel)) : null;
    if (selP && pointInRect(selP.x, selP.y, map)) {
      const half = G.BRACKET_HALF;
      bracket = { id: selP.id, cx: selP.x, cy: selP.y, half,
        arm: Math.max(1, Math.min(HUD_ATTENTION.BRACKET_ARM_PX, 2 * half * HUD_ATTENTION.BRACKET_ARM_FRAC)), fade: modeK };
    }
    this._last = { labels, bracket };
    return { count: labels.length + (bracket ? 1 : 0), animating: fading || modeK < 1, labels, bracket };
  }

  _g1Draw(ctx, F, c) {
    const R = HUD_LABELS, G = HUD_GALAXY_LABELS;
    const roles = F.roles;
    const textPrimary = themeToken(THEME, 'textPrimary');
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.setLineDash([]);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if (c.bracket) {
      const b = c.bracket;
      ctx.strokeStyle = roles.primary;
      ctx.lineWidth = HUD_ATTENTION.BRACKET_WIDTH;
      ctx.globalAlpha = b.fade ?? 1;
      ctx.beginPath();
      for (const cr of bracketCorners({ cx: b.cx, cy: b.cy, half: b.half, arm: b.arm })) {
        const q = cr.pts;
        ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); ctx.lineTo(q[4], q[5]);
      }
      ctx.stroke();
    }
    for (const m of c.labels ?? []) {
      const fade = m.fade ?? 1;
      if (!(fade > 0)) continue;
      const color = skyLabelColor(m.role, roles, textPrimary);
      if (m.side !== 'C') {
        // Kandydat zastępczy (nazwa nie zmieściła się pod gwiazdą) — nitka od gwiazdy, jak etykiety warstwy.
        const th = threadGeometry(m);
        ctx.strokeStyle = color;
        ctx.lineWidth = R.THREAD_WIDTH;
        ctx.globalAlpha = R.THREAD_ALPHA * fade;
        ctx.beginPath();
        ctx.moveTo(th.x0, th.y0);
        ctx.lineTo(th.x1, th.y1);
        ctx.stroke();
      }
      ctx.globalAlpha = R.BAR_ALPHA * fade;
      ctx.fillStyle = THEME.bgPrimary;
      ctx.fillRect(m.x, m.y, m.w, m.h);
      ctx.font = m.font;
      ctx.fillStyle = color;
      ctx.globalAlpha = fade;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${G.LETTER_SPACING}px`;
      ctx.fillText(m.text, m.x + R.PAD_X, m.y + R.PAD_Y + m.size);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }
    ctx.globalAlpha = 1;
  }

  _zoneAt(x, y) {
    const zones = (this._last.labels ?? []).map((l) => ({ x: l.x, y: l.y, w: l.w, h: l.h, id: l.id }));
    return resolveLabelClick(zones, x, y);
  }

  /** Klik w nazwę = klik w jej gwiazdę (zaznaczenie; dwuklik — wejście) — strefa HUD przed wyborem płyty. */
  _g1HandleClick(x, y) {
    const z = this._zoneAt(x, y);
    if (!z) return false;
    const K = (typeof window !== 'undefined') ? window.KOSMOS : null;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    K?.galaxyMode?.onPlateClick?.(z.id, now);
    return true;
  }

  // ══ G2-2 ══════════════════════════════════════════════════════════════════════════════════════════════════════════

  /** Wiersze układów (także bez nazwy — treść przypięcia / najechania) z kontekstu świata; pamięć `WORLD_TTL_MS`. */
  _g2Rows(K, world, now) {
    const g = this._g2;
    if (!g.rows || g.rowsK !== world || !(now - g.rowsT < HUD_GALAXY_LABELS.WORLD_TTL_MS)) {
      g.rows = buildGalaxySystemList({ ...world, includeUnknown: true }).byId;
      g.rowsK = world;
      g.rowsT = now;
    }
    return g.rows;
  }

  /** Linie rozwinięcia (≤ 4) — te same funkcje co wiersz lewego outlinera (anty-lustro). */
  _g2Lines(K, row, scans, loc) {
    const ownerText = galaxyOwnerText(row.owner, { t, empireName: (id) => K?.empireRegistry?.get?.(id)?.name ?? null });
    const infoText = galaxyInfoText(row, { t, fmtLy: (v) => fmtDec(v, 1, loc) });
    const sc = scans.get(String(row.systemId)) ?? null;
    const scanRes = K?.observatorySystem?.getSystemScanResult?.(row.systemId) ?? null;
    // Postęp skanu ma pierwszeństwo; poza nim — linia ciał (G2 T4: układ wygenerowany albo wynik skanu wg tieru).
    const scanLine = sc ? galaxyScanLine({ scanning: sc }, { t, fmtDec: (v, d) => fmtDec(v, d, loc) })
      : galaxyBodiesLine({ placeKnown: row.placeKnown === true || row.isHome === true,
        sysData: K?.starSystemManager?.getSystem?.(row.systemId) ?? null, scanResult: scanRes }, { t });
    return galaxyExpansionLines(row, { t, ownerText, infoText, explored: isSystemExplored(row.sys) || row.isHome === true, scanLine });
  }

  /** Przypięcie (gwiazda zaznaczona): rozwinięcie + przyciski (skan: tabela stanów `galaxyScanChip`). */
  _g2Pin(K, row, scans, world, loc) {
    const obs = K?.observatorySystem;
    const systems = K?.galaxyData?.systems ?? [];
    const home = systems.find((s) => s?.isHome === true) ?? { x: 0, y: 0 };
    const rangeLY = observatoryRangeLY(obs?.getMaxObservatoryLevel?.() ?? 0);
    const id = String(row.systemId);
    const chip = galaxyScanChip({
      isHome: row.isHome === true, explored: isSystemExplored(row.sys), maxTier: obs?.getMaxSystemScanTier?.() ?? 0,
      resultTier: obs?.getSystemScanResult?.(id)?.tier ?? null, scanning: scans.has(id),
      atLimit: !!obs && (obs.getActiveSystemScans?.()?.length ?? 0) >= (obs.getMaxConcurrentSystemScans?.() ?? 1),
      inRange: inObservatoryRange(row.sys, home, rangeLY), rangeGate: Number(LIVE_GALAXY.SCAN_RANGE_GATE) !== 0,
    });
    const enterable = K?.galaxyMode?.canEnter?.(id, world) === true;
    return { id, lines: this._g2Lines(K, row, scans, loc), buttons: galaxyPinButtons({ enterable, scanChip: chip, t }), chip };
  }

  _g2Prepare(F) {
    const K = F.K, gm = K?.galaxyMode, tr = K?.threeRenderer;
    const g = this._g2;
    if (gm?.isActive !== true || typeof tr?.getGalaxyStarsWorld !== 'function') {
      this._prep = { on: false, items: [], sel: null };
      g.p = null;
      g.hover.clear();
      return 'gal2:0';
    }
    const stars = tr.getGalaxyStarsWorld();
    const byId = this._systems(K);
    const world = this._worldCtx(K, F.now);
    const rows = this._g2Rows(K, world, F.now);
    const sel = gm.selectedSystemId ?? null;
    const loc = getLocale();
    // Najechanie: ta sama reguła co klik (`galaxyPointerTarget` — Finding 109): przypięcie z ostatniej klatki, gwiazda pod
    // kursorem, nazwa.
    const ptr = F.pointer;
    let raw = null;
    if (ptr && !ptr.overUI && !gm.isFlying) {
      const pz = pinHitAt(g.pinZones, ptr.lx, ptr.ly);
      const nz = pz ? null : resolveLabelClick(g.zones, ptr.lx, ptr.ly);
      raw = galaxyPointerTarget({ pinZone: pz, nameZone: nz, starUnder: pz ? null : (tr.galaxyStarAt?.(ptr.rawX, ptr.rawY) ?? null) }).id;
    }
    const hov = g.hover.update(raw, F.now);
    const hovId = hov.key != null ? String(hov.key) : null;
    // Cel nurkowania i nawiasy od dwóch ostatnich ząbków nad podłogą.
    const cam = tr._cameraController;
    const diveId = gm.diveTargetId?.(world) ?? null;
    const diveBr = diveId != null && !!cam && diveBracketsVisible(cam._targetDist, cam.minDist);
    const scans = new Map((K.observatorySystem?.getActiveSystemScans?.() ?? []).map((sc) => [String(sc.systemId), sc]));
    const labelsOn = F.att?.layers?.labels !== false;
    const items = [];
    for (const st of stars) {
      const id = String(st.id);
      const sys = byId.get(id) ?? null;
      const row = rows.get(id) ?? null;
      const home = id === HOME_SYSTEM_ID || sys?.isHome === true;
      const own = home || world.presence.get(id)?.own === true;
      const named = row ? row.known === true : own;
      const selected = id === sel, hovered = id === hovId && !selected, dive = diveId === id, scanning = scans.has(id);
      const essential = galaxyLabelEssential({ home, own, selected, hovered, dive, scanning });
      const relation = skyLabelRelation({ own, explored: isSystemExplored(sys) });
      const text = named ? galaxyLabelText(sys?.name ?? id, loc) : ((selected || hovered) ? UNNAMED_SYSTEM : null);
      items.push({ id, w: st, sys, row, home, own, selected, hovered, dive, scanning, essential, relation, role: skyLabelRole(relation),
        text, distLy: Number(sys?.distanceLY) || 0 });
    }
    const selRow = sel != null ? rows.get(String(sel)) : null;
    const pin = selRow ? this._g2Pin(K, selRow, scans, world, loc) : null;
    const hovRow = hovId != null && hovId !== sel ? rows.get(hovId) : null;
    const hovLines = hovRow ? this._g2Lines(K, hovRow, scans, loc) : null;
    const pz = ptr && !ptr.overUI ? pinHitAt(g.pinZones, ptr.lx, ptr.ly) : null;
    const hoverBtn = pz?.kind === 'btn' ? pz.id : null;
    const fade = galaxyChromeAlpha({ flightAlpha: tr._galaxyChromeAlpha, now: F.now, fadeT0: tr._galaxyFadeT0, fadeMs: GALAXY_FADE_MS });
    let key = `gal2:1:${sel ?? ''}:${hovId ?? ''}:${Math.round(hov.alpha * 20)}:${diveId ?? ''}:${diveBr ? 1 : 0}:${labelsOn ? 1 : 0}:${loc}`
      + `:${hoverBtn ?? ''}:${Math.round(fade * 40)}`;
    if (pin) key += `|P${pin.lines.join('/')}|${pin.buttons.map((b) => `${b.id}${b.enabled ? 1 : 0}${b.label}`).join(',')}`;
    if (hovLines) key += `|H${hovLines.join('/')}`;
    if (scans.size && F.sim != null) key += `|s${Math.round(F.sim / 40)}`;   // oddech nawiasów skanu (zegar symulacji)
    for (const it of items) key += `|${it.id}:${it.role}:${it.text ? 1 : 0}${it.essential ? 'e' : ''}`;
    g.p = { on: true, items, sel, hovId, hovAlpha: hov.alpha, hovAnimating: hov.animating, diveId, diveBr, scans, pin, hovLines, hoverBtn,
      labelsOn, fade };
    this._prep = { on: true, items, sel };
    return key;
  }

  /** Linia tekstu (pomiar z odstępem liter), ucinana do `maxW`. */
  _g2Line(text, font, size, spacing = 0, maxW = null) {
    let s = String(text ?? '');
    if (maxW && this._width(font, size, s, spacing) > maxW) {
      while (s.length > 1 && this._width(font, size, s + '…', spacing) > maxW) s = s.slice(0, -1);
      s += '…';
    }
    return { text: s, font, size, spacing, w: this._width(font, size, s, spacing), h: size + 3 };
  }

  _g2Collect(F, proj) {
    const g = this._g2, P = g.p;
    if (!P?.on || !proj) {
      g.born.clear(); g.zones = []; g.pinZones = []; g.last = { labels: [], brackets: [] };
      this._last = { labels: [], bracket: null };
      return { count: 0, animating: false, labels: [], brackets: [] };
    }
    const K = F.K, map = F.mapRect, G = HUD_GALAXY_LABELS, R = HUD_LABELS;
    const pts = [];
    for (const it of P.items) { const p = proj.point(it.w.x, it.w.y, it.w.z); if (p) pts.push({ ...it, x: p.x, y: p.y }); }
    const obstacles = pts.map((p) => ({ cx: p.x, cy: p.y, r: G.STAR_OBSTACLE_PX, id: p.id }));
    for (const s of this._hud?._galaxySublayers ?? []) {
      if (!s || s === this || typeof s.labelObstacles !== 'function') continue;
      for (const o of s.labelObstacles(F) ?? []) obstacles.push(o);
    }
    const size = (THEME.fontSizeNormal ?? 11) + R.MAIN_SIZE_DELTA;
    const font = `${size}px ${THEME.fontFamily}`, fontB = `bold ${font}`;
    const sub = THEME.fontSizeSmall ?? 9;
    const subFont = `${sub}px ${THEME.fontFamily}`;
    const items = [], expanded = new Set();
    for (const p of pts) {
      if (!p.text || !pointInRect(p.x, p.y, map)) continue;
      if (!P.labelsOn && !p.essential) continue;
      const lines = [this._g2Line(p.text, p.selected ? fontB : font, size, G.LETTER_SPACING)];
      lines[0].kind = 'name';
      const baseH = lines[0].h + 2 * R.PAD_Y;
      let expFrom = Infinity, expAlpha = 1, pinLabel = false;
      if (p.selected && P.pin && P.pin.id === p.id) {
        expFrom = 1; pinLabel = true;
        for (const s of P.pin.lines) lines.push(this._g2Line(s, subFont, sub, 0, G.SUB_MAX_PX));
        const btnLine = (b) => this._g2Line(`[ ${b.label} ]`, subFont, sub);
        for (const row of layoutButtonRows(P.pin.buttons, (b) => btnLine(b).w)) {
          const btns = row.map((r) => { const b = P.pin.buttons.find((q) => q.id === r.id); return { id: r.id, x: r.x, w: r.w, ln: btnLine(b), enabled: b.enabled }; });
          const last = btns[btns.length - 1];
          lines.push({ kind: 'actions', size: sub, w: last ? last.x + last.w : 0, h: sub + 3 + 2 * LABEL_PIN.ROW_PAD_Y, btns });
        }
        const hb = P.hoverBtn != null ? P.pin.buttons.find((b) => b.id === P.hoverBtn) : null;
        if (hb && hb.enabled !== true && hb.reason) { const ln = this._g2Line(hb.reason, subFont, sub, 0, G.SUB_MAX_PX); ln.kind = 'reason'; lines.push(ln); }
      } else if (p.hovered && P.hovLines) {
        expFrom = 1; expAlpha = P.hovAlpha;
        for (const s of P.hovLines) lines.push(this._g2Line(s, subFont, sub, 0, G.SUB_MAX_PX));
      }
      let w = 0, h = 2 * R.PAD_Y;
      lines.forEach((ln, i) => { w = Math.max(w, ln.w); h += ln.h + (i > 0 ? R.LINE_GAP : 0); });
      w += 2 * R.PAD_X;
      const key = 'g:' + p.id;
      const it = { key, id: p.id, ax: p.x, ay: p.y, clear: G.STAR_CLEAR_PX, gapBelow: G.GAP_BELOW_PX, w, h, lines, expFrom, expAlpha,
        pinLabel, essential: p.essential, role: p.role, selected: p.selected,
        prio: (p.essential ? 0 : G.NON_ESSENTIAL_PRIO) + galaxyLabelPrio({ selected: p.selected, home: p.home, relation: p.relation, distLy: p.distLy }),
        ownObstacle: obstacles.find((o) => o.id === p.id) ?? null };
      if (expFrom !== Infinity) { expanded.add(key); const pin = pinFor(key, { pins: g.pins, prev: g.candPrev, baseH }); if (pin) it.pin = pin; }
      items.push(it);
    }
    const { placed } = placeLabelsPinned(items, { rect: map, obstacles, prev: g.candPrev, candidatesOf: galaxyLabelCandidates,
      hideOnOverlap: (it) => it.essential !== true });
    g.candPrev = new Map(placed.map((q) => [q.key, q.cand]));
    updatePins(g.pins, placed, expanded);
    const fading = updateBorn(g.born, placed.map((q) => q.key), F.now);
    const modeK = P.fade;
    const labels = placed.map((q) => ({ ...q, fade: fadeAlpha(F.now, g.born.get(q.key)) * modeK }));
    // Strefy: nazwy (klik = gwiazda) i przypięcie (przycisk > nazwa > całość).
    const zones = [], pinZones = [];
    for (const l of labels) {
      zones.push({ x: l.x, y: l.y, w: l.w, h: l.h, id: l.id });
      if (!l.pinLabel) continue;
      let y = l.y + R.PAD_Y;
      l.lines.forEach((ln, i) => {
        if (i > 0) y += R.LINE_GAP;
        if (ln.kind === 'actions') {
          const P2 = LABEL_PIN.BTN_HIT_PAD_X;
          for (const b of ln.btns) pinZones.push({ kind: 'btn', id: b.id, starId: l.id, x: l.x + R.PAD_X + b.x - P2, y, w: b.w + 2 * P2, h: ln.h });
        }
        if (i === 0) pinZones.push({ kind: 'name', starId: l.id, x: l.x, y: l.y, w: l.w, h: y + ln.h - l.y });
        y += ln.h;
      });
      pinZones.push({ kind: 'body', starId: l.id, x: l.x, y: l.y, w: l.w, h: l.h });
    }
    g.zones = zones;
    g.pinZones = pinZones;
    // Nawiasy: zaznaczona, cel nurkowania (dwa ostatnie ząbki nad podłogą), skanowane (oddech na zegarze symulacji).
    const brackets = [];
    const half = G.BRACKET_HALF;
    const arm = Math.max(1, Math.min(HUD_ATTENTION.BRACKET_ARM_PX, 2 * half * HUD_ATTENTION.BRACKET_ARM_FRAC));
    const breath = breathAlpha(F.sim);
    for (const p of pts) {
      if (!pointInRect(p.x, p.y, map)) continue;
      const wantSel = p.selected, wantDive = P.diveBr && p.dive && !p.selected, wantScan = p.scanning;
      if (!wantSel && !wantDive && !wantScan) continue;
      brackets.push({ id: p.id, cx: p.x, cy: p.y, half: wantScan && !wantSel ? half + 3 : half, arm,
        fade: modeK * (wantScan ? breath : 1), kind: wantSel ? 'selected' : wantDive ? 'dive' : 'scan' });
    }
    g.last = { labels, brackets };
    const selB = brackets.find((b) => b.kind === 'selected') ?? null;
    this._last = { labels, bracket: selB };
    return { count: labels.length + brackets.length, animating: fading || modeK < 1 || P.hovAnimating || (P.scans.size > 0 && F.sim != null),
      labels, brackets, hoverBtn: P.hoverBtn };
  }

  _g2Draw(ctx, F, c) {
    const R = HUD_LABELS, G = HUD_GALAXY_LABELS;
    const roles = F.roles;
    const textPrimary = themeToken(THEME, 'textPrimary');
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.setLineDash([]);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (const b of c.brackets ?? []) {
      ctx.strokeStyle = roles.primary;
      ctx.lineWidth = HUD_ATTENTION.BRACKET_WIDTH;
      ctx.globalAlpha = b.fade ?? 1;
      ctx.beginPath();
      for (const cr of bracketCorners({ cx: b.cx, cy: b.cy, half: b.half, arm: b.arm })) {
        const q = cr.pts;
        ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); ctx.lineTo(q[4], q[5]);
      }
      ctx.stroke();
    }
    for (const m of c.labels ?? []) {
      const fade = m.fade ?? 1;
      if (!(fade > 0)) continue;
      const color = skyLabelColor(m.role, roles, textPrimary);
      // Treść rozwinięcia / przypięcia gwiazdy w roli `dim` (niezbadana) — czytelna (`textPrimary`): o tę treść gracz poprosił;
      // sama nazwa zostaje w roli gwiazdy.
      const lineColor = m.role === 'dim' && (m.expFrom ?? Infinity) !== Infinity ? textPrimary : color;
      if (m.side !== 'C') {
        const th = threadGeometry(m);
        ctx.strokeStyle = color;
        ctx.lineWidth = R.THREAD_WIDTH;
        ctx.globalAlpha = R.THREAD_ALPHA * fade;
        ctx.beginPath(); ctx.moveTo(th.x0, th.y0); ctx.lineTo(th.x1, th.y1); ctx.stroke();
      }
      ctx.globalAlpha = (m.pinLabel ? R.BAR_ALPHA_SELECTED : R.BAR_ALPHA) * fade;
      ctx.fillStyle = THEME.bgPrimary;
      ctx.fillRect(m.x, m.y, m.w, m.h);
      let y = m.y + R.PAD_Y;
      m.lines.forEach((ln, i) => {
        if (i > 0) y += R.LINE_GAP;
        const exp = i >= (m.expFrom ?? Infinity) ? (m.expAlpha ?? 1) : 1;
        const x = m.x + R.PAD_X;
        if (ln.kind === 'actions') {
          const base = y + LABEL_PIN.ROW_PAD_Y + ln.size;
          for (const b of ln.btns) {
            const hov = b.enabled && b.id === c.hoverBtn;
            if (hov) {
              ctx.globalAlpha = 0.18 * fade * exp;
              ctx.fillStyle = lineColor;
              ctx.fillRect(x + b.x - LABEL_PIN.BTN_HIT_PAD_X, y, b.w + 2 * LABEL_PIN.BTN_HIT_PAD_X, ln.h);
            }
            ctx.font = b.ln.font;
            ctx.fillStyle = b.enabled ? lineColor : roles.dim;
            ctx.globalAlpha = (b.enabled ? (hov ? 1 : 0.9) : 0.85) * fade * exp;
            ctx.fillText(b.ln.text, x + b.x, base);
          }
        } else {
          ctx.font = ln.font;
          ctx.fillStyle = ln.kind === 'reason' ? textPrimary : (i === 0 ? color : lineColor);   // powód wyłączonego przycisku — czytelny
          ctx.globalAlpha = (i === 0 ? 1 : R.SUB_ALPHA) * fade * exp;
          if ('letterSpacing' in ctx) ctx.letterSpacing = `${ln.spacing ?? 0}px`;
          ctx.fillText(ln.text, x, y + ln.size);
          if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        }
        y += ln.h;
      });
    }
    ctx.globalAlpha = 1;
  }

  _g2Covers(lx, ly) {
    return !!pinHitAt(this._g2.pinZones, lx, ly) || !!resolveLabelClick(this._g2.zones, lx, ly);
  }

  /**
   * Klik — reguła `galaxyPointerTarget` (ta sama co najechanie): przycisk przypięcia > nazwa przypiętej (klik gwiazdy) >
   * reszta przypiętej (pochłonięty) > gwiazda pod kursorem (klik płyty — renderer, ta sama funkcja wyboru) > nazwa.
   */
  _g2HandleClick(x, y, rawX, rawY) {
    const K = (typeof window !== 'undefined') ? window.KOSMOS : null;
    const gm = K?.galaxyMode;
    const pz = pinHitAt(this._g2.pinZones, x, y);
    const nz = pz ? null : resolveLabelClick(this._g2.zones, x, y);
    if (!pz && !nz) return false;
    const tgt = galaxyPointerTarget({ pinZone: pz, nameZone: nz, starUnder: pz ? null : (K?.threeRenderer?.galaxyStarAt?.(rawX, rawY) ?? null) });
    if (tgt.kind === 'btn') {
      const pin = this._g2.p?.pin;
      const btn = pin?.buttons?.find((b) => b.id === tgt.btnId) ?? null;
      runGalaxyPinAction(btn, { systemId: pin?.id, K, t,
        toast: (text) => EventBus.emit('ui:toast', { text, color: THEME.warning ?? '#ffcc44', durationMs: 3000 }) });
      this._g2.rowsT = -Infinity;   // stan skanu / wejścia od razu w następnej klatce
      return true;
    }
    if (tgt.kind === 'pinBody') return true;                 // reszta przypięcia — pochłonięty (gwiazda pod spodem nie łapie)
    if (tgt.kind === 'star') return false;                   // gwiazda pod kursorem — klik płyty (renderer, `galaxyStarAt`)
    gm?.onPlateClick?.(tgt.id, nowMs());                     // nazwa przypiętej albo nazwa — jej gwiazda
    return true;
  }

  /** Odczyt bramki: etykiety i nawiasy ostatniej klatki (px logiczne). */
  debug() {
    const r1 = (v) => (Number.isFinite(v) ? +v.toFixed(1) : v);
    if (this._look) {
      const L = this._g2.last, P = this._g2.p;
      return {
        id: 'galaxyLabels', look: true, on: this._prep.on, items: this._prep.items.length,
        named: this._prep.items.filter((i) => i.text).length,
        labels: L.labels.map((l) => ({ id: l.id, text: l.lines?.[0]?.text, role: l.role, side: l.side, essential: l.essential,
          lines: l.lines?.length ?? 1, pin: !!l.pinLabel, x: r1(l.x), y: r1(l.y), w: r1(l.w), h: r1(l.h) })),
        brackets: L.brackets.map((b) => ({ id: b.id, kind: b.kind, cx: r1(b.cx), cy: r1(b.cy) })),
        hover: P?.hovId ?? null, dive: P?.diveId ?? null, diveBrackets: P?.diveBr ?? false,
        pin: P?.pin ? { id: P.pin.id, lines: P.pin.lines, buttons: P.pin.buttons.map((b) => ({ id: b.id, label: b.label, enabled: b.enabled, reason: b.reason })) } : null,
        pinZones: this._g2.pinZones.length,
      };
    }
    return {
      id: 'galaxyLabels', on: this._prep.on, items: this._prep.items.length,
      named: this._prep.items.filter((i) => i.text).length,
      labels: this._last.labels.map((l) => ({ id: l.id, text: l.text, role: l.role, side: l.side, x: r1(l.x), y: r1(l.y), w: r1(l.w), h: r1(l.h) })),
      bracket: this._last.bracket ? { id: this._last.bracket.id, cx: r1(this._last.bracket.cx), cy: r1(this._last.bracket.cy) } : null,
    };
  }
}
