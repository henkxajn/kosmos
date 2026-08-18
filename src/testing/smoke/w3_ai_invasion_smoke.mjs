// W3 — keeper desantu AI z bitew prawdziwych kadłubów (commit W3-6, workstream B).
//
// PO CO: audyt (C-1) zmierzył, że kierunek AI→gracz był MARTWY NA OBU KOŃCACH.
// `InvasionSystem._onBattleResolved` wychodził, dopóki `participantA.type !== 'empire'` — a ten
// kształt emitują WYŁĄCZNIE floty abstrakcyjne, których w normalnej grze nie ma (zero
// producentów). Każda realna bitwa emituje `'vessel_group'`. Cała maszyneria lądowania,
// walki naziemnej i przejęcia DZIAŁA (używa jej gracz) — brakowało wejścia.
//
//   T1  ⚠ FAIL-FIRST: wygrana `vessel_group` nad bronioną kolonią GRACZA ląduje wojsko.
//       KONTROLA PINU: ta sama bitwa PRZEGRANA przez AI nie ląduje niczego.
//   T2  ⚠ DOMINACJA ORBITALNA jest warunkiem (parity z bramką gracza): bez niej `invasion:blocked`
//       z powodem `no_orbital_dominance`, mimo wygranej bitwy.
//   T3  ⚠ PRÓG WYPROWADZONY Z KADŁUBÓW, nie z abstrakcyjnej siły: bez kadłuba z `drop_pods`
//       i ładownią — `no_drop_capable_hull`. KONTROLA PINU: `pA.strength` NIE ma tu wpływu
//       (to jednostka floty abstrakcyjnej; `lossesA` w DSCS liczy STATKI, nie HP).
//   T4  wielkość desantu z SUMY ładowni ocalałych zrzutowców, z górną klamrą; kadłub, który
//       zginął w tej właśnie bitwie, NIE liczy się do fali.
//   T5  cel wybierany po STEMPLU WŁASNOŚCI (§Findings 20) — kolonia AI w tym samym układzie
//       NIE jest celem desantu AI.
//   T6  frakcja naziemna obcego imperium: DETERMINISTYCZNA i NIE-ludzka (przedtem każdy
//       najeźdźca lądował jako `humanity` + ostrzeżenie na każdą jednostkę).

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import EntityManager from '../../core/EntityManager.js';
import { createVessel } from '../../entities/Vessel.js';
import { InvasionSystem } from '../../systems/InvasionSystem.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { GroundUnitFactory } from '../../systems/GroundUnitFactory.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const DROPPER = ['engine_ion', 'armor_standard', 'weapon_kinetic', 'troop_bay_s', 'drop_pods'];
const WARSHIP = ['engine_ion', 'armor_standard', 'weapon_kinetic'];

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  const inv = new InvasionSystem();
  window.KOSMOS.invasionSystem = inv;
  const empireId = core.empireRegistry.listAll()[0]?.id;
  return { core, inv, empireId };
}

