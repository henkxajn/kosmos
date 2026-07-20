// TerritoryField — pole wpływu imperiów + kontury (marching squares). Czysta logika,
// zero renderu (B4/B5 rysują). Źródło własności: TerritoryService (window.KOSMOS).
//
// Przeliczanie:
//   - territory:ownersChanged → _dirty (zmiana własności; recompute na najbliższym
//     odczycie/ticku, świeży devScore bo service też zinwalidowany eventem).
//   - time:tick co civMonth → WYMUSZONY territoryService.reindex() + recompute():
//     wzrost populacji NIE emituje eventu lifecycle i NIE ustawia _dirty, a indeks
//     TerritoryService jest event-frozen — bez wymuszenia pole nigdy by nie rosło.

import EventBus from '../core/EventBus.js';
import { GAME_CONFIG } from '../config/GameConfig.js';

const RECOMPUTE_INTERVAL_YEARS = 1 / 12;   // civMonth — throttle wzrostu devScore
const MIN_EXTENT_LY = 6;
const MAX_GRID = 200;                        // bezpiecznik rozmiaru siatki

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp  = (a, b, t) => a + (b - a) * t;

export class TerritoryField {
  constructor() {
    this._territories = new Map();   // ownerId → { ownerId, color, loops, mask, maskBounds }
    this._loopCounts  = new Map();   // ownerId → poprzednia liczba pętli (territory:merged)
    this._sourceCounts = new Map();  // ownerId → poprzednia liczba źródeł (guard: utrata ≠ zrost)
    this._computed = false;
    this._dirty = true;
    this._version = 0;   // bump na recompute — sygnatura rebuildu renderu 3D (B5)
    this._lastComputeYear = -Infinity;
    this._onOwnersChanged = () => { this._dirty = true; };
    this._onTick = () => this._maybeRecompute();
    EventBus.on('territory:ownersChanged', this._onOwnersChanged);
    EventBus.on('time:tick', this._onTick);
  }

  getTerritory(ownerId) { this._ensure(); return this._territories.get(ownerId) ?? null; }
  getAllTerritories()   { this._ensure(); return [...this._territories.values()]; }
  getVersion()          { return this._version; }   // rośnie z każdym recompute (B5 sygnatura)

  // Odczyt: przelicz gdy nigdy nie liczono LUB zmiana własności (świeżość po podboju/kolonizacji).
  _ensure() { if (!this._computed || this._dirty) this.recompute(); }

  // Tick: co civMonth WYMUŚ świeży devScore (wzrost pop bez eventu) + recompute.
  _maybeRecompute() {
    const now = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    if (now - this._lastComputeYear < RECOMPUTE_INTERVAL_YEARS) return;   // throttle: max raz/civMonth
    window.KOSMOS?.territoryService?.reindex();   // odśwież devScore w indeksie własności
    this.recompute();
  }

