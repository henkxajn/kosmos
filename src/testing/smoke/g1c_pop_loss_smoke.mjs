// G1c — AI GARRISON, rodzina „utrata POP”: co się dzieje z POP jednostki naziemnej GRACZA na każdej drodze wyjścia.
//
// Podpis właściciela (2026-10-02 i 2026-10-03; `docs/design/AI_GARRISON_PLAN.md` §3 G1c, §5d (a)):
//   P1 (Finding 333) gdy jednostka ginie, część jej POP, której tabela śmierci nie oddaje, NAPRAWDĘ GINIE: znika z populacji
//      kolonii macierzystej razem ze swoją blokadą. Żadna POP nie zostaje zablokowana na zawsze.
//   P2 (Finding 330) ręczne rozwiązanie oddaje pełny koszt POP od razu, jak brak utrzymania i rozpad morale — nie przez
//      tabelę śmierci.
//   P3 (Finding 328) kolejka opóźnionych zwrotów POP przeżywa zapis i wczytanie; starszy zapis bez niej wczytuje się czysto.
//   P4 (Finding 329) żadna kolonia innego właściciela nie płaci ani nie dostaje nic za jednostkę.
//   P5 (Finding 327) jednostka zabita przez minę idzie tą samą drogą śmierci co każda inna.
//   P6 (R7) jednostka gracza utracona razem ze zniszczonym ciałem — jak polegli (tabela śmierci), nie pełny zwrot.
//
//   L1  (P1) śmierć: w chwili śmierci ginie część nieoddana przez tabelę — populacja i blokada domu spadają o nią; zwrot
//       czeka w kolejce i po zwłoce blokada wraca do stanu sprzed rekrutacji (nic zablokowanego na zawsze). Kontrole:
//       tabela oddaje całość (garnizon) — nic nie ginie; dom przejęty — kolonia innego właściciela nietknięta, meldunek.
//       Archetyp spoza tabeli — ginie całość. Przyczyna `civ:popDied` = `ground_unit_lost`; okręty bez zmian; Dziennik
//       (`UIManager`) bez osobnej linii (pin źródłowy).
//   L2  (P2) ręczne rozwiązanie (`ColonyManager.disbandGroundUnit`): pełny koszt wraca od razu (populacja bez zmian,
//       blokada do stanu sprzed rekrutacji, kolejka pusta), jedno `groundUnit:disbanded` (manual), zero
//       `groundUnit:destroyed`; dom przejęty — meldunek, kolonia innego właściciela nietknięta; jednostka AI — odmowa.
//       Karta jednostki (`UnitCardPanel`) woła tę metodę i nie emituje śmierci (pin źródłowy).
//
// ⚠ Harness jak `ground_unit_loss_smoke`: prawdziwy `GameCore` (ColonyManager, GroundUnitManager, kolonie AI z bootstrapu)
//   + własne `CombatSystem`, `EventLogSystem`, `NotificationCenter` (GameCore ich nie montuje; po boocie, bo boot czyści
//   EventBus). Rekrutacja PRAWDZIWĄ ścieżką `startGroundUnitBuild` → `_tickGroundUnitBuilds` → `_spawnGroundUnit`;
//   stubowane są tylko bramki koszar (poziom, sloty). Mobilizacja garnizonów AI wyłączona.
// ⚠ „Populacja” = `civSystem.humans` (populacja + ułamek `_growthProgress`): śmierć ułamka POP zmienia ułamek, więc liczba
//   całkowita by jej nie pokazała. „Blokada” = `_lockedPerStrata.laborer` (rekrutacja blokuje typowo `laborer`).
// ⚠ Nowe metody wołane przez `typeof … === 'function'` — na kodzie sprzed kroku pin dostaje kolor, przebieg się nie wywraca.
// ⚠ Każdy pin wykluczający ma ŚWIADKA (jednostka naprawdę zniknęła właściwą drogą); kontrole są zielone po obu stronach.
// ⚠ Źródło czytane bez komentarzy i z LF (pin niezależny od checkoutu).

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import EntityManager from '../../core/EntityManager.js';
import { GameCore } from '../headless/GameCore.js';
import { CombatSystem } from '../../systems/CombatSystem.js';
import { EventLogSystem } from '../../systems/EventLogSystem.js';
import { NotificationCenter } from '../../systems/NotificationCenter.js';
import { SupplyCoverageSystem } from '../../systems/SupplyCoverageSystem.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import * as VS from '../../entities/Vessel.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const EPS = 1e-9;
const DT = 0.25;                       // civY na krok `gum.tick` (walka)
const COST = ColonyManager.GROUND_UNIT_POP_COSTS;
const RI = ColonyManager.GROUND_UNIT_POP_REINTEGRATION;
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const call = (obj, name, ...args) => (typeof obj?.[name] === 'function' ? obj[name](...args) : undefined);

