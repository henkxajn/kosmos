// BALANS 1.0 — Phase 2 — AiTelemetry keeper (chroni czujnik IMPERIÓW AI).
// Instrument NIE ma browser live-gate → czujnik zepsuty = werdykt zepsuty bez śladu.
// Ten czujnik jest wyjątkowo wrażliwy, bo OPAKOWUJE metody żywych systemów AI:
// wrapper, który zmienia zwracaną wartość, zmieniłby PRZEBIEG GRY (a nie tylko pomiar).
// T3 pilnuje tego wprost — to najważniejszy test w pliku.
//
//   T1  koszt zestawu placówki + rozbicie „czego brakuje"
//   T2  colonySnapshot — agregacja etatów/obsady (droidy liczą się do obsady, nie do braku)
//   T3  attachDecisionHooks — PRZEZROCZYSTOŚĆ (zwracane wartości bez zmian) + detach + zapis
//   T4  explainExpander — odwzorowanie PRIORYTETU realnej ścieżki decyzyjnej
//   T5  normalizeStrategyReason — mapowanie powodów gry na klucze
//   T6  probeDependencies — undefined = ZNALEZISKO (nie skip)
//   T7  summarizeSeed / aggregatePanel / verdict
//   T8  realny boot z aiEmpires (guard dryfu API + parytet: aiEmpires=false NIE spawnuje AI)
//   T9  progi zdrowia — każdy próg osobno + „wojna to KONTEKST, nie wyciszenie warna"
//   T10 PARYTET Population 2.0 dla startowej populacji AI (Phase 3 / eksperyment #1) —
//       pin reguły ×4, nie liczby „na oko"; chroni przed cichym cofnięciem do starej jednostki

import '../headless/env.js';           // MUST be first
import { reseed } from '../headless/env.js';
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import {
  AiTelemetry, outpostKitCost, outpostShortfall, colonySnapshot,
  attachDecisionHooks, explainExpander, normalizeStrategyReason, probeDependencies,
  summarizeSeed, aggregatePanel, verdict, DEP_LOOKUPS, AI_DROID_ID,
} from '../headless/AiTelemetry.js';
import {
  AI_HEALTH_THRESHOLDS, WARN_CODES, evaluateThresholds, rollupWarns, formatWarn,
} from '../headless/AiThresholds.js';
import {
  MAX_PENDING_BUILDS_PER_COLONY, MAX_PENDING_UPGRADES_PER_COLONY,
} from '../../systems/ColonyAutoExpander.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { INDUSTRIALIST } from '../../data/EmpireArchetypeIndustrialist.js';
import { EXPANSIONIST } from '../../data/EmpireArchetypeExpansionist.js';
import { BOOSTED_STARTER_POP } from '../../data/StarterLoadout.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── T1: koszt zestawu + shortfall ─────────────────────────────────
console.log('T1 — outpostKitCost / outpostShortfall');
{
  const kit = outpostKitCost();
  const solar = BUILDINGS.autonomous_solar_farm, mine = BUILDINGS.autonomous_mine;
  const expectDroid = (solar.commodityCost?.[AI_DROID_ID] ?? 0) + (mine.commodityCost?.[AI_DROID_ID] ?? 0);
  const expectAlloys = (solar.commodityCost?.structural_alloys ?? 0) + (mine.commodityCost?.structural_alloys ?? 0);
  assert(kit[AI_DROID_ID] === expectDroid && expectDroid > 0,
    `klucze WSPÓLNE sumowane, nie nadpisywane: ${AI_DROID_ID}=${kit[AI_DROID_ID]}`);
  assert(kit.structural_alloys === expectAlloys, `structural_alloys sumowane: ${kit.structural_alloys}`);
  assert(kit.Fe === (solar.cost?.Fe ?? 0) + (mine.cost?.Fe ?? 0), 'surowce bazowe też sumowane (Fe)');

  const mother = { resourceSystem: { getAmount: (id) => ({ Fe: 1e6, Si: 1e6, Cu: 1e6, Ti: 1e6 }[id] ?? 0) } };
  const short = outpostShortfall(mother, kit);
  assert(short.some(s => s.id === AI_DROID_ID && s.short === kit[AI_DROID_ID]),
    'brak droidów raportowany z ILOŚCIĄ (have=0)');
  assert(!short.some(s => s.id === 'Fe'), 'pozycja pokryta (Fe) NIE trafia do braków');
  const rich = { resourceSystem: { getAmount: () => 1e9 } };
  assert(outpostShortfall(rich, kit).length === 0, 'bogata macierzysta → pusta lista braków');
  assert(outpostShortfall(null, kit).length === 0, 'brak macierzystej → pusta lista (bez rzutu)');
}

