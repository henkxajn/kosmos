// 239 / C1 — keeper ZAKRESU UKŁADU dla tras kurierskich AI (`NT_LINK_PLAN.md`).
//
// PO CO: `EmpireLogisticsSystem._runDispatcher` dobierał placówki po WŁAŚCICIELU i ZŁOŻU,
// bez terminu układu — a kurier jest Z PROJEKTU in-system (S3.2 S1). Trasa do placówki
// w innym układzie jest POCHŁANIACZEM KURIERÓW: `dispatchOnMission` przepuszcza cel (AI
// zwolnione z `_missionTargetOutOfSystem`, D-SS5b), guard przylotu W3-4b słusznie nie dokuje
// do obcego ciała (`dockedAt=null`), po czym ŻADNA gałąź `_advanceRouteCourier` już nie pasuje.
// ZMIERZONE A/B: trasa w układzie `delivered 18`, Nt stolicy 0→234; trasa międzyukładowa
// 15 gy bez ruchu. ŻYWO (GATE-S4-fresh-gy60, L5): 12 kadłubów spóźnionych o 36-44 gy.
//
//   T1  PIN DEFEKTU (flaga OFF = zachowanie sprzed): trasa do placówki spoza układu POWSTAJE
//   T2  NAPRAWA (flaga ON): nie powstaje, a odmowa jest SŁYSZALNA (powód + oba systemId)
//   T3  ⚠ KONTROLA NIEJAŁOWOŚCI — trasa W UKŁADZIE nadal powstaje **I NADAL DOWOZI**
//       (pełny cykl: dispatch → załadunek → powrót → zasób w stolicy ROŚNIE).
//       Bez tego T2 „przechodzi" przez wyciszenie wszystkiego — czyli przez gorszy defekt.
//   T4  trasa nieosiągalna ZE STAREGO ZAPISU jest rozwiązywana, kurierzy → `reserve`
//   T5  KONTROLA PINU: przy fladze OFF ta sama trasa NIE jest ruszana (OFF = dziś co do bitu)
//   T6  pin źródłowy: oba powody są w `DebugLog.TRACKED_EVENTS` (reguła W3), z kontrolą pinu
//   T7  semantyka NIEWIEDZY, dwie RÓŻNE gałęzie: `null` (brak encji / tranzyt warp) = fail-open,
//       `undefined` (brak stempla) = `sys_home` — to NIE to samo i pierwsza wersja tego pinu
//       myliła je ze sobą, żądając od kodu zachowania, którego `SystemScope` nie obiecuje

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  return core;
}

function capitalOf(core, empId) {
  return (core.empireRegistry.getColoniesByEmpire(empId) ?? [])
    .find(c => c && !c.isOutpost && c.resourceSystem);
}

/** Placówka-atrapa: ENCJA (z `systemId` + złożem Nt) + wpis kolonii + rejestracja w imperium. */
function addOutpost(core, empId, { id, systemId, nt = 5000, x = 120, y = 0 }) {
  const ent = { id, name: id, type: 'planet', planetType: 'rocky', radius: 1, mass: 1, x, y,
    deposits: [{ resourceId: 'Nt', richness: 0.3, totalAmount: 1e5, remaining: 1e5 }] };
  if (systemId !== undefined) ent.systemId = systemId;      // T7 zasiewa BEZ stempla
  EntityManager.add(ent);
  const inv = new Map([['Nt', nt]]);
  const colony = {
    planetId: id, name: id, isOutpost: true, ownerEmpireId: empId, systemId,
    resourceSystem: {
      // ⚠ `inventory` JEST WYMAGANE: `Vessel._getAvailable` czyta `resSys.inventory`
      //   (Map lub obiekt) albo `resSys.get(id)` — `getAmount` NIE jest przez nie widziane.
      //   Atrapa musi lustrzeć akcesor, którego używa KOD PRODUKCYJNY, nie ten, który brzmi
      //   naturalnie (bez tego T3 mierzyłby pustą placówkę i „przechodził" jałowo).
      inventory: inv,
      getAmount: (r) => inv.get(r) ?? 0,
      spend:   (c) => { for (const [k, v] of Object.entries(c)) inv.set(k, (inv.get(k) ?? 0) - v); return true; },
      receive: (g) => { for (const [k, v] of Object.entries(g)) inv.set(k, (inv.get(k) ?? 0) + v); },
    },
  };
  core.colonyManager._colonies.set(id, colony);
  core.empireRegistry.addColony(empId, id);
  return colony;
}

