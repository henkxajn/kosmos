// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// m1_battle_end_smoke — KEEPER kroku MECHANIKI poza arciem CV: M1 „bitwy do końca” (decyzja 33, decyzje właściciela 1–8
//   z 2026-11-11; COMBAT_VISUALS_PLAN.md §4 «M1», Findingi 657, 688–693).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (wyłącznie logika):
//   E1 bez time-outu: 10 na 10 stagera (ziarno 1) gra dłużej niż 20 rund; okręt idzie na wrak WYŁĄCZNIE przy 0 HP (zero wraków
//      żywych w 20 bitwach 10 na 10); koniec — zniszczenie strony albo ucieczka (`endReason`); świadek: wraki są (zabicia)
//   E2 ogień jednoczesny: 1 na 1, obie fregaty po 1 HP w zasięgu — okręt zestrzelony w rundzie strzela w niej ⇒ wzajemne
//      zniszczenie (remis); świadek — w tej rundzie strzelają OBIE strony
//   E3 lustrzane bitwy (stager `engage: 0` — bez rozkazów, obie strony biją najbliższego) 2v2 i 5v5, ziarna 1–20: podział
//      wygranych symetryczny (|A − B| ≤ 6, każda strona ≥ 5); domyślny stager (`engage: 1` — „Zaangażuj” tylko A) — odczyt
//   E4 strażnik „nikt nie może zadać obrażeń”: (a) w bitwach stagera (2v2 / 5v5 / 10v10 × 20 ziaren) NIGDY (ani strażnik, ani
//      bezpiecznik); (b) zbudowany pat — dwie grupy przypięte do orbit dwóch ciał poza zasięgiem: koniec w 1. rundzie, remis,
//      zero wraków żywych, zdarzenie audytu; KONTROLA — ta sama geometria z wolnym uzbrojonym okrętem: walka trwa;
//      (c) start: para w tej geometrii NIE zakłada starcia (odmowa), KONTROLA — wolny uzbrojony zakłada; (d) tarcza nie do
//      przebicia (regeneracja ≥ obrażenia strony) wobec bezbronnego — strażnik; KONTROLA zwykła tarcza — walka trwa
//   E5 ukryty bezpiecznik: starcie bez rozstrzygnięcia (HP 1e9 po obu stronach) kończy się na `SAFETY_ROUND_CAP` remisem bez wraków
//      żywych + zdarzenie audytu
//   E6 ucieczka = prawdziwy lot: (a) „Wycofaj się z bitwy” gracza — lot na zegarze starcia (≥ 0,02 AU na rundę), starcie trwa,
//      dopóki uciekający jest bliżej niż 0,5 AU; po wyjściu — lot przeplanowany (przylot w punkcie ciała na chwilę przylotu);
//      (b) odwrót AI przy niskim HP: rozkazy W TRAKCIE starcia (`combat:retreatStarted`), starcie trwa ≥ 1 rundę, kończy się
//      `retreated: 'B'` / `disengage` z żywymi AI poza 0,5 AU; `AutoRetreatSystem` nie wydaje drugiego rozkazu (jedna linia na okręt);
//      (c) brak natychmiastowego ponownego zwarcia: para (gracz, uciekający) po końcu starcia — odmowa; KONTROLA para bez uciekającego
//      — nowe starcie
//   E7 determinizm: ten sam stager 5v5 (ziarno 5) dwa razy — identyczny ślad rund i wynik
//   E8 ścieżka orbitalna (`BattleSystem.resolveBattle`): bez limitu 30 tur (rozstrzyga odwrót / zniszczenie); bezbronni — remis
//      bez tur (dawniej 30 tur i wygrana obrońcy B przy równych HP); tarcza nie do przebicia — pat; bezpiecznik 200 tur — pat;
//      `VesselCombatSystem._applyOutcome` przy pacie nie rozbija nikogo, KONTROLA remis przez zniszczenie — rozbija obie strony
//   E9 pasek walki: linia „R n” (PL i EN), bez pola limitu; źródło bez `ROUND_CAP`; `EnemyAttackHandler` ma gałąź patu
//   E10 audyt: trzy nowe zdarzenia w `DebugLog.TRACKED_EVENTS`
//   E11 stager `random` (Finding 699, kontrola właściciela M1): każda strona osobno losuje kadłub i broń główną z ziarna —
//      floty inne niż lustro, deterministyczne, pozycje bez zmian, jawne `hulls` / `weapons` wygrywają; przez prawdziwy
//      `cvBattle` statki w świecie = szyk, odczyt `fleets` = świat; KONTROLE — bez `random` szyk i odczyt co do bitu jak dotąd
//
// ⚠ Fail-first: `SAFETY_ROUND_CAP`, `isStalemate`, `rebaseTransitFromHere` powstają w tym kroku — import przestrzeni nazw, piny
//   DEGRADUJĄ (czerwone), suita się nie przerywa; każdy blok łapie wyjątek.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { reseed }                from '../headless/env.js';
import { readFileSync }          from 'node:fs';
import EventBus                  from '../../core/EventBus.js';
import EntityManager             from '../../core/EntityManager.js';
import gameState                 from '../../core/GameState.js';
import { GAME_CONFIG }           from '../../config/GameConfig.js';
import { TimeSystem }            from '../../systems/TimeSystem.js';
import { VesselManager }         from '../../systems/VesselManager.js';
import { MovementOrderSystem }   from '../../systems/MovementOrderSystem.js';
import { ProximitySystem }       from '../../systems/ProximitySystem.js';
import { VesselCombatSystem }    from '../../systems/VesselCombatSystem.js';
import * as DSCSM                from '../../systems/DeepSpaceCombatSystem.js';
import { EnemyAttackHandler }    from '../../systems/EnemyAttackHandler.js';
import { OrbitalSpaceSystem }    from '../../systems/OrbitalSpaceSystem.js';
import { AutoRetreatSystem }     from '../../systems/AutoRetreatSystem.js';
import * as BS                   from '../../systems/BattleSystem.js';
import * as SL                   from '../../ui/CombatStripLogic.js';
import { setNextVesselId }       from '../../entities/Vessel.js';
import { cvBattleDebugHelpers, cvBattleLayout } from '../../debug/CvBattleStager.js';
import { setLocale, t }          from '../../i18n/i18n.js';

const { DeepSpaceCombatSystem } = DSCSM;
const SAFETY_ROUND_CAP = DSCSM.SAFETY_ROUND_CAP;   // M1 — brak przed krokiem (fail-first: undefined)

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const guard = (label, fn) => { try { fn(); } catch (e) { assert(false, `${label} — wyjątek: ${e.message}`); } };
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

