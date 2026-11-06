// Finding 600 — keeper: stempel właściciela układu ma JEDNEGO pisarza.
//
// PO CO: `galaxyData.systems[].empireId` miał kilku pisarzy z różnymi regułami własności
// („ostatni wygrywa", „zdobywca bierze cały układ", „czyść, gdy równy poprzedniemu"), a kanon
// `TerritoryService` ma jedną („pierwsza kolonia wygrywa"). Stempel jest teraz pochodnym LUSTREM
// kanonu: pisze go wyłącznie `TerritoryService.syncOwnerStamps` / `_writeOwnerStamps`.
//
// Pinowane:
//   §a  przejęcie kolonii przez gracza w układzie z 3 koloniami AI: stempel == kanon
//   §b  `transferColony` jednej z 3 kolonii: stempel == kanon
//   §c  po §a i §b `ownerStampMismatches()` zwraca []
//   §d  sonda NIE leczy: zatruty stempel jest zgłoszony i zostaje
//   §e  `syncOwnerStamps` naprawia stempel po cichej zmianie właściciela, mimo `_dirty === false`
//   §f  brak `colonyManager` ⇒ 0 i nic nie jest ruszane; zdarzenie i odczyt kanonu też nie ruszają indeksu
//
// ⚠ „Pierwsza kolonia" w kanonie to pierwsza w kolejności `getAllColonies()`, a przejęcie zostawia
//   kolonię na jej miejscu w `Map`. Dlatego §a i §b mierzą OSOBNO kolonię pierwszą w kanonie
//   i nie-pierwszą: to dwa różne przypadki, a tylko jeden z nich zmienia odpowiedź kanonu.
// ⚠ Reguła „pierwsza kolonia wygrywa" ZOSTAJE (podpis właściciela 2026-11-06). Przejęcie kolonii
//   PIERWSZEJ oddaje cały układ nowemu właścicielowi: to konsekwencja reguły, nie błąd lustra.
//   Dlatego dla kolonii pierwszej keeper pinuje „stempel == kanon", a nie „stempel bez zmian".

import '../headless/env.js';           // MUSI być pierwszy
import EntityManager from '../../core/EntityManager.js';
import { GameCore } from '../headless/GameCore.js';

let pass = 0, fail = 0, failApi = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// Fail-first: kod sprzed naprawy nie ma metod stempla. Pin ma DEGRADOWAĆ, nie przerywać: wyjątek przy
// pierwszej sondzie odebrałby kolor wszystkim pinom niżej. `NO_API` daje czerwień z dopiskiem „[brak API]",
// więc raport rozdziela brak metody od prawdziwego rozjazdu stempla.
const NO_API = Symbol('brak API');
const api = (ts, method, ...args) => (typeof ts[method] === 'function' ? ts[method](...args) : NO_API);
const dep = (probe, value) => (probe === NO_API ? NO_API : value);       // wartość zależna od wcześniejszego wywołania
const assertApi = (value, check, label) => {
  if (value === NO_API) { console.log('  ✗ ' + label + ' [brak API]'); fail++; failApi++; return; }
  assert(check(value), label);
};

// Świat z układem, w którym `empireId` ma DOKŁADNIE trzy kolonie. Każda grupa pinów ma własny:
// drugi `boot()` czyści poprzedni. `conquerorListedFirst`: zdobywca stoi na liście imperiów przed ofiarą.
function world({ conquerorListedFirst = false } = {}) {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  const K = window.KOSMOS;
  const cm = core.colonyManager;
  const reg = core.empireRegistry;
  const ids = reg.listAll().map(e => e.id);
  const [empireId, otherId] = conquerorListedFirst ? [ids[1], ids[0]] : ids;
  const sysId = cm.getAllColonies().find(c => c.ownerEmpireId === empireId).systemId;

  const free = EntityManager.getByTypeInSystem('planet', sysId).filter(p => !cm.getColony(p.id));
  for (const body of free.slice(0, 2)) {
    cm.createColony(body.id, { Fe: 50 }, 8, 0, empireId);
    reg.addColony(empireId, body.id);
  }

  const order = cm.getAllColonies().filter(c => c.systemId === sysId).map(c => c.planetId);
  const gs = K.galaxyData.systems.find(s => s.id === sysId);
  return { K, cm, reg, ts: core.territoryService, empireId, otherId, sysId, order, gs };
}

