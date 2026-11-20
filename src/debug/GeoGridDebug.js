// GeoGridDebug — podgląd siatki geodezyjnej ciała dla właściciela (ARC COLONY SPHERE, krok CS-5a; plan §3.13).
//
//   csGeoGrid() — bez argumentów, bez cudzysłowów. Ciało = zaznaczone (albo cel kamery; brak → planeta macierzysta),
//                 jak csSurface(). Siatka = siatka geo kolonii, jeśli kolonia ją ma; inaczej świeżo wygenerowana siatka
//                 PODGLĄDU (nie jest przypinana do ciała — zero zmian stanu gry). Konsola: liczba pól, pięciokąty,
//                 udziały terenów, pasy szerokości, pola lądowania (puste ciało i z hipotetyczną kolonią: stolica na
//                 polu równikowym + jej pierścień 1), anomalie (ile na pięciokątach). Nakładka: mapa bohatera
//                 (csSurface) + kontury pól (pięciokąty żółte), kropka terenu rozgrywki w środku pola, odcień pasów
//                 polarnych, okręgi anomalii, krzyżyk hipotetycznej stolicy i obwódka pól lądowania.
//
// Rysunek (rzut equirect) używa trygonometrii — to ścieżka WIZUALNA; rozgrywka czyta tylko arytmetykę siatki.

import { tileGraphOf, LATITUDE_BAND } from '../map/TileGraph.js';
import { generateGeoGrid, geoGridSpecFor } from '../map/GeoColonyGridGenerator.js';
import { surfaceInfo } from '../utils/SurfaceField.js';
import { composePreview } from '../utils/SurfacePreviewLogic.js';
import { SURFACE_PRIORITY, surfaceParamsOf } from '../systems/SurfaceCache.js';
import { selectedBody, surfaceCacheOf } from './SurfacePreviewDebug.js';

const OVERLAY_ID = 'cs-geogrid-preview';
// Legenda podglądu debug (narzędzie właściciela, nie UI gracza — jak podpisy csSurface).
const LEGEND = Object.freeze(['yellow = pentagon (anomaly node)', 'dot = gameplay terrain', 'blue tint = polar / subpolar band',
  'magenta ring = anomaly', 'red X = hypothetical capital', 'green outline = landing tile with that colony']);
const TERRAIN_DOT = { plains: '#9bd36b', forest: '#2f8f3a', desert: '#e3c27a', tundra: '#a9c1b5', ice_sheet: '#ffffff',
  wasteland: '#9a8f86', crater: '#5f5752', mountains: '#7b6a5a', volcano: '#ff5a1f', ocean: '#2d6fd6' };

/** Siatka do podglądu: geo kolonii albo świeża siatka podglądu (null = ciało bez powierzchni / gaz). */
export function geoGridForPreview(body) {
  const K = (typeof window !== 'undefined' ? window.KOSMOS : null) ?? {};
  const colony = K.colonyManager?.getColony?.(body?.id);
  if (colony?.grid?.kind === 'geo') return { grid: colony.grid, source: 'colony' };
  const grid = body ? generateGeoGrid(body, true) : null;
  return grid ? { grid, source: 'preview' } : null;
}

