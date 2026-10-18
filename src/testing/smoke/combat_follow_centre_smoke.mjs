// ═══════════════════════════════════════════════════════════════════════════════
// combat_follow_centre_smoke — KEEPER Findingu 467 (POLISH P2b, krok D1)
// Rejestr: `docs/design/POLISH_PLAN.md` §6 (467) i §12 (P2b).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: znacznik starcia (czerwony pierścień) i cel auto-fokusu stały w punkcie STARTU starcia
//   (`encounter.location.point` — punkt środkowy pary wyzwalającej z chwili startu), a walka odpływała od niego o ~0,1 AU
//   (fregata podlatuje do strażnika trzymającego orbitę): bramka P2A u właściciela (2026-10-18) — „pierścień stał
//   w dziwnym miejscu, z dala od statków; auto-fokus przybliżył na pierścień, nie na statki”. „Obserwuj” (P2a-2) śledził
//   walkę — te dwa nie.
// KSZTAŁT: ta sama logika co „Obserwuj” — kadr `_computeWatchFit` (punkty = sprite'y żywych, widocznych uczestników,
//   prostokąt bezpieczny = ekran bez pasków UI i panelu walki):
//   • znacznik co klatkę w ŚRODKU uczestników (`centroid` kadru — `CombatWatchLogic.centroidOf`);
//   • auto-fokus — start natychmiast (P2a-4, bez zmian), potem cel śledzi walkę (`autoFocusFollowStep`, `focusOnSmooth`):
//     cel = `watchTargetAt` przy BIEŻĄCYM dystansie — uczestnicy wyśrodkowani w prostokącie bezpiecznym (nad panelem
//     walki), bez dopasowania dystansu; do końca starcia albo przejęcia kamery.
//   ⚠ Pierwsza wersja D1 (cel = środek uczestników na środku ekranu) stawiała część uczestników POD PANELEM WALKI —
//   zmierzone sondą P2b w prawdziwej grze (scena 3 na 2: obaj strażnicy pod kartą we wszystkich klatkach auto-fokusu);
//   T6 odtwarza ten kadr na zmierzonej geometrii (kontrola: dawna reguła chowa strażników, nowa — nikogo).
// ⚠ `ThreeRenderer` nie importuje się pod node (THREE) ⇒ reguły w czystym `CombatWatchLogic` (wykonanie, także na
//   PRAWDZIWYM starciu DSCS ze zbliżaniem przed rundą), renderer — pin źródłowy (komentarze zdjęte).
//
// PINY:
//   T1  `centroidOf` — średnia, pomija punkty bez skończonych współrzędnych, brak punktów → null
//   T2  `fitWatchFrame(...).centroid` = `centroidOf(punkty)` (jedno źródło środka dla kadru i znacznika)
//   T3  `autoFocusFollowStep` — tabela: „Obserwuj”, koniec starcia, poza widokiem, przejęcie kamery → koniec; bez
//       sprite'ów — cel bez zmian; inaczej cel = podany punkt śledzenia
//   T4  PRAWDZIWE starcie DSCS (fregata z laserem ↔ strażnik z rakietami, 0,28 AU): po każdej rundzie cel auto-fokusu
//       (atrapa kontrolera: `focusOnSmooth`, lerp 0,4) = `watchTargetAt` przy dystansie 6 — prostokąt rzutu uczestników
//       wyśrodkowany w prostokącie bezpiecznym; znacznik = środek uczestników (KONTROLA: środek odpływa od punktu startu
//       o ≥ 0,01 AU — dawna reguła patrzyła obok walki)
//   T5  źródło `ThreeRenderer`: auto-fokus w pętli renderu po „Obserwuj”, przed `update()` kontrolera; start
//       natychmiast + przejście w śledzenie (stan `_autoFocus`, przerwany dotychczasowy fokus ciała / statku / stacji);
//       krok przez `autoFocusFollowStep`, cel `focusOnSmooth` z `_autoFocusTarget` (`watchTargetAt` przy bieżącym
//       dystansie, punkty i prostokąt z kadru); kadr pamiętany na klatkę; znacznik starcia DSCS co klatkę w środku
//   T6  zmierzona geometria sceny 3 na 2 (sonda P2b, kadr auto-fokusu, dystans 6, panel walki na dole) — WYPROWADZENIE
//       (obie reguły istnieją także przed krokiem; to, której używa renderer, pinuje T5e): cel = środek uczestników →
//       strażnicy pod panelem; cel = `watchTargetAt` (reguła „Obserwuj”, P2a) → wszyscy w prostokącie, nikt pod panelem
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { COSMIC }              from '../../config/LayoutConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import * as DSCSmod            from '../../systems/DeepSpaceCombatSystem.js';
import * as W                  from '../../renderer/CombatWatchLogic.js';
import { readFileSync }        from 'node:fs';

