// ═══════════════════════════════════════════════════════════════════════════════
// combat_fx_pace_smoke — KEEPER kroku A7 i Findingu 461 (POLISH P2b, krok D3)
// Rejestr: `docs/design/POLISH_PLAN.md` §6 (461), §10.8 (A7) i §12 (P2b).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: (A7) czasy efektów salwy strojono pod dawne 110 ms na rundę — przy 400 ms (P1, CP2) smuga (260 ms) gasła
//   w ~2/3 rundy, a w rundzie ze strzałem zostawała dziura do następnej salwy; (461) zbliżenie w starciu szło JEDNYM
//   skokiem raz na rundę (`_closeToWeaponRange` — 0,0282 AU; przy „Obserwuj” setki px), sprite brał pozycję logiczną od razu.
// KSZTAŁT: czasy efektów z czasu realnego rundy R = `timeSystem.combatRoundMs()` (`combatFxPace`, bez nowego czytelnika
//   tabeli strojenia): smuga, błysk i pierścień tarczy ~1,2 R, rozrzut R / 10, uderzenie ~0,375 R, nigdy krócej niż
//   dawne stałe; renderer prowadzi sprite uczestnika oglądanego starcia od pozycji wyświetlanej do nowej pozycji
//   logicznej przez jedną rundę (`glideRetarget` / `glideStep`); końce smug, błysk i pierścień tarczy idą za sprite'ami.
//   Logika walki NIETKNIĘTA (`sb3_combat_closing_smoke` bez zmian; pozycji logicznej renderer nie pisze).
// ⚠ `ThreeRenderer` nie importuje się pod node ⇒ czasy i ruch w czystych modułach (wykonanie, także na PRAWDZIWYM
//   starciu DSCS: salwy i kroki zbliżenia), renderer — pin źródłowy (komentarze zdjęte).
//
// PINY:
//   T1  `combatFxPace` — tabela: 110 ms = dawne stałe (bez zmian dla starć nieoglądanych i domyślnej); 400 ms; 1000 ms;
//       wartość nieokreślona → jak 110
//   T2  PRAWDZIWE starcie DSCS przy R = 400: każda salwa (runda ze strzałem) wypełnia CAŁĄ swoją rundę efektami (bez
//       dziury do następnej rundy); KONTROLA: dawne stałe zostawiają w części salw dziurę ≥ 100 ms; pokrycie starcia rośnie
//   T3  `glideRetarget` / `glideStep` — ruch liniowy przez rundę, krok klatki ≤ 100 ms, ten sam cel — bez zmian, nowy cel —
//       od pozycji wyświetlanej
//   T4  PRAWDZIWE starcie DSCS (klatki 16 ms, R = 400, zegar starcia jak siatka `TimeSystem`): największy skok sprite'a na
//       klatkę z płynnym zbliżeniem ≤ krok / R × 16 ms (+5 %), ruch dobiega przed następnym krokiem; KONTROLA: bez niego
//       (pozycja logiczna od razu) — skok = cały krok rundy
//   T5  źródło `ThreeRenderer`: tempo salwy z `combatRoundMs()`; czasy smugi / błysku / tarczy / rozrzutu z planu; końce
//       smug i błyski za sprite'ami; płynne zbliżenie w obu miejscach ustawiania wolnego statku, co klatkę PRZED kamerą,
//       stoi w pauzie; bez tabeli strojenia
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import * as DSCSmod            from '../../systems/DeepSpaceCombatSystem.js';
import * as CFX                from '../../config/CombatFxConfig.js';
import * as W                  from '../../renderer/CombatWatchLogic.js';
import { readFileSync }        from 'node:fs';

const { DeepSpaceCombatSystem, ROUND_INTERVAL_MS } = DSCSmod;

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const pace = (R) => (typeof CFX.combatFxPace === 'function' ? CFX.combatFxPace(R) : undefined);
const gRet = (...a) => (typeof W.glideRetarget === 'function' ? W.glideRetarget(...a) : undefined);
const gStep = (...a) => (typeof W.glideStep === 'function' ? W.glideStep(...a) : undefined);
const TODAY = { tracerMs: CFX.FX_TRACER_MS, flashMs: CFX.FX_FLASH_MS, flashDelayMs: CFX.FX_FLASH_DELAY_MS, shieldMs: CFX.FX_SHIELD_MS, staggerMs: 40 };

