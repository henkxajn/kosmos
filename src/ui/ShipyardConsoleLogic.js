// ShipyardConsoleLogic — czysta logika konsoli Stoczni (ARC KONSOLE, krok K1c-A; CONSOLES_PLAN.md §1.2 «Shipyard», §2 B5).
// Zero DOM / Canvas — keeper `console_shipyard_smoke`. Rysunek: `ShipyardOverlay._drawConsole` (flaga `FEATURES.consoleShipyard`).
//
// • Podgląd zmiany (delta) przy najechaniu modułu w pickerze = staty(z modułem) − staty(bez niego) przez `calcShipStats` /
//   `calcShipCost`; «bez» = bieżący projekt z pustym aktywnym slotem, «z» = ten sam projekt z modułem w aktywnym slocie.
//   Broń i tarcze NIE są agregowane poza BattleSystem → pokazujemy surowe `damage` / `shieldHP` modułu (bez zmian mechaniki).
// • Stan budowy szablonu — lustro dzisiejszej reguły `ShipyardOverlay._drawShipyard` (tech kadłuba → stocznia orbitalna →
//   slot), z `canBuildHullAt(hullId, 'ground')` (kolonia = stocznia naziemna). Keeper porównuje go z wykonaniem ścieżki OFF.
// • Etykiety ról na kotwicach: `groupModulesByRole` (K1b) → jedna etykieta na niepustą rolę, moduły zliczone «Laser ×6».

import { groupModulesByRole } from '../renderer/ShipAnchors.js';

// Kategorie modułów (slotType) — ikona każdej z 10 grup pickera. Finding 726: `shield` i `troop` nie miały ikony ani etykiety
// (picker rysował surowy slotType). Etykieta: klucz i18n `unitDesign.cat.<slotType>` (PL/EN).
export const MODULE_CATEGORY_ICONS = Object.freeze({
  propulsion: '🔥', cargo: '📦', science: '🔬', special: '🤖', habitat: '🏠',
  armor: '🛡', fuel: '⛽', weapon: '🔫', shield: '🔰', troop: '🪖',
});
export const MODULE_CATEGORIES = Object.freeze(Object.keys(MODULE_CATEGORY_ICONS));
export const categoryLabelKey = (cat) => `unitDesign.cat.${cat}`;

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
 * Stan budowy szablonu — lustro `ShipyardOverlay._drawShipyard` (W2-4: bez warunku załogi).
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
