// KOSMOS — ARC COLONY SPHERE, krok CS-4b: surface.worker + SurfaceCache (LRU, priorytety, fail-soft).
// Plan: docs/design/COLONY_SPHERE_PLAN.md §1.I, §2, §3.5.
//
// C1  Worker = główny wątek BIT W BIT: (a) moduł workera w procesie (atrapa `self`, wiadomość przez structuredClone)
//     dla stałego zbioru ciał × LOD (body, planetoid, hero); (b) PRAWDZIWY wątek (node worker_threads + adapter
//     interfejsu Web Worker) przez SurfaceCache: mapy ze źródłem 'worker' = mapy cache'u bez workera ('main').
// C2  Graf importów workera = { surface.worker.js, SurfaceField.js } (moduły workera nie dziedziczą importmapy);
//     SurfaceField bez importów; w grafie brak document / window / localStorage / importScripts / three; URL workera
//     w SurfaceCache wskazuje istniejący plik i {type:'module'}. Świadek: ten sam skaner w grafie SurfaceCache widzi
//     EventBus / EntityManager / BodyArchetypes.
// C3  LRU: budżet NIGDY nie przekroczony (każdy krok, losowy stres), kolejność wyrzucania (z odświeżeniem przez get),
//     ten sam klucz → trafienie bez bake'u; inna SURFACE_FIELD_VERSION / waterCoverage / paleta / LOD → chybienie;
//     mapa większa niż budżet nie buforowana.
// C4  Priorytety: bohater wyprzedza czekające LOD-y; LOD-y w kolejności planeta > księżyc > planetoida (rozmiar);
//     zmiana układu: czekające LOD-y starego układu → null, wynik w locie starego układu NIE trafia do cache, bohater
//     przeżywa; `surface:ready` po wstawieniu (nie dla porzuconych).
// C5  Fail-soft: fabryka rzuca / błąd workera w trakcie zadania / zła wersja pola / worker milczy / błąd bake'u w
//     workerze / brak Worker API pod node → JEDNO ostrzeżenie, wynik z głównego wątku (bit-identyczny), zero wyjątków;
//     wyjątek w słuchaczu `surface:ready` nie psuje cache'u.
// C6  Bez podpięcia: SurfaceCache importują tylko GameScene (konstrukcja + alias) i src/debug/; nikt poza debug nie woła
//     request / prefetchSystem; SurfaceCache bierze z SurfaceField tylko bake (bez evalAt / classify — teren rozgrywki
//     nie idzie przez worker); worker wskazuje tylko SurfaceCache.
// C7  prefetchSystem kolejkuje LOD wszystkich ciał z powierzchnią danego układu (gaz / inny układ pominięte);
//     pomocniki konsoli: csCache w helpers, alias w GameScene, csSurfaceAll idzie przez cache.

