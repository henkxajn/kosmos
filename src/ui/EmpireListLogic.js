// EmpireListLogic — wspólna, czysta logika listy obcych imperiów (ARC KONSOLE K0b, docs/design/CONSOLES_PLAN.md §1.2).
//
// Wywiad i Dyplomacja miały IDENTYCZNY kod rangi wywiadu, maski „???” i treści wiersza (kropka archetypu, nazwa w mgle,
// archetyp dopiero od `contact`). Tu jest jedno źródło tych reguł: konsola Wywiadu (K0b) czyta je już teraz, Dyplomacja
// przejdzie na nie w K2. Rysowanie wiersza — `ConsoleEmpireList.js` (zestaw konsoli).
//
// MGŁA WOJNY (twarda reguła K0b): widok wiersza i dossier odsłania TYLKO to, co dzisiejszy Wywiad pokazuje na tym samym
// poziomie wywiadu — nazwa i archetyp od `contact`, liczby wojskowe od `detailed`, incydenty od `contact`; znane systemy
// (lista z rekordu wywiadu) — na każdym poziomie, jak dziś. Keeper `console_intel_smoke.mjs` porównuje zbiór odsłoniętych
// pól nowego ekranu ze starym na tych samych danych.
//
// Bez DOM i canvas — testowalne pod node.

import { placeLabels } from './HudLabelLogic.js';
import { galaxyLabelCandidates } from './GalaxyModeLogic.js';

export const INTEL_LEVEL_RANK = Object.freeze({ unknown: 0, rumor: 1, contact: 2, detailed: 3 });
export const INTEL_LEVELS = Object.freeze(['unknown', 'rumor', 'contact', 'detailed']);
export const INTEL_MASK = '???';

// Klucze i18n poziomów wywiadu (wartości w słownikach PL/EN).
export const INTEL_LEVEL_LABEL_KEY = Object.freeze({
  unknown:  'intel.levelUnknown',
  rumor:    'intel.levelRumor',
  contact:  'intel.levelContact',
  detailed: 'intel.levelDetailed',
});

/** Ranga poziomu (nieznany poziom → 0). */
export function intelRank(level) { return INTEL_LEVEL_RANK[level] ?? 0; }
/** Czy poziom odsłania tożsamość (nazwa, archetyp, incydenty) — `contact` i wyżej. */
export function isContactLevel(level) { return intelRank(level) >= INTEL_LEVEL_RANK.contact; }
/** Czy poziom odsłania liczby wojskowe — `detailed`. */
export function isDetailedLevel(level) { return intelRank(level) >= INTEL_LEVEL_RANK.detailed; }

/** Rola HUD etykiety poziomu (konsola — tylko role palety): poniżej kontaktu dim, od kontaktu primary. */
export function intelLevelTone(level) { return isContactLevel(level) ? 'primary' : 'dim'; }

/**
 * Wpisy rekordu wywiadu `{ [empireId]: { level, … } }` posortowane jak dziś w Wywiadzie: ranga malejąco, w randze po id.
 * @returns {Array<[string, object]>}
 */
export function sortIntelEntries(intelMap) {
  return Object.entries(intelMap ?? {}).sort((a, b) => {
    const ra = intelRank(a[1]?.level ?? 'unknown');
    const rb = intelRank(b[1]?.level ?? 'unknown');
    if (rb !== ra) return rb - ra;
    return a[0].localeCompare(b[0]);
  });
}

/**
 * Domyślne zaznaczenie przy otwarciu (jak dziś `IntelOverlay.show`): bieżące, jeśli jest; inaczej pierwsze imperium
 * z rangą ≥ `rumor` w kolejności rekordu; brak — null.
 */
export function defaultIntelSelection(intelMap, currentId) {
  if (currentId) return currentId;
  const known = Object.entries(intelMap ?? {}).find(([, v]) => intelRank(v?.level ?? 'unknown') >= INTEL_LEVEL_RANK.rumor);
  return known ? known[0] : null;
}

/**
 * Widok wiersza listy imperiów (ta sama mgła co dziś): nazwa i archetyp tylko od `contact`, inaczej maska.
 * @param {{ empireId:string, level?:string, emp?:object|null, arch?:object|null, archName?:(arch:object)=>string }} p
 * @returns {{ id:string, level:string, contact:boolean, name:string, masked:boolean, levelKey:string, levelTone:string,
 *             archName:string|null, archColor:string|null }}
 */
