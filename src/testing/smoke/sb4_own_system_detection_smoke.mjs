// sb4_own_system_detection_smoke.mjs — AI STRIKES BACK S4 (SB69, Finding 439): kolonia i obserwatorium wykrywają wrogie
// statki we WŁASNYM układzie, NIEZALEŻNIE od oglądanego; wpis dzwonka o uzbrojonym kontakcie (SB59) idzie za detekcją.
//
// Do S4 `ObservatorySystem._tickVesselDetection` kluczował skan na `activeSystemId` (kamera — rodzina 191): kolonia w układzie,
// którego gracz nie ogląda, niczego nie wykrywała, a o eskadrze odbicia gracz dowiadywał się z alarmu desantu (M6).
// Okno PIERWSZEGO WYKRYCIA (wpis Dziennika + `vessel:firstSighting` → okno z pauzą) zostaje przy oglądanym układzie — jak
// przed S4: statek wykryty poza widokiem dostaje okno, gdy gracz spojrzy na jego układ.
//
// PINY (fail-first na `40b6e54`):
//   T1  układ NIEOGLĄDANY: kolonia (1 AU, bez obserwatorium) wykrywa uzbrojonego wroga 0,6 AU od siebie ⇒ wykryty,
//       `vessel:detectionChanged` raz, wpis dzwonka `armedContact` dla TEGO układu; okna pierwszego wykrycia i wpisu
//       „niezidentyfikowany kontakt” — brak (widok gdzie indziej).
//   T2  widok na ten układ ⇒ okno pierwszego wykrycia i wpis Dziennika RAZ (następny tik); powrót i ponowne spojrzenie —
//       bez drugiego okna. KONTROLA T2-0: okno pojawia się także na kodzie sprzed S4 (semantyka okna bez zmian).
//   T3  KONTROLA (zielona po obu stronach): wróg w OGLĄDANYM układzie — wykryty i okno od razu.
//   T4  obserwatorium (poziom 3, 15 AU) w układzie nieoglądanym ⇒ wróg 10 AU od kolonii wykryty; 20 AU — nie (STRAŻNIK).
//   T5  wyjście z zasięgu w układzie nieoglądanym ⇒ `vessel:detectionChanged` (false), zbiór pusty.
//   T6  STRAŻNICY (zieloni po obu stronach — zabijają wersję „każda kolonia, każdy statek”): wróg w INNYM układzie na
//       współrzędnych kolonii — niewykryty; statek W SKOKU (`systemId` null) na tych współrzędnych — niewykryty; kolonia AI
//       nie wykrywa dla gracza; nieuzbrojony wróg wykryty, ale bez wpisu dzwonka (SB59).
//   T7  przełączenie widoku NIE zmienia zbioru wykrytych (żadnego `detectionChanged` przy samym przełączeniu).

import '../headless/env.js';               // MUSI być pierwszy
import EventBus                  from '../../core/EventBus.js';
import EntityManager             from '../../core/EntityManager.js';
import { t, setLocale }          from '../../i18n/i18n.js';
import { VesselManager }         from '../../systems/VesselManager.js';
import { ObservatorySystem }     from '../../systems/ObservatorySystem.js';
import { EventLogSystem }        from '../../systems/EventLogSystem.js';
import * as NC                   from '../../systems/NotificationCenter.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU = 110;
const NotificationCenter = NC.NotificationCenter;
setLocale('en');

