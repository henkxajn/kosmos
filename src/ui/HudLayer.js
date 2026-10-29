// HudLayer — ARKUSZ HUD H1 (D-HUD-1 (a), D-HUD-12, D-HUD-15; HUD_PLAN.md §4.2): warstwa HUD 2D mapy układu.
// Osobna kanwa `#hud-canvas` (index.html: zaraz po `#three-canvas`, z-index 1, bez zdarzeń myszy) — pod `#ui-canvas`, więc
// belki, outlinery, panele i karta ciała leżą nad HUD z konstrukcji. Własna pętla `requestAnimationFrame`:
//   • rysuje WYŁĄCZNIE, gdy zmienił się klucz klatki — epoka ruchu kamery (`getCameraMoveEpoch`), zaznaczenie
//     (`readClickSelection`), epoka motywu (`themeEpoch`), oglądany układ, okno / skala UI / gęstość bufora, klucze
//     podwarstw (np. położenie i zasięg obiektu z radarem, zegar symulacji, gdy biegnie ping) — albo trwa animacja (ping,
//     błysk); w spoczynku (pauza, kamera stoi, brak animacji) — zero wywołań ctx;
//   • chowa się jawnie (kanwa czyszczona raz) pod overlayem pełnoekranowym, globusem, w czystym widoku (SHIFT, lot intro),
//     poza trybem cywilizacji i gdy renderer 3D jest zawieszony (`BattleView3D`) albo stracił kontekst WebGL;
//   • skala jak `#ui-canvas` — rysunek w px LOGICZNYCH UI (px CSS / `UI_SCALE`); gęstość bufora jak renderera 3D
//     (`renderer.getPixelRatio()` — supersampling ×1,5: linie HUD tej samej ostrości co linie 3D);
//   • kolory WYŁĄCZNIE z ról motywu (`HudPalette.resolveHudRoles(THEME)`) czytanych przy każdym rysunku — zero hexów;
//   • zegary (D-HUD-12): odpowiedzi na akcję gracza — czas realny (`F.now`); okresowe — `simClockMs` (`F.sim`, stoi w pauzie,
//     `null` przed pierwszym tikiem po wczytaniu — wtedy bez okresowych animacji).
// Treść rysują PODWARSTWY (`addSublayer`): `prepare(F)` → część klucza klatki (tanio, w każdej klatce), `collect(F, proj)` →
// `{ count, animating, … }` (geometria w px logicznych), `draw(ctx, F, collected)`; opcjonalnie `debug()`, `destroy()`.
// Rzut — jeden wspólny projektor (`HudProjection.makeHudProjector` z `ThreeRenderer.getHudView()`).
// Paczka B: stan klatki dla modelu uwagi i alertów (`F.att` — ostrość, alerty, warstwy chipów) i widok
// alertów w px (`F.alertView(proj)` — położenia, linia treści wg wywiadu) liczone RAZ na klatkę, wspólne dla podwarstw; rejestr
// alertów (`alerts`) żyje tu, zasilają go zdarzenia wykrycia (`HudRadarLayer`).
// ⚠ Moduł importuje się pod node (keeper `hud_layer_smoke` — atrapa kanwy i ctx): bez three i bez DOM poza kanwą.
import { GAME_CONFIG } from '../config/GameConfig.js';
import { THEME, themeEpoch } from '../config/ThemeConfig.js';
import { t, getLocale } from '../i18n/i18n.js';
import { getPrimaryRole } from '../entities/Vessel.js';
import { resolveHudRoles } from './HudPalette.js';
import { readClickSelection } from './ClickIntentLogic.js';
import { getMapInsets } from './MapInsets.js';
import { simClockMs } from '../utils/SimClock.js';
import { makeHudProjector } from './HudProjection.js';
import { HudRadarLayer } from './HudRadarLayer.js';   // H1-2 — radar (D-HUD-3, D-HUD-4, D-HUD-b)
import { HudRouteLayer } from './HudRouteLayer.js';   // paczka A (H3) — trasy statków (D-HUD-8, D-HUD-9, D-HUD-10)
import { HudLabelLayer } from './HudLabelLayer.js';   // paczka A (H2) — etykiety (D-HUD-5, D-HUD-6, D-HUD-16)
import { HudFocusLayer } from './HudFocusLayer.js';   // paczka B (B-1, B-2) — nawiasy zaznaczenia, pierścienie i wektor alertu
import { HudShipMarkerLayer } from './HudShipMarkerLayer.js';   // znacznik statku (D-SM-1…6) — zamiast insygnium frakcji 3D
import { focusActive, focusVesselIds, tuneHudAttention, resetHudAttention } from './HudAttentionLogic.js';
import {
  HudAlertStore, alertFoeEndpoint, distanceAU, screenBearingDeg, alertContentText, tuneHudAlert, resetHudAlert,
} from './HudAlertLogic.js';
import { readHudLayers, tuneHudChips, resetHudChips } from './HudLayerChipsLogic.js';
import { tuneHudShipMarker, resetHudShipMarker } from './HudShipMarkerLogic.js';

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;     // px logiki gry na 1 AU (pozycje statków i ciał)