// ── Harness ──────────────────────────────────────────────────────────────────────────────
function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
}
function boot({ war = true } = {}) {
  const core = new GameCore();
  quiet(() => core.boot({ quiet: true, scenario: 'civilization' }));
  const K = window.KOSMOS;
  K.combatSystem = new CombatSystem();
  K.eventLogSystem = new EventLogSystem();
  K.notificationCenter = new NotificationCenter();
  const cm = core.colonyManager;
  cm._getBarracksLevel = () => 1;      // bramki koszar — nie są przedmiotem testu
  cm._getBarracksSlots = () => 3;
  if (K.garrisonSystem) K.garrisonSystem.enabled = false;
  const home = cm.getColony(K.homePlanet.id);
  const ai = cm.getAllColonies().find(c => c.ownerEmpireId && !c.isOutpost);
  if (war) quiet(() => K.diplomacySystem.declareWar(ai.ownerEmpireId, 'keeper_setup'));
  const w = { core, K, cm, gum: K.groundUnitManager, home, ai, emp: ai.ownerEmpireId,
              ev: { popsLost: [], destroyed: [], disbanded: [], popDied: [] } };
  EventBus.on('groundUnit:popsLost',  (e) => w.ev.popsLost.push(e));
  EventBus.on('groundUnit:destroyed', (e) => w.ev.destroyed.push(e));
  EventBus.on('groundUnit:disbanded', (e) => w.ev.disbanded.push(e));
  EventBus.on('civ:popDied',          (e) => w.ev.popDied.push(e));
  return w;
}
/** Rekrutacja PRAWDZIWĄ ścieżką (bramki koszar zestubowane w `boot`). */
function recruit(w, colony, archetypeId = 'shock_infantry') {
  const cost = { ...(ColonyManager.GROUND_UNIT_BUILD_COSTS[archetypeId] ?? {}),
                 ...(ColonyManager.GROUND_UNIT_COMMODITY_COSTS[archetypeId] ?? {}) };
  colony.credits = Math.max(colony.credits ?? 0, 10000);
  for (const [k, v] of Object.entries(cost)) colony.resourceSystem.receive({ [k]: v });
  const before = new Set(w.gum._units.keys());
  const r = quiet(() => w.cm.startGroundUnitBuild(colony.planetId, archetypeId));
  if (!r?.ok) throw new Error(`rekrutacja ${archetypeId} odrzucona: ${JSON.stringify(r)}`);
  quiet(() => w.cm._tickGroundUnitBuilds(ColonyManager.GROUND_UNIT_BUILD_TIMES[archetypeId] ?? 5));
  const id = [...w.gum._units.keys()].find(k => !before.has(k));
  if (!id) throw new Error(`rekrutacja ${archetypeId}: jednostka nie powstała`);
  const u = w.gum.getUnit(id);
  u.morale = u.maxMorale = 100;
  return u;
}
const lockOf = (c) => c?.civSystem?._lockedPerStrata?.laborer ?? 0;
const humansOf = (c) => c?.civSystem?.humans ?? NaN;
const pendingOf = (c, id = null) => (c?._pendingPopReturns ?? []).filter(e => !id || e.unitId === id).map(e => e.amount);
const snapOthers = (w, skip) => new Map(w.cm.getAllColonies().filter(c => !skip.includes(c))
  .map(c => [c.planetId, [lockOf(c), humansOf(c)]]));