  recompute() {
    this._dirty = false;
    this._computed = true;
    this._version++;
    this._lastComputeYear = window.KOSMOS?.timeSystem?.gameTime ?? this._lastComputeYear;
    this._territories.clear();

    // Kill-switch: OFF = zero kosztu (Stratcom bez warstwy politycznej)
    if (!GAME_CONFIG.FEATURES?.territoryOverlay) { EventBus.emit('territory:changed', {}); return; }

    const terr = window.KOSMOS?.territoryService;
    const galaxy = window.KOSMOS?.galaxyData;
    if (!terr || !galaxy?.systems?.length) { EventBus.emit('territory:changed', {}); return; }

    const cfg = GAME_CONFIG.TERRITORY;
    const DEV_FULL = cfg.DEV_FULL;

    // 1. Właściciele → ich układy (pozycja + promień z devScore/kind)
    const ownerIds = new Set();
    for (const sys of galaxy.systems) { const o = terr.getSystemOwner(sys.id); if (o) ownerIds.add(o); }
    const owners = new Map();   // ownerId → [{x,y,r}]
    let maxCoord = 0;
    for (const ownerId of ownerIds) {
      const sources = [];
      for (const o of terr.getOwnedSystems(ownerId)) {
        const sys = galaxy.systems.find(s => s.id === o.systemId);
        if (!sys) continue;
        const r = o.kind === 'station'
          ? cfg.R_STATION_LY
          : clamp(lerp(cfg.R_MIN_LY, cfg.R_MAX_LY, clamp(o.devScore / DEV_FULL, 0, 1)), cfg.R_MIN_LY, cfg.R_MAX_LY);
        sources.push({ x: sys.x ?? 0, y: sys.y ?? 0, r });
        maxCoord = Math.max(maxCoord, Math.abs(sys.x ?? 0), Math.abs(sys.y ?? 0));
      }
      if (sources.length) owners.set(ownerId, sources);
    }
    if (owners.size === 0) { EventBus.emit('territory:changed', {}); return; }

    // 2. Siatka wspólna dla wszystkich (spójne maski dla B5)
    const cell = cfg.GRID_LY;
    // Margines ×2 R_MAX: pole superponuje się (N źródeł), więc pojedynczy R_MAX nie
    // gwarantuje, że izolinia zmieści się w siatce przy klastrze kolonii u krawędzi.
    // ×2 domyka kontur nawet dla gęstego skupiska (exp(-(2R)²/R²)≈0.02/źródło).
    const EXTENT = Math.max(MIN_EXTENT_LY, maxCoord + cfg.R_MAX_LY * 2 + cell);
    const nx = Math.min(MAX_GRID, Math.ceil((2 * EXTENT) / cell) + 1);
    const ny = nx;
    const X0 = -EXTENT, Y0 = -EXTENT;
    const stepX = (2 * EXTENT) / (nx - 1), stepY = (2 * EXTENT) / (ny - 1);
    const nodeX = (i) => X0 + i * stepX, nodeY = (j) => Y0 + j * stepY;

    // 3. Pole per właściciel na siatce
    const fields = new Map();
    for (const [ownerId, sources] of owners) {
      const f = new Float64Array(nx * ny);
      for (let j = 0; j < ny; j++) {
        const py = nodeY(j);
        for (let i = 0; i < nx; i++) {
          const px = nodeX(i);
          let v = 0;
          for (const s of sources) { const dx = px - s.x, dy = py - s.y; v += Math.exp(-(dx * dx + dy * dy) / (s.r * s.r)); }
          f[j * nx + i] = v;
        }
      }
      fields.set(ownerId, f);
    }

    // 4. Kontury (marching squares → pętle) + maska + contested — per właściciel
    const ISO = cfg.ISO;
    for (const [ownerId, f] of fields) {
      const segs = marchingSquares(f, nx, ny, ISO, nodeX, nodeY);
      const loops = stitchLoops(segs);
      for (const loop of loops) {
        loop.contested = false;
        for (let k = 0; k < loop.pts.length; k++) {
          const a = loop.pts[k], b = loop.pts[(k + 1) % loop.pts.length];
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          let otherMax = 0;
          for (const [oid, of] of fields) { if (oid === ownerId) continue; otherMax = Math.max(otherMax, sampleNearest(of, nx, ny, X0, Y0, stepX, stepY, mx, my)); }
          if (otherMax > cfg.CONTESTED_T) { loop.contested = true; break; }
        }
      }
      const mask = new Uint8Array(nx * ny);
      for (let k = 0; k < f.length; k++) mask[k] = Math.min(255, Math.round((f[k] / ISO) * 128));
      this._territories.set(ownerId, {
        ownerId, color: terr.getEmpireColor(ownerId), loops, mask,
        maskBounds: { x0: X0, y0: Y0, cell: stepX, nx, ny },
        hash: territoryHash(mask, loops),   // content-hash → sygnatura rebuildu 3D (B6)
      });
    }

    // 5. territory:merged — pętle SPADŁY oraz liczba źródeł NIE zmalała
    //    (utrata odległej kolonii też redukuje pętle, ale to NIE zrost bąbli).
    for (const [ownerId, td] of this._territories) {
      const prevLoops = this._loopCounts.get(ownerId);
      const prevSrc   = this._sourceCounts.get(ownerId);
      const curLoops  = td.loops.length;
      const curSrc    = owners.get(ownerId).length;
      if (prevLoops != null && curLoops < prevLoops && (prevSrc == null || curSrc >= prevSrc)) {
        EventBus.emit('territory:merged', { ownerId, from: prevLoops, to: curLoops });
      }
      this._loopCounts.set(ownerId, curLoops);
      this._sourceCounts.set(ownerId, curSrc);
    }
    for (const oid of [...this._loopCounts.keys()]) {
      if (!this._territories.has(oid)) { this._loopCounts.delete(oid); this._sourceCounts.delete(oid); }
    }

    EventBus.emit('territory:changed', {});
  }

  dispose() {
    EventBus.off('territory:ownersChanged', this._onOwnersChanged);
    EventBus.off('time:tick', this._onTick);
    this._territories.clear();
    this._loopCounts.clear();
    this._sourceCounts.clear();
  }
}

