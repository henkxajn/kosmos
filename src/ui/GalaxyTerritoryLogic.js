// GalaxyTerritoryLogic — ARC GALAXY, krok G2-3 (docs/design/GALAXY_PLAN.md §4 G2; D-GX-15 (a); rama F5 A/B/C): CZYSTA
// logika TERYTORIUM na płycie galaktyki — ładunek dla płaszczyzn „rozlanego światła” (pole wpływu per właściciel z
// `TerritoryField`), zasłon granicy z pętli izolinii, aureoli własności gwiazd i słupków. Scena — `renderer/GalaxyTerritory.js`
// i `renderer/GalaxyPlate.js`.
//   • POLE (D-GX-15 (a)): `TerritoryField` trzyma pole każdego właściciela jako `Float32Array field` obok maski (ta sama siatka
//     — `maskBounds`, `GRID_LY` 0,75 → nx ≈ 83; hash i dotychczasowi konsumenci bez zmian). Jedna tekstura 1-kanałowa na
//     właściciela; RDZEŃ = miękkie światło z pola, KRAWĘDŹ = cienka jasna linia z gradientu pola (izolinia ISO), SZEW SPORNY
//     = gorąca biel z maksimum pól POZOSTAŁYCH widocznych właścicieli w tym samym tekselu (`othersMaxField`).
//   • MGŁA (`resolveTerritoryVisibility`, bez zmian): gracz — pełne; AI z wywiadem ≥ `contact` — pełne (+ puls wrogości przy
//     wojnie); `rumor` — sam szary zarys; `unknown` — nic (ani płaszczyzna, ani udział w szwie spornym — szew nie zdradza
//     terytorium, którego gracz nie widzi).
//   • SYGNATURA = siatka + barwa + tryb + wojna + content-hash pola (wzór `buildTerritory3DPayload` — B6): miesięczne
//     przeliczenie z tymi samymi danymi nie przebudowuje tekstur.
//   • AUREOLA WŁASNOŚCI (C): gwiazdy układów z właścicielem w barwie imperium (`EMPIRE_COLOR_PALETTE` — tożsamość; wrogość
//     — puls krawędzi, nie barwa); gracz zawsze, AI od `contact` (kanon A14 — znacznik właściciela Stratcomu).
//   • SŁUPKI: wyłącznie układy GRACZA + gwiazda zaznaczona (`riserEndpoints` — `HolotableCamera`).
// Czysty: bez three, bez DOM, bez `window`.
import { resolveTerritoryVisibility } from './TerritoryRenderLogic.js';

/** Widoczność terytoriów (fog-of-war + wojna) — kanon `TerritoryRenderLogic` dla listy właścicieli. */
export function plateTerritoryVisibility(territories, { intelLevelOf = () => 'unknown', isAtWarWith = () => false } = {}) {
  return resolveTerritoryVisibility((territories ?? []).map((td) => td.ownerId), {
    isPlayer: (o) => o === 'player', intelLevelOf, isAtWarWith,
  });
}

/**
 * Maksimum pól POZOSTAŁYCH właścicieli w każdym tekselu (ta sama siatka). `fields` — `[Float32Array | null]` w kolejności
 * warstw; brak pola — pominięty. Zwraca tablicę tej samej długości (`null` dla warstwy bez pola).
 */
export function othersMaxField(fields) {
  const list = Array.isArray(fields) ? fields : [];
  return list.map((own) => {
    if (!own) return null;
    const out = new Float32Array(own.length);
    for (const f of list) {
      if (!f || f === own || f.length !== own.length) continue;
      for (let i = 0; i < f.length; i++) if (f[i] > out[i]) out[i] = f[i];
    }
    return out;
  });
}

/**
 * Ładunek płyty z `TerritoryField.getAllTerritories()` i listy widoczności.
 * @returns {{ sig:string, grid:{x0:number,y0:number,cell:number,nx:number,ny:number}|null,
 *   layers:Array<{ ownerId, color, mode:'full'|'outline', atWar:boolean, field:Float32Array|null, others:Float32Array|null,
 *   loops:Array, hash:string }> }}
 */