const othersUnchanged = (w, snap) => [...snap].every(([pid, [l, h]]) => {
  const c = w.cm.getColony(pid);
  return !c || (near(lockOf(c), l) && near(humansOf(c), h));
});
const lostOf = (w, id) => w.ev.popsLost.filter(e => e.unitId === id);
/** Postaw jednostkę na wolnym heksie kolonii (jak po desancie). */
function placeOn(w, unit, colony) {
  const spot = w.cm._findGroundUnitSpawn(colony);
  unit.planetId = colony.planetId; unit.q = spot.q; unit.r = spot.r;
  return spot;
}
/** Ciało bez kolonii w układzie domowym (niczyje). */
function neutralBody(w) {
  const sys = EntityManager.get(w.home.planetId)?.systemId;
  return ['moon', 'planet', 'planetoid'].flatMap(tp => EntityManager.getByType(tp))
    .find(b => b.systemId === sys && b.id !== w.home.planetId && !w.cm.getColony(b.id)) ?? null;
}
function withFixedRng(fn) {
  const real = Math.random;
  Math.random = () => 0.5;
  try { return fn(); } finally { Math.random = real; }
}
function drive(w, civY, stop = null) {
  let t = 0;
  while (t < civY - 1e-9) { w.gum.tick(DT); t += DT; if (stop && stop(w)) break; }
}

// ── Drogi wyjścia (PRAWDZIWY kod gry) ─────────────────────────────────────────────────────
/** Ostrzał z orbity na heks jednostki (`GroundUnitManager._onOrbitalStrike`). */
const bombard = (w, u) => w.gum._onOrbitalStrike({ planetId: u.planetId, q: u.q, r: u.r, damage: 99999, ownerId: 'player' });
/** Walka: na ciele `colony` szturm AI (hp 400, morale 100) zabija jednostkę w jednej rundzie (`CombatSystem`). */
function combatKill(w, u, colony) {
  const spot = placeOn(w, u, colony);
  u.hp = 1; if (u.currentHP != null) u.currentHP = 1;
  const e = w.gum.createUnit('shock_infantry', colony.planetId, spot.q, spot.r, { owner: w.emp, factionId: w.emp, hp: 400 });
  e.morale = 100; e.maxMorale = 100;
  withFixedRng(() => quiet(() => drive(w, 2, (ww) => !ww.gum._units.has(u.id))));
}
/** Mina wroga na heksie jednostki (`GroundUnitManager._checkMineTrigger`). */
function mineKill(w, u) {
  w.K.gameState.set(`minefields.${u.planetId}.${u.q}_${u.r}`, { ownerId: w.emp, damage: 99999 }, 'keeper_mine');
  return w.gum._checkMineTrigger(u);
}
/** Głód: jednostka na ciele bez kolonii, zaopatrzenie 0, HP na włosku (`SupplyCoverageSystem.update`). */
function starve(w, u) {
  const nb = neutralBody(w);
  u.planetId = nb.id; u.q = 0; u.r = 0;
  u.supply = 0; u.hp = 0.001; if (u.currentHP != null) u.currentHP = 0.001;
  quiet(() => new SupplyCoverageSystem(w.cm, w.gum).update(1.0));
}
/** Termin wycofania po pokoju (`WithdrawalSystem._tick`) — świat BEZ wojny, jednostka na kolonii AI. */
function withdrawalKill(w, u) {
  placeOn(w, u, w.ai);
  const now = w.K.timeSystem.gameTime;
  u.withdrawal = { empireId: w.emp, orderedYear: now - 0.5, deadline: now - 0.001, warned: true };
  quiet(() => w.K.withdrawalSystem._tick());
}
/** Zniszczone ciało: kolonia AI, na której stoi jednostka, usunięta (`ColonyManager.removeColony` → R7). */
function bodyDestroyed(w, u) {
  placeOn(w, u, w.ai);
  quiet(() => w.cm.removeColony(w.ai.planetId, 'collision'));
}
/** Utrata transportu: jednostka w ładowni niszczonego statku (`VesselManager.destroyVessel`). */
function transportLost(w, u) {
  const v = w.K.vesselManager.createAndRegister('hull_small', w.home.planetId);
  v.troopCapacity = 12; v.troopBayUsed = 0; v.groundUnits = [];
  const ok = VS.loadGroundUnit(v, u)?.ok === true;
  quiet(() => w.K.vesselManager.destroyVessel(v.id));
  return ok;
}
/** Brak utrzymania: dom bez kredytów przez karencję (`ColonyManager._tickGroundUnitUpkeep`). */
function upkeepDisband(w, u) {
  w.home.credits = 0;
  for (let i = 0; i < ColonyManager.UPKEEP_GRACE_CIVYEARS; i++) quiet(() => w.cm._tickGroundUnitUpkeep(1.0));
}
/** Rozpad morale: okopany garnizon gracza vs szturm AI aż do rozpadu (`CombatSystem`, `morale_collapse`). */
function moraleCollapse(w, g) {
  g.deployState = 'deployed'; g.stateTimer = 0; w.gum._applyDeployStateStats(g);
  const e = w.gum.createUnit('shock_infantry', g.planetId, g.q, g.r, { owner: w.emp, factionId: w.emp, hp: 400 });
  e.morale = 100; e.maxMorale = 100;
  withFixedRng(() => quiet(() => drive(w, 20, (ww) => !ww.gum._units.has(g.id))));
}

