// TerritoryRenderLogic — decyzja WIDOCZNOŚCI stref wpływów per właściciel
// (fog-of-war + wrogość). Czyste funkcje (zero canvasa) — testowalne headless.

const RANK = { unknown: 0, rumor: 1, contact: 2, detailed: 3 };

// Zwraca [{ ownerId, mode: 'full'|'outline'|'skip', atWar }]:
//   gracz              → full (zawsze)
//   AI intel ≥ contact → full (tint + kolorowa izolinia); atWar gdy wojna
//   AI intel = rumor   → outline (szary zarys, BEZ tintu)
//   AI unknown         → skip
export function resolveTerritoryVisibility(ownerIds, { isPlayer, intelLevelOf, isAtWarWith }) {
  const out = [];
  for (const ownerId of ownerIds) {
    if (isPlayer(ownerId)) { out.push({ ownerId, mode: 'full', atWar: false }); continue; }
    const rank = RANK[intelLevelOf(ownerId) ?? 'unknown'] ?? 0;
    if (rank >= RANK.contact)     out.push({ ownerId, mode: 'full',    atWar: !!isAtWarWith(ownerId) });
    else if (rank === RANK.rumor) out.push({ ownerId, mode: 'outline', atWar: !!isAtWarWith(ownerId) });
    else out.push({ ownerId, mode: 'skip', atWar: false });
  }
  return out;
}

// Buduje payload dla StratcomGalaxyRenderer.setTerritory (B5, render 3D):
//   full  → mask (tint) + loops; outline → loops-only (szary); skip → pominięte.
// sig = version + stan fog (owner:mode) → rebuild 3D tylko przy realnej zmianie.
// territories: [{ ownerId, color, mask, maskBounds, loops }]; visList: resolveTerritoryVisibility.
export function buildTerritory3DPayload(territories, visList, { fillAlpha = 0.07 } = {}) {
  const byOwner = new Map(visList.map(v => [v.ownerId, v]));
  const layers = [];
  for (const td of territories) {
    const v = byOwner.get(td.ownerId);
    if (!v || v.mode === 'skip') continue;
    layers.push({
      ownerId: td.ownerId,                                   // klucz merge-flash (B6)
      colorHex: td.color, mode: v.mode, atWar: !!v.atWar,   // atWar → war-pulse 3D (B6)
      mask: v.mode === 'full' ? td.mask : null,
      maskBounds: td.maskBounds, loops: td.loops,
      contours: v.mode === 'full' ? (td.contours ?? []) : [],   // H4 warstwice tylko dla full
      hash: td.hash ?? '',
    });
  }
  // Sygnatura = content-hash + fog + atWar (B6): rebuild TYLKO przy realnej zmianie danych.
  const sig = layers.map(l => `${l.colorHex}:${l.mode}:${l.atWar ? 1 : 0}:${l.hash}`).join('|');
  return { sig, fillAlpha, layers };
}

// Alpha „rozlanego światła" (H4) dla piksela maski. m: 0..255 (128 = izolinia ISO).
// Front (izolinia) → fullA; rdzeń (maska ≥ HI) → fullA × coreMult (jaśniej). Poza izolinią → 0.
// Zastępuje płaskie binarne wypełnienie („kolorem, ale płasko"). Czyste — headless-testowalne.
export function poolFillAlpha(m, fullA, cfg = {}) {
  if (m < 128) return 0;
  const lo = cfg.POOL_LUMA_LO ?? 128, hi = cfg.POOL_LUMA_HI ?? 240, coreMult = cfg.POOL_CORE_MULT ?? 2.6;
  const t = Math.min(1, Math.max(0, (m - lo) / Math.max(1, hi - lo)));
  return Math.min(255, Math.round(fullA * (1 + (coreMult - 1) * t)));
}

// H6 „konstelacja": minimalne drzewo rozpinające (Prim) po układach gracza → krawędzie
// [[i,j]] łączące całą sieć minimalnym dystansem 3D, bez cykli. nodes: [{x,y,z}]. Czyste.
export function computeOwnedLanes(nodes) {
  const n = nodes?.length ?? 0;
  if (n < 2) return [];
  const inTree = new Array(n).fill(false);
  const edges = [];
  inTree[0] = true;
  const d2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z ?? 0) - (b.z ?? 0); return dx*dx + dy*dy + dz*dz; };
  for (let added = 1; added < n; added++) {
    let best = -1, bestFrom = -1, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (!inTree[i]) continue;
      for (let j = 0; j < n; j++) {
        if (inTree[j]) continue;
        const d = d2(nodes[i], nodes[j]);
        if (d < bestD) { bestD = d; best = j; bestFrom = i; }
      }
    }
    if (best < 0) break;
    inTree[best] = true;
    edges.push([bestFrom, best]);
  }
  return edges;
}

// Współczynnik rozbłysku (1→0 przez durationMs; 0 poza oknem). Merge-flash 2D/3D (B6).
export function mergeFlashFactor(now, startTs, durationMs) {
  if (!startTs) return 0;
  const t = (now - startTs) / durationMs;
  return (t < 0 || t > 1) ? 0 : 1 - t;
}

// Lazy-start rozbłysku: zrost zwykle następuje przy ZAMKNIĘTYM Stratcomie, więc zegar
// FLASH_MS startujemy dopiero przy PIERWSZYM narysowaniu warstwy po evencie. 'start' gdy
// event świeży (< maxAgeMs), 'discard' gdy zbyt stary (zrost dawno temu — gracz go pominął).
export function classifyPendingFlash(evtMs, nowMs, maxAgeMs) {
  return (nowMs - evtMs) < maxAgeMs ? 'start' : 'discard';
}
