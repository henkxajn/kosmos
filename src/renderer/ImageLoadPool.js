// src/renderer/ImageLoadPool.js
// Ładowanie obrazów z OGRANICZONĄ równoległością.
// GitHub Pages (HTTP/2 przez Fastly) resetuje strumienie przy ~100+ równoległych żądaniach
// (net::ERR_HTTP2_PROTOCOL_ERROR) → tekstury padały (onerror) i ładowanie ciągnęło się minutami.
// Pula trzyma maks. `limit` jednoczesnych żądań; kolejne startują, gdy zwolni się slot.

export const IMAGE_LOAD_CONCURRENCY = 6; // maks. równoległych żądań (limit strumieni HTTP/2 Pages)

// tasks: Array<{ src, onLoad?(img), onError?() }>. Każde ZAWSZE resolve (błąd = cichy fallback per-task).
export function loadImagesWithLimit(tasks, limit = IMAGE_LOAD_CONCURRENCY) {
  if (typeof Image === 'undefined' || tasks.length === 0) return Promise.resolve(); // headless guard
  let next = 0;
  const runOne = (task) => new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => { task.onLoad?.(img); resolve(); };
    img.onerror = () => { task.onError?.(); resolve(); };
    img.src = task.src;
  });
  const worker = async () => { while (next < tasks.length) await runOne(tasks[next++]); };
  const n = Math.min(Math.max(1, limit), tasks.length);
  return Promise.all(Array.from({ length: n }, worker));
}
