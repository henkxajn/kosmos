// Keeper ARC GALAXY, krok G2-1 — OŚ CZASU LOTU między układem a płytą (docs/design/GALAXY_PLAN.md §4 G2; D-GX-14).
// Protokół lekki F8: keeper wyłącznie dla LOGIKI (fazy, czasy, stan końcowy, neutralizacja lerpów, orkiestracja trybu) — bez
// pinów na stałych rysunku i bez kontroli na poprzednim commicie.
//   L0  API modułu `GalaxyFlightLogic`
//   L1  łagodzenie: końce 0 / 1, warianty 0 (liniowe), 1 (smoothstep), 2 (smootherstep — płaskie na końcach)
//   L2  plan wylotu: czas domyślny 1,4 s, przejście logiczne po zgaśnięciu HUD (0,2 s), nazwy galaktyki od 0,9 T
//   L3  wylot t = 0 — poza startowa, HUD w pełni, układ w pełni, płyta zgaszona, prawdziwe gwiazdy nieba w pełni, nazwy 0
//   L4  wylot t = T — poza docelowa (preset galaktyki), płyta w pełni, prawdziwe gwiazdy nieba 0
//   L5  JEDEN ZBIÓR gwiazd: płyta + prawdziwe gwiazdy nieba = 1 w każdej chwili wylotu (nigdy podwójnie)
//   L6  przechył wyłącznie w ostatniej tercji; dystans rośnie monotonicznie (skala log.); układ gaśnie w oknie 0,15–0,55
//   L7  plan wlotu: przejście logiczne 0,45 T — płyta i prawdziwe gwiazdy nieba na ZERZE w tej chwili
//   L8  wlot z przesunięciem początku: położenie kamery WZGLĘDEM gwiazdy celu ciągłe przez przełączenie
//   L9  wlot t = T — poza docelowa; HUD układu wraca w ostatnich 0,2 s
//   L10 Esc → STAN KOŃCOWY (`flightEndState`) = poza docelowa co do bitu (oba kierunki)
//   L11 lot włączony: pokrętło FLIGHT > 0 i bez `prefers-reduced-motion`; siatka sub-pikselowa schowana
//   L12 `applyFlightPose` neutralizuje lerpy kontrolera (prawdziwy prototyp `ThreeCameraController`); `frameSystem` przykryty
//   L13 orkiestracja `GalaxyModeController` na atrapie świata: wylot (przejście logiczne po 0,2 s), Esc w trakcie, wlot powrotny
//       = migawka 1:1, wlot w INNY układ (kadr nowego układu z `switchSystem` przykryty pozą lotu, koniec = kadr), FLIGHT = 0
//       i `prefers-reduced-motion` — twarde cięcie G1, przytrzymanie lotu (arkusz kontaktowy)
//   L14 piny źródłowe wpięcia: hak kółka PRZED krokiem zoomu (po bramkach overlayu i UI); klawisze w locie bezczynne, Esc →
//       `finishFlight` (wzór lotu intro)
// PRZECELOWANE 2026-11-07 (ARC GALAXY G5-B): flagi `galaxyView` / `galaxyLook` na stałe ON, ścieżki OFF usunięte (`flightOn`
//   nie czyta flagi) — wycofane L13m (flaga galaxyLook OFF — twarde cięcie G1); w jego miejsce L13n: drugi żywy wyzwalacz
//   twardego cięcia na poziomie kontrolera — `prefers-reduced-motion` przy pokrętle FLIGHT = 1 i wolnym slocie sterownika;
//   linie ustawiające i przywracające flagi usunięte (L13).
// Uruchom: node src/testing/smoke/galaxy_flight_smoke.mjs
import '../headless/env.js';           // MUSI być pierwszy
import fs from 'node:fs';
import * as T3 from '../../lib/three.core.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
const header = (s) => console.log(`\n── ${s}`);
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const call = (fn, ...a) => { try { return fn ? fn(...a) : undefined; } catch (e) { return `WYJĄTEK: ${e.message}`; } };
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const src = (rel) => stripComments(fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));

