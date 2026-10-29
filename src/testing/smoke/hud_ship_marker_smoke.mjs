// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — ZNACZNIK STATKU na mapie 3D (krok po ARKUSZU HUD; D-SM-1…6, HUD_PLAN.md §„Znacznik statku”):
// `HudShipMarkerLogic` + podwarstwa `HudShipMarkerLayer` warstwy HUD 2D (zamiast insygnium frakcji 3D).
// Uruchom: node src/testing/smoke/hud_ship_marker_smoke.mjs
//
// Wyłącznie LOGIKA (protokół HUD_PLAN §4.0, aneks 2026-10-23): bez pinów na stałych rysunku — liczby z tabeli stałych modułu,
// nie z literałów keepera. Moduły powstają w kroku SM-1 — import dynamiczny (brak modułu = pin pada, suita się nie przerywa).
//   M0  API; flaga `hudShipMarker` (brak klucza = OFF); podwarstwa przed etykietami; insygnium 3D bramkowane flagą
//   M1  rola wg relacji (D-SM-1): własny `primary`, obcy `foreign`, wróg `alert` (wojna / opinia wroga / rajder bez imperium)
//   M2  mgła wojny (reguła insygnium, fail-closed): obcy od `contact` albo w starciu z graczem; bez sprite'a, ukryty, wrak — nic
//   M3  kąt z wektora: cztery kierunki na ekranie (prawdziwy rzut) + skok warp (kierunek kresek H3)
//   M4  ruch / bezruch: idle, dok, orbita (styczna = pochodna położenia orbity), w locie (prędkość, geometria trasy), próg
//   M5  czysty widok (SHIFT) — bez znacznika (logika i warstwa)
//   M6  model uwagi: bez ostrości MARKER_ALPHA; z ostrością zaznaczony SELECTED_ALPHA, reszta × LABEL_DIM; alert / najechanie
//       1; wywiad × krycie sprite'a; przejście FADE_MS czasu realnego; bez oddechu; gaśnięcie przy bliskim zoomie (progi nawiasów)
//   M7  OFF = pusto: flaga wyłączona — zero znaczników, zero wywołań ctx podwarstwy, zero przeszkód etykiet
//   M8  ślad stref kliku warstwy HUD: znacznik nie ma strefy — klik i pokrycie w każdym punkcie siatki jak bez znacznika
//   M9  pauza: zegar stoi — spoczynek warstwy (zero wywołań ctx); zegar ruszył — nowa styczna orbity, klatka
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import * as T3 from '../../lib/three.core.js';

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const src = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), 'utf8'); } catch { return ''; } };
const tryImport = async (p) => { try { return await import(p); } catch (e) { console.log('    (' + p + ': ' + e.message + ')'); return null; } };
const angDiff = (a, b) => { const d = Math.abs(((a - b) % 360 + 540) % 360 - 180); return d; };

const LG = await tryImport('../../ui/HudShipMarkerLogic.js');
const LY = await tryImport('../../ui/HudShipMarkerLayer.js');
const HL = await tryImport('../../ui/HudLayer.js');
const AT = await tryImport('../../ui/HudAttentionLogic.js');
const RT = await tryImport('../../ui/HudRouteLogic.js');
const PJ = await tryImport('../../ui/HudProjection.js');
const FEATURES = GAME_CONFIG.FEATURES;
const S = LG?.HUD_SHIP_MARKER ?? {};
const A = AT?.HUD_ATTENTION ?? {};
const call = (fn, ...a) => { try { return LG?.[fn]?.(...a); } catch (e) { return `ERR ${e.message}`; } };

// ═══ Atrapa świata (warstwa) ═════════════════════════════════════════════════
// Kamera z góry: oś X świata → w prawo na ekranie, oś Z świata → w dół (x układu → X, y układu → Z). 1 AU = 11 j. świata.
globalThis.innerWidth = 1600; globalThis.innerHeight = 1041;
const CAM = new T3.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000);
CAM.up.set(0, 0, -1); CAM.position.set(0, 60, 0); CAM.lookAt(0, 0, 0); CAM.updateMatrixWorld();
const VIEW = () => ({ view: CAM.matrixWorldInverse.elements.slice(), proj: CAM.projectionMatrix.elements.slice(), fovDeg: 55, cssW: 1600, cssH: 1041, worldPerAU: 11 });
const W0 = { sim: 5000, camEpoch: 1, sel: [], lead: null, clean: false, hover: null, intel: {}, war: new Set(), hostile: new Set(), eng: new Set() };
// Statki (px logiki gry; świat = /10). Kolumny: x ∈ {-150 … 150}, wiersze: y ∈ {-100 … 100}.
const mk = (id, x, y, o = {}) => ({ id, name: id, position: { x, y, state: 'in_transit', dockedAt: null, ...(o.position ?? {}) },
  velocity: o.velocity ?? { vx: 0, vy: 0 }, systemId: o.systemId === undefined ? 'sys_home' : o.systemId, mission: o.mission ?? null,
  isWreck: !!o.isWreck, isEnemy: !!o.isEnemy, ownerEmpireId: o.emp ?? null, movementOrder: o.movementOrder ?? null });
