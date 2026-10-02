// G1b — AI GARRISON, slice G1b: co się dzieje, gdy jednostka naziemna znika z planszy.
//
//   S2 (Finding 310) — rozpad morale (`morale_collapse`) zwalnia zablokowane POP-y W CAŁOŚCI na kolonii
//        macierzystej, DOKŁADNIE RAZ. Kolonia, która nie należy do właściciela jednostki, nie dostaje
//        nic — POP-y przepadają i jest meldunek (`groundUnit:popsLost` → Dziennik).
//
//   T-D  zrekrutowany garnizon rozpada się w walce (morale 0): pełny koszt POP odblokowany na kolonii
//        macierzystej, żadna inna kolonia się nie zmienia. Przed naprawą: zablokowany na zawsze.
//   T-D2 kolonia macierzysta PRZEJĘTA przed rozpadem: nic nie wraca nigdzie (ani na przejętą kolonię,
//        ani na żadną inną), leci `groundUnit:popsLost` i powstaje wpis w Dzienniku.
//   T-E  ścieżka utrzymania (brak kredytów) dalej zwalnia DOKŁADNIE RAZ. Kontrola pinu: subskrybent
//        `groundUnit:disbanded` bez filtra zwolniłby drugi raz — i ten test by to złapał.
//
// ⚠ Harness: prawdziwy `GameCore` (ColonyManager, GroundUnitManager, kolonie AI z bootstrapu) + własne
//   `CombatSystem`, `EventLogSystem`, `NotificationCenter` (GameCore ich nie montuje; konstruowane PO boocie,
//   bo boot czyści EventBus). Rekrutacja PRAWDZIWĄ ścieżką `startGroundUnitBuild` → `_tickGroundUnitBuilds`
//   → `_spawnGroundUnit`; stubowane są tylko bramki koszar (poziom, sloty) — nie są przedmiotem testu.
// ⚠ Dodatkowa blokada 5 POP na kolonii macierzystej (zakładana PO rekrutacji, żeby nie zablokować bramki
//   wolnych POP): bez niej podwójne zwolnienie zginęłoby w klampie do zera (`unlockPops` ucina na 0)
//   i pin „dokładnie raz" byłby jałowy.
// ⚠ RNG: walka używa gołego `Math.random` — sceny walki podmieniają go na stały stub 0.5 i PRZYWRACAJĄ.

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import { GameCore } from '../headless/GameCore.js';
import { CombatSystem } from '../../systems/CombatSystem.js';
import { EventLogSystem } from '../../systems/EventLogSystem.js';
import { NotificationCenter } from '../../systems/NotificationCenter.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { t } from '../../i18n/i18n.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const DT = 0.25;            // civYear na krok `gum.tick` — 4 kroki na rundę walki
const EXTRA_LOCK = 5;       // blokada „innych" POP-ów — patrz nagłówek
const EPS = 1e-9;

// ── Harness ──────────────────────────────────────────────────────────────────────────────

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  const K = window.KOSMOS;
  const cs  = new CombatSystem();      K.combatSystem      = cs;
  const log = new EventLogSystem();    K.eventLogSystem    = log;
  const nc  = new NotificationCenter(); K.notificationCenter = nc;
  const cm  = core.colonyManager;
  cm._getBarracksLevel = () => 1;      // bramki koszar — nie są przedmiotem testu
  cm._getBarracksSlots = () => 3;
  const home = cm.getColony(K.homePlanet.id);
  const ai   = cm.getAllColonies().find(c => c.ownerEmpireId);
  const w = { core, K, cs, log, nc, cm, gum: K.groundUnitManager, home, ai, emp: ai.ownerEmpireId,
              ev: { disbanded: [], destroyed: [], popsLost: [] } };
  EventBus.on('groundUnit:disbanded', (e) => w.ev.disbanded.push(e));
  EventBus.on('groundUnit:destroyed', (e) => w.ev.destroyed.push(e));
  EventBus.on('groundUnit:popsLost',  (e) => w.ev.popsLost.push(e));
  return w;
}

/** Rekrutacja PRAWDZIWĄ ścieżką (bramki koszar zestubowane w `boot`). */
function recruit(w, colony, archetypeId) {
  const cost = { ...(ColonyManager.GROUND_UNIT_BUILD_COSTS[archetypeId] ?? {}),
                 ...(ColonyManager.GROUND_UNIT_COMMODITY_COSTS[archetypeId] ?? {}) };
  colony.credits = Math.max(colony.credits ?? 0, 10000);
  for (const [k, v] of Object.entries(cost)) colony.resourceSystem.receive({ [k]: v });
  const before = new Set(w.gum._units.keys());
  const r = w.cm.startGroundUnitBuild(colony.planetId, archetypeId);
  if (!r?.ok) throw new Error(`rekrutacja ${archetypeId} odrzucona: ${JSON.stringify(r)}`);
  w.cm._tickGroundUnitBuilds(ColonyManager.GROUND_UNIT_BUILD_TIMES[archetypeId] ?? 5);
  const id = [...w.gum._units.keys()].find(k => !before.has(k));
  if (!id) throw new Error(`rekrutacja ${archetypeId}: jednostka nie powstała`);
  return w.gum.getUnit(id);
}

