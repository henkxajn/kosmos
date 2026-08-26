// VO-3b — keeper zwalniania statku po domknięciu rozkazu (D-VO1b-1 … D-VO1b-6).
// Plan: `docs/design/VO3B_PLAN.md`. Rodzic: `VESSEL_ORDERS_PLAN.md` §3.1.3.
//
// ⚠⚠ TEN KEEPER JEST **FAIL-FIRST**. Napisany PRZED naprawą i na obecnym kodzie MUSI ŚWIECIĆ NA
//     CZERWONO — bo pinuje zachowanie, którego jeszcze nie ma. Zielony keeper przed naprawą
//     znaczyłby, że mierzy coś innego niż defekt. Po VO-3b ma zejść do 0 FAIL.
//
// CO PINUJE (i czym każde jest kupione):
//   T1  wszystkie CZTERY przejścia terminalne zwalniają pole `movementOrder` (D-VO1b-1).
//       Dziś ŻADNE nie zeruje — zerowań w produkcji jest ZERO (plan §1).
//   T2  trzy pule wracają — z LICZBAMI z pomiaru (plan §3). ⚠ Pula doktrynalna świadomie NIE
//       wraca od samego zerowania (wymaga `dockedAt === capitalId`) — to pin POPRAWNEGO
//       zachowania, chroniący przed „naprawianiem" predykatu, którego nikt nie prosił (D-VO1b-6).
//   T3  archiwum `lastOrder` zachowuje `blockReason` (D-VO1b-2, Finding 139 — to JEDYNY ślad,
//       kto anulował rozkaz) i jest RUNTIME-ONLY (nie przechodzi przez serialize ⇒ zero migracji).
//   ⚠ DWIE ASERCJE PRZECHODZĄ DZIŚ Z NIEWŁAŚCIWEGO POWODU i będą coś znaczyć dopiero, gdy T1a
//       zzielenieje: **T4a** (dziś nic nie zeruje markera, więc „ZOSTAJE” jest próżnią prawdą) oraz
//       **T3 SEDNO 3** (`lastOrder` nie istnieje, więc „nie ma go w zrzucie” też jest próżne). Obie mają
//       WŁASNE kontrole pinu, które dziś PADAJĄ (T4b, T3 SEDNO/2) — i to one niosą dowód.
//   T4  ⚠ Z1 — OBRONA ŚWIEŻO ZAMKNIĘTEGO D-FDd: statek w AKTYWNYM starciu NIE traci markera
//       odwrotu, bo `DSCS._allOutsideOf` odróżnia po nim uciekiniera od obrońcy. Z kontrolą pinu:
//       po wyjściu ze starcia odroczone zwolnienie MUSI dojść do skutku (inaczej D-VO1b-3
//       produkuje nową klasę lepkiego markera — dokładnie tę, którą zamykamy).
//   T5  prawdomówna odmowa (D-VO1b-5): kadłuby są, ale zajęte ⇒ `no_idle_hull`, NIE
//       `no_warp_capable_hull`. Bez tego GATE B2 jest ślepy — mierzyłby liczby, nie przyczyny.
//   T6  PIN ŹRÓDŁOWY Findingu 140 — hook re-indeksu w `GameScene` (plik nie importuje się pod node).
//   T7  PIN ŹRÓDŁOWY D-VO1b-6 — predykaty pul zostały NIETKNIĘTE.
//
// ⚠ Sondy pomiarowe, z których pochodzą liczby T2/T5, biegły POZA repo (scratchpad) — patrz plan §3.

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { createVessel, isInService } from '../../entities/Vessel.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { TransportOrderSystem } from '../../systems/TransportOrderSystem.js';
import { DirectorOffensive, registerOffensiveBehaviors } from '../../systems/director/DirectorOffensive.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const RAIDER = ['engine_warp', 'warp_tank', 'armor_heavy', 'weapon_laser'];
const CARGO  = ['engine_ion', 'cargo_large', 'cargo_small'];

/** Wspólny fixture: GameCore + MOS + OrderService (harness nie montuje żadnego z nich). */
function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  const mos = new MovementOrderSystem(core.vesselManager);
  window.KOSMOS.movementOrderSystem = mos;
  window.KOSMOS.orderService = new OrderService();
  return { core, mos };
}

function localBodies(sysId, exceptId) {
  return EntityManager.getAll().filter(e =>
    ['planet', 'moon', 'planetoid'].includes(e?.type)
    && (e.systemId ?? 'sys_home') === sysId && e.id !== exceptId);
}

