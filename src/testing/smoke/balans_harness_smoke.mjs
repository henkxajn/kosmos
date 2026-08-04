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
import { canColonize, canDoRecon } from '../../entities/Vessel.js';
import EventBus from '../../core/EventBus.js';

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

// ── T6: 5C slider action — SET_STRATA_TARGET → CivilizationSystem.setStrataTarget (intent-method) ──
console.log('\nT6 — 5C slider action (real intent-method setStrataTarget, Task 4a)');
{
  const c = new GameCore();
  c.boot({ quiet: true, scenario: 'civilization_boosted', solo: true });
  const civ = c.colonyManager.getColony(window.KOSMOS.homePlanet.id).civSystem;

  assert(civ.getStrataTarget('laborer') === 0, 'baseline: brak targetu laborer (share 0)');
  const r = ActionAdapter.execute({ type: ACTION_TYPES.SET_STRATA_TARGET, strataType: 'laborer', share: 0.35 });
  assert(r.event === 'civ:setStrataTarget', 'SET_STRATA_TARGET routuje do setStrataTarget (nie EventBus)');
  assert(Math.abs(civ.getStrataTarget('laborer') - 0.35) < 1e-9, 'share zapisany przez REALNĄ metodę (0.35)');
  assert(civ.getTargetState('laborer') !== 'off', 'getTargetState odzwierciedla ustawiony target (nie off)');

  // neutralizacja: share ≤ 0 czyści target (kontrakt metody)
  ActionAdapter.execute({ type: ACTION_TYPES.SET_STRATA_TARGET, strataType: 'laborer', share: 0 });
  assert(civ.getStrataTarget('laborer') === 0, 'share 0 czyści target (neutralny)');

  // walidacja: nieznana strata / brak typu odrzucone
  assert(ActionAdapter.execute({ type: ACTION_TYPES.SET_STRATA_TARGET, strataType: 'nonsense', share: 0.5 }).emitted === false,
         'nieznana strata odrzucona');
  assert(ActionAdapter.execute({ type: ACTION_TYPES.SET_STRATA_TARGET, share: 0.5 }).emitted === false,
         'brak strataType odrzucony');
}

// ── T7: colonizer path + load-POP (real capacity, NIE hardcoded 2) — Task 4b ──
console.log('\nT7 — real colonizer (hull+habitat) + load-POP z realnej pojemności');
{
  const c = new GameCore();
  c.boot({ quiet: true, scenario: 'civilization_boosted', solo: true });
  const K = window.KOSMOS;
  const home = c.colonyManager.getColony(K.homePlanet.id);
  const civ = home.civSystem;

  // (a) capability gate: hull+habitat → canColonize; cargo_ship → NIE (ślepa uliczka RuleBota v4)
  const colo = { id: 'v_colo', shipId: 'hull_small', colonyId: home.planetId,
    modules: ['engine_chemical', 'habitat_pod'], colonistCapacity: 4, colonists: 0,
    position: { state: 'docked', dockedAt: home.planetId } };
  assert(canColonize(colo) === true, 'hull_small + habitat_pod → canColonize=true');
  assert(canColonize({ shipId: 'cargo_ship', modules: [] }) === false,
         'cargo_ship (brak modułu habitat) → canColonize=false');

  // (b) load-POP: ładuje do REALNEJ pojemności modułu (4), NIE stałej 2; fizycznie drenuje home POP
  civ.setPopulation(40);   // gwarantuj nadwyżkę freePops > pojemności (4), by rozróżnić „4" od „2"
  K.vesselManager._vessels.set('v_colo', colo);
  const freeBefore = Math.floor(civ.freePops);
  assert(freeBefore >= 5, `home ma nadwyżkę POP (freePops=${freeBefore} ≥ 5, pozwala rozróżnić 4 vs 2)`);
  const r = ActionAdapter.execute({ type: ACTION_TYPES.LOAD_COLONISTS, vesselId: 'v_colo' });
  assert(r.event === 'vessel:loadColonists', 'LOAD_COLONISTS routuje do loadColonists (real path)');
  assert(colo.colonists === 4, `załadowano REALNĄ pojemność modułu (4), NIE hardcoded 2 (było ${colo.colonists})`);
  assert(Math.floor(civ.freePops) === freeBefore - 4, 'POP fizycznie zdrenowany z home (POP-drain measurement)');

  // (c) count override respektowany (gdy bot poda mniej niż pojemność)
  const colo2 = { id: 'v_colo2', shipId: 'hull_small', colonyId: home.planetId,
    modules: ['habitat_pod'], colonistCapacity: 4, colonists: 0,
    position: { state: 'docked', dockedAt: home.planetId } };
  K.vesselManager._vessels.set('v_colo2', colo2);
  ActionAdapter.execute({ type: ACTION_TYPES.LOAD_COLONISTS, vesselId: 'v_colo2', count: 2 });
  assert(colo2.colonists === 2, 'jawny count=2 respektowany (parametr, nie sufit)');
}

