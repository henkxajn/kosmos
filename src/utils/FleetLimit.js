// AI STRIKES BACK (SB3, SB14) — LIMIT FLOTY imperium AI: czyste funkcje nad tabelą strojenia + odczyt żywego świata.
//
// Odpowiada na pytanie „ile uzbrojonych kadłubów może mieć imperium i ile ma” oraz „co pula dołożyłaby teraz”
// (`readEmpirePoolPlan`, plan z `FleetPoolPlanner`). Konsumenci: pula okrętów (`FleetPoolSystem`, S1 sesja 2) i odczyt
// konsoli (`KOSMOS.debug.sbTuning()`).
//
//   limit = floor( max(fleetMinHulls, floor(POP / fleetPopPerHull)) × fleetRungMult[szczebel] )
//
// ⚠ TO SAMO źródło POP, TEN SAM szczebel i TO SAMO zaokrąglenie co limit garnizonu (`GarrisonPlanner`):
//   • POP i suma poziomów fabryk — `readEmpireGarrisonSnapshot` (kolonie z `ownerEmpireId === imperium`; POP = suma
//     floor(populacji) PEŁNYCH kolonii; fabryki — wszystkie jego kolonie);
//   • szczebel — `garrisonTier` (progi sumy poziomów fabryk z `GARRISON_LADDER`);
//   • zaokrąglenie — floor PO klamrze minimum, potem floor iloczynu z mnożnikiem (jak `garrisonBaseLimit` +
//     `garrisonLimit`). Zgodność pinuje WYKONANIEM keeper `sb1_fleet_tuning_smoke` (parametry garnizonu ⇒ ta sama
//     liczba co `garrisonLimit` dla siatki POP × fabryk).
// ⚠ Liczby wyłącznie z tabeli (`readTuningValues` — odczyt W CHWILI UŻYCIA, bez bufora).
// ⚠ Kadłub liczony do limitu — wyłącznie `isFleetLimitHull` (`Vessel.js`): uzbrojony, nie wrak, tego imperium —
//   w służbie, w rezerwie i w mobilizacji, w doku i w przestrzeni.

import { readTuningValues } from './StrikesBackTuning.js';
import { garrisonTier, readEmpireGarrisonSnapshot } from './GarrisonPlanner.js';
import { isFleetLimitHull } from '../entities/Vessel.js';
import { templateTraits, planPool, describePoolAdd } from './FleetPoolPlanner.js';

/** Liczba skończona i dodatnia, inaczej 0 (lustro `GarrisonPlanner`). */
const nonNegative = (x) => (Number.isFinite(x) && x > 0 ? x : 0);

/**
 * Limit bazowy z POP imperium: max(minimum, floor(floor(POP) / POP na kadłub)) — zaokrąglenie jak `garrisonBaseLimit`.
 * @param {number} pop
 * @param {{fleetMinHulls:number, fleetPopPerHull:number}} [tuning]
 */
export function fleetBaseLimit(pop, tuning = readTuningValues()) {
  return Math.max(tuning.fleetMinHulls, Math.floor(Math.floor(nonNegative(pop)) / tuning.fleetPopPerHull));
}

/** Mnożnik szczebla z tabeli (indeks = `garrisonTier(...).index`). Brak pozycji ⇒ 1. */
export function fleetRungMultiplier(rungIndex, tuning = readTuningValues()) {
  const m = tuning.fleetRungMult?.[rungIndex];
  return Number.isFinite(m) ? m : 1;
}

/**
 * Limit floty imperium: floor(limit bazowy × mnożnik szczebla) — zaokrąglenie jak `garrisonLimit`.
 * @param {{pop:number, factoryLevels:number}} empire
 * @param {object} [tuning]
 */
export function fleetLimit(empire, tuning = readTuningValues()) {
  return Math.floor(fleetBaseLimit(empire?.pop, tuning) * fleetRungMultiplier(garrisonTier(empire).index, tuning));
}

/** Uzbrojone kadłuby imperium liczone do limitu (lista; predykat `isFleetLimitHull` — ten sam co w migawce). */
export function empireFleetHulls(K, empireId) {
  return (K?.vesselManager?.getAllVessels?.() ?? []).filter((v) => isFleetLimitHull(v, empireId));
}

