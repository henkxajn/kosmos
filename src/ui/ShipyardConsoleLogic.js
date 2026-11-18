// ShipyardConsoleLogic — czysta logika konsoli Stoczni (ARC KONSOLE, krok K1c-A; CONSOLES_PLAN.md §1.2 «Shipyard», §2 B5).
// Zero DOM / Canvas — keeper `console_shipyard_smoke`. Rysunek: `ShipyardConsoleView.drawShipyardConsole`.
//
// • Podgląd zmiany (delta) przy najechaniu modułu w pickerze = staty(z modułem) − staty(bez niego) przez `calcShipStats` /
//   `calcShipCost`; «bez» = bieżący projekt z pustym aktywnym slotem, «z» = ten sam projekt z modułem w aktywnym slocie.
//   Broń i tarcze NIE są agregowane poza BattleSystem → pokazujemy surowe `damage` / `shieldHP` modułu (bez zmian mechaniki).
// • Stan budowy szablonu — reguła dawnej `ShipyardOverlay._drawShipyard`, usuniętej w KZ-Shipyard (tech kadłuba → stocznia orbitalna →
//   slot), z `canBuildHullAt(hullId, 'ground')` (kolonia = stocznia naziemna). Keeper porównuje go z wykonaniem ścieżki OFF.
// • Etykiety ról na kotwicach: `groupModulesByRole` (K1b) → jedna etykieta na niepustą rolę, moduły zliczone «Laser ×6».

import { groupModulesByRole } from '../renderer/ShipAnchors.js';

// Kategorie modułów (slotType) — ikona każdej z 10 grup pickera (Finding 726). K1c-B: kanon przeniesiony do
// `src/data/ShipModuleCategories.js` (wspólny z projektantem `UnitDesignOverlay`), tu re-eksport.
export { MODULE_CATEGORY_ICONS, MODULE_CATEGORIES, categoryLabelKey } from '../data/ShipModuleCategories.js';

// ── K1c-B: [ USUŃ ] za drugim kliknięciem ──────────────────────────────────────────────────────────────────────────────
export const DELETE_CONFIRM_MS = 3000;   // [ms] jak długo [ POTWIERDŹ ] czeka na drugi klik

/**
 * Klik w [ USUŃ ] projektu `id` w chwili `now` [ms] przy uzbrojeniu `arm` ({ id, until } | null).
 * @returns {{ arm: {id:string, until:number}|null, delete: boolean }} — pierwszy klik uzbraja, drugi (ten sam projekt, przed
 *   wygaśnięciem) kasuje; klik w inny projekt albo po czasie uzbraja od nowa.
 */
export function deleteClick(arm, { id, now, ms = DELETE_CONFIRM_MS }) {
  if (id == null) return { arm: null, delete: false };
  if (arm && arm.id === id && now <= arm.until) return { arm: null, delete: true };
  return { arm: { id, until: now + ms }, delete: false };
}

/** Czy czip projektu `id` pokazuje [ POTWIERDŹ ] w chwili `now`. */
export function deleteArmed(arm, id, now) { return !!arm && arm.id === id && now <= arm.until; }

// ── K1c-B: blok statystyk inspektora — układ stały (uwaga właściciela B) ──────────────────────────────────────────────
// Zawsze te same wiersze w tej samej kolejności (wartość zerowa / brak = «—»), stała kolumna delty (pusta bez najechania),
// stała liczba linii powodów pod czipami akcji. Najechanie modułu zmienia tylko TEKSTY, nigdy położenia ani rozmiary.
export const STAT_ROW_KEYS = Object.freeze([
  'cargo', 'fuel', 'warp', 'mass', 'hpArmor', 'survivalDiscovery', 'colonistsTroops', 'module', 'crew', 'upkeep', 'buildTime',
  'cost', 'commodities', 'costDelta',
]);
export const ACTION_REASON_LINES = 2;    // linie powodów pod [ BUDUJ ] [ ZAPISZ ] [ WYCZYŚĆ ] (rezerwa stała)

/** Podkolumny delty wiersza-pary (np. «Koloniści / Desant»): [0] — lewa połowa, [1] — prawa, kończy się na krawędzi kolumny delty. */
export function statDeltaSubSlots(delta) {
  const h = Math.floor(delta.w / 2);
  return [{ x: delta.x, y: delta.y, w: h, h: delta.h }, { x: delta.x + h, y: delta.y, w: delta.w - h, h: delta.h }];
}

/**
 * Prostokąty bloku statystyk (px log.) — niezależne od treści.
 * @param {{x:number,y:number,w:number,h:number}} iz — strefa inspektora
 * @param {{ eyebrowH:number, instrH:number, kvH:number, chipH:number, reasonH:number, deltaW:number, gap?:number }} m
 * @returns {{ top:number, eyebrow:object, instruments:object[], rows:{key:string, x,y,w,h, delta:object}[], actions:object, reasons:object }}
 */
