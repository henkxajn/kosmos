// BodyName — wspólne rozwiązywanie nazwy ciała/kolonii po id (UI). Wzór FleetManagerOverlay._resolveName.
// Ciała mają `.name` (nazwa generowana, nie i18n: „Kepler-442b"). Fallback: kolonia → id.

import EntityManager from '../core/EntityManager.js';
import { hasSpaceportAt } from './SpaceportCheck.js';

/**
 * Nazwa wyświetlana ciała/kolonii po id (np. dla `vessel.position.dockedAt`).
 * @param {string|null|undefined} id
 * @returns {string} nazwa lub '' gdy brak id
 */
export function resolveBodyName(id) {
  if (!id) return '';
  const body = EntityManager.get(id);
  if (body?.name) return body.name;
  const colony = window.KOSMOS?.colonyManager?.getColony?.(id);
  if (colony?.name) return colony.name;
  return id;
}

/**
 * Bieżąca pozycja ciała (gameplay px) po id — dla rozkazów celujących w ciało (np. Dock).
 * @param {string|null|undefined} id
 * @returns {{x:number,y:number}|null}
 */
export function resolveBodyPos(id) {
  if (!id) return null;
  const body = EntityManager.get(id);
  if (!body) return null;
  // Stacja orbitalna ma STATYCZNE x/y (anchored GEO) — celuj BIEŻĄCĄ pozycję ciała kotwiczącego
  // (porusza się po orbicie), inaczej lot szedłby do pozycji z chwili utworzenia stacji.
  if (body.type === 'station' && body.bodyId) {
    const anchor = EntityManager.get(body.bodyId);
    if (anchor && typeof anchor.x === 'number') return { x: anchor.x, y: anchor.y };
  }
  if (typeof body.x === 'number' && typeof body.y === 'number') return { x: body.x, y: body.y };
  return null;
}

/**
 * Cele dokowania gracza: WSZYSTKIE kolonie gracza + orbitalne stacje gracza. Kolonie z portem
 * oznaczone ⚓ (stacje 🛰). UWAGA: małe kadłuby (size='small') dokują BEZ portu, więc kolonie bez
 * portu też są celem (per-vessel `dockAtColony` decyduje: mały→hangar, duży→orbita gdy brak portu).
 * Stacja = port uniwersalny (każdy kadłub dokuje).
 * @returns {Array<{id:string, name:string, kind:'planet'|'station', hasPort:boolean}>}
 */
export function getDockTargets() {
  const out = [];
  const cm = window.KOSMOS?.colonyManager;
  for (const c of (cm?.getPlayerColonies?.() ?? [])) {
    const id = c.planetId ?? c.planet?.id;
    if (!id) continue;
    const port = hasSpaceportAt(id);
    out.push({ id, name: `${port ? '⚓ ' : ''}${resolveBodyName(id)}`, kind: 'planet', hasPort: port });
  }
  for (const s of (EntityManager.getByType?.('station') ?? [])) {
    if (s?.id && (!s.ownerEmpireId || s.ownerEmpireId === 'player')) {
      out.push({ id: s.id, name: `🛰 ${s.name ?? resolveBodyName(s.id)}`, kind: 'station', hasPort: true });
    }
  }
  return out;
}
