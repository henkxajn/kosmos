// BALANS 1.0 — headless harness keeper. Chroni instrument (GameCore solo flag,
// parallel action budget, research-via-queueTech) przed cichą regresją — instrument
// nie ma browser live-gate, więc telemetria zepsuta bez śladu = najgorszy scenariusz.
//
//   T1  solo flag: solo→0 imperiów + brak RandomEventSystem; normal→imperia + eventy (regresja)
//   (T2/T3 dopisywane w kolejnych commitach BALANS — parallel budget, research queueTech)

import '../headless/env.js';           // MUST be first (mocki window/document/THREE + seeded RNG)
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import { runSingleGame } from '../runner/SingleGame.js';
import { BaseBot } from '../bots/BaseBot.js';
import ActionAdapter, { ACTION_TYPES } from '../actions/ActionAdapter.js';
import { ActionCatalog } from '../actions/ActionCatalog.js';
import { STARTER_RESOURCES, BOOSTED_STARTER_TECHS, BOOSTED_STARTER_POP } from '../../data/StarterLoadout.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── T1: solo flag ─────────────────────────────────────────────────
console.log('T1 — solo flag (neutralize AI aggression + RandomEventSystem off)');
{
  const solo = new GameCore();
  solo.boot({ quiet: true, scenario: 'civilization', solo: true });
  assert(solo.empireRegistry.listAll().length === 0, 'solo: 0 obcych imperiów (brak agresji AI)');
  assert(solo.randomEventSystem === null, 'solo: RandomEventSystem OFF (determinizm)');
  let crashed = false;
  try { new Ticker(solo.timeSystem).run(24, { tickSize: 1.0, stopOnCrash: true }); }
  catch { crashed = true; }
  assert(!crashed, 'solo: 24 civYears bez crasha (null RandomEventSystem bezpieczny)');

  const norm = new GameCore();
  norm.boot({ quiet: true, scenario: 'civilization', solo: false });
  assert(norm.empireRegistry.listAll().length > 0, 'normal: obce imperia spawnują się (brak regresji)');
  assert(norm.randomEventSystem !== null, 'normal: RandomEventSystem ON (brak regresji)');
}

// ── T2: parallel action budget (decisionsPerCivYear jest relaksowalnym throttle harnessu) ──
console.log('\nT2 — parallel action budget + solo threading przez SingleGame');
{
  class CountBot extends BaseBot {
    constructor() { super({ name: 'CountBot' }); this.calls = 0; }
    decideAction() { this.calls++; return { type: 'wait' }; }
  }
  const CY = 6;
  const b1 = new CountBot();
  runSingleGame({ bot: b1, civYears: CY, decisionsPerCivYear: 1, snapshotInterval: 0,
                  scenario: 'civilization', bootOptions: { solo: true } });
  const b3 = new CountBot();
  runSingleGame({ bot: b3, civYears: CY, decisionsPerCivYear: 3, snapshotInterval: 0,
                  scenario: 'civilization', bootOptions: { solo: true } });

  assert(b1.calls === CY, `decisions=1 → ${b1.calls} decyzji w ${CY} civYears (1/cy)`);
  assert(b3.calls === CY * 3, `decisions=3 → ${b3.calls} decyzji (3/cy — throttle relaksowalny liniowo)`);
  // solo dostarczone przez bootOptions musi zniwelować rywali także w ścieżce SingleGame
  assert((window.KOSMOS?.empireRegistry?.listAll?.().length ?? -1) === 0,
         'solo threading: SingleGame boot ma 0 imperiów (bootOptions honorowane)');
}

// ── T3: research fix — RESEARCH action → ResearchSystem.queueTech (progresywna, nie ryczałt) ──
console.log('\nT3 — research via queueTech (flatline-breaker)');
{
  // (a) Progresywność: tech kolejkuje się NAWET gdy research.amount < koszt (lump-sum by padł).
  const c = new GameCore();
  c.boot({ quiet: true, scenario: 'civilization', solo: true });
  const home = c.colonyManager.getColony(window.KOSMOS.homePlanet.id);
  home.resourceSystem.research.amount = 10;           // poniżej kosztu metallurgy (50)
  const r1 = ActionAdapter.execute({ type: ACTION_TYPES.RESEARCH, techId: 'metallurgy' });
  assert(r1.event === 'research:queueTech', 'RESEARCH routuje do queueTech (nie tech:researchRequest)');
  assert(!c.techSystem.isResearched('metallurgy'), 'niedofinansowany tech NIE kończy się natychmiast (progresywny)');
  assert(c.researchSystem.activeResearch.some(s => s.techId === 'metallurgy'),
         'niedofinansowany tech JEST w aktywnym slocie (akumuluje — lump-sum by odrzucił)');

  // (b) Ukończenie: z wystarczającą pulą akumulator dopina tech (real path działa end-to-end).
  const c2 = new GameCore();
  c2.boot({ quiet: true, scenario: 'civilization', solo: true });
  const home2 = c2.colonyManager.getColony(window.KOSMOS.homePlanet.id);
  home2.resourceSystem.research.amount = 200;          // powyżej kosztu → _consumeAccumulatedResearch dopina
  ActionAdapter.execute({ type: ACTION_TYPES.RESEARCH, techId: 'metallurgy' });
  assert(c2.techSystem.isResearched('metallurgy'), 'dofinansowany tech kończy się (queueTech end-to-end)');

  // (c) Idempotencja: ponowny RESEARCH tego samego (już zbadanego) techu = benign no-op.
  const r3 = ActionAdapter.execute({ type: ACTION_TYPES.RESEARCH, techId: 'metallurgy' });
  assert(r3.emitted === true && r3.queued === false, 'ponowny RESEARCH zbadanego techu = no-op (queued=false)');
}

