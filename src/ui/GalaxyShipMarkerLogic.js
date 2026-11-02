// GalaxyShipMarkerLogic — ARC GALAXY, G2 / T5: znacznik statku na PŁYCIE galaktyki w idiomie SM-1 mapy układu
// (`HudShipMarkerLogic` — te same stałe i ta sama geometria, nic nie kopiowane):
//   • statek w skoku warp   → pusty daszek (chevron) 1 px, obrócony w kierunku podróży (ku układowi celu), WYCENTROWANY
//                             na pozycji trasy (na mapie układu daszek stoi przed tarczą — tu nie ma tarczy, jest punkt);
//   • statek przy gwieździe → pusty romb nad kwadratem trafienia gwiazdy (jeden na gwiazdę z własnymi statkami);
//   • rola z RELACJI (własny `primary` / obcy `foreign` / wróg `alert`) — logika zna tylko NAZWĘ roli, kolor rozstrzyga
//     warstwa przez `F.roles` (`HudPalette`), więc zero kolorów w tym module;
//   • FLOTA w tranzycie (≥ 2 członków tej samej floty na tym samym przeskoku) → JEDEN znacznik w środku ciężkości
//     + znacznik „×N”; zaznaczony członek podświetla cały znacznik; trasa flotowa biegnie od układu odlotu do celu;
//   • mgła: własne zawsze; obce wg kanonu kontakt / pogłoska (`galaxyBlipMode`) — `contact` = znacznik, `rumor` = duch „?”.
// ⚠ Moduł importuje się pod node (keeper): bez three i bez DOM.
import { HUD_SHIP_MARKER, markerGeometry, markerAlpha, shipMarkerRelation, shipMarkerRole } from './HudShipMarkerLogic.js';
import { GALAXY_PICK_HALF_PX } from './GalaxyModeLogic.js';

// Strojenie płyty (okiem — bez pinów na wartościach rysunku; piny tylko na logice kształtu / roli / agregacji).
export const GALAXY_SHIP_MARKER = Object.freeze({
  SELECTED_WIDTH_MUL: 1.5,   // zaznaczony: grubsza kreska (SM-1 zaznacza samym kryciem — na płycie tło jest jaśniejsze)
  TAG_GAP_PX: 3,             // odstęp „×N” od prawej krawędzi znacznika [px]
  FLEET_MIN: 2,              // od tylu członków na jednym przeskoku flota zbija się w jeden znacznik
  HIT_PAD: 3,                // margines strefy kliku wokół znacznika [px]
});

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

/** Jednostkowy kierunek ekranowy; zerowy / niepoprawny wektor → w prawo (jak dotychczasowy daszek „>”). */
export function unitDir(dir) {
  const dx = dir?.x, dy = dir?.y;
  // Składowa niepoprawna (NaN / brak) = wektor niepoprawny w CAŁOŚCI — nie zerujemy jej po cichu, bo (NaN, 1) dałoby
  // zmyślony kierunek „w dół” zamiast zapasu.
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { x: 1, y: 0 };
  const d = Math.hypot(dx, dy);
  return d > 1e-9 ? { x: dx / d, y: dy / d } : { x: 1, y: 0 };
}

/** Przesunięcie całej geometrii znacznika (punkty + prostokąt). */
export function shiftGeometry(geo, dx, dy) {
  const pts = geo.pts.map((v, i) => v + (i % 2 === 0 ? dx : dy));
  return { ...geo, pts, rect: { x: geo.rect.x + dx, y: geo.rect.y + dy, w: geo.rect.w, h: geo.rect.h } };
}

/**
 * Daszek tranzytu wycentrowany na punkcie trasy. `markerGeometry` stawia daszek PRZED tarczą (od GAP do GAP+H przed
 * środkiem) — na płycie nie ma tarczy, więc cofamy go o połowę jego długości razem z odstępem.
 */
export function transitGeometry({ cx, cy, dir }) {
  const d = unitDir(dir);
  const g = markerGeometry({ cx, cy, discR: 0, dir: d });
  const back = HUD_SHIP_MARKER.MARKER_GAP_PX + HUD_SHIP_MARKER.MARKER_H / 2;
  return shiftGeometry(g, -d.x * back, -d.y * back);
}

