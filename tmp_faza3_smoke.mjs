// ═══════════════════════════════════════════════════════════════
// Smoke — TechDebt Faza 3 (#4 survival guard, #5 Snapshot byType, #6 gross/net)
// Uruchom: node tmp_faza3_smoke.mjs
// ═══════════════════════════════════════════════════════════════
import './src/testing/headless/env.js';
import { capture } from './src/testing/headless/Snapshot.js';
import { ResourceSystem } from './src/systems/ResourceSystem.js';
import { ColonyAutoExpander } from './src/systems/ColonyAutoExpander.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
};

// ── #5: Snapshot.vessels.byType (grupowanie po shipId) ───────────
console.log('--- #5: Snapshot vessels.byType ---');
{
  const fakeCore = {
    vesselManager: {
      getAllVessels: () => [
        { shipId: 'hull_small', status: 'in_transit' },
        { shipId: 'hull_small', status: 'docked' },
        { shipId: 'cargo_ship', status: 'orbiting' },
        { status: 'docked' },   // brak shipId → bucket 'unknown'
      ],
    },
  };
  const snap = capture(fakeCore);
  ok('vessels.total === 4', snap.vessels.total === 4);
  ok('vessels.byType to obiekt', !!snap.vessels.byType && typeof snap.vessels.byType === 'object');
  ok('byType.hull_small === 2', snap.vessels.byType.hull_small === 2);
  ok('byType.cargo_ship === 1', snap.vessels.byType.cargo_ship === 1);
  ok('byType.unknown === 1 (brak shipId)', snap.vessels.byType.unknown === 1);
}

// ── #6: ResourceSystem brutto (getGrossPerYear) vs netto (getPerYear) ──
console.log('--- #6: ResourceSystem brutto vs netto ---');
{
  const rs = new ResourceSystem({});
  rs._producers.set('farm', { food: 10 });
  rs._producers.set('civilization_consumption', { food: -7 });
  rs._recalcPerYear();
  ok('netto food === 3 (10 − 7)', rs.getPerYear('food') === 3);
  ok('brutto food === 10 (tylko produkcja)', rs.getGrossPerYear('food') === 10);

  // KLUCZ #6: bilans zero (prod==kons) → netto 0, brutto 10 (NIE "brak produkcji")
  rs._producers.set('civilization_consumption', { food: -10 });
  rs._recalcPerYear();
  ok('netto food === 0 (bilans)', rs.getPerYear('food') === 0);
  ok('brutto food === 10 mimo netto=0 (rozróżnienie!)', rs.getGrossPerYear('food') === 10);

  // Prawdziwy brak produkcji: usuń farm → brutto 0
  rs._producers.delete('farm');
  rs._recalcPerYear();
  ok('brutto food === 0 (brak producenta)', rs.getGrossPerYear('food') === 0);
  ok('netto food === -10 (sama konsumpcja)', rs.getPerYear('food') === -10);

  // Faza 3.1 — guard kontraktu getGrossPerYear (doc-only fix)
  ok('getGrossPerYear("food") zwraca Number', typeof rs.getGrossPerYear('food') === 'number');
  ok('getGrossPerYear() bez argumentu === 0 (scalar API, zamierzone)', rs.getGrossPerYear() === 0);
}

// ── #4: _survivalBuildOutcome — mark/clear unreachable ───────────
console.log('--- #4: survival unreachable guard ---');
{
  const expander = new ColonyAutoExpander();
  const colony = { name: 'TestCol', ownerEmpireId: 'emp_x' };
  const CY = 100;

  // 'fail' (np. factory bez metallurgy) → markUnreachable, backoff 30cy
  expander._tryBuild = () => 'fail';
  ok("outcome 'fail'", expander._survivalBuildOutcome(colony, 'factory', CY, 't') === 'fail');
  ok('unreachable @CY', expander._isUnreachable(colony, 'build:factory', CY) === true);
  ok('unreachable @CY+29', expander._isUnreachable(colony, 'build:factory', CY + 29) === true);
  ok('retry window @CY+30 (UNREACHABLE_RETRY_CIVYEARS)', expander._isUnreachable(colony, 'build:factory', CY + 30) === false);

  // 'built' → clearUnreachable
  expander._tryBuild = () => 'built';
  ok("outcome 'built'", expander._survivalBuildOutcome(colony, 'factory', CY + 30, 't') === 'built');
  ok('wyczyszczony po sukcesie', expander._isUnreachable(colony, 'build:factory', CY + 30) === false);

  // 'no_tile' (teren przejściowy, ungated) → NIE markuje unreachable
  expander._tryBuild = () => 'no_tile';
  expander._survivalBuildOutcome(colony, 'solar_farm', CY, 't');
  ok("'no_tile' NIE markuje (ungated bezpieczne)", expander._isUnreachable(colony, 'build:solar_farm', CY) === false);

  expander.stop();
}

console.log(`\n=== FAZA 3 SMOKE: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