// ── Świat (wzór `cv_fx_results_smoke`) + AutoRetreatSystem jak w grze ───────────────────────────────────────────────
const AU = GAME_CONFIG.AU_TO_PX;
const SYS = 'sys_t';
const EMP = 'emp_t';
const clock = { now: 1e7 };
performance.now = () => clock.now;
let ts, vm, mos, prox, dscs, eah, oss, ar, saveSys, rec;

function world({ withAR = true } = {}) {
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
  EntityManager.add({ id: 'p_far', type: 'planet', name: 'Daleka', systemId: SYS, x: 9 * AU, y: 0, radius: 6, mass: 1, visual: { radius: 6 } });
  vm = new VesselManager(); mos = new MovementOrderSystem(vm); prox = new ProximitySystem(vm);
  dscs = new DeepSpaceCombatSystem(vm); new VesselCombatSystem(vm); eah = new EnemyAttackHandler(); oss = new OrbitalSpaceSystem();
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
  ar = null;
  if (withAR) { ar = new AutoRetreatSystem(vm, window.KOSMOS.colonyManager, mos); window.KOSMOS.autoRetreatSystem = ar; }
  rec = { battles: [], wrecks: [], noDmg: [], cap: [], retreatStarted: [], arIssued: [], livingWrecked: 0, rounds: [] };
  EventBus.on('battle:resolved', ({ result }) => { if (result?.id?.startsWith?.('battle_ds_')) rec.battles.push(result); });
  EventBus.on('vessel:wrecked', ({ vesselId }) => rec.wrecks.push(vesselId));
  EventBus.on('combat:noDamagePossible', (e) => rec.noDmg.push(e));
  EventBus.on('combat:safetyCap', (e) => rec.cap.push(e));
  EventBus.on('combat:retreatStarted', (e) => rec.retreatStarted.push(e));
  EventBus.on('vessel:autoRetreatIssued', (e) => rec.arIssued.push(e.vesselId));
  // Wraki żywych: migawka żywych przed `_finalizeBattle`, po nim — kto z nich jest wrakiem.
  const fin = dscs._finalizeBattle.bind(dscs);
  dscs._finalizeBattle = (enc, w, r, why) => {
    const alive = [...enc.vesselStates].filter(([, s]) => s.hp > 0).map(([id]) => id);
    fin(enc, w, r, why);
    for (const id of alive) if (vm.getVessel(id)?.isWreck) rec.livingWrecked++;
  };
  const tick = dscs._tickEncounter.bind(dscs);
  dscs._tickEncounter = (enc, civDy) => {
    tick(enc, civDy);
    const last = enc.timeline?.[enc.timeline.length - 1];
    rec.rounds.push({ id: enc.id, round: enc.currentRound,
      events: (last?.events ?? []).map(e => [e.attacker, e.target, e.weapon, e.hit, +Number(e.damage).toFixed(4)]),
      hp: [...enc.vesselStates].map(([id, s]) => [id, +Number(s.hp).toFixed(4)]) });
  };
}

function frame(ms = 16) { clock.now += ms; ts.update(ms); }
const encActive = () => dscs.listActive().length > 0;
const helpers = () => cvBattleDebugHelpers({ getRenderer: () => null, getSaveSystem: () => saveSys });
function runToEnd(maxFrames = 200000, tail = 0) {
  ts.play();
  for (let n = 0; n < maxFrames; n++) { frame(); if (!encActive() && rec.battles.length > 0) break; }
  for (let k = 0; k < tail; k++) frame();
}
function stager(opts) {
  reseed('m1-battle-end'); world();
  const st = helpers().cvBattle(opts);
  if (!st?.ok) throw new Error('cvBattle: ' + JSON.stringify(st));
  runToEnd();
  const cv = vm.getAllVessels().filter(v => /^CV-[AB]\d\d$/.test(v.name ?? ''));
  return { st, battles: rec.battles, livingWrecked: rec.livingWrecked, wrecks: rec.wrecks.length, noDmg: rec.noDmg.length, cap: rec.cap.length,
    aliveA: cv.filter(v => !v.isEnemy && !v.isWreck).length, aliveB: cv.filter(v => v.isEnemy && !v.isWreck).length, rounds: rec.rounds };
}
function ship({ xAU, yAU = 0, name, empire = null, modules, hull = 'hull_frigate', dockedAt = null }) {
  const v = vm.createAndRegister(hull, 'p_home', { name, modules });
  v.position.x = xAU * AU; v.position.y = yAU * AU; v.position.state = 'orbiting'; v.position.dockedAt = dockedAt;
  v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.systemId = SYS; v.serviceState = 'active';
  if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; }
  return v;
}
/** Starcie zbudowane wprost (z pominięciem bramek startu): strona A gracza, B imperium; środek = średnia pozycji. */
function makeEncounter(sideA, sideB) {
  const all = [...sideA, ...sideB];
  const mid = { x: all.reduce((s, v) => s + v.position.x, 0) / all.length, y: all.reduce((s, v) => s + v.position.y, 0) / all.length };
  return dscs._createEncounter(sideA, sideB, mid, 'player', EMP, SYS);
}
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : null; };

// ═══ E1 — bez time-outu, okręt ginie tylko przy 0 HP ═══════════════════════════════════════════════════════════════
header('E1 — 10 na 10 do końca: bez cięcia po 20. rundzie, wrak wyłącznie przy 0 HP');
guard('E1', () => {
  const r = stager({ seed: 1, nA: 10, nB: 10 });
  const b = r.battles[0];
  console.log(`     wynik: ${JSON.stringify(r.battles.map(x => ({ turns: x.turns, w: x.winner, r: x.retreated, end: x.endReason, lA: x.lossesA, lB: x.lossesB })))}`);
  assert(b?.turns > 20, `E1a bitwa trwa dłużej niż dawne 20 rund (${b?.turns})`);
  assert(r.livingWrecked === 0 && r.wrecks > 0, `E1b zero wraków ŻYWYCH (${r.livingWrecked}); świadek — wraki z zabić są (${r.wrecks})`);
  assert(b?.endReason === 'destroyed' || b?.endReason === 'disengage', `E1c koniec: zniszczenie strony albo ucieczka (endReason ${b?.endReason})`);
  let lw = 0, over20 = 0;
  for (let s = 1; s <= 20; s++) { const x = stager({ seed: s, nA: 10, nB: 10 }); lw += x.livingWrecked; if ((x.battles[0]?.turns ?? 0) > 20) over20++; }
  assert(lw === 0 && over20 >= 15, `E1d 20 bitew 10 na 10: zero wraków żywych (${lw}), ${over20}/20 dłuższych niż 20 rund`);
});