let FL = null, GC = null, GL = null, CC = null, GG = null;
try { FL = await import('../../ui/GalaxyFlightLogic.js'); } catch (e) { console.log('  (GalaxyFlightLogic:', e.message + ')'); }
try { GC = await import('../../ui/GalaxyModeController.js'); } catch (e) { console.log('  (GalaxyModeController:', e.message + ')'); }
try { GL = await import('../../ui/GalaxyModeLogic.js'); } catch (e) { console.log('  (GalaxyModeLogic:', e.message + ')'); }
try { CC = await import('../../renderer/ThreeCameraController.js'); } catch (e) { console.log('  (ThreeCameraController:', e.message + ')'); }
try { GG = await import('../../generators/GalaxyGenerator.js'); } catch { /* piny padną */ }

const camPos = (p) => ({ x: p.target.x + p.dist * Math.sin(p.phi) * Math.cos(p.theta), y: p.target.y + p.dist * Math.cos(p.phi),
  z: p.target.z + p.dist * Math.sin(p.phi) * Math.sin(p.theta) });
const samePose = (a, b, e = 1e-9) => !!a && !!b && near(a.theta, b.theta, e) && near(a.phi, b.phi, e) && near(a.dist, b.dist, e)
  && near(a.target.x, b.target.x, e) && near(a.target.y, b.target.y, e) && near(a.target.z, b.target.z, e);

const FROM_SYS = { theta: 0.31, phi: 1.07, dist: 233.5, target: { x: 4.2, y: 0, z: -7.7 } };
const PRESET = { theta: 0.6, phi: 0.92, dist: 11400, target: { x: 0, y: 0, z: 0 } };

header('L0  API');
{
  const need = ['GALAXY_FLIGHT', 'flightEase', 'shortestAngle', 'logLerp', 'flightEnabled', 'buildFlyOutPlan', 'buildFlyInPlan',
    'sampleFlight', 'flightEndState', 'subPixelHidden', 'applyFlightPose'];
  const miss = need.filter((k) => !(FL && k in FL));
  ok(miss.length === 0, `L0a GalaxyFlightLogic — ${need.length} eksportów (brak: ${miss.join(', ') || '—'})`);
}

header('L1  łagodzenie');
{
  const e = (x, k) => call(() => FL.flightEase(x, k));
  ok(e(0, 2) === 0 && e(1, 2) === 1 && e(0, 0) === 0 && e(1, 1) === 1, 'L1a końce 0 / 1 dla każdego wariantu');
  ok(near(e(0.3, 0), 0.3) && near(e(0.5, 1), 0.5) && near(e(0.5, 2), 0.5), 'L1b liniowe 0,3 → 0,3; środek smoothstep / smootherstep = 0,5');
  ok(e(0.02, 2) < e(0.02, 1) && e(0.02, 1) < e(0.02, 0), 'L1c smootherstep najłagodniejszy przy starcie (zero prędkości i przyspieszenia)');
  ok(e(-1, 2) === 0 && e(2, 2) === 1, 'L1d klamra poza [0; 1]');
}

const outPlan = FL?.buildFlyOutPlan?.({ from: FROM_SYS, to: PRESET });
header('L2  plan wylotu');
{
  ok(outPlan?.T === 1400 && outPlan?.switchAt === 200 && near(outPlan?.labelsAt, 1260), 'L2a T = 1400 ms, przejście po 200 ms (HUD), nazwy od 0,9 T');
  const p2 = FL?.buildFlyOutPlan?.({ from: FROM_SYS, to: PRESET, durationMs: 2000 });
  ok(p2?.T === 2000 && near(p2?.labelsAt, 1800), 'L2b czas lotu jako pokrętło (FLIGHT_OUT_MS)');
}

