// sb3_armed_contact_smoke.mjs — AI STRIKES BACK S3/2 (SB59): wpis dzwonka przy PIERWSZYM WYKRYCIU uzbrojonego wrogiego
// kadłuba w układzie, w którym gracz ma kolonię — JEDEN na przylatującą grupę.
//
// Wykrycie = obserwatorium (`vessel:detectionChanged`, producent `ObservatorySystem._tickVesselDetection`) albo sensory
// statku gracza (`vessel:proximityEnter`, producent `ProximitySystem._checkPair`). Grupa = eskadra (`groupId` w rozkazie
// złożonym / misji / rozkazie ruchu) — jeden wpis na układ; kadłub bez grupy — jedno imperium w jednym układzie w oknie
// `ARMED_CONTACT_GROUP_YEARS`. Kadłub zgłoszony w układzie nie zgłasza się tam ponownie, dopóki nie przyleci ze skoku.
// Pamięć w zapisie (`NotificationCenter.serialize().armedContact`) — wczytanie nie powtarza wpisu.
//
// PINY (fail-first na S3-8, `2f73ec3`):
//   T1  prawdziwe obserwatorium: uzbrojony wróg w układzie z kolonią ⇒ JEDEN wpis (typ, ikona grupy, nazwa układu,
//       Dziennik `intel`/`warn`) + KONTROLA: bez wykrycia — zero wpisów.
//   T2  eskadra (`groupId`) wykrywana kadłub po kadłubie ⇒ jeden wpis; ponowne wykrycie — bez wpisu.
//   T3  kadłuby bez grupy: jedno imperium, jeden układ, w oknie 1 roku ⇒ jeden wpis; po oknie NOWY kadłub ⇒ drugi;
//       ten sam kadłub (bez skoku) po oknie — bez wpisu.
//   T4  prawdziwe sensory statku gracza (ProximitySystem) ⇒ wpis; para AI–AI i gracz–gracz ⇒ brak.
//   T5  bez wpisu: nieuzbrojony, własny, wrak, układ bez kolonii gracza, statek w skoku (+ kontrola uzbrojonego).
//   T6  przylot ze skoku czyści pamięć kadłuba: nowa grupa po przylocie ⇒ wpis; ta sama zmiana grupy BEZ skoku — brak.
//   T7  zapis: pamięć przeżywa serialize/restore (ten sam kadłub — brak), pomija kadłuby, których już nie ma;
//       zapis bez pola — pusta pamięć (stary zapis).
//   T8  i18n PL + EN, bez surowego klucza; nagłówek grupy w rozwijanej liście.

import '../headless/env.js';               // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import EventBus                  from '../../core/EventBus.js';
import EntityManager             from '../../core/EntityManager.js';
import { t, setLocale }          from '../../i18n/i18n.js';
import { VesselManager }         from '../../systems/VesselManager.js';
import { ProximitySystem }       from '../../systems/ProximitySystem.js';
import { ObservatorySystem }     from '../../systems/ObservatorySystem.js';
import { EventLogSystem }        from '../../systems/EventLogSystem.js';
import * as NC                   from '../../systems/NotificationCenter.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU = 110;
const NotificationCenter = NC.NotificationCenter;
setLocale('en');

function world({ year = 10 } = {}) {
  EventBus.clear();
  EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: year }, activeSystemId: 'sys_home' };
  EntityManager.add({ id: 'star_home', type: 'star', name: 'Sol',    systemId: 'sys_home', x: 0, y: 0 });
  EntityManager.add({ id: 'star_24',   type: 'star', name: 'Diphda', systemId: 'sys_024', x: 0, y: 0 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: 'sys_home', x: 1.0 * AU, y: 0 });
  EntityManager.add({ id: 'p_24',   type: 'planet', name: 'Obca', systemId: 'sys_024', x: 1.0 * AU, y: 0 });
  const colony = {
    planetId: 'p_home', name: 'Dom', planet: EntityManager.get('p_home'),
    buildingSystem: { _active: new Map([['h_obs', { building: { id: 'observatory' }, level: 1 }]]) },
  };
  window.KOSMOS.colonyManager = { getAllColonies: () => [colony], getPlayerColonies: () => [colony] };
  window.KOSMOS.starSystemManager = { getAllSystems: () => [] };
  const vm = new VesselManager();
  window.KOSMOS.vesselManager = vm;
  const log = new EventLogSystem();
  window.KOSMOS.eventLogSystem = log;
  const nc = new NotificationCenter();
  window.KOSMOS.notificationCenter = nc;
  return { vm, nc, log, colony };
}

