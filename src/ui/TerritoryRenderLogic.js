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
export function buildTerritory3DPayload(territories, visList, { fillAlpha = 0.07, version = 0 } = {}) {
  const byOwner = new Map(visList.map(v => [v.ownerId, v]));
  const layers = [];
  for (const td of territories) {
    const v = byOwner.get(td.ownerId);
    if (!v || v.mode === 'skip') continue;
    layers.push({
      colorHex: td.color, mode: v.mode,
      mask: v.mode === 'full' ? td.mask : null,
      maskBounds: td.maskBounds, loops: td.loops,
    });
  }
  const sig = `${version}#` + visList.map(v => `${v.ownerId}:${v.mode}`).join(',');
  return { sig, fillAlpha, layers };
}