const lockOf = (colony) => colony?.civSystem?._lockedPerStrata?.laborer ?? 0;
const otherColonies = (w, ...skip) => w.cm.getAllColonies().filter(c => !skip.includes(c));
const snapLocks = (cols) => new Map(cols.map(c => [c.planetId, lockOf(c)]));
const unchanged = (before, cols) => cols.every(c => Math.abs(lockOf(c) - before.get(c.planetId)) < EPS);

function drive(w, W, stop = null) {
  let t = 0;
  while (t < W - 1e-9) {
    w.gum.tick(DT);
    t += DT;
    if (stop && stop(w)) break;
  }
}

function withFixedRng(fn) {
  const real = Math.random;
  Math.random = () => 0.5;
  try { return fn(); } finally { Math.random = real; }
}

/** Garnizon okopany vs szturm AI (hp 400, morale 100 — nie ginie i nie ucieka) aż do rozpadu garnizonu. */
function collapseGarrison(w, g) {
  g.deployState = 'deployed'; g.stateTimer = 0; w.gum._applyDeployStateStats(g);
  const e = w.gum.createUnit('shock_infantry', g.planetId, g.q, g.r, { owner: w.emp, factionId: w.emp, hp: 400 });
  e.morale = 100; e.maxMorale = 100;
  withFixedRng(() => drive(w, 20, (ww) => !ww.gum._units.has(g.id)));
  return e;
}

const journalTexts = (w) => w.log.getEntries().map(x => x.text);

// ── T-D — rozpad zwalnia pełny koszt na kolonii macierzystej ─────────────────────────────
console.log('T-D — zrekrutowany garnizon rozpada się w walce: pełny koszt POP wraca na kolonię macierzystą, raz');
{
  const w = boot();
  const L0 = lockOf(w.home);
  const g = recruit(w, w.home, 'garrison_unit');
  const cost = ColonyManager.GROUND_UNIT_POP_COSTS.garrison_unit;
  assert(g.popCost === cost && g.homeColonyId === w.home.planetId && g.owner === 'player' &&
         Math.abs(lockOf(w.home) - (L0 + cost)) < EPS,
    `T-D: rekrutacja prawdziwą ścieżką — popCost ${g.popCost}, home ${g.homeColonyId}, blokada ${L0} → ${lockOf(w.home)}`);
  w.home.civSystem.lockPops(EXTRA_LOCK, 'laborer');
  const beforeCollapse = lockOf(w.home);
  const others = otherColonies(w, w.home);
  const othersBefore = snapLocks(others);
  collapseGarrison(w, g);
  const disb = w.ev.disbanded.filter(e => e.unitId === g.id);
  assert(disb.length === 1 && disb[0].reason === 'morale_collapse',
    `T-D: garnizon zniknął przez ROZPAD MORALE (${JSON.stringify(disb.map(e => e.reason))}) — scena mierzy właściwą ścieżkę`);
  assert(Math.abs(lockOf(w.home) - (beforeCollapse - cost)) < EPS,
    `T-D SEDNO: po rozpadzie blokada na kolonii macierzystej ${beforeCollapse} → ${lockOf(w.home)} ` +
    `(oczekiwane ${beforeCollapse - cost}: −${cost} DOKŁADNIE RAZ) — przed naprawą zostawała zablokowana na zawsze`);
  assert(unchanged(othersBefore, others),
    `T-D: żadna inna kolonia (${others.length}) nie dostała nic`);
  assert(w.ev.popsLost.length === 0,
    `T-D: brak meldunku o utracie (popsLost=${w.ev.popsLost.length}) — kolonia macierzysta jest nasza`);
}

