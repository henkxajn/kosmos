// ═══════════════════════════════════════════════════════════════════════════════
// sb3_combat_closing_smoke — KEEPER Findingu 421 (AI STRIKES BACK S3, decyzja SB49)
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §6 (421).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: statek z misją wstrzymaną na walkę stał tam, gdzie walka się zaczęła, a strzał pada wyłącznie przy
//   `odległość ≤ zasięg broni` — broń krótsza niż odległość startu starcia nie strzelała NIGDY (S2b, część E: fregaty
//   z laserem 0,05 AU na strażnika z rakietami 0,30 AU — 0 strzałów, straty 30/30). Ruch z czasu gry nie pomagał:
//   runda trwa 110 ms czasu realnego, a auto-slow schodzi do 1 d/s ⇒ ~0,0003 AU na rundę.
// SB49: przed KAŻDĄ rundą uzbrojony statek bez żywego wroga w zasięgu własnej najdłuższej broni zbliża się do celu (cel
//   `engage`, dopóki żyje; inaczej najbliższy wróg) na 0,95 × ten zasięg; krok na ZEGARZE STARCIA. Statek trzymający
//   orbitę ciała stoi; uciekający — pominięty. Obie strony.
//
// ⚠ Zegar rund deterministyczny: jedno `_tick` = DOKŁADNIE jedna runda — pomocnik `round()` przesuwa ZEGAR STARCIA
//   (`timeSystem.simClockMs`, POLISH P1 / CP1) o `ROUND_INTERVAL_MS`. Ciała bez orbity (pozycje stałe), `_tick` DSCS
//   wołany wprost — ruch statków w scenie pochodzi WYŁĄCZNIE ze zbliżenia.
// ⚠ PRZECELOWANIE R-P1-1 (POLISH P1, zgoda właściciela 2026-10-17): do P1 pomocnik przesuwał podmienione
//   `performance.now` (rundy DSCS taktowane czasem REALNYM); od P1 rundy liczy zegar starcia z `TimeSystem`, więc
//   pomocnik przesuwa ten zegar. Asercje T1–T10 bez zmian (kotwica T10 `_tick(civDy) {` — bez zmian).
//
// PINY:
//   T1  fregata z laserem, `engage` na strażnika NA ORBICIE (rakiety 0,30) z 0,25 AU: dochodzi do zasięgu i strzela
//       (KONTROLA: strażnik strzela — starcie żyje)
//   T2  statek trzymający orbitę ciała nie rusza się — strażnik poza zasięgiem własnych rakiet (świadek: wolna fregata
//       w tej samej scenie się zbliża); statek gracza na orbicie ciała — też stoi
//   T3  uciekający (znacznik odwrotu) nie jest przyciągany (świadek: bliźniak bez znacznika się zbliża); statek w locie
//       pod własną misją (`in_transit`) też nie
//   T4  krok nie zależy od prędkości gry: jedna runda przy `civDy` 0,0001 i 5,0 — ten sam krok = prędkość × 0,025 AU
//   T5  KONTROLA: statek, który ma wroga w zasięgu, nie rusza się (i strzela)
//   T6  zbliżenie kończy się na 0,95 × zasięg (bez przeskoku)
//   T7  cel `engage` ma pierwszeństwo przed najbliższym wrogiem (oba poza zasięgiem)
//   T8  obie strony: wolny statek AI z laserem zbliża się do statku gracza
//   T9  bezbronny statek nie rusza się
//   T10 pin źródłowy: wywołanie stoi w pętli rund `_tick` PRZED `_tickEncounter`; krok = CIV_PER_ROUND / CIV_TIME_SCALE
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import * as DSCSmod            from '../../systems/DeepSpaceCombatSystem.js';
import { readFileSync }        from 'node:fs';

const { DeepSpaceCombatSystem, ROUND_INTERVAL_MS, CIV_PER_ROUND } = DSCSmod;

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

const AU  = GAME_CONFIG.AU_TO_PX;
const CIV = GAME_CONFIG.CIV_TIME_SCALE ?? 12;
const SYS = 'sys_t';
const FRIGATE_SPEED = 1.1139813200670667;   // hull_frigate z samym laserem (AU / rok gry)
const STEP = FRIGATE_SPEED * CIV_PER_ROUND / CIV;   // oczekiwany krok na rundę (AU)
const EMP = 'emp_t';

// ── zegar rund: jedno `_tick` = jedna runda (R-P1-1 — zegar starcia, `timeSystem.simClockMs`) ─────────────────
const CLOCK0_MS = 1000;

