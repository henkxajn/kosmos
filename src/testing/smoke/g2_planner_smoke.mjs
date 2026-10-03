// G2-3a — AI GARRISON: PLANER GARNIZONU (czyste funkcje + jedna tabela danych; ZERO wołających w grze).
//
// Decyzje (`docs/design/AI_GARRISON_PLAN.md` §1): D1 limit = max(2, floor(POP imperium / 16)) · D9 drabina
// sumy poziomów fabryk imperium (REWIZJA 2026-10-03: <6 / 6–13 / 14–19 / 20+) · D10 rozstawienie wokół kafla
// stolicy, jedna jednostka na heks · D11 podział między ciałami · D12 stolica = `DirectorProduction.capitalOf`.
// Odpowiedzi właściciela 2026-10-03: (b) skład na ciało · (c) floor PO klamrze 2 · (d) stolica nie do stania →
// kotwica regułą placówki · (e) złoże = `remaining > 0` · (f) brak heksu ⇒ jednostka nie powstaje, bez stosu.
// Planer NICZEGO nie tworzy — mobilizacja, zaczep wojny, flaga i usuwanie jednostek to G2-3b.
//
//   P0  moduły istnieją i eksportują API; drabina jest JEDNĄ tabelą danych (`GarrisonData.js`), a w kodzie
//       planera nie ma żadnej liczby z danych garnizonu poza 0 i 1 (tripwire źródłowy, zbiór liczb z danych).
//   P1  limit (D1 × D9) przy POP 0, 31, 32, 185 i na każdej granicy drabiny; zaokrąglenie floor; lustro reguły
//       gracza (`ColonyManager._getMaxGroundUnits`) WYKONANIEM dla POP 0–400; monotoniczność.
//   P2  szczebel przy sumie poziomów fabryk 5, 6, 13, 14, 19, 20, 45 (+ wejścia nieprawidłowe).
//   P3  skład 1, 3, 6, 11 jednostek na każdym szczeblu; `aa_platform` nigdy.
//   P4  podział (D11): limit nieparzysty i parzysty, remisy (kolejność w `empire.colonies`, nie id), więcej
//       ciał niż jednostek, więcej jednostek niż ciał, brak kandydatów, placówka bez Xe/Nt, pełne kolonie
//       przed placówkami, brak stolicy; suma przydziałów = limit.
//   P5  heksy (D10): nigdy na kaflu, na którym nie da się stanąć; nigdy dwie jednostki na jednym heksie; zajęte
//       heksy omijane; mniej miejsca niż jednostek ⇒ `missing`, BEZ stosu; placówka — wokół kafla z budynkiem
//       (pierwszy, na którym da się stanąć); stolica nie do stania — ta sama reguła (odp. (d)).
//   P6  plan dla żywego fixture'u GATE-S4 (gy 60) przypięty tabelą — przydział WYPROWADZONY RĘCZNIE z D1/D9/D11
//       i danych zapisu (nie przepisany z wyjścia planera); heksy stolic: niezmienniki + wartości złote.
//   P7  planer niczego nie tworzy i nie zmienia stanu (prawdziwy świat z Directorem): jednostki, `gameState`,
//       siatki, zero emisji `EventBus`; pin źródłowy — moduł nie woła tworzenia jednostek, emisji ani `window`.
//   P8  czytnik żywego świata: stolica = `capitalOf` (D12), suma fabryk = lustro `_recalcFactoryPoints`
//       i `factorySystem.totalPoints`, POP = Σ populacji, termin właściciela na liście `empire.colonies`;
//       odczyt w konsoli (`KOSMOS.debug.garrisonPlan`) — pin źródłowy w `GameScene`.
//
// ⚠ Moduły planera ładowane DYNAMICZNIE: przed G2-3a ich nie ma, a import statyczny wywróciłby cały plik i żaden
//   pin nie dostałby koloru (lekcja „pin musi degradować, nie przerywać”).
// ⚠ Każdy pin wykluczający ma ŚWIADKA (niepusty zbiór), inaczej przechodziłby jałowo.

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { HexGrid } from '../../map/HexGrid.js';
import { isStandableTile } from '../../data/GroundUnitData.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { colonyDevScore } from '../../utils/ColonyDevScore.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';

let GD = null, GP = null;
try { GD = await import('../../data/GarrisonData.js'); } catch { GD = null; }
try { GP = await import('../../utils/GarrisonPlanner.js'); } catch { GP = null; }

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
/** Wywołanie funkcji planera, które DEGRADUJE (brak modułu / wyjątek ⇒ `undefined`), nie przerywa przebiegu. */
const call = (name, ...args) => { try { return typeof GP?.[name] === 'function' ? GP[name](...args) : undefined; } catch (e) { return { __threw: e.message }; } };
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

const G = 'garrison_unit', A = 'rocket_artillery';