export function empireRowView({ empireId, level = 'unknown', emp = null, arch = null, archName = null }) {
  const lv = level in INTEL_LEVEL_RANK ? level : 'unknown';
  const contact = isContactLevel(lv);
  const name = contact ? (emp?.name ?? INTEL_MASK) : INTEL_MASK;
  return {
    id: empireId,
    level: lv,
    contact,
    name,
    masked: name === INTEL_MASK,
    levelKey: INTEL_LEVEL_LABEL_KEY[lv],
    levelTone: intelLevelTone(lv),
    archName: contact && arch ? (archName ? archName(arch) : (arch.namePL ?? arch.nameEN ?? null)) : null,
    archColor: contact && arch ? (arch.color ?? null) : null,
  };
}

/**
 * Dossier zaznaczonego imperium dla konsoli Wywiadu — WYŁĄCZNIE pola, które dzisiejszy Wywiad pokazuje na danym poziomie.
 * Wartości własne gracza (siła, liczba układów) to nie wywiad — podaje je wołający (`mine`).
 * @param {{ rec:object, emp:object, arch?:object|null, archName?:Function, archDesc?:Function,
 *           systemName?:(id:string)=>string, mine?:{ strength?:number, systems?:number } }} p
 */
export function intelDossier({ rec, emp, arch = null, archName = null, archDesc = null, systemName = null, mine = {} }) {
  const level = (rec?.level ?? 'unknown') in INTEL_LEVEL_RANK ? (rec?.level ?? 'unknown') : 'unknown';
  const contact = isContactLevel(level);
  const detailed = isDetailedLevel(level);
  const known = Array.isArray(rec?.knownColonies) ? rec.knownColonies : [];
  const military = detailed && rec?.knownMilitary != null;
  return {
    level,
    rank: intelRank(level),
    contact,
    detailed,
    name: contact ? (emp?.name ?? INTEL_MASK) : INTEL_MASK,
    archName: contact && arch ? (archName ? archName(arch) : null) : null,
    archDesc: contact && arch ? (archDesc ? archDesc(arch) : null) : null,
    archColor: contact && arch ? (arch.color ?? null) : null,
    // Znane systemy — na każdym poziomie (dziś lista rysowana bez bramki rangi).
    systems: known.map((id) => ({ id, name: systemName ? systemName(id) : id, capital: emp?.homeSystemId === id })),
    // Wojsko — tylko `detailed` z niepustym `knownMilitary` (dziś: inaczej „???” + „wymaga skanu naziemnego”).
    military: military ? {
      units: rec.knownMilitary,
      reserve: rec.knownReserve != null && rec.knownReserve > 0 ? rec.knownReserve : null,
      armed: rec.knownArmedHulls != null && rec.knownFleetLimit != null ? rec.knownArmedHulls : null,
      limit: rec.knownArmedHulls != null && rec.knownFleetLimit != null ? rec.knownFleetLimit : null,
    } : null,
    // Incydenty — od `contact`, ostatnie 5 od najnowszego (dziś tak samo).
    incidents: contact ? (rec?.lastIncidents ?? []).slice(-5).reverse().map((ev) => ({ year: Number(ev?.year ?? 0), type: ev?.type })) : null,
    mine: { strength: Number(mine?.strength) || 0, systems: Number(mine?.systems) || 0 },
  };
}

/**
 * Para „ty kontra oni” dla paska układu sił: udziały 0–1 względem większej z wartości (oni zamaskowani → `theirs` null,
 * ich pasek nie istnieje). Czysta.
 * @returns {{ mineFrac:number, theirsFrac:number|null }}
 */
export function pairFractions(mine, theirs) {
  const m = Math.max(0, Number(mine) || 0);
  if (theirs == null) return { mineFrac: m > 0 ? 1 : 0, theirsFrac: null };
  const th = Math.max(0, Number(theirs) || 0);
  const top = Math.max(m, th);
  if (top <= 0) return { mineFrac: 0, theirsFrac: 0 };
  return { mineFrac: m / top, theirsFrac: th / top };
}

/**
 * K0b — punkty mini-mapy „znane układy imperium kontra układy gracza” (MGŁA: wyłącznie układy z listy znanych systemów
 * dossier — ta sama lista co dziś w Wywiadzie — oraz układy gracza; żadnych innych układów galaktyki). Pozycje — płaszczyzna
 * galaktyki (x, y w ly) z `posOf(id)`; układ bez pozycji pomijany. Czysta.
 * @param {{ known:Array<{id:string,name:string,capital:boolean}>, mineIds:Iterable<string>,
 *           posOf:(id:string)=>{x:number,y:number,name?:string}|null }} p
 * @returns {Array<{ id:string, name:string, x:number, y:number, mine:boolean, theirs:boolean, capital:boolean }>}
 */
