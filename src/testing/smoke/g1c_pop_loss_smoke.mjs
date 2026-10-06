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
//   Q2 (Finding 380; odpowiedź właściciela 2026-10-05, potwierdzenie 2026-10-06) przejęcie kolonii zrywa więzi POP
//      poprzedniego właściciela: blokady jego jednostek z domem w tej kolonii i zwroty czekające w jej kolejce zwalniane
//      w tej kolonii (ludzie zostają z kolonią); jednostki walczą dalej bez kosztu POP i bez domu.
//   Q5 (Finding 381; odpowiedź właściciela 2026-10-05, potwierdzenie 2026-10-06) przejęcie kolonii anuluje kolejkę
//      rekrutacji poprzedniego właściciela: blokada POP każdego zlecenia wraca w tej kolonii, żadna jednostka nie powstaje,
//      surowce i Kr zlecenia przepadają (bez zwrotu).
//
//   L1  (P1) śmierć: w chwili śmierci ginie część nieoddana przez tabelę — populacja i blokada domu spadają o nią; zwrot
//       czeka w kolejce i po zwłoce blokada wraca do stanu sprzed rekrutacji (nic zablokowanego na zawsze). Kontrole:
//       tabela oddaje całość (garnizon) — nic nie ginie; dom przejęty — kolonia innego właściciela nietknięta, od Q2 bez
//       meldunku (więź POP zerwana przy przejęciu).
//       Archetyp spoza tabeli — ginie całość. Przyczyna `civ:popDied` = `ground_unit_lost`; okręty bez zmian; Dziennik
//       (`UIManager`) bez osobnej linii (pin źródłowy).
//   L2  (P2) ręczne rozwiązanie (`ColonyManager.disbandGroundUnit`): pełny koszt wraca od razu (populacja bez zmian,
//       blokada do stanu sprzed rekrutacji, kolejka pusta), jedno `groundUnit:disbanded` (manual), zero
//       `groundUnit:destroyed`; dom przejęty — kolonia innego właściciela nietknięta, od Q2 bez meldunku; jednostka AI — odmowa.
//       Karta jednostki (`UnitCardPanel`) woła tę metodę i nie emituje śmierci (pin źródłowy).
//   L3  (P3) zapis → wczytanie w połowie zwłoki (prawdziwe `ColonyManager.serialize` → `restore`): zwrot wypłacony
//       DOKŁADNIE RAZ, w terminie (nie wcześniej, nie drugi raz); w zapisie termin jako pozostały czas; starszy zapis
//       bez kolejki wczytuje się czysto (pusta kolejka).
//   L4  (P4) żadna kolonia innego właściciela nie płaci ani nie dostaje: rozwiązanie z braku utrzymania przy przejętym
//       domu — przejęty dom nietknięty, od Q2 bez meldunku; jednostka bez wskazania domu na kolonii AI — kolonia AI nic
//       nie dostaje.
//       Kontrole: płatnik żołdu (354/R6) nigdy kolonia innego właściciela; własny dom — pełny zwrot jak dotąd.
//   L5  (P5) mina (`GroundUnitManager._checkMineTrigger`): zdarzenie śmierci niesie koszt, archetyp i przyczynę `mine`;
//       rozliczenie jak każda śmierć (część ginie od razu, zwrot po zwłoce). Ładunek bez kosztu (rejestr jako źródło)
//       — to samo rozliczenie. Rozliczenie DOKŁADNIE RAZ: rozwiązana jednostka nie jest rozliczana drugi raz przez
//       zdarzenie śmierci, a poległa — przez zwolnienie.
//   L6  (P6) zniszczone ciało (`removeColony` → R7; ciało bez kolonii — `EntityManager.remove`): jednostka gracza jak
//       polegli — część ginie od razu, zwrot po zwłoce; dom na zniszczonym ciele — meldunek o utracie ZWROTU.
//   L7  (Q2) przejęcie kolonii (invasion i cesja gracz→AI): blokady jednostek gracza z domem w tej kolonii (na jej ciele,
//       na innym ciele, w ładowni) i zwrot czekający w jej kolejce zwolnione W MIEJSCU w chwili przejęcia — populacja bez
//       zmian, kolejka pusta; jednostki żyją z `popCost` 0 i bez domu, a potem śmierć, rozwiązanie, brak utrzymania
//       i upływ zwłoki nic nie rozliczają (zero `popsLost`). Kontrole: jednostka z domem w INNEJ kolonii gracza na
//       przejętym ciele nietknięta; kierunek AI→gracz — żadna blokada się nie zmienia; zapis i wczytanie nie wskrzeszają
//       więzi; zapis sprzed Q2 (więź niezerwana, właściciel ostemplowany przy wczytaniu) — reguła właściciela dalej
//       chroni kolonię innego właściciela (z czułością).
//   L8  (Q5) przejęcie kolonii (invasion i cesja gracz→AI) ze zleceniami rekrutacji w toku: kolejka pusta, blokada wraca
//       do stanu sprzed zleceń, żadna jednostka nie powstaje (zero `groundUnit:buildCompleted` dla tej kolonii), surowce
//       i Kr bez zwrotu. Kontrola: zlecenie w INNEJ kolonii gracza przeżywa przejęcie domu i kończy się jednostką gracza.
//   L0  wszystkie drogi wyjścia jednostki gracza (walka, mina, głód, ostrzał, termin wycofania, zniszczone ciało, utrata
//       transportu, brak utrzymania, rozpad morale, ręczne rozwiązanie): po zwłokach blokada domu wraca do stanu sprzed
//       rekrutacji (żadna POP na zawsze), populacja spada wyłącznie o część poległą (rozwiązania — 0), inne kolonie
//       nietknięte. Przejęcie ciała, na którym jednostka stoi (L0d): od Q2 (Finding 380) blokada zwolniona w przejętej
//       kolonii, populacja bez zmian, jednostka bez więzi POP (przed Q2 blokada zostawała w tej kolonii na zawsze).
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
  console.log('\nL1c — STRAŻNIK (P4): dom przejęty przed śmiercią — kolonia innego właściciela nie płaci ludźmi; od Q2 bez meldunku');
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
  // ⚠ Q2 (Finding 380; zgoda w poleceniu sesji zamykającej G1c, 2026-10-06 — L0d, L1c, L2b, L4a mogą się odwrócić): przed
  //   Q2 pin oczekiwał meldunku o utraconym zwrocie; od Q2 przejęcie zerwało więź POP, więc nie było czego stracić.
  assert(lost.length === 0 && u.popCost === 0 && u.homeColonyId === null,
    `L1c: bez meldunku o utracie — więź POP zerwana przy przejęciu (popCost ${u.popCost}, dom ${u.homeColonyId}; meldunki ` +
    `${JSON.stringify(lost.map(e => e.amount))}; przed Q2 zwrot ${back} przepadał z meldunkiem)`);
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
  console.log('\nL2b — dom przejęty: kolonia innego właściciela nic nie dostaje; od Q2 więź POP zerwana przy przejęciu — bez meldunku');
  const w = boot();
  const u = recruit(w, w.home, 'shock_infantry');
  quiet(() => w.cm.transferColony(w.home.planetId, w.emp, 'invasion'));
  const capL = lockOf(w.home), capH = humansOf(w.home);
  const existed = !!w.gum.getUnit(u.id);
  const res = call(w.cm, 'disbandGroundUnit', u.id);
  const lost = lostOf(w, u.id);
  // ⚠ Q2 (Finding 380) — przed Q2 jednostka dalej wskazywała przejęty dom, a rozwiązanie kończyło się meldunkiem o utracie
  //   pełnego kosztu (disband_manual). Od Q2 więź zerwana w chwili przejęcia.
  assert(w.home.ownerEmpireId === w.emp && existed && u.homeColonyId === null && u.popCost === 0,
    `świadek: dom ${w.home.planetId} należy do ${w.home.ownerEmpireId}; jednostka ${u.id} bez więzi POP (dom ` +
    `${u.homeColonyId}, popCost ${u.popCost})`);
  assert(res?.ok === true && !w.gum.getUnit(u.id) && near(lockOf(w.home), capL) && near(humansOf(w.home), capH)
      && lost.length === 0,
    `L2b: przejęty dom nietknięty (blokada ${capL} → ${lockOf(w.home)}), bez meldunku (${JSON.stringify(lost.map(e => [e.amount, e.cause]))})`);
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

