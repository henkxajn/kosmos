// ═══════════════════════════════════════════════════════════════════════════════
// combat_pace_smoke — KEEPER POLISH P1 (Findingi 438, 436, 449, 452; decyzje CP1–CP5)
// Plan i decyzje: `docs/design/POLISH_PLAN.md`.
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: wynik starcia w przestrzeni zależał od prędkości gracza w trakcie walki, od czasu rundy, od FPS i od pauzy —
//   rundy DSCS padały co 110 ms czasu REALNEGO, a między rundami świat tykał zegarem gry (438); pauza zostawiała zaległe
//   rundy, rozgrywane po odpauzowaniu do 4 na klatkę bez czasu gry między nimi (449); kąt orbity statku wokół ciała liczył
//   się z czasu realnego, więc po pauzie przeskakiwał (452).
// CP1: w starciu świat tyka SIATKĄ — klatka 16 ms przy 1 d/s, niezależnie od prędkości gracza i FPS; runda co 110 ms zegara
//   starcia (dzisiejsza reguła); czas realny rundy (`combatRoundMs`) — wyłącznie tempo odtwarzania. CP3: pauza zatrzymuje
//   starcie — zero rund, zero klatek siatki, zero nadrabiania. CP4: starcie w układzie, którego gracz nie ogląda —
//   dzisiejsze 110 ms realnych na rundę. CP5: zegar kąta orbit = zegar klatek symulacji.
//
// ŚWIAT: PRAWDZIWY `TimeSystem.update(ms)` w pętli klatek (lustro pętli rAF `GameScene`), czas realny = zegar wirtualny
//   (`performance.now` podmienione — także dla kodu sprzed P1, który taktował rundy czasem realnym), łańcuch `time:tick` →
//   VesselManager → ProximitySystem → VesselCombatSystem → DeepSpaceCombatSystem → MovementOrderSystem → wraki (EAH).
//   Scena: 3 fregaty gracza z laserem, rozkaz `engage` na niszczyciel AI (2 rakiety, kinetyk, pancerz); start 0,30 AU (starcie powstaje
//   w pierwszym tiku — próg wejścia z zasięgu rakiet 0,315 AU; fregaty zbliżają się w walce). Przed starciem zawsze 60 FPS
//   i 1 d/s (dolot nie jest pytaniem P1).
//   SYGNATURA starcia: rundy, strzały, trafienia, zwycięzca, odwrót, straty A / B, wraki.
//
// PINY:
//   T1  ODNIESIENIE = DZIŚ: 60 FPS, 1 d/s, bez pauzy — sygnatura równa NAGRANEJ na kodzie sprzed P1 (`1af65fc`, ten sam
//       keeper, `--record`); KONTROLA X = X (drugi przebieg); kontrola sceny (starcie powstało, strzały padły)
//   T2  klucz 110 / 400 / 1000 ms — sygnatura = dziś i czas gry KAŻDEJ rundy = dziś; czas realny starcia = (rundy − 1) ×
//       klucz ± kwant (klatka siatki 16 × klucz / 110 ms + klatka gry 16 ms; świadek: klucz zmienia tempo)
//   T3  prędkość gracza w trakcie starcia 1 d/s, 3 d/s, 1 tydz./s, 1 mies./s, 1 rok/s — sygnatura i czas gry każdej
//       rundy = dziś; po starciu świat tyka prędkością ustawioną przez gracza (KONTROLA: ustawienie nietknięte)
//   T4  klatka walki 33 ms (30 FPS), klucz 400 i 110 — sygnatura i czas gry każdej rundy = dziś
//   T5  pauza 2 s i 30 s w trakcie starcia — zero tików i rund w pauzie, zegar klatek stoi; po odpauzowaniu najwyżej jedna
//       runda na klatkę (bez nadrabiania); sygnatura i czas gry każdej rundy = dziś (starcie wraca tam, gdzie stanęło)
//   T6  krok czasu gry na rundę = dzisiejszy (6 albo 7 klatek siatki po 16 ms przy 1 d/s: 0,096 / 0,112 dnia) przy każdym
//       kluczu, prędkości i klatce
//   T7  starcie w układzie, którego gracz nie ogląda — runda co 110 ms realnych także przy kluczu 1000 (świadek: to samo
//       starcie oglądane — 1000 ms); zamarza w pauzie (bez nadrabiania); sygnatura i czas gry każdej rundy = dziś
//   T8  zegar orbit: statek na zarejestrowanej orbicie ciała — kąt z zegara klatek: w pauzie stoi i po pauzie nie skacze;
//       w oglądanym starciu przyrasta krokami siatki (klucz 400 ⇒ 110 / 400 tempa czasu realnego)
//   T9  pin źródłowy (komentarze zdjęte): DSCS bez czasu realnego; orbity (VesselManager ×3, EAH, OSS, ThreeRenderer ×2)
//       przez `orbitClockSec()`; `TimeSystem` — siatka i zegar klatek
//
// ⚠ Fail-first: moduły P1 (`SimClock`, `CombatPaceData`) powstają w tym slice — import dynamiczny w try/catch, wywołania
//   przez pomocników, żeby na kodzie sprzed zmiany piny DEGRADOWAŁY (czerwone), a nie przerywały suitę.
// ⚠ Klucz w tym kroku (C1) ustawiany zastąpieniem metody `TimeSystem.combatRoundMs` na instancji; klucz strojenia
//   (`sbSet('combatRoundMs', …)`) — C2 (T10).
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus                  from '../../core/EventBus.js';
import EntityManager             from '../../core/EntityManager.js';
import { GAME_CONFIG }           from '../../config/GameConfig.js';
import { TimeSystem }            from '../../systems/TimeSystem.js';
import { VesselManager }         from '../../systems/VesselManager.js';
import { MovementOrderSystem }   from '../../systems/MovementOrderSystem.js';
import { ProximitySystem }       from '../../systems/ProximitySystem.js';
import { VesselCombatSystem }    from '../../systems/VesselCombatSystem.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { EnemyAttackHandler }    from '../../systems/EnemyAttackHandler.js';
import { OrbitalSpaceSystem }    from '../../systems/OrbitalSpaceSystem.js';
import { readFileSync }          from 'node:fs';