import '../headless/env.js';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker as NodeWorker } from 'node:worker_threads';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
let pass = 0, fail = 0;
function assert(c, msg) { if (c) { pass++; console.log('  ✅ ' + msg); } else { fail++; console.log('  ❌ ' + msg); } }
const read = (rel) => { try { return readFileSync(path.join(REPO, rel), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const flush = (n = 1) => new Promise(r => { const T = globalThis.__origSetTimeout ?? setTimeout; let k = n; const step = () => (--k <= 0 ? r() : T(step, 0)); T(step, 0); });

let SF = {}, DA = {}, SC = {};
try { SF = await import('../../utils/SurfaceField.js'); } catch { SF = {}; }
try { DA = await import('../../data/BodyArchetypes.js'); } catch { DA = {}; }
try { SC = await import('../../systems/SurfaceCache.js'); } catch (e) { SC = { __err: String(e?.message ?? e) }; }
const BY = DA.ARCHETYPE_BY_ID ?? {};
const Cache = SC.SurfaceCache;
assert(typeof Cache === 'function' && typeof SC.surfaceKeyOf === 'function',
  `SurfaceCache eksportuje klasę SurfaceCache + surfaceKeyOf${SC.__err ? ' — ' + SC.__err : ''}`);
const HERO = SC.SURFACE_PRIORITY?.HERO ?? 300;
// env.js odracza setTimeout(…, 0) do ticku Tickera → bake głównego wątku planujemy prawdziwym timerem node.
const REAL_T0 = globalThis.__origSetTimeout ?? setTimeout;
const SCHED = (fn) => REAL_T0(fn, 0);
const _Cache = SC.SurfaceCache;
const CacheT = _Cache ? class extends _Cache { constructor(o = {}) { super({ schedule: SCHED, ...o }); } } : undefined;

// Ciała testowe (tylko pola czytane przez SurfaceCache).
let nid = 0;
function body(arch, seed, extra = {}) {
  const fam = BY[arch]?.family;
  const type = fam === 'planetoid' ? 'planetoid' : (fam === 'moon' ? 'moon' : 'planet');
  return { id: `t${++nid}`, type, bodyArchetype: arch, surfaceSeed: seed, systemId: 'A', visualRadius: 3,
    waterCoverage: arch === 'terran' ? 0.62 : null, planetoidType: type === 'planetoid' ? 'metallic' : null, ...extra };
}
const mainBytes = (b, lod) => {
  const [w, h] = SF.LOD_SIZES[lod];
  return SF.bakeEquirect(b.surfaceSeed, BY[b.bodyArchetype], SC.surfaceParamsOf(b), w, h);
};
const same = (a, b) => !!a && !!b && a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
const bus = () => { const L = {}; return { L, on(e, f) { (L[e] ??= []).push(f); }, off(e, f) { L[e] = (L[e] ?? []).filter(x => x !== f); }, emit(e, d) { for (const f of (L[e] ?? [])) f(d); } }; };
// Obietnica albo 'TIMEOUT' po ms (mutacja, która gubi zadanie, ma dać FAIL, nie zawiesić keepera). Timer NIE unref:
// zgubiona obietnica bez innych zadań w pętli kończyłaby proces kodem 13 zamiast FAIL; koniec keepera = process.exit.
const within = (p, ms = 4000) => Promise.race([p, new Promise(r => { (globalThis.__origSetTimeout ?? setTimeout)(() => r('TIMEOUT'), ms); })]);
const quiet = () => { const w = []; return { w, fn: (...a) => w.push(a.join(' ')) }; };

const SET = [
  [body('terran', 11), 'body'], [body('desert', 0x9e3779b9), 'body'], [body('icy_cracked', 7), 'body'],
  [body('volcanic_moon', 123456789), 'body'], [body('planetoid', 5), 'planetoid'], [body('planetoid_icy', 77), 'planetoid'],
  [body('terran', 4242), 'hero'],
];

// ── C1 Worker = główny wątek ────────────────────────────────────────────────────────────────────────────────────
console.log('\nC1 worker = główny wątek (bit w bit)');
const WORKER_FILE = path.join(REPO, 'src/workers/surface.worker.js');
const WORKER_URL = pathToFileURL(WORKER_FILE).href;
try {
  const posted = [];
  const prevSelf = globalThis.self;
  globalThis.self = { postMessage: (m, t) => posted.push({ m, t }), onmessage: null };
  await import(WORKER_URL + '?inproc');
  const shim = globalThis.self;   // moduł woła globalne `self` w czasie obsługi — atrapa zostaje do końca C1a
  assert(posted[0]?.m?.type === 'ready' && posted[0].m.version === SF.SURFACE_FIELD_VERSION, 'worker: na starcie { type:ready, version = SURFACE_FIELD_VERSION }');
  let okN = 0, transferred = 0;
  for (const [b, lod] of SET) {
    const [w, h] = SF.LOD_SIZES[lod];
    const a = BY[b.bodyArchetype];
    const msg = structuredClone({ type: 'bake', jobId: okN + 1, seed: b.surfaceSeed >>> 0,
      arch: { id: a.id, family: a.family, field: a.field ?? null, biomes: a.biomes ?? [] }, params: SC.surfaceParamsOf(b), w, h });
    posted.length = 0;
    shim.onmessage({ data: msg });
    const r = posted[0];
    if (r?.t?.[0] === r?.m?.buffer) transferred++;
    if (r?.m?.type === 'baked' && r.m.jobId === msg.jobId && same(new Uint8Array(r.m.buffer), mainBytes(b, lod))) okN++;
  }
  assert(okN === SET.length, `moduł workera (w procesie, structuredClone): ${okN}/${SET.length} map bit w bit = bakeEquirect głównego wątku (body / planetoid / hero)`);
  assert(transferred === SET.length, `bufor wyniku PRZEKAZANY (lista transferu = buffer): ${transferred}/${SET.length}`);
  posted.length = 0;
  shim.onmessage({ data: { type: 'bake', jobId: 99, seed: 1, arch: null, params: null, w: -1, h: 2 } });
  assert(posted[0]?.m?.type === 'error' && posted[0].m.jobId === 99, 'błędne zadanie → { type:error, jobId } (worker nie pada)');
  globalThis.self = prevSelf;
} catch (e) { assert(false, `C1a rzuciło: ${e?.message ?? e}`); }

// Adapter: node worker_threads → interfejs Web Worker (onmessage / onerror / postMessage / terminate).
const BOOT = `const { parentPort, workerData } = require('node:worker_threads');
globalThis.self = { postMessage: (m, t) => parentPort.postMessage(m, t), onmessage: null };
parentPort.on('message', (data) => { if (self.onmessage) self.onmessage({ data }); });
import(workerData.url).catch((e) => { throw e; });`;
function nodeWorkerFactory(url = WORKER_URL) {
  return () => {
    const w = new NodeWorker(BOOT, { eval: true, workerData: { url } });
    const ad = { onmessage: null, onerror: null, onmessageerror: null,
      postMessage: (m) => w.postMessage(m), terminate: () => { w.terminate(); } };
    w.on('message', (d) => ad.onmessage?.({ data: d }));
    w.on('error', (e) => ad.onerror?.({ message: e?.message, preventDefault() {} }));
    return ad;
  };
}
try {
  const real = new CacheT({ workerFactory: nodeWorkerFactory(), eventBus: bus(), activeSystemId: () => 'A', warn: quiet().fn });
  const ref = new CacheT({ workerFactory: null, eventBus: bus(), activeSystemId: () => 'A' });
  const a = await within(Promise.all(SET.map(([b, lod]) => real.request(b, lod, lod === 'hero' ? HERO : 150))), 20000);
  const r = await within(Promise.all(SET.map(([b, lod]) => ref.request(b, lod, lod === 'hero' ? HERO : 150))), 20000);
  if (!Array.isArray(a) || !Array.isArray(r)) throw new Error(`timeout (worker ${a}, main ${r})`);
  const nW = a.filter(m => m?.source === 'worker').length, nM = r.filter(m => m?.source === 'main').length;
  const eq = a.filter((m, i) => same(m?.data, r[i]?.data)).length;
  assert(nW === SET.length && nM === SET.length, `prawdziwy wątek: ${nW}/${SET.length} map ze źródła 'worker', ${nM}/${SET.length} z 'main' (bez workera)`);
  assert(eq === SET.length, `prawdziwy wątek przez SurfaceCache: ${eq}/${SET.length} map bit w bit = fallback głównego wątku`);
  const s = real.snapshot();
  assert(s.workerAlive === true && s.mode === 'worker' && (s.workerMs.body?.n ?? 0) === 4 && (s.workerMs.hero?.n ?? 0) === 1,
    `snapshot: worker żyje, średnie ms per LOD (body ${s.workerMs.body?.n}, planetoid ${s.workerMs.planetoid?.n}, hero ${s.workerMs.hero?.n})`);
  real.dispose(); ref.dispose();
} catch (e) { assert(false, `C1b rzuciło: ${e?.message ?? e}`); }

// ── C2 Graf importów workera ────────────────────────────────────────────────────────────────────────────────────
console.log('\nC2 graf importów workera');
function importGraph(startRel) {
  const seen = new Set(); const stack = [startRel];
  while (stack.length) {
    const rel = stack.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const src = strip(read(rel));
    const specs = [...src.matchAll(/(?:^|[\s;])import\s+(?:[\s\S]*?\sfrom\s+)?['"]([^'"]+)['"]/g), ...src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g),
      ...src.matchAll(/\bexport\s+[^;]*?\sfrom\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
    for (const sp of specs) {
      if (!sp.startsWith('.')) { seen.add('BARE:' + sp); continue; }
      stack.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), sp)));
    }
  }
  return seen;
}
const wg = importGraph('src/workers/surface.worker.js');
assert(existsSync(WORKER_FILE) && wg.size === 2 && wg.has('src/workers/surface.worker.js') && wg.has('src/utils/SurfaceField.js'),
  `graf workera = { surface.worker.js, SurfaceField.js } (${[...wg].join(', ')})`);
