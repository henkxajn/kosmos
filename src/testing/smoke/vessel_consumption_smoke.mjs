// 582 + 102 + 107 (+ 584, 585) — JEDEN szew „statek zużyty / usunięty poza walką” (`VesselManager.destroyVessel`).
//
// Faza A (2026-10-30, kotwica `37cb526`) zmierzyła, że normalna kolonizacja SAMA cieknie: `_processColonyArrival` wołało
//   `unlockPops(exp.crewCost = 8, undefined)` po każdym sukcesie (nowa kolonia, upgrade placówki, migracja) — nietypowane,
//   proporcjonalne zdjęcie do 8 POP CUDZYCH blokad kolonii macierzystej (584). Kolonizacja obca usuwała statek surowym
//   `delete` (102 — załoga, 107 — ładownia), a oba usuwacze emitowały `vessel:docked` (582). Rozbiórka gubiła kolonistów
//   na pokładzie (585).
//
// Podpis właściciela (2026-10-30): Q1 (a) usunąć trzy `unlockPops(exp.crewCost)` z gałęzi sukcesu · Q2 katastrofy poza
//   zakresem (583) · Q3 wyładunek jednostek — REZERWA `transport_lost` w tym slice (ścieżka ładowni stawia jednostkę na
//   współrzędnych ciała ZAŁADUNKU, a siatki ciał są różne — 349; własny wpis 586) · Q4 koloniści na pokładzie dołączają
//   do kolonii gracza, przy której statek stoi (dok albo orbita) · Q5 `vessel:removed { vesselId, reason }`, bez
//   `vessel:docked` przy usunięciu; `vessel:destroyed` zostaje bojowe · naprawa 107 przy wczytaniu (osobny pin).
//
//   C1  normalna kolonizacja: ŚWIADKOWIE w kolonii macierzystej przeżywają przylot — załoga okrętu w służbie, garnizon
//       na ziemi, oczekujący zwrot jednostki z ładowni (584); `vessel:removed{colonized}`, bez `vessel:docked` (582)
//   C2  upgrade placówki — j.w. (`outpost_upgraded`)
//   C3  migracja (statek przeżywa) — świadkowie i WŁASNA załoga statku przeżywają; prawdziwy dok emituje `vessel:docked`
//   C4  kolonizacja obca po skoku warp (stan B): załoga zwolniona (102), zero sierot (107), `vessel:removed{colonized}`,
//       koloniści bez podwójnego liczenia
//   C5  rozbiórka: załoga jak dotąd, koloniści dołączają do kolonii doku (585 / Q4), `vessel:removed{dismantled}`, 🗑 zostaje
//   C6  utrata kolonii (przejęcie): koloniści zostają z kolonią (Q4), `vessel:removed{colony_lost}`
//   C7  `consumeShip` — `vessel:removed{consumed}`
//   C8  KONTROLA — strata w walce: `vessel:wrecked`, załoga ginie, `transport_lost`; bez `vessel:removed`/`vessel:docked`
//   C9  GRANICA 583 — katastrofa kolonizacji nadal emituje `vessel:docked`, bez `vessel:removed`
//   C10 naprawa 107 przy wczytaniu: sierota przy kolonii właściciela wraca na ląd (ścieżka ładowni, jej własne q/r), inna
//       ginie `transport_lost`; idempotentnie; wpięcie w `GameScene` po przywróceniu jednostek
//   C11 okablowanie `vessel:removed`: orbita (wykonanie), renderer i Dziennik (piny źródłowe), helper `VesselRemoval`, i18n
//   C12 `MissionSystem`: `unlockPops(exp.crewCost` zostaje WYŁĄCZNIE w gałęzi katastrofy kolonizacji (583)
//
// ⚠ Każdy pin wykluczający ma ŚWIADKA (konsumpcja naprawdę zaszła); kontrole są zielone po obu stronach.
// ⚠ Nowe symbole: helper przez dynamiczny `import()`, nowa metoda przez `typeof` — na kotwicy pin dostaje kolor, przebieg
//   się nie wywraca. Źródło czytane bez komentarzy i z LF (pin niezależny od checkoutu).
// ⚠ `UIManager`, `ThreeRenderer` i `GameScene` nie importują się pod node — ich okablowanie pinowane źródłowo. Dziennik
//   w scenariuszach = liczba `vessel:docked` / `vessel:removed` dla statku gracza (dwa narratory `vessel:docked` — pin C11e).

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { OrbitalSpaceSystem } from '../../systems/OrbitalSpaceSystem.js';
import { loadColonists, loadGroundUnit, loadCargo, isEnemyVessel } from '../../entities/Vessel.js';
import { foreignActionsBodyId, foreignActionsContext } from '../../utils/ForeignActions.js';

let VR = null;
try { VR = await import('../../utils/VesselRemoval.js'); } catch { VR = null; }

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const near = (a, b, eps = 1e-6) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < eps;
const r = (x) => (Number.isFinite(x) ? (Math.round(x * 1000) / 1000).toString() : String(x));
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
function quiet(fn) {
  const l = console.log, w = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = l; console.warn = w; }
}
/** Ciała subskrybentów `EventBus.on('<ev>'` — od subskrypcji do następnej (wzór `director_feed_isolation`). */
function handlerBodies(code, ev) {
  const out = [];
  for (const m of code.matchAll(new RegExp(`EventBus\\.on\\('${ev}'`, 'g'))) {
    const next = code.indexOf('EventBus.on(', m.index + 12);
    out.push(code.slice(m.index, next > m.index ? next : code.length));
  }
  return out;
}
/** Ciało metody klasy (wcięcie 2 spacji) — od nagłówka do zamykającego `  }`. */
function methodBody(code, name) {
  const i = code.search(new RegExp(`\\n  ${name}\\(`));
  if (i < 0) return '';
  const end = code.indexOf('\n  }\n', i);
  return code.slice(i, end > i ? end : code.length);
}