const RECORD = process.argv.includes('--record');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const readSrc = (rel) => strip(readFileSync(new URL('../../' + rel, import.meta.url), 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const AU   = GAME_CONFIG.AU_TO_PX;
const DAY  = 1 / 365.25;
const SYS  = 'sys_t';
const EMP  = 'emp_t';
const GY0  = 100.00002;                                  // rok startu (daleko od granicy 1e-4 roku ziarna starcia)
const SPEEDS = [1, 2, 3, 4, 5];                          // 1 d/s, 3 d/s, 1 tydz./s, 1 mies./s, 1 rok/s
const START_AU = 0.30;                                   // start fregat od strażnika (w progu wejścia z zasięgu rakiet)

// ── Sygnatura DZIŚ — nagrana TYM keeperem (`node combat_pace_smoke.mjs --record`) na kodzie sprzed P1 (`1af65fc`,
//    2026-10-17): 60 FPS, 1 d/s, bez pauzy; 1. starcie 17 rund, 1760 ms realnych. Format bitwy: [rundy, strzały,
//    trafienia, zwycięzca, odwrót, straty A, straty B]; wraki — nazwy. Zmiana sceny wymaga ponownego nagrania na `1af65fc`.
const TODAY_SIG = { battles: [[17, 31, 27, 'A', 'B', 1, 0], [1, 2, 2, 'A', null, 0, 1]], wrecks: ['Fregata2', 'Straznik'] };

// ── zegar realny = zegar wirtualny (ms); pętla klatek jak `GameScene` (rAF → `TimeSystem.update(deltaMs)`) ──────────
const clock = { now: 1e7 };
performance.now = () => clock.now;

let ts, vm, mos, prox, dscs, eah, oss, rec;

function world({ view = SYS } = {}) {
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  ts = new TimeSystem();
  ts.gameTime = GY0;
  ts.multiplierIndex = 1;                                // 1 d/s
  window.KOSMOS = { timeSystem: ts, activeSystemId: view };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: SYS, x: -4 * AU, y: 0, radius: 6, mass: 1, visual: { radius: 6 } });
  EntityManager.add({ id: 'p_rock', type: 'planet', name: 'Skala', systemId: SYS, x: 3 * AU, y: 0, radius: 6, mass: 1, visual: { radius: 6 } });
  vm = new VesselManager(); mos = new MovementOrderSystem(vm); prox = new ProximitySystem(vm);
  dscs = new DeepSpaceCombatSystem(vm); new VesselCombatSystem(vm); eah = new EnemyAttackHandler(); oss = new OrbitalSpaceSystem();
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: EntityManager.get('p_home'), vesselManager: vm, movementOrderSystem: mos,
    proximitySystem: prox, deepSpaceCombatSystem: dscs, enemyAttackHandler: eah, orbitalSpaceSystem: oss,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} },
    intelSystem: { getVesselContact: () => ({ quality: 'contact' }), getLevel: () => 'contact', isAtLeast: () => true },
    debug: { combatTrace: false },
  });
  rec = { rounds: [], battles: [], wrecks: [], frame: 0, ticks: 0, ticksThisFrame: 0, pauseTicks: 0, pauseRounds: 0, inPause: false };
  const orig = dscs._tickEncounter.bind(dscs);
  dscs._tickEncounter = (enc, civDy) => {
    orig(enc, civDy);
    rec.rounds.push({ enc: enc.id, round: enc.currentRound, gy: ts.gameTime, vnow: clock.now, frame: rec.frame });
    if (rec.inPause) rec.pauseRounds++;
  };
  EventBus.on('time:tick', () => { rec.ticks++; rec.ticksThisFrame++; if (rec.inPause) rec.pauseTicks++; });
  EventBus.on('battle:resolved', ({ result }) => {
    if (!result?.id?.startsWith?.('battle_ds_')) return;
    const evs = (result.timeline ?? []).flatMap(r => r.events ?? []);
    rec.battles.push([Math.max(0, ...(result.timeline ?? []).map(r => r.round ?? 0)), evs.length, evs.filter(e => e.hit).length,
      result.winner ?? null, result.retreated ?? null, result.lossesA ?? null, result.lossesB ?? null]);
  });
  EventBus.on('vessel:wrecked', ({ vesselId, vessel }) => rec.wrecks.push(vessel?.name ?? vesselId));
}