// ═══ E2 — ogień jednoczesny ════════════════════════════════════════════════════════════════════════════════════════
header('E2 — ogień jednoczesny: zestrzelony w rundzie strzela w niej');
guard('E2', () => {
  reseed('m1-battle-end'); world();
  const st = helpers().cvBattle({ seed: 1, nA: 1, nB: 1, hulls: 'frigate', weapons: 'laser', engage: 0 });
  const enc = dscs.listActive()[0];
  for (const s of enc.vesselStates.values()) { s.hp = 1; s.shieldHP = 0; }
  const a = enc.sideA.vesselIds[0], b = enc.sideB.vesselIds[0];
  runToEnd();
  const res = rec.battles[0];
  const fired = rec.rounds.find(x => x.events.length > 0);
  const shooters = new Set((fired?.events ?? []).map(e => e[0]));
  console.log(`     cvBattle ok=${st?.ok}; runda z ogniem ${fired?.round}: ${JSON.stringify(fired?.events)}; wynik ${res?.winner} (${res?.endReason}), straty ${res?.lossesA}/${res?.lossesB}`);
  assert(shooters.has(a) && shooters.has(b), 'E2a w rundzie pierwszego ognia strzelają OBIE strony (świadek)');
  assert(res?.winner == null && res?.lossesA === 1 && res?.lossesB === 1 && res?.endReason === 'destroyed',
    `E2b oba okręty po 1 HP giną w tej samej rundzie — remis przez wzajemne zniszczenie (dawniej strona A strzelała pierwsza i wygrywała)`);
});

// ═══ E3 — lustrzane bitwy: podział symetryczny ═══════════════════════════════════════════════════════════════════
header('E3 — lustrzane 2v2 i 5v5 (bez rozkazów po obu stronach), ziarna 1–20: podział wygranych symetryczny');
guard('E3', () => {
  for (const n of [2, 5]) {
    const w = { A: 0, B: 0, d: 0 }, w1 = { A: 0, B: 0, d: 0 };
    for (let s = 1; s <= 20; s++) {
      const r = stager({ seed: s, nA: n, nB: n, engage: 0 });
      const x = r.battles[0]?.winner; w[x === 'A' ? 'A' : x === 'B' ? 'B' : 'd']++;
      const r1 = stager({ seed: s, nA: n, nB: n });
      const y = r1.battles[0]?.winner; w1[y === 'A' ? 'A' : y === 'B' ? 'B' : 'd']++;
    }
    console.log(`     ${n}v${n} engage 0: A/B/remis ${w.A}/${w.B}/${w.d} · domyślny (engage 1 — „Zaangażuj” tylko A): ${w1.A}/${w1.B}/${w1.d}`);
    assert(Math.abs(w.A - w.B) <= 6 && w.A >= 5 && w.B >= 5, `E3 ${n}v${n} lustrzane: |A − B| ≤ 6 i każda strona ≥ 5 (${w.A}/${w.B}/${w.d})`);
  }
});

// ═══ E4 — strażnik „nikt nie może zadać obrażeń” ═══════════════════════════════════════════════════════════════
header('E4a — w bitwach stagera strażnik i bezpiecznik NIGDY');
guard('E4a', () => {
  let noDmg = 0, cap = 0, maxTurns = 0, n = 0;
  for (const size of [2, 5, 10]) for (let s = 1; s <= 20; s++) {
    const r = stager({ seed: s, nA: size, nB: size });
    noDmg += r.noDmg; cap += r.cap; n++;
    for (const b of r.battles) maxTurns = Math.max(maxTurns, b.turns ?? 0);
  }
  assert(noDmg === 0 && cap === 0, `E4a ${n} bitew stagera: strażnik ${noDmg}, bezpiecznik ${cap}; najdłuższa ${maxTurns} rund (< ${SAFETY_ROUND_CAP})`);
});

header('E4b/E4c — pat: strażnik AI na orbicie własnego ciała (kinetyk 0,15) wobec bezbronnego transportu poza zasięgiem');
// Scena z gry: uzbrojona fregata gracza (1 HP) i bezbronny transport, wolne w przestrzeni; strażnik AI przypięty do orbity SWOJEGO
// księżyca (gracz nie ma dominującego ciała, więc wróg nie jest przenoszony). Fregata ginie, transport stoi 0,2 AU od strażnika —
// poza jego zasięgiem; strażnik trzyma orbitę (nie podchodzi), transport nie ma broni ⇒ nikt nikogo nie dosięgnie. Dawniej: 20 rund
// i time-out (więcej HP wygrywa — żywy przegrany na wrak).
function patScene() {
  reseed('m1-battle-end'); world();
  EntityManager.add({ id: 'm_b', type: 'moon', name: 'KsB', systemId: SYS, x: 1.12 * AU, y: 2 * AU, radius: 2, mass: 0.01, visual: { radius: 2 } });
  const guard = ship({ xAU: 1.12, yAU: 2, name: 'E-straz', empire: EMP, modules: ['weapon_kinetic', 'engine_ion'], dockedAt: 'm_b' });
  const frig = ship({ xAU: 1.0, yAU: 2, name: 'P-fregata', modules: ['weapon_kinetic', 'engine_ion'] });
  frig.combatDamage = { hpMissing: 1e9, shieldMissing: 1e9 };   // 1 HP — pierwsze trafienie kończy
  const trans = ship({ xAU: 0.92, yAU: 2, name: 'P-transport', modules: ['engine_ion'] });
  return { guard, frig, trans };
}
guard('E4b', () => {
  const { guard: g, frig, trans } = patScene();
  const started = dscs.handleCombatRangeEnter(frig.id, g.id, false);
  const enc = dscs._findActiveEncounterContaining(g.id);
  ts.play();
  for (let k = 0; k < 4000 && rec.battles.length === 0; k++) frame();
  const res = rec.battles[0];
  console.log(`     start ${started}, członkowie ${enc?.vesselStates?.size}; wynik ${JSON.stringify(res && { t: res.turns, w: res.winner, end: res.endReason, lA: res.lossesA, lB: res.lossesB })}`);
  assert(started === true && enc?.vesselStates?.has(trans.id) === true, 'E4b0 KONTROLA: starcie startuje (uzbrojona fregata może podejść), transport w starciu');
  assert(res?.endReason === 'no_damage_possible' && res?.winner == null && rec.noDmg.length === 1 && res?.lossesA === 1,
    `E4b pat po śmierci fregaty: remis, zdarzenie audytu ${rec.noDmg.length} (endReason ${res?.endReason}, rund ${res?.turns})`);
  assert(!trans.isWreck && !g.isWreck && rec.livingWrecked === 0, 'E4b' + "'" + ' zero wraków żywych po pacie (transport i strażnik żyją)');
  // E4c — ta sama para przez dyspozytora (samoleczenie pary w `ProximitySystem` robi dokładnie to) — starcia brak, nic nie wraca
  for (let k = 0; k < 120; k++) frame();
  const again = dscs.handleCombatRangeEnter(trans.id, g.id, false);
  assert(again === false && !dscs._findActiveEncounterContaining(trans.id) && rec.battles.length === 1 && rec.noDmg.length === 1,
    `E4c start: para w tej geometrii NIE zakłada starcia (odmowa), brak pętli starć (bitew ${rec.battles.length}, strażnik ${rec.noDmg.length})`);
});
guard('E4b-ctl', () => {
  reseed('m1-battle-end'); world();
  EntityManager.add({ id: 'm_a', type: 'moon', name: 'KsA', systemId: SYS, x: 1.0 * AU, y: 2 * AU, radius: 2, mass: 0.01, visual: { radius: 2 } });
  EntityManager.add({ id: 'm_b', type: 'moon', name: 'KsB', systemId: SYS, x: 1.12 * AU, y: 2 * AU, radius: 2, mass: 0.01, visual: { radius: 2 } });
  const pa = ship({ xAU: 1.0, yAU: 2, name: 'P-laser', modules: ['weapon_laser', 'engine_ion'], dockedAt: null });   // WOLNY — może podejść
  const eb = ship({ xAU: 1.12, yAU: 2, name: 'E-laser', empire: EMP, modules: ['weapon_laser', 'engine_ion'], dockedAt: 'm_b' });
  const ok = dscs.handleCombatRangeEnter(pa.id, eb.id, false);
  const enc = dscs._findActiveEncounterContaining(pa.id);
  eb.position.dockedAt = 'm_b';
  ts.play();
  for (let k = 0; k < 40; k++) frame();
  assert(ok === true && !!enc && rec.noDmg.length === 0, `E4c KONTROLA: wolny uzbrojony zakłada starcie i walka trwa (strażnik ${rec.noDmg.length}, rund ${enc?.currentRound})`);
});