const VESSELS = [
  mk('v_e', -150, -100, { velocity: { vx: 0.1, vy: 0 } }),
  mk('v_s', -50, -100, { velocity: { vx: 0, vy: 0.1 } }),
  mk('v_w', 50, -100, { velocity: { vx: -0.1, vy: 0 } }),
  mk('v_n', 150, -100, { velocity: { vx: 0, vy: -0.1 } }),
  mk('v_idle', -150, 0, { position: { state: 'orbiting', dockedAt: null } }),
  mk('v_orb', -50, 0, { position: { state: 'orbiting', dockedAt: 'p1' } }),
  mk('v_route', 50, 0, { mission: { type: 'transport', phase: 'outbound', targetX: 400, targetY: 0, liveTargetX: 50, liveTargetY: 400,
    startX: 50, startY: 0, departYear: 100, arrivalYear: 110, waypoints: [] } }),
  mk('v_warp', 150, 0, { systemId: null, mission: { type: 'interstellar_jump', phase: 'warp_transit', fromSystemId: 'sys_home',
    toSystemId: 'sys_2', fromGalX: 0, fromGalY: 0, toGalX: 0, toGalY: -5, targetName: 'Cel' } }),
  mk('e_war', -150, 100, { isEnemy: true, emp: 'emp_w' }),
  mk('e_peace', -90, 100, { isEnemy: true, emp: 'emp_p' }),
  mk('e_host', -30, 100, { isEnemy: true, emp: 'emp_h' }),
  mk('e_raid', 30, 100, { isEnemy: true, emp: null }),
  mk('e_rumor', 90, 100, { isEnemy: true, emp: 'emp_w' }),
  mk('e_eng', 150, 100, { isEnemy: true, emp: 'emp_w' }),
  mk('v_wreck', 0, 60, { isWreck: true, position: { state: 'orbiting', dockedAt: null } }),
  mk('v_dock', 0, -60, { position: { state: 'docked', dockedAt: 'p1' } }),
];
const vesselBy = (id) => VESSELS.find((v) => v.id === id) ?? null;
W0.intel = { e_war: 'contact', e_peace: 'detailed', e_host: 'contact', e_raid: 'contact', e_rumor: 'rumor', e_eng: 'rumor' };
W0.war = new Set(['emp_w']); W0.hostile = new Set(['emp_h']); W0.eng = new Set(['e_eng']);
const ORBITS = { v_orb: { anchored: false, theta0: 0, omega: 0.1 } };
const spriteVisible = (v) => !(v.isEnemy && !['rumor', 'contact', 'detailed'].includes(W0.intel[v.id] ?? 'unknown'));
// Sprite'y: jak renderer — zadokowany bez sprite'a; wróg `rumor` — duch (sprite widoczny, krycie 0,3); `contact` — 0,5.
const SPRITES = () => new Map(VESSELS.filter((v) => v.position.state !== 'docked').map((v) => [v.id,
  { sprite: { visible: spriteVisible(v) }, intelOpacity: v.isEnemy ? ({ rumor: 0.3, contact: 0.5 }[W0.intel[v.id]] ?? 1) : undefined }]));