let vMgr, mos, dscs;
function scene() {
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 100, simClockMs: CLOCK0_MS }, activeSystemId: SYS };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  // ciała BEZ orbity — pozycje stałe przez całą scenę
  EntityManager.add({ id: 'p_cap', type: 'planet', name: 'Cap', systemId: SYS, x: 3 * AU, y: 0, radius: 4, mass: 1, visual: { radius: 4 } });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Home', systemId: SYS, x: -3 * AU, y: 0, radius: 4, mass: 1, visual: { radius: 4 } });
  vMgr = new VesselManager(); mos = new MovementOrderSystem(vMgr); dscs = new DeepSpaceCombatSystem(vMgr);
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  Object.assign(window.KOSMOS, {
    civMode: true, vesselManager: vMgr, movementOrderSystem: mos, deepSpaceCombatSystem: dscs,
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} },
    debug: { combatTrace: false },
  });
}
function ship({ x, y, name = 'S', empire = null, modules = ['weapon_laser', 'engine_ion'], speed = FRIGATE_SPEED, dockedAt = null } = {}) {
  const v = vMgr.createAndRegister('hull_frigate', 'p_home', { name, modules });
  v.position.x = x; v.position.y = y; v.position.state = 'orbiting'; v.position.dockedAt = dockedAt;
  v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.speedAU = speed; v.systemId = SYS;
  if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; }
  return v;
}
const MISSILES = ['weapon_missile', 'weapon_missile', 'engine_ion', 'armor_heavy'];
const distAU = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) / AU;
const enc = () => [...dscs._activeEncounters.values()][0] ?? null;
function round(civDy = 0.01) { window.KOSMOS.timeSystem.simClockMs += ROUND_INTERVAL_MS; dscs._tick(civDy); }
const shotsBy = (e, id) => (e?.timeline ?? []).flatMap(r => r.events).filter(ev => ev.attacker === id);
const posOf = (v) => ({ x: v.position.x, y: v.position.y });
const samePos = (a, b) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
/** Starcie bez zbiórki: obie strony od razu w starciu (wzór `startEngagement` z rozkazem `engage`). */
function engage(a, b) {
  const r = mos.issueOrder(a.id, { type: 'engage', targetEntityId: b.id, issuedBy: 'keeper' });
  const ok = dscs.handleCombatRangeEnter(a.id, b.id, false);
  return { order: r?.ok === true, encounter: ok === true };
}

// ═══ T1 ═══════════════════════════════════════════════════════════════════════
header('T1  trzy fregaty z laserem, `engage` na strażnika NA ORBICIE z 0,25 AU: dochodzą do zasięgu i strzelają');
{
  // scena pomiaru części E (a): trzy fregaty gracza z samym laserem, strażnik z rakietami na orbicie stolicy AI
  scene();
  const guard = ship({ x: 3 * AU, y: 0, name: 'Guard', empire: EMP, modules: MISSILES, dockedAt: 'p_cap' });
  const frigs = [-0.02, 0, 0.02].map((dy, i) => ship({ x: 3 * AU - 0.25 * AU, y: dy * AU, name: `Frig${i}` }));
  const orders = frigs.map(f => mos.issueOrder(f.id, { type: 'engage', targetEntityId: guard.id, issuedBy: 'keeper' })?.ok === true);
  const ok = dscs.handleCombatRangeEnter(frigs[1].id, guard.id, false);
  const e = enc();
  for (const f of frigs) if (f !== frigs[1]) dscs._joinEncounter(e, f.id);
  const g0 = posOf(guard);
  let guardMoved = false, rounds = 0;
  for (let i = 0; i < 20 && e?.isActive; i++) {
    round(); rounds++;
    if (e.isActive && (!samePos(posOf(guard), g0) || guard.position.dockedAt !== 'p_cap')) guardMoved = true;
  }
  const fs = frigs.flatMap(f => shotsBy(e, f.id));
  const gs = shotsBy(e, guard.id);
  console.log(`     rund ${rounds}; strzały fregat ${fs.length} (najbliżej ${fs.length ? Math.min(...fs.map(x => x.distanceAU)).toFixed(4) : '—'} AU, najdalej ${fs.length ? Math.max(...fs.map(x => x.distanceAU)).toFixed(4) : '—'} AU), strażnika ${gs.length}`);
  assert(orders.every(Boolean) && ok === true && frigs.every(f => e?.vesselStates?.has(f.id)), 'T1-0 KONTROLA: rozkazy `engage` przyjęte, trzy fregaty i strażnik w jednym starciu');
  assert(gs.length > 0, 'T1-0b KONTROLA: strażnik strzela (starcie żyje, rundy biegną)');
  assert(fs.length > 0 && fs.every(x => x.distanceAU <= 0.05 + 1e-9), 'T1 SEDNO: fregaty strzelają — każdy strzał z odległości ≤ 0,05 AU (zasięg lasera)');
  assert(rounds > 1 && !guardMoved, 'T1b KONTROLA: strażnik w trakcie starcia nie ruszył się z orbity (ten sam punkt, `dockedAt` bez zmian)');
}

