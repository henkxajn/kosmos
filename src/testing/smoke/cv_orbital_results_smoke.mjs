// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_orbital_results_smoke — KEEPER ARC COMBAT VISUALS, krok CV-8a (D-CV-25 / D-CV-26 / D-CV-27; Findingi 628, 632).
// PRAWDZIWA bitwa orbitalna na świecie headless (`GameCore`, `EnemyAttackHandler._resolveBatchedBattle` → `BattleSystem` →
// `WarSystem.recordBattle` → `battle:resolved` → wraki) + PRAWDZIWY klej powtórki `src/renderer/CvOrbital.js` z atrapą renderera
// (zegar prezentacji, prawdziwy rejestr salw `CombatLedger`, geometria ciała) — klej importuje się pod node (bez THREE).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// PINY:
//   R1 `fx` (flaga `cvOrbital` ON): klucz-RODZEŃSTWO zdarzenia — rodzaj, napastnicy = wrogowie na orbicie ciała, obrońcy = okręty gracza
//      w służbie w układzie, hangar = zadokowani, obrona z budynków (narzędzie konsoli `_cvStagerDefence`), ciało, układ, imperium
//   R2 wynik i rekord bitwy (`gameState.battles`) co do JSON identyczne ON / OFF; OFF — zdarzenie bez klucza `fx`; `fx` nigdy w wyniku
//      ani w rekordzie (ścieżka wojny I potyczki bez wojny)
//   R3 każde id `fx` istnieje w rejestrze statków
//   R4 powtórka na kleju: start w widoku; wraki z EAH wstrzymane do zniszczenia w powtórce (bez wczesnej zamiany); na końcu
//      zniszczenia POKAZANE = straty LOGICZNE (wraki EAH wśród uczestników), każde raz; `combatfx:orbitalReplayEnd` dokładnie raz
//   R5 okręty w hangarze: nigdy w klastrze sceny, sprite wstrzymany do zniszczenia, potem jeden sprite wraku; wybuch na emiterze
//   R6 bramka widoku (Finding 628): inny układ / tryb galaktyki — bez powtórki (baner od razu); zmiana układu w trakcie — przerwanie
//      z zaległymi zamianami we wrak i końcem
//   R7 pat (bezbronni) — EAH bez wraków, powtórka bez zniszczeń
//   R8 `_cvStagerDefence` zdjęte po bitwie; bez niego jednostka obrońcy co do liczby jak przed CV-8a (formuła budynków)
//   R9 piny źródłowe: `GameScene` — źródło 'orbital', baner i linia Dziennika po końcu powtórki (#632, D-CV-27 (a), §3.1-6); renderer —
//      burst nigdy pod flagą
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
import '../headless/env.js';
import { readFileSync } from 'node:fs';
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { GameCore } from '../headless/GameCore.js';
import { createVessel } from '../../entities/Vessel.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { CvOrbital } from '../../renderer/CvOrbital.js';
import { CombatLedger, LEDGER_TUNING } from '../../renderer/combat/CombatLedgerLogic.js';
import { ORB_TUNING } from '../../renderer/combat/OrbitalReplayLogic.js';

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l); } };
const guard = (label, fn) => { try { fn(); } catch (e) { fail++; console.log(`  ✗ ${label}: WYJĄTEK ${e?.stack ?? e}`); } };
const F = GAME_CONFIG.FEATURES;
const FLAG0 = F.cvOrbital;

const WAR_A = ['engine_ion', 'weapon_kinetic', 'weapon_laser', 'armor_standard'];
const WAR_B = ['engine_ion', 'weapon_laser', 'weapon_kinetic', 'shield_basic'];

