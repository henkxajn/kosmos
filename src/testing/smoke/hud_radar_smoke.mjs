// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — ARKUSZ HUD H1-2: radar na warstwie HUD 2D (`HudRadarLogic`, `HudRadarLayer`, `DetectionRange`) — HUD_PLAN.md
// §4.2; D-HUD-3, D-HUD-4, D-HUD-12, D-HUD-18, D-HUD-b; Findingi 505, 506, 507, 508, 516.
// Uruchom: node src/testing/smoke/hud_radar_smoke.mjs
//
// PINY (SEDNO — pada na drzewie sprzed H1-2; KONTROLA — zielona po obu stronach). Moduły powstają w H1 — import dynamiczny
// (brak modułu = pin pada, suita się nie przerywa); flaga `hudRadar` ustawiana JAWNIE w keeperze.
//   R0  API: `HudRadarLogic`, `HudRadarLayer`, `DetectionRange`; flaga `hudRadar` w GameConfig (ON)
//   R1  promień statku = zasięg WYKRYCIA — TA SAMA funkcja co `ProximitySystem._getDetectionRangeAU` (pin źródłowy: oba
//       moduły importują `vesselDetectionRangeAU` z `DetectionRange.js`, `ProximitySystem` bez własnej formuły; tożsamość
//       eksportu) + wykonanie: liczby z prawdziwej `ProximitySystem` = liczby radaru (kadłuby 2,5 / 1,6 / 1,0 / nieznany,
//       wróg); ZF: 2,5 × 4,608 = 11,52 AU, nie 0,3 (505)
//   R2  promień kolonii = `ObservatorySystem.getVesselDetectionRangeAU` (prawdziwa metoda; poziomy 0–4: 1 / 3 / 6 / 15 / ∞);
//       ∞ → bez okręgu
//   R3  kto ma radar: zaznaczony statek wiodący / ciało z kolonią gracza; rezerwa — nie (507); zadokowany — tylko zaznaczony,
//       okrąg w ciele postoju (507); kolonia AI — nigdy (506); `systemId` null i inny układ — nie (516); wrak, obcy — nie;
//       placówka — tak; tryb Y — wszystkie własne, ping tylko zaznaczonych (D-HUD-18)
//   R4  harmonogram pingu (D-HUD-12, D-HUD-b): pierwszy w chwili zaznaczenia — czas realny (biegnie w pauzie); kolejne co 6 s
//       na `simClockMs` (stoją w pauzie); zegar `null` → tylko pierwszy, potem kotwica przy pierwszym odczycie zegara;
//       wykonanie przez prawdziwą warstwę (`HudLayer` + `HudRadarLayer`), także „po 2,4 s w pauzie — spoczynek, 0 rysunków”
//   R5  ping stoi: pierścień > 0,6 × min(szer., wys.) obszaru mapy (`MapInsets`) albo za kamerą; tarcza ≥ 40 px — granica
//       i podziałka zostają
//   R6  podziałka: 12 kresek co 30°, kąt 0 = oś x UKŁADU (nie kamera — dwie kamery, ten sam punkt świata), długość 10 px,
//       główne (0°, 90°, 180°, 270°) 16 px (korekta 1b)
//   R7  kolory WYŁĄCZNIE z ról motywu (zmiana motywu → nowa barwa) + zero hexów w modułach radaru (źródło bez komentarzy);
//       granica, podziałka i odczyt — rola `HUD_RADAR.BOUNDARY_ROLE` (korekta 1b: `primary` — wybór właściciela), ping — `primary`
//   R8  rysunek: granica — kropki 1,5 px z okrągłym końcem co 6 px, krycie 0,35; podziałka 0,55; odczyt 0,6; ping —
//       poświata (szczyt 0,22), linia 1,2 / 0,7, echo 0,6 / 0,25; szerokości STAŁE w px przy każdym zbliżeniu (508)
//   R9  widoczność: flaga OFF → pusto; ☰ „Radar” = `uiPrefs.hudRadarVisible` (brak klucza = widoczna); tryb Y wymusza
//   R10 pierścienie 3D (WYKONANIE `_syncSensorOverlay` ze źródła `ThreeRenderer`): ON — usunięte i nie powstają; OFF — jak
//       dziś (KONTROLA: 15 w scenie jak ZF — także zadokowane, rezerwa, skok, kolonia AI); w pętli renderu — usunięcie
//       przy ON także w pauzie
//   R11 menu ☰ „Radar” (WYKONANIE metod `BottomBar`): ON — wartość i przełącznik `hudRadarVisible`; OFF — jak dziś
//   — H1-3 (błysk na granicy, D-HUD-4) —
//   R12 logika: namiar w ramce UKŁADU, łuk ±15°, krycie 1 → 0 w 0,8 s, para z graczem (`isEnemyVessel`), najbliższa kolonia
//       gracza w zasięgu (układ obcego; AI i inny układ — nie; statek w skoku — nie)
//   R13 warstwa (prawdziwe zdarzenia `EventBus`): `vessel:proximityEnter` → łuk na granicy NIEzaznaczonego statku w namiarze
//       obcego (punkty = rzut łuku świata), rola `alert`, gaśnie w czasie realnym, potem spoczynek; bez błysku: swoi,
//       zaznaczony, zadokowany, flaga OFF, inny układ; `vessel:detectionChanged` → najbliższa kolonia w zasięgu (∞ — bez
//       błysku); mgła wojny — rekord błysku bez danych obcego, warstwa nie czyta wywiadu
//   — korekta 1b (czytelność granicy — bramka H1 2026-10-23) —
//   R14 granica: kropki 1,5 px z okrągłym końcem co 6 px (α 0,35), podziałka 10 px / główne 16 px (α 0,55), odczyt
//       zasięgu „11,5 AU” / „1,0 AU” (α 0,6, separator wg języka — `fmtDec`) przy NAJWYŻSZEJ na ekranie kresce głównej, na
//       zewnątrz granicy (decyzja właściciela 2026-10-23); ∞ — bez odczytu; granica, podziałka i odczyt w roli
//       `BOUNDARY_ROLE`, ping w `primary`; kropki tylko w oknie (`clipRunsToRect`, faza `lineDashOffset` — koszt
//       rasteryzacji przy okręgu większym od kadru)
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import * as TC from '../../config/ThemeConfig.js';
import * as HP from '../../ui/HudPalette.js';      // korekta 1b — rola granicy wg stałej (`resolveHudRoles`)
import { GAME_CONFIG } from '../../config/GameConfig.js';
import * as T3 from '../../lib/three.core.js';
import { isEnemyVessel } from '../../entities/Vessel.js';

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
// Brak pliku (drzewo sprzed H1) → pusty tekst: pin pada, suita się nie przerywa.
const src = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), 'utf8'); } catch { return ''; } };
const tryImport = async (p) => { try { return await import(p); } catch (e) { console.log('    (' + p + ': ' + e.message + ')'); return null; } };

const RL = await tryImport('../../ui/HudRadarLogic.js');
const RLay = await tryImport('../../ui/HudRadarLayer.js');
const DR = await tryImport('../../utils/DetectionRange.js');
const HL = await tryImport('../../ui/HudLayer.js');
const { ProximitySystem, PROXIMITY_DETECTION_AU } = await import('../../systems/ProximitySystem.js');
const { ObservatorySystem } = await import('../../systems/ObservatorySystem.js');
const { VesselManager } = await import('../../systems/VesselManager.js');
const { BottomBar } = await import('../../ui/BottomBar.js');
const FEATURES = GAME_CONFIG.FEATURES;
const SENSOR_MULT = 4.608;            // ZF gy120 (pomiar fazy A, `sensor_ranges.json`)
const realSensorAU = (v) => VesselManager.prototype.getVesselSensorRangeAU.call(null, v);   // prawdziwe dane kadłubów

// ── Świat ─────────────────────────────────────────────────────────────────────────────────────────────────────
const K = globalThis.window.KOSMOS ?? (globalThis.window.KOSMOS = {});
const V = (id, o = {}) => ({ id, shipId: 'hull_small', serviceState: 'active', systemId: 'sys_home', isWreck: false,
  position: { x: 0, y: 0, state: 'in_transit', dockedAt: null }, ...o });
const VESSELS = [
  V('v_kur', { name: 'Kurier', position: { x: 500, y: 0, state: 'in_transit', dockedAt: null } }),
  V('v_orb', { name: 'Smok II', position: { x: -300, y: 120, state: 'orbiting', dockedAt: 'p_fob' } }),
  V('v_dock', { name: 'Fracht', position: { x: 682, y: 0, state: 'docked', dockedAt: 'p_nz' } }),
  V('v_res', { name: 'Magazyn', serviceState: 'stored', position: { x: 100, y: 100, state: 'orbiting', dockedAt: null } }),
  V('v_mob', { name: 'Mobilizacja', serviceState: 'mobilizing', position: { x: 90, y: 90, state: 'orbiting', dockedAt: null } }),
  V('v_warp', { name: 'Skoczek', systemId: null, position: { x: 50, y: 50, state: 'in_transit', dockedAt: null } }),
  V('v_far', { name: 'Kurier III', systemId: 'sys_067', position: { x: 10, y: 10, state: 'orbiting', dockedAt: null } }),
  V('v_foe', { name: 'Rajder', ownerEmpireId: 'emp_1', owner: 'emp_1', isEnemy: true, position: { x: 400, y: 40, state: 'orbiting', dockedAt: null } }),
  V('v_wreck', { name: 'Wrak', isWreck: true, position: { x: 30, y: 30, state: 'orbiting', dockedAt: null } }),
];
const obsLevel = { p_nz: 4, p_fob: 0, p_ai: 1, p_out: 0, p_x: 0 };
const mkCol = (planetId, o = {}) => ({ planetId, systemId: 'sys_home',
  buildingSystem: { _active: new Map(obsLevel[planetId] > 0 ? [['k', { building: { id: 'observatory' }, level: obsLevel[planetId] }]] : []) }, ...o });
const COLONIES = [mkCol('p_nz', { name: 'Nowa Ziemia' }), mkCol('p_fob', { name: 'Fobos' }), mkCol('p_ai', { name: 'Kolonia AI', ownerEmpireId: 'emp_1' }),
  mkCol('p_out', { name: 'Placówka', isOutpost: true }), mkCol('p_x', { name: 'Daleka', systemId: 'sys_067' })];
const BODIES = { p_nz: { x: 68.2, y: 0, z: 0, r: 0.36 }, p_fob: { x: -30, y: 0, z: 12, r: 0.05 }, p_out: { x: -40, y: 0, z: -5, r: 0.04 },
  p_ai: { x: 20, y: 0, z: 20, r: 0.2 }, big: { x: 0, y: 0, z: 40, r: 1.0 } };