const CS_MODULES = ['engine_warp', 'warp_tank', 'habitat_pod', 'troop_bay_s', 'cargo_small'];
const WARSHIP    = ['engine_ion', 'armor_standard', 'weapon_kinetic'];
const RI = ColonyManager.GROUND_UNIT_POP_REINTEGRATION;
const RECORDED = ['vessel:docked', 'vessel:removed', 'vessel:destroyed', 'vessel:wrecked', 'colony:founded',
  'groundUnit:destroyed', 'fleet:disbanded', 'civ:crewLost', 'mission:failed', 'expedition:launchFailed'];

// ── Harness ──────────────────────────────────────────────────────────────────────────────
function boot() {
  const core = new GameCore();
  quiet(() => core.boot({ solo: true, quiet: true }));
  const K = window.KOSMOS;
  K.movementOrderSystem = new MovementOrderSystem(K.vesselManager);
  K.orderService = new OrderService();
  K.uiManager = {
    getSelectedVesselId: () => null, getSelectedVesselIds: () => [], getSelectedFleetId: () => null,
    setSelectedFleetId() {}, setSelectedVessel() {}, setSelectedVesselId() {},
  };
  K.techSystem.grantTechs(['rocketry', 'colonization', 'exploration', 'ion_drives', 'warp_drive', 'orbital_survey', 'ground_warfare']);
  const cm = core.colonyManager;
  cm._getBarracksLevel = () => 1;      // bramki koszar i limit jednostek — nie są przedmiotem testu
  cm._getBarracksSlots = () => 9;
  cm._getMaxGroundUnits = () => 99;
  const home = cm.getColony(K.homePlanet.id);
  home.credits = 1e9;                  // utrzymanie nie może unieruchomić niczego w trakcie pomiaru
  home.resourceSystem.receive({ Fe: 5000, Si: 2000, Cu: 2000, Ti: 2000, C: 2000, food: 2000, water: 2000 });
  const ev = [];
  for (const n of RECORDED) {
    EventBus.on(n, (d) => ev.push({ n, id: d?.vessel?.id ?? d?.vesselId ?? null, reason: d?.reason ?? null,
      unitId: d?.unitId ?? null, cause: d?.cause ?? null, colony: d?.colony?.planetId ?? null }));
  }
  return { core, K, cm, home, ev, vm: K.vesselManager, gum: K.groundUnitManager, ms: K.missionSystem };
}
const tick = (w, civY, stop = null, ts = 0.05) =>
  new Ticker(w.K.timeSystem).run(civY, { tickSize: ts, shouldStop: stop ? () => stop() : undefined });

function buildShip(w, name, hull, modules, planetId = null) {
  const pid = planetId ?? w.home.planetId;
  const before = new Set(w.vm._vessels.keys());
  EventBus.emit('fleet:shipCompleted', { planetId: pid, shipId: hull, modules });
  const v = w.vm.getVessel([...w.vm._vessels.keys()].find(k => !before.has(k)));
  v.name = name;
  v.fuel.current = v.fuel.max;
  if (v.warpFuel) v.warpFuel.current = v.warpFuel.max;
  return v;
}
function recruit(w, archetypeId) {
  const cost = { ...(ColonyManager.GROUND_UNIT_BUILD_COSTS[archetypeId] ?? {}),
                 ...(ColonyManager.GROUND_UNIT_COMMODITY_COSTS[archetypeId] ?? {}) };
  for (const [k, q] of Object.entries(cost)) w.home.resourceSystem.receive({ [k]: q });
  const before = new Set(w.gum._units.keys());
  const res = quiet(() => w.cm.startGroundUnitBuild(w.home.planetId, archetypeId));
  if (!res?.ok) throw new Error(`rekrutacja ${archetypeId}: ${JSON.stringify(res)}`);
  quiet(() => w.cm._tickGroundUnitBuilds(ColonyManager.GROUND_UNIT_BUILD_TIMES[archetypeId] ?? 5));
  const id = [...w.gum._units.keys()].find(k => !before.has(k));
  if (!id) throw new Error(`rekrutacja ${archetypeId}: jednostka nie powstała`);
  return w.gum.getUnit(id);
}
const lockSum = (c) => Object.values(c?.civSystem?._lockedPerStrata ?? {}).reduce((s, v) => s + (+v || 0), 0);
/** Populacja imperium gracza = kolonie gracza + koloniści na pokładach statków gracza. */
const totalHumans = (w) => w.cm.getPlayerColonies().reduce((s, c) => s + (c.civSystem?.humans ?? 0), 0)
  + w.vm.getAllVessels().filter(v => !isEnemyVessel(v)).reduce((s, v) => s + (v.colonists ?? 0), 0);
