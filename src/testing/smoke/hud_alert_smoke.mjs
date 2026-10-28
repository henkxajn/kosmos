// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — ARKUSZ HUD paczka B (B-2): alerty z treścią (`HudAlertLogic`, `HudLayer._alertView`, `HudRadarLayer`,
// `HudFocusLayer`, `HudLabelLayer`) — HUD_PLAN.md §4.5; D-HUD-4, D-HUD-11, D-HUD-12 (wymagania z bramki H1).
// Uruchom: node src/testing/smoke/hud_alert_smoke.mjs
//
// Wyłącznie LOGIKA (protokół od H2, HUD_PLAN §4.0). Moduły powstają w paczce B — import dynamiczny (brak modułu = pin
// pada, suita się nie przerywa). FAIL-FIRST (jedyny w paczce B, polecenie właściciela): A1–A2 mgła wojny — padają na drzewie
// `bc5cb2c` (moduł nie istnieje) i na mutancie przeciekającym tożsamość (`alertRevealTier` → „name” przy `rumor`).
//   A0  API
//   A1  mgła wojny (FAIL-CLOSED): poniżej `contact` (także brak / nieznana jakość) — „kontakt”, bez nazwy i bez typu;
//       od `contact` — nazwa (statek bez nazwy — typ); położenie: `unknown` — brak, `rumor` — ostatnio znane
//       ⚠ PRZECELOWANE (Finding 568, decyzja właściciela 2026-10-28 — wariant „b”): przy `contact` nazwa, nie typ — jedna
//       reguła z etykietą i rozwinięciem T1 (`VesselReveal.enemyVesselNamed`; spójność trzech powierzchni — `hud_labels_smoke` L10)
//   A2  warstwa (`HudLayer._alertView` — prawdziwy rzut): ta sama reguła na każdym poziomie wywiadu; `unknown` — intruz
//       niewidoczny, bez treści; `rumor` — odległość z położenia ostatnio znanego (nie żywego)
//   A3  liczby: odległość w AU z położeń logiki gry, namiar 000–359° od osi ekranu (0° = w górę, zgodnie z zegarem),
//       separator dziesiętny wg języka
//   A4  czas trwania na ZEGARZE SYMULACJI: dwa pulsy w ALERT_MS (drugi słabszy), linia treści gaśnie na końcu; pauza —
//       alert stoi (ten sam wiek, warstwa w spoczynku); brak zegara — start przy pierwszym odczycie; po ALERT_MS — koniec
//   A5  kolonia ∞ (bez granicy): alert przez etykietę — pasek w roli `alert` i linia treści na etykiecie kolonii; bez
//       błysku na granicy, bez pierścieni i bez wektora
//   A6  scalenie z celownikiem wroga: intruz z celownikiem — bez pierścieni HUD (jeden rysunek), wektor zostaje; obwiednia
//       alertu dla renderera 3D (`alertEnvelopeFor`) — w czasie alertu > 0, po nim 0, obiekt bez alertu 0; renderer czyta ją
//   A7  zakres alertu: wyłącznie obiekt z WIDOCZNYM radarem — zaznaczony statek prowadzący albo zaznaczone ciało z kolonią,
//       w trybie Y każdy własny; niezaznaczony poza Y — bez alertu i bez błysku; zadokowany i inny układ — bez alertu;
//       zaznaczona planeta ∞ przy księżycu z kolonią 1 AU — alert planety (w trybie Y — najbliższa kolonia pokrywająca,
//       reguła H1); świeża warstwa — błysk wyłącznie z alertu (na granicy zaznaczonego)
//   A8  jeden komplet na intruza: dwa widoczne radary (tryb Y) — dwa błyski, ale jeden komplet pierścieni, jeden wektor
//       i jedna linia treści — od zaznaczonego obiektu, bez zaznaczenia od najbliższego
// ⚠ PRZECELOWANE 2026-10-28 (ARKUSZ HUD B-Z — flagi HUD na stałe ON, ścieżki OFF usunięte): A6e — obiekt bez alertu
//   zamiast flagi OFF; A6f — celownik bez gałęzi flagi i bez czasu realnego; A7b — błysk czytany z rysunku warstwy (pole
//   `_flashes` ścieżki H1 usunięte); A7h — kontrola: błysk wyłącznie z alertu (dawna ścieżka H1 — błysk bez alertu —
//   usunięta). Przełączniki flag w keeperze usunięte (klucze nie istnieją).
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import * as T3 from '../../lib/three.core.js';
import EventBus from '../../core/EventBus.js';
import { getPrimaryRole } from '../../entities/Vessel.js';

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const src = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), 'utf8'); } catch { return ''; } };
const tryImport = async (p) => { try { return await import(p); } catch (e) { console.log('    (' + p + ': ' + e.message.split('\n')[0] + ')'); return null; } };

const AL = await tryImport('../../ui/HudAlertLogic.js');
const HL = await tryImport('../../ui/HudLayer.js');
const RLay = await tryImport('../../ui/HudRadarLayer.js');
const FLay = await tryImport('../../ui/HudFocusLayer.js');
const LLay = await tryImport('../../ui/HudLabelLayer.js');
const PJ = await tryImport('../../ui/HudProjection.js');
const { t, setLocale, getLocale } = await import('../../i18n/i18n.js');
const AU = GAME_CONFIG.AU_TO_PX;
const A = AL?.HUD_ALERT ?? {};
const call = (fn, ...a) => { try { return AL?.[fn]?.(...a); } catch (e) { return `ERR ${e.message}`; } };