const AU  = GAME_CONFIG.AU_TO_PX;
const SYS = 'sys_t';
const EMP = 'emp_t';

// scena: PRAWDZIWE DSCS — 2 fregaty gracza z laserem ↔ 2 strażniki z rakietami (0,28 AU)
function scene() {
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
  const me = [ship(0, 2 * AU, 'Me0', ['weapon_laser', 'engine_ion']), ship(0.02 * AU, 2 * AU, 'Me1', ['weapon_laser', 'engine_ion'])];
  const foe = [ship(0, 2 * AU + 0.28 * AU, 'Foe0', ['weapon_missile', 'weapon_missile', 'engine_ion', 'armor_heavy'], EMP),
    ship(0.02 * AU, 2 * AU + 0.28 * AU, 'Foe1', ['weapon_missile', 'engine_ion', 'armor_heavy'], EMP)];
  for (const v of me) mos.issueOrder(v.id, { type: 'engage', targetEntityId: foe[0].id, issuedBy: 'keeper' });
  return { vMgr, mos, dscs, me, foe };
}

// ═══ T1 ═══════════════════════════════════════════════════════════════════════
header('T1  `combatFxPace` — tabela');
{
  const p110 = pace(110), p400 = pace(400), p1000 = pace(1000), pNaN = pace(NaN);
  console.log(`     110: ${JSON.stringify(p110)}\n     400: ${JSON.stringify(p400)}\n     1000: ${JSON.stringify(p1000)}`);
  assert(JSON.stringify(p110) === JSON.stringify(TODAY), 'T1a 110 ms (starcie nieoglądane) — dokładnie dawne stałe');
  assert(p400?.tracerMs === 480 && p400?.flashMs === 480 && p400?.shieldMs === 480 && p400?.staggerMs === 40 && p400?.flashDelayMs === 150,
    'T1b SEDNO: 400 ms (domyślnie, CP2) — smuga / błysk / tarcza 1,2 rundy (480 ms), rozrzut 40 ms, uderzenie po 150 ms');
  assert(p1000?.tracerMs === 1200 && p1000?.staggerMs === 100 && p1000?.flashDelayMs === 375, 'T1c 1000 ms — proporcjonalnie');
  assert(JSON.stringify(pNaN) === JSON.stringify(TODAY) && JSON.stringify(pace(0)) === JSON.stringify(TODAY), 'T1d wartość nieokreślona — jak 110');
  assert(CFX.FX_TRACER_MS === 260 && CFX.FX_FLASH_MS === 460, 'T1e dawne stałe bez zmian (bitwa orbitalna — imitacja — dalej na nich)');
}

