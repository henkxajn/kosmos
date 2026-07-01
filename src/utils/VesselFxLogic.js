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

// ── Efekty silnikowe / eksplozje (kolory + intensywność) ────────────────────
// Kolory jako stałe — jedno źródło prawdy (ThreeRenderer importuje).
export const EXHAUST_COLOR_DEFAULT = 0x66ccff;  // plume napędu (cyan)
export const EXHAUST_COLOR_ENEMY   = 0xff8844;  // plume wroga (ciepły pomarańcz)
export const EXPLOSION_RING_COLOR  = 0xff6622;  // pierścień uderzeniowy eksplozji
export const WRECK_EMISSIVE_COLOR  = 0xff2200;  // żarząca się poświata wraka (dogorywające reaktory)

// Kolor wydechu silnika (0xRRGGBB). Domyślnie cyan; wróg cieplejszy dla kontrastu.
export function exhaustColorRaw({ isEnemy = false } = {}) {
  return isEnemy ? EXHAUST_COLOR_ENEMY : EXHAUST_COLOR_DEFAULT;
}

// Gradient smugi plazmowej (vertex colors). apex = przy rufie (jasny), base = koniec
// smugi (ciemniejszy). Alpha (apex 1 → base 0) nadaje renderer z pozycji Y wierzchołka
// — tu tylko RGB (0..1). own = biało-niebieski→niebieski; wróg = biało-pomarańcz→czerwony.
export function exhaustGradientColors({ isEnemy = false } = {}) {
  if (isEnemy) {
    return { apex: { r: 1.0, g: 0.85, b: 0.55 }, base: { r: 1.0, g: 0.35, b: 0.10 } };
  }
  return { apex: { r: 0.85, g: 0.95, b: 1.0 }, base: { r: 0.30, g: 0.60, b: 1.0 } };
}

// Intensywność wydechu 0..1 wg stanu statku. Pełna w tranzycie, zero przy
// orbiting/docked/wrak. state: 'in_transit' | 'orbiting' | 'docked' | undefined.
export function exhaustIntensityRaw({ state, isWreck = false } = {}) {
  if (isWreck) return 0;
  return state === 'in_transit' ? 1 : 0;
}

// Rampa koloru kuli ognia eksplozji: progress 0→1 = biały → pomarańcz → czerwony.
// Zwraca {r,g,b} w 0..1 (renderer aplikuje przez color.setRGB — bez THREE tutaj).
export function explosionColorRaw(progress) {
  const p = Math.max(0, Math.min(1, progress));
  const lerp = (a, b, t) => a + (b - a) * t;
  if (p < 0.5) {
    // biały (1,1,1) → pomarańcz (1, 0.5, 0.1)
    const t = p / 0.5;
    return { r: 1, g: lerp(1, 0.5, t), b: lerp(1, 0.1, t) };
  }
  // pomarańcz (1, 0.5, 0.1) → czerwony (0.8, 0.05, 0)
  const t = (p - 0.5) / 0.5;
  return { r: lerp(1, 0.8, t), g: lerp(0.5, 0.05, t), b: lerp(0.1, 0.0, t) };
}
