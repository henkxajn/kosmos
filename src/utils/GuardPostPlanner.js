// AI STRIKES BACK S2 (SB30–SB33) — STANOWISKA STRAŻNIKÓW imperium AI: czyste funkcje + odczyt żywego świata.
//
// Odpowiada na pytania „który kadłub może być strażnikiem”, „ilu strażników na ciało” i „które ciała są strzeżone”.
// NICZEGO nie tworzy i nie wydaje rozkazów — wykonuje `FleetPoolSystem` (stanowiska przy mobilizacji, co miesiąc, co rok),
// a roster trzyma `DirectorDoctrine` (`director.doctrine.<id>.guard`, SB31).
//
//   strażnik (SB30): kadłub imperium, nie wrak, UZBROJONY, W SŁUŻBIE, BEZ baku warp (dziś `frigate_system_defender`);
//                    stoi NA ORBICIE strzeżonego ciała (`position.state === 'orbiting'`, `dockedAt === ciało`)
//   ilu (SB30):      `fleetGuardsPerBody` z tabeli strojenia (domyślnie 1) — czyta go pula (`FleetLimit.fleetGuardsPerBody`,
//                    odczyt W CHWILI UŻYCIA) i podaje tu argumentem: tabelę strojenia czytają wyłącznie konsola i pula
//   gdzie (SB32):    stolica (`capitalOf` z terminem właściciela — ten sam odczyt co garnizon i pula)
//
// ⚠ Dominacja orbitalna zostaje per UKŁAD (SB34): strażnik na orbicie odbiera graczowi dominację w całym układzie, bo jest
//   „walczący w przestrzeni” (`isFightableInSpace`) — ta sama reguła co każdy inny uzbrojony kadłub.
// ⚠ Moduł NIE zna `window`: czytnik żywego świata dostaje obiekt usług (`K`, w grze `window.KOSMOS`) jako argument.

import { isEnemyVessel, hasWeapons, isInService } from '../entities/Vessel.js';
import { readEmpireGarrisonSnapshot } from './GarrisonPlanner.js';

/**
 * SB30 — czy kadłub może być strażnikiem imperium: jego, nie wrak, uzbrojony (`hasWeapons`), w służbie (`isInService`),
 * bez baku warp (`warpFuel.max > 0` — D4: własność, nigdy id szablonu). Nie mówi nic o położeniu.
 * @param {object} v
 * @param {string} empireId
 */
export function isGuardHull(v, empireId) {
  if (!v || v.isWreck || !empireId) return false;
  if (!isEnemyVessel(v)) return false;
  if ((v.ownerEmpireId ?? v.owner) !== empireId) return false;
  if (!hasWeapons(v)) return false;
  if (!isInService(v)) return false;
  return !((v.warpFuel?.max ?? 0) > 0);
}

/** Czy kadłub stoi na stanowisku: orbita strzeżonego ciała. */
export function isAtGuardPost(v, bodyId) {
  return !!bodyId && v?.position?.state === 'orbiting' && v?.position?.dockedAt === bodyId;
}

/** SB30 — strażników na jedno strzeżone ciało: liczba całkowita ≥ 0 (wartość z tabeli strojenia podaje wołający). */
export function guardsPerBody(n) {
  return Math.max(0, Math.floor(Number(n) || 0));
}

/**
 * Strzeżone ciała imperium TERAZ (tylko odczyt). SB32: stolica.
 * @param {object} K — usługi gry
 * @param {string} empireId
 * @param {number} perBody — `fleetGuardsPerBody` (podaje pula)
 * @returns {{capitalId:string|null, perBody:number, bodies:Array<{bodyId:string, role:'capital'}>}}
 */
export function readGuardPosts(K, empireId, perBody) {
  const capitalId = readEmpireGarrisonSnapshot(K, empireId).capitalId ?? null;
  const bodies = capitalId ? [{ bodyId: capitalId, role: 'capital' }] : [];
  return { capitalId, perBody: guardsPerBody(perBody), bodies };
}
