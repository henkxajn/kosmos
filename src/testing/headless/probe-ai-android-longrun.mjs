// ═══════════════════════════════════════════════════════════════
// PROBE (weryfikacja) — AI android supply pod outposty (Report 1, Plan 1)
// Uruchom: node src/testing/headless/probe-ai-android-longrun.mjs
// ───────────────────────────────────────────────────────────────
// Przed fixem: reforma droidów (bec2028) wyjęła android_worker z reactive/safety
// → setDemandBonus no-op → AI produkuje 0 androidów → outpost (koszt android:6)
// nieosiągalny → 0 outpostów (potwierdzone wcześniej: android=0, rate=0, out=0/300cy).
//
// Po fixie (EmpireStrategySystem._maybeOrderOutpostAndroids): gdy outpost jest
// zablokowany WYŁĄCZNIE brakiem androidów, AI składa Build-N na macierzystej fabryce
// (demand-driven, chain-aware _colonyCanSustainRecipe, dedup, cap 24). Weryfikujemy
// LOGIKĘ fixa: order → produkcja → outpost.
//
// ⚠ WARUNEK: fabryka musi UMIEĆ wyprodukować androida (łańcuch semiconductor/electronic/
// polymer → raws). Dlatego karmimy zdrowy zestaw RAW co tick (surogat zbilansowanej
// ekonomii AI z pełnym górnictwem). W kolonii RAW-STARVED (grep-diagnoza z tej sesji)
// _colonyCanSustainRecipe SŁUSZNIE zwraca false i fix pomija (order 0/N = stall byłby
// bez sensu). „Czy realna ekonomia AI utrzyma łańcuch" = pytanie do live-gate na save gracza.
// ═══════════════════════════════════════════════════════════════

import './env.js'; // MUST be first
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager }          from '../../systems/ColonyManager.js';
import { EmpireRegistry }         from '../../systems/EmpireRegistry.js';
import { EmpireColonyBootstrap }  from '../../systems/EmpireColonyBootstrap.js';
import { ColonyAutoExpander }     from '../../systems/ColonyAutoExpander.js';
import { EmpireStrategySystem }   from '../../systems/EmpireStrategySystem.js';
import { INDUSTRIALIST }          from '../../data/EmpireArchetypeIndustrialist.js';

const dep = (resourceId, remaining, richness = 0.6) => ({ resourceId, richness, totalAmount: remaining, remaining });
const mkBody = (id, name, systemId, planetType, atmosphere, deposits, extra = {}) =>
  EntityManager.add({
    id, name, type: 'planet', planetType, radius: 1, mass: 1, atmosphere, temperatureK: 280,
    deposits, systemId, composition: { Fe: 0.25, Si: 0.2, Cu: 0.05, C: 0.2, O: 0.25 }, ...extra,
  });

// Dwa imperia Industrialist (mają Xe → mogą utrzymać recepturę androida). Home z Xe (sustained),
// +rocky2 (pełna kolonia), +xe (cel outpostu Xe). Reprezentatywne dla „utkniętego" AI.
mkBody('a_home',  'A Home',  'sys_a', 'rocky', 'breathable', [dep('Fe', 9e5), dep('Si', 9e5), dep('Cu', 5e5), dep('Ti', 4e5), dep('C', 9e5), dep('Xe', 2e5)]);
mkBody('a_rocky2','A Rocky2','sys_a', 'rocky', 'breathable', [dep('Fe', 5e5), dep('Si', 5e5), dep('C', 5e5)]);
mkBody('a_xe',    'A Xe',    'sys_a', 'rocky', 'none',       [dep('Xe', 3e5), dep('Fe', 3e5)], { planetoidType: 'metallic' });
mkBody('b_home',  'B Home',  'sys_b', 'rocky', 'breathable', [dep('Fe', 9e5), dep('Si', 9e5), dep('Cu', 5e5), dep('Ti', 4e5), dep('C', 9e5), dep('Xe', 2e5)]);
mkBody('b_rocky2','B Rocky2','sys_b', 'rocky', 'breathable', [dep('Fe', 5e5), dep('Si', 5e5), dep('C', 5e5)]);
mkBody('b_xe',    'B Xe',    'sys_b', 'rocky', 'none',       [dep('Xe', 3e5), dep('Fe', 3e5)], { planetoidType: 'metallic' });

const SYSTEMS = {
  sys_a: { planetIds: ['a_home', 'a_rocky2', 'a_xe'], moonIds: [], planetoidIds: [] },
  sys_b: { planetIds: ['b_home', 'b_rocky2', 'b_xe'], moonIds: [], planetoidIds: [] },
};

const techStub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'getTerrainUnlocks') return () => [];
    if (prop === 'isResearched')      return () => true;
    return () => 1;
  },
});

const colonyManager  = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();
globalThis.window = globalThis.window ?? {};
window.KOSMOS = {
  civMode: true, timeSystem: { gameTime: 0 }, colonyManager, empireRegistry,
  empireColonyBootstrap: EmpireColonyBootstrap,
  starSystemManager: { getSystem: (id) => SYSTEMS[id] ?? null },
  galaxyData: { seed: 1, systems: [{ id: 'sys_a', x: 0, y: 0, z: 0 }, { id: 'sys_b', x: 8, y: 0, z: 0 }] },
};

