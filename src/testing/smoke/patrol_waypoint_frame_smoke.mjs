// ══════════════════════════════════════════════════════════════════════════════════════════
// patrol_waypoint_frame_smoke — Finding 267: `patrolManual` (trzeci producent punktu z ramki
// KAMERY) odmawia waypointu spoza ramki statku W CHWILI JEGO POŁOŻENIA (D-267a = per-punktowe
// odczytanie reguły D-89c: położenie punktu JEST jego finalizacją), GŁOŚNO (Dziennik `fleet`/`warn`,
// istniejący powód `target_other_system` — zero nowych kluczy), a trasa zebrana do tej pory
// PRZEŻYWA; ENTER finalizuje trasę już-w-całości-ważną, z jedną obroną w głąb (statek musi
// nadal stać w ramce trasy — mógł skończyć skok warp między klikami).
//
// MECHANIZM NAPRAWY (trzy warstwy, jeden termin): producent (`RightClickMenu`, jedyne wejście
// `patrolWaypoints` z `vesselId`) wstrzykuje `metadata.validateWaypoint` do pickera; CZYSTA maszyna
// `PickerStateMachine.addWaypoint` woła hook i przy wecie NIE rusza bufora (`vetoed: true`);
// `UIManager.addPickerWaypoint` zamienia weto na `ui:pickerWaypointRejected`, a HUD w `GameScene`
// pokazuje nazwę statku + powód (`describeOrderFail`). Picker POI (`intent:'create_poi'`) i debug
// NIE podają weta — POI nie ma `systemId` (Finding 152); `patrol` NIE wchodzi do
// `POINT_SOURCED_ORDER_TYPES` (T8e w `map_click_frame_smoke`).
//
// ⚠ DLACZEGO ODWRÓCONY PIN T9b (`map_click_frame_smoke`) NIE MÓGŁ PAŚĆ SAM Z SIEBIE — ta sama
//   klasa co T9a w D-89d: wołał `buildPatrolFromWaypoints` + `mos.issueOrder` WPROST, a MOS jest
//   dla tras BEZ RAMKI z definicji (spec `patrolRoute` = gołe punkty; POI też). Termin mieszka
//   u PRODUCENTA, więc pin musi jechać PRODUCENTEM: prawdziwy `RightClickMenu._handleOptionClick`
//   → prawdziwa maszyna `PickerStateMachine` → prawdziwy `MovementOrderSystem`. Stary pin został
//   w tamtym keeperze jako KONTROLA (MOS pozostaje przepuszczalny) — tu lustrzanie T9.
//
// T-tabela:
//   T1  producent uzbraja picker z `vesselId` I `validateWaypoint` w metadata (wykonanie)
//   T2  punkt spoza ramki → weto NATYCHMIAST: `{ok:false, reason:'target_other_system', vetoed}`,
//       bufor NIETKNIĘTY, DOKŁADNIE jeden wpis fleet/warn z NAZWĄ statku i przetłumaczonym powodem
//   T3  trasa PRZEŻYWA odmowę: P1 ✓ (ramka statku) → zmiana układu → P2 ✗ → powrót → P3 ✓ → ENTER
//       → rozkaz `patrol` z DOKŁADNIE [P1, P3]; odrzucony punkt NIE trafia do trasy
//   T4  ramka TRASY jest stała: statek „przyleciał" do innego układu i kamera za nim — P2 z NOWEJ
//       ramki odrzucony (bez tego trasa mieszałaby dwie ramki)
//   T5  obrona przy ENTER: statek opuścił ramkę trasy między klikami → brak rozkazu, jeden wpis
//   T6  KONTROLE (zielone po OBU stronach): pełny przebieg w jednej ramce = rozkaz + ZERO wpisów;
//       picker POI i debug (bez `vesselId`) przyjmują punkt „obcy" (Finding 152 nietknięty)
//   T7  piny ŹRÓDŁOWE (\s-tolerantne, CRLF-safe — Finding 270): UIManager emituje
//       `ui:pickerWaypointRejected` pod `vetoed`; HUD subskrybuje i formatuje `describeOrderFail`;
//       klik w `GameScene` nadal woła `um.addPickerWaypoint(gp)`; `POINT_SOURCED_ORDER_TYPES` bez patrolu
//   T8  i18n: zero nowych kluczy — `log.el.orderRejected` + `vessel.reasonTargetOtherSystem` żyją
//       w PL i EN, tekst odmowy w obu językach BEZ surowego sluga
//   T9  KONTROLA: MOS pozostaje przepuszczalny dla gołej trasy (termin należy do producenta, nie do MOS)
//
// FAIL-FIRST (finalne piny, REALNY `git worktree` na e087507 — ZMIERZONE 21 PASS / 21 FAIL):
// czerwone T1 (1: brak `validateWaypoint`), T2 (5), T3 (6), T4 (2), T5 (2), T7 (3 piny źródłowe),
// T8 (2: piny TEKSTU wpisu — na HEAD wpisu nie ma; piny „klucze istnieją" zielone po obu stronach);
// T6/T9 zielone po obu stronach (kontrole). Wynik w `docs/design/VESSEL_ORDERS_PLAN.md` §267.
//
// Uruchom: node src/testing/smoke/patrol_waypoint_frame_smoke.mjs
// ══════════════════════════════════════════════════════════════════════════════════════════
import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import { readFileSync }        from 'node:fs';
import { fileURLToPath }       from 'node:url';
import { dirname, join }       from 'node:path';
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { FleetSystem }         from '../../systems/FleetSystem.js';
import { RightClickMenu }      from '../../ui/RightClickMenu.js';
import { buildMenuOptions }    from '../../data/RightClickMenuOptions.js';
import { buildPatrolFromWaypoints } from '../../utils/OrderDispatcher.js';
import { createPickerState, startPicker, addWaypoint, finalizePicker } from '../../utils/PickerStateMachine.js';
import { setLocale, getLocale, t } from '../../i18n/i18n.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', '..');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const J = (x) => JSON.stringify(x);