// [klatki rysunku] okno pomiaru kosztu (bramka H1: ≤ 0,5 ms na klatkę CPU)
const COST_WINDOW = 120;
// [px CSS] picker najechania statku dla warstwy (paczka A — druga linia etykiety, podświetlenie trasy): tylko WIDOCZNE
// sprite'y (485), próg jak `ThreeRenderer.handleMouseMove`.
const HOVER_VESSEL_PX = 28;

/**
 * Bramka widoczności warstwy HUD (czysta). Kolejność powodów = kolejność sprawdzania.
 * @param {object} K — `window.KOSMOS`
 * @returns {{ shown: boolean, reason: 'civMode'|'cleanView'|'overlay'|'globe'|'renderer'|null }}
 */
export function hudGate(K) {
  if (!K?.civMode) return { shown: false, reason: 'civMode' };
  const um = K.uiManager, tr = K.threeRenderer;
  if (um?._cleanView === true || tr?._cleanView === true) return { shown: false, reason: 'cleanView' };
  if (um?.overlayManager?.isAnyOpen?.() === true) return { shown: false, reason: 'overlay' };
  if (K.planetGlobeOpen) return { shown: false, reason: 'globe' };
  if (!tr || tr._renderingEnabled === false || tr._contextLost === true) return { shown: false, reason: 'renderer' };
  return { shown: true, reason: null };
}

/** Gęstość bufora kanwy HUD = gęstość renderera 3D (zapas: wzór renderera — DPR × 1,5, najwyżej 2). */
export function hudPixelRatio(K) {
  const tr = K?.threeRenderer;
  const pr = tr?.renderer?.getPixelRatio?.() ?? tr?._pixelRatio;
  if (pr > 0) return pr;
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  return Math.min(dpr * 1.5, 2);
}

/** Skala UI (px CSS na px logiczny) — ta sama co `#ui-canvas` (`UIManager`: min(szer. / 1280, wys. / 720)). */
export function hudUiScale(K, cssW, cssH) {
  const s = K?.uiScale;
  return s > 0 ? s : Math.min(cssW / 1280, cssH / 720);
}