export function systemMapPoints({ known = [], mineIds = [], posOf, homeId = null }) {
  const byId = new Map();
  for (const s of known) byId.set(s.id, { id: s.id, name: s.name, mine: false, theirs: true, capital: !!s.capital });
  for (const id of mineIds) {
    const e = byId.get(id);
    if (e) e.mine = true;
    else byId.set(id, { id, name: null, mine: true, theirs: false, capital: false });
  }
  const out = [];
  for (const e of byId.values()) {
    const p = posOf ? posOf(e.id) : null;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    // K0b-1: `capital` = stolica IMPERIUM (tylko z listy znanych — mgła); `capitalMine` = stolica gracza (jego układ domowy).
    out.push({ ...e, name: e.name ?? p.name ?? e.id, x: p.x, y: p.y, z: Number.isFinite(p.z) ? p.z : 0,
      capital: e.theirs && e.capital, capitalMine: e.mine && homeId != null && e.id === homeId });
  }
  return out;
}

/**
 * Czysta: parametry kadru — ta sama skala `k` (px/ly) w obu osiach, środek ramki punktów na środku prostokąta. `minSpan` (ly) —
 * minimalna rozpiętość ramki (1–2 układy nie „wybuchają” na całą mapę); 0 = bez minimum (jeden punkt → k 0, środek).
 */
export function mapFit(points, rect, pad = 16, minSpan = 0) {
  if (!points?.length) return { k: 0, map: () => ({ sx: rect.x + rect.w / 2, sy: rect.y + rect.h / 2 }) };
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const ms = Math.max(0, Number(minSpan) || 0);
  const dx = Math.max(x1 - x0, ms), dy = Math.max(y1 - y0, ms);
  const iw = Math.max(0, rect.w - 2 * pad), ih = Math.max(0, rect.h - 2 * pad);
  const k = Math.max(dx, dy) > 0 ? Math.min(iw / Math.max(dx, 1e-9), ih / Math.max(dy, 1e-9)) : 0;
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  return { k, map: (p) => ({ sx: cx + (p.x - mx) * k, sy: cy + (p.y - my) * k }) };
}

/**
 * Czysta: punkty (x, y w ly) wpisane w prostokąt z marginesem `pad` (`mapFit`). Zwraca nowe obiekty z `sx`, `sy`.
 */
export function fitMapPoints(points, rect, pad = 16, minSpan = 0) {
  if (!points?.length) return [];
  const f = mapFit(points, rect, pad, minSpan);
  return points.map((p) => ({ ...p, ...f.map(p) }));
}

// ── K0b-1: czytelność mini-mapy (stolice, scalanie, podpisy, podziałka) ─────────────────────────────────────────────────

export const INTEL_MAP = Object.freeze({
  PAD: 28,              // px — margines kadru
  MIN_SPAN_LY: 12,      // ly — minimalna rozpiętość kadru
  MERGE_PX: 10,         // px — znaczniki bliżej niż to → jeden znacznik
  BAR_MAX_PX: 90,       // px — najdłuższa podziałka
  LABEL_MAX_PX: 140,    // px — najdłuższy podpis
});

/** Priorytet znacznika / podpisu (mniej = ważniejszy): stolice, własne, ich. */
export function mapPointPrio(p) {
  return (p.capitalMine || p.capital) ? 0 : p.mine ? 1 : 2;
}

/**
 * Czysta: scalanie znaczników bliższych niż `mergePx` (po kadrze — `sx`, `sy`). Zachłannie w kolejności priorytetu: głowa
 * znacznika (stolica > własny > ich; dalej id) trzyma pozycję i nazwę, reszta dokłada flagi. MGŁA: wejście to wyłącznie
 * punkty mini-mapy — scalanie nie dodaje żadnego układu (`ids` = podział wejścia).
 * @returns {Array<{ key, sx, sy, name, ids:string[], mine, theirs, capitalMine, capital }>}
 */
