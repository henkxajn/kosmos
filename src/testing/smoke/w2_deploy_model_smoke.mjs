// W2 — keeper modelu rezerwy (commit W2-2, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: W2-2 wprowadza JEDNĄ nową oś stanu (`vessel.serviceState`) i podpina ją pod
// dziesięć konsumentów rejestru. Ryzyko nie leży w samej osi, tylko w tym, że rejestr
// statków ma 35 czytelników, a niemal wszystkie filtrują idiomem `isWreck` +
// `isEnemyVessel` — czyli nowa flaga jest dla nich NIEWIDOCZNA z domysłu (audyt W2 §S2).
// Ten keeper pinuje każde wpięcie OSOBNO, żeby „magazyn działa" nie znaczyło „działa
// w tym jednym miejscu, które akurat sprawdziliśmy".
//
//   T1  oba szwy stoczni oddają kadłub do REZERWY (kolonijna + orbitalna)
//   T2  ścieżki spawnu SPOZA stoczni zostają w służbie (materializer/sonda/debug/legacy)
//   T3  zbiór wykluczeń — każdy konsument z osobna
//   T4  rozdział ThreatAssessment: siła (służba) vs potencjał (wszystko)
//   T5  round-trip zapisu: `serviceState` przeżywa serialize → restore
//   T6  zgodność wstecz: kadłub BEZ pola czyta się jako w służbie
//
// ⚠ „Nie do zaspokojenia przez sąsiada": pin rezerwy NIE MOŻE być zielony dzięki
//    `isImmobilized` — to ISTNIEJĄCY stan „kadłub jest, ale nie może się ruszyć", dający
//    ten sam obserwowalny skutek w czterech systemach odmowy. T3 trzyma `unpaidYears = 0`
//    wszędzie, więc jedyną przyczyną wykluczenia może być `serviceState`.

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EntityManager from '../../core/EntityManager.js';
import { createVessel, isInService } from '../../entities/Vessel.js';
import { HULLS } from '../../data/HullsData.js';
import { Station } from '../../entities/Station.js';
import { StationSystem } from '../../systems/StationSystem.js';
import { makeStationModule } from '../../data/StationModuleData.js';
import { calcShipCost } from '../../data/ShipModulesData.js';
import { ThreatAssessment, PLAYER_OWNER_ID } from '../../systems/ThreatAssessment.js';
import { DirectorDoctrine } from '../../systems/director/DirectorDoctrine.js';
import { WarSystem } from '../../systems/WarSystem.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const WARSHIP = ['engine_ion', 'armor_standard', 'weapon_kinetic'];
const GRANT = {
  Fe: 9000, Si: 9000, Cu: 9000, Ti: 9000, C: 9000, Al: 9000, Hv: 9000, Li: 9000,
  structural_alloys: 500, reactive_armor: 500, electronic_systems: 500,
  polymer_composites: 500, semiconductor_arrays: 500, propulsion_systems: 500,
  conductor_bundles: 500, metamaterials: 500,
};
const boot = () => { const c = new GameCore(); c.boot({ quiet: true, scenario: 'civilization' }); return c; };