/** Dwie placówki: jedna w układzie stolicy, druga poza nim. */
function fixture(core) {
  const empId = core.empireRegistry.listAll()[0].id;
  const cap = capitalOf(core, empId);
  const capSys = EntityManager.get(cap.planetId)?.systemId;
  const near = addOutpost(core, empId, { id: 'probe_near', systemId: capSys });
  const far  = addOutpost(core, empId, { id: 'probe_far',  systemId: 'sys_far_away' });
  return { empId, empire: core.empireRegistry.get(empId), cap, capSys, near, far };
}

const capture = (names) => {
  const seen = [];
  const offs = names.map(n => { const h = (p) => seen.push({ ev: n, ...p }); EventBus.on(n, h); return () => EventBus.off(n, h); });
  return { seen, stop: () => offs.forEach(f => f()) };
};

const routeIds = (empire) => (empire.logistics?.routes ?? []).map(r => r.outpostId);

// ── T1 — PIN DEFEKTU (flaga OFF) ─────────────────────────────────────────────
console.log('T1 — flaga OFF: trasa do placówki SPOZA układu POWSTAJE (zachowanie sprzed C1)');
{
  const core = boot();
  const { empire } = fixture(core);
  GAME_CONFIG.FEATURES.aiCourierRouteScope = false;
  core.empireLogisticsSystem._runDispatcher(empire);
  const ids = routeIds(empire);
  assert(ids.includes('probe_near'), 'T1: trasa do placówki W UKŁADZIE istnieje');
  assert(ids.includes('probe_far'),
    `T1: trasa do placówki SPOZA układu też istnieje — to jest defekt 239 (${ids.join(',')})`);
  GAME_CONFIG.FEATURES.aiCourierRouteScope = true;
}

// ── T2 — NAPRAWA + słyszalna odmowa ──────────────────────────────────────────
console.log('T2 — flaga ON: trasa spoza układu NIE powstaje, a odmowa niesie POWÓD');
{
  const core = boot();
  const { empire, capSys } = fixture(core);
  const cap = capture(['logistics:routeUnreachable']);
  core.empireLogisticsSystem._runDispatcher(empire);
  cap.stop();
  const ids = routeIds(empire);
  assert(ids.includes('probe_near'), 'T2: trasa W UKŁADZIE nadal powstaje');
  assert(!ids.includes('probe_far'), `T2: trasy SPOZA układu NIE MA (${ids.join(',')})`);
  const ev = cap.seen.find(e => e.outpostId === 'probe_far');
  assert(!!ev, 'T2: wyemitowano `logistics:routeUnreachable` dla placówki spoza układu');
  assert(ev?.reason === 'outpost_other_system', `T2: powód = outpost_other_system (${ev?.reason})`);
  assert(ev?.outSystemId === 'sys_far_away' && ev?.capitalSystemId === capSys,
    `T2: odmowa niesie OBA układy (${ev?.outSystemId} vs ${ev?.capitalSystemId})`);
}