const SPRITES = { v_kur: { x: 50, y: 0.3, z: 0 }, v_orb: { x: -30.2, y: 0.3, z: 12.1 }, v_foe: { x: 40, y: 0.3, z: 4 } };
const W0 = { lead: null, ids: [], entity: null, sim: null, tactical: false, camEpoch: 1, cam: null };
const mkCam = (pos, look = [0, 0, 0]) => { const c = new T3.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000); c.position.set(...pos); c.lookAt(...look); c.updateMatrixWorld(); return c; };
const CAM_FAR = mkCam([383.13, 204.12, 118.52]);
const viewOf = (cam) => ({ view: cam.matrixWorldInverse.elements.slice(), proj: cam.projectionMatrix.elements.slice(), fovDeg: 55, cssW: 1600, cssH: 1041, worldPerAU: 11 });
const setWorld = () => {
  globalThis.innerWidth = 1600; globalThis.innerHeight = 1041;
  W0.cam = CAM_FAR;
  Object.assign(K, {
    civMode: true, activeSystemId: 'sys_home', uiScale: 1.25, planetGlobeOpen: false, uiPrefs: { sensorOverlayVisible: true },
    uiManager: {
      _cleanView: false, overlayManager: { isAnyOpen: () => false },
      getSelectedVesselIds: () => [...W0.ids], getSelectedVesselId: () => W0.lead,
      get _selectedEntity() { return W0.entity ? { id: W0.entity } : null; }, getSelectedFleetId: () => null,
    },
    threeRenderer: {
      _cleanView: false, _renderingEnabled: true, _contextLost: false, _pingedEnemyId: null, renderer: { getPixelRatio: () => 1.5 },
      getCameraMoveEpoch: () => W0.camEpoch, getHudView: () => viewOf(W0.cam),
      getBodyWorldInfo: (id) => (BODIES[id] ? { ...BODIES[id] } : null), getVesselWorldPosition: (id) => (SPRITES[id] ? { ...SPRITES[id] } : null),
    },
    vesselManager: { getAllVessels: () => [...VESSELS], getVessel: (id) => VESSELS.find((v) => v.id === id) ?? null, getVesselSensorRangeAU: realSensorAU },
    colonyManager: { getAllColonies: () => [...COLONIES], getColony: (id) => COLONIES.find((c) => c.planetId === id) ?? null },
    observatorySystem: { getVesselDetectionRangeAU: (c) => ObservatorySystem.prototype.getVesselDetectionRangeAU.call(null, c) },
    techSystem: { getMultiplier: (cat) => (cat === 'sensor_range' ? SENSOR_MULT : 1) },
    timeSystem: { get simClockMs() { return W0.sim; } },
    tacticalMode: { get isActive() { return W0.tactical; } },
    leftOutliner: { getReservedWidth: () => 150 }, rightOutliner: { getReservedWidth: () => 150 },
    tacticalDock: { getReservedHeight: () => 0 },
  });
};
setWorld();
FEATURES.hudRadar = true;

const mkCtx = () => {
  const t = { calls: [] };
  return new Proxy(t, {
    get(o, p) { if (p === 'calls') return o.calls; if (Object.prototype.hasOwnProperty.call(o, p)) return o[p]; return (...a) => { o.calls.push([String(p), ...a]); }; },
    set(o, p, v) { o.calls.push(['=' + String(p), v]); o[p] = v; return true; },
  });
};
const mkHud = () => {
  const ctx = mkCtx(); const cv = { width: 0, height: 0, getContext: () => ctx };
  const radar = RLay?.HudRadarLayer ? new RLay.HudRadarLayer(null) : null;
  const hud = HL?.HudLayer && radar ? new HL.HudLayer(cv, { autoStart: false, sublayers: [radar] }) : null;
  return { ctx, cv, radar, hud, frame: (now) => (hud ? hud.frame(now) : null), dbg: () => radar?.debug?.() ?? null };
};
const holderOf = (d, key) => d?.holders?.find((h) => h.key === key) ?? null;
const select = ({ lead = null, ids = null, entity = null } = {}) => { W0.lead = lead; W0.ids = ids ?? (lead ? [lead] : []); W0.entity = entity; };

// ═══ R0 ══════════════════════════════════════════════════════════════════════
header('R0  API i flaga');
{
  const need = ['isHudRadarOn', 'HUD_RADAR', 'radarLayerVisible', 'radarSelection', 'colonySystemId', 'vesselRadarRangeAU', 'colonyRadarRangeAU',
    'radarHolders', 'pingPhase', 'pingRadiusFrac', 'pingFade', 'pingStopReason', 'tickAngles', 'ringSegments', 'glowLayerAlpha', 'radarStyle'];
  const missing = need.filter((n) => RL?.[n] === undefined);
  ok(missing.length === 0, `R0a SEDNO: \`HudRadarLogic\` — ${need.length} eksportów (brak: ${missing.join(', ') || '—'})`);
  ok(typeof RLay?.HudRadarLayer === 'function' && typeof DR?.vesselDetectionRangeAU === 'function' && DR?.DETECTION_BASE_AU === 0.5,
    'R0b SEDNO: `HudRadarLayer` i `DetectionRange` (`vesselDetectionRangeAU`, `DETECTION_BASE_AU` 0,5)');
  const gc = strip(src('../../config/GameConfig.js'));
  ok(/\bhudRadar:\s*true,/.test(gc), 'R0c SEDNO: `FEATURES.hudRadar: true` w GameConfig (ON po bramce H1)');
  ok(RL?.isHudRadarOn?.({ hudRadar: true }) === true && RL?.isHudRadarOn?.({}) === false && RL?.isHudRadarOn?.({ hudRadar: 1 }) === false,
    'R0d SEDNO: flaga — `true` wyłącznie przy `hudRadar === true` (brak klucza = OFF)');
}

// ═══ R1 ══════════════════════════════════════════════════════════════════════
header('R1  promień statku = zasięg wykrycia — ta sama funkcja co ProximitySystem (505)');
{
  const prox = strip(src('../../systems/ProximitySystem.js'));
  const body = prox.slice(prox.indexOf('_getDetectionRangeAU(vessel) {'), prox.indexOf('\n  }\n', prox.indexOf('_getDetectionRangeAU(vessel) {')));
  ok(/import \{[^}]*\bvesselDetectionRangeAU\b[^}]*\} from '\.\.\/utils\/DetectionRange\.js';/.test(prox) && /return vesselDetectionRangeAU\(vessel,/.test(body)
    && !/getMultiplier\('sensor_range'\)/.test(body) && !/\*\s*mult/.test(body),
    'R1a SEDNO: `ProximitySystem._getDetectionRangeAU` deleguje do `vesselDetectionRangeAU` z `DetectionRange.js` — bez własnej formuły');
  const rl = strip(src('../../ui/HudRadarLogic.js'));
  ok(/import \{ vesselDetectionRangeAU \} from '\.\.\/utils\/DetectionRange\.js';/.test(rl) && RL?.vesselDetectionRangeAU === DR?.vesselDetectionRangeAU
    && typeof DR?.vesselDetectionRangeAU === 'function',
    'R1b SEDNO: `HudRadarLogic` importuje TĘ SAMĄ funkcję z `DetectionRange.js` (eksport = ten sam obiekt funkcji)');
  ok(PROXIMITY_DETECTION_AU === 0.5, 'R1c KONTROLA: `PROXIMITY_DETECTION_AU` = 0,5 AU (wartość bez zmian)');
  // Wykonanie: prawdziwa ProximitySystem vs radar HUD — kadłuby z danych gry, mnożnik techu ZF.
  const ps = new ProximitySystem({ _vessels: new Map() });
  const cases = [V('h1', { shipId: 'hull_small' }), V('h2', { shipId: 'hull_frigate' }), V('h3', { shipId: 'hull_medium' }), V('h4', { shipId: 'nieznany' }),
    V('h5', { shipId: 'hull_small', ownerEmpireId: 'emp_1' }), V('h6', { shipId: 'hull_small', ownerEmpireId: 'player' })];
  const vm = K.vesselManager, tech = K.techSystem;
  const rows = cases.map((v) => ({ id: v.id, prox: ps._getDetectionRangeAU(v), hud: RL?.vesselRadarRangeAU?.(v, { vesselManager: vm, techSystem: tech }) }));
  ok(rows.every((r) => r.hud === r.prox), `R1d SEDNO: radar = ProximitySystem co do bitu (${rows.map((r) => r.id + ' ' + r.prox).join(' · ')})`);
  ok(near(rows[0].prox, 11.52, 1e-9) && near(rows[0].hud, 11.52, 1e-9) && rows[4].hud === 0.5 && rows[0].hud !== GAME_CONFIG.SENSOR_LOCK_AU,
    `R1e SEDNO: ZF — hull_small 2,5 AU × 4,608 = ${rows[0].hud} AU (nie ${GAME_CONFIG.SENSOR_LOCK_AU} — dzisiejszy pierścień, 505); wróg — płasko 0,5`);
  const noK = { vesselManager: null, techSystem: null };
  ok(DR?.vesselDetectionRangeAU?.(V('x'), noK) === 0.5, 'R1f SEDNO: bez VesselManager / TechSystem — baza 0,5 (zapas jak dotąd w ProximitySystem)');
}

// ═══ R2 ══════════════════════════════════════════════════════════════════════
header('R2  promień kolonii = obserwatorium; ∞ — bez okręgu');
{
  const lv = [0, 1, 2, 3, 4].map((l) => RL?.colonyRadarRangeAU?.({ buildingSystem: { _active: new Map(l ? [['k', { building: { id: 'observatory' }, level: l }]] : []) } }, K.observatorySystem));
  ok(lv[0] === 1 && lv[1] === 3 && lv[2] === 6 && lv[3] === 15 && lv[4] === Infinity, `R2a SEDNO: poziomy obserwatorium 0–4 → ${lv.join(' / ')} AU (prawdziwa metoda)`);
  ok(RL?.colonyRadarRangeAU?.({}, K.observatorySystem) === 0 && RL?.colonyRadarRangeAU?.({ buildingSystem: { _active: new Map() } }, null) === 0,
    'R2b SEDNO: kolonia bez systemu budynków albo bez obserwatorium w grze — 0 (bez radaru)');
  const h = RL?.radarHolders?.({ colonies: COLONIES, sel: { entityId: 'p_nz' }, activeSystemId: 'sys_home', colonyRange: (c) => RL.colonyRadarRangeAU(c, K.observatorySystem) }) ?? [];
  ok(h.length === 1 && h[0].key === 'c:p_nz' && h[0].rangeAU === Infinity && h[0].circle === false, 'R2c SEDNO: zaznaczona Nowa Ziemia (Lv4 — ∞) — obiekt z radarem BEZ okręgu');
}

