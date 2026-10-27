// ShipPanelAnchorLogic — REFORMA ZAKŁADEK, T3 (TABS_REFORM_PLAN §5.2; podpisy §6.0: D-TR-7, D-TR-8, D-TR-10, D-TR-13,
// D-TR-14): geometria panelu statku przy WIERSZU zaznaczonego statku w prawym outlinerze — od T5 panel w idiomie etykiet
// (`ShipPanelHudLayer`), od T6 także panele floty i grupy (`FleetPanelHudLayer`). Flaga kroku `shipPanelOutliner` — na
// stałe ON od T4 (klucz usunięty).
//
//   • Kotwica (D-TR-7 (a)): panel 300 × 300 (360 w kroku wyboru celu) wysunięty W LEWO od prawego outlinera — prawa
//     krawędź panelu = lewa krawędź kolumny, górna = górna krawędź wiersza statku; klamra do obszaru mapy z `MapInsets`
//     (góra — pod belką, dół — nad pasem dolnym). Wiersz przewinięty poza listę kolumny — kotwica przy górnej / dolnej
//     krawędzi listy (panel idzie za przewijaniem). Statek w ZWINIĘTYM układzie — kotwica przy nagłówku jego układu
//     (albo „W drodze”).
//   • „Spawanie”: przy kotwicy na wierszu panel bez własnej krawędzi od strony kolumny (wspólną krawędzią jest linia
//     kolumny) i łącznik na wysokości wiersza — tylko gdy wiersz jest w liście widoczny (rysunek i stałe — `UIManager`).
//   • Zapas (D-TR-8 (a)): kolumna ukryta (klawisz „.”, overlay, rozwinięty Dok) albo statku brak w drzewie — kotwica
//     zapasowa (geometria dawnego pływającego panelu statku): prawy górny róg obszaru mapy
//     (`resolveVesselPanelAnchor(null, …)` + klamra 4 px); bez przeciągania.
//   • Tryb Y (D-TR-10 (a), Finding 542): przy rozwiniętym Doku taktycznym panel statku nad mapą się nie rysuje (mini-panel
//     Doku + „Pokaż w rejestrze”).
//   • Przełączenie układu: zaznaczony POJEDYNCZY statek spoza układu docelowego — zaznaczenie zdjęte (panel się zwija);
//     statek z układu docelowego (Tab i 2. klik reguły §7.8 przełączają na układ statku) — zostaje.
//   • D-TR-14 (Finding 539): klik ciała / stacji na mapie nie zdejmuje zaznaczenia statku (jak w lewym outlinerze).
//   • D-TR-13 (Finding 543): rozbiórka dopiero po potwierdzeniu.
//   • Strojenie 1 (Finding 545): karta walki (`CombatHUD.getPanelRect`) jest PRZESZKODĄ kotwicy — panel przy wierszu
//     przesuwa się w pionie w obszarze mapy (najbliższe wolne położenie nad / pod kartą, nadal przy kolumnie); bez miejsca —
//     kotwica zapasowa. Łącznik tylko, gdy wiersz leży w zasięgu panelu.
//
// Czysty: bez `window` i EventBusa — stan podaje wołający (`UIManager`, `FleetManagerOverlay`, `GameScene`); keeper
// `ship_panel_outliner_smoke` woła wszystko pod node. Importy — kanon układu, klucz sekcji „W drodze”, kotwica zapasowa.

import { systemIdOf } from '../utils/SystemScope.js';
import { TRANSIT } from './ShipTreeLogic.js';
import { resolveVesselPanelAnchor } from './MapVesselPanelLogic.js';

/** Szerokość panelu = `REGISTRY_RIGHT_W` (300) — treść układa się jak w prawej kolumnie Rejestru (golden E1/E2). */
export const SHIP_PANEL_W = 300;

/** [px logiczne] najmniejszy odstęp panelu od przeszkody (karta walki — strojenie 1, Finding 545). */
export const SHIP_PANEL_OBSTACLE_PAD = 4;

/** Czy prostokąt `a` zachodzi na przeszkodę `o` (z odstępem `pad`). */
function overlapsRect(a, o, pad) {
  return a.x < o.x + o.w + pad && a.x + a.w > o.x - pad && a.y < o.y + o.h + pad && a.y + a.h > o.y - pad;
}

/** Przeszkody z prawidłowymi liczbami (null / NaN / zerowy rozmiar — pominięte). */
function validRects(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((o) => o && [o.x, o.y, o.w, o.h].every(Number.isFinite) && o.w > 0 && o.h > 0);
}

/**
 * Klucze wierszy prawego outlinera dla statku, w kolejności: wiersz statku, nagłówek jego sekcji (układ zwinięty — wiersza
 * statku nie ma w liście; statek w skoku — „W drodze”, zawsze rozwinięte).
 * @param {string|null} vesselId
 * @param {{index?: Map<string, {section:string}>}|null} tree — wynik `ShipTreeLogic.buildShipTree` (ostatnia klatka)
 * @returns {string[]}
 */
