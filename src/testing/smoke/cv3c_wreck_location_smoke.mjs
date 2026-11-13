// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv3c_wreck_location_smoke — KEEPER ARC COMBAT VISUALS, krok CV-3c (decyzja właściciela 44 (5) — zatwierdzone dotknięcie mechaniki:
//   wrak tam, gdzie zginął każdy okręt, a nie w punkcie środkowym starcia; rodzina Findingu 460). Plan §3.2-44, §4 CV-3c.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// PRAWDZIWY DSCS + EnemyAttackHandler (`_turnIntoWreck`) w świecie headless, bitwy stagera `cvBattle` (jak `m1_battle_end_smoke`).
// CO PINUJE (logika):
//   W1 SEDNO: każdy wrak (pozycja logiczna `position` i `wreckLocation`) stoi DOKŁADNIE w pozycji okrętu z chwili jego śmierci
//      (migawka po rundzie, w której hp przeszło przez 0) — 10 na 10, ziarna 1–4
//   W2 KONTROLA „kuli jeża”: wraki NIE w punkcie środkowym starcia i w wielu różnych miejscach
//   W3 wynik bez zmian: ta sama bitwa z punktem środkowym (zachowanie sprzed CV-3c — `_deathPointOf` zwraca null) — sygnatura,
//      ślad każdej rundy (zdarzenia, HP) i rekord bitwy identyczne; różni się WYŁĄCZNIE miejsce wraków (świadek: różnią się)
//   W4 mapa śmierci przejściowa: `serialize()` starcia bez `_deathPos`; starcie bez wpisu (wczytane w trakcie) — wrak w bieżącej
//      pozycji okrętu; bez pozycji — punkt środkowy jak dawniej
//   W5 bliźniak VCS (ścieżka wycofania przy `m4DeepSpaceCombat` OFF): wraki przegranych w ich własnych pozycjach
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { reseed }                from '../headless/env.js';
import EventBus                  from '../../core/EventBus.js';
import EntityManager             from '../../core/EntityManager.js';
import gameState                 from '../../core/GameState.js';
import { GAME_CONFIG }           from '../../config/GameConfig.js';
import { TimeSystem }            from '../../systems/TimeSystem.js';
import { VesselManager }         from '../../systems/VesselManager.js';
import { MovementOrderSystem }   from '../../systems/MovementOrderSystem.js';
import { ProximitySystem }       from '../../systems/ProximitySystem.js';
import { VesselCombatSystem }    from '../../systems/VesselCombatSystem.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { EnemyAttackHandler }    from '../../systems/EnemyAttackHandler.js';
import { OrbitalSpaceSystem }    from '../../systems/OrbitalSpaceSystem.js';
import { AutoRetreatSystem }     from '../../systems/AutoRetreatSystem.js';
import { setNextVesselId }       from '../../entities/Vessel.js';
import { cvBattleDebugHelpers }  from '../../debug/CvBattleStager.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const guard = (label, fn) => { try { fn(); } catch (e) { assert(false, `${label} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };

const AU = GAME_CONFIG.AU_TO_PX;
const SYS = 'sys_t';
const EMP = 'emp_t';
const clock = { now: 1e7 };
performance.now = () => clock.now;
let ts, vm, mos, prox, dscs, vcs, eah, oss, saveSys, rec;

