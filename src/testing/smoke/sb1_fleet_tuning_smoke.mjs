// AI STRIKES BACK S1 — keeper tabeli strojenia arca (SB9, SB16) i limitu floty imperium AI (SB3, SB14).
// Plan i decyzje: `docs/design/AI_STRIKES_BACK_PLAN.md` §2–§3.
//
//   T1  dane: klucze tabeli S1, wartości domyślne 2 / 32 / [1, 1, 1, 1.25]; mnożniki szczebli = `limitMult` drabiny
//       garnizonu (tripwire — zmiana drabiny wymaga świadomej decyzji w tabeli)
//   T2  zmiana, odczyt, reset jednego klucza i całej tabeli; znacznik `*` wyłącznie przy wartości różnej od domyślnej;
//       zmiana zostawia wpis audytu `state` w DebugLog
//   T3  każda odmowa (nieznany klucz, zły typ, poza zakresem — liczba i lista) nazywa klucze albo zakres i NICZEGO
//       nie zmienia; nie-jałowość: poprawna zmiana tuż po odmowie zmienia stan
//   T4  zapis i wczytanie przez PRAWDZIWE `SaveSystem._serializeCiv4x` → JSON → `gameState.restore` (to samo wywołanie
//       co `GameScene`) → sprzątanie; nie-jałowość: po `reset` (nowa sesja) wartości są domyślne, więc to wczytanie je
//       przywraca; KONTROLA mechanizmu: `gameState.restore` wyrzuca klucz niezadeklarowany
//   T5  fixture GATE-S4 (bez klucza) wczytuje się do wartości domyślnych; świadek: klucza w zapisie nie ma, a przed
//       wczytaniem stan był zmieniony
//   T6  nieznany klucz i wartość spoza typu w zapisie są pomijane z wpisem `sbTuning:storedValueIgnored` w DebugLog;
//       poprawna wartość obok zostaje
//   T7  wpięcie w `GameScene` (pin źródłowy, komentarze zdjęte): komendy `sbTuning` / `sbSet` / `sbReset`, sprzątanie
//       PO `gameState.restore(c4x.gameState)` (KONTROLA PINU na zmutowanej kopii); zdarzenie w `TRACKED_EVENTS`
//   T8  wyjście konsoli: tabela (klucz, domyślna, bieżąca, `*`), odmowa z listą kluczy / zakresem
//   T9  limit: fixture GATE-S4 — 6 dla obu imperiów (świadkowie POP 185 / 178 i fabryk 20 / 20); `fleetPopPerHull`
//       zmieniony z konsoli zmienia limit OD RAZU; minimum 2; mnożnik 1 poniżej 20 poziomów fabryk; to samo
//       zaokrąglenie, szczebel i źródło POP co limit garnizonu (wykonanie na siatce POP × fabryk, KONTROLA dyskryminacji)
//   T10 liczenie kadłubów: rezerwa, mobilizacja, służba, dok i przestrzeń — TAK; wrak, frachtowiec bez broni, kadłub
//       innego imperium i gracza — NIE; podział wg służby i położenia, miejsce dla puli
//   T11 limit czytają wyłącznie konsola i pula okrętów (pin źródłowy importów w `src/` poza `testing/`)
//   T12 odczyt per imperium w konsoli (z kolumnami puli) i jego wpięcie w `KOSMOS.debug.sbTuning()`
//
// ⚠ PRZECELOWANIE S1 sesja 2 (R-B2a, zgoda właściciela): tabela rośnie o klucze puli (SB20/SB21) RAZEM z konsumentem —
//   klucze S1-1 pinowane jako PREFIKS tabeli z literalnymi wartościami domyślnymi, „wszystko domyślne” liczone po CAŁEJ
//   tabeli; nowe klucze pinuje `sb1_fleet_pool_smoke` (T1c: każdy klucz ma konsumenta).
//
// ⚠ Fail-first: moduły S1 powstają w tym slice — import dynamiczny w try/catch i wywołania przez pomocnika, żeby
//   na kodzie sprzed zmiany piny DEGRADOWAŁY (czerwone), a nie przerywały suitę.
// ⚠ Każdy pin wykluczający ma świadka w tym samym asercie (odmowa niczego nie zmienia ⇔ odmowa W OGÓLE padła).

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import debugLog from '../../core/DebugLog.js';
import * as VesselNS from '../../entities/Vessel.js';
import { GARRISON_LADDER } from '../../data/GarrisonData.js';
import { garrisonLimit, garrisonTier, readEmpireGarrisonSnapshot } from '../../utils/GarrisonPlanner.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const DATA = await import('../../data/StrikesBackData.js').catch(() => null);
const TUN  = await import('../../utils/StrikesBackTuning.js').catch(() => null);
const tun  = (name, ...args) => (typeof TUN?.[name] === 'function' ? TUN[name](...args) : undefined);
const FL   = await import('../../utils/FleetLimit.js').catch(() => null);
const fl   = (name, ...args) => (typeof FL?.[name] === 'function' ? FL[name](...args) : undefined);

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC  = path.resolve(here, '../..');
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
const FIXTURE = JSON.parse(gunzipSync(readFileSync(path.join(SRC, 'testing/fixtures/GATE-S4-fresh-gy60.save.json.gz'))).toString('utf8'));

