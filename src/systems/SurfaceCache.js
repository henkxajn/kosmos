// SurfaceCache — jedyne wejście do map powierzchni ciał (ARC COLONY SPHERE, krok CS-4b; plan §1.I, §2, §3.5).
//
// Konsumenci (jeszcze NIE podpięci): CS-6 (SurfaceShader na mapie układu — LOD), CS-7 (bohater kolonii 1024×512).
// Dziś używa go tylko podgląd debug (csSurface / csSurfaceAll / csCache) i bezczynny hak prefetchSystem().
//
// ── Co robi ─────────────────────────────────────────────────────────────────────────────────────────────────────
//  • request(body, lod, priority) → Promise<mapa | null>; get(body, lod) → mapa | null (synchronicznie, z cache).
//    Mapa = { key, bodyId, systemId, lod, w, h, data: Uint8Array RGBA8 (e, m, t, a), bytes, ms, source }.
//    Klucz = surfaceSeed + archetyp + SURFACE_FIELD_VERSION + skrót parametrów (waterCoverage | paleta) + LOD.
//  • Kolejka priorytetów (bohater > ciało w fokusie > ciała LOD aktywnego układu wg rozmiaru). Jedno zadanie w locie
//    na raz → nowe zadanie bohatera wyprzedza czekające LOD-y najpóźniej po bieżącym bake'u (≤ ~65 ms).
//  • Zmiana układu (`system:switched`): czekające zadania LOD innych układów porzucone (obietnice → null); wynik zadania
//    w locie dla układu już nieaktywnego NIE trafia do cache (nie wypycha map bieżącego układu). Bohater nie jest
//    porzucany (ekran kolonii może pokazywać ciało z innego układu).
//  • LRU wg budżetu bajtów (SURFACE_CACHE_BUDGET_BYTES): po wstawieniu suma ≤ budżet ZAWSZE; mapa większa niż cały
//    budżet nie jest buforowana (wraca do wołającego).
//  • Worker (src/workers/surface.worker.js) tworzony LENIWIE przy pierwszym zadaniu. Fail-soft: worker się nie
//    uruchamia / pada / milczy / zgłasza inną wersję pola → JEDNO ostrzeżenie w konsoli i bake na głównym wątku
//    (ta sama funkcja SurfaceField, bit-identyczny wynik), po jednym zadaniu na makrozadanie. Nigdy nie rzuca w grę.
//  • Teren rozgrywki (evalAt w środkach kafli, CS-5) NIE idzie przez worker ani przez ten cache.
//  • Zdarzenie EventBus `surface:ready` { key, bodyId, systemId, lod, w, h, ms, source } po wstawieniu mapy do cache.

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { ARCHETYPE_BY_ID } from '../data/BodyArchetypes.js';
import { planetoidPaletteOf } from '../utils/BodyArchetypeLogic.js';
import { bakeEquirect, LOD_SIZES, SURFACE_FIELD_VERSION } from '../utils/SurfaceField.js';

/** Budżet map w cache [bajty typed arrays]: bohater 2 MiB + LOD aktywnego układu + 2 poprzednie układy (§1.I, §3.5). */
export const SURFACE_CACHE_BUDGET_BYTES = 20 * 1024 * 1024;

/** Priorytety zadań (większy = wcześniej). LOD układu: SYSTEM + 0…89 wg rodzaju i rozmiaru (surfaceSystemPriority). */
export const SURFACE_PRIORITY = Object.freeze({ HERO: 300, FOCUS: 200, SYSTEM: 100 });

/** Zadanie w workerze dłuższe niż to [ms] = worker uznany za zawieszony → fallback na główny wątek. */
export const SURFACE_WORKER_TIMEOUT_MS = 15000;

/** Zdarzenie EventBus: mapa ciała gotowa (wstawiona do cache). */
export const SURFACE_READY_EVENT = 'surface:ready';

const KINDS = Object.freeze(['planet', 'moon', 'planetoid']);
const HOME_SYSTEM = 'sys_home';

function kindOf(body) { return KINDS.includes(body?.type) ? body.type : null; }
export function systemOf(body) { return body?.systemId ?? HOME_SYSTEM; }   // ciała domu bywają bez systemId (jak csWorlds)

/** Parametry pola z ciała (waterCoverage terran, paleta planetoidy) — te same co podgląd CS-4a. */
export function surfaceParamsOf(body) {
  return {
    waterCoverage: body?.waterCoverage ?? null,
    palette: kindOf(body) === 'planetoid' ? planetoidPaletteOf(body) : null,
  };
}