// ── L3 — P3 (Finding 328): kolejka zwrotów przeżywa zapis i wczytanie ──────────────────────────────────────────
/** Wczytanie jak nowa sesja: kolonie z zapisu w świeże obiekty, zegar zwrotów od zera (`_pendingPopClock` nie w zapisie). */
function reloadColonies(w, data) {
  w.cm._colonies.clear();
  w.cm._pendingPopClock = undefined;
  quiet(() => w.cm.restore(JSON.parse(JSON.stringify(data))));
  return w.cm.getColony(w.home.planetId);
}
{
  console.log('\nL3a — zapis i wczytanie w połowie zwłoki: zwrot wypłacony dokładnie raz, w terminie');
  const w = boot();
  const L0 = lockOf(w.home);
  const u = recruit(w, w.home, 'shock_infantry');
  const ri = RI.shock_infantry, back = COST.shock_infantry * ri.rate;
  bombard(w, u);
  const half = ri.delay / 2;
  w.cm._tickPendingPopReturns(half);
  const lockSaved = lockOf(w.home);
  const data = JSON.parse(JSON.stringify(w.cm.serialize()));
  const rec = data.colonies.find(c => c.planetId === w.home.planetId);
  assert(!w.gum.getUnit(u.id) && pendingOf(w.home, u.id).length === 1 && near(lockSaved, L0 + back),
    `świadek: jednostka zginęła, zwrot ${back} czeka; zapis w połowie zwłoki (${half} z ${ri.delay} civY), blokada ${lockSaved}`);
  assert(Array.isArray(rec?.pendingPopReturns) && rec.pendingPopReturns.length === 1
      && near(rec.pendingPopReturns[0].amount, back) && near(rec.pendingPopReturns[0].remaining, ri.delay - half),
    `L3a: kolejka w zapisie z terminem jako POZOSTAŁY czas (${JSON.stringify(rec?.pendingPopReturns)})`);
  const home2 = reloadColonies(w, data);
  const afterLoad = [lockOf(home2), pendingOf(home2).length];
  w.cm._tickPendingPopReturns(ri.delay - half - 0.01);
  const beforeDue = lockOf(home2);
  w.cm._tickPendingPopReturns(0.02);
  const atDue = lockOf(home2);
  w.cm._tickPendingPopReturns(5);
  const later = lockOf(home2);
  assert(home2 && home2 !== w.home && near(afterLoad[0], lockSaved),
    `świadek: kolonia odtworzona z zapisu (nowy obiekt), blokada ${afterLoad[0]} = zapisana ${lockSaved}`);
  assert(afterLoad[1] === 1 && near(beforeDue, lockSaved) && near(atDue, L0) && near(later, L0),
    `L3a SEDNO: po wczytaniu kolejka ma wpis (${afterLoad[1]}); przed terminem blokada ${beforeDue}, w terminie ${atDue} ` +
    `(= ${L0}), później ${later} — wypłata DOKŁADNIE RAZ`);
}
{
  console.log('\nL3b — kontrola: starszy zapis bez kolejki wczytuje się czysto');
  const w = boot();
  recruit(w, w.home, 'shock_infantry');
  const data = JSON.parse(JSON.stringify(w.cm.serialize()));
  for (const c of data.colonies) { delete c.pendingPopReturns; delete c._pendingPopReturns; }
  let ok = true, home2 = null;
  try { home2 = reloadColonies(w, data); } catch { ok = false; }
  assert(ok && !!home2 && pendingOf(home2).length === 0 && w.cm.getAllColonies().length === data.colonies.length,
    `L3b kontrola: zapis bez \`pendingPopReturns\` — wczytanie bez błędu, kolonie ${w.cm.getAllColonies().length}/${data.colonies.length}, kolejka pusta`);
}

