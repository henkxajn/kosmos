// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — ARKUSZ HUD paczka B (B-3): chipy warstw [R] [T] [E] [O] i klawisze 6–9 (`HudLayerChipsLogic`, `BottomControlBar`,
// `BottomBar`, `GameScene`, `ThreeRenderer`, podwarstwy HUD) — HUD_PLAN.md §4.5; D-HUD-7 (3b), D-HUD-13, D-HUD-14.
// Uruchom: node src/testing/smoke/hud_layer_chips_smoke.mjs
//
// Wyłącznie LOGIKA (protokół od H2, HUD_PLAN §4.0) — stan, klawisze, zgodność wstecz, skutki warstw; bez pinów na stałe
// rysunku. Moduł powstaje w paczce B — import dynamiczny (brak modułu = pin pada, suita się nie przerywa).
//   C0  API, kolejność warstw i klawiszy
//   C1  stan w `uiPrefs.hudLayers` (brak = wszystkie ON); zgodność wstecz: dawny `hudRadarVisible` czytany jako [R];
//       zapis [R] — wyłącznie `hudLayers.radar` (dawny klucz usunięty)
//   C2  klawisze Digit6–9 = kolejność chipów; tylko z fokusem na mapie (tryb cywilizacji, bez overlayu / okna DOM /
//       modyfikatorów); bez kolizji (cyfry 1–5 — prędkości, mapa skrótów overlayów bez cyfr); `GameScene` przez tę logikę
//   C3  ☰ „Radar” (WYKONANIE metod `BottomBar`) = to samo źródło co [R]: odczyt, przełącznik, stary zapis
//   C4  [O] (WYKONANIE metod `ThreeRenderer` wyciętych ze źródła): wyłączony = filtr „Żadne” (3b: orbita zaznaczonego
//       zostaje), wybór z menu ☰ nietknięty; przełączenie w pauzie — przestylowanie bez przebudowy geometrii; z powrotem
//       włączony — filtr z menu
//   C5  [E] (prawdziwy `HudLayer` + `HudLabelLayer`): etykiety stałe znikają, przypięcie i etykieta pod kursorem zostają,
//       strzałki krawędzi — bez
//   C6  [T] — bez tras; [R] — radar niewidoczny, tryb Y wymusza; uwaga tras: zaznaczona 1,0, reszta ROUTE_DIM
//   C7  chipy na pasie (prawdziwy `BottomControlBar` na atrapie ctx): od lewego końca pasa, przed suwakiem zoomu; zegar,
//       suwak, 🔔, ☰ i ⚔ w tych samych px co bez chipów (pin px); pod overlayem — brak; klik przełącza; oba warianty stanu
//       wyłączonego (przekreślony / bez nawiasów); litery PL / EN; podpowiedź z klawiszem
// ⚠ PRZECELOWANE 2026-10-28 (ARKUSZ HUD B-Z — flagi HUD na stałe ON, ścieżki OFF usunięte): C2d — klawisze 6–9 bez
//   gałęzi flagi; C3d — ☰ „Radar” nie dotyka dawnego przełącznika pierścieni 3D (`sensorOverlayVisible`,
//   `ui:sensorOverlayToggle`); C4e — [O] z powrotem włączony, metody bez gałęzi flagi; C7d / C7e — wariant porównawczy
//   „bez chipów” = pas z wyciętym rysunkiem chipów (dawniej: flaga OFF). Przełączniki flag w keeperze usunięte.
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import * as T3 from '../../lib/three.core.js';

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const src = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), 'utf8'); } catch { return ''; } };
const tryImport = async (p) => { try { return await import(p); } catch (e) { console.log('    (' + p + ': ' + e.message.split('\n')[0] + ')'); return null; } };

const CL = await tryImport('../../ui/HudLayerChipsLogic.js');
const AT = await tryImport('../../ui/HudAttentionLogic.js');
const HL = await tryImport('../../ui/HudLayer.js');
const LLay = await tryImport('../../ui/HudLabelLayer.js');
const RLay = await tryImport('../../ui/HudRadarLayer.js');
const RtLay = await tryImport('../../ui/HudRouteLayer.js');
const HOL = await tryImport('../../renderer/HudOrbitLogic.js');
const { BottomBar } = await import('../../ui/BottomBar.js');
const { BottomControlBar } = await import('../../ui/BottomControlBar.js');
const { t, setLocale } = await import('../../i18n/i18n.js');
const EventBus = (await import('../../core/EventBus.js')).default;
const call = (fn, ...a) => { try { return CL?.[fn]?.(...a); } catch (e) { return `ERR ${e.message}`; } };
const K = globalThis.window.KOSMOS ?? (globalThis.window.KOSMOS = {});