const { DeepSpaceCombatSystem, ROUND_INTERVAL_MS } = DSCSmod;

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
// Nowe funkcje przez przestrzeń nazw — na kodzie sprzed kroku ich nie ma: pin DEGRADUJE (undefined), nie przerywa.
const centroid = (p) => (typeof W.centroidOf === 'function' ? W.centroidOf(p) : undefined);
const followStep = (o) => (typeof W.autoFocusFollowStep === 'function' ? W.autoFocusFollowStep(o) : undefined);
const near = (a, b, eps = 1e-9) => !!a && !!b && Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.z - b.z) <= eps;
// średnia punktów liczona LOKALNIE — kontrole nie zależą od funkcji kroku (na kodzie sprzed kroku `centroidOf` nie ma)
const avg = (pts) => ({ x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length,
  z: pts.reduce((a, p) => a + p.z, 0) / pts.length });

const AU  = GAME_CONFIG.AU_TO_PX;
const S   = (v) => v / 10;          // gameplay px → jednostki świata 3D (jak `ThreeRenderer`)
const SYS = 'sys_t';
const EMP = 'emp_t';

// Kamera i ekran jak w kadrze auto-fokusu sondy P2b (prawdziwa gra, okno 1584 × 805, skala UI 1,1181, FOV 55°, kąty
// kontrolera 0,3 / 1,1, panel walki 3 na 2 — prostokąt w px ekranu z pomiaru, tu w jednostkach LOGICZNYCH UI).
const VIEW = { W: 1584, H: 805, uiScale: 1.1181, fovDeg: 55, theta: 0.3, phi: 1.1 };
const HUD_PX = { x: 479.087, y: 445.545, w: 624.993, h: 302.993 };
const hudLogical = { x: HUD_PX.x / VIEW.uiScale, y: HUD_PX.y / VIEW.uiScale, w: HUD_PX.w / VIEW.uiScale, h: HUD_PX.h / VIEW.uiScale };
const SAFE = W.watchSafeRect({ W: VIEW.W, H: VIEW.H, uiScale: VIEW.uiScale, hudRect: hudLogical, topBarH: COSMIC.TOP_BAR_H,
  bottomH: COSMIC.BOTTOM_NAV_H + COSMIC.BOTTOM_LOG_TRIG_H, rightW: COSMIC.OUTLINER_W });
const target6 = (pts) => W.watchTargetAt({ points: pts, d: 6, theta: VIEW.theta, phi: VIEW.phi, fovDeg: VIEW.fovDeg,
  aspect: VIEW.W / VIEW.H, W: VIEW.W, H: VIEW.H, safe: SAFE });
// rzut punktów przy celu `t` i dystansie `d` (kamera = t + zc · d) — px ekranu
const screenOf = (pts, t, d = 6) => {
  const basis = W.cameraBasis(VIEW.theta, VIEW.phi);
  const cam = { x: t.x + basis.zc.x * d, y: t.y + basis.zc.y * d, z: t.z + basis.zc.z * d };
  const tanHalf = Math.tan((VIEW.fovDeg * Math.PI / 180) / 2);
  return pts.map((p) => W.projectPoint(p, cam, basis, { tanHalf, aspect: VIEW.W / VIEW.H, W: VIEW.W, H: VIEW.H }));
};
const inSafe = (s) => s.x >= SAFE.x0 && s.x <= SAFE.x1 && s.y >= SAFE.y0 && s.y <= SAFE.y1;
const underHud = (s) => s.x >= HUD_PX.x && s.x <= HUD_PX.x + HUD_PX.w && s.y >= HUD_PX.y && s.y <= HUD_PX.y + HUD_PX.h;
const bboxCentre = (ss) => ({ x: (Math.min(...ss.map((s) => s.x)) + Math.max(...ss.map((s) => s.x))) / 2,
  y: (Math.min(...ss.map((s) => s.y)) + Math.max(...ss.map((s) => s.y))) / 2 });

