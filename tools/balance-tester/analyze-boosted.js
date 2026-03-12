// Analiza wyników boosted suite
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const reportsDir = join(__dirname, 'reports');

// Znajdź najnowszy plik boosted
const files = readdirSync(reportsDir).filter(f => f.startsWith('data_boosted_') && f.endsWith('.json'));
files.sort();
const latest = files[files.length - 1];
console.log('Plik:', latest);

const data = JSON.parse(readFileSync(join(reportsDir, latest), 'utf-8'));
const results = data.rawResults;

const median = arr => { const s=[...arr].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; };
const mean = arr => arr.reduce((a,b)=>a+b,0)/arr.length;
const pct = (arr, pred) => (arr.filter(pred).length / arr.length * 100).toFixed(0);

const ships = results.map(r => r.counters?.shipsBuilt ?? 0);
const recons = results.map(r => r.counters?.reconMissions ?? 0);
const colonies = results.map(r => r.counters?.coloniesFounded ?? 0);
const outposts = results.map(r => r.counters?.outpostsFounded ?? 0);
const pops = results.map(r => r.finalState?.population ?? 0);
const techs = results.map(r => {
  const t = r.finalState?.techsResearched;
  return Array.isArray(t) ? t.length : (t ?? 0);
});
const morales = results.map(r => r.finalState?.morale ?? 0);
const explored = results.map(r => r.finalState?.exploredBodies ?? 0);
const total = results.map(r => r.finalState?.totalBodies ?? 0);
const colCount = results.map(r => r.finalState?.colonyCount ?? 0);

console.log('\n=== BOOSTED SUITE: 50 runów × 500 lat ===\n');
console.log('Populacja:   median=' + median(pops) + ' mean=' + mean(pops).toFixed(1) + ' min=' + Math.min(...pops) + ' max=' + Math.max(...pops));
console.log('Morale:      median=' + median(morales).toFixed(0) + ' mean=' + mean(morales).toFixed(1));
console.log('Technologie: median=' + median(techs) + ' mean=' + mean(techs).toFixed(1) + ' min=' + Math.min(...techs) + ' max=' + Math.max(...techs));
console.log('');
console.log('Statki:      median=' + median(ships) + ' mean=' + mean(ships).toFixed(1) + ' min=' + Math.min(...ships) + ' max=' + Math.max(...ships));
console.log('Recon:       median=' + median(recons) + ' mean=' + mean(recons).toFixed(1) + ' min=' + Math.min(...recons) + ' max=' + Math.max(...recons));
console.log('Kolonie:     median=' + median(colonies) + ' mean=' + mean(colonies).toFixed(1) + ' max=' + Math.max(...colonies));
console.log('Outposty:    median=' + median(outposts) + ' mean=' + mean(outposts).toFixed(1) + ' max=' + Math.max(...outposts));
console.log('Zbadane:     median=' + median(explored) + '/' + median(total) + ' mean=' + mean(explored).toFixed(1));
console.log('Kolonie(cnt):median=' + median(colCount) + ' max=' + Math.max(...colCount));
console.log('');
console.log('% z >=1 statkiem: ' + pct(ships, s => s >= 1) + '%');
console.log('% z >=1 recon:    ' + pct(recons, r => r >= 1) + '%');
console.log('% z >=1 kolonia:  ' + pct(colonies, c => c >= 1) + '%');

// Milestones
const milestones = {};
for (const r of results) {
  for (const [k,v] of Object.entries(r.milestones ?? {})) {
    if (v !== null && v !== undefined) {
      if (!milestones[k]) milestones[k] = [];
      milestones[k].push(v);
    }
  }
}
console.log('\nMilestones (mediana roku | N/50):');
const sorted = Object.entries(milestones).sort((a,b) => median(a[1]) - median(b[1]));
for (const [k,arr] of sorted) {
  console.log('  ' + k.padEnd(25) + ' rok ' + String(median(arr)).padStart(5) + '  (' + arr.length + '/50)');
}

// Shortage events
const feShortages = results.map(r => r.counters?.shortageEvents?.Fe ?? 0);
const tiShortages = results.map(r => r.counters?.shortageEvents?.Ti ?? 0);
console.log('\nFe shortage: ' + pct(feShortages, f => f > 0) + '% runów, mean=' + mean(feShortages).toFixed(0) + ' events/run');
console.log('Ti shortage: ' + pct(tiShortages, f => f > 0) + '% runów, mean=' + mean(tiShortages).toFixed(1) + ' events/run');

// Rozkład statków
console.log('\nRozkład statków:');
const shipDist = ships.reduce((acc,v) => { acc[v] = (acc[v] ?? 0) + 1; return acc; }, {});
for (const [k,v] of Object.entries(shipDist).sort((a,b) => Number(a[0]) - Number(b[0]))) {
  console.log('  ' + k + ' statków: ' + v + ' runów (' + (v/results.length*100).toFixed(0) + '%)');
}

// Rozkład zbadanych ciał
console.log('\nRozkład zbadanych ciał:');
const expDist = explored.reduce((acc,v) => { acc[v] = (acc[v] ?? 0) + 1; return acc; }, {});
for (const [k,v] of Object.entries(expDist).sort((a,b) => Number(a[0]) - Number(b[0]))) {
  console.log('  ' + k + ' zbadanych: ' + v + ' runów');
}
