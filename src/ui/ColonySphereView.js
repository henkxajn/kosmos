// ColonySphereView — kula kolonii w oknie kolonii (ARC COLONY SPHERE, krok CS-7 część B; decyzja właściciela 1 „A":
// kula zastępuje obszar mapy 2D, dzisiejsze panele boczne zostają).
//
// Klej między ColonyOverlay a `ColonySphereRenderer`: z kolonii i stanu okna składa stan pól (budynki, tryb budowy,
// soczewka, zaopatrzenie — `composeSphereOverlay`), rysuje kulę, proste znaczniki budynków (Canvas 2D nad obrazem kuli:
// ikona budynku jak na mapie 2D, poziom, pasek budowy, anomalia, okupacja) i ramę; tłumaczy mysz / klawisze na obrót,
// zoom, soczewkę i picking pola. Jednostki rysuje DZISIEJSZY kod okna (`_drawUnits`) przez `gridAdapter` — siatkę, której
// `tilePixelPos` zwraca rzut pola na ekran (stosy, bitwy, paski HP, zaznaczenia jak na mapie 2D).
//
// ⚠ Kula działa dla siatki `kind === 'geo'` — niezależnie od bieżącej flagi (kolonia geo z zapisu nie ma mapy 2D).
//   Siatka płaska nigdy tu nie trafia: przy fladze OFF okno kolonii nie dotyka tego modułu.
// Moduł bez ColonyOverlay i bez tekstur (ikony budynków wstrzykiwane) — keeper wykonuje go pod node.

import { ColonySphereRenderer } from '../renderer/ColonySphereRenderer.js';
import { SPHERE_TUNING } from '../renderer/ColonySphereLogic.js';
import { geodesicTopology } from '../map/GeodesicTopology.js';
import { composeSphereOverlay, sphereLegend, fallbackColorsOf, nextLens, BUILD_VERDICT, BUILDING_TINT } from './ColonySphereOverlayLogic.js';
import { BILLBOARD, BILLBOARD_STATE, BILLBOARD_COLORS, billboardSpecOf, buildBillboardList, horizonAlpha, categoryCss } from '../renderer/ColonyBillboardLogic.js';
import { ColonyBillboardAtlas } from '../renderer/ColonyBillboardAtlas.js';
import { CITY_LIGHTS, cityLightsOf, rasterizeCityLights, populationOfColony } from '../renderer/CityLightsLogic.js';
import { drawSphereChrome, sphereThemeColors } from './ColonySphereChrome.js';
import { ColonySphereUnits } from './ColonySphereUnits.js';
import { TERRAIN_TYPES, evaluatePlacement } from '../map/HexTile.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { ANOMALIES } from '../data/AnomalyData.js';
import { STAR_TYPES } from '../config/GameConfig.js';
import { themeEpoch, THEME } from '../config/ThemeConfig.js';
import EntityManager from '../core/EntityManager.js';

const HOME_SYSTEM = 'sys_home';
const KEY_TURN_RAD = 0.14;            // obrót klawiszem [rad]
const DOUBLE_CLICK_MS = 350;          // dwuklik w to samo pole → obrót do pola
const MARKER_MIN_FACING = 0.16;       // jednostki gasną przy limbie (adapter siatki dla `_drawUnits`)
const NOTE_MIN_PX = 7;                // poniżej tego promienia pola adnotacji (anomalia, okupacja) nie rysujemy
const OCCUPATION_YEARS = 6 / 12;      // czas przejmowania budynku [lata gry] — jak mapa 2D
const GEO_CAPITAL_NODE_PENALTY = 0.05;   // dopłata do kwadratu szerokości pola (≈ 13° od równika)
const MINI_TUNING = Object.freeze({ ...SPHERE_TUNING, fitFraction: 0.94, spinRate: 0.16, resumeDelayMs: 0, easeInMs: 1 });

/**
 * Co narysować na polu (czyste). Stolica jest WIRTUALNA: `capitalBase = true`, a `buildingId` zostaje pusty albo
 * niesie budynek postawiony na polu stolicy (farma startowa) — portret stolicy to `colony_base` (`isCapital` w danych),
 * nie `buildingId`. Budynek na polu stolicy staje się małą plakietką obok portretu stolicy.
 * @returns {null | {portraitId:string|null, scale:number, capital:boolean, badgeId:string|null}}
 */