/** Romb przy gwieździe: nad kwadratem trafienia (promień = połowa boku strefy gwiazdy). */
export function parkedGeometry({ cx, cy }) {
  return markerGeometry({ cx, cy, discR: GALAXY_PICK_HALF_PX });
}

/**
 * Tabela kształtu i roli: ruch ('transit' | 'parked') × relacja → opis do narysowania.
 * @returns {{ motion, kind: 'chevron'|'diamond', role: 'primary'|'foreign'|'alert', relation, geo, width, alpha, selected }}
 */
export function shipMarkerSpec({ motion, relation, selected = false, intelOpacity = 1, cx, cy, dir = null }) {
  const transit = motion === 'transit';
  const geo = transit ? transitGeometry({ cx, cy, dir }) : parkedGeometry({ cx, cy });
  return {
    motion: transit ? 'transit' : 'parked',
    kind: geo.kind,
    role: shipMarkerRole(relation),
    relation,
    geo,
    width: HUD_SHIP_MARKER.MARKER_WIDTH * (selected ? GALAXY_SHIP_MARKER.SELECTED_WIDTH_MUL : 1),
    alpha: markerAlpha({ selected, intelOpacity }),
    selected: !!selected,
  };
}

/**
 * Fabryka rozstrzygacza relacji statku (lustro `HudShipMarkerLayer`, ale z wstrzykniętymi zależnościami — headless).
 * Wynik per imperium pamiętany na czas życia rozstrzygacza (jedna klatka przygotowania).
 * @param {{ isEnemy?: (v)=>boolean, atWar?: (empireId)=>boolean, hostileBand?: (empireId)=>boolean }} deps
 */
export function makeRelationResolver({ isEnemy, atWar, hostileBand } = {}) {
  const memo = new Map();
  return (v) => {
    const enemy = !!isEnemy?.(v);
    const empireId = v?.ownerEmpireId ?? (v?.owner && v.owner !== 'player' ? v.owner : null);
    if (!enemy || !empireId) return shipMarkerRelation({ isEnemy: enemy, empireId });
    let st = memo.get(empireId);
    if (!st) {
      st = { atWar: false, hostile: false };
      try { st.atWar = atWar?.(empireId) === true; } catch { /* brak dyplomacji → nie w wojnie */ }
      try { st.hostile = hostileBand?.(empireId) === true; } catch { /* brak pasma → nie wrogi */ }
      memo.set(empireId, st);
    }
    return shipMarkerRelation({ isEnemy: enemy, empireId, atWar: st.atWar, hostile: st.hostile });
  };
}

/** Mapa vesselId → fleetId. Członkostwo wg `FleetSystem.listFleets()` (autorytatywne), zapas: lustro `vessel.fleetId`. */
export function buildFleetIndex(fleets, vessels) {
  const idx = new Map();
  for (const f of fleets ?? []) {
    if (!f) continue;
    for (const id of f.memberIds ?? []) idx.set(String(id), f.id);
  }
  for (const v of vessels ?? []) {
    if (v && v.fleetId != null && !idx.has(String(v.id))) idx.set(String(v.id), v.fleetId);
  }
  return idx;
}

/**
 * Agregacja tranzytu: wpisy `galaxyShipRail().transit` → znaczniki. Członkowie tej samej floty na tym samym przeskoku
 * (klucz `fleetId|fromId|toId`) zbijają się w JEDEN znacznik w środku ciężkości; reszta zostaje pojedynczo.
 * @param {Array} entries  `{ v, gx, gy, gz, fromId, toId }`
 * @param {(vesselId)=>any} fleetOf  vesselId → fleetId | null
 * @param {Set<string>} selIds  zaznaczone statki (id jako string)
 * @returns {Array<{ key, fleet: boolean, fleetId, count, gx, gy, gz, fromId, toId, leadId, ids, selected }>}
 */