const setWorld = () => {
  const K = globalThis.window.KOSMOS ?? (globalThis.window.KOSMOS = {});
  for (const k of Object.keys(K)) delete K[k];
  Object.assign(K, {
    civMode: true, activeSystemId: 'sys_home', uiScale: 1.25, planetGlobeOpen: false, uiPrefs: {},
    uiManager: { get _cleanView() { return W0.clean; }, overlayManager: { isAnyOpen: () => false }, getSelectedVesselIds: () => [...W0.sel],
      getSelectedVesselId: () => W0.lead, _selectedEntity: null, getSelectedFleetId: () => null },
    threeRenderer: {
      get _cleanView() { return W0.clean; }, _renderingEnabled: true, _contextLost: false, renderer: { getPixelRatio: () => 1.5 },
      getCameraMoveEpoch: () => W0.camEpoch, getHudView: VIEW, _tacticalHoverVid: null, _hoverPlanetId: null,
      get _vessels() { return SPRITES(); },
      getVesselWorldInfo: (id) => { const v = vesselBy(id); return v && v.position.state !== 'docked' ? { x: v.position.x / 10, y: 0.3, z: v.position.y / 10, r: 0.02 } : null; },
      getVesselWorldPosition: (id) => { const v = vesselBy(id); return v ? { x: v.position.x / 10, y: 0.3, z: v.position.y / 10 } : null; },
      _isCombatRevealed: (id) => W0.eng.has(id),
      _getVesselAtScreen: () => W0.hover,
      getBodyWorldInfo: () => null,
    },
    vesselManager: { getAllVessels: () => [...VESSELS], getVessel: vesselBy },
    intelSystem: { getVesselContact: (id) => (W0.intel[id] ? { quality: W0.intel[id] } : null) },
    diplomacySystem: { relations: { getStatus: (a, b) => ([a, b].some((x) => W0.war.has(x)) ? 'war' : 'peace') },
      getOpinionBand: (e) => (W0.hostile.has(e) ? 'hostile' : 'neutral') },
    orbitalSpaceSystem: { getOrbit: (id) => ORBITS[id] ?? null },
    timeSystem: { get simClockMs() { return W0.sim; }, gameTime: 105 },
    leftOutliner: { getReservedWidth: () => 150 }, rightOutliner: { getReservedWidth: () => 150 }, tacticalDock: { getReservedHeight: () => 0 },
  });
  return K;
};
const K = setWorld();
const mkCtx = () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (o, p) => (p === 'calls' ? calls : (p in o ? o[p] : (...a) => { calls.push(String(p)); })),
    set: (o, p, v) => { o[p] = v; return true; } });
  return ctx;
};
const mkHud = ({ only = true } = {}) => {
  const ctx = mkCtx(); const cv = { width: 0, height: 0, getContext: () => ctx };
  const lay = LY?.HudShipMarkerLayer ? new LY.HudShipMarkerLayer(null) : null;
  const hud = HL?.HudLayer && lay ? new HL.HudLayer(cv, { autoStart: false, now: () => 0, sublayers: only ? [lay] : undefined }) : null;
  if (hud && lay) lay._hud = hud;
  return { ctx, hud, lay, frame: (now) => (hud ? hud.frame(now) : null), dbg: () => lay?.debug?.() ?? null };
};
const byId = (d) => new Map((d?.markers ?? []).map((m) => [m.id, m]));
const PREV_FLAG = FEATURES.hudShipMarker;
FEATURES.hudShipMarker = true;

// ═══ M0 ══════════════════════════════════════════════════════════════════════
header('M0  API, flaga, miejsce podwarstwy, insygnium 3D bramkowane flagą');
{
  const need = ['HUD_SHIP_MARKER', 'HUD_SHIP_MARKER_DEFAULTS', 'isHudShipMarkerOn', 'shipMarkerRelation', 'shipMarkerRole', 'shipMarkerVisible',
    'orbitTangent', 'classifyMotion', 'routeMotionPoint', 'screenDirection', 'screenAngleDeg', 'markerGeometry', 'markerZoomFade', 'markerAttentionTarget',
    'markerAlpha', 'tuneHudShipMarker', 'resetHudShipMarker'];
  const missing = need.filter((n) => LG?.[n] === undefined);
  ok(missing.length === 0, `M0a: \`HudShipMarkerLogic\` — ${need.length} eksportów (brak: ${missing.join(', ') || '—'})`);
  ok(typeof LY?.HudShipMarkerLayer === 'function', 'M0b: `HudShipMarkerLayer`');
  ok(call('isHudShipMarkerOn', {}) === false && call('isHudShipMarkerOn', { hudShipMarker: false }) === false
    && call('isHudShipMarkerOn', { hudShipMarker: true }) === true && call('isHudShipMarkerOn', null) === false,
  'M0c: flaga — brak klucza / false / brak FEATURES = OFF; true = ON');
  const hl = strip(src('../../ui/HudLayer.js'));
  ok(/new HudRadarLayer\(this\), new HudShipMarkerLayer\(this\), new HudLabelLayer\(this\)/.test(hl),
    'M0d: podwarstwa znacznika po radarze, PRZED etykietami (zbierana przed nimi — przeszkody etykiet; rysowana pod nimi)');
  const tr = strip(src('../../renderer/ThreeRenderer.js'));
  const i0 = tr.indexOf('  _syncInsignia() {'), body = i0 >= 0 ? tr.slice(i0, tr.indexOf('\n  }\n', i0)) : '';
  ok(/hudShipMarker\s*===\s*true/.test(body) && /_disposeAllInsignia\(\)/.test(body)
    && body.indexOf('this.camera.updateMatrixWorld()') >= 0 && body.indexOf('this.camera.updateMatrixWorld()') < body.indexOf('hudShipMarker'),
    'M0e: `_syncInsignia` przy fladze ON zwalnia insygnia i wraca — po odświeżeniu macierzy kamery (czytają ją paski HP i celownik)');
  const H = mkHud();
  ok(typeof H.lay?.handleClick !== 'function' && typeof H.lay?.coversUiPoint !== 'function' && typeof H.lay?.pinButtonAt !== 'function'
    && typeof H.lay?.labelObstacles === 'function', 'M0f: podwarstwa bez strefy kliku (klik idzie dalej, do pickera statków 3D); przeszkody etykiet — tak');
  ok(typeof HL?.HudLayer === 'function' && JSON.stringify(new HL.HudLayer(null, { autoStart: false }).tune({ MARKER_W: 13 })).includes('"MARKER_W":13'),
    'M0g: strojenie z konsoli — `hudLayer.tune({ MARKER_W })` trafia do stałych znacznika');
  new HL.HudLayer(null, { autoStart: false }).tune(null);
  ok(S.MARKER_W === LG?.HUD_SHIP_MARKER_DEFAULTS?.MARKER_W, 'M0h: `tune(null)` — wartości domyślne');
}