// ═══ C0 ══════════════════════════════════════════════════════════════════════
header('C0  API');
{
  const need = ['HUD_LAYER_KEYS', 'HUD_LAYER_CODES', 'HUD_LAYER_KEY_LABEL', 'HUD_CHIPS', 'HUD_CHIPS_DEFAULTS', 'readHudLayers', 'setHudLayer',
    'toggleHudLayer', 'layerForKeyCode', 'layerKeyAllowed', 'chipText', 'chipWidth', 'layoutLayerChips', 'chipAt', 'tuneHudChips', 'resetHudChips'];
  const missing = need.filter((n) => CL?.[n] === undefined);
  ok(missing.length === 0, `C0a: \`HudLayerChipsLogic\` — ${need.length} eksportów (brak: ${missing.join(', ') || '—'})`);
  ok((CL?.HUD_LAYER_KEYS ?? []).join(',') === 'radar,routes,labels,orbits', 'C0b: kolejność warstw = kolejność chipów [R] [T] [E] [O]');
  const codes = CL?.HUD_LAYER_CODES ?? {};
  ok(Object.keys(codes).join(',') === 'Digit6,Digit7,Digit8,Digit9' && Object.values(codes).join(',') === (CL?.HUD_LAYER_KEYS ?? []).join(','),
    'C0c: klawisze 6–9 w kolejności chipów (D-HUD-14)');
}

// ═══ C1 ══════════════════════════════════════════════════════════════════════
header('C1  stan warstw — `uiPrefs.hudLayers`, zgodność wstecz');
{
  const all = (s) => s && s.radar && s.routes && s.labels && s.orbits;
  ok(all(call('readHudLayers', {})) && all(call('readHudLayers', null)) && all(call('readHudLayers', { hudLayers: {} })),
    'C1a: brak stanu — wszystkie warstwy włączone (zapis v101 bez migracji)');
  const old = call('readHudLayers', { hudRadarVisible: false });
  ok(old?.radar === false && old.routes && old.labels && old.orbits, 'C1b SEDNO: stary zapis z `hudRadarVisible: false` — [R] wyłączony');
  ok(call('readHudLayers', { hudRadarVisible: false, hudLayers: { radar: true } })?.radar === true, 'C1c: `hudLayers.radar` ma pierwszeństwo przed dawnym kluczem');
  const p = { hudRadarVisible: false, sensorOverlayVisible: true };
  call('setHudLayer', p, 'radar', true);
  ok(p.hudLayers?.radar === true && !('hudRadarVisible' in p) && p.sensorOverlayVisible === true,
    'C1d SEDNO: zapis [R] — `hudLayers.radar`, dawny klucz usunięty (jedno źródło), `sensorOverlayVisible` (ścieżka OFF H1) nietknięte');
  const q = {};
  const r1 = call('toggleHudLayer', q, 'labels'), r2 = call('toggleHudLayer', q, 'labels');
  ok(r1 === false && r2 === true && q.hudLayers?.labels === true, 'C1e: przełączenie [E] — wył. → wł.');
  ok(call('toggleHudLayer', q, 'trade') === null && Object.keys(q.hudLayers).join(',') === 'labels', 'C1f: nieznana warstwa — bez zapisu');
}

