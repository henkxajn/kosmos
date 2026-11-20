// ColonySphereOverlayLogic — CZYSTA kompozycja stanu pól kuli kolonii (ARC COLONY SPHERE, krok CS-7; decyzje właściciela
// 4 i 6 z 2026-11-20). Z pól siatki i trybu okna liczy bajty tekstury nakładki (`ColonySphereLogic.writeOverlayTile`):
//
//   • zwykły widok — pola z budynkami: cienki obrys w barwie kategorii (CS-9; wariant A/B `full` = podbarwione pole jak
//     w CS-7), stolica złotym obrysem,
//     budowa w toku na żółto; granice własności tylko na krawędziach między polami różnych właścicieli (jak mapa 2D);
//     siatkę przy kursorze, obrys pola pod kursorem i zaznaczonego rysuje shader z uniformów;
//   • tryb budowy — każde pole dostaje werdykt: dozwolone (zielone wypełnienie + obrys), zabronione (czerwone
//     kreskowanie), zajęte (szare kreskowanie); całą siatkę włącza gospodarz (`gridAll`);
//   • soczewki Teren / Złoża / Własność — wypełnienie pola barwą z legendy;
//   • pokrycie zaopatrzenia (Shift+S) — wypełnienie jak na mapie 2D (stolica / koszary / dostawca).
//
// Pierwszeństwo wypełnienia: tryb budowy > zaopatrzenie > soczewka > budynek. Moduł bez DOM — keeper wykonuje go pod node.

import { TERRAIN_TYPES } from '../map/HexTile.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { BUILDING_CATEGORY_COLORS, BUILDING_CATEGORY_FALLBACK } from '../data/BuildingCategoryColors.js';
import { createOverlayData, writeOverlayTile, borderMaskOf } from '../renderer/ColonySphereLogic.js';

export const SPHERE_LENSES = Object.freeze(['none', 'terrain', 'deposits', 'ownership']);

/** Następna soczewka w cyklu klawisza (brak → Teren → Złoża → Własność → brak). */
export function nextLens(lens) {
  const i = SPHERE_LENSES.indexOf(lens);
  return SPHERE_LENSES[(i < 0 ? 0 : i + 1) % SPHERE_LENSES.length];
}

/**
 * CS-9 — barwa kategorii na polu z budynkiem. Portret budynku jest grafiką właściciela, więc domyślnie barwa kategorii to
 * tylko CIENKI OBRYS pola (`subtle`); `full` = dawne podbarwienie całego pola (CS-7) — zostaje jako wariant A/B.
 */
export const BUILDING_TINT = Object.freeze({ SUBTLE: 'subtle', FULL: 'full' });
export const BUILDING_TINT_DEFAULT = BUILDING_TINT.SUBTLE;
/** Krycie obrysu / wypełnienia pola z budynkiem i placu budowy per wariant (0…255) + szerokość obrysu [px]. */
export const BUILDING_TINT_STYLE = Object.freeze({
  subtle: Object.freeze({ line: 190, fill: 0, width: 1.3, constructionLine: 190, constructionFill: 0 }),
  full:   Object.freeze({ line: 225, fill: 84, width: 1.6, constructionLine: 215, constructionFill: 64 }),
});

/** Werdykty pola w trybie budowy. */
export const BUILD_VERDICT = Object.freeze({ OK: 'ok', BLOCKED: 'blocked', OCCUPIED: 'occupied' });

// Barwy [r, g, b] w 0…255 (krycie osobno).
const C = Object.freeze({
  ok: [70, 230, 120], blocked: [235, 70, 60], occupied: [140, 150, 165],
  construction: [255, 221, 68], capital: [255, 200, 60],   // stolica: złoto (jak pierścień znacznika)
  own: [100, 160, 255], foreign: [216, 90, 48], neutral: [120, 130, 140],        // jak granice mapy 2D (#64A0FF / #D85A30)
  supplyCapital: [50, 220, 100], supplyBarracks: [60, 150, 230], supplyOther: [230, 150, 50],
  strategic: [255, 208, 64], anomaly: [190, 120, 255], richOre: [230, 150, 60], ore: [170, 120, 70], poor: [70, 70, 78],
});