// ── T1 — oba szwy stoczni oddają kadłub do rezerwy ──────────────────────────────────────────
console.log('T1 — kadłub schodzi ze stoczni do REZERWY (oba szwy)');
{
  const core = boot();
  const cm = core.colonyManager;

  // (a) stocznia KOLONIJNA — ścieżka `fleet:shipCompleted` → `_onShipCompleted`
  const col = cm.getAllColonies().find(c => c.ownerEmpireId && c.civSystem && c.resourceSystem);
  if (col) {
    core.vesselManager._onShipCompleted(col.planetId, 'hull_frigate', [...WARSHIP]);
    const built = core.vesselManager.getAllVessels().find(v => v.shipId === 'hull_frigate');
    assert(built?.serviceState === 'stored',
      `T1a: stocznia KOLONIJNA → serviceState='stored' (${built?.serviceState})`);
    assert(isInService(built) === false, 'T1a: `isInService` mówi NIE dla świeżego kadłuba');
    assert(built?.crewLocked === 0, 'T1a: świeży kadłub nie trzyma jeszcze żadnego POP (załoga = W2-4)');
  }

  // (b) stocznia ORBITALNA — ścieżka `_tickShipQueues` → `_spawnStationShip`
  const stSys = new StationSystem();
  window.KOSMOS.stationSystem = stSys;
  const home = cm.getColony(window.KOSMOS.homePlanet?.id);
  const def = HULLS.hull_frigate;
  window.KOSMOS.techSystem?.grantTechs?.([def.requires].filter(Boolean));
  const { cost, commodityCost } = calcShipCost(def, [...WARSHIP]);
  const bill = {};
  for (const [id, amt] of Object.entries({ ...cost, ...commodityCost })) bill[id] = amt * 3;
  home?.resourceSystem?.receive?.({ ...GRANT, ...bill });   // depot deleguje do matki (S3.4c)
  const station = new Station({
    id: 'station_w2_2', name: 'Stacja W2-2', bodyId: home?.planetId ?? 'home', systemId: 'sys_home',
    pop: 20, modules: [makeStationModule('power_fusion', 1), makeStationModule('shipyard', 1)],
  });
  EntityManager.add(station);
  stSys._recomputeModuleStates(station);
  const before = new Set(core.vesselManager.getAllVessels().map(v => v.id));
  stSys.queueStationShip(station.id, 'hull_frigate', [...WARSHIP]);
  stSys._tick((def.buildTime ?? 1) + 0.01);
  const fromStation = core.vesselManager.getAllVessels().find(v => !before.has(v.id));
  assert(fromStation?.serviceState === 'stored',
    `T1b: stocznia ORBITALNA → serviceState='stored' (${fromStation?.serviceState})`);
}

// ── T2 — spawn spoza stoczni zostaje w służbie ──────────────────────────────────────────────
console.log('T2 — ścieżki spawnu SPOZA stoczni zachowują zachowanie sprzed W2');
{
  const v = createVessel('hull_frigate', 'home', { modules: [...WARSHIP], x: 0, y: 0 });
  assert(v.serviceState === 'active',
    `T2: domyślny \`createVessel\` daje 'active' (${v.serviceState}) — materializer, sonda ` +
    'pierwszego kontaktu, spawnery debugowe i migracja legacy fleet nie są ruszone');
  assert(isInService(v) === true, 'T2: `isInService` mówi TAK');
}

// ── T3 — zbiór wykluczeń, każdy konsument z osobna ──────────────────────────────────────────
console.log('T3 — zbiór wykluczeń: rezerwa nie walczy, nie ginie, nie patroluje, nie lata');
{
  const core = boot();
  const vMgr = core.vesselManager;
  const home = window.KOSMOS.homePlanet?.id;
  const sysId = EntityManager.get(home)?.systemId ?? 'sys_home';

  const mk = (name, state) => {
    const v = createVessel('hull_frigate', home, { name, modules: [...WARSHIP], x: 0, y: 0, systemId: sysId });
    v.position.state = 'docked'; v.position.dockedAt = home;
    v.homeColonyId = home; v.serviceState = state;
    v.unpaidYears = 0;      // ⚠ zero zaległości: wykluczenie MUSI wynikać z serviceState,
                            //   nie z `isImmobilized` (sąsiad dający ten sam skutek)
    vMgr._vessels.set(v.id, v);
    return v;
  };
  const active = mk('W służbie', 'active');
  const stored = mk('W rezerwie', 'stored');
  assert(vMgr.isImmobilized(stored) === false,
    'T3: KONTROLA SĄSIADA — kadłub w rezerwie NIE jest `isImmobilized`, więc każde ' +
    'wykluczenie poniżej pochodzi wyłącznie od `serviceState`');

  // (a) nie walczy
  const war = new WarSystem();
  const unit = war._buildPlayerBattleUnit(sysId);
  const onlyActive = war._buildPlayerBattleUnit(sysId);
  stored.serviceState = 'active';
  const bothActive = war._buildPlayerBattleUnit(sysId);
  stored.serviceState = 'stored';
  assert((bothActive?.hp ?? 0) > (onlyActive?.hp ?? 0),
    `T3a: jednostka bitwy liczy tylko służbę (rezerwa ${unit?.hp} < oba w służbie ${bothActive?.hp})`);

  // (b) nie ginie przy upadku układu
  const eah = new EnemyAttackHandler();
  eah._wreckPlayerVesselsInSystem(sysId, 10);
  assert(active.isWreck === true,  'T3b: kadłub W SŁUŻBIE ginie razem z układem');
  assert(stored.isWreck !== true,  'T3b: kadłub w REZERWIE NIE ginie (pod R-C to byłaby śmierć załogi, której tam nie ma)');

  // (c) nie idzie na misję ani nie trafia do puli doboru
  assert(vMgr.dispatchOnMission?.(stored.id, { type: 'recon', targetId: home }) === false,
    'T3c: `dispatchOnMission` odmawia kadłubowi w rezerwie');
  assert(vMgr.getAvailable(home).every(v => v.id !== stored.id),
    'T3c: `getAvailable` (pula doboru misji/ekspedycji/kolonizacji) pomija rezerwę');
}

