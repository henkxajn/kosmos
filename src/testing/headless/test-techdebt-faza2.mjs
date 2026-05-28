// ═══════════════════════════════════════════════════════════════
// TechDebt Faza 2 smoke — A (#15 mosty tech) + B (filtr same-empire)
// Uruchom: node src/testing/headless/test-techdebt-faza2.mjs
// ───────────────────────────────────────────────────────────────
// A: izolacja per-empire tech — kod liczący dla AI MUSI czytać tech imperium,
//    nie globalny tech gracza (window.KOSMOS.techSystem).
//    Most 3 (VesselManager._techForVessel), Most 4 (CivilianTradeSystem.
//    _isRecipeAvailableFor), Most 5 (RandomEventSystem._getColonyDefenseReduction)
//    nie używają `this` → testujemy na prototypie z mockami.
//    Most 1/2 (FactorySystem _getOwnerColony, BuildingSystem this.techSystem) —
//    pokryte żywą grą + istniejącą regresją (precedens _getOwnerColony).
// B: filtr same-empire per-PARA w _calcAllConnections (null/undefined normalizacja).
// Per [[live-game-mandatory-gate]] — smoke to gate logiki; żywa gra OBOWIĄZKOWA osobno.
// ═══════════════════════════════════════════════════════════════

import './env.js';
import { VesselManager } from '../../systems/VesselManager.js';
import { CivilianTradeSystem } from '../../systems/CivilianTradeSystem.js';
import { RandomEventSystem } from '../../systems/RandomEventSystem.js';
import { COMMODITIES } from '../../data/CommoditiesData.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
};

// Stub: tech gracza (global) vs tech imperium AI (anchor stolicy).
const playerTech = { __id: 'player',  getShipSpeedMultiplier: () => 1.3, getFuelEfficiency: () => 0.7, isResearched: () => true };
const aiTech     = { __id: 'ai_emp_A', getShipSpeedMultiplier: () => 1.0, getFuelEfficiency: () => 1.0, isResearched: () => false };
window.KOSMOS = {
  techSystem: playerTech,
  empireColonyBootstrap: { _findEmpireTechSystem: (id) => (id === 'emp_A' ? aiTech : null) },
};

// ═══════════════════════════════════════════════════════════════
// Most 3 — VesselManager._techForVessel (nie używa this → prototyp)
// ═══════════════════════════════════════════════════════════════
console.log('--- Most 3: VesselManager._techForVessel (vessel → empire tech) ---');
const tfv = VesselManager.prototype._techForVessel;
ok('gracz (ownerEmpireId null) → globalny tech gracza',     tfv.call(null, { ownerEmpireId: null }) === playerTech);
ok('gracz (ownerEmpireId undefined) → globalny tech gracza', tfv.call(null, {}) === playerTech);
ok('AI emp_A → aiTech imperium (NIE gracza)',                tfv.call(null, { ownerEmpireId: 'emp_A' }) === aiTech);
ok('AI emp_A tech != gracz tech (izolacja)',                 tfv.call(null, { ownerEmpireId: 'emp_A' }) !== tfv.call(null, { ownerEmpireId: null }));
const ghostTech = tfv.call(null, { ownerEmpireId: 'emp_ghost' });
ok('AI bez stolicy (emp_ghost) → null (fail-closed)',        ghostTech === null);
// Ryzyko Filipa: helper null → call-site MUSI dać BASE bez crasha (?? fallback)
ok('null tech → speedMult BASE 1 (bez crasha)',  (ghostTech?.getShipSpeedMultiplier?.() ?? 1) === 1);
ok('null tech → fuelEff BASE 1.0 (bez crasha)',  (ghostTech?.getFuelEfficiency?.() ?? 1.0) === 1.0);