// Stempel wobec kanonu. Stempel czytamy PRZED kanonem: odczyt kanonu przy brudnym indeksie leczy stempel.
function stampVsCanon(w) {
  const stamp = w.gs.empireId ?? null;
  const owner = w.ts.getSystemOwner(w.sysId);
  return { stamp, owner, expected: owner === 'player' ? null : owner };
}

// Ponowne wyprowadzenie stempla, czyli ścieżka wczytania: kod sprzed naprawy robił to przez
// `syncToGalaxyData` („ostatni wygrywa"), dziś robi to kanon. Bez tego kroku piny kolonii PIERWSZEJ
// przechodziły na starym kodzie przypadkiem (zmierzone na f1a8dfd): zaraz po zdarzeniu „czyść, gdy
// równy poprzedniemu" i „zdobywca bierze układ" trafiają akurat w odpowiedź kanonu.
const rederive = (w) => (typeof w.ts.syncOwnerStamps === 'function'
  ? w.ts.syncOwnerStamps(w.K.galaxyData)
  : w.reg.syncToGalaxyData(w.K.galaxyData));

// ── Fixture ─────────────────────────────────────────────────────────────────
console.log('§0 — fixture: układ z trzema koloniami AI');
{
  const w = world();
  assert(w.order.length === 3, `F0: układ ma 3 kolonie (${w.order.length})`);
  assert(w.order.every(id => w.cm.getColony(id).ownerEmpireId === w.empireId),
    'F0: wszystkie trzy należą do tego samego imperium');
  assert(!!w.otherId && w.otherId !== w.empireId, 'F0: jest drugie imperium do roli zdobywcy');
  assert(w.gs?.empireId === w.empireId, 'F0: stempel = imperium, zanim cokolwiek się stanie');
  assertApi(api(w.ts, 'ownerStampMismatches'), m => m.length === 0, 'F0: lustro zgodne z kanonem na starcie');
}

// ── §a ──────────────────────────────────────────────────────────────────────
console.log('§a — przejęcie przez gracza: stempel == kanon');
{
  const w = world();
  assert(w.cm.captureColonyForPlayer(w.order[1]) === true, 'A1: gracz przejął kolonię NIE-pierwszą w kanonie');
  assert(w.cm.getColony(w.order[1]).ownerEmpireId == null, 'A1: kolonia jest już gracza');
  assert(w.gs.empireId === w.empireId, `A1: stempel AI zostaje (${w.gs.empireId})`);
  assert(w.ts.getSystemOwner(w.sysId) === w.empireId, 'A1: kanon też mówi: imperium');
}
{
  const w = world();
  // Układ przechodzi na gracza: konsekwencja reguły kanonu, nie błąd lustra. Stempel ma mówić to samo.
  assert(w.cm.captureColonyForPlayer(w.order[0]) === true, 'A2: gracz przejął kolonię PIERWSZĄ w kanonie');
  const now = stampVsCanon(w);
  rederive(w);
  const after = stampVsCanon(w);
  assert(now.stamp === now.expected && after.stamp === after.expected,
    `A2: stempel == kanon od razu i po ponownym wyprowadzeniu (od razu ${now.stamp}/${now.owner}, potem ${after.stamp}/${after.owner})`);
}

// ── §b ──────────────────────────────────────────────────────────────────────
console.log('§b — transferColony jednej z 3 kolonii: stempel == kanon');
{
  const w = world();
  assert(w.cm.transferColony(w.order[1], w.otherId, 'keeper') === true, 'B1: transfer kolonii NIE-pierwszej');
  assert(w.cm.getColony(w.order[1]).ownerEmpireId === w.otherId, 'B1: kolonia zmieniła właściciela');
  assert(w.gs.empireId === w.empireId, `B1: stempel zostaje przy dotychczasowym imperium (${w.gs.empireId})`);
  assert(w.ts.getSystemOwner(w.sysId) === w.empireId, 'B1: kanon też mówi: dotychczasowe imperium');
}
{
  // Układ przechodzi na zdobywcę: konsekwencja reguły kanonu, nie błąd lustra. Stempel ma mówić to samo.
  // Zdobywca stoi na liście PRZED ofiarą: przy odwrotnej kolejności stare „ostatni wygrywa" trafiałoby
  // w kanon przypadkiem, a tak ofiara z dwiema koloniami pisze ostatnia.
  const w = world({ conquerorListedFirst: true });
  assert(w.cm.transferColony(w.order[0], w.otherId, 'keeper') === true, 'B2: transfer kolonii PIERWSZEJ w kanonie');
  const now = stampVsCanon(w);
  rederive(w);
  const after = stampVsCanon(w);
  assert(now.stamp === now.expected && after.stamp === after.expected,
    `B2: stempel == kanon od razu i po ponownym wyprowadzeniu (od razu ${now.stamp}/${now.owner}, potem ${after.stamp}/${after.owner})`);
}