const AU  = GAME_CONFIG.AU_TO_PX;
const orb = (a) => ({ a, e: 0, T: a ** 1.5, M: 0, inclinationOffset: 0 });
function addBody(id, sys, auX, name) {
  const b = { id, type: 'planet', name, x: auX * AU, y: 0, explored: true, analyzed: true,
              planetType: 'rocky', orbital: orb(auX), deposits: [], systemId: sys };
  EntityManager.add(b); return b;
}
const addStar = (sys) =>
  EntityManager.add({ id: 'star_' + sys, type: 'star', name: 'G ' + sys, systemId: sys, x: 0, y: 0, mass: 1 });
const techStub = {
  isResearched: () => true, getFuelEfficiency: () => 1.0, getShipSpeedMultiplier: () => 1.0,
  getShipRangeMultiplier: () => 1.0, getMultiplier: () => 1.0,
  getMissionYieldBonus: () => 0, getDisasterReduction: () => 0, getShipSurvivalChance: () => 0,
};

let vMgr, mos, fSys, pushed;
function scene({ camera = 'sys_home' } = {}) {
  EventBus.clear();
  EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 100 }, activeSystemId: camera };
  addStar('sys_home'); addStar('sys_020');
  const home = addBody('p_home', 'sys_home', 1.00, 'Dom');
  addBody('h2', 'sys_home', 6.00, 'Dom II');
  addBody('f_a', 'sys_020', 2.00, 'Obca A');
  vMgr = new VesselManager();
  mos  = new MovementOrderSystem(vMgr);
  fSys = new FleetSystem(vMgr);
  pushed = [];
  const cols = [
    { planetId: 'p_home', name: 'Dom',  isOutpost: false, resourceSystem: {} },
    { planetId: 'f_a',    name: 'Obca', isOutpost: false, resourceSystem: {} },
  ];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: home, vesselManager: vMgr, movementOrderSystem: mos, fleetSystem: fSys,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: techStub,
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null,
                     getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: (e) => pushed.push(e) },
  });
}
function ship({ sys = 'sys_home', auX = 1, name = 'Zmija' } = {}) {
  const v = vMgr.createAndRegister('hull_small', 'p_home', { name, modules: ['engine_ion'], x: auX * AU, y: 0 });
  v.position.x = auX * AU; v.position.y = 0;
  v.position.state = 'orbiting'; v.position.dockedAt = null; v.status = 'idle';
  v.fuel.current = v.fuel.max = 9999; v.speedAU = 1.0;
  v.systemId = sys;
  v.warpFuel = { current: 5, max: 5, consumption: 0.5 };
  return v;
}
const setCamera = (sys) => { window.KOSMOS.activeSystemId = sys; };

