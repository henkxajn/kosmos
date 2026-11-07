// observatory_system_scan_smoke.mjs — keeper: skan obcego układu (backend `ObservatorySystem`) + limit skanów ciał.
// Uruchom: node src/testing/smoke/observatory_system_scan_smoke.mjs
//
// ⚠ PRZENIESIONE 2026-11-07 (ARC GALAXY G5-B, Finding 599): z `tmp_obs_stratcom_scan_smoke.mjs` (katalog główny, poza sweepem). Backend przeżył zakładkę Stratcom: [ Skanuj ] przypięcia gwiazdy w trybie galaktyki woła
//   `startSystemScan` / `cancelSystemScan`, a wynik czytają rozwinięcie i outlinery (`getSystemScanResult`); keepery trybu galaktyki biorą backend z atrapy.
//   Asercje bez zmian; zmienione wyłącznie ścieżki importu (`../../` zamiast `./src/`) i linia podsumowania
//   (format sweepu `=== WYNIK: N PASS / M FAIL ===`).
//
// Testuje REALNĄ logikę ObservatorySystem + SystemGenerator.peekCountsForStar.
//
// T1  getMaxConcurrentBodyScans — Lv0→0, Lv1-2→1, Lv3→2, Lv4+→3
// T2  startBodyScan — egzekwuje limit równoczesnych skanów + reject event + zwolnienie slotu
// T3  getSystemScanTierForLevel — <2→0, 2→1, 3-4→2, 5+→3
// T4  peekCountsForStar — determinizm + spójność z generateForStar
// T5  startSystemScan — bramki (poziom, home, invalid, już-skanowany, w-toku)
// T6  progres + ukończenie skanu → wynik {tier, counts} + event
// T7  upgrade tieru (rescan przy wyższym obserwatorium) + already_scanned
// T8  _countSystemBodies — gałąź EntityManager (układ odwiedzony)
// T9  serialize/restore round-trip skanów układów

// ── Stub browser globals (PRZED importami) ─────────────────────────────
globalThis.localStorage = {
  _store: {}, getItem(k){return this._store[k]??null;}, setItem(k,v){this._store[k]=String(v);}, removeItem(k){delete this._store[k];},
};
globalThis.window = globalThis.window ?? globalThis;
globalThis.window.KOSMOS = { civMode: true, activeSystemId: 'sys_home', timeSystem: { gameTime: 100 } };
globalThis.document = globalThis.document ?? {
  createElement: () => ({ style: {}, appendChild() {}, addEventListener() {}, getContext: () => ({}) }),
};

// ── Imports ───────────────────────────────────────────────────────────
const { ObservatorySystem } = await import('../../systems/ObservatorySystem.js');
const { SystemGenerator }   = await import('../../generators/SystemGenerator.js');
const { GalaxyGenerator }   = await import('../../generators/GalaxyGenerator.js');
const EntityManager         = (await import('../../core/EntityManager.js')).default;
const EventBus              = (await import('../../core/EventBus.js')).default;
const { GAME_CONFIG }       = await import('../../config/GameConfig.js');

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}

// ── Setup galaktyki + mock colonyManager (regulowany poziom obserwatorium) ──
// GALAXY_SEED: jawny seed (int32) zamiast id gwiazdy. 635603635 = hashString('smoke_seed_1'),
// czyli dokładnie ten seed co wcześniej → galaktyka i asercje bez zmian.
const galaxy = GalaxyGenerator.generate(635603635, 'Sol', 'G');
window.KOSMOS.galaxyData = galaxy;
const foreign = galaxy.systems.filter(s => !s.isHome);
const fsA = foreign[0], fsB = foreign[1], fsC = foreign[2];

let _obsLevel = 0;
function setObs(l) { _obsLevel = l; }
window.KOSMOS.colonyManager = {
  activePlanetId: 'home',
  getColony() { return null; },
  getAllColonies() {
    const active = new Map();
    if (_obsLevel > 0) active.set('obs', { building: { id: 'observatory' }, level: _obsLevel });
    return [{
      planetId: 'home', ownerEmpireId: undefined,
      planet: { id: 'home', x: 0, y: 0, systemId: 'sys_home' },
      systemId: 'sys_home',
      buildingSystem: { _active: active },
    }];
  },
};

const obs = new ObservatorySystem();

// ── T1 — getMaxConcurrentBodyScans ──────────────────────────────────────
console.log('T1 — getMaxConcurrentBodyScans wg poziomu');
{
  const exp = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 3, 5: 3, 6: 3 };
  for (const [lvl, e] of Object.entries(exp)) {
    setObs(+lvl);
    assert(obs.getMaxConcurrentBodyScans() === e, `Lv${lvl} → ${obs.getMaxConcurrentBodyScans()} (oczek. ${e})`);
  }
}