const wgSrc = [...wg].filter(f => !f.startsWith('BARE:')).map(f => strip(read(f))).join('\n');
const banned = ['document', 'window', 'localStorage', 'importScripts', 'THREE', 'GAME_CONFIG', 'EventBus'].filter(id => new RegExp(`\\b${id}\\b`).test(wgSrc));
assert(wgSrc.length > 0 && wg.has('src/utils/SurfaceField.js') && banned.length === 0, `graf workera (niepusty — świadek) bez document / window / localStorage / importScripts / THREE / GAME_CONFIG / EventBus${banned.length ? ' — ' + banned.join(', ') : ''}`);
const cg = importGraph('src/systems/SurfaceCache.js');
assert(cg.has('src/core/EventBus.js') && cg.has('src/core/EntityManager.js') && cg.has('src/data/BodyArchetypes.js'),
  `świadek: skaner w grafie SurfaceCache widzi EventBus / EntityManager / BodyArchetypes (${cg.size} modułów)`);
const scSrc = strip(read('src/systems/SurfaceCache.js'));
const urlM = scSrc.match(/new URL\(\s*'([^']+)'\s*,\s*import\.meta\.url\s*\)\s*,\s*\{\s*type:\s*'module'\s*\}/);
assert(!!urlM && path.posix.normalize(path.posix.join('src/systems', urlM[1])) === 'src/workers/surface.worker.js',
  `SurfaceCache: new Worker(new URL('${urlM?.[1]}', import.meta.url), {type:'module'}) → src/workers/surface.worker.js`);

