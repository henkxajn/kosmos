// SurfacePreviewDebug — podgląd powierzchni ciał dla właściciela (ARC COLONY SPHERE, kroki CS-4a / CS-4b; plan §3.4, §3.5).
//
//   csSurface()    — mapa BOHATERA 1024×512 ciała ZAZNACZONEGO (albo celu kamery; brak → planeta macierzysta gracza,
//                    przed intro: pierwsza terran aktywnego układu) przez SurfaceCache (priorytet HERO, worker):
//                    surowa paleta biomów + cieniowanie z wysokości; nagłówek: nazwa, archetyp, waterBand / pokrycie,
//                    czas bake'u [ms] i źródło (W worker / M główny wątek / C cache).
//   csSurfaceAll() — miniatury WSZYSTKICH ciał aktywnego układu w LOD mapy układu (planety / księżyce 256×128,
//                    planetoidy 128×64) przez SurfaceCache; miniatury wypełniają się PO KOLEI, w miarę jak worker oddaje
//                    wyniki (podpis: nazwa, archetyp, ms, W / M / C; nagłówek: postęp, czas ściany, suma bake'ów).
//                    Gazowe olbrzymy pominięte (GasGiantShader zostaje, CS-11).
//   csCache()      — stan SurfaceCache: wpisy, bajty / budżet, trafienia / chybienia, wyrzucenia, kolejka, worker żyje,
//                    średni czas bake'u per LOD (worker / główny wątek), bajty per układ.
//
// Nakładka DOM z przyciskiem zamknięcia; ZERO zmian stanu gry (tylko odczyt ciał). Kompozycja podglądu (paleta +
// cieniowanie) liczy się na głównym wątku — to koszt TYLKO podglądu debug, nie cache'u. To nie jest wygląd gry —
// prawdziwy shader to CS-6. Importowalne pod node (DOM tylko w wywołaniu).

import EntityManager from '../core/EntityManager.js';
import { ARCHETYPE_BY_ID } from '../data/BodyArchetypes.js';
import { planetoidPaletteOf } from '../utils/BodyArchetypeLogic.js';
import { bakeEquirect, surfaceInfo } from '../utils/SurfaceField.js';
import { composePreview } from '../utils/SurfacePreviewLogic.js';
import { SurfaceCache, SURFACE_PRIORITY, lodOf, surfaceSystemPriority, surfaceArchetypeOf, systemOf } from '../systems/SurfaceCache.js';

const OVERLAY_ID = 'cs-surface-preview';
const KINDS = ['planet', 'moon', 'planetoid'];
const SRC_TAG = { worker: 'W', main: 'M', cache: 'C' };

/** Parametry pola z ciała (waterCoverage terran, paleta planetoidy). */
export function surfaceParamsOf(body, kind) {
  return {
    waterCoverage: body?.waterCoverage ?? null,
    palette: kind === 'planetoid' ? planetoidPaletteOf(body) : null,
  };
}

function kindOf(body) { return KINDS.includes(body?.type) ? body.type : null; }

/** Bake + kompozycja podglądu jednego ciała na głównym wątku (null gdy brak ziarna / archetypu / gaz). */
export function previewBody(body, w, h) {
  const kind = kindOf(body);
  const arch = ARCHETYPE_BY_ID[body?.bodyArchetype];
  if (!kind || !arch || arch.family === 'gas' || !Number.isFinite(body?.surfaceSeed)) return null;
  const params = surfaceParamsOf(body, kind);
  const t0 = performance.now();
  const bytes = bakeEquirect(body.surfaceSeed, arch, params, w, h);
  const ms = performance.now() - t0;
  const info = surfaceInfo(body.surfaceSeed, arch, params);
  const { rgba, shares } = composePreview(bytes, w, h, arch, info);
  return { kind, arch, info, rgba, shares, ms };
}

let _ownCache = null;
/** Cache gry (GameScene: KOSMOS.surfaceCache); bez sceny (node / headless) — własny, leniwie. */
export function surfaceCacheOf() {
  const K = (typeof window !== 'undefined' ? window.KOSMOS : null) ?? null;
  return K?.surfaceCache ?? (_ownCache ??= new SurfaceCache());
}