// ── T2 — startBodyScan limit ────────────────────────────────────────────
console.log('T2 — startBodyScan egzekwuje limit');
{
  setObs(3);   // limit = 2
  for (const id of ['b1', 'b2', 'b3']) {
    if (!EntityManager.get(id)) EntityManager.add({ id, type: 'planet', systemId: 'sys_home', explored: false });
  }
  let rejected = null;
  const off = EventBus.on('observatory:bodyScanRejected', (d) => { rejected = d; });

  assert(obs.startBodyScan('b1') === true, 'skan 1/2 przyjęty');
  assert(obs.startBodyScan('b2') === true, 'skan 2/2 przyjęty');
  assert(obs.startBodyScan('b3') === false, 'skan 3 odrzucony (limit)');
  assert(rejected?.reason === 'scan_limit' && rejected?.limit === 2, 'event bodyScanRejected {scan_limit, limit:2}');
  assert(obs.getActiveBodyScans().length === 2, 'aktywne skany = 2');

  obs.cancelBodyScan('b1');
  assert(obs.startBodyScan('b3') === true, 'po anulowaniu slot wolny → b3 przyjęty');
  assert(obs.getActiveBodyScans().length === 2, 'aktywne skany dalej = 2');
  // sprzątanie
  obs.cancelBodyScan('b2'); obs.cancelBodyScan('b3');
  if (typeof off === 'function') off();
}

// ── T3 — getSystemScanTierForLevel ──────────────────────────────────────
console.log('T3 — getSystemScanTierForLevel');
{
  const exp = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3 };
  for (const [lvl, e] of Object.entries(exp)) {
    assert(obs.getSystemScanTierForLevel(+lvl) === e, `Lv${lvl} → tier ${obs.getSystemScanTierForLevel(+lvl)} (oczek. ${e})`);
  }
}

// ── T4 — peekCountsForStar determinizm + spójność ───────────────────────
console.log('T4 — peekCountsForStar');
{
  const gen = new SystemGenerator();
  const c1 = gen.peekCountsForStar(fsA);
  const c2 = gen.peekCountsForStar(fsA);
  assert(JSON.stringify(c1) === JSON.stringify(c2), 'ten sam seed → identyczne liczby');
  assert(c1.planets >= 5 && c1.planets <= 11, `planety w zakresie 5-11 (${c1.planets})`);
  assert(c1.total === c1.planets + c1.moons + c1.planetoids + c1.asteroids + c1.comets, 'total = suma składników');

  // Spójność z pełną generacją tej samej gwiazdy (fsC — dedykowana, nie użyta gdzie indziej).
  const cPeek = gen.peekCountsForStar(fsC);
  const full  = gen.generateForStar(fsC);
  assert(cPeek.planets    === full.planets.length,    `peek.planety=${cPeek.planets} == full=${full.planets.length}`);
  assert(cPeek.moons      === full.moons.length,      `peek.księżyce=${cPeek.moons} == full=${full.moons.length}`);
  assert(cPeek.planetoids === full.planetoids.length, `peek.planetoidy=${cPeek.planetoids} == full=${full.planetoids.length}`);
  assert(cPeek.asteroids  === full.asteroids.length,  `peek.asteroidy=${cPeek.asteroids} == full=${full.asteroids.length}`);
  assert(cPeek.comets     === full.comets.length,     `peek.komety=${cPeek.comets} == full=${full.comets.length}`);
}

// ── T5 — startSystemScan bramki ─────────────────────────────────────────
console.log('T5 — startSystemScan bramki');
{
  setObs(1);
  assert(obs.startSystemScan(fsA.id) === false, 'Lv1 (tier0) → odrzucony');
  setObs(2);
  assert(obs.startSystemScan('sys_home') === false, 'home → odrzucony');
  assert(obs.startSystemScan('sys_nieistnieje') === false, 'nieistniejący układ → odrzucony');
  assert(obs.startSystemScan(fsA.id) === true, 'Lv2 obcy układ → start');
  assert(obs.startSystemScan(fsA.id) === false, 'ponowny start w trakcie → odrzucony');
  assert(obs.getSystemScanProgress(fsA.id)?.targetTier === 1, 'targetTier=1 (Lv2)');
  obs.cancelSystemScan(fsA.id);
  assert(obs.getSystemScanProgress(fsA.id) === null, 'po anulowaniu brak progresu');
}

// ── T5b — limit równoczesnych skanów układów (Lv2 → 1) ──────────────────
console.log('T5b — limit równoczesnych skanów układów');
{
  setObs(2);
  assert(obs.getMaxConcurrentSystemScans() === 1, 'Lv2 → limit 1 skan układu');
  assert(obs.startSystemScan(fsA.id) === true, 'skan A start');
  let rej = null;
  const off = EventBus.on('observatory:systemScanRejected', (d) => { rej = d; });
  assert(obs.startSystemScan(fsB.id) === false, 'skan B odrzucony (limit)');
  assert(rej?.reason === 'scan_limit', 'reason scan_limit');
  obs.cancelSystemScan(fsA.id);
  assert(obs.startSystemScan(fsB.id) === true, 'po anulowaniu A → B start');
  obs.cancelSystemScan(fsB.id);
  setObs(3);
  assert(obs.getMaxConcurrentSystemScans() === 2, 'Lv3 → limit 2');
  if (typeof off === 'function') off();
}

