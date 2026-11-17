// ARC KONSOLE K7-C — czysta logika ostatnich stron Dowództwa na konsoli (FEATURES.consoleCommand): panel wroga,
// konfigurator misji, Atlas Gwiazd, Logistyka, Jednostki. Bez rysunku, bez `window`; wołający podaje fakty.
// Zasada: akcja niemożliwa = czip wyłączony z powodem i18n (co zrobić), nigdy cichy brak reakcji; dostępność == ścieżka OFF.

// ── Panel wroga ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Jakość kontaktu → klucz i18n (ścieżka OFF ma tu polskie literały — klasa 113; konsola przez `t()`). */
export const INTEL_QUALITY_KEYS = Object.freeze({
  unknown: 'cmdPages.enemy.intel.unknown', rumor: 'cmdPages.enemy.intel.rumor',
  contact: 'cmdPages.enemy.intel.contact', detailed: 'cmdPages.enemy.intel.detailed', full: 'cmdPages.enemy.intel.full',
});

/**
 * Wiersze faktów panelu wroga. MGŁA: kontakt niezidentyfikowany (`tracked` false) niesie WYŁĄCZNIE dystans od domu —
 * żadnej nazwy, imperium, kadłuba, pozycji ani stanu (jak dzisiejszy panel anonimowy).
 * @param {{tracked:boolean, distHomeAU:?number, empireName:?string, intel:?string, typeName:?string, stateKey:?string,
 *          posAU:?{x:number,y:number}}} f
 * @returns {Array<{key:string, value?:string, valueKey?:string, args?:Array, tone:string}>}
 */
export function enemyRows(f) {
  const rows = [];
  if (!f) return rows;
  if (!f.tracked) {
    if (f.distHomeAU != null) rows.push({ key: 'cmdPages.enemy.distHome', value: `${f.distHomeAU.toFixed(2)} AU`, tone: 'primary' });
    return rows;
  }
  rows.push(f.empireName
    ? { key: 'cmdPages.enemy.empire', value: f.empireName, tone: 'foreign' }
    : { key: 'cmdPages.enemy.empire', valueKey: 'cmdPages.enemy.empireUnknown', tone: 'dim' });
  if (f.intel) {
    const k = INTEL_QUALITY_KEYS[f.intel];
    rows.push(k ? { key: 'cmdPages.enemy.intel', valueKey: k, tone: 'primary' } : { key: 'cmdPages.enemy.intel', value: String(f.intel), tone: 'primary' });
  }
  if (f.typeName) rows.push({ key: 'cmdPages.enemy.hull', value: f.typeName, tone: 'primary' });
  if (f.stateKey) rows.push({ key: 'cmdPages.enemy.state', valueKey: f.stateKey, tone: 'primary' });
  if (f.posAU) rows.push({ key: 'cmdPages.enemy.position', value: `${f.posAU.x.toFixed(2)}, ${f.posAU.y.toFixed(2)} AU`, tone: 'primary' });
  if (f.distHomeAU != null) rows.push({ key: 'cmdPages.enemy.distHome', value: `${f.distHomeAU.toFixed(2)} AU`, tone: 'primary' });
  return rows;
}

// ── Konfigurator misji ───────────────────────────────────────────────────────────────────────────────────────────

/** Kroki konfiguratora w kolejności czytania. Typ misji wybiera czip akcji (krok zawsze „zrobiony”). */
export const CONFIG_STEPS = Object.freeze(['type', 'target', 'options', 'confirm']);

/**
 * Stan kroków dla linii postępu: `done` / `current` / `todo`. Krok `select` = wybór celu; `confirm` = opcje + potwierdzenie
 * (opcje „zrobione”, gdy misja ich nie ma).
 */
export function configSteps(step, hasOptions) {
  const at = step === 'confirm' ? (hasOptions ? 2 : 3) : 1;
  return CONFIG_STEPS.map((id, i) => ({ id, labelKey: `cmdPages.cfg.step.${id}`, state: i < at ? 'done' : i === at ? 'current' : 'todo' }));
}

/**
 * Wiersz celu: plakietka (te same reguły i kolejność co dzisiejszy `_drawTargetPicker`) i dostępność. Cel nieosiągalny =
 * bez strefy (jak dziś) + powód.
 */