function ship({ xAU, yAU = 0, name, empire = null, modules, hull = 'hull_frigate' }) {
  const v = vm.createAndRegister(hull, 'p_home', { name, modules });
  v.position.x = xAU * AU; v.position.y = yAU * AU; v.position.state = 'orbiting'; v.position.dockedAt = null;
  v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.systemId = SYS;
  if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; v.serviceState = 'active'; }
  return v;
}

/** Scena starcia: 3 fregaty gracza (laser) z `engage` na niszczyciel AI (2 rakiety, kinetyk, pancerz); `START_AU` od niego. */
function combatScene() {
  const guard = ship({ xAU: 1.0, yAU: 0, name: 'Straznik', empire: EMP, hull: 'hull_destroyer',
    modules: ['weapon_missile', 'weapon_missile', 'weapon_kinetic', 'engine_ion', 'armor_heavy'] });
  const frigs = [0, 1, 2].map(i => {
    const ang = 2.6 + i * 0.25;
    return ship({ xAU: 1.0 + Math.cos(ang) * START_AU, yAU: Math.sin(ang) * START_AU, name: `Fregata${i}`, modules: ['weapon_laser', 'engine_ion'] });
  });
  const orders = frigs.map(f => mos.issueOrder(f.id, { type: 'engage', targetEntityId: guard.id, issuedBy: 'keeper' })?.ok === true);
  return { guard, frigs, orders };
}

/** Ustaw czas realny rundy oglądanego starcia (C1: zastąpienie metody na instancji). */
function setRoundMs(ms) { ts.combatRoundMs = () => ms; }

const encActive = () => dscs.listActive().length > 0;

/**
 * Jedna klatka gry: czas realny +ms, `TimeSystem.update(ms)` (jak pętla rAF — także w pauzie, wtedy `update` wraca).
 */
function frame(ms) {
  clock.now += ms;
  rec.ticksThisFrame = 0;
  ts.update(ms);
  rec.frame++;
}