const origLog = console.log, origWarn = console.warn, origTable = console.table;
function capture(fn) {
  const out = [];
  console.log = (...a) => out.push(['log', a.map(String).join(' ')]);
  console.warn = (...a) => out.push(['warn', a.map(String).join(' ')]);
  console.table = (rows) => out.push(['table', JSON.stringify(rows)]);
  let ret;
  try { ret = fn(); } finally { console.log = origLog; console.warn = origWarn; console.table = origTable; }
  return { ret, out };
}

// Jeden świat GameCore (gameState + DebugLog zamontowane i podpięte do EventBus po `clear`).
console.log = () => {}; console.warn = () => {};
const core = new GameCore();
core.boot({ quiet: true, scenario: 'civilization' });
console.log = origLog; console.warn = origWarn;
const K = window.KOSMOS;
const stateOf = () => JSON.stringify(gameState.get('strikesBackTuning') ?? null);
// Stan świata GameCore — T4–T6 podmieniają `gameState` (zapis, fixture), T10 potrzebuje z powrotem tego świata.
const WORLD_GS = JSON.stringify(gameState.serialize());
const restoreWorld = () => gameState.restore(JSON.parse(WORLD_GS));
const S11 = ['fleetMinHulls', 'fleetPopPerHull', 'fleetRungMult'];
/** Wartości S1-1 literałem (SB3) i KAŻDY klucz tabeli na wartości domyślnej. */
const allDefault = () => {
  const cur = tun('readTuningValues') ?? {};
  const T = DATA?.SB_TUNING ?? {};
  return cur.fleetMinHulls === 2 && cur.fleetPopPerHull === 32 && same(cur.fleetRungMult, [1, 1, 1, 1.25])
    && Object.keys(T).length >= 3 && same(Object.keys(cur), Object.keys(T)) && Object.keys(T).every((k) => same(cur[k], T[k].default));
};
const stateLogCount = () => debugLog.query((e) => e.kind === 'state' && e.data?.path === 'strikesBackTuning').length;

// ── T1 — dane ──────────────────────────────────────────────────────────────────────────────────
console.log('\nT1 — tabela: klucze i wartości domyślne');
{
  const T = DATA?.SB_TUNING;
  assert(same(Object.keys(T ?? {}).slice(0, 3), S11),
    `T1a: tabela zaczyna się kluczami limitu floty S1-1, w tej kolejności (${JSON.stringify(Object.keys(T ?? {}))})`);
  assert(T?.fleetMinHulls?.default === 2 && T?.fleetPopPerHull?.default === 32 && same(T?.fleetRungMult?.default, [1, 1, 1, 1.25]),
    'T1b: wartości domyślne 2 / 32 / [1, 1, 1, 1.25] (SB3)');
  assert(GARRISON_LADDER.length === 4, 'T1c (KONTROLA): drabina garnizonu ma 4 szczeble');
  assert(T?.fleetRungMult?.length === GARRISON_LADDER.length
    && GARRISON_LADDER.every((row, i) => T.fleetRungMult.default[i] === row.limitMult),
    'T1d (tripwire): mnożniki szczebli floty = `limitMult` drabiny garnizonu, szczebel po szczeblu');
  assert(allDefault(), 'T1e: świeża gra — bieżące wartości = domyślne (S1-1: 2 / 32 / [1, 1, 1, 1.25])');
}