// ── T2: colonySnapshot ────────────────────────────────────────────
console.log('T2 — colonySnapshot (agregacja etatów i obsady)');
{
  assert(colonySnapshot(null) === null, 'null kolonia → null (bez rzutu)');
  const colony = {
    credits: 1234,
    civSystem: {
      population: 20, humans: 20.5, employed: 18, unemployed: 2, satisfaction: 61.4, housing: 32,
      getAnnualGrowth: () => 0.1234,
      getWorkforceBreakdown: () => ([
        { type: 'laborer', jobs: 10, workers: 4, synthetic: 2 },   // 4 nieobsadzone
        { type: 'miner',   jobs: 6,  workers: 6, synthetic: 0 },   // 0 nieobsadzonych
        { type: 'worker',  jobs: 4,  workers: 8, synthetic: 0 },   // nadmiar NIE robi ujemnych
      ]),
    },
    resourceSystem: {
      getAmount: (id) => (id === 'food' ? 500 : 0),
      getPerYear: (id) => (id === 'food' ? -3.5 : 0),
      energy: { balance: 12.5, brownout: false },
    },
    buildingSystem: {
      _active: new Map([['1,1', { building: { id: 'farm' } }], ['2,2', { building: { id: 'farm' } }], ['3,3', { buildingId: 'mine' }]]),
      _constructionQueue: new Map([['4,4', {}]]),
      _pendingQueue: new Map([['5,5', {}], ['6,6', {}]]),
    },
    prosperitySystem: { prosperity: 77.7 },
  };
  const s = colonySnapshot(colony);
  assert(s.jobs === 20 && s.workers === 18 && s.synthetic === 2, 'sumy etatów/pracowników/droidów');
  assert(s.unfilledJobs === 4, 'nieobsadzone = Σ max(0, jobs − workers − droidy) (nadmiar nie ujemny)');
  assert(Math.abs(s.emplRate - 1.0) < 1e-9, 'obsada = (ludzie+droidy)/etaty — droid liczy się jako obsada');
  assert(s.buildings.farm === 2 && s.buildings.mine === 1 && s.buildingCount === 3,
    'budynki zliczone po building.id ORAZ buildingId (oba kształty wpisu)');
  assert(s.constructionQueue === 1 && s.pendingQueue === 2, 'głębokości kolejek');
  assert(s.stock.food === 500 && s.flow.food === -3.5, 'magazyn i przepływ per zasób');
  assert(s.credits === 1234 && s.prosperity === 78 && s.satisfaction === 61, 'kredyty / prosperity / satysfakcja');
  const empty = colonySnapshot({ civSystem: {}, resourceSystem: {}, buildingSystem: {} });
  assert(empty.jobs === 0 && empty.emplRate === null, 'zero etatów → emplRate=null (nie 0/0=NaN)');
}