// ═══ R3 ══════════════════════════════════════════════════════════════════════
header('R3  kto ma radar (D-HUD-4, D-HUD-18; 506, 507, 516)');
{
  const vr = (v) => RL.vesselRadarRangeAU(v, { vesselManager: K.vesselManager, techSystem: K.techSystem });
  const cr = (c) => RL.colonyRadarRangeAU(c, K.observatorySystem);
  const H = (sel, tactical = false) => (RL?.radarHolders?.({ vessels: VESSELS, colonies: COLONIES, sel, tactical, activeSystemId: 'sys_home', vesselRange: vr, colonyRange: cr }) ?? []).map((x) => x.key);
  const WIT = H({ leadId: 'v_kur', vesselIds: ['v_kur'] }).length === 1;   // świadek: ten sam świat z zaznaczeniem ma radar
  ok(WIT && H({ leadId: null, vesselIds: [] }).length === 0, 'R3a SEDNO: brak zaznaczenia — brak radarów (świadek: z zaznaczeniem — jeden)');
  ok(JSON.stringify(H({ leadId: 'v_kur', vesselIds: ['v_kur'] })) === '["v:v_kur"]', 'R3b SEDNO: zaznaczony statek wiodący w służbie — jeden radar (tylko on)');
  ok(JSON.stringify(H({ leadId: null, vesselIds: ['v_orb', 'v_kur'] })) === '["v:v_orb"]', 'R3c SEDNO: bez lidera — pierwszy z zaznaczonych (`vesselIds[0]`)');
  ok(WIT && H({ leadId: 'v_res' }).length === 0 && H({ leadId: 'v_mob' }).length === 0, 'R3d SEDNO: rezerwa i mobilizacja (poza służbą) — bez radaru, także zaznaczone (507)');
  const dock = RL?.radarHolders?.({ vessels: VESSELS, sel: { leadId: 'v_dock' }, activeSystemId: 'sys_home', vesselRange: vr }) ?? [];
  ok(dock.length === 1 && dock[0].docked === true && dock[0].anchorBodyId === 'p_nz', 'R3e SEDNO: zadokowany ZAZNACZONY — radar w środku ciała postoju (p_nz)');
  ok(H({ leadId: 'v_kur' }, true).includes('v:v_orb') && !H({ leadId: 'v_kur' }, true).includes('v:v_dock'), 'R3f SEDNO: zadokowany NIEzaznaczony — bez radaru także w trybie Y (507: trzy nałożone okręgi w Nt)');
  ok(H({ entityId: 'p_fob' }).length === 1 && H({}, true).includes('c:p_fob') && H({ entityId: 'p_ai' }).length === 0 && !H({}, true).includes('c:p_ai'), 'R3g SEDNO: kolonia AI — nigdy, także zaznaczona i w trybie Y (506)');
  ok(WIT && H({ leadId: 'v_warp' }).length === 0 && H({ leadId: 'v_far' }).length === 0, 'R3h SEDNO: statek w skoku (`systemId` null) i statek innego układu — bez radaru (516)');
  ok(WIT && H({ leadId: 'v_foe' }).length === 0 && H({ leadId: 'v_wreck' }).length === 0, 'R3i SEDNO: obcy i wrak — bez radaru');
  ok(JSON.stringify(H({ entityId: 'p_out' })) === '["c:p_out"]' && JSON.stringify(H({ entityId: 'p_fob' })) === '["c:p_fob"]',
    'R3j SEDNO: zaznaczone ciało z kolonią gracza — pełna i placówka');
  const y = RL?.radarHolders?.({ vessels: VESSELS, colonies: COLONIES, sel: { leadId: 'v_kur' }, tactical: true, activeSystemId: 'sys_home', vesselRange: vr, colonyRange: cr }) ?? [];
  const keys = y.map((x) => x.key).sort().join(',');
  ok(keys === 'c:p_fob,c:p_nz,c:p_out,v:v_kur,v:v_orb' && y.filter((x) => x.selected).map((x) => x.key).join() === 'v:v_kur',
    `R3k SEDNO: tryb Y — wszystkie własne w oglądanym układzie (${keys}); zaznaczony tylko lider (ping tylko jego)`);
  const ff = RL?.radarHolders?.({ vessels: VESSELS, colonies: COLONIES, sel: {}, tactical: true, activeSystemId: 'sys_067', vesselRange: vr, colonyRange: cr }) ?? [];
  ok(ff.map((x) => x.key).sort().join(',') === 'c:p_x,v:v_far', 'R3l SEDNO: tryb Y w innym układzie — obiekty TEGO układu (filtr ścisły)');
  ok(RL?.colonySystemId?.({ planet: { systemId: 'sys_a' }, systemId: 'sys_b' }) === 'sys_a' && RL?.colonySystemId?.({}) === 'sys_home',
    'R3m SEDNO: układ kolonii — ciało, potem stempel kolonii, inaczej `sys_home` (reguła obserwatorium)');
}

// ═══ R4 ══════════════════════════════════════════════════════════════════════
header('R4  harmonogram pingu (D-HUD-12, D-HUD-b)');
{
  const P = (o) => (typeof RL?.pingPhase === 'function' ? RL.pingPhase(o) : undefined);   // `null` = brak pingu (nie zamieniać `??`)
  const a = P({ realNowMs: 2200, realStartMs: 1000, simNowMs: 5000, simStartMs: 5000 });
  ok(a?.clock === 'real' && near(a?.u, 0.5) && a?.n === 0, `R4a SEDNO: pierwszy ping — czas realny od zaznaczenia (1,2 s z 2,4 s → u ${a?.u})`);
  // Czasy realne dobrane tak, by przy zegarze REALNYM wypadały W pingu (+6 s + 1 s, +12 s + 0,5 s) — pin rozróżnia zegary.
  ok([3400, 8000, 13500, 99999].every((t) => P({ realNowMs: t, realStartMs: 1000, simNowMs: 5000, simStartMs: 5000 }) === null),
    'R4b SEDNO: pauza (zegar symulacji stoi) — po 2,4 s brak kolejnych pingów, także po długim czasie realnym');
  const b = P({ realNowMs: 9e9, realStartMs: 1000, simNowMs: 5000 + 6000 + 1200, simStartMs: 5000 });
  const b2 = P({ realNowMs: 9e9, realStartMs: 1000, simNowMs: 5000 + 12000 + 600, simStartMs: 5000 });
  ok(b?.clock === 'sim' && near(b?.u, 0.5) && b?.n === 1 && b2?.n === 2 && near(b2?.u, 0.25) && P({ realNowMs: 9e9, realStartMs: 1000, simNowMs: 10999, simStartMs: 5000 }) === null,
    'R4c SEDNO: bieg — kolejne pingi co 6 s zegara symulacji (n 1 przy +6 s, n 2 przy +12 s; przed +6 s — brak)');
  ok(P({ realNowMs: 1500, realStartMs: 1000, simNowMs: null, simStartMs: null })?.clock === 'real' && P({ realNowMs: 9e9, realStartMs: 1000, simNowMs: null, simStartMs: null }) === null,
    'R4d SEDNO: zegar symulacji `null` (przed pierwszym tikiem po wczytaniu) — tylko pierwszy ping, potem stan statyczny (bez zapasu na czas realny)');
  ok(near(RL?.pingRadiusFrac?.(0), 0) && near(RL?.pingRadiusFrac?.(1), 1) && RL?.pingRadiusFrac?.(0.5) > 0.5 && near(RL?.pingFade?.(0.3), 1) && near(RL?.pingFade?.(1), 0) && RL?.pingFade?.(0.8) < 1,
    'R4e SEDNO: ping od obiektu do granicy — ease-out (połowa czasu > połowa promienia), gaśnie na granicy (krycie 1 → 0)');
  // Wykonanie przez prawdziwą warstwę.
  setWorld(); select({}); W0.sim = 5000; W0.tactical = false;
  const h = mkHud();
  h.frame(1000);
  select({ lead: 'v_kur' });
  const f1 = h.frame(1000), d1 = holderOf(h.dbg(), 'v:v_kur');
  const f2 = h.frame(2200), d2 = holderOf(h.dbg(), 'v:v_kur');
  const f3 = h.frame(3500), d3 = holderOf(h.dbg(), 'v:v_kur');
  const draws3 = h.hud?.stats?.draws;
  const idle = [h.frame(3516), h.frame(5000), h.frame(9000)];
  ok(f1 === 'drawn' && d1?.ping?.clock === 'real' && near(d1?.ping?.u, 0) && f2 === 'drawn' && near(d2?.ping?.u, 0.5),
    `R4f SEDNO: warstwa — zaznaczenie startuje ping w czasie realnym (${f1} u ${d1?.ping?.u}; po 1,2 s u ${d2?.ping?.u})`);
  ok(f3 === 'drawn' && d3?.ping === null && idle.every((r) => r === 'idle') && h.hud?.stats?.draws === draws3,
    `R4g SEDNO: pauza — po 2,4 s jedna klatka bez pingu, potem spoczynek (${idle.join(',')}; rysunki bez zmian: ${h.hud?.stats?.draws})`);
  W0.sim = 5000 + 6000 + 1200;
  const f4 = h.frame(9100), d4 = holderOf(h.dbg(), 'v:v_kur');
  ok(f4 === 'drawn' && d4?.ping?.clock === 'sim' && d4?.ping?.n === 1 && near(d4?.ping?.u, 0.5),
    `R4h SEDNO: bieg (zegar symulacji +7,2 s) — kolejny ping na zegarze symulacji (n ${d4?.ping?.n}, u ${d4?.ping?.u})`);
  // Zegar `null` w chwili zaznaczenia → kotwica przy pierwszym odczycie zegara.
  setWorld(); select({}); W0.sim = null;
  const g = mkHud(); g.frame(100);
  select({ entity: 'p_fob' });
  g.frame(100); g.frame(5000);
  W0.sim = 777; g.frame(5100);
  W0.sim = 777 + 6000 + 600; const gg = g.frame(5200), gd = holderOf(g.dbg(), 'c:p_fob');
  ok(gg === 'drawn' && gd?.ping?.clock === 'sim' && gd?.ping?.n === 1 && near(gd?.ping?.u, 0.25),
    `R4i SEDNO: zegar \`null\` przy zaznaczeniu — kotwica przy pierwszym odczycie zegara (777), kolejny ping 6 s później (u ${gd?.ping?.u})`);
}