// ═══ C2 ══════════════════════════════════════════════════════════════════════
header('C2  klawisze 6–9 — fokus na mapie, bez kolizji');
{
  ok(['Digit6', 'Digit7', 'Digit8', 'Digit9'].map((c) => call('layerForKeyCode', c)).join(',') === 'radar,routes,labels,orbits'
    && call('layerForKeyCode', 'Digit5') === null && call('layerForKeyCode', 'Numpad6') === null && call('layerForKeyCode', 'KeyR') === null,
    'C2a: Digit6–9 → warstwy; inne klawisze — nic');
  const base = { civMode: true };
  ok(call('layerKeyAllowed', base) === true, 'C2b: tryb cywilizacji, mapa z fokusem — klawisz działa');
  const blockers = ['overlayOpen', 'modalOpen', 'planetSceneOpen', 'ctrl', 'alt', 'meta', 'shift'];
  ok(blockers.every((k) => call('layerKeyAllowed', { ...base, [k]: true }) === false) && call('layerKeyAllowed', { civMode: false }) === false,
    `C2c SEDNO: bez fokusu na mapie — nic (${blockers.join(', ')}, poza trybem cywilizacji)`);
  const gs = strip(src('../../scenes/GameScene.js'));
  const i6 = gs.indexOf("case 'Digit6':");
  const blk = i6 < 0 ? '' : gs.slice(i6, gs.indexOf('break;', gs.indexOf("case 'Digit9':", i6)) + 6);
  ok(/case 'Digit6':\s*case 'Digit7':\s*case 'Digit8':\s*case 'Digit9':/.test(gs) && /const layer = layerForKeyCode\(e\.code\);/.test(blk)
    && /layerKeyAllowed\(\{/.test(blk) && /toggleHudLayer\(window\.KOSMOS\.uiPrefs, layer\)/.test(blk) && !/isHudAttentionOn/.test(gs),
    'C2d: `GameScene` — Digit6–9 przez `layerForKeyCode` / `layerKeyAllowed` / `toggleHudLayer` (B-Z: bez gałęzi flagi)');
  ok(['Digit6', 'Digit7', 'Digit8', 'Digit9'].every((c) => (gs.match(new RegExp(`case '${c}'`, 'g')) ?? []).length === 1)
    && ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].every((c) => new RegExp(`case '${c}': EventBus\\.emit\\('time:setMultiplier'`).test(gs)),
    'C2e KONTROLA: bez kolizji w `GameScene` — każda z cyfr 6–9 obsłużona raz; 1–5 nadal prędkości czasu');
  const om = strip(src('../../ui/OverlayManager.js'));
  const km = om.slice(om.indexOf('this._keyMap = {'), om.indexOf('};', om.indexOf('this._keyMap = {')));
  ok(km.length > 20 && !/'[0-9]'\s*:/.test(km), 'C2f KONTROLA: mapa skrótów overlayów bez cyfr');
}

// ═══ C3 ══════════════════════════════════════════════════════════════════════
header('C3  ☰ „Radar” = to samo źródło co chip [R] (wykonanie metod BottomBar)');
{
  const bb = Object.create(BottomBar.prototype);
  Object.assign(bb, { _autosaveOption: 'year', _orbitMode: 'planetoids' });
  const row = () => bb._getMenuRows(true, true).find((r) => r.id === 'radar');
  K.uiPrefs = { hudRadarVisible: false, sensorOverlayVisible: false };
  const a = row();
  ok(a?.valueOn === false && call('readHudLayers', K.uiPrefs)?.radar === false, 'C3a SEDNO: stary zapis `hudRadarVisible: false` — ☰ „Radar” WYŁ i chip [R] wyłączony');
  bb._toggleSensorOverlay();
  const b = row();
  ok(b?.valueOn === true && K.uiPrefs.hudLayers?.radar === true && !('hudRadarVisible' in K.uiPrefs) && K.uiPrefs.sensorOverlayVisible === false,
    'C3b SEDNO: przełącznik ☰ pisze `hudLayers.radar` (dawny klucz usunięty; `sensorOverlayVisible` nietknięte)');
  call('toggleHudLayer', K.uiPrefs, 'radar');
  ok(row()?.valueOn === false, 'C3c SEDNO: chip [R] wyłączony — ☰ „Radar” pokazuje WYŁ (jeden stan)');
  K.uiPrefs = { sensorOverlayVisible: false };
  const toggles = [];
  const onToggle = (e) => toggles.push(e);
  EventBus.on('ui:sensorOverlayToggle', onToggle);
  bb._toggleSensorOverlay();
  EventBus.off?.('ui:sensorOverlayToggle', onToggle);
  ok(K.uiPrefs.hudLayers?.radar === false && K.uiPrefs.sensorOverlayVisible === false && toggles.length === 0,
    'C3d KONTROLA (B-Z): ☰ „Radar” bez dawnego przełącznika pierścieni 3D — `sensorOverlayVisible` nietknięte, bez `ui:sensorOverlayToggle`');
  K.uiPrefs = {};
}

// ═══ C4 ══════════════════════════════════════════════════════════════════════
header('C4  [O] — filtr „Żadne” (3b), wybór z menu nietknięty');
{
  const TR = strip(src('../../renderer/ThreeRenderer.js'));
  const methodBody = (sig) => { const i = TR.indexOf(sig); return i < 0 ? '' : TR.slice(i, TR.indexOf('\n  }\n', i) + 4); };
  const compile = (name, scope) => {
    const b = methodBody(`\n  ${name}(`);
    if (!b) return null;
    try {
      const names = Object.keys(scope);
      return new Function(...names, '__s', 'return eval("(" + __s + ")");')(...names.map((n) => scope[n]), 'function ' + b.trim().slice(name.length));
    } catch (e) { console.log('    (kompilacja ' + name + ': ' + e.message + ')'); return null; }
  };
  const SCOPE = { GAME_CONFIG, readHudLayers: CL?.readHudLayers, orbitPalette: HOL?.orbitPalette,
    hudOrbitSyncKey: HOL?.hudOrbitSyncKey, themeEpoch: () => 7, window: globalThis.window };
  const ops = [];
  const r = {
    _orbitFilter: 'all', _cleanView: false, _hudOrbitKey: null, _hudOrbitLayerOff: false,
    _hudRefreshAllOrbits() { ops.push('rebuild'); }, _hudRestyleOrbits() { ops.push('restyle'); },
  };
  for (const n of ['_hudOrbitState', '_hudOrbitsLayerOff', '_syncHudOrbits']) { const f = compile(n, SCOPE); if (f) r[n] = f; }
  ok(typeof r._hudOrbitState === 'function' && typeof r._hudOrbitsLayerOff === 'function' && typeof r._syncHudOrbits === 'function',
    'C4-0: metody wycięte ze źródła `ThreeRenderer` (`_hudOrbitState`, `_hudOrbitsLayerOff`, `_syncHudOrbits`)');
  K.uiPrefs = {}; K.homePlanet = { id: 'p_home' };
  const st1 = r._hudOrbitState?.();
  ok(st1?.filter === 'all', 'C4a KONTROLA: [O] włączony — filtr z menu ☰ („Wszystkie”)');
  r._syncHudOrbits?.(); ops.length = 0;
  call('setHudLayer', K.uiPrefs, 'orbits', false);
  r._syncHudOrbits?.(); r._syncHudOrbits?.();
  const st2 = r._hudOrbitState?.();
  ok(st2?.filter === 'none' && r._orbitFilter === 'all', 'C4b SEDNO: [O] wyłączony — filtr „Żadne”, wybór z menu nietknięty („Wszystkie”)');
  ok(ops.join(',') === 'restyle', `C4c SEDNO: przełączenie (także w pauzie — pętla renderu) — przestylowanie bez przebudowy geometrii (${ops.join(',') || '—'})`);
  const pal = HOL?.orbitPalette?.();
  const sel = HOL?.planetOrbitStyle?.({ ...st2, palette: pal, selected: true });
  const home = HOL?.planetOrbitStyle?.({ ...st2, palette: pal, isHome: true });
  const plain = HOL?.planetOrbitStyle?.({ ...st2, palette: pal });
  const moonSel = HOL?.moonOrbitStyle?.({ ...st2, palette: pal, selected: true });
  ok(sel?.visible === true && moonSel?.visible === true && home?.visible === false && plain?.visible === false,
    'C4d SEDNO: 3b — orbita zaznaczonego ciała (planeta, księżyc) zostaje, reszta (także dom) ukryta');
  call('setHudLayer', K.uiPrefs, 'orbits', true);
  const orbitSrc = ['_hudOrbitState', '_hudOrbitsLayerOff', '_syncHudOrbits'].map((n) => methodBody(`\n  ${n}(`)).join('\n');
  ok(r._hudOrbitState?.()?.filter === 'all' && orbitSrc.length > 100 && !/isHud(Attention|Orbits)On/.test(orbitSrc),
    'C4e KONTROLA: [O] z powrotem włączony — filtr z menu („Wszystkie”); metody bez gałęzi flagi (B-Z)');
  K.uiPrefs = {};
}

// ═══ Świat (stub) dla C5–C6 ═══════════════════════════════════════════════════════════════════════════════════════
const mkCam = (pos, look) => { const c = new T3.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000); c.position.set(...pos); c.lookAt(...look); c.updateMatrixWorld(); return c; };
const CAM = mkCam([50, 60, 60], [50, 0, 0]);
const VIEW = () => ({ view: CAM.matrixWorldInverse.elements.slice(), proj: CAM.projectionMatrix.elements.slice(), fovDeg: 55, cssW: 1600, cssH: 1041, worldPerAU: 11 });
const S = (px) => px / 10;
const ENT = { p_nz: { id: 'p_nz', type: 'planet', name: 'Nowa Ziemia', x: 682, y: 0 }, p_fob: { id: 'p_fob', type: 'planet', name: 'Fobos', x: 300, y: 300 } };
const BODY = (id) => (ENT[id] ? { x: S(ENT[id].x), y: 0, z: S(ENT[id].y), r: 0.3 } : null);
const COLS = Object.values(ENT).map((e) => ({ planetId: e.id, name: e.name, planet: { ...e, systemId: 'sys_home' }, systemId: 'sys_home', civSystem: { population: 40, freePops: 2 } }));
const V = (id, o = {}) => ({ id, name: id, shipId: 'hull_small', serviceState: 'active', systemId: 'sys_home', isWreck: false, modules: [],
  fuel: { current: 10, max: 10 }, position: { x: 0, y: 0, state: 'in_transit', dockedAt: null }, ...o });
