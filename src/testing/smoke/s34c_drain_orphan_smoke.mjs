// S3.4c — smoke: drain depotu przy restore + osierocenie po colony:destroyed (Commit 2, D3+D5).
// Uruchom: node src/testing/smoke/s34c_drain_orphan_smoke.mjs
// Pokrywa: drain zawartości starego depotu → kolonia-matka (idempotentny); drain fuel/warp_cores (D4);
// stamp normalizacyjny ownerColonyId; osierocenie po colony:destroyed (własny depot, moduły bez matki);
// depotDetached round-trip; sierota NIETKNIĘTA przy restore.

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
const { resolveHomeColony } = await import('../../utils/TransferStore.js');
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

// ══ 1. Drain przy restore → magazyn kolonii-matki (surowa Mapa z save) ═══════════════════════════════
colonies.clear();
EntityManager.clear?.();
const home = setColony('planet_home', { init: { Fe: 10 } });
// symulacja restore: encja z depot (save flat map) + stamp matki
const stSave = {
  id: 'st_drain', name: 'D', bodyId: 'planet_home', systemId: 'sys_home', ownerColonyId: 'planet_home',
  depot: { Fe: 100, Ti: 50, fuel: 30, warp_cores: 2 },
};
sys.restore([stSave]);
const st1 = EntityManager.get('st_drain');
T('1.1 encja odtworzona', !!st1 && st1.type === 'station');
T('1.2 drain przelał Fe do kolonii (10+100)', home.resourceSystem.getAmount('Fe') === 110);
T('1.3 drain przelał Ti', home.resourceSystem.getAmount('Ti') === 50);
T('1.4 drain przelał fuel (D4 wspólny pool)', home.resourceSystem.getAmount('fuel') === 30);
T('1.5 drain przelał warp_cores (D4)', home.resourceSystem.getAmount('warp_cores') === 2);
T('1.6 własny depot pusty po drainie', st1.depot._ownInventory.size === 0);
T('1.7 depot.serialize() = {} (proxy do kolonii)', JSON.stringify(st1.depot.serialize()) === '{}');

// ══ 2. Drain IDEMPOTENTNY — drugi przebieg nie dubluje ══════════════════════════════════════════════
sys._normalizeAndDrainDepot(st1);
T('2.1 drugi drain NIE dubluje Fe (nadal 110)', home.resourceSystem.getAmount('Fe') === 110);
sys._normalizeAndDrainDepot(st1);
T('2.2 trzeci drain NIE dubluje', home.resourceSystem.getAmount('Fe') === 110 && home.resourceSystem.getAmount('fuel') === 30);

// ══ 3. Stamp normalizacyjny dla starego save (ownerColonyId brak → stamp z fallbacku) ═══════════════
colonies.clear();
EntityManager.clear?.();
const colB = setColony('planet_b', { init: {} });
sys.restore([{ id: 'st_nostamp', name: 'N', bodyId: 'planet_b', systemId: 'sys_home', depot: { Cu: 40 } }]);
const st3 = EntityManager.get('st_nostamp');
T('3.1 stamp ownerColonyId ustawiony z fallbacku per-body', st3.ownerColonyId === 'planet_b');
T('3.2 zawartość starego depotu przelana do kolonii', colB.resourceSystem.getAmount('Cu') === 40);

// ══ 4. Sierota NIETKNIĘTA przy restore (brak matki → własny depot z zawartością) ═════════════════════
colonies.clear();
EntityManager.clear?.();
sys.restore([{ id: 'st_lone', name: 'L', bodyId: 'asteroid_z', systemId: 'sys_far', depot: { Fe: 77 } }]);
const st4 = EntityManager.get('st_lone');
T('4.1 sierota zachowuje własny depot', st4.depot.getAmount('Fe') === 77);
T('4.2 sierota serialize płaski (własna Mapa)', JSON.stringify(st4.depot.serialize()) === JSON.stringify({ Fe: 77 }));
T('4.3 sierota resolveHomeColony null', resolveHomeColony(st4) === null);

// ══ 5. Osierocenie po colony:destroyed (D5) — stacja żyje, przełącza na własny depot ════════════════
colonies.clear();
EntityManager.clear?.();
const colH = setColony('planet_home', { init: { Fe: 500 } });
const st5 = new Station({ id: 'st_orph', name: 'O', bodyId: 'planet_home', systemId: 'sys_home', ownerColonyId: 'planet_home' });
EntityManager.add(st5);
T('5.1 przed zniszczeniem: matka rozwiązana', resolveHomeColony(st5) === colH);
T('5.2 przed: depot deleguje (Fe z kolonii)', st5.depot.getAmount('Fe') === 500);
// symuluj zniszczenie kolonii: usuń z rejestru, POTEM emit (kolejność jak ColonyManager.removeColony)
colonies.delete('planet_home');
EventBus.emit('colony:destroyed', { planetId: 'planet_home' });
T('5.3 stacja NIE zniszczona (żyje)', !!EntityManager.get('st_orph'));
T('5.4 depotDetached = true', st5.depotDetached === true);
T('5.5 resolveHomeColony null po osieroceniu', resolveHomeColony(st5) === null);
T('5.6 depot używa własnej (pustej) Mapy — moduły bez zaopatrzenia', st5.depot.getAmount('Fe') === 0 && st5.depot._ownInventory.size === 0);
st5.depot.receive({ Fe: 5 });
T('5.7 receive po osieroceniu trafia do własnej Mapy', st5.depot._ownInventory.get('Fe') === 5);