export function shipRowKeys(vesselId, tree) {
  if (vesselId == null) return [];
  const keys = [`vessel:${vesselId}`];
  const sec = tree?.index?.get?.(vesselId)?.section ?? null;
  if (sec === TRANSIT) keys.push('transit');
  else if (sec != null) keys.push(`system:${sec}`);
  return keys;
}

/**
 * Wiersz listy kolumny → kotwica w px logicznych. Pierwszy klucz obecny w układzie ostatniej klatki wygrywa.
 * @param {{contentTop:number, viewH:number, scrollY:number, rows: Map<string,{y:number,h:number}>}|null} layout —
 *        `OutlinerColumn._layout` (y wiersza w treści listy, przed przewinięciem)
 * @param {string[]} keys — `shipRowKeys`
 * @returns {{key:string, rowTop:number, h:number, anchorY:number, visible:boolean, edge:'top'|'bottom'|null,
 *            viaSection:boolean}|null}
 *          rowTop — górna krawędź wiersza na ekranie (może leżeć poza listą); anchorY — kotwica w oknie listy;
 *          visible — wiersz cały w oknie listy; edge — krawędź listy, do której kotwica przylgnęła
 */
export function resolveRowAnchor(layout, keys) {
  if (!layout?.rows || typeof layout.rows.get !== 'function' || !Array.isArray(keys)) return null;
  const top = Number.isFinite(layout.contentTop) ? layout.contentTop : 0;
  const bottom = top + Math.max(0, Number.isFinite(layout.viewH) ? layout.viewH : 0);
  const scroll = Number.isFinite(layout.scrollY) ? layout.scrollY : 0;
  for (let i = 0; i < keys.length; i++) {
    const r = layout.rows.get(keys[i]);
    if (!r || !Number.isFinite(r.y) || !Number.isFinite(r.h)) continue;
    const rowTop = top + r.y - scroll;
    let anchorY = rowTop, edge = null;
    if (rowTop < top) { anchorY = top; edge = 'top'; }
    else if (rowTop + r.h > bottom) { anchorY = Math.max(top, bottom - r.h); edge = 'bottom'; }
    return { key: keys[i], rowTop, h: r.h, anchorY, visible: edge === null, edge, viaSection: i > 0 };
  }
  return null;
}

/**
 * Prostokąt panelu statku przy ON.
 * @param {object} p
 * @param {number} p.W — szerokość logiczna UI
 * @param {number} p.H — wysokość logiczna UI
 * @param {{left:number,right:number,top:number,bottom:number}} p.insets — `MapInsets.getMapInsets`
 * @param {{x:number,y:number,w:number,h:number}|null} p.column — prostokąt prawej kolumny z tej klatki (null — ukryta)
 * @param {object|null} p.anchor — `resolveRowAnchor` (null — statku brak w liście)
 * @param {number} [p.panelW]
 * @param {number} p.panelH — 300 / 360 (krok wyboru celu)
 * @param {Array<{x:number,y:number,w:number,h:number}>} [p.obstacles] — przeszkody kotwicy przy wierszu (karta walki —
 *        strojenie 1, Finding 545); panel nie zachodzi na nie bliżej niż `SHIP_PANEL_OBSTACLE_PAD`
 * @returns {{x:number, y:number, w:number, h:number, mode:'row'|'fallback', seam:boolean,
 *            tab:{y:number,h:number}|null, edge:'top'|'bottom'|null, shifted:boolean}}
 *          shifted — panel przy wierszu przesunięty w pionie z powodu przeszkody
 */
