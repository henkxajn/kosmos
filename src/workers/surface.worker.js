// surface.worker — bake powierzchni ciała poza głównym wątkiem (ARC COLONY SPHERE, krok CS-4b; plan §1.I, §2, §3.5).
//
// Moduł workera (new Worker(url, {type:'module'})). Moduły workera NIE dziedziczą importmapy (index.html), dlatego graf
// importów tego pliku zawiera WYŁĄCZNIE SurfaceField (sam bez importów): bez three, GameConfig, i18n, EventBus,
// document / window / localStorage. Pilnuje tego keeper (pin grafu importów).
//
// Protokół (jedyny klient: src/systems/SurfaceCache.js):
//   start         → { type:'ready', version }                       (wersja pola — SurfaceCache porównuje ze swoją)
//   { type:'bake', jobId, seed, arch:{id, family, field, biomes}, params:{waterCoverage, palette}, w, h }
//                 → { type:'baked', jobId, w, h, ms, version, buffer } (buffer RGBA8 = e, m, t, a; PRZEKAZANY, nie kopiowany)
//                 → { type:'error', jobId, message }                 (wyjątek bake'u — worker żyje dalej)
// Wynik jest bit-identyczny z bakeEquirect na głównym wątku (ta sama funkcja, te same wejścia; keeper to sprawdza).

import { bakeEquirect, SURFACE_FIELD_VERSION } from '../utils/SurfaceField.js';

// Wiersze archetypów po id: jeden obiekt na id przez całe życie workera (SurfaceField trzyma bufory WeakMap per
// obiekt wiersza i kontekst LRU per id — nowy klon w każdej wiadomości tylko by je mnożył).
const ARCHS = new Map();

function archOf(row) {
  const id = row?.id;
  if (typeof id !== 'string') return row ?? null;
  let a = ARCHS.get(id);
  if (!a) { a = row; ARCHS.set(id, a); }
  return a;
}

self.onmessage = (ev) => {
  const m = ev?.data;
  if (!m || m.type !== 'bake') return;
  try {
    const arch = archOf(m.arch);
    const t0 = performance.now();
    const px = bakeEquirect(m.seed, arch, m.params ?? null, m.w, m.h);
    const ms = performance.now() - t0;
    self.postMessage({ type: 'baked', jobId: m.jobId, w: m.w, h: m.h, ms, version: SURFACE_FIELD_VERSION, buffer: px.buffer },
      [px.buffer]);
  } catch (e) {
    self.postMessage({ type: 'error', jobId: m.jobId, message: String(e?.message ?? e) });
  }
};

self.postMessage({ type: 'ready', version: SURFACE_FIELD_VERSION });
