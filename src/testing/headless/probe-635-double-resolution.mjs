// probe-635-double-resolution — SONDA (CV-8a, Finding 635): czy JEDNO uderzenie AI na kolonię rozstrzyga się dwa razy — starciem
// DSCS w podejściu (okręty gracza na orbicie celu, `ProximitySystem` → `DeepSpaceCombatSystem`) i bitwą orbitalną EAH po przylocie
// (`vessel:arrived` z misją `attack`). Prawdziwy łańcuch klatek (TimeSystem.update → VesselManager → Proximity → VCS → DSCS → MOS →
// EAH; partia EAH przez prawdziwy `setTimeout` zastąpiony natychmiastowym — sonda w czasie wirtualnym), świat jak `cv_fx_results_smoke`.
//   node src/testing/headless/probe-635-double-resolution.mjs
// Wynik: dla każdego scenariusza — bitwy z udziałem napastnika (DSCS: `location.point`, EAH: `location.planetId` bez punktu), ten
// sam `battleId` dwa razy (nie powinno być nigdy) i podsumowanie.
import './env.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { TimeSystem } from '../../systems/TimeSystem.js';
import { VesselManager } from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { ProximitySystem } from '../../systems/ProximitySystem.js';
import { VesselCombatSystem } from '../../systems/VesselCombatSystem.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { OrbitalSpaceSystem } from '../../systems/OrbitalSpaceSystem.js';
import { createVessel, setNextVesselId } from '../../entities/Vessel.js';
import { resolveVesselOrbitalRole } from '../../data/OrbitalRolesData.js';

const AU = GAME_CONFIG.AU_TO_PX, SYS = 'sys_t', EMP = 'emp_t';
const clock = { now: 1e7 };
performance.now = () => clock.now;
const realSetTimeout = globalThis.setTimeout;

function run({ defenders = 2, raiders = 1, dist = 1.2, modsA = ['engine_ion', 'weapon_kinetic', 'weapon_laser', 'armor_standard'],
  modsB = ['engine_ion', 'weapon_laser', 'armor_standard'], frames = 60 * 240 } = {}) {
  EventBus.clear(); EntityManager.clear();
  clock.now = 1e7; setNextVesselId(1);
  const ts = new TimeSystem(); ts.gameTime = 100.00002; ts.multiplierIndex = 1;
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: ts, activeSystemId: SYS };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: SYS, x: -4 * AU, y: 0, radius: 6, mass: 1, visual: { radius: 6 } });
  const vm = new VesselManager(); const mos = new MovementOrderSystem(vm); const prox = new ProximitySystem(vm);
  const dscs = new DeepSpaceCombatSystem(vm); new VesselCombatSystem(vm); const eah = new EnemyAttackHandler(); const oss = new OrbitalSpaceSystem();
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {}, fleet: [] }];
  const empires = [{ id: EMP, name: 'Testowe' }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: EntityManager.get('p_home'), vesselManager: vm, movementOrderSystem: mos, proximitySystem: prox,
    deepSpaceCombatSystem: dscs, enemyAttackHandler: eah, orbitalSpaceSystem: oss,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find((c) => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} }, intelSystem: { getVesselContact: () => ({ quality: 'contact' }), getLevel: () => 'contact', isAtLeast: () => true },
    empireRegistry: { listAll: () => empires, get: (id) => empires.find((e) => e.id === id) ?? null }, debug: {},
  });
  // partia EAH (500 ms czasu realnego) — natychmiast w czasie wirtualnym sondy
  globalThis.setTimeout = (fn) => { fn(); return 0; };
  const home = EntityManager.get('p_home');
  const mk = (mods, name) => { const v = createVessel('hull_frigate', 'p_home', { name, modules: [...mods], x: home.x, y: home.y, systemId: SYS }); vm._vessels.set(v.id, v); v.serviceState = 'active'; if (v.fuel) v.fuel.current = v.fuel.max = 9999; return v; };
  const defs = [];
  for (let i = 0; i < defenders; i++) {
    const v = mk(modsB, `D${i}`);
    Object.assign(v.position, { state: 'orbiting', dockedAt: 'p_home' });
    oss.assignOrbit('p_home', v.id, resolveVesselOrbitalRole(v));
    defs.push(v);
  }
  const raid = [];
  for (let i = 0; i < raiders; i++) {
    const v = mk(modsA, `R${i}`);
    v.ownerEmpireId = EMP; v.owner = EMP; v.isEnemy = true;
    Object.assign(v.position, { state: 'orbiting', dockedAt: null, x: home.x + dist * AU, y: home.y + 0.05 * AU * i });
    const r = mos.issueOrder(v.id, { type: 'attack', targetBodyId: 'p_home', issuedBy: 'probe' });
    raid.push({ v, order: r });
  }
  const battles = [];
  EventBus.on('battle:resolved', (p) => {
    const loc = p?.result?.location ?? {};
    const ids = [...(p?.result?.participantA?.vesselIds ?? []), ...(p?.result?.participantB?.vesselIds ?? [])];
    battles.push({ id: p.battleId, kind: loc.point ? 'DSCS' : (loc.planetId ? 'EAH' : '?'), raiders: raid.filter((x) => ids.includes(x.v.id)).map((x) => x.v.name),
      winner: p.result.winner, retreated: p.result.retreated ?? null, t: +(ts.gameTime - 100).toFixed(3) });
  });
  for (let i = 0; i < frames; i++) { clock.now += 16; ts.update(16); }
  globalThis.setTimeout = realSetTimeout;
  const ids = battles.map((b) => b.id);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  const perRaider = Object.fromEntries(raid.map((x) => [x.v.name, battles.filter((b) => b.raiders.includes(x.v.name)).map((b) => b.kind)]));
  const double = Object.entries(perRaider).filter(([, k]) => k.includes('DSCS') && k.includes('EAH')).map(([n]) => n);
  return { orders: raid.map((x) => x.order?.ok ?? x.order), battles, dupIds, perRaider, doubleResolved: double,
    raiderState: raid.map((x) => ({ n: x.v.name, wreck: !!x.v.isWreck, st: x.v.position.state, at: x.v.position.dockedAt ?? null })),
    defenders: defs.map((v) => ({ n: v.name, wreck: !!v.isWreck })) };
}

for (const sc of [
  { name: '1 rajder vs 2 okręty na orbicie celu', defenders: 2, raiders: 1 },
  { name: '2 rajderów vs 1 okręt', defenders: 1, raiders: 2 },
  { name: '3 rajderów vs 3 okręty', defenders: 3, raiders: 3 },
  { name: 'rajder bez obrońców w przestrzeni (kontrola: tylko EAH)', defenders: 0, raiders: 1 },
]) {
  const r = run(sc);
  console.log(`\n== ${sc.name}`);
  console.log(JSON.stringify({ orders: r.orders, battles: r.battles, dupIds: r.dupIds, doubleResolved: r.doubleResolved, raiders: r.raiderState, defenders: r.defenders }));
}