/** Świat z atakiem na kolonię gracza; `glue` — klej powtórki z atrapą renderera podpięty PRZED rozstrzygnięciem. */
function battle({ flag = true, nA = 3, nB = 3, hangar = 1, tower = 2, grid = 1, modsA = WAR_A, modsB = WAR_B, glue = false, view = null, galaxy = false } = {}) {
  F.cvOrbital = flag;
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  const K = window.KOSMOS;
  if (core.fleetPoolSystem) core.fleetPoolSystem.enabled = false;   // keeper wypowiada wojnę (EAH), pula floty nie jest tu pinowana
  if (core.garrisonSystem) core.garrisonSystem.enabled = false;
  const home = K.homePlanet;
  const sys = home.systemId ?? 'sys_home';
  const empire = core.empireRegistry.listAll()[0]?.id;
  const vm = core.vesselManager;
  const mk = (hull, mods, name) => { const v = createVessel(hull, home.id, { name, modules: [...mods], x: home.x, y: home.y, systemId: sys }); vm._vessels.set(v.id, v); v.serviceState = 'active'; return v; };
  const attackers = [], defenders = [];
  for (let i = 0; i < nA; i++) {
    const v = mk(i % 2 ? 'hull_destroyer' : 'hull_frigate', modsA, `A${i}`);
    v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true;
    Object.assign(v.position, { state: 'orbiting', dockedAt: home.id });
    v.status = 'on_mission'; v.mission = { type: 'attack', targetId: home.id };
    attackers.push(v);
  }
  for (let i = 0; i < nB; i++) {
    const v = mk(i % 2 ? 'hull_destroyer' : 'hull_frigate', modsB, `B${i}`);
    if (i < hangar) Object.assign(v.position, { state: 'docked', dockedAt: home.id });
    else Object.assign(v.position, { state: 'orbiting', dockedAt: home.id });
    defenders.push(v);
  }
  core.warSystem._cvStagerDefence = (tower || grid) ? { planetId: home.id, tower, grid } : null;
  const events = [], wrecked = [], ends = [];
  let orb = null, fake = null;
  if (glue) {
    const led = new CombatLedger({ tuning: { ...LEDGER_TUNING } });
    fake = {
      cvTuning: { ...ORB_TUNING, ...LEDGER_TUNING }, _presClock: { nowMs: 0 }, _cvLedger: led, _galaxyActive: galaxy,
      getBodyWorldInfo: () => ({ x: 4, y: 0, z: 1, r: 0.08 }),
      fed: [], views: [], sprites: [], booms: [],
      _cvWpnRoundFx(p) { this.fed.push(p.round); led.addRound({ encounterId: p.encounterId, round: p.round, seed: p.seed, events: p.events, nowMs: this._presClock.nowMs, roundMs: 1150 }); },
      _onVesselWreckedView(id) { this.views.push(id); },
      _addVesselSprite(v) { this.sprites.push(v.id); },
      _spawnExplosion(pos) { this.booms.push(pos); },
    };
    orb = new CvOrbital(fake);
    if (view) K.activeSystemId = view;
  }
  EventBus.on('battle:resolved', (p) => { events.push(p); if (orb) orb.handle(p); });
  EventBus.on('vessel:wrecked', ({ vesselId, vessel }) => { if (orb && orb.deferWreck(vesselId, vessel)) return; wrecked.push(vesselId); });
  EventBus.on('combatfx:orbitalReplayEnd', (p) => ends.push(p));
  const eah = new EnemyAttackHandler();
  for (const v of attackers) eah._onVesselArrived(v, v.mission);
  const pend = eah._pendingBattles.get(home.id);
  if (pend?.timerId) clearTimeout(pend.timerId);
  eah._resolveBatchedBattle(home.id);
  return { core, K, home, sys, empire, attackers, defenders, events, wrecked, ends, orb, fake };
}

/** Pętla klatek kleju: zegar prezentacji + rejestr (zniszczenia przez haki renderera `_cvWpnPresentKill`). */
function runReplay(w, { maxMs = 120000, onFrame = null } = {}) {
  const { orb, fake } = w;
  const shown = [];
  for (let t = 0; t < maxMs && orb.replays.size; t += 16) {
    fake._presClock.nowMs = t;
    orb.tick();
    const { kills } = fake._cvLedger.advance(t);
    for (const id of kills) { if (orb.presentKill(id)) { shown.push(id); continue; } shown.push(id); orb.afterKill(id); }
    onFrame?.(t);
  }
  return shown;
}

const sameSet = (a, b) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());