const VESSELS = [
  V('v_a', { name: 'Kurier', position: { x: 400, y: 50, state: 'in_transit', dockedAt: null }, mission: { type: 'move_to_point', targetX: 800, targetY: 100, departYear: 119, arrivalYear: 122 } }),
  V('v_b', { name: 'Fracht', position: { x: 500, y: 200, state: 'in_transit', dockedAt: null }, mission: { type: 'move_to_point', targetX: 300, targetY: 300, departYear: 119, arrivalYear: 122 } }),
  V('v_off', { name: 'Daleki', position: { x: -3000, y: 0, state: 'in_transit', dockedAt: null } }),   // przed kamerą, poza kadrem
];
const W0 = { lead: null, ids: [], entity: null, camEpoch: 1, sim: 10_000, hover: null, tactical: false };
const setWorld = () => {
  globalThis.innerWidth = 1600; globalThis.innerHeight = 1041;
  Object.assign(K, {
    civMode: true, activeSystemId: 'sys_home', uiScale: 1.25, planetGlobeOpen: false, uiPrefs: {}, homePlanet: { id: 'p_nz' },
    uiManager: { _cleanView: false, overlayManager: { isAnyOpen: () => false }, getSelectedVesselIds: () => [...W0.ids], getSelectedVesselId: () => W0.lead,
      get _selectedEntity() { return W0.entity ? { id: W0.entity } : null; }, getSelectedFleetId: () => null, _bottomContext: { _cardRect: null }, _mapSurface: () => null },
    threeRenderer: {
      _cleanView: false, _renderingEnabled: true, _contextLost: false, _pingedEnemyId: null, renderer: { getPixelRatio: () => 1.5 },
      get _hoverPlanetId() { return W0.hover; }, _planets: new Map(Object.keys(ENT).map((k) => [k, {}])), _moons: new Map(),
      get _vessels() { return new Map(VESSELS.map((v) => [v.id, { sprite: { visible: true } }])); }, _enemyAlertMarkers: new Map(),
      getCameraMoveEpoch: () => W0.camEpoch, getHudView: VIEW, getBodyWorldInfo: BODY,
      getVesselWorldPosition: (id) => { const v = VESSELS.find((x) => x.id === id); return v ? { x: S(v.position.x), y: 0.3, z: S(v.position.y) } : null; },
      getVesselWorldInfo: (id) => { const v = VESSELS.find((x) => x.id === id); return v ? { x: S(v.position.x), y: 0.3, z: S(v.position.y), r: 0.02 } : null; },
      _isOnBodyDisc: () => false, _getVesselAtScreen: () => null,
    },
    entityManager: { get: (id) => ENT[id] ?? null, getByType: (tp) => Object.values(ENT).filter((e) => e.type === tp) },
    colonyManager: { getPlayerColonies: () => [...COLS], getAllColonies: () => [...COLS], getColony: (id) => COLS.find((c) => c.planetId === id) ?? null },
    stationSystem: { getAllStations: () => [] },
    observatorySystem: { getVesselDetectionRangeAU: () => 1 },
    vesselManager: { getAllVessels: () => [...VESSELS], getVessel: (id) => VESSELS.find((v) => v.id === id) ?? null, isImmobilized: () => false, getVesselSensorRangeAU: () => 2.5 },
    intelSystem: { getVesselContact: () => null },
    techSystem: { getMultiplier: () => 1 },
    timeSystem: { get simClockMs() { return W0.sim; }, gameTime: 120 },
    tacticalMode: { get isActive() { return W0.tactical; } },
    leftOutliner: { getReservedWidth: () => 150 }, rightOutliner: { getReservedWidth: () => 150 }, tacticalDock: { getReservedHeight: () => 0 },
    starSystemManager: { switchActiveSystem: () => true },
  });
};
const mkCtx = () => new Proxy({ calls: [] }, {
  get(o, p) { if (p === 'calls') return o.calls; if (p in o) return o[p]; if (p === 'measureText') return (s) => ({ width: String(s).length * 6 }); return () => { o.calls.push(String(p)); }; },
  set(o, p, v) { o[p] = v; return true; },
});
const mkHud = () => {
  const ctx = mkCtx(); const cv = { width: 0, height: 0, getContext: () => ctx };
  const hud = HL?.HudLayer ? new HL.HudLayer(cv, { autoStart: false }) : null;
  const find = (C) => hud?._sublayers?.find?.((s) => C && s instanceof C) ?? null;
  return { hud, labels: find(LLay?.HudLabelLayer), radar: find(RLay?.HudRadarLayer), routes: find(RtLay?.HudRouteLayer),
    frame: (now) => (hud ? hud.frame(now) : null), destroy: () => hud?.destroy?.() };
};
const keysOf = (H) => (H.labels?.debug?.()?.labels ?? []).map((l) => l.key).sort();