header('L3  wylot t = 0');
{
  const s = call(() => FL.sampleFlight(outPlan, 0));
  ok(samePose(s?.pose, FROM_SYS), 'L3a poza startowa = bieżąca kamera układu');
  ok(s?.hudAlpha === 1 && s?.systemFade === 1 && s?.plateFade === 0 && s?.realFade === 1 && s?.chromeAlpha === 0 && s?.afterSwitch === false,
    'L3b HUD i układ w pełni, płyta zgaszona, prawdziwe gwiazdy nieba w pełni, nazwy galaktyki 0');
}

header('L4  wylot t = T');
{
  const s = call(() => FL.sampleFlight(outPlan, 1400));
  ok(samePose(s?.pose, PRESET, 1e-6), 'L4a poza docelowa = preset galaktyki');
  ok(s?.plateFade === 1 && s?.realFade === 0 && s?.systemFade === 0 && s?.done === true, 'L4b płyta w pełni, prawdziwe gwiazdy nieba 0, układ 0');
  const c = call(() => FL.sampleFlight(outPlan, 1260 + 1));
  ok(c?.chromeAlpha > 0 && call(() => FL.sampleFlight(outPlan, 1259)).chromeAlpha === 0, 'L4c nazwy galaktyki dopiero od 0,9 T (na końcu)');
}

header('L5  jeden zbiór gwiazd');
{
  let worst = 0;
  for (let t = 0; t <= 1400; t += 7) {
    const s = FL?.sampleFlight?.(outPlan, t);
    worst = Math.max(worst, Math.abs((s?.plateFade ?? 9) + (s?.realFade ?? 9) - 1));
  }
  ok(worst < 1e-12, `L5a płyta + prawdziwe gwiazdy nieba = 1 w każdej z 201 chwil (odchyłka ${worst})`);
}

header('L6  przechył, dystans, gaśnięcie układu');
{
  let tiltBefore = 0, monotone = true, prev = -Infinity;
  for (let t = 0; t <= 1400; t += 7) {
    const s = FL?.sampleFlight?.(outPlan, t);
    if (t < 1400 * 2 / 3 - 1e-6) tiltBefore = Math.max(tiltBefore, Math.abs(s.pose.theta - FROM_SYS.theta) + Math.abs(s.pose.phi - FROM_SYS.phi));
    if (!(s.pose.dist >= prev - 1e-9)) monotone = false;
    prev = s.pose.dist;
  }
  ok(tiltBefore === 0, 'L6a skos i azymut stoją do 2/3 T (przechył w ostatniej tercji)');
  ok(monotone, 'L6b dystans rośnie monotonicznie przez cały wylot');
  const mid = FL?.sampleFlight?.(outPlan, 700);
  ok(near(mid?.pose.dist, Math.sqrt(FROM_SYS.dist * PRESET.dist), 1e-6), 'L6c połowa czasu = średnia geometryczna dystansu (skala log.)');
  ok(FL?.sampleFlight?.(outPlan, 0.14 * 1400)?.systemFade === 1 && FL?.sampleFlight?.(outPlan, 0.56 * 1400)?.systemFade === 0,
    'L6d linie orbit / sprite\'y układu gasną w oknie 0,15–0,55 T');
  ok(FL?.sampleFlight?.(outPlan, 100)?.hudAlpha === 0.5 && FL?.sampleFlight?.(outPlan, 200)?.hudAlpha === 0, 'L6e HUD układu gaśnie w 0–0,2 s');
}

const STAR = { x: 1800, y: 40, z: -900 };
const TO_FRAME = { theta: 0.3, phi: 1.1, dist: 240, target: { x: 0, y: 0, z: 0 } };
const inPlan = FL?.buildFlyInPlan?.({ from: PRESET, star: STAR, approachDist: 1200, to: TO_FRAME, rebase: true, mode: 'enter', systemId: 'sys_x' });
header('L7  plan wlotu');
{
  ok(inPlan?.T === 1200 && near(inPlan?.switchAt, 540) && inPlan?.rebase === true && inPlan?.systemId === 'sys_x', 'L7a T = 1200 ms, przejście logiczne 0,45 T');
  const at = call(() => FL.sampleFlight(inPlan, inPlan.switchAt));
  const before = call(() => FL.sampleFlight(inPlan, inPlan.switchAt - 1e-6));
  ok(near(at?.plateFade, 0, 1e-9) && at?.realFade === 0 && near(before?.plateFade, 0, 1e-6) && before?.realFade === 0,
    'L7b SEDNO: w chwili przełączenia płyta i prawdziwe gwiazdy nieba są na zerze');
  const s0 = call(() => FL.sampleFlight(inPlan, 0));
  ok(s0?.plateFade === 1 && s0?.chromeAlpha === 1 && s0?.systemFade === 0 && samePose(s0?.pose, PRESET), 'L7c start: płyta i nazwy w pełni, poza = bieżąca galaktyki');
  ok(call(() => FL.sampleFlight(inPlan, 150)).chromeAlpha === 0, 'L7d nazwy / szyna / ping gasną w pierwszych 0,15 s');
}