/**
 * Przebieg sceny: klatki do końca starcia (+ 60 klatek po), z opcjami prędkości w walce, klatki walki i pauzy.
 * @returns {{sig, rounds, battles, pause, after, frames}}
 */
function run({ roundMs = null, speedIdx = null, combatFrameMs = 16, pauseAtRound = null, pauseMs = 0, view = SYS, maxFrames = 40000 } = {}) {
  world({ view });
  if (roundMs != null) setRoundMs(roundMs);
  const sc = combatScene();
  let pause = null, endFrame = null, after = null;
  for (let n = 0; n < maxFrames; n++) {
    const inCombat = encActive();
    if (inCombat && speedIdx != null) ts.multiplierIndex = speedIdx;          // gracz przestawia prędkość w trakcie walki
    if (inCombat && pauseAtRound != null && !pause) {
      const r = rec.rounds.length ? rec.rounds[rec.rounds.length - 1].round : 0;
      if (r >= pauseAtRound) {
        pause = { atRound: r, sim0: ts.simClockMs ?? null, gy0: ts.gameTime, rounds0: rec.rounds.length, frame0: rec.frame };
        ts.pause(); rec.inPause = true;
        for (let t = 0; t < pauseMs; t += 16) frame(16);                      // pętla rAF biegnie, gra stoi
        rec.inPause = false; ts.play();
        pause.sim1 = ts.simClockMs ?? null; pause.gy1 = ts.gameTime; pause.frame1 = rec.frame;
        pause.ticks = rec.pauseTicks; pause.rounds = rec.pauseRounds;
      }
    }
    frame(inCombat ? combatFrameMs : 16);
    if (!encActive() && rec.battles.length > 0) {
      if (endFrame == null) {
        endFrame = rec.frame;
        // po starciu: jedna klatka — świat tyka prędkością gracza (CP3 „restored after”)
        const gy = ts.gameTime; frame(16); after = { dyDays: (ts.gameTime - gy) / DAY, idx: ts.multiplierIndex };
      }
      if (rec.frame - endFrame > 60) break;
    }
  }
  const sig = { battles: rec.battles, wrecks: [...rec.wrecks].sort() };
  let afterPause = null;
  if (pause) {
    const later = rec.rounds.filter(r => r.frame >= pause.frame1);
    const perFrame = {}; for (const r of later) perFrame[r.frame] = (perFrame[r.frame] ?? 0) + 1;
    afterPause = { maxPerFrame: Math.max(0, ...Object.values(perFrame)), n: later.length };
  }
  return { sig, rounds: rec.rounds, pause, afterPause, after, frames: rec.frame, orders: sc.orders };
}

/** Krok gry między kolejnymi rundami pierwszego starcia (dni) i czas realny 1. → ostatniej rundy (ms). */
function pace(r) {
  const first = r.rounds.length ? r.rounds[0].enc : null;
  const rs = r.rounds.filter(x => x.enc === first);
  const dDays = []; const dReal = [];
  for (let i = 1; i < rs.length; i++) { dDays.push(+((rs[i].gy - rs[i - 1].gy) / DAY).toFixed(4)); dReal.push(rs[i].vnow - rs[i - 1].vnow); }
  return { n: rs.length, dDays, dReal, realMs: rs.length > 1 ? rs[rs.length - 1].vnow - rs[0].vnow : 0 };
}
const sigStr = (s) => JSON.stringify(s);
/** Kwant czasu realnego rundy przy kluczu `k`: klatka siatki (16 ms zegara starcia = 16 × k / 110 ms realnych) + klatka gry. */
const quantum = (k) => 16 * k / 110 + 16;
const okDays = (d) => d.every(x => Math.abs(x - 0.096) < 1e-6 || Math.abs(x - 0.112) < 1e-6);
/** Czas gry KAŻDEJ rundy KAŻDEGO starcia (lata, bez zaokrągleń) — ta sama sekwencja = ten sam przebieg świata co runda. */
const gySeq = (r) => r.rounds.map(x => `${x.round}@${x.gy}`);

