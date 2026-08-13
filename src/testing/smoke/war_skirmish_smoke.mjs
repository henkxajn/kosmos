// W1 — keeper księgowania wojny i potyczki (commit W1-4, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: P3 mówi „WarSystem jest JEDYNYM księgowym", a audyt (K-3) pokazał, że nie był:
// `EnemyAttackHandler` emitował `battle:resolved` z PRAWDZIWYM `warId` i mimo to omijał
// `recordBattle` — pisał `gameState.battles` wprost. Skutek: atak orbitalny w trakcie
// zadeklarowanej wojny naliczał ZERO exhaustion i nie pojawiał się w `war.battles[]`.
// Ten keeper pilnuje, żeby ta luka nie wróciła i żeby widelec został WYCZERPUJĄCY.
//
//   T1  POTYCZKA (bitwa BEZ warId): napięcie ROŚNIE, pamięć dostaje wpis typu `skirmish`,
//       a exhaustion zostaje BAJT W BAJT bez zmian
//   T2  ⚠ FAIL-FIRST (podpisany pin P3): bitwa EAH z `warId` MUSI dotrzeć do `recordBattle`
//   T3  widelec WYCZERPUJĄCY — żadna ścieżka nie jest „ani zaksięgowana, ani potyczką"
//   T4  potyczka NIE jest zaspokajalna przez sąsiada (`border_pressure` z Directora)
//   T5  rejestr kanałów: `skirmish` zadeklarowany i NIE dubluje kanałów
//   T6  ⚠ W1-4b: wyczerpanie ASYMETRYCZNE po WYNIKU bitwy (nigdy po lossesA/B)
//
// ⚠ Harness NIE montuje `stationSystem`, więc wrogie kadłuby stawiamy RĘCZNIE (war_seams).

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { createVessel } from '../../entities/Vessel.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { INCIDENT_CHANNELS } from '../../data/AcceptanceWeightData.js';
import * as CB from '../../data/CasusBelliData.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const WARSHIP = ['engine_ion', 'armor_standard', 'weapon_kinetic'];

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  return core;
}