// ═══ T1 ═══════════════════════════════════════════════════════════════════════
header('T1  `centroidOf`');
{
  const c3 = centroid([{ x: 0, y: 0.3, z: 0 }, { x: 3, y: 0.3, z: 0 }, { x: 0, y: 0.6, z: 3 }]);
  console.log(`     środek trzech punktów: ${JSON.stringify(c3)}`);
  assert(near(c3, { x: 1, y: 0.4, z: 1 }), 'T1a średnia trzech punktów');
  assert(near(centroid([{ x: 2, y: 0, z: 2 }, { x: NaN, y: 0, z: 0 }, null, { x: 4, y: 0, z: 4 }]), { x: 3, y: 0, z: 3 }),
    'T1b punkty bez skończonych współrzędnych / null pominięte');
  assert(centroid([]) === null && centroid(null) === null && centroid([{ x: NaN, y: 0, z: 0 }]) === null, 'T1c brak punktów → null');
}

// ═══ T2 ═══════════════════════════════════════════════════════════════════════
header('T2  jedno źródło środka: `fitWatchFrame(...).centroid` = `centroidOf`');
{
  const W0 = 1584, H0 = 805;
  const safe = W.watchSafeRect({ W: W0, H: H0, uiScale: 1.1, hudRect: { x: 440, y: 470, w: 560, h: 230 }, topBarH: 46, bottomH: 42, rightW: 150 });
  const pts = [{ x: 13.4, y: 0.3, z: -6.9 }, { x: 13.7, y: 0.21, z: -6.4 }, { x: 13.2, y: 0.3, z: -6.6 }];
  const fit = W.fitWatchFrame({ points: pts, theta: 0.3, phi: 1.1, fovDeg: 55, aspect: W0 / H0, W: W0, H: H0, safe });
  console.log(`     centroid kadru ${JSON.stringify(fit?.centroid)} · centroidOf ${JSON.stringify(centroid(pts))}`);
  assert(!!fit && near(fit.centroid, centroid(pts), 1e-12), 'T2 SEDNO: kadr „Obserwuj” i znacznik mówią o tym samym środku');
}

// ═══ T3 ═══════════════════════════════════════════════════════════════════════
header('T3  `autoFocusFollowStep` — tabela');
{
  const g = { x: 1, y: 0, z: 1 }; const c = { x: 1.2, y: 0.3, z: 0.9 };
  const base = { watching: false, active: true, inView: true, goal: g, lastGoal: { ...g }, centre: c };
  const r = (o) => followStep({ ...base, ...o });
  console.log(`     ${JSON.stringify({ follow: r({}), watch: r({ watching: true }), ended: r({ active: false }), taken: r({ goal: { x: 5, y: 0, z: 1 } }) })}`);
  assert(r({})?.end === false && near(r({})?.target, c), 'T3a SEDNO: aktywne starcie w widoku — cel = podany punkt śledzenia');
  assert(r({ watching: true })?.end === true && r({ watching: true })?.reason === 'watch', 'T3b „Obserwuj” przejęło kamerę — koniec');
  assert(r({ active: false })?.end === true && r({ inView: false })?.end === true, 'T3c koniec starcia / starcie poza widokiem — koniec');
  assert(r({ goal: { x: 5, y: 0, z: 1 } })?.end === true && r({ goal: { x: 5, y: 0, z: 1 } })?.reason === 'camera_taken',
    'T3d cel kamery zmienił ktoś inny (fokus ciała, reset H, zmiana układu) — koniec');
  assert(r({ centre: null })?.end === false && r({ centre: null })?.target === null, 'T3e bez sprite\'ów (model jeszcze się wstawia) — cel bez zmian');
  assert(r({ lastGoal: null })?.end === false, 'T3f pierwsza klatka (bez ostatniego celu) — śledzenie');
}