/** LOD mapy układu dla ciała: planetoida 128×64, reszta 256×128. */
export function lodOf(body) { return kindOf(body) === 'planetoid' ? 'planetoid' : 'body'; }

/** Priorytet LOD układu: planety > księżyce > planetoidy, w obrębie rodzaju większe wcześniej (visualRadius). */
export function surfaceSystemPriority(body) {
  const k = kindOf(body);
  const base = k === 'planet' ? 60 : (k === 'moon' ? 30 : 0);
  const r = Number(body?.visualRadius);
  const size = Number.isFinite(r) && r > 0 ? Math.min(29, Math.floor(r * 2)) : 0;
  return SURFACE_PRIORITY.SYSTEM + base + size;
}

function priorityValue(p) {
  if (typeof p === 'number' && Number.isFinite(p)) return p;
  const u = typeof p === 'string' ? SURFACE_PRIORITY[p.toUpperCase()] : undefined;
  return u ?? SURFACE_PRIORITY.SYSTEM;
}

/** Ciało → wiersz archetypu, gdy ma powierzchnię SurfaceField (nie gaz, ma ziarno); inaczej null. */
export function surfaceArchetypeOf(body) {
  if (!kindOf(body) || !Number.isFinite(body?.surfaceSeed)) return null;
  const arch = ARCHETYPE_BY_ID[body?.bodyArchetype];
  return arch && arch.family !== 'gas' ? arch : null;
}

/** Klucz cache (czysty): null gdy ciało nie ma powierzchni albo LOD nieznany. */
export function surfaceKeyOf(body, lod, version = SURFACE_FIELD_VERSION) {
  const arch = surfaceArchetypeOf(body);
  if (!arch || !LOD_SIZES[lod]) return null;
  const p = surfaceParamsOf(body);
  return `${body.surfaceSeed >>> 0}|${arch.id}|v${version}|${p.waterCoverage ?? ''}/${p.palette ?? ''}|${lod}`;
}