// ═══ T2 ═══════════════════════════════════════════════════════════════════════
header('T2  PRAWDZIWE starcie przy R = 400: salwa wypełnia swoją rundę');
{
  const R = 400;
  const { dscs, me, foe } = scene();
  const salvos = [];
  EventBus.on('combat:roundFx', (p) => salvos.push({ round: dscs._activeEncounters.get(p.encounterId)?.currentRound ?? null, events: p.events }));
  dscs.handleCombatRangeEnter(me[0].id, foe[0].id, false);
  const enc = [...dscs._activeEncounters.values()][0];
  for (let i = 0; i < 40 && enc?.isActive; i++) { window.KOSMOS.timeSystem.simClockMs += ROUND_INTERVAL_MS; dscs._tick(0.01); }
  // okna widoczności efektów salwy (reguła renderera: smuga na zdarzenie, rozrzut (i mod 8) × rozrzut; przy trafieniu
  // błysk i biały błysk modelu po opóźnieniu uderzenia; tarcza przy zablokowaniu) — czas salwy = (runda − 1) × R
  const windows = (c) => salvos.map((s) => {
    const t0 = (s.round - 1) * R; let end = t0;
    s.events.forEach((e, i) => {
      const st = t0 + (i % 8) * c.staggerMs;
      end = Math.max(end, st + c.tracerMs);
      if (e.hit) { end = Math.max(end, st + c.flashDelayMs + c.flashMs, st + c.flashDelayMs + 200); if (e.blockedByShield > 0) end = Math.max(end, st + c.flashDelayMs + c.shieldMs); }
    });
    return { round: s.round, t0, end, hole: Math.max(0, t0 + R - end) };
  });
  const wp = pace(R) ? windows(pace(R)) : [];
  const wt = windows(TODAY);
  const cover = (ws, total) => { const segs = ws.map((w) => [w.t0, Math.min(w.end, total)]).sort((a, b) => a[0] - b[0]); let c = 0, last = -Infinity;
    for (const [a, b] of segs) { const A = Math.max(a, last); if (b > A) { c += b - A; last = b; } } return c / total; };
  const total = (enc?.currentRound ?? 0) * R;
  console.log(`     rund ${enc?.currentRound}, salw ${salvos.length}; dziury do końca rundy — dawne stałe: [${wt.map((w) => w.hole).join(', ')}] ms; z tempa rundy: [${wp.map((w) => w.hole).join(', ')}] ms`);
  console.log(`     pokrycie starcia efektami: dawne ${(100 * cover(wt, total)).toFixed(1)} % → z tempa rundy ${wp.length ? (100 * cover(wp, total)).toFixed(1) : '—'} %`);
  assert(salvos.length >= 3 && !enc.isActive, 'T2-0 KONTROLA: starcie rozstrzygnięte, kilka salw');
  // salwa SAMYCH PUDEŁ (ta sama reguła okien): przy trafieniu dawny błysk (150 + 460 ms) i tak wypełniał rundę 400 ms —
  // dziura była w rundach, w których wszystko chybiło (sama smuga 260 ms)
  const missOnly = [{ round: 1, events: [{ hit: false, blockedByShield: 0 }, { hit: false, blockedByShield: 0 }] }];
  const keep = salvos.splice(0, salvos.length, ...missOnly);
  const mt = windows(TODAY)[0]; const mp = pace(R) ? windows(pace(R))[0] : null;
  salvos.splice(0, salvos.length, ...keep);
  console.log(`     salwa samych pudeł (2 smugi): dziura do końca rundy — dawne stałe ${mt.hole} ms, z tempa rundy ${mp?.hole ?? '—'} ms`);
  assert(mt.hole >= 100, 'T2-1 KONTROLA: dawne stałe przy 400 ms — w rundzie samych pudeł dziura ≥ 100 ms (sama smuga 260 ms)');
  assert(mp?.hole === 0, 'T2-2 salwa samych pudeł z tempa rundy — bez dziury');
  assert(wp.length === salvos.length && wp.every((w) => w.hole === 0), 'T2a SEDNO: każda salwa wypełnia całą swoją rundę (bez dziury do następnej rundy)');
  assert(wp.length > 0 && cover(wp, total) > cover(wt, total), 'T2b pokrycie starcia efektami rośnie');
}