export function inspectorStatLayout(iz, m) {
  const statsH = m.eyebrowH + 4 + m.instrH + 6 + STAT_ROW_KEYS.length * m.kvH + 8;
  const actH = m.chipH + 6 + ACTION_REASON_LINES * m.reasonH;
  const bottomH = Math.min(iz.h - 60, statsH + actH);
  const top = iz.y + iz.h - bottomH;
  let y = top;
  const eyebrow = { x: iz.x, y, w: iz.w, h: m.eyebrowH };
  y += m.eyebrowH + 4;
  const half = Math.floor(iz.w / 2);
  const instruments = [{ key: 'speed', x: iz.x, y, w: half, h: m.instrH }, { key: 'range', x: iz.x + half, y, w: iz.w - half, h: m.instrH }];
  y += m.instrH + 6;
  const rows = STAT_ROW_KEYS.map((key) => {
    const r = { key, x: iz.x, y, w: iz.w - m.deltaW, h: m.kvH, delta: { x: iz.x + iz.w - m.deltaW, y, w: m.deltaW, h: m.kvH } };
    y += m.kvH;
    return r;
  });
  y += 8;
  const actY = Math.max(y, iz.y + iz.h - actH);
  return { top, eyebrow, instruments, rows, actions: { x: iz.x, y: actY, w: iz.w, h: m.chipH },
    reasons: { x: iz.x, y: actY + m.chipH + 6, w: iz.w, h: ACTION_REASON_LINES * m.reasonH } };
}

// Pola delty (kolejność = kolejność wierszy inspektora). `pct` — ułamek pokazywany w procentach.
export const DELTA_KEYS = Object.freeze([
  'speed', 'range', 'cargo', 'fuelCapacity', 'warpFuelCapacity', 'totalMass', 'hp', 'armor',
  'survivalBonus', 'discoveryBonus', 'colonistCapacity', 'troopCapacity',
]);
const EPS = 1e-9;

/** Moduły projektu bez pustych slotów. */
export function fittedModules(slotAssignments) {
  return (Array.isArray(slotAssignments) ? slotAssignments : []).filter((m) => typeof m === 'string' && m);
}

/** Etykieta układu slotów kadłuba, np. «1P+2U». */
export function slotLayoutLabel(counts) {
  return `${counts?.propulsion ?? 0}P+${counts?.utility ?? 0}U`;
}

/** Różnica dwóch map kosztu `{res: qty}` (b − a); zera pominięte. */
export function costDelta(a = {}, b = {}) {
  const out = {};
  for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    const d = (b?.[k] ?? 0) - (a?.[k] ?? 0);
    if (Math.abs(d) > EPS) out[k] = d;
  }
  return out;
}

/** Surowe staty bojowe modułu (bez agregacji — BattleSystem liczy je sam). */
export function moduleRawCombat(mod) {
  const s = mod?.stats ?? {};
  const out = {};
  if (Number.isFinite(s.damage)) out.damage = s.damage;
  if (Number.isFinite(s.attackPower)) out.attackPower = s.attackPower;
  if (Number.isFinite(s.shieldHP)) out.shieldHP = s.shieldHP;
  if (Number.isFinite(s.shieldRegen)) out.shieldRegen = s.shieldRegen;
  if (s.orbitalStrike && Number.isFinite(s.orbitalStrike.damage)) out.strikeDamage = s.orbitalStrike.damage;
  return out;
}

/**
 * Delta podglądu: staty(z) − staty(bez) dla modułu `moduleId` w slocie `slotIndex` projektu `slotAssignments` kadłuba `hull`.
 * @param {{ hull:object, slotAssignments:(string|null)[], slotIndex:number, moduleId:string, calcShipStats:Function,
 *           calcShipCost:Function, modules:Record<string,object> }} p
 * @returns {{ stats:Record<string,number>, cost:Record<string,number>, commodity:Record<string,number>, raw:object,
 *             with:object, without:object } | null}
 */
export function designDelta({ hull, slotAssignments, slotIndex, moduleId, calcShipStats, calcShipCost, modules = {} }) {
  if (!hull || !moduleId || !Number.isInteger(slotIndex) || slotIndex < 0) return null;
  const base = Array.isArray(slotAssignments) ? [...slotAssignments] : [];
  const without = [...base]; without[slotIndex] = null;
  const withM = [...base]; withM[slotIndex] = moduleId;
  const sA = calcShipStats(hull, fittedModules(without));
  const sB = calcShipStats(hull, fittedModules(withM));
  const stats = {};
  for (const k of DELTA_KEYS) {
    const d = (sB?.[k] ?? 0) - (sA?.[k] ?? 0);
    stats[k] = Math.abs(d) > EPS ? d : 0;
  }
  const cA = calcShipCost(hull, fittedModules(without));
  const cB = calcShipCost(hull, fittedModules(withM));
  return {
    stats, cost: costDelta(cA?.cost, cB?.cost), commodity: costDelta(cA?.commodityCost, cB?.commodityCost),
    raw: moduleRawCombat(modules?.[moduleId]), with: sB, without: sA,
  };
}