function orphans(w) {
  const carried = new Set();
  for (const v of w.vm.getAllVessels()) for (const id of (v.groundUnits ?? [])) carried.add(id);
  return w.gum.getAllUnits().filter(u => u.status === 'in_cargo' && !carried.has(u.id));
}
const evFor = (w, id, n, from = 0) => w.ev.slice(from).filter(e => e.n === n && e.id === id);
const died = (w, unitId) => !w.gum.getUnit(unitId)
  && w.ev.some(e => e.n === 'groundUnit:destroyed' && e.unitId === unitId && e.cause === 'transport_lost');

/** Świadki A (okręt w służbie — załoga W2) i B (garnizon na ziemi) + statek S z jednostką T, kolonistami i ładunkiem. */
function setup(w, { name = 'Kolonista', colonists = 4, troop = true, cargoFe = 50 } = {}) {
  const A = buildShip(w, 'Swiadek-A', 'hull_frigate', WARSHIP);
  w.vm.deployVessel(A.id);
  const B = recruit(w, 'garrison_unit');
  const S = buildShip(w, name, 'hull_medium', CS_MODULES);
  w.vm.deployVessel(S.id);
  quiet(() => tick(w, 1.2));           // miesiąc mobilizacji (1 civY) dla A i S
  const T = troop ? recruit(w, 'shock_infantry') : null;
  if (T) loadGroundUnit(S, T);
  const cl = colonists ? loadColonists(S, colonists, w.home.civSystem) : 0;
  if (cargoFe) loadCargo(S, 'Fe', cargoFe, w.home.resourceSystem);
  const Acrew = A.crewLocked ?? 0, Screw = S.crewLocked ?? 0;
  const tRet  = T ? T.popCost * (RI[T.archetypeId]?.rate ?? 0) : 0;
  const tDead = T ? T.popCost - tRet : 0;
  return { A, B, S, T, cl, Acrew, Screw, wit: Acrew + (B.popCost ?? 0), tRet, tDead };
}
function targetInHome(w) {
  const sys = EntityManager.get(w.home.planetId)?.systemId;
  const t = EntityManager.getByType('planet').find(b => b.systemId === sys && b.id !== w.home.planetId
    && !w.cm.getColony(b.id) && (b.planetType === 'rocky' || b.planetType === 'ice'));
  t.explored = true;
  return t;
}
/** Obserwacja przylotu kolonizacji: migawki tuż przed i tuż po `_processColonyArrival` (oryginał wołany bez zmian). */
function watchArrival(w) {
  const st = { pre: null, post: null, idx: 0 };
  const orig = w.ms._processColonyArrival.bind(w.ms);
  w.ms._processColonyArrival = (exp) => {
    st.pre = { lock: lockSum(w.home), total: totalHumans(w), tgt: w.cm.getColony(exp.targetId)?.civSystem?.humans ?? 0 };
    st.idx = w.ev.length;
    orig(exp);
    st.post = { lock: lockSum(w.home), total: totalHumans(w), tgt: w.cm.getColony(exp.targetId)?.civSystem?.humans ?? 0 };
  };
  return st;
}
function sendColony(w, s, target, st) {
  EventBus.emit('expedition:sendRequest', { type: 'colony', targetId: target.id, vesselId: s.S.id });
  quiet(() => tick(w, 400, () => st.post !== null, 0.25));
}

// ═══ C1 — normalna kolonizacja ═══════════════════════════════════════════════════════════
console.log('\nC1 — normalna kolonizacja: świadkowie przeżywają przylot (584), `vessel:removed` zamiast `vessel:docked` (582)');
{
  const w = boot();
  const s = setup(w, { name: 'Kolonista-N' });
  ok(s.A.serviceState === 'active' && s.Acrew > 0 && s.B.popCost > 0 && s.tRet > 0 && s.cl > 0 && s.Screw > 0,
    `C1-ctl świadkowie realni: załoga A ${r(s.Acrew)}, garnizon B ${r(s.B.popCost)}, zwrot T ${r(s.tRet)}, koloniści ${s.cl}, załoga S ${r(s.Screw)}`);
  const t = targetInHome(w);
  w.ms._getDisasterChance = () => 0;   // gałąź katastrofy — C9
  const st = watchArrival(w);
  sendColony(w, s, t, st);
  ok(st.post !== null && !w.vm.getVessel(s.S.id) && !!w.cm.getColony(t.id), 'C1-ctl przylot nastąpił: kolonia założona, statek zużyty');
  ok(near(st.post?.lock, s.wit + s.tRet),
    `C1a SEDNO: blokady domu po przylocie = świadkowie + zwrot T (${r(st.post?.lock)} vs ${r(s.wit + s.tRet)}; przed ${r(st.pre?.lock)})`);
  ok(w.vm.getVessel(s.A.id)?.serviceState === 'active' && near(w.vm.getVessel(s.A.id)?.crewLocked, s.Acrew),
    'C1b KONTROLA: okręt-świadek dalej w służbie, z załogą w księdze statku');
  ok(near(st.post?.tgt, s.cl), `C1c KONTROLA: koloniści = ludność startowa nowej kolonii (${r(st.post?.tgt)} vs ${s.cl})`);
  ok(near(st.post?.total, (st.pre?.total ?? NaN) - s.tDead),
    `C1d KONTROLA: populacja imperium zachowana poza poległą częścią jednostki z ładowni (${r(st.pre?.total)} → ${r(st.post?.total)})`);
  ok(evFor(w, s.S.id, 'vessel:docked', st.idx).length === 0, 'C1e SEDNO 582: zużycie statku NIE emituje `vessel:docked` (zero fałszywych „wylądował” / „wrócił do bazy”)');
  const rm = evFor(w, s.S.id, 'vessel:removed', st.idx);
  ok(rm.length === 1 && rm[0].reason === 'colonized', `C1f \`vessel:removed\` raz, powód \`colonized\` (${JSON.stringify(rm.map(e => e.reason))})`);
  ok(w.ev.slice(st.idx).some(e => e.n === 'colony:founded' && e.colony === t.id), 'C1g KONTROLA: `colony:founded` (linia 🏙) zostaje');
  ok(died(w, s.T.id), 'C1h KONTROLA (Q3 — rezerwa): jednostka z ładowni ginie `transport_lost`, jak dotąd');
  quiet(() => tick(w, 2.5));
  ok(near(lockSum(w.home), s.wit), `C1i po zwłoce zwrotu: blokady domu = świadkowie (${r(lockSum(w.home))} vs ${r(s.wit)})`);
}