// ── L4 — P4 (Finding 329): termin właściciela przy zwrocie POP z braku utrzymania ─────────────────────────────
{
  console.log('\nL4a — brak utrzymania przy przejętym domu: przejęty dom nic nie dostaje; od Q2 bez meldunku (więź POP zerwana)');
  const w = boot();
  const u = recruit(w, w.home, 'shock_infantry');
  quiet(() => w.cm.transferColony(w.home.planetId, w.emp, 'invasion'));
  w.home.credits = 5000;                           // przejęty dom ma kredyty — i nie wolno mu płacić (354/R6)
  const capL = lockOf(w.home), capH = humansOf(w.home);
  for (let i = 0; i < ColonyManager.UPKEEP_GRACE_CIVYEARS; i++) quiet(() => w.cm._tickGroundUnitUpkeep(1.0));
  const lost = lostOf(w, u.id);
  assert(w.home.ownerEmpireId === w.emp && !w.gum.getUnit(u.id)
      && w.ev.disbanded.some(e => e.unitId === u.id && e.reason === 'no_credits'),
    `świadek: dom ${w.home.planetId} należy do ${w.home.ownerEmpireId}; jednostka rozwiązana z braku utrzymania`);
  assert(near(lockOf(w.home), capL) && near(humansOf(w.home), capH),
    `L4a SEDNO: przejęty dom nic nie dostaje (blokada ${capL} → ${lockOf(w.home)}, populacja ${capH} → ${humansOf(w.home)})`);
  // ⚠ Q2 (Finding 380) — przed Q2 pin oczekiwał meldunku o utracie pełnego kosztu (no_credits).
  assert(lost.length === 0 && u.popCost === 0,
    `L4a: bez meldunku o utracie — więź POP zerwana przy przejęciu (popCost ${u.popCost}; meldunki ` +
    `${JSON.stringify(lost.map(e => [e.amount, e.cause]))})`);
  assert(near(w.home.credits ?? 0, 5000),
    `L4a kontrola (354/R6): przejęty dom z kredytami nie płacił żołdu (${w.home.credits}) — jednostka rozwiązana bez płatnika`);
}
{
  console.log('\nL4b — jednostka bez wskazania domu na kolonii AI: kolonia CIAŁA nic nie dostaje');
  const w = boot();
  const u = recruit(w, w.home, 'shock_infantry');
  placeOn(w, u, w.ai);
  u.homeColonyId = null;
  w.ai.civSystem.lockPops(5, 'laborer');          // bez tego błędne zwolnienie na AI zginęłoby w klampie do zera
  const aiL = lockOf(w.ai), aiH = humansOf(w.ai);
  upkeepDisband(w, u);
  const lost = lostOf(w, u.id);
  assert(!w.gum.getUnit(u.id) && w.ev.disbanded.some(e => e.unitId === u.id && e.reason === 'no_credits'),
    `świadek: jednostka bez domu na ${w.ai.planetId} (${w.ai.ownerEmpireId}) rozwiązana z braku utrzymania`);
  assert(near(lockOf(w.ai), aiL) && near(humansOf(w.ai), aiH) && lost.length === 1,
    `L4b SEDNO: kolonia AI nic nie dostaje (blokada ${aiL} → ${lockOf(w.ai)}); meldunek ${lost.length}`);
}
{
  console.log('\nL4c — kontrola (354/R6): żołd jednostki gracza nigdy z kolonii innego właściciela');
  const w = boot();
  const u = recruit(w, w.home, 'shock_infantry');
  placeOn(w, u, w.ai);
  w.ai.credits = 1000; w.home.credits = 1000;
  quiet(() => w.cm._tickGroundUnitUpkeep(1.0));
  assert(near(w.ai.credits, 1000) && w.home.credits < 1000 && u.status !== 'offline',
    `L4c kontrola: jednostka na kolonii AI — płaci dom (${w.home.credits}), kolonia AI ${w.ai.credits}`);
}
{
  console.log('\nL4d — kontrola: własny dom — brak utrzymania oddaje pełny koszt od razu, jak dotąd');
  const w = boot();
  const L0 = lockOf(w.home);
  const u = recruit(w, w.home, 'shock_infantry');
  const H0 = humansOf(w.home);
  upkeepDisband(w, u);
  assert(!w.gum.getUnit(u.id) && near(lockOf(w.home), L0) && near(humansOf(w.home), H0) && lostOf(w, u.id).length === 0,
    `L4d kontrola: pełny zwrot od razu (blokada → ${lockOf(w.home)} = ${L0}, populacja bez zmian)`);
}