// ── T8: real ship-build/colonize paths (groundBuildable hull, colonize→colony alias) ──
console.log('\nT8 — groundBuildable recon/kolonizator (hull+moduły) + alias colonize→colony');
{
  // (a) recon = hull_small + science_lab → canDoRecon; kolonizator = hull_small + habitat_pod → canColonize.
  //     Legacy science_vessel/cargo_ship: NIE groundBuildable → orbital-only (nie da się z naziemnej).
  assert(canDoRecon({ shipId: 'hull_small', modules: ['engine_chemical', 'science_lab'] }) === true,
         'hull_small + science_lab → canDoRecon (survey)');
  assert(canColonize({ shipId: 'hull_small', modules: ['engine_chemical', 'habitat_pod'], colonistCapacity: 4 }) === true,
         'hull_small + habitat_pod → canColonize');

  // (b) alias colonize→colony: EXPEDITION missionType='colonize' MUSI emitować type='colony'
  //     (handler expedition:sendRequest woła _launch(type) bezpośrednio; _launch zakłada 'colony').
  let seen = null;
  const h = ({ type }) => { seen = type; };
  EventBus.on('expedition:sendRequest', h);
  const r = ActionAdapter.execute({ type: ACTION_TYPES.EXPEDITION, missionType: 'colonize', targetId: 'x', vesselId: 'v' });
  EventBus.off('expedition:sendRequest', h);
  assert(r.type === 'colony' && seen === 'colony', `colonize→colony (emitted type='${seen}', nie 'colonize')`);

  // (c) inne typy misji przechodzą bez zmian (recon zostaje recon)
  let seen2 = null;
  const h2 = ({ type }) => { seen2 = type; };
  EventBus.on('expedition:sendRequest', h2);
  ActionAdapter.execute({ type: ACTION_TYPES.EXPEDITION, missionType: 'recon', targetId: 'x', vesselId: 'v' });
  EventBus.off('expedition:sendRequest', h2);
  assert(seen2 === 'recon', 'recon NIE aliasowany (tylko colonize→colony)');
}

// ── T9: multi-colony producer registration (Task 6 de-risk) — direct bypasses active-guard ──
console.log('\nT9 — producenci rejestrują się na NIE-aktywnej kolonii (direct ≠ event guard)');
{
  const { ResourceSystem } = await import('../../systems/ResourceSystem.js');
  // rs2 = świeży ResourceSystem, NIE ustawiony jako aktywny (window.KOSMOS.resourceSystem).
  const rs2 = new ResourceSystem();
  const activeRs = window.KOSMOS.resourceSystem;
  assert(activeRs !== rs2, 'rs2 nie jest aktywnym ResourceSystem (symuluje 2. kolonię)');

  // (a) DIRECT registerProducer (ścieżka _reapplyAllRates) — BEZ guardu → rejestruje.
  rs2.registerProducer('mine_test', { Fe: 5 });
  assert(rs2._producers.has('mine_test'), 'direct registerProducer działa na nie-aktywnej kolonii (Fe:5)');
  assert((rs2.getPerYear?.('Fe') ?? 0) > 0, 'produkcja nie-aktywnej kolonii liczy się (rate>0, nie 0)');

  // (b) EVENT resource:registerProducer — GUARD (tylko aktywna) → NIE rejestruje na rs2.
  EventBus.emit('resource:registerProducer', { id: 'ghost', rates: { Fe: 99 } });
  assert(!rs2._producers.has('ghost'),
         'event resource:registerProducer NIE rejestruje na nie-aktywnej (guard aktywnej kolonii)');
  // ⚠ To dlaczego BuildingSystem używa DIRECT (_reapplyAllRates), nie eventu — inaczej 2. kolonia = 0 produkcji.
  rs2.dispose?.();
}