// ── T3: PRZEZROCZYSTOŚĆ opakowań (najważniejszy test) ─────────────
console.log('T3 — attachDecisionHooks: wrapper NIE zmienia zachowania gry');
{
  const calls = [];
  const fakeStrat = {
    _executeAutonomousOutpost: (...a) => { calls.push(['outpost', a]); return { ok: true, planetId: a[3] }; },
    _executeFullColony:        (...a) => { calls.push(['colony', a]);  return { error: 'cannot_afford' }; },
    _maybeOrderOutpostDroids:  (...a) => { calls.push(['droids', a]);  return 'ORIG'; },
    _runForEmpire:             (...a) => { calls.push(['run', a]);     return 'RUN_RESULT'; },
    explainColonization:       () => ({ decision: 'BRAK AKCJI', reason: 'outposty pominięte: nie stać na outpost (canAffordOutpost=false)' }),
  };
  const colony = { planetId: 'p1', ownerEmpireId: 'emp_1' };
  const fakeCae = {
    _tryBuild:    (...a) => { calls.push(['build', a]);   return 'queued'; },
    _tryUpgrade:  (...a) => { calls.push(['upgrade', a]); return 'no_candidate'; },
    _runSurvival: (...a) => { calls.push(['surv', a]);    return 'SURV'; },
    _runTargets:  (...a) => { calls.push(['tgt', a]);     return 'TGT'; },
    _managedColonies: () => [colony],
    _pendingCounts: () => ({ builds: 0, upgrades: 0 }),
  };
  const origRun = fakeStrat._runForEmpire, origBuild = fakeCae._tryBuild;
  globalThis.window.KOSMOS = { empireStrategySystem: fakeStrat, colonyAutoExpander: fakeCae };

  const t = new AiTelemetry();
  const detach = attachDecisionHooks(t._sink);

  const mother = { factorySystem: { getDroidOrder: () => ({ qty: 4, produced: 1 }) } };
  assert(fakeStrat._executeAutonomousOutpost({ id: 'e' }, mother, 'sys', 'body', 5, {}).ok === true,
    'outpost: zwracany obiekt PRZECHODZI bez zmian');
  assert(fakeStrat._executeFullColony({ id: 'e' }, mother, 'sys', 'body', 5, {}).error === 'cannot_afford',
    'kolonia: błąd PRZECHODZI bez zmian');
  assert(fakeStrat._maybeOrderOutpostDroids({ id: 'e' }, mother, 'sys', [], 5, {}) === 'ORIG',
    'zamówienie droidów: wynik PRZECHODZI bez zmian');
  assert(fakeCae._tryBuild(colony, 'farm', { module: 'target' }) === 'queued',
    '_tryBuild: outcome string PRZECHODZI bez zmian');
  assert(fakeCae._tryUpgrade(colony, 'farm', 2, { module: 'target' }) === 'no_candidate',
    '_tryUpgrade: outcome string PRZECHODZI bez zmian');
  assert(fakeCae._runSurvival(5) === 'SURV' && fakeCae._runTargets(5) === 'TGT',
    'przebiegi modułów: wynik PRZECHODZI bez zmian');
  assert(calls.length === 7, 'każdy z 7 oryginałów wywołany DOKŁADNIE raz (bez podwójnego wywołania)');

  const d = t.getDecisions();
  assert(d.actions.some(a => a.kind === 'outpost' && a.outcome === 'fired'), 'zapisano udaną placówkę');
  assert(d.actions.some(a => a.kind === 'colony' && a.outcome === 'failed' && a.reason === 'cannot_afford'),
    'zapisano nieudaną kolonię Z POWODEM');
  assert(d.actions.some(a => a.kind === 'build' && a.effective === true), '„queued" liczone jako skuteczne (tak liczy gra)');
  assert(d.actions.some(a => a.kind === 'upgrade' && a.effective === false), '„no_candidate" NIE jest skuteczne');

  // _runForEmpire bez akcji → no-op z powodem
  fakeStrat._runForEmpire({ id: 'emp_1' }, 7);
  const noopStrat = d && t.getDecisions().noops.find(n => n.system === 'strategy');
  assert(!!noopStrat && noopStrat.reasonKey === 'cannot_afford_outpost',
    'strategia: „oceniło i nic" → no-op z kluczem powodu z explainColonization');

  detach();
  assert(fakeStrat._runForEmpire === origRun && fakeCae._tryBuild === origBuild,
    'detach() PRZYWRACA oryginalne metody (brak wycieku opakowań między seedami)');
}