// ── L5 — P5 (Finding 327): mina tą samą drogą śmierci; rozliczenie dokładnie raz ───────────────────────────────
{
  console.log('\nL5a — mina: ta sama droga śmierci co każda inna');
  const w = boot();
  const L0 = lockOf(w.home);
  const u = recruit(w, w.home, 'shock_infantry');
  const cost = COST.shock_infantry, ri = RI.shock_infantry, back = cost * ri.rate, dead = cost - back;
  const H0 = humansOf(w.home), L1 = lockOf(w.home);
  const died = mineKill(w, u);
  const ev = w.ev.destroyed.find(e => e.unitId === u.id);
  assert(died === true && !w.gum.getUnit(u.id) && !!ev && ev.killedBy === 'minefield',
    `świadek: szturm ${u.id} wszedł na minę ${w.emp} i zginął (killedBy ${ev?.killedBy})`);
  assert(ev?.popCost === cost && ev?.archetypeId === 'shock_infantry' && ev?.cause === 'mine',
    `L5a: zdarzenie śmierci z miny niesie koszt, archetyp i przyczynę (${JSON.stringify({ popCost: ev?.popCost, archetypeId: ev?.archetypeId, cause: ev?.cause })})`);
  const pend = pendingOf(w.home, u.id);
  assert(near(humansOf(w.home), H0 - dead) && near(lockOf(w.home), L1 - dead) && pend.length === 1 && near(pend[0], back),
    `L5a SEDNO: jak każda śmierć — ginie ${dead} (populacja ${H0} → ${humansOf(w.home)}), zwrot ${back} w kolejce ` +
    `(${JSON.stringify(pend)}); przed naprawą koszt zostawał zablokowany na zawsze`);
  w.cm._tickPendingPopReturns(ri.delay + 0.01);
  assert(near(lockOf(w.home), L0), `L5a: po zwłoce blokada ${lockOf(w.home)} = ${L0} — nic na zawsze`);
}
{
  console.log('\nL5b — ładunek bez kosztu i archetypu: rozliczenie z rejestru (każdy emitent emituje PRZED usunięciem)');
  const w = boot();
  const u = recruit(w, w.home, 'shock_infantry');
  const back = COST.shock_infantry * RI.shock_infantry.rate, dead = COST.shock_infantry - back;
  const H0 = humansOf(w.home);
  EventBus.emit('groundUnit:destroyed', { unitId: u.id, planetId: u.planetId });
  w.gum.removeUnit(u.id);
  const pend = pendingOf(w.home, u.id);
  assert(near(humansOf(w.home), H0 - dead) && pend.length === 1 && near(pend[0], back),
    `L5b: goły ładunek — rozliczenie z rejestru (populacja ${H0} → ${humansOf(w.home)}, kolejka ${JSON.stringify(pend)})`);
}
{
  console.log('\nL5c — rozliczenie dokładnie raz: zwolniona jednostka nie ginie drugi raz; poległej nie zwalnia się drugi raz');
  const w = boot();
  const L0 = lockOf(w.home);
  const a = recruit(w, w.home, 'shock_infantry');
  const H0 = humansOf(w.home);
  const rel = w.cm.releaseGroundUnitPops(a, 'test');
  const afterRelease = [lockOf(w.home), humansOf(w.home)];
  EventBus.emit('groundUnit:destroyed', { unitId: a.id, planetId: a.planetId, owner: a.owner,
    archetypeId: a.archetypeId, popCost: a.popCost, cause: 'combat' });
  w.gum.removeUnit(a.id);
  assert(rel?.released === COST.shock_infantry && near(afterRelease[0], L0) && near(afterRelease[1], H0),
    `świadek: pełny koszt zwolniony (blokada → ${afterRelease[0]} = ${L0})`);
  assert(near(humansOf(w.home), H0) && near(lockOf(w.home), L0) && pendingOf(w.home, a.id).length === 0,
    `L5c: zdarzenie śmierci po zwolnieniu niczego nie rozlicza drugi raz (populacja ${H0} → ${humansOf(w.home)}, ` +
    `kolejka ${JSON.stringify(pendingOf(w.home, a.id))})`);
  const b = recruit(w, w.home, 'shock_infantry');
  const Lb = lockOf(w.home);
  EventBus.emit('groundUnit:destroyed', { unitId: b.id, planetId: b.planetId, owner: b.owner,
    archetypeId: b.archetypeId, popCost: b.popCost, cause: 'combat' });
  const rel2 = w.cm.releaseGroundUnitPops(b, 'test');
  w.gum.removeUnit(b.id);
  const back = COST.shock_infantry * RI.shock_infantry.rate;
  assert(rel2?.released === 0 && near(lockOf(w.home), Lb - (COST.shock_infantry - back)),
    `L5c: zwolnienie po śmierci nie zwalnia drugi raz (zwolniono ${rel2?.released}, blokada ${Lb} → ${lockOf(w.home)})`);
}

// ── L6 — P6 (zmiana R7): jednostka gracza na zniszczonym ciele — jak polegli ─────────────────────────────────
{
  console.log('\nL6a — zniszczona kolonia AI z jednostką gracza: jak polegli (część ginie, zwrot po zwłoce)');
  const w = boot();
  const L0 = lockOf(w.home);
  const u = recruit(w, w.home, 'shock_infantry');
  const cost = COST.shock_infantry, ri = RI.shock_infantry, back = cost * ri.rate, dead = cost - back;
  const H0 = humansOf(w.home), L1 = lockOf(w.home);
  const aiId = w.ai.planetId;
  bodyDestroyed(w, u);
  const pend = pendingOf(w.home, u.id);
  assert(!w.cm.getColony(aiId) && !w.gum.getUnit(u.id) && u.homeColonyId === w.home.planetId,
    `świadek: kolonia ${aiId} zniszczona, jednostka gracza (dom ${u.homeColonyId}) zniknęła razem z nią`);
  assert(w.ev.destroyed.filter(e => e.unitId === u.id && e.cause === 'body_destroyed').length === 1,
    `L6a: jednostka zgłoszona JEDEN raz jako polegli (\`groundUnit:destroyed\`, body_destroyed)`);
  assert(near(humansOf(w.home), H0 - dead) && near(lockOf(w.home), L1 - dead) && pend.length === 1 && near(pend[0], back)
      && lostOf(w, u.id).length === 0,
    `L6a SEDNO: ginie ${dead} (populacja ${H0} → ${humansOf(w.home)}, blokada ${L1} → ${lockOf(w.home)}), zwrot ${back} ` +
    `w kolejce (${JSON.stringify(pend)}) — przed G1c pełny zwrot od razu`);
  w.cm._tickPendingPopReturns(ri.delay + 0.01);
  assert(near(lockOf(w.home), L0), `L6a kontrola: po zwłoce blokada ${lockOf(w.home)} = ${L0} (przed G1c — od razu)`);
}
{
  console.log('\nL6b — dom na zniszczonym ciele: meldunek o utracie zwrotu (część poległa nie jest „zwrotem”)');
  const w = boot();
  // Dom jednostki = kolonia gracza, która NIE jest planetą macierzystą (tej `removeColony` nie usuwa): kolonia AI
  //   przejęta przez gracza — ma siatkę z bootstrapu, więc rekrutacja idzie prawdziwą ścieżką.
  quiet(() => w.cm.captureColonyForPlayer(w.ai.planetId, 'keeper_setup'));
  const col = w.cm.getColony(w.ai.planetId);
  const u = recruit(w, col, 'shock_infantry');
  const back = COST.shock_infantry * RI.shock_infantry.rate;
  const homeId = col.planetId;
  const others = snapOthers(w, [col]);
  quiet(() => w.cm.removeColony(homeId, 'collision'));
  const lost = lostOf(w, u.id);
  assert(!col.ownerEmpireId && u.homeColonyId === homeId && u.planetId === homeId && !w.cm.getColony(homeId) && !w.gum.getUnit(u.id)
      && othersUnchanged(w, others),
    `świadek: kolonia gracza ${homeId} (dom jednostki, nie planeta macierzysta) zniszczona razem z jednostką; inne kolonie nietknięte`);
  assert(lost.length === 1 && near(lost[0].amount, back) && lost[0].cause === 'body_destroyed',
    `L6b: meldunek o utracie ZWROTU ${back} (${JSON.stringify(lost.map(e => [e.amount, e.cause]))}) — przed G1c pełny koszt`);
}
{
  console.log('\nL6c — ciało BEZ kolonii zniszczone (EntityManager.remove): jak polegli');
  const w = boot();
  const u = recruit(w, w.home, 'shock_infantry');
  const back = COST.shock_infantry * RI.shock_infantry.rate, dead = COST.shock_infantry - back;
  const nb = neutralBody(w);
  u.planetId = nb.id; u.q = 0; u.r = 0;
  const H0 = humansOf(w.home);
  quiet(() => EntityManager.remove(nb.id));
  const pend = pendingOf(w.home, u.id);
  assert(!EntityManager.get(nb.id) && !w.gum.getUnit(u.id), `świadek: ciało ${nb.id} bez kolonii zniszczone z jednostką gracza`);
  assert(near(humansOf(w.home), H0 - dead) && pend.length === 1 && near(pend[0], back),
    `L6c: jak polegli — populacja ${H0} → ${humansOf(w.home)}, zwrot ${back} w kolejce (${JSON.stringify(pend)})`);
}