// ── T3 — KONTROLA NIEJAŁOWOŚCI: trasa w układzie NADAL DOWOZI ────────────────
console.log('T3 — ⚠ KONTROLA: trasa w układzie nie tylko istnieje, ale DOWOZI (pełny cykl)');
{
  const core = boot();
  const { empire, cap } = fixture(core);
  const els = core.empireLogisticsSystem;
  els._runDispatcher(empire);
  const route = (empire.logistics.routes ?? []).find(r => r.outpostId === 'probe_near');
  assert(!!route, 'T3: trasa w układzie utworzona');

  const vm = core.vesselManager;
  const v = vm.createAndRegister('hull_small', cap.planetId, { modules: ['engine_chemical', 'cargo_small'] });
  v.serviceState = 'active'; v.status = 'idle';
  v.position.state = 'docked'; v.position.dockedAt = cap.planetId;
  route.courierIds.push(v.id);

  const ntBefore = cap.resourceSystem.getAmount('Nt');

  // 1) IDLE@stolica → dispatch
  els._advanceRouteCourier(empire, route, v.id, cap);
  assert(v.mission?.targetId === 'probe_near', `T3: kurier wysłany na trasę (${v.mission?.targetId})`);

  // 2) przylot W UKŁADZIE — dokładnie tak, jak robi `_updatePositions` (dockedAt = cel)
  v.position.state = 'orbiting'; v.position.dockedAt = 'probe_near';
  v.status = 'on_mission'; v.mission.phase = 'orbiting_body';
  els._advanceRouteCourier(empire, route, v.id, cap);
  assert((v.cargoUsed ?? 0) > 0, `T3: kurier ZAŁADOWAŁ towar w placówce (${v.cargoUsed})`);
  assert(v.mission?.phase === 'returning', `T3: ruszył w drogę powrotną (${v.mission?.phase})`);

  // 3) powrót dobiega końca
  v.mission.returnYear = (window.KOSMOS?.timeSystem?.gameTime ?? 0) - 1;
  els._advanceRouteCourier(empire, route, v.id, cap);
  const ntAfter = cap.resourceSystem.getAmount('Nt');
  assert(ntAfter > ntBefore, `T3: ZASÓB STOLICY WZRÓSŁ ${ntBefore} → ${ntAfter} (dostawa realna)`);
  assert((empire.logistics.stats?.delivered ?? 0) > 0,
    `T3: licznik dostaw ruszył (${empire.logistics.stats?.delivered})`);
}

// ── T4 — prune trasy ze STAREGO zapisu ───────────────────────────────────────
console.log('T4 — trasa nieosiągalna z zapisu jest rozwiązywana, kurierzy → reserve');
{
  const core = boot();
  const { empire, cap } = fixture(core);
  const els = core.empireLogisticsSystem;
  const logi = els._ensureLogistics(empire);
  const vm = core.vesselManager;
  const v1 = vm.createAndRegister('hull_small', cap.planetId, { modules: ['engine_chemical', 'cargo_small'] });
  const v2 = vm.createAndRegister('hull_small', cap.planetId, { modules: ['engine_chemical', 'cargo_small'] });
  logi.routes.push({ routeId: 'logi_old_far', motherId: cap.planetId, outpostId: 'probe_far', courierIds: [v1.id, v2.id] });

  const capt = capture(['logistics:routeAborted']);
  els._runDispatcher(empire);
  capt.stop();

  assert(!routeIds(empire).includes('probe_far'), 'T4: martwa trasa rozwiązana');
  // ⚠ Kadłub NIE MUSI zostać w rezerwie: dyspozytor w TYM SAMYM przebiegu dociąga rezerwę do
  //   niedoobsadzonej trasy osiągalnej (`while (courierIds.length < couriersPerRoute …)`).
  //   Inwariantem jest więc „NIE ZGINĄŁ", a nie „leży w rezerwie" — pierwsza wersja tego pinu
  //   opisywała stan pośredni, którego produkcja nie ma obowiązku utrzymać.
  const parked = (id) => logi.reserve.includes(id)
    || (logi.routes ?? []).some(r => (r.courierIds ?? []).includes(id));
  assert(parked(v1.id) && parked(v2.id),
    `T4: OBA kadłuby odzyskane — rezerwa lub trasa osiągalna (rezerwa ${logi.reserve.length})`);
  assert(!(logi.routes ?? []).some(r => r.routeId === 'logi_old_far'),
    'T4: kadłuby NIE są już przypisane do martwej trasy');
  const ev = capt.seen.find(e => e.routeId === 'logi_old_far');
  assert(ev?.reason === 'outpost_other_system', `T4: powód rozwiązania w audycie (${ev?.reason})`);
}

// ── T5 — KONTROLA PINU: OFF nie rusza niczego ────────────────────────────────
console.log('T5 — ⚠ KONTROLA PINU: przy fladze OFF ta sama trasa ZOSTAJE (OFF = dziś co do bitu)');
{
  const core = boot();
  const { empire, cap } = fixture(core);
  const els = core.empireLogisticsSystem;
  const logi = els._ensureLogistics(empire);
  logi.routes.push({ routeId: 'logi_old_far', motherId: cap.planetId, outpostId: 'probe_far', courierIds: [] });

  GAME_CONFIG.FEATURES.aiCourierRouteScope = false;
  els._runDispatcher(empire);
  GAME_CONFIG.FEATURES.aiCourierRouteScope = true;

  assert(routeIds(empire).includes('probe_far'), 'T5: przy OFF martwa trasa NIE jest ruszana');
  assert(logi.reserve.length === 0, `T5: …i nikt nie trafia do rezerwy (${logi.reserve.length})`);
}