// ═══ T2 ═══════════════════════════════════════════════════════════════════════
header('T2  statek trzymający orbitę ciała nie rusza się (świadek: wolna fregata się zbliża)');
{
  scene();
  const guard = ship({ x: 3 * AU, y: 0, name: 'Guard', empire: EMP, modules: MISSILES, dockedAt: 'p_cap' });
  const frig  = ship({ x: 3 * AU - 0.40 * AU, y: 0, name: 'Frig' });   // poza zasięgiem rakiet strażnika (0,30)
  const g0 = posOf(guard), f0 = posOf(frig);
  engage(frig, guard);
  round();
  assert(distAU(frig, { position: f0 }) > 1e-6, 'T2-0 świadek: wolna fregata w tym samym starciu zbliżyła się');
  assert(distAU(frig, { position: f0 }) > 1e-6 && samePos(posOf(guard), g0) && guard.position.dockedAt === 'p_cap',
    'T2a strażnik (na orbicie, wróg poza zasięgiem rakiet) stoi — gdy wolna fregata tego starcia się zbliża');
  // statek GRACZA na orbicie ciała, wróg poza zasięgiem — też stoi
  scene();
  const foe  = ship({ x: 0, y: 2 * AU, name: 'Foe', empire: EMP });
  const held = ship({ x: 0, y: 2 * AU - 0.30 * AU, name: 'Held', dockedAt: 'p_home' });
  const free = ship({ x: 0.01 * AU, y: 2 * AU - 0.30 * AU, name: 'Free' });
  const h0 = posOf(held), r0 = posOf(free);
  engage(free, foe);
  const e = enc();
  dscs._joinEncounter(e, held.id);
  held.position.dockedAt = 'p_home';                                     // orbita ciała (zamrożenie nie zdejmuje pinu)
  round();
  assert(e?.vesselStates?.has(held.id) && distAU(free, { position: r0 }) > 1e-6, 'T2-0b świadek: statek na orbicie jest w starciu, wolny bliźniak się zbliżył');
  assert(e?.vesselStates?.has(held.id) && distAU(free, { position: r0 }) > 1e-6 && samePos(posOf(held), h0),
    'T2b statek gracza na orbicie ciała stoi — gdy wolny bliźniak się zbliża');
}

// ═══ T3 ═══════════════════════════════════════════════════════════════════════
header('T3  uciekający nie jest przyciągany; statek w locie pod własną misją też nie');
{
  scene();
  const foe  = ship({ x: 0, y: 2 * AU, name: 'Foe', empire: EMP });
  const run  = ship({ x: 0, y: 2 * AU - 0.30 * AU, name: 'Run' });
  const twin = ship({ x: 0.01 * AU, y: 2 * AU - 0.30 * AU, name: 'Twin' });
  engage(twin, foe);
  const e = enc();
  dscs._joinEncounter(e, run.id);
  run.movementOrder = { id: 'mo_keeper', type: 'moveToPoint', status: 'active', _retreatFromCombat: true };
  const u0 = posOf(run), t0 = posOf(twin);
  round();
  assert(distAU(twin, { position: t0 }) > 1e-6, 'T3-0 świadek: bliźniak bez znacznika odwrotu się zbliżył');
  assert(distAU(twin, { position: t0 }) > 1e-6 && samePos(posOf(run), u0),
    'T3a uciekający (`_retreatFromCombat`) nie ruszył się — gdy bliźniak bez znacznika się zbliża');
  // statek w locie pod własną misją
  scene();
  const foe2 = ship({ x: 0, y: 2 * AU, name: 'Foe', empire: EMP });
  const fly  = ship({ x: 0, y: 2 * AU - 0.30 * AU, name: 'Fly' });
  const tw2  = ship({ x: 0.01 * AU, y: 2 * AU - 0.30 * AU, name: 'Twin' });
  engage(tw2, foe2);
  dscs._joinEncounter(enc(), fly.id);
  fly.position.state = 'in_transit';                                      // rozkaz ruchu wydany w trakcie walki
  const y0 = posOf(fly), w0 = posOf(tw2);
  round();
  assert(distAU(tw2, { position: w0 }) > 1e-6, 'T3-0b świadek: bliźniak (zamrożony, bez własnej misji) się zbliżył');
  assert(distAU(tw2, { position: w0 }) > 1e-6 && samePos(posOf(fly), y0),
    'T3b statek `in_transit` (własna misja) nie jest przyciągany — gdy zamrożony bliźniak się zbliża');
}