// ── L7 — Q2 (Finding 380): przejęcie kolonii zrywa więzi POP poprzedniego właściciela ──────────────────────────────
/** Jednostka w ładowni statku gracza NA ORBICIE domu (przejęcie niszczy wyłącznie statki zadokowane w hangarze). */
function stowOnOrbit(w, u) {
  const v = w.K.vesselManager.createAndRegister('hull_small', w.home.planetId);
  v.troopCapacity = 12; v.troopBayUsed = 0; v.groundUnits = [];
  const loaded = VS.loadGroundUnit(v, u)?.ok === true;
  quiet(() => w.K.vesselManager.undockToOrbit(v.id));
  return loaded && u.status === 'in_cargo' && v.position?.state === 'orbiting';
}
/** Druga kolonia gracza z siatką (jak L6b): kolonia AI przejęta przez gracza. */
function secondPlayerColony(w) {
  quiet(() => w.cm.captureColonyForPlayer(w.ai.planetId, 'keeper_setup'));
  return w.cm.getColony(w.ai.planetId);
}
/** Cesja gracz→AI PRAWDZIWĄ ścieżką wykonania (`DiplomacySystem._executeCessions` → `transferColony(…, 'cession')`). */
const cedeToAI = (w, colony) =>
  quiet(() => w.K.diplomacySystem._executeCessions([{ bodyId: colony.planetId, toPlayer: false, to: w.emp }]));
{
  console.log('\nL7a — przejęcie (invasion): blokady jednostek i zwrot w kolejce zwolnione w miejscu; jednostki bez więzi POP');
  const w = boot();
  const L0 = lockOf(w.home);
  const cost = COST.shock_infantry, back = cost * RI.shock_infantry.rate;
  const fallen = recruit(w, w.home);                // poległa — zwrot czeka w kolejce domu
  bombard(w, fallen);
  const pend = pendingOf(w.home, fallen.id);
  const onBody = recruit(w, w.home);                // zostaje na ciele domu
  const away = recruit(w, w.home);                  // na innym ciele (niczyim)
  const nb = neutralBody(w);
  away.planetId = nb.id; away.q = 0; away.r = 0;
  const cargo = recruit(w, w.home);                 // w ładowni statku na orbicie domu
  const stowed = stowOnOrbit(w, cargo);
  const alive = [onBody, away, cargo];
  const Lb = lockOf(w.home), Hb = humansOf(w.home);
  const others = snapOthers(w, [w.home]);
  quiet(() => w.cm.transferColony(w.home.planetId, w.emp, 'invasion'));
  assert(w.home.ownerEmpireId === w.emp && stowed && !w.gum.getUnit(fallen.id) && pend.length === 1 && near(pend[0], back)
      && alive.every(u => !!w.gum.getUnit(u.id)) && near(Lb, L0 + 3 * cost + back),
    `świadek: dom ${w.home.planetId} należy do ${w.home.ownerEmpireId}; żyją trzy jednostki (ciało domu, ${nb?.id}, ładownia ` +
    `na orbicie), poległa czeka na zwrot ${back}; blokada przed przejęciem ${Lb} (= ${L0} + 3×${cost} + ${back})`);
  assert(near(lockOf(w.home), L0) && near(humansOf(w.home), Hb) && pendingOf(w.home).length === 0,
    `L7a SEDNO: w chwili przejęcia blokada ${Lb} → ${lockOf(w.home)} (= ${L0}) zwolniona W MIEJSCU, populacja bez zmian ` +
    `(${Hb} → ${humansOf(w.home)}), kolejka zwrotów pusta (${JSON.stringify(pendingOf(w.home))}) — przed Q2 zostawała na zawsze`);
  assert(alive.every(u => u.popCost === 0 && u.homeColonyId === null && u.owner === 'player'),
    `L7a: jednostki gracza walczą dalej bez więzi POP (${JSON.stringify(alive.map(u => [u.id, u.popCost, u.homeColonyId]))})`);
  assert(othersUnchanged(w, others), 'L7a: żadna inna kolonia się nie zmieniła');
  const La = lockOf(w.home), Ha = humansOf(w.home);
  bombard(w, onBody);
  const disb = call(w.cm, 'disbandGroundUnit', away.id);
  for (let i = 0; i < ColonyManager.UPKEEP_GRACE_CIVYEARS; i++) quiet(() => w.cm._tickGroundUnitUpkeep(1.0));
  w.cm._tickPendingPopReturns(3);
  const lost = [...alive, fallen].flatMap(u => lostOf(w, u.id));
  assert(!w.gum.getUnit(onBody.id) && disb?.ok === true && !w.gum.getUnit(away.id) && !w.gum.getUnit(cargo.id),
    'świadek: potem jednostka na ciele zginęła od ostrzału, druga rozwiązana ręcznie, trzecia (ładownia, bez płatnika ' +
    'żołdu) rozwiązana z braku utrzymania');
  assert(near(lockOf(w.home), La) && near(humansOf(w.home), Ha) && othersUnchanged(w, others) && lost.length === 0,
    `L7a: śmierć, rozwiązanie, brak utrzymania i upływ zwłoki nic nie rozliczają — blokada ${La} → ${lockOf(w.home)}, ` +
    `populacja ${Ha} → ${humansOf(w.home)}, inne kolonie nietknięte, meldunków o utracie ${lost.length}`);
}
{
  console.log('\nL7b — cesja (gracz→AI): ta sama reguła — blokada zwolniona w oddanej kolonii, jednostka bez więzi POP');
  const w = boot();
  const col = secondPlayerColony(w);
  const Lc0 = lockOf(col);
  const u = recruit(w, col);
  const homeBefore = u.homeColonyId;
  const Lc1 = lockOf(col), Hc1 = humansOf(col);
  const others = snapOthers(w, [col]);
  cedeToAI(w, col);
  assert(col.ownerEmpireId === w.emp && !!w.gum.getUnit(u.id) && homeBefore === col.planetId
      && near(Lc1, Lc0 + COST.shock_infantry),
    `świadek: kolonia gracza ${col.planetId} oddana w cesji (${col.ownerEmpireId}); jednostka ${u.id} z domem ${homeBefore} żyje`);
  assert(near(lockOf(col), Lc0) && near(humansOf(col), Hc1) && u.popCost === 0 && u.homeColonyId === null
      && othersUnchanged(w, others),
    `L7b: blokada ${Lc1} → ${lockOf(col)} (= ${Lc0}) zwolniona w oddanej kolonii, populacja bez zmian, jednostka bez więzi ` +
    `POP (popCost ${u.popCost}, dom ${u.homeColonyId}), inne kolonie nietknięte`);
}
{
  console.log('\nL7c — kontrola: jednostka z domem w INNEJ kolonii gracza, stojąca na przejętym ciele — nietknięta');
  const w = boot();
  const col = secondPlayerColony(w);
  const u = recruit(w, col);
  placeOn(w, u, w.home);
  const Lc = lockOf(col), Hc = humansOf(col), Lh = lockOf(w.home), Hh = humansOf(w.home);
  quiet(() => w.cm.transferColony(w.home.planetId, w.emp, 'invasion'));
  assert(w.home.ownerEmpireId === w.emp && !!w.gum.getUnit(u.id) && u.planetId === w.home.planetId,
    `świadek: jednostka ${u.id} (dom ${col.planetId}) stoi na przejętym ciele ${w.home.planetId}`);
  assert(u.popCost === COST.shock_infantry && u.homeColonyId === col.planetId && near(lockOf(col), Lc) && near(humansOf(col), Hc)
      && near(lockOf(w.home), Lh) && near(humansOf(w.home), Hh),
    `L7c kontrola: więź z kolonią ${col.planetId} nietknięta (popCost ${u.popCost}, blokada ${Lc} → ${lockOf(col)}); ` +
    `przejęta kolonia bez zmian (blokada ${Lh} → ${lockOf(w.home)})`);
}
{
  console.log('\nL7d — kontrola: kierunek AI→gracz (captureColonyForPlayer) — żadna blokada ani populacja się nie zmienia');
  const w = boot();
  const spot = w.cm._findGroundUnitSpawn(w.ai);
  const a = w.gum.createAIUnit({ archetypeId: 'garrison_unit', empireId: w.emp, planetId: w.ai.planetId, q: spot.q, r: spot.r,
    morale: 50, deployed: true })?.unit;
  const all = snapOthers(w, []);
  quiet(() => w.cm.captureColonyForPlayer(w.ai.planetId, 'ground_invasion'));
  assert(!!a && a.popCost === 0 && !w.ai.ownerEmpireId,
    `świadek: kolonia ${w.ai.planetId} przejęta przez gracza; jednostka ${a?.id} imperium ${w.emp} (popCost ${a?.popCost})`);
  assert(othersUnchanged(w, all) && w.ev.popsLost.length === 0,
    'L7d kontrola: żadna kolonia nie zmieniła blokady ani populacji, zero meldunków o utracie');
}
{
  console.log('\nL7e — kontrola: zapis sprzed Q2 (więź niezerwana, właściciel ostemplowany przy wczytaniu) — reguła właściciela chroni');
  // Kolonię przejęto przed Q2, a zapis wczytano: jednostka ma dalej koszt POP i dom w tej kolonii, a właściciela kolonii
  //   wyprowadza wczytanie z `empires[].colonies` (`EmpireColonyBootstrap`), z pominięciem `transferColony`.
  const scene = (noOwnerTerm) => {
    const w = boot();
    const u = recruit(w, w.home);
    w.home.ownerEmpireId = w.emp;                   // stempel jak przy wczytaniu — bez przejścia przez transferColony
    if (noOwnerTerm) w.cm._ownedHomeColony = (x) => w.cm.getColony(x?.homeColonyId) ?? null;
    const L = lockOf(w.home), H = humansOf(w.home);
    const others = snapOthers(w, [w.home]);
    bombard(w, u);
    w.cm._tickPendingPopReturns(RI.shock_infantry.delay + 0.01);
    return { w, u, L, H, others, lost: lostOf(w, u.id) };
  };
  const back = COST.shock_infantry * RI.shock_infantry.rate;
  const s = scene(false);
  assert(!s.w.gum.getUnit(s.u.id) && s.u.popCost === COST.shock_infantry && s.u.homeColonyId === s.w.home.planetId,
    `świadek: jednostka z kosztem ${s.u.popCost} i domem ${s.u.homeColonyId} (więź niezerwana) zginęła`);
  assert(near(lockOf(s.w.home), s.L) && near(humansOf(s.w.home), s.H) && othersUnchanged(s.w, s.others)
      && s.lost.length === 1 && near(s.lost[0].amount, back),
    `L7e kontrola: kolonia innego właściciela nietknięta (blokada ${s.L} → ${lockOf(s.w.home)}), meldunek o utracie zwrotu ` +
    `${back} (${JSON.stringify(s.lost.map(e => e.amount))})`);
  const c = scene(true);
  assert(!near(lockOf(c.w.home), c.L),
    `L7e CZUŁOŚĆ: bez terminu właściciela kolonia innego właściciela zmieniłaby blokadę (${c.L} → ${lockOf(c.w.home)}) — pin wyżej to widzi`);
}
{
  console.log('\nL7f — zapis i wczytanie po przejęciu: więź POP nie wraca');
  const w = boot();
  const col = secondPlayerColony(w);
  const u = recruit(w, w.home);
  placeOn(w, u, col);                                // stoi na INNEJ kolonii gracza — wczytanie wpisze ją jako dom (Finding 342)
  quiet(() => w.cm.transferColony(w.home.planetId, w.emp, 'invasion'));
  const data = JSON.parse(JSON.stringify(w.gum.serialize()));
  quiet(() => w.gum.restore(data));
  const u2 = w.gum.getUnit(u.id);
  const all = snapOthers(w, []);
  bombard(w, u2);
  w.cm._tickPendingPopReturns(3);
  assert(!!u2 && u2 !== u && !w.gum.getUnit(u.id),
    `świadek: jednostka ${u.id} odtworzona z zapisu (nowy obiekt, dom po wczytaniu ${u2?.homeColonyId}) i zginęła na ${col.planetId}`);
  assert(u2?.popCost === 0 && othersUnchanged(w, all) && lostOf(w, u.id).length === 0,
    `L7f: po wczytaniu popCost ${u2?.popCost} — śmierć nic nie rozlicza (żadna kolonia bez zmian, meldunków ${lostOf(w, u.id).length})`);
}