// ── L1 — P1 (Finding 333): część nieoddana przez tabelę śmierci naprawdę ginie ─────────────────────────────
{
  console.log('\nL1a — śmierć (ostrzał): część nieoddana ginie od razu razem z blokadą; zwrot po zwłoce; nic na zawsze');
  const w = boot();
  const L0 = lockOf(w.home);
  const u = recruit(w, w.home, 'shock_infantry');
  const cost = COST.shock_infantry, ri = RI.shock_infantry, back = cost * ri.rate, dead = cost - back;
  const H0 = humansOf(w.home), L1 = lockOf(w.home);
  const others = snapOthers(w, [w.home]);
  bombard(w, u);
  const Hd = humansOf(w.home), Ld = lockOf(w.home), pend = pendingOf(w.home, u.id);
  assert(!w.gum.getUnit(u.id) && w.ev.destroyed.some(e => e.unitId === u.id && e.cause === 'orbital_strike') && near(L1, L0 + cost)
      && u.homeColonyId === w.home.planetId,
    `świadek: szturm ${u.id} (koszt ${cost}, dom ${u.homeColonyId}) zginął od ostrzału; blokada po rekrutacji ${L0} → ${L1}`);
  assert(near(Hd, H0 - dead) && near(Ld, L1 - dead),
    `L1a SEDNO: w chwili śmierci ginie ${dead} — populacja domu ${H0} → ${Hd}, blokada ${L1} → ${Ld}`);
  assert(pend.length === 1 && near(pend[0], back), `L1a kontrola: zwrot ${back} czeka w kolejce, jak przed G1c (${JSON.stringify(pend)})`);
  w.cm._tickPendingPopReturns(ri.delay + 0.01);
  assert(near(lockOf(w.home), L0) && near(humansOf(w.home), H0 - dead),
    `L1a: po zwłoce blokada wraca do stanu sprzed rekrutacji (${L0} → ${lockOf(w.home)}) — nic zablokowanego na zawsze; ` +
    `populacja ${humansOf(w.home)}`);
  assert(othersUnchanged(w, others), 'L1a kontrola: żadna inna kolonia się nie zmieniła');
}
{
  console.log('\nL1b — kontrola: tabela oddaje całość (garnizon, rate 1) — nic nie ginie');
  const w = boot();
  const L0 = lockOf(w.home);
  const g = recruit(w, w.home, 'garrison_unit');
  const H0 = humansOf(w.home), L1 = lockOf(w.home);
  bombard(w, g);
  const Hd = humansOf(w.home), Ld = lockOf(w.home);
  w.cm._tickPendingPopReturns(RI.garrison_unit.delay + 0.01);
  assert(RI.garrison_unit.rate === 1 && !w.gum.getUnit(g.id) && near(Hd, H0) && near(Ld, L1) && near(lockOf(w.home), L0),
    `L1b kontrola: garnizon (rate ${RI.garrison_unit.rate}) — w chwili śmierci nic nie ginie (populacja ${H0} → ${Hd}), ` +
    `po zwłoce blokada ${L1} → ${lockOf(w.home)} (= ${L0})`);
}
{
  console.log('\nL1c — STRAŻNIK (P4): dom przejęty przed śmiercią — kolonia innego właściciela nie płaci ludźmi, meldunek o utracie');
  const w = boot();
  const u = recruit(w, w.home, 'shock_infantry');
  const back = COST.shock_infantry * RI.shock_infantry.rate;
  quiet(() => w.cm.transferColony(w.home.planetId, w.emp, 'invasion'));
  placeOn(w, u, w.ai);
  const capL = lockOf(w.home), capH = humansOf(w.home);
  const others = snapOthers(w, [w.home]);
  bombard(w, u);
  w.cm._tickPendingPopReturns(RI.shock_infantry.delay + 0.01);
  const lost = lostOf(w, u.id);
  assert(w.home.ownerEmpireId === w.emp && !w.gum.getUnit(u.id) && w.ev.destroyed.some(e => e.unitId === u.id),
    `świadek: dom ${w.home.planetId} należy do ${w.home.ownerEmpireId}; jednostka zginęła`);
  assert(near(lockOf(w.home), capL) && near(humansOf(w.home), capH) && othersUnchanged(w, others),
    `L1c STRAŻNIK: przejęty dom nietknięty (blokada ${capL} → ${lockOf(w.home)}, populacja ${capH} → ${humansOf(w.home)}), ` +
    'inne kolonie też — zielony także przed G1c; pada przy naprawie, która zabijałaby ludzi w cudzej kolonii');
  assert(lost.length === 1 && near(lost[0].amount, back), `L1c kontrola: meldunek o utracie zwrotu ${back} (${JSON.stringify(lost.map(e => e.amount))})`);
}
{
  console.log('\nL1d — śmierć pełnej osoby: `civ:popDied` z przyczyną ground_unit_lost; okręty bez zmian (ship_crew_lost)');
  const w = boot();
  const u = recruit(w, w.home, 'shock_infantry');
  w.home.civSystem._growthProgress = 0.1;          // ułamek mniejszy niż ginąca część ⇒ jedna pełna osoba
  const pop0 = w.home.civSystem.population;
  bombard(w, u);
  const died = w.ev.popDied.filter(e => e.planetId === w.home.planetId);
  assert(!w.gum.getUnit(u.id), `świadek: jednostka ${u.id} zginęła`);
  assert(died.length === 1 && died[0].cause === 'ground_unit_lost' && w.home.civSystem.population === pop0 - 1,
    `L1d: jedna pełna osoba (populacja ${pop0} → ${w.home.civSystem.population}), \`civ:popDied\` z przyczyną ` +
    `${JSON.stringify(died.map(e => e.cause))}`);
  const civ = w.home.civSystem;
  civ.lockPops(0.2, 'laborer');
  civ._growthProgress = 0.05;
  const before = w.ev.popDied.length;
  civ.killCrew({ laborer: 0.2 });
  const ship = w.ev.popDied.slice(before);
  assert(ship.length === 1 && ship[0].cause === 'ship_crew_lost',
    `L1d kontrola: \`killCrew\` bez przyczyny — załoga okrętu jak w W2 (${JSON.stringify(ship.map(e => e.cause))})`);
}
{
  console.log('\nL1e — archetyp spoza tabeli śmierci: nic nie wraca, ginie całość');
  const w = boot();
  const L0 = lockOf(w.home);
  const u = recruit(w, w.home, 'shock_infantry');
  u.archetypeId = 'zz_spoza_tabeli';
  const cost = u.popCost;
  const H0 = humansOf(w.home);
  bombard(w, u);
  assert(!w.gum.getUnit(u.id) && !RI.zz_spoza_tabeli && cost > 0, `świadek: jednostka (koszt ${cost}) z archetypem spoza tabeli zginęła`);
  assert(near(humansOf(w.home), H0 - cost) && near(lockOf(w.home), L0) && pendingOf(w.home, u.id).length === 0,
    `L1e: ginie całość — populacja ${H0} → ${humansOf(w.home)}, blokada → ${lockOf(w.home)} (= ${L0}), kolejka pusta`);
}
{
  console.log('\nL1f — Dziennik: osobnej linii o POP poległej jednostki nie ma (UIManager — pin źródłowy)');
  const ui = src('../../scenes/UIManager.js');
  const i = ui.indexOf("EventBus.on('civ:popDied'");
  const handler = i >= 0 ? ui.slice(i, i + 900) : '';
  assert(/cause === 'ship_crew_lost'\) return;/.test(handler),
    'L1f kontrola pinu: handler `civ:popDied` w UIManager przeczytany (pomija załogę okrętu, jak w W2)');
  assert(/cause === 'ground_unit_lost'\) return;/.test(handler),
    'L1f: handler pomija też `ground_unit_lost` — bez wpisu „POP lost in —” (zdarzenie nie niesie nazwy kolonii)');
}