// ═══ T4 ═══════════════════════════════════════════════════════════════════════
header('T4  PRAWDZIWE starcie DSCS: cel auto-fokusu (uczestnicy wyśrodkowani nad panelem) i znacznik w środku co rundę');
{
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 100, simClockMs: 1000 }, activeSystemId: SYS };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Home', systemId: SYS, x: -3 * AU, y: 0, radius: 4, mass: 1, visual: { radius: 4 } });
  const vMgr = new VesselManager(); const mos = new MovementOrderSystem(vMgr); const dscs = new DeepSpaceCombatSystem(vMgr);
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  Object.assign(window.KOSMOS, {
    civMode: true, vesselManager: vMgr, movementOrderSystem: mos, deepSpaceCombatSystem: dscs,
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find((c) => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    intelSystem: { getVesselContact: () => ({ quality: 'contact' }) },
    eventLogSystem: { push: () => {} }, debug: { combatTrace: false },
  });
  const ship = (x, y, name, modules, empire = null) => {
    const v = vMgr.createAndRegister('hull_frigate', 'p_home', { name, modules });
    v.position.x = x; v.position.y = y; v.position.state = 'orbiting'; v.position.dockedAt = null;
    v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.systemId = SYS;
    if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; }
    return v;
  };
  const me = ship(0, 2 * AU, 'Me', ['weapon_laser', 'engine_ion']);
  const foe = ship(0, 2 * AU + 0.28 * AU, 'Foe', ['weapon_missile', 'weapon_missile', 'engine_ion', 'armor_heavy'], EMP);
  mos.issueOrder(me.id, { type: 'engage', targetEntityId: foe.id, issuedBy: 'keeper' });
  dscs.handleCombatRangeEnter(me.id, foe.id, false);
  const enc = dscs._findActiveEncounterContaining(foe.id);
  // punkty jak `_computeWatchFit`: żywi uczestnicy, pozycja sprite'a (wolna przestrzeń: S(x), 0,3, S(y))
  const points = () => [...enc.sideA.vesselIds, ...enc.sideB.vesselIds]
    .filter((id) => enc.vesselStates.get(id)?.hp > 0)
    .map((id) => { const v = vMgr.getVessel(id); return { x: S(v.position.x), y: 0.3, z: S(v.position.y) }; });
  const start = { x: S(enc.location.point.x), y: 0, z: S(enc.location.point.y) };
  // atrapa kontrolera kamery: cel / cel docelowy, `focusOnSmooth` (lerp 0,4) — jak `ThreeCameraController`
  const cam = { goal: { ...start }, target: { ...start },
    focusOnSmooth(x, z, y) { this.goal = { x, y, z }; for (const k of ['x', 'y', 'z']) this.target[k] += (this.goal[k] - this.target[k]) * 0.4; } };
  let state = { goal: { ...cam.goal } };
  let maxGoalErr = 0, maxMarkerErr = 0, maxOldErr = 0, maxCentreErrPx = 0, outside = 0, rounds = 0, follows = 0;
  const sc = { x: (SAFE.x0 + SAFE.x1) / 2, y: (SAFE.y0 + SAFE.y1) / 2 };
  const d = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity);
  for (let i = 0; i < 40 && enc.isActive; i++) {
    window.KOSMOS.timeSystem.simClockMs += ROUND_INTERVAL_MS; dscs._tick(0.01);
    if (!enc.isActive) break;
    rounds++;
    const pts = points();
    const c = avg(pts);                          // środek uczestników (odniesienie)
    const want = target6(pts);
    const step = followStep({ watching: false, active: enc.isActive, inView: true, goal: cam.goal, lastGoal: state.goal, centre: want?.ok ? want.target : null });
    if (step && !step.end && step.target) { cam.focusOnSmooth(step.target.x, step.target.z, step.target.y); follows++; }
    state.goal = { ...cam.goal };
    const marker = centroid(pts);                // znacznik: pozycja = `centroidOf` (reguła kroku)
    maxGoalErr = Math.max(maxGoalErr, want?.ok ? d(cam.goal, want.target) : Infinity);
    maxMarkerErr = Math.max(maxMarkerErr, d(marker, c));
    maxOldErr = Math.max(maxOldErr, d(start, c));
    const ss = screenOf(pts, cam.goal);
    const bc = bboxCentre(ss);
    maxCentreErrPx = Math.max(maxCentreErrPx, Math.hypot(bc.x - sc.x, bc.y - sc.y));
    outside += ss.filter((s) => !inSafe(s)).length;
  }
  console.log(`     rund ${rounds}, kroków śledzenia ${follows}; cel ↔ watchTargetAt max ${maxGoalErr.toFixed(6)} j.; środek prostokąta rzutu ↔ środek prostokąta bezpiecznego max ${maxCentreErrPx.toFixed(2)} px; uczestnicy poza prostokątem: ${outside}; znacznik ↔ środek max ${maxMarkerErr.toFixed(6)} j.; punkt startu ↔ środek max ${maxOldErr.toFixed(4)} j. (${(maxOldErr * 10 / AU).toFixed(4)} AU)`);
  assert(rounds >= 3, 'T4-0 KONTROLA: starcie trwa kilka rund');
  assert(maxOldErr * 10 / AU >= 0.01, 'T4-1 KONTROLA: środek walki odpływa od punktu startu (≥ 0,01 AU) — dawna reguła patrzyła obok walki');
  assert(follows === rounds && maxGoalErr < 1e-9, 'T4a SEDNO: śledzenie w każdej rundzie; cel auto-fokusu = `watchTargetAt` przy bieżącym dystansie');
  assert(follows > 0 && maxCentreErrPx <= W.COMBAT_WATCH.CENTER_TOL_PX + 1e-6 && outside === 0,
    'T4b SEDNO: uczestnicy wyśrodkowani w prostokącie bezpiecznym (nad panelem walki), nikt poza nim');
  assert(follows > 0 && maxMarkerErr < 1e-9, 'T4c SEDNO: znacznik starcia = środek uczestników');
}