// ── §c ──────────────────────────────────────────────────────────────────────
console.log('§c — po §a i §b lustro zgadza się z kanonem');
{
  const w = world();
  w.cm.captureColonyForPlayer(w.order[1]);
  w.cm.transferColony(w.order[2], w.otherId, 'keeper');
  const v = stampVsCanon(w);        // pomiar niezależny od sondy: ma kolor także na kodzie bez sondy
  assert(v.stamp === v.expected, `C1: stempel == kanon po przejęciu i transferze kolonii nie-pierwszych (${v.stamp}/${v.owner})`);
  assertApi(api(w.ts, 'ownerStampMismatches'), m => m.length === 0, 'C1: sonda zwraca [] po przejęciu i transferze kolonii nie-pierwszych');

  // Kontrola pinu: sonda widzi ten układ, więc [] nie jest puste z braku przedmiotu.
  const truth = w.gs.empireId;
  w.gs.empireId = 'emp_zatruty';
  assertApi(api(w.ts, 'ownerStampMismatches'), m => m.some(r => r.systemId === w.sysId),
    'C1 KONTROLA PINU: rozjazd w tym układzie byłby zgłoszony');
  w.gs.empireId = truth;
}
{
  const w = world();
  w.cm.captureColonyForPlayer(w.order[0]);
  w.cm.transferColony(w.order[1], w.otherId, 'keeper');
  const v = stampVsCanon(w);
  assert(v.stamp === v.expected, `C2: stempel == kanon także po przejęciu kolonii pierwszej (${v.stamp}/${v.owner})`);
  assertApi(api(w.ts, 'ownerStampMismatches'), m => m.length === 0, 'C2: sonda zwraca [] także po przejęciu kolonii pierwszej');
}

// ── §d ──────────────────────────────────────────────────────────────────────
console.log('§d — sonda NIE leczy');
{
  const w = world();
  w.ts._ensure();
  assert(w.ts._dirty === false, 'D1: indeks czysty przed pomiarem');
  w.gs.empireId = 'emp_zatruty';
  const m = api(w.ts, 'ownerStampMismatches');
  const row = m === NO_API ? null : m.find(r => r.systemId === w.sysId);
  assertApi(m, v => v.length === 1 && !!row, 'D1: zatruty stempel zgłoszony, dokładnie jeden wiersz');
  assertApi(m, () => row?.stamp === 'emp_zatruty' && row?.expected === w.empireId, 'D1: wiersz podaje stempel i wartość oczekiwaną');
  assertApi(dep(m, w.gs.empireId), v => v === 'emp_zatruty', 'D1: stempel NIE został naprawiony przez sondę');
  assertApi(api(w.ts, 'ownerStampMismatches'), v => v.length === 1, 'D1: drugi odczyt widzi ten sam rozjazd');
}
{
  // Sonda pyta kanon, a kanon przebudowuje BRUDNY indeks. Rozjazd musi być zgłoszony także wtedy.
  // ⚠ Przy `_dirty = true` odczyt kanonu leczy stempel (pomiar niżej), więc sonda NIE leczy tylko przy
  //   czystym indeksie. W grze to stan wyłącznie między konstruktorem a pierwszą przebudową: rejestr
  //   kolonii jest ustawiany raz, a potem `_invalidate` przebudowuje od razu.
  const w = world();
  w.gs.empireId = 'emp_zatruty';
  w.ts._dirty = true;
  const m = api(w.ts, 'ownerStampMismatches');
  const row = m === NO_API ? null : m.find(r => r.systemId === w.sysId);
  assertApi(m, () => row?.stamp === 'emp_zatruty', 'D2: przy brudnym indeksie rozjazd NADAL jest zgłoszony (migawka przed kanonem)');
  console.log(`    pomiar D2: stempel po sondzie przy brudnym indeksie = ${w.gs.empireId}`);
}