// ── proces potomny R2: jedna bitwa w świecie od zera, wynik i rekord jako JSON ──
if (process.argv.includes('--child')) {
  const mode = process.argv[process.argv.indexOf('--child') + 1];
  const flag = mode.endsWith('-on');
  let p = null;
  if (mode.startsWith('war')) {
    const w = battle({ flag });
    p = w.events.find((e) => e.result?.location?.planetId === w.home.id) ?? null;
  } else {
    F.cvOrbital = flag;
    const core = new GameCore(); core.boot({ quiet: true, scenario: 'civilization' });
    if (core.fleetPoolSystem) core.fleetPoolSystem.enabled = false;
    if (core.garrisonSystem) core.garrisonSystem.enabled = false;
    const K = window.KOSMOS; const home = K.homePlanet; const emp = core.empireRegistry.listAll()[0]?.id;
    K.diplomacySystem.declareWar = () => false; core.warSystem.createWar = () => null; core.warSystem.getWarWith = () => null;
    const v = createVessel('hull_frigate', home.id, { name: 'S', modules: [...WAR_A], x: home.x, y: home.y, systemId: home.systemId ?? 'sys_home' });
    core.vesselManager._vessels.set(v.id, v); v.ownerEmpireId = emp; v.owner = emp; v.isEnemy = true;
    Object.assign(v.position, { state: 'orbiting', dockedAt: home.id }); v.mission = { type: 'attack', targetId: home.id };
    const ev = []; EventBus.on('battle:resolved', (q) => ev.push(q));
    const eah = new EnemyAttackHandler(); eah._onVesselArrived(v, v.mission);
    clearTimeout(eah._pendingBattles.get(home.id)?.timerId); eah._resolveBatchedBattle(home.id);
    p = ev.find((e) => e.result?.location?.planetId === home.id) ?? null;
  }
  const rec = p?.battleId ? (gameState.get?.(`battles.${p.battleId}`) ?? null) : null;
  console.log('CHILD:' + JSON.stringify({ result: p ? JSON.stringify(p.result) : null, record: rec ? JSON.stringify(rec) : null, hasFx: !!p && 'fx' in p, warId: p?.warId ?? null }));
  process.exit(0);
}

console.log('R1 / R3 — klucz fx (flaga ON)');
let ON = null;
guard('R1', () => {
  ON = battle({ flag: true });
  const p = ON.events.find((e) => e.result?.location?.planetId === ON.home.id);
  const fx = p?.fx;
  assert(!!fx && fx.kind === 'orbital', 'R1a: zdarzenie bitwy orbitalnej niesie fx (rodzaj orbital)');
  assert(sameSet(fx?.attackerIds ?? [], ON.attackers.map((v) => v.id)), 'R1b: napastnicy = wrogowie na orbicie ciała');
  assert(sameSet(fx?.defenderIds ?? [], ON.defenders.map((v) => v.id)) && sameSet(fx?.hangarIds ?? [], [ON.defenders[0].id]), 'R1c: obrońcy = okręty gracza w układzie, hangar = zadokowany');
  assert(fx?.defence?.tower === 2 && fx?.defence?.grid === 1 && fx?.defence?.poolHp === 180 && fx?.defence?.token === false, `R1d: obrona wieża 2 / siatka 1 → pula 180 HP (${JSON.stringify(fx?.defence)})`);
  assert(fx?.planetId === ON.home.id && fx?.systemId === ON.sys && fx?.empireId === ON.empire, 'R1e: ciało, układ, imperium');
  const vm = ON.core.vesselManager;
  const ids = [...(fx?.attackerIds ?? []), ...(fx?.defenderIds ?? []), ...(fx?.hangarIds ?? [])];
  assert(ids.length > 0 && ids.every((id) => !!vm.getVessel(id)), `R3: każde id fx istnieje (${ids.length})`);
});

console.log('R2 — wynik i rekord bitwy identyczne ON / OFF; fx tylko na zdarzeniu (procesy potomne — ten sam świat od zera)');
guard('R2', () => {
  // ⚠ ON i OFF w OSOBNYCH procesach: licznik id statków żyje w module, więc drugi świat w tym samym procesie dostaje inne id
  //   statków, a ziarno bitwy EAH zależy od id (`_hashStr`) — porównanie w jednym procesie mierzyłoby różnicę id, nie flagi.
  const run = (mode) => JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--child', mode], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').find((l) => l.startsWith('CHILD:')).slice(6));
  const on = run('war-on'), off = run('war-off');
  assert(!!on.result && on.result === off.result, `R2a: wynik bitwy (rekord z zdarzenia) co do JSON identyczny ON / OFF (${on.result?.length} znaków)`);
  assert(!!on.record && on.record === off.record, 'R2b: rekord gameState.battles co do JSON identyczny ON / OFF');
  assert(on.hasFx && !off.hasFx && !on.result.includes('"fx"') && !on.record.includes('"fx"'), 'R2c: fx tylko na zdarzeniu przy ON — nigdy w wyniku ani w rekordzie');
  const sOn = run('skirm-on'), sOff = run('skirm-off');
  assert(!!sOn.result && sOn.result === sOff.result && sOn.warId === null && sOn.hasFx && !sOff.hasFx,
    'R2d: potyczka bez wojny (EAH emituje sama) — wynik identyczny, fx tylko przy ON');
});

