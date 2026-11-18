// SurfacePreviewDebug — podgląd powierzchni ciał dla właściciela (ARC COLONY SPHERE, krok CS-4a; plan §3.4).
//
//   csSurface()    — equirect 512×256 ciała ZAZNACZONEGO (albo celu kamery; brak → planeta macierzysta gracza,
//                    przed intro: pierwsza terran aktywnego układu):
//                    surowa paleta biomów + cieniowanie z wysokości; nagłówek: nazwa, archetyp, waterBand / pokrycie,
//                    czas bake'u [ms].
//   csSurfaceAll() — siatka miniatur 128×64 WSZYSTKICH ciał aktywnego układu (planety → księżyce → planetoidy),
//                    podpis: nazwa + archetyp. Gazowe olbrzymy pominięte (GasGiantShader zostaje, CS-11).
//
// Nakładka DOM z przyciskiem zamknięcia; ZERO zmian stanu gry (tylko odczyt ciał). Bake na głównym wątku (CS-4b doda
// worker + cache). To nie jest wygląd gry — prawdziwy shader to CS-6. Importowalne pod node (DOM tylko w wywołaniu).

import EntityManager from '../core/EntityManager.js';
import { ARCHETYPE_BY_ID } from '../data/BodyArchetypes.js';
import { planetoidPaletteOf } from '../utils/BodyArchetypeLogic.js';
import { bakeEquirect, surfaceInfo } from '../utils/SurfaceField.js';
import { composePreview } from '../utils/SurfacePreviewLogic.js';

const OVERLAY_ID = 'cs-surface-preview';
const KINDS = ['planet', 'moon', 'planetoid'];

/** Parametry pola z ciała (waterCoverage terran, paleta planetoidy). */
export function surfaceParamsOf(body, kind) {
  return {
    waterCoverage: body?.waterCoverage ?? null,
    palette: kind === 'planetoid' ? planetoidPaletteOf(body) : null,
  };
}

function kindOf(body) { return KINDS.includes(body?.type) ? body.type : null; }

/** Bake + kompozycja podglądu jednego ciała (null gdy brak ziarna / archetypu / gaz). */
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

/** csSurface() — podgląd jednego ciała. */
export function csSurface() {
  const body = selectedBody();
  const p = body ? previewBody(body, 512, 256) : null;
  if (!p) { console.warn('[csSurface]', body?.name ?? null, body?.bodyArchetype ?? null); return null; }
  const box = openOverlay();
  const head = document.createElement('div');
  const water = p.arch.id === 'terran' ? ` · ${body.waterBand ?? '?'} ${body.waterCoverage ?? '?'}` : '';
  head.textContent = `${body.name} · ${p.kind} · ${p.arch.id}${water} · sea ${p.info.seaLevel.toFixed(3)} · ${p.ms.toFixed(0)} ms`;
  head.style.cssText = 'font:14px monospace;margin:4px 0 10px;';
  box.appendChild(head);
  const cv = canvasOf(p.rgba, 512, 256);
  cv.style.cssText = 'width:1024px;max-width:100%;image-rendering:pixelated;border:1px solid #3a5a7a;';
  box.appendChild(cv);
  const sh = document.createElement('div');
  sh.textContent = Object.entries(p.shares).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(' · ');
  sh.style.cssText = 'margin-top:8px;opacity:0.8;';
  box.appendChild(sh);
  const summary = { name: body.name, kind: p.kind, archetype: p.arch.id, waterBand: body.waterBand ?? null,
    waterCoverage: body.waterCoverage ?? null, seaLevel: +p.info.seaLevel.toFixed(4), bakeMs: +p.ms.toFixed(1), terrainShares: p.shares };
  console.log('[csSurface]', JSON.stringify(summary));
  return summary;
}

/** csSurfaceAll() — miniatury wszystkich ciał aktywnego układu. */
export function csSurfaceAll() {
  const K = window.KOSMOS ?? {};
  const systemId = K.activeSystemId ?? 'sys_home';
  const box = openOverlay();
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;';
  box.appendChild(grid);
  let total = 0, shown = 0, skipped = 0, ms = 0;
  const archetypes = {};
  for (const kind of KINDS) {
    for (const b of EntityManager.getByType(kind)) {
      if ((b.systemId ?? 'sys_home') !== systemId) continue;   // jak csWorlds (ciała domu bez systemId)
      total++;
      const p = previewBody(b, 128, 64);
      if (!p) { skipped++; continue; }
      shown++; ms += p.ms;
      archetypes[p.arch.id] = (archetypes[p.arch.id] ?? 0) + 1;
      const cell = document.createElement('div');
      cell.style.cssText = 'width:256px;';
      const cv = canvasOf(p.rgba, 128, 64);
      cv.style.cssText = 'width:256px;height:128px;image-rendering:pixelated;border:1px solid #3a5a7a;display:block;';
      cell.appendChild(cv);
      const lab = document.createElement('div');
      lab.textContent = `${b.name} · ${p.arch.id}`;
      lab.style.cssText = 'margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      cell.appendChild(lab);
      grid.appendChild(cell);
    }
  }
  const head = document.createElement('div');
  head.textContent = `${systemId} · ${shown}/${total} · ${ms.toFixed(0)} ms`;
  head.style.cssText = 'font:14px monospace;';
  box.insertBefore(head, grid);
  const summary = { systemId, bodies: total, shown, skipped, bakeMsTotal: +ms.toFixed(1), archetypes };
  console.log('[csSurfaceAll]', JSON.stringify(summary));
  return summary;
}