// ── T2 — zmiana, odczyt, reset ─────────────────────────────────────────────────────────────────
console.log('\nT2 — zmiana, odczyt, reset');
{
  const logs0 = stateLogCount();
  const r = tun('setTuning', 'fleetPopPerHull', 40);
  assert(r?.ok === true && r.previous === 32 && r.value === 40 && r.default === 32, `T2a: sbSet fleetPopPerHull 40 → ${JSON.stringify(r)}`);
  assert(tun('getTuning', 'fleetPopPerHull') === 40, 'T2b: odczyt w chwili użycia daje 40');
  assert(same(gameState.get('strikesBackTuning'), { fleetPopPerHull: 40 }), `T2c: zapis w gameState: ${stateOf()}`);
  assert(stateLogCount() === logs0 + 1, 'T2d: zmiana zostawia wpis audytu `state` (DebugLog)');
  const rows = tun('tuningRows') ?? [];
  const mark = Object.fromEntries(rows.map((x) => [x.klucz, x.zmiana]));
  assert(mark.fleetPopPerHull === '*' && mark.fleetMinHulls === '' && mark.fleetRungMult === '',
    `T2e: znacznik zmiany tylko przy fleetPopPerHull (${JSON.stringify(mark)})`);
  const r2 = tun('setTuning', 'fleetPopPerHull', 32);
  assert(r2?.ok === true && same(gameState.get('strikesBackTuning'), {}) && (tun('tuningRows') ?? []).every((x) => x.zmiana === ''),
    'T2f: ustawienie wartości domyślnej zdejmuje wpis i znacznik');
  const r3 = tun('setTuning', 'fleetRungMult', [1, 1, 1, 1.5]);
  const got = tun('getTuning', 'fleetRungMult');
  if (Array.isArray(got)) got[3] = 99;
  assert(r3?.ok === true && same(tun('getTuning', 'fleetRungMult'), [1, 1, 1, 1.5]),
    'T2g: lista mnożników ustawiona; odczyt zwraca KOPIĘ (zmiana kopii nie rusza stanu)');
  tun('setTuning', 'fleetMinHulls', 3);
  const rr = tun('resetTuning', 'fleetMinHulls');
  assert(rr?.ok === true && same(rr.reset, ['fleetMinHulls']) && tun('getTuning', 'fleetMinHulls') === 2
    && same(tun('getTuning', 'fleetRungMult'), [1, 1, 1, 1.5]), 'T2h: sbReset(klucz) — tylko ten klucz wraca do domyślnej');
  tun('setTuning', 'fleetPopPerHull', 40);
  const ra = tun('resetTuning');
  assert(ra?.ok === true && same([...(ra.reset ?? [])].sort(), ['fleetPopPerHull', 'fleetRungMult']) && allDefault(),
    `T2i: sbReset() — cała tabela domyślna (zdjęte: ${JSON.stringify(ra?.reset)})`);
}

// ── T3 — odmowy ────────────────────────────────────────────────────────────────────────────────
console.log('\nT3 — odmowy: lista kluczy albo zakres, stan bez zmian');
{
  tun('setTuning', 'fleetPopPerHull', 40);                    // stan niedomyślny — odmowa ma czego NIE zmienić
  const cases = [
    ['bogus', 1, 'unknown_key', (r) => same(r.validKeys, tun('tuningKeys')) && same(r.validKeys.slice(0, 3), S11)],
    ['fleetPopPerHull', '40', 'wrong_type', (r) => same(r.range, [1, 10000])],
    ['fleetPopPerHull', 40.5, 'wrong_type', (r) => same(r.range, [1, 10000])],
    ['fleetPopPerHull', NaN, 'wrong_type', (r) => same(r.range, [1, 10000])],
    ['fleetPopPerHull', 0, 'out_of_range', (r) => same(r.range, [1, 10000])],
    ['fleetMinHulls', -1, 'out_of_range', (r) => same(r.range, [0, 100])],
    ['fleetMinHulls', 101, 'out_of_range', (r) => same(r.range, [0, 100])],
    ['fleetRungMult', [1, 1, 1], 'wrong_type', (r) => same(r.range, [0, 10])],
    ['fleetRungMult', 1.25, 'wrong_type', (r) => same(r.range, [0, 10])],
    ['fleetRungMult', [1, 1, 'x', 1], 'wrong_type', (r) => r.index === 2],
    ['fleetRungMult', [1, 1, 1, 11], 'out_of_range', (r) => r.index === 3 && same(r.range, [0, 10])],
  ];
  for (const [key, value, reason, extra] of cases) {
    const before = stateOf(), logs = stateLogCount();
    const r = tun('setTuning', key, value);
    const line = r ? (TUN?.describeRefusal?.(r) ?? '') : '';
    const names = reason === 'unknown_key'
      ? ['fleetMinHulls', 'fleetPopPerHull', 'fleetRungMult'].every((k) => line.includes(k))
      : line.includes(`${r?.range?.[0]}..${r?.range?.[1]}`);
    assert(r?.ok === false && r.reason === reason && extra(r) && names && stateOf() === before && stateLogCount() === logs,
      `T3: sbSet(${JSON.stringify(key)}, ${JSON.stringify(value)}) → ${reason}; komunikat „${line}”; stan bez zmian`);
  }
  const before = stateOf();
  const rk = tun('resetTuning', 'bogus');
  assert(rk?.ok === false && rk.reason === 'unknown_key' && stateOf() === before, 'T3: sbReset("bogus") → unknown_key, stan bez zmian');
  const ok = tun('setTuning', 'fleetPopPerHull', 41);
  assert(ok?.ok === true && stateOf() !== before, 'T3 (nie-jałowość odmów): poprawna zmiana tuż po odmowach ZMIENIA stan');
  tun('resetTuning');
}

