// W3-2 — keeper: KAŻDA bitwa jest zaksięgowana albo jest potyczką (WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: `w3_seams_smoke` T2 zmierzył trzecią, cichą ścieżkę księgowania. `DeepSpaceCombatSystem`
// wpisuje `warId: null` NA SZTYWNO (`:1006-1007`), a `WarSystem._classifyBattle` odsyłał takie
// starcie z niczym, gdy strony BYŁY w stanie wojny — więc wojna toczona w przestrzeni głębokiej
// nie naliczała ani exhaustion, ani wpisu w `war.battles[]`, ani dominacji orbitalnej.
// Ponieważ `war_status` to 55-punktowy człon akceptacji pokoju, wojny toczonej TAM, GDZIE GRACZ
// NAPRAWDĘ WALCZY, nie dało się zakończyć wyczerpaniem. W1-4 domknął ten fork tylko dla EAH.
//
//   T1  bitwa DSCS w ZADEKLAROWANEJ wojnie: exhaustion rośnie, `war.battles[]` rośnie,
//       dominacja orbitalna ustawiona (INWERSJA w3_seams T2)
//   T2  ASYMETRIA PO WYNIKU (W1-4b niesie się do nowego wywołującego): przegrany 9, wygrany 2
//       — i to samo starcie z odwróconym `winner` odwraca ciężar. NIGDY po `lossesA/B`.
//   T3  ⚠ WIDELEC WYCZERPUJĄCY: bitwa BEZ wojny nadal idzie w POTYCZKĘ (napięcie, zero
//       exhaustion) — nie otworzyliśmy drugiej polityki, tylko domknęliśmy trzecią ścieżkę
//   T4  brak re-entrancji: `recordBattle` re-emituje z `warId`, więc drugi przebieg wychodzi
//       natychmiast — DOKŁADNIE jedno zaksięgowanie na jedno starcie
//   T5  starcie BEZ udziału gracza NIE jest doksięgowywane do wojny gracza (bramka pod D5)
//   T6  ⚠ KOLIZJA JEDNOSTEK: `lossesA/B` nie wpływa na NIC w księgowaniu (W1 §Findings 3)
//
// ⚠ Harness nie montuje DSCS — starcie odtwarzamy PRAWDZIWYM `_finalizeBattle` (jak w3_seams T2),
//    bo tam mieszka emit z `warId: null`, czyli szew pod testem.

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { GameCore } from '../headless/GameCore.js';
import { createVessel } from '../../entities/Vessel.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const WARSHIP = ['engine_ion', 'armor_standard', 'weapon_kinetic'];

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  return core;
}
const empireOf = (core) => core.empireRegistry.listAll()[0]?.id;