// ═══ M1 ══════════════════════════════════════════════════════════════════════
header('M1  rola wg relacji (D-SM-1)');
{
  const rel = (o) => call('shipMarkerRelation', o);
  ok(rel({ isEnemy: false }) === 'own' && rel({ isEnemy: false, empireId: 'emp_w', atWar: true }) === 'own', 'M1a: własny — `own` (relacje imperiów go nie dotyczą)');
  ok(rel({ isEnemy: true, empireId: 'emp_p', atWar: false, hostile: false }) === 'foreign', 'M1b: obcy w pokoju — `foreign`');
  ok(rel({ isEnemy: true, empireId: 'emp_w', atWar: true }) === 'enemy' && rel({ isEnemy: true, empireId: 'emp_h', hostile: true }) === 'enemy',
    'M1c: wojna z właścicielem albo opinia „wroga” — `enemy`');
  ok(rel({ isEnemy: true, empireId: null }) === 'enemy', 'M1d: statek wrogi bez imperium (rajder) — `enemy`');
  const role = (r) => call('shipMarkerRole', r);
  ok(role('own') === 'primary' && role('foreign') === 'foreign' && role('enemy') === 'alert', 'M1e: role HUD — `primary` / `foreign` (token textPrimary) / `alert`');
  // Warstwa: prawdziwa relacja z dyplomacji atrapy.
  const H = mkHud();
  H.frame(1000);
  const m = byId(H.dbg());
  ok(m.get('v_e')?.role === 'primary' && m.get('e_peace')?.role === 'foreign' && m.get('e_war')?.role === 'alert'
    && m.get('e_host')?.role === 'alert' && m.get('e_raid')?.role === 'alert',
  `M1f SEDNO (warstwa): własny primary · obcy w pokoju foreign · wojna alert · opinia wroga alert · rajder alert (${['v_e', 'e_peace', 'e_war', 'e_host', 'e_raid'].map((i) => `${i}=${m.get(i)?.role ?? '—'}`).join(' ')})`);
}

// ═══ M2 ══════════════════════════════════════════════════════════════════════
header('M2  mgła wojny — reguła insygnium, fail-closed');
{
  const vis = (o) => call('shipMarkerVisible', { hasSprite: true, spriteVisible: true, ...o });
  ok(vis({ isEnemy: false }) === true, 'M2a: własny ze sprite\'em — znacznik');
  ok(vis({ isEnemy: true, quality: 'unknown' }) === false && vis({ isEnemy: true, quality: null }) === false && vis({ isEnemy: true }) === false,
    'M2b SEDNO: obcy niewykryty (`unknown`, brak wywiadu) — BEZ znacznika');
  ok(vis({ isEnemy: true, quality: 'rumor' }) === false, 'M2c SEDNO: obcy `rumor` (duch w ostatnio znanym miejscu) — BEZ znacznika');
  ok(vis({ isEnemy: true, quality: 'contact' }) === true && vis({ isEnemy: true, quality: 'detailed' }) === true, 'M2d: obcy `contact` / `detailed` — znacznik');
  ok(vis({ isEnemy: true, quality: 'rumor', inPlayerEngagement: true }) === true, 'M2e: obcy w starciu z graczem — znacznik (jak insygnium, P2a CP17)');
  ok(vis({ isEnemy: false, isWreck: true }) === false && call('shipMarkerVisible', { hasSprite: false, spriteVisible: false, isEnemy: false }) === false
    && call('shipMarkerVisible', { hasSprite: true, spriteVisible: false, isEnemy: false }) === false,
  'M2f: wrak, statek bez sprite\'a, sprite ukryty — bez znacznika (fail-closed)');
  const H = mkHud();
  H.frame(1000);
  const m = byId(H.dbg());
  ok(!m.has('e_rumor') && m.has('e_eng') && !m.has('v_wreck') && !m.has('v_dock'),
    `M2g SEDNO (warstwa): wróg \`rumor\` z widocznym duchem — nic; ten sam w starciu z graczem — znacznik; wrak, zadokowany — nic (${[...m.keys()].join(',')})`);
  W0.intel.e_war = 'unknown';
  W0.camEpoch++; H.frame(2000);
  ok(!byId(H.dbg()).has('e_war'), 'M2h: wywiad spadł do `unknown` (sprite ukryty) — znacznik znika');
  W0.intel.e_war = 'contact'; W0.camEpoch++;
}