// ═══ R5 ══════════════════════════════════════════════════════════════════════
header('R5  ping stoi — duży pierścień albo duża tarcza (D-HUD-b)');
{
  const S = (o) => RL?.pingStopReason?.(o);
  ok(S({ ringPx: 444, mapW: 980, mapH: 740 }) === null && S({ ringPx: 444.1, mapW: 980, mapH: 740 }) === 'ring' && S({ ringPx: Infinity, mapW: 980, mapH: 740 }) === 'ring',
    'R5a SEDNO: pierścień > 0,6 × min(szer., wys.) obszaru mapy (444 przy 980×740) albo za kamerą (∞) — ping stoi');
  ok(S({ ringPx: 100, mapW: 980, mapH: 740, discPx: 40 }) === 'disc' && S({ ringPx: 100, mapW: 980, mapH: 740, discPx: 39.9 }) === null && S({ ringPx: 100, mapW: 980, mapH: 740, discPx: null }) === null,
    'R5b SEDNO: tarcza ciała pod środkiem radaru ≥ 40 px — ping stoi; mniejsza / brak tarczy — biegnie');
  // Wykonanie: kamera tuż przy statku — pierścień 11,52 AU większy niż kadr → bez pingu, granica i podziałka zostają.
  setWorld(); select({}); W0.sim = 5000;
  const h = mkHud(); h.frame(1000);
  W0.cam = mkCam([50, 6, 3], [50, 0.3, 0]); W0.camEpoch++;
  select({ lead: 'v_kur' });
  const r = h.frame(1000), d = holderOf(h.dbg(), 'v:v_kur');
  ok(r === 'drawn' && d?.stop === 'ring' && d?.ping === null && d?.runs >= 1 && d?.ticks > 0,
    `R5c SEDNO: zbliżenie do zaznaczonego statku — ping stoi (\`${d?.stop}\`, promień ${d?.ringPx} px), granica (${d?.runs} odc.) i podziałka (${d?.ticks}) zostają`);
  // Kolonia na dużym ciele (r = 1 j.), zasięg 1 AU, kamera blisko: tarcza ≥ 40 px przy pierścieniu w kadrze.
  BODIES.p_fob = { x: 0, y: 0, z: 40, r: 1.0 };
  setWorld(); select({}); const k2 = mkHud(); k2.frame(1000);
  W0.cam = mkCam([0, 14, 58], [0, 0, 40]); W0.camEpoch++;
  select({ entity: 'p_fob' });
  k2.frame(1000); const dd = holderOf(k2.dbg(), 'c:p_fob');
  ok(dd?.stop === 'disc' && dd?.discPx >= 40 && dd?.ringPx <= 444 && dd?.ping === null,
    `R5d SEDNO: tarcza ${dd?.discPx} px przy pierścieniu ${dd?.ringPx} px w kadrze — ping stoi (\`${dd?.stop}\`)`);
  BODIES.p_fob = { x: -30, y: 0, z: 12, r: 0.05 };
}

// ═══ R6 ══════════════════════════════════════════════════════════════════════
header('R6  podziałka co 30°, kąt 0 = oś x układu (nie kamera)');
{
  const A = RL?.tickAngles?.() ?? [];
  ok(A.length === 12 && A.every((a, k) => near(a, (k * Math.PI) / 6, 1e-12)), `R6a SEDNO: 12 kresek co 30° (${A.length})`);
  const P = (await tryImport('../../ui/HudProjection.js'))?.makeHudProjector;
  const run = (cam) => {
    setWorld(); select({ lead: 'v_kur' }); W0.sim = 5000; W0.cam = cam; W0.camEpoch++;
    const radar = RLay?.HudRadarLayer ? new RLay.HudRadarLayer(null) : null;
    const F = { K, now: 99999, sim: 5000, sel: { leadId: 'v_kur', vesselIds: ['v_kur'], activeSystemId: 'sys_home' }, activeSystemId: 'sys_home', features: FEATURES,
      tactical: false, W: 1280, H: 832.8, mapRect: { x: 150, y: 0, w: 980, h: 740 }, roles: { primary: TC.THEME.accent } };
    radar?.prepare?.(F);
    const proj = P?.({ ...viewOf(cam), uiScale: 1.25 });
    const c = radar?.collect?.(F, proj);
    const it = c?.items?.[0];
    const want0 = proj?.point?.(50 + 126.72, 0.3, 0), want90 = proj?.point?.(50, 0.3, 126.72);
    return { it, want0, want90 };
  };
  const a1 = run(CAM_FAR), a2 = run(mkCam([-150, 300, -260]));
  const okAt = (r) => r.it && r.want0 && near(r.it.ticks[0][0], r.want0.x, 1e-6) && near(r.it.ticks[0][1], r.want0.y, 1e-6)
    && near(r.it.ticks[3][0], r.want90.x, 1e-6) && near(r.it.ticks[3][1], r.want90.y, 1e-6);
  ok(okAt(a1) && okAt(a2), 'R6b SEDNO: kreska 0 = punkt świata (środek + r, 0, 0), kreska 3 (90°) = (środek, 0, + r) — przy DWÓCH kamerach (ramka układu)');
  const dir = (r) => { const t = r.it?.ticks?.[0]; return t ? Math.atan2(t[3] - t[1], t[2] - t[0]) : NaN; };
  ok(Math.abs(dir(a1) - dir(a2)) > 0.2, `R6c SEDNO: kierunek kreski 0 na ekranie zależy od kamery (${dir(a1).toFixed(2)} / ${dir(a2).toFixed(2)} rad) — kąt liczony w układzie, nie na ekranie`);
  const len = (t) => Math.hypot(t[2] - t[0], t[3] - t[1]);
  const major = (k) => k % 3 === 0;
  ok(a1.it?.ticks?.length === 12 && a1.it.ticks.every((t, k) => near(len(t), major(k) ? 16 : 10, 1e-9)),
    'R6d SEDNO: kreski do wewnątrz — 12 kresek, główne (0°, 90°, 180°, 270°) 16 px, pozostałe 10 px (korekta 1b; długość stała)');
}

// ═══ R7 ══════════════════════════════════════════════════════════════════════
header('R7  kolory z ról motywu, zero hexów');
{
  const HEX = /#[0-9a-fA-F]{3,8}\b|0x[0-9a-fA-F]{6}\b|rgba?\(\s*\d/;
  ok(HEX.test("c = '#44ccff'") && HEX.test('0x44ccff') && HEX.test('rgba(1, 2, 3, 0.4)'), 'R7-0 KONTROLA: detektor kolorów działa');
  for (const f of ['HudRadarLogic.js', 'HudRadarLayer.js']) {
    let code = ''; try { code = strip(src('../../ui/' + f)); } catch { code = ''; }
    ok(code.length > 0 && !HEX.test(code) && !/from 'three'|THREE\./.test(code), `R7a SEDNO: \`${f}\` — bez kolorów na sztywno i bez three`);
  }
  for (const th of ['ambient_1', 'neon_cyber']) {
    TC.applyPreset(TC.PRESET_THEMES[th]);
    setWorld(); select({}); W0.sim = 5000;
    const h = mkHud(); h.frame(1000); select({ lead: 'v_kur' }); h.ctx.calls.length = 0; h.frame(1000);
    const rr = HP.resolveHudRoles(TC.THEME), B = rr[RL?.HUD_RADAR?.BOUNDARY_ROLE];
    const seq = h.ctx.calls.filter((c) => c[0] === '=strokeStyle' || c[0] === '=fillStyle').map((c) => c[0].slice(1, 2) + ':' + c[1]);
    const want = ['s:' + B, 's:' + B, 'f:' + B, 's:' + rr.primary];
    ok(B != null && JSON.stringify(seq) === JSON.stringify(want),
      `R7b SEDNO: ${th} — granica, podziałka i odczyt w roli \`${RL?.HUD_RADAR?.BOUNDARY_ROLE}\` (${B}), ping w \`primary\` (${rr.primary}) — kolejność ${seq.join(' → ')}`);
  }
  const RR = { primary: 'X', alert: 'Y', dim: 'D', foreign: 'F' };
  const st = RL?.radarStyle?.(RR), B = RR[RL?.HUD_RADAR?.BOUNDARY_ROLE];
  ok(B != null && st?.boundary?.color === B && st?.tick?.color === B && st?.readout?.color === B && st?.ping?.color === 'X',
    `R7c SEDNO: \`radarStyle\` — granica, podziałka i odczyt z roli \`HUD_RADAR.BOUNDARY_ROLE\` (${RL?.HUD_RADAR?.BOUNDARY_ROLE}), ping z \`primary\` (role czytane przy każdym wywołaniu)`);
}

