// AI STRIKES BACK S0 — keeper trzech defektów floty AI (Findingi 391, 392, 393, 394).
// Plan i decyzje: `docs/design/AI_STRIKES_BACK_PLAN.md` §5–§6; audyt fazy A: `AI_STRIKES_BACK_AUDIT.md`.
//
//   T1  391 — zaległość floty GRACZA nie zatrzymuje rozmieszczenia kadłuba AI; kadłub gracza dalej
//       odmawia (`fleet_in_arrears`), a bez długu przechodzi (KONTROLA PINU)
//   T2  391 — kurier AI w rezerwie przy długu gracza: rusza z rezerwy, kończy przejście i LECI na trasę
//       (prawdziwy dyspozytor `EmpireLogisticsSystem`); odmowa `courier_deploy_refused` nie pada
//
// ⚠ Fail-first: `isFightableInSpace` i `hasOrbitalDominanceInSystem` powstają w S0-3 — import przestrzeni
//   nazw i wywołania opcjonalne, żeby na kodzie sprzed poprawki piny DEGRADOWAŁY, a nie przerywały suitę.
// ⚠ Każdy pin wykluczający ma świadka: stan wejściowy (dług gracza, właściciel kadłuba, `freePops = 0`,
//   pusta orbita) jest asertowany PRZED akcją, w tym samym świecie.

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import gameState from '../../core/GameState.js';
import * as VesselNS from '../../entities/Vessel.js';
import { HULLS } from '../../data/HullsData.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const near = (a, b, eps = 1e-6) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < eps;

const WARSHIP = ['engine_ion', 'armor_standard', 'weapon_kinetic'];
const UNARMED = ['engine_ion', 'armor_standard'];
const COURIER = ['engine_chemical', 'cargo_small'];
const DROPPER = ['engine_ion', 'armor_standard', 'weapon_kinetic', 'troop_bay_s', 'drop_pods'];

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  return core;
}

/** Stolica imperium = pierwsza pełna kolonia z żywą ekonomią (kanon `DirectorProduction.capitalOf`). */
function capitalOf(core, empId) {
  return (core.empireRegistry.getColoniesByEmpire(empId) ?? [])
    .find(c => c && !c.isOutpost && c.resourceSystem && c.civSystem) ?? null;
}