function spawnHull(core, empireId, modules, name) {
  const home = window.KOSMOS.homePlanet;
  const v = createVessel('hull_medium', home.id, {
    name, modules: [...modules], x: home.x ?? 0, y: home.y ?? 0, systemId: 'sys_home',
  });
  v.ownerEmpireId = empireId; v.owner = empireId; v.isEnemy = true;
  v.position.state = 'orbiting'; v.position.dockedAt = home.id;
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

/** Zdarzenie bitwy w kształcie, który emitują DSCS i EnemyAttackHandler. */
function battleEvent(empireId, vesselIds, { winner = 'A', strength = 0 } = {}) {
  return {
    warId: 'war_probe', battleId: 'b_probe',
    result: {
      winner,
      participantA: { type: 'vessel_group', empireId, vesselIds, count: vesselIds.length, strength },
      participantB: { type: 'player', systemId: 'sys_home' },
      location: { systemId: 'sys_home', planetId: null, point: { x: 0, y: 0 } },
    },
  };
}

const setDominance = (controllerId) =>
  gameState.set('orbitalDominance.sys_home', { controllerId, year: 1 }, 'probe');

// ── T1 — desant dochodzi do skutku ──────────────────────────────────────────
console.log('T1 — ⚠ wygrana `vessel_group` LĄDUJE wojsko na kolonii gracza');
{
  const { core, inv, empireId } = boot();
  const home = window.KOSMOS.homePlanet;
  setDominance(empireId);

  const dropper = spawnHull(core, empireId, DROPPER, 'Transportowiec');
  assert(dropper.canDropTroops === true && dropper.troopCapacity > 0,
    `T1: kadłub NAPRAWDĘ ma zrzut i ładownię (drop=${dropper.canDropTroops}, ` +
    `pojemność=${dropper.troopCapacity}) — inaczej test mierzyłby atrapę`);

  const landed = [];
  EventBus.on('invasion:troopsLanded', (d) => landed.push(d));
  inv._onBattleResolved(battleEvent(empireId, [dropper.id]));

  assert(landed.length === 1 && landed[0].planetId === home.id,
    `T1 SEDNO: wojsko WYLĄDOWAŁO na ${landed[0]?.planetId ?? '—'}. Przed W3-6 ta gałąź wychodziła ` +
    'na pierwszym warunku, bo `participantA.type` realnej bitwy to `vessel_group`, a kod czekał ' +
    'na `empire` — kształt, którego w normalnej grze NIC nie emituje');
  assert((landed[0]?.unitIds?.length ?? 0) > 0,
    `T1: i są to KONKRETNE jednostki (${landed[0]?.unitIds?.length}), nie sam wpis w rejestrze`);

  const invs = Object.values(gameState.get('invasions') ?? {});
  assert(invs.some(i => i.planetId === home.id && i.aggressor === empireId && i.active),
    'T1: inwazja zarejestrowana w `gameState.invasions` — stan przeżyje zapis');
}

// ── T2 — dominacja orbitalna jest warunkiem ─────────────────────────────────
console.log('T2 — ⚠ bez DOMINACJI ORBITALNEJ nie ma desantu (parity z bramką gracza)');
{
  const { core, inv, empireId } = boot();
  setDominance('player');                                  // orbitę trzyma GRACZ
  const dropper = spawnHull(core, empireId, DROPPER, 'Transportowiec');

  const blocked = [];
  const landed = [];
  EventBus.on('invasion:blocked', (d) => blocked.push(d));
  EventBus.on('invasion:troopsLanded', (d) => landed.push(d));
  inv._onBattleResolved(battleEvent(empireId, [dropper.id]));

  assert(landed.length === 0, 'T2: NIC nie wylądowało…');
  assert(blocked.some(b => b.reason === 'no_orbital_dominance'),
    `T2 SEDNO: …i powód jest nazwany (\`${blocked.map(b => b.reason).join(',')}\`). Wygrana bitwa ` +
    'nie wystarczy — trzeba TRZYMAĆ orbitę, dokładnie jak gracz przed swoim desantem');
}

// ── T3 — próg z kadłubów, nie z abstrakcyjnej siły ──────────────────────────
console.log('T3 — ⚠ próg desantu wyprowadzony z KADŁUBÓW (`MIN_SURVIVING_STRENGTH` tu nie rządzi)');
{
  const { core, inv, empireId } = boot();
  setDominance(empireId);
  const plainWarship = spawnHull(core, empireId, WARSHIP, 'Fregata bez ładowni');
  assert(!plainWarship.canDropTroops && (plainWarship.troopCapacity ?? 0) === 0,
    'T3: okręt bojowy NIE ma czym zrzucać — to jest realna różnica, nie flaga testu');

  const blocked = [];
  EventBus.on('invasion:blocked', (d) => blocked.push(d));
  // ⚠ Podajemy OGROMNĄ `strength` — na starej ścieżce to ona decydowała.
  inv._onBattleResolved(battleEvent(empireId, [plainWarship.id], { strength: 9999 }));

  assert(blocked.some(b => b.reason === 'no_drop_capable_hull'),
    `T3 SEDNO: odmowa \`no_drop_capable_hull\` MIMO strength 9999 — próg pyta o zdolność ` +
    'FIZYCZNĄ (drop_pods + ładownia), a nie o liczbę, której na tej ścieżce nie da się ' +
    'porównać (w DSCS `lossesA` liczy STATKI, nie HP — kolizja jednostek z W1 §Findings 3)');

  // KONTROLA PINU: dołóż zrzutowca i ta sama bitwa PRZECHODZI.
  const dropper = spawnHull(core, empireId, DROPPER, 'Transportowiec');
  const landed = [];
  EventBus.on('invasion:troopsLanded', (d) => landed.push(d));
  inv._onBattleResolved(battleEvent(empireId, [plainWarship.id, dropper.id], { strength: 0 }));
  assert(landed.length === 1,
    'T3 KONTROLA PINU: z jednym zrzutowcem w składzie desant RUSZA przy strength 0 — czyli ' +
    'rządzi kadłub, nie liczba');
}

// ── T4 — wielkość fali i ocalali ────────────────────────────────────────────
console.log('T4 — fala z SUMY ładowni OCALAŁYCH (poległy w tej bitwie się nie liczy)');
{
  const { core, inv, empireId } = boot();
  setDominance(empireId);
  const alive = spawnHull(core, empireId, DROPPER, 'Ocalały');
  const dead  = spawnHull(core, empireId, DROPPER, 'Poległy');
  dead.isWreck = true;                                     // zginął w TEJ bitwie

  const landed = [];
  EventBus.on('invasion:troopsLanded', (d) => landed.push(d));
  inv._onBattleResolved(battleEvent(empireId, [alive.id, dead.id]));

  const n = landed[0]?.unitIds?.length ?? 0;
  assert(n > 0 && n <= 6,
    `T4: fala mieści się w klamrze (${n} ≤ 6) — jedna wygrana orbita to JEDNA fala, ` +
    'druga wymaga kolejnej wygranej');
  assert(n <= Math.floor(alive.troopCapacity),
    `T4 SEDNO: rozmiar liczony z ładowni OCALAŁEGO (${n} ≤ ${Math.floor(alive.troopCapacity)}) — ` +
    'wrak nie wnosi pojemności, choć jest na liście uczestników bitwy');
}

// ── T5 — cel po stemplu własności ───────────────────────────────────────────
console.log('T5 — cel po STEMPLU WŁASNOŚCI (kolonia AI w tym układzie NIE jest celem)');
{
  const { core, inv, empireId } = boot();
  setDominance(empireId);
  const dropper = spawnHull(core, empireId, DROPPER, 'Transportowiec');

  const playerIds = core.colonyManager.getPlayerColonies().map(c => c.planetId);
  const landed = [];
  EventBus.on('invasion:troopsLanded', (d) => landed.push(d));
  inv._onBattleResolved(battleEvent(empireId, [dropper.id]));

  assert(landed.length === 1 && playerIds.includes(landed[0].planetId),
    `T5: desant trafił w kolonię GRACZA (${landed[0]?.planetId}) — wybór idzie przez ` +
    '`getPlayerColonies`, a nie `getAllColonies`, które zwraca kolonie WSZYSTKICH właścicieli');
}

// ── T6 — frakcja naziemna najeźdźcy ─────────────────────────────────────────
console.log('T6 — obce imperium ląduje frakcją NIE-ludzką, deterministycznie');
{
  const f1 = GroundUnitFactory.factionIdFor('emp_001');
  const f2 = GroundUnitFactory.factionIdFor('emp_002');
  assert(f1 !== 'humanity' && f2 !== 'humanity',
    `T6 SEDNO: imperia dostają frakcje obce (${f1}, ${f2}). Przedtem KAŻDY najeźdźca lądował ` +
    'jako `humanity` — gracz nie odróżniał obcej piechoty od własnej, a konsola dostawała ' +
    'ostrzeżenie na każdą stworzoną jednostkę');
  assert(GroundUnitFactory.factionIdFor('emp_001') === f1,
    'T6: wybór DETERMINISTYCZNY — to samo imperium zawsze tą samą frakcją (także po wczytaniu)');
  assert(GroundUnitFactory.factionIdFor('humanity') === 'humanity'
      && GroundUnitFactory.factionIdFor('UNE') === 'UNE',
    'T6 KONTROLA PINU: prawdziwe nazwy frakcji przechodzą bez zmian — mapujemy tylko imperia');
  assert(GroundUnitFactory.factionIdFor('literowka') === 'humanity',
    'T6 KONTROLA PINU: literówka DALEJ spada na humanity (i dalej ostrzega) — nie zamiataliśmy ' +
    'prawdziwych pomyłek pod dywan');
}

// ── T7 — ŚCIEŻKA PRODUKTU: uderzenie AI → bitwa EAH → ocena desantu ─────────
console.log('T7 — ⚠ PEŁNY ŁAŃCUCH PRODUKTU (EnemyAttackHandler → recordBattle → ocena desantu)');
{
  // ⚠ TO JEST LEKARSTWO NA CZWARTĄ ŚLEPĄ PLAMKĘ TEGO SLICE'U. T1-T6 wołają handler WPROST
  //   z ręcznie zbudowanym rekordem bitwy — czyli budują scenę, której produkt sam nie buduje.
  //   GATE 3 §2 pokazał, do czego to prowadzi: uderzenie z W3-4 kończy się bitwą EAH, ta idzie
  //   przez `recordBattle`, a `recordBattle` emitował `battle:resolved` ZANIM ustawił dominację
  //   orbitalną — więc bramka desantu czytała świat SPRZED bitwy i odmawiała
  //   `no_orbital_dominance` dokładnie w chwili, gdy orbita właśnie została zdobyta.
  //   Ten test przechodzi CAŁĄ drogę produktu i niczego nie podstawia.
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  const inv = core.invasionSystem;                     // ⚠ TA, którą montuje boot — nie druga
  assert(!!inv, 'T7: `InvasionSystem` jest montowany przez boot (nie stawiamy własnego)');

  const empireId = core.empireRegistry.listAll()[0]?.id;
  const home = window.KOSMOS.homePlanet;
  window.KOSMOS.diplomacySystem?.declareWar?.(empireId, 'w3_6b_probe');
  core.colonyManager.getColony(home.id)?.buildingSystem?._active
    ?.set('def_t7', { building: { id: 'defense_tower' }, level: 1, jobs: 0 });

  const eah = new EnemyAttackHandler();
  const seen = { blocked: [], landed: 0, domInEvent: undefined };
  EventBus.on('invasion:blocked', (d) => seen.blocked.push(d.reason));
  EventBus.on('invasion:troopsLanded', () => seen.landed++);
  EventBus.on('battle:resolved', () => {
    seen.domInEvent = gameState.get('orbitalDominance.sys_home')?.controllerId;
  });

  // Scena Filipa co do joty: dwie ESKORTY (uzbrojone, BEZ ładowni i kapsuł).
  const r1 = spawnHull(core, empireId, ['engine_warp', 'warp_tank', 'armor_heavy', 'weapon_laser'], 'Rajder A');
  const r2 = spawnHull(core, empireId, ['engine_warp', 'warp_tank', 'armor_heavy', 'weapon_laser'], 'Rajder B');

  eah._pendingBattles.set(home.id, {
    arrivedVesselIds: new Set([r1.id, r2.id]),
    firstVesselYear: window.KOSMOS.timeSystem.gameTime ?? 0,
    timerId: null,
  });
  eah._resolveBatchedBattle(home.id);

  assert(seen.domInEvent === empireId,
    `T7 SEDNO: w CHWILI zdarzenia dominacja jest już rozstrzygnięta (\`${seen.domInEvent}\`). ` +
    'Przed W3-6b było tu `undefined` — `recordBattle` ogłaszał wynik, zanim dopisał jego skutek, ' +
    'więc każdy subskrybent czytał świat SPRZED bitwy, którą właśnie ogłaszano');

  assert(seen.blocked.includes('no_drop_capable_hull'),
    `T7 SEDNO: łańcuch MÓWI (\`${seen.blocked.join(',') || 'CISZA'}\`) — i mówi rzecz właściwą: ` +
    'eskorty wygrały orbitę, ale nie mają czym zejść na dół. Kontrakt W3-6 brzmi „desant albo ' +
    'uzasadniona odmowa, NIGDY cisza"; na GATE 3 §2 padła cisza');
  assert(!seen.blocked.includes('no_orbital_dominance'),
    'T7: …i NIE jest to odmowa „brak dominacji" — bo tę właśnie orbitę AI przed chwilą wygrało');
  assert(seen.landed === 0, 'T7: bez zrzutowca nic nie ląduje (odmowa to nie półśrodek)');

  // KONTROLA PINU: dołóż TRANSPORTOWIEC i ta sama, produktowa ścieżka DESANTUJE.
  const carrier = spawnHull(core, empireId, DROPPER, 'Transportowiec');
  eah._pendingBattles.set(home.id, {
    arrivedVesselIds: new Set([r1.id, r2.id, carrier.id]),
    firstVesselYear: window.KOSMOS.timeSystem.gameTime ?? 0,
    timerId: null,
  });
  eah._resolveBatchedBattle(home.id);
  assert(seen.landed >= 1,
    `T7 KONTROLA PINU: z transportowcem w składzie TA SAMA ścieżka produktu ląduje wojsko ` +
    `(${seen.landed}) — czyli różnicę robi kadłub, a nie kształt testu`);

  // Ślad audytu — to jest odczyt, który gate wykonuje w §2 L5.
  assert(window.KOSMOS.debugLog.query({ kind: 'invasion:blocked' }).length > 0,
    'T7: odmowa JEST w pierścieniu audytu. Brak `invasion:blocked` w `TRACKED_EVENTS` sprawił, ' +
    'że gracz zmierzył „zero odmów" i odczytał to jako ciszę — kontrakt bez śladu audytu jest ' +
    'nieodróżnialny od jego złamania');
}

console.log(`\n═══ ${pass} PASS, ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