export function computeShipPanelPlacement({ W, H, insets, column, anchor, panelW = SHIP_PANEL_W, panelH, obstacles = null }) {
  const ins = insets ?? { left: 0, right: 0, top: 0, bottom: 0 };
  if (column && anchor) {
    // D-TR-7 (a): prawa krawędź = lewa krawędź kolumny; górna = wiersz (kotwica w oknie listy); klamra pionowa do obszaru
    // mapy — pod belką, nad pasem dolnym (dół kolumny = dół obszaru mapy, więc wiersz zawsze mieści się w panelu).
    const mapTop = ins.top, mapBottom = H - ins.bottom;
    const x = column.x - panelW;
    const y0 = Math.max(mapTop, Math.min(anchor.anchorY, mapBottom - panelH));
    let y = y0, shifted = false;
    // Strojenie 1 (545): przeszkoda (karta walki) — najbliższe położenie nad / pod nią, w obszarze mapy i wolne od wszystkich
    // przeszkód; brak takiego — kotwica zapasowa (niżej).
    const obs = validRects(obstacles);
    const P = SHIP_PANEL_OBSTACLE_PAD;
    const free = (yy) => !obs.some((o) => overlapsRect({ x, y: yy, w: panelW, h: panelH }, o, P));
    let placed = true;
    if (!free(y0)) {
      const cand = [];
      for (const o of obs) cand.push(o.y - P - panelH, o.y + o.h + P);
      const ok = cand.filter((c) => c >= mapTop && c <= mapBottom - panelH && free(c));
      if (ok.length) {
        y = ok.reduce((best, c) => (Math.abs(c - y0) < Math.abs(best - y0) || (Math.abs(c - y0) === Math.abs(best - y0) && c < best) ? c : best));
        shifted = true;
      } else {
        placed = false;
      }
    }
    if (placed) {
      // Łącznik — wiersz widoczny w liście I w zasięgu panelu (po przesunięciu wiersz może leżeć poza panelem).
      const inSpan = anchor.visible && anchor.rowTop >= y && anchor.rowTop + anchor.h <= y + panelH;
      return {
        x, y, w: panelW, h: panelH, mode: 'row', seam: true,
        tab: inSpan ? { y: anchor.rowTop, h: anchor.h } : null, edge: anchor.edge ?? null, shifted,
      };
    }
  }
  // D-TR-8 (a): kotwica zapasowa — geometria dawnego pływającego panelu statku (obszar mapy z `MapInsets` z marginesem 8 px,
  // kotwica bez pozycji ekranowej → prawy górny róg, klamra 4 px); także panel przy wierszu bez wolnego miejsca obok przeszkody.
  const oy = ins.top + 8;
  const b = { ox: ins.left + 8, oy, ow: Math.max(80, W - ins.left - ins.right - 16), oh: Math.max(60, H - ins.bottom - oy) };
  const a = resolveVesselPanelAnchor(null, 1, b, panelW, panelH, 24);
  const minX = b.ox + 4, maxX = Math.max(minX, b.ox + b.ow - panelW - 4);
  const minY = b.oy + 4, maxY = Math.max(minY, b.oy + b.oh - panelH - 4);
  return {
    x: Math.max(minX, Math.min(maxX, a.x)), y: Math.max(minY, Math.min(maxY, a.y)), w: panelW, h: panelH,
    mode: 'fallback', seam: false, tab: null, edge: null, shifted: false,
  };
}

/**
 * D-TR-10 (a), Finding 542: tryb Y — przy rozwiniętym Doku taktycznym panel statku nad mapą się nie rysuje.
 * @param {boolean} dockExpanded — `TacticalDock.isExpanded()`
 */
export function shipPanelHiddenByDock(dockExpanded) {
  return dockExpanded === true;
}

/**
 * Przełączenie układu (wołane z `system:switched`): zaznaczony POJEDYNCZY statek spoza układu docelowego → zaznaczenie
 * zdjęte (panel się zwija); statek w układzie docelowym — zostaje (Tab i 2. klik reguły §7.8 przełączają na układ statku).
 * Statek w skoku (układ `null` — kanon `systemIdOf`) nie jest w żadnym układzie — zdjęty. Grupa N ≥ 2 i flota — bez zmian.
 * @param {{vesselIds:string[], vessel:object|null, systemId:string|null, clear?:Function}} p
 * @returns {'clear'|'keep'|null}
 */
export function syncShipPanelOnSystemSwitch({ vesselIds, vessel, systemId, clear = null } = {}) {
  if (!systemId) return null;
  if (!Array.isArray(vesselIds) || vesselIds.length !== 1 || !vessel) return null;
  if (systemIdOf(vessel) !== systemId) { clear?.(); return 'clear'; }
  return 'keep';
}

/**
 * D-TR-14 (a), Finding 539: klik ciała albo stacji na mapie (trafienie z `ThreeRenderer.lastClickPick.object`) nie zdejmuje
 * zaznaczenia statku — jak klik w lewym outlinerze; pusta mapa zdejmuje jak dotąd.
 * @param {'body'|'station'|null} objectHit
 */
export function keepShipSelectionOnMapClick(objectHit) {
  return objectHit === 'body' || objectHit === 'station';
}

/**
 * D-TR-13 (a), Finding 543: rozbiórka statku — `fleet:disbandRequest` DOPIERO po potwierdzeniu; odmowa, wyjątek okna albo
 * statek, którego w międzyczasie nie ma — nic.
 * @param {{vesselId:string, confirm:() => Promise<boolean>, isAlive?:(id:string) => boolean, emit:Function}} p
 * @returns {Promise<boolean>} czy żądanie wysłano
 */
export async function confirmThenDisband({ vesselId, confirm, isAlive = null, emit = null } = {}) {
  if (vesselId == null || typeof confirm !== 'function') return false;
  let ok = false;
  try { ok = (await confirm()) === true; } catch { ok = false; }
  if (!ok) return false;
  if (typeof isAlive === 'function' && isAlive(vesselId) !== true) return false;
  emit?.('fleet:disbandRequest', { vesselId });
  return true;
}