// ── T10: seed panel — planetClass injection (GOOD_FE/MEDIAN/POOR) — Task 7 ──
console.log('\nT10 — seed panel (klasy planet: złoża/atmosfera deterministyczne)');
{
  const feRich = (c) => {
    const g = new GameCore();
    g.boot({ quiet: true, scenario: 'civilization_boosted', solo: true, planetClass: c });
    const p = window.KOSMOS.homePlanet;
    const fe = (p.deposits ?? []).find(d => d.resourceId === 'Fe');
    const xe = (p.deposits ?? []).find(d => d.resourceId === 'Xe');
    return { feRichness: fe?.richness ?? 0, atmo: p.atmosphere, hasXe: !!xe };
  };
  const good = feRich('GOOD_FE'), med = feRich('MEDIAN'), poor = feRich('POOR');
  assert(good.feRichness > med.feRichness && med.feRichness > poor.feRichness,
         `Fe richness GOOD_FE(${good.feRichness}) > MEDIAN(${med.feRichness}) > POOR(${poor.feRichness})`);
  assert(good.atmo === 'breathable' && poor.atmo === 'thin', 'GOOD_FE breathable / POOR thin (klasa steruje atmosferą)');
  assert(good.hasXe && med.hasXe && poor.hasXe, 'Xe gwarantowane w każdej klasie (_setupColony)');
  // null (domyślne) = losowa planeta z generateCivScenario (bez injekcji)
  const rnd = new GameCore();
  rnd.boot({ quiet: true, scenario: 'civilization_boosted', solo: true });   // planetClass null
  assert((window.KOSMOS.homePlanet.deposits?.length ?? 0) > 0, 'planetClass=null → losowa planeta (bez override, deposits istnieją)');
}

// ── T11: droid install action (INSTALL_DROID → installSyntheticForStrata) — Gate 2 fix B ──
console.log('\nT11 — droid install action (real intent installSyntheticForStrata)');
{
  const c = new GameCore();
  c.boot({ quiet: true, scenario: 'civilization_boosted', solo: true, planetClass: 'GOOD_FE' });
  const home = c.colonyManager.getColony(window.KOSMOS.homePlanet.id);
  // Bez droida w magazynie → install zwraca success=false (no_commodity), ale routuje do realnej metody.
  const r0 = ActionAdapter.execute({ type: ACTION_TYPES.INSTALL_DROID, strataType: 'laborer' });
  assert(r0.event === 'building:installDroid', 'INSTALL_DROID routuje do installSyntheticForStrata (nie EventBus)');
  assert(r0.success === false, 'bez automation_droid w magazynie → install nieudany (real gate no_commodity)');
  // Z droidem w magazynie → install się udaje (substytuuje POP na budynku laborer).
  home.resourceSystem.receive({ automation_droid: 2 });
  const synthBefore = home.buildingSystem.getSyntheticJobs('laborer');
  const r1 = ActionAdapter.execute({ type: ACTION_TYPES.INSTALL_DROID, strataType: 'laborer' });
  assert(r1.success === true, 'z automation_droid w magazynie → install udany');
  assert(home.buildingSystem.getSyntheticJobs('laborer') > synthBefore, 'synthetic jobs laborer wzrosło (droid obsadził etat)');
  assert(Math.round(home.resourceSystem.getAmount('automation_droid')) === 1, 'zużyto 1 automation_droid z magazynu');
  // walidacja: brak strataType odrzucony
  assert(ActionAdapter.execute({ type: ACTION_TYPES.INSTALL_DROID }).emitted === false, 'brak strataType odrzucony');
}