// ── P0 — moduły, API, jedna tabela danych ───────────────────────────────────────────────
{
  console.log('\nP0 — moduły, API i jedna tabela danych');
  const api = ['garrisonBaseLimit', 'garrisonTier', 'garrisonLimit', 'garrisonComposition', 'garrisonAllocation',
               'garrisonAnchor', 'garrisonHexes', 'planEmpireGarrison', 'readEmpireGarrisonSnapshot',
               'planAllEmpires', 'printGarrisonPlans'];
  const missing = api.filter(n => typeof GP?.[n] !== 'function');
  assert(!!GD && !!GP && missing.length === 0,
    `P0a: GarrisonData.js i GarrisonPlanner.js istnieją; planer eksportuje ${api.length} funkcji (brak: ${missing.join(', ') || '—'})`);
  const L = GD?.GARRISON_LADDER;
  const rows = Array.isArray(L) ? L.map(r => [r.minFactoryLevels, r.morale, r.artilleryEvery, r.limitMult]) : null;
  assert(JSON.stringify(rows) === JSON.stringify([[0, 30, 0, 1], [6, 50, 0, 1], [14, 100, 3, 1], [20, 100, 3, 1.25]]),
    `P0b: drabina D9 (rewizja 2026-10-03) = jedna tabela [próg, morale, co która artyleria, mnożnik limitu]: ` +
    `<6 → 30 · 6–13 → 50 · 14–19 → 100 + artyleria · 20+ → jw. ×1,25 (${JSON.stringify(rows)})`);
  assert(!!L && Object.isFrozen(L) && L.every(r => Object.isFrozen(r)),
    'P0c: tabela zamrożona (wiersze też) — liczby nie zmieniają się w biegu');
  assert(GD?.GARRISON_POP_PER_UNIT === 16 && GD?.GARRISON_MIN_UNITS === 2 && GD?.GARRISON_CAPITAL_SHARE_DIVISOR === 2 &&
         GD?.GARRISON_BASE_ARCHETYPE === G && GD?.GARRISON_ARTILLERY_ARCHETYPE === A &&
         JSON.stringify(GD?.GARRISON_OUTPOST_DEPOSITS) === '["Xe","Nt"]' && GD?.GARRISON_SPREAD_MAX_RADIUS === 5,
    'P0d: stałe D1/D7/D10/D11 w danych (16, 2, połowa do stolicy, garrison_unit, rocket_artillery, Xe/Nt, promień 5)');
  // P0e — zbiór liczb WYPROWADZONY Z DANYCH (drabina + stałe D1/D10/D11), bez 0 i 1; w kodzie planera
  //   (bez komentarzy) nie może stać żadna z nich. Kontrola pinu: te same liczby SĄ w źródle danych.
  const LIT = /(?<![\w.$])\d+(?:\.\d+)?(?![\w.])/g;
  const dataNums = new Set([
    ...(Array.isArray(L) ? L.flatMap(r => [r.minFactoryLevels, r.morale, r.artilleryEvery, r.limitMult]) : []),
    GD?.GARRISON_POP_PER_UNIT, GD?.GARRISON_MIN_UNITS, GD?.GARRISON_CAPITAL_SHARE_DIVISOR, GD?.GARRISON_SPREAD_MAX_RADIUS,
  ].filter(n => Number.isFinite(n) && n !== 0 && n !== 1).map(String));
  let src = '', dsrc = '';
  try { src = strip(readFileSync(new URL('../../utils/GarrisonPlanner.js', import.meta.url), 'utf8')); } catch { src = ''; }
  try { dsrc = strip(readFileSync(new URL('../../data/GarrisonData.js', import.meta.url), 'utf8')); } catch { dsrc = ''; }
  const nums = (src.match(LIT) ?? []).filter(n => dataNums.has(n));
  assert(src.length > 0 && dataNums.size >= 8 && nums.length === 0,
    `P0e: w kodzie planera (bez komentarzy) nie ma żadnej z ${dataNums.size} liczb danych garnizonu ` +
    `(${[...dataNums].join(', ')}) — żyją w GarrisonData.js (znalezione: ${nums.join(', ') || '—'})`);
  const inData = new Set(dsrc.match(LIT) ?? []);
  assert(dataNums.size > 0 && [...dataNums].every(n => inData.has(n)),
    'P0e kontrola: to samo wyrażenie znajduje każdą z tych liczb w GarrisonData.js — pin nie jest ślepy');
}

// ── P1 — limit ───────────────────────────────────────────────────────────────────────────
{
  console.log('\nP1 — limit (D1 × D9): POP 0, 31, 32, 185; granice drabiny; zaokrąglenie floor');
  const lim = (pop, factoryLevels) => call('garrisonLimit', { pop, factoryLevels });
  const base = [lim(0, 0), lim(31, 0), lim(32, 0), lim(185, 0)];
  assert(JSON.stringify(base) === '[2,2,2,11]',
    `P1a: POP 0 → 2, 31 → 2, 32 → 2, 185 → 11 przy szczeblu ×1 (${JSON.stringify(base)})`);
  const b185 = [5, 6, 13, 14, 19, 20, 24, 45].map(f => lim(185, f));
  assert(JSON.stringify(b185) === '[11,11,11,11,11,13,13,13]',
    `P1b: POP 185 na granicach drabiny 5/6/13/14/19/20 (+24, 45) → 11,11,11,11,11,13,13,13 — floor(11×1,25)=floor(13,75)=13 ` +
    `(nie 14), a powyżej 20 nie ma już szczebla (${JSON.stringify(b185)})`);
  const b0 = [19, 20, 45].map(f => lim(0, f));
  const b32 = [19, 20, 45].map(f => lim(32, f));
  assert(JSON.stringify(b0) === '[2,2,2]' && JSON.stringify(b32) === '[2,2,2]',
    `P1c: minimum D1 przy ×1,25 — POP 0 i 32 → 2,2,2: floor(2×1,25)=floor(2,5)=2 (nie 3); kolejność „klamra, potem mnożnik” ` +
    `i odwrotna dają przy ×1,25 to samo (${JSON.stringify(b0)} / ${JSON.stringify(b32)})`);
  // Lustro reguły gracza — WYKONANIEM, nie przez przepisanie wzoru.
  const mirrorBad = [];
  for (let pop = 0; pop <= 400; pop++) {
    const player = ColonyManager.prototype._getMaxGroundUnits.call({}, { civSystem: { population: pop } });
    const mine = call('garrisonBaseLimit', pop);
    if (player !== mine) mirrorBad.push(`${pop}:${player}/${mine}`);
  }
  assert(typeof GP?.garrisonBaseLimit === 'function' && mirrorBad.length === 0,
    `P1d: limit bazowy = reguła gracza ColonyManager._getMaxGroundUnits dla POP 0–400 (rozjazdy: ${mirrorBad.slice(0, 5).join(' ') || '—'})`);
  const ctl = ColonyManager.prototype._getMaxGroundUnits.call({}, { civSystem: { population: 185 } });
  assert(ctl === 11, `P1d kontrola: reguła gracza przy POP 185 = 11 (${ctl}) — lustro porównuje z czymś, co liczy`);
  let mono = typeof GP?.garrisonLimit === 'function', ints = mono;
  for (let pop = 0; pop <= 300 && mono; pop += 7) {
    let prev = -1;
    for (let f = 0; f <= 60; f++) {
      const v = lim(pop, f);
      if (!Number.isInteger(v)) ints = false;
      if (v < prev) mono = false;
      prev = v;
    }
  }
  assert(mono && ints, 'P1e: limit całkowity i niemalejący w sumie fabryk (przy każdym POP) — zaokrąglenie floor nie odwraca szczebli');
  const odd = [lim(-5, -1), lim(NaN, NaN), lim(15.9, 0)];
  assert(JSON.stringify(odd) === '[2,2,2]', `P1f: POP ujemny / NaN / ułamek < 16 → minimum 2 (${JSON.stringify(odd)})`);
}