export function mergeMapMarkers(fit, mergePx = INTEL_MAP.MERGE_PX) {
  const order = [...(fit ?? [])].sort((a, b) => (mapPointPrio(a) - mapPointPrio(b)) || String(a.id).localeCompare(String(b.id)));
  const out = [];
  for (const p of order) {
    const m = out.find((q) => Math.hypot(q.sx - p.sx, q.sy - p.sy) < mergePx);
    if (m) {
      m.ids.push(p.id);
      m.mine ||= !!p.mine; m.theirs ||= !!p.theirs; m.capitalMine ||= !!p.capitalMine; m.capital ||= !!p.capital;
    } else {
      out.push({ key: p.id, sx: p.sx, sy: p.sy, name: p.name, ids: [p.id], mine: !!p.mine, theirs: !!p.theirs,
        capitalMine: !!p.capitalMine, capital: !!p.capital });
    }
  }
  return out;
}

/**
 * Czysta: linia stolic — tylko gdy na mapie jest stolica gracza ORAZ znana stolica imperium (różne układy). Odległość 3D w ly.
 * @returns {{ from:object, to:object, distLy:number }|null}
 */
export function capitalLink(points) {
  const a = (points ?? []).find((p) => p.capitalMine);
  const b = (points ?? []).find((p) => p.capital && p.theirs);
  if (!a || !b || a.id === b.id) return null;
  return { from: a, to: b, distLy: Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) };
}

/** Czysta: podziałka — największa „okrągła” długość (1/2/5 × 10ⁿ ly) nie dłuższa niż `maxPx`; k ≤ 0 → null. */
export function mapScaleBar(k, maxPx = INTEL_MAP.BAR_MAX_PX) {
  if (!(k > 0) || !(maxPx > 0)) return null;
  const raw = maxPx / k;
  const e = Math.pow(10, Math.floor(Math.log10(raw)));
  const ly = [5, 2, 1].map((m) => m * e).find((v) => v <= raw) ?? e;
  return { ly, px: ly * k };
}

/**
 * Czysta: podpisy mini-mapy przez regułę rozkładu mapy galaktyki (`placeLabels` + `galaxyLabelCandidates` — bez forka).
 * Znaczniki są przeszkodami (podpis nie przykrywa sąsiada); priorytet: stolice (i odległość stolic), własne, ich. Reguła
 * gęstości: podpis, który nie znajdzie wolnego miejsca, znika — poza stolicami i odległością (zawsze kładzione). Zwykły
 * podpis próbuje tylko kandydatów przy znaczniku (pod nim, poziom 0).
 * @param {Array} markers — wynik `mergeMapMarkers`
 * @param {{ rect, measure:(s:string)=>number, lineH:number, text:(m)=>string, extra?:Array, obstacles?:Array }} o — `extra`:
 *   dodatkowe podpisy `{ key, ax, ay, text, essential, prio }` (np. odległość stolic)
 * @returns {{ placed:Array, hidden:string[] }}
 */
export function mapLabelLayout(markers, { rect, measure, lineH, text, extra = [], obstacles = [] }) {
  const obs = [...obstacles];
  const items = [];
  for (const m of markers ?? []) {
    const r = (m.mine && m.theirs) || m.capital || m.capitalMine ? 6 : 4;
    const own = { cx: m.sx, cy: m.sy, r };
    obs.push(own);
    const s = text(m);
    const essential = !!(m.capital || m.capitalMine);
    items.push({ key: m.key, ax: m.sx, ay: m.sy, w: measure(s) + 2, h: lineH, clear: r, text: s, marker: m, essential,
      prio: mapPointPrio(m) * 10, ownObstacle: own });
  }
  // `pad` (px) — margines podpisu dodatkowego w rozkładzie (odległość stolic nie dotyka nazw sąsiadów)
  for (const e of extra) {
    const pad = Math.max(0, e.pad ?? 0);
    items.push({ ...e, pad, w: measure(e.text) + 2 + 2 * pad, h: lineH + 2 * pad, clear: 0, prio: e.prio ?? 5 });
  }
  // Mała mapa: zwykły podpis tylko tuż przy znaczniku (pod nim albo poziom 0 kandydatów galaktyki) — dalsze poziomy z długą
  // nitką zaśmiecały tłok; stolice i odległość — pełna lista kandydatów (zawsze kładzione, nitka wskazuje znacznik).
  const near = (it) => galaxyLabelCandidates(it).filter((c) => it.essential === true || c.side === 'C' || c.level === 0);
  return placeLabels(items, { rect, obstacles: obs, candidatesOf: near, hideOnOverlap: (it) => it.essential !== true });
}