// ═══ C2 — upgrade placówki ═══════════════════════════════════════════════════════════════
console.log('\nC2 — upgrade placówki: świadkowie przeżywają (584), `vessel:removed{outpost_upgraded}`');
{
  const w = boot();
  const s = setup(w, { name: 'Kolonista-U' });
  const t = targetInHome(w);
  quiet(() => w.cm.createOutpost(t.id, { Fe: 10 }, w.K.timeSystem.gameTime));
  w.ms._getDisasterChance = () => 0;
  const st = watchArrival(w);
  sendColony(w, s, t, st);
  ok(st.post !== null && w.cm.getColony(t.id)?.isOutpost === false && !w.vm.getVessel(s.S.id), 'C2-ctl placówka podniesiona do kolonii, statek zużyty');
  ok(near(st.post?.lock, s.wit + s.tRet), `C2a SEDNO: blokady domu = świadkowie + zwrot T (${r(st.post?.lock)} vs ${r(s.wit + s.tRet)})`);
  const rm = evFor(w, s.S.id, 'vessel:removed', st.idx);
  ok(rm.length === 1 && rm[0].reason === 'outpost_upgraded', `C2b \`vessel:removed\` raz, powód \`outpost_upgraded\` (${JSON.stringify(rm.map(e => e.reason))})`);
  ok(evFor(w, s.S.id, 'vessel:docked', st.idx).length === 0, 'C2c SEDNO 582: bez `vessel:docked`');
  ok(near(st.post?.tgt, s.cl), `C2d KONTROLA: ludność startowa = koloniści, bez podwójnego liczenia (${r(st.post?.tgt)} vs ${s.cl})`);
}

// ═══ C3 — migracja (statek przeżywa) ═══════════════════════════════════════════════════════
console.log('\nC3 — migracja do pełnej kolonii: blokady domu bez zmian (584), prawdziwy dok emituje `vessel:docked`');
{
  const w = boot();
  const s = setup(w, { name: 'Kolonista-M' });
  const t = targetInHome(w);
  quiet(() => EventBus.emit('expedition:colonyFounded', { planetId: t.id, startResources: { food: 200, water: 200 }, startPop: 8, resourceMult: 1, autoSpaceport: true }));
  w.ms._getDisasterChance = () => 0;
  const st = watchArrival(w);
  sendColony(w, s, t, st);
  const S = w.vm.getVessel(s.S.id);
  ok(st.post !== null && S?.position?.state === 'docked' && S?.position?.dockedAt === t.id, 'C3-ctl statek przeżył i zadokował w kolonii celu');
  ok(near(st.post?.lock, st.pre?.lock), `C3a SEDNO: blokady domu bez zmian — świadkowie, załoga żywego statku, ładownia (${r(st.pre?.lock)} → ${r(st.post?.lock)})`);
  ok(evFor(w, s.S.id, 'vessel:docked', st.idx).length === 1, 'C3b KONTROLA: prawdziwy dok emituje `vessel:docked`, jak dotąd');
  ok(evFor(w, s.S.id, 'vessel:removed', st.idx).length === 0, 'C3c KONTROLA: migracja nie jest usunięciem — bez `vessel:removed`');
  ok(near((st.post?.tgt ?? NaN) - (st.pre?.tgt ?? NaN), s.cl), `C3d KONTROLA: koloniści dostarczeni (+${r((st.post?.tgt ?? NaN) - (st.pre?.tgt ?? NaN))})`);
}