// ═══ R8 ══════════════════════════════════════════════════════════════════════
header('R8  rysunek: kropki, podziałka, ping; szerokości stałe w px (508)');
{
  TC.applyPreset(TC.PRESET_THEMES.ambient_1);
  const R = RL?.HUD_RADAR ?? {};
  ok(R.BOUNDARY_ALPHA === 0.35 && JSON.stringify(R.BOUNDARY_DASH) === '[0,6]' && R.BOUNDARY_WIDTH === 1.5 && R.BOUNDARY_CAP === 'round'
    && R.TICK_ALPHA === 0.55 && R.TICK_COUNT === 12 && R.TICK_LEN === 10 && R.TICK_MAJOR_LEN === 16 && R.TICK_MAJOR_EVERY === 3 && R.READOUT_ALPHA === 0.6
    && R.PING_MS === 2400 && R.PING_PERIOD_MS === 6000 && R.PING_LINE_WIDTH === 1.2 && R.PING_LINE_ALPHA === 0.7 && R.PING_GLOW_ALPHA === 0.22
    && R.PING_ECHO_WIDTH === 0.6 && R.PING_ECHO_ALPHA === 0.25 && R.PING_STOP_FRAME_FRAC === 0.6 && R.PING_STOP_DISC_PX === 40,
    'R8a SEDNO: specyfikacja (korekta 1b) — kropki 1,5 px okrągłe co 6 px / 0,35; kreski 12 × 10 px, główne 16 px / 0,55; odczyt 0,6; ping 2,4 s co 6 s, linia 1,2 / 0,7, poświata 0,22, echo 0,6 / 0,25; stop 0,6 kadru / 40 px');
  const g = RL?.glowLayerAlpha?.(3, 0.22);
  ok(near(1 - Math.pow(1 - g, 3), 0.22, 1e-12), `R8b SEDNO: poświata — 3 nałożone warstwy po ${g?.toFixed?.(4)} → szczyt 0,22`);
  // Zaznaczenie widziane w klatce 1000 (start pingu), odczyt w klatce 1600 — ping w 1/4 (u 0,25, bez wygaszania).
  //  Wynik — wywołania ctx OSTATNIEJ klatki z rysunkiem (przy stojącym pingu druga klatka to spoczynek).
  const drawAt = (cam) => {
    setWorld(); W0.sim = 5000; W0.cam = cam; select({ lead: 'v_kur' });
    const h = mkHud();
    let last = [];
    for (const t of [1000, 1600]) { h.ctx.calls.length = 0; if (h.frame(t) === 'drawn') last = [...h.ctx.calls]; }
    return last;
  };
  // Dwa zbliżenia z pingiem (pierścień ~230 i ~390 px — oba w kadrze) + trzecie, przy którym ping stoi (granica i kreski).
  const far = drawAt(CAM_FAR), mid = drawAt(mkCam([230, 160, 100], [50, 0, 0])), close = drawAt(mkCam([120, 60, 30], [50, 0, 0]));
  const widths = (calls) => calls.filter((c) => c[0] === '=lineWidth').map((c) => c[1]);
  const dash = far.find((c) => c[0] === 'setLineDash' && Array.isArray(c[1]) && c[1].length === 2);
  ok(JSON.stringify(dash?.[1]) === '[0,6]', `R8c SEDNO: granica kropkami — \`setLineDash([0, 6])\` (${JSON.stringify(dash?.[1])})`);
  ok(JSON.stringify(widths(far)) === JSON.stringify(widths(mid)) && JSON.stringify(widths(far)) === '[1.5,1,7,4.5,2.5,1.2,0.6]'
    && JSON.stringify(widths(close)) === '[1.5,1]',
    `R8d SEDNO: szerokości kresek w px STAŁE przy różnych zbliżeniach (${JSON.stringify(widths(far))}; ping stoi: ${JSON.stringify(widths(close))}) — pas nie skaluje się z promieniem (508)`);
  const alphas = far.filter((c) => c[0] === '=globalAlpha').map((c) => +(+c[1]).toFixed(4));
  ok(alphas[0] === 0.35 && alphas[1] === 0.55 && alphas[2] === 0.6 && alphas.includes(0.7) && alphas.includes(0.25) && alphas[alphas.length - 1] === 1,
    `R8e SEDNO: krycia — granica 0,35, podziałka 0,55, odczyt 0,6, linia pingu 0,7, echo 0,25 (na starcie, bez wygaszania), na końcu 1 (${alphas.join(', ')})`);
}

// ═══ R9 ══════════════════════════════════════════════════════════════════════
header('R9  widoczność warstwy radaru');
{
  ok(RL?.radarLayerVisible?.({}, false) === true && RL?.radarLayerVisible?.({ hudRadarVisible: false }, false) === false
    && RL?.radarLayerVisible?.({ hudRadarVisible: false }, true) === true && RL?.radarLayerVisible?.({ sensorOverlayVisible: false }, false) === true,
    'R9a SEDNO: ☰ „Radar” = `hudRadarVisible` (brak klucza = widoczna; stare `sensorOverlayVisible: false` nie gasi); tryb Y wymusza');
  setWorld(); select({ lead: 'v_kur' }); W0.sim = 5000;
  FEATURES.hudRadar = false;
  const h1 = mkHud(); const r1 = h1.frame(1000);
  FEATURES.hudRadar = true;
  K.uiPrefs = { hudRadarVisible: false };
  const h2 = mkHud(); const r2 = h2.frame(1000); const vis2 = h2.dbg()?.visible;
  W0.tactical = true; const r3 = h2.frame(1000); W0.tactical = false;
  ok(r1 === 'empty' && h1.ctx.calls.length === 0 && r2 === 'empty' && vis2 === false && r3 === 'drawn',
    `R9b SEDNO: flaga OFF → pusto (${r1}); preferencja OFF → pusto (${r2}); tryb Y przy preferencji OFF → rysunek (${r3})`);
}

// ═══ R10 ═════════════════════════════════════════════════════════════════════
header('R10  pierścienie 3D — wykonanie `_syncSensorOverlay` ze źródła ThreeRenderer');
{
  const TR = strip(src('../../renderer/ThreeRenderer.js'));
  const methodBody = (code, sig) => { const i = code.indexOf(sig); return i < 0 ? '' : code.slice(i, code.indexOf('\n  }\n', i) + 4); };
  const compileWith = (text, scope) => { if (!text) return null; try { const n = Object.keys(scope); return new Function(...n, '__s', 'return eval("(" + __s + ")");')(...n.map((k) => scope[k]), text); } catch (e) { console.log('    (kompilacja: ' + e.message + ')'); return null; } };
  const constOf = (name) => Number(TR.match(new RegExp('const ' + name + '\\s*=\\s*([0-9a-fx.]+)'))?.[1]);
  const FL = { m4SensorOverlay: true };
  const GC = { FEATURES: FL, SENSOR_LOCK_AU: GAME_CONFIG.SENSOR_LOCK_AU };
  const hudRadarSrc = TR.match(/const hudRadarOn = (\(\) => [^;]+);/)?.[1] ?? '';
  const hudRadarOn = compileWith(hudRadarSrc, { isHudRadarOn: RL?.isHudRadarOn, GAME_CONFIG: GC }) ?? (() => false);
  class Ring { constructor(a, b) { this.a = a; this.b = b; } dispose() { this.disposed = true; } }
  class Mat { constructor(o) { Object.assign(this, o); } dispose() { this.disposed = true; } }
  class Mesh { constructor(g, m) { this.geometry = g; this.material = m; this.rotation = {}; this.position = { set: (x, y, z) => { this.p = [x, y, z]; } }; } }
  const THREE = { RingGeometry: Ring, MeshBasicMaterial: Mat, Mesh, DoubleSide: 2 };
  const SCOPE = { THREE, GAME_CONFIG: GC, hudRadarOn, isEnemyVessel, S: (v) => v / 10, AU: 110,
    EntityManager: { get: (id) => ({ p_nz: { x: 682, y: 0 }, p_fob: { x: -300, y: 120 }, p_fob2: { x: -310, y: 125 }, p_ai: { x: 200, y: 200 }, p_out: { x: -400, y: -50 }, p_x: { x: 1, y: 1 } })[id] ?? null },
    SENSOR_RING_VESSEL_COLOR: constOf('SENSOR_RING_VESSEL_COLOR'), SENSOR_RING_COLONY_COLOR: constOf('SENSOR_RING_COLONY_COLOR'),
    SENSOR_RING_OPACITY: constOf('SENSOR_RING_OPACITY'), SENSOR_RING_SEGMENTS: constOf('SENSOR_RING_SEGMENTS'), SENSOR_RING_Y: constOf('SENSOR_RING_Y'),
    SENSOR_RING_MAX_COLONY_AU: constOf('SENSOR_RING_MAX_COLONY_AU') };
  const M = {};
  for (const n of ['_syncSensorOverlay', '_upsertSensorRing', '_disposeSensorRing', '_disposeAllSensorRings']) {
    const b = methodBody(TR, `\n  ${n}(`); M[n] = b ? compileWith('function ' + b.trim().slice(n.length), SCOPE) : null;
  }
  const mkR = () => {
    const scene = { objs: new Set(), add(o) { this.objs.add(o); }, remove(o) { this.objs.delete(o); } };
    const r = { scene, _sensorRingMeshes: new Map() };
    for (const [n, f] of Object.entries(M)) r[n] = f ? (...a) => f.apply(r, a) : () => {};
    return r;
  };
  // Świat jak ZF: 10 statków gracza w `sys_home` (2 w locie, 8 zadokowanych) + 5 kolonii gracza.
  const ZF_V = [...['a', 'b'].map((i) => V('f_' + i)), ...'cdefghij'.split('').map((i) => V('d_' + i, { position: { x: 1, y: 1, state: 'docked', dockedAt: 'p_nz' } }))];
  const ZF_C = ['p_nz', 'p_fob', 'p_out'].map((id) => mkCol(id)).concat([mkCol('p_x', { systemId: 'sys_home' }), mkCol('p_fob', { planetId: 'p_fob2' })]);
  K.vesselManager = { _vessels: new Map(ZF_V.map((v) => [v.id, v])) };
  K.colonyManager = { getAllColonies: () => ZF_C };
  K.uiPrefs = { sensorOverlayVisible: true };
  K.activeSystemId = 'sys_home';
  FEATURES.hudRadar = false; FL.hudRadar = false;
  const off = mkR(); off._syncSensorOverlay();
  ok(off._sensorRingMeshes.size === 15 && off.scene.objs.size === 15, `R10a KONTROLA: OFF — dzisiejsze pierścienie 3D: ${off._sensorRingMeshes.size} (10 statków, także zadokowane, + 5 kolonii)`);
  // Defekty ścieżki OFF zostają (OFF = dzisiejszy kod co do bitu).
  K.vesselManager = { _vessels: new Map([['w', V('w', { systemId: null })], ['r', V('r', { serviceState: 'stored' })]]) };
  K.colonyManager = { getAllColonies: () => [mkCol('p_ai', { ownerEmpireId: 'emp_1' })] };
  const off2 = mkR(); off2._syncSensorOverlay();
  ok(off2._sensorRingMeshes.has('v_w') && off2._sensorRingMeshes.has('v_r') && off2._sensorRingMeshes.has('col_p_ai'),
    'R10b KONTROLA: OFF — statek w skoku (516), rezerwa (507) i kolonia AI (506) dalej z pierścieniem 3D (dzisiejszy kod)');
  FL.hudRadar = true;
  off._syncSensorOverlay();
  ok(off._sensorRingMeshes.size === 0 && off.scene.objs.size === 0, `R10c SEDNO: ON — \`_syncSensorOverlay\` usuwa pierścienie 3D i nie tworzy nowych (${off._sensorRingMeshes.size})`);
  const loop = methodBody(TR, '\n  _startLoop() {');
  ok(/if \(this\._sensorRingMeshes\.size > 0 && hudRadarOn\(\)\) this\._disposeAllSensorRings\(\);/.test(loop) && loop.indexOf('hudRadarOn()') > loop.indexOf('this._syncHudOrbits();'),
    'R10d SEDNO: pętla renderu usuwa pierścienie 3D przy ON co klatkę (także w pauzie, bez zdarzeń synchronizacji)');
  const sync = methodBody(TR, '\n  _syncSensorOverlay() {');
  ok(sync.indexOf('if (hudRadarOn()) {') > 0 && sync.indexOf('if (hudRadarOn()) {') < sync.indexOf('if (!GAME_CONFIG.FEATURES.m4SensorOverlay)')
    && /if \(v\.systemId && v\.systemId !== activeSys\) continue;/.test(sync) && /GAME_CONFIG\.SENSOR_LOCK_AU,/.test(sync),
    'R10e SEDNO: bramka ON na początku `_syncSensorOverlay`; dalsza treść (ścieżka OFF) — dzisiejszy kod (filtr układu, promień 0,3 AU)');
}

