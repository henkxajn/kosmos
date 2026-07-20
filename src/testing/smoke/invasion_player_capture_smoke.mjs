// Player-side conquest — smoke: gracz przejmuje ciało AI po desancie.
// Uruchom: node src/testing/smoke/invasion_player_capture_smoke.mjs
// Dowodzi:
//   (A) ColonyManager.captureColonyForPlayer — odwrotność transferColony: kolonia
//       ZOSTAJE w _colonies, zdejmuje ownerEmpireId/isTestEnemy, czyści "[WRÓG]",
//       przełącza hexy na gracza, wypina z EmpireRegistry, emituje eventy.
//   (B) InvasionSystem._onPlayerBuildingCaptured — trigger na groundUnit:buildingCaptured:
//       kapitał owned by player (pełna kolonia) LUB brak stolicy (outpost) + zero
//       żywych wrogich jednostek naziemnych → captureColonyForPlayer.
// Wzorzec setupu: s34c_z9_transfer_dispose_smoke.mjs.

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

const EventBus = (await import('../../core/EventBus.js')).default;
const cmMod = await import('../../systems/ColonyManager.js');
const ColonyManager = cmMod.ColonyManager ?? cmMod.default;
const invMod = await import('../../systems/InvasionSystem.js');
const InvasionSystem = invMod.InvasionSystem ?? invMod.default;
// EntityManager potrzebny wewnątrz captureColonyForPlayer (systemId planety) — pusty rejestr OK (get→null).

// ── Helpery ──────────────────────────────────────────────────────────
const makeGrid = (tiles) => ({ toArray: () => tiles });
function makeEnemyColony(planetId, { isOutpost = false, withCapital = true, capitalOwner = 'empire_ai', name } = {}) {
  const tiles = [];
  if (withCapital) tiles.push({ q: 0, r: 0, capitalBase: true, owner: capitalOwner, buildingId: 'colony_base' });
  tiles.push({ q: 1, r: 0, capitalBase: false, owner: 'empire_ai', buildingId: 'solar_farm' });
  tiles.push({ q: 2, r: 0, capitalBase: false, owner: 'empire_ai', buildingId: 'mine' });
  let reapplied = false;
  return {
    planetId,
    name: name ?? `${planetId} [WRÓG]`,
    systemId: 'sys_home',
    isHomePlanet: false,
    isOutpost,
    ownerEmpireId: 'empire_ai',
    isTestEnemy: true,
    grid: makeGrid(tiles),
    buildingSystem: { _reapplyAllRates() { reapplied = true; } },
    _reappliedRef: () => reapplied,
  };
}

// Mock EmpireRegistry + GroundUnitManager + galaxyData
let removedFrom = null, removedId = null;
window.KOSMOS.empireRegistry = {
  removeColony: (empId, colId) => { removedFrom = empId; removedId = colId; return true; },
};
window.KOSMOS.galaxyData = { systems: [{ id: 'sys_home', empireId: 'empire_ai' }] };
const gumUnits = {};
window.KOSMOS.groundUnitManager = { getUnitsOnPlanet: (pid) => gumUnits[pid] ?? [] };
window.KOSMOS.civMode = true;

const techMock = { isResearched: () => true };
const cm = new ColonyManager(techMock);
window.KOSMOS.colonyManager = cm;
new InvasionSystem();  // subskrybuje groundUnit:buildingCaptured

// Kolektory eventów
let capturedByPlayer = null, listChanged = 0;
EventBus.on('colony:capturedByPlayer', (e) => { capturedByPlayer = e; });
EventBus.on('colony:listChanged', () => { listChanged++; });

// ══ A. captureColonyForPlayer bezpośrednio ═════════════════════════════════════════════════════════
const colA = makeEnemyColony('p_direct', { name: 'Nowa Ziemia [WRÓG]' });
cm._colonies.set('p_direct', colA);
capturedByPlayer = null; listChanged = 0; removedFrom = null; removedId = null;