// ── C3 LRU ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nC3 LRU wg budżetu');
try {
  const PB = 128 * 64 * 4;   // 32 KiB planetoida
  const c = new CacheT({ workerFactory: null, eventBus: bus(), activeSystemId: () => 'A', budgetBytes: 3 * PB });
  const P = [1, 2, 3, 4, 5].map(i => body('planetoid', 1000 + i));
  const k = (b) => SC.surfaceKeyOf(b, 'planetoid');
  let over = 0;
  for (let i = 0; i < 3; i++) { await within(c.request(P[i], 'planetoid')); if (c.snapshot().bytesUsed > c.budgetBytes) over++; }
  assert(c.get(P[0], 'planetoid') !== null, 'get(P1) trafia (i odświeża P1 w LRU)');
  await within(c.request(P[3], 'planetoid')); if (c.snapshot().bytesUsed > c.budgetBytes) over++;
  assert(JSON.stringify(c.keys()) === JSON.stringify([k(P[2]), k(P[0]), k(P[3])]), 'po P4: wyrzucony P2 (najstarszy po odświeżeniu P1), kolejność LRU P3, P1, P4');
  await within(c.request(P[4], 'planetoid')); if (c.snapshot().bytesUsed > c.budgetBytes) over++;
  assert(JSON.stringify(c.keys()) === JSON.stringify([k(P[0]), k(P[3]), k(P[4])]) && c.snapshot().evictions === 2,
    'po P5: wyrzucony P3, evictions = 2');
  assert(over === 0 && c.snapshot().bytesUsed === 3 * PB, `budżet nieprzekroczony w żadnym kroku (${c.snapshot().bytesUsed} / ${c.budgetBytes} B)`);
  const bakedBefore = c.stats.baked.main.planetoid.n, hitsBefore = c.stats.hits;
  const m1 = c.get(P[4], 'planetoid');
  const m2 = await within(c.request(P[4], 'planetoid'));
  assert(m2 === m1 && c.stats.baked.main.planetoid.n === bakedBefore && c.stats.hits === hitsBefore + 1,
    'ten sam klucz → trafienie (ten sam obiekt mapy, bez nowego bake\'u, hits +1)');
  const v = new CacheT({ workerFactory: null, eventBus: bus(), activeSystemId: () => 'A', fieldVersion: (SF.SURFACE_FIELD_VERSION ?? 2) + 1 });
  const t = body('terran', 31);
  assert(SC.surfaceKeyOf(t, 'body', 2) !== SC.surfaceKeyOf(t, 'body', 3), 'klucz zawiera SURFACE_FIELD_VERSION (v2 ≠ v3)');
  await within(v.request(t, 'body'));
  v._version = SF.SURFACE_FIELD_VERSION;                // ten sam cache, inna wersja pola → stare wpisy niewidoczne
  assert(v.get(t, 'body') === null, 'zmieniona SURFACE_FIELD_VERSION → chybienie (stary wpis niewidoczny)');
  v._version = (SF.SURFACE_FIELD_VERSION ?? 2) + 1;
  assert(v.get(t, 'body') !== null, 'kontrola: przywrócona wersja → trafienie');
  assert(v.get({ ...t, waterCoverage: 0.5 }, 'body') === null && c.get({ ...P[4], planetoidType: 'carbonaceous' }, 'planetoid') === null
    && c.get(P[4], 'planetoid') !== null
    && v.get(t, 'hero') === null && v.get({ ...t, surfaceSeed: 32 }, 'body') === null && v.get({ ...t, bodyArchetype: 'desert' }, 'body') === null,
    'inne waterCoverage / paleta / LOD / ziarno / archetyp → chybienie');
  v.dispose();
  const tiny = new CacheT({ workerFactory: null, eventBus: bus(), activeSystemId: () => 'A', budgetBytes: PB });
  const big = await within(tiny.request(body('terran', 9), 'body'));
  assert(big?.data?.length === 256 * 128 * 4 && tiny.snapshot().entries === 0 && tiny.snapshot().oversize === 1 && tiny.snapshot().bytesUsed === 0,
    'mapa większa niż cały budżet: zwrócona wołającemu, NIE buforowana (oversize 1, 0 B)');
  // Stres: losowe zamówienia, budżet ~ 10 map body.
  const st = new CacheT({ workerFactory: null, eventBus: bus(), activeSystemId: () => 'A', budgetBytes: 6 * 131072 + 2 * PB });
  let rs = 12345; const rnd = () => ((rs = (Math.imul(rs, 1103515245) + 12345) >>> 0) / 4294967296);
  const pool = [...Array(12)].map((_, i) => body(['terran', 'desert', 'barren', 'planetoid'][i % 4], 500 + i));
  let worst = 0, sumOk = true;
  for (let i = 0; i < 160; i++) {
    const b = pool[(rnd() * pool.length) | 0];
    const lod = b.type === 'planetoid' ? 'planetoid' : (rnd() < 0.1 ? 'hero' : 'body');
    await within(st.request(b, lod, lod === 'hero' ? HERO : 150));
    const s = st.snapshot();
    worst = Math.max(worst, s.bytesUsed);
    const sum = [...st._entries.values()].reduce((x, e) => x + e.bytes, 0);
    if (sum !== s.bytesUsed) sumOk = false;
  }
  assert(worst <= st.budgetBytes && sumOk && st.snapshot().evictions > 0,
    `stres 160 zamówień (z mapami bohatera 2 MiB > budżet): max ${worst} ≤ ${st.budgetBytes} B, suma wpisów = bytesUsed, evictions ${st.snapshot().evictions}`);
  c.dispose(); tiny.dispose(); st.dispose();
} catch (e) { assert(false, `C3 rzuciło: ${e?.message ?? e}`); }

