// AI STRIKES BACK S1 (SB17, SB20, SB21, SB22) — PLAN PULI okrętów imperium AI: czyste funkcje.
//
// Odpowiada na pytanie „które kadłuby pula dołoży TERAZ”. Wejście: limit floty, wzorzec z tabeli strojenia, minimum
// kadłubów z bakiem warp i liczby istniejących uzbrojonych kadłubów z bakiem / bez baku. Zero stanu, zero `window`, zero
// losowania — ten sam stan daje ten sam plan.
//
//   ile:   room = max(limit − uzbrojone, minimum z bakiem − z bakiem, 0)                         (SB14 zmienione przez SB21)
//   które: wzorzec powtarzany do limitu = sloty (limit 6 → D, E, E, E, D, E); istniejące kadłuby pokrywają sloty SWOJEJ
//          klasy (z bakiem warp / bez baku), w kolejności slotów; niepokryte sloty dochodzą w kolejności wzorca (do
//          `room`); kadłuby dodawane WYŁĄCZNIE dla minimum z bakiem (gdy `room` > liczby niepokrytych slotów) to PIERWSZY
//          szablon z bakiem we wzorcu (SB20, SB21).
//
// ⚠ Klasa KADŁUBA = posiadanie baku warp (`warpFuel.max > 0` — D4: własność, nigdy id szablonu); klasa SLOTU = czy szablon
//   rozwiązany „wszystko zbadane” (SB22 — jak sonda pierwszego kontaktu, `DirectorFirstContact.js:113`) ma pojemność baku.
// ⚠ Uzbrojenie szablonu — ten sam test co `hasWeapons` (moduł `slotType 'weapon'`), na modułach rozwiązanych.
// ⚠ Wzorzec bez szablonu z bakiem przy minimum > 0: brakujących kadłubów z bakiem nie ma z czego dołożyć —
//   `missingWarpTemplate` mówi ile (odczyt konsoli i rekord mobilizacji), plan ich nie wymyśla.

import { resolveTemplate } from './ShipTemplateResolver.js';
import { SHIP_TEMPLATES } from '../data/ShipTemplateData.js';
import { HULLS } from '../data/HullsData.js';
import { SHIP_MODULES, calcShipStats } from '../data/ShipModulesData.js';

/** SB22 — „wszystko zbadane”. */
const ALL_RESEARCHED = () => true;

/**
 * Cechy szablonu rozwiązanego „wszystko zbadane”: czy znany i rozwiązywalny, czy uzbrojony, czy ma bak warp.
 * @param {string} templateId
 * @param {string|null} [archetype] — archetyp imperium (nadpisania szablonu per archetyp)
 * @returns {{known:boolean, ok:boolean, armed:boolean, warp:boolean, hullId:string|null, modules:string[], reason:string|null}}
 */
export function templateTraits(templateId, archetype = null) {
  const known = typeof templateId === 'string' && Object.prototype.hasOwnProperty.call(SHIP_TEMPLATES, templateId);
  if (!known) return { known: false, ok: false, armed: false, warp: false, hullId: null, modules: [], reason: 'unknown_template' };
  const r = resolveTemplate(templateId, { isResearched: ALL_RESEARCHED, archetype });
  if (!r?.ok) return { known: true, ok: false, armed: false, warp: false, hullId: null, modules: [], reason: r?.reason ?? 'resolve_failed' };
  const armed = r.modules.some((m) => SHIP_MODULES[m]?.slotType === 'weapon');
  const stats = calcShipStats(HULLS[r.hullId], r.modules);
  return { known: true, ok: true, armed, warp: (stats?.warpFuelCapacity ?? 0) > 0, hullId: r.hullId, modules: [...r.modules], reason: null };
}

/** Szablony, które może nieść wzorzec puli: znane i UZBROJONE (rozwiązane „wszystko zbadane”), w kolejności katalogu. */
export function armedTemplateIds() {
  return Object.keys(SHIP_TEMPLATES).filter((id) => templateTraits(id).armed);
}

/** Wzorzec powtarzany do limitu (lista id szablonów długości `limit`). */
export function poolSlots(limit, pattern) {
  const n = Math.max(0, Math.floor(Number(limit) || 0));
  if (!Array.isArray(pattern) || pattern.length === 0) return [];
  return Array.from({ length: n }, (_, i) => pattern[i % pattern.length]);
}

/**
 * Plan puli.
 * @param {{limit:number, pattern:string[], minWarp:number, warpHulls:number, noWarpHulls:number,
 *          traitsOf?:(id:string)=>{warp:boolean}}} p
 * @returns {{room:number, slots:string[], uncovered:string[], add:string[], tankTemplate:string|null, missingWarpTemplate:number}}
 */
export function planPool({ limit, pattern, minWarp, warpHulls, noWarpHulls, traitsOf = templateTraits }) {
  const w0 = Math.max(0, Math.floor(Number(warpHulls) || 0));
  const n0 = Math.max(0, Math.floor(Number(noWarpHulls) || 0));
  const lim = Math.max(0, Math.floor(Number(limit) || 0));
  const minW = Math.max(0, Math.floor(Number(minWarp) || 0));
  const room = Math.max(lim - (w0 + n0), minW - w0, 0);
  const slots = poolSlots(lim, pattern);
  let w = w0, n = n0;
  const uncovered = [];
  for (const id of slots) {
    if (traitsOf(id).warp) { if (w > 0) w--; else uncovered.push(id); }
    else { if (n > 0) n--; else uncovered.push(id); }
  }
  const add = uncovered.slice(0, room);
  const tankTemplate = (Array.isArray(pattern) ? pattern : []).find((id) => traitsOf(id).warp) ?? null;
  let missingWarpTemplate = 0;
  if (add.length < room) {
    if (tankTemplate) while (add.length < room) add.push(tankTemplate);
    else missingWarpTemplate = room - add.length;
  }
  return { room, slots, uncovered, add, tankTemplate, missingWarpTemplate };
}

/** Odczyt konsoli: „co pula dołoży” w zwięzłej postaci (`frigate_system_defender x1, frigate_missile_escort x3`). */
export function describePoolAdd(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return '-';
  const order = [];
  const n = new Map();
  for (const id of ids) { if (!n.has(id)) order.push(id); n.set(id, (n.get(id) ?? 0) + 1); }
  return order.map((id) => `${id} x${n.get(id)}`).join(', ');
}