// ═══ R11 ═════════════════════════════════════════════════════════════════════
header('R11  menu ☰ „Radar” — wykonanie metod BottomBar');
{
  const bb = Object.create(BottomBar.prototype);
  Object.assign(bb, { _autosaveOption: 'year', _orbitMode: 'planetoids' });
  const row = () => bb._getMenuRows(true, true).find((r) => r.id === 'radar');
  FEATURES.hudRadar = true;
  K.uiPrefs = { sensorOverlayVisible: false };
  const a = row();
  bb._toggleSensorOverlay(); const b = row(); const pB = { ...K.uiPrefs };
  bb._toggleSensorOverlay(); const c = row();
  ok(a?.valueOn === true && b?.valueOn === false && pB.hudRadarVisible === false && pB.sensorOverlayVisible === false && c?.valueOn === true && K.uiPrefs.hudRadarVisible === true,
    `R11a SEDNO: ON — wartość z \`hudRadarVisible\` (brak = WŁ mimo starego \`sensorOverlayVisible: false\`); przełącznik pisze \`hudRadarVisible\` (${a?.valueOn} → ${b?.valueOn} → ${c?.valueOn}), \`sensorOverlayVisible\` nietknięte`);
  FEATURES.hudRadar = false;
  K.uiPrefs = { sensorOverlayVisible: false };
  const d = row(); bb._toggleSensorOverlay(); const e = row();
  ok(d?.valueOn === false && e?.valueOn === true && K.uiPrefs.sensorOverlayVisible === true && K.uiPrefs.hudRadarVisible === undefined,
    'R11b KONTROLA: OFF — jak dziś: wartość i przełącznik `sensorOverlayVisible`');
  FEATURES.hudRadar = true;
}

// ═══ R12 ═════════════════════════════════════════════════════════════════════
header('R12  błysk — logika (D-HUD-4)');
{
  const B = (a, b) => RL?.bearingRad?.(a, b);
  ok(near(B({ x: 0, y: 0 }, { x: 10, y: 0 }), 0) && near(B({ x: 0, y: 0 }, { x: 0, y: 10 }), Math.PI / 2) && near(B({ x: 5, y: 5 }, { x: -5, y: 5 }), Math.PI),
    'R12a SEDNO: namiar w ramce układu — oś x układu = 0, oś y = 90° (współrzędne logiki gry, bez kamery)');
  const arc = RL?.flashArc?.(1);
  ok(near(arc?.[0], 1 - Math.PI / 12) && near(arc?.[1], 1 + Math.PI / 12), 'R12b SEDNO: łuk błysku ±15° wokół namiaru');
  const FA = (t) => RL?.flashAlpha?.(t);
  ok(FA(0) === 1 && near(FA(400), 0.75) && FA(800) === 0 && FA(5000) === 0 && FA(-1) === 0 && RL?.HUD_RADAR?.FLASH_MS === 800,
    'R12c SEDNO: krycie błysku 1 → 0 w 0,8 s czasu realnego (poza oknem — 0)');
  const pl = V('p1'), en = V('e1', { ownerEmpireId: 'emp_1', isEnemy: true }), en2 = V('e2', { ownerEmpireId: 'emp_2', isEnemy: true });
  const pr = (a, b) => RL?.proximityFlashPair?.(a, b);
  ok(pr(pl, en)?.holder === pl && pr(en, pl)?.holder === pl && pr(en, pl)?.foe === en && pr(pl, V('p2')) === null && pr(en, en2) === null
    && pr(pl, { ...en, isWreck: true }) === null,
    'R12d SEDNO: para z graczem — właściciel radaru = statek gracza (w obu kolejnościach); swoi, AI↔AI, wrak — bez błysku');
  const pos = { p_nz: { x: 682, y: 0 }, p_fob: { x: -300, y: 120 }, p_ai: { x: -280, y: 120 }, p_out: { x: -400, y: -50 }, p_x: { x: -300, y: 120 } };
  const NC = (foe) => RL?.nearestCoveringColony?.({ foe, colonies: COLONIES, auToPx: 110, posOf: (c) => pos[c.planetId] ?? null,
    rangeOf: (c) => RL.colonyRadarRangeAU(c, K.observatorySystem) }) ?? null;
  const nearFob = NC(V('f1', { ownerEmpireId: 'emp_1', position: { x: -245, y: 120 } }));
  ok(nearFob?.colony?.planetId === 'p_fob' && near(nearFob?.distAU, 0.5), `R12e SEDNO: obcy 0,5 AU od Fobosa (1 AU) — kolonia Fobos (najbliższa w zasięgu; ${nearFob?.colony?.planetId})`);
  const nearNz = NC(V('f2', { ownerEmpireId: 'emp_1', position: { x: 600, y: 0 } }));
  ok(nearNz?.colony?.planetId === 'p_nz' && nearNz?.rangeAU === Infinity, 'R12f SEDNO: obcy poza zasięgiem kolonii 1 AU — Nowa Ziemia (∞; wołający: bez granicy, bez błysku)');
  ok(NC(V('f3', { ownerEmpireId: 'emp_1', position: { x: -280, y: 125 } }))?.colony?.planetId === 'p_fob' && NC(V('f4', { ownerEmpireId: 'emp_1', systemId: null, position: { x: -245, y: 120 } })) === null
    && NC(V('f5', { ownerEmpireId: 'emp_1', systemId: 'sys_067', position: { x: -299, y: 120 } }))?.colony?.planetId === 'p_x',
    'R12g SEDNO: kolonia AI obok — nie (Fobos); statek w skoku — brak; inny układ — kolonia TEGO układu');
}