// ═══ C4 — kolonizacja obca po skoku warp ═══════════════════════════════════════════════════
console.log('\nC4 — kolonizacja obca po skoku warp (stan B): 102 · 107 · 582');
{
  const w = boot();
  const s = setup(w, { name: 'Kolonista-F' });
  const sysHome = w.K.galaxyData.systems.find(x => x.id === 'sys_home');
  const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
  const sysB = w.K.galaxyData.systems.filter(x => x.id !== 'sys_home').map(x => ({ x, d: d3(x, sysHome) }))
    .filter(o => o.d <= (GAME_CONFIG.WARP_MAX_JUMP_LY ?? 10)).sort((a, b) => a.d - b.d)[0]?.x?.id;
  w.K.orderService.issueWarp(s.S.id, sysB);
  quiet(() => tick(w, 400, () => s.S.systemId === sysB && s.S.mission?.phase === 'in_system', 0.25));
  const body = EntityManager.getByType('planet')
    .filter(b => b.systemId === sysB && !w.cm.getColony(b.id) && (b.planetType === 'rocky' || b.planetType === 'ice'))
    .sort((a, b) => Math.hypot(a.x - s.S.position.x, a.y - s.S.position.y) - Math.hypot(b.x - s.S.position.x, b.y - s.S.position.y))[0];
  w.K.orderService.issueMove(s.S.id, { type: 'moveToPoint', targetBodyId: body.id, targetPoint: { x: body.x, y: body.y } });
  quiet(() => tick(w, 600, () => s.S.position?.dockedAt === body.id && !s.S.mission && !s.S.movementOrder, 0.25));
  body.explored = true;
  ok(foreignActionsBodyId(s.S, foreignActionsContext(w.K)) === body.id && s.S.status === 'idle',
    `C4-ctl stan B po skoku (${sysB}): akcje obce przy ${body.id}`);
  const pre = { lock: lockSum(w.home), total: totalHumans(w) };
  const idx = w.ev.length;
  quiet(() => EventBus.emit('expedition:foreignColonize', { vesselId: s.S.id, targetId: body.id }));
  const post = { lock: lockSum(w.home), total: totalHumans(w), tgt: w.cm.getColony(body.id)?.civSystem?.humans };
  ok(!!w.cm.getColony(body.id) && !w.vm.getVessel(s.S.id), 'C4-ctl kolonia założona, statek zużyty');
  ok(near(post.lock, s.wit + s.tRet),
    `C4a SEDNO 102: załoga statku zwolniona, blokady domu = świadkowie + zwrot T (${r(pre.lock)} → ${r(post.lock)}; oczekiwane ${r(s.wit + s.tRet)})`);
  ok(orphans(w).length === 0, `C4b SEDNO 107: zero jednostek „w ładowni” bez statku (${orphans(w).map(u => u.id).join(',') || '—'})`);
  ok(died(w, s.T.id), 'C4c jednostka z ładowni rozliczona jak w ścieżce normalnej — ginie `transport_lost` (Q3 — rezerwa, 586)');
  ok(!w.home.fleet.includes(s.S.id), 'C4d KONTROLA: statek wypięty z floty kolonii macierzystej');
  ok(evFor(w, s.S.id, 'vessel:docked', idx).length === 0, 'C4e SEDNO 582: bez `vessel:docked`');
  const rm = evFor(w, s.S.id, 'vessel:removed', idx);
  ok(rm.length === 1 && rm[0].reason === 'colonized', `C4f \`vessel:removed\` raz, powód \`colonized\` (${JSON.stringify(rm.map(e => e.reason))})`);
  ok(w.ev.slice(idx).some(e => e.n === 'colony:founded' && e.colony === body.id), 'C4g KONTROLA: `colony:founded` (linia 🏙) zostaje');
  ok(near(post.tgt, s.cl), `C4h KONTROLA: koloniści = ludność startowa, BEZ podwójnego liczenia (${r(post.tgt)} vs ${s.cl})`);
  ok(near(post.total, pre.total - s.tDead), `C4i populacja imperium zachowana poza poległą częścią jednostki (${r(pre.total)} → ${r(post.total)})`);
  quiet(() => tick(w, 2.5));
  ok(near(lockSum(w.home), s.wit), `C4j po zwłoce: blokady domu = świadkowie, nic nie zostaje na zawsze (${r(lockSum(w.home))} vs ${r(s.wit)})`);
}

// ═══ C5 — rozbiórka ═══════════════════════════════════════════════════════════════════════
console.log('\nC5 — rozbiórka: koloniści dołączają do kolonii doku (585 / Q4), `vessel:removed{dismantled}`');
{
  const w = boot();
  const s = setup(w, { name: 'Zlom-D' });
  w.cm._getShipyardLevel = () => 1;   // bramka stoczni — nie jest przedmiotem testu
  const pre = { total: totalHumans(w), home: w.home.civSystem.humans };
  const idx = w.ev.length;
  quiet(() => EventBus.emit('fleet:disbandRequest', { vesselId: s.S.id }));
  ok(!w.vm.getVessel(s.S.id) && s.cl > 0, `C5-ctl statek rozebrany z ${s.cl} kolonistami na pokładzie`);
  ok(near(lockSum(w.home), s.wit + s.tRet), `C5a KONTROLA (W2-4): załoga z księgi statku, świadkowie nietknięci (${r(lockSum(w.home))})`);
  ok(near(totalHumans(w), pre.total - s.tDead),
    `C5b SEDNO 585: koloniści nie znikają — populacja imperium zachowana poza poległą częścią jednostki (${r(pre.total)} → ${r(totalHumans(w))})`);
  ok(near(w.home.civSystem.humans, pre.home + s.cl - s.tDead),
    `C5c Q4: koloniści dołączają do kolonii, przy której statek stał (${r(pre.home)} → ${r(w.home.civSystem.humans)})`);
  const rm = evFor(w, s.S.id, 'vessel:removed', idx);
  ok(rm.length === 1 && rm[0].reason === 'dismantled', `C5d \`vessel:removed\` raz, powód \`dismantled\` (${JSON.stringify(rm.map(e => e.reason))})`);
  ok(evFor(w, s.S.id, 'vessel:docked', idx).length === 0, 'C5e SEDNO 582: bez `vessel:docked`');
  ok(w.ev.slice(idx).some(e => e.n === 'fleet:disbanded' && e.id === s.S.id), 'C5f KONTROLA: `fleet:disbanded` (linia 🗑) zostaje');
  ok(died(w, s.T.id), 'C5g KONTROLA (Q3 — rezerwa): jednostka z ładowni ginie `transport_lost`, jak dotąd');
}