// ═══ RECORD (kod sprzed P1) ═══════════════════════════════════════════════════════
if (RECORD) {
  const r = run();
  console.log('TODAY_SIG = ' + JSON.stringify(r.sig));
  const p = pace(r);
  console.log(`rundy 1. starcia ${p.n}, krok gry/rundę ${[...new Set(p.dDays)].join('/')} dni, czas realny ${p.realMs} ms`);
  process.exit(0);
}

// ═══ T1 ═══════════════════════════════════════════════════════════════════════════
header('T1  odniesienie = dziś (60 FPS, 1 d/s, bez pauzy): sygnatura równa nagranej na kodzie sprzed P1; KONTROLA X = X');
const ref = run();
const ref2 = run();
{
  const p = pace(ref);
  console.log(`     sygnatura: ${sigStr(ref.sig)}`);
  console.log(`     1. starcie: rund ${p.n}, krok gry/rundę ${[...new Set(p.dDays)].join(' / ')} dni, czas realny ${p.realMs} ms`);
  assert(ref.orders.every(Boolean) && ref.sig.battles.length > 0 && ref.sig.battles[0][1] > 0,
    'T1-0 KONTROLA sceny: trzy rozkazy `engage` przyjęte, starcie powstało, strzały padły');
  assert(same(ref.sig, ref2.sig), 'T1-0b KONTROLA X = X: drugi przebieg — ta sama sygnatura');
  assert(TODAY_SIG != null && same(ref.sig, TODAY_SIG),
    `T1 SEDNO: sygnatura = nagrana na kodzie sprzed P1 (dziś, 60 FPS, 1 d/s)${TODAY_SIG ? '' : ' — BRAK nagrania'}`);
}

// ═══ T2 ═══════════════════════════════════════════════════════════════════════════
header('T2  klucz 110 / 400 / 1000 ms — sygnatura = dziś; czas realny = (rundy − 1) × klucz ± kwant siatki');
const byKey = {};
for (const k of [110, 400, 1000]) byKey[k] = run({ roundMs: k });
for (const k of [110, 400, 1000]) {
  const p = pace(byKey[k]);
  const expect = (p.n - 1) * k, tol = quantum(k);
  console.log(`     klucz ${k}: rund ${p.n}, czas realny ${p.realMs} ms (oczekiwane ${expect} ± ${tol.toFixed(0)}), sygnatura ${sigStr(byKey[k].sig) === sigStr(ref.sig) ? '= odniesienie' : sigStr(byKey[k].sig)}`);
  assert(same(byKey[k].sig, ref.sig), `T2a klucz ${k}: sygnatura = odniesienie (dziś)`);
  assert(same(gySeq(byKey[k]), gySeq(ref)), `T2c klucz ${k}: czas gry każdej rundy = odniesienie (ten sam przebieg świata)`);
  assert(p.n > 1 && Math.abs(p.realMs - expect) <= tol, `T2b klucz ${k}: czas realny 1. starcia ${p.realMs} ms = (rundy − 1) × klucz ± ${tol.toFixed(0)} ms (świadek: klucz działa)`);
}

// ═══ T3 ═══════════════════════════════════════════════════════════════════════════
header('T3  prędkość gracza w trakcie starcia 1 d/s … 1 rok/s — sygnatura = dziś; po starciu świat tyka prędkością gracza');
const bySpeed = {};
for (const s of SPEEDS) bySpeed[s] = run({ roundMs: 400, speedIdx: s });
for (const s of SPEEDS) {
  const r = bySpeed[s];
  const exp = (16 / 1000) * GAME_CONFIG.TIME_MULTIPLIERS[s] / DAY;
  console.log(`     prędkość ${s} (${GAME_CONFIG.TIME_MULTIPLIER_LABELS[s]}): ${same(r.sig, ref.sig) ? '= odniesienie' : sigStr(r.sig)} · po starciu: indeks ${r.after?.idx}, krok ${r.after?.dyDays?.toFixed(4)} dnia (oczekiwane ${exp.toFixed(4)})`);
  assert(same(r.sig, ref.sig), `T3a prędkość ${GAME_CONFIG.TIME_MULTIPLIER_LABELS[s]} w trakcie starcia: sygnatura = odniesienie`);
  assert(same(gySeq(r), gySeq(ref)), `T3c prędkość ${GAME_CONFIG.TIME_MULTIPLIER_LABELS[s]}: czas gry każdej rundy = odniesienie`);
  assert(r.after && r.after.idx === s && Math.abs(r.after.dyDays - exp) < 1e-6,
    `T3b ${GAME_CONFIG.TIME_MULTIPLIER_LABELS[s]}: po starciu pierwsza klatka tyka prędkością ustawioną przez gracza (KONTROLA: ustawienie nietknięte)`);
}