export function markerSpecOf(tile) {
  const spec = billboardSpecOf(tile);
  if (!spec || (!tile.capitalBase && !tile.buildingId)) return null;   // sama budowa → `billboardSpecOf` (CS-9)
  return { portraitId: spec.portraitId, scale: spec.scale, capital: spec.capital, badgeId: spec.badgeId };
}

/** Czy siatka kolonii jest kulą (siatka geodezyjna). */
export function isSphereGrid(grid) { return grid?.kind === 'geo'; }

/** Gwiazda układu ciała → światło kuli ({ colorHex, spectralType, luminosity }). */
export function starOfBody(body) {
  const sid = body?.systemId ?? HOME_SYSTEM;
  let star = null;
  try { star = EntityManager.getByType('star').find(s => (s.systemId ?? HOME_SYSTEM) === sid) ?? null; } catch (e) { star = null; }
  const spec = star?.spectralType ?? 'G';
  const st = STAR_TYPES[spec] ?? STAR_TYPES.G;
  return { colorHex: star?.visual?.color ?? st.color, spectralType: spec, luminosity: st.luminosity ?? 1 };
}

/** Pole widoku startowego: stolica; bez stolicy — pierwszy budynek; inaczej budowalne pole najbliżej równika. */
export function focusTileOf(grid, topo) {
  const tiles = grid.tiles;
  let i = tiles.findIndex(t => t.capitalBase === true);
  if (i >= 0) return i;
  i = tiles.findIndex(t => !!t.buildingId);
  if (i >= 0) return i;
  let best = 0, bd = Infinity;
  for (let k = 0; k < tiles.length; k++) {
    if (!TERRAIN_TYPES[tiles[k].type]?.buildable) continue;
    const d = Math.abs(topo.cy[k]);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

/**
 * Pole pod stolicę NOWEJ kolonii na kuli (odpowiednik `_findBestTileForCapital` mapy 2D: tam „blisko środka mapy",
 * tu blisko równika; równiny / las preferowane ×0,5; ocean i lądolód wykluczone). Remis → niższy indeks pola.
 */
export function bestGeoCapitalTile(grid) {
  const topo = geodesicTopology(grid.n);
  let best = null, bd = Infinity;
  for (let i = 0; i < grid.tiles.length; i++) {
    const tile = grid.tiles[i];
    if (tile.type === 'ocean' || tile.type === 'ice_sheet' || !TERRAIN_TYPES[tile.type]?.buildable) continue;
    let d = topo.cy[i] * topo.cy[i];
    if (tile.type === 'plains' || tile.type === 'forest') d *= 0.5;
    if (topo.isPentagon(i) || tile.anomaly) d += GEO_CAPITAL_NODE_PENALTY;   // pięciokąty to węzły anomalii (D-CS-9) — stolica obok
    if (d < bd) { bd = d; best = tile; }
  }
  return best;
}

/**
 * Werdykt trybu budowy dla pola (ta sama bramka co panel budowy: `evaluatePlacement`).
 * `building` = budynek pod kursorem w menu budowy; null → werdykt ogólny (czy na polu da się cokolwiek postawić).
 */
export function buildVerdictFor(tile, building, ctx = {}) {
  // Zajęte = budynek / budowa / zamówienie (jak `HexTile.isOccupied`); stolica jest wirtualna — jej pole zostaje wolne.
  if (tile.buildingId || tile.underConstruction || tile.pendingBuild) return BUILD_VERDICT.OCCUPIED;
  if (building) return evaluatePlacement(tile, building, ctx).ok ? BUILD_VERDICT.OK : BUILD_VERDICT.BLOCKED;
  return TERRAIN_TYPES[tile.type]?.buildable && !tile.damaged ? BUILD_VERDICT.OK : BUILD_VERDICT.BLOCKED;
}

function sameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class ColonySphereView {
  /**
   * @param {object} [o]
   * @param {() => void} [o.onChange] prośba o przerysowanie okna
   * @param {(buildingId:string) => object|null} [o.getBuildingIcon] obraz PNG budynku (albo null → emoji z danych)
   * @param {(opts:object) => object} [o.createRenderer] fabryka renderera (testy)
   */
  constructor(o = {}) {
    this._onChange = o.onChange ?? (() => {});
    this._getIcon = o.getBuildingIcon ?? (() => null);
    this._mk = o.createRenderer ?? ((opts) => new ColonySphereRenderer(opts));
    this.renderer = this._mk({ onChange: this._onChange });
    this._mini = null;
    this.lens = 'none';
    this._grid = null; this._topoCount = 0;
    this._bytes = null; this._scratch = null;
    this._epoch = null; this._colors = null;
    this._adapter = null; this._adapterGrid = null; this._adapterRect = null;
    this._lastClick = { tile: -1, t: -Infinity };
    this._state = null;
    this._lastPos = new Map();
    // CS-9 — billboardy budynków i światła miast
    this._atlas = new ColonyBillboardAtlas({ createCanvas: o.createCanvas });
    this.tint = BUILDING_TINT.SUBTLE;   // barwa kategorii: cienki obrys pola + podstawa (A/B: BUILDING_TINT.FULL = podbarwione pole)
    this.lodBias = 1;                   // podgląd LOD (`csDots()`): < 1 = znaczniki jak z daleka (kropki kategorii)
    this._markerStats = { ms: [], portraits: 0, dots: 0, frames: 0 };
    this._lights = null; this._lightSig = null; this._lightMap = null;
    // CS-10 — jednostki: modele GLB z bliska, zwarte znaczniki z daleka (ColonySphereUnits)
    this.units = new ColonySphereUnits({ renderer: this.renderer });
  }

  /** Przełącz soczewkę klawiszem (brak → Teren → Złoża → Własność → brak). Zwraca nową. */
  cycleLens() { this.lens = nextLens(this.lens); return this.lens; }

  /**
   * Zsynchronizuj kulę ze stanem okna (wołane co klatkę przed `draw`).
   * @param {object} s
   * @param {object} s.colony wpis kolonii (planet, planetId, name)
   * @param {object} s.grid siatka geo kolonii
   * @param {{q:number, r:number}|null} [s.selected] zaznaczone pole
   * @param {boolean} [s.buildMenu] otwarte menu budowy na wolnym polu (tryb budowy)
   * @param {object|null} [s.hoveredBuilding] definicja budynku pod kursorem w menu
   * @param {boolean} [s.supply] pokrycie zaopatrzenia (Shift+S)
   * @param {Map<string, {type:string}>|null} [s.coverage] mapa pokrycia (klucz = id pola grafu)
   * @param {boolean} [s.lock] dodatkowa blokada auto-obrotu (tryby specjalne: desant, ostrzał…)
   * @param {object|null} [s.techSystem] system technologii kolonii (bramka terenu)
   */
  sync(s) {
    const grid = s.grid, planet = s.colony?.planet ?? null, r = this.renderer;
    const n = grid.tiles.length;
    if (this._grid !== grid || r.bodyId !== (planet?.id ?? null)) {
      const focus = focusTileOf(grid, geodesicTopology(grid.n));
      const tr = (typeof window !== 'undefined') ? window.KOSMOS?.threeRenderer : null;
      let airClock = null;
      try { airClock = tr?.bodyAirClock?.(planet?.id) ?? null; } catch (e) { airClock = null; }
      r.setBody({ body: planet, n: grid.n, star: starOfBody(planet), capitalTile: focus, airClock });
      r.setFallbackColors(fallbackColorsOf(grid.tiles));
      this._grid = grid; this._topoCount = n; this._bytes = null; this._scratch = null; this._epoch = null;
      this._adapter = null; this._lastPos.clear();
      this._lightSig = null;
    }
    const topo = r.topo;
    if (!topo) return;
    if (this._epoch !== themeEpoch()) {
      this._epoch = themeEpoch();
      this._colors = sphereThemeColors(THEME);
      r.setColors(this._colors);
      this._bytes = null;
    }
    const build = !!s.buildMenu;
    const ctx = { techSystem: s.techSystem ?? null, planet };
    let supply = null;
    if (s.supply && s.coverage?.size) {
      supply = new Map();
      for (const [key, info] of s.coverage) {
        const i = typeof key === 'string' && key[0] === 'g' ? Number(key.slice(1)) : NaN;
        if (Number.isInteger(i) && i >= 0 && i < n) supply.set(i, info);
      }
    }
    this._scratch = composeSphereOverlay({
      topo, tiles: grid.tiles, lens: this.lens, supply, accent: this._colors.accentBytes, tint: this.tint,
      buildVerdict: build ? (tile) => buildVerdictFor(tile, s.hoveredBuilding ?? null, ctx) : null,
    }, this._scratch);
    if (!sameBytes(this._scratch, this._bytes)) {
      this._bytes = (this._bytes && this._bytes.length === this._scratch.length) ? this._bytes : new Uint8Array(this._scratch.length);
      this._bytes.set(this._scratch);
      r.setOverlay(this._bytes);
      r.setFallbackColors(fallbackColorsOf(grid.tiles));
    }
    // CS-9 — światła miast: natężenie per pole (deterministyczne, rośnie z budynkami i ludnością) → mapa tylko przy zmianie.
    this._lights = cityLightsOf(grid.tiles, populationOfColony(s.colony), this._lights);
    if (this._lights.signature !== this._lightSig) {
      this._lightSig = this._lights.signature;
      if (this._lights.any) {
        this._lightMap = rasterizeCityLights(topo, this._lights.data, CITY_LIGHTS.mapW, CITY_LIGHTS.mapH, this._lightMap);
        r.setCityLights?.({ data: this._lightMap, w: CITY_LIGHTS.mapW, h: CITY_LIGHTS.mapH, seed: planet?.surfaceSeed ?? 0 });
      } else r.setCityLights?.(null);
    }
    const sel = s.selected && s.selected.r === -1 && Number.isInteger(s.selected.q) ? s.selected.q : -1;
    r.setMode({ selectedTile: sel, gridAll: build, lock: sel >= 0 || build || !!s.lock, work: build || this.lens !== 'none' || !!s.supply });
    // Rama pokazuje tryb zaopatrzenia od razu po Shift+S — także gdy kolonia nie ma jeszcze żadnego pokrycia.
    this._state = { build, supply: !!s.supply, name: s.colony?.name ?? planet?.name ?? '', archetype: planet?.bodyArchetype ?? null };
  }

  /**
   * Kula + znaczniki budynków. Jednostki: gospodarz woła `syncUnits` PRZED `draw` (renderer musi znać instancje modeli)
   * i `drawUnits` po nim — jednostki są nad portretami budynków; rama (`drawChrome`) na końcu.
   */
  draw(ctx, rect) {
    const res = this.renderer.draw(ctx, rect);
    this._drawMarkers(ctx, rect);
    return res;
  }

  /** CS-10 — stan jednostek klatki (lista po regule widoczności gospodarza, zaznaczenie, pauza). */
  syncUnits(s, rect) { this.units.sync({ ...s, grid: s.grid ?? this._grid }, rect); }

  /** CS-10 — jednostki nad kulą i portretami: modele GLB / zwarte znaczniki, paski, stosy, bitwy, lądowania. */
  drawUnits(ctx, rect) { this.units.draw(ctx, rect); }

  drawChrome(ctx, rect) {
    const st = this._state ?? {};
    drawSphereChrome(ctx, rect, {
      title: st.name, archetype: st.archetype, tiles: this._topoCount, lens: this.lens, build: st.build, supply: st.supply,
      legend: sphereLegend({ lens: this.lens, build: st.build, supply: st.supply }), fallback: this.renderer.fallback().fallback,
    });
  }

  /** Promień „heksa" znaczników na ekranie [jednostki gospodarza] (odpowiednik `_hexSize` mapy 2D). */
  markerHexSize(rect) { return this.renderer.tileScreenSize(rect) * 0.5; }

  // ── CS-9 — budynki jako portrety-billboardy (plan §3.18) ─────────────────────────────────────────────────
  // Portret STOI na środku pola (linia gruntu grafiki = środek pola), zwrócony do kamery, pod nim cień i obrys podstawy
  // w barwie kategorii; skala płynna z zoomem (klamry min / max), daleko → kropka kategorii, za horyzontem → nic.
  // Stany: budowa (odbarwiony portret + pierścień postępu), rozbudowa (pierścień), uszkodzony (czerwień), poziom (pipsy).
  // Wszystkie portrety klatki idą z kilku stron atlasu (`ColonyBillboardAtlas`) — bez filtrów i kompozycji per budynek.
  _drawMarkers(ctx, rect) {
    const grid = this._grid, r = this.renderer;
    if (!grid || !r.topo) return;
    const clock = (typeof performance !== 'undefined') ? performance : Date;
    const t0 = clock.now();
    const tilePx = r.tileScreenSize(rect);
    const list = buildBillboardList({ tiles: grid.tiles, project: (i) => r.project(i, rect), tilePx, lodBias: this.lodBias });
    let dpr = 1;
    try { dpr = Math.max(1, Math.abs(ctx.getTransform?.()?.a ?? 1) || 1); } catch (e) { dpr = 1; }
    let portraits = 0, dots = 0;
    ctx.save();
    for (const it of list) {
      if (it.dotAlpha > 0.01) { this._drawDot(ctx, it); dots++; }
      if (it.portraitAlpha > 0.01) { this._drawBillboard(ctx, it, dpr); portraits++; }
    }
    this._drawTileNotes(ctx, rect, tilePx * 0.5);
    ctx.restore();
    const ms = clock.now() - t0;
    const st = this._markerStats;
    st.ms.push(ms); if (st.ms.length > 240) st.ms.shift();
    st.portraits = portraits; st.dots = dots; st.frames++;
  }

  _drawDot(ctx, it) {
    ctx.globalAlpha = it.alpha * it.dotAlpha;
    ctx.beginPath(); ctx.arc(it.x, it.y, it.dot, 0, Math.PI * 2);
    ctx.fillStyle = it.spec.state === BILLBOARD_STATE.DAMAGED ? BILLBOARD_COLORS.damaged
      : (it.spec.state === BILLBOARD_STATE.CONSTRUCTION ? BILLBOARD_COLORS.construction : categoryCss(it.spec.category));
    ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = BILLBOARD_COLORS.ink; ctx.stroke();
  }

  _drawBillboard(ctx, it, dpr) {
    const T = BILLBOARD, spec = it.spec, size = it.size, x = it.x, y = it.y;
    const a = it.alpha * it.portraitAlpha;
    const top = y - size * T.groundY;
    const stateCss = spec.state === BILLBOARD_STATE.DAMAGED ? BILLBOARD_COLORS.damaged
      : (spec.state === BILLBOARD_STATE.CONSTRUCTION ? BILLBOARD_COLORS.construction : categoryCss(spec.category));
    // 1. cień / stopa na gruncie
    const sh = this._atlas.shadow();
    ctx.globalAlpha = a * T.shadowAlpha;
    if (sh) ctx.drawImage(sh.canvas, sh.sx, sh.sy, sh.s, sh.s, x - size * T.shadowW / 2, y - size * T.shadowH / 2, size * T.shadowW, size * T.shadowH);
    ctx.globalAlpha = a;
    if (spec.capital) {
      // Stolica: ciemny dysk + złoty pierścień za portretem (znak stolicy z CS-7 — bez zmian).
      const cy = top + size / 2;
      ctx.beginPath(); ctx.arc(x, cy, size * 0.56, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(8,10,14,0.55)'; ctx.fill();
      ctx.lineWidth = Math.max(2, Math.min(5, size * 0.045)); ctx.strokeStyle = BILLBOARD_COLORS.capitalRing; ctx.stroke();
    } else {
      // 2. podstawa w barwie kategorii (albo stanu) — barwa kategorii NIE przykrywa grafiki
      ctx.beginPath(); ctx.ellipse(x, y, size * T.baseW / 2, size * T.baseH / 2, 0, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1, size * 0.022); ctx.strokeStyle = stateCss; ctx.stroke();
    }
    // 3. portret (PNG albo znak kategorii) z atlasu
    const img = this._getIcon(spec.portraitId);
    const sp = this._atlas.portrait(spec.portraitId, spec.state, spec.category, img, size * dpr);
    if (sp) {
      ctx.globalAlpha = a * (spec.state === BILLBOARD_STATE.CONSTRUCTION ? T.constructionAlpha : 1);
      ctx.drawImage(sp.canvas, sp.sx, sp.sy, sp.s, sp.s, x - size / 2, top, size, size);
      ctx.globalAlpha = a;
    }
    // 4. plakietka budynku na polu stolicy
    if (spec.badgeId && size > 22) {
      const bs = size * 0.42, bx = x + size * 0.42, by = top + size * 0.86;
      ctx.beginPath(); ctx.arc(bx, by, bs * 0.58, 0, Math.PI * 2);
      ctx.fillStyle = BILLBOARD_COLORS.ink; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = BILLBOARD_COLORS.capitalRing; ctx.stroke();
      const bCat = BUILDINGS[spec.badgeId]?.category ?? 'civil';
      const bsp = this._atlas.portrait(spec.badgeId, BILLBOARD_STATE.BUILT, bCat, this._getIcon(spec.badgeId), bs * dpr);
      if (bsp) ctx.drawImage(bsp.canvas, bsp.sx, bsp.sy, bsp.s, bsp.s, bx - bs / 2, by - bs * 0.56, bs, bs);
    }
    // 5. pierścień postępu (budowa / rozbudowa)
    if (spec.progress != null && size >= T.ringMinPortraitPx) {
      const rr = Math.max(4.5, size * 0.12), rx = x + size * 0.30, ry = top + size * 0.24;
      ctx.beginPath(); ctx.arc(rx, ry, rr + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = BILLBOARD_COLORS.ink; ctx.fill();
      ctx.lineWidth = Math.max(1.6, rr * 0.36);
      ctx.beginPath(); ctx.arc(rx, ry, rr * 0.72, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(rx, ry, rr * 0.72, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, spec.progress));
      ctx.strokeStyle = BILLBOARD_COLORS.construction; ctx.stroke();
    }
    // 6. pipsy poziomu
    if (spec.pips.count > 0 && size >= T.pipMinPortraitPx) {
      const pr = Math.max(1.4, size * 0.034), gap = pr * 2.7, n = spec.pips.count;
      const py = y + size * T.baseH / 2 + pr * 1.9;
      for (let k = 0; k < n; k++) {
        const px = x + (k - (n - 1) / 2) * gap;
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fillStyle = k < spec.pips.strong ? BILLBOARD_COLORS.pipStrong : BILLBOARD_COLORS.pip; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = BILLBOARD_COLORS.ink; ctx.stroke();
      }
    }
  }

  // Adnotacje pól spoza budynków (jak w CS-7): anomalia, pasek okupacji.
  _drawTileNotes(ctx, rect, base) {
    if (base < NOTE_MIN_PX) return;
    const tiles = this._grid.tiles, r = this.renderer;
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const anomaly = tile.anomaly && tile.anomalyDetected;
      const occupying = tile.occupyEmpireId && tile.occupyStart != null;
      if (!anomaly && !occupying) continue;
      const p = r.project(i, rect);
      const alpha = p ? horizonAlpha(p.facing, p.visible !== false) : 0;
      if (alpha <= 0) continue;
      const rad = base * Math.sqrt(Math.min(1, p.facing));
      const hasB = !!tile.buildingId || !!tile.capitalBase;
      ctx.globalAlpha = alpha;
      if (anomaly && rad > 9) {
        const icon = tile.anomalyRevealed ? (ANOMALIES[tile.anomaly]?.icon ?? '⚠') : '❓';
        ctx.font = `${Math.max(8, Math.round(rad * 0.5))}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffdd44';
        ctx.fillText(icon, p.x, hasB ? p.y + rad * 0.62 : p.y);
      }
      if (occupying) {
        const now = (typeof window !== 'undefined' ? window.KOSMOS?.timeSystem?.gameTime : 0) ?? 0;
        const prog = Math.max(0, Math.min(1, (now - tile.occupyStart) / OCCUPATION_YEARS));
        if (prog > 0 && prog < 1) {
          const bw = rad * 1.2, bh = Math.max(2, rad * 0.1);
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - bw / 2, p.y + rad * 0.55, bw, bh);
          ctx.fillStyle = '#D85A30'; ctx.fillRect(p.x - bw / 2, p.y + rad * 0.55, bw * prog, bh);
        }
      }
    }
  }

  /** CS-9 — pomiar przebiegu znaczników i stan świateł (sonda, `csBuildings()`). */
  markerInfo() {
    const st = this._markerStats, ms = st.ms;
    const sorted = [...ms].sort((a, b) => a - b);
    return { portraits: st.portraits, dots: st.dots, frames: st.frames, tint: this.tint,
      msMedian: sorted.length ? sorted[sorted.length >> 1] : 0, msMax: sorted.length ? sorted[sorted.length - 1] : 0,
      atlas: this._atlas.stats(), lights: this._lights ? { any: this._lights.any, lit: this._lights.lit, factor: this._lights.factor } : null };
  }

  // ── Wejście ─────────────────────────────────────────────────────────────────────────

  /** Pole siatki pod punktem ekranu (albo null). */
  pickTile(x, y, rect, grid = this._grid) {
    const i = this.renderer.pick(x, y, rect);
    return i >= 0 ? (grid?.tiles?.[i] ?? null) : null;
  }

  /** Ruch myszy. `blocked` = kursor nad panelem / przyciskiem okna (kula nie reaguje, auto-obrót może wrócić). */
  pointerMove(x, y, rect, blocked = false) {
    if (blocked && !this.renderer.dragging) { this.renderer.pointerLeave(); return { tile: -1, onSphere: false, dragging: false }; }
    return this.renderer.pointerMove(x, y, rect);
  }

  pointerLeave() { this.renderer.pointerLeave(); }
  dragStart(x, y, rect) { return this.renderer.dragStart(x, y, rect); }
  dragEnd() { return this.renderer.dragEnd(); }
  get dragging() { return this.renderer.dragging; }
  wheel(delta) { this.renderer.wheel(delta); }

  /** Klik w pole: zwraca true, gdy to dwuklik (kula obraca się do pola). */
  clickTile(tile, now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
    const i = tile?.r === -1 ? tile.q : -1;
    const dbl = i >= 0 && this._lastClick.tile === i && now - this._lastClick.t <= DOUBLE_CLICK_MS;
    this._lastClick = dbl ? { tile: -1, t: -Infinity } : { tile: i, t: now };
    if (dbl) this.renderer.turnTo(i);
    return dbl;
  }

  /** Obróć kulę do pola (np. zaznaczenie jednostki z listy). */
  turnToTile(pos) { return pos?.r === -1 ? this.renderer.turnTo(pos.q) : false; }

  /**
   * Klawisze kuli: strzałki / WASD — obrót (gdy bez Shift). Zwraca true, gdy klawisz zużyty.
   * Soczewkę przełącza gospodarz (`cycleLens`) — ma komunikat do pokazania.
   */
  key(key, mods = {}) {
    if (mods.shift || mods.ctrl) return false;
    const r = this.renderer;
    if (key === 'ArrowLeft' || key === 'a') { r.rotateBy(-KEY_TURN_RAD, 0); return true; }
    if (key === 'ArrowRight' || key === 'd') { r.rotateBy(KEY_TURN_RAD, 0); return true; }
    if (key === 'ArrowUp' || key === 'w') { r.rotateBy(0, KEY_TURN_RAD); return true; }
    if (key === 'ArrowDown' || key === 's') { r.rotateBy(0, -KEY_TURN_RAD); return true; }
    return false;
  }

  /**
   * Pozycja pola na ekranie. Pole po niewidocznej stronie kuli → ostatnia widoczna pozycja (panel pola nie skacze),
   * a gdy jej nie ma — brzeg tarczy.
   */
  tileScreenPos(tile, rect) {
    const i = tile?.r === -1 ? tile.q : -1;
    const p = this.renderer.project(i, rect);
    if (p?.visible) { const out = { x: p.x, y: p.y, visible: true }; this._lastPos.set(i, out); return out; }
    const last = this._lastPos.get(i);
    if (last) return { x: last.x, y: last.y, visible: false };
    const d = this.renderer.discOnScreen(rect);
    return { x: d.x + d.r, y: d.y, visible: false };
  }

  /**
   * Siatka dla dzisiejszego rysowania jednostek: `tilePixelPos(q, r)` = rzut pola na ekran względem środka kadru
   * (gospodarz rysuje z kamerą (0, 0)); pole za horyzontem → daleko poza kadrem.
   */
  gridAdapter(grid, rect) {
    if (this._adapterGrid !== grid || !this._adapter) {
      const view = this;
      this._adapter = Object.create(grid);
      this._adapter.tilePixelPos = function tilePixelPos(q, r) {
        const rc = view._adapterRect;
        const p = r === -1 && rc ? view.renderer.project(q, rc) : null;
        if (!p || !p.visible || p.facing < MARKER_MIN_FACING * 0.5) return { x: 1e6, y: 1e6 };
        return { x: p.x - (rc.x + rc.w / 2), y: p.y - (rc.y + rc.h / 2) };
      };
      this._adapterGrid = grid;
    }
    this._adapterRect = rect;
    return this._adapter;
  }

  // ── Mała kula w panelu informacji (zastępuje dekoracyjny globus mapy 2D dla kolonii geo) ───────────────────────────

  /** Narysuj małą, obracającą się kulę tego samego ciała (bez nakładki, bez interakcji). */
  drawMini(ctx, rect, planet, grid) {
    if (!planet || !grid) return;
    if (!this._mini) this._mini = this._mk({ onChange: this._onChange, tuning: MINI_TUNING });
    if (this._mini.bodyId !== planet.id) this._mini.setBody({ body: planet, n: grid.n, star: starOfBody(planet), capitalTile: focusTileOf(grid, geodesicTopology(grid.n)) });
    // Mała kula jest dekoracją: obraca się tylko wtedy, gdy duża się obraca (zatrzymana duża = bezczynne okno, 0 klatek).
    this._mini.setMode({ lock: this.renderer.spinMode !== 'spin' });
    this._mini.draw(ctx, rect);
    this._miniDrawn = true;
  }

  /**
   * Pola kolonii w kolejności od pola pod stolicę (odległość po grafie, remis → indeks) — rozstawienie budynków
   * startowych NOWEJ kolonii macierzystej na kuli: budynki stają przy stolicy, nie rozsiane po globie.
   */
  static tilesNearCapital(grid) {
    const topo = geodesicTopology(grid.n);
    const cap = bestGeoCapitalTile(grid);
    if (!cap) return grid.tiles.slice();
    const c = cap.q;
    return grid.tiles.map((t, i) => i).sort((a, b) => (topo.distance(c, a) - topo.distance(c, b)) || (a - b)).map(i => grid.tiles[i]);
  }

  /** Za ile ms okno ma narysować kolejną klatkę (kula + mała kula); ∞ = bez zmian. */
  nextFrameDelayMs() {
    const a = this.renderer.nextFrameDelayMs();
    const b = this._mini && this._miniDrawn ? this._mini.nextFrameDelayMs() : Infinity;
    this._miniDrawn = false;
    return Math.min(a, b, this.units.nextFrameDelayMs());
  }

  /** Zwolnij konteksty WebGL (okno ukryte). */
  release() {
    this.renderer.release();
    this._mini?.release();
    this._lastClick = { tile: -1, t: -Infinity };
  }
}

/**
 * Wczytaj w tle mapę bohatera stolicy po starcie gry (priorytet bezczynny — za mapami LOD układu). Tylko przy fladze
 * `colonySphere`; brak cache / ciała → ponawia co 2 s, najwyżej przez 5 minut. Zwraca funkcję anulującą.
 */
export const SURFACE_PRIORITY_IDLE = 10;
export function scheduleCapitalHeroPrefetch({ flag, getCache = () => ((typeof window !== 'undefined') ? window.KOSMOS?.surfaceCache : null) ?? null, getBody,
  setTimer = setInterval, clearTimer = clearInterval, everyMs = 2000, tries = 150 } = {}) {
  if (!flag) return () => {};
  let left = tries, id = null;
  const tick = () => {
    const cache = getCache?.(), body = getBody?.();
    if (cache && body) {
      try { cache.request(body, 'hero', SURFACE_PRIORITY_IDLE); } catch (e) { /* cache zamknięty */ }
      clearTimer(id);
    } else if (--left <= 0) clearTimer(id);
  };
  id = setTimer(tick, everyMs);
  return () => clearTimer(id);
}