// ═══ M3 ══════════════════════════════════════════════════════════════════════
header('M3  kąt z wektora — cztery kierunki + skok warp');
{
  const ang = (dx, dy) => call('screenAngleDeg', call('screenDirection', { x: 100, y: 100 }, { x: 100 + dx, y: 100 + dy }));
  ok(near(ang(5, 0), 0) && near(ang(0, 5), 90) && near(ang(-5, 0), 180) && near(ang(0, -5), 270),
    `M3a: kierunek na ekranie → kąt: w prawo 0°, w dół 90°, w lewo 180°, w górę 270° (${[ang(5, 0), ang(0, 5), ang(-5, 0), ang(0, -5)].join(', ')})`);
  ok(call('screenDirection', { x: 1, y: 1 }, { x: 1, y: 1 }) === null, 'M3b: rzut zdegenerowany (ruch wzdłuż osi widoku) — bez kierunku (romb)');
  const H = mkHud();
  H.frame(1000);
  const m = byId(H.dbg());
  const a4 = ['v_e', 'v_s', 'v_w', 'v_n'].map((i) => m.get(i)?.angle);
  ok(a4[0] === 0 && a4[1] === 90 && a4[2] === 180 && a4[3] === 270 && ['v_e', 'v_s', 'v_w', 'v_n'].every((i) => m.get(i)?.kind === 'chevron'),
    `M3c SEDNO (warstwa, prawdziwy rzut kamerą z góry): prędkość +x / +y / −x / −y → daszek 0° / 90° / 180° / 270° (${a4.join(', ')})`);
  const w = m.get('v_warp');
  ok(w?.kind === 'chevron' && w?.source === 'warp' && w?.angle === 270,
    `M3d: skok warp (galaktyka: cel na −y) — daszek ku górze kadru, źródło \`warp\` (${w?.kind}, ${w?.source}, ${w?.angle}°)`);
  // Ten sam kierunek co kreski H3: początek promienia warp (`warpScreenRay`) na tej samej kamerze.
  const proj = PJ?.makeHudProjector?.({ ...VIEW(), uiScale: 1.25 });
  const v = vesselBy('v_warp');
  const ws = RT?.warpSpec?.(v, 'sys_home');
  const ray = ws && proj ? RT.warpScreenRay({ start: { x: v.position.x / 10, y: 0, z: v.position.y / 10 }, dir: { x: ws.dir.x, z: ws.dir.y }, worldPerAU: 11,
    toScreen: (x, y, z) => proj.point(x, y, z), rect: { x: 150, y: 0, w: 980, h: 832 } }) : null;
  const rayAng = ray?.pts?.length >= 2 ? call('screenAngleDeg', call('screenDirection', ray.pts[0], ray.pts[1])) : null;
  ok(Number.isFinite(rayAng) && angDiff(rayAng, w?.angle ?? NaN) < 1, `M3e SEDNO: daszek warp = kierunek kresek H3 (promień ${rayAng?.toFixed?.(1)}°, daszek ${w?.angle}°)`);
}