export function hexToBytes(hex) {
  const n = typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Barwa kategorii budynku [r, g, b] (0…255). */
export function categoryBytes(category) {
  return hexToBytes(BUILDING_CATEGORY_COLORS[category] ?? BUILDING_CATEGORY_FALLBACK);
}

/** Barwa terenu pola [r, g, b] (0…255) — legenda soczewki Teren i fallback 2D. */
export function terrainBytes(type) {
  return hexToBytes(TERRAIN_TYPES[type]?.color ?? 0x556070);
}

/** Barwy pól dla fallbacku 2D (napisy CSS). */
export function fallbackColorsOf(tiles) {
  return tiles.map(t => { const c = terrainBytes(t?.type); return `rgb(${c[0]},${c[1]},${c[2]})`; });
}

/** Soczewka Złoża: klasa pola → barwa + krycie. Złoża są per ciało (D-CS-6) — soczewka pokazuje, GDZIE kopalnia daje najwięcej. */
export function depositLensOf(tile) {
  const terr = TERRAIN_TYPES[tile?.type];
  if (tile?.strategicResource) return { rgb: C.strategic, a: 190, cls: 'strategic' };
  if (tile?.anomaly && tile.anomalyDetected) return { rgb: C.anomaly, a: 170, cls: 'anomaly' };
  if (!terr?.buildable) return { rgb: C.poor, a: 120, cls: 'none' };
  const allowsMining = terr.allowedCategories?.includes('mining');
  const y = terr.yieldBonus?.mining ?? terr.yieldBonus?.default ?? 1;
  if (!allowsMining) return { rgb: C.poor, a: 90, cls: 'none' };
  if (y >= 1.3) return { rgb: C.richOre, a: 170, cls: 'rich' };
  if (y >= 1.0) return { rgb: C.ore, a: 120, cls: 'normal' };
  return { rgb: C.ore, a: 70, cls: 'poor' };
}

/** Grupa własności pola (porównywana między sąsiadami): właściciel albo pusty napis. */
function ownerOf(tile) { return tile?.owner ?? ''; }

/**
 * Policz stan wszystkich pól.
 * @param {object} p
 * @param {object} p.topo topologia siatki (GeodesicTopology)
 * @param {object[]} p.tiles pola siatki (indeks = id pola): type, buildingId, capitalBase, underConstruction, owner…
 * @param {string} [p.lens] 'none' | 'terrain' | 'deposits' | 'ownership'
 * @param {null | ((tile:object, i:number) => string)} [p.buildVerdict] tryb budowy: pole → BUILD_VERDICT
 * @param {null | Map<number, {type:string}>} [p.supply] pokrycie zaopatrzenia: indeks pola → { type }
 * @param {string} [p.playerOwner] właściciel gracza na polach (domyślnie 'player')
 * @param {number[]} [p.accent] barwa akcentu motywu [r, g, b] (obrys stolicy)
 * @param {string} [p.tint] BUILDING_TINT — barwa kategorii jako cienki obrys (domyślnie) albo podbarwione pole (A/B)
 * @param {Uint8Array} [out] bufor do ponownego użycia
 * @returns {Uint8Array}
 */
export function composeSphereOverlay(p, out = null) {
  const { topo, tiles } = p;
  const n = topo.count;
  const data = out && out.length === createOverlayData(n).length ? out : createOverlayData(n);
  const lens = SPHERE_LENSES.includes(p.lens) ? p.lens : 'none';
  const player = p.playerOwner ?? 'player';
  const accent = p.accent ?? C.capital;
  const ts = BUILDING_TINT_STYLE[p.tint] ?? BUILDING_TINT_STYLE[BUILDING_TINT_DEFAULT];
  for (let i = 0; i < n; i++) {
    const tile = tiles[i];
    const st = { fill: null, line: null, lineWidth: 1.5, hatch: false, borderMask: 0, foreign: false };
    const own = ownerOf(tile);
    if (own) {
      st.borderMask = borderMaskOf(topo, i, (a, b) => ownerOf(tiles[a]) === ownerOf(tiles[b]));
      st.foreign = own !== player;
    }
    const b = tile?.buildingId ? BUILDINGS[tile.buildingId] : null;
    const hasBuilding = !!tile?.buildingId || !!tile?.capitalBase;

    // Budynki / stolica / budowa — obrys zawsze, wypełnienie tylko gdy nic ważniejszego go nie zajmuje.
    // Stolica (także AI) — złoty, gruby obrys, niezależny od motywu i od budynku na polu stolicy.
    if (tile?.capitalBase) { st.line = [...C.capital, 255]; st.lineWidth = 3.2; st.fill = [...C.capital, 60]; }
    else if (hasBuilding) { const c = categoryBytes(b?.category); st.line = [...c, ts.line]; st.lineWidth = ts.width; st.fill = ts.fill ? [...c, ts.fill] : null; }
    else if (tile?.underConstruction) { st.line = [...C.construction, ts.constructionLine]; st.lineWidth = ts.width; st.fill = ts.constructionFill ? [...C.construction, ts.constructionFill] : null; }

    if (lens === 'terrain') st.fill = [...terrainBytes(tile?.type), 150];
    else if (lens === 'deposits') { const d = depositLensOf(tile); st.fill = [...d.rgb, d.a]; }
    else if (lens === 'ownership') st.fill = !own ? [...C.neutral, 60] : [...(own === player ? C.own : C.foreign), tile?.occupyEmpireId ? 170 : 115];
    if (lens === 'ownership' && tile?.occupyEmpireId) st.hatch = true;

    const sup = p.supply?.get?.(i);
    if (sup) {
      st.fill = [...(sup.type === 'capital' ? C.supplyCapital : (sup.type === 'barracks' ? C.supplyBarracks : C.supplyOther)), 96];
      st.hatch = false;
    }

    if (p.buildVerdict) {
      const v = p.buildVerdict(tile, i);
      if (v === BUILD_VERDICT.OK) { st.fill = [...C.ok, 84]; st.line = [...C.ok, 235]; st.lineWidth = 1.7; st.hatch = false; }
      else if (v === BUILD_VERDICT.OCCUPIED) { st.fill = [...C.occupied, 105]; st.hatch = true; }
      else { st.fill = [...C.blocked, 112]; st.hatch = true; if (!hasBuilding) st.line = null; }
    }
    writeOverlayTile(data, n, i, st);
  }
  return data;
}

/**
 * Legenda bieżącego widoku: lista { key, rgb } — `key` to końcówka klucza i18n (`colonySphere.legend.<key>`).
 */
export function sphereLegend({ lens = 'none', build = false, supply = false } = {}) {
  if (build) return [{ key: 'buildOk', rgb: C.ok }, { key: 'buildBlocked', rgb: C.blocked }, { key: 'buildOccupied', rgb: C.occupied }];
  if (supply) return [{ key: 'supplyCapital', rgb: C.supplyCapital }, { key: 'supplyBarracks', rgb: C.supplyBarracks }, { key: 'supplyOther', rgb: C.supplyOther }];
  if (lens === 'deposits') return [{ key: 'depStrategic', rgb: C.strategic }, { key: 'depAnomaly', rgb: C.anomaly }, { key: 'depRich', rgb: C.richOre }, { key: 'depNormal', rgb: C.ore }, { key: 'depNone', rgb: C.poor }];
  if (lens === 'ownership') return [{ key: 'ownPlayer', rgb: C.own }, { key: 'ownForeign', rgb: C.foreign }, { key: 'ownNone', rgb: C.neutral }];
  return [];
}

export const SPHERE_OVERLAY_COLORS = C;