// ═══ T4 ═══════════════════════════════════════════════════════════════════════
header('T4  krok nie zależy od prędkości gry (jedna runda przy civDy 0,0001 i 5,0)');
{
  const stepAt = (civDy) => {
    scene();
    const guard = ship({ x: 3 * AU, y: 0, name: 'Guard', empire: EMP, modules: MISSILES, dockedAt: 'p_cap' });
    const frig  = ship({ x: 3 * AU - 0.25 * AU, y: 0, name: 'Frig' });
    engage(frig, guard);
    const f0 = posOf(frig);
    round(civDy);
    return distAU(frig, { position: f0 });
  };
  const slow = stepAt(0.0001), fast = stepAt(5.0);
  console.log(`     krok przy civDy 0,0001: ${slow.toFixed(6)} AU · przy 5,0: ${fast.toFixed(6)} AU · oczekiwany ${STEP.toFixed(6)} AU`);
  assert(slow > 0, 'T4-0 świadek: krok niezerowy');
  assert(slow > 0 && Math.abs(slow - fast) < 1e-12, 'T4a ten sam NIEZEROWY krok przy obu prędkościach gry');
  assert(Math.abs(slow - STEP) < 1e-9, 'T4b krok = prędkość × CIV_PER_ROUND / CIV_TIME_SCALE (0,025 roku gry na rundę)');
}

// ═══ T5 ═══════════════════════════════════════════════════════════════════════
header('T5  KONTROLA: statek z wrogiem w zasięgu nie rusza się');
{
  scene();
  const foe  = ship({ x: 0, y: 2 * AU, name: 'Foe', empire: EMP, modules: MISSILES });
  const near = ship({ x: 0, y: 2 * AU - 0.04 * AU, name: 'Near' });
  engage(near, foe);
  const e = enc();
  const n0 = posOf(near);
  for (let i = 0; i < 3; i++) round();
  assert(samePos(posOf(near), n0), 'T5a fregata 0,04 AU od wroga (laser 0,05) stoi');
  assert(shotsBy(e, near.id).length > 0, 'T5b i strzela');
}

// ═══ T6 ═══════════════════════════════════════════════════════════════════════
header('T6  zbliżenie kończy się na 0,95 × zasięg');
{
  scene();
  const foe = ship({ x: 0, y: 2 * AU, name: 'Foe', empire: EMP, modules: ['engine_ion'] });   // bezbronny — nie strzela
  const frig = ship({ x: 0, y: 2 * AU - 0.20 * AU, name: 'Frig' });
  engage(frig, foe);
  const e = enc();
  for (let i = 0; i < 15 && e?.isActive; i++) round();
  const d = distAU(frig, foe);
  console.log(`     odległość końcowa ${d.toFixed(6)} AU (0,95 × 0,05 = 0,0475)`);
  assert(Math.abs(d - 0.0475) < 1e-9, 'T6 zatrzymuje się DOKŁADNIE na 0,95 × zasięg lasera (ostatni krok przycięty)');
  assert(shotsBy(e, frig.id).length > 0, 'T6b i strzela z tej odległości');
}

// ═══ T7 ═══════════════════════════════════════════════════════════════════════
header('T7  cel `engage` ma pierwszeństwo przed najbliższym wrogiem');
{
  scene();
  const nearFoe = ship({ x: 0, y: 2 * AU, name: 'Near', empire: EMP, modules: ['engine_ion'] });
  const target  = ship({ x: 0.35 * AU, y: 2 * AU - 0.20 * AU, name: 'Target', empire: EMP, modules: ['engine_ion'] });
  const frig    = ship({ x: 0, y: 2 * AU - 0.20 * AU, name: 'Frig' });
  engage(frig, target);
  dscs._joinEncounter(enc(), nearFoe.id);
  const dT0 = distAU(frig, target), dN0 = distAU(frig, nearFoe);
  round();
  const dT1 = distAU(frig, target);
  console.log(`     do celu engage ${dT0.toFixed(4)} → ${dT1.toFixed(4)} AU; do najbliższego ${dN0.toFixed(4)} → ${distAU(frig, nearFoe).toFixed(4)} AU`);
  assert(dN0 < dT0 && enc()?.vesselStates?.has(nearFoe.id), 'T7-0 KONTROLA sceny: najbliższy wróg jest bliżej niż cel `engage` i jest w starciu');
  assert(Math.abs((dT0 - dT1) - STEP) < 1e-9, 'T7 krok w stronę celu `engage` (pełny krok)');
}