/** Podsumowanie siatki (czyste; bez DOM). hypothetical: stolica na polu równikowym + pierścień 1 (na KOPII stanu). */
export function geoGridSummary(body, grid, source) {
  const g = tileGraphOf(grid);
  const spec = geoGridSpecFor(body);
  const terrain = {}, bands = { polar: 0, subpolar: 0, equatorial: 0 };
  let pent = 0, anomalies = 0, anomaliesOnPent = 0, landingEmpty = 0;
  g.forEachTile(t => {
    terrain[t.type] = (terrain[t.type] ?? 0) + 1;
    if (g.isPentagon(t)) pent++;
    if (t.anomaly) { anomalies++; if (g.isPentagon(t)) anomaliesOnPent++; }
    const b = g.latitudeBand(t);
    if (b === LATITUDE_BAND.POLAR) bands.polar++; else if (b === LATITUDE_BAND.SUBPOLAR) bands.subpolar++; else bands.equatorial++;
  });
  // Lądowanie na pustym ciele (bez zajętych pól) i z hipotetyczną kolonią — liczone na kopii stanu pól.
  const held = new Set();
  const cap = g.equatorTile();
  for (const t of g.within(cap, 1)) held.add(g.idOf(t));
  const saved = [];
  g.forEachTile(t => { saved.push([t, t.owner, t.buildingId, t.underConstruction, t.capitalBase]); });
  let landingColony = 0;
  const landingTiles = [];
  try {
    g.forEachTile(t => { t.owner = null; t.buildingId = null; t.underConstruction = null; t.capitalBase = false; });
    g.forEachTile(t => { if (g.isLandingEdge(t)) landingEmpty++; });
    for (const id of held) { const t = g.tile(id); t.owner = 'preview'; }
    g.tile(g.idOf(cap)).capitalBase = true;
    g.forEachTile(t => { if (g.isLandingEdge(t)) { landingColony++; landingTiles.push(g.idOf(t)); } });
  } finally {
    for (const [t, o, b, u, c] of saved) { t.owner = o; t.buildingId = b; t.underConstruction = u; t.capitalBase = c; }
  }
  const n = g.tiles().length;
  return {
    name: body?.name ?? null, archetype: body?.bodyArchetype ?? null, gridClass: spec?.gridClass ?? grid.gridClass,
    n: grid.n, tiles: n, pentagons: pent, source,
    terrainShares: Object.fromEntries(Object.entries(terrain).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / n).toFixed(3)])),
    latitude: bands, anomalies, anomaliesOnPent,
    landing: { emptyBody: landingEmpty, withColony: landingColony, capital: g.idOf(cap) },
    _landingTiles: landingTiles,
  };
}

function project(x, y, z, w, h) {
  const lon = Math.atan2(z, x), lat = Math.asin(Math.max(-1, Math.min(1, y)));
  return [((lon + Math.PI) / (2 * Math.PI)) * w, ((Math.PI / 2 - lat) / Math.PI) * h];
}

/** Rysuje siatkę na kontekście 2D (w × h, rzut equirect jak bakeEquirect). */
export function drawGeoGrid(ctx, grid, w, h, summary) {
  const g = tileGraphOf(grid);
  const landing = new Set(summary?._landingTiles ?? []);
  const capId = summary?.landing?.capital ?? null;
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
  g.forEachTile(t => {
    const c = g.centerOf(t);
    const nb = g.neighbors(t).map(x => g.centerOf(x));
    const pts = nb.map((p, m) => { const q = nb[(m + 1) % nb.length]; const v = norm([c.x + p.x + q.x, c.y + p.y + q.y, c.z + p.z + q.z]); return project(v[0], v[1], v[2], w, h); });
    const xs = pts.map(p => p[0]);
    const wrap = Math.max(...xs) - Math.min(...xs) > w / 2;
    if (wrap) for (const p of pts) if (p[0] < w / 2) p[0] += w;
    const band = g.latitudeBand(t);
    const id = g.idOf(t);
    for (const off of (wrap ? [0, -w] : [0])) {
      ctx.beginPath();
      pts.forEach((p, k) => (k ? ctx.lineTo(p[0] + off, p[1]) : ctx.moveTo(p[0] + off, p[1])));
      ctx.closePath();
      if (band !== LATITUDE_BAND.EQUATORIAL) { ctx.fillStyle = band === LATITUDE_BAND.POLAR ? 'rgba(120,200,255,0.22)' : 'rgba(120,200,255,0.10)'; ctx.fill(); }
      if (landing.has(id)) { ctx.strokeStyle = 'rgba(80,255,140,0.55)'; ctx.lineWidth = 1; }
      else { ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 1; }
      if (g.isPentagon(t)) { ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 2.5; }
      ctx.stroke();
    }
    const [px, py] = project(c.x, c.y, c.z, w, h);
    ctx.fillStyle = TERRAIN_DOT[t.type] ?? '#ff00ff';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(px, py, 3.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    if (t.anomaly) { ctx.strokeStyle = '#ff40ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 8, 0, 2 * Math.PI); ctx.stroke(); }
    if (id === capId) { ctx.strokeStyle = '#ff3030'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px - 9, py - 9); ctx.lineTo(px + 9, py + 9); ctx.moveTo(px + 9, py - 9); ctx.lineTo(px - 9, py + 9); ctx.stroke(); }
  });
}

function openOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
  const box = document.createElement('div');
  box.id = OVERLAY_ID;
  box.style.cssText = 'position:fixed;inset:24px;z-index:100000;background:rgba(6,10,16,0.96);border:1px solid #3a5a7a;'
    + 'color:#cfe3f5;font:12px monospace;overflow:auto;padding:12px 14px;';
  const close = document.createElement('button');
  close.textContent = '×';
  close.dataset.action = 'cs-geogrid-close';
  close.style.cssText = 'position:sticky;top:0;float:right;font:18px monospace;background:#16283a;color:#cfe3f5;border:1px solid #3a5a7a;cursor:pointer;width:32px;height:32px;';
  close.onclick = () => box.remove();
  box.appendChild(close);
  document.body.appendChild(box);
  return box;
}

