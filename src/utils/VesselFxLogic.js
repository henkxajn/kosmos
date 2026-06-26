// ── Fleet Command Console — Vessel FX logic (pure, no THREE) ─────────────────
// Reguły fog-of-war (intel) + kolor frakcji dla efektów statków na mapie 3D.
// Czyste funkcje przyjmujące prymitywy (bez `window.KOSMOS`, bez THREE) — w pełni
// testowalne offline w Node ESM. ThreeRenderer deleguje tu z metod, składając
// wejścia z globali. Wzór: RaycasterPure.js.

// Czy endpoint (statek) jest „widoczny" dla gracza wg jakości intel.
// Own (isEnemy=false) zawsze widoczny. Wróg tylko przy contact/detailed.
// quality: 'unknown' | 'rumor' | 'contact' | 'detailed' | null
export function isEndpointVisibleByQuality(isEnemy, quality) {
  if (!isEnemy) return true;
  return quality === 'contact' || quality === 'detailed';
}

// Resolver endpointu FX (gameplay coords — renderer aplikuje S()/skalę osobno).
// own → live; enemy unknown → visible:false (BRAK przecieku); rumor → positionLastKnown
// (NIE live — fog-of-war); contact/detailed → live.
// in: { isEnemy, livePos:{x,y}|null, quality, positionLastKnown:{x,y}|null }
// out: { x, y, visible } | null
export function resolveFxEndpointRaw({ isEnemy, livePos, quality, positionLastKnown }) {
  if (!livePos || !Number.isFinite(livePos.x) || !Number.isFinite(livePos.y)) return null;
  if (!isEnemy) return { x: livePos.x, y: livePos.y, visible: true };
  const q = quality ?? 'unknown';
  if (q === 'unknown') return { x: 0, y: 0, visible: false };
  if (q === 'rumor') {
    const p = positionLastKnown;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return { x: 0, y: 0, visible: false };
    return { x: p.x, y: p.y, visible: true };
  }
  return { x: livePos.x, y: livePos.y, visible: true };  // contact/detailed → live
}

// Kolor frakcji statku (0xRRGGBB). own=mint, enemy=archetyp(lub fallback red), wrak=szary.
// archetypeColor: '#RRGGBB' | 0xRRGGBB | null
export function factionColorRaw({ isWreck, isEnemy, archetypeColor }) {
  if (isWreck) return 0x888888;
  if (!isEnemy) return 0x44cc66;  // own mint (cargo-green)
  if (archetypeColor != null) {
    return typeof archetypeColor === 'string'
      ? parseInt(archetypeColor.replace('#', ''), 16)
      : archetypeColor;
  }
  return 0xff4466;  // fallback enemy red
}