// ═══ T4 ═══════════════════════════════════════════════════════════════════════════
header('T4  klatka walki 33 ms (30 FPS) — sygnatura = dziś');
const f33 = run({ roundMs: 400, combatFrameMs: 33 });
const f33k110 = run({ roundMs: 110, combatFrameMs: 33 });
{
  console.log(`     33 ms, klucz 400: ${same(f33.sig, ref.sig) ? '= odniesienie' : sigStr(f33.sig)} · klucz 110: ${same(f33k110.sig, ref.sig) ? '= odniesienie' : sigStr(f33k110.sig)}`);
  assert(same(f33.sig, ref.sig), 'T4a klatka walki 33 ms, klucz 400: sygnatura = odniesienie');
  assert(same(f33k110.sig, ref.sig), 'T4b klatka walki 33 ms, klucz 110: sygnatura = odniesienie');
  assert(same(gySeq(f33), gySeq(ref)) && same(gySeq(f33k110), gySeq(ref)), 'T4c klatka walki 33 ms: czas gry każdej rundy = odniesienie (oba klucze)');
}

// ═══ T5 ═══════════════════════════════════════════════════════════════════════════
header('T5  pauza 2 s i 30 s w trakcie starcia — zero tików i rund w pauzie, zegar klatek stoi, bez nadrabiania; sygnatura = dziś');
const byPause = {};
for (const ms of [2000, 30000]) byPause[ms] = run({ roundMs: 400, pauseAtRound: 5, pauseMs: ms });
for (const ms of [2000, 30000]) {
  const r = byPause[ms];
  const P = r.pause;
  console.log(`     pauza ${ms} ms w rundzie ${P?.atRound}: tików ${P?.ticks}, rund ${P?.rounds}, zegar klatek ${P?.sim0} → ${P?.sim1}, rok ${P?.gy0?.toFixed(6)} → ${P?.gy1?.toFixed(6)} · po pauzie rund ${r.afterPause?.n}, najwięcej na klatkę ${r.afterPause?.maxPerFrame} · ${same(r.sig, ref.sig) ? '= odniesienie' : sigStr(r.sig)}`);
  assert(!!P && P.atRound >= 5 && P.ticks === 0 && P.rounds === 0 && P.gy0 === P.gy1,
    `T5a pauza ${ms} ms: w pauzie zero tików i zero rund, czas gry stoi (świadek: pauza w rundzie ${P?.atRound})`);
  assert(!!P && P.sim0 != null && P.sim0 === P.sim1, `T5b pauza ${ms} ms: zegar klatek symulacji stoi w pauzie`);
  assert(!!r.afterPause && r.afterPause.n > 0 && r.afterPause.maxPerFrame <= 1,
    `T5c pauza ${ms} ms: po odpauzowaniu najwyżej jedna runda na klatkę — bez nadrabiania (rund po pauzie ${r.afterPause?.n})`);
  assert(same(r.sig, ref.sig), `T5d pauza ${ms} ms: sygnatura = odniesienie (bez pauzy)`);
  assert(same(gySeq(r), gySeq(ref)), `T5e pauza ${ms} ms: czas gry każdej rundy = odniesienie — starcie wraca dokładnie tam, gdzie stanęło`);
}

// ═══ T6 ═══════════════════════════════════════════════════════════════════════════
header('T6  krok czasu gry na rundę = dzisiejszy (0,096 / 0,112 dnia) przy każdym kluczu, prędkości i klatce');
{
  const cases = [['dziś (odniesienie)', ref], ['klucz 1000', byKey[1000]], ['1 rok/s', bySpeed[5]], ['1 mies./s', bySpeed[4]], ['klatka 33 ms', f33], ['pauza 30 s', byPause[30000]]];
  for (const [lbl, r] of cases) {
    const p = pace(r);
    console.log(`     ${lbl}: krok gry/rundę ${[...new Set(p.dDays)].join(' / ')} dni`);
    assert(p.dDays.length > 0 && okDays(p.dDays), `T6 ${lbl}: każdy krok gry między rundami = 0,096 albo 0,112 dnia`);
  }
}