// ── P2 — szczebel ────────────────────────────────────────────────────────────────────────
{
  console.log('\nP2 — szczebel przy sumie poziomów fabryk 5, 6, 13, 14, 19, 20, 45');
  const t = (f) => { const r = call('garrisonTier', { factoryLevels: f }); return r ? [r.index, r.morale, r.artilleryEvery, r.limitMult] : null; };
  const exp = { 5: [0, 30, 0, 1], 6: [1, 50, 0, 1], 13: [1, 50, 0, 1], 14: [2, 100, 3, 1], 19: [2, 100, 3, 1],
                20: [3, 100, 3, 1.25], 45: [3, 100, 3, 1.25] };
  for (const [f, e] of Object.entries(exp)) {
    assert(JSON.stringify(t(Number(f))) === JSON.stringify(e),
      `P2: suma fabryk ${f} → szczebel ${e[0]}, morale ${e[1]}, artyleria co ${e[2] || '—'}, ×${e[3]} (${JSON.stringify(t(Number(f)))})`);
  }
  const bad = [t(-3), t(NaN), t(undefined)];
  assert(bad.every(r => JSON.stringify(r) === '[0,30,0,1]'), `P2: ujemna / NaN / brak sumy → szczebel najniższy (${JSON.stringify(bad)})`);
}

// ── P3 — skład ───────────────────────────────────────────────────────────────────────────
{
  console.log('\nP3 — skład 1, 3, 6, 11 jednostek na każdym szczeblu');
  const tierAt = (f) => call('garrisonTier', { factoryLevels: f });
  const comp = (n, f) => call('garrisonComposition', n, tierAt(f));
  const allG = (n) => JSON.stringify(Array(n).fill(G));
  for (const f of [0, 6, 13]) {
    const ns = [1, 3, 6, 11];
    const r = ns.map(n => comp(n, f));
    assert(r.every((c, i) => JSON.stringify(c) === allG(ns[i])),
      `P3: szczebel sumy ${f} — wyłącznie garrison_unit dla 1, 3, 6, 11 ` +
      `(${r.map(c => Array.isArray(c) ? `${c.filter(x => x === G).length}/${c.length} G` : '—').join(', ')})`);
  }
  for (const f of [14, 20, 45]) {
    const c1 = comp(1, f), c3 = comp(3, f), c6 = comp(6, f), c11 = comp(11, f);
    const ok = JSON.stringify(c1) === JSON.stringify([G]) &&
               JSON.stringify(c3) === JSON.stringify([G, G, A]) &&
               JSON.stringify(c6) === JSON.stringify([G, G, A, G, G, A]) &&
               JSON.stringify(c11) === JSON.stringify([G, G, A, G, G, A, G, G, A, G, G]);
    assert(ok, `P3: szczebel sumy ${f} — co trzecia rocket_artillery: 1 → 0, 3 → 1, 6 → 2, 11 → 3 ` +
      `(${[c1, c3, c6, c11].map(c => Array.isArray(c) ? c.filter(x => x === A).length : '—').join(', ')})`);
  }
  const every = [0, 6, 14, 20, 45].flatMap(f => [0, 1, 2, 3, 4, 5, 6, 7, 11, 16].map(n => comp(n, f)));
  assert(every.length > 0 && every.every(Array.isArray) && every.flat().every(id => id === G || id === A) &&
         [0, 6, 14, 20, 45].every(f => [0, 1, 2, 3, 4, 5, 6, 7, 11, 16].every(n => comp(n, f)?.length === n)),
    'P3: długość = liczba jednostek; tylko garrison_unit i rocket_artillery — aa_platform nigdy (D9)');
}

// ── P4 — podział między ciałami (D11) ────────────────────────────────────────────────────
/** Migawka imperium do testów podziału. `bodies` w kolejności `empire.colonies`. */
const snap = (pop, bodies, { factoryLevels = 0, capitalId = 'cap' } = {}) =>
  ({ empireId: 'emp_t', pop, factoryLevels, capitalId, bodies: bodies.map((b, i) => ({ order: i, ...b })) });
const body = (planetId, devScore, { isOutpost = false, hasRequiredDeposit = false } = {}) =>
  ({ planetId, devScore, isOutpost, hasRequiredDeposit });