header('E4e — start przy bronionej kolonii: wróg przypięty do ciała gracza staje w jego środku — w zasięgu');
guard('E4e', () => {
  reseed('m1-battle-end'); world();
  EntityManager.add({ id: 'p_col', type: 'planet', name: 'Kolonia', systemId: SYS, x: -2 * AU, y: 2 * AU, radius: 6, mass: 1, visual: { radius: 6 } });
  const d1 = ship({ xAU: -2, yAU: 2, name: 'Obr-1', modules: ['weapon_laser', 'engine_ion'], dockedAt: 'p_col' });
  const d2 = ship({ xAU: -2, yAU: 2, name: 'Obr-2', modules: ['weapon_laser', 'engine_ion'], dockedAt: 'p_col' });
  const raider = ship({ xAU: -2 + 0.25, yAU: 2, name: 'Rajder', empire: EMP, modules: ['weapon_kinetic', 'engine_ion'] });
  const pc = dscs._prospectiveCombatants?.([raider], 'p_col', true)?.[0];
  const pf = dscs._prospectiveCombatants?.([raider], null, true)?.[0];
  assert(pc && pf && Math.hypot(pc.x - -2 * AU, pc.y - 2 * AU) < 1e-6 && Math.hypot(pf.x - raider.position.x, pf.y - raider.position.y) < 1e-6,
    'E4e1 pozycja po zamrożeniu: przypięty do kolonii — środek ciała; bez przypięcia — tam, gdzie stoi (KONTROLA)');
  const ok = dscs.handleCombatRangeEnter(d1.id, raider.id, false);
  const enc = dscs._findActiveEncounterContaining(raider.id);
  assert(ok === true && !!enc && enc.vesselStates.has(d2.id) && raider.position.dockedAt === 'p_col',
    `E4e2 rajder 0,25 AU od kolonii z obrońcami na orbicie (laser 0,05 vs kinetyk 0,15): starcie startuje, wróg przypięty do kolonii (${raider.position.dockedAt})`);
  // E4e3 — 1. runda pada, zanim `VesselManager` przestawi przypiętego rajdera do kolonii: strażnik czyta pozycję „po ustawieniu”
  //   (`_pinnedXY`), więc nie ogłasza fałszywego patu; ŚWIADEK — padają strzały.
  const rawAt1 = Math.hypot(raider.position.x - d1.position.x, raider.position.y - d1.position.y) / AU;
  ts.play();
  for (let k = 0; k < 400 && (enc.currentRound ?? 0) < 5 && enc.isActive; k++) frame();
  const shots = rec.rounds.filter(r => r.id === enc.id).reduce((n, r) => n + r.events.length, 0);
  assert(rawAt1 > 0.2 && rec.noDmg.length === 0 && shots > 0,
    `E4e3 bez fałszywego patu w 1. rundzie (surowa odległość przed przestawieniem ${rawAt1.toFixed(3)} AU; strażnik ${rec.noDmg.length}; strzałów ${shots})`);
});

header('E4d — tarcza nie do przebicia wobec bezbronnego');
guard('E4d', () => {
  for (const regen of [1e6, 0]) {
    reseed('m1-battle-end'); world();
    const pa = ship({ xAU: -1.5, yAU: 2, name: 'P-kin', modules: ['weapon_kinetic', 'engine_ion'] });
    const eb = ship({ xAU: -1.45, yAU: 2, name: 'E-shield', empire: EMP, modules: ['engine_ion'] });
    const enc = makeEncounter([pa], [eb]);
    const s = enc.vesselStates.get(eb.id);
    s.shieldHP = s.shieldHPStart = 1e6; s.shieldRegen = regen;
    ts.play();
    for (let k = 0; k < 30 && encActive(); k++) frame();
    const res = rec.battles[0];
    if (regen > 0) assert(res?.endReason === 'no_damage_possible' && rec.noDmg.length === 1, `E4d tarcza z regeneracją ≥ obrażeń strony — strażnik (endReason ${res?.endReason})`);
    else assert(!res && encActive() && rec.noDmg.length === 0, `E4d KONTROLA tarcza bez regeneracji — walka trwa (strażnik ${rec.noDmg.length})`);
  }
});