function world() {
  EventBus.clear(); EntityManager.clear(); gameState.reset?.();
  global.window = global.window ?? {};
  clock.now = 1e7;
  setNextVesselId(1);
  ts = new TimeSystem();
  ts.gameTime = 100.00002;
  ts.multiplierIndex = 1;
  window.KOSMOS = { timeSystem: ts, activeSystemId: SYS };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: SYS, x: -4 * AU, y: 0, radius: 6, mass: 1, visual: { radius: 6 } });
  EntityManager.add({ id: 'p_rock', type: 'planet', name: 'Skala', systemId: SYS, x: 3 * AU, y: 0, radius: 6, mass: 1, visual: { radius: 6 } });
  vm = new VesselManager(); mos = new MovementOrderSystem(vm); prox = new ProximitySystem(vm);
  dscs = new DeepSpaceCombatSystem(vm); vcs = new VesselCombatSystem(vm); eah = new EnemyAttackHandler(); oss = new OrbitalSpaceSystem();
  saveSys = { _autosaveInterval: 1 };
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {}, fleet: [] }];
  const empires = [{ id: EMP, name: 'Testowe Imperium' }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: EntityManager.get('p_home'), vesselManager: vm, movementOrderSystem: mos,
    proximitySystem: prox, deepSpaceCombatSystem: dscs, enemyAttackHandler: eah, orbitalSpaceSystem: oss, entityManager: EntityManager,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols,
      getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} },
    intelSystem: { getVesselContact: () => ({ quality: 'unknown' }), getLevel: () => 'unknown', isAtLeast: () => false },
    empireRegistry: { listAll: () => empires, get: (id) => empires.find(e => e.id === id) ?? null },
    debug: { combatTrace: false },
  });
  const ar = new AutoRetreatSystem(vm, window.KOSMOS.colonyManager, mos);
  window.KOSMOS.autoRetreatSystem = ar;
  rec = { battles: [], wrecks: [], rounds: [], death: new Map(), mid: null, serialized: null };
  EventBus.on('battle:resolved', ({ result }) => { if (result?.id?.startsWith?.('battle_ds_')) rec.battles.push(JSON.parse(JSON.stringify(result))); });
  EventBus.on('vessel:wrecked', ({ vesselId }) => rec.wrecks.push(vesselId));
  // migawka po każdej rundzie: pozycja okrętu, którego hp właśnie przeszło przez 0 (= pozycja z chwili śmierci — martwy w wolnej
  // przestrzeni się nie rusza); ślad rundy do porównania wyniku (W3)
  const tick = dscs._tickEncounter.bind(dscs);
  dscs._tickEncounter = (enc, civDy) => {
    tick(enc, civDy);
    rec.mid = { x: enc.location.point.x, y: enc.location.point.y };
    for (const [id, s] of enc.vesselStates) {
      if (s.hp > 0 || rec.death.has(id)) continue;
      const p = vm.getVessel(id)?.position;
      if (p) rec.death.set(id, { x: p.x, y: p.y });
    }
    if (!rec.serialized) { const ser = dscs.serialize(); if (Object.keys(ser).length) rec.serialized = ser; }
    const last = enc.timeline?.[enc.timeline.length - 1];
    rec.rounds.push({ id: enc.id, round: enc.currentRound,
      events: (last?.events ?? []).map(e => [e.attacker, e.target, e.weapon, e.hit, +Number(e.damage).toFixed(6)]),
      hp: [...enc.vesselStates].map(([id, s]) => [id, +Number(s.hp).toFixed(6)]) });
  };
}