// ═══ C6 — utrata kolonii (przejęcie) ═══════════════════════════════════════════════════════
console.log('\nC6 — przejęcie kolonii: koloniści z hangaru zostają z kolonią (Q4), `vessel:removed{colony_lost}`');
{
  const w = boot();
  const t = targetInHome(w);
  quiet(() => EventBus.emit('expedition:colonyFounded', { planetId: t.id, startResources: { food: 200, water: 200 }, startPop: 8, resourceMult: 1, autoSpaceport: true }));
  const c2 = w.cm.getColony(t.id);
  const X = buildShip(w, 'Hangar-X', 'hull_medium', CS_MODULES, t.id);
  const cl = loadColonists(X, 4, c2.civSystem);
  ok(cl > 0 && X.position.state === 'docked' && X.position.dockedAt === t.id, `C6-ctl statek w hangarze kolonii ${t.id}, ${cl} kolonistów na pokładzie`);
  const h0 = c2.civSystem.humans;
  const idx = w.ev.length;
  quiet(() => w.cm.transferColony(t.id, 'emp_test', 'invasion'));
  ok(!w.vm.getVessel(X.id) && c2.ownerEmpireId === 'emp_test', 'C6-ctl kolonia przejęta, statek z hangaru stracony');
  ok(near(c2.civSystem.humans, h0 + cl), `C6a SEDNO Q4: koloniści zostają z kolonią, nie znikają (${r(h0)} → ${r(c2.civSystem.humans)})`);
  const rm = evFor(w, X.id, 'vessel:removed', idx);
  ok(rm.length === 1 && rm[0].reason === 'colony_lost', `C6b \`vessel:removed\` raz, powód \`colony_lost\` (${JSON.stringify(rm.map(e => e.reason))})`);
  ok(evFor(w, X.id, 'vessel:docked', idx).length === 0, 'C6c SEDNO 582: bez `vessel:docked`');
}

// ═══ C7 — consumeShip ═════════════════════════════════════════════════════════════════════
console.log('\nC7 — `consumeShip`: `vessel:removed{consumed}`');
{
  const w = boot();
  const V = buildShip(w, 'Zuzywany', 'hull_medium', CS_MODULES);
  const idx = w.ev.length;
  quiet(() => w.cm.consumeShip(w.home.planetId, V.id));
  ok(!w.vm.getVessel(V.id), 'C7-ctl statek zużyty');
  const rm = evFor(w, V.id, 'vessel:removed', idx);
  ok(rm.length === 1 && rm[0].reason === 'consumed', `C7a \`vessel:removed\` raz, powód \`consumed\` (${JSON.stringify(rm.map(e => e.reason))})`);
  ok(evFor(w, V.id, 'vessel:docked', idx).length === 0, 'C7b SEDNO 582: bez `vessel:docked`');
}

// ═══ C8 — KONTROLA: strata w walce ═════════════════════════════════════════════════════════
console.log('\nC8 — KONTROLA: strata w walce bez zmian (`vessel:wrecked`, załoga ginie, `transport_lost`)');
{
  const w = boot();
  const s = setup(w, { name: 'Wrak-C', colonists: 0, cargoFe: 0 });
  const idx = w.ev.length;
  quiet(() => new EnemyAttackHandler()._turnIntoWreck(s.S, null, w.K.timeSystem.gameTime));
  ok(evFor(w, s.S.id, 'vessel:wrecked', idx).length === 1 && !!w.vm.getVessel(s.S.id)?.isWreck, 'C8a KONTROLA: strata w walce = wrak (`vessel:wrecked`)');
  ok(evFor(w, s.S.id, 'civ:crewLost', idx).length === 1 && near(lockSum(w.home), s.wit + s.tRet),
    `C8b KONTROLA: załoga GINIE (\`civ:crewLost\`), blokady domu = świadkowie + zwrot T (${r(lockSum(w.home))})`);
  ok(died(w, s.T.id), 'C8c KONTROLA: jednostka z ładowni ginie `transport_lost`');
  ok(evFor(w, s.S.id, 'vessel:removed', idx).length === 0 && evFor(w, s.S.id, 'vessel:docked', idx).length === 0,
    'C8d KONTROLA: strata w walce nie emituje `vessel:removed` ani `vessel:docked`');
  w.vm.getVessel(s.S.id).wreckedAt = w.K.timeSystem.gameTime - 100;
  const idx2 = w.ev.length;
  quiet(() => w.vm._tickWreckCleanup());
  ok(!w.vm.getVessel(s.S.id) && evFor(w, s.S.id, 'vessel:destroyed', idx2).length === 1 && evFor(w, s.S.id, 'vessel:removed', idx2).length === 0,
    'C8e KONTROLA: sprzątanie wraku — `vessel:destroyed` (bojowe), bez `vessel:removed`');
}