// ══ 6. Osierocenie NIE re-mothers do rodzeństwa w systemie ══════════════════════════════════════════
colonies.clear();
EntityManager.clear?.();
setColony('planet_a', { systemId: 'sys_x', init: {} });
const colSib = setColony('planet_sib', { systemId: 'sys_x', init: {} });
const st6 = new Station({ id: 'st_sib', name: 'S', bodyId: 'planet_a', systemId: 'sys_x', ownerColonyId: 'planet_a' });
EntityManager.add(st6);
colonies.delete('planet_a');
EventBus.emit('colony:destroyed', { planetId: 'planet_a' });
T('6.1 osierocona mimo rodzeństwa w systemie (depotDetached)', st6.depotDetached === true);
T('6.2 NIE re-mothered do planet_sib', resolveHomeColony(st6) === null && resolveHomeColony(st6) !== colSib);

// ══ 7. depotDetached round-trip (save v90) + Z8 ADOPCJA przy restore (matka wróciła na ciało) ════════
colonies.clear();
EntityManager.clear?.();
// stacja osierocona z własną zawartością → serialize → restore GDY kolonia jest na bodyId → adopcja (Z8b).
const st7 = new Station({ id: 'st_rt', name: 'RT', bodyId: 'planet_x', systemId: 'sys_home', depotDetached: true, depot: { Fe: 20 } });
EntityManager.add(st7);
const ser7 = sys.serialize().find(r => r.id === 'st_rt');
T('7.1 serialize zawiera depotDetached', ser7 && ser7.depotDetached === true);
T('7.2 serialize depot płaski (własna Mapa)', ser7 && JSON.stringify(ser7.depot) === JSON.stringify({ Fe: 20 }));
EntityManager.remove('st_rt');
const colX = setColony('planet_x', { init: {} });   // Z8: kolonia na bodyId → restore ADOPTUJE (per-body link)
sys.restore([ser7]);
const st7r = EntityManager.get('st_rt');
T('7.3 Z8: restore ADOPTUJE (depotDetached wyczyszczony)', st7r.depotDetached === false);
T('7.4 Z8: lokalny depot ZDRENOWANY do kolonii (własna Mapa pusta)', st7r.depot._ownInventory.size === 0);
T('7.5 Z8: kolonia na bodyId DOSTAŁA zawartość (Fe 20)', colX.resourceSystem.getAmount('Fe') === 20);
T('7.6 Z8: proxy routuje do kolonii po adopcji', st7r.depot.getAmount('Fe') === 20);
sys._normalizeAndDrainDepot(st7r);   // drugi drain
T('7.7 Z8: drugi drain przy restore = no-op (idempotencja)', colX.resourceSystem.getAmount('Fe') === 20);

// ══ 8. Regresja (e): sierota BEZ kolonii-matki → restore NIE adoptuje (zostaje detached) ═════════════
colonies.clear();
EntityManager.clear?.();
// detached, ownerColonyId wskazuje na martwą kolonię, brak kolonii na bodyId/parent — brak SILNEGO linku.
const st8 = new Station({ id: 'st_noadopt', name: 'NA', bodyId: 'asteroid_q', systemId: 'sys_far',
  ownerColonyId: 'dead_colony', depotDetached: true, depot: { Ti: 33 } });
EntityManager.add(st8);
const ser8 = sys.serialize().find(r => r.id === 'st_noadopt');
EntityManager.remove('st_noadopt');
setColony('planet_elsewhere', { systemId: 'sys_far', init: {} });   // niepowiązana kolonia w tym samym systemie
sys.restore([ser8]);
const st8r = EntityManager.get('st_noadopt');
T('8.1 brak silnego linku → zostaje detached', st8r.depotDetached === true);
T('8.2 własny depot nietknięty (Ti 33)', st8r.depot.getAmount('Ti') === 33);
T('8.3 niepowiązana kolonia w systemie NIE adoptuje (D5, bez single-in-system)', st8r.depot._ownInventory.get('Ti') === 33);

console.log(`\nS3.4c Commit 2 (drain + orphan) smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
process.exit(fail ? 1 : 0);