// ── T4: explainExpander — priorytet realnej ścieżki ───────────────
console.log('T4 — explainExpander (odwzorowanie priorytetu bramek)');
{
  const cae = { _pendingCounts: (c) => c.__counts ?? ({ builds: 0, upgrades: 0 }) };
  const mk = (o = {}) => ({ planetId: 'p', __counts: { builds: 0, upgrades: 0 }, ...o });

  // SURVIVAL: queue_full > anti_thrash > unreachable > healthy
  const full = mk({ __counts: { builds: MAX_PENDING_BUILDS_PER_COLONY, upgrades: 0 },
                    _caeLastSurvivalAction: { type: 'energy', civYear: 9 },
                    _caeUnreachableTargets: new Map([['build:farm', {}]]) });
  assert(explainExpander(cae, full, 10, 'survival').startsWith('queue_full'),
    'survival: pełna kolejka WYGRYWA nad anti-thrash i backoffem (tak jest w kodzie)');
  const thrash = mk({ _caeLastSurvivalAction: { type: 'energy', civYear: 9 },
                      _caeUnreachableTargets: new Map([['build:farm', {}]]) });
  assert(explainExpander(cae, thrash, 10, 'survival').startsWith('anti_thrash'),
    'survival: anti-thrash przed backoffem');
  const unreach = mk({ _caeUnreachableTargets: new Map([['build:solar_farm', {}]]) });
  assert(explainExpander(cae, unreach, 10, 'survival').startsWith('unreachable_backoff'), 'survival: backoff');
  assert(explainExpander(cae, mk(), 10, 'survival').startsWith('healthy'), 'survival: nic nie przekroczone → healthy');

  // TARGET: cooldown > queue_full > unreachable > targets_met
  const cd = mk({ _caeLastTargetAction: { type: 'build:farm', civYear: 10 },
                  __counts: { builds: MAX_PENDING_BUILDS_PER_COLONY, upgrades: MAX_PENDING_UPGRADES_PER_COLONY } });
  assert(explainExpander(cae, cd, 10, 'target').startsWith('cooldown'), 'target: cooldown przed kolejką');
  const qf = mk({ __counts: { builds: MAX_PENDING_BUILDS_PER_COLONY, upgrades: MAX_PENDING_UPGRADES_PER_COLONY } });
  assert(explainExpander(cae, qf, 10, 'target').startsWith('queue_full'), 'target: obie kolejki pełne');
  const half = mk({ __counts: { builds: MAX_PENDING_BUILDS_PER_COLONY, upgrades: 0 } });
  assert(explainExpander(cae, half, 10, 'target').startsWith('build_queue_full'),
    'target: sama kolejka BUDOWY pełna → osobny, węższy powód');
  assert(explainExpander(cae, mk(), 10, 'target').startsWith('targets_met'), 'target: nic do zrobienia');
  assert(explainExpander(cae, null, 10, 'target') === 'no_colony', 'brak kolonii → bez rzutu');
}

// ── T5: normalizeStrategyReason ───────────────────────────────────
console.log('T5 — normalizeStrategyReason (powody gry → klucze)');
{
  const k = (o) => normalizeStrategyReason(o).split('|')[0].trim();
  assert(k({ active: false, reason: 'BRAK macierzystej (pełnej) kolonii → PASYWNE: …' }) === 'passive_no_mother', 'pasywne');
  assert(k({ reason: 'archetyp nieznany → NIE zarządzane przez Warstwę C' }) === 'unmanaged_archetype', 'nieznany archetyp');
  assert(k({ reason: 'home-system sys_9 niewygenerowany → skip' }) === 'system_not_generated', 'system niewygenerowany');
  assert(k({ reason: 'outposty pominięte: WSZYSTKIE cele outpostów osiągnięte (Xe 2/2, Nt 1/1) — nie bug' }) === 'targets_saturated', 'saturacja');
  assert(k({ reason: 'outposty pominięte: Xe 0/2 lecz BRAK wolnego ciała Xe' }) === 'no_free_body', 'brak wolnego ciała');
  assert(k({ reason: 'outposty pominięte: nie stać na outpost (canAffordOutpost=false)' }) === 'cannot_afford_outpost', 'brak środków na placówkę');
  assert(k({ reason: 'outposty pominięte: WSZYSTKIE cele outpostów osiągnięte (Xe 2/2, Nt 1/1) — nie bug (saturacja; canOutpost/afford nieistotne) + nie stać na pełną kolonię' }) === 'targets_saturated',
    'saturacja ma priorytet nad „nie stać na kolonię" (kolejność jak w tool gry)');
  assert(k({}) === 'other', 'nieznany kształt → other (nie rzuca)');
}