/** csGeoGrid() — siatka geo aktywnego ciała nad mapą bohatera. Zwraca podsumowanie + `done` (po narysowaniu). */
export function csGeoGrid() {
  const body = selectedBody();
  const pick = geoGridForPreview(body);
  if (!pick) { console.warn('[csGeoGrid]', body?.name ?? null, body?.bodyArchetype ?? null, 'no geo grid (gas or no surface)'); return null; }
  const summary = geoGridSummary(body, pick.grid, pick.source);
  const pub = { ...summary }; delete pub._landingTiles;
  console.log('[csGeoGrid]', JSON.stringify(pub));
  const box = openOverlay();
  const head = document.createElement('div');
  head.style.cssText = 'font:14px monospace;margin:4px 0 10px;';
  head.textContent = `${pub.name} · ${pub.archetype} · ${pub.gridClass} · n=${pub.n} · ${pub.tiles} tiles · ${pub.pentagons} pentagons · `
    + `landing ${pub.landing.withColony} (empty ${pub.landing.emptyBody}) · anomalies ${pub.anomalies} (${pub.anomaliesOnPent} on pentagons) · ${pub.source}`;
  box.appendChild(head);
  const done = surfaceCacheOf().request(body, 'hero', SURFACE_PRIORITY.HERO).then((map) => {
    const W = map?.w ?? 1024, H = map?.h ?? 512;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.dataset.role = 'cs-geogrid-canvas';
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, W, H);
    try {
      if (map) {
        const arch = geoGridSpecFor(body)?.arch;
        const info = surfaceInfo(body.surfaceSeed, arch, surfaceParamsOf(body));
        const { rgba } = composePreview(map.data, W, H, arch, info);
        ctx.putImageData(new ImageData(rgba, W, H), 0, 0);
      }
    } catch (e) { console.warn('[csGeoGrid] compose', e?.message ?? e); }
    drawGeoGrid(ctx, pick.grid, W, H, summary);
    cv.style.cssText = 'width:1024px;max-width:100%;border:1px solid #3a5a7a;';
    box.appendChild(cv);
    const legend = document.createElement('div');
    legend.style.cssText = 'margin-top:8px;opacity:0.85;';
    legend.textContent = [...LEGEND, ...Object.entries(pub.terrainShares).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`)].join(' · ');
    box.appendChild(legend);
    return { ...pub, drawn: true };
  });
  return { ...pub, done };
}