/**
 * Migawka imperium z żywego świata (tylko odczyt): POP, fabryki, szczebel, mnożnik, limit, uzbrojone kadłuby wg służby
 * i położenia, ile z nich ma bak warp (`warpFuel.max > 0` — D4), stolica (z terminem właściciela, jak w garnizonie)
 * i miejsce w limicie (limit − kadłuby, nie mniej niż 0). Miejsce dla PULI liczy `readEmpirePoolPlan` (SB21: minimum
 * kadłubów z bakiem także ponad limitem).
 * @param {object} K — usługi gry (w grze `window.KOSMOS`)
 * @param {string} empireId
 * @param {object} [tuning]
 */
export function readEmpireFleetSnapshot(K, empireId, tuning = readTuningValues()) {
  const snap = readEmpireGarrisonSnapshot(K, empireId);
  const tier = garrisonTier(snap);
  const mult = fleetRungMultiplier(tier.index, tuning);
  const limit = fleetLimit(snap, tuning);
  const hulls = empireFleetHulls(K, empireId);
  const service = { active: 0, stored: 0, mobilizing: 0 };
  const position = { docked: 0, inSpace: 0 };
  for (const v of hulls) {
    const svc = v.serviceState ?? 'active';
    service[svc] = (service[svc] ?? 0) + 1;
    if (v.position?.state === 'docked') position.docked++;
    else position.inSpace++;
  }
  return {
    empireId, pop: snap.pop, factoryLevels: snap.factoryLevels, rung: tier.index, mult, limit,
    armed: hulls.length, warp: hulls.filter((v) => (v.warpFuel?.max ?? 0) > 0).length,
    service, position, room: Math.max(0, limit - hulls.length), capitalId: snap.capitalId ?? null,
  };
}

/** SB15 — ile kadłubów puli imperium odrasta na granicy roku (z tabeli strojenia, odczyt W CHWILI UŻYCIA). */
export function fleetRegrowthPerYear(tuning = readTuningValues()) {
  return tuning.fleetRegrowthPerYear;
}

/**
 * Plan puli imperium TERAZ (SB14 zmienione przez SB21, SB20, SB22) — co pula dołożyłaby w tej chwili: limit i kadłuby
 * z migawki wyżej, wzorzec i minimum kadłubów z bakiem z tabeli strojenia (odczyt W CHWILI UŻYCIA), cechy szablonów
 * rozwiązanych „wszystko zbadane” z archetypem imperium. Tylko odczyt.
 * @returns {{room:number, slots:string[], uncovered:string[], add:string[], tankTemplate:string|null,
 *            missingWarpTemplate:number, empireId:string, capitalId:string|null, limit:number, armed:number,
 *            warp:number, archetype:string|null}}
 */
export function readEmpirePoolPlan(K, empireId, tuning = readTuningValues()) {
  const s = readEmpireFleetSnapshot(K, empireId, tuning);
  const archetype = K?.empireRegistry?.get?.(empireId)?.archetype ?? null;
  const plan = planPool({
    limit: s.limit, pattern: tuning.fleetPoolPattern, minWarp: tuning.fleetMinWarpHulls,
    warpHulls: s.warp, noWarpHulls: s.armed - s.warp, traitsOf: (id) => templateTraits(id, archetype),
  });
  return { ...plan, empireId, capitalId: s.capitalId, limit: s.limit, armed: s.armed, warp: s.warp, archetype };
}

/** Odczyt konsoli: wiersz na imperium. Zwraca wiersze. */
export function printFleetLimits(K, tuning = readTuningValues()) {
  const rows = (K?.empireRegistry?.listAll?.() ?? []).map((e) => {
    const s = readEmpireFleetSnapshot(K, e.id, tuning);
    return {
      imperium: s.empireId, pop: s.pop, fabryki: s.factoryLevels, szczebel: s.rung, mnoznik: s.mult, limit: s.limit,
      uzbrojone: s.armed, sluzba: s.service.active, rezerwa: s.service.stored, mobilizacja: s.service.mobilizing,
      dok: s.position.docked, przestrzen: s.position.inSpace, miejsce: s.room,
      zBakiem: s.warp, pula: K?.empireRegistry?.isFleetPoolMobilized?.(e.id) ? 'tak' : 'nie',
      pulaDoda: describePoolAdd(readEmpirePoolPlan(K, e.id, tuning).add),
    };
  });
  console.table(rows);
  return rows;
}