// ── T6: probeDependencies ─────────────────────────────────────────
console.log('T6 — probeDependencies: undefined = ZNALEZISKO');
{
  globalThis.window.KOSMOS = { empireRegistry: {}, colonyManager: {} };
  const probe = probeDependencies();
  assert(probe.length === DEP_LOOKUPS.length, 'sprawdzany KAŻDY zadeklarowany odczyt');
  assert(probe.find(p => p.key === 'empireRegistry').resolved === true, 'obecny → resolved');
  assert(probe.find(p => p.key === 'empireColonyBootstrap').resolved === false,
    'brak empireColonyBootstrap wykryty (dokładnie ten przypadek miał headless przed tym slice\'em)');
  assert(probe.every(p => typeof p.usedBy === 'string' && p.usedBy.length > 0),
    'każdy odczyt niesie MIEJSCE użycia (bez tego „brak" nic nie mówi)');
}

// ── T7: podsumowania i werdykt ────────────────────────────────────
console.log('T7 — summarizeSeed / aggregatePanel / verdict');
{
  const emp = (gy, outposts, full, pop) => ({
    empireId: 'e1', name: 'E1', archetype: 'industrialist', coloniesFull: full, outposts,
    systems: 1, mother: { pop, jobs: 10, workers: 5, unfilledJobs: 5, emplRate: 0.5, buildingCount: 7, credits: 0 },
    outpostShort: [], atWar: false, droidsStored: 0, droidsInstalled: 0, decision: 'BRAK AKCJI', reason: 'x',
  });
  const series = [
    { gy: 0, empires: [emp(0, 0, 1, 6)],  player: { coloniesFull: 1, outposts: 0, home: { pop: 16, buildingCount: 8, emplRate: 1 } } },
    { gy: 1, empires: [emp(1, 0, 1, 5)],  player: { coloniesFull: 1, outposts: 0, home: { pop: 18, buildingCount: 9, emplRate: 1 } } },
    { gy: 2, empires: [emp(2, 1, 1, 4)],  player: { coloniesFull: 2, outposts: 0, home: { pop: 20, buildingCount: 10, emplRate: 1 } } },
    { gy: 3, empires: [emp(3, 1, 2, 9)],  player: { coloniesFull: 2, outposts: 1, home: { pop: 25, buildingCount: 12, emplRate: 1 } } },
  ];
  const sum = summarizeSeed(series, { actionsTotal: { strategy: 3, expander: 9 }, actions: [], noops: [], deps: [] });
  const e = sum.empires[0];
  assert(e.firstOutpostGy === 2, 'pierwsza placówka = pierwszy ROK, w którym outposts>0');
  assert(e.first3ColoniesGy === 3, '3 ciała = pierwszy rok, gdy full+outposts ≥ 3');
  assert(e.popStart === 6 && e.popEnd === 9 && e.popPeak === 9, 'POP start/koniec/szczyt');
  assert(e.popDeclineYears === 2, 'najdłuższa seria SPADKU populacji (6→5→4)');
  assert(sum.player.firstExpansionGy === 2, 'gracz: pierwszy rok z ≥2 ciałami');

  const agg = aggregatePanel([sum, sum]);
  assert(agg.empiresObserved === 2 && agg.medFirstOutpostGy === 2, 'agregat panelu: mediana pierwszej placówki');
  assert(agg.byArchetype.industrialist?.n === 2, 'rozbicie per archetyp');

  assert(verdict(null).outcome === 0, 'brak danych → outcome 0');
  assert(verdict({ empiresObserved: 2, neverOutpost: 2, medAiColoniesEnd: 1, medPlayerColoniesEnd: 3, medFirstOutpostGy: null }).outcome === 1,
    'AI nigdzie nie ruszyło → regresja POTWIERDZONA');
  assert(verdict({ empiresObserved: 2, neverOutpost: 0, medAiColoniesEnd: 4, medPlayerColoniesEnd: 3, medFirstOutpostGy: 2 }).outcome === 2,
    'AI nadąża → regresja NIEpotwierdzona');
  assert(verdict({ empiresObserved: 2, neverOutpost: 1, medAiColoniesEnd: 4, medPlayerColoniesEnd: 3, medFirstOutpostGy: 2 }).outcome === 3,
    'część imperiów stoi → mieszane');
}