header('L8  ciągłość względem gwiazdy przez przełączenie');
{
  const S = inPlan?.switchAt ?? 0;
  const b = call(() => FL.sampleFlight(inPlan, S - 1e-6)).pose, a = call(() => FL.sampleFlight(inPlan, S)).pose;
  const pb = camPos(b), pa = camPos(a);
  const rel = { x: pb.x - STAR.x, y: pb.y - STAR.y, z: pb.z - STAR.z };
  ok(near(rel.x, pa.x, 1e-3) && near(rel.y, pa.y, 1e-3) && near(rel.z, pa.z, 1e-3),
    'L8a kamera względem gwiazdy celu przed przełączeniem = względem początku świata po przesunięciu (skok niewidoczny)');
  const back = FL?.buildFlyInPlan?.({ from: PRESET, star: { x: 0, y: 0, z: 0 }, approachDist: 1200, to: FROM_SYS, rebase: false, mode: 'back' });
  const bb = FL?.sampleFlight?.(back, back.switchAt - 1e-6)?.pose, ba = FL?.sampleFlight?.(back, back.switchAt)?.pose;
  ok(!!bb && !!ba && near(camPos(bb).x, camPos(ba).x, 1e-3) && near(camPos(bb).z, camPos(ba).z, 1e-3), 'L8b powrót (bez przesunięcia) — ciągłość w miejscu');
}

header('L9  wlot t = T');
{
  const s = call(() => FL.sampleFlight(inPlan, 1200));
  ok(samePose(s?.pose, TO_FRAME, 1e-6) && s?.systemFade === 1 && s?.realFade === 1 && s?.hudAlpha === 1, 'L9a poza = kadr układu, układ i niebo w pełni, HUD w pełni');
  ok(call(() => FL.sampleFlight(inPlan, 1000)).hudAlpha === 0 && call(() => FL.sampleFlight(inPlan, 1100)).hudAlpha === 0.5,
    'L9b HUD układu wraca w ostatnich 0,2 s');
}

header('L10 Esc → stan końcowy');
{
  const eo = call(() => FL.flightEndState(outPlan)), ei = call(() => FL.flightEndState(inPlan));
  ok(samePose(eo?.pose, PRESET, 0) && eo?.plateFade === 1 && eo?.realFade === 0, 'L10a wylot: poza docelowa co do bitu, płyta w pełni');
  ok(samePose(ei?.pose, TO_FRAME, 0) && ei?.systemFade === 1, 'L10b wlot: poza docelowa co do bitu, układ w pełni');
}

header('L11 lot włączony, siatka sub-pikselowa');
{
  const en = (o) => call(() => FL.flightEnabled(o));
  ok(en({ knob: 1 }) === true && en({ knob: 0 }) === false && en({ knob: 1, reducedMotion: true }) === false, 'L11a FLIGHT = 0 albo prefers-reduced-motion → twarde cięcie');
  const h = (r, d, f) => call(() => FL.subPixelHidden(r, d, f));
  ok(h(1, 1000, 500) === false && h(1, 1001, 500) === true && h(1, -5, 500) === true, 'L11b próg 0,5 px w rzucie; za kamerą — schowana');
}