// ═══ C5 ══════════════════════════════════════════════════════════════════════
header('C5  [E] — etykiety stałe znikają, przypięcie i najechanie zostają');
{
  setWorld();
  const H = mkHud();
  let now = 1000;
  const fr = () => { W0.camEpoch++; for (let i = 0; i < 30; i++) H.frame((now += 40)); };
  fr();
  const on = keysOf(H);
  const arrowsOn = H.labels?.debug?.()?.arrows?.length ?? 0;
  ok(on.includes('c:p_nz') && on.includes('c:p_fob') && arrowsOn > 0, `C5a KONTROLA: [E] włączony — etykiety kolonii i strzałka statku poza kadrem (${on.join(', ')}; strzałki ${arrowsOn})`);
  call('setHudLayer', K.uiPrefs, 'labels', false);
  fr();
  const off = keysOf(H);
  ok(!off.includes('c:p_nz') && !off.includes('c:p_fob') && (H.labels?.debug?.()?.arrows?.length ?? -1) === 0,
    `C5b SEDNO: [E] wyłączony — etykiety stałe i strzałki krawędzi znikają (${off.join(', ') || '—'})`);
  W0.entity = 'p_nz';
  fr();
  const pin = (H.labels?.debug?.()?.labels ?? []).find((l) => l.pinLabel);
  ok(pin?.key === 'c:p_nz' && !keysOf(H).includes('c:p_fob'), `C5c SEDNO: [E] wyłączony — przypięcie (zaznaczone ciało) działa (${pin?.key ?? '—'}), reszta schowana`);
  W0.entity = null;
  H.hud?.setPointer?.(0, 0, 0, 0, false);
  W0.hover = 'p_fob';
  fr();
  ok(keysOf(H).includes('c:p_fob'), `C5d SEDNO: [E] wyłączony — etykieta pod kursorem (najechane ciało) działa (${keysOf(H).join(', ') || '—'})`);
  W0.hover = null;
  call('setHudLayer', K.uiPrefs, 'labels', true);
  fr();
  ok(keysOf(H).includes('c:p_fob') && keysOf(H).includes('c:p_nz'), 'C5e KONTROLA: [E] znów włączony — etykiety wracają');
  H.destroy();
}