const alloc = (s) => call('garrisonAllocation', s);
const asMap = (a) => Object.fromEntries((a?.perBody ?? []).map(p => [p.planetId, p.count]));
const total = (a) => (a?.perBody ?? []).reduce((s, p) => s + p.count, 0);
{
  console.log('\nP4 — podział (D11): stolica ceil(limit/2), reszta po jednej, nadwyżka do stolicy');
  // (a) nieparzysty limit 5: stolica 3, reszta 2 — dwa najlepsze z trzech kandydatów
  const a = alloc(snap(80, [body('cap', 99), body('c1', 50), body('c2', 40), body('c3', 30)]));
  assert(a?.limit === 5 && JSON.stringify(asMap(a)) === JSON.stringify({ cap: 3, c1: 1, c2: 1 }) && total(a) === 5 &&
         JSON.stringify(a?.skipped) === '["c3"]',
    `P4a: limit nieparzysty 5 — stolica 3, c1 i c2 po 1, c3 pominięte (więcej ciał niż jednostek) (${JSON.stringify(asMap(a))}, pominięte ${JSON.stringify(a?.skipped)})`);
  // (b) parzysty limit 6: stolica 3, trzech kandydatów po 1
  const b = alloc(snap(96, [body('cap', 99), body('c1', 50), body('c2', 40), body('c3', 30)]));
  assert(b?.limit === 6 && JSON.stringify(asMap(b)) === JSON.stringify({ cap: 3, c1: 1, c2: 1, c3: 1 }) && total(b) === 6,
    `P4b: limit parzysty 6 — stolica 3, trzy kolonie po 1 (${JSON.stringify(asMap(b))})`);
  // (c) remis devScore — decyduje kolejność w empire.colonies (nie id)
  const c = alloc(snap(48, [body('cap', 99), body('zz', 20), body('aa', 20)]));
  const cSwap = alloc(snap(48, [body('cap', 99), body('aa', 20), body('zz', 20)]));
  assert(c?.limit === 3 && JSON.stringify(asMap(c)) === JSON.stringify({ cap: 2, zz: 1 }) &&
         JSON.stringify(asMap(cSwap)) === JSON.stringify({ cap: 2, aa: 1 }),
    `P4c: remis devScore — wygrywa wcześniejsze w empire.colonies (zz przed aa → zz; po zamianie → aa) (${JSON.stringify(asMap(c))} / ${JSON.stringify(asMap(cSwap))})`);
  // (d) więcej jednostek niż ciał: limit 11, dwóch kandydatów — nadwyżka 3 wraca do stolicy
  const d = alloc(snap(185, [body('cap', 99), body('c1', 50), body('c2', 40)]));
  assert(d?.limit === 11 && JSON.stringify(asMap(d)) === JSON.stringify({ cap: 9, c1: 1, c2: 1 }) && d?.surplus === 3 && total(d) === 11,
    `P4d: więcej jednostek niż ciał — stolica 6 + nadwyżka 3 = 9, c1 i c2 po 1 (${JSON.stringify(asMap(d))}, nadwyżka ${d?.surplus})`);
  // (e) brak kandydatów: wszystko do stolicy
  const e = alloc(snap(185, [body('cap', 99)]));
  assert(JSON.stringify(asMap(e)) === JSON.stringify({ cap: 11 }) && total(e) === 11,
    `P4e: brak kandydatów — cały limit 11 w stolicy (${JSON.stringify(asMap(e))})`);
  // (f) placówki: bez Xe/Nt wykluczona; z Xe/Nt kandydatem; pełna kolonia przed placówką mimo niższego devScore
  const f = alloc(snap(96, [body('cap', 99), body('outNo', 90, { isOutpost: true }), body('outXe', 80, { isOutpost: true, hasRequiredDeposit: true }),
                             body('full', 5)]));
  assert(f?.limit === 6 && JSON.stringify(asMap(f)) === JSON.stringify({ cap: 4, full: 1, outXe: 1 }) &&
         JSON.stringify(f?.excluded) === '["outNo"]',
    `P4f: placówka bez Xe/Nt wykluczona (outNo), z Xe kandydatem; pełna kolonia (dev 5) przed placówką (dev 80); nadwyżka 1 do stolicy (${JSON.stringify(asMap(f))}, wykluczone ${JSON.stringify(f?.excluded)})`);
  const f2 = alloc(snap(48, [body('cap', 99), body('outXe', 80, { isOutpost: true, hasRequiredDeposit: true }), body('full', 5)]));
  assert(JSON.stringify(asMap(f2)) === JSON.stringify({ cap: 2, full: 1 }),
    `P4f: jedno miejsce poza stolicą — dostaje je pełna kolonia, nie placówka z wyższym devScore (${JSON.stringify(asMap(f2))})`);
  // (g) brak stolicy — nic nie przydzielone, powód nazwany
  const g = alloc(snap(185, [body('c1', 50)], { capitalId: null }));
  assert(g?.limit === 11 && (g?.perBody?.length ?? -1) === 0 && g?.reason === 'no_capital',
    `P4g: brak stolicy — limit policzony (11), przydział pusty, powód no_capital (${JSON.stringify({ limit: g?.limit, n: g?.perBody?.length, reason: g?.reason })})`);
  // (h) stolica nie jest kandydatem dla samej siebie, a role są nazwane
  const roles = (b?.perBody ?? []).map(p => p.role);
  assert(roles[0] === 'capital' && roles.slice(1).every(r => r === 'colony') &&
         JSON.stringify((f?.perBody ?? []).map(p => p.role)) === '["capital","colony","outpost"]',
    `P4h: role w przydziale: capital / colony / outpost; stolica pierwsza (${JSON.stringify(roles)} / ${JSON.stringify((f?.perBody ?? []).map(p => p.role))})`);
}