const NAME = 'Rajder Alfa';           // nazwa intruza — świadek przecieku
const ROLE = 'Fregata Szturmowa';     // typ intruza — świadek przecieku

// ═══ A0 ══════════════════════════════════════════════════════════════════════
header('A0  API');
{
  const need = ['HUD_ALERT', 'HUD_ALERT_DEFAULTS', 'alertAge', 'alertLive', 'alertEnvelope', 'alertLineAlpha', 'flashHalfAngle',
    'screenBearingDeg', 'fmtBearing', 'distanceAU', 'alertRevealTier', 'alertFoeEndpoint', 'alertIdentity', 'alertContentText',
    'HudAlertStore', 'alertForFoe', 'tuneHudAlert', 'resetHudAlert'];
  const missing = need.filter((n) => AL?.[n] === undefined);
  ok(missing.length === 0, `A0a: \`HudAlertLogic\` — ${need.length} eksportów (brak: ${missing.join(', ') || '—'})`);
  ok(typeof HL?.HudLayer?.prototype?._alertView === 'function' && typeof HL?.HudLayer?.prototype?.alertEnvelopeFor === 'function',
    'A0b: warstwa HUD — widok alertów (`_alertView`) i obwiednia dla renderera 3D (`alertEnvelopeFor`)');
}

// ═══ A1 ══════════════════════════════════════════════════════════════════════
header('A1  mgła wojny — FAIL-CLOSED (fail-first)');
{
  setLocale('pl');
  const anonQ = [undefined, null, 'unknown', 'rumor', 'RUMOR', 'Contact', 'secret', 42];
  const anonText = anonQ.map((q) => call('alertContentText', { quality: q, roleLabel: ROLE, name: NAME, distAU: 3.24, bearingDeg: 45 }, { t, locale: 'pl' }));
  ok(anonQ.every((q) => call('alertRevealTier', q) === 'anon'),
    `A1a SEDNO: jakość poniżej \`contact\`, brak jakości i jakość nieznana (${anonQ.map(String).join(', ')}) — poziom „anon”`);
  ok(anonText.every((s) => typeof s === 'string' && s.startsWith(t('hudAlert.contact')) && !s.includes(NAME) && !s.includes(ROLE)),
    `A1b SEDNO: treść bez nazwy i bez typu — „${anonText[3]}”`);
  const cText = call('alertContentText', { quality: 'contact', roleLabel: ROLE, name: NAME, distAU: 3.24, bearingDeg: 45 }, { t, locale: 'pl' });
  ok(typeof cText === 'string' && cText.startsWith(NAME) && !cText.includes(ROLE), `A1c SEDNO (568): \`contact\` — nazwa (jak etykieta): „${cText}”`);
  const dText = call('alertContentText', { quality: 'detailed', roleLabel: ROLE, name: NAME, distAU: 3.24, bearingDeg: 45 }, { t, locale: 'pl' });
  ok(typeof dText === 'string' && dText.startsWith(NAME), `A1d: \`detailed\` — nazwa: „${dText}”`);
  ok(call('alertIdentity', { quality: 'contact', roleLabel: ROLE, name: null }, t) === ROLE
    && call('alertIdentity', { quality: 'detailed', roleLabel: ROLE, name: null }, t) === ROLE
    && call('alertIdentity', { quality: 'contact', roleLabel: null, name: null }, t) === t('hudAlert.contact'),
    'A1e: statek bez nazwy przy `contact` / `detailed` — typ; bez nazwy i bez typu — „kontakt”');
  const live = { x: 700, y: 30 }, last = { x: 640, y: -20 };
  const ep = (q, pl = last) => call('alertFoeEndpoint', { livePos: live, quality: q, positionLastKnown: pl });
  ok(ep('unknown') === null && ep(undefined) === null && ep(null) === null, 'A1f SEDNO: `unknown` i brak jakości — brak położenia (intruz niewidoczny)');
  const r = ep('rumor');
  ok(!!r && r.x === last.x && r.y === last.y && ep('rumor', null) === null, 'A1g SEDNO: `rumor` — położenie OSTATNIO ZNANE (nie żywe); bez niego — brak');
  ok(ep('contact')?.x === live.x && ep('detailed')?.y === live.y, 'A1h: `contact` i `detailed` — położenie żywe');
  setLocale('en');
  ok(call('alertIdentity', { quality: 'rumor', roleLabel: ROLE, name: NAME }, t) === t('hudAlert.contact') && t('hudAlert.contact') !== 'hudAlert.contact',
    `A1i: EN — „${t('hudAlert.contact')}” (klucz w obu słownikach)`);
  setLocale('pl');
}