// ── L8 — Q5 (Finding 381): przejęcie kolonii anuluje jej kolejkę rekrutacji ──────────────────────────────────────
/** Zlecenie rekrutacji PRAWDZIWĄ ścieżką BEZ ukończenia: blokada POP, surowce i Kr pobrane przy zleceniu. */
function order(w, colony, archetypeId = 'shock_infantry') {
  const cost = { ...(ColonyManager.GROUND_UNIT_BUILD_COSTS[archetypeId] ?? {}),
                 ...(ColonyManager.GROUND_UNIT_COMMODITY_COSTS[archetypeId] ?? {}) };
  colony.credits = Math.max(colony.credits ?? 0, 10000);
  for (const [k, v] of Object.entries(cost)) colony.resourceSystem.receive({ [k]: v });
  const r = quiet(() => w.cm.startGroundUnitBuild(colony.planetId, archetypeId));
  if (!r?.ok) throw new Error(`zlecenie ${archetypeId} odrzucone: ${JSON.stringify(r)}`);
  return Object.keys(cost);
}
const stockOf = (c, keys) => Object.fromEntries(keys.map(k => [k, c.resourceSystem.getAmount(k)]));
const sameStock = (a, b) => Object.keys(a).every(k => near(a[k], b[k]));
/** Rejestr ukończonych rekrutacji (po `boot` — boot czyści EventBus). */
const buildsOn = () => { const out = []; EventBus.on('groundUnit:buildCompleted', (e) => out.push(e)); return out; };
{
  console.log('\nL8a — przejęcie ze zleceniami w toku: kolejka anulowana, blokada wraca, żadna jednostka nie powstaje, bez zwrotu');
  const w = boot();
  const built = buildsOn();
  const L0 = lockOf(w.home);
  const keys = [...new Set([...order(w, w.home, 'shock_infantry'), ...order(w, w.home, 'garrison_unit')])];
  const queued = w.home.groundUnitQueues.length;
  const L1 = lockOf(w.home), H1 = humansOf(w.home), kr1 = w.home.credits, st1 = stockOf(w.home, keys);
  const units0 = w.gum.getAllUnits().length;
  const others = snapOthers(w, [w.home]);
  quiet(() => w.cm.transferColony(w.home.planetId, w.emp, 'invasion'));
  const Lt = lockOf(w.home), qt = w.home.groundUnitQueues.length;
  quiet(() => w.cm._tickGroundUnitBuilds(10));
  const mine = built.filter(e => e.planetId === w.home.planetId);
  assert(w.home.ownerEmpireId === w.emp && queued === 2 && near(L1, L0 + COST.shock_infantry + COST.garrison_unit),
    `świadek: dwa zlecenia w kolejce domu (${queued}), blokada ${L0} → ${L1}; dom należy teraz do ${w.home.ownerEmpireId}`);
  assert(qt === 0 && near(Lt, L0) && near(humansOf(w.home), H1) && mine.length === 0 && w.gum.getAllUnits().length === units0,
    `L8a SEDNO: kolejka anulowana (${queued} → ${qt}), blokada ${L1} → ${Lt} (= ${L0}), populacja bez zmian, żadna jednostka ` +
    `nie powstała (buildCompleted ${mine.length}, jednostek ${units0} → ${w.gum.getAllUnits().length}) — przed Q5 budowa ` +
    'kończyła się jednostką GRACZA na ciele AI');
  assert(near(w.home.credits, kr1) && sameStock(stockOf(w.home, keys), st1),
    `L8a: surowce i Kr zlecenia przepadają z kolonią — bez zwrotu (Kr ${kr1} → ${w.home.credits})`);
  assert(othersUnchanged(w, others), 'L8a: żadna inna kolonia się nie zmieniła');
}
{
  console.log('\nL8b — cesja (gracz→AI) ze zleceniem w toku: kolejka anulowana, blokada wraca w oddanej kolonii');
  const w = boot();
  const col = secondPlayerColony(w);
  const built = buildsOn();
  const L0 = lockOf(col);
  order(w, col);
  const queued = col.groundUnitQueues.length, L1 = lockOf(col);
  cedeToAI(w, col);
  const qc = col.groundUnitQueues.length, Lc = lockOf(col);
  quiet(() => w.cm._tickGroundUnitBuilds(10));
  const mine = built.filter(e => e.planetId === col.planetId);
  assert(col.ownerEmpireId === w.emp && queued === 1 && near(L1, L0 + COST.shock_infantry),
    `świadek: zlecenie w kolejce kolonii ${col.planetId} (blokada ${L0} → ${L1}), kolonia oddana w cesji (${col.ownerEmpireId})`);
  assert(qc === 0 && near(Lc, L0) && mine.length === 0,
    `L8b: kolejka anulowana (${queued} → ${qc}), blokada ${L1} → ${Lc} (= ${L0}), żadna jednostka nie powstała ` +
    `(${mine.length})`);
}
{
  console.log('\nL8c — kontrola: zlecenie w INNEJ kolonii gracza przeżywa przejęcie domu i kończy się jednostką gracza');
  const w = boot();
  const col = secondPlayerColony(w);
  const built = buildsOn();
  order(w, col);
  const L1 = lockOf(col);
  quiet(() => w.cm.transferColony(w.home.planetId, w.emp, 'invasion'));
  const q = col.groundUnitQueues.length, Lq = lockOf(col);
  quiet(() => w.cm._tickGroundUnitBuilds(10));
  const mine = built.filter(e => e.planetId === col.planetId);
  const u = mine[0] ? w.gum.getUnit(mine[0].unitId) : null;
  assert(w.home.ownerEmpireId === w.emp && q === 1 && near(Lq, L1),
    `świadek: dom przejęty (${w.home.ownerEmpireId}); zlecenie w ${col.planetId} nadal w kolejce (${q}), blokada ${L1} → ${Lq}`);
  assert(mine.length === 1 && u?.owner === 'player' && u?.homeColonyId === col.planetId && u?.popCost === COST.shock_infantry,
    `L8c kontrola: zlecenie ukończone jednostką gracza (${u?.id}, dom ${u?.homeColonyId}, popCost ${u?.popCost})`);
}