console.log('R4 / R5 — powtórka na kleju: wraki wstrzymane, straty pokazane = logiczne, hangar');
guard('R4', () => {
  const w = battle({ flag: true, glue: true, nA: 3, nB: 4, hangar: 1, tower: 2, grid: 1 });
  const p = w.events.find((e) => e.fx);
  const st = w.orb.replays.get(p.battleId);
  assert(!!st && st.rep.rounds >= ORB_TUNING.ORB_ROUNDS_MIN, `R4a: powtórka wystartowała w widoku (${st?.rep.rounds} rund z ${st?.rep.turns} tur)`);
  const fxIds = [...p.fx.attackerIds, ...p.fx.defenderIds];
  const logicalLoss = fxIds.filter((id) => w.core.vesselManager.getVessel(id)?.isWreck);
  assert(logicalLoss.length > 0, `R4 ŚWIADEK: EAH zrobił wraki (${logicalLoss.length}, wygrywa ${p.result.winner})`);
  assert(logicalLoss.every((id) => !w.wrecked.includes(id)), 'R4b: żadna zamiana we wrak uczestnika przed zniszczeniem w powtórce (wszystkie wstrzymane)');
  const clusters = w.orb.stageClusters();
  const hangarId = p.fx.hangarIds[0];
  assert(clusters.length === 1 && !clusters[0].ids.includes(hangarId) && !clusters[0].ids.some((id) => id.includes(':def')), 'R5a: okręt z hangaru i pula obrony nigdy w klastrze sceny');
  const hangarDoomed = st.rep.kills[hangarId] != null;
  if (hangarDoomed) assert(w.orb.holdsHidden(hangarId), 'R5b: hangar skazany — sprite wstrzymany do zniszczenia');
  let holdWhileAlive = true;
  const shown = runReplay(w, { onFrame: () => { if (hangarDoomed && !w.fake.sprites.includes(hangarId) && !w.orb.holdsHidden(hangarId) && w.orb.replays.size) holdWhileAlive = false; } });
  assert(sameSet(shown, logicalLoss) && shown.length === new Set(shown).size, `R4c: zniszczenia pokazane = straty logiczne, każde raz (${shown.length})`);
  assert(w.ends.length === 1 && w.ends[0].battleId === p.battleId && w.ends[0].reason === 'ended', 'R4d: koniec powtórki — combatfx:orbitalReplayEnd dokładnie raz');
  const onStageLoss = logicalLoss.filter((id) => id !== hangarId);
  assert(sameSet(w.fake.views, onStageLoss) && w.fake.views.length === onStageLoss.length, `R4e: zaległa zamiana we wrak — raz na okręt na scenie, po zniszczeniu (${w.fake.views.length})`);
  assert(w.fake.fed.length === st.rep.rounds - st.rep.roundList.filter((r) => !r.events.length).length, `R4f: każda runda ze strzałami raz w rejestrze (${w.fake.fed.length})`);
  if (hangarDoomed) assert(w.fake.sprites.filter((id) => id === hangarId).length === 1 && holdWhileAlive && w.fake.booms.length >= 1, 'R5c: hangar — jeden sprite wraku po zniszczeniu, wybuch na emiterze');
  else assert(!w.fake.sprites.includes(hangarId), 'R5c: hangar ocalały — bez sprite\'a (zadokowany jak był)');
  // druga strona: wygrywa AI — obrońcy (w tym hangar) giną
  const w2 = battle({ flag: true, glue: true, nA: 6, nB: 2, hangar: 1, tower: 0, grid: 0 });
  const p2 = w2.events.find((e) => e.fx);
  const loss2 = [...p2.fx.attackerIds, ...p2.fx.defenderIds].filter((id) => w2.core.vesselManager.getVessel(id)?.isWreck);
  const shown2 = runReplay(w2);
  assert(p2.result.winner === 'A' && sameSet(shown2, loss2) && loss2.includes(p2.fx.hangarIds[0]) && w2.fake.sprites.includes(p2.fx.hangarIds[0]),
    `R4g: wygrywa AI — giną obrońcy, także z hangaru (pokazane ${shown2.length} = logiczne ${loss2.length}; sprite wraku hangaru po zniszczeniu)`);
});

