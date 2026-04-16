// Test Step 7 — Snapshot capture + diff
import './env.js';
import { GameCore } from './GameCore.js';
import { Ticker } from './Ticker.js';
import Snapshot from './Snapshot.js';

console.log('─── Snapshot Test Step 7 ───');

const core = new GameCore();
core.boot({ quiet: true });

const snap0 = Snapshot.capture(core);
console.log('\n── Snapshot @ civYear 0 ──');
console.log(JSON.stringify({
  civYear: snap0.civYear,
  pop: snap0.pop,
  buildingCount: snap0.buildingCount,
  researchedCount: snap0.researchedCount,
  inventoryKeys: Object.keys(snap0.inventory).length,
  empires: snap0.empires.length,
}, null, 2));

// Symulacja 50 civYears
const ticker = new Ticker(core.timeSystem);
ticker.run(50, { tickSize: 1.0 });

const snap50 = Snapshot.capture(core);
console.log('\n── Snapshot @ civYear 50 ──');
console.log(JSON.stringify({
  civYear: snap50.civYear,
  pop: snap50.pop,
  buildingCount: snap50.buildingCount,
  researchedCount: snap50.researchedCount,
  inventoryKeys: Object.keys(snap50.inventory).length,
}, null, 2));

const d = Snapshot.diff(snap0, snap50);
console.log('\n── Diff 0→50 ──');
console.log(JSON.stringify(d, null, 2));

// Pokaż przykładowe pola z bogatego snapshot
console.log(`\nRozszerzone pola snapshot:`);
console.log(`  prosperity: ${snap50.prosperity}  morale: ${snap50.morale}`);
console.log(`  buildingsByCategory keys: ${Object.keys(snap50.buildingsByCategory).join(', ')}`);
console.log(`  rates: ${JSON.stringify(snap50.rates)}`);
console.log(`  empires: ${snap50.empires.length}  vessels: ${snap50.vessels.total}`);

// Asserts
const tests = [];
tests.push(['snap0 captured', !!snap0]);
tests.push(['snap50 captured', !!snap50]);
tests.push(['civYear advanced', snap50.civYear > snap0.civYear]);
tests.push(['diff non-null', !!d]);
tests.push(['food changed (starter farm)', !!d.inventoryDelta.food]);
tests.push(['snapshots differ (equals=false)', !Snapshot.equals(snap0, snap50)]);

console.log('');
let fail = 0;
for (const [name, ok] of tests) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  if (!ok) fail++;
}
console.log(`\n${fail === 0 ? '✅ STEP 7 SUCCESS' : `❌ STEP 7 FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