empireRegistry.createEmpire({ id: 'emp_a', archetype: 'industrialist', homeSystemId: 'sys_a' });
empireRegistry.createEmpire({ id: 'emp_b', archetype: 'industrialist', homeSystemId: 'sys_b' });
EmpireColonyBootstrap.bootstrapHomeColony('emp_a', INDUSTRIALIST, 'sys_a');
EmpireColonyBootstrap.bootstrapHomeColony('emp_b', INDUSTRIALIST, 'sys_b');
const _expander = new ColonyAutoExpander();
const _strategy = new EmpireStrategySystem();
const reapplyAll = () => { for (const e of ['emp_a', 'emp_b']) for (const c of empireRegistry.getColoniesByEmpire(e)) try { c.buildingSystem?._reapplyAllRates(); } catch {} };
reapplyAll();

const homeOf = (e) => colonyManager.getColony(e === 'emp_a' ? 'a_home' : 'b_home');
const stats = (e) => {
  const cols = empireRegistry.getColoniesByEmpire(e);
  const home = homeOf(e); const fs = home?.factorySystem;
  const ord = fs?.getDroidOrder?.('android_worker');
  return {
    pop: home?.civSystem?.population ?? 0,
    out: cols.filter(c => c.isOutpost).length,
    android: home?.resourceSystem?.getAmount?.('android_worker') ?? 0,
    order: ord ? `${ord.produced}/${ord.qty}` : '—',
  };
};

// Warunek precyzyjny fixa = „outpost blokuje TYLKO android". By przetestować LOGIKĘ fixa
// (a nie zdolność ubogiej ekonomii AI do samodzielnego uzbierania zestawu), karmimy OBA imperia
// nie-androidowym zestawem outpostu co tick (Fe/Si/Cu/Ti + 5 commodity + Xe pod recepturę androida):
//   emp_a — BEZ androida → fix MUSI go wyprodukować i założyć outpost.
//   emp_b — Z androidem   → kontrola: zestaw wystarcza, outpost natychmiast.
// Mega-kit: WSZYSTKIE raws łańcucha androida generously + nie-androidowe commodity outpostu.
const NONANDROID_KIT = { Fe: 200, Si: 200, Cu: 200, Ti: 100, C: 200, Xe: 100, W: 100, Pt: 100, Li: 100, Nt: 100, Hv: 100, structural_alloys: 20, extraction_systems: 10, power_cells: 10, conductor_bundles: 10, electronic_systems: 10 };
const feed = () => {
  homeOf('emp_a').resourceSystem.receive({ ...NONANDROID_KIT });                    // bez androida → fix
  homeOf('emp_b').resourceSystem.receive({ ...NONANDROID_KIT, android_worker: 6 }); // z androidem → kontrola
};

const firstOutpost = { emp_a: null, emp_b: null };
console.log('Zestaw nie-androidowy karmiony co tick (android to JEDYNY brak) — emp_a liczy na FIX, emp_b kontrola.\n');
console.log('cy   | A(fix): pop out android order | B(ctrl): pop out android order');
console.log('-----+-------------------------------+-------------------------------');
const row = (s) => `${String(s.pop).padStart(3)} ${String(s.out).padStart(3)} ${s.android.toFixed(0).padStart(7)} ${String(s.order).padStart(6)}`;
let cy = 0;
for (let block = 0; block < 20; block++) {
  for (let i = 0; i < 20; i++) {
    feed();
    window.KOSMOS.timeSystem.gameTime += 1 / 12;
    EventBus.emit('time:tick', { deltaYears: 1 / 12, civDeltaYears: 1, gameTime: window.KOSMOS.timeSystem.gameTime, multiplier: 1 });
    reapplyAll();
    cy++;
    for (const e of ['emp_a', 'emp_b']) if (firstOutpost[e] === null && stats(e).out >= 1) firstOutpost[e] = cy;
  }
  console.log(`${String(cy).padStart(4)} | ${row(stats('emp_a'))} | ${row(stats('emp_b'))}`);
}

const a = stats('emp_a'), b = stats('emp_b');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log(`  PASS  ${n}`); pass++; } else { console.error(`  FAIL  ${n}`); fail++; } };
console.log('\n═══ WERYFIKACJA (Plan 1) ═══');
ok(`A: droid order pojawił się (produkcja androidów uruchomiona)`, a.android > 0 || a.out >= 1);
ok(`A: założył ≥1 outpost (był 0 przed fixem)`, a.out >= 1);
ok(`B: założył ≥1 outpost`, b.out >= 1);
ok(`A: pierwszy outpost ≤ 40 civYears (${firstOutpost.emp_a ?? '—'})`, firstOutpost.emp_a !== null && firstOutpost.emp_a <= 40);
console.log(`\n  A pierwszy outpost: cy${firstOutpost.emp_a ?? '—'} | B: cy${firstOutpost.emp_b ?? '—'}`);
console.log(`═══ WYNIK: ${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