console.log('R6 — bramka widoku i przerwanie');
guard('R6', () => {
  const other = battle({ flag: true, glue: true, view: 'sys_other_test' });
  assert(other.orb.replays.size === 0 && other.orb.stats.refusedView === 1 && other.wrecked.length > 0, 'R6a: bitwa w innym układzie — bez powtórki, wraki od razu (dzisiejsza ścieżka)');
  const gal = battle({ flag: true, glue: true, galaxy: true });
  assert(gal.orb.replays.size === 0 && gal.orb.stats.refusedView === 1, 'R6b: tryb galaktyki — bez powtórki');
  const ab = battle({ flag: true, glue: true, nA: 3, nB: 3 });
  const st = [...ab.orb.replays.values()][0];
  const nDef = st.deferred.size;
  ab.fake._presClock.nowMs = 2000; ab.orb.tick();
  ab.K.activeSystemId = 'sys_elsewhere';
  ab.orb.tick();
  assert(nDef > 0 && ab.ends.length === 1 && ab.ends[0].reason === 'aborted' && ab.orb.replays.size === 0 && ab.fake.views.length === nDef,
    `R6c: zmiana układu w trakcie — przerwanie, zaległe zamiany we wrak od razu (${ab.fake.views.length}/${nDef}), koniec raz`);
  const offFlag = battle({ flag: false, glue: true });
  assert(offFlag.orb.replays.size === 0 && !offFlag.events.some((e) => e.fx), 'R6d: flaga OFF — bez fx i bez powtórki');
});

console.log('R7 — pat (bezbronni)');
guard('R7', () => {
  const w = battle({ flag: true, glue: true, modsA: ['engine_ion'], modsB: ['engine_ion'], tower: 0, grid: 0, hangar: 0, nA: 2, nB: 2 });
  const p = w.events.find((e) => e.fx);
  const wr = [...p.fx.attackerIds, ...p.fx.defenderIds].filter((id) => w.core.vesselManager.getVessel(id)?.isWreck);
  const shown = runReplay(w);
  assert(p.fx.endReason === 'no_damage_possible' && wr.length === 0 && shown.length === 0 && w.ends.length === 1, `R7: pat (${p.fx.endReason}, z fx — rekord wojny nie niesie endReason) — EAH bez wraków, powtórka bez zniszczeń, koniec`);
});

console.log('R7b — pat Z BRONIĄ (tarcza nie do przebicia) — rekord wojny bez endReason, powtórka bez zniszczeń');
guard('R7b', () => {
  // ⚠ Pat bezbronnych (R7) nie odróżnia „pat” od „remis przez wzajemne zniszczenie” — bez strzałów nikt i tak nie ginie. Tu strona A ma
  //   laser (5), strona B — regenerację osłony 6 / turę (2 × shield_phase): strażnik M1 kończy bitwę w turze 0 (`no_damage_possible`),
  //   rekord wojny (`recordBattle`) nie niesie `endReason` — bez `fx.endReason` powtórka zrobiłaby z tego wzajemne zniszczenie.
  const w = battle({ flag: true, glue: true, modsA: ['engine_ion', 'weapon_laser'], modsB: ['engine_ion', 'shield_phase', 'shield_phase'], tower: 0, grid: 0, hangar: 0, nA: 1, nB: 1 });
  const p = w.events.find((e) => e.fx);
  const st = w.orb.replays.get(p.battleId);
  const wr = [...p.fx.attackerIds, ...p.fx.defenderIds].filter((id) => w.core.vesselManager.getVessel(id)?.isWreck);
  const shotsSeen = st ? st.rep.roundList.reduce((a, r) => a + r.events.length, 0) : 0;
  const shown = runReplay(w);
  assert(p.fx.endReason === 'no_damage_possible' && p.result.endReason === undefined && wr.length === 0 && shotsSeen > 0 && shown.length === 0,
    `R7b: pat z bronią (${p.fx.endReason}; rekord: ${p.result.endReason}) — ${shotsSeen} strzałów bez skutku, zero zniszczeń, zero wraków`);
});