export function targetRow(tgt, actionId) {
  const reachable = !!tgt?.reachable;
  let badgeKey, tone;
  if (!reachable) { badgeKey = 'fleet.badgeTooFar'; tone = 'alert'; }
  else if (!tgt.explored) { badgeKey = 'fleet.badgeUnexplored'; tone = 'primary'; }
  else if (actionId === 'found_outpost' && tgt.colonyStatus === 'colony') { badgeKey = 'fleet.target.existingColony'; tone = 'alert'; }
  else if (actionId === 'found_outpost' && tgt.colonyStatus === 'outpost') { badgeKey = 'fleet.target.existingOutpost'; tone = 'alert'; }
  else if (tgt.sameSystem === false) { badgeKey = 'fleet.badgeWarp'; tone = 'primary'; }
  else { badgeKey = 'fleet.badgeExplored'; tone = 'dim'; }
  const dist = tgt?.distAU != null ? `${tgt.distAU.toFixed(1)} AU` : `${(tgt?.distLY ?? 0).toFixed(1)} ly`;
  return { enabled: reachable, badgeKey, tone, dist, reasonKey: reachable ? null : 'cmdPages.cfg.reasonTooFar' };
}

/** Bramka przycisku WYŚLIJ (dzisiejsza: paliwo na dolot w jedną stronę). */
export function confirmGate(f) {
  if (!f) return { ok: false, reasonKey: 'cmdPages.cfg.reasonNoTarget', args: [] };
  if (f.insufficientFuel) return { ok: false, reasonKey: 'cmdPages.cfg.reasonNoFuel', args: [f.fuelCost.toFixed(1), f.fuelCur.toFixed(1)] };
  return { ok: true, reasonKey: null, args: [] };
}

// ── Atlas Gwiazd (decyzja właściciela 2026-11-17: ciała AKTYWNEGO układu, jak dziś) ─────────────────────────────────

/**
 * Wiersze listy z wpisów katalogu (`_getAllCatalogBodies`: dom + księżyce, potem zbadane / niezbadane po orbicie).
 * MGŁA: ciało niezbadane nie niesie nazwy (`name: null` → „???”), jak dzisiejszy wiersz.
 */
export function atlasRows(entries, hasColony = () => false) {
  return (entries ?? []).map((e) => {
    const b = e.body ?? {};
    return { id: b.id, name: e.explored ? (b.name ?? b.id) : null, explored: !!e.explored, isMoon: !!e.isMoon, isHome: !!e.isHome,
      type: b.type ?? 'planet', colony: !!e.explored && !!hasColony(b.id), parentId: b.parentPlanetId ?? null };
  });
}

export function atlasCounts(rows) {
  const r = rows ?? [];
  return { total: r.length, explored: r.filter((q) => q.explored).length, colonies: r.filter((q) => q.colony).length };
}

/** Zaznaczenie Atlasu: wybrane ciało musi być na liście (inny układ / zniknęło → brak wyboru). */
export function atlasSelection(selId, rows) {
  return selId && (rows ?? []).some((q) => q.id === selId) ? selId : null;
}

/**
 * Orrery: pozycje ciał w prostokącie bohatera. Gwiazda w środku (0, 0 układu); promień = √(d / dMax) — wewnętrzne planety
 * nie zlewają się. Kąt = rzeczywisty kąt ciała. Księżyce: przy rodzicu, w stałym małym odstępie w kierunku ich kąta
 * względem rodzica. Statki (`ships` z x, y) mapowane tą samą skalą.
 * @returns {{cx:number, cy:number, R:number, bodies:Map<string,{x:number,y:number,orbitR:number}>, ships:Array}}
 */