// ═══ E5 — ukryty bezpiecznik ═══════════════════════════════════════════════════════════════════════════════════════
header('E5 — bezpiecznik rund: remis bez wraków żywych + audyt');
guard('E5', () => {
  reseed('m1-battle-end'); world();
  const pa = ship({ xAU: -1.5, yAU: 2, name: 'P-big', modules: ['weapon_kinetic', 'engine_ion'] });
  const eb = ship({ xAU: -1.45, yAU: 2, name: 'E-big', empire: EMP, modules: ['weapon_kinetic', 'engine_ion'] });
  const enc = makeEncounter([pa], [eb]);
  for (const s of enc.vesselStates.values()) { s.hp = s.hpStart = 1e9; }
  // Stan w chwili ogłoszenia wyniku (para zostaje w zasięgu, więc tuż potem może zacząć się nowe starcie — patrz plan §4 «M1»).
  let atEnd = null;
  EventBus.on('battle:resolved', () => { if (!atEnd) atEnd = { pa: pa.isWreck, eb: eb.isWreck }; });
  ts.play();
  for (let k = 0; k < 20000 && !atEnd; k++) frame();
  const res = rec.battles[0];
  assert(Number.isFinite(SAFETY_ROUND_CAP) && SAFETY_ROUND_CAP === 200, `E5a stała bezpiecznika = 200 (${SAFETY_ROUND_CAP})`);
  assert(res?.turns === SAFETY_ROUND_CAP && res?.endReason === 'safety_cap' && res?.winner == null && rec.cap.length === 1,
    `E5b koniec na ${res?.turns}. rundzie: ${res?.endReason}, remis, audyt ${rec.cap.length}`);
  const hits = rec.rounds.filter(r => r.id === enc.id).reduce((n, r) => n + r.events.filter(e => e[3]).length, 0);
  assert(atEnd && !atEnd.pa && !atEnd.eb && rec.livingWrecked === 0 && hits > 0,
    `E5c zero wraków żywych przy końcu (${JSON.stringify(atEnd)}); świadek — strzały trafiały (${hits}; strażnik słusznie milczał)`);
});

// ═══ E6 — ucieczka = prawdziwy lot ═════════════════════════════════════════════════════════════════════════════════
header('E6a — „Wycofaj się z bitwy” gracza: lot na zegarze starcia, starcie trwa do wyjścia poza 0,5 AU');
guard('E6a', () => {
  reseed('m1-battle-end'); world();
  // Schronienie gracza (Dom) na PRAWDZIWEJ orbicie (okres 5 lat) — bez tego `_predictPosition` stoi i rozjazd przylotu (E6a3)
  // nie miałby skąd się wziąć (pin byłby jałowy; zmierzone mutantem „bez przeplanowania”).
  for (const [id, a, M] of [['p_home', 4, Math.PI], ['p_rock', 3, 0], ['p_far', 9, 0]]) {
    Object.assign(EntityManager.get(id), { orbital: { a, e: 0, T: Math.pow(a, 1.5), M, inclinationOffset: 0 } });
  }
  helpers().cvBattle({ seed: 4, nA: 5, nB: 5 });
  const enc = dscs.listActive()[0];
  const mid = { ...enc.location.point };
  ts.play();
  let v = null, issued = null, startRound = 0;
  const track = [];
  for (let n = 0; n < 60000 && (encActive() || rec.battles.length === 0); n++) {
    frame();
    if (!issued && enc.currentRound >= 3) {
      v = vm.getAllVessels().filter(x => /^CV-A/.test(x.name) && (enc.vesselStates.get(x.id)?.hp ?? 0) > 0)
        .sort((x, y) => enc.vesselStates.get(y.id).hp - enc.vesselStates.get(x.id).hp)[0];
      issued = mos.issueOrder(v.id, { type: 'retreat', issuedBy: 'keeper' });
      startRound = enc.currentRound;
    }
    if (issued?.ok && (track.length === 0 || track[track.length - 1].r !== enc.currentRound)) {
      track.push({ r: enc.currentRound, d: Math.hypot(v.position.x - mid.x, v.position.y - mid.y) / AU, x: v.position.x, y: v.position.y, active: enc.isActive, compressed: enc.vesselStates.get(v.id)?.fleeCompressedYears ?? 0 });
    }
  }
  const t1 = track.find(x => x.r === startRound + 1), t5 = track.find(x => x.r === startRound + 5);
  const perRound = t1 && t5 ? Math.hypot(t5.x - t1.x, t5.y - t1.y) / AU / 4 : 0;   // droga po trasie (nie tylko promieniowo)
  console.log(`     rozkaz ${JSON.stringify(issued)} (runda ${startRound}); odległość od punktu starcia: ${track.slice(0, 18).map(x => x.d.toFixed(3)).join(' ')}`);
  assert(issued?.ok === true && perRound >= 0.02, `E6a1 lot na zegarze starcia: ${perRound.toFixed(4)} AU na rundę (czas gry dałby ~0,0006)`);
  const inside = track.filter(x => x.d < 0.45 && x.r > startRound);
  assert(inside.length >= 5 && inside.every(x => x.active), `E6a2 starcie trwa, dopóki uciekający jest bliżej niż 0,5 AU (${inside.length} rund w środku)`);
  const m = v.mission, gy = ts.gameTime;
  const pred = m?.targetId ? vm._predictPosition(m.targetId, m.arrivalYear) : null;
  const gap = pred ? Math.hypot(pred.x - m.targetX, pred.y - m.targetY) / AU : Infinity;
  assert(typeof vm.rebaseTransitFromHere === 'function' && (enc.vesselStates.get(v.id)?.fleeCompressedYears ?? 0) === 0 && gap < 0.01 && m?.departYear >= gy - 0.5,
    `E6a3 po wyjściu lot przeplanowany: przylot w punkcie ciała ${m?.targetId} na chwilę przylotu (rozjazd ${gap.toFixed(4)} AU)`);
});