/** Dwie kolonie gracza: Dom (`sys_home`) i Kolonia (`sys_024`), widok na dom; opcjonalnie kolonia AI w `sys_031`. */
function world({ obs24 = 0, aiColony = false } = {}) {
  EventBus.clear();
  EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 10 }, activeSystemId: 'sys_home' };
  EntityManager.add({ id: 'star_home', type: 'star', name: 'Sol',    systemId: 'sys_home', x: 0, y: 0 });
  EntityManager.add({ id: 'star_24',   type: 'star', name: 'Diphda', systemId: 'sys_024', x: 0, y: 0 });
  EntityManager.add({ id: 'star_31',   type: 'star', name: 'Wezen',  systemId: 'sys_031', x: 0, y: 0 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom',     systemId: 'sys_home', x: 1.0 * AU, y: 0 });
  EntityManager.add({ id: 'p_24',   type: 'planet', name: 'Kolonia', systemId: 'sys_024', x: 5.0 * AU, y: 0 });
  EntityManager.add({ id: 'p_31',   type: 'planet', name: 'Obca',    systemId: 'sys_031', x: 8.0 * AU, y: 0 });
  const mk = (planetId, name, obsLvl, extra = {}) => ({
    planetId, name, planet: EntityManager.get(planetId),
    buildingSystem: { _active: new Map(obsLvl > 0 ? [[`${planetId}_obs`, { building: { id: 'observatory' }, level: obsLvl }]] : []) },
    ...extra,
  });
  const home = mk('p_home', 'Dom', 0);
  const col24 = mk('p_24', 'Kolonia', obs24);
  const ai31 = mk('p_31', 'Obca', 3, { ownerEmpireId: 'emp_002' });
  const all = aiColony ? [home, col24, ai31] : [home, col24];
  window.KOSMOS.colonyManager = { getAllColonies: () => all, getPlayerColonies: () => [home, col24] };
  window.KOSMOS.starSystemManager = { getAllSystems: () => [] };
  const vm = new VesselManager();
  window.KOSMOS.vesselManager = vm;
  const log = new EventLogSystem();
  window.KOSMOS.eventLogSystem = log;
  const nc = new NotificationCenter();
  window.KOSMOS.notificationCenter = nc;
  const obs = new ObservatorySystem();
  window.KOSMOS.observatorySystem = obs;
  const ev = { detect: [], sight: [] };
  EventBus.on('vessel:detectionChanged', (e) => ev.detect.push({ id: e.vesselId, on: !!e.detected }));
  EventBus.on('vessel:firstSighting', (e) => ev.sight.push(e.vessel?.id ?? null));
  return { vm, nc, log, obs, ev, home, col24 };
}

function ship(vm, { sys = 'sys_024', xAU = 5.6, yAU = 0, empire = 'emp_001', armed = true, name } = {}) {
  const v = vm.createAndRegister('hull_frigate', 'p_none', { name: name ?? `v_${sys}_${xAU}`, modules: armed ? ['weapon_laser'] : [] });
  v.systemId = sys;
  v.position.x = xAU * AU; v.position.y = yAU * AU;
  v.position.state = 'orbiting'; v.position.dockedAt = null;
  v.status = 'idle'; v.mission = null;
  if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; }
  return v;
}

const bells = (nc, sys = null) => (nc.getActive?.() ?? []).filter(n => n.type === 'armedContact' && (!sys || n.payload?.systemId === sys));
const contactLog = (log) => (log.getEntries?.() ?? []).filter(e => e.text === t('log.unidentifiedContact'));
const tick = (obs) => obs._tickVesselDetection(0.01);