// Producent: PRAWDZIWY `_handleOptionClick` z opcją `patrolManual`; jedyny stub = `uiManager`
// (przechwyt `setPickerMode`), bo `UIManager` nie importuje się pod node — a jego wrapper
// deleguje do TEJ SAMEJ czystej maszyny, którą tu prowadzimy WYKONANIEM (pin źródłowy T7).
const TARGET = () => ({ type: 'empty', worldPoint: { x: 100, y: 0 } });
const patrolOpt = (v) => buildMenuOptions(TARGET(), { vesselId: v.id }).find(o => o.id === 'patrolManual');
function armPatrol(v) {
  let captured = null;
  window.KOSMOS.uiManager = {
    getSelectedVesselId:  () => v.id,
    getSelectedVesselIds: () => [v.id],
    getSelectedFleetId:   () => null,
    setPickerMode: (mode, cb, metadata) => { captured = { mode, cb, metadata }; return true; },
  };
  new RightClickMenu()._handleOptionClick(patrolOpt(v), TARGET());
  if (!captured) return null;
  const started = startPicker(createPickerState(), captured.mode, captured.cb, captured.metadata);
  const sess = { captured, st: started.ok ? started.newState : null, last: null };
  sess.place = (pt) => { const r = addWaypoint(sess.st, pt); sess.last = r; if (r.ok) sess.st = r.newState; return r; };
  sess.finish = () => { const f = finalizePicker(sess.st); if (f.ok) f.callback?.(f.result, f.metadata); return f; };
  return sess;
}
const P = (auX) => ({ x: auX * AU, y: 0 });
const slug = 'target_other_system';
const src = (rel) => readFileSync(join(SRC, rel), 'utf8');

const locale0 = getLocale();
setLocale('en');

// ═══ T1 — producent uzbraja picker z vesselId I validateWaypoint ═════════════════════════════
header('T1  patrolManual uzbraja picker: mode=patrolWaypoints, metadata.vesselId, metadata.validateWaypoint');
{
  scene({ camera: 'sys_home' });
  const v = ship({ sys: 'sys_020', auX: 2 });
  const opt = patrolOpt(v);
  assert(!!opt && opt.orderType === 'patrol' && opt.action === 'issueOrder', `opcja patrolManual istnieje w menu „pusto" (${J(opt?.id)})`);
  const s = armPatrol(v);
  assert(!!s && s.captured.mode === 'patrolWaypoints', `picker uzbrojony w trybie patrolWaypoints (${s?.captured?.mode})`);
  assert(s?.captured.metadata?.vesselId === v.id, `metadata.vesselId === statek (${s?.captured.metadata?.vesselId})`);
  assert(typeof s?.captured.metadata?.validateWaypoint === 'function', `metadata.validateWaypoint jest FUNKCJĄ (jest: ${typeof s?.captured.metadata?.validateWaypoint})`);
  assert(s?.st?.mode === 'patrolWaypoints' && s.st.waypoints.length === 0, 'KONTROLA: prawdziwa maszyna wystartowała z pustym buforem');
}