// ── T12: droid RELEASE action (RELEASE_DROID → removeSyntheticForStrata) — two-way juggle ──
console.log('\nT12 — droid release action (real intent removeSyntheticForStrata, +1 do magazynu)');
{
  const c = new GameCore();
  c.boot({ quiet: true, scenario: 'civilization_boosted', solo: true, planetClass: 'GOOD_FE' });
  const home = c.colonyManager.getColony(window.KOSMOS.homePlanet.id);
  // Zainstaluj droida (setup), potem zwolnij — sprawdź round-trip magazynu.
  home.resourceSystem.receive({ automation_droid: 1 });
  const inst = ActionAdapter.execute({ type: ACTION_TYPES.INSTALL_DROID, strataType: 'laborer' });
  assert(inst.success === true, 'setup: droid zainstalowany na laborer');
  assert(Math.round(home.resourceSystem.getAmount('automation_droid')) === 0, 'setup: magazyn 0 po instalacji');
  const synBefore = home.buildingSystem.getSyntheticJobs('laborer');
  assert(synBefore >= 1, 'setup: getSyntheticJobs laborer ≥ 1');

  const r = ActionAdapter.execute({ type: ACTION_TYPES.RELEASE_DROID, strataType: 'laborer' });
  assert(r.event === 'building:releaseDroid', 'RELEASE_DROID routuje do removeSyntheticForStrata (nie EventBus)');
  assert(r.success === true, 'release udany (był droid do zwolnienia)');
  assert(r.returned === true, 'droid ZWRÓCONY do magazynu (FEATURES.popAllocation2=true)');
  assert(home.buildingSystem.getSyntheticJobs('laborer') < synBefore, 'synthetic jobs laborer spadło (etat wraca do POP)');
  assert(Math.round(home.resourceSystem.getAmount('automation_droid')) === 1, 'magazyn +1 automation_droid (release → inwentarz)');

  // release bez zainstalowanego droida = benign fail (no_synthetic), ale routuje do realnej metody
  const r2 = ActionAdapter.execute({ type: ACTION_TYPES.RELEASE_DROID, strataType: 'miner' });
  assert(r2.event === 'building:releaseDroid' && r2.success === false, 'release bez droida = success=false (real gate)');
  // walidacja: brak strataType odrzucony
  assert(ActionAdapter.execute({ type: ACTION_TYPES.RELEASE_DROID }).emitted === false, 'brak strataType odrzucony');
}

// ── T13: scout servicing actions (ORDER_RETURN → event; REFUEL → manualRefuel) — Task 1 ──
console.log('\nT13 — scout servicing actions (orderReturn event + manualRefuel intent)');
{
  const c = new GameCore();
  c.boot({ quiet: true, scenario: 'civilization_boosted', solo: true, planetClass: 'GOOD_FE' });
  const K = window.KOSMOS;

  // (a) ORDER_RETURN emituje expedition:orderReturn z expeditionId
  let seenExpId = null;
  const h = ({ expeditionId }) => { seenExpId = expeditionId; };
  EventBus.on('expedition:orderReturn', h);
  const r = ActionAdapter.execute({ type: ACTION_TYPES.ORDER_RETURN, expeditionId: 'exp_42' });
  EventBus.off('expedition:orderReturn', h);
  assert(r.event === 'expedition:orderReturn' && seenExpId === 'exp_42', 'ORDER_RETURN emituje expedition:orderReturn{expeditionId}');
  assert(ActionAdapter.execute({ type: ACTION_TYPES.ORDER_RETURN }).emitted === false, 'ORDER_RETURN bez expeditionId odrzucony');

  // (b) REFUEL routuje do VesselManager.manualRefuel (real intent). Zadokowany statek z niepełnym bakiem → pełny.
  const colo = { id: 'v_ref', shipId: 'hull_small', colonyId: K.homePlanet.id,
    modules: ['engine_chemical', 'deep_scanner'],
    fuel: { current: 1, max: 8, capacity: 8, consumption: 0.4 },
    warpFuel: { current: 0, max: 0 },
    position: { state: 'docked', dockedAt: K.homePlanet.id }, status: 'idle', refuelAutomatically: true };
  K.vesselManager._vessels.set('v_ref', colo);
  const home = c.colonyManager.getColony(K.homePlanet.id);
  home.resourceSystem.receive({ fuel: 50 });   // magazyn ma paliwo do tankowania
  const rr = ActionAdapter.execute({ type: ACTION_TYPES.REFUEL, vesselId: 'v_ref' });
  assert(rr.event === 'vessel:manualRefuel', 'REFUEL routuje do manualRefuel (nie EventBus)');
  assert(colo.fuel.current > 1, `manualRefuel dotankował bak (${colo.fuel.current} > 1, natychmiast z magazynu)`);
  assert(ActionAdapter.execute({ type: ACTION_TYPES.REFUEL }).emitted === false, 'REFUEL bez vesselId odrzucony');
}

// ── Wynik ─────────────────────────────────────────────────────────
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