// ── L2 — P2 (Finding 330): ręczne rozwiązanie oddaje pełny koszt od razu ─────────────────────────────────────
{
  console.log('\nL2a — ręczne rozwiązanie: pełny koszt POP wraca OD RAZU, nie przez tabelę śmierci');
  const w = boot();
  const L0 = lockOf(w.home);
  const u = recruit(w, w.home, 'shock_infantry');
  const H0 = humansOf(w.home), L1 = lockOf(w.home);
  const others = snapOthers(w, [w.home]);
  const res = call(w.cm, 'disbandGroundUnit', u.id);
  assert(near(L1, L0 + COST.shock_infantry) && u.homeColonyId === w.home.planetId,
    `świadek: szturm ${u.id} zrekrutowany w domu (blokada ${L0} → ${L1})`);
  assert(res?.ok === true && !w.gum.getUnit(u.id) && near(lockOf(w.home), L0) && near(humansOf(w.home), H0)
      && pendingOf(w.home, u.id).length === 0,
    `L2a SEDNO: pełny koszt wrócił od razu — blokada ${L1} → ${lockOf(w.home)} (= ${L0}), populacja ${H0} → ` +
    `${humansOf(w.home)}, kolejka zwrotów pusta (${JSON.stringify(pendingOf(w.home, u.id))})`);
  assert(w.ev.disbanded.filter(e => e.unitId === u.id && e.reason === 'manual').length === 1
      && !w.ev.destroyed.some(e => e.unitId === u.id),
    `L2a: jedno \`groundUnit:disbanded\` (manual) i zero \`groundUnit:destroyed\` — rozwiązanie to nie śmierć`);
  assert(othersUnchanged(w, others), 'L2a kontrola: żadna inna kolonia się nie zmieniła');
}
{
  console.log('\nL2b — dom przejęty: POP przepadają z meldunkiem, kolonia innego właściciela nic nie dostaje');
  const w = boot();
  const u = recruit(w, w.home, 'shock_infantry');
  quiet(() => w.cm.transferColony(w.home.planetId, w.emp, 'invasion'));
  const capL = lockOf(w.home), capH = humansOf(w.home);
  const existed = !!w.gum.getUnit(u.id);
  const res = call(w.cm, 'disbandGroundUnit', u.id);
  const lost = lostOf(w, u.id);
  assert(w.home.ownerEmpireId === w.emp && existed && u.homeColonyId === w.home.planetId,
    `świadek: dom ${w.home.planetId} należy do ${w.home.ownerEmpireId}; jednostka ${u.id} wskazuje go jako dom`);
  assert(res?.ok === true && !w.gum.getUnit(u.id) && near(lockOf(w.home), capL) && near(humansOf(w.home), capH)
      && lost.length === 1 && near(lost[0].amount, COST.shock_infantry) && lost[0].cause === 'disband_manual',
    `L2b: przejęty dom nietknięty (blokada ${capL} → ${lockOf(w.home)}), meldunek ${JSON.stringify(lost.map(e => [e.amount, e.cause]))}`);
}
{
  console.log('\nL2c — jednostka AI: odmowa, nic się nie zmienia');
  const w = boot();
  const spot = w.cm._findGroundUnitSpawn(w.ai);
  const a = w.gum.createAIUnit({ archetypeId: 'garrison_unit', empireId: w.emp, planetId: w.ai.planetId, q: spot.q, r: spot.r,
    morale: 50, deployed: true })?.unit;
  const res = call(w.cm, 'disbandGroundUnit', a?.id);
  assert(!!a, `świadek: jednostka ${a?.id} imperium ${w.emp}`);
  assert(res?.ok === false && res?.reason === 'not_player_unit' && !!w.gum.getUnit(a.id),
    `L2c: odmowa (${JSON.stringify(res)}), jednostka AI stoi dalej`);
}
{
  console.log('\nL2d — karta jednostki woła disbandGroundUnit i nie emituje śmierci (pin źródłowy)');
  const ucp = src('../../ui/UnitCardPanel.js');
  assert(/t\('unit\.disband\.title'\)/.test(ucp) && /showConfirmModal\(/.test(ucp),
    'L2d kontrola pinu: przycisk rozwiązania z potwierdzeniem przeczytany');
  assert(/colonyManager\?\.disbandGroundUnit\?\.\(unit\.id,\s*'manual'\)/.test(ucp) && !/groundUnit:destroyed/.test(ucp),
    'L2d: karta woła `ColonyManager.disbandGroundUnit(unit.id, \'manual\')` i nie emituje `groundUnit:destroyed`');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