// ═══ T2 — weto W CHWILI POŁOŻENIA, bufor nietknięty, jeden GŁOŚNY wpis ═════════════════════
header('T2  punkt z ramki KAMERY ≠ ramka STATKU → odmowa natychmiast, bufor pusty, jeden wpis fleet/warn');
{
  scene({ camera: 'sys_home' });
  const v = ship({ sys: 'sys_020', auX: 2, name: 'Zmija' });
  const s = armPatrol(v);
  const r = s.place(P(1.0));
  assert(r.ok === false && r.reason === slug && r.vetoed === true,
    `addWaypoint → {ok:false, reason:'${slug}', vetoed:true} (jest: ${J(r)})`);
  assert(s.st.waypoints.length === 0, `bufor trasy NIETKNIĘTY (długość ${s.st.waypoints.length})`);
  assert(pushed.length === 1, `DOKŁADNIE jeden wpis w Dzienniku (jest: ${pushed.length})`);
  const e = pushed[0] ?? {};
  assert(e.channel === 'fleet' && e.severity === 'warn', `kanał/waga fleet/warn (${e.channel}/${e.severity})`);
  assert(typeof e.text === 'string' && e.text.includes('Zmija') && e.text.includes(t('vessel.reasonTargetOtherSystem')) && !e.text.includes(slug),
    `tekst niesie NAZWĘ statku + przetłumaczony powód, bez surowego sluga (${J(e.text)})`);
  assert(mos.getOrder(v.id) == null, 'KONTROLA: żaden rozkaz nie powstał z samego weta');
}

// ═══ T3 — trasa PRZEŻYWA odmowę; ENTER daje rozkaz z DOKŁADNIE przyjętymi punktami ═════════
header('T3  P1 ✓ → zmiana układu → P2 ✗ → powrót → P3 ✓ → ENTER → patrol [P1, P3]');
{
  scene({ camera: 'sys_020' });
  const v = ship({ sys: 'sys_020', auX: 2 });
  const s = armPatrol(v);
  const r1 = s.place(P(1.0));
  assert(r1.ok === true && s.st.waypoints.length === 1, `P1 w ramce statku PRZYJĘTY (len=${s.st.waypoints.length})`);
  setCamera('sys_home');
  const r2 = s.place(P(4.0));
  assert(r2.ok === false && r2.reason === slug && s.st.waypoints.length === 1,
    `P2 po przełączeniu układu ODRZUCONY, bufor nadal 1 (ok=${r2.ok}, len=${s.st.waypoints.length})`);
  assert(pushed.length === 1, `jeden wpis za P2 (jest: ${pushed.length})`);
  setCamera('sys_020');
  const r3 = s.place(P(3.0));
  assert(r3.ok === true && s.st.waypoints.length === 2, `P3 po powrocie PRZYJĘTY (len=${s.st.waypoints.length})`);
  const f = s.finish();
  const o = mos.getOrder(v.id);
  assert(f.ok === true && o?.type === 'patrol', `ENTER → rozkaz patrol POWSTAŁ (${o?.type ?? 'BRAK'})`);
  const route = o?.patrolRoute ?? o?.spec?.patrolRoute ?? null;
  assert(Array.isArray(route) && route.length === 2 && route[0].x === P(1.0).x && route[1].x === P(3.0).x,
    `trasa = DOKŁADNIE [P1, P3] (jest: ${J(route)})`);
  assert(!(route ?? []).some(w => w.x === P(4.0).x), 'odrzucony P2 NIE trafił do trasy');
  assert(pushed.length === 1, `ENTER bez dodatkowych wpisów (jest: ${pushed.length})`);
}

// ═══ T4 — ramka TRASY jest stała (statek „przyleciał", kamera za nim) ═══════════════════════
header('T4  po P1 statek i kamera w NOWYM układzie → P2 odrzucony (trasa nie miesza ramek)');
{
  scene({ camera: 'sys_020' });
  const v = ship({ sys: 'sys_020', auX: 2 });
  const s = armPatrol(v);
  assert(s.place(P(1.0)).ok === true, 'P1 przyjęty w ramce sys_020');
  v.systemId = 'sys_home'; setCamera('sys_home');   // przylot warp między klikami + kamera za statkiem
  const r2 = s.place(P(4.0));
  assert(r2.ok === false && r2.reason === slug && s.st.waypoints.length === 1,
    `P2 z NOWEJ ramki (statek==kamera, ale ≠ ramka trasy) ODRZUCONY (ok=${r2.ok}, len=${s.st.waypoints.length})`);
  assert(pushed.length === 1 && !String(pushed[0].text).includes(slug), 'jeden GŁOŚNY wpis bez sluga');
}