// ── T4 — rozdział siła / potencjał ──────────────────────────────────────────────────────────
console.log('T4 — ThreatAssessment: siła (służba) vs potencjał (wszystko)');
{
  const core = boot();
  const ta = new ThreatAssessment();
  window.KOSMOS.threatAssessment = ta;
  const home = window.KOSMOS.homePlanet?.id;

  const mk = (state) => {
    const v = createVessel('hull_frigate', home, { modules: [...WARSHIP], x: 0, y: 0, systemId: 'sys_home' });
    v.serviceState = state;
    core.vesselManager._vessels.set(v.id, v);
    return v;
  };
  mk('active'); ta.invalidate();
  const s1 = ta.getStrength(PLAYER_OWNER_ID), p1 = ta.getPotentialStrength(PLAYER_OWNER_ID);
  assert(s1 > 0 && s1 === p1, `T4: sam kadłub w służbie ⇒ siła === potencjał (${s1}/${p1})`);

  mk('stored'); ta.invalidate();
  const s2 = ta.getStrength(PLAYER_OWNER_ID), p2 = ta.getPotentialStrength(PLAYER_OWNER_ID);
  assert(s2 === s1, `T4: dołożona REZERWA NIE podnosi siły (${s1} → ${s2})`);
  assert(p2 > p1, `T4: ale PODNOSI potencjał (${p1} → ${p2}) — „magazyn to potencjał, nie siła"`);
  assert(ta.getReserveStrength(PLAYER_OWNER_ID) === p2 - s2,
    'T4: `getReserveStrength` = potencjał − siła (liczba dla wywiadu/UI)');
}

// ── T5/T6 — round-trip zapisu + zgodność wstecz ─────────────────────────────────────────────
console.log('T5/T6 — round-trip serialize→restore i zgodność ze starym zapisem');
{
  const core = boot();
  const home = window.KOSMOS.homePlanet?.id;
  const v = createVessel('hull_frigate', home, { modules: [...WARSHIP], x: 0, y: 0, systemId: 'sys_home' });
  v.serviceState = 'stored'; v.mobilizeProgress = 0.25; v.crewLocked = 0.4;
  core.vesselManager._vessels.set(v.id, v);

  const blob = core.vesselManager.serialize();
  const fresh = boot();
  fresh.vesselManager.restore(blob);
  const back = fresh.vesselManager.getVessel(v.id);
  assert(back?.serviceState === 'stored',
    `T5: \`serviceState\` przeżył round-trip (${back?.serviceState}) — biała lista serialize+restore`);
  assert(Math.abs((back?.mobilizeProgress ?? 0) - 0.25) < 1e-9, 'T5: `mobilizeProgress` przeżył round-trip');
  assert(Math.abs((back?.crewLocked ?? 0) - 0.4) < 1e-9, 'T5: `crewLocked` przeżył round-trip');

  // T6 — zapis SPRZED v101: pól nie ma w ogóle.
  const legacy = JSON.parse(JSON.stringify(blob));
  for (const vd of (legacy.vessels ?? [])) {
    delete vd.serviceState; delete vd.mobilizeProgress; delete vd.crewLocked;
  }
  const old = boot();
  old.vesselManager.restore(legacy);
  const revived = old.vesselManager.getVessel(v.id);
  assert(revived?.serviceState === 'active',
    `T6: kadłub ze starego zapisu wraca W SŁUŻBIE (${revived?.serviceState}) — ` +
    'każdy statek sprzed W2 BYŁ w służbie, więc `?? \'active\'` to kontrakt, nie defensywa');
  assert(isInService(revived) === true, 'T6: `isInService` mówi TAK dla kadłuba bez pola');
}

console.log(`\n[w2_deploy_model_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