header('L12 neutralizacja lerpów kontrolera (prototyp)');
function mkCam({ targetDist = 233.5, goal = [4.2, 0, -7.7] } = {}) {
  if (!CC?.ThreeCameraController) return null;
  const c = Object.create(CC.ThreeCameraController.prototype);
  c.camera = new T3.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000);
  c._theta = 0.31; c._phi = 1.07; c._goalTheta = null; c._goalPhi = null;
  c._defaultDist = 85; c._dist = targetDist; c._targetDist = targetDist;
  c._target = new T3.Vector3(...goal); c._goalTarget = new T3.Vector3(...goal);
  c._minDist = 0.3; c._starCoreRadius = 3.6; c._mode = 'system'; c._galaxy = null; c._wheelDeltaMode = 0;
  c._lastCamPos = new T3.Vector3(); c._moveEpoch = 0;
  return c;
}
{
  const c = mkCam();
  if (c) { c._goalTheta = 2.0; c._goalPhi = 0.4; c._targetDist = 10; }
  const pose = { theta: 0.5, phi: 0.9, dist: 777, target: { x: 12, y: 3, z: -4 } };
  call(() => FL.applyFlightPose(c, pose));
  call(() => c.update());
  ok(!!c && c._goalTheta === null && c._goalPhi === null && c._theta === 0.5 && c._phi === 0.9 && near(c._dist, 777) && near(c._target.x, 12)
    && near(c._goalTarget.z, -4), 'L12a po `update()` poza z osi czasu nietknięta (lerpy kątów, dystansu i celu — no-op)');
  call(() => c.frameSystem(12));
  const framed = c ? c._dist : null;
  call(() => FL.applyFlightPose(c, pose));
  ok(framed === 240 && near(c?._dist, 777) && c?._theta === 0.5, 'L12b snap `frameSystem` (wewnątrz `switchSystem`) przykryty pozą następnej klatki');
}