// ═══ T5 ═══════════════════════════════════════════════════════════════════════
header('T5  źródło `ThreeRenderer`');
{
  const tr = strip(readFileSync(new URL('../../renderer/ThreeRenderer.js', import.meta.url), 'utf8'));
  const body = (sig) => { const i = tr.indexOf(sig); return i < 0 ? '' : tr.slice(i, tr.indexOf('\n  }\n', i)); };
  const loop = body('  _startLoop() {');
  const wc = loop.indexOf('this._updateWatchCamera()'); const af = loop.indexOf('this._updateAutoFocusCamera()');
  const cu = loop.indexOf('this._cameraController.update()');
  assert(loop.length > 0 && wc > 0 && cu > 0, 'T5-0 KONTROLA: pętla renderu, „Obserwuj” i `update()` kontrolera znalezione');
  assert(af > wc && af < cu, 'T5a auto-fokus co klatkę w pętli renderu: po „Obserwuj”, przed `update()` kontrolera');
  const i = tr.indexOf("EventBus.on('vessel:engaged', safe(({ sideA");
  const eng = i < 0 ? '' : tr.slice(i, tr.indexOf('\n    }));', i));
  const fi = eng.indexOf('focusOnInstant(S(p.x), S(p.y))'); const st = eng.indexOf('this._autoFocus = {');
  assert(fi > 0 && st > fi && /encounterId:\s*encounterId \?\? null/.test(eng.slice(st)),
    'T5b start natychmiast (jak P2a-4), potem stan śledzenia z id starcia');
  assert(/this\._focusEntityId = null;/.test(eng) && /this\._focusVesselId = null;/.test(eng) && /this\._focusStationId = null;/.test(eng),
    'T5c dotychczasowy fokus ciała / statku / stacji przerwany (inaczej `_updateCameraFocus` ciągnąłby kamerę z walki)');
  const upd = body('  _updateAutoFocusCamera() {');
  assert(/autoFocusFollowStep\(/.test(upd) && /focusOnSmooth\(step\.target\.x, step\.target\.z, step\.target\.y\)/.test(upd)
    && /this\._autoFocusTarget\(enc\)/.test(upd) && /watching:\s*!!this\._watch/.test(upd) && /isEngagementInView\(/.test(upd),
    'T5d krok przez `autoFocusFollowStep` (Obserwuj / koniec / widok / przejęcie), cel `focusOnSmooth` z `_autoFocusTarget`');
  const aft = body('  _autoFocusTarget(enc) {');
  assert(/watchTargetAt\(\{ points: fit\.points, d: cc\._targetDist,/.test(aft) && /safe: fit\.safe/.test(aft) && /this\._engagementFit\(enc\)/.test(aft)
    && !/setTargetDist|fitWatchFrame/.test(aft),
    'T5e cel auto-fokusu: `watchTargetAt` przy BIEŻĄCYM dystansie, punkty i prostokąt z kadru — bez dopasowania dystansu');
  const fitM = body('  _engagementFit(enc) {');
  assert(/this\._computeWatchFit\(enc\)/.test(fitM) && /_centreFrame !== this\._frameNo/.test(fitM)
    && /this\._engagementFit\(enc\)\?\.centroid/.test(body('  _engagementCentre(enc) {')),
    'T5f kadr z `_computeWatchFit` pamiętany na jedną klatkę; środek znacznika = `centroid` kadru');
  assert(/points: pts, safe, W, H/.test(body('  _computeWatchFit(enc) {')), 'T5g kadr zwraca punkty i prostokąt bezpieczny (wspólne dla „Obserwuj” i auto-fokusu)');
  const mk = body('  _tickEngagementMarkers(nowMs) {');
  const up = mk.indexOf('this._upsertEngagementMarker(u.id'); const mv = mk.indexOf('this._engagementCentre(enc)');
  assert(up > 0 && mv > up && /e\.mesh\.position\.set\(c\.x, c\.y, c\.z\)/.test(mk) && /visible = !this\._watch/.test(mk),
    'T5h znacznik starcia DSCS co klatkę w środku uczestników (po synchronizacji ze stanem); ukryty przy „Obserwuj” jak dotąd');
  const imp = tr.slice(0, tr.indexOf('export class ThreeRenderer'));
  assert(/autoFocusFollowStep/.test(imp) && /watchTargetAt/.test(imp), 'T5i reguły importowane z `CombatWatchLogic`');
}

// ═══ T6 ═══════════════════════════════════════════════════════════════════════
header('T6  zmierzona geometria 3 na 2 (sonda P2b): dawna reguła chowa strażników pod panelem walki, nowa — nikogo');
{
  // Pozycje sprite'ów (świat) w klatce auto-fokusu sondy P2b, scena „v” (fregaty v_34–v_36, strażnicy v_32 / v_33).
  const pts = [
    { x: 28.16023, y: 0.3, z: 13.821424 }, { x: 27.857743, y: 0.3, z: 13.181547 }, { x: 27.688409, y: 0.3, z: 12.494331 },
    { x: 31.197698, y: 0.3, z: 11.994093 }, { x: 31.197698, y: 0.3, z: 12.214093 },
  ];
  const old = screenOf(pts, avg(pts));
  const want = target6(pts);
  const neu = want?.ok ? screenOf(pts, want.target) : [];
  const fmt = (ss) => ss.map((s) => `(${s.x.toFixed(0)}, ${s.y.toFixed(0)})`).join(' ');
  console.log(`     prostokąt bezpieczny ${JSON.stringify({ x0: SAFE.x0, x1: +SAFE.x1.toFixed(1), y0: +SAFE.y0.toFixed(1), y1: +SAFE.y1.toFixed(1) })}; panel walki od y = ${HUD_PX.y}`);
  console.log(`     cel = środek: ${fmt(old)} — pod panelem ${old.filter(underHud).length}`);
  console.log(`     cel = watchTargetAt: ${fmt(neu)} — pod panelem ${neu.filter(underHud).length}, poza prostokątem ${neu.filter((s) => !inSafe(s)).length}`);
  assert(old.filter(underHud).length === 2 && underHud(old[3]) && underHud(old[4]),
    'T6-0 KONTROLA (dawna reguła, zmierzone w grze): cel = środek uczestników — obaj strażnicy pod panelem walki');
  assert(neu.length === 5 && neu.every(inSafe) && !neu.some(underHud),
    'T6 KONTROLA (wyprowadzenie; regułę w rendererze pinuje T5e): cel = `watchTargetAt` — wszyscy w prostokącie bezpiecznym, nikt pod panelem');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