// ═══ Świat (stub) — prawdziwy `HudLayer` z podwarstwami gry ═══════════════════════════════════════════════════════
const K = globalThis.window.KOSMOS ?? (globalThis.window.KOSMOS = {});
const mkCam = (pos, look) => { const c = new T3.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000); c.position.set(...pos); c.lookAt(...look); c.updateMatrixWorld(); return c; };
const CAM = mkCam([68, 40, 30], [68, 0, 0]);
const VIEW = () => ({ view: CAM.matrixWorldInverse.elements.slice(), proj: CAM.projectionMatrix.elements.slice(), fovDeg: 55, cssW: 1600, cssH: 1041, worldPerAU: 11 });
const S = (px) => px / 10;            // px logiki gry → j. świata (ThreeRenderer)
// Ciała (px logiki gry): Nowa Ziemia — kolonia gracza z obserwatorium ∞; Fobos — kolonia z zasięgiem 1 AU; Księżyc NZ — kolonia
// z zasięgiem 1 AU tuż obok planety ∞ (A7e).
const ENT = { p_nz: { id: 'p_nz', type: 'planet', name: 'Nowa Ziemia', x: 682, y: 0 }, p_fob: { id: 'p_fob', type: 'planet', name: 'Fobos', x: 300, y: 300 },
  p_moon: { id: 'p_moon', type: 'moon', name: 'Księżyc NZ', x: 682, y: 60, parentPlanetId: 'p_nz' } };
const BODY = (id) => (ENT[id] ? { x: S(ENT[id].x), y: 0, z: S(ENT[id].y), r: id === 'p_moon' ? 0.1 : 0.3 } : null);
const OBS = { p_nz: Infinity, p_fob: 1, p_moon: 1 };
const COLS = [
  { planetId: 'p_nz', name: 'Nowa Ziemia', planet: { ...ENT.p_nz, systemId: 'sys_home' }, systemId: 'sys_home', civSystem: { population: 400, freePops: 20 } },
  { planetId: 'p_fob', name: 'Fobos', planet: { ...ENT.p_fob, systemId: 'sys_home' }, systemId: 'sys_home', civSystem: { population: 40, freePops: 2 } },
  { planetId: 'p_moon', name: 'Księżyc NZ', planet: { ...ENT.p_moon, systemId: 'sys_home' }, systemId: 'sys_home', civSystem: { population: 20, freePops: 1 } },
];
const V = (id, o = {}) => ({ id, shipId: 'hull_small', serviceState: 'active', systemId: 'sys_home', isWreck: false, modules: [],
  fuel: { current: 10, max: 10 }, position: { x: 0, y: 0, state: 'in_transit', dockedAt: null }, ...o });