// ── T4 — zapis i wczytanie przez prawdziwe serialize/restore ─────────────────────────────────────
console.log('\nT4 — zapis → wczytanie (SaveSystem._serializeCiv4x → JSON → gameState.restore)');
{
  tun('setTuning', 'fleetPopPerHull', 40);
  tun('setTuning', 'fleetRungMult', [1, 1, 1.1, 1.25]);
  const c4x = core.saveSystem._serializeCiv4x();
  const json = JSON.stringify({ civ4x: c4x });
  assert(json.includes('"strikesBackTuning"'), 'T4a: zapis gry niesie klucz `strikesBackTuning`');
  gameState.reset();                                          // nowa sesja
  assert(allDefault(), 'T4b (nie-jałowość wczytania): po resecie wartości domyślne — to wczytanie ma je przywrócić');
  const parsed = JSON.parse(json).civ4x;
  gameState.restore(parsed.gameState);                        // to samo wywołanie co GameScene (blok wczytania)
  const san = tun('sanitizeTuningAfterRestore');
  assert(san && same(san.ignored, []) && tun('getTuning', 'fleetPopPerHull') === 40
    && same(tun('getTuning', 'fleetRungMult'), [1, 1, 1.1, 1.25]),
    `T4c: po wczytaniu: fleetPopPerHull 40, fleetRungMult [1, 1, 1.1, 1.25] (pominięte: ${JSON.stringify(san?.ignored)})`);
  const marks = Object.fromEntries((tun('tuningRows') ?? []).map((x) => [x.klucz, x.zmiana]));
  assert(marks.fleetPopPerHull === '*' && marks.fleetRungMult === '*' && marks.fleetMinHulls === '', 'T4d: znaczniki zmian przeżywają zapis');
  gameState.restore({ notDeclaredKey: 1 });
  assert(gameState.get('notDeclaredKey') === undefined,
    'T4e (KONTROLA mechanizmu): `gameState.restore` wyrzuca klucz niezadeklarowany w `createDefaultState`');
  gameState.restore({ strikesBackTuning: { fleetPopPerHull: 44 } });
  assert(same(gameState.get('strikesBackTuning'), { fleetPopPerHull: 44 }),
    'T4f: `strikesBackTuning` przeżywa restore — klucz zadeklarowany (save v101 bez migracji)');
}

// ── T5 — fixture GATE-S4 bez klucza ────────────────────────────────────────────────────────────
console.log('\nT5 — fixture GATE-S4 (bez klucza) → wartości domyślne');
{
  const gs = FIXTURE.civ4x.gameState;
  assert(FIXTURE.version === 101 && !Object.prototype.hasOwnProperty.call(gs, 'strikesBackTuning'),
    'T5a (świadek): fixture v101 i bez klucza `strikesBackTuning`');
  tun('setTuning', 'fleetPopPerHull', 40);
  const pre = tun('getTuning', 'fleetPopPerHull');
  gameState.restore(JSON.parse(JSON.stringify(gs)));
  const san = tun('sanitizeTuningAfterRestore');
  assert(pre === 40 && san && same(san.ignored, []) && allDefault()
    && (tun('tuningRows') ?? []).length === (tun('tuningKeys') ?? []).length && (tun('tuningRows') ?? []).every((x) => x.zmiana === ''),
    'T5b: po wczytaniu fixture’u — wszystkie wartości domyślne, bez znaczników (przed wczytaniem: 40)');
}