// ── P5 — heksy (D10) ─────────────────────────────────────────────────────────────────────
/** Prostokątna siatka równin; `cap` = kafel stolicy (capitalBase). */
function plainGrid(w = 10, h = 8) { return new HexGrid(w, h); }
function centerTile(grid) {
  const all = grid.toArray();
  const cq = all.reduce((s, t) => s + t.q, 0) / all.length;
  const cr = all.reduce((s, t) => s + t.r, 0) / all.length;
  return all.reduce((b, t) => (Math.hypot(t.q - cq, t.r - cr) < Math.hypot(b.q - cq, b.r - cr) ? t : b), all[0]);
}
const key = (h) => `${h.q},${h.r}`;
function hexInvariants(grid, res, occupied = new Set()) {
  const hs = res?.hexes ?? [];
  const keys = hs.map(key);
  return {
    standable: hs.length > 0 && hs.every(h => isStandableTile(grid.get(h.q, h.r))),
    unique: new Set(keys).size === keys.length,
    freeOfOccupied: keys.every(k => !occupied.has(k)),
    inRadius: hs.every(h => HexGrid.distance(h.q, h.r, res.anchor.q, res.anchor.r) <= (GD?.GARRISON_SPREAD_MAX_RADIUS ?? 5)),
  };
}
{
  console.log('\nP5 — heksy (D10): da się stanąć, jeden na heks, zajęte omijane, brak miejsca = missing (bez stosu)');
  // (a) stolica na równinie, część sąsiadów to ocean, dwa heksy zajęte
  const grid = plainGrid();
  const cap = centerTile(grid);
  cap.capitalBase = true; cap.buildingId = 'colony_base';
  const ring1 = grid.ring(cap.q, cap.r, 1);
  ring1[0].type = 'ocean'; ring1[1].type = 'ocean';
  const occupied = new Set([key(ring1[2]), key(ring1[3])]);
  const r = call('garrisonHexes', { grid, isOutpost: false, occupied }, 6);
  const inv = hexInvariants(grid, r, occupied);
  assert(r?.hexes?.length === 6 && r?.missing === 0 && inv.standable && inv.unique && inv.freeOfOccupied && inv.inRadius,
    `P5a: 6 jednostek — 6 heksów, każdy da się stanąć, bez powtórzeń, z pominięciem 2 zajętych i 2 oceanicznych (${JSON.stringify(inv)}, missing ${r?.missing})`);
  assert(r?.hexes?.[0] && key(r.hexes[0]) === key(cap) && key(r.anchor) === key(cap),
    `P5a: pierwszy heks = kafel stolicy (kotwica), jak w spirali _findGroundUnitSpawn (${r?.hexes?.[0] ? key(r.hexes[0]) : '—'} vs ${key(cap)})`);
  const oceanKeys = new Set([key(ring1[0]), key(ring1[1])]);
  assert((r?.hexes ?? []).length > 0 && (r?.hexes ?? []).every(h => !oceanKeys.has(key(h))),
    'P5a: żaden heks na oceanie (świadek: dwa oceaniczne kafle w pierścieniu 1)');
  // (b) brak miejsca: wyspa 3 kafli w promieniu 5 — 5 jednostek ⇒ 3 heksy + missing 2, bez stosu
  const isl = plainGrid();
  const icap = centerTile(isl);
  for (const t of isl.toArray()) t.type = 'ocean';
  icap.type = 'plains'; icap.capitalBase = true; icap.buildingId = 'colony_base';
  const ir1 = isl.ring(icap.q, icap.r, 1);
  ir1[0].type = 'plains'; ir1[3].type = 'tundra';
  const ri = call('garrisonHexes', { grid: isl, isOutpost: false, occupied: new Set() }, 5);
  const iinv = hexInvariants(isl, ri);
  assert(ri?.hexes?.length === 3 && ri?.missing === 2 && iinv.standable && iinv.unique,
    `P5b: wyspa 3 kafli — 3 heksy, missing 2, BEZ stawiania dwóch na jednym (${ri?.hexes?.length} heksy, missing ${ri?.missing}, ${JSON.stringify(iinv)})`);
  // (c) stolica na oceanie (stary zapis, D17) — odp. właściciela (d): kotwica = kafel z budynkiem regułą placówki
  //     (pierwszy w kolejności siatki, na którym da się stanąć), NIE stolica. Dwa lądowe budynki: wcześniejszy
  //     w siatce DALEKO od stolicy i późniejszy tuż obok — reguła placówki bierze wcześniejszy (nie „najbliższy”).
  const og = plainGrid();
  const ocap = centerTile(og);
  ocap.type = 'ocean'; ocap.capitalBase = true; ocap.buildingId = 'colony_base';
  const otiles = og.toArray();
  const ocapIdx = otiles.indexOf(ocap);
  const bFar = otiles[0];                                     // pierwszy kafel siatki — daleko od stolicy
  const bNear = og.ring(ocap.q, ocap.r, 1).find(t => otiles.indexOf(t) > ocapIdx);   // sąsiad stolicy, później w siatce
  bFar.buildingId = 'mine'; bNear.buildingId = 'farm';
  const ro = call('garrisonHexes', { grid: og, isOutpost: false, occupied: new Set() }, 4);
  const oinv = hexInvariants(og, ro);
  const farDist = HexGrid.distance(bFar.q, bFar.r, ocap.q, ocap.r);
  assert(farDist >= 3 && !!bNear && HexGrid.distance(bNear.q, bNear.r, ocap.q, ocap.r) === 1,
    `świadek P5c: budynek wcześniejszy w siatce ${farDist} heksy od stolicy, późniejszy — sąsiad stolicy`);
  assert(key(ro?.anchor ?? {}) === key(bFar) && ro?.hexes?.length === 4 && key(ro.hexes[0]) === key(bFar) &&
         oinv.standable && oinv.unique && !(ro?.hexes ?? []).some(h => key(h) === key(ocap)),
    `P5c: stolica na oceanie — kotwica = pierwszy kafel z budynkiem, na którym da się stanąć (${key(bFar)}), ` +
    `nie stolica (${key(ocap)}) i nie najbliższy budynek (${key(bNear)}); 4 heksy, żaden na stolicy ` +
    `(planer: kotwica ${ro?.anchor ? key(ro.anchor) : '—'}, ${JSON.stringify(oinv)})`);
  // zapas zdegenerowany: stolica na oceanie jest JEDYNYM budynkiem — kotwica = ona, garnizon wokół niej na lądzie
  const dg = plainGrid();
  const dcap = centerTile(dg);
  dcap.type = 'ocean'; dcap.capitalBase = true; dcap.buildingId = 'colony_base';
  const rd = call('garrisonHexes', { grid: dg, isOutpost: false, occupied: new Set() }, 4);
  const dinv = hexInvariants(dg, rd);
  assert(rd?.hexes?.length === 4 && key(rd?.anchor ?? {}) === key(dcap) && dinv.standable && !(rd?.hexes ?? []).some(h => key(h) === key(dcap)),
    `P5c: zapas zdegenerowany — jedyny budynek to stolica na oceanie: kotwica = stolica, 4 heksy wokół, żaden na niej (${JSON.stringify(dinv)})`);
  // kontrola: stolica, na której DA SIĘ stanąć, zostaje kotwicą mimo budynku wcześniejszego w siatce
  const lg = plainGrid();
  const lcap = centerTile(lg);
  lcap.capitalBase = true; lcap.buildingId = 'colony_base';
  lg.toArray()[0].buildingId = 'mine';
  const rl = call('garrisonHexes', { grid: lg, isOutpost: false, occupied: new Set() }, 2);
  assert(key(rl?.anchor ?? {}) === key(lcap) && key(rl?.hexes?.[0] ?? {}) === key(lcap),
    `P5c kontrola: stolica lądowa — kotwica = stolica, nie wcześniejszy budynek siatki (${rl?.anchor ? key(rl.anchor) : '—'} vs ${key(lcap)})`);
  // (d) placówka: brak stolicy — kotwica = pierwszy kafel z budynkiem, na którym da się stanąć
  const pg = plainGrid();
  const tiles = pg.toArray();
  const bOcean = tiles[20], bLand = tiles[40];
  bOcean.type = 'ocean'; bOcean.buildingId = 'mine';
  bLand.buildingId = 'mine';
  const rp = call('garrisonHexes', { grid: pg, isOutpost: true, occupied: new Set() }, 1);
  assert(key(rp?.anchor ?? {}) === key(bLand) && rp?.hexes?.length === 1 && key(rp.hexes[0]) === key(bLand),
    `P5d: placówka — kotwica = pierwszy kafel z budynkiem, na którym da się stanąć (pominięty budynek na oceanie, Finding 343) (${rp?.anchor ? key(rp.anchor) : '—'} vs ${key(bLand)})`);
  const anc = call('garrisonAnchor', pg, true);
  assert(anc && key(anc) === key(bLand), `P5d: garrisonAnchor(placówka) zgodne (${anc ? key(anc) : '—'})`);
  // (e) zero jednostek ⇒ zero heksów; brak siatki ⇒ missing = liczba
  const z0 = call('garrisonHexes', { grid, isOutpost: false }, 0);
  const zn = call('garrisonHexes', { grid: null, isOutpost: false }, 3);
  assert(z0?.hexes?.length === 0 && z0?.missing === 0 && zn?.hexes?.length === 0 && zn?.missing === 3,
    `P5e: 0 jednostek → 0 heksów; brak siatki → missing 3 (${JSON.stringify({ z0: z0?.missing, zn: zn?.missing })})`);
}