const W0 = { sim: 1000, lead: null, ids: [], entity: null, camEpoch: 1, intel: { v_foe: 'contact' }, lastKnown: { x: 640, y: -20 }, cross: new Set(), tactical: false };
const VESSELS = [
  V('v_own', { name: 'Kurier', position: { x: 600, y: 10, state: 'in_transit', dockedAt: null } }),
  V('v_two', { name: 'Smok', position: { x: 520, y: 60, state: 'in_transit', dockedAt: null } }),
  V('v_dock', { name: 'Fracht', position: { x: 682, y: 0, state: 'docked', dockedAt: 'p_nz' } }),
  V('v_foe', { name: NAME, ownerEmpireId: 'emp_1', owner: 'emp_1', isEnemy: true, position: { x: 700, y: 30, state: 'in_transit', dockedAt: null } }),
  V('v_far', { name: 'Daleki', ownerEmpireId: 'emp_1', owner: 'emp_1', isEnemy: true, systemId: 'sys_067', position: { x: 610, y: 12, state: 'in_transit', dockedAt: null } }),
];
const vesselBy = (id) => VESSELS.find((v) => v.id === id) ?? null;
const spriteOf = (id) => {
  const v = vesselBy(id);
  if (!v) return null;
  const q = v.isEnemy ? W0.intel[id] ?? 'unknown' : 'own';
  const p = q === 'rumor' ? W0.lastKnown : v.position;            // renderer: sprite przy `rumor` zamrożony na ostatnio znanym
  return { x: S(p.x), y: 0.3, z: S(p.y) };
};
const setWorld = () => {
  globalThis.innerWidth = 1600; globalThis.innerHeight = 1041;
  Object.assign(K, {
    civMode: true, activeSystemId: 'sys_home', uiScale: 1.25, planetGlobeOpen: false, uiPrefs: {}, homePlanet: { id: 'p_nz' },
    uiManager: {
      _cleanView: false, overlayManager: { isAnyOpen: () => false },
      getSelectedVesselIds: () => [...W0.ids], getSelectedVesselId: () => W0.lead,
      get _selectedEntity() { return W0.entity ? { id: W0.entity } : null; }, getSelectedFleetId: () => null,
      _bottomContext: { _cardRect: null }, _mapSurface: () => null,
    },
    threeRenderer: {
      _cleanView: false, _renderingEnabled: true, _contextLost: false, _pingedEnemyId: null, renderer: { getPixelRatio: () => 1.5 },
      _hoverPlanetId: null, _planets: new Map([['p_nz', {}], ['p_fob', {}]]), _moons: new Map(),
      get _vessels() { return new Map(VESSELS.filter((v) => v.systemId === 'sys_home').map((v) => [v.id, { sprite: { visible: !(v.isEnemy && (W0.intel[v.id] ?? 'unknown') === 'unknown') } }])); },
      get _enemyAlertMarkers() { return new Map([...W0.cross].map((id) => [id, {}])); },
      getCameraMoveEpoch: () => W0.camEpoch, getHudView: VIEW,
      getBodyWorldInfo: BODY, getVesselWorldPosition: spriteOf, getVesselWorldInfo: (id) => (spriteOf(id) ? { ...spriteOf(id), r: 0.02 } : null),
      _isOnBodyDisc: () => false, _getVesselAtScreen: () => null,
    },
    entityManager: { get: (id) => ENT[id] ?? null, getByType: (tp) => Object.values(ENT).filter((e) => e.type === tp) },
    colonyManager: { getPlayerColonies: () => [...COLS], getAllColonies: () => [...COLS], getColony: (id) => COLS.find((c) => c.planetId === id) ?? null },
    stationSystem: { getAllStations: () => [] },
    observatorySystem: { getVesselDetectionRangeAU: (c) => OBS[c?.planetId] ?? 0 },
    vesselManager: { getAllVessels: () => [...VESSELS], getVessel: vesselBy, isImmobilized: () => false, getVesselSensorRangeAU: () => 2.5 },
    intelSystem: { getVesselContact: (id) => (W0.intel[id] ? { quality: W0.intel[id], positionLastKnown: { ...W0.lastKnown } } : null) },
    techSystem: { getMultiplier: () => 1 },
    timeSystem: { get simClockMs() { return W0.sim; }, gameTime: 120 },
    tacticalMode: { get isActive() { return W0.tactical; } },
    leftOutliner: { getReservedWidth: () => 150 }, rightOutliner: { getReservedWidth: () => 150 }, tacticalDock: { getReservedHeight: () => 0 },
    starSystemManager: { switchActiveSystem: () => true },
  });
};
setWorld();
const mkCtx = () => new Proxy({ calls: [] }, {
  get(o, p) { if (p === 'calls') return o.calls; if (p in o) return o[p]; if (p === 'measureText') return (s) => ({ width: String(s).length * 6 }); return (...a) => { o.calls.push(String(p)); }; },
  set(o, p, v) { o[p] = v; return true; },
});
const mkHud = () => {
  const ctx = mkCtx(); const cv = { width: 0, height: 0, getContext: () => ctx };
  const hud = HL?.HudLayer ? new HL.HudLayer(cv, { autoStart: false }) : null;   // domyślne podwarstwy gry
  const find = (C) => hud?._sublayers?.find?.((s) => C && s instanceof C) ?? null;
  return { ctx, hud, radar: find(RLay?.HudRadarLayer), focus: find(FLay?.HudFocusLayer), labels: find(LLay?.HudLabelLayer),
    frame: (now) => (hud ? hud.frame(now) : null), destroy: () => hud?.destroy?.() };
};
const projector = () => (PJ?.makeHudProjector ? PJ.makeHudProjector({ ...VIEW(), uiScale: 1.25 }) : null);
const scr = (w) => { const v = new T3.Vector3(w.x, w.y, w.z).project(CAM); return { x: (v.x * 0.5 + 0.5) * 1600 / 1.25, y: (-v.y * 0.5 + 0.5) * 1041 / 1.25 }; };

// ═══ A2 ══════════════════════════════════════════════════════════════════════
header('A2  warstwa — treść wg wywiadu (prawdziwy rzut)');
{
  const H = mkHud();
  const proj = projector();
  const view = (q) => {
    W0.intel.v_foe = q;
    const att = { alerts: [{ id: 'v:v_own|v_foe', kind: 'vessel', holderKey: 'v:v_own', holderId: 'v_own', foeId: 'v_foe', systemId: 'sys_home',
      angle: 0, infinite: false, age: 100, env: 1, lineAlpha: 1 }] };
    try { return H.hud?._alertView?.({ K, att }, proj)?.[0] ?? null; } catch (e) { return { err: e.message }; }
  };
  const vu = view('unknown');
  ok(!!vu && vu.visible === false && vu.text == null && vu.foeScr == null, 'A2a SEDNO: `unknown` — intruz niewidoczny: bez położenia na ekranie i bez treści');
  const vr = view('rumor');
  const dLast = Math.hypot(W0.lastKnown.x - 600, W0.lastKnown.y - 10) / AU;
  const dLive = Math.hypot(700 - 600, 30 - 10) / AU;
  ok(!!vr && vr.visible === true && typeof vr.text === 'string' && vr.text.startsWith(t('hudAlert.contact')) && !vr.text.includes(NAME)
    && !vr.text.includes(t(`fleetPicture.role.${getPrimaryRole(vesselBy('v_foe'))}`)),
    `A2b SEDNO: \`rumor\` — „${vr?.text}” (bez nazwy i bez typu)`);
  const fmt1 = (v) => v.toFixed(1).replace('.', ',');
  ok(!!vr?.text && vr.text.includes(`${fmt1(dLast)} AU`) && fmt1(dLast) !== fmt1(dLive),
    `A2c SEDNO: \`rumor\` — odległość z położenia ostatnio znanego (${fmt1(dLast)} AU), nie żywego (${fmt1(dLive)} AU)`);
  const roleTxt = t(`fleetPicture.role.${getPrimaryRole(vesselBy('v_foe'))}`);
  const vc = view('contact');
  ok(!!vc?.text && vc.text.startsWith(NAME) && !vc.text.includes(roleTxt), `A2d SEDNO (568): \`contact\` — nazwa (jak etykieta), bez typu (${roleTxt}): „${vc?.text}”`);
  const vd = view('detailed');
  ok(!!vd?.text && vd.text.startsWith(NAME), `A2e: \`detailed\` — nazwa: „${vd?.text}”`);
  W0.intel.v_foe = 'contact';
  H.destroy();
}

