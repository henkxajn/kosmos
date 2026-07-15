// S3.4c Z8 — smoke: PEŁNY CYKL osierocenie ↔ adopcja stacji (bug: re-adopcja sieroty nie działała).
// Uruchom: node src/testing/smoke/s34c_z8_readoption_smoke.mjs
// Repro Filipa: sierota (destroyColony) → fillDepot lokalny → NOWA kolonia na tym samym ciele →
// (BUG) depotDetached blokował proxy+drain mimo żywej matki. Z8: adopcja NA ŻYWO (colony:founded) +
// przy restore czyści flagę, re-stampuje owner, drenuje lokalny depot → kolonia (idempotentnie).

globalThis.window = globalThis.window ?? { KOSMOS: {} };
globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? {};
globalThis.localStorage = globalThis.localStorage ?? {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, v); },
  removeItem(k) { this._m.delete(k); },
};

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

const { Station } = await import('../../entities/Station.js');
const { resolveHomeColony, resolveReadoptionColony } = await import('../../utils/TransferStore.js');
const EntityManager = (await import('../../core/EntityManager.js')).default;
const EventBus = (await import('../../core/EventBus.js')).default;
const { StationSystem } = await import('../../systems/StationSystem.js');

function makeFakeRS(init = {}) {
  const inventory = new Map(Object.entries(init));
  return {
    inventory,
    getAmount: (id) => inventory.get(id) ?? 0,
    receive(g) { for (const [k, v] of Object.entries(g)) if (v > 0) inventory.set(k, (inventory.get(k) ?? 0) + v); },
    spend(c) {
      for (const [k, v] of Object.entries(c)) if ((inventory.get(k) ?? 0) < v) return false;
      for (const [k, v] of Object.entries(c)) inventory.set(k, (inventory.get(k) ?? 0) - v);
      return true;
    },
  };
}
const colonies = new Map();
function setColony(planetId, { systemId = 'sys_home', ownerEmpireId = null, init = {} } = {}) {
  const col = { planetId, systemId, ownerEmpireId, resourceSystem: makeFakeRS(init) };
  colonies.set(planetId, col);
  return col;
}
window.KOSMOS.colonyManager = {
  getColony: (id) => colonies.get(id) ?? null,
  getColoniesInSystem: (sysId) => [...colonies.values()].filter(c => (c.systemId ?? 'sys_home') === sysId),
};

const sys = new StationSystem();

// ══ 1. Matka żywa → osierocenie (destroyColony) → fillDepot lokalny ═════════════════════════════════
colonies.clear(); EntityManager.clear?.();
const mother = setColony('entity_2', { init: { Fe: 100 } });
const st = new Station({ id: 'st_z8', name: 'Z8', bodyId: 'entity_2', systemId: 'sys_home', ownerColonyId: 'entity_2' });
EntityManager.add(st);
T('1.1 matka rozwiązana (proxy do kolonii)', resolveHomeColony(st) === mother);
T('1.2 depot deleguje do kolonii (Fe 100)', st.depot.getAmount('Fe') === 100);

// destroyColony: usuń matkę z rejestru, POTEM emit (kolejność jak ColonyManager.removeColony)
colonies.delete('entity_2');
EventBus.emit('colony:destroyed', { planetId: 'entity_2' });
T('1.3 osierocona (depotDetached)', st.depotDetached === true);
T('1.4 proxy → własny (pusty) depot', st.depot.getAmount('Fe') === 0);

// fillDepot lokalny (Fe 5000, Ti 1000) — trafia do własnej Mapy (detached)
st.depot.receive({ Fe: 5000, Ti: 1000 });
T('1.5 fillDepot → własna Mapa', st.depot._ownInventory.get('Fe') === 5000 && st.depot._ownInventory.get('Ti') === 1000);

// ══ 2. NOWA kolonia na tym samym ciele → ADOPCJA NA ŻYWO (bez restore, bez F5) ═══════════════════════
const reborn = setColony('entity_2', { init: {} });   // ta sama planetId (ciało reużyte)
T('2.0 przed adopcją resolveReadoptionColony widzi matkę (ignoruje flagę)', resolveReadoptionColony(st) === reborn);
EventBus.emit('colony:founded', { colony: reborn });   // ← trigger adopcji (StationSystem._onColonyFounded)
T('2.1 Z8a: depotDetached wyczyszczony', st.depotDetached === false);
T('2.2 Z8: ownerColonyId re-stampowany (entity_2)', st.ownerColonyId === 'entity_2');
T('2.3 Z8c: lokalny depot ZDRENOWANY do nowej matki (Fe 5000)', reborn.resourceSystem.getAmount('Fe') === 5000);
T('2.4 Z8c: drain przelał też Ti', reborn.resourceSystem.getAmount('Ti') === 1000);
T('2.5 własna Mapa pusta po drainie', st.depot._ownInventory.size === 0);
T('2.6 proxy routuje do nowej matki (getAmount Fe)', st.depot.getAmount('Fe') === 5000);
T('2.7 resolveHomeColony = nowa matka (nie null)', resolveHomeColony(st) === reborn);

// ══ 3. Idempotencja: kolejny colony:founded NIE drenuje drugi raz ════════════════════════════════════
EventBus.emit('colony:founded', { colony: reborn });
T('3.1 drugi colony:founded = no-op (Fe nadal 5000)', reborn.resourceSystem.getAmount('Fe') === 5000);
T('3.2 nadal nie-detached', st.depotDetached === false);

// ══ 4. Round-trip serialize→restore: stan trwały, drain przy restore = no-op ═════════════════════════
const ser = sys.serialize().find(r => r.id === 'st_z8');
T('4.1 serialize: depotDetached false', ser.depotDetached === false);
T('4.2 serialize: depot {} (proxy do kolonii)', JSON.stringify(ser.depot) === '{}');
T('4.3 serialize: ownerColonyId entity_2', ser.ownerColonyId === 'entity_2');
EntityManager.remove('st_z8');
sys.restore([ser]);   // kolonia entity_2 nadal żyje w rejestrze
const stR = EntityManager.get('st_z8');
T('4.4 restore: nie-detached', stR.depotDetached === false);
T('4.5 restore: proxy do kolonii (Fe 5000)', stR.depot.getAmount('Fe') === 5000);
T('4.6 restore drain = no-op (Fe nadal 5000, brak dublowania)', reborn.resourceSystem.getAmount('Fe') === 5000);

// ══ 5. Adopcja przy RESTORE (matka wróciła przed reloadem — repro z F5) ══════════════════════════════
colonies.clear(); EntityManager.clear?.();
const m5 = setColony('entity_9', { init: {} });   // kolonia na ciele PRZED restore
// stacja zapisana jako sierota z lokalną zawartością (fillDepot przed założeniem kolonii)
sys.restore([{ id: 'st_f5', name: 'F5', bodyId: 'entity_9', systemId: 'sys_home',
  ownerColonyId: 'entity_9', depotDetached: true, depot: { Cu: 800 } }]);
const st5 = EntityManager.get('st_f5');
T('5.1 restore adoptuje (depotDetached false)', st5.depotDetached === false);
T('5.2 restore drenuje lokalny depot → kolonia (Cu 800)', m5.resourceSystem.getAmount('Cu') === 800);
T('5.3 proxy routuje do kolonii', st5.depot.getAmount('Cu') === 800);

console.log(`\nS3.4c Z8 (re-adopcja sieroty) smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
process.exit(fail ? 1 : 0);