// ════════════════════════════════════════════════════════════════════════════════════════
header('T1 — układ NIEOGLĄDANY: kolonia wykrywa uzbrojonego wroga we własnym układzie');
{
  const { vm, nc, log, obs, ev, col24 } = world();
  const foe = ship(vm, { name: 'Rajder' });
  assert(window.KOSMOS.activeSystemId === 'sys_home' && obs.getVesselDetectionRangeAU(col24) === 1,
    'T1-0 WARUNEK SCENY: widok na `sys_home`; kolonia w `sys_024` bez obserwatorium — zasięg 1 AU, wróg 0,6 AU od niej');
  tick(obs);
  assert(obs.isVesselDetected(foe.id), 'T1a wróg w układzie nieoglądanym WYKRYTY przez kolonię tego układu');
  assert(ev.detect.filter(d => d.id === foe.id && d.on).length === 1, `T1b \`vessel:detectionChanged\` (true) dokładnie raz — jest ${ev.detect.filter(d => d.id === foe.id && d.on).length}`);
  const b = bells(nc, 'sys_024');
  assert(b.length === 1 && b[0].payload?.vesselId === foe.id && /Diphda/.test(b[0].title ?? ''),
    `T1c wpis dzwonka \`armedContact\` dla układu Diphda (sys_024) — jest ${b.length}: „${b[0]?.title ?? '-'}”`);
  assert(ev.sight.length === 0 && contactLog(log).length === 0,
    'T1d STRAŻNIK (zielony po obu stronach): okna pierwszego wykrycia i wpisu „niezidentyfikowany kontakt” brak — widok gdzie indziej');
  tick(obs);
  assert(bells(nc).length === 1 && ev.detect.length === 1, 'T1e kolejny tik — bez nowego wpisu i bez nowego zdarzenia');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T2 — okno pierwszego wykrycia przy spojrzeniu na układ (jak przed S4), raz');
{
  const { vm, log, obs, ev } = world();
  const foe = ship(vm, { name: 'Rajder' });
  tick(obs);
  window.KOSMOS.activeSystemId = 'sys_024';
  tick(obs);
  assert(ev.sight.length === 1 && ev.sight[0] === foe.id && contactLog(log).length === 1,
    `T2-0 KONTROLA (zielona po obu stronach): widok na układ wroga ⇒ okno pierwszego wykrycia i wpis Dziennika raz (okna ${ev.sight.length}, wpisy ${contactLog(log).length})`);
  window.KOSMOS.activeSystemId = 'sys_home'; tick(obs);
  window.KOSMOS.activeSystemId = 'sys_024'; tick(obs);
  assert(ev.sight.length === 1 && contactLog(log).length === 1, 'T2a powrót i ponowne spojrzenie — bez drugiego okna i wpisu');
  assert(obs.serialize().reportedSightings.includes(foe.id), 'T2b zgłoszenie w zapisie (`reportedSightings`) — wczytanie nie powtórzy okna');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T3 — KONTROLA: wróg w oglądanym układzie');
{
  const { vm, obs, ev, nc } = world();
  const foe = ship(vm, { sys: 'sys_home', xAU: 1.5, name: 'Pod domem' });
  tick(obs);
  assert(obs.isVesselDetected(foe.id) && ev.sight.length === 1 && bells(nc, 'sys_home').length === 1,
    'T3 KONTROLA (zielona po obu stronach): wróg 0,5 AU od domu w oglądanym układzie — wykryty, okno i wpis dzwonka od razu');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T4 — obserwatorium w układzie nieoglądanym');
{
  const { vm, obs, col24 } = world({ obs24: 3 });
  const near = ship(vm, { xAU: 15.0, name: 'Daleko 10' });
  const far  = ship(vm, { xAU: 25.0, name: 'Daleko 20' });
  tick(obs);
  assert(obs.getVesselDetectionRangeAU(col24) === 15, 'T4-0 WARUNEK SCENY: obserwatorium poziom 3 — zasięg 15 AU');
  assert(obs.isVesselDetected(near.id), 'T4a wróg 10 AU od kolonii (układ nieoglądany) — wykryty zasięgiem obserwatorium');
  assert(!obs.isVesselDetected(far.id), 'T4b STRAŻNIK (zielony po obu stronach): wróg 20 AU od kolonii — poza zasięgiem, niewykryty');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T5 — wyjście z zasięgu w układzie nieoglądanym');
{
  const { vm, obs, ev } = world();
  const foe = ship(vm, { name: 'Odlatujący' });
  tick(obs);
  foe.position.x = 9.0 * AU;
  tick(obs);
  assert(!obs.isVesselDetected(foe.id) && ev.detect.length === 2 && ev.detect[1].on === false,
    `T5 wróg wyszedł z zasięgu ⇒ \`vessel:detectionChanged\` (false), zbiór pusty — zdarzenia ${JSON.stringify(ev.detect.map(d => d.on))}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T6 — strażnicy: tylko własny układ, bez skoku, bez kolonii AI, dzwonek wyłącznie dla uzbrojonego');
{
  const { vm, obs, nc } = world({ aiColony: true });
  const other = ship(vm, { sys: 'sys_031', xAU: 5.2, name: 'Inny układ' });       // współrzędne kolonii z sys_024
  const warp  = ship(vm, { sys: null, xAU: 5.2, name: 'W skoku' });
  const nearAi = ship(vm, { sys: 'sys_031', xAU: 8.2, name: 'Przy kolonii AI' });
  const unarmed = ship(vm, { xAU: 5.4, armed: false, name: 'Nieuzbrojony' });
  tick(obs);
  assert(!obs.isVesselDetected(other.id), 'T6a STRAŻNIK: wróg w INNYM układzie na współrzędnych kolonii — niewykryty (para tylko w jednym układzie)');
  assert(!obs.isVesselDetected(warp.id), 'T6b STRAŻNIK: statek W SKOKU (`systemId` null) na współrzędnych kolonii — niewykryty (427)');
  assert(!obs.isVesselDetected(nearAi.id), 'T6c STRAŻNIK: kolonia AI (obserwatorium 3) nie wykrywa dla gracza');
  assert(obs.isVesselDetected(unarmed.id) && bells(nc).length === 0,
    'T6d nieuzbrojony wróg w układzie nieoglądanym — wykryty, bez wpisu dzwonka (SB59: tylko uzbrojony)');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T7 — przełączenie widoku nie zmienia zbioru wykrytych');
{
  const { vm, obs, ev } = world();
  const a = ship(vm, { name: 'A' });
  const b = ship(vm, { sys: 'sys_home', xAU: 1.4, name: 'B' });
  tick(obs);
  const before = ev.detect.length;
  window.KOSMOS.activeSystemId = 'sys_024'; tick(obs);
  window.KOSMOS.activeSystemId = 'sys_031'; tick(obs);
  assert(obs.isVesselDetected(a.id) && obs.isVesselDetected(b.id) && ev.detect.length === before && before === 2,
    `T7 wykryte A (sys_024) i B (sys_home) przy każdym widoku; przełączenia — zero zdarzeń detekcji (przed ${before}, po ${ev.detect.length})`);
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