// ── L0 — wszystkie drogi wyjścia jednostki gracza ─────────────────────────────────────────────────────────────
const PATHS = [
  { name: 'walka', arch: 'shock_infantry', fallen: true, run: (w, u) => combatKill(w, u, w.ai) },
  { name: 'mina', arch: 'shock_infantry', fallen: true, run: (w, u) => mineKill(w, u) },
  { name: 'głód', arch: 'shock_infantry', fallen: true, run: (w, u) => starve(w, u) },
  { name: 'ostrzał', arch: 'shock_infantry', fallen: true, run: (w, u) => bombard(w, u) },
  { name: 'termin wycofania', arch: 'shock_infantry', fallen: true, war: false, run: (w, u) => withdrawalKill(w, u) },
  { name: 'zniszczone ciało', arch: 'shock_infantry', fallen: true, run: (w, u) => bodyDestroyed(w, u) },
  { name: 'utrata transportu', arch: 'shock_infantry', fallen: true, run: (w, u) => transportLost(w, u) },
  { name: 'brak utrzymania', arch: 'shock_infantry', fallen: false, run: (w, u) => upkeepDisband(w, u) },
  { name: 'rozpad morale', arch: 'garrison_unit', fallen: false, run: (w, u) => moraleCollapse(w, u) },
  { name: 'ręczne rozwiązanie', arch: 'shock_infantry', fallen: false, run: (w, u) => call(w.cm, 'disbandGroundUnit', u.id) },
];
{
  console.log('\nL0 — każda droga wyjścia: blokada domu wraca do stanu sprzed rekrutacji, populacja spada tylko o poległą część');
  const rows = [];
  for (const p of PATHS) {
    const w = boot({ war: p.war !== false });
    const L0 = lockOf(w.home);
    const u = recruit(w, w.home, p.arch);
    const H0 = humansOf(w.home);
    const others = snapOthers(w, [w.home, w.ai]);
    p.run(w, u);
    w.cm._tickPendingPopReturns(3);
    const dead = p.fallen ? COST[p.arch] * (1 - (RI[p.arch]?.rate ?? 0)) : 0;
    rows.push({
      name: p.name, gone: !w.gum.getUnit(u.id), lockOk: near(lockOf(w.home), L0),
      popOk: near(humansOf(w.home), H0 - dead), othersOk: othersUnchanged(w, others), lost: lostOf(w, u.id).length,
      lock: +(lockOf(w.home) - L0).toFixed(3), pop: +(humansOf(w.home) - H0).toFixed(3), dead: +dead.toFixed(3),
    });
  }
  const bad = (k) => rows.filter(r => !r[k]).map(r => `${r.name}(blokada +${r.lock}, populacja ${r.pop}, poległa ${r.dead})`);
  assert(rows.every(r => r.gone && r.lost === 0),
    `świadek: wszystkie ${rows.length} dróg usunęły jednostkę bez meldunku o utracie (${rows.filter(r => !r.gone || r.lost).map(r => r.name).join(', ') || 'OK'})`);
  assert(rows.every(r => r.lockOk), `L0a: po zwłokach blokada domu = stan sprzed rekrutacji na każdej drodze (odstaje: ${bad('lockOk').join(' · ') || '—'})`);
  assert(rows.every(r => r.popOk), `L0b: populacja domu spada wyłącznie o część poległą (odstaje: ${bad('popOk').join(' · ') || '—'})`);
  assert(rows.every(r => r.othersOk), `L0c: inne kolonie nietknięte na każdej drodze (odstaje: ${rows.filter(r => !r.othersOk).map(r => r.name).join(', ') || '—'})`);
}
{
  console.log('\nL0d — przejęcie ciała, na którym stoi jednostka: blokada zwolniona w przejętej kolonii, więź POP zerwana (Q2)');
  const w = boot();
  const L0 = lockOf(w.home);
  const u = recruit(w, w.home, 'shock_infantry');
  const L1 = lockOf(w.home), H1 = humansOf(w.home);
  quiet(() => w.cm.transferColony(w.home.planetId, w.emp, 'invasion'));
  assert(!!w.gum.getUnit(u.id) && u.planetId === w.home.planetId && w.home.ownerEmpireId === w.emp,
    `świadek: jednostka gracza stoi dalej na przejętym ciele ${w.home.planetId} (${w.home.ownerEmpireId})`);
  // ⚠ Q2 (Finding 380; zgoda w poleceniu sesji zamykającej G1c, 2026-10-06): przed Q2 pin oczekiwał, że blokada ZOSTAJE
  //   (L1) w kolonii, która rekrutowała — po przejęciu cudzej, na zawsze.
  assert(near(lockOf(w.home), L0) && near(humansOf(w.home), H1) && u.popCost === 0 && u.homeColonyId === null
      && lostOf(w, u.id).length === 0,
    `L0d: blokada ${L1} → ${lockOf(w.home)} (= ${L0}) zwolniona w przejętej kolonii, populacja bez zmian; jednostka bez ` +
    `więzi POP (popCost ${u.popCost}, dom ${u.homeColonyId})`);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
