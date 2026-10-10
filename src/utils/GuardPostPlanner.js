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
//   gdzie (SB32):    stolica (`capitalOf` z terminem właściciela — ten sam odczyt co garnizon i pula), potem DRUGIE ciało —
//                    najcenniejsze ciało imperium W UKŁADZIE STOLICY poza stolicą, w porządku planera garnizonu (D11:
//                    pełne kolonie przed placówkami ze złożem Xe / Nt, `devScore` malejąco, kolejność w imperium); ciało
//                    raz obsadzone (wpis w rosterze) zostaje drugim, dopóki jest kandydatem w układzie stolicy
//
//   odczyt (B5):     `readGuardPostsView` / `describeGuardPosts` — strzeżone ciała i kto trzyma każde stanowisko
//                    (konsola `KOSMOS.debug.sbTuning()`, bramka `KOSMOS.fleetPoolSystem.guardPosts(id)`)
//
// ⚠ Dominacja orbitalna zostaje per UKŁAD (SB34): strażnik na orbicie odbiera graczowi dominację w całym układzie, bo jest
//   „walczący w przestrzeni” (`isFightableInSpace`) — ta sama reguła co każdy inny uzbrojony kadłub.
// ⚠ Moduł NIE zna `window`: czytnik żywego świata dostaje obiekt usług (`K`, w grze `window.KOSMOS`) jako argument.

import { isEnemyVessel, hasWeapons, isInService } from '../entities/Vessel.js';
import { readEmpireGarrisonSnapshot, garrisonAllocation } from './GarrisonPlanner.js';

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
 * SB32 — drugie strzeżone ciało z migawki imperium (`readEmpireGarrisonSnapshot`): kandydaci planera garnizonu
 * (`garrisonAllocation` — wybrani, potem pominięci: pełna kolejność D11) leżący w układzie stolicy; ciało już obsadzone
 * (wpis w rosterze, nie stolica) ma pierwszeństwo, dopóki jest wśród nich. Brak — `null`.
 * @param {object} snapshot — `readEmpireGarrisonSnapshot`
 * @param {(id:string) => string|null} systemOf — układ ciała
 * @param {Array<{bodyId:string}>} [roster] — roster strażników
 * @returns {string|null}
 */
export function secondGuardBodyId(snapshot, systemOf, roster = []) {
  const capitalId = snapshot?.capitalId ?? null;
  const capSys = capitalId ? systemOf(capitalId) : null;
  if (!capitalId || !capSys) return null;
  const alloc = garrisonAllocation(snapshot);
  const order = [...alloc.perBody.filter((b) => b.planetId !== capitalId).map((b) => b.planetId), ...alloc.skipped];
  const inSystem = order.filter((id) => systemOf(id) === capSys);
  const held = (roster ?? []).map((e) => e?.bodyId).find((id) => id && id !== capitalId && inSystem.includes(id));
  return held ?? inSystem[0] ?? null;
}

/**
 * Strzeżone ciała imperium TERAZ (tylko odczyt). SB32: stolica, potem drugie ciało (`secondGuardBodyId`).
 * @param {object} K — usługi gry
 * @param {string} empireId
 * @param {number} n — `fleetGuardsPerBody` (podaje pula)
 * @param {Array<{bodyId:string}>} [roster] — roster strażników (stabilność drugiego ciała)
 * @returns {{capitalId:string|null, secondId:string|null, perBody:number,
 *            bodies:Array<{bodyId:string, role:'capital'|'second'}>}}
 */
/**
 * B5 — stanowiska imperium do odczytu: dla każdego strzeżonego ciała wpisy rosteru i stanowiska nigdy nieobsadzone.
 * Imperium bez puli (bez mobilizacji) — pusta lista: przed mobilizacją nic nie stoi.
 *   status: `orbita` (na stanowisku) · `lot` (rozkaz w toku) · `poza` (żywy, gdzie indziej) · `utracony` (czeka na granicę
 *   roku) · `wolne` (nigdy nieobsadzone)
 * @returns {Array<{bodyId:string, role:'capital'|'second', vesselId:string|null, status:string}>}
 */
export function readGuardPostsView(K, empireId, n) {
  if (K?.empireRegistry?.isFleetPoolMobilized?.(empireId) !== true) return [];
  const roster = K?.directorDoctrine?.guardRoster?.(empireId) ?? [];
  const posts = readGuardPosts(K, empireId, n, roster);
  const out = [];
  for (const { bodyId, role } of posts.bodies) {
    const mine = roster.filter((e) => e.bodyId === bodyId);
    for (const e of mine) {
      const v = e.vesselId ? K?.vesselManager?.getVessel?.(e.vesselId) ?? null : null;
      const status = !e.vesselId ? 'utracony' : isAtGuardPost(v, bodyId) ? 'orbita' : v?.movementOrder ? 'lot' : 'poza';
      out.push({ bodyId, role, vesselId: e.vesselId ?? null, status });
    }
    for (let k = mine.length; k < posts.perBody; k++) out.push({ bodyId, role, vesselId: null, status: 'wolne' });
  }
  return out;
}

/** B5 — jedna linia odczytu stanowisk (napisy bez polskich znaków — konwencja konsoli): `cialo(rola)=kadlub stan, …`; brak — `-`. */
export function describeGuardPosts(K, empireId, n) {
  const view = readGuardPostsView(K, empireId, n);
  if (view.length === 0) return '-';
  return view.map((p) => `${p.bodyId}(${p.role === 'capital' ? 'stolica' : 'drugie'})=${p.vesselId ?? '-'} ${p.status}`).join(', ');
}

export function readGuardPosts(K, empireId, n, roster = []) {
  const snap = readEmpireGarrisonSnapshot(K, empireId);
  const capitalId = snap.capitalId ?? null;
  const perBody = guardsPerBody(n);
  if (!capitalId) return { capitalId: null, secondId: null, perBody, bodies: [] };
  const secondId = secondGuardBodyId(snap, (id) => K?.entityManager?.get?.(id)?.systemId ?? null, roster);
  const bodies = [{ bodyId: capitalId, role: 'capital' }];
  if (secondId) bodies.push({ bodyId: secondId, role: 'second' });
  return { capitalId, secondId, perBody, bodies };
}