// ═══ M4 ══════════════════════════════════════════════════════════════════════
header('M4  ruch / bezruch');
{
  const cm = (o) => call('classifyMotion', o) ?? {};
  ok(cm({ state: 'orbiting', dockedAt: null, velocity: { vx: 0, vy: 0 } }).moving === false, 'M4a: idle (wolna przestrzeń, prędkość 0) — bez ruchu (romb)');
  ok(cm({ state: 'docked', dockedAt: 'p1', velocity: { vx: 1, vy: 0 } }).moving === false, 'M4b: zadokowany — bez ruchu (i bez sprite\'a — M2f)');
  const o = { anchored: false, theta0: 0.7, omega: 0.13 };
  const t = 3.2, th = o.theta0 + o.omega * t, h = 1e-4;
  const pos = (tt) => ({ x: Math.cos(o.theta0 + o.omega * tt), z: Math.sin(o.theta0 + o.omega * tt) });   // `getPosition` — r·sin φ pominięte
  const fd = { x: (pos(t + h).x - pos(t - h).x), y: (pos(t + h).z - pos(t - h).z) };
  const fl = Math.hypot(fd.x, fd.y);
  const orb = cm({ state: 'orbiting', dockedAt: 'p1', orbit: o, tSec: t });
  ok(orb.moving === true && orb.source === 'orbit' && near(orb.dir?.x, fd.x / fl, 1e-6) && near(orb.dir?.y, fd.y / fl, 1e-6),
    `M4c SEDNO: orbita przy ciele — daszek wzdłuż stycznej = pochodna położenia orbity po czasie (θ ${th.toFixed(2)})`);
  ok(cm({ state: 'orbiting', dockedAt: 'p1', orbit: { ...o, anchored: true }, tSec: t }).moving === false
    && cm({ state: 'orbiting', dockedAt: 'p1', orbit: null, tSec: t }).moving === false, 'M4d: orbita zakotwiczona / brak orbity — bez ruchu');
  const tp = call('orbitTangent', { ...o, omega: 0.13 }, 0), tn = call('orbitTangent', { ...o, omega: -0.13 }, 0);
  ok(near(tn?.x, -tp?.x, 1e-12) && near(tn?.y, -tp?.y, 1e-12), 'M4e: ω < 0 — kierunek przeciwny w tym samym miejscu orbity (znak prędkości kątowej)');
  const fly = cm({ state: 'in_transit', velocity: { vx: 0.12, vy: -0.05 } });
  ok(fly.moving === true && fly.source === 'velocity' && near(fly.dir.x, 0.12 / Math.hypot(0.12, 0.05)), 'M4f: w locie — kierunek prędkości (AU / rok cyw.)');
  const eps = S.MOTION_EPS;
  ok(cm({ state: 'in_transit', velocity: { vx: eps * 0.5, vy: 0 } }).moving === false && cm({ state: 'in_transit', velocity: { vx: eps * 2, vy: 0 } }).moving === true,
    'M4g: próg MOTION_EPS — poniżej bez ruchu, powyżej ruch');
  const rt = cm({ state: 'in_transit', velocity: { vx: 0, vy: 0 }, routeDir: { x: 3, y: 4 } });
  ok(rt.moving === true && rt.source === 'route' && near(rt.dir.x, 0.6) && near(rt.dir.y, 0.8),
    'M4h: w locie bez prędkości (pauza po wczytaniu / po rozkazie) — kierunek z geometrii trasy');
  ok(cm({ state: 'orbiting', dockedAt: null, velocity: { vx: 0, vy: 0 }, routeDir: { x: 1, y: 0 } }).moving === false,
    'M4i: geometria trasy tylko w locie — statek stojący w wolnej przestrzeni zostaje rombem');
  const mp = (spec, m) => call('routeMotionPoint', spec, m);
  const live = { kind: 'mission', to: { x: 50, y: 400 }, via: [] }, mis = { targetX: 400, targetY: 0 };
  ok(mp(live, mis)?.x === 400 && mp(live, mis)?.y === 0 && mp({ ...live, via: [{ x: 7, y: 8 }] }, mis)?.x === 7
    && mp({ kind: 'return', to: { x: 3, y: 4 }, via: [] }, mis)?.x === 3 && mp(null, mis) === null,
  'M4l: zapas kierunku — punkt pośredni; misja bez punktów: punkt PRZEWIDZIANY na przylot (tam leci), nie bieżące położenie celu; powrót — cel trasy');
  const H = mkHud();
  H.frame(1000);
  const m = byId(H.dbg());
  ok(m.get('v_idle')?.kind === 'diamond' && m.get('v_orb')?.kind === 'chevron' && m.get('v_orb')?.source === 'orbit'
    && m.get('v_route')?.kind === 'chevron' && m.get('v_route')?.source === 'route' && m.get('v_route')?.angle === 0,
  `M4j SEDNO (warstwa): idle — romb; orbita — daszek (źródło orbit); w locie bez prędkości — daszek ku celowi trasy (${['v_idle', 'v_orb', 'v_route'].map((i) => `${i}=${m.get(i)?.kind}/${m.get(i)?.source}/${m.get(i)?.angle}`).join(' ')})`);
  const enemyRoute = VESSELS.find((v) => v.id === 'e_peace');
  enemyRoute.mission = { type: 'transport', phase: 'outbound', targetX: 900, targetY: 100, liveTargetX: 900, liveTargetY: 100, startX: -90, startY: 100,
    departYear: 100, arrivalYear: 110, waypoints: [] };
  W0.camEpoch++; H.frame(2000);
  ok(byId(H.dbg()).get('e_peace')?.kind === 'diamond', 'M4k: obcy w locie bez prędkości — romb (geometria trasy obcego zdradzałaby cel)');
  enemyRoute.mission = null;
}

// ═══ M5 ══════════════════════════════════════════════════════════════════════
header('M5  czysty widok (SHIFT)');
{
  ok(call('shipMarkerVisible', { hasSprite: true, spriteVisible: true, isEnemy: false, cleanView: true }) === false, 'M5a: czysty widok — bez znacznika (logika)');
  const H = mkHud();
  const r0 = H.frame(1000);
  const n0 = H.dbg()?.markers?.length ?? 0;
  W0.clean = true;
  const r1 = H.frame(1100);
  const n1 = H.dbg()?.markers?.length ?? -1;
  const lay = H.lay;
  const prep = (() => { try { return lay?.prepare?.({ K, features: FEATURES, att: {}, activeSystemId: 'sys_home' }); } catch (e) { return 'ERR ' + e.message; } })();
  W0.clean = false;
  ok(r0 === 'drawn' && n0 > 0 && r1 === 'hidden' && (lay?._prep?.items?.length ?? -1) === 0 && /^sm:1/.test(String(prep)),
    `M5b SEDNO (warstwa): SHIFT — warstwa schowana (${r1}), a podwarstwa sama też nie wybiera żadnego statku (${lay?._prep?.items?.length}; przed: ${n0})`);
}