// ═══ A3 ══════════════════════════════════════════════════════════════════════
header('A3  liczby — odległość w AU, namiar od osi ekranu');
{
  ok(near(call('distanceAU', { x: 0, y: 0 }, { x: 3 * AU, y: 4 * AU }, AU), 5) && call('distanceAU', null, { x: 1, y: 1 }, AU) === null,
    'A3a: odległość z położeń logiki gry (px) / AU_TO_PX — trójkąt 3-4-5 → 5,0 AU');
  const o = { x: 100, y: 100 };
  const b = (dx, dy) => call('screenBearingDeg', o, { x: 100 + dx, y: 100 + dy });
  ok(b(0, -10) === 0 && b(10, 0) === 90 && b(0, 10) === 180 && b(-10, 0) === 270 && b(10, -10) === 45,
    'A3b: namiar 0° = w górę ekranu, rośnie zgodnie z ruchem wskazówek zegara (90° w prawo, 180° w dół, 270° w lewo)');
  ok(b(-0.001, -10) === 0 && call('screenBearingDeg', o, o) === null, 'A3c: 359,99° → 000° (bez „360°”); ten sam punkt — brak namiaru');
  ok(call('fmtBearing', 5) === '005°' && call('fmtBearing', 45) === '045°' && call('fmtBearing', 359) === '359°', 'A3d: zapis trzycyfrowy 005° / 045° / 359°');
  const pl = call('alertContentText', { quality: 'contact', roleLabel: ROLE, distAU: 3.25, bearingDeg: 9 }, { t, locale: 'pl' });
  const en = call('alertContentText', { quality: 'contact', roleLabel: ROLE, distAU: 3.25, bearingDeg: 9 }, { t, locale: 'en' });
  ok(pl === `${ROLE} · 3,3 AU · 009°` || pl === `${ROLE} · 3,2 AU · 009°`, `A3e: PL — przecinek dziesiętny: „${pl}”`);
  ok(/ · 3\.[23] AU · 009°$/.test(en ?? ''), `A3f: EN — kropka dziesiętna: „${en}”`);
  // Namiar w warstwie liczony z położeń NA EKRANIE (rzut kamery), odległość — z logiki gry.
  const H = mkHud();
  const vc = H.hud?._alertView?.({ K, att: { alerts: [{ id: 'x', kind: 'vessel', holderId: 'v_own', foeId: 'v_foe', systemId: 'sys_home', env: 1, lineAlpha: 1 }] } }, projector())?.[0];
  const hs = scr(spriteOf('v_own')), fs = scr(spriteOf('v_foe'));
  const exp = call('screenBearingDeg', hs, fs);
  ok(!!vc?.text && vc.text.endsWith(call('fmtBearing', exp)), `A3g: namiar w treści = namiar rzutu kamery (${call('fmtBearing', exp)}) — „${vc?.text}”`);
  H.destroy();
}