// ═══ T5 — obrona przy ENTER: statek opuścił ramkę trasy ═════════════════════════════════════
header('T5  P1,P2 ✓ → statek zmienia układ → ENTER → BRAK rozkazu, jeden wpis');
{
  scene({ camera: 'sys_020' });
  const v = ship({ sys: 'sys_020', auX: 2 });
  const s = armPatrol(v);
  assert(s.place(P(1.0)).ok === true && s.place(P(3.0)).ok === true && s.st.waypoints.length === 2, 'P1, P2 przyjęte');
  v.systemId = 'sys_home';                          // skok warp zakończył się między klikami a ENTER
  const f = s.finish();
  assert(f.ok === true, 'KONTROLA: maszyna finalizuje (min 2 punkty) — odmowa jest PRODUCENTA, nie maszyny');
  assert(mos.getOrder(v.id) == null, `rozkaz NIE powstał (jest: ${mos.getOrder(v.id)?.type ?? 'BRAK'})`);
  assert(pushed.length === 1 && pushed[0].channel === 'fleet' && pushed[0].severity === 'warn' && !String(pushed[0].text).includes(slug),
    `jeden wpis fleet/warn bez sluga (${pushed.length}: ${J(pushed[0]?.text)})`);
}

// ═══ T6 — KONTROLE ═══════════════════════════════════════════════════════════════════════════
header('T6  KONTROLE — pełny przebieg w jednej ramce; picker POI i debug bez weta');
{
  scene({ camera: 'sys_020' });
  const v = ship({ sys: 'sys_020', auX: 2 });
  const s = armPatrol(v);
  assert(s.place(P(1.0)).ok && s.place(P(4.0)).ok, 'dwa punkty w ramce statku przyjęte');
  const f = s.finish();
  const o = mos.getOrder(v.id);
  assert(f.ok && o?.type === 'patrol' && (o?.patrolRoute ?? o?.spec?.patrolRoute)?.length === 2 && pushed.length === 0,
    `jedna ramka ⇒ rozkaz patrol z 2 punktami i ZERO wpisów (order=${o?.type ?? 'BRAK'}, wpisów=${pushed.length})`);
  // Picker POI (create_poi) — bez vesselId, bez weta: punkt „obcy" przechodzi (Finding 152)
  scene({ camera: 'sys_home' });
  ship({ sys: 'sys_020', auX: 2 });
  const poi = startPicker(createPickerState(), 'patrolWaypoints', () => {}, { intent: 'create_poi', poiType: 'patrol' });
  const rp = addWaypoint(poi.newState, P(4.0));
  assert(rp.ok === true && rp.newState.waypoints.length === 1, 'picker POI przyjmuje punkt bez terminu ramki (Finding 152 nietknięty)');
  const dbg = startPicker(createPickerState(), 'patrolWaypoints', () => {}, { source: 'debug' });
  assert(addWaypoint(dbg.newState, P(4.0)).ok === true, 'picker debug przyjmuje punkt bez terminu ramki');
  assert(pushed.length === 0, 'KONTROLA: ani POI, ani debug nie piszą do Dziennika');
}