// ═══ M6 ══════════════════════════════════════════════════════════════════════
header('M6  model uwagi, wywiad, bliski zoom (bez oddechu)');
{
  const al = (o) => call('markerAlpha', o);
  const tg = (o) => call('markerAttentionTarget', o);
  ok(tg({ focus: false }) === 1 && tg({ focus: true, selected: true }) === 1 && tg({ focus: true }) === A.LABEL_DIM
    && tg({ focus: true, alerted: true }) === 1 && tg({ focus: true, hovered: true }) === 1,
  `M6a: poziom uwagi — bez ostrości 1; z ostrością zaznaczony / alertowany / najechany 1, reszta LABEL_DIM (${A.LABEL_DIM})`);
  ok(near(al({ selected: false, attention: 1 }), S.MARKER_ALPHA) && near(al({ selected: true, attention: 1 }), S.SELECTED_ALPHA)
    && near(al({ selected: false, attention: A.LABEL_DIM }), S.MARKER_ALPHA * A.LABEL_DIM),
  `M6b: krycie — bez ostrości MARKER_ALPHA (${S.MARKER_ALPHA}), zaznaczony SELECTED_ALPHA (${S.SELECTED_ALPHA}), reszta przy ostrości × LABEL_DIM`);
  ok(near(al({ attention: 1, intelOpacity: 0.5 }), S.MARKER_ALPHA * 0.5) && near(al({ attention: 1, zoomFade: 0 }), 0),
    'M6c: krycie wywiadu sprite\'a (`contact` 0,5) i gaśnięcie przy bliskim zoomie mnożą krycie');
  const fr = { w: 980, h: 830 }, fm = Math.min(fr.w, fr.h);
  const discAt = (f) => (f * fm) / 2 - A.BRACKET_GAP_PX;
  ok(call('markerZoomFade', 1, fr) === 1 && call('markerZoomFade', discAt((A.FADE_LARGE_FROM + A.FADE_LARGE_TO) / 2), fr) > 0
    && call('markerZoomFade', discAt((A.FADE_LARGE_FROM + A.FADE_LARGE_TO) / 2), fr) < 1 && call('markerZoomFade', discAt(A.FADE_LARGE_TO + 0.05), fr) === 0,
  'M6d: gaśnięcie przy bliskim zoomie — te same progi FADE_LARGE_* co nawiasy statku (typowy zoom 1, przejście, model duży 0)');
  ok(call('markerZoomFade', discAt((A.FADE_LARGE_FROM + A.FADE_LARGE_TO) / 2), fr)
    === (AT?.bracketBox?.({ cx: 0, cy: 0, discR: discAt((A.FADE_LARGE_FROM + A.FADE_LARGE_TO) / 2), kind: 'vessel', frame: fr })?.fade ?? NaN),
  'M6e: jedna reguła z nawiasami (`bracketBox`, statek)');
  // Warstwa: maszyna stanów uwagi z przejściem czasu realnego.
  const H = mkHud();
  let now = 1000;
  H.frame(now);
  const a0 = byId(H.dbg()).get('v_e')?.alpha, b0 = byId(H.dbg()).get('v_n')?.alpha;
  W0.sel = ['v_e']; W0.lead = 'v_e';
  H.frame(now += 16);                       // przejście startuje od bieżącego poziomu
  H.frame(now += A.FADE_MS / 2);            // połowa FADE_MS czasu realnego
  const mid = byId(H.dbg()).get('v_n')?.alpha;
  for (let i = 0; i < 20; i++) H.frame(now += 20);
  const a1 = byId(H.dbg()).get('v_e')?.alpha, b1 = byId(H.dbg()).get('v_n')?.alpha;
  ok(near(a0, Math.round(S.MARKER_ALPHA * 10) / 10, 0.051) && near(b0, Math.round(S.MARKER_ALPHA * 10) / 10, 0.051)
    && near(a1, Math.round(S.SELECTED_ALPHA * 10) / 10, 0.051) && near(b1, Math.round(S.MARKER_ALPHA * A.LABEL_DIM * 10) / 10, 0.051)
    && mid > b1 && mid < b0,
  `M6f SEDNO (warstwa): zaznaczenie — zaznaczony ${a1}, pozostałe ${b0} → ${mid} → ${b1} (przejście FADE_MS czasu realnego)`);
  W0.hover = 'v_n';
  H.hud?.setPointer?.(640, 400, 800, 500, false);   // kursor nad mapą — najechanie statku z pickera renderera
  for (let i = 0; i < 20; i++) H.frame(now += 20);
  ok(near(byId(H.dbg()).get('v_n')?.alpha, Math.round(S.MARKER_ALPHA * 10) / 10, 0.051), 'M6g: najechany na mapie — poziom uwagi 1 mimo ostrości');
  W0.hover = null; W0.sel = []; W0.lead = null;
  for (let i = 0; i < 20; i++) H.frame(now += 20);
  const e = byId(H.dbg()).get('e_war')?.alpha;
  ok(near(e, Math.round(S.MARKER_ALPHA * 0.5 * 10) / 10, 0.051), `M6h: obcy \`contact\` — krycie × 0,5 jak sprite (${e})`);
  const s1 = byId(H.dbg()).get('v_e')?.alpha;
  W0.sim += 1000; W0.camEpoch++; H.frame(now += 20);
  ok(byId(H.dbg()).get('v_e')?.alpha === s1, 'M6i: bez oddechu — zegar symulacji nie zmienia krycia znacznika');
}