// ═══ A4 ══════════════════════════════════════════════════════════════════════
header('A4  czas trwania — zegar symulacji, pauza = stoi');
{
  const T = A.ALERT_MS, n = A.ALERT_PULSES;
  const env = (age) => call('alertEnvelope', age);
  ok(T > 0 && n === 2 && env(0) === 1 && near(env(T / n), A.ALERT_PULSE2_GAIN) && env(T) === 0 && env(-1) === 0,
    `A4a: ${n} pulsy w ALERT_MS (${T} ms zegara symulacji): szczyt 1 i ${A.ALERT_PULSE2_GAIN}, po czasie — 0`);
  const mid = env(T / (2 * n)), late = env(T / n - 1);
  ok(mid > 0 && mid < 1 && late < 0.05, 'A4b: każdy puls gaśnie od szczytu do zera');
  ok(call('alertLineAlpha', 0) === 1 && call('alertLineAlpha', T * A.LINE_FADE_FROM) === 1 && call('alertLineAlpha', T * 0.95) < 1 && call('alertLineAlpha', T) === 0,
    'A4c: linia treści — pełne krycie do LINE_FADE_FROM, potem gaśnie');
  const st = AL?.HudAlertStore ? new AL.HudAlertStore() : null;
  st?.push({ id: 'a', foeId: 'f' }, 1000);
  const f1 = st?.frame(1400), f2 = st?.frame(1400);
  ok(f1?.[0]?.age === 400 && f2?.[0]?.age === 400 && f1[0].env === f2[0].env, 'A4d SEDNO: pauza (zegar symulacji stoi) — alert stoi: ten sam wiek i obwiednia');
  ok(st?.frame(1000 + T)?.length === 0 && st?.size === 0, 'A4e: po ALERT_MS zegara — alert usunięty');
  st?.push({ id: 'b', foeId: 'f' }, null);
  const g0 = st?.frame(null), g1 = st?.frame(7000), g2 = st?.frame(7100);
  ok(g0?.[0]?.age === 0 && g1?.[0]?.age === 0 && g2?.[0]?.age === 100, 'A4f: alert sprzed pierwszego tiku (brak zegara) — stoi na początku; start przy pierwszym odczycie zegara');
  // Warstwa: zegar stoi → klatki w spoczynku mimo upływu czasu realnego; zegar rusza → klatki. Zaznaczony „Kurier” (zakres alertu).
  setWorld(); W0.sim = 20_000; W0.intel.v_foe = 'contact'; W0.lead = 'v_own'; W0.ids = ['v_own']; W0.entity = null; W0.tactical = false;
  const H = mkHud();
  H.frame(100);
  EventBus.emit('vessel:proximityEnter', { vesselAId: 'v_own', vesselBId: 'v_foe', distanceAU: 1.2, sameFaction: false });
  const s1 = H.frame(116);
  // Przejście poziomu uwagi (czas realny, FADE_MS) i pojawienie się etykiety mogą rysować kilka klatek — potem spoczynek.
  let real = 132, settled = null;
  for (let i = 0; i < 40 && settled == null; i++, real += 16) if (H.frame(real) === 'idle') settled = real;
  const a0 = H.hud?.alerts?.frame(W0.sim)?.[0];
  const s2 = H.frame(real + 500), s3 = H.frame(real + 3000);
  ok(s1 === 'drawn' && settled != null && a0?.age === 0 && s2 === 'idle' && s3 === 'idle',
    `A4g SEDNO: pauza — alert stoi (wiek ${a0?.age}), po przejściu uwagi spoczynek mimo upływu czasu realnego (${settled != null ? `od ${settled} ms` : 'brak'} / ${s2} / ${s3})`);
  W0.sim += 400;
  const s4 = H.frame(916);
  ok(s4 === 'drawn' && H.hud?.alerts?.frame(W0.sim)?.[0]?.age === 400, 'A4h: zegar ruszył — alert się starzeje (klatka)');
  W0.sim += T;
  H.frame(932);
  ok((H.hud?.alerts?.size ?? 1) === 0, 'A4i: po ALERT_MS zegara symulacji — koniec alertu');
  H.destroy();
}

// ═══ A5 ══════════════════════════════════════════════════════════════════════
header('A5  kolonia ∞ — alert przez etykietę');
{
  setWorld(); W0.sim = 30_000; W0.intel.v_foe = 'contact'; W0.lead = null; W0.ids = []; W0.entity = 'p_nz'; W0.tactical = false;   // zaznaczona NZ
  const H = mkHud();
  H.frame(100);
  EventBus.emit('vessel:detectionChanged', { vesselId: 'v_foe', detected: true, vessel: vesselBy('v_foe') });
  const rec = H.hud?.alerts?.frame(W0.sim)?.[0];
  ok(rec?.kind === 'colony' && rec?.holderId === 'p_nz' && rec?.infinite === true, `A5a: wykrycie przez obserwatorium ∞ — alert kolonii Nowa Ziemia z zasięgiem ∞ (${rec?.kind}, ${rec?.holderId}, ∞ ${rec?.infinite})`);
  H.frame(116);
  const rd = H.radar?.debug?.();
  ok((rd?.flashes?.length ?? H.radar?._lastFlashes?.length ?? 0) === 0, 'A5b KONTROLA: bez granicy — bez błysku na granicy (jak w H1)');
  const fd = H.focus?.debug?.();
  ok((fd?.rings?.length ?? -1) === 0 && (fd?.vectors?.length ?? -1) === 0, 'A5c SEDNO: bez pierścieni na intruzie i bez wektora (alert przez etykietę)');
  const ld = H.labels?.debug?.();
  const col = (ld?.labels ?? []).find((l) => l.key === 'c:p_nz' || (l.kind === 'group' && /NOWA ZIEMIA/.test(l.text?.[0] ?? '')));
  ok(!!col && col.alertBar > 0, `A5d SEDNO: etykieta kolonii — pasek alertu w roli \`alert\` (${col?.alertBar})`);
  ok(!!col && col.alertLine === true && col.text.some((s) => / AU · \d{3}°$/.test(s)), `A5e SEDNO: etykieta kolonii — linia treści (${col?.text?.find((s) => /AU/.test(s))})`);
  W0.sim += A.ALERT_MS;
  H.frame(132);
  const ld2 = H.labels?.debug?.();
  const col2 = (ld2?.labels ?? []).find((l) => l.key === col?.key);
  ok(col?.alertBar > 0 && !!col2 && !col2.alertBar && !col2.alertLine, 'A5f: po ALERT_MS — pasek i linia znikają');
  H.destroy();
}