export function groupTransitByFleet(entries, fleetOf, selIds = new Set()) {
  const out = [], byKey = new Map();
  for (const t of entries ?? []) {
    if (!t?.v) continue;
    const fid = fleetOf ? (fleetOf(t.v.id) ?? null) : null;
    if (fid == null) { out.push({ key: `v${t.v.id}`, fleetId: null, members: [t] }); continue; }
    const key = `f${fid}|${t.fromId ?? ''}|${t.toId ?? ''}`;
    let g = byKey.get(key);
    if (!g) { g = { key, fleetId: fid, members: [] }; byKey.set(key, g); out.push(g); }
    g.members.push(t);
  }
  return out.map((g) => {
    const members = g.members.slice().sort((a, b) => String(a.v.id).localeCompare(String(b.v.id)));
    const n = members.length;
    const fleet = g.fleetId != null && n >= GALAXY_SHIP_MARKER.FLEET_MIN;
    const sum = members.reduce((s, m) => ({ x: s.x + num(m.gx), y: s.y + num(m.gy), z: s.z + num(m.gz) }), { x: 0, y: 0, z: 0 });
    const ids = members.map((m) => m.v.id);
    return {
      key: fleet ? g.key : `v${ids[0]}`,
      fleet,
      fleetId: fleet ? g.fleetId : null,
      count: fleet ? n : 1,
      gx: sum.x / n, gy: sum.y / n, gz: sum.z / n,
      fromId: members[0].fromId ?? null,
      toId: members[0].toId ?? null,
      leadId: ids[0],
      ids: fleet ? ids : [ids[0]],
      selected: (fleet ? ids : [ids[0]]).some((id) => selIds.has(String(id))),
    };
  });
}

/** Tekst znacznika floty — językowo neutralny (jak „+N” szyny), więc bez klucza i18n. */
export function fleetTag(count) { return `×${count}`; }

/** Kotwica napisu „×N”: przy prawej krawędzi znacznika, na jego wysokości (baseline środkowy). */
export function tagAnchor(rect) {
  return { x: rect.x + rect.w + GALAXY_SHIP_MARKER.TAG_GAP_PX, y: rect.y + rect.h / 2 };
}

/** Strefa kliku znacznika = prostokąt geometrii + margines. */
export function markerHitRect(rect) {
  const p = GALAXY_SHIP_MARKER.HIT_PAD;
  return { x: rect.x - p, y: rect.y - p, w: rect.w + 2 * p, h: rect.h + 2 * p };
}

/** Przeszkoda dla etykiet (okrąg opisany na prostokącie znacznika). */
export function markerObstacle(rect) {
  return { cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2, r: Math.max(rect.w, rect.h) / 2 + 1 };
}

/**
 * Tabela mgły dla obcych: tryb z `galaxyBlipMode` → co rysujemy. Własne statki mgły nie znają (zawsze znacznik).
 *   contact → 'marker' (daszek w roli z relacji) · rumor → 'ghost' (okrąg + „?”, bez kierunku) · inaczej nic.
 */
export function foreignDrawKind(mode) {
  if (mode === 'contact') return 'marker';
  if (mode === 'rumor') return 'ghost';
  return null;
}

/**
 * Końce trasy znacznika (do podwarstwy tras): flota — od UKŁADU ODLOTU do układu celu; pojedynczy — od punktu tranzytu.
 * `byId` — Map(id układu → układ z x/y/z). Brak układu celu → null (nie ma czego rysować).
 */
export function routeEndpoints(group, byId) {
  const to = byId.get(String(group.toId));
  if (!to) return null;
  if (group.fleet) {
    const from = byId.get(String(group.fromId));
    if (from) return { from: { x: num(from.x), y: num(from.y), z: num(from.z) }, to };
  }
  return { from: { x: group.gx, y: group.gy, z: group.gz }, to };
}

/** Zaznaczenie przy gwieździe: czy którykolwiek statek z listy jest zaznaczony. */
export function anySelected(list, selIds) {
  return (list ?? []).some((v) => selIds.has(String(v.id)));
}