function frame(ms = 16) { clock.now += ms; ts.update(ms); }
const encActive = () => dscs.listActive().length > 0;
const helpers = () => cvBattleDebugHelpers({ getRenderer: () => null, getSaveSystem: () => saveSys });
function runToEnd(maxFrames = 200000) {
  ts.play();
  for (let n = 0; n < maxFrames; n++) { frame(); if (!encActive() && rec.battles.length > 0) break; }
}
function battle(seed, { legacy = false } = {}) {
  reseed('cv3c-wreck-location'); world();
  if (legacy) dscs._deathPointOf = () => null;   // zachowanie sprzed CV-3c: każdy wrak w punkcie środkowym
  const st = helpers().cvBattle({ seed, nA: 10, nB: 10 });
  if (!st?.ok) throw new Error('cvBattle: ' + JSON.stringify(st));
  runToEnd();
  const wrecks = rec.wrecks.map((id) => vm.getVessel(id)).filter(Boolean)
    .map((v) => ({ id: v.id, pos: { x: v.position.x, y: v.position.y }, loc: v.wreckLocation ? { ...v.wreckLocation } : null, death: rec.death.get(v.id) ?? null }));
  return { battles: rec.battles, rounds: rec.rounds, wrecks, mid: rec.mid, serialized: rec.serialized };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const stripLoc = (bs) => JSON.stringify(bs);

// ═══ W1 / W2 ══════════════════════════════════════════════════════════════════════════════════════════════════════
const RUNS = {};
header('W1 / W2 — wrak w miejscu śmierci okrętu, nie w punkcie środkowym (10 na 10, ziarna 1–4)');
guard('W1', () => {
  let n = 0, exact = 0, locOk = 0, offMid = 0;
  const spots = new Set();
  for (const seed of [1, 2, 3, 4]) {
    const r = battle(seed);
    RUNS[seed] = r;
    for (const w of r.wrecks) {
      n++;
      if (w.death && dist(w.pos, w.death) < 1e-9) exact++;
      if (w.death && w.loc && dist(w.loc, w.death) < 1e-9) locOk++;
      if (r.mid && dist(w.pos, r.mid) > 1e-3 * AU) offMid++;
      spots.add(`${seed}|${w.pos.x.toFixed(3)}|${w.pos.y.toFixed(3)}`);
    }
    console.log(`     ziarno ${seed}: rund ${r.battles[0]?.turns}, wraków ${r.wrecks.length}, punkt środkowy (${r.mid?.x.toFixed(1)}, ${r.mid?.y.toFixed(1)}) px, `
      + `rozrzut wraków ${(Math.max(...r.wrecks.map((w) => dist(w.pos, r.mid))) / AU).toFixed(3)} AU od środka`);
  }
  assert(n >= 20 && exact === n && locOk === n, `W1 SEDNO: ${exact} / ${n} wraków — pozycja logiczna i \`wreckLocation\` = pozycja z chwili śmierci (≤ 1e-9 px)`);
  assert(offMid === n && spots.size === n, `W2 KONTROLA „kuli jeża”: ${offMid} / ${n} wraków poza punktem środkowym, ${spots.size} różnych miejsc`);
});

// ═══ W3 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('W3 — wynik bez zmian: ta sama bitwa z wrakami w punkcie środkowym (sprzed CV-3c) — inne WYŁĄCZNIE miejsca wraków');
guard('W3', () => {
  for (const seed of [1, 3]) {
    const now = RUNS[seed] ?? battle(seed), old = battle(seed, { legacy: true });
    assert(now.battles.length >= 1 && stripLoc(now.battles) === stripLoc(old.battles), `W3a ziarno ${seed}: rekord bitwy identyczny (zwycięzca, straty, rundy, oś zdarzeń, HP)`);
    assert(now.rounds.length >= 5 && JSON.stringify(now.rounds) === JSON.stringify(old.rounds), `W3b ziarno ${seed}: ślad każdej rundy identyczny (${now.rounds.length} rund — zdarzenia, HP)`);
    const sameIds = JSON.stringify(now.wrecks.map((w) => w.id)) === JSON.stringify(old.wrecks.map((w) => w.id));
    const moved = now.wrecks.filter((w, i) => dist(w.pos, old.wrecks[i].pos) > 1e-3 * AU).length;
    const atMid = old.wrecks.every((w) => old.mid && dist(w.pos, old.mid) < 1e-9);
    assert(sameIds && moved === now.wrecks.length && atMid,
      `W3c ziarno ${seed}: te same wraki (${now.wrecks.length}); dawniej WSZYSTKIE w punkcie środkowym, dziś każdy w swoim miejscu (${moved} przesuniętych)`);
  }
});

// ═══ W4 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('W4 — mapa śmierci przejściowa: poza zapisem; bez wpisu — bieżąca pozycja; bez pozycji — punkt środkowy');
guard('W4', () => {
  const r = RUNS[1] ?? battle(1);
  const ser = JSON.stringify(r.serialized ?? {});
  assert(ser.length > 100 && !ser.includes('_deathPos') && !ser.includes('deathPos'), 'W4a `serialize()` starcia bez mapy śmierci (zapis bez zmiany formatu)');
  const enc = { _deathPos: new Map([['a', { x: 1, y: 2 }]]) };
  const dp = (e, v) => DeepSpaceCombatSystem.prototype._deathPointOf.call(dscs, e, v);   // metoda klasy (W3 podmienia ją na instancji)
  const pa = dp(enc, { id: 'a', position: { x: 9, y: 9 } });
  const pb = dp(enc, { id: 'b', position: { x: 7, y: 8 } });
  const pc = dp(enc, { id: 'c', position: null });
  assert(pa?.x === 1 && pa?.y === 2 && pb?.x === 7 && pb?.y === 8 && pc === null,
    'W4b punkt wraku: wpis z chwili śmierci › bieżąca pozycja (starcie wczytane w trakcie) › null (wołający — punkt środkowy)');
});

// ═══ W5 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('W5 — bliźniak VCS (wycofanie przy `m4DeepSpaceCombat` OFF): wraki przegranych w ich własnych pozycjach');
guard('W5', () => {
  reseed('cv3c-wreck-location'); world();
  const mk = (name, x, y, enemy) => {
    const v = vm.createAndRegister('hull_frigate', 'p_home', { name });
    v.position.x = x; v.position.y = y; v.position.state = 'orbiting'; v.position.dockedAt = null; v.systemId = SYS; v.serviceState = 'active';
    if (enemy) { v.ownerEmpireId = EMP; v.owner = EMP; v.isEnemy = true; }
    return v;
  };
  const A = [mk('A1', 100, 10, false), mk('A2', 104, 18, false)];
  const B = [mk('B1', 130, -5, true), mk('B2', 126, 22, true)];
  const before = B.map((v) => ({ x: v.position.x, y: v.position.y }));
  const mid = { x: 115, y: 11 };
  vcs._applyOutcome(A, B, { winner: 'A', retreated: null, rounds: 3, turns: 3, timeline: [] }, { systemId: SYS, planetId: null, point: mid }, 'player', EMP, 100);
  const ok = B.every((v, i) => v.isWreck && dist(v.wreckLocation, before[i]) < 1e-9 && dist(v.position, before[i]) < 1e-9);
  assert(ok && A.every((v) => !v.isWreck), `W5 przegrani (${B.length}) — wrak w swojej pozycji, nie w punkcie środkowym (${mid.x}, ${mid.y}); zwycięzcy żywi`);
});

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