// ═══ A6 ══════════════════════════════════════════════════════════════════════
header('A6  scalenie z celownikiem wroga');
{
  setWorld(); W0.sim = 40_000; W0.intel.v_foe = 'contact'; W0.cross = new Set(); W0.lead = 'v_own'; W0.ids = ['v_own']; W0.entity = null; W0.tactical = false;
  const H = mkHud();
  H.frame(100);
  EventBus.emit('vessel:proximityEnter', { vesselAId: 'v_own', vesselBId: 'v_foe', distanceAU: 1.2, sameFaction: false });
  H.frame(116);
  const f1 = H.focus?.debug?.();
  ok(f1?.rings?.length === 1 && f1?.vectors?.length === 1, `A6a: intruz bez celownika — pierścienie HUD i wektor (${f1?.rings?.length} / ${f1?.vectors?.length})`);
  W0.cross = new Set(['v_foe']); W0.camEpoch++;
  H.frame(132);
  const f2 = H.focus?.debug?.();
  ok(f2?.rings?.length === 0 && f2?.vectors?.length === 1, `A6b SEDNO: intruz z celownikiem wroga — jeden rysunek: bez pierścieni HUD, wektor zostaje (${f2?.rings?.length} / ${f2?.vectors?.length})`);
  const e1 = H.hud?.alertEnvelopeFor?.('v_foe');
  W0.sim += A.ALERT_MS / 2;
  const e2 = H.hud?.alertEnvelopeFor?.('v_foe');
  ok(e1 === 1 && e2 > 0 && e2 < 1, `A6c: obwiednia dla celownika w czasie alertu (${e1} → ${e2?.toFixed?.(3)})`);
  W0.sim += A.ALERT_MS;
  ok(H.hud?.alertEnvelopeFor?.('v_foe') === 0, 'A6d: po alercie — 0 (celownik wraca do pulsu okresowego)');
  ok(H.hud?.alertEnvelopeFor?.('v_own') === 0 && H.hud?.alertEnvelopeFor?.('v_nope') === 0,
    'A6e: obiekt bez alertu (własny statek, nieznany id) — 0 (celownik w pulsie okresowym)');
  const tr = strip(src('../../renderer/ThreeRenderer.js'));
  const i = tr.indexOf('\n  _syncEnemyAlertMarkers() {'), body = i < 0 ? '' : tr.slice(i, tr.indexOf('\n  }\n', i));
  ok(/alertEnvelopeFor\?\.\(vid\)/.test(body) && /simClockMs\(\)/.test(body) && !/isHudAttentionOn|performance\.now|Date\.now/.test(body),
    'A6f: renderer 3D — celownik czyta obwiednię alertu i pulsuje na zegarze symulacji (pauza — stoi; bez gałęzi flagi i czasu realnego — B-Z)');
  W0.cross = new Set();
  H.destroy();
}

// ═══ A7 ══════════════════════════════════════════════════════════════════════
header('A7  zakres alertu — zaznaczony obiekt, w trybie Y każdy własny');
{
  setWorld(); W0.sim = 50_000; W0.intel.v_foe = 'contact'; W0.tactical = false;
  W0.lead = 'v_own'; W0.ids = ['v_own']; W0.entity = null;
  const H = mkHud();
  const prox = (a, b, d = 1.2) => EventBus.emit('vessel:proximityEnter', { vesselAId: a, vesselBId: b, distanceAU: d, sameFaction: false });
  const det = () => EventBus.emit('vessel:detectionChanged', { vesselId: 'v_foe', detected: true, vessel: vesselBy('v_foe') });
  const recs = () => H.hud?.alerts?.frame(W0.sim) ?? [];
  const clear = () => H.hud?.alerts?.clear?.();
  H.frame(100);
  prox('v_own', 'v_foe');
  ok(recs().some((a) => a.holderId === 'v_own' && a.foeId === 'v_foe'), 'A7a SEDNO: zaznaczony statek — alert (jego radar jest widoczny)');
  clear();
  prox('v_two', 'v_foe');
  H.frame(108);
  ok((H.hud?.alerts?.size ?? -1) === 0 && (H.radar?.debug?.()?.flashes?.length ?? -1) === 0,
    'A7b SEDNO: statek NIEzaznaczony poza trybem Y — bez alertu i bez błysku (jego radar jest niewidoczny)');
  W0.tactical = true; W0.lead = null; W0.ids = [];
  H.frame(116);
  prox('v_own', 'v_foe'); prox('v_two', 'v_foe');
  const y = recs();
  ok(y.length === 2 && y.some((a) => a.holderId === 'v_own') && y.some((a) => a.holderId === 'v_two'),
    `A7c SEDNO: tryb Y — alert dla każdego własnego statku (${y.map((a) => a.holderId).join(', ') || '—'})`);
  clear();
  prox('v_dock', 'v_foe', 0.2); prox('v_own', 'v_far', 0.2);
  ok((H.hud?.alerts?.size ?? -1) === 0, 'A7d: tryb Y — zadokowany statek i obcy z innego układu — bez alertu');
  W0.tactical = false;
  H.frame(132);
  det();
  ok((H.hud?.alerts?.size ?? -1) === 0, 'A7e SEDNO: kolonia ∞ NIEzaznaczona poza trybem Y — bez alertu');
  // Intruz tuż przy księżycu (kolonia 1 AU), planeta macierzysta księżyca ma zasięg ∞.
  const foe = vesselBy('v_foe'), keep = { ...foe.position };
  foe.position = { ...foe.position, x: 684, y: 57 };
  W0.entity = 'p_nz';
  H.frame(148);
  det();
  const nz = recs();
  ok(nz.length === 1 && nz[0].holderId === 'p_nz' && nz[0].infinite === true,
    `A7f SEDNO: zaznaczona Nowa Ziemia (∞), intruz przy jej księżycu z kolonią 1 AU — alert zaznaczonej planety ∞ (${nz.map((a) => `${a.holderId} ∞ ${a.infinite}`).join(', ') || '—'})`);
  clear();
  W0.entity = null; W0.tactical = true;
  H.frame(164);
  det();
  const ym = recs();
  ok(ym.length === 1 && ym[0].holderId === 'p_moon' && ym[0].infinite === false,
    `A7g: tryb Y — ta sama scena: najbliższa kolonia pokrywająca (księżyc 1 AU, reguła H1) (${ym.map((a) => a.holderId).join(', ') || '—'})`);
  foe.position = keep;
  H.destroy();
  // Kontrola na świeżej warstwie (bez alertów z wcześniejszych scen): błysk na granicy rysuje WYŁĄCZNIE alert — dawna
  // ścieżka H1 (błysk 0,8 s czasu realnego na granicy niezaznaczonego, bez alertu) usunięta w B-Z.
  W0.tactical = false; W0.entity = null; W0.lead = 'v_own'; W0.ids = ['v_own'];
  const H0 = mkHud();
  H0.frame(180);
  prox('v_own', 'v_foe');
  H0.frame(196);
  ok((H0.hud?.alerts?.size ?? 0) === 1 && (H0.radar?.debug?.()?.flashes?.length ?? 0) === 1 && H0.radar?._flashes === undefined,
    `A7h KONTROLA: zaznaczony statek — alert i jeden błysk na JEGO granicy; pole \`_flashes\` ścieżki H1 usunięte (${H0.hud?.alerts?.size} / ${H0.radar?.debug?.()?.flashes?.length})`);
  H0.destroy();
}