console.log('R8 — narzędzie obrony konsoli');
guard('R8', () => {
  F.cvOrbital = true;
  const w = battle({ flag: true, tower: 2, grid: 1 });
  assert(w.core.warSystem._cvStagerDefence == null, 'R8a: `_cvStagerDefence` zdjęte po bitwie tego ciała');
  const unit0 = w.core.warSystem._buildPlayerBattleUnit(w.sys, w.home.id);
  w.core.warSystem._cvStagerDefence = { planetId: w.home.id, tower: 2, grid: 1 };
  const unit1 = w.core.warSystem._buildPlayerBattleUnit(w.sys, w.home.id);
  w.core.warSystem._cvStagerDefence = null;
  assert((unit1.hp - unit0.hp) === 180 && (unit1.armor - unit0.armor) === 4, `R8b: narzędzie dokłada dokładnie formułę budynków (+180 HP, +4 pancerza; ${unit0.hp} → ${unit1.hp})`);
  const lv = w.core.warSystem._defenceLevels([{ planetId: w.home.id, buildingSystem: { _active: new Map([['a', { building: { id: 'defense_tower' }, level: 3 }], ['b', { building: { id: 'defense_grid' }, level: 2 }]]) } }]);
  assert(lv.tower === 3 && lv.grid === 2, 'R8c: poziomy z budynków kolonii (bez narzędzia) — sumy wieży i siatki');
});

console.log('R9 — piny źródłowe');
guard('R9', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const gs = strip(readFileSync(new URL('../../scenes/GameScene.js', import.meta.url), 'utf-8').replace(/\r\n/g, '\n'));
  const tr = strip(readFileSync(new URL('../../renderer/ThreeRenderer.js', import.meta.url), 'utf-8').replace(/\r\n/g, '\n'));
  assert(/fx\?\.kind === 'orbital' && GAME_CONFIG\.FEATURES\?\.cvOrbital\)\s*\{\s*battleData\.source = 'orbital'/.test(gs), 'R9a: GameScene — źródło orbital (Finding 632)');
  assert(/combatfx:orbitalReplayEnd/.test(gs) && /_orbitalBannerHold/.test(gs), 'R9b: GameScene — baner czeka na koniec powtórki (D-CV-27 (a))');
  // ARC CV-8b — PRZECELOWANE ŚWIADOMIE: R9f — linia trzymana razem z wpisami skutków EAH (#713, `{ line, extras }`); R9c — kino i modal
  // wycofane, baner dla KAŻDEGO źródła (`_tryShowNextBattle` bez gałęzi źródła — pin nieobecności `cv_retire_cinema_smoke` N3c);
  // R9d — burst usunięty, słuchacz renderera tylko przekazuje bitwę do powtórki (`cv_retire_cinema_smoke` N2).
  assert(/\(this\._orbitalLogHold \?\?= new Map\(\)\)\.set\(battleId, \{ line: this\._battleLogEntry\(\{ warId, result \}\)/.test(gs) && /_orbitalLogHold\.delete\(battleId\)/.test(gs), 'R9f: GameScene — linia bitwy w Dzienniku też czeka na koniec powtórki (§3.1-6: Dziennik zachowuje log.battleLine; CV-8b — razem z wpisami skutków EAH)');
  assert(/await showBattleOutcome\(battleData\)/.test(gs) && !/showBattleIntro\(|new BattleView3D|from '\.\/BattleView3D\.js'/.test(gs), 'R9c: baner (bez modalu kina) — CV-8b: dla każdego źródła, kino i modal wycofane');
  assert(/EventBus\.on\('battle:resolved', safe\(\(p\) => this\._cvOrb\?\.handle\?\.\(p\)\)\);/.test(tr) && !/_spawnBattleBurst/.test(tr), 'R9d: renderer — burst nie istnieje (CV-8b), słuchacz tylko przekazuje bitwę do powtórki (Finding 628)');
  assert(/this\._cvOrb\?\.deferWreck\?\.\(vesselId, vessel\)\) return;/.test(tr), 'R9e: renderer — wrak wstrzymany do zniszczenia w powtórce');
});

F.cvOrbital = FLAG0;
console.log(`\ncv_orbital_results_smoke: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