// ── T8: realny boot (guard dryfu API) ─────────────────────────────
console.log('T8 — realny GameCore boot z aiEmpires + próbkowanie');
{
  reseed('balans-ai-keeper');
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization_boosted', solo: true, aiEmpires: true });
  const K = window.KOSMOS;
  assert(core.empireRegistry.listAll().length > 0, 'aiEmpires=true → imperia SPAWNOWANE mimo solo=true');
  assert(K.randomEventSystem == null, 'solo=true → zdarzenia losowe nadal WYŁĄCZONE (jedna zmienna naraz)');
  assert(!!K.empireStrategySystem && !!K.colonyAutoExpander && !!K.empireColonyBootstrap,
    'warstwa decyzyjna AI wpięta (bez niej pomiar mierzyłby artefakt harnessu)');

  const tel = new AiTelemetry();
  const ctx = { home: core.colonyManager.getColony(K.homePlanet.id), colonyManager: core.colonyManager, core };
  const row0 = tel.sample(0, ctx);
  assert(row0.empires.length === core.empireRegistry.listAll().length, 'migawka pokrywa WSZYSTKIE imperia');
  assert(row0.deps.every(d => d.resolved), 'po wpięciu warstwy: każdy odczyt zależności rozwiązany');
  const e0 = row0.empires[0];
  assert(e0.mother && e0.mother.pop > 0, 'macierzysta imperium znaleziona i ma POP');
  assert(typeof e0.reason === 'string' && e0.reason.length > 0, 'powód decyzji z żywego explainColonization');
  assert(Array.isArray(e0.outpostShort), 'rozbicie braków zestawu placówki obecne');

  new Ticker(core.timeSystem).run(24, { tickSize: 1.0 });   // 2 gy
  const row = tel.sample(2, ctx);
  assert(row.gy === 2 && tel.getSeries().length === 2, 'szereg rośnie po próbkowaniu');
  const dec = tel.getDecisions();
  assert(dec.actionsTotal.expander > 0, 'warstwa B PODEJMUJE decyzje w realnym przebiegu (dziennik nie jest pusty)');
  assert(dec.noops.length > 0 && dec.noops.every(n => typeof n.reasonKey === 'string'),
    'no-opy mają POWÓD (żaden cichy skip)');
  tel.detach();

  // Parytet: bez aiEmpires panel referencyjny zostaje solo (żadnych imperiów).
  // `window.KOSMOS` przeżywa boot (boot przypisuje pola, nie podmienia obiektu), więc
  // czyścimy ślad po poprzednim booie — inaczej test sprawdzałby stan poprzedniej gry.
  delete window.KOSMOS.empireStrategySystem;
  reseed('balans-ai-keeper');
  const core2 = new GameCore();
  core2.boot({ quiet: true, scenario: 'civilization_boosted', solo: true });
  assert(core2.empireRegistry.listAll().length === 0,
    'domyślny boot solo BEZ zmian — panel POP/ZASOBY/ROI/CENY nietknięty');
  assert(window.KOSMOS.empireStrategySystem == null, 'i bez warstwy decyzyjnej AI');
}