header('E6a4 — uciekający wyszedł poza 0,5 AU, a starcie TRWA (pojedynek reszty): lot przeplanowany od razu, nie dopiero na końcu');
guard('E6a4', () => {
  reseed('m1-battle-end'); world();
  for (const [id, a, M] of [['p_home', 4, Math.PI], ['p_rock', 3, 0], ['p_far', 9, 0]]) {
    Object.assign(EntityManager.get(id), { orbital: { a, e: 0, T: Math.pow(a, 1.5), M, inclinationOffset: 0 } });
  }
  const runner = ship({ xAU: -1.5, yAU: 2.02, name: 'P-ucieka', hull: 'hull_cruiser', modules: ['engine_ion'] });
  const duelA = ship({ xAU: -1.5, yAU: 2, name: 'P-pojedynek', hull: 'hull_cruiser', modules: ['weapon_laser', 'engine_ion'] });
  const duelB = ship({ xAU: -1.47, yAU: 2, name: 'E-pojedynek', empire: EMP, hull: 'hull_cruiser', modules: ['weapon_laser', 'engine_ion'] });
  const enc = makeEncounter([runner, duelA], [duelB]);
  const mid = { ...enc.location.point };
  for (const id of [duelA.id, duelB.id]) { const s = enc.vesselStates.get(id); s.hp = s.hpStart = 1e5; }   // pojedynek bez końca w oknie pomiaru
  const order = mos.issueOrder(runner.id, { type: 'retreat', issuedBy: 'keeper' });
  ts.play();
  // Migawka W KLATCE przeplanowania (pierwsza klatka, w której licznik przyspieszania spadł z > 0 do 0): `_predictPosition`
  // liczy od BIEŻĄCEGO czasu gry, a świat keepera nie przesuwa anomalii ciał — odczyt kilka klatek później dryfuje o ruch ciała
  // (pierwsza wersja pinu czytała przy 0,55 AU i dawała 0,06 AU rozjazdu także na poprawnym kodzie).
  let wasCompressed = false, snap = null;
  for (let n = 0; n < 20000 && enc.isActive && !snap; n++) {
    frame();
    const comp = enc.vesselStates.get(runner.id)?.fleeCompressedYears ?? 0;
    if (comp > 0) { wasCompressed = true; continue; }
    if (!wasCompressed) continue;
    const m = runner.mission, pred = m?.targetId ? vm._predictPosition(m.targetId, m.arrivalYear) : null;
    snap = { d: Math.hypot(runner.position.x - mid.x, runner.position.y - mid.y) / AU, active: enc.isActive, target: m?.targetId,
      gap: pred ? Math.hypot(pred.x - m.targetX, pred.y - m.targetY) / AU : Infinity,
      startOff: m ? Math.hypot(m.startX - runner.position.x, m.startY - runner.position.y) / AU : Infinity,
      departLag: m ? ts.gameTime - m.departYear : Infinity };
  }
  console.log(`     migawka przeplanowania: ${JSON.stringify(snap)}`);
  assert(order?.ok === true && wasCompressed && snap?.active === true && snap.d > GAME_CONFIG.COMBAT_DISENGAGE_AU,
    `E6a4a lot uciekającego przyspieszany w starciu, licznik zdjęty po wyjściu poza 0,5 AU (${snap?.d?.toFixed(3)} AU), starcie TRWA (${snap?.active})`);
  assert(snap?.startOff < 0.001 && Math.abs(snap?.departLag) < 1e-6 && snap?.gap < 0.01,
    `E6a4b w tej samej klatce lot przeplanowany od bieżącej pozycji (start ${snap?.startOff?.toFixed(4)} AU obok, odlot ${snap?.departLag} r. temu), przylot w punkcie ciała ${snap?.target} (rozjazd ${snap?.gap?.toFixed(4)} AU)`);
});

header('E6b/E6c — odwrót AI przy niskim HP: prawdziwy lot, starcie kończy wyjście poza zasięg, brak natychmiastowego zwarcia');
guard('E6b', () => {
  reseed('m1-battle-end'); world();
  // Jeden kinetyk gracza (co 3 rundy) wobec dwóch fregat AI przy 28 % HP: po pierwszym trafieniu strona AI ma ≤ 20 % i mniej
  // niż połowę procentu gracza — próg odwrotu — a oba okręty jeszcze żyją (laser AI dolatuje i strzela w tej samej rundzie).
  const pa = ship({ xAU: -1.5, yAU: 2, name: 'P-1', hull: 'hull_destroyer', modules: ['weapon_kinetic', 'engine_ion'] });
  const e1 = ship({ xAU: -1.42, yAU: 2, name: 'E-1', empire: EMP, modules: ['weapon_laser', 'engine_ion'] });
  const e2 = ship({ xAU: -1.42, yAU: 2.02, name: 'E-2', empire: EMP, modules: ['weapon_laser', 'engine_ion'] });
  const enc = makeEncounter([pa], [e1, e2]);
  const mid = { ...enc.location.point };
  for (const id of [e1.id, e2.id]) { const s = enc.vesselStates.get(id); s.hp = s.hpStart * 0.28; }
  ts.play();
  let roundAtRetreat = null, roundsAfter = 0;
  for (let n = 0; n < 60000 && (encActive() || rec.battles.length === 0); n++) {
    frame();
    if (rec.retreatStarted.length && roundAtRetreat == null) roundAtRetreat = enc.currentRound;
  }
  roundsAfter = (rec.battles[0]?.turns ?? 0) - (roundAtRetreat ?? 0);
  const res = rec.battles[0];
  const fled = [e1, e2].filter(v => !v.isWreck);
  const far = fled.every(v => Math.hypot(v.position.x - mid.x, v.position.y - mid.y) / AU > GAME_CONFIG.COMBAT_DISENGAGE_AU);
  console.log(`     odwrót w rundzie ${roundAtRetreat}, koniec w ${res?.turns} (${res?.winner}/${res?.retreated}/${res?.endReason}); uciekło ${fled.length}; rozkazy AR ${rec.arIssued.length}`);
  assert(rec.retreatStarted.length === 1 && rec.retreatStarted[0].side === 'B' && rec.retreatStarted[0].ordered >= 1,
    `E6b1 rozkazy odwrotu W TRAKCIE starcia (combat:retreatStarted — strona ${rec.retreatStarted[0]?.side}, ${rec.retreatStarted[0]?.ordered} okr.)`);
  assert(roundAtRetreat != null && roundsAfter >= 1, `E6b2 starcie trwa po rozkazie (${roundsAfter} rund lotu w zasięgu — można strzelać do uciekających; świadek: rozkaz w rundzie ${roundAtRetreat})`);
  assert(res?.retreated === 'B' && res?.endReason === 'disengage' && fled.length >= 1 && far,
    `E6b3 koniec: retreated B / disengage, żywi uciekinierzy poza ${GAME_CONFIG.COMBAT_DISENGAGE_AU} AU`);
  const perShip = new Map(); for (const id of rec.arIssued) perShip.set(id, (perShip.get(id) ?? 0) + 1);
  assert(rec.arIssued.length >= 1 && [...perShip.values()].every(c => c === 1), `E6b4 AutoRetreatSystem nie dokłada drugiego rozkazu (${JSON.stringify([...perShip.values()])})`);
  // E6c — natychmiastowe ponowne zwarcie: para (gracz, uciekający) — odmowa
  const flee = fled[0];
  const again = dscs.handleCombatRangeEnter(pa.id, flee.id, false);
  assert(again === false && !dscs._findActiveEncounterContaining(flee.id), 'E6c uciekający po końcu starcia nie wchodzi w nowe starcie (odmowa dyspozytora)');
  // Ścieżka zamiaru gracza: rozkaz „Zaangażuj” na uciekającego omija zbieranie składu (`nearby = [v1, v2]`) — bramka dyspozytora też
  // ją zamyka (mutant bez bramki przechodził pierwszą asercję dzięki filtrowi w zbieraniu).
  const eng = mos.issueOrder(pa.id, { type: 'engage', targetEntityId: flee.id, issuedBy: 'keeper' });
  const again1 = dscs.handleCombatRangeEnter(pa.id, flee.id, false);
  assert(eng?.ok === true && again1 === false && !dscs._findActiveEncounterContaining(flee.id), 'E6c rozkaz „Zaangażuj” na uciekającego — dalej odmowa (ścieżka zamiaru gracza)');
  if (pa.movementOrder?.status === 'active') mos.cancelOrder(pa.id, 'keeper');
  const fresh = ship({ xAU: -1.48, yAU: 2, name: 'E-nowy', empire: EMP, modules: ['weapon_laser', 'engine_ion'] });
  const again2 = dscs.handleCombatRangeEnter(pa.id, fresh.id, false);
  assert(again2 === true && !!dscs._findActiveEncounterContaining(fresh.id), 'E6c KONTROLA: para bez uciekającego zakłada nowe starcie');
  // Dołączenie: trwa starcie (gracz vs nowy) — uciekający w zasięgu nie dołącza jako posiłki
  const join = dscs.handleCombatRangeEnter(pa.id, flee.id, false);
  assert(join === false && !dscs._findActiveEncounterContaining(fresh.id)?.vesselStates?.has(flee.id), 'E6c uciekający nie dołącza do trwającego starcia (posiłki)');
});