// ── T4: catalog occupancy — listBuildActions musi respektować pendingBuild (mirror _build) ──
console.log('\nT4 — ActionCatalog respektuje pendingBuild (koniec storm „Pole zajęte")');
{
  const c = new GameCore();
  c.boot({ quiet: true, scenario: 'civilization', solo: true });
  const home = c.colonyManager.getColony(window.KOSMOS.homePlanet.id);
  const cat = new ActionCatalog({
    colonyManager: c.colonyManager, techSystem: c.techSystem, resourceSystem: c.resourceSystem,
    buildingSystem: c.buildingSystem, vesselManager: c.vesselManager, civSystem: c.civSystem,
    starSystemManager: c.starSystemManager,
  });
  const before = cat.listBuildActions({ limit: 999, buildingId: 'well' });
  const target = before[0]?.tile;
  assert(!!target, 'katalog oferuje wolny kafel dla well (baseline)');

  // Symuluj budynek z buildTime>0 zakolejkowany na tym kaflu: pendingBuild → isOccupied,
  // ale buildingId nadal null (dokładnie pułapka, która robiła storm).
  target.pendingBuild = { buildingId: 'well' };
  assert(target.isOccupied === true && !target.buildingId,
         'pendingBuild → isOccupied=true przy buildingId=null (stan pułapki)');
  const after = cat.listBuildActions({ limit: 999, buildingId: 'well' });
  assert(!after.some(a => a.tile === target),
         'katalog NIE oferuje kafla pending (mirror _build.isOccupied → brak „Pole zajęte")');
  target.pendingBuild = null;
  const restored = cat.listBuildActions({ limit: 999, buildingId: 'well' });
  assert(restored.some(a => a.tile === target), 'po zwolnieniu pendingBuild kafel wraca do oferty');
}

// ── T5: start-state parity — GameCore boosted MUSI odzwierciedlać StarterLoadout ──
console.log('\nT5 — start-state parity (real new game = civilization_boosted, źródło = StarterLoadout)');
{
  const c = new GameCore();
  c.boot({ quiet: true, scenario: 'civilization_boosted', solo: true });
  const K = window.KOSMOS;
  const home = c.colonyManager.getColony(K.homePlanet.id);
  const civ = home.civSystem, res = home.resourceSystem;

  // (a) starter techy = dokładnie autorytatywna lista (nie stary dryf basic_computing/automation)
  const got = Array.from(K.techSystem._researched).sort();
  const exp = [...BOOSTED_STARTER_TECHS].sort();
  assert(JSON.stringify(got) === JSON.stringify(exp),
         `boosted starter techs === StarterLoadout [${exp.join(',')}]`);
  assert(K.techSystem.isResearched('metallurgy'), 'metallurgy zbadana @t=0 (Fabryka dostępna od startu)');
  assert(!K.techSystem.isResearched('basic_computing') && !K.techSystem.isResearched('automation'),
         'brak starego dryfu: basic_computing/automation NIE zbadane @t=0');

  // (b) pop startowy = StarterLoadout
  assert(civ.population === BOOSTED_STARTER_POP, `pop startowy === StarterLoadout (${BOOSTED_STARTER_POP})`);

  // (c) zasoby startowe = StarterLoadout (fuel:50 obecne — reforma S3.0a, wcześniej brak w harnessie)
  assert(Math.round(res.getAmount('fuel')) === STARTER_RESOURCES.fuel,
         `fuel startowe === StarterLoadout (${STARTER_RESOURCES.fuel})`);
  assert(Math.round(res.getAmount('Fe')) === STARTER_RESOURCES.Fe, `Fe startowe === StarterLoadout (${STARTER_RESOURCES.Fe})`);

  // (d) planeta domowa = pełna wiedza (parytet analyzed/explored)
  assert(K.homePlanet.explored === true && K.homePlanet.analyzed === true,
         'planeta domowa explored+analyzed (parytet GameScene._setupColony)');

  // (e) factory kolejkowalna @t=0 (metallurgy gotowa → build nie odbija się o tech-gate)
  const cat = new ActionCatalog({
    colonyManager: c.colonyManager, techSystem: c.techSystem, resourceSystem: c.resourceSystem,
    buildingSystem: c.buildingSystem, vesselManager: c.vesselManager, civSystem: c.civSystem,
    starSystemManager: c.starSystemManager,
  });
  const factoryActions = cat.listBuildActions({ limit: 50, buildingId: 'factory' });
  assert(factoryActions.length > 0, 'factory build kolejkowalny @t=0 (bez czekania na research)');
}

// ── Wynik ─────────────────────────────────────────────────────────
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