// ── Fixture GATE-S4 (gy 60) — czytnik zapisu (lustro czytnika żywego świata) ──────────────
const FX = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/GATE-S4-fresh-gy60.save.json.gz', import.meta.url))).toString());
const fxBodies = new Map([...(FX.planets ?? []), ...(FX.moons ?? []), ...(FX.planetoids ?? [])].map(b => [b.id, b]));
const fxCols = new Map(FX.civ4x.colonies.map(c => [c.planetId, c]));
const XE_NT = ['Xe', 'Nt'];
/** Migawka imperium z ZAPISU — te same pola, które czytnik żywego świata bierze z silnika. */
function fixtureSnapshot(empireId) {
  const emp = FX.civ4x.gameState.empires[empireId];
  const recs = emp.colonies.map(pid => fxCols.get(pid)).filter(Boolean);
  const bodies = recs.map((c, i) => ({
    planetId: c.planetId, order: i, isOutpost: !!c.isOutpost,
    devScore: Math.floor(c.civ?.population ?? 0) + (c.buildings?.length ?? 0),
    hasRequiredDeposit: (fxBodies.get(c.planetId)?.deposits ?? []).some(d => XE_NT.includes(d.resourceId) && (d.remaining ?? 0) > 0),
  }));
  // D12 — lustro `capitalOf`: pierwsza pełna kolonia z magazynem w kolejności empire.colonies
  const capital = recs.find(c => !c.isOutpost && c.resources) ?? null;
  return {
    empireId,
    pop: recs.filter(c => !c.isOutpost).reduce((s, c) => s + Math.floor(c.civ?.population ?? 0), 0),
    factoryLevels: recs.reduce((s, c) => s + (c.buildings ?? []).filter(b => b.buildingId === 'factory').reduce((a, b) => a + (b.level ?? 1), 0), 0),
    capitalId: capital?.planetId ?? null,
    bodies,
  };
}
const fxGrid = (pid) => { const g = fxCols.get(pid)?.grid; return g ? HexGrid.restore(g) : null; };
const fxCtx = (pid) => ({ grid: fxGrid(pid), isOutpost: !!fxCols.get(pid)?.isOutpost, occupied: new Set() });