// ═══ C6 ══════════════════════════════════════════════════════════════════════
header('C6  [T] trasy · [R] radar · uwaga tras');
{
  setWorld();
  const H = mkHud();
  let now = 5000;
  const fr = () => { W0.camEpoch++; for (let i = 0; i < 20; i++) H.frame((now += 40)); };
  W0.lead = 'v_a'; W0.ids = ['v_a'];
  fr();
  const rd = H.routes?.debug?.();
  const ra = rd?.routes?.find((r) => r.id === 'v_a'), rb = rd?.routes?.find((r) => r.id === 'v_b');
  const DIM = AT?.HUD_ATTENTION?.ROUTE_DIM;
  ok(!!ra && !!rb && ra.mult === 1 && Math.abs(rb.mult - DIM) < 1e-9, `C6a: uwaga tras — zaznaczona 1,0, reszta ROUTE_DIM (${ra?.mult} / ${rb?.mult})`);
  const rad = H.radar?.debug?.();
  ok((rad?.items?.length ?? rad?.holders?.length ?? 0) > 0 || H.radar?._prep?.visible === true, 'C6b KONTROLA: [R] włączony — radar zaznaczonego statku');
  call('setHudLayer', K.uiPrefs, 'routes', false);
  call('setHudLayer', K.uiPrefs, 'radar', false);
  fr();
  ok((H.routes?.debug?.()?.routes?.length ?? -1) === 0 && (H.routes?.debug?.()?.warps?.length ?? -1) === 0, 'C6c SEDNO: [T] wyłączony — bez tras (także zaznaczonego statku)');
  ok(H.radar?._prep?.visible === false, 'C6d SEDNO: [R] wyłączony — radar niewidoczny');
  W0.tactical = true;
  fr();
  ok(H.radar?._prep?.visible === true, 'C6e: tryb Y wymusza radar (jak ☰ „Radar”)');
  W0.tactical = false; W0.lead = null; W0.ids = [];
  K.uiPrefs = {};
  H.destroy();
}