// ═══ M7 ══════════════════════════════════════════════════════════════════════
header('M7  OFF = pusto');
{
  FEATURES.hudShipMarker = false;
  const H = mkHud();
  const r = H.frame(1000);
  const d = H.dbg();
  const lay = H.lay;
  ok((d?.markers?.length ?? -1) === 0 && d?.on === false && (lay?.labelObstacles?.() ?? [1]).length === 0 && !H.ctx.calls.includes('stroke') && r !== 'drawn',
    `M7a SEDNO: flaga OFF — zero znaczników, zero przeszkód etykiet, zero wywołań ctx (${r}, ${H.ctx.calls.length} wywołań)`);
  delete FEATURES.hudShipMarker;
  const H2 = mkHud();
  H2.frame(1000);
  ok((H2.dbg()?.markers?.length ?? -1) === 0 && !H2.ctx.calls.includes('stroke'), 'M7b: brak klucza flagi = OFF');
  FEATURES.hudShipMarker = true;
  const H3 = mkHud();
  H3.frame(1000);
  ok((H3.dbg()?.markers?.length ?? 0) > 0 && H3.ctx.calls.includes('stroke'), 'M7c KONTROLA: flaga ON — znaczniki rysowane (ten sam świat)');
}

// ═══ M8 ══════════════════════════════════════════════════════════════════════
header('M8  ślad stref kliku warstwy HUD — znacznik bez strefy');
{
  const H = mkHud();
  H.frame(1000);
  const ms = H.dbg()?.markers ?? [];
  const pts = [];
  for (const m of ms) { pts.push([m.cx, m.cy]); pts.push([m.rect.x + m.rect.w / 2, m.rect.y + m.rect.h / 2]); }
  for (let x = 0; x <= 1280; x += 40) for (let y = 0; y <= 832; y += 40) pts.push([x, y]);
  const trace = (hud) => pts.map(([x, y]) => `${hud.handleClick(x, y, x * 1.25, y * 1.25) ? 1 : 0}${hud.coversUiPoint(x, y) ? 1 : 0}${hud.pinButtonAt(x, y) == null ? 0 : 1}`).join('');
  const on = trace(H.hud);
  FEATURES.hudShipMarker = false;
  const H0 = mkHud();
  H0.frame(1000);
  const off = trace(H0.hud);
  FEATURES.hudShipMarker = true;
  ok(ms.length > 0 && on === off && /^0+$/.test(on),
    `M8a SEDNO: ${pts.length} punktów (środki i glify ${ms.length} znaczników + siatka) — klik / pokrycie UI / przycisk przypięcia jak bez znacznika (0 różnic)`);
  // Przeszkody etykiet: domyślnie prostokąt każdego znacznika; strojenie `MARKER_OBSTACLE: 0` — etykiety znacznika nie widzą.
  const n1 = H.lay?.labelObstacles?.()?.length ?? -1;
  H.hud.tune({ MARKER_OBSTACLE: 0 });
  const n0 = H.lay?.labelObstacles?.()?.length ?? -1;
  H.hud.tune(null);
  ok(n1 === ms.length && n0 === 0 && (H.lay?.labelObstacles?.()?.length ?? -1) === ms.length,
    `M8b: przeszkody etykiet — domyślnie ${n1} (= znaczniki), \`tune({ MARKER_OBSTACLE: 0 })\` — ${n0}, \`tune(null)\` — z powrotem`);
}

// ═══ M9 ══════════════════════════════════════════════════════════════════════
header('M9  pauza — spoczynek; zegar biegnie — nowa styczna orbity');
{
  const H = mkHud();
  W0.camEpoch++;
  H.frame(1000);
  const a0 = byId(H.dbg()).get('v_orb')?.angle;
  H.ctx.calls.length = 0;
  const p1 = H.frame(1016), p2 = H.frame(1032), p3 = H.frame(5000);
  ok(p1 === 'idle' && p2 === 'idle' && p3 === 'idle' && H.ctx.calls.length === 0,
    `M9a SEDNO: pauza (zegar stoi), czas realny płynie — spoczynek, zero wywołań ctx (${p1} / ${p2} / ${p3})`);
  W0.sim += 4000;   // 4 s zegara orbit → θ += ω · 4 = 0,4 rad
  const r = H.frame(5016);
  const a1 = byId(H.dbg()).get('v_orb')?.angle;
  ok(r === 'drawn' && Number.isFinite(a0) && Number.isFinite(a1) && angDiff(a1, a0) > 10,
    `M9b: zegar ruszył — styczna orbity obrócona (${a0}° → ${a1}°), klatka narysowana`);
}

FEATURES.hudShipMarker = PREV_FLAG;
console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