// ═══ E7 — determinizm ═════════════════════════════════════════════════════════════════════════════════════════════
header('E7 — to samo ziarno = ta sama bitwa');
guard('E7', () => {
  const a = stager({ seed: 5, nA: 5, nB: 5 }), b = stager({ seed: 5, nA: 5, nB: 5 });
  assert(a.rounds.length >= 10 && JSON.stringify(a.rounds) === JSON.stringify(b.rounds)
    && JSON.stringify(a.battles.map(x => [x.turns, x.winner, x.retreated, x.lossesA, x.lossesB]))
     === JSON.stringify(b.battles.map(x => [x.turns, x.winner, x.retreated, x.lossesA, x.lossesB])),
  `E7 5v5 ziarno 5 dwa razy: ślad ${a.rounds.length} rund i wynik identyczne`);
});

// ═══ E8 — ścieżka orbitalna ═══════════════════════════════════════════════════════════════════════════════════════
header('E8 — BattleSystem.resolveBattle: bez limitu 30 tur, bez remisu dla obrońcy, strażnik i bezpiecznik');
guard('E8', () => {
  const tank = (hp) => ({ hp, shieldHP: 0, armor: 0, evasion: 0.1, techMult: 1, morale: 1, weapons: [{ damage: 2, tracking: 0.7 }] });
  const r1 = BS.resolveBattle(tank(150), tank(150), { seed: 7 });
  assert(r1.turns > 30 && (r1.endReason === 'retreat' || r1.endReason === 'destroyed') && r1.winner !== undefined,
    `E8a tankowe floty: ${r1.turns} tur (dawny limit 30), koniec ${r1.endReason}, zwycięzca ${r1.winner}`);
  const unarmed = { hp: 100, shieldHP: 0, armor: 0, evasion: 0.1, weapons: [] };
  const r2 = BS.resolveBattle(unarmed, unarmed, { seed: 1 });
  assert(r2.winner === 'draw' && r2.endReason === 'no_damage_possible' && r2.turns === 0 && r2.lossesA === 0 && r2.lossesB === 0,
    `E8b bezbronni: remis ${r2.winner} bez tur (${r2.turns}) — dawniej 30 tur i wygrana obrońcy B przy równych HP`);
  const wall = { hp: 100, shieldHP: 100, shieldRegen: 50, armor: 0, evasion: 0.1, weapons: [] };
  const r3 = BS.resolveBattle(tank(100), wall, { seed: 1 });
  assert(r3.endReason === 'no_damage_possible' && r3.winner === 'draw', `E8c tarcza nie do przebicia wobec bezbronnego: pat (${r3.endReason})`);
  const slow = { hp: 100, shieldHP: 100, shieldRegen: 9, armor: 0, evasion: 0, weapons: [] };
  const r4 = BS.resolveBattle({ hp: 100, armor: 0, evasion: 0.1, weapons: [{ damage: 10, tracking: 0.5 }] }, slow, { seed: 3 });
  assert(r4.turns === 200 && r4.endReason === 'safety_cap' && r4.winner === 'draw' && r4.lossesA === 0 && r4.lossesB === 0,
    `E8d bezpiecznik: ${r4.turns} tur, ${r4.endReason}, remis bez strat`);
  assert(typeof BS.isStalemate === 'function' && BS.isStalemate(r2) && BS.isStalemate(r4) && !BS.isStalemate(r1), 'E8e `isStalemate`: pat strażnika i bezpiecznika tak, zwykły wynik nie');
  // VCS — pat nie rozbija nikogo; KONTROLA: remis przez zniszczenie rozbija obie strony
  reseed('m1-battle-end'); world();
  const vcs = new VesselCombatSystem(vm);
  const A = [ship({ xAU: -1.5, yAU: 2, name: 'VA', modules: ['engine_ion'] })];
  const B = [ship({ xAU: -1.45, yAU: 2, name: 'VB', empire: EMP, modules: ['engine_ion'] })];
  const loc = { systemId: SYS, planetId: null, point: { x: A[0].position.x, y: A[0].position.y } };
  vcs._applyOutcome(A, B, { ...r2 }, loc, 'player', EMP, 100);
  assert(!A[0].isWreck && !B[0].isWreck, 'E8f VCS `_applyOutcome` przy pacie — nikt nie idzie na wrak');
  vcs._applyOutcome(A, B, { winner: 'draw', retreated: null, endReason: 'destroyed', turns: 5 }, loc, 'player', EMP, 100);
  assert(A[0].isWreck && B[0].isWreck, 'E8f KONTROLA remis przez wzajemne zniszczenie — obie strony na wrak');
});