header('L13 orkiestracja GalaxyModeController');
{
  const knob0 = GL?.LIVE_GALAXY?.FLIGHT;
  const galaxy = GG?.GalaxyGenerator?.generate?.(424242) ?? { systems: [] };
  const systems = galaxy.systems;
  const sysA = systems.find((s) => s.id === 'sys_007');
  const generated = new Set(['sys_home', sysA?.id]);
  const log = [];
  const cam = mkCam();
  const tr = {
    _cameraController: cam, _cinematicDriver: null,
    setCinematicDriver(fn) { this._cinematicDriver = fn; log.push(['driver', fn ? 'on' : 'off']); },
    beginGalaxyFlight: (kind) => log.push(['begin', kind]),
    setGalaxyFlightFrame: (f) => log.push(['frame', +f.plateFade.toFixed(3), +f.realFade.toFixed(3)]),
    endGalaxyFlight: (m) => log.push(['end', m]),
    setGalaxyMode: (on, ctx) => log.push(['mode', on, ctx?.flight === true]),
    setGalaxySelected: () => {}, getGalaxyStarsWorld: () => systems.map((s) => {
      const a = systems.find((q) => q.id === K.activeSystemId);
      return { id: s.id, x: (s.x - a.x) * 200, y: ((s.z ?? 0) - (a.z ?? 0)) * 200, z: (s.y - a.y) * 200 };
    }),
    resetToSystemView: () => { log.push(['reset']); cam.frameSystem(10); return true; },
    _computeSystemExtentAU: () => 10,
  };
  const K = {
    civMode: true, galaxyData: { systems }, activeSystemId: 'sys_home',
    starSystemManager: { activeSystemId: 'sys_home', getSystem: (id) => (generated.has(id) ? { systemId: id } : null),
      switchActiveSystem: (id) => { log.push(['switch', id]); K.activeSystemId = id; K.starSystemManager.activeSystemId = id; cam.frameSystem(12); return true; } },
    threeRenderer: tr,
    tacticalMode: { isActive: false, exit: () => {} },
    uiManager: { isPickerActive: () => false, cancelPickerMode: () => {}, _dirty: false, _outlinerState: { groundUnits: [] } },
    intelSystem: { isAtLeast: () => false }, observatorySystem: null, colonyManager: { getAllColonies: () => [] },
    vesselManager: { getAllVessels: () => [] }, entityManager: { get: () => null },
    hudLayer: { setFlightAlpha: (a) => log.push(['hudAlpha', a]), wake: () => {} },
  };
  globalThis.window.KOSMOS = K;
  if (GL?.LIVE_GALAXY) GL.LIVE_GALAXY.FLIGHT = 1;
  const gm = GC?.GalaxyModeController ? new GC.GalaxyModeController() : null;
  const drive = (t) => call(() => tr._cinematicDriver?.(t));

  // Wylot
  const started = call(() => gm.enter('key'));
  ok(started === true && gm?.isFlying === true && gm?.isActive === false && typeof tr._cinematicDriver === 'function'
    && log.some((e) => e[0] === 'begin' && e[1] === 'out'), 'L13a G → wylot: lot w toku, sterownik kamery zainstalowany, tryb jeszcze UKŁADU');
  drive(1000); drive(1100);
  ok(gm?.isActive === false && !log.some((e) => e[0] === 'mode'), 'L13b do 0,2 s — HUD układu gaśnie, bez przejścia logicznego');
  drive(1250);
  ok(gm?.isActive === true && log.some((e) => e[0] === 'mode' && e[1] === true && e[2] === true) && cam?.mode === 'galaxy',
    'L13c po 0,2 s — przejście logiczne: tryb galaktyki (scena — gałąź lotu), kamera w trybie galaktyki');
  // Esc w trakcie → stan końcowy (preset)
  const preset = GL?.galaxyPresetView?.(GL?.galaxyCameraConfig?.(systems, 'sys_home'));
  call(() => gm.finishFlight());
  ok(gm?.isFlying === false && tr._cinematicDriver === null && log.some((e) => e[0] === 'end' && e[1] === 'galaxy')
    && near(cam?._theta, preset?.theta) && near(cam?._phi, preset?.phi) && near(cam?._targetDist, preset?.dist, 1e-6),
    'L13d Esc w trakcie — STAN KOŃCOWY: preset galaktyki, sterownik oddany');
  // Wlot powrotny = migawka 1:1
  log.length = 0;
  ok(call(() => gm.exit('esc')) === true && gm?.isFlying === true && log.some((e) => e[0] === 'begin' && e[1] === 'in'), 'L13e Esc w trybie galaktyki → wlot (powrót)');
  drive(5000); drive(5300); drive(5600);
  ok(gm?.isActive === false && log.some((e) => e[0] === 'mode' && e[1] === false), 'L13f przejście logiczne w tryb układu po 0,45 T');
  drive(6300);
  ok(gm?.isFlying === false && cam?.mode === 'system' && cam?._theta === 0.31 && cam?._phi === 1.07 && near(cam?._targetDist, 233.5, 1e-9)
    && near(cam?._goalTarget.x, 4.2) && near(cam?._goalTarget.z, -7.7) && !log.some((e) => e[0] === 'switch'),
    'L13g SEDNO: koniec wlotu powrotnego — kamera systemu 1:1 z migawki, bez przebudowy sceny');
  // Wlot w INNY układ
  const exp0 = sysA ? sysA.explored : false; if (sysA) sysA.explored = true;
  call(() => gm.enter('key')); call(() => gm.finishFlight());
  log.length = 0;
  ok(call(() => gm.enterSystem(sysA?.id)) === true && gm?.isFlying === true, 'L13h [ Wejdź ] / dwuklik — wlot w inny układ');
  drive(9000); drive(9500); drive(9560);
  const sw = log.findIndex((e) => e[0] === 'switch');
  drive(9700);
  ok(sw >= 0 && K.activeSystemId === sysA?.id && cam?._dist < 1200 && cam?._dist > 240 && cam?._theta !== 0.3,
    'L13i przełączenie układu w trakcie (kadr `frameSystem` z `switchSystem` przykryty pozą lotu — kamera nadal w zjeździe)');
  drive(10500);
  ok(gm?.isFlying === false && cam?._theta === 0.3 && cam?._phi === 1.1 && near(cam?._targetDist, 240, 1e-9) && near(cam?._goalTarget.x, 0),
    'L13j koniec — kadr NOWEGO układu (ten sam co twarde wejście G1)');
  if (sysA) sysA.explored = exp0;
  // Przytrzymanie (arkusz kontaktowy)
  call(() => gm.enter('key')); drive(20000);
  const held = call(() => gm.flightSeek(0.6, true));
  drive(20001); drive(25000);
  const fi = call(() => gm.flightInfo());
  ok(held?.u === 0.6 && gm?.isFlying === true && near(fi?.t, 0.6 * 1400, 30), 'L13k `flightSeek(0.6, true)` — lot stoi w ułamku 0,6 (klatki arkusza)');
  call(() => gm.finishFlight()); call(() => gm.exit('debug')); call(() => gm.finishFlight());
  // FLIGHT = 0 i prefers-reduced-motion — twarde cięcie G1
  if (GL?.LIVE_GALAXY) GL.LIVE_GALAXY.FLIGHT = 0;
  log.length = 0;
  ok(call(() => gm.enter('key')) === true && gm?.isFlying === false && gm?.isActive === true && !log.some((e) => e[0] === 'begin'),
    'L13l pokrętło FLIGHT = 0 — twarde cięcie (bez lotu)');
  call(() => gm.exit('key'));
  if (GL?.LIVE_GALAXY) GL.LIVE_GALAXY.FLIGHT = 1;
  // G5-B — w miejsce wycofanego L13m (flaga galaxyLook OFF): `prefers-reduced-motion` czytane przez kontroler (`_reducedMotion`).
  // Slot sterownika wolny i pokrętło 1 — jedynym powodem twardego cięcia zostaje zapytanie o media.
  const mm0 = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: /prefers-reduced-motion:\s*reduce/.test(String(q)), addEventListener: () => {}, removeEventListener: () => {} });
  const freeSlot = tr._cinematicDriver == null;
  log.length = 0;
  ok(freeSlot && call(() => gm.enter('key')) === true && gm?.isFlying === false && gm?.isActive === true && !log.some((e) => e[0] === 'begin'),
    'L13n prefers-reduced-motion (pokrętło FLIGHT = 1, slot sterownika wolny) — twarde cięcie (bez lotu)');
  call(() => gm.exit('key'));
  globalThis.matchMedia = mm0;
  if (GL?.LIVE_GALAXY) GL.LIVE_GALAXY.FLIGHT = knob0;
}