// ═══ T7 — piny ŹRÓDŁOWE (CRLF-safe) ══════════════════════════════════════════════════════════
header('T7  źródło — UIManager emituje ui:pickerWaypointRejected pod vetoed; HUD subskrybuje; klik nietknięty');
{
  const um = src('scenes/UIManager.js');
  const i = um.indexOf('addPickerWaypoint(point)');
  const body = i >= 0 ? um.slice(i, um.indexOf('finalizePickerMode()', i)) : '';
  assert(body.length > 100 && /result\.vetoed/.test(body) && /ui:pickerWaypointRejected/.test(body),
    'UIManager.addPickerWaypoint: pod `result.vetoed` emituje `ui:pickerWaypointRejected`');
  assert(/_addPickerWaypoint\(this\._pickerState,\s*point\)/.test(body),
    'UIManager.addPickerWaypoint deleguje do czystej maszyny (ta sama, którą jedzie ten keeper)');
  const gs = src('scenes/GameScene.js');
  const h = gs.search(/_createPickerHUD\(\)\s*\{/);   // DEFINICJA, nie wywołanie `this._createPickerHUD();`
  const hud = h >= 0 ? gs.slice(h, h + 4000) : '';
  assert(/ui:pickerWaypointRejected/.test(hud) && /describeOrderFail/.test(hud),
    'GameScene._createPickerHUD subskrybuje `ui:pickerWaypointRejected` i formatuje przez describeOrderFail');
  assert(/um\.addPickerWaypoint\(gp\)/.test(gs), 'klik w GameScene nadal woła `um.addPickerWaypoint(gp)` (ścieżka bez zmian)');
  const psm = src('utils/PickerStateMachine.js');
  assert(/validateWaypoint\?\.\(/.test(psm) && !/window\./.test(psm), 'PickerStateMachine woła `validateWaypoint?.(` i NADAL nie zna `window` (czysta)');
  const rcm = src('ui/RightClickMenu.js');
  const m = /POINT_SOURCED_ORDER_TYPES\s*=\s*new Set\(\[([^\]]*)\]\)/.exec(rcm);
  assert(!!m && !/patrol/.test(m[1]) && /moveToPoint/.test(m[1]) && /dock/.test(m[1]),
    `POINT_SOURCED_ORDER_TYPES bez patrolu (T8e): [${(m?.[1] ?? '').trim()}]`);
}

// ═══ T8 — i18n: zero nowych kluczy, tekst bez sluga w OBU językach ═══════════════════════════
header('T8  i18n — log.el.orderRejected + vessel.reasonTargetOtherSystem w PL i EN, bez sluga');
{
  for (const loc of ['pl', 'en']) {
    setLocale(loc);
    const a = t('log.el.orderRejected', 'X'), b = t('vessel.reasonTargetOtherSystem');
    assert(a !== 'log.el.orderRejected' && b !== 'vessel.reasonTargetOtherSystem' && b.length > 0,
      `${loc}: oba klucze istnieją (${J(a)} / ${J(b)})`);
    scene({ camera: 'sys_home' });
    const v = ship({ sys: 'sys_020', auX: 2, name: 'Zmija' });
    const s = armPatrol(v);
    s.place(P(1.0));
    assert(pushed.length === 1 && !String(pushed[0].text).includes(slug) && String(pushed[0].text).includes(b),
      `${loc}: wpis Dziennika przetłumaczony, bez sluga (${J(pushed[0]?.text)})`);
  }
  setLocale('en');
}

// ═══ T9 — KONTROLA: MOS jest dla tras bez ramki z definicji ═════════════════════════════════
header('T9  KONTROLA — buildPatrolFromWaypoints + mos.issueOrder z gołą trasą NADAL przechodzi (termin = producent)');
{
  scene({ camera: 'sys_home' });
  const v = ship({ sys: 'sys_020', auX: 2 });
  const built = buildPatrolFromWaypoints([P(1.0), P(4.0)]);
  const rp = mos.issueOrder(v.id, built.spec);
  assert(built.ok === true && rp?.ok === true,
    `MOS przyjmuje gołą trasę (ok=${rp?.ok}) — spec patrolRoute nie niesie ramki (Finding 152); termin siedzi u producenta`);
}

setLocale(locale0);
console.log(`\n════ patrol_waypoint_frame_smoke: ${pass} PASS / ${fail} FAIL ════`);
process.exit(fail ? 1 : 0);