const okA = cm.captureColonyForPlayer('p_direct', 'ground_invasion');
T('A1 zwraca true', okA === true);
T('A2 kolonia ZOSTAJE w _colonies', cm._colonies.has('p_direct'));
T('A3 ownerEmpireId wyczyszczony', colA.ownerEmpireId === null);
T('A4 isTestEnemy wyczyszczony', colA.isTestEnemy === false);
T('A5 znacznik [WRÓG] usunięty z nazwy', colA.name === 'Nowa Ziemia');
T('A6 wszystkie hexy przełączone na gracza', colA.grid.toArray().every(t => t.owner === 'player'));
T('A7 _reapplyAllRates wywołany', colA._reappliedRef() === true);
T('A8 wypięto z EmpireRegistry (removeColony)', removedFrom === 'empire_ai' && removedId === 'p_direct');
T('A9 galaxyData.empireId wyczyszczony', window.KOSMOS.galaxyData.systems[0].empireId === null);
T('A10 colony:capturedByPlayer wyemitowany', capturedByPlayer?.planetId === 'p_direct');
T('A11 payload previousOwner=empire_ai', capturedByPlayer?.previousOwner === 'empire_ai');
T('A12 payload isOutpost=false', capturedByPlayer?.isOutpost === false);
T('A13 colony:listChanged wyemitowany', listChanged >= 1);
T('A14 getPlayerColonies() teraz widzi ciało', cm.getPlayerColonies().some(c => c.planetId === 'p_direct'));

// Idempotencja — druga próba na już-gracza
const okA2 = cm.captureColonyForPlayer('p_direct');
T('A15 druga próba (już gracza) zwraca false', okA2 === false);

// ══ B. Trigger przez groundUnit:buildingCaptured (InvasionSystem) ══════════════════════════════════

// B-1: pełna kolonia, kapitał NIE przejęty (owner=empire) → BRAK podboju
const colB1 = makeEnemyColony('p_b1', { capitalOwner: 'empire_ai' });
cm._colonies.set('p_b1', colB1);
gumUnits['p_b1'] = [];
EventBus.emit('groundUnit:buildingCaptured', { planetId: 'p_b1', q: 1, r: 0, buildingId: 'mine', newOwner: 'player' });
T('B1 kapitał wroga → brak podboju (nadal AI)', colB1.ownerEmpireId === 'empire_ai');

// B-2: pełna kolonia, kapitał gracza, ale wrogie wojsko ŻYJE → BRAK podboju
const colB2 = makeEnemyColony('p_b2', { capitalOwner: 'player' });
cm._colonies.set('p_b2', colB2);
gumUnits['p_b2'] = [{ owner: 'empire_ai', hp: 12 }];
EventBus.emit('groundUnit:buildingCaptured', { planetId: 'p_b2', q: 0, r: 0, buildingId: 'colony_base', newOwner: 'player' });
T('B2 żywy obrońca → brak podboju (nadal AI)', colB2.ownerEmpireId === 'empire_ai');

// B-3: pełna kolonia, kapitał gracza, brak żywych wrogów (są martwi) → PODBÓJ
const colB3 = makeEnemyColony('p_b3', { capitalOwner: 'player' });
cm._colonies.set('p_b3', colB3);
gumUnits['p_b3'] = [{ owner: 'empire_ai', hp: 0 }, { owner: 'player', hp: 8 }];
EventBus.emit('groundUnit:buildingCaptured', { planetId: 'p_b3', q: 0, r: 0, buildingId: 'colony_base', newOwner: 'player' });
T('B3 kapitał gracza + brak żywych wrogów → podbój', colB3.ownerEmpireId === null);

// B-4: outpost BEZ stolicy, brak wrogów → PODBÓJ (fallback)
const colB4 = makeEnemyColony('p_b4', { isOutpost: true, withCapital: false });
cm._colonies.set('p_b4', colB4);
gumUnits['p_b4'] = [];
EventBus.emit('groundUnit:buildingCaptured', { planetId: 'p_b4', q: 1, r: 0, buildingId: 'mine', newOwner: 'player' });
T('B4 outpost bez stolicy + brak wrogów → podbój', colB4.ownerEmpireId === null);
T('B4b outpost payload isOutpost=true', capturedByPlayer?.planetId === 'p_b4' && capturedByPlayer?.isOutpost === true);

// B-5: newOwner != player (AI zdobywa własny budynek) → ignorowane
const colB5 = makeEnemyColony('p_b5', { capitalOwner: 'empire_ai' });
cm._colonies.set('p_b5', colB5);
gumUnits['p_b5'] = [];
EventBus.emit('groundUnit:buildingCaptured', { planetId: 'p_b5', q: 0, r: 0, buildingId: 'colony_base', newOwner: 'empire_ai' });
T('B5 newOwner=empire → brak reakcji', colB5.ownerEmpireId === 'empire_ai');

console.log(`\nInvasion player-capture smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
process.exit(fail ? 1 : 0);