function ship(vm, { sys = 'sys_home', xAU = 1.5, yAU = 0, empire = 'emp_001', armed = true, name, groupId = null } = {}) {
  const v = vm.createAndRegister('hull_frigate', 'p_none', { name: name ?? `v_${xAU}`, modules: armed ? ['weapon_laser'] : [] });
  v.systemId = sys;
  v.position.x = xAU * AU; v.position.y = yAU * AU;
  v.position.state = 'orbiting'; v.position.dockedAt = null;
  v.status = 'idle'; v.mission = null;
  if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; }
  if (groupId) v.mission = { type: 'attack', targetId: 'p_home', groupId };
  return v;
}

const bells = (nc) => (nc.getActive?.() ?? []).filter(n => n.type === 'armedContact');
const detect = (v) => EventBus.emit('vessel:detectionChanged', { vesselId: v.id, detected: true, vessel: v });

// ════════════════════════════════════════════════════════════════════════════════════════
header('T1 — prawdziwe obserwatorium: uzbrojony wróg w układzie z kolonią ⇒ jeden wpis');
{
  const { vm, nc, log, colony } = world();
  const obs = new ObservatorySystem();
  window.KOSMOS.observatorySystem = obs;
  const foe = ship(vm, { xAU: 1.6, name: 'Rajder' });
  assert(bells(nc).length === 0, 'T1-0 KONTROLA: bez wykrycia — zero wpisów');
  obs._tickVesselDetection(0.01);
  assert(obs.isVesselDetected(foe.id) && obs.getVesselDetectionRangeAU(colony) === 3, 'T1-1 WARUNEK SCENY: obserwatorium (3 AU) wykryło wroga 0,6 AU od kolonii');
  const b = bells(nc);
  assert(b.length === 1 && b[0].severity === 'warn' && b[0].payload?.systemId === 'sys_home' && b[0].payload?.vesselId === foe.id,
    `T1a JEDEN wpis typu \`armedContact\` (warn, układ sys_home, kadłub Rajder) — jest ${b.length}`);
  assert(b[0]?.title === t('notif.armedContactTitle', 'Sol') && /Sol/.test(b[0]?.title ?? '') && !/notif\./.test(b[0]?.title ?? ''),
    `T1b tytuł nazywa UKŁAD (kanon nazwy: gwiazda „Sol”), bez surowego klucza: „${b[0]?.title}”`);
  assert(!!b[0]?.title && !/Rajder|emp_001/.test(b[0].title), 'T1c mgła wojny: wpis istnieje i nie ujawnia nazwy kadłuba ani imperium');
  const entries = (log.getEntries?.() ?? []).filter(e => e.text === b[0]?.title);
  assert(entries.length === 1 && entries[0].channel === 'intel' && entries[0].severity === 'warn',
    `T1d Dziennik: jeden wpis kanału intel / warn (${entries.length})`);
  obs._tickVesselDetection(0.01);
  assert(bells(nc).length === 1, 'T1e ten sam wróg w kolejnym tiku — bez nowego wpisu');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T2 — eskadra (`groupId`) wykrywana kadłub po kadłubie ⇒ jeden wpis');
{
  const { vm, nc } = world();
  const a = ship(vm, { xAU: 1.6, name: 'E1', groupId: 'sq_1' });
  const b = ship(vm, { xAU: 1.7, name: 'E2', groupId: 'sq_1' });
  const c = ship(vm, { xAU: 1.8, name: 'E3' });
  c.mission = null; c.pendingOrder = { kind: 'attack', groupId: 'sq_1' };   // grupa w rozkazie złożonym (po skoku)
  detect(a);
  assert(bells(nc).length === 1, `T2a pierwszy kadłub eskadry ⇒ wpis (${bells(nc).length})`);
  window.KOSMOS.timeSystem.gameTime += 3;                       // eskadra — bez okna: nawet po 3 latach jeden wpis
  detect(b); detect(c);
  assert(bells(nc).length === 1, `T2b drugi (misja) i trzeci (rozkaz złożony) kadłub TEJ SAMEJ eskadry — bez wpisu (${bells(nc).length})`);
  detect(a);
  assert(bells(nc).length === 1, 'T2c ponowne wykrycie kadłuba eskadry — bez wpisu');
  const d = ship(vm, { xAU: 1.9, name: 'Inna eskadra', groupId: 'sq_2' });
  detect(d);
  assert(bells(nc).length === 2, `T2d KONTROLA: kadłub INNEJ eskadry ⇒ drugi wpis (${bells(nc).length})`);
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T3 — kadłuby bez grupy: jedno imperium, jeden układ, okno 1 roku');
{
  const { vm, nc } = world({ year: 10 });
  const a = ship(vm, { xAU: 1.6, name: 'Bez grupy 1' });
  const b = ship(vm, { xAU: 1.7, name: 'Bez grupy 2' });
  detect(a);
  window.KOSMOS.timeSystem.gameTime = 10.5;
  detect(b);
  assert(bells(nc).length === 1, `T3a dwa kadłuby imperium w układzie w oknie roku ⇒ jeden wpis (${bells(nc).length})`);
  const o = ship(vm, { xAU: 1.75, name: 'Inne imperium', empire: 'emp_002' });
  detect(o);
  assert(bells(nc).length === 2, `T3b KONTROLA: kadłub INNEGO imperium ⇒ osobny wpis (${bells(nc).length})`);
  window.KOSMOS.timeSystem.gameTime = 12.0;
  detect(a);
  assert(bells(nc).length === 2, 'T3c ten sam kadłub (bez skoku) po oknie — bez wpisu: już zgłoszony w tym układzie');
  const n = ship(vm, { xAU: 1.8, name: 'Nowy po oknie' });
  detect(n);
  assert(bells(nc).length === 3, `T3d NOWY kadłub tego imperium po oknie ⇒ kolejny wpis (${bells(nc).length})`);
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T4 — prawdziwe sensory statku gracza (ProximitySystem)');
{
  const { vm, nc } = world();
  const prox = new ProximitySystem(vm);
  const me = ship(vm, { xAU: 1.00, empire: null, name: 'Furia' });
  const foe = ship(vm, { xAU: 1.05, name: 'Wrog' });
  prox._checkPair(me, foe);
  assert(bells(nc).length === 1 && bells(nc)[0].payload?.vesselId === foe.id,
    `T4a para gracz–wróg z ProximitySystem ⇒ wpis o WROGU (${bells(nc).length})`);
  const a1 = ship(vm, { xAU: 2.00, name: 'AI1', empire: 'emp_002' });
  const a2 = ship(vm, { xAU: 2.05, name: 'AI2', empire: 'emp_003' });
  const before = bells(nc).length;
  prox._checkPair(a1, a2);
  const me2 = ship(vm, { xAU: 2.10, empire: null, name: 'Gracz2' });
  prox._checkPair(me, me2);
  assert(before === 1 && bells(nc).length === before,
    `T4b para AI–AI (dwa imperia) i para gracz–gracz — bez wpisu (to nie wykrycie gracza); świadek: para gracz–wróg dała ${before}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T5 — bez wpisu: nieuzbrojony, własny, wrak, układ bez kolonii, statek w skoku');
{
  const { vm, nc } = world();
  detect(ship(vm, { xAU: 1.6, name: 'Transport', armed: false }));
  detect(ship(vm, { xAU: 1.6, name: 'Swoj', empire: null }));
  const w = ship(vm, { xAU: 1.6, name: 'Wrak' }); w.isWreck = true; detect(w);
  detect(ship(vm, { sys: 'sys_024', xAU: 1.6, name: 'Gdzie indziej' }));
  detect(ship(vm, { sys: null, xAU: 1.6, name: 'W skoku' }));
  const n0 = bells(nc).length;
  detect(ship(vm, { xAU: 1.6, name: 'Uzbrojony' }));
  const n1 = bells(nc).length;
  assert(n0 === 0 && n1 === 1,
    `T5a nieuzbrojony / własny / wrak / układ bez kolonii / w skoku — zero wpisów (${n0}); KONTROLA w tej samej scenie: uzbrojony wróg w układzie z kolonią ⇒ wpis (${n1})`);
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T6 — przylot ze skoku czyści pamięć kadłuba');
{
  const { vm, nc } = world();
  const v = ship(vm, { xAU: 1.6, name: 'Wraca', groupId: 'sq_a' });
  detect(v);
  v.mission.groupId = 'sq_b';                                   // nowa grupa, ale kadłub nie opuścił układu
  detect(v);
  assert(bells(nc).length === 1, 'T6a ten sam kadłub w NOWEJ grupie BEZ skoku — bez wpisu (już zgłoszony w tym układzie)');
  EventBus.emit('interstellar:arrived', { vessel: v, systemId: 'sys_home' });
  v.mission.groupId = 'sq_c';
  detect(v);
  assert(bells(nc).length === 2, `T6b po PRZYLOCIE ze skoku (nowa grupa) ⇒ nowy wpis (${bells(nc).length})`);
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T7 — zapis: pamięć przeżywa serialize/restore');
{
  const { vm, nc } = world();
  const a = ship(vm, { xAU: 1.6, name: 'Zapamietany' });
  const gone = ship(vm, { xAU: 1.7, name: 'Zniknie', empire: 'emp_002' });
  detect(a); detect(gone);
  vm._vessels.delete(gone.id);
  const data = JSON.parse(JSON.stringify(nc.serialize()));
  assert(data?.armedContact?.seen?.[a.id] === 'sys_home' && !(gone.id in (data?.armedContact?.seen ?? {})),
    'T7a zapis niesie pamięć kadłuba (`armedContact.seen`) i pomija kadłuby, których już nie ma');
  EventBus.clear();
  const nc2 = new NotificationCenter();
  window.KOSMOS.notificationCenter = nc2;
  nc2.restore(data);
  const before = bells(nc2).length;
  window.KOSMOS.timeSystem.gameTime += 5;
  detect(a);
  const fresh = ship(vm, { xAU: 1.8, name: 'Nowy po wczytaniu', empire: 'emp_009' });
  detect(fresh);
  assert(bells(nc2).length === before + 1 && bells(nc2)[0]?.payload?.vesselId === fresh.id,
    `T7b po wczytaniu ten sam kadłub (bez skoku) — bez nowego wpisu; świadek: NOWY kadłub po wczytaniu ⇒ wpis (${bells(nc2).length - before})`);
  EventBus.clear();
  const nc3 = new NotificationCenter();
  window.KOSMOS.notificationCenter = nc3;
  nc3.restore({ nextId: 1, items: [] });                        // zapis sprzed S3/2 — bez pola
  detect(a);
  assert(bells(nc3).length === 1, 'T7c zapis BEZ pola `armedContact` (sprzed S3/2) — pusta pamięć: pierwsze wykrycie daje wpis');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T8 — i18n PL + EN; nagłówek grupy w rozwijanej liście');
{
  const keys = ['notif.armedContactTitle', 'notif.group.armedContact'];
  const pl = readFileSync('src/i18n/pl.js', 'utf8');
  const en = readFileSync('src/i18n/en.js', 'utf8');
  assert(keys.every(k => pl.includes(`'${k}':`) && en.includes(`'${k}':`)), 'T8a oba klucze istnieją w PL i EN');
  setLocale('pl');
  const plTitle = t('notif.armedContactTitle', 'Sol');
  setLocale('en');
  const enTitle = t('notif.armedContactTitle', 'Sol');
  assert(plTitle !== enTitle && /Sol/.test(plTitle) && /Sol/.test(enTitle) && !/notif\./.test(plTitle + enTitle),
    `T8b tytuł w obu językach z nazwą układu: „${plTitle}” / „${enTitle}”`);
  const dd = readFileSync('src/ui/NotificationDropdown.js', 'utf8').replace(/\r\n/g, '\n');
  assert(/armedContact:\s*'[^']+'/.test(dd) && /case 'armedContact':\s*return t\('notif\.group\.armedContact'\)/.test(dd),
    'T8c rozwijana lista: ikona i nagłówek grupy `armedContact` (inaczej nagłówkiem byłby surowy typ)');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