// ═══ T7 ═══════════════════════════════════════════════════════════════════════════
header('T7  starcie w układzie, którego gracz nie ogląda — 110 ms realnych na rundę także przy kluczu 1000; zamarza w pauzie');
{
  const un = run({ roundMs: 1000, view: 'sys_inny' });
  const unP = run({ roundMs: 1000, view: 'sys_inny', pauseAtRound: 5, pauseMs: 30000 });
  const pu = pace(un), pw = pace(byKey[1000]);
  console.log(`     nieoglądane (klucz 1000): rund ${pu.n}, czas realny ${pu.realMs} ms · oglądane (klucz 1000): ${pw.realMs} ms · pauza 30 s: tików ${unP.pause?.ticks}, rund ${unP.pause?.rounds}, po pauzie najwięcej ${unP.afterPause?.maxPerFrame} na klatkę`);
  assert(pw.n > 1 && Math.abs(pw.realMs - (pw.n - 1) * 1000) <= quantum(1000), 'T7-0 świadek: to samo starcie OGLĄDANE przy kluczu 1000 — 1000 ms na rundę (± kwant siatki)');
  assert(pu.n > 1 && Math.abs(pu.realMs - (pu.n - 1) * 110) <= quantum(110), `T7a nieoglądane: czas realny ${pu.realMs} ms = (rundy − 1) × 110 ± ${quantum(110).toFixed(0)} ms — dzisiejsze tempo, nie klucz`);
  assert(same(un.sig, ref.sig) && same(gySeq(un), gySeq(ref)), 'T7b nieoglądane: sygnatura i czas gry każdej rundy = odniesienie');
  assert(!!unP.pause && unP.pause.ticks === 0 && unP.pause.rounds === 0 && unP.afterPause?.maxPerFrame <= 1 && same(unP.sig, ref.sig),
    'T7c nieoglądane: w pauzie zero tików i rund, po pauzie bez nadrabiania, sygnatura = odniesienie');
}

// ═══ T8 ═══════════════════════════════════════════════════════════════════════════
header('T8  zegar orbit: statek na zarejestrowanej orbicie — w pauzie stoi i nie skacze; w starciu przyrasta krokami siatki');
{
  world();
  setRoundMs(400);
  const ob = ship({ xAU: 3, name: 'Orbiter', modules: ['weapon_laser', 'engine_ion'] });
  ob.position.dockedAt = 'p_rock';
  const orbit = oss.assignOrbit('p_rock', ob.id, 'warship');
  const ang = () => Math.atan2(ob.position.y - EntityManager.get('p_rock').y, ob.position.x - EntityManager.get('p_rock').x);
  const dA = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  for (let i = 0; i < 5; i++) frame(16);
  const a0 = ang();
  frame(16);
  const stepRun = dA(a0, ang());                                   // jedna klatka 16 ms poza starciem
  ts.pause(); const aP0 = ang();
  for (let t = 0; t < 10000; t += 16) frame(16);                   // pauza 10 s
  ts.play(); frame(16);
  const stepAfterPause = dA(aP0, ang());
  const om = orbit?.omega ?? 0;
  console.log(`     ω ${om.toFixed(4)} rad/s · krok na klatkę przed pauzą ${stepRun.toFixed(6)} rad · pierwszy krok po pauzie 10 s ${stepAfterPause.toFixed(6)} rad (skok przy czasie realnym ≈ ${(om * 10).toFixed(3)} rad)`);
  assert(!!orbit && om > 0 && Math.abs(stepRun - om * 0.016) < 1e-9, 'T8-0 KONTROLA: orbita zarejestrowana, poza starciem kąt rośnie o ω × 16 ms na klatkę (dzisiejszy wygląd)');
  assert(Math.abs(stepAfterPause - om * 0.016) < 1e-9, 'T8a po pauzie 10 s: pierwszy krok = ω × 16 ms — kąt nie przeskakuje o ω × 10 s');
  // w oglądanym starciu (klucz 400): kąt przyrasta krokami siatki — 110 / 400 tempa czasu realnego
  const sc = combatScene();
  frame(16);                                                       // pierwszy tik — starcie powstaje
  const inEnc = encActive();
  const aC0 = ang(); const t0 = clock.now;
  for (let i = 0; i < 125 && encActive(); i++) frame(16);          // 2 s czasu realnego
  const realS = (clock.now - t0) / 1000;
  const dC = dA(aC0, ang());
  const expGrid = om * realS * 110 / 400;
  console.log(`     w starciu (klucz 400): ${realS.toFixed(3)} s realnych → kąt +${dC.toFixed(5)} rad (siatka ${expGrid.toFixed(5)}, czas realny ${(om * realS).toFixed(5)})`);
  assert(inEnc && sc.orders.every(Boolean), 'T8-0b KONTROLA: starcie w tym samym układzie trwa');
  assert(inEnc && Math.abs(dC - expGrid) <= om * 0.016 + 1e-9, 'T8b w oglądanym starciu kąt orbity przyrasta krokami siatki (110 / 400 czasu realnego, ± jedna klatka siatki)');
}

