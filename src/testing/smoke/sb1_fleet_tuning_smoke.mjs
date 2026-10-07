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
const stateLogCount = () => debugLog.query((e) => e.kind === 'state' && e.data?.path === 'strikesBackTuning').length;

// ── T1 — dane ──────────────────────────────────────────────────────────────────────────────────
console.log('\nT1 — tabela: klucze i wartości domyślne');
{
  const T = DATA?.SB_TUNING;
  assert(same(Object.keys(T ?? {}), ['fleetMinHulls', 'fleetPopPerHull', 'fleetRungMult']),
    `T1a: tabela S1 ma dokładnie klucze limitu floty (${JSON.stringify(Object.keys(T ?? {}))})`);
  assert(T?.fleetMinHulls?.default === 2 && T?.fleetPopPerHull?.default === 32 && same(T?.fleetRungMult?.default, [1, 1, 1, 1.25]),
    'T1b: wartości domyślne 2 / 32 / [1, 1, 1, 1.25] (SB3)');
  assert(GARRISON_LADDER.length === 4, 'T1c (KONTROLA): drabina garnizonu ma 4 szczeble');
  assert(T?.fleetRungMult?.length === GARRISON_LADDER.length
    && GARRISON_LADDER.every((row, i) => T.fleetRungMult.default[i] === row.limitMult),
    'T1d (tripwire): mnożniki szczebli floty = `limitMult` drabiny garnizonu, szczebel po szczeblu');
  assert(same(tun('readTuningValues'), { fleetMinHulls: 2, fleetPopPerHull: 32, fleetRungMult: [1, 1, 1, 1.25] }),
    'T1e: świeża gra — bieżące wartości = domyślne');
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
  assert(ra?.ok === true && same([...(ra.reset ?? [])].sort(), ['fleetPopPerHull', 'fleetRungMult'])
    && same(tun('readTuningValues'), { fleetMinHulls: 2, fleetPopPerHull: 32, fleetRungMult: [1, 1, 1, 1.25] }),
    `T2i: sbReset() — cała tabela domyślna (zdjęte: ${JSON.stringify(ra?.reset)})`);
}

// ── T3 — odmowy ────────────────────────────────────────────────────────────────────────────────
console.log('\nT3 — odmowy: lista kluczy albo zakres, stan bez zmian');
{
  tun('setTuning', 'fleetPopPerHull', 40);                    // stan niedomyślny — odmowa ma czego NIE zmienić
  const cases = [
    ['bogus', 1, 'unknown_key', (r) => same(r.validKeys, ['fleetMinHulls', 'fleetPopPerHull', 'fleetRungMult'])],
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
  assert(same(tun('readTuningValues'), { fleetMinHulls: 2, fleetPopPerHull: 32, fleetRungMult: [1, 1, 1, 1.25] }),
    'T4b (nie-jałowość wczytania): po resecie wartości domyślne — to wczytanie ma je przywrócić');
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
  assert(pre === 40 && san && same(san.ignored, [])
    && same(tun('readTuningValues'), { fleetMinHulls: 2, fleetPopPerHull: 32, fleetRungMult: [1, 1, 1, 1.25] })
    && (tun('tuningRows') ?? []).length === 3 && (tun('tuningRows') ?? []).every((x) => x.zmiana === ''),
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
  assert(rows.length === 3 && row?.domyslna === '32' && row?.biezaca === '40' && row?.zmiana === '*'
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
  assert(rs.ret?.ok === true && same(tun('readTuningValues'), { fleetMinHulls: 2, fleetPopPerHull: 32, fleetRungMult: [1, 1, 1, 1.25] }),
    'T8e: sbReset() przywraca całą tabelę');
}

console.log(`\n[sb1_fleet_tuning_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