header('L14 piny źródłowe wpięcia');
{
  const cc = call(() => src('../../renderer/ThreeCameraController.js')) ?? '';
  const iUI = cc.indexOf('this._isOverUI(e.clientX, e.clientY)) return;');
  const iHook = cc.indexOf('galaxyMode?.onWheel?.(e, this) === true) return;');
  const iZoom = cc.indexOf('this.wheelZoom(e.deltaY);');
  ok(iUI > 0 && iHook > iUI && iZoom > iHook, 'L14a hak kółka: po bramce UI, PRZED krokiem zoomu (gałąź `wheelZoom` układu nietknięta)');
  const gs = call(() => src('../../scenes/GameScene.js')) ?? '';
  const iIntro = gs.indexOf('if (this._introLockActive) {');
  const iFly = gs.indexOf('if (window.KOSMOS?.galaxyMode?.isFlying) {');
  const iCtrl = gs.indexOf("if ((e.key === 'Control' || e.ctrlKey) && this.threeRenderer?.setShowAllLabels)");
  const blk = iFly > 0 ? gs.slice(iFly, iFly + 260) : '';
  ok(iIntro > 0 && iFly > iIntro && iCtrl > iFly && /finishFlight\(\)/.test(blk) && /return;/.test(blk),
    'L14b klawisze w locie bezczynne (przed CTRL / SHIFT / Esc mapy), Esc → `finishFlight` — wzór lotu intro');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