// ═══ C9 — GRANICA 583: katastrofa ═══════════════════════════════════════════════════════════
console.log('\nC9 — GRANICA 583: katastrofa kolonizacji poza zakresem (emituje to, co dotąd)');
{
  const w = boot();
  const s = setup(w, { name: 'Pech-K', troop: false, cargoFe: 0 });
  const t = targetInHome(w);
  w.ms._getDisasterChance = () => 100;
  const st = watchArrival(w);
  sendColony(w, s, t, st);
  ok(st.post !== null && !w.vm.getVessel(s.S.id) && !w.cm.getColony(t.id), 'C9-ctl katastrofa: statek stracony, kolonii brak');
  ok(evFor(w, s.S.id, 'vessel:docked', st.idx).length === 1, 'C9a GRANICA 583: katastrofa emituje `vessel:docked`, jak dotąd');
  ok(evFor(w, s.S.id, 'vessel:removed', st.idx).length === 0, 'C9b GRANICA 583: bez `vessel:removed`');
}

// ═══ C10 — naprawa 107 przy wczytaniu ═══════════════════════════════════════════════════════
console.log('\nC10 — naprawa 107 przy wczytaniu: sierota przy kolonii właściciela wraca na ląd, inna ginie `transport_lost`');
{
  const w = boot();
  const X = buildShip(w, 'Nosnik-1', 'hull_medium', CS_MODULES);
  const Y = buildShip(w, 'Nosnik-2', 'hull_medium', CS_MODULES);
  const Z = buildShip(w, 'Nosnik-3', 'hull_medium', CS_MODULES);
  const T1 = recruit(w, 'shock_infantry'), T2 = recruit(w, 'shock_infantry'), T3 = recruit(w, 'shock_infantry');
  loadGroundUnit(X, T1); loadGroundUnit(Y, T2); loadGroundUnit(Z, T3);
  const q1 = T1.q, r1 = T1.r;
  const sys = EntityManager.get(w.home.planetId)?.systemId;
  const nb = ['moon', 'planet', 'planetoid'].flatMap(tp => EntityManager.getByType(tp))
    .find(b => b.systemId === sys && b.id !== w.home.planetId && !w.cm.getColony(b.id));
  T2.planetId = nb.id;                 // załadowana przy ciele bez kolonii
  // Zapis sprzed 102/107: statek usunięty surowo, jednostka została „w ładowni” bez nośnika.
  w.vm._vessels.delete(X.id); w.vm._vessels.delete(Y.id);
  const before = orphans(w).map(u => u.id).sort();
  ok(JSON.stringify(before) === JSON.stringify([T1.id, T2.id].sort()), `C10-ctl dwie sieroty (${before.join(', ')}), jednostka w żywym statku nie jest sierotą`);
  const RI_T = RI[T2.archetypeId]?.rate ?? 0;
  const t2Dead = T2.popCost * (1 - RI_T);
  const lock0 = lockSum(w.home), h0 = w.home.civSystem.humans;
  const fn = w.vm.repairCargoOrphansAfterLoad;
  const res = typeof fn === 'function' ? quiet(() => fn.call(w.vm)) : null;
  ok(res && JSON.stringify(res.disembarked) === JSON.stringify([T1.id]) && JSON.stringify(res.killed) === JSON.stringify([T2.id]),
    `C10a SEDNO: naprawa zwraca jedną wyładowaną i jedną poległą (${JSON.stringify(res)})`);
  const u1 = w.gum.getUnit(T1.id);
  ok(!!u1 && u1.status !== 'in_cargo' && u1.transportStatus == null && u1.planetId === w.home.planetId && u1.q === q1 && u1.r === r1,
    `C10b sierota przy kolonii gracza wraca na ląd ścieżką ładowni, na swoje q/r (${u1?.status}, ${u1?.planetId} ${u1?.q},${u1?.r})`);
  ok(died(w, T2.id), 'C10c sierota przy ciele bez kolonii ginie `transport_lost`');
  ok(w.gum.getUnit(T3.id)?.status === 'in_cargo' && Z.groundUnits.includes(T3.id), 'C10d KONTROLA: jednostka w żywym statku nietknięta');
  ok(orphans(w).length === 0, 'C10e po naprawie zero sierot');
  ok(near(lockSum(w.home), lock0 - t2Dead) && near(w.home.civSystem.humans, h0 - t2Dead),
    `C10f POP: wyładowana bez zmian, poległa — część nieoddana ginie, zwrot czeka (blokady ${r(lock0)} → ${r(lockSum(w.home))})`);
  const res2 = typeof fn === 'function' ? quiet(() => fn.call(w.vm)) : null;
  ok(res2 && res2.disembarked.length === 0 && res2.killed.length === 0, 'C10g idempotentnie: drugie wywołanie nic nie robi');
  const GS = src('../../scenes/GameScene.js');
  const iR = GS.indexOf('this.groundUnitManager.restore(c4x.groundUnitManager)');
  const iF = GS.indexOf('repairCargoOrphansAfterLoad', iR);
  const iArmy = GS.indexOf('c4x.armySystem', iR);
  ok(iR > 0 && iF > iR && iArmy > iF, 'C10h wpięcie: `GameScene` woła naprawę zaraz po przywróceniu jednostek, w tym samym bloku');
  ok(GS.indexOf('this.vesselManager.restore(c4x.vesselManager)') < iR && GS.indexOf('this.colonyManager.restore(c4x') < iR,
    'C10i KONTROLA kolejności: statki i kolonie przywracane PRZED jednostkami');
}