function spawnHull(core, { owner = null, name = 'Kadłub', x = 0, y = 0 } = {}) {
  const home = window.KOSMOS.homePlanet;
  const v = createVessel('hull_frigate', home.id, {
    name, modules: [...WARSHIP], x, y, systemId: 'sys_home',
  });
  if (owner) { v.ownerEmpireId = owner; v.owner = owner; v.isEnemy = true; }
  v.position.state = 'orbiting';
  v.position.dockedAt = null;
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

/** Prawdziwe starcie DSCS zakończone `_finalizeBattle` — szew, w którym siedzi `warId: null`. */
function deepSpaceBattle(core, empireId, winner = 'A') {
  const mine  = spawnHull(core, { name: 'Mój okręt',  x: 0, y: 0 });
  const their = spawnHull(core, { owner: empireId, name: 'Ich okręt', x: 1, y: 1 });
  const dscs = new DeepSpaceCombatSystem(core.vesselManager);
  const enc = dscs.startEngagement(mine.id, their.id);
  if (enc) dscs._finalizeBattle(enc, winner, null);
  return { enc, mine, their };
}

const exhaustionOf = (core, empireId) => {
  const w = core.warSystem.getWarWith?.(empireId);
  return w ? { ...w.exhaustion } : null;
};

// ── T1 — bitwa w wojnie JEST księgowana ─────────────────────────────────────
console.log('T1 — bitwa DSCS w zadeklarowanej wojnie JEST księgowana (INWERSJA w3_seams T2)');
{
  const core = boot();
  const empireId = empireOf(core);
  core.diplomacySystem.declareWar(empireId, 'keeper');

  const before = core.warSystem.getWarWith(empireId);
  const exBefore = JSON.stringify(before.exhaustion);
  const battlesBefore = before.battles.length;

  let recordCalls = 0;
  const orig = core.warSystem.recordBattle.bind(core.warSystem);
  core.warSystem.recordBattle = (...a) => { recordCalls++; return orig(...a); };

  const { enc } = deepSpaceBattle(core, empireId, 'A');
  assert(!!enc, 'T1: DSCS otworzył i domknął starcie');

  core.warSystem.recordBattle = orig;
  const after = core.warSystem.getWarWith(empireId);

  assert(recordCalls === 1,
    `T1: `.trim() + `\`recordBattle\` wywołany DOKŁADNIE raz (${recordCalls}) — przed W3-2 było ZERO`);
  assert(JSON.stringify(after.exhaustion) !== exBefore,
    `T1: exhaustion RUSZYŁO ${exBefore} → ${JSON.stringify(after.exhaustion)} — wojnę w przestrzeni ` +
    'głębokiej da się wreszcie zakończyć wyczerpaniem');
  assert(after.battles.length === battlesBefore + 1,
    `T1: bitwa DOPISANA do war.battles[] (${battlesBefore} → ${after.battles.length}) — WarOverlay ją widzi`);
  assert(!!gameState.get('orbitalDominance.sys_home'),
    'T1: dominacja orbitalna USTAWIONA — bramka desantu dostaje wynik bitwy, której wcześniej nie było');
}

// ── T2 — asymetria po WYNIKU, nie po stratach ───────────────────────────────
console.log('T2 — asymetria wyczerpania idzie za `winner` (W1-4b), a nie za `lossesA/B`');
{
  // Gracz wygrywa (winner 'A' = strona gracza w tym starciu)
  const coreA = boot();
  const empA = empireOf(coreA);
  coreA.diplomacySystem.declareWar(empA, 'keeper');
  deepSpaceBattle(coreA, empA, 'A');
  const exA = exhaustionOf(coreA, empA);

  // Imperium wygrywa
  const coreB = boot();
  const empB = empireOf(coreB);
  coreB.diplomacySystem.declareWar(empB, 'keeper');
  deepSpaceBattle(coreB, empB, 'B');
  const exB = exhaustionOf(coreB, empB);

  assert(!!exA && !!exB, 'T2: obie wojny mają liczniki wyczerpania');
  assert(exA.player < exA[empA],
    `T2: gdy WYGRYWA gracz — imperium męczy się bardziej (gracz ${exA.player} < imperium ${exA[empA]})`);
  assert(exB[empB] < exB.player,
    `T2: gdy WYGRYWA imperium — ciężar się ODWRACA (imperium ${exB[empB]} < gracz ${exB.player})`);
  assert(exA.player === exB[empB] && exA[empA] === exB.player,
    `T2: te same dwie liczby, zamienione stronami (${exA.player}/${exA[empA]} vs ` +
    `${exB[empB]}/${exB.player}) — baza dla obu + udział PRZEGRANEGO, dokładnie jak w W1-4b`);
}

// ── T3 — widelec pozostaje WYCZERPUJĄCY ─────────────────────────────────────
console.log('T3 — bitwa BEZ wojny nadal jest POTYCZKĄ (nie otworzyliśmy drugiej polityki)');
{
  const core = boot();
  const empireId = empireOf(core);
  // ŻADNEJ wojny nie deklarujemy.

  const skirmishes = [];
  const onSkirmish = (p) => skirmishes.push(p);
  EventBus.on('war:skirmish', onSkirmish);

  let recordCalls = 0;
  const orig = core.warSystem.recordBattle.bind(core.warSystem);
  core.warSystem.recordBattle = (...a) => { recordCalls++; return orig(...a); };

  deepSpaceBattle(core, empireId, 'A');

  EventBus.off('war:skirmish', onSkirmish);
  core.warSystem.recordBattle = orig;

  assert(skirmishes.length === 1,
    `T3: starcie bez wojny wyemitowało `.trim() + `\`war:skirmish\` (${skirmishes.length})`);
  assert(recordCalls === 0,
    `T3: …i NIE przeszło przez recordBattle (${recordCalls}) — exhaustion to waluta wojny, a wojny nie ma`);
  assert(!core.warSystem.getWarWith(empireId),
    'T3: potyczka NIE tworzy wojny — to napięcie i pamięć, nie księgowanie');
}

// ── T4 — brak re-entrancji ──────────────────────────────────────────────────
console.log('T4 — `recordBattle` re-emituje z `warId`, więc nie ma pętli ani podwójnego wpisu');
{
  const core = boot();
  const empireId = empireOf(core);
  core.diplomacySystem.declareWar(empireId, 'keeper');
  const battlesBefore = core.warSystem.getWarWith(empireId).battles.length;

  const emitted = [];
  const onResolved = (p) => emitted.push(p);
  EventBus.on('battle:resolved', onResolved);

  deepSpaceBattle(core, empireId, 'A');

  EventBus.off('battle:resolved', onResolved);
  const after = core.warSystem.getWarWith(empireId);

  const withWar = emitted.filter(p => p?.warId);
  const withoutWar = emitted.filter(p => !p?.warId);
  assert(withoutWar.length === 1, `T4: DSCS wyemitował dokładnie 1 zdarzenie bez warId (${withoutWar.length})`);
  assert(withWar.length === 1, `T4: …i powstało dokładnie 1 z warId (${withWar.length}) — re-emit księgowania`);
  assert(after.battles.length === battlesBefore + 1,
    `T4: w wojnie przybyła DOKŁADNIE jedna bitwa (${battlesBefore} → ${after.battles.length}) — ` +
    'gałąź (a) ucina drugi przebieg, więc nie ma pętli ani dubla');
}

// ── T5 — bramka „tylko starcia z udziałem gracza" (pod D5) ──────────────────
console.log('T5 — starcie BEZ gracza nie jest doksięgowywane do wojny gracza');
{
  const core = boot();
  const empireId = empireOf(core);
  core.diplomacySystem.declareWar(empireId, 'keeper');
  const before = core.warSystem.getWarWith(empireId);
  const exBefore = JSON.stringify(before.exhaustion);
  const battlesBefore = before.battles.length;

  const other = core.empireRegistry.listAll().find(e => e.id !== empireId)?.id ?? 'emp_999';

  // Starcie dwóch IMPERIÓW — gracza w nim nie ma.
  EventBus.emit('battle:resolved', {
    warId: null, battleId: 'b_ai_ai',
    result: {
      winner: 'A',
      participantA: { type: 'vessel_group', empireId, vesselIds: [] },
      participantB: { type: 'vessel_group', empireId: other, vesselIds: [] },
      location: { systemId: 'sys_home', planetId: null, point: { x: 0, y: 0 } },
    },
  });

  const after = core.warSystem.getWarWith(empireId);
  assert(JSON.stringify(after.exhaustion) === exBefore,
    `T5: wyczerpanie wojny GRACZA nietknięte (${exBefore}) — cudza potyczka nie obciąża jego wojny`);
  assert(after.battles.length === battlesBefore,
    'T5: …i nic nie dopisano do jej `battles[]` (bramka `_hasPlayerSide`, postawiona pod D5)');
}

// ── T6 — `lossesA/B` nie niesie żadnej decyzji ──────────────────────────────
console.log('T6 — kolizja jednostek `lossesA/B` nie wpływa na księgowanie (W1 §Findings 3)');
{
  const mk = (winner, lossesA, lossesB) => {
    const core = boot();
    const empireId = empireOf(core);
    core.diplomacySystem.declareWar(empireId, 'keeper');
    EventBus.emit('battle:resolved', {
      warId: null, battleId: `b_${lossesA}_${lossesB}`,
      result: {
        winner,
        lossesA, lossesB,
        participantA: { type: 'vessel_group', empireId: 'player', vesselIds: [] },
        participantB: { type: 'vessel_group', empireId, vesselIds: [] },
        location: { systemId: 'sys_home', planetId: null, point: { x: 0, y: 0 } },
      },
    });
    return exhaustionOf(core, empireId);
  };

  // Ten sam `winner`, skrajnie różne `losses` — wynik księgowania MUSI być identyczny.
  const lo = mk('A', 0, 0);
  const hi = mk('A', 9999, 1);
  assert(!!lo && !!hi, 'T6: obie wojny zaksięgowały starcie');
  assert(lo.player === hi.player && Object.values(lo).join() === Object.values(hi).join(),
    `T6: `.trim() + `\`lossesA/B\` 0/0 i 9999/1 dają IDENTYCZNE wyczerpanie ` +
    `(${JSON.stringify(lo)} vs ${JSON.stringify(hi)}) — pola z kolizją jednostek (delta HP w ` +
    'BattleSystem vs liczba statków w DSCS) nie niosą żadnej decyzji księgowej');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