/** Kompozycja podglądu z mapy cache'u (null przy błędzie — podgląd nie rzuca). */
function composeFromMap(body, map) {
  try {
    const arch = surfaceArchetypeOf(body);
    const info = surfaceInfo(body.surfaceSeed, arch, surfaceParamsOf(body, kindOf(body)));
    const { rgba, shares } = composePreview(map.data, map.w, map.h, arch, info);
    return { arch, info, rgba, shares };
  } catch (e) { console.warn('[csSurface] compose', body?.name, e?.message ?? e); return null; }
}

function canvasOf(rgba, w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  return cv;
}

function openOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
  const box = document.createElement('div');
  box.id = OVERLAY_ID;
  box.style.cssText = 'position:fixed;inset:24px;z-index:100000;background:rgba(6,10,16,0.96);border:1px solid #3a5a7a;'
    + 'color:#cfe3f5;font:12px monospace;overflow:auto;padding:12px 14px;';
  const close = document.createElement('button');
  close.textContent = '×';
  close.dataset.action = 'cs-surface-close';
  close.style.cssText = 'position:sticky;top:0;float:right;font:18px monospace;background:#16283a;color:#cfe3f5;border:1px solid #3a5a7a;cursor:pointer;width:32px;height:32px;';
  close.onclick = () => box.remove();
  box.appendChild(close);
  document.body.appendChild(box);
  return box;
}

function selectedBody() {
  const K = window.KOSMOS ?? {};
  const tr = K.threeRenderer;
  const ids = [tr?._selectedEntityId, tr?._focusEntityId];
  for (const id of ids) { const b = id ? EntityManager.get(id) : null; if (kindOf(b)) return b; }
  if (K.homePlanet) return K.homePlanet;
  // Przed _setupColony (intro nowej gry) homePlanet = null → pierwsza terran aktywnego układu (dom jest zawsze terran).
  const sys = K.activeSystemId ?? 'sys_home';
  return EntityManager.getByType('planet').find(p => (p.systemId ?? 'sys_home') === sys && p.bodyArchetype === 'terran') ?? null;
}

/** csSurface() — mapa bohatera (1024×512) jednego ciała przez SurfaceCache. Zwraca { name, archetype, lod, done }. */
export function csSurface() {
  const body = selectedBody();
  const arch = body ? surfaceArchetypeOf(body) : null;
  if (!arch) { console.warn('[csSurface]', body?.name ?? null, body?.bodyArchetype ?? null); return null; }
  const cache = surfaceCacheOf();
  const cached = !!cache.get(body, 'hero');
  const box = openOverlay();
  const head = document.createElement('div');
  const water = arch.id === 'terran' ? ` · ${body.waterBand ?? '?'} ${body.waterCoverage ?? '?'}` : '';
  const title = `${body.name} · ${kindOf(body)} · ${arch.id}${water}`;
  head.textContent = `${title} · …`;
  head.style.cssText = 'font:14px monospace;margin:4px 0 10px;';
  box.appendChild(head);
  const t0 = performance.now();
  const done = cache.request(body, 'hero', SURFACE_PRIORITY.HERO).then((map) => {
    const waitMs = performance.now() - t0;
    if (!map) { head.textContent = `${title} · —`; return null; }
    const p = composeFromMap(body, map);
    if (!p) return null;
    const src = cached ? 'cache' : map.source;
    // bake [ms] + źródło (W / M / C), potem czas oczekiwania [ms] od zamówienia
    head.textContent = `${title} · sea ${p.info.seaLevel.toFixed(3)} · ${map.ms.toFixed(0)} ms ${SRC_TAG[src]} · ${waitMs.toFixed(0)} ms`;
    const cv = canvasOf(p.rgba, map.w, map.h);
    cv.style.cssText = 'width:1024px;max-width:100%;image-rendering:pixelated;border:1px solid #3a5a7a;';
    box.appendChild(cv);
    const sh = document.createElement('div');
    sh.textContent = Object.entries(p.shares).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(' · ');
    sh.style.cssText = 'margin-top:8px;opacity:0.8;';
    box.appendChild(sh);
    const summary = { name: body.name, kind: kindOf(body), archetype: arch.id, waterBand: body.waterBand ?? null,
      waterCoverage: body.waterCoverage ?? null, seaLevel: +p.info.seaLevel.toFixed(4), w: map.w, h: map.h,
      bakeMs: +map.ms.toFixed(1), waitMs: +waitMs.toFixed(1), source: src, terrainShares: p.shares };
    console.log('[csSurface]', JSON.stringify(summary));
    return summary;
  });
  return { name: body.name, archetype: arch.id, lod: 'hero', done };
}