// ── T6 — nieznany klucz i zła wartość w zapisie ────────────────────────────────────────────────
console.log('\nT6 — zapis z nieznanym kluczem i złą wartością');
{
  const gs = JSON.parse(JSON.stringify(FIXTURE.civ4x.gameState));
  gs.strikesBackTuning = { fleetPopPerHull: 48, bogusKey: 7, fleetMinHulls: 'x' };
  const logs0 = debugLog.query({ kind: 'sbTuning:storedValueIgnored' }).length;
  gameState.restore(gs);
  assert(same(gameState.get('strikesBackTuning'), { fleetPopPerHull: 48, bogusKey: 7, fleetMinHulls: 'x' }),
    'T6a: restore niesie mapę z zapisu razem z nieznanym kluczem i złą wartością (przed sprzątaniem)');
  const san = tun('sanitizeTuningAfterRestore');
  const entries = debugLog.query({ kind: 'sbTuning:storedValueIgnored' }).slice(logs0);
  assert(same(san?.ignored, [{ key: 'bogusKey', reason: 'unknown_key' }, { key: 'fleetMinHulls', reason: 'invalid_value' }]),
    `T6b: pominięte: ${JSON.stringify(san?.ignored)}`);
  assert(entries.length === 2 && same(entries.map((e) => e.data?.key).sort(), ['bogusKey', 'fleetMinHulls']),
    `T6c: dwa wpisy \`sbTuning:storedValueIgnored\` w DebugLog (${entries.length})`);
  assert(tun('getTuning', 'fleetPopPerHull') === 48 && tun('getTuning', 'fleetMinHulls') === 2
    && same(gameState.get('strikesBackTuning'), { fleetPopPerHull: 48 }),
    'T6d: poprawna wartość zostaje (48), zła wraca do domyślnej (2), mapa oczyszczona');
  tun('resetTuning');
}

// ── T7 — wpięcie w GameScene / DebugLog (pin źródłowy) ─────────────────────────────────────────
console.log('\nT7 — wpięcie: GameScene i DebugLog');
{
  const gsSrc = stripComments(read('scenes/GameScene.js'));
  assert(/import\s*\{[^}]*\bsanitizeTuningAfterRestore\b[^}]*\}\s*from\s*'\.\.\/utils\/StrikesBackTuning\.js'/.test(gsSrc),
    'T7a: GameScene importuje sprzątanie tabeli z StrikesBackTuning');
  assert(/sbTuning:\s*\(\)\s*=>/.test(gsSrc) && /sbSet:\s*\(key,\s*value\)\s*=>\s*consoleSetTuning\(key,\s*value\)/.test(gsSrc)
    && /sbReset:\s*\(key\)\s*=>\s*consoleResetTuning\(key\)/.test(gsSrc),
    'T7b: komendy konsoli `KOSMOS.debug.sbTuning / sbSet / sbReset` delegują do StrikesBackTuning');
  const orderOk = (s) => {
    const iRestore = s.indexOf('gameState.restore(c4x.gameState);');
    const iSan = s.indexOf('sanitizeTuningAfterRestore();');
    const iSync = s.indexOf('this.empireRegistry.syncToGalaxyData(window.KOSMOS.galaxyData);', iRestore);
    return iRestore > 0 && iSan > iRestore && iSync > iSan;
  };
  assert(orderOk(gsSrc), 'T7c: sprzątanie biegnie PO `gameState.restore(c4x.gameState)` w bloku wczytania');
  const mutated = gsSrc.replace('sanitizeTuningAfterRestore();', '').replace('if (c4x.gameState) gameState.restore(c4x.gameState);',
    'sanitizeTuningAfterRestore();\n      if (c4x.gameState) gameState.restore(c4x.gameState);');
  assert(!orderOk(mutated), 'T7d (KONTROLA PINU): sprzątanie PRZED restore — pin T7c to wykrywa');
  const dl = stripComments(read('core/DebugLog.js'));
  const tracked = dl.slice(dl.indexOf('const TRACKED_EVENTS = ['), dl.indexOf('];', dl.indexOf('const TRACKED_EVENTS = [')));
  assert(tracked.includes("'sbTuning:storedValueIgnored'"), 'T7e: `sbTuning:storedValueIgnored` w DebugLog.TRACKED_EVENTS');
}

