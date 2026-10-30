// HudSkyLabelLogic — NIEBO (ARC GALAXY; GALAXY_PLAN.md §4 NIEBO, opcja O1 wciągnięta do NIEBO decyzją właściciela
// 2026-10-30): czysta logika ETYKIET NIEBA — prawdziwe układy galaktyki na kopule nieba widoku układu, pokazywane WYŁĄCZNIE
// przy przytrzymanym CTRL (ta sama flaga „pokaż wszystkie etykiety” co etykiety CTRL mapy układu —
// `ThreeRenderer._showAllLabels`, przełączana w `GameScene` na Control). Rysunek — `HudSkyLabelLayer` (podwarstwa warstwy HUD).
// Czysty: bez three, bez DOM, bez `window`; kolory podaje wołający (role motywu).
//   • widoczność — JEDNA reguła (kolejność = kolejność sprawdzania): flaga `skyCatalog` (i istniejąca kopuła) · czysty widok
//     SHIFT · overlay · tryb Y (taktyczny) · CTRL albo wymuszenie przyrządem bramki (`KOSMOS.debug.skyMarks(1)`) — przyrząd
//     zastępuje WYŁĄCZNIE CTRL, pozostałe powody chowają dalej;
//   • mgła wojny (D-GX-18): nazwa tylko przy `reveal.name` (kanon `SystemReveal`, składany w `SystemRevealWorld`) — inaczej
//     „???”; nigdy prawdziwa nazwa układu nieujawnionego. Odległość zawsze (to geometria nieba, którą gracz widzi);
//   • relacja → rola: własny (dom albo układ z kolonią gracza) `primary` · zbadany `textPrimary` · niezbadany `dim`;
//   • jedna etykieta na skupisko na ekranie (skupiska `clusterScreenPoints` — te same co etykiety statków warstwy HUD):
//     wygrywa NAJBLIŻSZY układ (ly od aktywnego), remis — mniejszy id;
//   • tarcza słońca i każdej planety / księżyca / planetoidy ZASŁANIA znacznik (punkt w tarczy — bez znacznika), jak kopuła
//     nieba w 3D (planety zawsze nad gwiazdami, Finding 591).
import { clusterScreenPoints } from './FleetPictureLogic.js';

// Rysunek i układ (px logiczne UI). Strojenie okiem — stałe rysunku bez pinów keepera.
export const HUD_SKY_LABELS = Object.freeze({
  BRACKET_HALF: 6,          // połowa boku nawiasów wokół gwiazdy
  CLUSTER_ENTER: 44,        // skupisko na ekranie — jak etykiety statków (`clusterScreenPoints`, wejście …)
  CLUSTER_EXIT: 56,         // … i wyjście z histerezą
  MIN_DISC_PX: 0.5,         // tarcza ciała mniejsza (promień) — nie zasłania
  CTRL_LABEL_FONT_PX: 10,   // etykiety CTRL mapy (`UIManager._drawAllLabels`) — przeszkody etykiet nieba
});

/** Powody ukrycia — kolejność sprawdzania (keeper: tabela CTRL × SHIFT × overlay × Y). */
export const SKY_LABEL_HIDE_REASONS = Object.freeze(['flag', 'cleanView', 'overlay', 'yMode', 'ctrl']);

/**
 * Czy rysować etykiety nieba.
 * @param {{flag?:boolean, cleanView?:boolean, overlay?:boolean, yMode?:boolean, ctrl?:boolean, forced?:boolean}} s
 * @returns {{ shown: boolean, reason: string|null }}
 */
export function skyLabelGate({ flag = false, cleanView = false, overlay = false, yMode = false, ctrl = false, forced = false } = {}) {
  if (flag !== true) return { shown: false, reason: 'flag' };
  if (cleanView === true) return { shown: false, reason: 'cleanView' };
  if (overlay === true) return { shown: false, reason: 'overlay' };
  if (yMode === true) return { shown: false, reason: 'yMode' };
  if (!(ctrl === true || forced === true)) return { shown: false, reason: 'ctrl' };
  return { shown: true, reason: null };
}

/** Relacja układu z graczem: `own` (dom albo kolonia gracza) · `known` (zbadany) · `unexplored`. */
export function skyLabelRelation({ own = false, explored = false } = {}) {
  if (own === true) return 'own';
  return explored === true ? 'known' : 'unexplored';
}

/** Rola motywu wg relacji: `primary` · `textPrimary` · `dim`. */
export function skyLabelRole(relation) {
  if (relation === 'own') return 'primary';
  if (relation === 'known') return 'textPrimary';
  return 'dim';
}

/** Kolor roli: `roles` z `resolveHudRoles(THEME)`, `textPrimary` — token motywu (podaje wołający). */
export function skyLabelColor(role, roles, textPrimary) {
  if (role === 'textPrimary') return textPrimary ?? roles?.foreign ?? roles?.primary;
  return roles?.[role] ?? roles?.primary;
}

/** Nazwa na etykiecie: prawdziwa wyłącznie przy `revealed === true` i niepustej nazwie — inaczej „???”. */
export function skyLabelName({ name, revealed = false } = {}) {
  return (revealed === true && typeof name === 'string' && name.trim().length > 0) ? name : '???';
}

/** Czy punkt (px logiczne) leży w którejś tarczy `{ cx, cy, r }` (promień ≥ `minR`) — tarcza zasłania gwiazdę nieba. */
export function coveredByDisc(x, y, discs, minR = HUD_SKY_LABELS.MIN_DISC_PX) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
  for (const d of discs ?? []) {
    if (!d || !(d.r >= minR)) continue;
    const dx = x - d.cx, dy = y - d.cy;
    if (dx * dx + dy * dy <= d.r * d.r) return true;
  }
  return false;
}

const byNearest = (a, b) => (a.distLy - b.distLy) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);

/**
 * Jedna etykieta na skupisko: punkty `{ id, x, y, distLy, … }` (px logiczne) → zwycięzcy (najbliższy układ skupiska),
 * każdy z `clusterSize` (liczba układów w skupisku). `prev` — pamięć skupisk (histereza między klatkami; mutowana).
 */
export function pickSkyMarkers(points, { prev = null, enter = HUD_SKY_LABELS.CLUSTER_ENTER, exit = HUD_SKY_LABELS.CLUSTER_EXIT } = {}) {
  const pts = (points ?? []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.distLy));
  const clusters = clusterScreenPoints(pts, { enterRadius: enter, exitRadius: exit, prev });
  const out = [];
  for (const c of clusters) {
    const win = [...c.items].sort(byNearest)[0];
    if (win) out.push({ ...win, clusterSize: c.items.length });
  }
  return out.sort(byNearest);
}

/** Priorytet rozkładu etykiet (mniej = kładziona wcześniej): własne, zbadane, niezbadane; w obrębie — bliższe. */
export function skyLabelPrio(relation, nearestRank) {
  const r = relation === 'own' ? 0 : relation === 'known' ? 1 : 2;
  return r * 1000 + Math.max(0, Math.min(999, nearestRank | 0));
}