// ── T9: progi zdrowia ─────────────────────────────────────────────
console.log('T9 — evaluateThresholds / rollupWarns (progi zdrowia imperium)');
{
  const TH = AI_HEALTH_THRESHOLDS;
  // Szereg-fabryka: gy 0..n, jedno imperium, sterowane parametrami.
  const mkSeries = (n, f) => Array.from({ length: n + 1 }, (_, gy) => ({
    gy, player: { coloniesFull: 1, outposts: 0, home: { pop: 16 } },
    empires: [{ empireId: 'e1', name: 'E1', archetype: 'industrialist', ...f(gy) }],
  }));
  const healthy = (gy) => ({
    coloniesFull: 1, outposts: gy >= 2 ? 2 : 0, atWar: false,
    mother: { pop: 10 + gy, stock: { food: 500, water: 500 }, energyBalance: 20, brownout: false },
  });

  const okRun = evaluateThresholds(mkSeries(12, healthy));
  assert(okRun.warns.length === 0, 'zdrowe imperium → ZERO warnów');
  assert(okRun.checks.some(c => c.code === WARN_CODES.FEW_COLONIES && c.status === 'ok'),
    'zdane sprawdzenia też są raportowane (nie tylko naruszenia)');

  const never = evaluateThresholds(mkSeries(12, (gy) => ({ ...healthy(gy), outposts: 0, coloniesFull: 1 })));
  assert(never.warns.some(w => w.code === WARN_CODES.NO_FIRST_OUTPOST), 'brak placówki przez cały przebieg → WARN');
  assert(never.warns.some(w => w.code === WARN_CODES.FEW_COLONIES), 'i osobno: za mało ciał w punkcie kontrolnym');

  const slow = evaluateThresholds(mkSeries(12, (gy) => ({ ...healthy(gy), outposts: gy >= 9 ? 1 : 0 })));
  const slowW = slow.warns.find(w => w.code === WARN_CODES.SLOW_FIRST_OUTPOST);
  assert(!!slowW && slowW.gy === 9, `placówka po progu (${TH.FIRST_OUTPOST_GY} gy) → WARN z ROKIEM zdarzenia`);
  assert(/× za późno/.test(slowW.detail), 'WARN podaje KROTNOŚĆ przekroczenia progu, nie samą flagę');

  const shortRun = evaluateThresholds(mkSeries(4, healthy));
  assert(shortRun.checks.some(c => c.code === WARN_CODES.FEW_COLONIES && c.status === 'n/a'),
    'przebieg krótszy niż punkt kontrolny → n/a, NIE fałszywy WARN');

  // Spadek populacji: 3 lata z rzędu; wojna = KONTEKST (warn zostaje, z flagą).
  const decl = evaluateThresholds(mkSeries(8, (gy) => ({
    ...healthy(gy), mother: { pop: gy >= 2 && gy <= 5 ? 20 - gy : 20, stock: { food: 5, water: 5 }, energyBalance: 20, brownout: false },
  })));
  const dw = decl.warns.find(w => w.code === WARN_CODES.POP_DECLINE);
  assert(!!dw && dw.years >= TH.POP_DECLINE_YEARS, 'trwały spadek populacji → WARN');
  assert(dw.duringWar === false && /BEZ wojny/.test(dw.detail), 'bez wojny → warn to mówi wprost');
  const declWar = evaluateThresholds(mkSeries(8, (gy) => ({
    ...healthy(gy), atWar: true, mother: { pop: gy >= 2 && gy <= 5 ? 20 - gy : 20, stock: { food: 5, water: 5 }, energyBalance: 20, brownout: false },
  })));
  const dwWar = declWar.warns.find(w => w.code === WARN_CODES.POP_DECLINE);
  assert(!!dwWar && dwWar.duringWar === true,
    'spadek W WOJNIE → warn NADAL raportowany, tylko oznaczony (wojna to kontekst, nie wyciszenie)');

  const dry = evaluateThresholds(mkSeries(8, (gy) => ({
    ...healthy(gy), mother: { ...healthy(gy).mother, stock: { food: gy >= 3 ? 0 : 500, water: 500 } },
  })));
  const dryW = dry.warns.find(w => w.code === WARN_CODES.RESOURCE_ZERO);
  assert(!!dryW && dryW.resource === 'food' && dryW.years > TH.DEFICIT_GY, 'zasób przetrwania na zerze > próg → WARN z NAZWĄ zasobu');
  const blip = evaluateThresholds(mkSeries(8, (gy) => ({
    ...healthy(gy), mother: { ...healthy(gy).mother, stock: { food: gy === 3 ? 0 : 500, water: 500 } },
  })));
  assert(!blip.warns.some(w => w.code === WARN_CODES.RESOURCE_ZERO), 'jednoroczne zero (blip) NIE jest warnem');

  // Energia: mierzona BILANSEM/brownoutem, nie magazynem (energia nie ma magazynu w grze).
  assert(!TH.SURVIVAL_RESOURCES.includes('energy'),
    'energia CELOWO poza kontrolą magazynową (getAmount(energy)=bilans → „0" znaczyłoby „sieć wysycona")');
  assert(!okRun.warns.some(w => w.code === WARN_CODES.ENERGY_DEFICIT), 'dodatni bilans energii → brak warna');
  const brown = evaluateThresholds(mkSeries(8, (gy) => ({
    ...healthy(gy), mother: { ...healthy(gy).mother, brownout: gy >= 2, energyBalance: gy >= 2 ? -5 : 20 },
  })));
  const bw = brown.warns.find(w => w.code === WARN_CODES.ENERGY_DEFICIT);
  assert(!!bw && bw.years > TH.DEFICIT_GY, 'trwały brownout / ujemny bilans → WARN energetyczny');
  const zeroBalance = evaluateThresholds(mkSeries(8, (gy) => ({
    ...healthy(gy), mother: { ...healthy(gy).mother, energyBalance: 0 },
  })));
  assert(!zeroBalance.warns.some(w => w.code === WARN_CODES.ENERGY_DEFICIT),
    'bilans DOKŁADNIE 0 (sieć wysycona) to NIE deficyt — kluczowa różnica vs stara kontrola magazynowa');

  const passive = evaluateThresholds(mkSeries(12, (gy) => ({ ...healthy(gy), mother: null })));
  assert(passive.warns.some(w => w.code === WARN_CODES.NO_MOTHER), 'brak macierzystej → WARN (imperium pasywne)');

  assert(evaluateThresholds([]).warns.length === 0, 'pusty szereg → brak warnów (bez rzutu)');

  const roll = rollupWarns([never.warns, never.warns]);
  const noOutpost = roll.find(r => r.code === WARN_CODES.NO_FIRST_OUTPOST);
  assert(noOutpost.count === 2 && noOutpost.seeds === 2, 'rollup liczy naruszenia i SEEDY osobno');
  assert(/^⚠ WARN {2}AI_/.test(formatWarn(never.warns[0])), 'formatWarn daje stabilną linię WARN');
}