// ── T8 — wyjście konsoli ───────────────────────────────────────────────────────────────────────
console.log('\nT8 — wyjście konsoli');
{
  tun('setTuning', 'fleetPopPerHull', 40);
  const t = capture(() => tun('printTuningTable'));
  const table = t.out.find(([k]) => k === 'table');
  const rows = table ? JSON.parse(table[1]) : [];
  const row = rows.find((x) => x.klucz === 'fleetPopPerHull');
  assert(rows.length === (tun('tuningKeys') ?? []).length && rows.length >= 3 && row?.domyslna === '32' && row?.biezaca === '40' && row?.zmiana === '*'
    && rows.find((x) => x.klucz === 'fleetRungMult')?.domyslna === '[1, 1, 1, 1.25]',
    `T8a: tabela: klucz, domyślna, bieżąca, znacznik (${JSON.stringify(row)})`);
  const s = capture(() => tun('consoleSetTuning', 'fleetPopPerHull', 50));
  assert(s.ret?.ok === true && s.out.some(([k, line]) => k === 'log' && line.includes('fleetPopPerHull') && line.includes('40 -> 50')),
    `T8b: sbSet wypisuje zmianę (${JSON.stringify(s.out)})`);
  const u = capture(() => tun('consoleSetTuning', 'nope', 1));
  assert(u.ret?.ok === false && u.out.some(([k, line]) => k === 'warn' && line.includes('fleetMinHulls, fleetPopPerHull, fleetRungMult')),
    `T8c: odmowa wypisuje listę kluczy (${JSON.stringify(u.out)})`);
  const z = capture(() => tun('consoleSetTuning', 'fleetMinHulls', 500));
  assert(z.ret?.ok === false && z.out.some(([k, line]) => k === 'warn' && line.includes('0..100')),
    `T8d: odmowa wypisuje zakres (${JSON.stringify(z.out)})`);
  const rs = capture(() => tun('consoleResetTuning'));
  assert(rs.ret?.ok === true && allDefault(), 'T8e: sbReset() przywraca całą tabelę');
}

// ── T9 — limit floty ───────────────────────────────────────────────────────────────────────────
console.log('\nT9 — limit floty');
{
  // świadkowie z fixture'u (odczyt statyczny = odczyt żywej gry `readEmpireGarrisonSnapshot`, sonda M1-żywa S1)
  const c4x = FIXTURE.civ4x;
  const byId = new Map(c4x.colonies.map((c) => [c.planetId, c]));
  const wit = {};
  for (const [eid, e] of Object.entries(c4x.gameState.empires)) {
    const owned = (e.colonies ?? []).map((id) => byId.get(id)).filter(Boolean);
    wit[eid] = {
      pop: owned.filter((c) => !c.isOutpost).reduce((s, c) => s + Math.floor(c.civ?.population ?? 0), 0),
      factoryLevels: owned.reduce((s, c) => s + (c.buildings ?? []).filter((b) => b.buildingId === 'factory').reduce((a, b) => a + (b.level ?? 1), 0), 0),
    };
  }
  assert(same(wit, { emp_001: { pop: 185, factoryLevels: 20 }, emp_002: { pop: 178, factoryLevels: 20 } }),
    `T9a (świadkowie): fixture — POP 185 / 178, fabryki 20 / 20 (${JSON.stringify(wit)})`);
  assert(fl('fleetLimit', wit.emp_001) === 6 && fl('fleetLimit', wit.emp_002) === 6,
    `T9b: limit floty w fixture = 6 dla obu imperiów (${fl('fleetLimit', wit.emp_001)} / ${fl('fleetLimit', wit.emp_002)})`);
  tun('setTuning', 'fleetPopPerHull', 16);
  assert(fl('fleetLimit', wit.emp_001) === 13, `T9c: fleetPopPerHull 16 z konsoli — limit od razu 13 (${fl('fleetLimit', wit.emp_001)})`);
  tun('resetTuning', 'fleetPopPerHull');
  assert(fl('fleetLimit', wit.emp_001) === 6, 'T9d: reset — limit od razu z powrotem 6');
  assert(fl('fleetLimit', { pop: 0, factoryLevels: 0 }) === 2 && fl('fleetLimit', { pop: 63, factoryLevels: 0 }) === 2
    && fl('fleetLimit', { pop: 95, factoryLevels: 0 }) === 2 && fl('fleetLimit', { pop: 96, factoryLevels: 0 }) === 3,
    'T9e: minimum 2 (POP 0 / 63 / 95 → 2), POP 96 → 3');
  tun('setTuning', 'fleetMinHulls', 3);
  assert(fl('fleetLimit', { pop: 0, factoryLevels: 0 }) === 3, 'T9f: minimum 3 z konsoli — POP 0 → 3 (klamra czyta tabelę)');
  tun('resetTuning', 'fleetMinHulls');
  assert([0, 6, 13, 14, 19].every((f) => fl('fleetLimit', { pop: 185, factoryLevels: f }) === 5)
    && fl('fleetLimit', { pop: 185, factoryLevels: 20 }) === 6,
    'T9g: mnożnik 1 poniżej 20 poziomów fabryk (POP 185 → 5), od 20 — ×1,25 (→ 6)');
  // to samo zaokrąglenie, szczebel i formuła co garnizon: parametry garnizonu ⇒ `garrisonLimit` na całej siatce
  const gTun = { fleetMinHulls: 2, fleetPopPerHull: 16, fleetRungMult: GARRISON_LADDER.map((r) => r.limitMult) };
  const grid = [];
  for (let pop = 0; pop <= 400; pop++) for (const f of [0, 5, 6, 13, 14, 19, 20, 24]) grid.push({ pop, factoryLevels: f });
  const mism = grid.filter((e) => fl('fleetLimit', e, gTun) !== garrisonLimit(e));
  assert(grid.length === 3208 && FL && mism.length === 0,
    `T9h: parametry garnizonu ⇒ ta sama liczba co garrisonLimit dla ${grid.length} punktów (rozjazdy: ${mism.length})`);
  const altCeil = (e) => Math.ceil(Math.max(2, Math.floor(e.pop / 16)) * garrisonTier(e).limitMult);
  assert(grid.some((e) => altCeil(e) !== garrisonLimit(e)), 'T9i (KONTROLA dyskryminacji): zaokrąglenie w górę dałoby inną liczbę — siatka rozróżnia');
}