// ═══ C11 — okablowanie `vessel:removed` ═════════════════════════════════════════════════════
console.log('\nC11 — okablowanie: orbita, renderer, Dziennik, helper, i18n');
{
  boot();
  const oss = new OrbitalSpaceSystem();
  const body = window.KOSMOS.homePlanet.id;
  oss.assignOrbit(body, 'v_probe_removed', 'default');
  oss.assignOrbit(body, 'v_probe_docked', 'default');
  ok(oss.hasOrbit('v_probe_removed') && oss.hasOrbit('v_probe_docked'), 'C11-ctl orbity przydzielone');
  EventBus.emit('vessel:removed', { vesselId: 'v_probe_removed', vessel: { id: 'v_probe_removed' }, reason: 'consumed' });
  ok(!oss.hasOrbit('v_probe_removed'), 'C11a `vessel:removed` zwalnia orbitę (`OrbitalSpaceSystem`)');
  EventBus.emit('vessel:docked', { vessel: { id: 'v_probe_docked' } });
  ok(!oss.hasOrbit('v_probe_docked'), 'C11b KONTROLA: prawdziwy dok dalej zwalnia orbitę');

  const TR = src('../../renderer/ThreeRenderer.js');
  const trRm = handlerBodies(TR, 'vessel:removed').join('\n');
  ok(/_removeVesselSprite\(/.test(trRm) && /_focusVesselId/.test(trRm), 'C11c renderer: `vessel:removed` usuwa sprite i zdejmuje śledzenie kamery');
  ok(handlerBodies(TR, 'vessel:docked').length === 2, 'C11d KONTROLA: renderer zachowuje dwóch słuchaczy prawdziwego doku');

  const UI = src('../../scenes/UIManager.js');
  const dk = handlerBodies(UI, 'vessel:docked');
  ok(dk.length === 2 && dk.some(b => /log\.el\.vesselReturned/.test(b)) && dk.some(b => /log\.vesselDocked/.test(b)),
    'C11e KONTROLA: dwóch narratorów `vessel:docked` („wrócił do bazy” / „wylądował”) — scenariusze liczą `vessel:docked` zamiast nich');
  const rm = handlerBodies(UI, 'vessel:removed');
  ok(rm.length === 1 && /isEnemyVessel\(vessel\)/.test(rm[0]) && /removalJournalKey\(/.test(rm[0]),
    'C11f Dziennik: jeden narrator `vessel:removed`, z bramką właściciela, kluczowany powodem');

  const VM = src('../../systems/VesselManager.js');
  const dv = methodBody(VM, 'destroyVessel');
  ok(/emit\('vessel:removed'/.test(dv), 'C11g `destroyVessel` emituje `vessel:removed`');
  const fc = methodBody(VM, '_startForeignColonize');
  ok(fc.length > 0 && !/_vessels\.delete\(/.test(fc) && /this\.destroyVessel\(/.test(fc), 'C11h kolonizacja obca bez surowego `delete` — przez `destroyVessel`');
  ok(/vessel:destroyed/.test(methodBody(VM, '_tickWreckCleanup')) && !/vessel:destroyed/.test(dv),
    'C11i KONTROLA: `vessel:destroyed` zostaje bojowe (sprzątanie wraku), `destroyVessel` go nie emituje');

  const reasons = VR ? JSON.stringify([...VR.VESSEL_REMOVAL_REASONS]) : null;
  ok(reasons === JSON.stringify(['colonized', 'outpost_upgraded', 'dismantled', 'colony_lost', 'consumed']), `C11j helper: pięć powodów (${reasons})`);
  ok(!!VR && VR.removalJournalKey('colony_lost') === 'log.vesselLostWithColony'
    && ['colonized', 'outpost_upgraded', 'dismantled', 'consumed'].every(x => VR.removalJournalKey(x) === null),
    'C11k helper: własna linia tylko dla `colony_lost` — reszta ma swoją (🏙 / 🗑 / meldunek zdarzenia)');
  const keyRe = /'log\.vesselLostWithColony':\s*'([^']*)'/;
  const en = readFileSync(new URL('../../i18n/en.js', import.meta.url), 'utf8').match(keyRe)?.[1];
  const pl = readFileSync(new URL('../../i18n/pl.js', import.meta.url), 'utf8').match(keyRe)?.[1];
  ok(!!en && !!pl && /\{0\}/.test(en) && /\{1\}/.test(en) && /\{0\}/.test(pl) && /\{1\}/.test(pl),
    `C11l i18n PL+EN (jeden klucz): „${en ?? '—'}” / „${pl ?? '—'}”`);
}

// ═══ C12 — MissionSystem ═════════════════════════════════════════════════════════════════
console.log('\nC12 — `MissionSystem`: przestarzałe zdjęcie blokad tylko w gałęzi katastrofy');
{
  const MS = src('../../systems/MissionSystem.js');
  const n = (MS.match(/unlockPops\(exp\.crewCost/g) ?? []).length;
  ok(n === 1, `C12a SEDNO 584: \`unlockPops(exp.crewCost\` występuje raz (na kotwicy 4: migracja, upgrade, sukces, katastrofa) — jest ${n}`);
  ok(/unlockPops\(exp\.crewCost, exp\.crewStrata\);\s*\n\s*originColDisaster\.civSystem\.removePop\(null, exp\.crewCost\)/.test(MS),
    'C12b GRANICA 583: zostaje w gałęzi katastrofy kolonizacji (razem z `removePop`)');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
