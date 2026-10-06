// AI STRIKES BACK S0 — keeper trzech defektów floty AI (Findingi 391, 392, 393, 394).
// Plan i decyzje: `docs/design/AI_STRIKES_BACK_PLAN.md` §5–§6; audyt fazy A: `AI_STRIKES_BACK_AUDIT.md`.
//
//   T1  391 — zaległość floty GRACZA nie zatrzymuje rozmieszczenia kadłuba AI; kadłub gracza dalej
//       odmawia (`fleet_in_arrears`), a bez długu przechodzi (KONTROLA PINU)
//   T2  391 — kurier AI w rezerwie przy długu gracza: rusza z rezerwy, kończy przejście i LECI na trasę
//       (prawdziwy dyspozytor `EmpireLogisticsSystem`); odmowa `courier_deploy_refused` nie pada
//   T3  392 — załoga AI nie kosztuje POP (SB2): reguła `mobilize_reserve` bez guardu załogowego, pełny
//       stos Directora zdejmuje kadłub z rezerwy przy `freePops = 0` stolicy, kadłub AI rozmieszcza się
//       bez załogi i bez płatnika; GRACZ dalej płaci dokładnie `crewCost` i dostaje `no_crew_pops`
//   T4  393/394 — strona GRACZA: kadłub AI w rezerwie / zadokowany / w trakcie mobilizacji / w tranzycie
//       warp NIE odbiera dominacji (zrzut dozwolony); w locie albo na orbicie odbiera, dopóki nie zostanie
//       pokonany; wygrana gracza (kontroler) daje dominację jak dotąd
//   T5  393/394 — strona AI (lustro): zadokowany albo rezerwowy kadłub GRACZA nie odbiera dominacji
//       imperium, na orbicie — odbiera; także przez prawdziwą bramkę desantu `_onVesselGroupVictory`
//   T6  reguła komunikatu: odmowa dominacji ⇔ uzbrojony wrogi kadłub, z którym da się walczyć (36 stanów,
//       oczekiwanie spisane z warstwy walki, nie z kanonu); tripwire — kanon `isFightableInSpace` jest
//       lustrem `ProximitySystem` i DSCS; UI pokazuje „wygraj bitwę” wyłącznie przy odmowie predykatu
//   T7  S0-3b — kontroler INNEJ strony bez kadłuba do walki nie odbiera dominacji (obie strony)
//
// ⚠ Fail-first: `isFightableInSpace` i `hasOrbitalDominanceInSystem` powstają w S0-3 — import przestrzeni
//   nazw i wywołania opcjonalne, żeby na kodzie sprzed poprawki piny DEGRADOWAŁY, a nie przerywały suitę.
// ⚠ Każdy pin wykluczający ma świadka: stan wejściowy (dług gracza, właściciel kadłuba, `freePops = 0`,
//   pusta orbita) jest asertowany PRZED akcją, w tym samym świecie.

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import gameState from '../../core/GameState.js';
import * as VesselNS from '../../entities/Vessel.js';
import { HULLS } from '../../data/HullsData.js';
import { DIRECTOR_RULES } from '../../data/DirectorRuleData.js';
import { DirectorGuards } from '../../systems/director/DirectorRegistry.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { FLEET_ACTIONS } from '../../data/FleetActions.js';
import { InvasionSystem } from '../../systems/InvasionSystem.js';
import { t } from '../../i18n/i18n.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const near = (a, b, eps = 1e-6) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < eps;

const WARSHIP = ['engine_ion', 'armor_standard', 'weapon_kinetic'];
const UNARMED = ['engine_ion', 'armor_standard'];
const COURIER = ['engine_chemical', 'cargo_small'];
const DROPPER = ['engine_ion', 'armor_standard', 'weapon_kinetic', 'troop_bay_s', 'drop_pods'];

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  return core;
}

/** Stolica imperium = pierwsza pełna kolonia z żywą ekonomią (kanon `DirectorProduction.capitalOf`). */
function capitalOf(core, empId) {
  return (core.empireRegistry.getColoniesByEmpire(empId) ?? [])
    .find(c => c && !c.isOutpost && c.resourceSystem && c.civSystem) ?? null;
}