/**
 * ⚠ CEL PODAWANY ZAWSZE JAKO JAWNY `targetBodyId`. Punkt trafiłby w `_findBodyNearPoint`, który
 * NIE MA terminu układu (Finding 138) i snapuje do ciała z OBCEGO układu ⇒ rozkaz odpada na
 * `target_other_system`, a keeper mierzy ciszę. Ta pułapka zjadła pierwszy przebieg sondy.
 */
function moveSpec(dest, extra = {}) {
  return {
    type: 'moveToPoint', targetBodyId: dest.id, targetPoint: { x: dest.x, y: dest.y },
    issuedBy: 'keeper', bypassSpaceportCheck: true, bypassFuelCheck: true, ...extra,
  };
}

function spawn(core, { owner = null, modules = RAIDER, bodyId, sysId, name = 'V' }) {
  const v = createVessel('hull_frigate', bodyId, { name, modules: [...modules], x: 100, y: 100, systemId: sysId });
  if (owner) { v.ownerEmpireId = owner; v.owner = owner; v.isEnemy = true; }
  v.systemId = sysId;
  v.position.state = 'docked'; v.position.dockedAt = bodyId;
  v.position.x = 100; v.position.y = 100;
  v.mission = null; v.movementOrder = null; v.pendingOrder = null; v.status = 'idle';
  if (v.warpFuel) v.warpFuel.current = v.warpFuel.max;
  if (v.fuel) v.fuel.current = v.fuel.max;
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

// ── T1 — cztery przejścia terminalne zwalniają statek ────────────────────────────────────
console.log('T1 — WSZYSTKIE cztery stany terminalne zerują `movementOrder` (D-VO1b-1)');
{
  const { core, mos } = boot();
  const home = EntityManager.get(core.colonyManager.getPlayerColonies()[0]?.planetId);
  const dest = localBodies(home.systemId, home.id)[0];

  // (a) completed przez PRZYLOT (moveToPoint / goToPOI / attack)
  const a = spawn(core, { bodyId: home.id, sysId: home.systemId, name: 'A' });
  const r = mos.issueOrder(a.id, moveSpec(dest));
  assert(r?.ok === true, 'T1 KONTROLA PINU: rozkaz w ogóle przeszedł (inaczej cały test mierzy ciszę)');
  assert(a.movementOrder != null && a.movementOrder.status === 'active',
    'T1 KONTROLA PINU: w locie marker ISTNIEJE i jest `active` — zwalniamy tylko stany terminalne');
  EventBus.emit('vessel:arrived', { vessel: a, mission: a.mission ?? { type: 'move_to_point' } });
  assert(a.movementOrder === null,
    `T1a SEDNO: po PRZYLOCIE pole jest zwolnione (jest: ${a.movementOrder?.status ?? 'null'})`);

  // (b) cancelled — przez `cancelOrder`
  const b = spawn(core, { bodyId: home.id, sysId: home.systemId, name: 'B' });
  mos.issueOrder(b.id, moveSpec(dest));
  const cancelled = mos.cancelOrder(b.id, 'player');
  assert(cancelled === true, 'T1 KONTROLA PINU: `cancelOrder` zwrócił true (był aktywny rozkaz)');
  assert(b.movementOrder === null,
    `T1b SEDNO: po ANULOWANIU pole jest zwolnione (jest: ${b.movementOrder?.status ?? 'null'})`);

  // (c) cancelled — przez wrak (`_onVesselWrecked`)
  const c = spawn(core, { bodyId: home.id, sysId: home.systemId, name: 'C' });
  mos.issueOrder(c.id, moveSpec(dest));
  c.isWreck = true;
  EventBus.emit('vessel:wrecked', { vessel: c, vesselId: c.id });
  assert(c.movementOrder === null,
    `T1c SEDNO: po WRAKU pole jest zwolnione (jest: ${c.movementOrder?.status ?? 'null'})`);

  // (d) blocked — przez `_blockAndCancel`
  const d = spawn(core, { bodyId: home.id, sysId: home.systemId, name: 'D' });
  mos.issueOrder(d.id, moveSpec(dest));
  mos._blockAndCancel(d, d.movementOrder, 'target_lost');
  assert(d.movementOrder === null,
    `T1d SEDNO: po ZABLOKOWANIU pole jest zwolnione (jest: ${d.movementOrder?.status ?? 'null'})`);

  assert(mos._byVessel.size === 0,
    'T1 INWARIANT: indeks `_byVessel` pusty po wszystkich czterech — indeks był poprawny ZAWSZE, ' +
    'defekt siedział wyłącznie w polu na statku');
}

// ── T2 — trzy pule, z liczbami z pomiaru ─────────────────────────────────────────────────
console.log('\nT2 — pule wracają po domknięciu (liczby z pomiaru, plan §3-§4)');
{
  const { core, mos } = boot();
  const off = new DirectorOffensive();
  registerOffensiveBehaviors(off, { allowOverride: true });
  const empireId = core.empireRegistry.listAll()[0]?.id;
  const cap = core.colonyManager.getAllColonies().find(x => x.ownerEmpireId === empireId) ?? null;
  window.KOSMOS.directorProduction = { capitalOf: () => cap };
  const capBody = EntityManager.get(cap.planetId);
  const dest = localBodies(capBody.systemId, capBody.id)[0];

  const fleet = [];
  for (let i = 0; i < 4; i++) {
    fleet.push(spawn(core, { owner: empireId, bodyId: capBody.id, sysId: capBody.systemId, name: `R${i}` }));
  }
  assert(off.strikeReadyVessels(empireId).length === 4,
    'T2 KONTROLA PINU: pula uderzeniowa startuje z 4 (fixture żyje)');

  for (const v of fleet) mos.issueOrder(v.id, moveSpec(dest));
  for (const v of fleet) {
    EventBus.emit('vessel:arrived', { vessel: v, mission: v.mission ?? { type: 'move_to_point' } });
  }
  assert(off.strikeReadyVessels(empireId).length === 4,
    'T2 SEDNO: po DOMKNIĘTYM rozkazie okręty WRACAJĄ do puli uderzeniowej ' +
    '(dziś: 0 — jeden rozkaz wypisywał kadłub z wojny na zawsze)');

  // ⚠ Pula DOKTRYNALNA celowo NIE wraca — wymaga dodatkowo `dockedAt === capitalId`, a po locie
  //   statek stoi gdzie indziej. Pin chroni przed „naprawianiem" predykatu poza zakresem (D-VO1b-6).
  const doctrinePool = fleet.filter(v =>
    isInService(v) && v.position?.dockedAt === capBody.id && !v.mission && !v.movementOrder).length;
  assert(doctrinePool === 0,
    'T2 ZAKRES: pula DOKTRYNALNA nadal pusta — bo wymaga powrotu pod stolicę, nie samego markera ' +
    '(D-VO1b-6: predykatów pul NIE dotykamy)');

  // Pula logistyczna GRACZA (Finding 119) — jedyną zmienną ma być marker, więc dokujemy jawnie.
  const home = EntityManager.get(core.colonyManager.getPlayerColonies()[0]?.planetId);
  const hauler = createVessel('hull_medium', home.id, {
    name: 'Frachtowiec', modules: [...CARGO], x: home.x, y: home.y, systemId: home.systemId,
  });
  hauler.position.state = 'docked'; hauler.position.dockedAt = home.id;
  hauler.mission = null; hauler.movementOrder = null; hauler.status = 'idle';
  core.vesselManager._vessels.set(hauler.id, hauler);
  const tos = new TransportOrderSystem();
  tos.addToPool?.(hauler.id);
  const poolSize = () => (tos._freePoolVessels?.() ?? []).length;
  assert(hauler.cargoMax > 0 && poolSize() === 1,
    `T2 KONTROLA PINU: frachtowiec w puli logistycznej (cargoMax=${hauler.cargoMax}, pula=${poolSize()})`);

  const hdest = localBodies(home.systemId, home.id)[0];
  mos.issueOrder(hauler.id, moveSpec(hdest));
  EventBus.emit('vessel:arrived', { vessel: hauler, mission: hauler.mission ?? { type: 'move_to_point' } });
  hauler.position.state = 'docked'; hauler.position.dockedAt = home.id;   // izolacja czynnika
  assert(poolSize() === 1,
    'T2 SEDNO (Finding 119): zadokowany frachtowiec po domkniętym rozkazie WRACA do puli ' +
    'logistycznej (dziś: 0 — wypadał z niej na stałe)');
}

// ── T3 — archiwum `lastOrder`, runtime-only ──────────────────────────────────────────────
console.log('\nT3 — `lastOrder` zachowuje ślad, ale NIE wchodzi do zapisu (D-VO1b-2)');
{
  const { core, mos } = boot();
  const home = EntityManager.get(core.colonyManager.getPlayerColonies()[0]?.planetId);
  const dest = localBodies(home.systemId, home.id)[0];
  const v = spawn(core, { bodyId: home.id, sysId: home.systemId, name: 'Ślad' });
  const res = mos.issueOrder(v.id, moveSpec(dest));
  mos.cancelOrder(v.id, 'player');

  assert(v.lastOrder != null, 'T3 SEDNO: archiwum `lastOrder` istnieje po zwolnieniu pola');
  assert(v.lastOrder?.id === res.orderId,
    'T3: archiwum trzyma TEN rozkaz (id się zgadza), a nie dowolny inny');
  assert(v.lastOrder?.blockReason === 'player',
    `T3 SEDNO 2 (Finding 139): \`blockReason\` PRZEŻYWA czyszczenie — to jedyny ślad, kto anulował ` +
    `rozkaz (jest: ${v.lastOrder?.blockReason ?? 'brak'})`);

  const dump = core.vesselManager.serialize();
  const row = (dump?.vessels ?? dump ?? []).find?.(x => x?.id === v.id) ?? null;
  assert(row != null, 'T3 KONTROLA PINU: statek jest w zrzucie (inaczej test poniżej mierzy ciszę)');
  // ⚠ DZIŚ próżno prawdziwe — pola w ogóle nie ma. Pilnuje regresji PO naprawie.
  assert(row != null && row.lastOrder === undefined,
    'T3 SEDNO 3: `lastOrder` NIE jest serializowane — dlatego ten slice nie rusza wersji zapisu');
}

// ── T4 — Z1: obrona D-FDd ────────────────────────────────────────────────────────────────
console.log('\nT4 — ⚠ Z1: w AKTYWNYM starciu marker odwrotu NIE znika (D-VO1b-3, obrona D-FDd)');
{
  const { core, mos } = boot();
  const home = EntityManager.get(core.colonyManager.getPlayerColonies()[0]?.planetId);
  const dest = localBodies(home.systemId, home.id)[0];
  const v = spawn(core, { bodyId: home.id, sysId: home.systemId, name: 'Uciekinier' });

  // Atrapa DSCS o jawnym kontrakcie — harness nie montuje prawdziwego. Nazwa metody jest
  // TA SAMA, której używa produkcja (`MovementOrderSystem:462`), a T4d pinuje to źródłowo.
  let inEncounter = true;
  window.KOSMOS.deepSpaceCombatSystem = {
    _findActiveEncounterContaining: (id) => (inEncounter && id === v.id)
      ? { id: 'enc_TEST', location: { point: { x: 0, y: 0 } } } : null,
  };

  mos.issueOrder(v.id, moveSpec(dest, { issuedBy: 'auto_retreat', isRetreat: true }));
  mos.markAsRetreat(v, 'battle_TEST');
  const isRetreating = (x) => x?.movementOrder?._retreatFromCombat === true
                           || x?.movementOrder?.retreatFromBattleId != null;
  assert(isRetreating(v), 'T4 KONTROLA PINU: marker odwrotu w ogóle się postawił');

  EventBus.emit('vessel:arrived', { vessel: v, mission: v.mission ?? { type: 'move_to_point' } });
  // ⚠ DZIŚ ta asercja jest PRÓŻNIE prawdziwa (nic nie zeruje markera). Znaczenie zyskuje
  //   dopiero po T1a; dowodem żywotności guardu jest T4b niżej, który dziś PADA.
  assert(v.movementOrder !== null && isRetreating(v),
    'T4a SEDNO: rozkaz domknięty W TRAKCIE STARCIA — marker ZOSTAJE, bo `DSCS._allOutsideOf` ' +
    'odróżnia po nim UCIEKINIERA od zadokowanego OBROŃCY (bez tego udany odwrót robiłby ' +
    'side-level wrak żywych przegranych — dokładnie szkoda, którą kupił D-FDd)');

  // KONTROLA PINU — odroczenie MUSI mieć dokończenie, inaczej D-VO1b-3 tworzy nowy lepki marker.
  inEncounter = false;
  mos._tick(0.1);
  assert(v.movementOrder === null,
    'T4b KONTROLA PINU: po wyjściu ze starcia odroczone zwolnienie DOCHODZI DO SKUTKU ' +
    '(inaczej obrona D-FDd produkuje nową klasę lepkiego markera)');

  window.KOSMOS.deepSpaceCombatSystem = null;
}

// ── T5 — prawdomówna odmowa ──────────────────────────────────────────────────────────────
console.log('\nT5 — odmowa mówi PRAWDĘ o przyczynie (D-VO1b-5, warunek konieczny GATE B2)');
{
  const { core, mos } = boot();
  const off = new DirectorOffensive();
  registerOffensiveBehaviors(off, { allowOverride: true });
  const empireId = core.empireRegistry.listAll()[0]?.id;
  const cap = core.colonyManager.getAllColonies().find(x => x.ownerEmpireId === empireId) ?? null;
  window.KOSMOS.directorProduction = { capitalOf: () => cap };
  const capBody = EntityManager.get(cap.planetId);
  const playerBody = EntityManager.get(core.colonyManager.getPlayerColonies()[0]?.planetId);
  window.KOSMOS.influenceMap = {
    isClaimedBy: () => false, isInBorderZone: (s) => s === playerBody?.systemId,
  };

  // Kadłub ZE SKOKIEM, ale zajęty misją ⇒ pula pusta z INNEGO powodu niż brak warpu.
  const busy = spawn(core, { owner: empireId, bodyId: capBody.id, sysId: capBody.systemId, name: 'Zajęty' });
  busy.mission = { type: 'attack', phase: 'cruise' };
  assert(off.strikeReadyVessels(empireId).length === 0,
    'T5 KONTROLA PINU: pula uderzeniowa jest pusta (kadłub istnieje, ale ma zajęcie)');

  const r = off.launchStrike({ empireId, year: 1 });
  assert(r?.reason === 'no_idle_hull',
    `T5 SEDNO: powód odmowy to \`no_idle_hull\`, a NIE \`no_warp_capable_hull\` — dziś odmowa ` +
    `KŁAMIE o przyczynie przy pełnym baku i sprawnych kadłubach (jest: ${r?.reason})`);

  // KONTROLA PINU — gdy naprawdę nie ma kadłuba ze skokiem, powód zostaje ten stary.
  core.vesselManager._vessels.delete(busy.id);
  const noWarp = spawn(core, {
    owner: empireId, bodyId: capBody.id, sysId: capBody.systemId, name: 'BezWarpu',
    modules: ['engine_ion', 'armor_standard', 'weapon_kinetic'],
  });
  const r2 = off.launchStrike({ empireId, year: 2 });
  assert(r2?.reason === 'no_warp_capable_hull',
    `T5 KONTROLA PINU: bez kadłuba ze skokiem powód pozostaje \`no_warp_capable_hull\` ` +
    `(jest: ${r2?.reason}) — rozróżnienie musi CIĄĆ, nie zastępować`);
  void noWarp;
}

// ── T6 — pin ŹRÓDŁOWY Findingu 140 ───────────────────────────────────────────────────────
console.log('\nT6 — PIN ŹRÓDŁOWY (Finding 140): hook re-indeksu stoi PO `vesselManager.restore`');
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  // ⚠ Komentarze zdejmowane przed szukaniem (memory `source-pin-strip-comments`) — inaczej pin
  //   łapie własne wyjaśnienie zostawione obok kodu.
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const scene = stripComments(readFileSync(join(SRC, 'scenes', 'GameScene.js'), 'utf8'));

  assert(/_indexExistingOrders\s*\(\s*\)/.test(scene),
    'T6 KONTROLA PINU: `GameScene` w ogóle woła `_indexExistingOrders()` (plik wczytany)');

  const iRestore = scene.indexOf('vesselManager.restore(');
  const iIndex   = scene.indexOf('_indexExistingOrders()');
  assert(iRestore > 0 && iIndex > iRestore,
    'T6 SEDNO: re-indeks stoi PO `vesselManager.restore(` — przed nim zobaczyłby pustą listę ' +
    'i po wczytaniu każdy statek pod rozkazem zamarzłby (Finding 140; `GameScene` nie importuje ' +
    'się pod node, więc regresja byłaby NIEWIDZIALNA dla sweepu)');
}

// ── T7 — pin ŹRÓDŁOWY zakresu (D-VO1b-6) ─────────────────────────────────────────────────
console.log('\nT7 — PIN ŹRÓDŁOWY zakresu: predykaty pul NIETKNIĘTE (D-VO1b-6)');
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const read = (...p) => stripComments(readFileSync(join(SRC, ...p), 'utf8'));

  const off  = read('systems', 'director', 'DirectorOffensive.js');
  const doc  = read('systems', 'director', 'DirectorDoctrine.js');
  const tos  = read('systems', 'TransportOrderSystem.js');
  const gate = /if\s*\(\s*v\.movementOrder\s*\)\s*continue\s*;/;

  assert(gate.test(off), 'T7a: `DirectorOffensive` nadal bramkuje samo istnienie markera');
  assert(gate.test(doc), 'T7b: `DirectorDoctrine` nadal bramkuje samo istnienie markera');
  assert(gate.test(tos), 'T7c: `TransportOrderSystem` nadal bramkuje samo istnienie markera');
  assert(off.length > 500 && doc.length > 500 && tos.length > 500,
    'T7 KONTROLA PINU: wszystkie trzy pliki naprawdę wczytane (pin nie przechodzi na pustce)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail ? 1 : 0);