// ── T10: parytet Population 2.0 dla startowej populacji AI ────────
console.log('T10 — startingPops AI trzyma redenominację Population 2.0 (×4 per strata)');
{
  // Jednostka SPRZED Population 2.0 (stan z commita bc87846 — historyczny snapshot, jak progi
  // w migracjach: NIE wolno mu dryfować za żywą stałą, bo wtedy test przestaje cokolwiek pilnować).
  const PRE_POP2 = { laborer: 3, worker: 1, scientist: 1, merchant: 1 };
  const S = 4;   // ten sam mnożnik co SaveMigration._migrateV95toV96

  const sp = INDUSTRIALIST.startingPops ?? {};
  assert(Object.keys(sp).sort().join(',') === Object.keys(PRE_POP2).sort().join(','),
    'zestaw strat bez zmian (reskalowanie ≠ przeprojektowanie składu społecznego)');
  const perStrata = Object.entries(PRE_POP2).every(([k, v]) => sp[k] === v * S);
  assert(perStrata, `każda strata ×${S}: ${JSON.stringify(sp)} (oczekiwane ${JSON.stringify(
    Object.fromEntries(Object.entries(PRE_POP2).map(([k, v]) => [k, v * S])))})`);
  const total = Object.values(sp).reduce((a, b) => a + b, 0);
  assert(total === 24, `suma startowa = 24 POP (było 6 przed parytetem), jest ${total}`);

  // Reguła, nie liczba: ten sam mnożnik co gracz (BOOSTED_STARTER_POP 4→16).
  assert(BOOSTED_STARTER_POP === 16,
    'kotwica reguły: start gracza też jest ×4 (4→16) — gdyby to się zmieniło, parytet AI wymaga rewizji');

  // Ekspansjonista dziedziczy przez structuredClone — nie może się rozjechać.
  assert(JSON.stringify(EXPANSIONIST.startingPops) === JSON.stringify(sp),
    'EXPANSIONIST dziedziczy startingPops z INDUSTRIALIST (klon, nie druga kopia wartości)');

  // Sens gry: housing startowy musi POMIEŚCIĆ nową populację, inaczej kolonia rodzi się w capie
  // wzrostu (Population 2.0: capacity = Σ housing) i „naprawa" zamieniłaby jeden zastój na drugi.
  const startHousing = (INDUSTRIALIST.startingBuildings ?? []).reduce((sum, b) => {
    const def = BUILDINGS[b.buildingId];
    return sum + ((def?.housing ?? 0) * (b.count ?? 1));
  }, 0);
  assert(startHousing >= total,
    `housing budynków startowych (${startHousing}) mieści startową populację (${total})`);
  assert(startHousing > total,
    `…i zostawia zapas na wzrost logistyczny (${startHousing} > ${total})`);
}

console.log(`\n═══ ${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