// ── T6 — progres + ukończenie (1 rok gry) ───────────────────────────────
console.log('T6 — progres + ukończenie skanu (1 rok gry)');
{
  setObs(2);   // duration = 1.0 roku gry (flat), tier 1
  let scanned = null;
  const off = EventBus.on('observatory:systemScanned', (d) => { scanned = d; });
  assert(obs.startSystemScan(fsB.id) === true, 'start skanu fsB');
  const p0 = obs.getSystemScanProgress(fsB.id);
  assert(p0 && p0.pct === 0, 'pct startowy 0');
  assert(Math.abs(p0.durationYears - 1.0) < 1e-9, 'duration = 1 rok gry');
  obs._tickSystemScans(0.4);   // lata GRY
  assert(obs.getSystemScanProgress(fsB.id).pct > 0.3, 'po 0.4 roku gry pct > 0.3');
  obs._tickSystemScans(0.7);   // 1.1 >= 1.0 → complete
  const res = obs.getSystemScanResult(fsB.id);
  assert(res?.tier === 1 && res.counts?.planets > 0, `wynik tier1, planety=${res?.counts?.planets}`);
  assert(scanned?.systemId === fsB.id && scanned?.tier === 1, 'event systemScanned {fsB, tier1}');
  assert(obs.getSystemScanProgress(fsB.id) === null, 'skan usunięty z aktywnych');
  if (typeof off === 'function') off();
}

// ── T7 — upgrade tieru (rescan) + already_scanned ───────────────────────
console.log('T7 — upgrade tieru przy wyższym obserwatorium');
{
  // fsB ma wynik tier1 (z T6). Lv3 → maxTier 2 → można doskanować.
  setObs(3);
  assert(obs.startSystemScan(fsB.id) === true, 'Lv3: rescan (tier1<2) → start');
  obs._tickSystemScans(10);   // ukończ
  assert(obs.getSystemScanResult(fsB.id).tier === 2, 'po rescanie tier=2');
  assert(obs.getSystemScanResult(fsB.id).counts.moons >= 0, 'counts.moons obecne');

  setObs(5);   // maxTier 3
  assert(obs.startSystemScan(fsB.id) === true, 'Lv5: rescan (tier2<3) → start');
  obs._tickSystemScans(10);
  const r3 = obs.getSystemScanResult(fsB.id);
  assert(r3.tier === 3 && r3.counts.total === r3.counts.planets + r3.counts.moons + r3.counts.planetoids + r3.counts.asteroids + r3.counts.comets, 'tier3: total spójny');

  let rej = null;
  const off = EventBus.on('observatory:systemScanRejected', (d) => { rej = d; });
  assert(obs.startSystemScan(fsB.id) === false, 'Lv5 pełny wynik → odrzucony');
  assert(rej?.reason === 'already_scanned', 'reason already_scanned');
  if (typeof off === 'function') off();
}

// ── T8 — _countSystemBodies gałąź EntityManager ─────────────────────────
console.log('T8 — _countSystemBodies z EntityManager (układ odwiedzony)');
{
  EntityManager.add({ id: 'tp1', type: 'planet', systemId: 'sys_visited' });
  EntityManager.add({ id: 'tp2', type: 'planet', systemId: 'sys_visited' });
  EntityManager.add({ id: 'tm1', type: 'moon',   systemId: 'sys_visited' });
  EntityManager.add({ id: 'tc1', type: 'comet',  systemId: 'sys_visited' });
  const c = obs._countSystemBodies('sys_visited');
  assert(c.planets === 2 && c.moons === 1 && c.comets === 1, `EntityManager: 2 planety/1 księżyc/1 kometa`);
  assert(c.total === 4, 'total=4');
}

// ── T9 — serialize/restore ──────────────────────────────────────────────
console.log('T9 — serialize/restore round-trip');
{
  setObs(2);
  obs.startSystemScan(fsA.id);   // aktywny skan
  const data = obs.serialize();
  assert(!!data.systemScanResults && !!data.systemScans, 'serialize zawiera systemScans + systemScanResults');

  const obs2 = new ObservatorySystem();
  obs2.restore(data);
  assert(JSON.stringify(obs2.getSystemScanResult(fsB.id)) === JSON.stringify(obs.getSystemScanResult(fsB.id)), 'wynik fsB odtworzony');
  assert(obs2.getSystemScanProgress(fsA.id)?.targetTier === 1, 'aktywny skan fsA odtworzony');
}

// ── Podsumowanie ────────────────────────────────────────────────────────
console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