// ═══ T9 ═══════════════════════════════════════════════════════════════════════════
header('T9  pin źródłowy: DSCS bez czasu realnego; orbity przez `orbitClockSec()`; siatka w `TimeSystem`');
{
  const dscsSrc = readSrc('systems/DeepSpaceCombatSystem.js');
  const tick = dscsSrc.slice(dscsSrc.indexOf('  _tick(civDy) {'), dscsSrc.indexOf('  _closeToWeaponRange(encounter) {'));
  assert(/combatClockMs\(\)/.test(tick) && !/performance\.now|Date\.now|_nowMs/.test(dscsSrc),
    'T9a DSCS: `_tick` czyta zegar starcia (`combatClockMs()`); w pliku nie ma `performance.now` / `Date.now` / `_nowMs`');
  const files = ['systems/VesselManager.js', 'systems/EnemyAttackHandler.js', 'systems/OrbitalSpaceSystem.js'];
  const counts = files.map(f => { const s = readSrc(f); return [f, (s.match(/orbitClockSec\(\)/g) ?? []).length, /performance\.now\(\)\s*\*\s*0\.001/.test(s)]; });
  console.log(`     orbitClockSec(): ${counts.map(([f, n, old]) => `${f.split('/')[1]} ${n}${old ? ' (+ czas realny!)' : ''}`).join(' · ')}`);
  assert(counts[0][1] === 3 && counts[1][1] === 1 && counts[2][1] === 1 && counts.every(([, , old]) => !old),
    'T9b kąt orbity w logice: VesselManager ×3, EnemyAttackHandler ×1, OrbitalSpaceSystem (domyślny) — `orbitClockSec()`, bez `performance.now() * 0.001`');
  const tr = readSrc('renderer/ThreeRenderer.js');
  const body = (name) => { const i = tr.indexOf(`  ${name}() {`); return i < 0 ? '' : tr.slice(i, tr.indexOf('\n  }\n', i)); };
  assert(/const tSec = orbitClockSec\(\);/.test(body('_tickOrbitingVessels')) && /const tSec = orbitClockSec\(\);/.test(body('_tickOrbitingStations')),
    'T9c renderer: `_tickOrbitingVessels` i `_tickOrbitingStations` — ten sam zegar co logika (`orbitClockSec()`)');
  const tsSrc = readSrc('systems/TimeSystem.js');
  assert(/_updateCombatGrid\(deltaMs, view\)/.test(tsSrc) && /this\.simClockMs \+= COMBAT_GRID_FRAME_MS/.test(tsSrc) && /if \(this\.isPaused \|\| !this\._combatView\(\)\)/.test(tsSrc),
    'T9d TimeSystem: siatka starcia (`_updateCombatGrid`), zegar klatek +16 ms na klatkę siatki, przerwanie pętli przy pauzie i końcu starcia');
}

console.log(`\n═══ combat_pace_smoke: ${pass} PASS / ${fail} FAIL ═══`);
if (fail > 0) process.exit(1);