// ═══ R13 ═════════════════════════════════════════════════════════════════════
header('R13  błysk — warstwa i prawdziwe zdarzenia');
{
  const EB = (await import('../../core/EventBus.js')).default;
  const P = (await tryImport('../../ui/HudProjection.js'))?.makeHudProjector;
  TC.applyPreset(TC.PRESET_THEMES.ambient_1);
  const T = { now: 10000 };
  const mkHudT = () => {
    const ctx = mkCtx(); const cv = { width: 0, height: 0, getContext: () => ctx };
    const hud = HL?.HudLayer ? new HL.HudLayer(cv, { autoStart: false, now: () => T.now }) : null;   // domyślne podwarstwy gry (radar)
    const radar = hud?._sublayers?.[0] ?? null;
    return { ctx, hud, radar, frame: () => (hud ? hud.frame(T.now) : null), dbg: () => radar?.debug?.() ?? null };
  };
  K.entityManager = { get: (id) => ({ p_nz: { x: 682, y: 0 }, p_fob: { x: -300, y: 120 }, p_out: { x: -400, y: -50 } })[id] ?? null };
  setWorld(); K.entityManager = { get: (id) => ({ p_nz: { x: 682, y: 0 }, p_fob: { x: -300, y: 120 }, p_out: { x: -400, y: -50 } })[id] ?? null };
  select({}); W0.sim = 5000; FEATURES.hudRadar = true;
  const h = mkHudT();
  ok(h.radar instanceof (RLay?.HudRadarLayer ?? class {}), 'R13-0 SEDNO: domyślna podwarstwa warstwy HUD gry = radar (`HudRadarLayer`)');
  h.frame();
  const idle0 = h.frame();
  h.ctx.calls.length = 0;
  EB.emit('vessel:proximityEnter', { vesselAId: 'v_kur', vesselBId: 'v_foe', distanceAU: 11.5, sameFaction: false });
  const r1 = h.frame(), d1 = h.dbg();
  const fl = d1?.flashes?.[0];
  const want = (Math.atan2(40 - 0, 400 - 500) * 180) / Math.PI;
  ok(idle0 === 'idle' && r1 === 'drawn' && d1?.flashes?.length === 1 && fl?.key === 'v:v_kur' && near(fl?.angleDeg, +want.toFixed(1), 1e-9) && fl?.alpha === 1,
    `R13a SEDNO: \`vessel:proximityEnter\` (Kurier ↔ Rajder) → błysk na granicy NIEzaznaczonego Kuriera w namiarze ${fl?.angleDeg}° (z pozycji logicznych: ${want.toFixed(1)}°)`);
  // Punkty łuku = rzut łuku świata na granicy (środek = sprite, promień 11,52 AU).
  const proj = P?.({ ...viewOf(CAM_FAR), uiScale: 1.25 });
  const a0 = (Math.atan2(40, -100)) - Math.PI / 12;
  const p0 = proj?.point?.(50 + 126.72 * Math.cos(a0), 0.3, 0 + 126.72 * Math.sin(a0));
  const mv = h.ctx.calls.find((c) => c[0] === 'moveTo' && near(c[1], p0?.x, 1e-6) && near(c[2], p0?.y, 1e-6));
  const flashStroke = h.ctx.calls.filter((c) => c[0] === '=strokeStyle').map((c) => c[1]);
  ok(!!mv && flashStroke.includes(TC.THEME.danger) && !flashStroke.includes(TC.THEME.accent),
    `R13b SEDNO: łuk zaczyna się w rzucie punktu granicy (namiar − 15°), kolor roli \`alert\` (Amber Noir: danger ${TC.THEME.danger}); bez okręgu radaru (statek niezaznaczony)`);
  T.now += 400; const r2 = h.frame(); const a2 = h.dbg()?.flashes?.[0]?.alpha;
  T.now += 450; const r3 = h.frame(); const n3 = h.dbg()?.flashes?.length;
  const r4 = h.frame();
  ok(r2 === 'drawn' && near(a2, 0.75, 1e-9) && r3 === 'drawn' && n3 === 0 && r4 === 'idle',
    `R13c SEDNO: błysk gaśnie w czasie realnym (po 0,4 s krycie ${a2}); po 0,8 s jedna klatka czyszcząca, potem spoczynek (${r2} → ${r3} → ${r4})`);
  // Bez błysku: swoi, zaznaczony, zadokowany, flaga OFF, inny układ.
  const none = [];
  EB.emit('vessel:proximityEnter', { vesselAId: 'v_kur', vesselBId: 'v_orb', distanceAU: 1, sameFaction: true }); none.push(h.radar?._flashes?.length ?? -1);
  select({ lead: 'v_kur' }); h.frame();
  EB.emit('vessel:proximityEnter', { vesselAId: 'v_foe', vesselBId: 'v_kur', distanceAU: 1, sameFaction: false }); none.push(h.radar?._flashes?.length ?? -1);
  select({}); h.frame();
  EB.emit('vessel:proximityEnter', { vesselAId: 'v_dock', vesselBId: 'v_foe', distanceAU: 1, sameFaction: false }); none.push(h.radar?._flashes?.length ?? -1);
  FEATURES.hudRadar = false;
  EB.emit('vessel:proximityEnter', { vesselAId: 'v_kur', vesselBId: 'v_foe', distanceAU: 1, sameFaction: false }); none.push(h.radar?._flashes?.length ?? -1);
  FEATURES.hudRadar = true;
  ok(none.every((n) => n === 0), `R13d SEDNO: bez błysku — swoi, zaznaczony (ma pełny radar), zadokowany (bez radaru), flaga OFF (${none.join(', ')})`);
  // Kolonia — obserwatorium: najbliższa kolonia gracza w zasięgu.
  const foe2 = V('v_foe2', { ownerEmpireId: 'emp_1', isEnemy: true, position: { x: -245, y: 120, state: 'in_transit', dockedAt: null } });
  VESSELS.push(foe2);
  h.ctx.calls.length = 0;
  EB.emit('vessel:detectionChanged', { vesselId: 'v_foe2', detected: true, vessel: foe2 });
  const r5 = h.frame(); const f5 = h.dbg()?.flashes?.[0];
  ok(r5 === 'drawn' && f5?.key === 'c:p_fob' && near(f5?.angleDeg, 0, 1e-9),
    `R13e SEDNO: \`vessel:detectionChanged { detected: true }\` → błysk kolonii Fobos (najbliższa w zasięgu 1 AU) w namiarze ${f5?.angleDeg}°`);
  T.now += 1000; h.frame(); h.frame();
  const foe3 = V('v_foe3', { ownerEmpireId: 'emp_1', isEnemy: true, position: { x: 600, y: 0, state: 'in_transit', dockedAt: null } });
  VESSELS.push(foe3);
  const before = h.radar?._flashes?.length ?? -1;
  EB.emit('vessel:detectionChanged', { vesselId: 'v_foe3', detected: true, vessel: foe3 });
  EB.emit('vessel:detectionChanged', { vesselId: 'v_foe2', detected: false });
  ok(before === 0 && h.radar?._flashes?.length === 0, 'R13f SEDNO: obcy złapany tylko przez Nową Ziemię (∞ — bez granicy) i `detected: false` — bez błysku');
  // Mgła wojny: rekord błysku bez danych obcego; warstwa nie czyta wywiadu.
  EB.emit('vessel:proximityEnter', { vesselAId: 'v_orb', vesselBId: 'v_foe', distanceAU: 1, sameFaction: false });
  const rec = h.radar?._flashes?.[0];
  const recKeys = rec ? Object.keys(rec).sort().join(',') : '';
  const lay = strip(src('../../ui/HudRadarLayer.js'));
  ok(recKeys === 'angle,id,key,kind,systemId,t0' && rec?.id === 'v_orb' && !/intelSystem|getVesselContact|isAtLeast|\.name\b/.test(lay),
    `R13g SEDNO: mgła wojny — rekord błysku (${recKeys}) bez nazwy, typu i id obcego; warstwa nie czyta wywiadu (ta sama geometria przy rumor i contact)`);
  // Inny układ: właściciel radaru w sys_067 przy oglądanym sys_home — nie rysowany.
  T.now += 1000; h.frame(); h.frame();
  const foeFar = V('v_foeFar', { ownerEmpireId: 'emp_1', isEnemy: true, systemId: 'sys_067', position: { x: 20, y: 10, state: 'in_transit', dockedAt: null } });
  VESSELS.push(foeFar);
  EB.emit('vessel:proximityEnter', { vesselAId: 'v_far', vesselBId: 'v_foeFar', distanceAU: 1, sameFaction: false });
  const r8 = h.frame(); const d8 = h.dbg();
  ok((h.radar?._flashes?.length ?? 0) === 1 && (d8?.flashes?.length ?? -1) === 0 && r8 !== 'drawn',
    `R13h SEDNO: błysk statku z innego układu — zapisany (${h.radar?._flashes?.length}), nierysowany w oglądanym układzie (${r8})`);
  // Neon Cyber — alert = warning (reguła B2).
  TC.applyPreset(TC.PRESET_THEMES.neon_cyber);
  T.now += 1000; K.activeSystemId = 'sys_home'; h.frame(); h.frame();
  h.ctx.calls.length = 0;
  EB.emit('vessel:proximityEnter', { vesselAId: 'v_kur', vesselBId: 'v_foe', distanceAU: 11.5, sameFaction: false });
  h.frame();
  const ns = h.ctx.calls.filter((c) => c[0] === '=strokeStyle').map((c) => c[1]);
  ok(ns.includes(TC.THEME.warning) && !ns.includes(TC.THEME.danger), `R13i SEDNO: Neon Cyber — błysk w roli \`alert\` = warning (${TC.THEME.warning}; reguła B2)`);
  T.now += 1000; h.frame(); h.frame();
  EB.emit('vessel:proximityEnter', { vesselAId: 'v_kur', vesselBId: 'v_foe', distanceAU: 11.5, sameFaction: false });
  const beforeDestroy = h.radar?._flashes?.length ?? 0;   // świadek: przed zniszczeniem zdarzenie daje błysk
  h.hud?.destroy?.();
  EB.emit('vessel:proximityEnter', { vesselAId: 'v_kur', vesselBId: 'v_foe', distanceAU: 11.5, sameFaction: false });
  ok(beforeDestroy === 1 && (h.radar?._flashes?.length ?? -1) === 0, `R13j SEDNO: \`destroy\` — podwarstwa odpina słuchaczy (przed: ${beforeDestroy} błysk, po zniszczeniu i zdarzeniu: ${h.radar?._flashes?.length})`);
  VESSELS.splice(VESSELS.length - 3, 3);
}