/** Wrogi kadłub orbitujący planetę gracza — stan, który zbiera EAH. */
function spawnEnemyOrbiter(core, empireId, name = 'Najeźdźca') {
  const home = window.KOSMOS.homePlanet;
  const v = createVessel('hull_frigate', home.id, {
    name, modules: [...WARSHIP], x: home.x ?? 0, y: home.y ?? 0, systemId: 'sys_home',
  });
  v.ownerEmpireId = empireId; v.owner = empireId; v.isEnemy = true;
  v.position.state = 'orbiting'; v.position.dockedAt = home.id; v.systemId = 'sys_home';
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

/** Odpala EAH pomijając WYŁĄCZNIE 500 ms timer batchowania. Reszta ścieżki jest prawdziwa. */
function fireEah(core, vesselId) {
  const home = window.KOSMOS.homePlanet;
  const eah = new EnemyAttackHandler();
  eah._pendingBattles.set(home.id, {
    arrivedVesselIds: new Set([vesselId]),
    firstVesselYear: window.KOSMOS.timeSystem?.gameTime ?? 0,
    timerId: null,
  });
  eah._resolveBatchedBattle(home.id);
  return eah;
}

const memOf = (core, empireId) => core.diplomacySystem.relations.getMemory('player', empireId, 100) ?? [];

// ── T1 — POTYCZKA: napięcie + pamięć, ZERO exhaustion ───────────────────────
console.log('T1 — potyczka (bitwa BEZ warId): napięcie + pamięć, exhaustion NIETKNIĘTE');
{
  const core = boot();
  const empireId = core.empireRegistry.listAll()[0]?.id;
  const dipl = core.diplomacySystem;

  const tBefore = dipl.getTension(empireId);
  const memBefore = memOf(core, empireId).length;
  const warsBefore = JSON.stringify(gameState.get('wars') ?? {});

  const skirmishes = [];
  const onSkirmish = (p) => skirmishes.push(p);
  EventBus.on('war:skirmish', onSkirmish);

  EventBus.emit('battle:resolved', {
    warId: null, battleId: 'b_skirmish_1',
    result: {
      winner: 'B', location: { systemId: 'sys_home', planetId: null, point: null },
      participantA: { type: 'vessel_group', empireId, vesselIds: ['v_x'], count: 1 },
      participantB: { type: 'player', systemId: 'sys_home' },
    },
  });
  EventBus.off('war:skirmish', onSkirmish);

  const tAfter = dipl.getTension(empireId);
  const mem = memOf(core, empireId);

  assert(tAfter > tBefore, `T1: napięcie WZROSŁO (${tBefore} → ${tAfter})`);
  assert(skirmishes.length === 1, `T1: wyemitowano `.trim() + '`war:skirmish` dokładnie raz');
  // ⚠ Asercja na KONKRETNYM typie — inaczej dowolny inny wpis pamięci by ją zaspokoił.
  assert(mem.some(m => m.type === 'skirmish'),
    `T1: pamięć dostała wpis typu DOKŁADNIE `.trim() + '`skirmish` ' +
    `(typy: ${[...new Set(mem.map(m => m.type))].join(', ') || '—'})`);
  assert(mem.length > memBefore, 'T1: liczba wpisów pamięci wzrosła');
  assert(JSON.stringify(gameState.get('wars') ?? {}) === warsBefore,
    'T1: rejestr wojen BAJT W BAJT bez zmian — potyczka NIE tworzy wojny ani exhaustion');
}

// ── T2 — FAIL-FIRST: bitwa EAH z warId MUSI przejść przez recordBattle ──────
console.log('T2 — PODPISANY PIN P3: bitwa EAH z warId dociera do recordBattle');
{
  const core = boot();
  const empireId = core.empireRegistry.listAll()[0]?.id;
  const warSys = core.warSystem;

  core.diplomacySystem.declareWar(empireId, 'keeper_setup');
  const war = warSys.getWarWith(empireId);
  assert(!!war?.active, `T2: wojna istnieje PRZED bitwą (${war?.id})`);

  const battlesBefore = war.battles.length;
  const exhaustBefore = JSON.stringify(war.exhaustion);

  let recordCalls = 0;
  const orig = warSys.recordBattle.bind(warSys);
  warSys.recordBattle = (...a) => { recordCalls++; return orig(...a); };

  const v = spawnEnemyOrbiter(core, empireId);
  fireEah(core, v.id);
  warSys.recordBattle = orig;

  const after = warSys.getWarWith(empireId);
  assert(recordCalls === 1,
    `T2: EAH wywołał recordBattle DOKŁADNIE raz (${recordCalls}) — to jest pin, który przed W1-4 był ZERO`);
  assert(after.battles.length === battlesBefore + 1,
    `T2: bitwa DOPISANA do war.battles[] (${battlesBefore} → ${after.battles.length}) — widoczna w WarOverlay`);
  assert(JSON.stringify(after.exhaustion) !== exhaustBefore,
    `T2: exhaustion WZROSŁO ${exhaustBefore} → ${JSON.stringify(after.exhaustion)} ` +
    '— ZAMIERZONA zmiana zachowania: wojny wyczerpują się od ataków orbitalnych');
  // Obie strony, bo `recordBattle` nalicza symetrycznie (skalowane exhaustionRate z casus belli).
  assert(Object.values(after.exhaustion).every(v2 => v2 > 0),
    `T2: obie strony mają niezerowe exhaustion ${JSON.stringify(after.exhaustion)}`);

  // Dominacja orbitalna nadal ustawiana — przeniesiona do `_updateOrbitalDominance`,
  // nie zgubiona przy przepięciu na recordBattle.
  const dom = gameState.get('orbitalDominance.sys_home');
  assert(!!dom?.controllerId,
    `T2: dominacja orbitalna USTAWIONA przez recordBattle (${JSON.stringify(dom)}) — nie zgubiona przy przepięciu`);
}

// ── T3 — widelec WYCZERPUJĄCY ───────────────────────────────────────────────
console.log('T3 — widelec: każda bitwa jest ALBO zaksięgowana, ALBO potyczką');
{
  const core = boot();
  const empireId = core.empireRegistry.listAll()[0]?.id;

  const seen = [];
  const onResolved = (p) => seen.push(p);
  const onSkirmish = (p) => seen.push({ ...p, _skirmish: true });
  EventBus.on('battle:resolved', onResolved);
  EventBus.on('war:skirmish', onSkirmish);

  // (a) bitwa BEZ warId — kształt, który emituje DSCS (audyt R6: `warId: null`).
  //     ⚠ NIE da się jej wyprodukować przez EAH: on sam deklaruje wojnę, zanim zacznie
  //     strzelać, więc każde starcie EAH jest z definicji zaksięgowane. Pierwsza wersja
  //     tego testu próbowała właśnie tak i mierzyła 0 potyczek na 2 bitwy.
  EventBus.emit('battle:resolved', {
    warId: null, battleId: 'b_deep_space_1',
    result: {
      winner: 'A', location: { systemId: 'sys_home', planetId: null, point: { x: 1, y: 1 } },
      participantA: { type: 'vessel_group', empireId, vesselIds: ['v_a'], count: 1 },
      participantB: { type: 'player', systemId: 'sys_home' },
    },
  });
  // (b) bitwa EAH → wojna deklarowana po drodze, więc ZAKSIĘGOWANA
  const v2 = spawnEnemyOrbiter(core, empireId, 'W wojnie');
  fireEah(core, v2.id);

  EventBus.off('battle:resolved', onResolved);
  EventBus.off('war:skirmish', onSkirmish);

  const battles = seen.filter(s => !s._skirmish);
  const skirms  = seen.filter(s => s._skirmish);
  const accounted = battles.filter(b => b.warId);

  assert(battles.length > 0, `T3: zaszły bitwy (${battles.length})`);
  // Każda bitwa MUSI wpaść do dokładnie jednego kubełka: warId albo potyczka.
  const unclassified = battles.filter(b => !b.warId).length - skirms.length;
  assert(unclassified === 0,
    `T3: ZERO bitew „ani zaksięgowanych, ani potyczek" (bez warId: ` +
    `${battles.filter(b => !b.warId).length}, potyczek: ${skirms.length})`);
  assert(accounted.length > 0,
    `T3: co najmniej jedna bitwa ZAKSIĘGOWANA na wojnę (${accounted.length}) — EAH sam deklaruje wojnę`);
  assert(skirms.length > 0,
    `T3: …i co najmniej jedna sklasyfikowana jako POTYCZKA (${skirms.length}) — OBA ramiona widelca ` +
    'faktycznie ćwiczone, nie tylko jedno');
}

// ── T4 — NIE zaspokajalne przez sąsiada ─────────────────────────────────────
console.log('T4 — potyczki NIE zaspokaja `border_pressure` z Directora');
{
  const core = boot();
  const empireId = core.empireRegistry.listAll()[0]?.id;
  const dipl = core.diplomacySystem;

  // Sąsiad: Director S6 pisze modyfikator OPINII + wpis pamięci `border_pressure`.
  // Gdyby pin T1 sprawdzał tylko „jakiś wpis pamięci", TO by go zaspokoiło.
  dipl.addOpinionModifier('player', empireId, 'border_pressure', {});
  dipl.addMemory(empireId, 'border_pressure', {});
  const mem = memOf(core, empireId);

  assert(mem.some(m => m.type === 'border_pressure'),
    'T4: sąsiad faktycznie zapisał swój wpis (inaczej test nic nie dowodzi)');
  assert(!mem.some(m => m.type === 'skirmish'),
    'T4: …a wpisu `skirmish` NADAL NIE MA — pin T1 mierzy WŁASNY mechanizm, nie sąsiada');

  // I kanały są rozłączne: `border_pressure` idzie opinią, `skirmish` napięciem.
  assert(INCIDENT_CHANNELS.border_pressure === 'opinion' && INCIDENT_CHANNELS.skirmish === 'tension',
    'T4: kanały ROZŁĄCZNE — border_pressure=opinion, skirmish=tension (zero podwójnego liczenia)');
}

// ── T5 — rejestr kanałów ────────────────────────────────────────────────────
console.log('T5 — `skirmish` w rejestrze kanałów (anty-double-count)');
{
  assert(INCIDENT_CHANNELS.skirmish === 'tension',
    'T5: `skirmish` zadeklarowany na kanale `tension` (P3: napięcie i pamięć, NIGDY exhaustion)');
  // Kanał `opinion` wymaga wpisu w katalogu modyfikatorów; `tension` — nie. Pilnuje tego
  // asercja w acceptance_engine_smoke; tu tylko utrwalamy, dlaczego go NIE dodaliśmy.
  assert(INCIDENT_CHANNELS.skirmish !== 'opinion',
    'T5: …a NIE na `opinion` — dlatego świadomie bez wpisu w OPINION_MODIFIERS');
}

// ── T6 — ASYMETRIA WYCZERPANIA po WYNIKU bitwy (W1-4b) ──────────────────────
console.log('T6 — wyczerpanie asymetryczne: przegrany starcia płaci WIĘCEJ');
{
  const core = boot();
  const empireId = core.empireRegistry.listAll()[0]?.id;
  const warSys = core.warSystem;
  core.diplomacySystem.declareWar(empireId, 'keeper_asym');
  const war = warSys.getWarWith(empireId);
  const rate = 1.0;   // border_incident — CB wnioskowane dla tej deklaracji

  const exh = () => ({ ...warSys.getWarWith(empireId).exhaustion });
  const mkRec = (winner) => ({
    winner, location: { systemId: 'sys_home', planetId: null, point: null },
    participantA: { type: 'vessel_group', empireId, vesselIds: ['v_a'], count: 1 },
    participantB: { type: 'player', systemId: 'sys_home' },
    // ⚠ CELOWO NIEZGODNE Z WYNIKIEM: gdyby księgowanie czytało `lossesA/B` zamiast `winner`,
    //   te liczby wskazałyby DRUGĄ stronę. Pin łapie taką pomyłkę (twardy warunek orzeczenia).
    lossesA: 1, lossesB: 999,
  });

  // (a) wygrywa IMPERIUM (A) ⇒ przegranym jest GRACZ
  const before1 = exh();
  warSys.recordBattle(war.id, mkRec('A'));
  const after1 = exh();
  const dEmp1 = after1[empireId] - before1[empireId];
  const dPly1 = after1.player   - before1.player;
  assert(dEmp1 === 2 * rate, `T6: ZWYCIĘZCA (imperium) płaci samą bazę +${2 * rate} (zmierzone ${dEmp1})`);
  assert(dPly1 === 9 * rate, `T6: PRZEGRANY (gracz) płaci bazę + udział = +${9 * rate} (zmierzone ${dPly1})`);
  assert(dPly1 > dEmp1, 'T6: przegrany męczy się BARDZIEJ niż zwycięzca — sedno orzeczenia W1-4b');

  // (b) wygrywa GRACZ (B) ⇒ asymetria odwraca się
  const before2 = exh();
  warSys.recordBattle(war.id, mkRec('B'));
  const after2 = exh();
  const dEmp2 = after2[empireId] - before2[empireId];
  const dPly2 = after2.player   - before2.player;
  assert(dPly2 === 2 * rate && dEmp2 === 9 * rate,
    `T6: przy zwycięstwie GRACZA proporcje się odwracają (gracz +${dPly2}, imperium +${dEmp2})`);

  // ⚠ TWARDY WARUNEK ORZECZENIA: klasyfikacja po `winner`, NIE po `lossesA/B`.
  //   W obu bitwach `lossesA/B` były IDENTYCZNE (1 / 999), a wynik asymetrii się ODWRÓCIŁ —
  //   czyli decyzja NIE MOGŁA pochodzić z tych pól (kolizja jednostek, §Findings filed 3).
  assert(dPly1 !== dPly2 && dEmp1 !== dEmp2,
    'T6: te same lossesA/B, PRZECIWNE wyniki ⇒ księgowanie czyta `winner`, nie `lossesA/B` ' +
    '(pola z kolizją jednostek HP-delta vs liczba statków)');

  // (c) REMIS ⇒ sama baza dla obu, bez udziału przegranego
  const before3 = exh();
  warSys.recordBattle(war.id, mkRec('draw'));
  const after3 = exh();
  assert(after3[empireId] - before3[empireId] === 2 * rate && after3.player - before3.player === 2 * rate,
    'T6: REMIS ⇒ obie strony płacą SAMĄ bazę (nikt nie przegrał, nie ma komu doliczyć udziału)');

  // (d) kurs casus belli nadal skaluje CAŁOŚĆ — extermination 0.4 („walczą aż do końca")
  const { CASUS_BELLI } = CB;
  assert(CASUS_BELLI.extermination.exhaustionRate === 0.4 && CASUS_BELLI.extermination.peaceCost === 100,
    'T6: extermination zachowuje rate 0.4 i peaceCost 100 — W1-4b NIE tknął tabeli CB');
  assert(CASUS_BELLI.border_incident.exhaustionRate === 1.0,
    'T6: border_incident nadal rate 1.0 (odniesienie dla liczb wyżej)');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