// ── T-D2 — przejęta kolonia macierzysta: nic nie wraca, jest meldunek ───────────────────
console.log('T-D2 — kolonia macierzysta przejęta przed rozpadem: POP-y przepadają, jest meldunek, nikt nic nie dostaje');
{
  const w = boot();
  const g = recruit(w, w.home, 'garrison_unit');
  const cost = ColonyManager.GROUND_UNIT_POP_COSTS.garrison_unit;
  w.cm.transferColony(w.home.planetId, w.emp, 'invasion');
  assert(w.home.ownerEmpireId === w.emp && g.homeColonyId === w.home.planetId,
    `T-D2: kolonia macierzysta ${w.home.planetId} należy teraz do ${w.home.ownerEmpireId} (jednostka dalej wskazuje ją jako dom)`);
  const all = w.cm.getAllColonies();
  const locksBefore = snapLocks(all);
  collapseGarrison(w, g);
  assert(w.ev.disbanded.some(e => e.unitId === g.id && e.reason === 'morale_collapse'),
    'T-D2: garnizon rozpadł się (scena mierzy właściwą ścieżkę)');
  assert(unchanged(locksBefore, all),
    `T-D2 STRAŻNIK reguły właściciela: ŻADNA kolonia nie dostała POP-ów — także przejęta kolonia macierzysta ` +
    `(blokada ${locksBefore.get(w.home.planetId)} → ${lockOf(w.home)}). Zielony także przed naprawą (wtedy nie ` +
    'zwalniało się nic) — pada dopiero przy naprawie, która oddałaby POP-y koloni nienależącej do właściciela');
  const lost = w.ev.popsLost.filter(e => e.unitId === g.id);
  assert(lost.length === 1 && Math.abs(lost[0].amount - cost) < EPS && lost[0].cause === 'morale_collapse',
    `T-D2: jeden meldunek \`groundUnit:popsLost\` (${JSON.stringify(lost.map(e => ({ amount: e.amount, cause: e.cause })))})`);
  const expected = t('event.groundUnit.popsLost', cost.toFixed(1), t('groundUnit.garrison_unit'));
  assert(journalTexts(w).filter(x => x === expected).length === 1,
    `T-D2: w Dzienniku jest wpis o utracie („${expected}") — strata nie jest cicha`);
}
{
  // Czułość strażnika: ta sama scena z „naprawą" BEZ terminu właściciela (dom = dowolna kolonia o tym id)
  // oddałaby POP-y przejętej koloni — i strażnik wyżej by to zobaczył. Wymaga mechanizmu S2 (przed nim
  // nic się nie zwalnia, więc nie ma czego podmienić) — to NIE jest kontrola zielona po obu stronach.
  const w = boot();
  const g = recruit(w, w.home, 'garrison_unit');
  const cost = ColonyManager.GROUND_UNIT_POP_COSTS.garrison_unit;
  w.cm.transferColony(w.home.planetId, w.emp, 'invasion');
  w.cm._ownedHomeColony = (u) => w.cm.getColony(u?.homeColonyId) ?? null;   // termin właściciela USUNIĘTY
  const before = lockOf(w.home);
  collapseGarrison(w, g);
  assert(Math.abs(lockOf(w.home) - (before - cost)) < EPS,
    `T-D2 CZUŁOŚĆ STRAŻNIKA: bez terminu właściciela przejęta kolonia dostałaby ${cost} POP (${before} → ${lockOf(w.home)})`);
}

// ── T-E — utrzymanie zwalnia dokładnie raz ───────────────────────────────────────────────
console.log('T-E — rozwiązanie z braku utrzymania dalej zwalnia POP-y DOKŁADNIE RAZ');
{
  const runUpkeep = (naiveSubscriber) => {
    const w = boot();
    const s = recruit(w, w.home, 'shock_infantry');
    const cost = ColonyManager.GROUND_UNIT_POP_COSTS.shock_infantry;
    w.home.civSystem.lockPops(EXTRA_LOCK, 'laborer');
    if (naiveSubscriber) {
      // „subskrybent bez filtra" — zwalnia na KAŻDE rozwiązanie, nie patrząc, kto już zwolnił
      EventBus.on('groundUnit:disbanded', () => w.home.civSystem.unlockPops(cost, 'laborer'));
    }
    w.home.credits = 0;
    const before = lockOf(w.home);
    for (let i = 0; i < ColonyManager.UPKEEP_GRACE_CIVYEARS; i++) w.cm._tickGroundUnitUpkeep(1.0);
    return { w, s, cost, before, after: lockOf(w.home),
             disb: w.ev.disbanded.filter(e => e.unitId === s.id) };
  };
  const r = runUpkeep(false);
  assert(r.disb.length === 1 && r.disb[0].reason === 'no_credits' && !r.w.gum._units.has(r.s.id),
    `T-E: szturm rozwiązany z braku utrzymania po ${ColonyManager.UPKEEP_GRACE_CIVYEARS} latach (${JSON.stringify(r.disb.map(e => e.reason))})`);
  assert(Math.abs(r.after - (r.before - r.cost)) < EPS,
    `T-E SEDNO: blokada ${r.before} → ${r.after} (oczekiwane ${r.before - r.cost}: −${r.cost} DOKŁADNIE RAZ, ` +
    'także przy podpiętych prawdziwych subskrybentach Dziennika)');
  const c = runUpkeep(true);
  assert(Math.abs(c.after - (c.before - 2 * c.cost)) < EPS,
    `T-E KONTROLA PINU: subskrybent bez filtra zwolniłby DRUGI raz (${c.before} → ${c.after}) — pin wyżej to widzi`);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