// ═══════════════════════════════════════════════════════════════
// Most 4 — CivilianTradeSystem._isRecipeAvailableFor (per-empire tech)
// ═══════════════════════════════════════════════════════════════
console.log('--- Most 4: _isRecipeAvailableFor (recepta wg tech imperium) ---');
const recipeFn = CivilianTradeSystem.prototype._isRecipeAvailableFor;
const gatedGood = Object.keys(COMMODITIES).find(k => COMMODITIES[k]?.requiresTech);
const basicGood = Object.keys(COMMODITIES).find(k => !COMMODITIES[k]?.requiresTech);
const colNoTech  = { buildingSystem: { techSystem: { isResearched: () => false, isCommodityUnlocked: () => false } } };
const colHasTech = { buildingSystem: { techSystem: { isResearched: () => true,  isCommodityUnlocked: () => false } } };
if (gatedGood) {
  ok(`gated '${gatedGood}': kolonia BEZ tech → niedostępna`, recipeFn.call(null, gatedGood, colNoTech) === false);
  ok(`gated '${gatedGood}': kolonia Z tech → dostępna`,      recipeFn.call(null, gatedGood, colHasTech) === true);
} else {
  ok('SKIP gated good (brak commodity z requiresTech w danych)', true);
}
if (basicGood) {
  ok(`basic '${basicGood}': brak techSystem → dostępna (no requiresTech)`,
     recipeFn.call(null, basicGood, { buildingSystem: { techSystem: null } }) === true);
}

// ═══════════════════════════════════════════════════════════════
// Most 5 — RandomEventSystem._getColonyDefenseReduction (per-empire tech)
// ═══════════════════════════════════════════════════════════════
console.log('--- Most 5: _getColonyDefenseReduction (tech kolonii, nie global) ---');
const defRedFn = RandomEventSystem.prototype._getColonyDefenseReduction;
const colWithTech = { buildingSystem: { _active: new Map(), techSystem: { getDisasterReduction: () => 20 } } };
const colZeroTech = { buildingSystem: { _active: new Map(), techSystem: null } };
ok('kolonia z disasterReduction → redukcja > 0',  defRedFn.call(null, colWithTech) > 0);
ok('kolonia bez tech → redukcja 0 (fail-closed)',  defRedFn.call(null, colZeroTech) === 0);
ok('redukcja czyta tech KOLONII, nie globalu',     defRedFn.call(null, colWithTech) > defRedFn.call(null, colZeroTech));

// ═══════════════════════════════════════════════════════════════
// B — filtr same-empire w _calcAllConnections (per-para, null/undefined)
// ═══════════════════════════════════════════════════════════════
console.log('--- B: filtr same-empire (per-para; null/undefined normalizacja) ---');
const cts = new CivilianTradeSystem({ getAllColonies: () => [] });
cts._getDistance = () => 0;            // neutralizuj dystans
cts._getTradeRange = () => Infinity;   // neutralizuj zasięg
cts._hasBuilding = () => false;        // brak nexus
const P = (id, emp, pros) => ({ planetId: id, ownerEmpireId: emp, prosperitySystem: { prosperity: pros } });
const colonies = [
  P('P1', null,      80),   // gracz
  P('P2', undefined, 20),   // gracz (undefined — test normalizacji ?? null)
  P('A1', 'emp_A',   80),
  P('A2', 'emp_A',   20),
  P('B1', 'emp_B',   50),
];
const conns = cts._calcAllConnections(colonies);
const has = (x, y) => conns.some(c =>
  (c.from.planetId === x && c.to.planetId === y) || (c.from.planetId === y && c.to.planetId === x));
ok('gracz↔gracz (null vs undefined → normalizacja) ZACHOWANE', has('P1', 'P2'));
ok('AI emp_A ↔ emp_A ZACHOWANE',           has('A1', 'A2'));
ok('gracz ↔ AI BLOKOWANE',                 !has('P1', 'A1') && !has('P2', 'A1'));
ok('AI emp_A ↔ emp_B BLOKOWANE',           !has('A1', 'B1') && !has('A2', 'B1'));
ok('zero par cross-empire w wyniku',       conns.every(c => (c.from.ownerEmpireId ?? null) === (c.to.ownerEmpireId ?? null)));

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