// ═══ R14 ═════════════════════════════════════════════════════════════════════
header('R14  korekta 1b — granica czytelna: kropki, podziałka 10 / 16 px, odczyt zasięgu, rola granicy');
{
  const I18N = await import('../../i18n/i18n.js');
  const P = (await tryImport('../../ui/HudProjection.js'))?.makeHudProjector;
  TC.applyPreset(TC.PRESET_THEMES.ambient_1);
  const R = RL?.HUD_RADAR ?? {};
  const roles = HP.resolveHudRoles(TC.THEME);
  const quiet = roles[R.BOUNDARY_ROLE];          // rola granicy wg stałej
  const RT = (r, l) => (typeof RL?.rangeReadoutText === 'function' ? RL.rangeReadoutText(r, l) : undefined);
  ok(RT(11.52, 'pl') === '11,5 AU' && RT(1, 'pl') === '1,0 AU' && RT(6.912, 'pl') === '6,9 AU' && RT(11.52, 'en') === '11.5 AU'
    && RT(Infinity, 'pl') === null && RT(0, 'pl') === null,
    `R14a SEDNO: tekst odczytu — liczba z jednym miejscem po przecinku + „AU”: „${RT(11.52, 'pl')}”, „${RT(1, 'pl')}” (pl), „${RT(11.52, 'en')}” (en); ∞ i 0 — brak`);
  // Warstwa jak w grze (domyślna podwarstwa radaru — `KOSMOS.hudLayer`); atrapa ctx z miarą tekstu 5 px na znak; stan ctx
  // w chwili każdego `stroke` i `fillText`.
  const T = { now: 50000 };
  const mkHudR = () => {
    const ctx = mkCtx(); ctx.measureText = (s) => ({ width: String(s).length * 5 }); ctx.calls.length = 0;
    const cv = { width: 0, height: 0, getContext: () => ctx };
    const hud = HL?.HudLayer ? new HL.HudLayer(cv, { autoStart: false, now: () => T.now }) : null;
    const radar = hud?._sublayers?.[0] ?? null;
    return { ctx, hud, radar, frame: () => (hud ? hud.frame(T.now) : null), dbg: () => radar?.debug?.() ?? null };
  };
  const ops = (calls) => {
    const st = { dash: '[]' }, res = [];
    for (const c of calls) {
      if (c[0][0] === '=') st[c[0].slice(1)] = c[1];
      else if (c[0] === 'setLineDash') st.dash = JSON.stringify(c[1]);
      else if (c[0] === 'stroke') res.push({ op: 'stroke', color: st.strokeStyle, alpha: +(+st.globalAlpha).toFixed(4), width: st.lineWidth, cap: st.lineCap, dash: st.dash, offset: st.lineDashOffset ?? 0 });
      else if (c[0] === 'fillText') res.push({ op: 'text', text: c[1], x: c[2], y: c[3], color: st.fillStyle, alpha: +(+st.globalAlpha).toFixed(4), font: st.font, align: st.textAlign, base: st.textBaseline });
    }
    return res;
  };
  setWorld(); select({}); W0.sim = 5000; W0.tactical = false; FEATURES.hudRadar = true;
  const h = mkHudR(); h.frame();
  select({ lead: 'v_kur' }); h.frame();                 // zaznaczenie — start pingu (czas realny)
  T.now += 600; h.ctx.calls.length = 0; h.frame();      // ping w 1/4 (u 0,25): granica, podziałka, odczyt, ping z echem
  const o1 = ops(h.ctx.calls), d1 = holderOf(h.dbg(), 'v:v_kur');
  const strokes = o1.filter((x) => x.op === 'stroke'), texts = o1.filter((x) => x.op === 'text');
  const bd = strokes.find((x) => x.dash !== '[]'), tk = strokes.find((x) => x.dash === '[]' && x.width === 1);
  ok(bd?.cap === 'round' && bd?.width === 1.5 && bd?.dash === '[0,6]' && bd?.alpha === 0.35 && bd?.color === quiet
    && tk?.cap === 'butt' && tk?.dash === '[]' && tk?.alpha === 0.55 && tk?.width === 1 && tk?.color === quiet,
    `R14b SEDNO: granica — kropki: \`lineCap\` ${bd?.cap}, średnica ${bd?.width} px, \`setLineDash\` ${bd?.dash}, α ${bd?.alpha}; podziałka — końce ${tk?.cap}, α ${tk?.alpha}; obie w roli \`${R.BOUNDARY_ROLE}\` (${quiet})`);
  const font = `${TC.THEME.fontSizeSmall}px ${TC.THEME.fontFamily}`;
  const noBg = !h.ctx.calls.some((c) => c[0] === 'fill' || c[0] === 'fillRect');
  ok(texts.length === 1 && texts[0].text === '11,5 AU' && texts[0].font === font && texts[0].color === quiet && texts[0].alpha === 0.6
    && texts[0].align === 'center' && texts[0].base === 'middle' && d1?.readout?.text === '11,5 AU' && noBg,
    `R14c SEDNO: odczyt zasięgu Kuriera — jeden napis „${texts[0]?.text}”, font motywu (${texts[0]?.font}), α ${texts[0]?.alpha}, rola \`${R.BOUNDARY_ROLE}\`, bez tła (${noBg})`);
  const pingStrokes = strokes.filter((x) => [7, 4.5, 2.5, 1.2, 0.6].includes(x.width));
  ok(pingStrokes.length === 5 && pingStrokes.every((x) => x.color === roles.primary && x.cap === 'butt'),
    `R14-0 KONTROLA: ping bez zmian — ${pingStrokes.length} kresek (poświata ×3, linia, echo) w roli \`primary\` (${roles.primary}), końce butt`);
  // Kotwica: najwyższa na ekranie kreska główna — liczona niezależnie z rzutu czterech punktów granicy (0°, 90°, 180°, 270°).
  const topMajor = (cam, c, rW) => {
    const proj = P?.({ ...viewOf(cam), uiScale: 1.25 });
    let best = null;
    for (const deg of [0, 90, 180, 270]) {
      const a = (deg * Math.PI) / 180;
      const o = proj?.point?.(c.x + rW * Math.cos(a), c.y, c.z + rW * Math.sin(a));
      const i = proj?.point?.(c.x + rW * 0.999 * Math.cos(a), c.y, c.z + rW * 0.999 * Math.sin(a));
      if (o && i && (!best || o.y < best.o.y)) best = { deg, o, i };
    }
    return best;
  };
  const rW = 11.52 * 11, KC = SPRITES.v_kur;
  const w0 = topMajor(CAM_FAR, KC, rW), rd = d1?.readout;
  const ux = w0 ? w0.o.x - w0.i.x : 0, uy = w0 ? w0.o.y - w0.i.y : 0, un = Math.hypot(ux, uy) || 1;
  const g = 4 + (Math.abs(ux / un) * (7 * 5)) / 2 + (Math.abs(uy / un) * TC.THEME.fontSizeSmall) / 2;
  const wantX = w0 ? w0.o.x + (ux / un) * g : NaN, wantY = w0 ? w0.o.y + (uy / un) * g : NaN;
  const ctrK = d1?.center;
  const outside = !!(ctrK && w0 && Math.hypot(texts[0]?.x - ctrK.x, texts[0]?.y - ctrK.y) > Math.hypot(w0.o.x - ctrK.x, w0.o.y - ctrK.y));
  ok(w0?.deg === 180 && rd?.deg === 180 && near(rd?.x, +w0.o.x.toFixed(2), 0.006) && near(rd?.y, +w0.o.y.toFixed(2), 0.006)
    && near(texts[0]?.x, wantX, 1e-6) && near(texts[0]?.y, wantY, 1e-6) && texts[0]?.y < w0.o.y && outside,
    `R14d SEDNO: odczyt przy NAJWYŻSZEJ na ekranie kresce głównej (domyślny kadr: ${rd?.deg}° — nie 0°, które leży na dole okręgu), na zewnątrz granicy (${texts[0]?.x?.toFixed?.(1)}, ${texts[0]?.y?.toFixed?.(1)})`);
  // Kamera obrócona (θ 1,9 rad) — najwyżej leży inna kreska główna; odczyt idzie za ekranem, nie za stałym kątem.
  const CAM_ROT = mkCam([450 * Math.sin(1.1) * Math.cos(1.9), 450 * Math.cos(1.1), 450 * Math.sin(1.1) * Math.sin(1.9)]);
  W0.cam = CAM_ROT; W0.camEpoch++; T.now += 16; h.ctx.calls.length = 0; h.frame();
  const d2 = holderOf(h.dbg(), 'v:v_kur'), w2 = topMajor(CAM_ROT, KC, rW);
  ok(w2?.deg === 270 && d2?.readout?.deg === 270 && near(d2?.readout?.x, +w2.o.x.toFixed(2), 0.006) && near(d2?.readout?.y, +w2.o.y.toFixed(2), 0.006),
    `R14e SEDNO: kamera obrócona (θ 1,9 rad) — odczyt przechodzi na kreskę ${d2?.readout?.deg}° (najwyższą na ekranie), nie zostaje przy stałym kącie`);
  // ∞ — bez okręgu i bez odczytu; tryb Y — odczyt przy każdym okręgu.
  W0.cam = CAM_FAR; W0.camEpoch++;
  select({ entity: 'p_nz' }); T.now += 16; h.ctx.calls.length = 0; h.frame();
  const nz = holderOf(h.dbg(), 'c:p_nz'), tNZ = ops(h.ctx.calls).filter((x) => x.op === 'text');
  select({ lead: 'v_kur' }); W0.tactical = true; T.now += 16; h.ctx.calls.length = 0; h.frame();
  const dY = h.dbg(), tY = ops(h.ctx.calls).filter((x) => x.op === 'text').map((x) => x.text).sort();
  const nzY = holderOf(dY, 'c:p_nz');
  W0.tactical = false;
  ok(nz?.circle === false && nz?.readout === null && tNZ.length === 0 && nzY?.circle === false && nzY?.readout === null
    && JSON.stringify(tY) === JSON.stringify(['1,0 AU', '1,0 AU', '11,5 AU', '11,5 AU']),
    `R14f SEDNO: ∞ (Nowa Ziemia, obserwatorium Lv4) — bez okręgu i bez odczytu; tryb Y — odczyt przy każdym okręgu (${tY.join(' · ')}), Nowa Ziemia bez`);
  // Język — separator dziesiętny z i18n (jak `NumberFormatLogic`).
  I18N.setLocale('en'); W0.camEpoch++; T.now += 16; h.ctx.calls.length = 0; h.frame();
  const tEN = ops(h.ctx.calls).filter((x) => x.op === 'text').map((x) => x.text);
  I18N.setLocale('pl');
  ok(JSON.stringify(tEN) === '["11.5 AU"]', `R14g SEDNO: język EN — „${tEN.join(', ')}” (separator dziesiętny z i18n, jak \`NumberFormatLogic\`)`);
  // R14h — przycięcie granicy do okna (czysta funkcja): kawałki w prostokącie, faza = długość biegu do początku kawałka.
  const CL = (runs, r) => (typeof RL?.clipRunsToRect === 'function' ? RL.clipRunsToRect(runs, r) : null);
  const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
  const cIn = CL([[10, 10, 50, 10, 50, 50]], box), cCross = CL([[-1e6, 50, 1e6, 50]], box), cOut = CL([[-50, -50, -10, -60]], box);
  const cBack = CL([[50, 50, 150, 50, 150, 80, 50, 80]], box);   // wychodzi w prawo i wraca
  ok(cIn?.length === 1 && JSON.stringify(cIn[0].pts) === '[10,10,50,10,50,50]' && cIn[0].offset === 0
    && cCross?.length === 1 && near(cCross[0].pts[0], 0, 1e-6) && near(cCross[0].pts[2], 100, 1e-6) && cCross[0].pts[1] === 50 && near(cCross[0].offset, 1e6, 1e-6)
    && cOut?.length === 0
    && cBack?.length === 2 && JSON.stringify(cBack[0].pts) === '[50,50,100,50]' && cBack[0].offset === 0
    && JSON.stringify(cBack[1].pts) === '[100,80,50,80]' && near(cBack[1].offset, 100 + 30 + 50, 1e-9),
    `R14h SEDNO: \`clipRunsToRect\` — bieg w oknie bez zmian (faza 0); bieg 2 mln px → kawałek okna z fazą ${cCross?.[0]?.offset}; poza oknem — nic; wyjście i powrót — dwa kawałki, faza drugiego = długość biegu do wejścia (${cBack?.[1]?.offset})`);
  // R14i — warstwa: kamera 2,7 j. od zaznaczonego Fobosa (okrąg 1 AU wokół kamery, częściowo za nią — jak K11 S5 w grze:
  // bieg ~1,7 mln px w rzucie): kropki tylko w oknie,
  // faza każdego kawałka = `lineDashOffset` z czystej funkcji na pełnym biegu, ścieżki obrysu w prostokącie okna.
  const opsBox = (calls) => {
    const st = { dash: '[]' }, res = []; let bb = null;
    const add = (x, y) => { if (!bb) bb = { x0: x, y0: y, x1: x, y1: y }; else { bb.x0 = Math.min(bb.x0, x); bb.y0 = Math.min(bb.y0, y); bb.x1 = Math.max(bb.x1, x); bb.y1 = Math.max(bb.y1, y); } };
    for (const c of calls) {
      if (c[0][0] === '=') st[c[0].slice(1)] = c[1];
      else if (c[0] === 'setLineDash') st.dash = JSON.stringify(c[1]);
      else if (c[0] === 'beginPath') bb = null;
      else if (c[0] === 'moveTo' || c[0] === 'lineTo') add(c[1], c[2]);
      else if (c[0] === 'stroke') res.push({ dash: st.dash, offset: st.lineDashOffset ?? 0, bbox: bb });
    }
    return res;
  };
  W0.cam = mkCam([-27.3, 1.3, 12], [-30, 0, 12]); W0.camEpoch++;
  select({ entity: 'p_fob' }); T.now += 16; h.ctx.calls.length = 0; h.frame();
  const dI = holderOf(h.dbg(), 'c:p_fob'), itI = h.radar?._last?.find((x) => x.selected);
  const vw = { x0: -4, y0: -4, x1: 1280 + 4, y1: 832.8 + 4 };
  const wantI = RL?.clipRunsToRect?.(itI?.ring?.runs ?? [], vw) ?? [];
  const bI = opsBox(h.ctx.calls).filter((x) => x.dash === '[0,6]');
  const inView = (b) => !!b && b.x0 >= vw.x0 - 1e-6 && b.x1 <= vw.x1 + 1e-6 && b.y0 >= vw.y0 - 1e-6 && b.y1 <= vw.y1 + 1e-6;
  ok(dI?.stop === 'ring' && dI?.ringLen > 1e5 && dI?.boundaryLen > 0 && dI?.boundaryLen <= 2 * (1280 + 832.8) && bI.length >= 1 && bI.length === wantI.length
    && bI.every((s, i) => near(s.offset, wantI[i].offset, 1e-6)) && bI.some((s) => s.offset > 0) && bI.every((s) => inView(s.bbox)),
    `R14i SEDNO: kamera 2,7 j. od Fobosa (jak K11 S5) — okrąg w rzucie ${dI?.ringLen} px, kropki na ${dI?.boundaryLen} px (tylko okno), ${bI.length} kawałek/ki, faza = długość biegu (${bI.map((s) => Math.round(s.offset)).join(', ')})`);
  W0.cam = CAM_FAR; W0.camEpoch++; select({ lead: 'v_kur' }); T.now += 16; h.frame();
  h.hud?.destroy?.();
  select({});
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