// ── Pomocnicze (czyste) ──────────────────────────────────────────────────────
// Tani content-hash (FNV-1a) maski + pętli — sygnatura rebuildu renderu 3D (B6).
// Miesięczny wymuszony recompute z tymi samymi danymi daje ten sam hash → brak
// przebudowy sceny WebGL (w przeciwieństwie do licznika _version, który rósł zawsze).
function territoryHash(mask, loops) {
  let h = 2166136261 >>> 0;
  const bump = (x) => { h = Math.imul(h ^ (x & 0xff), 16777619) >>> 0; };
  bump(mask.length); bump(mask.length >>> 8);
  for (let i = 0; i < mask.length; i += 13) bump(mask[i]);
  bump(loops.length);
  for (const lp of loops) {
    bump(lp.pts.length); bump(lp.contested ? 1 : 0);
    const p = lp.pts[0]; if (p) { bump(Math.round(p.x)); bump(Math.round(p.y)); }
  }
  return h.toString(36);
}

function sampleNearest(f, nx, ny, X0, Y0, stepX, stepY, x, y) {
  const i = clamp(Math.round((x - X0) / stepX), 0, nx - 1);
  const j = clamp(Math.round((y - Y0) / stepY), 0, ny - 1);
  return f[j * nx + i];
}

// Marching squares z interpolacją → segmenty {a:{x,y}, b:{x,y}}. Bity: a=BL(1) b=BR(2) c=TR(4) d=TL(8).
function marchingSquares(f, nx, ny, ISO, nodeX, nodeY) {
  const segs = [];
  const ip = (x1, y1, v1, x2, y2, v2) => { const t = v1 === v2 ? 0.5 : (ISO - v1) / (v2 - v1); return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) }; };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const x = nodeX(i), y = nodeY(j), X = nodeX(i + 1), Y = nodeY(j + 1);
    const va = f[j*nx+i], vb = f[j*nx+i+1], vc = f[(j+1)*nx+i+1], vd = f[(j+1)*nx+i];
    let idx = 0; if (va>ISO) idx|=1; if (vb>ISO) idx|=2; if (vc>ISO) idx|=4; if (vd>ISO) idx|=8;
    if (idx === 0 || idx === 15) continue;
    const eB = () => ip(x,y,va, X,y,vb), eR = () => ip(X,y,vb, X,Y,vc), eT = () => ip(x,Y,vd, X,Y,vc), eL = () => ip(x,y,va, x,Y,vd);
    const P = (p,q) => segs.push({ a: p, b: q });
    switch (idx) {
      case 1:  P(eL(),eB()); break;   case 2:  P(eB(),eR()); break;   case 3:  P(eL(),eR()); break;
      case 4:  P(eR(),eT()); break;   case 6:  P(eB(),eT()); break;   case 7:  P(eL(),eT()); break;
      case 8:  P(eT(),eL()); break;   case 9:  P(eB(),eT()); break;   case 11: P(eT(),eR()); break;
      case 12: P(eL(),eR()); break;   case 13: P(eB(),eR()); break;   case 14: P(eL(),eB()); break;
      case 5:  { const c=(va+vb+vc+vd)/4; if (c>ISO){P(eB(),eR());P(eT(),eL());} else {P(eL(),eB());P(eR(),eT());} break; }
      case 10: { const c=(va+vb+vc+vd)/4; if (c>ISO){P(eL(),eB());P(eR(),eT());} else {P(eB(),eR());P(eT(),eL());} break; }
    }
  }
  return segs;
}

// Segmenty → zamknięte pętle (dopasowanie końców z kwantyzacją; bez zdublowanego punktu zamykającego)
function stitchLoops(segs) {
  const EPS = 1e-4;
  const key = (p) => `${Math.round(p.x / EPS)}:${Math.round(p.y / EPS)}`;
  const byPoint = new Map();
  segs.forEach((s, idx) => {
    for (const p of [s.a, s.b]) {
      const k = key(p);
      let arr = byPoint.get(k);
      if (!arr) { arr = []; byPoint.set(k, arr); }
      arr.push(idx);
    }
  });
  const used = new Array(segs.length).fill(false);
  const loops = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = true;
    const pts = [{ ...segs[s0].a }, { ...segs[s0].b }];
    const startKey = key(segs[s0].a);
    let endKey = key(segs[s0].b), guard = 0, closed = false;
    while (guard++ < segs.length + 2) {
      const cands = (byPoint.get(endKey) ?? []).filter(idx => !used[idx]);
      if (!cands.length) break;
      const ni = cands[0]; used[ni] = true;
      const s = segs[ni];
      const next = key(s.a) === endKey ? s.b : s.a;
      pts.push({ ...next }); endKey = key(next);
      if (endKey === startKey) { pts.pop(); closed = true; break; }   // domknięcie: usuń zdublowany punkt
    }
    // Emituj TYLKO zamknięte pętle. Otwarty łańcuch = artefakt przycięcia siatki
    // (margines EXTENT ×2 mu zapobiega) — pomijamy zamiast domykać fałszywą cięciwą,
    // która psułaby contested i licznik pętli (territory:merged).
    if (closed && pts.length >= 3) loops.push({ pts, contested: false });
  }
  return loops;
}