// ── T10 — liczenie kadłubów ────────────────────────────────────────────────────────────────────
console.log('\nT10 — kadłuby liczone do limitu');
const WARSHIP = ['engine_ion', 'armor_standard', 'weapon_kinetic'];
const FREIGHT = ['engine_chemical', 'cargo_small'];
{
  restoreWorld();
  const [A, B] = K.empireRegistry.listAll().map((e) => e.id);
  const capA = K.directorProduction.capitalOf(A);
  const body = K.entityManager.get(capA.planetId);
  const mk = (owner, modules, service, state, extra = {}) => {
    const v = VesselNS.createVessel('hull_frigate', body.id, { modules: [...modules], systemId: body.systemId, x: body.x, y: body.y, serviceState: service });
    if (owner) { v.ownerEmpireId = owner; v.owner = owner; v.isEnemy = true; }
    v.position.state = state; v.position.dockedAt = state === 'docked' ? body.id : null;
    Object.assign(v, extra);
    core.vesselManager._vessels.set(v.id, v);
    return v;
  };
  const counted = [
    mk(A, WARSHIP, 'stored', 'docked'), mk(A, WARSHIP, 'active', 'docked'), mk(A, WARSHIP, 'mobilizing', 'docked'),
    mk(A, WARSHIP, 'active', 'orbiting'), mk(A, WARSHIP, 'active', 'in_transit'),
  ];
  const wreck = mk(A, WARSHIP, 'active', 'orbiting', { isWreck: true });
  const freighter = mk(A, FREIGHT, 'active', 'docked');
  const freighterStored = mk(A, FREIGHT, 'stored', 'docked');
  const other = mk(B, WARSHIP, 'active', 'docked');
  const player = mk(null, WARSHIP, 'active', 'docked');
  const pred = VesselNS.isFleetLimitHull;
  assert(typeof pred === 'function' && counted.every((v) => pred(v, A)),
    'T10a: rezerwa, mobilizacja, służba w doku, na orbicie i w locie — liczone (wspólny predykat `isFleetLimitHull`)');
  assert(typeof pred === 'function' && ![wreck, freighter, freighterStored, other, player].some((v) => pred(v, A)),
    'T10b: wrak, frachtowiec bez broni (służba i rezerwa), kadłub innego imperium i gracza — NIE liczone');
  wreck.isWreck = false;
  assert(typeof pred === 'function' && pred(wreck, A), 'T10c (nie-jałowość wykluczenia): ten sam kadłub bez flagi wraku jest liczony');
  wreck.isWreck = true;
  assert(!VesselNS.hasWeapons(freighter) && VesselNS.hasWeapons(counted[0]), 'T10d (KONTROLA): test uzbrojenia to istniejący `hasWeapons`');
  const pre = core.vesselManager.getAllVessels().filter((v) => v !== wreck && !v.isWreck && VesselNS.isEnemyVessel(v)
    && (v.ownerEmpireId ?? v.owner) === A && VesselNS.hasWeapons(v) && !counted.includes(v));
  const exp = { active: 3, stored: 1, mobilizing: 1, docked: 3, inSpace: 2 };
  for (const v of pre) {
    const svc = v.serviceState ?? 'active'; exp[svc] = (exp[svc] ?? 0) + 1;
    if (v.position?.state === 'docked') exp.docked++; else exp.inSpace++;
  }
  const s = fl('readEmpireFleetSnapshot', K, A);
  assert(s && s.armed === counted.length + pre.length
    && s.service.active === exp.active && s.service.stored === exp.stored && s.service.mobilizing === exp.mobilizing
    && s.position.docked === exp.docked && s.position.inSpace === exp.inSpace,
    `T10e: podział — służba ${JSON.stringify(s?.service)}, położenie ${JSON.stringify(s?.position)} (uzbrojonych imperium sprzed testu: ${pre.length})`);
  assert(s && s.room === Math.max(0, s.limit - s.armed), `T10f: miejsce dla puli = max(0, limit − kadłuby) (${s?.limit} − ${s?.armed} → ${s?.room})`);
  const g = readEmpireGarrisonSnapshot(K, A);
  assert(s && s.pop === g.pop && s.factoryLevels === g.factoryLevels && s.rung === garrisonTier(g).index && s.limit === fl('fleetLimit', g),
    `T10g: to samo źródło POP i szczebel co garnizon (POP ${s?.pop}, fabryki ${s?.factoryLevels}, szczebel ${s?.rung})`);
  tun('setTuning', 'fleetPopPerHull', 1);
  const s2 = fl('readEmpireFleetSnapshot', K, A);
  assert(s2 && s2.limit === fl('fleetLimit', { pop: g.pop, factoryLevels: g.factoryLevels }) && s2.limit !== s.limit,
    `T10h: zmiana z konsoli działa w odczycie żywego świata od razu (limit ${s?.limit} → ${s2?.limit})`);
  tun('resetTuning');
}