export class HudLayer {
  /**
   * @param {HTMLCanvasElement|null} canvas — `#hud-canvas`
   * @param {{ raf?:Function, caf?:Function, now?:Function, autoStart?:boolean, sublayers?:object[] }} [opts] — zegar
   *   i pętla wstrzykiwane w keeperze; `sublayers` — lista podwarstw (domyślnie: podwarstwy gry)
   */
  constructor(canvas, { raf = null, caf = null, now = null, autoStart = true, sublayers = null } = {}) {
    this.canvas = canvas ?? null;
    this.ctx = canvas?.getContext?.('2d') ?? null;
    // ⚠ Funkcje okna wołane BEZ odbiorcy — `this._raf(loop)` z gołym `requestAnimationFrame` przekazałby warstwę jako `this`
    //   ⇒ „Illegal invocation” w przeglądarce (zmierzone na rozruchu gry; keeper L10 pinuje).
    this._raf = raf ?? ((typeof requestAnimationFrame === 'function') ? (cb) => requestAnimationFrame(cb) : null);
    this._caf = caf ?? ((typeof cancelAnimationFrame === 'function') ? (id) => cancelAnimationFrame(id) : null);
    this._now = now ?? (() => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()));
    this._sublayers = [];
    this._lastKey = null;       // klucz ostatniej narysowanej klatki
    this._animating = false;    // czy ostatnia klatka miała animację (ping, błysk) — wtedy kolejna rysuje bez zmiany klucza
    this._wake = false;         // wymuszenie klatki (zdarzenie podwarstwy, np. błysk)
    this._shown = false;        // czy na kanwie jest rysunek (przy schowaniu — jedno czyszczenie)
    this._rafId = null;
    this._size = { cssW: 0, cssH: 0, pr: 0 };
    this._gate = { shown: false, reason: 'start' };
    this._pointer = null;       // paczka A — kursor nad mapą: { lx, ly (px logiczne), rawX, rawY (px CSS), overUI }
    this.alerts = new HudAlertStore();   // paczka B — rejestr alertów (zegar symulacji); zasilają go zdarzenia wykrycia
    this.stats = { frames: 0, passes: 0, draws: 0, clears: 0, lastMs: 0, maxMs: 0, costs: [] };
    for (const s of (sublayers ?? this._defaultSublayers())) this.addSublayer(s);
    if (autoStart) this.start();
  }

  /** Podwarstwy gry (kolejność = kolejność zbierania i rysowania): trasy (pod spodem), radar, znacznik statku (pod etykietami),
   *  etykiety (ich anti-overlap czyta przeszkody z warstw zebranych wcześniej w tej samej klatce: odczyt zasięgu radaru, glify
   *  warp, znaczniki statków), nawiasy i alerty (na wierzchu — czytają etykiety tej klatki: narożnik pod przypiętą etykietą
   *  pominięty). */
  _defaultSublayers() {
    return [new HudRouteLayer(this), new HudRadarLayer(this), new HudShipMarkerLayer(this), new HudLabelLayer(this), new HudFocusLayer(this)];
  }

  /**
   * Paczka B — strojenie stałych z konsoli (bramka): `KOSMOS.hudLayer.tune({ LABEL_DIM: 0.3, ALERT_MS: 2000 })` — klucze
   * modelu uwagi i nawiasów (`HUD_ATTENTION`), alertów (`HUD_ALERT`), chipów (`HUD_CHIPS`) i znacznika statku
   * (`HUD_SHIP_MARKER`; `FADE_LARGE_*` wspólne z nawiasami); nieznane pominięte; `tune(null)` — wartości domyślne.
   * Przeżywa do F5.
   */
  tune(patch = {}) {
    const r = patch == null
      ? { ...resetHudAttention(), ...resetHudAlert(), ...resetHudChips(), ...resetHudShipMarker() }
      : { ...tuneHudAttention(patch), ...tuneHudAlert(patch), ...tuneHudChips(patch), ...tuneHudShipMarker(patch) };
    this._lastKey = null;
    this._wake = true;
    const um = (typeof window !== 'undefined') ? window.KOSMOS?.uiManager : null;
    if (um) um._dirty = true;
    return r;
  }

  /** Paczka B — obwiednia trwającego alertu obcego `foeId` (0–1; celownik wroga pulsuje w rytmie alertu). */
  alertEnvelopeFor(foeId) {
    return this.alerts.envelopeFor(foeId, simClockMs());
  }

  /** Paczka B — stan klatki modelu uwagi: alerty oglądanego układu, ostrość, zbiór statków w ostrości, warstwy chipów. */
  _attentionFrame(K, sel, F) {
    const alerts = this.alerts.frame(F.sim).filter((a) => a.systemId === F.activeSystemId);
    const fleet = sel.fleetId != null ? K.fleetSystem?.getFleet?.(sel.fleetId) : null;
    const alertedVessels = new Set(), alertedColonies = new Set();
    for (const a of alerts) {
      if (a.kind === 'vessel') alertedVessels.add(String(a.holderId)); else alertedColonies.add(String(a.holderId));
      alertedVessels.add(String(a.foeId));
    }
    return {
      on: true, alerts, focus: focusActive(sel, alerts.length), focusIds: focusVesselIds(sel, fleet?.memberIds ?? []),
      alertedVessels, alertedColonies, layers: readHudLayers(K.uiPrefs),
    };
  }

  /**
   * Paczka B — alerty klatki w px logicznych: środek obiektu gracza, położenie intruza widoczne dla gracza (mgła wojny —
   * `alertFoeEndpoint`: `rumor` — ostatnio znane, `unknown` — brak), czy intruz ma celownik wroga, linia treści wg wywiadu
   * (odległość w AU z położeń logiki gry, namiar na ekranie). Intruz niewidoczny — bez położenia i bez treści (fail-closed).
   */
  _alertView(F, proj) {
    const att = F.att;
    if (!att?.alerts?.length || !proj) return [];
    const K = F.K, tr = K.threeRenderer, vm = K.vesselManager, intel = K.intelSystem, em = K.entityManager;
    const wpa = proj.worldPerAU;
    const loc = getLocale();
    const out = [];
    for (const a of att.alerts) {
      // Obiekt gracza: statek — sprite (inaczej pozycja logiczna); kolonia — jej ciało.
      let holderPos = null, holderScr = null, holderDiscPx = 0;
      if (a.kind === 'vessel') {
        const v = vm?.getVessel?.(a.holderId);
        holderPos = v?.position ?? null;
        const w = tr?.getVesselWorldPosition?.(a.holderId)
          ?? (holderPos && wpa > 0 ? { x: holderPos.x * wpa / AU_TO_PX, y: 0.3, z: holderPos.y * wpa / AU_TO_PX } : null);
        const p = w ? proj.point(w.x, w.y, w.z) : null;
        if (p) holderScr = { x: p.x, y: p.y };
      } else {
        const body = em?.get?.(a.holderId) ?? null;
        holderPos = body && Number.isFinite(body.x) && Number.isFinite(body.y) ? { x: body.x, y: body.y } : null;
        const w = tr?.getBodyWorldInfo?.(a.holderId);
        const p = w ? proj.point(w.x, w.y, w.z) : null;
        if (p) { holderScr = { x: p.x, y: p.y }; holderDiscPx = w.r > 0 ? w.r * proj.pxPerWorld(p.depth) : 0; }
      }
      // Intruz — wyłącznie położenie, które gracz widzi (wywiad), i widoczny sprite.
      const foe = vm?.getVessel?.(a.foeId) ?? null;
      const rec = intel?.getVesselContact?.(a.foeId) ?? null;
      const quality = rec?.quality ?? 'unknown';
      const end = foe ? alertFoeEndpoint({ livePos: foe.position, quality, positionLastKnown: rec?.positionLastKnown ?? null }) : null;
      let foeScr = null;
      if (end) {
        const e = tr?._vessels?.get?.(a.foeId);
        const w = (e?.sprite && e.sprite.visible !== false) ? tr.getVesselWorldPosition?.(a.foeId) : null;
        const p = w ? proj.point(w.x, w.y, w.z) : null;
        if (p) foeScr = { x: p.x, y: p.y };
      }
      const visible = !!(end && foeScr);
      const distAU = end ? distanceAU(holderPos, end, AU_TO_PX) : null;
      const text = visible ? alertContentText({
        quality, roleLabel: foe ? t(`fleetPicture.role.${getPrimaryRole(foe)}`) : null, name: foe?.name ?? null,
        distAU, bearingDeg: screenBearingDeg(holderScr, foeScr),
      }, { t, locale: loc }) : null;
      out.push({ ...a, holderScr, holderDiscPx, foeScr, visible, text, distAU,
        crosshair: visible && tr?._enemyAlertMarkers?.has?.(a.foeId) === true });
    }
    // Jeden komplet (pierścienie, wektor, linia treści) na intruza: alert obiektu zaznaczonego, inaczej (tryb Y) — najbliższego,
    // przy remisie — najmłodszego. Błyski na granicach — wszystkich alertów (każdy widoczny radar).
    const sel = F.sel ?? {};
    const selV = new Set([...(sel.vesselIds ?? []), sel.leadId].filter((x) => x != null).map(String));
    const selB = sel.entityId != null ? String(sel.entityId) : null;
    const rank = (a) => [(a.kind === 'vessel' ? selV.has(String(a.holderId)) : selB === String(a.holderId)) ? 0 : 1,
      Number.isFinite(a.distAU) ? a.distAU : Infinity, a.age ?? 0];
    const less = (p, q) => { for (let i = 0; i < p.length; i++) { if (p[i] < q[i]) return true; if (p[i] > q[i]) return false; } return false; };
    const best = new Map();
    for (const a of out) {
      const k = String(a.foeId), r = rank(a), cur = best.get(k);
      if (!cur || less(r, cur.r)) best.set(k, { a, r });
    }
    for (const a of out) a.primary = best.get(String(a.foeId))?.a === a;
    return out;
  }

  addSublayer(s) {
    if (s) this._sublayers.push(s);
    this._wake = true;
    return s;
  }

  /** Wymuś przebieg w następnej klatce (zdarzenie podwarstwy). */
  wake() { this._wake = true; }

  /**
   * Kursor nad oknem (paczka A — najechanie mapy dla etykiet i tras): px logiczne + surowe px CSS; `overUI` — kursor nad
   * powierzchnią UI (outlinery, belki, karty), wtedy bez najechania mapy (hover outlinera nie — D-HUD-5).
   */
  setPointer(lx, ly, rawX, rawY, overUI = false) {
    // Bez wymuszania klatki: najechanie trafia do kluczy podwarstw (etykiety, trasy) — rysunek tylko, gdy coś się zmieniło.
    this._pointer = { lx, ly, rawX, rawY, overUI: overUI === true };
  }

  /**
   * Klik w warstwę HUD (paczka A — etykiety; px logiczne + surowe px CSS). Podwarstwy od wierzchu; tylko gdy warstwa była
   * narysowana w ostatniej klatce (pod overlayem / globusem / w czystym widoku — nic). Woła `UIManager.handleClick` PO karcie
   * ciała (515).
   * @returns {boolean} — klik obsłużony
   */
  handleClick(x, y, rawX, rawY) {
    if (!this._gate.shown || !this._shown) return false;
    for (let i = this._sublayers.length - 1; i >= 0; i--) {
      if (this._sublayers[i].handleClick?.(x, y, rawX, rawY) === true) { this._wake = true; return true; }
    }
    return false;
  }

  /**
   * REFORMA ZAKŁADEK T1 — obiekt z rozwinięciem z najechania (podwarstwa etykiet; `null` — brak). Warstwa schowana
   * (overlay, globus, czysty widok) — `null`.
   */
  hoverObjectKey() {
    if (!this._gate.shown) return null;
    for (const s of this._sublayers) { const k = s.hoverObjectKey?.(); if (k != null) return k; }
    return null;
  }

  /** REFORMA ZAKŁADEK T1 — czy punkt (px logiczne) leży pod obiektem z rozwinięciem (etykieta, stacja, najechanie). */
  coversPoint(lx, ly) {
    if (!this._gate.shown || !Number.isFinite(lx) || !Number.isFinite(ly)) return false;
    return this._sublayers.some((s) => s.coversPoint?.(lx, ly) === true);
  }

  /**
   * Finding 530 (REFORMA ZAKŁADEK T5) — czy punkt (px logiczne) leży na strefie UI warstwy (etykieta, przypięcie) z ostatniej
   * klatki; warstwa schowana — `false`. Scena: dymek współrzędnych pustej mapy nie pokazuje się nad UI.
   */
  coversUiPoint(lx, ly) {
    if (!this._gate.shown || !this._shown || !Number.isFinite(lx) || !Number.isFinite(ly)) return false;
    return this._sublayers.some((s) => s.coversUiPoint?.(lx, ly) === true);
  }

  /** REFORMA ZAKŁADEK T2 — przycisk przypięcia pod punktem (px logiczne; `null` — brak / warstwa schowana): kursor „rączki”. */
  pinButtonAt(lx, ly) {
    if (!this._gate.shown || !Number.isFinite(lx) || !Number.isFinite(ly)) return null;
    for (const s of this._sublayers) { const b = s.pinButtonAt?.(lx, ly); if (b != null) return b; }
    return null;
  }

  start() {
    if (!this._raf || this._rafId != null) return;
    const loop = () => {
      this._rafId = this._raf(loop);
      try { this.frame(this._now()); }
      catch (e) { console.error('[HudLayer] frame error:', e); }   // konsola (nie UI) — bez nowego literału z diakrytykiem
    };
    this._rafId = this._raf(loop);
  }

  destroy() {
    if (this._rafId != null && this._caf) this._caf(this._rafId);
    this._rafId = null;
    for (const s of this._sublayers) s.destroy?.();
    this._sublayers = [];
    this._clear();
  }

  _clear() {
    if (!this._shown || !this.ctx || !this.canvas) { this._shown = false; return; }
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._shown = false;
    this.stats.clears++;
  }

  // Bufor kanwy = okno (px CSS) × gęstość renderera; zmiana rozmiaru czyści kanwę (przypisanie `width`).
  _syncSize(cssW, cssH, pr) {
    const z = this._size;
    if (z.cssW === cssW && z.cssH === cssH && z.pr === pr) return;
    this._size = { cssW, cssH, pr };
    if (this.canvas) {
      this.canvas.width  = Math.max(1, Math.round(cssW * pr));
      this.canvas.height = Math.max(1, Math.round(cssH * pr));
    }
    this._shown = false;
  }

  /**
   * Jedna klatka pętli.
   * @param {number} now — czas realny (ms)
   * @returns {'hidden'|'idle'|'empty'|'drawn'}
   */
  frame(now) {
    this.stats.frames++;
    const tStart = this._now();   // koszt klatki: od bramki (z `prepare` podwarstw) do końca rysunku
    const K = (typeof window !== 'undefined') ? window.KOSMOS : null;
    const gate = hudGate(K);
    this._gate = gate;
    if (!gate.shown) {
      this._clear();
      this._lastKey = null;
      this._animating = false;
      return 'hidden';
    }
    const cssW = (typeof window !== 'undefined' && window.innerWidth) || 1280;
    const cssH = (typeof window !== 'undefined' && window.innerHeight) || 720;
    const pr = hudPixelRatio(K);
    const uiScale = hudUiScale(K, cssW, cssH);
    this._syncSize(cssW, cssH, pr);

    const tr = K.threeRenderer;
    const sel = readClickSelection(K);
    let rolesMemo = null, mapMemo = null, hoverMemo = null;
    const ptr = this._pointer;
    const F = {
      K, now, sim: simClockMs(), sel, cssW, cssH, pr, uiScale, W: cssW / uiScale, H: cssH / uiScale,
      pointer: ptr,
      // Najechanie MAPY (paczka A): statek pod kursorem — wyłącznie widoczne sprite'y (485); ciało — raycast tarcz renderera.
      get hover() {
        if (hoverMemo) return hoverMemo;
        if (!ptr || ptr.overUI) return (hoverMemo = { vesselId: null, bodyId: null });
        let vesselId = null;
        try { vesselId = tr?._getVesselAtScreen?.(ptr.rawX, ptr.rawY, HOVER_VESSEL_PX, true) ?? null; } catch { vesselId = null; }
        return (hoverMemo = { vesselId, bodyId: tr?._hoverPlanetId ?? null });
      },
      activeSystemId: sel.activeSystemId,
      features: GAME_CONFIG.FEATURES ?? {},
      tactical: K.tacticalMode?.isActive === true,
      get roles() { return rolesMemo ?? (rolesMemo = resolveHudRoles(THEME)); },
      // Obszar mapy (px logiczne) — jedno źródło wcięć (`MapInsets`).
      get mapRect() {
        if (mapMemo) return mapMemo;
        const ins = getMapInsets(K);
        return (mapMemo = { x: ins.left, y: ins.top, w: Math.max(0, this.W - ins.left - ins.right), h: Math.max(0, this.H - ins.top - ins.bottom) });
      },
    };
    let key = `${tr?.getCameraMoveEpoch?.() ?? 0}|${themeEpoch()}|${F.activeSystemId}|${cssW}x${cssH}@${uiScale}*${pr}`
      + `|${sel.leadId ?? ''}|${sel.entityId ?? ''}`;
    // Paczka B: stan uwagi i alerty klatki — przed podwarstwami (każda czyta `F.att`).
    const att = this._attentionFrame(K, sel, F);
    F.att = att;
    let viewMemo = null, viewProj = null;
    F.alertView = (proj) => {
      if (viewMemo && viewProj === proj) return viewMemo;
      viewProj = proj;
      return (viewMemo = this._alertView(F, proj));
    };
    const Ly = att.layers;
    key += `|A${att.focus ? 1 : 0}${Ly.radar ? 1 : 0}${Ly.routes ? 1 : 0}${Ly.labels ? 1 : 0}${Ly.orbits ? 1 : 0}`
      + `:${sel.stationId ?? ''}:${sel.fleetId ?? ''}:${(sel.vesselIds ?? []).join(',')}`;
    // Alerty biegną na zegarze symulacji — klatka przy każdym przyroście wieku (w pauzie wiek stoi → spoczynek).
    for (const a of att.alerts) key += `|a${a.id}:${Math.round(a.age)}`;
    for (const s of this._sublayers) key += '|' + (s.prepare?.(F) ?? '');
    if (key === this._lastKey && !this._animating && !this._wake) {
      const idleMs = this._now() - tStart;   // spoczynek: sama bramka i klucz (zero wywołań ctx)
      this.stats.idleLastMs = idleMs;
      if (!(idleMs <= (this.stats.idleMaxMs ?? 0))) this.stats.idleMaxMs = idleMs;
      return 'idle';
    }
    this._lastKey = key;
    this._wake = false;

    this.stats.passes++;
    const view = tr?.getHudView?.() ?? null;
    const proj = view ? makeHudProjector({ ...view, uiScale }) : null;
    const parts = this._sublayers.map((s) => s.collect?.(F, proj) ?? null);
    let count = 0, animating = false;
    for (const c of parts) { count += c?.count ?? 0; if (c?.animating) animating = true; }
    this._animating = animating;
    if (count === 0 && !this._shown) return 'empty';
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return 'empty';
    const k = (this.canvas.width / cssW) * uiScale;   // px logiczne → px bufora
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, F.W, F.H);
    for (let i = 0; i < this._sublayers.length; i++) {
      if (parts[i]?.count > 0) this._sublayers[i].draw?.(ctx, F, parts[i]);
    }
    this._shown = count > 0;
    this.stats.draws++;
    const ms = this._now() - tStart;
    this.stats.lastMs = ms;
    if (ms > this.stats.maxMs) this.stats.maxMs = ms;
    this.stats.costs.push(ms);
    if (this.stats.costs.length > COST_WINDOW) this.stats.costs.shift();
    return 'drawn';
  }

  /** Wyzeruj liczniki (bramka: pomiar spoczynku i kosztu od zera). */
  resetStats() {
    this.stats = { frames: 0, passes: 0, draws: 0, clears: 0, lastMs: 0, maxMs: 0, costs: [] };
  }

  /** Odczyt dla bramki i konsoli (`KOSMOS.hudLayer.debugState()`). */
  debugState() {
    const c = [...this.stats.costs].sort((a, b) => a - b);
    const q = (p) => (c.length ? c[Math.min(c.length - 1, Math.floor(p * c.length))] : null);
    const r4 = (v) => (v == null ? null : +(+v).toFixed(4));
    return {
      shown: this._gate.shown, reason: this._gate.reason, drawn: this._shown,
      canvas: { w: this.canvas?.width ?? null, h: this.canvas?.height ?? null, cssW: this._size.cssW, cssH: this._size.cssH, pr: this._size.pr },
      frames: this.stats.frames, passes: this.stats.passes, draws: this.stats.draws, clears: this.stats.clears,
      costMs: { last: r4(this.stats.lastMs), max: r4(this.stats.maxMs), median: r4(q(0.5)), p95: r4(q(0.95)), n: c.length },
      idleMs: { last: r4(this.stats.idleLastMs ?? null), max: r4(this.stats.idleMaxMs ?? null) },
      sublayers: this._sublayers.map((s) => s.debug?.() ?? null),
    };
  }
}