// ═══ T8 ═══════════════════════════════════════════════════════════════════════
header('T8  obie strony: wolny statek AI z laserem zbliża się do statku gracza');
{
  scene();
  const mine = ship({ x: 0, y: 2 * AU, name: 'Mine', modules: MISSILES });
  const ai   = ship({ x: 0, y: 2 * AU - 0.25 * AU, name: 'AI', empire: EMP });
  const ok = dscs.handleCombatRangeEnter(mine.id, ai.id, false) || (() => { mos.issueOrder(mine.id, { type: 'engage', targetEntityId: ai.id }); return dscs.handleCombatRangeEnter(mine.id, ai.id, false); })();
  const a0 = posOf(ai);
  round();
  assert(ok === true && !!enc(), 'T8-0 KONTROLA: starcie gracz ↔ AI powstało');
  assert(Math.abs(distAU(ai, { position: a0 }) - STEP) < 1e-9 && ai.position.dockedAt == null, 'T8 statek AI (laser, wróg poza zasięgiem) zbliżył się o pełny krok');
}

// ═══ T9 ═══════════════════════════════════════════════════════════════════════
header('T9  bezbronny statek nie rusza się');
{
  scene();
  const foe  = ship({ x: 0, y: 2 * AU, name: 'Foe', empire: EMP, modules: MISSILES });
  const arm  = ship({ x: 0.01 * AU, y: 2 * AU - 0.40 * AU, name: 'Armed' });
  const bare = ship({ x: 0, y: 2 * AU - 0.40 * AU, name: 'Bare', modules: ['engine_ion'] });
  engage(arm, foe);
  dscs._joinEncounter(enc(), bare.id);
  const b0 = posOf(bare), a0 = posOf(arm);
  round();
  assert(enc()?.vesselStates?.has(bare.id) && distAU(arm, { position: a0 }) > 1e-6, 'T9-0 świadek: bezbronny jest w starciu, uzbrojony bliźniak się zbliżył');
  assert(enc()?.vesselStates?.has(bare.id) && distAU(arm, { position: a0 }) > 1e-6 && samePos(posOf(bare), b0),
    'T9 bezbronny stoi — gdy uzbrojony bliźniak tego starcia się zbliża');
}

// ═══ T10 ══════════════════════════════════════════════════════════════════════
header('T10 pin źródłowy: wywołanie w pętli rund `_tick` przed `_tickEncounter`; krok z zegara starcia');
{
  const src = strip(readFileSync(new URL('../../systems/DeepSpaceCombatSystem.js', import.meta.url), 'utf8'));
  const tickBody = src.slice(src.indexOf('  _tick(civDy) {'), src.indexOf('  _closeToWeaponRange(encounter) {'));
  const iClose = tickBody.indexOf('this._closeToWeaponRange(encounter);');
  const iRound = tickBody.indexOf('this._tickEncounter(encounter, CIV_PER_ROUND);');
  assert(iClose > 0 && iRound > iClose, 'T10a `_closeToWeaponRange(encounter)` w pętli rund `_tick`, PRZED `_tickEncounter`');
  assert(DSCSmod.CLOSE_STEP_YEARS === CIV_PER_ROUND / CIV && DSCSmod.CLOSE_RANGE_FACTOR === 0.95,
    'T10b `CLOSE_STEP_YEARS` = CIV_PER_ROUND / CIV_TIME_SCALE, `CLOSE_RANGE_FACTOR` = 0,95');
  assert(/_allOutsideOf[\s\S]*const isRetreating = _isRetreatingFromCombat;/.test(src),
    'T10c znacznik odwrotu — jedno źródło (`_isRetreatingFromCombat`) dla `_allOutsideOf` i zbliżenia');
}

console.log(`\n═══ sb3_combat_closing_smoke: ${pass} PASS / ${fail} FAIL ═══`);
if (fail > 0) process.exit(1);