// ── T11 — nic poza odczytem konsoli nie czyta limitu ───────────────────────────────────────────
console.log('\nT11 — konsumenci limitu w grze (konsola i pula)');
{
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) { if (!p.includes(`${path.sep}testing`)) walk(p); } else if (/\.(m?js)$/.test(n)) files.push(p); } };
  walk(SRC);
  const importers = (mod) => files.filter((f) => new RegExp(`from\\s*'[^']*${mod}'`).test(stripComments(readFileSync(f, 'utf8'))))
    .map((f) => path.relative(SRC, f).replace(/\\/g, '/')).sort();
  assert(same(importers('FleetLimit\\.js'), ['scenes/GameScene.js', 'systems/FleetPoolSystem.js']),
    `T11a: FleetLimit importują wyłącznie GameScene (konsola) i FleetPoolSystem (pula): ${JSON.stringify(importers('FleetLimit\\.js'))}`);
  assert(same(importers('StrikesBackTuning\\.js'), ['scenes/GameScene.js', 'utils/FleetLimit.js']),
    `T11b: StrikesBackTuning importują GameScene i FleetLimit: ${JSON.stringify(importers('StrikesBackTuning\\.js'))}`);
  const users = files.filter((f) => /\bisFleetLimitHull\b/.test(stripComments(readFileSync(f, 'utf8')))).map((f) => path.relative(SRC, f).replace(/\\/g, '/')).sort();
  assert(same(users, ['entities/Vessel.js', 'utils/FleetLimit.js']), `T11c: predykat kadłuba używany tylko przez limit: ${JSON.stringify(users)}`);
}

// ── T12 — odczyt per imperium w konsoli ────────────────────────────────────────────────────────
console.log('\nT12 — odczyt per imperium');
{
  const t = capture(() => fl('printFleetLimits', K));
  const table = t.out.find(([k]) => k === 'table');
  const rows = table ? JSON.parse(table[1]) : [];
  const cols = ['imperium', 'pop', 'fabryki', 'szczebel', 'mnoznik', 'limit', 'uzbrojone', 'sluzba', 'rezerwa', 'mobilizacja', 'dok', 'przestrzen', 'miejsce',
    'zBakiem', 'pula', 'pulaDoda'];
  assert(rows.length === K.empireRegistry.listAll().length && rows.every((r) => same(Object.keys(r), cols)),
    `T12a: wiersz na imperium z kolumnami ${cols.join(', ')}`);
  const gsSrc = stripComments(read('scenes/GameScene.js'));
  assert(/sbTuning:\s*\(\)\s*=>\s*\(\{\s*tabela:\s*printTuningTable\(\),\s*flota:\s*printFleetLimits\(window\.KOSMOS\)\s*\}\)/.test(gsSrc),
    'T12b: `KOSMOS.debug.sbTuning()` drukuje tabelę strojenia i limit floty każdego imperium');
}

console.log(`\n[sb1_fleet_tuning_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