/** Fabryka workera przeglądarki (moduł; brak Worker → rzuca, SurfaceCache przechodzi na główny wątek). */
export function defaultSurfaceWorkerFactory() {
  if (typeof Worker === 'undefined') throw new Error('Worker API unavailable');
  return new Worker(new URL('../workers/surface.worker.js', import.meta.url), { type: 'module' });
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class SurfaceCache {
  /**
   * @param {object} [opts]
   * @param {number} [opts.budgetBytes]       budżet LRU [B] (domyślnie SURFACE_CACHE_BUDGET_BYTES)
   * @param {function|null} [opts.workerFactory] () → Worker; null = świadomie główny wątek (bez ostrzeżenia)
   * @param {object} [opts.eventBus]          domyślnie EventBus gry
   * @param {function} [opts.activeSystemId]  () → id aktywnego układu (domyślnie window.KOSMOS.activeSystemId)
   * @param {number} [opts.fieldVersion]      wersja pola w kluczu (testy; domyślnie SURFACE_FIELD_VERSION)
   * @param {function} [opts.warn]            ostrzeżenie (domyślnie console.warn)
   * @param {number} [opts.workerTimeoutMs]   limit zadania w workerze [ms]
   * @param {function} [opts.schedule]        (fn) → nowe makrozadanie dla bake'u głównego wątku (domyślnie setTimeout 0;
   *                                          headless env.js odracza setTimeout 0 do ticku — keepery podają własne)
   */
  constructor(opts = {}) {
    this.budgetBytes = Number.isFinite(opts.budgetBytes) ? opts.budgetBytes : SURFACE_CACHE_BUDGET_BYTES;
    this._workerFactory = opts.workerFactory === undefined ? defaultSurfaceWorkerFactory : opts.workerFactory;
    this._bus = opts.eventBus ?? EventBus;
    this._activeFn = opts.activeSystemId
      ?? (() => (typeof window !== 'undefined' ? window.KOSMOS?.activeSystemId : null) ?? HOME_SYSTEM);
    this._version = Number.isFinite(opts.fieldVersion) ? opts.fieldVersion : SURFACE_FIELD_VERSION;
    this._warnFn = opts.warn ?? ((...a) => console.warn(...a));
    this._timeoutMs = Number.isFinite(opts.workerTimeoutMs) ? opts.workerTimeoutMs : SURFACE_WORKER_TIMEOUT_MS;
    this._schedule = opts.schedule ?? ((fn) => setTimeout(fn, 0));

    this._entries = new Map();     // key → mapa (kolejność Map = LRU: najstarsze pierwsze)
    this._bytes = 0;
    this._queue = [];              // zadania czekające
    this._jobs = new Map();        // key → zadanie (czekające + w locie) — deduplikacja
    this._inFlight = null;         // zadanie w workerze / w bake'u głównego wątku
    this._seq = 0;
    this._mode = 'idle';           // idle | starting | worker | main | disposed
    this._worker = null;
    this._warned = false;
    this._mainPending = false;     // zaplanowane makrozadanie bake'u głównego wątku
    this._watchdog = null;
    this._activeSystem = this._activeFn();
    this.stats = { hits: 0, misses: 0, evictions: 0, evictedBytes: 0, staleDropped: 0, staleDiscarded: 0,
      oversize: 0, errors: 0, workerFailures: 0, baked: { worker: {}, main: {} } };

    this._onSwitch = ({ systemId } = {}) => this.setActiveSystem(systemId ?? this._activeFn());
    this._bus?.on?.('system:switched', this._onSwitch);
  }

  // ── API ───────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Mapa z cache albo null (bez kolejkowania, bez liczników hit/miss). Trafienie odświeża LRU. */
  get(body, lod = lodOf(body)) {
    const key = surfaceKeyOf(body, lod, this._version);
    const e = key ? this._entries.get(key) : null;   // bez statystyk: CS-6 może pytać co klatkę
    if (e) this._touch(e);
    return e ?? null;
  }

  /**
   * Zamów mapę. Trafienie → Promise.resolve(mapa). Zadanie już w kolejce → ta sama obietnica (priorytet podniesiony).
   * Promise rozwiązuje się null, gdy ciało nie ma powierzchni, zadanie porzucono (inny układ) albo cache zamknięto.
   * Nigdy nie odrzuca.
   */
  request(body, lod = lodOf(body), priority = SURFACE_PRIORITY.SYSTEM) {
    if (this._mode === 'disposed') return Promise.resolve(null);
    const key = surfaceKeyOf(body, lod, this._version);
    if (!key) return Promise.resolve(null);
    const hit = this._entries.get(key);
    if (hit) { this.stats.hits++; this._touch(hit); return Promise.resolve(hit); }
    this.stats.misses++;
    const prio = priorityValue(priority);
    const pending = this._jobs.get(key);
    if (pending) { if (prio > pending.priority) pending.priority = prio; return pending.promise; }
    const arch = surfaceArchetypeOf(body);
    const [w, h] = LOD_SIZES[lod];
    const job = { key, bodyId: body.id ?? null, systemId: systemOf(body), lod, w, h, priority: prio, seq: this._seq++,
      seed: body.surfaceSeed >>> 0, arch, params: surfaceParamsOf(body), resolve: null, promise: null, jobId: 0, t0: 0 };
    job.promise = new Promise(res => { job.resolve = res; });
    this._jobs.set(key, job);
    this._queue.push(job);
    this._pump();
    return job.promise;
  }

  /** Hak CS-6 (bezczynny do czasu podpięcia): kolejkuje mapy LOD wszystkich ciał układu. Zwraca liczbę zamówionych. */
  prefetchSystem(systemId = this._activeSystem) {
    let n = 0;
    for (const kind of KINDS) {
      for (const b of EntityManager.getByType(kind)) {
        if (systemOf(b) !== systemId || !surfaceArchetypeOf(b)) continue;
        this.request(b, lodOf(b), surfaceSystemPriority(b));
        n++;
      }
    }
    return n;
  }

  /** Zmiana aktywnego układu: porzuć czekające zadania nie-bohatera z innych układów. */
  setActiveSystem(systemId) {
    if (!systemId) return;
    this._activeSystem = systemId;
    const keep = [];
    for (const job of this._queue) {
      if (job.priority >= SURFACE_PRIORITY.HERO || job.systemId === systemId) { keep.push(job); continue; }
      this._jobs.delete(job.key);
      this.stats.staleDropped++;
      job.resolve(null);
    }
    this._queue = keep;
  }

  /** Wyczyść mapy i kolejkę (wczytanie gry). Worker zostaje (jeśli żyje). */
  clear() {
    for (const job of this._queue) job.resolve(null);
    this._queue = [];
    if (this._inFlight) { this._inFlight.resolve(null); this._inFlight.cancelled = true; }
    this._jobs.clear();
    this._entries.clear();
    this._bytes = 0;
  }

  /** Zamknięcie (powrót do tytułu / restart sceny): kolejka → null, worker zabity, odpięcie od EventBus. */
  dispose() {
    this.clear();
    this._inFlight = null;
    this._killWorker();
    this._bus?.off?.('system:switched', this._onSwitch);
    this._mode = 'disposed';
  }

  /** Migawka do csCache(). */
  snapshot() {
    const perSystem = {};
    for (const e of this._entries.values()) perSystem[e.systemId] = (perSystem[e.systemId] ?? 0) + e.bytes;
    const avg = (src) => Object.fromEntries(Object.entries(this.stats.baked[src])
      .map(([lod, s]) => [lod, { n: s.n, avgMs: +(s.ms / s.n).toFixed(1) }]));
    return {
      mode: this._mode, workerAlive: this._mode === 'worker' || this._mode === 'starting',
      entries: this._entries.size, bytesUsed: this._bytes, budgetBytes: this.budgetBytes,
      queue: this._queue.length, inFlight: this._inFlight ? 1 : 0, activeSystem: this._activeSystem,
      hits: this.stats.hits, misses: this.stats.misses, evictions: this.stats.evictions, evictedBytes: this.stats.evictedBytes,
      staleDropped: this.stats.staleDropped, staleDiscarded: this.stats.staleDiscarded, oversize: this.stats.oversize,
      errors: this.stats.errors, workerFailures: this.stats.workerFailures,
      workerMs: avg('worker'), mainMs: avg('main'), bytesPerSystem: perSystem,
    };
  }

  /** Klucze w kolejności LRU (najstarszy pierwszy) — testy. */
  keys() { return [...this._entries.keys()]; }

  // ── Wnętrze ───────────────────────────────────────────────────────────────────────────────────────────────────

  _touch(e) { this._entries.delete(e.key); this._entries.set(e.key, e); }

  _takeNext() {
    if (this._queue.length === 0) return null;
    let bi = 0;
    for (let i = 1; i < this._queue.length; i++) {
      const a = this._queue[i], b = this._queue[bi];
      if (a.priority > b.priority || (a.priority === b.priority && a.seq < b.seq)) bi = i;
    }
    return this._queue.splice(bi, 1)[0];
  }

  _pump() {
    if (this._mode === 'disposed' || this._inFlight || this._queue.length === 0) return;
    if (this._mode === 'idle') this._startWorker();
    if (this._mode === 'starting') return;                  // poczeka na 'ready' (albo błąd → main)
    if (this._mode === 'worker') { this._postNext(); return; }
    if (this._mode === 'main' && !this._mainPending) {
      // Główny wątek: jedno zadanie na makrozadanie — gra dostaje klatki między bake'ami.
      this._mainPending = true;
      this._schedule(() => { this._mainPending = false; this._runMainOne(); });
    }
  }

  _startWorker() {
    if (!this._workerFactory) { this._mode = 'main'; return; }
    try {
      const w = this._workerFactory();
      this._worker = w;
      this._mode = 'starting';
      w.onmessage = (ev) => this._onWorkerMessage(ev?.data);
      w.onerror = (ev) => { ev?.preventDefault?.(); this._workerFailed(`error: ${ev?.message ?? 'module load / runtime'}`); };
      w.onmessageerror = () => this._workerFailed('messageerror');
      this._armWatchdog();                                  // także na 'ready' (moduł, który nigdy się nie ładuje)
    } catch (e) {
      this._workerFailed(`cannot start: ${e?.message ?? e}`);
    }
  }

  _armWatchdog() {
    this._clearWatchdog();
    this._watchdog = setTimeout(() => this._workerFailed(`no response for ${this._timeoutMs} ms`), this._timeoutMs);
    this._watchdog?.unref?.();                              // node: strażnik nie trzyma procesu przy życiu
  }

  _clearWatchdog() { if (this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; } }

  _onWorkerMessage(m) {
    if (this._mode === 'disposed' || !m) return;
    if (m.type === 'ready') {
      this._clearWatchdog();
      if (m.version !== SURFACE_FIELD_VERSION) { this._workerFailed(`field version ${m.version} ≠ ${SURFACE_FIELD_VERSION}`); return; }
      this._mode = 'worker';
      this._pump();
      return;
    }
    const job = this._inFlight;
    if (!job || m.jobId !== job.jobId) return;              // spóźniona odpowiedź (po fallbacku / clear)
    this._clearWatchdog();
    this._inFlight = null;
    if (m.type === 'baked' && m.buffer) {
      this._finish(job, new Uint8Array(m.buffer), m.ms, 'worker');
    } else {
      this.stats.errors++;
      this._warnOnce(`[SurfaceCache] worker bake error (${m.message ?? '?'}) — job ${job.key} retried on the main thread`);
      this._bakeMain(job);
    }
    this._pump();
  }

  _postNext() {
    const job = this._takeNext();
    if (!job) return;
    job.jobId = ++this._seq;
    job.t0 = nowMs();
    this._inFlight = job;
    const a = job.arch;
    try {
      this._worker.postMessage({ type: 'bake', jobId: job.jobId, seed: job.seed,
        arch: { id: a.id, family: a.family, field: a.field ?? null, biomes: a.biomes ?? [] },
        params: job.params, w: job.w, h: job.h });
      this._armWatchdog();
    } catch (e) {
      this._workerFailed(`postMessage: ${e?.message ?? e}`);
    }
  }

  _workerFailed(reason) {
    if (this._mode === 'disposed' || this._mode === 'main') return;
    this.stats.workerFailures++;
    this._warnOnce(`[SurfaceCache] surface worker unavailable (${reason}) — falling back to main-thread bake (slower, same result)`);
    this._killWorker();
    this._mode = 'main';
    const job = this._inFlight;
    this._inFlight = null;
    if (job && !job.cancelled) { this._queue.push(job); }   // zadanie w locie wraca do kolejki (główny wątek)
    this._pump();
  }

  _killWorker() {
    this._clearWatchdog();
    const w = this._worker;
    this._worker = null;
    if (w) { w.onmessage = null; w.onerror = null; w.onmessageerror = null; try { w.terminate?.(); } catch { /* nic */ } }
  }

  _runMainOne() {
    if (this._mode !== 'main' || this._inFlight) return;
    const job = this._takeNext();
    if (!job) return;
    this._inFlight = job;
    this._bakeMain(job);
    this._inFlight = null;
    this._pump();
  }

  _bakeMain(job) {
    try {
      const t0 = nowMs();
      const data = bakeEquirect(job.seed, job.arch, job.params, job.w, job.h);
      this._finish(job, data, nowMs() - t0, 'main');
    } catch (e) {
      this.stats.errors++;
      this._warnOnce(`[SurfaceCache] main-thread bake failed for ${job.key}: ${e?.message ?? e}`);
      this._jobs.delete(job.key);
      job.resolve(null);
    }
  }

  _finish(job, data, ms, source) {
    if (job.cancelled) return;
    this._jobs.delete(job.key);
    const st = (this.stats.baked[source][job.lod] ??= { n: 0, ms: 0 });
    st.n++; st.ms += ms;
    const map = { key: job.key, bodyId: job.bodyId, systemId: job.systemId, lod: job.lod, w: job.w, h: job.h,
      data, bytes: data.byteLength, ms, source };
    // Wynik dla układu już nieaktywnego (nie bohater) nie wypycha map bieżącego układu.
    if (job.priority < SURFACE_PRIORITY.HERO && job.systemId !== this._activeSystem) {
      this.stats.staleDiscarded++;
      job.resolve(null);
      return;
    }
    if (this._insert(map)) {
      try {
        this._bus?.emit?.(SURFACE_READY_EVENT, { key: map.key, bodyId: map.bodyId, systemId: map.systemId, lod: map.lod,
          w: map.w, h: map.h, ms, source });
      } catch (e) { this._warnOnce(`[SurfaceCache] ${SURFACE_READY_EVENT} listener threw: ${e?.message ?? e}`); }
    }
    job.resolve(map);
  }

  /** Wstaw z LRU wg budżetu. false = mapa większa niż cały budżet (nie buforowana). */
  _insert(map) {
    if (map.bytes > this.budgetBytes) { this.stats.oversize++; return false; }
    const old = this._entries.get(map.key);
    if (old) { this._entries.delete(map.key); this._bytes -= old.bytes; }
    while (this._bytes + map.bytes > this.budgetBytes && this._entries.size > 0) {
      const [k, e] = this._entries.entries().next().value;
      this._entries.delete(k);
      this._bytes -= e.bytes;
      this.stats.evictions++;
      this.stats.evictedBytes += e.bytes;
    }
    this._entries.set(map.key, map);
    this._bytes += map.bytes;
    return true;
  }

  _warnOnce(msg) {
    if (this._warned) return;
    this._warned = true;
    try { this._warnFn(msg); } catch { /* nic */ }
  }
}

export default SurfaceCache;