/** Kadłub AI wprost w rejestrze, ze stemplem właściciela (trzy pola czytane przez `isEnemyVessel`). */
function aiHull(core, empId, body, {
  shipId = 'hull_frigate', modules = WARSHIP, service = 'stored', state = 'docked',
  dockedAt = body.id, systemId = body.systemId,
} = {}) {
  const v = VesselNS.createVessel(shipId, body.id, {
    name: `AI ${service}/${state}`, modules: [...modules], x: body.x ?? 0, y: body.y ?? 0,
    systemId, serviceState: service,
  });
  v.ownerEmpireId = empId; v.owner = empId; v.isEnemy = true;
  v.position.state = state; v.position.dockedAt = dockedAt;
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

/** Kadłub GRACZA (brak pól właściciela = gracz — kanon `isEnemyVessel`). */
function playerHull(core, body, {
  shipId = 'hull_frigate', modules = WARSHIP, service = 'active', state = 'docked',
  dockedAt = body.id, systemId = body.systemId ?? 'sys_home',
} = {}) {
  const v = VesselNS.createVessel(shipId, body.id, {
    name: `Gracz ${service}/${state}`, modules: [...modules], x: body.x ?? 0, y: body.y ?? 0,
    systemId, serviceState: service,
  });
  v.position.state = state; v.position.dockedAt = dockedAt;
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

const capture = (names) => {
  const seen = [];
  const offs = names.map(n => { const h = (p) => seen.push({ ev: n, ...p }); EventBus.on(n, h); return () => EventBus.off(n, h); });
  return { seen, stop: () => offs.forEach(f => f()) };
};

/** Placówka-atrapa AI (wzór `nt_route_scope_smoke`): encja + wpis kolonii + rejestracja w imperium. */
function addOutpost(core, empId, { id, systemId, x = 120, y = 0 }) {
  EntityManager.add({ id, name: id, type: 'planet', planetType: 'rocky', radius: 1, mass: 1, x, y, systemId,
    deposits: [{ resourceId: 'Nt', richness: 0.3, totalAmount: 1e5, remaining: 1e5 }] });
  const inv = new Map([['Nt', 5000]]);
  core.colonyManager._colonies.set(id, {
    planetId: id, name: id, isOutpost: true, ownerEmpireId: empId, systemId,
    resourceSystem: {
      inventory: inv,
      getAmount: (r) => inv.get(r) ?? 0,
      spend:   (c) => { for (const [k, v] of Object.entries(c)) inv.set(k, (inv.get(k) ?? 0) - v); return true; },
      receive: (g) => { for (const [k, v] of Object.entries(g)) inv.set(k, (inv.get(k) ?? 0) + v); },
    },
  });
  core.empireRegistry.addColony(empId, id);
}

// ── T1 — 391: dług floty gracza nie zatrzymuje kadłuba AI ─────────────────────────────────────
console.log('T1 — 391: zaległość floty GRACZA nie zatrzymuje rozmieszczenia kadłuba AI');
{
  const core = boot();
  const K = window.KOSMOS;
  const vm = core.vesselManager;
  const emp = core.empireRegistry.listAll()[0]?.id;
  const cap = capitalOf(core, emp);
  assert(!!cap, `T1 ŚWIADEK: imperium ${emp} ma stolicę z żywą ekonomią (${cap?.planetId ?? '—'})`);
  if (cap) {
    const C = EntityManager.get(cap.planetId);
    const ai = aiHull(core, emp, C);
    const debtor = playerHull(core, K.homePlanet);
    debtor.unpaidYears = 1;
    assert(vm.fleetInArrears() === true, 'T1 ŚWIADEK: flota GRACZA zalega (okręt w służbie z unpaidYears 1)');
    assert(VesselNS.isEnemyVessel(ai) === true && ai.serviceState === 'stored',
      'T1 ŚWIADEK: kadłub w rezerwie należy do imperium AI');

    const res = vm.deployVessel(ai.id);
    assert(res?.ok === true,
      `T1a SEDNO: kadłub AI rozmieszczony mimo długu GRACZA (ok=${res?.ok}, reason=${res?.reason ?? '—'}) — ` +
      'przed S0-1: `fleet_in_arrears`, choć AI utrzymania nie płaci');
    assert(ai.serviceState === 'mobilizing', `T1b: …i kadłub AI przechodzi w mobilizację (${ai.serviceState})`);

    const mine = playerHull(core, K.homePlanet, { service: 'stored' });
    const r2 = vm.deployVessel(mine.id);
    assert(r2?.ok === false && r2?.reason === 'fleet_in_arrears',
      `T1c KONTROLA: kadłub GRACZA przy długu własnej floty dalej odmawia (${r2?.reason ?? 'ok'}) — strona gracza bez zmian`);
    debtor.unpaidYears = 0;
    const r3 = vm.deployVessel(mine.id);
    assert(r3?.ok === true,
      `T1d KONTROLA PINU: po spłacie ten sam kadłub gracza przechodzi (ok=${r3?.ok}, reason=${r3?.reason ?? '—'}) — ` +
      'odmowa w T1c pochodziła z zaległości, nie z czego innego');
  }
}

// ── T2 — 391: kurier AI przy długu gracza rusza i leci ───────────────────────────────────────
console.log('T2 — 391: kurier AI w rezerwie przy długu gracza rusza z rezerwy i LECI na trasę');
{
  const core = boot();
  const K = window.KOSMOS;
  const vm = core.vesselManager;
  const empId = core.empireRegistry.listAll()[0]?.id;
  const empire = core.empireRegistry.get(empId);
  const cap = capitalOf(core, empId);
  const capSys = cap ? EntityManager.get(cap.planetId)?.systemId : null;
  addOutpost(core, empId, { id: 'probe_near', systemId: capSys });
  const els = core.empireLogisticsSystem;
  els._runDispatcher(empire);
  const route = (empire?.logistics?.routes ?? []).find(r => r.outpostId === 'probe_near') ?? null;
  assert(!!route, 'T2 ŚWIADEK: trasa logistyki do placówki w układzie stolicy istnieje');
  if (route && cap) {
    const v = vm.createAndRegister('hull_small', cap.planetId, { modules: [...COURIER] });
    assert(VesselNS.isEnemyVessel(v) === true,
      `T2 ŚWIADEK: kurier ze stoczni-szwu ostemplowany jako kadłub AI (${v.ownerEmpireId ?? '—'})`);
    v.serviceState = 'stored'; v.status = 'idle';
    v.position.state = 'docked'; v.position.dockedAt = cap.planetId;
    if (!route.courierIds.includes(v.id)) route.courierIds.push(v.id);
    const debtor = playerHull(core, K.homePlanet);
    debtor.unpaidYears = 1;
    assert(vm.fleetInArrears() === true, 'T2 ŚWIADEK: flota gracza zalega');

    const rej = capture(['director:mobilizeRejected']);
    els._advanceRouteCourier(empire, route, v.id, cap);
    assert(v.serviceState === 'mobilizing',
      `T2a SEDNO: kurier ruszył z rezerwy (${v.serviceState}) — przed S0-1 zostawał w niej przy każdym długu gracza`);
    assert(!rej.seen.some(e => e.reason === 'courier_deploy_refused'),
      `T2b: brak odmowy \`courier_deploy_refused\` (${rej.seen.map(e => e.detail).join(', ') || '—'}) — ` +
      'w audycie fazy A 4 392–4 498 takich odmów na imperium w 100 gy');
    vm._tickMobilization(1.0);
    assert(v.serviceState === 'active', `T2c: po miesiącu przejścia kurier jest w służbie (${v.serviceState})`);
    els._advanceRouteCourier(empire, route, v.id, cap);
    rej.stop();
    assert(v.mission?.targetId === 'probe_near',
      `T2d SEDNO: kurier LECI na trasę (misja → ${v.mission?.targetId ?? '—'}, stan ${v.position?.state})`);
  }
}

// ── T3 — 392: załoga AI bez POP (SB2) ─────────────────────────────────────────────────────────
console.log('T3 — 392: załoga AI nie kosztuje POP (SB2); gracz bez zmian');
{
  // Świat 1 — pełny stos Directora: reguła `mobilize_reserve` przy `freePops = 0` stolicy.
  const { core, K } = bootWithDirector({});
  const emp = K.empireRegistry.listAll()[0];
  const cap = K.directorProduction.capitalOf(emp.id);
  const C = EntityManager.get(cap.planetId);
  const g = aiHull(core, emp.id, C, { service: 'stored' });
  EventBus.emit('vessel:created', { vessel: g });          // indeks ThreatAssessment; właściciel już jest
  const p = playerHull(core, K.homePlanet);
  EventBus.emit('vessel:created', { vessel: p });
  const free0 = cap.civSystem.freePops ?? 0;
  if (free0 > 0) cap.civSystem.lockPops(free0, 'mix');
  assert((cap.civSystem.freePops ?? 0) <= 1e-9,
    `T3 ŚWIADEK: stolica AI ma freePops = 0 (${(cap.civSystem.freePops ?? 0).toFixed(2)}) — stan zmierzony w uprzęży od gy 20`);
  const ta = K.threatAssessment;
  assert(ta.getStrength('player') > ta.getStrength(emp.id),
    `T3 ŚWIADEK: gracz ma w służbie więcej siły (${ta.getStrength('player')} > ${ta.getStrength(emp.id)}) — guard porównania przechodzi`);

  const rule = DIRECTOR_RULES.mobilize_reserve;
  assert(!(rule?.guard ?? []).includes('empireHasFreeCrew'),
    'T3a SEDNO: reguła `mobilize_reserve` nie ma guardu załogowego — czytał `freePops` stolicy, u AI 0 na stałe');
  const ctx = { empireId: emp.id, empire: emp, year: K.timeSystem.gameTime, ruleId: 'mobilize_reserve' };
  const blocking = (rule?.guard ?? []).filter(n => !DirectorGuards.resolve(n)(ctx));
  assert(blocking.length === 0,
    `T3a: przy freePops = 0 żaden guard reguły nie blokuje (blokują: ${blocking.join(', ') || 'brak'})`);

  const mob = capture(['director:mobilized', 'director:mobilizeRejected']);
  const t0 = K.timeSystem.gameTime;
  for (let y = 1; y <= 8 && g.serviceState === 'stored'; y++) {
    K.timeSystem.gameTime = t0 + y;
    K.directorSystem.tickEmpire(emp.id, emp);
  }
  mob.stop();
  assert(g.serviceState === 'mobilizing',
    `T3b SEDNO: Director zdjął kadłub AI z rezerwy przy freePops = 0 (${g.serviceState}; zdarzenia: ` +
    `${mob.seen.map(e => `${e.ev}:${e.reason ?? e.count ?? ''}`).join(', ') || '—'}) — przed S0-2: nigdy`);
  assert(mob.seen.some(e => e.ev === 'director:mobilized' && e.empireId === emp.id),
    'T3b: …a fakt idzie zdarzeniem `director:mobilized`');
  // ⚠ Świadek w pinie: przed S0-2 kadłub w ogóle nie rusza, więc samo `crewLocked === 0` byłoby zielone jałowo.
  assert(g.serviceState === 'mobilizing' && (g.crewLocked ?? 0) === 0,
    `T3b: zdjęty z rezerwy kadłub AI jest BEZ załogi (${g.serviceState}, crewLocked=${g.crewLocked ?? 0})`);
}
{
  // Świat 2 — sam `deployVessel`: kadłub AI bez poboru i bez płatnika; gracz płaci jak dotąd.
  const core = boot();
  const K = window.KOSMOS;
  const vm = core.vesselManager;
  const crew = HULLS.hull_frigate.crewCost ?? 0;
  assert(crew > 0, `T3 KONTROLA PINU: hull_frigate ma niezerowy crewCost (${crew}) — zera niżej mierzą BRAMKĘ, nie dane`);
  const emp = core.empireRegistry.listAll()[0]?.id;
  const cap = capitalOf(core, emp);
  const C = EntityManager.get(cap.planetId);
  const civ = cap.civSystem;
  const lockedSum = (c) => Object.values(c?._lockedPerStrata ?? {}).reduce((s, x) => s + (Number(x) || 0), 0);
  const capacity = (c) => (c._unemployed ?? 0) + Object.keys(c.strata ?? {}).reduce((s, k) => s + c._hostableIn(k), 0);
  const exhaust = (c) => { for (const k of Object.keys(c.strata ?? {})) c.lockPops(c._hostableIn(k), k); c._unemployed = 0; };

  const lock0 = lockedSum(civ);
  const g = aiHull(core, emp, C);
  const r1 = vm.deployVessel(g.id);
  assert(r1?.ok === true,
    `T3c KONTROLA: kadłub AI rozmieszczony (ok=${r1?.ok}, reason=${r1?.reason ?? '—'}) — tak było i przed S0-2 ` +
    '(pobór szedł eksmisją, decyzja 18 W2); różnicę mierzy SEDNO niżej');
  assert((g.crewLocked ?? 0) === 0 && near(lockedSum(civ), lock0),
    `T3c SEDNO: BEZ załogi — crewLocked=${g.crewLocked ?? 0}, blokada stolicy ${lock0.toFixed(3)} → ` +
    `${lockedSum(civ).toFixed(3)} (przed S0-2: +${crew})`);
  const humans0 = civ.humans;
  EventBus.emit('vessel:wrecked', { vesselId: g.id, vessel: g });
  assert(near(civ.humans, humans0),
    `T3d: strata kadłuba AI nie zabija ludzi stolicy (${humans0.toFixed(3)} → ${civ.humans.toFixed(3)}) — ` +
    'pusta księga statku ⇒ `_settleCrewOnLoss` to no-op');

  const lost = aiHull(core, emp, C, { state: 'orbiting', dockedAt: null });
  lost.colonyId = null; lost.homeColonyId = null;
  const r2 = vm.deployVessel(lost.id);
  assert(r2?.ok === true,
    `T3e: kadłub AI bez kolonii-płatnika też się rozmieszcza (ok=${r2?.ok}, reason=${r2?.reason ?? '—'}) — ` +
    'załoga AI nie ma płatnika (przed S0-2: `no_crew_colony`)');

  const hc = core.colonyManager.getColony(K.homePlanet.id);
  const hlock0 = lockedSum(hc.civSystem);
  const mine = playerHull(core, K.homePlanet, { service: 'stored' });
  const r3 = vm.deployVessel(mine.id);
  assert(r3?.ok === true && near(mine.crewLocked ?? 0, crew) && near(lockedSum(hc.civSystem) - hlock0, crew),
    `T3f KONTROLA: GRACZ dalej płaci dokładnie crewCost (crewLocked=${mine.crewLocked ?? 0}, ` +
    `blokada kolonii +${(lockedSum(hc.civSystem) - hlock0).toFixed(3)})`);

  exhaust(hc.civSystem); exhaust(civ);
  assert(capacity(hc.civSystem) < crew && capacity(civ) < crew,
    `T3 ŚWIADEK: obie kolonie bez ludzi do obsadzenia (gracz ${capacity(hc.civSystem).toFixed(2)}, ` +
    `AI ${capacity(civ).toFixed(2)} < ${crew})`);
  const mine2 = playerHull(core, K.homePlanet, { service: 'stored' });
  const r4 = vm.deployVessel(mine2.id);
  assert(r4?.ok === false && r4?.reason === 'no_crew_pops',
    `T3g KONTROLA: gracz bez ludzi do obsadzenia dostaje \`no_crew_pops\` (${r4?.reason ?? 'ok'})`);
  const g2 = aiHull(core, emp, C);
  const r5 = vm.deployVessel(g2.id);
  assert(r5?.ok === true,
    `T3h SEDNO: przy TEJ SAMEJ wyczerpanej pojemności kadłub AI się rozmieszcza (ok=${r5?.ok}, ` +
    `reason=${r5?.reason ?? '—'}) — przed S0-2: \`no_crew_pops\``);
}

// ── T4 — 393/394: strona GRACZA ──────────────────────────────────────────────────────────────
console.log('T4 — 393/394: dominację gracza odbiera tylko kadłub AI, z którym da się walczyć');
{
  const core = boot();
  const K = window.KOSMOS;
  const ws = core.warSystem;
  const emp = core.empireRegistry.listAll()[0]?.id;
  K.diplomacySystem.declareWar(emp, 'keeper_setup');
  const cap = capitalOf(core, emp);
  const C = EntityManager.get(cap.planetId);
  const S = C.systemId;
  const dropper = playerHull(core, C, { shipId: 'hull_medium', modules: DROPPER, state: 'orbiting', systemId: S });
  dropper.groundUnits = ['gu_probe'];
  const canDrop = () => FLEET_ACTIONS.drop_troops.canExecute(dropper, { colonyManager: core.colonyManager });
  const dom = () => ws.playerHasOrbitalDominance(C.id);
  const NO_DOM = t('fleet.reason.noOrbitalDominance');
  assert(dropper.canDropTroops === true && dom() === true && canDrop().ok === true,
    'T4 KONTROLA PINU: bez kadłubów AI w układzie dominacja jest gracza, a zrzut dozwolony — bramka ma z czego spaść');

  const g = aiHull(core, emp, C, { service: 'stored', state: 'docked' });
  const r0 = canDrop();
  assert(dom() === true && r0.ok === true,
    `T4a SEDNO (393): kadłub AI w REZERWIE nie odbiera dominacji — zrzut dozwolony (${r0.reason ?? 'ok'})`);
  g.serviceState = 'active';
  assert(dom() === true && canDrop().ok === true,
    'T4b SEDNO (394): kadłub AI w SŁUŻBIE, ale ZADOKOWANY, nie odbiera — warstwa walki z nim nie walczy');
  g.serviceState = 'mobilizing';
  assert(dom() === true, 'T4c: kadłub AI w trakcie mobilizacji (nie w służbie) nie odbiera');
  g.serviceState = 'active'; g.position.state = 'orbiting';
  const r1 = canDrop();
  assert(dom() === false && r1.ok === false && r1.reason === NO_DOM,
    `T4d KONTROLA: kadłub AI w służbie NA ORBICIE dalej odbiera — zrzut odmówiony (${r1.reason ?? 'ok'})`);
  g.position.state = 'in_transit';
  assert(dom() === false, 'T4e KONTROLA: kadłub AI w LOCIE w tym układzie też odbiera');
  g.position.state = 'orbiting'; g.modules = [...UNARMED];
  assert(dom() === true, 'T4f KONTROLA: bezbronny kadłub na orbicie nie odbiera (próg uzbrojenia bez zmian)');
  g.modules = [...WARSHIP]; g.isWreck = true;
  assert(dom() === true && canDrop().ok === true, 'T4g KONTROLA: pokonany (wrak) przestaje odbierać — zrzut znów dozwolony');
  g.isWreck = false;
  gameState.set(`orbitalDominance.${S}`, { controllerId: 'player', year: 1 }, 'sb0_keeper');
  assert(dom() === true, 'T4h KONTROLA: wygrana gracza (kontroler = gracz) trzyma orbitę mimo kadłuba na niej — bez zmian');
  gameState.set(`orbitalDominance.${S}`, null, 'sb0_keeper');

  const home = K.homePlanet;
  const homeSys = home.systemId ?? 'sys_home';
  const before = ws.playerHasOrbitalDominance(home.id);
  const warp = aiHull(core, emp, C, { service: 'active', state: 'in_transit', dockedAt: null });
  warp.systemId = null;                                  // tranzyt warp: między układami
  assert(before === true && homeSys === 'sys_home',
    `T4 ŚWIADEK: orbita domu (${homeSys}) wolna przed tranzytem (${before})`);
  assert(ws.playerHasOrbitalDominance(home.id) === true,
    'T4i: kadłub AI w TRANZYCIE WARP nie stoi w żadnym układzie — nie odbiera dominacji w domu ' +
    "(przed S0-3: `?? 'sys_home'` liczyło go jako obecny w sys_home)");
}

// ── T5 — 393/394: strona AI (lustro) ─────────────────────────────────────────────────────────
console.log('T5 — lustro AI: dominację imperium odbiera tylko kadłub GRACZA, z którym da się walczyć');
{
  const core = boot();
  const K = window.KOSMOS;
  const ws = core.warSystem;
  for (const e of core.empireRegistry.listAll()) K.diplomacySystem.declareWar(e.id, 'keeper_setup');
  const emp = core.empireRegistry.listAll()[0]?.id;
  const home = K.homePlanet;
  const S = home.systemId ?? 'sys_home';
  const inv = new InvasionSystem();
  K.invasionSystem = inv;
  const aiDom = () => ws.hasOrbitalDominanceInSystem?.(emp, S);
  const dropper = aiHull(core, emp, home, { shipId: 'hull_medium', modules: DROPPER, service: 'active', state: 'orbiting', systemId: S });
  const guardP = playerHull(core, home, { state: 'docked', systemId: S });
  assert(dropper.canDropTroops === true && ws.getOrbitalController(S) == null,
    'T5 ŚWIADEK: zrzutowiec AI na orbicie domu, w układzie nie było bitwy (brak kontrolera)');

  assert(aiDom() === true, 'T5a SEDNO: zadokowany okręt GRACZA nie odbiera dominacji imperium');
  guardP.serviceState = 'stored';
  assert(aiDom() === true, 'T5b: okręt gracza w rezerwie też nie');
  guardP.serviceState = 'active'; guardP.position.state = 'orbiting';
  assert(aiDom() === false, 'T5c: okręt gracza w służbie NA ORBICIE odbiera (lustro T4d)');
  guardP.isWreck = true;
  assert(aiDom() === true, 'T5d: pokonany (wrak) przestaje odbierać');
  guardP.isWreck = false;

  const battle = () => ({
    warId: 'war_probe', battleId: 'b_probe',
    result: {
      winner: 'A',
      participantA: { type: 'vessel_group', empireId: emp, vesselIds: [dropper.id], count: 1, strength: 0 },
      participantB: { type: 'player', systemId: S },
      location: { systemId: S, planetId: null, point: { x: 0, y: 0 } },
    },
  });
  const ev1 = capture(['invasion:blocked', 'invasion:troopsLanded']);
  inv._onBattleResolved(battle());                     // okręt gracza NA ORBICIE
  ev1.stop();
  assert(ev1.seen.some(e => e.ev === 'invasion:blocked' && e.reason === 'no_orbital_dominance')
      && !ev1.seen.some(e => e.ev === 'invasion:troopsLanded'),
    `T5e KONTROLA: okręt gracza na orbicie — bramka desantu AI odmawia (${ev1.seen.map(e => e.reason ?? e.ev).join(', ') || '—'})`);
  guardP.position.state = 'docked';
  const ev2 = capture(['invasion:blocked', 'invasion:troopsLanded']);
  inv._onBattleResolved(battle());                     // okręt gracza ZADOKOWANY
  ev2.stop();
  assert(ev2.seen.some(e => e.ev === 'invasion:troopsLanded'),
    `T5f SEDNO: okręt gracza zadokowany — desant AI ląduje (${ev2.seen.map(e => e.reason ?? e.ev).join(', ') || '—'}) — ` +
    'przed S0-3: `no_orbital_dominance`, bo strona AI czytała wyłącznie kontrolera');
}

// ── T6 — reguła komunikatu + tripwire kanonu ────────────────────────────────────────────────
console.log('T6 — odmowa dominacji ⇔ uzbrojony wrogi kadłub, z którym da się walczyć');
{
  const core = boot();
  const ws = core.warSystem;
  const emp = core.empireRegistry.listAll()[0]?.id;
  const cap = capitalOf(core, emp);
  const C = EntityManager.get(cap.planetId);
  const g = aiHull(core, emp, C);
  // Oczekiwanie spisane z WARSTWY WALKI, nie z kanonu (inaczej pin byłby tautologią):
  // Proximity pomija rezerwę i dok, DSCS walczy tylko `in_transit`/`orbiting`, wrak nie walczy, a orbity
  // „trzyma" tylko uzbrojony kadłub (próg bez zmian).
  const expectDenied = (st, svc, armed, wreck) => !wreck && svc === 'active' && (st === 'orbiting' || st === 'in_transit') && armed;
  let combos = 0;
  const bad = [];
  for (const st of ['docked', 'orbiting', 'in_transit']) {
    for (const svc of ['active', 'stored', 'mobilizing']) {
      for (const armed of [true, false]) {
        for (const wreck of [false, true]) {
          g.position.state = st; g.serviceState = svc; g.modules = armed ? [...WARSHIP] : [...UNARMED]; g.isWreck = wreck;
          const denied = ws.playerHasOrbitalDominance(C.id) === false;
          combos++;
          if (denied !== expectDenied(st, svc, armed, wreck)) bad.push(`${st}/${svc}/${armed ? 'uzbr' : 'bez'}${wreck ? '/wrak' : ''}`);
        }
      }
    }
  }
  assert(combos === 36 && bad.length === 0,
    `T6a SEDNO: brak kontrolera — odmowa ⇔ uzbrojony kadłub AI w służbie, w locie albo na orbicie (${combos} stanów; ` +
    `rozjazdy: ${bad.join('; ') || 'brak'})`);

  const fight = VesselNS.isFightableInSpace;
  const canonBad = [];
  if (typeof fight === 'function') {
    for (const st of ['docked', 'orbiting', 'in_transit']) {
      for (const svc of ['active', 'stored', 'mobilizing']) {
        for (const wreck of [false, true]) {
          const v = { isWreck: wreck, serviceState: svc, position: { state: st } };
          if (fight(v) !== expectDenied(st, svc, true, wreck)) canonBad.push(`${st}/${svc}${wreck ? '/wrak' : ''}`);
        }
      }
    }
  }
  assert(typeof fight === 'function' && canonBad.length === 0,
    `T6b: kanon \`isFightableInSpace\` (Vessel.js) = lustro warstwy walki (rozjazdy: ${canonBad.join('; ') || (typeof fight === 'function' ? 'brak' : 'brak kanonu')})`);

  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const prox = strip(readFileSync('src/systems/ProximitySystem.js', 'utf8'));
  const dscs = strip(readFileSync('src/systems/DeepSpaceCombatSystem.js', 'utf8'));
  const valid = prox.match(/function _isValidForProximity\(v\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  const inCombat = dscs.match(/function _inCombatState\(v\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert(/if \(!isInService\(v\)\) return false;/.test(valid),
    'T6c TRIPWIRE: `ProximitySystem._isValidForProximity` dalej pomija kadłuby spoza służby — inaczej kanon kłamie');
  assert(/v1\.position\?\.state === 'docked' \|\| v2\.position\?\.state === 'docked'/.test(prox),
    'T6c TRIPWIRE: `ProximitySystem._checkPair` dalej nie zgłasza starcia z kadłubem zadokowanym');
  const states = [...inCombat.matchAll(/st === '([a-z_]+)'\) return true/g)].map(m => m[1]).sort().join(',');
  assert(states === 'in_transit,orbiting' && /return false;\s*\}$/.test(inCombat.trim()),
    `T6c TRIPWIRE: DSCS \`_inCombatState\` walczy wyłącznie ze stanami in_transit i orbiting (${states || '—'})`);

  const co = strip(readFileSync('src/ui/ColonyOverlay.js', 'utf8'));
  const msgAt = co.indexOf("t('drop.noDominance')");
  const gateAt = co.lastIndexOf('!warSys.playerHasOrbitalDominance(targetId)', msgAt);
  assert(msgAt > 0 && gateAt > 0 && msgAt - gateAt < 200 && co.split("t('drop.noDominance')").length === 2,
    'T6d ŚWIADEK: jedyny komunikat „wygraj bitwę” (`drop.noDominance`) stoi wyłącznie pod odmową predykatu — ' +
    'więc razem z T6a pojawia się tylko, gdy istnieje kadłub, z którym da się walczyć');
}

// ── T7 — S0-3b: kontroler innej strony bez kadłuba do walki ─────────────────────────────────
console.log('T7 — S0-3b: zapamiętany kontroler INNEJ strony sam nie odbiera dominacji');
{
  const core = boot();
  const K = window.KOSMOS;
  const ws = core.warSystem;
  const emp = core.empireRegistry.listAll()[0]?.id;
  K.diplomacySystem.declareWar(emp, 'keeper_setup');
  const cap = capitalOf(core, emp);
  const C = EntityManager.get(cap.planetId);
  const S = C.systemId;
  const dropper = playerHull(core, C, { shipId: 'hull_medium', modules: DROPPER, state: 'orbiting', systemId: S });
  dropper.groundUnits = ['gu_probe'];
  const canDrop = () => FLEET_ACTIONS.drop_troops.canExecute(dropper, { colonyManager: core.colonyManager });
  gameState.set(`orbitalDominance.${S}`, { controllerId: emp, year: 2 }, 'sb0_keeper');
  const g = aiHull(core, emp, C, { service: 'active', state: 'docked' });
  assert(ws.getOrbitalController(S) === emp, `T7 ŚWIADEK: imperium wygrało tu bitwę (kontroler ${ws.getOrbitalController(S)})`);
  assert(ws.playerHasOrbitalDominance(C.id) === true && canDrop().ok === true,
    'T7a SEDNO: zwycięzca zszedł do doku — kontroler-imperium bez kadłuba do walki nie zamyka orbity na zawsze ' +
    '(przed S0-3b: „wygraj bitwę”, której nie ma z kim stoczyć)');
  g.position.state = 'orbiting';
  assert(ws.playerHasOrbitalDominance(C.id) === false && canDrop().reason === t('fleet.reason.noOrbitalDominance'),
    'T7b KONTROLA: kontroler-imperium + kadłub na orbicie — odmowa');
  g.position.state = 'docked';

  // 36 stanów także z kontrolerem-imperium (T6a z innym wejściem).
  const expectDenied = (st, svc, armed, wreck) => !wreck && svc === 'active' && (st === 'orbiting' || st === 'in_transit') && armed;
  const bad = [];
  for (const st of ['docked', 'orbiting', 'in_transit']) {
    for (const svc of ['active', 'stored', 'mobilizing']) {
      for (const armed of [true, false]) {
        for (const wreck of [false, true]) {
          g.position.state = st; g.serviceState = svc; g.modules = armed ? [...WARSHIP] : [...UNARMED]; g.isWreck = wreck;
          if ((ws.playerHasOrbitalDominance(C.id) === false) !== expectDenied(st, svc, armed, wreck)) bad.push(`${st}/${svc}/${armed ? 'uzbr' : 'bez'}${wreck ? '/wrak' : ''}`);
        }
      }
    }
  }
  assert(bad.length === 0, `T7c: z kontrolerem-imperium odmowa ⇔ kadłub, z którym da się walczyć (rozjazdy: ${bad.join('; ') || 'brak'})`);

  // Lustro AI: kontroler-gracz bez kadłuba gracza do walki nie zamyka orbity imperium.
  const home = K.homePlanet;
  const HS = home.systemId ?? 'sys_home';
  gameState.set(`orbitalDominance.${HS}`, { controllerId: 'player', year: 3 }, 'sb0_keeper');
  const pg = playerHull(core, home, { state: 'docked', systemId: HS });
  assert(ws.hasOrbitalDominanceInSystem?.(emp, HS) === true,
    'T7d SEDNO: kontroler-gracz, okręt gracza zadokowany — imperium trzyma orbitę (lustro T7a)');
  pg.position.state = 'orbiting';
  // ⚠ NIE kontrola: na kodzie sprzed S0-3 metody `hasOrbitalDominanceInSystem` nie ma, więc ten pin
  //   pada (fail-first na C2). Kontrolą jest wyłącznie względem samego S0-3b — przechodzi z nim i bez niego.
  assert(ws.hasOrbitalDominanceInSystem?.(emp, HS) === false,
    'T7e (nie-jałowość T7d): kontroler-gracz + okręt gracza na orbicie — odmowa imperium');
}

console.log(`\n[sb0_fleet_defects_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