/** csSurfaceAll() — miniatury LOD wszystkich ciał aktywnego układu, wypełniane po kolei. Zwraca { …, done }. */
export function csSurfaceAll() {
  const K = window.KOSMOS ?? {};
  const systemId = K.activeSystemId ?? 'sys_home';
  const cache = surfaceCacheOf();
  const box = openOverlay();
  const head = document.createElement('div');
  head.style.cssText = 'font:14px monospace;';
  box.appendChild(head);
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;';
  box.appendChild(grid);
  const bodies = [];
  let total = 0, skipped = 0;
  for (const kind of KINDS) {
    for (const b of EntityManager.getByType(kind)) {
      if (systemOf(b) !== systemId) continue;   // jak csWorlds (ciała domu bez systemId)
      total++;
      if (!surfaceArchetypeOf(b)) { skipped++; continue; }
      bodies.push(b);
    }
  }
  bodies.sort((a, b) => surfaceSystemPriority(b) - surfaceSystemPriority(a));   // kolejność siatki = kolejność bake'u
  const t0 = performance.now();
  let filled = 0, bakeMs = 0;
  const bySource = { W: 0, M: 0, C: 0 };
  const archetypes = {};
  const paintHead = () => {
    head.textContent = `${systemId} · ${filled}/${bodies.length} (gaz ${skipped}) · ${(performance.now() - t0).toFixed(0)} ms`
      + ` · Σbake ${bakeMs.toFixed(0)} ms · W ${bySource.W} / M ${bySource.M} / C ${bySource.C}`;
  };
  paintHead();
  const jobs = bodies.map((b) => {
    const lod = lodOf(b);
    const arch = surfaceArchetypeOf(b);
    archetypes[arch.id] = (archetypes[arch.id] ?? 0) + 1;
    const cell = document.createElement('div');
    cell.style.cssText = 'width:256px;';
    const ph = document.createElement('div');
    ph.style.cssText = 'width:256px;height:128px;border:1px dashed #3a5a7a;background:#0b1520;';
    cell.appendChild(ph);
    const lab = document.createElement('div');
    lab.textContent = `${b.name} · ${arch.id} · …`;
    lab.style.cssText = 'margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    cell.appendChild(lab);
    grid.appendChild(cell);
    const cached = !!cache.get(b, lod);
    return cache.request(b, lod, surfaceSystemPriority(b)).then((map) => {
      if (!map) { lab.textContent = `${b.name} · ${arch.id} · —`; return; }
      const p = composeFromMap(b, map);
      if (!p) return;
      const tag = cached ? 'C' : SRC_TAG[map.source];
      const cv = canvasOf(p.rgba, map.w, map.h);
      cv.style.cssText = 'width:256px;height:128px;image-rendering:pixelated;border:1px solid #3a5a7a;display:block;';
      cell.replaceChild(cv, ph);
      lab.textContent = `${b.name} · ${arch.id} · ${map.ms.toFixed(0)} ms ${tag}`;
      filled++; bySource[tag]++;
      if (tag !== 'C') bakeMs += map.ms;
      paintHead();
    });
  });
  const summary = { systemId, bodies: total, queued: bodies.length, skipped, archetypes };
  summary.done = Promise.all(jobs).then(() => {
    const out = { systemId, bodies: total, shown: filled, skipped, wallMs: +(performance.now() - t0).toFixed(1),
      bakeMsTotal: +bakeMs.toFixed(1), sources: { ...bySource }, archetypes };
    console.log('[csSurfaceAll]', JSON.stringify(out));
    return out;
  });
  return summary;
}

/** csCache() — stan SurfaceCache (bez argumentów). */
export function csCache() {
  const s = surfaceCacheOf().snapshot();
  const mib = (b) => (b / 1048576).toFixed(2);
  console.log(`[csCache] ${s.entries} map · ${mib(s.bytesUsed)} / ${mib(s.budgetBytes)} MiB · hit ${s.hits} / miss ${s.misses}`
    + ` · evict ${s.evictions} · kolejka ${s.queue}+${s.inFlight} · worker ${s.workerAlive ? 'OK' : 'NIE'} (${s.mode})`);
  console.log('[csCache]', JSON.stringify(s));
  return s;
}