// ── C4 Priorytety i zmiana układu ───────────────────────────────────────────────────────────────────────────────
console.log('\nC4 priorytety + zmiana układu');
class FakeWorker {
  constructor() { this.posted = []; this.onmessage = null; this.onerror = null; this.terminated = false; }
  postMessage(m) { this.posted.push(m); }
  terminate() { this.terminated = true; }
  ready(v = SF.SURFACE_FIELD_VERSION) { this.onmessage?.({ data: { type: 'ready', version: v } }); }
  reply(job) { const px = SF.bakeEquirect(job.seed, BY[job.arch.id], job.params, job.w, job.h); this.onmessage?.({ data: { type: 'baked', jobId: job.jobId, w: job.w, h: job.h, ms: 1, buffer: px.buffer } }); }
  replyLast() { this.reply(this.posted[this.posted.length - 1]); }
}
try {
  let fw = null;
  const B = bus();
  let active = 'A';
  const ready = [];
  B.on('surface:ready', (d) => ready.push(d));
  const c = new CacheT({ workerFactory: () => (fw = new FakeWorker()), eventBus: B, activeSystemId: () => active });
  const pl = body('planetoid', 1, { visualRadius: 2 }), moon = body('icy_cracked', 2, { visualRadius: 2 });
  const big = body('desert', 3, { visualRadius: 9 }), small = body('barren', 4, { visualRadius: 1 });
  const order = [pl, moon, small, big];
  const proms = order.map(b => c.request(b, SC.lodOf(b), SC.surfaceSystemPriority(b)));
  assert(fw && fw.posted.length === 0 && c.snapshot().mode === 'starting', 'przed ready nic nie wysłane (worker startuje)');
  fw.ready();
  assert(fw.posted.length === 1 && fw.posted[0].arch.id === 'desert', `po ready w locie najważniejszy LOD: duża planeta (${fw.posted[0]?.arch?.id})`);
  const hb = body('terran', 9);
  const hp = c.request(hb, 'hero', HERO);
  fw.replyLast();
  assert(fw.posted.length === 2 && fw.posted[1].w === 1024 && fw.posted[1].arch.id === 'terran', 'bohater WYPRZEDZA czekające LOD-y (następny wysłany = hero 1024×512)');
  for (let i = 0; i < 10 && c.snapshot().inFlight; i++) fw.replyLast();   // odpowiedź → następne zadanie wysłane od razu
  const ids = fw.posted.slice(2).map(p => p.arch.id);
  assert(JSON.stringify(ids) === JSON.stringify(['barren', 'icy_cracked', 'planetoid']),
    `potem mała planeta > księżyc > planetoida (${ids.join(' → ')})`);
  const all = await within(Promise.all([...proms, hp]));
  assert(Array.isArray(all) && all.every(m => m && m.source === 'worker') && ready.length === 5 && ready.every(d => d.key && d.bodyId && d.systemId === 'A' && d.w > 0 && d.source === 'worker'),
    `5 map gotowych, surface:ready × ${ready.length} z { key, bodyId, systemId, lod, w, h, ms, source }`);
  // Zmiana układu.
  ready.length = 0;
  const a1 = body('desert', 21, { visualRadius: 9 }), a2 = body('barren', 22), a3 = body('planetoid', 23);
  const heroA = body('terran', 24);
  const pa = [a1, a2, a3].map(b => c.request(b, SC.lodOf(b), SC.surfaceSystemPriority(b)));
  const inflight = fw.posted[fw.posted.length - 1];
  assert(inflight.arch.id === 'desert', 'A: w locie a1 (desert)');
  const ph = c.request(heroA, 'hero', HERO);
  active = 'B';
  B.emit('system:switched', { systemId: 'B' });
  const b1 = body('ice', 31, { systemId: 'B' });
  const pb = c.request(b1, 'body', SC.surfaceSystemPriority(b1));
  fw.reply(inflight);                                   // wynik a1 przychodzi już po przełączeniu
  const r1 = await within(pa[0]), r2 = await within(pa[1]), r3 = await within(pa[2]);
  assert(r1 === null && r2 === null && r3 === null, 'A po przełączeniu: czekające LOD-y → null, wynik w locie → null');
  assert(c.get(a1, 'body') === null && c.snapshot().staleDiscarded === 1 && c.snapshot().staleDropped === 2,
    `wynik w locie starego układu NIE w cache (staleDiscarded ${c.snapshot().staleDiscarded}, staleDropped ${c.snapshot().staleDropped})`);
  assert(fw.posted[fw.posted.length - 1].w === 1024, 'bohater układu A przeżywa przełączenie (wysłany jako następny)');
  fw.replyLast();
  assert(fw.posted[fw.posted.length - 1].arch.id === 'ice', 'potem LOD nowego układu B');
  fw.replyLast();
  const mh = await within(ph), mb = await within(pb);
  assert(mh?.systemId === 'A' && c.get(heroA, 'hero') === mh && mb?.systemId === 'B' && c.get(b1, 'body') === mb,
    'bohater A i LOD B w cache');
  assert(ready.length === 2 && !ready.some(d => d.bodyId === a1.id), `surface:ready tylko dla wstawionych (${ready.length}), nie dla porzuconych`);
  const dup1 = c.request(body('barren', 77, { systemId: 'B' }), 'body', 150);
  const dupB = { ...body('barren', 77, { systemId: 'B' }) };
  const dup2 = c.request(dupB, 'body', HERO);
  assert(dup1 === dup2, 'to samo zadanie zamówione dwa razy → ta sama obietnica (deduplikacja)');
  fw.replyLast(); await within(dup1);
  c.dispose();
  assert(fw.terminated === true && (await within(c.request(body('terran', 1), 'body')) === null, 'dispose(): worker zakończony, kolejne zamówienia → null'));
} catch (e) { assert(false, `C4 rzuciło: ${e?.message ?? e}`); }