// ── §e ──────────────────────────────────────────────────────────────────────
console.log('§e — syncOwnerStamps naprawia stempel mimo _dirty === false');
{
  const w = world();
  w.ts._ensure();
  w.cm.getColony(w.order[0]).ownerEmpireId = w.otherId;       // bez zdarzenia, jak relink po wczytaniu
  assert(w.ts._dirty === false, 'E1: indeks „czysty" mimo zmiany właściciela');
  assert(w.gs.empireId === w.empireId, 'E1 KONTROLA PINU: stempel jeszcze stary');
  assertApi(api(w.ts, 'ownerStampMismatches'), m => m.length === 0, 'E1 KONTROLA PINU: nieaktualny indeks zgadza się ze starym stemplem');
  const synced = api(w.ts, 'syncOwnerStamps', w.K.galaxyData);
  assertApi(synced, n => n === 1, 'E1: syncOwnerStamps przepisał jeden stempel');
  assertApi(dep(synced, w.gs.empireId), v => v === w.otherId, 'E1: stempel = nowy właściciel pierwszej kolonii');
  assertApi(dep(synced, w.ts.getSystemOwner(w.sysId)), v => v === w.otherId, 'E1: kanon odpowiada tak samo');
  assertApi(api(w.ts, 'syncOwnerStamps', w.K.galaxyData), n => n === 0, 'E1: drugi przebieg niczego nie zmienia');
}
{
  const w = world();
  const foreign = { systems: [{ id: w.sysId, empireId: 'emp_zatruty' }] };
  const synced = api(w.ts, 'syncOwnerStamps', foreign);
  assertApi(synced, n => n === 1, 'E2: inne `galaxyData` dostaje stempel z tego samego indeksu');
  assertApi(dep(synced, foreign.systems[0].empireId), v => v === w.empireId, 'E2: stempel zgodny z kanonem');
}

// ── §f ──────────────────────────────────────────────────────────────────────
console.log('§f — brak colonyManager: 0 i nic nie jest ruszane');
{
  const w = world();
  w.gs.empireId = 'emp_zatruty';
  const before = JSON.stringify(w.K.galaxyData.systems.map(s => s.empireId ?? null));
  const saved = w.K.colonyManager;
  w.K.colonyManager = null;

  const synced = api(w.ts, 'syncOwnerStamps', w.K.galaxyData);
  assertApi(synced, n => n === 0, 'F1: zwraca 0');
  assertApi(dep(synced, JSON.stringify(w.K.galaxyData.systems.map(s => s.empireId ?? null))), v => v === before, 'F1: stemple nietknięte');

  w.K.colonyManager = saved;
  assertApi(dep(synced, w.ts.getSystemOwner(w.sysId)), v => v === w.empireId, 'F2: indeks kanonu też nietknięty (właściciel znany po powrocie rejestru)');

  // Kontrola pinu: to brak rejestru chronił zatruty stempel, nie coś innego.
  const healed = api(w.ts, 'syncOwnerStamps', w.K.galaxyData);
  assertApi(healed, n => n === 1 && w.gs.empireId === w.empireId,
    'F1 KONTROLA PINU: z rejestrem ten sam stempel zostaje naprawiony');
}
{
  // Dwa pozostałe wejścia do przebudowy: zdarzenie (eager `_invalidate`) i odczyt kanonu.
  const w = world();
  w.ts._ensure();
  const saved = w.K.colonyManager;
  w.K.colonyManager = null;

  w.ts.reindex();                     // to samo wejście co każde zdarzenie z listy `_events`
  assert(w.ts._dirty === true, 'F3: zdarzenie bez rejestru zostawia `_dirty = true`');
  assert(w.ts._index.get(w.sysId)?.owner === w.empireId, 'F3: zdarzenie bez rejestru nie czyści indeksu');

  w.ts.getSystemOwner(w.sysId);       // odczyt bez rejestru
  assert(w.ts._dirty === true && w.ts._index.get(w.sysId)?.owner === w.empireId, 'F4: odczyt kanonu bez rejestru też nie przebudowuje indeksu');

  w.K.colonyManager = saved;
  assert(w.ts.getSystemOwner(w.sysId) === w.empireId && w.ts._dirty === false, 'F4: pierwszy odczyt z rejestrem przebudowuje indeks');
}

console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} system_owner_stamp: ${pass} pass, ${fail} fail${failApi ? ` (w tym brak API: ${failApi})` : ''}`);
process.exit(fail === 0 ? 0 : 1);