// ═══ T3 ═══════════════════════════════════════════════════════════════════════
header('T3  `glideRetarget` / `glideStep`');
{
  const g = gRet(null, { x: 1, z: 0 }, { x: 0, z: 0 }, 400);
  const a = g ? gStep(g, 100) : undefined; const b = g ? gStep({ ...g, elapsedMs: 300 }, 100) : undefined;
  const c = g ? gStep(g, 5000) : undefined;
  console.log(`     ${JSON.stringify({ g, a, b, c })}`);
  assert(g?.from?.x === 0 && g?.to?.x === 1 && g?.elapsedMs === 0 && g?.done === false, 'T3a nowy cel — ruch od pozycji wyświetlanej');
  assert(Math.abs((a?.x ?? -1) - 0.25) < 1e-12 && a?.done === false && Math.abs((b?.x ?? -1) - 1) < 1e-12 && b?.done === true, 'T3b ruch liniowy przez rundę, u celu — koniec');
  assert(Math.abs((c?.x ?? -1) - 0.25) < 1e-12, 'T3c krok klatki ≤ 100 ms (karta w tle — bez skoku na koniec ruchu)');
  assert(g && gRet(g, { x: 1, z: 0 }, { x: 0.5, z: 0 }, 400) === g, 'T3d ten sam cel — stan bez zmian');
  const g2 = g ? gRet({ ...g, elapsedMs: 200 }, { x: 2, z: 0 }, { x: 0.5, z: 0 }, 400) : undefined;
  assert(g2?.from?.x === 0.5 && g2?.to?.x === 2 && g2?.elapsedMs === 0, 'T3e nowy cel w trakcie ruchu — od pozycji wyświetlanej (bez skoku)');
}

// ═══ T4 ═══════════════════════════════════════════════════════════════════════
header('T4  PRAWDZIWE starcie: płynne zbliżenie (klatki 16 ms, R = 400)');
{
  const R = 400, F = 16;
  const { dscs, me, foe } = scene();
  dscs.handleCombatRangeEnter(me[0].id, foe[0].id, false);
  const enc = [...dscs._activeEncounters.values()][0];
  const S = (v) => v / 10;
  const disp = new Map(); const glide = new Map(); const snap = new Map();
  for (const v of me) { disp.set(v.id, { x: S(v.position.x), z: S(v.position.y) }); snap.set(v.id, { x: S(v.position.x), z: S(v.position.y) }); }
  let maxGlide = 0, maxSnap = 0, steps = 0, lagged = 0, maxStepWorld = 0;
  for (let f = 0; f < 4000 && enc?.isActive; f++) {
    window.KOSMOS.timeSystem.simClockMs += F * (ROUND_INTERVAL_MS / R);   // siatka: 110 ms zegara starcia na R ms realnych
    dscs._tick(0.01);
    for (const v of me) {
      const to = { x: S(v.position.x), z: S(v.position.y) };
      const prevSnap = snap.get(v.id); snap.set(v.id, to);
      const js = Math.hypot(to.x - prevSnap.x, to.z - prevSnap.z); maxSnap = Math.max(maxSnap, js);
      let g = glide.get(v.id);
      const cur = disp.get(v.id);
      const ng = gRet(g ?? null, to, cur, R);
      if (ng && ng !== g) { if (g && !g.done) lagged++; steps += g ? 1 : 0; maxStepWorld = Math.max(maxStepWorld, Math.hypot(to.x - (g?.to?.x ?? to.x), to.z - (g?.to?.z ?? to.z))); g = ng; }
      if (g && !g.done) { const st = gStep(g, F); g.elapsedMs = st.elapsedMs; g.done = st.done; disp.set(v.id, { x: st.x, z: st.z }); }
      glide.set(v.id, g);
      const jg = Math.hypot(disp.get(v.id).x - cur.x, disp.get(v.id).z - cur.z); maxGlide = Math.max(maxGlide, jg);
    }
  }
  const bound = maxStepWorld / R * F * 1.05 + 1e-9;
  console.log(`     kroków zbliżenia ${steps}; krok rundy max ${maxStepWorld.toFixed(4)} j.; skok na klatkę — bez płynnego zbliżenia ${maxSnap.toFixed(4)} j., z płynnym ${maxGlide.toFixed(5)} j. (granica ${bound.toFixed(5)}); ruch niedokończony przy kolejnym kroku: ${lagged}`);
  assert(steps >= 2 && maxStepWorld > 0.05, 'T4-0 KONTROLA: zbliżenie przed rundami (kroki ≥ 2, krok > 0,05 j.)');
  assert(maxSnap >= 0.9 * maxStepWorld, 'T4-1 KONTROLA: bez płynnego zbliżenia skok = cały krok rundy');
  assert(steps >= 2 && maxGlide <= bound, 'T4a SEDNO: z płynnym zbliżeniem skok na klatkę ≤ krok / R × 16 ms (+5 %)');
  assert(steps >= 2 && lagged === 0, 'T4b ruch dobiega przed kolejnym krokiem (bez narastającego opóźnienia)');
}