// ═══ C7 ══════════════════════════════════════════════════════════════════════
header('C7  chipy na pasie dolnym (prawdziwy BottomControlBar)');
{
  const W = 1280, H = 833;
  const TS = { isPaused: true, multiplierIndex: 1, displayText: '03/06/120' };
  const recCtx = () => {
    const calls = [];
    let fillStyle = '#000';
    return new Proxy({}, {
      get(o, k) {
        if (k === '_calls') return calls;
        if (k === 'fillStyle') return fillStyle;
        if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
        if (['fillRect', 'fillText', 'moveTo', 'lineTo', 'stroke'].includes(k)) return (...args) => { calls.push({ op: k, args, fillStyle }); };
        if (k in o) return o[k];
        return () => {};
      },
      set(o, k, v) { if (k === 'fillStyle') fillStyle = v; else o[k] = v; return true; },
    });
  };
  K.threeRenderer = { _cameraController: { minDist: 0.3, maxDist: 450, _targetDist: 85, _dist: 85, setTargetDist() {}, wheelZoom() {} } };
  K.uiPrefs = {};
  K.combatHud = { isMinimized: () => true, hasActiveEncounters: () => true };
  K.deepSpaceCombatSystem = { listActive: () => [{}] };
  setLocale('pl');
  // `noChips` — wariant porównawczy bez chipów: rysunek chipów wycięty na instancji (klaster liczony przed nimi).
  const draw = (strip, noChips = false) => {
    const b = new BottomControlBar(); if (noChips) b._drawLayerChips = () => {};
    const c = recCtx(); b.draw(c, W, H, TS, strip); return { b, c };
  };
  const on = draw({ left: 150 });
  const chips = on.b.getLayerChips?.() ?? [];
  const C = CL?.HUD_CHIPS ?? {};
  ok(chips.length === 4 && chips.map((c) => c.layer).join(',') === 'radar,routes,labels,orbits', `C7a: cztery chipy [R] [T] [E] [O] nad mapą (${chips.length})`);
  ok(chips.length === 4 && Math.abs(chips[0].x - (150 + C.CHIP_GAP)) < 1e-9 && chips.every((c, i) => i === 0 || c.x >= chips[i - 1].x + chips[i - 1].w)
    && chips[3].x + chips[3].w <= on.b._chipRect.x - C.CHIP_GAP + 1e-9,
    'C7b: od lewego końca pasa (miejsce dawnego doku), bez nakładania, przed czipem ⚔ / suwakiem');
  // Tekst chipu z reguły modułu (`chipText` — nawiasy wg `CHIP_SPACED`), nie z literału keepera.
  const br = (L) => call('chipText', L, true)?.text ?? `[${L}]`;
  const texts = on.c._calls.filter((x) => x.op === 'fillText').map((x) => x.args[0]);
  ok(['R', 'T', 'E', 'O'].every((L) => texts.includes(br(L))) && br('R').includes('R') && br('R') !== 'R',
    `C7c: PL — ${['R', 'T', 'E', 'O'].map(br).join(' ')}`);
  const off = draw({ left: 150 }, true);
  const same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  ok(same(on.b._bellRect, off.b._bellRect) && same(on.b._menuRect, off.b._menuRect) && same(on.b._playRect, off.b._playRect)
    && on.b._speedRects.every((r, i) => same(r, off.b._speedRects[i])) && same(on.b._zoomRect, off.b._zoomRect) && same(on.b._chipRect, off.b._chipRect),
    'C7d SEDNO (pin px): zegar, suwak, 🔔, ☰ i ⚔ w tych samych px z chipami i bez nich');
  ok((off.b.getLayerChips?.() ?? []).length === 0 && (on.b.getLayerChips?.() ?? []).length === 4,
    'C7e KONTROLA: wariant porównawczy bez chipów (rysunek chipów wycięty) — pas jak po T4; z chipami — cztery (pin C7d nie jest jałowy)');
  const ov = draw(null);
  ok((ov.b.getLayerChips?.() ?? []).length === 0, 'C7f: pod overlayem pełnoekranowym — bez chipów');
  const c0 = chips[1];
  const hit = on.b.handleClick(c0.x + c0.w / 2, c0.y + c0.h / 2);
  ok(hit === true && call('readHudLayers', K.uiPrefs)?.routes === false, 'C7g SEDNO: klik w [T] — warstwa tras wyłączona (`uiPrefs.hudLayers.routes`)');
  const offDraw = draw({ left: 150 });
  const tOff = offDraw.c._calls.filter((x) => x.op === 'fillText').map((x) => x.args[0]);
  const strikes = offDraw.c._calls.filter((x) => x.op === 'stroke').length - on.c._calls.filter((x) => x.op === 'stroke').length;
  ok(tOff.filter((s) => s === br('T')).length === 1 && strikes === 1, `C7h: wyłączony — wariant „przekreślony”: „${br('T')}” z kreską (${strikes} przekreślenie)`);
  call('tuneHudChips', { CHIP_OFF_STYLE: 'bare' });
  const bare = draw({ left: 150 });
  const tBare = bare.c._calls.filter((x) => x.op === 'fillText').map((x) => x.args[0]);
  const wBare = (bare.b.getLayerChips?.() ?? []).map((c) => c.w).join(','), wOn = chips.map((c) => c.w).join(',');
  ok(tBare.includes('T') && !tBare.includes(br('T')) && wBare === wOn, 'C7i: wyłączony — wariant „bez nawiasów”: samo „T”, szerokość chipu bez zmian (rząd nie skacze)');
  call('resetHudChips');
  on.b.handleMouseMove(chips[2].x + 2, chips[2].y + 2);
  const tip = recCtx(); on.b.draw(tip, W, H, TS, { left: 150 });
  const tipTxt = tip._calls.filter((x) => x.op === 'fillText').map((x) => x.args[0]).find((s) => /8/.test(String(s)) && String(s).length > 3);
  ok(tipTxt === t('hudChips.tip', t('hudChips.nameLabels'), '8'), `C7j: podpowiedź chipu — nazwa warstwy i klawisz („${tipTxt}”)`);
  setLocale('en');
  const en = draw({ left: 150 });
  const tEn = en.c._calls.filter((x) => x.op === 'fillText').map((x) => x.args[0]);
  ok(['S', 'L', 'O'].every((L) => tEn.includes(br(L))) && (tEn.includes(br('R')) || tEn.includes('R')), `C7k: EN — ${['S', 'R', 'L', 'O'].map(br).join(' ')} (D-HUD-13)`);
  setLocale('pl');
  K.uiPrefs = {}; K.combatHud = null; delete K.deepSpaceCombatSystem;
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