// ═══ E9 / E10 — pasek walki, źródła, audyt ═════════════════════════════════════════════════════════════════════════
header('E9 — pasek walki „R n”, gałąź patu w EAH');
guard('E9', () => {
  setLocale('pl'); const pl = t('combatStrip.round', 27);
  setLocale('en'); const en = t('combatStrip.round', 27);
  setLocale('pl');
  assert(pl === 'R27' && en === 'R27', `E9a linia rundy bez limitu: PL „${pl}”, EN „${en}”`);
  const rows = SL.stripBattles([{ id: 'e1', isActive: true, currentRound: 33, location: { systemId: SYS, point: { x: 0, y: 0 } },
    sideA: { ownerEmpireId: 'player', vesselIds: [], joinedVesselIds: [] }, sideB: { ownerEmpireId: EMP, vesselIds: [], joinedVesselIds: [] }, vesselStates: new Map() }], { activeSystemId: SYS });
  assert(rows[0]?.round === 33 && !('maxRounds' in (rows[0] ?? {})) && !('ROUND_CAP' in SL), 'E9b `stripBattles` — runda 33, bez pola limitu; moduł bez `ROUND_CAP`');
  const strip = strip_(read('src/ui/CombatStrip.js'));
  assert(/t\('combatStrip\.round', r\.round\)/.test(strip) && !/maxRounds/.test(strip), 'E9c `CombatStrip` woła klucz rundy z samą rundą');
  const eah = strip_(read('src/systems/EnemyAttackHandler.js'));
  const stale = eah.indexOf('isStalemate(result)'), draw = eah.indexOf("t('log.el.orbitalDraw'");
  assert(stale > 0 && draw > stale && /log\.el\.orbitalStalemate/.test(eah), 'E9d EAH: gałąź patu (bez wraków) PRZED gałęzią remisu przez zniszczenie');
});
function strip_(s) { return strip(s); }
header('E10 — audyt: nowe zdarzenia w TRACKED_EVENTS');
guard('E10', () => {
  const src = strip(read('src/core/DebugLog.js'));
  const list = src.slice(src.indexOf('const TRACKED_EVENTS'), src.indexOf('];', src.indexOf('const TRACKED_EVENTS')));
  assert(['combat:noDamagePossible', 'combat:safetyCap', 'combat:retreatStarted'].every(e => list.includes(`'${e}'`)), 'E10 trzy nowe zdarzenia M1 w TRACKED_EVENTS');
});

// ═══ E11 — Finding 699: stager `random` — floty nielustrzane ═══════════════════════════════════════════════════════
header('E11 — stager `random` (Finding 699): każda strona losuje kadłuby i broń z ziarna');
guard('E11', () => {
  const sig = (l) => JSON.stringify(l.ships.map(s => [s.side, s.index, s.hull, s.modules, s.dxAU, s.dyAU]).concat([l.trigger]));
  const pos = (l) => JSON.stringify(l.ships.map(s => [s.side, s.index, s.dxAU, s.dyAU]).concat([l.trigger]));
  const sideOf = (l, side) => l.ships.filter(s => s.side === side);
  const mirrorPairs = (l) => { const B = sideOf(l, 'B'); return sideOf(l, 'A').filter((a, i) => a.hull === B[i]?.hull && a.modules.join() === B[i]?.modules.join()).length; };
  const fleetsOf = (l) => ({ A: sideOf(l, 'A').map(s => `${s.hullName}/${s.modules[1].replace('weapon_', '')}`),
    B: sideOf(l, 'B').map(s => `${s.hullName}/${s.modules[1].replace('weapon_', '')}`) });
  // KONTROLA — bez `random` szyk co do bitu jak dotąd: ziarno nic nie zmienia, strona B = lustro strony A
  const base = cvBattleLayout({ nA: 3, nB: 3 });
  assert(sig(base) === sig(cvBattleLayout({ nA: 3, nB: 3, random: 0, seed: 9 })) && mirrorPairs(base) === 3,
    'E11a KONTROLA bez `random` — szyk niezależny od ziarna, B_i = lustro A_i (3/3)');
  const r4 = cvBattleLayout({ nA: 3, nB: 3, random: 1, seed: 4 });
  assert(sig(r4) !== sig(base) && pos(r4) === pos(base), 'E11b `random: 1` — floty inne niż lustro; pozycje i para wyzwalająca te same');
  assert(sig(r4) === sig(cvBattleLayout({ nA: 3, nB: 3, random: 1, seed: 4 })) && sig(r4) !== sig(cvBattleLayout({ nA: 3, nB: 3, random: 1, seed: 5 })),
    'E11c determinizm — to samo ziarno: te same floty; inne ziarno: inne');
  let unmirrored = 0;
  for (let s = 1; s <= 10; s++) if (mirrorPairs(cvBattleLayout({ nA: 3, nB: 3, random: 1, seed: s })) < 3) unmirrored++;
  assert(unmirrored >= 9, `E11d strony losują osobno — ziarna 1–10: ${unmirrored}/10 z parą nielustrzaną`);
  // jawne `hulls` / `weapons` wygrywają z losowaniem; drugi wymiar dalej losowany (świadek — różnice między ziarnami)
  const lasers = [], frigs = [];
  for (let s = 1; s <= 10; s++) {
    lasers.push(cvBattleLayout({ nA: 3, nB: 3, random: 1, seed: s, weapons: 'laser' }));
    frigs.push(cvBattleLayout({ nA: 3, nB: 3, random: 1, seed: s, hulls: 'frigate' }));
  }
  const guns = (l) => l.ships.flatMap(s => s.modules.filter(m => m.startsWith('weapon_')));
  assert(lasers.every(l => guns(l).every(m => m === 'weapon_laser')) && new Set(lasers.map(l => l.ships.map(s => s.hull).join())).size > 1,
    'E11e jawne `weapons: laser` — sama broń laserowa, kadłuby dalej losowane (różne między ziarnami)');
  assert(frigs.every(l => l.ships.every(s => s.hull === 'hull_frigate')) && new Set(frigs.map(l => guns(l).join())).size > 1,
    'E11f jawne `hulls: frigate` — same fregaty, broń dalej losowana (różna między ziarnami)');
  // przez prawdziwy `cvBattle`: statki w świecie mają wylosowane kadłuby i broń, odczyt `fleets` = świat
  reseed('m1-battle-end'); world();
  const st = helpers().cvBattle({ seed: 4, nA: 3, nB: 3, random: 1, engage: 0 });
  const HULL = { hull_frigate: 'frigate', hull_destroyer: 'destroyer', hull_cruiser: 'battleship' };
  const inWorld = { A: [], B: [] };
  for (const v of vm.getAllVessels().filter(x => /^CV-[AB]\d\d$/.test(x.name ?? '')).sort((a, b) => a.name.localeCompare(b.name))) {
    inWorld[v.name[3]].push(`${HULL[v.shipId]}/${(v.modules ?? []).find(m => m.startsWith('weapon_'))?.replace('weapon_', '')}`);
  }
  assert(st?.ok && st.random === 1 && JSON.stringify(st.fleets) === JSON.stringify(inWorld) && JSON.stringify(inWorld) === JSON.stringify(fleetsOf(r4)),
    `E11g \`cvBattle({random: 1})\` — statki w świecie = szyk z ziarna, odczyt \`fleets\` = świat (${JSON.stringify(st?.fleets ?? null)})`);
  reseed('m1-battle-end'); world();
  const st0 = helpers().cvBattle({ seed: 4, nA: 3, nB: 3, engage: 0 });
  assert(st0?.ok && !('fleets' in st0) && !('random' in st0), 'E11h KONTROLA bez `random` — odczyt `cvBattle` bez nowych pól');
});

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
