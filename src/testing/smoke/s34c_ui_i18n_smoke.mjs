// S3.4c — smoke: UI i18n + filtr fasad EconomyOverlay (Commit 4, D9).
// Uruchom: node src/testing/smoke/s34c_ui_i18n_smoke.mjs
// Pokrywa: klucze i18n station.sharedStorage/cutOffFromSupply w PL+EN (dwujęzyczność ZAWSZE);
// predykat filtra fasad EconomyOverlay (stacja z matką OUT, sierota IN) — reguła resolveHomeColony.

globalThis.window = globalThis.window ?? { KOSMOS: {} };
globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? {};

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

const pl = (await import('../../i18n/pl.js')).default;
const en = (await import('../../i18n/en.js')).default;
const { Station } = await import('../../entities/Station.js');
const { resolveHomeColony } = await import('../../utils/TransferStore.js');

// ══ 1. Klucze i18n obecne w OBU locale (dwujęzyczność ZAWSZE) ═══════════════════════════════════════
const KEYS = ['station.sharedStorage', 'station.cutOffFromSupply'];
for (const k of KEYS) {
  T(`1.x PL zawiera ${k}`, typeof pl[k] === 'string' && pl[k].length > 0);
  T(`1.x EN zawiera ${k}`, typeof en[k] === 'string' && en[k].length > 0);
  T(`1.x ${k} PL≠EN (przetłumaczone)`, pl[k] !== en[k]);
}

// ══ 2. Predykat filtra fasad EconomyOverlay (D9): matka OUT, sierota IN ══════════════════════════════
const colonies = new Map();
colonies.set('planet_home', { planetId: 'planet_home', systemId: 'sys_home', resourceSystem: { inventory: new Map(), receive() {}, spend() { return true; }, getAmount: () => 0 } });
window.KOSMOS.colonyManager = {
  getColony: (id) => colonies.get(id) ?? null,
  getColoniesInSystem: (sysId) => [...colonies.values()].filter(c => (c.systemId ?? 'sys_home') === sysId),
};

const stMother = new Station({ id: 'st_m', bodyId: 'planet_home', ownerColonyId: 'planet_home', systemId: 'sys_home' });
const stOrphan = new Station({ id: 'st_o', bodyId: 'asteroid_x', systemId: 'sys_deep' });
const facadeIncluded = (s) => s.ownerEmpireId === 'player' && resolveHomeColony(s) === null;   // reguła _playerStationFacades
T('2.1 stacja z matką WYKLUCZONA z fasad EconomyOverlay', facadeIncluded(stMother) === false);
T('2.2 sierota WŁĄCZONA do fasad (własny depot)', facadeIncluded(stOrphan) === true);

// osierocona (depotDetached) — traktowana jak sierota (własny depot) → fasada IN
const stDetached = new Station({ id: 'st_d', bodyId: 'planet_home', ownerColonyId: 'planet_home', systemId: 'sys_home', depotDetached: true });
T('2.3 osierocona (detached) WŁĄCZONA do fasad', facadeIncluded(stDetached) === true);

console.log(`\nS3.4c Commit 4 (UI + i18n) smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
process.exit(fail ? 1 : 0);