// ═══ A8 ══════════════════════════════════════════════════════════════════════
header('A8  jeden komplet na intruza (tryb Y — dwa obiekty gracza)');
{
  setWorld(); W0.sim = 60_000; W0.intel.v_foe = 'contact'; W0.tactical = true; W0.lead = null; W0.ids = []; W0.entity = null; W0.cross = new Set();
  const H = mkHud();
  H.frame(100);
  const prox = (a) => EventBus.emit('vessel:proximityEnter', { vesselAId: a, vesselBId: 'v_foe', distanceAU: 1.2, sameFaction: false });
  prox('v_own'); prox('v_two');
  H.frame(116);
  const fmt1 = (v) => v.toFixed(1).replace('.', ',');
  const dOwn = fmt1(Math.hypot(700 - 600, 30 - 10) / AU), dTwo = fmt1(Math.hypot(700 - 520, 30 - 60) / AU);
  const foeLines = (ld) => (ld?.labels ?? []).filter((l) => l.alertLine && (l.kind === 'enemy' || l.kind === 'alert'));
  const fd = H.focus?.debug?.(), rd = H.radar?.debug?.(), fl = foeLines(H.labels?.debug?.());
  ok((H.hud?.alerts?.size ?? 0) === 2 && rd?.flashes?.length === 2,
    `A8a: dwa alerty — dwa błyski, po jednym na granicy każdego widocznego radaru (${H.hud?.alerts?.size} / ${rd?.flashes?.length})`);
  ok(fd?.rings?.length === 1 && fd?.vectors?.length === 1 && fd.rings[0].id === 'v:v_own|v_foe' && fd.vectors[0].id === 'v:v_own|v_foe',
    `A8b SEDNO: jeden komplet pierścieni i jeden wektor — od najbliższego obiektu, Kuriera (${fd?.rings?.map((r) => r.id).join(', ')} / ${fd?.vectors?.map((v) => v.id).join(', ')})`);
  ok(dOwn !== dTwo && fl.length === 1 && fl[0].text.some((s) => s.includes(`${dOwn} AU`)),
    `A8c SEDNO: jedna linia treści pod intruzem — odległość od najbliższego (${dOwn} AU, nie ${dTwo} AU): ${fl.map((l) => l.text.join(' / ')).join(' | ') || '—'}`);
  W0.lead = 'v_two'; W0.ids = ['v_two']; W0.camEpoch++;
  H.frame(132);
  const fd2 = H.focus?.debug?.(), fl2 = foeLines(H.labels?.debug?.());
  ok(fd2?.vectors?.length === 1 && fd2.vectors[0].id === 'v:v_two|v_foe' && fl2.length === 1 && fl2[0].text.some((s) => s.includes(`${dTwo} AU`)),
    `A8d: zaznaczony obiekt wygrywa z bliższym — wektor i treść od zaznaczonego Smoka (${fd2?.vectors?.map((v) => v.id).join(', ')}; ${fl2.map((l) => l.text.join(' / ')).join(' | ') || '—'})`);
  H.destroy();
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