export function buildPlateTerritoryPayload(territories, visList) {
  const byOwner = new Map((visList ?? []).map((v) => [v.ownerId, v]));
  const visible = [];
  for (const td of territories ?? []) {
    const v = byOwner.get(td.ownerId);
    if (!v || v.mode === 'skip') continue;
    visible.push({ td, v });
  }
  const others = othersMaxField(visible.map(({ td }) => (td.field instanceof Float32Array ? td.field : null)));
  const g = visible[0]?.td?.maskBounds ?? null;
  const grid = g ? { x0: g.x0, y0: g.y0, cell: g.cell, nx: g.nx, ny: g.ny } : null;
  const layers = visible.map(({ td, v }, i) => ({
    ownerId: td.ownerId, color: td.color, mode: v.mode, atWar: !!v.atWar,
    field: td.field instanceof Float32Array ? td.field : null, others: others[i],
    loops: Array.isArray(td.loops) ? td.loops : [], hash: td.hash ?? '',
  }));
  const gk = grid ? `${grid.nx}x${grid.ny}@${grid.x0},${grid.y0},${grid.cell}` : '-';
  const sig = gk + '|' + layers.map((l) => `${l.ownerId}:${l.color}:${l.mode}:${l.atWar ? 1 : 0}:${l.hash}`).join('|');
  return { sig, grid, layers };
}

/**
 * Aureole własności gwiazd (C): układ z właścicielem (`ownerOf`) → barwa imperium; gracz zawsze, AI od wywiadu `contact`.
 * @returns {Array<{ systemId:string, ownerId:string, color:string }>}
 */
export function plateOwnerHalos({ systems = [], ownerOf = () => null, colorOf = () => '#888888',
  intelAtLeast = () => false } = {}) {
  const out = [];
  for (const s of systems ?? []) {
    if (!s || s.id == null) continue;
    const o = ownerOf(String(s.id));
    if (!o) continue;
    if (o !== 'player' && intelAtLeast(o, 'contact') !== true) continue;
    out.push({ systemId: String(s.id), ownerId: o, color: colorOf(o) });
  }
  return out;
}

/** Słupki: układy gracza + gwiazda zaznaczona (bez duplikatów, kolejność stała). */
export function plateRiserIds({ ownedIds = [], selectedId = null } = {}) {
  const out = [];
  const seen = new Set();
  for (const id of ownedIds ?? []) { const k = String(id); if (!seen.has(k)) { seen.add(k); out.push(k); } }
  if (selectedId != null && !seen.has(String(selectedId))) out.push(String(selectedId));
  return out;
}

/**
 * Pętle izolinii → pasy zasłony (płaszczyzna płyty y = 0 w ly, x = gx, z = gy galaktyki): na każdy odcinek pętli dwa trójkąty
 * od podstawy (y = 0) do szczytu (y = `height`), współrzędna `v` 0 (podstawa) → 1 (szczyt) — krycie gaśnie z wysokością.
 * @returns {{ position: Float32Array, v: Float32Array, count: number }} — `count` wierzchołków (trójkąty)
 */
export function curtainGeometry(loops, height) {
  let segs = 0;
  for (const lp of loops ?? []) segs += (lp?.pts?.length ?? 0) >= 3 ? lp.pts.length : 0;
  const position = new Float32Array(segs * 6 * 3), v = new Float32Array(segs * 6);
  let k = 0;
  const put = (x, y, z, vv) => { position[k * 3] = x; position[k * 3 + 1] = y; position[k * 3 + 2] = z; v[k] = vv; k++; };
  const h = Number.isFinite(height) && height > 0 ? height : 0;
  for (const lp of loops ?? []) {
    const p = lp?.pts ?? [];
    if (p.length < 3) continue;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      put(a.x, 0, a.y, 0); put(b.x, 0, b.y, 0); put(b.x, h, b.y, 1);
      put(a.x, 0, a.y, 0); put(b.x, h, b.y, 1); put(a.x, h, a.y, 1);
    }
  }
  return { position, v, count: k };
}

// Styl SZWU SPORNEGO (pokrętło `LIVE_GALAXY.TERR_SEAM_STYLE`; czyta je `GalaxyTerritory.tick` → uniformy płaszczyzny).
//   0 = biały gorący szew (dotychczasowy, domyślny — do czasu wyboru właściciela)
//   1 = barwy OBU imperiów przeplatane wzdłuż szwu (kreskowanie „zamek”, bez bieli)
//   2 = bez szwu — krawędzie obu imperiów nakładają się, w strefie nakładania ze zmniejszonym kryciem
// Wagi (nie przełącznik w shaderze): styl 0 daje wagi 1/0/1, więc jego wynik jest bit w bit dotychczasowym.
export const SEAM_STYLES = Object.freeze([
  Object.freeze({ style: 0, white: 1, hatch: 0, rimOverlap: 1 }),
  Object.freeze({ style: 1, white: 0, hatch: 1, rimOverlap: 1 }),
  Object.freeze({ style: 2, white: 0, hatch: 0, rimOverlap: 0.5 }),
]);

/** Parametry stylu szwu; wartość spoza {0,1,2} (brak, NaN, ułamek, tekst) → styl 0 (zachowanie dotychczasowe). */
export function seamStyleParams(style) {
  const ok = Number.isInteger(style) && style >= 0 && style < SEAM_STYLES.length;
  return { ...SEAM_STYLES[ok ? style : 0] };
}