// ── T6 — pin źródłowy: powody w TRACKED_EVENTS ───────────────────────────────
console.log('T6 — pin źródłowy: oba powody w DebugLog.TRACKED_EVENTS (reguła W3)');
{
  const src = readFileSync(new URL('../../core/DebugLog.js', import.meta.url), 'utf8')
    .replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');   // pin czyta kod BEZ komentarzy
  assert(src.includes("'logistics:routeUnreachable'"), 'T6: `logistics:routeUnreachable` śledzony');
  assert(src.includes("'logistics:routeAborted'"),     'T6: `logistics:routeAborted` śledzony');
  assert(!src.includes("'logistics:zdarzenieKtoregoNieMa'"),
    'T6: ⚠ kontrola pinu — nieistniejąca nazwa NIE jest „znajdowana"');
}

// ── T7 — dwie RÓŻNE gałęzie niewiedzy (pierwsza wersja tego pinu myliła je ze sobą) ──
console.log('T7 — semantyka niewiedzy: `null` = fail-open, `undefined` = sys_home (NIE to samo)');
{
  // T7a — encji NIE MA w ogóle ⇒ `systemIdOf` zwraca `null` ⇒ prawdziwy fail-open.
  const core = boot();
  const empId = core.empireRegistry.listAll()[0].id;
  const empire = core.empireRegistry.get(empId);
  const inv = new Map([['Nt', 1000]]);
  core.colonyManager._colonies.set('probe_noentity', {
    planetId: 'probe_noentity', name: 'probe_noentity', isOutpost: true, ownerEmpireId: empId,
    resourceSystem: { inventory: inv, getAmount: (r) => inv.get(r) ?? 0, spend: () => true, receive: () => {} },
  });
  core.empireRegistry.addColony(empId, 'probe_noentity');
  core.empireLogisticsSystem._runDispatcher(empire);
  // Bez encji nie ma też złoża, więc trasa i tak nie powstanie — pinujemy WYŁĄCZNIE to, że
  // przyczyną nie jest odmowa układowa (brak powodu `outpost_other_system` dla tego id).
  const capt = capture(['logistics:routeUnreachable']);
  core.empireLogisticsSystem._unreachableNoted.clear();
  core.empireLogisticsSystem._runDispatcher(empire);
  capt.stop();
  assert(!capt.seen.some(e => e.outpostId === 'probe_noentity'),
    'T7a: brak encji ⇒ `null` ⇒ NIE odrzucamy z powodu układu (fail-open, argument D-SS2)');
}
{
  // T7b — encja BEZ stempla ⇒ `systemIdOf` mapuje `undefined` → `sys_home` (stary zapis),
  //   więc dla stolicy spoza `sys_home` placówka jest ODRZUCONA. I tak ma być: guard przylotu
  //   (W3-4b) użyje DOKŁADNIE tego samego porównania i tak czy owak by nie zadokował.
  const core = boot();
  const empId = core.empireRegistry.listAll()[0].id;
  const empire = core.empireRegistry.get(empId);
  const cap = capitalOf(core, empId);
  const capSys = EntityManager.get(cap.planetId)?.systemId;
  addOutpost(core, empId, { id: 'probe_nostamp', systemId: undefined });
  const capt = capture(['logistics:routeUnreachable']);
  core.empireLogisticsSystem._runDispatcher(empire);
  capt.stop();
  const ev = capt.seen.find(e => e.outpostId === 'probe_nostamp');
  assert(capSys !== 'sys_home', `T7b: kontrola pinu — stolica NIE jest w sys_home (${capSys})`);
  assert(!!ev && ev.outSystemId == null,
    'T7b: niestemplowana placówka traktowana jak `sys_home` ⇒ odrzucona, z powodem w audycie');
}

console.log(`\n${pass}/${pass + fail} OK${fail ? `, ${fail} FAIL` : ''}`);
process.exit(fail ? 1 : 0);
