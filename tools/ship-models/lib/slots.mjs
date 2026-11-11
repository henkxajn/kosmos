// slots — nazwy slotów modeli statków (ARC COMBAT VISUALS, krok CV-1b). Jedno źródło listy: `VESSEL_MODEL_KEYS` resolvera gry
// (24 sloty) + `default` (zapas). Pliki `cargo3d` i `research1` leżą w folderze, ale żaden kod gry ich nie czyta (#623) —
// nie są slotami, do których normalizator wstawia nowy model.

import { VESSEL_MODEL_KEYS } from '../../../src/renderer/VesselModelResolver.js';

export const SHIP_SLOTS = Object.freeze([...VESSEL_MODEL_KEYS, 'default']);
export const isShipSlot = (s) => SHIP_SLOTS.includes(s);

/**
 * Slot z nazwy pliku: `warp_frigate.glb`, `Warp_Frigate (1).glb` (kopia z Pobranych), `warp-frigate.GLB` → 'warp_frigate';
 * nazwa spoza listy slotów → null (CLI zapyta o slot).
 * @param {string} fileName
 * @returns {string|null}
 */
export function slotFromFileName(fileName) {
  if (typeof fileName !== 'string') return null;
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.glb$/i, '');
  const s = base.toLowerCase().replace(/\s*\(\d+\)\s*$/, '').trim().replace(/[\s-]+/g, '_');
  return isShipSlot(s) ? s : null;
}

/** Podpowiedź dla nazwy spoza listy: sloty, które ją zawierają (np. „frigate" → nonwarp_frigate, warp_frigate). */
export function suggestSlots(text) {
  const t = String(text ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  if (!t) return [];
  const words = t.split('_').filter((w) => w.length >= 3);
  return SHIP_SLOTS.filter((s) => words.some((w) => s.includes(w)));
}