// ── P6 — plan dla fixture'u GATE-S4 ──────────────────────────────────────────────────────
{
  console.log('\nP6 — plan dla żywego fixture\'u GATE-S4 (gy 60)');
  const units = FX.civ4x.groundUnitManager?.units ?? [];
  const fsAgree = [...fxCols.values()].every(c => (c.buildings ?? []).filter(b => b.buildingId === 'factory').reduce((a, b) => a + (b.level ?? 1), 0) === (c.factorySystem?.totalPoints ?? 0));
  assert(FX.version === 101 && units.length === 0 && fsAgree,
    `świadek: zapis v101, 0 jednostek naziemnych; suma poziomów 'factory' z budynków = factorySystem.totalPoints w każdej kolonii (${fsAgree})`);
  // Tabela WYPROWADZONA RĘCZNIE z danych zapisu i D1/D9/D11 (wyprowadzenie poniżej; wejścia — świadkowie wyżej):
  //   emp_001: POP 185 → D1 11; fabryki 20 → szczebel 3 „20+” (morale 100, co trzecia artyleria, ×1,25) →
  //            limit floor(13,75) = 13; stolica entity_115 → ceil(13/2) = 7; reszta 6: pełne kolonie wg devScore
  //            malejąco (117, 118, 119 po 8 — remis wg kolejności; 116: 7), potem placówki z Xe/Nt (devScore 2, wg
  //            kolejności) → entity_208, entity_200; pominięte 403, 401, 490.
  //   emp_002: POP 178 → D1 11; fabryki 20 → szczebel 3 → limit 13; stolica entity_232 → 7; reszta 6 = pięć pełnych
  //            kolonii (devScore 8, wg kolejności 231, 234, 236, 233, 235) + pierwsza placówka entity_313;
  //            pominięte 312, 571, 566, 657.
  //   Skład stolicy (7 jednostek, artyleria co trzecia NA CIELE): G G A G G A G; ciała z jedną jednostką — G.
  //   (Przed rewizją D9: szczebel 1, morale 50, limit 11, stolice 6, bez artylerii, bez entity_200 / entity_313.)
  const EXPECTED = {
    emp_001: { pop: 185, factoryLevels: 20, tier: 3, morale: 100, limit: 13, capitalId: 'entity_115',
               perBody: [['entity_115', 7, 'capital'], ['entity_117', 1, 'colony'], ['entity_118', 1, 'colony'],
                         ['entity_119', 1, 'colony'], ['entity_116', 1, 'colony'], ['entity_208', 1, 'outpost'],
                         ['entity_200', 1, 'outpost']],
               skipped: ['entity_403', 'entity_401', 'entity_490'] },
    emp_002: { pop: 178, factoryLevels: 20, tier: 3, morale: 100, limit: 13, capitalId: 'entity_232',
               perBody: [['entity_232', 7, 'capital'], ['entity_231', 1, 'colony'], ['entity_234', 1, 'colony'],
                         ['entity_236', 1, 'colony'], ['entity_233', 1, 'colony'], ['entity_235', 1, 'colony'],
                         ['entity_313', 1, 'outpost']],
               skipped: ['entity_312', 'entity_571', 'entity_566', 'entity_657'] },
  };
  const CAPITAL_COMP = [G, G, A, G, G, A, G];
  for (const [eid, e] of Object.entries(EXPECTED)) {
    const s = fixtureSnapshot(eid);
    assert(s.pop === e.pop && s.factoryLevels === e.factoryLevels && s.capitalId === e.capitalId,
      `świadek ${eid}: POP ${s.pop}, suma fabryk ${s.factoryLevels}, stolica ${s.capitalId} (czytane z zapisu)`);
    const plan = call('planEmpireGarrison', s, fxCtx);
    const got = (plan?.perBody ?? []).map(p => [p.planetId, p.count, p.role]);
    assert(plan?.tier?.index === e.tier && plan?.tier?.morale === e.morale && plan?.limit === e.limit &&
           JSON.stringify(got) === JSON.stringify(e.perBody) && JSON.stringify(plan?.skipped) === JSON.stringify(e.skipped),
      `P6 ${eid}: szczebel ${e.tier} (morale ${e.morale}), limit ${e.limit}, przydział ${e.perBody.map(p => p[0].replace('entity_', '') + ':' + p[1]).join(' ')} ` +
      `(planer: ${got.map(p => p[0].replace('entity_', '') + ':' + p[1]).join(' ') || '—'}; pominięte ${JSON.stringify(plan?.skipped)})`);
    const comps = (plan?.perBody ?? []).map(p => p.composition);
    assert(comps.length === e.perBody.length &&
           JSON.stringify(comps[0]) === JSON.stringify(CAPITAL_COMP) &&
           comps.slice(1).every(c => JSON.stringify(c) === JSON.stringify([G])) &&
           (plan?.perBody ?? []).every(p => p.morale === e.morale),
      `P6 ${eid}: skład — stolica G G A G G A G (2× rocket_artillery), każde inne ciało jeden garrison_unit; morale ${e.morale} ` +
      `(planer: ${comps.map(c => Array.isArray(c) ? c.map(x => (x === A ? 'A' : 'G')).join('') : '—').join(' ')})`);
    const hx = (plan?.perBody ?? []).map(p => ({ p, grid: fxGrid(p.planetId) }));
    const okHex = hx.length > 0 && hx.every(({ p, grid }) => {
      const inv = hexInvariants(grid, p.hexes);
      return p.hexes?.missing === 0 && p.hexes?.hexes?.length === p.count && inv.standable && inv.unique && inv.inRadius;
    });
    assert(okHex, `P6 ${eid}: każde ciało ma tyle heksów, ile jednostek (missing 0), wszystkie da się stanąć, bez powtórzeń, w promieniu 5`);
  }
  // Heksy stolic — wartości ZŁOTE (spirala jest deterministyczna). Sprawdzone ręcznie sondą poza repo (kotwica
  //   regułą z odp. (d), potem `HexGrid.spiral` + `isStandableTile`, bez kodu planera): emp_001 — kotwica = stolica
  //   (−1,2), odległości 0,1,1,1,2,2,2 · emp_002 — stolica (−1,2) na OCEANIE, kotwica = pierwszy kafel z budynkiem,
  //   na którym da się stanąć: habitat (3,2), 4 heksy od stolicy (trzy wcześniejsze budynki siatki — launch_pad,
  //   shipyard, research_station — stoją na oceanie, Finding 343); odległości 0,1,1,1,1,1,2.
  //   (Przed odp. (d): kotwica emp_002 = stolica na oceanie, heksy −1,4 1,0 0,0 −2,5 −1,5 0,4.)
  const GOLD = {
    emp_001: '-1,2 -1,3 0,2 0,1 -2,4 -1,4 0,3',
    emp_002: '3,2 2,3 3,3 4,2 4,1 3,1 1,4',
  };
  for (const eid of Object.keys(GOLD)) {
    const plan = call('planEmpireGarrison', fixtureSnapshot(eid), fxCtx);
    const capHex = (plan?.perBody?.[0]?.hexes?.hexes ?? []).map(key).join(' ');
    assert(capHex === GOLD[eid], `P6 ${eid}: heksy stolicy = ${GOLD[eid]} (planer: ${capHex || '—'})`);
  }
  // Stolica emp_002 („Regulus c”) stoi na OCEANIE (zapis sprzed G2-K1) — odp. (d): kotwica = pierwszy kafel
  //   z budynkiem, na którym da się stanąć (wyprowadzony tu z siatki, nie z planera), żaden heks na stolicy.
  const p2 = call('planEmpireGarrison', fixtureSnapshot('emp_002'), fxCtx);
  const g2 = fxGrid('entity_232');
  const capT = g2?.toArray().find(t => t.capitalBase);
  const firstB = g2?.toArray().filter(t => t.buildingId).find(t => isStandableTile(t));
  const anc2 = p2?.perBody?.[0]?.hexes?.anchor;
  assert(capT?.type === 'ocean' && !!firstB && key(anc2 ?? {}) === key(firstB) && key(anc2 ?? {}) !== key(capT) &&
         !(p2?.perBody?.[0]?.hexes?.hexes ?? []).some(h => key(h) === key(capT)) && (p2?.perBody?.[0]?.hexes?.hexes?.length ?? 0) === 7,
    `P6 emp_002: stolica na oceanie (${capT?.type} ${capT ? key(capT) : '—'}) — kotwica regułą placówki = pierwszy kafel ` +
    `z budynkiem do stania (${firstB ? `${key(firstB)} ${firstB.type} ${firstB.buildingId}` : '—'}; planer: ${anc2 ? key(anc2) : '—'}), ` +
    `7 heksów, żaden na stolicy (odp. (d))`);
  // kontrola: stolica emp_001 jest LĄDOWA — kotwicą zostaje stolica, choć wcześniej w siatce stoi inny budynek
  const p1 = call('planEmpireGarrison', fixtureSnapshot('emp_001'), fxCtx);
  const g1 = fxGrid('entity_115');
  const cap1 = g1?.toArray().find(t => t.capitalBase);
  const firstB1 = g1?.toArray().filter(t => t.buildingId).find(t => isStandableTile(t));
  assert(isStandableTile(cap1) && !!firstB1 && key(firstB1) !== key(cap1) && key(p1?.perBody?.[0]?.hexes?.anchor ?? {}) === key(cap1),
    `P6 emp_001 kontrola: stolica lądowa (${cap1 ? `${key(cap1)} ${cap1.type}` : '—'}) zostaje kotwicą, nie pierwszy ` +
    `budynek siatki (${firstB1 ? key(firstB1) : '—'})`);
}