export function orreryLayout(bodies, rect, ships = [], { pad = 18, moonGap = 9 } = {}) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const R = Math.max(10, Math.min(rect.w, rect.h) / 2 - pad);
  const main = (bodies ?? []).filter((b) => !b.isMoon);
  const dist = (b) => Math.hypot(b.x ?? 0, b.y ?? 0);
  const dMax = Math.max(1e-9, ...main.map(dist), ...(ships ?? []).map(dist));
  const map = (x, y) => {
    const d = Math.hypot(x ?? 0, y ?? 0);
    const r = R * Math.sqrt(Math.min(1, d / dMax));
    const a = Math.atan2(y ?? 0, x ?? 0);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), orbitR: r };
  };
  const out = new Map();
  for (const b of main) out.set(b.id, map(b.x, b.y));
  for (const m of (bodies ?? []).filter((q) => q.isMoon)) {
    const p = (bodies ?? []).find((q) => q.id === m.parentId);
    const pp = p ? out.get(p.id) : null;
    if (!pp) { out.set(m.id, map(m.x, m.y)); continue; }
    const a = Math.atan2((m.y ?? 0) - (p.y ?? 0), (m.x ?? 0) - (p.x ?? 0));
    out.set(m.id, { x: pp.x + moonGap * Math.cos(a), y: pp.y + moonGap * Math.sin(a), orbitR: 0 });
  }
  return { cx, cy, R, bodies: out, ships: (ships ?? []).map((s) => ({ ...s, ...map(s.x, s.y) })) };
}

/**
 * Akcje inspektora Atlasu — dzisiejsze strefy: `atlas_report` (tylko ciało zbadane — dziś ikona 📋 jest tylko przy zbadanym)
 * i `map_body` (dzisiejszy klik wiersza: cel konfiguratora / przekierowanie statku w obcym układzie / zaznacz na mapie).
 */
export function atlasActions({ bodyId, explored, configSelect = false, redirect = false }) {
  const mapKey = configSelect ? 'cmdPages.atlas.actTarget' : redirect ? 'cmdPages.atlas.actRedirect' : 'cmdPages.atlas.actShow';
  return [
    { labelKey: mapKey, zone: { type: 'map_body', data: { bodyId } } },
    explored ? { labelKey: 'cmdPages.atlas.actReport', zone: { type: 'atlas_report', data: { bodyId } } }
      : { labelKey: 'cmdPages.atlas.actReport', zone: null, reasonKey: 'cmdPages.atlas.reasonReportUnexplored' },
  ];
}

// ── Logistyka (zlecenia transportowe) ────────────────────────────────────────────────────────────────────────────

/** Wybór na liście: `'new'` (kreator nowego zlecenia) albo id istniejącego zlecenia; zniknięte zlecenie → kreator. */
export function logiSelection(selId, orders) {
  if (selId != null && selId !== 'new' && (orders ?? []).some((o) => o.id === selId)) return selId;
  return 'new';
}

export function orderProgress(o) {
  const total = (o?.goods ?? []).reduce((s, g) => s + (g.total ?? 0), 0);
  const done = (o?.goods ?? []).reduce((s, g) => s + Math.min(g.done ?? 0, g.total ?? 0), 0);
  return { done, total, frac: total > 0 ? done / total : 0 };
}

/**
 * Wąskie gardło zlecenia (rola alert): brak statków i pusta pula → dodaj statki do puli; brak statków → czeka w kolejce FIFO;
 * statek czeka na ładunek → brakuje towaru w źródle. null = płynie.
 */
export function orderAlert(o, pool) {
  const a = o?.assigns ?? [];
  if (!a.length) return pool > 0 ? { key: 'cmdPages.logi.alertQueued', tone: 'alert' } : { key: 'cmdPages.logi.alertNoPool', tone: 'alert' };
  if (a.some((q) => q.phase === 'waiting')) return { key: 'cmdPages.logi.alertWaiting', tone: 'alert' };
  return null;
}

/** Węzły schematu: kolonie gracza na okręgu, pogrupowane po układzie (sąsiedzi w jednym układzie). */
export function logiNodes(cols, rect, { pad = 46 } = {}) {
  const list = [...(cols ?? [])].sort((a, b) => String(a.systemId ?? '').localeCompare(String(b.systemId ?? '')) || String(a.name).localeCompare(String(b.name)));
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const R = Math.max(10, Math.min(rect.w / 2 - pad * 2, rect.h / 2 - pad));
  const out = new Map();
  list.forEach((c, i) => {
    if (list.length === 1) { out.set(c.id, { x: cx, y: cy }); return; }
    const a = -Math.PI / 2 + (i / list.length) * Math.PI * 2;
    out.set(c.id, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
  });
  return out;
}