// ── C5 Fail-soft ────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nC5 fail-soft');
async function failCase(label, factory, drive, opts = {}, expectMode = 'main') {
  const q = quiet();
  let threw = null, m = null;
  const b = body('desert', 4711);
  try {
    const c = new CacheT({ workerFactory: factory, eventBus: bus(), activeSystemId: () => 'A', warn: q.fn, ...opts });
    const p = c.request(b, 'body', 150);
    const p2 = c.request(body('planetoid', 4712), 'planetoid', 120);
    await drive?.();
    m = await within(p); await within(p2);
    const s = c.snapshot();
    c.dispose();
    assert(!threw && m?.source === 'main' && same(m.data, mainBytes(b, 'body')) && q.w.length === 1 && s.mode === expectMode,
      `${label}: wynik z głównego wątku bit w bit, ostrzeżenia ${q.w.length} (${(q.w[0] ?? '').slice(0, 70)}…)`);
  } catch (e) { threw = e; assert(false, `${label}: rzuciło ${e?.message ?? e}`); }
}
await failCase('fabryka rzuca', () => { throw new Error('boom'); });
let fw2 = null;
await failCase('błąd workera w trakcie zadania', () => (fw2 = new FakeWorker()), async () => { fw2.ready(); fw2.onerror?.({ message: 'crash', preventDefault() {} }); await flush(4); });
let fw3 = null;
await failCase('zła wersja pola', () => (fw3 = new FakeWorker()), async () => { fw3.ready(999); await flush(4); });
await failCase('worker milczy (strażnik 30 ms)', () => new FakeWorker(), async () => { await new Promise(r => setTimeout(r, 60)); await flush(4); }, { workerTimeoutMs: 30 });
let fw4 = null;
await failCase('błąd bake\'u w workerze', () => (fw4 = new FakeWorker()), async () => {
  fw4.ready(); const j = fw4.posted[0]; fw4.onmessage({ data: { type: 'error', jobId: j.jobId, message: 'x' } });
  // drugi job też kończy się błędem w workerze → też główny wątek, ale ostrzeżenie nadal JEDNO
  await flush(2); const j2 = fw4.posted[1]; if (j2) fw4.onmessage({ data: { type: 'error', jobId: j2.jobId, message: 'y' } });
}, {}, 'worker');   // błąd bake'u: zadanie powtórzone na głównym wątku, worker ŻYJE dalej
try {
  // Brak Worker API pod node → domyślna fabryka rzuca → fallback, bez wyjątku.
  const q = quiet();
  const hadWorker = 'Worker' in globalThis;
  const c = new CacheT({ eventBus: bus(), activeSystemId: () => 'A', warn: q.fn });
  const b = body('ice', 55);
  const m = await within(c.request(b, 'body', 150));
  assert(!hadWorker && m?.source === 'main' && same(m.data, mainBytes(b, 'body')) && q.w.length === 1 && /Worker API unavailable/.test(q.w[0]),
    'domyślna fabryka bez Worker API (node): fallback, jedno ostrzeżenie, wynik poprawny');
  c.dispose();
} catch (e) { assert(false, `C5 domyślna fabryka rzuciło: ${e?.message ?? e}`); }
try {
  const q = quiet(); const B = bus();
  B.on('surface:ready', () => { throw new Error('listener'); });
  const c = new CacheT({ workerFactory: null, eventBus: B, activeSystemId: () => 'A', warn: q.fn });
  let threw = false, m = null;
  try { m = await within(c.request(body('barren', 66), 'body', 150)); } catch { threw = true; }
  assert(!threw && m && c.snapshot().entries === 1, 'wyjątek w słuchaczu surface:ready: brak wyjątku, mapa w cache');
  c.dispose();
} catch (e) { assert(false, `C5 słuchacz rzuciło: ${e?.message ?? e}`); }
try {
  const c = new CacheT({ workerFactory: null, eventBus: bus(), activeSystemId: () => 'A' });
  const gas = await within(c.request({ id: 'g', type: 'planet', bodyArchetype: 'gas_cold', surfaceSeed: 1 }, 'body'));
  const noSeed = await within(c.request({ id: 'n', type: 'planet', bodyArchetype: 'terran' }, 'body'));
  const badLod = await within(c.request(body('terran', 1), 'huge'));
  assert(gas === null && noSeed === null && badLod === null && c.snapshot().queue === 0, 'gaz / brak ziarna / nieznany LOD → null, nic w kolejce');
  c.dispose();
} catch (e) { assert(false, `C5 ciała bez powierzchni rzuciło: ${e?.message ?? e}`); }