// ═══ T5 ═══════════════════════════════════════════════════════════════════════
header('T5  źródło `ThreeRenderer`');
{
  const tr = strip(readFileSync(new URL('../../renderer/ThreeRenderer.js', import.meta.url), 'utf8'));
  const body = (sig) => { const i = tr.indexOf(sig); return i < 0 ? '' : tr.slice(i, tr.indexOf('\n  }\n', i)); };
  const fx = body('  _onCombatRoundFx(payload) {');
  const g = fx.indexOf('isEngagementInView('); const pc = fx.indexOf('combatFxPace(window.KOSMOS?.timeSystem?.combatRoundMs?.()');
  assert(g > 0 && pc > g && /\(stagger\+\+ % 8\) \* pace\.staggerMs/.test(fx) && /, pace\);/.test(fx),
    'T5a salwa (po regule widoku): tempo z `combatRoundMs()`, rozrzut z planu, plan przekazany smudze');
  const ct = tr.slice(tr.indexOf('  _spawnCombatTracer('), tr.indexOf('\n  }\n', tr.indexOf('  _spawnCombatTracer(')));
  assert(/lifetime: pace\.tracerMs/.test(ct) && /lifetime: pace\.flashMs/.test(ct) && /lifetime: pace\.shieldMs/.test(ct)
    && /delay: delay \+ pace\.flashDelayMs/.test(ct) && !/FX_TRACER_MS|FX_FLASH_MS|FX_SHIELD_MS|FX_FLASH_DELAY_MS/.test(ct),
    'T5b smuga / błysk / tarcza / uderzenie — czasy z planu tempa (bez dawnych stałych w salwie)');
  assert(/onTick: ids \? \(\) => this\._followTracerEnds\(line, ids\) : null/.test(ct) && /_followFxTarget\(ef\.mesh, ids\.target\)/.test(ct),
    'T5c końce smug i błyski idą za sprite\'ami statków');
  const tov = body('  _tickOrbitingVessels() {');
  const svp = body('  _syncVesselPositions(vessels) {');
  assert(/this\._placeFreeVessel\(id, entry, vx, vy\)/.test(tov) && /this\._placeFreeVessel\(vessel\.id, entry, vx, vy\)/.test(svp)
    && /const tSec = orbitClockSec\(\);/.test(tov), 'T5d płynne zbliżenie w obu miejscach ustawiania wolnego statku (zegar orbit bez zmian)');
  const pf = body('  _placeFreeVessel(vid, entry, vx, vy) {');
  assert(/_findActiveEncounterContaining\?\.\(vid\)/.test(pf) && /isEngagementInView\(/.test(pf) && /glideRetarget\(/.test(pf) && /combatRoundMs\?\.\(\)/.test(pf),
    'T5e uczestnik aktywnego starcia w oglądanym układzie — ruch przez jedną rundę (`combatRoundMs()`); poza starciem od razu');
  const tg = body('  _tickCombatGlide() {');
  assert(/glideStep\(g, dt\)/.test(tg) && /if \(g\.done \|\| paused\) continue;/.test(tg) && /isPaused/.test(tg), 'T5f krok co klatkę, w pauzie stoi');
  const loop = body('  _startLoop() {');
  const gl = loop.indexOf('this._tickCombatGlide()'); const wc = loop.indexOf('this._updateWatchCamera()');
  assert(gl > 0 && wc > gl && loop.indexOf('this._updateActiveEffects(') > gl, 'T5g płynne zbliżenie w pętli renderu PRZED kamerą i efektami');
  assert(!/StrikesBackTuning/.test(tr), 'T5h renderer bez tabeli strojenia (`combatRoundMs()` z `TimeSystem`)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