/**
 * Etykiety ról na kotwicach: jedna na NIEPUSTĄ rolę (kolejność `ANCHOR_ROLES`), moduły zliczone w kolejności montażu.
 * @returns {{ role:string, items:{ id:string, count:number }[] }[]}
 */
export function roleStacks(moduleIds, modulesDef) {
  const { groups } = groupModulesByRole(fittedModules(moduleIds), modulesDef);
  const out = [];
  for (const [role, ids] of Object.entries(groups)) {
    if (!ids.length) continue;
    const counts = new Map();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    out.push({ role, items: [...counts].map(([id, count]) => ({ id, count })) });
  }
  return out;
}

/** Bramki ekranu (te same reguły co dziś): 'S0' bez technologii `exploration`, 'S1' bez budynku stoczni, inaczej null. */
export function shipyardGate({ hasExploration, shipyardLevel }) {
  if (!hasExploration) return 'S0';
  if (!(shipyardLevel > 0)) return 'S1';
  return null;
}

/**
 * Stan budowy szablonu — reguła dawnej `ShipyardOverlay._drawShipyard` (W2-4: bez warunku załogi).
 * @returns {{ state:'build'|'queue'|'tech'|'orbital'|'full', canBuildNow:boolean, canQueue:boolean, canClick:boolean,
 *             techId:string|null }}
 */
export function templateBuildState({ hull, hullId, techResearched, canBuildHullAt, queuesLen, shipyardLevel, allAfford }) {
  const hasTech = !hull?.requires || !!techResearched?.(hull.requires);
  const canBuildFacility = !!canBuildHullAt?.(hullId, 'ground');
  const canBuildAny = queuesLen < shipyardLevel;
  const canBuildNow = hasTech && canBuildFacility && canBuildAny && allAfford;
  const canQueue = hasTech && canBuildFacility && !allAfford;
  const canClick = canBuildNow || canQueue;
  let state = canBuildNow ? 'build' : canQueue ? 'queue' : 'full';
  if (!hasTech) state = 'tech';
  else if (!canBuildFacility) state = 'orbital';
  return { state, canBuildNow, canQueue, canClick, techId: hasTech ? null : (hull?.requires ?? null) };
}

/** Czy kolonia stać na koszt `{res: qty}` (magazyn `inv`). */
export function canAfford(costs, inv) {
  return Object.entries(costs ?? {}).every(([k, need]) => (inv?.[k] ?? 0) >= need);
}

/**
 * Szablon, który [ BUDUJ ] zbuduje: wczytany do projektanta (`editingId`) i niezmieniony (kadłub + moduły co do slotu).
 * Dziś budować da się wyłącznie zapisane szablony — projekt niezapisany / zmieniony ⇒ powód zamiast celu.
 * @returns {{ tpl:object|null, index:number, reason:null|'noHull'|'unsaved'|'modified' }}
 */
export function buildTarget({ hullId, slotAssignments, editingId, templates }) {
  if (!hullId) return { tpl: null, index: -1, reason: 'noHull' };
  const list = Array.isArray(templates) ? templates : [];
  const index = editingId ? list.findIndex((tp) => tp?.id === editingId) : -1;
  if (index < 0) return { tpl: null, index: -1, reason: 'unsaved' };
  const tpl = list[index];
  const a = fittedModules(slotAssignments), b = fittedModules(tpl.modules);
  const same = tpl.hullId === hullId && a.length === b.length && a.every((m, i) => m === b[i]);
  return same ? { tpl, index, reason: null } : { tpl: null, index, reason: 'modified' };
}

/** Wiersze wyboru kadłuba: układ slotów, masa, blokady widoczne (tech 🔒, tylko stocznia orbitalna 🛰) — wybór i tak wolny. */
export function hullPickerRows({ hulls, getSlotCounts, canBuildHullAt, techResearched }) {
  return Object.values(hulls ?? {}).map((h) => ({
    id: h.id, icon: h.icon, mass: h.baseMass, slots: slotLayoutLabel(getSlotCounts(h.id)),
    orbitalOnly: !canBuildHullAt(h.id, 'ground'),
    techLocked: !!h.requires && !techResearched?.(h.requires), techId: h.requires ?? null,
  }));
}

/** Zbiór typów stref trafień (inwentarz akcji ON vs OFF w keeperze). */
export function hitTypes(zones) {
  return new Set((zones ?? []).map((z) => z?.type).filter(Boolean));
}

/** Format liczby delty ze znakiem («+12», «−0.3»); `digits` miejsc po przecinku; 0 → ''. */
export function fmtDelta(v, digits = 0) {
  if (!Number.isFinite(v) || Math.abs(v) < 0.5 * 10 ** -digits) return '';
  const s = Math.abs(v).toFixed(digits);
  return (v > 0 ? '+' : '−') + s;
}