// ── P7 + P8 — prawdziwy świat z Directorem ────────────────────────────────────────────────
{
  console.log('\nP7 — planer niczego nie tworzy i nie zmienia stanu (prawdziwy świat z Directorem)');
  const { core, K } = bootWithDirector({ quiet: true });
  const empIds = (K.empireRegistry?.listAll?.() ?? []).map(e => e.id);
  const gridHash = () => JSON.stringify(core.colonyManager.getAllColonies().map(c => (c.grid?.toArray?.() ?? [])
    .map(t => `${t.q},${t.r},${t.type},${t.owner},${t.buildingId},${t.capitalBase},${t.occupyEmpireId}`)));
  const before = { units: K.groundUnitManager._units.size, gs: JSON.stringify(gameState.serialize?.() ?? gameState), grids: gridHash() };
  const realEmit = EventBus.emit;
  let emits = 0;
  EventBus.emit = function (...a) { emits++; return realEmit.apply(this, a); };
  const realTable = console.table, realLog = console.log;
  let printed = null;
  let ran = false;   // ŚWIADEK dla P7a–c: bez niego „zero emisji / zero jednostek” przechodzi, gdy planer nic nie robi
  try {
    console.table = (rows) => { printed = rows; };
    const plans = call('planAllEmpires', K);
    const rows = call('printGarrisonPlans', K);
    console.table = realTable;
    ran = Array.isArray(plans) && plans.length === empIds.length && empIds.length > 0 &&
          plans.every(p => (p?.perBody?.length ?? 0) > 0);
    assert(ran, `świadek: plan dla każdego imperium (${empIds.length}), każdy z niepustym przydziałem`);
    assert(Array.isArray(rows) && rows.length > 0 && Array.isArray(printed) && printed.length === rows.length,
      `P8: odczyt w konsoli (printGarrisonPlans) — tabela ${rows?.length ?? 0} wierszy, zwracana i drukowana`);
  } finally {
    EventBus.emit = realEmit;
    console.table = realTable;
    console.log = realLog;
  }
  const after = { units: K.groundUnitManager._units.size, gs: JSON.stringify(gameState.serialize?.() ?? gameState), grids: gridHash() };
  assert(ran && emits === 0, `P7a: zero emisji EventBus podczas planowania (${emits}; plan powstał: ${ran})`);
  assert(ran && before.units === after.units && before.units === 0,
    `P7b: liczba jednostek naziemnych bez zmian (${before.units} → ${after.units}) — planer niczego nie tworzy (plan powstał: ${ran})`);
  assert(ran && before.gs === after.gs && before.grids === after.grids,
    `P7c: gameState i wszystkie siatki kolonii bajt w bajt bez zmian (plan powstał: ${ran})`);
  let psrc = '';
  try { psrc = strip(readFileSync(new URL('../../utils/GarrisonPlanner.js', import.meta.url), 'utf8')); } catch { psrc = ''; }
  const forbidden = ['createUnit(', 'createAIUnit(', '.emit(', 'EventBus', 'gameState', 'window.', 'removeUnit(', '.set('];
  const hits = forbidden.filter(f => psrc.includes(f));
  assert(psrc.length > 0 && hits.length === 0,
    `P7d: pin źródłowy — planer nie tworzy jednostek, nie emituje, nie pisze stanu i nie sięga po window (znalezione: ${hits.join(', ') || '—'})`);

  console.log('\nP8 — czytnik żywego świata');
  const read = (eid) => call('readEmpireGarrisonSnapshot', K, eid);
  for (const eid of empIds) {
    const s = read(eid);
    const owned = (K.empireRegistry.getColoniesByEmpire(eid) ?? []).filter(c => c.ownerEmpireId === eid);
    const cap = K.directorProduction?.capitalOf?.(eid);
    const fpEngine = owned.reduce((acc, c) => acc + (c.factorySystem?.totalPoints ?? 0), 0);
    const fpActive = owned.reduce((acc, c) => acc + [...(c.buildingSystem?._active?.values?.() ?? [])]
      .filter(en => en.building?.id === 'factory').reduce((a, en) => a + (en.level ?? 1), 0), 0);
    const popSum = owned.filter(c => !c.isOutpost).reduce((acc, c) => acc + Math.floor(c.civSystem?.population ?? 0), 0);
    assert(!!cap && s?.capitalId === cap.planetId,
      `P8 ${eid}: stolica = DirectorProduction.capitalOf (D12) (${s?.capitalId} vs ${cap?.planetId})`);
    assert(fpActive > 0 && s?.factoryLevels === fpActive && s?.factoryLevels === fpEngine,
      `P8 ${eid}: suma fabryk = lustro _recalcFactoryPoints (${fpActive}) = Σ factorySystem.totalPoints (${fpEngine}) (czytnik ${s?.factoryLevels})`);
    assert(popSum > 0 && s?.pop === popSum, `P8 ${eid}: POP = Σ populacji pełnych kolonii imperium (${popSum}; czytnik ${s?.pop})`);
    const order = (s?.bodies ?? []).map(b => b.planetId);
    assert(order.length === owned.length && JSON.stringify(order) === JSON.stringify(owned.map(c => c.planetId)) &&
           (s?.bodies ?? []).every((b, i) => b.devScore === colonyDevScore(owned[i])),
      `P8 ${eid}: ciała w kolejności empire.colonies, devScore = colonyDevScore (${order.length} ciał)`);
  }
  // Termin właściciela: wpis na liście imperium, którego imperium NIE posiada (rodzina 283), nie trafia do planu.
  const eid = empIds[0];
  const emp = K.empireRegistry.get(eid);
  const stale = K.homePlanet?.id;
  const listBefore = [...emp.colonies];
  emp.colonies.push(stale);
  let sStale, listedDuring = false;
  try {
    listedDuring = (K.empireRegistry.getColoniesByEmpire(eid) ?? []).some(c => c.planetId === stale);
    sStale = read(eid);
  } finally { emp.colonies.length = 0; emp.colonies.push(...listBefore); }
  const listedAfter = (K.empireRegistry.getColoniesByEmpire(eid) ?? []).some(c => c.planetId === stale);
  assert(!!stale && listedDuring && !listedAfter && !!sStale && !(sStale.bodies ?? []).some(b => b.planetId === stale) &&
         sStale.capitalId !== stale,
    `P8: kolonia gracza dopisana do listy ${eid} (stan rodziny 283) NIE wchodzi do migawki ani na stolicę ` +
    `(świadek: getColoniesByEmpire ją zwraca w trakcie — ${listedDuring}; lista przywrócona — ${!listedAfter})`);
  // Odczyt w konsoli podpięty w GameScene (GameScene nie importuje się pod node — pin źródłowy).
  const gsrc = strip(readFileSync(new URL('../../scenes/GameScene.js', import.meta.url), 'utf8'));
  assert(/garrisonPlan\s*:\s*\(\s*\)\s*=>\s*printGarrisonPlans\(\s*window\.KOSMOS\s*\)/.test(gsrc) && /import\s*\{[^}]*printGarrisonPlans[^}]*\}\s*from\s*'\.\.\/utils\/GarrisonPlanner\.js'/.test(gsrc),
    'P8: KOSMOS.debug.garrisonPlan() = printGarrisonPlans(window.KOSMOS) w GameScene (tylko odczyt)');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