// ── C6 Bez podpięcia ────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nC6 bez podpięcia do gry');
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) { const p = path.join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(m?js)$/.test(n)) out.push(p); }
  return out;
}
const files = walk(path.join(REPO, 'src')).map(p => path.relative(REPO, p).replace(/\\/g, '/'));
const importers = files.filter(f => /SurfaceCache\.js['"]/.test(strip(read(f))));
const wired = importers.filter(f => !f.startsWith('src/debug/') && !f.startsWith('src/testing/') && f !== 'src/scenes/GameScene.js');
assert(importers.includes('src/debug/SurfacePreviewDebug.js') && importers.includes('src/scenes/GameScene.js'), 'świadek: SurfacePreviewDebug i GameScene importują SurfaceCache');
assert(wired.length === 0, `poza GameScene / debug nikt nie importuje SurfaceCache${wired.length ? ' — ' + wired.join(', ') : ''}`);
const callers = files.filter(f => !f.startsWith('src/debug/') && !f.startsWith('src/testing/') && f !== 'src/systems/SurfaceCache.js'
  && /surfaceCache\??\.(request|get|prefetchSystem|snapshot)\b|\.prefetchSystem\(/.test(strip(read(f))));
assert(callers.length === 0, `nikt poza debug nie woła surfaceCache.request / get / prefetchSystem${callers.length ? ' — ' + callers.join(', ') : ''}`);
const gs = strip(read('src/scenes/GameScene.js'));
const gsLines = gs.split('\n').filter(l => /SurfaceCache|surfaceCache|csCache/.test(l)).map(l => l.trim());
assert(gsLines.length === 4 && gsLines.some(l => /^window\.KOSMOS\.surfaceCache = new SurfaceCache\(\);$/.test(l))
  && gsLines.some(l => /^window\.KOSMOS\.surfaceCache\?\.dispose\?\.\(\);$/.test(l)) && gsLines.some(l => /^window\.csCache\s*=\s*window\.KOSMOS\.debug\?\.csCache;$/.test(l)),
  `GameScene: tylko import + dispose + new SurfaceCache() + alias csCache (${gsLines.length} linii)`);
const sfImport = scSrc.match(/import\s*\{([^}]*)\}\s*from\s*'\.\.\/utils\/SurfaceField\.js'/)?.[1]?.split(',').map(x => x.trim()).sort() ?? [];
assert(JSON.stringify(sfImport) === JSON.stringify(['LOD_SIZES', 'SURFACE_FIELD_VERSION', 'bakeEquirect']),
  `SurfaceCache bierze z SurfaceField tylko bake + stałe (bez evalAt / classify): ${sfImport.join(', ')}`);
const workerRefs = files.filter(f => !f.startsWith('src/testing/') && /surface\.worker\.js/.test(strip(read(f))));
assert(JSON.stringify(workerRefs) === JSON.stringify(['src/systems/SurfaceCache.js']), `surface.worker.js wskazuje tylko SurfaceCache (${workerRefs.join(', ')})`);

// ── C7 prefetchSystem + pomocniki ───────────────────────────────────────────────────────────────────────────────
console.log('\nC7 prefetchSystem + pomocniki konsoli');
try {
  const EM = (await import('../../core/EntityManager.js')).default;
  const add = [body('terran', 801, { systemId: 'P' }), body('icy_cracked', 802, { systemId: 'P' }), body('planetoid', 803, { systemId: 'P' }),
    { id: 'pg', type: 'planet', bodyArchetype: 'gas_cold', surfaceSeed: 804, systemId: 'P' }, body('desert', 805, { systemId: 'Q' })];
  for (const e of add) EM.add(e);
  const c = new CacheT({ workerFactory: null, eventBus: bus(), activeSystemId: () => 'P' });
  const n = c.prefetchSystem('P');
  const queued = c.snapshot().queue;
  await flush(12);
  const s = c.snapshot();
  assert(n === 3 && queued === 3 && s.entries === 3 && Object.keys(s.bytesPerSystem).join() === 'P',
    `prefetchSystem(P): ${n} zamówione (gaz i układ Q pominięte), ${s.entries} map, bajty tylko układu P`);
  for (const e of add) EM.remove(e.id);
  c.dispose();
  globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? { debug: {} };
  const CS = await import('../../debug/ColonySphereDebug.js');
  const h = CS.colonySphereDebugHelpers();
  assert(typeof h.csCache === 'function' && typeof h.csSurfaceAll === 'function', 'colonySphereDebugHelpers() zwraca csCache');
  const snap = h.csCache();
  assert(snap && Number.isFinite(snap.budgetBytes) && 'workerAlive' in snap && 'queue' in snap && 'evictions' in snap, 'csCache() zwraca migawkę (budżet, worker, kolejka, wyrzucenia)');
  const dbg = strip(read('src/debug/SurfacePreviewDebug.js'));
  const allFn = dbg.slice(dbg.indexOf('export function csSurfaceAll'), dbg.indexOf('export function csCache'));
  assert(/cache\.request\(/.test(allFn) && !/bakeEquirect\(|previewBody\(/.test(allFn), 'csSurfaceAll zamawia przez SurfaceCache (bez bake\'u na głównym wątku)');
} catch (e) { assert(false, `C7 rzuciło: ${e?.message ?? e}`); }

console.log(`\n=== colony_sphere_cache_smoke: ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
