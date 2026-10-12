// AI STRIKES BACK S3 (SB51, SB52, SB53) — PLANER FALI DESANTU ESKADRY: czyste funkcje + czytnik żywego świata.
//
// Odpowiada na pytanie „ILE jednostek i JAKICH poleci w ładowni transportowca, z jakim morale”. NICZEGO nie tworzy —
// tworzenie (transportowiec, jednostki, załadunek, rozkaz grupy) to `StrikeSquadronSystem.launchSquadron`.
//
// Reguły (podpis 2026-10-11):
//   SB53 — wielkość fali = floor(limit garnizonu imperium × `strikeWaveShare`), obcięta do ładowni transportowca;
//   SB52 — skład i morale ze szczebla drabiny imperium (`invasionComposition`, `garrisonTier` — ta sama reguła co desant
//          z `launchInvasion`, G2b); jednostki NOWE, tworzone przy stolicy, nie brane z garnizonu;
//   SB51 — transportowiec = szablon `transport_assault`, rozwiązany „wszystko zbadane” (jak kadłuby puli).
// ⚠ KLAMRA ŁADOWNI: skład jest prefiksowy (co `artilleryEvery`-ta jednostka to artyleria), więc obcięcie bierze NAJDŁUŻSZY
//   prefiks składu, który mieści się w ładowni (w jednostkach `transportSize`) — wynik nigdy nie przekracza ładowni.
// ⚠ PLANER NIE ZNA `window`: czytnik dostaje obiekt usług (`K`) jako argument (wzór `GarrisonPlanner`).
// ⚠ Napisy konsoli bez polskich znaków (konwencja odczytu `printFleetLimits`).

import { garrisonLimit, garrisonTier, readEmpireGarrisonSnapshot, invasionComposition } from './GarrisonPlanner.js';
import { getTransportSize } from '../data/unitArchetypes.js';
import { resolveTemplate } from './ShipTemplateResolver.js';
import { HULLS } from '../data/HullsData.js';
import { calcShipStats } from '../data/ShipModulesData.js';
import { getTuning } from './StrikesBackTuning.js';

/** SB51 — szablon transportowca eskadry. */
export const STRIKE_TRANSPORT_TEMPLATE = 'transport_assault';

const nonNegative = (x) => (Number.isFinite(x) && x > 0 ? x : 0);

/** SB53 — wielkość fali przed klamrą ładowni: floor(limit × udział), ≥ 0. */
export function waveSize(limit, share) {
  return Math.floor(nonNegative(limit) * nonNegative(share) + 1e-9);
}

/** Rozmiar składu w jednostkach ładowni (`transportSize`). */
export function waveCargoSize(composition) {
  return (composition ?? []).reduce((s, a) => s + getTransportSize(a), 0);
}

/** Najdłuższy prefiks składu, który mieści się w ładowni `capacity`. */
export function capToCapacity(composition, capacity) {
  const cap = nonNegative(capacity);
  const out = [];
  let used = 0;
  for (const a of composition ?? []) {
    const s = getTransportSize(a);
    if (used + s > cap) break;
    out.push(a);
    used += s;
  }
  return out;
}

/**
 * Plan fali z wejść liczbowych.
 * @param {{limit:number, share:number, tier:{artilleryEvery:number, morale:number, index:number}, capacity:number}} p
 * @returns {{wanted:number, composition:string[], count:number, size:number, capacity:number, morale:number,
 *            rung:number, cappedByCapacity:boolean}}
 */
export function planWave({ limit, share, tier, capacity }) {
  const wanted = waveSize(limit, share);
  const full = invasionComposition(wanted, tier);
  const composition = capToCapacity(full, capacity);
  // ⚠ Morale WYŁĄCZNIE ze szczebla (`garrisonTier`) — bez „?? liczba” (pin `ground_morale_resolution` T7, G1 D5b).
  return {
    wanted, composition, count: composition.length, size: waveCargoSize(composition), capacity: nonNegative(capacity),
    morale: tier.morale, rung: tier.index, cappedByCapacity: composition.length < full.length,
  };
}

/** Ładownia transportowca eskadry (szablon rozwiązany „wszystko zbadane”, archetyp imperium). 0 — szablon nie wchodzi. */
export function transportCapacity(archetype = null) {
  const r = resolveTemplate(STRIKE_TRANSPORT_TEMPLATE, { isResearched: () => true, archetype });
  if (!r?.ok) return 0;
  return nonNegative(calcShipStats(HULLS[r.hullId], r.modules)?.troopCapacity);
}

/**
 * Plan fali imperium TERAZ (tylko odczyt): limit i szczebel garnizonu z migawki imperium, udział z tabeli strojenia
 * (odczyt w chwili użycia), ładownia — `opts.capacity` (kadłub, który poleci) albo szablon transportowca.
 * @returns {ReturnType<typeof planWave> & {empireId:string, limit:number, share:number, capitalId:string|null}}
 */
export function readEmpireWavePlan(K, empireId, opts = {}) {
  const snap = readEmpireGarrisonSnapshot(K, empireId);
  const tier = garrisonTier(snap);
  const limit = garrisonLimit(snap);
  const share = getTuning('strikeWaveShare');
  const archetype = K?.empireRegistry?.get?.(empireId)?.archetype ?? null;
  const capacity = Number.isFinite(opts.capacity) ? opts.capacity : transportCapacity(archetype);
  return { ...planWave({ limit, share, tier, capacity }), empireId, limit, share, capitalId: snap.capitalId };
}

/** Skrót składu do odczytu: `shock_infantry x4, rocket_artillery x2`. */
export function describeWave(composition) {
  const counts = new Map();
  for (const a of composition ?? []) counts.set(a, (counts.get(a) ?? 0) + 1);
  return [...counts].map(([a, n]) => `${a} x${n}`).join(', ') || '-';
}

/** Odczyt konsoli (`KOSMOS.debug.sbTuning()`): fala, którą każde imperium wysłałoby teraz. Zwraca wiersze. */
export function printStrikeWaves(K) {
  const rows = (K?.empireRegistry?.listAll?.() ?? []).map((e) => {
    const p = readEmpireWavePlan(K, e.id);
    return {
      imperium: e.id, limitGarnizonu: p.limit, udzial: p.share, fala: p.count, chciana: p.wanted,
      sklad: describeWave(p.composition), morale: p.morale, ladownia: `${p.size}/${p.capacity}`,
      stolica: p.capitalId ?? '-',
    };
  });
  console.table(rows);
  return rows;
}