/** Kadłub AI wprost w rejestrze, ze stemplem właściciela (trzy pola czytane przez `isEnemyVessel`). */
function aiHull(core, empId, body, {
  shipId = 'hull_frigate', modules = WARSHIP, service = 'stored', state = 'docked',
  dockedAt = body.id, systemId = body.systemId,
} = {}) {
  const v = VesselNS.createVessel(shipId, body.id, {
    name: `AI ${service}/${state}`, modules: [...modules], x: body.x ?? 0, y: body.y ?? 0,
    systemId, serviceState: service,
  });
  v.ownerEmpireId = empId; v.owner = empId; v.isEnemy = true;
  v.position.state = state; v.position.dockedAt = dockedAt;
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

/** Kadłub GRACZA (brak pól właściciela = gracz — kanon `isEnemyVessel`). */
function playerHull(core, body, {
  shipId = 'hull_frigate', modules = WARSHIP, service = 'active', state = 'docked',
  dockedAt = body.id, systemId = body.systemId ?? 'sys_home',
} = {}) {
  const v = VesselNS.createVessel(shipId, body.id, {
    name: `Gracz ${service}/${state}`, modules: [...modules], x: body.x ?? 0, y: body.y ?? 0,
    systemId, serviceState: service,
  });
  v.position.state = state; v.position.dockedAt = dockedAt;
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

const capture = (names) => {
  const seen = [];
  const offs = names.map(n => { const h = (p) => seen.push({ ev: n, ...p }); EventBus.on(n, h); return () => EventBus.off(n, h); });
  return { seen, stop: () => offs.forEach(f => f()) };
};

/** Placówka-atrapa AI (wzór `nt_route_scope_smoke`): encja + wpis kolonii + rejestracja w imperium. */
function addOutpost(core, empId, { id, systemId, x = 120, y = 0 }) {
  EntityManager.add({ id, name: id, type: 'planet', planetType: 'rocky', radius: 1, mass: 1, x, y, systemId,
    deposits: [{ resourceId: 'Nt', richness: 0.3, totalAmount: 1e5, remaining: 1e5 }] });
  const inv = new Map([['Nt', 5000]]);
  core.colonyManager._colonies.set(id, {
    planetId: id, name: id, isOutpost: true, ownerEmpireId: empId, systemId,
    resourceSystem: {
      inventory: inv,
      getAmount: (r) => inv.get(r) ?? 0,
      spend:   (c) => { for (const [k, v] of Object.entries(c)) inv.set(k, (inv.get(k) ?? 0) - v); return true; },
      receive: (g) => { for (const [k, v] of Object.entries(g)) inv.set(k, (inv.get(k) ?? 0) + v); },
    },
  });
  core.empireRegistry.addColony(empId, id);
}

// ── T1 — 391: dług floty gracza nie zatrzymuje kadłuba AI ─────────────────────────────────────
console.log('T1 — 391: zaległość floty GRACZA nie zatrzymuje rozmieszczenia kadłuba AI');
{
  const core = boot();
  const K = window.KOSMOS;
  const vm = core.vesselManager;
  const emp = core.empireRegistry.listAll()[0]?.id;
  const cap = capitalOf(core, emp);
  assert(!!cap, `T1 ŚWIADEK: imperium ${emp} ma stolicę z żywą ekonomią (${cap?.planetId ?? '—'})`);
  if (cap) {
    const C = EntityManager.get(cap.planetId);
    const ai = aiHull(core, emp, C);
    const debtor = playerHull(core, K.homePlanet);
    debtor.unpaidYears = 1;
    assert(vm.fleetInArrears() === true, 'T1 ŚWIADEK: flota GRACZA zalega (okręt w służbie z unpaidYears 1)');
    assert(VesselNS.isEnemyVessel(ai) === true && ai.serviceState === 'stored',
      'T1 ŚWIADEK: kadłub w rezerwie należy do imperium AI');

    const res = vm.deployVessel(ai.id);
    assert(res?.ok === true,
      `T1a SEDNO: kadłub AI rozmieszczony mimo długu GRACZA (ok=${res?.ok}, reason=${res?.reason ?? '—'}) — ` +
      'przed S0-1: `fleet_in_arrears`, choć AI utrzymania nie płaci');
    assert(ai.serviceState === 'mobilizing', `T1b: …i kadłub AI przechodzi w mobilizację (${ai.serviceState})`);

    const mine = playerHull(core, K.homePlanet, { service: 'stored' });
    const r2 = vm.deployVessel(mine.id);
    assert(r2?.ok === false && r2?.reason === 'fleet_in_arrears',
      `T1c KONTROLA: kadłub GRACZA przy długu własnej floty dalej odmawia (${r2?.reason ?? 'ok'}) — strona gracza bez zmian`);
    debtor.unpaidYears = 0;
    const r3 = vm.deployVessel(mine.id);
    assert(r3?.ok === true,
      `T1d KONTROLA PINU: po spłacie ten sam kadłub gracza przechodzi (ok=${r3?.ok}, reason=${r3?.reason ?? '—'}) — ` +
      'odmowa w T1c pochodziła z zaległości, nie z czego innego');
  }
}

// ── T2 — 391: kurier AI przy długu gracza rusza i leci ───────────────────────────────────────
console.log('T2 — 391: kurier AI w rezerwie przy długu gracza rusza z rezerwy i LECI na trasę');
{
  const core = boot();
  const K = window.KOSMOS;
  const vm = core.vesselManager;
  const empId = core.empireRegistry.listAll()[0]?.id;
  const empire = core.empireRegistry.get(empId);
  const cap = capitalOf(core, empId);
  const capSys = cap ? EntityManager.get(cap.planetId)?.systemId : null;
  addOutpost(core, empId, { id: 'probe_near', systemId: capSys });
  const els = core.empireLogisticsSystem;
  els._runDispatcher(empire);
  const route = (empire?.logistics?.routes ?? []).find(r => r.outpostId === 'probe_near') ?? null;
  assert(!!route, 'T2 ŚWIADEK: trasa logistyki do placówki w układzie stolicy istnieje');
  if (route && cap) {
    const v = vm.createAndRegister('hull_small', cap.planetId, { modules: [...COURIER] });
    assert(VesselNS.isEnemyVessel(v) === true,
      `T2 ŚWIADEK: kurier ze stoczni-szwu ostemplowany jako kadłub AI (${v.ownerEmpireId ?? '—'})`);
    v.serviceState = 'stored'; v.status = 'idle';
    v.position.state = 'docked'; v.position.dockedAt = cap.planetId;
    if (!route.courierIds.includes(v.id)) route.courierIds.push(v.id);
    const debtor = playerHull(core, K.homePlanet);
    debtor.unpaidYears = 1;
    assert(vm.fleetInArrears() === true, 'T2 ŚWIADEK: flota gracza zalega');

    const rej = capture(['director:mobilizeRejected']);
    els._advanceRouteCourier(empire, route, v.id, cap);
    assert(v.serviceState === 'mobilizing',
      `T2a SEDNO: kurier ruszył z rezerwy (${v.serviceState}) — przed S0-1 zostawał w niej przy każdym długu gracza`);
    assert(!rej.seen.some(e => e.reason === 'courier_deploy_refused'),
      `T2b: brak odmowy \`courier_deploy_refused\` (${rej.seen.map(e => e.detail).join(', ') || '—'}) — ` +
      'w audycie fazy A 4 392–4 498 takich odmów na imperium w 100 gy');
    vm._tickMobilization(1.0);
    assert(v.serviceState === 'active', `T2c: po miesiącu przejścia kurier jest w służbie (${v.serviceState})`);
    els._advanceRouteCourier(empire, route, v.id, cap);
    rej.stop();
    assert(v.mission?.targetId === 'probe_near',
      `T2d SEDNO: kurier LECI na trasę (misja → ${v.mission?.targetId ?? '—'}, stan ${v.position?.state})`);
  }
}

console.log(`\n[sb0_fleet_defects_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
